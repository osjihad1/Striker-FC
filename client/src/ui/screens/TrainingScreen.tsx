// Striker FC — ui/screens/TrainingScreen.tsx
// Training ground: the four Phase 08 skill drills on the real 3D engine,
// presented as a training menu — saved stars and best scores from the
// profile, star thresholds, and the exact reward each drill pays at three
// stars (skillRewards is the same function the mode settles with). Earned
// Training XP lands in the shared pool and is spent in My Team → Player
// Detail → Train.

import type { SaveProfile } from '../../core/types';
import { SKILL_GAMES, skillRewards, type SkillGameId } from '../../modes/SkillGamesMode';
import { formatNumber, t } from '../../i18n/i18n';

export function TrainingScreen({
  profile, onLaunchSkill, onOpenSquad,
}: {
  profile: SaveProfile;
  onLaunchSkill: (id: SkillGameId) => void;
  onOpenSquad: () => void;
}) {
  const stars = profile.skillStars ?? {};
  const best = profile.skillBestScores ?? {};
  const totalStars = SKILL_GAMES.reduce((sum, g) => sum + (stars[g.id] ?? 0), 0);

  return (
    <section aria-label={t('training.training')} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{t('training.training')}</h2>
          <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
            {t('training.intro')}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center">
            <p className="tnum font-display text-xl font-bold leading-none text-[var(--gold)]">{formatNumber(totalStars)}/{formatNumber(12)}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('training.drills')}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center">
            <p className="tnum font-display text-xl font-bold leading-none text-[var(--accent)]">{formatNumber(profile.trainingXpPool)}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('training.xpLabel')}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SKILL_GAMES.map((game) => {
          const earned = stars[game.id] ?? 0;
          const bestScore = best[game.id];
          const top = skillRewards(game, game.starThresholds[2]).grant;
          return (
            <article key={game.id} className="flex flex-col rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{game.name}</h3>
                <span className="shrink-0 text-lg tracking-wider" aria-label={t('training.stars', { n: earned })}>
                  <span className="text-[var(--gold)]">{'★'.repeat(earned)}</span>
                  <span className="text-white/25">{'★'.repeat(3 - earned)}</span>
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-[var(--dim)]">{game.blurb}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-black/40 px-2 py-1.5">
                  <dt className="text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('training.starTargets')}</dt>
                  <dd className="tnum mt-0.5 text-xs font-bold">{game.starThresholds.map((n) => formatNumber(n)).join(' · ')}</dd>
                </div>
                <div className="rounded-lg bg-black/40 px-2 py-1.5">
                  <dt className="text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('training.best')}</dt>
                  <dd className="tnum mt-0.5 text-xs font-bold">{bestScore !== undefined ? formatNumber(bestScore) : '—'}</dd>
                </div>
                <div className="rounded-lg bg-black/40 px-2 py-1.5">
                  <dt className="text-[9px] font-bold uppercase tracking-widest text-[var(--dim)]">3★ reward</dt>
                  <dd className="tnum mt-0.5 text-xs font-bold text-[var(--gold)]">{formatNumber(top.coins)}c · {formatNumber(top.xp)} XP</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => onLaunchSkill(game.id)}
                className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wide text-[#0a120c]"
              >
                {t('training.startDrill')} · {t('training.seconds', { n: game.durationSec })}
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--dim)]">
          {t('training.xpNote')}
        </p>
        <button
          type="button"
          onClick={onOpenSquad}
          className="rounded-lg border border-[var(--border)] px-4 py-2 font-display text-base font-bold uppercase tracking-wide"
        >
          {t('training.openTeam')}
        </button>
      </div>
    </section>
  );
}
