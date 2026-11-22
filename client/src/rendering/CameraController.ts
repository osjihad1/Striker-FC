// Striker FC — rendering/CameraController.ts (Phase 02, Spec 07 §4)
// Critically-damped broadcast / pro / set-piece / celebration cameras with
// impact micro-shake. Smoothing uses exponential damp (lambda form of a
// critically damped spring) — no jerky lerps, no overshoot.
import * as THREE from 'three';

export type CameraMode =
  | 'BROADCAST' | 'PRO' | 'TACTICAL' | 'SET_PIECE' | 'CELEBRATION'
  | 'REPLAY_GOAL' | 'REPLAY_TIGHT';

function damp(cur: number, target: number, lambda: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}
function dampVec(v: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): void {
  v.x = damp(v.x, target.x, lambda, dt);
  v.y = damp(v.y, target.y, lambda, dt);
  v.z = damp(v.z, target.z, lambda, dt);
}

export class CameraController {
  mode: CameraMode = 'BROADCAST';
  private lookTarget = new THREE.Vector3(0, 0.6, 0);
  private desiredPos = new THREE.Vector3(0, 21, 44);
  private shakeTime = 0;
  private shakeAmp = 0;
  private fov = 38;
  /** Set-piece anchor (corner / free-kick taker position). */
  setPieceAnchor = new THREE.Vector3(40, 0, 25);
  /** Celebration focus (goal scorer position). */
  celebrationFocus = new THREE.Vector3(48, 1, 0);
  private orbitAngle = 0;

  setMode(mode: CameraMode): void { this.mode = mode; }

  /** Cycle-2 switch flash: for 0.2 s after a control switch the camera
   *  damps noticeably faster toward the new man's framing — a short ease
   *  that makes the handover felt, then normal broadcast smoothing. */
  private switchEaseSec = 0;
  easeToSwitch(): void { this.switchEaseSec = 0.2; }

  /** Micro-shake on crossbar / power-shot impact. strength 0..1. */
  addShake(strength: number): void {
    this.shakeAmp = Math.min(0.5, this.shakeAmp + strength * 0.32);
    this.shakeTime = 0;
  }

  update(
    camera: THREE.PerspectiveCamera,
    dt: number,
    ball: { x: number; y: number; z: number },
    ballVel: { x: number; z: number },
    focusPlayer: { x: number; z: number; yaw: number } | null,
    inPenaltyBox: boolean,
  ): void {
    const clampedDt = Math.min(dt, 0.05);
    // Cycle-2: the switch ease window — look/position damping roughly
    // doubles for 0.2 s so the frame settles on the new man quickly.
    const easeBoost = this.switchEaseSec > 0 ? 2.1 : 1;
    if (this.switchEaseSec > 0) this.switchEaseSec = Math.max(0, this.switchEaseSec - clampedDt);
    let targetFov = 38;
    switch (this.mode) {
      case 'BROADCAST': {
        // South sideline, tracks ball with velocity lead + slight centre bias.
        const leadX = ball.x * 0.72 + ballVel.x * 0.18;
        const leadZ = ball.z * 0.55;
        this.desiredPos.set(
          THREE.MathUtils.clamp(leadX, -38, 38),
          inPenaltyBox ? 15.5 : 21,
          44,
        );
        dampVec(this.lookTarget, new THREE.Vector3(leadX, 0.5, leadZ), 5.2 * easeBoost, clampedDt);
        targetFov = inPenaltyBox ? 33 : 38;
        break;
      }
      case 'PRO': {
        // Behind the active player, looking down their facing direction.
        if (focusPlayer) {
          const back = 7.5;
          const px = focusPlayer.x - Math.sin(focusPlayer.yaw) * back;
          const pz = focusPlayer.z - Math.cos(focusPlayer.yaw) * back;
          this.desiredPos.set(px, 3.1, pz);
          dampVec(this.lookTarget, new THREE.Vector3(
            focusPlayer.x + Math.sin(focusPlayer.yaw) * 9, 1, focusPlayer.z + Math.cos(focusPlayer.yaw) * 9,
          ), 7.5 * easeBoost, clampedDt);
          targetFov = 55;
        }
        break;
      }
      case 'TACTICAL': {
        // Epic §0: high, wide, near-top-down tactical view — the whole
        // shape of both teams stays readable; the frame pans gently with
        // the ball instead of tracking it tightly.
        this.desiredPos.set(
          THREE.MathUtils.clamp(ball.x * 0.3, -16, 16),
          52,
          30,
        );
        dampVec(this.lookTarget, new THREE.Vector3(ball.x * 0.3, 0, ball.z * 0.25), 3.2 * easeBoost, clampedDt);
        targetFov = 40;
        break;
      }
      case 'SET_PIECE': {
        const a = this.setPieceAnchor;
        this.desiredPos.set(a.x * 0.82, 6.5, a.z + (a.z >= 0 ? 13 : -13));
        dampVec(this.lookTarget, new THREE.Vector3(a.x, 0.8, a.z), 4.5, clampedDt);
        targetFov = 34;
        break;
      }
      case 'REPLAY_GOAL': {
        // Phase 05 replay Angle 1: low behind the goal, looking through the
        // net back up the pitch at the incoming strike.
        const goalX = ball.x >= 0 ? 52.5 : -52.5;
        const sign = Math.sign(goalX) || 1;
        this.desiredPos.set(goalX + sign * 4.2, 2.0, ball.z * 0.35);
        dampVec(this.lookTarget, new THREE.Vector3(ball.x - sign * 7, 0.9, ball.z), 6.5, clampedDt);
        targetFov = 42;
        break;
      }
      case 'REPLAY_TIGHT': {
        // Phase 05 replay Angle 2: sideline tight zoom tracking the ball.
        this.desiredPos.set(ball.x * 0.94, 3.4, ball.z + (ball.z >= 0 ? -12 : 12));
        dampVec(this.lookTarget, new THREE.Vector3(ball.x, 0.8, ball.z), 7.5, clampedDt);
        targetFov = 30;
        break;
      }
      case 'CELEBRATION': {
        this.orbitAngle += clampedDt * 0.45;
        const f = this.celebrationFocus;
        const r = 7.5;
        this.desiredPos.set(f.x + Math.sin(this.orbitAngle) * r, 2.4, f.z + Math.cos(this.orbitAngle) * r);
        dampVec(this.lookTarget, new THREE.Vector3(f.x, 1.1, f.z), 6, clampedDt);
        targetFov = 36;
        break;
      }
    }
    dampVec(camera.position, this.desiredPos,
      (this.mode === 'PRO' ? 6.5 : this.mode === 'REPLAY_GOAL' || this.mode === 'REPLAY_TIGHT' ? 5.5 : 3.4) * easeBoost, clampedDt);

    // Micro-shake: decaying high-frequency offset.
    this.shakeTime += clampedDt;
    if (this.shakeAmp > 0.003) {
      const decay = Math.exp(-this.shakeTime * 7);
      const s = this.shakeAmp * decay;
      camera.position.x += Math.sin(this.shakeTime * 61) * s;
      camera.position.y += Math.cos(this.shakeTime * 53) * s * 0.7;
      if (decay < 0.02) this.shakeAmp = 0;
    }

    camera.lookAt(this.lookTarget);
    const newFov = damp(this.fov, targetFov, 3.2, clampedDt);
    if (Math.abs(newFov - this.fov) > 0.01) {
      this.fov = newFov;
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }
  }
}
