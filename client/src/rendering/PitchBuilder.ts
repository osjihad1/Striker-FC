// Striker FC — rendering/PitchBuilder.ts (Phase 02, Spec 07 §2)
// Procedural 2048×1024 PBR pitch: 18 mowed stripes, micro-grain, worn areas,
// crisp FIFA regulation markings drawn slightly above the surface via a
// dedicated line plane at +0.02m (polygon offset — zero z-fighting).
import * as THREE from 'three';
import { PITCH } from '../core/constants';
import { GRASS_DAY_URL, GRASS_NIGHT_URL, loadPhotoTexture } from './TextureAssets';

/** Epic fix round (P1-12): pitch textures scale with the graphics tier —
 *  LOW/MEDIUM paint at 1024×512 (a quarter of the texel memory), HIGH and
 *  ULTRA keep the full 2048×1024. Set by buildPitch before painting. */
let TEX_W = 2048;
let TEX_H = 1024;

export function pitchTextureSizeFor(quality: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA'): { w: number; h: number } {
  return quality === 'LOW' || quality === 'MEDIUM' ? { w: 1024, h: 512 } : { w: 2048, h: 1024 };
}
// Playable surface incl. run-off apron.
const SURF_L = 125;
const SURF_W = 88;

function worldToPx(x: number, z: number, w: number, h: number): [number, number] {
  return [((x + SURF_L / 2) / SURF_L) * w, ((z + SURF_W / 2) / SURF_W) * h];
}

function makeGrassCanvas(mode: 'albedo' | 'bump' | 'rough'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d')!;
  const stripes = 18;
  for (let i = 0; i < stripes; i += 1) {
    const x0 = (i / stripes) * TEX_W;
    const wStripe = TEX_W / stripes;
    if (mode === 'albedo') g.fillStyle = i % 2 === 0 ? '#43a047' : '#2e7d32';
    else if (mode === 'bump') g.fillStyle = i % 2 === 0 ? '#7a7a7a' : '#858585';
    else g.fillStyle = i % 2 === 0 ? '#e8e8e8' : '#dedede';
    g.fillRect(x0, 0, wStripe + 1, TEX_H);
  }
  // Micro-grain: thousands of tiny blade speckles.
  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const speckles = mode === 'albedo' ? 26000 : 14000;
  for (let i = 0; i < speckles; i += 1) {
    const x = rnd() * TEX_W; const y = rnd() * TEX_H;
    if (mode === 'albedo') {
      g.fillStyle = rnd() > 0.5 ? 'rgba(20,70,20,0.16)' : 'rgba(140,220,120,0.12)';
      g.fillRect(x, y, 2, 3);
    } else if (mode === 'bump') {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      g.fillRect(x, y, 1.5, 2.5);
    } else {
      g.fillStyle = 'rgba(120,120,120,0.18)';
      g.fillRect(x, y, 2, 2);
    }
  }
  if (mode === 'albedo') {
    // Worn turf near goal mouths + penalty spots + centre.
    const worn: [number, number, number][] = [
      [-PITCH.HALF_LENGTH + 4, 0, 90], [PITCH.HALF_LENGTH - 4, 0, 90],
      [-PITCH.HALF_LENGTH + PITCH.PENALTY_SPOT_DIST, 0, 34], [PITCH.HALF_LENGTH - PITCH.PENALTY_SPOT_DIST, 0, 34],
      [0, 0, 44],
    ];
    for (const [wx, wz, r] of worn) {
      const [px, py] = worldToPx(wx, wz, TEX_W, TEX_H);
      const grad = g.createRadialGradient(px, py, 2, px, py, r);
      grad.addColorStop(0, 'rgba(122,102,60,0.35)');
      grad.addColorStop(1, 'rgba(122,102,60,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

function drawMarkings(g: CanvasRenderingContext2D): void {
  const L = PITCH.LENGTH; const W = PITCH.WIDTH;
  const px = (x: number, z: number) => worldToPx(x, z, TEX_W, TEX_H);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 5;
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const [ax, ay] = px(x1, z1); const [bx, by] = px(x2, z2);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  };
  const rect = (cx: number, cz: number, hl: number, hw: number) => {
    const [ax, ay] = px(cx - hl, cz - hw); const [bx, by] = px(cx + hl, cz + hw);
    g.strokeRect(ax, ay, bx - ax, by - ay);
  };
  const circle = (x: number, z: number, r: number, arc?: [number, number]) => {
    const [cx, cy] = px(x, z);
    const rPx = (r / SURF_L) * TEX_W;
    g.beginPath();
    if (arc) g.arc(cx, cy, rPx, arc[0], arc[1]); else g.arc(cx, cy, rPx, 0, Math.PI * 2);
    g.stroke();
  };
  const spot = (x: number, z: number) => {
    const [cx, cy] = px(x, z);
    g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
  };
  // Touchlines + halfway line.
  rect(0, 0, L / 2, W / 2);
  line(0, -W / 2, 0, W / 2);
  circle(0, 0, PITCH.CENTER_CIRCLE_RADIUS);
  spot(0, 0);
  for (const s of [-1, 1] as const) {
    const gx = s * (L / 2);
    // Penalty area + goal area (drawn from goal line inward).
    rect(gx - s * (PITCH.PENALTY_AREA_LENGTH / 2), 0, PITCH.PENALTY_AREA_LENGTH / 2, PITCH.PENALTY_AREA_HALF_WIDTH);
    rect(gx - s * (PITCH.GOAL_AREA_LENGTH / 2), 0, PITCH.GOAL_AREA_LENGTH / 2, PITCH.GOAL_AREA_HALF_WIDTH);
    spot(gx - s * PITCH.PENALTY_SPOT_DIST, 0);
    // Penalty arc: the part of the 9.15m circle outside the box.
    const a = Math.acos((PITCH.PENALTY_AREA_LENGTH - PITCH.PENALTY_SPOT_DIST) / PITCH.CENTER_CIRCLE_RADIUS);
    if (s < 0) circle(gx + PITCH.PENALTY_SPOT_DIST, 0, PITCH.CENTER_CIRCLE_RADIUS, [-a, a]);
    else circle(gx - PITCH.PENALTY_SPOT_DIST, 0, PITCH.CENTER_CIRCLE_RADIUS, [Math.PI - a, Math.PI + a]);
    // Corner arcs (1m radius).
    for (const cz of [-W / 2, W / 2]) {
      const start = cz < 0 ? (gx < 0 ? 0 : Math.PI / 2) : (gx < 0 ? -Math.PI / 2 : Math.PI);
      circle(gx, cz, 1, [start, start + Math.PI / 2]);
    }
  }
}

export interface PitchBuild {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  update: (time: number) => void;
  /** Swap the grass photo between the day and night shots. No-op until
   *  the photos have loaded — the procedural canvas stays until then. */
  setNight: (night: boolean) => void;
}

export function buildPitch(quality: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA' = 'HIGH'): PitchBuild {
  const size = pitchTextureSizeFor(quality);
  TEX_W = size.w;
  TEX_H = size.h;
  const group = new THREE.Group();
  const albedo = new THREE.CanvasTexture(makeGrassCanvas('albedo'));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 8;
  const bump = new THREE.CanvasTexture(makeGrassCanvas('bump'));
  const rough = new THREE.CanvasTexture(makeGrassCanvas('rough'));
  const material = new THREE.MeshStandardMaterial({
    map: albedo, bumpMap: bump, bumpScale: 0.6, roughnessMap: rough, roughness: 0.92, metalness: 0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SURF_L, SURF_W), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Photo grass (textures pass): the 4096px day/night shots replace the
  // procedural albedo once loaded, downscaled to the tier (LOW/MEDIUM
  // 1024px, HIGH/ULTRA 2048px — the full source is never uploaded to the
  // GPU). The procedural canvas above stays as the fallback AND as the
  // bump/rough source, and the markings plane is untouched.
  const photoMax = quality === 'LOW' || quality === 'MEDIUM' ? { w: 1024, h: 512 } : { w: 2048, h: 1024 };
  const photoAniso = quality === 'LOW' ? 2 : 8;
  let photoDay: THREE.Texture | null = null;
  let photoNight: THREE.Texture | null = null;
  let isNight = false;
  const applyPhoto = () => {
    const tex = isNight ? photoNight : photoDay;
    if (tex && material.map !== tex) { material.map = tex; material.needsUpdate = true; }
  };
  void loadPhotoTexture(GRASS_DAY_URL, photoMax.w, photoMax.h, photoAniso).then((tex) => {
    photoDay = tex;
    applyPhoto();
  });
  void loadPhotoTexture(GRASS_NIGHT_URL, photoMax.w, photoMax.h, photoAniso).then((tex) => {
    photoNight = tex;
    applyPhoto();
  });

  // Markings on their own transparent canvas plane, lifted +0.02m: crisp, no z-fight.
  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = TEX_W; lineCanvas.height = TEX_H;
  drawMarkings(lineCanvas.getContext('2d')!);
  const lineTex = new THREE.CanvasTexture(lineCanvas);
  lineTex.colorSpace = THREE.SRGBColorSpace;
  lineTex.anisotropy = 8;
  const lineMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SURF_L, SURF_W),
    new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  lineMesh.rotation.x = -Math.PI / 2;
  lineMesh.position.y = 0.02;
  lineMesh.renderOrder = 1;
  group.add(lineMesh);

  // Corner flags: pole + cloth that waves with sin(time*4 + phase).
  const cloths: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; phase: number }[] = [];
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 });
  const corners: [number, number][] = [
    [-PITCH.HALF_LENGTH, -PITCH.HALF_WIDTH], [-PITCH.HALF_LENGTH, PITCH.HALF_WIDTH],
    [PITCH.HALF_LENGTH, -PITCH.HALF_WIDTH], [PITCH.HALF_LENGTH, PITCH.HALF_WIDTH],
  ];
  corners.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 0.8, z);
    pole.castShadow = true;
    group.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.55, 0.38, 6, 2);
    clothGeo.translate(0.28, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: '#ef4444', side: THREE.DoubleSide, roughness: 0.8 }));
    cloth.position.set(x, 1.38, z);
    cloth.rotation.y = x < 0 ? 0 : Math.PI;
    group.add(cloth);
    cloths.push({ mesh: cloth, phase: i * 1.7 });
  });

  return {
    group,
    material,
    update: (time: number) => {
      for (const { mesh: cloth, phase } of cloths) {
        const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v += 1) {
          const vx = pos.getX(v);
          pos.setZ(v, Math.sin(time * 4 + phase + vx * 5) * 0.09 * (vx / 0.55));
        }
        pos.needsUpdate = true;
        cloth.geometry.computeVertexNormals();
      }
    },
    setNight: (night: boolean) => { isNight = night; applyPhoto(); },
  };
}
