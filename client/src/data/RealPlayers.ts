// Striker FC — data/RealPlayers.ts
// Real-world star roster, added at the owner's explicit request (2026-11-22)
// for personal play only — the game is not published or sold. Every entry is
// factual public data (name, country, position, shirt number, height) plus a
// game rating; faces are the game's own generic 3D appearance parameters
// (skin tone, hair style/colour, build) approximating each player's look —
// the same smooth rig renders them, no cartoon/blocky models.
// Messi / Ronaldo / Mbappé are LEGEND rarity and are gated in PackService:
// real-world LEGENDs can only be pulled from the Legend Icon Pack (and the
// Tier-20 Star Pass grant of that pack), never from regular packs or the
// market. Everyone else flows through the normal pack / training systems.

import type { CelebrationState, CoreStats, FaceAppearance, PlayStyleId, Position, Rarity } from '../core/types';
import { positionGroup } from '../core/types';
import type { MarqueeSeed } from './seedDatabase';

export interface RealPlayerSeed extends MarqueeSeed {
  shirtNumber: number;
}

export interface NationDef {
  code: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  players: RealTuple[];
}

/** [id, name, shortName, pos, ovr, foot, skillMoves, playStyle, skinTone,
 *  hairStyle, hairColor, heightCm, build, shirt, clubId, coreStatTweaks?] */
type RealTuple = readonly [
  string, string, string, Position, number,
  'R' | 'L', number, PlayStyleId | null,
  string, FaceAppearance['hairStyle'], string,
  number, FaceAppearance['build'], number, string,
  (Partial<CoreStats>)?,
];

const BOOT_COLORS = ['#facc15', '#38bdf8', '#ef4444', '#10b981', '#f43f5e', '#ffffff', '#f97316', '#22d3ee'] as const;

const ALT_POSITIONS: Partial<Record<Position, Position[]>> = {
  GK: [], CB: ['RB', 'LB'], LB: ['LWB', 'CB'], RB: ['RWB', 'CB'],
  CDM: ['CM', 'CB'], CM: ['CDM', 'CAM'], CAM: ['CM', 'CF'],
  LM: ['LW', 'CM'], RM: ['RW', 'CM'], LW: ['LM', 'ST'], RW: ['RM', 'ST'], ST: ['CF', 'LW'],
};

export function rarityForOvr(ovr: number): Rarity {
  if (ovr >= 95) return 'LEGEND';
  if (ovr >= 90) return 'MASTER';
  if (ovr >= 85) return 'ELITE';
  if (ovr >= 80) return 'GOLD';
  if (ovr >= 75) return 'SILVER';
  return 'BRONZE';
}

/** Deterministic core stats from position + OVR (signature tweaks applied after). */
function coreFor(pos: Position, ovr: number): CoreStats {
  const c = (v: number) => Math.round(Math.max(20, Math.min(99, v)));
  const group = positionGroup(pos);
  if (pos === 'GK') return { pac: c(ovr), sho: c(ovr - 2), pas: c(ovr - 16), dri: c(ovr - 1), def: c(ovr - 48), phy: c(ovr - 3) };
  if (group === 'DEF') return { pac: c(ovr - 7), sho: c(ovr - 32), pas: c(ovr - 11), dri: c(ovr - 13), def: c(ovr + 1), phy: c(ovr - 4) };
  if (pos === 'CDM') return { pac: c(ovr - 11), sho: c(ovr - 17), pas: c(ovr - 1), dri: c(ovr - 7), def: c(ovr - 1), phy: c(ovr - 5) };
  if (group === 'MID') return { pac: c(ovr - 5), sho: c(ovr - 11), pas: c(ovr + 1), dri: c(ovr - 1), def: c(ovr - 27), phy: c(ovr - 15) };
  return { pac: c(ovr), sho: c(ovr), pas: c(ovr - 11), dri: c(ovr), def: c(ovr - 52), phy: c(ovr - 11) };
}

/**
 * Each real star's actual club, where that club exists in the game (the 16
 * real clubs in Clubs.ts). Players whose real club is not in the game keep
 * the analog clubId from their tuple. Assignments reflect the 2025-26
 * season: Mbappé / Bellingham / Vinícius at Real Madrid, Haaland at Man
 * City, Salah at Liverpool, Kane at Bayern, Messi at Inter Miami, Ronaldo
 * at Al Nassr, Wirtz at Liverpool, Donnarumma at Man City, Modrić at AC
 * Milan, De Paul at Inter Miami, and so on.
 */
export const REAL_CLUB_BY_PLAYER: Record<string, string> = {
  // Real Madrid
  rw_tchouameni: 'real_madrid', rw_camavinga: 'real_madrid', rw_mbappe: 'real_madrid',
  rw_vinicius: 'real_madrid', rw_rodrygo: 'real_madrid', rw_militao: 'real_madrid',
  rw_endrick: 'real_madrid', rw_taa: 'real_madrid', rw_bellingham: 'real_madrid',
  rw_carvajal: 'real_madrid', rw_rudiger: 'real_madrid', rw_courtois: 'real_madrid',
  rw_bdiaz: 'real_madrid',
  // FC Barcelona
  rw_kounde: 'fc_barcelona', rw_raphinha: 'fc_barcelona', rw_cubarsi: 'fc_barcelona',
  rw_pedri: 'fc_barcelona', rw_yamal: 'fc_barcelona', rw_olmo: 'fc_barcelona',
  rw_terstegen: 'fc_barcelona', rw_fdjong: 'fc_barcelona',
  // Manchester City
  rw_rdias: 'man_city', rw_bsilva: 'man_city', rw_stones: 'man_city', rw_foden: 'man_city',
  rw_rodri: 'man_city', rw_donnarumma: 'man_city', rw_ake: 'man_city', rw_reijnders: 'man_city',
  rw_gvardiol: 'man_city', rw_kovacic: 'man_city', rw_doku: 'man_city', rw_bobb: 'man_city',
  rw_marmoush: 'man_city', rw_haaland: 'man_city',
  // Summer-2025 corrections (Epic fix round): De Bruyne left Man City for
  // Napoli (12 Jun 2025) — Napoli is not one of the 16 real clubs, so he has
  // NO real-club mapping; his tuple tag is the Napoli analog club
  // (napoli_azzurri, added in the rig-merge fix round) — never the Inter
  // analog milan_nero he briefly carried.
  // Same check applied to Theo Hernández → Al Hilal, Son → LAFC,
  // Neymar → Santos, Dybala → Roma, Cancelo → Al Hilal: none of them is
  // mapped to a real club here — all keep fictional analog tags only, so no
  // real club's XI fields a player who left it.
  // Liverpool
  rw_macallister: 'liverpool', rw_konate: 'liverpool', rw_alisson: 'liverpool',
  rw_vandijk: 'liverpool', rw_gravenberch: 'liverpool', rw_gakpo: 'liverpool',
  rw_chiesa: 'liverpool', rw_wirtz: 'liverpool', rw_salah: 'liverpool', rw_endo: 'liverpool',
  // Bayern Munich
  rw_upamecano: 'bayern_munich', rw_olise: 'bayern_munich', rw_kane: 'bayern_munich',
  rw_kimmich: 'bayern_munich', rw_tah: 'bayern_munich', rw_goretzka: 'bayern_munich',
  rw_musiala: 'bayern_munich', rw_gnabry: 'bayern_munich', rw_kimminjae: 'bayern_munich',
  rw_hirokiito: 'bayern_munich', rw_stanisic: 'bayern_munich',
  // Paris Saint-Germain
  rw_nmendes: 'psg', rw_vitinha: 'psg', rw_dembele: 'psg', rw_barcola: 'psg',
  rw_marquinhos: 'psg', rw_fabian: 'psg', rw_hakimi: 'psg', rw_leekangin: 'psg',
  // Arsenal
  rw_saliba: 'arsenal', rw_gabriel: 'arsenal', rw_rice: 'arsenal', rw_saka: 'arsenal',
  rw_merino: 'arsenal', rw_havertz: 'arsenal', rw_calafiori: 'arsenal',
  rw_odegaard: 'arsenal', rw_trossard: 'arsenal',
  // Chelsea
  rw_enzo: 'chelsea', rw_pneto: 'chelsea', rw_palmer: 'chelsea', rw_cucurella: 'chelsea',
  // Manchester United
  rw_bfernandes: 'man_utd', rw_casemiro: 'man_utd', rw_shaw: 'man_utd',
  rw_mainoo: 'man_utd', rw_mazraoui: 'man_utd', rw_ugarte: 'man_utd',
  // Inter Milan
  rw_lautaro: 'inter_milan', rw_thuram: 'inter_milan', rw_bastoni: 'inter_milan',
  rw_acerbi: 'inter_milan', rw_dimarco: 'inter_milan', rw_barella: 'inter_milan',
  rw_frattesi: 'inter_milan', rw_dumfries: 'inter_milan', rw_devrij: 'inter_milan',
  // AC Milan
  rw_leao: 'ac_milan', rw_maignan: 'ac_milan', rw_pulisic: 'ac_milan',
  rw_sgimenez: 'ac_milan', rw_modric: 'ac_milan',
  // Juventus
  rw_locatelli: 'juventus', rw_mckennie: 'juventus', rw_openda: 'juventus',
  // Borussia Dortmund
  rw_schlotterbeck: 'dortmund', rw_ryerson: 'dortmund',
  // Atletico Madrid
  rw_molina: 'atletico_madrid', rw_jalvarez: 'atletico_madrid', rw_griezmann: 'atletico_madrid',
  rw_lenormand: 'atletico_madrid', rw_sorloth: 'atletico_madrid', rw_jgimenez: 'atletico_madrid',
  // Al Nassr
  rw_ronaldo: 'al_nassr', rw_jfelix: 'al_nassr',
  // Inter Miami
  rw_messi: 'inter_miami', rw_depaul: 'inter_miami',
  // Epic P0-3: thin real clubs filled to a full real XI.
  rw_mane: 'al_nassr', rw_brozovic: 'al_nassr', rw_laporte: 'al_nassr', rw_simakan: 'al_nassr',
  rw_angelo: 'al_nassr', rw_bento: 'al_nassr', rw_coman: 'al_nassr', rw_otavio: 'al_nassr', rw_wesley: 'al_nassr',
  rw_suarez: 'inter_miami', rw_busquets: 'inter_miami', rw_alba: 'inter_miami', rw_cremaschi: 'inter_miami',
  rw_ustari: 'inter_miami', rw_aviles: 'inter_miami', rw_lujan: 'inter_miami', rw_silvetti: 'inter_miami', rw_allende: 'inter_miami',
  rw_yildiz: 'juventus', rw_kthuram: 'juventus', rw_bremer: 'juventus', rw_digregorio: 'juventus',
  rw_cambiaso: 'juventus', rw_conceicao: 'juventus', rw_gatti: 'juventus', rw_kalulu: 'juventus',
  rw_adeyemi: 'dortmund', rw_brandt: 'dortmund', rw_kobel: 'dortmund',
  rw_sule: 'dortmund', rw_anton: 'dortmund', rw_gross: 'dortmund', rw_beier: 'dortmund', rw_nmecha: 'dortmund', rw_yancouto: 'dortmund',
  rw_cruyff: 'fc_barcelona',
  // Icons — the clubs they are remembered for (Maradona & Ronaldinho at
  // Barcelona, Zidane at Real Madrid). Pelé's Santos is not one of the 16,
  // so he keeps his Rio Samba tag rather than a false one.
  rw_maradona: 'fc_barcelona', rw_ronaldinho: 'fc_barcelona', rw_zidane: 'real_madrid',
};

/** The five Icons: LEGEND-gated regardless of the OVR rarity formula
 *  (Cruyff at 94 would otherwise grade MASTER). Icons surface only in the
 *  Legend Icon Pack and the Icons showcase — never starters, never regular
 *  packs, never the market. */
export const ICON_IDS: ReadonlySet<string> = new Set([
  'rw_pele', 'rw_maradona', 'rw_zidane', 'rw_ronaldinho', 'rw_cruyff',
]);

/** Epic P0-4: mandatory per-star face overrides — the morphs that make each
 *  star identifiable by face alone on the shared rig (Messi's full beard is
 *  the #1 fix). Applied over the tuple appearance in tupleToSeed. */
export const FACE_OVERRIDES: Record<string, Partial<FaceAppearance>> = {
  rw_messi: { beardStyle: 'FULL', beardColor: '#4a2c1a', faceWidth: 1.02, jawWidth: 1.05, browStyle: 'STRAIGHT', faceShape: 'OVAL', eyeColor: '#6b4423' },
  rw_salah: { beardStyle: 'FULL', beardColor: '#111111', hairStyle: 'CURLY_TOP', faceWidth: 1.0, cheekbone: 1.08, faceShape: 'LONG', hairTexture: 'CURLY' },
  rw_ronaldo: { beardStyle: 'STUBBLE', beardColor: '#1c1917', jawWidth: 1.14, faceWidth: 1.08, jawLength: 1.06, browStyle: 'THICK', muscle: 1.1, faceShape: 'SQUARE', eyeColor: '#4a3520' },
  rw_mbappe: { faceWidth: 0.92, cheekbone: 1.12, jawLength: 1.04, hairStyle: 'SHORT', eyeSize: 1.06, faceShape: 'OVAL' },
  rw_haaland: { hairStyle: 'LONG', jawLength: 1.12, faceWidth: 0.98, muscle: 1.15, shoulderWidth: 1.12, faceShape: 'LONG', eyeColor: '#4a6fa5' },
  rw_neymar: { headband: true, sleeveTattoo: true, faceWidth: 0.94, faceShape: 'OVAL' },
  rw_vinicius: { hairStyle: 'BRAIDS', faceWidth: 0.95, cheekbone: 1.06 },
  rw_maradona: { hairStyle: 'CURLY_TOP', faceWidth: 1.06, jawWidth: 1.08, muscle: 1.08 },
  rw_pele: { faceWidth: 1.04, jawWidth: 1.06, browStyle: 'THICK' },
  rw_zidane: { hairStyle: 'BALD', jawWidth: 1.1, jawLength: 1.08, browStyle: 'THICK' },
  rw_ronaldinho: { hairStyle: 'LONG', faceWidth: 1.0, mouthStyle: 'WIDE' },
  rw_cruyff: { hairStyle: 'SIDEPART', faceWidth: 0.96, jawLength: 1.06 },
  rw_lewandowski: { beardStyle: 'STUBBLE', beardColor: '#3b2f2f', jawWidth: 1.08 },
  rw_kane: { jawWidth: 1.06, faceWidth: 1.03 },
  rw_son: { hairStyle: 'SIDEPART', faceWidth: 0.97 },
  rw_debruyne: { beardStyle: 'SHORT', beardColor: '#b45309', faceWidth: 1.02 },
  rw_bellingham: { cheekbone: 1.05, muscle: 1.05, faceShape: 'SQUARE' },
};

/** Realistic-models pass (spec §2.5): signature celebrations per star,
 *  carried on PlayerTemplate.celebration and read by the match engine's
 *  celebration picker and the showcase cycle. Mirrors the engine's
 *  SIGNATURE_CELEBRATIONS table — keep the two in step. */
export const STAR_CELEBRATIONS: Record<string, CelebrationState> = {
  rw_messi: 'CELEBRATE_POINT_SKY',
  rw_ronaldo: 'CELEBRATE_SIU',
  rw_lewandowski: 'CELEBRATE_ARMS_CROSSED',
  rw_mbappe: 'CELEBRATE_ARMS_CROSSED',
  rw_maradona: 'CELEBRATE_ARMS_OUT',
  rw_pele: 'CELEBRATE_FIST_PUMP',
  rw_neymar: 'CELEBRATE_KNEEL_POINT',
};

function tupleToSeed(nation: NationDef, t: RealTuple): RealPlayerSeed {
  const [id, name, shortName, pos, ovr, foot, skill, style, skin, hair, hairColor, heightCm, build, shirt, tupleClubId, tweaks] = t;
  const group = positionGroup(pos);
  const stats = { ...coreFor(pos, ovr), ...(tweaks ?? {}) };
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    id, name, shortName,
    nationality: nation.code,
    clubId: REAL_CLUB_BY_PLAYER[id] ?? tupleClubId,
    position: pos,
    altPositions: [...(ALT_POSITIONS[pos] ?? [])],
    baseOvr: ovr,
    rarity: ICON_IDS.has(id) ? 'LEGEND' : rarityForOvr(ovr),
    preferredFoot: foot === 'L' ? 'LEFT' : 'RIGHT',
    weakFoot: (ovr >= 90 ? 4 : ovr >= 82 ? 4 : 3) as 1 | 2 | 3 | 4 | 5,
    skillMoves: Math.max(1, Math.min(5, skill)) as 1 | 2 | 3 | 4 | 5,
    workRateAttack: group === 'ATT' ? 'HIGH' : group === 'DEF' ? 'LOW' : 'MED',
    workRateDefense: group === 'DEF' || pos === 'CDM' ? 'HIGH' : 'MED',
    playStyles: style ? [style] : [],
    stats,
    appearance: {
      skinTone: skin, hairStyle: hair, hairColor, heightCm, build,
      bootColor: BOOT_COLORS[hash % BOOT_COLORS.length]!,
      ...(FACE_OVERRIDES[id] ?? {}),
    },
    baseMarketPrice: Math.round(Math.pow(Math.max(1, ovr - 52), 2.6) * 22),
    shirtNumber: shirt,
  };
}

export const NATIONS: NationDef[] = [
  {
    code: 'AR', name: 'Argentina', abbr: 'ARG', primary: '#75aadb', secondary: '#ffffff',
    players: [
      ['rw_emartinez', 'Emiliano Martínez', 'Martínez', 'GK', 88, 'R', 2, 'BRICK_WALL_GK', '#d8a47f', 'SHORT', '#1c1917', 195, 'ATHLETIC', 23, 'london_cannons'],
      ['rw_molina', 'Nahuel Molina', 'Molina', 'RB', 82, 'R', 3, null, '#e0ac69', 'FADE', '#111111', 175, 'ATHLETIC', 26, 'mad_royals'],
      ['rw_romero', 'Cristian Romero', 'Romero', 'CB', 84, 'R', 2, 'INTERCEPT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 185, 'STOCKY', 13, 'london_cannons'],
      ['rw_otamendi', 'Nicolás Otamendi', 'Otamendi', 'CB', 83, 'R', 2, null, '#d8a47f', 'FADE', '#111111', 183, 'STOCKY', 19, 'buenos_plata'],
      ['rw_tagliafico', 'Nicolás Tagliafico', 'Tagliafico', 'LB', 81, 'L', 3, null, '#e5b887', 'SHORT', '#292524', 172, 'ATHLETIC', 3, 'paris_etoile'],
      ['rw_depaul', 'Rodrigo De Paul', 'De Paul', 'CM', 84, 'R', 3, 'INCISIVE_PASS_PLUS', '#e0ac69', 'LONG', '#292524', 180, 'ATHLETIC', 7, 'mad_royals'],
      ['rw_enzo', 'Enzo Fernández', 'Fernández', 'CM', 83, 'R', 3, null, '#e5b887', 'CURLY', '#1c1917', 178, 'ATHLETIC', 24, 'london_cannons'],
      ['rw_macallister', 'Alexis Mac Allister', 'Mac Allister', 'CM', 85, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#57412a', 176, 'ATHLETIC', 20, 'mersey_reds'],
      ['rw_messi', 'Lionel Messi', 'Messi', 'RW', 97, 'L', 5, 'TECHNICAL_DRIBBLER', '#e5b887', 'SHORT', '#3b2f2f', 170, 'LEAN', 10, 'buenos_plata', { pac: 88, sho: 95, pas: 96, dri: 99 }],
      ['rw_jalvarez', 'Julián Álvarez', 'Álvarez', 'ST', 86, 'R', 4, 'FINESSE_SHOT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 170, 'ATHLETIC', 9, 'mad_royals'],
      ['rw_lautaro', 'Lautaro Martínez', 'Lautaro', 'ST', 88, 'R', 4, 'POWER_SHOT_PLUS', '#d8a47f', 'FADE', '#111111', 174, 'STOCKY', 22, 'milan_nero'],
      ['rw_dybala', 'Paulo Dybala', 'Dybala', 'CAM', 85, 'L', 4, 'FINESSE_SHOT_PLUS', '#e5b887', 'FADE', '#1c1917', 177, 'LEAN', 21, 'milan_nero'],
      ['rw_paredes', 'Leandro Paredes', 'Paredes', 'CDM', 82, 'R', 3, null, '#d8a47f', 'SHORT', '#292524', 180, 'ATHLETIC', 5, 'milan_nero'],
      ['rw_maradona', 'Diego Maradona', 'Maradona', 'CAM', 97, 'L', 5, 'TECHNICAL_DRIBBLER', '#d8a47f', 'CURLY', '#111111', 165, 'STOCKY', 10, 'buenos_plata', { pac: 88, sho: 93, pas: 94, dri: 99 }],
    ],
  },
  {
    code: 'PT', name: 'Portugal', abbr: 'POR', primary: '#da291c', secondary: '#046a38',
    players: [
      ['rw_dcosta', 'Diogo Costa', 'Costa', 'GK', 85, 'R', 2, 'BRICK_WALL_GK', '#e5b887', 'SHORT', '#1c1917', 186, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_cancelo', 'João Cancelo', 'Cancelo', 'RB', 84, 'R', 4, null, '#d8a47f', 'CURLY', '#111111', 182, 'LEAN', 20, 'cat_blau'],
      ['rw_rdias', 'Rúben Dias', 'Dias', 'CB', 87, 'R', 2, 'INTERCEPT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 187, 'STOCKY', 3, 'man_sky'],
      ['rw_asilva', 'António Silva', 'A. Silva', 'CB', 82, 'R', 2, null, '#e5b887', 'CURLY', '#1c1917', 187, 'ATHLETIC', 4, 'paris_etoile'],
      ['rw_nmendes', 'Nuno Mendes', 'Mendes', 'LB', 85, 'L', 4, 'RAPID_PLUS', '#8d5524', 'CURLY', '#111111', 180, 'ATHLETIC', 19, 'paris_etoile'],
      ['rw_palhinha', 'João Palhinha', 'Palhinha', 'CDM', 84, 'R', 2, 'INTERCEPT_PLUS', '#e5b887', 'SHORT', '#292524', 190, 'STOCKY', 6, 'munich_stern'],
      ['rw_vitinha', 'Vitinha', 'Vitinha', 'CM', 85, 'R', 4, 'TECHNICAL_DRIBBLER', '#e0ac69', 'SHORT', '#1c1917', 172, 'LEAN', 23, 'paris_etoile'],
      ['rw_bfernandes', 'Bruno Fernandes', 'Fernandes', 'CAM', 87, 'R', 4, 'INCISIVE_PASS_PLUS', '#e5b887', 'SHORT', '#292524', 179, 'LEAN', 8, 'man_sky'],
      ['rw_bsilva', 'Bernardo Silva', 'B. Silva', 'RW', 86, 'L', 5, 'TECHNICAL_DRIBBLER', '#e5b887', 'CURLY', '#292524', 173, 'LEAN', 10, 'man_sky'],
      ['rw_ronaldo', 'Cristiano Ronaldo', 'Ronaldo', 'ST', 96, 'R', 5, 'POWER_SHOT_PLUS', '#d8a47f', 'FADE', '#111111', 187, 'ATHLETIC', 7, 'mad_royals', { pac: 89, sho: 96, dri: 90, phy: 88 }],
      ['rw_leao', 'Rafael Leão', 'Leão', 'LW', 86, 'R', 5, 'RAPID_PLUS', '#6b3e26', 'CURLY', '#111111', 188, 'ATHLETIC', 17, 'milan_nero'],
      ['rw_jfelix', 'João Félix', 'Félix', 'CAM', 82, 'R', 4, 'TECHNICAL_DRIBBLER', '#e0ac69', 'CURLY', '#1c1917', 181, 'LEAN', 11, 'cat_blau'],
      ['rw_rneves', 'Rúben Neves', 'Neves', 'CDM', 83, 'R', 3, 'DEAD_BALL_SPECIALIST', '#e5b887', 'SHORT', '#292524', 180, 'ATHLETIC', 18, 'man_sky'],
      ['rw_pneto', 'Pedro Neto', 'Neto', 'RW', 83, 'L', 4, 'RAPID_PLUS', '#d8a47f', 'CURLY', '#111111', 173, 'LEAN', 18, 'london_cannons'],
    ],
  },
  {
    code: 'FR', name: 'France', abbr: 'FRA', primary: '#0055a4', secondary: '#ffffff',
    players: [
      ['rw_maignan', 'Mike Maignan', 'Maignan', 'GK', 87, 'R', 2, 'BRICK_WALL_GK', '#5c3317', 'FADE', '#111111', 191, 'ATHLETIC', 16, 'milan_nero'],
      ['rw_kounde', 'Jules Koundé', 'Koundé', 'RB', 84, 'R', 3, null, '#6b3e26', 'CURLY', '#111111', 180, 'ATHLETIC', 5, 'cat_blau'],
      ['rw_saliba', 'William Saliba', 'Saliba', 'CB', 86, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 192, 'ATHLETIC', 17, 'london_cannons'],
      ['rw_upamecano', 'Dayot Upamecano', 'Upamecano', 'CB', 83, 'R', 2, null, '#5c3317', 'SHORT', '#111111', 186, 'STOCKY', 4, 'munich_stern'],
      ['rw_theo', 'Theo Hernández', 'Theo', 'LB', 85, 'L', 4, 'RAPID_PLUS', '#d8a47f', 'FADE', '#57412a', 184, 'ATHLETIC', 22, 'milan_nero'],
      ['rw_tchouameni', 'Aurélien Tchouaméni', 'Tchouaméni', 'CDM', 84, 'R', 3, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 187, 'ATHLETIC', 8, 'mad_royals'],
      ['rw_camavinga', 'Eduardo Camavinga', 'Camavinga', 'CM', 83, 'L', 4, 'TECHNICAL_DRIBBLER', '#5c3317', 'LONG', '#111111', 182, 'LEAN', 6, 'mad_royals'],
      ['rw_dembele', 'Ousmane Dembélé', 'Dembélé', 'RW', 88, 'L', 5, 'RAPID_PLUS', '#6b3e26', 'SHORT', '#111111', 178, 'LEAN', 11, 'paris_etoile'],
      ['rw_mbappe', 'Kylian Mbappé', 'Mbappé', 'ST', 96, 'R', 5, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 178, 'ATHLETIC', 10, 'mad_royals', { pac: 97, sho: 94, dri: 95 }],
      ['rw_barcola', 'Bradley Barcola', 'Barcola', 'LW', 83, 'R', 4, 'RAPID_PLUS', '#5c3317', 'CURLY', '#111111', 186, 'LEAN', 20, 'paris_etoile'],
      ['rw_thuram', 'Marcus Thuram', 'Thuram', 'ST', 83, 'R', 3, 'POWER_SHOT_PLUS', '#6b3e26', 'FADE', '#111111', 192, 'STOCKY', 9, 'milan_nero'],
      ['rw_olise', 'Michael Olise', 'Olise', 'RW', 84, 'L', 4, 'TECHNICAL_DRIBBLER', '#8d5524', 'CURLY', '#111111', 184, 'LEAN', 15, 'munich_stern'],
      ['rw_konate', 'Ibrahima Konaté', 'Konaté', 'CB', 84, 'R', 2, null, '#5c3317', 'SHORT', '#111111', 194, 'STOCKY', 24, 'mersey_reds'],
      ['rw_zidane', 'Zinedine Zidane', 'Zidane', 'CAM', 96, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'BALD', '#111111', 185, 'ATHLETIC', 10, 'mad_royals', { pac: 82, sho: 90, pas: 96, dri: 95 }],
    ],
  },
  {
    code: 'BR', name: 'Brazil', abbr: 'BRA', primary: '#ffdf00', secondary: '#009c3b',
    players: [
      ['rw_alisson', 'Alisson Becker', 'Alisson', 'GK', 89, 'R', 2, 'BRICK_WALL_GK', '#d8a47f', 'SHORT', '#3b2f2f', 193, 'ATHLETIC', 1, 'mersey_reds'],
      ['rw_danilo', 'Danilo', 'Danilo', 'RB', 81, 'R', 2, null, '#a67346', 'SHORT', '#111111', 184, 'ATHLETIC', 2, 'milan_nero'],
      ['rw_marquinhos', 'Marquinhos', 'Marquinhos', 'CB', 85, 'R', 3, 'INTERCEPT_PLUS', '#a67346', 'SHORT', '#111111', 183, 'ATHLETIC', 4, 'paris_etoile'],
      ['rw_gabriel', 'Gabriel Magalhães', 'Gabriel', 'CB', 85, 'L', 2, null, '#8d5524', 'FADE', '#111111', 190, 'STOCKY', 3, 'london_cannons'],
      ['rw_asandro', 'Alex Sandro', 'A. Sandro', 'LB', 80, 'L', 3, null, '#a67346', 'SHORT', '#111111', 181, 'ATHLETIC', 6, 'rio_flamengo'],
      ['rw_casemiro', 'Casemiro', 'Casemiro', 'CDM', 83, 'R', 2, 'INTERCEPT_PLUS', '#a67346', 'SHORT', '#111111', 185, 'STOCKY', 5, 'man_sky'],
      ['rw_bguimaraes', 'Bruno Guimarães', 'B. Guimarães', 'CM', 84, 'R', 3, 'INCISIVE_PASS_PLUS', '#c68642', 'SHORT', '#1c1917', 182, 'ATHLETIC', 8, 'man_sky'],
      ['rw_paqueta', 'Lucas Paquetá', 'Paquetá', 'CAM', 82, 'L', 4, 'TECHNICAL_DRIBBLER', '#c68642', 'CURLY', '#111111', 180, 'ATHLETIC', 17, 'london_cannons'],
      ['rw_vinicius', 'Vinícius Júnior', 'Vinícius', 'LW', 91, 'R', 5, 'RAPID_PLUS', '#6b3e26', 'FADE', '#111111', 176, 'LEAN', 7, 'mad_royals', { pac: 96, dri: 94, sho: 89 }],
      ['rw_rodrygo', 'Rodrygo', 'Rodrygo', 'RW', 86, 'R', 4, 'FINESSE_SHOT_PLUS', '#8d5524', 'SHORT', '#111111', 174, 'LEAN', 21, 'mad_royals'],
      ['rw_neymar', 'Neymar Jr', 'Neymar', 'LW', 90, 'R', 5, 'TECHNICAL_DRIBBLER', '#c68642', 'MOHAWK', '#111111', 175, 'LEAN', 10, 'paris_etoile', { pac: 89, sho: 88, pas: 90, dri: 96 }],
      ['rw_raphinha', 'Raphinha', 'Raphinha', 'RW', 87, 'L', 4, 'FINESSE_SHOT_PLUS', '#a67346', 'CURLY', '#111111', 176, 'LEAN', 11, 'cat_blau'],
      ['rw_militao', 'Éder Militão', 'Militão', 'CB', 84, 'R', 2, null, '#8d5524', 'SHORT', '#111111', 186, 'ATHLETIC', 14, 'mad_royals'],
      ['rw_endrick', 'Endrick', 'Endrick', 'ST', 78, 'L', 4, 'POWER_SHOT_PLUS', '#6b3e26', 'CURLY', '#111111', 173, 'STOCKY', 9, 'mad_royals'],
      ['rw_pele', 'Pelé', 'Pelé', 'ST', 98, 'R', 5, 'POWER_SHOT_PLUS', '#8d5524', 'SHORT', '#111111', 173, 'ATHLETIC', 10, 'rio_samba', { pac: 93, sho: 97, pas: 92, dri: 96, phy: 84 }],
      ['rw_ronaldinho', 'Ronaldinho', 'Ronaldinho', 'CAM', 95, 'R', 5, 'TECHNICAL_DRIBBLER', '#8d5524', 'LONG', '#111111', 182, 'ATHLETIC', 10, 'paris_etoile', { pac: 90, sho: 89, pas: 93, dri: 98 }],
    ],
  },
  {
    code: 'GB', name: 'England', abbr: 'ENG', primary: '#f8fafc', secondary: '#1e3a8a',
    players: [
      ['rw_pickford', 'Jordan Pickford', 'Pickford', 'GK', 84, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 185, 'ATHLETIC', 1, 'london_cannons'],
      ['rw_taa', 'Trent Alexander-Arnold', 'Alexander-Arnold', 'RB', 86, 'R', 3, 'INCISIVE_PASS_PLUS', '#c68642', 'CURLY', '#1c1917', 180, 'ATHLETIC', 2, 'mersey_reds'],
      ['rw_stones', 'John Stones', 'Stones', 'CB', 85, 'R', 3, null, '#f1c27d', 'SHORT', '#57412a', 188, 'ATHLETIC', 5, 'man_sky'],
      ['rw_guehi', 'Marc Guéhi', 'Guéhi', 'CB', 82, 'R', 2, null, '#5c3317', 'FADE', '#111111', 182, 'ATHLETIC', 6, 'london_cannons'],
      ['rw_shaw', 'Luke Shaw', 'Shaw', 'LB', 81, 'L', 3, null, '#f1c27d', 'SHORT', '#57412a', 178, 'STOCKY', 3, 'man_sky'],
      ['rw_rice', 'Declan Rice', 'Rice', 'CDM', 88, 'R', 3, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#3b2f2f', 188, 'ATHLETIC', 4, 'london_cannons'],
      ['rw_bellingham', 'Jude Bellingham', 'Bellingham', 'CAM', 90, 'R', 4, 'POWER_SHOT_PLUS', '#8d5524', 'FADE', '#111111', 186, 'ATHLETIC', 10, 'mad_royals', { pas: 86, dri: 88, sho: 87, phy: 85 }],
      ['rw_saka', 'Bukayo Saka', 'Saka', 'RW', 88, 'L', 4, 'FINESSE_SHOT_PLUS', '#5c3317', 'CURLY', '#111111', 178, 'LEAN', 7, 'london_cannons'],
      ['rw_kane', 'Harry Kane', 'Kane', 'ST', 91, 'R', 4, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 188, 'ATHLETIC', 9, 'munich_stern', { sho: 94, pas: 88, dri: 82 }],
      ['rw_foden', 'Phil Foden', 'Foden', 'CAM', 87, 'L', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'FADE', '#57412a', 171, 'LEAN', 11, 'man_sky'],
      ['rw_palmer', 'Cole Palmer', 'Palmer', 'CAM', 87, 'R', 4, 'FINESSE_SHOT_PLUS', '#e5b887', 'FADE', '#111111', 189, 'LEAN', 20, 'london_cannons'],
      ['rw_gordon', 'Anthony Gordon', 'Gordon', 'LW', 82, 'R', 4, 'RAPID_PLUS', '#f1c27d', 'LONG', '#8a5a2b', 183, 'LEAN', 18, 'man_sky'],
      ['rw_watkins', 'Ollie Watkins', 'Watkins', 'ST', 84, 'R', 3, null, '#e5b887', 'SHORT', '#292524', 180, 'ATHLETIC', 19, 'london_cannons'],
      ['rw_mainoo', 'Kobbie Mainoo', 'Mainoo', 'CM', 80, 'R', 3, null, '#5c3317', 'CURLY', '#111111', 175, 'ATHLETIC', 26, 'man_sky'],
    ],
  },
  {
    code: 'ES', name: 'Spain', abbr: 'ESP', primary: '#aa151b', secondary: '#f1bf00',
    players: [
      ['rw_usimon', 'Unai Simón', 'Simón', 'GK', 84, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#1c1917', 190, 'ATHLETIC', 23, 'cat_blau'],
      ['rw_carvajal', 'Dani Carvajal', 'Carvajal', 'RB', 85, 'R', 3, null, '#d8a47f', 'SHORT', '#3b2f2f', 173, 'ATHLETIC', 2, 'mad_royals'],
      ['rw_cubarsi', 'Pau Cubarsí', 'Cubarsí', 'CB', 82, 'R', 2, null, '#e5b887', 'SHORT', '#1c1917', 184, 'ATHLETIC', 5, 'cat_blau'],
      ['rw_lenormand', 'Robin Le Normand', 'Le Normand', 'CB', 82, 'R', 2, null, '#e5b887', 'SHORT', '#292524', 187, 'ATHLETIC', 3, 'mad_royals'],
      ['rw_cucurella', 'Marc Cucurella', 'Cucurella', 'LB', 82, 'L', 3, null, '#e0ac69', 'CURLY', '#57412a', 174, 'ATHLETIC', 24, 'london_cannons'],
      ['rw_rodri', 'Rodri', 'Rodri', 'CDM', 90, 'R', 3, 'INCISIVE_PASS_PLUS', '#e0ac69', 'SHORT', '#1c1917', 191, 'ATHLETIC', 16, 'man_sky', { pas: 91, def: 86, phy: 86 }],
      ['rw_pedri', 'Pedri', 'Pedri', 'CM', 86, 'L', 4, 'TECHNICAL_DRIBBLER', '#e0ac69', 'SHORT', '#1c1917', 174, 'LEAN', 20, 'cat_blau'],
      ['rw_fabian', 'Fabián Ruiz', 'Fabián', 'CM', 83, 'L', 3, null, '#d8a47f', 'SHORT', '#1c1917', 189, 'ATHLETIC', 8, 'paris_etoile'],
      ['rw_yamal', 'Lamine Yamal', 'Yamal', 'RW', 89, 'L', 5, 'TECHNICAL_DRIBBLER', '#a67346', 'CURLY', '#111111', 180, 'LEAN', 19, 'cat_blau', { pac: 91, dri: 93, sho: 86 }],
      ['rw_morata', 'Álvaro Morata', 'Morata', 'ST', 82, 'R', 3, null, '#e5b887', 'SHORT', '#3b2f2f', 189, 'ATHLETIC', 7, 'milan_nero'],
      ['rw_nwilliams', 'Nico Williams', 'N. Williams', 'LW', 85, 'R', 5, 'RAPID_PLUS', '#5c3317', 'CURLY', '#111111', 181, 'LEAN', 17, 'cat_blau'],
      ['rw_olmo', 'Dani Olmo', 'Olmo', 'CAM', 85, 'R', 4, 'FINESSE_SHOT_PLUS', '#e5b887', 'FADE', '#57412a', 179, 'LEAN', 10, 'cat_blau'],
      ['rw_merino', 'Mikel Merino', 'Merino', 'CM', 82, 'L', 3, null, '#e0ac69', 'SHORT', '#1c1917', 188, 'ATHLETIC', 6, 'london_cannons'],
      ['rw_grimaldo', 'Alejandro Grimaldo', 'Grimaldo', 'LB', 84, 'L', 3, 'DEAD_BALL_SPECIALIST', '#e0ac69', 'SHORT', '#292524', 171, 'LEAN', 12, 'munich_stern'],
    ],
  },
  {
    code: 'DE', name: 'Germany', abbr: 'GER', primary: '#f8fafc', secondary: '#111111',
    players: [
      ['rw_terstegen', 'Marc-André ter Stegen', 'Ter Stegen', 'GK', 88, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 187, 'ATHLETIC', 1, 'cat_blau'],
      ['rw_kimmich', 'Joshua Kimmich', 'Kimmich', 'RB', 86, 'R', 3, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#57412a', 177, 'ATHLETIC', 6, 'munich_stern'],
      ['rw_rudiger', 'Antonio Rüdiger', 'Rüdiger', 'CB', 85, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 190, 'STOCKY', 2, 'mad_royals'],
      ['rw_tah', 'Jonathan Tah', 'Tah', 'CB', 83, 'R', 2, null, '#6b3e26', 'SHORT', '#111111', 195, 'STOCKY', 4, 'munich_stern'],
      ['rw_raum', 'David Raum', 'Raum', 'LB', 81, 'L', 3, null, '#f1c27d', 'FADE', '#8a5a2b', 180, 'ATHLETIC', 3, 'munich_stern'],
      ['rw_andrich', 'Robert Andrich', 'Andrich', 'CDM', 81, 'R', 2, null, '#f1c27d', 'CURLY', '#8a5a2b', 185, 'ATHLETIC', 23, 'munich_stern'],
      ['rw_goretzka', 'Leon Goretzka', 'Goretzka', 'CM', 82, 'R', 3, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 189, 'ATHLETIC', 8, 'munich_stern'],
      ['rw_musiala', 'Jamal Musiala', 'Musiala', 'CAM', 89, 'R', 5, 'TECHNICAL_DRIBBLER', '#8d5524', 'CURLY', '#111111', 184, 'LEAN', 10, 'munich_stern'],
      ['rw_wirtz', 'Florian Wirtz', 'Wirtz', 'CAM', 88, 'R', 4, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 177, 'LEAN', 17, 'munich_stern'],
      ['rw_sane', 'Leroy Sané', 'Sané', 'RW', 85, 'L', 4, 'RAPID_PLUS', '#8d5524', 'CURLY', '#111111', 183, 'LEAN', 19, 'munich_stern'],
      ['rw_havertz', 'Kai Havertz', 'Havertz', 'ST', 83, 'L', 3, null, '#f1c27d', 'SHORT', '#57412a', 193, 'LEAN', 7, 'london_cannons'],
      ['rw_fullkrug', 'Niclas Füllkrug', 'Füllkrug', 'ST', 81, 'R', 2, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#3b2f2f', 188, 'STOCKY', 9, 'london_cannons'],
      ['rw_gnabry', 'Serge Gnabry', 'Gnabry', 'RW', 82, 'R', 4, null, '#6b3e26', 'FADE', '#111111', 176, 'ATHLETIC', 20, 'munich_stern'],
      ['rw_schlotterbeck', 'Nico Schlotterbeck', 'Schlotterbeck', 'CB', 83, 'L', 2, null, '#f1c27d', 'SHORT', '#8a5a2b', 191, 'ATHLETIC', 15, 'munich_stern'],
    ],
  },
  {
    code: 'IT', name: 'Italy', abbr: 'ITA', primary: '#0064aa', secondary: '#ffffff',
    players: [
      ['rw_donnarumma', 'Gianluigi Donnarumma', 'Donnarumma', 'GK', 88, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#1c1917', 196, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_dilorenzo', 'Giovanni Di Lorenzo', 'Di Lorenzo', 'RB', 83, 'R', 3, null, '#d8a47f', 'SHORT', '#1c1917', 183, 'ATHLETIC', 2, 'milan_nero'],
      ['rw_bastoni', 'Alessandro Bastoni', 'Bastoni', 'CB', 85, 'L', 2, 'INTERCEPT_PLUS', '#e5b887', 'SHORT', '#292524', 190, 'ATHLETIC', 23, 'milan_nero'],
      ['rw_acerbi', 'Francesco Acerbi', 'Acerbi', 'CB', 83, 'L', 2, null, '#e0ac69', 'SHORT', '#292524', 192, 'STOCKY', 15, 'milan_nero'],
      ['rw_dimarco', 'Federico Dimarco', 'Dimarco', 'LB', 85, 'L', 3, 'INCISIVE_PASS_PLUS', '#e0ac69', 'FADE', '#1c1917', 175, 'ATHLETIC', 3, 'milan_nero'],
      ['rw_tonali', 'Sandro Tonali', 'Tonali', 'CDM', 84, 'R', 3, null, '#e5b887', 'LONG', '#57412a', 181, 'ATHLETIC', 8, 'man_sky'],
      ['rw_barella', 'Nicolò Barella', 'Barella', 'CM', 86, 'R', 3, 'INCISIVE_PASS_PLUS', '#e0ac69', 'SHORT', '#1c1917', 172, 'ATHLETIC', 18, 'milan_nero'],
      ['rw_locatelli', 'Manuel Locatelli', 'Locatelli', 'CM', 82, 'R', 3, null, '#e5b887', 'SHORT', '#3b2f2f', 185, 'ATHLETIC', 6, 'milan_nero'],
      ['rw_chiesa', 'Federico Chiesa', 'Chiesa', 'RW', 83, 'R', 4, 'RAPID_PLUS', '#e0ac69', 'SHORT', '#292524', 175, 'ATHLETIC', 14, 'mersey_reds'],
      ['rw_retegui', 'Mateo Retegui', 'Retegui', 'ST', 82, 'R', 3, 'POWER_SHOT_PLUS', '#d8a47f', 'SHORT', '#1c1917', 186, 'ATHLETIC', 19, 'milan_nero'],
      ['rw_kean', 'Moise Kean', 'Kean', 'ST', 81, 'R', 3, null, '#6b3e26', 'FADE', '#111111', 182, 'ATHLETIC', 9, 'paris_etoile'],
      ['rw_frattesi', 'Davide Frattesi', 'Frattesi', 'CM', 82, 'R', 3, null, '#e0ac69', 'SHORT', '#1c1917', 178, 'ATHLETIC', 16, 'milan_nero'],
      ['rw_calafiori', 'Riccardo Calafiori', 'Calafiori', 'CB', 82, 'L', 2, null, '#e5b887', 'LONG', '#57412a', 188, 'ATHLETIC', 5, 'london_cannons'],
      ['rw_politano', 'Matteo Politano', 'Politano', 'RW', 81, 'R', 3, 'FINESSE_SHOT_PLUS', '#d8a47f', 'SHORT', '#1c1917', 171, 'LEAN', 20, 'milan_nero'],
    ],
  },
  {
    code: 'NL', name: 'Netherlands', abbr: 'NED', primary: '#ff6600', secondary: '#111111',
    players: [
      ['rw_verbruggen', 'Bart Verbruggen', 'Verbruggen', 'GK', 81, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#8a5a2b', 193, 'ATHLETIC', 1, 'london_cannons'],
      ['rw_dumfries', 'Denzel Dumfries', 'Dumfries', 'RB', 82, 'R', 3, null, '#5c3317', 'FADE', '#111111', 188, 'STOCKY', 22, 'milan_nero'],
      ['rw_vandijk', 'Virgil van Dijk', 'Van Dijk', 'CB', 89, 'R', 2, 'INTERCEPT_PLUS', '#8d5524', 'SHORT', '#111111', 193, 'STOCKY', 4, 'mersey_reds'],
      ['rw_ake', 'Nathan Aké', 'Aké', 'CB', 83, 'L', 2, null, '#8d5524', 'LONG', '#111111', 180, 'ATHLETIC', 5, 'man_sky'],
      ['rw_maatsen', 'Ian Maatsen', 'Maatsen', 'LB', 79, 'L', 3, 'RAPID_PLUS', '#6b3e26', 'CURLY', '#111111', 178, 'LEAN', 3, 'munich_stern'],
      ['rw_fdjong', 'Frenkie de Jong', 'De Jong', 'CM', 86, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 180, 'LEAN', 21, 'cat_blau'],
      ['rw_reijnders', 'Tijjani Reijnders', 'Reijnders', 'CM', 84, 'R', 3, null, '#e5b887', 'SHORT', '#292524', 185, 'ATHLETIC', 14, 'milan_nero'],
      ['rw_gravenberch', 'Ryan Gravenberch', 'Gravenberch', 'CDM', 83, 'R', 3, null, '#6b3e26', 'CURLY', '#111111', 190, 'ATHLETIC', 16, 'mersey_reds'],
      ['rw_simons', 'Xavi Simons', 'Simons', 'CAM', 83, 'R', 4, 'TECHNICAL_DRIBBLER', '#8d5524', 'LONG', '#111111', 179, 'LEAN', 7, 'paris_etoile'],
      ['rw_gakpo', 'Cody Gakpo', 'Gakpo', 'LW', 84, 'R', 3, 'FINESSE_SHOT_PLUS', '#6b3e26', 'FADE', '#111111', 193, 'ATHLETIC', 11, 'mersey_reds'],
      ['rw_depay', 'Memphis Depay', 'Depay', 'ST', 82, 'R', 4, 'POWER_SHOT_PLUS', '#8d5524', 'FADE', '#111111', 176, 'STOCKY', 10, 'rio_flamengo'],
      ['rw_malen', 'Donyell Malen', 'Malen', 'RW', 81, 'R', 4, 'RAPID_PLUS', '#6b3e26', 'FADE', '#111111', 176, 'ATHLETIC', 18, 'london_cannons'],
      ['rw_devrij', 'Stefan de Vrij', 'De Vrij', 'CB', 83, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 189, 'ATHLETIC', 6, 'milan_nero'],
      ['rw_cruyff', 'Johan Cruyff', 'Cruyff', 'CAM', 94, 'R', 5, 'INCISIVE_PASS_PLUS', '#f1c27d', 'LONG', '#8a5a2b', 180, 'LEAN', 14, 'cat_blau', { pas: 95, dri: 94, sho: 90 }],
    ],
  },
  {
    code: 'BE', name: 'Belgium', abbr: 'BEL', primary: '#ed2939', secondary: '#fdda24',
    players: [
      ['rw_courtois', 'Thibaut Courtois', 'Courtois', 'GK', 89, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 200, 'ATHLETIC', 1, 'mad_royals'],
      ['rw_castagne', 'Timothy Castagne', 'Castagne', 'RB', 79, 'R', 3, null, '#e5b887', 'SHORT', '#292524', 185, 'ATHLETIC', 21, 'london_cannons'],
      ['rw_faes', 'Wout Faes', 'Faes', 'CB', 79, 'R', 2, null, '#f1c27d', 'LONG', '#8a5a2b', 187, 'ATHLETIC', 4, 'london_cannons'],
      ['rw_debast', 'Zeno Debast', 'Debast', 'CB', 78, 'R', 2, null, '#e5b887', 'SHORT', '#1c1917', 189, 'ATHLETIC', 2, 'paris_etoile'],
      ['rw_theate', 'Arthur Theate', 'Theate', 'LB', 78, 'L', 2, null, '#e5b887', 'CURLY', '#57412a', 185, 'ATHLETIC', 3, 'paris_etoile'],
      ['rw_onana', 'Amadou Onana', 'Onana', 'CDM', 81, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 195, 'ATHLETIC', 24, 'london_cannons'],
      ['rw_tielemans', 'Youri Tielemans', 'Tielemans', 'CM', 83, 'R', 3, 'INCISIVE_PASS_PLUS', '#e5b887', 'SHORT', '#1c1917', 176, 'ATHLETIC', 8, 'london_cannons'],
      ['rw_debruyne', 'Kevin De Bruyne', 'De Bruyne', 'CAM', 91, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 181, 'ATHLETIC', 17, 'napoli_azzurri', { pas: 97, sho: 88, dri: 87 }],
      ['rw_doku', 'Jérémy Doku', 'Doku', 'LW', 83, 'R', 5, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 173, 'LEAN', 11, 'man_sky'],
      ['rw_lukaku', 'Romelu Lukaku', 'Lukaku', 'ST', 83, 'L', 3, 'POWER_SHOT_PLUS', '#5c3317', 'SHORT', '#111111', 191, 'STOCKY', 9, 'milan_nero'],
      ['rw_trossard', 'Leandro Trossard', 'Trossard', 'LW', 83, 'L', 3, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 172, 'LEAN', 10, 'london_cannons'],
      ['rw_openda', 'Loïs Openda', 'Openda', 'ST', 82, 'R', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 177, 'ATHLETIC', 20, 'munich_stern'],
      ['rw_deketelaere', 'Charles De Ketelaere', 'De Ketelaere', 'CAM', 80, 'L', 3, null, '#f1c27d', 'SHORT', '#8a5a2b', 192, 'LEAN', 22, 'milan_nero'],
    ],
  },
  {
    code: 'NO', name: 'Norway', abbr: 'NOR', primary: '#ba0c2f', secondary: '#00285e',
    players: [
      ['rw_nyland', 'Ørjan Nyland', 'Nyland', 'GK', 78, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 192, 'ATHLETIC', 1, 'munich_stern'],
      ['rw_ryerson', 'Julian Ryerson', 'Ryerson', 'RB', 79, 'R', 3, null, '#f1c27d', 'SHORT', '#8a5a2b', 183, 'ATHLETIC', 14, 'munich_stern'],
      ['rw_ajer', 'Kristoffer Ajer', 'Ajer', 'CB', 78, 'R', 2, null, '#f1c27d', 'SHORT', '#8a5a2b', 198, 'ATHLETIC', 3, 'london_cannons'],
      ['rw_ostigard', 'Leo Østigård', 'Østigård', 'CB', 77, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 182, 'STOCKY', 4, 'milan_nero'],
      ['rw_wolfe', 'David Møller Wolfe', 'Wolfe', 'LB', 74, 'L', 3, null, '#f1c27d', 'CURLY', '#8a5a2b', 185, 'ATHLETIC', 5, 'london_cannons'],
      ['rw_berge', 'Sander Berge', 'Berge', 'CDM', 79, 'R', 2, null, '#f1c27d', 'SHORT', '#8a5a2b', 195, 'ATHLETIC', 8, 'london_cannons'],
      ['rw_odegaard', 'Martin Ødegaard', 'Ødegaard', 'CAM', 89, 'L', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 178, 'LEAN', 10, 'london_cannons', { pas: 91, dri: 90 }],
      ['rw_nusa', 'Antonio Nusa', 'Nusa', 'LW', 78, 'L', 4, 'TECHNICAL_DRIBBLER', '#5c3317', 'CURLY', '#111111', 180, 'LEAN', 20, 'munich_stern'],
      ['rw_haaland', 'Erling Haaland', 'Haaland', 'ST', 94, 'L', 4, 'POWER_SHOT_PLUS', '#ffdbac', 'LONG', '#d6d3d1', 195, 'ATHLETIC', 9, 'man_city', { pac: 94, sho: 96, phy: 92 }],
      ['rw_sorloth', 'Alexander Sørloth', 'Sørloth', 'ST', 83, 'L', 3, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 195, 'STOCKY', 19, 'mad_royals'],
      ['rw_bobb', 'Oscar Bobb', 'Bobb', 'RW', 78, 'L', 4, 'TECHNICAL_DRIBBLER', '#e5b887', 'CURLY', '#292524', 175, 'LEAN', 22, 'man_sky'],
      ['rw_larsen', 'Jørgen Strand Larsen', 'Strand Larsen', 'ST', 80, 'R', 3, null, '#f1c27d', 'SHORT', '#57412a', 193, 'ATHLETIC', 11, 'london_cannons'],
    ],
  },
  {
    code: 'EG', name: 'Egypt', abbr: 'EGY', primary: '#ce1126', secondary: '#ffffff',
    players: [
      ['rw_elshenawy', 'Mohamed El Shenawy', 'El Shenawy', 'GK', 78, 'R', 2, 'BRICK_WALL_GK', '#d8a47f', 'SHORT', '#111111', 191, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_hany', 'Mohamed Hany', 'Hany', 'RB', 74, 'R', 2, null, '#c68642', 'SHORT', '#111111', 175, 'ATHLETIC', 3, 'milan_nero'],
      ['rw_abdelmonem', 'Mohamed Abdelmonem', 'Abdelmonem', 'CB', 76, 'R', 2, null, '#c68642', 'SHORT', '#111111', 183, 'ATHLETIC', 4, 'paris_etoile'],
      ['rw_hegazi', 'Ahmed Hegazi', 'Hegazi', 'CB', 76, 'R', 2, null, '#d8a47f', 'SHORT', '#111111', 193, 'STOCKY', 6, 'rio_flamengo'],
      ['rw_fatouh', 'Ahmed Fatouh', 'Fatouh', 'LB', 73, 'L', 3, null, '#c68642', 'FADE', '#111111', 176, 'ATHLETIC', 13, 'milan_nero'],
      ['rw_attia', 'Marwan Attia', 'Attia', 'CDM', 74, 'R', 2, null, '#c68642', 'SHORT', '#111111', 178, 'ATHLETIC', 18, 'paris_etoile'],
      ['rw_ashour', 'Emam Ashour', 'Ashour', 'CM', 76, 'R', 3, null, '#c68642', 'FADE', '#111111', 180, 'ATHLETIC', 8, 'milan_nero'],
      ['rw_zizo', 'Ahmed Sayed Zizo', 'Zizo', 'RW', 78, 'R', 4, 'FINESSE_SHOT_PLUS', '#d8a47f', 'SHORT', '#111111', 180, 'LEAN', 25, 'paris_etoile'],
      ['rw_salah', 'Mohamed Salah', 'Salah', 'RW', 91, 'L', 4, 'FINESSE_SHOT_PLUS', '#c68642', 'CURLY', '#111111', 175, 'LEAN', 11, 'mersey_reds', { pac: 92, sho: 91, dri: 92 }],
      ['rw_marmoush', 'Omar Marmoush', 'Marmoush', 'ST', 84, 'R', 4, 'RAPID_PLUS', '#c68642', 'CURLY', '#111111', 183, 'ATHLETIC', 22, 'man_sky'],
      ['rw_trezeguet', 'Trézéguet', 'Trézéguet', 'LW', 77, 'R', 3, null, '#c68642', 'SHORT', '#111111', 180, 'ATHLETIC', 17, 'rio_flamengo'],
      ['rw_mostafa', 'Mostafa Mohamed', 'M. Mohamed', 'ST', 76, 'R', 3, 'POWER_SHOT_PLUS', '#c68642', 'SHORT', '#111111', 185, 'ATHLETIC', 19, 'paris_etoile'],
    ],
  },
  {
    code: 'KR', name: 'South Korea', abbr: 'KOR', primary: '#cd2e3a', secondary: '#0047a0',
    players: [
      ['rw_johyeonwoo', 'Jo Hyeon-woo', 'Jo', 'GK', 76, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#111111', 189, 'ATHLETIC', 21, 'tokyo_blazers'],
      ['rw_seol', 'Seol Young-woo', 'Seol', 'RB', 74, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 180, 'ATHLETIC', 22, 'tokyo_blazers'],
      ['rw_kimminjae', 'Kim Min-jae', 'Kim Min-jae', 'CB', 85, 'R', 2, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#111111', 190, 'STOCKY', 4, 'munich_stern'],
      ['rw_choyumin', 'Cho Yu-min', 'Cho', 'CB', 74, 'R', 2, null, '#f1c27d', 'SHORT', '#111111', 185, 'ATHLETIC', 20, 'tokyo_blazers'],
      ['rw_leemyungjae', 'Lee Myung-jae', 'Lee M.', 'LB', 72, 'L', 3, null, '#f1c27d', 'SHORT', '#111111', 181, 'ATHLETIC', 13, 'tokyo_blazers'],
      ['rw_hwanginbeom', 'Hwang In-beom', 'Hwang I.', 'CM', 77, 'R', 3, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#111111', 177, 'ATHLETIC', 6, 'paris_etoile'],
      ['rw_parkyongwoo', 'Park Yong-woo', 'Park', 'CDM', 73, 'R', 2, null, '#f1c27d', 'SHORT', '#111111', 187, 'ATHLETIC', 5, 'tokyo_blazers'],
      ['rw_leekangin', 'Lee Kang-in', 'Lee K.', 'CAM', 81, 'L', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'CURLY', '#111111', 174, 'LEAN', 18, 'paris_etoile'],
      ['rw_son', 'Son Heung-min', 'Son', 'LW', 89, 'R', 5, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#111111', 183, 'ATHLETIC', 7, 'london_cannons', { pac: 91, sho: 90, dri: 89 }],
      ['rw_hwangheechan', 'Hwang Hee-chan', 'Hwang H.', 'ST', 78, 'R', 4, 'RAPID_PLUS', '#f1c27d', 'SHORT', '#111111', 177, 'ATHLETIC', 11, 'london_cannons'],
      ['rw_choguesung', 'Cho Gue-sung', 'Cho G.', 'ST', 75, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 188, 'ATHLETIC', 9, 'tokyo_blazers'],
      ['rw_baejunho', 'Bae Jun-ho', 'Bae', 'RW', 74, 'R', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'SHORT', '#111111', 180, 'LEAN', 17, 'london_cannons'],
    ],
  },
  {
    code: 'JP', name: 'Japan', abbr: 'JPN', primary: '#001e60', secondary: '#ffffff',
    players: [
      ['rw_zsuzuki', 'Zion Suzuki', 'Suzuki', 'GK', 78, 'R', 2, 'BRICK_WALL_GK', '#a67346', 'SHORT', '#111111', 190, 'ATHLETIC', 1, 'tokyo_blazers'],
      ['rw_sugawara', 'Yukinari Sugawara', 'Sugawara', 'RB', 76, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 179, 'ATHLETIC', 2, 'tokyo_blazers'],
      ['rw_tomiyasu', 'Takehiro Tomiyasu', 'Tomiyasu', 'CB', 81, 'R', 2, null, '#f1c27d', 'SHORT', '#111111', 188, 'ATHLETIC', 4, 'london_cannons'],
      ['rw_itakura', 'Ko Itakura', 'Itakura', 'CB', 78, 'R', 2, null, '#f1c27d', 'SHORT', '#111111', 188, 'ATHLETIC', 3, 'tokyo_blazers'],
      ['rw_hirokiito', 'Hiroki Ito', 'Ito', 'LB', 77, 'L', 2, null, '#f1c27d', 'SHORT', '#111111', 188, 'ATHLETIC', 21, 'munich_stern'],
      ['rw_endo', 'Wataru Endo', 'Endo', 'CDM', 80, 'R', 2, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#111111', 178, 'STOCKY', 6, 'mersey_reds'],
      ['rw_morita', 'Hidemasa Morita', 'Morita', 'CM', 78, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 177, 'ATHLETIC', 5, 'tokyo_blazers'],
      ['rw_kubo', 'Takefusa Kubo', 'Kubo', 'RW', 81, 'L', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'SHORT', '#111111', 173, 'LEAN', 11, 'mad_royals'],
      ['rw_mitoma', 'Kaoru Mitoma', 'Mitoma', 'LW', 83, 'R', 4, 'RAPID_PLUS', '#f1c27d', 'SHORT', '#111111', 178, 'LEAN', 7, 'london_cannons'],
      ['rw_ueda', 'Ayase Ueda', 'Ueda', 'ST', 77, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 182, 'ATHLETIC', 9, 'tokyo_blazers'],
      ['rw_kamada', 'Daichi Kamada', 'Kamada', 'CAM', 79, 'R', 3, null, '#f1c27d', 'SHORT', '#111111', 184, 'LEAN', 15, 'london_cannons'],
      ['rw_doan', 'Ritsu Doan', 'Doan', 'RW', 78, 'R', 3, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#111111', 172, 'LEAN', 10, 'munich_stern'],
    ],
  },
  {
    code: 'US', name: 'USA', abbr: 'USA', primary: '#f8fafc', secondary: '#3c3b6e',
    players: [
      ['rw_turner', 'Matt Turner', 'Turner', 'GK', 76, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 193, 'ATHLETIC', 1, 'london_cannons'],
      ['rw_dest', 'Sergiño Dest', 'Dest', 'RB', 77, 'R', 3, null, '#c68642', 'CURLY', '#111111', 175, 'LEAN', 2, 'cat_blau'],
      ['rw_richards', 'Chris Richards', 'Richards', 'CB', 76, 'R', 2, null, '#6b3e26', 'FADE', '#111111', 188, 'ATHLETIC', 3, 'london_cannons'],
      ['rw_ream', 'Tim Ream', 'Ream', 'CB', 74, 'L', 2, null, '#f1c27d', 'SHORT', '#57412a', 185, 'ATHLETIC', 13, 'london_cannons'],
      ['rw_arobinson', 'Antonee Robinson', 'Robinson', 'LB', 79, 'L', 3, 'RAPID_PLUS', '#8d5524', 'CURLY', '#111111', 183, 'ATHLETIC', 5, 'london_cannons'],
      ['rw_adams', 'Tyler Adams', 'Adams', 'CDM', 78, 'R', 2, 'INTERCEPT_PLUS', '#e5b887', 'FADE', '#111111', 175, 'STOCKY', 4, 'london_cannons'],
      ['rw_mckennie', 'Weston McKennie', 'McKennie', 'CM', 79, 'R', 3, null, '#6b3e26', 'FADE', '#111111', 185, 'ATHLETIC', 8, 'milan_nero'],
      ['rw_reyna', 'Giovanni Reyna', 'Reyna', 'CAM', 77, 'R', 4, 'TECHNICAL_DRIBBLER', '#e5b887', 'CURLY', '#292524', 185, 'LEAN', 7, 'munich_stern'],
      ['rw_pulisic', 'Christian Pulisic', 'Pulisic', 'RW', 85, 'R', 4, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 177, 'LEAN', 10, 'milan_nero'],
      ['rw_balogun', 'Folarin Balogun', 'Balogun', 'ST', 77, 'R', 3, 'RAPID_PLUS', '#6b3e26', 'FADE', '#111111', 178, 'ATHLETIC', 20, 'paris_etoile'],
      ['rw_weah', 'Timothy Weah', 'Weah', 'RW', 76, 'R', 4, 'RAPID_PLUS', '#6b3e26', 'CURLY', '#111111', 183, 'LEAN', 21, 'milan_nero'],
      ['rw_musah', 'Yunus Musah', 'Musah', 'CM', 76, 'R', 3, null, '#6b3e26', 'SHORT', '#111111', 178, 'ATHLETIC', 6, 'milan_nero'],
    ],
  },
  {
    code: 'MX', name: 'Mexico', abbr: 'MEX', primary: '#006847', secondary: '#ce1126',
    players: [
      ['rw_malagon', 'Luis Malagón', 'Malagón', 'GK', 77, 'R', 2, 'BRICK_WALL_GK', '#d8a47f', 'SHORT', '#111111', 188, 'ATHLETIC', 1, 'rio_flamengo'],
      ['rw_jsanchez', 'Jorge Sánchez', 'Sánchez', 'RB', 75, 'R', 3, null, '#c68642', 'FADE', '#111111', 175, 'ATHLETIC', 19, 'paris_etoile'],
      ['rw_montes', 'César Montes', 'Montes', 'CB', 76, 'R', 2, null, '#c68642', 'SHORT', '#111111', 195, 'ATHLETIC', 3, 'mad_royals'],
      ['rw_jvasquez', 'Johan Vásquez', 'Vásquez', 'CB', 76, 'L', 2, null, '#c68642', 'SHORT', '#111111', 185, 'ATHLETIC', 5, 'milan_nero'],
      ['rw_gallardo', 'Jesús Gallardo', 'Gallardo', 'LB', 75, 'L', 3, null, '#c68642', 'SHORT', '#111111', 176, 'ATHLETIC', 23, 'rio_flamengo'],
      ['rw_ealvarez', 'Edson Álvarez', 'Álvarez', 'CDM', 81, 'R', 2, 'INTERCEPT_PLUS', '#c68642', 'SHORT', '#111111', 187, 'ATHLETIC', 4, 'london_cannons'],
      ['rw_lchavez', 'Luis Chávez', 'Chávez', 'CM', 76, 'L', 3, 'DEAD_BALL_SPECIALIST', '#c68642', 'SHORT', '#111111', 178, 'ATHLETIC', 24, 'rio_flamengo'],
      ['rw_avega', 'Alexis Vega', 'Vega', 'CAM', 77, 'L', 4, 'TECHNICAL_DRIBBLER', '#c68642', 'FADE', '#111111', 173, 'LEAN', 10, 'rio_flamengo'],
      ['rw_lozano', 'Hirving Lozano', 'Lozano', 'RW', 79, 'R', 4, 'RAPID_PLUS', '#c68642', 'SHORT', '#111111', 175, 'LEAN', 22, 'milan_nero'],
      ['rw_sgimenez', 'Santiago Giménez', 'Giménez', 'ST', 81, 'L', 3, 'POWER_SHOT_PLUS', '#e0ac69', 'SHORT', '#292524', 183, 'ATHLETIC', 9, 'milan_nero'],
      ['rw_rjimenez', 'Raúl Jiménez', 'Jiménez', 'ST', 78, 'R', 3, null, '#c68642', 'SHORT', '#1c1917', 190, 'ATHLETIC', 7, 'london_cannons'],
      ['rw_quinones', 'Julián Quiñones', 'Quiñones', 'LW', 76, 'R', 3, null, '#8d5524', 'SHORT', '#111111', 177, 'ATHLETIC', 20, 'rio_flamengo'],
    ],
  },
  {
    code: 'MA', name: 'Morocco', abbr: 'MAR', primary: '#c1272d', secondary: '#006233',
    players: [
      ['rw_bounou', 'Yassine Bounou', 'Bounou', 'GK', 83, 'R', 2, 'BRICK_WALL_GK', '#c68642', 'SHORT', '#111111', 195, 'ATHLETIC', 1, 'mad_royals'],
      ['rw_hakimi', 'Achraf Hakimi', 'Hakimi', 'RB', 87, 'R', 4, 'RAPID_PLUS', '#a67346', 'FADE', '#111111', 181, 'ATHLETIC', 2, 'paris_etoile', { pac: 95 }],
      ['rw_aguerd', 'Nayef Aguerd', 'Aguerd', 'CB', 81, 'L', 2, null, '#c68642', 'SHORT', '#111111', 190, 'ATHLETIC', 5, 'london_cannons'],
      ['rw_saiss', 'Romain Saïss', 'Saïss', 'CB', 78, 'L', 2, null, '#c68642', 'SHORT', '#111111', 190, 'STOCKY', 6, 'paris_etoile'],
      ['rw_mazraoui', 'Noussair Mazraoui', 'Mazraoui', 'LB', 81, 'R', 3, null, '#a67346', 'CURLY', '#111111', 183, 'ATHLETIC', 3, 'munich_stern'],
      ['rw_amrabat', 'Sofyan Amrabat', 'Amrabat', 'CDM', 80, 'R', 2, 'INTERCEPT_PLUS', '#a67346', 'BALD', '#111111', 185, 'STOCKY', 4, 'man_sky'],
      ['rw_ounahi', 'Azzedine Ounahi', 'Ounahi', 'CM', 79, 'R', 3, 'TECHNICAL_DRIBBLER', '#c68642', 'SHORT', '#111111', 182, 'LEAN', 8, 'paris_etoile'],
      ['rw_bdiaz', 'Brahim Díaz', 'Brahim', 'CAM', 82, 'R', 4, 'TECHNICAL_DRIBBLER', '#d8a47f', 'CURLY', '#1c1917', 171, 'LEAN', 10, 'mad_royals'],
      ['rw_ziyech', 'Hakim Ziyech', 'Ziyech', 'RW', 81, 'L', 4, 'FINESSE_SHOT_PLUS', '#a67346', 'SHORT', '#111111', 180, 'LEAN', 7, 'london_cannons'],
      ['rw_ennesyri', 'Youssef En-Nesyri', 'En-Nesyri', 'ST', 80, 'R', 3, 'POWER_SHOT_PLUS', '#a67346', 'SHORT', '#111111', 189, 'ATHLETIC', 19, 'paris_etoile'],
      ['rw_ezzalzouli', 'Abde Ezzalzouli', 'Abde', 'LW', 78, 'L', 4, 'RAPID_PLUS', '#a67346', 'CURLY', '#111111', 177, 'LEAN', 17, 'cat_blau'],
      ['rw_elkaabi', 'Ayoub El Kaabi', 'El Kaabi', 'ST', 78, 'R', 3, null, '#a67346', 'SHORT', '#111111', 182, 'ATHLETIC', 9, 'paris_etoile'],
    ],
  },
  {
    code: 'HR', name: 'Croatia', abbr: 'CRO', primary: '#f8fafc', secondary: '#e8112d',
    players: [
      ['rw_livakovic', 'Dominik Livaković', 'Livaković', 'GK', 82, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 188, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_stanisic', 'Josip Stanišić', 'Stanišić', 'RB', 78, 'R', 2, null, '#f1c27d', 'SHORT', '#292524', 186, 'ATHLETIC', 2, 'munich_stern'],
      ['rw_gvardiol', 'Joško Gvardiol', 'Gvardiol', 'CB', 85, 'L', 2, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#57412a', 185, 'ATHLETIC', 4, 'man_sky'],
      ['rw_sutalo', 'Josip Šutalo', 'Šutalo', 'CB', 78, 'R', 2, null, '#f1c27d', 'SHORT', '#1c1917', 190, 'ATHLETIC', 6, 'paris_etoile'],
      ['rw_sosa', 'Borna Sosa', 'Sosa', 'LB', 77, 'L', 3, null, '#f1c27d', 'LONG', '#8a5a2b', 187, 'LEAN', 19, 'london_cannons'],
      ['rw_modric', 'Luka Modrić', 'Modrić', 'CM', 85, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'LONG', '#8a5a2b', 172, 'LEAN', 10, 'milan_nero', { pas: 92, dri: 88 }],
      ['rw_kovacic', 'Mateo Kovačić', 'Kovačić', 'CM', 82, 'R', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'SHORT', '#57412a', 176, 'ATHLETIC', 8, 'man_sky'],
      ['rw_baturina', 'Martin Baturina', 'Baturina', 'CAM', 78, 'R', 4, null, '#f1c27d', 'SHORT', '#292524', 172, 'LEAN', 16, 'milan_nero'],
      ['rw_perisic', 'Ivan Perišić', 'Perišić', 'LW', 80, 'R', 3, null, '#f1c27d', 'SHORT', '#57412a', 186, 'ATHLETIC', 14, 'paris_etoile'],
      ['rw_kramaric', 'Andrej Kramarić', 'Kramarić', 'ST', 82, 'R', 3, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#292524', 177, 'ATHLETIC', 9, 'munich_stern'],
      ['rw_petkovic', 'Bruno Petković', 'Petković', 'ST', 79, 'R', 2, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#1c1917', 193, 'STOCKY', 20, 'paris_etoile'],
      ['rw_pasalic', 'Mario Pašalić', 'Pašalić', 'CM', 79, 'R', 3, null, '#f1c27d', 'SHORT', '#292524', 188, 'ATHLETIC', 15, 'milan_nero'],
    ],
  },
  {
    code: 'UY', name: 'Uruguay', abbr: 'URU', primary: '#5caddb', secondary: '#111111',
    players: [
      ['rw_rochet', 'Sergio Rochet', 'Rochet', 'GK', 79, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#1c1917', 190, 'ATHLETIC', 1, 'rio_flamengo'],
      ['rw_nandez', 'Nahitan Nández', 'Nández', 'RB', 78, 'R', 3, null, '#e0ac69', 'SHORT', '#111111', 172, 'STOCKY', 8, 'milan_nero'],
      ['rw_jgimenez', 'José María Giménez', 'Giménez', 'CB', 84, 'R', 2, 'INTERCEPT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 185, 'STOCKY', 2, 'mad_royals'],
      ['rw_caceres', 'Sebastián Cáceres', 'Cáceres', 'CB', 78, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 180, 'ATHLETIC', 3, 'rio_flamengo'],
      ['rw_molivera', 'Mathías Olivera', 'Olivera', 'LB', 78, 'L', 2, null, '#e0ac69', 'SHORT', '#111111', 184, 'ATHLETIC', 16, 'milan_nero'],
      ['rw_ugarte', 'Manuel Ugarte', 'Ugarte', 'CDM', 82, 'R', 2, 'INTERCEPT_PLUS', '#e5b887', 'SHORT', '#292524', 182, 'ATHLETIC', 5, 'man_sky'],
      ['rw_valverde', 'Federico Valverde', 'Valverde', 'CM', 87, 'R', 3, 'POWER_SHOT_PLUS', '#e5b887', 'SHORT', '#292524', 182, 'ATHLETIC', 15, 'mad_royals', { pas: 88, sho: 86, phy: 85 }],
      ['rw_dearrascaeta', 'Giorgian de Arrascaeta', 'De Arrascaeta', 'CAM', 81, 'R', 4, 'FINESSE_SHOT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 172, 'LEAN', 10, 'rio_flamengo'],
      ['rw_pellistri', 'Facundo Pellistri', 'Pellistri', 'RW', 77, 'R', 4, 'RAPID_PLUS', '#e5b887', 'CURLY', '#292524', 175, 'LEAN', 11, 'paris_etoile'],
      ['rw_nunez', 'Darwin Núñez', 'Núñez', 'ST', 82, 'R', 3, 'POWER_SHOT_PLUS', '#d8a47f', 'LONG', '#292524', 187, 'ATHLETIC', 19, 'mersey_reds'],
      ['rw_maraujo', 'Maximiliano Araújo', 'M. Araújo', 'LW', 78, 'L', 3, null, '#e0ac69', 'SHORT', '#111111', 178, 'ATHLETIC', 20, 'rio_flamengo'],
      ['rw_bentancur', 'Rodrigo Bentancur', 'Bentancur', 'CM', 80, 'R', 3, null, '#e0ac69', 'SHORT', '#1c1917', 187, 'ATHLETIC', 6, 'london_cannons'],
    ],
  },
  {
    code: 'BD', name: 'Bangladesh', abbr: 'BAN', primary: '#006a4e', secondary: '#f42a41',
    players: [
      ['rw_mitul', 'Mitul Marma', 'Mitul', 'GK', 68, 'R', 2, 'BRICK_WALL_GK', '#c68642', 'SHORT', '#111111', 180, 'ATHLETIC', 1, 'dhaka_tigers'],
      ['rw_saad', 'Saad Uddin', 'Saad', 'RB', 66, 'R', 2, null, '#a67346', 'SHORT', '#111111', 170, 'ATHLETIC', 2, 'dhaka_tigers'],
      ['rw_topu', 'Topu Barman', 'Topu', 'CB', 67, 'R', 2, null, '#a67346', 'SHORT', '#111111', 183, 'ATHLETIC', 4, 'dhaka_tigers'],
      ['rw_tariq', 'Tariq Kazi', 'Tariq', 'CB', 66, 'R', 2, null, '#c68642', 'SHORT', '#111111', 185, 'ATHLETIC', 5, 'dhaka_tigers'],
      ['rw_rahmat', 'Rahmat Mia', 'Rahmat', 'LB', 65, 'L', 2, null, '#a67346', 'SHORT', '#111111', 172, 'ATHLETIC', 3, 'dhaka_tigers'],
      ['rw_hamza', 'Hamza Choudhury', 'Hamza', 'CDM', 86, 'R', 3, 'INTERCEPT_PLUS', '#c68642', 'SHORT', '#111111', 178, 'ATHLETIC', 8, 'dhaka_tigers', { pas: 84, def: 85 }],
      ['rw_jamal', 'Jamal Bhuyan', 'Jamal', 'CDM', 70, 'R', 3, 'INCISIVE_PASS_PLUS', '#c68642', 'SHORT', '#111111', 173, 'ATHLETIC', 6, 'dhaka_tigers'],
      ['rw_sohel', 'Sohel Rana', 'Sohel', 'CM', 67, 'R', 2, null, '#a67346', 'SHORT', '#111111', 175, 'ATHLETIC', 17, 'dhaka_tigers'],
      ['rw_rakib', 'Rakib Hossain', 'Rakib', 'RW', 68, 'R', 3, 'RAPID_PLUS', '#a67346', 'FADE', '#111111', 172, 'LEAN', 10, 'dhaka_tigers'],
      ['rw_morsalin', 'Shekh Morsalin', 'Morsalin', 'CAM', 67, 'R', 3, 'FINESSE_SHOT_PLUS', '#a67346', 'CURLY', '#111111', 175, 'LEAN', 7, 'dhaka_tigers'],
      ['rw_suman', 'Suman Reza', 'Suman', 'ST', 66, 'R', 2, null, '#a67346', 'SHORT', '#111111', 178, 'ATHLETIC', 9, 'dhaka_tigers'],
      ['rw_fahim', 'Foysal Ahmed Fahim', 'Fahim', 'LW', 66, 'L', 3, null, '#a67346', 'FADE', '#111111', 170, 'LEAN', 11, 'dhaka_tigers'],
      ['rw_zico', 'Anisur Rahman Zico', 'Zico', 'GK', 66, 'R', 2, null, '#a67346', 'SHORT', '#111111', 182, 'ATHLETIC', 23, 'dhaka_tigers'],
    ],
  },
  {
    code: 'PL', name: 'Poland', abbr: 'POL', primary: '#f8fafc', secondary: '#dc2626',
    players: [
      ['rw_szczesny', 'Wojciech Szczęsny', 'Szczęsny', 'GK', 85, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 196, 'ATHLETIC', 1, 'cat_blau'],
      ['rw_cash', 'Matty Cash', 'Cash', 'RB', 80, 'R', 3, null, '#e5b887', 'FADE', '#111111', 185, 'ATHLETIC', 2, 'london_cannons'],
      ['rw_kiwior', 'Jakub Kiwior', 'Kiwior', 'CB', 81, 'L', 2, null, '#f1c27d', 'SHORT', '#8a5a2b', 189, 'ATHLETIC', 15, 'london_cannons'],
      ['rw_bednarek', 'Jan Bednarek', 'Bednarek', 'CB', 79, 'R', 2, null, '#e5b887', 'SHORT', '#292524', 189, 'STOCKY', 5, 'paris_etoile'],
      ['rw_zalewski', 'Nicola Zalewski', 'Zalewski', 'LM', 80, 'L', 3, 'RAPID_PLUS', '#e5b887', 'CURLY', '#111111', 175, 'LEAN', 21, 'milan_nero'],
      ['rw_zielinski', 'Piotr Zieliński', 'Zieliński', 'CM', 84, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#292524', 180, 'ATHLETIC', 20, 'milan_nero'],
      ['rw_moder', 'Jakub Moder', 'Moder', 'CM', 77, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 188, 'ATHLETIC', 8, 'london_cannons'],
      ['rw_szymanski', 'Sebastian Szymański', 'Szymański', 'CAM', 80, 'L', 4, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#111111', 174, 'LEAN', 10, 'paris_etoile'],
      ['rw_frankowski', 'Przemysław Frankowski', 'Frankowski', 'RM', 78, 'R', 3, null, '#e5b887', 'FADE', '#111111', 175, 'ATHLETIC', 19, 'paris_etoile'],
      ['rw_kaminski', 'Jakub Kamiński', 'Kamiński', 'LW', 76, 'L', 3, 'RAPID_PLUS', '#f1c27d', 'SHORT', '#111111', 179, 'LEAN', 13, 'munich_stern'],
      ['rw_lewandowski', 'Robert Lewandowski', 'Lewandowski', 'ST', 92, 'R', 4, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 185, 'ATHLETIC', 9, 'cat_blau', { sho: 95, phy: 86, pac: 84 }],
      ['rw_buksa', 'Adam Buksa', 'Buksa', 'ST', 77, 'L', 2, null, '#e5b887', 'SHORT', '#292524', 193, 'STOCKY', 16, 'paris_etoile'],
    ],
  },
  {
    code: 'SN', name: 'Senegal', abbr: 'SEN', primary: '#00853f', secondary: '#fdef42',
    players: [
      ['rw_emendy', 'Édouard Mendy', 'Mendy', 'GK', 84, 'R', 2, 'BRICK_WALL_GK', '#5c3317', 'BALD', '#111111', 194, 'ATHLETIC', 16, 'london_cannons'],
      ['rw_diatta', 'Krépin Diatta', 'Diatta', 'RB', 78, 'R', 3, 'RAPID_PLUS', '#6b3e26', 'FADE', '#111111', 173, 'LEAN', 14, 'paris_etoile'],
      ['rw_koulibaly', 'Kalidou Koulibaly', 'Koulibaly', 'CB', 84, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'SHORT', '#111111', 186, 'STOCKY', 3, 'london_cannons'],
      ['rw_niakate', 'Moussa Niakhaté', 'Niakhaté', 'CB', 79, 'L', 2, null, '#6b3e26', 'SHORT', '#111111', 190, 'ATHLETIC', 19, 'paris_etoile'],
      ['rw_jakobs', 'Ismail Jakobs', 'Jakobs', 'LB', 78, 'L', 3, 'RAPID_PLUS', '#6b3e26', 'CURLY', '#111111', 184, 'ATHLETIC', 12, 'paris_etoile'],
      ['rw_igueye', 'Idrissa Gueye', 'Gueye', 'CDM', 81, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'SHORT', '#111111', 174, 'STOCKY', 5, 'london_cannons'],
      ['rw_pgueye', 'Pape Gueye', 'P. Gueye', 'CM', 79, 'L', 2, null, '#6b3e26', 'FADE', '#111111', 189, 'ATHLETIC', 26, 'paris_etoile'],
      ['rw_camara', 'Lamine Camara', 'Camara', 'CM', 76, 'R', 3, null, '#6b3e26', 'FADE', '#111111', 178, 'LEAN', 6, 'paris_etoile'],
      ['rw_isarr', 'Ismaïla Sarr', 'Sarr', 'RW', 82, 'R', 4, 'RAPID_PLUS', '#6b3e26', 'FADE', '#111111', 185, 'LEAN', 18, 'london_cannons'],
      ['rw_mane', 'Sadio Mané', 'Mané', 'LW', 86, 'R', 4, 'FINESSE_SHOT_PLUS', '#5c3317', 'SHORT', '#111111', 174, 'ATHLETIC', 10, 'munich_stern', { pac: 90, dri: 89, sho: 86 }],
      ['rw_njackson', 'Nicolas Jackson', 'Jackson', 'ST', 80, 'R', 3, null, '#6b3e26', 'FADE', '#111111', 186, 'ATHLETIC', 15, 'london_cannons'],
      ['rw_indiaye', 'Iliman Ndiaye', 'Ndiaye', 'ST', 78, 'L', 3, 'TECHNICAL_DRIBBLER', '#6b3e26', 'CURLY', '#111111', 180, 'LEAN', 13, 'london_cannons'],
    ],
  },
  {
    code: 'CH', name: 'Switzerland', abbr: 'SUI', primary: '#da291c', secondary: '#ffffff',
    players: [
      ['rw_sommer', 'Yann Sommer', 'Sommer', 'GK', 87, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 183, 'ATHLETIC', 1, 'milan_nero'],
      ['rw_kobel', 'Gregor Kobel', 'Kobel', 'GK', 85, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 195, 'ATHLETIC', 21, 'munich_stern'],
      ['rw_akanji', 'Manuel Akanji', 'Akanji', 'CB', 84, 'R', 2, 'INTERCEPT_PLUS', '#8d5524', 'FADE', '#111111', 188, 'ATHLETIC', 5, 'man_sky'],
      ['rw_schar', 'Fabian Schär', 'Schär', 'CB', 80, 'R', 2, null, '#f1c27d', 'SHORT', '#292524', 186, 'ATHLETIC', 22, 'london_cannons'],
      ['rw_rrodriguez', 'Ricardo Rodriguez', 'Rodriguez', 'LB', 80, 'L', 3, null, '#e0ac69', 'SHORT', '#1c1917', 180, 'STOCKY', 13, 'milan_nero'],
      ['rw_zakaria', 'Denis Zakaria', 'Zakaria', 'CDM', 80, 'R', 2, null, '#8d5524', 'FADE', '#111111', 191, 'ATHLETIC', 6, 'london_cannons'],
      ['rw_xhaka', 'Granit Xhaka', 'Xhaka', 'CM', 86, 'L', 3, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#292524', 186, 'STOCKY', 10, 'london_cannons', { pas: 89, def: 80 }],
      ['rw_freuler', 'Remo Freuler', 'Freuler', 'CM', 81, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 181, 'ATHLETIC', 8, 'milan_nero'],
      ['rw_ndoye', 'Dan Ndoye', 'Ndoye', 'RW', 81, 'R', 4, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 184, 'LEAN', 11, 'milan_nero'],
      ['rw_vargas', 'Ruben Vargas', 'Vargas', 'LW', 79, 'L', 3, null, '#e0ac69', 'CURLY', '#111111', 179, 'LEAN', 17, 'paris_etoile'],
      ['rw_embolo', 'Breel Embolo', 'Embolo', 'ST', 80, 'R', 3, 'POWER_SHOT_PLUS', '#5c3317', 'BALD', '#111111', 187, 'STOCKY', 7, 'paris_etoile'],
      ['rw_okafor', 'Noah Okafor', 'Okafor', 'LW', 78, 'L', 3, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 185, 'LEAN', 19, 'milan_nero'],
    ],
  },
  {
    code: 'DK', name: 'Denmark', abbr: 'DEN', primary: '#c8102e', secondary: '#ffffff',
    players: [
      ['rw_schmeichel', 'Kasper Schmeichel', 'Schmeichel', 'GK', 83, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#8a5a2b', 189, 'ATHLETIC', 1, 'london_cannons'],
      ['rw_bah', 'Alexander Bah', 'Bah', 'RB', 77, 'R', 3, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 183, 'ATHLETIC', 18, 'paris_etoile'],
      ['rw_andersen', 'Joachim Andersen', 'Andersen', 'CB', 81, 'R', 2, null, '#f1c27d', 'SHORT', '#8a5a2b', 193, 'STOCKY', 2, 'london_cannons'],
      ['rw_christensen', 'Andreas Christensen', 'Christensen', 'CB', 82, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 187, 'ATHLETIC', 6, 'cat_blau'],
      ['rw_maehle', 'Joakim Mæhle', 'Mæhle', 'LB', 79, 'L', 3, null, '#f1c27d', 'SHORT', '#8a5a2b', 185, 'ATHLETIC', 5, 'munich_stern'],
      ['rw_hojbjerg', 'Pierre-Emile Højbjerg', 'Højbjerg', 'CDM', 82, 'R', 2, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#57412a', 185, 'STOCKY', 23, 'london_cannons'],
      ['rw_hjulmand', 'Morten Hjulmand', 'Hjulmand', 'CM', 81, 'R', 2, null, '#f1c27d', 'SHORT', '#292524', 186, 'ATHLETIC', 21, 'paris_etoile'],
      ['rw_eriksen', 'Christian Eriksen', 'Eriksen', 'CAM', 82, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 182, 'LEAN', 10, 'man_sky'],
      ['rw_skovolsen', 'Andreas Skov Olsen', 'Skov Olsen', 'RW', 79, 'L', 3, null, '#f1c27d', 'CURLY', '#57412a', 187, 'LEAN', 11, 'munich_stern'],
      ['rw_damsgaard', 'Mikkel Damsgaard', 'Damsgaard', 'LW', 80, 'L', 4, 'TECHNICAL_DRIBBLER', '#f1c27d', 'CURLY', '#8a5a2b', 180, 'LEAN', 14, 'london_cannons'],
      ['rw_hojlund', 'Rasmus Højlund', 'Højlund', 'ST', 82, 'L', 3, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 191, 'ATHLETIC', 9, 'man_sky'],
      ['rw_vestergaard', 'Jannik Vestergaard', 'Vestergaard', 'CB', 79, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 199, 'STOCKY', 3, 'london_cannons'],
    ],
  },
  {
    code: 'TR', name: 'Türkiye', abbr: 'TUR', primary: '#e30a17', secondary: '#ffffff',
    players: [
      ['rw_gunok', 'Mert Günok', 'Günok', 'GK', 82, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#1c1917', 196, 'ATHLETIC', 34, 'paris_etoile'],
      ['rw_muldur', 'Mert Müldür', 'Müldür', 'RB', 78, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 188, 'ATHLETIC', 25, 'paris_etoile'],
      ['rw_demiral', 'Merih Demiral', 'Demiral', 'CB', 82, 'R', 2, null, '#e0ac69', 'FADE', '#111111', 190, 'STOCKY', 3, 'paris_etoile'],
      ['rw_akaydin', 'Samet Akaydin', 'Akaydin', 'CB', 78, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 190, 'STOCKY', 4, 'paris_etoile'],
      ['rw_kadioglu', 'Ferdi Kadıoğlu', 'Kadıoğlu', 'LB', 80, 'L', 3, 'RAPID_PLUS', '#e0ac69', 'CURLY', '#111111', 174, 'LEAN', 20, 'london_cannons'],
      ['rw_yuksek', 'İsmail Yüksek', 'Yüksek', 'CDM', 77, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 183, 'ATHLETIC', 16, 'paris_etoile'],
      ['rw_calhanoglu', 'Hakan Çalhanoğlu', 'Çalhanoğlu', 'CM', 86, 'R', 4, 'INCISIVE_PASS_PLUS', '#e0ac69', 'SHORT', '#1c1917', 178, 'ATHLETIC', 10, 'milan_nero', { pas: 90, sho: 84 }],
      ['rw_guler', 'Arda Güler', 'Güler', 'CAM', 84, 'L', 5, 'TECHNICAL_DRIBBLER', '#e5b887', 'CURLY', '#111111', 175, 'LEAN', 8, 'mad_royals', { dri: 88, pas: 86 }],
      ['rw_akturkoglu', 'Kerem Aktürkoğlu', 'Aktürkoğlu', 'LW', 81, 'L', 4, 'RAPID_PLUS', '#e0ac69', 'SHORT', '#111111', 173, 'LEAN', 7, 'paris_etoile'],
      ['rw_yilmaz', 'Barış Alper Yılmaz', 'Yılmaz', 'ST', 80, 'R', 3, 'POWER_SHOT_PLUS', '#e0ac69', 'SHORT', '#111111', 186, 'STOCKY', 21, 'paris_etoile'],
      ['rw_bayindir', 'Altay Bayındır', 'Bayındır', 'GK', 78, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 198, 'ATHLETIC', 12, 'man_sky'],
      ['rw_celik', 'Zeki Çelik', 'Çelik', 'RB', 76, 'R', 2, null, '#e0ac69', 'FADE', '#111111', 180, 'ATHLETIC', 2, 'milan_nero'],
    ],
  },
  {
    code: 'CO', name: 'Colombia', abbr: 'COL', primary: '#fcd116', secondary: '#003893',
    players: [
      ['rw_cvargas', 'Camilo Vargas', 'Vargas', 'GK', 80, 'R', 2, 'BRICK_WALL_GK', '#c68642', 'SHORT', '#111111', 185, 'ATHLETIC', 12, 'paris_etoile'],
      ['rw_munoz', 'Daniel Muñoz', 'Muñoz', 'RB', 81, 'R', 3, 'RAPID_PLUS', '#c68642', 'FADE', '#111111', 181, 'ATHLETIC', 21, 'london_cannons'],
      ['rw_lucumi', 'Jhon Lucumí', 'Lucumí', 'CB', 81, 'L', 2, null, '#8d5524', 'FADE', '#111111', 187, 'ATHLETIC', 3, 'milan_nero'],
      ['rw_dsanchez', 'Davinson Sánchez', 'Sánchez', 'CB', 80, 'R', 2, null, '#8d5524', 'SHORT', '#111111', 187, 'STOCKY', 23, 'paris_etoile'],
      ['rw_mojica', 'Johan Mojica', 'Mojica', 'LB', 78, 'L', 3, null, '#c68642', 'FADE', '#111111', 179, 'ATHLETIC', 17, 'paris_etoile'],
      ['rw_lerma', 'Jefferson Lerma', 'Lerma', 'CDM', 80, 'R', 2, 'INTERCEPT_PLUS', '#8d5524', 'FADE', '#111111', 178, 'STOCKY', 16, 'london_cannons'],
      ['rw_rrios', 'Richard Ríos', 'Ríos', 'CM', 80, 'R', 3, null, '#8d5524', 'CURLY', '#111111', 187, 'ATHLETIC', 6, 'paris_etoile'],
      ['rw_jrodriguez', 'James Rodríguez', 'James', 'CAM', 84, 'L', 4, 'INCISIVE_PASS_PLUS', '#c68642', 'SHORT', '#111111', 180, 'LEAN', 10, 'mad_royals', { pas: 90, sho: 85 }],
      ['rw_ldiaz', 'Luis Díaz', 'Díaz', 'LW', 87, 'L', 5, 'RAPID_PLUS', '#c68642', 'FADE', '#111111', 180, 'LEAN', 7, 'mersey_reds', { pac: 93, dri: 90 }],
      ['rw_sinisterra', 'Luis Sinisterra', 'Sinisterra', 'RW', 78, 'R', 4, 'RAPID_PLUS', '#c68642', 'FADE', '#111111', 172, 'LEAN', 11, 'london_cannons'],
      ['rw_duran', 'Jhon Durán', 'Durán', 'ST', 81, 'L', 3, 'POWER_SHOT_PLUS', '#8d5524', 'FADE', '#111111', 185, 'STOCKY', 9, 'london_cannons'],
      ['rw_cordoba', 'Jhon Córdoba', 'Córdoba', 'ST', 78, 'R', 2, null, '#8d5524', 'SHORT', '#111111', 188, 'STOCKY', 24, 'paris_etoile'],
    ],
  },
  {
    code: 'NG', name: 'Nigeria', abbr: 'NGA', primary: '#008751', secondary: '#ffffff',
    players: [
      ['rw_nwabali', 'Stanley Nwabali', 'Nwabali', 'GK', 78, 'R', 2, 'BRICK_WALL_GK', '#5c3317', 'FADE', '#111111', 196, 'ATHLETIC', 23, 'paris_etoile'],
      ['rw_aina', 'Ola Aina', 'Aina', 'RB', 79, 'R', 3, null, '#5c3317', 'FADE', '#111111', 184, 'ATHLETIC', 2, 'london_cannons'],
      ['rw_ajayi', 'Semi Ajayi', 'Ajayi', 'CB', 77, 'R', 2, null, '#5c3317', 'BALD', '#111111', 193, 'STOCKY', 6, 'london_cannons'],
      ['rw_bassey', 'Calvin Bassey', 'Bassey', 'CB', 80, 'L', 2, null, '#5c3317', 'FADE', '#111111', 185, 'STOCKY', 3, 'london_cannons'],
      ['rw_zaidu', 'Zaidu Sanusi', 'Zaidu', 'LB', 76, 'L', 3, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 182, 'ATHLETIC', 13, 'paris_etoile'],
      ['rw_ndidi', 'Wilfred Ndidi', 'Ndidi', 'CDM', 80, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 183, 'ATHLETIC', 4, 'london_cannons'],
      ['rw_onyeka', 'Frank Onyeka', 'Onyeka', 'CM', 77, 'R', 2, null, '#5c3317', 'FADE', '#111111', 183, 'STOCKY', 8, 'london_cannons'],
      ['rw_iwobi', 'Alex Iwobi', 'Iwobi', 'CAM', 80, 'R', 4, 'TECHNICAL_DRIBBLER', '#5c3317', 'FADE', '#111111', 180, 'LEAN', 17, 'london_cannons'],
      ['rw_chukwueze', 'Samuel Chukwueze', 'Chukwueze', 'RW', 81, 'L', 5, 'RAPID_PLUS', '#5c3317', 'CURLY', '#111111', 172, 'LEAN', 11, 'milan_nero'],
      ['rw_lookman', 'Ademola Lookman', 'Lookman', 'LW', 86, 'R', 4, 'FINESSE_SHOT_PLUS', '#5c3317', 'FADE', '#111111', 174, 'LEAN', 18, 'paris_etoile', { pac: 91, dri: 89, sho: 86 }],
      ['rw_osimhen', 'Victor Osimhen', 'Osimhen', 'ST', 88, 'R', 4, 'POWER_SHOT_PLUS', '#5c3317', 'FADE', '#d6d3d1', 186, 'ATHLETIC', 9, 'paris_etoile', { pac: 92, sho: 90, phy: 85 }],
      ['rw_boniface', 'Victor Boniface', 'Boniface', 'ST', 81, 'R', 3, null, '#5c3317', 'FADE', '#111111', 190, 'STOCKY', 22, 'munich_stern'],
    ],
  },
  {
    code: 'GH', name: 'Ghana', abbr: 'GHA', primary: '#fcd116', secondary: '#ce1126',
    players: [
      ['rw_atizigi', 'Lawrence Ati-Zigi', 'Ati-Zigi', 'GK', 76, 'R', 2, 'BRICK_WALL_GK', '#5c3317', 'FADE', '#111111', 188, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_lamptey', 'Tariq Lamptey', 'Lamptey', 'RB', 77, 'R', 4, 'RAPID_PLUS', '#5c3317', 'CURLY', '#111111', 163, 'LEAN', 2, 'london_cannons'],
      ['rw_djiku', 'Alexander Djiku', 'Djiku', 'CB', 78, 'R', 2, null, '#5c3317', 'FADE', '#111111', 182, 'STOCKY', 23, 'paris_etoile'],
      ['rw_salisu', 'Mohammed Salisu', 'Salisu', 'CB', 78, 'L', 2, null, '#5c3317', 'FADE', '#111111', 191, 'ATHLETIC', 4, 'paris_etoile'],
      ['rw_gmensah', 'Gideon Mensah', 'Mensah', 'LB', 76, 'L', 2, null, '#5c3317', 'FADE', '#111111', 178, 'ATHLETIC', 14, 'paris_etoile'],
      ['rw_partey', 'Thomas Partey', 'Partey', 'CDM', 83, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 185, 'STOCKY', 5, 'london_cannons'],
      ['rw_ashimeru', 'Majeed Ashimeru', 'Ashimeru', 'CM', 75, 'R', 2, null, '#5c3317', 'FADE', '#111111', 179, 'ATHLETIC', 8, 'paris_etoile'],
      ['rw_kudus', 'Mohammed Kudus', 'Kudus', 'CAM', 84, 'L', 5, 'TECHNICAL_DRIBBLER', '#5c3317', 'FADE', '#111111', 177, 'ATHLETIC', 20, 'london_cannons', { dri: 90, pac: 88 }],
      ['rw_fatawu', 'Abdul Fatawu', 'Fatawu', 'RW', 77, 'L', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 170, 'LEAN', 7, 'london_cannons'],
      ['rw_sulemana', 'Kamaldeen Sulemana', 'Sulemana', 'LW', 76, 'L', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 174, 'LEAN', 22, 'london_cannons'],
      ['rw_jayew', 'Jordan Ayew', 'Ayew', 'ST', 77, 'R', 3, null, '#5c3317', 'FADE', '#111111', 182, 'ATHLETIC', 9, 'london_cannons'],
      ['rw_iwilliams', 'Iñaki Williams', 'Williams', 'ST', 78, 'R', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 186, 'ATHLETIC', 19, 'paris_etoile'],
    ],
  },
  {
    code: 'CM', name: 'Cameroon', abbr: 'CMR', primary: '#007a5e', secondary: '#ce1126',
    players: [
      ['rw_aonana', 'André Onana', 'Onana', 'GK', 84, 'R', 2, 'BRICK_WALL_GK', '#5c3317', 'FADE', '#111111', 190, 'STOCKY', 24, 'man_sky'],
      ['rw_tchatchoua', 'Jackson Tchatchoua', 'Tchatchoua', 'RB', 76, 'R', 3, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 186, 'ATHLETIC', 6, 'paris_etoile'],
      ['rw_castelletto', 'Jean-Charles Castelletto', 'Castelletto', 'CB', 77, 'R', 2, null, '#5c3317', 'FADE', '#111111', 186, 'ATHLETIC', 21, 'paris_etoile'],
      ['rw_wooh', 'Christopher Wooh', 'Wooh', 'CB', 76, 'R', 2, null, '#5c3317', 'CURLY', '#111111', 190, 'ATHLETIC', 4, 'paris_etoile'],
      ['rw_nouhou', 'Nouhou Tolo', 'Nouhou', 'LB', 76, 'L', 2, null, '#5c3317', 'FADE', '#111111', 178, 'STOCKY', 25, 'paris_etoile'],
      ['rw_baleba', 'Carlos Baleba', 'Baleba', 'CDM', 80, 'L', 3, null, '#5c3317', 'FADE', '#111111', 179, 'ATHLETIC', 17, 'london_cannons'],
      ['rw_anguissa', 'André-Frank Zambo Anguissa', 'Anguissa', 'CM', 82, 'R', 2, 'INTERCEPT_PLUS', '#5c3317', 'FADE', '#111111', 184, 'STOCKY', 8, 'milan_nero'],
      ['rw_kunde', 'Pierre Kunde', 'Kunde', 'CM', 75, 'R', 2, null, '#5c3317', 'FADE', '#111111', 180, 'ATHLETIC', 15, 'paris_etoile'],
      ['rw_mbeumo', 'Bryan Mbeumo', 'Mbeumo', 'RW', 85, 'R', 4, 'FINESSE_SHOT_PLUS', '#5c3317', 'FADE', '#111111', 171, 'ATHLETIC', 19, 'london_cannons', { pac: 90, sho: 84, dri: 87 }],
      ['rw_bassogog', 'Christian Bassogog', 'Bassogog', 'LW', 75, 'L', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 178, 'LEAN', 11, 'paris_etoile'],
      ['rw_aboubakar', 'Vincent Aboubakar', 'Aboubakar', 'ST', 80, 'R', 3, 'POWER_SHOT_PLUS', '#5c3317', 'FADE', '#111111', 184, 'STOCKY', 10, 'paris_etoile'],
      ['rw_choupo', 'Eric Maxim Choupo-Moting', 'Choupo-Moting', 'ST', 78, 'R', 2, null, '#5c3317', 'FADE', '#111111', 191, 'STOCKY', 13, 'munich_stern'],
    ],
  },
  {
    code: 'SA', name: 'Saudi Arabia', abbr: 'KSA', primary: '#006c35', secondary: '#ffffff',
    players: [
      ['rw_alowais', 'Mohammed Al-Owais', 'Al-Owais', 'GK', 77, 'R', 2, 'BRICK_WALL_GK', '#c68642', 'SHORT', '#111111', 187, 'ATHLETIC', 21, 'paris_etoile'],
      ['rw_abdulhamid', 'Saud Abdulhamid', 'Abdulhamid', 'RB', 75, 'R', 3, 'RAPID_PLUS', '#c68642', 'SHORT', '#111111', 171, 'LEAN', 12, 'milan_nero'],
      ['rw_altambakti', 'Hassan Al-Tambakti', 'Al-Tambakti', 'CB', 76, 'R', 2, null, '#c68642', 'SHORT', '#111111', 182, 'ATHLETIC', 17, 'paris_etoile'],
      ['rw_albulaihi', 'Ali Al-Bulaihi', 'Al-Bulaihi', 'CB', 75, 'R', 2, null, '#c68642', 'FADE', '#111111', 182, 'STOCKY', 5, 'paris_etoile'],
      ['rw_alharbi', 'Moteb Al-Harbi', 'Al-Harbi', 'LB', 74, 'L', 2, null, '#c68642', 'SHORT', '#111111', 173, 'ATHLETIC', 24, 'paris_etoile'],
      ['rw_alkhaibari', 'Abdullah Al-Khaibari', 'Al-Khaibari', 'CDM', 74, 'R', 2, null, '#c68642', 'SHORT', '#111111', 175, 'STOCKY', 8, 'paris_etoile'],
      ['rw_kanno', 'Mohamed Kanno', 'Kanno', 'CM', 76, 'R', 2, null, '#c68642', 'SHORT', '#111111', 192, 'ATHLETIC', 23, 'paris_etoile'],
      ['rw_alnajei', 'Sami Al-Najei', 'Al-Najei', 'CM', 73, 'R', 2, null, '#c68642', 'SHORT', '#111111', 176, 'LEAN', 16, 'paris_etoile'],
      ['rw_aldawsari', 'Salem Al-Dawsari', 'Al-Dawsari', 'LW', 79, 'L', 4, 'TECHNICAL_DRIBBLER', '#c68642', 'SHORT', '#111111', 172, 'LEAN', 10, 'paris_etoile'],
      ['rw_alghannam', 'Khalid Al-Ghannam', 'Al-Ghannam', 'RW', 74, 'R', 3, 'RAPID_PLUS', '#c68642', 'SHORT', '#111111', 172, 'LEAN', 2, 'paris_etoile'],
      ['rw_albrikan', 'Firas Al-Brikan', 'Al-Brikan', 'ST', 76, 'L', 2, null, '#c68642', 'SHORT', '#111111', 181, 'ATHLETIC', 9, 'paris_etoile'],
      ['rw_alshehri', 'Saleh Al-Shehri', 'Al-Shehri', 'ST', 75, 'R', 2, null, '#c68642', 'SHORT', '#111111', 184, 'ATHLETIC', 11, 'paris_etoile'],
    ],
  },
  {
    code: 'AU', name: 'Australia', abbr: 'AUS', primary: '#ffcd00', secondary: '#00843d',
    players: [
      ['rw_mryan', 'Mathew Ryan', 'Ryan', 'GK', 79, 'R', 2, 'BRICK_WALL_GK', '#f1c27d', 'SHORT', '#57412a', 184, 'ATHLETIC', 1, 'paris_etoile'],
      ['rw_atkinson', 'Nathaniel Atkinson', 'Atkinson', 'RB', 74, 'R', 2, null, '#f1c27d', 'SHORT', '#292524', 181, 'ATHLETIC', 2, 'paris_etoile'],
      ['rw_souttar', 'Harry Souttar', 'Souttar', 'CB', 77, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 198, 'STOCKY', 19, 'london_cannons'],
      ['rw_circati', 'Alessandro Circati', 'Circati', 'CB', 76, 'R', 2, null, '#e5b887', 'SHORT', '#292524', 190, 'ATHLETIC', 3, 'milan_nero'],
      ['rw_bos', 'Jordan Bos', 'Bos', 'LB', 76, 'L', 3, 'RAPID_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 183, 'ATHLETIC', 16, 'paris_etoile'],
      ['rw_oneill', "Aiden O'Neill", "O'Neill", 'CDM', 75, 'R', 2, null, '#f1c27d', 'SHORT', '#292524', 178, 'ATHLETIC', 13, 'paris_etoile'],
      ['rw_irvine', 'Jackson Irvine', 'Irvine', 'CM', 78, 'L', 2, null, '#f1c27d', 'LONG', '#8a5a2b', 189, 'ATHLETIC', 22, 'munich_stern'],
      ['rw_metcalfe', 'Connor Metcalfe', 'Metcalfe', 'CM', 75, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 183, 'ATHLETIC', 8, 'munich_stern'],
      ['rw_irankunda', 'Nestory Irankunda', 'Irankunda', 'RW', 76, 'R', 4, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 175, 'LEAN', 17, 'munich_stern'],
      ['rw_goodwin', 'Craig Goodwin', 'Goodwin', 'LW', 77, 'L', 3, 'FINESSE_SHOT_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 178, 'LEAN', 23, 'paris_etoile'],
      ['rw_duke', 'Mitchell Duke', 'Duke', 'ST', 75, 'R', 2, 'POWER_SHOT_PLUS', '#f1c27d', 'SHORT', '#57412a', 186, 'STOCKY', 15, 'tokyo_blazers'],
      ['rw_burgess', 'Cameron Burgess', 'Burgess', 'CB', 75, 'L', 2, null, '#f1c27d', 'SHORT', '#57412a', 194, 'STOCKY', 21, 'london_cannons'],
    ],
  },
  {
    code: 'CA', name: 'Canada', abbr: 'CAN', primary: '#ff0000', secondary: '#ffffff',
    players: [
      ['rw_crepeau', 'Maxime Crépeau', 'Crépeau', 'GK', 78, 'R', 2, 'BRICK_WALL_GK', '#e5b887', 'SHORT', '#292524', 182, 'ATHLETIC', 16, 'paris_etoile'],
      ['rw_ajohnston', 'Alistair Johnston', 'Johnston', 'RB', 79, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 180, 'STOCKY', 2, 'paris_etoile'],
      ['rw_bombito', 'Moïse Bombito', 'Bombito', 'CB', 76, 'R', 2, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 191, 'ATHLETIC', 15, 'paris_etoile'],
      ['rw_cornelius', 'Derek Cornelius', 'Cornelius', 'CB', 77, 'L', 2, null, '#8d5524', 'FADE', '#111111', 187, 'ATHLETIC', 13, 'paris_etoile'],
      ['rw_davies', 'Alphonso Davies', 'Davies', 'LB', 86, 'L', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 183, 'LEAN', 19, 'munich_stern', { pac: 95, dri: 88 }],
      ['rw_eustaquio', 'Stephen Eustáquio', 'Eustáquio', 'CM', 80, 'R', 3, 'INCISIVE_PASS_PLUS', '#e5b887', 'SHORT', '#292524', 178, 'ATHLETIC', 7, 'paris_etoile'],
      ['rw_kone', 'Ismaël Koné', 'Koné', 'CM', 78, 'R', 3, null, '#8d5524', 'FADE', '#111111', 188, 'ATHLETIC', 8, 'paris_etoile'],
      ['rw_osorio', 'Jonathan Osorio', 'Osorio', 'CAM', 76, 'R', 3, null, '#e0ac69', 'SHORT', '#111111', 180, 'LEAN', 21, 'paris_etoile'],
      ['rw_buchanan', 'Tajon Buchanan', 'Buchanan', 'RW', 79, 'R', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 183, 'LEAN', 17, 'milan_nero'],
      ['rw_shaffelburg', 'Jacob Shaffelburg', 'Shaffelburg', 'LW', 76, 'L', 3, 'RAPID_PLUS', '#f1c27d', 'CURLY', '#8a5a2b', 178, 'LEAN', 14, 'paris_etoile'],
      ['rw_jdavid', 'Jonathan David', 'David', 'ST', 85, 'R', 4, 'FINESSE_SHOT_PLUS', '#5c3317', 'FADE', '#111111', 180, 'LEAN', 20, 'london_cannons', { sho: 87, pac: 88 }],
      ['rw_larin', 'Cyle Larin', 'Larin', 'ST', 79, 'R', 2, 'POWER_SHOT_PLUS', '#5c3317', 'FADE', '#111111', 188, 'STOCKY', 9, 'paris_etoile'],
    ],
  },
];

/** Epic P0-3: extra real players appended to existing nations — these fill
 *  the thin real clubs (Al Nassr / Inter Miami / Juventus / Dortmund) to a
 *  full real XI through REAL_CLUB_BY_PLAYER, and deepen their nations. */
export const EXTRA_NATION_PLAYERS: Record<string, RealTuple[]> = {
  FR: [
    ['rw_simakan', 'Mohamed Simakan', 'Simakan', 'CB', 82, 'R', 2, null, '#8d5524', 'FADE', '#111111', 187, 'ATHLETIC', 22, 'paris_etoile'],
    ['rw_coman', 'Kingsley Coman', 'Coman', 'LW', 83, 'L', 4, 'RAPID_PLUS', '#5c3317', 'FADE', '#111111', 181, 'LEAN', 20, 'munich_stern'],
    ['rw_kalulu', 'Pierre Kalulu', 'Kalulu', 'CB', 79, 'R', 2, null, '#5c3317', 'FADE', '#111111', 179, 'ATHLETIC', 5, 'milan_nero'],
    ['rw_kthuram', 'Khéphren Thuram', 'K. Thuram', 'CM', 82, 'R', 3, null, '#5c3317', 'FADE', '#111111', 192, 'ATHLETIC', 19, 'milan_nero'],
  ],
  ES: [
    ['rw_laporte', 'Aymeric Laporte', 'Laporte', 'CB', 83, 'L', 2, 'INTERCEPT_PLUS', '#f1c27d', 'SHORT', '#292524', 191, 'ATHLETIC', 14, 'man_sky'],
    ['rw_busquets', 'Sergio Busquets', 'Busquets', 'CDM', 84, 'R', 3, 'INCISIVE_PASS_PLUS', '#e5b887', 'SHORT', '#3b2f2f', 189, 'LEAN', 5, 'cat_blau'],
    ['rw_alba', 'Jordi Alba', 'Alba', 'LB', 82, 'L', 3, 'RAPID_PLUS', '#e5b887', 'SHORT', '#292524', 170, 'LEAN', 18, 'cat_blau'],
  ],
  HR: [
    ['rw_brozovic', 'Marcelo Brozović', 'Brozović', 'CM', 83, 'R', 3, 'INCISIVE_PASS_PLUS', '#e5b887', 'SHORT', '#292524', 181, 'ATHLETIC', 11, 'milan_nero'],
  ],
  BR: [
    ['rw_angelo', 'Ângelo Gabriel', 'Ângelo', 'RW', 77, 'R', 4, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 180, 'LEAN', 20, 'london_cannons'],
    ['rw_bento', 'Bento', 'Bento', 'GK', 79, 'R', 2, 'BRICK_WALL_GK', '#8d5524', 'FADE', '#111111', 190, 'ATHLETIC', 12, 'paris_etoile'],
    ['rw_wesley', 'Wesley França', 'Wesley', 'RB', 77, 'R', 3, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 173, 'LEAN', 13, 'milan_nero'],
    ['rw_bremer', 'Gleison Bremer', 'Bremer', 'CB', 84, 'R', 2, 'INTERCEPT_PLUS', '#8d5524', 'FADE', '#111111', 188, 'STOCKY', 24, 'milan_nero'],
    ['rw_yancouto', 'Yan Couto', 'Yan Couto', 'RB', 77, 'R', 3, 'RAPID_PLUS', '#c68642', 'CURLY', '#111111', 168, 'LEAN', 2, 'munich_stern'],
  ],
  AR: [
    ['rw_ustari', 'Óscar Ustari', 'Ustari', 'GK', 76, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#292524', 184, 'ATHLETIC', 12, 'buenos_plata'],
    ['rw_aviles', 'Tomás Avilés', 'Avilés', 'CB', 75, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 186, 'ATHLETIC', 6, 'buenos_plata'],
    ['rw_lujan', 'Gonzalo Luján', 'Luján', 'RB', 74, 'R', 2, null, '#e0ac69', 'SHORT', '#111111', 182, 'ATHLETIC', 4, 'buenos_plata'],
    ['rw_silvetti', 'Mateo Silvetti', 'Silvetti', 'ST', 74, 'R', 3, null, '#e0ac69', 'SHORT', '#111111', 175, 'LEAN', 19, 'buenos_plata'],
    ['rw_allende', 'Tadeo Allende', 'Allende', 'ST', 75, 'R', 3, null, '#e0ac69', 'SHORT', '#111111', 183, 'ATHLETIC', 24, 'buenos_plata'],
  ],
  UY: [
    ['rw_suarez', 'Luis Suárez', 'Suárez', 'ST', 84, 'R', 4, 'POWER_SHOT_PLUS', '#e0ac69', 'SHORT', '#1c1917', 182, 'STOCKY', 9, 'cat_blau', { sho: 90, pas: 84 }],
  ],
  US: [
    ['rw_cremaschi', 'Benjamin Cremaschi', 'Cremaschi', 'CM', 76, 'R', 3, null, '#e5b887', 'SHORT', '#292524', 180, 'ATHLETIC', 8, 'paris_etoile'],
    ['rw_fray', 'Ian Fray', 'Fray', 'RB', 73, 'R', 2, null, '#8d5524', 'FADE', '#111111', 183, 'ATHLETIC', 17, 'paris_etoile'],
  ],
  IT: [
    ['rw_digregorio', 'Michele Di Gregorio', 'Di Gregorio', 'GK', 83, 'R', 2, 'BRICK_WALL_GK', '#e0ac69', 'SHORT', '#1c1917', 187, 'ATHLETIC', 21, 'milan_nero'],
    ['rw_cambiaso', 'Andrea Cambiaso', 'Cambiaso', 'LB', 81, 'L', 3, 'RAPID_PLUS', '#e0ac69', 'SHORT', '#1c1917', 181, 'LEAN', 24, 'milan_nero'],
    ['rw_gatti', 'Federico Gatti', 'Gatti', 'CB', 80, 'R', 2, null, '#e0ac69', 'FADE', '#1c1917', 190, 'STOCKY', 4, 'milan_nero'],
  ],
  PT: [
    ['rw_conceicao', 'Francisco Conceição', 'Conceição', 'RW', 81, 'R', 5, 'TECHNICAL_DRIBBLER', '#e5b887', 'FADE', '#1c1917', 170, 'LEAN', 26, 'milan_nero'],
    ['rw_otavio', 'Otávio', 'Otávio', 'CAM', 80, 'R', 4, 'INCISIVE_PASS_PLUS', '#c68642', 'CURLY', '#111111', 172, 'LEAN', 25, 'paris_etoile'],
  ],
  DE: [
    ['rw_adeyemi', 'Karim Adeyemi', 'Adeyemi', 'LW', 81, 'L', 4, 'RAPID_PLUS', '#8d5524', 'FADE', '#111111', 180, 'LEAN', 27, 'munich_stern'],
    ['rw_brandt', 'Julian Brandt', 'Brandt', 'CAM', 81, 'R', 4, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 185, 'LEAN', 17, 'munich_stern'],
    ['rw_sule', 'Niklas Süle', 'Süle', 'CB', 80, 'R', 2, null, '#f1c27d', 'SHORT', '#57412a', 195, 'STOCKY', 15, 'munich_stern'],
    ['rw_anton', 'Waldemar Anton', 'Anton', 'CB', 79, 'R', 2, null, '#e5b887', 'SHORT', '#292524', 189, 'STOCKY', 3, 'munich_stern'],
    ['rw_gross', 'Pascal Groß', 'Groß', 'CM', 79, 'R', 3, 'INCISIVE_PASS_PLUS', '#f1c27d', 'SHORT', '#57412a', 181, 'ATHLETIC', 5, 'munich_stern'],
    ['rw_beier', 'Maximilian Beier', 'Beier', 'ST', 78, 'R', 3, 'RAPID_PLUS', '#f1c27d', 'SHORT', '#8a5a2b', 185, 'LEAN', 14, 'munich_stern'],
    ['rw_nmecha', 'Felix Nmecha', 'Nmecha', 'CM', 78, 'R', 2, null, '#8d5524', 'FADE', '#111111', 188, 'ATHLETIC', 8, 'munich_stern'],
  ],
  GB: [
    ['rw_jobeb', 'Jobe Bellingham', 'J. Bellingham', 'CM', 78, 'R', 3, null, '#e5b887', 'FADE', '#111111', 191, 'ATHLETIC', 22, 'munich_stern'],
  ],
  TR: [
    ['rw_yildiz', 'Kenan Yıldız', 'Yıldız', 'LW', 83, 'L', 5, 'TECHNICAL_DRIBBLER', '#e0ac69', 'CURLY', '#111111', 185, 'LEAN', 19, 'milan_nero', { dri: 87, pac: 86 }],
  ],
  SN: [],
};

/** All real-world player seeds, flattened from the national squads. */
export const REAL_PLAYER_SEEDS: RealPlayerSeed[] = NATIONS.flatMap((nation) =>
  [...nation.players, ...(EXTRA_NATION_PLAYERS[nation.code] ?? [])].map((t) => tupleToSeed(nation, t)),
);
