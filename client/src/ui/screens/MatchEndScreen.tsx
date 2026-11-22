// Striker FC — ui/screens/MatchEndScreen.tsx (Phase 08, Blueprint 08 §3)
// The post-match reward screen every Phase 08 mode returns to: final score,
// the full stats sheet, division progress (Head-to-Head), fans (VS Attack),
// skill stars, the tournament trophy celebration, quest progress and the
// exact Coins / Gems / XP the session just banked into the SaveProfile.

import type { QuestProgressRow } from '../../modes/ModeRewards';
import type { MatchRatings } from '../../meta/PlayerRatings';
import { DIVISIONS, STARS_TO_PROMOTE } from '../../modes/HeadToHeadMode';
import { currentLanguage, formatNumber, t } from '../../i18n/i18n';
import championsHeroUrl from '../../assets/art/champions-hero.jpg';
import trophyLeagueUrl from '../../assets/art/trophy-league.jpg';

/** Cycle-2: stats-sheet labels arrive as English data strings; map the
    known ones through the i18n table and localize digits in বাংলা mode. */
const STAT_LABEL_KEYS: Record<string, string> = {
  Possession: 'hud.possession', Shots: 'hud.shots', 'On target': 'hud.shotsOnTarget',
  'Expected goals (xG)': 'hud.xg', Passes: 'hud.passes', 'Pass accuracy': 'hud.passAccuracy',
  'Tackles won': 'hud.tacklesWon', Saves: 'end.saves', Corners: 'hud.corners', Fouls: 'hud.fouls',
  'Yellow cards': 'hud.yellowCards', 'Red cards': 'hud.redCards', Offsides: 'hud.offsides',
  'Chances played': 'end.chancesPlayed', 'Great chance goals': 'end.greatGoals',
  'Good chance goals': 'end.goodGoals', 'Basic chance goals': 'end.basicGoals',
  'Your score': 'end.yourScore', Points: 'end.pointsCap', Goals: 'end.goals', Conversion: 'end.conversion',
  'Waves stopped': 'end.wavesStopped', 'Balls won': 'end.ballsWon', 'Keeper saves': 'end.keeperSaves',
  'Goals conceded': 'end.goalsConceded',
};
function statLabel(label: string): string {
  const star = /^([123])★ target$/.exec(label);
  if (star) return t('end.starTarget', { n: star[1] ?? '' });
  const key = STAT_LABEL_KEYS[label];
  return key ? t(key) : label;
}
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function loc(value: string | number): string {
  const str = String(value);
  return currentLanguage() === 'bn' ? str.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d) : str;
}

export interface MatchEndData {
  modeLabel: string;
  title: string;
  message: string;
  homeLabel: string;
  awayLabel: string;
  scoreHome: number;
  scoreAway: number;
  statsRows: { label: string; home: string; away: string }[];
  /** Addendum 4: player ratings + Man of the Match (full matches only). */
  ratings?: MatchRatings;
  coins: number;
  gems: number;
  xp: number;
  trainingXp: number;
  fansDelta?: number;
  fansTotal?: number;
  division?: {
    divisionBefore: number;
    divisionAfter: number;
    starsBefore: number;
    starsAfter: number;
    promoted: boolean;
    relegated: boolean;
  };
  skill?: {
    gameName: string;
    score: number;
    stars: number;
    bestStars: number;
    thresholds: [number, number, number];
  };
  tournament?: {
    roundLabel: string;
    champion: boolean;
    packCardName?: string;
    packCardOvr?: number;
  };
  quests: QuestProgressRow[];
}

function Stars({ filled, total, size = 18 }: { filled: number; total: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={t('training.stars', { n: filled })}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
            fill={i < filled ? 'var(--gold)' : 'none'}
            stroke={i < filled ? 'var(--gold)' : 'rgba(255,255,255,0.35)'}
            strokeWidth={1.4}
          />
        </svg>
      ))}
    </span>
  );
}

function TrophyCelebration() {
  const pieces = Array.from({ length: 26 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 7) * 0.35}s`,
    color: ['#f5c542', '#a3e635', '#38bdf8', '#f472b6', '#f8fafc'][i % 5],
    round: i % 3 === 0,
  }));
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--gold)]/60 bg-[#241a05] px-4 py-5 text-center" aria-label={t('end.champions')}>
      {/* Trophy & menu art: champions photo behind the celebration; the
          gold gradient + SVG trophy below stay as the fallback if the
          photo fails to load (onError hides the <img>). */}
      <img src={championsHeroUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,12,2,0.55) 0%, rgba(20,12,2,0.25) 45%, rgba(20,12,2,0.82) 100%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: p.left, background: p.color, animationDelay: p.delay,
              borderRadius: p.round ? '50%' : '2px',
            }}
          />
        ))}
      </div>
      <span className="trophy-pulse relative mx-auto block h-[112px] w-[112px]">
        <svg className="absolute inset-0 m-auto" width="72" height="72" viewBox="0 0 24 24" role="img" aria-label={t('end.champions')}>
          <path d="M6 3h12v2h3v3a5 5 0 0 1-5 5h-.42A6 6 0 0 1 13 15.92V18h3v3H8v-3h3v-2.08A6 6 0 0 1 8.42 13H8a5 5 0 0 1-5-5V5h3V3zm-1 4v1a3 3 0 0 0 3 3V7H5zm14 0h-3v4a3 3 0 0 0 3-3V7z" fill="#f5c542" stroke="#b45309" strokeWidth="0.6" />
        </svg>
        <img src={trophyLeagueUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full rounded-xl object-cover shadow-2xl ring-1 ring-[var(--gold)]/70" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </span>
      <p className="font-display relative mt-2 text-3xl font-bold uppercase tracking-widest text-[var(--gold)]">{t('end.champions')}</p>
      <p className="relative mt-1 text-sm text-amber-100/85">{t('end.championsSub')}</p>
    </div>
  );
}

export function MatchEndScreen({
  data, onPlayAgain, onBackToModes, onHub,
}: {
  data: MatchEndData;
  onPlayAgain?: () => void;
  onBackToModes: () => void;
  onHub: () => void;
}) {
  const rewards = [
    { label: t('common.coins'), value: `+${formatNumber(data.coins)}`, color: 'var(--gold)', show: data.coins > 0 },
    { label: t('common.gems'), value: `+${formatNumber(data.gems)}`, color: '#7dd3fc', show: data.gems > 0 },
    { label: t('end.seasonXp'), value: `+${formatNumber(data.xp)}`, color: 'var(--accent)', show: data.xp > 0 },
    { label: t('end.trainingXp'), value: `+${formatNumber(data.trainingXp)}`, color: '#f0abfc', show: data.trainingXp > 0 },
    {
      label: t('end.vsaFans'), show: data.fansDelta !== undefined,
      value: `${(data.fansDelta ?? 0) >= 0 ? '+' : ''}${formatNumber(data.fansDelta ?? 0)}`,
      color: (data.fansDelta ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)',
    },
  ].filter((r) => r.show);

  return (
    <section aria-label={t('end.matchEnd')} className="mt-5 space-y-4">
      {data.tournament?.champion && <TrophyCelebration />}

      <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-5 text-center backdrop-blur">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--dim)]">{data.modeLabel}</p>
        <h2 className="font-display mt-1 text-4xl font-bold uppercase tracking-wide sm:text-5xl">{data.title}</h2>
        <p className="tnum mt-3 font-display text-5xl font-bold">
          <span className="text-[var(--accent)]">{loc(data.scoreHome)}</span>
          <span className="mx-2 text-[var(--dim)]">–</span>
          <span className="text-sky-300">{loc(data.scoreAway)}</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-[var(--dim)]">{data.homeLabel} {t('common.vs')} {data.awayLabel}</p>
        <p className="mx-auto mt-2 max-w-prose text-sm text-[var(--text)]">{data.message}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Stats sheet */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/70 backdrop-blur">
          <p className="border-b border-white/10 px-4 py-2.5 font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">{t('end.matchStats')}</p>
          <table className="w-full text-sm" aria-label={t('end.matchStats')}>
            <tbody className="tnum">
              {data.statsRows.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="px-4 py-1.5 font-semibold">{loc(row.home)}</td>
                  <td className="px-2 py-1.5 text-center text-xs text-[var(--dim)]">{statLabel(row.label)}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{loc(row.away)}</td>
                </tr>
              ))}
              {data.statsRows.length === 0 && (
                <tr><td className="px-4 py-3 text-sm text-[var(--dim)]">{t('end.noStats')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {/* Addendum 4: Man of the Match + your XI's ratings */}
          {data.ratings && data.ratings.motm && (
            <div className="rounded-2xl border border-[var(--gold)]/40 bg-[#0f172a]/70 p-4 backdrop-blur">
              <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--gold)]">
                ★ {t('end.manOfMatch')} · {data.ratings.motm.name} · {loc(data.ratings.motm.rating.toFixed(1))}
              </p>
              <p className="mt-0.5 text-xs text-[var(--dim)]">
                {data.ratings.motm.side === 'HOME' ? data.homeLabel : data.awayLabel}
                {data.ratings.motm.goals > 0 ? ` · ${formatNumber(data.ratings.motm.goals)} ${t('end.goals').toLowerCase()}` : ''}
              </p>
              <ul className="mt-2.5 space-y-1" aria-label={t('end.playerRatings')}>
                {data.ratings.home.map((p) => (
                  <li key={p.templateId} className="flex items-center gap-2 text-sm">
                    <span className="w-9 shrink-0 rounded bg-white/10 px-1 py-0.5 text-center text-[10px] font-black text-white/85">{p.position}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}{p.goals > 0 ? ` ⚽×${formatNumber(p.goals)}` : ''}</span>
                    <span
                      className="tnum rounded px-1.5 py-0.5 font-display text-base font-bold"
                      style={{
                        background: p.rating >= 7.5 ? 'rgba(163,230,53,0.2)' : p.rating >= 6 ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.18)',
                        color: p.rating >= 7.5 ? 'var(--accent)' : p.rating >= 6 ? 'var(--text)' : '#fca5a5',
                      }}
                    >
                      {loc(p.rating.toFixed(1))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Rewards */}
          <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur">
            <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">{t('end.rewardsEarned')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rewards.map((r) => (
                <div key={r.label} className="flex items-baseline gap-2 rounded-lg bg-black/40 px-3 py-2">
                  <span className="tnum font-display text-2xl font-bold" style={{ color: r.color }}>{r.value}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{r.label}</span>
                </div>
              ))}
              {rewards.length === 0 && <p className="text-sm text-[var(--dim)]">{t('end.noRewards')}</p>}
            </div>
            {data.fansTotal !== undefined && (
              <p className="tnum mt-2 text-xs text-[var(--dim)]">{t('end.fanBase', { n: data.fansTotal })}</p>
            )}
            {data.tournament?.packCardName && (
              <p className="mt-2 rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 px-3 py-2 text-sm font-semibold text-fuchsia-200">
                {t('end.masterPackNote', { name: data.tournament.packCardName, ovr: data.tournament.packCardOvr ?? 0 })}
              </p>
            )}
          </div>

          {/* Division progress (H2H) */}
          {data.division && (
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('hub.rivals')}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">{t('hub.rivals')}</p>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--dim)]">
                  {DIVISIONS[data.division.divisionBefore - 1]?.name} → {DIVISIONS[data.division.divisionAfter - 1]?.name}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Stars filled={data.division.starsAfter} total={STARS_TO_PROMOTE} size={22} />
                <span className="tnum text-sm font-semibold">{t('end.starsOf', { a: data.division.starsAfter, b: STARS_TO_PROMOTE })}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-[var(--gold)] transition-all" style={{ width: `${(data.division.starsAfter / STARS_TO_PROMOTE) * 100}%` }} />
              </div>
              <p className="mt-2 text-sm font-semibold">
                {data.division.promoted ? t('end.promotedFull', { division: DIVISIONS[data.division.divisionAfter - 1]?.name ?? '' })
                  : data.division.relegated ? t('end.relegatedFull', { division: DIVISIONS[data.division.divisionAfter - 1]?.name ?? '' })
                    : STARS_TO_PROMOTE - data.division.starsAfter === 1 ? t('end.oneMoreStar')
                      : t('end.moreStars', { n: STARS_TO_PROMOTE - data.division.starsAfter })}
              </p>
            </div>
          )}

          {/* Skill games result */}
          {data.skill && (
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('training.training')}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">{data.skill.gameName}</p>
                <Stars filled={data.skill.stars} total={3} size={22} />
              </div>
              <p className="tnum mt-1 font-display text-3xl font-bold">{formatNumber(data.skill.score)} <span className="text-base text-[var(--dim)]">{t('end.points')}</span></p>
              <p className="mt-1 text-xs text-[var(--dim)]">
                {t('end.starTargets')}: {data.skill.thresholds.map((n) => formatNumber(n)).join(' · ')} · {t('end.bestInGame', { n: data.skill.bestStars })}
              </p>
            </div>
          )}

          {/* Quest progress */}
          {data.quests.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('end.questProgress')}>
              <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">{t('end.questProgress')}</p>
              <ul className="mt-2 space-y-2">
                {data.quests.map((q) => (
                  <li key={q.questId}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{q.title}{q.completedNow ? ` · ${t('end.complete')}` : ''}</span>
                      <span className="tnum text-xs text-[var(--dim)]">{formatNumber(q.after)}/{formatNumber(q.target)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(q.after / q.target) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pb-2">
        {onPlayAgain && (
          <button type="button" onClick={onPlayAgain} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[#0a120c]">
            {t('end.playAgain')}
          </button>
        )}
        <button type="button" onClick={onBackToModes} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold">
          {t('end.backToModes')}
        </button>
        <button type="button" onClick={onHub} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold">
          {t('end.backToLobby')}
        </button>
      </div>
    </section>
  );
}
