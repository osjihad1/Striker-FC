// Striker FC — ui/screens/TransferMarketScreen.tsx (Phase 09, Blueprint 08 §4)
// The simulated live Transfer Market: all 180 database templates at prices
// that drift ±5% every 2 minutes (green/red trend indicators), full search
// and filtering, instant Buy Now delivery, and Sell From Club with the
// locked / Starting XI guards. Listed cards are bought by a simulated buyer
// in 10–25s; the SOLD! inbox then pays out 90% (10% market tax) on claim.
// All state lives in SaveProfile via meta/MarketService + commitProfile.

import { useEffect, useMemo, useState } from 'react';
import { mulberry32 } from '../../core/math';
import { ECONOMY, RARITY_COLORS } from '../../core/constants';
import type { Position, Rarity, SaveProfile } from '../../core/types';
import { ALL_POSITIONS, ALL_RARITIES } from '../../core/types';
import { getAllPlayers, getPlayerById } from '../../data/PlayerDatabase';
import { ALL_CLUBS } from '../../data/Clubs';
import {
DAILY_SELL_CAP, DEFAULT_MARKET_FILTERS, MARKET_DRIFT_INTERVAL_MS, buyPlayer, claimSale, claimableSales,
filterMarket, listCardForSale, marketDriftDue, marketPriceOf, marketTrendPct, quickSellCard,
refreshMarketIfDue, saleIsClaimable, sellBlockReason, type MarketFilters,
} from '../../meta/MarketService';
import { QUICK_SELL_VALUES } from '../../meta/PackService';
import { RARITY_FOIL } from '../components/PlayerCard';
import { formatNumber, t as tr } from '../../i18n/i18n';

function TrendBadge({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.05) {
    return <span className="tnum text-[11px] font-bold text-[var(--dim)]">— 0.0%</span>;
  }
  const up = pct > 0;
  return (
    <span className="tnum text-[11px] font-bold" style={{ color: up ? '#4ade80' : '#f87171' }} aria-label={up ? tr('market.trendUp', { n: Math.abs(pct).toFixed(1) }) : tr('market.trendDown', { n: Math.abs(pct).toFixed(1) })}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{formatNumber(Number(pct.toFixed(1)))}%
    </span>
  );
}

export function TransferMarketScreen({
  profile, onCommit, onInspect,
}: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile) => void;
  onInspect: (instanceId: string) => void;
}) {
  const [filters, setFilters] = useState<MarketFilters>({ ...DEFAULT_MARKET_FILTERS });
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [armedSell, setArmedSell] = useState<string | null>(null);
  const [armedQuick, setArmedQuick] = useState<string | null>(null);

  // Real-world LEGENDs (Messi / Ronaldo / Mbappé) are pack-only — they are
  // never listed on the market; they are found in the Legend Icon Pack.
  const players = useMemo(
    () => getAllPlayers().filter((p) => !(p.realWorld && p.rarity === 'LEGEND')),
    [],
  );

  // Seed prices on first visit + run the 2-minute drift cadence while open.
  useEffect(() => {
    if (marketDriftDue(profile, Date.now())) {
      onCommit(refreshMarketIfDue(profile, mulberry32((Date.now() & 0xffffff) ^ 0xa11), Date.now()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (marketDriftDue(profile, now)) {
        onCommit(refreshMarketIfDue(profile, mulberry32((now & 0xffffff) ^ 0xd21f7), now));
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [profile, onCommit]);

  const filtered = useMemo(
    () => [...filterMarket(profile, players, filters)].sort((a, b) => marketPriceOf(profile, b) - marketPriceOf(profile, a)),
    [profile, players, filters],
  );
  const ownedCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of profile.inventory) counts.set(c.templateId, (counts.get(c.templateId) ?? 0) + 1);
    return counts;
  }, [profile.inventory]);

  const pending = profile.pendingSales ?? [];
  const claimable = claimableSales(profile, nowMs);
  const nextDriftMs = profile.marketLastDriftIso
    ? Math.max(0, Date.parse(profile.marketLastDriftIso) + MARKET_DRIFT_INTERVAL_MS - nowMs)
    : 0;

  const doBuy = (templateId: string) => {
    setError(null);
    setNotice(null);
    const result = buyPlayer(profile, templateId, Date.now());
    if (result.error || !result.card) {
      setError(result.error ?? 'Purchase failed.');
      return;
    }
    onCommit(result.profile);
    const t = getPlayerById(templateId);
    setNotice(tr('market.signedNotice', { name: t?.name ?? 'Player', price: formatNumber(result.pricePaid) }));
  };

  const doSell = (instanceId: string) => {
    if (armedSell !== instanceId) {
      setArmedSell(instanceId);
      return;
    }
    setArmedSell(null);
    setError(null);
    setNotice(null);
    const result = listCardForSale(profile, instanceId, mulberry32((Date.now() & 0xffffff) ^ instanceId.length * 31), Date.now());
    if (result.error) {
      setError(result.error);
      return;
    }
    const sale = result.profile.pendingSales?.find((s) => s.id === result.saleId);
    const t = sale ? getPlayerById(sale.templateId) : undefined;
    onCommit(result.profile);
    setNotice(tr('market.listedNotice', { name: t?.name ?? 'Card', list: formatNumber(sale?.listPrice ?? 0), net: formatNumber(sale?.netPayout ?? 0) }));
  };

  const doQuickSell = (instanceId: string) => {
    if (armedQuick !== instanceId) {
      setArmedQuick(instanceId);
      return;
    }
    setArmedQuick(null);
    setError(null);
    setNotice(null);
    const result = quickSellCard(profile, instanceId, Date.now());
    if (result.error) {
      setError(result.error);
      return;
    }
    onCommit(result.profile);
    setNotice(result.coins > 0
      ? tr('market.quickSoldNotice', { n: result.coins })
      : tr('market.convertedNotice', { n: result.trainingXp }));
  };

  const doClaim = (saleId: string) => {
    setError(null);
    const result = claimSale(profile, saleId, Date.now());
    if (result.error) {
      setError(result.error);
      return;
    }
    onCommit(result.profile);
    setNotice(tr('market.claimedNotice', { n: result.payout }));
  };

  const sellable = profile.inventory.filter((c) => !sellBlockReason(profile, c));
  const blockedCards = profile.inventory.filter((c) => sellBlockReason(profile, c) !== null);

  return (
    <section aria-label={tr('market.market')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{tr('market.market')}</h2>
          <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
            {tr('market.intro')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 font-display text-xl font-bold text-[var(--gold)]">
            {formatNumber(profile.coins)} <span className="text-[10px] uppercase tracking-widest text-[var(--dim)]">{tr('common.coins')}</span>
          </span>
          <span className="tnum rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]">
            {tr('market.nextDrift', { n: Math.floor(nextDriftMs / 1000) })}
          </span>
          {claimable.length > 0 && (
            <span className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-black" role="status">
              {claimable.length === 1 ? tr('market.soldReadyOne') : tr('market.soldReady', { n: claimable.length })}
            </span>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--danger)] bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200">{error}</p>}
      {notice && <p aria-live="polite" className="mt-3 rounded-lg border border-[var(--accent-dim)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--accent)]">{notice}</p>}

      {/* SOLD! inbox */}
      {pending.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--gold)]/50 bg-[var(--surface)] p-4" aria-label={tr('market.salesInbox')}>
          <p className="font-display text-xl font-bold uppercase tracking-wide text-[var(--gold)]">{tr('market.salesInbox')}</p>
          <ul className="mt-2 space-y-2">
            {pending.map((sale) => {
              const t = getPlayerById(sale.templateId);
              const ready = saleIsClaimable(sale, nowMs);
              const secsLeft = Math.max(0, Math.ceil((Date.parse(sale.sellsAtIso) - nowMs) / 1000));
              return (
                <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{t?.name ?? sale.templateId}</span>
                    <span className="tnum text-xs text-[var(--dim)]">
                      {tr('market.listedLine', { list: sale.listPrice, net: sale.netPayout })}
                    </span>
                  </span>
                  {ready ? (
                    <button type="button" onClick={() => doClaim(sale.id)} className="rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-bold text-black">
                      {tr('market.claimBtn', { n: sale.netPayout })}
                    </button>
                  ) : (
                    <span className="tnum text-sm font-semibold text-[var(--dim)]">{tr('market.buyerCompleting', { n: secsLeft })}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={tr('market.filters')}>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('market.searchName')}
          <input
            aria-label={tr('market.search')}
            type="search"
            value={filters.query}
            onChange={(e) => { setFilters((f) => ({ ...f, query: e.target.value })); setVisibleCount(40); }}
            placeholder="e.g. Rahman, Pelero…"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('squad.position')}
          <select aria-label="Market position filter" value={filters.position} onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value as MarketFilters['position'] }))} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="ALL">{tr('market.allPositions')}</option>
            {ALL_POSITIONS.map((p: Position) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('squad.byRarity')}
          <select aria-label="Market rarity filter" value={filters.rarity} onChange={(e) => setFilters((f) => ({ ...f, rarity: e.target.value as MarketFilters['rarity'] }))} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="ALL">{tr('market.allRarities')}</option>
            {ALL_RARITIES.map((r: Rarity) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('market.minOvr')} · <span className="tnum text-[var(--accent)]">{formatNumber(filters.minOvr)}</span>
          <input aria-label="Market minimum OVR" type="range" min={60} max={98} step={1} value={filters.minOvr} onChange={(e) => setFilters((f) => ({ ...f, minOvr: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('market.maxOvr')} · <span className="tnum text-[var(--accent)]">{formatNumber(filters.maxOvr)}</span>
          <input aria-label="Market maximum OVR" type="range" min={60} max={99} step={1} value={filters.maxOvr} onChange={(e) => setFilters((f) => ({ ...f, maxOvr: Number(e.target.value) }))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          {tr('market.maxPrice')}
          <input
            aria-label="Market maximum price"
            type="number"
            min={0}
            inputMode="numeric"
            value={maxPriceInput}
            onChange={(e) => {
              setMaxPriceInput(e.target.value);
              const v = Number(e.target.value);
              setFilters((f) => ({ ...f, maxPrice: e.target.value.trim() === '' || !Number.isFinite(v) ? Number.POSITIVE_INFINITY : v }));
            }}
            placeholder={tr('market.anyPrice')}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"
          />
        </label>
      </div>

      <p className="tnum mt-3 text-sm text-[var(--dim)]">
        {tr('market.listedCount', { a: filtered.length, b: players.length })}
      </p>
      <ul className="mt-2 grid gap-1.5 lg:grid-cols-2">
        {filtered.slice(0, visibleCount).map((t) => {
          const price = marketPriceOf(profile, t);
          const trend = marketTrendPct(profile, t);
          const club = ALL_CLUBS.find((c) => c.id === t.clubId);
          const owned = ownedCount.get(t.id) ?? 0;
          const afford = profile.coins >= price;
          return (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="tnum font-display text-2xl font-bold" style={{ color: RARITY_COLORS[t.rarity]?.text ?? '#fff' }}>{formatNumber(t.baseOvr)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {t.name}
                    {owned > 0 && <span className="ml-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">{tr('market.ownedX', { n: owned })}</span>}
                  </span>
                  <span className="block text-[11px] uppercase tracking-wide text-[var(--dim)]">
                    {t.position} · {club?.abbr ?? t.clubId} · {t.nationality} · <span style={{ color: RARITY_FOIL[t.rarity].edge }}>{t.rarity}</span>
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-right">
                  <span className="tnum block font-display text-lg font-bold leading-none text-[var(--gold)]">{formatNumber(price)}</span>
                  <TrendBadge pct={trend} />
                </span>
                <button
                  type="button"
                  disabled={!afford}
                  onClick={() => doBuy(t.id)}
                  aria-label={`${tr('market.buyNow')} ${t.name}`}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr('market.buyNow')}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && (
        <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--dim)]">
          {tr('market.noListings')}
        </p>
      )}
      {visibleCount < filtered.length && (
        <button type="button" onClick={() => setVisibleCount((c) => c + 40)} className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)]">
          {tr('market.showMore', { n: filtered.length - visibleCount })}
        </button>
      )}

      {/* Sell from club */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur">
        <p className="font-display text-2xl font-bold uppercase tracking-wide">{tr('market.sellFromClub')}</p>
        <p className="mt-1 text-sm text-[var(--dim)]">
          {blockedCards.length === 1
            ? tr('market.sellIntroOne', { cap: DAILY_SELL_CAP })
            : tr('market.sellIntro', { cap: DAILY_SELL_CAP, blocked: blockedCards.length })}
        </p>
        {sellable.length === 0 ? (
          <p className="mt-3 rounded-lg bg-black/30 px-3 py-2 text-sm text-[var(--dim)]">
            {tr('market.nothingSellable')}
          </p>
        ) : (
          <ul className="mt-3 grid gap-1.5 lg:grid-cols-2">
            {sellable.map((card) => {
              const t = getPlayerById(card.templateId);
              if (!t) return null;
              const price = marketPriceOf(profile, t);
              const net = Math.floor(price * (1 - ECONOMY.MARKET_TAX_RATE));
              const armed = armedSell === card.instanceId;
              const armedQ = armedQuick === card.instanceId;
              const qsValue = QUICK_SELL_VALUES[t.rarity];
              return (
                <li key={card.instanceId} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                  <button type="button" onClick={() => onInspect(card.instanceId)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold">{t.name}</span>
                    <span className="tnum block text-[11px] text-[var(--dim)]">
                      {tr('market.cardLine', { pos: t.position, ovr: t.baseOvr, lv: card.trainingLevel, rank: card.rank, list: price, net })}
                      {card.fromGemPack ? ` · ${tr('market.gemPull')}` : ''}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => doQuickSell(card.instanceId)}
                      aria-label={`${tr('store.quickSell')} ${t.name}`}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${armedQ ? 'bg-[var(--danger)] text-white' : 'border border-[var(--accent)] text-[var(--accent)]'}`}
                    >
                      {armedQ ? tr('market.tapAgain') : card.fromGemPack ? tr('market.quickXp', { n: Math.floor(qsValue / 10) }) : tr('market.quickCoins', { n: qsValue })}
                    </button>
                    <button
                      type="button"
                      onClick={() => doSell(card.instanceId)}
                      aria-label={`${tr('market.sell')} ${t.name}`}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${armed ? 'bg-[var(--danger)] text-white' : 'border border-[var(--gold)] text-[var(--gold)]'}`}
                    >
                      {armed ? tr('market.tapAgainList') : tr('market.sell')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {blockedCards.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-[var(--dim)]">{blockedCards.length === 1 ? tr('market.whyBlockedOne') : tr('market.whyBlocked', { n: blockedCards.length })}</summary>
            <ul className="mt-2 space-y-1">
              {blockedCards.slice(0, 12).map((card) => {
                const t = getPlayerById(card.templateId);
                const reason = sellBlockReason(profile, card) ?? '';
                return (
                  <li key={card.instanceId} className="text-xs text-[var(--dim)]">
                    <span className="font-semibold text-[var(--text)]">{t?.name ?? card.templateId}</span> — {reason}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
