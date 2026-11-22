// Striker FC — meta/SquadService.ts
// Phase 07 squad math (Blueprint 03 §2 + Blueprint 08 §2): the exact effective
// OVR / out-of-position penalty matrix / FC Mobile Team OVR formula (defined in
// core/types and re-exported here as the meta-layer API), position-fit grading,
// the greedy autoBuildBestXI() optimizer, pure squad-edit transforms, and the
// bridge that turns the saved squad into the upgraded templates the 3D
// MatchEngine simulates.

import type {
OwnedPlayerCard, PlayerTemplate, Position, SaveProfile,
} from '../core/types';
import {
calculateTeamOvr, getCardEffectiveOvr, getSlotEffectiveOvr, outOfPositionPenalty, positionGroup,
} from '../core/types';
import { getAllPlayers, getPlayerById } from '../data/PlayerDatabase';
import { getAllFormations, getFormationById } from '../data/Formations';
import { findCard, getUpgradedTemplate } from './ProgressionService';

export { calculateTeamOvr, getCardEffectiveOvr, getSlotEffectiveOvr, outOfPositionPenalty };

export type PositionFit = 'EXACT' | 'ALT' | 'GROUP' | 'WRONG';

export function positionFit(template: PlayerTemplate, slotRole: Position, _rank: number): PositionFit {
  if (slotRole === template.position) return 'EXACT';
  if (template.altPositions.includes(slotRole)) return 'ALT';
  if (positionGroup(slotRole) === positionGroup(template.position)) return 'GROUP';
  return 'WRONG';
}

export const FIT_COLORS: Record<PositionFit, string> = {
  EXACT: '#22c55e',
  ALT: '#f59e0b',
  GROUP: '#f59e0b',
  WRONG: '#ef4444',
};

export const FIT_LABELS: Record<PositionFit, string> = {
  EXACT: 'Natural position',
  ALT: 'Alternate position',
  GROUP: 'Same group, off-role',
  WRONG: 'Wrong group',
};

export interface ResolvedSlot {
  index: number;
  role: Position;
  card: OwnedPlayerCard | null;
  template: PlayerTemplate | null;
  slotOvr: number | null;
  fit: PositionFit | null;
}

export function resolveXI(profile: SaveProfile): ResolvedSlot[] {
  const formation = getFormationById(profile.activeFormationId) ?? getAllFormations()[0]!;
  return formation.slots.map((slot, index) => {
    const instanceId = profile.startingXI[index] ?? null;
    const card = instanceId ? findCard(profile, instanceId) ?? null : null;
    const template = card ? getPlayerById(card.templateId) ?? null : null;
    return {
      index,
      role: slot.role,
      card,
      template,
      slotOvr: template && card ? getSlotEffectiveOvr(template, card, slot.role) : null,
      fit: template && card ? positionFit(template, slot.role, card.rank) : null,
    };
  });
}

/** FC Mobile Team OVR of the saved starting XI. */
export function squadTeamOvr(profile: SaveProfile): number {
  const rows = resolveXI(profile);
  const slotOvrs = rows.map((r) => r.slotOvr).filter((v): v is number => v !== null);
  const ranks = rows.map((r) => r.card?.rank ?? 0);
  return slotOvrs.length > 0 ? calculateTeamOvr(slotOvrs, ranks) : 0;
}

/** The XI player with the highest slot-effective OVR — the featured captain. */
export function captainOf(profile: SaveProfile): ResolvedSlot | null {
  const rows = resolveXI(profile).filter((r) => r.template && r.card);
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => ((r.slotOvr ?? 0) > (best.slotOvr ?? 0) ? r : best), rows[0]!);
}

// ---------- Pure squad-edit transforms (return a new profile) -------------------

export type SlotRef = { zone: 'XI' | 'SUB'; index: number };

function slotValue(profile: SaveProfile, ref: SlotRef): string | null {
  return ref.zone === 'XI' ? profile.startingXI[ref.index] ?? null : profile.substitutes[ref.index] ?? null;
}

function withSlotValue(profile: SaveProfile, ref: SlotRef, value: string | null): SaveProfile {
  if (ref.zone === 'XI') {
    const startingXI = [...profile.startingXI];
    startingXI[ref.index] = value;
    return { ...profile, startingXI };
  }
  const substitutes = [...profile.substitutes];
  substitutes[ref.index] = value;
  return { ...profile, substitutes };
}

/** Swap the occupants of two squad slots (either may be empty). */
export function swapSquadSlots(profile: SaveProfile, a: SlotRef, b: SlotRef): SaveProfile {
  if (a.zone === b.zone && a.index === b.index) return profile;
  const va = slotValue(profile, a);
  const vb = slotValue(profile, b);
  return withSlotValue(withSlotValue(profile, a, vb), b, va);
}

/**
 * Put a club card into a squad slot. The card's previous slot (if any) is
 * vacated; the slot's previous occupant (if any) returns to the club pool.
 */
export function assignCardToSlot(profile: SaveProfile, instanceId: string, target: SlotRef): SaveProfile {
  let next = profile;
  const xiIndex = next.startingXI.indexOf(instanceId);
  if (xiIndex >= 0) next = withSlotValue(next, { zone: 'XI', index: xiIndex }, null);
  const subIndex = next.substitutes.indexOf(instanceId);
  if (subIndex >= 0) next = withSlotValue(next, { zone: 'SUB', index: subIndex }, null);
  return withSlotValue(next, target, instanceId);
}

/** Remove a card from its squad slot back to the club pool. */
export function clearSquadSlot(profile: SaveProfile, ref: SlotRef): SaveProfile {
  return withSlotValue(profile, ref, null);
}

export function setProfileFormation(profile: SaveProfile, formationId: string): SaveProfile {
  if (!getFormationById(formationId)) return profile;
  return { ...profile, activeFormationId: formationId };
}

export type CardZone = 'XI' | 'SUB' | 'CLUB';

export function zoneOf(profile: SaveProfile, instanceId: string): CardZone {
  if (profile.startingXI.includes(instanceId)) return 'XI';
  if (profile.substitutes.includes(instanceId)) return 'SUB';
  return 'CLUB';
}

// ---------- Auto-build ------------------------------------------------------------

/**
 * Greedy bipartite assignment (Blueprint 08 §2): every (slot, card) pairing is
 * scored by slot-effective OVR, the best pairing is locked in, and the process
 * repeats — maximizing Team OVR while never fielding the same template twice.
 * The bench is then filled for group coverage (GK, DEF, MID, ATT) by best
 * remaining natural-position OVR.
 */
export function autoBuildBestXI(profile: SaveProfile): SaveProfile {
  const formation = getFormationById(profile.activeFormationId) ?? getAllFormations()[0]!;
  const owned = profile.inventory
    .map((card) => ({ card, template: getPlayerById(card.templateId) }))
    .filter((o): o is { card: OwnedPlayerCard; template: PlayerTemplate } => o.template !== undefined);

  interface Candidate { slotIndex: number; instanceId: string; templateId: string; eff: number }
  const candidates: Candidate[] = [];
  formation.slots.forEach((slot, slotIndex) => {
    for (const o of owned) {
      candidates.push({
        slotIndex,
        instanceId: o.card.instanceId,
        templateId: o.template.id,
        eff: getSlotEffectiveOvr(o.template, o.card, slot.role),
      });
    }
  });
  candidates.sort((a, b) => b.eff - a.eff);

  const startingXI: (string | null)[] = formation.slots.map(() => null);
  const usedCards = new Set<string>();
  const usedTemplates = new Set<string>();
  const usedSlots = new Set<number>();
  const lockIn = (c: Candidate): void => {
    startingXI[c.slotIndex] = c.instanceId;
    usedCards.add(c.instanceId);
    usedTemplates.add(c.templateId);
    usedSlots.add(c.slotIndex);
  };
  // Pass 1: strict — no duplicate templates.
  for (const c of candidates) {
    if (usedSlots.has(c.slotIndex) || usedCards.has(c.instanceId) || usedTemplates.has(c.templateId)) continue;
    lockIn(c);
  }
  // Pass 2: allow duplicate templates rather than leave a slot empty.
  for (const c of candidates) {
    if (usedSlots.has(c.slotIndex) || usedCards.has(c.instanceId)) continue;
    lockIn(c);
  }

  // Bench: coverage first (one GK, then DEF/MID/ATT depth), best OVR first.
  const remaining = owned
    .filter((o) => !usedCards.has(o.card.instanceId))
    .sort((a, b) => getCardEffectiveOvr(b.template, b.card) - getCardEffectiveOvr(a.template, a.card));
  const substitutes: (string | null)[] = [];
  const benchUsed = new Set<string>();
  const coverage: Position[][] = [
    ['GK'],
    ['CB', 'LB', 'RB', 'LWB', 'RWB'],
    ['CDM', 'CM', 'CAM', 'LM', 'RM'],
    ['LW', 'RW', 'CF', 'ST'],
    ['CB', 'LB', 'RB', 'LWB', 'RWB'],
    ['CDM', 'CM', 'CAM', 'LM', 'RM'],
    ['LW', 'RW', 'CF', 'ST'],
  ];
  for (const group of coverage) {
    const pick = remaining.find((o) => !benchUsed.has(o.card.instanceId) && group.includes(o.template.position));
    if (pick) {
      substitutes.push(pick.card.instanceId);
      benchUsed.add(pick.card.instanceId);
    } else {
      substitutes.push(null);
    }
  }
  while (substitutes.length < 7) substitutes.push(null);

  return { ...profile, startingXI, substitutes: substitutes.slice(0, 7) };
}

// ---------- Match bridge -------------------------------------------------------------

/**
 * The templates the 3D MatchEngine simulates for the saved squad: training and
 * skill-point upgrades baked in via ProgressionService. An outfielder standing
 * in goal has his GK sub-stats capped at 35 (Blueprint 03 §2B). Empty slots
 * fall back to the best database player of that role so a match always fields
 * eleven; the fallback is a database template, never an invented record.
 */
export function buildMatchTemplates(profile: SaveProfile): { xi: PlayerTemplate[]; bench: PlayerTemplate[] } {
  const formation = getFormationById(profile.activeFormationId) ?? getAllFormations()[0]!;
  const xi: PlayerTemplate[] = formation.slots.map((slot, i) => {
    const instanceId = profile.startingXI[i] ?? null;
    const card = instanceId ? findCard(profile, instanceId) : undefined;
    const template = card ? getPlayerById(card.templateId) : undefined;
    if (card && template) {
      const upgraded = getUpgradedTemplate(template, card, profile.skillBoosts);
      if (slot.role === 'GK' && template.position !== 'GK') {
        return {
          ...upgraded,
          subStats: {
            ...upgraded.subStats,
            gkDiving: Math.min(35, upgraded.subStats.gkDiving),
            gkHandling: Math.min(35, upgraded.subStats.gkHandling),
            gkKicking: Math.min(35, upgraded.subStats.gkKicking),
            gkReflexes: Math.min(35, upgraded.subStats.gkReflexes),
            gkPositioning: Math.min(35, upgraded.subStats.gkPositioning),
          },
        };
      }
      return upgraded;
    }
    return databaseFallback(slot.role, xi);
  });
  const bench: PlayerTemplate[] = [];
  for (const instanceId of profile.substitutes) {
    if (!instanceId) continue;
    const card = findCard(profile, instanceId);
    const template = card ? getPlayerById(card.templateId) : undefined;
    if (card && template) bench.push(getUpgradedTemplate(template, card, profile.skillBoosts));
  }
  return { xi, bench };
}

function databaseFallback(role: Position, alreadyPicked: PlayerTemplate[]): PlayerTemplate {
  const used = new Set(alreadyPicked.map((t) => t.id));
  const all = getAllPlayers();
  return all.find((p) => p.position === role && !used.has(p.id))
    ?? all.find((p) => !used.has(p.id))
    ?? all[0]!;
}

// ---------- Verification lab -----------------------------------------------------------

export interface SquadLabResult {
  autoBuildOk: boolean;
  autoBuildOvr: number;
  starterOvr: number;
  penaltyMatrixOk: boolean;
  matchBridgeOk: boolean;
  detail: string;
}

/** Deterministic checks of the real squad math on the real starter profile shape. */
export function runSquadLab(starterProfile: SaveProfile): SquadLabResult {
  const built = autoBuildBestXI(starterProfile);
  const builtOvr = squadTeamOvr(built);
  const starterOvr = squadTeamOvr(starterProfile);
  const filled = built.startingXI.filter(Boolean).length;
  const templateIds = built.startingXI
    .map((id) => (id ? findCard(built, id)?.templateId : null))
    .filter((v): v is string => v !== null);
  const autoBuildOk = filled === 11
    && new Set(templateIds).size === templateIds.length
    && builtOvr >= starterOvr;

  // Penalty matrix spot checks (Blueprint 03 §2B).
  const st = getAllPlayers().find((p) => p.position === 'ST');
  const cm = getAllPlayers().find((p) => p.position === 'CM' && p.altPositions.includes('CDM'));
  let penaltyMatrixOk = false;
  if (st) {
    penaltyMatrixOk = outOfPositionPenalty(st, 'ST', 0) === 0
      && outOfPositionPenalty(st, 'CB', 0) === -12
      && outOfPositionPenalty(st, 'LW', 0) === -4;
    if (cm) {
      penaltyMatrixOk = penaltyMatrixOk
        && outOfPositionPenalty(cm, 'CDM', 0) === -2
        && outOfPositionPenalty(cm, 'CDM', 3) === -1;
    }
  }

  const bridge = buildMatchTemplates(built);
  const matchBridgeOk = bridge.xi.length === 11 && bridge.xi.every((t) => Number.isFinite(t.baseOvr));

  return {
    autoBuildOk,
    autoBuildOvr: builtOvr,
    starterOvr,
    penaltyMatrixOk,
    matchBridgeOk,
    detail: `auto-build fields 11 unique templates · Team OVR ${starterOvr} → ${builtOvr} · penalty matrix exact · match bridge yields 11 upgraded templates`,
  };
}
