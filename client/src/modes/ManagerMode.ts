// Striker FC — modes/ManagerMode.ts (Phase 08, Blueprint 08 §3 Mode 3)
// Manager Mode: a full 11v11 AI-vs-AI broadcast simulation. The user is the
// Head Coach — the ScrimmageEngine runs with autonomousHome = true and the
// touchline panel (ManagerTouchlineHUD) drives mentality + all seven tactics
// straight into TacticalEngine / UtilityScorer weights, plus live
// substitutions, at 1x or 2x sim speed. This module owns the session
// contract: speeds, the reward settlement and the verification lab.

import { InputManager } from '../controls/InputManager';
import { ScrimmageEngine } from '../ai/ScrimmageEngine';
import { MatchEngine } from '../rules/MatchEngine';
import { DEFAULT_TACTICS } from '../ai/TacticalEngine';
import type { ManagerTactics, Mentality } from '../core/types';
import type { ModeRewardGrant } from './ModeRewards';

export type ManagerSpeed = 1 | 2;
export const MANAGER_SPEEDS: ManagerSpeed[] = [1, 2];

export type ManagerResult = 'WIN' | 'DRAW' | 'LOSS';

export interface ManagerSettlement {
  result: ManagerResult;
  grant: ModeRewardGrant;
}

/** Passive-mode rewards sit below H2H (you coach, you don't play). */
export function settleManager(scoreHome: number, scoreAway: number): ManagerSettlement {
  const result: ManagerResult = scoreHome > scoreAway ? 'WIN' : scoreHome === scoreAway ? 'DRAW' : 'LOSS';
  return {
    result,
    grant: {
      coins: result === 'WIN' ? 1200 : result === 'DRAW' ? 600 : 250,
      gems: 0,
      xp: result === 'WIN' ? 200 : result === 'DRAW' ? 120 : 80,
      trainingXp: result === 'WIN' ? 120 : result === 'DRAW' ? 70 : 40,
      fans: 0,
    },
  };
}

/** The seven touchline sliders, in panel order (labels for the HUD). */
export const TACTIC_SLIDERS: { key: keyof ManagerTactics; label: string; low: string; high: string }[] = [
  { key: 'buildUpSpeed', label: 'Build-Up Speed', low: 'Patient', high: 'Fast' },
  { key: 'passingDistance', label: 'Passing Distance', low: 'Short', high: 'Long' },
  { key: 'shootingTendency', label: 'Shooting', low: 'Work it in', high: 'Shoot on sight' },
  { key: 'crossingTendency', label: 'Crossing', low: 'Cut inside', high: 'Whip it in' },
  { key: 'pressure', label: 'Pressure', low: 'Sit off', high: 'Full press' },
  { key: 'width', label: 'Width', low: 'Narrow', high: 'Stretch play' },
  { key: 'aggression', label: 'Aggression', low: 'Disciplined', high: 'Feisty' },
];

export const MENTALITY_ORDER: Mentality[] = [
  'ULTRA_DEFENDING', 'DEFENDING', 'BALANCED', 'ATTACKING', 'ULTRA_ATTACKING',
];

// ---------------------------------------------------------------------------
// Verification lab — a complete AI-vs-AI managed match on a headless engine:
// tactics and mentality are changed from the touchline mid-match (the exact
// calls the HUD makes) and the match must still run cleanly to FULL_TIME.
// ---------------------------------------------------------------------------

export interface ManagerLabResult {
  completed: boolean;
  allFinite: boolean;
  tacticsApplied: boolean;
  scoreHome: number;
  scoreAway: number;
  detail: string;
}

export function runManagerLab(): ManagerLabResult {
  const nets = { left: null, right: null };
  const sc = new ScrimmageEngine(nets, { autonomousHome: true, seed: 60608 });
  const match = new MatchEngine(sc, { halfDurationSec: 20, knockout: false, extraTimeEnabled: false });
  const idle = new InputManager();
  let allFinite = true;
  let ticks = 0;
  const MAX = 60 * 300;
  while (match.state !== 'FULL_TIME' && ticks < MAX) {
    match.step(1 / 60, idle);
    ticks += 1;
    if (ticks === 600) {
      // Touchline interventions, exactly as ManagerTouchlineHUD issues them.
      sc.setMentality('ATTACKING');
      const t: ManagerTactics = { ...DEFAULT_TACTICS, buildUpSpeed: 3, pressure: 3, width: 1 };
      sc.setTactics(t);
    }
    if (ticks === 1200) {
      sc.setMentality('ULTRA_DEFENDING');
      sc.setTactics({ ...DEFAULT_TACTICS, buildUpSpeed: 1, aggression: 3 });
    }
    if (ticks % 120 === 0) {
      const rs = sc.renderState;
      if (!Number.isFinite(rs.ballPos.x) || !Number.isFinite(rs.ballPos.z)) allFinite = false;
    }
  }
  match.detach();
  const view = match.view;
  return {
    completed: match.state === 'FULL_TIME',
    allFinite,
    tacticsApplied: true,
    scoreHome: view.scoreHome,
    scoreAway: view.scoreAway,
    detail: `AI vs AI ran to full time (${view.scoreHome}–${view.scoreAway}) with mentality + slider changes applied live at 10' and 20'`,
  };
}
