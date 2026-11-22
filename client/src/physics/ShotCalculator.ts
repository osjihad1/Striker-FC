// Striker FC — physics/ShotCalculator.ts (Phase 03, Spec 04 §4)
// Exact velocity, loft and 3D spin for STANDARD / FINESSE / CHIP / POWER /
// HEADER / FAKE_SHOT, with composure & weak-foot & stamina error cones and
// PlayStyle bonuses. Pure functions — deterministic given the injected rng.
import { createVec3, cross, normalizeSafe, type Vec3 } from '../core/math';
import type { PlayerTemplate, ShotType } from '../core/types';

export interface ShotRequest {
  shooter: PlayerTemplate;
  /** Ball position at the strike. */
  from: Vec3;
  /** Unit-ish horizontal aim direction (toward the aim point). */
  aimDir: Vec3;
  /** Lateral aim offset across the goal mouth, -1 (near post) .. +1 (far post). */
  aimLateral: number;
  /** 0..1 hold power. */
  powerNorm: number;
  shotType: ShotType;
  /** 0..1 current stamina of the shooter. */
  stamina01: number;
  /** True when the strike falls on the weak foot. */
  usingWeakFoot: boolean;
  rng: () => number;
}

export interface ShotResult {
  velocity: Vec3;
  angularVel: Vec3;
  speed: number;
  loftDeg: number;
  /** Seconds of wind-up before the strike lands (POWER = 0.35s). */
  windupSec: number;
  /** FAKE_SHOT never releases the ball. */
  isFake: boolean;
  /** Overcooked red-bar strike (power > 0.92) — sky-ball loft penalty applied. */
  overcooked: boolean;
  spreadRad: number;
}

const DEG = Math.PI / 180;
const UP: Vec3 = { x: 0, y: 1, z: 0 };

export function computeShot(req: ShotRequest): ShotResult {
  const { shooter, powerNorm: power } = req;
  const sub = shooter.subStats;
  const has = (id: string) => shooter.playStyles.includes(id as PlayerTemplate['playStyles'][number]);

  // --- Error cone (Spec 04 §4) ---------------------------------------------
  let spread = 0.015 + (1 - sub.finishing / 120) * 0.08;
  if (req.usingWeakFoot) spread *= (6 - shooter.weakFoot) * 0.35;
  if (req.stamina01 < 0.25) spread *= 1.45;
  if (req.shotType === 'FINESSE' && has('FINESSE_SHOT_PLUS')) spread *= 0.9;

  // --- Per-type speed / loft / spin magnitudes ------------------------------
  let speed = 0;
  let loftDeg = 0;
  let topspin = 0; // + = topspin dip, - = backspin float (axis = up x forward)
  let sideCurl = 0; // rad/s around Y, sign resolved against aim below
  let windupSec = 0.08;
  switch (req.shotType) {
    case 'STANDARD':
      speed = 18 + power * 15;
      loftDeg = 6 + power * 14;
      topspin = 10;
      break;
    case 'FINESSE': {
      speed = 16 + power * 11;
      loftDeg = 10 + power * 10;
      let curl = 32 + sub.curve * 0.25;
      if (has('FINESSE_SHOT_PLUS')) curl *= 1.18;
      sideCurl = curl;
      topspin = 6;
      break;
    }
    case 'CHIP':
      speed = 11 + power * 8;
      loftDeg = 32 + power * 16;
      topspin = -28; // backspin lob
      break;
    case 'POWER': {
      speed = 26 + power * 14;
      loftDeg = 4 + power * 9;
      topspin = 42;
      if (has('POWER_SHOT_PLUS')) topspin *= 1.12;
      windupSec = has('POWER_SHOT_PLUS') ? 0.35 * 0.8 : 0.35;
      break;
    }
    case 'HEADER':
      speed = 13 + power * 10;
      loftDeg = -2 + req.rng() * 12;
      topspin = 14; // slight downward spin
      break;
    case 'FAKE_SHOT':
      return {
        velocity: createVec3(), angularVel: createVec3(), speed: 0, loftDeg: 0,
        windupSec: 0.05, isFake: true, overcooked: false, spreadRad: spread,
      };
    case 'VOLLEY':
      speed = 20 + power * 13;
      loftDeg = 5 + power * 11;
      topspin = 16;
      break;
  }

  const overcooked = power > 0.92 && req.shotType !== 'CHIP';
  if (overcooked) loftDeg += 12;

  // Shot-power stat scales raw pace slightly.
  speed *= 0.9 + (sub.shotPower / 100) * 0.2;

  // --- Build the launch direction with error-cone jitter --------------------
  const fwd = createVec3(req.aimDir.x, 0, req.aimDir.z);
  if (normalizeSafe(fwd) === 0) { fwd.x = 1; }
  const yawJitter = (req.rng() * 2 - 1) * spread;
  const loftJitter = (req.rng() * 2 - 1) * spread * 28; // degrees-ish scatter
  const cosY = Math.cos(yawJitter); const sinY = Math.sin(yawJitter);
  const jx = fwd.x * cosY - fwd.z * sinY;
  const jz = fwd.x * sinY + fwd.z * cosY;
  const loftRad = (loftDeg + loftJitter) * DEG;
  const horizontal = speed * Math.cos(loftRad);
  const velocity = createVec3(jx * horizontal, speed * Math.sin(loftRad), jz * horizontal);

  // --- Spin vectors -----------------------------------------------------------
  // Topspin axis = up x forward (for +X travel this is -Z, giving the -Y dip).
  const topAxis = cross(createVec3(), UP, fwd);
  const angularVel = createVec3(
    topAxis.x * topspin,
    0,
    topAxis.z * topspin,
  );
  if (sideCurl !== 0) {
    // Bend toward the aim side. Lateral world direction = travel direction
    // rotated +90° around Y, scaled by the aim side. Magnus accel = K(omega x v):
    // test omega.y = +1 and keep the sign whose push aligns with the target side.
    const perp = createVec3(-fwd.z, 0, fwd.x);
    const desired = req.aimLateral >= 0 ? 1 : -1;
    const testAccel = cross(createVec3(), createVec3(0, 1, 0), velocity);
    const lateralDot = (testAccel.x * perp.x + testAccel.z * perp.z) * desired;
    angularVel.y = (lateralDot >= 0 ? 1 : -1) * sideCurl;
  }

  return {
    velocity, angularVel, speed, loftDeg, windupSec,
    isFake: false, overcooked, spreadRad: spread,
  };
}

/** Auto shot type for a headed ball (Spec 04 §4): HEADER when y > 1.35m. */
export function autoShotType(ballY: number, requested: ShotType): ShotType {
  if (ballY > 1.35 && requested !== 'CHIP' && requested !== 'FAKE_SHOT') return 'HEADER';
  return requested;
}
