// Striker FC — controls/InputManager.ts (Phase 03, Spec 06 §5)
// Central input hub: merges the touch joystick, keyboard and gamepad into one
// analog move vector, tracks per-button hold power (curved power bar), and
// dispatches discrete game actions. Sources never fight: joystick wins while
// touched, then gamepad, then keyboard.
import type { PassType, ShotType, SkillMoveId } from '../core/types';

export type InputSource = 'TOUCH' | 'KEYBOARD' | 'GAMEPAD' | 'NONE';

export type SwipeDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type GameAction =
  | { kind: 'PASS'; passType: PassType; power: number }
  | { kind: 'THROUGH'; passType: 'THROUGH' | 'LOB_THROUGH'; power: number }
  | { kind: 'SHOOT'; shotType: ShotType; power: number }
  | { kind: 'SKILL'; moveId: SkillMoveId | null; lateralSign: 1 | -1 }
  | { kind: 'TRIGGER_RUN' }
  | { kind: 'TACKLE' }
  | { kind: 'SHOULDER_CHARGE' }
  | { kind: 'SLIDE' }
  | { kind: 'SECOND_DEF' }
  | { kind: 'GK_RUSH' }
  | { kind: 'SWITCH'; dir: SwipeDir | null };

export interface MoveVector { x: number; z: number; magnitude: number }

const POWER_FILL_SEC = 1.15;

export class InputManager {
  private joyX = 0;
  private joyZ = 0;
  private joyActive = false;
  private keyX = 0;
  private keyZ = 0;
  private padX = 0;
  private padZ = 0;
  sprintTouch = false;
  sprintKey = false;
  sprintPad = false;
  /** Cycle-2 match-up defending: true while the TACKLE control is HELD in
   *  the DEFEND layout (or the keyboard match-up key is down). The engine
   *  reads it every tick to contain the carrier at 0.9 m; releasing the
   *  hold after a contain fires SHOULDER_CHARGE instead. */
  matchUpHeld = false;
  faceUpDribble = false;
  lastSource: InputSource = 'NONE';
  private readonly charges = new Map<string, number>(); // buttonId -> start timestamp (ms)
  private readonly listeners = new Set<(a: GameAction) => void>();

  onAction(fn: (a: GameAction) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(action: GameAction): void {
    for (const fn of [...this.listeners]) fn(action);
  }

  // --- Analog sources -------------------------------------------------------
  setJoystick(x: number, z: number, active: boolean): void {
    this.joyX = x; this.joyZ = z; this.joyActive = active;
    if (active) this.lastSource = 'TOUCH';
  }

  setKeyboardVector(x: number, z: number): void {
    this.keyX = x; this.keyZ = z;
    if (x !== 0 || z !== 0) this.lastSource = 'KEYBOARD';
  }

  setGamepadVector(x: number, z: number): void {
    this.padX = x; this.padZ = z;
    if (Math.abs(x) > 0.2 || Math.abs(z) > 0.2) this.lastSource = 'GAMEPAD';
  }

  /** Merged move vector in world space: +X attacks right, +Z toward camera. */
  moveVector(): MoveVector {
    let x = 0; let z = 0;
    if (this.joyActive) { x = this.joyX; z = this.joyZ; }
    else if (Math.abs(this.padX) > 0.12 || Math.abs(this.padZ) > 0.12) { x = this.padX; z = this.padZ; }
    else { x = this.keyX; z = this.keyZ; }
    const magnitude = Math.min(1, Math.hypot(x, z));
    if (magnitude > 1e-4) {
      const scale = magnitude / Math.hypot(x, z);
      x *= scale; z *= scale;
    }
    return { x, z, magnitude };
  }

  get sprintHeld(): boolean {
    return this.sprintTouch || this.sprintKey || this.sprintPad;
  }

  // --- Hold-to-charge power ---------------------------------------------------
  startCharge(buttonId: string): void {
    if (!this.charges.has(buttonId)) this.charges.set(buttonId, performance.now());
  }

  /** 0..1 curved power: fast early fill, deliberate top end. */
  chargePower(buttonId: string): number {
    const start = this.charges.get(buttonId);
    if (start === undefined) return 0;
    const t = Math.min(1, (performance.now() - start) / 1000 / POWER_FILL_SEC);
    return t * (2 - t) * 0.35 + t * t * 0.65; // ease blend, monotonic 0..1
  }

  isCharging(buttonId: string): boolean {
    return this.charges.has(buttonId);
  }

  /** End a charge and return its power (min tap power 0.25). */
  endCharge(buttonId: string): number {
    const power = this.chargePower(buttonId);
    this.charges.delete(buttonId);
    return Math.max(0.25, power);
  }

  cancelCharge(buttonId: string): void {
    this.charges.delete(buttonId);
  }

  reset(): void {
    this.joyActive = false;
    this.joyX = 0; this.joyZ = 0;
    this.sprintTouch = false;
    this.matchUpHeld = false;
    this.faceUpDribble = false;
    this.charges.clear();
  }
}
