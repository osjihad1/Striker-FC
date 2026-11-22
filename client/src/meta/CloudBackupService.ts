// Striker FC — meta/CloudBackupService.ts (Epic fix round, P0-7)
// Auto-backup + undo safety net around the Cloud Save mirror:
//  - every profile change schedules a DEBOUNCED auto-backup (15s of quiet)
//    when Cloud Save is enabled in Settings;
//  - hiding or closing the app flushes a pending backup immediately;
//  - the last successful backup time is remembered on-device so Settings
//    can say "last backup … ago" and warn when it goes stale (> 7 days);
//  - before any destructive action (Reset / cloud restore / JSON import)
//    the CURRENT club is snapshotted on-device, and Undo restores it —
//    one tap, no server round-trip.

import { api } from '../api';
import type { SaveProfile } from '../core/types';
import { settingsStore, exportSettingsSnapshot } from '../store/useSettingsStore';

export const LAST_BACKUP_LS_KEY = 'striker_fc_last_cloud_backup_ms';
export const PREVIOUS_CLUB_LS_KEY = 'striker_fc_previous_club';
export const STALE_BACKUP_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTO_BACKUP_DEBOUNCE_MS = 15_000;

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function deviceStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// ---------- Last-backup bookkeeping ---------------------------------------------

export function recordBackupAt(ms: number, storage: KeyValueStorage | null = deviceStorage()): void {
  storage?.setItem(LAST_BACKUP_LS_KEY, String(ms));
}

export function lastBackupAt(storage: KeyValueStorage | null = deviceStorage()): number | null {
  const raw = storage?.getItem(LAST_BACKUP_LS_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "last backup … ago" phrasing for the Settings card. */
export function backupAgeLabel(lastMs: number | null, nowMs: number): string {
  if (lastMs === null) return 'never backed up';
  const diff = Math.max(0, nowMs - lastMs);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

/** A backup older than 7 days (or none at all) is stale. */
export function backupIsStale(lastMs: number | null, nowMs: number): boolean {
  if (lastMs === null) return true;
  return nowMs - lastMs > STALE_BACKUP_MS;
}

// ---------- Previous-club snapshot (Undo) ----------------------------------------

/** Snapshot the club that is about to be replaced. Call BEFORE Reset,
 *  cloud restore, or JSON import applies its new profile. */
export function snapshotPreviousClub(profile: SaveProfile, storage: KeyValueStorage | null = deviceStorage()): void {
  try {
    storage?.setItem(PREVIOUS_CLUB_LS_KEY, JSON.stringify(profile));
  } catch {
    // Best effort — a full device must never block the action itself.
  }
}

export function readPreviousClubJson(storage: KeyValueStorage | null = deviceStorage()): string | null {
  return storage?.getItem(PREVIOUS_CLUB_LS_KEY) ?? null;
}

export function hasPreviousClub(storage: KeyValueStorage | null = deviceStorage()): boolean {
  return readPreviousClubJson(storage) !== null;
}

export function clearPreviousClub(storage: KeyValueStorage | null = deviceStorage()): void {
  storage?.removeItem(PREVIOUS_CLUB_LS_KEY);
}

// ---------- Debounced auto-backup -------------------------------------------------

let pendingProfile: SaveProfile | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function wrappedPayload(profile: SaveProfile): string {
  return JSON.stringify({ profile, settings: exportSettingsSnapshot(), wrappedAt: new Date().toISOString() });
}

/** Called on every committed profile change. Cheap: it only (re)arms the
 *  debounce timer; the network write happens once the changes settle. */
export function scheduleAutoBackup(profile: SaveProfile): void {
  if (!settingsStore.getState().cloudSaveEnabled) return;
  pendingProfile = profile;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAutoBackup();
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

/** Push the pending profile to the cloud mirror now (app hide/close). */
export async function flushAutoBackup(): Promise<boolean> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const profile = pendingProfile;
  if (!profile || inFlight) return false;
  if (!settingsStore.getState().cloudSaveEnabled) {
    pendingProfile = null;
    return false;
  }
  inFlight = true;
  pendingProfile = null;
  try {
    const r = await api.putCloudSave({ json: wrappedPayload(profile) });
    recordBackupAt(r.updatedAt);
    return true;
  } catch {
    // Offline or service down: keep the profile pending for the next try.
    pendingProfile = profile;
    return false;
  } finally {
    inFlight = false;
  }
}

let hooksInstalled = false;

/** Flush on app hide / close so the freshest club is always mirrored. */
export function installAutoBackupHooks(): void {
  if (hooksInstalled || typeof window === 'undefined') return;
  hooksInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAutoBackup();
  });
  window.addEventListener('beforeunload', () => {
    void flushAutoBackup();
  });
}

// ---------- Verification lab -------------------------------------------------------

export interface AutoBackupLabResult {
  ageLabelOk: boolean;
  staleOk: boolean;
  snapshotOk: boolean;
  debounceOk: boolean;
  detail: string;
}

class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

/** Headless checks of the age/stale math, the undo snapshot round-trip and
 *  the debounce constants (the network write itself is exercised live). */
export function runAutoBackupLab(sampleProfile: SaveProfile): AutoBackupLabResult {
  const now = 1_800_000_000_000;
  const ageLabelOk = backupAgeLabel(null, now) === 'never backed up'
    && backupAgeLabel(now - 30_000, now) === 'just now'
    && backupAgeLabel(now - 5 * 60_000, now) === '5 min ago'
    && backupAgeLabel(now - 3 * 3_600_000, now) === '3 h ago'
    && backupAgeLabel(now - 2 * 86_400_000, now) === '2 d ago';
  const staleOk = backupIsStale(null, now) === true
    && backupIsStale(now - STALE_BACKUP_MS - 1, now) === true
    && backupIsStale(now - 60_000, now) === false;
  const storage = new MemoryStorage();
  snapshotPreviousClub(sampleProfile, storage);
  const roundTrip = readPreviousClubJson(storage);
  let snapshotOk = false;
  if (roundTrip) {
    try {
      const parsed = JSON.parse(roundTrip) as SaveProfile;
      snapshotOk = parsed.clubName === sampleProfile.clubName && parsed.coins === sampleProfile.coins;
    } catch {
      snapshotOk = false;
    }
  }
  recordBackupAt(now - 1000, storage);
  snapshotOk = snapshotOk && lastBackupAt(storage) === now - 1000;
  clearPreviousClub(storage);
  snapshotOk = snapshotOk && !hasPreviousClub(storage);
  const debounceOk = AUTO_BACKUP_DEBOUNCE_MS >= 5_000 && AUTO_BACKUP_DEBOUNCE_MS <= 60_000 && STALE_BACKUP_MS === 7 * 86_400_000;
  return {
    ageLabelOk, staleOk, snapshotOk, debounceOk,
    detail: `debounce ${AUTO_BACKUP_DEBOUNCE_MS / 1000}s · stale after 7d · undo snapshot round-trips (${sampleProfile.clubName})`,
  };
}
