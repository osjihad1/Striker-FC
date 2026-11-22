import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { GameLoop } from "./core/GameLoop";
import { matchEventBus } from "./core/EventBus";
import { createVec3, mulberry32, normalizeSafe } from "./core/math";
import { PITCH, BALL_CONST, RARITY_COLORS, MENTALITY_CONFIG } from "./core/constants";
import {
ALL_POSITIONS, ALL_RARITIES,
type Mentality, type PlayerTemplate, type Position, type Rarity,
xpNeeded,
} from "./core/types";
import { loadProfile, resetProfile, saveProfile, getLastStorageBackend, profileTeamOvr, generateStarterProfile, parseProfileJson } from "./core/SaveSystem";
import { EXPECTED_PLAYER_COUNT, getAllPlayers, getPlayerById } from "./data/PlayerDatabase";
import { getNationalTeam, runNationsLab, type NationalTeam } from "./data/NationalTeams";
import { ALL_CLUBS, getClubTeam, runClubsLab, type ClubTeam } from "./data/Clubs";
import { SEED_CLUBS } from "./data/seedDatabase";
import { getAllFormations } from "./data/Formations";
import { PLAY_STYLES, getPlayStyle } from "./data/PlayStyles";
import { getAllPacks, QUESTS, SEASON_PASS_TIERS } from "./data/PacksAndQuests";
import { StadiumScene } from "./rendering/StadiumScene";
import type { WeatherPreset } from "./rendering/SceneManager";
import type { CameraMode as CameraMode3D } from "./rendering/CameraController";
import type { AnimState } from "./rendering/PlayerAnimator";
import { InputManager } from "./controls/InputManager";
import { KeyboardGamepadController } from "./controls/KeyboardGamepadController";
import { PracticeEngine, runShotLab, type NetRegistry, type PracticeStats } from "./physics/PracticeEngine";
import { ScrimmageEngine, runAiLab, runAutoSwitchLab, runMatchUpLab, runSubstitutionLab, type ScrimmageStats } from "./ai/ScrimmageEngine";
import { MatchHUD, type HudBanner, type HudDot } from "./ui/hud/MatchHUD";
import { PauseAndStatsModal } from "./ui/hud/PauseAndStatsModal";
import { stadiumAudio, runAudioLab } from "./audio/AudioEngine";
import { musicEngine } from "./audio/MusicEngine";
import { rollSeasonPassIfNeeded } from "./meta/SeasonService";
import { applyWorldCupResult, worldCupNextOpponent } from "./modes/InternationalCupMode";
import { computeMatchRatings } from "./meta/PlayerRatings";
import { createStore } from "./store/createStore";
import { DIFFICULTY_ORDER, getDifficultyProfile } from "./ai/DifficultyProfiles";
import { DEFAULT_TACTICS } from "./ai/TacticalEngine";
import type { Difficulty, ManagerTactics } from "./core/types";
import { ALL_SKILL_MOVES } from "./physics/SkillMoveEngine";
import { TouchControlsOverlay } from "./ui/hud/TouchControlsOverlay";
import { TutorialOverlay } from "./ui/hud/TutorialOverlay";
import { ClubCreationScreen } from "./ui/screens/ClubCreationScreen";
import { HelpScreen } from "./ui/screens/HelpScreen";
import { MatchEngine, runRulesLab, type MatchView } from "./rules/MatchEngine";
import { SetPieceHUD } from "./ui/hud/SetPieceHUD";
import type { ShotType, SkillMoveId } from "./core/types";
import { commitProfile, metaStore, useMetaStore } from "./store/useMetaStore";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import { SplashScreen, LoadingScreen, LoginScreen } from "./ui/screens/BootFlowScreens";
import { EventsScreen } from "./ui/screens/EventsScreen";
import { NationalTeamsScreen } from "./ui/screens/NationalTeamsScreen";
import { ClubsScreen } from "./ui/screens/ClubsScreen";
import { TrainingScreen } from "./ui/screens/TrainingScreen";
import { MainHubScreen } from "./ui/screens/MainHubScreen";
import { SquadBuilderScreen } from "./ui/screens/SquadBuilderScreen";
import { PlayerDetailScreen } from "./ui/screens/PlayerDetailScreen";
import { runProgressionLab } from "./meta/ProgressionService";
import { buildMatchTemplates, captainOf, runSquadLab } from "./meta/SquadService";
import { hudStore, useMatchHudStore } from "./store/useMatchHudStore";
import { settingsStore, useSettingsStore, type MatchHalfLength } from "./store/useSettingsStore";
import { applyDocumentLang, formatNumber, t } from "./i18n/i18n";
import { SettingsScreen } from "./ui/screens/SettingsScreen";
// Phase 08 — the five game modes.
import type { SaveProfile } from "./core/types";
import {
generateH2hOpponent, settleH2h, applyH2hSettlement, divisionName, runH2hLab,
ensureH2hSeason, randomClubH2hOpponent, clubH2hOpponent, h2hSeasonDaysLeft, runH2hSeasonLab,
type H2hOpponent,
} from "./modes/HeadToHeadMode";
import { runMatchPlanLab } from "./ai/MatchPlan";
import { runShardLab } from "./meta/ProgressionService";
import { runExchangeLab } from "./meta/PackService";
import { skillCapFor, runSkillCapLab } from "./modes/SkillGamesMode";
import { installAutoBackupHooks, runAutoBackupLab } from "./meta/CloudBackupService";
import { runCommentaryLab } from "./audio/CommentaryEngine";
import { runEventLab } from "./meta/EventService";
import { runAmbienceLab } from "./audio/StadiumAmbience";
import { runPerfLab, LOW_FRAME_BUDGET } from "./rendering/PerfTelemetry";
import {
  createCareer, nextUserFixture, recordCareerResult, runCareerLab,
  careerOpponentOf, CAREER_USER_ID,
} from "./modes/CareerMode";
import {
VsAttackEngine, settleVsa, runVsaLab, CHANCE_COLORS,
type VsaView,
} from "./modes/VsAttackMode";
import { settleManager, runManagerLab, type ManagerSpeed } from "./modes/ManagerMode";
import {
createTournament, nextUserTie, recordUserTieResult, cupClubById, cupOpponentXI,
championPackTemplate, CHAMPION_COINS, CHAMPION_GEMS, ROUND_NAMES, USER_CLUB_ID,
runTournamentLab,
} from "./modes/TournamentMode";
import {
SkillGamesEngine, skillGameDef, skillRewards, runSkillGamesLab,
type SkillGameId, type SkillView,
} from "./modes/SkillGamesMode";
import type { TeamSide } from "./core/types";
import {
AttackModeEngine, settleAttack, attackRoundLabel, runAttackLab, type AttackView,
} from "./modes/AttackMode";
import {
DefendModeEngine, settleDefend, defendWaveLabel, runDefendLab, type DefendView,
} from "./modes/DefendMode";
import { applyModeRewards, NO_FACTS, type SessionFacts } from "./modes/ModeRewards";
import { PlayModesScreen } from "./ui/screens/PlayModesScreen";
import { PreMatchScreen, type PreMatchData, type PreMatchSide } from "./ui/screens/PreMatchScreen";
import type { KitColors } from "./rendering/PlayerRig";
import { AthletePortrait } from "./ui/components/PlayerCard";
import { MatchEndScreen, type MatchEndData } from "./ui/screens/MatchEndScreen";
import { ManagerTouchlineHUD } from "./ui/hud/ManagerTouchlineHUD";
// Phase 09 — Store, cinematic pack walkouts, Transfer Market, Quests & Pass.
import { runPackLab, freePackCooldownMs } from "./meta/PackService";
import { runMarketLab, claimableSales } from "./meta/MarketService";
import {
  applyQuestResets, incrementQuest, runQuestLab, subscribeQuestTracker,
  dailyQuests, weeklyQuests, questComplete, questProgressOf,
} from "./meta/QuestService";
import { runDailyRewardLab } from "./meta/DailyRewardService";
import { StoreAndWalkoutScreen } from "./ui/screens/StoreAndWalkoutScreen";
import { TransferMarketScreen } from "./ui/screens/TransferMarketScreen";
import { QuestsAndPassScreen } from "./ui/screens/QuestsAndPassScreen";
import type { MatchStatsSheet } from "./rules/MatchStatsTracker";

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="font-display text-xl font-semibold uppercase tracking-widest text-[var(--accent)]">
      {children}
    </h2>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = value >= 85 ? "var(--accent)" : value >= 70 ? "#84cc16" : value >= 55 ? "#eab308" : "#f97316";
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--dim)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="tnum w-7 text-right text-[13px] font-semibold">{value}</span>
    </div>
  );
}

function RarityTag({ rarity }: { rarity: Rarity }) {
  const c = RARITY_COLORS[rarity];
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: c?.bg ?? "#222", color: c?.text ?? "#fff", border: `1px solid ${c?.edge ?? "#444"}` }}
    >
      {c?.label ?? rarity}
    </span>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: ok ? "var(--accent)" : "var(--danger)", color: "#0a120c" }}
        >
          {ok ? "✓" : "!"}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="tnum text-right text-xs text-[var(--dim)]">{detail}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player card + detail
// ---------------------------------------------------------------------------

const SUBSTAT_LABELS: [string, keyof PlayerTemplate["subStats"]][] = [
  ["Acceleration", "acceleration"], ["Sprint Speed", "sprintSpeed"],
  ["Positioning", "positioning"], ["Finishing", "finishing"], ["Shot Power", "shotPower"],
  ["Long Shots", "longShots"], ["Curve", "curve"],
  ["Vision", "vision"], ["Crossing", "crossing"], ["Short Passing", "shortPassing"], ["Long Passing", "longPassing"],
  ["Agility", "agility"], ["Balance", "balance"], ["Ball Control", "ballControl"], ["Dribbling", "dribbling"],
  ["Interceptions", "interceptions"], ["Heading", "headingAccuracy"], ["Standing Tackle", "standingTackle"], ["Sliding Tackle", "slidingTackle"],
  ["Jumping", "jumping"], ["Stamina", "stamina"], ["Strength", "strength"],
  ["GK Diving", "gkDiving"], ["GK Handling", "gkHandling"], ["GK Kicking", "gkKicking"], ["GK Reflexes", "gkReflexes"], ["GK Positioning", "gkPositioning"],
];

function PlayerDetail({ player }: { player: PlayerTemplate }) {
  const club = ALL_CLUBS.find((c) => c.id === player.clubId);
  const rc = RARITY_COLORS[player.rarity];
  const core: [string, number][] = [
    ["PAC", player.stats.pac], ["SHO", player.stats.sho], ["PAS", player.stats.pas],
    ["DRI", player.stats.dri], ["DEF", player.stats.def], ["PHY", player.stats.phy],
  ];
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: rc?.edge ?? "#444" }}>
      <div className="p-4" style={{ background: `linear-gradient(135deg, ${rc?.bg ?? "#1a1a1a"} 0%, #0a120c 78%)` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold leading-none" style={{ color: rc?.text ?? "#fff" }}>
                {player.baseOvr}
              </span>
              <span className="font-display text-2xl font-semibold uppercase" style={{ color: rc?.text ?? "#fff" }}>
                {player.position}
              </span>
            </div>
            <p className="mt-2 text-lg font-bold leading-tight">{player.name}</p>
            <p className="text-sm text-[var(--dim)]">
              {club?.name ?? player.clubId} · {player.nationality} · {player.appearance.heightCm} cm · {player.preferredFoot === "RIGHT" ? "Right" : "Left"} foot
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RarityTag rarity={player.rarity} />
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">
                Weak foot {player.weakFoot}★ · Skills {player.skillMoves}★
              </span>
              {player.altPositions.length > 0 && (
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dim)]">
                  Alt: {player.altPositions.join(", ")}
                </span>
              )}
            </div>
          </div>
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 font-display text-xl font-bold"
            style={{ background: player.appearance.skinTone, borderColor: player.appearance.hairColor, color: "#111" }}
          >
            {player.shortName.slice(0, 2).toUpperCase()}
          </div>
        </div>
        {player.playStyles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {player.playStyles.map((ps) => (
              <span key={ps} className="rounded-full border border-[var(--accent-dim)] bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                {getPlayStyle(ps)?.name ?? ps}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1.5 bg-[var(--surface)] p-4">
        {core.map(([label, value]) => (
          <StatBar key={label} label={label} value={value} />
        ))}
        <p className="tnum pt-2 text-xs text-[var(--dim)]">
          Market value {formatNumber(player.baseMarketPrice)} coins · Work rates {player.workRateAttack}/{player.workRateDefense} · Hair {player.appearance.hairStyle.toLowerCase()} · {player.appearance.build.toLowerCase()} build
        </p>
      </div>
      <details className="bg-[var(--surface)] px-4 pb-4">
        <summary className="cursor-pointer py-1 text-sm font-semibold text-[var(--accent)]">All 27 sub-stats</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {SUBSTAT_LABELS.map(([label, key]) => (
            <div key={key} className="flex items-center justify-between border-b border-[var(--border)]/50 py-1">
              <span className="text-xs text-[var(--dim)]">{label}</span>
              <span className="tnum text-xs font-semibold">{player.subStats[key]}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 06: 20Hz broadcast HUD live store. The GameLoop HUD sync writes here;
// only the small MatchHudLive wrapper re-renders — the rest of the App never
// re-renders for radar/scoreboard updates, so gameplay stays at 60 FPS.
// ---------------------------------------------------------------------------

interface HudLiveState {
  dots: HudDot[];
  ballX: number;
  ballZ: number;
  activeDotIndex: number;
  activeName: string;
  activeRole: string;
  activeStamina: number;
  shotPower: number;
  charging: boolean;
  minute: number;
  addedMinutes: number;
  periodLabel: string;
  stateLabel: string;
  scoreHome: number;
  scoreAway: number;
  redsHome: number;
  redsAway: number;
}

const hudLiveStore = createStore<HudLiveState>({
  dots: [],
  ballX: 0,
  ballZ: 0,
  activeDotIndex: -1,
  activeName: "—",
  activeRole: "",
  activeStamina: 1,
  shotPower: 0,
  charging: false,
  minute: 0,
  addedMinutes: 0,
  periodLabel: "1st Half",
  stateLabel: "",
  scoreHome: 0,
  scoreAway: 0,
  redsHome: 0,
  redsAway: 0,
});

interface MatchHudStaticProps {
  homeClub: (typeof SEED_CLUBS)[number];
  awayClub: (typeof SEED_CLUBS)[number];
  mentality: Mentality;
  onMentality: (m: Mentality) => void;
  showMentality: boolean;
  banner: HudBanner | null;
  advantageSec: number;
  varActive: boolean;
  commentary: string[];
  onPause: () => void;
  paused: boolean;
  trainingMode: boolean;
}

function MatchHudLive(props: MatchHudStaticProps) {
  const live = hudLiveStore.useStore((s) => s);
  return (
    <MatchHUD
      {...props}
      dots={live.dots}
      ball={{ x: live.ballX, z: live.ballZ }}
      activeDotIndex={live.activeDotIndex}
      activeName={live.activeName}
      activeRole={live.activeRole}
      activeStamina={live.activeStamina}
      shotPower={live.shotPower}
      charging={live.charging}
      scoreHome={live.scoreHome}
      scoreAway={live.scoreAway}
      minute={live.minute}
      addedMinutes={live.addedMinutes}
      periodLabel={live.periodLabel}
      stateLabel={live.stateLabel}
      redsHome={live.redsHome}
      redsAway={live.redsAway}
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "hub" | "modes" | "stadium" | "squad" | "store" | "market" | "quests" | "players" | "data" | "settings" | "events" | "training" | "nations" | "clubs" | "help";

/** Phase 08: the classic sandbox modes plus the five mode sessions. */
type PlayMode = "MATCH" | "SCRIMMAGE" | "PRACTICE" | "H2H" | "VSA" | "MANAGER" | "TOURNAMENT" | "SKILL" | "FRIENDLY" | "ATTACK" | "DEFEND";
const MATCH_FAMILY: PlayMode[] = ["MATCH", "H2H", "MANAGER", "TOURNAMENT", "FRIENDLY"];

interface ModeSession {
  id: number;
  kind: "H2H" | "VSA" | "MANAGER" | "TOURNAMENT" | "SKILL" | "FRIENDLY" | "ATTACK" | "DEFEND" | "MATCH";
  opponentName: string;
  opponentAbbr: string;
  opponentPrimary: string;
  opponentSecondary: string;
  skillGameId?: SkillGameId;
  tournamentRound?: number;
  tournamentTieHomeIsUser?: boolean;
  nationCode?: string;
  clubId?: string;
  /** Epic fix round: this friendly is the next Career league fixture. */
  careerFixture?: boolean;
  /** Epic fix round (P0-6): the club the user is playing AS this match. */
  playAsClubId?: string;
}

/** Stats sheet → Match End table rows (shared by all match-family modes). */
/** Cycle-2 i18n: Attack/Defend settlement ratings are fixed English
 *  strings from the mode engines — map them to keys at the boundary. */
const RATING_KEYS: Record<string, string> = {
  'Clinical — a born finisher': 'end.rateAtk7',
  'Sharp — the keeper feared you': 'end.rateAtk5',
  'Promising — chances are turning into goals': 'end.rateAtk3',
  'Wasteful — the chances were there': 'end.rateAtk1',
  'Blanked — the defence owned the box today': 'end.rateAtk0',
  'A wall — nothing got through': 'end.rateDef0',
  'Rock solid — the box was yours': 'end.rateDef2',
  'Bent but not broken': 'end.rateDef4',
  'Overrun — the waves kept coming': 'end.rateDef9',
};
function ratingText(rating: string): string {
  const key = RATING_KEYS[rating];
  return key ? t(key) : rating;
}
function roundName(idx: number | undefined): string {
  const key = `end.round${idx ?? -1}`;
  const label = t(key);
  return label === key ? t('end.cupTie') : label;
}

const MATCH_STATE_KEYS: Record<string, string> = {
  PRE_MATCH_INTRO: 'match.statePreMatch',
  KICKOFF: 'match.stateKickoff',
  IN_PLAY: 'match.stateInPlay',
  THROW_IN: 'match.stateThrowIn',
  GOAL_KICK: 'match.stateGoalKick',
  CORNER_KICK: 'match.stateCornerKick',
  FREE_KICK: 'match.stateFreeKick',
  PENALTY_KICK: 'match.statePenaltyKick',
  OFFSIDE_STOPPAGE: 'match.stateOffside',
  GOAL_CELEBRATION: 'match.stateGoalCelebration',
  GOAL_REPLAY: 'match.stateGoalReplay',
  HALF_TIME: 'match.stateHalfTime',
  EXTRA_TIME: 'match.stateExtraTime',
  PENALTY_SHOOTOUT: 'match.stateShootout',
  FULL_TIME: 'match.stateFullTime',
};
function matchStateLabel(state: string): string {
  const key = MATCH_STATE_KEYS[state];
  return key ? t(key) : state.replace(/_/g, " ");
}

/** Round-4 chrome: attack round / defend wave scenario names via t()
 *  (the EN strings are the engine labels verbatim, so English is unchanged). */
function attackRoundLabelT(round: number): string {
  return round >= 1 && round <= 8 ? t(`attack.round${round}`) : attackRoundLabel(round);
}
function defendWaveLabelT(wave: number): string {
  return wave >= 1 && wave <= 8 ? t(`defend.wave${wave}`) : defendWaveLabel(wave);
}
function chanceLabelT(quality: string): string {
  return quality === "GREAT" ? t('vsa.chanceGreat') : quality === "GOOD" ? t('vsa.chanceGood') : t('vsa.chanceBasic');
}
function vsaOutcomeT(outcome: string): string {
  return outcome === "GOAL" ? t('vsa.outGoal') : outcome === "SAVED" ? t('vsa.outSaved')
    : outcome === "OUT" ? t('vsa.outOut') : outcome === "CLEARED" ? t('vsa.outCleared') : t('vsa.outTimeUp');
}

/** Skill-game strip sub-labels are composed by the engine from a small set of
 *  templates; map those templates through t() and pass anything else raw. */
function skillSubLabelT(sub: string): string {
  if (sub === 'Shoot when the target crosses your side') return t('skill.subShoot');
  const gate = /^Gate (\d+) of (\d+)$/.exec(sub);
  if (gate) return t('skill.subGate', { n: Number(gate[1]), total: Number(gate[2]) });
  const kick = /^Kick (\d+) of (\d+) · (\d+)m out$/.exec(sub);
  if (kick) return t('skill.subKick', { n: Number(kick[1]), total: Number(kick[2]), d: Number(kick[3]) });
  const comboNext = /^Combo ×(\d+) next$/.exec(sub);
  if (comboNext) return t('skill.subComboNext', { n: Number(comboNext[1]) });
  const combo = /^Combo ×(\d+)$/.exec(sub);
  if (combo) return t('skill.subCombo', { n: Number(combo[1]) });
  return sub;
}

function statsRowsFromSheet(sheet: MatchStatsSheet): { label: string; home: string; away: string }[] {
  const h = sheet.home;
  const a = sheet.away;
  return [
    { label: "Possession", home: `${h.possessionPct}%`, away: `${a.possessionPct}%` },
    { label: "Shots", home: String(h.shots), away: String(a.shots) },
    { label: "On target", home: String(h.onTarget), away: String(a.onTarget) },
    { label: "Expected goals (xG)", home: h.xg.toFixed(2), away: a.xg.toFixed(2) },
    { label: "Passes", home: `${h.passCompleted}/${h.passAttempts}`, away: `${a.passCompleted}/${a.passAttempts}` },
    { label: "Pass accuracy", home: `${h.passAccuracyPct}%`, away: `${a.passAccuracyPct}%` },
    { label: "Tackles won", home: String(h.tacklesWon), away: String(a.tacklesWon) },
    { label: "Saves", home: String(h.saves), away: String(a.saves) },
    { label: "Corners", home: String(h.corners), away: String(a.corners) },
    { label: "Fouls", home: String(h.fouls), away: String(a.fouls) },
    { label: "Yellow cards", home: String(h.yellows), away: String(a.yellows) },
    { label: "Red cards", home: String(h.reds), away: String(a.reds) },
  ];
}

export function App() {
  const [tab, setTab] = useState<TabId>("hub");
  // Lobby redesign: the FC Mobile-style bottom bar carries five destinations;
  // everything else lives in its "More" sheet.
  const [moreOpen, setMoreOpen] = useState(false);
  // The verification labs below are heavy headless simulations (a 60s AI
  // match, a full two-half rules match, a 30s QA sim…). They used to run
  // inside useMemo during the FIRST render, blocking the main thread before
  // first paint — on a phone that reads as a blank, never-loading game.
  // They are diagnostics, so they now run only when the Engine Data tab is
  // opened (the nav arms them); the menu and the game never pay for them.
  const [labsArmed, setLabsArmed] = useState(false);
  // Boot flow: Splash (brand + creator credit) → Loading (progress gated on
  // the real profile load) → Login as Guest → Lobby. The game shell renders
  // only after the guest tap, like a native football game.
  const [flowStage, setFlowStage] = useState<"splash" | "loading" | "login" | "game">("splash");
  // Remount key for the 3D stadium: bumped by the stadium error boundary's
  // retry so a dead WebGL renderer is rebuilt from scratch.
  const [stadiumMountKey, setStadiumMountKey] = useState(0);
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null);
  const [playersFocusId, setPlayersFocusId] = useState<string | null>(null);
  // Phase 10: the stadium weather starts from Settings → Default weather.
  const [weather3d, setWeather3d] = useState<WeatherPreset>(() => settingsStore.getState().defaultWeather);
  const weatherEnabled = useSettingsStore((s) => s.weatherEnabled);
  const defaultWeather = useSettingsStore((s) => s.defaultWeather);
  const crowdDensity = useSettingsStore((s) => s.crowdDensity);
  const showFps = useSettingsStore((s) => s.showFps);
  const autoSwitch = useSettingsStore((s) => s.autoSwitch);
  const language = useSettingsStore((s) => s.language);
  // Addendum 2: <html lang> follows the UI language for screen readers.
  // Cycle-2: a language switch also re-renders the commentary ticker from
  // the engine's stored lines (each carries its Bengali rendering).
  useEffect(() => {
    applyDocumentLang();
    const bn = language === "bn";
    setCommentaryLines(stadiumAudio.commentary.current.map((l) => {
      const text = bn && l.bnText ? l.bnText : l.text;
      return l.atMinute > 0 ? `${formatNumber(l.atMinute)}' ${text}` : text;
    }));
  }, [language]);

  // P1-2: procedural music — starts on the first touch (autoplay rules),
  // plays in the menus and ducks to a whisper while a match is on screen.
  useEffect(() => {
    const kick = () => musicEngine.start();
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, []);
  useEffect(() => {
    musicEngine.setScene(tab === "stadium" ? "MATCH" : "MENU");
  }, [tab]);
  /** Weather actually rendered: the Settings weather gate pins floodlights. */
  const effectiveWeather: WeatherPreset = weatherEnabled ? weather3d : "NIGHT_FLOODLIGHTS";
  const [camera3d, setCamera3d] = useState<CameraMode3D>("BROADCAST");
  const [demoAnim, setDemoAnim] = useState<AnimState>("IDLE");
  const [waveSignal, setWaveSignal] = useState(0);
  const [kickSignal, setKickSignal] = useState(0);
  const [renderFps, setRenderFps] = useState(0);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const profile = useMetaStore((s) => s.profile);
  const profileLoaded = useMetaStore((s) => s.loaded);
  const storageBackend = useMetaStore((s) => s.storageBackend);

  const fps = useMatchHudStore((s) => s.fps);
  const tickCount = useMatchHudStore((s) => s.tickCount);
  const accumulator = useMatchHudStore((s) => s.accumulator);
  const alpha = useMatchHudStore((s) => s.alpha);
  const simTime = useMatchHudStore((s) => s.simTimeSeconds);
  const loopRunning = useMatchHudStore((s) => s.loopRunning);
  const mentality = useMatchHudStore((s) => s.mentality);

  const [eventLog, setEventLog] = useState<string[]>([]);
  const [resetNote, setResetNote] = useState<string | null>(null);
  const loopRef = useRef<GameLoop | null>(null);

  // --- Phase 03 practice sandbox (input + physics engine, created once) -----
  const inputRef = useRef<InputManager | null>(null);
  if (!inputRef.current) inputRef.current = new InputManager();
  const netRegistryRef = useRef<NetRegistry>({ left: null, right: null });
  const practiceRef = useRef<PracticeEngine | null>(null);
  if (!practiceRef.current) practiceRef.current = new PracticeEngine(netRegistryRef.current);
  const [practiceOn, setPracticeOn] = useState(true);
  const practiceOnRef = useRef(true);
  practiceOnRef.current = practiceOn;
  const [practiceStats, setPracticeStats] = useState<PracticeStats | null>(null);
  const practiceStatsVersionRef = useRef(-1);

  // --- Phase 04 full 11v11 scrimmage -----------------------------------------
  const scrimmageRef = useRef<ScrimmageEngine | null>(null);
  if (!scrimmageRef.current) scrimmageRef.current = new ScrimmageEngine(netRegistryRef.current);
  // --- Phase 05 full match (rules engine orchestrating the scrimmage) --------
  const matchRef = useRef<MatchEngine | null>(null);
  if (!matchRef.current) {
    matchRef.current = new MatchEngine(scrimmageRef.current, { halfDurationSec: 180, knockout: true, extraTimeEnabled: true });
  }
  const [matchView, setMatchView] = useState<MatchView | null>(null);
  const matchViewTickRef = useRef(0);
  // Phase 10: half length is a persisted setting (Settings → Match half length).
  const [halfDuration, setHalfDuration] = useState<MatchHalfLength>(() => settingsStore.getState().matchHalfLength);
  const [playMode, setPlayMode] = useState<PlayMode>("MATCH");
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const [scrimmagePaused, setScrimmagePaused] = useState(false);
  const scrimmagePausedRef = useRef(false);
  scrimmagePausedRef.current = scrimmagePaused;
  const [scrimmageStats, setScrimmageStats] = useState<ScrimmageStats | null>(null);
  const scrimmageStatsVersionRef = useRef(-1);
  const [difficulty, setDifficulty] = useState<Difficulty>("PROFESSIONAL");
  const [tactics, setTactics] = useState<ManagerTactics>({ ...DEFAULT_TACTICS });

  // --- Phase 08 mode sessions --------------------------------------------------
  const vsaRef = useRef<VsAttackEngine | null>(null);
  const skillRef = useRef<SkillGamesEngine | null>(null);
  const attackRef = useRef<AttackModeEngine | null>(null);
  const defendRef = useRef<DefendModeEngine | null>(null);
  const sessionRef = useRef<ModeSession | null>(null);
  const [session, setSession] = useState<ModeSession | null>(null);
  // Epic fix round (P0-11): the touch overlay's ATTACK/DEFEND layout flips
  // on the real POSSESSION_CHANGED event, not the 20 Hz stats poll.
  const [possessionSide, setPossessionSide] = useState<TeamSide | null>(null);
  // Epic fix round (P0-6/P1-14): play-as-club borrows the HOME XI like the
  // Legends trial does; H2H keeps its last club opponent for rematches.
  const playAsRef = useRef(false);
  const lastH2hOppRef = useRef<H2hOpponent | null>(null);
  const lastH2hClubIdRef = useRef<string | null>(null);
  const sessionSeqRef = useRef(0);
  const finalizedSessionRef = useRef(0);
  const [matchEnd, setMatchEnd] = useState<MatchEndData | null>(null);
  // Cycle-2: every shown Match End is recorded on the profile as the last
  // result (with that match's top scorer from the ratings), so the lobby
  // News card is data-driven instead of static copy. Guarded by object
  // identity so it writes exactly once per finished match.
  const recordedEndRef = useRef<MatchEndData | null>(null);
  useEffect(() => {
    if (!matchEnd || recordedEndRef.current === matchEnd) return;
    recordedEndRef.current = matchEnd;
    const prof = metaStore.getState().profile;
    if (!prof) return;
    const rated = [...(matchEnd.ratings?.home ?? []), ...(matchEnd.ratings?.away ?? [])];
    const top = rated.filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals)[0];
    commitProfile({
      ...prof,
      lastMatchResult: {
        homeLabel: matchEnd.homeLabel,
        awayLabel: matchEnd.awayLabel,
        scoreHome: matchEnd.scoreHome,
        scoreAway: matchEnd.scoreAway,
        modeLabel: matchEnd.modeLabel,
        topScorerName: top?.name,
        topScorerGoals: top?.goals,
        atIso: new Date().toISOString(),
      },
    });
  }, [matchEnd]);
  const [vsaView, setVsaView] = useState<VsaView | null>(null);
  const [skillView, setSkillView] = useState<SkillView | null>(null);
  const [attackView, setAttackView] = useState<AttackView | null>(null);
  const [defendView, setDefendView] = useState<DefendView | null>(null);
  // Attack / Defend modes open on a rules intro before the first chance.
  const [modeIntro, setModeIntro] = useState<{
    title: string; sub: string; rules: string[]; startLabel: string; accent: string;
    start: () => void;
  } | null>(null);
  const [managerSpeed, setManagerSpeed] = useState<ManagerSpeed>(1);
  const managerSpeedRef = useRef<ManagerSpeed>(1);
  managerSpeedRef.current = managerSpeed;

  // --- Match presentation theatre (pre-match lobby + goal beat) --------------
  const [preMatch, setPreMatch] = useState<{ data: PreMatchData; start: () => void } | null>(null);
  // Addendum 1: the guided tutorial match is live.
  const [tutorialActive, setTutorialActive] = useState(false);
  const [goalBeat, setGoalBeat] = useState<{
    id: number; scorer: string; template: PlayerTemplate | null;
    side: "HOME" | "AWAY"; minute: number; kit: KitColors;
  } | null>(null);
  const goalBeatTimerRef = useRef<number | null>(null);
  const cameraBeforeGoalRef = useRef<CameraMode3D>("BROADCAST");
  const celebrationCamTimerRef = useRef<number | null>(null);

  // --- Phase 06 broadcast HUD / audio state ----------------------------------
  const [banner, setBanner] = useState<HudBanner | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const [commentaryLines, setCommentaryLines] = useState<string[]>([]);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [subTick, setSubTick] = useState(0);
  const lastShotPowerRef = useRef(0);
  const showBanner = (b: Omit<HudBanner, "id">, holdMs = 3800) => {
    setBanner({ ...b, id: Date.now() + Math.random() });
    // Phase 10 haptics: a goal gets a double buzz on Android when enabled.
    if (b.kind === "GOAL" && settingsStore.getState().hapticsOn) {
      try { navigator.vibrate?.([35, 45, 35]); } catch { /* unsupported */ }
    }
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), holdMs);
  };
  const showBannerRef = useRef(showBanner);
  showBannerRef.current = showBanner;
  // subTick exists only to re-render the pause modal's lists after a swap.
  void subTick;

  const players = useMemo(() => getAllPlayers(), []);
  const clubs = ALL_CLUBS;
  const formations = useMemo(() => getAllFormations(), []);
  const packs = useMemo(() => getAllPacks(), []);

  // Boot: load (or generate) the SaveProfile.
  // Phase 09: the daily/weekly quest reset cycle runs on every load — a new
  // UTC day zeroes the dailies, seven days zeroes the weeklies.
  useEffect(() => {
    let cancelled = false;
    void loadProfile().then((p) => {
      if (cancelled) return;
      const reset = applyQuestResets(p, Date.now());
      metaStore.getState().setProfile(reset, getLastStorageBackend());
      if (reset !== p) void saveProfile(reset);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 09: EventBus quest auto-tracking — Finesse goals and training
  // levels increment their quests live, mid-match, with no double-counting
  // against the session facts ModeRewards reports at full time.
  useEffect(() => {
    return subscribeQuestTracker((questId, delta) => {
      const current = metaStore.getState().profile;
      if (!current) return;
      const next = incrementQuest(current, questId, delta);
      if (next !== current) commitProfile(next);
    });
  }, []);

  // Addendum 3: the Star Pass lives in 28-day seasons — roll the profile
  // into the current season whenever it loads or the season turns over.
  const seasonProfile = useMetaStore((s) => s.profile);
  useEffect(() => {
    if (!seasonProfile) return;
    const rolled = rollSeasonPassIfNeeded(seasonProfile, Date.now());
    if (rolled !== seasonProfile) commitProfile(rolled);
  }, [seasonProfile]);

  // Boot: run the real fixed-timestep GameLoop; HUD store syncs at 20Hz.
  // Phase 03: the fixed step drives the PracticeEngine (ball physics, nets,
  // kinematics, skill moves) whenever the practice sandbox is on.
  useEffect(() => {
    const input = inputRef.current!;
    const engine = practiceRef.current!;
    const scrimmage = scrimmageRef.current!;
    const offAction = input.onAction((a) => {
      const pm = playModeRef.current;
      if (MATCH_FAMILY.includes(pm)) matchRef.current?.handleAction(a);
      else if (pm === "SCRIMMAGE" || pm === "VSA" || pm === "SKILL" || pm === "ATTACK" || pm === "DEFEND") scrimmage.queueAction(a);
      else engine.queueAction(a);
    });
    const kb = new KeyboardGamepadController(input);
    kb.attach();
    const loop = new GameLoop(
      (dt) => {
        const pm = playModeRef.current;
        if (MATCH_FAMILY.includes(pm)) {
          if (!scrimmagePausedRef.current) {
            matchRef.current?.step(dt, input);
            // Manager Mode at 2×: a second fixed step per tick.
            if (pm === "MANAGER" && managerSpeedRef.current === 2) matchRef.current?.step(dt, input);
          }
        } else if (pm === "VSA") {
          if (!scrimmagePausedRef.current) vsaRef.current?.step(dt, input);
        } else if (pm === "SKILL") {
          if (!scrimmagePausedRef.current) skillRef.current?.step(dt, input);
        } else if (pm === "ATTACK") {
          if (!scrimmagePausedRef.current) attackRef.current?.step(dt, input);
        } else if (pm === "DEFEND") {
          if (!scrimmagePausedRef.current) defendRef.current?.step(dt, input);
        } else if (pm === "SCRIMMAGE") {
          if (!scrimmagePausedRef.current) scrimmage.step(dt, input);
        } else if (practiceOnRef.current) {
          engine.step(dt, input);
        }
      },
      () => { kb.pollGamepad(); },
      () => {
        const d = loop.diagnostics();
        hudStore.getState().pushHudSnapshot({
          fps: d.fps,
          tickCount: d.tickCount,
          accumulator: d.accumulator,
          alpha: d.alpha,
          simTimeSeconds: d.simTimeSeconds,
          loopRunning: d.running,
        });
        const s = engine.stats;
        if (s.version !== practiceStatsVersionRef.current) {
          practiceStatsVersionRef.current = s.version;
          setPracticeStats({ ...s });
        }
        const ss = scrimmage.stats;
        if (ss.version !== scrimmageStatsVersionRef.current) {
          scrimmageStatsVersionRef.current = ss.version;
          setScrimmageStats({ ...ss, stateCounts: { ...ss.stateCounts } });
        }
        matchViewTickRef.current += 1;
        if (matchViewTickRef.current % 3 === 0 && matchRef.current) {
          const mv = matchRef.current.view;
          setMatchView({ ...mv, stats: { ...mv.stats, shotMap: [...mv.stats.shotMap] } });
        }
        // Phase 08: poll the blitz / skill engines into React at the same
        // cadence, and finalize a session the moment its engine finishes.
        if (matchViewTickRef.current % 3 === 0) {
          if (vsaRef.current) {
            const v = vsaRef.current.view;
            setVsaView({ ...v, ticker: [...v.ticker], goalsByQuality: { ...v.goalsByQuality } });
          }
          if (skillRef.current) setSkillView({ ...skillRef.current.view });
          if (attackRef.current) setAttackView({ ...attackRef.current.view });
          if (defendRef.current) setDefendView({ ...defendRef.current.view });
        }
        const sess = sessionRef.current;
        if (sess && finalizedSessionRef.current !== sess.id) {
          if (sess.kind === "VSA" && vsaRef.current?.view.finished) finalizeRef.current.vsa();
          else if (sess.kind === "SKILL" && skillRef.current?.view.finished) finalizeRef.current.skill();
          else if (sess.kind === "ATTACK" && attackRef.current?.view.finished) finalizeRef.current.attack();
          else if (sess.kind === "DEFEND" && defendRef.current?.view.finished) finalizeRef.current.defend();
        }
        // Phase 06: broadcast HUD live snapshot at the same strict 20Hz —
        // written to its own store so only the HUD wrapper re-renders.
        const chargingNow = input.isCharging("SHOOT");
        const shotPowerNow = chargingNow ? input.chargePower("SHOOT") : lastShotPowerRef.current;
        if (playModeRef.current === "PRACTICE") {
          const prs = engine.renderState;
          const controlled = engine.controlled;
          hudLiveStore.setState({
            dots: prs.players.map((p) => ({ x: p.x, z: p.z, side: "HOME" as const })),
            ballX: prs.ballPos.x,
            ballZ: prs.ballPos.z,
            activeDotIndex: prs.activeIndex,
            activeName: controlled.template.shortName,
            activeRole: controlled.template.position,
            activeStamina: controlled.stamina01,
            shotPower: shotPowerNow,
            charging: chargingNow,
            stateLabel: t('panel.practiceTitle'),
          });
          stadiumAudio.updateCrowd(prs.ballPos.x, prs.shotInFlight);
        } else {
          const hp = scrimmage.hudPlayers();
          const rs = scrimmage.renderState;
          const userInfo = hp[scrimmage.activeTeamIndex];
          const mv = matchRef.current?.view;
          const inMatch = MATCH_FAMILY.includes(playModeRef.current) && mv ? mv : null;
          hudLiveStore.setState({
            dots: hp.map((p) => ({ x: p.x, z: p.z, side: p.side })),
            ballX: rs.ballPos.x,
            ballZ: rs.ballPos.z,
            activeDotIndex: rs.activeGlobal,
            activeName: userInfo?.name ?? "—",
            activeRole: userInfo?.role ?? "",
            activeStamina: userInfo?.stamina01 ?? 1,
            shotPower: shotPowerNow,
            charging: chargingNow,
            minute: inMatch ? inMatch.minute : scrimmage.stats.minute,
            addedMinutes: inMatch ? inMatch.addedMinutes : 0,
            periodLabel: inMatch ? (inMatch.period === 2 ? t('hud.secondHalf') : inMatch.period === 3 ? t('hud.extraTime') : t('hud.firstHalf')) : t('panel.periodScrimmage'),
            stateLabel: inMatch ? matchStateLabel(inMatch.state) : t('panel.scrimmageTitle'),
            scoreHome: inMatch ? inMatch.scoreHome : scrimmage.stats.scoreHome,
            scoreAway: inMatch ? inMatch.scoreAway : scrimmage.stats.scoreAway,
            redsHome: inMatch ? inMatch.stats.home.reds : 0,
            redsAway: inMatch ? inMatch.stats.away.reds : 0,
          });
          stadiumAudio.updateCrowd(rs.ballPos.x, rs.shotInFlight);
        }
      },
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      loopRef.current = null;
      offAction();
      kb.detach();
    };
  }, []);

  // Phase 05/08: the rules engine owns the scrimmage in every match-family
  // mode. VS Attack and Skill Games install their own event sink instead —
  // their launch functions detach the MatchEngine explicitly first.
  useEffect(() => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    if (MATCH_FAMILY.includes(playMode)) matchRef.current?.reattach();
    else if (playMode === "SCRIMMAGE" || playMode === "PRACTICE") matchRef.current?.detach();
  }, [playMode]);

  const startNewMatch = (half: 180 | 240 | 360) => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    sc.resetMatch();
    sc.renderState.offsideLineX = null;
    matchRef.current = new MatchEngine(sc, { halfDurationSec: half, knockout: true, extraTimeEnabled: true });
    stadiumAudio.resetMatch();
    setHalfDuration(half);
    setMatchView(null);
    setScrimmagePaused(false);
    setPauseOpen(false);
  };

  // --- Phase 08: mode session lifecycle ---------------------------------------
  /** Tear down any live mode session: engines disposed, squads restored. */
  const cleanupModeSession = () => {
    vsaRef.current?.dispose();
    vsaRef.current = null;
    skillRef.current?.dispose();
    skillRef.current = null;
    attackRef.current?.dispose();
    attackRef.current = null;
    defendRef.current?.dispose();
    defendRef.current = null;
    const sc = scrimmageRef.current;
    if (sc) {
      if (sc.autonomousHome) sc.autonomousHome = false;
      if (sessionRef.current) sc.applyAwaySquad(null);
      // Epic P0-1: after a Legends trial, put the manager's own club XI
      // back on the HOME side (the trial borrowed a national team).
      // Epic fix round (P0-6): the same restore covers Play-as-Club, which
      // also borrows the HOME XI for one match.
      if (legendsTrialRef.current || playAsRef.current) {
        legendsTrialRef.current = false;
        playAsRef.current = false;
        const prof = metaStore.getState().profile;
        if (prof) {
          const { xi, bench } = buildMatchTemplates(prof);
          sc.applyHomeSquad(xi, bench);
        }
      }
      sc.resetMatch();
    }
    setPossessionSide(null);
    sessionRef.current = null;
    setSession(null);
    setVsaView(null);
    setSkillView(null);
    setAttackView(null);
    setDefendView(null);
  };

  const beginSession = (s: Omit<ModeSession, "id">): ModeSession => {
    sessionSeqRef.current += 1;
    const full = { ...s, id: sessionSeqRef.current };
    sessionRef.current = full;
    setSession(full);
    setMatchEnd(null);
    setScrimmagePaused(false);
    setPauseOpen(false);
    setTab("stadium");
    return full;
  };

  /**
   * Epic fix round (P0-6) — Play as Club: when the profile carries a
   * play-as club, put that club's real XI on the HOME side for the match
   * being launched (the club XI is restored by cleanupModeSession).
   * Returns the club team when applied, null when playing as own club.
   */
  const applyPlayAsHome = (): ClubTeam | null => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof?.playAsClubId || !sc) return null;
    const team = getClubTeam(prof.playAsClubId);
    if (!team) return null;
    playAsRef.current = true;
    sc.applyHomeSquad(team.xi, []);
    return team;
  };

  /** Fresh MatchEngine for a mode session (opponent XI already applied). */
  const startModeMatch = (config: { halfDurationSec: number; knockout: boolean; extraTimeEnabled: boolean }) => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    sc.resetMatch();
    sc.renderState.offsideLineX = null;
    matchRef.current = new MatchEngine(sc, config);
    stadiumAudio.resetMatch();
    setMatchView(null);
    setScrimmagePaused(false);
    setPauseOpen(false);
  };

  // --- Pre-match lobby data (checker fix 4: captains + kits face-off) --------
  const homePreMatchSide = (prof: SaveProfile): PreMatchSide => {
    const cap = captainOf(prof);
    const kit: KitColors = {
      primary: prof.clubPrimaryColor, secondary: prof.clubSecondaryColor,
      shorts: "#0f172a", socks: prof.clubPrimaryColor,
    };
    return {
      clubName: prof.clubName, abbr: prof.clubAbbr, kit,
      captain: cap?.template ?? null,
      captainNumber: (cap?.index ?? 0) + 1,
      captainOvr: cap?.slotOvr ?? null,
      teamOvr: profileTeamOvr(prof),
      xi: buildMatchTemplates(prof).xi,
    };
  };

  /** Epic fix round (P0-6): pre-match side for the club being played AS. */
  const playAsPreMatchSide = (team: ClubTeam): PreMatchSide => {
    const { club } = team;
    const captain = team.captain;
    return {
      clubName: club.name, abbr: club.abbr,
      kit: { primary: club.primary, secondary: club.secondary, shorts: "#0f172a", socks: club.primary },
      captain, captainNumber: captain?.shirtNumber ?? 10, captainOvr: captain?.baseOvr ?? null,
      teamOvr: team.teamOvr,
      xi: team.xi,
    };
  };

  const clubPreMatchSide = (clubId: string): PreMatchSide | null => {
    const team = getClubTeam(clubId);
    if (!team) return null;
    const { club } = team;
    const captain = team.captain;
    return {
      clubName: club.name, abbr: club.abbr,
      kit: { primary: club.primary, secondary: club.secondary, shorts: "#f8fafc", socks: club.primary },
      captain, captainNumber: captain?.shirtNumber ?? 10, captainOvr: captain?.baseOvr ?? null,
      teamOvr: team.teamOvr,
      xi: team.xi,
    };
  };

  const openClassicPreMatch = () => {
    const prof = metaStore.getState().profile;
    if (!prof) return;
    const away = clubPreMatchSide("man_sky");
    if (!away) return;
    setPreMatch({
      data: { modeLabel: "Full Match · Friendly", home: homePreMatchSide(prof), away },
      start: () => { setPreMatch(null); beginClassicMode("MATCH"); },
    });
  };

  /** National-team friendly: the nation's real best XI fields as the away
   *  side (the exact templates from NationalTeams), with the difficulty
   *  scaled to the nation's Team OVR — stronger nations play smarter. */
  const launchFriendly = (nation: NationalTeam) => {
    const sc = scrimmageRef.current;
    if (!sc || nation.xi.length !== 11) return;
    cleanupModeSession();
    applyPlayAsHome();
    sc.applyAwaySquad(nation.xi);
    const diff: Difficulty = nation.teamOvr >= 88 ? "LEGENDARY"
      : nation.teamOvr >= 84 ? "WORLD_CLASS"
        : nation.teamOvr >= 79 ? "PROFESSIONAL" : "SEMI_PRO";
    sc.setDifficulty(diff);
    setDifficulty(diff);
    beginSession({
      kind: "FRIENDLY",
      opponentName: nation.name, opponentAbbr: nation.abbr,
      opponentPrimary: nation.primary, opponentSecondary: nation.secondary,
      nationCode: nation.code,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("FRIENDLY");
  };

  /** Epic P0-1: "Play as Legends" trial friendly. The Legend's national XI
   *  becomes YOUR team for one match and you control the Legend himself —
   *  no ownership, no gems, nothing written to the save. The club squad is
   *  restored by cleanupModeSession when the match ends. */
  const legendsTrialRef = useRef(false);
  const LEGEND_TRIALS: Record<string, { nation: string; rival: string }> = {
    rw_messi: { nation: "ARG", rival: "BRA" },
    rw_maradona: { nation: "ARG", rival: "BRA" },
    rw_ronaldo: { nation: "POR", rival: "ESP" },
    rw_mbappe: { nation: "FRA", rival: "ENG" },
  };
  const launchLegendsTrial = (legendId: string) => {
    const sc = scrimmageRef.current;
    const trial = LEGEND_TRIALS[legendId];
    if (!sc || !trial) return;
    const nation = getNationalTeam(trial.nation);
    const rival = getNationalTeam(trial.rival);
    if (!nation || nation.xi.length !== 11 || !rival || rival.xi.length !== 11) return;
    cleanupModeSession();
    legendsTrialRef.current = true;
    sc.applyHomeSquad(nation.xi, []);
    sc.applyAwaySquad(rival.xi);
    const legendIndex = nation.xi.findIndex((p) => p.id === legendId);
    if (legendIndex >= 0) sc.activeTeamIndex = legendIndex;
    sc.setDifficulty("PROFESSIONAL");
    setDifficulty("PROFESSIONAL");
    beginSession({
      kind: "FRIENDLY",
      opponentName: rival.name, opponentAbbr: rival.abbr,
      opponentPrimary: rival.primary, opponentSecondary: rival.secondary,
      nationCode: rival.code,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("FRIENDLY");
    if (legendIndex >= 0) sc.activeTeamIndex = legendIndex;
  };

  /**
   * Addendum 1: the guided tutorial — a gentle full-rules match against a
   * weak club at AMATEUR, with the coach-marks overlay watching real
   * actions. Finishing or skipping marks the tutorial done; nothing about
   * the club's competitive record is written by it.
   */
  const launchTutorial = () => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    cleanupModeSession();
    const weak = getClubTeam("dhaka_tigers") ?? getClubTeam("tokyo_blazers");
    if (weak) sc.applyAwaySquad(weak.xi);
    sc.setDifficulty("AMATEUR");
    setDifficulty("AMATEUR");
    beginSession({
      kind: "FRIENDLY",
      opponentName: weak?.club.name ?? "Dhaka Royal Tigers", opponentAbbr: weak?.club.abbr ?? "DRT",
      opponentPrimary: weak?.club.primary ?? "#0ea5e9", opponentSecondary: weak?.club.secondary ?? "#082f49",
      clubId: weak?.club.id,
    });
    startModeMatch({ halfDurationSec: 150, knockout: false, extraTimeEnabled: false });
    setPlayMode("MATCH");
    setTutorialActive(true);
    setTab("stadium");
  };

  const finishTutorial = (completed: boolean) => {
    setTutorialActive(false);
    const prof = metaStore.getState().profile;
    if (prof && !prof.tutorialDone) commitProfile({ ...prof, tutorialDone: true });
    void completed;
    cleanupModeSession();
    setTab("hub");
  };

  /**
   * Epic P1-4: play the next International Cup fixture — your nation's
   * real XI at home against the drawn opponent's XI. The FRIENDLY
   * settlement path records the result into the cup state.
   */
  const requestWorldCupMatch = () => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof?.worldCup || !sc) return;
    const oppCode = worldCupNextOpponent(prof.worldCup);
    if (!oppCode) return;
    const mine = getNationalTeam(prof.worldCup.userCode);
    const theirs = getNationalTeam(oppCode);
    if (!mine || mine.xi.length !== 11 || !theirs || theirs.xi.length !== 11) return;
    cleanupModeSession();
    legendsTrialRef.current = true; // home XI is borrowed — restore the club XI after
    sc.applyHomeSquad(mine.xi, []);
    sc.applyAwaySquad(theirs.xi);
    beginSession({
      kind: "FRIENDLY",
      opponentName: theirs.name, opponentAbbr: theirs.abbr,
      opponentPrimary: theirs.primary, opponentSecondary: theirs.secondary,
      nationCode: theirs.code,
    });
    startModeMatch({ halfDurationSec: 180, knockout: prof.worldCup.stage !== "GROUP", extraTimeEnabled: false });
    setPlayMode("MATCH");
    setTab("stadium");
  };

  /** Pre-match lobby for a national-team friendly (both captains + kits). */
  const requestFriendly = (code: string) => {
    const prof = metaStore.getState().profile;
    const nation = getNationalTeam(code);
    if (!prof || !nation || nation.xi.length !== 11) return;
    const captain = nation.captain ?? nation.xi[0]!;
    const playAsTeam = prof.playAsClubId ? getClubTeam(prof.playAsClubId) : null;
    setPreMatch({
      data: {
        modeLabel: `International Friendly · vs ${nation.name}`,
        home: playAsTeam ? playAsPreMatchSide(playAsTeam) : homePreMatchSide(prof),
        away: {
          clubName: nation.name, abbr: nation.abbr,
          kit: { primary: nation.primary, secondary: nation.secondary, shorts: "#f8fafc", socks: nation.primary },
          captain, captainNumber: captain.shirtNumber ?? 10,
          captainOvr: captain.baseOvr, teamOvr: nation.teamOvr,
          xi: nation.xi,
        },
      },
      start: () => { setPreMatch(null); launchFriendly(nation); },
    });
  };

  /** Club friendly: the club's real best XI (from the Clubs database) fields
   *  as the away side in the club's real kit colours, difficulty scaled to
   *  the club's Team OVR — Real Madrid is a Legendary-tier test, a new
   *  original club a Semi-Pro one. Settlement reuses the friendly path. */
  const launchClubFriendly = (team: ClubTeam) => {
    const sc = scrimmageRef.current;
    if (!sc || team.xi.length !== 11) return;
    cleanupModeSession();
    applyPlayAsHome();
    sc.applyAwaySquad(team.xi);
    const diff: Difficulty = team.teamOvr >= 88 ? "LEGENDARY"
      : team.teamOvr >= 84 ? "WORLD_CLASS"
        : team.teamOvr >= 79 ? "PROFESSIONAL" : "SEMI_PRO";
    sc.setDifficulty(diff);
    setDifficulty(diff);
    beginSession({
      kind: "FRIENDLY",
      opponentName: team.club.name, opponentAbbr: team.club.abbr,
      opponentPrimary: team.club.primary, opponentSecondary: team.club.secondary,
      clubId: team.club.id,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("FRIENDLY");
  };

  /** Pre-match lobby for a club friendly (both captains + real kits). */
  const requestClubFriendly = (clubId: string) => {
    const prof = metaStore.getState().profile;
    const team = getClubTeam(clubId);
    if (!prof || !team || team.xi.length !== 11) return;
    const away = clubPreMatchSide(clubId);
    if (!away) return;
    const playAsTeam = prof.playAsClubId ? getClubTeam(prof.playAsClubId) : null;
    setPreMatch({
      data: {
        modeLabel: `Club Friendly · vs ${team.club.name}`,
        home: playAsTeam ? playAsPreMatchSide(playAsTeam) : homePreMatchSide(prof),
        away,
      },
      start: () => { setPreMatch(null); launchClubFriendly(team); },
    });
  };

  const launchH2hWith = (opp: H2hOpponent) => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof || !sc) return;
    cleanupModeSession();
    applyPlayAsHome();
    sc.applyAwaySquad(opp.templates);
    sc.setDifficulty(opp.difficulty);
    setDifficulty(opp.difficulty);
    beginSession({
      kind: "H2H",
      opponentName: opp.clubName, opponentAbbr: opp.clubAbbr,
      opponentPrimary: opp.primary, opponentSecondary: opp.secondary,
      playAsClubId: prof.playAsClubId ?? undefined,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("H2H");
    showBannerRef.current({
      kind: "INFO", title: t('hub.h2hLabel', { division: divisionName(prof.h2hDivision) }),
      sub: `vs ${opp.clubName} (${opp.teamOvr} OVR) — a win banks a star on the ladder. Season ends in ${h2hSeasonDaysLeft(prof, Date.now())}d.`,
    });
  };

  /**
   * Epic fix round (P1-14): pick the H2H opponent — a real club fielding
   * its ACTUAL XI — and roll the 28-day season clock over when it expired
   * (drop 5 divisions, season-end rewards paid, banner shown).
   */
  const pickH2hOpponent = (): H2hOpponent => {
    let prof = metaStore.getState().profile!;
    const roll = ensureH2hSeason(prof, Date.now());
    if (roll.rollover) {
      const { next } = applyModeRewards(roll.profile, roll.rollover.grant, NO_FACTS);
      commitProfile(next);
      prof = next;
      showBannerRef.current({
        kind: "INFO", title: "New H2H Season",
        sub: `The new season begins in ${divisionName(roll.rollover.newDivision)} — down 5 divisions, season-end rewards banked.`,
      });
    }
    const rng = mulberry32(Date.now() & 0xffffff);
    const clubPick = randomClubH2hOpponent(prof.h2hDivision, rng, prof.playAsClubId ?? undefined);
    if (clubPick) {
      lastH2hOppRef.current = clubPick;
      lastH2hClubIdRef.current = ALL_CLUBS.find((c) => c.name === clubPick.clubName)?.id ?? null;
      return clubPick;
    }
    const generated = generateH2hOpponent(profileTeamOvr(prof), prof.h2hDivision, rng);
    lastH2hOppRef.current = generated;
    lastH2hClubIdRef.current = null;
    return generated;
  };

  /** Instant H2H start (match-end restart keeps the old one-tap flow). */
  const launchH2h = () => {
    const prof = metaStore.getState().profile;
    if (!prof) return;
    launchH2hWith(pickH2hOpponent());
  };

  /** Rematch the SAME H2H opponent club (P1-14) from the Match End screen. */
  const rematchH2h = () => {
    const clubId = lastH2hClubIdRef.current;
    const prof = metaStore.getState().profile;
    if (clubId && prof) {
      const opp = clubH2hOpponent(clubId, prof.h2hDivision);
      if (opp) {
        lastH2hOppRef.current = opp;
        launchH2hWith(opp);
        return;
      }
    }
    if (lastH2hOppRef.current) { launchH2hWith(lastH2hOppRef.current); return; }
    launchH2h();
  };

  /** Lobby / Play-modes H2H entry: captains face off first, then kickoff. */
  const requestH2h = () => {
    const prof = metaStore.getState().profile;
    if (!prof) return;
    const opp = pickH2hOpponent();
    const captain = [...opp.templates].sort((a, b) => b.baseOvr - a.baseOvr)[0] ?? null;
    const playAsTeam = prof.playAsClubId ? getClubTeam(prof.playAsClubId) : null;
    setPreMatch({
      data: {
        modeLabel: t('hub.h2hLabel', { division: divisionName(prof.h2hDivision) }),
        home: playAsTeam ? playAsPreMatchSide(playAsTeam) : homePreMatchSide(prof),
        away: {
          clubName: opp.clubName, abbr: opp.clubAbbr,
          kit: { primary: opp.primary, secondary: opp.secondary, shorts: "#f8fafc", socks: opp.primary },
          captain, captainNumber: captain?.shirtNumber ?? 10, captainOvr: captain?.baseOvr ?? null,
          teamOvr: opp.teamOvr,
          xi: opp.templates,
        },
      },
      start: () => { setPreMatch(null); launchH2hWith(opp); },
    });
  };

  const launchVsa = () => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof || !sc) return;
    cleanupModeSession();
    matchRef.current?.detach();
    const userOvr = profileTeamOvr(prof);
    const opp = generateH2hOpponent(userOvr, prof.h2hDivision, mulberry32((Date.now() & 0xffffff) ^ 0x5eed));
    sc.applyAwaySquad(opp.templates);
    const engine = new VsAttackEngine(sc, {
      userTeamOvr: userOvr, oppTeamOvr: opp.teamOvr, seed: Date.now() & 0xffffff,
    });
    vsaRef.current = engine;
    engine.start();
    beginSession({
      kind: "VSA",
      opponentName: opp.clubName, opponentAbbr: opp.clubAbbr,
      opponentPrimary: opp.primary, opponentSecondary: opp.secondary,
    });
    setPlayMode("VSA");
  };

  const launchManager = () => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof || !sc) return;
    cleanupModeSession();
    const userOvr = profileTeamOvr(prof);
    const opp = generateH2hOpponent(userOvr, prof.h2hDivision, mulberry32((Date.now() & 0xffffff) ^ 0x9a1a));
    sc.applyAwaySquad(opp.templates);
    sc.autonomousHome = true; // AI vs AI — the user coaches from the touchline
    beginSession({
      kind: "MANAGER",
      opponentName: opp.clubName, opponentAbbr: opp.clubAbbr,
      opponentPrimary: opp.primary, opponentSecondary: opp.secondary,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("MANAGER");
  };

  const startTournament = () => {
    const prof = metaStore.getState().profile;
    if (!prof) return;
    const cup = createTournament(Date.now() & 0xffffff, new Date().toISOString());
    commitProfile({ ...prof, tournament: cup });
    showBannerRef.current({ kind: "INFO", title: "Cup Draw Complete", sub: "16 clubs in the hat — your Round of 16 tie is ready in Play Modes." });
  };

  const playTournamentTie = () => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof || !sc || !prof.tournament) return;
    const ref = nextUserTie(prof.tournament);
    if (!ref) return;
    cleanupModeSession();
    applyPlayAsHome();
    const oppClubId = ref.tie.homeClubId === USER_CLUB_ID ? ref.tie.awayClubId : ref.tie.homeClubId;
    const oppClub = cupClubById(oppClubId, prof);
    const rng = mulberry32((Date.now() & 0xffffff) ^ 0xc0ffee);
    sc.applyAwaySquad(cupOpponentXI(oppClubId, rng));
    const difficultyByRound: Difficulty[] = ["PROFESSIONAL", "WORLD_CLASS", "LEGENDARY", "ULTIMATE"];
    const diff = difficultyByRound[ref.roundIndex] ?? "PROFESSIONAL";
    sc.setDifficulty(diff);
    setDifficulty(diff);
    beginSession({
      kind: "TOURNAMENT",
      opponentName: oppClub.name, opponentAbbr: oppClub.abbr,
      opponentPrimary: oppClub.primary, opponentSecondary: oppClub.secondary,
      tournamentRound: ref.roundIndex,
      tournamentTieHomeIsUser: ref.tie.homeClubId === USER_CLUB_ID,
    });
    // Knockout rules: extra time, then the playable shootout if still level.
    startModeMatch({ halfDurationSec: 180, knockout: true, extraTimeEnabled: true });
    setPlayMode("TOURNAMENT");
  };

  /**
   * Epic fix round (P2-20) — Career league: start the spine if needed and
   * play the next league fixture as a club friendly against the opponent's
   * real XI; finalizeFriendly records the result into the table.
   */
  const launchCareerFixture = () => {
    const prof = metaStore.getState().profile;
    const sc = scrimmageRef.current;
    if (!prof || !sc) return;
    let career = prof.career;
    if (!career) {
      career = createCareer(prof.playAsClubId ?? "career_user");
      commitProfile({ ...prof, career });
    }
    const fixture = nextUserFixture(career);
    if (!fixture) return;
    const oppTeam = getClubTeam(careerOpponentOf(fixture));
    if (!oppTeam || oppTeam.xi.length !== 11) return;
    cleanupModeSession();
    applyPlayAsHome();
    sc.applyAwaySquad(oppTeam.xi);
    const diff: Difficulty = oppTeam.teamOvr >= 88 ? "LEGENDARY"
      : oppTeam.teamOvr >= 84 ? "WORLD_CLASS"
        : oppTeam.teamOvr >= 79 ? "PROFESSIONAL" : "SEMI_PRO";
    sc.setDifficulty(diff);
    setDifficulty(diff);
    beginSession({
      kind: "FRIENDLY",
      opponentName: oppTeam.club.name, opponentAbbr: oppTeam.club.abbr,
      opponentPrimary: oppTeam.club.primary, opponentSecondary: oppTeam.club.secondary,
      clubId: oppTeam.club.id,
      careerFixture: true,
      playAsClubId: prof.playAsClubId ?? undefined,
    });
    startModeMatch({ halfDurationSec: 180, knockout: false, extraTimeEnabled: false });
    setPlayMode("FRIENDLY");
    showBannerRef.current({
      kind: "INFO", title: `Career · Season ${career.season}`,
      sub: `League fixture vs ${oppTeam.club.name} — the result goes on the table.`,
    });
  };

  const launchSkill = (gameId: SkillGameId) => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    cleanupModeSession();
    matchRef.current?.detach();
    const engine = new SkillGamesEngine(sc, gameId, { seed: Date.now() & 0xffffff });
    skillRef.current = engine;
    engine.start();
    const def = skillGameDef(gameId);
    beginSession({
      kind: "SKILL",
      opponentName: def.name, opponentAbbr: "SKILL",
      opponentPrimary: "#f59e0b", opponentSecondary: "#111827",
      skillGameId: gameId,
    });
    setPlayMode("SKILL");
  };

  const launchAttack = () => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    cleanupModeSession();
    matchRef.current?.detach();
    const engine = new AttackModeEngine(sc);
    attackRef.current = engine;
    engine.start();
    beginSession({
      kind: "ATTACK",
      opponentName: t('end.mAttack'), opponentAbbr: "ATK",
      opponentPrimary: "#f97316", opponentSecondary: "#111827",
    });
    setPlayMode("ATTACK");
  };

  const launchDefend = () => {
    const sc = scrimmageRef.current;
    if (!sc) return;
    cleanupModeSession();
    matchRef.current?.detach();
    const engine = new DefendModeEngine(sc);
    defendRef.current = engine;
    engine.start();
    beginSession({
      kind: "DEFEND",
      opponentName: t('end.mDefend'), opponentAbbr: "DEF",
      opponentPrimary: "#38bdf8", opponentSecondary: "#111827",
    });
    setPlayMode("DEFEND");
  };

  /** Rules intro for Attack Mode — shown before the first chance. */
  const requestAttack = () => {
    const prof = metaStore.getState().profile;
    setModeIntro({
      title: t('modes.attackMode'),
      sub: t('attack.introSub'),
      accent: "#f97316",
      rules: [
        t('attack.rule1'),
        t('attack.rule2'),
        t('attack.rule3'),
        t('attack.rule4', { n: prof?.attackBest ?? 0 }),
      ],
      startLabel: t('attack.start'),
      start: () => { setModeIntro(null); launchAttack(); },
    });
  };

  /** Rules intro for Defend Mode — shown before the first wave. */
  const requestDefend = () => {
    const prof = metaStore.getState().profile;
    setModeIntro({
      title: t('modes.defendMode'),
      sub: t('defend.introSub'),
      accent: "#38bdf8",
      rules: [
        t('defend.rule1'),
        t('defend.rule2'),
        t('defend.rule3'),
        t('defend.rule4', { n: prof?.defendBest ?? 0 }),
      ],
      startLabel: t('defend.start'),
      start: () => { setModeIntro(null); launchDefend(); },
    });
  };

  /** End a live session early: the current score stands (forfeit rules). */
  const endSessionEarly = () => {
    const sess = sessionRef.current;
    if (!sess) return;
    if (sess.kind === "VSA") vsaRef.current?.abort();
    else if (sess.kind === "SKILL") skillRef.current?.abort();
    else if (sess.kind === "ATTACK") attackRef.current?.abort();
    else if (sess.kind === "DEFEND") defendRef.current?.abort();
    else matchRef.current?.forfeit();
  };

  const beginClassicMode = (m: "MATCH" | "SCRIMMAGE" | "PRACTICE") => {
    if (sessionRef.current) {
      cleanupModeSession();
      if (m === "MATCH") startNewMatch(halfDuration);
    }
    setMatchEnd(null);
    setPlayMode(m);
    setTab("stadium");
    // QA fix (addendum 6): a classic Full Match is a real session now —
    // it settles at full time (win 800 / draw 400 / loss 200 coins) and
    // opens the Match End screen like every other match mode.
    if (m === "MATCH" && !sessionRef.current) {
      const away = clubPreMatchSide("man_sky");
      if (away) {
        beginSession({
          kind: "MATCH",
          opponentName: away.clubName, opponentAbbr: away.abbr,
          opponentPrimary: away.kit.primary, opponentSecondary: away.kit.secondary,
          clubId: "man_sky",
        });
      }
    }
  };

  const selectClassicMode = (m: "MATCH" | "SCRIMMAGE" | "PRACTICE") => {
    // Full matches get the pre-match lobby theatre (captains + kits +
    // walkout); scrimmage and practice stay one-tap instant.
    if (m === "MATCH") { openClassicPreMatch(); return; }
    beginClassicMode(m);
  };

  // --- Phase 08: session finalizers (grant + persist + Match End screen) -------
  const finalizeH2h = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const mv = matchRef.current?.view;
    if (!sess || sess.kind !== "H2H" || !prof || !mv) return;
    finalizedSessionRef.current = sess.id;
    const outcome = mv.scoreHome > mv.scoreAway ? "WIN" : mv.scoreHome === mv.scoreAway ? "DRAW" : "LOSS";
    const settlement = settleH2h(prof, outcome);
    const facts: SessionFacts = {
      played: true, goalsScored: mv.scoreHome, cleanSheet: mv.scoreAway === 0,
      h2hWin: outcome === "WIN", skillGamePlayed: false,
    };
    const { next, quests } = applyModeRewards(prof, settlement.grant, facts);
    commitProfile({
      ...applyH2hSettlement(next, settlement),
      h2hLastOpponentClubId: lastH2hClubIdRef.current ?? undefined,
    });
    setMatchEnd({
      modeLabel: `${t('end.mH2h')} · ${divisionName(settlement.divisionBefore)}`,
      title: outcome === "WIN" ? t('matchEnd.victory') : outcome === "DRAW" ? t('matchEnd.draw') : t('matchEnd.defeat'),
      message: settlement.promoted
        ? t('end.h2hPromoted', { div: divisionName(settlement.divisionAfter) })
        : settlement.relegated
          ? t('end.h2hRelegated', { div: divisionName(settlement.divisionAfter) })
          : outcome === "WIN" ? t('end.h2hWinStar')
            : outcome === "DRAW" ? t('end.h2hDraw')
              : t('end.h2hLossStar'),
      homeLabel: prof.clubName, awayLabel: sess.opponentName,
      scoreHome: mv.scoreHome, scoreAway: mv.scoreAway,
      statsRows: statsRowsFromSheet(mv.stats),
      coins: settlement.grant.coins, gems: settlement.grant.gems,
      xp: settlement.grant.xp, trainingXp: settlement.grant.trainingXp,
      division: {
        divisionBefore: settlement.divisionBefore, divisionAfter: settlement.divisionAfter,
        starsBefore: settlement.starsBefore, starsAfter: settlement.starsAfter,
        promoted: settlement.promoted, relegated: settlement.relegated,
      },
      quests,
    });
  };

  const finalizeManager = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const mv = matchRef.current?.view;
    if (!sess || sess.kind !== "MANAGER" || !prof || !mv) return;
    finalizedSessionRef.current = sess.id;
    const settlement = settleManager(mv.scoreHome, mv.scoreAway);
    const facts: SessionFacts = {
      played: true, goalsScored: mv.scoreHome, cleanSheet: mv.scoreAway === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: settlement.result === "WIN",
    };
    const { next, quests } = applyModeRewards(prof, settlement.grant, facts);
    commitProfile(next);
    const sc = scrimmageRef.current;
    if (sc) sc.autonomousHome = false;
    setMatchEnd({
      modeLabel: t('end.mManager'),
      title: settlement.result === "WIN" ? t('end.tMasterclass') : settlement.result === "DRAW" ? t('end.tPointOnRoad') : t('end.tOutCoached'),
      message: settlement.result === "WIN"
        ? t('end.mgrWin')
        : settlement.result === "DRAW"
          ? t('end.mgrDraw')
          : t('end.mgrLoss'),
      homeLabel: prof.clubName, awayLabel: sess.opponentName,
      scoreHome: mv.scoreHome, scoreAway: mv.scoreAway,
      statsRows: statsRowsFromSheet(mv.stats),
      coins: settlement.grant.coins, gems: 0,
      xp: settlement.grant.xp, trainingXp: settlement.grant.trainingXp,
      quests,
    });
  };

  /** Addendum 4: Match End ratings from the real stats sheet + goal log. */
  const ratingsForMatchEnd = (mv: MatchView) => {
    const ids = scrimmageRef.current?.renderState.playerTemplateIds ?? [];
    return computeMatchRatings(ids, mv.stats, mv.scoreHome, mv.scoreAway);
  };

  const finalizeFriendly = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const mv = matchRef.current?.view;
    if (!sess || sess.kind !== "FRIENDLY" || !prof || !mv) return;
    finalizedSessionRef.current = sess.id;
    const result = mv.scoreHome > mv.scoreAway ? "WIN" : mv.scoreHome === mv.scoreAway ? "DRAW" : "LOSS";
    const grant = result === "WIN"
      ? { coins: 1200, gems: 0, xp: 150, trainingXp: 60, fans: 0 }
      : result === "DRAW"
        ? { coins: 600, gems: 0, xp: 100, trainingXp: 40, fans: 0 }
        : { coins: 300, gems: 0, xp: 60, trainingXp: 25, fans: 0 };
    const facts: SessionFacts = {
      played: true, goalsScored: mv.scoreHome, cleanSheet: mv.scoreAway === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: result === "WIN",
    };
    const { next, quests } = applyModeRewards(prof, grant, facts);
    // Epic P1-4: if this friendly was the next International Cup fixture,
    // the result counts in the cup — group table, knockouts, champion.
    let finalNext = next;
    let cupNote: string | null = null;
    if (sess.nationCode && prof.worldCup && worldCupNextOpponent(prof.worldCup) === sess.nationCode) {
      const wc = applyWorldCupResult(next, mv.scoreHome, mv.scoreAway, Date.now());
      finalNext = wc.profile;
      if (wc.summary) cupNote = wc.summary;
    }
    // Epic fix round (P2-20): a Career fixture writes into the league
    // table (the rest of the round is simulated from real club OVRs) and
    // pays the career matchday grant; a finished season can be advanced
    // from the Play Modes career card.
    let careerNote: string | null = null;
    if (sess.careerFixture && finalNext.career) {
      const fixture = nextUserFixture(finalNext.career);
      const userIsHome = fixture ? fixture.homeId === CAREER_USER_ID : true;
      const outcome = recordCareerResult(
        finalNext.career,
        userIsHome ? mv.scoreHome : mv.scoreAway,
        userIsHome ? mv.scoreAway : mv.scoreHome,
        mulberry32(Date.now() & 0xffffff),
      );
      const withGrant = applyModeRewards({ ...finalNext, career: outcome.career }, outcome.grant, NO_FACTS).next;
      finalNext = withGrant;
      careerNote = outcome.seasonOver
        ? (outcome.champion
          ? `🏆 LEAGUE CHAMPIONS! Season ${outcome.career.season} is yours — advance to next season from Play Modes.`
          : `Season ${outcome.career.season} complete — advance to next season from Play Modes.`)
        : "Result recorded on the Career league table.";
    }
    commitProfile(finalNext);
    const vsClub = Boolean(sess.clubId);
    setMatchEnd({
      modeLabel: careerNote ? t('end.mCareer') : cupNote ? t('end.mCup') : vsClub ? t('end.mClubFriendly') : t('end.mIntlFriendly'),
      title: result === "WIN" ? (vsClub ? t('end.tBigClub') : t('end.tIntlGlory')) : result === "DRAW" ? t('matchEnd.draw') : t('end.tBeatenNight'),
      message: (result === "WIN"
        ? t('end.frWin', { name: sess.opponentName })
        : result === "DRAW"
          ? t('end.frDraw', { name: sess.opponentName })
          : t('end.frLoss', { name: sess.opponentName })) + (cupNote ? ` 🏆 ${cupNote}` : "") + (careerNote ? ` ${careerNote}` : ""),
      homeLabel: cupNote ? (getNationalTeam(prof.worldCup?.userCode ?? "")?.name ?? prof.clubName) : prof.clubName, awayLabel: sess.opponentName,
      scoreHome: mv.scoreHome, scoreAway: mv.scoreAway,
      statsRows: statsRowsFromSheet(mv.stats),
      ratings: ratingsForMatchEnd(mv),
      coins: grant.coins, gems: 0,
      xp: grant.xp, trainingXp: grant.trainingXp,
      quests,
    });
  };

  const finalizeClassicMatch = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const mv = matchRef.current?.view;
    if (!sess || sess.kind !== "MATCH" || !prof || !mv) return;
    finalizedSessionRef.current = sess.id;
    const result = mv.scoreHome > mv.scoreAway ? "WIN" : mv.scoreHome === mv.scoreAway ? "DRAW" : "LOSS";
    const grant = result === "WIN"
      ? { coins: 800, gems: 0, xp: 120, trainingXp: 50, fans: 0 }
      : result === "DRAW"
        ? { coins: 400, gems: 0, xp: 90, trainingXp: 35, fans: 0 }
        : { coins: 200, gems: 0, xp: 60, trainingXp: 20, fans: 0 };
    const facts: SessionFacts = {
      played: true, goalsScored: mv.scoreHome, cleanSheet: mv.scoreAway === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: result === "WIN",
    };
    const { next, quests } = applyModeRewards(prof, grant, facts);
    commitProfile(next);
    setMatchEnd({
      modeLabel: t('end.mFullMatch'),
      title: result === "WIN" ? t('matchEnd.victory') : result === "DRAW" ? t('matchEnd.draw') : t('matchEnd.defeat'),
      message: result === "WIN"
        ? t('end.clWin', { name: sess.opponentName })
        : result === "DRAW"
          ? t('end.clDraw', { name: sess.opponentName })
          : t('end.clLoss', { name: sess.opponentName }),
      homeLabel: prof.clubName, awayLabel: sess.opponentName,
      scoreHome: mv.scoreHome, scoreAway: mv.scoreAway,
      statsRows: statsRowsFromSheet(mv.stats),
      ratings: ratingsForMatchEnd(mv),
      coins: grant.coins, gems: 0,
      xp: grant.xp, trainingXp: grant.trainingXp,
      quests,
    });
  };

  const finalizeTournament = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const mv = matchRef.current?.view;
    if (!sess || sess.kind !== "TOURNAMENT" || !prof || !mv || !prof.tournament) return;
    finalizedSessionRef.current = sess.id;
    const homeIsUser = sess.tournamentTieHomeIsUser ?? true;
    const pens = mv.shootout && mv.shootout.kicksTakenHome + mv.shootout.kicksTakenAway > 0
      ? {
          pensHome: homeIsUser ? mv.shootout.homeScore : mv.shootout.awayScore,
          pensAway: homeIsUser ? mv.shootout.awayScore : mv.shootout.homeScore,
        }
      : { pensHome: null, pensAway: null };
    const result = {
      homeGoals: homeIsUser ? mv.scoreHome : mv.scoreAway,
      awayGoals: homeIsUser ? mv.scoreAway : mv.scoreHome,
      ...pens,
    };
    const userOvr = profileTeamOvr(prof);
    const nextCup = recordUserTieResult(prof.tournament, result, userOvr, mulberry32(Date.now() & 0xffffff));
    const userWonTie = mv.scoreHome > mv.scoreAway
      || (mv.scoreHome === mv.scoreAway && (mv.shootout ? mv.shootout.homeScore > mv.shootout.awayScore : false));
    const isChampion = nextCup.status === "CHAMPION" && !prof.tournament.rewardsGranted;
    let withCup: SaveProfile = { ...prof, tournament: nextCup };
    let packName: string | undefined;
    let packOvr: number | undefined;
    let bonusCoins = 0;
    let bonusGems = 0;
    if (isChampion) {
      const tpl = championPackTemplate(withCup);
      bonusCoins = CHAMPION_COINS;
      bonusGems = CHAMPION_GEMS;
      if (tpl) {
        packName = tpl.name;
        packOvr = tpl.baseOvr;
        withCup = {
          ...withCup,
          managerTrophies: withCup.managerTrophies + 1,
          tournament: { ...nextCup, rewardsGranted: true },
          inventory: [...withCup.inventory, {
            instanceId: `card_cup_${tpl.id}_${Date.now().toString(36)}`,
            templateId: tpl.id, trainingLevel: 0, trainingXp: 0, rank: 0,
            skillPoints: { dexterity: 0, shooting: 0, passing: 0, defending: 0, physical: 0, gkDivingFocus: 0 },
            locked: false,
          }],
        };
      }
    }
    const tieGrant = {
      coins: (userWonTie ? 1500 : 500) + bonusCoins,
      gems: bonusGems,
      xp: userWonTie ? 200 : 100,
      trainingXp: 80,
      fans: 0,
    };
    const facts: SessionFacts = {
      played: true, goalsScored: mv.scoreHome, cleanSheet: mv.scoreAway === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: userWonTie,
    };
    const { next, quests } = applyModeRewards(withCup, tieGrant, facts);
    commitProfile(next);
    const roundLabel = roundName(sess.tournamentRound ?? 0);
    setMatchEnd({
      modeLabel: `${t('end.mCupBracket')} · ${roundLabel}`,
      title: isChampion ? t('end.tCupChamps') : userWonTie ? t('end.tThrough') : t('end.tKnockedOut'),
      message: isChampion
        ? t('end.cupWin')
        : userWonTie
          ? t('end.cupThrough', { round: (sess.tournamentRound ?? 0) + 1 <= 3 ? roundName((sess.tournamentRound ?? 0) + 1) : t('end.nextRound') })
          : t('end.cupOut'),
      homeLabel: prof.clubName, awayLabel: sess.opponentName,
      scoreHome: mv.scoreHome, scoreAway: mv.scoreAway,
      statsRows: statsRowsFromSheet(mv.stats),
      coins: tieGrant.coins, gems: tieGrant.gems,
      xp: tieGrant.xp, trainingXp: tieGrant.trainingXp,
      tournament: { roundLabel, champion: isChampion, packCardName: packName, packCardOvr: packOvr },
      quests,
    });
  };

  const finalizeVsa = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const engine = vsaRef.current;
    if (!sess || sess.kind !== "VSA" || !prof || !engine) return;
    finalizedSessionRef.current = sess.id;
    const v = engine.view;
    const settlement = settleVsa(v.userGoals, v.oppGoals);
    const facts: SessionFacts = {
      played: true, goalsScored: v.userGoals, cleanSheet: v.oppGoals === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: settlement.result === "WIN",
    };
    const { next, quests } = applyModeRewards(prof, settlement.grant, facts);
    commitProfile(next);
    engine.dispose();
    setMatchEnd({
      modeLabel: t('end.mVsa'),
      title: settlement.result === "WIN" ? t('end.tBlitzWon') : settlement.result === "DRAW" ? t('end.tDeadHeat') : t('end.tBlitzLost'),
      message: settlement.result === "WIN"
        ? t('end.vsaWin')
        : settlement.result === "DRAW"
          ? t('end.vsaDraw')
          : t('end.vsaLoss'),
      homeLabel: prof.clubName, awayLabel: sess.opponentName,
      scoreHome: v.userGoals, scoreAway: v.oppGoals,
      statsRows: [
        { label: "Chances played", home: String(v.chanceNumber), away: String(v.ticker.length) },
        { label: "Shots", home: String(v.userShots), away: "—" },
        { label: "Great chance goals", home: String(v.goalsByQuality.GREAT), away: "—" },
        { label: "Good chance goals", home: String(v.goalsByQuality.GOOD), away: "—" },
        { label: "Basic chance goals", home: String(v.goalsByQuality.BASIC), away: "—" },
      ],
      coins: settlement.grant.coins, gems: 0,
      xp: settlement.grant.xp, trainingXp: settlement.grant.trainingXp,
      fansDelta: settlement.fansDelta, fansTotal: next.vsaFans,
      quests,
    });
  };

  const finalizeSkill = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const engine = skillRef.current;
    if (!sess || sess.kind !== "SKILL" || !prof || !engine || !sess.skillGameId) return;
    finalizedSessionRef.current = sess.id;
    const v = engine.view;
    const def = skillGameDef(sess.skillGameId);
    const { stars, grant: rawGrant } = skillRewards(def, v.score);
    // Epic fix round (P0-5): the daily skill-reward cap — 5 completions at
    // full coins, the next 5 at half, then coins stop (stars/records and
    // XP still count, so the arena never feels dead).
    const cap = skillCapFor(prof, Date.now());
    const grant = { ...rawGrant, coins: Math.round(rawGrant.coins * cap.coinScale) };
    const prevStars = prof.skillStars?.[def.id] ?? 0;
    const prevBest = prof.skillBestScores?.[def.id] ?? 0;
    const withRecords: SaveProfile = {
      ...prof,
      skillStars: { ...(prof.skillStars ?? {}), [def.id]: Math.max(prevStars, stars) },
      skillBestScores: { ...(prof.skillBestScores ?? {}), [def.id]: Math.max(prevBest, v.score) },
      skillDaily: cap.skillDaily,
    };
    const facts: SessionFacts = {
      played: true, goalsScored: 0, cleanSheet: false, h2hWin: false, skillGamePlayed: true,
    };
    const { next, quests } = applyModeRewards(withRecords, grant, facts);
    commitProfile(next);
    engine.dispose();
    const capNote = cap.coinScale === 0.5
      ? t('end.capHalf')
      : cap.coinScale === 0
        ? t('end.capZero')
        : "";
    setMatchEnd({
      modeLabel: t('end.mSkill'),
      title: stars >= 3 ? t('end.tThreeStar') : stars === 2 ? t('end.tTwoStar') : stars === 1 ? t('end.tOneStar') : t('end.tNoStar'),
      message: (stars > prevStars
        ? t('end.skillBest', { name: def.name, stars })
        : t('end.skillDone', { name: def.name, pts: def.starThresholds[0] ?? 0 })) + capNote,
      homeLabel: def.name, awayLabel: t('end.arenaTarget'),
      scoreHome: v.score, scoreAway: def.starThresholds[2],
      statsRows: [
        { label: "Your score", home: formatNumber(v.score), away: "—" },
        { label: "1★ target", home: String(def.starThresholds[0]), away: "—" },
        { label: "2★ target", home: String(def.starThresholds[1]), away: "—" },
        { label: "3★ target", home: String(def.starThresholds[2]), away: "—" },
      ],
      coins: grant.coins, gems: 0, xp: grant.xp, trainingXp: grant.trainingXp,
      skill: {
        gameName: def.name, score: v.score, stars,
        bestStars: Math.max(prevStars, stars), thresholds: def.starThresholds,
      },
      quests,
    });
  };

  const finalizeAttack = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const engine = attackRef.current;
    if (!sess || sess.kind !== "ATTACK" || !prof || !engine) return;
    finalizedSessionRef.current = sess.id;
    const v = engine.view;
    const settlement = settleAttack(v.points, v.goals);
    const prevBest = prof.attackBest ?? 0;
    const withRecord: SaveProfile = { ...prof, attackBest: Math.max(prevBest, v.points) };
    const facts: SessionFacts = {
      played: true, goalsScored: v.goals, cleanSheet: false,
      h2hWin: false, skillGamePlayed: false, matchWin: v.goals >= 5,
    };
    const { next, quests } = applyModeRewards(withRecord, settlement.grant, facts);
    commitProfile(next);
    engine.dispose();
    setMatchEnd({
      modeLabel: t('end.mAttack'),
      title: v.points > prevBest && prevBest > 0 ? t('end.tAttackRecord') : v.goals >= 5 ? t('end.tRuthless') : t('end.tChancesDone'),
      message: `${t('end.atkMsg', { rating: ratingText(settlement.rating), goals: v.goals, total: v.roundsTotal, points: formatNumber(v.points) })}${v.points > prevBest ? t('end.newBestSuffix') : t('end.bestSuffix', { best: formatNumber(Math.max(prevBest, v.points)) })}`,
      homeLabel: prof.clubName, awayLabel: t('end.finalThird'),
      scoreHome: v.goals, scoreAway: v.roundsTotal - v.goals,
      statsRows: [
        { label: "Points", home: formatNumber(v.points), away: `Best ${formatNumber(Math.max(prevBest, v.points))}` },
        { label: "Goals", home: String(v.goals), away: `of ${v.roundsTotal} chances` },
        { label: "Shots", home: String(v.shots), away: "—" },
        { label: "Conversion", home: v.shots > 0 ? `${Math.round((v.goals / v.shots) * 100)}%` : "—", away: "—" },
      ],
      coins: settlement.grant.coins, gems: settlement.grant.gems,
      xp: settlement.grant.xp, trainingXp: settlement.grant.trainingXp,
      quests,
    });
  };

  const finalizeDefend = () => {
    const sess = sessionRef.current;
    const prof = metaStore.getState().profile;
    const engine = defendRef.current;
    if (!sess || sess.kind !== "DEFEND" || !prof || !engine) return;
    finalizedSessionRef.current = sess.id;
    const v = engine.view;
    const settlement = settleDefend(v.points, v.conceded, v.ballsWon, v.saves);
    const prevBest = prof.defendBest ?? 0;
    const withRecord: SaveProfile = { ...prof, defendBest: Math.max(prevBest, v.points) };
    const facts: SessionFacts = {
      played: true, goalsScored: 0, cleanSheet: v.conceded === 0,
      h2hWin: false, skillGamePlayed: false, matchWin: v.conceded <= 1,
    };
    const { next, quests } = applyModeRewards(withRecord, settlement.grant, facts);
    commitProfile(next);
    engine.dispose();
    setMatchEnd({
      modeLabel: t('end.mDefend'),
      title: v.conceded === 0 ? t('end.tWall') : v.points > prevBest && prevBest > 0 ? t('end.tDefendRecord') : t('end.tWavesSurvived'),
      message: `${t('end.defMsg', { rating: ratingText(settlement.rating), conceded: v.conceded, total: v.wavesTotal, points: formatNumber(v.points) })}${v.points > prevBest ? t('end.newBestSuffix') : t('end.bestSuffix', { best: formatNumber(Math.max(prevBest, v.points)) })}`,
      homeLabel: prof.clubName, awayLabel: t('end.theWaves'),
      scoreHome: v.wavesTotal - v.conceded, scoreAway: v.conceded,
      statsRows: [
        { label: "Points", home: formatNumber(v.points), away: `Best ${formatNumber(Math.max(prevBest, v.points))}` },
        { label: "Waves stopped", home: String(v.wavesTotal - v.conceded), away: `of ${v.wavesTotal}` },
        { label: "Balls won", home: String(v.ballsWon), away: "—" },
        { label: "Keeper saves", home: String(v.saves), away: "—" },
        { label: "Goals conceded", home: String(v.conceded), away: "—" },
      ],
      coins: settlement.grant.coins, gems: settlement.grant.gems,
      xp: settlement.grant.xp, trainingXp: settlement.grant.trainingXp,
      quests,
    });
  };

  const finalizeRef = useRef({ vsa: finalizeVsa, skill: finalizeSkill, attack: finalizeAttack, defend: finalizeDefend });
  finalizeRef.current = { vsa: finalizeVsa, skill: finalizeSkill, attack: finalizeAttack, defend: finalizeDefend };

  /** Match End "Play again": relaunch the same mode (next cup tie if any). */
  const playAgain = () => {
    const sess = sessionRef.current;
    setMatchEnd(null);
    if (!sess) { setTab("modes"); return; }
    if (sess.kind === "H2H") rematchH2h();
    else if (sess.kind === "VSA") launchVsa();
    else if (sess.kind === "ATTACK") launchAttack();
    else if (sess.kind === "DEFEND") launchDefend();
    else if (sess.kind === "MANAGER") launchManager();
    else if (sess.kind === "SKILL" && sess.skillGameId) launchSkill(sess.skillGameId);
    else if (sess.kind === "TOURNAMENT") {
      const prof = metaStore.getState().profile;
      if (prof?.tournament && nextUserTie(prof.tournament)) playTournamentTie();
      else setTab("modes");
    }
    else if (sess.kind === "FRIENDLY" && sess.nationCode) {
      const nation = getNationalTeam(sess.nationCode);
      if (nation) launchFriendly(nation);
      else setTab("nations");
    }
    else if (sess.kind === "FRIENDLY" && sess.clubId) {
      const team = getClubTeam(sess.clubId);
      if (team) launchClubFriendly(team);
      else setTab("clubs");
    }
    else if (sess.kind === "MATCH") beginClassicMode("MATCH");
  };

  // --- Phase 06: stadium audio director + commentary ticker ------------------
  useEffect(() => {
    stadiumAudio.install();
    // Epic fix round (P0-7): debounced cloud auto-backup on profile change
    // plus a flush whenever the app hides or closes.
    installAutoBackupHooks();
    const offLines = stadiumAudio.commentary.subscribe((lines) => {
      // Cycle-2: the ticker renders the Bengali line in বাংলা mode (the
      // voice rules live in CommentaryEngine.speak); minute stamps use
      // the active locale's digits.
      const bn = settingsStore.getState().language === "bn";
      setCommentaryLines(lines.map((l) => {
        const text = bn && l.bnText ? l.bnText : l.text;
        return l.atMinute > 0 ? `${formatNumber(l.atMinute)}' ${text}` : text;
      }));
    });
    return () => {
      offLines();
      stadiumAudio.uninstall();
    };
  }, []);

  // Epic fix round (P0-11): instant ATTACK/DEFEND flip on the real
  // possession event (the overlay also honours a 150 ms tap-grace window).
  useEffect(() => {
    const off = matchEventBus.on("POSSESSION_CHANGED", (p) => setPossessionSide(p.side));
    return off;
  }, []);

  // Sleek glass UI clicks on real buttons (never on the touch controls).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest("button")) return;
      if (t.closest('[aria-label="Touch controls"]')) return;
      stadiumAudio.uiClick();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  // --- Phase 06: pause menu, substitutions, forfeit ---------------------------
  const openPause = () => {
    if (playModeRef.current === "PRACTICE") {
      setPracticeOn(false);
      return;
    }
    // Phase 08: blitz / skill sessions pause in place (no stats modal).
    if (playModeRef.current === "VSA" || playModeRef.current === "SKILL") {
      setScrimmagePaused(true);
      return;
    }
    setScrimmagePaused(true);
    setPauseOpen(true);
  };
  const resumeMatch = () => {
    setPauseOpen(false);
    if (playModeRef.current === "PRACTICE") setPracticeOn(true);
    else setScrimmagePaused(false);
  };
  const handlePauseButton = () => {
    if (playMode === "PRACTICE") {
      setPracticeOn((v) => !v);
      return;
    }
    if (playMode === "VSA" || playMode === "SKILL") {
      setScrimmagePaused((v) => !v);
      return;
    }
    if (pauseOpen) resumeMatch();
    else openPause();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pauseOpen) resumeMatch();
      else if (tab === "stadium") openPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseOpen, tab]);

  const handleSubstitute = (teamIndex: number, benchIndex: number): string => {
    const sc = scrimmageRef.current;
    if (!sc) return "Substitution unavailable right now.";
    const out = sc.hudPlayers()[teamIndex];
    const inn = sc.benchInfo()[benchIndex];
    if (!out || !inn) return "That substitution could not be made.";
    const ok = sc.substitute(teamIndex, benchIndex);
    if (!ok) return "Substitution refused — the 5-sub limit is reached or the player is unavailable.";
    setSubTick((t) => t + 1);
    const fresh = sc.hudPlayers()[teamIndex];
    return `${inn.name} on for ${out.name} — fresh legs at ${Math.round((fresh?.stamina01 ?? 1) * 100)}% stamina. The 3D rig has updated.`;
  };

  const forfeitMatch = () => {
    if (MATCH_FAMILY.includes(playMode)) matchRef.current?.forfeit();
    setPauseOpen(false);
    setScrimmagePaused(false);
    showBannerRef.current({ kind: "INFO", title: "Match Forfeited", sub: "The current score stands as the result." });
  };

  // Penalty banner + half-time whistle on match-state transitions.
  const prevMatchStateRef = useRef<string | null>(null);
  useEffect(() => {
    const st = matchView?.state;
    if (!st || st === prevMatchStateRef.current) return;
    prevMatchStateRef.current = st;
    if (st === "PENALTY_KICK") {
      showBannerRef.current({ kind: "PENALTY", title: "Penalty!", sub: matchView?.message ?? "Spot kick awarded." });
    }
    if (st === "HALF_TIME") stadiumAudio.whistle("HALF_TIME");
    if (st === "FULL_TIME" && matchView) {
      showBannerRef.current(
        { kind: "INFO", title: t('hud.fullTime'), sub: `${matchView.scoreHome} – ${matchView.scoreAway}` },
        6000,
      );
    }
  }, [matchView]);

  // Phase 08: a mode session's match reaching FULL_TIME settles the session
  // (ladder stars, cup bracket, rewards) exactly once and opens Match End.
  useEffect(() => {
    if (matchView?.state !== "FULL_TIME") return;
    const sess = sessionRef.current;
    if (!sess || finalizedSessionRef.current === sess.id) return;
    if (sess.kind === "H2H") finalizeH2h();
    else if (sess.kind === "MANAGER") finalizeManager();
    else if (sess.kind === "TOURNAMENT") finalizeTournament();
    else if (sess.kind === "FRIENDLY") finalizeFriendly();
    else if (sess.kind === "MATCH") finalizeClassicMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchView]);

  // Wet pitch physics follows the Night Rain weather preset (and the
  // Phase 10 weather gate: effects off → never wet).
  useEffect(() => {
    if (practiceRef.current) practiceRef.current.wet = effectiveWeather === "NIGHT_RAIN";
    if (scrimmageRef.current) scrimmageRef.current.wet = effectiveWeather === "NIGHT_RAIN";
    // Epic fix round (P1-13): the ambience bed follows the same preset —
    // rain layer under Night Rain, floodlight hum at night, plain day bed
    // otherwise.
    stadiumAudio.setAmbienceWeather(
      effectiveWeather === "NIGHT_RAIN" ? "RAIN"
        : effectiveWeather === "DAY_CLEAR" || effectiveWeather === "SUNSET" ? "DAY"
          : "NIGHT",
    );
  }, [effectiveWeather]);

  // Phase 10 settings wiring: default weather drives the stadium preset, and
  // the auto-switch mode drives the scrimmage engine's control switching.
  useEffect(() => { setWeather3d(defaultWeather); }, [defaultWeather]);
  useEffect(() => {
    if (scrimmageRef.current) scrimmageRef.current.autoSwitchMode = autoSwitch;
  }, [autoSwitch]);

  // Phase 10: keep the screen awake while a match is on screen (Screen Wake
  // Lock API — silently skipped where unsupported, e.g. desktop browsers
  // without a user gesture).
  useEffect(() => {
    if (tab !== "stadium" || scrimmagePaused) return;
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock) {
      void nav.wakeLock.request("screen").then((l) => {
        if (released) { void l.release(); return; }
        lock = l;
      }).catch(() => { /* not allowed right now — play continues without it */ });
    }
    return () => {
      released = true;
      if (lock) void lock.release().catch(() => { /* already released */ });
    };
  }, [tab, scrimmagePaused]);

  // Phase 10: portrait detection for the landscape prompt on narrow phones.
  const [portraitNarrow, setPortraitNarrow] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 640px)");
    const apply = () => setPortraitNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Phase 04 live controls → scrimmage engine.
  useEffect(() => { scrimmageRef.current?.setDifficulty(difficulty); }, [difficulty]);
  useEffect(() => { scrimmageRef.current?.setMentality(mentality); }, [mentality]);
  useEffect(() => { scrimmageRef.current?.setTactics(tactics); }, [tactics]);
  // Phase 07: the saved Ultimate Team IS the HOME team. Whenever the squad,
  // formation or any card's training/rank/skill points change, rebuild the
  // engine's HOME XI from the upgraded templates so 3D matches simulate the
  // exact players the manager built. The signature guard prevents rebuilds on
  // unrelated profile writes.
  const squadSignature = useMemo(() => {
    if (!profile) return "";
    const inv = profile.inventory
      .map((c) => `${c.instanceId}:${c.rank}:${c.trainingLevel}:${c.trainingXp}:${Object.values(c.skillPoints).reduce((a, b) => a + b, 0)}`)
      .join(",");
    return [profile.activeFormationId, profile.startingXI.join(","), profile.substitutes.join(","), inv].join("|");
  }, [profile]);
  const appliedSquadSigRef = useRef("");
  useEffect(() => {
    if (!profile || !squadSignature || appliedSquadSigRef.current === squadSignature) return;
    appliedSquadSigRef.current = squadSignature;
    const sc = scrimmageRef.current;
    if (!sc) return;
    sc.setFormation(profile.activeFormationId);
    const { xi, bench } = buildMatchTemplates(profile);
    sc.applyHomeSquad(xi, bench);
  }, [profile, squadSignature]);

  // EventBus diagnostics feed.
  useEffect(() => {
    const stamp = (label: string) => {
      setEventLog((prev) => [`${new Date().toLocaleTimeString()} — ${label}`, ...prev].slice(0, 6));
    };
    const offs = [
      matchEventBus.on("MATCH_KICKOFF", (p) => stamp(`MATCH_KICKOFF · period ${p.period}`)),
      matchEventBus.on("BALL_KICKED", (p) => stamp(`BALL_KICKED · power ${p.power.toFixed(2)} · ${p.shotType}${p.isShot ? " (shot)" : ""}`)),
      matchEventBus.on("POST_HIT", (p) => stamp(`POST_HIT · ${p.speed.toFixed(1)} m/s`)),
      matchEventBus.on("GOAL_SCORED", (p) => stamp(`GOAL_SCORED · ${p.scoringSide} · xG ${p.xg.toFixed(2)} · ${p.minute}'`)),
      matchEventBus.on("GK_SAVE", (p) => stamp(`GK_SAVE · difficulty ${p.difficulty.toFixed(2)}${p.isParry ? " · parried" : ""}`)),
      matchEventBus.on("OFFSIDE_CALLED", (p) => stamp(`OFFSIDE_CALLED · line x ${p.offsideLineX.toFixed(1)} · attacker x ${p.attackerX.toFixed(1)}`)),
      matchEventBus.on("FOUL_COMMITTED", (p) => stamp(`FOUL_COMMITTED · card ${p.card}${p.isPenalty ? " · PENALTY" : ""}`)),
      matchEventBus.on("CROWD_EXCITEMENT", (p) => stamp(`CROWD_EXCITEMENT · ${(p.level * 100).toFixed(0)}%`)),
      // Phase 06: broadcast banners + the active bar's last-shot power.
      matchEventBus.on("BALL_KICKED", (p) => {
        if (p.isShot) lastShotPowerRef.current = p.power;
      }),
      matchEventBus.on("GOAL_SCORED", (p) => {
        const scorerTpl = getPlayerById(p.scorerId) ?? null;
        const scorer = scorerTpl?.name ?? "Scorer";
        // Epic P0-5: the celebration camera actually starts — swing to the
        // CELEBRATION camera for the goal window, then hand the user's own
        // camera back for the replay and the restart.
        setCamera3d((prev) => {
          cameraBeforeGoalRef.current = prev === "CELEBRATION" ? cameraBeforeGoalRef.current : prev;
          return "CELEBRATION";
        });
        if (celebrationCamTimerRef.current) window.clearTimeout(celebrationCamTimerRef.current);
        celebrationCamTimerRef.current = window.setTimeout(() => {
          setCamera3d(cameraBeforeGoalRef.current ?? "BROADCAST");
        }, 2600);
        const minute = playModeRef.current === "MATCH" ? (matchRef.current?.view.minute ?? p.minute) : p.minute;
        showBannerRef.current({
          kind: "GOAL",
          title: `GOAL! ${scorer}`,
          sub: `${minute}' · xG ${p.xg.toFixed(2)} · ${p.shotType.replace(/_/g, " ")} · ${p.scoringSide} score`,
        }, 4600);
        // Celebration beat (checker fix 4): a short full-screen theatre
        // moment on top of the banner + slow-mo replay — scorer portrait,
        // confetti, big GOAL typography — for real match modes only.
        const pm = playModeRef.current;
        if (pm === "MATCH" || pm === "H2H" || pm === "TOURNAMENT" || pm === "MANAGER" || pm === "FRIENDLY") {
          const prof = metaStore.getState().profile;
          const sess = sessionRef.current;
          const kit: KitColors = p.scoringSide === "HOME"
            ? {
              primary: prof?.clubPrimaryColor ?? "#16a34a", secondary: prof?.clubSecondaryColor ?? "#ffffff",
              shorts: "#0f172a", socks: prof?.clubPrimaryColor ?? "#16a34a",
            }
            : {
              primary: sess?.opponentPrimary ?? "#38bdf8", secondary: sess?.opponentSecondary ?? "#0f172a",
              shorts: "#f8fafc", socks: sess?.opponentPrimary ?? "#38bdf8",
            };
          setGoalBeat({
            id: Date.now() + Math.random(), scorer, template: scorerTpl,
            side: p.scoringSide, minute, kit,
          });
          if (goalBeatTimerRef.current) window.clearTimeout(goalBeatTimerRef.current);
          goalBeatTimerRef.current = window.setTimeout(() => setGoalBeat(null), 3400);
        }
      }),
      matchEventBus.on("OFFSIDE_CALLED", (p) => {
        showBannerRef.current({
          kind: "OFFSIDE",
          title: "Offside",
          sub: `${getPlayerById(p.offendingPlayerId)?.name ?? "Attacker"} was beyond the last line — free kick the other way.`,
        });
      }),
      matchEventBus.on("FOUL_COMMITTED", (p) => {
        if (p.card === "NONE") return;
        showBannerRef.current({
          kind: p.card,
          title: p.card === "RED" ? "Red Card!" : "Yellow Card",
          sub: getPlayerById(p.foulerId)?.name ?? "",
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Bottom-bar badges: real claimable counts, computed from the live profile.
  const claimableQuestCount = profile
    ? [...dailyQuests(), ...weeklyQuests()].filter((q) => questComplete(profile, q) && !questProgressOf(profile, q.id).claimed).length
      + SEASON_PASS_TIERS.filter((t) => profile.seasonPassXp >= t.xpRequired && !profile.seasonPassClaimedTiers.includes(t.tier)).length
    : 0;
  const freePackReady = profile ? freePackCooldownMs(profile, Date.now()) <= 0 : false;

  const teamOvr = profile ? profileTeamOvr(profile) : 0;
  const xiCount = profile ? profile.startingXI.filter(Boolean).length : 0;
  const subCount = profile ? profile.substitutes.filter(Boolean).length : 0;

  const zeroVec = createVec3(0, 0, 0);
  const zeroGuardOk = normalizeSafe(zeroVec) === 0 && zeroVec.x === 0 && Number.isFinite(zeroVec.x);

  // Phase 03 shot lab: deterministic trajectories from the real physics code.
  const finesseLab = useMemo(() => (labsArmed ? runShotLab("FINESSE") : null), [labsArmed]);
  const powerLab = useMemo(() => (labsArmed ? runShotLab("POWER") : null), [labsArmed]);
  const chipLab = useMemo(() => (labsArmed ? runShotLab("CHIP") : null), [labsArmed]);

  // Phase 04 AI lab: 60s of headless AI-vs-AI plus a scripted GK shot test,
  // all through the real ScrimmageEngine.
  const aiLab = useMemo(() => (labsArmed ? runAiLab() : null), [labsArmed]);

  // Phase 05 rules lab: full two-half match, offside scenario, DOGSO and
  // penalty-box foul scenarios, shootout — all through the real MatchEngine.
  const rulesLab = useMemo(() => (labsArmed ? runRulesLab() : null), [labsArmed]);

  // Phase 06 labs: pure synth-recipe checks (pink noise, whistle, bus gains,
  // commentary naming) and the real substitution path on a headless engine.
  const audioLab = useMemo(() => (labsArmed ? runAudioLab() : null), [labsArmed]);
  const subLab = useMemo(() => (labsArmed ? runSubstitutionLab() : null), [labsArmed]);

  // Phase 07 labs: progression math (training caps, rank-ups, skill points,
  // upgraded match templates) and squad math (penalty matrix, auto-build,
  // squad→engine bridge) through the real meta services.
  const progressionLab = useMemo(() => (labsArmed ? runProgressionLab() : null), [labsArmed]);
  const squadLab = useMemo(() => (labsArmed ? runSquadLab(generateStarterProfile()) : null), [labsArmed]);

  // Phase 08 labs: the five game modes — ladder/payouts/opponent generator,
  // a headless VS Attack blitz, an AI-vs-AI managed match with live tactics,
  // the full cup bracket (champion + elimination runs) and all four skill
  // games — every one through the real mode engines.
  const h2hLab = useMemo(() => (labsArmed ? runH2hLab() : null), [labsArmed]);
  const vsaLab = useMemo(() => (labsArmed ? runVsaLab() : null), [labsArmed]);
  const managerLab = useMemo(() => (labsArmed ? runManagerLab() : null), [labsArmed]);
  const tournamentLab = useMemo(() => (labsArmed ? runTournamentLab(generateStarterProfile()) : null), [labsArmed]);
  const skillLab = useMemo(() => (labsArmed ? runSkillGamesLab() : null), [labsArmed]);

  // Phase 09 labs: pack RNG + guarantees + cooldown, market drift/buy/sell
  // with the 90% tax payout, and quest tracking/claims/pass/resets — all
  // through the real meta services on synthetic profiles.
  const dailyLab = useMemo(() => (labsArmed ? runDailyRewardLab() : null), [labsArmed]);
  const clubsLab = useMemo(() => (labsArmed ? runClubsLab() : null), [labsArmed]);
  const nationsLab = useMemo(() => (labsArmed ? runNationsLab() : null), [labsArmed]);
  const autoSwitchLab = useMemo(() => (labsArmed ? runAutoSwitchLab() : null), [labsArmed]);
  const matchUpLab = useMemo(() => (labsArmed ? runMatchUpLab() : null), [labsArmed]);
  const attackLab = useMemo(() => (labsArmed ? runAttackLab() : null), [labsArmed]);
  const defendLab = useMemo(() => (labsArmed ? runDefendLab() : null), [labsArmed]);
  const packLab = useMemo(() => (labsArmed ? runPackLab() : null), [labsArmed]);
  const marketLab = useMemo(() => (labsArmed ? runMarketLab() : null), [labsArmed]);
  const questLab = useMemo(() => (labsArmed ? runQuestLab() : null), [labsArmed]);

  // Epic fix round labs: shards/exchange, skill cap, auto-backup, the
  // commentary queue, the MatchPlan brain, perf telemetry math, stadium
  // ambience, the H2H season clock, the event loop, the career spine and
  // Play-as-Club XI validity — all through the real services.
  const shardLab = useMemo(() => (labsArmed ? runShardLab() : null), [labsArmed]);
  const exchangeLab = useMemo(() => (labsArmed ? runExchangeLab() : null), [labsArmed]);
  const skillCapLab = useMemo(() => (labsArmed ? runSkillCapLab() : null), [labsArmed]);
  const autoBackupLab = useMemo(() => (labsArmed ? runAutoBackupLab(generateStarterProfile()) : null), [labsArmed]);
  const commentaryLab = useMemo(() => (labsArmed ? runCommentaryLab() : null), [labsArmed]);
  const matchPlanLab = useMemo(() => (labsArmed ? runMatchPlanLab() : null), [labsArmed]);
  const perfLab = useMemo(() => (labsArmed ? runPerfLab() : null), [labsArmed]);
  const ambienceLab = useMemo(() => (labsArmed ? runAmbienceLab() : null), [labsArmed]);
  const h2hSeasonLab = useMemo(() => (labsArmed ? runH2hSeasonLab() : null), [labsArmed]);
  const eventLab = useMemo(() => (labsArmed ? runEventLab() : null), [labsArmed]);
  const careerLab = useMemo(() => (labsArmed ? runCareerLab() : null), [labsArmed]);
  const playAsLab = useMemo(() => (labsArmed ? (() => {
    const bad = ALL_CLUBS.filter((c) => {
      const t = getClubTeam(c.id);
      return !t || t.xi.length !== 11 || t.xi.filter((p) => p.position === "GK").length !== 1;
    }).map((c) => c.name);
    return {
      ok: bad.length === 0,
      detail: bad.length === 0
        ? `all ${ALL_CLUBS.length} clubs field a legal play-as XI (11 players, exactly 1 GK)`
        : `invalid XIs: ${bad.join(", ")}`,
    };
  })() : null), [labsArmed]);

  // Phase 10 Final Bug Audit lab: the cross-phase integrity sweep —
  // (a) no NaN/Infinity anywhere in the 180-player database,
  // (b) no duplicate template IDs, and no duplicate cards in a fresh squad,
  // (c) save JSON round-trips losslessly through the real import parser
  //     (the same code path Settings → Import uses after an F5 refresh),
  // (d) settings persist + parse from LocalStorage,
  // (e) a 30s headless AI-vs-AI edge-case sim: the ball never leaves the
  //     world bounds and no position ever goes non-finite (GK-hold,
  //     throw-in-loop and stuck-ball regressions would surface here).
  const qaLab = useMemo(() => {
    if (!labsArmed) return null;
    const statKeys = Object.keys(players[0]?.subStats ?? {}) as (keyof PlayerTemplate["subStats"])[];
    let statsFinite = players.length === EXPECTED_PLAYER_COUNT;
    for (const p of players) {
      if (!Number.isFinite(p.baseOvr) || !Number.isFinite(p.baseMarketPrice) || p.baseMarketPrice <= 0) statsFinite = false;
      for (const v of Object.values(p.stats)) if (!Number.isFinite(v)) statsFinite = false;
      for (const k of statKeys) if (!Number.isFinite(p.subStats[k])) statsFinite = false;
    }
    const uniqueIds = new Set(players.map((p) => p.id)).size === players.length;
    const starter = generateStarterProfile();
    const xiInstances = starter.startingXI.filter((x): x is string => x !== null);
    const subInstances = starter.substitutes.filter((x): x is string => x !== null);
    const allInstances = [...xiInstances, ...subInstances];
    const squadUnique = new Set(allInstances).size === allInstances.length
      && new Set(starter.inventory.map((c) => c.templateId)).size === starter.inventory.length;
    const roundTripped = parseProfileJson(JSON.stringify(starter));
    const persistenceOk = roundTripped !== null
      && roundTripped.coins === starter.coins
      && roundTripped.inventory.length === starter.inventory.length
      && roundTripped.startingXI.join("|") === starter.startingXI.join("|");
    let settingsOk = true;
    try {
      const raw = localStorage.getItem("striker_fc_settings");
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        settingsOk = typeof parsed === "object" && parsed !== null;
      }
    } catch {
      settingsOk = false;
    }
    const qaEngine = new ScrimmageEngine({ left: null, right: null }, { autonomousHome: true, seed: 4242, difficulty: "SEMI_PRO" });
    const idleInput = new InputManager();
    let simStable = true;
    for (let t = 0; t < 1800; t += 1) {
      qaEngine.step(1 / 60, idleInput);
      if (t % 30 === 0) {
        const rs = qaEngine.renderState;
        if (!Number.isFinite(rs.ballPos.x) || !Number.isFinite(rs.ballPos.y) || !Number.isFinite(rs.ballPos.z)) simStable = false;
        if (Math.abs(rs.ballPos.x) > 62 || Math.abs(rs.ballPos.z) > 44 || rs.ballPos.y > 14) simStable = false;
        for (const p of rs.players) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) simStable = false;
        }
      }
    }
    return { statsFinite, uniqueIds, squadUnique, persistenceOk, settingsOk, simStable };
  }, [labsArmed, players]);

  type CheckItem = { ok: boolean; label: string; detail: string };
  const baseChecks: CheckItem[] = [
    { ok: players.length === EXPECTED_PLAYER_COUNT, label: "Player database loaded", detail: `${players.length} players · originals + real-world stars + club top-ups` },
    { ok: ["rw_messi", "rw_ronaldo", "rw_mbappe"].every((id) => players.some((p) => p.id === id && p.realWorld && p.rarity === "LEGEND")), label: "Real-world Legends gated", detail: "Messi 97 · Ronaldo 96 · Mbappé 96 — Legend Icon Pack only, never on the market" },
    { ok: clubs.length === 41, label: "Clubs loaded", detail: `${clubs.length} clubs · 16 real + 12 original + 13 new original` },
    { ok: formations.length === 10, label: "Formations loaded", detail: `${formations.length} formations` },
    { ok: packs.length === 5, label: "Store packs loaded", detail: `${packs.length} packs` },
    { ok: profileLoaded && xiCount === 11 && subCount === 7, label: "SaveProfile initialized", detail: profileLoaded ? `XI ${xiCount}/11 · Subs ${subCount}/7 · ${storageBackend}` : "loading…" },
    { ok: teamOvr >= 74 && teamOvr <= 82, label: "Starter squad ≈ 78 OVR", detail: `Team OVR ${teamOvr}` },
    { ok: loopRunning, label: "Fixed-timestep loop running", detail: loopRunning ? `1/60s steps · ${formatNumber(tickCount)} ticks` : "starting…" },
    { ok: zeroGuardOk, label: "Zero-vector normalize guard", detail: "normalizeSafe(0,0,0) → 0, no NaN" },
  ];
  // Lab rows exist only once the suites have run (Engine Data tab opened);
  // the guard narrows every lab result to non-null for the row builders.
  const labChecks: CheckItem[] = [];
  if (finesseLab && powerLab && chipLab && aiLab && rulesLab && audioLab && subLab && progressionLab && squadLab && h2hLab && vsaLab && managerLab && tournamentLab && skillLab && packLab && marketLab && questLab && qaLab && dailyLab && clubsLab && nationsLab && autoSwitchLab && matchUpLab && attackLab && defendLab && shardLab && exchangeLab && skillCapLab && autoBackupLab && commentaryLab && matchPlanLab && perfLab && ambienceLab && h2hSeasonLab && eventLab && careerLab && playAsLab) {
    labChecks.push(
    { ok: Math.abs(finesseLab.lateralDrift) > 0.55, label: "Finesse curl (Magnus) verified", detail: `bends ${Math.abs(finesseLab.lateralDrift).toFixed(2)} m in flight` },
    { ok: powerLab.apexY < finesseLab.apexY && powerLab.crossedGoalLine, label: "Power shot dip verified", detail: `low apex ${powerLab.apexY.toFixed(2)} m, still on target` },
    { ok: chipLab.apexY > 2.6, label: "Chip arc verified", detail: `apex ${chipLab.apexY.toFixed(2)} m on backspin lob` },
    { ok: aiLab.allFinite && aiLab.passes >= 4, label: "11v11 lab — flowing AI play", detail: `${aiLab.passes} passes · ${aiLab.shots} shots in 60s AI vs AI` },
    { ok: aiLab.minSameTeamSeparation > 0.9, label: "11v11 lab — no clumping", detail: `min same-team separation ${aiLab.minSameTeamSeparation.toFixed(1)} m` },
    { ok: aiLab.avgShapeError < 6.5, label: "11v11 lab — formation shape held", detail: `avg anchor error ${aiLab.avgShapeError.toFixed(1)} m` },
    { ok: aiLab.maxDefendersNearBall <= 3, label: "11v11 lab — zero ball-swarming", detail: `max ${aiLab.maxDefendersNearBall} defenders within 3 m of the ball` },
    {
      ok: aiLab.gkScenario.shots > 0 && (aiLab.gkScenario.gkDove || aiLab.gkScenario.saves > 0 || aiLab.gkScenario.goals > 0),
      label: "11v11 lab — GK reads the shot",
      detail: `shots ${aiLab.gkScenario.shots} · dive ${aiLab.gkScenario.gkDove ? "yes" : "no"} · saves ${aiLab.gkScenario.saves} · conceded ${aiLab.gkScenario.goals}`,
    },
    { ok: rulesLab.fullMatchCompleted && rulesLab.allFinite, label: "Rules lab — full 2-half match, no soft-lock", detail: `states: ${rulesLab.statesVisited.join(" → ")}` },
    { ok: rulesLab.offsideUnitOk, label: "Offside — frame-of-pass snapshot + exceptions", detail: "line = 2nd-last defender · throw-in exempt" },
    { ok: rulesLab.offsideMatchOk, label: "Offside — live pass flagged in match", detail: "receiver beyond the line at the pass → whistle + VAR line" },
    { ok: rulesLab.dogsoRedOk, label: "Fouls — DOGSO straight red, 10 men", detail: "last-man foul → red card, player exits, free kick" },
    { ok: rulesLab.penaltyBoxOk, label: "Fouls — penalty-box foul → penalty kick", detail: "foul at 45m inside the box area → PENALTY_KICK state" },
    { ok: rulesLab.shootoutOk, label: "Shootout — ABAB, early decision, sudden death", detail: "5 rounds + sudden-death pair verified" },
    { ok: rulesLab.statsValid && rulesLab.passesTracked > 0, label: "Match stats tracker live", detail: `${rulesLab.passesTracked} passes tracked · possession/xG/shot map valid` },
    { ok: rulesLab.replayBufferFrames >= 250, label: "Replay recorder — 300-frame buffer", detail: `${rulesLab.replayBufferFrames} frames buffered @60Hz for 0.45x playback` },
    { ok: audioLab.pinkNoiseOk, label: "Audio lab — pink-noise crowd bed", detail: `dual-bandpass bed · RMS ${audioLab.pinkNoiseRms.toFixed(2)}, all samples finite` },
    { ok: audioLab.whistleOk, label: "Audio lab — pea-whistle recipe", detail: "dual 2780/2845Hz · foul 1 blast · half-time 2 · full-time long-short-long" },
    { ok: audioLab.busGainsOk, label: "Audio lab — Master/SFX/Crowd/UI buses", detail: "bus gains map 1:1 from Settings sliders, clamped 0..1" },
    { ok: audioLab.commentaryOk, label: "Audio lab — commentary names the scorer", detail: audioLab.sampleLine },
    { ok: subLab.ok && subLab.benchSize === 7, label: "Subs lab — fresh legs swap templates", detail: `${subLab.outName} (${Math.round(subLab.staminaBefore * 100)}%) → ${subLab.inName} (${Math.round(subLab.staminaAfter * 100)}%) · rig id swapped` },
    { ok: subLab.capRespected, label: "Subs lab — 5-substitution cap enforced", detail: "the 6th substitution is refused by the engine" },
    { ok: progressionLab.trainingLevelsOk && progressionLab.capGateOk, label: "Progression lab — training gated by rank cap", detail: "rank 0 pours stop exactly at Lv 5; cap rises +5 per rank to Lv 30" },
    { ok: progressionLab.trainingBoostOk && progressionLab.upgradedTemplateOk, label: "Progression lab — upgrades bake into match templates", detail: progressionLab.detail },
    { ok: progressionLab.rankUpOk, label: "Progression lab — token rank-up grants +1 OVR / +1 SP", detail: "rank 0→1 · training cap 5→10 · skill points 0→1 · token consumed" },
    { ok: progressionLab.skillPointOk, label: "Progression lab — skill point adds +4 sub-stats", detail: "Shooting point → Finishing +4 and core SHO +2 in the simulated template" },
    { ok: squadLab.penaltyMatrixOk, label: "Squad lab — out-of-position penalty matrix exact", detail: "exact 0 · alt −2 (−1 at rank 2+) · same group −4 · wrong group −12" },
    { ok: squadLab.autoBuildOk, label: "Squad lab — Auto-Build Best XI maximizes Team OVR", detail: squadLab.detail },
    { ok: squadLab.matchBridgeOk, label: "Squad lab — saved squad bridges into the 3D engine", detail: "buildMatchTemplates yields 11 upgraded templates in formation order" },
    { ok: h2hLab.ladderOk && h2hLab.payoutOk, label: "H2H lab — 15-tier ladder, win pays 2,500→8,000", detail: "Amateur III → FC Champion · draw 1,000 · loss 400 · promotion pays gems" },
    { ok: h2hLab.opponentOk && h2hLab.transitionsOk, label: "H2H lab — OVR-matched opponents, star promotion/relegation", detail: h2hLab.detail },
    { ok: vsaLab.probabilitiesOk, label: "VSA lab — chance table exact (Δ0 = 20/50/30, +5% per OVR)", detail: "Great clamps at 65% · Basic floors at 5%" },
    { ok: vsaLab.engineOk, label: "VSA lab — headless 45s blitz finishes clean", detail: vsaLab.detail },
    { ok: managerLab.completed && managerLab.allFinite, label: "Manager lab — AI vs AI to full time, tactics live", detail: managerLab.detail },
    { ok: tournamentLab.bracketOk && tournamentLab.clubXiOk, label: "Cup lab — 16-club bracket, real club XIs", detail: "15 drawn from all 41 clubs + your club · Dhaka XI all-club" },
    { ok: tournamentLab.championRunOk && tournamentLab.eliminationOk && tournamentLab.rewardsOk, label: "Cup lab — champion run, elimination path, rewards", detail: tournamentLab.detail },
    { ok: skillLab.starsOk && skillLab.gamesOk, label: "Skill lab — all 4 arena games run to FINISHED", detail: skillLab.detail },
    { ok: packLab.goldOk && packLab.fundsOk, label: "Pack lab — Gold Pro charges 15,000c, deals 4 real cards", detail: "insufficient funds refused with no charge · pulls land in inventory" },
    { ok: packLab.evOk, label: "Pack lab — quick-sell EV is 55–80% of every paid coin pack's price", detail: packLab.detail },
    { ok: packLab.pityOk, label: "Pack lab — pity timers force Elite+ at 10 opens, Master+ at 25", detail: "counters live on the profile and reset when the tier lands" },
    { ok: packLab.guaranteeOk && packLab.legendOk, label: "Pack lab — rarity guarantees hold (ELITE / MASTER / LEGEND)", detail: packLab.detail },
    { ok: packLab.cooldownOk && packLab.walkoutOk, label: "Pack lab — Daily Free 24h cooldown + 85+ walkout trigger", detail: "second free open inside 24h refused · Legend pack always walks out" },
    { ok: marketLab.driftOk, label: `Market lab — ±5% drift every 2 min over all ${players.length} prices`, detail: marketLab.detail },
    { ok: marketLab.buyOk && marketLab.sellGuardOk, label: "Market lab — Buy Now delivers instantly, XI/locked sales refused", detail: "exact live price deducted · card in inventory the same tick" },
    { ok: marketLab.saleOk, label: "Market lab — sale completes in 10–25s, claim pays 95%", detail: "5% listing fee · SOLD! inbox claim credits the net payout exactly" },
    { ok: marketLab.quickSellOk, label: "Market lab — quick-sell flat value, gem pulls → XP, Legends unbuyable, 10/day cap", detail: marketLab.detail },
    { ok: questLab.defsOk && questLab.trackerOk, label: "Quest lab — 6 daily + 6 weekly, EventBus auto-tracking", detail: questLab.detail },
    { ok: questLab.claimOk && questLab.resetOk, label: "Quest lab — claims pay once, daily/weekly resets scoped", detail: "double-claim refused · next UTC day clears dailies only · +7d clears weeklies" },
    { ok: questLab.passOk, label: "Star Pass lab — tier claims grant wallet rewards + Tier-20 Legend Pack", detail: "Tier 1 pays 2,000c · Tier 20 opens the Legend Icon Pack into inventory" },
    { ok: qaLab.statsFinite, label: "Final QA — no NaN/Infinity in any player stat", detail: `all ${players.length} players · 6 core + 27 sub-stats + prices audited` },
    { ok: qaLab.uniqueIds && qaLab.squadUnique, label: "Final QA — no duplicate player or squad IDs", detail: `${players.length} unique templates · starter XI + bench instances all distinct` },
    { ok: qaLab.persistenceOk, label: "Final QA — save JSON round-trips losslessly", detail: "export → import parser returns the identical club (the F5-refresh path)" },
    { ok: qaLab.settingsOk, label: "Final QA — settings persist across refreshes", detail: "graphics / audio / controls stored in LocalStorage and re-parsed cleanly" },
    { ok: qaLab.simStable, label: "Final QA — 30s edge-case sim: ball in bounds, all finite", detail: "no stuck ball, no GK-hold or throw-in loop, no position blow-ups" },
    { ok: dailyLab.ok && dailyLab.cycleOk, label: "Daily Rewards lab — 30-day calendar pays exactly, Day 8 never wraps, milestone packs land", detail: dailyLab.detail },
    { ok: clubsLab.countsOk && clubsLab.squadsOk, label: "Clubs lab — 41 clubs load, every squad 16+ strong", detail: clubsLab.detail },
    { ok: clubsLab.xiOk && clubsLab.starsOk && clubsLab.realDepthOk, label: "Clubs lab — every club fields a valid XI of its own; stars at their real clubs; thin clubs carry 11+ real players", detail: "Mbappé/Bellingham/Vinícius → Real Madrid · Haaland → Man City · Salah → Liverpool · Kane → Bayern · Messi → Inter Miami · Ronaldo → Al Nassr" },
    { ok: nationsLab.countOk && nationsLab.xiShapeOk && nationsLab.starsStartOk && nationsLab.captainsOk && nationsLab.numbersOk && nationsLab.bangladeshOk, label: "Nations lab — 32 nations, real stars start, real captains, unique real shirt numbers", detail: nationsLab.detail },
    { ok: autoSwitchLab.defenceOk && autoSwitchLab.passOk, label: "Auto-switch lab — control follows the ball in defence, lands on the receiver in attack", detail: autoSwitchLab.detail },
    { ok: autoSwitchLab.manualOk && autoSwitchLab.userPassOk, label: "Auto-switch lab — MANUAL never drifts, but your own pass always hands control to its receiver", detail: "ground / through / lob / cross receptions all switch at the first touch, in every switch mode" },
    { ok: matchUpLab.switchFlashOk, label: "Switch flash lab — PLAYER_SWITCHED fires on the handover and the ring pulse is live", detail: matchUpLab.detail },
    { ok: matchUpLab.containOk && matchUpLab.chargeOk, label: "Match-up lab — hold TACKLE contains at 0.9 m, release shoulder-charges and wins the ball", detail: matchUpLab.detail },
    { ok: matchUpLab.aiContainOk, label: "Match-up lab — AI pressers contain before they charge (no instant lunges)", detail: matchUpLab.detail },
    { ok: attackLab.engineOk, label: "Attack Mode lab — 8 chances run headless through the real engine and settle", detail: attackLab.detail },
    { ok: defendLab.engineOk, label: "Defend Mode lab — 8 waves run headless through the real engine and settle", detail: defendLab.detail },
    { ok: audioLab.goalStingOk, label: "Audio lab — goal sting (C5→E5→G5→C6 stab + 60→120Hz sub-riser) fires on GOAL_SCORED", detail: "triangle arpeggio at 70 ms steps over a rising sub — procedural WebAudio, no samples" },
    { ok: shardLab.convertOk && shardLab.craftOk, label: "Shards lab — duplicates convert, 500 shards craft a token", detail: shardLab.detail },
    { ok: shardLab.protectedOk && shardLab.boostOk, label: "Shards lab — last copy / squad / locked protected; Skill Boosts apply", detail: "conversion refuses protected cards · boosts add +2/level into match templates" },
    { ok: exchangeLab.exchangeOk && exchangeLab.protectionOk, label: "Exchange lab — 3 same-rarity duplicates → next rarity up", detail: exchangeLab.detail },
    { ok: skillCapLab.capOk && skillCapLab.resetOk, label: "Skill cap lab — 5 full, 5 half, then 0 coins; resets next UTC day", detail: skillCapLab.detail },
    { ok: autoBackupLab.ageLabelOk && autoBackupLab.staleOk && autoBackupLab.snapshotOk && autoBackupLab.debounceOk, label: "Auto-backup lab — age labels, >7d stale, previous-club snapshot, debounce", detail: autoBackupLab.detail },
    { ok: commentaryLab.queueOk && commentaryLab.noCancelOk, label: "Commentary lab — queue caps at 3, never cancels mid-sentence", detail: commentaryLab.detail },
    { ok: commentaryLab.chunkOk && commentaryLab.voiceOk && commentaryLab.emotionOk && commentaryLab.tickerOk, label: "Commentary lab — chunking, British voice pick, emotion map, 6-line ticker", detail: "lines split at sentence bounds · en-GB male preferred · EXCITED/TENSE rates · minute-stamped history" },
    { ok: matchPlanLab.chaseOk && matchPlanLab.parkBusOk && matchPlanLab.timeWasteOk, label: "MatchPlan lab — chase when trailing, park the bus 80'+, time-waste when leading", detail: matchPlanLab.detail },
    { ok: matchPlanLab.trapsOk && matchPlanLab.adaptationOk && matchPlanLab.fairnessOk, label: "MatchPlan lab — traps at World Class+, pattern adaptation, fairness floors", detail: "pressing + offside traps · lane adaptation decays · speed ×1 · pass ≤0.97 · shot ≤0.95" },
    { ok: perfLab.mathOk && perfLab.p95Ok && perfLab.budgetOk, label: "Perf lab — telemetry math + measured LOW draw calls", detail: `${perfLab.detail} · budget ≥${LOW_FRAME_BUDGET.minFpsAvg} FPS, p95 ≤${LOW_FRAME_BUDGET.maxP95Ms} ms, ≤${LOW_FRAME_BUDGET.maxDrawCalls} calls` },
    { ok: ambienceLab.impulseOk && ambienceLab.constantsOk, label: "Ambience lab — generated reverb impulse (2.8s decay), crowd wet 0.35→0.50 on goals", detail: ambienceLab.detail },
    { ok: h2hSeasonLab.seasonOk && h2hSeasonLab.rolloverOk && h2hSeasonLab.clubXiOk, label: "H2H season lab — 28-day clock, −5 division reset + rewards, club fields its ACTUAL XI", detail: h2hSeasonLab.detail },
    { ok: eventLab.chaptersOk && eventLab.pointsOk && eventLab.milestoneOk && eventLab.shopOk, label: "Event lab — chapters, points, milestone track, token shop", detail: eventLab.detail },
    { ok: careerLab.fixturesOk && careerLab.tableOk && careerLab.facilityOk && careerLab.academyOk, label: "Career lab — 45 fixtures, table settles, facilities + academy work", detail: careerLab.detail },
    { ok: playAsLab.ok, label: "Play as Club lab — every club can be YOUR team", detail: playAsLab.detail },
    );
  }
  const checks: CheckItem[] = [
    ...baseChecks,
    ...labChecks,
    { ok: renderFps >= 24, label: "Render loop — live FPS on this device", detail: `${renderFps} FPS · ${graphicsQuality} tier · LOW holds 60 FPS on mobile GPUs` },
  ];

  const handleReset = () => {
    void resetProfile().then((p) => {
      metaStore.getState().setProfile(p, getLastStorageBackend());
      setResetNote("Starter profile regenerated and saved.");
    });
  };

  // Phase 10: Settings → half length updates both the live state and the
  // persisted setting; the next new Full Match starts with it.
  const handleHalfLength = (h: MatchHalfLength) => {
    setHalfDuration(h);
    settingsStore.getState().setMatchHalfLength(h);
  };

  // Phase 10: Settings → Import Save JSON / Cloud restore. The imported
  // profile replaces the live one through the single commit path, and the
  // engine's HOME squad rebuild follows from the squad-signature effect.
  const handleImportProfile = (p: SaveProfile) => {
    cleanupModeSession();
    commitProfile(p);
  };

  if (flowStage !== "game") {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
        {flowStage === "splash" && <SplashScreen onDone={() => setFlowStage("loading")} />}
        {flowStage === "loading" && <LoadingScreen ready={profileLoaded} onDone={() => setFlowStage("login")} />}
        {flowStage === "login" && (
          <LoginScreen
            clubName={profile?.clubName ?? "Your Club"}
            managerName={profile?.managerName ?? "Manager"}
            onGuest={() => setFlowStage("game")}
          />
        )}
      </div>
    );
  }

  // Addendum 1: first-run club creation gates the lobby until the manager
  // has founded his club (existing saves pass through it once, prefilled).
  if (profile && !profile.onboarded) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
        <ClubCreationScreen
          profile={profile}
          onDone={(next, startTutorial) => {
            commitProfile(next);
            if (startTutorial) launchTutorial();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32">
      <SafeAreaTopScrim />
      {/* Epic fix round (P1-16): skip link — keyboard users jump straight
          past the navigation to the main content. */}
      <a href="#striker-main" className="skip-link">Skip to main content</a>
      <main id="striker-main" tabIndex={-1} className="outline-none">

      {/* Diagnostics (release notes, engine telemetry, mentality sandbox,
          verification checks, wallet mirror) live under Engine Data — the
          game itself opens straight into the Lobby. */}
      {tab === "data" && (
        <>
      <header className="pt-5">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-[var(--dim)]">
          Phase 10 · Performance, Polish, QA Audit &amp; Android APK Guide
        </p>
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide sm:text-5xl">
          Striker <span className="text-[var(--accent)]">FC</span>
        </h1>
        <p className="mt-2 max-w-prose text-sm text-[var(--dim)]">
          The release build. Settings is now a full screen: four graphics tiers up to ULTRA with a crowd-density
          slider and weather controls, four audio buses with a global mute, mirrored joystick layouts, button
          sizing and haptics — every change applies instantly and survives a refresh. Data &amp; Safety adds a
          real Cloud Save backup and restore, save export/import as JSON, and a two-tap profile reset, and the
          APK Guide walks you through wrapping this exact build into a signed Android app with Capacitor. Under
          the hood, the renderer now disposes every geometry, material and texture when the stadium unmounts,
          the crowd is one density-scaled InstancedMesh, touch controls respect notch safe-areas, a wake lock
          keeps the screen on during matches, and portrait phones get a landscape prompt. The Final QA rows
          below close out the audit: all nine phase lab suites plus a cross-phase integrity sweep — no
          NaN stats, no duplicate IDs, lossless save round-trips, and a 30-second edge-case simulation.
        </p>
      </header>

      <section aria-label="Engine telemetry" className="mt-5">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { label: "FPS", value: String(fps) },
            { label: "Fixed ticks", value: formatNumber(tickCount) },
            { label: "Accumulator", value: `${(accumulator * 1000).toFixed(2)} ms` },
            { label: "Interp. alpha", value: alpha.toFixed(3) },
            { label: "Sim time", value: `${simTime.toFixed(1)} s` },
            { label: "HUD sync", value: "20 Hz" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-center">
              <p className="tnum font-display text-2xl font-bold leading-none text-[var(--accent)]">{m.value}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--dim)]">{m.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--dim)]">Mentality</span>
          {(Object.keys(MENTALITY_CONFIG) as Mentality[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mentality === m}
              onClick={() => hudStore.getState().setMentality(m)}
              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                borderColor: mentality === m ? "var(--accent)" : "var(--border)",
                background: mentality === m ? "var(--accent-dim)" : "var(--surface)",
                color: mentality === m ? "var(--accent)" : "var(--dim)",
              }}
            >
              {m.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Verification checks" className="mt-5 grid gap-2 sm:grid-cols-2">
        {checks.map((c) => (
          <CheckRow key={c.label} ok={c.ok} label={c.label} detail={c.detail} />
        ))}
      </section>

      {profile && (
        <section aria-label="Manager wallet" className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Coins", value: formatNumber(profile.coins) },
            { label: "Gems", value: formatNumber(profile.gems) },
            { label: "Rank-Up Tokens", value: String(profile.rankUpTokens) },
            { label: "Squad OVR", value: String(teamOvr) },
            { label: "Division", value: divisionName(profile.h2hDivision) },
            { label: "VSA Fans", value: formatNumber(profile.vsaFans) },
            { label: "Star Pass XP", value: formatNumber(profile.seasonPassXp) },
            { label: "SOLD! Inbox", value: String(claimableSales(profile, Date.now()).length) },
          ].map((w) => (
            <div key={w.label} className="flex items-baseline gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="tnum font-display text-xl font-bold text-[var(--gold)]">{w.value}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--dim)]">{w.label}</span>
            </div>
          ))}
        </section>
      )}
        </>
      )}

      {preMatch && (
        <PreMatchScreen
          data={preMatch.data}
          onReady={preMatch.start}
          onCancel={() => setPreMatch(null)}
        />
      )}

      {modeIntro && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`${modeIntro.title} — ${t('panel.howItWorks')}`}>
          <div className="w-full max-w-md rounded-2xl border bg-[var(--surface)] p-5 shadow-2xl" style={{ borderColor: modeIntro.accent }}>
            <p className="font-display text-3xl font-bold uppercase tracking-wide" style={{ color: modeIntro.accent }}>{modeIntro.title}</p>
            <p className="mt-1 text-sm font-medium text-[var(--text)]">{modeIntro.sub}</p>
            <ul className="mt-3 space-y-2">
              {modeIntro.rules.map((r) => (
                <li key={r} className="flex gap-2 text-sm leading-relaxed text-[var(--dim)]">
                  <span aria-hidden className="mt-0.5 font-black" style={{ color: modeIntro.accent }}>▸</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={modeIntro.start}
                className="font-display flex-1 rounded-xl px-4 py-3 text-lg font-bold uppercase tracking-wider text-[#0a120c]"
                style={{ background: modeIntro.accent }}
              >
                {modeIntro.startLabel}
              </button>
              <button
                type="button"
                onClick={() => setModeIntro(null)}
                className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold"
              >
                {t('common.back')}
              </button>
            </div>
          </div>
        </div>
      )}

      {goalBeat && (
        <div
          key={goalBeat.id}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden"
          role="status"
          aria-label={`Goal celebration — ${goalBeat.scorer}, ${goalBeat.minute} minutes`}
        >
          <div aria-hidden className="absolute inset-0 bg-black/35" />
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="confetti-piece"
              style={{
                left: `${(i * 61) % 100}%`,
                background: [goalBeat.kit.primary, "#f5c542", "#a3e635", "#ffffff"][i % 4],
                animationDelay: `${(i % 7) * 0.22}s`,
              }}
            />
          ))}
          <div className="hud-banner relative flex flex-col items-center px-6 text-center">
            <p className="font-display text-[64px] font-bold uppercase leading-none tracking-wide text-white drop-shadow-[0_4px_24px_rgba(163,230,53,0.55)]">
              Goal!
            </p>
            {goalBeat.template && (
              <div className="mt-3 h-24 w-24 overflow-hidden rounded-full ring-4 ring-[var(--gold)]">
                <AthletePortrait
                  appearance={goalBeat.template.appearance}
                  primary={goalBeat.kit.primary}
                  secondary={goalBeat.kit.secondary}
                  label={`${goalBeat.scorer} portrait`}
                />
              </div>
            )}
            <p className="font-display mt-2 text-[26px] font-bold uppercase leading-tight text-[var(--gold)]">
              {goalBeat.scorer}
            </p>
            <p className="text-[13px] font-bold uppercase tracking-[0.24em] text-white/85">
              {goalBeat.minute}&prime; · {goalBeat.side === "HOME" ? "Your team scores" : "Opposition scores"}
            </p>
          </div>
        </div>
      )}

      {tab === "stadium" && matchEnd && (
        <MatchEndScreen
          data={matchEnd}
          onPlayAgain={playAgain}
          onBackToModes={() => { setMatchEnd(null); setTab("modes"); }}
          onHub={() => { setMatchEnd(null); setTab("hub"); }}
        />
      )}
      {tab === "stadium" && !matchEnd && (
        <section aria-label="3D stadium" className="mt-5">
          {/* Phase 04: mode toggle + live scrimmage score strip */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)]" role="group" aria-label="Play mode">
              {(["MATCH", "SCRIMMAGE", "PRACTICE"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={playMode === m}
                  onClick={() => selectClassicMode(m)}
                  className="px-3 py-2 font-display text-base font-semibold uppercase tracking-wider"
                  style={{
                    background: playMode === m ? "var(--accent)" : "var(--surface)",
                    color: playMode === m ? "#0a120c" : "var(--dim)",
                  }}
                >
                  {m === "MATCH" ? "Full Match · Rules" : m === "SCRIMMAGE" ? "11v11 Scrimmage" : "Practice"}
                </button>
              ))}
            </div>
            {session && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--gold)]/50 bg-[var(--surface)] px-3 py-1.5" aria-label="Active mode session">
                <span className="font-display text-base font-bold uppercase tracking-wider text-[var(--gold)]">
                  {session.kind === "H2H" ? t('hub.h2hLabel', { division: profile ? divisionName(profile.h2hDivision) : "" })
                    : session.kind === "VSA" ? "VS Attack · 90s Blitz"
                      : session.kind === "ATTACK" ? t('end.mAttack')
                        : session.kind === "DEFEND" ? t('end.mDefend')
                      : session.kind === "MANAGER" ? "Manager Mode"
                        : session.kind === "TOURNAMENT" ? `Champions Cup · ${ROUND_NAMES[session.tournamentRound ?? 0]}`
                          : session.kind === "FRIENDLY" ? (session.clubId ? "Club Friendly" : "International Friendly")
                        : session.kind === "MATCH" ? "Full Match"
                            : `Skill Games · ${session.opponentName}`}
                </span>
                <span className="text-xs font-semibold text-[var(--dim)]">vs {session.opponentName}</span>
                <button
                  type="button"
                  onClick={endSessionEarly}
                  className="rounded border border-red-400/60 px-2 py-1 text-[11px] font-bold text-red-300"
                >
                  {t('panel.endSessionScore')}
                </button>
                <button
                  type="button"
                  onClick={() => { cleanupModeSession(); setPlayMode("MATCH"); startNewMatch(halfDuration); }}
                  className="rounded border border-[var(--border)] px-2 py-1 text-[11px] font-bold text-[var(--dim)]"
                >
                  Leave mode
                </button>
              </div>
            )}
            {MATCH_FAMILY.includes(playMode) && matchView && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="Match score">
                <span>{t('panel.home')} <span className="font-display text-xl text-[var(--accent)]">{matchView.scoreHome}</span></span>
                <span className="text-[var(--dim)]">–</span>
                <span><span className="font-display text-xl text-sky-300">{matchView.scoreAway}</span> {t('panel.away')}</span>
                <span className="text-xs text-[var(--dim)]">
                  {matchStateLabel(matchView.state)} · {matchView.minute}&prime;{matchView.addedMinutes > 0 ? ` +${matchView.addedMinutes}` : ""}
                  {matchView.shootout ? ` · ${t('panel.pens', { h: matchView.shootout.homeScore, a: matchView.shootout.awayScore })}` : ""}
                </span>
              </div>
            )}
            {playMode === "VSA" && vsaView && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-400/40 bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="VS Attack score">
                <span>{t('panel.you')} <span className="font-display text-xl text-emerald-300">{vsaView.userGoals}</span></span>
                <span className="text-[var(--dim)]">–</span>
                <span><span className="font-display text-xl text-red-300">{vsaView.oppGoals}</span> {t('panel.opp')}</span>
                <span className="text-xs text-[var(--dim)]">
                  {t('panel.secondsLeft', { s: Math.ceil(vsaView.timeLeft) })} · {t('panel.chanceN', { n: vsaView.chanceNumber })}
                  {vsaView.quality ? ` · ${chanceLabelT(vsaView.quality)}` : ""}
                </span>
              </div>
            )}
            {playMode === "SKILL" && skillView && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-400/40 bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="Skill game score">
                <span>{t('panel.scoreCap')} <span className="font-display text-xl text-amber-300">{skillView.score}</span></span>
                <span className="text-xs text-[var(--dim)]">
                  {t('panel.secondsLeft', { s: Math.ceil(skillView.timeLeft) })} · {"★".repeat(skillView.stars)}{"☆".repeat(3 - skillView.stars)} · {skillSubLabelT(skillView.subLabel)}
                </span>
              </div>
            )}
            {playMode === "ATTACK" && attackView && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-orange-400/40 bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="Attack Mode score">
                <span>{t('panel.pointsCap')} <span className="font-display text-xl text-orange-300">{attackView.points}</span></span>
                <span className="text-xs text-[var(--dim)]">
                  {t('stat.goals')} {attackView.goals} · {t('panel.chanceOf', { r: attackView.round, total: attackView.roundsTotal })} · {t('panel.secondsLeft', { s: Math.ceil(attackView.chanceTimeLeft) })} · {attackRoundLabelT(attackView.round)}
                </span>
              </div>
            )}
            {playMode === "DEFEND" && defendView && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-sky-400/40 bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="Defend Mode score">
                <span>{t('panel.pointsCap')} <span className="font-display text-xl text-sky-300">{defendView.points}</span></span>
                <span className="text-xs text-[var(--dim)]">
                  {t('stat.conceded')} {defendView.conceded} · {t('stat.ballsWon')} {defendView.ballsWon} · {t('stat.saves')} {defendView.saves} · {t('panel.waveOf', { w: defendView.wave, total: defendView.wavesTotal })} · {t('panel.secondsLeft', { s: Math.ceil(defendView.chanceTimeLeft) })} · {defendWaveLabelT(defendView.wave)}
                </span>
              </div>
            )}
            {playMode === "SCRIMMAGE" && (
              <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" aria-label="Scrimmage score">
                <span>{t('panel.home')} <span className="font-display text-xl text-[var(--accent)]">{scrimmageStats?.scoreHome ?? 0}</span></span>
                <span className="text-[var(--dim)]">–</span>
                <span><span className="font-display text-xl text-sky-300">{scrimmageStats?.scoreAway ?? 0}</span> {t('panel.away')}</span>
                <span className="text-xs text-[var(--dim)]">{scrimmageStats?.minute ?? 0}&prime; · {t('panel.possession', { n: scrimmageStats?.possessionHomePct ?? 50 })}</span>
                <span className="text-xs text-[var(--dim)]">{t('panel.gk')}: {scrimmageStats?.homeGkState ?? "—"} / {scrimmageStats?.awayGkState ?? "—"}</span>
              </div>
            )}
          </div>
          <div className="relative h-[68vh] min-h-[380px] w-full touch-none overflow-hidden rounded-xl border border-[var(--border)] bg-black">
            <ErrorBoundary
              fallback={(reset) => (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0a120c] px-6 text-center" role="alert">
                  <p className="font-display text-2xl font-bold uppercase tracking-widest text-white">3D pitch could not start</p>
                  <p className="max-w-[340px] text-sm leading-relaxed text-white/75">
                    This device refused the 3D renderer. LOW graphics (DPR 1, shadows off, no antialiasing)
                    is built for phones — switch and retry, the match, HUD and touch controls all run in LOW.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => { settingsStore.getState().setGraphicsQuality("LOW"); setStadiumMountKey((k) => k + 1); reset(); }}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#0a120c]"
                    >
                      Retry in LOW graphics
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStadiumMountKey((k) => k + 1); reset(); }}
                      className="rounded-lg border border-white/35 px-4 py-2 text-sm font-bold text-white"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            >
              <StadiumScene
                key={stadiumMountKey}
                weather={effectiveWeather}
                homeKitColors={(() => {
                  const paId = session?.playAsClubId ?? profile?.playAsClubId;
                  const paTeam = paId ? getClubTeam(paId) : null;
                  if (paTeam) return { primary: paTeam.club.primary, secondary: paTeam.club.secondary, shorts: "#0f172a", socks: paTeam.club.primary };
                  if (profile) return { primary: profile.clubPrimaryColor, secondary: profile.clubSecondaryColor, shorts: "#0f172a", socks: profile.clubPrimaryColor };
                  return null;
                })()}
                awayKitColors={session
                  ? { primary: session.opponentPrimary, secondary: session.opponentSecondary, shorts: "#f8fafc", socks: session.opponentPrimary }
                  : null}
                quality={graphicsQuality}
                crowdDensity={crowdDensity}
                cameraMode={camera3d}
                goalWaveSignal={waveSignal}
                kickSignal={kickSignal}
                demoAnim={demoAnim}
                onFps={setRenderFps}
                onGlFailed={() => settingsStore.getState().setGraphicsQuality("LOW")}
                practiceState={playMode === "PRACTICE" && practiceOn ? practiceRef.current.renderState : null}
                scrimmageState={playMode !== "PRACTICE" ? scrimmageRef.current.renderState : null}
                replayState={MATCH_FAMILY.includes(playMode) && matchView?.replayActive ? matchRef.current.replayRender : null}
                replayAngle={matchView?.replayAngle ?? 1}
                netRegistry={netRegistryRef.current}
              />
            </ErrorBoundary>
            {inputRef.current && playMode !== "MANAGER" && (playMode !== "PRACTICE" || practiceOn) && (
              <TouchControlsOverlay
                input={inputRef.current}
                mode={playMode === "PRACTICE" ? "ATTACK" : possessionSide
                  ? (possessionSide === "HOME" ? "ATTACK" : "DEFEND")
                  : (scrimmageStats?.userHasBall ? "ATTACK" : "DEFEND")}
              />
            )}
            {tutorialActive && inputRef.current && (
              <TutorialOverlay
                input={inputRef.current}
                getSnapshot={() => {
                  const m = matchRef.current;
                  const snap = m?.stats.snapshot();
                  return {
                    passes: snap?.home.passCompleted ?? 0,
                    shots: snap?.home.shots ?? 0,
                    tackles: snap?.home.tacklesWon ?? 0,
                    matchState: m?.view.state ?? null,
                  };
                }}
                onFinish={finishTutorial}
              />
            )}
            {MATCH_FAMILY.includes(playMode) && matchView && (
              <SetPieceHUD
                view={matchView}
                callbacks={{
                  onPenaltyAim: (z, y) => matchRef.current?.setPenaltyAim(z, y),
                  onConfirmPenalty: () => { matchRef.current?.confirmPenalty(0.85); },
                  onDive: (z, high) => matchRef.current?.setUserDive(z, high),
                  onSkipReplay: () => matchRef.current?.skipReplay(),
                }}
              />
            )}
            {MATCH_FAMILY.includes(playMode) && matchView?.state === "HALF_TIME" && (() => {
              const sheet = matchRef.current?.stats.snapshot();
              const rows: [string, string, string][] = sheet ? [
                ["Possession", `${Math.round(sheet.home.possessionPct)}%`, `${Math.round(sheet.away.possessionPct)}%`],
                ["Shots", String(sheet.home.shots), String(sheet.away.shots)],
                ["On target", String(sheet.home.onTarget), String(sheet.away.onTarget)],
                ["xG", sheet.home.xg.toFixed(2), sheet.away.xg.toFixed(2)],
                ["Passes", `${sheet.home.passCompleted}/${sheet.home.passAttempts}`, `${sheet.away.passCompleted}/${sheet.away.passAttempts}`],
                ["Tackles won", String(sheet.home.tacklesWon), String(sheet.away.tacklesWon)],
                ["Fouls", String(sheet.home.fouls), String(sheet.away.fouls)],
              ] : [];
              return (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-label="Half time">
                  <div className="w-full max-w-sm rounded-3xl border border-[var(--gold)]/50 bg-[#070d1d]/95 p-5 shadow-2xl">
                    <p className="text-center text-[11px] font-black uppercase tracking-[0.3em] text-[var(--gold)]">Half time</p>
                    <p className="tnum font-display mt-1 text-center text-5xl font-bold">
                      {matchView.scoreHome} – {matchView.scoreAway}
                    </p>
                    <div className="mt-4 space-y-1.5">
                      {rows.map(([label, h, a]) => (
                        <div key={label} className="tnum grid grid-cols-[1fr_auto_1fr] items-center text-sm">
                          <span className="font-bold">{h}</span>
                          <span className="px-2 text-[11px] font-bold uppercase tracking-widest text-[var(--dim)]">{label}</span>
                          <span className="text-right font-bold">{a}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-xs text-[var(--dim)]">Legs recovered a little in the break. Fresh players change games — you have 5 subs.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={openPause}
                        className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-bold uppercase tracking-wide"
                      >
                        Team & subs
                      </button>
                      <button
                        type="button"
                        onClick={() => matchRef.current?.startSecondHalf()}
                        className="font-display rounded-xl bg-[var(--accent)] px-3 py-2.5 text-lg font-bold uppercase tracking-wide text-[#0a120c]"
                      >
                        Second half
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Phase 06 broadcast HUD: scoreboard, radar, mentality, banners.
                VS Attack and Skill Games run their own dedicated overlays. */}
            {playMode !== "VSA" && playMode !== "SKILL" && playMode !== "ATTACK" && playMode !== "DEFEND" && (
              <MatchHudLive
                homeClub={session && profile
                  ? { id: "user_club", name: profile.clubName, abbr: profile.clubAbbr, primary: profile.clubPrimaryColor, secondary: profile.clubSecondaryColor, league: "Your Club" }
                  : (clubs.find((c) => c.id === "dhaka_tigers") ?? clubs[0]!)}
                awayClub={session
                  ? { id: "session_opp", name: session.opponentName, abbr: session.opponentAbbr, primary: session.opponentPrimary, secondary: session.opponentSecondary, league: "Opponent" }
                  : (clubs.find((c) => c.id === "man_sky") ?? clubs[1]!)}
                mentality={mentality}
                onMentality={(m) => hudStore.getState().setMentality(m)}
                showMentality={playMode !== "PRACTICE" && playMode !== "MANAGER"}
                banner={banner}
                advantageSec={matchView?.advantageSec ?? 0}
                varActive={matchView?.varActive ?? false}
                commentary={commentaryLines}
                onPause={handlePauseButton}
                paused={playMode === "PRACTICE" ? !practiceOn : scrimmagePaused}
                trainingMode={playMode === "PRACTICE"}
              />
            )}
            {/* Phase 08 VS Attack overlay: chance banner, clock, live opponent ticker. */}
            {playMode === "VSA" && vsaView && (
              <div className="pointer-events-none absolute inset-0 z-30" aria-label="VS Attack overlay">
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-center shadow-lg backdrop-blur-sm">
                  <span className="tnum font-display text-xl font-bold text-white">
                    {t('panel.you')} {vsaView.userGoals} – {vsaView.oppGoals} {t('panel.opp')}
                  </span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-emerald-300">{t('panel.secondsLeft', { s: Math.ceil(vsaView.timeLeft) })}</span>
                </div>
                {vsaView.phase === "LIVE" && vsaView.quality && (
                  <div key={vsaView.chanceNumber} className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <div
                      className="hud-banner rounded-lg border-2 px-4 py-2 text-center shadow-2xl backdrop-blur-sm"
                      style={{ borderColor: CHANCE_COLORS[vsaView.quality], background: "rgba(0,0,0,0.72)" }}
                    >
                      <p className="font-display text-2xl font-bold uppercase leading-none tracking-widest sm:text-3xl" style={{ color: CHANCE_COLORS[vsaView.quality] }}>
                        {chanceLabelT(vsaView.quality)}
                      </p>
                      <p className="tnum mt-1 text-xs font-semibold text-white/90">
                        {t('vsa.chanceLine', { n: vsaView.chanceNumber, s: Math.ceil(vsaView.chanceTimeLeft) })}
                        {vsaView.lastOutcome ? ` · ${t('vsa.lastOutcome', { o: vsaOutcomeT(vsaView.lastOutcome) })}` : ""}
                      </p>
                    </div>
                  </div>
                )}
                {vsaView.phase === "CUT" && vsaView.lastOutcome && (
                  <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <p className="rounded-lg bg-black/75 px-4 py-2 font-display text-2xl font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                      {vsaOutcomeT(vsaView.lastOutcome)}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 w-[240px] max-w-[62vw] rounded-md bg-black/70 px-2.5 py-2 backdrop-blur-sm" aria-label="Opponent ticker">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-red-300">{t('match.opponentTicker')}</p>
                  {vsaView.ticker.length === 0 && <p className="mt-0.5 text-[11px] text-white/70">{t('vsa.tickerEmpty')}</p>}
                  {vsaView.ticker.map((line, i) => (
                    <p
                      key={`${line}-${i}`}
                      className="mt-0.5 truncate text-[11px] font-semibold"
                      style={{ color: line.startsWith("OPPONENT SCORED") ? "#fca5a5" : "rgba(255,255,255,0.78)", opacity: 1 - i * 0.18 }}
                    >
                      {line}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handlePauseButton}
                  aria-label={scrimmagePaused ? t('panel.resumeVsa') : t('panel.pauseVsa')}
                  className="pointer-events-auto absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/70 font-display text-base font-bold text-white shadow-lg backdrop-blur-sm"
                >
                  {scrimmagePaused ? "▶" : "❚❚"}
                </button>
                {scrimmagePaused && (
                  <p className="absolute inset-x-0 top-28 text-center font-display text-2xl font-bold uppercase tracking-widest text-white" style={{ textShadow: "0 2px 12px #000" }}>{t('pause.paused')}</p>
                )}
              </div>
            )}
            {/* Phase 08 Skill Games overlay: score, stars, clock, live coaching line. */}
            {playMode === "SKILL" && skillView && (
              <div className="pointer-events-none absolute inset-0 z-30" aria-label="Skill game overlay">
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-center shadow-lg backdrop-blur-sm">
                  <span className="font-display text-lg font-bold uppercase tracking-wider text-amber-300">{session?.opponentName}</span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-white">{skillView.score} {t('panel.pts')}</span>
                  <span className="ml-2 text-sm" aria-label={`${skillView.stars} stars earned`}>{"★".repeat(skillView.stars)}<span className="text-white/40">{"★".repeat(3 - skillView.stars)}</span></span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-emerald-300">{t('panel.secondsLeft', { s: Math.ceil(skillView.timeLeft) })}</span>
                </div>
                <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                  <p aria-live="polite" className="max-w-[92vw] rounded-lg bg-black/70 px-4 py-1.5 text-center text-sm font-semibold text-white backdrop-blur-sm">
                    {skillView.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePauseButton}
                  aria-label={scrimmagePaused ? t('panel.resumeSkill') : t('panel.pauseSkill')}
                  className="pointer-events-auto absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/70 font-display text-base font-bold text-white shadow-lg backdrop-blur-sm"
                >
                  {scrimmagePaused ? "▶" : "❚❚"}
                </button>
                {scrimmagePaused && (
                  <p className="absolute inset-x-0 top-28 text-center font-display text-2xl font-bold uppercase tracking-widest text-white" style={{ textShadow: "0 2px 12px #000" }}>{t('pause.paused')}</p>
                )}
              </div>
            )}
            {/* Attack Mode overlay: points, chance banner, outcome cuts. */}
            {playMode === "ATTACK" && attackView && (
              <div className="pointer-events-none absolute inset-0 z-30" aria-label="Attack Mode overlay">
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-center shadow-lg backdrop-blur-sm">
                  <span className="font-display text-lg font-bold uppercase tracking-wider text-orange-300">{t('modes.attackMode')}</span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-white">{attackView.points} {t('panel.pts')}</span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-emerald-300">{t('panel.secondsLeft', { s: Math.ceil(attackView.chanceTimeLeft) })}</span>
                </div>
                {attackView.phase === "LIVE" && (
                  <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <div className="hud-banner rounded-lg border-2 border-orange-400/70 px-4 py-2 text-center shadow-2xl backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.72)" }}>
                      <p className="font-display text-2xl font-bold uppercase leading-none tracking-widest text-orange-300 sm:text-3xl">
                        {t('attack.chanceHead', { r: attackView.round, label: attackRoundLabelT(attackView.round) })}
                      </p>
                      <p className="tnum mt-1 text-xs font-semibold text-white/90">
                        {t('attack.chancesLeftLine', { n: attackView.roundsTotal - attackView.round + 1 })}
                      </p>
                    </div>
                  </div>
                )}
                {attackView.phase === "CUT" && attackView.lastOutcome && (
                  <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <p className="rounded-lg bg-black/75 px-4 py-2 text-center font-display text-2xl font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                      {attackView.lastOutcome === "GOAL" ? t('attack.outcomeGoal', { pts: attackView.lastPoints }) : attackView.lastOutcome === "SAVED" ? t('attack.outcomeSaved') : attackView.lastOutcome === "CLEARED" ? t('attack.outcomeCleared') : attackView.lastOutcome === "OUT" ? t('attack.outcomeOut') : t('attack.outcomeTimeUp')}
                      {attackView.lastBonus && <span className="mt-0.5 block text-sm normal-case tracking-normal text-[var(--gold)]">{attackView.lastBonus}</span>}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePauseButton}
                  aria-label={scrimmagePaused ? t('panel.resumeAttack') : t('panel.pauseAttack')}
                  className="pointer-events-auto absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/70 font-display text-base font-bold text-white shadow-lg backdrop-blur-sm"
                >
                  {scrimmagePaused ? "▶" : "❚❚"}
                </button>
                {scrimmagePaused && (
                  <p className="absolute inset-x-0 top-28 text-center font-display text-2xl font-bold uppercase tracking-widest text-white" style={{ textShadow: "0 2px 12px #000" }}>{t('pause.paused')}</p>
                )}
              </div>
            )}
            {/* Defend Mode overlay: points, wave banner, outcome cuts. */}
            {playMode === "DEFEND" && defendView && (
              <div className="pointer-events-none absolute inset-0 z-30" aria-label="Defend Mode overlay">
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-center shadow-lg backdrop-blur-sm">
                  <span className="font-display text-lg font-bold uppercase tracking-wider text-sky-300">{t('modes.defendMode')}</span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-white">{defendView.points} {t('panel.pts')}</span>
                  <span className="tnum ml-2 font-display text-xl font-bold text-emerald-300">{t('panel.secondsLeft', { s: Math.ceil(defendView.chanceTimeLeft) })}</span>
                </div>
                {defendView.phase === "LIVE" && (
                  <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <div className="hud-banner rounded-lg border-2 border-sky-400/70 px-4 py-2 text-center shadow-2xl backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.72)" }}>
                      <p className="font-display text-2xl font-bold uppercase leading-none tracking-widest text-sky-300 sm:text-3xl">
                        {t('defend.waveHead', { w: defendView.wave, label: defendWaveLabelT(defendView.wave) })}
                      </p>
                      <p className="tnum mt-1 text-xs font-semibold text-white/90">
                        {t('defend.stopLine', { c: defendView.conceded, b: defendView.ballsWon, s: defendView.saves })}
                      </p>
                    </div>
                  </div>
                )}
                {defendView.phase === "CUT" && defendView.lastOutcome && (
                  <div className="absolute inset-x-0 top-16 flex justify-center px-3">
                    <p className="rounded-lg bg-black/75 px-4 py-2 text-center font-display text-2xl font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                      {defendView.lastOutcome === "CONCEDED" ? t('defend.outcomeConceded', { pts: defendView.lastPoints }) : defendView.lastOutcome === "BALL_WON" ? t('defend.outcomeBallWon', { pts: defendView.lastPoints }) : defendView.lastOutcome === "CLEARED" ? t('defend.outcomeCleared', { pts: defendView.lastPoints }) : defendView.lastOutcome === "SURVIVED" ? t('defend.outcomeSurvived', { pts: defendView.lastPoints }) : t('attack.outcomeOut')}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePauseButton}
                  aria-label={scrimmagePaused ? t('panel.resumeDefend') : t('panel.pauseDefend')}
                  className="pointer-events-auto absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/70 font-display text-base font-bold text-white shadow-lg backdrop-blur-sm"
                >
                  {scrimmagePaused ? "▶" : "❚❚"}
                </button>
                {scrimmagePaused && (
                  <p className="absolute inset-x-0 top-28 text-center font-display text-2xl font-bold uppercase tracking-widest text-white" style={{ textShadow: "0 2px 12px #000" }}>{t('pause.paused')}</p>
                )}
              </div>
            )}
            {/* Phase 08 Manager Mode: the touchline is the controller. */}
            {playMode === "MANAGER" && (
              <ManagerTouchlineHUD
                mentality={mentality}
                onMentality={(m) => hudStore.getState().setMentality(m)}
                tactics={tactics}
                onTactics={setTactics}
                speed={managerSpeed}
                onSpeed={setManagerSpeed}
                xi={matchView ? (scrimmageRef.current?.hudPlayers() ?? []) : []}
                bench={matchView ? (scrimmageRef.current?.benchInfo() ?? []) : []}
                subsUsed={scrimmageRef.current?.subsUsed ?? 0}
                maxSubs={scrimmageRef.current?.maxSubs ?? 5}
                onSubstitute={handleSubstitute}
              />
            )}
            {/* Phase 06 pause menu: stats, shot map, live subs, quick settings. */}
            <PauseAndStatsModal
              open={pauseOpen && playMode !== "PRACTICE" && playMode !== "VSA" && playMode !== "SKILL" && playMode !== "ATTACK" && playMode !== "DEFEND"}
              homeClub={clubs.find((c) => c.id === "dhaka_tigers") ?? clubs[0]!}
              awayClub={clubs.find((c) => c.id === "man_sky") ?? clubs[1]!}
              scoreHome={MATCH_FAMILY.includes(playMode) ? (matchView?.scoreHome ?? 0) : (scrimmageStats?.scoreHome ?? 0)}
              scoreAway={MATCH_FAMILY.includes(playMode) ? (matchView?.scoreAway ?? 0) : (scrimmageStats?.scoreAway ?? 0)}
              minute={MATCH_FAMILY.includes(playMode) ? (matchView?.minute ?? 0) : (scrimmageStats?.minute ?? 0)}
              stateLabel={MATCH_FAMILY.includes(playMode) ? (matchView ? matchStateLabel(matchView.state) : "") : t('panel.scrimmageTitle')}
              stats={MATCH_FAMILY.includes(playMode) ? (matchView?.stats ?? null) : null}
              fallback={playMode === "SCRIMMAGE" && scrimmageStats ? {
                possessionHomePct: scrimmageStats.possessionHomePct,
                shotsHome: scrimmageStats.shotsHome,
                shotsAway: scrimmageStats.shotsAway,
                onTargetHome: scrimmageStats.onTargetHome,
                onTargetAway: scrimmageStats.onTargetAway,
                savesHome: scrimmageStats.savesHome,
                savesAway: scrimmageStats.savesAway,
                tackles: scrimmageStats.tackles,
              } : null}
              xi={pauseOpen ? (scrimmageRef.current?.hudPlayers() ?? []) : []}
              bench={pauseOpen ? (scrimmageRef.current?.benchInfo() ?? []) : []}
              subsUsed={scrimmageRef.current?.subsUsed ?? 0}
              maxSubs={scrimmageRef.current?.maxSubs ?? 5}
              onSubstitute={handleSubstitute}
              cameraMode={camera3d}
              onCameraMode={setCamera3d}
              onResume={resumeMatch}
              onForfeit={forfeitMatch}
              canForfeit={MATCH_FAMILY.includes(playMode) && !(matchView?.fullTime ?? false)}
            />
            <div className="absolute right-2 top-2 z-10 w-44 rounded-lg border border-white/15 bg-black/70 p-2 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                Dev Toolbar{showFps && <> · <span className="tnum">{renderFps} FPS</span></>}
              </p>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Weather
                <select aria-label="Weather preset" value={weather3d} onChange={(e) => setWeather3d(e.target.value as WeatherPreset)} className="mt-0.5 w-full rounded bg-[#16211a] px-1.5 py-1 text-xs font-semibold text-white">
                  <option value="DAY_CLEAR">Day Clear</option>
                  <option value="SUNSET">Sunset</option>
                  <option value="NIGHT_FLOODLIGHTS">Night Floodlights</option>
                  <option value="NIGHT_RAIN">Night Rain</option>
                </select>
              </label>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Camera
                <select aria-label="Camera angle" value={camera3d} onChange={(e) => setCamera3d(e.target.value as CameraMode3D)} className="mt-0.5 w-full rounded bg-[#16211a] px-1.5 py-1 text-xs font-semibold text-white">
                  <option value="BROADCAST">Broadcast</option>
                  <option value="PRO">Pro Behind-Player</option>
                  <option value="SET_PIECE">Set-Piece</option>
                  <option value="CELEBRATION">Celebration / Replay</option>
                </select>
              </label>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-white/70">
                Squad animation
                <select aria-label="Demo animation" value={demoAnim} onChange={(e) => setDemoAnim(e.target.value as AnimState)} className="mt-0.5 w-full rounded bg-[#16211a] px-1.5 py-1 text-xs font-semibold text-white">
                  <option value="IDLE">Idle</option>
                  <option value="JOG">Jog</option>
                  <option value="SPRINT">Sprint</option>
                  <option value="KICK">Kick</option>
                  <option value="SLIDE_TACKLE">Slide Tackle</option>
                  <option value="HEADER_JUMP">Header Jump</option>
                  <option value="GK_DIVE_HIGH">GK Dive High</option>
                  <option value="GK_DIVE_LOW">GK Dive Low</option>
                  <option value="CELEBRATE_KNEE_SLIDE">Knee Slide</option>
                  <option value="CELEBRATE_FIST_PUMP">Fist Pump</option>
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setWaveSignal((n) => n + 1)} className="rounded bg-[var(--accent)] px-2 py-1.5 text-[11px] font-bold text-[#0a120c]">
                  Goal Wave
                </button>
                <button type="button" onClick={() => setKickSignal((n) => n + 1)} className="rounded border border-[var(--gold)] px-2 py-1.5 text-[11px] font-bold text-[var(--gold)]">
                  Kick Demo
                </button>
              </div>
            </div>
            {playMode !== "MANAGER" && playMode !== "VSA" && playMode !== "SKILL" && (
            <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/85">
              {MATCH_FAMILY.includes(playMode)
                ? `${playMode === "H2H" ? t('modes.headToHead') : playMode === "TOURNAMENT" ? t('modes.tournament') : t('match.fullMatch')} · ${matchView?.message ?? t('match.teamsComingOut')}`
                : playMode === "SCRIMMAGE"
                ? `11v11 Scrimmage · You control ${scrimmageRef.current.userSlot.kin.template.shortName} (${scrimmageRef.current.userSlot.role}) · ${scrimmageStats?.userHasBall ? "Attacking — far goal →" : "Defending — 2ND DEF calls help, swipe ▼ on it rushes your GK"}`
                : practiceOn
                  ? `Open Pitch Practice · You control ${practiceRef.current.controlled.template.shortName} (${practiceRef.current.controlled.template.position}) · Attack the far goal →`
                  : "Dhaka Royal Tigers vs Manchester Sky · 4-3-3 vs 4-3-3 · 22 articulated players · 4,000-fan instanced crowd"}
            </p>
            )}
            {/* Phase 10: landscape prompt on narrow portrait phones. */}
            {portraitNarrow && !rotateDismissed && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/78 px-6 text-center backdrop-blur-[2px]" role="alertdialog" aria-label={t('rotate.aria')}>
                <span aria-hidden className="rotate-hint font-display text-5xl text-[var(--accent)]">⟳</span>
                <p className="font-display text-2xl font-bold uppercase tracking-widest text-white">{t('rotate.title')}</p>
                <p className="max-w-[300px] text-sm leading-relaxed text-white/80">
                  {t('rotate.body')}
                </p>
                <button
                  type="button"
                  onClick={() => setRotateDismissed(true)}
                  className="mt-1 rounded-lg border border-white/35 px-4 py-2 text-sm font-bold text-white"
                >
                  {t('rotate.portraitAnyway')}
                </button>
              </div>
            )}
          </div>

          {/* Phase 05 full-match panel: state machine controls + complete stats sheet + shot map. */}
          {MATCH_FAMILY.includes(playMode) && matchView && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {playMode === "H2H" ? t('modes.headToHead') : playMode === "MANAGER" ? t('modes.manager') : playMode === "TOURNAMENT" ? t('match.championsCupTie') : t('match.fullMatch')} · {matchStateLabel(matchView.state)} {scrimmagePaused ? `· ${t('pause.paused')}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {playMode === "MATCH" && (
                    <>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Half length</span>
                      {([180, 240, 360] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          aria-pressed={halfDuration === h}
                          onClick={() => startNewMatch(h)}
                          className="tnum rounded border px-2 py-1 text-[11px] font-bold"
                          style={{
                            borderColor: halfDuration === h ? "var(--accent)" : "var(--border)",
                            background: halfDuration === h ? "var(--accent-dim)" : "transparent",
                            color: halfDuration === h ? "var(--accent)" : "var(--dim)",
                          }}
                        >
                          {h / 60} min
                        </button>
                      ))}
                    </>
                  )}
                  <button
                    type="button"
                    aria-pressed={scrimmagePaused}
                    onClick={() => setScrimmagePaused((v) => !v)}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                  >
                    {scrimmagePaused ? t('panel.resumeMatch') : t('panel.pauseMatch')}
                  </button>
                  {playMode === "MATCH" && (
                    <button
                      type="button"
                      onClick={() => startNewMatch(halfDuration)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                    >
                      New match
                    </button>
                  )}
                </div>
              </div>
              <p aria-live="polite" className="mt-2 text-sm font-medium text-[var(--text)]">{matchView.message}</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_240px]">
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <table className="w-full text-sm" aria-label="Match statistics">
                    <thead>
                      <tr className="bg-[var(--surface2)] text-left">
                        <th className="px-3 py-1.5 font-display text-base tracking-wider text-[var(--accent)]">HOME</th>
                        <th className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--dim)]">Team stats</th>
                        <th className="px-3 py-1.5 text-right font-display text-base tracking-wider text-sky-300">AWAY</th>
                      </tr>
                    </thead>
                    <tbody className="tnum">
                      {(
                        [
                          ["Possession", `${matchView.stats.home.possessionPct}%`, `${matchView.stats.away.possessionPct}%`],
                          ["Shots", matchView.stats.home.shots, matchView.stats.away.shots],
                          ["On target", matchView.stats.home.onTarget, matchView.stats.away.onTarget],
                          ["Expected goals (xG)", matchView.stats.home.xg.toFixed(2), matchView.stats.away.xg.toFixed(2)],
                          ["Passes", `${matchView.stats.home.passCompleted}/${matchView.stats.home.passAttempts}`, `${matchView.stats.away.passCompleted}/${matchView.stats.away.passAttempts}`],
                          ["Pass accuracy", `${matchView.stats.home.passAccuracyPct}%`, `${matchView.stats.away.passAccuracyPct}%`],
                          ["Tackles won", matchView.stats.home.tacklesWon, matchView.stats.away.tacklesWon],
                          ["Saves", matchView.stats.home.saves, matchView.stats.away.saves],
                          ["Corners", matchView.stats.home.corners, matchView.stats.away.corners],
                          ["Offsides", matchView.stats.home.offsides, matchView.stats.away.offsides],
                          ["Fouls", matchView.stats.home.fouls, matchView.stats.away.fouls],
                          ["Yellow cards", matchView.stats.home.yellows, matchView.stats.away.yellows],
                          ["Red cards", matchView.stats.home.reds, matchView.stats.away.reds],
                        ] as [string, string | number, string | number][]
                      ).map(([label, home, away]) => (
                        <tr key={label} className="border-t border-[var(--border)]/60">
                          <td className="px-3 py-1 font-semibold">{home}</td>
                          <td className="px-3 py-1 text-center text-xs text-[var(--dim)]">{label}</td>
                          <td className="px-3 py-1 text-right font-semibold">{away}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Shot map · dot = attempt · ring = goal</p>
                  <svg viewBox="0 0 105 68" className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[#0d1f10]" role="img" aria-label="Shot map">
                    <rect x="0.5" y="0.5" width="104" height="67" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
                    <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="#2c4a30" strokeWidth="0.7" />
                    <rect x="0" y="13.9" width="16.5" height="40.2" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
                    <rect x="88.5" y="13.9" width="16.5" height="40.2" fill="none" stroke="#2c4a30" strokeWidth="0.7" />
                    {matchView.stats.shotMap.map((s, i) => (
                      <g key={i}>
                        {s.result === "GOAL" && (
                          <circle cx={s.x + 52.5} cy={s.z + 34} r="2.6" fill="none" stroke="#f5c542" strokeWidth="0.8" />
                        )}
                        <circle
                          cx={s.x + 52.5}
                          cy={s.z + 34}
                          r={1.1 + s.xg * 1.6}
                          fill={s.side === "HOME" ? "#a3e635" : "#38bdf8"}
                          opacity={s.result === "OFF_TARGET" ? 0.45 : 0.95}
                        />
                      </g>
                    ))}
                  </svg>
                  <p className="mt-1 text-[11px] text-[var(--dim)]">
                    {matchView.stats.shotMap.length} shots plotted · bigger dot = higher xG.
                    {matchView.state === "FULL_TIME" ? " Full time — start a new match any time." : ""}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">
                Rules in play: offside is judged at the exact frame the pass is played (never from throw-ins,
                corners or goal kicks) with a VAR line on the pitch; legs-first tackles are evaluated for severity,
                DOGSO is a straight red and the team reshapes to 10 men; advantage runs 3.5 seconds before a
                pull-back; the whistle never blows with the ball in a box or a shot in flight. Penalties: drag the
                reticle to place your shot, or pick a dive zone when defending. Shootouts run ABAB for five kicks,
                then sudden death.
              </p>
            </div>
          )}

          {/* Phase 04 scrimmage panel: difficulty, live AI readout, Manager sliders. */}
          {playMode === "SCRIMMAGE" && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {t('panel.scrimmageTitle')} {scrimmagePaused ? `· ${t('pause.paused')}` : `· ${t('match.live')}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={scrimmagePaused}
                    onClick={() => setScrimmagePaused((v) => !v)}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                  >
                    {scrimmagePaused ? t('panel.resumeMatch') : t('panel.pauseMatch')}
                  </button>
                  <button
                    type="button"
                    onClick={() => scrimmageRef.current?.resetMatch()}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                  >
                    Reset match
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.emit({ kind: "SECOND_DEF" })}
                    className="rounded-lg border border-orange-400/50 px-3 py-1.5 text-xs font-semibold text-orange-300"
                  >
                    Call 2nd Defender (U)
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.emit({ kind: "GK_RUSH" })}
                    className="rounded-lg border border-orange-400/50 px-3 py-1.5 text-xs font-semibold text-orange-300"
                  >
                    Rush GK out (G)
                  </button>
                </div>
              </div>
              <p aria-live="polite" className="mt-2 text-sm font-medium text-[var(--text)]">
                {scrimmageStats?.lastMessage ?? "Kickoff — your striker has the ball."}
              </p>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
                <span>Score <strong className="text-[var(--gold)]">{scrimmageStats?.scoreHome ?? 0}–{scrimmageStats?.scoreAway ?? 0}</strong></span>
                <span>Shots <strong className="text-[var(--text)]">{scrimmageStats?.shotsHome ?? 0}–{scrimmageStats?.shotsAway ?? 0}</strong></span>
                <span>On target <strong className="text-[var(--text)]">{scrimmageStats?.onTargetHome ?? 0}–{scrimmageStats?.onTargetAway ?? 0}</strong></span>
                <span>Passes <strong className="text-[var(--text)]">{scrimmageStats?.passesHome ?? 0}–{scrimmageStats?.passesAway ?? 0}</strong></span>
                <span>Saves <strong className="text-[var(--text)]">{scrimmageStats?.savesHome ?? 0}–{scrimmageStats?.savesAway ?? 0}</strong></span>
                <span>Tackles <strong className="text-[var(--text)]">{scrimmageStats?.tackles ?? 0}</strong></span>
                <span>Shape error <strong className="text-[var(--text)]">{(scrimmageStats?.avgShapeError ?? 0).toFixed(1)} m</strong></span>
                <span>Min separation <strong className="text-[var(--text)]">{(scrimmageStats?.minSameTeamSeparation ?? 0).toFixed(1)} m</strong></span>
                <span>Primary pressers <strong className="text-[var(--text)]">{scrimmageStats?.primaryPressers ?? 0}</strong></span>
                {scrimmageStats?.secondPressActive && <span><strong className="text-green-400">2nd presser active (green ring)</strong></span>}
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">
                  Difficulty — 7 tiers of football intelligence: decisions, passing, marking, anticipation (never speed)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
                  {DIFFICULTY_ORDER.map((d) => {
                    const p = getDifficultyProfile(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={difficulty === d}
                        onClick={() => setDifficulty(d)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          borderColor: difficulty === d ? "var(--accent)" : "var(--border)",
                          background: difficulty === d ? "var(--accent-dim)" : "transparent",
                          color: difficulty === d ? "var(--accent)" : "var(--dim)",
                        }}
                      >
                        {p.label} · {p.decisionDelaySec.toFixed(2)}s
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-[var(--dim)]">
                  {getDifficultyProfile(difficulty).label}: pass accuracy {Math.round(getDifficultyProfile(difficulty).passAccuracy * 100)}% ·
                  shot precision {Math.round(getDifficultyProfile(difficulty).shotPrecision * 100)}% ·
                  skill moves {Math.round(getDifficultyProfile(difficulty).skillMoveFreq * 100)}% ·
                  marking {Math.round(getDifficultyProfile(difficulty).markingTightness * 100)}% ·
                  anticipation {Math.round(getDifficultyProfile(difficulty).anticipation * 100)}% ·
                  through balls {Math.round(getDifficultyProfile(difficulty).throughBallFreq * 100)}% ·
                  press: {getDifficultyProfile(difficulty).pressCoordinationLabel}
                </p>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Live AI states (all 20 outfielders)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(scrimmageStats?.stateCounts ?? {}).map(([state, count]) => (
                    <span key={state} className="tnum rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--dim)]">
                      {state.replace(/_/g, " ")} × {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Manager Mode sliders — your team&apos;s game plan</p>
                <div className="mt-1.5 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {(
                    [
                      ["buildUpSpeed", "Build-up speed"],
                      ["passingDistance", "Passing distance"],
                      ["shootingTendency", "Shooting tendency"],
                      ["crossingTendency", "Crossing tendency"],
                      ["pressure", "Pressure"],
                      ["width", "Width"],
                      ["aggression", "Aggression"],
                    ] as [keyof ManagerTactics, string][]
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--dim)]">{label}</span>
                      <div className="flex gap-1" role="group" aria-label={label}>
                        {([1, 2, 3] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={tactics[key] === v}
                            aria-label={`${label} ${v} of 3`}
                            onClick={() => setTactics((t) => ({ ...t, [key]: v }))}
                            className="tnum h-7 w-8 rounded border text-xs font-bold"
                            style={{
                              borderColor: tactics[key] === v ? "var(--accent)" : "var(--border)",
                              background: tactics[key] === v ? "var(--accent-dim)" : "transparent",
                              color: tactics[key] === v ? "var(--accent)" : "var(--dim)",
                            }}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">
                Defending controls: the buttons switch to the DEFEND layout — SPRINT·TACKLE contains and tackles,
                SLIDE lunges, 2ND DEF sends the nearest teammate in with a green ring (swipe ▼ on it rushes your GK
                out), SWITCH changes your player. Keyboard: U = 2nd Defender, G = GK Rush, Tab = switch.
                Mentality at the top reshapes your whole team live — Ultra Defending drops the line and compacts,
                Ultra Attacking pushes it up and floods forward runs.
              </p>
            </div>
          )}

          {/* Phase 08 VS Attack panel: chance log + how the blitz works. */}
          {playMode === "VSA" && vsaView && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-emerald-300">
                  {t('panel.vsaTitle')} {vsaView.phase === "FINISHED" ? `· ${t('hud.fullTime')}` : scrimmagePaused ? `· ${t('pause.paused')}` : `· ${t('match.live')}`}
                </p>
                <button
                  type="button"
                  aria-pressed={scrimmagePaused}
                  onClick={() => setScrimmagePaused((v) => !v)}
                  className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                >
                  {scrimmagePaused ? t('panel.resumeBlitz') : t('panel.pauseBlitz')}
                </button>
              </div>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
                <span>Score <strong className="text-[var(--gold)]">{vsaView.userGoals}–{vsaView.oppGoals}</strong></span>
                <span>Chances <strong className="text-[var(--text)]">{vsaView.chanceNumber}</strong></span>
                <span>Shots <strong className="text-[var(--text)]">{vsaView.userShots}</strong></span>
                <span>Great goals <strong className="text-[var(--text)]">{vsaView.goalsByQuality.GREAT}</strong></span>
                <span>Good goals <strong className="text-[var(--text)]">{vsaView.goalsByQuality.GOOD}</strong></span>
                <span>Basic goals <strong className="text-[var(--text)]">{vsaView.goalsByQuality.BASIC}</strong></span>
                <span>Clock <strong className="text-[var(--text)]">{Math.ceil(vsaView.timeLeft)}s</strong></span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">
                Every chance is spawned live on the pitch from the OVR-delta table and ends the instant it resolves —
                goal, save, clearance, out of bounds or the 12-second cap — with a 0.4s cut to the next. The opponent
                plays their own chances on the ticker; outscore them in 90 seconds to grow your fan base.
              </p>
            </div>
          )}

          {/* Phase 08 Skill Games panel: live score chase + star targets. */}
          {playMode === "SKILL" && skillView && session?.skillGameId && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-amber-300">
                  {skillGameDef(session.skillGameId).name} {skillView.phase === "FINISHED" ? `· ${t('panel.done')}` : scrimmagePaused ? `· ${t('pause.paused')}` : `· ${t('match.live')}`}
                </p>
                <button
                  type="button"
                  aria-pressed={scrimmagePaused}
                  onClick={() => setScrimmagePaused((v) => !v)}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                >
                  {scrimmagePaused ? t('panel.resumeGame') : t('panel.pauseGame')}
                </button>
              </div>
              <p aria-live="polite" className="mt-2 text-sm font-medium">{skillView.message}</p>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
                <span>Score <strong className="text-[var(--gold)]">{skillView.score}</strong></span>
                <span>Stars <strong className="text-[var(--text)]">{skillView.stars}/3</strong></span>
                <span>Time <strong className="text-[var(--text)]">{Math.ceil(skillView.timeLeft)}s</strong></span>
                <span>Targets <strong className="text-[var(--text)]">{skillGameDef(session.skillGameId).starThresholds.join(" · ")}</strong></span>
                {skillView.combo > 0 && <span>Combo <strong className="text-[var(--accent)]">×{skillView.combo}</strong></span>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">{skillGameDef(session.skillGameId).blurb}</p>
            </div>
          )}

          {/* Attack Mode panel: live points chase + how the chances work. */}
          {playMode === "ATTACK" && attackView && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-orange-300">
                  {t('modes.attackMode')} {attackView.phase === "FINISHED" ? `· ${t('hud.fullTime')}` : scrimmagePaused ? `· ${t('pause.paused')}` : `· ${t('match.live')}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={scrimmagePaused}
                    onClick={() => setScrimmagePaused((v) => !v)}
                    className="rounded-lg bg-orange-400 px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                  >
                    {scrimmagePaused ? t('panel.resume') : t('panel.pause')}
                  </button>
                  <button
                    type="button"
                    onClick={endSessionEarly}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                  >
                    {t('panel.endSession')}
                  </button>
                </div>
              </div>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
                <span>{t('stat.points')} <strong className="text-[var(--gold)]">{formatNumber(attackView.points)}</strong></span>
                <span>{t('stat.best')} <strong className="text-[var(--text)]">{formatNumber((profile?.attackBest ?? 0))}</strong></span>
                <span>{t('stat.goals')} <strong className="text-[var(--text)]">{attackView.goals}/{attackView.roundsTotal}</strong></span>
                <span>{t('stat.shots')} <strong className="text-[var(--text)]">{attackView.shots}</strong></span>
                <span>{t('stat.chancesLeft')} <strong className="text-[var(--text)]">{attackView.roundsTotal - attackView.round}</strong></span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">
                {t('attack.body')}
              </p>
            </div>
          )}

          {/* Defend Mode panel: live points chase + how the waves work. */}
          {playMode === "DEFEND" && defendView && (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold uppercase tracking-wider text-sky-300">
                  {t('modes.defendMode')} {defendView.phase === "FINISHED" ? `· ${t('hud.fullTime')}` : scrimmagePaused ? `· ${t('pause.paused')}` : `· ${t('match.live')}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={scrimmagePaused}
                    onClick={() => setScrimmagePaused((v) => !v)}
                    className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                  >
                    {scrimmagePaused ? t('panel.resume') : t('panel.pause')}
                  </button>
                  <button
                    type="button"
                    onClick={endSessionEarly}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                  >
                    {t('panel.endSession')}
                  </button>
                </div>
              </div>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
                <span>{t('stat.points')} <strong className="text-[var(--gold)]">{formatNumber(defendView.points)}</strong></span>
                <span>{t('stat.best')} <strong className="text-[var(--text)]">{formatNumber((profile?.defendBest ?? 0))}</strong></span>
                <span>{t('stat.conceded')} <strong className="text-[var(--text)]">{defendView.conceded}</strong></span>
                <span>{t('stat.ballsWon')} <strong className="text-[var(--text)]">{defendView.ballsWon}</strong></span>
                <span>{t('stat.saves')} <strong className="text-[var(--text)]">{defendView.saves}</strong></span>
                <span>{t('stat.cleanSheets')} <strong className="text-[var(--text)]">{defendView.cleanSheets}/{defendView.wavesTotal}</strong></span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">
                {t('defend.body')}
              </p>
            </div>
          )}

          {/* Phase 03 practice bar: status, presets and skill moves (also the desktop test path). */}
          {playMode === "PRACTICE" && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg font-semibold uppercase tracking-wider text-[var(--accent)]">
                {t('panel.practiceTitle')} {practiceOn ? `· ${t('match.live')}` : `· ${t('pause.paused')}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={practiceOn}
                  onClick={() => setPracticeOn((v) => !v)}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[#0a120c]"
                >
                  {practiceOn ? t('panel.pausePractice') : t('panel.resumePractice')}
                </button>
                <button
                  type="button"
                  onClick={() => practiceRef.current?.resetBallToFeet()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                >
                  Reset ball
                </button>
                <button
                  type="button"
                  onClick={() => practiceRef.current?.resetPositions()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                >
                  Reset positions
                </button>
              </div>
            </div>
            <p aria-live="polite" className="mt-2 text-sm font-medium text-[var(--text)]">
              {practiceStats?.lastMessage ?? "Practice live — dribble with the left stick, shoot with the red button."}
            </p>
            <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
              <span>Goals <strong className="text-[var(--gold)]">{practiceStats?.goals ?? 0}</strong></span>
              <span>Shots <strong className="text-[var(--text)]">{practiceStats?.shots ?? 0}</strong></span>
              <span>Passes <strong className="text-[var(--text)]">{practiceStats?.passes ?? 0}</strong></span>
              <span>Skill moves <strong className="text-[var(--text)]">{practiceStats?.skills ?? 0}</strong></span>
              <span>Post hits <strong className="text-[var(--text)]">{practiceStats?.postHits ?? 0}</strong></span>
              <span>Stamina <strong className="text-[var(--text)]">{Math.round((practiceRef.current?.controlled.stamina01 ?? 1) * 100)}%</strong></span>
              {practiceStats?.lastShotType && <span>Last shot <strong className="text-[var(--text)]">{practiceStats.lastShotType}</strong></span>}
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">Shot presets (aim with stick / WASD)</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ["STANDARD", "Standard", 0.7],
                    ["FINESSE", "Finesse — far-post curl", 0.72],
                    ["CHIP", "Chip — backspin lob", 0.62],
                    ["POWER", "Power — topspin dip", 0.85],
                    ["FAKE_SHOT", "Fake shot", 0.4],
                  ] as [ShotType, string, number][]
                ).map(([type, label, power]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => inputRef.current?.emit({ kind: "SHOOT", shotType: type, power })}
                    className="rounded-full border border-orange-400/50 px-2.5 py-1 text-[11px] font-semibold text-orange-300"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => inputRef.current?.emit({ kind: "PASS", passType: "GROUND", power: 0.55 })}
                  className="rounded-full border border-sky-400/50 px-2.5 py-1 text-[11px] font-semibold text-sky-300"
                >
                  Ground pass (J)
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.emit({ kind: "THROUGH", passType: "THROUGH", power: 0.65 })}
                  className="rounded-full border border-teal-400/50 px-2.5 py-1 text-[11px] font-semibold text-teal-300"
                >
                  Through ball (L)
                </button>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dim)]">
                Skill moves — {practiceRef.current?.controlled.template.shortName} has {practiceRef.current?.controlled.template.skillMoves}★
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ALL_SKILL_MOVES.map((m) => {
                  const stars = practiceRef.current?.controlled.template.skillMoves ?? 1;
                  const locked = stars < m.stars;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={`${m.name} skill move, needs ${m.stars} stars`}
                      onClick={() => inputRef.current?.emit({ kind: "SKILL", moveId: m.id as SkillMoveId, lateralSign: 1 })}
                      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        borderColor: locked ? "var(--border)" : "var(--gold)",
                        color: locked ? "var(--dim)" : "var(--gold)",
                      }}
                    >
                      {m.name} · {m.stars}★{locked ? " (locked)" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">
              Touch: left thumb floats the stick anywhere on the left half; right buttons take tap, hold (power ring)
              and 4-way swipes at the same time — the two thumbs never steal each other&apos;s touches. Keyboard:
              WASD move · Shift sprint · J pass · K driven · L through · I lob · Space shoot (hold Q/E/F + Space for
              Finesse/Chip/Power) · C skill · Tab switch. Gamepad: left stick, A pass, Y through, X shoot, B skill, RT sprint.
            </p>
          </div>
          )}
          <p className="mt-2 text-sm text-[var(--dim)]">
            Phase 04 AI runs on the Phase 03 physics: quadratic drag, Magnus curl &amp; dip, post &amp; crossbar
            collision and mass-spring nets — with 22 utility-AI players and two trajectory-simulating goalkeepers
            stepped at a fixed 1/60s under the render loop (decisions at 10Hz, steering at 60Hz).
          </p>
        </section>
      )}
      {tab === "hub" && profile && (
        <MainHubScreen
          profile={profile}
          onPlay={() => setTab("modes")}
          onSquad={() => setTab("squad")}
          onPlayers={() => setTab("players")}
          onSettings={() => setTab("settings")}
          onInspect={setDetailInstanceId}
          onStore={() => setTab("store")}
          onMarket={() => setTab("market")}
          onQuests={() => setTab("quests")}
          onEvents={() => setTab("events")}
          onTraining={() => setTab("training")}
          onNations={() => setTab("nations")}
          onClubs={() => setTab("clubs")}
          onQuickMatch={() => selectClassicMode("MATCH")}
          onLaunchH2h={requestH2h}
          onLaunchVsa={launchVsa}
          onLaunchManager={launchManager}
          onAttack={requestAttack}
          onDefend={requestDefend}
          onCommit={(next) => commitProfile(next)}
          onPlayAsLegend={launchLegendsTrial}
          onViewLegend={(id) => { setPlayersFocusId(id); setTab("players"); }}
        />
      )}
      {tab === "store" && profile && (
        <StoreAndWalkoutScreen
          profile={profile}
          onCommit={(next) => commitProfile(next)}
          onGoToSquad={() => setTab("squad")}
        />
      )}
      {tab === "store" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "market" && profile && (
        <TransferMarketScreen
          profile={profile}
          onCommit={(next) => commitProfile(next)}
          onInspect={setDetailInstanceId}
        />
      )}
      {tab === "market" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "quests" && profile && (
        <QuestsAndPassScreen
          profile={profile}
          onCommit={(next) => commitProfile(next)}
        />
      )}
      {tab === "quests" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "modes" && profile && (
        <PlayModesScreen
          profile={profile}
          teamOvr={teamOvr}
          onLaunchH2h={requestH2h}
          onLaunchVsa={launchVsa}
          onLaunchManager={launchManager}
          onStartTournament={startTournament}
          onPlayTournamentTie={playTournamentTie}
          onLaunchSkill={launchSkill}
          onClassic={selectClassicMode}
          onOpenNations={() => setTab("nations")}
          onOpenClubs={() => setTab("clubs")}
          onAttack={requestAttack}
          onDefend={requestDefend}
          onLaunchCareer={launchCareerFixture}
          onCommit={(next) => commitProfile(next)}
        />
      )}
      {tab === "modes" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "hub" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "squad" && profile && (
        <SquadBuilderScreen
          profile={profile}
          onCommit={(next) => commitProfile(next)}
          onInspect={setDetailInstanceId}
          onReset={handleReset}
          resetNote={resetNote}
        />
      )}
      {tab === "squad" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "players" && <PlayersTab players={players} focusId={playersFocusId} />}
      {tab === "nations" && <NationalTeamsScreen onPlayFriendly={requestFriendly} profile={profile} onCommit={commitProfile} onPlayCupMatch={requestWorldCupMatch} />}
      {tab === "clubs" && (
        <ClubsScreen
          onPlayClub={requestClubFriendly}
          playAsClubId={profile?.playAsClubId ?? null}
          onSetPlayAs={(clubId) => {
            const prof = metaStore.getState().profile;
            if (prof) commitProfile({ ...prof, playAsClubId: clubId ?? undefined });
          }}
        />
      )}
      {tab === "events" && profile && (
        <EventsScreen
          profile={profile}
          onCommit={(next) => commitProfile(next)}
          onOpenStore={() => setTab("store")}
          onOpenQuests={() => setTab("quests")}
        />
      )}
      {tab === "events" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "training" && profile && (
        <TrainingScreen profile={profile} onLaunchSkill={launchSkill} onOpenSquad={() => setTab("squad")} />
      )}
      {tab === "training" && !profile && <p className="mt-6 text-sm text-[var(--dim)]">Loading save profile…</p>}
      {tab === "data" && (
        <>
          {!labsArmed && (
            <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm leading-relaxed text-[var(--dim)]">
                The verification suites (full headless AI matches, rules, economy and QA sweeps) run on
                demand so the game itself loads instantly. They take a few seconds.
              </p>
              <button
                type="button"
                onClick={() => setLabsArmed(true)}
                className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#0a120c]"
              >
                Run verification suites
              </button>
            </div>
          )}
          <DataTab eventLog={eventLog} />
        </>
      )}
      {tab === "settings" && (
        <SettingsScreen
          profile={profile}
          halfDuration={halfDuration}
          onHalfLength={handleHalfLength}
          onResetProfile={handleReset}
          onImportProfile={handleImportProfile}
        />
      )}
      {tab === "help" && (
        <HelpScreen onReplayTutorial={() => { setMoreOpen(false); launchTutorial(); }} />
      )}
      {profile && detailInstanceId && (
        <PlayerDetailScreen
          profile={profile}
          instanceId={detailInstanceId}
          onClose={() => setDetailInstanceId(null)}
          onCommit={(next) => commitProfile(next)}
        />
      )}

      {/* FC Mobile-style bottom navigation: five pinned destinations with
          live claim badges, plus a More sheet for the remaining sections.
          Fixed to the viewport bottom with safe-area padding; the page
          container carries pb-32 so content never hides behind it. */}
      <nav
        aria-label="Game sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[#070d1d]/96 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {moreOpen && (
          <div className="mx-auto grid max-w-5xl grid-cols-3 gap-1.5 border-b border-[var(--border)] px-3 py-2.5 sm:grid-cols-4" aria-label="More sections">
            {(
              [
                ["stadium", t("more.playStadium")],
                ["events", t("events.events")],
                ["training", t("modes.training")],
                ["market", t("market.market")],
                ["players", t("more.playerDatabase")],
                ["nations", t("clubs.nationalTeams")],
                ["clubs", t("clubs.clubs")],
                ["data", t("more.engineData")],
                ["settings", t("common.settings")],
                ["help", t("more.help")],
              ] as [TabId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => { if (id === "data") setLabsArmed(true); setTab(id); setMoreOpen(false); }}
                className="rounded-lg border px-2 py-2.5 text-center text-[12px] font-bold"
                style={{
                  borderColor: tab === id ? "var(--accent)" : "var(--border)",
                  background: tab === id ? "var(--accent-dim)" : "rgba(0,0,0,0.35)",
                  color: tab === id ? "var(--accent)" : "var(--text)",
                }}
              >
                {label}
                {id === "market" && profile && claimableSales(profile, Date.now()).length > 0 && (
                  <span className="tnum ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
                    {claimableSales(profile, Date.now()).length}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setMoreOpen(false); launchTutorial(); }}
              className="rounded-lg border border-[var(--gold)]/60 bg-[var(--gold)]/10 px-2 py-2.5 text-center text-[12px] font-bold text-[var(--gold)]"
            >
              {t("more.tutorial")}
            </button>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl grid-cols-6 px-1">
          {(
            [
              {
                id: "hub" as TabId, label: t("nav.home"), badge: 0, active: tab === "hub",
                icon: <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" fill="currentColor" />,
              },
              {
                id: "modes" as TabId, label: t("nav.play"), badge: 0, active: tab === "modes" || tab === "stadium",
                icon: <path d="M8 5.5v13l11-6.5z" fill="currentColor" />,
              },
              {
                id: "squad" as TabId, label: t("nav.myTeam"), badge: 0, active: tab === "squad",
                icon: <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z" fill="currentColor" />,
              },
              {
                id: "store" as TabId, label: t("nav.store"), badge: freePackReady ? 1 : 0, active: tab === "store",
                icon: <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8zm3.5 0a3.5 3.5 0 0 1 7 0H17a5 5 0 0 0-10 0H8.5z" fill="currentColor" />,
              },
              {
                id: "quests" as TabId, label: t("nav.quests"), badge: claimableQuestCount, active: tab === "quests",
                icon: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.7l-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z" fill="currentColor" />,
              },
            ]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.active}
              aria-label={item.badge > 0 ? `${item.label} — ${item.badge} ready to claim` : item.label}
              onClick={() => { setTab(item.id); setMoreOpen(false); }}
              className="relative flex flex-col items-center gap-0.5 py-2"
              style={{ color: item.active ? "var(--accent)" : "var(--dim)" }}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden>{item.icon}</svg>
              <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
              {item.active && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[var(--accent)]" />}
              {item.badge > 0 && (
                <span className="tnum absolute right-[16%] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9.5px] font-black text-white">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-label="More sections"
            onClick={() => setMoreOpen((v) => !v)}
            className="relative flex flex-col items-center gap-0.5 py-2"
            style={{ color: moreOpen || ["stadium", "events", "training", "market", "players", "nations", "clubs", "data", "settings"].includes(tab) ? "var(--accent)" : "var(--dim)" }}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden>
              <circle cx="5" cy="12" r="2.2" fill="currentColor" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
              <circle cx="19" cy="12" r="2.2" fill="currentColor" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider">{t("nav.more")}</span>
          </button>
        </div>
      </nav>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Players tab
// ---------------------------------------------------------------------------

type SortMode = "OVR_DESC" | "OVR_ASC" | "NAME" | "PAC";

function PlayersTab({ players, focusId }: { players: PlayerTemplate[]; focusId?: string | null }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<string>("ALL");
  const [clubId, setClubId] = useState<string>("ALL");
  const [rarity, setRarity] = useState<string>("ALL");
  const [minOvr, setMinOvr] = useState(60);
  const [sort, setSort] = useState<SortMode>("OVR_DESC");
  const [selectedId, setSelectedId] = useState<string>("leg_pelero");
  const [visibleCount, setVisibleCount] = useState(40);

  // Deep-link from the lobby Legends showcase: focus the requested player
  // with filters cleared so his card is on screen immediately.
  useEffect(() => {
    if (!focusId) return;
    setQuery(""); setPosition("ALL"); setClubId("ALL"); setRarity("ALL"); setMinOvr(60);
    setSelectedId(focusId);
  }, [focusId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (position !== "ALL" && p.position !== position) return false;
      if (clubId !== "ALL" && p.clubId !== clubId) return false;
      if (rarity !== "ALL" && p.rarity !== rarity) return false;
      if (p.baseOvr < minOvr) return false;
      return true;
    });
    switch (sort) {
      case "OVR_ASC": list.sort((a, b) => a.baseOvr - b.baseOvr); break;
      case "NAME": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "PAC": list.sort((a, b) => b.stats.pac - a.stats.pac); break;
      default: list.sort((a, b) => b.baseOvr - a.baseOvr);
    }
    return list;
  }, [players, query, position, clubId, rarity, minOvr, sort]);

  const selected = getPlayerById(selectedId) ?? filtered[0] ?? players[0];
  const clubName = (id: string) => ALL_CLUBS.find((c) => c.id === id)?.abbr ?? id;

  return (
    <section className="mt-5">
      <SectionTitle>{t('hub.playerDatabase')}</SectionTitle>
      <p className="mt-1 text-sm text-[var(--dim)]">
        <span className="tnum font-semibold text-[var(--text)]">{filtered.length}</span> of {players.length} players match.
        Every player in the game — the real stars of 32 national teams and 41 clubs, plus the original Striker FC roster.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Search by name
          <input
            aria-label="Search players by name"
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisibleCount(40); }}
            placeholder="e.g. Rahman, Pelero, Takahashi…"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Position
          <select aria-label="Filter by position" value={position} onChange={(e) => setPosition(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="ALL">All positions</option>
            {ALL_POSITIONS.map((p: Position) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Club
          <select aria-label="Filter by club" value={clubId} onChange={(e) => setClubId(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="ALL">All clubs</option>
            {ALL_CLUBS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Rarity
          <select aria-label="Filter by rarity" value={rarity} onChange={(e) => setRarity(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="ALL">All rarities</option>
            {ALL_RARITIES.map((r: Rarity) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Minimum OVR · <span className="tnum text-[var(--accent)]">{minOvr}</span>
          <input
            aria-label="Minimum overall rating"
            type="range"
            min={60}
            max={98}
            step={1}
            value={minOvr}
            onChange={(e) => setMinOvr(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--dim)]">
          Sort
          <select aria-label="Sort players" value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
            <option value="OVR_DESC">OVR high → low</option>
            <option value="OVR_ASC">OVR low → high</option>
            <option value="NAME">Name A–Z</option>
            <option value="PAC">Pace high → low</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {filtered.slice(0, visibleCount).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={selected?.id === p.id}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left"
                  style={{
                    borderColor: selected?.id === p.id ? "var(--accent)" : "var(--border)",
                    background: selected?.id === p.id ? "var(--surface2)" : "var(--surface)",
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="tnum font-display text-2xl font-bold" style={{ color: RARITY_COLORS[p.rarity]?.text ?? "#fff" }}>{p.baseOvr}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-[var(--dim)]">{p.position} · {clubName(p.clubId)} · {p.nationality}</span>
                    </span>
                  </span>
                  <RarityTag rarity={p.rarity} />
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--dim)]">
              No players match those filters. Lower the minimum OVR or clear the search.
            </p>
          )}
          {visibleCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + 40)}
              className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)]"
            >
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          {selected && <PlayerDetail player={selected} />}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Data tab
// ---------------------------------------------------------------------------

function DataTab({ eventLog }: { eventLog: string[] }) {
  const packs = getAllPacks();
  const formations = getAllFormations();
  const emitGoal = () => {
    matchEventBus.emit("MATCH_KICKOFF", { period: 1 });
    matchEventBus.emit("BALL_KICKED", { playerId: "leg_pelero", power: 0.86, shotType: "FINESSE", isShot: true });
    matchEventBus.emit("GOAL_SCORED", { scoringSide: "HOME", scorerId: "leg_pelero", assisterId: "leg_zidour", shotType: "FINESSE", xg: 0.42, minute: 37 });
    matchEventBus.emit("CROWD_EXCITEMENT", { level: 0.95 });
  };
  const emitPost = () => {
    matchEventBus.emit("BALL_KICKED", { playerId: "mst_haaland_e", power: 0.97, shotType: "POWER", isShot: true });
    matchEventBus.emit("POST_HIT", { speed: 31.4, position: createVec3(52.5, 2.1, -3.4) });
    matchEventBus.emit("GK_SAVE", { gkId: "leg_yashov", difficulty: 0.81, isParry: true });
    matchEventBus.emit("CROWD_EXCITEMENT", { level: 0.7 });
  };

  const pitchRows: [string, number][] = [
    ["Length", PITCH.LENGTH], ["Half length", PITCH.HALF_LENGTH], ["Width", PITCH.WIDTH], ["Half width", PITCH.HALF_WIDTH],
    ["Penalty area length", PITCH.PENALTY_AREA_LENGTH], ["Penalty area half width", PITCH.PENALTY_AREA_HALF_WIDTH],
    ["Goal area length", PITCH.GOAL_AREA_LENGTH], ["Goal area half width", PITCH.GOAL_AREA_HALF_WIDTH],
    ["Penalty spot distance", PITCH.PENALTY_SPOT_DIST], ["Center circle radius", PITCH.CENTER_CIRCLE_RADIUS],
    ["Goal width", PITCH.GOAL_WIDTH], ["Goal half width", PITCH.GOAL_HALF_WIDTH], ["Goal height", PITCH.GOAL_HEIGHT],
    ["Goal depth", PITCH.GOAL_DEPTH], ["Post radius", PITCH.POST_RADIUS],
  ];
  const ballRows: [string, number][] = [
    ["Radius", BALL_CONST.RADIUS], ["Mass (kg)", BALL_CONST.MASS], ["Gravity", BALL_CONST.GRAVITY],
    ["Air density", BALL_CONST.AIR_DENSITY], ["Drag coefficient", BALL_CONST.DRAG_COEFF], ["Magnus coefficient", BALL_CONST.MAGNUS_COEFF],
    ["Restitution · grass", BALL_CONST.RESTITUTION_GRASS], ["Restitution · post", BALL_CONST.RESTITUTION_POST],
    ["Roll friction · dry", BALL_CONST.ROLL_FRICTION_DRY],
  ];

  return (
    <section className="mt-5 space-y-8">
      <div>
        <SectionTitle>Event Bus — live wiring test</SectionTitle>
        <p className="mt-1 max-w-prose text-sm text-[var(--dim)]">
          The strongly-typed EventBus carries every match reaction (audio, replays, crowd, HUD) with no circular imports.
          Fire the test sequences and watch the typed events land.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={emitGoal} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[#0a120c]">
            Simulate goal sequence
          </button>
          <button type="button" onClick={emitPost} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold">
            Simulate post hit + save
          </button>
        </div>
        <ul aria-label="Event log" className="mt-3 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {eventLog.length === 0 && <li className="tnum text-sm text-[var(--dim)]">No events yet — fire a test sequence.</li>}
          {eventLog.map((line, i) => (
            <li key={i} className="tnum text-sm">{line}</li>
          ))}
        </ul>
      </div>

      <div>
        <SectionTitle>Physics constants</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <h3 className="font-display text-base font-semibold uppercase tracking-wider">Pitch (metres)</h3>
            <dl className="mt-2 space-y-1">
              {pitchRows.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-[var(--border)]/50 py-0.5">
                  <dt className="text-xs text-[var(--dim)]">{k}</dt>
                  <dd className="tnum text-xs font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <h3 className="font-display text-base font-semibold uppercase tracking-wider">Ball</h3>
            <dl className="mt-2 space-y-1">
              {ballRows.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-[var(--border)]/50 py-0.5">
                  <dt className="text-xs text-[var(--dim)]">{k}</dt>
                  <dd className="tnum text-xs font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-[var(--dim)]">
              Progression math check: XP to go from level 10 → 11 is{" "}
              <span className="tnum font-semibold text-[var(--text)]">{xpNeeded(10)}</span> (= round(120 × 1.18¹⁰));
              level 20 → 21 needs <span className="tnum font-semibold text-[var(--text)]">{xpNeeded(20)}</span>.
            </p>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Clubs</SectionTitle>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_CLUBS.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <span aria-hidden className="h-9 w-9 shrink-0 rounded" style={{ background: `linear-gradient(135deg, ${c.primary} 55%, ${c.secondary} 55%)`, border: "1px solid var(--border)" }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{c.name} <span className="text-[var(--dim)]">({c.abbr})</span></span>
                <span className="block text-xs text-[var(--dim)]">{c.league} · {getAllPlayers().filter((p) => p.clubId === c.id).length} players</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <SectionTitle>Formations</SectionTitle>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {formations.map((f) => (
            <li key={f.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <p className="text-sm font-bold">{f.name}</p>
              <p className="mt-0.5 text-xs text-[var(--dim)]">{f.slots.map((s) => s.role).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <SectionTitle>Store packs</SectionTitle>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {packs.map((pack) => (
            <li key={pack.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold">{pack.name}</p>
                <p className="tnum text-sm font-bold text-[var(--gold)]">
                  {pack.price === 0 ? "FREE" : `${formatNumber(pack.price)} ${pack.currency}`}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-[var(--dim)]">
                {pack.cardsCount} cards{pack.guaranteedMinRarity ? ` · guarantees ${pack.guaranteedMinRarity}+` : ""}
              </p>
              <div className="mt-2 space-y-1">
                {ALL_RARITIES.filter((r) => (pack.odds[r] ?? 0) > 0).map((r) => (
                  <div key={r} className="flex items-center gap-2">
                    <span className="w-14 text-[10px] font-bold uppercase tracking-wide" style={{ color: RARITY_COLORS[r]?.text ?? "#fff" }}>{r}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full" style={{ width: `${(pack.odds[r] ?? 0) * 100}%`, background: RARITY_COLORS[r]?.edge ?? "#888" }} />
                    </div>
                    <span className="tnum w-12 text-right text-[11px] text-[var(--dim)]">{((pack.odds[r] ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--dim)]">These are the exact odds the Store rolls — open packs from the Store tab; an 85+ pull plays the full walkout.</p>
      </div>

      <div>
        <SectionTitle>PlayStyles &amp; Quests</SectionTitle>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PLAY_STYLES.map((ps) => (
            <li key={ps.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <p className="text-sm font-bold text-[var(--accent)]">{ps.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--dim)]">{ps.description}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {QUESTS.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <span>
                <span className="block text-sm font-bold">{q.title}</span>
                <span className="block text-xs text-[var(--dim)]">{q.description} · {q.cadence.toLowerCase()}</span>
              </span>
              <span className="tnum shrink-0 text-xs font-semibold text-[var(--gold)]">
                {formatNumber(q.rewardCoins)}c{q.rewardGems > 0 ? ` · ${q.rewardGems}g` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

