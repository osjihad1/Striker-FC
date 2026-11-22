// Striker FC — ui/VideoClips.tsx
// The two real video assets (category 4 of the overnight asset build):
// a cinematic night-stadium intro that plays once on boot, and a
// crowd/fireworks clip that plays behind the goal-celebration banner.
// Both are local H.264 MP4s (1280x720, no audio track — the crowd,
// commentary and goal sting already come from the audio engines, which
// is also why muting here is a no-op today: the clips are silent by
// design, so they can never clash with the match audio or ignore mute).
// Every path is best-effort: a missing/blocked video falls back to the
// existing CSS splash / confetti theatre, never a black screen.

import { useEffect, useRef, useState } from 'react';
import introStadiumUrl from '../assets/video/intro-stadium.mp4';
import goalCelebrationUrl from '../assets/video/goal-celebration.mp4';
import { useSettingsStore } from '../store/useSettingsStore';

export function IntroVideoScreen({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finish = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDoneRef.current();
    }
  };
  const [failed, setFailed] = useState(false);
  // Reduced motion: skip the video entirely, straight to the logo splash.
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion || failed) {
      finish();
      return;
    }
    // Failsafe: a stalled video can never trap the player on boot — the
    // logo splash follows after 8s at the latest (the clip is 7s).
    const t = window.setTimeout(finish, 8000);
    return () => window.clearTimeout(t);
    // finish is ref-guarded, so the once-only effect must not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, failed]);

  if (reducedMotion || failed) return null;

  return (
    <button
      type="button"
      aria-label="Skip intro video — continue to Striker FC"
      onClick={finish}
      className="relative block h-full w-full overflow-hidden bg-black"
    >
      <video
        className="h-full w-full object-cover"
        src={introStadiumUrl}
        autoPlay
        muted
        playsInline
        preload="auto"
        ref={(el) => {
          // A rejected play() fires no error event — without this the
          // intro would sit black until the 8s failsafe. Fail fast to
          // the CSS splash instead.
          if (el) {
            const p = el.play();
            if (p && typeof p.catch === 'function') {
              p.catch(() => setFailed(true));
            }
          }
        }}
        onEnded={finish}
        onError={() => setFailed(true)}
      />
      <span className="absolute inset-x-0 bottom-[max(1.1rem,env(safe-area-inset-bottom))] text-[11px] font-semibold uppercase tracking-widest text-white/70">
        Tap to skip
      </span>
    </button>
  );
}

export function GoalCelebrationVideo() {
  // Wired to the global mute setting: the clip ships without an audio
  // track, so this is a no-op today — but if a scored mix is ever added
  // to the file, mute is honoured from the first frame.
  const muted = useSettingsStore((s) => s.muted);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <video
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
      src={goalCelebrationUrl}
      autoPlay
      muted={muted}
      loop
      playsInline
      preload="auto"
      ref={(el) => {
        if (el) {
          el.muted = muted;
          el.volume = muted ? 0 : 1;
        }
      }}
      onError={() => setFailed(true)}
    />
  );
}
