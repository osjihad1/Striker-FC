// Striker FC — rendering/StadiumBuilder.ts (Phase 02, Spec 07 §2)
// 4-sided multi-tier bowl, roof ring, 4 floodlight towers with glow sprites,
// and animated perimeter LED boards (scrolling sponsors + GOAL!!! flash).
import * as THREE from 'three';
import {
  ADBOARDS_URL, CONCOURSE_URL, CROWD_DAY_URL, CROWD_NIGHT_URL,
  bandTextureFromImage, loadPhotoImage, loadPhotoTexture,
} from './TextureAssets';

const SPONSORS = ['STRIKER FC', 'APEX SPORTS', 'TURBO BOOTS', 'NOVA ENERGY', 'GLOBAL CUP'];

export interface StadiumBuild {
  group: THREE.Group;
  update: (time: number, dt: number) => void;
  flashGoalBoards: () => void;
  setFloodlightsOn: (on: boolean) => void;
}

function ledCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 64;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,0.9)');
  grad.addColorStop(0.35, 'rgba(200,220,255,0.35)');
  grad.addColorStop(1, 'rgba(180,200,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildStadium(): StadiumBuild {
  const group = new THREE.Group();
  const standMat = new THREE.MeshStandardMaterial({ color: '#232c38', roughness: 0.9 });
  const tierMats = ['#2b3648', '#31405a', '#27334a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: '#3d4a61', roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide });
  const trussMat = new THREE.MeshStandardMaterial({ color: '#5b6b84', roughness: 0.45, metalness: 0.6 });
  // Photo fascia band (ad boards) — dark fallback until the photo loads.
  const fasciaMat = new THREE.MeshBasicMaterial({ color: '#0a0f1e' });

  // --- Photo textures (textures pass, best-effort with plain fallbacks) --
  // Crowd: a horizontal band (~6 rows) of the crowd photo, tiled 5x
  // across each tier so the people read at real scale. Day/night swap
  // follows the floodlights. Concourse: the back walls. Ad boards: the
  // fascia band under the roof edge. Nothing here is load-bearing: if a
  // photo fails, the plain colours above stay.
  let crowdDayTex: THREE.Texture | null = null;
  let crowdNightTex: THREE.Texture | null = null;
  let floodlightsOn = false;
  const applyCrowd = () => {
    const tex = floodlightsOn ? crowdNightTex : crowdDayTex;
    if (!tex) return;
    for (const m of tierMats) {
      if (m.map !== tex) { m.map = tex; m.color.set('#ffffff'); m.needsUpdate = true; }
    }
  };
  const crowdBand = (img: HTMLImageElement): THREE.Texture => bandTextureFromImage(
    img, Math.round(img.naturalHeight * 0.35), Math.round(img.naturalHeight * 0.18), 2048, 360, 5,
  );
  void loadPhotoImage(CROWD_DAY_URL).then((img) => {
    if (!img) return;
    crowdDayTex = crowdBand(img);
    applyCrowd();
  });
  void loadPhotoImage(CROWD_NIGHT_URL).then((img) => {
    if (!img) return;
    crowdNightTex = crowdBand(img);
    applyCrowd();
  });
  void loadPhotoTexture(CONCOURSE_URL, 1024, 512, 4).then((tex) => {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    standMat.map = tex;
    standMat.color.set('#ffffff');
    standMat.needsUpdate = true;
  });
  void loadPhotoTexture(ADBOARDS_URL, 2048, 256, 4).then((tex) => {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    fasciaMat.map = tex;
    fasciaMat.color.set('#ffffff');
    fasciaMat.needsUpdate = true;
  });

  // --- Stands: 4 sides × 3 tiers of raked boxes -------------------------
  const sides: { pos: [number, number]; rotY: number; len: number }[] = [
    { pos: [0, 53], rotY: 0, len: 132 }, { pos: [0, -53], rotY: Math.PI, len: 132 },
    { pos: [66, 0], rotY: Math.PI / 2, len: 96 }, { pos: [-66, 0], rotY: -Math.PI / 2, len: 96 },
  ];
  for (const side of sides) {
    for (let tier = 0; tier < 3; tier += 1) {
      const tierMesh = new THREE.Mesh(new THREE.BoxGeometry(side.len, 4.4, 7), tierMats[tier]!);
      const radial = 7 * tier;
      const local = new THREE.Vector3(0, 3.4 + tier * 4.6, 7 + radial);
      tierMesh.position.set(side.pos[0], 0, side.pos[1]);
      tierMesh.rotation.y = side.rotY;
      tierMesh.translateZ(0); // orientation anchor
      tierMesh.position.set(0, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(side.pos[0], 0, side.pos[1]);
      holder.rotation.y = side.rotY;
      local.z = 0;
      tierMesh.position.set(0, 3.4 + tier * 4.6, tier * 6.5);
      tierMesh.rotation.x = -0.32;
      holder.add(tierMesh);
      group.add(holder);
    }
    // Back wall.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(side.len + 14, 19, 1.6), standMat);
    const holder = new THREE.Group();
    holder.position.set(side.pos[0], 0, side.pos[1]);
    holder.rotation.y = side.rotY;
    wall.position.set(0, 9.5, 21);
    holder.add(wall);
    group.add(holder);
    // Roof slab + truss beams.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(side.len + 18, 0.5, 24), roofMat);
    roof.position.set(0, 19.5, 13);
    roof.rotation.x = 0.16;
    holder.add(roof);
    for (let b = -2; b <= 2; b += 1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 24), trussMat);
      beam.position.set(b * (side.len / 5), 18.6, 13);
      beam.rotation.x = 0.16;
      holder.add(beam);
    }
    // Sponsor fascia band under the roof edge (photo ad boards).
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(side.len + 14, 1.1, 0.25), fasciaMat);
    fascia.position.set(0, 19.2, 21);
    holder.add(fascia);
  }

  // --- Floodlight towers --------------------------------------------------
  const glowTex = glowTexture();
  const glows: THREE.Sprite[] = [];
  const lampMat = new THREE.MeshStandardMaterial({ color: '#111827', emissive: '#fef9c3', emissiveIntensity: 2.4 });
  const pylonMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.5, metalness: 0.6 });
  const corners: [number, number][] = [[-72, -52], [72, -52], [-72, 52], [72, 52]];
  for (const [x, z] of corners) {
    const tower = new THREE.Group();
    tower.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 34, 8), pylonMat);
    pole.position.y = 17;
    pole.castShadow = true;
    tower.add(pole);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 0.5), lampMat);
    bank.position.y = 34.5;
    bank.lookAt(0, 0, 0);
    tower.add(bank);
    for (let r = 0; r < 2; r += 1) for (let col = 0; col < 4; col += 1) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), new THREE.MeshBasicMaterial({ color: '#fffbe6' }));
      lamp.position.set(-2.4 + col * 1.6, 33.8 + r * 1.5, 0);
      lamp.lookAt(0, 0, 0);
      tower.add(lamp);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#dbeafe', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.set(22, 22, 1);
    sprite.position.y = 34.5;
    tower.add(sprite);
    glows.push(sprite);
    group.add(tower);
    // Real light contribution from two of the towers (perf budget).
    if (Math.abs(x) > 0 && z > 0) {
      const spot = new THREE.SpotLight('#e8f1ff', 900, 220, 0.62, 0.55, 1.6);
      spot.position.set(x, 34, z);
      spot.target.position.set(0, 0, 0);
      group.add(spot, spot.target);
    }
  }

  // --- LED ad boards -------------------------------------------------------
  const { canvas, ctx } = ledCanvas();
  const ledTex = new THREE.CanvasTexture(canvas);
  ledTex.colorSpace = THREE.SRGBColorSpace;
  ledTex.wrapS = THREE.RepeatWrapping;
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const boardGeoLong = new THREE.BoxGeometry(118, 1.05, 0.3);
  const boardGeoShort = new THREE.BoxGeometry(76, 1.05, 0.3);
  const boards: THREE.Mesh[] = [];
  const placements: { geo: THREE.BoxGeometry; x: number; z: number; rotY: number }[] = [
    { geo: boardGeoLong, x: 0, z: 37.5, rotY: 0 }, { geo: boardGeoLong, x: 0, z: -37.5, rotY: Math.PI },
    { geo: boardGeoShort, x: 56.5, z: 0, rotY: Math.PI / 2 }, { geo: boardGeoShort, x: -56.5, z: 0, rotY: -Math.PI / 2 },
  ];
  for (const p of placements) {
    const m = new THREE.Mesh(p.geo, ledMat);
    m.position.set(p.x, 0.55, p.z);
    m.rotation.y = p.rotY;
    boards.push(m);
    group.add(m);
  }

  let goalFlashUntil = -1;
  let elapsed = 0;
  const drawBoards = (time: number) => {
    const flashing = elapsed < goalFlashUntil;
    ctx.fillStyle = flashing ? '#0b2a4a' : '#0a0f1e';
    ctx.fillRect(0, 0, 2048, 64);
    ctx.font = 'bold 40px "Barlow Condensed", sans-serif';
    ctx.textBaseline = 'middle';
    if (flashing) {
      ctx.fillStyle = (Math.floor(time * 6) % 2 === 0) ? '#f5c542' : '#22d3ee';
      ctx.textAlign = 'center';
      for (let i = 0; i < 4; i += 1) ctx.fillText('GOAL!!!', 256 + i * 512, 34);
      ctx.textAlign = 'left';
    } else {
      const offset = (time * 90) % 512;
      const palette = ['#a3e635', '#38bdf8', '#f5c542', '#f472b6', '#e2e8f0'];
      for (let i = -1; i < 6; i += 1) {
        ctx.fillStyle = palette[((i % palette.length) + palette.length) % palette.length]!;
        ctx.fillText(`✦ ${SPONSORS[((i % SPONSORS.length) + SPONSORS.length) % SPONSORS.length]}`, i * 512 - offset + 20, 34);
      }
    }
    ledTex.needsUpdate = true;
  };
  drawBoards(0);

  const setFloodlightsOn = (on: boolean) => {
    floodlightsOn = on;
    for (const s of glows) s.visible = on;
    lampMat.emissiveIntensity = on ? 2.4 : 0.1;
    applyCrowd(); // night crowd (phone lights) under floodlights
  };

  return {
    group,
    update: (time: number, dt: number) => { elapsed += dt; drawBoards(time); },
    flashGoalBoards: () => { goalFlashUntil = elapsed + 4; },
    setFloodlightsOn,
  };
}
