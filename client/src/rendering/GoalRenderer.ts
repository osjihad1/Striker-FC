// Striker FC — rendering/GoalRenderer.ts (Phase 02, Spec 04 §3 Net Geometry)
// Regulation 7.32 × 2.44m goals, 2.2m deep, with a segmented net whose
// vertices are exposed for Phase 03 NetPhysics binding.
import * as THREE from 'three';
import { PITCH } from '../core/constants';

export interface GoalBuild {
  group: THREE.Group;
  /** Net vertex positions (local space) — Phase 03 NetPhysics writes into this array. */
  netPositions: Float32Array;
  netGeometry: THREE.BufferGeometry;
  side: 'LEFT' | 'RIGHT';
  update: (time: number) => void;
}

const NET_SEG_X = 14;
const NET_SEG_Y = 8;
const NET_SEG_Z = 5;

function tube(from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

export function buildGoal(side: 'LEFT' | 'RIGHT'): GoalBuild {
  const group = new THREE.Group();
  const dirSign = side === 'LEFT' ? -1 : 1; // goal mouth faces pitch centre
  const gx = dirSign * PITCH.HALF_LENGTH;
  group.position.set(gx, 0, 0);

  const hw = PITCH.GOAL_HALF_WIDTH;
  const h = PITCH.GOAL_HEIGHT;
  const depth = PITCH.GOAL_DEPTH;
  const r = PITCH.POST_RADIUS;
  const backX = dirSign * depth; // extends behind the line, away from centre
  const frameMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.28, metalness: 0.75 });

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Posts + crossbar.
  group.add(tube(v(0, 0, -hw), v(0, h, -hw), r, frameMat));
  group.add(tube(v(0, 0, hw), v(0, h, hw), r, frameMat));
  group.add(tube(v(0, h, -hw), v(0, h, hw), r, frameMat));
  // Top back bar + back stanchions + ground rails.
  group.add(tube(v(backX, h * 0.82, -hw), v(backX, h * 0.82, hw), r * 0.8, frameMat));
  group.add(tube(v(0, h, -hw), v(backX, h * 0.82, -hw), r * 0.8, frameMat));
  group.add(tube(v(0, h, hw), v(backX, h * 0.82, hw), r * 0.8, frameMat));
  group.add(tube(v(backX, 0, -hw), v(backX, h * 0.82, -hw), r * 0.8, frameMat));
  group.add(tube(v(backX, 0, hw), v(backX, h * 0.82, hw), r * 0.8, frameMat));
  group.add(tube(v(0, 0.02, -hw), v(backX, 0.02, -hw), r * 0.7, frameMat));
  group.add(tube(v(0, 0.02, hw), v(backX, 0.02, hw), r * 0.7, frameMat));
  group.add(tube(v(backX, 0.02, -hw), v(backX, 0.02, hw), r * 0.7, frameMat));

  // --- Net: back + roof + two sides as one indexed plane set --------------
  // Vertices laid out in panels; netPositions is the live array NetPhysics will displace.
  const positions: number[] = [];
  const indices: number[] = [];
  const panel = (corner: (u: number, w: number) => [number, number, number], nu: number, nw: number) => {
    const base = positions.length / 3;
    for (let j = 0; j <= nw; j += 1) {
      for (let i = 0; i <= nu; i += 1) {
        const [x, y, z] = corner(i / nu, j / nw);
        positions.push(x, y, z);
      }
    }
    for (let j = 0; j < nw; j += 1) {
      for (let i = 0; i < nu; i += 1) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1; const c = a + nu + 1; const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  };
  const topY = h; const backTopY = h * 0.82;
  // Back panel.
  panel((u, w) => [backX, w * backTopY, -hw + u * hw * 2], NET_SEG_X, NET_SEG_Y);
  // Roof panel (sloped).
  panel((u, w) => [backX * w, backTopY + (topY - backTopY) * (1 - w), -hw + u * hw * 2], NET_SEG_X, NET_SEG_Z);
  // Side panels.
  panel((u, w) => [backX * u, w * (backTopY + (topY - backTopY) * (1 - u)), -hw], NET_SEG_Z, NET_SEG_Y);
  panel((u, w) => [backX * u, w * (backTopY + (topY - backTopY) * (1 - u)), hw], NET_SEG_Z, NET_SEG_Y);

  const netGeometry = new THREE.BufferGeometry();
  const netPositions = new Float32Array(positions);
  netGeometry.setAttribute('position', new THREE.BufferAttribute(netPositions, 3));
  netGeometry.setIndex(indices);
  netGeometry.computeVertexNormals();
  const netMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0', wireframe: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const net = new THREE.Mesh(netGeometry, netMat);
  group.add(net);

  return {
    group, netPositions, netGeometry, side,
    update: () => { /* Phase 02: net is static; Phase 03 NetPhysics displaces netPositions. */ },
  };
}
