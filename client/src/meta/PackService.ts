// Striker FC — meta/PackService.ts (Phase 09, Blueprint 08 §4 + 09 packs)
// Weighted rarity RNG over the full player database. Every pull respects
// the pack's published odds and its guaranteedMinRarity: one card per opening
// is rolled from the renormalized odds of rarities at or above the guarantee,
// so a Master Vault can never whiff below MASTER and a Legend Icon Pack
// always contains a LEGEND. Openings are pure profile transforms — the caller
// persists through commitProfile (SaveSystem), so pulled cards land in the
// same inventory the Squad Builder reads.

import { mulberry32 } from '../core/math';
import { formatNumber } from '../i18n/i18n';
import type { OwnedPlayerCard, PackDef, PlayerTemplate, Rarity, SaveProfile } from '../core/types';
import { ALL_RARITIES } from '../core/types';
import { getAllPlayers, getPlayerById } from '../data/PlayerDatabase';
import { getPackById } from '../data/PacksAndQuests';
import { shardValueOf } from './ProgressionService';

export const FREE_PACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Pulls at or above this OVR trigger the full 5-stage cinematic walkout. */
export const WALKOUT_OVR = 85;

/**
 * Epic P1-3: QUICK-SELL replaces market resale for pack pulls. A pulled
 * card can always be converted instantly at this flat rarity value —
 * pack expected value lands at 55–80% of the coin price (asserted by the
 * pack lab), so the old buy-low / sell-at-market-price arbitrage (a Gold
 * Pro pull reselling for ~29× the pack price) is dead.
 */
export const QUICK_SELL_VALUES: Record<Rarity, number> = {
  BRONZE: 200, SILVER: 600, GOLD: 2000, ELITE: 6000, MASTER: 15000, LEGEND: 40000,
};

/** Expected quick-sell value of one pack opening, from its published odds
 *  (the guaranteed first card uses the renormalized at-least distribution). */
export function packQuickSellEV(pack: PackDef): number {
  const base = ALL_RARITIES.reduce((sum, r) => sum + (pack.odds[r] ?? 0) * QUICK_SELL_VALUES[r], 0);
  if (!pack.guaranteedMinRarity) return base * pack.cardsCount;
  const eligible = ALL_RARITIES.filter((r) => rarityAtLeast(r, pack.guaranteedMinRarity!) && (pack.odds[r] ?? 0) > 0);
  const total = eligible.reduce((sum, r) => sum + (pack.odds[r] ?? 0), 0);
  const guaranteed = total > 0
    ? eligible.reduce((sum, r) => sum + (pack.odds[r] ?? 0) * QUICK_SELL_VALUES[r], 0) / total
    : QUICK_SELL_VALUES[pack.guaranteedMinRarity];
  return guaranteed + base * (pack.cardsCount - 1);
}

/** Epic P1-3 pity: openings without an Elite+ / Master+ pull before the
 *  NEXT opening forces that tier (counters shown on the pack card). */
export const PITY_ELITE_OPENS = 10;
export const PITY_MASTER_OPENS = 25;

export const RARITY_ORDER: Record<Rarity, number> = {
  BRONZE: 0, SILVER: 1, GOLD: 2, ELITE: 3, MASTER: 4, LEGEND: 5,
};

export function rarityAtLeast(rarity: Rarity, min: Rarity): boolean {
  return RARITY_ORDER[rarity] >= RARITY_ORDER[min];
}

let instanceSeq = 0;
/** Unique instance id for a pulled card (duplicates are rank-up fuel). */
export function nextPackInstanceId(templateId: string, nowMs: number): string {
  instanceSeq += 1;
  return `card_pack_${templateId}_${nowMs.toString(36)}_${instanceSeq.toString(36)}`;
}

export function makePulledCard(templateId: string, nowMs: number): OwnedPlayerCard {
  return {
    instanceId: nextPackInstanceId(templateId, nowMs),
    templateId,
    trainingLevel: 0,
    trainingXp: 0,
    rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked: false,
  };
}

/** Weighted rarity roll from a pack's published odds table. */
export function rollRarity(pack: PackDef, rng: () => number): Rarity {
  let roll = rng();
  for (const rarity of ALL_RARITIES) {
    const weight = pack.odds[rarity] ?? 0;
    if (weight <= 0) continue;
    if (roll < weight) return rarity;
    roll -= weight;
  }
  // Floating-point tail: fall back to the rarest rarity with any weight.
  for (let i = ALL_RARITIES.length - 1; i >= 0; i -= 1) {
    const rarity = ALL_RARITIES[i]!;
    if ((pack.odds[rarity] ?? 0) > 0) return rarity;
  }
  return 'BRONZE';
}

/** Rarity roll restricted to rarities at or above `min` (odds renormalized). */
export function rollRarityAtLeast(pack: PackDef, min: Rarity, rng: () => number): Rarity {
  const eligible = ALL_RARITIES.filter((r) => rarityAtLeast(r, min) && (pack.odds[r] ?? 0) > 0);
  const total = eligible.reduce((sum, r) => sum + (pack.odds[r] ?? 0), 0);
  if (eligible.length === 0 || total <= 0) return min;
  let roll = rng() * total;
  for (const rarity of eligible) {
    const weight = pack.odds[rarity] ?? 0;
    if (roll < weight) return rarity;
    roll -= weight;
  }
  return eligible[eligible.length - 1]!;
}

/**
 * A real database player of the given rarity (uniform pick within the band).
 * Real-world LEGENDs (Messi / Ronaldo / Mbappé) are pack-gated: they enter
 * the pool only when `allowRealLegends` is set — the Legend Icon Pack and
 * its Star Pass grant — never in regular packs.
 */
export function pickPlayerOfRarity(rarity: Rarity, rng: () => number, allowRealLegends = false): PlayerTemplate | null {
  const pool = getAllPlayers().filter((p) => p.rarity === rarity
    && (allowRealLegends || !p.realWorld || p.rarity !== 'LEGEND'));
  if (pool.length === 0) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx] ?? null;
}

export interface PackPull {
  template: PlayerTemplate;
  card: OwnedPlayerCard;
}

export interface WalkoutMeta {
  template: PlayerTemplate;
  card: OwnedPlayerCard;
  isWalkout: boolean;
}

export interface PackOpenResult {
  profile: SaveProfile;
  pulls: PackPull[];
  walkout: WalkoutMeta | null;
  error: string | null;
  /** Epic fix round (P0-4): shards paid for pulls that duplicated a
   *  max-rank card (auto-converted instead of stacking a useless copy). */
  shardsGained: number;
}

/** Milliseconds left on the Daily Free Pack cooldown (0 = ready). */
export function freePackCooldownMs(profile: SaveProfile, nowMs: number): number {
  if (!profile.lastFreePackIso) return 0;
  const last = Date.parse(profile.lastFreePackIso);
  if (!Number.isFinite(last)) return 0;
  return Math.max(0, FREE_PACK_COOLDOWN_MS - (nowMs - last));
}

export function canAfford(profile: SaveProfile, pack: PackDef): boolean {
  return pack.currency === 'COINS' ? profile.coins >= pack.price : profile.gems >= pack.price;
}

export function canOpenPack(
  profile: SaveProfile,
  pack: PackDef,
  nowMs: number,
): { ok: boolean; error: string | null } {
  if (pack.id === 'daily_free') {
    const left = freePackCooldownMs(profile, nowMs);
    if (left > 0) {
      const hours = Math.floor(left / 3_600_000);
      const mins = Math.ceil((left % 3_600_000) / 60_000);
      return { ok: false, error: `Daily Welcome Pack is on cooldown — back in ${hours}h ${mins}m.` };
    }
    return { ok: true, error: null };
  }
  if (!canAfford(profile, pack)) {
    return {
      ok: false,
      error: pack.currency === 'COINS'
        ? `Not enough Coins — this pack costs ${formatNumber(pack.price)} and you hold ${formatNumber(profile.coins)}.`
        : `Not enough Gems — this pack costs ${formatNumber(pack.price)} and you hold ${formatNumber(profile.gems)}.`,
    };
  }
  return { ok: true, error: null };
}

/**
 * Roll a pack's cards WITHOUT charging or saving (used by the free Tier-20
 * Season Pass Legend Icon Pack grant as well as by openPack).
 */
export function rollPackCards(pack: PackDef, rng: () => number, nowMs: number): PackPull[] {
  const allowRealLegends = pack.id === 'legend_icon';
  const pulls: PackPull[] = [];
  for (let i = 0; i < pack.cardsCount; i += 1) {
    // The first card of a guaranteed pack carries the guarantee.
    const rarity = i === 0 && pack.guaranteedMinRarity
      ? rollRarityAtLeast(pack, pack.guaranteedMinRarity, rng)
      : rollRarity(pack, rng);
    const template = pickPlayerOfRarity(rarity, rng, allowRealLegends);
    if (!template) continue;
    const card = makePulledCard(template.id, nowMs);
    // Epic P1-3: gem-pack pulls are untradeable (quick-sell → Training XP).
    if (pack.currency === 'GEMS') card.fromGemPack = true;
    pulls.push({ template, card });
  }
  return pulls;
}

/** The highest-OVR pull drives the walkout (85+ = full cinematic). */
export function walkoutFor(pulls: PackPull[]): WalkoutMeta | null {
  if (pulls.length === 0) return null;
  const best = pulls.reduce((a, b) => (b.template.baseOvr > a.template.baseOvr ? b : a), pulls[0]!);
  return { template: best.template, card: best.card, isWalkout: best.template.baseOvr >= WALKOUT_OVR };
}

/**
 * Open a pack: currency check + Daily Free cooldown, deduct, roll real
 * database players, add them to inventory, stamp the free-pack cooldown.
 * Pure — returns the next profile; the caller commits it.
 */
export function openPack(
  profile: SaveProfile,
  packId: string,
  rng: () => number,
  nowMs: number,
): PackOpenResult {
  const pack = getPackById(packId);
  if (!pack) return { profile, pulls: [], walkout: null, error: 'That pack is no longer in the Store.', shardsGained: 0 };
  const gate = canOpenPack(profile, pack, nowMs);
  if (!gate.ok) return { profile, pulls: [], walkout: null, error: gate.error, shardsGained: 0 };
  const pulls = rollPackCards(pack, rng, nowMs);
  if (pulls.length === 0) return { profile, pulls: [], walkout: null, error: 'The pack came up empty — no charge was made.', shardsGained: 0 };
  // Epic P1-3 pity timers: 10 opens without an Elite+ forces an Elite+,
  // 25 without a Master+ forces a Master+ — the weakest pull is upgraded.
  const pity = profile.packPity ?? { sinceElite: 0, sinceMaster: 0 };
  const hasAtLeast = (min: Rarity) => pulls.some((p) => rarityAtLeast(p.template.rarity, min));
  const upgradeWeakest = (min: Rarity) => {
    const allowRealLegends = pack.id === 'legend_icon';
    const rarity = rollRarityAtLeast(pack, min, rng);
    const template = pickPlayerOfRarity(rarity, rng, allowRealLegends);
    if (!template) return;
    let weakest = 0;
    for (let i = 1; i < pulls.length; i += 1) {
      if (pulls[i]!.template.baseOvr < pulls[weakest]!.template.baseOvr) weakest = i;
    }
    const card = makePulledCard(template.id, nowMs);
    if (pack.currency === 'GEMS') card.fromGemPack = true;
    pulls[weakest] = { template, card };
  };
  if (pity.sinceMaster + 1 >= PITY_MASTER_OPENS && !hasAtLeast('MASTER')) upgradeWeakest('MASTER');
  else if (pity.sinceElite + 1 >= PITY_ELITE_OPENS && !hasAtLeast('ELITE')) upgradeWeakest('ELITE');
  const nextPity = {
    sinceElite: hasAtLeast('ELITE') ? 0 : pity.sinceElite + 1,
    sinceMaster: hasAtLeast('MASTER') ? 0 : pity.sinceMaster + 1,
  };
  // P0-4: a pull that duplicates a card already at max Rank 5 cannot fuel
  //  another rank-up — it converts straight into Rank-Up Shards instead of
  //  stacking a dead copy in the inventory.
  const maxRankTemplates = new Set(
    profile.inventory.filter((c) => c.rank >= 5).map((c) => c.templateId),
  );
  let shardsGained = 0;
  const keptCards: OwnedPlayerCard[] = [];
  for (const pull of pulls) {
    if (maxRankTemplates.has(pull.template.id)) {
      shardsGained += shardValueOf(pull.template);
    } else {
      keptCards.push(pull.card);
    }
  }
  const next: SaveProfile = {
    ...profile,
    coins: pack.currency === 'COINS' ? profile.coins - pack.price : profile.coins,
    gems: pack.currency === 'GEMS' ? profile.gems - pack.price : profile.gems,
    inventory: [...profile.inventory, ...keptCards],
    rankUpShards: (profile.rankUpShards ?? 0) + shardsGained,
    lastFreePackIso: pack.id === 'daily_free' ? new Date(nowMs).toISOString() : profile.lastFreePackIso ?? null,
    packPity: nextPity,
    packsOpened: (profile.packsOpened ?? 0) + 1,
  };
  return { profile: next, pulls, walkout: walkoutFor(pulls), error: null, shardsGained };
}

// ---------- Exchange (Epic fix round, P2-18) --------------------------------------

/** Rarities the Exchange can pay out (LEGEND stays pack-gated by design). */
const EXCHANGE_NEXT: Partial<Record<Rarity, Rarity>> = {
  BRONZE: 'SILVER', SILVER: 'GOLD', GOLD: 'ELITE', ELITE: 'MASTER',
};

export interface ExchangeResult {
  profile: SaveProfile;
  granted: PlayerTemplate | null;
  error: string | null;
}

/**
 * Exchange: 3 unlocked duplicate cards of one rarity → 1 random card of
 * the next rarity up. Every consumed card must be a true duplicate (a copy
 * of the same player stays in the club) and outside the squad.
 */
export function exchangeDuplicates(
  profile: SaveProfile,
  instanceIds: string[],
  rng: () => number,
  nowMs: number,
): ExchangeResult {
  if (instanceIds.length !== 3) return { profile, granted: null, error: 'Pick exactly 3 duplicate cards to exchange.' };
  const xi = new Set(profile.startingXI.filter((v): v is string => v !== null));
  const subs = new Set(profile.substitutes.filter((v): v is string => v !== null));
  const cards: OwnedPlayerCard[] = [];
  for (const id of instanceIds) {
    const card = profile.inventory.find((c) => c.instanceId === id);
    if (!card) return { profile, granted: null, error: 'One of those cards is no longer in your club.' };
    if (card.locked) return { profile, granted: null, error: 'A locked card cannot be exchanged — unlock it first.' };
    if (xi.has(id) || subs.has(id)) return { profile, granted: null, error: 'A squad card cannot be exchanged.' };
    const copiesLeft = profile.inventory.filter(
      (c) => c.templateId === card.templateId && !instanceIds.includes(c.instanceId),
    ).length;
    if (copiesLeft === 0) return { profile, granted: null, error: 'Only duplicates can be exchanged — the last copy of a player is protected.' };
    cards.push(card);
  }
  const rarities = new Set(cards.map((c) => getPlayerById(c.templateId)?.rarity));
  if (rarities.size !== 1) return { profile, granted: null, error: 'All 3 cards must be the same rarity.' };
  const fromRarity = [...rarities][0];
  if (!fromRarity) return { profile, granted: null, error: 'Those cards could not be read.' };
  const nextRarity = EXCHANGE_NEXT[fromRarity];
  if (!nextRarity) return { profile, granted: null, error: `${fromRarity} cards are already at the top — Legends only come from the Legend Icon Pack.` };
  const granted = pickPlayerOfRarity(nextRarity, rng, false);
  if (!granted) return { profile, granted: null, error: 'No player of that rarity is available right now.' };
  const consumed = new Set(instanceIds);
  return {
    profile: {
      ...profile,
      inventory: [
        ...profile.inventory.filter((c) => !consumed.has(c.instanceId)),
        makePulledCard(granted.id, nowMs),
      ],
    },
    granted,
    error: null,
  };
}

export interface ExchangeLabResult {
  exchangeOk: boolean;
  protectionOk: boolean;
  detail: string;
}

/** Deterministic checks of the Exchange rules on synthetic duplicates. */
export function runExchangeLab(): ExchangeLabResult {
  const golds = getAllPlayers().filter((p) => p.rarity === 'GOLD').slice(0, 2);
  const mk = (instanceId: string, templateId: string): OwnedPlayerCard => ({
    instanceId, templateId, trainingLevel: 0, trainingXp: 0, rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked: false,
  });
  const a = golds[0]!;
  const b = golds[1] ?? golds[0]!;
  const profile: SaveProfile = {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 0, gems: 0, rankUpTokens: 0, trainingXpPool: 0,
    inventory: [
      mk('keep_a', a.id), mk('dup_a1', a.id), mk('dup_a2', a.id),
      mk('keep_b', b.id), mk('dup_b1', b.id),
    ],
    activeFormationId: '4-3-3-attack',
    startingXI: Array(11).fill(null), substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(0).toISOString(),
  };
  const res = exchangeDuplicates(profile, ['dup_a1', 'dup_a2', 'dup_b1'], mulberry32(42), 1_700_000_000_000);
  const exchangeOk = res.error === null && res.granted?.rarity === 'ELITE'
    && res.profile.inventory.length === 3
    && res.profile.inventory.some((c) => c.templateId === res.granted!.id);
  const protectedRes = exchangeDuplicates(profile, ['keep_a', 'dup_a1', 'dup_a2'], mulberry32(42), 1_700_000_000_000);
  const protectionOk = protectedRes.error !== null && protectedRes.profile === profile;
  return {
    exchangeOk, protectionOk,
    detail: `3 GOLD duplicates → 1 ELITE (${res.granted?.shortName ?? 'none'}) · last-copy exchange refused`,
  };
}

// ---------- Verification lab --------------------------------------------------------

export interface PackLabResult {
  goldOk: boolean;
  guaranteeOk: boolean;
  legendOk: boolean;
  cooldownOk: boolean;
  fundsOk: boolean;
  walkoutOk: boolean;
  /** Epic P1-3: quick-sell EV of every paid coin pack is 55–80% of price. */
  evOk: boolean;
  /** Epic P1-3: pity timers force Elite+ / Master+ on schedule. */
  pityOk: boolean;
  detail: string;
}

function labProfile(coins: number, gems: number): SaveProfile {
  return {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins, gems, rankUpTokens: 0, trainingXpPool: 0,
    inventory: [], activeFormationId: '4-3-3-attack',
    startingXI: Array(11).fill(null), substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(0).toISOString(),
    lastFreePackIso: null, marketPrices: {}, marketLastDriftIso: null, pendingSales: [],
    lastWeeklyResetIso: new Date(0).toISOString(),
  };
}

/** Deterministic checks of the real pack RNG, guarantees and economy gates. */
export function runPackLab(): PackLabResult {
  const now = 1_700_000_000_000;
  // Gold Pro: 15,000 coins deducted, exactly 4 real cards added.
  const gold = openPack(labProfile(100000, 5000), 'gold_pro', mulberry32(42), now);
  const goldOk = gold.error === null && gold.pulls.length === 4
    && gold.profile.coins === 85000 && gold.profile.inventory.length === 4
    && gold.pulls.every((p) => p.template.id.length > 0);
  // Guarantees hold across many seeds: Elite pack ≥1 ELITE+, Master ≥1 MASTER+.
  let guaranteeOk = true;
  for (let seed = 1; seed <= 24; seed += 1) {
    const elite = openPack(labProfile(100000, 5000), 'elite_attack', mulberry32(seed * 7), now);
    if (!elite.pulls.some((p) => rarityAtLeast(p.template.rarity, 'ELITE'))) guaranteeOk = false;
    const master = openPack(labProfile(100000, 5000), 'master_vault', mulberry32(seed * 13), now);
    if (!master.pulls.some((p) => rarityAtLeast(p.template.rarity, 'MASTER'))) guaranteeOk = false;
  }
  // Legend Icon Pack always contains a LEGEND and always triggers a walkout.
  let legendOk = true;
  let walkoutOk = true;
  for (let seed = 1; seed <= 12; seed += 1) {
    const legend = openPack(labProfile(0, 9000), 'legend_icon', mulberry32(seed * 29), now);
    if (!legend.pulls.some((p) => p.template.rarity === 'LEGEND')) legendOk = false;
    if (!legend.walkout?.isWalkout) walkoutOk = false;
    if (legend.profile.gems !== 9000 - 2500) legendOk = false;
  }
  // Real-world LEGENDs (Messi / Ronaldo / Mbappé) never leak into regular
  // packs: sweep the Master Vault (9% LEGEND odds) across many seeds.
  for (let seed = 1; seed <= 24; seed += 1) {
    const vault = openPack(labProfile(100000, 5000), 'master_vault', mulberry32(seed * 41), now);
    if (vault.pulls.some((p) => p.template.realWorld && p.template.rarity === 'LEGEND')) legendOk = false;
  }
  // Daily Free: first open succeeds, the second inside 24h is refused.
  const free1 = openPack(labProfile(0, 0), 'daily_free', mulberry32(5), now);
  const free2 = openPack(free1.profile, 'daily_free', mulberry32(6), now + 60_000);
  const free3 = openPack(free1.profile, 'daily_free', mulberry32(6), now + FREE_PACK_COOLDOWN_MS + 1);
  const cooldownOk = free1.error === null && free1.pulls.length === 3
    && free2.error !== null && free3.error === null;
  // Insufficient funds are refused with no charge and no cards.
  const broke = openPack(labProfile(100, 0), 'gold_pro', mulberry32(3), now);
  const fundsOk = broke.error !== null && broke.profile.coins === 100 && broke.profile.inventory.length === 0;
  // Epic P1-3 pack-EV assertion: quick-sell expected value of every paid
  // COIN pack must sit between 55% and 80% of its price — high enough to
  // feel fair, low enough that packs can never print coins.
  let evOk = true;
  const evNotes: string[] = [];
  for (const id of ['gold_pro', 'elite_attack']) {
    const pack = getPackById(id);
    if (!pack) { evOk = false; continue; }
    const ratio = packQuickSellEV(pack) / pack.price;
    evNotes.push(`${pack.name} EV ${(ratio * 100).toFixed(0)}%`);
    if (ratio < 0.55 || ratio > 0.80) evOk = false;
  }
  // Epic P1-3 pity: a profile 9 opens without an Elite+ gets one forced on
  // the 10th open; 24 without a Master+ forces a Master+ on the 25th.
  let pityOk = true;
  {
    let seed = 0;
    for (let s = 1; s <= 60; s += 1) {
      const probe = openPack(labProfile(100000, 5000), 'gold_pro', mulberry32(s), now);
      if (!probe.pulls.some((p) => rarityAtLeast(p.template.rarity, 'ELITE'))) { seed = s; break; }
    }
    if (seed === 0) pityOk = false;
    else {
      const dry: SaveProfile = { ...labProfile(100000, 5000), packPity: { sinceElite: PITY_ELITE_OPENS - 1, sinceMaster: 0 } };
      const forced = openPack(dry, 'gold_pro', mulberry32(seed), now);
      if (!forced.pulls.some((p) => rarityAtLeast(p.template.rarity, 'ELITE'))) pityOk = false;
      if (forced.profile.packPity?.sinceElite !== 0) pityOk = false;
      const dryMaster: SaveProfile = { ...labProfile(100000, 5000), packPity: { sinceElite: 0, sinceMaster: PITY_MASTER_OPENS - 1 } };
      const forcedMaster = openPack(dryMaster, 'gold_pro', mulberry32(seed), now);
      if (!forcedMaster.pulls.some((p) => rarityAtLeast(p.template.rarity, 'MASTER'))) pityOk = false;
    }
  }
  return {
    goldOk, guaranteeOk, legendOk, cooldownOk, fundsOk, walkoutOk, evOk, pityOk,
    detail: `Gold Pro −15,000c → 4 cards · ELITE/MASTER guarantees held over 24 seeds · Legend pack always LEGEND + walkout · free-pack 24h cooldown enforced · ${evNotes.join(' · ')} · pity forces Elite+ at ${PITY_ELITE_OPENS} opens, Master+ at ${PITY_MASTER_OPENS}`,
  };
}
