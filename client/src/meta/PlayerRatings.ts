// Striker FC — meta/PlayerRatings.ts (Addendum 4)
// Match End player ratings (1–10) + Man of the Match, computed from the
// REAL match record: the stats sheet (possession, xG, clean sheet) and
// the goal log (who actually scored). The model is deliberately simple
// and transparent: everyone starts at 6.0, goals are worth +1.2, a clean
// sheet lifts the keeper and back line, conceding drags them, and the
// result nudges the whole side. No invented per-player events.

import type { MatchStatsSheet } from '../rules/MatchStatsTracker';
import { getPlayerById } from '../data/PlayerDatabase';

export interface RatedPlayer {
  templateId: string;
  name: string;
  position: string;
  goals: number;
  rating: number;
}

export interface MatchRatings {
  home: RatedPlayer[];
  away: RatedPlayer[];
  motm: (RatedPlayer & { side: 'HOME' | 'AWAY' }) | null;
}

const DEF_POS = new Set(['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM']);

function clampRating(v: number): number {
  return Math.round(Math.max(3, Math.min(10, v)) * 10) / 10;
}

/**
 * templateIds: the 22 slot template ids in render order (0–10 home,
 * 11–21 away) from the scrimmage render state.
 */
export function computeMatchRatings(
  templateIds: readonly string[],
  sheet: MatchStatsSheet,
  scoreHome: number,
  scoreAway: number,
): MatchRatings {
  const goalsByGlobal = new Map<number, number>();
  for (const g of sheet.goalLog) {
    goalsByGlobal.set(g.scorerGlobal, (goalsByGlobal.get(g.scorerGlobal) ?? 0) + 1);
  }
  const rateSide = (side: 'HOME' | 'AWAY'): RatedPlayer[] => {
    const mine = side === 'HOME' ? sheet.home : sheet.away;
    const theirs = side === 'HOME' ? sheet.away : sheet.home;
    const myGoals = side === 'HOME' ? scoreHome : scoreAway;
    const theirGoals = side === 'HOME' ? scoreAway : scoreHome;
    const resultAdj = myGoals > theirGoals ? 0.3 : myGoals < theirGoals ? -0.3 : 0;
    const possAdj = (mine.possessionPct - 50) * 0.006;
    const xgAdj = Math.max(-0.4, Math.min(0.4, (mine.xg - theirs.xg) * 0.12));
    const out: RatedPlayer[] = [];
    for (let i = 0; i < 11; i += 1) {
      const global = side === 'HOME' ? i : 11 + i;
      const templateId = templateIds[global];
      if (!templateId) continue;
      const tpl = getPlayerById(templateId);
      if (!tpl) continue;
      let rating = 6 + resultAdj + possAdj + xgAdj;
      const goals = goalsByGlobal.get(global) ?? 0;
      rating += goals * 1.2;
      if (DEF_POS.has(tpl.position)) {
        if (theirGoals === 0) rating += 0.8;
        else rating -= theirGoals * 0.3;
        if (tpl.position === 'GK') rating += Math.min(0.6, mine.saves * 0.12);
      }
      if (tpl.position === 'GK' && theirGoals >= 3) rating -= 0.4;
      out.push({ templateId, name: tpl.name, position: tpl.position, goals, rating: clampRating(rating) });
    }
    return out.sort((a, b) => b.rating - a.rating);
  };
  const home = rateSide('HOME');
  const away = rateSide('AWAY');
  const topHome = home[0];
  const topAway = away[0];
  const motm = topHome && topAway
    ? (topHome.rating >= topAway.rating ? { ...topHome, side: 'HOME' as const } : { ...topAway, side: 'AWAY' as const })
    : topHome ? { ...topHome, side: 'HOME' as const } : topAway ? { ...topAway, side: 'AWAY' as const } : null;
  return { home, away, motm };
}
