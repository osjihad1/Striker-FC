// Striker FC — ai/DifficultyProfiles.ts (Phase 04, Spec 05 §4 · ladder
// extended in the lobby-redesign pass at the user's direction)
// Seven difficulty tiers, Rookie → Ultimate. Fair scaling only, the way
// the big studios do it: higher tiers think faster and read the game
// better — quicker decisions, cleaner passing, tighter marking, real lane
// anticipation, braver through balls, a keeper who reads crosses and
// 1v1s earlier. Player top speed is NEVER scaled (maxSpeedMultiplier is
// 1.0 on every tier): the Ultimate AI beats you by playing better
// football, not by running faster than physics allows your players to.

import type { Difficulty } from '../core/types';

export interface DifficultyProfile {
  id: Difficulty;
  label: string;
  /** Seconds of latency before the AI ball carrier commits to a decision. */
  decisionDelaySec: number;
  /** 0..1 — scales pass aim error (error cone = (1 - accuracy) * base). */
  passAccuracy: number;
  /** 0..1 — scales shot aim error the same way. */
  shotPrecision: number;
  /** 0..1 — probability an eligible 1v1 triggers a skill move. */
  skillMoveFreq: number;
  /** Human label from the spec table. */
  pressCoordinationLabel: string;
  /** 0..1 — how readily the second presser joins and lanes get cut off. */
  pressCoordination: number;
  /** Multiplier on the mentality press radius for this tier. */
  pressRadiusMult: number;
  /** Standing-tackle success adjustment for AI defenders (-0.15..+0.15). */
  tackleAdj: number;
  /** GK reaction-delay adjustment in seconds (negative = sharper). */
  gkReactionAdjSec: number;
  /** Carrier re-evaluates at 10Hz / this divisor of extra patience. */
  carrierPatienceMult: number;
  /** 0..1 — man-marking tightness: how close and goal-side a marker sits. */
  markingTightness: number;
  /** 0..1 — passing-lane anticipation: stepping in to intercept passes. */
  anticipation: number;
  /** 0..1 — through-ball bravery: how readily the carrier plays the killer pass. */
  throughBallFreq: number;
  /** 0..1 — GK game reading: claiming crosses and rushing 1v1s earlier. */
  gkPositioning: number;
  /** Fair play guard: AI players never run faster than the user's players. */
  maxSpeedMultiplier: 1;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  BEGINNER: {
    id: 'BEGINNER', label: 'Rookie',
    decisionDelaySec: 0.65, passAccuracy: 0.68, shotPrecision: 0.55,
    skillMoveFreq: 0, pressCoordinationLabel: 'Low (passive contain)',
    pressCoordination: 0.15, pressRadiusMult: 0.7, tackleAdj: -0.15,
    gkReactionAdjSec: 0.05, carrierPatienceMult: 1.6,
    markingTightness: 0.1, anticipation: 0.08, throughBallFreq: 0.05, gkPositioning: 0.15,
    maxSpeedMultiplier: 1,
  },
  AMATEUR: {
    id: 'AMATEUR', label: 'Amateur',
    decisionDelaySec: 0.45, passAccuracy: 0.76, shotPrecision: 0.68,
    skillMoveFreq: 0.05, pressCoordinationLabel: 'Moderate',
    pressCoordination: 0.35, pressRadiusMult: 0.85, tackleAdj: -0.07,
    gkReactionAdjSec: 0.02, carrierPatienceMult: 1.3,
    markingTightness: 0.25, anticipation: 0.2, throughBallFreq: 0.15, gkPositioning: 0.3,
    maxSpeedMultiplier: 1,
  },
  SEMI_PRO: {
    id: 'SEMI_PRO', label: 'Semi-Pro',
    decisionDelaySec: 0.28, passAccuracy: 0.83, shotPrecision: 0.78,
    skillMoveFreq: 0.15, pressCoordinationLabel: 'Structured zonal',
    pressCoordination: 0.55, pressRadiusMult: 1.0, tackleAdj: 0,
    gkReactionAdjSec: 0, carrierPatienceMult: 1.0,
    markingTightness: 0.45, anticipation: 0.38, throughBallFreq: 0.3, gkPositioning: 0.5,
    maxSpeedMultiplier: 1,
  },
  PROFESSIONAL: {
    id: 'PROFESSIONAL', label: 'Professional',
    decisionDelaySec: 0.2, passAccuracy: 0.87, shotPrecision: 0.83,
    skillMoveFreq: 0.22, pressCoordinationLabel: 'Organised press',
    pressCoordination: 0.68, pressRadiusMult: 1.1, tackleAdj: 0.04,
    gkReactionAdjSec: -0.01, carrierPatienceMult: 0.9,
    markingTightness: 0.6, anticipation: 0.55, throughBallFreq: 0.45, gkPositioning: 0.65,
    maxSpeedMultiplier: 1,
  },
  WORLD_CLASS: {
    id: 'WORLD_CLASS', label: 'World Class',
    decisionDelaySec: 0.15, passAccuracy: 0.9, shotPrecision: 0.88,
    skillMoveFreq: 0.32, pressCoordinationLabel: 'High press + runs',
    pressCoordination: 0.8, pressRadiusMult: 1.2, tackleAdj: 0.07,
    gkReactionAdjSec: -0.02, carrierPatienceMult: 0.8,
    markingTightness: 0.75, anticipation: 0.72, throughBallFreq: 0.6, gkPositioning: 0.8,
    maxSpeedMultiplier: 1,
  },
  LEGENDARY: {
    id: 'LEGENDARY', label: 'Legendary',
    decisionDelaySec: 0.06, passAccuracy: 0.95, shotPrecision: 0.94,
    skillMoveFreq: 0.5, pressCoordinationLabel: 'Relentless tactical',
    pressCoordination: 1.0, pressRadiusMult: 1.4, tackleAdj: 0.13,
    gkReactionAdjSec: -0.04, carrierPatienceMult: 0.6,
    markingTightness: 0.9, anticipation: 0.88, throughBallFreq: 0.78, gkPositioning: 0.92,
    maxSpeedMultiplier: 1,
  },
  ULTIMATE: {
    id: 'ULTIMATE', label: 'Ultimate',
    decisionDelaySec: 0.03, passAccuracy: 0.97, shotPrecision: 0.95,
    skillMoveFreq: 0.62, pressCoordinationLabel: 'Perfect shape, hunts in packs',
    pressCoordination: 1.0, pressRadiusMult: 1.5, tackleAdj: 0.15,
    gkReactionAdjSec: -0.05, carrierPatienceMult: 0.5,
    markingTightness: 1.0, anticipation: 0.97, throughBallFreq: 0.9, gkPositioning: 1.0,
    maxSpeedMultiplier: 1,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['BEGINNER', 'AMATEUR', 'SEMI_PRO', 'PROFESSIONAL', 'WORLD_CLASS', 'LEGENDARY', 'ULTIMATE'];

export function getDifficultyProfile(id: Difficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[id];
}
