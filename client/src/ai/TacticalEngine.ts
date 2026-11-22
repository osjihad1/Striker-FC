// Striker FC — ai/TacticalEngine.ts (Phase 04, Spec 05 §1)
// Dynamic formation anchoring: ball-zone shifting, a synchronized defensive
// back line, offside-trap respect for attackers, all 5 mentalities, and the
// Manager Mode tactical sliders. Pure math over the seed formations.

import { MENTALITY_CONFIG, PITCH } from '../core/constants';
import { clamp } from '../core/math';
import type { Formation, ManagerTactics, Mentality, Position, TeamSide } from '../core/types';
import { positionGroup } from '../core/types';

export interface TeamShape {
  /** World-space anchor per slot index (same order as formation.slots). */
  anchors: { x: number; z: number }[];
  /** Synchronized world X of the back line (defenders share this X). */
  defensiveLineX: number;
  /** World X of the opponent's second-last defender (the offside line). */
  offsideLineX: number;
  pressRadius: number;
  forwardRunProb: number;
}

export const DEFAULT_TACTICS: ManagerTactics = {
  buildUpSpeed: 2, passingDistance: 2, shootingTendency: 2,
  crossingTendency: 2, pressure: 2, width: 2, aggression: 2,
};

export function attackDirX(side: TeamSide): 1 | -1 {
  return side === 'HOME' ? 1 : -1;
}

export function ownGoalX(side: TeamSide): number {
  return -attackDirX(side) * PITCH.HALF_LENGTH;
}

export function opponentGoalX(side: TeamSide): number {
  return attackDirX(side) * PITCH.HALF_LENGTH;
}

/** World → team attacking coordinates: nx 0 = own goal … 1 = opponent goal; ny 0..1 across. */
export function worldToTeamNorm(side: TeamSide, x: number, z: number): { nx: number; ny: number } {
  const dir = attackDirX(side);
  const nx = dir > 0 ? (x + PITCH.HALF_LENGTH) / PITCH.LENGTH : (PITCH.HALF_LENGTH - x) / PITCH.LENGTH;
  const ny = dir > 0 ? (z + PITCH.HALF_WIDTH) / PITCH.WIDTH : (PITCH.HALF_WIDTH - z) / PITCH.WIDTH;
  return { nx: clamp(nx, 0, 1), ny: clamp(ny, 0, 1) };
}

/** Team attacking coordinates → world. */
export function teamNormToWorld(side: TeamSide, nx: number, ny: number): { x: number; z: number } {
  const dir = attackDirX(side);
  const x = dir > 0 ? nx * PITCH.LENGTH - PITCH.HALF_LENGTH : PITCH.HALF_LENGTH - nx * PITCH.LENGTH;
  const z = dir > 0 ? ny * PITCH.WIDTH - PITCH.HALF_WIDTH : PITCH.HALF_WIDTH - ny * PITCH.WIDTH;
  return { x, z };
}

/** Slider-derived modifiers (each ManagerTactics field is 1 | 2 | 3). */
export interface TacticsModifiers {
  widthMult: number;
  pressRadiusMult: number;
  shootBias: number;
  supportDistMult: number;
  runProbMult: number;
  aggressionMult: number;
  crossBias: number;
}

export function tacticsModifiers(t: ManagerTactics): TacticsModifiers {
  return {
    widthMult: [0.86, 1, 1.14][t.width - 1] ?? 1,
    pressRadiusMult: [0.75, 1, 1.3][t.pressure - 1] ?? 1,
    shootBias: [0.82, 1, 1.22][t.shootingTendency - 1] ?? 1,
    supportDistMult: [0.82, 1, 1.18][t.passingDistance - 1] ?? 1,
    runProbMult: [0.8, 1, 1.2][t.buildUpSpeed - 1] ?? 1,
    aggressionMult: [0.8, 1, 1.25][t.aggression - 1] ?? 1,
    crossBias: [0.8, 1, 1.25][t.crossingTendency - 1] ?? 1,
  };
}

const DEFENDER_ROLES: Position[] = ['CB', 'LB', 'RB', 'LWB', 'RWB'];
const ATTACKER_ROLES: Position[] = ['ST', 'CF', 'LW', 'RW'];

export class TacticalEngine {
  constructor(
    public formation: Formation,
    public mentality: Mentality = 'BALANCED',
    public tactics: ManagerTactics = DEFAULT_TACTICS,
  ) {}

  setMentality(m: Mentality): void { this.mentality = m; }
  setTactics(t: ManagerTactics): void { this.tactics = t; }
  setFormation(f: Formation): void { this.formation = f; }

  /**
   * Compute the live shape for one team.
   * @param ballWorld current ball position (world X/Z)
   * @param opponentDefenderWorldXs world X of every opponent (for the offside line)
   * @param minute match minute (ULTRA_ATTACKING late CB surge rule)
   * @param trailing whether this team is behind on the scoreboard
   */
  computeShape(
    side: TeamSide,
    ballWorld: { x: number; z: number },
    opponentDefenderWorldXs: number[],
    minute: number,
    trailing: boolean,
    menDown = 0,
  ): TeamShape {
    const cfg = MENTALITY_CONFIG[this.mentality] ?? MENTALITY_CONFIG.BALANCED!;
    const mods = tacticsModifiers(this.tactics);
    const dir = attackDirX(side);
    const ball = worldToTeamNorm(side, ballWorld.x, ballWorld.z);

    // --- Synchronized defensive line (Spec 05 §1.4) -------------------------
    const ownBoxEdge = ownGoalX(side) + dir * PITCH.PENALTY_AREA_LENGTH;
    const lineMin = ownBoxEdge + dir * 4;
    const lineMax = dir * 12; // midfield line + 12m toward the opponent
    const rawLine = ballWorld.x - dir * 14 + cfg.lineShiftX * 30 * dir;
    const defensiveLineX = dir > 0
      ? clamp(rawLine, Math.min(lineMin, lineMax), Math.max(lineMin, lineMax))
      : clamp(rawLine, Math.min(lineMin, lineMax), Math.max(lineMin, lineMax));

    // --- Offside line: opponent's second-last defender ----------------------
    const sorted = [...opponentDefenderWorldXs].sort((a, b) => (dir > 0 ? b - a : a - b));
    const secondLast = sorted[1] ?? sorted[0] ?? opponentGoalX(side);
    const offsideLineX = secondLast;

    const anchors = this.formation.slots.map((slot, i) => {
      if (slot.role === 'GK') {
        // GK anchor is handled by GoalkeeperAI; return the goal centre area.
        return { x: ownGoalX(side) + dir * 1.2, z: 0 };
      }
      // Spec anchor formula.
      let anx = clamp(slot.nx * 0.55 + ball.nx * 0.45 + cfg.lineShiftX, 0.08, 0.94);
      let any = clamp(0.5 + (slot.ny - 0.5) * cfg.compactness * mods.widthMult + (ball.ny - 0.5) * 0.28, 0.06, 0.94);

      // Epic P0-7: a real 10-man reshape — with menDown ≥ 1 the shape
      // contracts (11→10 ≈ 4-4-1, 10→9 ≈ 4-3-2): midfield and attack
      // lines drop toward their own goal and the width narrows, so the
      // sent-off slot's space is covered by the team, not left open.
      if (menDown > 0) {
        const group = positionGroup(slot.role);
        if (group === 'ATT') anx -= 0.13 * menDown;
        else if (group === 'MID') anx -= 0.07 * menDown;
        any = 0.5 + (any - 0.5) * (menDown >= 2 ? 0.78 : 0.86);
        anx = clamp(anx, 0.06, 0.94);
      }

      // Back line steps together: defenders share the synchronized line X,
      // blended with their natural anchor so fullbacks can still advance.
      if (DEFENDER_ROLES.includes(slot.role)) {
        const lineNorm = worldToTeamNorm(side, defensiveLineX, 0).nx;
        const blend = slot.role === 'CB' ? 0.82 : 0.55;
        anx = anx * (1 - blend) + lineNorm * blend;
      }

      // ULTRA_ATTACKING after 75' while trailing: one CB joins the box.
      if (
        this.mentality === 'ULTRA_ATTACKING' && minute >= 75 && trailing
        && slot.role === 'CB' && i === this.formation.slots.findIndex((s) => s.role === 'CB')
      ) {
        anx = Math.max(anx, 0.86);
        any = 0.5;
      }

      let world = teamNormToWorld(side, anx, any);

      // Offside-trap respect: attackers hold 0.8m behind the second-last
      // defender while their team is building up (runs break this on a pass).
      if (ATTACKER_ROLES.includes(slot.role)) {
        const limit = offsideLineX - dir * 0.8;
        world.x = dir > 0 ? Math.min(world.x, limit) : Math.max(world.x, limit);
      }

      // Keep everyone inside the playing surface with a small margin.
      world.x = clamp(world.x, -PITCH.HALF_LENGTH + 1.5, PITCH.HALF_LENGTH - 1.5);
      world.z = clamp(world.z, -PITCH.HALF_WIDTH + 1.5, PITCH.HALF_WIDTH - 1.5);
      return world;
    });

    return {
      anchors,
      defensiveLineX,
      offsideLineX,
      pressRadius: cfg.pressRadius * mods.pressRadiusMult,
      forwardRunProb: clamp(cfg.forwardRunProb * mods.runProbMult, 0, 0.98),
    };
  }

  /** True when the ball is in this team's own defensive third. */
  isOwnThird(side: TeamSide, ballWorld: { x: number; z: number }): boolean {
    return worldToTeamNorm(side, ballWorld.x, ballWorld.z).nx < 0.34;
  }

  /** Role group helper re-exported for AI modules. */
  static groupOf(role: Position) {
    return positionGroup(role);
  }
}
