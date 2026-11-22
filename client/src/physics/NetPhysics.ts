// Striker FC — physics/NetPhysics.ts (Phase 03, Spec 04 §3)
// Mass-spring cloth simulation for one goal's net (Back, Top, Left, Right
// panels as laid out by GoalRenderer). Springs are auto-built by proximity
// over the renderer's vertex array; the simulation writes straight back into
// that same Float32Array so GoalRenderer's BufferGeometry shows the ripple.
import { BALL_CONST, PITCH } from '../core/constants';
import type { Vec3 } from '../core/math';

const SPRING_K = 180;
const SPRING_DAMPING = 8.5;
const MAX_SPRING_DIST = 0.62;
const SUBSTEPS = 3;
const BALL_INFLUENCE = 0.65;

interface Spring { a: number; b: number; rest: number }

export class NetPhysics {
  private readonly positions: Float32Array;
  private readonly rest: Float32Array;
  private readonly vel: Float32Array;
  private readonly force: Float32Array;
  private readonly invMass: Float32Array;
  private readonly springs: Spring[] = [];
  private readonly count: number;
  /** World X of the goal line this net hangs from (+52.5 or -52.5). */
  private readonly goalX: number;
  private readonly dirSign: 1 | -1;
  energy = 0;

  constructor(netPositions: Float32Array, side: 'LEFT' | 'RIGHT') {
    this.positions = netPositions;
    this.count = netPositions.length / 3;
    this.rest = new Float32Array(netPositions);
    this.vel = new Float32Array(netPositions.length);
    this.force = new Float32Array(netPositions.length);
    this.invMass = new Float32Array(this.count).fill(1);
    this.dirSign = side === 'LEFT' ? -1 : 1;
    this.goalX = this.dirSign * PITCH.HALF_LENGTH;

    // Pinned: vertices touching the front frame (local x = 0) or the ground.
    for (let i = 0; i < this.count; i += 1) {
      const x = netPositions[i * 3] ?? 0;
      const y = netPositions[i * 3 + 1] ?? 0;
      if (Math.abs(x) < 0.02 || y < 0.02) this.invMass[i] = 0;
    }
    // Structural springs by proximity (grid neighbours across all 4 panels).
    for (let i = 0; i < this.count; i += 1) {
      const ix = this.rest[i * 3] ?? 0; const iy = this.rest[i * 3 + 1] ?? 0; const iz = this.rest[i * 3 + 2] ?? 0;
      for (let j = i + 1; j < this.count; j += 1) {
        const dx = (this.rest[j * 3] ?? 0) - ix;
        const dy = (this.rest[j * 3 + 1] ?? 0) - iy;
        const dz = (this.rest[j * 3 + 2] ?? 0) - iz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 0.05 && d < MAX_SPRING_DIST) this.springs.push({ a: i, b: j, rest: d });
      }
    }
  }

  get vertexCount(): number { return this.count; }
  get springCount(): number { return this.springs.length; }

  reset(): void {
    this.positions.set(this.rest);
    this.vel.fill(0);
    this.energy = 0;
  }

  /**
   * Advance the cloth and interact with the ball. `ballPos`/`ballVel` are in
   * WORLD space; ballVel is damped and ballPos clamped when the net catches.
   */
  step(dt: number, ballPos: Vec3, ballVel: Vec3): void {
    const p = this.positions;
    const inGoalBox =
      Math.sign(ballPos.x) === this.dirSign &&
      Math.abs(ballPos.x) > PITCH.HALF_LENGTH - 0.05 &&
      Math.abs(ballPos.x) < PITCH.HALF_LENGTH + PITCH.GOAL_DEPTH + 0.4 &&
      Math.abs(ballPos.z) <= PITCH.GOAL_HALF_WIDTH + 0.35 &&
      ballPos.y <= PITCH.GOAL_HEIGHT + 0.35;

    // Ball -> net impulse (local coords: world minus goal origin on X).
    let ballTouchedNet = false;
    if (inGoalBox) {
      const bx = ballPos.x - this.goalX;
      const by = ballPos.y;
      const bz = ballPos.z;
      for (let i = 0; i < this.count; i += 1) {
        if (this.invMass[i] === 0) continue;
        const dx = (p[i * 3] ?? 0) - bx;
        const dy = (p[i * 3 + 1] ?? 0) - by;
        const dz = (p[i * 3 + 2] ?? 0) - bz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < BALL_INFLUENCE * BALL_INFLUENCE) {
          const falloff = 1 - Math.sqrt(dSq) / BALL_INFLUENCE;
          this.vel[i * 3] = (this.vel[i * 3] ?? 0) + ballVel.x * 0.45 * falloff;
          this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] ?? 0) + ballVel.y * 0.45 * falloff;
          this.vel[i * 3 + 2] = (this.vel[i * 3 + 2] ?? 0) + ballVel.z * 0.45 * falloff;
          ballTouchedNet = true;
        }
      }
      if (ballTouchedNet) {
        // The net catches the ball: bleed its velocity hard each tick.
        ballVel.x *= 0.8;
        ballVel.y *= 0.8;
        ballVel.z *= 0.8;
      }
      // Clamp the ball inside the net cage.
      const maxX = PITCH.HALF_LENGTH + PITCH.GOAL_DEPTH - BALL_CONST.RADIUS;
      if (Math.abs(ballPos.x) > maxX) {
        ballPos.x = Math.sign(ballPos.x) * maxX;
        if (Math.sign(ballVel.x) === Math.sign(ballPos.x)) ballVel.x *= -0.08;
      }
      const maxZ = PITCH.GOAL_HALF_WIDTH - BALL_CONST.RADIUS * 0.4;
      if (Math.abs(ballPos.z) > maxZ && Math.abs(ballPos.x) > PITCH.HALF_LENGTH) {
        ballPos.z = Math.sign(ballPos.z) * maxZ;
        ballVel.z *= -0.1;
      }
    }

    const subDt = dt / SUBSTEPS;
    for (let sub = 0; sub < SUBSTEPS; sub += 1) {
      this.force.fill(0);
      for (const s of this.springs) {
        const ai = s.a * 3; const bi = s.b * 3;
        const dx = (p[bi] ?? 0) - (p[ai] ?? 0);
        const dy = (p[bi + 1] ?? 0) - (p[ai + 1] ?? 0);
        const dz = (p[bi + 2] ?? 0) - (p[ai + 2] ?? 0);
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-6) continue;
        const nx = dx / len; const ny = dy / len; const nz = dz / len;
        const relVel =
          ((this.vel[bi] ?? 0) - (this.vel[ai] ?? 0)) * nx +
          ((this.vel[bi + 1] ?? 0) - (this.vel[ai + 1] ?? 0)) * ny +
          ((this.vel[bi + 2] ?? 0) - (this.vel[ai + 2] ?? 0)) * nz;
        const f = SPRING_K * (len - s.rest) + SPRING_DAMPING * relVel;
        const fx = f * nx; const fy = f * ny; const fz = f * nz;
        if (this.invMass[s.a] !== 0) {
          this.force[ai] = (this.force[ai] ?? 0) + fx;
          this.force[ai + 1] = (this.force[ai + 1] ?? 0) + fy;
          this.force[ai + 2] = (this.force[ai + 2] ?? 0) + fz;
        }
        if (this.invMass[s.b] !== 0) {
          this.force[bi] = (this.force[bi] ?? 0) - fx;
          this.force[bi + 1] = (this.force[bi + 1] ?? 0) - fy;
          this.force[bi + 2] = (this.force[bi + 2] ?? 0) - fz;
        }
      }
      let e = 0;
      for (let i = 0; i < this.count; i += 1) {
        if (this.invMass[i] === 0) {
          p[i * 3] = this.rest[i * 3] ?? 0;
          p[i * 3 + 1] = this.rest[i * 3 + 1] ?? 0;
          p[i * 3 + 2] = this.rest[i * 3 + 2] ?? 0;
          continue;
        }
        const idx = i * 3;
        // Slight gravity sag + global damping so ripples settle.
        this.force[idx + 1] = (this.force[idx + 1] ?? 0) - 2.4;
        const dampFactor = Math.max(0, 1 - 1.6 * subDt);
        this.vel[idx] = ((this.vel[idx] ?? 0) + (this.force[idx] ?? 0) * subDt) * dampFactor;
        this.vel[idx + 1] = ((this.vel[idx + 1] ?? 0) + (this.force[idx + 1] ?? 0) * subDt) * dampFactor;
        this.vel[idx + 2] = ((this.vel[idx + 2] ?? 0) + (this.force[idx + 2] ?? 0) * subDt) * dampFactor;
        p[idx] = (p[idx] ?? 0) + (this.vel[idx] ?? 0) * subDt;
        p[idx + 1] = Math.max(0, (p[idx + 1] ?? 0) + (this.vel[idx + 1] ?? 0) * subDt);
        p[idx + 2] = (p[idx + 2] ?? 0) + (this.vel[idx + 2] ?? 0) * subDt;
        e += Math.abs(this.vel[idx] ?? 0) + Math.abs(this.vel[idx + 1] ?? 0) + Math.abs(this.vel[idx + 2] ?? 0);
      }
      this.energy = e / Math.max(1, this.count);
    }
  }
}
