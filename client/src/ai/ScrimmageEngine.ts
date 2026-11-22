// Striker FC — ai/ScrimmageEngine.ts (Phase 04 integration)
// Full playable 11v11 scrimmage: TacticalEngine shapes, OutfieldAI FSMs at
// 10Hz decisions / 60Hz steering, GoalkeeperAI at both ends, the real
// BallPhysics + PassCalculator + ShotCalculator + SkillMoveEngine, and the
// user's dual controls (ATTACK layout with the ball, DEFEND without it —
// 2ND DEF calls the second presser, swipe-down / G rushes the GK out).

import { PITCH } from '../core/constants';
import { matchEventBus } from '../core/EventBus';
import { createVec3, mulberry32, type Vec3 } from '../core/math';
import type { AnimState, SkillAnimId } from '../rendering/PlayerAnimator';
import { InputManager, type GameAction } from '../controls/InputManager';
import { chooseDirectionalSwitch, chooseSwitchTarget } from '../controls/PlayerSwitcher';
import { getFormationById } from '../data/Formations';
import { getAllPlayers } from '../data/PlayerDatabase';
import type {
Difficulty, Formation, ManagerTactics, Mentality, PassType, PlayerTemplate, ShotType, TeamSide,
} from '../core/types';
import { BallPhysics } from '../physics/BallPhysics';
import { computePass, type PassCandidate } from '../physics/PassCalculator';
import { PlayerKinematics } from '../physics/PlayerKinematics';
import { computeShot } from '../physics/ShotCalculator';
import { SkillMoveEngine, SKILL_MOVES } from '../physics/SkillMoveEngine';
import type { NetRegistry } from '../physics/PracticeEngine';
import { getDifficultyProfile, type DifficultyProfile } from './DifficultyProfiles';
import { computeMatchPlan, laneOfZ, type MatchPlan, type PlanLane } from './MatchPlan';
import { GoalkeeperAI, type GkFrame } from './GoalkeeperAI';
import {
OutfieldAgent, assignAttackingRoles, assignDefensiveRoles,
type CarrierOption, type OutfieldState, type WorldView,
} from './OutfieldAI';
import {
TacticalEngine, attackDirX, opponentGoalX, ownGoalX, tacticsModifiers,
DEFAULT_TACTICS, type TeamShape,
} from './TacticalEngine';
import { computeXG } from './UtilityScorer';
import type { RestartOrigin } from '../rules/OffsideEngine';
import type { SetPieceType } from '../rules/SetPieceManager';

/** Phase 05: simulation events consumed by rules/MatchEngine (no circular imports). */
export type SimEvent =
  | { kind: 'PASS'; side: TeamSide; passerGlobal: number; passType: PassType; ballX: number; ballZ: number; origin: RestartOrigin }
  | { kind: 'RECEPTION'; global: number; side: TeamSide; passerGlobal: number; passerSide: TeamSide | null }
  | { kind: 'SHOT'; side: TeamSide; shooterGlobal: number; x: number; z: number; xg: number }
  | { kind: 'GOAL'; scoringSide: TeamSide; scorerGlobal: number; xg: number }
  | { kind: 'GK_SAVE'; gkSide: TeamSide; shooterSide: TeamSide }
  | {
      kind: 'TACKLE_FOUL_CANDIDATE'; tacklerGlobal: number; victimGlobal: number; tackleKind: 'STANDING' | 'SLIDE';
      touchedBallFirst: boolean; closingSeverity: number; behindDot: number; x: number; z: number;
    }
  | { kind: 'OUT_OF_PLAY'; restart: 'THROW_IN' | 'GOAL_KICK' | 'CORNER'; awardSide: TeamSide; exitX: number; exitZ: number };

export interface ActiveSetPiece {
  type: SetPieceType;
  side: TeamSide;
  takerGlobal: number;
  aiTimer: number;
  wallGlobals: number[];
  /** Epic P0-7: indirect free kick — the ball must touch another player
   *  before a goal can count; a direct shot is not a legal delivery. */
  indirect?: boolean;
}

export interface ScrimmagePlayerRender {
  x: number; z: number; yaw: number; speed: number; anim: AnimState; diveDir: number;
  /** Realistic-models pass: the active skill-move flavour while the
   *  SKILL anim plays (null = no skill move in progress). */
  skill: SkillAnimId | null;
  /** Epic P0-6: real stamina for the active-player arc (was a fixed 0.82). */
  stamina: number;
}

/** Phase 08: a glowing in-world marker for Skill Games (target / gate post / zone). */
export interface SkillMarker {
  kind: 'TARGET' | 'GATE' | 'ZONE';
  x: number; y: number; z: number;
  radius: number;
  /** CSS hex color for the glow. */
  color: string;
  active: boolean;
  hit: boolean;
}

export interface ScrimmageRenderState {
  enabled: boolean;
  ballPos: Vec3;
  ballVel: Vec3;
  ballAngVel: Vec3;
  shotInFlight: boolean;
  shotType: ShotType | null;
  players: ScrimmagePlayerRender[];
  activeGlobal: number;
  secondPresserGlobal: number;
  passTargetGlobal: number;
  /** Cycle-2: 1 → 0 decay over ~0.9 s after a control switch (ring pulse). */
  switchPulse: number;
  /** Cycle-2: the user is match-up containing the carrier right now. */
  containing: boolean;
  impactPulse: number;
  goalPulse: number;
  /** Phase 05: free-kick dotted trajectory preview (null = hidden). */
  trajectory: { x: number; y: number; z: number }[] | null;
  /** Phase 05: VAR offside line world X (null = hidden). */
  offsideLineX: number | null;
  /** Phase 06: template id per global index — the renderer rebuilds a rig
   * in place when a live substitution changes it. */
  playerTemplateIds: string[];
  /** Phase 08: Skill Games glowing targets / gates / zones (empty in matches). */
  skillMarkers: SkillMarker[];
}

export interface ScrimmageStats {
  scoreHome: number;
  scoreAway: number;
  shotsHome: number;
  shotsAway: number;
  onTargetHome: number;
  onTargetAway: number;
  passesHome: number;
  passesAway: number;
  savesHome: number;
  savesAway: number;
  tackles: number;
  possessionHomePct: number;
  minute: number;
  userHasBall: boolean;
  homeGkState: string;
  awayGkState: string;
  stateCounts: Partial<Record<OutfieldState, number>>;
  minSameTeamSeparation: number;
  avgShapeError: number;
  primaryPressers: number;
  secondPressActive: boolean;
  lastMessage: string;
  version: number;
}

interface Slot {
  kin: PlayerKinematics;
  side: TeamSide;
  teamIndex: number;
  role: PlayerTemplate['position'];
  outfield: OutfieldAgent | null;
  gk: GoalkeeperAI | null;
  gkFrame: GkFrame | null;
  lastGkState?: string;
  /** Phase 05: sent-off players are parked off the pitch and skipped by the sim. */
  sentOff: boolean;
}

export interface ScrimmageOptions {
  formationId?: string;
  difficulty?: Difficulty;
  autonomousHome?: boolean;
  seed?: number;
  /** Phase 07: the manager's saved Ultimate Team (upgraded templates) for HOME. */
  homeTemplates?: PlayerTemplate[];
  homeBenchTemplates?: PlayerTemplate[];
}

/** Phase 06: one player's live HUD data (radar dot, stamina, subs list). */
export interface HudPlayerInfo {
  global: number;
  teamIndex: number;
  side: TeamSide;
  x: number;
  z: number;
  stamina01: number;
  name: string;
  fullName: string;
  role: PlayerTemplate['position'];
  ovr: number;
  templateId: string;
  sentOff: boolean;
  isGk: boolean;
}

/** Phase 06: one bench player's data for the substitutions tab. */
export interface BenchInfo {
  index: number;
  name: string;
  fullName: string;
  position: PlayerTemplate['position'];
  ovr: number;
  stamina01: number;
  templateId: string;
}

const SIDES: TeamSide[] = ['HOME', 'AWAY'];

/** Epic P0-5: signature celebrations for the stars; everyone else draws
 *  from the generic set by id hash. */
const SIGNATURE_CELEBRATIONS: Record<string, AnimState> = {
  rw_messi: 'CELEBRATE_POINT_SKY',
  rw_ronaldo: 'CELEBRATE_SIU',
  rw_lewandowski: 'CELEBRATE_ARMS_CROSSED',
  rw_maradona: 'CELEBRATE_ARMS_OUT',
  rw_pele: 'CELEBRATE_FIST_PUMP',
  rw_mbappe: 'CELEBRATE_ARMS_CROSSED',
  rw_neymar: 'CELEBRATE_KNEEL_POINT',
};
const GENERIC_CELEBRATIONS: AnimState[] = ['CELEBRATE_KNEE_SLIDE', 'CELEBRATE_FIST_PUMP', 'CELEBRATE_ARMS_OUT', 'CELEBRATE_KNEEL_POINT'];
function signatureCelebration(templateId: string): AnimState {
  const sig = SIGNATURE_CELEBRATIONS[templateId];
  if (sig) return sig;
  let h = 0;
  for (let i = 0; i < templateId.length; i += 1) h = (h * 31 + templateId.charCodeAt(i)) >>> 0;
  return GENERIC_CELEBRATIONS[h % GENERIC_CELEBRATIONS.length]!;
}

export class ScrimmageEngine {
  readonly ball = new BallPhysics(createVec3(0, 0.11, 0));
  readonly renderState: ScrimmageRenderState;
  readonly stats: ScrimmageStats;
  wet = false;
  autonomousHome: boolean;
  /** Phase 10 (Settings → Auto-Switch): AUTO switches control to every HOME
   *  receiver AND continuously tracks the ball while defending or loose —
   *  the user always holds the HOME outfielder nearest the ball (see
   *  updateAutoSwitch). AIR_BALLS only switches on receptions from the air;
   *  MANUAL never auto-switches (SWITCH action / kickoff taker only). */
  autoSwitchMode: 'AUTO' | 'AIR_BALLS' | 'MANUAL' = 'AUTO';
  private ballWasAirborne = false;
  private autoSwitchTimer = 0;
  private lastManualSwitchAt = -10;
  /** Cycle-2: when control last changed hands (engine elapsed seconds) —
   *  drives the HUD name-tag flash, the ring pulse and the 0.2 s camera
   *  ease in the render snapshot. */
  private lastSwitchAt = -10;
  /** Cycle-2 match-up defending (user): live contain state. */
  private containSec = 0;
  private containingNow = false;
  private chargeCooldownUntil = -1;
  /** Cycle-2: peak AI contain time observed (lab/diagnostics). */
  private aiContainPeak = 0;
  /** True while a pass the USER played is still travelling: its reception
   *  hands control to the receiver in EVERY switch mode (even MANUAL) —
   *  you passed to him, so you play as him the moment he takes the ball. */
  private userPassInFlight = false;
  private slots: Slot[] = [];
  private formation: Formation;
  private tactical: Record<TeamSide, TacticalEngine>;
  private shapes: Record<TeamSide, TeamShape | null> = { HOME: null, AWAY: null };
  private profile: DifficultyProfile;
  private homeProfile: DifficultyProfile;
  private mentalityHome: Mentality = 'BALANCED';
  /** Epic P0-8 game-state brain (lite): the AWAY mentality is no longer
   *  hard-coded BALANCED — it chases the game when trailing late and
   *  protects a lead in the final minutes (see the agent loop). */
  private mentalityAway: Mentality = 'BALANCED';
  /** Epic fix round (P1-15): the full MatchPlan brain drives BOTH benches —
   *  mentality, pressing/offside traps, time-wasting, switch-of-play bias
   *  and tactical subs are recomputed every decision round. */
  private planHome: MatchPlan = computeMatchPlan({ side: 'HOME', scoreFor: 0, scoreAgainst: 0, minute: 0, difficulty: 'SEMI_PRO' });
  private planAway: MatchPlan = computeMatchPlan({ side: 'AWAY', scoreFor: 0, scoreAgainst: 0, minute: 0, difficulty: 'SEMI_PRO' });
  /** Difficulty profiles as modified by the live plan (time-wasting raises
   *  carrier patience); recomputed with the plans, never per-agent. */
  private awayProfileNow: DifficultyProfile | null = null;
  private homeProfileNow: DifficultyProfile | null = null;
  /** Decayed map of where the USER's passes were aimed, by lane — the raw
   *  material for Legendary/Ultimate pattern adaptation (decays ~2%/s). */
  private userLaneCounts: Record<PlanLane, number> = { LEFT: 0, CENTRE: 0, RIGHT: 0 };
  private adaptedLaneNow: PlanLane | null = null;
  private adaptedAnnouncedAt = -1000;
  /** Epic fix round (P0-11): last side to hold the ball, for the
   *  POSSESSION_CHANGED bus event (instant ATTACK/DEFEND overlay flip). */
  private lastPossessionSide: TeamSide | null = null;
  private tacticsHome: ManagerTactics = DEFAULT_TACTICS;
  private readonly rng: () => number;
  private readonly nets: NetRegistry;
  private readonly skills = new SkillMoveEngine();
  private actionQueue: GameAction[] = [];
  activeTeamIndex = 9; // user starts on the HOME striker
  private tick = 0;
  private elapsed = 0;
  private passTargetGlobal = -1;
  /** Where the current pass was aimed (kick-time fixed) — the receiver's
   *  plant point while the ball travels. */
  private passAimPoint: { x: number; z: number } | null = null;
  private passGraceTimer = 0;
  private lastPasserGlobal = -1;
  private pendingUserShot: { shotType: ShotType; power: number; timer: number } | null = null;
  private pendingShotInfo: { side: TeamSide; xg: number; shooterGlobal: number } | null = null;
  private goalResetTimer = 0;
  // Epic P0-5: who scored last + the two teammates who join his celebration.
  private lastScorerGlobal = -1;
  private lastScoringSide: TeamSide | null = null;
  private celebrationMates: number[] = [];
  private lastPassAnimGlobal = -1;
  private lastPassAnimTimer = 0;
  /** Realistic-models pass: the SHOOT anim plays for the shooter (user
   *  and AI alike) — shots use the SHOOT state, not the generic KICK. */
  private lastShotAnimGlobal = -1;
  private lastShotAnimTimer = 0;
  /** Slide-tackle ANIM hold (0.7 s, spec §2.3) — longer than the physics
   *  slideTimer (0.55 s) so the pose completes before the player rises. */
  private readonly slideAnimTimers = new Float32Array(22);
  private pendingKickoffSide: TeamSide = 'HOME';
  private secondPressUntil = -1;
  private gkRushUntil = -1;
  // --- Phase 05 rules integration ---------------------------------------------
  /** Sink for simulation events; rules/MatchEngine subscribes here. */
  eventSink: ((e: SimEvent) => void) | null = null;
  /** When true, MatchEngine owns restarts, goal resets and the match clock. */
  externalMatchControl = false;
  private activeSetPiece: ActiveSetPiece | null = null;
  private wallGlobalsCache: number[] = [];
  private wallJumpTimer = 0;
  private pendingRestartOrigin: RestartOrigin = 'OPEN_PLAY';
  private awaitingRestart = false;
  private emit(e: SimEvent): void {
    if (this.eventSink) this.eventSink(e);
  }

  // --- Phase 07: the manager's Ultimate Team squad for HOME -------------------
  private homeSquad: PlayerTemplate[] | null = null;
  private homeBenchTemplates: PlayerTemplate[] | null = null;
  // --- Phase 08: mode-generated opponent XI for AWAY (H2H / Tournament) ------
  private awaySquad: PlayerTemplate[] | null = null;

  private teamActionCooldown: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };
  private possessionTime: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };
  private defRoles: Record<TeamSide, { primaryGlobal: number; secondGlobal: number; markMap: Map<number, number> }> = {
    HOME: { primaryGlobal: -1, secondGlobal: -1, markMap: new Map() },
    AWAY: { primaryGlobal: -1, secondGlobal: -1, markMap: new Map() },
  };
  private atkRoles: Record<TeamSide, { runners: number[]; supports: number[] }> = {
    HOME: { runners: [], supports: [] },
    AWAY: { runners: [], supports: [] },
  };
  private statsTimer = 0;

  constructor(nets: NetRegistry, opts: ScrimmageOptions = {}) {
    this.nets = nets;
    this.autonomousHome = opts.autonomousHome ?? false;
    this.rng = mulberry32(opts.seed ?? 20261122);
    this.profile = getDifficultyProfile(opts.difficulty ?? 'SEMI_PRO');
    // Epic P0-8: the user's own AI teammates scale with the chosen
    // difficulty too (was hard-coded SEMI_PRO at every tier).
    this.homeProfile = getDifficultyProfile(opts.difficulty ?? 'SEMI_PRO');
    this.homeSquad = opts.homeTemplates && opts.homeTemplates.length === 11 ? opts.homeTemplates : null;
    this.homeBenchTemplates = opts.homeBenchTemplates && opts.homeBenchTemplates.length > 0 ? opts.homeBenchTemplates : null;
    this.formation = getFormationById(opts.formationId ?? '4-3-3-attack') ?? getFormationById('4-3-3-attack')!;
    this.tactical = {
      HOME: new TacticalEngine(this.formation, 'BALANCED', this.tacticsHome),
      AWAY: new TacticalEngine(this.formation, 'BALANCED', DEFAULT_TACTICS),
    };
    this.buildSlots();
    this.stats = {
      scoreHome: 0, scoreAway: 0, shotsHome: 0, shotsAway: 0,
      onTargetHome: 0, onTargetAway: 0, passesHome: 0, passesAway: 0,
      savesHome: 0, savesAway: 0, tackles: 0, possessionHomePct: 50,
      minute: 0, userHasBall: true, homeGkState: 'ANGLE_BISECT', awayGkState: 'ANGLE_BISECT',
      stateCounts: {}, minSameTeamSeparation: 99, avgShapeError: 0,
      primaryPressers: 0, secondPressActive: false,
      lastMessage: 'Kickoff! You are the HOME striker — attack the far goal.',
      version: 0,
    };
    this.renderState = {
      enabled: true,
      ballPos: createVec3(0, 0.11, 0), ballVel: createVec3(), ballAngVel: createVec3(),
      shotInFlight: false, shotType: null,
      players: this.slots.map(() => ({ x: 0, z: 0, yaw: 0, speed: 0, anim: 'IDLE' as AnimState, diveDir: 1, skill: null, stamina: 1 })),
      activeGlobal: this.activeTeamIndex, secondPresserGlobal: -1, passTargetGlobal: -1,
      switchPulse: 0, containing: false,
      impactPulse: 0, goalPulse: 0, trajectory: null, offsideLineX: null,
      playerTemplateIds: this.slots.map((s) => s.kin.template.id),
      skillMarkers: [],
    };
    this.buildBench();
    this.kickoffReset('HOME');
  }

  // --- Phase 06: live substitutions -------------------------------------------
  /** HOME bench: 7 outfielders not in either XI, with their own stamina. */
  readonly bench: { template: PlayerTemplate; stamina01: number }[] = [];
  subsUsed = 0;
  readonly maxSubs = 5;

  private buildBench(): void {
    // Phase 07: the match bench is the manager's saved substitutes when a
    // home squad is applied — their upgraded templates come on as real subs.
    if (this.homeBenchTemplates) {
      this.bench.length = 0;
      for (const template of this.homeBenchTemplates) this.bench.push({ template, stamina01: 1 });
      this.subsUsed = 0;
      return;
    }
    const used = new Set(this.slots.map((s) => s.kin.template.id));
    const all = getAllPlayers();
    const roles: PlayerTemplate['position'][] = ['CB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'ST'];
    this.bench.length = 0;
    for (const role of roles) {
      const tpl = all.find((p) => p.position === role && !used.has(p.id))
        ?? all.find((p) => p.position !== 'GK' && !used.has(p.id));
      if (!tpl) continue;
      used.add(tpl.id);
      this.bench.push({ template: tpl, stamina01: 1 });
    }
    this.subsUsed = 0;
  }

  /**
   * Swap a HOME outfielder (teamIndex 1..10 — the GK is never substituted in
   * this build) with a bench player. Templates and stamina swap places, the
   * renderer's template-id watch rebuilds the 3D rig instantly, and the
   * OutfieldAgent picks the new template up through its kin getter.
   */
  substitute(teamIndex: number, benchIndex: number): boolean {
    if (this.subsUsed >= this.maxSubs) return false;
    const slot = this.slots[teamIndex];
    const entry = this.bench[benchIndex];
    if (!slot || !entry || slot.side !== 'HOME' || slot.gk || slot.sentOff) return false;
    const outTemplate = slot.kin.template;
    const outStamina = slot.kin.stamina01;
    const inTemplate = entry.template;
    slot.kin.template = inTemplate;
    slot.kin.stamina01 = entry.stamina01;
    slot.kin.maxRecoverable01 = 1;
    entry.template = outTemplate;
    entry.stamina01 = outStamina;
    this.subsUsed += 1;
    this.renderState.playerTemplateIds[teamIndex] = inTemplate.id;
    this.notify(`Substitution ${this.subsUsed}/${this.maxSubs}: ${slot.kin.template.shortName} comes on for ${outTemplate.shortName} — fresh legs at ${Math.round(slot.kin.stamina01 * 100)}% stamina.`);
    return true;
  }

  /** Per-player HUD snapshot for the Phase 06 radar / active bar / subs tab. */
  hudPlayers(): HudPlayerInfo[] {
    return this.slots.map((s, i) => ({
      global: i,
      teamIndex: s.teamIndex,
      side: s.side,
      x: s.kin.pos.x,
      z: s.kin.pos.z,
      stamina01: s.kin.stamina01,
      name: s.kin.template.shortName,
      fullName: s.kin.template.name,
      role: s.role,
      ovr: s.kin.template.baseOvr,
      templateId: s.kin.template.id,
      sentOff: s.sentOff,
      isGk: s.gk !== null,
    }));
  }

  benchInfo(): BenchInfo[] {
    return this.bench.map((b, i) => ({
      index: i,
      name: b.template.shortName,
      fullName: b.template.name,
      position: b.template.position,
      ovr: b.template.baseOvr,
      stamina01: b.stamina01,
      templateId: b.template.id,
    }));
  }

  // --- Setup -------------------------------------------------------------------
  private buildSlots(): void {
    const all = getAllPlayers();
    const used = new Set<string>();
    const pick = (): PlayerTemplate[] => this.formation.slots.map((slot) => {
      const found = all.find((p) => p.position === slot.role && !used.has(p.id))
        ?? all.find((p) => !used.has(p.id))!;
      used.add(found.id);
      return found;
    });
    // Phase 07: with a manager squad applied, HOME fields the saved XI (already
    // upgraded by ProgressionService) in formation-slot order, and each man's
    // tactical role is his slot's role. The away XI is picked around them.
    let homeTpl: PlayerTemplate[];
    if (this.homeSquad && this.homeSquad.length === 11) {
      homeTpl = this.homeSquad;
      for (const t of homeTpl) used.add(t.id);
    } else {
      homeTpl = pick();
    }
    // Phase 08: a mode session may field a generated opponent XI (H2H ladder
    // team, tournament club) — it replaces the default database pick.
    let awayTpl: PlayerTemplate[];
    if (this.awaySquad && this.awaySquad.length === 11) {
      awayTpl = this.awaySquad;
      for (const t of awayTpl) used.add(t.id);
    } else {
      awayTpl = pick();
    }
    this.slots = [];
    SIDES.forEach((side) => {
      const tpls = side === 'HOME' ? homeTpl : awayTpl;
      tpls.forEach((tpl, i) => {
        const globalIndex = side === 'HOME' ? i : 11 + i;
        const kin = new PlayerKinematics(tpl, `scr-${side.toLowerCase()}-${i}`, 0, 0, side === 'HOME' ? 0 : Math.PI);
        const role = (side === 'HOME' && this.homeSquad) || (side === 'AWAY' && this.awaySquad)
          ? this.formation.slots[i]?.role ?? tpl.position
          : tpl.position;
        const slot: Slot = { kin, side, teamIndex: i, role, outfield: null, gk: null, gkFrame: null, sentOff: false };
        if (role === 'GK') {
          slot.gk = new GoalkeeperAI(side, tpl, this.rng);
        } else {
          slot.outfield = new OutfieldAgent(globalIndex, i, side, role, kin);
        }
        this.slots.push(slot);
      });
    });
  }

  /**
   * Phase 07: (re)apply the manager's saved Ultimate Team to the HOME side.
   * Templates arrive fully upgraded (training + skill points baked in), the
   * renderer's template-id watch rebuilds the 3D rigs, and the match bench
   * becomes the saved substitutes. Kickoff resets so the new XI lines up.
   */
  applyHomeSquad(xi: PlayerTemplate[], benchTemplates: PlayerTemplate[]): void {
    if (xi.length !== 11) return;
    this.homeSquad = xi;
    this.homeBenchTemplates = benchTemplates.length > 0 ? benchTemplates : null;
    this.buildSlots();
    this.renderState.players = this.slots.map(() => ({ x: 0, z: 0, yaw: 0, speed: 0, anim: 'IDLE' as AnimState, diveDir: 1, skill: null, stamina: 1 }));
    this.renderState.playerTemplateIds = this.slots.map((s) => s.kin.template.id);
    this.buildBench();
    this.kickoffReset('HOME');
    this.notify('Your Ultimate Team lines up — trained stats, ranks and skill points are live in this match.');
  }

  /**
   * Phase 08: field a mode-generated opponent XI for AWAY (an OVR-matched
   * Head-to-Head ladder team or a tournament club's best eleven), or clear it
   * with null to restore the default database pick. Rigs rebuild in place via
   * the renderer's template-id watch, exactly like a substitution.
   */
  applyAwaySquad(xi: PlayerTemplate[] | null): void {
    this.awaySquad = xi && xi.length === 11 ? xi : null;
    this.buildSlots();
    this.renderState.players = this.slots.map(() => ({ x: 0, z: 0, yaw: 0, speed: 0, anim: 'IDLE' as AnimState, diveDir: 1, skill: null, stamina: 1 }));
    this.renderState.playerTemplateIds = this.slots.map((s) => s.kin.template.id);
    this.buildBench();
    this.kickoffReset('HOME');
  }

  /** Phase 08: publish the Skill Games markers the 3D scene should glow. */
  setSkillMarkers(markers: SkillMarker[]): void {
    this.renderState.skillMarkers = markers;
  }

  clearSkillMarkers(): void {
    this.renderState.skillMarkers = [];
  }

  /** Full match reset: score, stats and possession clocks back to zero. */
  resetMatch(): void {
    const st = this.stats;
    st.scoreHome = 0; st.scoreAway = 0;
    st.shotsHome = 0; st.shotsAway = 0;
    st.onTargetHome = 0; st.onTargetAway = 0;
    st.passesHome = 0; st.passesAway = 0;
    st.savesHome = 0; st.savesAway = 0;
    st.tackles = 0;
    this.possessionTime.HOME = 0;
    this.possessionTime.AWAY = 0;
    this.elapsed = 0;
    for (const s of this.slots) s.sentOff = false;
    this.clearSkillMarkers();
    this.subsUsed = 0;
    this.kickoffReset('HOME');
    this.notify('Match reset — kickoff! You are the HOME striker.');
  }

  setFormation(id: string): void {
    const f = getFormationById(id);
    if (!f || f.id === this.formation.id) return;
    this.formation = f;
    this.tactical.HOME.setFormation(f);
    this.tactical.AWAY.setFormation(f);
    this.buildSlots();
    this.renderState.players = this.slots.map(() => ({ x: 0, z: 0, yaw: 0, speed: 0, anim: 'IDLE' as AnimState, diveDir: 1, skill: null, stamina: 1 }));
    this.renderState.playerTemplateIds = this.slots.map((s) => s.kin.template.id);
    this.buildBench();
    this.kickoffReset('HOME');
    this.notify(`Formation changed to ${f.name} — kickoff reset.`);
  }

  setDifficulty(d: Difficulty): void {
    this.profile = getDifficultyProfile(d);
    this.homeProfile = getDifficultyProfile(d);
    this.notify(`Difficulty: ${this.profile.label}. AI decision delay ${this.profile.decisionDelaySec.toFixed(2)}s · pass accuracy ${Math.round(this.profile.passAccuracy * 100)}%.`);
  }

  setMentality(m: Mentality): void {
    this.mentalityHome = m;
    this.tactical.HOME.setMentality(m);
  }

  setTactics(t: ManagerTactics): void {
    this.tacticsHome = t;
    this.tactical.HOME.setTactics(t);
  }

  get difficulty(): DifficultyProfile { return this.profile; }

  private notify(msg: string): void {
    this.stats.lastMessage = msg;
    this.stats.version += 1;
  }

  private slot(globalIndex: number): Slot | undefined {
    return this.slots[globalIndex];
  }

  private globalOf(side: TeamSide, teamIndex: number): number {
    return side === 'HOME' ? teamIndex : 11 + teamIndex;
  }

  private ownerGlobal(): number {
    const id = this.ball.state.ownerId;
    if (!id) return -1;
    return this.slots.findIndex((s) => s.kin.id === id);
  }

  private possessingSide(): TeamSide | null {
    const g = this.ownerGlobal();
    return g >= 0 ? (this.slots[g]?.side ?? null) : this.ball.state.lastTouchSide;
  }

  get userSlot(): Slot {
    return this.slots[this.activeTeamIndex]!;
  }

  /** Lab hook: how many outfielders of the non-possessing team are within r of the ball. */
  defendersNearBall(radiusM: number): number {
    const owner = this.ownerGlobal();
    const possSide = owner >= 0 ? this.slots[owner]?.side : this.ball.state.lastTouchSide;
    let n = 0;
    for (const s of this.slots) {
      if (s.gk || s.sentOff || s.side === possSide) continue;
      if (Math.hypot(s.kin.pos.x - this.ball.state.pos.x, s.kin.pos.z - this.ball.state.pos.z) < radiusM) n += 1;
    }
    return n;
  }

  /** Lab hook: hand possession to a player (used by the GK scenario). */
  forcePossession(globalIndex: number): void {
    this.gainPossession(globalIndex);
  }

  /** Lab hook: teleport a player to a spot and give him the ball. */
  forceScenePlayer(globalIndex: number, x: number, z: number): void {
    const s = this.slot(globalIndex);
    if (!s) return;
    s.kin.pos.x = x;
    s.kin.pos.z = z;
    // A teleport places the man; it must not keep his old momentum —
    // staging tools (labs, mode scenarios) found players sliding metres
    // past their marks on velocity from before the teleport.
    s.kin.speed = 0;
    s.kin.vel.x = 0;
    s.kin.vel.z = 0;
    s.kin.facingRad = Math.atan2(0 - z, ownGoalX(s.side === 'HOME' ? 'AWAY' : 'HOME') - x);
    this.gainPossession(globalIndex);
  }

  /** Lab hook: teleport a player without changing possession. */
  forceMovePlayer(globalIndex: number, x: number, z: number): void {
    const s = this.slot(globalIndex);
    if (!s) return;
    s.kin.pos.x = x;
    s.kin.pos.z = z;
    s.kin.speed = 0;
    s.kin.vel.x = 0;
    s.kin.vel.z = 0;
  }

  /** How many times each GK has entered SHOT_PREDICT_DIVE (lab + telemetry). */
  readonly gkDiveCount: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };

  queueAction(action: GameAction): void {
    this.actionQueue.push(action);
  }

  /** P1-4: half-time legs — every player on the pitch recovers a slice of
   *  stamina during the break (never a full refill). */
  halfTimeRecovery(): void {
    for (const s of this.slots) s.kin.stamina01 = Math.min(1, s.kin.stamina01 + 0.3);
  }

  kickoffReset(kickoffSide: TeamSide): void {
    this.goalResetTimer = 0;
    this.activeSetPiece = null;
    this.awaitingRestart = false;
    this.pendingRestartOrigin = 'KICKOFF';
    this.renderState.trajectory = null;
    this.ball.reset(0, 0);
    // Shapes with the ball at the centre spot.
    for (const side of SIDES) {
      const oppXs = this.slots.filter((s) => s.side !== side).map((s) => s.kin.pos.x);
      this.shapes[side] = this.tactical[side].computeShape(side, { x: 0, z: 0 }, oppXs, 0, false);
    }
    for (const s of this.slots) {
      const shape = this.shapes[s.side];
      const anchor = shape?.anchors[s.teamIndex] ?? { x: 0, z: 0 };
      if (s.gk) {
        s.kin.pos.x = ownGoalX(s.side) + attackDirX(s.side) * 1.4;
        s.kin.pos.z = 0;
      } else {
        s.kin.pos.x = anchor.x;
        s.kin.pos.z = anchor.z;
        // Non-kickoff team stays out of the centre circle at kickoff.
        if (s.side !== kickoffSide) {
          const d = Math.hypot(s.kin.pos.x, s.kin.pos.z);
          if (d < 10) {
            const scale = 10.5 / Math.max(1, d);
            s.kin.pos.x *= scale; s.kin.pos.z *= scale;
          }
        }
      }
      s.kin.speed = 0;
      s.kin.facingRad = s.side === 'HOME' ? 0 : Math.PI;
      if (s.outfield) { s.outfield.state = 'HOLD_SHAPE'; s.outfield.pendingAction = null; }
      if (s.gk) s.gk.endAction();
    }
    const stIdx = this.formation.slots.findIndex((sl) => sl.role === 'ST');
    const taker = this.slot(this.globalOf(kickoffSide, stIdx >= 0 ? stIdx : 9));
    if (taker) {
      taker.kin.pos.x = -attackDirX(kickoffSide) * 0.6;
      taker.kin.pos.z = 0;
      this.ball.state.ownerId = taker.kin.id;
      this.ball.state.lastTouchId = taker.kin.id;
      this.ball.state.lastTouchSide = kickoffSide;
      if (kickoffSide === 'HOME' && !this.autonomousHome) this.setActive(taker.teamIndex, 'KICKOFF');
    }
    this.passTargetGlobal = -1;
    this.pendingShotInfo = null;
    this.pendingUserShot = null;
    this.attachBallToOwner();
  }

  private attachBallToOwner(): void {
    const g = this.ownerGlobal();
    if (g < 0) return;
    const owner = this.slots[g];
    if (!owner) return;
    owner.kin.dribbleBallPos(this.ball.state.pos, 0);
    this.ball.state.pos.y = 0.11;
    this.ball.state.prevPos.x = this.ball.state.pos.x;
    this.ball.state.prevPos.y = this.ball.state.pos.y;
    this.ball.state.prevPos.z = this.ball.state.pos.z;
  }

  /**
   * Cycle-2: the ONE door control changes go through. Every change of the
   * user's man — continuous auto-switch, pass-receiver handover, manual
   * SWITCH, kickoff taker — stamps the switch clock (ring pulse + camera
   * ease read it) and publishes PLAYER_SWITCHED so the HUD can flash the
   * new man's name tag. A switch must be VISIBLE, not silent.
   */
  private setActive(teamIndex: number, reason: 'AUTO' | 'PASS' | 'MANUAL' | 'KICKOFF'): void {
    if (teamIndex === this.activeTeamIndex) return;
    this.activeTeamIndex = teamIndex;
    this.lastSwitchAt = this.elapsed;
    if (this.autonomousHome) return;
    const s = this.slots.find((x) => x.side === 'HOME' && x.teamIndex === teamIndex);
    if (s) {
      matchEventBus.emit('PLAYER_SWITCHED', {
        playerId: s.kin.template.id, name: s.kin.template.name, shortName: s.kin.template.shortName, reason,
      });
    }
  }

  /** Seconds since control last changed hands (Infinity before the first). */
  get secondsSinceSwitch(): number {
    return this.lastSwitchAt < -5 ? Infinity : this.elapsed - this.lastSwitchAt;
  }

  /** Cycle-2 match-up: is the user's man containing the carrier right now? */
  get userContaining(): boolean {
    return this.containingNow;
  }

  /** Cycle-2: the longest AI contain (seconds) seen this match — the lab
   *  asserts pressers really hold a contain before charging. */
  get peakAiContainSec(): number {
    return this.aiContainPeak;
  }

  // --- Possession ---------------------------------------------------------------
  private gainPossession(globalIndex: number, message?: string): void {
    const s = this.slot(globalIndex);
    if (!s) return;
    // P0-11: a real possession-change event the moment the ball changes
    // side — the touch overlay flips ATTACK/DEFEND on this, not on a poll.
    if (this.lastPossessionSide !== s.side) {
      this.lastPossessionSide = s.side;
      matchEventBus.emit('POSSESSION_CHANGED', { side: s.side, ownerId: s.kin.template.id });
    }
    const prevPasser = this.lastPasserGlobal >= 0 ? this.slots[this.lastPasserGlobal] : undefined;
    this.emit({
      kind: 'RECEPTION', global: globalIndex, side: s.side,
      passerGlobal: this.lastPasserGlobal, passerSide: prevPasser ? prevPasser.side : null,
    });
    this.ball.state.ownerId = s.kin.id;
    this.ball.state.lastTouchId = s.kin.id;
    this.ball.state.lastTouchSide = s.side;
    this.ball.state.vel.x = 0; this.ball.state.vel.y = 0; this.ball.state.vel.z = 0;
    this.ball.state.shotInFlight = false;
    this.ball.state.shotType = null;
    this.passTargetGlobal = -1;
    this.pendingShotInfo = null;
    if (s.side === 'HOME' && !this.autonomousHome && !s.gk) {
      if (this.autoSwitchMode === 'AUTO'
        || (this.autoSwitchMode === 'AIR_BALLS' && this.ballWasAirborne)
        || this.userPassInFlight) {
        this.setActive(s.teamIndex, this.userPassInFlight ? 'PASS' : 'AUTO');
      }
    }
    // Any reception resolves the user's pass (a teammate took it, an
    // opponent intercepted it, the keeper claimed it).
    this.userPassInFlight = false;
    this.ballWasAirborne = false;
    if (s.outfield) s.outfield.carrierHoldSec = 0;
    this.attachBallToOwner();
    if (message) this.notify(message);
  }

  /**
   * Continuous auto-switch (AUTO mode): while HOME does not have the ball,
   * control tracks the ball — the user always holds the HOME outfielder
   * best placed to reach it (nearest, with the manual SWITCH's goal-side
   * bonus), re-evaluated ~8×/second with score hysteresis so the ring
   * never flickers between two nearby men, and a grace window after a
   * manual SWITCH so an override sticks. A HOME pass in flight hands
   * control to its receiver before the ball arrives. Input is global to
   * the engine, so a switch never drops sprint or stick direction — the
   * same thumb input simply drives the new man from the next tick.
   */
  private updateAutoSwitch(dt: number): void {
    if (this.autonomousHome || this.autoSwitchMode !== 'AUTO') return;
    if (this.activeSetPiece || this.goalResetTimer > 0) return;
    this.autoSwitchTimer -= dt;
    if (this.autoSwitchTimer > 0) return;
    this.autoSwitchTimer = 0.12;
    if (this.elapsed - this.lastManualSwitchAt < 1.5) return;

    // A HOME pass in flight: control the receiver before the ball arrives.
    if (this.passTargetGlobal >= 0) {
      const t = this.slots[this.passTargetGlobal];
      if (t && t.side === 'HOME' && !t.gk && !t.sentOff) {
        this.setActive(t.teamIndex, 'PASS');
        return;
      }
    }
    const ownerG = this.ownerGlobal();
    const ownerSlot = ownerG >= 0 ? this.slots[ownerG] : undefined;
    if (ownerSlot && ownerSlot.side === 'HOME' && !ownerSlot.gk) return; // carrier keeps control
    // (If the HOME keeper owns it, fall through: control moves to the
    // best-placed outfielder so the user is set for the distribution.)

    // Defending or loose ball: best-placed HOME outfielder wins control.
    const current = this.userSlot;
    const cands = this.slots
      .filter((s) => s.side === 'HOME' && !s.sentOff)
      .map((s) => ({ id: s.kin.id, pos: s.kin.pos, isGoalkeeper: s.role === 'GK' }));
    const nextId = chooseSwitchTarget(cands, this.ball.state.pos, current.kin.id, ownGoalX('HOME'));
    const idx = this.slots.findIndex((s) => s.kin.id === nextId);
    if (idx < 0) return;
    const next = this.slots[idx]!;
    if (next.teamIndex === this.activeTeamIndex) return;
    const ball = this.ball.state.pos;
    const scoreOf = (s: Slot): number => {
      const d = Math.hypot(s.kin.pos.x - ball.x, s.kin.pos.z - ball.z);
      const goalSide = Math.sign(ownGoalX('HOME') - ball.x) === Math.sign(s.kin.pos.x - ball.x) ? 1 : 0;
      return -d + goalSide * 4;
    };
    // Score gate only: a stranded current man scores so badly that any
    // defender clears the hysteresis easily, while two nearby defenders
    // never ping-pong. (An earlier "current > 26m always switches" hatch
    // defeated the hysteresis exactly when the whole team was far back,
    // flicking the ring between the two centre-backs every ~0.5s.)
    if (current.sentOff || scoreOf(next) > scoreOf(current) + 1.5) {
      this.setActive(next.teamIndex, 'AUTO');
    }
  }

  // --- Kicks ----------------------------------------------------------------------
  private executePass(carrier: Slot, target: Slot, passType: PassType, throughPoint?: { x: number; z: number }, power = 0.55): void {
    const from = { x: this.ball.state.pos.x, y: this.ball.state.pos.y, z: this.ball.state.pos.z };
    const candidate: PassCandidate = throughPoint
      ? { id: target.kin.id, pos: createVec3(throughPoint.x, 0.11, throughPoint.z), vel: createVec3(target.kin.vel.x, 0, target.kin.vel.z) }
      : { id: target.kin.id, pos: target.kin.pos, vel: target.kin.vel };
    const result = computePass({
      passer: carrier.kin.template, from, passType, target: candidate,
      attackDirX: attackDirX(carrier.side),
    });
    // Epic P0-6/P0-8: real pass power + an error cone. Power scales the
    // driven pace of the ball (a tapped pass travels at the default weight;
    // a charged pass is fizzed), and ground/through passes can go astray
    // by an angle scaled by the passer's accuracy — passes were laser-true
    // before, only through-ball targets jittered.
    const vel = result.velocity;
    if (passType === 'GROUND' || passType === 'THROUGH' || passType === 'PASS_AND_GO') {
      const pace = 0.8 + power * 0.45;
      vel.x *= pace; vel.z *= pace;
      const accuracy = carrier.side === 'AWAY' ? this.profile.passAccuracy : carrier.kin.template.subStats.shortPassing / 100;
      const maxErr = (1 - Math.min(0.97, accuracy)) * 0.14;
      const err = (this.rng() * 2 - 1) * maxErr;
      const cos = Math.cos(err);
      const sin = Math.sin(err);
      const vx = vel.x * cos - vel.z * sin;
      const vz = vel.x * sin + vel.z * cos;
      vel.x = vx; vel.z = vz;
    }
    this.ball.kick(vel, result.angularVel, carrier.kin.id, carrier.side, null);
    this.passTargetGlobal = this.slots.indexOf(target);
    this.lastPassAnimGlobal = this.slots.indexOf(carrier);
    this.lastPassAnimTimer = 0.35;
    // The receiver's plant point, fixed at kick time: exactly where the
    // pass was aimed (computePass plays to the target's position, or to
    // the through point for a through ball — it does not lead a moving
    // receiver, so neither does the plant point).
    this.passAimPoint = { x: candidate.pos.x, z: candidate.pos.z };
    this.lastPasserGlobal = this.slots.indexOf(carrier);
    this.passGraceTimer = 0.28;
    const origin = this.pendingRestartOrigin;
    this.pendingRestartOrigin = 'OPEN_PLAY';
    this.emit({
      kind: 'PASS', side: carrier.side, passerGlobal: this.slots.indexOf(carrier),
      passType, ballX: from.x, ballZ: from.z, origin,
    });
    if (carrier.side === 'HOME') this.stats.passesHome += 1; else this.stats.passesAway += 1;
    matchEventBus.emit('BALL_KICKED', { playerId: carrier.kin.template.id, power, shotType: passType, isShot: false });
    // P1-15 pattern read: remember where the user's passes are aimed (the
    // counts decay in step(), so only a persistent habit gets read).
    if (carrier.side === 'HOME' && !this.autonomousHome) {
      this.userLaneCounts[laneOfZ(candidate.pos.z)] += 1;
    }
    // P1-15 offside trap: the defending side's line steps up in unison the
    // moment the pass is played (World Class+ plans only) — real positions
    // move, so the offside line the rules engine reads genuinely jumps.
    const defendingPlan = carrier.side === 'HOME' ? this.planAway : this.planHome;
    if (defendingPlan.offsideTrap) {
      const defSide: TeamSide = carrier.side === 'HOME' ? 'AWAY' : 'HOME';
      const stepDir = defSide === 'AWAY' ? -1 : 1; // toward halfway, away from own goal
      for (const s of this.slots) {
        if (s.side !== defSide || s.gk || s.sentOff) continue;
        if (s.teamIndex >= 1 && s.teamIndex <= 4) {
          s.kin.pos.x += stepDir * 1.15;
        }
      }
    }
  }

  private executeShot(carrier: Slot, aimZ: number, power: number, shotType: ShotType, xg: number): void {
    // Realistic-models pass: every shot (user or AI) plays the SHOOT anim.
    this.lastShotAnimGlobal = this.slots.indexOf(carrier);
    this.lastShotAnimTimer = 0.6;
    const goalX = opponentGoalX(carrier.side);
    const from = this.ball.state.pos;
    const aimDir = { x: goalX - from.x, y: 0, z: aimZ - from.z };
    const len = Math.hypot(aimDir.x, aimDir.z) || 1;
    aimDir.x /= len; aimDir.z /= len;
    const result = computeShot({
      shooter: carrier.kin.template, from,
      aimDir, aimLateral: aimZ >= from.z ? 1 : -1,
      powerNorm: power, shotType, stamina01: carrier.kin.stamina01,
      usingWeakFoot: false, rng: this.rng,
    });
    if (result.isFake) return;
    this.ball.kick(result.velocity, result.angularVel, carrier.kin.id, carrier.side, shotType);
    this.pendingShotInfo = { side: carrier.side, xg, shooterGlobal: this.slots.indexOf(carrier) };
    this.passTargetGlobal = -1;
    this.emit({
      kind: 'SHOT', side: carrier.side, shooterGlobal: this.slots.indexOf(carrier),
      x: from.x, z: from.z, xg,
    });
    if (carrier.side === 'HOME') this.stats.shotsHome += 1; else this.stats.shotsAway += 1;
    matchEventBus.emit('BALL_KICKED', { playerId: carrier.kin.template.id, power, shotType, isShot: true });
    // The defending GK reads the shot and starts its dive prediction.
    const defSide: TeamSide = carrier.side === 'HOME' ? 'AWAY' : 'HOME';
    const gkSlot = this.slots.find((s) => s.side === defSide && s.gk);
    if (gkSlot?.gk) {
      const adj = defSide === 'AWAY' ? this.profile.gkReactionAdjSec : 0;
      gkSlot.gk.onShotFired(this.ball, gkSlot.kin.pos, adj);
    }
  }

  private aiShotType(carrier: Slot): ShotType {
    const dist = Math.abs(opponentGoalX(carrier.side) - carrier.kin.pos.x);
    const oppGk = this.slots.find((s) => s.side !== carrier.side && s.gk);
    if (oppGk?.gk && (oppGk.gk.state === 'RUSH_OUT')) return 'CHIP';
    if (Math.abs(carrier.kin.pos.z) > 9 && dist < 24) return 'FINESSE';
    if (dist > 20 && Math.abs(carrier.kin.pos.z) < 6) return 'POWER';
    return this.rng() < 0.45 ? 'FINESSE' : 'STANDARD';
  }

  // --- User actions -----------------------------------------------------------------
  private handleUserAction(action: GameAction, input: InputManager): void {
    const user = this.userSlot;
    const owner = this.ownerGlobal();
    const userHasBall = owner === this.activeTeamIndex;
    switch (action.kind) {
      case 'SECOND_DEF': {
        this.secondPressUntil = this.elapsed + 3;
        const presser = this.defRoles.HOME.secondGlobal;
        const name = presser >= 0 ? this.slots[presser]?.kin.template.shortName : 'nearest teammate';
        this.notify(`2nd Defender called in — ${name ?? 'teammate'} joins the press (green ring).`);
        break;
      }
      case 'GK_RUSH': {
        const gk = this.slots.find((s) => s.side === 'HOME' && s.gk);
        if (gk?.gk) {
          gk.gk.manualRush = true;
          this.gkRushUntil = this.elapsed + 4;
          this.notify('GK Rush! Your keeper charges out to smother the attack.');
        }
        break;
      }
      case 'SWITCH': {
        // A manual override sticks: continuous auto-switch yields for a
        // short grace window after the user picks his own man.
        this.lastManualSwitchAt = this.elapsed;
        const cands = this.slots.filter((s) => s.side === 'HOME').map((s) => ({
          id: s.kin.id, pos: s.kin.pos, isGoalkeeper: s.role === 'GK',
        }));
        // Epic P0-6: a swipe on SWITCH picks the man in that direction
        // from the ball (chooseDirectionalSwitch finally wired); a plain
        // tap keeps the nearest-to-ball switch.
        const nextId = action.dir
          ? chooseDirectionalSwitch(cands, this.ball.state.pos, user.kin.id, action.dir)
          : chooseSwitchTarget(cands, this.ball.state.pos, user.kin.id, ownGoalX('HOME'));
        const idx = this.slots.findIndex((s) => s.kin.id === nextId);
        if (idx >= 0 && idx !== this.activeTeamIndex) {
          this.setActive(this.slots[idx]!.teamIndex, 'MANUAL');
          this.notify(`Switched to ${this.slots[idx]!.kin.template.shortName}.`);
        }
        break;
      }
      case 'TACKLE':
      case 'SLIDE': {
        if (owner >= 0 && this.slots[owner]?.side === 'AWAY') {
          const res = action.kind === 'TACKLE'
            ? user.kin.standingTackle(this.ball.state.pos, this.ball.speed())
            : user.kin.slideTackle(this.ball.state.pos, this.ball.speed());
          if (res.hit && res.touchedBallFirst) {
            this.stats.tackles += 1;
            this.gainPossession(this.activeTeamIndex, `${user.kin.template.shortName} wins it cleanly!`);
          } else if (res.hit && this.externalMatchControl) {
            // Phase 05: legs-first contact is a rules decision — the victim
            // keeps the ball and MatchEngine evaluates foul / card / advantage.
            const victim = this.slots[owner]!;
            const behindDot = Math.cos(user.kin.facingRad) * Math.cos(victim.kin.facingRad)
              + Math.sin(user.kin.facingRad) * Math.sin(victim.kin.facingRad);
            this.emit({
              kind: 'TACKLE_FOUL_CANDIDATE',
              tacklerGlobal: this.activeTeamIndex, victimGlobal: owner,
              tackleKind: action.kind === 'SLIDE' ? 'SLIDE' : 'STANDING',
              touchedBallFirst: false, closingSeverity: res.closingSeverity, behindDot,
              x: victim.kin.pos.x, z: victim.kin.pos.z,
            });
          } else if (res.hit) {
            // Ball knocked loose toward the flank.
            this.ball.state.ownerId = null;
            this.ball.state.vel.x = (this.rng() - 0.5) * 4;
            this.ball.state.vel.z = (user.kin.pos.z >= 0 ? 1 : -1) * 5;
            this.ball.state.vel.y = 0;
            this.stats.tackles += 1;
            this.notify('Tackle pokes the ball loose!');
          } else {
            this.notify(action.kind === 'TACKLE' ? 'Standing tackle — too far away.' : 'Slide tackle — no contact.');
          }
        } else if (owner < 0) {
          const d = Math.hypot(this.ball.state.pos.x - user.kin.pos.x, this.ball.state.pos.z - user.kin.pos.z);
          if (d < 1.6) this.gainPossession(this.activeTeamIndex, 'Loose ball collected.');
        }
        break;
      }
      case 'SHOULDER_CHARGE': {
        // Cycle-2 match-up defending: released from a contain (or pressed
        // cold within range) — a fair shoulder-to-shoulder strength
        // contest. Containing first is what makes it reliable: a charged
        // release after ≥0.25 s of contain gets the timing bonus, a cold
        // charge from too far away just bounces off.
        if (this.elapsed < this.chargeCooldownUntil) break;
        if (owner < 0 || this.slots[owner]?.side !== 'AWAY') break;
        const carrier = this.slots[owner]!;
        const d = Math.hypot(carrier.kin.pos.x - user.kin.pos.x, carrier.kin.pos.z - user.kin.pos.z);
        if (d > 2.3) {
          this.notify('Shoulder charge — hold TACKLE to contain him at 0.9 m first.');
          break;
        }
        this.chargeCooldownUntil = this.elapsed + 0.9;
        user.kin.applySpeedBurst(1.22, 0.3);
        const containedBonus = this.containSec >= 0.25 ? 0.16 : 0;
        const prob = Math.max(0.18, Math.min(0.86,
          0.5 + (user.kin.template.stats.phy - carrier.kin.template.stats.phy) / 220
          + containedBonus - Math.max(0, d - 1.2) * 0.12));
        if (this.rng() < prob) {
          this.stats.tackles += 1;
          matchEventBus.emit('TACKLE_WON', {
            tacklerId: user.kin.template.id, victimId: carrier.kin.template.id, isSlide: false,
          });
          this.gainPossession(this.activeTeamIndex,
            `${user.kin.template.shortName} shoulders him off it — match-up wins the ball!`);
        } else if (this.externalMatchControl && this.rng() < 0.2) {
          // A charge that arrives late and from behind is a rules call.
          const behindDot = Math.cos(user.kin.facingRad) * Math.cos(carrier.kin.facingRad)
            + Math.sin(user.kin.facingRad) * Math.sin(carrier.kin.facingRad);
          this.emit({
            kind: 'TACKLE_FOUL_CANDIDATE',
            tacklerGlobal: this.activeTeamIndex, victimGlobal: owner,
            tackleKind: 'STANDING', touchedBallFirst: false,
            closingSeverity: 0.32, behindDot,
            x: carrier.kin.pos.x, z: carrier.kin.pos.z,
          });
        } else {
          this.notify(`${carrier.kin.template.shortName} rides the shoulder charge and keeps it.`);
        }
        break;
      }
      case 'SHOOT': {
        if (!userHasBall) { this.notify('You need the ball to shoot — win it back first.'); return; }
        if (this.pendingUserShot) return;
        const type = action.shotType;
        if (type === 'FAKE_SHOT') {
          user.kin.facingRad += (65 * Math.PI) / 180;
          user.kin.applySpeedBurst(1.14, 0.4);
          this.notify('Fake shot! Sharp cut inside.');
          return;
        }
        // Addendum 5: SHOOT is CLEAR in your own half — a standard shot
        // from deep in your own territory hoofs the ball long toward the
        // furthest forward teammate instead of dribbling a weak effort at
        // a goal 80 metres away.
        const dirHome = attackDirX('HOME');
        if (type === 'STANDARD' && this.ball.state.pos.x * dirHome < -16) {
          const fwd = this.slots
            .filter((s) => s.side === 'HOME' && s !== user && !s.gk && !s.sentOff)
            .sort((a, b) => b.kin.pos.x * dirHome - a.kin.pos.x * dirHome)[0];
          if (fwd) {
            this.executePass(user, fwd, 'LOB');
            this.notify(`Cleared long toward ${fwd.kin.template.shortName}!`);
            return;
          }
        }
        // Epic P0-6: a tap shoots at real match power (0.60) for every shot
        // type — a tapped STANDARD shot used to leave at 0.25 while the AI
        // struck at 0.55–0.95.
        const shotPower = Math.max(0.6, action.power);
        const probe = computeShot({
          shooter: user.kin.template, from: this.ball.state.pos,
          aimDir: { x: 1, y: 0, z: 0 }, aimLateral: 1, powerNorm: shotPower,
          shotType: type, stamina01: user.kin.stamina01, usingWeakFoot: false, rng: this.rng,
        });
        this.pendingUserShot = { shotType: type, power: shotPower, timer: probe.windupSec };
        break;
      }
      case 'PASS':
      case 'THROUGH': {
        if (!userHasBall) { this.notify('You need possession to pass.'); return; }
        const mv = input.moveVector();
        const aim = mv.magnitude > 0.12
          ? { x: mv.x, z: mv.z }
          : { x: Math.cos(user.kin.facingRad), z: Math.sin(user.kin.facingRad) };
        // Best teammate in the aim cone (simple, robust aim assist).
        let best: Slot | null = null;
        let bestScore = -Infinity;
        for (const s of this.slots) {
          if (s.side !== 'HOME' || s === user || s.gk || s.sentOff) continue;
          const dx = s.kin.pos.x - user.kin.pos.x; const dz = s.kin.pos.z - user.kin.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.5 || dist > 55) continue;
          const cos = (dx * aim.x + dz * aim.z) / (dist * (Math.hypot(aim.x, aim.z) || 1));
          const score = cos * 2.5 - dist / 60;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        if (best) {
          const pt: PassType = action.kind === 'THROUGH' ? 'THROUGH' : action.passType;
          // Tap pass = the standard 0.55 weight; a charged press drives it.
          this.executePass(user, best, pt, undefined, Math.max(0.55, action.power));
          this.userPassInFlight = true;
          this.notify(`${pt.replace(/_/g, ' ')} pass toward ${best.kin.template.shortName}.`);
        }
        break;
      }
      case 'SKILL': {
        if (!userHasBall) { this.notify('Skill moves need the ball at your feet.'); return; }
        let moveId = action.moveId;
        if (!moveId) {
          const priority = ['LANE_CHANGE', 'ROULETTE', 'HEEL_TO_HEEL', 'BALL_ROLL', 'KNOCK_ON'] as const;
          moveId = priority.find((m) => user.kin.template.skillMoves >= SKILL_MOVES[m].stars) ?? 'KNOCK_ON';
        }
        const res = this.skills.tryStart(moveId, user.kin, action.lateralSign);
        this.notify(res.ok ? `${res.move.name}! ${res.move.description}` : res.reason);
        break;
      }
      case 'TRIGGER_RUN': {
        const fwd = this.slots
          .filter((s) => s.side === 'HOME' && s !== user && !s.gk)
          .sort((a, b) => b.kin.pos.x - a.kin.pos.x)[0];
        if (fwd?.outfield) {
          this.atkRoles.HOME.runners = [this.slots.indexOf(fwd)];
          this.notify(`${fwd.kin.template.shortName} is making a run — play him in with Through!`);
        }
        break;
      }
    }
  }

  // --- AI carrier execution ---------------------------------------------------------
  private executeCarrierAction(agent: OutfieldAgent, carrier: Slot): void {
    const action = agent.pendingAction;
    if (!action) return;
    agent.pendingAction = null;
    const side = carrier.side;
    if (this.teamActionCooldown[side] > 0) return;
    const profile = side === 'AWAY' ? this.profile : this.homeProfile;
    switch (action.kind) {
      case 'SHOOT': {
        // Difficulty shot precision bends the aim point (never the ball speed).
        const err = (this.rng() * 2 - 1) * (1 - profile.shotPrecision) * 2.6;
        const aimZ = Math.max(-3.4, Math.min(3.4, action.aimZ + err));
        const dist = Math.abs(opponentGoalX(side) - carrier.kin.pos.x);
        const power = Math.max(0.55, Math.min(0.95, 0.5 + dist / 55));
        this.executeShot(carrier, aimZ, power, this.aiShotType(carrier), action.xg);
        this.teamActionCooldown[side] = 0.5;
        break;
      }
      case 'PASS': {
        let target = this.slot(this.globalOf(side, action.targetIndex));
        if (!target) return;
        // P1-15 switch of play: with the plan's bias, the carrier sprays
        // the ball to the far side instead — same role band, opposite lane —
        // stretching a defence that has shuffled across.
        const plan = side === 'AWAY' ? this.planAway : this.planHome;
        if (!action.through && this.rng() < plan.switchPlayBias * 0.35) {
          const carrierLane = laneOfZ(carrier.kin.pos.z);
          if (laneOfZ(target.kin.pos.z) === carrierLane && carrierLane !== 'CENTRE') {
            const far = this.slots
              .filter((s) => s.side === side && !s.gk && !s.sentOff && s !== carrier && s !== target)
              .filter((s) => laneOfZ(s.kin.pos.z) !== carrierLane && laneOfZ(s.kin.pos.z) !== 'CENTRE')
              .sort((a, b) => Math.abs(a.kin.pos.x - target!.kin.pos.x) - Math.abs(b.kin.pos.x - target!.kin.pos.x))[0];
            if (far) target = far;
          }
        }
        // Pass accuracy: misplace the target point slightly on low tiers.
        const errMag = (1 - profile.passAccuracy) * 3.2;
        const pt = action.through && action.targetPoint
          ? { x: action.targetPoint.x + (this.rng() * 2 - 1) * errMag, z: action.targetPoint.z + (this.rng() * 2 - 1) * errMag }
          : undefined;
        this.executePass(carrier, target, action.through ? 'THROUGH' : 'GROUND', pt);
        this.teamActionCooldown[side] = 0.4;
        break;
      }
      case 'SKILL': {
        carrier.kin.applySpeedBurst(1.16, 0.45);
        carrier.kin.facingRad += (this.rng() < 0.5 ? -1 : 1) * 0.5;
        this.teamActionCooldown[side] = 0.8;
        break;
      }
      default:
        break; // DRIBBLE / HOLD are steering-only
    }
  }

  // --- Defensive AI tackles ------------------------------------------------------------
  /**
   * Cycle-2 match-up defending (AI): the primary presser already steers to
   * the 0.9 m goal-side contain point (OutfieldAI.decideDefending). He no
   * longer lunges the instant he arrives — he must first CONTAIN: time
   * inside 1.5 m of the carrier accumulates in matchUpSec, and only then
   * does he throw the shoulder charge, a strength contest (his PHY and
   * standing tackle vs the carrier's PHY and dribbling). Higher tiers
   * contain for less time and charge cleaner (pressCoordination), which
   * is what makes them harder without ever being faster.
   */
  private tryAiTackle(presser: OutfieldAgent, carrier: Slot, dt: number): void {
    if (presser.tackleCooldown > 0 || presser.stumbleTimer > 0) { presser.matchUpSec = 0; return; }
    const d = Math.hypot(presser.kin.pos.x - carrier.kin.pos.x, presser.kin.pos.z - carrier.kin.pos.z);
    // Contain time banks inside 1.7 m. Movement is facing-locked, so a
    // presser mirroring a moving carrier oscillates across any hard
    // radius line — a hard reset at 1.5 m meant the bank never filled
    // and the charge never came. Beyond the pocket the bank DECAYS
    // instead (gone entirely past 3 m): sustained pressure is what
    // counts, not an unbroken stopwatch inside an exact circle.
    if (d > 3) { presser.matchUpSec = 0; return; }
    if (d > 1.7) { presser.matchUpSec = Math.max(0, presser.matchUpSec - dt * 2); return; }
    presser.matchUpSec += dt;
    if (presser.matchUpSec > this.aiContainPeak) this.aiContainPeak = presser.matchUpSec;
    const prof = presser.side === 'AWAY' ? this.profile : this.homeProfile;
    const containNeeded = Math.max(0.22, 0.72 - prof.pressCoordination * 0.5);
    if (presser.matchUpSec < containNeeded || d > 1.35) return;
    // Shoulder charge.
    presser.matchUpSec = 0;
    presser.tackleCooldown = 1.15;
    const adj = presser.side === 'AWAY' ? this.profile.tackleAdj : 0;
    const prob = Math.max(0.14, Math.min(0.8,
      0.4 + (presser.template.subStats.standingTackle - carrier.kin.template.stats.dri) / 260
      + (presser.template.stats.phy - carrier.kin.template.stats.phy) / 300 + adj));
    if (this.rng() < prob) {
      this.stats.tackles += 1;
      matchEventBus.emit('TACKLE_WON', {
        tacklerId: presser.template.id, victimId: carrier.kin.template.id, isSlide: false,
      });
      this.gainPossession(presser.globalIndex,
        presser.side === 'AWAY' ? `${presser.template.shortName} contains, then shoulders him off it for the away side.` : `${presser.template.shortName} contains and wins it back with a shoulder charge!`);
    } else {
      presser.stumbleTimer = 0.42;
      // Phase 05: a mistimed AI charge can be a foul — MatchEngine evaluates
      // severity from the closing speed and the behind-the-player angle.
      if (this.externalMatchControl) {
        const aggression = presser.side === 'HOME' ? tacticsModifiers(this.tacticsHome).aggressionMult : 1;
        if (this.rng() < 0.38 * aggression) {
          const behindDot = Math.cos(presser.kin.facingRad) * Math.cos(carrier.kin.facingRad)
            + Math.sin(presser.kin.facingRad) * Math.sin(carrier.kin.facingRad);
          this.emit({
            kind: 'TACKLE_FOUL_CANDIDATE',
            tacklerGlobal: presser.globalIndex, victimGlobal: this.slots.indexOf(carrier),
            tackleKind: 'STANDING', touchedBallFirst: false,
            closingSeverity: 0.3 + this.rng() * 0.55, behindDot,
            x: carrier.kin.pos.x, z: carrier.kin.pos.z,
          });
        }
      }
    }
  }

  // --- GK distribution ------------------------------------------------------------------
  private distribute(gkSlot: Slot): void {
    const opponents = this.slots.filter((s) => s.side !== gkSlot.side);
    let best: Slot | null = null;
    let bestScore = -Infinity;
    for (const s of this.slots) {
      if (s.side !== gkSlot.side || s === gkSlot) continue;
      let minOpp = Infinity;
      for (const o of opponents) {
        minOpp = Math.min(minOpp, Math.hypot(o.kin.pos.x - s.kin.pos.x, o.kin.pos.z - s.kin.pos.z));
      }
      const dist = Math.hypot(s.kin.pos.x - gkSlot.kin.pos.x, s.kin.pos.z - gkSlot.kin.pos.z);
      const score = minOpp - dist * 0.12;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (!best) return;
    const dist = Math.hypot(best.kin.pos.x - gkSlot.kin.pos.x, best.kin.pos.z - gkSlot.kin.pos.z);
    this.executePass(gkSlot, best, dist > 32 ? 'LOB' : 'GROUND');
    gkSlot.gk?.endAction();
    this.notify(`${gkSlot.kin.template.shortName} distributes to ${best.kin.template.shortName}.`);
  }

  // --- Phase 05 public rules API -------------------------------------------------------------

  get currentSetPiece(): ActiveSetPiece | null {
    return this.activeSetPiece;
  }

  currentPossessionSide(): TeamSide | null {
    return this.possessingSide();
  }

  /** Live position snapshot for the rules engines (frame-of-pass accuracy). */
  positionsSnapshot(): { global: number; side: TeamSide; x: number; z: number; role: PlayerTemplate['position']; sentOff: boolean }[] {
    return this.slots.map((s, i) => ({
      global: i, side: s.side, x: s.kin.pos.x, z: s.kin.pos.z, role: s.role, sentOff: s.sentOff,
    }));
  }

  playerName(global: number): string {
    return this.slots[global]?.kin.template.shortName ?? 'Player';
  }

  templateOf(global: number): PlayerTemplate | undefined {
    return this.slots[global]?.kin.template;
  }

  /** Send a player off: parked by the tunnel, skipped by every sim system.
   *  Epic P0-7: a sent-off GOALKEEPER is replaced for real — the best
   *  available outfielder goes in goal as an emergency keeper (GK
   *  sub-stats capped, −30% effectiveness) and HIS slot is the one
   *  vacated. Never bookkeeping-only. */
  setSentOff(global: number): void {
    const s = this.slot(global);
    if (!s) return;
    if (s.gk) {
      const emergency = this.slots
        .filter((x) => x.side === s.side && !x.gk && !x.sentOff)
        .sort((a, b) => (b.kin.template.subStats.gkPositioning + b.kin.template.subStats.gkReflexes)
          - (a.kin.template.subStats.gkPositioning + a.kin.template.subStats.gkReflexes))[0];
      if (emergency) {
        const tpl = emergency.kin.template;
        const capped: PlayerTemplate = {
          ...tpl,
          subStats: {
            ...tpl.subStats,
            gkReflexes: Math.min(35, tpl.subStats.gkReflexes),
            gkDiving: Math.min(35, tpl.subStats.gkDiving),
            gkHandling: Math.min(35, tpl.subStats.gkHandling),
            gkPositioning: Math.min(35, tpl.subStats.gkPositioning),
            gkKicking: Math.min(35, tpl.subStats.gkKicking),
          },
        };
        s.kin.template = capped;
        s.gk = new GoalkeeperAI(s.side, capped, this.rng);
        this.notify(`${tpl.shortName} goes in goal — emergency keeper after the red card.`);
        this.setSentOff(this.slots.indexOf(emergency));
        return;
      }
    }
    s.sentOff = true;
    if (this.ball.state.ownerId === s.kin.id) this.ball.state.ownerId = null;
    s.kin.pos.x = 0;
    s.kin.pos.z = s.side === 'HOME' ? 38.5 : -38.5;
    s.kin.speed = 0;
    if (s.outfield) s.outfield.state = 'HOLD_SHAPE';
  }

  isSentOff(global: number): boolean {
    return this.slots[global]?.sentOff ?? false;
  }

  /** Lab hook: execute a real pass between two players right now. */
  debugPass(fromGlobal: number, toGlobal: number): boolean {
    const from = this.slot(fromGlobal);
    const to = this.slot(toGlobal);
    if (!from || !to || this.ownerGlobal() !== fromGlobal) return false;
    this.executePass(from, to, 'GROUND');
    return true;
  }

  /**
   * Set up a set piece: everyone takes shape anchors around the ball spot,
   * explicit placements (taker, wall, box attackers, GKs) override, and the
   * taker is given the ball. Play freezes until the delivery.
   */
  startSetPiece(args: {
    type: SetPieceType;
    side: TeamSide;
    ballX: number;
    ballZ: number;
    takerGlobal: number;
    placements?: Map<number, { x: number; z: number }>;
    origin: RestartOrigin;
    indirect?: boolean;
  }): void {
    this.awaitingRestart = false;
    this.goalResetTimer = 0;
    this.pendingRestartOrigin = args.origin;
    const ballXZ = { x: args.ballX, z: args.ballZ };
    for (const side of SIDES) {
      const oppXs = this.slots.filter((s) => s.side !== side).map((s) => s.kin.pos.x);
      const trailing = side === 'HOME'
        ? this.stats.scoreHome < this.stats.scoreAway
        : this.stats.scoreAway < this.stats.scoreHome;
      this.shapes[side] = this.tactical[side].computeShape(side, ballXZ, oppXs, this.stats.minute, trailing);
    }
    for (const s of this.slots) {
      if (s.sentOff) continue;
      const anchor = this.shapes[s.side]?.anchors[s.teamIndex];
      if (s.gk) {
        s.kin.pos.x = ownGoalX(s.side) + attackDirX(s.side) * 1.2;
        s.kin.pos.z = Math.max(-3, Math.min(3, args.ballZ * 0.2));
      } else if (anchor) {
        s.kin.pos.x = anchor.x;
        s.kin.pos.z = anchor.z;
      }
      s.kin.speed = 0;
      if (s.outfield) { s.outfield.state = 'HOLD_SHAPE'; s.outfield.pendingAction = null; }
      if (s.gk) s.gk.endAction();
    }
    if (args.placements) {
      for (const [g, p] of args.placements) {
        const s = this.slot(g);
        if (s && !s.sentOff) { s.kin.pos.x = p.x; s.kin.pos.z = p.z; }
      }
    }
    const taker = this.slot(args.takerGlobal);
    this.ball.reset(args.ballX, args.ballZ);
    const wallGlobals = args.placements
      ? [...args.placements.keys()].filter((g) => {
          const s = this.slot(g);
          return s !== undefined && s.side !== args.side && !s.gk;
        })
      : [];
    this.wallGlobalsCache = args.type === 'FREE_KICK' ? wallGlobals : [];
    this.activeSetPiece = {
      type: args.type,
      side: args.side,
      takerGlobal: args.takerGlobal,
      // The user delivers their own outfield set pieces; GK restarts and all
      // CPU set pieces deliver on a timer.
      aiTimer: taker && taker.side === 'HOME' && !this.autonomousHome && !taker.gk ? Infinity : 1.5 + this.rng() * 1.3,
      wallGlobals: this.wallGlobalsCache,
      indirect: args.indirect ?? false,
    };
    if (taker) {
      // Taker stands just behind the ball, facing the target.
      const dir = attackDirX(args.side);
      taker.kin.pos.x = args.ballX - dir * 0.7;
      taker.kin.pos.z = args.ballZ;
      taker.kin.facingRad = dir > 0 ? 0 : Math.PI;
      this.gainPossession(args.takerGlobal);
    }
    if (args.type !== 'FREE_KICK') this.renderState.trajectory = null;
  }

  /** Freeze-frame while a set piece is aimed. Returns false on the delivery tick. */
  private updateSetPiece(dt: number, input: InputManager): boolean {
    const sp = this.activeSetPiece;
    if (!sp) return false;
    const taker = this.slot(sp.takerGlobal);
    // User taker delivers with the normal PASS / SHOOT actions.
    while (this.actionQueue.length > 0) {
      const a = this.actionQueue.shift()!;
      if (this.autonomousHome) break;
      if (sp.type === 'PENALTY' || sp.type === 'SHOOTOUT_KICK') continue; // MatchEngine strikes penalties
      if (sp.indirect && a.kind === 'SHOOT') {
        // Indirect free kick: a direct shot is not a legal delivery —
        // the ball stays dead until the taker plays it to a teammate.
        this.notify('Indirect free kick — it must touch another player first. Pass it.');
        continue;
      }
      if (a.kind === 'PASS' || a.kind === 'THROUGH' || a.kind === 'SHOOT') {
        this.activeSetPiece = null;
        this.renderState.trajectory = null;
        if (sp.type === 'CORNER' && taker && a.kind !== 'SHOOT') {
          this.deliverCorner(taker);
        } else {
          this.handleUserAction(a, input);
        }
        if (sp.wallGlobals.length > 0) this.wallJumpTimer = 0.55;
        return false;
      }
    }
    if (this.ball.state.ownerId === null) {
      // Ball was struck by other means (penaltyStrike) — play on.
      this.activeSetPiece = null;
      this.renderState.trajectory = null;
      return false;
    }
    this.attachBallToOwner();
    // AI taker delivers on a timer.
    if (Number.isFinite(sp.aiTimer)) {
      sp.aiTimer -= dt;
      if (sp.aiTimer <= 0 && taker) {
        this.activeSetPiece = null;
        this.renderState.trajectory = null;
        if (sp.wallGlobals.length > 0) this.wallJumpTimer = 0.55;
        this.deliverAiSetPiece(sp, taker);
        return false;
      }
    }
    return true;
  }

  private deliverCorner(taker: Slot): void {
    const goalX = opponentGoalX(taker.side);
    const dir = attackDirX(taker.side);
    const target = this.slots
      .filter((s) => s.side === taker.side && s !== taker && !s.gk && !s.sentOff)
      .sort((a, b) => (b.kin.template.subStats.headingAccuracy) - (a.kin.template.subStats.headingAccuracy))[0];
    if (!target) return;
    this.executePass(taker, target, 'CROSS', { x: goalX - dir * 9.5, z: (this.rng() - 0.5) * 6 });
    this.notify(`Corner whipped in toward ${target.kin.template.shortName}!`);
  }

  private deliverAiSetPiece(sp: ActiveSetPiece, taker: Slot): void {
    const side = taker.side;
    switch (sp.type) {
      case 'CORNER':
        this.deliverCorner(taker);
        break;
      case 'PENALTY':
      case 'SHOOTOUT_KICK': {
        const aimZ = (this.rng() < 0.5 ? -1 : 1) * (1.7 + this.rng() * 1.3);
        const aimY = this.rng() < 0.4 ? 1.6 + this.rng() * 0.5 : 0.3 + this.rng() * 0.5;
        this.penaltyStrike(sp.takerGlobal, aimZ, aimY, 0.75 + this.rng() * 0.2);
        break;
      }
      case 'FREE_KICK': {
        const goalX = opponentGoalX(side);
        const dist = Math.hypot(goalX - taker.kin.pos.x, taker.kin.pos.z);
        if (sp.indirect) {
          // Indirect: the AI must play it to a teammate, never shoot.
          const target = this.bestOpenTeammate(taker);
          if (target) this.executePass(taker, target, 'GROUND');
        } else if (dist <= 32) {
          const aimZ = Math.max(-3.3, Math.min(3.3, (taker.kin.pos.z >= 0 ? -1 : 1) * (2.2 + this.rng() * 0.9)));
          const xg = computeXG({ x: taker.kin.pos.x, z: taker.kin.pos.z }, attackDirX(side),
            this.slots.filter((s) => s.side !== side).map((s) => ({ x: s.kin.pos.x, z: s.kin.pos.z }))).xg;
          const specialist = taker.kin.template.playStyles.includes('DEAD_BALL_SPECIALIST');
          this.executeShot(taker, aimZ, 0.72 + this.rng() * 0.18, specialist ? 'FINESSE' : 'STANDARD', xg);
        } else {
          const target = this.bestOpenTeammate(taker);
          if (target) this.executePass(taker, target, 'LOB');
        }
        break;
      }
      default: { // THROW_IN / GOAL_KICK — clean restart to the most open teammate.
        const target = this.bestOpenTeammate(taker);
        if (target) {
          const d = Math.hypot(target.kin.pos.x - taker.kin.pos.x, target.kin.pos.z - taker.kin.pos.z);
          this.executePass(taker, target, d > 30 ? 'LOB' : 'GROUND');
        }
        break;
      }
    }
  }

  private bestOpenTeammate(from: Slot): Slot | null {
    const opponents = this.slots.filter((s) => s.side !== from.side && !s.sentOff);
    let best: Slot | null = null;
    let bestScore = -Infinity;
    for (const s of this.slots) {
      if (s.side !== from.side || s === from || s.sentOff) continue;
      if (s.gk && from.gk) continue;
      let minOpp = Infinity;
      for (const o of opponents) {
        minOpp = Math.min(minOpp, Math.hypot(o.kin.pos.x - s.kin.pos.x, o.kin.pos.z - s.kin.pos.z));
      }
      const dist = Math.hypot(s.kin.pos.x - from.kin.pos.x, s.kin.pos.z - from.kin.pos.z);
      const score = minOpp - dist * 0.1 + attackDirX(from.side) * (s.kin.pos.x - from.kin.pos.x) * 0.05;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /**
   * Penalty strike: a direct ballistics kick at an exact point inside (or
   * outside) the goal frame. The defending GK reads it via onShotFired —
   * or is already committed by a user forceDive.
   */
  penaltyStrike(takerGlobal: number, aimZ: number, aimY: number, power01: number): boolean {
    const taker = this.slot(takerGlobal);
    if (!taker || this.ownerGlobal() !== takerGlobal) return false;
    const goalX = opponentGoalX(taker.side);
    const from = this.ball.state.pos;
    const dist = Math.abs(goalX - from.x);
    const flightT = Math.max(0.34, dist / (17 + power01 * 11));
    const vel = createVec3(
      (goalX - from.x) / flightT,
      (aimY - from.y) / flightT + 0.5 * 9.81 * flightT,
      (aimZ - from.z) / flightT,
    );
    this.ball.kick(vel, createVec3(0, 2, 0), taker.kin.id, taker.side, 'STANDARD');
    this.pendingShotInfo = { side: taker.side, xg: 0.76, shooterGlobal: takerGlobal };
    this.passTargetGlobal = -1;
    this.emit({ kind: 'SHOT', side: taker.side, shooterGlobal: takerGlobal, x: from.x, z: from.z, xg: 0.76 });
    if (taker.side === 'HOME') this.stats.shotsHome += 1; else this.stats.shotsAway += 1;
    matchEventBus.emit('BALL_KICKED', { playerId: taker.kin.template.id, power: power01, shotType: 'STANDARD', isShot: true });
    const defSide: TeamSide = taker.side === 'HOME' ? 'AWAY' : 'HOME';
    const gkSlot = this.slots.find((s) => s.side === defSide && s.gk);
    if (gkSlot?.gk) gkSlot.gk.onShotFired(this.ball, gkSlot.kin.pos, 0);
    return true;
  }

  /** User-committed GK dive for penalties (Phase 05 SetPieceHUD zones). */
  forceGkDive(side: TeamSide, targetZ: number, high: boolean): void {
    const gkSlot = this.slots.find((s) => s.side === side && s.gk);
    gkSlot?.gk?.forceDive(targetZ, high);
  }

  // --- Main step ---------------------------------------------------------------------------
  step(dt: number, input: InputManager): void {
    this.tick += 1;
    this.elapsed += dt;
    const minutes = this.elapsed * (90 / 1500);
    this.stats.minute = Math.floor(minutes);
    if (this.teamActionCooldown.HOME > 0) this.teamActionCooldown.HOME -= dt;
    if (this.teamActionCooldown.AWAY > 0) this.teamActionCooldown.AWAY -= dt;
    // P1-15: the pattern read fades unless the habit keeps repeating.
    this.userLaneCounts.LEFT *= 1 - dt * 0.02;
    this.userLaneCounts.CENTRE *= 1 - dt * 0.02;
    this.userLaneCounts.RIGHT *= 1 - dt * 0.02;
    if (this.passGraceTimer > 0) this.passGraceTimer -= dt;
    if (this.lastPassAnimTimer > 0) this.lastPassAnimTimer -= dt;
    if (this.lastShotAnimTimer > 0) this.lastShotAnimTimer -= dt;
    if (this.gkRushUntil > 0 && this.elapsed > this.gkRushUntil) {
      const gk = this.slots.find((s) => s.side === 'HOME' && s.gk);
      if (gk?.gk) gk.gk.manualRush = false;
      this.gkRushUntil = -1;
    }

    // Phase 05: while a set piece is being aimed, play is frozen in the
    // set-piece formation; the taker's delivery resumes normal play.
    if (this.wallJumpTimer > 0) this.wallJumpTimer -= dt;
    if (this.activeSetPiece) {
      const stillAiming = this.updateSetPiece(dt, input);
      if (stillAiming) {
        this.publishRender(minutes);
        return;
      }
    }

    while (this.actionQueue.length > 0) {
      const a = this.actionQueue.shift()!;
      if (!this.autonomousHome) this.handleUserAction(a, input);
    }

    const ownerG = this.ownerGlobal();
    const possSide = ownerG >= 0 ? this.slots[ownerG]!.side : null;
    if (possSide) this.possessionTime[possSide] += dt;

    // --- Tactical shapes (every tick — cheap, keeps anchors glued to the ball) ---
    const ballXZ = { x: this.ball.state.pos.x, z: this.ball.state.pos.z };
    for (const side of SIDES) {
      const oppXs = this.slots.filter((s) => s.side !== side).map((s) => s.kin.pos.x);
      const trailing = side === 'HOME'
        ? this.stats.scoreHome < this.stats.scoreAway
        : this.stats.scoreAway < this.stats.scoreHome;
      const menDown = this.slots.filter((s) => s.side === side && s.sentOff).length;
      this.shapes[side] = this.tactical[side].computeShape(side, ballXZ, oppXs, minutes, trailing, menDown);
    }

    // --- Decision round (10Hz): role assignment for both teams ---------------------
    if (this.tick % 6 === 0) {
      // P1-15: both benches re-plan from the live game state.
      this.planHome = computeMatchPlan({
        side: 'HOME', scoreFor: this.stats.scoreHome, scoreAgainst: this.stats.scoreAway,
        minute: minutes, difficulty: this.homeProfile.id,
      });
      this.planAway = computeMatchPlan({
        side: 'AWAY', scoreFor: this.stats.scoreAway, scoreAgainst: this.stats.scoreHome,
        minute: minutes, difficulty: this.profile.id,
        opponentLaneCounts: this.userLaneCounts,
      });
      if (this.planAway.mentality !== this.mentalityAway) {
        this.mentalityAway = this.planAway.mentality;
        this.tactical.AWAY.setMentality(this.planAway.mentality);
      }
      // The user's own mentality is theirs in a played match; in Manager
      // mode (autonomous HOME) the plan drives the home bench too.
      if (this.autonomousHome && this.planHome.mentality !== this.mentalityHome) {
        this.mentalityHome = this.planHome.mentality;
        this.tactical.HOME.setMentality(this.planHome.mentality);
      }
      // Time-wasting shows up as carrier patience, never as speed or errors.
      this.awayProfileNow = this.planAway.timeWasting > 0
        ? { ...this.profile, carrierPatienceMult: this.profile.carrierPatienceMult * (1 + this.planAway.timeWasting * 2.2) }
        : this.profile;
      this.homeProfileNow = this.autonomousHome && this.planHome.timeWasting > 0
        ? { ...this.homeProfile, carrierPatienceMult: this.homeProfile.carrierPatienceMult * (1 + this.planHome.timeWasting * 2.2) }
        : this.homeProfile;
      // Pattern adaptation: announce a fresh read (commentary picks it up),
      // at most once per ~4 match minutes; the read itself decays away.
      if (this.planAway.adaptedLane !== this.adaptedLaneNow) {
        this.adaptedLaneNow = this.planAway.adaptedLane;
        if (this.adaptedLaneNow && this.elapsed - this.adaptedAnnouncedAt > 60) {
          this.adaptedAnnouncedAt = this.elapsed;
          matchEventBus.emit('PATTERN_ADAPTED', { lane: this.adaptedLaneNow });
          this.notify(`The opposition have read your ${this.adaptedLaneNow.toLowerCase()} side — they are marking it tighter now.`);
        }
      }
      // Tactical subs for the autonomous (Manager-mode) home bench: the
      // plan asks, stamina decides who actually comes off.
      if (this.autonomousHome && this.planHome.subAdvice !== 'NONE' && minutes >= 55 && this.subsUsed < this.maxSubs) {
        let tiredIdx = -1;
        let tiredStamina = 0.55;
        this.slots.forEach((s, gi) => {
          if (s.side === 'HOME' && !s.gk && !s.sentOff && s.kin.stamina01 < tiredStamina) {
            tiredStamina = s.kin.stamina01;
            tiredIdx = gi;
          }
        });
        if (tiredIdx >= 0) {
          const benchIdx = this.bench.findIndex((b) => b.stamina01 > 0.9);
          if (benchIdx >= 0) this.substitute(this.slots[tiredIdx]!.teamIndex, benchIdx);
        }
      }
      for (const side of SIDES) {
        const agents = this.slots.filter((s) => s.side === side && s.outfield && !s.sentOff).map((s) => s.outfield!);
        const shape = this.shapes[side]!;
        if (possSide === side) {
          const carrier = ownerG >= 0 ? ownerG : -1;
          this.atkRoles[side] = assignAttackingRoles({
            attacking: agents, carrierGlobal: carrier,
            forwardRunProb: shape.forwardRunProb, rng: this.rng,
          });
        } else if (possSide !== null) {
          const oppAgents = this.slots.filter((s) => s.side !== side && s.outfield && !s.sentOff).map((s) => s.outfield!);
          const isUserTeam = side === 'HOME' && !this.autonomousHome;
          this.defRoles[side] = assignDefensiveRoles({
            defending: agents, ballPos: ballXZ,
            pressRadius: shape.pressRadius * (side === 'AWAY' ? this.profile.pressRadiusMult : 1),
            secondPressRequested: isUserTeam && this.elapsed < this.secondPressUntil,
            // P1-15 pressing trap: near the touchline a World Class+ plan
            // turns ordinary pressing into a coordinated trap.
            pressCoordination: side === 'AWAY'
              ? (this.planAway.pressTrap && Math.abs(ballXZ.z) > 22 ? Math.max(this.profile.pressCoordination, 0.95) : this.profile.pressCoordination)
              : (this.autonomousHome && this.planHome.pressTrap && Math.abs(ballXZ.z) > 22 ? Math.max(this.homeProfile.pressCoordination, 0.9) : 0.45),
            opponents: oppAgents,
            ownThird: this.tactical[side].isOwnThird(side, ballXZ),
            rng: this.rng,
          });
        }
      }
    }

    // --- Per-agent decisions (staggered 10Hz) + steering (60Hz) -----------------------
    const view: WorldView & { carrierOptions?: CarrierOption[] } = {
      ballPos: ballXZ,
      ballOwnerGlobal: ownerG,
      possessingSide: possSide,
      minute: minutes,
      secondPresserGlobal: -1,
      primaryPresserGlobal: -1,
      markMap: new Map(),
      runnersBySide: { HOME: this.atkRoles.HOME.runners, AWAY: this.atkRoles.AWAY.runners },
      supportBySide: { HOME: this.atkRoles.HOME.supports, AWAY: this.atkRoles.AWAY.supports },
    };

    for (const s of this.slots) {
      const agent = s.outfield;
      if (!agent || s.sentOff) continue;
      const isUser = !this.autonomousHome && s.side === 'HOME' && s.teamIndex === this.activeTeamIndex;
      const shape = this.shapes[s.side]!;
      const oppShape = this.shapes[s.side === 'HOME' ? 'AWAY' : 'HOME']!;
      const def = this.defRoles[s.side];
      view.primaryPresserGlobal = def.primaryGlobal;
      view.secondPresserGlobal = def.secondGlobal;
      view.markMap = def.markMap;

      if ((this.tick + s.teamIndex * 2 + (s.side === 'AWAY' ? 3 : 0)) % 6 === 0) {
        // Build views for this agent.
        const ownSlots = this.slots.filter((x) => x.side === s.side && !x.sentOff);
        const oppSlots = this.slots.filter((x) => x.side !== s.side && !x.sentOff);
        const ownView = {
          indices: ownSlots.map((x) => this.slots.indexOf(x)),
          positions: ownSlots.map((x) => ({ x: x.kin.pos.x, z: x.kin.pos.z })),
          templates: ownSlots.map((x) => x.kin.template),
        };
        const oppView = {
          indices: oppSlots.map((x) => this.slots.indexOf(x)),
          positions: oppSlots.map((x) => ({ x: x.kin.pos.x, z: x.kin.pos.z })),
          templates: oppSlots.map((x) => x.kin.template),
        };
        if (ownerG === this.slots.indexOf(s)) {
          view.carrierOptions = ownSlots
            .filter((x) => x !== s && !x.gk)
            .map((x) => ({
              teamIndex: x.teamIndex,
              pos: { x: x.kin.pos.x, z: x.kin.pos.z },
              pace: x.kin.template.stats.pac,
              isRunner: this.atkRoles[s.side].runners.includes(this.slots.indexOf(x)),
            }));
        }
        agent.decide(
          view, shape, oppShape, ownView, oppView,
          s.side === 'AWAY' ? (this.awayProfileNow ?? this.profile) : (this.homeProfileNow ?? this.homeProfile),
          s.side === 'HOME' ? this.mentalityHome : this.mentalityAway,
          tacticsModifiers(s.side === 'HOME' ? this.tacticsHome : DEFAULT_TACTICS),
          this.rng, isUser, this.elapsed < this.secondPressUntil,
        );
        const markG = def.markMap.get(agent.globalIndex);
        if (markG !== undefined) {
          const att = this.slots[markG];
          if (att) {
            // Marking tightness from the tier: 2.3m of respect at Rookie,
            // 0.85m touch-tight at Ultimate — positioning, not speed.
            // P1-15: on the adapted lane the read tightens the screw further.
            const prof = s.side === 'AWAY' ? this.profile : this.homeProfile;
            agent.markStandOff = 2.3 - prof.markingTightness * 1.45;
            if (s.side === 'AWAY' && this.adaptedLaneNow && laneOfZ(att.kin.pos.z) === this.adaptedLaneNow) {
              agent.markStandOff *= 0.62;
            }
            agent.setMarkTarget({ x: att.kin.pos.x, z: att.kin.pos.z });
          }
        }
        if (ownerG === this.slots.indexOf(s) && !isUser) {
          this.executeCarrierAction(agent, s);
        }
      }

      // Game-state mentality now comes from the MatchPlan brain, computed
      // once per decision round above (P1-15) — nothing to refresh here.

      // During the goal celebration: the scorer holds his spot and poses,
      // his two nearest teammates jog over to him, everyone else drifts
      // back to shape (Epic P0-5 — scorer + mates are exempt from the drift).
      if (this.goalResetTimer > 0 && agent.state !== 'USER_CONTROLLED') {
        const gi = this.slots.indexOf(s);
        const scorerSlot = this.lastScorerGlobal >= 0 ? this.slots[this.lastScorerGlobal] : null;
        if (gi === this.lastScorerGlobal) {
          agent.targetX = s.kin.pos.x; agent.targetZ = s.kin.pos.z; agent.sprint = false;
        } else if (scorerSlot && this.celebrationMates.includes(gi)) {
          const off = gi % 2 === 0 ? 1.35 : -1.35;
          agent.targetX = scorerSlot.kin.pos.x + off * 0.4;
          agent.targetZ = scorerSlot.kin.pos.z + off;
          agent.sprint = false;
        } else {
          const anchor = shape.anchors[s.teamIndex];
          if (anchor) { agent.targetX = anchor.x; agent.targetZ = anchor.z; agent.sprint = false; }
        }
      }

      // Steering.
      if (isUser) {
        // User movement is applied below from the input vector.
      } else if (ownerG === this.slots.indexOf(s)) {
        agent.steerCarrier(dt, minutes);
      } else if (this.passTargetGlobal === this.slots.indexOf(s)) {
        // Receiver runs to meet the ball — to the point the pass was
        // AIMED at, fixed at kick time in executePass (his feet for a
        // pass to feet, the space ahead for a through ball). Chasing a
        // live-recomputed intercept point is a feedback loop: the
        // projection advances as fast as the receiver runs, so he
        // sprinted past his own pass and never trapped it.
        agent.state = 'RECEIVE_PASS';
        const aimX = this.passAimPoint?.x ?? this.ball.state.pos.x;
        const aimZ = this.passAimPoint?.z ?? this.ball.state.pos.z;
        const aimDist = Math.hypot(aimX - s.kin.pos.x, aimZ - s.kin.pos.z);
        if (aimDist < 1.2) {
          // Planted on the spot the pass was played to: wait for the
          // ball instead of orbiting it — the steering magnitude floor
          // keeps a "sprinting" agent jogging at ~5 m/s, which carried
          // receivers metres past a ball played to their feet.
          agent.targetX = s.kin.pos.x;
          agent.targetZ = s.kin.pos.z;
          agent.sprint = false;
        } else {
          agent.targetX = aimX;
          agent.targetZ = aimZ;
          agent.sprint = aimDist > 3;
        }
        const mates = this.slots.filter((x) => x.side === s.side && x !== s).map((x) => ({ x: x.kin.pos.x, z: x.kin.pos.z }));
        agent.steer(dt, minutes, mates);
      } else {
        const mates = this.slots.filter((x) => x.side === s.side && x !== s).map((x) => ({ x: x.kin.pos.x, z: x.kin.pos.z }));
        agent.steer(dt, minutes, mates);
      }

      // AI primary presser match-up: contain at 0.9 m, then shoulder charge.
      if (agent.state === 'PRIMARY_PRESSER' && ownerG >= 0) {
        const carrier = this.slots[ownerG]!;
        if (carrier.side !== s.side) this.tryAiTackle(agent, carrier, dt);
      }
    }

    // --- Auto player switching (Settings → Auto-Switch = AUTO): control
    // follows the ball while defending / loose, before input is applied.
    this.updateAutoSwitch(dt);

    // --- User-controlled player ---------------------------------------------------------
    const user = this.userSlot;
    if (!this.autonomousHome) {
      let mv = input.moveVector();
      if (this.pendingUserShot) {
        this.pendingUserShot.timer -= dt;
        if (this.pendingUserShot.timer <= 0) {
          const { shotType, power } = this.pendingUserShot;
          this.pendingUserShot = null;
          if (this.ownerGlobal() === this.activeTeamIndex) {
            const gx = opponentGoalX('HOME');
            const from = this.ball.state.pos;
            let targetZ = mv.magnitude > 0.15 ? mv.z * 3.3 : (from.z > 0 ? -2.7 : 2.7);
            if (shotType !== 'FINESSE') targetZ = mv.magnitude > 0.15 ? mv.z * 3.3 : from.z * -0.4;
            targetZ = Math.max(-3.4, Math.min(3.4, targetZ));
            const xg = computeXG({ x: from.x, z: from.z }, 1,
              this.slots.filter((s) => s.side === 'AWAY').map((s) => ({ x: s.kin.pos.x, z: s.kin.pos.z }))).xg;
            void gx;
            this.executeShot(user, targetZ, power, shotType, xg);
          }
        }
      }
      // Cycle-2 match-up defending: while TACKLE is held and the opponent
      // has the ball, the user's man stops chasing the stick and CONTAINS —
      // he mirrors the carrier from the goal-side point 0.9 m away, so the
      // carrier's direct route to goal is always blocked. Inside 1.6 m he
      // is "containing": contain time banks toward the shoulder charge
      // that fires when the hold is released. The stick still nudges the
      // contain point sideways (35% blend) so a skilled defender can shade
      // the carrier onto his weak side.
      let containing = false;
      const carrierNow = ownerG >= 0 ? this.slots[ownerG] : undefined;
      if (input.matchUpHeld && carrierNow && carrierNow.side === 'AWAY' && !user.gk && !this.activeSetPiece) {
        const gx = ownGoalX('HOME');
        let dx = gx - carrierNow.kin.pos.x;
        let dz = 0 - carrierNow.kin.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        const shadeX = mv.magnitude > 0.15 ? -mv.z * 0.8 : 0;
        const shadeZ = mv.magnitude > 0.15 ? mv.x * 0.8 : 0;
        const tx = carrierNow.kin.pos.x + dx * 0.9 + shadeX;
        const tz = carrierNow.kin.pos.z + dz * 0.9 + shadeZ;
        const distCarrier = Math.hypot(carrierNow.kin.pos.x - user.kin.pos.x, carrierNow.kin.pos.z - user.kin.pos.z);
        if (distCarrier < 5) {
          const mx = tx - user.kin.pos.x;
          const mz = tz - user.kin.pos.z;
          const md = Math.hypot(mx, mz);
          let magnitude = Math.min(1, md / 1.1);
          // Movement is facing-locked with a capped turn rate (sprint
          // turns at 140°/s): a full-speed demand toward a point behind
          // him makes him arc metres past the carrier before he can
          // contain. When the contain point sits well off his facing,
          // demand jog pace instead — the turn tightens (265°/s, and
          // 560°/s from near-standing) and he settles goal-side fast.
          if (md > 0.12) {
            const desired = Math.atan2(mz, mx);
            let diff = desired - user.kin.facingRad;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > 1.0) magnitude = Math.min(magnitude, 0.6);
          }
          mv = md > 0.12
            ? { x: mx / md, z: mz / md, magnitude }
            : { x: 0, z: 0, magnitude: 0 };
          containing = distCarrier <= 1.6;
        }
      }
      if (containing) this.containSec += dt; else this.containSec = 0;
      if (containing !== this.containingNow) {
        this.containingNow = containing;
        matchEventBus.emit('MATCH_UP', { containing });
      }
      const moveScale = this.pendingUserShot ? 0.25 : 1;
      user.kin.update(dt, {
        dirX: mv.x, dirZ: mv.z,
        magnitude: mv.magnitude * moveScale,
        sprint: input.sprintHeld || mv.magnitude > 0.92,
      }, minutes);
      this.skills.update(dt, user.kin, this.ball);
    } else {
      this.skills.tickCooldowns(dt);
    }

    // Keep everyone on the pitch.
    for (const s of this.slots) {
      s.kin.pos.x = Math.max(-54, Math.min(54, s.kin.pos.x));
      s.kin.pos.z = Math.max(-35.5, Math.min(35.5, s.kin.pos.z));
    }

    // --- Goalkeepers ----------------------------------------------------------------------
    for (const s of this.slots) {
      if (!s.gk || s.sentOff) continue;
      const gk = s.gk;
      const oppCarrier = ownerG >= 0 && this.slots[ownerG]?.side !== s.side ? this.slots[ownerG] : null;
      let oneVsOne = false;
      if (oppCarrier) {
        const distGoal = Math.abs(oppCarrier.kin.pos.x - ownGoalX(s.side));
        const cover = this.slots.some((x) => x.side === s.side && !x.gk
          && Math.abs(x.kin.pos.x - oppCarrier.kin.pos.x) < 5
          && Math.sign(x.kin.pos.x - oppCarrier.kin.pos.x) === Math.sign(ownGoalX(s.side) - oppCarrier.kin.pos.x));
        oneVsOne = distGoal < 24 && !cover;
      }
      // The away keeper reads the game at the match difficulty's level;
      // the home keeper reads at a neutral club level.
      gk.readQuality = s.side === 'AWAY' ? this.profile.gkPositioning : 0.45;
      const frame = gk.update(dt, s.kin.pos, this.ball,
        oppCarrier ? { x: oppCarrier.kin.pos.x, z: oppCarrier.kin.pos.z } : null, oneVsOne);
      s.gkFrame = frame;
      if (gk.state === 'SHOT_PREDICT_DIVE' && s.lastGkState !== 'SHOT_PREDICT_DIVE') {
        this.gkDiveCount[s.side] += 1;
      }
      s.lastGkState = gk.state;

      if (gk.state === 'DISTRIBUTE') {
        if (this.ownerGlobal() === this.slots.indexOf(s)) this.attachBallToOwner();
        if (gk.distributeReady) this.distribute(s);
        s.kin.update(dt, { dirX: 0, dirZ: 0, magnitude: 0, sprint: false }, minutes);
        continue;
      }
      // Steer toward the frame target; a dive is a REAL lateral velocity
      // (Epic P0-8): an impulse at diveSpeed() m/s toward the dive target
      // for 0.35 s — not a ~1.03× speed burst that barely moves the keeper.
      const dx = frame.targetX - s.kin.pos.x;
      const dz = frame.targetZ - s.kin.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        if (frame.dive && gk.isDiving && !s.kin.impulseActive) {
          const t = gk.diveTargetPos;
          const ddx = t.x - s.kin.pos.x;
          const ddz = t.z - s.kin.pos.z;
          const dl = Math.hypot(ddx, ddz) || 1;
          const spd = gk.diveSpeed();
          s.kin.applyImpulse((ddx / dl) * spd, (ddz / dl) * spd, 0.35);
        }
        s.kin.update(dt, {
          dirX: dx / dist, dirZ: dz / dist,
          magnitude: frame.dive ? 1 : Math.min(1, dist / 2),
          sprint: frame.sprint || frame.dive !== null,
        }, minutes);
      } else {
        s.kin.update(dt, { dirX: 0, dirZ: 0, magnitude: 0, sprint: false }, minutes);
        // Face the ball while set.
        const want = Math.atan2(this.ball.state.pos.z - s.kin.pos.z, this.ball.state.pos.x - s.kin.pos.x);
        let diff = want - s.kin.facingRad;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        s.kin.facingRad += diff * Math.min(1, dt * 6);
      }

      // Rush-out smother.
      if (gk.state === 'RUSH_OUT' && oppCarrier) {
        const d = Math.hypot(oppCarrier.kin.pos.x - s.kin.pos.x, oppCarrier.kin.pos.z - s.kin.pos.z);
        if (d < 2.1 && this.ball.state.isGrounded) {
          this.gainPossession(this.slots.indexOf(s), `${s.kin.template.shortName} rushes out and smothers it!`);
          gk.startDistribute();
          continue;
        }
      }
      // Catch / parry when the ball reaches the hands.
      if (this.ball.state.ownerId === null && this.ball.speed() > 1.2) {
        const contact = gk.resolveBallContact(this.ball, s.kin.pos, frame.handsY);
        if (contact) {
          const wasShot = this.ball.state.shotInFlight;
          const xg = this.pendingShotInfo?.xg ?? 0.4;
          if (contact.outcome === 'CATCH') {
            this.gainPossession(this.slots.indexOf(s),
              wasShot ? `Caught! ${s.kin.template.shortName} holds the shot.` : `${s.kin.template.shortName} claims it.`);
            if (wasShot) {
              if (s.side === 'HOME') this.stats.savesHome += 1; else this.stats.savesAway += 1;
              this.emit({ kind: 'GK_SAVE', gkSide: s.side, shooterSide: this.pendingShotInfo?.side ?? (s.side === 'HOME' ? 'AWAY' : 'HOME') });
              matchEventBus.emit('GK_SAVE', { gkId: s.kin.template.id, difficulty: xg, isParry: false });
            }
            gk.startDistribute();
          } else {
            this.ball.kick(contact.parryVel, createVec3(0, 6, 0), s.kin.id, s.side, null);
            if (wasShot) {
              if (s.side === 'HOME') this.stats.savesHome += 1; else this.stats.savesAway += 1;
              this.emit({ kind: 'GK_SAVE', gkSide: s.side, shooterSide: this.pendingShotInfo?.side ?? (s.side === 'HOME' ? 'AWAY' : 'HOME') });
              matchEventBus.emit('GK_SAVE', { gkId: s.kin.template.id, difficulty: xg, isParry: true });
              this.notify(`Parried away! ${s.kin.template.shortName} pushes it wide of the penalty spot.`);
            }
            gk.noteContactOutcome('PARRY', this.ball.state.pos.y);
            gk.endAction();
          }
          this.pendingShotInfo = null;
        }
      }
    }

    // --- Ball --------------------------------------------------------------------------------
    if (this.ball.state.ownerId !== null) {
      this.attachBallToOwner();
    } else {
      const events = this.ball.step(dt, { wet: this.wet });
      if (this.ball.state.pos.y > 1.35) this.ballWasAirborne = true;
      if (this.nets.right) this.nets.right.step(dt, this.ball.state.pos, this.ball.state.vel);
      if (this.nets.left) this.nets.left.step(dt, this.ball.state.pos, this.ball.state.vel);
      if (events.postHit) {
        this.renderState.impactPulse += 1;
        this.notify(`Off the woodwork! Struck at ${events.postSpeed.toFixed(1)} m/s.`);
      }
      if (events.goal) {
        const scoringSide = events.goal.scoringSide;
        if (scoringSide === 'HOME') { this.stats.scoreHome += 1; this.stats.onTargetHome += 1; }
        else { this.stats.scoreAway += 1; this.stats.onTargetAway += 1; }
        this.renderState.goalPulse += 1;
        // Phase 05: under MatchEngine control the celebration/replay/kickoff
        // sequence is orchestrated externally — freeze instead of auto-reset.
        this.goalResetTimer = this.externalMatchControl ? 9999 : 2.6;
        this.pendingKickoffSide = scoringSide === 'HOME' ? 'AWAY' : 'HOME'; // conceding team kicks off
        const info = this.pendingShotInfo;
        // Epic P0-5: remember the scorer + his two nearest teammates so
        // publishRender can stage the celebration instead of a drift-back.
        this.lastScorerGlobal = info ? info.shooterGlobal : -1;
        this.lastScoringSide = scoringSide;
        this.celebrationMates = info
          ? this.slots
            .filter((x) => x.side === scoringSide && !x.gk && !x.sentOff && this.slots.indexOf(x) !== info.shooterGlobal)
            .sort((a, b) => {
              const sc = this.slots[info.shooterGlobal]!;
              return Math.hypot(a.kin.pos.x - sc.kin.pos.x, a.kin.pos.z - sc.kin.pos.z)
                - Math.hypot(b.kin.pos.x - sc.kin.pos.x, b.kin.pos.z - sc.kin.pos.z);
            })
            .slice(0, 2)
            .map((x) => this.slots.indexOf(x))
          : [];
        this.emit({
          kind: 'GOAL', scoringSide,
          scorerGlobal: info ? info.shooterGlobal : -1, xg: info?.xg ?? 0.3,
        });
        const scorer = info ? this.slots[info.shooterGlobal] : null;
        // Epic P0-5: credit the assist — the last teammate who passed to
        // the scorer (never the scorer himself, never the other side).
        const passerSlot = this.lastPasserGlobal >= 0 ? this.slots[this.lastPasserGlobal] : null;
        const assister = passerSlot && scorer && passerSlot.side === scoringSide
          && passerSlot.kin.template.id !== scorer.kin.template.id ? passerSlot : null;
        matchEventBus.emit('GOAL_SCORED', {
          scoringSide,
          scorerId: scorer?.kin.template.id ?? 'unknown',
          assisterId: assister?.kin.template.id ?? null,
          shotType: this.ball.state.shotType ?? 'STANDARD',
          xg: info?.xg ?? 0.3,
          minute: Math.max(1, Math.floor(minutes) + 1),
        });
        matchEventBus.emit('CROWD_EXCITEMENT', { level: 0.95 });
        this.notify(`GOAL — ${scoringSide === 'HOME' ? 'HOME' : 'AWAY'}! ${scorer ? scorer.kin.template.shortName : ''} scores. ${this.stats.scoreHome}–${this.stats.scoreAway}.`);
        this.pendingShotInfo = null;
      }
      if (!events.goal) this.resolveFreeBall();
    }

    if (this.goalResetTimer > 0) {
      this.goalResetTimer -= dt;
      if (this.goalResetTimer <= 0) {
        this.kickoffReset(this.pendingKickoffSide);
        this.notify('Kickoff — play resumes.');
      }
    }

    this.resolveSameTeamOverlap();
    this.publishRender(minutes);
  }

  /**
   * Hard positional separation: teammates may never occupy the same space.
   * Steering targets already separate players; this pass guarantees the
   * invariant even when a presser's route crosses a shape-holder's anchor.
   */
  private resolveSameTeamOverlap(): void {
    const MIN_SEP = 1.05;
    for (const side of SIDES) {
      const mates = this.slots.filter((s) => s.side === side);
      for (let a = 0; a < mates.length; a += 1) {
        for (let b = a + 1; b < mates.length; b += 1) {
          const ka = mates[a]!.kin;
          const kb = mates[b]!.kin;
          let dx = kb.pos.x - ka.pos.x;
          let dz = kb.pos.z - ka.pos.z;
          let d = Math.hypot(dx, dz);
          if (d >= MIN_SEP) continue;
          if (d < 0.01) {
            // Deterministic split direction from the pair's indices.
            const ang = ((a * 7 + b * 13) % 12) * (Math.PI / 6);
            dx = Math.cos(ang); dz = Math.sin(ang); d = 1;
          }
          const push = (MIN_SEP - (d < 0.01 ? 0 : d)) / 2;
          const ux = dx / d; const uz = dz / d;
          ka.pos.x -= ux * push; ka.pos.z -= uz * push;
          kb.pos.x += ux * push; kb.pos.z += uz * push;
        }
      }
    }
  }

  /** Reception, interceptions, blocks and out-of-play recycling for a free ball. */
  private resolveFreeBall(): void {
    if (this.goalResetTimer > 0) return; // goal celebration — ball is dead
    const bp = this.ball.state.pos;
    // Phase 05: under MatchEngine control, out-of-play is reported once and
    // the ball stays dead at the exit point until the set piece is set up.
    if (this.externalMatchControl) {
      if (this.awaitingRestart) return;
      if (Math.abs(bp.z) > PITCH.HALF_WIDTH + 0.4) {
        const awardSide: TeamSide = this.ball.state.lastTouchSide === 'HOME' ? 'AWAY' : 'HOME';
        this.awaitingRestart = true;
        this.ball.state.vel.x = 0; this.ball.state.vel.y = 0; this.ball.state.vel.z = 0;
        this.emit({ kind: 'OUT_OF_PLAY', restart: 'THROW_IN', awardSide, exitX: bp.x, exitZ: bp.z });
        return;
      }
      if (Math.abs(bp.x) > PITCH.HALF_LENGTH + 0.6) {
        const goalSide: TeamSide = bp.x > 0 ? 'AWAY' : 'HOME';
        const attackingSide: TeamSide = goalSide === 'HOME' ? 'AWAY' : 'HOME';
        this.awaitingRestart = true;
        this.ball.state.vel.x = 0; this.ball.state.vel.y = 0; this.ball.state.vel.z = 0;
        if (this.ball.state.lastTouchSide === attackingSide) {
          this.emit({ kind: 'OUT_OF_PLAY', restart: 'GOAL_KICK', awardSide: goalSide, exitX: bp.x, exitZ: bp.z });
        } else {
          this.emit({ kind: 'OUT_OF_PLAY', restart: 'CORNER', awardSide: attackingSide, exitX: bp.x, exitZ: bp.z });
        }
        return;
      }
    }
    // Out of play: sidelines → throw-in to the other side; goal line → GK ball or corner.
    if (Math.abs(bp.z) > PITCH.HALF_WIDTH + 0.4 && this.goalResetTimer <= 0) {
      const side: TeamSide = this.ball.state.lastTouchSide === 'HOME' ? 'AWAY' : 'HOME';
      const nearest = this.slots.filter((s) => s.side === side && !s.gk)
        .sort((a, b) => Math.hypot(a.kin.pos.x - bp.x, a.kin.pos.z - bp.z) - Math.hypot(b.kin.pos.x - bp.x, b.kin.pos.z - bp.z))[0];
      this.ball.reset(Math.max(-50, Math.min(50, bp.x)), Math.sign(bp.z) * (PITCH.HALF_WIDTH - 1));
      if (nearest) {
        this.gainPossession(this.slots.indexOf(nearest), `Throw-in to ${side}. Play restarts quickly.`);
      }
      return;
    }
    if (Math.abs(bp.x) > PITCH.HALF_LENGTH + 0.6 && this.goalResetTimer <= 0) {
      const goalSide: TeamSide = bp.x > 0 ? 'AWAY' : 'HOME'; // whose goal line was crossed
      const attackingSide: TeamSide = goalSide === 'HOME' ? 'AWAY' : 'HOME';
      if (this.ball.state.lastTouchSide === attackingSide) {
        const gk = this.slots.find((s) => s.side === goalSide && s.gk);
        if (gk) {
          this.ball.reset(ownGoalX(goalSide) + attackDirX(goalSide) * 6, 0);
          this.gainPossession(this.slots.indexOf(gk), `Goal kick — ${gk.kin.template.shortName} restarts play.`);
          gk.gk?.startDistribute(1.2);
        }
      } else {
        const cornerZ = Math.sign(bp.z || 1) * (PITCH.HALF_WIDTH - 2);
        const taker = this.slots.filter((s) => s.side === attackingSide && !s.gk)
          .sort((a, b) => Math.hypot(a.kin.pos.x - bp.x, a.kin.pos.z - cornerZ) - Math.hypot(b.kin.pos.x - bp.x, b.kin.pos.z - cornerZ))[0];
        this.ball.reset(Math.sign(bp.x) * (PITCH.HALF_LENGTH - 2), cornerZ);
        if (taker) this.gainPossession(this.slots.indexOf(taker), `Corner to ${attackingSide}!`);
      }
      return;
    }

    if (this.passGraceTimer > 0) return;
    const speed = this.ball.speed();

    // Defensive block on a shot.
    if (this.ball.state.shotInFlight && speed > 12 && bp.y < 1.3 && this.pendingShotInfo) {
      const shooterSide = this.pendingShotInfo.side;
      for (const s of this.slots) {
        if (s.side === shooterSide || s.gk) continue;
        const d = Math.hypot(bp.x - s.kin.pos.x, bp.z - s.kin.pos.z);
        if (d < 0.62) {
          this.ball.state.vel.x *= -0.22;
          this.ball.state.vel.z = (this.rng() - 0.5) * 7;
          this.ball.state.vel.y = 1.5;
          this.ball.state.shotInFlight = false;
          this.pendingShotInfo = null;
          this.notify(`Blocked! ${s.kin.template.shortName} throws his body in the way.`);
          return;
        }
      }
    }

    // AI lane anticipation (Epic P0-8, now SYMMETRIC): a defender who has
    // read the pass steps into its path — for BOTH sides, so the user's own
    // AI teammates intercept opponent passes too (previously gated to
    // AWAY defenders reading HOME passes only). The gate is positional —
    // the defender must actually be standing in the lane, closer to the
    // ball than the receiver — and the defending side's tier anticipation
    // scales both the reach and the read.
    if (this.passTargetGlobal >= 0 && !this.ball.state.shotInFlight && speed > 5 && speed < 24 && bp.y < 1.6) {
      const target = this.slots[this.passTargetGlobal];
      const passer = this.lastPasserGlobal >= 0 ? this.slots[this.lastPasserGlobal] : null;
      if (target && passer && target.side === passer.side) {
        const defSide = passer.side === 'HOME' ? 'AWAY' : 'HOME';
        const defProfile = defSide === 'AWAY' ? this.profile : this.homeProfile;
        const reach = 0.55 + defProfile.anticipation * 1.0;
        let best: Slot | null = null;
        let bestD = reach;
        for (const s of this.slots) {
          if (s.side !== defSide || s.gk || s.sentOff) continue;
          const d = Math.hypot(bp.x - s.kin.pos.x, bp.z - s.kin.pos.z);
          if (d < bestD) { bestD = d; best = s; }
        }
        const receiverD = Math.hypot(bp.x - target.kin.pos.x, bp.z - target.kin.pos.z);
        if (best && bestD < receiverD && this.rng() < 0.35 + defProfile.anticipation * 0.65) {
          this.passTargetGlobal = -1;
          this.gainPossession(this.slots.indexOf(best), `Intercepted! ${best.kin.template.shortName} reads the pass and steps in.`);
          return;
        }
      }
    }

    // Intended receiver traps the pass.
    if (this.passTargetGlobal >= 0) {
      const target = this.slots[this.passTargetGlobal];
      if (target) {
        const d = Math.hypot(bp.x - target.kin.pos.x, bp.z - target.kin.pos.z);
        if (d < 1.6 && speed < 17 && bp.y < 1.7) {
          this.gainPossession(this.passTargetGlobal);
          return;
        }
        if (speed < 0.5) this.passTargetGlobal = -1;
      }
    }

    // Loose-ball pickup (never on a fast shot — that's the GK's job).
    if ((!this.ball.state.shotInFlight || speed < 5) && speed < 13 && bp.y < 1.0) {
      let best = -1;
      let bestD = 1.05;
      this.slots.forEach((s, i) => {
        if (s.gk || s.sentOff) return;
        const d = Math.hypot(bp.x - s.kin.pos.x, bp.z - s.kin.pos.z);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0 && best !== this.lastPasserGlobal) {
        this.gainPossession(best);
      }
    }
  }

  private publishRender(minutes: number): void {
    const rs = this.renderState;
    rs.ballPos.x = this.ball.state.pos.x; rs.ballPos.y = this.ball.state.pos.y; rs.ballPos.z = this.ball.state.pos.z;
    rs.ballVel.x = this.ball.state.vel.x; rs.ballVel.y = this.ball.state.vel.y; rs.ballVel.z = this.ball.state.vel.z;
    rs.ballAngVel.x = this.ball.state.angularVel.x; rs.ballAngVel.y = this.ball.state.angularVel.y; rs.ballAngVel.z = this.ball.state.angularVel.z;
    rs.shotInFlight = this.ball.state.shotInFlight;
    rs.shotType = this.ball.state.shotType;
    rs.activeGlobal = this.autonomousHome ? this.ownerGlobal() : this.activeTeamIndex;
    // Cycle-2 switch flash: pulse decays 1 → 0 over 0.9 s from the switch.
    rs.switchPulse = this.lastSwitchAt < -5 ? 0 : Math.max(0, 1 - (this.elapsed - this.lastSwitchAt) / 0.9);
    rs.containing = this.containingNow;
    rs.secondPresserGlobal = this.possessingSide() === 'AWAY' || this.ball.state.lastTouchSide === 'AWAY'
      ? this.defRoles.HOME.secondGlobal : -1;
    rs.passTargetGlobal = this.passTargetGlobal;
    this.slots.forEach((s, i) => {
      const p = rs.players[i]!;
      p.x = s.kin.pos.x; p.z = s.kin.pos.z;
      p.stamina = s.kin.stamina01;
      p.yaw = Math.PI / 2 - s.kin.facingRad;
      p.speed = s.kin.speed;
      if (s.gk) {
        const f = s.gkFrame;
        p.diveDir = f?.diveDirZ ?? 1;
        p.anim = f?.dive === 'DIVE_HIGH' ? 'GK_DIVE_HIGH'
          : f?.dive === 'DIVE_LOW' || f?.dive === 'DIVE_MID' ? 'GK_DIVE_LOW'
          : s.kin.speed > 5 ? 'SPRINT' : s.kin.speed > 0.4 ? 'JOG' : 'IDLE';
      } else {
        p.diveDir = 1;
        const celebrating = this.goalResetTimer > 0 && this.lastScorerGlobal >= 0;
        // Slide ANIM hold: the pose runs 0.7 s even though the physics
        // slide ends at 0.55 s (spec §2.3) — physics untouched.
        if (s.kin.slideTimer > 0) this.slideAnimTimers[i] = 0.7;
        else if ((this.slideAnimTimers[i] ?? 0) > 0) this.slideAnimTimers[i] = (this.slideAnimTimers[i] ?? 0) - 1 / 60;
        // The active skill move (user only) picks the SKILL pose flavour.
        const moveId = this.skills.isActive && i === this.activeTeamIndex ? this.skills.activeMove?.id : undefined;
        p.skill = moveId === 'ROULETTE' ? 'ROULETTE'
          : moveId === 'KNOCK_ON' || moveId === 'RAINBOW_FLICK' || moveId === 'HEEL_TO_HEEL' ? 'FLICK'
          : moveId === 'BALL_ROLL' || moveId === 'LANE_CHANGE' ? 'STEPOVER'
          : null;
        p.anim = this.wallJumpTimer > 0 && this.wallGlobalsCache.includes(i) ? 'HEADER_JUMP'
          : (this.slideAnimTimers[i] ?? 0) > 0 ? 'SLIDE_TACKLE'
          : celebrating && i === this.lastScorerGlobal ? signatureCelebration(s.kin.template.id)
          : celebrating && this.celebrationMates.includes(i) ? 'CELEBRATE_EMBRACE'
          : celebrating && s.side !== this.lastScoringSide ? 'IDLE' // conceding side: heads down
          : this.pendingUserShot && i === this.activeTeamIndex ? 'SHOOT'
          : i === this.lastShotAnimGlobal && this.lastShotAnimTimer > 0 ? 'SHOOT'
          : i === this.lastPassAnimGlobal && this.lastPassAnimTimer > 0 ? 'PASS_KICK'
          : moveId ? 'SKILL'
          : s.kin.speed > 5.0 ? 'SPRINT'
          : s.kin.speed > 1.8 ? 'JOG'
          : s.kin.speed > 0.4 ? 'WALK'
          : 'IDLE';
      }
    });

    // Throttled stats publish (~4Hz) with shape/separation verification metrics.
    this.statsTimer -= 1 / 60;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.25;
      const st = this.stats;
      const totalPoss = this.possessionTime.HOME + this.possessionTime.AWAY;
      st.possessionHomePct = totalPoss > 0 ? Math.round((this.possessionTime.HOME / totalPoss) * 100) : 50;
      st.userHasBall = this.ownerGlobal() === this.activeTeamIndex;
      st.homeGkState = this.slots.find((s) => s.side === 'HOME' && s.gk)?.gk?.state ?? '—';
      st.awayGkState = this.slots.find((s) => s.side === 'AWAY' && s.gk)?.gk?.state ?? '—';
      st.secondPressActive = this.elapsed < this.secondPressUntil;
      st.primaryPressers = this.possessingSide() ? 1 : 0;
      const counts: Partial<Record<OutfieldState, number>> = {};
      for (const s of this.slots) {
        if (s.outfield) counts[s.outfield.state] = (counts[s.outfield.state] ?? 0) + 1;
      }
      st.stateCounts = counts;
      // Min same-team separation + average shape error.
      let minSep = 99;
      let errSum = 0;
      let errN = 0;
      for (const side of SIDES) {
        const mates = this.slots.filter((s) => s.side === side);
        for (let a = 0; a < mates.length; a += 1) {
          for (let b = a + 1; b < mates.length; b += 1) {
            const d = Math.hypot(mates[a]!.kin.pos.x - mates[b]!.kin.pos.x, mates[a]!.kin.pos.z - mates[b]!.kin.pos.z);
            if (d < minSep) minSep = d;
          }
        }
        const shape = this.shapes[side];
        if (shape) {
          for (const s of mates) {
            if (s.gk || s.sentOff) continue;
            const anchor = shape.anchors[s.teamIndex];
            if (anchor) { errSum += Math.hypot(anchor.x - s.kin.pos.x, anchor.z - s.kin.pos.z); errN += 1; }
          }
        }
      }
      st.minSameTeamSeparation = minSep;
      st.avgShapeError = errN > 0 ? errSum / errN : 0;
      st.minute = Math.floor(minutes);
      st.version += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic AI lab — used by the App verification panel. Simulates real
// 11v11 play headlessly (AI vs AI) plus a scripted close-range shot that the
// HOME goalkeeper must read, dive for, save — or be beaten by.
// ---------------------------------------------------------------------------

export interface AiLabResult {
  ticks: number;
  passes: number;
  shots: number;
  minSameTeamSeparation: number;
  avgShapeError: number;
  maxDefendersNearBall: number;
  allFinite: boolean;
  gkScenario: { shots: number; gkDove: boolean; saves: number; goals: number };
}

export function runAiLab(): AiLabResult {
  const nets: NetRegistry = { left: null, right: null };
  const idle = new InputManager();

  const engine = new ScrimmageEngine(nets, { autonomousHome: true, seed: 777, difficulty: 'SEMI_PRO' });
  let minSep = 99;
  let shapeErr = 0;
  let maxDefNear = 0;
  let allFinite = true;
  const TICKS = 3600; // 60 simulated seconds of AI vs AI
  for (let t = 0; t < TICKS; t += 1) {
    engine.step(1 / 60, idle);
    if (t > 180 && t % 30 === 0) {
      minSep = Math.min(minSep, engine.stats.minSameTeamSeparation);
      shapeErr = engine.stats.avgShapeError;
      maxDefNear = Math.max(maxDefNear, engine.defendersNearBall(3));
    }
    if (t % 60 === 0) {
      const rs = engine.renderState;
      if (!Number.isFinite(rs.ballPos.x) || !Number.isFinite(rs.ballPos.z)) allFinite = false;
      for (const p of rs.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) allFinite = false;
      }
    }
  }

  // GK scenario: away striker (global 20) with the ball 10m from the HOME
  // goal, with a covering CB goal-side so the GK holds his bisect line
  // instead of rushing. The utility scorer must pick the shot and the GK
  // must dive, save it, or be beaten. Up to 3 seeded attempts.
  let gkScenario = { shots: 0, gkDove: false, saves: 0, goals: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const gkEngine = new ScrimmageEngine(nets, { autonomousHome: true, seed: 99 + attempt * 7, difficulty: 'SEMI_PRO' });
    gkEngine.forceMovePlayer(2, -45.5, 0.5); // HOME left CB covers goal-side
    gkEngine.forceScenePlayer(20, -42.5, 2.5); // away ST, 10m out
    for (let t = 0; t < 600; t += 1) {
      gkEngine.step(1 / 60, idle);
      if (gkEngine.stats.shotsAway > 0
        && (gkEngine.gkDiveCount.HOME > 0 || gkEngine.stats.savesHome > 0 || gkEngine.stats.scoreAway > 0)) break;
    }
    gkScenario = {
      shots: gkScenario.shots + gkEngine.stats.shotsAway,
      gkDove: gkScenario.gkDove || gkEngine.gkDiveCount.HOME > 0,
      saves: gkScenario.saves + gkEngine.stats.savesHome,
      goals: gkScenario.goals + gkEngine.stats.scoreAway,
    };
    if (gkScenario.gkDove || gkScenario.saves > 0 || gkScenario.goals > 0) break;
  }

  return {
    ticks: TICKS,
    passes: engine.stats.passesHome + engine.stats.passesAway,
    shots: engine.stats.shotsHome + engine.stats.shotsAway,
    minSameTeamSeparation: minSep,
    avgShapeError: shapeErr,
    maxDefendersNearBall: maxDefNear,
    allFinite,
    gkScenario,
  };
}

// ---------------------------------------------------------------------------
// Phase 06 substitution lab — a fatigued HOME striker is swapped for a fresh
// bench player through the real substitute() path: template, stamina and the
// renderer's template-id watch must all change together, capped at 5 subs.
// ---------------------------------------------------------------------------

export interface SubstitutionLabResult {
  ok: boolean;
  benchSize: number;
  outName: string;
  inName: string;
  staminaBefore: number;
  staminaAfter: number;
  capRespected: boolean;
}

export function runSubstitutionLab(): SubstitutionLabResult {
  const nets: NetRegistry = { left: null, right: null };
  const engine = new ScrimmageEngine(nets, { autonomousHome: true, seed: 606 });
  const stIndex = engine.hudPlayers().find((p) => p.side === 'HOME' && p.role === 'ST')?.teamIndex ?? 9;
  const before = engine.hudPlayers()[stIndex]!;
  // Simulate a tired striker: drain his legs directly on the kinematics.
  const slot = engine.hudPlayers()[stIndex]!;
  void slot;
  const kin = (engine as unknown as { slots: { kin: { stamina01: number } }[] }).slots[stIndex]!.kin;
  kin.stamina01 = 0.38;
  const benchSt = engine.benchInfo().find((b) => b.position === 'ST') ?? engine.benchInfo()[0]!;
  const okSwap = engine.substitute(stIndex, benchSt.index);
  const after = engine.hudPlayers()[stIndex]!;
  // Cap: burn the remaining subs, then one more must be refused.
  let guard = 0;
  while (engine.subsUsed < engine.maxSubs && guard < 12) {
    const tired = engine.hudPlayers().find((p) => p.side === 'HOME' && !p.isGk && !p.sentOff && p.teamIndex !== stIndex);
    const fresh = engine.benchInfo()[0];
    if (!tired || !fresh) break;
    engine.substitute(tired.teamIndex, fresh.index);
    guard += 1;
  }
  const extra = engine.hudPlayers().find((p) => p.side === 'HOME' && !p.isGk && !p.sentOff);
  const capRespected = extra ? !engine.substitute(extra.teamIndex, 0) : false;
  return {
    ok: okSwap
      && after.templateId === benchSt.templateId
      && after.templateId !== before.templateId
      && engine.renderState.playerTemplateIds[stIndex] === benchSt.templateId
      && after.stamina01 > 0.9,
    benchSize: engine.benchInfo().length,
    outName: before.name,
    inName: after.name,
    staminaBefore: 0.38,
    staminaAfter: after.stamina01,
    capRespected,
  };
}

// ---------------------------------------------------------------------------
// Auto-switch lab — continuous ball-tracking control (Settings → Auto-Switch
// = AUTO): defending hands control to the HOME outfielder nearest the ball,
// a completed pass lands control on the receiver, and MANUAL never moves.
// ---------------------------------------------------------------------------

export interface AutoSwitchLabResult {
  defenceOk: boolean;
  passOk: boolean;
  manualOk: boolean;
  userPassOk: boolean;
  detail: string;
}

export function runAutoSwitchLab(): AutoSwitchLabResult {
  const nets: NetRegistry = { left: null, right: null };
  const idle = new InputManager();
  const ballDist = (e: ScrimmageEngine, teamIndex: number): number => {
    const p = e.hudPlayers().find((h) => h.side === 'HOME' && h.teamIndex === teamIndex);
    if (!p) return Infinity;
    return Math.hypot(p.x - e.ball.state.pos.x, p.z - e.ball.state.pos.z);
  };
  const nearestHomeDist = (e: ScrimmageEngine): number => {
    let best = Infinity;
    for (const h of e.hudPlayers()) {
      if (h.side !== 'HOME' || h.role === 'GK' || h.sentOff) continue;
      best = Math.min(best, Math.hypot(h.x - e.ball.state.pos.x, h.z - e.ball.state.pos.z));
    }
    return best;
  };

  // Defence: AWAY striker carries the ball deep in HOME's half while the
  // user's man is stranded upfield — control must jump to a defender as
  // close to the ball as the best-placed teammate (the AI holds a zonal
  // shape and does not swarm, so "nearest" is the defensive line itself;
  // the goal-side bonus + switch hysteresis allow a few metres), and far
  // closer than the stranded striker.
  const eng = new ScrimmageEngine(nets, { seed: 707 });
  eng.autoSwitchMode = 'AUTO';
  eng.forceScenePlayer(20, -38, 3); // AWAY ST (global 20) with the ball
  const startActive = eng.activeTeamIndex;
  for (let t = 0; t < 90; t += 1) eng.step(1 / 60, idle);
  const activeDist = ballDist(eng, eng.activeTeamIndex);
  const defenceOk = eng.activeTeamIndex !== startActive
    && activeDist <= nearestHomeDist(eng) + 5
    && activeDist < ballDist(eng, startActive) - 10;

  // Attack: the HOME striker passes — control must follow the ball to the
  // receiver (he ends up as the carrier under the user's thumb). Support
  // is staged close, like a real attack: RW and CAM within ~11m.
  const eng2 = new ScrimmageEngine(nets, { seed: 708 });
  eng2.autoSwitchMode = 'AUTO';
  eng2.forceScenePlayer(9, 18, 0); // HOME ST with the ball, attacking +x
  eng2.forceMovePlayer(10, 27, -7); // RW in support
  eng2.forceMovePlayer(6, 25, 6); // CAM in support
  eng2.queueAction({ kind: 'PASS', passType: 'GROUND', power: 0.6 });
  let passOk = false;
  for (let t = 0; t < 150 && !passOk; t += 1) {
    eng2.step(1 / 60, idle);
    if (eng2.stats.passesHome > 0 && eng2.currentPossessionSide() === 'HOME'
      && ballDist(eng2, eng2.activeTeamIndex) < 2.2 && eng2.activeTeamIndex !== 9) {
      passOk = true;
    }
  }

  // MANUAL: same defensive scene — control must never move on its own.
  const eng3 = new ScrimmageEngine(nets, { seed: 709 });
  eng3.autoSwitchMode = 'MANUAL';
  eng3.forceScenePlayer(20, -38, 3);
  const manualStart = eng3.activeTeamIndex;
  for (let t = 0; t < 30; t += 1) eng3.step(1 / 60, idle);
  const manualOk = eng3.activeTeamIndex === manualStart;

  // The reported bug: even in MANUAL, the USER's own pass must hand
  // control to its receiver at the moment he takes the ball.
  const eng4 = new ScrimmageEngine(nets, { seed: 710 });
  eng4.autoSwitchMode = 'MANUAL';
  eng4.forceScenePlayer(9, 18, 0); // HOME ST with the ball
  eng4.forceMovePlayer(10, 27, -7); // RW in support
  eng4.forceMovePlayer(6, 25, 6); // CAM in support
  eng4.queueAction({ kind: 'PASS', passType: 'GROUND', power: 0.6 });
  let userPassOk = false;
  for (let t = 0; t < 150 && !userPassOk; t += 1) {
    eng4.step(1 / 60, idle);
    if (eng4.stats.passesHome > 0 && eng4.currentPossessionSide() === 'HOME'
      && ballDist(eng4, eng4.activeTeamIndex) < 2.2 && eng4.activeTeamIndex !== 9) {
      userPassOk = true;
    }
  }

  return {
    defenceOk, passOk, manualOk, userPassOk,
    detail: `defence: control ${startActive} → ${eng.activeTeamIndex} (${activeDist.toFixed(1)}m from the ball) · pass: receiver takes control · MANUAL: no drift, but your own pass still hands over to its receiver`,
  };
}

// ---------------------------------------------------------------------------
// Cycle-2 labs — switch flash + match-up defending.
//  · PLAYER_SWITCHED fires (reason PASS) when a pass hands control over,
//    and the render snapshot carries a live switch pulse.
//  · Holding match-up with the carrier near puts the user's man into a
//    real contain (goal-side, ~0.9 m) and banks contain time.
//  · Releasing into SHOULDER_CHARGE wins the ball (repeated attempts —
//    a strength contest, not a coin flip on one roll).
//  · An AI presser accumulates contain time before charging.
// ---------------------------------------------------------------------------

export interface MatchUpLabResult {
  switchFlashOk: boolean;
  containOk: boolean;
  chargeOk: boolean;
  aiContainOk: boolean;
  detail: string;
}

export function runMatchUpLab(): MatchUpLabResult {
  const nets: NetRegistry = { left: null, right: null };
  const idle = new InputManager();

  // 1) Switch flash on a pass-receiver handover.
  const reasons: string[] = [];
  const off = matchEventBus.on('PLAYER_SWITCHED', (p) => { reasons.push(p.reason); });
  const eng = new ScrimmageEngine(nets, { seed: 811 });
  eng.autoSwitchMode = 'AUTO';
  eng.forceScenePlayer(9, 18, 0);
  eng.forceMovePlayer(10, 27, -7);
  eng.forceMovePlayer(6, 25, 6);
  eng.queueAction({ kind: 'PASS', passType: 'GROUND', power: 0.6 });
  let pulseSeen = 0;
  for (let t = 0; t < 150; t += 1) {
    eng.step(1 / 60, idle);
    pulseSeen = Math.max(pulseSeen, eng.renderState.switchPulse);
  }
  off();
  const switchFlashOk = reasons.includes('PASS') && pulseSeen > 0.5;

  // 2) User contain: AWAY striker has the ball; the user's man starts
  // 1.4 m away with match-up held — he must settle into the contain and
  // hold a sustained streak at the 0.9 m goal-side point while the
  // carrier shields and probes (the carrier no longer panic-passes at
  // the first decision tick — see OutfieldAI shielding).
  const eng2 = new ScrimmageEngine(nets, { seed: 812 });
  eng2.autoSwitchMode = 'MANUAL';
  eng2.forceScenePlayer(20, -20, 2); // AWAY ST with the ball
  eng2.forceMovePlayer(9, -18.6, 2); // user's man, 1.4 m away
  // A defender engaging a carrier faces him (staging, the same courtesy
  // forceScenePlayer extends to the carrier).
  const eng2Slots = (eng2 as unknown as { slots: { kin: { facingRad: number; pos: { x: number; z: number } } }[] }).slots;
  eng2Slots[9]!.kin.facingRad = Math.PI; // face -x, toward the carrier
  const hold = new InputManager();
  hold.matchUpHeld = true;
  let containedTicks = 0;
  let streak = 0;
  let maxStreak = 0;
  for (let t = 0; t < 150; t += 1) {
    eng2.step(1 / 60, hold);
    if (eng2.userContaining) {
      containedTicks += 1;
      streak += 1;
      if (streak > maxStreak) maxStreak = streak;
    } else streak = 0;
  }
  const containOk = maxStreak >= 20;

  // 3) Shoulder charge from a banked contain wins the ball within a few
  // tries. Each attempt re-stages the carrier 1.2 m in front of the
  // user's man (a live carrier may have played the ball on), banks the
  // contain for 40 ticks, then releases the charge.
  let chargeOk = false;
  for (let attempt = 0; attempt < 6 && !chargeOk; attempt += 1) {
    const userPos = eng2Slots[9]!.kin.pos;
    eng2.forceScenePlayer(20, userPos.x - 1.2, userPos.z);
    eng2Slots[9]!.kin.facingRad = Math.PI;
    for (let t = 0; t < 40; t += 1) eng2.step(1 / 60, hold);
    eng2.queueAction({ kind: 'SHOULDER_CHARGE' });
    for (let t = 0; t < 70; t += 1) {
      eng2.step(1 / 60, hold);
      if (eng2.currentPossessionSide() === 'HOME') { chargeOk = true; break; }
    }
  }

  // 4) AI contain: a HOME midfielder staged GOAL-SIDE of the AWAY carrier
  // (where a containing defender stands) must bank real contain time
  // before any charge (peak contain > 0.2 s).
  const eng3 = new ScrimmageEngine(nets, { seed: 813 });
  eng3.autoSwitchMode = 'MANUAL';
  eng3.forceScenePlayer(20, -10, -4); // AWAY ST with the ball
  eng3.forceMovePlayer(6, -11.2, -4); // HOME CAM 1.2 m goal-side — becomes presser
  const eng3Slots = (eng3 as unknown as { slots: { kin: { facingRad: number } }[] }).slots;
  eng3Slots[6]!.kin.facingRad = 0; // face +x, toward the carrier
  eng3.forceMovePlayer(9, 45, 30); // user's man far away, out of the play
  for (let t = 0; t < 150; t += 1) eng3.step(1 / 60, idle);
  const aiContainOk = eng3.peakAiContainSec > 0.2;

  return {
    switchFlashOk, containOk, chargeOk, aiContainOk,
    detail: `switch flash: PLAYER_SWITCHED(${reasons.join(',') || 'none'}) + pulse ${pulseSeen.toFixed(2)} · user contain best streak ${maxStreak} ticks (${containedTicks} total) · shoulder charge ${chargeOk ? 'won the ball' : 'never won it'} · AI presser peak contain ${eng3.peakAiContainSec.toFixed(2)}s`,
  };
}
