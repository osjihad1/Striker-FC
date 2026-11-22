// Striker FC — core/types.ts
// Every interface from Blueprint 03 (Data Models & Schemas). Strict types, no `any`.

export type Position =
  | 'GK'
  | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'CF' | 'ST';

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export type Rarity = 'BRONZE' | 'SILVER' | 'GOLD' | 'ELITE' | 'MASTER' | 'LEGEND';

export type PlayStyleId =
  | 'FINESSE_SHOT_PLUS'
  | 'POWER_SHOT_PLUS'
  | 'INCISIVE_PASS_PLUS'
  | 'RAPID_PLUS'
  | 'TECHNICAL_DRIBBLER'
  | 'DEAD_BALL_SPECIALIST'
  | 'INTERCEPT_PLUS'
  | 'BRICK_WALL_GK';

export type BeardStyle = 'NONE' | 'STUBBLE' | 'SHORT' | 'FULL' | 'GOATEE' | 'MOUSTACHE';
export type HairStyle =
  | 'SHORT' | 'FADE' | 'CURLY' | 'AFRO' | 'LONG' | 'MOHAWK' | 'BALD'
  | 'BUZZ' | 'SIDEPART' | 'TOPKNOT' | 'DREADLOCKS' | 'BRAIDS' | 'FRINGE' | 'CURLY_TOP' | 'BALD_FADE';

export interface FaceAppearance {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  heightCm: number;
  build: 'LEAN' | 'ATHLETIC' | 'STOCKY';
  bootColor: string;
  // Epic P0-4: per-player face morphs. All optional — generated players and
  // legacy saves omit them and the rig falls back to neutral proportions.
  /** 0.85 (narrow) .. 1.15 (wide) skull width multiplier. */
  faceWidth?: number;
  /** 0.85 .. 1.15 jaw width multiplier. */
  jawWidth?: number;
  /** 0.9 .. 1.12 face length multiplier. */
  jawLength?: number;
  /** 0.9 .. 1.1 forehead height multiplier. */
  foreheadHeight?: number;
  /** 0.9 .. 1.12 cheekbone prominence multiplier. */
  cheekbone?: number;
  /** 0.85 .. 1.2 nose length multiplier. */
  noseLength?: number;
  /** 0.85 .. 1.2 nose width multiplier. */
  noseWidth?: number;
  /** 0.92 .. 1.08 eye spacing multiplier. */
  eyeSpacing?: number;
  /** 0.9 .. 1.12 eye size multiplier. */
  eyeSize?: number;
  browStyle?: 'STRAIGHT' | 'ARCHED' | 'THICK';
  mouthStyle?: 'NEUTRAL' | 'WIDE' | 'SMALL';
  beardStyle?: BeardStyle;
  beardColor?: string;
  /** 0.9 .. 1.15 shoulder width multiplier. */
  shoulderWidth?: number;
  /** 0.94 .. 1.06 leg length multiplier. */
  legLength?: number;
  /** 0.9 .. 1.15 muscle bulk multiplier on limbs/torso. */
  muscle?: number;
  /** Headband accessory (Neymar). */
  headband?: boolean;
  /** Sleeve tattoo on the right arm. */
  sleeveTattoo?: boolean;
}

export interface CoreStats {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface SubStats {
  acceleration: number;
  sprintSpeed: number;
  positioning: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  curve: number;
  vision: number;
  crossing: number;
  shortPassing: number;
  longPassing: number;
  agility: number;
  balance: number;
  ballControl: number;
  dribbling: number;
  interceptions: number;
  headingAccuracy: number;
  standingTackle: number;
  slidingTackle: number;
  jumping: number;
  stamina: number;
  strength: number;
  gkDiving: number;
  gkHandling: number;
  gkKicking: number;
  gkReflexes: number;
  gkPositioning: number;
}

export interface PlayerTemplate {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  clubId: string;
  position: Position;
  altPositions: Position[];
  baseOvr: number;
  rarity: Rarity;
  preferredFoot: 'RIGHT' | 'LEFT';
  weakFoot: 1 | 2 | 3 | 4 | 5;
  skillMoves: 1 | 2 | 3 | 4 | 5;
  workRateAttack: 'LOW' | 'MED' | 'HIGH';
  workRateDefense: 'LOW' | 'MED' | 'HIGH';
  playStyles: PlayStyleId[];
  stats: CoreStats;
  subStats: SubStats;
  appearance: FaceAppearance;
  baseMarketPrice: number;
  /** Real-world star roster (added at the owner's request, personal use):
   *  real-world LEGENDs are gated to the Legend Icon Pack / events. */
  realWorld?: boolean;
  /** National-team shirt number for real-world players. */
  shirtNumber?: number;
}

export interface OwnedPlayerCard {
  instanceId: string;
  templateId: string;
  trainingLevel: number;
  trainingXp: number;
  rank: 0 | 1 | 2 | 3 | 4 | 5;
  skillPoints: {
    dexterity: number;
    shooting: number;
    passing: number;
    defending: number;
    physical: number;
    gkDivingFocus: number;
  };
  locked: boolean;
  /** Epic P1-3: pulled from a GEM pack — untradeable; quick-sell returns
   *  Training XP instead of Coins. Absent on older saves (= coin card). */
  fromGemPack?: boolean;
}

export type TeamSide = 'HOME' | 'AWAY';
export type Mentality = 'ULTRA_DEFENDING' | 'DEFENDING' | 'BALANCED' | 'ATTACKING' | 'ULTRA_ATTACKING';
export type Difficulty = 'BEGINNER' | 'AMATEUR' | 'SEMI_PRO' | 'PROFESSIONAL' | 'WORLD_CLASS' | 'LEGENDARY' | 'ULTIMATE';
export type WeatherType = 'DAY_CLEAR' | 'SUNSET' | 'NIGHT_FLOODLIGHTS' | 'NIGHT_RAIN';
export type GameMode = 'HEAD_TO_HEAD' | 'VS_ATTACK' | 'MANAGER_MODE' | 'TOURNAMENT' | 'SKILL_GAME';

export type ShotType = 'STANDARD' | 'FINESSE' | 'CHIP' | 'POWER' | 'VOLLEY' | 'HEADER' | 'FAKE_SHOT';
export type PassType = 'GROUND' | 'LOB' | 'DRIVEN' | 'PASS_AND_GO' | 'THROUGH' | 'LOB_THROUGH' | 'CROSS';
export type SkillMoveId = 'BALL_ROLL' | 'ROULETTE' | 'LANE_CHANGE' | 'HEEL_TO_HEEL' | 'RAINBOW_FLICK' | 'KNOCK_ON';

export interface ManagerTactics {
  buildUpSpeed: 1 | 2 | 3;
  passingDistance: 1 | 2 | 3;
  shootingTendency: 1 | 2 | 3;
  crossingTendency: 1 | 2 | 3;
  pressure: 1 | 2 | 3;
  width: 1 | 2 | 3;
  aggression: 1 | 2 | 3;
}

export interface SaveProfile {
  version: number;
  managerName: string;
  clubName: string;
  clubAbbr: string;
  clubPrimaryColor: string;
  clubSecondaryColor: string;
  coins: number;
  gems: number;
  rankUpTokens: number;
  trainingXpPool: number;
  inventory: OwnedPlayerCard[];
  activeFormationId: string;
  startingXI: (string | null)[];
  substitutes: (string | null)[];
  h2hDivision: number;
  h2hStars: number;
  vsaFans: number;
  managerTrophies: number;
  questProgress: Record<string, { current: number; claimed: boolean }>;
  seasonPassXp: number;
  seasonPassClaimedTiers: number[];
  lastDailyResetIso: string;
  /** Phase 08: active Champions Knockout Cup bracket (null = no cup running). */
  tournament?: TournamentState | null;
  /** Phase 08: best star rating (0–3) per Skill Games Arena game id. */
  skillStars?: Record<string, number>;
  /** Phase 08: best score per Skill Games Arena game id. */
  skillBestScores?: Record<string, number>;
  /** Attack / Defend modes: best points total in each scenario mode. */
  attackBest?: number;
  defendBest?: number;
  /** Phase 09: ISO timestamp of the last Daily Free Pack claim (24h cooldown). */
  lastFreePackIso?: string | null;
  /** Phase 09: live market price book — templateId → current/previous price. */
  marketPrices?: Record<string, MarketPriceEntry>;
  /** Phase 09: ISO timestamp of the last market drift tick (2-minute cadence). */
  marketLastDriftIso?: string | null;
  /** Phase 09: cards listed for sale; a SOLD! sale waits here until claimed. */
  pendingSales?: PendingSale[];
  /** Phase 09: ISO timestamp of the last weekly quest reset. */
  lastWeeklyResetIso?: string;
  /** Lobby redesign: the 7-day Daily Rewards claim streak (see DailyRewardService). */
  dailyReward?: DailyRewardState | null;
  /** Epic P1-3: pack pity counters — openings since the last Elite+ /
   *  Master+ pull (10 / 25 force the tier). */
  packPity?: { sinceElite: number; sinceMaster: number };
  /** Epic P1-3: daily sell cap bookkeeping (UTC day key + count). */
  salesDayKey?: string | null;
  salesToday?: number;
  /** Addendum 1: onboarding — club creation completed (name / kit /
   *  formation chosen by the manager, not the defaults). */
  onboarded?: boolean;
  /** Addendum 1: when this club was founded (first-week chain anchor). */
  clubCreatedAtIso?: string | null;
  /** Addendum 1: first-week quest days already claimed (1..7). */
  firstWeekClaimed?: number[];
  /** Addendum 1: the guided tutorial match was completed or skipped. */
  tutorialDone?: boolean;
  /** Addendum 1: lifetime counters the first-week chain reads. */
  matchesPlayed?: number;
  matchesWon?: number;
  goalsScoredTotal?: number;
  packsOpened?: number;
  /** Addendum 3: live-service season bookkeeping — the 28-day Star Pass
   *  season this profile's pass progress belongs to, the premium track
   *  flag for that season, and its parallel claimed-tier list. */
  seasonPassSeasonId?: number;
  seasonPassPremium?: boolean;
  seasonPassPremiumClaimedTiers?: number[];
  /** Addendum 3: 30-day login-calendar milestone days already claimed. */
  loginMilestonesClaimed?: number[];
  /** Epic P1-4: the live International Cup run, if any. */
  worldCup?: import('../modes/InternationalCupMode').WorldCupState | null;
  /** Epic fix round (P0-4): Rank-Up Shards — duplicates convert to shards;
   *  500 shards craft one Universal Rank-Up Token. */
  rankUpShards?: number;
  /** Epic fix round (P0-5): Skill Games daily reward-cap bookkeeping —
   *  full-rate and half-rate completions already paid today (UTC day key). */
  skillDaily?: { dayKey: string; fullUsed: number; halfUsed: number } | null;
  /** Epic fix round (P1-14): the 28-day Head-to-Head season clock. */
  h2hSeason?: { seasonId: number; endsAtMs: number } | null;
  /** Epic fix round (P1-14): club id of the last H2H opponent (rematch). */
  h2hLastOpponentClubId?: string | null;
  /** Epic fix round (P0-6): when set, this club's XI is YOUR team in
   *  friendlies / H2H / tournament ties (borrowed for the match, restored
   *  after — your own squad and save are never overwritten). */
  playAsClubId?: string | null;
  /** Epic fix round (P2-19): timed-event currency + claimed milestones. */
  eventTokens?: number;
  eventMilestonesClaimed?: number[];
  /** Epic fix round (P2-17): Skill Boost track levels (team-wide). */
  skillBoosts?: Record<string, number>;
  /** Epic fix round (P2-20): the league career spine, if started. */
  career?: CareerState | null;
  /** Cycle-2: the most recent finished match, recorded by the App when a
   *  Match End screen is shown — the lobby News card reads it (last
   *  result + that match's top scorer) instead of static copy. */
  lastMatchResult?: {
    homeLabel: string;
    awayLabel: string;
    scoreHome: number;
    scoreAway: number;
    modeLabel: string;
    topScorerName?: string;
    topScorerGoals?: number;
    atIso: string;
  } | null;
}

/** Epic fix round (P2-20): league career state — a 10-club league played
 *  with the user's own club (or their Play-As club), facilities that grow
 *  between seasons, and a Youth Academy that graduates one player a season. */
export interface CareerState {
  season: number;
  userClubId: string;
  table: { clubId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }[];
  fixtures: { round: number; homeId: string; awayId: string; played: boolean; homeGoals: number; awayGoals: number }[];
  nextFixture: number;
  facilities: { training: number; academy: number; stadium: number };
  academyPromotedSeason: number;
  titlesWon: number;
}

// ---------- Lobby redesign: Daily Rewards streak ----------

export interface DailyRewardState {
  /** Consecutive UTC days claimed (resets to 1 after a missed day). */
  streak: number;
  /** ISO timestamp of the most recent claim. */
  lastClaimIso: string;
  /** Lifetime number of daily-reward claims. */
  totalClaims: number;
}

// ---------- Phase 09: Transfer Market state (Blueprint 08 §4) ----------

export interface MarketPriceEntry {
  price: number;
  prevPrice: number;
  updatedAtIso: string;
}

export interface PendingSale {
  id: string;
  templateId: string;
  /** Market price at listing time. */
  listPrice: number;
  /** Coins credited on claim: 90% of listPrice after the 10% market tax. */
  netPayout: number;
  listedAtIso: string;
  /** ISO time the simulated buyer completes the purchase (10–25s after listing). */
  sellsAtIso: string;
}

// ---------- Phase 08: Champions Knockout Cup bracket (Blueprint 08 §3) ----------

export type TournamentRound = 'R16' | 'QF' | 'SF' | 'F';

export interface TournamentTie {
  homeClubId: string;
  awayClubId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Penalty shootout score when the tie was decided from the spot. */
  pensHome: number | null;
  pensAway: number | null;
  winnerClubId: string | null;
  /** True when this tie is the user's — played live in the 3D engine. */
  isUserTie: boolean;
}

export interface TournamentState {
  /** Bracket rounds in order: [R16 ×8, QF ×4, SF ×2, F ×1] as played. */
  rounds: TournamentTie[][];
  /** Index into rounds of the round currently being played. */
  currentRound: number;
  status: 'IN_PROGRESS' | 'CHAMPION' | 'ELIMINATED';
  startedAtIso: string;
  /** Champion rewards already granted (guards against double-granting). */
  rewardsGranted: boolean;
}

export interface Club {
  id: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  league: string;
  /** Epic P0-3: kit detail + identity (defaults derived when omitted). */
  shortsColor?: string;
  socksColor?: string;
  awayPrimary?: string;
  awaySecondary?: string;
  /** The club's identity formation id (seedDatabase SEED_FORMATIONS). */
  formationId?: string;
  /** Template id of the club captain. */
  captainId?: string;
}

export interface FormationSlot {
  role: Position;
  nx: number;
  ny: number;
}

export interface Formation {
  id: string;
  name: string;
  slots: FormationSlot[];
}

export interface PackDef {
  id: string;
  name: string;
  currency: 'COINS' | 'GEMS';
  price: number;
  cardsCount: number;
  guaranteedMinRarity?: Rarity;
  odds: Record<Rarity, number>;
}

export interface MatchStats {
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  onTargetHome: number;
  onTargetAway: number;
  xgHome: number;
  xgAway: number;
  passAccuracyHome: number;
  passAccuracyAway: number;
}

// ---------- Progression formulas (Blueprint 03) ----------

export function getCardEffectiveOvr(template: PlayerTemplate, card: OwnedPlayerCard): number {
  return template.baseOvr + card.rank + Math.floor(card.trainingLevel / 5);
}

export function xpNeeded(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  return Math.round(120 * Math.pow(1.18, safeLevel));
}

export function maxTrainingLevelForRank(rank: number): number {
  const r = Math.min(5, Math.max(0, Math.floor(rank)));
  return (r + 1) * 5;
}

export function positionGroup(position: Position): PositionGroup {
  if (position === 'GK') return 'GK';
  if (position === 'CB' || position === 'LB' || position === 'RB' || position === 'LWB' || position === 'RWB') return 'DEF';
  if (position === 'CDM' || position === 'CM' || position === 'CAM' || position === 'LM' || position === 'RM') return 'MID';
  return 'ATT';
}

/** Out-of-position OVR penalty per Blueprint 03 matrix. Returns a non-positive number. */
export function outOfPositionPenalty(template: PlayerTemplate, slotPosition: Position, rank: number): number {
  if (slotPosition === template.position) return 0;
  if (template.altPositions.includes(slotPosition)) {
    return rank >= 2 ? -1 : -2;
  }
  if (positionGroup(slotPosition) === positionGroup(template.position)) return -4;
  return -12;
}

/** Effective OVR of a card placed in a specific formation slot. */
export function getSlotEffectiveOvr(template: PlayerTemplate, card: OwnedPlayerCard, slotPosition: Position): number {
  return getCardEffectiveOvr(template, card) + outOfPositionPenalty(template, slotPosition, card.rank);
}

/** FC Mobile authentic rounding: ceil of base average + floor of half the rank average. */
export function calculateTeamOvr(slotOvrs: number[], ranks: number[]): number {
  if (slotOvrs.length === 0) return 0;
  const n = slotOvrs.length;
  const avgBase = slotOvrs.reduce((a, b) => a + b, 0) / n;
  const avgRank = ranks.reduce((a, b) => a + b, 0) / n;
  return Math.ceil(avgBase) + Math.floor(avgRank * 0.5);
}

export const ALL_POSITIONS: Position[] = [
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
];

export const ALL_RARITIES: Rarity[] = ['BRONZE', 'SILVER', 'GOLD', 'ELITE', 'MASTER', 'LEGEND'];
