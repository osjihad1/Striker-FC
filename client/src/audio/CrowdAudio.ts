// Striker FC — audio/CrowdAudio.ts (Phase 06, Spec 07 §5)
// Dynamic stadium atmosphere: a looping pink-noise bed through two resonant
// bandpass filters — a 350Hz warm murmur and an 1100Hz roar band. Excitement
// (ball zone, shots, goals) glides both filter cutoffs and band gains with
// slow setTargetAtTime ramps, so the crowd swells and erupts without clicks.

import { CROWD_LOOPS } from './RecordedAudio';

/** Deterministic pink noise (Paul Kellet's filter) into a plain buffer. */
export function generatePinkNoise(samples: number, seed = 2026): Float32Array {
  const out = new Float32Array(samples);
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  for (let i = 0; i < samples; i += 1) {
    const white = rand();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99365 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    out[i] = pink * 0.11;
  }
  return out;
}

export class CrowdAudio {
  private source: AudioBufferSourceNode | null = null;
  private murmurFilter: BiquadFilterNode | null = null;
  private roarFilter: BiquadFilterNode | null = null;
  private murmurGain: GainNode | null = null;
  private roarGain: GainNode | null = null;
  private outGain: GainNode | null = null;
  private excitement = 0.22;
  private started = false;
  // Recorded layers (overnight asset build): the decoded buffers are cached
  // after the first fetch so repeat goals cost no network/disk re-read.
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private recordedBed: AudioBufferSourceNode | null = null;
  private cheerBuffer: AudioBuffer | null = null;
  private chantBuffer: AudioBuffer | null = null;
  private cheerLoading: Promise<AudioBuffer | null> | null = null;
  private chantLoading: Promise<AudioBuffer | null> | null = null;
  private groanBuffer: AudioBuffer | null = null;
  private groanLoading: Promise<AudioBuffer | null> | null = null;
  private chantSrc: AudioBufferSourceNode | null = null;
  private chantGain: GainNode | null = null;
  private chantTimer: ReturnType<typeof setTimeout> | null = null;

  start(ctx: AudioContext, bus: GainNode): void {
    if (this.started) return;
    this.started = true;
    this.ctx = ctx;
    this.bus = bus;
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    buffer.copyToChannel(generatePinkNoise(len), 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const murmur = ctx.createBiquadFilter();
    murmur.type = 'bandpass';
    murmur.frequency.value = 350;
    murmur.Q.value = 0.55;
    const roar = ctx.createBiquadFilter();
    roar.type = 'bandpass';
    roar.frequency.value = 1100;
    roar.Q.value = 0.8;

    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0.5;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.06;
    const out = ctx.createGain();
    out.gain.value = 0.9;

    src.connect(murmur);
    murmur.connect(murmurGain);
    murmurGain.connect(out);
    src.connect(roar);
    roar.connect(roarGain);
    roarGain.connect(out);
    out.connect(bus);
    src.start();

    this.source = src;
    this.murmurFilter = murmur;
    this.roarFilter = roar;
    this.murmurGain = murmurGain;
    this.roarGain = roarGain;
    this.outGain = out;
    this.applyExcitement(this.excitement, 0.1);
    // Recorded bed: fetch + decode the real stadium ambience loop in the
    // background; when it arrives it takes over from the procedural bed
    // (which keeps running quietly underneath as a fallback/texture).
    void this.loadRecordedBed();
    // Audio-fix (2026-11-22): warm the cheer/chant/groan buffers here, in
    // the background, the same way the bed is warmed above — otherwise the
    // first goal pays a fetch + decode (2.5 MB cheer, ~90 s) inside
    // erupt() and the swell starts seconds late.
    void this.warmSwellBuffers();
  }

  /** Background warm-up for the one-shot swell buffers (cheer/chant/groan).
   *  Each ensure*() caches its buffer, so this is a no-op on repeat starts
   *  and playCheerSwell/playChantBurst/playGroanSwell replay instantly. */
  private async warmSwellBuffers(): Promise<void> {
    try {
      await Promise.all([
        this.ensureCheerBuffer(),
        this.ensureChantBuffer(),
        this.ensureGroanBuffer(),
      ]);
    } catch {
      // Warm-up is best-effort — the lazy load in each player still works.
    }
  }

  private async ensureCheerBuffer(): Promise<AudioBuffer | null> {
    if (this.cheerBuffer) return this.cheerBuffer;
    if (!this.cheerLoading) this.cheerLoading = this.loadBuffer(CROWD_LOOPS.cheer);
    this.cheerBuffer = await this.cheerLoading;
    return this.cheerBuffer;
  }

  private async ensureChantBuffer(): Promise<AudioBuffer | null> {
    if (this.chantBuffer) return this.chantBuffer;
    if (!this.chantLoading) this.chantLoading = this.loadBuffer(CROWD_LOOPS.chant);
    this.chantBuffer = await this.chantLoading;
    return this.chantBuffer;
  }

  private async ensureGroanBuffer(): Promise<AudioBuffer | null> {
    if (this.groanBuffer) return this.groanBuffer;
    if (!this.groanLoading) this.groanLoading = this.loadBuffer(CROWD_LOOPS.groan);
    this.groanBuffer = await this.groanLoading;
    return this.groanBuffer;
  }

  /** Observability for the audio lab: which swell buffers are decoded and
   *  ready to play instantly (no fetch/decode on the next goal). */
  get swellBuffersReady(): { cheer: boolean; chant: boolean; groan: boolean } {
    return {
      cheer: this.cheerBuffer !== null,
      chant: this.chantBuffer !== null,
      groan: this.groanBuffer !== null,
    };
  }

  /** Fetch + decode one recorded loop, cached per URL. Null on any failure. */
  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  private async loadRecordedBed(): Promise<void> {
    if (!this.ctx || !this.bus || this.recordedBed) return;
    const buf = await this.loadBuffer(CROWD_LOOPS.ambience);
    if (!buf || !this.ctx || !this.bus || this.recordedBed) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.bus);
    src.start();
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.85, t, 1.2);
    // Ease the procedural bed down to a quiet texture underneath.
    this.outGain?.gain.setTargetAtTime(0.25, t, 1.2);
    this.recordedBed = src;
  }

  /** One-shot goal roar: the recorded cheer loop swells in, holds ~6 s,
   *  then fades out. Cached buffer — repeat goals replay instantly. */
  private async playCheerSwell(): Promise<void> {
    if (!this.ctx || !this.outGain) return;
    this.cheerBuffer = await this.ensureCheerBuffer();
    if (!this.cheerBuffer || !this.ctx || !this.outGain) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.cheerBuffer;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.outGain);
      const t = this.ctx.currentTime;
      gain.gain.setTargetAtTime(1.0, t, 0.25);
      gain.gain.setTargetAtTime(0, t + 6.5, 1.0);
      src.start(t);
      src.stop(t + 9.5);
    } catch {
      // Cheer is a garnish — the procedural eruption already fired.
    }
  }

  /** Post-goal chant: the recorded chant loop rides for ~18 s, then fades. */
  private async playChantBurst(): Promise<void> {
    if (!this.ctx || !this.outGain || this.chantSrc) return;
    this.chantBuffer = await this.ensureChantBuffer();
    if (!this.chantBuffer || !this.ctx || !this.outGain) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.chantBuffer;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.outGain);
      src.start();
      gain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.8);
      this.chantSrc = src;
      this.chantGain = gain;
      if (this.chantTimer) clearTimeout(this.chantTimer);
      this.chantTimer = setTimeout(() => this.stopChant(), 18000);
    } catch {
      // Chant is a garnish.
    }
  }

  /** Near-miss groan: the recorded "oooh" swell plays once (~12 s),
   *  riding on top of the procedural gasp. Cached buffer — repeat
   *  near misses replay instantly. If decode fails, the gasp alone
   *  still carries the moment. */
  private async playGroanSwell(): Promise<void> {
    if (!this.ctx || !this.outGain) return;
    this.groanBuffer = await this.ensureGroanBuffer();
    if (!this.groanBuffer || !this.ctx || !this.outGain) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.groanBuffer;
      src.loop = false;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.outGain);
      const t = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0.9, t, 0.2);
      src.start(t);
      src.stop(t + this.groanBuffer.duration + 0.5);
    } catch {
      // Groan is a garnish — the procedural gasp already fired.
    }
  }

  private stopChant(): void {
    if (this.chantTimer) { clearTimeout(this.chantTimer); this.chantTimer = null; }
    const src = this.chantSrc;
    const gain = this.chantGain;
    this.chantSrc = null;
    this.chantGain = null;
    if (!src || !gain || !this.ctx) return;
    try {
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
      src.stop(this.ctx.currentTime + 3);
    } catch {
      // Already stopped.
    }
  }

  private applyExcitement(level: number, tau: number): void {
    if (!this.murmurFilter || !this.roarFilter || !this.murmurGain || !this.roarGain) return;
    const t = this.murmurGain.context.currentTime;
    const l = Math.min(1.6, Math.max(0, level));
    this.murmurFilter.frequency.setTargetAtTime(320 + 130 * l, t, tau);
    this.roarFilter.frequency.setTargetAtTime(880 + 620 * Math.min(1, l), t, tau);
    this.murmurGain.gain.setTargetAtTime(0.42 + 0.3 * Math.min(1, l), t, tau);
    this.roarGain.gain.setTargetAtTime(0.05 + 0.85 * l * l * 0.62, t, tau);
  }

  /** Glide the ambient excitement (0 quiet midfield … 1 on the box edge). */
  setExcitement(level: number): void {
    this.excitement = Math.min(1, Math.max(0, level));
    this.applyExcitement(this.excitement, 0.45);
  }

  get currentExcitement(): number {
    return this.excitement;
  }

  /** GOAL_SCORED: full stadium eruption, then settle back to the ambient bed. */
  erupt(): void {
    this.applyExcitement(1.6, 0.08);
    if (this.outGain) {
      const t = this.outGain.context.currentTime;
      this.outGain.gain.cancelScheduledValues(t);
      this.outGain.gain.setTargetAtTime(1.25, t, 0.05);
      this.outGain.gain.setTargetAtTime(0.9, t + 1.4, 1.6);
    }
    // Recorded layers ride on top of the procedural eruption.
    void this.playCheerSwell();
    void this.playChantBurst();
    setTimeout(() => this.applyExcitement(this.excitement, 1.2), 1600);
  }

  /** POST_HIT / GK_SAVE: the collective "ooooh!" — a fast roar-band swell
   * whose pitch sags as the crowd exhales. */
  gasp(): void {
    if (!this.roarFilter || !this.roarGain) return;
    // Recorded groan swell rides on top of the procedural gasp.
    void this.playGroanSwell();
    const t = this.roarGain.context.currentTime;
    this.roarFilter.frequency.cancelScheduledValues(t);
    this.roarFilter.frequency.setValueAtTime(1500, t);
    this.roarFilter.frequency.exponentialRampToValueAtTime(680, t + 0.85);
    this.roarGain.gain.cancelScheduledValues(t);
    this.roarGain.gain.setValueAtTime(Math.max(this.roarGain.gain.value, 0.12), t);
    this.roarGain.gain.linearRampToValueAtTime(0.55, t + 0.14);
    this.roarGain.gain.setTargetAtTime(0.05 + 0.85 * this.excitement * this.excitement * 0.62, t + 0.5, 0.5);
    setTimeout(() => this.applyExcitement(this.excitement, 0.6), 1100);
  }

  stop(): void {
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.stopChant();
    try { this.recordedBed?.stop(); } catch { /* already stopped */ }
    this.source = null;
    this.recordedBed = null;
    this.ctx = null;
    this.bus = null;
    this.started = false;
  }
}
