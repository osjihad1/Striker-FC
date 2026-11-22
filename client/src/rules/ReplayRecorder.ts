// Striker FC — rules/ReplayRecorder.ts (Phase 05, Spec 07 §4)
// 300-frame (5s @ 60Hz) circular buffer of compact snapshots: ball position
// plus all 22 players' transforms and animation states. After a goal the
// buffer plays back at 0.45x slow motion across two dramatic camera angles:
// Angle 1 low behind-the-goal, Angle 2 sideline tight zoom. Skippable.

import type { AnimState } from '../rendering/PlayerAnimator';

export interface ReplayPlayerFrame {
  x: number;
  z: number;
  yaw: number;
  anim: AnimState;
}

export interface ReplayFrame {
  ballX: number;
  ballY: number;
  ballZ: number;
  players: ReplayPlayerFrame[];
}

export const REPLAY_CAPACITY = 300; // frames @ 60Hz = 5 seconds
export const REPLAY_SPEED = 0.45; // slow-motion playback factor
export const REPLAY_SOURCE_SEC = REPLAY_CAPACITY / 60;
/** Full playback duration at 0.45x ≈ 11.1s. */
export const REPLAY_DURATION_SEC = REPLAY_SOURCE_SEC / REPLAY_SPEED;

function wrapAngleDelta(a: number): number {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class ReplayRecorder {
  private readonly buffer: (ReplayFrame | null)[] = new Array<ReplayFrame | null>(REPLAY_CAPACITY).fill(null);
  private head = 0; // next write index
  private count = 0;

  record(frame: ReplayFrame): void {
    // Deep-copy player transforms: the sim reuses its render-state objects.
    this.buffer[this.head] = {
      ballX: frame.ballX,
      ballY: frame.ballY,
      ballZ: frame.ballZ,
      players: frame.players.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, anim: p.anim })),
    };
    this.head = (this.head + 1) % REPLAY_CAPACITY;
    if (this.count < REPLAY_CAPACITY) this.count += 1;
  }

  get frameCount(): number {
    return this.count;
  }

  /** Recorded source duration in seconds (≤ 5s). */
  get sourceDurationSec(): number {
    return this.count / 60;
  }

  /** Ordered snapshot of the buffer, oldest → newest (references, read-only). */
  orderedFrames(): ReplayFrame[] {
    const out: ReplayFrame[] = [];
    const start = (this.head - this.count + REPLAY_CAPACITY) % REPLAY_CAPACITY;
    for (let i = 0; i < this.count; i += 1) {
      const f = this.buffer[(start + i) % REPLAY_CAPACITY];
      if (f) out.push(f);
    }
    return out;
  }

  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Playback cursor over a captured frame list. `sample(elapsedSec)` maps
 * playback time through the 0.45x slow-motion factor, interpolates between
 * the two neighbouring source frames, and reports which camera angle the
 * moment belongs to (first half of the clip = behind-goal, second half =
 * sideline tight).
 */
export class ReplayPlayback {
  private readonly frames: ReplayFrame[];
  readonly durationSec: number;

  constructor(frames: ReplayFrame[]) {
    this.frames = frames;
    const sourceSec = Math.max(0, (frames.length - 1) / 60);
    this.durationSec = sourceSec / REPLAY_SPEED;
  }

  get frameTotal(): number {
    return this.frames.length;
  }

  angleAt(elapsedSec: number): 1 | 2 {
    if (this.durationSec <= 0) return 1;
    return elapsedSec < this.durationSec / 2 ? 1 : 2;
  }

  isFinished(elapsedSec: number): boolean {
    return elapsedSec >= this.durationSec;
  }

  /** Interpolated frame at a playback time; null when there is nothing to show. */
  sample(elapsedSec: number, out: ReplayFrame): ReplayFrame | null {
    const n = this.frames.length;
    if (n === 0) return null;
    const sourceFrame = Math.min(n - 1, Math.max(0, elapsedSec * REPLAY_SPEED * 60));
    const i0 = Math.floor(sourceFrame);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = sourceFrame - i0;
    const a = this.frames[i0];
    const b = this.frames[i1];
    if (!a || !b) return null;
    out.ballX = a.ballX + (b.ballX - a.ballX) * frac;
    out.ballY = a.ballY + (b.ballY - a.ballY) * frac;
    out.ballZ = a.ballZ + (b.ballZ - a.ballZ) * frac;
    for (let i = 0; i < out.players.length; i += 1) {
      const pa = a.players[i];
      const pb = b.players[i];
      const po = out.players[i];
      if (!pa || !pb || !po) continue;
      po.x = pa.x + (pb.x - pa.x) * frac;
      po.z = pa.z + (pb.z - pa.z) * frac;
      po.yaw = pa.yaw + wrapAngleDelta(pb.yaw - pa.yaw) * frac;
      po.anim = frac < 0.5 ? pa.anim : pb.anim;
    }
    return out;
  }
}
