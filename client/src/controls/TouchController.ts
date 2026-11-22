// Striker FC — controls/TouchController.ts (Phase 03, Spec 06 §5A/B)
// True multi-touch pointer tracking: the floating joystick owns one
// pointerId, each action button owns another, tracked fully independently so
// left-thumb movement and right-thumb swipes never drop each other's input.
import type { SwipeDir } from './InputManager';

export const JOYSTICK_RADIUS = 56;
const DEADZONE = 0.08;

export interface JoystickState {
  active: boolean;
  pointerId: number | null;
  /** Floating origin where the thumb landed. */
  originX: number;
  originY: number;
  /** Current knob offset in px, clamped to the radius. */
  dx: number;
  dy: number;
  /** Analog vector: deadzone 8%, magnitude 0..1. */
  vecX: number;
  vecY: number;
  magnitude: number;
  /** Walk/Jog below, Fast Dribble above (Spec 06 §5A zones). */
  zone: 'IDLE' | 'JOG' | 'FAST';
  faceUpDribble: boolean;
}

export class JoystickTracker {
  state: JoystickState = {
    active: false, pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0,
    vecX: 0, vecY: 0, magnitude: 0, zone: 'IDLE', faceUpDribble: false,
  };
  private lastTapTime = 0;
  private downTime = 0;

  onDown(pointerId: number, x: number, y: number): boolean {
    if (this.state.active) return false;
    const now = performance.now();
    const doubleTap = now - this.lastTapTime < 300;
    this.downTime = now;
    this.state = {
      active: true, pointerId, originX: x, originY: y, dx: 0, dy: 0,
      vecX: 0, vecY: 0, magnitude: 0, zone: 'IDLE', faceUpDribble: doubleTap,
    };
    return true;
  }

  onMove(pointerId: number, x: number, y: number): void {
    const s = this.state;
    if (!s.active || s.pointerId !== pointerId) return;
    let dx = x - s.originX;
    let dy = y - s.originY;
    const len = Math.hypot(dx, dy);
    if (len > JOYSTICK_RADIUS) {
      // Floating-stick follow (FC Mobile behaviour): when the thumb drags
      // past the rim, the base re-centres under the thumb instead of
      // pinning the knob — direction changes stay crisp at full tilt and
      // the stick never feels like it is pulling against a wall.
      const excess = len - JOYSTICK_RADIUS;
      s.originX += (dx / len) * excess;
      s.originY += (dy / len) * excess;
      dx = (dx / len) * JOYSTICK_RADIUS;
      dy = (dy / len) * JOYSTICK_RADIUS;
    }
    s.dx = dx; s.dy = dy;
    const rawMag = Math.min(1, Math.hypot(dx, dy) / JOYSTICK_RADIUS);
    if (rawMag < DEADZONE) {
      s.vecX = 0; s.vecY = 0; s.magnitude = 0; s.zone = 'IDLE';
      return;
    }
    // Rescale past the deadzone so the full range stays usable.
    const mag = (rawMag - DEADZONE) / (1 - DEADZONE);
    const nx = dx / (Math.hypot(dx, dy) || 1);
    const ny = dy / (Math.hypot(dx, dy) || 1);
    s.vecX = nx * mag;
    s.vecY = ny * mag;
    s.magnitude = mag;
    s.zone = mag <= 0.55 ? 'JOG' : 'FAST';
  }

  onUp(pointerId: number): void {
    if (this.state.pointerId !== pointerId) return;
    if (performance.now() - this.downTime < 220) this.lastTapTime = performance.now();
    this.state = {
      active: false, pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0,
      vecX: 0, vecY: 0, magnitude: 0, zone: 'IDLE', faceUpDribble: false,
    };
  }
}

// ---------------------------------------------------------------------------

export type GestureKind = 'TAP' | 'HOLD_RELEASE' | 'SWIPE';

export interface ButtonGesture {
  kind: GestureKind;
  dir: SwipeDir | null;
  dragX: number;
  dragY: number;
  durationMs: number;
}

/**
 * One tracker per action button. Classifies Tap (dist < 24px, < 220ms),
 * Hold (power handled by InputManager charge) and 4-way directional Swipes
 * (dist >= 28px into 90° quadrants) per Spec 06 §5B.
 */
export class ButtonGestureTracker {
  pointerId: number | null = null;
  dragging = false;
  dragX = 0;
  dragY = 0;
  private startX = 0;
  private startY = 0;
  private startTime = 0;

  onDown(pointerId: number, x: number, y: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    this.startX = x; this.startY = y;
    this.dragX = 0; this.dragY = 0;
    this.dragging = true;
    this.startTime = performance.now();
    return true;
  }

  onMove(pointerId: number, x: number, y: number): void {
    if (this.pointerId !== pointerId) return;
    this.dragX = x - this.startX;
    this.dragY = y - this.startY;
  }

  /** Live swipe direction preview while dragging (null under the threshold). */
  previewDir(): SwipeDir | null {
    if (!this.dragging) return null;
    return classifySwipe(this.dragX, this.dragY);
  }

  onUp(pointerId: number): ButtonGesture | null {
    if (this.pointerId !== pointerId) return null;
    const durationMs = performance.now() - this.startTime;
    const dist = Math.hypot(this.dragX, this.dragY);
    const dir = classifySwipe(this.dragX, this.dragY);
    const gesture: ButtonGesture = {
      kind: dir ? 'SWIPE' : dist < 24 && durationMs < 260 ? 'TAP' : 'HOLD_RELEASE',
      dir,
      dragX: this.dragX,
      dragY: this.dragY,
      durationMs,
    };
    this.pointerId = null;
    this.dragging = false;
    this.dragX = 0; this.dragY = 0;
    return gesture;
  }

  onCancel(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.pointerId = null;
    this.dragging = false;
    this.dragX = 0; this.dragY = 0;
  }
}

export function classifySwipe(dx: number, dy: number): SwipeDir | null {
  const dist = Math.hypot(dx, dy);
  if (dist < 28) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
  return dy > 0 ? 'DOWN' : 'UP';
}
