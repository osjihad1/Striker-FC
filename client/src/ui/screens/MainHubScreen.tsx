// Striker FC — ui/screens/MainHubScreen.tsx
// The Lobby, rebuilt FC Mobile / eFootball style: a glass top bar (crest,
// Guest manager, pass level, Coins / Gems / Tokens, settings + inbox), a
// floodlit hero with the captain as a live rotating 3D showcase on a
// podium next to the Team OVR / division badges and a glowing PLAY
// button, a snap-scrolling event-banner carousel, large gradient mode
// tiles with real progress, a claimable 7-day Daily Rewards strip, Daily
// Training, a Top Players card row and a News & Tips card. Every control
// opens a real screen or starts a real match — there are no dead tiles.

import { useEffect, useState } from 'react';
import type { SaveProfile } from '../../core/types';
import { getPlayerById } from '../../data/PlayerDatabase';
import { getNationalTeam } from '../../data/NationalTeams';
import { captainOf, resolveXI, squadTeamOvr } from '../../meta/SquadService';
import { freePackCooldownMs } from '../../meta/PackService';
import { claimableSales } from '../../meta/MarketService';
import {
  dailyQuests, msUntilDailyReset, msUntilWeeklyReset, questComplete, questProgressOf, seasonPassTierReached, weeklyQuests,
} from '../../meta/QuestService';
import { DAILY_REWARDS, claimDailyReward, dailyRewardStatus } from '../../meta/DailyRewardService';
import { FIRST_WEEK, claimFirstWeekDay, firstWeekDay, firstWeekStatus } from '../../meta/FirstWeekService';
import { currentFeaturedPack, currentSeason } from '../../meta/SeasonService';
import { currentLanguage, formatAgo, formatNumber, t } from '../../i18n/i18n';
import { SEASON_PASS_TIERS } from '../../data/PacksAndQuests';
import { ALL_CLUBS } from '../../data/Clubs';
import { DIVISIONS, STARS_TO_PROMOTE, divisionIndexOf, divisionName, h2hSeasonDaysLeft, h2hWinCoins } from '../../modes/HeadToHeadMode';
import { SKILL_GAMES } from '../../modes/SkillGamesMode';
import { PlayerCard } from '../components/PlayerCard';
import { ClubCrestArt } from '../components/ClubCrestArt';
import { getFormationById } from '../../data/Formations';
import { PlayerShowcase } from '../../rendering/PlayerShowcase';
import heroStarUrl from '../../assets/hero-star.jpg';
import championsHeroUrl from '../../assets/art/champions-hero.jpg';
import packGoldUrl from '../../assets/pack-gold.jpg';

function ClubCrest({ profile, size = 46 }: { profile: SaveProfile; size?: number }) {
  return (
    <span className="shrink-0">
      <ClubCrestArt
        clubId="user_club"
        primary={profile.clubPrimaryColor}
        secondary={profile.clubSecondaryColor}
        abbr={profile.clubAbbr}
        name={profile.clubName}
        size={size}
      />
    </span>
  );
}

function CoinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#f5c542" stroke="#b8860b" strokeWidth="1.6" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#7a5200">C</text>
    </svg>
  );
}
function GemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2 L22 9 L12 22 L2 9 Z" fill="#7dd3fc" stroke="#0369a1" strokeWidth="1.4" />
      <path d="M2 9 H22 M12 2 L8 9 L12 22 L16 9 L12 2" fill="none" stroke="#e0f2fe" strokeWidth="1" />
    </svg>
  );
}
function TokenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 5 h16 v4 a3 3 0 0 0 0 6 v4 H4 v-4 a3 3 0 0 0 0-6 Z" fill="#f0abfc" stroke="#a21caf" strokeWidth="1.4" />
    </svg>
  );
}

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${formatNumber(d)}${t('time.dayUnit')} ${formatNumber(h)}${t('time.hourUnit')}`;
  if (h > 0) return `${formatNumber(h)}${t('time.hourUnit')} ${formatNumber(m)}${t('time.minUnit')}`;
  return `${formatNumber(m)}${t('time.minUnit')}`;
}

export interface MainHubProps {
  profile: SaveProfile;
  onPlay: () => void;
  onSquad: () => void;
  onPlayers: () => void;
  onSettings: () => void;
  onInspect: (instanceId: string) => void;
  onStore: () => void;
  onMarket: () => void;
  onQuests: () => void;
  onEvents: () => void;
  onTraining: () => void;
  onNations: () => void;
  onClubs: () => void;
  /** Start a classic full match in the 3D stadium immediately. */
  onQuickMatch: () => void;
  /** Launch the mode sessions straight from the lobby tiles. */
  onLaunchH2h: () => void;
  onLaunchVsa: () => void;
  onLaunchManager: () => void;
  /** Attack / Defend scenario modes (open their rules intro first). */
  onAttack: () => void;
  onDefend: () => void;
  /** Persist a profile transform (Daily Rewards claim). */
  onCommit: (next: SaveProfile) => void;
  /** Epic P0-1: trial friendly — play AS this Legend with his national XI. */
  onPlayAsLegend: (templateId: string) => void;
  /** Epic P0-1: open a Legend's full card detail even when not owned. */
  onViewLegend: (templateId: string) => void;
}

export function MainHubScreen(props: MainHubProps) {
  const {
    profile, onPlay, onSquad, onPlayers, onSettings, onInspect, onStore, onMarket,
    onQuests, onEvents, onTraining, onNations, onClubs, onQuickMatch, onLaunchH2h, onLaunchVsa, onLaunchManager, onAttack, onDefend, onCommit,
    onPlayAsLegend, onViewLegend,
  } = props;
  const [notice, setNotice] = useState<string | null>(null);

  // Epic P0-1: the Legends showcase — Messi, Ronaldo, Mbappé and Maradona
  // in 3D on the lobby's first screen, rotating every few seconds.
  const LEGEND_IDS = ['rw_messi', 'rw_ronaldo', 'rw_mbappe', 'rw_maradona'] as const;
  const [legendIdx, setLegendIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLegendIdx((i) => (i + 1) % LEGEND_IDS.length), 4500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const legendTpl = getPlayerById(LEGEND_IDS[legendIdx] ?? 'rw_messi');
  const legendNation = legendTpl ? getNationalTeam(legendTpl.nationality) : null;
  const legendXiEntry = legendNation?.xi.find((p) => p.id === legendTpl?.id);
  const legendOwned = legendTpl ? profile.inventory.some((c) => c.templateId === legendTpl.id) : false;
  const legendKit = {
    primary: legendNation?.primary ?? '#f5c542',
    secondary: legendNation?.secondary ?? '#111111',
    shorts: '#f8fafc',
    socks: legendNation?.primary ?? '#f5c542',
  };

  const teamOvr = squadTeamOvr(profile);
  const captain = captainOf(profile);
  const xi = resolveXI(profile);
  const nowMs = Date.now();

  const freeMs = freePackCooldownMs(profile, nowMs);
  const claimableQuests = [...dailyQuests(), ...weeklyQuests()]
    .filter((q) => questComplete(profile, q) && !questProgressOf(profile, q.id).claimed);
  const passTier = seasonPassTierReached(profile);
  const nextPassTier = SEASON_PASS_TIERS.find((t) => t.tier === passTier + 1);
  const passLevel = Math.min(20, passTier + 1);
  const soldInbox = claimableSales(profile, nowMs).length;
  const drillStars = Object.values(profile.skillStars ?? {}).reduce((a, b) => a + b, 0);
  const reward = dailyRewardStatus(profile, nowMs);
  const cup = profile.tournament ?? null;
  const cupLabel = !cup
    ? t('hub.cupEnter')
    : cup.status === 'CHAMPION'
      ? t('hub.cupChamps')
      : cup.status === 'ELIMINATED'
        ? t('hub.cupOut')
        : t('hub.cupInProgress', { round: t(`end.round${cup.currentRound}`) });

  const captainClub = captain?.template
    ? ALL_CLUBS.find((c) => c.id === captain.template!.clubId)
    : undefined;
  const topPlayers = [...xi]
    .filter((r) => r.template && r.card)
    .sort((a, b) => (b.slotOvr ?? 0) - (a.slotOvr ?? 0))
    .slice(0, 6);

  const claimDaily = () => {
    const result = claimDailyReward(profile, Date.now());
    if (result.error || !result.reward) {
      setNotice(result.error ?? 'Reward unavailable right now.');
      return;
    }
    onCommit(result.profile);
    setNotice(
      `Day ${result.reward.day} reward claimed — ${formatNumber(result.reward.coins)} Coins`
      + `${result.reward.gems > 0 ? ` and ${formatNumber(result.reward.gems)} Gems` : ''} added to your wallet.`
      + (result.packNames.length > 0
        ? ` ${t('hub.milestonePack')} ${result.packNames.join(', ')} joined your club!`
        : ''),
    );
  };

  // Cycle-2: the 30-day calendar's cell state — banked days, today's
  // claimable day, and the milestone days still ahead.
  const cellState = (day: number): 'claimed' | 'today' | 'next' => {
    if (reward.claimedToday) return day <= reward.lastClaimedDay ? 'claimed' : 'next';
    if (day < reward.nextDay) return 'claimed';
    if (day === reward.nextDay) return 'today';
    return 'next';
  };

  // Cycle-2: the event carousel auto-advances every 5 s; the featured
  // slot shows one banner large, dots jump straight to any banner, and a
  // touch on the featured banner pauses the rotation briefly.
  const [bannerIdx, setBannerIdx] = useState(0);
  const [carouselHoldUntil, setCarouselHoldUntil] = useState(0);

  const banners: {
    key: string; kicker: string; title: string; sub: string; chip: string;
    gradient: string; cta: string; action: () => void; progress?: number;
  }[] = [
    {
      key: 'free', kicker: t('nav.store'), title: freeMs <= 0 ? t('hub.bannerFreeReady') : t('hub.bannerFree'),
      sub: freeMs <= 0 ? t('hub.bannerFreeReadySub') : t('hub.bannerFreeSub'),
      chip: freeMs <= 0 ? t('hub.bannerReady') : formatCountdown(freeMs),
      gradient: 'linear-gradient(120deg, #713f12 0%, #b45309 55%, #f59e0b 130%)',
      cta: freeMs <= 0 ? t('hub.bannerClaimStore') : t('hub.bannerOpenStore'), action: onStore,
    },
    {
      key: 'events', kicker: t('hub.liveEvents'), title: claimableQuests.length > 0 ? t('hub.bannerRewardsToClaim', { n: claimableQuests.length }) : t('hub.bannerEventsLive'),
      sub: t('hub.bannerEventsSub'),
      chip: t('hub.bannerReset', { time: formatCountdown(msUntilDailyReset(nowMs)) }),
      gradient: 'linear-gradient(120deg, #4c0519 0%, #9f1239 60%, #e11d48 130%)',
      cta: t('hub.bannerOpenEvents'), action: onEvents,
    },
    {
      key: 'pass', kicker: t('hub.bannerPassKicker'), title: t('hub.bannerPassTitle', { tier: passTier }),
      sub: nextPassTier
        ? t('hub.bannerPassSub', { xp: Math.max(0, nextPassTier.xpRequired - profile.seasonPassXp), tier: nextPassTier.tier })
        : t('hub.bannerPassDone'),
      chip: t('hub.bannerXp', { xp: profile.seasonPassXp }),
      gradient: 'linear-gradient(120deg, #1e1b4b 0%, #6d28d9 60%, #a855f7 130%)',
      cta: t('hub.bannerOpenPass'), action: onQuests,
      progress: Math.min(100, (profile.seasonPassXp / 10000) * 100),
    },
    {
      key: 'cup', kicker: t('hub.bannerCupKicker'), title: t('hub.bannerCupTitle'),
      sub: `${cupLabel} — ${t('hub.bannerCupPrize', { coins: 25000, gems: 500 })}`,
      chip: cup?.status === 'IN_PROGRESS' ? t(`end.round${cup.currentRound}`) : t('hub.bannerCupChip'),
      gradient: 'linear-gradient(120deg, #082f49 0%, #0369a1 60%, #38bdf8 130%)',
      cta: t('hub.bannerOpenCup'), action: onPlay,
    },
    {
      key: 'market', kicker: t('hub.bannerMarketKicker'), title: soldInbox > 0 ? (soldInbox === 1 ? t('hub.bannerSoldOne') : t('hub.bannerSoldMany', { n: soldInbox })) : t('hub.bannerMarketMoving'),
      sub: soldInbox > 0 ? t('hub.bannerSoldSub') : t('hub.bannerMarketSub'),
      chip: soldInbox > 0 ? t('hub.bannerInbox') : t('hub.bannerLive'),
      gradient: 'linear-gradient(120deg, #3b0764 0%, #86198f 60%, #d946ef 130%)',
      cta: t('hub.bannerOpenMarket'), action: onMarket,
    },
  ];

  const featuredBanner = banners[bannerIdx % banners.length] ?? banners[0]!;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() < carouselHoldUntil) return;
      setBannerIdx((i) => (i + 1) % banners.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [banners.length, carouselHoldUntil]);

  const modes: {
    key: string; title: string; meta: string; gradient: string; action: () => void;
    icon: React.ReactNode; progress?: number; wide?: boolean;
  }[] = [
    {
      key: 'h2h', title: t('modes.headToHead'), wide: true,
      meta: `${divisionName(profile.h2hDivision)} · ${t('hub.rivalsStars', { stars: profile.h2hStars, max: STARS_TO_PROMOTE })}`,
      gradient: 'linear-gradient(125deg, #14532d 0%, #15803d 58%, #a3e635 135%)',
      action: onLaunchH2h, progress: (profile.h2hStars / STARS_TO_PROMOTE) * 100,
      icon: <path d="M8 5v14l11-7z" fill="currentColor" />,
    },
    {
      key: 'vsa', title: t('modes.vsAttack'),
      meta: t('hub.metaVsa', { n: profile.vsaFans }),
      gradient: 'linear-gradient(125deg, #064e3b 0%, #059669 60%, #34d399 135%)',
      action: onLaunchVsa,
      icon: <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" fill="currentColor" />,
    },
    {
      key: 'manager', title: t('modes.manager'),
      meta: t('hub.metaManager', { n: profile.managerTrophies }),
      gradient: 'linear-gradient(125deg, #0c2d4d 0%, #0369a1 60%, #38bdf8 135%)',
      action: onLaunchManager,
      icon: <path d="M4 5h16v3H4zM4 11h10v3H4zM4 17h13v3H4z" fill="currentColor" />,
    },
    {
      key: 'attack', title: t('modes.attackMode'),
      meta: t('hub.metaAttack', { n: profile.attackBest ?? 0 }),
      gradient: 'linear-gradient(125deg, #7c2d12 0%, #ea580c 60%, #facc15 135%)',
      action: onAttack,
      icon: <path d="M4 4l7.2 7.2-2.1 2.1L2 6.1V4h2zM20 4v2.1l-7.1 7.2-2.1-2.1L18 4h2zM9.5 14.5 12 12l2.5 2.5L12 17l-2.5-2.5zM12 18.5 5 21l-1 1 1-1 2.5-7L12 18.5z" fill="currentColor" />,
    },
    {
      key: 'defend', title: t('modes.defendMode'),
      meta: t('hub.metaDefend', { n: profile.defendBest ?? 0 }),
      gradient: 'linear-gradient(125deg, #082f49 0%, #0369a1 60%, #38bdf8 135%)',
      action: onDefend,
      icon: <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3zm0 2.3 6 2.2V11c0 4-2.7 7.6-6 9-3.3-1.4-6-5-6-9V6.5l6-2.2z" fill="currentColor" />,
    },
    {
      key: 'cup', title: t('hub.modeTournament'),
      meta: cupLabel,
      gradient: 'linear-gradient(125deg, #713f12 0%, #ca8a04 60%, #f5c542 135%)',
      action: onPlay,
      icon: <path d="M6 3h12v4h3v2a5 5 0 0 1-5 5h-.42A6 6 0 0 1 13 17.92V20h4v3H7v-3h4v-2.08A6 6 0 0 1 8.42 14H8a5 5 0 0 1-5-5V7h3V3zm-1 6a3 3 0 0 0 3 3V9H5zm14 0h-3v3a3 3 0 0 0 3-3z" fill="currentColor" />,
    },
    {
      key: 'training', title: t('hub.modeTraining'),
      meta: t('hub.metaTraining', { stars: drillStars, xp: profile.trainingXpPool }),
      gradient: 'linear-gradient(125deg, #7c2d12 0%, #ea580c 60%, #facc15 135%)',
      action: onTraining, progress: (drillStars / 12) * 100,
      icon: <path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v2a5 5 0 1 0 5 5h2a7 7 0 0 1-14 0 9 9 0 0 1 7-9z" fill="currentColor" />,
    },
  ];

  return (
    <section aria-label="Lobby" className="mt-3">
      {/* ── Top bar: crest, guest manager, currencies, settings + inbox ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-white/12 bg-[#0b1428]/85 px-3 py-2.5 shadow-xl backdrop-blur">
        <ClubCrest profile={profile} />
        <div className="min-w-0">
          <p className="font-display truncate text-[22px] font-bold uppercase leading-none tracking-wide">{profile.clubName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[var(--dim)]">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/90">
              {t('hub.guest', { name: profile.managerName === 'Manager' ? 'Jihad' : profile.managerName })}
            </span>
            <span className="rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[var(--gold)]">{t('hub.passLevel', { n: passLevel })}</span>
            <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[var(--accent)]">{divisionName(profile.h2hDivision)}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-black/45 py-1.5 pl-2.5 pr-2" aria-label={`${formatNumber(profile.coins)} coins`}>
            <CoinIcon />
            <span className="tnum text-[13px] font-bold text-[var(--gold)]">{formatNumber(profile.coins)}</span>
            <button type="button" onClick={onStore} aria-label="Get more coins in the Store" className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gold)] text-[13px] font-black leading-none text-[#231a00]">+</button>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-black/45 py-1.5 pl-2.5 pr-2" aria-label={`${formatNumber(profile.gems)} gems`}>
            <GemIcon />
            <span className="tnum text-[13px] font-bold text-sky-300">{formatNumber(profile.gems)}</span>
            <button type="button" onClick={onStore} aria-label="Get more gems in the Store" className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-[13px] font-black leading-none text-[#082f49]">+</button>
          </span>
          <span className="hidden items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 min-[420px]:flex" aria-label={`${profile.rankUpTokens} rank-up tokens`}>
            <TokenIcon />
            <span className="tnum text-[13px] font-bold text-fuchsia-300">{profile.rankUpTokens}</span>
          </span>
          <button
            type="button"
            onClick={onMarket}
            aria-label={soldInbox > 0 ? `Inbox — ${soldInbox} sales sold, claim in the Transfer Market` : 'Inbox — open the Transfer Market'}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden><path d="M3 5h18v14H3z M3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            {soldInbox > 0 && (
              <span className="tnum absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{soldInbox}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zM19.4 13.5l2.1 1.6-2 3.4-2.4-1a8 8 0 0 1-1.7 1L15 21h-6l-.4-2.5a8 8 0 0 1-1.7-1l-2.4 1-2-3.4 2.1-1.6a8 8 0 0 1 0-2L2.5 8.9l2-3.4 2.4 1a8 8 0 0 1 1.7-1L9 3h6l.4 2.5a8 8 0 0 1 1.7 1l2.4-1 2 3.4-2.1 1.6a8 8 0 0 1 0 2z" fill="currentColor" transform="scale(0.92) translate(1 1)" /></svg>
          </button>
        </div>
      </div>

      {/* ── Addendum 1: Today's Objectives — the first-week chain's current
          day (and, once the week is done, the daily quest pointer). ── */}
      {(() => {
        const nowMs = Date.now();
        const today = firstWeekDay(profile, nowMs);
        const dayDef = FIRST_WEEK.find((d) => d.day === Math.min(7, today));
        if (!dayDef) return null;
        const status = firstWeekStatus(profile, dayDef, nowMs);
        if (status === 'CLAIMED' && today > 7) return null;
        const prog = dayDef.progress(profile);
        return (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--surface)] px-3.5 py-2.5" aria-label="Today's objectives">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
                {t('hub.todaysObjective')} · {t('hub.firstWeekDay', { n: dayDef.day })}
              </p>
              <p className="truncate text-sm font-bold">{dayDef.title}
                <span className="tnum ml-2 text-xs font-semibold text-[var(--dim)]">{prog.current}/{prog.target} · +{formatNumber(dayDef.coins)}c</span>
              </p>
            </div>
            {status === 'CLAIMABLE' ? (
              <button
                type="button"
                onClick={() => {
                  const r = claimFirstWeekDay(profile, dayDef.day, nowMs);
                  if (r.error) { setNotice(r.error); return; }
                  onCommit(r.profile);
                  setNotice(r.packNames.length > 0
                    ? `Day 7 claimed: +${formatNumber(r.coins)} coins and a Gold+ pack — ${r.packNames.join(', ')} joined your club!`
                    : `Objective claimed: +${formatNumber(r.coins)} coins.`);
                }}
                className="shrink-0 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-black uppercase tracking-wide text-[#0a120c]"
              >
                Claim
              </button>
            ) : (
              <button
                type="button"
                onClick={onEvents}
                className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--dim)]"
              >
                {status === 'CLAIMED' ? 'Done ✓' : 'View'}
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Hero (visual bible §2.1): full-bleed photo art, the teal TEAM
          OF THE SEASON event banner, a gold MY TEAM panel and PLAY.
          No plain backgrounds, no empty space — the photo IS the lobby. ── */}
      <div className="relative mt-3 overflow-hidden rounded-3xl border border-white/15 shadow-2xl">
        <img src={heroStarUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-[22%_30%]" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(96deg, rgba(4,10,24,0.10) 0%, rgba(4,10,24,0.30) 42%, rgba(4,10,24,0.86) 74%, rgba(4,10,24,0.95) 100%), linear-gradient(0deg, rgba(4,10,24,0.88) 0%, transparent 46%)' }}
        />
        <div className="relative flex min-h-[308px] flex-col px-4 py-4 sm:px-5">
          {/* gold MY TEAM panel, top-right over the art */}
          <div className="ml-auto flex items-center gap-3 rounded-2xl px-3.5 py-2.5 shadow-xl ring-1 ring-black/25" style={{ background: 'linear-gradient(140deg, #d9c07a 0%, #b89b4e 55%, #8f7434 100%)' }}>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#3a2c05]">{t('nav.myTeam')}</p>
              <p className="font-display text-[17px] font-bold uppercase leading-none text-[#241a02]">
                {getFormationById(profile.activeFormationId)?.name ?? '4-3-3'}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4a3a08]">
                {divisionName(profile.h2hDivision)} · {formatNumber(profile.h2hStars)}/{formatNumber(STARS_TO_PROMOTE)}★
              </p>
            </div>
            <div className="rounded-xl bg-black/35 px-2.5 py-1 text-center">
              <p className="tnum font-display text-[26px] font-bold leading-none text-[var(--gold)]">{teamOvr}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-white/75">{t('hub.teamOvr')}</p>
            </div>
          </div>

          <div className="mt-auto">
            {/* teal event banner — the live event billboard */}
            <button
              type="button"
              onClick={onEvents}
              className="group relative block w-full max-w-[520px] overflow-hidden rounded-2xl text-left shadow-2xl ring-1 ring-white/25 sm:w-[62%]"
              style={{ background: 'linear-gradient(115deg, #2de1c2 0%, #00d9c0 45%, #00a88f 100%)' }}
              aria-label={`${t('events.totsTitle')} — ${t('hub.liveEvents')}`}
            >
              <img src={packGoldUrl} alt="" aria-hidden className="absolute -right-8 -top-10 h-44 w-auto rotate-6 opacity-90 drop-shadow-2xl" />
              <span className="relative block px-4 py-3.5">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#04382f]">{t('events.totsKicker')} · {t('hub.liveEvents')}</span>
                <span className="font-display block text-[30px] font-bold uppercase leading-[0.95] tracking-wide text-white sm:text-[36px]" style={{ textShadow: '0 2px 12px rgba(0,60,50,0.45)' }}>
                  {t('events.totsTitle')}
                </span>
                <span className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white">
                  {claimableQuests.length > 0 ? t('hub.bannerRewardsToClaim', { n: claimableQuests.length }) : t('hub.bannerEventsLive')}
                  <span aria-hidden>→</span>
                </span>
              </span>
            </button>
            {captain?.template && (
              <p className="mt-2.5 text-[12px] font-semibold text-white/85" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                <span className="font-black uppercase tracking-[0.22em] text-[var(--teal)]">{t('hub.yourCaptain')}</span>{' '}
                {captain.template.name} · {captain.slotOvr} OVR · {captain.role}
                {captainClub ? ` · ${captainClub.abbr}` : ''}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onPlay}
                className="play-glow font-display flex-1 rounded-2xl bg-[var(--accent)] px-4 py-3.5 text-[26px] font-bold uppercase tracking-[0.18em] text-[#0a120c]"
              >
                ▶ {t('hub.play')}
              </button>
              <button
                type="button"
                onClick={onQuickMatch}
                className="font-display rounded-2xl border border-white/35 bg-black/45 px-4 py-3.5 text-lg font-bold uppercase tracking-wider text-white backdrop-blur"
              >
                {t('hub.quickMatch')}
              </button>
              {captain?.card && (
                <button
                  type="button"
                  onClick={() => onInspect(captain.card!.instanceId)}
                  className="font-display hidden rounded-2xl border border-[var(--gold)]/60 bg-black/50 px-4 py-3.5 text-lg font-bold uppercase tracking-wider text-[var(--gold)] min-[480px]:block"
                >
                  Captain
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Champions banner (trophy art): the trophy-lift photo opens the
          International Cup on the Nations screen. The dark gradient stays
          as the fallback if the photo fails to load. ── */}
      <button
        type="button"
        onClick={onNations}
        className="relative mt-3 block w-full overflow-hidden rounded-3xl border border-[var(--gold)]/50 text-left shadow-2xl"
        aria-label={`${t('nations.cupTitle')} — ${t('nations.glory')}`}
      >
        <img src={championsHeroUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_25%]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(96deg, rgba(4,10,24,0.55) 0%, rgba(4,10,24,0.25) 55%, rgba(4,10,24,0.75) 100%), linear-gradient(0deg, rgba(4,10,24,0.85) 0%, transparent 55%)' }} />
        <span className="relative block px-4 py-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--gold)]">{t('nations.cupTitle')}</span>
          <span className="font-display mt-1 block text-[26px] font-bold uppercase leading-[0.95] text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
            {t('nations.glory')}
          </span>
          <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white">
            {t('events.goNow')} →
          </span>
        </span>
      </button>

      {/* ── Live status tiles: claim badges + countdowns, all real state ── */}
      <div className="mt-3 grid grid-cols-2 gap-2 min-[720px]:grid-cols-4" aria-label="Live status">
        <button type="button" onClick={onEvents} className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#0b1e3a] px-3.5 py-3 text-left">
          <span aria-hidden className="absolute inset-y-0 right-0 w-16 opacity-25" style={{ background: 'linear-gradient(90deg, transparent, #2de1c2)' }} />
          <span className="relative block text-[9.5px] font-black uppercase tracking-[0.24em] text-[var(--teal)]">{t('hub.liveEvents')}</span>
          <span className="font-display relative mt-0.5 block text-[19px] font-bold uppercase leading-tight text-white">
            {claimableQuests.length > 0 ? t('hub.bannerRewardsToClaim', { n: claimableQuests.length }) : t('hub.bannerEventsLive')}
          </span>
          <span className="tnum relative mt-0.5 block text-[11px] font-semibold text-white/65">
            {t('hub.bannerReset', { time: formatCountdown(msUntilDailyReset(nowMs)) })}
          </span>
          {claimableQuests.length > 0 && (
            <span className="tnum absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c6f135] px-1.5 font-display text-[12px] font-bold text-[#111827]">
              {claimableQuests.length}
            </span>
          )}
        </button>
        <button type="button" onClick={onLaunchH2h} className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#131b33] px-3.5 py-3 text-left">
          <span className="block text-[9.5px] font-black uppercase tracking-[0.24em] text-[var(--gold)]">{t('hub.rivals')}</span>
          <span className="font-display mt-0.5 block text-[19px] font-bold uppercase leading-tight text-white">{divisionName(profile.h2hDivision)}</span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-black/50">
            <span className="block h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, (profile.h2hStars / STARS_TO_PROMOTE) * 100)}%` }} />
          </span>
          <span className="tnum mt-1 block text-[11px] font-semibold text-white/65">
            {formatNumber(profile.h2hStars)}/{formatNumber(STARS_TO_PROMOTE)} ★
          </span>
        </button>
        <button type="button" onClick={onStore} className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#0d2430] px-3.5 py-3 text-left">
          <span className="block text-[9.5px] font-black uppercase tracking-[0.24em] text-[var(--teal)]">{t('store.dailyResourcePack')}</span>
          <span className="font-display mt-0.5 block text-[19px] font-bold uppercase leading-tight text-white">
            {freeMs <= 0 ? t('hub.bannerFreeReady') : t('hub.bannerFree')}
          </span>
          <span className="tnum mt-0.5 block text-[11px] font-semibold text-white/65">
            {freeMs <= 0 ? t('hub.bannerFreeReadySub') : formatCountdown(freeMs)}
          </span>
          {freeMs <= 0 && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-[#c6f135] px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-[#111827]">
              {t('hub.claim')}
            </span>
          )}
        </button>
        <button type="button" onClick={onQuests} className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#1d1440] px-3.5 py-3 text-left">
          <span className="block text-[9.5px] font-black uppercase tracking-[0.24em] text-fuchsia-300">{t('hub.bannerPassKicker')}</span>
          <span className="font-display mt-0.5 block text-[19px] font-bold uppercase leading-tight text-white">
            {t('hub.passLevel', { n: passLevel })}
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-black/50">
            <span className="block h-full rounded-full bg-fuchsia-400" style={{ width: `${Math.min(100, (profile.seasonPassXp / 10000) * 100)}%` }} />
          </span>
          <span className="tnum mt-1 block text-[11px] font-semibold text-white/65">
            {t('hub.bannerXp', { xp: profile.seasonPassXp })}
          </span>
        </button>
      </div>

      {/* ── Epic P0-1: Legends showcase — the four faces of the game, in 3D,
          on the first screen. Tap a Legend for his full card; Play As puts
          you on the pitch AS him with his national team. ── */}
      {legendTpl && (
        <section
          aria-label="Legends showcase"
          className="legend-aura relative mt-4 overflow-hidden rounded-3xl border border-[var(--gold)]/60"
          style={{
            background:
              'radial-gradient(80% 70% at 80% -10%, rgba(245,197,66,0.35) 0%, transparent 55%),'
              + 'linear-gradient(150deg, #241a04 0%, #131022 55%, #060b18 100%)',
          }}
        >
          <div className="relative flex items-stretch gap-1 px-4 pt-4 sm:px-5">
            <div className="min-w-0 flex-1 pb-1 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#241a04]">
                ★ Legend
              </span>
              <p className="font-display mt-2 text-[30px] font-bold uppercase leading-[0.95] tracking-wide text-white sm:text-4xl">
                {legendTpl.name}
              </p>
              <p className="tnum mt-1 text-[13px] font-semibold text-white/80">
                {legendTpl.baseOvr} OVR · {legendTpl.position} · {legendNation?.name ?? legendTpl.nationality}
                {legendXiEntry?.shirtNumber ? ` · No. ${legendXiEntry.shirtNumber}` : ''}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/60">
                {legendOwned
                  ? 'He is in your club — take him onto the pitch right now.'
                  : 'Locked stars live in the Legend Icon Pack — or step onto the pitch as him right now, free.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onPlayAsLegend(legendTpl.id)}
                  className="font-display rounded-xl bg-[var(--gold)] px-4 py-2.5 text-lg font-bold uppercase tracking-wider text-[#241a04] shadow"
                >
                  ▶ {t('hub.playAs', { name: legendTpl.shortName })}
                </button>
                <button
                  type="button"
                  onClick={() => onViewLegend(legendTpl.id)}
                  className="font-display rounded-xl border border-[var(--gold)]/60 bg-black/40 px-4 py-2.5 text-lg font-bold uppercase tracking-wider text-[var(--gold)]"
                >
                  {t('hub.viewCard')}
                </button>
              </div>
            </div>
            <div className="w-[42%] max-w-[210px] shrink-0 self-end">
              <PlayerShowcase
                key={legendTpl.id}
                template={legendTpl}
                kit={legendKit}
                shirtNumber={legendXiEntry?.shirtNumber ?? 10}
                height={228}
              />
            </div>
          </div>
          <div className="relative flex gap-1.5 px-4 pb-4 sm:px-5" role="tablist" aria-label="Choose a Legend">
            {LEGEND_IDS.map((id, i) => {
              const t = getPlayerById(id);
              if (!t) return null;
              const active = i === legendIdx;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Show ${t.name}`}
                  onClick={() => setLegendIdx(i)}
                  className={`tnum flex-1 rounded-lg px-2 py-2 text-[12px] font-bold uppercase tracking-wide transition-colors ${active ? 'bg-[var(--gold)] text-[#241a04]' : 'bg-black/45 text-white/75 ring-1 ring-white/15'}`}
                >
                  {t.shortName} · {t.baseOvr}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {notice && (
        <p aria-live="polite" className="mt-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent-dim)]/30 px-3.5 py-2.5 text-sm font-semibold text-[var(--accent)]">
          {notice}
        </p>
      )}

      {/* ── Event banners carousel: featured slot, auto-advance + dots ── */}
      <div className="mt-5 flex items-end justify-between gap-2">
        <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.liveEvents')}</h2>
        <button type="button" onClick={onEvents} className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{t('hub.allEvents')}</button>
      </div>
      <article
        key={featuredBanner.key}
        aria-label={featuredBanner.title}
        onPointerDown={() => setCarouselHoldUntil(Date.now() + 8000)}
        className="hud-banner relative mt-2.5 overflow-hidden rounded-2xl p-4 shadow-lg ring-1 ring-white/15"
        style={{ background: featuredBanner.gradient }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/75">{featuredBanner.kicker}</span>
          <span className="tnum rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white">{featuredBanner.chip}</span>
        </div>
        <h3 className="font-display mt-1.5 text-[26px] font-bold uppercase leading-none tracking-wide text-white">{featuredBanner.title}</h3>
        <p className="mt-1 min-h-8 max-w-[520px] text-[13px] leading-snug text-white/85">{featuredBanner.sub}</p>
        {featuredBanner.progress !== undefined && (
          <div className="mt-2 h-1.5 max-w-[520px] overflow-hidden rounded-full bg-black/45">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${featuredBanner.progress}%` }} />
          </div>
        )}
        <button
          type="button"
          onClick={featuredBanner.action}
          className="font-display mt-3 rounded-lg bg-white px-3.5 py-2 text-base font-bold uppercase tracking-wider text-[#101828] shadow"
        >
          {featuredBanner.cta}
        </button>
      </article>
      <div className="mt-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Event banners">
        {banners.map((b, i) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            aria-selected={i === bannerIdx % banners.length}
            aria-label={`Show banner: ${b.title}`}
            onClick={() => { setBannerIdx(i); setCarouselHoldUntil(Date.now() + 8000); }}
            className="flex h-6 items-center justify-center px-1"
          >
            <span className={`block rounded-full transition-all ${i === bannerIdx % banners.length ? 'h-2 w-6 bg-[var(--accent)]' : 'h-2 w-2 bg-white/30'}`} />
          </button>
        ))}
      </div>

      {/* ── Mode tiles ── */}
      <div className="mt-5 flex items-end justify-between gap-2">
        <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.gameModes')}</h2>
        <button type="button" onClick={onPlay} className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{t('hub.allModes')}</button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={m.action}
            aria-label={`${m.title} — ${m.meta}`}
            className={`relative overflow-hidden rounded-2xl p-3.5 text-left shadow-lg ring-1 ring-white/15 ${m.wide ? 'col-span-2 sm:col-span-1' : ''}`}
            style={{ background: m.gradient }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" className="text-white/90" aria-hidden>{m.icon}</svg>
            <span className="font-display mt-2 block text-[21px] font-bold uppercase leading-none tracking-wide text-white">{m.title}</span>
            <span className="mt-1 block text-[11.5px] font-medium leading-snug text-white/80">{m.meta}</span>
            {m.progress !== undefined && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/40">
                <span className="block h-full rounded-full bg-white/90" style={{ width: `${Math.min(100, Math.max(0, m.progress))}%` }} />
              </span>
            )}
            <span className="font-display mt-2.5 inline-block rounded-md bg-black/45 px-2.5 py-1 text-[13px] font-bold uppercase tracking-widest text-white">{t('hub.playArrow')}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onSquad}
          aria-label={t('hub.myTeamAria')}
          className="relative overflow-hidden rounded-2xl p-3.5 text-left shadow-lg ring-1 ring-white/15"
          style={{ background: 'linear-gradient(125deg, #082f49 0%, #155e75 60%, #22d3ee 135%)' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" className="text-white/90" aria-hidden><path d="M12 3 3 8l9 5 9-5-9-5zM5 10.5V16c0 1.7 3.1 3 7 3s7-1.3 7-3v-5.5l-7 3.9-7-3.9z" fill="currentColor" /></svg>
          <span className="font-display mt-2 block text-[21px] font-bold uppercase leading-none tracking-wide text-white">{t('nav.myTeam')}</span>
          <span className="mt-1 block text-[11.5px] font-medium leading-snug text-white/80">{t('hub.metaMyTeam', { ovr: teamOvr })}</span>
          <span className="font-display mt-2.5 inline-block rounded-md bg-black/45 px-2.5 py-1 text-[13px] font-bold uppercase tracking-widest text-white">{t('hub.openArrow')}</span>
        </button>
      </div>

      {/* ── Cycle-2: Division Rivals panel — division, stars, season
          countdown, the 15-rung star ladder and this week's rewards. ── */}
      <div className="mt-5 rounded-2xl border border-[var(--accent)]/35 bg-[#0b1428]/85 p-4 shadow-lg backdrop-blur" aria-label={t('hub.rivals')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.rivals')}</h2>
          <span className="tnum rounded-lg bg-black/40 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--dim)]">
            {t('hub.rivalsSeasonEnds', { time: `${formatNumber(h2hSeasonDaysLeft(profile, nowMs))}${currentLanguage() === 'bn' ? ' দিন' : 'd'}` })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-black/50 px-3 py-2 ring-1 ring-[var(--accent)]/50">
            <p className="font-display text-[19px] font-bold uppercase leading-none text-white">{divisionName(profile.h2hDivision)}</p>
            <p className="mt-1 text-[13px] tracking-[0.2em]" aria-label={t('hub.rivalsStars', { stars: profile.h2hStars, max: STARS_TO_PROMOTE })}>
              <span className="text-[var(--gold)]">{'★'.repeat(profile.h2hStars)}</span>
              <span className="text-white/25">{'★'.repeat(Math.max(0, STARS_TO_PROMOTE - profile.h2hStars))}</span>
            </p>
          </div>
          <p className="tnum min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-white/75">
            {t('hub.rivalsStars', { stars: profile.h2hStars, max: STARS_TO_PROMOTE })}
            {' · '}{t('hub.rivalsWeekly')}: {t('hub.rivalsWin')} {formatNumber(h2hWinCoins(divisionIndexOf(profile)))}c · {t('hub.rivalsDraw')} {formatNumber(1000)}c · {t('hub.rivalsLoss')} {formatNumber(400)}c
            {' · '}{t('quests.resetsIn', { time: formatCountdown(msUntilWeeklyReset(profile, nowMs)) })}
          </p>
          <button
            type="button"
            onClick={onLaunchH2h}
            className="font-display shrink-0 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-base font-bold uppercase tracking-wider text-[#0a120c]"
          >
            {t('hub.rivalsPlay')}
          </button>
        </div>
        <ol className="no-scrollbar -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-0.5" aria-label="Division ladder">
          {DIVISIONS.map((d) => {
            const mine = d.index === divisionIndexOf(profile);
            const passed = d.index < divisionIndexOf(profile);
            return (
              <li
                key={d.index}
                aria-current={mine ? 'true' : undefined}
                className={`tnum shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                  mine
                    ? 'bg-[var(--accent)] text-[#0a120c] ring-[var(--accent)]'
                    : passed
                      ? 'bg-[var(--accent)]/12 text-[var(--accent)] ring-[var(--accent)]/30'
                      : 'bg-black/35 text-white/55 ring-white/10'
                }`}
              >
                {formatNumber(d.index + 1)}. {d.name}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Daily Rewards: the 30-day login calendar ── */}
      <div className="mt-5 rounded-2xl border border-[var(--gold)]/30 bg-[#0b1428]/85 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">
            {t('hub.dailyRewards')} {reward.streak > 0 && <span className="text-[var(--gold)]">· {t('hub.dayStreak', { n: reward.streak })}</span>}
          </h2>
          {reward.canClaim ? (
            <button
              type="button"
              onClick={claimDaily}
              className="font-display rounded-lg bg-[var(--gold)] px-3.5 py-2 text-base font-bold uppercase tracking-wider text-[#231a00]"
            >
              {t('hub.claimDay', { day: reward.nextDay })} · {formatNumber(reward.nextReward.coins)}c{reward.nextReward.gems > 0 ? ` + ${formatNumber(reward.nextReward.gems)}◆` : ''}{reward.nextReward.packId ? ' + 🎁' : ''}
            </button>
          ) : (
            <span className="rounded-lg bg-black/40 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--dim)]">
              {t('hub.nextIn', { time: formatCountdown(msUntilDailyReset(nowMs)) })}
            </span>
          )}
        </div>
        <ol className="mt-3 grid grid-cols-6 gap-1.5" aria-label={t('hub.daily30')}>
          {DAILY_REWARDS.map((r) => {
            const state = cellState(r.day);
            const milestone = r.packId !== undefined;
            return (
              <li
                key={r.day}
                className={`relative rounded-xl px-1 py-2 text-center ring-1 ${
                  state === 'today'
                    ? 'bg-[var(--gold)]/20 ring-[var(--gold)]'
                    : state === 'claimed'
                      ? 'bg-[var(--accent)]/12 ring-[var(--accent)]/40'
                      : milestone
                        ? 'bg-[var(--gold)]/8 ring-[var(--gold)]/45'
                        : 'bg-black/35 ring-white/10'
                }`}
                aria-label={`${t('quests.dayN', { n: r.day })}: ${formatNumber(r.coins)} ${t('common.coins')}${r.gems > 0 ? ` + ${formatNumber(r.gems)} ${t('common.gems')}` : ''}${milestone ? ` + ${t('hub.milestonePack')}` : ''} — ${state === 'claimed' ? t('hub.claimed') : state === 'today' ? t('hub.claim') : ''}`}
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-white/60">{t('quests.dayN', { n: r.day })}</p>
                <p className="tnum mt-0.5 text-[12px] font-black leading-tight text-white">
                  {state === 'claimed' ? '✓' : `${formatNumber(Math.round(r.coins / 100) / 10)}k`}
                </p>
                <p className="tnum text-[9.5px] font-bold leading-tight text-[var(--gold)]">
                  {state === 'claimed' ? t('hub.done') : milestone ? t('hub.packReward') : r.gems > 0 ? `+${formatNumber(r.gems)}◆` : t('common.coins')}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11.5px] leading-snug text-[var(--dim)]">
          {t('hub.calendarNote')}
        </p>
      </div>

      {/* ── Daily Training ── */}
      <div className="mt-4 rounded-2xl border border-white/12 bg-[#0b1428]/85 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.training')}</h2>
          <button
            type="button"
            onClick={onTraining}
            className="font-display rounded-lg bg-[var(--accent)] px-3.5 py-2 text-base font-bold uppercase tracking-wider text-[#0a120c]"
          >
            {t('hub.trainNow')}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SKILL_GAMES.map((g) => {
            const stars = profile.skillStars?.[g.id] ?? 0;
            const bestScore = profile.skillBestScores?.[g.id];
            return (
              <button
                key={g.id}
                type="button"
                onClick={onTraining}
                aria-label={`${g.name} — ${stars} of 3 stars${bestScore !== undefined ? `, best ${formatNumber(bestScore)} points` : ''}. Open Training`}
                className="rounded-xl bg-black/35 px-3 py-2.5 text-left ring-1 ring-white/10"
              >
                <span className="block truncate text-[13px] font-bold">{g.name}</span>
                <span className="mt-0.5 block text-xs">
                  <span className="text-[var(--gold)]">{'★'.repeat(stars)}</span>
                  <span className="text-white/25">{'★'.repeat(3 - stars)}</span>
                  <span className="tnum ml-1.5 text-[var(--dim)]">{bestScore !== undefined ? `Best ${formatNumber(bestScore)}` : 'Not played'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Top Players ── */}
      {topPlayers.length > 0 && (
        <>
          <div className="mt-5 flex items-end justify-between gap-2">
            <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.topPlayers')}</h2>
            <button type="button" onClick={onSquad} className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{t('hub.fullSquad')}</button>
          </div>
          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-3 overflow-x-auto px-4 pb-1" aria-label="Top players in your starting eleven">
            {topPlayers.map((row) => (
              <PlayerCard
                key={row.index}
                template={row.template!}
                card={row.card}
                size="sm"
                onClick={() => row.card && onInspect(row.card.instanceId)}
              />
            ))}
            <button
              type="button"
              onClick={onPlayers}
              className="font-display flex w-[104px] shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/25 px-2 text-center text-base font-bold uppercase tracking-wider text-[var(--dim)]"
            >
              {t('hub.playerDatabase')} →
            </button>
          </div>
        </>
      )}

      {/* ── News & Tips — Cycle-2: data-driven. Last result + top scorer
          come from the profile's recorded match history, the countdowns
          from the live season / featured-pack / reset clocks. ── */}
      <div className="mt-4 rounded-2xl border border-white/12 bg-[#0b1428]/85 p-4 shadow-lg backdrop-blur">
        <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">{t('hub.newsTips')}</h2>
        <ul className="mt-3 space-y-2.5">
          {profile.lastMatchResult ? (
            <>
              <li className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
                  <strong className="text-white">{t('hub.newsLastResult')}.</strong>{' '}
                  {profile.lastMatchResult.homeLabel} {formatNumber(profile.lastMatchResult.scoreHome)}–{formatNumber(profile.lastMatchResult.scoreAway)} {profile.lastMatchResult.awayLabel}
                  {' · '}{profile.lastMatchResult.modeLabel} · {formatAgo(Date.parse(profile.lastMatchResult.atIso))}
                </p>
                <button type="button" onClick={onPlay} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('end.rematch')}</button>
              </li>
              {profile.lastMatchResult.topScorerName && (profile.lastMatchResult.topScorerGoals ?? 0) > 0 && (
                <li className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
                    <strong className="text-white">{t('hub.newsTopScorer')}.</strong>{' '}
                    {profile.lastMatchResult.topScorerName} — {formatNumber(profile.lastMatchResult.topScorerGoals ?? 0)} {t('end.goals').toLowerCase()} {currentLanguage() === 'bn' ? 'সেই ম্যাচে' : 'in that match'}.
                  </p>
                  <button type="button" onClick={onSquad} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('squad.myTeam')}</button>
                </li>
              )}
            </>
          ) : (
            <li className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">{t('hub.newsNoMatches')}</p>
              <button type="button" onClick={onQuickMatch} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('hub.quickMatch')}</button>
            </li>
          )}
          <li className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
              <strong className="text-white">{t('hub.newsNextEvent')}.</strong>{' '}
              {t('quests.resetsIn', { time: formatCountdown(msUntilDailyReset(nowMs)) })}
              {(() => {
                const feat = currentFeaturedPack(nowMs);
                return feat ? ` · ${feat.pack.name} — ${t('store.endsIn', { time: `${formatNumber(feat.daysLeft)}${currentLanguage() === 'bn' ? ' দিন' : 'd'}` })}` : '';
              })()}
              {' · '}{t('hub.newsSeason', { n: currentSeason(nowMs).id })} — {formatNumber(currentSeason(nowMs).daysLeft)}{currentLanguage() === 'bn' ? ' দিন বাকি' : ' days left'}
            </p>
            <button type="button" onClick={onEvents} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('events.events')}</button>
          </li>
          <li className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
              {t('hub.newsForm', { p: profile.matchesPlayed ?? 0, w: profile.matchesWon ?? 0, g: profile.goalsScoredTotal ?? 0 })}
              {' · '}{divisionName(profile.h2hDivision)} · {formatNumber(profile.h2hStars)}/{formatNumber(STARS_TO_PROMOTE)}★
            </p>
            <button type="button" onClick={onClubs} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('clubs.clubs')}</button>
          </li>
          <li className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
              <strong className="text-white">{t('nations.cupTitle')}.</strong>{' '}
              {profile.worldCup && profile.worldCup.stage !== 'OUT' && profile.worldCup.stage !== 'WON'
                ? profile.worldCup.stage === 'GROUP' ? t('nations.groupMatch', { n: profile.worldCup.groupPlayed + 1 }) : profile.worldCup.stage
                : t('nations.glory')}
            </p>
            <button type="button" onClick={onNations} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('clubs.nationalTeams')}</button>
          </li>
          {captain?.card && captain.template && (
            <li className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">
                <strong className="text-white">{t('hub.yourCaptain')}.</strong>{' '}
                {currentLanguage() === 'bn'
                  ? `${captain.template.name}-এর প্রশিক্ষণ ও র‍্যাংক-আপ তিনি যেসব 3D ম্যাচ খেলেন সবগুলোতে লাইভ কাজ করে।`
                  : `Training and rank-ups on ${captain.template.name} apply live in every 3D match he plays.`}
              </p>
              <button type="button" onClick={() => onInspect(captain.card!.instanceId)} className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">{t('player.train')}</button>
            </li>
          )}
        </ul>
      </div>

      {/* ── Starting XI (compact, expandable) ── */}
      <details className="mt-4 rounded-2xl border border-white/12 bg-[#0b1428]/85 shadow-lg backdrop-blur">
        <summary className="font-display cursor-pointer px-4 py-3 text-[19px] font-bold uppercase tracking-wide">
          {t('hub.startingXi')} · {t('hub.teamOvr')} {formatNumber(teamOvr)}
        </summary>
        <div className="px-4 pb-4">
          <ol className="grid gap-1 sm:grid-cols-2">
            {xi.map((row) => (
              <li key={row.index}>
                <button
                  type="button"
                  disabled={!row.card}
                  onClick={() => row.card && onInspect(row.card.instanceId)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-black/35 px-3 py-1.5 text-left disabled:opacity-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-9 shrink-0 font-display text-sm font-bold uppercase text-[var(--accent)]">{row.role}</span>
                    <span className="truncate text-sm font-semibold">{row.template?.name ?? t('hub.emptySlot')}</span>
                  </span>
                  <span className="tnum shrink-0 font-display text-lg font-bold text-[var(--gold)]">{row.slotOvr ?? '—'}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onSquad} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c]">{t('hub.openSquadBuilder')}</button>
            <button type="button" onClick={onPlayers} className="rounded-lg border border-white/25 px-3 py-2 text-sm font-bold">{t('hub.playerDatabase')}</button>
          </div>
        </div>
      </details>
    </section>
  );
}
