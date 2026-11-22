// Striker FC — ui/screens/BootFlowScreens.tsx
// The professional front door: Splash (brand + creator credit) → Loading
// (progress tied to the real save-profile load) → Login as Guest → Lobby.
// No passwords, no fake accounts: the guest tap enters the game and the club
// keeps living in the on-device save (with Cloud Save backup in Settings).

import { useEffect, useRef, useState } from 'react';
import { getAllPlayers, getPlayerById } from '../../data/PlayerDatabase';
import { ALL_CLUBS } from '../../data/Clubs';
import { getNationalTeams } from '../../data/NationalTeams';
import { t } from '../../i18n/i18n';

function PitchMark({ size = 74 }: { size?: number }) {
  // A floodlit pitch seen from above, drawn in pure SVG strokes.
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Striker FC pitch mark">
      <rect x="6" y="14" width="88" height="72" rx="4" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <line x1="50" y1="14" x2="50" y2="86" stroke="var(--accent)" strokeWidth="2" opacity="0.7" />
      <circle cx="50" cy="50" r="11" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.7" />
      <circle cx="50" cy="50" r="2.6" fill="var(--gold)" />
      <rect x="6" y="32" width="12" height="36" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.7" />
      <rect x="82" y="32" width="12" height="36" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.7" />
    </svg>
  );
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  // The callback is held in a ref and the timer effect runs exactly once:
  // App re-renders at 20Hz (HUD store), so an effect keyed on the inline
  // onDone prop would reset this timer on every render and the splash would
  // never auto-advance.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDoneRef.current(); }
    }, 2100);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      type="button"
      aria-label="Continue to loading"
      onClick={() => { if (!doneRef.current) { doneRef.current = true; onDone(); } }}
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #14301c 0%, #0a1a33 45%, var(--bg) 78%)' }}
    >
      <PitchMark />
      <span className="font-display text-6xl font-bold uppercase leading-none tracking-wide text-[var(--text)] sm:text-7xl">
        Striker <span className="text-[var(--accent)]">FC</span>
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--dim)]">
        3D Football · Ultimate Team
      </span>
      <span className="mt-10 font-display text-2xl font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
        Made by Jihad
      </span>
      <span className="mt-2 animate-pulse text-[11px] font-semibold uppercase tracking-widest text-[var(--dim)]">
        Tap to continue
      </span>
    </button>
  );
}

const LOAD_STAGES = [
  `Loading player database — ${getAllPlayers().length} players · ${ALL_CLUBS.length} clubs · ${getNationalTeams().length} national teams`,
  'Loading your club, squad & wallet',
  'Preparing the stadium — pitch, crowd & floodlights',
];

const LOAD_TIPS = [
  'Tip: hold SHOOT to charge the power ring, release at the top for a driven finish.',
  'Tip: finesse shots curl with real Magnus physics — aim wide of the keeper.',
  'Tip: train your captain in My Team — upgrades carry straight into matches.',
  'Tip: the Daily Free Pack refreshes every 24 hours in the Store.',
];

export function LoadingScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const startedRef = useRef(Date.now());
  const doneRef = useRef(false);
  // Epic P0-1: a featured Legend rotates on the loading screen — the stars
  // are the face of the game from the very first seconds.
  const [legendIdx, setLegendIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setLegendIdx((i) => (i + 1) % 4), 1300);
    return () => window.clearInterval(id);
  }, []);
  const featured = getPlayerById(['rw_messi', 'rw_ronaldo', 'rw_mbappe', 'rw_maradona'][legendIdx] ?? 'rw_messi');

  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => {
        // Real gate: the bar parks at 88% until the save profile has actually
        // loaded from storage, then completes. A 6s failsafe means a storage
        // hiccup can never trap the player on this screen.
        const failsafe = Date.now() - startedRef.current > 6000;
        const cap = ready || failsafe ? 100 : 88;
        const step = p < 45 ? 3.2 : p < 75 ? 2.1 : 1.2;
        return Math.min(cap, p + step);
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [ready]);

  // Completion fires once when the bar first reaches 100%. Keyed only on
  // the boolean flip (and calling through a ref) so App's 20Hz re-renders
  // cannot clear the pending transition timer — with [progress, onDone]
  // deps the cleanup killed it every 50ms and this screen hung at 100%.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const complete = progress >= 100;
  useEffect(() => {
    if (!complete || doneRef.current) return;
    doneRef.current = true;
    const t = window.setTimeout(() => onDoneRef.current(), 320);
    return () => window.clearTimeout(t);
  }, [complete]);

  const stage = progress < 40 ? LOAD_STAGES[0]! : progress < 80 ? LOAD_STAGES[1]! : LOAD_STAGES[2]!;
  const tip = LOAD_TIPS[Math.floor(progress / 28) % LOAD_TIPS.length]!;

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-6 text-center" role="status" aria-label="Loading Striker FC">
      <PitchMark size={54} />
      <p className="font-display text-4xl font-bold uppercase tracking-wide">
        Striker <span className="text-[var(--accent)]">FC</span>
      </p>
      <div className="w-full max-w-sm">
        <div className="h-3 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-100"
            style={{ width: `${Math.floor(progress)}%` }}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-left text-xs font-semibold text-[var(--dim)]">{stage}</p>
          <p className="tnum font-display text-xl font-bold text-[var(--accent)]">{Math.floor(progress)}%</p>
        </div>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--dim)]">{tip}</p>
      {featured && (
        <p className="tnum rounded-full border border-[var(--gold)]/50 bg-black/40 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-widest text-[var(--gold)]">
          ★ Legend · {featured.name} · {featured.baseOvr} OVR
        </p>
      )}
    </div>
  );
}

export function LoginScreen({
  clubName, managerName, onGuest,
}: {
  clubName: string;
  managerName: string;
  onGuest: () => void;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <PitchMark size={60} />
      <div>
        <p className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
          Striker <span className="text-[var(--accent)]">FC</span>
        </p>
        <p className="mt-3 text-sm text-[var(--dim)]">
          Welcome back{managerName && managerName !== 'Manager' ? `, ${managerName}` : ', Manager'} —{' '}
          <span className="font-semibold text-[var(--text)]">{clubName}</span> is ready for matchday.
        </p>
      </div>
      <button
        type="button"
        onClick={onGuest}
        className="w-full max-w-sm rounded-xl bg-[var(--accent)] px-6 py-4 font-display text-2xl font-bold uppercase tracking-widest text-[#0a120c] shadow-lg"
      >
        {t('boot.loginGuest')}
      </button>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--dim)]">
        Tap to continue — no password, no sign-up. Your club, squad and wallet are saved on this
        device, and you can back them up or move them to the Android app from Settings → Cloud Save.
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--dim)]">Made by Jihad</p>
    </div>
  );
}
