// Striker FC — data/PlayStyles.ts
// PlayStyle definitions and gameplay modifiers from Blueprint 03.

import type { PlayStyleId } from '../core/types';

export interface PlayStyleDef {
  id: PlayStyleId;
  name: string;
  description: string;
  modifiers: Record<string, number>;
}

export const PLAY_STYLES: PlayStyleDef[] = [
  {
    id: 'FINESSE_SHOT_PLUS', name: 'Finesse Shot+',
    description: '+18% curve spin and +10% finesse accuracy. Auto-curves toward the far post.',
    modifiers: { curveSpinBonus: 0.18, finesseAccuracyBonus: 0.1 },
  },
  {
    id: 'POWER_SHOT_PLUS', name: 'Power Shot+',
    description: '−20% wind-up time and +12% topspin dip on driven strikes.',
    modifiers: { windupReduction: 0.2, topspinDipBonus: 0.12 },
  },
  {
    id: 'INCISIVE_PASS_PLUS', name: 'Incisive Pass+',
    description: '+15% through-ball speed and extra curve around defenders.',
    modifiers: { throughSpeedBonus: 0.15, throughCurveBonus: 0.12 },
  },
  {
    id: 'RAPID_PLUS', name: 'Rapid+',
    description: '+8% knock-on burst speed and lower sprint touch error.',
    modifiers: { knockOnBurstBonus: 0.08, sprintTouchErrorReduction: 0.25 },
  },
  {
    id: 'TECHNICAL_DRIBBLER', name: 'Technical Dribbler',
    description: '+15% controlled sprint turn rate; tight touches at full pace.',
    modifiers: { sprintTurnRateBonus: 0.15 },
  },
  {
    id: 'DEAD_BALL_SPECIALIST', name: 'Dead Ball Specialist',
    description: 'Extended free-kick trajectory preview and +15% free-kick spin.',
    modifiers: { fkSpinBonus: 0.15, fkPreviewBonus: 0.3 },
  },
  {
    id: 'INTERCEPT_PLUS', name: 'Intercept+',
    description: '+25% interception reach radius when reading passing lanes.',
    modifiers: { interceptionReachBonus: 0.25 },
  },
  {
    id: 'BRICK_WALL_GK', name: 'Brick Wall GK',
    description: '+12% goalkeeper dive reach and safer parries directed outward.',
    modifiers: { gkDiveReachBonus: 0.12, parrySafetyBonus: 0.2 },
  },
];

export function getPlayStyle(id: PlayStyleId): PlayStyleDef | undefined {
  return PLAY_STYLES.find((p) => p.id === id);
}
