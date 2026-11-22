// Striker FC — ui/screens/LeaguesScreen.tsx
// The Leagues tab (visual bible §2.10): the player's club panel on the
// left (crest, name, squad strength, division) and the league notice
// board on the right — orange notification rows with dark GO pills,
// each built from REAL profile state (claimable quests, the Star Pass,
// the daily reward, a sold player's coins, a live tournament) and each
// routing to the screen that resolves it. Bottom quick links mirror
// the reference's QUESTS / REWARDS / TOURNAMENT / LEADERBOARD tabs.

import type { SaveProfile } from '../../core/types';
import { squadTeamOvr, resolveXI } from '../../meta/SquadService';
import { dailyQuests, weeklyQuests, questComplete, questProgressOf, seasonPassTierReached } from '../../meta/QuestService';
import { dailyRewardStatus } from '../../meta/DailyRewardService';
import { claimableSales } from '../../meta/MarketService';
import { divisionName } from '../../modes/HeadToHeadMode';
import { formatNumber, t } from '../../i18n/i18n';
import { ClubCrestArt } from '../components/ClubCrestArt';
import trophyWorldUrl from '../../assets/art/trophy-world.jpg';
import trophyLeagueUrl from '../../assets/art/trophy-league.jpg';

interface Notice {
  id: string;
  text: string;
  go: () => void;
}

export function LeaguesScreen({
  profile,
  onGoQuests,
  onGoEvents,
  onGoPlay,
  onGoMarket,
}: {
  profile: SaveProfile;
  onGoQuests: () => void;
  onGoEvents: () => void;
  onGoPlay: () => void;
  onGoMarket: () => void;
}) {
  const nowMs = Date.now();
  const teamOvr = squadTeamOvr(profile);
  const xiCount = resolveXI(profile).filter((r) => r.card).length;
  const sale = claimableSales(profile, nowMs)[0];

  const notices: Notice[] = [];
  const claimable = [...dailyQuests(), ...weeklyQuests()].filter(
    (q) => questComplete(profile, q) && !questProgressOf(profile, q.id).claimed,
  );
  if (claimable.length > 0) {
    notices.push({ id: 'quest', text: t('leagues.questReady', { n: claimable.length }), go: onGoQuests });
  }
  const passReached = seasonPassTierReached(profile);
  const passClaimedMax = Math.max(0, ...profile.seasonPassClaimedTiers);
  if (passReached > passClaimedMax) {
    notices.push({ id: 'pass', text: t('leagues.passUnlocked', { n: passReached }), go: onGoQuests });
  }
  if (dailyRewardStatus(profile, nowMs).canClaim) {
    notices.push({ id: 'daily', text: t('leagues.dailyReady'), go: onGoEvents });
  }
  if (sale) {
    notices.push({ id: 'sale', text: t('leagues.soldReady', { coins: formatNumber(sale.netPayout) }), go: onGoMarket });
  }
  if (profile.tournament) {
    notices.push({ id: 'cup', text: t('leagues.cupLive'), go: onGoPlay });
  }

  const links = [
    { id: 'quests', label: t('leagues.linkQuests'), go: onGoQuests, active: true },
    { id: 'rewards', label: t('leagues.linkRewards'), go: onGoEvents, active: false },
    { id: 'tournament', label: t('leagues.linkTournament'), go: onGoPlay, active: false },
    { id: 'rivals', label: t('leagues.linkRivals'), go: onGoPlay, active: false },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-6 pt-3 sm:px-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* Club panel */}
        <section
          className="w-full rounded-3xl border border-white/12 bg-[#0b1e3a] p-5 sm:w-[300px]"
          aria-label={t('leagues.clubPanel')}
        >
          <div className="flex items-center gap-4">
            <ClubCrestArt
              clubId="user_club"
              primary={profile.clubPrimaryColor}
              secondary={profile.clubSecondaryColor}
              abbr={profile.clubAbbr}
              name={profile.clubName}
              size={76}
            />
            <div className="min-w-0">
              <h1 className="font-display truncate text-[26px] font-bold uppercase leading-none tracking-wide text-white">
                {profile.clubName}
              </h1>
              <p className="mt-1 text-[12px] font-semibold text-white/65">
                {divisionName(profile.h2hDivision)} · {formatNumber(profile.h2hStars)} ★
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/30 px-2 py-2.5">
              <dt className="text-[8.5px] font-black uppercase tracking-widest text-white/55">{t('hub.teamOvr')}</dt>
              <dd className="tnum font-display mt-0.5 text-[22px] font-bold leading-none text-[var(--gold)]">{teamOvr}</dd>
            </div>
            <div className="rounded-xl bg-black/30 px-2 py-2.5">
              <dt className="text-[8.5px] font-black uppercase tracking-widest text-white/55">{t('leagues.members')}</dt>
              <dd className="tnum font-display mt-0.5 text-[22px] font-bold leading-none text-white">
                {xiCount}/11
              </dd>
            </div>
            <div className="rounded-xl bg-black/30 px-2 py-2.5">
              <dt className="text-[8.5px] font-black uppercase tracking-widest text-white/55">{t('hub.squad')}</dt>
              <dd className="tnum font-display mt-0.5 text-[22px] font-bold leading-none text-white">
                {formatNumber(profile.inventory.length)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-white/60">
            {profile.managerName}
          </p>
          {/* Trophy cabinet: real silverware from the profile — the World
              Cup when won, the league trophy per Career title. Until
              anything is won the league trophy shows dimmed, as the prize
              to chase; a failed photo hides and the text line remains. */}
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/30 p-2">
            {profile.worldCup?.stage === 'WON' && (
              <img src={trophyWorldUrl} alt="" aria-hidden className="h-16 w-auto shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-[var(--gold)]/50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
            <img src={trophyLeagueUrl} alt="" aria-hidden className={`h-16 w-auto shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-[var(--gold)]/50 ${(profile.career?.titlesWon ?? 0) > 0 ? '' : 'opacity-40 grayscale'}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className="min-w-0">
              <p className="font-display text-[15px] font-bold uppercase leading-tight tracking-wide text-[var(--gold)]">{t('end.champions')}</p>
              <p className="tnum mt-0.5 text-[12px] font-semibold text-white/70">
                {profile.worldCup?.stage === 'WON' ? t('nations.champions') : t('modes.titlesWon', { n: profile.career?.titlesWon ?? 0 })}
              </p>
            </div>
          </div>
        </section>

        {/* Notice board */}
        <section className="min-w-[260px] flex-1" aria-label={t('leagues.notifications')}>
          <h2 className="font-display text-[22px] font-bold uppercase tracking-wide text-white">
            {t('leagues.title')}
          </h2>
          <div className="mt-3 space-y-2">
            {notices.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/20 bg-white/[0.04] px-4 py-5 text-center text-sm font-semibold text-white/60">
                {t('leagues.allCaughtUp')}
              </p>
            ) : (
              notices.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
                  style={{ background: 'linear-gradient(100deg, #ff7a1a 0%, #ff5a1f 100%)' }}
                >
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/30 text-[17px]">🔔</span>
                  <p className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
                    {n.text}
                  </p>
                  <button
                    type="button"
                    onClick={n.go}
                    className="font-display shrink-0 rounded-full bg-[#101828] px-5 py-2 text-[15px] font-bold uppercase tracking-widest text-white shadow"
                  >
                    {t('leagues.go')}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Bottom quick links — the reference's league tabs */}
      <nav className="mt-5 grid grid-cols-4 gap-2" aria-label={t('leagues.title')}>
        {links.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={l.go}
            aria-current={l.active ? 'page' : undefined}
            className={`font-display rounded-xl px-2 py-3 text-[14px] font-bold uppercase tracking-widest sm:text-[16px] ${
              l.active
                ? 'bg-[#c6f135] text-[#111827] shadow-lg'
                : 'border border-white/15 bg-white/[0.06] text-white/85'
            }`}
          >
            {l.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
