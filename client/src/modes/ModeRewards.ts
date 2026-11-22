// Striker FC — modes/ModeRewards.ts (Phase 08)
// The single grant path for every game mode: coins, gems, Season Pass XP,
// training XP, VSA fans and quest progress are applied to a SaveProfile as a
// pure transform, then persisted by the caller through commitProfile
// (SaveSystem IndexedDB/LocalStorage). Quest definitions come from the real
// Phase 01 data (data/PacksAndQuests QUESTS); progress increments are driven
// by what actually happened in the finished session — never invented.

import type { SaveProfile } from '../core/types';
import { QUESTS } from '../data/PacksAndQuests';

export interface ModeRewardGrant {
  coins: number;
  gems: number;
  /** Season Pass XP (also shown as "XP earned" on the Match End screen). */
  xp: number;
  /** Extra training XP poured into the shared pool. */
  trainingXp: number;
  /** VS Attack fan movement (may be negative; the total floors at 0). */
  fans: number;
}

export const NO_REWARD: ModeRewardGrant = { coins: 0, gems: 0, xp: 0, trainingXp: 0, fans: 0 };

/** Facts about a finished session that quests listen to. */
export interface SessionFacts {
  /** Any playable mode session completed (matches + VSA + skill games). */
  played: boolean;
  goalsScored: number;
  cleanSheet: boolean;
  /** A Head-to-Head ladder win specifically (daily_win_1). */
  h2hWin: boolean;
  /** A Skill Games Arena session completed. */
  skillGamePlayed: boolean;
  /** Phase 09: a win in ANY mode (weekly_win_5). H2H wins already imply it. */
  matchWin?: boolean;
}

export const NO_FACTS: SessionFacts = {
  played: false, goalsScored: 0, cleanSheet: false, h2hWin: false, skillGamePlayed: false, matchWin: false,
};

/** Quest id → progress delta for a set of session facts (mirrors QUESTS copy). */
export function questDeltasFor(facts: SessionFacts): Record<string, number> {
  const deltas: Record<string, number> = {};
  const add = (id: string, n: number) => { if (n > 0) deltas[id] = (deltas[id] ?? 0) + n; };
  if (facts.played) {
    add('daily_play_1', 1);
    add('weekly_play_10', 1);
  }
  if (facts.goalsScored > 0) {
    add('daily_score_2', facts.goalsScored);
    add('weekly_score_15', facts.goalsScored);
  }
  if (facts.h2hWin) add('daily_win_1', 1);
  if (facts.cleanSheet) add('weekly_clean_3', 1);
  // Phase 09 quests: skill-game completions and wins in any mode. Finesse
  // goals and training levels are tracked live by QuestService's EventBus
  // subscription instead, so nothing is ever double-counted.
  if (facts.skillGamePlayed) {
    add('daily_skill_1', 1);
    add('weekly_skill_3', 1);
  }
  if (facts.h2hWin || facts.matchWin) add('weekly_win_5', 1);
  return deltas;
}

export interface QuestProgressRow {
  questId: string;
  title: string;
  before: number;
  after: number;
  target: number;
  completedNow: boolean;
}

/**
 * Apply a reward grant + quest progress to a profile. Returns the next
 * profile and the per-quest before/after rows the Match End screen shows.
 * Quest rewards themselves are claimed on the Quests & Star Pass screen
 * (Phase 09, meta/QuestService) — sessions grant progress only.
 */
export function applyModeRewards(
  profile: SaveProfile,
  grant: ModeRewardGrant,
  facts: SessionFacts,
): { next: SaveProfile; quests: QuestProgressRow[] } {
  const deltas = questDeltasFor(facts);
  const questProgress = { ...profile.questProgress };
  const quests: QuestProgressRow[] = [];
  for (const quest of QUESTS) {
    const delta = deltas[quest.id] ?? 0;
    if (delta <= 0) continue;
    const before = Math.min(quest.target, questProgress[quest.id]?.current ?? 0);
    const after = Math.min(quest.target, before + delta);
    questProgress[quest.id] = {
      current: after,
      claimed: questProgress[quest.id]?.claimed ?? false,
    };
    quests.push({
      questId: quest.id,
      title: quest.title,
      before, after,
      target: quest.target,
      completedNow: before < quest.target && after >= quest.target,
    });
  }
  const next: SaveProfile = {
    ...profile,
    coins: profile.coins + grant.coins,
    gems: profile.gems + grant.gems,
    seasonPassXp: profile.seasonPassXp + grant.xp,
    trainingXpPool: profile.trainingXpPool + grant.trainingXp,
    vsaFans: Math.max(0, profile.vsaFans + grant.fans),
    questProgress,
    // Addendum 1: lifetime counters for the first-week chain.
    matchesPlayed: (profile.matchesPlayed ?? 0) + (facts.played ? 1 : 0),
    matchesWon: (profile.matchesWon ?? 0) + (facts.matchWin ? 1 : 0),
    goalsScoredTotal: (profile.goalsScoredTotal ?? 0) + Math.max(0, facts.goalsScored),
  };
  return { next, quests };
}
