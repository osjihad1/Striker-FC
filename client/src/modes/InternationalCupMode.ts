// Striker FC — modes/InternationalCupMode.ts (Epic P1-4)
// The International Cup: take one of the 32 nations through a World-Cup
// road — a 4-team group (top two advance), then R16 → QF → SF → Final.
// Your matches are real matches in the stadium (your nation's XI vs the
// drawn opponent's XI); the group's other fixture each round is simulated
// with a seeded RNG weighted by team OVR. Seven wins to be champion:
// 30,000 coins, 600 gems and a guaranteed Legend Icon Pack.

import { mulberry32 } from '../core/math';
import type { SaveProfile } from '../core/types';
import { getNationalTeam, getNationalTeams } from '../data/NationalTeams';
import { getPackById } from '../data/PacksAndQuests';
import { rollPackCards } from '../meta/PackService';

export type WorldCupStage = 'GROUP' | 'R16' | 'QF' | 'SF' | 'FINAL' | 'WON' | 'OUT';

export interface WorldCupTableRow {
  code: string;
  p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number;
}

export interface WorldCupState {
  userCode: string;
  stage: WorldCupStage;
  /** The four group codes, user first. */
  group: string[];
  table: Record<string, WorldCupTableRow>;
  /** User's group matches played (0..3). */
  groupPlayed: number;
  /** Knockout opponents already drawn, in round order. */
  knockoutOpponents: string[];
  /** Results log for the run summary. */
  log: string[];
}

const KNOCKOUT_ORDER: WorldCupStage[] = ['R16', 'QF', 'SF', 'FINAL'];

function blankRow(code: string): WorldCupTableRow {
  return { code, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
}

function applyResult(table: Record<string, WorldCupTableRow>, home: string, away: string, hg: number, ag: number): void {
  const h = table[home] ?? (table[home] = blankRow(home));
  const a = table[away] ?? (table[away] = blankRow(away));
  h.p += 1; a.p += 1;
  h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
  if (hg > ag) { h.w += 1; a.l += 1; h.pts += 3; }
  else if (hg < ag) { a.w += 1; h.l += 1; a.pts += 3; }
  else { h.d += 1; a.d += 1; h.pts += 1; a.pts += 1; }
}

function simScore(rng: () => number, ovrDiff: number): [number, number] {
  const base = 1.15 + ovrDiff * 0.045;
  const hg = Math.max(0, Math.round(base + (rng() * 2.4 - 0.7)));
  const ag = Math.max(0, Math.round(2.3 - base + (rng() * 2.4 - 0.7)));
  return [hg, ag];
}

export function startWorldCup(userCode: string, seed: number): WorldCupState | null {
  const teams = getNationalTeams();
  if (!teams.some((t) => t.code === userCode)) return null;
  const rng = mulberry32(seed);
  const others = teams.map((t) => t.code).filter((c) => c !== userCode);
  // Fisher–Yates with the seeded rng, take three group mates.
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const group = [userCode, others[0]!, others[1]!, others[2]!];
  const table: Record<string, WorldCupTableRow> = {};
  for (const code of group) table[code] = blankRow(code);
  return { userCode, stage: 'GROUP', group, table, groupPlayed: 0, knockoutOpponents: [], log: [] };
}

/** The nation's next cup opponent, or null when the run is over. */
export function worldCupNextOpponent(state: WorldCupState): string | null {
  if (state.stage === 'GROUP') {
    return state.group[state.groupPlayed + 1] ?? null;
  }
  const idx = KNOCKOUT_ORDER.indexOf(state.stage);
  if (idx >= 0) return state.knockoutOpponents[idx] ?? null;
  return null;
}

function drawKnockoutOpponent(state: WorldCupState, rng: () => number): string {
  const used = new Set([...state.group, ...state.knockoutOpponents, state.userCode]);
  const pool = getNationalTeams().map((t) => t.code).filter((c) => !used.has(c));
  return pool[Math.floor(rng() * pool.length)] ?? 'BR';
}

export interface WorldCupApplyResult {
  profile: SaveProfile;
  summary: string;
  bonusCoins: number;
  bonusGems: number;
}

/**
 * Record the user's real match result (their nation's goals first) into
 * the cup, simulate the parallel group fixture, advance the stage and pay
 * the round bonuses. Champion pays the full epic reward + Legend Icon Pack.
 */
export function applyWorldCupResult(
  profile: SaveProfile,
  userGoals: number,
  oppGoals: number,
  nowMs: number,
): WorldCupApplyResult {
  const state = profile.worldCup;
  if (!state || state.stage === 'WON' || state.stage === 'OUT') {
    return { profile, summary: '', bonusCoins: 0, bonusGems: 0 };
  }
  const opponent = worldCupNextOpponent(state);
  if (!opponent) return { profile, summary: '', bonusCoins: 0, bonusGems: 0 };
  const rng = mulberry32((nowMs & 0xffffff) ^ userGoals * 31 ^ oppGoals * 7);
  const next: WorldCupState = {
    ...state,
    table: Object.fromEntries(Object.entries(state.table).map(([k, v]) => [k, { ...v }])),
    log: [...state.log],
    knockoutOpponents: [...state.knockoutOpponents],
  };
  let coins = 0;
  let gems = 0;
  let summary = '';
  const oppName = getNationalTeam(opponent)?.name ?? opponent;
  const userName = getNationalTeam(state.userCode)?.name ?? state.userCode;

  if (state.stage === 'GROUP') {
    applyResult(next.table, state.userCode, opponent, userGoals, oppGoals);
    // The group's other fixture this round, simulated on team OVR.
    const rest = state.group.filter((c) => c !== state.userCode && c !== opponent);
    if (rest.length === 2) {
      const [hg, ag] = simScore(rng, (getNationalTeam(rest[0]!)?.teamOvr ?? 75) - (getNationalTeam(rest[1]!)?.teamOvr ?? 75));
      applyResult(next.table, rest[0]!, rest[1]!, hg, ag);
    }
    next.groupPlayed += 1;
    if (userGoals > oppGoals) coins += 1000;
    if (next.groupPlayed >= 3) {
      const standings = [...state.group].sort((a, b) => {
        const ra = next.table[a]!; const rb = next.table[b]!;
        return rb.pts - ra.pts || (rb.gf - rb.ga) - (ra.gf - ra.ga) || rb.gf - ra.gf;
      });
      const pos = standings.indexOf(state.userCode);
      if (pos <= 1) {
        next.stage = 'R16';
        next.knockoutOpponents = [drawKnockoutOpponent(next, rng)];
        summary = `${userName} finish ${pos === 0 ? 'top of the group' : 'second in the group'} — the knockouts are on. Round of 16 vs ${getNationalTeam(next.knockoutOpponents[0]!)?.name ?? ''}.`;
      } else {
        next.stage = 'OUT';
        summary = `${userName} are out at the group stage (${pos + 1}${pos === 2 ? 'rd' : 'th'}). The cup dream ends here — enter again from National Teams.`;
      }
    } else {
      summary = `Group match ${next.groupPlayed} of 3 done: ${userName} ${userGoals}–${oppGoals} ${oppName}. Next: ${getNationalTeam(worldCupNextOpponent(next) ?? '')?.name ?? ''}.`;
    }
  } else {
    // Knockout: a draw goes to penalties — a coin weighted slightly by OVR.
    let won = userGoals > oppGoals;
    let pensNote = '';
    if (userGoals === oppGoals) {
      const diff = (getNationalTeam(state.userCode)?.teamOvr ?? 75) - (getNationalTeam(opponent)?.teamOvr ?? 75);
      won = rng() < 0.5 + diff * 0.02;
      pensNote = won ? ' Won on penalties!' : ' Lost on penalties.';
    }
    if (!won) {
      next.stage = 'OUT';
      summary = `${userName} fall in the ${state.stage} to ${oppName} (${userGoals}–${oppGoals}).${pensNote}`;
    } else if (state.stage === 'FINAL') {
      next.stage = 'WON';
      coins += 30000;
      gems += 600;
      summary = `CHAMPIONS! ${userName} lift the International Cup, beating ${oppName} ${userGoals}–${oppGoals} in the final.${pensNote} +30,000 coins, +600 gems and a Legend Icon Pack!`;
    } else {
      coins += 2500;
      const nextStage = KNOCKOUT_ORDER[KNOCKOUT_ORDER.indexOf(state.stage) + 1]!;
      next.stage = nextStage;
      const drawn = drawKnockoutOpponent(next, rng);
      next.knockoutOpponents = [...next.knockoutOpponents, drawn];
      summary = `${userName} beat ${oppName} ${userGoals}–${oppGoals} in the ${state.stage}.${pensNote} +2,500 coins — ${nextStage} vs ${getNationalTeam(drawn)?.name ?? drawn} next.`;
    }
  }

  let inventory = profile.inventory;
  if (next.stage === 'WON') {
    const pack = getPackById('legend_icon');
    if (pack) {
      const pulls = rollPackCards(pack, rng, nowMs);
      inventory = [...inventory, ...pulls.map((p) => p.card)];
    }
  }
  next.log = [...next.log, summary];
  return {
    profile: { ...profile, worldCup: next, coins: profile.coins + coins, gems: profile.gems + gems, inventory },
    summary,
    bonusCoins: coins,
    bonusGems: gems,
  };
}
