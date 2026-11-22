// Striker FC — audio/MatchSFX.ts (Phase 06, Spec 07 §5)
// Every match sound is synthesized live with the Web Audio API — zero audio
// files, zero 404s. Ball strikes are a pitch-enveloped sine sub-thump layered
// with a filtered noise transient; the whistle is the authentic dual-frequency
// pea whistle (2780Hz + 2845Hz beating against each other with a warble).

export type WhistleKind = 'FOUL' | 'KICKOFF' | 'HALF_TIME' | 'FULL_TIME';

/** Goal sting arpeggio (Epic fix round): C5 → E5 → G5 → C6, triangle stab. */
export const GOAL_STING_FREQS: readonly number[] = [523.25, 659.25, 783.99, 1046.5];
/** Sub-riser sweep under the sting, Hz start → end. */
export const GOAL_STING_SUB: readonly [number, number] = [60, 120];

/** The two slightly-detuned pea-whistle fundamentals (Spec 07 §5). */
export const WHISTLE_FREQS: readonly [number, number] = [2780, 2845];

/** Blast patterns as [startOffsetSec, durationSec] pairs. */
export function whistlePattern(kind: WhistleKind): [number, number][] {
  switch (kind) {
    case 'FOUL':
    case 'KICKOFF':
      return [[0, 0.38]];
    case 'HALF_TIME':
      return [[0, 0.28], [0.46, 0.5]];
    case 'FULL_TIME':
      return [[0, 0.75], [0.9, 0.28], [1.32, 1.0]];
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class MatchSFX {
  /** Light pass tap: soft 120Hz thump + tiny noise tick, scaled by power. */
  passTap(ctx: AudioContext, out: GainNode, power: number): void {
    const t = ctx.currentTime;
    const vol = 0.12 + power * 0.22;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(64, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.1);
    this.noiseTick(ctx, out, t, 900, 0.05, vol * 0.5);
  }

  /**
   * Shot strike (Spec 07 §5): pitch-enveloped sine sub-thump 140Hz → 42Hz
   * over 90ms + filtered noise transient at 600Hz, scaled by strike power.
   * Power shots add a deeper bass boom layer.
   */
  shotStrike(ctx: AudioContext, out: GainNode, power: number, isPowerShot: boolean): void {
    const t = ctx.currentTime;
    const vol = 0.3 + power * 0.55;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isPowerShot ? 0.34 : 0.2));
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.36);
    this.noiseTick(ctx, out, t, 600, 0.08, vol * 0.7);
    if (isPowerShot) {
      const boom = ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(88, t);
      boom.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(vol * 0.9, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      boom.connect(bg);
      bg.connect(out);
      boom.start(t);
      boom.stop(t + 0.44);
      this.noiseTick(ctx, out, t, 320, 0.16, vol * 0.4);
    }
  }

  /** Crossbar/post ping: high-Q metallic FM bell, 420Hz + 1180Hz, 0.6s decay. */
  postPing(ctx: AudioContext, out: GainNode, speed: number): void {
    const t = ctx.currentTime;
    const vol = Math.min(0.6, 0.22 + speed * 0.016);
    const partials: [number, number][] = [[420, 1], [1180, 0.55], [1970, 0.22]];
    for (const [freq, amp] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.62);
    }
    // FM shimmer: a modulator wobbling the fundamental for the metallic edge.
    const mod = ctx.createOscillator();
    mod.frequency.value = 1180;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(160, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 0.4);
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 420;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.35, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(cg);
    cg.connect(out);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + 0.5);
    carrier.stop(t + 0.5);
  }

  /** Net swish: high-pass noise sweep 2400Hz → 900Hz over 180ms. */
  netSwish(ctx: AudioContext, out: GainNode): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2400, t);
    hp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.22);
  }

  /** Dual-frequency pea whistle with a 27Hz warble on the gain. */
  whistle(ctx: AudioContext, out: GainNode, kind: WhistleKind): void {
    const t0 = ctx.currentTime;
    for (const [offset, dur] of whistlePattern(kind)) {
      const t = t0 + offset;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.24, t + 0.015);
      g.gain.setValueAtTime(0.24, t + Math.max(0.02, dur - 0.05));
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      // Pea warble: rapid amplitude flutter.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 27;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.09;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      for (const freq of WHISTLE_FREQS) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(g);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      g.connect(out);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
  }

  /**
   * Goal sting (Epic fix round, fired on GOAL_SCORED): a four-note triangle
   * stab arpeggio C5→E5→G5→C6 (70ms steps, bright attack, ~0.5s tail) over a
   * sine sub-riser sweeping 60→120Hz — the broadcast "goal!" punctuation
   * under the crowd eruption and net swish.
   */
  goalSting(ctx: AudioContext, out: GainNode): void {
    const t0 = ctx.currentTime;
    GOAL_STING_FREQS.forEach((freq, i) => {
      const t = t0 + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.52);
    });
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(GOAL_STING_SUB[0], t0);
    sub.frequency.exponentialRampToValueAtTime(GOAL_STING_SUB[1], t0 + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.34, t0 + 0.06);
    sg.gain.setValueAtTime(0.34, t0 + 0.34);
    sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    sub.connect(sg);
    sg.connect(out);
    sub.start(t0);
    sub.stop(t0 + 0.57);
  }

  /** Sleek glass UI click: short 1900Hz sine blip with a harmonic sparkle. */
  uiClick(ctx: AudioContext, out: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(1250, t + 0.045);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.06);
    const sparkle = ctx.createOscillator();
    sparkle.type = 'triangle';
    sparkle.frequency.value = 3150;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.05, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    sparkle.connect(sg);
    sg.connect(out);
    sparkle.start(t);
    sparkle.stop(t + 0.035);
  }

  private noiseTick(ctx: AudioContext, out: GainNode, t: number, freq: number, dur: number, vol: number): void {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur + 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
