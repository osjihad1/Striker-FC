// Striker FC — rendering/FieldOverlays.ts (Phase 02, Spec 07 §3 HUD-in-world)
// Ground indicators under players: active ring + stamina arc + aim arrow,
// second-presser green ring, pass-target marker, VAR offside projection line.
import * as THREE from 'three';

function ringTexture(inner: number, outer: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, (inner + outer) / 2, 0, Math.PI * 2);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

export class FieldOverlays {
  readonly group = new THREE.Group();
  private activeRing: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private staminaArc: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private aimArrow: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private aimShaft: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private secondRing: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private passMarker: THREE.Group;
  private offsideLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private offsidePosts: THREE.Group;

  constructor() {
    const flat = (m: THREE.Mesh) => { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; return m; };

    this.activeRing = flat(new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: ringTexture(48, 62, '#a3e635'), transparent: true, depthWrite: false }),
    )) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    this.activeRing.position.y = 0.03;
    this.group.add(this.activeRing);

    // Stamina arc: partial ring whose sweep maps to stamina fraction.
    this.staminaArc = flat(new THREE.Mesh(
      new THREE.RingGeometry(0.86, 0.97, 32, 1, 0, Math.PI * 1.5),
      new THREE.MeshBasicMaterial({ color: '#84cc16', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    )) as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    this.staminaArc.position.y = 0.035;
    this.group.add(this.staminaArc);

    this.aimShaft = flat(new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 1),
      new THREE.MeshBasicMaterial({ color: '#f5c542', transparent: true, opacity: 0.9, depthWrite: false }),
    )) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    this.aimShaft.geometry.translate(0, 0.5, 0);
    this.aimShaft.position.y = 0.04;
    this.aimArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: '#f5c542', transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.aimArrow.rotation.x = Math.PI / 2;
    this.aimArrow.renderOrder = 3;
    this.group.add(this.aimShaft, this.aimArrow);
    this.setAimVisible(false);

    this.secondRing = flat(new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: ringTexture(48, 62, '#22c55e'), transparent: true, depthWrite: false }),
    )) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    this.secondRing.position.y = 0.03;
    this.secondRing.visible = false;
    this.group.add(this.secondRing);

    // Pass target: pulsing diamond marker.
    this.passMarker = new THREE.Group();
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    diamond.position.y = 0.5;
    this.passMarker.add(diamond);
    this.passMarker.visible = false;
    this.group.add(this.passMarker);

    // VAR offside line: full-width translucent plane at the offside X + posts.
    this.offsideLine = flat(new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 68),
      new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.4, depthWrite: false }),
    )) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    this.offsideLine.position.y = 0.025;
    this.offsidePosts = new THREE.Group();
    const postMat = new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.8 });
    for (const z of [-34, 34]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), postMat);
      post.position.set(0, 1.6, z);
      this.offsidePosts.add(post);
    }
    this.offsideLine.visible = false;
    this.offsidePosts.visible = false;
    this.group.add(this.offsideLine, this.offsidePosts);
  }

  setActivePlayer(x: number, z: number, stamina01: number, time: number, switchPulse = 0): void {
    this.activeRing.position.x = x;
    this.activeRing.position.z = z;
    // Cycle-2 switch flash: on a control switch the ring swells and
    // brightens (switchPulse 1 → 0 over ~0.9 s) so the handover is visible
    // on the pitch itself, on top of the gentle idle breathing pulse.
    const pulse = 1 + Math.sin(time * 5) * 0.05 + switchPulse * 0.6;
    this.activeRing.scale.setScalar(pulse);
    (this.activeRing.material as THREE.MeshBasicMaterial).opacity = 0.75 + switchPulse * 0.25;
    this.staminaArc.position.x = x;
    this.staminaArc.position.z = z;
    // Rebuild sweep when stamina changes materially (cheap: geometry swap).
    const sweep = Math.max(0.05, stamina01) * Math.PI * 2;
    const cur = (this.staminaArc.geometry as THREE.RingGeometry).parameters.thetaLength;
    if (Math.abs(cur - sweep) > 0.05) {
      this.staminaArc.geometry.dispose();
      this.staminaArc.geometry = new THREE.RingGeometry(0.86, 0.97, 32, 1, -Math.PI / 2, sweep);
      (this.staminaArc.material as THREE.MeshBasicMaterial).color.set(stamina01 > 0.35 ? '#84cc16' : stamina01 > 0.15 ? '#eab308' : '#ef4444');
    }
  }

  setAim(x: number, z: number, dirX: number, dirZ: number, lengthM: number): void {
    this.setAimVisible(true);
    const yaw = Math.atan2(dirX, dirZ);
    this.aimShaft.position.x = x;
    this.aimShaft.position.z = z;
    this.aimShaft.rotation.z = -yaw;
    this.aimShaft.scale.y = Math.max(0.4, lengthM);
    this.aimArrow.position.set(x + dirX * (lengthM + 0.3), 0.06, z + dirZ * (lengthM + 0.3));
    this.aimArrow.rotation.z = 0;
    this.aimArrow.rotation.y = yaw;
    this.aimArrow.rotation.x = Math.PI / 2;
  }

  setAimVisible(v: boolean): void { this.aimShaft.visible = v; this.aimArrow.visible = v; }

  setSecondDefender(x: number, z: number): void {
    this.secondRing.visible = true;
    this.secondRing.position.x = x;
    this.secondRing.position.z = z;
  }
  hideSecondDefender(): void { this.secondRing.visible = false; }

  setPassTarget(x: number, z: number, time: number): void {
    this.passMarker.visible = true;
    this.passMarker.position.set(x, Math.sin(time * 6) * 0.08, z);
  }
  hidePassTarget(): void { this.passMarker.visible = false; }

  setOffsideLine(x: number | null): void {
    const show = x !== null;
    this.offsideLine.visible = show;
    this.offsidePosts.visible = show;
    if (x !== null) {
      this.offsideLine.position.x = x;
      this.offsidePosts.position.x = x;
    }
  }
}
