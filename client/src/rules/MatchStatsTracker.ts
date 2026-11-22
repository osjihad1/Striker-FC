// Striker FC — rules/MatchStatsTracker.ts (Phase 05)
// Full two-team match statistics: possession %, shots, shots on target, xG,
// pass attempts & accuracy, tackles won, saves, corners, offsides, fouls,
// cards — plus the 2D shot-map coordinates for every attempt.

import type { TeamSide } from '../core/types';

export interface ShotMapEntry {
  side: TeamSide;
  /** World coordinates where the shot was taken from. */
  x: number;
  z: number;
  xg: number;
  result: 'PENDING' | 'GOAL' | 'SAVED' | 'OFF_TARGET' | 'BLOCKED';
  minute: number;
}

/** Addendum 4: who scored each goal (global slot index) — feeds the
 *  Match End player ratings + Man of the Match. */
export interface GoalLogEntry {
  side: TeamSide;
  scorerGlobal: number;
}

export interface TeamStatsLine {
  possessionPct: number;
  shots: number;
  onTarget: number;
  xg: number;
  passAttempts: number;
  passCompleted: number;
  passAccuracyPct: number;
  tacklesWon: number;
  saves: number;
  corners: number;
  offsides: number;
  fouls: number;
  yellows: number;
  reds: number;
}

export interface MatchStatsSheet {
  home: TeamStatsLine;
  away: TeamStatsLine;
  shotMap: ShotMapEntry[];
  goalLog: GoalLogEntry[];
}

interface MutableLine {
  possessionSec: number;
  shots: number;
  onTarget: number;
  xg: number;
  passAttempts: number;
  passCompleted: number;
  tacklesWon: number;
  saves: number;
  corners: number;
  offsides: number;
  fouls: number;
  yellows: number;
  reds: number;
}

function blankLine(): MutableLine {
  return {
    possessionSec: 0, shots: 0, onTarget: 0, xg: 0,
    passAttempts: 0, passCompleted: 0, tacklesWon: 0, saves: 0,
    corners: 0, offsides: 0, fouls: 0, yellows: 0, reds: 0,
  };
}

const SIDES: TeamSide[] = ['HOME', 'AWAY'];

export class MatchStatsTracker {
  private readonly lines: Record<TeamSide, MutableLine> = { HOME: blankLine(), AWAY: blankLine() };
  readonly shotMap: ShotMapEntry[] = [];
  readonly goalLog: GoalLogEntry[] = [];
  /** Indices into shotMap of shots whose outcome is not yet known, per side. */
  private readonly pendingShots: Record<TeamSide, number[]> = { HOME: [], AWAY: [] };

  tickPossession(dt: number, side: TeamSide | null): void {
    if (side) this.lines[side].possessionSec += dt;
  }

  recordPassAttempt(side: TeamSide): void {
    this.lines[side].passAttempts += 1;
  }

  recordPassComplete(side: TeamSide): void {
    this.lines[side].passCompleted += 1;
  }

  /** Register a shot at the moment of the strike; returns its shot-map index. */
  recordShot(side: TeamSide, x: number, z: number, xg: number, minute: number): number {
    const line = this.lines[side];
    line.shots += 1;
    line.xg += xg;
    const idx = this.shotMap.length;
    this.shotMap.push({ side, x, z, xg, result: 'PENDING', minute });
    this.pendingShots[side].push(idx);
    return idx;
  }

  /** Resolve the oldest unresolved shot for a side (goal / save / off target / blocked). */
  resolveOldestShot(side: TeamSide, result: ShotMapEntry['result']): void {
    const idx = this.pendingShots[side].shift();
    if (idx === undefined) return;
    const entry = this.shotMap[idx];
    if (!entry) return;
    entry.result = result;
    if (result === 'GOAL' || result === 'SAVED') this.lines[side].onTarget += 1;
  }

  recordTackleWon(side: TeamSide): void {
    this.lines[side].tacklesWon += 1;
  }

  recordSave(side: TeamSide): void {
    this.lines[side].saves += 1;
  }

  recordCorner(side: TeamSide): void {
    this.lines[side].corners += 1;
  }

  recordOffside(side: TeamSide): void {
    this.lines[side].offsides += 1;
  }

  recordFoul(side: TeamSide): void {
    this.lines[side].fouls += 1;
  }

  recordCard(side: TeamSide, card: 'YELLOW' | 'RED'): void {
    if (card === 'YELLOW') this.lines[side].yellows += 1;
    else this.lines[side].reds += 1;
  }

  private toLine(side: TeamSide, totalPossSec: number): TeamStatsLine {
    const l = this.lines[side];
    return {
      possessionPct: totalPossSec > 0 ? Math.round((l.possessionSec / totalPossSec) * 100) : 50,
      shots: l.shots,
      onTarget: l.onTarget,
      xg: Math.round(l.xg * 100) / 100,
      passAttempts: l.passAttempts,
      passCompleted: l.passCompleted,
      passAccuracyPct: l.passAttempts > 0 ? Math.round((l.passCompleted / l.passAttempts) * 100) : 100,
      tacklesWon: l.tacklesWon,
      saves: l.saves,
      corners: l.corners,
      offsides: l.offsides,
      fouls: l.fouls,
      yellows: l.yellows,
      reds: l.reds,
    };
  }

  snapshot(): MatchStatsSheet {
    const total = this.lines.HOME.possessionSec + this.lines.AWAY.possessionSec;
    return {
      home: this.toLine('HOME', total),
      away: this.toLine('AWAY', total),
      shotMap: this.shotMap,
      goalLog: this.goalLog,
    };
  }

  /** Addendum 4: record a goal and its scorer (global slot index). */
  recordGoal(side: TeamSide, scorerGlobal: number): void {
    this.goalLog.push({ side, scorerGlobal });
  }

  /** Sanity helper for the verification lab: every counter is finite & sane. */
  validate(): boolean {
    for (const side of SIDES) {
      const l = this.toLine(side, 1);
      if (!Number.isFinite(l.xg) || l.onTarget > l.shots || l.passCompleted > l.passAttempts) return false;
    }
    return this.shotMap.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z));
  }

  reset(): void {
    this.lines.HOME = blankLine();
    this.lines.AWAY = blankLine();
    this.shotMap.length = 0;
    this.goalLog.length = 0;
    this.pendingShots.HOME = [];
    this.pendingShots.AWAY = [];
  }
}
