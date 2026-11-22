// Striker FC — modes/SkillGamesMode.ts (Phase 08, Blueprint 08 §3 Mode 5)
// The Skill Games Arena: four playable 3D mini-games on the real engine —
// Moving Target Shooting, Slalom Dribble Gates, Free-Kick Wall Master and
// One-Touch Passing Zones. Each runs a 60-second clock (the free-kick game
// is five progressive kicks inside that clock), publishes glowing targets /
// gates / zones into the 3D scene through the scrimmage render state, and
// scores against a 1–3 star target. Non-participants are parked via the
// rules engine's sent-off tunnel spots so every game picture stays clean.

import { mulberry32 } from '../core/math';
import { InputManager } from '../controls/InputManager';
import { ScrimmageEngine, type SimEvent, type SkillMarker } from '../ai/ScrimmageEngine';
import type { ModeRewardGrant } from './ModeRewards';

export type SkillGameId = 'TARGET_SHOOTING' | 'SLALOM_GATES' | 'FREE_KICK_WALL' | 'PASSING_ZONES';

export interface SkillGameDef {
  id: SkillGameId;
  name: string;
  blurb: string;
  durationSec: number;
  /** Score needed for 1 / 2 / 3 stars. */
  starThresholds: [number, number, number];
}

export const SKILL_GAMES: SkillGameDef[] = [
  {
    id: 'TARGET_SHOOTING', name: 'Moving Target Shooting',
    blurb: 'Strike the glowing bullseye sweeping the goal mouth. Top-corner finesse finishes pay a +50 bonus.',
    durationSec: 60, starThresholds: [200, 420, 640],
  },
  {
    id: 'SLALOM_GATES', name: 'Slalom Dribble Gates',
    blurb: 'Sprint and skill-move through six neon gates while two roaming defenders hunt you down.',
    durationSec: 60, starThresholds: [250, 500, 750],
  },
  {
    id: 'FREE_KICK_WALL', name: 'Free-Kick Wall Master',
    blurb: 'Five progressive free kicks over a jumping four-man wall, into the highlighted corner.',
    durationSec: 60, starThresholds: [150, 350, 550],
  },
  {
    id: 'PASSING_ZONES', name: 'One-Touch Passing Zones',
    blurb: 'Ping passes into the highlighted teammate zone — release within 1.4s to grow the combo multiplier.',
    durationSec: 60, starThresholds: [300, 600, 950],
  },
];

export function skillGameDef(id: SkillGameId): SkillGameDef {
  return SKILL_GAMES.find((g) => g.id === id) ?? SKILL_GAMES[0]!;
}

export function starsForScore(def: SkillGameDef, score: number): number {
  const [one, two, three] = def.starThresholds;
  return score >= three ? 3 : score >= two ? 2 : score >= one ? 1 : 0;
}

// ---------- Daily reward cap (Epic fix round, P0-5) ------------------------------
// Skill games were an uncapped coin farm. Now: the first 5 completions each
// UTC day pay in full, the next 5 pay half coins, and after that completions
// pay 0 coins (stars, best scores and XP still record — practice is never
// punished, only the farm is closed).

import type { SaveProfile } from '../core/types';

export const SKILL_FULL_REWARD_LIMIT = 5;
export const SKILL_HALF_REWARD_LIMIT = 5;

export function skillDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export interface SkillCapOutcome {
  /** Coin multiplier for this completion: 1, 0.5 or 0. */
  coinScale: 1 | 0.5 | 0;
  /** 1-based completion number today (after this one is counted). */
  completionNumber: number;
  /** The bookkeeping to persist on the profile. */
  skillDaily: { dayKey: string; fullUsed: number; halfUsed: number };
}

/** Pure cap math: given the profile's bookkeeping and the clock, what does
 *  the NEXT completion pay, and what should be stored afterwards? */
export function skillCapFor(profile: SaveProfile, nowMs: number): SkillCapOutcome {
  const dayKey = skillDayKey(nowMs);
  const stored = profile.skillDaily && profile.skillDaily.dayKey === dayKey
    ? profile.skillDaily
    : { dayKey, fullUsed: 0, halfUsed: 0 };
  if (stored.fullUsed < SKILL_FULL_REWARD_LIMIT) {
    return {
      coinScale: 1,
      completionNumber: stored.fullUsed + 1,
      skillDaily: { dayKey, fullUsed: stored.fullUsed + 1, halfUsed: stored.halfUsed },
    };
  }
  if (stored.halfUsed < SKILL_HALF_REWARD_LIMIT) {
    return {
      coinScale: 0.5,
      completionNumber: SKILL_FULL_REWARD_LIMIT + stored.halfUsed + 1,
      skillDaily: { dayKey, fullUsed: stored.fullUsed, halfUsed: stored.halfUsed + 1 },
    };
  }
  return {
    coinScale: 0,
    completionNumber: SKILL_FULL_REWARD_LIMIT + SKILL_HALF_REWARD_LIMIT + 1,
    skillDaily: stored,
  };
}

export interface SkillCapLabResult {
  capOk: boolean;
  resetOk: boolean;
  detail: string;
}

/** Deterministic checks of the daily cap sequence + the UTC day reset. */
export function runSkillCapLab(): SkillCapLabResult {
  const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);
  let profile = { skillDaily: null } as SaveProfile;
  const scales: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const outcome = skillCapFor(profile, t0 + i * 60_000);
    scales.push(outcome.coinScale);
    profile = { ...profile, skillDaily: outcome.skillDaily };
  }
  const capOk = scales.slice(0, 5).every((s) => s === 1)
    && scales.slice(5, 10).every((s) => s === 0.5)
    && scales.slice(10).every((s) => s === 0);
  const nextDay = skillCapFor(profile, t0 + 25 * 3_600_000);
  const resetOk = nextDay.coinScale === 1 && nextDay.skillDaily.fullUsed === 1;
  return {
    capOk, resetOk,
    detail: `12 completions → ${scales.join('/')} · next UTC day resets to full rate`,
  };
}

export function skillRewards(def: SkillGameDef, score: number): { stars: number; grant: ModeRewardGrant } {
  const stars = starsForScore(def, score);
  return {
    stars,
    grant: {
      coins: 200 + 300 * stars + Math.floor(score / 10),
      gems: 0,
      xp: 40 + 60 * stars,
      trainingXp: 30 + 20 * stars,
      fans: 0,
    },
  };
}

export interface SkillView {
  gameId: SkillGameId;
  phase: 'LIVE' | 'FINISHED';
  timeLeft: number;
  score: number;
  stars: number;
  combo: number;
  message: string;
  subLabel: string;
  finished: boolean;
}

const HOME_ST = 9;

export class SkillGamesEngine {
  readonly view: SkillView;
  private readonly scrimmage: ScrimmageEngine;
  private readonly def: SkillGameDef;
  private readonly rng: () => number;
  private readonly durationSec: number;
  private readonly eventQueue: SimEvent[] = [];
  private started = false;
  private elapsed = 0;

  // Shooting
  private shotPhase: 'AIM' | 'FLIGHT' | 'RESET' = 'AIM';
  private shotTimer = 0;
  private lastShotType: string | null = null;
  // Slalom
  private gates: { x: number; z: number }[] = [];
  private gateIndex = 0;
  private prevBallX = 0;
  // Free kick
  private kickIndex = 0;
  private fkPhase: 'AIM' | 'RESOLVING' | 'NEXT' = 'AIM';
  private fkTimer = 0;
  // Passing
  private zoneGlobals = [6, 8, 10];
  private holder = HOME_ST;
  private targetGlobal = 6;
  private oneTouchDeadline = -1;
  private lastPasser = -1;

  constructor(scrimmage: ScrimmageEngine, gameId: SkillGameId, opts: { seed?: number; durationSec?: number } = {}) {
    this.scrimmage = scrimmage;
    this.def = skillGameDef(gameId);
    this.rng = mulberry32(opts.seed ?? 20261225);
    this.durationSec = opts.durationSec ?? this.def.durationSec;
    this.view = {
      gameId, phase: 'LIVE', timeLeft: this.durationSec, score: 0, stars: 0,
      combo: 0, message: '', subLabel: '', finished: false,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scrimmage.externalMatchControl = true;
    this.scrimmage.eventSink = (e) => { this.eventQueue.push(e); };
    switch (this.def.id) {
      case 'TARGET_SHOOTING': this.setupShooting(); break;
      case 'SLALOM_GATES': this.setupSlalom(); break;
      case 'FREE_KICK_WALL': this.setupFreeKick(); break;
      case 'PASSING_ZONES': this.setupPassing(); break;
    }
  }

  abort(): void {
    if (!this.view.finished) this.finish();
  }

  dispose(): void {
    this.scrimmage.eventSink = null;
    this.scrimmage.externalMatchControl = false;
    this.scrimmage.clearSkillMarkers();
  }

  // --- shared helpers ---------------------------------------------------------

  /** Park every outfielder except the listed globals (GKs cannot be parked). */
  private parkExcept(keep: number[]): void {
    const keepSet = new Set(keep);
    for (const p of this.scrimmage.positionsSnapshot()) {
      if (p.role === 'GK' || keepSet.has(p.global)) continue;
      this.scrimmage.setSentOff(p.global);
    }
  }

  private addScore(points: number, message: string): void {
    this.view.score += points;
    this.view.stars = starsForScore(this.def, this.view.score);
    this.view.message = message;
  }

  private finish(): void {
    this.view.phase = 'FINISHED';
    this.view.finished = true;
    this.view.stars = starsForScore(this.def, this.view.score);
    this.scrimmage.clearSkillMarkers();
  }

  // --- Game 1: Moving Target Shooting ------------------------------------------

  private targetPos(): { y: number; z: number } {
    return {
      z: Math.sin(this.elapsed * 0.9) * 2.4,
      y: 1.15 + Math.sin(this.elapsed * 1.7) * 0.55,
    };
  }

  private setupShooting(): void {
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    this.parkExcept([HOME_ST]);
    sc.forceScenePlayer(HOME_ST, 30, 0);
    this.shotPhase = 'AIM';
    this.shotTimer = 0;
    this.view.message = 'Hit the moving bullseye! Finesse into a top corner pays +50.';
    this.view.subLabel = 'Shoot when the target crosses your side';
  }

  private shootingMarkers(): SkillMarker[] {
    const t = this.targetPos();
    return [{
      kind: 'TARGET', x: 52.35, y: t.y, z: t.z, radius: 0.55,
      color: '#22ff88', active: this.shotPhase === 'AIM', hit: false,
    }];
  }

  private resetShotAttempt(): void {
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    this.parkExcept([HOME_ST]);
    sc.forceScenePlayer(HOME_ST, 30, 0);
    this.shotPhase = 'AIM';
    this.shotTimer = 0;
  }

  private tickShooting(dt: number): void {
    const sc = this.scrimmage;
    const ball = sc.ball.state;
    if (this.shotPhase === 'AIM') {
      sc.activeTeamIndex = 9; // the striker is always your man here
      for (const e of this.eventQueue) {
        if (e.kind === 'SHOT' && e.side === 'HOME') {
          this.shotPhase = 'FLIGHT';
          this.shotTimer = 0;
          this.lastShotType = sc.renderState.shotType;
        }
      }
    } else if (this.shotPhase === 'FLIGHT') {
      this.shotTimer += dt;
      let resolved: string | null = null;
      if (ball.pos.x >= 52.3 && ball.pos.x < 54.5) {
        const t = this.targetPos();
        const d = Math.hypot(ball.pos.y - t.y, ball.pos.z - t.z);
        if (d <= 0.85) {
          const topCorner = Math.abs(t.z) > 2.0 && t.y > 1.55;
          const bonus = topCorner && this.lastShotType === 'FINESSE' ? 50 : 0;
          this.addScore(100 + bonus, bonus > 0 ? 'Top-corner finesse! +150' : 'Bullseye! +100');
          resolved = 'hit';
        } else if (ball.pos.z >= -3.66 && ball.pos.z <= 3.66 && ball.pos.y <= 2.44) {
          this.view.message = 'In the goal — but off the bullseye. No points.';
          resolved = 'goal-off-target';
        }
      }
      if (!resolved) {
        for (const e of this.eventQueue) {
          if (e.kind === 'GK_SAVE' && e.gkSide === 'AWAY') { this.view.message = 'Saved! The keeper read it.'; resolved = 'saved'; }
          if (e.kind === 'OUT_OF_PLAY') { this.view.message = 'Off target — no points.'; resolved = 'out'; }
          if (e.kind === 'GOAL') resolved = resolved ?? 'goal-off-target';
        }
      }
      if (!resolved && this.shotTimer > 6) { this.view.message = 'Chance gone.'; resolved = 'dead'; }
      if (resolved) {
        this.shotPhase = 'RESET';
        this.shotTimer = 0;
      }
    } else { // RESET — one beat, then a fresh ball at the striker's feet
      this.shotTimer += dt;
      if (this.shotTimer > 0.5) this.resetShotAttempt();
    }
    sc.setSkillMarkers(this.shootingMarkers());
  }

  // --- Game 2: Slalom Dribble Gates ---------------------------------------------

  private setupSlalom(): void {
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    this.gates = [
      { x: -28, z: -8 }, { x: -14, z: 8 }, { x: 0, z: -8 },
      { x: 14, z: 8 }, { x: 28, z: -8 }, { x: 40, z: 0 },
    ];
    this.gateIndex = 0;
    this.parkExcept([HOME_ST, 13, 14]);
    sc.forceMovePlayer(13, 2, 2);
    sc.forceMovePlayer(14, 24, -6);
    sc.forceScenePlayer(HOME_ST, -38, -8);
    this.prevBallX = -38;
    this.view.message = 'Weave through the glowing gates — green is next!';
    this.view.subLabel = 'Gate 1 of 6';
  }

  private slalomMarkers(): SkillMarker[] {
    const markers: SkillMarker[] = [];
    this.gates.forEach((g, i) => {
      const color = i < this.gateIndex ? '#64748b' : i === this.gateIndex ? '#a3e635' : '#22d3ee';
      for (const dz of [-1.6, 1.6]) {
        markers.push({
          kind: 'GATE', x: g.x, y: 0.1, z: g.z + dz, radius: 0.35,
          color, active: i === this.gateIndex, hit: i < this.gateIndex,
        });
      }
    });
    return markers;
  }

  private respawnSlalom(): void {
    const sc = this.scrimmage;
    const at = this.gateIndex === 0 ? { x: -38, z: -8 } : this.gates[this.gateIndex - 1]!;
    // kickoffReset also clears the engine's awaiting-restart flag, so the
    // next out-of-play is reported again.
    sc.kickoffReset('HOME');
    this.parkExcept([HOME_ST, 13, 14]);
    sc.forceMovePlayer(13, at.x + 16, 2);
    sc.forceMovePlayer(14, at.x + 30, -6);
    sc.forceScenePlayer(HOME_ST, at.x - 4, at.z);
    this.prevBallX = at.x - 4;
    this.view.combo = 0;
  }

  private tickSlalom(): void {
    const sc = this.scrimmage;
    sc.activeTeamIndex = 9;
    // A roaming defender winning the ball (or the ball leaving play) sends
    // the runner back to the last cleared gate.
    for (const e of this.eventQueue) {
      if (e.kind === 'RECEPTION' && e.side === 'AWAY') {
        this.view.message = 'Tackled! Ball back at the last gate.';
        this.respawnSlalom();
        sc.setSkillMarkers(this.slalomMarkers());
        return;
      }
      if (e.kind === 'OUT_OF_PLAY') {
        this.view.message = 'Out of play — ball back at the last gate.';
        this.respawnSlalom();
        sc.setSkillMarkers(this.slalomMarkers());
        return;
      }
    }
    const ball = sc.ball.state;
    const gate = this.gates[this.gateIndex];
    if (gate && sc.currentPossessionSide() === 'HOME') {
      if (this.prevBallX < gate.x && ball.pos.x >= gate.x && Math.abs(ball.pos.z - gate.z) <= 1.7) {
        this.gateIndex += 1;
        if (this.gateIndex >= this.gates.length) {
          this.addScore(150, 'Course complete! +150 — go again!');
          this.gateIndex = 0;
          sc.forceScenePlayer(HOME_ST, -38, -8);
          this.prevBallX = -38;
        } else {
          this.addScore(100, `Gate cleared! +100`);
          this.view.subLabel = `Gate ${this.gateIndex + 1} of 6`;
        }
      }
    }
    this.prevBallX = ball.pos.x;
    sc.setSkillMarkers(this.slalomMarkers());
  }

  // --- Game 3: Free-Kick Wall Master ----------------------------------------------

  private static FK_SPOTS = [
    { dist: 19, z: 0 }, { dist: 22, z: -6 }, { dist: 25, z: 5 }, { dist: 28, z: -3 }, { dist: 31, z: 7 },
  ];

  private setupFreeKick(): void {
    this.kickIndex = 0;
    this.setupFkAttempt();
    this.view.message = 'Bend it over the wall into the glowing corner!';
  }

  private setupFkAttempt(): void {
    const sc = this.scrimmage;
    const spot = SkillGamesEngine.FK_SPOTS[this.kickIndex]!;
    const ballX = 52.5 - spot.dist;
    const ballZ = spot.z;
    sc.kickoffReset('HOME');
    // Four-man wall, 9.15m in front of the ball on the goal line side.
    const placements = new Map<number, { x: number; z: number }>();
    [12, 13, 14, 15].forEach((g, i) => {
      placements.set(g, { x: ballX + 9.15, z: ballZ + (i - 1.5) * 0.85 });
    });
    sc.startSetPiece({
      type: 'FREE_KICK', side: 'HOME', ballX, ballZ,
      takerGlobal: HOME_ST, placements, origin: 'OPEN_PLAY',
    });
    this.fkPhase = 'AIM';
    this.fkTimer = 0;
    this.view.subLabel = `Kick ${this.kickIndex + 1} of 5 · ${spot.dist}m out`;
    const cornerZ = this.kickIndex % 2 === 0 ? 2.6 : -2.6;
    sc.setSkillMarkers([{
      kind: 'TARGET', x: 52.35, y: 1.7, z: cornerZ, radius: 0.8,
      color: '#f5c542', active: true, hit: false,
    }]);
  }

  private fkTargetZ(): number {
    return this.kickIndex % 2 === 0 ? 2.6 : -2.6;
  }

  private resolveFk(outcome: 'GOAL' | 'SAVED' | 'OUT' | 'DEAD'): void {
    const spot = SkillGamesEngine.FK_SPOTS[this.kickIndex]!;
    if (outcome === 'GOAL') {
      const ball = this.scrimmage.ball.state;
      const inZone = Math.sign(ball.pos.z || this.fkTargetZ()) === Math.sign(this.fkTargetZ()) && Math.abs(ball.pos.z) > 1.4;
      const points = 100 + (spot.dist - 19) * 4 + (inZone ? 40 : 0);
      this.addScore(points, inZone ? `Top-bin! +${points} (zone bonus)` : `Scored! +${points}`);
    } else if (outcome === 'SAVED') {
      this.addScore(30, 'On target — saved. +30');
    } else if (outcome === 'OUT') {
      this.view.message = 'Off target. No points.';
    } else {
      this.view.message = 'The wall did its job.';
    }
    this.fkPhase = 'NEXT';
    this.fkTimer = 0;
  }

  private tickFreeKick(dt: number): void {
    if (this.fkPhase === 'AIM') {
      this.fkTimer += dt;
      for (const e of this.eventQueue) {
        if (e.kind === 'SHOT' && e.side === 'HOME') { this.fkPhase = 'RESOLVING'; this.fkTimer = 0; }
      }
      if (this.fkTimer > 20) this.resolveFk('DEAD');
    } else if (this.fkPhase === 'RESOLVING') {
      this.fkTimer += dt;
      let done: 'GOAL' | 'SAVED' | 'OUT' | null = null;
      for (const e of this.eventQueue) {
        if (e.kind === 'GOAL' && e.scoringSide === 'HOME') done = 'GOAL';
        else if (e.kind === 'GK_SAVE' && e.gkSide === 'AWAY') done = 'SAVED';
        else if (e.kind === 'OUT_OF_PLAY') done = 'OUT';
      }
      if (done) this.resolveFk(done);
      else if (this.fkTimer > 8) this.resolveFk('DEAD');
    } else { // NEXT
      this.fkTimer += dt;
      if (this.fkTimer > 0.8) {
        this.kickIndex += 1;
        if (this.kickIndex >= SkillGamesEngine.FK_SPOTS.length) { this.finish(); return; }
        this.setupFkAttempt();
      }
    }
  }

  // --- Game 4: One-Touch Passing Zones ----------------------------------------------

  private setupPassing(): void {
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    this.parkExcept([HOME_ST, ...this.zoneGlobals]);
    sc.forceMovePlayer(6, 14, -12);
    sc.forceMovePlayer(8, 6, 16);
    sc.forceMovePlayer(10, 20, 10);
    sc.forceScenePlayer(HOME_ST, 0, 0);
    this.holder = HOME_ST;
    this.targetGlobal = 6;
    this.view.combo = 0;
    this.view.message = 'Find the highlighted man — one touch, keep it moving!';
    this.view.subLabel = 'Combo ×1';
  }

  private passingMarkers(): SkillMarker[] {
    const snapshot = this.scrimmage.positionsSnapshot();
    return this.zoneGlobals.map((g) => {
      const p = snapshot[g];
      return {
        kind: 'ZONE' as const, x: p?.x ?? 0, y: 0.08, z: p?.z ?? 0, radius: 2.3,
        color: g === this.targetGlobal ? '#a3e635' : '#475569',
        active: g === this.targetGlobal, hit: false,
      };
    });
  }

  private pickNextTarget(): void {
    const options = [...this.zoneGlobals, HOME_ST].filter((g) => g !== this.holder);
    this.targetGlobal = options[Math.floor(this.rng() * options.length)] ?? HOME_ST;
  }

  private resetPassingBall(): void {
    const sc = this.scrimmage;
    sc.kickoffReset('HOME');
    this.parkExcept([HOME_ST, ...this.zoneGlobals]);
    sc.forceMovePlayer(6, 14, -12);
    sc.forceMovePlayer(8, 6, 16);
    sc.forceMovePlayer(10, 20, 10);
    sc.forceScenePlayer(HOME_ST, 0, 0);
    this.holder = HOME_ST;
    this.view.combo = 0;
    this.pickNextTarget();
  }

  private tickPassing(dt: number): void {
    const sc = this.scrimmage;
    if (this.oneTouchDeadline > 0) {
      this.oneTouchDeadline -= dt;
      if (this.oneTouchDeadline <= 0 && sc.currentPossessionSide() === 'HOME') {
        // The holder dwelled on it — the combo dies, the chain restarts.
        if (this.view.combo > 0) this.view.message = 'Too slow on the release — combo reset!';
        this.view.combo = 0;
        this.oneTouchDeadline = -1;
      }
    }
    for (const e of this.eventQueue) {
      if (e.kind === 'PASS' && e.side === 'HOME') {
        this.lastPasser = e.passerGlobal;
        if (e.passerGlobal === this.holder) this.oneTouchDeadline = -1; // released in time
      }
      if (e.kind === 'RECEPTION' && e.side === 'HOME' && e.passerSide === 'HOME') {
        if (e.global === this.targetGlobal && this.lastPasser === this.holder) {
          this.view.combo += 1;
          const points = 50 * this.view.combo;
          this.holder = e.global;
          this.addScore(points, `One-touch! +${points} (combo ×${this.view.combo})`);
          this.view.subLabel = `Combo ×${this.view.combo + 1} next`;
          this.oneTouchDeadline = 1.4;
          this.pickNextTarget();
        } else if (e.global !== this.holder) {
          // A pass completed to the wrong man: chain restarts from him.
          this.holder = e.global;
          this.view.combo = 0;
          this.oneTouchDeadline = -1;
          this.pickNextTarget();
        }
      }
      if (e.kind === 'OUT_OF_PLAY') {
        this.view.message = 'Out of play — chain reset.';
        this.resetPassingBall();
      }
    }
    sc.setSkillMarkers(this.passingMarkers());
  }

  // --- Main step ----------------------------------------------------------------------

  step(dt: number, input: InputManager): void {
    const v = this.view;
    if (!this.started || v.finished) return;
    this.elapsed += dt;
    v.timeLeft = Math.max(0, v.timeLeft - dt);
    this.scrimmage.step(dt, input);
    switch (this.def.id) {
      case 'TARGET_SHOOTING': this.tickShooting(dt); break;
      case 'SLALOM_GATES': this.tickSlalom(); break;
      case 'FREE_KICK_WALL': this.tickFreeKick(dt); break;
      case 'PASSING_ZONES': this.tickPassing(dt); break;
    }
    this.eventQueue.length = 0;
    if (v.timeLeft <= 0 && !v.finished) this.finish();
  }
}

// ---------------------------------------------------------------------------
// Verification lab — star math plus a headless 20-second run of every game
// on its own engine instance: markers must publish, positions stay finite,
// and every session must reach FINISHED with a sane score.
// ---------------------------------------------------------------------------

export interface SkillLabResult {
  starsOk: boolean;
  gamesOk: boolean;
  scores: Record<string, number>;
  detail: string;
}

export function runSkillGamesLab(): SkillLabResult {
  const def = skillGameDef('TARGET_SHOOTING');
  const starsOk = starsForScore(def, 0) === 0 && starsForScore(def, 200) === 1
    && starsForScore(def, 420) === 2 && starsForScore(def, 640) === 3
    && skillRewards(def, 640).grant.coins > skillRewards(def, 0).grant.coins;

  const scores: Record<string, number> = {};
  let gamesOk = true;
  for (const game of SKILL_GAMES) {
    const nets = { left: null, right: null };
    const sc = new ScrimmageEngine(nets, { autonomousHome: true, seed: 1234 });
    const idle = new InputManager();
    const engine = new SkillGamesEngine(sc, game.id, { seed: 77, durationSec: 20 });
    engine.start();
    let guard = 0;
    let markersSeen = 0;
    let finite = true;
    while (!engine.view.finished && guard < 60 * 40) {
      engine.step(1 / 60, idle);
      guard += 1;
      if (sc.renderState.skillMarkers.length > 0) markersSeen = sc.renderState.skillMarkers.length;
      if (guard % 60 === 0) {
        const rs = sc.renderState;
        if (!Number.isFinite(rs.ballPos.x) || !Number.isFinite(rs.ballPos.z)) finite = false;
      }
    }
    scores[game.id] = engine.view.score;
    const ok = engine.view.finished && finite && engine.view.score >= 0
      && engine.view.stars >= 0 && engine.view.stars <= 3
      && (game.id === 'FREE_KICK_WALL' || markersSeen > 0);
    if (!ok) gamesOk = false;
    engine.dispose();
  }
  return {
    starsOk,
    gamesOk,
    scores,
    detail: SKILL_GAMES.map((g) => `${g.name.split(' ')[0]} ${scores[g.id] ?? 0}pts`).join(' · '),
  };
}
