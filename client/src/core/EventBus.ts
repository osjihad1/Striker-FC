// Striker FC — core/EventBus.ts
// Strongly-typed pub/sub for match & meta events (Blueprint 02 §4). No circular imports:
// modules react to events instead of importing each other.

import type { Vec3 } from './math';
import type { GameMode, MatchStats, PassType, ShotType, TeamSide } from './types';

export interface MatchEventMap {
  MATCH_KICKOFF: { period: number };
  BALL_KICKED: { playerId: string; power: number; shotType: ShotType | PassType; isShot: boolean };
  POST_HIT: { speed: number; position: Vec3 };
  GOAL_SCORED: {
    scoringSide: TeamSide;
    scorerId: string;
    assisterId: string | null;
    shotType: ShotType;
    xg: number;
    minute: number;
  };
  OFFSIDE_CALLED: { offendingPlayerId: string; offsideLineX: number; attackerX: number };
  FOUL_COMMITTED: {
    foulerId: string;
    victimId: string;
    card: 'NONE' | 'YELLOW' | 'RED';
    isPenalty: boolean;
    position: Vec3;
  };
  GK_SAVE: { gkId: string; difficulty: number; isParry: boolean };
  CROWD_EXCITEMENT: { level: number };
  MATCH_ENDED: { homeScore: number; awayScore: number; mode: GameMode; stats: MatchStats };
  /** Phase 09: a card gained training levels (drives the Train quests). */
  PLAYER_TRAINED: { instanceId: string; levelsGained: number };
  // Epic P1-2: the expanded vocabulary — audio, crowd and camera react to
  // these; every one is emitted by the engine/rules layer at its moment.
  WHISTLE: { pattern: 'KICKOFF' | 'FOUL' | 'YELLOW' | 'RED' | 'PENALTY' | 'HALF_TIME' | 'FULL_TIME' | 'DISALLOWED' };
  TACKLE_WON: { tacklerId: string; victimId: string; isSlide: boolean };
  SKILL_BEAT: { playerId: string; skillId: string };
  SHOT_OFF_TARGET: { shooterId: string; xg: number };
  BIG_SAVE: { gkId: string; difficulty: number };
  SUBSTITUTION: { side: TeamSide; offId: string; onId: string };
  CORNER_TAKEN: { side: TeamSide };
  FREE_KICK_TAKEN: { side: TeamSide; indirect: boolean };
  PENALTY_AWARDED: { side: TeamSide };
  HALF_TIME: { homeScore: number; awayScore: number };
  GOAL_CELEBRATION: { scoringSide: TeamSide; scorerId: string };
  CARD_SHOWN: { playerId: string; card: 'YELLOW' | 'RED'; reason: string };
  VAR_DECISION: { decision: string };
  /** Epic fix round: published by ScrimmageEngine the tick possession
   *  changes side, so the touch overlay's ATTACK/DEFEND layout flips
   *  instantly (event-driven) instead of waiting for the 20Hz HUD poll. */
  POSSESSION_CHANGED: { side: TeamSide; ownerId: string };
  /** Cycle-2: control changed hands — the HUD flashes the new man's name
   *  tag, the in-world ring pulses and the camera eases for 0.2 s. Fired
   *  for auto-switches, pass-receiver handovers and manual switches. */
  PLAYER_SWITCHED: { playerId: string; name: string; shortName: string; reason: 'AUTO' | 'PASS' | 'MANUAL' | 'KICKOFF' };
  /** Cycle-2: match-up defending state for the HUD contain indicator. */
  MATCH_UP: { containing: boolean };
  /** Epic P1-15: a Legendary/Ultimate opponent has read the user's
   *  favourite passing lane and adjusted — announced in commentary. */
  PATTERN_ADAPTED: { lane: 'LEFT' | 'CENTRE' | 'RIGHT' };
}

export type MatchEventType = keyof MatchEventMap;
export type MatchEventHandler<K extends MatchEventType> = (payload: MatchEventMap[K]) => void;

type HandlerSet = Set<(payload: never) => void>;

export class EventBus {
  private readonly handlers = new Map<MatchEventType, HandlerSet>();

  on<K extends MatchEventType>(type: K, handler: MatchEventHandler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (payload: never) => void);
    return () => {
      this.off(type, handler);
    };
  }

  off<K extends MatchEventType>(type: K, handler: MatchEventHandler<K>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler as (payload: never) => void);
    if (set.size === 0) this.handlers.delete(type);
  }

  emit<K extends MatchEventType>(type: K, payload: MatchEventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const handler of [...set]) {
      (handler as MatchEventHandler<K>)(payload);
    }
  }

  listenerCount(type: MatchEventType): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Shared singleton bus for the whole app. */
export const matchEventBus = new EventBus();
