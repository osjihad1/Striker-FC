// Striker FC — audio/CommentaryEngine.ts (Phase 06, Epic fix round)
// Event-driven broadcast commentary: a live 6-line ticker (with minute
// stamps) built from real match events and actual player names, plus an
// optional Web Speech voice (Settings → Commentary voice).
//
// Epic fix round (P0-3): the voice is a QUEUE, not a shout-over. The old
// engine called speechSynthesis.cancel() on every line, so the commentator
// constantly cut himself off mid-sentence. Now lines queue (max depth 3),
// a line is never cancelled mid-sentence, long lines are chunked at
// sentence boundaries, every line carries an emotion (rate/pitch), and the
// voice picker prefers a British male voice. Line builders stay pure so
// the verification lab can exercise them headlessly.

import { settingsStore } from '../store/useSettingsStore';
import { formatNumber } from '../i18n/i18n';
import type { ShotType, TeamSide } from '../core/types';
import {
  langClip,
  recordedClipPlayer,
  pickGoalClip,
  pickNearMissClip,
  pickSaveClip,
  type CommentaryClipId,
} from './RecordedAudio';

export interface CommentaryLine {
  text: string;
  /** Cycle-2: the Bengali rendering of the same line (design §7.13). The
   *  ticker shows it in বাংলা mode; speech only ever speaks it through a
   *  bn voice — with no bn voice the English line is spoken instead. */
  bnText?: string;
  atMinute: number;
}

export type CommentaryEmotion = 'EXCITED' | 'NEUTRAL' | 'SERIOUS' | 'TENSE';

/** Emotion → delivery: excited lines run faster and higher, serious ones
 *  (cards, VAR) slow down and drop. */
export const EMOTION_DELIVERY: Record<CommentaryEmotion, { rate: number; pitch: number }> = {
  EXCITED: { rate: 1.18, pitch: 1.02 },
  NEUTRAL: { rate: 1.06, pitch: 0.9 },
  TENSE: { rate: 1.12, pitch: 0.96 },
  SERIOUS: { rate: 0.96, pitch: 0.8 },
};

export interface GoalContext {
  scorerName: string;
  side: TeamSide;
  minute: number;
  xg: number;
  shotType: ShotType;
  homeScore: number;
  awayScore: number;
}

/** Pure goal call — names the scorer, reads the game state. */
export function goalLine(c: GoalContext): string {
  const score = `${c.homeScore}–${c.awayScore}`;
  const leads = (c.side === 'HOME' && c.homeScore > c.awayScore)
    || (c.side === 'AWAY' && c.awayScore > c.homeScore);
  const level = c.homeScore === c.awayScore;
  if (c.minute >= 80 && leads) {
    return `LATE WINNER! ${c.scorerName} strikes at ${c.minute}' — that could settle it! ${score}.`;
  }
  if (c.shotType === 'POWER' || (c.xg < 0.14 && c.shotType !== 'HEADER')) {
    return `WHAT A SCREAMER from ${c.scorerName}! Nobody is saving that — ${score} at ${c.minute}' (xG just ${c.xg.toFixed(2)}!).`;
  }
  if (c.shotType === 'HEADER') {
    return `GOAL! ${c.scorerName} rises highest and powers the header home — ${score}, ${c.minute}'.`;
  }
  if (level) {
    return `GOAL — ${c.scorerName} levels it up! ${score} at ${c.minute}', xG ${c.xg.toFixed(2)}.`;
  }
  if (leads) {
    return `GOAL! ${c.scorerName} puts his side in front — ${score} at ${c.minute}'.`;
  }
  return `GOAL! ${c.scorerName} finds the net — ${score} at ${c.minute}', xG ${c.xg.toFixed(2)}.`;
}

export function saveLine(gkName: string, difficulty: number, isParry: boolean): string {
  if (difficulty > 0.55) {
    return isParry
      ? `UNBELIEVABLE from ${gkName}! Fingertips — he parries a certain goal away!`
      : `WORLD-CLASS SAVE! ${gkName} somehow keeps that out!`;
  }
  return isParry
    ? `${gkName} gets down and parries it wide — good strong wrists.`
    : `Comfortable for ${gkName} — he gathers it cleanly.`;
}

/** Bengali goal call — same game-state branches as goalLine (design §7.13). */
export function goalLineBn(c: GoalContext): string {
  const score = `${formatNumber(c.homeScore)}–${formatNumber(c.awayScore)}`;
  const minute = formatNumber(c.minute);
  const leads = (c.side === 'HOME' && c.homeScore > c.awayScore)
    || (c.side === 'AWAY' && c.awayScore > c.homeScore);
  const level = c.homeScore === c.awayScore;
  if (c.minute >= 80 && leads) {
    return `শেষ মুহূর্তের জয়সূচক গোল! ${minute} মিনিটে ${c.scorerName}-র গোল — এটাই হয়তো ম্যাচ ঠিক করে দিল! ${score}।`;
  }
  if (c.shotType === 'POWER' || (c.xg < 0.14 && c.shotType !== 'HEADER')) {
    return `${c.scorerName}-র কী দারুণ শট! কেউ এটা থামাতে পারবে না — ${minute} মিনিটে ${score}।`;
  }
  if (c.shotType === 'HEADER') {
    return `গোল! ${c.scorerName} সবার উপরে উঠে হেডে গোল করলেন — ${minute} মিনিটে ${score}।`;
  }
  if (level) {
    return `গোল — ${c.scorerName} সমতা ফেরালেন! ${minute} মিনিটে ${score}।`;
  }
  if (leads) {
    return `গোল! ${c.scorerName} তার দলকে এগিয়ে দিলেন — ${minute} মিনিটে ${score}।`;
  }
  return `গোল! ${c.scorerName} জাল খুঁজে পেলেন — ${minute} মিনিটে ${score}।`;
}

/** Bengali save call (design §7.13). */
export function saveLineBn(gkName: string, difficulty: number, isParry: boolean): string {
  if (difficulty > 0.55) {
    return isParry
      ? `${gkName}-র অবিশ্বাস্য সেভ! আঙুলের ডগায় নিশ্চিত গোল ঠেকিয়ে দিলেন!`
      : `বিশ্বমানের সেভ! ${gkName} কোনোভাবে ঠেকিয়ে দিলেন!`;
  }
  return isParry
    ? `${gkName} নিচু হয়ে বল বাইরে ঠেলে দিলেন — দারুণ হাতের জোর।`
    : `${gkName}-র জন্য সহজ — পরিষ্কারভাবে ধরে নিলেন।`;
}

/** Split a line into speakable chunks (≤150 chars) at sentence boundaries. */
export function chunkLine(text: string, maxChars = 150): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (current && current.length + 1 + piece.length > maxChars) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
    // A single over-long sentence is hard-split at the last space.
    while (current.length > maxChars) {
      const cut = current.lastIndexOf(' ', maxChars);
      const at = cut > 40 ? cut : maxChars;
      chunks.push(current.slice(0, at).trim());
      current = current.slice(at).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** British male voice picker: named UK male voices first, then any en-GB,
 *  then any English voice. Returns null when no English voice exists. */
export function pickBritishMaleVoice<T extends { name: string; lang: string }>(voices: T[]): T | null {
  const maleNames = ['google uk english male', 'daniel', 'george', 'arthur', 'brian', 'ryan', 'thomas'];
  const gb = voices.filter((v) => v.lang.toLowerCase().startsWith('en-gb'));
  for (const needle of maleNames) {
    const hit = gb.find((v) => v.name.toLowerCase().includes(needle))
      ?? voices.find((v) => v.lang.toLowerCase().startsWith('en') && v.name.toLowerCase().includes(needle));
    if (hit) return hit;
  }
  return gb[0] ?? voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? null;
}

// ---------- Speech queue --------------------------------------------------------

export interface SpeechSynthLike {
  speak(utter: SpeechUtteranceLike): void;
  cancel(): void;
  speaking: boolean;
}

export interface SpeechUtteranceLike {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: unknown;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface QueuedLine {
  chunks: string[];
  emotion: CommentaryEmotion;
  priority: number; // 2 = goal/card/penalty, 1 = big moment, 0 = routine
}

/** Max lines waiting behind the one being spoken. */
export const SPEECH_QUEUE_MAX = 3;

/**
 * The commentator's queue. Invariants the lab asserts:
 *  - enqueue() NEVER cancels the line currently being spoken;
 *  - at most SPEECH_QUEUE_MAX lines wait; overflow drops the oldest
 *    low-priority line (a goal line can evict a routine one, never the
 *    reverse, and never the speaking line);
 *  - chunks of one line are spoken back-to-back before the next line.
 */
export class SpeechQueue {
  private queue: QueuedLine[] = [];
  private active: QueuedLine | null = null;
  private chunkIndex = 0;
  /** Test/observability hook: how many times cancel() was invoked. */
  cancelCount = 0;

  constructor(
    private readonly synth: SpeechSynthLike | null,
    private readonly makeUtterance: (text: string) => SpeechUtteranceLike,
    private readonly voiceFor: (utter: SpeechUtteranceLike) => boolean,
  ) {}

  get depth(): number {
    return this.queue.length + (this.active ? 1 : 0);
  }

  get waiting(): number {
    return this.queue.length;
  }

  enqueue(text: string, emotion: CommentaryEmotion, priority: number): void {
    if (!this.synth) return;
    const line: QueuedLine = { chunks: chunkLine(text), emotion, priority };
    if (this.active && this.queue.length >= SPEECH_QUEUE_MAX) {
      const dropIdx = this.queue.findIndex((q) => q.priority < priority);
      if (dropIdx === -1) return; // full of equal/higher priority — drop the new line
      this.queue.splice(dropIdx, 1);
    } else if (!this.active && this.queue.length >= SPEECH_QUEUE_MAX + 1) {
      this.queue.shift();
    }
    this.queue.push(line);
    this.pump();
  }

  /** Hard stop — used ONLY on match reset / engine teardown, never per line. */
  stopAll(): void {
    this.queue = [];
    this.active = null;
    this.chunkIndex = 0;
    if (this.synth) {
      this.cancelCount += 1;
      try { this.synth.cancel(); } catch { /* speech is a garnish */ }
    }
  }

  private pump(): void {
    if (!this.synth || this.active) return;
    const next = this.queue.shift();
    if (!next) return;
    this.active = next;
    this.chunkIndex = 0;
    this.speakChunk();
  }

  private speakChunk(): void {
    if (!this.synth || !this.active) return;
    const chunk = this.active.chunks[this.chunkIndex];
    if (chunk === undefined) {
      this.active = null;
      this.pump();
      return;
    }
    const utter = this.makeUtterance(chunk);
    const delivery = EMOTION_DELIVERY[this.active.emotion];
    utter.rate = delivery.rate;
    utter.pitch = delivery.pitch;
    utter.volume = 0.9;
    // voiceFor applies language/voice rules; false = keep this line on screen only.
    if (!this.voiceFor(utter)) {
      this.chunkIndex += 1;
      this.speakChunk();
      return;
    }
    const advance = () => {
      if (!this.active) return;
      this.chunkIndex += 1;
      if (this.chunkIndex >= this.active.chunks.length) {
        this.active = null;
        this.pump();
      } else {
        this.speakChunk();
      }
    };
    utter.onend = advance;
    utter.onerror = advance;
    try {
      this.synth.speak(utter);
    } catch {
      advance();
    }
  }
}

// ---------- Engine ---------------------------------------------------------------

export class CommentaryEngine {
  private lines: CommentaryLine[] = [];
  private listeners = new Set<(lines: CommentaryLine[]) => void>();
  private lastMinute = 0;
  private speech: SpeechQueue | null = null;
  // Audio-fix (2026-11-22): mute must cancel the Web Speech queue, not
  // just gate new lines. Subscribed in the constructor so the listener is
  // live from the moment the engine exists (before the first spoken line).
  private prevMuted = settingsStore.getState().muted;

  constructor() {
    settingsStore.subscribe(() => {
      const s = settingsStore.getState();
      if (s.muted && !this.prevMuted) this.speech?.stopAll();
      this.prevMuted = s.muted;
    });
  }

  subscribe(fn: (lines: CommentaryLine[]) => void): () => void {
    this.listeners.add(fn);
    fn([...this.lines]);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get current(): CommentaryLine[] {
    return [...this.lines];
  }

  reset(): void {
    this.lines = [];
    this.lastMinute = 0;
    this.speech?.stopAll();
    recordedClipPlayer.stop();
    this.emit();
  }

  private push(text: string, minute: number, emotion: CommentaryEmotion = 'NEUTRAL', priority = 0, bnText?: string, clip?: CommentaryClipId): void {
    if (!settingsStore.getState().commentaryOn) return;
    this.lastMinute = minute;
    this.lines = [...this.lines, { text, bnText, atMinute: minute }].slice(-6);
    this.emit();
    // Recorded voice first: a real clip replaces the Web Speech line so the
    // commentator never talks over himself. No clip → fall back to speech.
    const playedClip = clip ? recordedClipPlayer.play(clip) : false;
    if (!playedClip) this.speak(text, emotion, priority, bnText);
  }

  private emit(): void {
    const snapshot = [...this.lines];
    for (const fn of [...this.listeners]) fn(snapshot);
  }

  private ensureQueue(): SpeechQueue | null {
    if (this.speech) return this.speech;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const synth = window.speechSynthesis;
    this.speech = new SpeechQueue(
      {
        speak: (u) => synth.speak(u as SpeechSynthesisUtterance),
        cancel: () => synth.cancel(),
        get speaking() { return synth.speaking; },
      },
      (text) => new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike,
      (utter) => this.applyVoice(utter as unknown as SpeechSynthesisUtterance),
    );
    return this.speech;
  }

  /** Language/voice rules (Addendum 2 preserved): Bengali text is only ever
   *  read by a Bengali voice; English lines prefer a British male voice. */
  private applyVoice(utter: SpeechSynthesisUtterance): boolean {
    const s = settingsStore.getState();
    const text = utter.text;
    const hasBengali = /[\u0980-\u09FF]/.test(text);
    const voices = window.speechSynthesis.getVoices();
    if (s.language === 'bn' || hasBengali) {
      const bnVoice = voices.find((v) => v.lang.toLowerCase().startsWith('bn'));
      if (bnVoice) {
        utter.voice = bnVoice;
        utter.lang = bnVoice.lang;
        return true;
      }
      if (hasBengali) return false; // on-screen only — never Bengali in an English voice
      utter.lang = 'en-GB';
      return true;
    }
    const voice = pickBritishMaleVoice(voices);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = 'en-GB';
    }
    return true;
  }

  private speak(text: string, emotion: CommentaryEmotion, priority: number, bnText?: string): void {
    const s = settingsStore.getState();
    // Audio-fix (2026-11-22): muted must silence the Web Speech fallback
    // too. Previously push() fell through here when the recorded clip
    // refused to play while muted, so muting forced the spoken line.
    if (s.muted) return;
    if (!s.commentaryOn || !s.commentarySpeech) return;
    // Design §5.3: in বাংলা mode the Bengali line is spoken ONLY when a
    // bn voice exists on the device; otherwise the English line is spoken
    // (never Bengali script through an English voice).
    let toSpeak = text;
    if (s.language === 'bn' && bnText) {
      let hasBnVoice = false;
      try {
        hasBnVoice = window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('bn'));
      } catch {
        hasBnVoice = false;
      }
      toSpeak = hasBnVoice ? bnText : text;
    }
    try {
      this.ensureQueue()?.enqueue(toSpeak, emotion, priority);
    } catch {
      // Speech is a garnish — never let it break the match.
    }
  }

  onGoal(c: GoalContext): void {
    const lang = settingsStore.getState().language;
    this.push(goalLine(c), c.minute, 'EXCITED', 2, goalLineBn(c), pickGoalClip(c.minute, lang));
  }

  onSave(args: { gkName: string; difficulty: number; isParry: boolean }): void {
    const lang = settingsStore.getState().language;
    this.push(saveLine(args.gkName, args.difficulty, args.isParry), this.lastMinute, args.difficulty > 0.55 ? 'EXCITED' : 'NEUTRAL', 1, saveLineBn(args.gkName, args.difficulty, args.isParry), lang === 'bn' ? 'save-bn' : pickSaveClip());
  }

  onPost(): void {
    const lang = settingsStore.getState().language;
    this.push('OFF THE WOODWORK! Inches away — the whole stadium gasps!', this.lastMinute, 'EXCITED', 1, 'পোস্টে লেগে ফিরে এলো! অল্পের জন্য গোল হলো না — পুরো স্টেডিয়াম হতবাক!', lang === 'bn' ? 'near-miss-bn' : 'near-miss-02');
  }

  onNearMiss(args: { shooterName: string; xg: number }): void {
    const lang = settingsStore.getState().language;
    this.push(
      args.xg > 0.3
        ? `SO CLOSE! ${args.shooterName} drags it inches wide — that was the chance!`
        : `${args.shooterName} lets fly — but it sails off target.`,
      this.lastMinute, args.xg > 0.3 ? 'TENSE' : 'NEUTRAL', args.xg > 0.3 ? 1 : 0,
      `${args.shooterName}-র শট অল্পের জন্য বাইরে।`,
      lang === 'bn' ? 'near-miss-bn' : pickNearMissClip(),
    );
  }

  onFoul(args: { playerName: string }): void {
    const lang = settingsStore.getState().language;
    this.push(`Foul — ${args.playerName} is penalised and the whistle goes.`, this.lastMinute, 'NEUTRAL', 0, `ফাউল — ${args.playerName}-র বিরুদ্ধে বাঁশি।`, langClip('foul', 'foul-bn', lang));
  }

  onOffside(args: { playerName: string }): void {
    const lang = settingsStore.getState().language;
    this.push(`Flag is up — ${args.playerName} strayed offside. No goal, play restarts.`, this.lastMinute, 'SERIOUS', 1, `পতাকা উঠেছে — ${args.playerName} অফসাইডে ছিলেন। গোল নয়, খেলা আবার শুরু।`, langClip('offside', 'offside-bn', lang));
  }

  onCard(args: { playerName: string; card: 'YELLOW' | 'RED' }): void {
    const lang = settingsStore.getState().language;
    this.push(
      args.card === 'RED'
        ? `RED CARD! ${args.playerName} is sent off — his team must survive with ten men!`
        : `${args.playerName} goes into the book — yellow card.`,
      this.lastMinute, 'SERIOUS', 2,
      args.card === 'RED'
        ? `লাল কার্ড! ${args.playerName} মাঠ ছাড়তে হবে!`
        : `${args.playerName}-কে হলুদ কার্ড।`,
      args.card === 'RED' ? langClip('red', 'red-bn', lang) : langClip('yellow', 'yellow-bn', lang),
    );
  }

  onTackle(args: { tacklerName: string; isSlide: boolean }): void {
    this.push(
      args.isSlide
        ? `CRUNCHING slide tackle from ${args.tacklerName} — perfectly timed, ball won!`
        : `${args.tacklerName} steps in and wins it cleanly.`,
      this.lastMinute, 'TENSE', 0,
      `${args.tacklerName}-র কী দারুণ ট্যাকল!`,
    );
  }

  onSkill(args: { playerName: string }): void {
    this.push(`OH, FILTHY! ${args.playerName} leaves his man for dead with a piece of pure skill!`, this.lastMinute, 'EXCITED', 1, `${args.playerName} প্রতিপক্ষকে পেছনে ফেলে দিলেন!`);
  }

  onSubstitution(args: { offName: string; onName: string }): void {
    const lang = settingsStore.getState().language;
    this.push(`Change made — ${args.onName} comes on for ${args.offName}. Fresh legs for the run-in.`, this.lastMinute, 'NEUTRAL', 0, `বদলি — ${args.offName}-র জায়গায় ${args.onName} আসছেন।`, langClip('substitution', 'substitution-bn', lang));
  }

  onPenalty(args: { side: TeamSide }): void {
    const lang = settingsStore.getState().language;
    this.push(
      args.side === 'HOME'
        ? 'PENALTY! The referee points to the spot — a golden chance to score!'
        : 'PENALTY AGAINST! The referee points to the spot — the keeper has to be the hero now!',
      this.lastMinute, 'TENSE', 2,
      'পেনাল্টি! রেফারি স্পটের দিকে ইশারা করলেন!',
      langClip('penalty', 'penalty-bn', lang),
    );
  }

  onCorner(args: { side: TeamSide }): void {
    const lang = settingsStore.getState().language;
    this.push(
      args.side === 'HOME'
        ? 'Corner — the big men come up from the back. This crowd smells a goal.'
        : 'Corner to the visitors — the defence has to stay switched on here.',
      this.lastMinute, 'NEUTRAL', 0,
      'কর্নার এলো…',
      langClip('corner', 'corner-bn', lang),
    );
  }

  onFreeKick(args: { side: TeamSide; indirect: boolean }): void {
    const lang = settingsStore.getState().language;
    this.push(
      args.indirect
        ? 'Free kick in a harmless area — a chance to reset and breathe.'
        : 'Free kick in shooting range! The wall lines up, the keeper shuffles across…',
      this.lastMinute, args.indirect ? 'NEUTRAL' : 'TENSE', args.indirect ? 0 : 1,
      'বিপজ্জনক জায়গায় ফ্রি কিক…',
      args.indirect ? undefined : langClip('freekick', 'freekick-bn', lang),
    );
  }

  onVar(args: { decision: string }): void {
    this.push(`VAR check complete — ${args.decision}. The stadium holds its breath no longer.`, this.lastMinute, 'SERIOUS', 1);
  }

  onPatternAdapted(args: { lane: 'LEFT' | 'CENTRE' | 'RIGHT' }): void {
    const laneText = args.lane === 'LEFT' ? 'down the left' : args.lane === 'RIGHT' ? 'down the right' : 'through the middle';
    this.push(`The opposition have read the pattern — everything has been going ${laneText}, and now they are overloading that side. The manager may need a new idea.`, this.lastMinute, 'SERIOUS', 1);
  }

  onHalfTime(homeScore: number, awayScore: number): void {
    const lang = settingsStore.getState().language;
    this.push(`HALF TIME — ${homeScore}–${awayScore}. The managers earn their money now: fifteen minutes to change this game.`, 45, 'NEUTRAL', 1, `বিরতি — ${formatNumber(homeScore)}–${formatNumber(awayScore)}। দুই দলেরই বিশ্রাম।`, langClip('halftime', 'halftime-bn', lang));
  }

  onKickoff(period: number): void {
    const lang = settingsStore.getState().language;
    this.push(
      period === 1
        ? 'We are under way — ninety minutes of football ahead of us.'
        : period === 2
          ? 'Second half under way — everything still to play for.'
          : 'Extra time — thirty minutes to find a winner, or penalties await.',
      period === 1 ? 0 : period === 2 ? 46 : 91,
      'NEUTRAL', 1,
      period === 1
        ? 'খেলা শুরু! সামনে নব্বই মিনিটের ফুটবল।'
        : period === 2
          ? 'দ্বিতীয়ার্ধ শুরু — এখনো সবকিছু বাকি।'
          : 'অতিরিক্ত সময় — জয়ী খুঁজতে ত্রিশ মিনিট, নয়তো পেনাল্টি।',
      period === 1 ? (lang === 'bn' ? 'kickoff-bn' : 'kickoff') : undefined,
    );
  }

  onFullTime(homeScore: number, awayScore: number): void {
    const lang = settingsStore.getState().language;
    const homeWin = homeScore > awayScore;
    this.push(
      `FULL TIME — it ends ${homeScore}–${awayScore}. What a match at this stadium!`,
      90, 'EXCITED', 2,
      `খেলা শেষ — ${formatNumber(homeScore)}–${formatNumber(awayScore)}।`,
      homeWin ? (lang === 'bn' ? 'win-bn' : 'win') : langClip('fulltime', 'fulltime-bn', lang),
    );
  }
}

// ---------- Verification lab ------------------------------------------------------

export interface CommentaryLabResult {
  queueOk: boolean;
  noCancelOk: boolean;
  chunkOk: boolean;
  voiceOk: boolean;
  emotionOk: boolean;
  tickerOk: boolean;
  detail: string;
}

/** Headless checks of the speech queue with a fake synth: the queue must
 *  never cancel mid-sentence, must cap depth at 3 waiting lines, must
 *  chunk long lines, and must deliver emotion rate/pitch. */
export function runCommentaryLab(): CommentaryLabResult {
  const spoken: SpeechUtteranceLike[] = [];
  let cancels = 0;
  const fakeSynth: SpeechSynthLike = {
    speaking: false,
    speak: (u) => { spoken.push(u); },
    cancel: () => { cancels += 1; },
  };
  const queue = new SpeechQueue(
    fakeSynth,
    (text): SpeechUtteranceLike => ({
      text, rate: 1, pitch: 1, volume: 1, voice: null, lang: 'en-GB', onend: null, onerror: null,
    }),
    () => true,
  );
  queue.enqueue('First line.', 'NEUTRAL', 0);
  queue.enqueue('Second line.', 'EXCITED', 2);
  queue.enqueue('Third line.', 'NEUTRAL', 0);
  queue.enqueue('Fourth line.', 'NEUTRAL', 0);
  queue.enqueue('Fifth routine line.', 'NEUTRAL', 0); // queue full of ≥ priority → dropped
  queue.enqueue('GOAL! A priority line that evicts a routine one.', 'EXCITED', 2);
  const depthCapped = queue.waiting <= SPEECH_QUEUE_MAX;
  // Drain: finishing each utterance must advance through the queue.
  let guard = 0;
  while (spoken.length > 0 && guard < 40) {
    guard += 1;
    const u = spoken.shift()!;
    u.onend?.();
  }
  const noCancelOk = cancels === 0 && queue.cancelCount === 0;
  const queueOk = depthCapped && guard > 3;
  const longLine = 'One very long sentence that rambles on and on about the football match. '.repeat(6).trim();
  const chunks = chunkLine(longLine);
  const chunkOk = chunks.length >= 3 && chunks.every((c) => c.length <= 150 + 40);
  const voice = pickBritishMaleVoice([
    { name: 'Microsoft Zira', lang: 'en-US' },
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Google UK English Female', lang: 'en-GB' },
  ]);
  const voiceOk = voice?.name === 'Daniel';
  const emotionOk = EMOTION_DELIVERY.EXCITED.rate > EMOTION_DELIVERY.NEUTRAL.rate
    && EMOTION_DELIVERY.SERIOUS.pitch < EMOTION_DELIVERY.NEUTRAL.pitch;
  // Ticker: the engine keeps the last 6 lines with minute stamps.
  const engine = new CommentaryEngine();
  for (let i = 0; i < 8; i += 1) engine.onCorner({ side: 'HOME' });
  const tickerOk = engine.current.length === 6 && engine.current.every((l) => typeof l.atMinute === 'number');
  return {
    queueOk, noCancelOk, chunkOk, voiceOk, emotionOk, tickerOk,
    detail: `queue depth capped at ${SPEECH_QUEUE_MAX} waiting, cancels during play: ${cancels}, long line → ${chunks.length} chunks, voice pick: ${voice?.name ?? 'none'}`,
  };
}
