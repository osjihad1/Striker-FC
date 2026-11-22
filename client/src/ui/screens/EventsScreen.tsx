// Striker FC — ui/screens/EventsScreen.tsx
// The Events hub: time-boxed daily & weekly events with real rewards. Every
// row is a real Phase 09 quest (progress tracked live from play by
// QuestService, claims pay Coins/Gems exactly once through the same claim
// path as Quests & Star Pass), plus the Daily Free Pack event card and the
// Star Pass progress card. Nothing here is decorative — every button acts.

import { useState } from 'react';
import type { SaveProfile } from '../../core/types';
import type { QuestDef } from '../../data/PacksAndQuests';
import { SEASON_PASS_TIERS } from '../../data/PacksAndQuests';
import {
  claimQuestReward, dailyQuests, msUntilDailyReset, msUntilWeeklyReset,
  questComplete, questProgressOf, seasonPassTierReached, weeklyQuests,
} from '../../meta/QuestService';
import { freePackCooldownMs } from '../../meta/PackService';
import { FIRST_WEEK, claimFirstWeekDay, firstWeekDay, firstWeekStatus } from '../../meta/FirstWeekService';
import {
  EVENT_CHAPTERS, EVENT_MILESTONES, EVENT_SHARD_PACK_SHARDS, EVENT_SHARD_PACK_TOKENS, EVENT_STAR_BOX_TOKENS,
  buyEventShardPack, buyEventStarBox, claimEventMilestone, eventPoints, eventPointsFor,
} from '../../meta/EventService';
import { applyModeRewards, NO_FACTS } from '../../modes/ModeRewards';
import { mulberry32 } from '../../core/math';
import { LOGIN_MILESTONES, claimLoginMilestone, loginDayCount } from '../../meta/SeasonService';
import { formatNumber, t } from '../../i18n/i18n';

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${formatNumber(d)}${t('time.dayUnit')} ${formatNumber(h)}${t('time.hourUnit')}`;
  if (h > 0) return `${formatNumber(h)}${t('time.hourUnit')} ${formatNumber(m)}${t('time.minUnit')}`;
  return `${formatNumber(m)}${t('time.minUnit')}`;
}

function QuestEventRow({
  profile, quest, onClaim,
}: {
  profile: SaveProfile;
  quest: QuestDef;
  onClaim: (quest: QuestDef) => void;
}) {
  const progress = questProgressOf(profile, quest.id);
  const complete = questComplete(profile, quest);
  const pct = Math.min(100, Math.round((progress.current / quest.target) * 100));
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">{quest.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--dim)]">{quest.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum font-display text-lg font-bold leading-none text-[var(--gold)]">
            {formatNumber(quest.rewardCoins)}c{quest.rewardGems > 0 ? ` · ${formatNumber(quest.rewardGems)}◆` : ''}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('quests.reward')}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="tnum text-xs font-bold text-[var(--dim)]">{formatNumber(progress.current)}/{formatNumber(quest.target)}</span>
        {progress.claimed ? (
          <span className="rounded bg-black/40 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t('hub.claimed')}</span>
        ) : complete ? (
          <button
            type="button"
            onClick={() => onClaim(quest)}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#0a120c]"
          >
            {t('hub.claim')}
          </button>
        ) : (
          <span className="rounded border border-[var(--border)] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t('events.inPlay')}</span>
        )}
      </div>
    </li>
  );
}

export function EventsScreen({
  profile, onCommit, onOpenStore, onOpenQuests,
}: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile) => void;
  onOpenStore: () => void;
  onOpenQuests: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nowMs = Date.now();
  const freeMs = freePackCooldownMs(profile, nowMs);
  const reached = seasonPassTierReached(profile);
  const nextTier = SEASON_PASS_TIERS.find((t) => t.tier === reached + 1);
  const claimable = [...dailyQuests(), ...weeklyQuests()]
    .filter((q) => questComplete(profile, q) && !questProgressOf(profile, q.id).claimed).length;

  const claim = (quest: QuestDef) => {
    setError(null);
    setNotice(null);
    const result = claimQuestReward(profile, quest.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCommit(result.profile);
    setNotice(t('events.claimedNotice', { title: quest.title, coins: formatNumber(quest.rewardCoins), gems: quest.rewardGems > 0 ? t('events.andGems', { n: quest.rewardGems }) : '' }));
  };

  return (
    <section aria-label={t('events.events')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{t('events.events')}</h2>
          <p className="mt-1 text-sm text-[var(--dim)]">
            {t('events.intro')}
            {claimable > 0 ? ` ${claimable === 1 ? t('events.readyOne') : t('events.ready', { n: claimable })}` : ''}
          </p>
        </div>
        <div className="flex gap-2 text-right">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
            <p className="tnum font-display text-base font-bold leading-none text-[var(--accent)]">{formatCountdown(msUntilDailyReset(nowMs))}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('events.dailyReset')}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
            <p className="tnum font-display text-base font-bold leading-none text-[var(--accent)]">{formatCountdown(msUntilWeeklyReset(profile, nowMs))}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('events.weeklyReset')}</p>
          </div>
        </div>
      </div>

      {notice && <p className="mt-3 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-dim)]/30 px-3 py-2 text-sm font-semibold text-[var(--accent)]" role="status">{notice}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-400/50 bg-red-950/40 px-3 py-2 text-sm font-semibold text-red-300" role="alert">{error}</p>}

      {/* Epic fix round (P2-19): event chapters, the Event Points milestone
          track and the Event Token shop. */}
      <EventTrackPanel profile={profile} onCommit={onCommit} setNotice={setNotice} setError={setError} />

      {/* Addendum 1: the first-week chain — one objective per club day. */}
      <div className="mt-4 rounded-2xl border border-[var(--accent)]/40 bg-[#0f172a]/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{t('events.firstWeek')}</h3>
          <span className="tnum text-xs font-bold uppercase tracking-widest text-[var(--dim)]">{t('events.dayOf', { d: Math.min(7, firstWeekDay(profile, nowMs)), t: 7 })}</span>
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {FIRST_WEEK.map((d) => {
            const status = firstWeekStatus(profile, d, nowMs);
            const prog = d.progress(profile);
            return (
              <li key={d.day} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-bold uppercase tracking-wide">{t('quests.dayN', { n: d.day })} · {d.title}</p>
                  <span className="tnum shrink-0 text-xs font-bold text-[var(--gold)]">+{formatNumber(d.coins)}c{d.day === 7 ? t('events.goldPackSuffix') : ''}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--dim)]">{d.hint}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(prog.current / prog.target) * 100}%` }} />
                  </div>
                  <span className="tnum text-[11px] font-bold text-[var(--dim)]">{formatNumber(prog.current)}/{formatNumber(prog.target)}</span>
                  {status === 'CLAIMABLE' && (
                    <button
                      type="button"
                      aria-label={`Claim first week day ${d.day} reward`}
                      onClick={() => {
                        const r = claimFirstWeekDay(profile, d.day, nowMs);
                        if (r.error) { setError(r.error); return; }
                        setError(null);
                        onCommit(r.profile);
                        setNotice(r.packNames.length > 0
                          ? t('events.day7Claimed', { coins: formatNumber(r.coins), names: r.packNames.join(', ') })
                          : t('events.dayClaimed', { d: d.day, coins: formatNumber(r.coins) }));
                      }}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-black uppercase text-[#0a120c]"
                    >
                      {t('hub.claim')}
                    </button>
                  )}
                  {status === 'CLAIMED' && <span className="text-[11px] font-bold uppercase text-[var(--accent)]">{t('hub.claimed')} ✓</span>}
                  {status === 'LOCKED' && <span className="text-[11px] font-bold uppercase text-[var(--dim)]">{t('common.locked')}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Addendum 3: the 30-day login calendar milestones. */}
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[#0f172a]/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{t('events.loginCalendar')}</h3>
          <span className="tnum text-xs font-bold uppercase tracking-widest text-[var(--dim)]">{t('events.loginDays', { n: loginDayCount(profile) })}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--dim)]">{t('events.loginNote')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {LOGIN_MILESTONES.map((m) => {
            const claimedM = (profile.loginMilestonesClaimed ?? []).includes(m.day);
            const ready = !claimedM && loginDayCount(profile) >= m.day;
            return (
              <div key={m.day} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                <p className="font-display text-lg font-bold uppercase leading-tight">{m.label}</p>
                {claimedM ? (
                  <p className="mt-2 text-[11px] font-bold uppercase text-[var(--accent)]">{t('hub.claimed')} ✓</p>
                ) : ready ? (
                  <button
                    type="button"
                    aria-label={`Claim login milestone ${m.label}`}
                    onClick={() => {
                      const r = claimLoginMilestone(profile, m.day, nowMs);
                      if (r.error) { setError(r.error); return; }
                      setError(null);
                      onCommit(r.profile);
                      setNotice(`${m.label} — ${r.packNames.join(', ')}`);
                    }}
                    className="mt-2 rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-black uppercase text-black"
                  >
                    {t('events.claimPack')}
                  </button>
                ) : (
                  <p className="tnum mt-2 text-[11px] font-bold uppercase text-[var(--dim)]">{t('events.daysOf', { a: loginDayCount(profile), b: m.day })}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Free Pack event */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--gold)]/50 bg-[#0f172a]/70 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-[var(--gold)]">{t('events.freePack')}</p>
          <p className="mt-1 text-sm text-[var(--dim)]">
            {freeMs <= 0
              ? t('events.freeReady')
              : t('events.freeIn', { time: formatCountdown(freeMs) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenStore}
          className="rounded-lg bg-[var(--gold)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wide text-[#0a120c]"
        >
          {freeMs <= 0 ? t('events.openFreePack') : t('events.goToStore')}
        </button>
      </div>

      <h3 className="mt-6 font-display text-xl font-bold uppercase tracking-wider text-[var(--accent)]">{t('events.dailyEvents')}</h3>
      <ul className="mt-2 grid gap-2 lg:grid-cols-2">
        {dailyQuests().map((q) => (
          <QuestEventRow key={q.id} profile={profile} quest={q} onClaim={claim} />
        ))}
      </ul>

      <h3 className="mt-6 font-display text-xl font-bold uppercase tracking-wider text-sky-300">{t('events.weeklyEvents')}</h3>
      <ul className="mt-2 grid gap-2 lg:grid-cols-2">
        {weeklyQuests().map((q) => (
          <QuestEventRow key={q.id} profile={profile} quest={q} onClaim={claim} />
        ))}
      </ul>

      {/* Star Pass card */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{t('quests.starPass')}</p>
          <p className="mt-1 text-sm text-[var(--dim)]">
            {t('events.tierOf', { a: reached, b: 20 })} · <span className="tnum">{formatNumber(profile.seasonPassXp)} XP</span>
            {nextTier ? ` · ${t('events.nextTierAt', { n: nextTier.xpRequired })}` : ` · ${t('events.allTiers')}`}.

          </p>
        </div>
        <button
          type="button"
          onClick={onOpenQuests}
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wide"
        >
          {t('events.questsPass')}
        </button>
      </div>
    </section>
  );
}

/**
 * Epic fix round (P2-19) — the live event's full loop on one panel:
 * chapters (daily + weekly quest groups), Event Points earned from real
 * quest claims, the 5-step milestone track, and the Event Token shop.
 */
function EventTrackPanel({ profile, onCommit, setNotice, setError }: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile) => void;
  setNotice: (s: string | null) => void;
  setError: (s: string | null) => void;
}) {
  const points = eventPoints(profile);
  const tokens = profile.eventTokens ?? 0;
  const claimed = profile.eventMilestonesClaimed ?? [];
  const claimMilestone = (index: number) => {
    setNotice(null);
    setError(null);
    const r = claimEventMilestone(profile, index);
    if (r.error || !r.milestone) { setError(r.error ?? 'That milestone cannot be claimed yet.'); return; }
    const { next } = applyModeRewards(r.profile, r.milestone.grant, NO_FACTS);
    onCommit(next);
    setNotice(t('events.milestoneNotice', { coins: formatNumber(r.milestone.grant.coins), gems: formatNumber(r.milestone.grant.gems), tokens: formatNumber(r.milestone.eventTokens) }));
  };
  const buyBox = () => {
    setNotice(null);
    setError(null);
    const r = buyEventStarBox(profile, mulberry32(Date.now() & 0xffffff), Date.now());
    if (r.error) { setError(r.error); return; }
    onCommit(r.profile);
    setNotice(t('events.starBoxNotice', { name: r.grantedName ?? '' }));
  };
  const buyShards = () => {
    setNotice(null);
    setError(null);
    const r = buyEventShardPack(profile);
    if (r.error) { setError(r.error); return; }
    onCommit(r.profile);
    setNotice(t('events.shardNotice', { n: EVENT_SHARD_PACK_SHARDS }));
  };
  return (
    <div className="mt-4 rounded-2xl border border-fuchsia-300/30 bg-[#0f172a]/70 p-4" aria-label={t('events.liveTrack')}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-fuchsia-200">{t('events.liveTrack')}</h3>
        <div className="flex gap-2">
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 font-display text-base font-bold text-fuchsia-200">{formatNumber(points)} {t('events.points')}</span>
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 font-display text-base font-bold text-[var(--gold)]">{formatNumber(tokens)} {t('events.tokens')}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {EVENT_CHAPTERS.map((ch) => {
          const done = ch.quests.filter((q) => profile.questProgress[q.id]?.claimed).length;
          const pts = ch.quests.reduce((s, q) => s + (profile.questProgress[q.id]?.claimed ? eventPointsFor(q) : 0), 0);
          return (
            <div key={ch.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-display text-lg font-bold uppercase tracking-wide">{ch.name}</p>
              <p className="mt-0.5 text-xs text-[var(--dim)]">{ch.blurb}</p>
              <p className="tnum mt-1.5 text-[12px] font-bold text-fuchsia-200">{t('events.questsClaimed', { a: done, b: ch.quests.length, p: pts })}</p>
            </div>
          );
        })}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('events.liveTrack')}>
        {EVENT_MILESTONES.map((m, i) => {
          const isClaimed = claimed.includes(i);
          const reachedIt = points >= m.points;
          return (
            <li key={m.points} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-base font-bold uppercase tracking-wide">{t('events.ptsN', { n: m.points })}</p>
                <span className="tnum text-[11px] font-bold text-[var(--gold)]">{t('events.tokensPlus', { n: m.eventTokens })}</span>
              </div>
              <p className="tnum mt-0.5 text-[12px] text-[var(--dim)]">{t('events.milestoneGrant', { c: m.grant.coins, g: m.grant.gems, x: m.grant.trainingXp })}</p>
              <button
                type="button"
                disabled={isClaimed || !reachedIt}
                onClick={() => claimMilestone(i)}
                className="mt-2 w-full rounded-lg bg-fuchsia-400 px-3 py-1.5 text-[13px] font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isClaimed ? `${t('hub.claimed')} ✓` : reachedIt ? t('events.claimMilestone') : t('events.ptsToGo', { n: m.points - points })}
              </button>
            </li>
          );
        })}
        <li className="rounded-xl border border-[var(--gold)]/40 bg-[var(--surface)] p-3">
          <p className="font-display text-base font-bold uppercase tracking-wide">{t('events.eventShop')}</p>
          <div className="mt-2 grid gap-2">
            <button type="button" disabled={tokens < EVENT_STAR_BOX_TOKENS} onClick={buyBox} className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-[13px] font-bold text-[#231a02] disabled:cursor-not-allowed disabled:opacity-40">
              {t('events.starBox', { n: EVENT_STAR_BOX_TOKENS })}
            </button>
            <button type="button" disabled={tokens < EVENT_SHARD_PACK_TOKENS} onClick={buyShards} className="rounded-lg border border-[var(--gold)] px-3 py-1.5 text-[13px] font-bold text-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-40">
              {t('events.shardPack', { t: EVENT_SHARD_PACK_TOKENS, s: EVENT_SHARD_PACK_SHARDS })}
            </button>
          </div>
        </li>
      </ol>
    </div>
  );
}
