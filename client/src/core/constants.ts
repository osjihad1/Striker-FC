// Striker FC — core/constants.ts
// Regulation pitch & ball physics constants from Blueprint 04, plus mentality tuning (Blueprint 05).

export const PITCH = {
  LENGTH: 105.0,
  HALF_LENGTH: 52.5,
  WIDTH: 68.0,
  HALF_WIDTH: 34.0,
  PENALTY_AREA_LENGTH: 16.5,
  PENALTY_AREA_HALF_WIDTH: 20.16,
  GOAL_AREA_LENGTH: 5.5,
  GOAL_AREA_HALF_WIDTH: 9.16,
  PENALTY_SPOT_DIST: 11.0,
  CENTER_CIRCLE_RADIUS: 9.15,
  GOAL_WIDTH: 7.32,
  GOAL_HALF_WIDTH: 3.66,
  GOAL_HEIGHT: 2.44,
  GOAL_DEPTH: 2.2,
  POST_RADIUS: 0.06,
} as const;

export const BALL_CONST = {
  RADIUS: 0.11,
  MASS: 0.43,
  GRAVITY: 9.81,
  AIR_DENSITY: 1.225,
  DRAG_COEFF: 0.24,
  MAGNUS_COEFF: 0.00052,
  RESTITUTION_GRASS: 0.58,
  RESTITUTION_WET: 0.64,
  RESTITUTION_POST: 0.78,
  ROLL_FRICTION_DRY: 1.85,
  ROLL_FRICTION_WET: 1.25,
  SPIN_DECAY_AIR: 0.25,
  SPIN_DECAY_GROUND: 3.2,
} as const;

/** Cross-section area of the ball used by the drag formula: π·r² ≈ 0.03801 m². */
export const BALL_AREA = Math.PI * BALL_CONST.RADIUS * BALL_CONST.RADIUS;

export interface MentalityConfig {
  lineShiftX: number;
  compactness: number;
  pressRadius: number;
  forwardRunProb: number;
}

export const MENTALITY_CONFIG: Record<string, MentalityConfig> = {
  ULTRA_DEFENDING: { lineShiftX: -0.14, compactness: 0.72, pressRadius: 8, forwardRunProb: 0.15 },
  DEFENDING: { lineShiftX: -0.07, compactness: 0.84, pressRadius: 11, forwardRunProb: 0.35 },
  BALANCED: { lineShiftX: 0.0, compactness: 0.95, pressRadius: 15, forwardRunProb: 0.6 },
  ATTACKING: { lineShiftX: 0.08, compactness: 1.05, pressRadius: 21, forwardRunProb: 0.82 },
  ULTRA_ATTACKING: { lineShiftX: 0.16, compactness: 1.12, pressRadius: 28, forwardRunProb: 0.96 },
};

export const RARITY_COLORS: Record<string, { bg: string; edge: string; text: string; label: string }> = {
  BRONZE: { bg: '#3d2417', edge: '#b0793f', text: '#f0c08a', label: 'Bronze' },
  SILVER: { bg: '#23272e', edge: '#9aa5b1', text: '#dbe2ea', label: 'Silver' },
  GOLD: { bg: '#2e2410', edge: '#d4a017', text: '#ffd94d', label: 'Gold' },
  ELITE: { bg: '#0d2436', edge: '#38bdf8', text: '#a5e3ff', label: 'Elite' },
  MASTER: { bg: '#2a1038', edge: '#c084fc', text: '#e9d5ff', label: 'Master' },
  LEGEND: { bg: '#33270a', edge: '#f5c542', text: '#ffe9a8', label: 'Legend' },
};

export const ECONOMY = {
  STARTER_COINS: 25000,
  STARTER_GEMS: 500,
  STARTER_RANK_UP_TOKENS: 2,
  MARKET_TAX_RATE: 0.05,
} as const;
