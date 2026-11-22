// Striker FC — meta/DailyRewardService.ts (Lobby redesign, Cycle-2: 30-day)
// The 30-day login calendar on the Lobby: one claim per UTC day, paid for
// real into the wallet through the normal commit path. Claiming on
// consecutive days advances the streak through a 30-day calendar — Day 8
// pays Day 8 (it does NOT wrap to Day 1); only after Day 30 does a fresh
// calendar begin. Milestone days 7 / 14 / 21 / 30 also grant a pack
// (Day 30 = the Master Vault, guaranteed Elite+ — its floor is MASTER).
// Missing a day restarts the streak at Day 1. Pure profile transforms,
// like every other economy service — the caller persists through
// commitProfile.

import { mulberry32 } from '../core/math';
import type { DailyRewardState, SaveProfile } from '../core/types';
import { getPackById } from '../data/PacksAndQuests';
import { rollPackCards } from './PackService';

export interface DailyRewardDef {
  day: number;
  coins: number;
  gems: number;
  /** Pack granted on top of the currency on milestone days. */
  packId?: string;
}

/** The 30-day calendar. Coins climb steadily; gems land every few days;
 *  milestone packs sit on 7 / 14 / 21 / 30. */
export const DAILY_REWARDS: DailyRewardDef[] = [
  { day: 1, coins: 500, gems: 0 },
  { day: 2, coins: 750, gems: 0 },
  { day: 3, coins: 1000, gems: 5 },
  { day: 4, coins: 1250, gems: 0 },
  { day: 5, coins: 1500, gems: 10 },
  { day: 6, coins: 2000, gems: 0 },
  { day: 7, coins: 3000, gems: 15, packId: 'gold_pro' },
  { day: 8, coins: 2250, gems: 0 },
  { day: 9, coins: 2500, gems: 5 },
  { day: 10, coins: 2750, gems: 0 },
  { day: 11, coins: 3000, gems: 10 },
  { day: 12, coins: 3250, gems: 0 },
  { day: 13, coins: 3500, gems: 15 },
  { day: 14, coins: 4000, gems: 20, packId: 'elite_attack' },
  { day: 15, coins: 3750, gems: 0 },
  { day: 16, coins: 4000, gems: 5 },
  { day: 17, coins: 4250, gems: 0 },
  { day: 18, coins: 4500, gems: 10 },
  { day: 19, coins: 4750, gems: 0 },
  { day: 20, coins: 5000, gems: 15 },
  { day: 21, coins: 6000, gems: 25, packId: 'elite_attack' },
  { day: 22, coins: 5250, gems: 0 },
  { day: 23, coins: 5500, gems: 10 },
  { day: 24, coins: 5750, gems: 0 },
  { day: 25, coins: 6000, gems: 15 },
  { day: 26, coins: 6250, gems: 0 },
  { day: 27, coins: 6500, gems: 20 },
  { day: 28, coins: 6750, gems: 0 },
  { day: 29, coins: 7000, gems: 25 },
  { day: 30, coins: 10000, gems: 50, packId: 'master_vault' },
];

export const DAILY_CALENDAR_DAYS = DAILY_REWARDS.length; // 30
export const MILESTONE_DAYS = DAILY_REWARDS.filter((r) => r.packId).map((r) => r.day);

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The calendar day (1–30) a given streak count lands on. */
export function calendarDayForStreak(streak: number): number {
  if (streak <= 0) return 1;
  return ((streak - 1) % DAILY_CALENDAR_DAYS) + 1;
}

export function dailyRewardStateOf(profile: SaveProfile): DailyRewardState | null {
  return profile.dailyReward ?? null;
}

export interface DailyRewardStatus {
  /** True when today's reward can be claimed right now. */
  canClaim: boolean;
  /** True when today's reward was already claimed. */
  claimedToday: boolean;
  /** Current consecutive-day streak (0 before the first claim). */
  streak: number;
  /** The calendar day (1–30) the next claim will pay. */
  nextDay: number;
  /** The reward the next claim will pay. */
  nextReward: DailyRewardDef;
  /** The calendar day (1–30) of the most recent claim (0 = none yet). */
  lastClaimedDay: number;
}

/** Where the calendar stands right now: streak, calendar day, claimability. */
export function dailyRewardStatus(profile: SaveProfile, nowMs: number): DailyRewardStatus {
  const state = dailyRewardStateOf(profile);
  const fallback = DAILY_REWARDS[0]!;
  if (!state) {
    return { canClaim: true, claimedToday: false, streak: 0, nextDay: 1, nextReward: fallback, lastClaimedDay: 0 };
  }
  const last = Date.parse(state.lastClaimIso);
  if (!Number.isFinite(last)) {
    return { canClaim: true, claimedToday: false, streak: 0, nextDay: 1, nextReward: fallback, lastClaimedDay: 0 };
  }
  const today = utcDayStart(nowMs);
  const lastDay = utcDayStart(last);
  const claimedDay = calendarDayForStreak(state.streak);
  if (lastDay === today) {
    const nextDay = calendarDayForStreak(state.streak + 1);
    return {
      canClaim: false, claimedToday: true, streak: state.streak,
      nextDay, nextReward: DAILY_REWARDS[nextDay - 1] ?? fallback, lastClaimedDay: claimedDay,
    };
  }
  if (lastDay === today - DAY_MS) {
    // Yesterday claimed: the streak continues to the next calendar day —
    // Day 7 → Day 8, Day 29 → Day 30, Day 30 → a fresh calendar's Day 1.
    const nextDay = calendarDayForStreak(state.streak + 1);
    return {
      canClaim: true, claimedToday: false, streak: state.streak,
      nextDay, nextReward: DAILY_REWARDS[nextDay - 1] ?? fallback, lastClaimedDay: claimedDay,
    };
  }
  // A day (or more) was missed: the streak restarts at Day 1.
  return { canClaim: true, claimedToday: false, streak: state.streak, nextDay: 1, nextReward: fallback, lastClaimedDay: 0 };
}

export interface DailyClaimResult {
  profile: SaveProfile;
  reward: DailyRewardDef | null;
  /** Player names pulled from the milestone pack, when this claim had one. */
  packNames: string[];
  error: string | null;
}

/** Claim today's reward: credits Coins/Gems, advances the streak, and on
 *  milestone days rolls the milestone pack straight into the inventory. */
export function claimDailyReward(profile: SaveProfile, nowMs: number): DailyClaimResult {
  const status = dailyRewardStatus(profile, nowMs);
  if (!status.canClaim) {
    return { profile, reward: null, packNames: [], error: 'Today\'s reward is already claimed — the next one unlocks at the daily reset.' };
  }
  const reward = status.nextReward;
  const state = dailyRewardStateOf(profile);
  const last = state ? Date.parse(state.lastClaimIso) : NaN;
  const consecutive = state !== null && Number.isFinite(last)
    && utcDayStart(last) === utcDayStart(nowMs) - DAY_MS;
  const streak = consecutive ? (state?.streak ?? 0) + 1 : 1;

  let next: SaveProfile = {
    ...profile,
    coins: profile.coins + reward.coins,
    gems: profile.gems + reward.gems,
    dailyReward: {
      streak,
      lastClaimIso: new Date(nowMs).toISOString(),
      totalClaims: (state?.totalClaims ?? 0) + 1,
    },
  };
  // Milestone pack: rolled with the same PackService path the Store uses
  // (Day 30's Master Vault guarantees MASTER on its first card — Elite+).
  let packNames: string[] = [];
  if (reward.packId) {
    const pack = getPackById(reward.packId);
    if (pack) {
      const pulls = rollPackCards(pack, mulberry32((nowMs & 0xffff) ^ reward.day * 977), nowMs);
      packNames = pulls.map((p) => p.template.name);
      next = {
        ...next,
        inventory: [...next.inventory, ...pulls.map((p) => p.card)],
        loginMilestonesClaimed: [...new Set([...(next.loginMilestonesClaimed ?? []), reward.day])],
      };
    }
  }
  return { profile: next, reward, packNames, error: null };
}

// ---------- Verification lab --------------------------------------------------------

export interface DailyRewardLabResult {
  ok: boolean;
  cycleOk: boolean;
  detail: string;
}

function labProfile(): SaveProfile {
  return {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 1000, gems: 10, rankUpTokens: 0, trainingXpPool: 0,
    inventory: [], activeFormationId: '4-3-3-attack',
    startingXI: Array(11).fill(null), substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(0).toISOString(),
    lastFreePackIso: null, marketPrices: {}, marketLastDriftIso: null, pendingSales: [],
    lastWeeklyResetIso: new Date(0).toISOString(),
    dailyReward: null,
  };
}

/** Deterministic checks: exact payouts, one claim per day, streak rules,
 *  the 30-day calendar (Day 8 ≠ Day 1), milestone packs, Day 30 Elite+. */
export function runDailyRewardLab(): DailyRewardLabResult {
  const day0 = Date.UTC(2026, 10, 21, 12, 0, 0);
  let profile = labProfile();
  // Day 1 pays exactly 500c; a second claim the same day is refused.
  const d1 = claimDailyReward(profile, day0);
  const again = claimDailyReward(d1.profile, day0 + 60_000);
  let ok = d1.error === null && d1.reward?.coins === 500
    && d1.profile.coins === 1500 && d1.profile.dailyReward?.streak === 1
    && again.error !== null && again.profile.coins === 1500;
  profile = d1.profile;
  // Day 2 (next UTC day) continues the streak and pays 750c.
  const d2 = claimDailyReward(profile, day0 + DAY_MS);
  ok = ok && d2.error === null && d2.reward?.day === 2 && d2.reward?.coins === 750
    && d2.profile.dailyReward?.streak === 2;
  profile = d2.profile;
  // A missed day restarts the streak at Day 1 / 500c.
  const afterGap = claimDailyReward(profile, day0 + 3 * DAY_MS);
  ok = ok && afterGap.error === null && afterGap.reward?.day === 1
    && afterGap.profile.dailyReward?.streak === 1;

  // A full 30-day run: every day pays its own calendar reward (Day 8 pays
  // Day 8's 2,250c — never a wrap to Day 1), milestone days grant packs,
  // Day 30 pays 10,000c + 50 gems + the Master Vault, and Day 31 starts a
  // fresh calendar at Day 1 while the streak keeps counting.
  let runner = labProfile();
  let cycleOk = DAILY_REWARDS.length === 30 && MILESTONE_DAYS.join(',') === '7,14,21,30';
  let expectedCoins = 1000;
  let expectedGems = 10;
  let inventoryBefore = 0;
  for (let i = 0; i < 30; i += 1) {
    const def = DAILY_REWARDS[i]!;
    const r = claimDailyReward(runner, day0 + i * DAY_MS);
    if (r.error !== null || r.reward?.day !== i + 1 || r.reward?.coins !== def.coins || r.reward?.gems !== def.gems) cycleOk = false;
    if (def.packId) {
      if (r.packNames.length === 0 || r.profile.inventory.length <= inventoryBefore) cycleOk = false;
    } else if (r.packNames.length !== 0) cycleOk = false;
    inventoryBefore = r.profile.inventory.length;
    expectedCoins += def.coins;
    expectedGems += def.gems;
    runner = r.profile;
  }
  cycleOk = cycleOk && runner.coins === expectedCoins && runner.gems === expectedGems
    && runner.dailyReward?.streak === 30
    && (runner.loginMilestonesClaimed ?? []).join(',') === '7,14,21,30';
  // Day 30's pack is the Master Vault: its guarantee floor is MASTER, so
  // the calendar's final reward is a guaranteed Elite+ pack by definition.
  const day30Pack = getPackById('master_vault');
  cycleOk = cycleOk && day30Pack?.guaranteedMinRarity === 'MASTER';
  const day31 = claimDailyReward(runner, day0 + 30 * DAY_MS);
  cycleOk = cycleOk && day31.error === null && day31.reward?.day === 1
    && day31.profile.dailyReward?.streak === 31;
  return {
    ok, cycleOk,
    detail: '30-day calendar · Day 1 pays 500c · same-day double claim refused · missed day restarts at Day 1 · Day 8 pays Day 8 (2,250c, no wrap) · milestone packs on Days 7/14/21/30 · Day 30 = 10,000c + 50 gems + Master Vault (guaranteed Elite+) · Day 31 opens a fresh calendar',
  };
}
