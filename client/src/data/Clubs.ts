// Striker FC — data/Clubs.ts
// The full club universe: the 12 original seed clubs, 16 REAL clubs (added
// at the owner's explicit request, 2026-11-22, for personal play only — the
// game is not published or sold) and 13 NEW original-IP clubs, 41 in total
// (the 13th, Napoli Azzurri, is the Napoli analog added in the rig-merge
// fix round so De Bruyne has a correct analog home).
// Real clubs wear their real kit colours and field squads built from the
// real-world players in the database (RealPlayers.ts assigns each star to
// his real club); PlayerDatabase tops every squad up with generated players
// so each club can field a valid 4-3-3 XI plus a bench. Club teams here are
// derived from the same player database the packs, market and squad builder
// use — one source of truth, correct club tags everywhere.

import type { Club, PlayerTemplate, Position } from '../core/types';
import { positionGroup } from '../core/types';
import { getAllPlayers } from './PlayerDatabase';
import { NEW_ORIGINAL_CLUBS, REAL_CLUBS, SEED_CLUBS, SEED_FORMATIONS } from './seedDatabase';

export { NEW_ORIGINAL_CLUBS, REAL_CLUBS };

/** Every club in the game: 12 original + 16 real + 13 new original = 41. */
export const ALL_CLUBS: Club[] = [...SEED_CLUBS, ...REAL_CLUBS, ...NEW_ORIGINAL_CLUBS];

const REAL_IDS = new Set(REAL_CLUBS.map((c) => c.id));
const NEW_ORIGINAL_IDS = new Set(NEW_ORIGINAL_CLUBS.map((c) => c.id));

export function getClubById(id: string): Club | null {
  return ALL_CLUBS.find((c) => c.id === id) ?? null;
}

export type ClubKind = 'REAL' | 'ORIGINAL' | 'NEW_ORIGINAL';

export function clubKind(id: string): ClubKind {
  if (REAL_IDS.has(id)) return 'REAL';
  if (NEW_ORIGINAL_IDS.has(id)) return 'NEW_ORIGINAL';
  return 'ORIGINAL';
}

export interface ClubTeam {
  club: Club;
  kind: ClubKind;
  /** Full squad from the player database (OVR order). */
  squad: PlayerTemplate[];
  /** Best XI in 4-3-3 slot order — the exact templates a match fields. */
  xi: PlayerTemplate[];
  teamOvr: number;
  captain: PlayerTemplate | null;
  star: PlayerTemplate | null;
  /** The club's identity formation (display + tactics identity). */
  formationId: string;
}

/** Epic P0-3: per-club identity formations — not every club plays 4-3-3. */
export const CLUB_FORMATIONS: Record<string, string> = {
  real_madrid: '4-3-3-attack', fc_barcelona: '4-3-3-attack', man_city: '4-3-3-attack',
  liverpool: '4-2-3-1-wide', bayern_munich: '4-2-3-1-wide', psg: '4-3-3-holding',
  arsenal: '4-3-3-attack', chelsea: '4-2-3-1-wide', man_utd: '3-4-3-diamond',
  inter_milan: '3-5-2', ac_milan: '4-2-3-1-wide', juventus: '3-5-2',
  dortmund: '4-2-3-1-wide', atletico_madrid: '4-4-2-flat', al_nassr: '4-2-3-1-wide',
  inter_miami: '4-4-2-flat',
};

/** Epic P0-3: per-club captains (template ids). */
export const CLUB_CAPTAINS: Record<string, string> = {
  real_madrid: 'rw_carvajal', fc_barcelona: 'rw_terstegen', man_city: 'rw_bsilva',
  liverpool: 'rw_vandijk', bayern_munich: 'rw_kimmich', psg: 'rw_marquinhos',
  arsenal: 'rw_odegaard', chelsea: 'rw_enzo', man_utd: 'rw_bfernandes',
  inter_milan: 'rw_lautaro', ac_milan: 'rw_maignan', juventus: 'rw_locatelli',
  dortmund: 'rw_schlotterbeck', atletico_madrid: 'rw_jgimenez', al_nassr: 'rw_ronaldo',
  inter_miami: 'rw_messi',
};

/** Full kit for a club: shirt/trim from the club colours, shorts + socks
 *  from the club record when set, sensible defaults otherwise, plus the
 *  away strip used when two kits clash. The realistic-models pass threads
 *  the club's shirt pattern / collar / sleeve colour / abbreviation
 *  through to the rig (spec §1.6) — KitColors carries them as optional
 *  fields, so every existing consumer keeps working unchanged. */
export function clubKit(club: Club, away = false): { primary: string; secondary: string; shorts: string; socks: string; pattern?: Club['kitPattern']; collarStyle?: Club['collarStyle']; sleeveColor?: string; abbr?: string } {
  const identity = {
    pattern: club.kitPattern,
    collarStyle: club.collarStyle,
    sleeveColor: club.sleeveColor,
    abbr: club.abbr,
  };
  if (away) {
    return {
      primary: club.awayPrimary ?? club.secondary,
      secondary: club.awaySecondary ?? club.primary,
      shorts: club.awaySecondary ?? club.primary,
      socks: club.awayPrimary ?? club.secondary,
      ...identity,
    };
  }
  return {
    primary: club.primary,
    secondary: club.secondary,
    shorts: club.shortsColor ?? '#f8fafc',
    socks: club.socksColor ?? club.primary,
    ...identity,
  };
}

/** True when two shirt colours are close enough that the away side must
 *  switch to its away strip. */
export function kitsClash(a: string, b: string): boolean {
  const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
}

const FORMATION = SEED_FORMATIONS.find((f) => f.id === '4-3-3-attack') ?? SEED_FORMATIONS[0]!;

/** Pick the strongest XI for the 4-3-3 slots from a club's player pool. */
function pickXI(pool: PlayerTemplate[]): PlayerTemplate[] {
  const unused = [...pool].sort((a, b) => b.baseOvr - a.baseOvr);
  const xi: PlayerTemplate[] = [];
  for (const slot of FORMATION.slots) {
    const role = slot.role as Position;
    let idx = unused.findIndex((p) => p.position === role);
    if (idx < 0) idx = unused.findIndex((p) => p.altPositions.includes(role));
    if (idx < 0) idx = unused.findIndex((p) => positionGroup(p.position) === positionGroup(role));
    if (idx < 0) idx = unused.length > 0 ? 0 : -1;
    if (idx < 0) break;
    xi.push(unused.splice(idx, 1)[0]!);
  }
  return xi;
}

let teamCache: ClubTeam[] | null = null;

export function getClubTeams(): ClubTeam[] {
  if (teamCache) return teamCache;
  const all = getAllPlayers();
  teamCache = ALL_CLUBS.map((club) => {
    const squad = all.filter((p) => p.clubId === club.id).sort((a, b) => b.baseOvr - a.baseOvr);
    const xi = pickXI(squad);
    const teamOvr = xi.length > 0 ? Math.round(xi.reduce((s, p) => s + p.baseOvr, 0) / xi.length) : 0;
    const captainId = club.captainId ?? CLUB_CAPTAINS[club.id];
    return {
      club,
      kind: clubKind(club.id),
      squad,
      xi,
      teamOvr,
      captain: (captainId ? squad.find((p) => p.id === captainId) : undefined) ?? squad[0] ?? null,
      star: squad[0] ?? null,
      formationId: club.formationId ?? CLUB_FORMATIONS[club.id] ?? '4-3-3-attack',
    };
  }).sort((a, b) => b.teamOvr - a.teamOvr);
  return teamCache;
}

export function getClubTeam(clubId: string): ClubTeam | null {
  return getClubTeams().find((t) => t.club.id === clubId) ?? null;
}

// ---------------------------------------------------------------------------
// Verification lab — the club universe loads, every club fields a valid XI
// of its own players, and the headline real-world assignments hold.
// ---------------------------------------------------------------------------

export interface ClubsLabResult {
  countsOk: boolean;
  squadsOk: boolean;
  xiOk: boolean;
  starsOk: boolean;
  realDepthOk: boolean;
  detail: string;
}

const STAR_CLUB_CHECKS: [string, string][] = [
  ['rw_mbappe', 'real_madrid'],
  ['rw_vinicius', 'real_madrid'],
  ['rw_bellingham', 'real_madrid'],
  ['rw_haaland', 'man_city'],
  ['rw_salah', 'liverpool'],
  ['rw_kane', 'bayern_munich'],
  ['rw_messi', 'inter_miami'],
  ['rw_ronaldo', 'al_nassr'],
  // Rig-merge fix round (P2): De Bruyne's home is the Napoli analog.
  ['rw_debruyne', 'napoli_azzurri'],
];

export function runClubsLab(): ClubsLabResult {
  const countsOk = ALL_CLUBS.length === 41 && REAL_CLUBS.length === 16 && NEW_ORIGINAL_CLUBS.length === 13
    && new Set(ALL_CLUBS.map((c) => c.id)).size === 41;
  const teams = getClubTeams();
  const squadsOk = teams.every((t) => t.squad.length >= 16);
  const xiOk = teams.every((t) => t.xi.length === 11
    && new Set(t.xi.map((p) => p.id)).size === 11
    && t.xi.every((p) => p.clubId === t.club.id)
    && t.xi.some((p) => p.position === 'GK'));
  const byId = new Map(getAllPlayers().map((p) => [p.id, p]));
  const starsOk = STAR_CLUB_CHECKS.every(([pid, cid]) => byId.get(pid)?.clubId === cid);
  // Epic P0-3: the four thinnest real clubs must carry a full real squad.
  const realDepthOk = ['al_nassr', 'inter_miami', 'juventus', 'dortmund'].every((cid) => {
    const t = teams.find((x) => x.club.id === cid);
    return !!t && t.squad.filter((p) => p.realWorld).length >= 11;
  });
  const realMadrid = teams.find((t) => t.club.id === 'real_madrid');
  const weakest = [...teams].sort((a, b) => a.teamOvr - b.teamOvr)[0];
  return {
    countsOk, squadsOk, xiOk, starsOk, realDepthOk,
    detail: `41 clubs (16 real · 25 original) · Real Madrid ${realMadrid?.teamOvr ?? 0} OVR · weakest XI ${weakest?.club.name ?? '—'} ${weakest?.teamOvr ?? 0} OVR · every club fields 11 of its own`,
  };
}
