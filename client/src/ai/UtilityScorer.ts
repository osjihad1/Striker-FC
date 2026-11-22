// Striker FC — ai/UtilityScorer.ts (Phase 04, Spec 05 §2)
// Real weighted utility scoring for AI decisions: an analytical xG model for
// shots, openness + forward progress + ray-cast lane checks for passes,
// through-ball space behind the defensive line, and dribble-lane openness.
// Pure functions over plain {x,z} points — no rendering or engine imports.

import { PITCH } from '../core/constants';
import { clamp } from '../core/math';
import type { PlayerTemplate } from '../core/types';

export interface Point2 { x: number; z: number }

export interface ScoredOpponent extends Point2 { id?: string }

/** Perpendicular distance from point P to segment A→B, and the clamped t. */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { dist: number; t: number } {
  const abx = bx - ax; const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-9) return { dist: Math.hypot(px - ax, pz - az), t: 0 };
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lenSq, 0, 1);
  const cx = ax + abx * t; const cz = az + abz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

/** 0 = lane fully blocked, 1 = lane completely clear (ray vs opponent circles). */
export function laneClearance(from: Point2, to: Point2, opponents: ScoredOpponent[], blockRadius = 1.4): number {
  let worst = 0;
  for (const opp of opponents) {
    const { dist, t } = segmentDistance(opp.x, opp.z, from.x, from.z, to.x, to.z);
    if (t <= 0.02 || t >= 0.98) continue; // at the ends it is the receiver/duel, not the lane
    if (dist < blockRadius) worst = Math.max(worst, 1 - dist / blockRadius);
  }
  return clamp(1 - worst, 0, 1);
}

/** Distance to the nearest opponent (capped at `cap` metres). */
export function nearestOpponentDist(p: Point2, opponents: ScoredOpponent[], cap = 14): number {
  let best = cap;
  for (const opp of opponents) {
    const d = Math.hypot(opp.x - p.x, opp.z - p.z);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// xG model
// ---------------------------------------------------------------------------

export interface XgBreakdown {
  xg: number;
  distance: number;
  goalAngleRad: number;
  blockerFactor: number; // 0..1 multiplier after the blocker cone
}

export function computeXG(shooter: Point2, attackDirX: 1 | -1, opponents: ScoredOpponent[]): XgBreakdown {
  const goalX = attackDirX * PITCH.HALF_LENGTH;
  const hw = PITCH.GOAL_HALF_WIDTH;
  const distance = Math.hypot(goalX - shooter.x, shooter.z);
  // Angle subtended by the goal mouth at the shooter.
  const ax = goalX - shooter.x; const az1 = -hw - shooter.z; const az2 = hw - shooter.z;
  const la = Math.hypot(ax, az1); const lb = Math.hypot(ax, az2);
  let goalAngleRad = 0;
  if (la > 1e-6 && lb > 1e-6) {
    const cos = clamp((ax * ax + az1 * az2) / (la * lb), -1, 1);
    goalAngleRad = Math.acos(cos);
  }
  const angleFactor = clamp(goalAngleRad / 0.65, 0, 1.15);
  const distFactor = clamp(Math.exp(-Math.max(0, distance - 6) * 0.045), 0.08, 1);
  // Blocker cone: opponents standing in the shooter→goal-centre corridor.
  let block = 0;
  for (const opp of opponents) {
    const { dist, t } = segmentDistance(opp.x, opp.z, shooter.x, shooter.z, goalX, 0);
    if (t > 0.12 && t < 0.97 && dist < 1.3) block += (1 - dist / 1.3) * 0.55;
  }
  const blockerFactor = clamp(1 - Math.min(0.72, block * 0.4), 0.28, 1);
  const xg = clamp(0.92 * angleFactor * distFactor * blockerFactor, 0.01, 0.97);
  return { xg, distance, goalAngleRad, blockerFactor };
}

// ---------------------------------------------------------------------------
// Action scores (all roughly 0..1, higher is better)
// ---------------------------------------------------------------------------

export interface ShotScore {
  score: number;
  xg: XgBreakdown;
  /** Suggested lateral aim point inside the goal mouth (-3.2..3.2). */
  aimZ: number;
}

export function scoreShotOpportunity(
  shooter: Point2,
  template: PlayerTemplate,
  attackDirX: 1 | -1,
  opponents: ScoredOpponent[],
  mentalityShootBias: number,
): ShotScore {
  const xg = computeXG(shooter, attackDirX, opponents);
  const score = clamp(xg.xg * (template.stats.sho / 90) * mentalityShootBias, 0, 1);
  // Aim at the far corner relative to the shooter's side, inside the post.
  const aimZ = shooter.z > 0.6 ? -2.75 : shooter.z < -0.6 ? 2.75 : (shooter.z >= 0 ? -2.4 : 2.4);
  return { score, xg, aimZ };
}

export interface PassScore {
  score: number;
  openness: number; // 0..1
  forwardProgress: number; // -0.3..1
  lane: number; // 0..1
  distance: number;
}

export function scorePassTarget(
  passer: Point2,
  candidate: Point2,
  attackDirX: 1 | -1,
  opponents: ScoredOpponent[],
): PassScore {
  const distance = Math.hypot(candidate.x - passer.x, candidate.z - passer.z);
  const openness = clamp(nearestOpponentDist(candidate, opponents) / 9, 0, 1);
  const forwardProgress = clamp(((candidate.x - passer.x) * attackDirX) / 22, -0.3, 1);
  const lane = laneClearance(passer, candidate, opponents);
  const distPenalty = clamp(distance / 52, 0, 0.35);
  const score = clamp(openness * 0.42 + (forwardProgress * 0.5 + 0.5) * 0.26 + lane * 0.34 - distPenalty * 0.4, 0, 1);
  return { score, openness, forwardProgress, lane, distance };
}

export interface ThroughScore {
  score: number;
  spaceFactor: number;
  lane: number;
  targetPoint: Point2;
}

/**
 * Space for a through ball: the point 7m beyond the runner toward goal must be
 * clear of opponents, the passing lane must be open, and the runner's pace
 * must be able to beat the defensive line to it.
 */
export function scoreThroughBallSpace(
  passer: Point2,
  runner: Point2 & { pace: number },
  attackDirX: 1 | -1,
  opponents: ScoredOpponent[],
  defensiveLineX: number,
): ThroughScore {
  const targetPoint: Point2 = {
    x: clamp(runner.x + attackDirX * 7.5, -PITCH.HALF_LENGTH + 2, PITCH.HALF_LENGTH - 2),
    z: clamp(runner.z, -PITCH.HALF_WIDTH + 3, PITCH.HALF_WIDTH - 3),
  };
  const space = nearestOpponentDist(targetPoint, opponents);
  const spaceFactor = clamp(space / 10, 0, 1);
  const lane = laneClearance(passer, targetPoint, opponents, 1.6);
  // Runner already level with / beyond the line gets a head start bonus.
  const beyondLine = clamp(((runner.x - defensiveLineX) * attackDirX) / 6 + 0.5, 0, 1);
  const paceFactor = clamp(runner.pace / 100, 0, 1);
  const score = clamp(spaceFactor * 0.44 + lane * 0.3 + beyondLine * 0.14 + paceFactor * 0.12, 0, 1);
  return { score, spaceFactor, lane, targetPoint };
}

export interface DribbleScore {
  score: number;
  dirX: number;
  dirZ: number;
  nearestInCone: number;
}

/** Open space in a 7m cone across 5 sampled directions around the attack axis. */
export function scoreDribbleLane(
  carrier: Point2,
  template: PlayerTemplate,
  attackDirX: 1 | -1,
  opponents: ScoredOpponent[],
): DribbleScore {
  const baseAng = attackDirX > 0 ? 0 : Math.PI;
  let bestScore = -1;
  let bestDir: Point2 = { x: attackDirX, z: 0 };
  let bestNearest = 7;
  for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const ang = baseAng + off;
    const dx = Math.cos(ang); const dz = Math.sin(ang);
    let nearest = 7;
    for (const opp of opponents) {
      const rx = opp.x - carrier.x; const rz = opp.z - carrier.z;
      const along = rx * dx + rz * dz;
      if (along <= 0 || along > 7.5) continue;
      const perp = Math.abs(-rx * dz + rz * dx);
      if (perp < 1.6) nearest = Math.min(nearest, along);
    }
    const openness = clamp(nearest / 7, 0, 1);
    const forwardBias = 1 - Math.abs(off) * 0.35;
    const s = openness * forwardBias;
    if (s > bestScore) { bestScore = s; bestDir = { x: dx, z: dz }; bestNearest = nearest; }
  }
  const score = clamp(bestScore * 0.62 + (template.stats.dri / 100) * 0.38, 0, 1);
  return { score, dirX: bestDir.x, dirZ: bestDir.z, nearestInCone: bestNearest };
}
