// Striker FC — ui/hud/SetPieceHUD.tsx (Phase 05)
// On-screen prompts and aiming overlays for set pieces: free kicks (wall +
// trajectory), corners, throw-ins, goal kicks, penalty kicks (drag reticle
// when attacking, 6-zone dive picker when defending), the VAR offside check,
// the advantage badge, card banners, the slow-mo replay skip control and
// the penalty-shootout score strip.

import { useRef, useState } from 'react';
import type { MatchView } from '../../rules/MatchEngine';

export interface SetPieceHudCallbacks {
  onPenaltyAim: (aimZ: number, aimY: number) => void;
  onConfirmPenalty: () => void;
  onDive: (z: number, high: boolean) => void;
  onSkipReplay: () => void;
}

/** Penalty goal-frame reticle: drag anywhere on the frame to place the shot. */
function PenaltyReticle({
  aimZ, aimY, onAim, onConfirm,
}: {
  aimZ: number; aimY: number;
  onAim: (z: number, y: number) => void;
  onConfirm: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [heldSec, setHeldSec] = useState(0);
  const danger = heldSec > 2.6;

  const placeFromEvent = (clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); // 0 = left post
    const ny = Math.max(0, Math.min(1, (clientY - r.top) / r.height)); // 0 = crossbar
    onAim((nx * 2 - 1) * 3.55, (1 - ny) * 2.3 + 0.15);
  };

  // Reticle position as % inside the frame (goal mouth 7.32 x 2.44).
  const leftPct = ((aimZ / 3.66) * 0.5 + 0.5) * 100;
  const topPct = (1 - Math.max(0, Math.min(1, (aimY - 0.11) / 2.44))) * 100;

  return (
    <div className="pointer-events-auto w-[min(92vw,430px)] rounded-xl border border-white/20 bg-black/75 p-3 backdrop-blur-sm">
      <p className="font-display text-base font-bold uppercase tracking-widest text-[var(--gold)]">
        Penalty — place your shot
      </p>
      <p className="mt-0.5 text-[11px] text-white/70">
        Drag the reticle inside the goal frame. Corners score — but miss the frame and it is gone.
        {danger ? ' Strike now — the reticle is drifting!' : ''}
      </p>
      <div
        ref={frameRef}
        role="slider"
        aria-label="Penalty aim reticle"
        aria-valuetext={`Aim ${aimZ.toFixed(1)} metres across, ${aimY.toFixed(1)} metres high`}
        tabIndex={0}
        className="relative mt-2 h-36 w-full touch-none select-none overflow-hidden rounded-md border-4 border-white/85 bg-gradient-to-b from-sky-950/60 to-emerald-950/70"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setHeldSec(0);
          placeFromEvent(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) {
            setHeldSec((s) => s + 0.016);
            placeFromEvent(e.clientX, e.clientY);
          }
        }}
        onKeyDown={(e) => {
          const dz = e.key === 'ArrowLeft' ? -0.3 : e.key === 'ArrowRight' ? 0.3 : 0;
          const dy = e.key === 'ArrowUp' ? 0.2 : e.key === 'ArrowDown' ? -0.2 : 0;
          if (dz !== 0 || dy !== 0) {
            e.preventDefault();
            onAim(aimZ + dz, aimY + dy);
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        {/* Goal frame posts */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/50" />
        <div
          aria-hidden
          className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
          style={{
            left: `${leftPct}%`, top: `${topPct}%`,
            borderColor: danger ? '#ef4444' : 'var(--gold)',
            boxShadow: '0 0 10px rgba(0,0,0,0.8)',
          }}
        >
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" style={{ color: danger ? '#ef4444' : 'var(--gold)' }} />
        </div>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-2 w-full rounded-lg bg-[var(--danger)] px-3 py-2 font-display text-lg font-bold uppercase tracking-widest text-white"
      >
        Strike penalty
      </button>
    </div>
  );
}

/** Defending a penalty: pick one of 6 dive zones (column x height). */
function DivePicker({ onDive }: { onDive: (z: number, high: boolean) => void }) {
  const cols: { label: string; z: number }[] = [
    { label: 'Left', z: -2.3 },
    { label: 'Center', z: 0 },
    { label: 'Right', z: 2.3 },
  ];
  return (
    <div className="pointer-events-auto w-[min(92vw,430px)] rounded-xl border border-white/20 bg-black/75 p-3 backdrop-blur-sm">
      <p className="font-display text-base font-bold uppercase tracking-widest text-sky-300">
        Penalty against you — pick the dive
      </p>
      <p className="mt-0.5 text-[11px] text-white/70">Swipe a zone: your keeper commits the moment the kick is struck.</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {cols.map((c) => (
          <button
            key={`high-${c.label}`}
            type="button"
            aria-label={`Dive ${c.label} high`}
            onClick={() => onDive(c.z, true)}
            className="rounded-lg border border-sky-300/50 px-2 py-2 text-xs font-bold text-sky-200"
          >
            {c.label} · High
          </button>
        ))}
        {cols.map((c) => (
          <button
            key={`low-${c.label}`}
            type="button"
            aria-label={`Dive ${c.label} low`}
            onClick={() => onDive(c.z, false)}
            className="rounded-lg border border-sky-300/50 px-2 py-2 text-xs font-bold text-sky-200"
          >
            {c.label} · Low
          </button>
        ))}
      </div>
    </div>
  );
}

export function SetPieceHUD({ view, callbacks }: { view: MatchView; callbacks: SetPieceHudCallbacks }) {
  const so = view.shootout;
  // Phase 06: the clock/score strip, card banners and advantage/VAR badges now
  // live in the broadcast MatchHUD — this layer keeps only set-piece prompts,
  // the shootout strip, penalty aiming and the replay skip, offset below the
  // broadcast banner zone.
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[7.25rem] z-20 flex flex-col items-center gap-2 p-2">

      {so && (view.state === 'PENALTY_SHOOTOUT' || view.state === 'FULL_TIME') && (
        <div className="tnum rounded-lg border border-white/15 bg-black/70 px-3 py-1 text-center font-display text-base font-bold tracking-wider backdrop-blur-sm" aria-label="Shootout score">
          SHOOTOUT {so.homeScore} – {so.awayScore}
          <span className="ml-2 text-xs font-semibold text-white/70">
            {so.finished ? `${so.winner} win the shootout` : so.suddenDeath ? 'Sudden death' : `Round ${so.round} of 5 · ${so.nextSide} next`}
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold tracking-normal text-white/60">
            {so.kicksTakenHome + so.kicksTakenAway > 0
              ? `Kicks: H ${so.kicksTakenHome} taken · A ${so.kicksTakenAway} taken`
              : 'Five kicks each — ABAB'}
          </span>
        </div>
      )}

      {/* Set-piece prompt bar */}
      {view.setPiecePrompt && view.state !== 'PENALTY_SHOOTOUT' && (
        <div className="max-w-[92vw] rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-center backdrop-blur-sm">
          <p className="font-display text-base font-bold uppercase tracking-widest text-[var(--accent)]">
            {view.setPieceType?.replace(/_/g, ' ')}
            {view.wallCount > 0 ? ` · ${view.wallCount}-man wall` : ''}
          </p>
          <p className="text-xs text-white/80">{view.setPiecePrompt}</p>
          {view.userTakingSetPiece && view.setPieceType !== 'PENALTY' && (
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--gold)]">
              Your taker has the ball — PASS / SHOOT with the match controls to deliver.
            </p>
          )}
          {view.setPieceType === 'FREE_KICK' && (
            <p className="mt-0.5 text-[11px] text-white/60">The dotted curve in the 3D view previews the whip over the wall.</p>
          )}
          {view.setPieceType === 'CORNER' && (
            <p className="mt-0.5 text-[11px] text-white/60">Best header attacks the cross — contest it in the box!</p>
          )}
        </div>
      )}

      {/* Penalty aiming (attacking) / dive picker (defending) */}
      {view.penalty?.userAttacking && (view.state === 'PENALTY_KICK' || view.state === 'PENALTY_SHOOTOUT') && (
        <PenaltyReticle
          aimZ={view.penalty.aimZ}
          aimY={view.penalty.aimY}
          onAim={callbacks.onPenaltyAim}
          onConfirm={callbacks.onConfirmPenalty}
        />
      )}
      {view.penalty && !view.penalty.userAttacking && view.penalty.userDefending
        && (view.state === 'PENALTY_KICK' || view.state === 'PENALTY_SHOOTOUT') && (
          <DivePicker onDive={callbacks.onDive} />
        )}

      {/* Slow-mo replay skip */}
      {view.replayActive && (
        <button
          type="button"
          onClick={callbacks.onSkipReplay}
          className="pointer-events-auto rounded-full bg-[var(--accent)] px-4 py-2 font-display text-base font-bold uppercase tracking-widest text-[#0a120c]"
        >
          {`Replay · Angle ${view.replayAngle} · 0.45x — Tap to skip`}
        </button>
      )}
    </div>
  );
}
