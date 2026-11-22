// Striker FC — modes/HeadToHeadMode.ts (Phase 08, Blueprint 08 §3 Mode 1)
// Division Rivals ladder: 15 tiers from Amateur III to FC Champion, an
// OVR-matched AI Ultimate Team opponent generator, star promotion/relegation
// and the coin/gem payout calculator. Everything here is a pure function of
// the SaveProfile + match outcome — the App wires the winner into the real
// MatchEngine and persists the settlement through commitProfile.

import { mulberry32 } from '../core/math';
import type { Difficulty, OwnedPlayerCard, PlayerTemplate, SaveProfile } from '../core/types';
import { calculateTeamOvr, getSlotEffectiveOvr } from '../core/types';
import { getAllPlayers } from '../data/PlayerDatabase';
import { ALL_CLUBS, getClubTeam } from '../data/Clubs';
import { getFormationById } from '../data/Formations';
import type { ModeRewardGrant } from './ModeRewards';

export interface DivisionTier {
  /** 0-based ladder index (0 = Amateur III … 14 = FC Champion). */
  index: number;
  name: string;
}

export const DIVISIONS: DivisionTier[] = [
  'Amateur III', 'Amateur II', 'Amateur I',
  'Semi-Pro III', 'Semi-Pro II', 'Semi-Pro I',
  'Pro III', 'Pro II', 'Pro I',
  'World Class III', 'World Class II', 'World Class I',
  'Legendary II', 'Legendary I',
  'FC Champion',
].map((name, index) => ({ index, name }));

export const STARS_TO_PROMOTE = 5;

/** The profile stores the division 1-based (1 = Amateur III … 15 = FC Champion). */
export function divisionIndexOf(profile: SaveProfile): number {
  return Math.max(0, Math.min(DIVISIONS.length - 1, profile.h2hDivision - 1));
}

export function divisionName(division1Based: number): string {
  const idx = Math.max(0, Math.min(DIVISIONS.length - 1, division1Based - 1));
  return DIVISIONS[idx]?.name ?? 'Amateur III';
}

/** Difficulty scales with the division across the full 7-tier ladder:
 *  the foot of the ladder teaches, the summit demands Ultimate AI. */
export function h2hDifficultyFor(divisionIndex0: number): Difficulty {
  if (divisionIndex0 <= 1) return 'BEGINNER';
  if (divisionIndex0 <= 3) return 'AMATEUR';
  if (divisionIndex0 <= 5) return 'SEMI_PRO';
  if (divisionIndex0 <= 7) return 'PROFESSIONAL';
  if (divisionIndex0 <= 10) return 'WORLD_CLASS';
  if (divisionIndex0 <= 12) return 'LEGENDARY';
  return 'ULTIMATE';
}

/**
 * Opponent strength: at the ladder's foot the AI fields a side a few OVR
 * below you (learn the mode), at the summit a few above (earn the crown).
 */
export function opponentTargetOvr(userTeamOvr: number, divisionIndex0: number): number {
  const delta = -5 + Math.round((divisionIndex0 / (DIVISIONS.length - 1)) * 12);
  return Math.max(62, Math.min(96, userTeamOvr + delta));
}

export interface H2hOpponent {
  clubName: string;
  clubAbbr: string;
  primary: string;
  secondary: string;
  templates: PlayerTemplate[];
  teamOvr: number;
  difficulty: Difficulty;
  targetOvr: number;
}

const RANK0_CARD: OwnedPlayerCard = {
  instanceId: 'h2h-opponent',
  templateId: '',
  trainingLevel: 0,
  trainingXp: 0,
  rank: 0,
  skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
  locked: false,
};

/**
 * Assemble an AI Ultimate Team: for every formation slot, the unused database
 * player whose OVR sits closest to the slot target (exact position first,
 * then alternates, then same-group cover). Deterministic for a given seed.
 */
export function generateH2hOpponent(
  userTeamOvr: number,
  division1Based: number,
  rng: () => number,
  formationId = '4-3-3-attack',
): H2hOpponent {
  const idx0 = Math.max(0, Math.min(DIVISIONS.length - 1, division1Based - 1));
  const target = opponentTargetOvr(userTeamOvr, idx0);
  const formation = getFormationById(formationId) ?? getFormationById('4-3-3-attack')!;
  const pool = getAllPlayers();
  const used = new Set<string>();
  const templates: PlayerTemplate[] = [];
  const slotOvrs: number[] = [];
  for (const slot of formation.slots) {
    const slotTarget = target + Math.round((rng() - 0.5) * 4);
    let best: PlayerTemplate | null = null;
    let bestScore = Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const posPenalty = p.position === slot.role ? 0
        : p.altPositions.includes(slot.role) ? 30
        : 90;
      const score = Math.abs(p.baseOvr - slotTarget) * 10 + posPenalty + rng() * 4;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (!best) break;
    used.add(best.id);
    templates.push(best);
    slotOvrs.push(getSlotEffectiveOvr(best, RANK0_CARD, slot.role));
  }
  const club = ALL_CLUBS[Math.floor(rng() * ALL_CLUBS.length)] ?? ALL_CLUBS[0]!;
  return {
    clubName: `${club.name} Rivals`,
    clubAbbr: club.abbr,
    primary: club.primary,
    secondary: club.secondary,
    templates,
    teamOvr: calculateTeamOvr(slotOvrs, slotOvrs.map(() => 0)),
    difficulty: h2hDifficultyFor(idx0),
    targetOvr: target,
  };
}

export type H2hOutcome = 'WIN' | 'DRAW' | 'LOSS';

export interface H2hSettlement {
  outcome: H2hOutcome;
  divisionBefore: number;
  divisionAfter: number;
  starsBefore: number;
  starsAfter: number;
  promoted: boolean;
  relegated: boolean;
  grant: ModeRewardGrant;
}

/** Win coins scale 2,500 (Amateur III) → 8,000 (FC Champion); spec §3. */
export function h2hWinCoins(divisionIndex0: number): number {
  return 2500 + Math.round((5500 * divisionIndex0) / (DIVISIONS.length - 1));
}

export function settleH2h(profile: SaveProfile, outcome: H2hOutcome): H2hSettlement {
  const idx0 = divisionIndexOf(profile);
  const divisionBefore = idx0 + 1;
  const starsBefore = Math.max(0, Math.min(STARS_TO_PROMOTE, profile.h2hStars));
  let divisionAfter = divisionBefore;
  let starsAfter = starsBefore;
  let promoted = false;
  let relegated = false;
  let gems = 0;

  if (outcome === 'WIN') {
    starsAfter = starsBefore + 1;
    if (starsAfter >= STARS_TO_PROMOTE) {
      if (divisionAfter < DIVISIONS.length) {
        divisionAfter += 1;
        starsAfter = 0;
        promoted = true;
        gems = 30 + idx0 * 5; // promotion bonus, paid in gems
      } else {
        starsAfter = STARS_TO_PROMOTE; // FC Champion holds at 5 stars
      }
    }
  } else if (outcome === 'LOSS') {
    starsAfter = starsBefore - 1;
    if (starsAfter < 0) {
      if (divisionAfter > 1) {
        divisionAfter -= 1;
        starsAfter = 3;
        relegated = true;
      } else {
        starsAfter = 0; // safe floor at Amateur III
      }
    }
  }

  const grant: ModeRewardGrant = {
    coins: outcome === 'WIN' ? h2hWinCoins(idx0) : outcome === 'DRAW' ? 1000 : 400,
    gems,
    xp: outcome === 'WIN' ? 300 : outcome === 'DRAW' ? 150 : 100,
    trainingXp: outcome === 'WIN' ? 150 : outcome === 'DRAW' ? 75 : 50,
    fans: 0,
  };
  return {
    outcome,
    divisionBefore, divisionAfter,
    starsBefore, starsAfter,
    promoted, relegated,
    grant,
  };
}

/** Apply a settlement's ladder movement to a profile (currency goes through ModeRewards). */
export function applyH2hSettlement(profile: SaveProfile, s: H2hSettlement): SaveProfile {
  return { ...profile, h2hDivision: s.divisionAfter, h2hStars: s.starsAfter };
}

// ---------- 28-day season (Epic fix round, P1-14) ---------------------------------

/** One H2H season lasts 28 days, then the ladder resets. */
export const H2H_SEASON_DAYS = 28;
/** Divisions dropped at a season reset. */
export const H2H_SEASON_DROP = 5;

export interface H2hSeasonRollover {
  /** The division (1-based) the finished season ended in. */
  finishedDivision: number;
  /** The division (1-based) the new season starts in. */
  newDivision: number;
  /** Season-end rewards for the finished division. */
  grant: ModeRewardGrant;
}

/** Season-end reward table: finishing higher pays more. */
export function h2hSeasonRewards(division1Based: number): ModeRewardGrant {
  const idx0 = Math.max(0, Math.min(DIVISIONS.length - 1, division1Based - 1));
  return {
    coins: 3000 + idx0 * 1200,
    gems: 20 + idx0 * 10,
    xp: 500 + idx0 * 100,
    trainingXp: 300 + idx0 * 60,
    fans: 0,
  };
}

export function currentH2hSeasonId(nowMs: number): number {
  return Math.floor(nowMs / (H2H_SEASON_DAYS * 86_400_000));
}

/**
 * Ensure the profile's season clock is live. When the stored season has
 * expired, this returns the rolled-over profile (drop 5 divisions, stars
 * reset) plus the season-end rewards to pay; otherwise it returns the
 * profile with a fresh clock stamped and no rollover.
 */
export function ensureH2hSeason(
  profile: SaveProfile,
  nowMs: number,
): { profile: SaveProfile; rollover: H2hSeasonRollover | null } {
  const seasonId = currentH2hSeasonId(nowMs);
  const stored = profile.h2hSeason;
  if (stored && stored.seasonId === seasonId && stored.endsAtMs > nowMs) {
    return { profile, rollover: null };
  }
  const endsAtMs = (seasonId + 1) * H2H_SEASON_DAYS * 86_400_000;
  if (!stored) {
    return { profile: { ...profile, h2hSeason: { seasonId, endsAtMs } }, rollover: null };
  }
  // Season over: pay out for the finished division, then drop 5.
  const finishedDivision = Math.max(1, Math.min(DIVISIONS.length, profile.h2hDivision));
  const newDivision = Math.max(1, finishedDivision - H2H_SEASON_DROP);
  return {
    profile: {
      ...profile,
      h2hDivision: newDivision,
      h2hStars: 0,
      h2hSeason: { seasonId, endsAtMs },
    },
    rollover: {
      finishedDivision,
      newDivision,
      grant: h2hSeasonRewards(finishedDivision),
    },
  };
}

/** Whole days left in the current season (for the Play Modes card). */
export function h2hSeasonDaysLeft(profile: SaveProfile, nowMs: number): number {
  const endsAt = profile.h2hSeason?.endsAtMs ?? (currentH2hSeasonId(nowMs) + 1) * H2H_SEASON_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((endsAt - nowMs) / 86_400_000));
}

/**
 * An H2H opponent that fields a real club's ACTUAL best XI (P1-14): pick a
 * club (never the excluded one — the user's own / Play-As club), take its
 * ClubTeam XI verbatim, and set the difficulty from the user's division.
 */
export function clubH2hOpponent(
  clubId: string,
  division1Based: number,
): H2hOpponent | null {
  const team = getClubTeam(clubId);
  if (!team || team.xi.length !== 11) return null;
  const idx0 = Math.max(0, Math.min(DIVISIONS.length - 1, division1Based - 1));
  return {
    clubName: team.club.name,
    clubAbbr: team.club.abbr,
    primary: team.club.primary,
    secondary: team.club.secondary,
    templates: team.xi,
    teamOvr: team.teamOvr,
    difficulty: h2hDifficultyFor(idx0),
    targetOvr: team.teamOvr,
  };
}

/** Pick a random club (not the excluded one) and field its actual XI. */
export function randomClubH2hOpponent(
  division1Based: number,
  rng: () => number,
  excludeClubId?: string | null,
): H2hOpponent | null {
  const pool = ALL_CLUBS.filter((c) => c.id !== excludeClubId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const club = pool[Math.floor(rng() * pool.length)];
    if (!club) break;
    const opp = clubH2hOpponent(club.id, division1Based);
    if (opp) return opp;
  }
  return null;
}

export interface H2hSeasonLabResult {
  seasonOk: boolean;
  rolloverOk: boolean;
  clubXiOk: boolean;
  detail: string;
}

/** Deterministic checks of the season clock, the reset and club-XI opponents. */
export function runH2hSeasonLab(): H2hSeasonLabResult {
  const dayMs = 86_400_000;
  const t0 = 40 * H2H_SEASON_DAYS * dayMs + 5 * dayMs; // inside season 40
  const fresh = ensureH2hSeason({ h2hDivision: 12, h2hStars: 3 } as SaveProfile, t0);
  const seasonOk = fresh.rollover === null
    && fresh.profile.h2hSeason?.seasonId === 40
    && h2hSeasonDaysLeft(fresh.profile, t0) === H2H_SEASON_DAYS - 5;
  const later = ensureH2hSeason(fresh.profile, t0 + 30 * dayMs); // season 41
  const rolloverOk = later.rollover !== null
    && later.rollover.finishedDivision === 12
    && later.rollover.newDivision === 12 - H2H_SEASON_DROP
    && later.profile.h2hDivision === 7
    && later.profile.h2hStars === 0
    && later.rollover.grant.coins === h2hSeasonRewards(12).coins;
  const opp = clubH2hOpponent('real_madrid', 10);
  const madrid = getClubTeam('real_madrid');
  const clubXiOk = opp !== null && madrid !== null
    && opp.templates.length === 11
    && opp.templates.every((t, i) => t.id === madrid.xi[i]?.id)
    && opp.clubName === 'Real Madrid';
  return {
    seasonOk, rolloverOk, clubXiOk,
    detail: `28-day seasons · reset drops ${H2H_SEASON_DROP} divisions (12 → 7) with end-of-season rewards · H2H opponents field the club's actual XI (Real Madrid verified)`,
  };
}

// ---------------------------------------------------------------------------
// Verification lab — ladder integrity, payout curve, opponent generator and
// every star transition, all through the real functions above.
// ---------------------------------------------------------------------------

export interface H2hLabResult {
  ladderOk: boolean;
  payoutOk: boolean;
  opponentOk: boolean;
  opponentLowOvr: number;
  opponentHighOvr: number;
  transitionsOk: boolean;
  detail: string;
}

export function runH2hLab(): H2hLabResult {
  const ladderOk = DIVISIONS.length === 15
    && DIVISIONS[0]?.name === 'Amateur III'
    && DIVISIONS[14]?.name === 'FC Champion';
  const payoutOk = h2hWinCoins(0) === 2500 && h2hWinCoins(14) === 8000
    && DIVISIONS.every((_, i) => i === 0 || h2hWinCoins(i) > h2hWinCoins(i - 1));

  const rngLow = mulberry32(808);
  const low = generateH2hOpponent(78, 1, rngLow);
  const rngHigh = mulberry32(809);
  const high = generateH2hOpponent(78, 15, rngHigh);
  const unique = new Set(low.templates.map((t) => t.id)).size === 11
    && new Set(high.templates.map((t) => t.id)).size === 11;
  const opponentOk = unique
    && low.templates.length === 11 && high.templates.length === 11
    && Math.abs(low.teamOvr - low.targetOvr) <= 4
    && Math.abs(high.teamOvr - high.targetOvr) <= 4
    && high.teamOvr > low.teamOvr
    && low.difficulty === 'BEGINNER' && high.difficulty === 'ULTIMATE';

  const base = { h2hDivision: 3, h2hStars: 4 } as SaveProfile;
  const promo = settleH2h(base, 'WIN');
  const floor = settleH2h({ h2hDivision: 1, h2hStars: 0 } as SaveProfile, 'LOSS');
  const drop = settleH2h({ h2hDivision: 5, h2hStars: 0 } as SaveProfile, 'LOSS');
  const draw = settleH2h({ h2hDivision: 5, h2hStars: 2 } as SaveProfile, 'DRAW');
  const transitionsOk = promo.promoted && promo.divisionAfter === 4 && promo.starsAfter === 0 && promo.grant.gems > 0
    && !floor.relegated && floor.divisionAfter === 1 && floor.starsAfter === 0
    && drop.relegated && drop.divisionAfter === 4 && drop.starsAfter === 3
    && draw.starsAfter === 2 && draw.grant.coins === 1000;

  return {
    ladderOk, payoutOk, opponentOk,
    opponentLowOvr: low.teamOvr,
    opponentHighOvr: high.teamOvr,
    transitionsOk,
    detail: `Amateur III opp ${low.teamOvr} OVR (${low.difficulty}) · FC Champion opp ${high.teamOvr} OVR (${high.difficulty}) · win pays 2,500→8,000 coins up the ladder`,
  };
}
