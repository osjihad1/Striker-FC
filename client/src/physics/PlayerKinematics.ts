// Striker FC — physics/PlayerKinematics.ts (Phase 03, Spec 04 §6)
// Acceleration, sprint speed scaled by sprintSpeed, turning radius, rhythmic
// dribble ball attachment, stamina drain/recovery with a soft fatigue ceiling,
// and standing / slide tackle impulse boxes.
import { BALL_CONST } from '../core/constants';
import { clamp, createVec3, type Vec3 } from '../core/math';
import type { PlayerTemplate } from '../core/types';

export interface MoveInput {
  /** World-space desired move direction (X/Z), any magnitude. */
  dirX: number;
  dirZ: number;
  /** 0..1 analog magnitude from the stick / keys. */
  magnitude: number;
  sprint: boolean;
}

export interface TackleResult {
  hit: boolean;
  touchedBallFirst: boolean;
  /** 0..1 — drives foul severity downstream (Phase 05 rules). */
  closingSeverity: number;
}

const TURN_RATE_SPRINT = (140 * Math.PI) / 180; // rad/s
const TURN_RATE_JOG = (265 * Math.PI) / 180;
const TURN_RATE_IDLE = (560 * Math.PI) / 180;

export function maxSprintSpeed(template: PlayerTemplate): number {
  // Epic P0-8: pace range widened to 5.8–9.8 m/s.
  return 5.8 + (template.subStats.sprintSpeed / 100) * 4.0;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PlayerKinematics {
  /** Mutable: Phase 06 live substitutions swap the template in place. */
  template: PlayerTemplate;
  readonly id: string;
  pos: Vec3 = createVec3();
  vel: Vec3 = createVec3();
  /** Facing in the XZ plane: 0 = +X, positive rotates toward +Z. */
  facingRad = 0;
  speed = 0;
  stamina01 = 1;
  /** Soft ceiling that decays over a match so late-game legs are heavy. */
  maxRecoverable01 = 1;
  stridePhase = 0;
  sprinting = false;
  private burstTimer = 0;
  private burstMult = 1;
  slideTimer = 0;
  /** Set by SkillMoveEngine (roulette frontal-contain immunity). */
  frontalImmuneTimer = 0;

  constructor(template: PlayerTemplate, id: string, x: number, z: number, facingRad: number) {
    this.template = template;
    this.id = id;
    this.pos.x = x; this.pos.z = z;
    this.facingRad = facingRad;
  }

  applySpeedBurst(mult: number, durationSec: number): void {
    this.burstMult = Math.max(this.burstMult, mult);
    this.burstTimer = Math.max(this.burstTimer, durationSec);
  }

  // Epic P0-8: real dive velocity — an external impulse (m/s) applied to
  // the position for a fixed window, independent of facing and run speed.
  private impulseX = 0;
  private impulseZ = 0;
  private impulseTimer = 0;

  applyImpulse(vx: number, vz: number, durationSec: number): void {
    this.impulseX = vx;
    this.impulseZ = vz;
    this.impulseTimer = Math.max(this.impulseTimer, durationSec);
  }

  get impulseActive(): boolean { return this.impulseTimer > 0; }

  get burstActive(): boolean { return this.burstTimer > 0; }

  /** Fatigue multiplier on top speed (Epic P0-8): a continuous curve from
   *  70% stamina — 1.00 @100% → 0.97 @70% → 0.94 @50% → 0.90 @30% → 0.82 @0%
   *  — replacing the old 25% cliff where legs were free until they died. */
  fatigueSpeedFactor(): number {
    const s = this.stamina01;
    const pts: [number, number][] = [[0, 0.82], [0.3, 0.90], [0.5, 0.94], [0.7, 0.97], [1, 1]];
    for (let i = 1; i < pts.length; i += 1) {
      if (s <= pts[i]![0]) {
        const [x0, y0] = pts[i - 1]!;
        const [x1, y1] = pts[i]!;
        return y0 + ((y1 - y0) * (s - x0)) / (x1 - x0);
      }
    }
    return 1;
  }

  update(dt: number, input: MoveInput, elapsedMatchMinutes: number): void {
    const sub = this.template.subStats;
    if (this.burstTimer > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) this.burstMult = 1;
    }
    if (this.frontalImmuneTimer > 0) this.frontalImmuneTimer -= dt;
    if (this.slideTimer > 0) this.slideTimer -= dt;
    this.maxRecoverable01 = Math.max(0.55, 1 - 0.4 * clamp(elapsedMatchMinutes / 90, 0, 1));

    const mag = clamp(input.magnitude, 0, 1);
    const hasInput = mag > 0.04 && (Math.abs(input.dirX) > 0.001 || Math.abs(input.dirZ) > 0.001);
    this.sprinting = hasInput && input.sprint;

    const maxSprint = maxSprintSpeed(this.template) * this.fatigueSpeedFactor() * this.burstMult;
    const jogSpeed = 0.62 * maxSprintSpeed(this.template);
    let targetSpeed = 0;
    if (hasInput) {
      targetSpeed = this.sprinting ? maxSprint * Math.max(0.55, mag) : jogSpeed * Math.min(1, mag / 0.62 + 0.25);
      if (!this.sprinting) targetSpeed = Math.min(targetSpeed, jogSpeed);
    }
    if (this.slideTimer > 0) targetSpeed = Math.max(targetSpeed, 7.2); // slide carries momentum

    // Turn toward the input direction at the capped turn rate.
    if (hasInput) {
      const desired = Math.atan2(input.dirZ, input.dirX);
      const baseRate = this.sprinting ? TURN_RATE_SPRINT : this.speed > 0.5 ? TURN_RATE_JOG : TURN_RATE_IDLE;
      const techBonus = this.template.playStyles.includes('TECHNICAL_DRIBBLER') && this.sprinting ? 1.15 : 1;
      const maxTurn = baseRate * techBonus * dt;
      const diff = wrapAngle(desired - this.facingRad);
      this.facingRad += clamp(diff, -maxTurn, maxTurn);
    }

    // Accelerate / decelerate toward target speed.
    const accel = this.sprinting
      ? 9.5 + sub.acceleration * 0.09
      : 12 + sub.acceleration * 0.07;
    const decel = 13.5;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + accel * dt);
    else this.speed = Math.max(targetSpeed, this.speed - decel * dt);

    this.vel.x = Math.cos(this.facingRad) * this.speed;
    this.vel.z = Math.sin(this.facingRad) * this.speed;
    this.vel.y = 0;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.impulseTimer > 0) {
      this.pos.x += this.impulseX * dt;
      this.pos.z += this.impulseZ * dt;
      this.impulseTimer -= dt;
      if (this.impulseTimer <= 0) { this.impulseX = 0; this.impulseZ = 0; }
    }
    this.stridePhase += this.speed * dt * 2.15;

    // Stamina: sprint drains fastest; hard jogging / pressing also costs
    // (Epic P0-8 — stamina was sprint-only before), slow movement recovers.
    if (this.sprinting && this.speed > jogSpeed * 0.9) {
      const drainFactor = clamp(1.2 - (sub.stamina / 100) * 0.5, 0.7, 1.2);
      this.stamina01 = Math.max(0, this.stamina01 - 0.022 * drainFactor * dt);
    } else if (this.speed > jogSpeed * 0.75) {
      this.stamina01 = Math.max(0, this.stamina01 - 0.005 * dt);
    } else if (this.speed < jogSpeed * 0.75) {
      this.stamina01 = Math.min(this.maxRecoverable01, this.stamina01 + 0.008 * dt);
    }
  }

  /**
   * Dribble attachment: the ball sits ahead along the facing vector with a
   * rhythmic foot-tap pulse synced to the stride cycle. Hard sprint turns
   * widen the touch (unless TECHNICAL_DRIBBLER keeps it glued).
   */
  dribbleBallPos(out: Vec3, _turnRateRadPerSec: number): Vec3 {
    let touch = 0.48 + Math.sin(this.stridePhase) * 0.05;
    if (this.speed > 6.5) touch += 0.12;
    out.x = this.pos.x + Math.cos(this.facingRad) * touch;
    out.z = this.pos.z + Math.sin(this.facingRad) * touch;
    out.y = BALL_CONST.RADIUS;
    return out;
  }

  /** Standing tackle: impulse box 1.7m long in front of the defender. */
  standingTackle(ballPos: Vec3, ballSpeed: number): TackleResult {
    return this.tackleBox(ballPos, ballSpeed, 1.7, 0.95, this.template.subStats.standingTackle);
  }

  /** Slide tackle: longer 2.7m lunge box along the movement vector. */
  slideTackle(ballPos: Vec3, ballSpeed: number): TackleResult {
    this.slideTimer = 0.55;
    return this.tackleBox(ballPos, ballSpeed, 2.7, 1.1, this.template.subStats.slidingTackle);
  }

  private tackleBox(ballPos: Vec3, ballSpeed: number, reach: number, halfWidth: number, stat: number): TackleResult {
    const fx = Math.cos(this.facingRad); const fz = Math.sin(this.facingRad);
    const dx = ballPos.x - this.pos.x; const dz = ballPos.z - this.pos.z;
    const forward = dx * fx + dz * fz;
    const lateral = Math.abs(-dx * fz + dz * fx);
    const inBox = forward > -0.25 && forward < reach && lateral < halfWidth;
    if (!inBox) return { hit: false, touchedBallFirst: false, closingSeverity: 0 };
    const quality = stat / 100;
    const touchedBallFirst = quality * 0.85 + (ballSpeed < 4 ? 0.18 : 0) > 0.42;
    const closingSeverity = clamp((this.speed + ballSpeed) / 16, 0, 1);
    return { hit: true, touchedBallFirst, closingSeverity };
  }
}
