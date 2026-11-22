// Striker FC — controls/KeyboardGamepadController.ts (Phase 03, Spec 06 §5C)
// Desktop keyboard (WASD + J/K/L/I/Space/Shift/Q/E/F/C/U/G) and Gamepad API
// support feeding the shared InputManager. Q/E/F act as held shot modifiers.
import type { InputManager } from './InputManager';

export class KeyboardGamepadController {
  private readonly keys = new Set<string>();
  private detachFns: (() => void)[] = [];
  private prevPadButtons: boolean[] = [];
  /** Held shot modifiers (Q = Finesse, E = Chip, F = Power). */
  private modifier: 'FINESSE' | 'CHIP' | 'POWER' | null = null;
  /** Cycle-2 match-up: when the J key went down (ms) — a hold ≥300 ms is
   *  a contain, and its release throws the shoulder charge. */
  private jDownAt = 0;
  /** Cycle-2 match-up: gamepad RB (button 5) hold tracking. */
  private rbDownAt = 0;

  constructor(private readonly input: InputManager) {}

  get activeModifier(): 'FINESSE' | 'CHIP' | 'POWER' | null { return this.modifier; }

  attach(): void {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.input.lastSource = 'KEYBOARD';
      this.syncVector();
      if (k === 'shift') this.input.sprintKey = true;
      if (k === 'q') this.modifier = 'FINESSE';
      if (k === 'e') this.modifier = 'CHIP';
      if (k === 'f') this.modifier = 'POWER';
      this.handleDiscrete(k, true);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      this.syncVector();
      if (k === 'shift') this.input.sprintKey = false;
      if (k === 'q' && this.modifier === 'FINESSE') this.modifier = null;
      if (k === 'e' && this.modifier === 'CHIP') this.modifier = null;
      if (k === 'f' && this.modifier === 'POWER') this.modifier = null;
      this.handleDiscrete(k, false);
    };
    const blur = () => {
      this.keys.clear();
      this.input.setKeyboardVector(0, 0);
      this.input.sprintKey = false;
      this.input.matchUpHeld = false;
      this.modifier = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.detachFns = [
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
    ];
  }

  detach(): void {
    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];
  }

  private syncVector(): void {
    const k = this.keys;
    const x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const z = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    this.input.setKeyboardVector(x, z);
  }

  private handleDiscrete(key: string, isDown: boolean): void {
    // Charge-based buttons: shoot & pass charge while held, fire on release.
    if (key === ' ') {
      if (isDown) this.input.startCharge('SHOOT');
      else {
        const power = this.input.endCharge('SHOOT');
        const type = this.modifier ?? 'STANDARD';
        this.input.emit({ kind: 'SHOOT', shotType: type === 'STANDARD' ? 'STANDARD' : type, power });
      }
      return;
    }
    if (key === 'j') {
      if (isDown) {
        this.jDownAt = performance.now();
        this.input.matchUpHeld = true;
        this.input.startCharge('PASS');
      } else {
        const heldMs = performance.now() - this.jDownAt;
        this.input.matchUpHeld = false;
        const power = this.input.endCharge('PASS');
        // Cycle-2: a long J hold was a match-up contain — release throws
        // the shoulder charge. A tap stays the ground pass (which the
        // engine reads as a tackle press when defending via TACKLE key
        // flows on touch; on keyboard the pass itself is the tap action).
        if (heldMs >= 300) this.input.emit({ kind: 'SHOULDER_CHARGE' });
        else this.input.emit({ kind: 'PASS', passType: 'GROUND', power });
      }
      return;
    }
    if (!isDown) return;
    switch (key) {
      case 'k': this.input.emit({ kind: 'PASS', passType: 'DRIVEN', power: 0.7 }); break;
      case 'l': this.input.emit({ kind: 'THROUGH', passType: 'THROUGH', power: 0.65 }); break;
      case 'i': this.input.emit({ kind: 'PASS', passType: 'LOB', power: 0.6 }); break;
      case 'c': this.input.emit({ kind: 'SKILL', moveId: null, lateralSign: 1 }); break;
      case 'u': this.input.emit({ kind: 'SECOND_DEF' }); break;
      case 'g': this.input.emit({ kind: 'GK_RUSH' }); break;
      case 'tab': this.input.emit({ kind: 'SWITCH', dir: null }); break;
      default: break;
    }
  }

  /** Poll the Gamepad API once per frame; edge-triggered buttons. */
  pollGamepad(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) { if (p) { pad = p; break; } }
    if (!pad) return;
    const axisX = pad.axes[0] ?? 0;
    const axisZ = pad.axes[1] ?? 0;
    this.input.setGamepadVector(
      Math.abs(axisX) > 0.14 ? axisX : 0,
      Math.abs(axisZ) > 0.14 ? axisZ : 0,
    );
    this.input.sprintPad = (pad.buttons[7]?.pressed ?? false) || (pad.buttons[5]?.pressed ?? false);
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => (pressed[i] ?? false) && !(this.prevPadButtons[i] ?? false);
    if (edge(0)) this.input.emit({ kind: 'PASS', passType: 'GROUND', power: 0.55 }); // A
    if (edge(3)) this.input.emit({ kind: 'THROUGH', passType: 'THROUGH', power: 0.6 }); // Y
    if (edge(2)) this.input.emit({ kind: 'SHOOT', shotType: 'STANDARD', power: 0.7 }); // X
    if (edge(1)) this.input.emit({ kind: 'SKILL', moveId: null, lateralSign: 1 }); // B
    if (edge(4)) this.input.emit({ kind: 'SWITCH', dir: null }); // LB
    // Cycle-2 match-up on RB: hold = contain, release after a hold =
    // shoulder charge, quick tap = standing tackle.
    const rbNow = pressed[5] ?? false;
    const rbWas = this.prevPadButtons[5] ?? false;
    if (rbNow && !rbWas) { this.rbDownAt = performance.now(); this.input.matchUpHeld = true; }
    if (!rbNow && rbWas) {
      this.input.matchUpHeld = false;
      if (performance.now() - this.rbDownAt >= 280) this.input.emit({ kind: 'SHOULDER_CHARGE' });
      else this.input.emit({ kind: 'TACKLE' });
    }
    this.prevPadButtons = pressed;
  }
}
