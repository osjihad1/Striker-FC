// Striker FC — rendering/TextureAssets.ts
// Photo + kit texture assets (overnight textures pass, 2026-11-22).
//
// Everything here is a Vite-bundled URL (imported JPGs under
// client/src/assets/textures/); nothing is fetched from the network at
// runtime, so the APK stays fully offline. The JPGs are the high-res
// sources (grass/crowd 4096x2048, kits 1024x1024); callers downscale
// them to the graphics tier before they become GPU textures, so a
// Pixel 6 Pro on LOW never pays for ULTRA texels.
//
// Kit textures are keyed by `${abbr}|${primary}` — the abbreviation
// alone is NOT enough, because a club's home and away strips share it.
// KitColors.abbr is set by clubKit() for every real/original club.
//
// All loading is best-effort with procedural fallbacks: if a texture
// image fails to load (or has not finished yet), the callers keep their
// procedural canvas art and repaint when the photo arrives.
import * as THREE from 'three';
import type { KitColors } from './PlayerRig';

import grassDayUrl from '../assets/textures/grass-day.jpg';
import grassNightUrl from '../assets/textures/grass-night.jpg';
import crowdDayUrl from '../assets/textures/crowd-day.jpg';
import crowdNightUrl from '../assets/textures/crowd-night.jpg';
import concourseUrl from '../assets/textures/concourse.jpg';
import adboardsUrl from '../assets/textures/adboards.jpg';

import kitRmaUrl from '../assets/textures/kit-RMA.jpg';
import kitAwayRmaUrl from '../assets/textures/kit-away-RMA.jpg';
import kitBarUrl from '../assets/textures/kit-BAR.jpg';
import kitAwayBarUrl from '../assets/textures/kit-away-BAR.jpg';
import kitMciUrl from '../assets/textures/kit-MCI.jpg';
import kitAwayMciUrl from '../assets/textures/kit-away-MCI.jpg';
import kitLivUrl from '../assets/textures/kit-LIV.jpg';
import kitAwayLivUrl from '../assets/textures/kit-away-LIV.jpg';
import kitArsUrl from '../assets/textures/kit-ARS.jpg';
import kitAwayArsUrl from '../assets/textures/kit-away-ARS.jpg';
import kitPsgUrl from '../assets/textures/kit-PSG.jpg';
import kitAwayPsgUrl from '../assets/textures/kit-away-PSG.jpg';
import kitFcbUrl from '../assets/textures/kit-FCB.jpg';
import kitAwayFcbUrl from '../assets/textures/kit-away-FCB.jpg';
import kitIntUrl from '../assets/textures/kit-INT.jpg';
import kitAwayIntUrl from '../assets/textures/kit-away-INT.jpg';
import kitAcmUrl from '../assets/textures/kit-ACM.jpg';
import kitAwayAcmUrl from '../assets/textures/kit-away-ACM.jpg';
import kitJuvUrl from '../assets/textures/kit-JUV.jpg';
import kitAwayJuvUrl from '../assets/textures/kit-away-JUV.jpg';
import kitBvbUrl from '../assets/textures/kit-BVB.jpg';
import kitAwayBvbUrl from '../assets/textures/kit-away-BVB.jpg';
import kitNsrUrl from '../assets/textures/kit-NSR.jpg';
import kitAwayNsrUrl from '../assets/textures/kit-away-NSR.jpg';
import kitMiaUrl from '../assets/textures/kit-MIA.jpg';
import kitAwayMiaUrl from '../assets/textures/kit-away-MIA.jpg';
import kitCheUrl from '../assets/textures/kit-CHE.jpg';
import kitAwayCheUrl from '../assets/textures/kit-away-CHE.jpg';
import kitUtdUrl from '../assets/textures/kit-UTD.jpg';
import kitAwayUtdUrl from '../assets/textures/kit-away-UTD.jpg';
import kitAtmUrl from '../assets/textures/kit-ATM.jpg';
import kitAwayAtmUrl from '../assets/textures/kit-away-ATM.jpg';
import kitDhkUrl from '../assets/textures/kit-DHK.jpg';
import kitAwayDhkUrl from '../assets/textures/kit-away-DHK.jpg';
import kitMnsUrl from '../assets/textures/kit-MNS.jpg';
import kitAwayMnsUrl from '../assets/textures/kit-away-MNS.jpg';
import kitCatUrl from '../assets/textures/kit-CAT.jpg';
import kitAwayCatUrl from '../assets/textures/kit-away-CAT.jpg';
import kitMdrUrl from '../assets/textures/kit-MDR.jpg';
import kitAwayMdrUrl from '../assets/textures/kit-away-MDR.jpg';
import kitParUrl from '../assets/textures/kit-PAR.jpg';
import kitAwayParUrl from '../assets/textures/kit-away-PAR.jpg';
import kitMunUrl from '../assets/textures/kit-MUN.jpg';
import kitAwayMunUrl from '../assets/textures/kit-away-MUN.jpg';
import kitLonUrl from '../assets/textures/kit-LON.jpg';
import kitAwayLonUrl from '../assets/textures/kit-away-LON.jpg';
import kitMilUrl from '../assets/textures/kit-MIL.jpg';
import kitAwayMilUrl from '../assets/textures/kit-away-MIL.jpg';
import kitMryUrl from '../assets/textures/kit-MRY.jpg';
import kitAwayMryUrl from '../assets/textures/kit-away-MRY.jpg';
import kitRioUrl from '../assets/textures/kit-RIO.jpg';
import kitAwayRioUrl from '../assets/textures/kit-away-RIO.jpg';
import kitBplUrl from '../assets/textures/kit-BPL.jpg';
import kitAwayBplUrl from '../assets/textures/kit-away-BPL.jpg';
import kitTkyUrl from '../assets/textures/kit-TKY.jpg';
import kitAwayTkyUrl from '../assets/textures/kit-away-TKY.jpg';
import kitCtgUrl from '../assets/textures/kit-CTG.jpg';
import kitAwayCtgUrl from '../assets/textures/kit-away-CTG.jpg';
import kitSylUrl from '../assets/textures/kit-SYL.jpg';
import kitAwaySylUrl from '../assets/textures/kit-away-SYL.jpg';
import kitKhuUrl from '../assets/textures/kit-KHU.jpg';
import kitAwayKhuUrl from '../assets/textures/kit-away-KHU.jpg';
import kitRajUrl from '../assets/textures/kit-RAJ.jpg';
import kitAwayRajUrl from '../assets/textures/kit-away-RAJ.jpg';
import kitBslUrl from '../assets/textures/kit-BSL.jpg';
import kitAwayBslUrl from '../assets/textures/kit-away-BSL.jpg';
import kitCoxUrl from '../assets/textures/kit-COX.jpg';
import kitAwayCoxUrl from '../assets/textures/kit-away-COX.jpg';
import kitSamUrl from '../assets/textures/kit-SAM.jpg';
import kitAwaySamUrl from '../assets/textures/kit-away-SAM.jpg';
import kitSeoUrl from '../assets/textures/kit-SEO.jpg';
import kitAwaySeoUrl from '../assets/textures/kit-away-SEO.jpg';
import kitMumUrl from '../assets/textures/kit-MUM.jpg';
import kitAwayMumUrl from '../assets/textures/kit-away-MUM.jpg';
import kitCaiUrl from '../assets/textures/kit-CAI.jpg';
import kitAwayCaiUrl from '../assets/textures/kit-away-CAI.jpg';
import kitLagUrl from '../assets/textures/kit-LAG.jpg';
import kitAwayLagUrl from '../assets/textures/kit-away-LAG.jpg';
import kitSmbUrl from '../assets/textures/kit-SMB.jpg';
import kitAwaySmbUrl from '../assets/textures/kit-away-SMB.jpg';
import kitNapUrl from '../assets/textures/kit-NAP.jpg';
import kitAwayNapUrl from '../assets/textures/kit-away-NAP.jpg';

export const GRASS_DAY_URL = grassDayUrl;
export const GRASS_NIGHT_URL = grassNightUrl;
export const CROWD_DAY_URL = crowdDayUrl;
export const CROWD_NIGHT_URL = crowdNightUrl;
export const CONCOURSE_URL = concourseUrl;
export const ADBOARDS_URL = adboardsUrl;

/** Kit texture URL by `${ABBR}|${primary}` (primary lower-cased).
 *  Away keys use the club's SECONDARY colour: no club defines
 *  awayPrimary, so clubKit(away) builds primary = secondary. */
const KIT_TEXTURE_URLS: Record<string, string> = {
  'RMA|#f8fafc': kitRmaUrl, 'RMA|#febe10': kitAwayRmaUrl,
  'BAR|#a50044': kitBarUrl, 'BAR|#004d98': kitAwayBarUrl,
  'MCI|#6cabdd': kitMciUrl, 'MCI|#1c2c5b': kitAwayMciUrl,
  'LIV|#c8102e': kitLivUrl, 'LIV|#f0b323': kitAwayLivUrl,
  'ARS|#ef0107': kitArsUrl, 'ARS|#f8fafc': kitAwayArsUrl,
  'PSG|#004170': kitPsgUrl, 'PSG|#da291c': kitAwayPsgUrl,
  'FCB|#dc052d': kitFcbUrl, 'FCB|#f8fafc': kitAwayFcbUrl,
  'INT|#0068a8': kitIntUrl, 'INT|#020617': kitAwayIntUrl,
  'ACM|#fb090b': kitAcmUrl, 'ACM|#111827': kitAwayAcmUrl,
  'JUV|#111827': kitJuvUrl, 'JUV|#f8fafc': kitAwayJuvUrl,
  'BVB|#fde100': kitBvbUrl, 'BVB|#111827': kitAwayBvbUrl,
  'NSR|#ffdd00': kitNsrUrl, 'NSR|#0038a8': kitAwayNsrUrl,
  'MIA|#f7b5cd': kitMiaUrl, 'MIA|#111827': kitAwayMiaUrl,
  'CHE|#034694': kitCheUrl, 'CHE|#f8fafc': kitAwayCheUrl,
  'UTD|#da291c': kitUtdUrl, 'UTD|#fbe122': kitAwayUtdUrl,
  'ATM|#cb3524': kitAtmUrl, 'ATM|#f8fafc': kitAwayAtmUrl,
  'DHK|#059669': kitDhkUrl, 'DHK|#ef4444': kitAwayDhkUrl,
  'MNS|#38bdf8': kitMnsUrl, 'MNS|#0f172a': kitAwayMnsUrl,
  'CAT|#1d4ed8': kitCatUrl, 'CAT|#be123c': kitAwayCatUrl,
  'MDR|#f8fafc': kitMdrUrl, 'MDR|#d97706': kitAwayMdrUrl,
  'PAR|#1e3a8a': kitParUrl, 'PAR|#ef4444': kitAwayParUrl,
  'MUN|#dc2626': kitMunUrl, 'MUN|#f8fafc': kitAwayMunUrl,
  'LON|#e11d48': kitLonUrl, 'LON|#ffffff': kitAwayLonUrl,
  'MIL|#1e40af': kitMilUrl, 'MIL|#020617': kitAwayMilUrl,
  'MRY|#b91c1c': kitMryUrl, 'MRY|#fbbf24': kitAwayMryUrl,
  'RIO|#991b1b': kitRioUrl, 'RIO|#111827': kitAwayRioUrl,
  'BPL|#ffffff': kitBplUrl, 'BPL|#dc2626': kitAwayBplUrl,
  'TKY|#0284c7': kitTkyUrl, 'TKY|#facc15': kitAwayTkyUrl,
  'CTG|#0ea5e9': kitCtgUrl, 'CTG|#facc15': kitAwayCtgUrl,
  'SYL|#7c3aed': kitSylUrl, 'SYL|#f8fafc': kitAwaySylUrl,
  'KHU|#b45309': kitKhuUrl, 'KHU|#111827': kitAwayKhuUrl,
  'RAJ|#be185d': kitRajUrl, 'RAJ|#facc15': kitAwayRajUrl,
  'BSL|#ea580c': kitBslUrl, 'BSL|#111827': kitAwayBslUrl,
  'COX|#0891b2': kitCoxUrl, 'COX|#f8fafc': kitAwayCoxUrl,
  'SAM|#1e40af': kitSamUrl, 'SAM|#dc2626': kitAwaySamUrl,
  'SEO|#dc2626': kitSeoUrl, 'SEO|#facc15': kitAwaySeoUrl,
  'MUM|#f97316': kitMumUrl, 'MUM|#1e3a8a': kitAwayMumUrl,
  'CAI|#facc15': kitCaiUrl, 'CAI|#b91c1c': kitAwayCaiUrl,
  'LAG|#16a34a': kitLagUrl, 'LAG|#f8fafc': kitAwayLagUrl,
  'SMB|#22c55e': kitSmbUrl, 'SMB|#facc15': kitAwaySmbUrl,
  'NAP|#12a0d7': kitNapUrl, 'NAP|#ffffff': kitAwayNapUrl,
};

export function kitTextureUrlFor(kit: KitColors): string | null {
  if (!kit.abbr) return null;
  return KIT_TEXTURE_URLS[`${kit.abbr}|${kit.primary.toLowerCase()}`] ?? null;
}

// --- Image loading (shared, cached, best-effort) ---------------------------
const imageCache = new Map<string, HTMLImageElement>();
const readyCallbacks = new Map<string, (() => void)[]>();

function loadImage(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const cbs = readyCallbacks.get(url);
      if (cbs) { readyCallbacks.delete(url); for (const cb of cbs) cb(); }
    };
    img.onerror = () => { /* keep the procedural fallback; no retry storm */ };
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

/** The kit's photo texture if it has finished loading, else null.
 *  Starts the load on first use; callers repaint when it arrives. */
export function kitTextureImageFor(kit: KitColors): HTMLImageElement | null {
  const url = kitTextureUrlFor(kit);
  if (!url) return null;
  const img = loadImage(url);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Run `cb` once the kit photo for `url` has loaded (immediately if
 *  it already has). Used to repaint an atlas tile that was first
 *  painted with procedural art. */
export function onKitTextureReady(url: string, cb: () => void): void {
  const img = loadImage(url);
  if (img.complete && img.naturalWidth > 0) { cb(); return; }
  const list = readyCallbacks.get(url) ?? [];
  list.push(cb);
  readyCallbacks.set(url, list);
}

/** Warm the kit image cache as soon as this module is imported, so
 *  the photos are usually decoded before the first rig is built. */
export function preloadKitTextures(): void {
  if (typeof Image === 'undefined') return;
  for (const url of Object.values(KIT_TEXTURE_URLS)) loadImage(url);
}
preloadKitTextures();

/** Load a photo URL as a THREE texture, downscaled through a canvas to
 *  at most maxW x maxH (the 4096px sources are never uploaded to the
 *  GPU at full size — LOW/MEDIUM get 1024px, HIGH/ULTRA 2048px).
 *  Resolves to null on any load failure so callers keep their fallback. */
export function loadPhotoTexture(
  url: string,
  maxW: number,
  maxH: number,
  anisotropy = 4,
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const img = loadImage(url);
    const finish = () => {
      if (!img.naturalWidth) { resolve(null); return; }
      try {
        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.max(2, Math.round(img.naturalWidth * scale));
        const h = Math.max(2, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropy;
        resolve(tex);
      } catch {
        resolve(null);
      }
    };
    if (img.complete) finish();
    else {
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', () => resolve(null), { once: true });
    }
  });
}

/** Crop a horizontal band out of a loaded photo (sy..sy+sh of the
 *  source image) into a tileable canvas texture — used for the crowd
 *  tiers, where only a few rows of spectators fit a 4.4 m stand tier. */
export function bandTextureFromImage(
  img: HTMLImageElement,
  sy: number,
  sh: number,
  outW: number,
  outH: number,
  repeatX: number,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const g = canvas.getContext('2d')!;
  g.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, outW, outH);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, 1);
  tex.anisotropy = 4;
  return tex;
}

/** Resolve a photo URL to a loaded image (for band textures). */
export function loadPhotoImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = loadImage(url);
    if (img.complete) { resolve(img.naturalWidth > 0 ? img : null); return; }
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}
