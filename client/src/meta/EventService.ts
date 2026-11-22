// Striker FC — meta/EventService.ts (Epic fix round, P2-19)
// The timed live event gets its full loop: chapters group the daily and
// weekly event quests, every claimed event quest earns Event Points, the
// milestone track pays out at point thresholds (coins / gems / Event
// Tokens), and Event Tokens are spendable in the event shop. All state
// lives on the profile (eventTokens / eventMilestonesClaimed); points are
// derived from the real questProgress claims, so nothing can double-pay.

import { mulberry32 } from '../core/math';
import type { SaveProfile } from '../core/types';
import { QUESTS, type QuestDef } from '../data/PacksAndQuests';
import { getPlayerById } from '../data/PlayerDatabase';
import { makePulledCard, pickPlayerOfRarity } from './PackService';
import type { ModeRewardGrant } from '../modes/ModeRewards';

export interface EventChapter {
  id: string;
  name: string;
  blurb: string;
  quests: QuestDef[];
}

export const EVENT_CHAPTERS: EventChapter[] = [
  {
    id: 'chapter_daily', name: 'Chapter 1 · Daily Grind',
    blurb: 'Six daily event quests — each claim banks Event Points toward the milestone track.',
    quests: QUESTS.filter((q) => q.cadence === 'DAILY'),
  },
  {
    id: 'chapter_weekly', name: 'Chapter 2 · Weekly Warrior',
    blurb: 'Six weekly event quests for the long game — the biggest point hauls live here.',
    quests: QUESTS.filter((q) => q.cadence === 'WEEKLY'),
  },
];

/** Event Points per claimed quest, by cadence. */
export function eventPointsFor(quest: QuestDef): number {
  return quest.cadence === 'WEEKLY' ? 3 : 1;
}

/** Total Event Points earned from claimed event quests (derived, not stored). */
export function eventPoints(profile: SaveProfile): number {
  let total = 0;
  for (const chapter of EVENT_CHAPTERS) {
    for (const quest of chapter.quests) {
      if (profile.questProgress[quest.id]?.claimed) total += eventPointsFor(quest);
    }
  }
  return total;
}

export interface EventMilestone {
  points: number;
  grant: ModeRewardGrant;
  eventTokens: number;
}

export const EVENT_MILESTONES: EventMilestone[] = [
  { points: 3, grant: { coins: 3000, gems: 10, xp: 200, trainingXp: 150, fans: 0 }, eventTokens: 50 },
  { points: 8, grant: { coins: 6000, gems: 20, xp: 300, trainingXp: 250, fans: 0 }, eventTokens: 80 },
  { points: 14, grant: { coins: 10000, gems: 35, xp: 450, trainingXp: 400, fans: 0 }, eventTokens: 120 },
  { points: 20, grant: { coins: 16000, gems: 60, xp: 600, trainingXp: 600, fans: 0 }, eventTokens: 180 },
  { points: 24, grant: { coins: 25000, gems: 100, xp: 900, trainingXp: 900, fans: 0 }, eventTokens: 260 },
];

/** Claim a reached milestone exactly once. Returns the grant + tokens. */
export function claimEventMilestone(
  profile: SaveProfile,
  milestoneIndex: number,
): { profile: SaveProfile; milestone: EventMilestone | null; error: string | null } {
  const milestone = EVENT_MILESTONES[milestoneIndex];
  if (!milestone) return { profile, milestone: null, error: 'That milestone does not exist.' };
  const claimed = profile.eventMilestonesClaimed ?? [];
  if (claimed.includes(milestoneIndex)) return { profile, milestone: null, error: 'That milestone was already claimed.' };
  if (eventPoints(profile) < milestone.points) {
    return { profile, milestone: null, error: `You need ${milestone.points} Event Points — keep clearing event quests.` };
  }
  return {
    profile: {
      ...profile,
      eventTokens: (profile.eventTokens ?? 0) + milestone.eventTokens,
      eventMilestonesClaimed: [...claimed, milestoneIndex],
    },
    milestone,
    error: null,
  };
}

// ---------- Event shop -------------------------------------------------------------

export const EVENT_STAR_BOX_TOKENS = 250;
export const EVENT_SHARD_PACK_TOKENS = 100;
export const EVENT_SHARD_PACK_SHARDS = 250;

/** Spend 250 Event Tokens on the Event Star Box: one guaranteed ELITE+ card. */
export function buyEventStarBox(
  profile: SaveProfile,
  rng: () => number,
  nowMs: number,
): { profile: SaveProfile; grantedName: string | null; error: string | null } {
  if ((profile.eventTokens ?? 0) < EVENT_STAR_BOX_TOKENS) {
    return { profile, grantedName: null, error: `The Star Box costs ${EVENT_STAR_BOX_TOKENS} Event Tokens.` };
  }
  const granted = pickPlayerOfRarity(rng() < 0.3 ? 'MASTER' : 'ELITE', rng, false);
  if (!granted) return { profile, grantedName: null, error: 'No event star is available right now.' };
  return {
    profile: {
      ...profile,
      eventTokens: (profile.eventTokens ?? 0) - EVENT_STAR_BOX_TOKENS,
      inventory: [...profile.inventory, makePulledCard(granted.id, nowMs)],
    },
    grantedName: granted.name,
    error: null,
  };
}

/** Spend 100 Event Tokens on 250 Rank-Up Shards. */
export function buyEventShardPack(
  profile: SaveProfile,
): { profile: SaveProfile; error: string | null } {
  if ((profile.eventTokens ?? 0) < EVENT_SHARD_PACK_TOKENS) {
    return { profile, error: `The Shard Pack costs ${EVENT_SHARD_PACK_TOKENS} Event Tokens.` };
  }
  return {
    profile: {
      ...profile,
      eventTokens: (profile.eventTokens ?? 0) - EVENT_SHARD_PACK_TOKENS,
      rankUpShards: (profile.rankUpShards ?? 0) + EVENT_SHARD_PACK_SHARDS,
    },
    error: null,
  };
}

export interface EventLabResult {
  chaptersOk: boolean;
  pointsOk: boolean;
  milestoneOk: boolean;
  shopOk: boolean;
  detail: string;
}

/** Deterministic checks of the event loop on a synthetic profile. */
export function runEventLab(): EventLabResult {
  const chaptersOk = EVENT_CHAPTERS.length === 2
    && EVENT_CHAPTERS[0]!.quests.length === 6
    && EVENT_CHAPTERS[1]!.quests.length === 6;
  const questProgress: SaveProfile['questProgress'] = {};
  for (const q of QUESTS) questProgress[q.id] = { current: q.target, claimed: true };
  const rich = {
    questProgress, eventTokens: 300, eventMilestonesClaimed: [], inventory: [],
    rankUpShards: 0,
  } as unknown as SaveProfile;
  const pointsOk = eventPoints(rich) === 6 * 1 + 6 * 3;
  const claim = claimEventMilestone(rich, 4);
  const milestoneOk = claim.error === null
    && (claim.profile.eventTokens ?? 0) === 300 + 260
    && claimEventMilestone(claim.profile, 4).error !== null;
  const box = buyEventStarBox(claim.profile, mulberry32(7), 1_700_000_000_000);
  const shards = buyEventShardPack(box.profile);
  const shopOk = box.error === null && box.grantedName !== null
    && box.profile.inventory.length === 1
    && getPlayerById(box.profile.inventory[0]!.templateId) !== undefined
    && shards.error === null && (shards.profile.rankUpShards ?? 0) === EVENT_SHARD_PACK_SHARDS;
  return {
    chaptersOk, pointsOk, milestoneOk, shopOk,
    detail: `2 chapters × 6 quests · full clear = ${eventPoints(rich)} pts · 5 milestones to 24 pts · Star Box ${EVENT_STAR_BOX_TOKENS} tokens, Shard Pack ${EVENT_SHARD_PACK_TOKENS}`,
  };
}
