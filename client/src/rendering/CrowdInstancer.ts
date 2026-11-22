// Striker FC — rendering/CrowdInstancer.ts (Phase 02, Spec 07 §2)
// ONE GPU InstancedMesh of stylized spectators on the stadium tiers.
// Team-coloured shirts via instanceColor, idle bobbing, goal-wave jumps.
import * as THREE from 'three';

export interface CrowdBuild {
  mesh: THREE.InstancedMesh;
  update: (time: number, dt: number) => void;
  triggerGoalWave: () => void;
  setBudget: (count: number) => void;
}

interface Fan { x: number; y: number; z: number; phase: number; speed: number }

export function buildCrowd(homeColor: string, awayColor: string, maxCount = 4000): CrowdBuild {
  // Low-poly spectator: torso box + head merged into one geometry via two boxes
  // combined with BufferGeometryUtils-free manual merge (two groups in one geometry
  // is not possible — use a single capsule-ish box + separate head instancing is
  // avoided by baking both boxes into one BufferGeometry).
  const torso = new THREE.BoxGeometry(0.42, 0.62, 0.26);
  torso.translate(0, 0.31, 0);
  const head = new THREE.BoxGeometry(0.24, 0.26, 0.24);
  head.translate(0, 0.78, 0);
  const geo = mergeBoxes(torso, head);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const mesh = new THREE.InstancedMesh(geo, mat, maxCount);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const fans: Fan[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const home = new THREE.Color(homeColor);
  const away = new THREE.Color(awayColor);
  const neutrals = ['#e2e8f0', '#facc15', '#38bdf8', '#f472b6', '#a3e635', '#fb923c'].map((c) => new THREE.Color(c));

  // Tier layout mirrors StadiumBuilder stands: 4 sides × 3 tiers × rows.
  const sides: { axis: 'x' | 'z'; sign: number; dist: number }[] = [
    { axis: 'z', sign: 1, dist: 0 }, { axis: 'z', sign: -1, dist: 0 },
    { axis: 'x', sign: 1, dist: 0 }, { axis: 'x', sign: -1, dist: 0 },
  ];
  let idx = 0;
  outer: for (const side of sides) {
    for (let tier = 0; tier < 3; tier += 1) {
      const rows = 5;
      for (let row = 0; row < rows; row += 1) {
        const along = side.axis === 'z' ? 118 : 82;
        const step = 0.85;
        const n = Math.floor(along / step);
        for (let i = 0; i < n; i += 1) {
          if (idx >= maxCount) break outer;
          const t = (i / Math.max(1, n - 1) - 0.5) * along;
          const radial = 46 + tier * 7 + row * 1.15;
          const y = 4.2 + tier * 4.6 + row * 0.62;
          const jitter = () => (Math.sin(idx * 12.9898) * 43758.5453) % 1 * 0.3;
          let x = 0; let z = 0;
          if (side.axis === 'z') { x = t + jitter(); z = side.sign * radial; } else { z = t + jitter(); x = side.sign * (radial + 8); }
          fans.push({ x, y, z, phase: (idx * 0.37) % (Math.PI * 2), speed: 1.4 + ((idx * 7) % 10) / 8 });
          // Colour: ends behind goals lean to the team attacking that side.
          const r = Math.abs(Math.sin(idx * 78.233) * 43758.5453) % 1;
          if (side.axis === 'x') color.copy(side.sign > 0 ? away : home).offsetHSL(0, 0, (r - 0.5) * 0.12);
          else if (r < 0.55) color.copy(home).offsetHSL(0, 0, (r - 0.5) * 0.12);
          else color.copy(neutrals[idx % neutrals.length]!);
          mesh.setColorAt(idx, color);
          idx += 1;
        }
      }
    }
  }
  const total = fans.length;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  let budget = total;
  let waveTime = -10;
  let elapsed = 0;

  const update = (time: number, dt: number) => {
    elapsed += dt;
    const sinceWave = elapsed - waveTime;
    const waving = sinceWave >= 0 && sinceWave < 2.6;
    for (let i = 0; i < budget; i += 1) {
      const f = fans[i]!;
      let yOff = Math.sin(time * f.speed + f.phase) * 0.05;
      if (waving) {
        // Travelling wave: jump peaks sweep along X.
        const local = sinceWave * 22 - (f.x + 60);
        const bump = Math.exp(-local * local * 0.08);
        yOff += Math.abs(Math.sin(sinceWave * 10 + f.phase)) * 0.55 * bump + bump * 0.3;
      }
      dummy.position.set(f.x, f.y + yOff, f.z);
      dummy.rotation.set(0, f.z > 44 || f.z < -44 ? (f.z > 0 ? Math.PI : 0) : (f.x > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = budget;
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    mesh,
    update,
    triggerGoalWave: () => { waveTime = elapsed; },
    setBudget: (count: number) => { budget = Math.max(0, Math.min(total, Math.floor(count))); },
  };
}

/** Minimal two-box merge (positions + normals + index) — no external utils needed. */
function mergeBoxes(a: THREE.BoxGeometry, b: THREE.BoxGeometry): THREE.BufferGeometry {
  const geos = [a.toNonIndexed(), b.toNonIndexed()];
  const pos: number[] = []; const nor: number[] = [];
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 1) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
