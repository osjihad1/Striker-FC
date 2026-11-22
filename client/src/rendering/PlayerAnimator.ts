// Striker FC — rendering/PlayerAnimator.ts (Phase 02, Spec 07 §3)
// Procedural joint animation with critically smooth blending (lerp @ 14·dt)
// between IDLE / JOG / SPRINT / KICK / SLIDE_TACKLE / HEADER_JUMP /
// GK_DIVE_HIGH / GK_DIVE_LOW / CELEBRATE_KNEE_SLIDE / CELEBRATE_FIST_PUMP.
import type { PlayerRig } from './PlayerRig';

export type AnimState =
  | 'IDLE' | 'WALK' | 'JOG' | 'SPRINT' | 'KICK' | 'PASS_KICK' | 'STAND_TACKLE' | 'SKILL' | 'SLIDE_TACKLE' | 'HEADER_JUMP'
  | 'GK_DIVE_HIGH' | 'GK_DIVE_LOW' | 'CELEBRATE_KNEE_SLIDE' | 'CELEBRATE_FIST_PUMP'
  | 'CELEBRATE_POINT_SKY' | 'CELEBRATE_SIU' | 'CELEBRATE_ARMS_OUT' | 'CELEBRATE_ARMS_CROSSED'
  | 'CELEBRATE_KNEEL_POINT' | 'CELEBRATE_EMBRACE';

interface Pose {
  pelvisY: number; pelvisTilt: number; bodyY: number; bodyRoll: number; bodyPitch: number;
  torsoPitch: number; torsoTwist: number; headPitch: number;
  armLX: number; armLZ: number; foreL: number; armRX: number; armRZ: number; foreR: number;
  legLX: number; shinL: number; legRX: number; shinR: number;
}

const BASE: Pose = {
  pelvisY: 0.96, pelvisTilt: 0, bodyY: 0, bodyRoll: 0, bodyPitch: 0,
  torsoPitch: 0, torsoTwist: 0, headPitch: 0,
  armLX: 0, armLZ: 0.12, foreL: -0.25, armRX: 0, armRZ: -0.12, foreR: -0.25,
  legLX: 0, shinL: 0.06, legRX: 0, shinR: 0.06,
};

export class PlayerAnimator {
  state: AnimState = 'IDLE';
  phase = 0;
  private time = 0;
  private pose: Pose = { ...BASE };
  private kickT = -1;
  private preferredFoot: 'RIGHT' | 'LEFT';
  diveDirection = 1;

  constructor(preferredFoot: 'RIGHT' | 'LEFT' = 'RIGHT') {
    this.preferredFoot = preferredFoot;
  }

  setState(next: AnimState): void {
    if ((next === 'KICK' || next === 'PASS_KICK' || next === 'STAND_TACKLE') && this.state !== next) this.kickT = 0;
    this.state = next;
  }

  triggerKick(): void { this.state = 'KICK'; this.kickT = 0; }

  private targetPose(speed: number): Pose {
    const p: Pose = { ...BASE };
    const t = this.time;
    const ph = this.phase;
    switch (this.state) {
      case 'IDLE': {
        p.torsoPitch = 0.04;
        p.pelvisY = 0.945 + Math.sin(t * 1.8) * 0.008; // breathing
        p.legLX = 0.06; p.legRX = -0.06;
        p.shinL = 0.12; p.shinR = 0.12;
        p.armLX = Math.sin(t * 1.8) * 0.05;
        p.armRX = -Math.sin(t * 1.8) * 0.05;
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
        p.torsoPitch = sprint ? 0.24 : 0.13;
        p.pelvisY = 0.95 + Math.abs(Math.sin(ph)) * (sprint ? 0.055 : 0.035);
        p.pelvisTilt = Math.sin(ph) * 0.05;
        break;
      }
      case 'KICK': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.55);
        const wind = Math.sin(Math.min(1, kt * 1.4) * Math.PI); // back then through
        const swing = kt < 0.35 ? -0.9 * (kt / 0.35) : -0.9 + 2.2 * ((kt - 0.35) / 0.65);
        const kickLeg = this.preferredFoot === 'RIGHT' ? 'R' : 'L';
        if (kickLeg === 'R') { p.legRX = swing; p.shinR = kt < 0.35 ? 0.9 : Math.max(0.05, 0.9 - (kt - 0.35) * 2.4); p.legLX = 0.12; p.shinL = 0.1; }
        else { p.legLX = swing; p.shinL = kt < 0.35 ? 0.9 : Math.max(0.05, 0.9 - (kt - 0.35) * 2.4); p.legRX = 0.12; p.shinR = 0.1; }
        p.torsoTwist = wind * 0.35 * (kickLeg === 'R' ? -1 : 1);
        p.torsoPitch = 0.1 + kt * 0.12;
        p.armLX = -0.7; p.armRX = 0.55; p.armLZ = 0.5; p.armRZ = -0.5;
        break;
      }
      case 'SLIDE_TACKLE': {
        p.pelvisY = 0.3;
        p.bodyY = -0.62;
        p.torsoPitch = -0.95; // lean back ~55°
        p.legRX = -1.45; p.shinR = 0.05; // tackling leg straight forward (rig pitch sign)
        p.legLX = 0.7; p.shinL = 1.9; // trail leg tucked
        p.armLX = -1.2; p.armRX = 0.6;
        break;
      }
      case 'HEADER_JUMP': {
        const jump = Math.sin(Math.min(1, (t % 1.1) / 1.1) * Math.PI);
        p.bodyY = jump * 0.55;
        p.torsoPitch = jump < 0.5 ? -0.28 * jump * 2 : 0.35 * (jump - 0.5) * 2; // arch then snap
        p.headPitch = p.torsoPitch * 0.7;
        p.legLX = 0.35; p.legRX = -0.3; p.shinL = 0.7; p.shinR = 0.55;
        p.armLZ = 0.7; p.armRZ = -0.7;
        break;
      }
      case 'GK_DIVE_HIGH':
      case 'GK_DIVE_LOW': {
        const high = this.state === 'GK_DIVE_HIGH';
        p.bodyRoll = this.diveDirection * (high ? 1.25 : 1.05);
        p.bodyY = high ? 0.55 : 0.05;
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
        p.armLX = -0.4; p.armRX = -0.4;
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
        p.armLX = -2.9; p.armRX = -2.9; p.foreL = -0.15; p.foreR = -0.15;
        p.armLZ = 0.25; p.armRZ = -0.25;
        p.headPitch = -0.3;
        p.torsoPitch = -0.06;
        p.bodyY = Math.sin(t * 2.2) * 0.02;
        break;
      }
      case 'CELEBRATE_SIU': {
        // Ronaldo: one jump with a quarter turn, arms thrown down-wide.
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
      case 'PASS_KICK': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.35);
        const swing = kt < 0.3 ? -0.55 * (kt / 0.3) : -0.55 + 1.25 * ((kt - 0.3) / 0.7);
        if (this.preferredFoot === 'RIGHT') { p.legRX = swing; p.shinR = kt < 0.3 ? 0.6 : Math.max(0.05, 0.6 - (kt - 0.3) * 1.6); p.legLX = 0.1; p.shinL = 0.1; }
        else { p.legLX = swing; p.shinL = kt < 0.3 ? 0.6 : Math.max(0.05, 0.6 - (kt - 0.3) * 1.6); p.legRX = 0.1; p.shinR = 0.1; }
        p.torsoPitch = 0.08;
        p.armLX = -0.4; p.armRX = 0.35; p.armLZ = 0.35; p.armRZ = -0.35;
        break;
      }
      case 'STAND_TACKLE': {
        const kt = this.kickT < 0 ? 1 : Math.min(1, this.kickT / 0.35);
        const lunge = Math.sin(Math.min(1, kt * 1.15) * Math.PI);
        if (this.preferredFoot === 'RIGHT') { p.legRX = -0.85 * lunge; p.shinR = 0.08; p.legLX = 0.3 * lunge; p.shinL = 0.5; }
        else { p.legLX = -0.85 * lunge; p.shinL = 0.08; p.legRX = 0.3 * lunge; p.shinR = 0.5; }
        p.torsoPitch = 0.3 * lunge;
        p.pelvisY = 0.96 - 0.18 * lunge;
        p.armLX = -0.6; p.armRX = 0.5;
        break;
      }
      case 'SKILL': {
        // Run cycle freezes during a skill move (Epic P1-1): a low,
        // balanced crouch while the engine performs the move.
        p.pelvisY = 0.88;
        p.torsoPitch = 0.16;
        p.legLX = 0.22; p.legRX = -0.18; p.shinL = 0.45; p.shinR = 0.4;
        p.armLZ = 0.55; p.armRZ = -0.55;
        p.armLX = -0.3; p.armRX = 0.3;
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
    if (!Number.isFinite(this.pose.pelvisY)) this.pose = { ...BASE };
    this.time += dt;
    if (this.kickT >= 0) {
      this.kickT += dt;
      if (this.kickT > 0.6) { this.kickT = -1; if (this.state === 'KICK' || this.state === 'PASS_KICK' || this.state === 'STAND_TACKLE') this.state = 'IDLE'; }
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
    const k = 1 - Math.exp(-(this.state === 'KICK' || this.state === 'SLIDE_TACKLE' ? 14 : 8) * dt);
    const cur = this.pose;
    (Object.keys(target) as (keyof Pose)[]).forEach((key) => { cur[key] += (target[key] - cur[key]) * k; });

    const j = rig.joints;
    j.pelvis.position.y = cur.pelvisY;
    j.pelvis.rotation.z = cur.pelvisTilt;
    j.body.position.y = cur.bodyY;
    j.body.rotation.z = cur.bodyRoll;
    j.body.rotation.x = cur.bodyPitch;
    j.torso.rotation.x = cur.torsoPitch;
    j.torso.rotation.y = cur.torsoTwist;
    j.head.rotation.x = cur.headPitch;
    j.armL.rotation.x = cur.armLX; j.armL.rotation.z = cur.armLZ; j.foreL.rotation.x = cur.foreL;
    j.armR.rotation.x = cur.armRX; j.armR.rotation.z = cur.armRZ; j.foreR.rotation.x = cur.foreR;
    // Rig legs pitch forward with negative X rotation (toe toward +Z is forward).
    j.legL.rotation.x = -cur.legLX; j.shinL.rotation.x = cur.shinL;
    j.legR.rotation.x = -cur.legRX; j.shinR.rotation.x = cur.shinR;
  }
}
