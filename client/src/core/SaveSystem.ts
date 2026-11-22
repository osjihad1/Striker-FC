// Striker FC — core/SaveSystem.ts
// IndexedDB persistence with LocalStorage fallback (Blueprint 02). On first launch it
// generates the starter profile: a balanced ~78-OVR Starting XI + 7 subs in the
// 4-3-3 Attack formation, 25,000 Coins, 500 Gems, 2 Rank-Up Tokens (Blueprint 10).

import { ECONOMY } from './constants';
import type { OwnedPlayerCard, PlayerTemplate, Position, SaveProfile } from './types';
import { calculateTeamOvr, getSlotEffectiveOvr } from './types';
import { getAllPlayers } from '../data/PlayerDatabase';
import { getFormationById, DEFAULT_FORMATION_ID } from '../data/Formations';

const DB_NAME = 'striker-fc-db';
const STORE_NAME = 'kv';
const PROFILE_KEY = 'saveProfile';
const LS_KEY = 'striker_fc_save_profile';
export const SAVE_VERSION = 1;

export type StorageBackend = 'indexeddb' | 'localstorage';

let lastBackend: StorageBackend = 'localstorage';
export function getLastStorageBackend(): StorageBackend {
  return lastBackend;
}

// ---------- Minimal IndexedDB promise wrapper ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB set failed'));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
}

// ---------- Starter profile generation ----------

function makeCard(templateId: string): OwnedPlayerCard {
  return {
    instanceId: `card_${templateId}`,
    templateId,
    trainingLevel: 0,
    trainingXp: 0,
    rank: 0,
    skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
    locked: true,
  };
}

const STARTER_TARGET_OVR = 78;

/**
 * Pick the unused non-marquee player whose OVR is closest to the 78 target for a slot:
 * exact position first, then alternate position, then same-group fillers.
 */
function pickStarter(
  pool: PlayerTemplate[],
  used: Set<string>,
  slotPosition: Position,
): PlayerTemplate | null {
  const candidates = pool.filter((p) => !used.has(p.id) && p.rarity !== 'LEGEND' && p.rarity !== 'MASTER');
  const score = (p: PlayerTemplate): number => {
    const ovrGap = Math.abs(p.baseOvr - STARTER_TARGET_OVR) * 10;
    const posBonus = p.position === slotPosition ? 0 : p.altPositions.includes(slotPosition) ? 25 : 90;
    return ovrGap + posBonus;
  };
  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0] ?? null;
}

export function generateStarterProfile(): SaveProfile {
  const formation = getFormationById(DEFAULT_FORMATION_ID);
  const pool = getAllPlayers();
  const used = new Set<string>();
  const inventory: OwnedPlayerCard[] = [];
  const startingXI: (string | null)[] = [];
  const slotOvrs: number[] = [];
  const ranks: number[] = [];

  const slots = formation?.slots ?? [];
  for (const slot of slots) {
    const picked = pickStarter(pool, used, slot.role);
    if (!picked) {
      startingXI.push(null);
      continue;
    }
    used.add(picked.id);
    const card = makeCard(picked.id);
    inventory.push(card);
    startingXI.push(card.instanceId);
    slotOvrs.push(getSlotEffectiveOvr(picked, card, slot.role));
    ranks.push(card.rank);
  }

  // Bench: 1 GK, 2 DEF, 2 MID, 2 ATT — best remaining fits near the target band.
  const benchRoles: Position[] = ['GK', 'CB', 'RB', 'CDM', 'CAM', 'LW', 'ST'];
  const substitutes: (string | null)[] = [];
  for (const role of benchRoles) {
    const picked = pickStarter(pool, used, role);
    if (!picked) {
      substitutes.push(null);
      continue;
    }
    used.add(picked.id);
    const card = makeCard(picked.id);
    inventory.push(card);
    substitutes.push(card.instanceId);
  }

  return {
    version: SAVE_VERSION,
    managerName: 'Manager',
    clubName: 'Striker FC',
    clubAbbr: 'STR',
    clubPrimaryColor: '#a3e635',
    clubSecondaryColor: '#0a120c',
    coins: ECONOMY.STARTER_COINS,
    gems: ECONOMY.STARTER_GEMS,
    rankUpTokens: ECONOMY.STARTER_RANK_UP_TOKENS,
    trainingXpPool: 0,
    inventory,
    activeFormationId: DEFAULT_FORMATION_ID,
    startingXI,
    substitutes,
    h2hDivision: 1,
    h2hStars: 0,
    vsaFans: 0,
    managerTrophies: 0,
    questProgress: {},
    seasonPassXp: 0,
    seasonPassClaimedTiers: [],
    lastDailyResetIso: new Date().toISOString(),
    tournament: null,
    skillStars: {},
    skillBestScores: {},
    attackBest: 0,
    defendBest: 0,
    lastFreePackIso: null,
    marketPrices: {},
    marketLastDriftIso: null,
    pendingSales: [],
    lastWeeklyResetIso: new Date().toISOString(),
    dailyReward: null,
    rankUpShards: 0,
    skillDaily: null,
    h2hSeason: null,
    h2hLastOpponentClubId: null,
    playAsClubId: null,
    eventTokens: 0,
    eventMilestonesClaimed: [],
    skillBoosts: {},
    career: null,
  };
}

/** Team OVR of a profile's starting XI (diagnostics + squad screens). */
export function profileTeamOvr(profile: SaveProfile): number {
  const formation = getFormationById(profile.activeFormationId);
  const byInstance = new Map(profile.inventory.map((c) => [c.instanceId, c]));
  const slotOvrs: number[] = [];
  const ranks: number[] = [];
  profile.startingXI.forEach((instanceId, i) => {
    if (!instanceId) return;
    const card = byInstance.get(instanceId);
    const slot = formation?.slots[i];
    if (!card || !slot) return;
    const template = getAllPlayers().find((p) => p.id === card.templateId);
    if (!template) return;
    slotOvrs.push(getSlotEffectiveOvr(template, card, slot.role));
    ranks.push(card.rank);
  });
  return slotOvrs.length > 0 ? calculateTeamOvr(slotOvrs, ranks) : 0;
}

// ---------- Load / save ----------

function isValidProfile(value: unknown): value is SaveProfile {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<SaveProfile>;
  return (
    typeof p.coins === 'number' &&
    typeof p.gems === 'number' &&
    Array.isArray(p.inventory) &&
    Array.isArray(p.startingXI)
  );
}

/**
 * Phase 08 forward-migration: profiles saved by Phases 01–07 predate the
 * tournament bracket and skill-games records. Fill the new fields with their
 * empty defaults without touching anything the manager already earned.
 */
export function normalizeProfile(p: SaveProfile): SaveProfile {
  return {
    ...p,
    tournament: p.tournament ?? null,
    skillStars: p.skillStars ?? {},
    skillBestScores: p.skillBestScores ?? {},
    attackBest: p.attackBest ?? 0,
    defendBest: p.defendBest ?? 0,
    // Phase 09 forward-migration: store / market / quest-reset state.
    lastFreePackIso: p.lastFreePackIso ?? null,
    marketPrices: p.marketPrices ?? {},
    marketLastDriftIso: p.marketLastDriftIso ?? null,
    pendingSales: p.pendingSales ?? [],
    lastWeeklyResetIso: p.lastWeeklyResetIso ?? p.lastDailyResetIso ?? new Date().toISOString(),
    // Lobby redesign forward-migration: the Daily Rewards streak starts empty.
    dailyReward: p.dailyReward ?? null,
    // Epic fix round forward-migration: shards / skill cap / H2H season /
    // Play-As club / event currency / boosts / career all start empty.
    rankUpShards: p.rankUpShards ?? 0,
    skillDaily: p.skillDaily ?? null,
    h2hSeason: p.h2hSeason ?? null,
    h2hLastOpponentClubId: p.h2hLastOpponentClubId ?? null,
    playAsClubId: p.playAsClubId ?? null,
    eventTokens: p.eventTokens ?? 0,
    eventMilestonesClaimed: p.eventMilestonesClaimed ?? [],
    skillBoosts: p.skillBoosts ?? {},
    career: p.career ?? null,
  };
}

/** Epic fix round (P0-7): a save that fails validation is QUARANTINED —
 *  copied verbatim to this key for inspection/recovery — never silently
 *  overwritten by a fresh starter profile. */
export const QUARANTINE_LS_KEY = 'striker_fc_quarantined_save';

export function quarantineCorruptSave(raw: string): void {
  try {
    localStorage.setItem(QUARANTINE_LS_KEY, raw);
    localStorage.setItem(`${QUARANTINE_LS_KEY}_at`, new Date().toISOString());
  } catch {
    // Quarantine is best-effort; loading continues with the starter below.
  }
}

export function getQuarantinedSave(): string | null {
  try {
    return localStorage.getItem(QUARANTINE_LS_KEY);
  } catch {
    return null;
  }
}

export async function loadProfile(): Promise<SaveProfile> {
  // 1) IndexedDB
  try {
    const raw = await idbGet(PROFILE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidProfile(parsed)) {
        lastBackend = 'indexeddb';
        return normalizeProfile(parsed);
      }
      quarantineCorruptSave(raw);
    }
  } catch {
    // fall through to LocalStorage
  }
  // 2) LocalStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidProfile(parsed)) {
        lastBackend = 'localstorage';
        return normalizeProfile(parsed);
      }
      quarantineCorruptSave(raw);
    }
  } catch {
    // storage unavailable — generate in-memory starter below
  }
  // 3) First launch: generate + persist the starter profile.
  const fresh = generateStarterProfile();
  await saveProfile(fresh);
  return fresh;
}

export async function saveProfile(profile: SaveProfile): Promise<void> {
  const raw = JSON.stringify(profile);
  try {
    await idbSet(PROFILE_KEY, raw);
    lastBackend = 'indexeddb';
    return;
  } catch {
    // fall back below
  }
  try {
    localStorage.setItem(LS_KEY, raw);
    lastBackend = 'localstorage';
  } catch {
    // Both backends unavailable (private mode): profile lives in memory only.
  }
}

/**
 * Phase 10 (Settings → Import Save JSON): parse + validate an exported save
 * file. Returns the forward-migrated profile, or null for anything that is
 * not a well-formed Striker FC save — the caller shows the refusal and the
 * live profile is never touched.
 */
export function parseProfileJson(text: string): SaveProfile | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isValidProfile(parsed)) return null;
    // Epic fix round (P0-7): full import validation — the save must carry
    // a known version (never newer than this build understands), a sane
    // manager/club identity, and well-formed card rows. Anything else is
    // refused whole; the live profile is never partially overwritten.
    const p = parsed as SaveProfile & { version?: unknown };
    if (typeof p.version !== 'number' || p.version < 1 || p.version > SAVE_VERSION) return null;
    if (typeof p.managerName !== 'string' || typeof p.clubName !== 'string') return null;
    if (!Number.isFinite(p.coins) || !Number.isFinite(p.gems) || p.coins < 0 || p.gems < 0) return null;
    const cardsOk = p.inventory.every(
      (c) => c && typeof c.instanceId === 'string' && typeof c.templateId === 'string'
        && typeof c.rank === 'number' && typeof c.trainingLevel === 'number',
    );
    if (!cardsOk) return null;
    return normalizeProfile(parsed);
  } catch {
    // not JSON at all
  }
  return null;
}

export async function resetProfile(): Promise<SaveProfile> {
  try {
    await idbDelete(PROFILE_KEY);
  } catch {
    // ignore — overwrite below anyway
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
  const fresh = generateStarterProfile();
  await saveProfile(fresh);
  return fresh;
}
