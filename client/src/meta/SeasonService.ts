// Striker FC — meta/SeasonService.ts (Addendum 3: live service)
// The live-service clock: 28-day Star Pass seasons counted from a fixed
// epoch, a rotating featured pack, and the 30-day login calendar's
// milestone packs. Everything derives from the wall clock, so seasons
// roll identically on every device with no server round-trip.

import { mulberry32 } from '../core/math';
import type { PackDef, SaveProfile } from '../core/types';
import { getPackById } from '../data/PacksAndQuests';
import { rollPackCards } from './PackService';

export const SEASON_LENGTH_MS = 28 * 24 * 60 * 60 * 1000;
/** Season 1 kicked off Monday 2025-01-06 00:00 UTC. */
export const SEASON_EPOCH_MS = Date.UTC(2025, 0, 6);
export const STAR_PASS_PREMIUM_GEMS = 400;

export interface SeasonInfo {
  id: number;
  startMs: number;
  endMs: number;
  daysLeft: number;
}

export function currentSeason(nowMs: number): SeasonInfo {
  const elapsed = Math.max(0, nowMs - SEASON_EPOCH_MS);
  const id = Math.floor(elapsed / SEASON_LENGTH_MS) + 1;
  const startMs = SEASON_EPOCH_MS + (id - 1) * SEASON_LENGTH_MS;
  const endMs = startMs + SEASON_LENGTH_MS;
  return { id, startMs, endMs, daysLeft: Math.max(0, Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000))) };
}

/**
 * Roll the Star Pass into the current season when the profile's pass
 * belongs to an older one: XP and both claimed lists reset, premium
 * expires (it is per-season), everything else about the club is kept.
 * Returns the same object when no roll is due.
 */
export function rollSeasonPassIfNeeded(profile: SaveProfile, nowMs: number): SaveProfile {
  const season = currentSeason(nowMs);
  if ((profile.seasonPassSeasonId ?? season.id) === season.id && profile.seasonPassSeasonId !== undefined) return profile;
  if (profile.seasonPassSeasonId === undefined) {
    // First sight of the season system: adopt the current season WITHOUT
    // wiping the progress the manager already earned.
    return { ...profile, seasonPassSeasonId: season.id };
  }
  return {
    ...profile,
    seasonPassSeasonId: season.id,
    seasonPassXp: 0,
    seasonPassClaimedTiers: [],
    seasonPassPremiumClaimedTiers: [],
    seasonPassPremium: false,
  };
}

export function buyStarPassPremium(profile: SaveProfile): { profile: SaveProfile; error: string | null } {
  if (profile.seasonPassPremium) return { profile, error: 'Premium is already active for this season.' };
  if (profile.gems < STAR_PASS_PREMIUM_GEMS) {
    return { profile, error: `Star Pass Premium costs ${STAR_PASS_PREMIUM_GEMS} gems — you have ${profile.gems}.` };
  }
  return { profile: { ...profile, gems: profile.gems - STAR_PASS_PREMIUM_GEMS, seasonPassPremium: true }, error: null };
}

// ---------- Rotating featured pack --------------------------------------------------

const FEATURED_ROTATION = ['elite_attack', 'gold_pro', 'master_vault', 'elite_attack', 'gold_pro', 'master_vault'];

export interface FeaturedPack {
  pack: PackDef;
  endsMs: number;
  daysLeft: number;
}

/** One featured pack at a time, rotating weekly, with a hard expiry. */
export function currentFeaturedPack(nowMs: number): FeaturedPack | null {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor(Math.max(0, nowMs - SEASON_EPOCH_MS) / WEEK_MS);
  const pack = getPackById(FEATURED_ROTATION[week % FEATURED_ROTATION.length] ?? 'gold_pro');
  if (!pack) return null;
  const endsMs = SEASON_EPOCH_MS + (week + 1) * WEEK_MS;
  return { pack, endsMs, daysLeft: Math.max(0, Math.ceil((endsMs - nowMs) / (24 * 60 * 60 * 1000))) };
}

// ---------- 30-day login calendar milestones -----------------------------------------

export interface LoginMilestone {
  day: number;
  packId: string;
  label: string;
}

export const LOGIN_MILESTONES: LoginMilestone[] = [
  { day: 7, packId: 'gold_pro', label: 'Day 7 · Gold Pro Pack' },
  { day: 14, packId: 'elite_attack', label: 'Day 14 · Elite Attack Pack' },
  { day: 21, packId: 'elite_attack', label: 'Day 21 · Elite Attack Pack' },
  { day: 30, packId: 'master_vault', label: 'Day 30 · Master Vault' },
];

/** Total login days banked = best streak the daily-reward state has seen
 *  plus full cycles already completed (tracked on the reward state). */
export function loginDayCount(profile: SaveProfile): number {
  const dr = profile.dailyReward as { totalClaims?: number } | null;
  return dr?.totalClaims ?? 0;
}

export function claimLoginMilestone(
  profile: SaveProfile,
  day: number,
  nowMs: number,
): { profile: SaveProfile; packNames: string[]; error: string | null } {
  const milestone = LOGIN_MILESTONES.find((m) => m.day === day);
  if (!milestone) return { profile, packNames: [], error: 'That milestone does not exist.' };
  if ((profile.loginMilestonesClaimed ?? []).includes(day)) return { profile, packNames: [], error: 'Milestone already claimed.' };
  if (loginDayCount(profile) < day) {
    return { profile, packNames: [], error: `Log in on ${day} different days first — you are at ${loginDayCount(profile)}.` };
  }
  const pack = getPackById(milestone.packId);
  if (!pack) return { profile, packNames: [], error: 'That pack is unavailable right now.' };
  const pulls = rollPackCards(pack, mulberry32((nowMs & 0xffff) ^ day * 131), nowMs);
  return {
    profile: {
      ...profile,
      inventory: [...profile.inventory, ...pulls.map((p) => p.card)],
      loginMilestonesClaimed: [...(profile.loginMilestonesClaimed ?? []), day],
    },
    packNames: pulls.map((p) => p.template.name),
    error: null,
  };
}
