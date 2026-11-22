// Striker FC — audio/AudioEngine.ts (Phase 06, Spec 07 §5)
// Master Web Audio engine: one shared AudioContext, four independent gain
// buses (Master / SFX / Crowd / UI) synced live to useSettingsStore, and a
// safe unlock on the first user pointer/key gesture (autoplay policy).
// The StadiumAudioDirector wires the typed EventBus to the crowd bed, the
// procedural SFX synths and the commentary engine — no module imports audio
// directly, everything reacts to match events.

import { matchEventBus } from '../core/EventBus';
import { getPlayerById } from '../data/PlayerDatabase';
import { settingsStore } from '../store/useSettingsStore';
import { CommentaryEngine, goalLine } from './CommentaryEngine';
import { CrowdAudio, generatePinkNoise } from './CrowdAudio';
import { MatchSFX, GOAL_STING_FREQS, WHISTLE_FREQS, whistlePattern, type WhistleKind } from './MatchSFX';
import { StadiumAmbience, type AmbienceWeather } from './StadiumAmbience';

export type { WhistleKind };

/** Pure bus-gain mapping from settings — also exercised by the audio lab.
 *  Phase 10: an explicit UI bus slider and a global mute (master → 0). */
export function busGainsFor(s: {
  masterVolume: number; crowdVolume: number; sfxVolume: number;
  uiVolume?: number; muted?: boolean;
}): {
  master: number; crowd: number; sfx: number; ui: number;
} {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const master = s.muted ? 0 : clamp01(s.masterVolume);
  return {
    master,
    crowd: clamp01(s.crowdVolume),
    sfx: clamp01(s.sfxVolume),
    ui: s.muted ? 0 : clamp01(s.uiVolume ?? s.masterVolume * 0.85),
  };
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private crowdBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private unlockInstalled = false;
  private settingsOff: (() => void) | null = null;

  /** Create (once) the context + buses. Returns false where Web Audio is absent. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    const AC: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC) return false;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.crowdBus = ctx.createGain();
    this.crowdBus.connect(this.master);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.syncFromSettings();
    if (!this.settingsOff) {
      this.settingsOff = settingsStore.subscribe(() => this.syncFromSettings());
    }
    return true;
  }

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** First pointer/key gesture unlocks audio (browser autoplay policy). */
  installUnlock(onUnlocked?: () => void): void {
    if (this.unlockInstalled || typeof window === 'undefined') return;
    this.unlockInstalled = true;
    const unlock = () => {
      if (this.ensure()) onUnlocked?.();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  syncFromSettings(): void {
    if (!this.ctx) return;
    const s = settingsStore.getState();
    const g = busGainsFor(s);
    const t = this.ctx.currentTime;
    const ramp = (node: GainNode | null, v: number) => {
      node?.gain.setTargetAtTime(v, t, 0.06);
    };
    ramp(this.master, g.master);
    ramp(this.crowdBus, g.crowd);
    ramp(this.sfxBus, g.sfx);
    ramp(this.uiBus, g.ui);
  }

  get sfxOut(): GainNode | null { return this.sfxBus; }
  get crowdOut(): GainNode | null { return this.crowdBus; }
  get uiOut(): GainNode | null { return this.uiBus; }
  get masterOut(): GainNode | null { return this.master; }
}

export const audioEngine = new AudioEngine();

// ---------------------------------------------------------------------------
// Director: EventBus → crowd / SFX / commentary
// ---------------------------------------------------------------------------

class StadiumAudioDirector {
  readonly crowd = new CrowdAudio();
  readonly sfx = new MatchSFX();
  readonly commentary = new CommentaryEngine();
  readonly ambience = new StadiumAmbience();
  private installed = false;
  private offs: (() => void)[] = [];
  private scoreHome = 0;
  private scoreAway = 0;
  private crowdTarget = -1;
  private swishTimer: ReturnType<typeof setTimeout> | null = null;

  install(): void {
    if (this.installed) return;
    this.installed = true;
    const startBeds = () => {
      if (audioEngine.ctx && audioEngine.crowdOut) {
        this.crowd.start(audioEngine.ctx, audioEngine.crowdOut);
        if (audioEngine.masterOut) {
          this.ambience.start(audioEngine.ctx, audioEngine.crowdOut, audioEngine.masterOut);
        }
      }
    };
    audioEngine.installUnlock(startBeds);
    // If a gesture already created the context before install, start the bed.
    startBeds();
    const name = (id: string) => getPlayerById(id)?.name ?? 'The player';
    const short = (id: string) => getPlayerById(id)?.shortName ?? 'Player';
    this.offs = [
      matchEventBus.on('BALL_KICKED', (p) => {
        if (!audioEngine.ctx || !audioEngine.sfxOut) return;
        if (p.isShot) this.sfx.shotStrike(audioEngine.ctx, audioEngine.sfxOut, p.power, p.shotType === 'POWER');
        else this.sfx.passTap(audioEngine.ctx, audioEngine.sfxOut, p.power);
      }),
      matchEventBus.on('POST_HIT', (p) => {
        if (audioEngine.ctx && audioEngine.sfxOut) this.sfx.postPing(audioEngine.ctx, audioEngine.sfxOut, p.speed);
        this.crowd.gasp();
        this.commentary.onPost();
      }),
      matchEventBus.on('GOAL_SCORED', (p) => {
        if (p.scoringSide === 'HOME') this.scoreHome += 1; else this.scoreAway += 1;
        this.crowd.erupt();
        // Epic fix round: the goal sting + the reverb wet swell ride the eruption.
        if (audioEngine.ctx && audioEngine.sfxOut) this.sfx.goalSting(audioEngine.ctx, audioEngine.sfxOut);
        if (audioEngine.ctx) this.ambience.goalWetBoost(audioEngine.ctx);
        // The swish lands as the ball hits the net, just after the strike.
        if (this.swishTimer) clearTimeout(this.swishTimer);
        this.swishTimer = setTimeout(() => {
          if (audioEngine.ctx && audioEngine.sfxOut) this.sfx.netSwish(audioEngine.ctx, audioEngine.sfxOut);
        }, 320);
        this.commentary.onGoal({
          scorerName: name(p.scorerId),
          side: p.scoringSide,
          minute: p.minute,
          xg: p.xg,
          shotType: p.shotType,
          homeScore: this.scoreHome,
          awayScore: this.scoreAway,
        });
      }),
      matchEventBus.on('GK_SAVE', (p) => {
        this.crowd.gasp();
        this.commentary.onSave({ gkName: name(p.gkId), difficulty: p.difficulty, isParry: p.isParry });
      }),
      matchEventBus.on('OFFSIDE_CALLED', (p) => {
        this.whistle('FOUL');
        this.commentary.onOffside({ playerName: name(p.offendingPlayerId) });
      }),
      matchEventBus.on('FOUL_COMMITTED', (p) => {
        this.whistle('FOUL');
        if (p.card !== 'NONE') {
          this.commentary.onCard({ playerName: name(p.foulerId), card: p.card });
        } else {
          this.commentary.onFoul({ playerName: name(p.foulerId) });
        }
      }),
      matchEventBus.on('MATCH_KICKOFF', (p) => {
        this.whistle('KICKOFF');
        this.commentary.onKickoff(p.period);
      }),
      matchEventBus.on('MATCH_ENDED', (p) => {
        this.whistle('FULL_TIME');
        this.commentary.onFullTime(p.homeScore, p.awayScore);
      }),
      matchEventBus.on('CROWD_EXCITEMENT', (p) => {
        this.crowd.setExcitement(Math.max(this.crowdTarget, p.level));
      }),
      // Epic fix round: the expanded commentary vocabulary — every engine
      // event with a story gets a line through the (now queued) voice.
      matchEventBus.on('TACKLE_WON', (p) => {
        this.commentary.onTackle({ tacklerName: name(p.tacklerId), isSlide: p.isSlide });
      }),
      matchEventBus.on('SKILL_BEAT', (p) => {
        this.commentary.onSkill({ playerName: name(p.playerId) });
      }),
      matchEventBus.on('SHOT_OFF_TARGET', (p) => {
        this.commentary.onNearMiss({ shooterName: name(p.shooterId), xg: p.xg });
      }),
      matchEventBus.on('BIG_SAVE', (p) => {
        this.commentary.onSave({ gkName: name(p.gkId), difficulty: Math.max(0.6, p.difficulty), isParry: true });
      }),
      matchEventBus.on('SUBSTITUTION', (p) => {
        this.commentary.onSubstitution({ offName: name(p.offId), onName: name(p.onId) });
      }),
      matchEventBus.on('PENALTY_AWARDED', (p) => {
        this.whistle('FOUL');
        this.commentary.onPenalty({ side: p.side });
      }),
      matchEventBus.on('HALF_TIME', (p) => {
        this.whistle('HALF_TIME');
        this.commentary.onHalfTime(p.homeScore, p.awayScore);
      }),
      matchEventBus.on('CORNER_TAKEN', (p) => {
        this.commentary.onCorner({ side: p.side });
      }),
      matchEventBus.on('FREE_KICK_TAKEN', (p) => {
        this.commentary.onFreeKick({ side: p.side, indirect: p.indirect });
      }),
      matchEventBus.on('CARD_SHOWN', (p) => {
        this.commentary.onCard({ playerName: name(p.playerId), card: p.card });
      }),
      matchEventBus.on('VAR_DECISION', (p) => {
        this.commentary.onVar({ decision: p.decision });
      }),
      matchEventBus.on('PATTERN_ADAPTED', (p) => {
        this.commentary.onPatternAdapted({ lane: p.lane });
      }),
      matchEventBus.on('WHISTLE', (p) => {
        if (p.pattern === 'HALF_TIME') this.whistle('HALF_TIME');
        else if (p.pattern === 'FULL_TIME') this.whistle('FULL_TIME');
        else if (p.pattern === 'KICKOFF') this.whistle('KICKOFF');
        else this.whistle('FOUL');
      }),
    ];
    void short;
  }

  uninstall(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.installed = false;
  }

  resetMatch(): void {
    this.scoreHome = 0;
    this.scoreAway = 0;
    this.crowdTarget = -1;
    this.commentary.reset();
  }

  /** Weather layers + floodlight hum follow the stadium's weather preset. */
  setAmbienceWeather(weather: AmbienceWeather): void {
    if (audioEngine.ctx) this.ambience.setWeather(audioEngine.ctx, weather);
  }

  whistle(kind: WhistleKind): void {
    if (audioEngine.ctx && audioEngine.sfxOut) this.sfx.whistle(audioEngine.ctx, audioEngine.sfxOut, kind);
  }

  uiClick(): void {
    if (audioEngine.ctx && audioEngine.uiOut) this.sfx.uiClick(audioEngine.ctx, audioEngine.uiOut);
  }

  /**
   * Ambient crowd level from the ball's position, called at the 20Hz HUD
   * sync: quiet midfield hum, a rising swell in the attacking third, and a
   * held roar while a shot is in flight.
   */
  updateCrowd(ballX: number, shotInFlight: boolean): void {
    const ax = Math.abs(ballX);
    let level = 0.22 + Math.max(0, ax - 12) / 40 * 0.45; // 0.22 midfield → ~0.67 at the box edge
    if (ax > PITCH_BOX_X) level = 0.85;
    if (shotInFlight) level = Math.max(level, 0.8);
    level = Math.min(1, level);
    if (this.crowdTarget < 0 || Math.abs(level - this.crowdTarget) > 0.03) {
      this.crowdTarget = level;
      this.crowd.setExcitement(level);
    }
  }
}

const PITCH_BOX_X = 36; // |x| beyond this is inside/around the penalty area

export const stadiumAudio = new StadiumAudioDirector();

// ---------------------------------------------------------------------------
// Deterministic Phase 06 audio lab — pure-math verification of the synth
// recipes (pink-noise bed, whistle recipe, bus mapping, commentary naming).
// ---------------------------------------------------------------------------

export interface AudioLabResult {
  pinkNoiseOk: boolean;
  pinkNoiseRms: number;
  whistleOk: boolean;
  busGainsOk: boolean;
  commentaryOk: boolean;
  goalStingOk: boolean;
  sampleLine: string;
}

export function runAudioLab(): AudioLabResult {
  const buf = generatePinkNoise(8192, 1234);
  let sumSq = 0;
  let finite = true;
  for (const v of buf) {
    if (!Number.isFinite(v)) finite = false;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / buf.length);
  const pattern = whistlePattern('FULL_TIME');
  const whistleOk = WHISTLE_FREQS.length === 2
    && WHISTLE_FREQS[0] === 2780 && WHISTLE_FREQS[1] === 2845
    && pattern.length === 3 && whistlePattern('FOUL').length === 1 && whistlePattern('HALF_TIME').length === 2;
  const g = busGainsFor({ masterVolume: 0.8, crowdVolume: 0.5, sfxVolume: 1.4 });
  const busGainsOk = g.master === 0.8 && g.crowd === 0.5 && g.sfx === 1 && Math.abs(g.ui - 0.68) < 1e-9;
  const line = goalLine({
    scorerName: 'Hamza Rahman', side: 'HOME', minute: 83, xg: 0.12,
    shotType: 'POWER', homeScore: 2, awayScore: 1,
  });
  return {
    pinkNoiseOk: finite && rms > 0.05 && rms < 0.9,
    pinkNoiseRms: rms,
    whistleOk,
    busGainsOk,
    commentaryOk: line.includes('Rahman'),
    goalStingOk: GOAL_STING_FREQS.length === 4
      && GOAL_STING_FREQS[0] === 523.25 && GOAL_STING_FREQS[3] === 1046.5,
    sampleLine: line,
  };
}
