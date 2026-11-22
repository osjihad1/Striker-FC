// Striker FC — rules/SetPieceManager.ts (Phase 05, Spec 06 §4)
// Set-piece planning for every restart: kickoff, throw-ins, goal kicks,
// corners, direct/indirect free kicks, penalty kicks and the 5-kick
// penalty shootout (ABAB + sudden death). Plans carry the exact placement
// data the engine needs: wall positions at 9.15m, corner box spots, the
// curved dotted trajectory preview for free kicks, and the penalty reticle
// sway model driven by the taker's composure.

import { PITCH } from '../core/constants';
import { clamp } from '../core/math';
import type { TeamSide } from '../core/types';

export type SetPieceType =
  | 'KICKOFF' | 'THROW_IN' | 'GOAL_KICK' | 'CORNER' | 'FREE_KICK' | 'PENALTY' | 'SHOOTOUT_KICK';

export interface SetPiecePlan {
  type: SetPieceType;
  /** Team taking the restart. */
  side: TeamSide;
  ballX: number;
  ballZ: number;
  /** Free kicks only: how many defenders form the wall (3–5). */
  wallCount: number;
  /** World positions for the wall, centred 9.15m from the ball toward goal. */
  wallPositions: { x: number; z: number }[];
  /** Corners only: the 5 attacking box spots (near post, spot, far post…). */
  boxSpots: { x: number; z: number }[];
  /** Free kicks only: dotted 3D trajectory preview points (ball → far corner). */
  trajectoryPreview: { x: number; y: number; z: number }[];
  directShot: boolean;
  prompt: string;
}

export function goalXFor(side: TeamSide): number {
  // The goal this side attacks.
  return side === 'HOME' ? PITCH.HALF_LENGTH : -PITCH.HALF_LENGTH;
}

function dirFor(side: TeamSide): 1 | -1 {
  return side === 'HOME' ? 1 : -1;
}

/** Wall size by shooting distance: closer range → bigger wall, always 3–5. */
export function wallCountFor(distToGoal: number): number {
  return clamp(Math.round(6.2 - distToGoal / 6.5), 3, 5);
}

/**
 * Curved trajectory preview: a quadratic arc from the ball, over the wall
 * (apex ≈ 2.1m at the wall distance), dipping into the far top corner.
 * DEAD_BALL_SPECIALIST takers get a longer, higher preview (more whip).
 */
export function computeTrajectoryPreview(
  ball: { x: number; z: number },
  goalX: number,
  specialist: boolean,
): { x: number; y: number; z: number }[] {
  const points: { x: number; y: number; z: number }[] = [];
  const targetZ = ball.z >= 0 ? -2.9 : 2.9; // far corner
  const dist = Math.abs(goalX - ball.x);
  const wallT = clamp(9.15 / Math.max(6, dist), 0.12, 0.6);
  const apex = specialist ? 2.35 : 2.05;
  const STEPS = 26;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const x = ball.x + (goalX - ball.x) * t;
    // Lateral whip: eases out then bends back toward the far corner.
    const whip = Math.sin(t * Math.PI) * (specialist ? 1.5 : 1.0) * (ball.z >= 0 ? 1 : -1);
    const z = ball.z + (targetZ - ball.z) * t + whip * (1 - t);
    // Height: rises to clear the wall at wallT, then dips under the bar.
    const rise = t <= wallT
      ? (t / wallT) * apex
      : apex - ((t - wallT) / (1 - wallT)) * (apex - 1.95);
    points.push({ x, y: Math.max(0.12, rise), z });
  }
  return points;
}

export function planSetPiece(args: {
  type: SetPieceType;
  side: TeamSide;
  ballX: number;
  ballZ: number;
  deadBallSpecialist?: boolean;
}): SetPiecePlan {
  const { type, side } = args;
  const dir = dirFor(side);
  const goalX = goalXFor(side);
  const ballX = args.ballX;
  const ballZ = args.ballZ;
  const base: SetPiecePlan = {
    type, side, ballX, ballZ,
    wallCount: 0, wallPositions: [], boxSpots: [], trajectoryPreview: [],
    directShot: false, prompt: '',
  };
  switch (type) {
    case 'KICKOFF':
      return { ...base, ballX: 0, ballZ: 0, prompt: 'Kickoff — opposition outside the 9.15m centre circle.' };
    case 'THROW_IN':
      return { ...base, prompt: 'Throw-in from the exact exit point — tap Pass to restart.' };
    case 'GOAL_KICK':
      return {
        ...base,
        ballX: -goalX + dir * PITCH.GOAL_AREA_LENGTH,
        ballZ: clamp(ballZ, -PITCH.GOAL_AREA_HALF_WIDTH + 1, PITCH.GOAL_AREA_HALF_WIDTH - 1),
        prompt: 'Goal kick from the 6-yard box — build from the back.',
      };
    case 'CORNER': {
      const cornerX = goalX - dir * 1.2;
      const cornerZ = Math.sign(ballZ || 1) * (PITCH.HALF_WIDTH - 1.2);
      // 5 attackers in the box: near post, penalty spot, far post, 6-yard, edge.
      const boxSpots = [
        { x: goalX - dir * 3.5, z: cornerZ > 0 ? 4.5 : -4.5 },
        { x: goalX - dir * PITCH.PENALTY_SPOT_DIST, z: 0 },
        { x: goalX - dir * 4.5, z: cornerZ > 0 ? -5.5 : 5.5 },
        { x: goalX - dir * PITCH.GOAL_AREA_LENGTH, z: cornerZ > 0 ? 1.5 : -1.5 },
        { x: goalX - dir * (PITCH.PENALTY_AREA_LENGTH + 1), z: cornerZ > 0 ? -3 : 3 },
      ];
      return {
        ...base, ballX: cornerX, ballZ: cornerZ, boxSpots,
        prompt: 'Corner — 5 attackers in the box. Whip it in with Pass / Cross!',
      };
    }
    case 'FREE_KICK': {
      const distToGoal = Math.hypot(goalX - ballX, ballZ);
      const directShot = distToGoal <= 34 && Math.abs(ballZ) <= 26;
      const wallCount = directShot ? wallCountFor(distToGoal) : 0;
      const wallPositions: { x: number; z: number }[] = [];
      if (wallCount > 0) {
        // Wall centre exactly 9.15m from the ball on the ball→goal-centre line.
        const gx = goalX - ballX;
        const gz = 0 - ballZ;
        const gl = Math.hypot(gx, gz) || 1;
        const cx = ballX + (gx / gl) * 9.15;
        const cz = ballZ + (gz / gl) * 9.15;
        const px = -gz / gl; // perpendicular spread direction
        const pz = gx / gl;
        for (let i = 0; i < wallCount; i += 1) {
          const off = (i - (wallCount - 1) / 2) * 0.55;
          wallPositions.push({ x: cx + px * off, z: cz + pz * off });
        }
      }
      return {
        ...base, wallCount, wallPositions, directShot,
        trajectoryPreview: directShot
          ? computeTrajectoryPreview({ x: ballX, z: ballZ }, goalX, args.deadBallSpecialist ?? false)
          : [],
        prompt: directShot
          ? `Direct free kick — ${wallCount}-man wall at 9.15m. Aim, curve, strike!`
          : 'Indirect free kick — pick out a teammate.',
      };
    }
    case 'PENALTY':
    case 'SHOOTOUT_KICK': {
      return {
        ...base,
        ballX: goalX - dir * PITCH.PENALTY_SPOT_DIST,
        ballZ: 0,
        directShot: true,
        prompt: type === 'PENALTY'
          ? 'Penalty kick — place the reticle, then strike.'
          : 'Shootout kick — pick your corner.',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Penalty reticle — sways with composure; turns dangerous when held too long.
// ---------------------------------------------------------------------------

export interface ReticleState {
  /** Normalised aim inside the goal frame: z -1..1 (posts), y 0..1 (ground→bar). */
  z: number;
  y: number;
  danger: boolean;
}

/** Gentle sinusoidal sway; lower composure (0..1) sways wider. */
export function reticleSway(composure01: number, tSec: number): { dz: number; dy: number } {
  const amp = 0.16 - composure01 * 0.11;
  return {
    dz: Math.sin(tSec * 1.7) * amp + Math.sin(tSec * 3.1) * amp * 0.35,
    dy: Math.cos(tSec * 1.3) * amp * 0.7,
  };
}

/** Holding the aim beyond ~2.6s makes the reticle drift red (rushed strike). */
export function reticleDanger(heldSec: number): boolean {
  return heldSec > 2.6;
}

/** Map a normalised reticle to a world aim point inside the goal frame. */
export function reticleToWorld(goalX: number, r: { z: number; y: number }): { aimZ: number; aimY: number } {
  void goalX;
  return {
    aimZ: clamp(r.z, -1.15, 1.15) * (PITCH.GOAL_HALF_WIDTH - 0.25),
    aimY: 0.25 + clamp(r.y, 0, 1.05) * (PITCH.GOAL_HEIGHT - 0.45),
  };
}

// ---------------------------------------------------------------------------
// Penalty shootout — 5 kicks each, ABAB, early decision, then sudden death.
// ---------------------------------------------------------------------------

export interface ShootoutKick {
  side: TeamSide;
  scored: boolean;
}

export interface ShootoutStatus {
  homeScore: number;
  awayScore: number;
  kicksTakenHome: number;
  kicksTakenAway: number;
  nextSide: TeamSide;
  round: number; // 1-based kick number for the next taker within their 5
  suddenDeath: boolean;
  finished: boolean;
  winner: TeamSide | null;
}

export class PenaltyShootout {
  readonly kicks: ShootoutKick[] = [];

  get nextSide(): TeamSide {
    // ABAB: HOME takes kick 1, AWAY kick 2, …
    return this.kicks.length % 2 === 0 ? 'HOME' : 'AWAY';
  }

  private score(side: TeamSide): number {
    return this.kicks.filter((k) => k.side === side && k.scored).length;
  }

  private taken(side: TeamSide): number {
    return this.kicks.filter((k) => k.side === side).length;
  }

  status(): ShootoutStatus {
    const homeScore = this.score('HOME');
    const awayScore = this.score('AWAY');
    const takenHome = this.taken('HOME');
    const takenAway = this.taken('AWAY');
    let finished = false;
    let winner: TeamSide | null = null;
    const suddenDeath = takenHome >= 5 && takenAway >= 5;
    if (suddenDeath) {
      // Equal kicks taken in sudden death with different scores → decided.
      if (takenHome === takenAway && homeScore !== awayScore) {
        finished = true;
        winner = homeScore > awayScore ? 'HOME' : 'AWAY';
      }
    } else if (takenHome >= 3 || takenAway >= 3) {
      // Early decision: the trailing side cannot catch up with its remaining kicks.
      const remHome = 5 - takenHome;
      const remAway = 5 - takenAway;
      if (homeScore > awayScore + remAway) { finished = true; winner = 'HOME'; }
      else if (awayScore > homeScore + remHome) { finished = true; winner = 'AWAY'; }
      else if (takenHome === 5 && takenAway === 5) {
        if (homeScore !== awayScore) {
          finished = true;
          winner = homeScore > awayScore ? 'HOME' : 'AWAY';
        }
      }
    }
    return {
      homeScore, awayScore,
      kicksTakenHome: takenHome, kicksTakenAway: takenAway,
      nextSide: finished ? (winner ?? 'HOME') : this.nextSide,
      round: Math.min(5, Math.floor(this.kicks.length / 2) + 1),
      suddenDeath: suddenDeath && !finished,
      finished,
      winner,
    };
  }

  /** Record a kick for the side whose turn it is; returns the new status. */
  takeKick(scored: boolean): ShootoutStatus {
    const before = this.status();
    if (before.finished) return before;
    this.kicks.push({ side: this.nextSide, scored });
    return this.status();
  }

  reset(): void {
    this.kicks.length = 0;
  }
}
