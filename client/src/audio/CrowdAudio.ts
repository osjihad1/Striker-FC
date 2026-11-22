// Striker FC — audio/CrowdAudio.ts (Phase 06, Spec 07 §5)
// Dynamic stadium atmosphere: a looping pink-noise bed through two resonant
// bandpass filters — a 350Hz warm murmur and an 1100Hz roar band. Excitement
// (ball zone, shots, goals) glides both filter cutoffs and band gains with
// slow setTargetAtTime ramps, so the crowd swells and erupts without clicks.

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

  start(ctx: AudioContext, bus: GainNode): void {
    if (this.started) return;
    this.started = true;
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
    setTimeout(() => this.applyExcitement(this.excitement, 1.2), 1600);
  }

  /** POST_HIT / GK_SAVE: the collective "ooooh!" — a fast roar-band swell
   * whose pitch sags as the crowd exhales. */
  gasp(): void {
    if (!this.roarFilter || !this.roarGain) return;
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
    this.source = null;
    this.started = false;
  }
}
