// Striker FC — ui/hud/TutorialOverlay.tsx (Addendum 1)
// The guided tutorial: eight coach-mark steps over a live match, each
// completed by the REAL action — a pass is a pass the engine counted, a
// shot is a shot on the stats sheet, a free kick is a free kick the
// rules engine actually awarded. Skip is always one tap away.

import { useEffect, useRef, useState } from 'react';
import type { GameAction, InputManager } from '../../controls/InputManager';
import { t } from '../../i18n/i18n';

export interface TutorialSnapshot {
  passes: number;
  shots: number;
  tackles: number;
  matchState: string | null;
}

interface Step {
  id: string;
  titleKey: string;
  coachKey: string;
  done: (s: TutorialSnapshot, a: TutorialActivity) => boolean;
}

interface TutorialActivity {
  movedSec: number;
  sprintSec: number;
  throughSeen: boolean;
  skillSeen: boolean;
}

const STEPS: Step[] = [
  {
    id: 'move', titleKey: 'tut.moveT', coachKey: 'tut.moveC',
    done: (_s, a) => a.movedSec >= 1,
  },
  {
    id: 'pass', titleKey: 'tut.passT', coachKey: 'tut.passC',
    done: (s) => s.passes >= 1,
  },
  {
    id: 'through', titleKey: 'tut.throughT', coachKey: 'tut.throughC',
    done: (_s, a) => a.throughSeen,
  },
  {
    id: 'shoot', titleKey: 'tut.shootT', coachKey: 'tut.shootC',
    done: (s) => s.shots >= 1,
  },
  {
    id: 'sprint', titleKey: 'tut.sprintT', coachKey: 'tut.sprintC',
    done: (_s, a) => a.sprintSec >= 0.8,
  },
  {
    id: 'tackle', titleKey: 'tut.tackleT', coachKey: 'tut.tackleC',
    done: (s) => s.tackles >= 1,
  },
  {
    id: 'skill', titleKey: 'tut.skillT', coachKey: 'tut.skillC',
    done: (_s, a) => a.skillSeen,
  },
  {
    id: 'freekick', titleKey: 'tut.freekickT', coachKey: 'tut.freekickC',
    done: (s) => s.matchState === 'FREE_KICK' || s.matchState === 'PENALTY_KICK',
  },
];

export function TutorialOverlay({
  input, getSnapshot, onFinish,
}: {
  input: InputManager;
  getSnapshot: () => TutorialSnapshot;
  onFinish: (completed: boolean) => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const activityRef = useRef<TutorialActivity>({ movedSec: 0, sprintSec: 0, throughSeen: false, skillSeen: false });
  const baseRef = useRef<TutorialSnapshot | null>(null);

  useEffect(() => {
    baseRef.current = getSnapshot();
    const off = input.onAction((a: GameAction) => {
      if (a.kind === 'THROUGH') activityRef.current.throughSeen = true;
      if (a.kind === 'SKILL') activityRef.current.skillSeen = true;
    });
    const id = window.setInterval(() => {
      const mv = input.moveVector();
      if (mv.magnitude > 0.25) activityRef.current.movedSec += 0.2;
      if (mv.magnitude > 0.25 && input.sprintTouch) activityRef.current.sprintSec += 0.2;
      const base = baseRef.current;
      const now = getSnapshot();
      if (!base) return;
      const rel: TutorialSnapshot = {
        passes: now.passes - base.passes,
        shots: now.shots - base.shots,
        tackles: now.tackles - base.tackles,
        matchState: now.matchState,
      };
      setStepIdx((idx) => {
        let next = idx;
        while (next < STEPS.length && STEPS[next]!.done(rel, activityRef.current)) next += 1;
        if (next >= STEPS.length) {
          window.clearInterval(id);
          setFinished(true);
        }
        return next;
      });
    }, 200);
    return () => { off(); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const step = STEPS[Math.min(stepIdx, STEPS.length - 1)]!;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center px-3" aria-live="polite">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[var(--gold)]/60 bg-[#070d1d]/92 p-3.5 shadow-2xl backdrop-blur">
        {finished ? (
          <>
            <p className="font-display text-xl font-bold uppercase tracking-wide text-[var(--gold)]">{t('tut.complete')}</p>
            <p className="mt-1 text-sm text-white/80">
              {t('tut.completeBody')}
            </p>
            <button
              type="button"
              onClick={() => onFinish(true)}
              className="font-display mt-3 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-lg font-bold uppercase tracking-wider text-[#0a120c]"
            >
              {t('tut.backToLobby')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="tnum text-[11px] font-black uppercase tracking-[0.22em] text-[var(--gold)]">
                {t('tut.stepOf', { n: stepIdx + 1, total: STEPS.length })}
              </p>
              <button
                type="button"
                onClick={() => onFinish(false)}
                className="rounded-lg border border-white/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white/75"
              >
                {t('tut.skip')}
              </button>
            </div>
            <p className="font-display mt-1 text-2xl font-bold uppercase leading-none tracking-wide text-white">{t(step.titleKey)}</p>
            <p className="mt-1 text-sm leading-snug text-white/80">{t(step.coachKey)}</p>
            <div className="mt-2.5 flex gap-1" aria-hidden>
              {STEPS.map((s, i) => (
                <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i < stepIdx ? 'bg-[var(--accent)]' : i === stepIdx ? 'bg-[var(--gold)]' : 'bg-white/15'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
