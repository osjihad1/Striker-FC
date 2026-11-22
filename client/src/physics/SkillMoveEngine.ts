// Striker FC — physics/SkillMoveEngine.ts (Phase 03, Spec 04 §6)
// All 6 skill moves gated by the player's skillMoves star rating, with smooth
// cooldowns and real physics offsets applied to the player + ball each tick.
import { BALL_CONST } from '../core/constants';
import { clamp, createVec3 } from '../core/math';
import type { SkillMoveId } from '../core/types';
import type { BallPhysics } from './BallPhysics';
import type { PlayerKinematics } from './PlayerKinematics';

export interface SkillMoveDef {
  id: SkillMoveId;
  name: string;
  stars: number;
  durationSec: number;
  cooldownSec: number;
  description: string;
}

export const SKILL_MOVES: Record<SkillMoveId, SkillMoveDef> = {
  KNOCK_ON: { id: 'KNOCK_ON', name: 'Knock-On', stars: 1, durationSec: 0.3, cooldownSec: 0.7, description: 'Pushes the ball 2.8m ahead with a +18% speed burst.' },
  BALL_ROLL: { id: 'BALL_ROLL', name: 'Ball Roll', stars: 2, durationSec: 0.35, cooldownSec: 0.8, description: 'Smooth 0.35s lateral sidestep, tight control kept.' },
  HEEL_TO_HEEL: { id: 'HEEL_TO_HEEL', name: 'Heel-to-Heel', stars: 3, durationSec: 0.4, cooldownSec: 1.0, description: 'Sudden forward flick plus an acceleration burst.' },
  ROULETTE: { id: 'ROULETTE', name: 'Roulette', stars: 3, durationSec: 0.55, cooldownSec: 1.2, description: '360° spin around the ball; shrugs off frontal contain.' },
  LANE_CHANGE: { id: 'LANE_CHANGE', name: 'Lane Change', stars: 4, durationSec: 0.32, cooldownSec: 1.1, description: 'Instant double-touch lateral shift of 1.15m plus burst.' },
  RAINBOW_FLICK: { id: 'RAINBOW_FLICK', name: 'Rainbow Flick', stars: 5, durationSec: 0.5, cooldownSec: 1.6, description: 'Lifts the ball over the defender while you sprint under it.' },
};

export const ALL_SKILL_MOVES = Object.values(SKILL_MOVES);

export type SkillStartResult =
  | { ok: true; move: SkillMoveDef }
  | { ok: false; reason: string };

interface ActiveMove {
  def: SkillMoveDef;
  t: number;
  lateralSign: 1 | -1;
  firedImpulse: boolean;
}

export class SkillMoveEngine {
  private active: ActiveMove | null = null;
  private readonly cooldowns = new Map<SkillMoveId, number>();
  private globalCooldown = 0;

  get activeMove(): SkillMoveDef | null { return this.active?.def ?? null; }
  get isActive(): boolean { return this.active !== null; }

  cooldownRemaining(id: SkillMoveId): number {
    return Math.max(0, this.cooldowns.get(id) ?? 0, this.globalCooldown);
  }

  canPerform(id: SkillMoveId, skillStars: number): boolean {
    return skillStars >= SKILL_MOVES[id].stars && this.cooldownRemaining(id) <= 0 && !this.active;
  }

  /**
   * Start a move. `lateralSign` picks the side for BALL_ROLL / LANE_CHANGE
   * (+1 = player's left of travel). Returns a typed failure instead of throwing.
   */
  tryStart(id: SkillMoveId, kin: PlayerKinematics, lateralSign: 1 | -1 = 1): SkillStartResult {
    const def = SKILL_MOVES[id];
    if (kin.template.skillMoves < def.stars) {
      return { ok: false, reason: `${def.name} needs ${def.stars}★ skill moves — ${kin.template.shortName} has ${kin.template.skillMoves}★.` };
    }
    if (this.active) return { ok: false, reason: `${this.active.def.name} still in progress.` };
    const cd = this.cooldownRemaining(id);
    if (cd > 0) return { ok: false, reason: `${def.name} cooling down (${cd.toFixed(1)}s).` };
    this.active = { def, t: 0, lateralSign, firedImpulse: false };
    return { ok: true, move: def };
  }

  cancel(): void { this.active = null; }

  /** Advance timers only (call even when no move is active). */
  tickCooldowns(dt: number): void {
    if (this.globalCooldown > 0) this.globalCooldown -= dt;
    for (const [id, v] of this.cooldowns) {
      if (v > 0) this.cooldowns.set(id, v - dt);
    }
  }

  /**
   * Apply the active move's physics for this tick. Ball ownership stays with
   * the player except KNOCK_ON / RAINBOW_FLICK, which release the ball with a
   * real velocity (the engine re-acquires it on proximity).
   */
  update(dt: number, kin: PlayerKinematics, ball: BallPhysics): void {
    this.tickCooldowns(dt);
    const act = this.active;
    if (!act) return;
    act.t += dt;
    const { def } = act;
    const progress = clamp(act.t / def.durationSec, 0, 1);
    const fx = Math.cos(kin.facingRad);
    const fz = Math.sin(kin.facingRad);
    // Lateral axis (left of travel).
    const lx = -fz * act.lateralSign;
    const lz = fx * act.lateralSign;
    const rapidBonus = kin.template.playStyles.includes('RAPID_PLUS') ? 0.08 : 0;

    switch (def.id) {
      case 'KNOCK_ON': {
        if (!act.firedImpulse) {
          act.firedImpulse = true;
          // Release the ball ~2.8m ahead: speed solved from roll friction.
          const pushSpeed = Math.sqrt(2 * BALL_CONST.ROLL_FRICTION_DRY * 2.8) + kin.speed * 0.55;
          ball.state.ownerId = null;
          ball.state.vel.x = fx * pushSpeed + kin.vel.x * 0.4;
          ball.state.vel.z = fz * pushSpeed + kin.vel.z * 0.4;
          ball.state.vel.y = 0;
          ball.state.isGrounded = true;
          kin.applySpeedBurst(1.18 + rapidBonus, 0.6);
        }
        break;
      }
      case 'BALL_ROLL': {
        const stepDist = (0.85 / def.durationSec) * dt * Math.sin(Math.min(1, progress) * Math.PI * 0.5 + 0.2);
        kin.pos.x += lx * stepDist;
        kin.pos.z += lz * stepDist;
        break;
      }
      case 'HEEL_TO_HEEL': {
        if (!act.firedImpulse) {
          act.firedImpulse = true;
          kin.applySpeedBurst(1.22, 0.45);
          // Flick: small forward hop of the ball, ownership kept via re-attach.
          ball.state.vel.y = 0;
        }
        kin.pos.x += fx * 1.6 * dt;
        kin.pos.z += fz * 1.6 * dt;
        break;
      }
      case 'ROULETTE': {
        kin.facingRad += (Math.PI * 2 / def.durationSec) * dt;
        kin.frontalImmuneTimer = Math.max(kin.frontalImmuneTimer, 0.2);
        break;
      }
      case 'LANE_CHANGE': {
        const burstWindow = progress < 0.55 ? 1 : 0.25;
        const stepDist = (1.15 / (def.durationSec * 0.55)) * dt * burstWindow;
        kin.pos.x += lx * stepDist;
        kin.pos.z += lz * stepDist;
        if (!act.firedImpulse) {
          act.firedImpulse = true;
          kin.applySpeedBurst(1.16 + rapidBonus, 0.5);
        }
        break;
      }
      case 'RAINBOW_FLICK': {
        if (!act.firedImpulse) {
          act.firedImpulse = true;
          ball.state.ownerId = null;
          ball.state.vel.x = fx * 5.5 + kin.vel.x * 0.35;
          ball.state.vel.z = fz * 5.5 + kin.vel.z * 0.35;
          ball.state.vel.y = 6.2;
          ball.state.isGrounded = false;
          ball.state.angularVel.x = fz * 14;
          ball.state.angularVel.y = 0;
          ball.state.angularVel.z = -fx * 14;
          kin.applySpeedBurst(1.12, 0.5);
        }
        break;
      }
    }

    if (act.t >= def.durationSec) {
      this.cooldowns.set(def.id, def.cooldownSec);
      this.globalCooldown = 0.22;
      this.active = null;
    }
  }

  /** Scratch vector kept for callers that want the move's exit velocity hint. */
  readonly scratch = createVec3();
}
