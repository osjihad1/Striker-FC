// Striker FC — meta/QuestService.ts (Phase 09, Blueprint 08 §4)
// Quests & the 20-tier Star Season Pass. Quest definitions live in
// data/PacksAndQuests (6 Daily + 6 Weekly). Progress arrives two ways, with
// no double-counting: mode sessions report facts through ModeRewards
// (matches played, goals, wins, clean sheets, skill games), while this
// service's EventBus tracker listens live for the events sessions cannot
// summarise — Finesse goals (GOAL_SCORED shotType) and training levels
// (PLAYER_TRAINED). Claims, the daily/weekly reset cycle and Season Pass
// tier grants (Coins, Gems, Training XP, Rank-Up Tokens, and the Tier-20
// Legend Icon Pack) are pure profile transforms in this module.

import { matchEventBus } from '../core/EventBus';
import { formatNumber } from '../i18n/i18n';
import { mulberry32 } from '../core/math';
import type { PackPull } from './PackService';
import { rollPackCards } from './PackService';
import type { SaveProfile } from '../core/types';
import { QUESTS, SEASON_PASS_TIERS, getPackById, type QuestDef } from '../data/PacksAndQuests';

export function dailyQuests(): QuestDef[] {
  return QUESTS.filter((q) => q.cadence === 'DAILY');
}

export function weeklyQuests(): QuestDef[] {
  return QUESTS.filter((q) => q.cadence === 'WEEKLY');
}

export function questProgressOf(profile: SaveProfile, questId: string): { current: number; claimed: boolean } {
  return profile.questProgress[questId] ?? { current: 0, claimed: false };
}

export function questComplete(profile: SaveProfile, quest: QuestDef): boolean {
  return questProgressOf(profile, quest.id).current >= quest.target;
}

/** Increment one quest's progress (capped at its target). Pure. */
export function incrementQuest(profile: SaveProfile, questId: string, delta: number): SaveProfile {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest || delta <= 0) return profile;
  const prev = questProgressOf(profile, questId);
  const current = Math.min(quest.target, prev.current + delta);
  if (current === prev.current) return profile;
  return {
    ...profile,
    questProgress: { ...profile.questProgress, [questId]: { current, claimed: prev.claimed } },
  };
}

// ---------- EventBus auto-tracking ------------------------------------------------

/**
 * Subscribe to the shared EventBus and report quest increments for the
 * events a finished-session summary cannot express:
 *  - GOAL_SCORED with shotType FINESSE → daily_finesse_1 + weekly_finesse_3
 *    (only for the HOME side — the manager's own team).
 *  - PLAYER_TRAINED → daily_train_3 by levels gained.
 * Returns the unsubscribe function. The sink receives (questId, delta) pairs;
 * the App applies them to the live profile and commits — keeping this
 * service free of store imports and trivially testable.
 */
export function subscribeQuestTracker(sink: (questId: string, delta: number) => void): () => void {
  const offGoal = matchEventBus.on('GOAL_SCORED', (p) => {
    if (p.scoringSide !== 'HOME' || p.shotType !== 'FINESSE') return;
    sink('daily_finesse_1', 1);
    sink('weekly_finesse_3', 1);
  });
  const offTrain = matchEventBus.on('PLAYER_TRAINED', (p) => {
    if (p.levelsGained > 0) sink('daily_train_3', p.levelsGained);
  });
  return () => {
    offGoal();
    offTrain();
  };
}

// ---------- Claims ------------------------------------------------------------------

export interface ClaimResult {
  profile: SaveProfile;
  error: string | null;
}

/** Claim a completed quest: grant its Coins/Gems and mark it claimed. */
export function claimQuestReward(profile: SaveProfile, questId: string): ClaimResult {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest) return { profile, error: 'That quest no longer exists.' };
  const progress = questProgressOf(profile, questId);
  if (progress.claimed) return { profile, error: 'Reward already claimed.' };
  if (progress.current < quest.target) {
    return { profile, error: `Not complete yet — ${progress.current}/${quest.target}.` };
  }
  return {
    profile: {
      ...profile,
      coins: profile.coins + quest.rewardCoins,
      gems: profile.gems + quest.rewardGems,
      questProgress: {
        ...profile.questProgress,
        [questId]: { current: progress.current, claimed: true },
      },
    },
    error: null,
  };
}

export interface PassClaimResult extends ClaimResult {
  /** Cards granted when the claimed tier carries a pack (Tier 20). */
  packPulls: PackPull[];
}

/** The highest Season Pass tier the saved XP has reached (0–20). */
export function seasonPassTierReached(profile: SaveProfile): number {
  return SEASON_PASS_TIERS.filter((t) => profile.seasonPassXp >= t.xpRequired).length;
}

/**
 * Claim one reached Season Pass tier: Coins / Gems / Training XP / Rank-Up
 * Tokens land immediately; Tier 20 also opens its Legend Icon Pack for free
 * (rolled through PackService so the guarantee holds) into inventory.
 */
export function claimSeasonPassTier(
  profile: SaveProfile,
  tier: number,
  rng: () => number,
  nowMs: number,
  track: 'FREE' | 'PREMIUM' = 'FREE',
): PassClaimResult {
  const def = SEASON_PASS_TIERS.find((t) => t.tier === tier);
  if (!def) return { profile, error: 'That tier does not exist.', packPulls: [] };
  // Addendum 3: the premium track is a second, parallel claim per tier —
  // same reward again — for season-pass premium owners only.
  if (track === 'PREMIUM' && !profile.seasonPassPremium) {
    return { profile, error: 'The premium track needs Star Pass Premium for this season.', packPulls: [] };
  }
  const claimedList = track === 'PREMIUM' ? (profile.seasonPassPremiumClaimedTiers ?? []) : profile.seasonPassClaimedTiers;
  if (claimedList.includes(tier)) {
    return { profile, error: 'Tier already claimed.', packPulls: [] };
  }
  if (profile.seasonPassXp < def.xpRequired) {
    return {
      profile,
      error: `Tier ${tier} needs ${formatNumber(def.xpRequired)} XP — you have ${formatNumber(profile.seasonPassXp)}.`,
      packPulls: [],
    };
  }
  let packPulls: PackPull[] = [];
  let inventory = profile.inventory;
  if (def.rewardPackId) {
    const pack = getPackById(def.rewardPackId);
    if (pack) {
      packPulls = rollPackCards(pack, rng, nowMs);
      inventory = [...inventory, ...packPulls.map((p) => p.card)];
    }
  }
  const claimed = [...claimedList, tier].sort((a, b) => a - b);
  return {
    profile: {
      ...profile,
      coins: profile.coins + def.rewardCoins,
      gems: profile.gems + def.rewardGems,
      trainingXpPool: profile.trainingXpPool + def.rewardTrainingXp,
      rankUpTokens: profile.rankUpTokens + def.rewardTokens,
      inventory,
      seasonPassClaimedTiers: track === 'PREMIUM' ? profile.seasonPassClaimedTiers : claimed,
      seasonPassPremiumClaimedTiers: track === 'PREMIUM' ? claimed : (profile.seasonPassPremiumClaimedTiers ?? []),
    },
    error: null,
    packPulls,
  };
}

// ---------- Daily / weekly resets -----------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function sameUtcDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

/**
 * Apply the reset cycle: Daily quests zero out on a new UTC day, Weekly
 * quests after 7 days. Claimed flags reset with their cadence. Returns the
 * same profile object when nothing is due, so callers can cheaply detect it.
 */
export function applyQuestResets(profile: SaveProfile, nowMs: number): SaveProfile {
  const lastDaily = Date.parse(profile.lastDailyResetIso);
  const lastWeekly = Date.parse(profile.lastWeeklyResetIso ?? profile.lastDailyResetIso);
  const dailyDue = !Number.isFinite(lastDaily) || !sameUtcDay(lastDaily, nowMs);
  const weeklyDue = !Number.isFinite(lastWeekly) || nowMs - lastWeekly >= 7 * DAY_MS;
  if (!dailyDue && !weeklyDue) return profile;
  const questProgress = { ...profile.questProgress };
  for (const quest of QUESTS) {
    if ((quest.cadence === 'DAILY' && dailyDue) || (quest.cadence === 'WEEKLY' && weeklyDue)) {
      questProgress[quest.id] = { current: 0, claimed: false };
    }
  }
  return {
    ...profile,
    questProgress,
    lastDailyResetIso: dailyDue ? new Date(nowMs).toISOString() : profile.lastDailyResetIso,
    lastWeeklyResetIso: weeklyDue ? new Date(nowMs).toISOString() : profile.lastWeeklyResetIso ?? profile.lastDailyResetIso,
  };
}

/** Milliseconds until the next daily reset (next UTC midnight). */
export function msUntilDailyReset(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - nowMs;
}

/** Milliseconds until the weekly reset (lastWeeklyResetIso + 7 days). */
export function msUntilWeeklyReset(profile: SaveProfile, nowMs: number): number {
  const last = Date.parse(profile.lastWeeklyResetIso ?? profile.lastDailyResetIso);
  if (!Number.isFinite(last)) return 7 * DAY_MS;
  return Math.max(0, last + 7 * DAY_MS - nowMs);
}

// ---------- Verification lab --------------------------------------------------------

export interface QuestLabResult {
  defsOk: boolean;
  trackerOk: boolean;
  claimOk: boolean;
  passOk: boolean;
  resetOk: boolean;
  detail: string;
}

export function runQuestLab(): QuestLabResult {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const defsOk = dailyQuests().length === 6 && weeklyQuests().length === 6
    && SEASON_PASS_TIERS.length === 20
    && SEASON_PASS_TIERS[19]?.rewardPackId === 'legend_icon';

  let profile: SaveProfile = {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 1000, gems: 10, rankUpTokens: 0, trainingXpPool: 0,
    inventory: [], activeFormationId: '4-3-3-attack',
    startingXI: Array(11).fill(null), substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(now).toISOString(),
    lastFreePackIso: null, marketPrices: {}, marketLastDriftIso: null, pendingSales: [],
    lastWeeklyResetIso: new Date(now).toISOString(),
  };

  // EventBus tracker: a HOME finesse goal + 3 training levels land; an AWAY
  // power goal must not count.
  const events: [string, number][] = [];
  const off = subscribeQuestTracker((id, delta) => { events.push([id, delta]); });
  matchEventBus.emit('GOAL_SCORED', {
    scoringSide: 'HOME', scorerId: 'leg_pelero', assisterId: null, shotType: 'FINESSE', xg: 0.3, minute: 55,
  });
  matchEventBus.emit('GOAL_SCORED', {
    scoringSide: 'AWAY', scorerId: 'mst_haaland_e', assisterId: null, shotType: 'FINESSE', xg: 0.3, minute: 60,
  });
  matchEventBus.emit('GOAL_SCORED', {
    scoringSide: 'HOME', scorerId: 'leg_pelero', assisterId: null, shotType: 'POWER', xg: 0.3, minute: 70,
  });
  matchEventBus.emit('PLAYER_TRAINED', { instanceId: 'lab_card', levelsGained: 3 });
  off();
  for (const [id, delta] of events) profile = incrementQuest(profile, id, delta);
  const trackerOk = events.length === 3
    && questProgressOf(profile, 'daily_finesse_1').current === 1
    && questProgressOf(profile, 'weekly_finesse_3').current === 1
    && questProgressOf(profile, 'daily_train_3').current === 3;

  // Claims: a completed quest pays out exactly once; an incomplete one refuses.
  const claimed = claimQuestReward(profile, 'daily_finesse_1');
  const doubleClaim = claimed.profile === profile ? claimed : claimQuestReward(claimed.profile, 'daily_finesse_1');
  const incomplete = claimQuestReward(profile, 'weekly_finesse_3');
  const finesseQuest = QUESTS.find((q) => q.id === 'daily_finesse_1')!;
  const claimOk = claimed.error === null
    && claimed.profile.coins === 1000 + finesseQuest.rewardCoins
    && claimed.profile.gems === 10 + finesseQuest.rewardGems
    && doubleClaim.error !== null
    && incomplete.error !== null;
  profile = claimed.profile;

  // Season Pass: tier 1 pays coins; tier 20 pays everything + a LEGEND card.
  profile = { ...profile, seasonPassXp: 10000 };
  const tier1 = claimSeasonPassTier(profile, 1, mulberry32(11), now);
  const tier1Again = claimSeasonPassTier(tier1.profile, 1, mulberry32(11), now);
  const tier20 = claimSeasonPassTier(tier1.profile, 20, mulberry32(23), now);
  const passOk = tier1.error === null && tier1.profile.coins === profile.coins + 2000
    && tier1Again.error !== null
    && tier20.error === null
    && tier20.packPulls.some((p) => p.template.rarity === 'LEGEND')
    && tier20.profile.gems === tier1.profile.gems + 150
    && tier20.profile.inventory.length === tier20.packPulls.length
    && seasonPassTierReached(profile) === 20;
  profile = tier20.profile;

  // Resets: next UTC day clears dailies only; +7 days clears weeklies too.
  const progressed: SaveProfile = {
    ...profile,
    questProgress: {
      daily_play_1: { current: 1, claimed: true },
      weekly_play_10: { current: 4, claimed: false },
    },
  };
  const nextDay = applyQuestResets(progressed, now + DAY_MS);
  const nextWeek = applyQuestResets(progressed, now + 7 * DAY_MS);
  const resetOk = questProgressOf(nextDay, 'daily_play_1').current === 0
    && questProgressOf(nextDay, 'weekly_play_10').current === 4
    && questProgressOf(nextWeek, 'weekly_play_10').current === 0
    && applyQuestResets(progressed, now) === progressed;

  return {
    defsOk, trackerOk, claimOk, passOk, resetOk,
    detail: '12 quests (6 daily + 6 weekly) · EventBus finesse/training tracking exact · claims pay once · Tier 20 grants the Legend Icon Pack · daily/weekly resets scoped by cadence',
  };
}
