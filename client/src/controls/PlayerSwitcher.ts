// Striker FC — controls/PlayerSwitcher.ts (Phase 03, Spec 06 §5B defending)
// Chooses which player the user controls next: best-positioned defender for a
// tap switch, directional switch toward a swipe, and pass-receiver cycling.
import type { Vec3 } from '../core/math';
import type { SwipeDir } from './InputManager';

export interface SwitchCandidate {
  id: string;
  pos: Vec3;
  isGoalkeeper: boolean;
}

/**
 * Tap switch: the outfield player best placed to pressure the ball — nearest
 * to the ball with a bonus for being goal-side of it.
 */
export function chooseSwitchTarget(
  candidates: SwitchCandidate[],
  ballPos: Vec3,
  currentId: string,
  defendingGoalX: number,
): string {
  let bestId = currentId;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (c.id === currentId || c.isGoalkeeper) continue;
    const distBall = Math.hypot(c.pos.x - ballPos.x, c.pos.z - ballPos.z);
    const goalSide = Math.sign(defendingGoalX - ballPos.x) === Math.sign(c.pos.x - ballPos.x) ? 1 : 0;
    const score = -distBall + goalSide * 4;
    if (score > bestScore) { bestScore = score; bestId = c.id; }
  }
  return bestId;
}

/**
 * Directional switch: score teammates by alignment with the swipe direction
 * from the ball, minus a distance cost (Spec 06 §5B SWITCH). Swipe axes are
 * world axes for the HOME side attacking +X: UP = forward (+X), DOWN =
 * back (−X), LEFT / RIGHT = across the pitch (−Z / +Z).
 */
export function chooseDirectionalSwitch(
  candidates: SwitchCandidate[],
  fromPos: Vec3,
  currentId: string,
  dir: SwipeDir,
): string {
  const dirVec = {
    UP: { x: 1, z: 0 }, DOWN: { x: -1, z: 0 },
    LEFT: { x: 0, z: -1 }, RIGHT: { x: 0, z: 1 },
  }[dir];
  let bestId = currentId;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (c.id === currentId || c.isGoalkeeper) continue;
    const dx = c.pos.x - fromPos.x;
    const dz = c.pos.z - fromPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) continue;
    const cos = (dx * dirVec.x + dz * dirVec.z) / dist;
    const score = cos * 3 - dist / 30;
    if (score > bestScore) { bestScore = score; bestId = c.id; }
  }
  return bestId;
}

/** Cycle to the next outfield teammate (used after a completed pass). */
export function nextReceiverIndex(current: number, count: number): number {
  if (count <= 1) return current;
  return (current + 1) % count;
}
