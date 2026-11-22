// Striker FC — ai/GoalkeeperAI.ts (Phase 04, Spec 05 §3)
// Complete GK state machine: ANGLE_BISECT positioning, SHOT_PREDICT_DIVE with
// a full forward trajectory simulation (gravity + Magnus through the real
// BallPhysics), RUSH_OUT smothers, CLAIM_CROSS and DISTRIBUTE. Parries are
// always directed away from the penalty spot, toward the flanks.

import { PITCH } from '../core/constants';
import { clamp, createVec3, type Vec3 } from '../core/math';
import type { PlayerTemplate, TeamSide } from '../core/types';
import { BallPhysics } from '../physics/BallPhysics';
import { attackDirX, ownGoalX } from './TacticalEngine';

export type GkState =
  | 'ANGLE_BISECT' | 'SHOT_PREDICT_DIVE' | 'RUSH_OUT' | 'CLAIM_CROSS' | 'DISTRIBUTE' | 'RECOVER';

export type DiveChoice = 'DIVE_HIGH' | 'DIVE_MID' | 'DIVE_LOW' | 'CATCH_BODY';

export interface GkFrame {
  state: GkState;
  /** World point the GK is steering toward this tick. */
  targetX: number;
  targetZ: number;
  sprint: boolean;
  dive: DiveChoice | null;
  /** -1 = dive to GK's left (world -Z side of travel), +1 = right. */
  diveDirZ: number;
  /** Hands-centre height used for catch/parry resolution. */
  handsY: number;
}

export interface ShotPrediction {
  impactZ: number;
  impactY: number;
  timeToImpact: number;
  willCrossPlane: boolean;
}

const HANDS_REACH = 1.05;

export class GoalkeeperAI {
  state: GkState = 'ANGLE_BISECT';
  /** Set by the engine when the user triggers GK Rush (swipe down). */
  manualRush = false;
  /** 0..1 game-reading quality, fed from the difficulty profile each
   *  frame: sharper keepers claim crosses from further out and step out
   *  earlier on 1v1s. Reads the game better — never moves faster. */
  readQuality = 0.45;
  private reactionTimer = 0;
  private dive: DiveChoice | null = null;
  private diveTarget = { x: 0, z: 0 };
  private diveDirZ = 1;
  private prediction: ShotPrediction | null = null;
  private distributeTimer = 0;
  private recoverTimer = 0;
  private claimPoint = { x: 0, z: 0 };
  private rng: () => number;

  constructor(
    public readonly side: TeamSide,
    public readonly template: PlayerTemplate,
    rng: () => number,
  ) {
    this.rng = rng;
  }

  get goalX(): number { return ownGoalX(this.side); }
  get dir(): 1 | -1 { return attackDirX(this.side); }
  get isDiving(): boolean { return this.state === 'SHOT_PREDICT_DIVE' && this.reactionTimer <= 0; }
  get currentDive(): DiveChoice | null { return this.dive; }
  get diveTargetPos(): { x: number; z: number } { return this.diveTarget; }
  get predictedImpact(): ShotPrediction | null { return this.prediction; }

  /** Reaction delay from reflexes (Spec 05 §3): 0.07s..0.28s. */
  reactionDelaySec(difficultyAdjSec = 0): number {
    const reflexes = this.template.subStats.gkReflexes;
    return clamp(0.28 - (reflexes / 100) * 0.19, 0.07, 0.28) + difficultyAdjSec;
  }

  /** Dive reach speed in m/s (BRICK_WALL_GK gets +12%). */
  diveSpeed(): number {
    const base = 4.6 + (this.template.subStats.gkDiving / 100) * 3.1;
    return this.template.playStyles.includes('BRICK_WALL_GK') ? base * 1.12 : base;
  }

  /**
   * Simulate the ball forward with the real BallPhysics (drag, Magnus,
   * gravity) for up to 90 steps and find where it crosses the GK's X plane.
   */
  predictShot(ball: BallPhysics): ShotPrediction {
    const sim = new BallPhysics(createVec3(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z));
    sim.state.vel.x = ball.state.vel.x; sim.state.vel.y = ball.state.vel.y; sim.state.vel.z = ball.state.vel.z;
    sim.state.angularVel.x = ball.state.angularVel.x;
    sim.state.angularVel.y = ball.state.angularVel.y;
    sim.state.angularVel.z = ball.state.angularVel.z;
    const planeX = this.goalX;
    let prevX = sim.state.pos.x;
    let prevY = sim.state.pos.y;
    let prevZ = sim.state.pos.z;
    for (let i = 0; i < 90; i += 1) {
      prevX = sim.state.pos.x; prevY = sim.state.pos.y; prevZ = sim.state.pos.z;
      sim.step(1 / 60, { wet: false });
      const x = sim.state.pos.x;
      // Shots travel toward this GK's goal, i.e. in the -dir direction:
      // HOME (dir +1) defends x=-52.5 so the ball's x decreases through the plane.
      const crossedTowardGoal = this.dir > 0 ? (prevX > planeX && x <= planeX) : (prevX < planeX && x >= planeX);
      if (crossedTowardGoal) {
        const span = Math.abs(x - prevX) || 1e-6;
        const t = Math.abs(planeX - prevX) / span;
        return {
          impactZ: prevZ + (sim.state.pos.z - prevZ) * t,
          impactY: prevY + (sim.state.pos.y - prevY) * t,
          timeToImpact: (i + t) / 60,
          willCrossPlane: true,
        };
      }
      if (sim.state.isGrounded && sim.horizontalSpeed() < 1.5) break;
    }
    return { impactZ: sim.state.pos.z, impactY: sim.state.pos.y, timeToImpact: 1.5, willCrossPlane: false };
  }

  /** Called by the engine on BALL_KICKED when the shot heads at this goal. */
  onShotFired(ball: BallPhysics, gkPos: Vec3, difficultyAdjSec = 0): boolean {
    const towardGoal = (ball.state.vel.x * -this.dir) > 2; // velocity toward own goal line
    if (!towardGoal) return false;
    const distToGoal = Math.abs(ball.state.pos.x - this.goalX);
    if (distToGoal > 42) return false;
    const pred = this.predictShot(ball);
    if (!pred.willCrossPlane) return false;
    // Only react to shots that threaten the goal frame (with a margin).
    if (Math.abs(pred.impactZ) > PITCH.GOAL_HALF_WIDTH + 1.6 || pred.impactY > PITCH.GOAL_HEIGHT + 0.9) return false;
    // Slight prediction noise on high-curve finesse shots (Spec 05 §3).
    const curve = Math.abs(ball.state.angularVel.y);
    const noise = (this.rng() * 2 - 1) * clamp(curve / 55, 0, 1) * 0.35;
    pred.impactZ += noise;
    this.prediction = pred;
    this.state = 'SHOT_PREDICT_DIVE';
    this.reactionTimer = this.reactionDelaySec(difficultyAdjSec);
    // Choose the dive from the predicted impact point.
    const dz = pred.impactZ - gkPos.z;
    const dy = pred.impactY;
    if (Math.abs(dz) < 0.7 && dy < 1.7) this.dive = 'CATCH_BODY';
    else if (dy > 1.55) this.dive = 'DIVE_HIGH';
    else if (dy < 0.75) this.dive = 'DIVE_LOW';
    else this.dive = 'DIVE_MID';
    this.diveDirZ = dz >= 0 ? 1 : -1;
    const reachZ = clamp(pred.impactZ, -PITCH.GOAL_HALF_WIDTH - 0.4, PITCH.GOAL_HALF_WIDTH + 0.4);
    this.diveTarget = { x: this.goalX + this.dir * 0.7, z: reachZ };
    return true;
  }

  /**
   * Phase 05: user-controlled dive for penalty kicks. The user picks a zone
   * (world Z target + high/low) and the GK commits to it immediately,
   * overriding the trajectory prediction.
   */
  forceDive(targetZ: number, high: boolean): void {
    this.state = 'SHOT_PREDICT_DIVE';
    this.reactionTimer = 0;
    this.prediction = null;
    if (Math.abs(targetZ) < 0.6) this.dive = high ? 'DIVE_HIGH' : 'CATCH_BODY';
    else this.dive = high ? 'DIVE_HIGH' : 'DIVE_LOW';
    this.diveDirZ = targetZ >= 0 ? 1 : -1;
    this.diveTarget = {
      x: this.goalX + this.dir * 0.7,
      z: clamp(targetZ, -PITCH.GOAL_HALF_WIDTH - 0.3, PITCH.GOAL_HALF_WIDTH + 0.3),
    };
  }

  /** GK has the ball in hand — hold, then the engine distributes. */
  startDistribute(holdSec?: number): void {
    this.state = 'DISTRIBUTE';
    this.distributeTimer = holdSec ?? (1.5 + this.rng() * 2);
    this.dive = null;
    this.prediction = null;
  }

  get distributeReady(): boolean {
    return this.state === 'DISTRIBUTE' && this.distributeTimer <= 0;
  }

  /** Epic P0-8: recovery time depends on what the keeper just did — a
   *  catch is quick, a low parry costs ~1 s on the ground, a high full-
   *  stretch parry costs the most. Set by the engine at contact time. */
  private pendingRecoverySec = 0.55;

  noteContactOutcome(outcome: 'CATCH' | 'PARRY', ballHeightY: number): void {
    this.pendingRecoverySec = outcome === 'CATCH' ? 0.5 : ballHeightY > 1.1 ? 1.4 : 1.0;
  }

  endAction(): void {
    this.state = 'RECOVER';
    this.recoverTimer = this.pendingRecoverySec;
    this.pendingRecoverySec = 0.55;
    this.dive = null;
    this.prediction = null;
    this.manualRush = false;
  }

  /**
   * Per-tick brain. The engine moves the GK's kinematics toward frame.target
   * and resolves catch/parry when the ball reaches the hands.
   */
  update(dt: number, gkPos: Vec3, ball: BallPhysics, ballCarrierPos: { x: number; z: number } | null, oneVsOne: boolean): GkFrame {
    const goalX = this.goalX;
    const dir = this.dir;
    if (this.recoverTimer > 0) {
      this.recoverTimer -= dt;
      if (this.recoverTimer <= 0 && this.state === 'RECOVER') this.state = 'ANGLE_BISECT';
    }
    if (this.state === 'DISTRIBUTE') {
      this.distributeTimer -= dt;
      return { state: this.state, targetX: gkPos.x, targetZ: gkPos.z, sprint: false, dive: null, diveDirZ: 1, handsY: 1.1 };
    }

    // --- RUSH_OUT triggers: user swipe-down or a clear 1v1 breakaway -------
    if (this.state !== 'SHOT_PREDICT_DIVE') {
      const carrierDist = ballCarrierPos
        ? Math.hypot(ballCarrierPos.x - goalX, ballCarrierPos.z)
        : Infinity;
      if ((this.manualRush && ballCarrierPos) || (oneVsOne && carrierDist < 21 + this.readQuality * 6)) {
        this.state = 'RUSH_OUT';
      } else if (this.state === 'RUSH_OUT' && !this.manualRush && !oneVsOne) {
        this.state = 'ANGLE_BISECT';
      }
    }
    if (this.state === 'RUSH_OUT' && ballCarrierPos) {
      return { state: this.state, targetX: ballCarrierPos.x, targetZ: ballCarrierPos.z, sprint: true, dive: null, diveDirZ: 1, handsY: 0.9 };
    }

    // --- CLAIM_CROSS: airborne ball dropping into the 6-yard box -----------
    if (this.state !== 'SHOT_PREDICT_DIVE' && ball.state.ownerId === null) {
      const intoBox = Math.abs(ball.state.pos.x - goalX) < PITCH.GOAL_AREA_LENGTH + 1.2 + this.readQuality * 1.6
        && Math.abs(ball.state.pos.z) < PITCH.GOAL_AREA_HALF_WIDTH + 1.5 + this.readQuality * 1.8;
      const airborne = ball.state.pos.y > 1.05 && ball.state.pos.y < 2.9;
      const headingIn = (ball.state.vel.x * -dir) > 1.5;
      if (intoBox && airborne && headingIn && !ball.state.shotInFlight) {
        // Predict the landing point by stepping a clone until it falls to 2m.
        const sim = new BallPhysics(createVec3(ball.state.pos.x, ball.state.pos.y, ball.state.pos.z));
        sim.state.vel.x = ball.state.vel.x; sim.state.vel.y = ball.state.vel.y; sim.state.vel.z = ball.state.vel.z;
        sim.state.angularVel.y = ball.state.angularVel.y;
        for (let i = 0; i < 60; i += 1) {
          sim.step(1 / 60, { wet: false });
          if (sim.state.pos.y <= 2.0) break;
        }
        this.claimPoint = { x: sim.state.pos.x, z: sim.state.pos.z };
        this.state = 'CLAIM_CROSS';
      } else if (this.state === 'CLAIM_CROSS') {
        this.state = 'ANGLE_BISECT';
      }
    }
    if (this.state === 'CLAIM_CROSS') {
      return { state: this.state, targetX: this.claimPoint.x, targetZ: this.claimPoint.z, sprint: true, dive: null, diveDirZ: 1, handsY: 2.1 };
    }

    // --- SHOT_PREDICT_DIVE ---------------------------------------------------
    if (this.state === 'SHOT_PREDICT_DIVE') {
      if (this.reactionTimer > 0) {
        this.reactionTimer -= dt;
        // Set stance: hold the bisect position until the reaction fires.
        return { state: this.state, targetX: gkPos.x, targetZ: gkPos.z, sprint: false, dive: null, diveDirZ: this.diveDirZ, handsY: 1.2 };
      }
      const handsY = this.dive === 'DIVE_HIGH' ? 2.05 : this.dive === 'DIVE_LOW' ? 0.45 : this.dive === 'CATCH_BODY' ? 1.15 : 1.25;
      return {
        state: this.state,
        targetX: this.diveTarget.x, targetZ: this.diveTarget.z,
        sprint: true, dive: this.dive, diveDirZ: this.diveDirZ, handsY,
      };
    }

    // --- ANGLE_BISECT (default) ----------------------------------------------
    const ballPos = ball.state.pos;
    const distToGoal = Math.hypot(ballPos.x - goalX, ballPos.z);
    const d = clamp(1.2 + (1 - clamp(distToGoal / 35, 0, 1)) * 4.2, 1.2, 5.4);
    const bx = ballPos.x - goalX; const bz = ballPos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const tx = goalX + (bx / bl) * d;
    const tz = clamp((bz / bl) * d, -PITCH.GOAL_HALF_WIDTH - 0.6, PITCH.GOAL_HALF_WIDTH + 0.6);
    this.state = 'ANGLE_BISECT';
    return { state: this.state, targetX: tx, targetZ: tz, sprint: distToGoal < 16, dive: null, diveDirZ: 1, handsY: 1.2 };
  }

  /**
   * Catch vs parry resolution when the ball reaches the GK's hands.
   * Returns 'CATCH' | 'PARRY' | null (not yet in reach). Parry direction is
   * always away from the penalty spot, toward the nearest flank/corner.
   */
  resolveBallContact(ball: BallPhysics, gkPos: Vec3, handsY: number): { outcome: 'CATCH' | 'PARRY'; parryVel: Vec3 } | null {
    const dx = ball.state.pos.x - gkPos.x;
    const dz = ball.state.pos.z - gkPos.z;
    const dy = ball.state.pos.y - handsY;
    const dist2d = Math.hypot(dx, dz);
    if (dist2d > HANDS_REACH || Math.abs(dy) > 1.25) return null;
    const speed = ball.speed();
    // The torso covers a vertical span around the hands centre.
    const distToHandsCenter = Math.hypot(dist2d, Math.max(0, Math.abs(dy) - 0.5));
    const parryVel = createVec3();
    if (speed < 20 && distToHandsCenter < 0.65) {
      return { outcome: 'CATCH', parryVel };
    }
    // Parry: out toward the nearest corner flag — never back to the spot.
    const flankSign = ball.state.pos.z >= 0 ? 1 : -1;
    const outX = this.dir * (5.5 + speed * 0.22);
    const outZ = flankSign * (7 + speed * 0.18);
    const len = Math.hypot(outX, outZ) || 1;
    const mag = clamp(speed * 0.5 + 6, 7, 15);
    parryVel.x = (outX / len) * mag;
    parryVel.z = (outZ / len) * mag;
    parryVel.y = 2.2;
    return { outcome: 'PARRY', parryVel };
  }
}
