// Striker FC — meta/ProgressionService.ts
// Phase 07 progression (Blueprint 03 §2C + Blueprint 08 §2): training XP levels
// gated by rank, fodder-card XP conversion, rank-ups (duplicate card OR one
// Universal Rank-Up Token) and skill-point allocation. Every boost computed
// here is baked into the PlayerTemplate the 3D MatchEngine actually simulates
// (getUpgradedTemplate), so upgrades are real on the pitch — not display-only.

import type {
CoreStats, OwnedPlayerCard, PlayerTemplate, SaveProfile, SubStats,
} from '../core/types';
import { getCardEffectiveOvr, maxTrainingLevelForRank, positionGroup, xpNeeded } from '../core/types';
import { getPlayerById } from '../data/PlayerDatabase';

export type SkillBranch = keyof OwnedPlayerCard['skillPoints'];

export interface SkillBranchDef {
  id: SkillBranch;
  name: string;
  blurb: string;
  /** +4 per allocated point to each of these sub-stats (Blueprint 03 §2C). */
  subStats: (keyof SubStats)[];
  /** +2 per allocated point to each of these core stats, so the branch moves
   *  the numbers the match engine reads (pace, shot power inputs, tackling). */
  coreStats: (keyof CoreStats)[];
  gkOnly: boolean;
}

export const SKILL_BRANCHES: SkillBranchDef[] = [
  {
    id: 'dexterity', name: 'Dexterity', blurb: 'Acceleration, sprint speed and agility — burst and balance at pace.',
    subStats: ['acceleration', 'sprintSpeed', 'agility'], coreStats: ['pac', 'dri'], gkOnly: false,
  },
  {
    id: 'shooting', name: 'Shooting', blurb: 'Finishing, shot power and long shots — cleaner strikes from any range.',
    subStats: ['finishing', 'shotPower', 'longShots'], coreStats: ['sho'], gkOnly: false,
  },
  {
    id: 'passing', name: 'Passing', blurb: 'Vision and passing range — unlocks defences with either foot.',
    subStats: ['vision', 'shortPassing', 'longPassing'], coreStats: ['pas'], gkOnly: false,
  },
  {
    id: 'defending', name: 'Defending', blurb: 'Interceptions and both tackles — reads lanes and wins the ball.',
    subStats: ['interceptions', 'standingTackle', 'slidingTackle'], coreStats: ['def'], gkOnly: false,
  },
  {
    id: 'physical', name: 'Physical', blurb: 'Jumping, stamina and strength — wins duels and lasts 90 minutes.',
    subStats: ['jumping', 'stamina', 'strength'], coreStats: ['phy'], gkOnly: false,
  },
  {
    id: 'gkDivingFocus', name: 'GK Diving Focus', blurb: 'Diving, handling and reflexes — for goalkeepers only.',
    subStats: ['gkDiving', 'gkHandling', 'gkReflexes'], coreStats: [], gkOnly: true,
  },
];

export function branchDef(id: SkillBranch): SkillBranchDef {
  return SKILL_BRANCHES.find((b) => b.id === id) ?? SKILL_BRANCHES[0]!;
}

/** Primary-role sub-stats that gain +1.15 (rounded) per training level. */
const PRIMARY_SUBSTATS: Record<string, (keyof SubStats)[]> = {
  GK: ['gkDiving', 'gkHandling', 'gkKicking', 'gkReflexes', 'gkPositioning'],
  DEF: ['interceptions', 'headingAccuracy', 'standingTackle', 'slidingTackle', 'jumping', 'strength', 'sprintSpeed', 'shortPassing'],
  MID: ['vision', 'crossing', 'shortPassing', 'longPassing', 'agility', 'balance', 'ballControl', 'dribbling', 'stamina'],
  ATT: ['acceleration', 'sprintSpeed', 'positioning', 'finishing', 'shotPower', 'longShots', 'curve', 'agility', 'ballControl', 'dribbling', 'headingAccuracy'],
};

const clampStat = (v: number): number => Math.max(25, Math.min(99, Math.round(v)));

/** Fully upgraded core + sub stats for a card (training levels + skill points). */
export function getUpgradedStats(
  template: PlayerTemplate,
  card: OwnedPlayerCard,
): { core: CoreStats; subStats: SubStats } {
  const level = card.trainingLevel;
  const core: CoreStats = {
    pac: template.stats.pac + level,
    sho: template.stats.sho + level,
    pas: template.stats.pas + level,
    dri: template.stats.dri + level,
    def: template.stats.def + level,
    phy: template.stats.phy + level,
  };
  const subStats: SubStats = { ...template.subStats };
  const primaryBoost = Math.round(1.15 * level);
  if (primaryBoost > 0) {
    for (const key of PRIMARY_SUBSTATS[positionGroup(template.position)] ?? []) {
      subStats[key] += primaryBoost;
    }
  }
  for (const branch of SKILL_BRANCHES) {
    const points = card.skillPoints[branch.id];
    if (points <= 0) continue;
    for (const key of branch.subStats) subStats[key] += 4 * points;
    for (const key of branch.coreStats) core[key] += 2 * points;
  }
  (Object.keys(core) as (keyof CoreStats)[]).forEach((k) => { core[k] = clampStat(core[k]); });
  (Object.keys(subStats) as (keyof SubStats)[]).forEach((k) => { subStats[k] = clampStat(subStats[k]); });
  return { core, subStats };
}

/**
 * The template the match engine simulates for this owned card: upgraded stats
 * and the effective OVR as baseOvr, same id (so the 3D rig/appearance and the
 * HUD identity stay the player's own).
 */
export function getUpgradedTemplate(
  template: PlayerTemplate,
  card: OwnedPlayerCard,
  boosts?: Record<string, number>,
): PlayerTemplate {
  const { core, subStats } = getUpgradedStats(template, card);
  return {
    ...template,
    baseOvr: getCardEffectiveOvr(template, card),
    stats: core,
    subStats: applySkillBoosts(template, subStats, boosts),
  };
}

// ---------- Training XP -------------------------------------------------------

/** XP a card is worth when consumed as training fodder. */
export function fodderXpValue(template: PlayerTemplate, card: OwnedPlayerCard): number {
  const byRarity: Record<PlayerTemplate['rarity'], number> = {
    BRONZE: 150, SILVER: 300, GOLD: 600, ELITE: 1200, MASTER: 2500, LEGEND: 5000,
  };
  return byRarity[template.rarity] + card.trainingLevel * 50 + card.rank * 200;
}

export interface TrainingResult {
  card: OwnedPlayerCard;
  levelsGained: number;
  xpConsumed: number;
  capped: boolean;
}

/** Pour XP into a card, respecting the rank training cap. Pure — no mutation. */
export function applyTrainingXp(card: OwnedPlayerCard, xp: number): TrainingResult {
  const cap = maxTrainingLevelForRank(card.rank);
  let level = card.trainingLevel;
  let progress = card.trainingXp;
  let available = Math.max(0, Math.floor(xp));
  let consumed = 0;
  while (available > 0 && level < cap) {
    const need = xpNeeded(level) - progress;
    if (available >= need) {
      available -= need;
      consumed += need;
      level += 1;
      progress = 0;
    } else {
      progress += available;
      consumed += available;
      available = 0;
    }
  }
  return {
    card: { ...card, trainingLevel: level, trainingXp: progress },
    levelsGained: level - card.trainingLevel,
    xpConsumed: consumed,
    capped: level >= cap,
  };
}

function replaceCard(profile: SaveProfile, next: OwnedPlayerCard): SaveProfile {
  return {
    ...profile,
    inventory: profile.inventory.map((c) => (c.instanceId === next.instanceId ? next : c)),
  };
}

export function findCard(profile: SaveProfile, instanceId: string): OwnedPlayerCard | undefined {
  return profile.inventory.find((c) => c.instanceId === instanceId);
}

/** Train using the shared Training XP pool (as much as the next levels need). */
export function trainWithPoolXp(
  profile: SaveProfile,
  instanceId: string,
): { profile: SaveProfile; result: TrainingResult | null; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, result: null, error: 'That card is no longer in your club.' };
  if (profile.trainingXpPool <= 0) {
    return { profile, result: null, error: 'Your Training XP pool is empty — convert a spare card into XP below.' };
  }
  const result = applyTrainingXp(card, profile.trainingXpPool);
  if (result.xpConsumed <= 0) {
    return { profile, result, error: `Training cap reached for Rank ${card.rank} (Lv ${maxTrainingLevelForRank(card.rank)}). Rank up to unlock more levels.` };
  }
  const next = replaceCard(profile, result.card);
  return {
    profile: { ...next, trainingXpPool: profile.trainingXpPool - result.xpConsumed },
    result,
    error: null,
  };
}

/** Cards eligible as fodder: owned, unlocked, not in the XI, not the target. */
export function fodderCandidates(profile: SaveProfile, targetInstanceId: string): OwnedPlayerCard[] {
  const xi = new Set(profile.startingXI.filter((v): v is string => v !== null));
  return profile.inventory.filter(
    (c) => c.instanceId !== targetInstanceId && !c.locked && !xi.has(c.instanceId),
  );
}

/** Consume a fodder card: it leaves the club (and the bench) and becomes XP. */
export function trainWithFodder(
  profile: SaveProfile,
  instanceId: string,
  fodderInstanceId: string,
): { profile: SaveProfile; result: TrainingResult | null; xpValue: number; error: string | null } {
  const card = findCard(profile, instanceId);
  const fodder = findCard(profile, fodderInstanceId);
  if (!card || !fodder) return { profile, result: null, xpValue: 0, error: 'Card not found in your club.' };
  if (fodder.locked) return { profile, result: null, xpValue: 0, error: 'That card is locked — unlock it before using it as fodder.' };
  if (profile.startingXI.includes(fodderInstanceId)) {
    return { profile, result: null, xpValue: 0, error: 'Players in your Starting XI cannot be used as fodder.' };
  }
  const fodderTemplate = getPlayerById(fodder.templateId);
  if (!fodderTemplate) return { profile, result: null, xpValue: 0, error: 'Fodder card data is missing.' };
  const xpValue = fodderXpValue(fodderTemplate, fodder);
  const result = applyTrainingXp(card, xpValue);
  if (result.xpConsumed <= 0) {
    return { profile, result, xpValue, error: `Training cap reached for Rank ${card.rank}. Rank up first — no fodder was consumed.` };
  }
  const leftover = xpValue - result.xpConsumed;
  const withoutFodder: SaveProfile = {
    ...profile,
    inventory: profile.inventory.filter((c) => c.instanceId !== fodderInstanceId),
    substitutes: profile.substitutes.map((s) => (s === fodderInstanceId ? null : s)),
    trainingXpPool: profile.trainingXpPool + leftover,
  };
  return { profile: replaceCard(withoutFodder, result.card), result, xpValue, error: null };
}

// ---------- Rank up -------------------------------------------------------------

export type RankUpMethod = 'DUPLICATE' | 'TOKEN';

export function duplicateCards(profile: SaveProfile, card: OwnedPlayerCard): OwnedPlayerCard[] {
  const xi = new Set(profile.startingXI.filter((v): v is string => v !== null));
  const subs = new Set(profile.substitutes.filter((v): v is string => v !== null));
  return profile.inventory.filter(
    (c) => c.instanceId !== card.instanceId
      && c.templateId === card.templateId
      && !c.locked
      && !xi.has(c.instanceId)
      && !subs.has(c.instanceId),
  );
}

export function canRankUp(profile: SaveProfile, card: OwnedPlayerCard): { duplicate: boolean; token: boolean } {
  return {
    duplicate: duplicateCards(profile, card).length > 0,
    token: profile.rankUpTokens > 0,
  };
}

/**
 * Rank up: +1 rank → +1 effective OVR, +5 training cap, +1 skill point.
 * Consumes one duplicate card (same templateId) or one Universal Rank-Up Token.
 */
export function rankUpCard(
  profile: SaveProfile,
  instanceId: string,
  method: RankUpMethod,
): { profile: SaveProfile; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, error: 'That card is no longer in your club.' };
  if (card.rank >= 5) return { profile, error: 'This card is already at max Rank 5 (Gold).' };
  const nextCard: OwnedPlayerCard = { ...card, rank: (card.rank + 1) as OwnedPlayerCard['rank'] };
  if (method === 'TOKEN') {
    if (profile.rankUpTokens <= 0) return { profile, error: 'No Universal Rank-Up Tokens left.' };
    return {
      profile: { ...replaceCard(profile, nextCard), rankUpTokens: profile.rankUpTokens - 1 },
      error: null,
    };
  }
  const dup = duplicateCards(profile, card)[0];
  if (!dup) return { profile, error: 'No unlocked duplicate of this player is available to consume.' };
  const withoutDup: SaveProfile = {
    ...profile,
    inventory: profile.inventory.filter((c) => c.instanceId !== dup.instanceId),
  };
  return { profile: replaceCard(withoutDup, nextCard), error: null };
}

// ---------- Rank-Up Shards (Epic fix round, P0-4) --------------------------------

/** Shards needed to craft one Universal Rank-Up Token. */
export const SHARDS_PER_TOKEN = 500;

/** What a duplicate card is worth when converted to shards, by rarity. */
export const SHARD_VALUES: Record<PlayerTemplate['rarity'], number> = {
  BRONZE: 10, SILVER: 25, GOLD: 50, ELITE: 100, MASTER: 200, LEGEND: 400,
};

export function shardValueOf(template: PlayerTemplate): number {
  return SHARD_VALUES[template.rarity];
}

/**
 * Convert an unlocked duplicate card (another copy of the same template
 * must remain in the club) into Rank-Up Shards. The last copy of a player
 * can never be converted — the collection is protected.
 */
export function convertDuplicateToShards(
  profile: SaveProfile,
  instanceId: string,
): { profile: SaveProfile; shardsGained: number; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, shardsGained: 0, error: 'That card is no longer in your club.' };
  if (card.locked) return { profile, shardsGained: 0, error: 'That card is locked — unlock it before converting.' };
  const inXi = profile.startingXI.includes(instanceId);
  const inSubs = profile.substitutes.includes(instanceId);
  if (inXi || inSubs) return { profile, shardsGained: 0, error: 'That card is in your squad — swap it out before converting.' };
  const hasAnotherCopy = profile.inventory.some((c) => c.instanceId !== instanceId && c.templateId === card.templateId);
  if (!hasAnotherCopy) return { profile, shardsGained: 0, error: 'That is your only copy of this player — the last copy is protected.' };
  const template = getPlayerById(card.templateId);
  if (!template) return { profile, shardsGained: 0, error: 'That player is no longer in the database.' };
  const shardsGained = shardValueOf(template);
  return {
    profile: {
      ...profile,
      inventory: profile.inventory.filter((c) => c.instanceId !== instanceId),
      rankUpShards: (profile.rankUpShards ?? 0) + shardsGained,
    },
    shardsGained,
    error: null,
  };
}

/** Craft one Universal Rank-Up Token from 500 shards. */
export function craftRankUpToken(
  profile: SaveProfile,
): { profile: SaveProfile; error: string | null } {
  const shards = profile.rankUpShards ?? 0;
  if (shards < SHARDS_PER_TOKEN) {
    return { profile, error: `You need ${SHARDS_PER_TOKEN} shards to craft a token — you have ${shards}.` };
  }
  return {
    profile: {
      ...profile,
      rankUpShards: shards - SHARDS_PER_TOKEN,
      rankUpTokens: profile.rankUpTokens + 1,
    },
    error: null,
  };
}

// ---------- Skill Boosts (Epic fix round, P2-17) ----------------------------------
// A team-wide progression layer on top of per-card training: each boost
// track adds +1 per level to two sub-stats for every player it applies to,
// bought with Training XP from the shared pool. Applied inside
// getUpgradedTemplate, so boosted stats are what the match engine fields.

export interface SkillBoostTrack {
  id: string;
  name: string;
  subStats: (keyof SubStats)[];
  gkOnly: boolean;
}

export const SKILL_BOOST_TRACKS: SkillBoostTrack[] = [
  { id: 'boost_shooting', name: 'Finishing Boost', subStats: ['finishing', 'shotPower'], gkOnly: false },
  { id: 'boost_passing', name: 'Vision Boost', subStats: ['vision', 'shortPassing'], gkOnly: false },
  { id: 'boost_dribbling', name: 'Dribbling Boost', subStats: ['dribbling', 'ballControl'], gkOnly: false },
  { id: 'boost_defending', name: 'Defending Boost', subStats: ['standingTackle', 'interceptions'], gkOnly: false },
  { id: 'boost_physical', name: 'Physical Boost', subStats: ['strength', 'stamina'], gkOnly: false },
  { id: 'boost_gk', name: 'Goalkeeping Boost', subStats: ['gkDiving', 'gkReflexes'], gkOnly: true },
];

export const SKILL_BOOST_MAX_LEVEL = 12;

/** Training XP cost of the next level of a track (level is 0-based). */
export function skillBoostCost(currentLevel: number): number {
  return 400 * (currentLevel + 1);
}

export function upgradeSkillBoost(
  profile: SaveProfile,
  trackId: string,
): { profile: SaveProfile; error: string | null } {
  const track = SKILL_BOOST_TRACKS.find((t) => t.id === trackId);
  if (!track) return { profile, error: 'Unknown boost track.' };
  const level = profile.skillBoosts?.[trackId] ?? 0;
  if (level >= SKILL_BOOST_MAX_LEVEL) return { profile, error: `${track.name} is already at max level ${SKILL_BOOST_MAX_LEVEL}.` };
  const cost = skillBoostCost(level);
  if (profile.trainingXpPool < cost) {
    return { profile, error: `You need ${cost} Training XP for the next ${track.name} level — you have ${profile.trainingXpPool}.` };
  }
  return {
    profile: {
      ...profile,
      trainingXpPool: profile.trainingXpPool - cost,
      skillBoosts: { ...(profile.skillBoosts ?? {}), [trackId]: level + 1 },
    },
    error: null,
  };
}

/** Apply the profile's boost levels to a template's sub-stats (+1/level). */
export function applySkillBoosts(
  template: PlayerTemplate,
  subStats: SubStats,
  boosts: Record<string, number> | undefined,
): SubStats {
  if (!boosts) return subStats;
  const out = { ...subStats };
  for (const track of SKILL_BOOST_TRACKS) {
    const level = boosts[track.id] ?? 0;
    if (level <= 0) continue;
    if (track.gkOnly !== (template.position === 'GK')) continue;
    for (const key of track.subStats) {
      out[key] = Math.min(99, out[key] + level);
    }
  }
  return out;
}

// ---------- Skill points ----------------------------------------------------------

/** Points earned = one per rank; available = rank − already allocated. */
export function skillPointsAvailable(card: OwnedPlayerCard): number {
  const spent = SKILL_BRANCHES.reduce((sum, b) => sum + card.skillPoints[b.id], 0);
  return card.rank - spent;
}

export function allocateSkillPoint(
  profile: SaveProfile,
  instanceId: string,
  branch: SkillBranch,
): { profile: SaveProfile; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, error: 'That card is no longer in your club.' };
  const template = getPlayerById(card.templateId);
  const def = branchDef(branch);
  if (def.gkOnly && template?.position !== 'GK') {
    return { profile, error: 'GK Diving Focus is for goalkeepers only.' };
  }
  if (!def.gkOnly && template?.position === 'GK' && branch !== 'physical') {
    return { profile, error: 'Goalkeepers train Physical or GK Diving Focus.' };
  }
  if (skillPointsAvailable(card) <= 0) {
    return { profile, error: 'No skill points available — rank this player up to earn more.' };
  }
  if (card.skillPoints[branch] >= 5) return { profile, error: 'That branch is already maxed at 5 points.' };
  const next: OwnedPlayerCard = {
    ...card,
    skillPoints: { ...card.skillPoints, [branch]: card.skillPoints[branch] + 1 },
  };
  return { profile: replaceCard(profile, next), error: null };
}

export function respecSkillPoints(
  profile: SaveProfile,
  instanceId: string,
): { profile: SaveProfile; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, error: 'That card is no longer in your club.' };
  const next: OwnedPlayerCard = {
    ...card,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
  };
  return { profile: replaceCard(profile, next), error: null };
}

export function toggleCardLock(
  profile: SaveProfile,
  instanceId: string,
): { profile: SaveProfile; error: string | null } {
  const card = findCard(profile, instanceId);
  if (!card) return { profile, error: 'That card is no longer in your club.' };
  return { profile: replaceCard(profile, { ...card, locked: !card.locked }), error: null };
}

// ---------- Verification lab --------------------------------------------------------

export interface ProgressionLabResult {
  trainingLevelsOk: boolean;
  trainingBoostOk: boolean;
  capGateOk: boolean;
  fodderXp: number;
  rankUpOk: boolean;
  skillPointOk: boolean;
  upgradedTemplateOk: boolean;
  detail: string;
}

/** Deterministic checks of the real progression math on synthetic cards. */
export function runProgressionLab(): ProgressionLabResult {
  const template = getPlayerById('leg_pelero') ?? getPlayerById('gen_000');
  if (!template) {
    return {
      trainingLevelsOk: false, trainingBoostOk: false, capGateOk: false, fodderXp: 0,
      rankUpOk: false, skillPointOk: false, upgradedTemplateOk: false, detail: 'player database unavailable',
    };
  }
  const base: OwnedPlayerCard = {
    instanceId: 'lab_card', templateId: template.id, trainingLevel: 0, trainingXp: 0, rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked: false,
  };
  // Rank 0 cap is Lv 5: pouring in huge XP must stop exactly at the cap.
  const trained = applyTrainingXp(base, 100000);
  const capGateOk = trained.card.trainingLevel === 5 && trained.capped;
  const boosted = getUpgradedStats(template, trained.card);
  const trainingBoostOk = boosted.core.pac === Math.min(99, template.stats.pac + 5)
    && boosted.subStats.finishing >= template.subStats.finishing;

  // Rank up with a token on a synthetic profile: +1 OVR, cap 5→10, +1 SP.
  const profile: SaveProfile = {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 0, gems: 0, rankUpTokens: 1, trainingXpPool: 0,
    inventory: [trained.card], activeFormationId: '4-3-3-attack',
    startingXI: [trained.card.instanceId, null, null, null, null, null, null, null, null, null, null],
    substitutes: [null, null, null, null, null, null, null],
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [], lastDailyResetIso: new Date(0).toISOString(),
  };
  const ranked = rankUpCard(profile, trained.card.instanceId, 'TOKEN');
  const rankedCard = ranked.profile.inventory[0];
  const rankUpOk = ranked.error === null
    && rankedCard !== undefined
    && rankedCard.rank === 1
    && ranked.profile.rankUpTokens === 0
    && maxTrainingLevelForRank(rankedCard.rank) === 10
    && getCardEffectiveOvr(template, rankedCard) === getCardEffectiveOvr(template, trained.card) + 1
    && skillPointsAvailable(rankedCard) === 1;

  // Spend the earned point on Shooting: finishing +4, core SHO +2.
  let skillPointOk = false;
  let upgradedTemplateOk = false;
  if (rankedCard) {
    const allocated = allocateSkillPoint(ranked.profile, rankedCard.instanceId, 'shooting');
    const allocCard = allocated.profile.inventory[0];
    if (allocated.error === null && allocCard) {
      const before = getUpgradedStats(template, rankedCard);
      const after = getUpgradedStats(template, allocCard);
      skillPointOk = after.subStats.finishing === Math.min(99, before.subStats.finishing + 4)
        && skillPointsAvailable(allocCard) === 0;
      const upgraded = getUpgradedTemplate(template, allocCard);
      upgradedTemplateOk = upgraded.baseOvr === getCardEffectiveOvr(template, allocCard)
        && upgraded.stats.sho > template.stats.sho
        && upgraded.id === template.id;
    }
  }
  const fodderXp = fodderXpValue(template, base);
  return {
    trainingLevelsOk: trained.levelsGained === 5,
    trainingBoostOk,
    capGateOk,
    fodderXp,
    rankUpOk,
    skillPointOk,
    upgradedTemplateOk,
    detail: `${template.shortName}: Lv0→5 (rank-0 cap) · token rank-up → R1, cap 10, +1 SP · Shooting point → Finishing +4 · fodder value ${fodderXp} XP`,
  };
}

// ---------- Epic fix round labs: shards + skill boosts ---------------------------

export interface ShardLabResult {
  convertOk: boolean;
  craftOk: boolean;
  protectedOk: boolean;
  boostOk: boolean;
  detail: string;
}

function shardLabCard(instanceId: string, templateId: string): OwnedPlayerCard {
  return {
    instanceId, templateId, trainingLevel: 0, trainingXp: 0, rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked: false,
  };
}

/** Deterministic checks of the shard economy + the boost layer. */
export function runShardLab(): ShardLabResult {
  const template = getPlayerById('mst_haaland_e') ?? getPlayerById('leg_pelero')!;
  const profile: SaveProfile = {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 0, gems: 0, rankUpTokens: 0, trainingXpPool: 100000,
    inventory: [shardLabCard('c_main', template.id), shardLabCard('c_dup', template.id)],
    activeFormationId: '4-3-3-attack',
    startingXI: ['c_main', ...Array(10).fill(null)], substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(0).toISOString(), rankUpShards: 450,
  };
  // Squad cards and last copies are protected; duplicates convert freely.
  const inXiRes = convertDuplicateToShards(profile, 'c_main');
  const lastCopyProfile: SaveProfile = {
    ...profile,
    inventory: [shardLabCard('c_only', template.id)],
    startingXI: Array(11).fill(null),
  };
  const lastCopyRes = convertDuplicateToShards(lastCopyProfile, 'c_only');
  const protectedOk = inXiRes.error !== null && lastCopyRes.error !== null;
  const converted = convertDuplicateToShards(profile, 'c_dup');
  const convertOk = converted.error === null
    && converted.shardsGained === shardValueOf(template)
    && converted.profile.inventory.length === 1
    && (converted.profile.rankUpShards ?? 0) === 450 + shardValueOf(template);
  // 450 + value ≥ 500 for a MASTER (200) — craft succeeds exactly once.
  const crafted = craftRankUpToken(converted.profile);
  const craftOk = crafted.error === null
    && crafted.profile.rankUpTokens === 1
    && (crafted.profile.rankUpShards ?? 0) === 450 + shardValueOf(template) - SHARDS_PER_TOKEN
    && craftRankUpToken(crafted.profile).error !== null;
  // Boosts: buying a level spends XP and raises the match sub-stats.
  const boosted = upgradeSkillBoost(profile, 'boost_shooting');
  const boostedTemplate = getPlayerById('mst_haaland_e');
  let boostOk = boosted.error === null && (boosted.profile.skillBoosts?.['boost_shooting'] ?? 0) === 1;
  if (boostedTemplate) {
    const plain = getUpgradedTemplate(boostedTemplate, shardLabCard('x', boostedTemplate.id));
    const withBoost = getUpgradedTemplate(boostedTemplate, shardLabCard('x', boostedTemplate.id), boosted.profile.skillBoosts);
    boostOk = boostOk && withBoost.subStats.finishing === Math.min(99, plain.subStats.finishing + 1);
  }
  return {
    convertOk, craftOk, protectedOk, boostOk,
    detail: `dup ${template.shortName} → ${shardValueOf(template)} shards · ${SHARDS_PER_TOKEN} shards = 1 token · last copy protected · Finishing Boost +1 finishing at Lv1`,
  };
}
