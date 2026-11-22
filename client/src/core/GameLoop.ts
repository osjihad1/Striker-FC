// Striker FC — core/GameLoop.ts
// Exact fixed-timestep loop contract from Blueprint 02 §3:
// 1/60s simulation steps decoupled from render FPS, interpolation alpha,
// MAX_FRAME_DT clamp, and a 20Hz HUD sync throttle.

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.05;
export const HUD_SYNC_INTERVAL = 0.05; // 20Hz

export interface GameLoopDiagnostics {
  running: boolean;
  tickCount: number;
  fps: number;
  accumulator: number;
  alpha: number;
  frameDt: number;
  simTimeSeconds: number;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId: number | null = null;
  private hudThrottleTimer = 0;
  private tickCount = 0;
  private simTimeSeconds = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private lastAlpha = 0;
  private lastFrameDt = 0;

  constructor(
    private readonly onFixedUpdate: (dt: number) => void,
    private readonly onRender: (alpha: number, frameDt: number) => void,
    private readonly onHudSync: () => void,
  ) {}

  get isRunning(): boolean {
    return this.rafId !== null;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const frameDt = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT);
      this.lastFrameDt = frameDt;

      this.accumulator += frameDt;
      let guard = 0;
      while (this.accumulator >= FIXED_DT && guard < 8) {
        this.onFixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        this.tickCount += 1;
        this.simTimeSeconds += FIXED_DT;
        guard += 1;
      }
      // Spiral-of-death guard: if we burned the whole guard budget, drop the backlog.
      if (this.accumulator >= FIXED_DT) {
        this.accumulator = FIXED_DT * 0.999;
      }

      const alpha = this.accumulator / FIXED_DT;
      this.lastAlpha = alpha;
      this.onRender(alpha, frameDt);

      this.fpsFrames += 1;
      this.fpsElapsed += rawDt;
      if (this.fpsElapsed >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsElapsed);
        this.fpsFrames = 0;
        this.fpsElapsed = 0;
      }

      this.hudThrottleTimer += frameDt;
      if (this.hudThrottleTimer >= HUD_SYNC_INTERVAL) {
        this.onHudSync();
        this.hudThrottleTimer = 0;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  diagnostics(): GameLoopDiagnostics {
    return {
      running: this.isRunning,
      tickCount: this.tickCount,
      fps: this.fps,
      accumulator: this.accumulator,
      alpha: this.lastAlpha,
      frameDt: this.lastFrameDt,
      simTimeSeconds: this.simTimeSeconds,
    };
  }
}
