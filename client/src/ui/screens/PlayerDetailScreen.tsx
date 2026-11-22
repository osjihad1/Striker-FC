// Striker FC — ui/screens/PlayerDetailScreen.tsx
// Phase 07 full player inspection (Blueprint 08 §2): holographic card, 6-axis
// stat radar, every sub-stat with upgrade deltas in green, PlayStyles, Weak
// Foot / Skill Move stars — and the working Train, Rank Up and Skill Points
// tabs. Every action runs through ProgressionService and is committed to
// SaveSystem immediately by the parent (onCommit), so it survives a refresh
// and is baked into the templates the 3D MatchEngine simulates.

import { useMemo, useState } from 'react';
import { matchEventBus } from '../../core/EventBus';
import type { SaveProfile, SubStats } from '../../core/types';
import { getCardEffectiveOvr, maxTrainingLevelForRank, xpNeeded } from '../../core/types';
import { getPlayerById } from '../../data/PlayerDatabase';
import { ALL_CLUBS, clubKit } from '../../data/Clubs';
import { getPlayStyle } from '../../data/PlayStyles';
import { ModalShell } from '../components/ModalShell';
import { PlayerCard, RANK_GEMS } from '../components/PlayerCard';
import { PlayerShowcase } from '../../rendering/PlayerShowcase';
import {
SKILL_BRANCHES, SKILL_BOOST_TRACKS, SKILL_BOOST_MAX_LEVEL, SHARDS_PER_TOKEN, SHARD_VALUES,
allocateSkillPoint, canRankUp, convertDuplicateToShards, craftRankUpToken, duplicateCards, findCard,
fodderCandidates, fodderXpValue, getUpgradedStats, rankUpCard, respecSkillPoints, skillBoostCost,
skillPointsAvailable, toggleCardLock, trainWithFodder, trainWithPoolXp, upgradeSkillBoost,
type SkillBranch,
} from '../../meta/ProgressionService';
import { formatNumber, t } from '../../i18n/i18n';

type DetailTab = 'STATS' | 'TRAIN' | 'RANK' | 'SKILLS';

const SUBSTAT_GROUPS: { titleKey: string; rows: [string, keyof SubStats][] }[] = [
  { titleKey: 'player.pace', rows: [['Acceleration', 'acceleration'], ['Sprint Speed', 'sprintSpeed']] },
  { titleKey: 'player.shooting', rows: [['Positioning', 'positioning'], ['Finishing', 'finishing'], ['Shot Power', 'shotPower'], ['Long Shots', 'longShots'], ['Curve', 'curve']] },
  { titleKey: 'player.passing', rows: [['Vision', 'vision'], ['Crossing', 'crossing'], ['Short Passing', 'shortPassing'], ['Long Passing', 'longPassing']] },
  { titleKey: 'player.dribbling', rows: [['Agility', 'agility'], ['Balance', 'balance'], ['Ball Control', 'ballControl'], ['Dribbling', 'dribbling']] },
  { titleKey: 'player.defending', rows: [['Interceptions', 'interceptions'], ['Heading Accuracy', 'headingAccuracy'], ['Standing Tackle', 'standingTackle'], ['Sliding Tackle', 'slidingTackle']] },
  { titleKey: 'player.physical', rows: [['Jumping', 'jumping'], ['Stamina', 'stamina'], ['Strength', 'strength']] },
  { titleKey: 'player.goalkeeping', rows: [['GK Diving', 'gkDiving'], ['GK Handling', 'gkHandling'], ['GK Kicking', 'gkKicking'], ['GK Reflexes', 'gkReflexes'], ['GK Positioning', 'gkPositioning']] },
];

function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span aria-label={t('player.starsOf', { label, n })} className="text-[var(--gold)]">
      {'★'.repeat(n)}<span className="text-[var(--dim)]">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

function Radar({ values, base }: { values: number[]; base: number[] }) {
  const labels = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const cx = 110;
  const cy = 104;
  const R = 74;
  const point = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    const r = (Math.max(0, Math.min(99, v)) / 99) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (vals: number[]): string => vals.map((v, i) => point(i, v).join(',')).join(' ');
  return (
    <svg viewBox="0 0 220 208" className="mx-auto w-full max-w-[300px]" role="img" aria-label="Six-axis stat radar: pace, shooting, passing, dribbling, defending, physical">
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={poly(labels.map(() => 99 * f))} fill="none" stroke="var(--border)" strokeWidth={1} />
      ))}
      {labels.map((_, i) => {
        const [x, y] = point(i, 99);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
      })}
      <polygon points={poly(base)} fill="rgba(148,163,184,0.18)" stroke="#94a3b8" strokeWidth={1.2} />
      <polygon points={poly(values)} fill="rgba(163,230,53,0.25)" stroke="var(--accent)" strokeWidth={1.8} />
      {labels.map((label, i) => {
        const [x, y] = point(i, 118);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="var(--text)">
            {label} {values[i]}
          </text>
        );
      })}
    </svg>
  );
}

export function PlayerDetailScreen({
  profile, instanceId, onClose, onCommit,
}: {
  profile: SaveProfile;
  instanceId: string;
  onClose: () => void;
  onCommit: (next: SaveProfile, note: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('STATS');
  const [faceView, setFaceView] = useState(false);
  const [awayKit, setAwayKit] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedFodder, setArmedFodder] = useState<string | null>(null);

  const card = findCard(profile, instanceId);
  const template = card ? getPlayerById(card.templateId) : undefined;
  const upgraded = useMemo(
    () => (template && card ? getUpgradedStats(template, card) : null),
    [template, card],
  );

  if (!card || !template || !upgraded) {
    return (
      <ModalShell open title={t('player.club')} onClose={onClose}>
        <p className="text-sm text-[var(--dim)]">{t('player.gone')}</p>
        <button type="button" onClick={onClose} className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c]">{t('player.close')}</button>
      </ModalShell>
    );
  }

  const club = ALL_CLUBS.find((c) => c.id === template.clubId);
  const effOvr = getCardEffectiveOvr(template, card);
  const cap = maxTrainingLevelForRank(card.rank);
  const atCap = card.trainingLevel >= cap;
  const nextLevelXp = atCap ? 0 : xpNeeded(card.trainingLevel);
  const xpPct = atCap ? 100 : Math.min(100, (card.trainingXp / nextLevelXp) * 100);
  const rankInfo = canRankUp(profile, card);
  const dups = duplicateCards(profile, card);
  const fodder = fodderCandidates(profile, card.instanceId);
  const points = skillPointsAvailable(card);
  const gem = RANK_GEMS[card.rank] ?? RANK_GEMS[0]!;

  const coreRows: [string, number, number][] = [
    ['PAC', upgraded.core.pac, template.stats.pac],
    ['SHO', upgraded.core.sho, template.stats.sho],
    ['PAS', upgraded.core.pas, template.stats.pas],
    ['DRI', upgraded.core.dri, template.stats.dri],
    ['DEF', upgraded.core.def, template.stats.def],
    ['PHY', upgraded.core.phy, template.stats.phy],
  ];

  const act = (result: { profile: SaveProfile; error: string | null }, successNote: string) => {
    if (result.error) {
      setError(result.error);
      setNote(null);
      return;
    }
    setError(null);
    onCommit(result.profile, successNote);
    setNote(successNote);
  };

  return (
    <ModalShell
      open
      wide
      title={template.name}
      subtitle={`${club?.name ?? template.clubId} · ${template.position}${template.altPositions.length ? ` / ${template.altPositions.join(' / ')}` : ''} · ${template.nationality} · ${formatNumber(template.appearance.heightCm)} cm`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <PlayerCard template={template} card={card} size="lg" />
          {/* The smooth 3D model, live: the same rig the match engine
              renders, rotating on a podium in his real club kit. */}
          <div className="w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/12 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(245,197,66,0.16)_0%,transparent_60%),linear-gradient(170deg,#0a1a33,#04140b)]">
            <PlayerShowcase
              template={template}
              framing={faceView ? 'FACE' : 'FULL'}
              lowFallback="FULL"
              kit={club ? clubKit(club, awayKit) : {
                primary: '#14532d',
                secondary: '#ffffff',
                shorts: '#0f172a',
                socks: '#14532d',
              }}
              shirtNumber={(profile.startingXI.indexOf(instanceId) >= 0 ? profile.startingXI.indexOf(instanceId) : profile.substitutes.indexOf(instanceId)) + 1 || 9}
              height={228}
            />
            <p className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">
              {t('player.liveModel', { h: template.appearance.heightCm, build: template.appearance.build.toLowerCase() })}
            </p>
            <button
              type="button"
              onClick={() => setFaceView((v) => !v)}
              aria-pressed={faceView}
              className="mb-2 w-full rounded-lg border border-[var(--gold)]/50 bg-black/40 px-3 py-2 text-[12px] font-bold uppercase tracking-widest text-[var(--gold)]"
            >
              {faceView ? t('player.fullBody') : t('player.faceCloseup')}
            </button>
            <button
              type="button"
              onClick={() => setAwayKit((v) => !v)}
              aria-pressed={awayKit}
              className="mb-2 w-full rounded-lg border border-[var(--border)] bg-black/40 px-3 py-2 text-[12px] font-bold uppercase tracking-widest text-white"
            >
              {awayKit ? t('player.kitHome') : t('player.kitAway')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => act(toggleCardLock(profile, card.instanceId), card.locked ? t('player.unlockedNote', { name: template.shortName }) : t('player.lockedNote', { name: template.shortName }))}
            aria-pressed={card.locked}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
          >
            {card.locked ? t('player.lockedTap') : t('player.unlockedTap')}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum font-display text-5xl font-bold text-[var(--gold)]">{formatNumber(effOvr)}</span>
            <span className="text-sm font-semibold text-[var(--dim)]">{t('player.effectiveOvr', { n: template.baseOvr })}</span>
            {card.rank > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-xs font-bold">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: gem.color }} />
                {t('player.rank', { n: card.rank })} · {gem.name}
              </span>
            )}
            <span className="rounded-full bg-black/40 px-2 py-1 text-xs font-bold">{t('player.trainingLv', { a: card.trainingLevel, b: cap })}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{t('player.weakFoot')} <Stars n={template.weakFoot} label={t('player.weakFoot')} /></span>
            <span>{t('player.skillMoves')} <Stars n={template.skillMoves} label={t('player.skillMoves')} /></span>
            <span className="text-[var(--dim)]">{template.preferredFoot === 'RIGHT' ? t('player.right') : t('player.left')} · {t('player.work')} {template.workRateAttack}/{template.workRateDefense}</span>
          </div>
          {template.playStyles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {template.playStyles.map((ps) => (
                <span key={ps} className="rounded-full border border-[var(--accent-dim)] bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]" title={getPlayStyle(ps)?.description}>
                  {getPlayStyle(ps)?.name ?? ps}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-[11px] font-semibold text-[var(--dim)]">
              <span>{t('player.xpLine', { a: card.trainingLevel, b: atCap ? t('player.maxForRank') : t('player.level', { n: card.trainingLevel + 1 }) })}</span>
              <span className="tnum">{atCap ? `${formatNumber(cap)}/${formatNumber(cap)}` : `${formatNumber(card.trainingXp)} / ${formatNumber(nextLevelXp)} XP`}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/50">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
          {(note || error) && (
            <p aria-live="polite" className={`mt-3 rounded-lg border px-3 py-2 text-sm font-medium ${error ? 'border-[var(--danger)] text-red-300' : 'border-[var(--accent-dim)] text-[var(--accent)]'}`}>
              {error ?? note}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-[var(--border)]" role="tablist" aria-label={t('player.sections')}>
        {(
          [
            ['STATS', t('player.stats')],
            ['TRAIN', t('player.train')],
            ['RANK', `${t('player.rankUp')}${card.rank < 5 ? '' : t('player.maxSuffix')}`],
            ['SKILLS', `${t('player.skillPoints')}${points > 0 ? ` · ${formatNumber(points)}` : ''}`],
          ] as [DetailTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="font-display px-3 py-2 text-base font-semibold uppercase tracking-wider"
            style={{
              color: tab === id ? 'var(--accent)' : 'var(--dim)',
              borderBottom: tab === id ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'STATS' && (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <Radar values={coreRows.map((r) => r[1])} base={coreRows.map((r) => r[2])} />
            <div className="mt-2 space-y-1.5">
              {coreRows.map(([label, value, baseVal]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-9 text-[11px] font-bold text-[var(--dim)]">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, value)}%` }} />
                  </div>
                  <span className="tnum w-14 text-right text-[13px] font-semibold">
                    {formatNumber(value)}{value > baseVal && <span className="text-[var(--accent)]"> +{formatNumber(value - baseVal)}</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--dim)]">{t('player.radarNote')}</p>
          </div>
          <div className="space-y-3">
            {SUBSTAT_GROUPS.map((group) => (
              <div key={group.titleKey}>
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">{t(group.titleKey)}</h4>
                <div className="mt-1 grid grid-cols-2 gap-x-4">
                  {group.rows.map(([label, key]) => {
                    const value = upgraded.subStats[key];
                    const baseVal = template.subStats[key];
                    return (
                      <div key={key} className="flex items-center justify-between border-b border-[var(--border)]/50 py-1">
                        <span className="text-xs text-[var(--dim)]">{label}</span>
                        <span className="tnum text-xs font-semibold">
                          {formatNumber(value)}{value > baseVal && <span className="text-[var(--accent)]"> +{formatNumber(value - baseVal)}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'TRAIN' && (
        <div className="mt-4">
          <p className="text-sm text-[var(--dim)]">
            {t('player.trainIntro', { r: card.rank, cap, next: cap + 5 <= 30 ? cap + 5 : 30 })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div>
              <p className="tnum font-display text-2xl font-bold text-[var(--gold)]">{formatNumber(profile.trainingXpPool)} XP</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--dim)]">{t('player.xpPool')}</p>
            </div>
            <button
              type="button"
              disabled={profile.trainingXpPool <= 0 || atCap}
              onClick={() => {
                const r = trainWithPoolXp(profile, card.instanceId);
                if (r.error || !r.result) {
                  setError(r.error ?? 'Training failed.');
                  setNote(null);
                  return;
                }
                setError(null);
                const msg = r.result.levelsGained > 0
                  ? t('player.trainedTo', { name: template.shortName, lv: r.result.card.trainingLevel, xp: formatNumber(r.result.xpConsumed) })
                  : t('player.xpBanked', { xp: formatNumber(r.result.xpConsumed), lv: card.trainingLevel + 1 });
                onCommit(r.profile, msg);
                setNote(msg);
                // Phase 09: quest auto-tracking listens for training levels.
                if (r.result.levelsGained > 0) {
                  matchEventBus.emit('PLAYER_TRAINED', { instanceId: card.instanceId, levelsGained: r.result.levelsGained });
                }
              }}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('player.trainWithPool')}
            </button>
            {atCap && <span className="text-sm font-semibold text-[var(--gold)]">{t('player.rankCapNote')}</span>}
          </div>

          <h4 className="font-display mt-5 text-lg font-semibold uppercase tracking-wider">{t('player.convertTitle')}</h4>
          <p className="text-xs text-[var(--dim)]">
            {t('player.fodderNote')}
          </p>
          {fodder.length === 0 ? (
            <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--dim)]">
              {t('player.noFodder')}
            </p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {fodder.map((f) => {
                const fTemplate = getPlayerById(f.templateId);
                if (!fTemplate) return null;
                const xp = fodderXpValue(fTemplate, f);
                const armed = armedFodder === f.instanceId;
                return (
                  <li key={f.instanceId} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{fTemplate.name}</p>
                      <p className="tnum text-xs text-[var(--dim)]">{t('player.worth', { pos: fTemplate.position, ovr: fTemplate.baseOvr, xp })}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!armed) {
                          setArmedFodder(f.instanceId);
                          return;
                        }
                        setArmedFodder(null);
                        const r = trainWithFodder(profile, card.instanceId, f.instanceId);
                        if (r.error || !r.result) {
                          setError(r.error ?? 'Training failed.');
                          setNote(null);
                          return;
                        }
                        setError(null);
                        const msg = t('player.converted', { from: fTemplate.shortName, xp: formatNumber(r.xpValue), to: template.shortName, lv: r.result.card.trainingLevel });
                        onCommit(r.profile, msg);
                        setNote(msg);
                        if (r.result.levelsGained > 0) {
                          matchEventBus.emit('PLAYER_TRAINED', { instanceId: card.instanceId, levelsGained: r.result.levelsGained });
                        }
                      }}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${armed ? 'bg-[var(--danger)] text-white' : 'border border-[var(--gold)] text-[var(--gold)]'}`}
                    >
                      {armed ? t('player.confirmFodder') : t('player.useFodder')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'RANK' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            {RANK_GEMS.map((g, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{
                  background: i === card.rank ? 'var(--accent-dim)' : 'rgba(0,0,0,0.35)',
                  color: i === card.rank ? 'var(--accent)' : 'var(--dim)',
                  border: `1px solid ${i === card.rank ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: i === 0 ? '#475569' : g.color }} />
                {i === 0 ? t('player.base') : `R${formatNumber(i)} ${g.name}`}
              </span>
            ))}
          </div>
          {card.rank >= 5 ? (
            <p className="mt-3 text-sm font-semibold text-[var(--gold)]">{t('player.maxRank')}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-[var(--dim)]">
                {t('player.rankIntro', { cap: maxTrainingLevelForRank(card.rank + 1) })}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="font-display text-lg font-semibold uppercase tracking-wide">{t('player.duplicateCard')}</p>
                  <p className="tnum mt-1 text-sm text-[var(--dim)]">
                    {dups.length > 1 ? t('player.dupsAvailable', { n: dups.length }) : dups.length === 1 ? t('player.dupAvailable') : t('player.noDup')}
                  </p>
                  <button
                    type="button"
                    disabled={!rankInfo.duplicate}
                    onClick={() => act(rankUpCard(profile, card.instanceId, 'DUPLICATE'), t('player.rankedDup', { name: template.shortName, r: card.rank + 1, cap: maxTrainingLevelForRank(card.rank + 1) }))}
                    className="mt-2 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('player.rankWithDup')}
                  </button>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="font-display text-lg font-semibold uppercase tracking-wide">{t('player.rankToken')}</p>
                  <p className="tnum mt-1 text-sm text-[var(--dim)]">{profile.rankUpTokens === 1 ? t('player.tokenHeld') : t('player.tokensHeld', { n: profile.rankUpTokens })}</p>
                  <button
                    type="button"
                    disabled={!rankInfo.token}
                    onClick={() => act(rankUpCard(profile, card.instanceId, 'TOKEN'), t('player.rankedToken', { name: template.shortName, r: card.rank + 1, cap: maxTrainingLevelForRank(card.rank + 1) }))}
                    className="mt-2 w-full rounded-lg border border-[var(--gold)] px-3 py-2 text-sm font-bold text-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('player.rankWithToken')}
                  </button>
                </div>
              </div>
            </>
          )}
          {/* Epic fix round (P0-4): Rank-Up Shards — duplicates are worth
              shards, and 500 shards craft a Universal Rank-Up Token. */}
          <div className="mt-3 rounded-xl border border-[var(--gold)]/50 bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg font-semibold uppercase tracking-wide">{t('player.shardsTitle')}</p>
              <span className="tnum rounded-full bg-black/40 px-2.5 py-1 text-[13px] font-bold text-[var(--gold)] ring-1 ring-[var(--gold)]/40">
                ◆ {formatNumber(profile.rankUpShards ?? 0)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--dim)]">
              {t('player.shardsNote', { n: SHARD_VALUES[template.rarity], per: SHARDS_PER_TOKEN })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={dups.length === 0}
                onClick={() => {
                  const dup = dups[0];
                  if (dup) act(convertDuplicateToShards(profile, dup.instanceId), t('player.dupConverted', { n: SHARD_VALUES[template.rarity] }));
                }}
                className="rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-bold text-[#231a02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('player.convertDup', { n: SHARD_VALUES[template.rarity] })}
              </button>
              <button
                type="button"
                disabled={(profile.rankUpShards ?? 0) < SHARDS_PER_TOKEN}
                onClick={() => act(craftRankUpToken(profile), t('player.tokenCrafted', { n: SHARDS_PER_TOKEN }))}
                className="rounded-lg border border-[var(--gold)] px-3 py-2 text-sm font-bold text-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('player.craftToken', { n: SHARDS_PER_TOKEN })}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'SKILLS' && (
        <div className="mt-4">
          <p className="text-sm text-[var(--dim)]">
            {points === 1 ? t('player.pointLine', { r: card.rank }) : t('player.pointsLine', { n: points, r: card.rank })}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {SKILL_BRANCHES.map((branch) => {
              const allocated = card.skillPoints[branch.id];
              const disabledForPlayer = branch.gkOnly
                ? template.position !== 'GK'
                : template.position === 'GK' && branch.id !== 'physical';
              return (
                <li key={branch.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-semibold uppercase tracking-wide">{branch.name}</p>
                    <div className="flex items-center gap-1" aria-label={t('player.addPoint', { a: allocated }).replace(/\(.\)$/, '')}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span key={i} aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: i < allocated ? 'var(--accent)' : 'var(--border)' }} />
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--dim)]">{branch.blurb}</p>
                  <p className="tnum mt-1 text-xs text-[var(--dim)]">
                    {branch.subStats.map((s) => `${s} ${upgraded.subStats[s]}`).join(' · ')}
                  </p>
                  <button
                    type="button"
                    disabled={points <= 0 || allocated >= 5 || disabledForPlayer}
                    onClick={() => act(allocateSkillPoint(profile, card.instanceId, branch.id as SkillBranch), t('player.pointAdded', { name: branch.name }))}
                    className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {disabledForPlayer ? t('player.notFor') : allocated >= 5 ? t('player.branchMaxed') : t('player.addPoint', { a: allocated })}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => act(respecSkillPoints(profile, card.instanceId), t('player.respecNote'))}
            className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold"
          >
            {t('player.respec')}
          </button>

          {/* Epic fix round (P2-17): Skill Boosts — a club-wide progression
              layer paid from the shared Training XP pool; +2 per level to
              the track's sub-stats for every card in matches. */}
          <div className="mt-5">
            <p className="font-display text-lg font-semibold uppercase tracking-wide">{t('player.boostsTitle')}</p>
            <p className="mt-1 text-sm text-[var(--dim)]">
              {t('player.boostsNote', { xp: formatNumber(profile.trainingXpPool) })}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {SKILL_BOOST_TRACKS.map((track) => {
                const level = profile.skillBoosts?.[track.id] ?? 0;
                const cost = skillBoostCost(level);
                const maxed = level >= SKILL_BOOST_MAX_LEVEL;
                return (
                  <li key={track.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base font-semibold uppercase tracking-wide">{track.name}</p>
                      <span className="tnum text-[12px] font-bold text-[var(--gold)]">{t('player.level', { n: level })}/{formatNumber(SKILL_BOOST_MAX_LEVEL)}</span>
                    </div>
                    <p className="tnum mt-1 text-xs text-[var(--dim)]">{track.subStats.join(' · ')} +{level * 2}</p>
                    <button
                      type="button"
                      disabled={maxed || profile.trainingXpPool < cost}
                      onClick={() => act(upgradeSkillBoost(profile, track.id), t('player.boostRaised', { name: track.name, lv: level + 1 }))}
                      className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {maxed ? t('player.boostMaxed') : t('player.upgradeCost', { n: cost })}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
