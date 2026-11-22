// Striker FC — data/Formations.ts
// The 10 tactical formations from Blueprint 09, with normalized home coordinates.

import type { Formation } from '../core/types';
import { SEED_FORMATIONS } from './seedDatabase';

export function getAllFormations(): Formation[] {
  return SEED_FORMATIONS;
}

export function getFormationById(id: string): Formation | undefined {
  return SEED_FORMATIONS.find((f) => f.id === id);
}

export const DEFAULT_FORMATION_ID = '4-3-3-attack';
