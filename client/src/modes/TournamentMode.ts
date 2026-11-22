// Striker FC — modes/TournamentMode.ts (Phase 08, Blueprint 08 §3 Mode 4)
// The Champions Knockout Cup: a persistent 16-club bracket (Round of 16 →
// Quarterfinals → Semifinals → Final) stored in the SaveProfile. The user's
// ties are played live in the 3D engine (MatchEngine knockout rules: extra
// time + a playable penalty shootout); every other tie is simulated from the
// clubs' real squad strengths. Winning the Final lifts the trophy and pays
// 25,000 Coins, 500 Gems and a guaranteed 90+ Master card.

import { mulberry32 } from '../core/math';
import type { Club, PlayerTemplate, SaveProfile, TournamentState, TournamentTie } from '../core/types';
import { calculateTeamOvr, getSlotEffectiveOvr } from '../core/types';
import type { OwnedPlayerCard } from '../core/types';
import { getAllPlayers } from '../data/PlayerDatabase';
import { ALL_CLUBS } from '../data/Clubs';
import { getFormationById } from '../data/Formations';
import { generateH2hOpponent } from './HeadToHeadMode';

export const USER_CLUB_ID = 'user_club';
export const CHAMPION_COINS = 25_000;
export const CHAMPION_GEMS = 500;

export const ROUND_NAMES = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'] as const;

/**
 * The cup draws 16 clubs from the full 40-club universe (Clubs.ts) plus the
 * manager's own club. Three invitational sides from the game's first season
 * remain resolvable here for older saved brackets; their XIs are assembled
 * from the player database when they meet the user — exactly like the H2H
 * ladder generator.
 */
export const INVITATIONAL_CLUBS: Club[] = [
  { id: 'harbor_city', name: 'Harbor City FC', abbr: 'HAR', primary: '#0ea5e9', secondary: '#f8fafc', league: 'Invitational' },
  { id: 'summit_rovers', name: 'Summit Rovers', abbr: 'SUM', primary: '#f59e0b', secondary: '#111827', league: 'Invitational' },
  { id: 'cinder_athletic', name: 'Cinder Athletic', abbr: 'CIN', primary: '#ef4444', secondary: '#f8fafc', league: 'Invitational' },
];

const INVITATIONAL_STRENGTH: Record<string, number> = {
  harbor_city: 79,
  summit_rovers: 77,
  cinder_athletic: 81,
};

export function cupClubById(id: string, profile: SaveProfile): Club {
  if (id === USER_CLUB_ID) {
    return {
      id, name: profile.clubName, abbr: profile.clubAbbr,
      primary: profile.clubPrimaryColor, secondary: profile.clubSecondaryColor, league: 'Your Club',
    };
  }
  return ALL_CLUBS.find((c) => c.id === id)
    ?? INVITATIONAL_CLUBS.find((c) => c.id === id)
    ?? ALL_CLUBS[0]!;
}

const RANK0_CARD: OwnedPlayerCard = {
  instanceId: 'cup-xi', templateId: '', trainingLevel: 0, trainingXp: 0, rank: 0,
  skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
  locked: false,
};

/** A seed club's best eleven from its own real squad (15 players per club). */
export function generateClubXI(clubId: string, formationId = '4-3-3-attack'): PlayerTemplate[] {
  const formation = getFormationById(formationId) ?? getFormationById('4-3-3-attack')!;
  const squad = getAllPlayers().filter((p) => p.clubId === clubId);
  const used = new Set<string>();
  const xi: PlayerTemplate[] = [];
  for (const slot of formation.slots) {
    const candidates = squad.filter((p) => !used.has(p.id));
    const pick = candidates.filter((p) => p.position === slot.role).sort((a, b) => b.baseOvr - a.baseOvr)[0]
      ?? [...candidates].sort((a, b) => b.baseOvr - a.baseOvr)[0];
    if (!pick) break;
    used.add(pick.id);
    xi.push(pick);
  }
  return xi;
}

/** Team OVR of a club's best XI (the user's club passes its own Team OVR in). */
export function clubStrength(clubId: string, userTeamOvr: number): number {
  if (clubId === USER_CLUB_ID) return userTeamOvr;
  const inv = INVITATIONAL_STRENGTH[clubId];
  if (inv !== undefined) return inv;
  const formation = getFormationById('4-3-3-attack')!;
  const xi = generateClubXI(clubId);
  const slotOvrs = xi.map((tpl, i) => getSlotEffectiveOvr(tpl, RANK0_CARD, formation.slots[i]?.role ?? tpl.position));
  return slotOvrs.length === 11 ? calculateTeamOvr(slotOvrs, slotOvrs.map(() => 0)) : 75;
}

/** The opponent XI the user faces in a cup tie. */
export function cupOpponentXI(clubId: string, rng: () => number): PlayerTemplate[] {
  if (INVITATIONAL_STRENGTH[clubId] !== undefined) {
    // Invitational sides are assembled around their strength rating.
    const strength = INVITATIONAL_STRENGTH[clubId]!;
    const opp = generateH2hOpponent(strength, 8, rng);
    return opp.templates;
  }
  return generateClubXI(clubId);
}

function blankTie(homeClubId: string, awayClubId: string): TournamentTie {
  return {
    homeClubId, awayClubId,
    homeGoals: null, awayGoals: null,
    pensHome: null, pensAway: null,
    winnerClubId: null,
    isUserTie: homeClubId === USER_CLUB_ID || awayClubId === USER_CLUB_ID,
  };
}

/** Create a fresh shuffled 16-club bracket with the user's club in the draw.
 *  The other 15 are drawn from the full 40-club universe (real + original),
 *  so a cup run can meet Real Madrid in the quarters and Chittagong Thunder
 *  in the semis. */
export function createTournament(seed: number, nowIso: string): TournamentState {
  const rng = mulberry32(seed);
  const pool = ALL_CLUBS.map((c) => c.id);
  // Fisher–Yates with the seeded rng — the draw is reproducible for the seed.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = pool[i]!; pool[i] = pool[j]!; pool[j] = a;
  }
  const ids = [...pool.slice(0, 15), USER_CLUB_ID];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = ids[i]!; ids[i] = ids[j]!; ids[j] = a;
  }
  const r16: TournamentTie[] = [];
  for (let i = 0; i < ids.length; i += 2) r16.push(blankTie(ids[i]!, ids[i + 1]!));
  return {
    rounds: [r16],
    currentRound: 0,
    status: 'IN_PROGRESS',
    startedAtIso: nowIso,
    rewardsGranted: false,
  };
}

function poisson(lambda: number, rng: () => number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rng(); } while (p > l && k < 8);
  return k - 1;
}

/** Simulate one non-user tie from the two clubs' real strengths. */
export function simulateTie(tie: TournamentTie, userTeamOvr: number, rng: () => number): TournamentTie {
  const sh = clubStrength(tie.homeClubId, userTeamOvr);
  const sa = clubStrength(tie.awayClubId, userTeamOvr);
  const expHome = Math.max(0.25, Math.min(3.4, 1.38 + (sh - sa) * 0.055));
  const expAway = Math.max(0.2, Math.min(3.2, 1.22 + (sa - sh) * 0.055));
  const homeGoals = poisson(expHome, rng);
  const awayGoals = poisson(expAway, rng);
  const done: TournamentTie = { ...tie, homeGoals, awayGoals };
  if (homeGoals !== awayGoals) {
    done.winnerClubId = homeGoals > awayGoals ? tie.homeClubId : tie.awayClubId;
    return done;
  }
  // Level after extra time → penalties, stronger side marginally favoured.
  const homeWinsPens = rng() < 0.5 + (sh - sa) * 0.012;
  const winnerPens = 4 + (rng() < 0.3 ? 1 : 0);
  const loserPens = Math.max(0, winnerPens - 1 - (rng() < 0.4 ? 1 : 0));
  done.pensHome = homeWinsPens ? winnerPens : loserPens;
  done.pensAway = homeWinsPens ? loserPens : winnerPens;
  done.winnerClubId = homeWinsPens ? tie.homeClubId : tie.awayClubId;
  return done;
}

export interface UserTieRef { roundIndex: number; tieIndex: number; tie: TournamentTie }

/** The user's next unplayed tie, or null when their cup is over. */
export function nextUserTie(state: TournamentState): UserTieRef | null {
  if (state.status !== 'IN_PROGRESS') return null;
  const round = state.rounds[state.currentRound];
  if (!round) return null;
  const tieIndex = round.findIndex((t) => t.isUserTie && t.winnerClubId === null);
  if (tieIndex < 0) return null;
  const tie = round[tieIndex];
  return tie ? { roundIndex: state.currentRound, tieIndex, tie } : null;
}

function cloneState(state: TournamentState): TournamentState {
  return {
    ...state,
    rounds: state.rounds.map((r) => r.map((t) => ({ ...t }))),
  };
}

function buildNextRound(state: TournamentState): void {
  const current = state.rounds[state.currentRound]!;
  const winners = current.map((t) => t.winnerClubId!);
  const next: TournamentTie[] = [];
  for (let i = 0; i < winners.length; i += 2) next.push(blankTie(winners[i]!, winners[i + 1]!));
  state.rounds.push(next);
  state.currentRound += 1;
}

/**
 * Record the user's live-played tie result, simulate the rest of the round,
 * and advance the bracket — all the way to a champion if the user goes out
 * (the bracket viewer always shows a complete, honest cup).
 */
export function recordUserTieResult(
  state: TournamentState,
  result: { homeGoals: number; awayGoals: number; pensHome: number | null; pensAway: number | null },
  userTeamOvr: number,
  rng: () => number,
): TournamentState {
  const next = cloneState(state);
  const ref = nextUserTie(next);
  if (!ref) return next;
  const tie = next.rounds[ref.roundIndex]![ref.tieIndex]!;
  tie.homeGoals = result.homeGoals;
  tie.awayGoals = result.awayGoals;
  tie.pensHome = result.pensHome;
  tie.pensAway = result.pensAway;
  tie.winnerClubId = result.homeGoals > result.awayGoals ? tie.homeClubId
    : result.awayGoals > result.homeGoals ? tie.awayClubId
      : (result.pensHome ?? 0) > (result.pensAway ?? 0) ? tie.homeClubId : tie.awayClubId;
  const userWon = tie.winnerClubId === USER_CLUB_ID;

  // Simulate the rest of this round.
  const round = next.rounds[ref.roundIndex]!;
  for (let i = 0; i < round.length; i += 1) {
    if (round[i]!.winnerClubId === null) round[i] = simulateTie(round[i]!, userTeamOvr, rng);
  }

  if (!userWon) {
    next.status = 'ELIMINATED';
    // Play the cup out so the bracket crowns its real champion.
    while (next.currentRound < 3) {
      buildNextRound(next);
      const r = next.rounds[next.currentRound]!;
      for (let i = 0; i < r.length; i += 1) r[i] = simulateTie(r[i]!, userTeamOvr, rng);
    }
    return next;
  }
  if (ref.roundIndex === 3) {
    next.status = 'CHAMPION';
    return next;
  }
  buildNextRound(next);
  return next;
}

/** The cup winner once the Final is decided. */
export function championOf(state: TournamentState): string | null {
  const final = state.rounds[3]?.[0];
  return final?.winnerClubId ?? null;
}

/**
 * The guaranteed Master Pack (90+) reward: the best MASTER-rarity card the
 * manager does not own yet (a duplicate of the very best if they own them
 * all — still a rank-up fodder card, granted as a fresh instance).
 */
export function championPackTemplate(profile: SaveProfile): PlayerTemplate | null {
  const owned = new Set(profile.inventory.map((c) => c.templateId));
  const masters = getAllPlayers()
    .filter((p) => p.rarity === 'MASTER')
    .sort((a, b) => b.baseOvr - a.baseOvr);
  return masters.find((p) => !owned.has(p.id)) ?? masters[0] ?? null;
}

// ---------------------------------------------------------------------------
// Verification lab — bracket integrity, club XIs, a full user cup run to the
// trophy, an elimination path, and the champion reward constants.
// ---------------------------------------------------------------------------

export interface TournamentLabResult {
  bracketOk: boolean;
  clubXiOk: boolean;
  championRunOk: boolean;
  eliminationOk: boolean;
  rewardsOk: boolean;
  detail: string;
}

export function runTournamentLab(starterProfile: SaveProfile): TournamentLabResult {
  const state = createTournament(2026, '2026-11-21T00:00:00.000Z');
  const clubIds = new Set(state.rounds[0]!.flatMap((t) => [t.homeClubId, t.awayClubId]));
  const bracketOk = state.rounds[0]!.length === 8 && clubIds.size === 16 && clubIds.has(USER_CLUB_ID)
    && nextUserTie(state) !== null;

  const xi = generateClubXI('dhaka_tigers');
  const clubXiOk = xi.length === 11 && xi.every((p) => p.clubId === 'dhaka_tigers')
    && new Set(xi.map((p) => p.id)).size === 11;

  // User wins every tie 2–0 → must lift the trophy in exactly 4 ties.
  let run = createTournament(777, '2026-11-21T00:00:00.000Z');
  const rng = mulberry32(31337);
  let tiesPlayed = 0;
  while (run.status === 'IN_PROGRESS' && tiesPlayed < 6) {
    const r = nextUserTie(run);
    if (!r) break;
    const homeWin = r.tie.homeClubId === USER_CLUB_ID;
    run = recordUserTieResult(
      run,
      homeWin ? { homeGoals: 2, awayGoals: 0, pensHome: null, pensAway: null }
        : { homeGoals: 0, awayGoals: 2, pensHome: null, pensAway: null },
      80, rng,
    );
    tiesPlayed += 1;
  }
  const championRunOk = run.status === 'CHAMPION' && tiesPlayed === 4
    && championOf(run) === USER_CLUB_ID && run.rounds.length === 4;

  // User loses the R16 tie → eliminated, but the bracket still completes.
  let out = createTournament(555, '2026-11-21T00:00:00.000Z');
  const ref = nextUserTie(out)!;
  const userIsHome = ref.tie.homeClubId === USER_CLUB_ID;
  out = recordUserTieResult(
    out,
    userIsHome ? { homeGoals: 0, awayGoals: 3, pensHome: null, pensAway: null }
      : { homeGoals: 3, awayGoals: 0, pensHome: null, pensAway: null },
    80, mulberry32(999),
  );
  const eliminationOk = out.status === 'ELIMINATED' && championOf(out) !== null && championOf(out) !== USER_CLUB_ID;

  const pack = championPackTemplate(starterProfile);
  const rewardsOk = CHAMPION_COINS === 25000 && CHAMPION_GEMS === 500
    && pack !== null && pack.rarity === 'MASTER' && pack.baseOvr >= 90;

  return {
    bracketOk, clubXiOk, championRunOk, eliminationOk, rewardsOk,
    detail: `16 clubs drawn · Dhaka XI all-club · 4 wins → CHAMPION · pack card: ${pack?.name ?? '—'} ${pack?.baseOvr ?? ''} ${pack?.rarity ?? ''}`,
  };
}
