// Striker FC — data/seedDatabase.ts
// Exact starter data from Blueprint 09 (user-supplied seed): 12 clubs, 10 formations,
// 20 marquee players, 5 packs. Marquee SubStats are derived deterministically in
// PlayerDatabase.ts (the seed file ships CoreStats only).

import type { Club, Formation, PackDef, Position, Rarity } from '../core/types';
import type { CoreStats, FaceAppearance, PlayStyleId } from '../core/types';

export const SEED_META = {
  gameTitle: 'STRIKER FC',
  version: '1.0.0',
} as const;

export const SEED_CLUBS: Club[] = [
  { id: 'mad_royals', name: 'Madrid Royals', abbr: 'MDR', primary: '#f8fafc', secondary: '#d97706', league: 'Euro Premier' },
  { id: 'man_sky', name: 'Manchester Sky', abbr: 'MNS', primary: '#38bdf8', secondary: '#0f172a', league: 'Albion League' },
  { id: 'cat_blau', name: 'Catalonia United', abbr: 'CAT', primary: '#1d4ed8', secondary: '#be123c', league: 'Euro Premier' },
  { id: 'paris_etoile', name: 'Paris Etoile', abbr: 'PAR', primary: '#1e3a8a', secondary: '#ef4444', league: 'Ligue Royale' },
  { id: 'munich_stern', name: 'Munich Stern', abbr: 'MUN', primary: '#dc2626', secondary: '#f8fafc', league: 'Bavaria Pro' },
  { id: 'london_cannons', name: 'London Cannons', abbr: 'LON', primary: '#e11d48', secondary: '#ffffff', league: 'Albion League' },
  { id: 'milan_nero', name: 'Milano Nerazzurri', abbr: 'MIL', primary: '#1e40af', secondary: '#020617', league: 'Calcio Serie' },
  { id: 'mersey_reds', name: 'Mersey Reds', abbr: 'MRY', primary: '#b91c1c', secondary: '#fbbf24', league: 'Albion League' },
  { id: 'rio_flamengo', name: 'Rio Atletico', abbr: 'RIO', primary: '#991b1b', secondary: '#111827', league: 'Copa Sul' },
  { id: 'buenos_plata', name: 'Buenos Plata', abbr: 'BPL', primary: '#ffffff', secondary: '#dc2626', league: 'Copa Sul' },
  { id: 'dhaka_tigers', name: 'Dhaka Royal Tigers', abbr: 'DHK', primary: '#059669', secondary: '#ef4444', league: 'Asia Super' },
  { id: 'tokyo_blazers', name: 'Tokyo Blazers', abbr: 'TKY', primary: '#0284c7', secondary: '#facc15', league: 'Asia Super' },
];

type SlotTuple = readonly [Position, number, number];

function formation(id: string, name: string, slots: readonly SlotTuple[]): Formation {
  return { id, name, slots: slots.map(([role, nx, ny]) => ({ role, nx, ny })) };
}

export const SEED_FORMATIONS: Formation[] = [
  formation('4-3-3-attack', '4-3-3 Attack', [
    ['GK', 0.05, 0.5], ['LB', 0.23, 0.14], ['CB', 0.2, 0.38], ['CB', 0.2, 0.62], ['RB', 0.23, 0.86],
    ['CM', 0.46, 0.3], ['CAM', 0.6, 0.5], ['CM', 0.46, 0.7],
    ['LW', 0.78, 0.16], ['ST', 0.84, 0.5], ['RW', 0.78, 0.84],
  ]),
  formation('4-3-3-holding', '4-3-3 Holding', [
    ['GK', 0.05, 0.5], ['LB', 0.22, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.22, 0.86],
    ['CDM', 0.37, 0.5], ['CM', 0.52, 0.3], ['CM', 0.52, 0.7],
    ['LW', 0.78, 0.16], ['ST', 0.84, 0.5], ['RW', 0.78, 0.84],
  ]),
  formation('4-2-4', '4-2-4', [
    ['GK', 0.05, 0.5], ['LB', 0.22, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.22, 0.86],
    ['CM', 0.47, 0.36], ['CM', 0.47, 0.64],
    ['LW', 0.77, 0.14], ['ST', 0.84, 0.39], ['ST', 0.84, 0.61], ['RW', 0.77, 0.86],
  ]),
  formation('4-4-2-flat', '4-4-2 Flat', [
    ['GK', 0.05, 0.5], ['LB', 0.22, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.22, 0.86],
    ['LM', 0.5, 0.14], ['CM', 0.46, 0.38], ['CM', 0.46, 0.62], ['RM', 0.5, 0.86],
    ['ST', 0.82, 0.38], ['ST', 0.82, 0.62],
  ]),
  formation('4-1-2-1-2-narrow', '4-1-2-1-2 Narrow', [
    ['GK', 0.05, 0.5], ['LB', 0.24, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.24, 0.86],
    ['CDM', 0.36, 0.5], ['CM', 0.5, 0.28], ['CM', 0.5, 0.72], ['CAM', 0.64, 0.5],
    ['ST', 0.83, 0.38], ['ST', 0.83, 0.62],
  ]),
  formation('4-2-3-1-wide', '4-2-3-1 Wide', [
    ['GK', 0.05, 0.5], ['LB', 0.22, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.22, 0.86],
    ['CDM', 0.38, 0.36], ['CDM', 0.38, 0.64],
    ['LM', 0.62, 0.16], ['CAM', 0.62, 0.5], ['RM', 0.62, 0.84],
    ['ST', 0.84, 0.5],
  ]),
  formation('3-5-2', '3-5-2', [
    ['GK', 0.05, 0.5], ['CB', 0.2, 0.26], ['CB', 0.18, 0.5], ['CB', 0.2, 0.74],
    ['CDM', 0.38, 0.37], ['CDM', 0.38, 0.63],
    ['LM', 0.54, 0.12], ['CAM', 0.62, 0.5], ['RM', 0.54, 0.88],
    ['ST', 0.83, 0.38], ['ST', 0.83, 0.62],
  ]),
  formation('3-4-3-diamond', '3-4-3 Diamond', [
    ['GK', 0.05, 0.5], ['CB', 0.2, 0.26], ['CB', 0.18, 0.5], ['CB', 0.2, 0.74],
    ['CDM', 0.37, 0.5], ['LM', 0.52, 0.16], ['RM', 0.52, 0.84], ['CAM', 0.63, 0.5],
    ['LW', 0.79, 0.18], ['ST', 0.85, 0.5], ['RW', 0.79, 0.82],
  ]),
  formation('5-2-2-1', '5-2-2-1', [
    ['GK', 0.05, 0.5], ['LWB', 0.27, 0.11], ['CB', 0.19, 0.3], ['CB', 0.17, 0.5], ['CB', 0.19, 0.7], ['RWB', 0.27, 0.89],
    ['CM', 0.47, 0.36], ['CM', 0.47, 0.64],
    ['LW', 0.74, 0.22], ['RW', 0.74, 0.78], ['ST', 0.85, 0.5],
  ]),
  formation('4-3-2-1', '4-3-2-1', [
    ['GK', 0.05, 0.5], ['LB', 0.22, 0.14], ['CB', 0.19, 0.38], ['CB', 0.19, 0.62], ['RB', 0.22, 0.86],
    ['CM', 0.44, 0.28], ['CDM', 0.4, 0.5], ['CM', 0.44, 0.72],
    ['CF', 0.69, 0.33], ['CF', 0.69, 0.67], ['ST', 0.84, 0.5],
  ]),
];

export interface MarqueeSeed {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  clubId: string;
  position: Position;
  altPositions: Position[];
  baseOvr: number;
  rarity: Rarity;
  preferredFoot: 'RIGHT' | 'LEFT';
  weakFoot: 1 | 2 | 3 | 4 | 5;
  skillMoves: 1 | 2 | 3 | 4 | 5;
  workRateAttack: 'LOW' | 'MED' | 'HIGH';
  workRateDefense: 'LOW' | 'MED' | 'HIGH';
  playStyles: PlayStyleId[];
  stats: CoreStats;
  appearance: FaceAppearance;
  baseMarketPrice: number;
}

export const SEED_MARQUEE_PLAYERS: MarqueeSeed[] = [
  {
    id: 'leg_pelero', name: 'Edson Pelero', shortName: 'Pelero', nationality: 'BR', clubId: 'rio_flamengo',
    position: 'ST', altPositions: ['CF', 'CAM'], baseOvr: 98, rarity: 'LEGEND',
    preferredFoot: 'RIGHT', weakFoot: 5, skillMoves: 5, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['FINESSE_SHOT_PLUS', 'TECHNICAL_DRIBBLER', 'RAPID_PLUS'],
    stats: { pac: 96, sho: 97, pas: 93, dri: 98, def: 56, phy: 84 },
    appearance: { skinTone: '#6b3e26', hairStyle: 'SHORT', hairColor: '#111111', heightCm: 173, build: 'ATHLETIC', bootColor: '#facc15' },
    baseMarketPrice: 420000,
  },
  {
    id: 'leg_alvarez_diego', name: 'Mateo Valdez', shortName: 'Valdez', nationality: 'AR', clubId: 'buenos_plata',
    position: 'CAM', altPositions: ['RW', 'CF'], baseOvr: 97, rarity: 'LEGEND',
    preferredFoot: 'LEFT', weakFoot: 4, skillMoves: 5, workRateAttack: 'HIGH', workRateDefense: 'LOW',
    playStyles: ['FINESSE_SHOT_PLUS', 'DEAD_BALL_SPECIALIST', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 92, sho: 95, pas: 97, dri: 99, def: 42, phy: 74 },
    appearance: { skinTone: '#e0ac69', hairStyle: 'CURLY', hairColor: '#1c1917', heightCm: 169, build: 'LEAN', bootColor: '#38bdf8' },
    baseMarketPrice: 390000,
  },
  {
    id: 'leg_zidour', name: 'Zinedin Zaydan', shortName: 'Zaydan', nationality: 'FR', clubId: 'mad_royals',
    position: 'CAM', altPositions: ['CM'], baseOvr: 96, rarity: 'LEGEND',
    preferredFoot: 'RIGHT', weakFoot: 5, skillMoves: 5, workRateAttack: 'MED', workRateDefense: 'MED',
    playStyles: ['INCISIVE_PASS_PLUS', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 86, sho: 92, pas: 96, dri: 96, def: 74, phy: 88 },
    appearance: { skinTone: '#d8a47f', hairStyle: 'BALD', hairColor: '#222222', heightCm: 185, build: 'ATHLETIC', bootColor: '#ffffff' },
    baseMarketPrice: 350000,
  },
  {
    id: 'leg_maldoro', name: 'Paolo Maldoro', shortName: 'Maldoro', nationality: 'IT', clubId: 'milan_nero',
    position: 'CB', altPositions: ['LB'], baseOvr: 96, rarity: 'LEGEND',
    preferredFoot: 'LEFT', weakFoot: 4, skillMoves: 2, workRateAttack: 'LOW', workRateDefense: 'HIGH',
    playStyles: ['INTERCEPT_PLUS'],
    stats: { pac: 89, sho: 60, pas: 82, dri: 78, def: 98, phy: 90 },
    appearance: { skinTone: '#e5b887', hairStyle: 'LONG', hairColor: '#292524', heightCm: 186, build: 'ATHLETIC', bootColor: '#111827' },
    baseMarketPrice: 340000,
  },
  {
    id: 'leg_yashov', name: 'Lev Yashov', shortName: 'Yashov', nationality: 'RU', clubId: 'munich_stern',
    position: 'GK', altPositions: [], baseOvr: 96, rarity: 'LEGEND',
    preferredFoot: 'RIGHT', weakFoot: 3, skillMoves: 1, workRateAttack: 'MED', workRateDefense: 'MED',
    playStyles: ['BRICK_WALL_GK'],
    stats: { pac: 95, sho: 92, pas: 86, dri: 97, def: 62, phy: 94 },
    appearance: { skinTone: '#f1c27d', hairStyle: 'SHORT', hairColor: '#1f2937', heightCm: 191, build: 'ATHLETIC', bootColor: '#000000' },
    baseMarketPrice: 320000,
  },
  {
    id: 'mst_mbappe_k', name: 'Kylian Laurent', shortName: 'Laurent', nationality: 'FR', clubId: 'mad_royals',
    position: 'ST', altPositions: ['LW'], baseOvr: 94, rarity: 'MASTER',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 5, workRateAttack: 'HIGH', workRateDefense: 'LOW',
    playStyles: ['RAPID_PLUS', 'FINESSE_SHOT_PLUS'],
    stats: { pac: 98, sho: 92, pas: 83, dri: 94, def: 38, phy: 80 },
    appearance: { skinTone: '#7b4b2a', hairStyle: 'FADE', hairColor: '#111111', heightCm: 178, build: 'ATHLETIC', bootColor: '#ec4899' },
    baseMarketPrice: 210000,
  },
  {
    id: 'mst_haaland_e', name: 'Erling Nordvik', shortName: 'Nordvik', nationality: 'NO', clubId: 'man_sky',
    position: 'ST', altPositions: [], baseOvr: 93, rarity: 'MASTER',
    preferredFoot: 'LEFT', weakFoot: 3, skillMoves: 3, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['POWER_SHOT_PLUS'],
    stats: { pac: 91, sho: 96, pas: 72, dri: 83, def: 46, phy: 94 },
    appearance: { skinTone: '#ffdbac', hairStyle: 'LONG', hairColor: '#facc15', heightCm: 195, build: 'STOCKY', bootColor: '#22d3ee' },
    baseMarketPrice: 195000,
  },
  {
    id: 'mst_vini_r', name: 'Vinicio Ribeiro', shortName: 'Ribeiro', nationality: 'BR', clubId: 'mad_royals',
    position: 'LW', altPositions: ['LM', 'ST'], baseOvr: 93, rarity: 'MASTER',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 5, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['RAPID_PLUS', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 97, sho: 87, pas: 84, dri: 95, def: 34, phy: 72 },
    appearance: { skinTone: '#5c3317', hairStyle: 'CURLY', hairColor: '#111111', heightCm: 176, build: 'LEAN', bootColor: '#f43f5e' },
    baseMarketPrice: 190000,
  },
  {
    id: 'mst_rodri_h', name: 'Rodrigo Herrera', shortName: 'Herrera', nationality: 'ES', clubId: 'man_sky',
    position: 'CDM', altPositions: ['CM'], baseOvr: 93, rarity: 'MASTER',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 3, workRateAttack: 'MED', workRateDefense: 'HIGH',
    playStyles: ['INTERCEPT_PLUS', 'POWER_SHOT_PLUS'],
    stats: { pac: 74, sho: 84, pas: 91, dri: 86, def: 92, phy: 90 },
    appearance: { skinTone: '#e0ac69', hairStyle: 'SHORT', hairColor: '#3b2f2f', heightCm: 191, build: 'ATHLETIC', bootColor: '#3b82f6' },
    baseMarketPrice: 185000,
  },
  {
    id: 'mst_bellingham_j', name: 'Jude Sterlingham', shortName: 'Sterlingham', nationality: 'GB', clubId: 'mad_royals',
    position: 'CAM', altPositions: ['CM'], baseOvr: 92, rarity: 'MASTER',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 4, workRateAttack: 'HIGH', workRateDefense: 'HIGH',
    playStyles: ['INCISIVE_PASS_PLUS', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 85, sho: 88, pas: 87, dri: 91, def: 81, phy: 87 },
    appearance: { skinTone: '#8d5524', hairStyle: 'FADE', hairColor: '#111111', heightCm: 186, build: 'ATHLETIC', bootColor: '#fbbf24' },
    baseMarketPrice: 170000,
  },
  {
    id: 'mst_salah_m', name: 'Tariq Mansour', shortName: 'Mansour', nationality: 'EG', clubId: 'mersey_reds',
    position: 'RW', altPositions: ['RM'], baseOvr: 92, rarity: 'MASTER',
    preferredFoot: 'LEFT', weakFoot: 3, skillMoves: 4, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['FINESSE_SHOT_PLUS', 'RAPID_PLUS'],
    stats: { pac: 92, sho: 91, pas: 86, dri: 91, def: 46, phy: 79 },
    appearance: { skinTone: '#c68642', hairStyle: 'CURLY', hairColor: '#111111', heightCm: 175, build: 'ATHLETIC', bootColor: '#ef4444' },
    baseMarketPrice: 165000,
  },
  {
    id: 'mst_vvd', name: 'Virgil Van Der Berg', shortName: 'Van Der Berg', nationality: 'NL', clubId: 'mersey_reds',
    position: 'CB', altPositions: [], baseOvr: 92, rarity: 'MASTER',
    preferredFoot: 'RIGHT', weakFoot: 3, skillMoves: 2, workRateAttack: 'MED', workRateDefense: 'HIGH',
    playStyles: ['INTERCEPT_PLUS'],
    stats: { pac: 82, sho: 64, pas: 77, dri: 75, def: 93, phy: 91 },
    appearance: { skinTone: '#8d5524', hairStyle: 'FADE', hairColor: '#111111', heightCm: 193, build: 'STOCKY', bootColor: '#f8fafc' },
    baseMarketPrice: 160000,
  },
  {
    id: 'mst_courtois_t', name: 'Thibaut Moreau', shortName: 'Moreau', nationality: 'BE', clubId: 'mad_royals',
    position: 'GK', altPositions: [], baseOvr: 91, rarity: 'MASTER',
    preferredFoot: 'LEFT', weakFoot: 3, skillMoves: 1, workRateAttack: 'MED', workRateDefense: 'MED',
    playStyles: ['BRICK_WALL_GK'],
    stats: { pac: 89, sho: 91, pas: 80, dri: 92, def: 52, phy: 91 },
    appearance: { skinTone: '#f1c27d', hairStyle: 'SHORT', hairColor: '#3f2e21', heightCm: 199, build: 'LEAN', bootColor: '#10b981' },
    baseMarketPrice: 145000,
  },
  {
    id: 'mst_yamal_l', name: 'Lamine Soler', shortName: 'Soler', nationality: 'ES', clubId: 'cat_blau',
    position: 'RW', altPositions: ['RM', 'CAM'], baseOvr: 91, rarity: 'MASTER',
    preferredFoot: 'LEFT', weakFoot: 4, skillMoves: 5, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['FINESSE_SHOT_PLUS', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 91, sho: 85, pas: 88, dri: 94, def: 36, phy: 68 },
    appearance: { skinTone: '#a67346', hairStyle: 'CURLY', hairColor: '#1c1917', heightCm: 180, build: 'LEAN', bootColor: '#a855f7' },
    baseMarketPrice: 155000,
  },
  {
    id: 'elt_hakimi_a', name: 'Achraf Benali', shortName: 'Benali', nationality: 'MA', clubId: 'paris_etoile',
    position: 'RB', altPositions: ['RWB', 'RM'], baseOvr: 89, rarity: 'ELITE',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 4, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['RAPID_PLUS'],
    stats: { pac: 94, sho: 76, pas: 83, dri: 84, def: 82, phy: 81 },
    appearance: { skinTone: '#c68642', hairStyle: 'FADE', hairColor: '#111111', heightCm: 181, build: 'ATHLETIC', bootColor: '#38bdf8' },
    baseMarketPrice: 92000,
  },
  {
    id: 'elt_hernandez_t', name: 'Theo Valois', shortName: 'Valois', nationality: 'FR', clubId: 'milan_nero',
    position: 'LB', altPositions: ['LWB'], baseOvr: 89, rarity: 'ELITE',
    preferredFoot: 'LEFT', weakFoot: 3, skillMoves: 3, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['RAPID_PLUS'],
    stats: { pac: 95, sho: 74, pas: 80, dri: 83, def: 83, phy: 89 },
    appearance: { skinTone: '#f1c27d', hairStyle: 'FADE', hairColor: '#fbbf24', heightCm: 184, build: 'ATHLETIC', bootColor: '#f43f5e' },
    baseMarketPrice: 94000,
  },
  {
    id: 'elt_saliba_w', name: 'William Diallo', shortName: 'Diallo', nationality: 'FR', clubId: 'london_cannons',
    position: 'CB', altPositions: [], baseOvr: 89, rarity: 'ELITE',
    preferredFoot: 'RIGHT', weakFoot: 3, skillMoves: 2, workRateAttack: 'MED', workRateDefense: 'HIGH',
    playStyles: ['INTERCEPT_PLUS'],
    stats: { pac: 84, sho: 48, pas: 75, dri: 76, def: 90, phy: 87 },
    appearance: { skinTone: '#6b3e26', hairStyle: 'FADE', hairColor: '#111111', heightCm: 192, build: 'ATHLETIC', bootColor: '#10b981' },
    baseMarketPrice: 89000,
  },
  {
    id: 'elt_pedri_g', name: 'Pedro Navarro', shortName: 'Navarro', nationality: 'ES', clubId: 'cat_blau',
    position: 'CM', altPositions: ['CAM'], baseOvr: 89, rarity: 'ELITE',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 4, workRateAttack: 'HIGH', workRateDefense: 'HIGH',
    playStyles: ['INCISIVE_PASS_PLUS', 'TECHNICAL_DRIBBLER'],
    stats: { pac: 81, sho: 76, pas: 90, dri: 92, def: 74, phy: 75 },
    appearance: { skinTone: '#e5b887', hairStyle: 'SHORT', hairColor: '#292524', heightCm: 174, build: 'LEAN', bootColor: '#22c55e' },
    baseMarketPrice: 88000,
  },
  {
    id: 'elt_rahman_j', name: 'Hamza Rahman', shortName: 'Rahman', nationality: 'BD', clubId: 'dhaka_tigers',
    position: 'CDM', altPositions: ['CM', 'CB'], baseOvr: 86, rarity: 'ELITE',
    preferredFoot: 'RIGHT', weakFoot: 4, skillMoves: 3, workRateAttack: 'MED', workRateDefense: 'HIGH',
    playStyles: ['INTERCEPT_PLUS', 'DEAD_BALL_SPECIALIST'],
    stats: { pac: 81, sho: 74, pas: 84, dri: 82, def: 87, phy: 86 },
    appearance: { skinTone: '#b07d4f', hairStyle: 'FADE', hairColor: '#111111', heightCm: 180, build: 'ATHLETIC', bootColor: '#10b981' },
    baseMarketPrice: 62000,
  },
  {
    id: 'elt_kubo_t', name: 'Kenji Takahashi', shortName: 'Takahashi', nationality: 'JP', clubId: 'tokyo_blazers',
    position: 'RW', altPositions: ['CAM', 'RM'], baseOvr: 86, rarity: 'ELITE',
    preferredFoot: 'LEFT', weakFoot: 4, skillMoves: 4, workRateAttack: 'HIGH', workRateDefense: 'MED',
    playStyles: ['TECHNICAL_DRIBBLER', 'FINESSE_SHOT_PLUS'],
    stats: { pac: 88, sho: 81, pas: 83, dri: 90, def: 42, phy: 65 },
    appearance: { skinTone: '#f1c27d', hairStyle: 'SHORT', hairColor: '#111111', heightCm: 173, build: 'LEAN', bootColor: '#facc15' },
    baseMarketPrice: 60000,
  },
];

// ---------------------------------------------------------------------------
// Club expansion (2026-11-22, owner's request): 16 REAL clubs with their real
// kit colours (personal play only — the game is not published or sold) and 12
// NEW original-IP clubs. Kept in this module so every data consumer can read
// the full club list without import cycles; Clubs.ts builds the derived
// club teams (squads, XIs, Team OVRs) on top.
// ---------------------------------------------------------------------------

export const REAL_CLUBS: Club[] = [
  { id: 'real_madrid', name: 'Real Madrid', abbr: 'RMA', primary: '#f8fafc', secondary: '#febe10', league: 'La Liga' },
  { id: 'fc_barcelona', name: 'FC Barcelona', abbr: 'BAR', primary: '#a50044', secondary: '#004d98', league: 'La Liga' },
  { id: 'man_city', name: 'Manchester City', abbr: 'MCI', primary: '#6cabdd', secondary: '#1c2c5b', league: 'Premier League' },
  { id: 'liverpool', name: 'Liverpool', abbr: 'LIV', primary: '#c8102e', secondary: '#f0b323', league: 'Premier League' },
  { id: 'bayern_munich', name: 'Bayern Munich', abbr: 'FCB', primary: '#dc052d', secondary: '#f8fafc', league: 'Bundesliga' },
  { id: 'psg', name: 'Paris Saint-Germain', abbr: 'PSG', primary: '#004170', secondary: '#da291c', league: 'Ligue 1' },
  { id: 'arsenal', name: 'Arsenal', abbr: 'ARS', primary: '#ef0107', secondary: '#f8fafc', league: 'Premier League' },
  { id: 'chelsea', name: 'Chelsea', abbr: 'CHE', primary: '#034694', secondary: '#f8fafc', league: 'Premier League' },
  { id: 'man_utd', name: 'Manchester United', abbr: 'UTD', primary: '#da291c', secondary: '#fbe122', league: 'Premier League' },
  { id: 'inter_milan', name: 'Inter Milan', abbr: 'INT', primary: '#0068a8', secondary: '#020617', league: 'Serie A' },
  { id: 'ac_milan', name: 'AC Milan', abbr: 'ACM', primary: '#fb090b', secondary: '#111827', league: 'Serie A' },
  { id: 'juventus', name: 'Juventus', abbr: 'JUV', primary: '#111827', secondary: '#f8fafc', league: 'Serie A' },
  { id: 'dortmund', name: 'Borussia Dortmund', abbr: 'BVB', primary: '#fde100', secondary: '#111827', league: 'Bundesliga' },
  { id: 'atletico_madrid', name: 'Atletico Madrid', abbr: 'ATM', primary: '#cb3524', secondary: '#f8fafc', league: 'La Liga' },
  { id: 'al_nassr', name: 'Al Nassr', abbr: 'NSR', primary: '#ffdd00', secondary: '#0038a8', league: 'Saudi Pro League' },
  { id: 'inter_miami', name: 'Inter Miami', abbr: 'MIA', primary: '#f7b5cd', secondary: '#111827', league: 'MLS' },
];

export const NEW_ORIGINAL_CLUBS: Club[] = [
  { id: 'chittagong_thunder', name: 'Chittagong Thunder', abbr: 'CTG', primary: '#0ea5e9', secondary: '#facc15', league: 'Asia Super' },
  { id: 'sylhet_stars', name: 'Sylhet Stars', abbr: 'SYL', primary: '#7c3aed', secondary: '#f8fafc', league: 'Asia Super' },
  { id: 'khulna_kings', name: 'Khulna Kings', abbr: 'KHU', primary: '#b45309', secondary: '#111827', league: 'Asia Super' },
  { id: 'rajshahi_royals', name: 'Rajshahi Royals', abbr: 'RAJ', primary: '#be185d', secondary: '#facc15', league: 'Asia Super' },
  { id: 'barisal_blaze', name: 'Barisal Blaze', abbr: 'BSL', primary: '#ea580c', secondary: '#111827', league: 'Asia Super' },
  { id: 'coxs_waves', name: "Cox's Bazar Waves", abbr: 'COX', primary: '#0891b2', secondary: '#f8fafc', league: 'Asia Super' },
  { id: 'tokyo_samurai', name: 'Tokyo Samurai', abbr: 'SAM', primary: '#1e40af', secondary: '#dc2626', league: 'Asia Super' },
  { id: 'seoul_dragons', name: 'Seoul Dragons', abbr: 'SEO', primary: '#dc2626', secondary: '#facc15', league: 'Asia Super' },
  { id: 'mumbai_warriors', name: 'Mumbai Warriors', abbr: 'MUM', primary: '#f97316', secondary: '#1e3a8a', league: 'Asia Super' },
  { id: 'cairo_pharaohs', name: 'Cairo Pharaohs', abbr: 'CAI', primary: '#facc15', secondary: '#b91c1c', league: 'African Premier' },
  { id: 'lagos_eagles', name: 'Lagos Eagles', abbr: 'LAG', primary: '#16a34a', secondary: '#f8fafc', league: 'African Premier' },
  { id: 'rio_samba', name: 'Rio Samba', abbr: 'SMB', primary: '#22c55e', secondary: '#facc15', league: 'Copa Sul' },
  // Rig-merge fix round (P2): the Napoli analog — added so Kevin De Bruyne
  // (Napoli since June 2025) has a correct analog home instead of the
  // Inter analog Milano Nerazzurri. Appended LAST so every existing
  // generated player's club, id and RNG draw stays byte-identical.
  { id: 'napoli_azzurri', name: 'Napoli Azzurri', abbr: 'NAP', primary: '#12a0d7', secondary: '#ffffff', league: 'Calcio Serie' },
];

export const SEED_PACKS: PackDef[] = [
  {
    id: 'daily_free', name: 'Daily Welcome Pack', currency: 'COINS', price: 0, cardsCount: 3,
    odds: { BRONZE: 0.45, SILVER: 0.35, GOLD: 0.16, ELITE: 0.035, MASTER: 0.004, LEGEND: 0.001 },
  },
  {
    id: 'gold_pro', name: 'Gold Pro Pack', currency: 'COINS', price: 15000, cardsCount: 4,
    odds: { BRONZE: 0, SILVER: 0.25, GOLD: 0.58, ELITE: 0.14, MASTER: 0.025, LEGEND: 0.005 },
  },
  {
    id: 'elite_attack', name: 'Elite Striker Pack', currency: 'COINS', price: 45000, cardsCount: 5, guaranteedMinRarity: 'ELITE',
    odds: { BRONZE: 0, SILVER: 0, GOLD: 0.45, ELITE: 0.42, MASTER: 0.11, LEGEND: 0.02 },
  },
  {
    id: 'master_vault', name: 'Master Vault Pack', currency: 'GEMS', price: 1000, cardsCount: 5, guaranteedMinRarity: 'MASTER',
    odds: { BRONZE: 0, SILVER: 0, GOLD: 0, ELITE: 0.55, MASTER: 0.36, LEGEND: 0.09 },
  },
  {
    id: 'legend_icon', name: 'Legend Icon Pack', currency: 'GEMS', price: 2500, cardsCount: 3, guaranteedMinRarity: 'LEGEND',
    odds: { BRONZE: 0, SILVER: 0, GOLD: 0, ELITE: 0.2, MASTER: 0.45, LEGEND: 0.35 },
  },
];
