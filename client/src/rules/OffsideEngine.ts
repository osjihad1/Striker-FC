// Striker FC — rules/OffsideEngine.ts (Phase 05, Spec 06 §2)
// Exact frame-of-pass offside detection. The snapshot is taken on the physics
// tick the pass leaves the passer's foot — never when the receiver gets it.
// The offside reference line is the most advanced of the halfway line, the
// ball position, and the second-to-last defender. Tagged attackers are only
// penalised when they touch the ball or actively interfere with a defender.
// No offside is ever called directly from a Throw-In, Corner or Goal Kick.

import type { TeamSide } from '../core/types';

export type RestartOrigin =
  | 'OPEN_PLAY' | 'THROW_IN' | 'CORNER' | 'GOAL_KICK' | 'FREE_KICK' | 'PENALTY' | 'KICKOFF';

export interface OffsidePlayerPos {
  global: number;
  x: number;
  z: number;
}

export interface OffsideSnapshot {
  attackingSide: TeamSide;
  passerGlobal: number;
  /** World X of the offside reference line at the moment of the pass. */
  lineX: number;
  ballX: number;
  secondLastDefenderX: number;
  dirX: 1 | -1;
  origin: RestartOrigin;
  /** global index -> attacker's X at the moment of the pass. */
  tagged: Map<number, number>;
  takenAtSec: number;
}

export interface OffsideCall {
  offenderGlobal: number;
  lineX: number;
  attackerX: number;
  /** Where the indirect free kick is taken from (offender's position). */
  spotX: number;
  spotZ: number;
}

const EXEMPT_ORIGINS: RestartOrigin[] = ['THROW_IN', 'CORNER', 'GOAL_KICK'];
/** A snapshot stays live until the defence touches the ball or it goes dead. */
const SNAPSHOT_TTL_SEC = 7;

export class OffsideEngine {
  private snapshot: OffsideSnapshot | null = null;
  /** The most recent confirmed call — drives the VAR line overlay. */
  lastCall: OffsideCall | null = null;

  get activeSnapshot(): OffsideSnapshot | null {
    return this.snapshot;
  }

  get hasActiveSnapshot(): boolean {
    return this.snapshot !== null && this.snapshot.tagged.size > 0;
  }

  /**
   * Take the frame-of-pass snapshot. Returns the snapshot, or null when the
   * restart origin is exempt (throw-in / corner / goal kick).
   */
  onPass(args: {
    attackingSide: TeamSide;
    passerGlobal: number;
    ballX: number;
    defenders: OffsidePlayerPos[];
    attackers: OffsidePlayerPos[];
    origin: RestartOrigin;
    nowSec: number;
  }): OffsideSnapshot | null {
    if (EXEMPT_ORIGINS.includes(args.origin)) {
      this.snapshot = null;
      return null;
    }
    const dirX: 1 | -1 = args.attackingSide === 'HOME' ? 1 : -1;
    // Defenders sorted most-advanced first along the attacking direction;
    // index 0 is usually the goalkeeper, index 1 is the second-to-last man.
    const sorted = [...args.defenders].sort((a, b) => (dirX > 0 ? b.x - a.x : a.x - b.x));
    const secondLast = sorted[1] ?? sorted[0];
    const secondLastX = secondLast ? secondLast.x : dirX * 52.5;
    // Reference line = most advanced of halfway line, ball, second-last defender.
    const lineX = dirX > 0
      ? Math.max(0, args.ballX, secondLastX)
      : Math.min(0, args.ballX, secondLastX);
    const tagged = new Map<number, number>();
    for (const a of args.attackers) {
      if (a.global === args.passerGlobal) continue;
      const ahead = dirX > 0 ? a.x - lineX : lineX - a.x;
      if (ahead > 0.15) tagged.set(a.global, a.x);
    }
    // Epic P0-7: a harmless new pass must not erase a LIVE offence. If
    // the existing snapshot has tagged attackers and this pass tags
    // nobody, the pending offence survives until it is judged or
    // expires — the through ball's receiver is judged on the pass that
    // put him through, not on a later sideways ball.
    if (this.snapshot && this.snapshot.tagged.size > 0 && tagged.size === 0
      && args.attackingSide === this.snapshot.attackingSide) {
      return this.snapshot;
    }
    this.snapshot = {
      attackingSide: args.attackingSide,
      passerGlobal: args.passerGlobal,
      lineX,
      ballX: args.ballX,
      secondLastDefenderX: secondLastX,
      dirX,
      origin: args.origin,
      tagged,
      takenAtSec: args.nowSec,
    };
    return this.snapshot;
  }

  /** A tagged player touched the ball → offside offence. */
  checkTouch(global: number, pos: { x: number; z: number }): OffsideCall | null {
    const snap = this.snapshot;
    if (!snap) return null;
    const attackerX = snap.tagged.get(global);
    if (attackerX === undefined) return null;
    const call: OffsideCall = {
      offenderGlobal: global,
      lineX: snap.lineX,
      attackerX,
      spotX: pos.x,
      spotZ: pos.z,
    };
    this.lastCall = call;
    this.snapshot = null;
    return call;
  }

  /**
   * Active involvement without a touch: a tagged attacker interfering with
   * an opponent. Epic P0-7: only defenders who can actually play the ball
   * count — one within ~3 m of the ball (or its path) or actively
   * challenging the attacker; a defender standing 1.5 m away on the far
   * side of the pitch is not being interfered with.
   */
  checkInterference(
    attackers: OffsidePlayerPos[],
    defenders: OffsidePlayerPos[],
    ballPos?: { x: number; z: number },
  ): OffsideCall | null {
    const snap = this.snapshot;
    if (!snap || snap.tagged.size === 0) return null;
    for (const a of attackers) {
      const attackerX = snap.tagged.get(a.global);
      if (attackerX === undefined) continue;
      for (const d of defenders) {
        const nearBall = ballPos ? Math.hypot(d.x - ballPos.x, d.z - ballPos.z) < 3 : false;
        const challenging = Math.hypot(a.x - d.x, a.z - d.z) < 1.5;
        if (challenging && (nearBall || !ballPos)) {
          const call: OffsideCall = {
            offenderGlobal: a.global,
            lineX: snap.lineX,
            attackerX,
            spotX: a.x,
            spotZ: a.z,
          };
          this.lastCall = call;
          this.snapshot = null;
          return call;
        }
      }
    }
    return null;
  }

  /** Defence deliberately played the ball, ball went dead, or TTL expired. */
  clearIfExpired(nowSec: number): void {
    if (this.snapshot && nowSec - this.snapshot.takenAtSec > SNAPSHOT_TTL_SEC) {
      this.snapshot = null;
    }
  }

  clear(): void {
    this.snapshot = null;
  }

  /** VAR line data for FieldOverlays: line X + the offender's snapshot X. */
  varLineData(): { lineX: number; attackerX: number } | null {
    if (!this.lastCall) return null;
    return { lineX: this.lastCall.lineX, attackerX: this.lastCall.attackerX };
  }
}
