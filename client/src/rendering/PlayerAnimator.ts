// Striker FC — rendering/PlayerAnimator.ts (Phase 02, Spec 07 §3)
// Procedural joint animation with critically smooth blending between
// IDLE / WALK / JOG / SPRINT / KICK / PASS_KICK / SHOOT / tackles /
// HEADER_JUMP / GK dives / celebrations.
//
// Realistic-models pass (player-models spec §2): the pose gains feet
// (footLX/footRX — toe-off, heel-strike, locked-ankle strikes), headYaw
// (idle scan, crowd looks) and torsoRoll (spine counter-rotation); SHOOT
// is its own state, bigger than KICK (deeper windup, plant-leg absorb,
// follow-through hop, landing dip); the SIU celebration performs its
// 180° mid-air turn; blend rates are per-state (λ=14 strikes, λ=8
// locomotion, λ=5 celebrations); and the per-frame Object.keys()
// allocation is gone — a fixed POSE_KEYS array drives the lerp.
import type { PlayerRig } from './PlayerRig';

export type AnimState =
  | 'IDLE' | 'WALK' | 'JOG' | 'SPRINT' | 'KICK' | 'PASS_KICK' | 'SHOOT' | 'STAND_TACKLE' | 'SKILL' | 'SLIDE_TACKLE' | 'HEADER_JUMP'
  | 'GK_DIVE_HIGH' | 'GK_DIVE_LOW' | 'CELEBRATE_KNEE_SLIDE' | 'CELEBRATE_FIST_PUMP'
  | 'CELEBRATE_POINT_SKY' | 'CELEBRATE_SIU' | 'CELEBRATE_ARMS_OUT' | 'CELEBRATE_ARMS_CROSSED'
  | 'CELEBRATE_KNEEL_POINT' | 'CELEBRATE_EMBRACE';

export type SkillAnimId = 'STEPOVER' | 'ROULETTE' | 'FLICK';

interface Pose {
  pelvisY: number; pelvisTilt: number; bodyY: number; bodyRoll: number; bodyPitch: number;
  torsoPitch: number; torsoTwist: number; torsoRoll: number; headPitch: number; headYaw: number;
  armLX: number; armLZ: number; foreL: number; armRX: number; armRZ: number; foreR: number;
  legLX: number; shinL: number; legRX: number; shinR: number;
  footLX: number; footRX: number;
}

const BASE: Pose = {
  pelvisY: 0.96, pelvisTilt: 0, bodyY: 0, bodyRoll: 0, bodyPitch: 0,
  torsoPitch: 0, torsoTwist: 0, torsoRoll: 0, headPitch: 0, headYaw: 0,
  armLX: 0, armLZ: 0.12, foreL: -0.25, armRX: 0, armRZ: -0.12, foreR: -0.25,
  legLX: 0, shinL: 0.06, legRX: 0, shinR: 0.06,
  footLX: 0, footRX: 0,
};

/** Fixed key list for the pose lerp — iterating this array allocates
 *  nothing, unlike the old Object.keys(target) per rig per frame. */
const POSE_KEYS = Object.keys(BASE) as (keyof Pose)[];

/** Per-state blend rates (spec §2.6.4): strikes snap, celebrations settle. */
const LAMBDA: Partial<Record<AnimState, number>> = {
  KICK: 14, SHOOT: 14, SLIDE_TACKLE: 14,
  CELEBRATE_KNEE_SLIDE: 5, CELEBRATE_FIST_PUMP: 5, CELEBRATE_POINT_SKY: 5,
  CELEBRATE_SIU: 5, CELEBRATE_ARMS_OUT: 5, CELEBRATE_ARMS_CROSSED: 5,
  CELEBRATE_KNEEL_POINT: 5, CELEBRATE_EMBRACE: 5,
};

export class PlayerAnimator {
  state: AnimState = 'IDLE';
  phase = 0;
  private time = 0;
  private timeInState = 0;
  private pose: Pose = { ...BASE };
  private kickT = -1;
  private preferredFoot: 'RIGHT' | 'LEFT';
  diveDirection = 1;
  /** Skill-move flavour for the SKILL state (spec §2.3); null = generic crouch. */
  skillId: SkillAnimId | null = null;
  /** Showcase idle: the preferred foot rests on the ball (spec §2.2). */
  ballRest = false;
  /** Current celebration spin (radians) — the SIU's mid-air turn. It is
   *  applied to the rig's inner `body` group, NOT group.rotation.y: the
   *  match engine rewrites group facing every frame, and spinning the
   *  body gives the identical visual while guaranteeing the player ends
   *  the celebration facing exactly the way the engine wants (§5.4.4). */
  celebrationSpin = 0;
  private skillSpin = 0;

  constructor(preferredFoot: 'RIGHT' | 'LEFT' = 'RIGHT') {
    this.preferredFoot = preferredFoot;
  }

  setState(next: AnimState): void {
    if (next !== this.state) {
      if (next === 'KICK' || next === 'PASS_KICK' || next === 'STAND_TACKLE' || next === 'SHOOT') this.kickT = 0;
      this.timeInState = 0;
      this.state = next;
    }
  }

  triggerKick(): void { if (this.state !== 'KICK') this.timeInState = 0; this.state = 'KICK'; this.kickT = 0; }
  triggerShoot(): void { if (this.state !== 'SHOOT') this.timeInState = 0; this.state = 'SHOOT'; this.kickT = 0; }

  private targetPose(speed: number): Pose {
    const p: Pose = { ...BASE };
    const t = this.time;
    const ph = this.phase;
    const R = this.preferredFoot === 'RIGHT';
    switch (this.state) {
      case 'IDLE': {
        p.torsoPitch = 0.04;
        p.pelvisY = 0.945 + Math.sin(t * 1.8) * 0.008; // breathing
        p.bodyRoll = Math.sin(t * 0.9) * 0.02; // weight shift
        p.headYaw = Math.sin(t * 0.45) * 0.25; // looking around, not staring
        p.legLX = 0.06; p.legRX = -0.06;
        p.shinL = 0.12; p.shinR = 0.12;
        p.armLX = Math.sin(t * 1.8) * 0.05;
        p.armRX = -Math.sin(t * 1.8) * 0.05;
        if (this.ballRest) {
          // Foot resting on the ball (showcase): toe down on the ball top.
          if (R) { p.legRX = 0.15; p.shinR = 0.35; p.footRX = -0.4; p.legLX = 0; p.shinL = 0.08; }
          else { p.legLX = 0.15; p.shinL = 0.35; p.footLX = -0.4; p.legRX = 0; p.shinR = 0.08; }
        }
        break;
      }
      case 'WALK':
      case 'JOG':
      case 'SPRINT': {
        const sprint = this.state === 'SPRINT';
        const walk = this.state === 'WALK';
        const amp = sprint ? 0.95 : walk ? 0.30 : 0.62;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        p.legLX = s * amp;
        p.legRX = -s * amp;
        p.shinL = Math.max(0.08, -c) * (sprint ? 1.25 : 0.9) + 0.08;
        p.shinR = Math.max(0.08, c) * (sprint ? 1.25 : 0.9) + 0.08;
        p.armLX = -s * amp * 0.75;
        p.armRX = s * amp * 0.75;
        p.foreL = -0.5 - Math.max(0, s) * 0.4;
        p.foreR = -0.5 - Math.max(0, -s) * 0.4;
        p.torsoPitch = sprint ? 0.24 : walk ? 0.06 : 0.13;
        // Foot-contact rule (spec §2.2): the pelvis DIPS at foot strike
        // (|cos| peak) and rises at mid-swing — never the reverse.
        p.pelvisY = 0.95 - Math.abs(c) * 0.02 + Math.abs(s) * (sprint ? 0.05 : 0.035);
        p.pelvisTilt = Math.sin(ph) * 0.05;
        p.torsoRoll = Math.sin(ph) * (sprint ? 0.07 : walk ? 0.02 : 0.04); // spine counter-rotation
        if (sprint) {
          p.headPitch = -0.05; // sprinters look up, not at the ground
          p.armLZ = 0.07; p.armRZ = -0.07; // arms tucked closer than a jog
        }
        // Feet: heel-strike as the leg swings through front, toe-off at
        // push-off; sprinters stay on their toes (no heel-strike pose).
        const strike = walk ? 0.25 : 0.3;
        const off = sprint ? -0.65 : -0.5;
        const fl = s > 0.85 ? strike : s < -0.85 ? off : 0;
        const fr = -s > 0.85 ? strike : -s < -0.85 ? off : 0;
        if (sprint) {
          p.footLX = fl !== 0 ? fl : -0.35 * Math.max(0, -s);
          p.footRX = fr !== 0 ? fr : -0.35 * Math.max(0, s);
        } else {
          p.footLX = fl;
          p.footRX = fr;
        }
        break;
      }
      case 'KICK': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.55);
        const wind = Math.sin(Math.min(1, kt * 1.4) * Math.PI); // back then through
        const swing = kt < 0.35 ? -0.9 * (kt / 0.35) : -0.9 + 2.2 * ((kt - 0.35) / 0.65);
        if (R) {
          p.legRX = swing; p.shinR = kt < 0.35 ? 0.9 : Math.max(0.05, 0.9 - (kt - 0.35) * 2.4);
          p.legLX = 0.12; p.shinL = 0.1;
          p.footRX = kt < 0.35 ? -0.2 * (kt / 0.35) : -0.7; // toe pointed through the strike
          p.footLX = 0; // support foot flat
        } else {
          p.legLX = swing; p.shinL = kt < 0.35 ? 0.9 : Math.max(0.05, 0.9 - (kt - 0.35) * 2.4);
          p.legRX = 0.12; p.shinR = 0.1;
          p.footLX = kt < 0.35 ? -0.2 * (kt / 0.35) : -0.7;
          p.footRX = 0;
        }
        p.torsoTwist = wind * 0.35 * (R ? -1 : 1);
        p.torsoPitch = 0.1 + kt * 0.12;
        p.armLX = -0.7; p.armRX = 0.55; p.armLZ = 0.5; p.armRZ = -0.5;
        // Follow-through hop.
        p.bodyY = kt > 0.75 ? Math.sin(((kt - 0.75) / 0.25) * Math.PI) * 0.06 : 0;
        break;
      }
      case 'SHOOT': {
        // Bigger than KICK (spec §2.3): deeper windup, arms wide, the
        // plant leg absorbs the shot, follow-through hop + landing dip.
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.6);
        let swing: number;
        if (kt < 0.3) swing = -1.05 * (kt / 0.3);
        else if (kt < 0.65) swing = -1.05 + 2.5 * ((kt - 0.3) / 0.35);
        else swing = 1.45 - 0.35 * ((kt - 0.65) / 0.35);
        const shinKick = kt < 0.3 ? 1.0 : Math.max(0.03, 1.0 - (kt - 0.3) * 2.6);
        if (R) {
          p.legRX = swing; p.shinR = shinKick;
          p.legLX = 0.25; p.shinL = 0.45; // plant leg absorbs
          p.footRX = kt < 0.3 ? -0.3 * (kt / 0.3) : -0.8; // laces to the ball
          p.footLX = 0;
        } else {
          p.legLX = swing; p.shinL = shinKick;
          p.legRX = 0.25; p.shinR = 0.45;
          p.footLX = kt < 0.3 ? -0.3 * (kt / 0.3) : -0.8;
          p.footRX = 0;
        }
        p.torsoTwist = Math.sin(Math.min(1, kt * 1.4) * Math.PI) * 0.45 * (R ? -1 : 1);
        p.torsoPitch = 0.12 + kt * 0.18;
        p.armLX = -0.6; p.armRX = 0.6; p.armLZ = 0.65; p.armRZ = -0.65;
        p.bodyY = kt > 0.65 ? Math.sin(((kt - 0.65) / 0.35) * Math.PI) * 0.1 : 0;
        p.pelvisY = kt > 0.9 ? 0.96 - 0.06 * ((kt - 0.9) / 0.1) : 0.96;
        break;
      }
      case 'PASS_KICK': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.35);
        const swing = kt < 0.3 ? -0.55 * (kt / 0.3) : -0.55 + 1.25 * ((kt - 0.3) / 0.7);
        if (R) {
          p.legRX = swing; p.shinR = kt < 0.3 ? 0.6 : Math.max(0.05, 0.6 - (kt - 0.3) * 1.6);
          p.legLX = 0.1; p.shinL = 0.1;
          p.footRX = kt < 0.3 ? -0.25 * (kt / 0.3) : -0.55; // ankle locked, toe down
          p.footLX = 0;
        } else {
          p.legLX = swing; p.shinL = kt < 0.3 ? 0.6 : Math.max(0.05, 0.6 - (kt - 0.3) * 1.6);
          p.legRX = 0.1; p.shinR = 0.1;
          p.footLX = kt < 0.3 ? -0.25 * (kt / 0.3) : -0.55;
          p.footRX = 0;
        }
        p.torsoPitch = 0.08 + kt * 0.06; // follow-through lean
        p.armLX = -0.4; p.armRX = 0.35; p.armLZ = 0.35; p.armRZ = -0.35;
        break;
      }
      case 'STAND_TACKLE': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.35);
        const lunge = Math.sin(Math.min(1, kt * 1.15) * Math.PI);
        if (R) {
          p.legRX = -0.85 * lunge; p.shinR = 0.08; p.legLX = 0.3 * lunge; p.shinL = 0.5;
          p.footRX = 0.1 * lunge; // tackling foot flat, studs to the ball
        } else {
          p.legLX = -0.85 * lunge; p.shinL = 0.08; p.legRX = 0.3 * lunge; p.shinR = 0.5;
          p.footLX = 0.1 * lunge;
        }
        p.torsoPitch = 0.3 * lunge;
        p.torsoRoll = 0.12 * lunge * (R ? 1 : -1); // lean toward the tackling side
        p.pelvisY = 0.96 - 0.18 * lunge;
        p.armLX = -0.6; p.armRX = 0.5;
        break;
      }
      case 'SLIDE_TACKLE': {
        p.pelvisY = 0.3;
        p.bodyY = -0.62;
        p.torsoPitch = -0.95; // lean back ~55°
        p.legRX = -1.45; p.shinR = 0.05; // tackling leg straight forward (rig pitch sign)
        p.legLX = 0.7; p.shinL = 1.9; // trail leg tucked
        p.footRX = 0.15; // sole forward
        p.footLX = -0.3; // trail foot tucked
        p.armLX = -1.2; p.armRX = 0.6;
        break;
      }
      case 'SKILL': {
        // Low, balanced crouch while the engine performs the move
        // (Epic P1-1), with per-move flavour when skillId is set (§2.3).
        p.pelvisY = 0.88;
        p.torsoPitch = 0.16;
        p.legLX = 0.22; p.legRX = -0.18; p.shinL = 0.45; p.shinR = 0.4;
        p.armLZ = 0.55; p.armRZ = -0.55;
        p.armLX = -0.3; p.armRX = 0.3;
        const st = this.timeInState;
        if (this.skillId === 'STEPOVER') {
          const u = Math.min(1, st / 0.45);
          const sweep = -0.3 + Math.sin(u * Math.PI) * 0.8 + 0.1 * u; // −0.3 → +0.55 → −0.2
          if (R) { p.legRX = sweep; p.shinR = 0.3; p.footRX = sweep * 0.6; }
          else { p.legLX = sweep; p.shinL = 0.3; p.footLX = sweep * 0.6; }
        } else if (this.skillId === 'FLICK') {
          const u = Math.min(1, st / 0.15);
          const flick = -0.2 + 1.1 * (1 - (1 - u) * (1 - u));
          if (R) { p.legRX = flick; p.shinR = 0.15; p.footRX = -0.7; }
          else { p.legLX = flick; p.shinL = 0.15; p.footLX = -0.7; }
        } else if (this.skillId === 'ROULETTE') {
          p.pelvisY = 0.86; // deeper crouch; the spin itself is applied in update()
        }
        break;
      }
      case 'HEADER_JUMP': {
        const u = (t % 1.1) / 1.1;
        const jump = Math.sin(Math.min(1, u) * Math.PI);
        p.bodyY = jump * 0.55;
        p.torsoPitch = jump < 0.5 ? -0.28 * jump * 2 : 0.35 * (jump - 0.5) * 2; // arch then snap
        p.headPitch = p.torsoPitch * 0.7;
        p.legLX = 0.35; p.legRX = -0.3; p.shinL = 0.7; p.shinR = 0.55;
        p.armLZ = 0.7; p.armRZ = -0.7;
        if (u > 0.75) {
          // Landing: pelvis dips and the knees absorb instead of a stiff-legged touchdown.
          const d = Math.sin(((u - 0.75) / 0.25) * Math.PI);
          p.pelvisY = 0.96 - 0.08 * d;
          p.shinL = Math.max(p.shinL, 0.9 * d);
          p.shinR = Math.max(p.shinR, 0.9 * d);
        }
        break;
      }
      case 'GK_DIVE_HIGH':
      case 'GK_DIVE_LOW': {
        const high = this.state === 'GK_DIVE_HIGH';
        p.bodyRoll = this.diveDirection * (high ? 1.25 : 1.05);
        // Landing settle: after 0.5 s in the dive the body drops toward
        // the turf instead of floating at dive height (spec §2.4).
        const settle = this.timeInState <= 0.5 ? 1 : Math.max(0.5, 1 - (this.timeInState - 0.5));
        p.bodyY = high ? 0.55 * settle : 0.05;
        p.pelvisY = 0.7;
        p.armLX = -2.6; p.armRX = -2.75; p.foreL = -0.1; p.foreR = -0.1;
        p.armLZ = 0.4; p.armRZ = -0.4;
        p.legLX = 0.3; p.legRX = -0.5; p.shinL = 0.4; p.shinR = 0.3;
        p.torsoPitch = 0.08;
        break;
      }
      case 'CELEBRATE_KNEE_SLIDE': {
        p.pelvisY = 0.34;
        p.bodyY = -0.58;
        p.shinL = 2.2; p.shinR = 2.2; // knees folded under
        p.legLX = -0.4; p.legRX = -0.4;
        p.torsoPitch = -0.22;
        p.armLZ = 1.35; p.armRZ = -1.35; // arms wide
        // Arms rise first, then open wide (they used to start wide, which
        // read as kneeling, not sliding — spec §2.5).
        const rise = Math.min(1, this.timeInState / 0.3);
        p.armLX = -0.4 - 0.8 * rise;
        p.armRX = -0.4 - 0.8 * rise;
        break;
      }
      case 'CELEBRATE_FIST_PUMP': {
        // De-looped (Epic P0-5): two pumps, then the arm stays up and the
        // bounce settles — no infinite pumping.
        const pumps = Math.min(t / 0.48, 2);
        const bounceEnv = pumps >= 2 ? Math.max(0, 1 - (t - 0.96) * 1.4) : 1;
        const bounce = Math.abs(Math.sin(Math.min(t, 0.96) * 5.2)) * bounceEnv;
        p.bodyY = bounce * 0.22;
        p.armRX = -3.0 + Math.sin(Math.min(t, 0.96) * 10.4) * 0.18; // fist in the air
        p.foreR = -0.3;
        p.armLX = 0.3; p.foreL = -0.9;
        p.legLX = 0.12; p.legRX = -0.12; p.shinL = 0.25; p.shinR = 0.25;
        break;
      }
      case 'CELEBRATE_POINT_SKY': {
        // Messi: both index fingers to the sky, gentle sway.
        p.armLX = -2.9; p.armRX = -2.9; p.foreL = -0.05; p.foreR = -0.05;
        p.armLZ = 0.25; p.armRZ = -0.25;
        p.headPitch = -0.3;
        p.torsoPitch = -0.06;
        p.bodyY = Math.sin(t * 2.2) * 0.02;
        break;
      }
      case 'CELEBRATE_SIU': {
        // Ronaldo: jump, 180° turn in the air (celebrationSpin, applied
        // in update), land facing the crowd, arms thrown down-wide.
        const jump = Math.sin(Math.min(1, t / 0.85) * Math.PI);
        p.bodyY = jump * 0.5;
        p.pelvisY = 0.96 + jump * 0.1;
        p.armLZ = 1.5; p.armRZ = -1.5;
        p.armLX = 0.5; p.armRX = 0.5;
        p.legLX = 0.25; p.legRX = -0.25; p.shinL = 0.3; p.shinR = 0.3;
        p.torsoPitch = 0.08;
        break;
      }
      case 'CELEBRATE_ARMS_OUT': {
        p.armLZ = 1.45; p.armRZ = -1.45;
        p.armLX = -0.15; p.armRX = -0.15;
        p.headPitch = -0.18;
        p.headYaw = Math.sin(t * 1.2) * 0.3; // looking along the crowd
        p.bodyY = Math.abs(Math.sin(t * 3.4)) * 0.08;
        break;
      }
      case 'CELEBRATE_ARMS_CROSSED': {
        // Lewandowski: arms folded, ice-cold stare.
        p.armLX = 0.55; p.armRX = 0.55; p.armLZ = 0.95; p.armRZ = -0.95;
        p.foreL = -1.9; p.foreR = -1.9;
        p.torsoPitch = 0.03;
        break;
      }
      case 'CELEBRATE_KNEEL_POINT': {
        p.pelvisY = 0.52;
        p.bodyY = -0.4;
        p.legLX = 0.5; p.shinL = 1.9; // one knee down
        p.legRX = 0.15; p.shinR = 0.4;
        p.armRX = -2.85; p.foreR = -0.1; // point to the sky
        p.armLX = 0.25; p.foreL = -0.6;
        p.headPitch = -0.22;
        break;
      }
      case 'CELEBRATE_EMBRACE': {
        // Teammate joins in: arms wide open, jogging bounce in place.
        p.armLZ = 1.15; p.armRZ = -1.15;
        p.armLX = -0.5; p.armRX = -0.5;
        p.bodyY = Math.abs(Math.sin(t * 6.2)) * 0.1;
        p.legLX = 0.15; p.legRX = -0.15; p.shinL = 0.3; p.shinR = 0.3;
        break;
      }
    }
    void speed;
    return p;
  }

  update(rig: PlayerRig, dt: number, speed = 0): void {
    // Clock hygiene: callers mix rAF timestamps with performance.now()
    // (the rAF-starvation watchdog drives frames from a timer). If the two
    // clocks diverge, dt can arrive negative or non-finite — and the pose
    // lerp below turns a single bad dt into NaN joint transforms that make
    // the whole player vanish silently. A non-positive dt simply means
    // "hold the current pose", so sanitize at the door and self-heal if a
    // pose value ever does go non-finite.
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (!Number.isFinite(this.pose.pelvisY) || !Number.isFinite(this.pose.footLX)) this.pose = { ...BASE };
    this.time += dt;
    this.timeInState += dt;
    if (this.kickT >= 0) {
      this.kickT += dt;
      if (this.kickT > 0.6) {
        this.kickT = -1;
        if (this.state === 'KICK' || this.state === 'PASS_KICK' || this.state === 'STAND_TACKLE' || this.state === 'SHOOT') this.state = 'IDLE';
      }
    }
    const moving = this.state === 'JOG' || this.state === 'SPRINT' || this.state === 'WALK';
    if (moving) {
      // Epic P1-1: stride-length phase — steps come from distance covered,
      // not a fixed cadence. Stride grows 1.25 m (walk) → 2.15 m (sprint),
      // so a top-speed sprint lands at ~4.2 steps/s like a real athlete.
      const stride = 1.25 + 0.9 * Math.min(1, Math.max(0, speed / 9.5));
      this.phase += (speed / stride) * Math.PI * dt;
    }
    const target = this.targetPose(speed);
    const lambda = LAMBDA[this.state] ?? 8;
    const k = 1 - Math.exp(-lambda * dt);
    const cur = this.pose;
    for (let i = 0; i < POSE_KEYS.length; i += 1) {
      const key = POSE_KEYS[i]!;
      cur[key] += (target[key] - cur[key]) * k;
    }

    // SIU spin: ease to a full 180° across the jump, hold it while the
    // celebration lasts, ease back to 0 once it ends (spec §2.5).
    const spinTarget = this.state === 'CELEBRATE_SIU' ? Math.PI * Math.min(1, this.timeInState / 0.85) : 0;
    this.celebrationSpin += (spinTarget - this.celebrationSpin) * (1 - Math.exp(-6 * dt));
    if (spinTarget === 0 && Math.abs(this.celebrationSpin) < 0.0005) this.celebrationSpin = 0;
    // Roulette: the body turns 0.6 rad over the move (spec §2.3).
    const skillTarget = this.state === 'SKILL' && this.skillId === 'ROULETTE'
      ? 0.6 * Math.min(1, this.timeInState / 0.45) : 0;
    this.skillSpin += (skillTarget - this.skillSpin) * (1 - Math.exp(-8 * dt));
    if (skillTarget === 0 && Math.abs(this.skillSpin) < 0.0005) this.skillSpin = 0;

    const j = rig.joints;
    j.pelvis.position.y = cur.pelvisY;
    j.pelvis.rotation.z = cur.pelvisTilt;
    j.body.position.y = cur.bodyY;
    j.body.rotation.z = cur.bodyRoll;
    j.body.rotation.x = cur.bodyPitch;
    j.body.rotation.y = this.celebrationSpin + this.skillSpin;
    j.torso.rotation.x = cur.torsoPitch;
    j.torso.rotation.y = cur.torsoTwist;
    j.torso.rotation.z = cur.torsoRoll;
    j.head.rotation.x = cur.headPitch;
    j.head.rotation.y = cur.headYaw;
    j.armL.rotation.x = cur.armLX; j.armL.rotation.z = cur.armLZ; j.foreL.rotation.x = cur.foreL;
    j.armR.rotation.x = cur.armRX; j.armR.rotation.z = cur.armRZ; j.foreR.rotation.x = cur.foreR;
    // Rig legs pitch forward with negative X rotation (toe toward +Z is forward).
    j.legL.rotation.x = -cur.legLX; j.shinL.rotation.x = cur.shinL;
    j.legR.rotation.x = -cur.legRX; j.shinR.rotation.x = cur.shinR;
    // Feet share the leg sign convention: negative pose = toe down.
    if (j.footL) { j.footL.rotation.x = -cur.footLX; j.footR.rotation.x = -cur.footRX; }
  }
}
