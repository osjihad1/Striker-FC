// Striker FC — data/PacksAndQuests.ts
// Store packs (Blueprint 09) plus daily/weekly quest definitions and the
// 20-tier Star Season Pass (Blueprint 08 §4, Phase 09 economy).

import type { PackDef } from '../core/types';
import { formatNumber } from '../i18n/i18n';
import { SEED_PACKS } from './seedDatabase';

export function getAllPacks(): PackDef[] {
  return SEED_PACKS;
}

export function getPackById(id: string): PackDef | undefined {
  return SEED_PACKS.find((p) => p.id === id);
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  target: number;
  cadence: 'DAILY' | 'WEEKLY';
  rewardCoins: number;
  rewardGems: number;
}

/**
 * Phase 09: 6 Daily + 6 Weekly quests. The first six ids are the Phase 01
 * definitions (saved progress stays valid); the Phase 09 additions are driven
 * by the EventBus (finesse goals, training) and mode-session facts (skill
 * games, wins in any mode) — see meta/QuestService.ts and modes/ModeRewards.ts.
 */
export const QUESTS: QuestDef[] = [
  { id: 'daily_play_1', title: 'Matchday Ready', description: 'Play 1 match in any mode', target: 1, cadence: 'DAILY', rewardCoins: 1500, rewardGems: 0 },
  { id: 'daily_score_2', title: 'Sharp Shooter', description: 'Score 2 goals', target: 2, cadence: 'DAILY', rewardCoins: 2000, rewardGems: 5 },
  { id: 'daily_win_1', title: 'Three Points', description: 'Win 1 Head-to-Head match', target: 1, cadence: 'DAILY', rewardCoins: 2500, rewardGems: 10 },
  { id: 'daily_finesse_1', title: 'Curl It In', description: 'Score 1 Finesse goal', target: 1, cadence: 'DAILY', rewardCoins: 2000, rewardGems: 5 },
  { id: 'daily_skill_1', title: 'Arena Warm-Up', description: 'Complete 1 Skill Game', target: 1, cadence: 'DAILY', rewardCoins: 1500, rewardGems: 5 },
  { id: 'daily_train_3', title: 'Training Ground Grind', description: 'Train any player 3 levels', target: 3, cadence: 'DAILY', rewardCoins: 1800, rewardGems: 0 },
  { id: 'weekly_play_10', title: 'Season Grinder', description: 'Play 10 matches in any mode', target: 10, cadence: 'WEEKLY', rewardCoins: 12000, rewardGems: 40 },
  { id: 'weekly_score_15', title: 'Golden Boot Pace', description: 'Score 15 goals', target: 15, cadence: 'WEEKLY', rewardCoins: 15000, rewardGems: 60 },
  { id: 'weekly_clean_3', title: 'Brick Wall', description: 'Keep 3 clean sheets', target: 3, cadence: 'WEEKLY', rewardCoins: 10000, rewardGems: 50 },
  { id: 'weekly_finesse_3', title: 'Top Bins Collector', description: 'Score 3 Finesse goals', target: 3, cadence: 'WEEKLY', rewardCoins: 8000, rewardGems: 30 },
  { id: 'weekly_skill_3', title: 'Arena Regular', description: 'Complete 3 Skill Games', target: 3, cadence: 'WEEKLY', rewardCoins: 9000, rewardGems: 35 },
  { id: 'weekly_win_5', title: 'Winning Habit', description: 'Win 5 matches in any mode', target: 5, cadence: 'WEEKLY', rewardCoins: 12000, rewardGems: 40 },
];

export interface SeasonPassTier {
  tier: number;
  xpRequired: number;
  rewardLabel: string;
  rewardCoins: number;
  rewardGems: number;
  rewardTrainingXp: number;
  rewardTokens: number;
  /** Tier 20 only: claiming grants a free Legend Icon Pack opening. */
  rewardPackId?: string;
}

function passTier(
  tier: number,
  reward: Partial<Pick<SeasonPassTier, 'rewardCoins' | 'rewardGems' | 'rewardTrainingXp' | 'rewardTokens' | 'rewardPackId'>>,
): SeasonPassTier {
  const coins = reward.rewardCoins ?? 0;
  const gems = reward.rewardGems ?? 0;
  const trainingXp = reward.rewardTrainingXp ?? 0;
  const tokens = reward.rewardTokens ?? 0;
  const parts: string[] = [];
  if (reward.rewardPackId) parts.push('Legend Icon Pack');
  if (coins > 0) parts.push(`${formatNumber(coins)} Coins`);
  if (gems > 0) parts.push(`${gems} Gems`);
  if (trainingXp > 0) parts.push(`${formatNumber(trainingXp)} Training XP`);
  if (tokens > 0) parts.push(`${tokens} Rank-Up Token${tokens > 1 ? 's' : ''}`);
  return {
    tier,
    xpRequired: tier * 500,
    rewardLabel: parts.join(' · '),
    rewardCoins: coins,
    rewardGems: gems,
    rewardTrainingXp: trainingXp,
    rewardTokens: tokens,
    ...(reward.rewardPackId ? { rewardPackId: reward.rewardPackId } : {}),
  };
}

/** Phase 09: the 20-tier Star Season Pass reward track (Blueprint 08 §4). */
export const SEASON_PASS_TIERS: SeasonPassTier[] = [
  passTier(1, { rewardCoins: 2000 }),
  passTier(2, { rewardGems: 15 }),
  passTier(3, { rewardTrainingXp: 500 }),
  passTier(4, { rewardCoins: 3000 }),
  passTier(5, { rewardTokens: 1 }),
  passTier(6, { rewardGems: 25 }),
  passTier(7, { rewardCoins: 4000 }),
  passTier(8, { rewardTrainingXp: 1000 }),
  passTier(9, { rewardGems: 35 }),
  passTier(10, { rewardTokens: 1, rewardCoins: 2500 }),
  passTier(11, { rewardCoins: 5000 }),
  passTier(12, { rewardGems: 50 }),
  passTier(13, { rewardTrainingXp: 1500 }),
  passTier(14, { rewardCoins: 6000 }),
  passTier(15, { rewardTokens: 1 }),
  passTier(16, { rewardGems: 75 }),
  passTier(17, { rewardCoins: 8000 }),
  passTier(18, { rewardTrainingXp: 2500 }),
  passTier(19, { rewardGems: 100, rewardCoins: 5000 }),
  passTier(20, { rewardPackId: 'legend_icon', rewardCoins: 10000, rewardGems: 150 }),
];
