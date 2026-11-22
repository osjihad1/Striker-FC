// Striker FC — core/math.ts
// Zero-allocation Vec3 helpers (out-parameter style) + scalar helpers. Blueprint 02/04.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyVec3(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

export function addScaled(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  out.x = ay * b.z - az * b.y;
  out.y = az * b.x - ax * b.z;
  out.z = ax * b.y - ay * b.x;
  return out;
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: Vec3): number {
  return Math.sqrt(lengthSq(a));
}

const EPSILON = 1e-9;

/**
 * Normalize in place with a zero-vector guard: a zero (or near-zero / NaN) vector
 * stays zero instead of producing NaN components. Returns the original length.
 */
export function normalizeSafe(v: Vec3): number {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (!Number.isFinite(len) || len < EPSILON) {
    v.x = 0;
    v.y = 0;
    v.z = 0;
    return 0;
  }
  const inv = 1 / len;
  v.x *= inv;
  v.y *= inv;
  v.z *= inv;
  return len;
}

/** Normalize `a` into `out` (out may alias a). Zero-safe. Returns original length. */
export function normalizeTo(out: Vec3, a: Vec3): number {
  copyVec3(out, a);
  return normalizeSafe(out);
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing (Unity-style SmoothDamp without velocity state). */
export function smoothDamp(current: number, target: number, smoothing: number, dt: number): number {
  if (!(dt > 0)) return current;
  const lambda = Math.max(0, smoothing);
  const factor = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * factor;
}

/** Signed smallest angle (radians) from direction a to direction b in the XZ ground plane. */
export function angleBetween2D(ax: number, az: number, bx: number, bz: number): number {
  const la = Math.sqrt(ax * ax + az * az);
  const lb = Math.sqrt(bx * bx + bz * bz);
  if (la < EPSILON || lb < EPSILON) return 0;
  const d = clamp((ax * bx + az * bz) / (la * lb), -1, 1);
  const angle = Math.acos(d);
  const crossY = az * bx - ax * bz;
  return crossY < 0 ? -angle : angle;
}

/** Absolute angle (radians, 0..π) between two 2D direction vectors. Zero-safe. */
export function angleMagnitude2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(angleBetween2D(ax, az, bx, bz));
}

/** Deterministic PRNG (mulberry32) — same seed, same database, every device. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  const item = items[idx];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}
