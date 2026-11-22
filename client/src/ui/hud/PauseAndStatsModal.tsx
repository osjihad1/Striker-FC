// Striker FC — ui/hud/PauseAndStatsModal.tsx (Phase 06)
// The pause menu over the frozen match: live statistics comparison bars, an
// interactive 2D shot map (gold = goal, cyan = on target, gray = missed),
// the live substitutions tab (up to 5 swaps, instant 3D rig rebuild via the
// engine's template-id watch), camera/audio quick settings, Resume & Forfeit.

import { useState } from 'react';
import { PITCH } from '../../core/constants';
import type { Club } from '../../core/types';
import type { BenchInfo, HudPlayerInfo } from '../../ai/ScrimmageEngine';
import type { MatchStatsSheet } from '../../rules/MatchStatsTracker';
import { useSettingsStore } from '../../store/useSettingsStore';
import { t } from '../../i18n/i18n';
import type { CameraMode as CameraMode3D } from '../../rendering/CameraController';

export interface ScrimmageFallbackStats {
  possessionHomePct: number;
  shotsHome: number;
  shotsAway: number;
  onTargetHome: number;
  onTargetAway: number;
  savesHome: number;
  savesAway: number;
  tackles: number;
}

export interface PauseAndStatsModalProps {
  open: boolean;
  homeClub: Club;
  awayClub: Club;
  scoreHome: number;
  scoreAway: number;
  minute: number;
  stateLabel: string;
  stats: MatchStatsSheet | null;
  fallback: ScrimmageFallbackStats | null;
  xi: HudPlayerInfo[];
  bench: BenchInfo[];
  subsUsed: number;
  maxSubs: number;
  onSubstitute: (teamIndex: number, benchIndex: number) => string;
  cameraMode: CameraMode3D;
  onCameraMode: (m: CameraMode3D) => void;
  onResume: () => void;
  onForfeit: () => void;
  canForfeit: boolean;
}

type ModalTab = 'STATS' | 'SUBS' | 'SETTINGS';

function CompareBar({ label, home, away, format }: {
  label: string; home: number; away: number; format?: (v: number) => string;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  const fmt = format ?? ((v: number) => String(v));
  return (
    <div>
      <div className="tnum flex items-baseline justify-between text-sm">
        <span className="w-14 font-bold">{fmt(home)}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--dim)]">{label}</span>
        <span className="w-14 text-right font-bold">{fmt(away)}</span>
      </div>
      <div className="mt-0.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
        <div className="flex justify-end rounded-l-full bg-[var(--surface2)]" style={{ width: `${homePct}%` }}>
          <div className="h-full w-full rounded-l-full bg-[var(--accent)]" />
        </div>
        <div className="rounded-r-full bg-sky-400" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function ShotMap({ stats, homeClub, awayClub }: {
  stats: MatchStatsSheet; homeClub: Club; awayClub: Club;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null ? stats.shotMap[selected] : undefined;
  const colorFor = (r: string) => (r === 'GOAL' ? '#f5c542' : r === 'SAVED' ? '#22d3ee' : r === 'PENDING' ? '#ffffff' : '#9ca3af');
  return (
    <div>
      <svg viewBox="0 0 105 68" className="w-full rounded-lg border border-[var(--border)] bg-[#0d1f10]" role="img" aria-label="Interactive shot map — tap a shot for details">
        <rect x="0.5" y="0.5" width="104" height="67" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="#2c4a30" strokeWidth="0.7" />
        <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
        <rect x="0" y="13.9" width="16.5" height="40.2" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
        <rect x="88.5" y="13.9" width="16.5" height="40.2" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
        {stats.shotMap.map((s, i) => (
          <g key={i}>
            <circle
              cx={s.x + PITCH.HALF_LENGTH}
              cy={s.z + PITCH.HALF_WIDTH}
              r={selected === i ? 3.4 : 2.6 + s.xg * 1.8}
              fill={colorFor(s.result)}
              opacity={s.result === 'OFF_TARGET' ? 0.75 : 0.95}
              stroke={selected === i ? '#ffffff' : s.side === 'HOME' ? homeClub.primary : awayClub.primary}
              strokeWidth={selected === i ? 1 : 0.5}
              className="cursor-pointer"
              role="button"
              aria-label={`Shot ${i + 1}: ${s.side}, ${s.result.replace(/_/g, ' ').toLowerCase()}, xG ${s.xg.toFixed(2)}, minute ${s.minute}`}
              onClick={() => setSelected(i)}
            />
          </g>
        ))}
      </svg>
      <p className="mt-1.5 min-h-5 text-xs text-[var(--dim)]" aria-live="polite">
        {sel
          ? `${sel.side === 'HOME' ? homeClub.name : awayClub.name} · ${sel.minute}' · ${sel.result.replace(/_/g, ' ')} · xG ${sel.xg.toFixed(2)} · shot from ${Math.abs(sel.x).toFixed(0)}m ${sel.x >= 0 ? 'right' : 'left'} channel`
          : `${stats.shotMap.length} shots plotted — gold goal · cyan on target · gray missed. Tap a dot for its story.`}
      </p>
    </div>
  );
}

export function PauseAndStatsModal(props: PauseAndStatsModalProps) {
  const {
    open, homeClub, awayClub, scoreHome, scoreAway, minute, stateLabel,
    stats, fallback, xi, bench, subsUsed, maxSubs, onSubstitute,
    cameraMode, onCameraMode, onResume, onForfeit, canForfeit,
  } = props;
  const [tab, setTab] = useState<ModalTab>('STATS');
  const [outIndex, setOutIndex] = useState<number | null>(null);
  const [inIndex, setInIndex] = useState<number | null>(null);
  const [subNote, setSubNote] = useState<string | null>(null);
  const [forfeitArmed, setForfeitArmed] = useState(false);

  const masterVolume = useSettingsStore((s) => s.masterVolume);
  const crowdVolume = useSettingsStore((s) => s.crowdVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const commentaryOn = useSettingsStore((s) => s.commentaryOn);
  const commentarySpeech = useSettingsStore((s) => s.commentarySpeech);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const setCommentaryOn = useSettingsStore((s) => s.setCommentaryOn);
  const setCommentarySpeech = useSettingsStore((s) => s.setCommentarySpeech);

  if (!open) return null;

  const homeXi = xi.filter((p) => p.side === 'HOME');
  const subsLeft = maxSubs - subsUsed;

  const doSub = () => {
    if (outIndex === null || inIndex === null) return;
    const note = onSubstitute(outIndex, inIndex);
    setSubNote(note);
    setOutIndex(null);
    setInIndex(null);
  };

  const volumeSlider = (label: string, channel: 'masterVolume' | 'crowdVolume' | 'sfxVolume', value: number) => (
    <label className="block">
      <span className="flex justify-between text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
        <span>{label}</span>
        <span className="tnum text-[var(--accent)]">{Math.round(value * 100)}%</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => setVolume(channel, Number(e.target.value) / 100)}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </label>
  );

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-black/72 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Pause menu — match statistics, substitutions and settings">
      <div className="mx-auto my-3 w-[min(94vw,560px)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="font-display text-2xl font-bold uppercase leading-none tracking-wider">
              {t('pause.paused')} · <span className="tnum text-[var(--accent)]">{scoreHome} – {scoreAway}</span>
            </p>
            <p className="tnum mt-1 text-xs text-[var(--dim)]">
              {homeClub.name} vs {awayClub.name} · {minute}&prime; · {stateLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c]"
          >
            {t('panel.resume')}
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border)] px-3 pt-2" role="tablist" aria-label="Pause menu sections">
          {(
            [
              ['STATS', 'Match Stats'],
              ['SUBS', `Subs · ${subsLeft} left`],
              ['SETTINGS', 'Camera & Audio'],
            ] as [ModalTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="font-display px-3 py-1.5 text-base font-semibold uppercase tracking-wider"
              style={{
                color: tab === id ? 'var(--accent)' : 'var(--dim)',
                borderBottom: tab === id ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-4 py-3">
          {tab === 'STATS' && (
            <div className="space-y-2.5">
              <div className="tnum flex items-center justify-between font-display text-lg font-bold">
                <span style={{ color: homeClub.primary === '#f8fafc' ? 'var(--text)' : homeClub.primary }}>{homeClub.abbr}</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-[var(--dim)]">Team stats</span>
                <span className="text-sky-300">{awayClub.abbr}</span>
              </div>
              {stats ? (
                <>
                  <CompareBar label="Possession %" home={stats.home.possessionPct} away={stats.away.possessionPct} />
                  <CompareBar label="Shots" home={stats.home.shots} away={stats.away.shots} />
                  <CompareBar label="On target" home={stats.home.onTarget} away={stats.away.onTarget} />
                  <CompareBar label="Expected goals (xG)" home={stats.home.xg} away={stats.away.xg} format={(v) => v.toFixed(2)} />
                  <CompareBar label="Pass accuracy %" home={stats.home.passAccuracyPct} away={stats.away.passAccuracyPct} />
                  <CompareBar label="Tackles won" home={stats.home.tacklesWon} away={stats.away.tacklesWon} />
                  <CompareBar label="Saves" home={stats.home.saves} away={stats.away.saves} />
                  <CompareBar label="Corners" home={stats.home.corners} away={stats.away.corners} />
                  <CompareBar label="Fouls" home={stats.home.fouls} away={stats.away.fouls} />
                  <div className="pt-1">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Shot map</p>
                    <ShotMap stats={stats} homeClub={homeClub} awayClub={awayClub} />
                  </div>
                </>
              ) : fallback ? (
                <>
                  <CompareBar label="Possession %" home={fallback.possessionHomePct} away={100 - fallback.possessionHomePct} />
                  <CompareBar label="Shots" home={fallback.shotsHome} away={fallback.shotsAway} />
                  <CompareBar label="On target" home={fallback.onTargetHome} away={fallback.onTargetAway} />
                  <CompareBar label="Saves" home={fallback.savesHome} away={fallback.savesAway} />
                  <CompareBar label="Tackles" home={fallback.tackles} away={0} />
                  <p className="pt-1 text-xs text-[var(--dim)]">
                    Scrimmage running totals — the full xG sheet and shot map record in Full Match mode.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--dim)]">No match statistics yet.</p>
              )}
            </div>
          )}

          {tab === 'SUBS' && (
            <div>
              <p className="text-sm text-[var(--dim)]">
                Pick a tired player to bring off, then his replacement. Fresh legs arrive at full stamina and the
                3D rig updates instantly. <span className="tnum font-semibold text-[var(--text)]">{subsUsed}/{maxSubs} used.</span>
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">On the pitch — tap to select OFF</p>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {homeXi.map((p) => {
                  const staminaPct = Math.round(p.stamina01 * 100);
                  const tired = staminaPct < 55;
                  return (
                    <li key={p.global}>
                      <button
                        type="button"
                        disabled={p.isGk || p.sentOff}
                        aria-pressed={outIndex === p.teamIndex}
                        aria-label={`Bring off ${p.fullName}, ${p.role}, stamina ${staminaPct} percent`}
                        onClick={() => setOutIndex(p.teamIndex)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left disabled:opacity-45"
                        style={{
                          borderColor: outIndex === p.teamIndex ? 'var(--danger)' : 'var(--border)',
                          background: outIndex === p.teamIndex ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {p.name} <span className="text-[var(--dim)]">{p.role}</span>
                            {p.sentOff ? ' · sent off' : p.isGk ? ' · GK' : ''}
                          </span>
                          <span className="mt-0.5 block h-1 w-24 overflow-hidden rounded-full bg-black/50">
                            <span
                              className="block h-full"
                              style={{
                                width: `${staminaPct}%`,
                                background: staminaPct > 50 ? 'var(--accent)' : staminaPct > 25 ? '#eab308' : 'var(--danger)',
                              }}
                            />
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-xs font-bold" style={{ color: tired ? '#eab308' : 'var(--dim)' }}>
                          {staminaPct}%{tired && !p.isGk ? ' · tired' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Bench — tap to select ON</p>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {bench.map((b) => (
                  <li key={b.index}>
                    <button
                      type="button"
                      aria-pressed={inIndex === b.index}
                      aria-label={`Bring on ${b.fullName}, ${b.position}, rated ${b.ovr}`}
                      onClick={() => setInIndex(b.index)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left"
                      style={{
                        borderColor: inIndex === b.index ? 'var(--accent)' : 'var(--border)',
                        background: inIndex === b.index ? 'var(--accent-dim)' : 'var(--surface2)',
                      }}
                    >
                      <span className="truncate text-sm font-semibold">
                        {b.name} <span className="text-[var(--dim)]">{b.position}</span>
                      </span>
                      <span className="tnum shrink-0 font-display text-base font-bold text-[var(--gold)]">{b.ovr}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={outIndex === null || inIndex === null || subsLeft <= 0}
                onClick={doSub}
                className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 font-display text-lg font-bold uppercase tracking-wider text-[#0a120c] disabled:opacity-40"
              >
                {subsLeft <= 0 ? 'All 5 substitutions used' : 'Make substitution'}
              </button>
              {subNote && <p aria-live="polite" className="mt-2 text-sm font-medium text-[var(--accent)]">{subNote}</p>}
            </div>
          )}

          {tab === 'SETTINGS' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">Camera</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Camera angle">
                  {(
                    [
                      ['BROADCAST', 'Broadcast'],
                      ['PRO', 'Pro'],
                      ['SET_PIECE', 'Set-Piece'],
                      ['CELEBRATION', 'Celebration'],
                    ] as [CameraMode3D, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={cameraMode === id}
                      onClick={() => onCameraMode(id)}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold"
                      style={{
                        borderColor: cameraMode === id ? 'var(--accent)' : 'var(--border)',
                        background: cameraMode === id ? 'var(--accent-dim)' : 'var(--surface2)',
                        color: cameraMode === id ? 'var(--accent)' : 'var(--text)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {volumeSlider('Master volume', 'masterVolume', masterVolume)}
              {volumeSlider('Crowd volume', 'crowdVolume', crowdVolume)}
              {volumeSlider('Effects volume', 'sfxVolume', sfxVolume)}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
                <span>
                  <span className="block text-sm font-semibold">Commentary ticker</span>
                  <span className="block text-xs text-[var(--dim)]">Live broadcast lines under the radar</span>
                </span>
                <input
                  type="checkbox"
                  aria-label="Commentary ticker on or off"
                  checked={commentaryOn}
                  onChange={(e) => setCommentaryOn(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
                <span>
                  <span className="block text-sm font-semibold">Commentary voice</span>
                  <span className="block text-xs text-[var(--dim)]">Web Speech reads the big moments aloud</span>
                </span>
                <input
                  type="checkbox"
                  aria-label="Commentary voice on or off"
                  checked={commentarySpeech}
                  onChange={(e) => setCommentarySpeech(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (forfeitArmed) onForfeit();
              else setForfeitArmed(true);
            }}
            disabled={!canForfeit}
            className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm font-bold text-[var(--danger)] disabled:opacity-40"
          >
            {forfeitArmed ? 'Tap again to confirm forfeit' : 'Forfeit match'}
          </button>
          <button
            type="button"
            onClick={onResume}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold"
          >
            {t('panel.backToMatch')}
          </button>
        </div>
      </div>
    </div>
  );
}
