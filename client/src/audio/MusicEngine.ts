// Striker FC — audio/MusicEngine.ts (Epic P1-2)
// Procedural music: no audio files, everything is synthesized WebAudio.
// The lobby loop is a 96 BPM A-minor progression (Am–F–C–G), 8 bars =
// exactly 20.000 s, scheduled with a lookahead timer so the loop is
// seamless. A soft pad + plucked bass + a simple lead arpeggio; the whole
// bus ducks to near-silence while a match is on screen (setScene).

import { settingsStore } from '../store/useSettingsStore';

const BPM = 96;
const BAR_SEC = (60 / BPM) * 4; // 2.5 s
const LOOP_BARS = 8;
export const LOOP_SEC = BAR_SEC * LOOP_BARS; // 20.000 s

// Am – F – C – G, two bars each. Frequencies in Hz (A2-based roots).
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // Am
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // Am
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F
  { root: 130.81, tones: [196.0, 261.63, 329.63] }, // C
  { root: 130.81, tones: [196.0, 261.63, 329.63] }, // C
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G
];

class MusicEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private timer: number | null = null;
  private nextBarAt = 0;
  private barIndex = 0;
  private scene: 'MENU' | 'MATCH' = 'MENU';
  private started = false;

  /** Start (or resume) the music bus. Safe to call on every render. */
  start(): void {
    if (this.started) { void this.ctx?.resume().catch(() => undefined); return; }
    const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.targetGain();
    this.bus.connect(this.ctx.destination);
    this.started = true;
    this.nextBarAt = this.ctx.currentTime + 0.1;
    this.barIndex = 0;
    // Lookahead scheduler: keep ~2 bars queued at all times.
    this.timer = window.setInterval(() => this.schedule(), 400);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.ctx) { void this.ctx.close().catch(() => undefined); this.ctx = null; }
    this.bus = null;
    this.started = false;
  }

  /** Matches duck the music to a whisper; menus play it at full setting. */
  setScene(scene: 'MENU' | 'MATCH'): void {
    this.scene = scene;
    if (this.bus && this.ctx) {
      this.bus.gain.setTargetAtTime(this.targetGain(), this.ctx.currentTime, 0.4);
    }
  }

  private targetGain(): number {
    const s = settingsStore.getState();
    if (!s.musicEnabled || s.muted) return 0;
    const base = s.musicVolume * s.masterVolume * 0.5;
    return this.scene === 'MATCH' ? base * 0.06 : base; // ≈ −18 dB duck in matches (plus master trim)
  }

  private schedule(): void {
    if (!this.ctx || !this.bus) return;
    const s = settingsStore.getState();
    if (!s.musicEnabled || s.muted) {
      if (this.bus.gain.value !== 0) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    } else {
      const g = this.targetGain();
      if (Math.abs(this.bus.gain.value - g) > 0.01) this.bus.gain.setTargetAtTime(g, this.ctx.currentTime, 0.3);
    }
    while (this.nextBarAt < this.ctx.currentTime + BAR_SEC * 2) {
      this.playBar(this.barIndex % LOOP_BARS, this.nextBarAt);
      this.nextBarAt += BAR_SEC;
      this.barIndex += 1;
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, peak: number, dest: GainNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private playBar(bar: number, at: number): void {
    if (!this.ctx || !this.bus) return;
    const chord = CHORDS[bar]!;
    // Pad: the chord tones, soft triangles across the whole bar.
    for (const f of chord.tones) this.tone(f, at, BAR_SEC * 0.98, 'triangle', 0.05, this.bus);
    // Bass: root on beats 1 and 3.
    this.tone(chord.root, at, BAR_SEC * 0.45, 'sine', 0.16, this.bus);
    this.tone(chord.root, at + BAR_SEC / 2, BAR_SEC * 0.4, 'sine', 0.12, this.bus);
    // Arpeggio: eighth-note plucks cycling the chord tones + octave.
    const arp = [...chord.tones, chord.tones[1]! * 2];
    for (let i = 0; i < 8; i += 1) {
      const f = arp[i % arp.length]!;
      this.tone(f, at + (i * BAR_SEC) / 8, 0.22, 'square', 0.018, this.bus);
    }
  }

  /** Short fanfare for pack walkouts / trophy wins (rarity-scaled length). */
  sting(kind: 'WIN' | 'LOSE' | 'PACK'): void {
    const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!AC) return;
    if (!this.ctx) this.start();
    if (!this.ctx || !this.bus) return;
    const now = this.ctx.currentTime + 0.02;
    const notes = kind === 'LOSE'
      ? [329.63, 293.66, 261.63, 220.0]
      : kind === 'PACK'
        ? [261.63, 329.63, 392.0, 523.25, 659.25]
        : [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      this.tone(f, now + i * 0.13, 0.5, 'triangle', 0.14, this.bus!);
      this.tone(f / 2, now + i * 0.13, 0.5, 'sine', 0.08, this.bus!);
    });
  }
}

export const musicEngine = new MusicEngine();
