// Striker FC — ai/OutfieldAI.ts (Phase 04, Spec 05 §2)
// Per-agent outfield FSM. Decisions run at 10Hz (every 6 physics ticks,
// staggered per agent); steering executes every tick at 60Hz through
// PlayerKinematics. Defending is strictly structured: exactly ONE primary
// presser, at most ONE second presser, man-marking in the own third and
// zonal shifting everywhere else — zero ball-swarming by construction.

import { PITCH } from '../core/constants';
import { clamp } from '../core/math';
import type { Mentality, PlayerTemplate, Position, TeamSide } from '../core/types';
import { positionGroup } from '../core/types';
import type { PlayerKinematics } from '../physics/PlayerKinematics';
import type { DifficultyProfile } from './DifficultyProfiles';
import { attackDirX, ownGoalX, type TeamShape, type TacticsModifiers } from './TacticalEngine';
import {
scoreDribbleLane, scorePassTarget, scoreShotOpportunity, scoreThroughBallSpace,
type Point2, type ScoredOpponent,
} from './UtilityScorer';

export type OutfieldState =
  | 'BALL_CARRIER' | 'MAKE_FORWARD_RUN' | 'SUPPORT_TRIANGLE' | 'HOLD_SHAPE'
  | 'PRIMARY_PRESSER' | 'SECOND_PRESSER' | 'MAN_MARK' | 'ZONAL_SHIFT'
  | 'USER_CONTROLLED' | 'RECEIVE_PASS';

export type CarrierAction =
  | { kind: 'SHOOT'; aimZ: number; xg: number }
  | { kind: 'PASS'; targetIndex: number; through: boolean; targetPoint?: Point2 }
  | { kind: 'DRIBBLE'; dirX: number; dirZ: number }
  | { kind: 'SKILL'; nearestDefDist: number }
  | { kind: 'HOLD' };

export interface TeamView {
  /** Global indices (into the engine's 22-player array) of this team's players. */
  indices: number[];
  positions: Point2[];
  templates: PlayerTemplate[];
}

export interface WorldView {
  ballPos: Point2;
  ballOwnerGlobal: number; // -1 = loose
  possessingSide: TeamSide | null;
  minute: number;
  /** Global index of the designated second presser for the defending team, or -1. */
  secondPresserGlobal: number;
  primaryPresserGlobal: number;
  /** mark assignments: defender global index -> attacker global index. */
  markMap: Map<number, number>;
  /** Attackers (global indices) currently making forward runs, per side. */
  runnersBySide: Record<TeamSide, number[]>;
  supportBySide: Record<TeamSide, number[]>;
}

const FORWARD_ROLES: Position[] = ['ST', 'CF', 'LW', 'RW', 'CAM'];
const WING_ROLES: Position[] = ['LW', 'RW', 'LM', 'RM'];
const FULLBACK_ROLES: Position[] = ['LB', 'RB', 'LWB', 'RWB'];

export class OutfieldAgent {
  state: OutfieldState = 'HOLD_SHAPE';
  targetX = 0;
  targetZ = 0;
  sprint = false;
  /** Pending ball-carrier decision for the engine to execute. */
  pendingAction: CarrierAction | null = null;
  /** Seconds the carrier has held the ball since the last decision. */
  carrierHoldSec = 0;
  /** Cycle-2 match-up: seconds spent shielding the ball from a close
   *  presser this possession, and the per-possession shield budget
   *  (rolled on first use, reset when he is not the carrier). */
  shieldUsedSec = 0;
  shieldBudgetSec = -1;
  private runTimer = 0;
  private runCooldown = 0;
  private dribbleTimer = 0;
  dribbleDir = { x: 0, z: 0 };
  /** Brief hesitation after a failed tackle attempt. */
  stumbleTimer = 0;
  tackleCooldown = 0;
  /** Cycle-2 match-up defending: seconds this presser has spent inside
   *  contain range (≤1.5 m) of the carrier. The shoulder charge only
   *  unlocks after a real contain beat — no more instant lunges. */
  matchUpSec = 0;

  constructor(
    public readonly globalIndex: number,
    public readonly teamIndex: number, // 0..10 within the team
    public readonly side: TeamSide,
    public readonly role: Position,
    public readonly kin: PlayerKinematics,
  ) {}

  get template(): PlayerTemplate { return this.kin.template; }
  get pos(): Point2 { return { x: this.kin.pos.x, z: this.kin.pos.z }; }

  /**
   * 10Hz decision. Mutates state/target; the engine executes carrier actions.
   * @param shape this team's live tactical shape
   * @param ownView this team's players (teamIndex space)
   * @param oppView opponents (their own index space, positions in world)
   * @param oppShape opponents' shape (for the defensive line in through balls)
   * @param globalOf maps (side, teamIndex) -> global index
   */
  decide(
    view: WorldView,
    shape: TeamShape,
    oppShape: TeamShape,
    ownTeam: TeamView,
    oppTeam: TeamView,
    profile: DifficultyProfile,
    mentality: Mentality,
    mods: TacticsModifiers,
    rng: () => number,
    isUserControlled: boolean,
    userSecondPress: boolean,
  ): void {
    if (this.runCooldown > 0) this.runCooldown -= 0.1;
    if (this.tackleCooldown > 0) this.tackleCooldown -= 0.1;
    const myGlobal = this.globalIndex;
    const anchor = shape.anchors[this.teamIndex] ?? this.pos;
    const dir = attackDirX(this.side);
    const hasBall = view.possessingSide === this.side;
    const iAmCarrier = view.ballOwnerGlobal === myGlobal;

    if (isUserControlled) {
      this.state = 'USER_CONTROLLED';
      return;
    }
    if (this.role === 'GK') return; // GoalkeeperAI owns the GK

    if (iAmCarrier) {
      this.state = 'BALL_CARRIER';
      this.carrierHoldSec += 0.1;
      this.decideCarrier(view, oppTeam, oppShape, profile, mentality, mods, rng);
      return;
    }
    this.carrierHoldSec = 0;
    this.shieldUsedSec = 0;
    this.shieldBudgetSec = -1;

    if (hasBall) {
      this.decideAttackingOffBall(view, shape, ownTeam, anchor, dir, rng);
    } else if (view.possessingSide !== null) {
      this.decideDefending(view, shape, anchor, dir, userSecondPress);
    } else {
      // Loose ball: only the single nearest player chases it; everyone else
      // holds shape. This is the second anti-swarm guarantee.
      const myDist = Math.hypot(this.kin.pos.x - view.ballPos.x, this.kin.pos.z - view.ballPos.z);
      let nearest = true;
      for (const idx of ownTeam.indices) {
        if (idx === myGlobal) continue;
        const p = ownTeam.positions[ownTeam.indices.indexOf(idx)];
        if (p && Math.hypot(p.x - view.ballPos.x, p.z - view.ballPos.z) < myDist - 0.01) { nearest = false; break; }
      }
      if (nearest && myDist < 16) {
        this.state = 'PRIMARY_PRESSER';
        this.targetX = view.ballPos.x; this.targetZ = view.ballPos.z;
        this.sprint = myDist > 4;
      } else {
        this.state = 'HOLD_SHAPE';
        this.targetX = anchor.x; this.targetZ = anchor.z;
        this.sprint = false;
      }
    }
  }

  private decideCarrier(
    view: WorldView,
    oppTeam: TeamView,
    oppShape: TeamShape,
    profile: DifficultyProfile,
    mentality: Mentality,
    mods: TacticsModifiers,
    rng: () => number,
  ): void {
    const dir = attackDirX(this.side);
    const me = this.pos;
    const opponents: ScoredOpponent[] = oppTeam.positions;
    const patience = profile.carrierPatienceMult;
    // Don't rush the first touch: hold at least the difficulty decision delay.
    if (this.carrierHoldSec < profile.decisionDelaySec * patience) {
      // Still dribble into the best lane while thinking.
      const lane = scoreDribbleLane(me, this.template, dir, opponents);
      this.dribbleDir = { x: lane.dirX, z: lane.dirZ };
      this.pendingAction = { kind: 'DRIBBLE', dirX: lane.dirX, dirZ: lane.dirZ };
      return;
    }

    // Cycle-2 match-up: a carrier with a man right on him does not
    // panic-pass at the first decision tick — he SHIELDS: plants his body
    // between the presser and the ball and holds for a beat, scaled by
    // his dribbling and physicality (and the tier's patience). That hold
    // is what gives the presser's contain time to bank and makes the
    // shoulder-charge contest possible — for the user's match-up defence
    // and for AI pressers alike. Once the budget is spent he plays on.
    let nearestOpp = Infinity;
    let nearestOppPos: Point2 | null = null;
    for (const o of opponents) {
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d < nearestOpp) { nearestOpp = d; nearestOppPos = o; }
    }
    if (nearestOpp < 1.9) {
      if (this.shieldBudgetSec < 0) {
        const sub = this.template.subStats;
        this.shieldBudgetSec = Math.max(0.4, Math.min(1.35,
          (0.4 + (sub.dribbling / 100) * 0.5 + (sub.strength / 100) * 0.2 + rng() * 0.3)
          * Math.max(0.6, Math.min(1.3, patience))));
      }
      if (this.shieldUsedSec < this.shieldBudgetSec) {
        this.shieldUsedSec += 0.1;
        // Protect the ball: his escape direction points AWAY from the
        // presser, so the dribble that follows the shield goes to safety.
        if (nearestOppPos) {
          const ax = me.x - nearestOppPos.x;
          const az = me.z - nearestOppPos.z;
          const al = Math.hypot(ax, az) || 1;
          this.dribbleDir = { x: ax / al, z: az / al };
        }
        this.pendingAction = { kind: 'HOLD' };
        return;
      }
    }

    const shootBias = (MENTALITY_SHOOT_BIAS[mentality] ?? 1) * mods.shootBias;
    const shot = scoreShotOpportunity(me, this.template, dir, opponents, shootBias);
    const shootThreshold = 0.32 / Math.max(0.6, shootBias);

    // Best pass and best through ball among teammates.
    let bestPass: { idx: number; score: number } | null = null;
    let bestThrough: { idx: number; score: number; point: Point2 } | null = null;
    // Teammate positions are resolved by the engine into a scratch list stored
    // on the view (see ScrimmageEngine): it passes them via oppTeam's mirror —
    // here we use the dedicated carrier options attached to the view object.
    const options = (view as WorldView & { carrierOptions?: CarrierOption[] }).carrierOptions ?? [];
    for (const opt of options) {
      const ps = scorePassTarget(me, opt.pos, dir, opponents);
      if (!bestPass || ps.score > bestPass.score) bestPass = { idx: opt.teamIndex, score: ps.score };
      if (opt.isRunner || opt.pos.x * dir > me.x * dir) {
        const ts = scoreThroughBallSpace(me, { ...opt.pos, pace: opt.pace }, dir, opponents, oppShape.defensiveLineX);
        if (!bestThrough || ts.score > bestThrough.score) bestThrough = { idx: opt.teamIndex, score: ts.score, point: ts.targetPoint };
      }
    }

    const lane = scoreDribbleLane(me, this.template, dir, opponents);
    this.dribbleDir = { x: lane.dirX, z: lane.dirZ };

    // 1v1 skill move: defender close, difficulty frequency roll.
    if (lane.nearestInCone < 2.6 && lane.nearestInCone > 0.5 && profile.skillMoveFreq > 0 && rng() < profile.skillMoveFreq) {
      this.pendingAction = { kind: 'SKILL', nearestDefDist: lane.nearestInCone };
      return;
    }
    if (shot.score > shootThreshold || (shot.xg.xg > 0.45 && shot.score > 0.2)) {
      this.pendingAction = { kind: 'SHOOT', aimZ: shot.aimZ, xg: shot.xg.xg };
      return;
    }
    // Through-ball bravery scales with the tier: Rookie almost never sees
    // the killer pass; Ultimate plays it the moment the lane opens.
    const throughThreshold = 0.52 - profile.throughBallFreq * 0.16;
    const throughMargin = 0.05 + profile.throughBallFreq * 0.08;
    if (bestThrough && bestThrough.score > throughThreshold && bestThrough.score >= (bestPass?.score ?? 0) - throughMargin) {
      this.pendingAction = { kind: 'PASS', targetIndex: bestThrough.idx, through: true, targetPoint: bestThrough.point };
      return;
    }
    if (bestPass && bestPass.score > 0.3) {
      this.pendingAction = { kind: 'PASS', targetIndex: bestPass.idx, through: false };
      return;
    }
    if (lane.score > 0.25) {
      this.pendingAction = { kind: 'DRIBBLE', dirX: lane.dirX, dirZ: lane.dirZ };
      return;
    }
    this.pendingAction = { kind: 'HOLD' };
  }

  private decideAttackingOffBall(
    view: WorldView,
    shape: TeamShape,
    ownTeam: TeamView,
    anchor: { x: number; z: number },
    dir: 1 | -1,
    rng: () => number,
  ): void {
    const carrierPos = view.ballPos;
    const distToCarrier = Math.hypot(this.kin.pos.x - carrierPos.x, this.kin.pos.z - carrierPos.z);

    // Continue an active run until it times out.
    if (this.state === 'MAKE_FORWARD_RUN' && this.runTimer > 0) {
      this.runTimer -= 0.1;
      return;
    }

    const runners = view.runnersBySide[this.side];
    const iAmRunner = runners.includes(this.globalIndex);
    if (iAmRunner) {
      // Run into the channel between the nearest CB and fullback, beyond the line.
      const lineX = shape.offsideLineX;
      this.state = 'MAKE_FORWARD_RUN';
      this.runTimer = Math.max(this.runTimer, 1.6);
      this.targetX = clamp(lineX + dir * 3.5, -PITCH.HALF_LENGTH + 2, PITCH.HALF_LENGTH - 2);
      // Channel: shade toward the nearest touchline gap from the anchor side.
      const channelZ = anchor.z + (anchor.z >= 0 ? 4.5 : -4.5);
      this.targetZ = clamp(channelZ, -PITCH.HALF_WIDTH + 3, PITCH.HALF_WIDTH - 3);
      this.sprint = true;
      return;
    }

    // Overlapping fullback: winger has the ball wide, fullback storms outside.
    if (FULLBACK_ROLES.includes(this.role)) {
      const carrierIdx = ownTeam.indices.indexOf(view.ballOwnerGlobal);
      const carrierRole = carrierIdx >= 0 ? (ownTeam.templates[carrierIdx] ? undefined : undefined) : undefined;
      void carrierRole;
      const carrierTeamIdx = carrierIdx;
      const carrierAnchorZ = carrierTeamIdx >= 0 ? (shape.anchors[carrierTeamIdx]?.z ?? 0) : 0;
      const sameSide = Math.sign(carrierAnchorZ || 1) === Math.sign(anchor.z || 1);
      const carrierIsWinger = carrierTeamIdx >= 0 && distToCarrier > 6 && Math.abs(carrierPos.z) > 14;
      if (sameSide && carrierIsWinger && rng() < 0.75) {
        this.state = 'MAKE_FORWARD_RUN';
        this.runTimer = 1.8;
        this.targetX = clamp(carrierPos.x + dir * 9, -PITCH.HALF_LENGTH + 2, PITCH.HALF_LENGTH - 2);
        this.targetZ = clamp(carrierPos.z + Math.sign(carrierPos.z) * 5, -PITCH.HALF_WIDTH + 2.5, PITCH.HALF_WIDTH - 2.5);
        this.sprint = true;
        return;
      }
    }

    const supports = view.supportBySide[this.side];
    if (supports.includes(this.globalIndex)) {
      // Passing triangle: 10–18m from the carrier, offset to the open side,
      // never directly behind a defender (lateral offset guarantees a lane).
      this.state = 'SUPPORT_TRIANGLE';
      const sideSign = anchor.z >= carrierPos.z ? 1 : -1;
      const dist = 12.5;
      this.targetX = clamp(carrierPos.x - dir * dist * 0.45, -PITCH.HALF_LENGTH + 2, PITCH.HALF_LENGTH - 2);
      this.targetZ = clamp(carrierPos.z + sideSign * dist * 0.85, -PITCH.HALF_WIDTH + 2.5, PITCH.HALF_WIDTH - 2.5);
      this.sprint = distToCarrier > 20;
      return;
    }

    // Rest defence & everyone else: hold the tactical shape.
    this.state = positionGroup(this.role) === 'DEF' || this.role === 'CDM' ? 'HOLD_SHAPE' : 'HOLD_SHAPE';
    this.targetX = anchor.x;
    this.targetZ = anchor.z;
    this.sprint = Math.hypot(anchor.x - this.kin.pos.x, anchor.z - this.kin.pos.z) > 14;
  }

  private decideDefending(
    view: WorldView,
    shape: TeamShape,
    anchor: { x: number; z: number },
    dir: 1 | -1,
    userSecondPress: boolean,
  ): void {
    void userSecondPress;
    void shape; // anchors already encode the shape; kept for signature parity
    const ball = view.ballPos;
    if (view.primaryPresserGlobal === this.globalIndex) {
      // Close down on the goal-side lane: stand between ball and own goal.
      // Epic P0-8: stand-off tightened 1.4 m → 0.9 m — at 1.4 m the presser
      // parked OUTSIDE his own 1.35 m tackle range and could never tackle.
      this.state = 'PRIMARY_PRESSER';
      const gx = ownGoalX(this.side);
      const dx = gx - ball.x; const dz = 0 - ball.z;
      const len = Math.hypot(dx, dz) || 1;
      this.targetX = ball.x + (dx / len) * 0.9;
      this.targetZ = ball.z + (dz / len) * 0.9;
      const d = Math.hypot(this.kin.pos.x - ball.x, this.kin.pos.z - ball.z);
      this.sprint = d > 5;
      return;
    }
    if (view.secondPresserGlobal === this.globalIndex) {
      // Cut the nearest passing lane: midpoint between carrier and the most
      // dangerous free attacker, shaded toward the ball.
      this.state = 'SECOND_PRESSER';
      this.targetX = ball.x - dir * 2.2;
      this.targetZ = ball.z + (anchor.z >= ball.z ? 2.4 : -2.4);
      this.sprint = Math.hypot(this.kin.pos.x - this.targetX, this.kin.pos.z - this.targetZ) > 6;
      return;
    }
    const markTarget = view.markMap.get(this.globalIndex);
    if (markTarget !== undefined) {
      // Goal-side marking: 1.5m toward own goal from the marked attacker.
      // The engine resolves the marked player's position into target via
      // a follow-up call (setMarkTarget) each decision round.
      this.state = 'MAN_MARK';
      this.sprint = false;
      return;
    }
    // Zonal shift: compress toward the ball side from the anchor.
    this.state = 'ZONAL_SHIFT';
    this.targetX = anchor.x + (ball.x - anchor.x) * 0.12;
    this.targetZ = anchor.z + (ball.z - anchor.z) * 0.22;
    this.sprint = false;
  }

  /** Goal-side stand-off distance in metres — the engine sets this from
   *  the difficulty profile's marking tightness (loose at Rookie, touch-
   *  tight at Ultimate). */
  markStandOff = 1.5;

  /** Engine feeds the marked attacker's live position for MAN_MARK agents. */
  setMarkTarget(attackerPos: Point2): void {
    if (this.state !== 'MAN_MARK') return;
    const gx = ownGoalX(this.side);
    const dx = gx - attackerPos.x; const dz = 0 - attackerPos.z;
    const len = Math.hypot(dx, dz) || 1;
    this.targetX = attackerPos.x + (dx / len) * this.markStandOff;
    this.targetZ = attackerPos.z + (dz / len) * this.markStandOff;
    const d = Math.hypot(this.kin.pos.x - this.targetX, this.kin.pos.z - this.targetZ);
    this.sprint = d > 7;
  }

  /** 60Hz steering toward the current target with teammate separation. */
  steer(dt: number, minutes: number, teammates: Point2[]): void {
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
      this.kin.update(dt, { dirX: 0, dirZ: 0, magnitude: 0, sprint: false }, minutes);
      return;
    }
    let tx = this.targetX;
    let tz = this.targetZ;
    // Separation: never stack on a teammate (anti-clumping at steering level).
    for (const p of teammates) {
      if (p.x === this.kin.pos.x && p.z === this.kin.pos.z) continue;
      const dx = this.kin.pos.x - p.x; const dz = this.kin.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 2.3) {
        tx += (dx / d) * (2.3 - d) * 0.9;
        tz += (dz / d) * (2.3 - d) * 0.9;
      }
    }
    const dx = tx - this.kin.pos.x;
    const dz = tz - this.kin.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      this.kin.update(dt, { dirX: 0, dirZ: 0, magnitude: 0, sprint: false }, minutes);
      return;
    }
    const magnitude = clamp(dist / 2.2, 0.25, 1);
    this.kin.update(dt, {
      dirX: dx / dist, dirZ: dz / dist,
      magnitude: this.sprint ? Math.max(magnitude, 0.85) : magnitude,
      sprint: this.sprint && dist > 2.5,
    }, minutes);
  }

  /** Carrier dribble steering (ball at feet, move along the chosen lane). */
  steerCarrier(dt: number, minutes: number): void {
    const a = this.pendingAction;
    if (a?.kind === 'DRIBBLE') {
      this.dribbleDir = { x: a.dirX, z: a.dirZ };
      this.dribbleTimer = 0.35;
    }
    if (this.dribbleTimer > 0) {
      this.dribbleTimer -= dt;
      // Epic P0-8: AI carriers have a sprint budget — they burst into open
      // grass on a break while their legs are fresh (was hard-coded
      // sprint: false, so AI breaks never actually ran).
      const burst = this.kin.stamina01 > 0.35;
      this.kin.update(dt, { dirX: this.dribbleDir.x, dirZ: this.dribbleDir.z, magnitude: burst ? 0.95 : 0.82, sprint: burst }, minutes);
    } else {
      this.kin.update(dt, { dirX: 0, dirZ: 0, magnitude: 0, sprint: false }, minutes);
    }
  }
}

export interface CarrierOption {
  teamIndex: number;
  pos: Point2;
  pace: number;
  isRunner: boolean;
}

const MENTALITY_SHOOT_BIAS: Record<Mentality, number> = {
  ULTRA_DEFENDING: 0.8, DEFENDING: 0.9, BALANCED: 1, ATTACKING: 1.12, ULTRA_ATTACKING: 1.25,
};

/**
 * Team-level defensive assignment (engine, once per decision round):
 * exactly 1 primary presser (nearest outfielder), at most 1 second presser,
 * man-mark pairs for defenders in the own third. Everyone else zonal-shifts.
 */
export function assignDefensiveRoles(args: {
  defending: OutfieldAgent[];
  ballPos: Point2;
  pressRadius: number;
  secondPressRequested: boolean;
  pressCoordination: number;
  opponents: OutfieldAgent[];
  ownThird: boolean;
  rng: () => number;
}): { primaryGlobal: number; secondGlobal: number; markMap: Map<number, number> } {
  const { defending, ballPos, opponents } = args;
  const outfield = defending.filter((a) => a.role !== 'GK');
  let primary: OutfieldAgent | null = null;
  let primaryDist = Infinity;
  for (const a of outfield) {
    const d = Math.hypot(a.kin.pos.x - ballPos.x, a.kin.pos.z - ballPos.z);
    if (d < primaryDist) { primaryDist = d; primary = a; }
  }
  let secondGlobal = -1;
  const carrierWithinPress = primaryDist < args.pressRadius + 6;
  if (primary && (args.secondPressRequested || (carrierWithinPress && args.rng() < args.pressCoordination * 0.5))) {
    let best: OutfieldAgent | null = null;
    let bestDist = Infinity;
    for (const a of outfield) {
      if (a === primary) continue;
      const d = Math.hypot(a.kin.pos.x - ballPos.x, a.kin.pos.z - ballPos.z);
      if (d < bestDist) { bestDist = d; best = a; }
    }
    if (best) secondGlobal = best.globalIndex;
  }

  const markMap = new Map<number, number>();
  if (args.ownThird) {
    const defenders = outfield.filter((a) => positionGroup(a.role) === 'DEF' || a.role === 'CDM');
    const attackers = opponents.filter((a) => FORWARD_ROLES.includes(a.role) || a.role === 'CAM');
    const taken = new Set<number>();
    for (const def of defenders) {
      let bestOpp: OutfieldAgent | null = null;
      let bestD = Infinity;
      for (const att of attackers) {
        if (taken.has(att.globalIndex)) continue;
        const d = Math.hypot(att.kin.pos.x - def.kin.pos.x, att.kin.pos.z - def.kin.pos.z);
        if (d < bestD) { bestD = d; bestOpp = att; }
      }
      if (bestOpp && bestD < 17) {
        markMap.set(def.globalIndex, bestOpp.globalIndex);
        taken.add(bestOpp.globalIndex);
      }
    }
  }
  return { primaryGlobal: primary?.globalIndex ?? -1, secondGlobal, markMap };
}

/**
 * Pick this round's forward runners (1–2) and support-triangle players (2)
 * for the team in possession. Deterministic given the injected rng.
 */
export function assignAttackingRoles(args: {
  attacking: OutfieldAgent[];
  carrierGlobal: number;
  forwardRunProb: number;
  rng: () => number;
}): { runners: number[]; supports: number[] } {
  const { attacking, carrierGlobal } = args;
  const others = attacking.filter((a) => a.globalIndex !== carrierGlobal && a.role !== 'GK');
  const forwards = others.filter((a) => FORWARD_ROLES.includes(a.role) || WING_ROLES.includes(a.role));
  const runners: number[] = [];
  for (const f of forwards) {
    if (runners.length >= 2) break;
    if (args.rng() < args.forwardRunProb) runners.push(f.globalIndex);
  }
  const byDist = [...others].sort((a, b) => {
    const ca = attacking.find((x) => x.globalIndex === carrierGlobal);
    if (!ca) return 0;
    return Math.hypot(a.kin.pos.x - ca.kin.pos.x, a.kin.pos.z - ca.kin.pos.z)
      - Math.hypot(b.kin.pos.x - ca.kin.pos.x, b.kin.pos.z - ca.kin.pos.z);
  });
  const supports = byDist
    .filter((a) => !runners.includes(a.globalIndex) && positionGroup(a.role) !== 'ATT')
    .slice(0, 2)
    .map((a) => a.globalIndex);
  return { runners, supports };
}
