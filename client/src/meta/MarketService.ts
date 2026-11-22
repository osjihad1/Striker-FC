// Striker FC — meta/MarketService.ts (Phase 09, Blueprint 08 §4)
// Simulated live Transfer Market over the full player database. Prices
// live in SaveProfile.marketPrices and drift ±5% on a 2-minute cadence
// (supply/demand random walk, floored at 40% and capped at 300% of base).
// Buy Now is instant delivery to inventory; Sell From Club escrows the card
// into a PendingSale that a simulated buyer completes in 10–25s, paying
// 95% of the list price after the 5% listing fee — claimed from the SOLD!
// inbox. Epic P1-3 adds QUICK-SELL (flat rarity value, the only way pack
// pulls convert to coins) and a 10-per-day sell cap across both routes.
// Locked cards and the active Starting XI can never be sold.

import { ECONOMY } from '../core/constants';
import { formatNumber } from '../i18n/i18n';
import { mulberry32 } from '../core/math';
import type {
MarketPriceEntry, OwnedPlayerCard, PlayerTemplate, Position, Rarity, SaveProfile,
} from '../core/types';
import { getAllPlayers, getPlayerById } from '../data/PlayerDatabase';
import { QUICK_SELL_VALUES, makePulledCard } from './PackService';

export const MARKET_DRIFT_INTERVAL_MS = 2 * 60 * 1000;
export const MARKET_DRIFT_MAX = 0.05;
export const SALE_MIN_DELAY_MS = 10_000;
export const SALE_MAX_DELAY_MS = 25_000;
/** Epic P1-3: listings + quick-sells share one daily cap. */
export const DAILY_SELL_CAP = 10;

/** Sales already made on the UTC day of `nowMs` (cap bookkeeping). */
export function salesTodayCount(profile: SaveProfile, nowMs: number): number {
  const key = new Date(nowMs).toISOString().slice(0, 10);
  return profile.salesDayKey === key ? (profile.salesToday ?? 0) : 0;
}

function withSaleCounted(profile: SaveProfile, nowMs: number): SaveProfile {
  const key = new Date(nowMs).toISOString().slice(0, 10);
  return { ...profile, salesDayKey: key, salesToday: salesTodayCount(profile, nowMs) + 1 };
}

export function marketPriceOf(profile: SaveProfile, template: PlayerTemplate): number {
  return profile.marketPrices?.[template.id]?.price ?? template.baseMarketPrice;
}

export function marketEntryOf(profile: SaveProfile, template: PlayerTemplate): MarketPriceEntry {
  return profile.marketPrices?.[template.id] ?? {
    price: template.baseMarketPrice,
    prevPrice: template.baseMarketPrice,
    updatedAtIso: profile.marketLastDriftIso ?? new Date(0).toISOString(),
  };
}

/** Signed % change of the current price vs the previous drift tick. */
export function marketTrendPct(profile: SaveProfile, template: PlayerTemplate): number {
  const entry = marketEntryOf(profile, template);
  if (entry.prevPrice <= 0) return 0;
  return ((entry.price - entry.prevPrice) / entry.prevPrice) * 100;
}

/**
 * One drift tick: every template's price random-walks ±5% (previous price is
 * kept for the trend indicator). Pure; the caller commits when it applies.
 */
export function driftMarketPrices(profile: SaveProfile, rng: () => number, nowMs: number): SaveProfile {
  const prices: Record<string, MarketPriceEntry> = { ...(profile.marketPrices ?? {}) };
  const nowIso = new Date(nowMs).toISOString();
  for (const template of getAllPlayers()) {
    const current = prices[template.id]?.price ?? template.baseMarketPrice;
    const swing = (rng() * 2 - 1) * MARKET_DRIFT_MAX;
    const floor = Math.round(template.baseMarketPrice * 0.4);
    const cap = Math.round(template.baseMarketPrice * 3);
    const next = Math.max(floor, Math.min(cap, Math.round(current * (1 + swing))));
    prices[template.id] = { price: next, prevPrice: current, updatedAtIso: nowIso };
  }
  return { ...profile, marketPrices: prices, marketLastDriftIso: nowIso };
}

/** True when the 2-minute drift cadence is due (or prices were never seeded). */
export function marketDriftDue(profile: SaveProfile, nowMs: number): boolean {
  if (!profile.marketPrices || Object.keys(profile.marketPrices).length === 0) return true;
  if (!profile.marketLastDriftIso) return true;
  const last = Date.parse(profile.marketLastDriftIso);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= MARKET_DRIFT_INTERVAL_MS;
}

/** Apply a drift tick iff due; returns the profile unchanged otherwise. */
export function refreshMarketIfDue(profile: SaveProfile, rng: () => number, nowMs: number): SaveProfile {
  return marketDriftDue(profile, nowMs) ? driftMarketPrices(profile, rng, nowMs) : profile;
}

// ---------- Filters -------------------------------------------------------------

export interface MarketFilters {
  query: string;
  position: Position | 'ALL';
  rarity: Rarity | 'ALL';
  minOvr: number;
  maxOvr: number;
  maxPrice: number;
}

export const DEFAULT_MARKET_FILTERS: MarketFilters = {
  query: '', position: 'ALL', rarity: 'ALL', minOvr: 60, maxOvr: 99, maxPrice: Number.POSITIVE_INFINITY,
};

export function filterMarket(
  profile: SaveProfile,
  templates: PlayerTemplate[],
  filters: MarketFilters,
): PlayerTemplate[] {
  const q = filters.query.trim().toLowerCase();
  return templates.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (filters.position !== 'ALL' && t.position !== filters.position) return false;
    if (filters.rarity !== 'ALL' && t.rarity !== filters.rarity) return false;
    if (t.baseOvr < filters.minOvr || t.baseOvr > filters.maxOvr) return false;
    if (marketPriceOf(profile, t) > filters.maxPrice) return false;
    return true;
  });
}

// ---------- Buy -------------------------------------------------------------------

export interface MarketBuyResult {
  profile: SaveProfile;
  card: OwnedPlayerCard | null;
  pricePaid: number;
  error: string | null;
}

/** Buy Now: deduct the live market price, deliver a fresh card instantly. */
export function buyPlayer(
  profile: SaveProfile,
  templateId: string,
  nowMs: number,
): MarketBuyResult {
  const template = getPlayerById(templateId);
  if (!template) return { profile, card: null, pricePaid: 0, error: 'That player is no longer listed.' };
  // Epic P1-3: real-world LEGENDs are never sold — enforced here in the
  // service itself, not just hidden from the market list.
  if (template.rarity === 'LEGEND' && template.realWorld) {
    return {
      profile, card: null, pricePaid: 0,
      error: `${template.name} is a Legend — Legends only ever come out of the Legend Icon Pack in the Store.`,
    };
  }
  const price = marketPriceOf(profile, template);
  if (profile.coins < price) {
    return {
      profile, card: null, pricePaid: 0,
      error: `Not enough Coins — ${template.name} costs ${formatNumber(price)} and you hold ${formatNumber(profile.coins)}.`,
    };
  }
  const card = makePulledCard(template.id, nowMs);
  return {
    profile: { ...profile, coins: profile.coins - price, inventory: [...profile.inventory, card] },
    card,
    pricePaid: price,
    error: null,
  };
}

// ---------- Sell ------------------------------------------------------------------

/** Why a card cannot be listed (null = sellable). */
export function sellBlockReason(profile: SaveProfile, card: OwnedPlayerCard): string | null {
  if (card.locked) return 'Locked — unlock it from the player detail screen first.';
  if (profile.startingXI.includes(card.instanceId)) return 'In your Starting XI — move them out of the XI first.';
  if ((profile.pendingSales ?? []).some((s) => s.id === `sale_${card.instanceId}`)) return 'Already listed for sale.';
  return null;
}

export interface MarketSellResult {
  profile: SaveProfile;
  saleId: string | null;
  error: string | null;
}

/**
 * List a card for sale: it leaves the club (and the bench) into escrow, and a
 * simulated buyer completes the purchase 10–25s later at 90% of list price.
 */
export function listCardForSale(
  profile: SaveProfile,
  instanceId: string,
  rng: () => number,
  nowMs: number,
): MarketSellResult {
  const card = profile.inventory.find((c) => c.instanceId === instanceId);
  if (!card) return { profile, saleId: null, error: 'That card is no longer in your club.' };
  const blocked = sellBlockReason(profile, card);
  if (blocked) return { profile, saleId: null, error: blocked };
  if (salesTodayCount(profile, nowMs) >= DAILY_SELL_CAP) {
    return { profile, saleId: null, error: `Daily sell limit reached (${DAILY_SELL_CAP} per day) — the market reopens at the daily reset.` };
  }
  const template = getPlayerById(card.templateId);
  if (!template) return { profile, saleId: null, error: 'Player data is missing for that card.' };
  const listPrice = marketPriceOf(profile, template);
  const delay = SALE_MIN_DELAY_MS + rng() * (SALE_MAX_DELAY_MS - SALE_MIN_DELAY_MS);
  const saleId = `sale_${instanceId}`;
  const next: SaveProfile = {
    ...withSaleCounted(profile, nowMs),
    inventory: profile.inventory.filter((c) => c.instanceId !== instanceId),
    substitutes: profile.substitutes.map((s) => (s === instanceId ? null : s)),
    pendingSales: [
      ...(profile.pendingSales ?? []),
      {
        id: saleId,
        templateId: template.id,
        listPrice,
        netPayout: Math.floor(listPrice * (1 - ECONOMY.MARKET_TAX_RATE)),
        listedAtIso: new Date(nowMs).toISOString(),
        sellsAtIso: new Date(nowMs + delay).toISOString(),
      },
    ],
  };
  return { profile: next, saleId, error: null };
}

export interface QuickSellResult {
  profile: SaveProfile;
  coins: number;
  trainingXp: number;
  error: string | null;
}

/**
 * Epic P1-3 QUICK-SELL: instantly convert a card at the flat rarity value
 * (PackService.QUICK_SELL_VALUES) — the ONLY conversion rate for pack
 * pulls, so a pull can never be flipped at market price for a profit.
 * Gem-pack pulls are untradeable: they convert to Training XP instead.
 */
export function quickSellCard(
  profile: SaveProfile,
  instanceId: string,
  nowMs: number,
): QuickSellResult {
  const card = profile.inventory.find((c) => c.instanceId === instanceId);
  if (!card) return { profile, coins: 0, trainingXp: 0, error: 'That card is no longer in your club.' };
  const blocked = sellBlockReason(profile, card);
  if (blocked) return { profile, coins: 0, trainingXp: 0, error: blocked };
  if (salesTodayCount(profile, nowMs) >= DAILY_SELL_CAP) {
    return { profile, coins: 0, trainingXp: 0, error: `Daily sell limit reached (${DAILY_SELL_CAP} per day) — selling reopens at the daily reset.` };
  }
  const template = getPlayerById(card.templateId);
  if (!template) return { profile, coins: 0, trainingXp: 0, error: 'Player data is missing for that card.' };
  const value = QUICK_SELL_VALUES[template.rarity];
  const base: SaveProfile = {
    ...withSaleCounted(profile, nowMs),
    inventory: profile.inventory.filter((c) => c.instanceId !== instanceId),
    substitutes: profile.substitutes.map((s) => (s === instanceId ? null : s)),
  };
  if (card.fromGemPack) {
    const xp = Math.floor(value / 10);
    return { profile: { ...base, trainingXpPool: profile.trainingXpPool + xp }, coins: 0, trainingXp: xp, error: null };
  }
  return { profile: { ...base, coins: profile.coins + value }, coins: value, trainingXp: 0, error: null };
}

/** A pending sale whose simulated buyer has completed → the SOLD! badge. */
export function saleIsClaimable(sale: { sellsAtIso: string }, nowMs: number): boolean {
  const at = Date.parse(sale.sellsAtIso);
  return Number.isFinite(at) && nowMs >= at;
}

export function claimableSales(profile: SaveProfile, nowMs: number) {
  return (profile.pendingSales ?? []).filter((s) => saleIsClaimable(s, nowMs));
}

/** Claim a completed sale: credit the 90% net payout, clear the inbox entry. */
export function claimSale(
  profile: SaveProfile,
  saleId: string,
  nowMs: number,
): { profile: SaveProfile; payout: number; error: string | null } {
  const sale = (profile.pendingSales ?? []).find((s) => s.id === saleId);
  if (!sale) return { profile, payout: 0, error: 'That sale is no longer in your inbox.' };
  if (!saleIsClaimable(sale, nowMs)) {
    return { profile, payout: 0, error: 'The buyer has not completed yet — check back in a few seconds.' };
  }
  return {
    profile: {
      ...profile,
      coins: profile.coins + sale.netPayout,
      pendingSales: (profile.pendingSales ?? []).filter((s) => s.id !== saleId),
    },
    payout: sale.netPayout,
    error: null,
  };
}

// ---------- Verification lab --------------------------------------------------------

export interface MarketLabResult {
  driftOk: boolean;
  buyOk: boolean;
  sellGuardOk: boolean;
  saleOk: boolean;
  /** Epic P1-3: quick-sell pays the flat rarity value; gem pulls pay XP;
   *  real Legends can never be bought; the daily sell cap holds. */
  quickSellOk: boolean;
  detail: string;
}

function labCard(instanceId: string, templateId: string, locked: boolean): OwnedPlayerCard {
  return {
    instanceId, templateId, trainingLevel: 0, trainingXp: 0, rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked,
  };
}

export function runMarketLab(): MarketLabResult {
  const now = 1_700_000_000_000;
  const target = getAllPlayers().find((p) => p.rarity === 'GOLD') ?? getAllPlayers()[0]!;
  const base: SaveProfile = {
    version: 1, managerName: 'Lab', clubName: 'Lab FC', clubAbbr: 'LAB',
    clubPrimaryColor: '#a3e635', clubSecondaryColor: '#0a120c',
    coins: 500000, gems: 0, rankUpTokens: 0, trainingXpPool: 0,
    inventory: [], activeFormationId: '4-3-3-attack',
    startingXI: Array(11).fill(null), substitutes: Array(7).fill(null),
    h2hDivision: 1, h2hStars: 0, vsaFans: 0, managerTrophies: 0,
    questProgress: {}, seasonPassXp: 0, seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date(0).toISOString(),
    lastFreePackIso: null, marketPrices: {}, marketLastDriftIso: null, pendingSales: [],
    lastWeeklyResetIso: new Date(0).toISOString(),
  };
  // Drift: every price moves within ±5% of its previous value, trend matches.
  const drifted = driftMarketPrices(base, mulberry32(99), now);
  let driftOk = Object.keys(drifted.marketPrices ?? {}).length === getAllPlayers().length;
  for (const t of getAllPlayers()) {
    const entry = drifted.marketPrices?.[t.id];
    if (!entry) { driftOk = false; break; }
    const pct = Math.abs((entry.price - t.baseMarketPrice) / t.baseMarketPrice);
    if (pct > MARKET_DRIFT_MAX + 1e-9) driftOk = false;
    if (entry.prevPrice !== t.baseMarketPrice) driftOk = false;
  }
  const second = driftMarketPrices(drifted, mulberry32(7), now + MARKET_DRIFT_INTERVAL_MS);
  const entry2 = second.marketPrices?.[target.id];
  const firstEntry = drifted.marketPrices?.[target.id];
  if (entry2 && firstEntry) {
    const expectedTrend = ((entry2.price - entry2.prevPrice) / entry2.prevPrice) * 100;
    if (Math.abs(marketTrendPct(second, target) - expectedTrend) > 1e-9) driftOk = false;
    if (Math.abs(entry2.price - firstEntry.price) / firstEntry.price > MARKET_DRIFT_MAX + 1e-9) driftOk = false;
  } else driftOk = false;
  // The cadence gate: not due 1 minute later, due at 2 minutes.
  if (marketDriftDue(drifted, now + 60_000) || !marketDriftDue(drifted, now + MARKET_DRIFT_INTERVAL_MS)) driftOk = false;

  // Buy: price deducted exactly, card delivered to inventory.
  const price = marketPriceOf(drifted, target);
  const bought = buyPlayer(drifted, target.id, now);
  const buyOk = bought.error === null && bought.pricePaid === price
    && bought.profile.coins === 500000 - price
    && bought.profile.inventory.some((c) => c.templateId === target.id);
  const broke = buyPlayer({ ...drifted, coins: 10 }, target.id, now);
  const buyGuardOk = broke.error !== null && broke.profile.inventory.length === 0;

  // Sell guards: locked cards and Starting XI cards are refused.
  const xiCard = labCard('lab_xi', target.id, false);
  const lockedCard = labCard('lab_locked', target.id, true);
  const spareCard = labCard('lab_spare', target.id, false);
  const club: SaveProfile = {
    ...bought.profile,
    inventory: [...bought.profile.inventory, xiCard, lockedCard, spareCard],
    startingXI: [xiCard.instanceId, null, null, null, null, null, null, null, null, null, null],
  };
  const sellGuardOk = buyGuardOk
    && listCardForSale(club, xiCard.instanceId, mulberry32(1), now).error !== null
    && listCardForSale(club, lockedCard.instanceId, mulberry32(1), now).error !== null;

  // Sell flow: escrow → buyer completes inside 10–25s → claim pays 95%
  // (the 5% listing fee).
  const listed = listCardForSale(club, spareCard.instanceId, mulberry32(3), now);
  let saleOk = listed.error === null && listed.saleId !== null;
  const sale = listed.profile.pendingSales?.[0];
  if (sale) {
    const delay = Date.parse(sale.sellsAtIso) - now;
    saleOk = saleOk && delay >= SALE_MIN_DELAY_MS && delay <= SALE_MAX_DELAY_MS
      && sale.netPayout === Math.floor(sale.listPrice * (1 - ECONOMY.MARKET_TAX_RATE))
      && !listed.profile.inventory.some((c) => c.instanceId === spareCard.instanceId)
      && !saleIsClaimable(sale, now + 5_000)
      && saleIsClaimable(sale, now + SALE_MAX_DELAY_MS + 1);
    const early = claimSale(listed.profile, sale.id, now + 5_000);
    const claimed = claimSale(listed.profile, sale.id, now + SALE_MAX_DELAY_MS + 1);
    saleOk = saleOk && early.error !== null
      && claimed.error === null && claimed.payout === sale.netPayout
      && claimed.profile.coins === listed.profile.coins + sale.netPayout
      && (claimed.profile.pendingSales ?? []).length === 0;
  } else saleOk = false;

  // Epic P1-3: quick-sell pays the flat rarity value (GOLD = 2,000c), a
  // gem-pack pull converts to Training XP instead of coins, a real Legend
  // can never be bought, and the 10/day sell cap refuses the 11th sale.
  const qsCard = labCard('lab_qs', target.id, false);
  const qsGemCard = { ...labCard('lab_qs_gem', target.id, false), fromGemPack: true };
  const qsClub: SaveProfile = { ...club, inventory: [...club.inventory, qsCard, qsGemCard] };
  const qs = quickSellCard(qsClub, qsCard.instanceId, now);
  const qsGem = quickSellCard(qs.profile, qsGemCard.instanceId, now);
  const legendTpl = getAllPlayers().find((p) => p.rarity === 'LEGEND' && p.realWorld);
  const legendBuy = legendTpl ? buyPlayer(qsGem.profile, legendTpl.id, now) : { error: null };
  let capped: SaveProfile = { ...qsGem.profile, salesDayKey: new Date(now).toISOString().slice(0, 10), salesToday: DAILY_SELL_CAP };
  const capCard = labCard('lab_cap', target.id, false);
  capped = { ...capped, inventory: [...capped.inventory, capCard] };
  const capRefused = quickSellCard(capped, capCard.instanceId, now).error !== null
    && listCardForSale(capped, capCard.instanceId, mulberry32(2), now).error !== null;
  const quickSellOk = qs.error === null && qs.coins === QUICK_SELL_VALUES[target.rarity]
    && !qs.profile.inventory.some((c) => c.instanceId === qsCard.instanceId)
    && qsGem.error === null && qsGem.coins === 0 && qsGem.trainingXp === Math.floor(QUICK_SELL_VALUES[target.rarity] / 10)
    && legendBuy.error !== null && capRefused;

  return {
    driftOk, buyOk: buyOk && buyGuardOk, sellGuardOk, saleOk, quickSellOk,
    detail: `drift ±5% per 2-min tick over every price · buy ${target.shortName} at ${formatNumber(price)}c delivered instantly · XI/locked sales refused · sale pays 95% (${sale ? formatNumber(sale.netPayout) : '—'}c) after buyer completes in 10–25s · quick-sell GOLD ${formatNumber(QUICK_SELL_VALUES.GOLD)}c flat · gem pulls → Training XP · Legends unbuyable · ${DAILY_SELL_CAP}/day sell cap`,
  };
}
