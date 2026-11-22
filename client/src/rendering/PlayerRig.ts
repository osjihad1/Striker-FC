// Striker FC — rendering/PlayerRig.ts
// Smooth humanoid athlete rig (lobby-redesign pass): every body part is a
// rounded primitive — capsule torso with oval cross-section, sphere head
// with jaw / ears / nose, sphere shoulder / elbow / knee joints, capsule
// arms and tapered legs, rounded boots. No boxes anywhere: a footballer is
// curves, and at match-camera distance the silhouette reads as a person,
// not a stack of crates. Proportions: head ≈ 1/7.5 of total height, legs
// ≈ 46% of height, height & build scale from FaceAppearance.
// Joint pivots are unchanged from the original rig (pelvis 0.96, torso
// +0.06, head +0.72, fore −0.30, shin −0.42) so PlayerAnimator poses land
// exactly where they always have — only the meshes inside each joint
// group changed. Geometries are shared module-level constants (dispose()
// only frees GPU buffers; three re-uploads on next render), materials are
// per-rig because kit / skin / hair colours differ per player.
//
// RIG MERGE (fix round): the parts above are still constructed mesh by
// mesh, but before the rig is returned every joint group's parts are
// MERGED into a single mesh per joint with BufferGeometryUtils
// .mergeGeometries — per-part material colours are baked into a vertex
// `color` attribute and one shared vertex-colour material draws them
// all, the chest wears one shared jersey ATLAS texture (kit tiles drawn
// once, never a per-rig jersey canvas), and the two number plates merge
// into one mesh sampling one shared plate ATLAS. A FULL rig drops
// from ~52 meshes to 14, a LOW rig to 13 (chest pattern baked into
// vertex colours; plates kept via the shared atlas) — 22 LOW
// rigs ≈ 286 draw calls, inside the ≤350 LOW budget the perf lab now
// measures against the live renderer. The joint groups, pivots and
// animator contract are untouched, so every pose lands exactly as before.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FaceAppearance } from '../core/types';

export type KitKind = 'HOME' | 'AWAY' | 'HOME_GK' | 'AWAY_GK';

export interface KitColors { primary: string; secondary: string; shorts: string; socks: string }

export function kitFor(kind: KitKind, home: KitColors, away: KitColors): KitColors {
  switch (kind) {
    case 'HOME': return home;
    case 'AWAY': return away;
    case 'HOME_GK': return { primary: '#a3e635', secondary: '#111827', shorts: '#111827', socks: '#a3e635' };
    case 'AWAY_GK': return { primary: '#fb923c', secondary: '#111827', shorts: '#1f2937', socks: '#fb923c' };
  }
}

export interface RigJoints {
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; foreL: THREE.Group;
  armR: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; shinL: THREE.Group;
  legR: THREE.Group; shinR: THREE.Group;
  body: THREE.Group;
}

export interface PlayerRig {
  group: THREE.Group;
  joints: RigJoints;
  setShadowVisible: (v: boolean) => void;
}

// --- Shared smooth geometries (high segment counts = soft silhouettes) ----
const GEO = {
  hips: new THREE.SphereGeometry(0.21, 24, 18),
  torso: new THREE.CapsuleGeometry(0.215, 0.3, 8, 24),
  shoulder: new THREE.SphereGeometry(0.086, 18, 14),
  collar: new THREE.TorusGeometry(0.088, 0.021, 10, 24),
  neck: new THREE.CylinderGeometry(0.05, 0.058, 0.13, 14),
  skull: new THREE.SphereGeometry(0.128, 26, 20),
  jaw: new THREE.SphereGeometry(0.096, 20, 14),
  ear: new THREE.SphereGeometry(0.028, 10, 8),
  nose: new THREE.SphereGeometry(0.022, 10, 8),
  eye: new THREE.SphereGeometry(0.0135, 8, 6),
  hairCapShort: new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, 1.72),
  hairCapFade: new THREE.SphereGeometry(0.133, 24, 16, 0, Math.PI * 2, 0, 1.38),
  curl: new THREE.SphereGeometry(0.046, 12, 10),
  afro: new THREE.SphereGeometry(0.176, 22, 16),
  hairBack: new THREE.CapsuleGeometry(0.078, 0.2, 6, 14),
  hairStrand: new THREE.CapsuleGeometry(0.026, 0.16, 4, 10),
  mohawk: new THREE.CapsuleGeometry(0.034, 0.19, 6, 12),
  armJoint: new THREE.SphereGeometry(0.07, 16, 12),
  sleeve: new THREE.CapsuleGeometry(0.069, 0.085, 6, 16),
  upperArm: new THREE.CapsuleGeometry(0.054, 0.125, 6, 16),
  elbow: new THREE.SphereGeometry(0.05, 14, 10),
  forearm: new THREE.CapsuleGeometry(0.047, 0.135, 6, 16),
  hand: new THREE.SphereGeometry(0.052, 14, 12),
  hipJoint: new THREE.SphereGeometry(0.086, 16, 12),
  shortsLeg: new THREE.CapsuleGeometry(0.089, 0.1, 6, 16),
  thigh: new THREE.CapsuleGeometry(0.072, 0.155, 6, 16),
  knee: new THREE.SphereGeometry(0.06, 14, 12),
  calf: new THREE.SphereGeometry(0.068, 14, 12),
  shin: new THREE.CapsuleGeometry(0.056, 0.165, 6, 16),
  ankle: new THREE.SphereGeometry(0.042, 12, 10),
  bootBody: new THREE.CapsuleGeometry(0.05, 0.125, 6, 14),
  bootToe: new THREE.SphereGeometry(0.049, 14, 10),
  numberFront: new THREE.PlaneGeometry(0.15, 0.15),
  numberBack: new THREE.PlaneGeometry(0.27, 0.27),
  shadow: new THREE.CircleGeometry(0.42, 24),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Jersey fabric art (256×256 at the context origin): horizontal bands
 *  wrap the capsule torso cleanly. Drawn into the shared atlas below —
 *  and, as a fallback for a full atlas, into a per-kit canvas. */
function drawJerseyArt(g: CanvasRenderingContext2D, kit: KitColors): void {
  g.fillStyle = kit.primary;
  g.fillRect(0, 0, 256, 256);
  // Subtle woven pinstripes.
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 7, 256);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 16; x < 256; x += 32) g.fillRect(x, 0, 7, 256);
  g.fillStyle = kit.secondary;
  g.fillRect(0, 0, 256, 26); // collar band (capsule top)
  g.fillRect(0, 232, 256, 24); // hem band (capsule bottom)
}

function jerseyTexture(kit: KitColors): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  drawJerseyArt(c.getContext('2d')!, kit);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- Shared jersey atlas ----------------------------------------------------
// ONE canvas atlas (4096×2048, 16×8 tiles of 256²) holds every kit's
// jersey art; each distinct kit is drawn into its tile exactly once and
// every chest mesh samples its tile through remapped UVs under ONE
// shared material. No per-rig jersey canvas textures exist any more.
// If all 128 tiles ever fill, late kits fall back to a per-kit material
// (kits are few and cached, so the fallback stays bounded too).
const ATLAS_TILE = 256;
const ATLAS_COLS = 16;
const ATLAS_ROWS = 8;
let atlasCanvas: HTMLCanvasElement | null = null;
let atlasCtx: CanvasRenderingContext2D | null = null;
let atlasTexture: THREE.CanvasTexture | null = null;
let sharedJerseyMat: THREE.MeshStandardMaterial | null = null;
const atlasKitTiles = new Map<string, number>();
let atlasNextTile = 0;
const fallbackJerseyMats = new Map<string, THREE.MeshStandardMaterial>();

function ensureAtlas(): { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  if (!atlasCanvas || !atlasCtx || !atlasTexture) {
    atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = ATLAS_TILE * ATLAS_COLS;
    atlasCanvas.height = ATLAS_TILE * ATLAS_ROWS;
    atlasCtx = atlasCanvas.getContext('2d')!;
    atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    atlasTexture.anisotropy = 4;
  }
  return { ctx: atlasCtx, tex: atlasTexture };
}

interface UvRect { u0: number; v0: number; u1: number; v1: number }

/** UV rect of the kit's atlas tile, drawing the art on first use. */
function jerseyAtlasRect(kit: KitColors): UvRect | null {
  const key = `${kit.primary}|${kit.secondary}`;
  const { ctx, tex } = ensureAtlas();
  let tile = atlasKitTiles.get(key);
  if (tile === undefined) {
    if (atlasNextTile >= ATLAS_COLS * ATLAS_ROWS) return null;
    tile = atlasNextTile;
    atlasNextTile += 1;
    atlasKitTiles.set(key, tile);
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * ATLAS_TILE, row * ATLAS_TILE, ATLAS_TILE, ATLAS_TILE);
    ctx.clip();
    ctx.translate(col * ATLAS_TILE, row * ATLAS_TILE);
    drawJerseyArt(ctx, kit);
    ctx.restore();
    tex.needsUpdate = true;
  }
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const u0 = (col * ATLAS_TILE) / (ATLAS_TILE * ATLAS_COLS);
  const u1 = u0 + 1 / ATLAS_COLS;
  const v1 = 1 - (row * ATLAS_TILE) / (ATLAS_TILE * ATLAS_ROWS);
  const v0 = v1 - 1 / ATLAS_ROWS;
  return { u0, v0, u1, v1 };
}

function jerseyMaterial(): THREE.MeshStandardMaterial {
  const { tex } = ensureAtlas();
  if (!sharedJerseyMat) {
    sharedJerseyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }
  return sharedJerseyMat;
}

function fallbackJerseyMaterial(kit: KitColors): THREE.MeshStandardMaterial {
  const key = `${kit.primary}|${kit.secondary}`;
  let mat = fallbackJerseyMats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ map: jerseyTexture(kit), roughness: 0.8 });
    fallbackJerseyMats.set(key, mat);
  }
  return mat;
}

/** One shared material for every merged vertex-coloured part of every
 *  rig: skin, hair, shorts, socks, sleeves, boots, face detail — the
 *  per-part colours live in the merged geometry's `color` attribute. */
let sharedVertexMat: THREE.MeshStandardMaterial | null = null;
function vertexColorMaterial(): THREE.MeshStandardMaterial {
  if (!sharedVertexMat) {
    sharedVertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.05 });
  }
  return sharedVertexMat;
}

/** Shared contact-shadow disc texture + material (was one canvas per rig). */
let sharedShadowMat: THREE.MeshBasicMaterial | null = null;
function shadowDiscMaterial(): THREE.MeshBasicMaterial {
  if (!sharedShadowMat) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    sharedShadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  return sharedShadowMat;
}

/** Plate art (512×256 at the context origin): back art left (surname
 *  over a big number), front art right (the small chest number, drawn
 *  at 2× the old 128px plate so it stays crisp at the same world size).
 *  Drawn into the shared plate atlas below; there is no per-player
 *  plate canvas anywhere. */
function drawPlatesArt(bg: CanvasRenderingContext2D, number: number, name: string): void {
  bg.font = '600 30px "Barlow Condensed", sans-serif';
  bg.textAlign = 'center';
  bg.lineWidth = 5;
  bg.strokeStyle = 'rgba(0,0,0,0.5)';
  bg.fillStyle = '#ffffff';
  const surname = name.toUpperCase().slice(0, 14);
  bg.strokeText(surname, 128, 62);
  bg.fillText(surname, 128, 62);
  bg.font = 'bold 132px "Barlow Condensed", sans-serif';
  bg.lineWidth = 9;
  bg.strokeText(String(number), 128, 196);
  bg.fillText(String(number), 128, 196);
  bg.font = 'bold 124px "Barlow Condensed", sans-serif';
  bg.lineWidth = 14;
  bg.strokeStyle = 'rgba(0,0,0,0.55)';
  bg.strokeText(String(number), 384, 168);
  bg.fillText(String(number), 384, 168);
}



// --- Shared plate atlas -----------------------------------------------------
// ONE canvas atlas (4096×2048, 8×8 tiles of 512×256) holds every
// player's name/number plate art; each distinct (number, name) pair is
// drawn into its tile exactly once and every rig's merged plate mesh
// samples its tile through remapped UVs under ONE shared material —
// no per-rig plate CanvasTexture exists any more (a match used to
// create 22 of them on FULL). Tiles are LRU-managed: the map keeps
// insertion (recency) order, and when all 64 tiles are taken the
// least-recently-used tile is cleared and redrawn for the new pair, so
// the atlas serves an unbounded session — a match fields at most ~50
// live rigs, well under the tile count, so a tile under a visible rig
// is never the eviction candidate in practice.
const PLATE_TILE_W = 512;
const PLATE_TILE_H = 256;
const PLATE_COLS = 8;
const PLATE_ROWS = 8;
let plateCanvas: HTMLCanvasElement | null = null;
let plateCtx: CanvasRenderingContext2D | null = null;
let plateTexture: THREE.CanvasTexture | null = null;
let sharedPlateMat: THREE.MeshStandardMaterial | null = null;
const plateTiles = new Map<string, number>();
let plateNextTile = 0;

function ensurePlateAtlas(): { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  if (!plateCanvas || !plateCtx || !plateTexture) {
    plateCanvas = document.createElement('canvas');
    plateCanvas.width = PLATE_TILE_W * PLATE_COLS;
    plateCanvas.height = PLATE_TILE_H * PLATE_ROWS;
    plateCtx = plateCanvas.getContext('2d')!;
    plateTexture = new THREE.CanvasTexture(plateCanvas);
    plateTexture.colorSpace = THREE.SRGBColorSpace;
    plateTexture.anisotropy = 4;
  }
  return { ctx: plateCtx, tex: plateTexture };
}

/** UV rect of the player's plate-atlas tile, drawing the art on first
 *  use (or redrawing an evicted LRU tile). */
function plateAtlasRect(number: number, name: string): UvRect {
  const key = `${number}|${name.toUpperCase().slice(0, 14)}`;
  const { ctx, tex } = ensurePlateAtlas();
  let tile = plateTiles.get(key);
  if (tile !== undefined) {
    // Refresh recency: re-insert so this pair is evicted last.
    plateTiles.delete(key);
    plateTiles.set(key, tile);
  } else {
    if (plateNextTile < PLATE_COLS * PLATE_ROWS) {
      tile = plateNextTile;
      plateNextTile += 1;
    } else {
      // Atlas full: evict the least-recently-used pair and reuse its tile.
      const oldest = plateTiles.keys().next();
      tile = oldest.done ? 0 : (plateTiles.get(oldest.value) ?? 0);
      if (!oldest.done) plateTiles.delete(oldest.value);
    }
    plateTiles.set(key, tile);
    const col = tile % PLATE_COLS;
    const row = Math.floor(tile / PLATE_COLS);
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * PLATE_TILE_W, row * PLATE_TILE_H, PLATE_TILE_W, PLATE_TILE_H);
    ctx.clip();
    ctx.translate(col * PLATE_TILE_W, row * PLATE_TILE_H);
    ctx.clearRect(0, 0, PLATE_TILE_W, PLATE_TILE_H);
    drawPlatesArt(ctx, number, name);
    ctx.restore();
    tex.needsUpdate = true;
  }
  const col = tile % PLATE_COLS;
  const row = Math.floor(tile / PLATE_COLS);
  const u0 = (col * PLATE_TILE_W) / (PLATE_TILE_W * PLATE_COLS);
  const u1 = u0 + 1 / PLATE_COLS;
  const v1 = 1 - (row * PLATE_TILE_H) / (PLATE_TILE_H * PLATE_ROWS);
  const v0 = v1 - 1 / PLATE_ROWS;
  return { u0, v0, u1, v1 };
}

function plateMaterial(): THREE.MeshStandardMaterial {
  const { tex } = ensurePlateAtlas();
  if (!sharedPlateMat) {
    sharedPlateMat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
  }
  return sharedPlateMat;
}

export type RigDetail = 'FULL' | 'LOW';

/**
 * Epic fix round (P1-12): geometries culled entirely on the LOW tier —
 * facial micro-detail, hair strands/curls, and the small joint spheres.
 * On LOW these parts are excluded from the merge harvest entirely
 * (never built into the merged geometry); LOW also bakes the jersey
 * bands into vertex colours instead of sampling the jersey atlas, and
 * casts no per-mesh shadows (the contact disc remains). The number
 * plates are NOT culled: they sample the shared plate atlas under one
 * shared material, so they cost one mesh on every tier. After the rig
 * merge a FULL rig is 14 meshes and a LOW rig 13 — that, not the old
 * ~52-mesh rig, is what brings a LOW match inside the ≤350 draw-call
 * budget the perf lab measures on the live renderer.
 */
const LOW_CULL_GEOS: ReadonlySet<THREE.BufferGeometry> = new Set([
  GEO.ear, GEO.nose, GEO.eye, GEO.jaw, GEO.collar, GEO.curl, GEO.hairStrand,
  GEO.bootToe, GEO.hand, GEO.elbow,
  GEO.knee, GEO.ankle, GEO.calf, GEO.sleeve, GEO.shortsLeg,
]);

/** Count the meshes a built rig will actually draw (visible only). */
export function countRigDrawMeshes(rig: PlayerRig): number {
  let n = 0;
  rig.group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) n += 1;
  });
  return n;
}

export function buildPlayerRig(
  appearance: FaceAppearance,
  kit: KitColors,
  shirtNumber: number,
  shortName: string,
  detail: RigDetail = 'FULL',
): PlayerRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const heightScale = (appearance.heightCm / 100) / 1.8;
  const buildW = appearance.build === 'LEAN' ? 0.9 : appearance.build === 'STOCKY' ? 1.14 : 1.0;
  body.scale.set(buildW, heightScale, 1);

  const skin = new THREE.MeshStandardMaterial({ color: appearance.skinTone, roughness: 0.55 });
  const skinDark = new THREE.MeshStandardMaterial({ color: '#201612', roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: appearance.hairColor, roughness: 0.95 });
  const bootMat = new THREE.MeshStandardMaterial({ color: appearance.bootColor, roughness: 0.28, metalness: 0.3 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.85 });
  const socksMat = new THREE.MeshStandardMaterial({ color: kit.socks, roughness: 0.9 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: kit.primary, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: kit.secondary, roughness: 0.8 });
  // The chest and the number plates are built with a placeholder material
  // and re-skinned by the merge pass below: the chest samples the shared
  // jersey atlas (FULL) or bakes the kit bands into vertex colours (LOW),
  // and the plates merge under the shared plate atlas material.
  const placeholderMat = vertexColorMaterial();

  // Contact shadow disc (grounding, also the LOW-quality shadow) — one
  // shared texture + material for every rig.
  const shadowDisc = new THREE.Mesh(GEO.shadow, shadowDiscMaterial());
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  shadowDisc.renderOrder = 2;
  group.add(shadowDisc);

  // --- Pelvis: rounded hips in shorts --------------------------------------
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.96;
  body.add(pelvis);
  const hips = mesh(GEO.hips, shortsMat, 0, -0.03, 0);
  hips.scale.set(1.04, 0.64, 0.76);
  pelvis.add(hips);

  // --- Torso: oval capsule chest in the jersey ------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  pelvis.add(torso);
  const chestMesh = mesh(GEO.torso, placeholderMat, 0, 0.37, 0);
  chestMesh.scale.set(1.06 * (appearance.muscle ?? 1) * (appearance.shoulderWidth ?? 1), 1, 0.7);
  torso.add(chestMesh);
  const shoulderW = appearance.shoulderWidth ?? 1;
  torso.add(mesh(GEO.shoulder, sleeveMat, -0.235 * shoulderW, 0.6, 0));
  torso.add(mesh(GEO.shoulder, sleeveMat, 0.235 * shoulderW, 0.6, 0));
  const collar = mesh(GEO.collar, trimMat, 0, 0.665, 0);
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);
  // Shirt number plates (front small, back name + big number) — merged
  // into one mesh by the merge pass; placeholder material until then.
  const frontPlate = new THREE.Mesh(GEO.numberFront, placeholderMat);
  frontPlate.position.set(0, 0.38, 0.154);
  torso.add(frontPlate);
  const backPlate = new THREE.Mesh(GEO.numberBack, placeholderMat);
  backPlate.position.set(0, 0.4, -0.154);
  backPlate.rotation.y = Math.PI;
  torso.add(backPlate);

  // --- Head: sphere skull, jaw, ears, nose, eyes, styled hair ----------------
  // Epic P0-4: the skull / jaw / nose / eyes are DRIVEN by the player's
  // FaceAppearance morphs (they were hard-coded before, so every face was
  // the same face). Beard, brows, mouth and cheekbones add at most six
  // small meshes, only when the player's appearance asks for them.
  const fw = appearance.faceWidth ?? 1;
  const jw = appearance.jawWidth ?? 1;
  const jl = appearance.jawLength ?? 1;
  const fh = appearance.foreheadHeight ?? 1;
  const cheek = appearance.cheekbone ?? 1;
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  head.add(mesh(GEO.neck, skin, 0, 0.03, 0));
  const skull = mesh(GEO.skull, skin, 0, 0.235, 0);
  skull.scale.set(0.94 * fw, 1.12 * (0.7 + 0.3 * fh) * (0.85 + 0.15 * jl), 0.98);
  head.add(skull);
  const jaw = mesh(GEO.jaw, skin, 0, 0.163, 0.014);
  jaw.scale.set(0.88 * jw, 0.78 * jl, 0.9);
  head.add(jaw);
  head.add(mesh(GEO.ear, skin, -0.117 * fw, 0.235, 0));
  head.add(mesh(GEO.ear, skin, 0.117 * fw, 0.235, 0));
  const nose = mesh(GEO.nose, skin, 0, 0.212, 0.122);
  nose.scale.set(appearance.noseWidth ?? 1, appearance.noseLength ?? 1, appearance.noseLength ?? 1);
  head.add(nose);
  const eyeSpacing = appearance.eyeSpacing ?? 1;
  const eyeSize = appearance.eyeSize ?? 1;
  const eyeL = mesh(GEO.eye, skinDark, -0.047 * eyeSpacing * fw, 0.256, 0.113);
  eyeL.scale.setScalar(eyeSize);
  eyeL.castShadow = false;
  const eyeR = mesh(GEO.eye, skinDark, 0.047 * eyeSpacing * fw, 0.256, 0.113);
  eyeR.scale.setScalar(eyeSize);
  eyeR.castShadow = false;
  head.add(eyeL, eyeR);
  // Eyebrows: small flattened capsules above the eyes.
  const browMat = new THREE.MeshStandardMaterial({ color: appearance.beardColor ?? appearance.hairColor, roughness: 1 });
  const browThick = appearance.browStyle === 'THICK' ? 1.5 : appearance.browStyle === 'ARCHED' ? 0.85 : 1;
  const browGeo = new THREE.SphereGeometry(0.026, 8, 6);
  const browL = new THREE.Mesh(browGeo, browMat);
  browL.position.set(-0.047 * eyeSpacing * fw, 0.283, 0.112);
  browL.scale.set(1.25, 0.32 * browThick, 0.4);
  browL.castShadow = false;
  const browR = browL.clone();
  browR.position.x = -browL.position.x;
  head.add(browL, browR);
  // Mouth: a thin dark arc.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skinDark);
  mouth.position.set(0, 0.148, 0.104);
  mouth.scale.set(appearance.mouthStyle === 'WIDE' ? 1.5 : appearance.mouthStyle === 'SMALL' ? 0.7 : 1.05, 0.3, 0.35);
  mouth.castShadow = false;
  head.add(mouth);
  // Cheekbones: subtle flattened patches that catch the floodlights.
  if (cheek > 1.02) {
    const cheekGeo = new THREE.SphereGeometry(0.032, 8, 6);
    const cheekL = new THREE.Mesh(cheekGeo, skin);
    cheekL.position.set(-0.072 * fw, 0.205, 0.088);
    cheekL.scale.set(1, 0.8, 0.5 * cheek);
    cheekL.castShadow = false;
    const cheekR = cheekL.clone();
    cheekR.position.x = -cheekL.position.x;
    head.add(cheekL, cheekR);
  }
  // Beard: a flattened sphere shell over the jaw (FULL covers cheeks too),
  // a chin patch for GOATEE, a thin strip for MOUSTACHE.
  const beardStyle = appearance.beardStyle ?? 'NONE';
  if (beardStyle !== 'NONE') {
    const beardMat = new THREE.MeshStandardMaterial({ color: appearance.beardColor ?? appearance.hairColor, roughness: 1 });
    if (beardStyle === 'MOUSTACHE') {
      const mo = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), beardMat);
      mo.position.set(0, 0.168, 0.108);
      mo.scale.set(1.5, 0.35, 0.4);
      mo.castShadow = false;
      head.add(mo);
    } else if (beardStyle === 'GOATEE') {
      const g = mesh(GEO.jaw, beardMat, 0, 0.128, 0.03);
      g.scale.set(0.42, 0.4, 0.5);
      g.castShadow = false;
      head.add(g);
    } else {
      const full = beardStyle === 'FULL';
      const b = mesh(GEO.jaw, beardMat, 0, full ? 0.158 : 0.148, 0.02);
      b.scale.set(0.9 * jw * (full ? 1.04 : 0.96), full ? 0.86 : 0.6, 0.92);
      b.castShadow = false;
      head.add(b);
    }
  }
  // Headband accessory.
  if (appearance.headband) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.128, 0.016, 8, 24),
      new THREE.MeshStandardMaterial({ color: kit.secondary, roughness: 0.9 }),
    );
    band.position.set(0, 0.285, 0);
    band.rotation.x = Math.PI / 2 - 0.18;
    band.scale.set(fw, 1, 1);
    band.castShadow = false;
    head.add(band);
  }
  const hairStyle = appearance.hairStyle;
  if (hairStyle === 'SHORT') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0, 0.243, -0.006);
    cap.scale.set(0.97, 1.1, 1.0);
    head.add(cap);
  } else if (hairStyle === 'FADE') {
    const cap = mesh(GEO.hairCapFade, hairMat, 0, 0.248, -0.004);
    cap.scale.set(0.97, 1.08, 1.0);
    head.add(cap);
  } else if (hairStyle === 'CURLY') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0, 0.25, -0.006);
    cap.scale.set(0.99, 1.12, 1.02);
    head.add(cap);
    const curlAt: [number, number, number][] = [
      [-0.085, 0.345, 0.03], [0, 0.365, 0.045], [0.085, 0.345, 0.03],
      [-0.1, 0.315, -0.055], [0.1, 0.315, -0.055], [0, 0.35, -0.085],
    ];
    for (const [x, y, z] of curlAt) head.add(mesh(GEO.curl, hairMat, x, y, z));
  } else if (hairStyle === 'AFRO') {
    const puff = mesh(GEO.afro, hairMat, 0, 0.315, -0.008);
    puff.scale.y = 0.92;
    head.add(puff);
  } else if (hairStyle === 'LONG') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0, 0.245, -0.006);
    cap.scale.set(0.98, 1.11, 1.01);
    head.add(cap);
    head.add(mesh(GEO.hairBack, hairMat, 0, 0.1, -0.108));
    head.add(mesh(GEO.hairStrand, hairMat, -0.118, 0.13, -0.01));
    head.add(mesh(GEO.hairStrand, hairMat, 0.118, 0.13, -0.01));
  } else if (hairStyle === 'MOHAWK') {
    const crest = mesh(GEO.mohawk, hairMat, 0, 0.375, -0.005);
    crest.rotation.x = Math.PI / 2;
    crest.scale.set(0.75, 1, 1.2);
    head.add(crest);
  } else if (hairStyle === 'BUZZ' || hairStyle === 'BALD_FADE') {
    // Very short crop: a thin fade shell hugging the skull.
    const cap = mesh(GEO.hairCapFade, hairMat, 0, 0.246, -0.004);
    cap.scale.set(0.96, 1.02, 0.99);
    head.add(cap);
  } else if (hairStyle === 'SIDEPART') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0.008, 0.245, -0.006);
    cap.scale.set(0.97, 1.09, 1.0);
    head.add(cap);
  } else if (hairStyle === 'FRINGE') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0, 0.243, -0.002);
    cap.scale.set(0.97, 1.1, 1.0);
    head.add(cap);
    const fringe = mesh(GEO.curl, hairMat, 0, 0.315, 0.105);
    fringe.scale.set(2.1, 0.55, 0.8);
    head.add(fringe);
  } else if (hairStyle === 'CURLY_TOP') {
    const cap = mesh(GEO.hairCapFade, hairMat, 0, 0.248, -0.004);
    cap.scale.set(0.97, 1.06, 1.0);
    head.add(cap);
    const curlAt: [number, number, number][] = [
      [-0.07, 0.355, 0.05], [0.02, 0.375, 0.06], [0.08, 0.35, 0.02],
      [-0.03, 0.36, -0.05], [0.06, 0.345, -0.07],
    ];
    for (const [x, y, z] of curlAt) head.add(mesh(GEO.curl, hairMat, x, y, z));
  } else if (hairStyle === 'TOPKNOT') {
    const cap = mesh(GEO.hairCapFade, hairMat, 0, 0.247, -0.004);
    cap.scale.set(0.97, 1.07, 1.0);
    head.add(cap);
    const knot = mesh(GEO.curl, hairMat, 0, 0.385, -0.03);
    knot.scale.set(0.85, 0.8, 0.85);
    head.add(knot);
  } else if (hairStyle === 'DREADLOCKS' || hairStyle === 'BRAIDS') {
    const cap = mesh(GEO.hairCapShort, hairMat, 0, 0.246, -0.006);
    cap.scale.set(0.98, 1.1, 1.01);
    head.add(cap);
    // Rows of strands falling at the sides and back.
    const strandAt: [number, number, number][] = [
      [-0.125, 0.16, 0.03], [0.125, 0.16, 0.03],
      [-0.12, 0.15, -0.06], [0.12, 0.15, -0.06],
      [-0.07, 0.13, -0.105], [0.07, 0.13, -0.105], [0, 0.12, -0.115],
    ];
    for (const [x, y, z] of strandAt) head.add(mesh(GEO.hairStrand, hairMat, x, y, z));
  } // BALD: no hair mesh.

  // --- Arms: ball shoulders, capsule sleeve + arm, sphere hands -------------
  const tattooMat = new THREE.MeshStandardMaterial({ color: '#3f4a5a', roughness: 0.7 });
  const makeArm = (sideSign: number): { arm: THREE.Group; fore: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set(sideSign * 0.27 * shoulderW, 0.615, 0);
    torso.add(arm);
    arm.add(mesh(GEO.armJoint, sleeveMat, 0, 0, 0));
    arm.add(mesh(GEO.sleeve, sleeveMat, 0, -0.08, 0)); // short kit sleeve
    arm.add(mesh(GEO.upperArm, skin, 0, -0.185, 0));
    const fore = new THREE.Group();
    fore.position.y = -0.315;
    arm.add(fore);
    fore.add(mesh(GEO.elbow, skin, 0, 0, 0));
    // Epic P0-4: sleeve tattoo on the right forearm when the player has one.
    const foreMat = sideSign > 0 && appearance.sleeveTattoo ? tattooMat : skin;
    fore.add(mesh(GEO.forearm, foreMat, 0, -0.115, 0));
    const hand = mesh(GEO.hand, skin, 0, -0.265, 0.004);
    hand.scale.set(0.85, 1.25, 0.95);
    fore.add(hand);
    return { arm, fore };
  };
  const left = makeArm(-1);
  const right = makeArm(1);

  // --- Legs: shorts thigh, skin thigh, socked shin with calf, rounded boot ---
  const makeLeg = (sideSign: number): { leg: THREE.Group; shin: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.set(sideSign * 0.115, -0.07, 0);
    pelvis.add(leg);
    leg.add(mesh(GEO.hipJoint, shortsMat, 0, -0.02, 0));
    leg.add(mesh(GEO.shortsLeg, shortsMat, 0, -0.1, 0)); // shorts cover the upper thigh
    leg.add(mesh(GEO.thigh, skin, 0, -0.245, 0));
    const shin = new THREE.Group();
    shin.position.y = -0.44;
    leg.add(shin);
    shin.add(mesh(GEO.knee, skin, 0, 0, 0));
    const calf = mesh(GEO.calf, socksMat, 0, -0.1, -0.014);
    calf.scale.set(0.95, 1.35, 0.95);
    shin.add(calf);
    shin.add(mesh(GEO.shin, socksMat, 0, -0.165, 0));
    shin.add(mesh(GEO.ankle, socksMat, 0, -0.315, 0));
    const boot = new THREE.Group();
    boot.position.y = -0.375;
    shin.add(boot);
    const bootBody = mesh(GEO.bootBody, bootMat, 0, -0.012, 0.045);
    bootBody.rotation.x = Math.PI / 2;
    bootBody.scale.set(0.92, 1, 0.78);
    boot.add(bootBody);
    const toe = mesh(GEO.bootToe, bootMat, 0, -0.02, 0.128);
    toe.scale.set(0.9, 0.68, 1.25);
    boot.add(toe);
    return { leg, shin };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // --- Rig merge ---------------------------------------------------------
  // Bake every joint group's parts into ONE mesh per joint (see header).
  // Transforms are captured from the fully assembled rig, so each part
  // lands exactly where the unmerged rig drew it; the joint groups keep
  // their pivots and the animator drives them unchanged. On LOW the
  // micro-detail geometries never enter the harvest, the chest pattern
  // is baked into vertex colours, and nothing casts per-mesh shadows
  // (the contact disc stays as the grounding shadow).
  group.updateMatrixWorld(true);
  const jointGroups: THREE.Group[] = [
    pelvis, torso, head,
    left.arm, left.fore, right.arm, right.fore,
    legL.leg, legL.shin, legR.leg, legR.shin,
  ];
  const jointSet = new Set<THREE.Object3D>(jointGroups);
  const kitPrimary = new THREE.Color(kit.primary);
  const kitSecondary = new THREE.Color(kit.secondary);

  /** Clone a part's geometry into joint-local space with a baked
   *  per-vertex `color` attribute (the part's material colour, or the
   *  jersey band pattern when `jerseyBands` is set for the LOW chest). */
  const bakePart = (
    src: THREE.BufferGeometry,
    rel: THREE.Matrix4,
    jerseyBands: boolean,
    color: THREE.Color,
  ): THREE.BufferGeometry => {
    const geo = src.clone();
    geo.applyMatrix4(rel);
    const uv = geo.getAttribute('uv');
    const count = geo.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // Jersey bands: the atlas art's collar (canvas rows 0–26) and hem
      // (rows 232–256) bands sample at v > 0.898 / v < 0.094 (flipY).
      const c = jerseyBands && uv && (uv.getY(i) > 0.898 || uv.getY(i) < 0.094) ? kitSecondary : color;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.deleteAttribute('uv');
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  };

  for (const joint of jointGroups) {
    const jointInv = joint.matrixWorld.clone().invert();
    const vcParts: THREE.BufferGeometry[] = [];
    let jerseySrc: { geo: THREE.BufferGeometry; rel: THREE.Matrix4 } | null = null;
    const plateSrc: { geo: THREE.BufferGeometry; rel: THREE.Matrix4; front: boolean }[] = [];
    const harvested: THREE.Mesh[] = [];
    const subGroups: THREE.Group[] = [];
    const collect = (obj: THREE.Object3D): void => {
      for (const child of [...obj.children]) {
        if (child instanceof THREE.Mesh) harvested.push(child);
        else if (child instanceof THREE.Group && !jointSet.has(child)) {
          subGroups.push(child);
          collect(child);
        }
      }
    };
    collect(joint);
    for (const part of harvested) {
      const rel = new THREE.Matrix4().multiplyMatrices(jointInv, part.matrixWorld);
      if (part === chestMesh) {
        if (detail === 'LOW') vcParts.push(bakePart(part.geometry, rel, true, kitPrimary));
        else jerseySrc = { geo: part.geometry, rel };
      } else if (part === frontPlate || part === backPlate) {
        // Plates ride the shared plate atlas on BOTH tiers — one shared
        // material makes them cheap enough for LOW, and a match player
        // without a shirt number reads as unfinished.
        plateSrc.push({ geo: part.geometry, rel, front: part === frontPlate });
      } else if (detail === 'LOW' && LOW_CULL_GEOS.has(part.geometry)) {
        // Culled on LOW — never enters the merged geometry.
      } else {
        const mat = Array.isArray(part.material) ? part.material[0] : part.material;
        const color = (mat as THREE.MeshStandardMaterial | undefined)?.color ?? new THREE.Color('#ffffff');
        vcParts.push(bakePart(part.geometry, rel, false, color));
      }
      part.removeFromParent();
    }
    // Non-joint helper groups (the boot cluster) are empty once their
    // meshes are harvested — drop them so no stray nodes remain.
    for (const g of subGroups) if (g.children.length === 0) g.removeFromParent();
    if (vcParts.length > 0) {
      const merged = mergeGeometries(vcParts, false);
      if (merged) {
        const m = new THREE.Mesh(merged, vertexColorMaterial());
        m.castShadow = detail === 'FULL';
        joint.add(m);
      }
    }
    if (jerseySrc) {
      const geo = jerseySrc.geo.clone();
      geo.applyMatrix4(jerseySrc.rel);
      const rect = jerseyAtlasRect(kit);
      let mat: THREE.MeshStandardMaterial;
      if (rect) {
        const uv = geo.getAttribute('uv');
        if (uv) {
          for (let i = 0; i < uv.count; i += 1) {
            uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
          }
        }
        mat = jerseyMaterial();
      } else {
        mat = fallbackJerseyMaterial(kit);
      }
      const chest = new THREE.Mesh(geo, mat);
      chest.castShadow = true;
      joint.add(chest);
    }
    if (plateSrc.length > 0) {
      // Sample this player's tile of the shared plate atlas: the back
      // art occupies the tile's left half, the front art its right half.
      const rect = plateAtlasRect(shirtNumber, shortName);
      const geos = plateSrc.map((p) => {
        const geo = p.geo.clone();
        geo.applyMatrix4(p.rel);
        const uv = geo.getAttribute('uv');
        if (uv) {
          for (let i = 0; i < uv.count; i += 1) {
            const halfX = (p.front ? 0.5 : 0) + uv.getX(i) * 0.5;
            uv.setXY(i, rect.u0 + halfX * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
          }
        }
        return geo;
      });
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const plates = new THREE.Mesh(merged, plateMaterial());
        joint.add(plates);
      }
    }
  }

  return {
    group,
    joints: {
      pelvis, torso, head,
      armL: left.arm, foreL: left.fore, armR: right.arm, foreR: right.fore,
      legL: legL.leg, shinL: legL.shin, legR: legR.leg, shinR: legR.shin,
      body,
    },
    setShadowVisible: (v: boolean) => { shadowDisc.visible = v; },
  };
}
