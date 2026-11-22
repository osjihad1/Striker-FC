// Striker FC — ai/MatchPlan.ts (Epic fix round, P1-15)
// The full match-plan brain both benches think with. Pure function of the
// game state: score, clock, difficulty tier and (at the top tiers) the
// opponent's passing habits. It decides mentality, whether the side runs a
// coordinated pressing trap or an offside trap, how much it time-wastes
// while protecting a lead, how eagerly it switches the point of attack,
// and what kind of substitution the bench wants next.
//
// Fairness floors are structural, not promises: this module never touches
// speed (maxSpeedMultiplier stays 1 on every tier), pass accuracy is
// capped at 0.97 and shot precision at 0.95 in DifficultyProfiles, and the
// pattern adaptation below reads only where passes were AIMED — public
// information any real analyst tracks — never the user's inputs.

import type { Difficulty, Mentality, TeamSide } from '../core/types';
import { DIFFICULTY_PROFILES } from './DifficultyProfiles';

export type PlanLane = 'LEFT' | 'CENTRE' | 'RIGHT';

export interface MatchPlan {
  mentality: Mentality;
  /** World Class+: hunt the ball in a coordinated trap near the touchline. */
  pressTrap: boolean;
  /** World Class+: the defensive line steps up in unison on the pass. */
  offsideTrap: boolean;
  /** 0..1 — how much this side runs the clock down (late lead protection). */
  timeWasting: number;
  /** 0..1 — eagerness to switch the point of attack to the far side. */
  switchPlayBias: number;
  /** The bench's next substitution intent. */
  subAdvice: 'NONE' | 'FRESH_LEGS' | 'ATTACKING_SUB' | 'DEFENSIVE_SUB';
  /** Legendary/Ultimate only: the user's favourite lane, once read. */
  adaptedLane: PlanLane | null;
}

export interface MatchPlanContext {
  side: TeamSide;
  scoreFor: number;
  scoreAgainst: number;
  minute: number;
  difficulty: Difficulty;
  /** Decayed counts of the OPPONENT's pass targets by pitch lane. */
  opponentLaneCounts?: Record<PlanLane, number>;
}

const TIER_ORDER: Difficulty[] = [
  'BEGINNER', 'AMATEUR', 'SEMI_PRO', 'PROFESSIONAL', 'WORLD_CLASS', 'LEGENDARY', 'ULTIMATE',
];

export function tierIndex(d: Difficulty): number {
  return TIER_ORDER.indexOf(d);
}

/** Lane of a pitch position: z splits the pitch into thirds. */
export function laneOfZ(z: number): PlanLane {
  return z < -11 ? 'LEFT' : z > 11 ? 'RIGHT' : 'CENTRE';
}

export function computeMatchPlan(ctx: MatchPlanContext): MatchPlan {
  const diff = ctx.scoreFor - ctx.scoreAgainst;
  const minute = ctx.minute;
  const tier = tierIndex(ctx.difficulty);

  // --- Mentality: chase the game when behind, shut it down when ahead late.
  let mentality: Mentality = 'BALANCED';
  if (diff < 0 && minute >= 75) mentality = 'ULTRA_ATTACKING';
  else if (diff < 0 && minute >= 55) mentality = 'ATTACKING';
  else if (diff <= -2 && minute >= 35) mentality = 'ATTACKING';
  else if (diff > 0 && minute >= 80) mentality = 'ULTRA_DEFENDING'; // park the bus
  else if (diff > 0 && minute >= 65) mentality = 'DEFENDING';
  else if (diff >= 2 && minute >= 50) mentality = 'DEFENDING';
  else if (diff < 0 && minute >= 20 && tier >= tierIndex('WORLD_CLASS')) mentality = 'ATTACKING';

  // --- Traps are a World Class+ behaviour: coordinated, not faster.
  const traps = tier >= tierIndex('WORLD_CLASS');
  const pressTrap = traps && diff <= 0; // no trapping while protecting a lead
  const offsideTrap = traps && diff >= -1;

  // --- Time-wasting only exists while protecting a lead in the last 15.
  const timeWasting = diff > 0 && minute >= 75 ? Math.min(1, (minute - 75) / 10) : 0;

  // --- Switch of play: braver when chasing or at higher tiers.
  const switchPlayBias = Math.min(0.9, 0.3 + tier * 0.07 + (diff < 0 ? 0.18 : 0));

  // --- Bench intent.
  let subAdvice: MatchPlan['subAdvice'] = 'NONE';
  if (minute >= 58 && diff < 0) subAdvice = 'ATTACKING_SUB';
  else if (minute >= 70 && diff > 0) subAdvice = 'DEFENSIVE_SUB';
  else if (minute >= 62) subAdvice = 'FRESH_LEGS';

  // --- Pattern adaptation (Legendary/Ultimate): if the opponent keeps
  // funneling passes into one lane, that lane gets marked tighter. The
  // engine decays the counts, so the read fades unless it keeps happening.
  let adaptedLane: PlanLane | null = null;
  if (tier >= tierIndex('LEGENDARY') && ctx.opponentLaneCounts) {
    const counts = ctx.opponentLaneCounts;
    const total = counts.LEFT + counts.CENTRE + counts.RIGHT;
    if (total >= 10) {
      const lanes: PlanLane[] = ['LEFT', 'CENTRE', 'RIGHT'];
      for (const lane of lanes) {
        if (counts[lane] / total >= 0.55) adaptedLane = lane;
      }
    }
  }

  return { mentality, pressTrap, offsideTrap, timeWasting, switchPlayBias, subAdvice, adaptedLane };
}

export interface MatchPlanLabResult {
  chaseOk: boolean;
  parkBusOk: boolean;
  timeWasteOk: boolean;
  trapsOk: boolean;
  adaptationOk: boolean;
  fairnessOk: boolean;
  detail: string;
}

/** Deterministic checks of the plan brain + the fairness floors. */
export function runMatchPlanLab(): MatchPlanLabResult {
  const base = { side: 'AWAY' as TeamSide, scoreFor: 0, scoreAgainst: 0, minute: 0, difficulty: 'WORLD_CLASS' as Difficulty };
  const chase = computeMatchPlan({ ...base, scoreFor: 0, scoreAgainst: 1, minute: 80 });
  const chaseOk = chase.mentality === 'ULTRA_ATTACKING'
    && computeMatchPlan({ ...base, scoreFor: 0, scoreAgainst: 1, minute: 60 }).mentality === 'ATTACKING';
  const park = computeMatchPlan({ ...base, scoreFor: 1, scoreAgainst: 0, minute: 85 });
  const parkBusOk = park.mentality === 'ULTRA_DEFENDING' && park.pressTrap === false;
  const timeWasteOk = park.timeWasting > 0.8
    && computeMatchPlan({ ...base, scoreFor: 1, scoreAgainst: 0, minute: 50 }).timeWasting === 0
    && computeMatchPlan({ ...base, scoreFor: 0, scoreAgainst: 1, minute: 85 }).timeWasting === 0;
  const trapsOk = computeMatchPlan({ ...base, difficulty: 'WORLD_CLASS' }).offsideTrap === true
    && computeMatchPlan({ ...base, difficulty: 'PROFESSIONAL' }).offsideTrap === false
    && computeMatchPlan({ ...base, difficulty: 'PROFESSIONAL' }).pressTrap === false;
  const counts = { LEFT: 14, CENTRE: 4, RIGHT: 3 };
  const adaptationOk = computeMatchPlan({ ...base, difficulty: 'LEGENDARY', opponentLaneCounts: counts }).adaptedLane === 'LEFT'
    && computeMatchPlan({ ...base, difficulty: 'WORLD_CLASS', opponentLaneCounts: counts }).adaptedLane === null
    && computeMatchPlan({ ...base, difficulty: 'ULTIMATE', opponentLaneCounts: { LEFT: 4, CENTRE: 4, RIGHT: 4 } }).adaptedLane === null;
  const fairnessOk = Object.values(DIFFICULTY_PROFILES).every(
    (p) => p.maxSpeedMultiplier === 1 && p.passAccuracy <= 0.97 && p.shotPrecision <= 0.95,
  );
  return {
    chaseOk, parkBusOk, timeWasteOk, trapsOk, adaptationOk, fairnessOk,
    detail: `chase=${chase.mentality}, 85' lead=${park.mentality} waste=${park.timeWasting.toFixed(2)}, floors: speed ×1, pass ≤0.97, shot ≤0.95 on all 7 tiers`,
  };
}
