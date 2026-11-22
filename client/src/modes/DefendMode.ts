// Striker FC — modes/DefendMode.ts
// Defend Mode: you only defend. Eight attacking waves in the real 3D
// engine — the opponent starts on the ball bearing down on your goal with
// a set number of attackers against your set number of defenders, and
// each wave lives until it resolves (goal conceded, ball won, clearance
// out of play, or the 18-second cap). Winning the ball pays +40, every
// keeper save +30, every wave survived pays a +50 clean-sheet bonus, and
// conceding costs −75. The waves get harder: more attackers, deeper
// support, smarter AI tiers. Auto-switching puts you on the defender
// nearest the ball, exactly like a real match.

import { InputManager } from '../controls/InputManager';
import { ScrimmageEngine, type SimEvent } from '../ai/ScrimmageEngine';
import type { Difficulty } from '../core/types';
import type { ModeRewardGrant } from './ModeRewards';

export const DEFEND_WAVES = 8;
export const DEFEND_WAVE_SECONDS = 18;
const CUT_SECONDS = 0.7;

export const POINTS_BALL_WON = 40;
export const POINTS_SAVE = 30;
export const POINTS_CLEAN_SHEET = 50;
export const POINTS_CONCEDED = -75;

export type DefendOutcome = 'BALL_WON' | 'CLEARED' | 'SURVIVED' | 'OUT' | 'CONCEDED';
export type DefendPhase = 'LIVE' | 'CUT' | 'FINISHED';

export interface DefendView {
  phase: DefendPhase;
  wave: number;
  wavesTotal: number;
  points: number;
  conceded: number;
  ballsWon: number;
  saves: number;
  cleanSheets: number;
  chanceTimeLeft: number;
  lastOutcome: DefendOutcome | null;
  lastPoints: number;
  finished: boolean;
}

interface Spot { global: number; x: number; z: number }
interface WaveDef { carrier: number; spots: Spot[]; label: string }

const WAVE_DIFFICULTY: Difficulty[] = [
  'SEMI_PRO', 'SEMI_PRO', 'PROFESSIONAL', 'PROFESSIONAL',
  'WORLD_CLASS', 'WORLD_CLASS', 'LEGENDARY', 'ULTIMATE',
];

/** Wave layouts (AWAY attacks −x; HOME goal line x = −52.5).
 *  HOME globals = teamIndex (0 GK · 1 LB · 2/3 CB · 4 RB · 5/7 CM · 6 CAM ·
 *  8 LW · 9 ST · 10 RW); AWAY globals = 11 + teamIndex. */
const WAVES: WaveDef[] = [
  {
    label: '1v1 Duel', carrier: 20,
    spots: [
      { global: 20, x: -26, z: 2 },
      { global: 2, x: -38, z: 0 },
    ],
  },
  {
    label: '2v1 Break', carrier: 20,
    spots: [
      { global: 20, x: -24, z: -3 }, { global: 19, x: -20, z: 8 },
      { global: 3, x: -36, z: 2 },
    ],
  },
  {
    label: '2v2 Wing Raid', carrier: 21,
    spots: [
      { global: 21, x: -22, z: -12 }, { global: 20, x: -28, z: 0 },
      { global: 2, x: -36, z: -4 }, { global: 4, x: -34, z: -10 },
    ],
  },
  {
    label: '3v2 Counter', carrier: 17,
    spots: [
      { global: 17, x: -18, z: 0 }, { global: 20, x: -26, z: 5 }, { global: 19, x: -24, z: -9 },
      { global: 2, x: -36, z: 0 }, { global: 3, x: -36, z: 6 },
    ],
  },
  {
    label: '3v3 Midfield Wave', carrier: 20,
    spots: [
      { global: 20, x: -24, z: 3 }, { global: 18, x: -16, z: -4 }, { global: 21, x: -20, z: 12 },
      { global: 1, x: -34, z: 10 }, { global: 2, x: -38, z: 0 }, { global: 5, x: -30, z: -4 },
    ],
  },
  {
    label: '4v3 Siege', carrier: 19,
    spots: [
      { global: 19, x: -20, z: -13 }, { global: 20, x: -27, z: -2 }, { global: 17, x: -18, z: 4 }, { global: 16, x: -12, z: 0 },
      { global: 2, x: -38, z: -2 }, { global: 3, x: -38, z: 4 }, { global: 4, x: -34, z: -11 },
    ],
  },
  {
    label: '4v4 Full Press', carrier: 20,
    spots: [
      { global: 20, x: -26, z: 0 }, { global: 21, x: -22, z: -12 }, { global: 19, x: -22, z: 12 }, { global: 18, x: -14, z: 3 },
      { global: 1, x: -35, z: 11 }, { global: 2, x: -39, z: -3 }, { global: 3, x: -39, z: 4 }, { global: 4, x: -35, z: -11 },
    ],
  },
  {
    label: '5v4 The Final Wave', carrier: 17,
    spots: [
      { global: 17, x: -16, z: 0 }, { global: 20, x: -25, z: -4 }, { global: 19, x: -21, z: 11 }, { global: 21, x: -21, z: -11 }, { global: 16, x: -10, z: 6 },
      { global: 2, x: -39, z: 0 }, { global: 3, x: -39, z: 6 }, { global: 5, x: -31, z: -3 }, { global: 4, x: -35, z: -10 },
    ],
  },
];

export function defendWaveLabel(wave1Based: number): string {
  return WAVES[Math.max(0, Math.min(WAVES.length - 1, wave1Based - 1))]?.label ?? 'Wave';
}

export class DefendModeEngine {
  readonly view: DefendView;
  private readonly scrimmage: ScrimmageEngine;
  private readonly eventQueue: SimEvent[] = [];
  private cutTimer = 0;
  private started = false;

  constructor(scrimmage: ScrimmageEngine) {
    this.scrimmage = scrimmage;
    this.view = {
      phase: 'LIVE', wave: 0, wavesTotal: DEFEND_WAVES,
      points: 0, conceded: 0, ballsWon: 0, saves: 0, cleanSheets: 0,
      chanceTimeLeft: DEFEND_WAVE_SECONDS,
      lastOutcome: null, lastPoints: 0,
      finished: false,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scrimmage.externalMatchControl = true;
    this.scrimmage.eventSink = (e) => { this.eventQueue.push(e); };
    this.spawnWave();
  }

  abort(): void {
    if (!this.view.finished) this.finish();
  }

  dispose(): void {
    this.scrimmage.eventSink = null;
    this.scrimmage.externalMatchControl = false;
  }

  private spawnWave(): void {
    const v = this.view;
    const def = WAVES[v.wave] ?? WAVES[WAVES.length - 1]!;
    v.wave += 1;
    v.chanceTimeLeft = DEFEND_WAVE_SECONDS;
    v.phase = 'LIVE';
    const sc = this.scrimmage;
    sc.setDifficulty(WAVE_DIFFICULTY[v.wave - 1] ?? 'SEMI_PRO');
    sc.kickoffReset('AWAY');
    const involved = new Set(def.spots.map((s) => s.global));
    const snapshot = sc.positionsSnapshot();
    for (const p of snapshot) {
      if (involved.has(p.global) || p.role === 'GK') continue;
      // Everyone else watches from the far end — the wave is the picture.
      sc.forceMovePlayer(p.global, 38 + (p.global % 5) * 2.5, -20 + (p.global % 7) * 6);
    }
    for (const spot of def.spots) sc.forceMovePlayer(spot.global, spot.x, spot.z);
    const c = def.spots.find((s) => s.global === def.carrier) ?? def.spots[0]!;
    sc.forceScenePlayer(def.carrier, c.x, c.z);
  }

  private endWave(outcome: DefendOutcome, points: number): void {
    const v = this.view;
    v.lastOutcome = outcome;
    v.lastPoints = points;
    v.points = Math.max(0, v.points + points);
    if (outcome === 'CONCEDED') v.conceded += 1;
    if (outcome !== 'CONCEDED') v.cleanSheets += 1;
    if (outcome === 'BALL_WON') v.ballsWon += 1;
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
        if (v.wave >= v.wavesTotal) { this.finish(); return; }
        this.spawnWave();
      }
      return;
    }

    this.scrimmage.step(dt, input);

    let outcome: DefendOutcome | null = null;
    for (const e of this.eventQueue) {
      if (e.kind === 'GOAL') {
        outcome = e.scoringSide === 'AWAY' ? 'CONCEDED' : 'CLEARED';
      } else if (e.kind === 'GK_SAVE' && e.gkSide === 'HOME') {
        // A save pays immediately; the wave plays on (parries stay live).
        v.saves += 1;
        v.points += POINTS_SAVE;
      } else if (e.kind === 'OUT_OF_PLAY') {
        outcome = e.awardSide === 'HOME' ? 'CLEARED' : 'OUT';
      } else if (e.kind === 'RECEPTION' && e.side === 'HOME' && e.passerSide === 'AWAY') {
        outcome = 'BALL_WON'; // interception — stepped into the pass
      }
    }
    this.eventQueue.length = 0;

    if (!outcome) {
      // A tackle or a smothered ball: possession flipping to a HOME
      // outfielder (or the keeper claiming it) ends the wave as won.
      const poss = this.scrimmage.currentPossessionSide();
      if (poss === 'HOME') outcome = 'BALL_WON';
    }

    v.chanceTimeLeft -= dt;
    if (!outcome && v.chanceTimeLeft <= 0) outcome = 'SURVIVED';

    if (outcome) {
      const points = outcome === 'CONCEDED' ? POINTS_CONCEDED
        : outcome === 'BALL_WON' ? POINTS_BALL_WON + POINTS_CLEAN_SHEET
          : POINTS_CLEAN_SHEET;
      this.endWave(outcome, points);
    }
  }
}

export interface DefendSettlement {
  grant: ModeRewardGrant;
  rating: string;
}

export function settleDefend(points: number, conceded: number, ballsWon: number, saves: number): DefendSettlement {
  const rating = conceded === 0 ? 'A wall — nothing got through'
    : conceded <= 2 ? 'Rock solid — the box was yours'
      : conceded <= 4 ? 'Bent but not broken'
        : 'Overrun — the waves kept coming';
  return {
    rating,
    grant: {
      coins: 400 + points + ballsWon * 25,
      gems: conceded === 0 ? 15 : 0,
      xp: 150 + ballsWon * 15 + saves * 10,
      trainingXp: 60 + saves * 5,
      fans: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Verification lab — a full headless Defend Mode run through the real
// engine (AI defenders play the waves): all 8 waves resolve and the
// points ledger never goes negative or disagrees with the outcomes.
// ---------------------------------------------------------------------------

export interface DefendLabResult {
  engineOk: boolean;
  wavesPlayed: number;
  conceded: number;
  points: number;
  detail: string;
}

export function runDefendLab(): DefendLabResult {
  const nets = { left: null, right: null };
  const sc = new ScrimmageEngine(nets, { autonomousHome: true, seed: 2233 });
  const idle = new InputManager();
  const engine = new DefendModeEngine(sc);
  engine.start();
  let guard = 0;
  while (!engine.view.finished && guard < 60 * 300) {
    engine.step(1 / 60, idle);
    guard += 1;
  }
  const v = engine.view;
  const engineOk = v.finished && v.wave === DEFEND_WAVES
    && v.points >= 0 && v.conceded <= v.wave
    && v.cleanSheets + v.conceded === v.wave;
  engine.dispose();
  return {
    engineOk,
    wavesPlayed: v.wave,
    conceded: v.conceded,
    points: v.points,
    detail: `8 waves headless · ${v.conceded} conceded · ${v.ballsWon} balls won · ${v.saves} saves · ${v.points} pts`,
  };
}
