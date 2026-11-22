// Striker FC — rendering/BallRenderer.ts (Phase 02, Spec 07 §3/04)
// Stylized paneled football: procedural pentagon-panel canvas texture on a
// sphere, contact shadow, spin via quaternion integration, and a fading
// velocity trail ribbon for POWER / FINESSE shots.
import * as THREE from 'three';
import { BALL_CONST } from '../core/constants';

const TRAIL_POINTS = 26;

export class BallRenderer {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private trail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private trailPos: Float32Array;
  private history: THREE.Vector3[] = [];
  trailMode: 'NONE' | 'POWER' | 'FINESSE' = 'NONE';
  private spinAxis = new THREE.Vector3(1, 0, 0);
  private spinRate = 0;

  constructor() {
    const tex = panelTexture();
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_CONST.RADIUS, 28, 20),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.05 }),
    );
    this.ball.castShadow = true;
    this.ball.position.y = BALL_CONST.RADIUS;
    this.group.add(this.ball);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128; shadowCanvas.height = 128;
    const g = shadowCanvas.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 18),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 2;
    this.group.add(this.shadow);

    this.trailPos = new Float32Array(TRAIL_POINTS * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#f5c542', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.group.add(this.trail);
  }

  /** Spin axis/rate from angular velocity (rad/s) — Phase 03 BallPhysics feeds this. */
  setSpin(axis: { x: number; y: number; z: number }, rateRadPerSec: number): void {
    this.spinAxis.set(axis.x, axis.y, axis.z);
    if (this.spinAxis.lengthSq() > 1e-8) this.spinAxis.normalize();
    this.spinRate = rateRadPerSec;
  }

  setPosition(x: number, y: number, z: number): void {
    this.ball.position.set(x, Math.max(BALL_CONST.RADIUS, y), z);
    this.shadow.position.x = x;
    this.shadow.position.z = z;
    const height = Math.max(0, this.ball.position.y - BALL_CONST.RADIUS);
    const s = Math.max(0.45, 1 - height * 0.16);
    this.shadow.scale.setScalar(s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.85 * s;
  }

  get position(): THREE.Vector3 { return this.ball.position; }

  update(dt: number): void {
    if (Math.abs(this.spinRate) > 0.01 && dt > 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.ball.quaternion.premultiply(q);
    }
    // Trail ribbon follows recent positions when a special shot is live.
    this.history.unshift(this.ball.position.clone());
    if (this.history.length > TRAIL_POINTS) this.history.pop();
    const active = this.trailMode !== 'NONE';
    this.trail.visible = active && this.history.length > 3;
    if (this.trail.visible) {
      (this.trail.material as THREE.MeshBasicMaterial).color.set(this.trailMode === 'POWER' ? '#f5c542' : '#22d3ee');
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < TRAIL_POINTS; i += 1) {
        const p = this.history[Math.min(i, this.history.length - 1)] ?? this.ball.position;
        const width = 0.16 * (1 - i / TRAIL_POINTS) + 0.02;
        this.trailPos[i * 6] = p.x - up.x * width;
        this.trailPos[i * 6 + 1] = p.y - width;
        this.trailPos[i * 6 + 2] = p.z;
        this.trailPos[i * 6 + 3] = p.x;
        this.trailPos[i * 6 + 4] = p.y + width;
        this.trailPos[i * 6 + 5] = p.z;
      }
      (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function panelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f8fafc';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#111827';
  const pentagon = (cx: number, cy: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  };
  const spots: [number, number][] = [[64, 64], [192, 128], [320, 64], [448, 128], [128, 200], [256, 220], [384, 200], [0, 128], [512, 64]];
  for (const [x, y] of spots) pentagon(x, y, 26);
  g.strokeStyle = 'rgba(15,23,42,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
