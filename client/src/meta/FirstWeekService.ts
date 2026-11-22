// Striker FC — meta/FirstWeekService.ts (Addendum 1: onboarding chain)
// The Day 1–7 first-week quest chain: one objective per club day, each
// reading REAL profile signals (matches played, packs opened, training,
// wins, mode bests, Star Pass tier). Claiming pays coins; Day 7 pays a
// guaranteed Gold-or-better pack rolled through the real pack service.

import { mulberry32 } from '../core/math';
import type { SaveProfile } from '../core/types';
import { getPackById } from '../data/PacksAndQuests';
import { rollPackCards } from './PackService';
import { seasonPassTierReached } from './QuestService';

export interface FirstWeekDay {
  day: number;
  title: string;
  hint: string;
  coins: number;
  done: (p: SaveProfile) => boolean;
  progress: (p: SaveProfile) => { current: number; target: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const FIRST_WEEK: FirstWeekDay[] = [
  {
    day: 1, title: 'Play your first match', hint: 'Any full match from the Play menu counts.', coins: 1000,
    done: (p) => (p.matchesPlayed ?? 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.matchesPlayed ?? 0), target: 1 }),
  },
  {
    day: 2, title: 'Open a pack', hint: 'The Daily Free Pack in the Store counts.', coins: 1500,
    done: (p) => (p.packsOpened ?? 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.packsOpened ?? 0), target: 1 }),
  },
  {
    day: 3, title: 'Train a player', hint: 'Open a player card and spend Training XP.', coins: 2000,
    done: (p) => p.inventory.some((c) => c.trainingLevel >= 1),
    progress: (p) => ({ current: p.inventory.some((c) => c.trainingLevel >= 1) ? 1 : 0, target: 1 }),
  },
  {
    day: 4, title: 'Win a match', hint: 'Friendlies count — pick a side you can beat.', coins: 2500,
    done: (p) => (p.matchesWon ?? 0) >= 1,
    progress: (p) => ({ current: Math.min(1, p.matchesWon ?? 0), target: 1 }),
  },
  {
    day: 5, title: 'Try Attack or Defend Mode', hint: 'Score in Attack Mode or hold a wave in Defend Mode.', coins: 3000,
    done: (p) => (p.attackBest ?? 0) > 0 || (p.defendBest ?? 0) > 0,
    progress: (p) => ({ current: (p.attackBest ?? 0) > 0 || (p.defendBest ?? 0) > 0 ? 1 : 0, target: 1 }),
  },
  {
    day: 6, title: 'Score 5 goals', hint: 'Goals in any mode add up across the week.', coins: 4000,
    done: (p) => (p.goalsScoredTotal ?? 0) >= 5,
    progress: (p) => ({ current: Math.min(5, p.goalsScoredTotal ?? 0), target: 5 }),
  },
  {
    day: 7, title: 'Reach Star Pass Tier 3', hint: 'Match XP climbs the pass — then claim the Gold+ pack.', coins: 5000,
    done: (p) => seasonPassTierReached(p) >= 3,
    progress: (p) => ({ current: Math.min(3, seasonPassTierReached(p)), target: 3 }),
  },
];

/** Which club day is it? Day 1 starts at club creation. */
export function firstWeekDay(profile: SaveProfile, nowMs: number): number {
  const anchor = profile.clubCreatedAtIso ?? profile.lastDailyResetIso;
  const start = Date.parse(anchor);
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.floor((nowMs - start) / DAY_MS) + 1);
}

export type FirstWeekStatus = 'CLAIMED' | 'CLAIMABLE' | 'LOCKED' | 'ACTIVE';

export function firstWeekStatus(profile: SaveProfile, day: FirstWeekDay, nowMs: number): FirstWeekStatus {
  if ((profile.firstWeekClaimed ?? []).includes(day.day)) return 'CLAIMED';
  const today = firstWeekDay(profile, nowMs);
  if (day.day > today) return 'LOCKED';
  return day.done(profile) ? 'CLAIMABLE' : 'ACTIVE';
}

/** Claim a finished day. Day 7 also rolls the guaranteed Gold+ pack. */
export function claimFirstWeekDay(
  profile: SaveProfile,
  dayNumber: number,
  nowMs: number,
): { profile: SaveProfile; coins: number; packNames: string[]; error: string | null } {
  const day = FIRST_WEEK.find((d) => d.day === dayNumber);
  if (!day) return { profile, coins: 0, packNames: [], error: 'That day does not exist.' };
  const status = firstWeekStatus(profile, day, nowMs);
  if (status === 'CLAIMED') return { profile, coins: 0, packNames: [], error: 'Already claimed.' };
  if (status === 'LOCKED') return { profile, coins: 0, packNames: [], error: 'That day has not arrived yet.' };
  if (status === 'ACTIVE') return { profile, coins: 0, packNames: [], error: 'Objective not finished yet.' };
  let next: SaveProfile = {
    ...profile,
    coins: profile.coins + day.coins,
    firstWeekClaimed: [...(profile.firstWeekClaimed ?? []), day.day],
  };
  let packNames: string[] = [];
  if (day.day === 7) {
    const base = getPackById('gold_pro');
    if (base) {
      const grantPack = { ...base, guaranteedMinRarity: 'GOLD' as const };
      const pulls = rollPackCards(grantPack, mulberry32(nowMs & 0xffff), nowMs);
      next = { ...next, inventory: [...next.inventory, ...pulls.map((p) => p.card)] };
      packNames = pulls.map((p) => p.template.name);
    }
  }
  return { profile: next, coins: day.coins, packNames, error: null };
}
