// Striker FC — physics/BallPhysics.ts (Phase 03, Spec 04 §2)
// Fixed-timestep (1/60s) 3D ball dynamics: gravity, quadratic air drag,
// Magnus spin (omega x v), dry/wet bounce & rolling resistance, spin-to-bounce
// transfer, exact goalpost/crossbar cylinder collision (POST_HIT) and
// full-ball goal-line detection. Pure simulation — no rendering imports.
import { BALL_AREA, BALL_CONST, PITCH } from '../core/constants';
import { matchEventBus } from '../core/EventBus';
import {
createVec3, copyVec3, cross, dot, length, normalizeSafe, setVec3,
type Vec3,
} from '../core/math';
import type { ShotType, TeamSide } from '../core/types';

export interface BallState {
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  /** rad/s — Y = side-spin curl, axis perpendicular to travel = top/backspin. */
  angularVel: Vec3;
  ownerId: string | null;
  lastTouchId: string | null;
  lastTouchSide: TeamSide | null;
  isGrounded: boolean;
  shotInFlight: boolean;
  shotType: ShotType | null;
}

export interface BallStepEvents {
  postHit: boolean;
  postSpeed: number;
  /** Side whose goal was scored INTO is the conceding side; scorer attacks it. */
  goal: { concedingSide: TeamSide; scoringSide: TeamSide } | null;
  bounced: boolean;
}

export interface BallEnv {
  wet: boolean;
}

const DRAG_K = (0.5 * BALL_CONST.AIR_DENSITY * BALL_CONST.DRAG_COEFF * BALL_AREA) / BALL_CONST.MASS;
const MAGNUS_K = BALL_CONST.MAGNUS_COEFF / BALL_CONST.MASS;

interface Segment { ax: number; ay: number; az: number; bx: number; by: number; bz: number }

function goalSegments(sign: 1 | -1): Segment[] {
  const gx = sign * PITCH.HALF_LENGTH;
  const hw = PITCH.GOAL_HALF_WIDTH;
  const h = PITCH.GOAL_HEIGHT;
  return [
    { ax: gx, ay: 0, az: -hw, bx: gx, by: h, bz: -hw }, // left post
    { ax: gx, ay: 0, az: hw, bx: gx, by: h, bz: hw }, // right post
    { ax: gx, ay: h, az: -hw, bx: gx, by: h, bz: hw }, // crossbar
  ];
}
const SEGMENTS: Segment[] = [...goalSegments(1), ...goalSegments(-1)];

const _acc = createVec3();
const _magnus = createVec3();
const _closest = createVec3();
const _normal = createVec3();

export class BallPhysics {
  readonly state: BallState;
  private postCooldown = 0;
  private goalLatched = false;

  constructor(start?: Vec3) {
    const p = start ?? createVec3(0, BALL_CONST.RADIUS, 0);
    this.state = {
      pos: copyVec3(createVec3(), p),
      prevPos: copyVec3(createVec3(), p),
      vel: createVec3(),
      angularVel: createVec3(),
      ownerId: null,
      lastTouchId: null,
      lastTouchSide: null,
      isGrounded: true,
      shotInFlight: false,
      shotType: null,
    };
  }

  reset(x: number, z: number): void {
    const s = this.state;
    setVec3(s.pos, x, BALL_CONST.RADIUS, z);
    copyVec3(s.prevPos, s.pos);
    setVec3(s.vel, 0, 0, 0);
    setVec3(s.angularVel, 0, 0, 0);
    s.ownerId = null;
    s.shotInFlight = false;
    s.shotType = null;
    s.isGrounded = true;
    this.goalLatched = false;
    this.postCooldown = 0;
  }

  /** Direct kick: set velocity + spin, release ownership, mark touch. */
  kick(vel: Vec3, angularVel: Vec3, kickerId: string, side: TeamSide, shotType: ShotType | null): void {
    const s = this.state;
    copyVec3(s.vel, vel);
    copyVec3(s.angularVel, angularVel);
    s.ownerId = null;
    s.lastTouchId = kickerId;
    s.lastTouchSide = side;
    s.shotInFlight = shotType !== null;
    s.shotType = shotType;
    s.isGrounded = false;
    this.goalLatched = false;
  }

  speed(): number {
    return length(this.state.vel);
  }

  horizontalSpeed(): number {
    const v = this.state.vel;
    return Math.sqrt(v.x * v.x + v.z * v.z);
  }

  step(dt: number, env: BallEnv): BallStepEvents {
    const s = this.state;
    const events: BallStepEvents = { postHit: false, postSpeed: 0, goal: null, bounced: false };
    copyVec3(s.prevPos, s.pos);
    if (this.postCooldown > 0) this.postCooldown -= dt;

    // Owned ball is positioned by PlayerKinematics dribble attachment.
    if (s.ownerId !== null) {
      setVec3(s.vel, 0, 0, 0);
      s.isGrounded = true;
      return events;
    }

    const v = s.vel;
    const speed = length(v);

    // 1) Aerodynamic drag: a = -k * |v| * v  (quadratic).
    _acc.x = -DRAG_K * speed * v.x;
    _acc.y = -DRAG_K * speed * v.y;
    _acc.z = -DRAG_K * speed * v.z;
    // 2) Magnus: a += (Cm/m) * (omega x v) — curl & dip.
    cross(_magnus, s.angularVel, v);
    _acc.x += MAGNUS_K * _magnus.x;
    _acc.y += MAGNUS_K * _magnus.y;
    _acc.z += MAGNUS_K * _magnus.z;
    // 3) Gravity.
    _acc.y -= BALL_CONST.GRAVITY;

    // 4) Semi-implicit Euler.
    v.x += _acc.x * dt;
    v.y += _acc.y * dt;
    v.z += _acc.z * dt;
    s.pos.x += v.x * dt;
    s.pos.y += v.y * dt;
    s.pos.z += v.z * dt;

    // Spin decay.
    const airDecay = Math.max(0, 1 - BALL_CONST.SPIN_DECAY_AIR * dt);
    s.angularVel.x *= airDecay;
    s.angularVel.y *= airDecay;
    s.angularVel.z *= airDecay;

    // 5) Ground collision / rolling.
    const restitution = env.wet ? BALL_CONST.RESTITUTION_WET : BALL_CONST.RESTITUTION_GRASS;
    if (s.pos.y <= BALL_CONST.RADIUS) {
      s.pos.y = BALL_CONST.RADIUS;
      if (v.y < -0.75) {
        v.y = -v.y * restitution;
        // Spin-to-bounce transfer: backspin checks the ball, topspin kicks it on.
        v.x += s.angularVel.z * 0.035;
        v.z -= s.angularVel.x * 0.035;
        const damp = env.wet ? 0.94 : 0.88;
        v.x *= damp;
        v.z *= damp;
        events.bounced = true;
        if (Math.abs(v.y) < 0.9) { v.y = 0; s.isGrounded = true; }
      } else {
        v.y = 0;
        s.isGrounded = true;
        // Rolling resistance opposite the horizontal velocity vector.
        const rollFriction = env.wet ? BALL_CONST.ROLL_FRICTION_WET : BALL_CONST.ROLL_FRICTION_DRY;
        const hs = Math.sqrt(v.x * v.x + v.z * v.z);
        if (hs > 0) {
          const next = Math.max(0, hs - rollFriction * dt);
          const ratio = hs > 1e-9 ? next / hs : 0;
          v.x *= ratio;
          v.z *= ratio;
          if (next <= 0.001) { v.x = 0; v.z = 0; }
        }
        // Visual rolling spin from velocity; ground spin decay kills residual curl.
        s.angularVel.z = -v.x / BALL_CONST.RADIUS;
        s.angularVel.x = v.z / BALL_CONST.RADIUS;
        const groundDecay = Math.max(0, 1 - BALL_CONST.SPIN_DECAY_GROUND * dt);
        s.angularVel.y *= groundDecay;
      }
    } else {
      s.isGrounded = false;
    }

    // A shot stops being "in flight" once it dies on the ground.
    if (s.shotInFlight && s.isGrounded && this.horizontalSpeed() < 2.5) {
      s.shotInFlight = false;
    }

    // 6) Goalpost & crossbar cylinder collision.
    const hitDist = BALL_CONST.RADIUS + PITCH.POST_RADIUS;
    for (const seg of SEGMENTS) {
      const abx = seg.bx - seg.ax; const aby = seg.by - seg.ay; const abz = seg.bz - seg.az;
      const apx = s.pos.x - seg.ax; const apy = s.pos.y - seg.ay; const apz = s.pos.z - seg.az;
      const abLenSq = abx * abx + aby * aby + abz * abz;
      const t = abLenSq > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / abLenSq)) : 0;
      _closest.x = seg.ax + abx * t;
      _closest.y = seg.ay + aby * t;
      _closest.z = seg.az + abz * t;
      _normal.x = s.pos.x - _closest.x;
      _normal.y = s.pos.y - _closest.y;
      _normal.z = s.pos.z - _closest.z;
      const dist = length(_normal);
      if (dist < hitDist && dist > 1e-6) {
        normalizeSafe(_normal);
        // Push out along the normal, then reflect with post restitution.
        s.pos.x = _closest.x + _normal.x * hitDist;
        s.pos.y = _closest.y + _normal.y * hitDist;
        s.pos.z = _closest.z + _normal.z * hitDist;
        const vn = dot(v, _normal);
        if (vn < 0) {
          const impulse = (1 + BALL_CONST.RESTITUTION_POST) * vn;
          v.x -= impulse * _normal.x;
          v.y -= impulse * _normal.y;
          v.z -= impulse * _normal.z;
          // Posts kill some spin and add a random-free metallic rattle spin.
          s.angularVel.x *= 0.5; s.angularVel.y *= 0.5; s.angularVel.z *= 0.5;
          if (this.postCooldown <= 0) {
            events.postHit = true;
            events.postSpeed = Math.abs(vn);
            this.postCooldown = 0.18;
            matchEventBus.emit('POST_HIT', {
              speed: Math.abs(vn),
              position: { x: _closest.x, y: _closest.y, z: _closest.z },
            });
          }
        }
      }
    }

    // 7) Goal-line detection: the ENTIRE ball must cross, between posts, under bar.
    if (!this.goalLatched) {
      const r = BALL_CONST.RADIUS;
      if (
        s.pos.x - r > PITCH.HALF_LENGTH &&
        Math.abs(s.pos.z) < PITCH.GOAL_HALF_WIDTH &&
        s.pos.y < PITCH.GOAL_HEIGHT
      ) {
        this.goalLatched = true;
        events.goal = { concedingSide: 'AWAY', scoringSide: 'HOME' };
      } else if (
        s.pos.x + r < -PITCH.HALF_LENGTH &&
        Math.abs(s.pos.z) < PITCH.GOAL_HALF_WIDTH &&
        s.pos.y < PITCH.GOAL_HEIGHT
      ) {
        this.goalLatched = true;
        events.goal = { concedingSide: 'HOME', scoringSide: 'AWAY' };
      }
    }

    return events;
  }

  /** Interpolated render position between prevPos and pos. */
  interpolatedPos(alpha: number, out: Vec3): Vec3 {
    const s = this.state;
    out.x = s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha;
    out.y = s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha;
    out.z = s.prevPos.z + (s.pos.z - s.prevPos.z) * alpha;
    return out;
  }
}
