// Striker FC — store/useMetaStore.ts
// Profile, currency, inventory and squad state (Blueprint 02). Backed by SaveSystem.

import type { SaveProfile } from '../core/types';
import { getLastStorageBackend, saveProfile } from '../core/SaveSystem';
import { scheduleAutoBackup } from '../meta/CloudBackupService';
import { createStore } from './createStore';

export interface MetaState {
  profile: SaveProfile | null;
  loaded: boolean;
  storageBackend: string;
  setProfile: (profile: SaveProfile, storageBackend: string) => void;
}

export const metaStore = createStore<MetaState>({
  profile: null,
  loaded: false,
  storageBackend: '—',
  setProfile: (profile, storageBackend) => {
    metaStore.setState({ profile, storageBackend, loaded: true });
  },
});

export function useMetaStore<S>(selector: (state: MetaState) => S): S {
  return metaStore.useStore(selector);
}

/**
 * Phase 07: the single write path for profile mutations (squad edits, training,
 * rank-ups, skill points). Updates the store immediately and persists through
 * SaveSystem (IndexedDB with LocalStorage fallback) so changes survive a full
 * browser refresh.
 */
export function commitProfile(next: SaveProfile): void {
  metaStore.getState().setProfile(next, getLastStorageBackend());
  void saveProfile(next);
  // Epic fix round (P0-7): every committed change arms the debounced
  // cloud auto-backup (a no-op while Cloud Save is disabled in Settings).
  scheduleAutoBackup(next);
}
