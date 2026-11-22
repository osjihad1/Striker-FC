// Striker FC — modes/AttackMode.ts
// Attack Mode: you only attack. Eight set-piece-style scenarios in the real
// 3D engine — you start on the ball near the opponent's box with a set
// number of attackers against a set number of defenders, and each chance
// lives until it resolves (goal, save, clearance, out of bounds, or the
// 14-second cap). Goals pay 100 points; finesse / power / chip finishes
// and long-range strikes pay a +25 style bonus each. The defending gets
// harder every round: more defenders, deeper starts, smarter AI tiers.

import { matchEventBus } from '../core/EventBus';
import { InputManager } from '../controls/InputManager';
import { ScrimmageEngine, type SimEvent } from '../ai/ScrimmageEngine';
import type { Difficulty } from '../core/types';
import type { ModeRewardGrant } from './ModeRewards';

export const ATTACK_ROUNDS = 8;
export const ATTACK_CHANCE_SECONDS = 14;
const CUT_SECONDS = 0.7;

export type AttackOutcome = 'GOAL' | 'SAVED' | 'CLEARED' | 'OUT' | 'TIMEOUT';
export type AttackPhase = 'LIVE' | 'CUT' | 'FINISHED';

export interface AttackView {
  phase: AttackPhase;
  round: number;
  roundsTotal: number;
  points: number;
  goals: number;
  shots: number;
  chanceTimeLeft: number;
  lastOutcome: AttackOutcome | null;
  lastPoints: number;
  lastBonus: string | null;
  finished: boolean;
}

interface Spot { global: number; x: number; z: number }
interface RoundDef { carrier: number; spots: Spot[]; label: string }

const ROUND_DIFFICULTY: Difficulty[] = [
  'SEMI_PRO', 'SEMI_PRO', 'PROFESSIONAL', 'PROFESSIONAL',
  'WORLD_CLASS', 'WORLD_CLASS', 'LEGENDARY', 'ULTIMATE',
];

/** Scenario layouts (HOME attacks +x; AWAY goal line x = +52.5).
 *  HOME globals = teamIndex (0 GK · 1 LB · 2/3 CB · 4 RB · 5/7 CM · 6 CAM ·
 *  8 LW · 9 ST · 10 RW); AWAY globals = 11 + teamIndex. */
const ROUNDS: RoundDef[] = [
  {
    label: '2v1 Breakaway', carrier: 9,
    spots: [
      { global: 9, x: 26, z: 2 }, { global: 10, x: 22, z: -7 },
      { global: 13, x: 38, z: 0 },
    ],
  },
  {
    label: '3v2 Wing Cutback', carrier: 8,
    spots: [
      { global: 8, x: 20, z: 14 }, { global: 9, x: 28, z: 0 }, { global: 6, x: 24, z: -6 },
      { global: 13, x: 36, z: 2 }, { global: 14, x: 36, z: -4 },
    ],
  },
  {
    label: '3v3 Central', carrier: 6,
    spots: [
      { global: 6, x: 16, z: 0 }, { global: 9, x: 26, z: 3 }, { global: 10, x: 24, z: -8 },
      { global: 12, x: 32, z: -6 }, { global: 13, x: 36, z: 0 }, { global: 15, x: 32, z: 7 },
    ],
  },
  {
    label: '4v3 Overload', carrier: 9,
    spots: [
      { global: 9, x: 24, z: -2 }, { global: 8, x: 20, z: 12 }, { global: 10, x: 20, z: -12 }, { global: 5, x: 14, z: 0 },
      { global: 13, x: 34, z: -2 }, { global: 14, x: 34, z: 4 }, { global: 16, x: 28, z: -8 },
    ],
  },
  {
    label: '3v4 From Deep', carrier: 5,
    spots: [
      { global: 5, x: 6, z: 0 }, { global: 9, x: 16, z: 4 }, { global: 8, x: 14, z: -10 },
      { global: 12, x: 24, z: -8 }, { global: 13, x: 28, z: 0 }, { global: 14, x: 28, z: 5 }, { global: 15, x: 24, z: 9 },
    ],
  },
  {
    label: '4v4 Wing Play', carrier: 10,
    spots: [
      { global: 10, x: 18, z: -14 }, { global: 9, x: 26, z: 0 }, { global: 6, x: 20, z: 2 }, { global: 7, x: 12, z: -4 },
      { global: 12, x: 30, z: -10 }, { global: 13, x: 34, z: -2 }, { global: 14, x: 34, z: 4 }, { global: 18, x: 28, z: 8 },
    ],
  },
  {
    label: '5v4 Edge of the Box', carrier: 6,
    spots: [
      { global: 6, x: 30, z: 0 }, { global: 9, x: 36, z: 2 }, { global: 8, x: 32, z: 10 }, { global: 10, x: 32, z: -10 }, { global: 5, x: 24, z: -2 },
      { global: 13, x: 40, z: -3 }, { global: 14, x: 40, z: 3 }, { global: 16, x: 36, z: -9 }, { global: 18, x: 36, z: 9 },
    ],
  },
  {
    label: '5v5 The Final', carrier: 9,
    spots: [
      { global: 9, x: 28, z: -3 }, { global: 8, x: 24, z: 11 }, { global: 10, x: 24, z: -11 }, { global: 6, x: 26, z: 4 }, { global: 7, x: 18, z: 0 },
      { global: 12, x: 34, z: -9 }, { global: 13, x: 38, z: -3 }, { global: 14, x: 38, z: 3 }, { global: 15, x: 34, z: 9 }, { global: 16, x: 30, z: -6 },
    ],
  },
];

export function attackRoundLabel(round1Based: number): string {
  return ROUNDS[Math.max(0, Math.min(ROUNDS.length - 1, round1Based - 1))]?.label ?? 'Chance';
}

export class AttackModeEngine {
  readonly view: AttackView;
  private readonly scrimmage: ScrimmageEngine;
  private readonly eventQueue: SimEvent[] = [];
  private cutTimer = 0;
  private awayPossessionSec = 0;
  private lastShot: { x: number; z: number; type: string | null } | null = null;
  private offBus: (() => void) | null = null;
  private started = false;

  constructor(scrimmage: ScrimmageEngine) {
    this.scrimmage = scrimmage;
    this.view = {
      phase: 'LIVE', round: 0, roundsTotal: ATTACK_ROUNDS,
      points: 0, goals: 0, shots: 0,
      chanceTimeLeft: ATTACK_CHANCE_SECONDS,
      lastOutcome: null, lastPoints: 0, lastBonus: null,
      finished: false,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scrimmage.externalMatchControl = true;
    this.scrimmage.eventSink = (e) => { this.eventQueue.push(e); };
    // The shot type rides the broadcast bus (BALL_KICKED fires inside the
    // engine's executeShot, before any goal reset can clear it).
    this.offBus = matchEventBus.on('BALL_KICKED', (p) => {
      if (p.isShot && this.lastShot) this.lastShot.type = p.shotType;
    });
    this.spawnChance();
  }

  abort(): void {
    if (!this.view.finished) this.finish();
  }

  dispose(): void {
    this.offBus?.();
    this.offBus = null;
    this.scrimmage.eventSink = null;
    this.scrimmage.externalMatchControl = false;
  }

  private spawnChance(): void {
    const v = this.view;
    const def = ROUNDS[v.round] ?? ROUNDS[ROUNDS.length - 1]!;
    v.round += 1;
    v.chanceTimeLeft = ATTACK_CHANCE_SECONDS;
    v.phase = 'LIVE';
    v.lastBonus = null;
    this.awayPossessionSec = 0;
    this.lastShot = null;
    const sc = this.scrimmage;
    sc.setDifficulty(ROUND_DIFFICULTY[v.round - 1] ?? 'SEMI_PRO');
    sc.kickoffReset('HOME');
    const involved = new Set(def.spots.map((s) => s.global));
    const snapshot = sc.positionsSnapshot();
    for (const p of snapshot) {
      if (involved.has(p.global) || p.role === 'GK') continue;
      if (p.side === 'HOME') sc.forceMovePlayer(p.global, -36 + (p.global % 5) * 3, -20 + (p.global % 7) * 6);
      else sc.forceMovePlayer(p.global, -44 + (p.global % 4) * 3, -18 + (p.global % 6) * 7);
    }
    for (const spot of def.spots) sc.forceMovePlayer(spot.global, spot.x, spot.z);
    const c = def.spots.find((s) => s.global === def.carrier) ?? def.spots[0]!;
    sc.forceScenePlayer(def.carrier, c.x, c.z);
  }

  private endChance(outcome: AttackOutcome, points: number, bonus: string | null): void {
    const v = this.view;
    v.lastOutcome = outcome;
    v.lastPoints = points;
    v.lastBonus = bonus;
    v.points += points;
    if (outcome === 'GOAL') v.goals += 1;
    v.phase = 'CUT';
    this.cutTimer = CUT_SECONDS;
    this.eventQueue.length = 0;
  }

  private finish(): void {
    this.view.phase = 'FINISHED';
    this.view.finished = true;
  }

  step(dt: number, input: InputManager): void {
    const v = this.view;
    if (!this.started || v.finished) return;

    if (v.phase === 'CUT') {
      this.cutTimer -= dt;
      if (this.cutTimer <= 0) {
        if (v.round >= v.roundsTotal) { this.finish(); return; }
        this.spawnChance();
      }
      return;
    }

    this.scrimmage.step(dt, input);

    let outcome: AttackOutcome | null = null;
    for (const e of this.eventQueue) {
      if (e.kind === 'SHOT' && e.side === 'HOME') {
        v.shots += 1;
        this.lastShot = { x: e.x, z: e.z, type: null };
      } else if (e.kind === 'GOAL') {
        outcome = e.scoringSide === 'HOME' ? 'GOAL' : 'CLEARED';
      } else if (e.kind === 'GK_SAVE' && e.gkSide === 'AWAY') {
        outcome = 'SAVED';
      } else if (e.kind === 'OUT_OF_PLAY') {
        outcome = 'OUT';
      }
    }
    this.eventQueue.length = 0;

    if (!outcome) {
      const poss = this.scrimmage.currentPossessionSide();
      if (poss === 'AWAY') {
        this.awayPossessionSec += dt;
        if (this.awayPossessionSec > 0.8) outcome = 'CLEARED';
      } else {
        this.awayPossessionSec = 0;
      }
    }

    v.chanceTimeLeft -= dt;
    if (!outcome && v.chanceTimeLeft <= 0) outcome = 'TIMEOUT';

    if (outcome) {
      let points = 0;
      let bonus: string | null = null;
      if (outcome === 'GOAL') {
        points = 100;
        const parts: string[] = [];
        const t = this.lastShot?.type;
        if (t === 'FINESSE') { points += 25; parts.push('Finesse finish +25'); }
        if (t === 'POWER') { points += 25; parts.push('Power strike +25'); }
        if (t === 'CHIP') { points += 25; parts.push('Cheeky chip +25'); }
        if (this.lastShot) {
          const dist = Math.hypot(52.5 - this.lastShot.x, this.lastShot.z);
          if (dist >= 22) { points += 25; parts.push('Long-range +25'); }
        }
        bonus = parts.length > 0 ? parts.join(' · ') : null;
      }
      this.endChance(outcome, points, bonus);
    }
  }
}

export interface AttackSettlement {
  grant: ModeRewardGrant;
  rating: string;
}

export function settleAttack(points: number, goals: number): AttackSettlement {
  const rating = goals >= 7 ? 'Clinical — a born finisher'
    : goals >= 5 ? 'Sharp — the keeper feared you'
      : goals >= 3 ? 'Promising — chances are turning into goals'
        : goals >= 1 ? 'Wasteful — the chances were there'
          : 'Blanked — the defence owned the box today';
  return {
    rating,
    grant: {
      coins: 400 + points + goals * 100,
      gems: goals >= 6 ? 15 : 0,
      xp: 150 + goals * 25 + Math.floor(points / 10),
      trainingXp: 60 + goals * 10,
      fans: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Verification lab — a full headless Attack Mode run through the real
// engine (AI carrier plays the chances): all 8 rounds resolve and the
// points ledger stays consistent with the goals scored.
// ---------------------------------------------------------------------------

export interface AttackLabResult {
  engineOk: boolean;
  roundsPlayed: number;
  goals: number;
  points: number;
  detail: string;
}

export function runAttackLab(): AttackLabResult {
  const nets = { left: null, right: null };
  const sc = new ScrimmageEngine(nets, { autonomousHome: true, seed: 1122 });
  const idle = new InputManager();
  const engine = new AttackModeEngine(sc);
  engine.start();
  let guard = 0;
  while (!engine.view.finished && guard < 60 * 240) {
    engine.step(1 / 60, idle);
    guard += 1;
  }
  const v = engine.view;
  const engineOk = v.finished && v.round === ATTACK_ROUNDS
    && v.goals <= v.round && v.points >= v.goals * 100 && v.points <= v.goals * 150;
  engine.dispose();
  return {
    engineOk,
    roundsPlayed: v.round,
    goals: v.goals,
    points: v.points,
    detail: `8 rounds headless · ${v.goals} goals · ${v.points} pts · every round resolved and cut cleanly`,
  };
}
