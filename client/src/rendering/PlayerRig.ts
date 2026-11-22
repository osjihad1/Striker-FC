// Striker FC — rendering/PlayerRig.ts
// Realistic humanoid rig (player-models spec pass): the players are built
// from sculpted shared primitives at 180 cm reference proportions — the
// skull is flattened at the back with a widened cheek zone, the torso
// capsule tapers chest → waist → hip, thighs / calves / biceps carry
// analytic muscle bulges — plus a shared FACE ATLAS (2048×2048 canvas,
// 8×8 tiles of 256², same LRU discipline as the plate atlas) whose tiles
// paint skin gradient, sclera / iris / pupil, nose shading, two lips,
// stubble and the hairline onto the head, and a lathe-profile boot with
// sole / studs / laces. Kit patterns (stripes, hoops, sash, halves, chest
// band), collar styles and a sponsor block are drawn into the shared
// jersey atlas; on LOW the same patterns bake into vertex colours.
// Everything stays procedural and bundled — no model files, no textures
// fetched at runtime, the APK stays offline.
//
// Joint pivots are unchanged from the original rig (pelvis 0.96, torso
// +0.06, head +0.72, fore −0.315, shin −0.44) so PlayerAnimator poses land
// exactly where they always have; the only joint addition is footL/footR
// under the shins (spec §1.7), carrying the boot cluster with an identical
// world transform. Parts are still constructed mesh by mesh, then MERGED
// per joint group with BufferGeometryUtils.mergeGeometries: vertex-colour
// parts under one shared material, the chest under the jersey atlas, the
// plates under the plate atlas, and the whole head under the face atlas —
// so a LOW rig stays 13 meshes and a FULL rig 17 (the +2 over the old 14
// are the two foot joints; on LOW the boot stays merged in the shin so
// the ≤350 draw-call budget is untouched).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CollarStyle, FaceAppearance, KitPattern } from '../core/types';
import { mulberry32 } from '../core/math';

export type KitKind = 'HOME' | 'AWAY' | 'HOME_GK' | 'AWAY_GK';

export interface KitColors {
  primary: string; secondary: string; shorts: string; socks: string;
  /** Shirt pattern drawn into the jersey atlas (spec §1.6). Default SOLID. */
  pattern?: KitPattern;
  collarStyle?: CollarStyle;
  /** Sleeve colour override (e.g. Arsenal's white sleeves). Default primary. */
  sleeveColor?: string;
  /** Club abbreviation for the generic sponsor block. */
  abbr?: string;
}

export function kitFor(kind: KitKind, home: KitColors, away: KitColors): KitColors {
  switch (kind) {
    case 'HOME': return home;
    case 'AWAY': return away;
    case 'HOME_GK': return { primary: '#a3e635', secondary: '#111827', shorts: '#111827', socks: '#a3e635', pattern: 'CHEST_BAND' };
    case 'AWAY_GK': return { primary: '#fb923c', secondary: '#111827', shorts: '#1f2937', socks: '#fb923c', pattern: 'CHEST_BAND' };
  }
}

export interface RigJoints {
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; foreL: THREE.Group;
  armR: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; shinL: THREE.Group; footL: THREE.Group;
  legR: THREE.Group; shinR: THREE.Group; footR: THREE.Group;
  body: THREE.Group;
}

export interface PlayerRig {
  group: THREE.Group;
  joints: RigJoints;
  setShadowVisible: (v: boolean) => void;
}

export type RigDetail = 'FULL' | 'LOW' | 'HERO' | 'DISTANT';

// --- Sculpting helper (spec §1.2a) ------------------------------------------
// Every shared geometry is vertex-deformed ONCE at module load: the same
// sphere / capsule primitives, pushed into human silhouettes analytically.
function sculpt(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const [nx, ny, nz] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, nx, ny, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// --- Shared smooth geometries (high segment counts = soft silhouettes) ----
const GEO = {
  hips: new THREE.SphereGeometry(0.21, 24, 18),
  // Torso capsule → torso: per-vertex taper 1.00 chest (local y +0.08) →
  // 0.86 waist (−0.22) → 0.98 hip (−0.365), shoulders sloping to 0.88 at
  // the top, plus a 0.02 m pectoral push on the front.
  torso: sculpt(new THREE.CapsuleGeometry(0.215, 0.3, 8, 24), (x, y, z) => {
    let taper: number;
    if (y >= 0.08) taper = lerp(1.0, 0.88, clamp01((y - 0.08) / 0.285));
    else if (y >= -0.22) taper = lerp(0.86, 1.0, clamp01((y + 0.22) / 0.3));
    else taper = lerp(0.98, 0.86, clamp01((y + 0.365) / 0.145));
    const chestPush = z > 0 ? 0.02 * Math.exp(-(((y - 0.08) / 0.09) ** 2)) : 0;
    return [x * taper, y, z * taper + chestPush];
  }),
  shoulder: new THREE.SphereGeometry(0.086, 18, 14),
  collar: new THREE.TorusGeometry(0.088, 0.021, 10, 24),
  neck: new THREE.CylinderGeometry(0.05, 0.058, 0.13, 14),
  trapezius: new THREE.SphereGeometry(0.11, 14, 10),
  // Skull → head: flatten the back (−z ×0.92), widen the cheek zone ×1.04.
  skull: sculpt(new THREE.SphereGeometry(0.128, 26, 20), (x, y, z) => {
    const back = z < 0 ? z * 0.92 : z;
    const cheek = z > 0.02 && Math.abs(y) < 0.035 ? x * 1.04 : x;
    return [cheek, y, back];
  }),
  jaw: new THREE.SphereGeometry(0.096, 20, 14),
  chin: new THREE.SphereGeometry(0.035, 10, 8),
  ear: new THREE.SphereGeometry(0.028, 10, 8),
  eye: new THREE.SphereGeometry(0.0115, 8, 6),
  browRidge: new THREE.CapsuleGeometry(0.018, 0.075, 4, 8),
  eyelid: new THREE.SphereGeometry(0.016, 10, 8),
  noseBridge: new THREE.CapsuleGeometry(0.016, 0.055, 4, 8),
  noseTip: new THREE.SphereGeometry(0.02, 10, 8),
  lip: new THREE.SphereGeometry(0.02, 10, 8),
  brow: new THREE.SphereGeometry(0.026, 8, 6),
  cheek: new THREE.SphereGeometry(0.032, 8, 6),
  hairCapShort: new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, 1.72),
  hairCapFade: new THREE.SphereGeometry(0.133, 24, 16, 0, Math.PI * 2, 0, 1.38),
  curl: new THREE.SphereGeometry(0.046, 12, 10),
  afroSat: new THREE.SphereGeometry(0.055, 8, 6),
  afro: new THREE.SphereGeometry(0.176, 22, 16),
  hairBack: new THREE.CapsuleGeometry(0.078, 0.2, 6, 14),
  hairStrand: new THREE.CapsuleGeometry(0.026, 0.16, 4, 10),
  lockLower: new THREE.CapsuleGeometry(0.022, 0.13, 4, 8),
  mohawk: new THREE.CapsuleGeometry(0.034, 0.19, 6, 12),
  sideburn: new THREE.CapsuleGeometry(0.012, 0.05, 4, 8),
  hairSideShell: new THREE.SphereGeometry(0.06, 10, 8),
  shavedSide: new THREE.SphereGeometry(0.115, 12, 10),
  knotTie: new THREE.TorusGeometry(0.028, 0.006, 6, 14),
  armJoint: new THREE.SphereGeometry(0.07, 16, 12),
  sleeve: new THREE.CapsuleGeometry(0.069, 0.085, 6, 16),
  sleeveLong: new THREE.CapsuleGeometry(0.066, 0.19, 6, 16),
  // Upper arm: biceps bulge at ~55% down (local +y is toward the shoulder).
  upperArm: sculpt(new THREE.CapsuleGeometry(0.054, 0.125, 6, 16), (x, y, z) => {
    const t = clamp01((0.1165 - y) / 0.233);
    const b = Math.sin(Math.PI * t) * 0.13;
    return [x * (1 + b), y, z * (1 + b * 0.8)];
  }),
  elbow: new THREE.SphereGeometry(0.05, 14, 10),
  // Forearm: gentle taper toward the wrist.
  forearm: sculpt(new THREE.CapsuleGeometry(0.047, 0.135, 6, 16), (x, y, z) => {
    const t = clamp01((0.1145 - y) / 0.229);
    const s = 1 - 0.1 * t;
    return [x * s, y, z * s];
  }),
  hand: new THREE.SphereGeometry(0.052, 14, 12),
  fingers: new THREE.CapsuleGeometry(0.016, 0.07, 4, 8),
  finger: new THREE.CapsuleGeometry(0.0085, 0.055, 4, 6),
  thumb: new THREE.CapsuleGeometry(0.012, 0.04, 4, 8),
  hipJoint: new THREE.SphereGeometry(0.086, 16, 12),
  shortsLeg: new THREE.CapsuleGeometry(0.089, 0.1, 6, 16),
  shortsStripe: new THREE.CapsuleGeometry(0.014, 0.09, 4, 6),
  drawstring: new THREE.CapsuleGeometry(0.006, 0.03, 4, 6),
  // Thigh: quadriceps bulge, front-biased, peaking 60% down.
  thigh: sculpt(new THREE.CapsuleGeometry(0.072, 0.155, 6, 16), (x, y, z) => {
    const t = clamp01((0.1495 - y) / 0.299);
    const b = Math.sin(Math.PI * t);
    return [x * (1 + 0.1 * b), y, z * (1 + (z > 0 ? 0.18 : 0.05) * b)];
  }),
  knee: new THREE.SphereGeometry(0.06, 14, 12),
  calf: new THREE.SphereGeometry(0.068, 14, 12),
  // Shin: calf bulge 30% below the knee, back-biased.
  shin: sculpt(new THREE.CapsuleGeometry(0.056, 0.165, 6, 16), (x, y, z) => {
    const t = clamp01((0.1385 - y) / 0.277);
    const g = Math.exp(-(((t - 0.3) / 0.16) ** 2));
    return [x * (1 + 0.08 * g), y, z * (1 + (z < 0 ? 0.2 : 0.03) * g)];
  }),
  ankle: new THREE.SphereGeometry(0.042, 12, 10),
  // Boot (spec §1.6): a 10-point lathe profile — heel, ankle, collar,
  // instep, vamp, toe taper — revolved 14 segments, laid along +z,
  // flattened at the sole. The profile's axis coordinate is scaled ×4
  // from the spec's normalised profile so the boot is a real 0.25 m foot.
  boot: (() => {
    const profile: [number, number][] = [
      [0.001, 0], [0.045, 0.004], [0.048, 0.03], [0.046, 0.075], [0.043, 0.13],
      [0.04, 0.18], [0.034, 0.215], [0.024, 0.235], [0.01, 0.245], [0.001, 0.248],
    ];
    const geo = new THREE.LatheGeometry(profile.map(([px, py]) => new THREE.Vector2(px, py)), 14);
    geo.rotateX(Math.PI / 2); // lathe axis +Y → +Z (toe forward)
    geo.scale(0.92, 0.95, 1); // 0.088 wide, ankle-height top
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getY(i) < -0.038) pos.setY(i, -0.038); // flat sole
    }
    geo.translate(0, 0, -0.055); // heel −0.055, toe +0.193 around the ankle
    geo.computeVertexNormals();
    return geo;
  })(),
  bootSole: (() => {
    const geo = new THREE.CapsuleGeometry(0.046, 0.16, 4, 10);
    geo.rotateX(Math.PI / 2);
    geo.scale(0.98, 0.19, 1.02);
    return geo;
  })(),
  stud: new THREE.CylinderGeometry(0.008, 0.006, 0.012, 6),
  lace: new THREE.TorusGeometry(0.02, 0.003, 6, 14),
  bootCollar: new THREE.TorusGeometry(0.045, 0.008, 8, 18),
  sockCuff: new THREE.TorusGeometry(0.058, 0.012, 8, 18),
  sockStripe: new THREE.TorusGeometry(0.057, 0.005, 6, 18),
  numberFront: new THREE.PlaneGeometry(0.15, 0.15),
  numberBack: new THREE.PlaneGeometry(0.27, 0.27),
  shortsNumber: new THREE.PlaneGeometry(0.06, 0.06),
  shadow: new THREE.CircleGeometry(0.42, 24),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Tag a head part with the face-atlas UV treatment it needs at merge time. */
type FaceUvMode = 'skull' | 'skin' | 'skinDark' | 'hairGrad' | 'beard' | 'dark' | 'lip' | 'trim';
function facePart(m: THREE.Mesh, mode: FaceUvMode): THREE.Mesh {
  m.userData.faceUv = mode;
  return m;
}

// --- Colour helpers ---------------------------------------------------------
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeHex(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function hexLuminance(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// --- Jersey art (spec §1.6) ---------------------------------------------------
// 256×256 tile drawn into the shared atlas. The chest capsule's front
// (+z) sits at u=0 of the lathe UVs; the merge pass shifts chest UVs by
// +0.5 so the FRONT of the shirt is the tile's centre column (x=128) —
// patterns, the sponsor block and the V-neck are all painted around it.
function drawJerseyArt(g: CanvasRenderingContext2D, kit: KitColors): void {
  const pattern = kit.pattern ?? 'SOLID';
  const collar = kit.collarStyle ?? 'CREW';
  g.fillStyle = kit.primary;
  g.fillRect(0, 0, 256, 256);
  if (pattern === 'STRIPES_VERTICAL') {
    g.fillStyle = kit.secondary;
    const w = 256 / 6;
    for (let i = 0; i < 6; i += 2) g.fillRect(Math.round(i * w), 0, Math.ceil(w), 256);
  } else if (pattern === 'HOOPS' || pattern === 'STRIPES_HORIZONTAL') {
    g.fillStyle = kit.secondary;
    const bands = pattern === 'HOOPS' ? 8 : 12;
    const h = 256 / bands;
    for (let i = 0; i < bands; i += 2) g.fillRect(0, Math.round(i * h), 256, Math.ceil(h));
  } else if (pattern === 'SASH') {
    g.save();
    g.translate(128, 128);
    g.rotate(-0.61); // 35° diagonal, left shoulder → right hip
    g.fillStyle = kit.secondary;
    g.fillRect(-220, -28, 440, 56);
    g.restore();
  } else if (pattern === 'HALVES') {
    g.fillStyle = kit.secondary;
    g.fillRect(128, 0, 128, 256);
  } else if (pattern === 'CHEST_BAND') {
    g.fillStyle = kit.secondary;
    g.fillRect(0, 52, 256, 64); // band centred at v ≈ 30% from the collar
  }
  // Round shading: centre lighter, sides darker, so the capsule reads round.
  const shade = g.createLinearGradient(0, 0, 256, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.07)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.07)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 256, 256);
  if (pattern === 'SOLID') {
    // Subtle woven pinstripes (kept from the original art, SOLID only —
    // on a patterned shirt they would double the motif).
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 7, 256);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 16; x < 256; x += 32) g.fillRect(x, 0, 7, 256);
  }
  // Sleeve cuff band at the shoulder latitude (v ≈ 12%).
  g.fillStyle = kit.secondary;
  g.fillRect(0, 30, 256, 18);
  // Sponsor block: a generic centred panel with the club abbreviation —
  // never a real sponsor logo. Only when the kit carries an abbreviation.
  if (kit.abbr) {
    const light = hexLuminance(kit.primary) > 0.6;
    g.fillStyle = light ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)';
    g.fillRect(80, 104, 96, 28);
    g.fillStyle = light ? '#f8fafc' : '#111827';
    g.font = '700 17px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(kit.abbr, 128, 119);
    g.textBaseline = 'alphabetic';
  }
  // Collar (drawn last so it sits over the pattern).
  g.fillStyle = kit.secondary;
  g.fillRect(0, 0, 256, 26);
  if (collar === 'V_NECK') {
    g.beginPath();
    g.moveTo(83, 0); g.lineTo(173, 0); g.lineTo(128, 42); g.closePath();
    g.fill();
    g.fillStyle = kit.primary;
    g.beginPath();
    g.moveTo(97, 0); g.lineTo(159, 0); g.lineTo(128, 29); g.closePath();
    g.fill();
  } else if (collar === 'POLO') {
    g.fillRect(123, 26, 10, 44); // placket
    g.fillStyle = '#f8fafc';
    g.beginPath(); g.arc(128, 40, 3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(128, 58, 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = kit.secondary;
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

/** The kit pattern as a per-vertex colour for the LOW / DISTANT chest,
 *  which bakes the shirt into vertex colours instead of sampling the
 *  atlas. (u, v) are the chest capsule's raw lathe UVs. */
function kitPatternColor(kit: KitColors, u: number, v: number, primary: THREE.Color, secondary: THREE.Color): THREE.Color {
  switch (kit.pattern ?? 'SOLID') {
    case 'STRIPES_VERTICAL': return Math.floor(u * 6) % 2 === 0 ? primary : secondary;
    case 'HOOPS': return Math.floor(v * 8) % 2 === 0 ? primary : secondary;
    case 'STRIPES_HORIZONTAL': return Math.floor(v * 12) % 2 === 0 ? primary : secondary;
    case 'SASH': {
      const d = (u + v * 0.6) % 1;
      return d > 0.42 && d < 0.64 ? secondary : primary;
    }
    case 'HALVES': return u < 0.5 ? primary : secondary;
    case 'CHEST_BAND': return v > 0.62 && v < 0.78 ? secondary : primary;
    default: return v > 0.898 || v < 0.094 ? secondary : primary; // collar / hem bands
  }
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

function kitAtlasKey(kit: KitColors): string {
  return `${kit.primary}|${kit.secondary}|${kit.pattern ?? 'SOLID'}|${kit.collarStyle ?? 'CREW'}|${kit.abbr ?? ''}`;
}

/** UV rect of the kit's atlas tile, drawing the art on first use. */
function jerseyAtlasRect(kit: KitColors): UvRect | null {
  const key = kitAtlasKey(kit);
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
  const key = kitAtlasKey(kit);
  let mat = fallbackJerseyMats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ map: jerseyTexture(kit), roughness: 0.8 });
    fallbackJerseyMats.set(key, mat);
  }
  return mat;
}

/** One shared material for every merged vertex-coloured part of every
 *  rig: skin-adjacent kit parts, shorts, socks, sleeves, boots — the
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

/** True for the module-level shared materials (atlases, vertex colours,
 *  shadow disc). Scene code that tears a rig down must NOT dispose these
 *  or their maps — every other rig samples the same textures (spec
 *  §4.4.1: the latent dispose bug LOD switching would have exposed). */
export function isSharedRigMaterial(mat: THREE.Material): boolean {
  return mat === sharedVertexMat || mat === sharedJerseyMat || mat === sharedPlateMat
    || mat === sharedFaceMat || mat === sharedShadowMat;
}

/** Plate art (512×256 at the context origin): back art left (surname
 *  over a big number), front art right (the small chest number).
 *  `ink` is the number/name colour — white normally, the kit's secondary
 *  on very light shirts (spec §1.6 luminance fix: white numbers on a
 *  white Real Madrid shirt were unreadable). */
function drawPlatesArt(bg: CanvasRenderingContext2D, number: number, name: string, ink: string): void {
  bg.font = '600 30px "Barlow Condensed", sans-serif';
  bg.textAlign = 'center';
  bg.lineWidth = 5;
  bg.strokeStyle = 'rgba(0,0,0,0.5)';
  bg.fillStyle = ink;
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
// player's name/number plate art; tiles are LRU-managed exactly as
// before (see the rig-merge note in the file header).
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
 *  use (or redrawing an evicted LRU tile). The ink colour is derived
 *  from the shirt: light shirts (luminance > 0.75) print in the kit's
 *  secondary colour instead of white. */
function plateAtlasRect(number: number, name: string, kit: KitColors): UvRect {
  const ink = hexLuminance(kit.primary) > 0.75 ? kit.secondary : '#ffffff';
  const key = `${number}|${name.toUpperCase().slice(0, 14)}|${ink}`;
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
    drawPlatesArt(ctx, number, name, ink);
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

// --- Shared face atlas (NEW, spec §1.2b / §3.5) -------------------------------
// ONE canvas atlas (2048×2048, 8×8 tiles of 256²) holds every distinct
// face; a tile is painted once per (appearance, kit) pair and the whole
// head of a rig merges into ONE mesh sampling its tile — the skull via a
// planar face projection, every other head part via flat colour blocks
// along the tile's bottom strip (skin / shaded skin / hair gradient /
// beard / dark / lip / kit trim). Same LRU discipline as the plate
// atlas; a match fields ≤ 50 live rigs, well under 64 tiles.
const FACE_TILE = 256;
const FACE_COLS = 8;
const FACE_ROWS = 8;
let faceCanvas: HTMLCanvasElement | null = null;
let faceCtx: CanvasRenderingContext2D | null = null;
let faceTexture: THREE.CanvasTexture | null = null;
let sharedFaceMat: THREE.MeshStandardMaterial | null = null;
const faceTiles = new Map<string, number>();
let faceNextTile = 0;

/** Tile-local UV centres of the flat colour blocks (bottom strip). */
const FACE_BLOCK_UV: Record<'skin' | 'skinDark' | 'beard' | 'dark' | 'lip' | 'trim', [number, number]> = {
  skin: [0.5 / 7, 0.125],
  skinDark: [1.5 / 7, 0.125],
  beard: [3.5 / 7, 0.125],
  dark: [4.5 / 7, 0.125],
  lip: [5.5 / 7, 0.125],
  trim: [6.5 / 7, 0.125],
};
const FACE_HAIR_U = 2.5 / 7;

function ensureFaceAtlas(): { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  if (!faceCanvas || !faceCtx || !faceTexture) {
    faceCanvas = document.createElement('canvas');
    faceCanvas.width = FACE_TILE * FACE_COLS;
    faceCanvas.height = FACE_TILE * FACE_ROWS;
    faceCtx = faceCanvas.getContext('2d')!;
    faceTexture = new THREE.CanvasTexture(faceCanvas);
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    faceTexture.anisotropy = 4;
  }
  return { ctx: faceCtx, tex: faceTexture };
}

function faceKey(a: FaceAppearance, kit: KitColors, blank: boolean): string {
  return [
    a.skinTone, a.hairColor, a.beardColor ?? '', a.beardStyle ?? 'NONE',
    a.eyeColor ?? '', a.eyeSpacing ?? 1, a.eyeSize ?? 1, a.mouthStyle ?? '',
    a.hairStyle, a.skinUndertone ?? '', a.lipFullness ?? 1,
    kit.primary, kit.secondary, blank ? 'B' : 'F',
  ].join('|');
}

/** Paint one 256×256 face tile at the context origin. The face occupies
 *  the top 192 rows via the same planar projection the merge pass uses
 *  (head x ∈ [−0.15, 0.15] → tile u, head y ∈ [0.08, 0.38] → tile v);
 *  the bottom 64 rows are the flat colour blocks. `blank` paints the
 *  blocks + plain skin only (DISTANT tier: no features at 25 m+). */
function drawFaceArt(g: CanvasRenderingContext2D, a: FaceAppearance, kit: KitColors, blank: boolean, seed: number): void {
  const skin = a.skinTone;
  const hair = a.hairColor;
  const beardCol = a.beardColor ?? a.hairColor;
  const X = (hx: number): number => (0.5 + hx / 0.3) * 256;
  const Y = (hy: number): number => (1 - (0.25 + ((hy - 0.08) / 0.3) * 0.75)) * 256;
  // Skin base + forehead→chin gradient over the face region.
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, shadeHex(skin, 1.06));
  grad.addColorStop(1, shadeHex(skin, 0.95));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  // Flat colour blocks (bottom strip, 7 across).
  const bw = 256 / 7;
  const block = (i: number, fill: string | CanvasGradient) => {
    g.fillStyle = fill;
    g.fillRect(Math.floor(i * bw), 192, Math.ceil(bw), 64);
  };
  const skinBlockGrad = g.createLinearGradient(0, 192, 0, 256);
  skinBlockGrad.addColorStop(0, shadeHex(skin, 1.02));
  skinBlockGrad.addColorStop(1, shadeHex(skin, 0.96));
  block(0, skinBlockGrad);
  block(1, shadeHex(skin, 0.86));
  const hairGrad = g.createLinearGradient(0, 192, 0, 256);
  hairGrad.addColorStop(0, shadeHex(hair, 1.07));
  hairGrad.addColorStop(1, shadeHex(hair, 0.76));
  block(2, hairGrad);
  block(3, beardCol);
  block(4, '#201612');
  const [sr, sg, sb] = hexRgb(skin);
  const lipRgb: [number, number, number] = [
    Math.round(lerp(sr, 141, 0.3)), Math.round(lerp(sg, 74, 0.3)), Math.round(lerp(sb, 58, 0.3)),
  ];
  const lipCss = (f: number): string => `rgb(${Math.min(255, Math.round(lipRgb[0] * f))},${Math.min(255, Math.round(lipRgb[1] * f))},${Math.min(255, Math.round(lipRgb[2] * f))})`;
  block(5, lipCss(0.92));
  block(6, kit.secondary);
  if (blank) return;

  // Cheek blush (undertone-tinted radial wash).
  const undertone = a.skinUndertone ?? 'WARM';
  const blushRgb = undertone === 'COOL' ? '150,110,140' : undertone === 'NEUTRAL' ? '200,120,100' : '216,120,84';
  const blushAlpha = undertone === 'NEUTRAL' ? 0.06 : 0.1;
  for (const sx of [-1, 1]) {
    const bg = g.createRadialGradient(X(sx * 0.075), Y(0.208), 2, X(sx * 0.075), Y(0.208), 36);
    bg.addColorStop(0, `rgba(${blushRgb},${blushAlpha})`);
    bg.addColorStop(1, `rgba(${blushRgb},0)`);
    g.fillStyle = bg;
    g.fillRect(X(sx * 0.075) - 38, Y(0.208) - 38, 76, 76);
  }
  // Brow ridge shadow: a soft dark band under the brow line.
  g.save();
  g.translate(128, Y(0.272));
  g.scale(3.4, 0.55);
  const browShadow = g.createRadialGradient(0, 0, 1, 0, 0, 30);
  browShadow.addColorStop(0, 'rgba(50,26,16,0.20)');
  browShadow.addColorStop(1, 'rgba(50,26,16,0)');
  g.fillStyle = browShadow;
  g.beginPath();
  g.arc(0, 0, 30, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Eyes: sclera + iris + pupil + lid line, at the geometry eyes' position.
  const es = a.eyeSpacing ?? 1;
  const fw = a.faceWidth ?? 1;
  const ez = a.eyeSize ?? 1;
  for (const sx of [-1, 1]) {
    const cx = X(sx * 0.047 * es * fw);
    const cy = Y(0.256);
    g.fillStyle = '#f5f1e8';
    g.beginPath();
    g.ellipse(cx, cy, 11 * ez, 6.5 * ez, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.eyeColor ?? '#3b2f2f';
    g.beginPath();
    g.arc(cx, cy, 5.6 * ez, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0a0a';
    g.beginPath();
    g.arc(cx, cy, 2.7 * ez, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(cx - 2, cy - 2, 1.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(43,24,16,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, cy, 11 * ez, 6.5 * ez, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
  // Nose: side shading flanking the geometric nose + nostril dots.
  for (const sx of [-1, 1]) {
    const x0 = X(sx * 0.004);
    const x1 = X(sx * 0.024);
    const ng = g.createLinearGradient(Math.min(x0, x1), 0, Math.max(x0, x1), 0);
    if (sx > 0) {
      ng.addColorStop(0, 'rgba(60,32,18,0)');
      ng.addColorStop(1, 'rgba(60,32,18,0.15)');
    } else {
      ng.addColorStop(0, 'rgba(60,32,18,0.15)');
      ng.addColorStop(1, 'rgba(60,32,18,0)');
    }
    g.fillStyle = ng;
    g.fillRect(Math.min(x0, x1), Y(0.252), Math.abs(x1 - x0), Y(0.196) - Y(0.252));
    g.fillStyle = 'rgba(40,20,12,0.35)';
    g.beginPath();
    g.arc(X(sx * 0.012), Y(0.19), 2, 0, Math.PI * 2);
    g.fill();
  }
  // Lips: two tones + centre line, under the geometric lip meshes.
  const mw = a.mouthStyle === 'WIDE' ? 1.5 : a.mouthStyle === 'SMALL' ? 0.7 : 1.05;
  const lf = a.lipFullness ?? 1;
  g.fillStyle = lipCss(0.8);
  g.beginPath();
  g.ellipse(128, Y(0.152), 17 * mw * lf, 3.4 * lf, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = lipCss(1.02);
  g.beginPath();
  g.ellipse(128, Y(0.142), 15 * mw * lf, 4 * lf, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(30,10,8,0.55)';
  g.fillRect(128 - 15 * mw, Y(0.147) - 0.75, 30 * mw, 1.5);
  // Beard stubble stipple (texture-only for STUBBLE; a whisper under the
  // SHORT / FULL geometry beards). Seeded so a face is stable per player.
  const beardStyle = a.beardStyle ?? 'NONE';
  const density = beardStyle === 'STUBBLE' ? 0.35 : beardStyle === 'SHORT' ? 0.18
    : beardStyle === 'FULL' ? 0.12 : beardStyle === 'GOATEE' ? 0.3 : 0;
  if (density > 0 || beardStyle === 'MOUSTACHE') {
    const rng = mulberry32(seed ^ 0x57abb1e);
    g.fillStyle = beardCol;
    g.globalAlpha = 0.5;
    const dots = beardStyle === 'MOUSTACHE' ? 260 : Math.round(density * 2400);
    for (let i = 0; i < dots; i += 1) {
      let x: number;
      let y: number;
      if (beardStyle === 'MOUSTACHE') {
        x = 104 + rng() * 48;
        y = 136 + rng() * 7;
      } else if (beardStyle === 'GOATEE') {
        const ang = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng());
        x = 128 + Math.cos(ang) * rr * 26;
        y = 166 + Math.sin(ang) * rr * 20;
      } else {
        x = 58 + rng() * 140;
        y = 126 + rng() * 64;
        const inJaw = ((x - 128) / 64) ** 2 + ((y - 162) / 34) ** 2 < 1;
        const inMouth = ((x - 128) / 24) ** 2 + ((y - 148) / 9) ** 2 < 1;
        if (!inJaw || inMouth) continue;
      }
      g.fillRect(x, y, 1.3, 1.3);
    }
    g.globalAlpha = 1;
  }
  // Hairline: a painted arc so the hair cap's rim never reads as a hard
  // line; BALD gets a crown shine instead.
  if (a.hairStyle === 'BALD') {
    const shine = g.createRadialGradient(128, 26, 2, 128, 26, 55);
    shine.addColorStop(0, 'rgba(255,255,255,0.09)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(70, 0, 116, 70);
  } else {
    const band = g.createLinearGradient(0, 6, 0, 50);
    band.addColorStop(0, shadeHex(hair, 1));
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.22;
    g.fillStyle = band;
    g.fillRect(28, 0, 200, 50);
    g.globalAlpha = 1;
    g.strokeStyle = hair;
    g.globalAlpha = 0.9;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(X(-0.105), Y(0.315));
    g.quadraticCurveTo(128, Y(0.358), X(0.105), Y(0.315));
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** UV rect of the face's atlas tile, painting it on first use (LRU). */
function faceAtlasRect(a: FaceAppearance, kit: KitColors, blank: boolean): UvRect {
  const key = faceKey(a, kit, blank);
  const { ctx, tex } = ensureFaceAtlas();
  let tile = faceTiles.get(key);
  if (tile !== undefined) {
    faceTiles.delete(key);
    faceTiles.set(key, tile);
  } else {
    if (faceNextTile < FACE_COLS * FACE_ROWS) {
      tile = faceNextTile;
      faceNextTile += 1;
    } else {
      const oldest = faceTiles.keys().next();
      tile = oldest.done ? 0 : (faceTiles.get(oldest.value) ?? 0);
      if (!oldest.done) faceTiles.delete(oldest.value);
    }
    faceTiles.set(key, tile);
    let seed = 0;
    for (let i = 0; i < key.length; i += 1) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const col = tile % FACE_COLS;
    const row = Math.floor(tile / FACE_COLS);
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * FACE_TILE, row * FACE_TILE, FACE_TILE, FACE_TILE);
    ctx.clip();
    ctx.translate(col * FACE_TILE, row * FACE_TILE);
    ctx.clearRect(0, 0, FACE_TILE, FACE_TILE);
    drawFaceArt(ctx, a, kit, blank, seed);
    ctx.restore();
    tex.needsUpdate = true;
  }
  const col = tile % FACE_COLS;
  const row = Math.floor(tile / FACE_COLS);
  const u0 = (col * FACE_TILE) / (FACE_TILE * FACE_COLS);
  const u1 = u0 + 1 / FACE_COLS;
  const v1 = 1 - (row * FACE_TILE) / (FACE_TILE * FACE_ROWS);
  const v0 = v1 - 1 / FACE_ROWS;
  return { u0, v0, u1, v1 };
}

function faceMaterial(): THREE.MeshStandardMaterial {
  const { tex } = ensureFaceAtlas();
  if (!sharedFaceMat) {
    sharedFaceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
  }
  return sharedFaceMat;
}

/**
 * Detail culls (LOW and DISTANT): facial micro-detail, hair satellites /
 * strands, small joint spheres and the FULL-only kit/boot extras never
 * enter the merge harvest on the light tiers. The number plates are NOT
 * culled on LOW (they sample the shared plate atlas under one shared
 * material); DISTANT culls them separately in the merge pass.
 */
const LOW_CULL_GEOS: ReadonlySet<THREE.BufferGeometry> = new Set([
  GEO.ear, GEO.eye, GEO.jaw, GEO.chin, GEO.browRidge, GEO.eyelid,
  GEO.noseBridge, GEO.noseTip, GEO.lip, GEO.collar, GEO.curl, GEO.hairStrand,
  GEO.lockLower, GEO.afroSat, GEO.sideburn, GEO.hairSideShell, GEO.shavedSide,
  GEO.knotTie, GEO.hand, GEO.fingers, GEO.finger, GEO.thumb, GEO.elbow,
  GEO.knee, GEO.ankle, GEO.calf, GEO.sleeve, GEO.shortsLeg,
  GEO.bootSole, GEO.stud, GEO.lace, GEO.bootCollar, GEO.sockCuff, GEO.sockStripe,
  GEO.drawstring, GEO.shortsNumber,
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
  opts?: { gk?: boolean },
): PlayerRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const lowTier = detail === 'LOW' || detail === 'DISTANT';
  const fullTier = detail === 'FULL' || detail === 'HERO';
  const isGk = opts?.gk ?? false;

  const heightScale = (appearance.heightCm / 100) / 1.8;
  const buildW = appearance.build === 'LEAN' ? 0.9 : appearance.build === 'STOCKY' ? 1.14 : 1.0;
  body.scale.set(buildW, heightScale, 1);

  const skin = new THREE.MeshStandardMaterial({ color: appearance.skinTone, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: appearance.hairColor, roughness: 0.95 });
  const bootMat = new THREE.MeshStandardMaterial({ color: appearance.bootColor, roughness: 0.28, metalness: 0.3 });
  const soleMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  const laceMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.7 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.85 });
  const socksMat = new THREE.MeshStandardMaterial({ color: kit.socks, roughness: 0.9 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: kit.sleeveColor ?? kit.primary, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: kit.secondary, roughness: 0.8 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: kit.primary, roughness: 0.85 });
  const stringMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });
  const browMat = new THREE.MeshStandardMaterial({ color: appearance.beardColor ?? appearance.hairColor, roughness: 1 });
  const beardMat = new THREE.MeshStandardMaterial({ color: appearance.beardColor ?? appearance.hairColor, roughness: 1 });
  // The chest, the number plates and the head are built with a placeholder
  // material and re-skinned by the merge pass below: the chest samples the
  // shared jersey atlas (FULL/HERO) or bakes the kit pattern into vertex
  // colours (LOW/DISTANT), the plates merge under the shared plate atlas,
  // and the head merges under the shared face atlas.
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
  // Drawstrings at the waistband front (merged into the pelvis).
  for (const sx of [-1, 1]) {
    const ds = mesh(GEO.drawstring, stringMat, sx * 0.018, -0.005, 0.15);
    ds.rotation.x = 0.35;
    pelvis.add(ds);
  }

  // --- Torso: sculpted capsule chest in the jersey --------------------------
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
  // The front plate pushes out on STOCKY builds so it never z-fights the
  // wider chest (spec §1.6).
  const frontPlate = new THREE.Mesh(GEO.numberFront, placeholderMat);
  frontPlate.position.set(0, 0.38, 0.154 * (1 + 0.14 * (buildW - 1)));
  torso.add(frontPlate);
  const backPlate = new THREE.Mesh(GEO.numberBack, placeholderMat);
  backPlate.position.set(0, 0.4, -0.154);
  backPlate.rotation.y = Math.PI;
  torso.add(backPlate);

  // --- Head (spec §1.3, build order): neck + trapezius, cranium, jaw +
  // chin, brow ridge, recessed eyes with lids, two-part nose, two lips,
  // flattened ears, cheekbones, beard. Every part is tagged with its
  // face-atlas UV treatment; the merge pass paints the recognisable
  // detail (sclera / iris / pupil, nose shading, stubble, hairline) into
  // the shared face tile underneath this geometry.
  const fw = appearance.faceWidth ?? 1;
  const jw = appearance.jawWidth ?? 1;
  const jl = appearance.jawLength ?? 1;
  const fh = appearance.foreheadHeight ?? 1;
  const cheek = appearance.cheekbone ?? 1;
  const faceShape = appearance.faceShape ?? 'OVAL';
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  head.add(facePart(mesh(GEO.neck, skin, 0, 0.03, 0), 'skin'));
  const trap = facePart(mesh(GEO.trapezius, skin, 0, 0.02, -0.02), 'skin');
  trap.scale.set(1.5, 0.45, 0.8);
  head.add(trap);
  const skull = facePart(mesh(GEO.skull, skin, 0, 0.235, 0), 'skull');
  skull.scale.set(
    0.94 * fw * (faceShape === 'ROUND' ? 1.03 : 1),
    1.12 * (0.7 + 0.3 * fh) * (0.85 + 0.15 * jl),
    0.98,
  );
  head.add(skull);
  const jawM = facePart(mesh(GEO.jaw, skin, 0, 0.163, 0.014), 'skin');
  jawM.scale.set(
    0.88 * jw * (faceShape === 'SQUARE' ? 1.06 : 1),
    0.78 * jl * (faceShape === 'LONG' ? 1.06 : 1),
    0.9,
  );
  head.add(jawM);
  const chin = facePart(mesh(GEO.chin, skin, 0, 0.128, 0.062), 'skin');
  chin.scale.set(1.15, faceShape === 'SQUARE' ? 0.68 : 0.8, 0.9);
  head.add(chin);
  const earScale = appearance.earSize ?? 1;
  for (const sx of [-1, 1]) {
    const ear = facePart(mesh(GEO.ear, skin, sx * 0.117 * fw, 0.235, 0), 'skin');
    ear.scale.set(earScale, earScale, 0.45 * earScale);
    head.add(ear);
  }
  const eyeSpacing = appearance.eyeSpacing ?? 1;
  const eyeSize = appearance.eyeSize ?? 1;
  const browThick = appearance.browStyle === 'THICK' ? 1.5 : appearance.browStyle === 'ARCHED' ? 0.85 : 1;
  for (const sx of [-1, 1]) {
    const ex = sx * 0.047 * eyeSpacing * fw;
    const ridge = facePart(mesh(GEO.browRidge, skin, ex, 0.272, 0.108), 'skinDark');
    ridge.rotation.z = Math.PI / 2;
    head.add(ridge);
    const eye = facePart(mesh(GEO.eye, skin, ex, 0.256, 0.104), 'dark');
    eye.scale.setScalar(eyeSize);
    eye.castShadow = false;
    head.add(eye);
    const lid = facePart(mesh(GEO.eyelid, skin, ex, 0.262, 0.11), 'skin');
    lid.scale.set(1.15, 0.45, 0.6);
    lid.castShadow = false;
    head.add(lid);
    const brow = facePart(new THREE.Mesh(GEO.brow, browMat), 'beard');
    brow.position.set(ex, 0.283, 0.112);
    brow.scale.set(1.25, 0.32 * browThick, 0.4);
    brow.castShadow = false;
    head.add(brow);
  }
  // Nose: bridge + tip (the single nose ball is gone).
  const noseShape = appearance.noseShape ?? 'STRAIGHT';
  const bridge = facePart(mesh(GEO.noseBridge, skin, 0, 0.225, 0.118), 'skin');
  bridge.rotation.x = 0.21 + (noseShape === 'HOOKED' ? 0.14 : 0);
  bridge.scale.set(appearance.noseWidth ?? 1, appearance.noseLength ?? 1, 1);
  head.add(bridge);
  const tip = facePart(mesh(GEO.noseTip, skin, 0, 0.198, 0.128), 'skin');
  tip.scale.set(
    1.15 * (appearance.noseWidth ?? 1) * (noseShape === 'BROAD' ? 1.25 : noseShape === 'BUTTON' ? 0.85 : 1),
    0.85, 1,
  );
  head.add(tip);
  // Mouth: two lip meshes over the painted lips.
  const lipFull = appearance.lipFullness ?? 1;
  const mouthW = appearance.mouthStyle === 'WIDE' ? 1.5 : appearance.mouthStyle === 'SMALL' ? 0.7 : 1.05;
  const lipUpper = facePart(mesh(GEO.lip, skin, 0, 0.152, 0.096), 'lip');
  lipUpper.scale.set(1.6 * mouthW, 0.35 * lipFull, 0.5 * lipFull);
  lipUpper.castShadow = false;
  head.add(lipUpper);
  const lipLower = facePart(mesh(GEO.lip, skin, 0, 0.142, 0.098), 'lip');
  lipLower.scale.set(1.4 * mouthW, 0.45 * lipFull, 0.5 * lipFull);
  lipLower.castShadow = false;
  head.add(lipLower);
  // Cheekbones: subtle flattened patches that catch the floodlights.
  if (cheek > 1.02 || faceShape === 'ROUND') {
    const cheekEff = Math.max(cheek, faceShape === 'ROUND' ? 1.05 : cheek);
    for (const sx of [-1, 1]) {
      const ch = facePart(mesh(GEO.cheek, skin, sx * 0.072 * fw, 0.208, 0.092), 'skin');
      ch.scale.set(1, 0.8, 0.5 * cheekEff);
      ch.castShadow = false;
      head.add(ch);
    }
  }
  // Beard: STUBBLE is texture-only (painted stipple in the face tile);
  // SHORT / FULL keep the jaw shell, GOATEE the chin patch, MOUSTACHE
  // the strip — all sampling the tile's beard block.
  const beardStyle = appearance.beardStyle ?? 'NONE';
  if (beardStyle === 'MOUSTACHE') {
    const mo = facePart(new THREE.Mesh(GEO.brow, beardMat), 'beard');
    mo.position.set(0, 0.168, 0.108);
    mo.scale.set(1.9, 0.45, 0.5);
    mo.castShadow = false;
    head.add(mo);
  } else if (beardStyle === 'GOATEE') {
    const gMesh = facePart(mesh(GEO.jaw, beardMat, 0, 0.128, 0.03), 'beard');
    gMesh.scale.set(0.42, 0.4, 0.5);
    gMesh.castShadow = false;
    head.add(gMesh);
  } else if (beardStyle === 'SHORT' || beardStyle === 'FULL') {
    const full = beardStyle === 'FULL';
    const b = facePart(mesh(GEO.jaw, beardMat, 0, full ? 0.158 : 0.148, 0.02), 'beard');
    b.scale.set(0.9 * jw * (full ? 1.04 : 0.96), full ? 0.86 : 0.6, 0.92);
    b.castShadow = false;
    head.add(b);
  }
  // Headband accessory (samples the tile's kit-trim block).
  if (appearance.headband) {
    const band = facePart(new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.016, 8, 24), trimMat), 'trim');
    band.position.set(0, 0.285, 0);
    band.rotation.x = Math.PI / 2 - 0.18;
    band.scale.set(fw, 1, 1);
    band.castShadow = false;
    head.add(band);
  }
  // --- Hair (spec §1.5): per-style construction over the shared caps.
  // Curl / satellite placement is jittered by a per-player seeded rng —
  // never Math.random — so a player's hair is stable across rebuilds.
  let hairSeed = appearance.heightCm * 131;
  const hairSeedStr = `${appearance.skinTone}|${appearance.hairColor}|${appearance.hairStyle}`;
  for (let i = 0; i < hairSeedStr.length; i += 1) hairSeed = (hairSeed * 31 + hairSeedStr.charCodeAt(i)) >>> 0;
  const hairRng = mulberry32(hairSeed ^ 0x4a17);
  const hairPart = (m: THREE.Mesh): THREE.Mesh => facePart(m, 'hairGrad');
  const addSideburns = (): void => {
    for (const sx of [-1, 1]) head.add(hairPart(mesh(GEO.sideburn, hairMat, sx * 0.115 * fw, 0.19, 0.02)));
  };
  const hairStyle = appearance.hairStyle;
  if (hairStyle === 'SHORT') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0, 0.243, -0.006));
    cap.scale.set(0.97, 1.1, 0.98);
    head.add(cap);
    addSideburns();
  } else if (hairStyle === 'FADE') {
    const cap = hairPart(mesh(GEO.hairCapFade, hairMat, 0, 0.248, -0.004));
    cap.scale.set(0.97, 1.08, 1.0);
    head.add(cap);
    for (const sx of [-1, 1]) head.add(hairPart(mesh(GEO.hairSideShell, hairMat, sx * 0.115, 0.24, 0)));
    addSideburns();
  } else if (hairStyle === 'CURLY') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0, 0.25, -0.006));
    cap.scale.set(0.99, 1.12, 1.02);
    head.add(cap);
    const curlAt: [number, number, number][] = [
      [-0.085, 0.345, 0.03], [0, 0.365, 0.045], [0.085, 0.345, 0.03],
      [-0.1, 0.315, -0.055], [0.1, 0.315, -0.055], [0, 0.35, -0.085],
      [-0.05, 0.375, 0.09], [0.055, 0.37, -0.02], [-0.02, 0.385, -0.04],
    ];
    for (const [x, y, z] of curlAt) {
      const c = hairPart(mesh(GEO.curl, hairMat, x + (hairRng() - 0.5) * 0.012, y, z + (hairRng() - 0.5) * 0.012));
      c.scale.setScalar(0.83 + hairRng() * 0.3);
      head.add(c);
    }
    addSideburns();
  } else if (hairStyle === 'AFRO') {
    const puff = hairPart(mesh(GEO.afro, hairMat, 0, 0.315, -0.008));
    puff.scale.y = 0.92;
    head.add(puff);
    // Satellites break the perfect-ball silhouette.
    const satAt: [number, number, number][] = [
      [0.1, 0.4, 0.02], [-0.1, 0.4, 0.02], [0.13, 0.33, -0.06],
      [-0.13, 0.33, -0.06], [0, 0.44, -0.03], [0.02, 0.36, 0.11],
    ];
    for (const [x, y, z] of satAt) {
      const s = hairPart(mesh(GEO.afroSat, hairMat, x, y, z));
      s.scale.setScalar(0.9 + hairRng() * 0.25);
      head.add(s);
    }
    addSideburns();
  } else if (hairStyle === 'LONG') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0, 0.245, -0.006));
    cap.scale.set(0.98, 1.11, 1.01);
    head.add(cap);
    const back = hairPart(mesh(GEO.hairBack, hairMat, 0, 0.1, -0.108));
    back.scale.set(1, 1.3, 1);
    head.add(back);
    head.add(hairPart(mesh(GEO.hairStrand, hairMat, -0.118, 0.13, -0.01)));
    head.add(hairPart(mesh(GEO.hairStrand, hairMat, 0.118, 0.13, -0.01)));
    head.add(hairPart(mesh(GEO.hairStrand, hairMat, -0.125, 0.05, 0.06)));
    head.add(hairPart(mesh(GEO.hairStrand, hairMat, 0.125, 0.05, 0.06)));
    addSideburns();
  } else if (hairStyle === 'MOHAWK') {
    const crest = hairPart(mesh(GEO.mohawk, hairMat, 0, 0.385, -0.005));
    crest.rotation.x = Math.PI / 2;
    crest.scale.set(0.8, 1.05, 1.3);
    head.add(crest);
    // Shaved sides are what sells a mohawk.
    for (const sx of [-1, 1]) {
      const sh = facePart(mesh(GEO.shavedSide, skin, sx * 0.105, 0.26, 0), 'skinDark');
      sh.scale.set(0.35, 0.9, 0.95);
      head.add(sh);
    }
    addSideburns();
  } else if (hairStyle === 'BUZZ' || hairStyle === 'BALD_FADE') {
    // Very short crop: a thin fade shell hugging the skull.
    const cap = hairPart(mesh(GEO.hairCapFade, hairMat, 0, 0.246, -0.004));
    cap.scale.set(0.96, 1.02, 0.99);
    head.add(cap);
    addSideburns();
  } else if (hairStyle === 'SIDEPART') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0.008, 0.245, -0.006));
    cap.scale.set(0.97, 1.09, 1.0);
    head.add(cap);
    addSideburns();
  } else if (hairStyle === 'FRINGE') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0, 0.243, -0.002));
    cap.scale.set(0.97, 1.1, 1.0);
    head.add(cap);
    const fringe = hairPart(mesh(GEO.curl, hairMat, 0, 0.315, 0.105));
    fringe.scale.set(2.1, 0.55, 0.8);
    head.add(fringe);
    for (const sx of [-1, 1]) {
      const f2 = hairPart(mesh(GEO.curl, hairMat, sx * 0.05, 0.31, 0.1));
      f2.scale.set(1.4, 0.5, 0.75);
      head.add(f2);
    }
    addSideburns();
  } else if (hairStyle === 'CURLY_TOP') {
    const cap = hairPart(mesh(GEO.hairCapFade, hairMat, 0, 0.248, -0.004));
    cap.scale.set(0.97, 1.06, 1.0);
    head.add(cap);
    const curlAt: [number, number, number][] = [
      [-0.07, 0.355, 0.05], [0.02, 0.375, 0.06], [0.08, 0.35, 0.02],
      [-0.03, 0.36, -0.05], [0.06, 0.345, -0.07], [-0.09, 0.34, 0.06], [0, 0.385, 0],
    ];
    for (const [x, y, z] of curlAt) {
      const c = hairPart(mesh(GEO.curl, hairMat, x, y, z));
      c.scale.setScalar(0.85 + hairRng() * 0.28);
      head.add(c);
    }
    addSideburns();
  } else if (hairStyle === 'TOPKNOT') {
    const cap = hairPart(mesh(GEO.hairCapFade, hairMat, 0, 0.247, -0.004));
    cap.scale.set(0.97, 1.07, 1.0);
    head.add(cap);
    const knot = hairPart(mesh(GEO.curl, hairMat, 0, 0.385, -0.03));
    knot.scale.set(0.85, 0.8, 0.85);
    head.add(knot);
    const tie = hairPart(mesh(GEO.knotTie, hairMat, 0, 0.362, -0.03));
    tie.rotation.x = Math.PI / 2;
    head.add(tie);
    addSideburns();
  } else if (hairStyle === 'DREADLOCKS' || hairStyle === 'BRAIDS') {
    const cap = hairPart(mesh(GEO.hairCapShort, hairMat, 0, 0.246, -0.006));
    cap.scale.set(0.98, 1.1, 1.01);
    head.add(cap);
    // Ten locks, each two stacked capsules so they read as locks, not sticks.
    const strandAt: [number, number, number][] = [
      [-0.125, 0.16, 0.03], [0.125, 0.16, 0.03],
      [-0.12, 0.15, -0.06], [0.12, 0.15, -0.06],
      [-0.07, 0.13, -0.105], [0.07, 0.13, -0.105], [0, 0.12, -0.115],
      [-0.135, 0.18, -0.02], [0.135, 0.18, -0.02], [0, 0.14, -0.12],
    ];
    for (const [x, y, z] of strandAt) {
      head.add(hairPart(mesh(GEO.hairStrand, hairMat, x, y, z)));
      const lower = hairPart(mesh(GEO.lockLower, hairMat, x * 1.04, y - 0.145, z * 1.04));
      lower.rotation.z = x === 0 ? 0 : -Math.sign(x) * 0.12;
      head.add(lower);
    }
    addSideburns();
  } // BALD: no hair mesh — the face tile paints the crown shine.

  // --- Arms: ball shoulders, capsule sleeve + arm, mitten/finger hands ------
  const muscle = appearance.muscle ?? 1;
  const makeArm = (sideSign: number): { arm: THREE.Group; fore: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set(sideSign * 0.27 * shoulderW, 0.615, 0);
    torso.add(arm);
    arm.add(mesh(GEO.armJoint, sleeveMat, 0, 0, 0));
    // Goalkeepers wear long sleeves to the wrist (spec §1.6).
    if (isGk) arm.add(mesh(GEO.sleeveLong, sleeveMat, 0, -0.14, 0));
    else arm.add(mesh(GEO.sleeve, sleeveMat, 0, -0.08, 0)); // short kit sleeve
    const upper = mesh(GEO.upperArm, skin, 0, -0.185, 0);
    upper.scale.set(muscle, 1, muscle);
    arm.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.315;
    arm.add(fore);
    fore.add(mesh(GEO.elbow, skin, 0, 0, 0));
    const foreMesh = mesh(GEO.forearm, skin, 0, -0.115, 0);
    // Sleeve tattoo (right forearm): the merge pass paints a tribal band
    // into the forearm's vertex colours instead of a flat grey capsule.
    if (sideSign > 0 && appearance.sleeveTattoo) foreMesh.userData.tattoo = true;
    fore.add(foreMesh);
    // Hand (spec §1.8): palm + one mitten finger block (FULL) or four
    // individual finger capsules (HERO) + thumb. LOW culls all of it.
    const palm = mesh(GEO.hand, skin, 0, -0.265, 0.004);
    palm.scale.set(0.85, 1.25, 0.45);
    fore.add(palm);
    if (detail === 'HERO') {
      for (const fx of [-0.027, -0.009, 0.009, 0.027]) {
        const f = mesh(GEO.finger, skin, fx, -0.35, 0.004);
        f.rotation.z = -fx * 3;
        fore.add(f);
      }
    } else {
      const fingers = mesh(GEO.fingers, skin, 0, -0.355, 0.004);
      fingers.scale.set(2.2, 1, 0.5);
      fore.add(fingers);
    }
    const thumb = mesh(GEO.thumb, skin, -sideSign * 0.032, -0.3, 0.014);
    thumb.rotation.z = sideSign * 0.45;
    fore.add(thumb);
    return { arm, fore };
  };
  const left = makeArm(-1);
  const right = makeArm(1);

  // --- Legs: shorts thigh, skin thigh, socked shin, lathe boot on a foot ----
  const legLen = appearance.legLength ?? 1;
  let shortsNumberMesh: THREE.Mesh | null = null;
  const makeLeg = (sideSign: number): { leg: THREE.Group; shin: THREE.Group; foot: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.set(sideSign * 0.115, -0.07, 0);
    pelvis.add(leg);
    leg.add(mesh(GEO.hipJoint, shortsMat, 0, -0.02, 0));
    leg.add(mesh(GEO.shortsLeg, shortsMat, 0, -0.1, 0)); // shorts cover the upper thigh
    const stripe = mesh(GEO.shortsStripe, trimMat, sideSign * 0.088, -0.1, 0);
    stripe.scale.set(0.4, 1, 1.5);
    leg.add(stripe);
    const thigh = mesh(GEO.thigh, skin, 0, -0.245, 0);
    thigh.scale.set(muscle, 1, muscle);
    leg.add(thigh);
    // Shorts number on the front-left thigh (FULL/HERO, plate atlas).
    if (sideSign < 0) {
      const sn = new THREE.Mesh(GEO.shortsNumber, placeholderMat);
      sn.position.set(-0.028, -0.13, 0.088);
      sn.rotation.x = -0.1;
      leg.add(sn);
      shortsNumberMesh = sn;
    }
    const shin = new THREE.Group();
    shin.position.y = -0.44 * legLen;
    leg.add(shin);
    shin.add(mesh(GEO.knee, skin, 0, 0, 0));
    const calf = mesh(GEO.calf, socksMat, 0, -0.1, -0.014);
    calf.scale.set(0.95 * muscle, 1.35, 0.95 * muscle);
    shin.add(calf);
    shin.add(mesh(GEO.shin, socksMat, 0, -0.165, 0));
    // Sock turnover cuff + twin stripes (FULL/HERO; culled geos on light tiers).
    const cuff = mesh(GEO.sockCuff, trimMat, 0, -0.06, 0);
    cuff.rotation.x = Math.PI / 2;
    shin.add(cuff);
    if (kit.socks !== kit.primary) {
      for (const sy of [-0.1, -0.13]) {
        const st = mesh(GEO.sockStripe, stripeMat, 0, sy, 0);
        st.rotation.x = Math.PI / 2;
        shin.add(st);
      }
    }
    shin.add(mesh(GEO.ankle, socksMat, 0, -0.315, 0));
    // Foot joint (spec §1.7): same origin the boot cluster always had, so
    // every existing pose lands unchanged; legLength lengthens the shin
    // pivot and the foot compensates so the boot still touches y=0.
    const foot = new THREE.Group();
    foot.position.y = -0.375 + 0.44 * (legLen - 1);
    shin.add(foot);
    // On FULL/HERO the boot lives in the foot joint and the foot rotates;
    // on LOW/DISTANT the boot merges into the shin instead, so the light
    // tiers keep their mesh budgets (13 / 12) exactly.
    const bootHost = lowTier ? shin : foot;
    const bootBaseY = lowTier ? foot.position.y : 0;
    bootHost.add(mesh(GEO.boot, bootMat, 0, bootBaseY - 0.024, 0));
    if (fullTier) {
      bootHost.add(mesh(GEO.bootSole, soleMat, 0, bootBaseY - 0.058, 0.012));
      const studAt: [number, number][] = [
        [-0.027, 0.145], [0.027, 0.145], [-0.027, 0.02],
        [0.027, 0.02], [-0.026, -0.045], [0.026, -0.045],
      ];
      for (const [sx2, sz2] of studAt) bootHost.add(mesh(GEO.stud, soleMat, sx2, bootBaseY - 0.07, sz2));
      const laceAt: [number, number][] = [[0.016, 0.055], [0.02, 0.085], [0.02, 0.115]];
      for (const [ly, lz] of laceAt) {
        const lace = mesh(GEO.lace, laceMat, 0, bootBaseY + ly, lz);
        lace.rotation.x = 1.15;
        lace.scale.set(1.5, 0.8, 1);
        bootHost.add(lace);
      }
      const bootCollar = mesh(GEO.bootCollar, socksMat, 0, bootBaseY + 0.012, -0.005);
      bootCollar.rotation.x = Math.PI / 2;
      bootHost.add(bootCollar);
    }
    return { leg, shin, foot };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // --- Rig merge ---------------------------------------------------------
  // Bake every joint group's parts into ONE mesh per joint (see header).
  // Transforms are captured from the fully assembled rig, so each part
  // lands exactly where the unmerged rig drew it; the joint groups keep
  // their pivots and the animator drives them unchanged. The head merges
  // under the face atlas, everything else under vertex colours / the
  // jersey atlas / the plate atlas as before.
  group.updateMatrixWorld(true);
  const jointGroups: THREE.Group[] = [
    pelvis, torso, head,
    left.arm, left.fore, right.arm, right.fore,
    legL.leg, legL.shin, legL.foot, legR.leg, legR.shin, legR.foot,
  ];
  const jointSet = new Set<THREE.Object3D>(jointGroups);
  const kitPrimary = new THREE.Color(kit.primary);
  const kitSecondary = new THREE.Color(kit.secondary);
  const skinColor = new THREE.Color(appearance.skinTone);
  const tattooColor = new THREE.Color('#3f4a5a');

  type ColorFn = (x: number, y: number, z: number, base: THREE.Color) => THREE.Color;
  /** Clone a part's geometry into joint-local space with a baked
   *  per-vertex `color` attribute: the part's material colour (or the
   *  kit pattern when `jerseyBands` is set for the light-tier chest, or
   *  a per-vertex colour function), multiplied by the §1.2c AO-ish
   *  factor — up-facing vertices lighter, down-facing darker, fronts
   *  slightly lifted, clamped to [0.82, 1.06]. */
  const bakePart = (
    src: THREE.BufferGeometry,
    rel: THREE.Matrix4,
    jerseyBands: boolean,
    color: THREE.Color,
    colorFn?: ColorFn,
  ): THREE.BufferGeometry => {
    const geo = src.clone();
    geo.applyMatrix4(rel);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      let c = color;
      if (colorFn) c = colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
      else if (jerseyBands && uv) c = kitPatternColor(kit, uv.getX(i), uv.getY(i), kitPrimary, kitSecondary);
      let f = 1;
      if (nor) {
        f = Math.min(1.06, Math.max(0.82, 0.94 + 0.09 * nor.getY(i) + 0.04 * Math.max(0, nor.getZ(i))));
      }
      colors[i * 3] = c.r * f;
      colors[i * 3 + 1] = c.g * f;
      colors[i * 3 + 2] = c.b * f;
    }
    geo.deleteAttribute('uv');
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  };

  /** Clone a head part into head-local space with face-atlas UVs: the
   *  skull via the planar face projection (back of the skull falls back
   *  to the hair gradient / skin block), hair via the height gradient,
   *  every other part via its flat colour block. */
  const bakeFacePart = (
    src: THREE.BufferGeometry,
    rel: THREE.Matrix4,
    mode: FaceUvMode,
  ): THREE.BufferGeometry => {
    const geo = src.clone();
    geo.applyMatrix4(rel);
    const pos = geo.getAttribute('position');
    const count = pos.count;
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let u: number;
      let v: number;
      if (mode === 'skull' && z < -0.02 && y <= 0.26) {
        [u, v] = FACE_BLOCK_UV.skin; // back of the skull, below the hairline
      } else if (mode === 'skull' && z >= -0.02) {
        u = clamp01(0.5 + x / 0.3);
        v = 0.25 + clamp01((y - 0.08) / 0.3) * 0.75;
      } else if (mode === 'skull' || mode === 'hairGrad') {
        u = FACE_HAIR_U; // back-of-skull hair zone / hair parts: gradient by height
        v = 0.03 + clamp01((y - 0.17) / 0.24) * 0.19;
      } else {
        [u, v] = FACE_BLOCK_UV[mode as keyof typeof FACE_BLOCK_UV];
      }
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return geo;
  };

  /** The tattoo forearm's colour function: skin everywhere except a
   *  0.09 m tribal band around the forearm (fore-joint space). */
  const tattooFn: ColorFn = (_x, y, _z, base) => (y > -0.2 && y < -0.11 ? tattooColor : base);

  for (const joint of jointGroups) {
    const jointInv = joint.matrixWorld.clone().invert();
    const vcParts: THREE.BufferGeometry[] = [];
    const faceParts: THREE.BufferGeometry[] = [];
    let jerseySrc: { geo: THREE.BufferGeometry; rel: THREE.Matrix4 } | null = null;
    const plateSrc: { geo: THREE.BufferGeometry; rel: THREE.Matrix4; crop: 'front' | 'back' | 'shorts' }[] = [];
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
      // Captured before the === chain: TS narrows `part` to never inside
      // some branches, so all geometry access goes through this local.
      const partGeo = part.geometry;
      const isFrontPlate = part === frontPlate;
      const isPlate = isFrontPlate || part === backPlate;
      if (joint === head) {
        if (lowTier && LOW_CULL_GEOS.has(partGeo)) {
          // Culled on the light tiers — the face tile paints it instead.
        } else {
          faceParts.push(bakeFacePart(partGeo, rel, (part.userData.faceUv as FaceUvMode | undefined) ?? 'skin'));
        }
      } else if (part === chestMesh) {
        if (lowTier) vcParts.push(bakePart(partGeo, rel, true, kitPrimary));
        else jerseySrc = { geo: partGeo, rel };
      } else if (isPlate) {
        // Plates ride the shared plate atlas on LOW/FULL/HERO; DISTANT
        // culls them (a 0.27 m number is < 4 px beyond 25 m).
        if (detail !== 'DISTANT') plateSrc.push({ geo: partGeo, rel, crop: isFrontPlate ? 'front' : 'back' });
      } else if (part === shortsNumberMesh) {
        if (fullTier) plateSrc.push({ geo: partGeo, rel, crop: 'shorts' });
      } else if (lowTier && LOW_CULL_GEOS.has(partGeo)) {
        // Culled on the light tiers — never enters the merged geometry.
      } else if (part.userData.tattoo) {
        vcParts.push(bakePart(partGeo, rel, false, skinColor, tattooFn));
      } else {
        const mat = Array.isArray(part.material) ? part.material[0] : part.material;
        const color = (mat as THREE.MeshStandardMaterial | undefined)?.color ?? new THREE.Color('#ffffff');
        vcParts.push(bakePart(partGeo, rel, false, color));
      }
      part.removeFromParent();
    }
    // Non-joint helper groups are empty once their meshes are harvested —
    // drop them so no stray nodes remain.
    for (const g of subGroups) if (g.children.length === 0) g.removeFromParent();
    if (vcParts.length > 0) {
      const merged = mergeGeometries(vcParts, false);
      if (merged) {
        const m = new THREE.Mesh(merged, vertexColorMaterial());
        m.castShadow = fullTier;
        joint.add(m);
      }
    }
    if (faceParts.length > 0) {
      const rect = faceAtlasRect(appearance, kit, detail === 'DISTANT');
      const geos = faceParts.map((geo) => {
        const uv = geo.getAttribute('uv');
        if (uv) {
          for (let i = 0; i < uv.count; i += 1) {
            uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
          }
        }
        return geo;
      });
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const m = new THREE.Mesh(merged, faceMaterial());
        m.castShadow = fullTier;
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
            // +0.5 shift: the capsule's front (+z) sits at lathe u=0, so
            // shifting puts the shirt front at the tile's centre column,
            // where the sponsor / V-neck / halves boundary are painted.
            const shifted = uv.getX(i) + 0.5;
            const fx = shifted - Math.floor(shifted);
            uv.setXY(i, rect.u0 + fx * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
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
      // art occupies the tile's left half, the front art its right half,
      // and the shorts number a crop around the front number.
      const rect = plateAtlasRect(shirtNumber, shortName, kit);
      const geos = plateSrc.map((p) => {
        const geo = p.geo.clone();
        geo.applyMatrix4(p.rel);
        const uv = geo.getAttribute('uv');
        if (uv) {
          for (let i = 0; i < uv.count; i += 1) {
            let tu: number;
            let tv: number;
            if (p.crop === 'front') { tu = 0.5 + uv.getX(i) * 0.5; tv = uv.getY(i); }
            else if (p.crop === 'back') { tu = uv.getX(i) * 0.5; tv = uv.getY(i); }
            else { tu = 0.63 + uv.getX(i) * 0.24; tv = 0.12 + uv.getY(i) * 0.45; }
            uv.setXY(i, rect.u0 + tu * (rect.u1 - rect.u0), rect.v0 + tv * (rect.v1 - rect.v0));
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
      legL: legL.leg, shinL: legL.shin, footL: legL.foot,
      legR: legR.leg, shinR: legR.shin, footR: legR.foot,
      body,
    },
    setShadowVisible: (v: boolean) => { shadowDisc.visible = v; },
  };
}
