// Striker FC — audio/StadiumAmbience.ts (Epic fix round, P1-13)
// Stadium space around the crowd bed: a generated-impulse convolver reverb
// the crowd (and only the crowd) is sent through, plus weather layers —
// rain patter, wind gusts — and the floodlight mains hum at night. All
// procedural Web Audio: the impulse is synthesized noise with an
// exponential decay envelope (2.8s), no audio files anywhere.

/** Reverb decay of the generated impulse, seconds. */
export const REVERB_DECAY_SEC = 2.8;
/** Crowd wet mix at rest, and the goal-moment boost (3s). */
export const CROWD_WET_BASE = 0.35;
export const CROWD_WET_GOAL = 0.5;

/**
 * Pure impulse-response samples (one channel): white noise shaped by an
 * exponential decay over `seconds`, with a short attack fade so the
 * convolver never clicks. Deterministic (seeded) so the lab can assert the
 * envelope headlessly.
 */
export function generateImpulseSamples(seconds: number, sampleRate: number, seed = 99173): Float32Array {
  const len = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(len);
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
  for (let i = 0; i < len; i += 1) {
    const t = i / len;
    const decay = Math.pow(1 - t, 2.6);
    const attack = Math.min(1, i / (sampleRate * 0.004));
    out[i] = rand() * decay * attack * 0.9;
  }
  return out;
}

export type AmbienceWeather = 'DAY' | 'NIGHT' | 'RAIN' | 'WIND';

export class StadiumAmbience {
  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private humOsc: OscillatorNode[] = [];
  private humGain: GainNode | null = null;
  private wetTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /**
   * Insert the reverb send on the crowd bus: `crowdBus` keeps its dry path
   * to the master; a parallel send runs crowdBus → convolver → wet gain →
   * master. Rain/wind/hum layers are generated here and mixed straight to
   * the master at low level. The pre-match bed cross-fades in over 4s.
   */
  start(ctx: AudioContext, crowdBus: GainNode, master: GainNode): void {
    if (this.started) return;
    this.started = true;

    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * REVERB_DECAY_SEC), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      impulse.copyToChannel(generateImpulseSamples(REVERB_DECAY_SEC, ctx.sampleRate, 99173 + ch * 7717), ch);
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.setValueAtTime(0.0001, ctx.currentTime);
    // 4-second cross-fade-in of the wet bed as the teams walk out.
    wet.gain.exponentialRampToValueAtTime(CROWD_WET_BASE, ctx.currentTime + 4);
    crowdBus.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);
    this.convolver = convolver;
    this.wetGain = wet;

    // Weather layers: looped noise through band shapes, gains set by
    // setWeather. Rain = high hiss + patter band; wind = slow-LFO low roar.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let seed = 4242;
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = seed / 4294967296 * 2 - 1;
    }
    const mkLayer = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      return gain;
    };
    this.rainGain = mkLayer('highpass', 3800, 0.4);
    const windGain = mkLayer('lowpass', 320, 0.6);
    // Wind gusts: a slow LFO breathing on the wind gain.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    lfo.start();
    this.windGain = windGain;

    // Floodlight hum: 100Hz mains + a 150Hz harmonic, barely-there.
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);
    this.humGain = humGain;
    this.humOsc = [100, 150].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(g);
      g.connect(humGain);
      osc.start();
      return osc;
    });
  }

  /** Weather layers + floodlight hum follow the match's weather preset. */
  setWeather(ctx: AudioContext, weather: AmbienceWeather): void {
    if (!this.started) return;
    const t = ctx.currentTime;
    this.rainGain?.gain.setTargetAtTime(weather === 'RAIN' ? 0.05 : 0, t, 0.8);
    this.windGain?.gain.setTargetAtTime(weather === 'WIND' || weather === 'RAIN' ? 0.028 : 0.008, t, 0.8);
    this.humGain?.gain.setTargetAtTime(weather === 'NIGHT' || weather === 'RAIN' ? 0.012 : 0, t, 0.8);
  }

  /** Tear the bed down (audio engine uninstall): silence the hum
   *  oscillators and drop the convolver send. */
  stop(): void {
    if (this.wetTimer) { clearTimeout(this.wetTimer); this.wetTimer = null; }
    for (const osc of this.humOsc) { try { osc.stop(); } catch { /* already stopped */ } }
    this.humOsc = [];
    try { this.convolver?.disconnect(); } catch { /* already disconnected */ }
    this.convolver = null;
    this.started = false;
  }

  /** GOAL: the crowd's reverb tail swells (wet 0.35 → 0.50) for 3 seconds. */
  goalWetBoost(ctx: AudioContext): void {
    if (!this.wetGain) return;
    const t = ctx.currentTime;
    this.wetGain.gain.cancelScheduledValues(t);
    this.wetGain.gain.setTargetAtTime(CROWD_WET_GOAL, t, 0.12);
    if (this.wetTimer) clearTimeout(this.wetTimer);
    this.wetTimer = setTimeout(() => {
      if (this.wetGain) this.wetGain.gain.setTargetAtTime(CROWD_WET_BASE, ctx.currentTime, 0.6);
    }, 3000);
  }
}

export interface AmbienceLabResult {
  impulseOk: boolean;
  constantsOk: boolean;
  detail: string;
}

/** Headless checks of the generated impulse + mix constants. */
export function runAmbienceLab(): AmbienceLabResult {
  const sr = 44100;
  const samples = generateImpulseSamples(REVERB_DECAY_SEC, sr);
  const lenOk = samples.length === Math.floor(REVERB_DECAY_SEC * sr);
  let finite = true;
  let headSum = 0;
  let tailSum = 0;
  const tenth = Math.floor(samples.length / 10);
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]!;
    if (!Number.isFinite(v)) finite = false;
    if (i < tenth) headSum += Math.abs(v);
    if (i >= samples.length - tenth) tailSum += Math.abs(v);
  }
  const decayOk = headSum > tailSum * 4; // the tail is a whisper of the head
  const impulseOk = lenOk && finite && decayOk;
  const constantsOk = REVERB_DECAY_SEC === 2.8 && CROWD_WET_BASE === 0.35 && CROWD_WET_GOAL === 0.5;
  return {
    impulseOk,
    constantsOk,
    detail: `impulse ${samples.length} samples @44.1k, head/tail energy ${(headSum / Math.max(0.0001, tailSum)).toFixed(1)}×, wet ${CROWD_WET_BASE}→${CROWD_WET_GOAL} on goals`,
  };
}
