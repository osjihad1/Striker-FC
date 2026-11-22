// Striker FC — data/PlayerDatabase.ts
// Loads the 20 marquee players from the seed and deterministically generates 160 more
// (180 total) with a fixed-seed PRNG: identical database on every device, every launch.
// Generated players cover all 12 outfield/GK positions used by the formations and the
// Bronze / Silver / Gold / Elite rarity bands, with position-appropriate SubStats.

import { clamp, mulberry32, pick, randInt } from '../core/math';
import type {
CoreStats, FaceAppearance, PlayerTemplate, PlayStyleId, Position, Rarity, SubStats,
} from '../core/types';
import { positionGroup } from '../core/types';
import { REAL_PLAYER_SEEDS, STAR_CELEBRATIONS, type RealPlayerSeed } from './RealPlayers';
import { NEW_ORIGINAL_CLUBS, REAL_CLUBS, SEED_CLUBS, SEED_MARQUEE_PLAYERS, type MarqueeSeed } from './seedDatabase';

const DB_SEED = 0x5f3759df;

const FIRST_NAMES = [
  'Marco', 'Lucas', 'Diego', 'Andre', 'Rafael', 'Tomas', 'Ivan', 'Stefan', 'Jonas', 'Felix',
  'Hugo', 'Oscar', 'Emre', 'Kenan', 'Yusuf', 'Omar', 'Karim', 'Tariq', 'Ravi', 'Arjun',
  'Sho', 'Ren', 'Daichi', 'Min-Jun', 'Wei', 'Carlos', 'Miguel', 'Pablo', 'Santiago', 'Bruno',
  'Gabriel', 'Thiago', 'Enzo', 'Luca', 'Matteo', 'Alessandro', 'Nico', 'Leon', 'Maximilian', 'Finn',
  'Oliver', 'Harry', 'George', 'Alfie', 'Noah', 'Liam', 'Mason', 'Ethan', 'Logan', 'Lucas',
  'Arif', 'Tanvir', 'Shakib', 'Naim', 'Rifat', 'Imran', 'Fahim', 'Sakib', 'Rasel', 'Jamal',
  'Victor', 'Samuel', 'Emmanuel', 'Chinedu', 'Kwame', 'Kofi', 'Sadio', 'Idrissa', 'Amadou', 'Moussa',
] as const;

const LAST_NAMES = [
  'Ferreira', 'Costa', 'Silva', 'Moreira', 'Almeida', 'Kovac', 'Novak', 'Horvat', 'Weber', 'Fischer',
  'Wagner', 'Kaya', 'Yilmaz', 'Demir', 'Haddad', 'Aziz', 'Rahman', 'Hossain', 'Islam', 'Chowdhury',
  'Tanaka', 'Sato', 'Suzuki', 'Kim', 'Park', 'Chen', 'Garcia', 'Lopez', 'Torres', 'Vargas',
  'Rossi', 'Russo', 'Greco', 'Moretti', 'Conti', 'Dubois', 'Moreau', 'Laurent', 'Bernard', 'Petit',
  'Walker', 'Wright', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris',
  'Diallo', 'Traore', 'Keita', 'Sow', 'Ndiaye', 'Mensah', 'Boateng', 'Okafor', 'Eze', 'Adeyemi',
  'Santos', 'Oliveira', 'Pereira', 'Lima', 'Rocha', 'Berg', 'Larsen', 'Haugen', 'Bakker', 'Visser',
] as const;

const NATIONALITY_BY_CLUB: Record<string, string[]> = {
  mad_royals: ['ES', 'FR', 'BR', 'GB', 'PT'],
  man_sky: ['GB', 'NO', 'ES', 'BE', 'PT'],
  cat_blau: ['ES', 'FR', 'BR', 'NL', 'AR'],
  paris_etoile: ['FR', 'MA', 'PT', 'BR', 'SN'],
  munich_stern: ['DE', 'AT', 'HR', 'TR', 'PL'],
  london_cannons: ['GB', 'FR', 'NG', 'ES', 'IT'],
  milan_nero: ['IT', 'FR', 'HR', 'RS', 'PT'],
  mersey_reds: ['GB', 'EG', 'NL', 'BR', 'PT'],
  rio_flamengo: ['BR', 'AR', 'UY', 'CO', 'PT'],
  buenos_plata: ['AR', 'UY', 'PY', 'CL', 'CO'],
  dhaka_tigers: ['BD', 'BD', 'BD', 'NP', 'IN'],
  tokyo_blazers: ['JP', 'JP', 'KR', 'JP', 'AU'],
  // Club expansion (2026-11-22): top-up squads for the 16 real clubs and the
  // new original clubs draw from each club's home football culture.
  real_madrid: ['ES', 'FR', 'BR', 'GB', 'PT'],
  fc_barcelona: ['ES', 'FR', 'BR', 'NL', 'AR'],
  man_city: ['GB', 'NO', 'ES', 'BE', 'PT'],
  liverpool: ['GB', 'EG', 'NL', 'BR', 'PT'],
  bayern_munich: ['DE', 'AT', 'HR', 'TR', 'PL'],
  psg: ['FR', 'MA', 'PT', 'BR', 'SN'],
  arsenal: ['GB', 'FR', 'NG', 'ES', 'IT'],
  chelsea: ['GB', 'FR', 'AR', 'ES', 'PT'],
  man_utd: ['GB', 'PT', 'FR', 'DK', 'NL'],
  inter_milan: ['IT', 'FR', 'HR', 'AR', 'NL'],
  ac_milan: ['IT', 'FR', 'PT', 'US', 'HR'],
  juventus: ['IT', 'US', 'FR', 'TR', 'SR'],
  dortmund: ['DE', 'AT', 'TR', 'NO', 'GB'],
  atletico_madrid: ['ES', 'AR', 'FR', 'UY', 'NO'],
  al_nassr: ['SA', 'PT', 'SN', 'BR', 'ES'],
  inter_miami: ['US', 'AR', 'ES', 'MX', 'UY'],
  chittagong_thunder: ['BD', 'BD', 'BD', 'NP', 'IN'],
  sylhet_stars: ['BD', 'BD', 'BD', 'IN', 'NP'],
  khulna_kings: ['BD', 'BD', 'IN', 'BD', 'NP'],
  rajshahi_royals: ['BD', 'BD', 'BD', 'IN', 'PK'],
  barisal_blaze: ['BD', 'BD', 'NP', 'BD', 'IN'],
  coxs_waves: ['BD', 'BD', 'BD', 'MM', 'IN'],
  tokyo_samurai: ['JP', 'JP', 'JP', 'KR', 'BR'],
  seoul_dragons: ['KR', 'KR', 'KR', 'JP', 'UZ'],
  mumbai_warriors: ['IN', 'IN', 'IN', 'BD', 'NP'],
  cairo_pharaohs: ['EG', 'EG', 'EG', 'MA', 'DZ'],
  lagos_eagles: ['NG', 'NG', 'NG', 'CM', 'GH'],
  rio_samba: ['BR', 'BR', 'BR', 'AR', 'PT'],
  napoli_azzurri: ['IT', 'IT', 'IT', 'AR', 'FR'],
};

const SKIN_TONES = ['#f1c27d', '#e5b887', '#e0ac69', '#d8a47f', '#c68642', '#a67346', '#8d5524', '#6b3e26', '#5c3317', '#ffdbac'] as const;
const HAIR_STYLES: FaceAppearance['hairStyle'][] = ['SHORT', 'FADE', 'CURLY', 'AFRO', 'LONG', 'MOHAWK', 'BALD'];
const HAIR_COLORS = ['#111111', '#1c1917', '#292524', '#3b2f2f', '#57412a', '#8a5a2b', '#fbbf24', '#d6d3d1'] as const;
const BOOT_COLORS = ['#facc15', '#38bdf8', '#ef4444', '#10b981', '#f43f5e', '#a855f7', '#ffffff', '#111827', '#f97316', '#22d3ee'] as const;
const BUILDS: FaceAppearance['build'][] = ['LEAN', 'ATHLETIC', 'STOCKY'];

const ALT_POSITIONS: Partial<Record<Position, Position[]>> = {
  GK: [],
  CB: ['RB', 'LB'],
  LB: ['LWB', 'CB'],
  RB: ['RWB', 'CB'],
  CDM: ['CM', 'CB'],
  CM: ['CDM', 'CAM'],
  CAM: ['CM', 'CF'],
  LM: ['LW', 'CM'],
  RM: ['RW', 'CM'],
  LW: ['LM', 'ST'],
  RW: ['RM', 'ST'],
  ST: ['CF', 'LW'],
};

const PLAYSTYLE_BY_GROUP: Record<string, PlayStyleId[]> = {
  GK: ['BRICK_WALL_GK'],
  DEF: ['INTERCEPT_PLUS', 'RAPID_PLUS'],
  MID: ['INCISIVE_PASS_PLUS', 'TECHNICAL_DRIBBLER', 'DEAD_BALL_SPECIALIST', 'INTERCEPT_PLUS'],
  ATT: ['FINESSE_SHOT_PLUS', 'POWER_SHOT_PLUS', 'RAPID_PLUS', 'TECHNICAL_DRIBBLER'],
};

function statAround(rng: () => number, base: number, spread: number): number {
  return Math.round(clamp(base + (rng() * 2 - 1) * spread, 25, 99));
}

/**
 * Derive coherent SubStats from CoreStats for a position. Used for marquee players
 * (seed ships CoreStats only) and as the coherence anchor for generated players.
 * `variance` 0 = perfectly deterministic from stats alone; >0 adds seeded variety.
 */
export function deriveSubStats(
  position: Position,
  core: CoreStats,
  rng: () => number,
  variance = 4,
): SubStats {
  const v = (base: number) => statAround(rng, base, variance);
  const group = positionGroup(position);
  if (position === 'GK') {
    // For GK templates the seed maps: pac→diving, sho→reflexes, pas→kicking, dri→handling, phy→positioning base.
    const diving = core.pac;
    const reflexes = core.sho;
    const handling = core.dri;
    const kicking = core.pas;
    const gkPos = Math.round((core.pac + core.phy) / 2);
    return {
      acceleration: v(45), sprintSpeed: v(48),
      positioning: v(40), finishing: v(22), shotPower: v(38), longShots: v(25), curve: v(30),
      vision: v(core.pas - 12), crossing: v(30), shortPassing: v(core.pas - 6), longPassing: v(kicking),
      agility: v(reflexes - 8), balance: v(core.phy - 10), ballControl: v(handling - 18), dribbling: v(28),
      interceptions: v(30), headingAccuracy: v(42), standingTackle: v(25), slidingTackle: v(22),
      jumping: v(diving - 4), stamina: v(58), strength: v(core.phy - 6),
      gkDiving: v(diving), gkHandling: v(handling), gkKicking: v(kicking), gkReflexes: v(reflexes), gkPositioning: v(gkPos),
    };
  }
  const isDef = group === 'DEF';
  const isAtt = group === 'ATT';
  return {
    acceleration: v(core.pac + 1),
    sprintSpeed: v(core.pac - 1),
    positioning: v(isAtt ? core.sho : core.sho - 14),
    finishing: v(isAtt ? core.sho + 1 : core.sho - 8),
    shotPower: v(core.sho - 2),
    longShots: v(core.sho - 10),
    curve: v(Math.round((core.sho + core.dri) / 2) - 6),
    vision: v(core.pas + (position === 'CAM' ? 3 : 0)),
    crossing: v(core.pas - (position === 'LW' || position === 'RW' || position === 'LM' || position === 'RM' || position === 'LB' || position === 'RB' ? 2 : 12)),
    shortPassing: v(core.pas + 1),
    longPassing: v(core.pas - 3),
    agility: v(core.dri - 2),
    balance: v(core.dri - 6),
    ballControl: v(core.dri + 1),
    dribbling: v(core.dri),
    interceptions: v(isDef || position === 'CDM' ? core.def + 1 : core.def - 10),
    headingAccuracy: v(isDef || position === 'ST' ? Math.round((core.def + core.phy) / 2) : core.phy - 18),
    standingTackle: v(isDef || group === 'MID' ? core.def : core.def - 12),
    slidingTackle: v(isDef ? core.def - 3 : core.def - 16),
    jumping: v(core.phy - 4),
    stamina: v(core.phy - 2),
    strength: v(core.phy),
    gkDiving: v(18), gkHandling: v(16), gkKicking: v(30), gkReflexes: v(20), gkPositioning: v(18),
  };
}

function coreStatsFor(rng: () => number, position: Position, ovr: number): CoreStats {
  const s = (weight: number, floor: number) => Math.round(clamp(ovr * weight + (rng() * 2 - 1) * 5, floor, 99));
  switch (positionGroup(position)) {
    case 'GK':
      // GK core mapping mirrors the marquee seed convention (pac=diving, sho=reflexes, dri=handling).
      return { pac: s(1.0, 55), sho: s(0.98, 55), pas: s(0.82, 40), dri: s(0.99, 55), def: s(0.55, 25), phy: s(0.97, 55) };
    case 'DEF':
      return { pac: s(0.9, 45), sho: s(0.55, 25), pas: s(0.82, 40), dri: s(0.8, 40), def: s(1.02, 55), phy: s(0.95, 50) };
    case 'MID':
      return position === 'CDM'
        ? { pac: s(0.85, 40), sho: s(0.78, 35), pas: s(0.98, 50), dri: s(0.9, 45), def: s(0.97, 50), phy: s(0.92, 45) }
        : { pac: s(0.92, 45), sho: s(0.85, 40), pas: s(1.0, 50), dri: s(0.98, 50), def: s(0.68, 30), phy: s(0.8, 38) };
    default:
      return { pac: s(1.0, 55), sho: s(0.99, 50), pas: s(0.85, 40), dri: s(0.99, 50), def: s(0.45, 20), phy: s(0.85, 40) };
  }
}

const FACE_SHAPES = ['OVAL', 'ROUND', 'SQUARE', 'LONG'] as const;
const NOSE_SHAPES = ['STRAIGHT', 'HOOKED', 'BROAD', 'BUTTON'] as const;
const EYE_COLORS = ['#3b2f2f', '#4a3520', '#6b4423', '#4a6fa5', '#5a7d4a'] as const;

function appearanceFor(rng: () => number, position: Position): FaceAppearance {
  const heightCm = position === 'GK'
    ? randInt(rng, 186, 202)
    : position === 'CB' || position === 'ST'
      ? randInt(rng, 178, 198)
      : randInt(rng, 165, 192);
  const base: FaceAppearance = {
    skinTone: pick(rng, SKIN_TONES),
    hairStyle: pick(rng, HAIR_STYLES),
    hairColor: pick(rng, HAIR_COLORS),
    heightCm,
    build: pick(rng, BUILDS),
    bootColor: pick(rng, BOOT_COLORS),
  };
  // Realistic-models pass (spec §1.4): the new face fields are derived from
  // a SIDE stream seeded by the values already drawn — never from the
  // shared rng — so every pre-existing generated player's skinTone,
  // hairStyle, heightCm, name and stats stay byte-identical.
  let h = heightCm * 131 + base.skinTone.length * 17;
  for (let i = 0; i < base.skinTone.length; i += 1) h = (h * 31 + base.skinTone.charCodeAt(i)) >>> 0;
  for (let i = 0; i < base.hairColor.length; i += 1) h = (h * 31 + base.hairColor.charCodeAt(i)) >>> 0;
  const faceRng = mulberry32(h ^ 0xface);
  return {
    ...base,
    faceShape: pick(faceRng, FACE_SHAPES),
    noseShape: pick(faceRng, NOSE_SHAPES),
    eyeColor: pick(faceRng, EYE_COLORS),
    hairTexture: base.hairStyle === 'CURLY' || base.hairStyle === 'CURLY_TOP' || base.hairStyle === 'AFRO'
      ? 'CURLY'
      : base.hairStyle === 'DREADLOCKS' || base.hairStyle === 'BRAIDS' ? 'COILY' : 'STRAIGHT',
  };
}

function marqueeToTemplate(seed: MarqueeSeed): PlayerTemplate {
  const rng = mulberry32(DB_SEED ^ seed.baseOvr * 131 + seed.id.length * 17);
  return {
    id: seed.id,
    name: seed.name,
    shortName: seed.shortName,
    nationality: seed.nationality,
    clubId: seed.clubId,
    position: seed.position,
    altPositions: [...seed.altPositions],
    baseOvr: seed.baseOvr,
    rarity: seed.rarity,
    preferredFoot: seed.preferredFoot,
    weakFoot: seed.weakFoot,
    skillMoves: seed.skillMoves,
    workRateAttack: seed.workRateAttack,
    workRateDefense: seed.workRateDefense,
    playStyles: [...seed.playStyles],
    stats: { ...seed.stats },
    subStats: deriveSubStats(seed.position, seed.stats, rng, 3),
    appearance: { ...seed.appearance },
    baseMarketPrice: seed.baseMarketPrice,
  };
}

/** Real-world stars (owner-requested, personal use): same template shape as
 *  marquee players, plus the realWorld gate flag and national shirt number. */
function realToTemplate(seed: RealPlayerSeed): PlayerTemplate {
  const base = marqueeToTemplate(seed);
  const celebration = STAR_CELEBRATIONS[seed.id];
  return { ...base, realWorld: true, shirtNumber: seed.shirtNumber, ...(celebration ? { celebration } : {}) };
}

// ---------------------------------------------------------------------------
// Club expansion top-ups (2026-11-22): the 16 real clubs arrive with their
// real stars already assigned (RealPlayers.ts), the new original clubs
// arrive empty, and a few seed clubs lose real players to their real clubs.
// Every club in the game is therefore topped up to a full squad: generated
// players fill the uncovered slots of an 18-man squad shape (2 GK + a 4-3-3
// spine + bench depth). The plan is a pure function of the seed data, so
// the QA count below is exact, and the generated templates flow through
// packs / market / squad builder with the correct club tag like every
// other player.
// ---------------------------------------------------------------------------

const TOPUP_CLUBS = [...SEED_CLUBS, ...REAL_CLUBS, ...NEW_ORIGINAL_CLUBS];
const TOPUP_SHAPE: Position[] = [
  'GK', 'GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'CM',
  'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST',
];

interface TopUpSlot { clubId: string; position: Position; rarity: Rarity; ovr: number }

function topUpBand(real: boolean, clubIdx: number, s: number): { rarity: Rarity; ovr: number } {
  if (real) {
    // Real-club depth is strong: rotation players at big European clubs.
    const key = (clubIdx + s) % 6;
    if (key === 0) return { rarity: 'ELITE', ovr: 84 + ((clubIdx + s) % 3) }; // 84–86
    if (key <= 3) return { rarity: 'GOLD', ovr: 77 + ((clubIdx * 2 + s) % 6) }; // 77–82
    return { rarity: 'SILVER', ovr: 71 + ((clubIdx + s * 2) % 6) }; // 71–76
  }
  const key = (clubIdx * 7 + s) % 9;
  if (key === 0) return { rarity: 'ELITE', ovr: 84 + ((clubIdx + s) % 4) }; // 84–87
  if (key <= 3) return { rarity: 'GOLD', ovr: 76 + ((clubIdx * 3 + s) % 7) }; // 76–82
  if (key <= 6) return { rarity: 'SILVER', ovr: 68 + ((clubIdx + s * 2) % 7) }; // 68–74
  return { rarity: 'BRONZE', ovr: 61 + ((clubIdx * 5 + s) % 7) }; // 61–67
}

/** Which squad-shape slots each top-up club still needs, given who is
 *  already there. Coverage counts exact positions only, so every club ends
 *  up able to field a true 4-3-3 XI (GK included) plus a bench. */
function planTopUpSlots(existing: { clubId: string; position: Position }[]): TopUpSlot[] {
  const plan: TopUpSlot[] = [];
  TOPUP_CLUBS.forEach((club, clubIdx) => {
    const real = REAL_CLUBS.some((c) => c.id === club.id);
    const covered: Position[] = existing.filter((p) => p.clubId === club.id).map((p) => p.position);
    TOPUP_SHAPE.forEach((position, s) => {
      const at = covered.indexOf(position);
      if (at >= 0) { covered.splice(at, 1); return; }
      const band = topUpBand(real, clubIdx, s);
      plan.push({ clubId: club.id, position, rarity: band.rarity, ovr: band.ovr });
    });
  });
  return plan;
}

/** Exact top-up count from seed-level data: marquee + real seeds + the
 *  160-man generation plan (whose club assignment is the same i % 12 rule
 *  generatePlayers uses), so the count matches the generated reality. */
export const CLUB_TOPUP_COUNT = planTopUpSlots([
  ...SEED_MARQUEE_PLAYERS.map((s) => ({ clubId: s.clubId, position: s.position })),
  ...REAL_PLAYER_SEEDS.map((s) => ({ clubId: s.clubId, position: s.position })),
  ...buildGenerationPlan().map((slot, i) => ({
    clubId: SEED_CLUBS[i % SEED_CLUBS.length]!.id, position: slot.position,
  })),
]).length;

/** Total database size the QA lab asserts against (180 original + real roster + club top-ups). */
export const EXPECTED_PLAYER_COUNT = 180 + REAL_PLAYER_SEEDS.length + CLUB_TOPUP_COUNT;

interface GenSlot {
  position: Position;
  rarity: Rarity;
  ovr: number;
}

function buildGenerationPlan(): GenSlot[] {
  const plan: GenSlot[] = [];
  // Per-club squad coverage: 12 clubs × 13 generated players = 156, + 4 extra = 160.
  const squadShape: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
  const bandFor = (clubIdx: number, slotIdx: number): { rarity: Rarity; ovr: number } => {
    // Deterministic band pattern: each club gets a spread of Elite/Gold/Silver/Bronze.
    const key = (clubIdx * 13 + slotIdx) % 13;
    if (key === 0 || key === 5) return { rarity: 'ELITE', ovr: 84 + ((clubIdx + slotIdx) % 4) }; // 84–87
    if (key <= 4) return { rarity: 'GOLD', ovr: 76 + ((clubIdx * 3 + slotIdx) % 7) }; // 76–82
    if (key <= 8) return { rarity: 'SILVER', ovr: 68 + ((clubIdx + slotIdx * 2) % 7) }; // 68–74
    return { rarity: 'BRONZE', ovr: 60 + ((clubIdx * 5 + slotIdx) % 8) }; // 60–67
  };
  for (let c = 0; c < 12; c += 1) {
    squadShape.forEach((position, s) => {
      const band = bandFor(c, s);
      plan.push({ position, rarity: band.rarity, ovr: band.ovr });
    });
  }
  // Four extra free-agent style additions to reach exactly 160 generated.
  plan.push({ position: 'GK', rarity: 'GOLD', ovr: 79 });
  plan.push({ position: 'ST', rarity: 'ELITE', ovr: 85 });
  plan.push({ position: 'CM', rarity: 'SILVER', ovr: 71 });
  plan.push({ position: 'CB', rarity: 'BRONZE', ovr: 64 });
  return plan;
}

function generatePlayers(): PlayerTemplate[] {
  const rng = mulberry32(DB_SEED);
  const plan = buildGenerationPlan();
  const usedNames = new Set<string>(SEED_MARQUEE_PLAYERS.map((p) => p.name));
  const players: PlayerTemplate[] = [];

  plan.forEach((slot, i) => {
    const club = SEED_CLUBS[i % SEED_CLUBS.length];
    if (!club) return;
    let name = '';
    let guard = 0;
    do {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      guard += 1;
    } while (usedNames.has(name) && guard < 40);
    if (usedNames.has(name)) name = `${name} ${String.fromCharCode(65 + (i % 26))}.`;
    usedNames.add(name);

    const lastName = name.split(' ').slice(1).join(' ') || name;
    const stats = coreStatsFor(rng, slot.position, slot.ovr);
    const group = positionGroup(slot.position);
    const playStyles: PlayStyleId[] = slot.rarity === 'ELITE' || slot.rarity === 'GOLD'
      ? [pick(rng, PLAYSTYLE_BY_GROUP[group] ?? [])]
      : [];
    const nationalities = NATIONALITY_BY_CLUB[club.id] ?? ['GB'];

    players.push({
      id: `gen_${String(i + 1).padStart(3, '0')}`,
      name,
      shortName: lastName,
      nationality: pick(rng, nationalities),
      clubId: club.id,
      position: slot.position,
      altPositions: [...(ALT_POSITIONS[slot.position] ?? [])],
      baseOvr: slot.ovr,
      rarity: slot.rarity,
      preferredFoot: rng() < 0.72 ? 'RIGHT' : 'LEFT',
      weakFoot: (slot.rarity === 'ELITE' ? randInt(rng, 3, 5) : randInt(rng, 2, 4)) as 1 | 2 | 3 | 4 | 5,
      skillMoves: (group === 'ATT' || group === 'MID' ? randInt(rng, 2, 5) : randInt(rng, 1, 3)) as 1 | 2 | 3 | 4 | 5,
      workRateAttack: group === 'ATT' ? 'HIGH' : group === 'DEF' ? 'LOW' : 'MED',
      workRateDefense: group === 'DEF' || slot.position === 'CDM' ? 'HIGH' : 'MED',
      playStyles,
      stats,
      subStats: deriveSubStats(slot.position, stats, rng, 5),
      appearance: appearanceFor(rng, slot.position),
      baseMarketPrice: Math.round(Math.pow(Math.max(1, slot.ovr - 52), 2.6) * 22),
    });
  });

  return players;
}

/** Materialize the club top-up plan against the assembled base database:
 *  one generated player per uncovered squad-shape slot, IDs continuing the
 *  gen_NNN sequence so no existing template id ever changes. */
function generateClubTopUps(base: PlayerTemplate[]): PlayerTemplate[] {
  const rng = mulberry32(DB_SEED ^ 0xc10b5);
  const plan = planTopUpSlots(base.map((p) => ({ clubId: p.clubId, position: p.position })));
  const usedNames = new Set<string>(base.map((p) => p.name));
  const players: PlayerTemplate[] = [];

  plan.forEach((slot, i) => {
    let name = '';
    let guard = 0;
    do {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      guard += 1;
    } while (usedNames.has(name) && guard < 40);
    if (usedNames.has(name)) name = `${name} ${String.fromCharCode(65 + (i % 26))}.`;
    usedNames.add(name);

    const lastName = name.split(' ').slice(1).join(' ') || name;
    const stats = coreStatsFor(rng, slot.position, slot.ovr);
    const group = positionGroup(slot.position);
    const playStyles: PlayStyleId[] = slot.rarity === 'ELITE' || slot.rarity === 'GOLD'
      ? [pick(rng, PLAYSTYLE_BY_GROUP[group] ?? [])]
      : [];
    const nationalities = NATIONALITY_BY_CLUB[slot.clubId] ?? ['GB'];

    players.push({
      id: `gen_${String(161 + i).padStart(3, '0')}`,
      name,
      shortName: lastName,
      nationality: pick(rng, nationalities),
      clubId: slot.clubId,
      position: slot.position,
      altPositions: [...(ALT_POSITIONS[slot.position] ?? [])],
      baseOvr: slot.ovr,
      rarity: slot.rarity,
      preferredFoot: rng() < 0.72 ? 'RIGHT' : 'LEFT',
      weakFoot: (slot.rarity === 'ELITE' ? randInt(rng, 3, 5) : randInt(rng, 2, 4)) as 1 | 2 | 3 | 4 | 5,
      skillMoves: (group === 'ATT' || group === 'MID' ? randInt(rng, 2, 5) : randInt(rng, 1, 3)) as 1 | 2 | 3 | 4 | 5,
      workRateAttack: group === 'ATT' ? 'HIGH' : group === 'DEF' ? 'LOW' : 'MED',
      workRateDefense: group === 'DEF' || slot.position === 'CDM' ? 'HIGH' : 'MED',
      playStyles,
      stats,
      subStats: deriveSubStats(slot.position, stats, rng, 5),
      appearance: appearanceFor(rng, slot.position),
      baseMarketPrice: Math.round(Math.pow(Math.max(1, slot.ovr - 52), 2.6) * 22),
    });
  });

  return players;
}

let cache: PlayerTemplate[] | null = null;
let byId: Map<string, PlayerTemplate> | null = null;

export function getAllPlayers(): PlayerTemplate[] {
  if (!cache) {
    const base = [
      ...SEED_MARQUEE_PLAYERS.map(marqueeToTemplate),
      ...REAL_PLAYER_SEEDS.map(realToTemplate),
      ...generatePlayers(),
    ];
    cache = [...base, ...generateClubTopUps(base)];
    byId = new Map(cache.map((p) => [p.id, p]));
  }
  return cache;
}

export function getPlayerById(id: string): PlayerTemplate | undefined {
  getAllPlayers();
  return byId?.get(id);
}

export function getPlayersByClub(clubId: string): PlayerTemplate[] {
  return getAllPlayers().filter((p) => p.clubId === clubId);
}

export function getPlayersByPosition(position: Position): PlayerTemplate[] {
  return getAllPlayers().filter((p) => p.position === position);
}

export function getPlayersByRarity(rarity: Rarity): PlayerTemplate[] {
  return getAllPlayers().filter((p) => p.rarity === rarity);
}
