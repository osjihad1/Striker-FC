// Striker FC — store/useSettingsStore.ts
// Graphics quality, camera, controls and audio settings (Blueprint 02), persisted
// to LocalStorage so they survive reloads.
// Phase 10: ULTRA tier, crowd density, weather gate + default weather, FPS
// counter toggle, UI bus volume + global mute, match half length, auto-switch
// mode, joystick side, button size, haptics and the Cloud Save preference.

import { createStore } from './createStore';
import type { WeatherType } from '../core/types';

export type GraphicsQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export type CameraMode = 'BROADCAST' | 'PRO' | 'TACTICAL';
export type ControlScheme = 'CLASSIC_BUTTONS' | 'SWIPE' | 'HYBRID';
export type AutoSwitchMode = 'AUTO' | 'AIR_BALLS' | 'MANUAL';
export type JoystickSide = 'LEFT' | 'RIGHT';
export type MatchHalfLength = 180 | 240 | 360;
/** Addendum 2 (Bengali): UI language. Proper nouns never translate. */
export type Language = 'en' | 'bn';

export interface SettingsState {
  graphicsQuality: GraphicsQuality;
  cameraMode: CameraMode;
  controlScheme: ControlScheme;
  masterVolume: number;
  crowdVolume: number;
  sfxVolume: number;
  uiVolume: number;
  muted: boolean;
  commentaryOn: boolean;
  /** Phase 06: optional Web Speech broadcast voice for commentary lines. */
  commentarySpeech: boolean;
  // Phase 10 additions.
  crowdDensity: number; // 0..1 multiplier over the quality tier's crowd budget
  weatherEnabled: boolean; // off → matches always play under Night Floodlights
  defaultWeather: WeatherType;
  showFps: boolean;
  matchHalfLength: MatchHalfLength;
  autoSwitch: AutoSwitchMode;
  joystickSide: JoystickSide;
  buttonScale: number; // 0.8..1.3 multiplier on the touch-button size
  controlsOpacity: number; // 0.45..1 opacity of the on-screen match controls
  hapticsOn: boolean;
  cloudSaveEnabled: boolean;
  /** Addendum 2: UI language ('en' | 'bn'), persisted + cloud-backed. */
  language: Language;
  /** P1-2: procedural music bus. */
  musicVolume: number;
  musicEnabled: boolean;
  setGraphicsQuality: (q: GraphicsQuality) => void;
  setCameraMode: (c: CameraMode) => void;
  setControlScheme: (c: ControlScheme) => void;
  setVolume: (channel: 'masterVolume' | 'crowdVolume' | 'sfxVolume' | 'uiVolume', value: number) => void;
  setMuted: (muted: boolean) => void;
  setCommentaryOn: (on: boolean) => void;
  setCommentarySpeech: (on: boolean) => void;
  setCrowdDensity: (v: number) => void;
  setWeatherEnabled: (on: boolean) => void;
  setDefaultWeather: (w: WeatherType) => void;
  setShowFps: (on: boolean) => void;
  setMatchHalfLength: (h: MatchHalfLength) => void;
  setAutoSwitch: (m: AutoSwitchMode) => void;
  setJoystickSide: (s: JoystickSide) => void;
  setButtonScale: (v: number) => void;
  setControlsOpacity: (v: number) => void;
  setHapticsOn: (on: boolean) => void;
  setCloudSaveEnabled: (on: boolean) => void;
  setLanguage: (l: Language) => void;
  setMusicVolume: (v: number) => void;
  setMusicEnabled: (on: boolean) => void;
}

const LS_KEY = 'striker_fc_settings';

type PersistedSettings = Omit<
  SettingsState,
  | 'setGraphicsQuality' | 'setCameraMode' | 'setControlScheme' | 'setVolume' | 'setMuted'
  | 'setCommentaryOn' | 'setCommentarySpeech' | 'setCrowdDensity' | 'setWeatherEnabled'
  | 'setDefaultWeather' | 'setShowFps' | 'setMatchHalfLength' | 'setAutoSwitch'
  | 'setJoystickSide' | 'setButtonScale' | 'setControlsOpacity' | 'setHapticsOn' | 'setCloudSaveEnabled'
  | 'setLanguage' | 'setMusicVolume' | 'setMusicEnabled'
>;

function loadPersisted(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Partial<PersistedSettings>;
  } catch {
    // ignore corrupt settings
  }
  return {};
}

function persist(state: SettingsState): void {
  try {
    const data: PersistedSettings = {
      graphicsQuality: state.graphicsQuality,
      cameraMode: state.cameraMode,
      controlScheme: state.controlScheme,
      masterVolume: state.masterVolume,
      crowdVolume: state.crowdVolume,
      sfxVolume: state.sfxVolume,
      uiVolume: state.uiVolume,
      muted: state.muted,
      commentaryOn: state.commentaryOn,
      commentarySpeech: state.commentarySpeech,
      crowdDensity: state.crowdDensity,
      weatherEnabled: state.weatherEnabled,
      defaultWeather: state.defaultWeather,
      showFps: state.showFps,
      matchHalfLength: state.matchHalfLength,
      autoSwitch: state.autoSwitch,
      joystickSide: state.joystickSide,
      buttonScale: state.buttonScale,
      controlsOpacity: state.controlsOpacity,
      hapticsOn: state.hapticsOn,
      cloudSaveEnabled: state.cloudSaveEnabled,
      language: state.language,
      musicVolume: state.musicVolume,
      musicEnabled: state.musicEnabled,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — settings stay in memory
  }
}

const persisted = loadPersisted();
// First run on a phone/tablet (coarse pointer, no saved choice yet): default
// to LOW so the 3D pitch opens at devicePixelRatio 1 with shadows off and the
// 1,200-fan crowd budget instead of the desktop HIGH tier (DPR 2, 2048px
// shadow maps, 4,000 fans), which can stall or be refused outright by a
// mobile GPU/WebView. The player can raise it in Settings at any time; a
// saved choice always wins over this default.
const coarsePointerDefault = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(pointer: coarse)').matches
  : false;
const clamp01 = (v: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

function update(patch: Partial<SettingsState>): void {
  settingsStore.setState(patch);
  persist(settingsStore.getState());
}

export const settingsStore = createStore<SettingsState>({
  graphicsQuality: persisted.graphicsQuality ?? (coarsePointerDefault ? 'LOW' : 'HIGH'),
  cameraMode: persisted.cameraMode ?? 'BROADCAST',
  controlScheme: persisted.controlScheme ?? 'HYBRID',
  masterVolume: persisted.masterVolume ?? 0.8,
  crowdVolume: persisted.crowdVolume ?? 0.7,
  sfxVolume: persisted.sfxVolume ?? 0.9,
  uiVolume: persisted.uiVolume ?? 0.8,
  muted: persisted.muted ?? false,
  commentaryOn: persisted.commentaryOn ?? true,
  commentarySpeech: persisted.commentarySpeech ?? false,
  crowdDensity: clamp01(persisted.crowdDensity ?? 1, 1),
  weatherEnabled: persisted.weatherEnabled ?? true,
  defaultWeather: persisted.defaultWeather ?? 'NIGHT_FLOODLIGHTS',
  showFps: persisted.showFps ?? true,
  matchHalfLength: persisted.matchHalfLength ?? 180,
  autoSwitch: persisted.autoSwitch ?? 'AUTO',
  joystickSide: persisted.joystickSide ?? 'LEFT',
  buttonScale: Math.min(1.3, Math.max(0.8, persisted.buttonScale ?? 1)),
  controlsOpacity: Math.min(1, Math.max(0.45, persisted.controlsOpacity ?? 0.92)),
  hapticsOn: persisted.hapticsOn ?? true,
  cloudSaveEnabled: persisted.cloudSaveEnabled ?? true,
  language: persisted.language === 'bn' ? 'bn' : 'en',
  musicVolume: clamp01(persisted.musicVolume ?? 0.6, 0.6),
  musicEnabled: persisted.musicEnabled ?? true,
  setGraphicsQuality: (graphicsQuality) => update({ graphicsQuality }),
  setCameraMode: (cameraMode) => update({ cameraMode }),
  setControlScheme: (controlScheme) => update({ controlScheme }),
  setVolume: (channel, value) => update({ [channel]: clamp01(value, 0) } as Partial<SettingsState>),
  setMuted: (muted) => update({ muted }),
  setCommentaryOn: (commentaryOn) => update({ commentaryOn }),
  setCommentarySpeech: (commentarySpeech) => update({ commentarySpeech }),
  setCrowdDensity: (v) => update({ crowdDensity: clamp01(v, 1) }),
  setWeatherEnabled: (weatherEnabled) => update({ weatherEnabled }),
  setDefaultWeather: (defaultWeather) => update({ defaultWeather }),
  setShowFps: (showFps) => update({ showFps }),
  setMatchHalfLength: (matchHalfLength) => update({ matchHalfLength }),
  setAutoSwitch: (autoSwitch) => update({ autoSwitch }),
  setJoystickSide: (joystickSide) => update({ joystickSide }),
  setButtonScale: (v) => update({ buttonScale: Math.min(1.3, Math.max(0.8, v)) }),
  setControlsOpacity: (v) => update({ controlsOpacity: Math.min(1, Math.max(0.45, v)) }),
  setHapticsOn: (hapticsOn) => update({ hapticsOn }),
  setCloudSaveEnabled: (cloudSaveEnabled) => update({ cloudSaveEnabled }),
  setLanguage: (language) => update({ language }),
  setMusicVolume: (v) => update({ musicVolume: clamp01(v, 0.6) }),
  setMusicEnabled: (musicEnabled) => update({ musicEnabled }),
});

export function useSettingsStore<S>(selector: (state: SettingsState) => S): S {
  return settingsStore.useStore(selector);
}

/** P2-1: settings travel with the club — the Cloud Save backup and the
 *  JSON export carry this snapshot next to the profile, and a restore on
 *  a new device applies it (language, controls, audio, graphics). */
export function exportSettingsSnapshot(): PersistedSettings {
  const s = settingsStore.getState();
  return {
    graphicsQuality: s.graphicsQuality, cameraMode: s.cameraMode, controlScheme: s.controlScheme,
    masterVolume: s.masterVolume, crowdVolume: s.crowdVolume, sfxVolume: s.sfxVolume, uiVolume: s.uiVolume,
    muted: s.muted, commentaryOn: s.commentaryOn, commentarySpeech: s.commentarySpeech,
    crowdDensity: s.crowdDensity, weatherEnabled: s.weatherEnabled, defaultWeather: s.defaultWeather,
    showFps: s.showFps, matchHalfLength: s.matchHalfLength, autoSwitch: s.autoSwitch,
    joystickSide: s.joystickSide, buttonScale: s.buttonScale, controlsOpacity: s.controlsOpacity, hapticsOn: s.hapticsOn,
    cloudSaveEnabled: s.cloudSaveEnabled, language: s.language,
    musicVolume: s.musicVolume, musicEnabled: s.musicEnabled,
  };
}

export function applySettingsSnapshot(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const snap = raw as Partial<PersistedSettings>;
  const patch: Partial<SettingsState> = {};
  if (snap.graphicsQuality) patch.graphicsQuality = snap.graphicsQuality;
  if (snap.cameraMode) patch.cameraMode = snap.cameraMode;
  if (snap.controlScheme) patch.controlScheme = snap.controlScheme;
  if (typeof snap.masterVolume === 'number') patch.masterVolume = clamp01(snap.masterVolume, 0.8);
  if (typeof snap.crowdVolume === 'number') patch.crowdVolume = clamp01(snap.crowdVolume, 0.7);
  if (typeof snap.sfxVolume === 'number') patch.sfxVolume = clamp01(snap.sfxVolume, 0.9);
  if (typeof snap.uiVolume === 'number') patch.uiVolume = clamp01(snap.uiVolume, 0.8);
  if (typeof snap.muted === 'boolean') patch.muted = snap.muted;
  if (typeof snap.commentaryOn === 'boolean') patch.commentaryOn = snap.commentaryOn;
  if (typeof snap.commentarySpeech === 'boolean') patch.commentarySpeech = snap.commentarySpeech;
  if (typeof snap.crowdDensity === 'number') patch.crowdDensity = clamp01(snap.crowdDensity, 1);
  if (typeof snap.weatherEnabled === 'boolean') patch.weatherEnabled = snap.weatherEnabled;
  if (snap.defaultWeather) patch.defaultWeather = snap.defaultWeather;
  if (typeof snap.showFps === 'boolean') patch.showFps = snap.showFps;
  if (snap.matchHalfLength) patch.matchHalfLength = snap.matchHalfLength;
  if (snap.autoSwitch) patch.autoSwitch = snap.autoSwitch;
  if (snap.joystickSide) patch.joystickSide = snap.joystickSide;
  if (typeof snap.buttonScale === 'number') patch.buttonScale = Math.min(1.3, Math.max(0.8, snap.buttonScale));
  if (typeof snap.controlsOpacity === 'number') patch.controlsOpacity = Math.min(1, Math.max(0.45, snap.controlsOpacity));
  if (typeof snap.hapticsOn === 'boolean') patch.hapticsOn = snap.hapticsOn;
  if (typeof snap.cloudSaveEnabled === 'boolean') patch.cloudSaveEnabled = snap.cloudSaveEnabled;
  if (snap.language === 'bn' || snap.language === 'en') patch.language = snap.language;
  if (typeof snap.musicVolume === 'number') patch.musicVolume = clamp01(snap.musicVolume, 0.6);
  if (typeof snap.musicEnabled === 'boolean') patch.musicEnabled = snap.musicEnabled;
  if (Object.keys(patch).length === 0) return false;
  settingsStore.setState(patch);
  persist(settingsStore.getState());
  return true;
}
