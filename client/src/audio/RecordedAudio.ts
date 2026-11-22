// Striker FC — audio/RecordedAudio.ts (Overnight asset build, audio category)
// Real recorded audio files: TTS-recorded commentary clips (British radio-
// announcer voice), synthesized crowd loops and menu music tracks. All files
// live in client/src/assets/audio/ and are imported through Vite, so they are
// bundled into the APK and play fully offline — nothing streams from a URL.
//
// Playback uses plain HTMLAudioElement instances (not the shared Web Audio
// context): they survive tab throttling better on mobile, need no unlock
// dance beyond the first user gesture, and keep the recorded voice off the
// procedural Web Speech queue. Volume always follows settingsStore
// (masterVolume / muted) at play time.

import { settingsStore } from '../store/useSettingsStore';

// ---- Commentary clips (recorded, British announcer voice) -------------------
import goal01 from '../assets/audio/commentary/goal-01.mp3';
import goal02 from '../assets/audio/commentary/goal-02.mp3';
import goal03 from '../assets/audio/commentary/goal-03.mp3';
import goalLate from '../assets/audio/commentary/goal-late.mp3';
import kickoffClip from '../assets/audio/commentary/kickoff.mp3';
import foulClip from '../assets/audio/commentary/foul.mp3';
import yellowClip from '../assets/audio/commentary/yellow.mp3';
import redClip from '../assets/audio/commentary/red.mp3';
import penaltyClip from '../assets/audio/commentary/penalty.mp3';
import offsideClip from '../assets/audio/commentary/offside.mp3';
import halftimeClip from '../assets/audio/commentary/halftime.mp3';
import fulltimeClip from '../assets/audio/commentary/fulltime.mp3';
import save01 from '../assets/audio/commentary/save-01.mp3';
import save02 from '../assets/audio/commentary/save-02.mp3';
import nearMiss01 from '../assets/audio/commentary/near-miss-01.mp3';
import nearMiss02 from '../assets/audio/commentary/near-miss-02.mp3';
import substitutionClip from '../assets/audio/commentary/substitution.mp3';
import freekickClip from '../assets/audio/commentary/freekick.mp3';
import cornerClip from '../assets/audio/commentary/corner.mp3';
import winClip from '../assets/audio/commentary/win.mp3';
import goalBn from '../assets/audio/commentary/goal-bn.mp3';
import kickoffBn from '../assets/audio/commentary/kickoff-bn.mp3';
import winBn from '../assets/audio/commentary/win-bn.mp3';
import foulBn from '../assets/audio/commentary/foul-bn.mp3';
import yellowBn from '../assets/audio/commentary/yellow-bn.mp3';
import redBn from '../assets/audio/commentary/red-bn.mp3';
import penaltyBn from '../assets/audio/commentary/penalty-bn.mp3';
import offsideBn from '../assets/audio/commentary/offside-bn.mp3';
import freekickBn from '../assets/audio/commentary/freekick-bn.mp3';
import cornerBn from '../assets/audio/commentary/corner-bn.mp3';
import halftimeBn from '../assets/audio/commentary/halftime-bn.mp3';
import fulltimeBn from '../assets/audio/commentary/fulltime-bn.mp3';
import saveBn from '../assets/audio/commentary/save-bn.mp3';
import nearMissBn from '../assets/audio/commentary/near-miss-bn.mp3';
import substitutionBn from '../assets/audio/commentary/substitution-bn.mp3';

// ---- Crowd loops (synthesized stadium recordings, loopable) ------------------
import crowdCheer from '../assets/audio/crowd/crowd-cheer.mp3';
import crowdChant from '../assets/audio/crowd/crowd-chant.mp3';
import crowdAmbience from '../assets/audio/crowd/crowd-ambience.mp3';
import crowdGroan from '../assets/audio/crowd/crowd-groan.mp3';

// ---- Menu music tracks (synthesized, football-game feel) ---------------------
import musicKickoff from '../assets/audio/music/music-kickoff.mp3';
import musicStadiumNights from '../assets/audio/music/music-stadium-nights.mp3';
import musicChampions from '../assets/audio/music/music-champions.mp3';
import musicPrematch from '../assets/audio/music/music-prematch.mp3';
import musicPackRush from '../assets/audio/music/music-pack-rush.mp3';

export type CommentaryClipId =
  | 'goal-01' | 'goal-02' | 'goal-03' | 'goal-late'
  | 'kickoff' | 'foul' | 'yellow' | 'red' | 'penalty' | 'offside'
  | 'halftime' | 'fulltime' | 'save-01' | 'save-02'
  | 'near-miss-01' | 'near-miss-02' | 'substitution' | 'freekick'
  | 'corner' | 'win' | 'goal-bn' | 'kickoff-bn' | 'win-bn'
  | 'foul-bn' | 'yellow-bn' | 'red-bn' | 'penalty-bn' | 'offside-bn'
  | 'freekick-bn' | 'corner-bn' | 'halftime-bn' | 'fulltime-bn'
  | 'save-bn' | 'near-miss-bn' | 'substitution-bn';

export const COMMENTARY_CLIPS: Record<CommentaryClipId, string> = {
  'goal-01': goal01, 'goal-02': goal02, 'goal-03': goal03, 'goal-late': goalLate,
  kickoff: kickoffClip, foul: foulClip, yellow: yellowClip, red: redClip,
  penalty: penaltyClip, offside: offsideClip, halftime: halftimeClip,
  fulltime: fulltimeClip, 'save-01': save01, 'save-02': save02,
  'near-miss-01': nearMiss01, 'near-miss-02': nearMiss02,
  substitution: substitutionClip, freekick: freekickClip, corner: cornerClip,
  win: winClip, 'goal-bn': goalBn, 'kickoff-bn': kickoffBn, 'win-bn': winBn,
  'foul-bn': foulBn, 'yellow-bn': yellowBn, 'red-bn': redBn,
  'penalty-bn': penaltyBn, 'offside-bn': offsideBn, 'freekick-bn': freekickBn,
  'corner-bn': cornerBn, 'halftime-bn': halftimeBn, 'fulltime-bn': fulltimeBn,
  'save-bn': saveBn, 'near-miss-bn': nearMissBn, 'substitution-bn': substitutionBn,
};

/** All commentary clip ids — used by the audio lab to verify every file loads. */
export const COMMENTARY_CLIP_IDS = Object.keys(COMMENTARY_CLIPS) as CommentaryClipId[];

export const CROWD_LOOPS = {
  /** Goal eruption: big swell with whistles, ~92 s (played as a timed swell, not looped). */
  cheer: crowdCheer,
  /** Rhythmic chant with handclaps, ~64 s, loopable. */
  chant: crowdChant,
  /** General stadium murmur, ~122 s, loopable — the match-day bed. */
  ambience: crowdAmbience,
  /** Near-miss "oooh" groan swell, ~12 s — played as a one-shot on near misses. */
  groan: crowdGroan,
} as const;

export interface MenuTrack {
  id: string;
  title: string;
  bpm: number;
  url: string;
}

export const MENU_TRACKS: MenuTrack[] = [
  { id: 'kickoff', title: 'Kickoff Anthem', bpm: 128, url: musicKickoff },
  { id: 'stadium-nights', title: 'Stadium Nights', bpm: 112, url: musicStadiumNights },
  { id: 'champions', title: 'Champions Drive', bpm: 132, url: musicChampions },
  { id: 'prematch', title: 'Prematch Overture', bpm: 92, url: musicPrematch },
  { id: 'pack-rush', title: 'Pack Rush', bpm: 138, url: musicPackRush },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Pick the recorded goal call for a goal at `minute` in language `lang`. */
export function pickGoalClip(minute: number, lang: string): CommentaryClipId {
  if (lang === 'bn') return 'goal-bn';
  if (minute >= 80) return 'goal-late';
  return pick(['goal-01', 'goal-02', 'goal-03'] as const);
}

export function pickSaveClip(): CommentaryClipId {
  return pick(['save-01', 'save-02'] as const);
}

export function pickNearMissClip(): CommentaryClipId {
  return pick(['near-miss-01', 'near-miss-02'] as const);
}

/**
 * Bengali picker: the `-bn` clip when the game language is Bengali,
 * otherwise the English clip — the same rule pickGoalClip uses for goals.
 * Pure (no I/O), so the headless lab can assert every event maps correctly.
 */
export function langClip(en: CommentaryClipId, bn: CommentaryClipId, lang: string): CommentaryClipId {
  return lang === 'bn' ? bn : en;
}

/**
 * One-shot recorded-clip player for commentary. A single shared
 * HTMLAudioElement: a new clip cuts the previous one (commentary must never
 * talk over itself), and playback is a no-op when commentary is off or the
 * game is muted. Volume tracks masterVolume at play time.
 */
class RecordedClipPlayer {
  private el: HTMLAudioElement | null = null;
  private lastClip: CommentaryClipId | null = null;
  // Audio-fix (2026-11-22): mute-leak subscription, same pattern as
  // MusicEngine.syncTrackVolume — a clip playing when the user mutes must
  // stop immediately, not play its remaining 3–5 s to the end.
  private settingsOff: (() => void) | null = null;

  private ensureMuteSubscription(): void {
    if (this.settingsOff) return;
    this.settingsOff = settingsStore.subscribe(() => {
      if (settingsStore.getState().muted) this.stop();
    });
  }

  play(clip: CommentaryClipId): boolean {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
    const s = settingsStore.getState();
    if (!s.commentaryOn || s.muted) return false;
    this.ensureMuteSubscription();
    try {
      if (!this.el) {
        this.el = new Audio();
        this.el.preload = 'auto';
      }
      this.el.pause();
      this.el.src = COMMENTARY_CLIPS[clip];
      this.el.volume = Math.min(1, Math.max(0, s.masterVolume));
      this.el.currentTime = 0;
      void this.el.play().catch(() => undefined);
      this.lastClip = clip;
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    try { this.el?.pause(); } catch { /* audio is a garnish */ }
    this.lastClip = null;
  }

  get playing(): CommentaryClipId | null {
    return this.el && !this.el.paused ? this.lastClip : null;
  }
}

export const recordedClipPlayer = new RecordedClipPlayer();
