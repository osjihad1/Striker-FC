// Striker FC — ui/hud/TouchControlsOverlay.tsx (Phase 03, Spec 06 §5)
// FC Mobile translucent controls: floating left virtual stick + 4 labeled
// right-side action buttons with a live curved power meter and directional
// swipe preview chevrons. Attacking and defending layouts switch by context.
// All pointer handling is multi-touch safe via per-control pointerId trackers.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { InputManager, SwipeDir } from '../../controls/InputManager';
import { ButtonGestureTracker, JoystickTracker, JOYSTICK_RADIUS } from '../../controls/TouchController';
import { settingsStore, useSettingsStore } from '../../store/useSettingsStore';
import { t } from '../../i18n/i18n';
import { ALL_SKILL_MOVES } from '../../physics/SkillMoveEngine';
import type { SkillMoveId } from '../../core/types';

/** Phase 10: a short buzz on control contact when haptics are enabled. */
function buzz(ms: number): void {
  try {
    if (settingsStore.getState().hapticsOn && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {
    // vibration unsupported — controls work silently
  }
}

export type OverlayMode = 'ATTACK' | 'DEFEND';

/**
 * Epic fix round (P0-11): tap-grace window. When possession flips, the
 * ATTACK/DEFEND layout keeps the PREVIOUS layout for 150 ms — a thumb
 * already travelling to PASS does not land on TACKLE mid-press. Presses
 * inside the window dispatch exactly what the player saw and aimed at.
 */
export const TAP_GRACE_MS = 150;

interface ButtonDef {
  id: string;
  /** i18n keys — labels render in the active language. */
  labelKey: string;
  subKey: string;
  color: string;
  keyHint: string;
}

const ATTACK_BUTTONS: ButtonDef[] = [
  { id: 'PASS', labelKey: 'ctl.pass', subKey: 'ctl.passSub', color: '#38bdf8', keyHint: 'J' },
  { id: 'THROUGH', labelKey: 'ctl.through', subKey: 'ctl.throughSub', color: '#2dd4bf', keyHint: 'L' },
  { id: 'SHOOT', labelKey: 'ctl.shoot', subKey: 'ctl.shootSub', color: '#fb923c', keyHint: 'Space' },
  { id: 'SKILL', labelKey: 'ctl.skill', subKey: 'ctl.skillSub', color: '#f5c542', keyHint: 'C' },
];

const DEFEND_BUTTONS: ButtonDef[] = [
  { id: 'TACKLE', labelKey: 'ctl.tackle', subKey: 'ctl.tackleSub', color: '#38bdf8', keyHint: 'J' },
  { id: 'SLIDE', labelKey: 'ctl.slide', subKey: 'ctl.slideSub', color: '#2dd4bf', keyHint: 'K' },
  { id: 'SECOND', labelKey: 'ctl.secondDef', subKey: 'ctl.secondSub', color: '#fb923c', keyHint: 'U' },
  { id: 'SWITCH', labelKey: 'ctl.switch', subKey: 'ctl.switchSub', color: '#f5c542', keyHint: 'Tab' },
];

function powerColor(p: number): string {
  if (p > 0.92) return '#ef4444';
  if (p > 0.62) return '#facc15';
  return '#a3e635';
}

export function TouchControlsOverlay({ input, mode }: { input: InputManager; mode: OverlayMode }) {
  const joystickRef = useRef(new JoystickTracker());
  const trackersRef = useRef<Record<string, ButtonGestureTracker>>({});
  const [, setFrame] = useState(0);
  const rafRef = useRef(0);
  // Epic P0-6: SPRINT is its own button now (it was fused into SKILL /
  // TACKLE, so you could not sprint without also tackling or tricking).
  const [sprintHeld, setSprintHeld] = useState(false);
  // DEFEND big-circle: a short tap switches player, a hold sprints.
  const sprintTapAtRef = useRef(0);
  // Epic P0-6: long-pressing SKILL (≥350 ms) opens the six-move wheel.
  const [wheelOpen, setWheelOpen] = useState(false);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelOpenedRef = useRef(false);
  // Phase 10 control settings: mirrored layout + button size, live from the store.
  const joystickSide = useSettingsStore((s) => s.joystickSide);
  const buttonScale = useSettingsStore((s) => s.buttonScale);
  const controlsOpacity = useSettingsStore((s) => s.controlsOpacity);
  // Cycle-2: language subscription so the button labels re-render in বাংলা.
  useSettingsStore((s) => s.language);
  // Cycle-2 match-up: TACKLE held in the DEFEND layout = contain.
  const [matchUpHeldUi, setMatchUpHeldUi] = useState(false);
  const stickOnRight = joystickSide === 'RIGHT';

  // Repaint while any control is active so the power ring / chevrons stay live.
  // P0-6: this loop also owns the stick's output — the raw tracker vector
  // is smoothed with a ~90 ms time constant (no jitter, no snap), and on
  // release the vector glides to zero over ~120 ms instead of cutting out.
  const smoothVecRef = useRef({ x: 0, y: 0, lastMs: 0 });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const sm = smoothVecRef.current;
      const dt = Math.min(0.05, Math.max(0.001, (now - (sm.lastMs || now)) / 1000));
      sm.lastMs = now;
      const st = joystickRef.current.state;
      const tx = st.active ? st.vecX : 0;
      const ty = st.active ? st.vecY : 0;
      const tau = st.active ? 0.09 : 0.12;
      const k = 1 - Math.exp(-dt / tau);
      sm.x += (tx - sm.x) * k;
      sm.y += (ty - sm.y) * k;
      if (!st.active && Math.hypot(sm.x, sm.y) < 0.02) { sm.x = 0; sm.y = 0; }
      input.setJoystick(sm.x, sm.y, st.active || sm.x !== 0 || sm.y !== 0);
      const joy = st.active;
      const anyButton = Object.values(trackersRef.current).some((t) => t.dragging);
      const anyCharge = ['PASS', 'THROUGH', 'SHOOT'].some((id) => input.isCharging(id));
      if (joy || anyButton || anyCharge) setFrame((f) => f + 1);
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [input]);

  // P0-11 tap grace: the rendered (and dispatching) layout lags a mode
  // flip by TAP_GRACE_MS, so an in-flight press keeps its old meaning.
  const [renderMode, setRenderMode] = useState<OverlayMode>(mode);
  useEffect(() => {
    if (mode === renderMode) return;
    const t = window.setTimeout(() => setRenderMode(mode), TAP_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [mode, renderMode]);
  const buttons = renderMode === 'ATTACK' ? ATTACK_BUTTONS : DEFEND_BUTTONS;
  const joy = joystickRef.current.state;
  const showKeyHints = input.lastSource === 'KEYBOARD' || input.lastSource === 'GAMEPAD';

  const trackerFor = (id: string): ButtonGestureTracker => {
    let t = trackersRef.current[id];
    if (!t) { t = new ButtonGestureTracker(); trackersRef.current[id] = t; }
    return t;
  };

  // --- Joystick pointer handlers (left zone) ---------------------------------
  const joyDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (joystickRef.current.onDown(e.pointerId, e.clientX - rect.left, e.clientY - rect.top)) {
      buzz(8);
      e.currentTarget.setPointerCapture(e.pointerId);
      const s = joystickRef.current.state;
      input.faceUpDribble = s.faceUpDribble;
      setFrame((f) => f + 1);
    }
  };
  const joyMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    joystickRef.current.onMove(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
    // The rAF loop reads the tracker and feeds the engine the smoothed vector.
  };
  const joyUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only the finger that owns the stick may release it — a stray second
    // touch landing in the zone must not zero the move vector mid-dribble.
    // The vector itself glides to zero in the rAF loop (~120 ms).
    const wasOwner = joystickRef.current.state.pointerId === e.pointerId;
    joystickRef.current.onUp(e.pointerId);
    if (wasOwner) input.faceUpDribble = false;
    setFrame((f) => f + 1);
  };

  // --- Action button handlers ---------------------------------------------------
  const btnDown = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const t = trackerFor(id);
    if (t.onDown(e.pointerId, e.clientX, e.clientY)) {
      buzz(8);
      e.currentTarget.setPointerCapture(e.pointerId);
      // Cycle-2 match-up defending: holding TACKLE (DEFEND layout) tells
      // the engine to contain the carrier at 0.9 m until release.
      if (id === 'TACKLE' && renderMode === 'DEFEND') {
        input.matchUpHeld = true;
        setMatchUpHeldUi(true);
      }
      if (id === 'SKILL') {
        wheelOpenedRef.current = false;
        if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = window.setTimeout(() => {
          wheelOpenedRef.current = true;
          setWheelOpen(true);
          buzz(14);
        }, 350);
      } else if (id !== 'TACKLE') input.startCharge(id);
      setFrame((f) => f + 1);
    }
  };
  const btnMove = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    trackerFor(id).onMove(e.pointerId, e.clientX, e.clientY);
  };
  const btnUp = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const t = trackerFor(id);
    const gesture = t.onUp(e.pointerId);
    // A release from a finger that never owned this button (a second touch
    // brushing the cluster) is not a command: it must not cancel the real
    // finger's charge or drop its sprint.
    if (!gesture) return;
    if (id === 'TACKLE') {
      input.matchUpHeld = false;
      setMatchUpHeldUi(false);
    }
    if (id === 'SKILL') {
      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
      // The wheel took this press — releasing must not also fire a move.
      if (wheelOpenedRef.current) { wheelOpenedRef.current = false; return; }
    }
    const power = input.isCharging(id) ? input.endCharge(id) : 0.55;
    dispatchButton(input, renderMode, id, gesture.kind, gesture.dir, power);
    setFrame((f) => f + 1);
  };
  const btnCancel = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const t = trackerFor(id);
    const wasOwner = t.pointerId === e.pointerId;
    t.onCancel(e.pointerId);
    if (!wasOwner) return;
    if (id === 'TACKLE') {
      input.matchUpHeld = false;
      setMatchUpHeldUi(false);
    }
    if (id === 'SKILL' && wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
    input.cancelCharge(id);
  };

  // --- SPRINT button (its own control, hold to sprint) ----------------------
  const sprintDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    input.sprintTouch = true;
    setSprintHeld(true);
    buzz(8);
  };
  const sprintUp = () => {
    input.sprintTouch = false;
    setSprintHeld(false);
  };

  const pickSkill = (moveId: SkillMoveId) => {
    setWheelOpen(false);
    input.emit({ kind: 'SKILL', moveId, lateralSign: 1 });
    buzz(12);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none" style={{ opacity: controlsOpacity }} aria-label="Touch controls">
      {/* Floating joystick zone (45% of the screen, lower area) — side follows
          Settings → Joystick layout; inset clears phone camera notches. */}
      <div
        className={`pointer-events-auto absolute bottom-0 h-[62%] w-[45%] touch-none ${stickOnRight ? 'right-0' : 'left-0'}`}
        style={stickOnRight
          ? { paddingRight: 'env(safe-area-inset-right, 0px)' }
          : { paddingLeft: 'env(safe-area-inset-left, 0px)' }}
        role="application"
        aria-label="Virtual joystick — drag to move the controlled player"
        onPointerDown={joyDown}
        onPointerMove={joyMove}
        onPointerUp={joyUp}
        onPointerCancel={joyUp}
      >
        {joy.active && (
          <div
            className="absolute rounded-full border-2 border-white/50 bg-black/35"
            style={{
              width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2,
              left: joy.originX - JOYSTICK_RADIUS, top: joy.originY - JOYSTICK_RADIUS,
              transform: 'translate(0,0)', position: 'absolute',
            }}
          >
            <div
              className="absolute rounded-full bg-white shadow-lg"
              style={{
                width: 52, height: 52,
                left: JOYSTICK_RADIUS - 26 + joy.dx,
                top: JOYSTICK_RADIUS - 26 + joy.dy,
              }}
            />
          </div>
        )}
        {!joy.active && (
          /* Persistent home stick (bible §2.13): a solid white stick on a
             dark disc, always visible at its fixed home position. */
          <div
            aria-hidden
            className={`absolute bottom-6 flex items-center justify-center rounded-full border border-white/30 bg-black/45 shadow-lg ${stickOnRight ? 'right-6' : 'left-6'}`}
            style={{ width: 108, height: 108 }}
          >
            <div className="rounded-full bg-white shadow" style={{ width: 52, height: 52 }} />
            <span className="sr-only">{t('ctl.move')}</span>
          </div>
        )}
        {joy.active && joy.zone === 'FAST' && (
          <span className={`absolute bottom-3 rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] ${stickOnRight ? 'right-6' : 'left-6'}`}>
            {t('ctl.fastDribble')}
          </span>
        )}
        {joy.active && joy.faceUpDribble && (
          <span className={`absolute bottom-9 rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-300 ${stickOnRight ? 'right-6' : 'left-6'}`}>
            {t('ctl.faceUp')}
          </span>
        )}
      </div>

      {/* Action cluster — FC Mobile geometry (visual bible §2.13): four
          large dark circles in a triangle, thin coloured rims, ONE bold
          white word each, no sub-labels. The biggest circle (bottom-right)
          merges SPRINT & SKILL: hold = sprint, tap = skill move,
          long-press = skill wheel, swipe = directional skill. In the
          DEFEND layout the big circle is SPRINT (tap = switch player). */}
      <div
        className="absolute"
        style={{
          width: Math.round(238 * buttonScale),
          height: Math.round(218 * buttonScale),
          bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          ...(stickOnRight
            ? { left: 'calc(12px + env(safe-area-inset-left, 0px))' }
            : { right: 'calc(12px + env(safe-area-inset-right, 0px))' }),
        }}
      >
        {buttons.filter((b) => b.id !== 'SKILL' && b.id !== 'SWITCH').map((b) => {
          const tracker = trackersRef.current[b.id];
          const power = input.chargePower(b.id);
          const charging = input.isCharging(b.id);
          const swipe = tracker?.previewDir() ?? null;
          const size = Math.round((b.id === 'SHOOT' || b.id === 'SLIDE' || b.id === 'TACKLE' ? 88 : b.id === 'PASS' ? 84 : 76) * buttonScale);
          const pos: Record<string, string | number> = b.id === 'THROUGH' || b.id === 'SECOND'
            ? { left: 0, top: 0 }
            : b.id === 'SHOOT' || b.id === 'SLIDE'
              ? { right: 0, top: 0 }
              : { left: Math.round(8 * buttonScale), bottom: 0 };
          const ring = 2 * Math.PI * 33;
          const label = b.id === 'TACKLE' && matchUpHeldUi ? t('ctl.matchUp') : t(b.labelKey);
          const sub = b.id === 'TACKLE' && matchUpHeldUi ? t('ctl.contain') : t(b.subKey);
          return (
            <button
              key={b.id}
              type="button"
              aria-label={`${label} button — ${sub}`}
              className="pointer-events-auto absolute flex touch-none flex-col items-center justify-center rounded-full border-2 backdrop-blur-[2px]"
              style={{
                width: size, height: size, ...pos,
                borderColor: b.color,
                background: 'rgba(8,12,8,0.60)',
                boxShadow: charging ? `0 0 0 2px ${powerColor(power)} inset` : '0 4px 14px rgba(0,0,0,0.45)',
              }}
              onPointerDown={btnDown(b.id)}
              onPointerMove={btnMove(b.id)}
              onPointerUp={btnUp(b.id)}
              onPointerCancel={btnCancel(b.id)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <svg className="pointer-events-none absolute inset-0 m-auto" width={size} height={size} viewBox="0 0 76 76" aria-hidden>
                {charging && (
                  <circle
                    cx="38" cy="38" r="34.5" fill="none"
                    stroke={powerColor(power)} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={ring}
                    strokeDashoffset={ring * (1 - power)}
                    transform="rotate(-90 38 38)"
                  />
                )}
              </svg>
              <span className="font-display pointer-events-none px-1 text-center text-[14px] font-bold uppercase leading-none tracking-wide text-white">
                {label}
              </span>
              {charging && (
                <span className="tnum pointer-events-none mt-1 text-[11px] font-bold" style={{ color: powerColor(power) }}>
                  {Math.round(power * 100)}%
                </span>
              )}
              {swipe && (
                <span aria-hidden className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {swipe === 'UP' ? '▲' : swipe === 'DOWN' ? '▼' : swipe === 'LEFT' ? '◀' : '▶'}
                </span>
              )}
              {showKeyHints && (
                <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-white/15 px-1 text-[8px] font-bold text-white/75">
                  {b.keyHint}
                </span>
              )}
            </button>
          );
        })}
        {/* The big merged circle, bottom-right */}
        {renderMode === 'ATTACK' ? (
          <button
            type="button"
            aria-label={`${t('ctl.sprint')} & ${t('ctl.skill')} button — hold to sprint, tap for a skill move, long-press for the skill wheel`}
            aria-pressed={sprintHeld}
            className="pointer-events-auto absolute bottom-0 right-0 flex touch-none flex-col items-center justify-center rounded-full border-2 backdrop-blur-[2px]"
            style={{
              width: Math.round(102 * buttonScale), height: Math.round(102 * buttonScale),
              borderColor: '#a3e635',
              background: sprintHeld ? 'rgba(163,230,53,0.38)' : 'rgba(8,12,8,0.60)',
              boxShadow: sprintHeld ? '0 0 0 2px #a3e635 inset' : '0 4px 14px rgba(0,0,0,0.45)',
            }}
            onPointerDown={(e) => { btnDown('SKILL')(e); input.sprintTouch = true; setSprintHeld(true); }}
            onPointerMove={btnMove('SKILL')}
            onPointerUp={(e) => { btnUp('SKILL')(e); input.sprintTouch = false; setSprintHeld(false); }}
            onPointerCancel={(e) => { btnCancel('SKILL')(e); input.sprintTouch = false; setSprintHeld(false); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="font-display pointer-events-none text-center text-[15px] font-bold uppercase leading-[1.05] tracking-wide text-white">
              {t('ctl.sprint')}<br />&amp; {t('ctl.skill')}
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label={`${t('ctl.sprint')} button — hold to sprint, tap to switch player`}
            aria-pressed={sprintHeld}
            className="pointer-events-auto absolute bottom-0 right-0 flex touch-none flex-col items-center justify-center rounded-full border-2 backdrop-blur-[2px]"
            style={{
              width: Math.round(102 * buttonScale), height: Math.round(102 * buttonScale),
              borderColor: '#a3e635',
              background: sprintHeld ? 'rgba(163,230,53,0.38)' : 'rgba(8,12,8,0.60)',
              boxShadow: sprintHeld ? '0 0 0 2px #a3e635 inset' : '0 4px 14px rgba(0,0,0,0.45)',
            }}
            onPointerDown={(e) => { sprintDown(e); sprintTapAtRef.current = performance.now(); }}
            onPointerUp={() => {
              if (performance.now() - sprintTapAtRef.current < 280) input.emit({ kind: 'SWITCH', dir: null });
              sprintUp();
            }}
            onPointerCancel={sprintUp}
            onPointerLeave={sprintUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="font-display pointer-events-none text-center text-[15px] font-bold uppercase leading-[1.05] tracking-wide text-white">
              {t('ctl.sprint')}
            </span>
            <span className="pointer-events-none mt-0.5 px-1 text-center text-[8px] font-bold uppercase tracking-wider text-white/65">
              {t('ctl.tapSwitch')}
            </span>
          </button>
        )}
      </div>

      {/* Epic P0-6: the skill wheel — all six moves, star costs shown; the
          engine refuses a move the carrier's stars don't unlock. */}
      {wheelOpen && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-black/45 pb-40" role="dialog" aria-label="Skill moves">
          <div className="w-[86%] max-w-[340px] rounded-2xl border border-[var(--gold)]/60 bg-[#0a0f1e]/95 p-3 shadow-2xl">
            <p className="font-display text-center text-lg font-bold uppercase tracking-widest text-[var(--gold)]">{t('ctl.skillMoves')}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ALL_SKILL_MOVES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickSkill(m.id)}
                  className="rounded-xl border border-white/20 bg-white/8 px-2.5 py-2.5 text-left"
                  aria-label={`${m.name} — needs ${m.stars} star skill moves`}
                >
                  <span className="block text-[13px] font-bold text-white">{m.name}</span>
                  <span className="tnum block text-[10.5px] font-semibold text-[var(--gold)]">{'★'.repeat(m.stars)} · {m.cooldownSec.toFixed(1)}s cooldown</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setWheelOpen(false)}
              className="mt-2.5 w-full rounded-xl border border-white/25 px-3 py-2 text-[13px] font-bold uppercase tracking-widest text-white/80"
            >
              {t('ctl.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function dispatchButton(
  input: InputManager,
  mode: OverlayMode,
  id: string,
  kindIn: 'TAP' | 'HOLD_RELEASE' | 'SWIPE',
  dirIn: SwipeDir | null,
  power: number,
): void {
  // P0-6: the Control Scheme setting is real — CLASSIC treats every swipe
  // as a plain tap (buttons only, like the old games); SWIPE keeps taps on
  // the default action with variants only by swipe; HYBRID is the blend
  // below. (Tap = default already, so CLASSIC is the one that changes.)
  const scheme = settingsStore.getState().controlScheme;
  const kind = scheme === 'CLASSIC_BUTTONS' && kindIn === 'SWIPE' ? 'TAP' : kindIn;
  const dir = scheme === 'CLASSIC_BUTTONS' ? null : dirIn;
  if (mode === 'ATTACK') {
    switch (id) {
      case 'PASS':
        if (kind === 'SWIPE' && dir === 'UP') input.emit({ kind: 'PASS', passType: 'LOB', power });
        else if (kind === 'SWIPE' && dir === 'RIGHT') input.emit({ kind: 'PASS', passType: 'DRIVEN', power });
        else if (kind === 'SWIPE' && dir === 'DOWN') input.emit({ kind: 'PASS', passType: 'PASS_AND_GO', power });
        else input.emit({ kind: 'PASS', passType: 'GROUND', power });
        break;
      case 'THROUGH':
        if (kind === 'SWIPE' && dir === 'UP') input.emit({ kind: 'THROUGH', passType: 'LOB_THROUGH', power });
        else if (kind === 'SWIPE' && dir === 'DOWN') input.emit({ kind: 'TRIGGER_RUN' });
        else input.emit({ kind: 'THROUGH', passType: 'THROUGH', power });
        break;
      case 'SHOOT':
        if (kind === 'SWIPE' && dir === 'DOWN') input.emit({ kind: 'SHOOT', shotType: 'FINESSE', power: Math.max(0.55, power) });
        else if (kind === 'SWIPE' && dir === 'UP') input.emit({ kind: 'SHOOT', shotType: 'CHIP', power: Math.max(0.5, power) });
        else if (kind === 'SWIPE' && dir === 'RIGHT') input.emit({ kind: 'SHOOT', shotType: 'POWER', power: Math.max(0.6, power) });
        else if (kind === 'SWIPE' && dir === 'LEFT') input.emit({ kind: 'SHOOT', shotType: 'FAKE_SHOT', power: 0.4 });
        else input.emit({ kind: 'SHOOT', shotType: 'STANDARD', power });
        break;
      case 'SKILL':
        if (kind === 'SWIPE' && dir === 'UP') input.emit({ kind: 'SKILL', moveId: 'ROULETTE', lateralSign: 1 });
        else if (kind === 'SWIPE' && dir === 'DOWN') input.emit({ kind: 'SKILL', moveId: 'HEEL_TO_HEEL', lateralSign: 1 });
        // Epic P0-6: LEFT / RIGHT set lateralSign for the two lateral moves
        // (they were unreachable — LEFT was Knock-On, RIGHT Rainbow).
        else if (kind === 'SWIPE' && dir === 'LEFT') input.emit({ kind: 'SKILL', moveId: 'BALL_ROLL', lateralSign: -1 });
        else if (kind === 'SWIPE' && dir === 'RIGHT') input.emit({ kind: 'SKILL', moveId: 'LANE_CHANGE', lateralSign: 1 });
        else if (kind === 'TAP') input.emit({ kind: 'SKILL', moveId: null, lateralSign: 1 });
        break;
      default: break;
    }
    return;
  }
  // DEFEND layout.
  switch (id) {
    case 'TACKLE':
      // A quick press tackles — including a sloppy tap that slid a few
      // pixels into a "swipe". A deliberate hold was a match-up contain:
      // its release throws the SHOULDER CHARGE instead (Cycle-2). Slide
      // tackle is untouched on its own button.
      if (kind === 'TAP' || kind === 'SWIPE') input.emit({ kind: 'TACKLE' });
      else if (kind === 'HOLD_RELEASE') input.emit({ kind: 'SHOULDER_CHARGE' });
      break;
    case 'SLIDE':
      input.emit({ kind: 'SLIDE' });
      break;
    case 'SECOND':
      if (kind === 'SWIPE' && dir === 'DOWN') input.emit({ kind: 'GK_RUSH' });
      else input.emit({ kind: 'SECOND_DEF' });
      break;
    case 'SWITCH':
      input.emit({ kind: 'SWITCH', dir: kind === 'SWIPE' ? dir : null });
      break;
    default: break;
  }
}
