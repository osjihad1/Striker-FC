// Striker FC — ui/screens/SettingsScreen.tsx (Phase 10)
// The full polished Settings screen (Blueprint 19 + Spec 04 §3):
// Graphics (quality incl. ULTRA, crowd density, weather, FPS counter),
// Gameplay (half length, auto-switch), Audio (Master/SFX/Crowd/UI buses,
// mute, commentary), Controls (scheme, camera, joystick layout, button size,
// haptics), Data & Safety (Cloud Save backup/restore, Export/Import save
// JSON, two-tap Reset), the Android APK guide, and About.
// Every control writes through useSettingsStore, which persists to
// LocalStorage — settings apply instantly and survive a refresh.

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { SaveProfile, WeatherType } from '../../core/types';
import { parseProfileJson } from '../../core/SaveSystem';
import { useMetaStore } from '../../store/useMetaStore';
import {
  applySettingsSnapshot,
  exportSettingsSnapshot,
  useSettingsStore,
  type AutoSwitchMode,
  type CameraMode,
  type ControlScheme,
  type GraphicsQuality,
  type JoystickSide,
  type MatchHalfLength,
} from '../../store/useSettingsStore';
import { api } from '../../api';
import { APK_GUIDE_TEXT } from '../../data/apkGuide';
import { ModalShell } from '../components/ModalShell';
import { formatDate, formatNumber, t } from '../../i18n/i18n';
import {
  backupAgeLabel, backupIsStale, hasPreviousClub, lastBackupAt,
  readPreviousClubJson, recordBackupAt, snapshotPreviousClub,
} from '../../meta/CloudBackupService';

export const APP_VERSION = '1.0.0';
export const BUILD_DATE = '2026-11-21';

const WEATHER_OPTIONS: { id: WeatherType; labelKey: string }[] = [
  { id: 'NIGHT_FLOODLIGHTS', labelKey: 'settings.nightFloodlights' },
  { id: 'DAY_CLEAR', labelKey: 'settings.dayClear' },
  { id: 'SUNSET', labelKey: 'settings.sunset' },
  { id: 'NIGHT_RAIN', labelKey: 'settings.nightRain' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="font-display text-xl font-bold uppercase tracking-wider text-[var(--accent)]">{title}</h3>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  label, hint, value, options, onPick,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--dim)]">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-pressed={value === opt.id}
            onClick={() => onPick(opt.id)}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
            style={{
              borderColor: value === opt.id ? 'var(--accent)' : 'var(--border)',
              background: value === opt.id ? 'var(--accent-dim)' : 'var(--surface2)',
              color: value === opt.id ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
        <span>{label}</span>
        <span className="tnum text-[var(--accent)]">{format(value)}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function ToggleRow({
  label, hint, checked, onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-[var(--dim)]">{hint}</span>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

export function SettingsScreen({
  profile, halfDuration, onHalfLength, onResetProfile, onImportProfile,
}: {
  profile: SaveProfile | null;
  halfDuration: MatchHalfLength;
  onHalfLength: (h: MatchHalfLength) => void;
  onResetProfile: () => void;
  onImportProfile: (p: SaveProfile) => void;
}) {
  const storageBackend = useMetaStore((s) => s.storageBackend);

  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const crowdDensity = useSettingsStore((s) => s.crowdDensity);
  const weatherEnabled = useSettingsStore((s) => s.weatherEnabled);
  const defaultWeather = useSettingsStore((s) => s.defaultWeather);
  const showFps = useSettingsStore((s) => s.showFps);
  const cameraMode = useSettingsStore((s) => s.cameraMode);
  const controlScheme = useSettingsStore((s) => s.controlScheme);
  const autoSwitch = useSettingsStore((s) => s.autoSwitch);
  const joystickSide = useSettingsStore((s) => s.joystickSide);
  const buttonScale = useSettingsStore((s) => s.buttonScale);
  const controlsOpacity = useSettingsStore((s) => s.controlsOpacity);
  const setControlsOpacity = useSettingsStore((s) => s.setControlsOpacity);
  const hapticsOn = useSettingsStore((s) => s.hapticsOn);
  const masterVolume = useSettingsStore((s) => s.masterVolume);
  const crowdVolume = useSettingsStore((s) => s.crowdVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const uiVolume = useSettingsStore((s) => s.uiVolume);
  const muted = useSettingsStore((s) => s.muted);
  const commentaryOn = useSettingsStore((s) => s.commentaryOn);
  const commentarySpeech = useSettingsStore((s) => s.commentarySpeech);
  const cloudSaveEnabled = useSettingsStore((s) => s.cloudSaveEnabled);
  const setGraphicsQuality = useSettingsStore((s) => s.setGraphicsQuality);
  const setCrowdDensity = useSettingsStore((s) => s.setCrowdDensity);
  const setWeatherEnabled = useSettingsStore((s) => s.setWeatherEnabled);
  const setDefaultWeather = useSettingsStore((s) => s.setDefaultWeather);
  const setShowFps = useSettingsStore((s) => s.setShowFps);
  const setCameraMode = useSettingsStore((s) => s.setCameraMode);
  const setControlScheme = useSettingsStore((s) => s.setControlScheme);
  const setAutoSwitch = useSettingsStore((s) => s.setAutoSwitch);
  const setJoystickSide = useSettingsStore((s) => s.setJoystickSide);
  const setButtonScale = useSettingsStore((s) => s.setButtonScale);
  const setHapticsOn = useSettingsStore((s) => s.setHapticsOn);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const setMuted = useSettingsStore((s) => s.setMuted);
  const setCommentaryOn = useSettingsStore((s) => s.setCommentaryOn);
  const setCommentarySpeech = useSettingsStore((s) => s.setCommentarySpeech);
  const setCloudSaveEnabled = useSettingsStore((s) => s.setCloudSaveEnabled);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const musicEnabled = useSettingsStore((s) => s.musicEnabled);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);
  const setMusicEnabled = useSettingsStore((s) => s.setMusicEnabled);

  const [dataNote, setDataNote] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ saveKb: number | null; originMb: number | null; cacheStores: number | null }>({
    saveKb: null, originMb: null, cacheStores: null,
  });
  const [resetArmed, setResetArmed] = useState(false);
  const [restoreArmed, setRestoreArmed] = useState(false);
  const [apkOpen, setApkOpen] = useState(false);
  const [cloud, setCloud] = useState<{ state: 'loading' | 'ready' | 'error'; updatedAt: number | null; hasBackup: boolean; message: string | null }>({
    state: 'loading', updatedAt: null, hasBackup: false, message: null,
  });
  const [cloudBusy, setCloudBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cloud Save status: read the server mirror once on open.
  useEffect(() => {
    let cancelled = false;
    void api.getCloudSave({})
      .then((r) => {
        if (cancelled) return;
        setCloud({ state: 'ready', updatedAt: r.updatedAt, hasBackup: r.json !== null, message: null });
      })
      .catch(() => {
        if (cancelled) return;
        setCloud({ state: 'error', updatedAt: null, hasBackup: false, message: t('settings.cloudUnreachable') });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!resetArmed) return;
    const t = window.setTimeout(() => setResetArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [resetArmed]);
  useEffect(() => {
    if (!restoreArmed) return;
    const t = window.setTimeout(() => setRestoreArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [restoreArmed]);

  const backupNow = () => {
    if (!profile || cloudBusy) return;
    setCloudBusy(true);
    // P2-1: the backup carries the settings snapshot next to the profile,
    // so a restore on a new device brings language, controls and audio too.
    const payload = JSON.stringify({ profile, settings: exportSettingsSnapshot(), wrappedAt: new Date().toISOString() });
    void api.putCloudSave({ json: payload })
      .then((r) => {
        recordBackupAt(r.updatedAt);
        setCloud({ state: 'ready', updatedAt: r.updatedAt, hasBackup: true, message: null });
        setDataNote(t('settings.backupSaved', { time: formatDate(new Date(r.updatedAt)) }));
      })
      .catch((e: unknown) => {
        setDataNote(e instanceof Error ? e.message : t('settings.backupFailed'));
      })
      .finally(() => setCloudBusy(false));
  };

  const restoreBackup = () => {
    if (!restoreArmed) { setRestoreArmed(true); return; }
    setRestoreArmed(false);
    if (cloudBusy) return;
    setCloudBusy(true);
    void api.getCloudSave({})
      .then((r) => {
        if (!r.json) { setDataNote(t('settings.noBackupFound')); return; }
        // P2-1: backups may be wrapped ({ profile, settings }) or legacy
        // plain profiles — both restore; settings apply when present.
        let wrapped: { profile?: unknown; settings?: unknown } | null = null;
        try {
          const raw: unknown = JSON.parse(r.json);
          if (typeof raw === 'object' && raw !== null && 'profile' in raw) wrapped = raw as { profile?: unknown; settings?: unknown };
        } catch { /* fall through to the plain-profile parse */ }
        const parsed = parseProfileJson(wrapped ? JSON.stringify(wrapped.profile) : r.json);
        if (!parsed) { setDataNote(t('settings.backupUnreadable')); return; }
        // P0-7: snapshot the current club first — Undo can bring it back.
        if (profile) snapshotPreviousClub(profile);
        onImportProfile(parsed);
        if (wrapped?.settings) applySettingsSnapshot(wrapped.settings);
        setDataNote(`${t('settings.restoredLine', { time: r.updatedAt ? formatDate(new Date(r.updatedAt)) : t('settings.unknownDate') })}${wrapped?.settings ? t('settings.settingsRestored') : ''}.`);
      })
      .catch(() => setDataNote(t('settings.restoreFailed')))
      .finally(() => setCloudBusy(false));
  };

  const exportSave = () => {
    if (!profile) return;
    const blob = new Blob([JSON.stringify({ profile, settings: exportSettingsSnapshot() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'striker-fc-save.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDataNote(t('settings.exportedNote'));
  };

  const importSave = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((text) => {
      // Accept both the wrapped export ({ profile, settings }) and a bare
      // profile JSON; validate the profile fully before anything applies.
      let wrappedSettings: unknown = null;
      let profileText = text;
      try {
        const raw: unknown = JSON.parse(text);
        if (typeof raw === 'object' && raw !== null && 'profile' in raw) {
          wrappedSettings = (raw as { settings?: unknown }).settings ?? null;
          profileText = JSON.stringify((raw as { profile: unknown }).profile);
        }
      } catch { /* parseProfileJson will refuse it below */ }
      const parsed = parseProfileJson(profileText);
      if (!parsed) {
        setDataNote(t('settings.invalidSave'));
        return;
      }
      // P0-7: snapshot the current club first — Undo can bring it back.
      if (profile) snapshotPreviousClub(profile);
      onImportProfile(parsed);
      if (wrappedSettings) applySettingsSnapshot(wrappedSettings);
      setDataNote(t('settings.importedNote', { club: parsed.clubName, coins: formatNumber(parsed.coins), cards: parsed.inventory.length }));
    }).catch(() => setDataNote(t('settings.fileUnreadable')));
  };

  const resetTap = () => {
    if (!resetArmed) { setResetArmed(true); return; }
    setResetArmed(false);
    // P0-7: snapshot the current club first — Undo can bring it back.
    if (profile) snapshotPreviousClub(profile);
    onResetProfile();
    setDataNote(t('settings.resetDone'));
  };

  /** P0-7 Undo: restore the club snapshotted before the last destructive
   *  action (Reset / cloud restore / JSON import). */
  const [undoAvailable, setUndoAvailable] = useState(() => hasPreviousClub());
  const undoPreviousClub = () => {
    const raw = readPreviousClubJson();
    if (!raw) { setUndoAvailable(false); return; }
    const parsed = parseProfileJson(raw);
    if (!parsed) {
      setDataNote(t('settings.prevUnreadable'));
      return;
    }
    // The club being replaced becomes the new undo snapshot (undo of undo).
    if (profile) snapshotPreviousClub(profile);
    onImportProfile(parsed);
    setUndoAvailable(hasPreviousClub());
    setDataNote(t('settings.undoneNote', { club: parsed.clubName }));
  };

  // --- Storage usage + cache (never touches the save or the settings) ------
  const refreshStorageInfo = async (prof: SaveProfile | null) => {
    const saveKb = prof ? Math.max(1, Math.round(new Blob([JSON.stringify(prof)]).size / 1024)) : null;
    let originMb: number | null = null;
    try {
      const est = await navigator.storage?.estimate?.();
      if (est && typeof est.usage === 'number') originMb = Math.round((est.usage / (1024 * 1024)) * 10) / 10;
    } catch { /* storage estimate unavailable on this browser/WebView */ }
    let cacheStores: number | null = null;
    try {
      if ('caches' in window) cacheStores = (await caches.keys()).length;
    } catch { /* no Cache Storage here */ }
    setStorageInfo({ saveKb, originMb, cacheStores });
  };

  useEffect(() => { void refreshStorageInfo(profile); }, [profile]);

  const clearCache = async () => {
    let removed = 0;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        removed = keys.length;
      }
    } catch { /* cache API unavailable — nothing to clear */ }
    await refreshStorageInfo(profile);
    setDataNote(removed > 0
      ? removed === 1 ? t('settings.cacheClearedOne') : t('settings.cacheCleared', { n: removed })
      : t('settings.cacheEmpty'));
  };

  const pct = (v: number) => `${formatNumber(Math.round(v))}%`;

  return (
    <section aria-label={t('common.settings')} className="mt-5 max-w-2xl space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wider">{t('settings.settings')}</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          {t('settings.intro')}
        </p>
      </div>

      <Section title={t('settings.graphics')}>
        <Segmented<GraphicsQuality>
          label={t('settings.quality')}
          hint={t('settings.qualityHint')}
          value={graphicsQuality}
          options={[
            { id: 'LOW', label: t('settings.low') },
            { id: 'MEDIUM', label: t('settings.medium') },
            { id: 'HIGH', label: t('settings.high') },
            { id: 'ULTRA', label: t('settings.ultra') },
          ]}
          onPick={setGraphicsQuality}
        />
        <SliderRow
          label={t('settings.crowdDensity')}
          value={Math.round(crowdDensity * 100)}
          min={0}
          max={100}
          step={5}
          format={(v) => t('settings.crowdOf', { n: v })}
          onChange={(v) => setCrowdDensity(v / 100)}
        />
        <ToggleRow
          label={t('settings.weatherEffects')}
          hint={t('settings.weatherHint')}
          checked={weatherEnabled}
          onChange={setWeatherEnabled}
        />
        <Segmented<WeatherType>
          label={t('settings.defaultWeather')}
          value={defaultWeather}
          options={WEATHER_OPTIONS.map((o) => ({ id: o.id, label: t(o.labelKey) }))}
          onPick={setDefaultWeather}
        />
        <ToggleRow
          label={t('settings.fpsCounter')}
          hint={t('settings.fpsHint')}
          checked={showFps}
          onChange={setShowFps}
        />
        <Segmented<CameraMode>
          label={t('settings.camera')}
          value={cameraMode}
          options={[
            { id: 'BROADCAST', label: t('settings.broadcast') },
            { id: 'PRO', label: t('settings.pro') },
            { id: 'TACTICAL', label: t('settings.tactical') },
          ]}
          onPick={setCameraMode}
        />
      </Section>

      <Section title={t('settings.gameplay')}>
        <Segmented<string>
          label={t('settings.matchHalfLength')}
          hint={t('settings.halfHint')}
          value={String(halfDuration)}
          options={[
            { id: '180', label: t('settings.min3') },
            { id: '240', label: t('settings.min4') },
            { id: '360', label: t('settings.min6') },
          ]}
          onPick={(v) => onHalfLength(Number(v) as MatchHalfLength)}
        />
        <Segmented<AutoSwitchMode>
          label={t('settings.autoSwitch')}
          hint={t('settings.autoSwitchHint')}
          value={autoSwitch}
          options={[
            { id: 'AUTO', label: t('settings.auto') },
            { id: 'AIR_BALLS', label: t('settings.airBalls') },
            { id: 'MANUAL', label: t('settings.manual') },
          ]}
          onPick={setAutoSwitch}
        />
      </Section>

      <Section title={`${t('settings.language')} · ভাষা`}>
        <Segmented
          label={t('settings.uiLanguage')}
          value={language}
          options={[
            { id: 'en' as const, label: 'English' },
            { id: 'bn' as const, label: 'বাংলা' },
          ]}
          onPick={setLanguage}
        />
        <p className="text-xs leading-relaxed text-[var(--dim)]">
          {t('settings.langNote')}
        </p>
      </Section>

      <Section title={t('settings.audio')}>
        <SliderRow label={t('settings.masterVolume')} value={Math.round(masterVolume * 100)} min={0} max={100} step={1} format={pct} onChange={(v) => setVolume('masterVolume', v / 100)} />
        <SliderRow label={t('settings.music')} value={Math.round(musicVolume * 100)} min={0} max={100} step={1} format={pct} onChange={(v) => setMusicVolume(v / 100)} />
        <ToggleRow
          label={t('settings.musicOnOff')}
          hint={t('settings.musicHint')}
          checked={musicEnabled}
          onChange={setMusicEnabled}
        />
        <SliderRow label={t('settings.matchSfx')} value={Math.round(sfxVolume * 100)} min={0} max={100} step={1} format={pct} onChange={(v) => setVolume('sfxVolume', v / 100)} />
        <SliderRow label={t('settings.stadiumCrowd')} value={Math.round(crowdVolume * 100)} min={0} max={100} step={1} format={pct} onChange={(v) => setVolume('crowdVolume', v / 100)} />
        <SliderRow label={t('settings.uiSounds')} value={Math.round(uiVolume * 100)} min={0} max={100} step={1} format={pct} onChange={(v) => setVolume('uiVolume', v / 100)} />
        <ToggleRow
          label={t('settings.muteAll')}
          hint={t('settings.muteHint')}
          checked={muted}
          onChange={setMuted}
        />
        <ToggleRow
          label={t('settings.commentary')}
          hint={t('settings.commentaryHint')}
          checked={commentaryOn}
          onChange={setCommentaryOn}
        />
        <ToggleRow
          label={t('settings.commentaryVoiceLabel')}
          hint={t('settings.commentaryVoiceHint')}
          checked={commentarySpeech}
          onChange={setCommentarySpeech}
        />
      </Section>

      <Section title={t('settings.controls')}>
        <Segmented<ControlScheme>
          label={t('settings.controlStyle')}
          value={controlScheme}
          options={[
            { id: 'CLASSIC_BUTTONS', label: t('settings.buttons') },
            { id: 'SWIPE', label: t('settings.gestures') },
            { id: 'HYBRID', label: t('settings.gesturesButtons') },
          ]}
          onPick={setControlScheme}
        />
        <Segmented<JoystickSide>
          label={t('settings.joystickLayout')}
          hint={t('settings.joystickHint')}
          value={joystickSide}
          options={[
            { id: 'LEFT', label: t('settings.stickLeft') },
            { id: 'RIGHT', label: t('settings.stickRight') },
          ]}
          onPick={setJoystickSide}
        />
        <SliderRow
          label={t('settings.buttonSize')}
          value={Math.round(buttonScale * 100)}
          min={80}
          max={130}
          step={5}
          format={(v) => `${formatNumber(v)}%`}
          onChange={(v) => setButtonScale(v / 100)}
        />
        <SliderRow
          label={t('settings.controlsOpacity')}
          value={Math.round(controlsOpacity * 100)}
          min={45}
          max={100}
          step={5}
          format={(v) => `${formatNumber(v)}%`}
          onChange={(v) => setControlsOpacity(v / 100)}
        />
        <ToggleRow
          label={t('settings.hapticFeedback')}
          hint={t('settings.hapticsHint')}
          checked={hapticsOn}
          onChange={setHapticsOn}
        />
      </Section>

      <Section title={t('settings.dataSafety')}>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('settings.cloudSave')}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
              style={{
                background: cloud.state === 'error' ? 'rgba(239,68,68,0.18)' : 'var(--accent-dim)',
                color: cloud.state === 'error' ? '#fca5a5' : 'var(--accent)',
              }}
            >
              {cloud.state === 'loading' ? t('settings.checking')
                : cloud.state === 'error' ? t('settings.unavailable')
                  : cloud.hasBackup ? t('settings.backupFound') : t('settings.noBackupYet')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--dim)]">
            {cloud.message
              ?? (cloud.hasBackup
                ? t('settings.lastBackupLine', { time: cloud.updatedAt ? formatDate(new Date(cloud.updatedAt)) : '', backend: storageBackend })
                : t('settings.noBackupLine', { backend: storageBackend }))}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!profile || cloudBusy || !cloudSaveEnabled}
              onClick={backupNow}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c] disabled:opacity-40"
            >
              {cloudBusy ? t('settings.working') : t('settings.backupNow')}
            </button>
            <button
              type="button"
              disabled={cloudBusy || !cloud.hasBackup}
              onClick={restoreBackup}
              aria-pressed={restoreArmed}
              className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40"
              style={{
                borderColor: restoreArmed ? 'var(--danger)' : 'var(--border)',
                color: restoreArmed ? '#fca5a5' : 'var(--text)',
              }}
            >
              {restoreArmed ? t('settings.tapReplace') : t('settings.restoreBackup')}
            </button>
          </div>
          <div className="mt-2">
            <ToggleRow
              label={t('settings.cloudEnabled')}
              hint={t('settings.cloudEnabledHint')}
              checked={cloudSaveEnabled}
              onChange={setCloudSaveEnabled}
            />
          </div>
          {(() => {
            const lastMs = Math.max(lastBackupAt() ?? 0, cloud.updatedAt ?? 0) || null;
            const stale = cloudSaveEnabled && backupIsStale(lastMs, Date.now());
            return (
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <p className="text-xs leading-relaxed text-[var(--dim)]">
                  <strong className="text-[var(--text)]">{t('settings.autoBackup', { state: cloudSaveEnabled ? t('settings.onWord') : t('settings.offWord') })}</strong>{' '}
                  {cloudSaveEnabled
                    ? t('settings.autoBackupOn', { age: backupAgeLabel(lastMs, Date.now()) })
                    : t('settings.autoBackupOff')}
                </p>
                {stale && (
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[#fbbf24]" role="status">
                    {t('settings.staleWarn')}
                  </p>
                )}
                {undoAvailable && (
                  <button
                    type="button"
                    onClick={undoPreviousClub}
                    className="mt-2 rounded-lg border border-[var(--gold)] px-3 py-2 text-sm font-bold text-[var(--gold)]"
                  >
                    {t('settings.undoBtn')}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('settings.storageTitle')}</span>
            <span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              {t('settings.onPhone')}
            </span>
          </div>
          <dl className="tnum mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--dim)]">{t('settings.saveRow')}</dt>
              <dd className="font-semibold">{storageInfo.saveKb !== null ? `≈ ${formatNumber(storageInfo.saveKb)} KB` : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--dim)]">{t('settings.totalRow')}</dt>
              <dd className="font-semibold">{storageInfo.originMb !== null ? `≈ ${formatNumber(storageInfo.originMb)} MB` : t('settings.notReported')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--dim)]">{t('settings.cacheRow')}</dt>
              <dd className="font-semibold">{storageInfo.cacheStores !== null ? formatNumber(storageInfo.cacheStores) : '—'}</dd>
            </div>
          </dl>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[var(--dim)]">
            <li><strong className="text-[var(--text)]">{t('settings.storageNote1')}</strong> {t('settings.storageBody1')}</li>
            <li><strong className="text-[var(--text)]">{t('settings.storageNote2')}</strong> {t('settings.storageBody2')}</li>
            <li><strong className="text-[var(--text)]">{t('settings.storageNote3')}</strong> {t('settings.storageBody3')}</li>
            <li><strong className="text-[var(--text)]">{t('settings.storageNote4')}</strong> {t('settings.storageBody4')}</li>
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">
            {t('settings.denyNote')}
          </p>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => { void clearCache(); }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold"
            >
              {t('settings.clearCacheBtn')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!profile}
            onClick={exportSave}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold disabled:opacity-40"
          >
            {t('settings.exportSave')}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-bold"
          >
            {t('settings.importSave')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label={t('settings.importAria')}
            className="hidden"
            onChange={importSave}
          />
          <button
            type="button"
            onClick={resetTap}
            aria-pressed={resetArmed}
            className="rounded-lg border px-3 py-2 text-sm font-bold"
            style={{
              borderColor: resetArmed ? 'var(--danger)' : 'var(--border)',
              color: resetArmed ? '#fca5a5' : 'var(--text)',
              background: resetArmed ? 'rgba(239,68,68,0.12)' : 'transparent',
            }}
          >
            {resetArmed ? t('settings.tapConfirmReset') : t('settings.resetProfile')}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-[var(--dim)]">
          {t('settings.resetNote')}
        </p>
        {dataNote && (
          <p aria-live="polite" className="rounded-lg border border-[var(--accent-dim)] bg-black/30 px-3 py-2 text-sm font-medium text-[var(--accent)]">
            {dataNote}
          </p>
        )}
      </Section>

      <Section title={t('settings.androidApp')}>
        <button
          type="button"
          onClick={() => setApkOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--gold)]/50 bg-black/30 px-4 py-3 text-left"
        >
          <span>
            <span className="font-display block text-xl font-bold uppercase tracking-wide text-[var(--gold)]">{t('settings.apkTitle')}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--dim)]">
              {t('settings.apkSub')}
            </span>
          </span>
          <span aria-hidden className="font-display text-2xl text-[var(--gold)]">›</span>
        </button>
      </Section>

      <Section title={t('settings.about')}>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3 border-b border-[var(--border)]/50 pb-1.5">
            <dt className="text-[var(--dim)]">{t('settings.versionRow')}</dt>
            <dd className="tnum font-semibold">Striker FC v{APP_VERSION} · {t('settings.phaseRelease')}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-[var(--border)]/50 pb-1.5">
            <dt className="text-[var(--dim)]">{t('settings.buildDate')}</dt>
            <dd className="tnum font-semibold">{BUILD_DATE}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-[var(--border)]/50 pb-1.5">
            <dt className="text-[var(--dim)]">{t('settings.engine')}</dt>
            <dd className="font-semibold">{t('settings.engineLine')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--dim)]">{t('settings.saveStorage')}</dt>
            <dd className="font-semibold">{t('settings.saveStorageLine', { backend: storageBackend })}</dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-[var(--dim)]">
          {t('settings.credits')}
        </p>
      </Section>

      <ModalShell
        open={apkOpen}
        onClose={() => setApkOpen(false)}
        title={t('settings.apkModalTitle')}
        subtitle={t('settings.apkModalSub')}
        wide
      >
        <div className="text-sm leading-relaxed">
          <p className="mb-3 text-[var(--dim)]">
            {t('settings.apkModalIntro')}
          </p>
          <pre
            data-testid="apk-guide-full-text"
            className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-black/40 px-4 py-3 font-sans text-[13px] leading-relaxed text-[var(--text)] [user-select:text]"
          >
            {APK_GUIDE_TEXT}
          </pre>
        </div>
      </ModalShell>
    </section>
  );
}
