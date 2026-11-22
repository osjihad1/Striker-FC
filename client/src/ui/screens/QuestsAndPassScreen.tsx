// Striker FC — ui/screens/QuestsAndPassScreen.tsx (Phase 09, Blueprint 08 §4)
// Quests & the 20-tier Star Season Pass. Six Daily and six Weekly quests
// auto-track from real play — mode sessions report facts through ModeRewards
// while QuestService's EventBus subscription catches Finesse goals and
// training levels live. Completed quests and reached pass tiers are claimed
// here for Coins, Gems, Training XP and Rank-Up Tokens; Tier 20 opens a
// Legend Icon Pack on the spot. Daily quests reset at UTC midnight, weekly
// quests every 7 days (meta/QuestService.applyQuestResets).

import { useState } from 'react';
import { mulberry32 } from '../../core/math';
import type { SaveProfile } from '../../core/types';
import { SEASON_PASS_TIERS, type QuestDef } from '../../data/PacksAndQuests';
import type { PackPull } from '../../meta/PackService';
import {
claimQuestReward, claimSeasonPassTier, dailyQuests, msUntilDailyReset,
msUntilWeeklyReset, questComplete, questProgressOf, seasonPassTierReached, weeklyQuests,
} from '../../meta/QuestService';
import { STAR_PASS_PREMIUM_GEMS, buyStarPassPremium, currentSeason } from '../../meta/SeasonService';
import { PlayerCard } from '../components/PlayerCard';
import { formatNumber, t as tr } from '../../i18n/i18n';

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${formatNumber(d)}${tr('time.dayUnit')} ${formatNumber(h)}${tr('time.hourUnit')}`;
  if (h > 0) return `${formatNumber(h)}${tr('time.hourUnit')} ${formatNumber(m)}${tr('time.minUnit')}`;
  return `${formatNumber(m)}${tr('time.minUnit')}`;
}

function QuestRow({
  profile, quest, onClaim,
}: {
  profile: SaveProfile;
  quest: QuestDef;
  onClaim: (quest: QuestDef) => void;
}) {
  const progress = questProgressOf(profile, quest.id);
  const complete = questComplete(profile, quest);
  const pct = Math.min(100, (progress.current / quest.target) * 100);
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{quest.title}</p>
        <span className="tnum shrink-0 text-xs font-semibold text-[var(--dim)]">{formatNumber(progress.current)}/{formatNumber(quest.target)}</span>
      </div>
      <p className="text-xs text-[var(--dim)]">{quest.description}</p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: complete ? 'var(--gold)' : 'var(--accent)' }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="tnum text-[11px] font-semibold text-[var(--gold)]">
          {tr('quests.rewardLine', { coins: formatNumber(quest.rewardCoins), gems: quest.rewardGems > 0 ? ` · ${formatNumber(quest.rewardGems)} ${tr('common.gems')}` : '' })}
        </p>
        {progress.claimed ? (
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-bold text-[var(--dim)]">{tr('hub.claimed')}</span>
        ) : complete ? (
          <button
            type="button"
            onClick={() => onClaim(quest)}
            aria-label={tr('quests.claimReward')}
            className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-black"
          >
            {tr('quests.claimReward')}
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-[var(--dim)]">{tr('quests.inProgress')}</span>
        )}
      </div>
    </li>
  );
}

export function QuestsAndPassScreen({
  profile, onCommit,
}: {
  profile: SaveProfile;
  onCommit: (next: SaveProfile) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legendPulls, setLegendPulls] = useState<PackPull[] | null>(null);
  const nowMs = Date.now();
  const season = currentSeason(nowMs);
  const reached = seasonPassTierReached(profile);
  const nextTier = SEASON_PASS_TIERS.find((t) => t.tier === reached + 1);
  const xpToNext = nextTier ? nextTier.xpRequired - profile.seasonPassXp : 0;
  const claimableQuests = [...dailyQuests(), ...weeklyQuests()]
    .filter((q) => questComplete(profile, q) && !questProgressOf(profile, q.id).claimed).length;
  const claimableTiers = SEASON_PASS_TIERS
    .filter((t) => profile.seasonPassXp >= t.xpRequired && !profile.seasonPassClaimedTiers.includes(t.tier)).length;

  const claimQuest = (quest: QuestDef) => {
    setError(null);
    setNotice(null);
    const result = claimQuestReward(profile, quest.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCommit(result.profile);
    setNotice(tr('events.claimedNotice', { title: quest.title, coins: formatNumber(quest.rewardCoins), gems: quest.rewardGems > 0 ? tr('events.andGems', { n: quest.rewardGems }) : '' }));
  };

  const claimTier = (tier: number) => {
    setError(null);
    setNotice(null);
    const result = claimSeasonPassTier(profile, tier, mulberry32((Date.now() & 0xffffff) ^ tier * 104729), Date.now());
    if (result.error) {
      setError(result.error);
      return;
    }
    onCommit(result.profile);
    if (result.packPulls.length > 0) {
      setLegendPulls(result.packPulls);
      setNotice(tr('quests.tier20Notice'));
    } else {
      const def = SEASON_PASS_TIERS.find((t) => t.tier === tier);
      setNotice(tr('quests.tierNotice', { n: tier, label: def?.rewardLabel ?? '' }));
    }
  };

  // Addendum 3: premium track — a second claim of every reached tier.
  const claimPremiumTier = (tier: number) => {
    setError(null);
    setNotice(null);
    const result = claimSeasonPassTier(profile, tier, mulberry32((Date.now() & 0xffffff) ^ tier * 7919), Date.now(), 'PREMIUM');
    if (result.error) { setError(result.error); return; }
    onCommit(result.profile);
    if (result.packPulls.length > 0) setLegendPulls(result.packPulls);
    const def = SEASON_PASS_TIERS.find((t) => t.tier === tier);
    setNotice(tr('quests.premiumTierNotice', { n: tier, label: def?.rewardLabel ?? '' }));
  };

  const buyPremium = () => {
    setError(null);
    setNotice(null);
    const result = buyStarPassPremium(profile);
    if (result.error) { setError(result.error); return; }
    onCommit(result.profile);
    setNotice(tr('quests.premiumNotice'));
  };

  const claimAllTiers = () => {
    let current = profile;
    let lastPulls: PackPull[] = [];
    let claimed = 0;
    for (const def of SEASON_PASS_TIERS) {
      if (current.seasonPassXp < def.xpRequired || current.seasonPassClaimedTiers.includes(def.tier)) continue;
      const result = claimSeasonPassTier(current, def.tier, mulberry32((Date.now() & 0xffffff) ^ def.tier * 31), Date.now());
      if (!result.error) {
        current = result.profile;
        claimed += 1;
        if (result.packPulls.length > 0) lastPulls = result.packPulls;
      }
    }
    if (claimed === 0) {
      setError(tr('quests.noTiers'));
      return;
    }
    setError(null);
    onCommit(current);
    if (lastPulls.length > 0) setLegendPulls(lastPulls);
    setNotice(claimed === 1 ? tr('quests.allClaimedOne') : tr('quests.allClaimedNotice', { n: claimed }));
  };

  return (
    <section aria-label={tr('quests.title')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{tr('quests.title')}</h2>
          <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
            {tr('quests.intro')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {claimableQuests > 0 && (
            <span className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-black" role="status">
              {tr('quests.readyN', { n: claimableQuests })}
            </span>
          )}
          {claimableTiers > 0 && (
            <button type="button" onClick={claimAllTiers} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c]">
              {tr('quests.claimAll', { n: claimableTiers })}
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--danger)] bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200">{error}</p>}
      {notice && <p aria-live="polite" className="mt-3 rounded-lg border border-[var(--accent-dim)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--accent)]">{notice}</p>}

      {legendPulls && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-[var(--gold)]/60 bg-[var(--surface)] p-4" aria-label={tr('quests.legendFinale')}>
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{
                  left: `${(i * 71) % 100}%`,
                  background: ['#f5c542', '#a3e635', '#7dd3fc', '#f0abfc'][i % 4],
                  animationDelay: `${(i % 7) * 0.45}s`,
                }}
              />
            ))}
          </div>
          <p className="font-display relative text-2xl font-bold uppercase tracking-wide text-[var(--gold)]">{tr('quests.legendFinale')}</p>
          <p className="relative mt-1 text-sm text-[var(--dim)]">{tr('quests.legendFinaleSub')}</p>
          <div className="relative mt-3 flex flex-wrap gap-3">
            {legendPulls.map((pull) => (
              <PlayerCard key={pull.card.instanceId} template={pull.template} card={pull.card} size="md" />
            ))}
          </div>
          <button type="button" onClick={() => setLegendPulls(null)} className="relative mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold">
            {tr('quests.dismiss')}
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-xl font-bold uppercase tracking-wider text-[var(--accent)]">{tr('quests.daily')}</h3>
            <span className="tnum text-xs font-semibold text-[var(--dim)]">{tr('quests.resetIn', { time: formatDuration(msUntilDailyReset(nowMs)) })}</span>
          </div>
          <ul className="mt-2 space-y-2">
            {dailyQuests().map((q) => (
              <QuestRow key={q.id} profile={profile} quest={q} onClaim={claimQuest} />
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-xl font-bold uppercase tracking-wider text-[var(--accent)]">{tr('quests.weekly')}</h3>
            <span className="tnum text-xs font-semibold text-[var(--dim)]">{tr('quests.resetIn', { time: formatDuration(msUntilWeeklyReset(profile, nowMs)) })}</span>
          </div>
          <ul className="mt-2 space-y-2">
            {weeklyQuests().map((q) => (
              <QuestRow key={q.id} profile={profile} quest={q} onClaim={claimQuest} />
            ))}
          </ul>
        </div>
      </div>

      {/* Star Season Pass track */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-wide">{tr('quests.starSeasonPass')}</h3>
            <p className="tnum mt-1 text-sm text-[var(--dim)]">
              {season.daysLeft === 1
                ? tr('quests.seasonLineOne', { s: season.id, xp: formatNumber(profile.seasonPassXp), r: reached, t: 20, c: profile.seasonPassClaimedTiers.length })
                : tr('quests.seasonLine', { s: season.id, d: season.daysLeft, xp: formatNumber(profile.seasonPassXp), r: reached, t: 20, c: profile.seasonPassClaimedTiers.length })}
              {nextTier ? ` · ${tr('quests.xpToTier', { n: xpToNext, t: nextTier.tier })}` : ` · ${tr('quests.trackComplete')}`}
            </p>
            {profile.seasonPassPremium ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[var(--gold)]">{tr('quests.premiumActive')}</p>
            ) : (
              <button
                type="button"
                onClick={buyPremium}
                className="mt-1.5 rounded-lg border border-[var(--gold)]/60 bg-[var(--gold)]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--gold)]"
              >
                {tr('quests.goPremium', { n: STAR_PASS_PREMIUM_GEMS })}
              </button>
            )}
          </div>
          <span className="tnum rounded-lg bg-black/40 px-3 py-1.5 text-xs font-semibold text-[var(--dim)]">
            {tr('quests.xpSources')}
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, (profile.seasonPassXp / (nextTier ? nextTier.xpRequired : Math.max(1, profile.seasonPassXp))) * 100)}%` }} />
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SEASON_PASS_TIERS.map((t) => {
            const isReached = profile.seasonPassXp >= t.xpRequired;
            const claimed = profile.seasonPassClaimedTiers.includes(t.tier);
            const isFinale = t.tier === 20;
            return (
              <li
                key={t.tier}
                className="rounded-xl border p-3"
                style={{
                  borderColor: claimed ? 'var(--border)' : isReached ? (isFinale ? 'var(--gold)' : 'var(--accent-dim)') : 'var(--border)',
                  background: isReached && !claimed ? 'rgba(245,197,66,0.07)' : 'var(--surface)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-bold uppercase tracking-wide" style={{ color: isFinale ? 'var(--gold)' : 'var(--text)' }}>
                    {tr('quests.tier', { n: t.tier })}{isFinale ? ` · ${tr('quests.finale')}` : ''}
                  </p>
                  <span className="tnum text-[11px] font-semibold text-[var(--dim)]">{formatNumber(t.xpRequired)} XP</span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-[var(--gold)]">{t.rewardLabel}</p>
                <div className="mt-2">
                  {claimed ? (
                    <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-bold text-[var(--dim)]">{tr('hub.claimed')}</span>
                  ) : isReached ? (
                    <button
                      type="button"
                      onClick={() => claimTier(t.tier)}
                      aria-label={`Claim Season Pass tier ${t.tier} reward: ${t.rewardLabel}`}
                      className="rounded-lg bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-black"
                    >
                      {tr('hub.claim')}
                    </button>
                  ) : (
                    <span className="tnum text-[11px] font-semibold text-[var(--dim)]">
                      {tr('quests.xpToGo', { n: t.xpRequired - profile.seasonPassXp })}
                    </span>
                  )}
                  {profile.seasonPassPremium && isReached && !(profile.seasonPassPremiumClaimedTiers ?? []).includes(t.tier) && (
                    <button
                      type="button"
                      onClick={() => claimPremiumTier(t.tier)}
                      aria-label={`Claim premium Season Pass tier ${t.tier} reward: ${t.rewardLabel}`}
                      className="ml-1.5 rounded-lg border border-[var(--gold)]/70 px-2.5 py-1.5 text-[11px] font-bold text-[var(--gold)]"
                    >
                      ★ Premium
                    </button>
                  )}
                  {profile.seasonPassPremium && (profile.seasonPassPremiumClaimedTiers ?? []).includes(t.tier) && (
                    <span className="ml-1.5 text-[11px] font-bold text-[var(--gold)]">{tr('quests.premiumClaimed')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
