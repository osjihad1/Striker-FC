// Striker FC — rendering/PerfTelemetry.ts (Epic fix round, P1-12)
// Live rendering telemetry for the stadium scene: frame-time ring buffer
// (avg FPS + p95), and the WebGL renderer's own counters (draw calls,
// triangles, geometries, textures) sampled from renderer.info. The Engine
// Data screen reads the latest snapshot. The lab verifies the ring-buffer
// math headlessly, but the draw-call budget is judged ONLY on a real
// measured frame: the shared instance's latest renderer.info sample,
// tagged with the graphics tier that produced it (rig-merge fix round —
// no synthetic draw-call constants).

export interface PerfSnapshot {
  fpsAvg: number;
  frameMsAvg: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Estimated visible meshes across the 22 player rigs (LOW culls detail). */
  rigVisibleMeshes: number;
  /** Graphics tier of the latest renderer.info sample ('' = none yet). */
  sampleQuality: string;
}

const RING_SIZE = 240;

export class PerfTelemetry {
  private ring = new Float32Array(RING_SIZE);
  private head = 0;
  private count = 0;
  private calls = 0;
  private triangles = 0;
  private geometries = 0;
  private textures = 0;
  private rigVisibleMeshes = 0;
  private sampleQuality = '';

  /** Record one rendered frame's CPU+GPU wall time, milliseconds. */
  record(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    this.ring[this.head] = frameMs;
    this.head = (this.head + 1) % RING_SIZE;
    this.count = Math.min(RING_SIZE, this.count + 1);
  }

  /** Sample the renderer's counters (three.js renderer.info.render/memory)
   *  from a REAL rendered frame, tagged with the tier that produced it. */
  sampleRenderer(info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
  }, rigVisibleMeshes: number, quality = ''): void {
    this.calls = info.render.calls;
    this.triangles = info.render.triangles;
    this.geometries = info.memory.geometries;
    this.textures = info.memory.textures;
    this.rigVisibleMeshes = rigVisibleMeshes;
    this.sampleQuality = quality;
  }

  snapshot(): PerfSnapshot {
    const n = this.count;
    if (n === 0) {
      return {
        fpsAvg: 0, frameMsAvg: 0, frameMsP95: 0,
        drawCalls: this.calls, triangles: this.triangles,
        geometries: this.geometries, textures: this.textures,
        rigVisibleMeshes: this.rigVisibleMeshes,
        sampleQuality: this.sampleQuality,
      };
    }
    const values: number[] = [];
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const v = this.ring[i]!;
      values.push(v);
      sum += v;
    }
    values.sort((a, b) => a - b);
    const avg = sum / n;
    const p95 = values[Math.min(n - 1, Math.floor(n * 0.95))]!;
    return {
      fpsAvg: avg > 0 ? 1000 / avg : 0,
      frameMsAvg: avg,
      frameMsP95: p95,
      drawCalls: this.calls,
      triangles: this.triangles,
      geometries: this.geometries,
      textures: this.textures,
      rigVisibleMeshes: this.rigVisibleMeshes,
      sampleQuality: this.sampleQuality,
    };
  }
}

/** The shared live instance the stadium writes and Engine Data reads. */
export const perfTelemetry = new PerfTelemetry();

export interface PerfLabResult {
  mathOk: boolean;
  p95Ok: boolean;
  budgetOk: boolean;
  detail: string;
}

/** LOW-tier frame budget the telemetry is judged against (Pixel 6 Pro). */
export const LOW_FRAME_BUDGET = { minFpsAvg: 58, maxP95Ms: 20, maxDrawCalls: 350 };

/**
 * Lab checks: the ring-buffer math is verified headlessly, but the
 * draw-call budget is judged on the LIVE shared telemetry — the latest
 * renderer.info.render.calls the stadium sampled from a real rendered
 * frame. The budget only passes when that measured frame was rendered
 * on the LOW tier and its real call count is ≤350; with no LOW frame
 * measured yet the lab honestly reports the budget as unverified
 * (budgetOk false) instead of asserting a synthetic constant.
 */
export function runPerfLab(): PerfLabResult {
  const t = new PerfTelemetry();
  for (let i = 0; i < 120; i += 1) t.record(16.7);
  for (let i = 0; i < 6; i += 1) t.record(50); // a hitch tail
  const snap = t.snapshot();
  const mathOk = Math.abs(snap.frameMsAvg - (120 * 16.7 + 6 * 50) / 126) < 0.6
    && snap.fpsAvg > 50 && snap.fpsAvg < 62;
  const p95Ok = snap.frameMsP95 >= 16.7 && snap.frameMsP95 <= 50;
  const live = perfTelemetry.snapshot();
  const measuredLow = live.sampleQuality === 'LOW' && live.drawCalls > 0;
  const budgetOk = measuredLow && live.drawCalls <= LOW_FRAME_BUDGET.maxDrawCalls;
  const measuredNote = live.drawCalls > 0
    ? measuredLow
      ? `measured LOW frame: ${live.drawCalls} draw calls / ${live.rigVisibleMeshes} rig meshes (renderer.info, live)`
      : `last measured frame was ${live.sampleQuality || 'untiered'} at ${live.drawCalls} calls — open a match on LOW to verify the budget`
    : 'no rendered frame measured yet — open a match on LOW to measure draw calls';
  return {
    mathOk, p95Ok, budgetOk,
    detail: `ring math avg ${snap.frameMsAvg.toFixed(1)}ms / p95 ${snap.frameMsP95.toFixed(1)}ms · ${measuredNote} · LOW budget: ≥${LOW_FRAME_BUDGET.minFpsAvg} FPS, p95 ≤${LOW_FRAME_BUDGET.maxP95Ms}ms, ≤${LOW_FRAME_BUDGET.maxDrawCalls} calls`,
  };
}
