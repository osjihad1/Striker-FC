// Striker FC — ui/hud/ManagerTouchlineHUD.tsx (Phase 08, Blueprint 08 §3 Mode 3)
// The Head Coach's touchline panel for Manager Mode: sim speed (1x / 2x),
// the five mentality levels, all seven tactical sliders and live
// substitutions. Every control writes straight into the engine — mentality
// and tactics land in TacticalEngine / UtilityScorer weights on the very
// next fixed tick, and a substitution swaps the real 3D rig in place.

import { useState } from 'react';
import type { ManagerTactics, Mentality } from '../../core/types';
import type { BenchInfo, HudPlayerInfo } from '../../ai/ScrimmageEngine';
import { MENTALITY_ORDER, TACTIC_SLIDERS, type ManagerSpeed } from '../../modes/ManagerMode';

interface Props {
  mentality: Mentality;
  onMentality: (m: Mentality) => void;
  tactics: ManagerTactics;
  onTactics: (t: ManagerTactics) => void;
  speed: ManagerSpeed;
  onSpeed: (s: ManagerSpeed) => void;
  xi: HudPlayerInfo[];
  bench: BenchInfo[];
  subsUsed: number;
  maxSubs: number;
  onSubstitute: (teamIndex: number, benchIndex: number) => string;
}

const MENTALITY_SHORT: Record<Mentality, string> = {
  ULTRA_DEFENDING: 'Ultra Def',
  DEFENDING: 'Defend',
  BALANCED: 'Balanced',
  ATTACKING: 'Attack',
  ULTRA_ATTACKING: 'All-Out',
};

export function ManagerTouchlineHUD({
  mentality, onMentality, tactics, onTactics, speed, onSpeed,
  xi, bench, subsUsed, maxSubs, onSubstitute,
}: Props) {
  const [panel, setPanel] = useState<'TACTICS' | 'SUBS' | null>(null);
  const [outIndex, setOutIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const doSub = (benchIndex: number) => {
    if (outIndex === null) {
      setFeedback('Pick a player to bring off first, then tap his replacement.');
      return;
    }
    setFeedback(onSubstitute(outIndex, benchIndex));
    setOutIndex(null);
  };

  return (
    <div className="absolute inset-x-2 bottom-2 z-30 sm:inset-x-4" aria-label="Manager touchline">
      {panel === 'TACTICS' && (
        <div className="mb-2 max-h-[46vh] overflow-y-auto rounded-xl border border-white/15 bg-black/80 p-3 backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
            Game plan — every change is live in the tactical engine this tick
          </p>
          <div className="mt-2 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {TACTIC_SLIDERS.map(({ key, label, low, high }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white">{label}</span>
                  <span className="block text-[10px] text-white/55">{low} · {high}</span>
                </span>
                <div className="flex shrink-0 gap-1" role="group" aria-label={label}>
                  {([1, 2, 3] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={tactics[key] === v}
                      aria-label={`${label} level ${v}`}
                      onClick={() => onTactics({ ...tactics, [key]: v })}
                      className="tnum h-8 w-9 rounded border text-xs font-bold"
                      style={{
                        borderColor: tactics[key] === v ? 'var(--accent)' : 'rgba(255,255,255,0.25)',
                        background: tactics[key] === v ? 'var(--accent-dim)' : 'rgba(255,255,255,0.06)',
                        color: tactics[key] === v ? 'var(--accent)' : 'rgba(255,255,255,0.75)',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === 'SUBS' && (
        <div className="mb-2 max-h-[46vh] overflow-y-auto rounded-xl border border-white/15 bg-black/80 p-3 backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
            Substitutions · {subsUsed}/{maxSubs} used — tap a player to bring off, then his replacement
          </p>
          {feedback && <p aria-live="polite" className="mt-1 text-xs font-semibold text-amber-300">{feedback}</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">On the pitch</p>
              <ul className="mt-1 space-y-1">
                {xi.filter((p) => p.side === 'HOME' && !p.isGk && !p.sentOff).map((p) => (
                  <li key={p.teamIndex}>
                    <button
                      type="button"
                      aria-pressed={outIndex === p.teamIndex}
                      onClick={() => setOutIndex(outIndex === p.teamIndex ? null : p.teamIndex)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold"
                      style={{
                        borderColor: outIndex === p.teamIndex ? '#f59e0b' : 'rgba(255,255,255,0.15)',
                        background: outIndex === p.teamIndex ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                        color: '#fff',
                      }}
                    >
                      <span>{p.role} · {p.fullName}</span>
                      <span className="tnum text-white/60">{Math.round(p.stamina01 * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Bench</p>
              <ul className="mt-1 space-y-1">
                {bench.map((b) => (
                  <li key={b.index}>
                    <button
                      type="button"
                      onClick={() => doSub(b.index)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-left text-xs font-semibold text-white"
                    >
                      <span>{b.position} · {b.fullName}</span>
                      <span className="tnum text-[var(--gold)]">{b.ovr} OVR</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-black/75 px-2 py-2 shadow-xl backdrop-blur-md">
        <div className="flex overflow-hidden rounded-lg border border-white/20" role="group" aria-label="Simulation speed">
          {([1, 2] as ManagerSpeed[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => onSpeed(s)}
              className="tnum px-3 py-1.5 font-display text-base font-bold"
              style={{
                background: speed === s ? 'var(--accent)' : 'transparent',
                color: speed === s ? '#0a120c' : 'rgba(255,255,255,0.8)',
              }}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Team mentality">
          {MENTALITY_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mentality === m}
              onClick={() => onMentality(m)}
              className="rounded-full border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                borderColor: mentality === m ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                background: mentality === m ? 'var(--accent-dim)' : 'transparent',
                color: mentality === m ? 'var(--accent)' : 'rgba(255,255,255,0.75)',
              }}
            >
              {MENTALITY_SHORT[m]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            aria-pressed={panel === 'TACTICS'}
            onClick={() => setPanel(panel === 'TACTICS' ? null : 'TACTICS')}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white"
          >
            Tactics
          </button>
          <button
            type="button"
            aria-pressed={panel === 'SUBS'}
            onClick={() => setPanel(panel === 'SUBS' ? null : 'SUBS')}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white"
          >
            Subs {subsUsed}/{maxSubs}
          </button>
        </div>
      </div>
    </div>
  );
}
