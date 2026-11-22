// Striker FC — rules/FoulAndCardEngine.ts (Phase 05, Spec 06 §3)
// Tackle evaluation (ball-first vs legs-first), behind-the-player severity,
// DOGSO straight reds, the yellow/red card book with send-offs, penalty-box
// foul detection, and the 3.5-second Advantage Rule with pull-back.

import { PITCH } from '../core/constants';
import { clamp } from '../core/math';
import type { TeamSide } from '../core/types';

export type CardKind = 'NONE' | 'YELLOW' | 'RED';

export interface TackleEvalInput {
  /** True when the tackler won the ball within 0.12s before body contact. */
  touchedBallFirst: boolean;
  /** Combined closing speed of tackler + victim (m/s). */
  closingSpeed: number;
  /** dot(tackleDir, victimFacing): > 0.45 means the challenge came from behind. */
  behindDot: number;
  isSlide: boolean;
  /** Manager aggression slider multiplier (0.8 / 1 / 1.25). */
  aggressionMult: number;
  /** Denial of an obvious goal-scoring opportunity (last man, clear path). */
  isDogso: boolean;
  /** Epic P0-7: the foul happened inside the tackler's own penalty box. */
  inPenaltyBox?: boolean;
}

export interface TackleVerdict {
  isFoul: boolean;
  /** 0..1 — drives the card thresholds. */
  severity: number;
  card: CardKind;
  reason: string;
}

/**
 * Spec 06 §3 evaluation:
 * - clean ball-first contact is never a foul;
 * - severity grows with closing speed, +0.35 when the challenge is from
 *   behind (dot > 0.45), plus a slide-tackle premium;
 * - severity > 0.78 or DOGSO → straight red; severity > 0.48 → yellow.
 */
export function evaluateTackle(input: TackleEvalInput): TackleVerdict {
  // Epic P0-7: a clean ball-first tackle is NEVER a foul — unconditionally,
  // even as the last man (the old `&& !isDogso` gate sent off players for
  // perfect challenges).
  if (input.touchedBallFirst) {
    return { isFoul: false, severity: 0, card: 'NONE', reason: 'Clean — ball first.' };
  }
  let severity = clamp(input.closingSpeed / 15, 0, 0.72);
  if (input.behindDot > 0.45) severity += 0.35;
  if (input.isSlide) severity += 0.1;
  severity = clamp(severity * (0.9 + 0.1 * input.aggressionMult), 0, 1);
  if (input.isDogso) {
    // IFAB: a DOGSO foul inside the box for a genuine attempt at the ball
    // is a yellow + penalty, not a red. A pull / push / challenge from
    // behind with no attempt stays red everywhere.
    if (input.inPenaltyBox && input.behindDot <= 0.45) {
      return {
        isFoul: true,
        severity: Math.max(severity, 0.6),
        card: 'YELLOW',
        reason: 'DOGSO in the box — genuine attempt at the ball: yellow card + penalty.',
      };
    }
    return {
      isFoul: true,
      severity: Math.max(severity, 0.85),
      card: 'RED',
      reason: 'DOGSO — denial of an obvious goal-scoring opportunity.',
    };
  }
  if (severity > 0.78) {
    return { isFoul: true, severity, card: 'RED', reason: 'Reckless challenge — straight red.' };
  }
  if (severity > 0.48) {
    return { isFoul: true, severity, card: 'YELLOW', reason: 'Careless challenge — yellow card.' };
  }
  return { isFoul: true, severity, card: 'NONE', reason: 'Foul — free kick, no card.' };
}

/** Is this foul position inside the fouling team's own penalty box? */
export function isInPenaltyBox(pos: { x: number; z: number }, defendingSide: TeamSide): boolean {
  const goalX = defendingSide === 'HOME' ? -PITCH.HALF_LENGTH : PITCH.HALF_LENGTH;
  return Math.abs(pos.x - goalX) <= PITCH.PENALTY_AREA_LENGTH
    && Math.abs(pos.z) <= PITCH.PENALTY_AREA_HALF_WIDTH;
}

// ---------------------------------------------------------------------------
// Card book — yellows, second-yellow reds, send-offs (team plays with 10).
// ---------------------------------------------------------------------------

export interface CardEvent {
  global: number;
  side: TeamSide;
  card: CardKind;
  sentOff: boolean;
  reason: string;
}

export class CardBook {
  private readonly yellows = new Map<number, number>();
  private readonly sentOffSet = new Set<number>();
  readonly events: CardEvent[] = [];

  /** Record a card. A second yellow becomes a red and a send-off. */
  record(global: number, side: TeamSide, card: CardKind, reason: string): CardEvent | null {
    if (card === 'NONE') return null;
    let effective: CardKind = card;
    let sentOff = false;
    if (card === 'YELLOW') {
      const count = (this.yellows.get(global) ?? 0) + 1;
      this.yellows.set(global, count);
      if (count >= 2) {
        effective = 'RED';
        sentOff = true;
        reason = 'Second yellow card — sent off.';
      }
    } else {
      sentOff = true;
    }
    if (sentOff) this.sentOffSet.add(global);
    const ev: CardEvent = { global, side, card: effective, sentOff, reason };
    this.events.push(ev);
    return ev;
  }

  isSentOff(global: number): boolean {
    return this.sentOffSet.has(global);
  }

  yellowCount(global: number): number {
    return this.yellows.get(global) ?? 0;
  }

  counts(side: TeamSide): { yellows: number; reds: number } {
    let yellows = 0;
    let reds = 0;
    for (const e of this.events) {
      if (e.side !== side) continue;
      if (e.card === 'RED') reds += 1;
      else yellows += 1;
    }
    return { yellows, reds };
  }

  reset(): void {
    this.yellows.clear();
    this.sentOffSet.clear();
    this.events.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Advantage Rule — 3.5s window; pull play back if possession is lost.
// ---------------------------------------------------------------------------

export interface AdvantageFoul {
  foulerGlobal: number;
  victimGlobal: number;
  victimSide: TeamSide;
  pos: { x: number; z: number };
  card: CardKind;
  cardReason: string;
}

export type AdvantageOutcome = 'PLAYING_ON' | 'BENEFIT_KEPT' | 'PULL_BACK';

export class AdvantageTracker {
  private active: AdvantageFoul | null = null;
  private expiresAtSec = 0;
  static readonly WINDOW_SEC = 3.5;

  start(foul: AdvantageFoul, nowSec: number): void {
    this.active = foul;
    this.expiresAtSec = nowSec + AdvantageTracker.WINDOW_SEC;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  get current(): AdvantageFoul | null {
    return this.active;
  }

  remainingSec(nowSec: number): number {
    if (!this.active) return 0;
    return Math.max(0, this.expiresAtSec - nowSec);
  }

  /**
   * Feed the current possessing side each tick. Returns PULL_BACK exactly
   * once if the benefiting team loses possession inside the window, and
   * BENEFIT_KEPT once when the window expires with possession retained.
   */
  update(possessingSide: TeamSide | null, nowSec: number): AdvantageOutcome {
    if (!this.active) return 'PLAYING_ON';
    if (possessingSide !== null && possessingSide !== this.active.victimSide) {
      this.active = null;
      return 'PULL_BACK';
    }
    if (nowSec >= this.expiresAtSec) {
      this.active = null;
      return 'BENEFIT_KEPT';
    }
    return 'PLAYING_ON';
  }

  cancel(): void {
    this.active = null;
  }
}
