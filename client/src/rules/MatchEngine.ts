// Striker FC — rules/MatchEngine.ts (Phase 05, Spec 06 §1)
// Master match state machine orchestrating the Phase 04 ScrimmageEngine:
// PRE_MATCH_INTRO → KICKOFF → IN_PLAY ⇄ set pieces → GOAL_CELEBRATION →
// GOAL_REPLAY (0.45x slow-mo, skippable) → HALF_TIME → second half →
// EXTRA_TIME → PENALTY_SHOOTOUT → FULL_TIME. Realistic added injury time
// and the authentic anti-whistle rule: never end a period while the ball is
// in a penalty box or a shot is in flight.

import { PITCH } from '../core/constants';
import { matchEventBus } from '../core/EventBus';
import { createVec3 } from '../core/math';
import type { TeamSide } from '../core/types';
import { InputManager, type GameAction } from '../controls/InputManager';
import { ScrimmageEngine, type ScrimmageRenderState, type SimEvent } from '../ai/ScrimmageEngine';
import { attackDirX, opponentGoalX } from '../ai/TacticalEngine';
import { OffsideEngine, type OffsideCall } from './OffsideEngine';
import {
AdvantageTracker, CardBook, evaluateTackle, isInPenaltyBox,
type CardKind,
} from './FoulAndCardEngine';
import { MatchStatsTracker, type MatchStatsSheet } from './MatchStatsTracker';
import { ReplayPlayback, ReplayRecorder, type ReplayFrame } from './ReplayRecorder';
import {
PenaltyShootout, planSetPiece,
type SetPiecePlan, type SetPieceType, type ShootoutStatus,
} from './SetPieceManager';

export type MatchState =
  | 'PRE_MATCH_INTRO' | 'KICKOFF' | 'IN_PLAY'
  | 'THROW_IN' | 'GOAL_KICK' | 'CORNER_KICK' | 'FREE_KICK' | 'PENALTY_KICK'
  | 'OFFSIDE_STOPPAGE' | 'GOAL_CELEBRATION' | 'GOAL_REPLAY'
  | 'HALF_TIME' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | 'FULL_TIME';

export interface MatchConfig {
  /** Real seconds per half: 180 (3 min, default), 240 or 360. */
  halfDurationSec: number;
  knockout: boolean;
  extraTimeEnabled: boolean;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  halfDurationSec: 180,
  knockout: true,
  extraTimeEnabled: true,
};

export interface PenaltyView {
  userAttacking: boolean;
  userDefending: boolean;
  aimZ: number;
  aimY: number;
}

export interface MatchView {
  state: MatchState;
  period: number;
  minute: number;
  addedMinutes: number;
  scoreHome: number;
  scoreAway: number;
  message: string;
  stats: MatchStatsSheet;
  setPieceType: SetPieceType | null;
  setPiecePrompt: string | null;
  userTakingSetPiece: boolean;
  wallCount: number;
  advantageSec: number;
  varActive: boolean;
  cardBanner: string | null;
  replayActive: boolean;
  replayAngle: 1 | 2;
  penalty: PenaltyView | null;
  shootout: ShootoutStatus | null;
  fullTime: boolean;
}

interface PenaltyContext {
  takingSide: TeamSide;
  takerGlobal: number;
  userAttacking: boolean;
  aimZ: number;
  aimY: number;
  userDive: { z: number; high: boolean } | null;
  struck: boolean;
  diveApplied: boolean;
  shootout: boolean;
}

const SET_PIECE_STATES: MatchState[] = ['THROW_IN', 'GOAL_KICK', 'CORNER_KICK', 'FREE_KICK', 'PENALTY_KICK'];

export class MatchEngine {
  /** Shared neutral input for frozen phases (celebration / VAR). */
  private static readonly IDLE_INPUT = new InputManager();
  readonly scrimmage: ScrimmageEngine;
  readonly stats = new MatchStatsTracker();
  readonly offside = new OffsideEngine();
  readonly cards = new CardBook();
  readonly advantage = new AdvantageTracker();
  readonly shootout = new PenaltyShootout();
  readonly recorder = new ReplayRecorder();
  readonly config: MatchConfig;
  readonly view: MatchView;

  state: MatchState = 'PRE_MATCH_INTRO';
  period: 1 | 2 | 3 = 1;
  scoreHome = 0;
  scoreAway = 0;

  private stateTimer = 2.5;
  private periodElapsedSec = 0;
  private stoppageSec = 0;
  private addedMinutes = 0;
  private addedComputed = false;
  private totalPlaySec = 0;
  private readonly eventQueue: SimEvent[] = [];
  private pendingPass: { side: TeamSide; passerGlobal: number } | null = null;
  private message = 'Welcome to Striker FC — the teams are coming out.';
  private cardBanner: string | null = null;
  private cardBannerTimer = 0;
  private varTimer = 0;
  private statsViewTimer = 0;
  private replay: ReplayPlayback | null = null;
  private replayTimer = 0;
  private replayFrame: ReplayFrame = {
    ballX: 0, ballY: 0.11, ballZ: 0,
    players: Array.from({ length: 22 }, () => ({ x: 0, z: 0, yaw: 0, anim: 'IDLE' as const })),
  };
  readonly replayRender: ScrimmageRenderState;
  private periodEndPending = false;
  private lastGoalScorerSide: TeamSide = 'HOME';
  private penalty: PenaltyContext | null = null;
  private shootoutPhase: 'AIM' | 'RESOLVING' = 'AIM';
  private shootoutResolveTimer = 0;
  private shootoutKickResult: boolean | null = null;
  private shootoutPauseTimer = 0;

  constructor(scrimmage: ScrimmageEngine, config: Partial<MatchConfig> = {}) {
    this.scrimmage = scrimmage;
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    this.reattach();
    this.replayRender = {
      enabled: true,
      ballPos: createVec3(0, 0.11, 0),
      ballVel: createVec3(),
      ballAngVel: createVec3(),
      shotInFlight: false,
      shotType: null,
      players: Array.from({ length: 22 }, () => ({ x: 0, z: 0, yaw: 0, speed: 0, anim: 'IDLE' as const, diveDir: 1, stamina: 1 })),
      activeGlobal: -1,
      secondPresserGlobal: -1,
      passTargetGlobal: -1,
      impactPulse: 0,
      goalPulse: 0,
      switchPulse: 0,
      containing: false,
      trajectory: null,
      offsideLineX: null,
      playerTemplateIds: scrimmage.renderState.playerTemplateIds,
      skillMarkers: [],
    };
    this.view = {
      state: this.state, period: 1, minute: 0, addedMinutes: 0,
      scoreHome: 0, scoreAway: 0, message: this.message,
      stats: this.stats.snapshot(),
      setPieceType: null, setPiecePrompt: null, userTakingSetPiece: false, wallCount: 0,
      advantageSec: 0, varActive: false, cardBanner: null,
      replayActive: false, replayAngle: 1, penalty: null, shootout: null, fullTime: false,
    };
  }

  /** (Re)bind this engine as the scrimmage's rules authority. */
  reattach(): void {
    this.scrimmage.externalMatchControl = true;
    this.scrimmage.eventSink = (e) => {
      // PASS is handled synchronously: the offside snapshot must capture the
      // exact frame-of-pass positions, mid-step.
      if (e.kind === 'PASS') this.onPassEvent(e);
      else this.eventQueue.push(e);
    };
  }

  /** Release the scrimmage back to standalone Phase 04 behaviour. */
  detach(): void {
    this.scrimmage.externalMatchControl = false;
    this.scrimmage.eventSink = null;
    // Clear any externally-managed freeze (goal / set piece) so standalone
    // scrimmage play can never soft-lock after a mode switch.
    this.scrimmage.kickoffReset('HOME');
  }

  // ---------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------

  get matchMinute(): number {
    const base = this.period === 1 ? 0 : this.period === 2 ? 45 : 90;
    const span = this.period === 3 ? 30 : 45;
    const dur = this.period === 3 ? this.config.halfDurationSec / 3 : this.config.halfDurationSec;
    return Math.min(base + span + this.addedMinutes, base + (this.periodElapsedSec / dur) * span);
  }

  private periodTargetSec(): number {
    const dur = this.period === 3 ? this.config.halfDurationSec / 3 : this.config.halfDurationSec;
    if (!this.addedComputed) return dur;
    return dur + this.addedMinutes * (dur / 45);
  }

  private maybeComputeAdded(): void {
    const dur = this.period === 3 ? this.config.halfDurationSec / 3 : this.config.halfDurationSec;
    if (!this.addedComputed && this.periodElapsedSec >= dur) {
      this.addedMinutes = Math.max(1, Math.min(5, 1 + Math.floor(this.stoppageSec / 20)));
      this.addedComputed = true;
      this.setMessage(`The fourth official shows +${this.addedMinutes} minutes of added time.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Input routing (penalty strikes are confirmed here, everything else plays)
  // ---------------------------------------------------------------------------

  handleAction(action: GameAction): void {
    if ((this.state === 'PENALTY_KICK' || this.state === 'PENALTY_SHOOTOUT')
      && this.penalty?.userAttacking && !this.penalty.struck && action.kind === 'SHOOT') {
      this.confirmPenalty(action.power);
      return;
    }
    this.scrimmage.queueAction(action);
  }

  setPenaltyAim(aimZ: number, aimY: number): void {
    if (!this.penalty) return;
    this.penalty.aimZ = Math.max(-4.1, Math.min(4.1, aimZ));
    this.penalty.aimY = Math.max(0.2, Math.min(2.6, aimY));
  }

  setUserDive(z: number, high: boolean): void {
    if (!this.penalty || this.penalty.struck) return;
    this.penalty.userDive = { z, high };
    this.setMessage(high ? 'GK dives high!' : 'GK dives low!');
  }

  confirmPenalty(power = 0.82): boolean {
    const p = this.penalty;
    if (!p || p.struck || !p.userAttacking) return false;
    const ok = this.scrimmage.penaltyStrike(p.takerGlobal, p.aimZ, p.aimY, power);
    if (ok) {
      p.struck = true;
      if (this.state === 'PENALTY_KICK') this.state = 'IN_PLAY';
      if (this.state === 'PENALTY_SHOOTOUT') this.beginShootoutResolution();
    }
    return ok;
  }

  skipReplay(): void {
    if (this.state === 'GOAL_REPLAY') this.postGoal();
  }

  /** P1-4: the manager's half-time button — end the break now. */
  startSecondHalf(): void {
    if (this.state === 'HALF_TIME') this.stateTimer = Math.min(this.stateTimer, 0.05);
  }

  /** Phase 06 pause menu: forfeit ends the match now; the score stands. */
  forfeit(): void {
    if (this.state === 'FULL_TIME') return;
    this.state = 'FULL_TIME';
    this.setMessage(`FULL TIME — match forfeited. The ${this.scoreHome}–${this.scoreAway} score stands.`);
    this.syncView();
  }

  // ---------------------------------------------------------------------------
  // Main step
  // ---------------------------------------------------------------------------

  step(dt: number, input: InputManager): void {
    if (this.cardBannerTimer > 0) {
      this.cardBannerTimer -= dt;
      if (this.cardBannerTimer <= 0) this.cardBanner = null;
    }
    switch (this.state) {
      case 'PRE_MATCH_INTRO':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'KICKOFF';
          this.stateTimer = 0.9;
          matchEventBus.emit('MATCH_KICKOFF', { period: this.period });
        }
        break;
      case 'KICKOFF':
        this.scrimmage.step(dt, input);
        this.recordFrame();
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'IN_PLAY';
          this.setMessage(this.period === 1 ? 'Kickoff — the match is under way!' : 'Back under way!');
        }
        break;
      case 'IN_PLAY':
      case 'THROW_IN':
      case 'GOAL_KICK':
      case 'CORNER_KICK':
      case 'FREE_KICK':
        this.stepPlay(dt, input);
        break;
      case 'PENALTY_KICK':
        this.stepPenalty(dt, input);
        break;
      case 'OFFSIDE_STOPPAGE':
        // Epic P0-7: VAR freezes play — the sim does NOT step with live
        // input (or at all) during the check, so nothing can be scored or
        // moved while the lines are drawn, and no frames are recorded.
        this.varTimer -= dt;
        this.stoppageSec += dt;
        if (this.varTimer <= 0) {
          this.scrimmage.renderState.offsideLineX = null;
          const call = this.offside.lastCall;
          if (call) {
            matchEventBus.emit('VAR_DECISION', { decision: 'Offside confirmed — indirect free kick' });
            const defendingSide: TeamSide = this.offsideSnapshotSide() ?? 'HOME';
            this.awardFreeKick(defendingSide, { x: call.spotX, z: call.spotZ }, true);
          } else {
            this.state = 'IN_PLAY';
          }
        }
        break;
      case 'GOAL_CELEBRATION':
        // Epic P0-5: live input is frozen (neutral input only — the user
        // watches the celebration), and frames are NOT recorded: the
        // replay must show the 5 s BEFORE the goal, not the walk-back.
        this.scrimmage.step(dt, MatchEngine.IDLE_INPUT);
        this.stoppageSec += dt;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          const frames = this.recorder.orderedFrames();
          if (frames.length >= 40) {
            this.replay = new ReplayPlayback(frames);
            this.replayTimer = 0;
            this.state = 'GOAL_REPLAY';
            this.setMessage('REPLAY — slow motion, 0.45x. Tap to skip.');
          } else {
            this.postGoal();
          }
        }
        break;
      case 'GOAL_REPLAY': {
        this.stoppageSec += dt;
        this.replayTimer += dt;
        if (this.replay) {
          const sampled = this.replay.sample(this.replayTimer, this.replayFrame);
          if (sampled) this.publishReplayFrame();
          if (this.replay.isFinished(this.replayTimer)) this.postGoal();
        } else {
          this.postGoal();
        }
        break;
      }
      case 'HALF_TIME':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.period = 2;
          this.resetPeriodClock();
          this.scrimmage.kickoffReset('AWAY');
          this.state = 'KICKOFF';
          this.stateTimer = 0.9;
          matchEventBus.emit('MATCH_KICKOFF', { period: 2 });
          this.setMessage('Second half — AWAY to kick off.');
        }
        break;
      case 'EXTRA_TIME':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.period = 3;
          this.resetPeriodClock();
          this.scrimmage.kickoffReset('HOME');
          this.state = 'KICKOFF';
          this.stateTimer = 0.9;
          matchEventBus.emit('MATCH_KICKOFF', { period: 3 });
          this.setMessage('Extra time — 30 minutes to find a winner.');
        }
        break;
      case 'PENALTY_SHOOTOUT':
        this.stepShootout(dt, input);
        break;
      case 'FULL_TIME':
        break;
    }
    this.syncView();
  }

  private resetPeriodClock(): void {
    this.periodElapsedSec = 0;
    this.stoppageSec = 0;
    this.addedMinutes = 0;
    this.addedComputed = false;
    this.periodEndPending = false;
  }

  private stepPlay(dt: number, input: InputManager): void {
    this.scrimmage.step(dt, input);
    this.recordFrame();
    this.totalPlaySec += dt;
    this.processEvents();
    if (this.state !== 'IN_PLAY' && !SET_PIECE_STATES.includes(this.state)) return;

    // Possession + clock.
    this.stats.tickPossession(dt, this.scrimmage.currentPossessionSide());
    this.periodElapsedSec += dt;
    if (this.state !== 'IN_PLAY') this.stoppageSec += dt;
    this.maybeComputeAdded();

    // Advantage window.
    if (this.advantage.isActive) {
      const outcome = this.advantage.update(this.scrimmage.currentPossessionSide(), this.totalPlaySec);
      // update() clears the tracker; the foul data rides lastAdvantageFoul.
      const data = this.lastAdvantageFoul;
      if (outcome === 'PULL_BACK' && data) {
        this.applyCard(data.foulerGlobal, data.foulerSide, data.card, data.cardReason, data.pos);
        this.awardFreeKick(data.victimSide, data.pos, false);
        this.setMessage('No advantage — play is pulled back for the free kick.');
        this.lastAdvantageFoul = null;
      } else if (outcome === 'BENEFIT_KEPT') {
        if (data && data.card !== 'NONE') {
          this.applyCard(data.foulerGlobal, data.foulerSide, data.card, data.cardReason, data.pos);
        }
        this.setMessage('Advantage played — the attack keeps flowing.');
        this.lastAdvantageFoul = null;
      }
      if (outcome !== 'PLAYING_ON' && this.queuedFouls.length > 0) {
        const queued = this.queuedFouls;
        this.queuedFouls = [];
        for (const q of queued) this.processFoul(q);
      }
    }

    // Offside: expiry + active-involvement interference while the ball is live.
    this.offside.clearIfExpired(this.totalPlaySec);
    if (this.offside.hasActiveSnapshot && this.scrimmage.ball.state.ownerId === null) {
      const snap = this.offside.activeSnapshot!;
      const positions = this.scrimmage.positionsSnapshot();
      const attackers = positions.filter((p) => p.side === snap.attackingSide && !p.sentOff);
      const defenders = positions.filter((p) => p.side !== snap.attackingSide && !p.sentOff);
      const call = this.offside.checkInterference(attackers, defenders, this.scrimmage.ball.state.pos);
      if (call) this.doOffsideStoppage(call, snap.attackingSide);
    }

    // Set piece delivered → open play resumes.
    if (SET_PIECE_STATES.includes(this.state) && this.state !== 'PENALTY_KICK'
      && this.scrimmage.currentSetPiece === null) {
      this.state = 'IN_PLAY';
    }

    // Period end — with the anti-whistle rule.
    if (this.state === 'IN_PLAY' && this.periodElapsedSec >= this.periodTargetSec()) {
      const ball = this.scrimmage.ball.state;
      const inBox = Math.abs(ball.pos.x) > PITCH.HALF_LENGTH - PITCH.PENALTY_AREA_LENGTH;
      if (!ball.shotInFlight && !inBox) this.endPeriod();
      else this.periodEndPending = true;
    }
  }

  private stepPenalty(dt: number, input: InputManager): void {
    this.scrimmage.step(dt, input);
    this.recordFrame();
    this.totalPlaySec += dt;
    this.stoppageSec += dt;
    this.processEvents();
    const p = this.penalty;
    if (!p) { this.state = 'IN_PLAY'; return; }
    if (!p.struck && this.scrimmage.ball.state.ownerId === null && this.scrimmage.ball.speed() > 3) {
      p.struck = true; // AI taker struck via the set-piece timer
    }
    if (p.struck && !p.diveApplied && p.userDive) {
      const defSide: TeamSide = p.takingSide === 'HOME' ? 'AWAY' : 'HOME';
      this.scrimmage.forceGkDive(defSide, p.userDive.z, p.userDive.high);
      p.diveApplied = true;
    }
    if (p.struck) {
      // Rebound is live: normal open-play event processing takes over.
      this.penalty = null;
      this.state = 'IN_PLAY';
    }
  }

  // ---------------------------------------------------------------------------
  // Events from the simulation
  // ---------------------------------------------------------------------------

  private onPassEvent(e: Extract<SimEvent, { kind: 'PASS' }>): void {
    this.stats.recordPassAttempt(e.side);
    this.pendingPass = { side: e.side, passerGlobal: e.passerGlobal };
    const positions = this.scrimmage.positionsSnapshot();
    const defenders = positions
      .filter((p) => p.side !== e.side && !p.sentOff)
      .map((p) => ({ global: p.global, x: p.x, z: p.z }));
    const attackers = positions
      .filter((p) => p.side === e.side && !p.sentOff)
      .map((p) => ({ global: p.global, x: p.x, z: p.z }));
    this.offside.onPass({
      attackingSide: e.side,
      passerGlobal: e.passerGlobal,
      ballX: e.ballX,
      defenders,
      attackers,
      origin: e.origin,
      nowSec: this.totalPlaySec,
    });
  }

  private processEvents(): void {
    while (this.eventQueue.length > 0) {
      const e = this.eventQueue.shift()!;
      switch (e.kind) {
        case 'RECEPTION': {
          // Second touch: an indirect free kick is now live for everyone.
          if (this.indirectFk && e.global !== this.indirectFk.takerGlobal) this.indirectFk = null;
          if (this.pendingPass && e.passerSide === e.side && e.passerGlobal >= 0 && e.passerGlobal !== e.global) {
            this.stats.recordPassComplete(e.side);
          }
          this.pendingPass = null;
          const snap = this.offside.activeSnapshot;
          if (snap) {
            if (e.side === snap.attackingSide) {
              const pos = this.scrimmage.positionsSnapshot()[e.global];
              const call = pos ? this.offside.checkTouch(e.global, pos) : null;
              if (call && this.state === 'IN_PLAY') this.doOffsideStoppage(call, snap.attackingSide);
            } else {
              this.offside.clear(); // defence deliberately played it
            }
          }
          break;
        }
        case 'SHOT':
          if (this.state !== 'PENALTY_SHOOTOUT') {
            this.stats.recordShot(e.side, e.x, e.z, e.xg, Math.max(1, Math.floor(this.matchMinute) + 1));
          }
          break;
        case 'GOAL': {
          if (this.state === 'PENALTY_SHOOTOUT') {
            if (this.shootoutKickResult === null) this.shootoutKickResult = true;
            break;
          }
          // Epic P0-7: a goal scored directly from an indirect free kick
          // (by the taker, before any second touch) does not count —
          // goal kick to the defending side instead.
          if (this.indirectFk && e.scorerGlobal === this.indirectFk.takerGlobal) {
            const defSide: TeamSide = this.indirectFk.side === 'HOME' ? 'AWAY' : 'HOME';
            this.indirectFk = null;
            this.stats.resolveOldestShot(e.scoringSide, 'OFF_TARGET');
            this.setMessage('NO GOAL — scored directly from an indirect free kick. Goal kick.');
            matchEventBus.emit('WHISTLE', { pattern: 'DISALLOWED' });
            this.startRestart('GOAL_KICK', defSide, 0, 0);
            break;
          }
          this.indirectFk = null;
          if (e.scoringSide === 'HOME') this.scoreHome += 1; else this.scoreAway += 1;
          this.stats.recordGoal(e.scoringSide, e.scorerGlobal);
          this.stats.resolveOldestShot(e.scoringSide, 'GOAL');
          this.lastGoalScorerSide = e.scoringSide;
          if (this.periodElapsedSec >= this.periodTargetSec()) this.periodEndPending = true;
          this.state = 'GOAL_CELEBRATION';
          this.stateTimer = 2.5;
          matchEventBus.emit('GOAL_CELEBRATION', {
            scoringSide: e.scoringSide,
            scorerId: this.scrimmage.templateOf(e.scorerGlobal)?.id ?? 'unknown',
          });
          this.setMessage(`GOAL! ${this.scrimmage.playerName(e.scorerGlobal)} scores — ${this.scoreHome}–${this.scoreAway}.`);
          matchEventBus.emit('CROWD_EXCITEMENT', { level: 0.95 });
          break;
        }
        case 'GK_SAVE':
          this.stats.recordSave(e.gkSide);
          if (this.state === 'PENALTY_SHOOTOUT') {
            if (this.shootoutKickResult === null) this.shootoutKickResult = false;
          } else {
            this.stats.resolveOldestShot(e.shooterSide, 'SAVED');
          }
          break;
        case 'TACKLE_FOUL_CANDIDATE':
          if (this.state === 'IN_PLAY') this.processFoul(e);
          break;
        case 'OUT_OF_PLAY': {
          if (this.state === 'PENALTY_SHOOTOUT') {
            if (this.shootoutKickResult === null) this.shootoutKickResult = false;
            break;
          }
          if (this.state !== 'IN_PLAY') break;
          this.pendingPass = null;
          this.offside.clear();
          if (e.restart === 'CORNER') this.stats.recordCorner(e.awardSide);
          if (e.restart === 'GOAL_KICK') {
            const shooterSide: TeamSide = e.awardSide === 'HOME' ? 'AWAY' : 'HOME';
            this.stats.resolveOldestShot(shooterSide, 'OFF_TARGET');
          }
          this.startRestart(e.restart, e.awardSide, e.exitX, e.exitZ);
          break;
        }
        case 'PASS':
          break; // handled synchronously in the sink
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fouls, cards, advantage
  // ---------------------------------------------------------------------------

  private lastAdvantageFoul: {
    foulerGlobal: number; foulerSide: TeamSide; victimSide: TeamSide;
    pos: { x: number; z: number }; card: CardKind; cardReason: string;
  } | null = null;

  /** IFAB DOGSO — all four factors must hold: (1) distance to goal is
   *  short (~25 m), (2) the victim is moving toward goal, (3) the victim
   *  has (or would clearly gain) control of the ball, (4) no covering
   *  defender — the GK counts as cover only when positioned to intervene. */
  private computeDogso(e: Extract<SimEvent, { kind: 'TACKLE_FOUL_CANDIDATE' }>): boolean {
    const positions = this.scrimmage.positionsSnapshot();
    const fouler = positions[e.tacklerGlobal];
    const victim = positions[e.victimGlobal];
    if (!fouler || !victim || fouler.sentOff) return false;
    const goalX = opponentGoalX(victim.side);
    // (1) Distance.
    if (Math.abs(goalX - e.x) > 25) return false;
    // (2) Direction: play must be moving toward goal — the ball's travel
    //     (or the victim's dribble line) points at the goal, not across it.
    const ball = this.scrimmage.ball.state.pos;
    const ballVel = this.scrimmage.ball.state.vel;
    const towardGoal = ballVel.x * Math.sign(goalX - ball.x) > -0.5
      && Math.abs(e.z) < 20; // central-ish lane, not out by the corner flag
    // (3) Likelihood of control: the victim is the carrier (ball at his
    //     feet) or close enough to take it without breaking stride.
    const ballNearVictim = Math.hypot(ball.x - victim.x, ball.z - victim.z) < 1.5;
    if (!towardGoal || !ballNearVictim) return false;
    // (4) Cover: any defender (incl. GK) between the victim and the goal
    //     who can intervene denies the "obvious" part.
    const toward = Math.sign(goalX - e.x);
    let cover = 0;
    for (const p of positions) {
      if (p.side !== fouler.side || p.global === e.tacklerGlobal || p.sentOff) continue;
      if ((p.x - e.x) * toward > 0.5) cover += 1;
    }
    return cover === 0;
  }

  /** Epic P0-7: fouls that arrive during an advantage window are queued
   *  and evaluated when the advantage resolves — never swallowed. */
  private queuedFouls: Extract<SimEvent, { kind: 'TACKLE_FOUL_CANDIDATE' }>[] = [];
  /** Epic P0-7: an indirect free kick waiting for its second touch. */
  private indirectFk: { side: TeamSide; takerGlobal: number } | null = null;

  processFoul(e: Extract<SimEvent, { kind: 'TACKLE_FOUL_CANDIDATE' }>): void {
    if (this.advantage.isActive) { this.queuedFouls.push(e); return; }
    const positions = this.scrimmage.positionsSnapshot();
    const fouler = positions[e.tacklerGlobal];
    const victim = positions[e.victimGlobal];
    if (!fouler || !victim || fouler.sentOff) return;
    const foulerSide = fouler.side;
    const victimSide = victim.side;
    const verdict = evaluateTackle({
      touchedBallFirst: e.touchedBallFirst,
      closingSpeed: e.closingSeverity * 15,
      behindDot: e.behindDot,
      isSlide: e.tackleKind === 'SLIDE',
      aggressionMult: 1,
      isDogso: this.computeDogso(e),
      inPenaltyBox: isInPenaltyBox({ x: e.x, z: e.z }, foulerSide),
    });
    if (!verdict.isFoul) return;
    this.stats.recordFoul(foulerSide);
    const pos = { x: e.x, z: e.z };
    const inBox = isInPenaltyBox(pos, foulerSide);
    if (inBox) {
      this.applyCard(e.tacklerGlobal, foulerSide, verdict.card, verdict.reason, pos, e.victimGlobal);
      this.awardPenalty(victimSide);
      return;
    }
    if (verdict.card === 'RED') {
      this.applyCard(e.tacklerGlobal, foulerSide, verdict.card, verdict.reason, pos, e.victimGlobal);
      this.awardFreeKick(victimSide, pos, false);
      return;
    }
    // Advantage: victim's team keeps the ball in an attacking zone.
    const possession = this.scrimmage.currentPossessionSide();
    const dir = attackDirX(victimSide);
    const attackingZone = this.scrimmage.ball.state.pos.x * dir > -6;
    if (possession === victimSide && attackingZone) {
      this.lastAdvantageFoul = {
        foulerGlobal: e.tacklerGlobal, foulerSide, victimSide, pos,
        card: verdict.card, cardReason: verdict.reason,
      };
      this.advantage.start({
        foulerGlobal: e.tacklerGlobal, victimGlobal: e.victimGlobal, victimSide,
        pos, card: verdict.card, cardReason: verdict.reason,
      }, this.totalPlaySec);
      this.setMessage('ADVANTAGE — the referee plays on for 3.5 seconds.');
      return;
    }
    this.applyCard(e.tacklerGlobal, foulerSide, verdict.card, verdict.reason, pos, e.victimGlobal);
    this.awardFreeKick(victimSide, pos, false);
  }

  /** Lab hook: run a synthetic foul candidate through the real foul pipeline. */
  debugFoulCandidate(e: Extract<SimEvent, { kind: 'TACKLE_FOUL_CANDIDATE' }>): void {
    this.processFoul(e);
  }

  private applyCard(
    global: number, side: TeamSide, card: CardKind, reason: string,
    pos?: { x: number; z: number }, victimGlobal?: number,
  ): void {
    if (card === 'NONE') return;
    const ev = this.cards.record(global, side, card, reason);
    if (!ev) return;
    this.stats.recordCard(side, ev.card === 'RED' ? 'RED' : 'YELLOW');
    const name = this.scrimmage.playerName(global);
    if (ev.sentOff) {
      this.scrimmage.setSentOff(global);
      this.cardBanner = `RED CARD — ${name} is sent off! ${reason}`;
      this.setMessage(`${name} is sent off — ${side} play with 10 men. ${reason}`);
    } else {
      this.cardBanner = `YELLOW CARD — ${name}. ${reason}`;
      this.setMessage(`${name} is booked. ${reason}`);
    }
    this.cardBannerTimer = 3.2;
    matchEventBus.emit('FOUL_COMMITTED', {
      foulerId: this.scrimmage.templateOf(global)?.id ?? 'unknown',
      victimId: victimGlobal !== undefined ? (this.scrimmage.templateOf(victimGlobal)?.id ?? 'unknown') : 'unknown',
      card: ev.card,
      isPenalty: false,
      position: createVec3(pos?.x ?? 0, 0, pos?.z ?? 0),
    });
    matchEventBus.emit('CARD_SHOWN', {
      playerId: this.scrimmage.templateOf(global)?.id ?? 'unknown',
      card: ev.card === 'RED' ? 'RED' : 'YELLOW',
      reason,
    });
    matchEventBus.emit('WHISTLE', { pattern: ev.card === 'RED' ? 'RED' : 'YELLOW' });
  }

  // ---------------------------------------------------------------------------
  // Set pieces & restarts
  // ---------------------------------------------------------------------------

  private bestTaker(side: TeamSide, score: (sub: {
    curve: number; longPassing: number; finishing: number; crossing: number; shotPower: number;
  }) => number): number {
    const positions = this.scrimmage.positionsSnapshot();
    let best = -1;
    let bestScore = -Infinity;
    for (const p of positions) {
      if (p.side !== side || p.sentOff || p.role === 'GK') continue;
      const tpl = this.scrimmage.templateOf(p.global);
      if (!tpl) continue;
      const s = score(tpl.subStats);
      if (s > bestScore) { bestScore = s; best = p.global; }
    }
    if (best < 0) {
      const any = positions.find((p) => p.side === side && !p.sentOff);
      best = any ? any.global : 0;
    }
    return best;
  }

  private nearestOutfielder(side: TeamSide, x: number, z: number): number {
    const positions = this.scrimmage.positionsSnapshot();
    let best = -1;
    let bestD = Infinity;
    for (const p of positions) {
      if (p.side !== side || p.sentOff || p.role === 'GK') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p.global; }
    }
    return best >= 0 ? best : this.bestTaker(side, () => 0);
  }

  private startRestart(restart: 'THROW_IN' | 'GOAL_KICK' | 'CORNER', side: TeamSide, exitX: number, exitZ: number): void {
    const type: SetPieceType = restart === 'THROW_IN' ? 'THROW_IN' : restart === 'GOAL_KICK' ? 'GOAL_KICK' : 'CORNER';
    const plan = planSetPiece({ type, side, ballX: exitX, ballZ: exitZ });
    this.currentPlan = plan;
    if (restart === 'THROW_IN') {
      const taker = this.nearestOutfielder(side, exitX, exitZ);
      const bx = Math.max(-50, Math.min(50, exitX));
      const bz = Math.sign(exitZ || 1) * (PITCH.HALF_WIDTH - 0.5);
      this.scrimmage.startSetPiece({ type, side, ballX: bx, ballZ: bz, takerGlobal: taker, origin: 'THROW_IN' });
      this.state = 'THROW_IN';
      this.setMessage(`Throw-in to ${side} — ${this.scrimmage.playerName(taker)} restarts play.`);
    } else if (restart === 'GOAL_KICK') {
      const positions = this.scrimmage.positionsSnapshot();
      const gk = positions.find((p) => p.side === side && p.role === 'GK');
      const taker = gk ? gk.global : this.bestTaker(side, (s) => s.longPassing);
      this.scrimmage.startSetPiece({
        type, side, ballX: plan.ballX, ballZ: plan.ballZ, takerGlobal: taker, origin: 'GOAL_KICK',
      });
      this.state = 'GOAL_KICK';
      this.setMessage(`Goal kick — ${side} restart from the 6-yard box.`);
    } else {
      const taker = this.bestTaker(side, (s) => s.crossing + s.curve);
      const placements = new Map<number, { x: number; z: number }>();
      const attackers = this.scrimmage.positionsSnapshot()
        .filter((p) => p.side === side && !p.sentOff && p.role !== 'GK' && p.global !== taker)
        .sort((a, b) => {
          const ta = this.scrimmage.templateOf(a.global);
          const tb = this.scrimmage.templateOf(b.global);
          return (tb?.subStats.headingAccuracy ?? 0) - (ta?.subStats.headingAccuracy ?? 0);
        })
        .slice(0, 5);
      attackers.forEach((p, i) => {
        const spot = plan.boxSpots[i];
        if (spot) placements.set(p.global, spot);
      });
      this.scrimmage.startSetPiece({
        type, side, ballX: plan.ballX, ballZ: plan.ballZ, takerGlobal: taker,
        placements, origin: 'CORNER',
      });
      this.state = 'CORNER_KICK';
      this.setMessage(`Corner to ${side} — five attackers flood the box!`);
    }
  }

  private awardFreeKick(side: TeamSide, pos: { x: number; z: number }, indirect: boolean): void {
    const bx = Math.max(-50, Math.min(50, pos.x));
    const bz = Math.max(-32, Math.min(32, pos.z));
    const taker = this.bestTaker(side, (s) => s.curve * 1.4 + s.longPassing);
    const tpl = this.scrimmage.templateOf(taker);
    const plan = planSetPiece({
      type: 'FREE_KICK', side, ballX: bx, ballZ: bz,
      deadBallSpecialist: tpl?.playStyles.includes('DEAD_BALL_SPECIALIST') ?? false,
    });
    const placements = new Map<number, { x: number; z: number }>();
    if (plan.wallCount > 0) {
      const defSide: TeamSide = side === 'HOME' ? 'AWAY' : 'HOME';
      const defenders = this.scrimmage.positionsSnapshot()
        .filter((p) => p.side === defSide && !p.sentOff && p.role !== 'GK')
        .sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz))
        .slice(0, plan.wallCount);
      defenders.forEach((p, i) => {
        const w = plan.wallPositions[i];
        if (w) placements.set(p.global, w);
      });
    }
    this.scrimmage.startSetPiece({
      type: 'FREE_KICK', side, ballX: bx, ballZ: bz, takerGlobal: taker,
      placements, origin: 'FREE_KICK', indirect,
    });
    // Epic P0-7: while an indirect FK awaits its second touch, a direct
    // goal by the taker is disallowed (handled in the GOAL event).
    this.indirectFk = indirect ? { side, takerGlobal: taker } : null;
    this.scrimmage.renderState.trajectory = plan.directShot && !indirect ? plan.trajectoryPreview : null;
    this.currentPlan = plan;
    this.state = 'FREE_KICK';
    this.setMessage(indirect
      ? `Indirect free kick to ${side} for offside.`
      : `${plan.prompt} ${this.scrimmage.playerName(taker)} over the ball.`);
  }

  private currentPlan: SetPiecePlan | null = null;

  private awardPenalty(side: TeamSide): void {
    matchEventBus.emit('PENALTY_AWARDED', { side });
    matchEventBus.emit('WHISTLE', { pattern: 'PENALTY' });
    const plan = planSetPiece({ type: 'PENALTY', side, ballX: 0, ballZ: 0 });
    const taker = this.bestTaker(side, (s) => s.finishing * 1.3 + s.shotPower * 0.4);
    this.scrimmage.startSetPiece({
      type: 'PENALTY', side, ballX: plan.ballX, ballZ: plan.ballZ, takerGlobal: taker, origin: 'PENALTY',
    });
    this.penalty = {
      takingSide: side,
      takerGlobal: taker,
      userAttacking: side === 'HOME' && !this.scrimmage.autonomousHome,
      aimZ: 1.9, aimY: 0.6,
      userDive: null, struck: false, diveApplied: false, shootout: false,
    };
    this.currentPlan = plan;
    this.state = 'PENALTY_KICK';
    this.setMessage(`PENALTY! ${this.scrimmage.playerName(taker)} steps up for ${side}.`);
  }

  // ---------------------------------------------------------------------------
  // Offside stoppage
  // ---------------------------------------------------------------------------

  private lastOffsideAttackingSide: TeamSide = 'HOME';

  private offsideSnapshotSide(): TeamSide | null {
    return this.lastOffsideAttackingSide === 'HOME' ? 'AWAY' : 'HOME';
  }

  private doOffsideStoppage(call: OffsideCall, attackingSide: TeamSide): void {
    this.lastOffsideAttackingSide = attackingSide;
    this.stats.recordOffside(attackingSide);
    this.pendingPass = null;
    const line = this.offside.varLineData();
    if (line) this.scrimmage.renderState.offsideLineX = line.lineX;
    this.varTimer = 2.2;
    this.state = 'OFFSIDE_STOPPAGE';
    this.setMessage(`OFFSIDE! VAR line shows ${this.scrimmage.playerName(call.offenderGlobal)} beyond the second-to-last defender.`);
    matchEventBus.emit('OFFSIDE_CALLED', {
      offendingPlayerId: this.scrimmage.templateOf(call.offenderGlobal)?.id ?? 'unknown',
      offsideLineX: call.lineX,
      attackerX: call.attackerX,
    });
  }

  // ---------------------------------------------------------------------------
  // Goal → celebration → replay → kickoff / period end
  // ---------------------------------------------------------------------------

  private postGoal(): void {
    this.replay = null;
    if (this.periodEndPending) {
      this.periodEndPending = false;
      this.endPeriod();
      return;
    }
    const conceding: TeamSide = this.lastGoalScorerSide === 'HOME' ? 'AWAY' : 'HOME';
    this.scrimmage.kickoffReset(conceding);
    this.state = 'KICKOFF';
    this.stateTimer = 0.9;
    matchEventBus.emit('MATCH_KICKOFF', { period: this.period });
    this.setMessage(`Kickoff — ${conceding} restart from the centre spot.`);
  }

  private endPeriod(): void {
    // Epic P0-7: a card earned during advantage is applied BEFORE the
    // period ends — the whistle does not erase it.
    if (this.lastAdvantageFoul && this.lastAdvantageFoul.card !== 'NONE') {
      const d = this.lastAdvantageFoul;
      this.applyCard(d.foulerGlobal, d.foulerSide, d.card, d.cardReason, d.pos);
    }
    this.lastAdvantageFoul = null;
    this.queuedFouls = [];
    this.advantage.cancel();
    this.offside.clear();
    this.pendingPass = null;
    this.scrimmage.renderState.offsideLineX = null;
    this.scrimmage.renderState.trajectory = null;
    if (this.period === 1) {
      this.state = 'HALF_TIME';
      // P1-4: half time is a real break now — the stats screen shows, subs
      // can be made from the pause menu, and legs recover a little. The
      // manager starts the second half with the button (or waits it out).
      this.stateTimer = 45;
      this.scrimmage.halfTimeRecovery();
      this.setMessage(`Half time — ${this.scoreHome}–${this.scoreAway}.`);
      matchEventBus.emit('HALF_TIME', { homeScore: this.scoreHome, awayScore: this.scoreAway });
      matchEventBus.emit('WHISTLE', { pattern: 'HALF_TIME' });
      return;
    }
    if (this.period === 2) {
      const drawn = this.scoreHome === this.scoreAway;
      if (drawn && this.config.knockout && this.config.extraTimeEnabled) {
        this.state = 'EXTRA_TIME';
        this.stateTimer = 3;
        this.setMessage('Level at 90 minutes — extra time to come.');
        return;
      }
      if (drawn && this.config.knockout) {
        this.enterShootout();
        return;
      }
      this.finishMatch();
      return;
    }
    // Extra time over.
    if (this.scoreHome === this.scoreAway && this.config.knockout) {
      this.enterShootout();
      return;
    }
    this.finishMatch();
  }

  private finishMatch(): void {
    this.state = 'FULL_TIME';
    const sheet = this.stats.snapshot();
    this.setMessage(`FULL TIME — ${this.scoreHome}–${this.scoreAway}.`);
    matchEventBus.emit('MATCH_ENDED', {
      homeScore: this.scoreHome,
      awayScore: this.scoreAway,
      mode: 'HEAD_TO_HEAD',
      stats: {
        possessionHome: sheet.home.possessionPct,
        shotsHome: sheet.home.shots,
        shotsAway: sheet.away.shots,
        onTargetHome: sheet.home.onTarget,
        onTargetAway: sheet.away.onTarget,
        xgHome: sheet.home.xg,
        xgAway: sheet.away.xg,
        passAccuracyHome: sheet.home.passAccuracyPct,
        passAccuracyAway: sheet.away.passAccuracyPct,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Penalty shootout
  // ---------------------------------------------------------------------------

  private enterShootout(): void {
    this.shootout.reset();
    this.state = 'PENALTY_SHOOTOUT';
    this.setMessage('PENALTY SHOOTOUT — five kicks each, ABAB, then sudden death.');
    this.setupShootoutKick();
  }

  private setupShootoutKick(): void {
    const status = this.shootout.status();
    if (status.finished) {
      this.finishMatch();
      return;
    }
    const side = this.shootout.nextSide;
    const taken = side === 'HOME' ? status.kicksTakenHome : status.kicksTakenAway;
    const positions = this.scrimmage.positionsSnapshot();
    const candidates = positions
      .filter((p) => p.side === side && !p.sentOff && p.role !== 'GK')
      .sort((a, b) => {
        const ta = this.scrimmage.templateOf(a.global);
        const tb = this.scrimmage.templateOf(b.global);
        return (tb?.subStats.finishing ?? 0) - (ta?.subStats.finishing ?? 0);
      });
    const takerSlot = candidates[taken % Math.max(1, candidates.length)] ?? candidates[0];
    const taker = takerSlot ? takerSlot.global : this.bestTaker(side, (s) => s.finishing);
    const plan = planSetPiece({ type: 'SHOOTOUT_KICK', side, ballX: 0, ballZ: 0 });
    this.scrimmage.startSetPiece({
      type: 'SHOOTOUT_KICK', side, ballX: plan.ballX, ballZ: plan.ballZ,
      takerGlobal: taker, origin: 'PENALTY',
    });
    this.penalty = {
      takingSide: side,
      takerGlobal: taker,
      userAttacking: side === 'HOME' && !this.scrimmage.autonomousHome,
      aimZ: 1.9, aimY: 0.6,
      userDive: null, struck: false, diveApplied: false, shootout: true,
    };
    this.shootoutPhase = 'AIM';
    this.shootoutKickResult = null;
    this.setMessage(`Shootout kick ${this.shootout.kicks.length + 1} — ${side} to take. ${status.homeScore}–${status.awayScore}.`);
  }

  private beginShootoutResolution(): void {
    this.shootoutPhase = 'RESOLVING';
    this.shootoutResolveTimer = 3.2;
  }

  private stepShootout(dt: number, input: InputManager): void {
    this.scrimmage.step(dt, input);
    this.recordFrame();
    this.totalPlaySec += dt;
    const p = this.penalty;
    if (this.shootoutPhase === 'AIM') {
      this.processEvents();
      if (!p) return;
      if (!p.struck && this.scrimmage.ball.state.ownerId === null && this.scrimmage.ball.speed() > 3) {
        p.struck = true;
        this.beginShootoutResolution();
      }
      if (p.struck && !p.diveApplied && p.userDive) {
        const defSide: TeamSide = p.takingSide === 'HOME' ? 'AWAY' : 'HOME';
        this.scrimmage.forceGkDive(defSide, p.userDive.z, p.userDive.high);
        p.diveApplied = true;
      }
      return;
    }
    // RESOLVING: watch for goal / save / out-of-play, then record the kick.
    this.processEvents();
    if (this.shootoutKickResult === null) {
      this.shootoutResolveTimer -= dt;
      if (this.shootoutResolveTimer <= 0) {
        // No event resolved it: a goal if the ball crossed the line in frame.
        const bp = this.scrimmage.ball.state.pos;
        const scored = Math.abs(bp.x) > PITCH.HALF_LENGTH && Math.abs(bp.z) < PITCH.GOAL_HALF_WIDTH;
        this.shootoutKickResult = scored;
        this.shootoutPauseTimer = 1.1;
      }
    } else {
      if (this.shootoutPauseTimer <= 0) this.shootoutPauseTimer = 1.1;
      this.shootoutPauseTimer -= dt;
      if (this.shootoutPauseTimer <= 0) {
        const scored = this.shootoutKickResult;
        this.shootoutKickResult = null;
        this.shootoutPauseTimer = 0;
        const status = this.shootout.takeKick(scored);
        if (status.finished) {
          this.setMessage(`Shootout over — ${status.winner} win it ${status.homeScore}–${status.awayScore}!`);
          this.finishMatch();
        } else {
          this.setupShootoutKick();
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Replay plumbing
  // ---------------------------------------------------------------------------

  private recordFrame(): void {
    const rs = this.scrimmage.renderState;
    this.recorder.record({
      ballX: rs.ballPos.x, ballY: rs.ballPos.y, ballZ: rs.ballPos.z,
      players: rs.players.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, anim: p.anim })),
    });
  }

  private publishReplayFrame(): void {
    const out = this.replayRender;
    out.ballPos.x = this.replayFrame.ballX;
    out.ballPos.y = this.replayFrame.ballY;
    out.ballPos.z = this.replayFrame.ballZ;
    this.replayFrame.players.forEach((p, i) => {
      const target = out.players[i];
      if (!target) return;
      target.x = p.x;
      target.z = p.z;
      target.yaw = p.yaw;
      target.anim = p.anim;
      target.speed = 0;
    });
  }

  get replayAngle(): 1 | 2 {
    return this.replay ? this.replay.angleAt(this.replayTimer) : 1;
  }

  // ---------------------------------------------------------------------------
  // View sync
  // ---------------------------------------------------------------------------

  private setMessage(text: string): void {
    this.message = text;
  }

  private syncView(): void {
    const v = this.view;
    v.state = this.state;
    v.period = this.period;
    v.minute = Math.floor(this.matchMinute);
    v.addedMinutes = this.addedComputed ? this.addedMinutes : 0;
    v.scoreHome = this.scoreHome;
    v.scoreAway = this.scoreAway;
    v.message = this.message;
    v.advantageSec = this.advantage.isActive ? this.advantage.remainingSec(this.totalPlaySec) : 0;
    v.varActive = this.state === 'OFFSIDE_STOPPAGE';
    v.cardBanner = this.cardBanner;
    v.replayActive = this.state === 'GOAL_REPLAY';
    v.replayAngle = this.replayAngle;
    v.fullTime = this.state === 'FULL_TIME';
    const sp = this.scrimmage.currentSetPiece;
    if (sp && SET_PIECE_STATES.includes(this.state)) {
      v.setPieceType = sp.type;
      v.setPiecePrompt = this.currentPlan?.prompt ?? null;
      v.userTakingSetPiece = sp.side === 'HOME' && !this.scrimmage.autonomousHome;
      v.wallCount = this.currentPlan?.wallCount ?? 0;
    } else if (this.state === 'PENALTY_SHOOTOUT' && this.penalty) {
      v.setPieceType = 'SHOOTOUT_KICK';
      v.setPiecePrompt = 'Shootout — pick your corner.';
      v.userTakingSetPiece = this.penalty.userAttacking;
      v.wallCount = 0;
    } else {
      v.setPieceType = null;
      v.setPiecePrompt = null;
      v.userTakingSetPiece = false;
      v.wallCount = 0;
    }
    v.penalty = this.penalty
      ? {
          userAttacking: this.penalty.userAttacking,
          userDefending: this.penalty.takingSide !== 'HOME' && !this.scrimmage.autonomousHome,
          aimZ: this.penalty.aimZ,
          aimY: this.penalty.aimY,
        }
      : null;
    v.shootout = this.state === 'PENALTY_SHOOTOUT' || (this.state === 'FULL_TIME' && this.shootout.kicks.length > 0)
      ? this.shootout.status()
      : null;
    this.statsViewTimer -= 1 / 60;
    if (this.statsViewTimer <= 0) {
      this.statsViewTimer = 0.2;
      v.stats = this.stats.snapshot();
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic Phase 05 verification lab — used by the App check panel.
// Exercises the REAL MatchEngine + ScrimmageEngine headlessly: a full
// two-half match start-to-finish, a frame-of-pass offside scenario, DOGSO
// and penalty-box foul scenarios, plus unit checks of the offside snapshot,
// tackle evaluation and the shootout (ABAB + sudden death).
// ---------------------------------------------------------------------------

export interface RulesLabResult {
  fullMatchCompleted: boolean;
  statesVisited: string[];
  minutesPlayed: number;
  statsValid: boolean;
  passesTracked: number;
  replayBufferFrames: number;
  offsideUnitOk: boolean;
  offsideMatchOk: boolean;
  dogsoRedOk: boolean;
  /** Epic P0-7: clean ball-first last-man tackle = play on; in-box DOGSO
   *  with a genuine attempt = yellow + penalty, not red. */
  dogsoNuanceOk: boolean;
  /** Epic P0-7: an indirect free kick blocks AI shooting and a direct
   *  "goal" from it is disallowed. */
  indirectFkOk: boolean;
  penaltyBoxOk: boolean;
  shootoutOk: boolean;
  allFinite: boolean;
}

function stepUntilInPlay(match: MatchEngine, input: InputManager, maxTicks: number): void {
  for (let t = 0; t < maxTicks && match.state !== 'IN_PLAY'; t += 1) {
    match.step(1 / 60, input);
  }
}

export function runRulesLab(): RulesLabResult {
  const idle = new InputManager();

  // --- Unit: offside snapshot (frame-of-pass, exceptions) -------------------
  let offsideUnitOk = false;
  let dogsoNuanceOk = false;
  let indirectFkOk = false;
  {
    const eng = new OffsideEngine();
    const snap = eng.onPass({
      attackingSide: 'HOME', passerGlobal: 8, ballX: 25,
      defenders: [
        { global: 11, x: 50, z: 0 }, { global: 13, x: 38, z: 2 }, { global: 14, x: 20, z: -6 },
      ],
      attackers: [
        { global: 8, x: 25, z: 0 }, { global: 9, x: 42, z: 1 }, { global: 10, x: 30, z: -4 },
      ],
      origin: 'OPEN_PLAY', nowSec: 0,
    });
    const taggedOk = snap !== null && snap.lineX === 38 && snap.tagged.has(9) && !snap.tagged.has(10);
    const call = eng.checkTouch(9, { x: 42, z: 1 });
    const exempt = new OffsideEngine().onPass({
      attackingSide: 'HOME', passerGlobal: 8, ballX: 25,
      defenders: [{ global: 11, x: 50, z: 0 }, { global: 13, x: 38, z: 2 }],
      attackers: [{ global: 9, x: 42, z: 1 }],
      origin: 'THROW_IN', nowSec: 0,
    });
    offsideUnitOk = taggedOk && call !== null && call.lineX === 38 && exempt === null;
  }

  // --- Unit: tackle evaluation + shootout ----------------------------------
  let shootoutOk = false;
  {
    const behind = evaluateTackle({
      touchedBallFirst: false, closingSpeed: 12.5, behindDot: 0.8,
      isSlide: true, aggressionMult: 1, isDogso: false,
    });
    const clean = evaluateTackle({
      touchedBallFirst: true, closingSpeed: 12, behindDot: 0.9,
      isSlide: true, aggressionMult: 1, isDogso: false,
    });
    const so = new PenaltyShootout();
    // HOME scores all 5, AWAY misses only kick #2 → HOME clinches on kick 9
    // (5–3 with one AWAY kick left, which cannot catch up).
    const seq = [true, true, true, false, true, true, true, true, true];
    let status = so.status();
    for (const s of seq) {
      status = so.takeKick(s);
      if (status.finished) break;
    }
    const regulationOk = status.finished && status.winner === 'HOME' && status.homeScore === 5;
    // Sudden death: all square through 5 rounds + one SD pair each.
    const sd = new PenaltyShootout();
    for (let i = 0; i < 10; i += 1) sd.takeKick(true);
    const sdOpen = sd.status();
    sd.takeKick(true); // HOME scores in sudden death
    const sdMid = sd.status();
    sd.takeKick(false); // AWAY misses → HOME wins
    const sdDone = sd.status();
    shootoutOk = behind.isFoul && behind.card === 'RED' && !clean.isFoul
      && regulationOk
      && !sdOpen.finished && sdOpen.suddenDeath
      && !sdMid.finished
      && sdDone.finished && sdDone.winner === 'HOME';
    // Epic P0-7 nuance: a perfect ball-first tackle on the last man is
    // play on (never a red), and a genuine in-box DOGSO attempt is a
    // yellow + penalty rather than a dismissal.
    const cleanLastMan = evaluateTackle({
      touchedBallFirst: true, closingSpeed: 12, behindDot: 0.9,
      isSlide: true, aggressionMult: 1, isDogso: true,
    });
    const inBoxDogso = evaluateTackle({
      touchedBallFirst: false, closingSpeed: 8, behindDot: 0.1,
      isSlide: false, aggressionMult: 1, isDogso: true, inPenaltyBox: true,
    });
    const cynicalInBox = evaluateTackle({
      touchedBallFirst: false, closingSpeed: 8, behindDot: 0.9,
      isSlide: false, aggressionMult: 1, isDogso: true, inPenaltyBox: true,
    });
    dogsoNuanceOk = !cleanLastMan.isFoul && inBoxDogso.card === 'YELLOW' && cynicalInBox.card === 'RED';
  }

  // --- Scenario: indirect free kick — AI must pass, never shoot -----------
  {
    const nets = { left: null, right: null };
    const scrim = new ScrimmageEngine(nets, { autonomousHome: true, seed: 777 });
    const kinds: string[] = [];
    scrim.eventSink = (e) => { kinds.push(e.kind); };
    const pos = scrim.positionsSnapshot();
    const taker = pos.find((p) => p.side === 'AWAY' && p.role === 'CM') ?? pos.find((p) => p.side === 'AWAY' && !p.role);
    if (taker) {
      // 24 m from the HOME goal — a direct FK the AI would normally shoot.
      scrim.startSetPiece({
        type: 'FREE_KICK', side: 'AWAY', ballX: -28, ballZ: 4,
        takerGlobal: taker.global, origin: 'FREE_KICK', indirect: true,
      });
      for (let t = 0; t < 240 && !kinds.includes('PASS'); t += 1) scrim.step(1 / 60, idle);
      indirectFkOk = kinds.includes('PASS') && !kinds.includes('SHOT');
    }
  }

  // --- Match scenario: offside from a real pass -----------------------------
  let offsideMatchOk = false;
  {
    const nets = { left: null, right: null };
    const scrim = new ScrimmageEngine(nets, { autonomousHome: true, seed: 4242 });
    const match = new MatchEngine(scrim, { halfDurationSec: 240, knockout: false });
    stepUntilInPlay(match, idle, 600);
    const pos = scrim.positionsSnapshot();
    const passer = pos.find((p) => p.side === 'HOME' && p.role === 'CM');
    const receiver = pos.find((p) => p.side === 'HOME' && p.role === 'ST');
    const awayGk = pos.find((p) => p.side === 'AWAY' && p.role === 'GK');
    const awayCb = pos.find((p) => p.side === 'AWAY' && p.role === 'CB');
    if (passer && receiver && awayGk && awayCb) {
      // Park the rest of the AWAY team deep in their own half, out of the lane.
      for (const p of pos) {
        if (p.side === 'AWAY' && p.global !== awayGk.global && p.global !== awayCb.global) {
          scrim.forceMovePlayer(p.global, -20 - (p.global % 5) * 3, p.global % 2 === 0 ? -14 : 14);
        }
        if (p.side === 'HOME' && p.global !== passer.global && p.global !== receiver.global) {
          scrim.forceMovePlayer(p.global, -15, p.global % 2 === 0 ? -12 : 12);
        }
      }
      scrim.forceMovePlayer(awayGk.global, 50, 6);
      scrim.forceMovePlayer(awayCb.global, 38, 8);
      scrim.forceScenePlayer(passer.global, 25, 0);
      scrim.forceMovePlayer(receiver.global, 42, 1);
      const passed = scrim.debugPass(passer.global, receiver.global);
      if (passed) {
        // 600 ticks: the receiver now correctly waits on the ball's line
        // and traps it at his feet (instead of chasing it down early),
        // and the autonomous carrier's decision delay precedes the pass —
        // the flag lands ~4–8s into the scenario.
        for (let t = 0; t < 600; t += 1) {
          match.step(1 / 60, idle);
          if (match.stats.snapshot().home.offsides > 0) { offsideMatchOk = true; break; }
        }
      }
    }
  }

  // --- Match scenario: DOGSO red + penalty-box foul --------------------------
  let dogsoRedOk = false;
  let penaltyBoxOk = false;
  {
    const nets = { left: null, right: null };
    const scrim = new ScrimmageEngine(nets, { autonomousHome: true, seed: 777 });
    const match = new MatchEngine(scrim, { halfDurationSec: 240, knockout: false });
    stepUntilInPlay(match, idle, 600);
    const pos = scrim.positionsSnapshot();
    const fouler = pos.find((p) => p.side === 'AWAY' && p.role === 'CB');
    const victim = pos.find((p) => p.side === 'HOME' && p.role === 'ST');
    if (fouler && victim) {
      match.debugFoulCandidate({
        kind: 'TACKLE_FOUL_CANDIDATE',
        tacklerGlobal: fouler.global, victimGlobal: victim.global,
        tackleKind: 'STANDING', touchedBallFirst: false,
        closingSeverity: 0.92, behindDot: 0.85, x: 28, z: 0,
      });
      dogsoRedOk = match.cards.counts('AWAY').reds >= 1
        && scrim.isSentOff(fouler.global)
        && match.state === 'FREE_KICK';
    }
    const scrim2 = new ScrimmageEngine(nets, { autonomousHome: true, seed: 778 });
    const match2 = new MatchEngine(scrim2, { halfDurationSec: 240, knockout: false });
    stepUntilInPlay(match2, idle, 600);
    const pos2 = scrim2.positionsSnapshot();
    const fouler2 = pos2.find((p) => p.side === 'AWAY' && p.role === 'CB');
    const victim2 = pos2.find((p) => p.side === 'HOME' && p.role === 'ST');
    if (fouler2 && victim2) {
      match2.debugFoulCandidate({
        kind: 'TACKLE_FOUL_CANDIDATE',
        tacklerGlobal: fouler2.global, victimGlobal: victim2.global,
        tackleKind: 'STANDING', touchedBallFirst: false,
        closingSeverity: 0.55, behindDot: 0.1, x: 45, z: 2,
      });
      penaltyBoxOk = match2.state === 'PENALTY_KICK';
    }
  }

  // --- Full match: two halves, start to FULL_TIME, never soft-locks ---------
  const nets = { left: null, right: null };
  const scrim = new ScrimmageEngine(nets, { autonomousHome: true, seed: 2026 });
  const match = new MatchEngine(scrim, { halfDurationSec: 20, knockout: false });
  const visited = new Set<string>();
  let allFinite = true;
  let maxReplayFrames = 0;
  for (let t = 0; t < 12000; t += 1) {
    match.step(1 / 60, idle);
    visited.add(match.state);
    if (match.state === 'GOAL_REPLAY') match.skipReplay();
    maxReplayFrames = Math.max(maxReplayFrames, match.recorder.frameCount);
    if (t % 120 === 0) {
      const rs = scrim.renderState;
      if (!Number.isFinite(rs.ballPos.x) || !Number.isFinite(rs.ballPos.z)) allFinite = false;
      for (const p of rs.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) allFinite = false;
      }
    }
    if (match.state === 'FULL_TIME') break;
  }
  const sheet = match.stats.snapshot();
  return {
    fullMatchCompleted: match.state === 'FULL_TIME',
    statesVisited: [...visited],
    minutesPlayed: match.matchMinute,
    statsValid: match.stats.validate(),
    passesTracked: sheet.home.passAttempts + sheet.away.passAttempts,
    replayBufferFrames: maxReplayFrames,
    offsideUnitOk,
    offsideMatchOk,
    dogsoRedOk,
    dogsoNuanceOk,
    indirectFkOk,
    penaltyBoxOk,
    shootoutOk,
    allFinite,
  };
}
