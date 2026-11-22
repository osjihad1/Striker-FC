// Striker FC — physics/PassCalculator.ts (Phase 03, Spec 04 §5)
// Smart aim-assisted candidate scoring for GROUND / LOB / DRIVEN / PASS_AND_GO /
// THROUGH / LOB_THROUGH / CROSS with moving-target lead prediction.
import { BALL_CONST } from '../core/constants';
import { clamp, createVec3, normalizeSafe, type Vec3 } from '../core/math';
import type { PassType, PlayerTemplate } from '../core/types';

export interface PassCandidate {
  id: string;
  pos: Vec3;
  vel: Vec3;
}

export interface PassResult {
  velocity: Vec3;
  angularVel: Vec3;
  targetId: string | null;
  /** World point the ball is played to (lead position for through balls). */
  targetPoint: Vec3;
  flightTime: number;
  speed: number;
}

const UP_SPIN: Vec3 = { x: 0, y: 1, z: 0 };

function laneObstructionPenalty(from: Vec3, to: Vec3, opponents: PassCandidate[]): number {
  let penalty = 0;
  for (const opp of opponents) {
    const abx = to.x - from.x; const abz = to.z - from.z;
    const lenSq = abx * abx + abz * abz;
    if (lenSq < 1e-6) continue;
    const t = clamp(((opp.pos.x - from.x) * abx + (opp.pos.z - from.z) * abz) / lenSq, 0, 1);
    const cx = from.x + abx * t; const cz = from.z + abz * t;
    const d = Math.hypot(opp.pos.x - cx, opp.pos.z - cz);
    if (d < 1.4) penalty += 0.85 * (1 - d / 1.4);
  }
  return penalty;
}

/**
 * Score every teammate against the input direction (Spec 04 §5):
 * score = cos(angleDiff) * 2.5 - (dist / 45) * 0.6 - laneObstructionPenalty.
 * Rejects candidates beyond 42° or 55m. Returns the best, or null.
 */
export function findPassTarget(
  from: Vec3,
  inputDir: Vec3,
  teammates: PassCandidate[],
  opponents: PassCandidate[],
): PassCandidate | null {
  const dir = createVec3(inputDir.x, 0, inputDir.z);
  if (normalizeSafe(dir) === 0) return null;
  let best: PassCandidate | null = null;
  let bestScore = -Infinity;
  for (const t of teammates) {
    const dx = t.pos.x - from.x; const dz = t.pos.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 55 || dist < 0.5) continue;
    const cos = (dx * dir.x + dz * dir.z) / dist;
    const angle = Math.acos(clamp(cos, -1, 1));
    if (angle > (42 * Math.PI) / 180) continue;
    const score = cos * 2.5 - (dist / 45) * 0.6 - laneObstructionPenalty(from, t.pos, opponents);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/** Ballistic velocity that lands on `to` after `flightTime` seconds. */
export function ballisticVelocity(from: Vec3, to: Vec3, flightTime: number, out: Vec3): Vec3 {
  const t = Math.max(0.2, flightTime);
  out.x = (to.x - from.x) / t;
  out.z = (to.z - from.z) / t;
  out.y = (to.y - from.y + 0.5 * BALL_CONST.GRAVITY * t * t) / t;
  return out;
}

export interface PassRequest {
  passer: PlayerTemplate;
  from: Vec3;
  passType: PassType;
  target: PassCandidate;
  /** Explicit target point for CROSS (defaults to the target's lead position). */
  targetPoint?: Vec3;
  /** Attacking direction on X (+1 attacks the +X goal). */
  attackDirX: 1 | -1;
}

export function computePass(req: PassRequest): PassResult {
  const { from, target, passType } = req;
  const dx = target.pos.x - from.x;
  const dz = target.pos.z - from.z;
  const dist = Math.hypot(dx, dz);
  const dir = createVec3(dx, 0, dz);
  normalizeSafe(dir);
  const incisive = req.passer.playStyles.includes('INCISIVE_PASS_PLUS');

  const leadPos = createVec3(target.pos.x, target.pos.y, target.pos.z);
  const velocity = createVec3();
  const angularVel = createVec3();
  let flightTime = 0;
  let speed = 0;

  const groundSpeed = (mult: number) => clamp(
    (Math.sqrt(2 * BALL_CONST.ROLL_FRICTION_DRY * Math.max(1, dist)) + 4.5) * mult, 11, 26,
  );

  switch (passType) {
    case 'GROUND':
    case 'PASS_AND_GO': {
      speed = groundSpeed(1);
      velocity.x = dir.x * speed; velocity.z = dir.z * speed; velocity.y = 0;
      flightTime = dist / Math.max(6, speed * 0.72);
      break;
    }
    case 'DRIVEN': {
      speed = groundSpeed(1.4);
      velocity.x = dir.x * speed; velocity.z = dir.z * speed; velocity.y = speed * 0.06;
      angularVel.z = -dir.x * 18; angularVel.x = dir.z * 18; // driven topspin skid
      flightTime = dist / Math.max(8, speed * 0.85);
      break;
    }
    case 'THROUGH': {
      // Lead the runner, shifted into space behind the nearest defender line.
      const leadT = clamp(dist / 16, 0.35, 1.35);
      leadPos.x = target.pos.x + target.vel.x * leadT + req.attackDirX * 1.2;
      leadPos.z = target.pos.z + target.vel.z * leadT;
      const lx = leadPos.x - from.x; const lz = leadPos.z - from.z;
      const lDist = Math.hypot(lx, lz);
      const lDir = createVec3(lx, 0, lz); normalizeSafe(lDir);
      speed = groundSpeed(incisive ? 1.28 : 1.12);
      velocity.x = lDir.x * speed; velocity.z = lDir.z * speed; velocity.y = 0;
      flightTime = lDist / Math.max(6, speed * 0.72);
      break;
    }
    case 'LOB': {
      flightTime = clamp(dist / 14, 0.5, 1.6);
      ballisticVelocity(from, leadPos, flightTime, velocity);
      speed = Math.hypot(velocity.x, velocity.z);
      angularVel.y = (incisive ? 10 : 6) * (dir.x >= 0 ? -1 : 1);
      break;
    }
    case 'LOB_THROUGH': {
      const leadT = clamp(dist / 16, 0.35, 1.35);
      leadPos.x = target.pos.x + target.vel.x * leadT + req.attackDirX * 1.6;
      leadPos.z = target.pos.z + target.vel.z * leadT;
      const lDist = Math.hypot(leadPos.x - from.x, leadPos.z - from.z);
      flightTime = clamp(lDist / 18, 0.7, 1.8);
      ballisticVelocity(from, leadPos, flightTime, velocity);
      speed = Math.hypot(velocity.x, velocity.z);
      break;
    }
    case 'CROSS': {
      const point = req.targetPoint ?? leadPos;
      const cDist = Math.hypot(point.x - from.x, point.z - from.z);
      flightTime = clamp(cDist / 16, 0.6, 1.5);
      ballisticVelocity(from, point, flightTime, velocity);
      speed = Math.hypot(velocity.x, velocity.z);
      // Whip: side spin around Y, resolved so the ball bends in toward goal.
      angularVel.y = (point.z >= from.z ? -1 : 1) * 16 * Math.sign(dir.x || 1);
      leadPos.x = point.x; leadPos.z = point.z;
      break;
    }
  }

  void UP_SPIN;
  return { velocity, angularVel, targetId: target.id, targetPoint: leadPos, flightTime, speed };
}
