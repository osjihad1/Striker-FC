// Striker FC — modes/VsAttackMode.ts (Phase 08, Blueprint 08 §3 Mode 2)
// VS Attack: the 90-second blitz. You play rapid back-to-back attacking
// possessions against the real 3D engine — GREAT / GOOD / BASIC chances are
// spawned directly on the pitch from the OVR-delta probability table, each
// chance ends the instant it resolves (goal, save, clearance, out of bounds
// or the 12-second cap) with a 0.4s cut to the next one, and a simulated
// opponent plays their own chances on the live ticker beside you.

import { mulberry32 } from '../core/math';
import { InputManager } from '../controls/InputManager';
import { ScrimmageEngine, type SimEvent } from '../ai/ScrimmageEngine';
import type { ModeRewardGrant } from './ModeRewards';

export type ChanceQuality = 'GREAT' | 'GOOD' | 'BASIC';

export interface ChanceProbabilities { great: number; good: number; basic: number }

/**
 * Spec formula: at delta 0 → 20% Great / 50% Good / 30% Basic. Each +1 OVR
 * of advantage shifts +5% from Basic into Great (Great clamped [5%..65%]).
 */
export function chanceProbabilities(ovrDelta: number): ChanceProbabilities {
  const great = Math.max(0.05, Math.min(0.65, 0.20 + 0.05 * ovrDelta));
  const basic = Math.max(0.05, Math.min(0.90, 0.30 - 0.05 * ovrDelta));
  const good = Math.max(0.05, 1 - great - basic);
  const total = great + good + basic;
  return { great: great / total, good: good / total, basic: basic / total };
}

export function rollChanceQuality(probs: ChanceProbabilities, rng: () => number): ChanceQuality {
  const r = rng();
  if (r < probs.great) return 'GREAT';
  if (r < probs.great + probs.good) return 'GOOD';
  return 'BASIC';
}

export const CHANCE_COLORS: Record<ChanceQuality, string> = {
  GREAT: '#22c55e',
  GOOD: '#facc15',
  BASIC: '#38bdf8',
};

export const CHANCE_LABELS: Record<ChanceQuality, string> = {
  GREAT: 'GREAT CHANCE',
  GOOD: 'GOOD CHANCE',
  BASIC: 'BASIC CHANCE',
};

export type ChanceOutcome = 'GOAL' | 'SAVED' | 'CLEARED' | 'OUT' | 'TIMEOUT';
export type VsaPhase = 'LIVE' | 'CUT' | 'FINISHED';

export interface VsaView {
  phase: VsaPhase;
  timeLeft: number;
  userGoals: number;
  oppGoals: number;
  chanceNumber: number;
  quality: ChanceQuality | null;
  chanceTimeLeft: number;
  lastOutcome: ChanceOutcome | null;
  userShots: number;
  goalsByQuality: Record<ChanceQuality, number>;
  ticker: string[];
  tickerFlash: string | null;
  finished: boolean;
}

interface ScenarioSpot { global: number; x: number; z: number }

/** Scenario layouts (HOME attacks +x; the AWAY goal line is x = +52.5). */
function scenarioFor(quality: ChanceQuality, rng: () => number): { carrier: number; spots: ScenarioSpot[] } {
  const sideSign = rng() < 0.5 ? -1 : 1;
  switch (quality) {
    case 'GREAT': // 2v1 breakaway, carrier 24m out
      return {
        carrier: 9,
        spots: [
          { global: 9, x: 28.5, z: 3 * sideSign },
          { global: 10, x: 24, z: -8 * sideSign },
          { global: 13, x: 36, z: 0 },
        ],
      };
    case 'GOOD': // 3v2 wing cutback, carrier 32m out on the flank
      return {
        carrier: 8,
        spots: [
          { global: 8, x: 20.5, z: 16 * sideSign },
          { global: 9, x: 30, z: 0 },
          { global: 6, x: 26, z: -6 * sideSign },
          { global: 13, x: 38, z: 4 * sideSign },
          { global: 14, x: 38, z: -4 * sideSign },
        ],
      };
    case 'BASIC': // 3v4 from 42m out
      return {
        carrier: 6,
        spots: [
          { global: 6, x: 10.5, z: 0 },
          { global: 9, x: 18, z: -6 },
          { global: 10, x: 18, z: 6 },
          { global: 12, x: 30, z: -10 },
          { global: 13, x: 34, z: -3 },
          { global: 14, x: 34, z: 3 },
          { global: 15, x: 30, z: 10 },
        ],
      };
  }
}

const CHANCE_SECONDS = 12;
const CUT_SECONDS = 0.4;

export class VsAttackEngine {
  readonly view: VsaView;
  private readonly scrimmage: ScrimmageEngine;
  private readonly rng: () => number;
  private readonly probs: ChanceProbabilities;
  private readonly oppProbs: ChanceProbabilities;
  private readonly durationSec: number;
  private readonly eventQueue: SimEvent[] = [];
  private cutTimer = 0;
  private oppTimer: number;
  private awayPossessionSec = 0;
  private started = false;

  constructor(scrimmage: ScrimmageEngine, opts: {
    userTeamOvr: number;
    oppTeamOvr: number;
    seed?: number;
    durationSec?: number;
  }) {
    this.scrimmage = scrimmage;
    this.rng = mulberry32(opts.seed ?? 20261208);
    const delta = opts.userTeamOvr - opts.oppTeamOvr;
    this.probs = chanceProbabilities(delta);
    this.oppProbs = chanceProbabilities(-delta);
    this.durationSec = opts.durationSec ?? 90;
    this.oppTimer = 5 + this.rng() * 5;
    this.view = {
      phase: 'LIVE',
      timeLeft: this.durationSec,
      userGoals: 0,
      oppGoals: 0,
      chanceNumber: 0,
      quality: null,
      chanceTimeLeft: CHANCE_SECONDS,
      lastOutcome: null,
      userShots: 0,
      goalsByQuality: { GREAT: 0, GOOD: 0, BASIC: 0 },
      ticker: [],
      tickerFlash: null,
      finished: false,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // The blitz owns restarts: the scrimmage reports events and never
    // auto-resets, so every chance cut is instant and clean.
    this.scrimmage.externalMatchControl = true;
    this.scrimmage.eventSink = (e) => { this.eventQueue.push(e); };
    this.spawnChance();
  }

  /** Quit early: the current score stands as the result. */
  abort(): void {
    if (this.view.finished) return;
    this.finish();
  }

  dispose(): void {
    this.scrimmage.eventSink = null;
    this.scrimmage.externalMatchControl = false;
  }

  private spawnChance(): void {
    const v = this.view;
    const quality = rollChanceQuality(this.probs, this.rng);
    v.quality = quality;
    v.chanceNumber += 1;
    v.chanceTimeLeft = CHANCE_SECONDS;
    v.phase = 'LIVE';
    this.awayPossessionSec = 0;
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    const { carrier, spots } = scenarioFor(quality, this.rng);
    const involved = new Set(spots.map((s) => s.global));
    // Park everyone not in the scenario: spare attackers hold deep, spare
    // defenders recover from the far half — the picture stays the spec's
    // 2v1 / 3v2 / 3v4 instead of a 22-man pile-up.
    const snapshot = sc.positionsSnapshot();
    for (const p of snapshot) {
      if (involved.has(p.global) || p.role === 'GK') continue;
      if (p.side === 'HOME') {
        sc.forceMovePlayer(p.global, -34 + (p.global % 5) * 4, -20 + (p.global % 7) * 6);
      } else {
        sc.forceMovePlayer(p.global, -42 + (p.global % 4) * 3, -18 + (p.global % 6) * 7);
      }
    }
    for (const spot of spots) sc.forceMovePlayer(spot.global, spot.x, spot.z);
    const c = spots.find((s) => s.global === carrier) ?? spots[0]!;
    sc.forceScenePlayer(carrier, c.x, c.z);
  }

  private endChance(outcome: ChanceOutcome): void {
    const v = this.view;
    v.lastOutcome = outcome;
    if (outcome === 'GOAL' && v.quality) v.goalsByQuality[v.quality] += 1;
    v.phase = 'CUT';
    this.cutTimer = CUT_SECONDS;
    this.eventQueue.length = 0;
  }

  private finish(): void {
    this.view.phase = 'FINISHED';
    this.view.finished = true;
    this.view.timeLeft = Math.max(0, this.view.timeLeft);
  }

  private pushTicker(line: string, flash: boolean): void {
    const v = this.view;
    v.ticker = [line, ...v.ticker].slice(0, 5);
    if (flash) v.tickerFlash = line;
  }

  private tickOpponent(dt: number): void {
    this.oppTimer -= dt;
    if (this.oppTimer > 0) return;
    this.oppTimer = 6 + this.rng() * 5;
    const quality = rollChanceQuality(this.oppProbs, this.rng);
    const conversion = quality === 'GREAT' ? 0.52 : quality === 'GOOD' ? 0.34 : 0.16;
    const v = this.view;
    if (this.rng() < conversion) {
      v.oppGoals += 1;
      this.pushTicker(`OPPONENT SCORED! ${v.userGoals} – ${v.oppGoals}`, true);
    } else {
      this.pushTicker(
        quality === 'GREAT' ? 'Opponent great chance — dragged wide!'
          : quality === 'GOOD' ? 'Opponent good chance — saved by your keeper!'
            : 'Opponent basic chance — cleared comfortably.',
        false,
      );
    }
  }

  step(dt: number, input: InputManager): void {
    const v = this.view;
    if (!this.started || v.finished) return;

    if (v.phase === 'CUT') {
      this.cutTimer -= dt;
      if (this.cutTimer <= 0) {
        if (v.timeLeft <= 0) { this.finish(); return; }
        this.spawnChance();
      }
      return; // the cut: simulation frozen for one broadcast beat
    }

    v.timeLeft = Math.max(0, v.timeLeft - dt);
    this.tickOpponent(dt);
    this.scrimmage.step(dt, input);

    // Resolve queued sim events into a chance outcome.
    let outcome: ChanceOutcome | null = null;
    for (const e of this.eventQueue) {
      if (e.kind === 'SHOT' && e.side === 'HOME') v.userShots += 1;
      if (e.kind === 'GOAL') outcome = e.scoringSide === 'HOME' ? 'GOAL' : 'CLEARED';
      else if (e.kind === 'GK_SAVE' && e.gkSide === 'AWAY') outcome = 'SAVED';
      else if (e.kind === 'OUT_OF_PLAY') outcome = 'OUT';
    }
    this.eventQueue.length = 0;

    if (!outcome) {
      // A tackle won by a defender (or the keeper claiming it) is a clearance.
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
    // The 90-second clock is king: a dying chance gets at most 5 extra seconds.
    if (!outcome && v.timeLeft <= 0 && v.chanceTimeLeft > 5) v.chanceTimeLeft = 5;
    if (!outcome && v.timeLeft <= 0 && v.chanceTimeLeft <= 0) outcome = 'TIMEOUT';

    if (outcome) {
      if (outcome === 'GOAL') v.userGoals += 1;
      this.endChance(outcome);
      if (v.timeLeft <= 0 && outcome !== 'GOAL') {
        // fall through: CUT phase will finish the session
      }
    }
  }
}

export type VsaResult = 'WIN' | 'DRAW' | 'LOSS';

export interface VsaSettlement {
  result: VsaResult;
  grant: ModeRewardGrant;
  fansDelta: number;
}

export function settleVsa(userGoals: number, oppGoals: number): VsaSettlement {
  const diff = userGoals - oppGoals;
  const result: VsaResult = diff > 0 ? 'WIN' : diff === 0 ? 'DRAW' : 'LOSS';
  const fansDelta = result === 'WIN' ? 900 + diff * 350 + userGoals * 60
    : result === 'DRAW' ? 200 + userGoals * 40
      : -350 + userGoals * 30;
  return {
    result,
    fansDelta,
    grant: {
      coins: (result === 'WIN' ? 1500 : result === 'DRAW' ? 700 : 300) + userGoals * 100,
      gems: 0,
      xp: result === 'WIN' ? 220 : result === 'DRAW' ? 130 : 90,
      trainingXp: 60 + userGoals * 15,
      fans: fansDelta,
    },
  };
}

// ---------------------------------------------------------------------------
// Verification lab — probability table exactness plus a headless 45-second
// blitz through the real engine (AI carrier plays the chances).
// ---------------------------------------------------------------------------

export interface VsaLabResult {
  probabilitiesOk: boolean;
  engineOk: boolean;
  chancesPlayed: number;
  tickerEvents: number;
  userGoals: number;
  oppGoals: number;
  detail: string;
}

export function runVsaLab(): VsaLabResult {
  const p0 = chanceProbabilities(0);
  const pPlus = chanceProbabilities(5);
  const pClamp = chanceProbabilities(20);
  const probabilitiesOk = Math.abs(p0.great - 0.20) < 0.001 && Math.abs(p0.good - 0.50) < 0.001 && Math.abs(p0.basic - 0.30) < 0.001
    && Math.abs(pPlus.great - 0.45) < 0.001
    && Math.abs(pClamp.great - 0.65) < 0.001;

  // Headless blitz on its own engine instance (never touches the live match).
  const nets = { left: null, right: null };
  const sc = new ScrimmageEngine(nets, { autonomousHome: true, seed: 4242 });
  const idle = new InputManager();
  const engine = new VsAttackEngine(sc, { userTeamOvr: 80, oppTeamOvr: 78, seed: 808, durationSec: 45 });
  engine.start();
  let guard = 0;
  while (!engine.view.finished && guard < 60 * 120) {
    engine.step(1 / 60, idle);
    guard += 1;
  }
  const v = engine.view;
  const engineOk = v.finished && v.chanceNumber >= 3 && v.ticker.length >= 2
    && v.userGoals === v.goalsByQuality.GREAT + v.goalsByQuality.GOOD + v.goalsByQuality.BASIC;
  engine.dispose();
  return {
    probabilitiesOk,
    engineOk,
    chancesPlayed: v.chanceNumber,
    tickerEvents: v.ticker.length,
    userGoals: v.userGoals,
    oppGoals: v.oppGoals,
    detail: `Δ0 → 20/50/30 · Δ+5 → Great 45% · blitz: ${v.chanceNumber} chances, ${v.userGoals}–${v.oppGoals}, ticker live`,
  };
}
