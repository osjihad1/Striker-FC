// Striker FC — physics/PracticeEngine.ts (Phase 03 sandbox wiring)
// Open Pitch Practice: the controlled home player dribbles with
// PlayerKinematics, passes between teammates via PassCalculator, shoots via
// ShotCalculator into NetPhysics-backed goals, and performs SkillMoveEngine
// moves — all stepped from App's fixed-timestep GameLoop at 1/60s.
import { PITCH } from '../core/constants';
import { matchEventBus } from '../core/EventBus';
import { createVec3, mulberry32, type Vec3 } from '../core/math';
import type { AnimState } from '../rendering/PlayerAnimator';
import type { GameAction } from '../controls/InputManager';
import type { InputManager } from '../controls/InputManager';
import { chooseSwitchTarget } from '../controls/PlayerSwitcher';
import { getFormationById } from '../data/Formations';
import { getAllPlayers } from '../data/PlayerDatabase';
import type { PassType, PlayerTemplate, ShotType, SkillMoveId } from '../core/types';
import { BallPhysics } from './BallPhysics';
import type { NetPhysics } from './NetPhysics';
import { computePass, findPassTarget, type PassCandidate } from './PassCalculator';
import { PlayerKinematics } from './PlayerKinematics';
import { computeShot, autoShotType } from './ShotCalculator';
import { SkillMoveEngine, SKILL_MOVES } from './SkillMoveEngine';

export interface PracticePlayerRender {
  x: number; z: number; yaw: number; speed: number; anim: AnimState;
  /** Real stamina from the kinematics (drives the on-pitch overlay arc). */
  stamina: number;
}

export interface PracticeRenderState {
  enabled: boolean;
  ballPos: Vec3;
  ballVel: Vec3;
  ballAngVel: Vec3;
  shotInFlight: boolean;
  shotType: ShotType | null;
  players: PracticePlayerRender[];
  activeIndex: number;
  /** Increments on every post hit / goal so the renderer can shake the camera. */
  impactPulse: number;
  goalPulse: number;
}

export interface PracticeStats {
  goals: number;
  shots: number;
  passes: number;
  skills: number;
  postHits: number;
  lastMessage: string;
  lastShotType: ShotType | null;
  ballSpeed: number;
  version: number;
}

export interface NetRegistry {
  left: NetPhysics | null;
  right: NetPhysics | null;
}

const HOME_GOAL_X = PITCH.HALF_LENGTH; // home attacks +X in practice

function pickHomeXI(): PlayerTemplate[] {
  const formation = getFormationById('4-3-3-attack')!;
  const all = getAllPlayers();
  const used = new Set<string>();
  return formation.slots.map((slot) => {
    const found = all.find((p) => p.position === slot.role && !used.has(p.id))
      ?? all.find((p) => !used.has(p.id))!;
    used.add(found.id);
    return found;
  });
}

function slotWorld(slot: { nx: number; ny: number }): { x: number; z: number } {
  return { x: (slot.nx - 0.5) * 105 * 0.92, z: (slot.ny - 0.5) * 68 * 0.92 };
}

export class PracticeEngine {
  readonly ball = new BallPhysics(createVec3(26, 0.11, -2));
  readonly renderState: PracticeRenderState;
  readonly stats: PracticeStats = {
    goals: 0, shots: 0, passes: 0, skills: 0, postHits: 0,
    lastMessage: 'Practice live — dribble with the left stick, shoot with the red button.',
    lastShotType: null, ballSpeed: 0, version: 0,
  };
  readonly templates: PlayerTemplate[];
  readonly kins: PlayerKinematics[] = [];
  readonly skills = new SkillMoveEngine();
  activeIndex = 9; // ST slot in 4-3-3 Attack
  /** Wet pitch (Night Rain): lower roll friction, skiddier bounce. */
  wet = false;
  private readonly actionQueue: GameAction[] = [];
  private pendingShot: { shotType: ShotType; power: number; timer: number } | null = null;
  private passTargetIndex: number | null = null;
  private passAndGoIndex: number | null = null;
  private runnerIndex: number | null = null;
  private runnerTimer = 0;
  private goalResetTimer = 0;
  private looseTimer = 0;
  private elapsedSec = 0;
  private readonly rng = mulberry32(20261121);
  private lastFacingTurnRate = 0;

  constructor(private readonly nets: NetRegistry) {
    this.templates = pickHomeXI();
    const formation = getFormationById('4-3-3-attack')!;
    this.templates.forEach((tpl, i) => {
      const slot = formation.slots[i]!;
      const w = slotWorld(slot);
      const kin = new PlayerKinematics(tpl, `home-${i}`, w.x, w.z, 0);
      this.kins.push(kin);
    });
    // Practice start: striker advanced toward the +X goal with the ball.
    const st = this.kins[this.activeIndex]!;
    st.pos.x = 26; st.pos.z = -2; st.facingRad = 0;
    this.ball.state.ownerId = st.id;
    this.ball.state.lastTouchId = st.id;
    this.ball.state.lastTouchSide = 'HOME';
    this.attachBallToOwner();
    this.renderState = {
      enabled: true,
      ballPos: createVec3(26, 0.11, -2),
      ballVel: createVec3(),
      ballAngVel: createVec3(),
      shotInFlight: false,
      shotType: null,
      players: this.kins.map((k) => ({ x: k.pos.x, z: k.pos.z, yaw: 0, speed: 0, anim: 'IDLE' as AnimState, stamina: k.stamina01 })),
      activeIndex: this.activeIndex,
      impactPulse: 0,
      goalPulse: 0,
    };
  }

  get controlled(): PlayerKinematics {
    return this.kins[this.activeIndex]!;
  }

  queueAction(action: GameAction): void {
    this.actionQueue.push(action);
  }

  private notify(msg: string): void {
    this.stats.lastMessage = msg;
    this.stats.version += 1;
  }

  resetPositions(): void {
    const formation = getFormationById('4-3-3-attack')!;
    this.kins.forEach((kin, i) => {
      const slot = formation.slots[i]!;
      const w = slotWorld(slot);
      kin.pos.x = w.x; kin.pos.z = w.z;
      kin.speed = 0; kin.facingRad = 0;
    });
    this.activeIndex = 9;
    const st = this.controlled;
    st.pos.x = 26; st.pos.z = -2;
    this.ball.reset(26.5, -2);
    this.ball.state.ownerId = st.id;
    this.passTargetIndex = null;
    this.passAndGoIndex = null;
    this.runnerIndex = null;
    this.pendingShot = null;
    this.goalResetTimer = 0;
    this.attachBallToOwner();
    this.notify('Reset — ball at the striker\'s feet. Attack the far goal!');
  }

  resetBallToFeet(): void {
    const c = this.controlled;
    this.ball.reset(c.pos.x + Math.cos(c.facingRad) * 0.5, c.pos.z + Math.sin(c.facingRad) * 0.5);
    this.ball.state.ownerId = c.id;
    this.passTargetIndex = null;
    this.pendingShot = null;
    this.attachBallToOwner();
    this.notify('Ball reset to your feet.');
  }

  private attachBallToOwner(): void {
    const owner = this.kins.find((k) => k.id === this.ball.state.ownerId);
    if (!owner) return;
    owner.dribbleBallPos(this.ball.state.pos, this.lastFacingTurnRate);
    this.ball.state.pos.y = 0.11;
    this.ball.state.prevPos.x = this.ball.state.pos.x;
    this.ball.state.prevPos.y = this.ball.state.pos.y;
    this.ball.state.prevPos.z = this.ball.state.pos.z;
  }

  private candidates(excludeIndex: number): PassCandidate[] {
    return this.kins
      .map((k, i) => ({ k, i }))
      .filter(({ i }) => i !== excludeIndex)
      .map(({ k }) => ({ id: k.id, pos: k.pos, vel: k.vel }));
  }

  private kinIndexById(id: string | null): number {
    return this.kins.findIndex((k) => k.id === id);
  }

  // --- Actions ---------------------------------------------------------------
  private handleAction(action: GameAction, input: InputManager): void {
    const c = this.controlled;
    switch (action.kind) {
      case 'SHOOT': {
        if (this.ball.state.ownerId !== c.id && !this.ball.state.shotInFlight) {
          // Volley / header attempt on a loose ball nearby.
          const d = Math.hypot(this.ball.state.pos.x - c.pos.x, this.ball.state.pos.z - c.pos.z);
          if (d > 2.2) { this.notify('No ball to shoot — win it back first.'); return; }
        }
        if (this.pendingShot) return;
        const type = autoShotType(this.ball.state.pos.y, action.shotType);
        if (type === 'FAKE_SHOT') { this.fakeShot(input); return; }
        const probe = computeShot({
          shooter: c.template, from: this.ball.state.pos,
          aimDir: { x: 1, y: 0, z: 0 }, aimLateral: 1, powerNorm: action.power,
          shotType: type, stamina01: c.stamina01, usingWeakFoot: false, rng: this.rng,
        });
        this.pendingShot = { shotType: type, power: action.power, timer: probe.windupSec };
        this.stats.lastShotType = type;
        this.notify(type === 'POWER' ? 'Power shot winding up…' : `${type.charAt(0)}${type.slice(1).toLowerCase()} shot…`);
        break;
      }
      case 'PASS': this.executePass(action.passType, action.power, input); break;
      case 'THROUGH': this.executePass(action.passType, action.power, input); break;
      case 'TRIGGER_RUN': {
        const fwd = this.kins
          .map((k, i) => ({ k, i }))
          .filter(({ i }) => i !== this.activeIndex && i !== 0)
          .sort((a, b) => b.k.pos.x - a.k.pos.x)[0];
        if (fwd) {
          this.runnerIndex = fwd.i;
          this.runnerTimer = 3.2;
          this.notify(`${fwd.k.template.shortName} is making a run — play him in with Through!`);
        }
        break;
      }
      case 'SKILL': {
        if (this.ball.state.ownerId !== c.id) { this.notify('Skill moves need the ball at your feet.'); return; }
        let moveId: SkillMoveId | null = action.moveId;
        if (!moveId) {
          const priority: SkillMoveId[] = ['LANE_CHANGE', 'ROULETTE', 'HEEL_TO_HEEL', 'BALL_ROLL', 'KNOCK_ON'];
          moveId = priority.find((m) => c.template.skillMoves >= SKILL_MOVES[m].stars) ?? 'KNOCK_ON';
        }
        const res = this.skills.tryStart(moveId, c, action.lateralSign);
        if (res.ok) {
          this.stats.skills += 1;
          this.notify(`${res.move.name}! ${res.move.description}`);
        } else this.notify(res.reason);
        break;
      }
      case 'TACKLE': {
        const res = c.standingTackle(this.ball.state.pos, this.ball.speed());
        this.notify(res.hit ? 'Standing tackle — ball won!' : 'Standing tackle — nobody there in practice. Switch with SWITCH.');
        if (res.hit && this.ball.state.ownerId === null) this.gainPossession(this.activeIndex);
        break;
      }
      case 'SLIDE': {
        const res = c.slideTackle(this.ball.state.pos, this.ball.speed());
        this.notify(res.hit ? 'Slide tackle connects!' : 'Slide tackle lunged — no opponent in open practice.');
        if (res.hit && this.ball.state.ownerId === null) this.gainPossession(this.activeIndex);
        break;
      }
      case 'SWITCH': {
        const cands = this.kins.map((k, i) => ({ id: k.id, pos: k.pos, isGoalkeeper: i === 0 }));
        const nextId = chooseSwitchTarget(cands, this.ball.state.pos, c.id, -PITCH.HALF_LENGTH);
        const idx = this.kinIndexById(nextId);
        if (idx >= 0 && idx !== this.activeIndex) {
          this.activeIndex = idx;
          this.notify(`Switched to ${this.controlled.template.shortName}.`);
        }
        break;
      }
      case 'SECOND_DEF': this.notify('2nd Defender press is a defending call — it activates when the other team has the ball (Phase 04 AI).'); break;
      case 'GK_RUSH': this.notify('GK Rush is a defending call — it activates when you are defending (Phase 04 AI).'); break;
    }
  }

  private fakeShot(input: InputManager): void {
    const c = this.controlled;
    const mv = input.moveVector();
    const side = mv.magnitude > 0.15 ? (mv.z >= 0 ? 1 : -1) : 1;
    c.facingRad += side * (65 * Math.PI) / 180;
    c.applySpeedBurst(1.14, 0.4);
    this.stats.lastShotType = 'FAKE_SHOT';
    this.notify('Fake shot! Sharp cut inside — the nearest defender is frozen for 0.45s in a match.');
  }

  private executePass(passType: PassType, power: number, input: InputManager): void {
    const c = this.controlled;
    if (this.ball.state.ownerId !== c.id) { this.notify('You need possession to pass.'); return; }
    const mv = input.moveVector();
    const aim = mv.magnitude > 0.12
      ? { x: mv.x, y: 0, z: mv.z }
      : { x: Math.cos(c.facingRad), y: 0, z: Math.sin(c.facingRad) };
    const target = findPassTarget(this.ball.state.pos, aim, this.candidates(this.activeIndex), []);
    const from = { x: this.ball.state.pos.x, y: this.ball.state.pos.y, z: this.ball.state.pos.z };
    const effectiveTarget: PassCandidate = target ?? {
      id: 'loose',
      pos: { x: from.x + aim.x * 9, y: 0.11, z: from.z + aim.z * 9 },
      vel: { x: 0, y: 0, z: 0 },
    };
    const result = computePass({
      passer: c.template, from, passType, target: effectiveTarget, attackDirX: 1,
    });
    // Hold power stretches driven/ground passes a little further.
    const stretch = passType === 'GROUND' || passType === 'PASS_AND_GO' ? 0.85 + power * 0.35 : 1;
    result.velocity.x *= stretch; result.velocity.z *= stretch;
    this.ball.kick(result.velocity, result.angularVel, c.id, 'HOME', null);
    this.stats.passes += 1;
    const targetIdx = this.kinIndexById(result.targetId);
    this.passTargetIndex = targetIdx >= 0 ? targetIdx : null;
    if (passType === 'PASS_AND_GO') {
      this.passAndGoIndex = this.activeIndex;
    }
    matchEventBus.emit('BALL_KICKED', { playerId: c.template.id, power, shotType: passType, isShot: false });
    const targetName = targetIdx >= 0 ? this.kins[targetIdx]!.template.shortName : 'space';
    this.notify(`${passType.replace(/_/g, ' ')} pass toward ${targetName}.`);
  }

  private executeShot(shotType: ShotType, power: number, input: InputManager): void {
    const c = this.controlled;
    const ballPos = this.ball.state.pos;
    const mv = input.moveVector();
    let targetZ: number;
    if (mv.magnitude > 0.15) targetZ = mv.z * 3.3;
    else if (shotType === 'FINESSE') targetZ = ballPos.z > 0 ? -2.7 : 2.7; // far post
    else targetZ = ballPos.z * -0.4;
    targetZ = Math.max(-3.4, Math.min(3.4, targetZ));
    const aimDir = { x: HOME_GOAL_X - ballPos.x, y: 0, z: targetZ - ballPos.z };
    const aimLen = Math.hypot(aimDir.x, aimDir.z) || 1;
    aimDir.x /= aimLen; aimDir.z /= aimLen;
    const facingAimDiff = Math.abs(Math.atan2(aimDir.z, aimDir.x) - c.facingRad);
    const usingWeakFoot = facingAimDiff > 1.0 && c.template.weakFoot <= 3;
    const result = computeShot({
      shooter: c.template, from: ballPos, aimDir,
      aimLateral: targetZ >= ballPos.z ? 1 : -1,
      powerNorm: power, shotType, stamina01: c.stamina01, usingWeakFoot, rng: this.rng,
    });
    if (result.isFake) { this.fakeShot(input); return; }
    this.ball.kick(result.velocity, result.angularVel, c.id, 'HOME', shotType);
    this.stats.shots += 1;
    this.stats.lastShotType = shotType;
    const dist = Math.hypot(HOME_GOAL_X - ballPos.x, targetZ - ballPos.z);
    const xg = Math.max(0.04, Math.min(0.92, 1.08 - dist * 0.021));
    this.pendingShotXg = xg;
    matchEventBus.emit('BALL_KICKED', { playerId: c.template.id, power, shotType, isShot: true });
    this.notify(`${shotType} shot away — ${result.speed.toFixed(1)} m/s at ${result.loftDeg.toFixed(0)}°${result.overcooked ? ' — OVERCOOKED, it skies!' : ''}`);
  }

  private pendingShotXg = 0.3;

  private gainPossession(index: number): void {
    const kin = this.kins[index];
    if (!kin) return;
    this.ball.state.ownerId = kin.id;
    this.ball.state.vel.x = 0; this.ball.state.vel.y = 0; this.ball.state.vel.z = 0;
    this.ball.state.shotInFlight = false;
    this.ball.state.shotType = null;
    this.passTargetIndex = null;
    this.activeIndex = index;
    this.attachBallToOwner();
  }

  // --- Fixed step --------------------------------------------------------------
  step(dt: number, input: InputManager): void {
    this.elapsedSec += dt;
    const matchMinutes = this.elapsedSec * (90 / 1200);
    while (this.actionQueue.length > 0) {
      const a = this.actionQueue.shift()!;
      this.handleAction(a, input);
    }

    const c = this.controlled;
    const mv = input.moveVector();
    const prevFacing = c.facingRad;

    // Pending shot wind-up (POWER = 0.35s): movement slows, then the strike.
    if (this.pendingShot) {
      this.pendingShot.timer -= dt;
      if (this.pendingShot.timer <= 0) {
        const { shotType, power } = this.pendingShot;
        this.pendingShot = null;
        if (this.ball.state.ownerId === c.id || Math.hypot(this.ball.state.pos.x - c.pos.x, this.ball.state.pos.z - c.pos.z) < 2.4) {
          this.executeShot(shotType, power, input);
        }
      }
    }

    const moveScale = this.pendingShot ? 0.25 : 1;
    c.update(dt, {
      dirX: mv.x, dirZ: mv.z,
      magnitude: mv.magnitude * moveScale,
      sprint: input.sprintHeld || mv.magnitude > 0.92,
    }, matchMinutes);
    this.lastFacingTurnRate = dt > 0 ? Math.abs(c.facingRad - prevFacing) / dt : 0;
    // Keep everyone on the pitch.
    for (const kin of this.kins) {
      kin.pos.x = Math.max(-54, Math.min(56, kin.pos.x));
      kin.pos.z = Math.max(-36, Math.min(36, kin.pos.z));
    }

    // Skill move physics on the controlled player.
    this.skills.update(dt, c, this.ball);

    // Scripted runner (PASS_AND_GO passer or TRIGGER_RUN forward).
    const runnerIdx = this.passAndGoIndex !== null && this.ball.state.ownerId === null
      ? this.passAndGoIndex
      : this.runnerIndex;
    if (runnerIdx !== null && runnerIdx !== undefined) {
      const runner = this.kins[runnerIdx];
      if (runner && runnerIdx !== this.activeIndex) {
        runner.update(dt, { dirX: 1, dirZ: -runner.pos.z * 0.02, magnitude: 1, sprint: true }, matchMinutes);
      }
    }
    if (this.runnerTimer > 0) {
      this.runnerTimer -= dt;
      if (this.runnerTimer <= 0) this.runnerIndex = null;
    }

    // Ball: attached while owned, simulated while free.
    if (this.ball.state.ownerId !== null) {
      this.attachBallToOwner();
    } else {
      const events = this.ball.step(dt, { wet: this.wet });
      // Nets catch & ripple (both goals registered by the renderer).
      if (this.nets.right) this.nets.right.step(dt, this.ball.state.pos, this.ball.state.vel);
      if (this.nets.left) this.nets.left.step(dt, this.ball.state.pos, this.ball.state.vel);
      if (events.postHit) {
        this.stats.postHits += 1;
        this.renderState.impactPulse += 1;
        this.notify(`Off the woodwork! Post struck at ${events.postSpeed.toFixed(1)} m/s.`);
      }
      if (events.goal) {
        this.stats.goals += 1;
        this.renderState.goalPulse += 1;
        this.goalResetTimer = 2.4;
        matchEventBus.emit('GOAL_SCORED', {
          scoringSide: 'HOME', scorerId: c.template.id, assisterId: null,
          shotType: this.ball.state.shotType ?? 'STANDARD', xg: this.pendingShotXg,
          minute: Math.max(1, Math.floor(matchMinutes) + 1),
        });
        matchEventBus.emit('CROWD_EXCITEMENT', { level: 0.95 });
        this.notify('GOAL! The net ripples as it catches the shot. Resetting for kickoff…');
      }
      this.checkReception(dt);
    }

    if (this.goalResetTimer > 0) {
      this.goalResetTimer -= dt;
      if (this.goalResetTimer <= 0) this.resetPositions();
    }

    // Publish render state.
    const rs = this.renderState;
    rs.ballPos.x = this.ball.state.pos.x; rs.ballPos.y = this.ball.state.pos.y; rs.ballPos.z = this.ball.state.pos.z;
    rs.ballVel.x = this.ball.state.vel.x; rs.ballVel.y = this.ball.state.vel.y; rs.ballVel.z = this.ball.state.vel.z;
    rs.ballAngVel.x = this.ball.state.angularVel.x; rs.ballAngVel.y = this.ball.state.angularVel.y; rs.ballAngVel.z = this.ball.state.angularVel.z;
    rs.shotInFlight = this.ball.state.shotInFlight;
    rs.shotType = this.ball.state.shotType;
    rs.activeIndex = this.activeIndex;
    this.kins.forEach((kin, i) => {
      const p = rs.players[i]!;
      p.x = kin.pos.x; p.z = kin.pos.z;
      p.stamina = kin.stamina01;
      // Rig space: rotation.y = PI/2 - facingRad (facing +X renders as PI/2).
      p.yaw = Math.PI / 2 - kin.facingRad;
      p.speed = kin.speed;
      p.anim = kin.slideTimer > 0 ? 'SLIDE_TACKLE'
        : this.pendingShot && i === this.activeIndex && this.pendingShot.timer < 0.12 ? 'SHOOT'
        : kin.speed > 5.2 ? 'SPRINT'
        : kin.speed > 0.4 ? 'JOG'
        : 'IDLE';
    });
    this.stats.ballSpeed = this.ball.speed();
  }

  private checkReception(dt: number): void {
    const ballPos = this.ball.state.pos;
    // Intended receiver traps the pass.
    if (this.passTargetIndex !== null) {
      const target = this.kins[this.passTargetIndex];
      if (target) {
        const d = Math.hypot(ballPos.x - target.pos.x, ballPos.z - target.pos.z);
        if (d < 1.25 && this.ball.speed() < 15) {
          const wasPassAndGo = this.passAndGoIndex !== null;
          this.gainPossession(this.passTargetIndex);
          this.notify(wasPassAndGo
            ? 'Pass & Go complete — the one-two worked!'
            : `Received by ${target.template.shortName}. You control him now.`);
          this.passAndGoIndex = null;
          return;
        }
        if (ballPos.x > target.pos.x + 4.5 || this.ball.speed() < 0.4) {
          this.passTargetIndex = null; // overhit — ball is loose
        }
      }
    }
    // Loose-ball pickup by the controlled player.
    if (!this.ball.state.shotInFlight || this.ball.speed() < 5) {
      const c = this.controlled;
      const d = Math.hypot(ballPos.x - c.pos.x, ballPos.z - c.pos.z);
      if (d < 1.05 && this.ball.state.isGrounded) {
        this.gainPossession(this.activeIndex);
        this.notify('Ball collected. Dribble, pass, skill or shoot!');
        return;
      }
    }
    // Dead / out-of-play ball: recycle to the controlled player's feet.
    const out = Math.abs(ballPos.x) > 57 || Math.abs(ballPos.z) > 37.5;
    if (out || (this.ball.speed() < 0.15 && this.goalResetTimer <= 0)) {
      this.looseTimer += dt;
      if (out || this.looseTimer > 2.5) {
        this.looseTimer = 0;
        if (this.goalResetTimer <= 0) this.resetBallToFeet();
      }
    } else this.looseTimer = 0;
  }
}

// ---------------------------------------------------------------------------
// Deterministic shot lab — used by the App verification panel to prove the
// Magnus bend, power dip and chip arc from the real simulation code.
export interface ShotLabResult {
  apexY: number;
  lateralDrift: number;
  finalY: number;
  crossedGoalLine: boolean;
}

export function runShotLab(shotType: ShotType): ShotLabResult {
  const rng = mulberry32(42);
  const templates = pickHomeXI();
  const shooter = templates[9]!; // ST
  const ball = new BallPhysics(createVec3(30, 0.11, 0));
  const result = computeShot({
    shooter, from: ball.state.pos,
    // Straight aim: any lateral drift is pure Magnus curl, nothing else.
    aimDir: { x: 1, y: 0, z: 0 }, aimLateral: -1, powerNorm: 0.75,
    shotType, stamina01: 1, usingWeakFoot: false, rng,
  });
  ball.kick(result.velocity, result.angularVel, shooter.id, 'HOME', shotType);
  let apex = 0;
  let crossed = false;
  const startZ = ball.state.pos.z;
  for (let i = 0; i < 150; i += 1) {
    const ev = ball.step(1 / 60, { wet: false });
    apex = Math.max(apex, ball.state.pos.y);
    if (ev.goal) { crossed = true; break; }
    if (ball.state.pos.x > 54) break;
  }
  return {
    apexY: apex,
    lateralDrift: ball.state.pos.z - startZ,
    finalY: ball.state.pos.y,
    crossedGoalLine: crossed,
  };
}
