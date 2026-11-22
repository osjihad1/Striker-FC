// Striker FC — ui/screens/ClubsScreen.tsx
// Clubs: all 41 clubs in the game — the 16 real clubs (Real Madrid,
// Barcelona, Man City, Liverpool, Bayern, PSG, Arsenal, Chelsea, Man Utd,
// Inter, AC Milan, Juventus, Dortmund, Atletico, Al Nassr, Inter Miami)
// wearing their real kit colours and fielding their real stars, plus the
// 25 original-IP clubs (the 12 seed clubs and 13 new ones from Chittagong
// Thunder to Napoli Azzurri). Every squad comes from the player database, so
// the Team OVR, captain and best XI shown here are exactly what a match
// fields — and every player listed can be pulled from packs, bought on
// the market and trained in My Team under the same club tag.

import { useMemo, useState } from 'react';
import type { PlayerTemplate } from '../../core/types';
import { getClubTeams, type ClubKind, type ClubTeam } from '../../data/Clubs';
import { formatNumber, t } from '../../i18n/i18n';

type Filter = 'ALL' | 'REAL' | 'ORIGINAL';

const FILTERS: { id: Filter; labelKey: string }[] = [
  { id: 'ALL', labelKey: 'clubs.allClubs' },
  { id: 'REAL', labelKey: 'clubs.realClubs' },
  { id: 'ORIGINAL', labelKey: 'clubs.originalClubs' },
];

function Crest({ team, size = 40 }: { team: ClubTeam; size?: number }) {
  const { club } = team;
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} role="img" aria-label={`${club.name} crest`} className="shrink-0 drop-shadow">
      <path d="M6 6 H94 V62 C94 86 74 99 50 106 C26 99 6 86 6 62 Z" fill={club.primary} stroke="rgba(255,255,255,0.55)" strokeWidth={3} />
      <path d="M6 34 H94" stroke={club.secondary} strokeWidth={7} />
      <text x={50} y={76} textAnchor="middle" fontSize={28} fontWeight={800} fill="#0b1120" fontFamily="'Barlow Condensed', sans-serif">{club.abbr}</text>
    </svg>
  );
}

function PlayerRow({ p, index }: { p: PlayerTemplate; index: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-black/30 px-2.5 py-1.5 ring-1 ring-white/5">
      <span className="tnum font-display w-7 text-center text-[15px] font-bold text-[var(--gold)]">{formatNumber(p.shirtNumber ?? index + 1)}</span>
      <span className="w-9 rounded bg-white/10 px-1 py-0.5 text-center text-[10px] font-black tracking-wide text-white/85">{p.position}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{p.name}</span>
      {p.realWorld && <span className="rounded bg-sky-500/70 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">REAL</span>}
      {p.rarity === 'LEGEND' && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[9px] font-black tracking-wider text-black">LEGEND</span>}
      {p.rarity === 'MASTER' && <span className="rounded bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">MASTER</span>}
      <span className="tnum font-display text-[15px] font-bold text-[var(--accent)]">{formatNumber(p.baseOvr)}</span>
    </div>
  );
}

function kindBadge(kind: ClubKind): string {
  if (kind === 'REAL') return t('clubs.realClub');
  if (kind === 'NEW_ORIGINAL') return t('clubs.newClub');
  return t('clubs.originalClub');
}

export function ClubsScreen({ onPlayClub, playAsClubId, onSetPlayAs }: {
  onPlayClub: (clubId: string) => void;
  /** Epic fix round (P0-6): the club currently chosen as YOUR team. */
  playAsClubId?: string | null;
  onSetPlayAs?: (clubId: string | null) => void;
}) {
  const teams = useMemo(() => getClubTeams(), []);
  const [filter, setFilter] = useState<Filter>('ALL');
  const visible = teams.filter((t) => filter === 'ALL' || (filter === 'REAL' ? t.kind === 'REAL' : t.kind !== 'REAL'));
  const [selectedId, setSelectedId] = useState<string>(teams[0]?.club.id ?? 'real_madrid');
  const selected = teams.find((t) => t.club.id === selectedId) ?? teams[0] ?? null;
  const bench = selected ? selected.squad.filter((p) => !selected.xi.some((x) => x.id === p.id)).slice(0, 7) : [];
  const realCount = teams.filter((t) => t.kind === 'REAL').length;

  return (
    <section aria-label={t('clubs.clubs')} className="mx-auto w-full max-w-5xl px-3 pb-4 pt-3 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-[26px] font-bold uppercase leading-none text-white">{t('clubs.clubs')}</h2>
          <p className="mt-1 text-[12px] font-medium text-[var(--dim)]">
            {t('clubs.intro', { t: teams.length, r: realCount, o: teams.length - realCount })}
          </p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Club filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1"
              style={{
                background: filter === f.id ? 'var(--accent)' : 'var(--surface2)',
                color: filter === f.id ? '#0a120c' : 'var(--text)',
                boxShadow: `0 0 0 1px ${filter === f.id ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="list" aria-label="All clubs">
        {visible.map((team) => {
          const active = selected?.club.id === team.club.id;
          return (
            <button
              key={team.club.id}
              type="button"
              role="listitem"
              aria-pressed={active}
              onClick={() => setSelectedId(team.club.id)}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left ring-1 transition"
              style={{
                background: active ? 'var(--surface2)' : 'var(--surface)',
                boxShadow: active
                  ? '0 0 0 2px var(--accent), 0 6px 18px rgba(0,0,0,0.4)'
                  : '0 0 0 1px var(--border)',
              }}
            >
              <Crest team={team} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold leading-tight text-white">{team.club.name}</span>
                <span className="block truncate text-[9px] font-semibold text-[var(--dim)]">
                  {team.star ? `${t('clubs.star')}: ${team.star.shortName} ${formatNumber(team.star.baseOvr)}` : '—'} · {team.club.league}
                </span>
              </span>
              <span className="text-right">
                <span className="tnum font-display block text-[17px] font-bold leading-none text-[var(--gold)]">{formatNumber(team.teamOvr)}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/60">OVR</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-[var(--border)]" style={{ background: 'var(--surface)' }}>
          <div
            className="flex flex-wrap items-center gap-3 px-3 py-3"
            style={{ background: `linear-gradient(120deg, ${selected.club.primary}33, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent)` }}
          >
            <Crest team={selected} size={52} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display truncate text-[22px] font-bold uppercase leading-none text-white">{selected.club.name}</h3>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--dim)]">
                {kindBadge(selected.kind)} · {selected.club.league} · {t('clubs.teamOvr')} {formatNumber(selected.teamOvr)} · {t('clubs.captain', { name: selected.captain?.name ?? '—' })}
                {selected.captain ? ` (${formatNumber(selected.captain.baseOvr)})` : ''} · {t('clubs.squadOf', { n: selected.squad.length })}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <span className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 ring-1 ring-white/15">
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: selected.club.primary }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/75">{t('clubs.shirt')}</span>
                </span>
                <span className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 ring-1 ring-white/15">
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: selected.club.secondary }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/75">{t('clubs.trim')}</span>
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-1.5 min-[560px]:w-auto">
              <button
                type="button"
                onClick={() => onPlayClub(selected.club.id)}
                className="play-glow font-display rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[17px] font-bold uppercase tracking-wide text-black"
                aria-label={`Play a friendly against ${selected.club.name}`}
              >
                ▶ {t('clubs.playVsClub')}
              </button>
              {onSetPlayAs && (
                <button
                  type="button"
                  aria-pressed={playAsClubId === selected.club.id}
                  onClick={() => onSetPlayAs(playAsClubId === selected.club.id ? null : selected.club.id)}
                  className="font-display rounded-xl px-4 py-2 text-[14px] font-bold uppercase tracking-wide ring-1"
                  style={{
                    background: playAsClubId === selected.club.id ? 'var(--gold)' : 'rgba(0,0,0,0.35)',
                    color: playAsClubId === selected.club.id ? '#231a02' : 'var(--text)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.25)',
                  }}
                >
                  {playAsClubId === selected.club.id ? t('clubs.yourTeamClear') : t('clubs.playAsThis')}
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
            <div>
              <h4 className="font-display mb-1.5 text-[13px] font-bold uppercase tracking-wider text-[var(--dim)]">{t('hub.startingXi')} · 4-3-3</h4>
              <div className="flex flex-col gap-1">
                {selected.xi.map((p, i) => <PlayerRow key={p.id} p={p} index={i} />)}
              </div>
            </div>
            <div>
              <h4 className="font-display mb-1.5 text-[13px] font-bold uppercase tracking-wider text-[var(--dim)]">{t('clubs.startingXiBench')}</h4>
              <div className="flex flex-col gap-1">
                {bench.map((p, i) => <PlayerRow key={p.id} p={p} index={i + 11} />)}
                {bench.length === 0 && <p className="text-[12px] text-[var(--dim)]">{t('clubs.noSquad')}</p>}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--dim)]">
                Every {selected.club.name} player carries the {selected.club.abbr} club tag in packs, the Transfer Market and the Squad Builder — own them, train them, and they keep this club&apos;s colours on their card.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
