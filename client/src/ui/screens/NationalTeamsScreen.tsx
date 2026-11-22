// Striker FC — ui/screens/NationalTeamsScreen.tsx
// National Teams: the 20 real-world national squads from the player
// database — kit colours, Team OVR, the best XI with real shirt numbers,
// the star player, and a Play Friendly button that fields that exact XI
// against your club in the 3D stadium (pre-match lobby first).

import { useMemo, useState } from 'react';
import type { PlayerTemplate, SaveProfile } from '../../core/types';
import { getNationalTeams, type NationalTeam } from '../../data/NationalTeams';
import { startWorldCup, worldCupNextOpponent } from '../../modes/InternationalCupMode';
import { formatNumber, t } from '../../i18n/i18n';
import bannerIntlCupUrl from '../../assets/art/banner-intl-cup.jpg';
import trophyWorldUrl from '../../assets/art/trophy-world.jpg';

function Crest({ team, size = 40 }: { team: NationalTeam; size?: number }) {
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} role="img" aria-label={`${team.name} crest`} className="shrink-0 drop-shadow">
      <path d="M6 6 H94 V62 C94 86 74 99 50 106 C26 99 6 86 6 62 Z" fill={team.primary} stroke="rgba(255,255,255,0.55)" strokeWidth={3} />
      <path d="M6 34 H94" stroke={team.secondary} strokeWidth={7} />
      <text x={50} y={76} textAnchor="middle" fontSize={28} fontWeight={800} fill="#0b1120" fontFamily="'Barlow Condensed', sans-serif">{team.abbr}</text>
    </svg>
  );
}

function PlayerRow({ p, index }: { p: PlayerTemplate; index: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-black/30 px-2.5 py-1.5 ring-1 ring-white/5">
      <span className="tnum font-display w-7 text-center text-[15px] font-bold text-[var(--gold)]">{formatNumber(p.shirtNumber ?? index + 1)}</span>
      <span className="w-9 rounded bg-white/10 px-1 py-0.5 text-center text-[10px] font-black tracking-wide text-white/85">{p.position}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{p.name}</span>
      {p.rarity === 'LEGEND' && <span className="rounded bg-[var(--gold)] px-1.5 py-0.5 text-[9px] font-black tracking-wider text-black">LEGEND</span>}
      {p.rarity === 'MASTER' && <span className="rounded bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">MASTER</span>}
      <span className="tnum font-display text-[15px] font-bold text-[var(--accent)]">{formatNumber(p.baseOvr)}</span>
    </div>
  );
}

export function NationalTeamsScreen({ onPlayFriendly, profile, onCommit, onPlayCupMatch }: {
  onPlayFriendly: (code: string) => void;
  profile?: SaveProfile | null;
  onCommit?: (next: SaveProfile) => void;
  onPlayCupMatch?: () => void;
}) {
  const teams = useMemo(() => getNationalTeams(), []);
  const [selectedCode, setSelectedCode] = useState<string>(teams[0]?.code ?? 'AR');
  const selected = teams.find((t) => t.code === selectedCode) ?? teams[0] ?? null;
  const bench = selected ? selected.squad.filter((p) => !selected.xi.some((x) => x.id === p.id)).slice(0, 7) : [];

  return (
    <section aria-label={t('clubs.nationalTeams')} className="mx-auto w-full max-w-5xl px-3 pb-4 pt-3 sm:px-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-[26px] font-bold uppercase leading-none text-white">{t('clubs.nationalTeams')}</h2>
          <p className="mt-1 text-[12px] font-medium text-[var(--dim)]">
            {t('nations.intro', { t: teams.length })}
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface2)] px-2.5 py-1 text-[11px] font-bold text-[var(--gold)] ring-1 ring-[var(--border)]">
          {t('nations.legendNote')}
        </span>
      </div>

      {/* Epic P1-4: the International Cup — a full World-Cup road. */}
      {profile && onCommit && onPlayCupMatch && (
        <div className="relative mt-4 overflow-hidden rounded-3xl border border-[var(--gold)]/50 bg-gradient-to-br from-[#171106] via-[#0b1526] to-[#0b1526] p-4" aria-label={t('nations.cupTitle')}>
          {/* Trophy & menu art: stadium banner behind the cup panel; the
              gold gradient stays as the fallback if the photo fails. */}
          <img src={bannerIntlCupUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_35%] opacity-45" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--gold)]">{t('nations.cupTitle')}</p>
              <h3 className="font-display mt-0.5 text-2xl font-bold uppercase leading-none tracking-wide">
                {!profile.worldCup || profile.worldCup.stage === 'OUT' || profile.worldCup.stage === 'WON'
                  ? t('nations.glory')
                  : `${getNationalTeams().find((t) => t.code === profile.worldCup?.userCode)?.name ?? ''} · ${profile.worldCup.stage === 'GROUP' ? t('nations.groupMatch', { n: profile.worldCup.groupPlayed + 1 }) : profile.worldCup.stage}`}
              </h3>
              <p className="mt-1 max-w-prose text-[12px] font-medium text-[var(--dim)]">
                {t('nations.cupDesc')}
              </p>
            </div>
            {!profile.worldCup || profile.worldCup.stage === 'OUT' || profile.worldCup.stage === 'WON' ? (
              <button
                type="button"
                onClick={() => {
                  if (!selected) return;
                  const cup = startWorldCup(selected.code, Date.now() & 0xffffff);
                  if (cup) onCommit({ ...profile, worldCup: cup });
                }}
                className="play-glow font-display rounded-xl bg-[var(--gold)] px-4 py-2.5 text-lg font-bold uppercase tracking-wide text-black"
              >
                {t('nations.cupEnter', { name: selected?.name ?? '…' })}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPlayCupMatch}
                className="play-glow font-display rounded-xl bg-[var(--gold)] px-4 py-2.5 text-lg font-bold uppercase tracking-wide text-black"
              >
                {t('nations.cupPlayVs', { name: getNationalTeams().find((nt) => nt.code === worldCupNextOpponent(profile.worldCup!))?.name ?? '…' })}
              </button>
            )}
          </div>
          {profile.worldCup && profile.worldCup.stage !== 'OUT' && profile.worldCup.stage !== 'WON' && (
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="bg-black/40 text-[10px] uppercase tracking-widest text-[var(--dim)]">
                    <th className="px-2.5 py-1.5">{t('nations.group')}</th><th className="px-1.5 py-1.5">P</th><th className="px-1.5 py-1.5">W</th><th className="px-1.5 py-1.5">D</th><th className="px-1.5 py-1.5">L</th><th className="px-1.5 py-1.5">GD</th><th className="px-1.5 py-1.5">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {[...profile.worldCup.group]
                    .sort((a, b) => {
                      const ra = profile.worldCup!.table[a]!; const rb = profile.worldCup!.table[b]!;
                      return rb.pts - ra.pts || (rb.gf - rb.ga) - (ra.gf - ra.ga);
                    })
                    .map((code) => {
                      const row = profile.worldCup!.table[code]!;
                      const team = getNationalTeams().find((t) => t.code === code);
                      return (
                        <tr key={code} className={code === profile.worldCup!.userCode ? 'bg-[var(--gold)]/10 font-bold text-white' : 'text-white/75'}>
                          <td className="px-2.5 py-1.5">{team?.name ?? code}</td>
                          <td className="tnum px-1.5 py-1.5">{formatNumber(row.p)}</td><td className="tnum px-1.5 py-1.5">{formatNumber(row.w)}</td>
                          <td className="tnum px-1.5 py-1.5">{formatNumber(row.d)}</td><td className="tnum px-1.5 py-1.5">{formatNumber(row.l)}</td>
                          <td className="tnum px-1.5 py-1.5">{row.gf - row.ga > 0 ? '+' : ''}{formatNumber(row.gf - row.ga)}</td>
                          <td className="tnum px-1.5 py-1.5 font-bold">{formatNumber(row.pts)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          {profile.worldCup && profile.worldCup.log.length > 0 && (
            <p className="mt-2.5 text-[12px] font-medium leading-relaxed text-white/80">{profile.worldCup.log[profile.worldCup.log.length - 1]}</p>
          )}
          {profile.worldCup?.stage === 'WON' && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <img src={trophyWorldUrl} alt="" aria-hidden className="h-28 w-auto rounded-xl object-cover shadow-2xl ring-1 ring-[var(--gold)]/70" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <p className="font-display min-w-0 flex-1 text-xl font-bold uppercase tracking-wide text-[var(--gold)]">{t('nations.champions')}</p>
            </div>
          )}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="list" aria-label="All national teams">
        {teams.map((team) => {
          const active = selected?.code === team.code;
          return (
            <button
              key={team.code}
              type="button"
              role="listitem"
              aria-pressed={active}
              onClick={() => setSelectedCode(team.code)}
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
                <span className="block truncate text-[12px] font-bold leading-tight text-white">{team.name}</span>
                <span className="block truncate text-[9px] font-semibold text-[var(--dim)]">
                  {team.star ? `${t('clubs.star')}: ${team.star.shortName} ${formatNumber(team.star.baseOvr)}` : '—'}
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
            style={{ background: `linear-gradient(120deg, ${selected.primary}33, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent)` }}
          >
            <Crest team={selected} size={52} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display truncate text-[22px] font-bold uppercase leading-none text-white">{selected.name}</h3>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--dim)]">
                {t('clubs.teamOvr')} {formatNumber(selected.teamOvr)} · {t('clubs.captain', { name: selected.captain?.name ?? '—' })}
                {selected.captain ? ` (${formatNumber(selected.captain.baseOvr)})` : ''}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <span className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 ring-1 ring-white/15">
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: selected.primary }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/75">{t('clubs.shirt')}</span>
                </span>
                <span className="flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 ring-1 ring-white/15">
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: selected.secondary }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/75">{t('clubs.trim')}</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPlayFriendly(selected.code)}
              className="play-glow font-display rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[17px] font-bold uppercase tracking-wide text-black"
              aria-label={`Play friendly against ${selected.name}`}
            >
              ▶ {t('clubs.playFriendly')}
            </button>
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
                {t('nations.ownNote')}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
