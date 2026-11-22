// Striker FC — ui/screens/PlayModesScreen.tsx (Phase 08, Blueprint 08 §3)
// The Play Modes hub: all five Phase 08 game modes plus the classic Phase
// 01–07 ways to play. Head-to-Head shows your Division badge and star track,
// VS Attack your fan base, the Champions Knockout Cup its live persistent
// bracket, and the Skill Games Arena your star record in all four games.

import { useState } from 'react';
import type { SaveProfile, TournamentTie } from '../../core/types';
import { DIVISIONS, STARS_TO_PROMOTE, divisionName, h2hSeasonDaysLeft } from '../../modes/HeadToHeadMode';
import { ROUND_NAMES, USER_CLUB_ID, championOf, cupClubById, nextUserTie } from '../../modes/TournamentMode';
import { SKILL_GAMES, type SkillGameId } from '../../modes/SkillGamesMode';
import {
  CAREER_USER_ID, advanceCareerSeason, careerOpponentOf, nextUserFixture, promoteAcademyPlayer,
  sortedTable, upgradeFacility, type FacilityKind,
} from '../../modes/CareerMode';
import { getClubTeam } from '../../data/Clubs';
import { mulberry32 } from '../../core/math';
import { currentLanguage, formatNumber, t } from '../../i18n/i18n';

export type ClassicMode = 'MATCH' | 'SCRIMMAGE' | 'PRACTICE';

interface Props {
  profile: SaveProfile;
  teamOvr: number;
  onLaunchH2h: () => void;
  onLaunchVsa: () => void;
  onLaunchManager: () => void;
  onStartTournament: () => void;
  onPlayTournamentTie: () => void;
  onLaunchSkill: (id: SkillGameId) => void;
  onClassic: (mode: ClassicMode) => void;
  onOpenNations: () => void;
  onOpenClubs: () => void;
  onAttack: () => void;
  onDefend: () => void;
  /** Epic fix round (P2-20): career league fixture + profile commits. */
  onLaunchCareer: () => void;
  onCommit: (next: SaveProfile) => void;
}

function StarRow({ filled, total, size = 15 }: { filled: number; total: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={t('training.stars', { n: filled })}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
            fill={i < filled ? 'var(--gold)' : 'none'}
            stroke={i < filled ? 'var(--gold)' : 'rgba(255,255,255,0.35)'}
            strokeWidth={1.6}
          />
        </svg>
      ))}
    </span>
  );
}

function DivisionBadge({ division1Based }: { division1Based: number }) {
  const tier = DIVISIONS[Math.max(0, Math.min(14, division1Based - 1))]!;
  const top = tier.index >= 12;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 110" width="46" height="51" role="img" aria-label={tier.name}>
        <path d="M6 6 H94 V62 C94 86 74 99 50 106 C26 99 6 86 6 62 Z" fill={top ? '#f5c542' : '#1e3a8a'} stroke="rgba(255,255,255,0.55)" strokeWidth={3} />
        <text x={50} y={58} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight={700} fontSize={26} fill={top ? '#0a120c' : '#f8fafc'}>
          {tier.index + 1}
        </text>
        <text x={50} y={78} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight={600} fontSize={11} fill={top ? '#0a120c' : '#bfdbfe'}>
          {t('hub.division')}
        </text>
      </svg>
      <div>
        <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{tier.name}</p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--dim)]">{t('modes.divisionOf', { a: tier.index + 1, b: 15 })}</p>
      </div>
    </div>
  );
}

function TieRow({ tie, profile }: { tie: TournamentTie; profile: SaveProfile }) {
  const home = cupClubById(tie.homeClubId, profile);
  const away = cupClubById(tie.awayClubId, profile);
  const played = tie.winnerClubId !== null;
  const score = played
    ? `${tie.homeGoals} – ${tie.awayGoals}${tie.pensHome !== null ? ` (${tie.pensHome}–${tie.pensAway} pens)` : ''}`
    : 'vs';
  const name = (club: typeof home, id: string) => (
    <span style={{ fontWeight: tie.winnerClubId === id ? 800 : 500, color: tie.winnerClubId === id ? 'var(--text)' : 'var(--dim)' }}>
      {club.abbr}{id === USER_CLUB_ID ? ' ★' : ''}
    </span>
  );
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px]"
      style={{
        background: tie.isUserTie ? 'rgba(163,230,53,0.10)' : 'rgba(0,0,0,0.3)',
        border: tie.isUserTie ? '1px solid var(--accent-dim)' : '1px solid transparent',
      }}
    >
      {name(home, tie.homeClubId)}
      <span className="tnum shrink-0 font-display text-base font-bold">{score}</span>
      {name(away, tie.awayClubId)}
    </li>
  );
}

/** Epic fix round (P2-20): the Career league card — table, next fixture,
 *  facilities and the Youth Academy, all on the real CareerMode state. */
function CareerCard({ profile, onLaunchCareer, onCommit }: {
  profile: SaveProfile;
  onLaunchCareer: () => void;
  onCommit: (next: SaveProfile) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const career = profile.career ?? null;
  const fixture = career ? nextUserFixture(career) : null;
  const oppTeam = fixture ? getClubTeam(careerOpponentOf(fixture)) : null;
  const table = career ? sortedTable(career) : [];
  const userPos = table.findIndex((r) => r.clubId === CAREER_USER_ID) + 1;
  const clubName = (id: string) => (id === CAREER_USER_ID
    ? (profile.playAsClubId ? getClubTeam(profile.playAsClubId)?.club.name ?? profile.clubName : profile.clubName)
    : getClubTeam(id)?.club.name ?? id);
  const facilityBtn = (kind: FacilityKind, label: string) => {
    const level = career?.facilities[kind] ?? 0;
    const cost = 8000 * (level + 1);
    return (
      <button
        key={kind}
        type="button"
        disabled={!career || level >= 5 || profile.coins < cost}
        onClick={() => {
          const r = upgradeFacility(profile, kind);
          if (r.error) setNote(r.error);
          else { onCommit(r.profile); setNote(t('modes.upgraded', { label, n: level + 1 })); }
        }}
        className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-left text-[12px] font-semibold disabled:opacity-40"
      >
        {label} · {t('modes.levelN', { n: level })}
        <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
          {level >= 5 ? t('modes.maxLevel') : t('modes.coinsCost', { n: cost })}
        </span>
      </button>
    );
  };
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.career')}>
      <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-amber-300">{t('modes.career')}</h3>
      <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
        {t('modes.careerDesc')}
      </p>
      {!career ? (
        <button type="button" onClick={onLaunchCareer} className="mt-3 w-full rounded-lg bg-amber-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
          {t('modes.startCareer')}
        </button>
      ) : (
        <>
          <p className="tnum mt-2 text-[12px] font-semibold text-[var(--dim)]">
            {t('modes.seasonN', { n: career.season })} · {userPos > 0 ? t('modes.placeLine', { pos: currentLanguage() === 'bn' ? formatNumber(userPos) : `${userPos}${userPos === 1 ? 'st' : userPos === 2 ? 'nd' : userPos === 3 ? 'rd' : 'th'}` }) : '—'} · {t('modes.titlesWon', { n: career.titlesWon })}
          </p>
          <ol className="mt-2 space-y-0.5" aria-label={t('modes.career')}>
            {table.slice(0, 5).map((row, i) => (
              <li key={row.clubId} className={`flex items-center justify-between rounded px-2 py-1 text-[12px] ${row.clubId === CAREER_USER_ID ? 'bg-amber-400/15 font-bold' : 'text-[var(--dim)]'}`}>
                <span className="truncate">{formatNumber(i + 1)}. {clubName(row.clubId)}</span>
                <span className="tnum shrink-0">{formatNumber(row.p)}P · {formatNumber(row.pts)} pts</span>
              </li>
            ))}
          </ol>
          {fixture && oppTeam ? (
            <button type="button" onClick={onLaunchCareer} className="mt-3 w-full rounded-lg bg-amber-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
              {t('modes.playFixture', { name: oppTeam.club.name })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCommit({ ...profile, career: advanceCareerSeason(career) })}
              className="mt-3 w-full rounded-lg bg-amber-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]"
            >
              {t('modes.advanceSeason', { n: career.season + 1 })}
            </button>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {facilityBtn('training', t('modes.training'))}
            {facilityBtn('academy', t('modes.academy'))}
            {facilityBtn('stadium', t('modes.stadiumF'))}
          </div>
          <button
            type="button"
            disabled={career.facilities.academy <= 0 || career.academyPromotedSeason === career.season}
            onClick={() => {
              const r = promoteAcademyPlayer(profile, mulberry32(Date.now() & 0xffffff));
              if (r.error) setNote(r.error);
              else { onCommit(r.profile); setNote(t('modes.graduateNotice', { name: r.grantedName ?? '' })); }
            }}
            className="mt-2 w-full rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-[13px] font-bold text-amber-200 disabled:opacity-40"
          >
            {career.academyPromotedSeason === career.season
              ? t('modes.graduateDone')
              : t('modes.graduate')}
          </button>
          {note && <p className="mt-2 text-[12px] font-medium text-amber-200" role="status">{note}</p>}
        </>
      )}
    </article>
  );
}

export function PlayModesScreen({
  profile, teamOvr, onLaunchH2h, onLaunchVsa, onLaunchManager,
  onStartTournament, onPlayTournamentTie, onLaunchSkill, onClassic, onOpenNations, onOpenClubs,
  onAttack, onDefend, onLaunchCareer, onCommit,
}: Props) {
  const cup = profile.tournament ?? null;
  const userTie = cup ? nextUserTie(cup) : null;
  const championId = cup ? championOf(cup) : null;
  const skillStars = profile.skillStars ?? {};
  const skillBest = profile.skillBestScores ?? {};
  const totalSkillStars = SKILL_GAMES.reduce((sum, g) => sum + (skillStars[g.id] ?? 0), 0);

  return (
    <section aria-label={t('modes.playModes')} className="mt-5 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Head-to-Head */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.headToHead')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-[var(--accent)]">{t('modes.headToHead')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.h2hDesc')}
              </p>
            </div>
            <DivisionBadge division1Based={profile.h2hDivision} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <StarRow filled={profile.h2hStars} total={STARS_TO_PROMOTE} size={18} />
            <span className="tnum text-xs font-semibold text-[var(--dim)]">
              {t('modes.starsTo', { a: profile.h2hStars, b: STARS_TO_PROMOTE, next: profile.h2hDivision >= 15 ? t('modes.defendCrown') : divisionName(profile.h2hDivision + 1) })}
            </span>
          </div>
          <p className="tnum mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--dim)]">
            {t('modes.seasonEnds', { n: h2hSeasonDaysLeft(profile, Date.now()) })}
            {profile.playAsClubId ? ` · ${t('modes.playingAsClub')}` : ''}
          </p>
          <button type="button" onClick={onLaunchH2h} className="mt-3 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.playH2h', { ovr: teamOvr })}
          </button>
        </article>

        <CareerCard profile={profile} onLaunchCareer={onLaunchCareer} onCommit={onCommit} />

        {/* VS Attack */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.vsAttack')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-emerald-300">{t('modes.vsAttack')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.vsaDescFull')}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-4xl font-bold leading-none text-emerald-300">{formatNumber(profile.vsaFans)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.vsaFans')}</p>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-[var(--dim)]">
            {t('modes.vsaNote', { ovr: teamOvr })}
          </p>
          <button type="button" onClick={onLaunchVsa} className="mt-3 w-full rounded-lg bg-emerald-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.playVsa')}
          </button>
        </article>

        {/* Manager Mode */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.manager')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-sky-300">{t('modes.manager')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.managerDescFull')}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-4xl font-bold leading-none text-sky-300">{formatNumber(profile.managerTrophies)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.cupTrophies')}</p>
            </div>
          </div>
          <button type="button" onClick={onLaunchManager} className="mt-3 w-full rounded-lg bg-sky-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.takeTouchline')}
          </button>
        </article>

        {/* Skill Games Arena */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.skillGames')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-amber-300">{t('modes.skillGames')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.skillDescFull')}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-4xl font-bold leading-none text-amber-300">{formatNumber(totalSkillStars)}/{formatNumber(12)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.arenaStars')}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {SKILL_GAMES.map((game) => (
              <li key={game.id} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{game.name}</p>
                  <p className="flex items-center gap-2 text-[11px] text-[var(--dim)]">
                    <StarRow filled={skillStars[game.id] ?? 0} total={3} size={12} />
                    <span className="tnum">{t('modes.bestLine', { n: skillBest[game.id] ?? 0, t: game.starThresholds[2] ?? 0 })}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLaunchSkill(game.id)}
                  className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-[#0a120c]"
                  aria-label={`${t('modes.play')} ${game.name}`}
                >
                  {t('modes.play')}
                </button>
              </li>
            ))}
          </ul>
        </article>
        {/* Attack Mode — you only attack */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.attackMode')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-orange-300">{t('modes.attackMode')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.attackDescFull')}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-4xl font-bold leading-none text-orange-300">{formatNumber(profile.attackBest ?? 0)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.bestPoints')}</p>
            </div>
          </div>
          <button type="button" onClick={onAttack} className="mt-3 w-full rounded-lg bg-orange-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.attackBtn')}
          </button>
        </article>

        {/* Defend Mode — you only defend */}
        <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.defendMode')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-sky-300">{t('modes.defendMode')}</h3>
              <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
                {t('modes.defendDescFull')}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-4xl font-bold leading-none text-sky-300">{formatNumber(profile.defendBest ?? 0)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.bestPoints')}</p>
            </div>
          </div>
          <button type="button" onClick={onDefend} className="mt-3 w-full rounded-lg bg-sky-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.defendBtn')}
          </button>
        </article>
      </div>

      {/* Champions Knockout Cup */}
      <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.tournament')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-[var(--gold)]">{t('modes.tournament')}</h3>
            <p className="mt-0.5 max-w-md text-[13px] leading-snug text-[var(--dim)]">
              {t('modes.cupDescFull')}
            </p>
          </div>
          {cup?.status === 'CHAMPION' && (
            <span className="rounded-full border border-[var(--gold)] bg-[var(--gold)]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--gold)]">{t('modes.reigning')}</span>
          )}
          {cup?.status === 'ELIMINATED' && (
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--dim)]">{t('modes.knockedOut')}</span>
          )}
        </div>

        {!cup && (
          <button type="button" onClick={onStartTournament} className="mt-3 w-full rounded-lg bg-[var(--gold)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
            {t('modes.enterCup')}
          </button>
        )}

        {cup && (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cup.rounds.map((round, ri) => (
                <div key={ri}>
                  <p className="font-display text-base font-semibold uppercase tracking-wider" style={{ color: ri === cup.currentRound && cup.status === 'IN_PROGRESS' ? 'var(--gold)' : 'var(--dim)' }}>
                    {ROUND_NAMES[ri]}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {round.map((tie, ti) => <TieRow key={ti} tie={tie} profile={profile} />)}
                  </ul>
                </div>
              ))}
              {cup.rounds.length < 4 && cup.status === 'IN_PROGRESS' && (
                <div>
                  <p className="font-display text-base font-semibold uppercase tracking-wider text-[var(--dim)]">{ROUND_NAMES[cup.rounds.length]}</p>
                  <p className="mt-1.5 text-[13px] text-[var(--dim)]">{t('modes.drawnLater')}</p>
                </div>
              )}
            </div>
            {championId && (
              <p className="mt-3 text-sm font-semibold">
                {t('modes.championsLine', { name: cupClubById(championId, profile).name }).replace(': ' + cupClubById(championId, profile).name, '')}: <span className="text-[var(--gold)]">{cupClubById(championId, profile).name}</span>
                {championId === USER_CLUB_ID ? t('modes.championsYou') : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {userTie && (
                <button type="button" onClick={onPlayTournamentTie} className="rounded-lg bg-[var(--gold)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
                  {t('modes.playTie', { round: ROUND_NAMES[userTie.roundIndex] ?? '', name: cupClubById(userTie.tie.homeClubId === USER_CLUB_ID ? userTie.tie.awayClubId : userTie.tie.homeClubId, profile).name })}
                </button>
              )}
              {cup.status !== 'IN_PROGRESS' && (
                <button type="button" onClick={onStartTournament} className="rounded-lg bg-[var(--gold)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
                  {t('modes.newCup')}
                </button>
              )}
            </div>
          </>
        )}
      </article>

      {/* Club Friendly — all 41 clubs, real and original */}
      <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.clubFriendly')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-rose-300">{t('modes.clubFriendly')}</h3>
            <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
              {t('modes.clubDesc')}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum font-display text-4xl font-bold leading-none text-rose-300">{formatNumber(40)}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.clubsN')}</p>
          </div>
        </div>
        <button type="button" onClick={onOpenClubs} className="mt-3 w-full rounded-lg bg-rose-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
          {t('modes.chooseClub')}
        </button>
      </article>

      {/* International Friendly — real national teams */}
      <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.nationalFriendly')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-sky-300">{t('modes.nationalFriendly')}</h3>
            <p className="mt-0.5 max-w-sm text-[13px] leading-snug text-[var(--dim)]">
              {t('modes.nationDesc')}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum font-display text-4xl font-bold leading-none text-sky-300">{formatNumber(20)}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">{t('modes.nationsN')}</p>
          </div>
        </div>
        <button type="button" onClick={onOpenNations} className="mt-3 w-full rounded-lg bg-sky-400 px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]">
          {t('modes.chooseNation')}
        </button>
      </article>

      {/* Classic ways to play (Phases 01–07) */}
      <article className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-4 backdrop-blur" aria-label={t('modes.classicModes')}>
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">{t('modes.classicModes')}</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ['MATCH', t('modes.classicMatchT'), t('modes.classicMatchD')],
              ['SCRIMMAGE', t('modes.scrimmageT'), t('modes.scrimmageD')],
              ['PRACTICE', t('modes.practiceT'), t('modes.practiceD')],
            ] as [ClassicMode, string, string][]
          ).map(([mode, title, blurb]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onClassic(mode)}
              className="rounded-xl border border-white/10 bg-black/30 p-3 text-left"
            >
              <span className="font-display text-lg font-bold uppercase tracking-wide text-[var(--text)]">{title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-[var(--dim)]">{blurb}</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}
