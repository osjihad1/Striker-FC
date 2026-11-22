// Striker FC — data/NationalTeams.ts
// National teams built from the real-world roster (RealPlayers.ts): every
// nation's squad is its real players from the database (topped up with the
// best generated players of that nationality when a nation has fewer than
// 23 in the pool).
//
// Epic P0-2 rewrite: the XI is picked REAL PLAYERS FIRST with exact
// position fit in a 4-2-3-1 (two CDM slots, so Rodri / Casemiro / Rice /
// Tonali / Ugarte actually play) — generated players only fill slots no
// real player can fill, they never displace a real player. Captains are
// explicit per nation (not "highest OVR") and always start. Shirt numbers
// are the players' real numbers, unique within the XI; generated fill-ins
// receive the smallest free number.

import type { PlayerTemplate, Position } from '../core/types';
import { positionGroup } from '../core/types';
import { getAllPlayers } from './PlayerDatabase';
import { NATIONS, type NationDef } from './RealPlayers';
import { SEED_FORMATIONS } from './seedDatabase';

export interface NationalTeam {
  code: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  /** Full squad: real players first (OVR order), then generated nationals. */
  squad: PlayerTemplate[];
  /** Best XI in 4-2-3-1 slot order (same order applyAwaySquad expects).
   *  Entries are copies carrying the unique match shirt number. */
  xi: PlayerTemplate[];
  teamOvr: number;
  captain: PlayerTemplate | null;
  star: PlayerTemplate | null;
}

const FORMATION = SEED_FORMATIONS.find((f) => f.id === '4-2-3-1-wide') ?? SEED_FORMATIONS[0]!;

/** The real captain of each nation (must start — enforced in pickXI). */
export const NATION_CAPTAINS: Record<string, string> = {
  AR: 'rw_messi', PT: 'rw_ronaldo', FR: 'rw_mbappe', BR: 'rw_marquinhos',
  GB: 'rw_kane', ES: 'rw_morata', DE: 'rw_kimmich', IT: 'rw_donnarumma',
  NL: 'rw_vandijk', BE: 'rw_debruyne', NO: 'rw_odegaard', EG: 'rw_salah',
  KR: 'rw_son', JP: 'rw_endo', US: 'rw_pulisic', MX: 'rw_ealvarez',
  MA: 'rw_hakimi', HR: 'rw_modric', UY: 'rw_valverde', BD: 'rw_jamal',
  PL: 'rw_lewandowski', SN: 'rw_koulibaly', CH: 'rw_xhaka', DK: 'rw_hojbjerg',
  TR: 'rw_calhanoglu', CO: 'rw_jrodriguez', NG: 'rw_ndidi', GH: 'rw_jayew',
  CM: 'rw_aboubakar', SA: 'rw_aldawsari', AU: 'rw_mryan', CA: 'rw_davies', GE: 'rw_kashia',
};

function fitScore(p: PlayerTemplate, role: Position): number {
  if (p.position === role) return 1000 + p.baseOvr;
  if (p.altPositions.includes(role)) return 500 + p.baseOvr;
  if (positionGroup(p.position) === positionGroup(role)) return p.baseOvr;
  return -1;
}

function pickFrom(pool: PlayerTemplate[], role: Position): number {
  let best = -1;
  let bestScore = -1;
  pool.forEach((p, i) => {
    const s = fitScore(p, role);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}

function fits(p: PlayerTemplate, role: Position): boolean {
  return fitScore(p, role) >= 0;
}

/** Real-first XI: real players fill every slot they can; generated players
 *  only take slots with no real candidate. Captain is forced in. */
function pickXI(pool: PlayerTemplate[], captainId: string | undefined, mustStart: string[] = []): PlayerTemplate[] {
  const real = pool.filter((p) => p.realWorld).sort((a, b) => b.baseOvr - a.baseOvr);
  const generated = pool.filter((p) => !p.realWorld).sort((a, b) => b.baseOvr - a.baseOvr);
  const xi: PlayerTemplate[] = [];
  for (const slot of FORMATION.slots) {
    const role = slot.role as Position;
    let idx = pickFrom(real, role);
    if (idx >= 0) { xi.push(real.splice(idx, 1)[0]!); continue; }
    idx = pickFrom(generated, role);
    if (idx >= 0) { xi.push(generated.splice(idx, 1)[0]!); continue; }
    const any = real[0] ?? generated[0];
    if (any) {
      xi.push(any);
      if (real.length > 0 && real[0] === any) real.splice(0, 1); else generated.splice(0, 1);
    }
  }
  // Captain always starts: swap him in for the weakest player of his
  // position group (or the weakest outfielder) when he missed the cut.
  if (captainId && !xi.some((p) => p.id === captainId)) {
    const captain = pool.find((p) => p.id === captainId);
    if (captain) {
      const group = positionGroup(captain.position);
      let swapIdx = -1;
      let weakest = Infinity;
      xi.forEach((p, i) => {
        if (p.position !== 'GK' && positionGroup(p.position) === group && p.baseOvr < weakest) { weakest = p.baseOvr; swapIdx = i; }
      });
      if (swapIdx < 0) {
        xi.forEach((p, i) => { if (p.position !== 'GK' && p.baseOvr < weakest) { weakest = p.baseOvr; swapIdx = i; } });
      }
      if (swapIdx >= 0) xi[swapIdx] = captain;
    }
  }
  // Must-start stars (the faces of each nation) are forced in the same
  // way: a star who fits a slot (exact / alt / group) displaces the weakest
  // non-protected occupant of a slot he can play.
  for (const id of mustStart) {
    if (xi.some((p) => p.id === id)) continue;
    const star = pool.find((p) => p.id === id);
    if (!star) continue;
    let swapIdx = -1;
    let weakest = Infinity;
    xi.forEach((p, i) => {
      const role = FORMATION.slots[i]!.role as Position;
      if (p.position === 'GK' || p.id === captainId || mustStart.includes(p.id)) return;
      if (fits(star, role) && p.baseOvr < weakest) { weakest = p.baseOvr; swapIdx = i; }
    });
    if (swapIdx >= 0) xi[swapIdx] = star;
  }
  // Unique shirt numbers: real numbers win; collisions and generated
  // players take the smallest free number.
  const used = new Set<number>();
  return xi.map((p) => {
    let n = p.shirtNumber;
    if (n === undefined || n < 1 || n > 99 || used.has(n)) {
      n = 1;
      while (used.has(n)) n += 1;
    }
    used.add(n);
    return n === p.shirtNumber ? p : { ...p, shirtNumber: n };
  });
}

let cache: NationalTeam[] | null = null;

export function getNationalTeams(): NationalTeam[] {
  if (cache) return cache;
  const all = getAllPlayers();
  cache = NATIONS.map((nation: NationDef) => {
    const nationals = all.filter((p) => p.nationality === nation.code);
    const real = nationals.filter((p) => p.realWorld).sort((a, b) => b.baseOvr - a.baseOvr);
    const generated = nationals.filter((p) => !p.realWorld).sort((a, b) => b.baseOvr - a.baseOvr);
    const squad = [...real, ...generated].slice(0, 23);
    const captainId = NATION_CAPTAINS[nation.code];
    const xi = pickXI(nationals, captainId, MUST_START[nation.code] ?? []);
    const teamOvr = xi.length > 0 ? Math.round(xi.reduce((s, p) => s + p.baseOvr, 0) / xi.length) : 0;
    const captain = (captainId ? squad.find((p) => p.id === captainId) : undefined) ?? real[0] ?? squad[0] ?? null;
    return {
      code: nation.code,
      name: nation.name,
      abbr: nation.abbr,
      primary: nation.primary,
      secondary: nation.secondary,
      squad,
      xi,
      teamOvr,
      captain,
      star: real[0] ?? null,
    };
  }).sort((a, b) => b.teamOvr - a.teamOvr);
  return cache;
}

export function getNationalTeam(code: string): NationalTeam | null {
  return getNationalTeams().find((t) => t.code === code) ?? null;
}

// ---------- Verification lab (Epic P0-2 acceptance) ----------

export interface NationsLabResult {
  countOk: boolean;
  xiShapeOk: boolean;
  starsStartOk: boolean;
  captainsOk: boolean;
  numbersOk: boolean;
  bangladeshOk: boolean;
  detail: string;
}

const MUST_START: Record<string, string[]> = {
  BR: ['rw_vinicius', 'rw_neymar'],
  ES: ['rw_rodri', 'rw_yamal'],
  GB: ['rw_bellingham', 'rw_rice', 'rw_foden'],
  EG: ['rw_salah'],
  BE: ['rw_courtois'],
  MA: ['rw_hakimi'],
  BD: ['rw_hamza'],
  PL: ['rw_lewandowski'],
  AR: ['rw_messi'],
  PT: ['rw_ronaldo'],
  FR: ['rw_mbappe'],
  GE: ['rw_kvaratskhelia'],
};

export function runNationsLab(): NationsLabResult {
  const teams = getNationalTeams();
  const countOk = teams.length === 33;
  let xiShapeOk = teams.length > 0;
  let captainsOk = true;
  let numbersOk = true;
  const starMisses: string[] = [];
  for (const t of teams) {
    if (t.xi.length !== 11 || t.xi[0]?.position !== 'GK') xiShapeOk = false;
    if (new Set(t.xi.map((p) => p.id)).size !== t.xi.length) xiShapeOk = false;
    const capId = NATION_CAPTAINS[t.code];
    if (capId && !t.xi.some((p) => p.id === capId)) { captainsOk = false; starMisses.push(`${t.code} captain out`); }
    const nums = t.xi.map((p) => p.shirtNumber ?? -1);
    if (nums.some((n) => n < 1 || n > 99) || new Set(nums).size !== nums.length) numbersOk = false;
    for (const id of MUST_START[t.code] ?? []) {
      if (!t.xi.some((p) => p.id === id)) starMisses.push(`${t.code}: ${id} not starting`);
    }
  }
  const bd = teams.find((t) => t.code === 'BD');
  const bangladeshOk = !!bd && bd.xi.filter((p) => p.realWorld).length >= 8 && bd.teamOvr <= 74;
  return {
    countOk,
    xiShapeOk,
    starsStartOk: starMisses.length === 0,
    captainsOk,
    numbersOk,
    bangladeshOk,
    detail: `${teams.length} nations · ${starMisses.length === 0 ? 'every star starts' : starMisses.slice(0, 4).join(' · ')} · Bangladesh OVR ${bd?.teamOvr ?? 0}`,
  };
}
