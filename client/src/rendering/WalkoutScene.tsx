// Striker FC — rendering/WalkoutScene.tsx (Epic fix round, P0-2)
// The real 3D walkout that replaces the 2D pre-match panels on MEDIUM+
// tiers: both XIs walk out of a floodlit tunnel in two files, line up
// shoulder to shoulder, then spread into formation as the camera pulls
// wide to the broadcast view. Eight seconds, skippable at any moment.
// LOW keeps the 2D walkout card (PreMatchScreen decides). All geometry is
// procedural; the players are the real PlayerRigs in the match kits.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PlayerTemplate } from '../core/types';
import { buildPlayerRig, kitFor, type KitColors } from './PlayerRig';
import { PlayerAnimator } from './PlayerAnimator';

export const WALKOUT_DURATION_SEC = 8;

export interface WalkoutSceneProps {
  homeXI: PlayerTemplate[];
  awayXI: PlayerTemplate[];
  homeKit: KitColors;
  awayKit: KitColors;
  onDone: () => void;
}

interface Walker {
  animator: PlayerAnimator;
  rig: ReturnType<typeof buildPlayerRig>;
  group: THREE.Group;
  /** Keyframe positions: tunnel start → line-up spot → formation spot. */
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
}

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function WalkoutScene({ homeXI, awayXI, homeKit, awayKit, onDone }: WalkoutSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finishedRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      doneRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05080f');
    scene.fog = new THREE.Fog('#05080f', 30, 95);
    const camera = new THREE.PerspectiveCamera(46, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 220);
    camera.position.set(0, 2.4, -36);

    scene.add(new THREE.AmbientLight('#8fb4ff', 0.55));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(6, 14, 10);
    scene.add(key);
    const tunnelGlow = new THREE.PointLight('#cfe8ff', 60, 40);
    tunnelGlow.position.set(0, 3.4, 2);
    scene.add(tunnelGlow);

    // Pitch apron.
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 70),
      new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0, 16);
    scene.add(grass);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8f2ff' });
    const halfway = new THREE.Mesh(new THREE.PlaneGeometry(44, 0.18), lineMat);
    halfway.rotation.x = -Math.PI / 2;
    halfway.position.set(0, 0.02, 10);
    scene.add(halfway);

    // Tunnel: dark walls + ceiling with light strips, bright mouth at z=0.
    const wallMat = new THREE.MeshStandardMaterial({ color: '#131c2e', roughness: 0.9 });
    const mkWall = (x: number, ry: number) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 4.6), wallMat);
      wall.position.set(x, 2.3, -17);
      wall.rotation.y = ry;
      scene.add(wall);
    };
    mkWall(-3.4, Math.PI / 2);
    mkWall(3.4, -Math.PI / 2);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 34), wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.6, -17);
    scene.add(ceiling);
    const stripMat = new THREE.MeshBasicMaterial({ color: '#bfe0ff' });
    for (let i = 0; i < 5; i += 1) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.28), stripMat);
      strip.rotation.x = Math.PI / 2;
      strip.position.set(0, 4.55, -30 + i * 7);
      scene.add(strip);
    }
    const mouth = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 5),
      new THREE.MeshBasicMaterial({ color: '#0d1526' }),
    );
    mouth.position.set(0, 2.5, 0.4);
    scene.add(mouth);

    // The two teams, in files, then line-up, then formation.
    const walkers: Walker[] = [];
    const addTeam = (xi: PlayerTemplate[], kit: KitColors, gkKind: 'HOME_GK' | 'AWAY_GK', fileX: number, lineUpZ: number, dir: number) => {
      xi.slice(0, 11).forEach((tpl, i) => {
        const isGk = tpl.position === 'GK';
        const rig = buildPlayerRig(
          tpl.appearance,
          isGk ? kitFor(gkKind, homeKit, awayKit) : kit,
          tpl.shirtNumber ?? i + 1,
          tpl.shortName,
          'FULL',
          { gk: isGk }, // keepers walk out in long sleeves (spec §1.6.5)
        );
        const p0 = new THREE.Vector3(fileX, 0, -30 + i * 1.15);
        const p1 = new THREE.Vector3(-13.75 + i * 2.75, 0, lineUpZ);
        const p2 = new THREE.Vector3(-16 + (i % 4) * 10.5 + Math.floor(i / 4) * 2, 0, lineUpZ + dir * (4 + Math.floor(i / 4) * 4.5));
        rig.group.position.copy(p0);
        rig.group.rotation.y = 0; // face +z, out of the tunnel
        scene.add(rig.group);
        walkers.push({ animator: new PlayerAnimator(tpl.preferredFoot), rig, group: rig.group, p0, p1, p2 });
      });
    };
    addTeam(homeXI, homeKit, 'HOME_GK', -1.1, 6, 1);
    addTeam(awayXI, awayKit, 'AWAY_GK', 1.1, 8.6, 1);

    const camKeys = [
      { t: 0, pos: new THREE.Vector3(0, 2.4, -37), look: new THREE.Vector3(0, 1.4, -8) },
      { t: 3, pos: new THREE.Vector3(0, 2.8, -9), look: new THREE.Vector3(0, 1.3, 7) },
      { t: 5.5, pos: new THREE.Vector3(-7, 3.4, -4), look: new THREE.Vector3(0, 1.2, 7) },
      { t: 8, pos: new THREE.Vector3(0, 13, -16), look: new THREE.Vector3(0, 0.6, 9) },
    ];
    const camPos = (t: number, out: THREE.Vector3, lookOut: THREE.Vector3) => {
      let a = camKeys[0]!;
      let b = camKeys[camKeys.length - 1]!;
      for (let i = 0; i < camKeys.length - 1; i += 1) {
        if (t >= camKeys[i]!.t && t <= camKeys[i + 1]!.t) {
          a = camKeys[i]!;
          b = camKeys[i + 1]!;
          break;
        }
      }
      const span = Math.max(0.001, b.t - a.t);
      const k = easeInOut(clamp01((t - a.t) / span));
      out.lerpVectors(a.pos, b.pos, k);
      lookOut.lerpVectors(a.look, b.look, k);
    };

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      elapsed += dt;
      const t = elapsed;
      for (const w of walkers) {
        let pos: THREE.Vector3;
        let state: 'JOG' | 'IDLE';
        if (t < 3) {
          // Tunnel → mouth: files advance, easing out as they emerge.
          const k = easeInOut(clamp01(t / 3));
          pos = w.p0.clone().lerp(w.p1, k * 0.55);
          state = 'JOG';
          w.group.rotation.y = 0;
        } else if (t < 5.5) {
          const k = easeInOut(clamp01((t - 3) / 2.5));
          pos = w.p0.clone().lerp(w.p1, 0.55 + k * 0.45);
          state = k >= 1 ? 'IDLE' : 'JOG';
          if (k >= 1) w.group.rotation.y = 0; // line-up faces the tunnel camera
        } else {
          const k = easeInOut(clamp01((t - 5.5) / 2.5));
          pos = w.p1.clone().lerp(w.p2, k);
          state = k >= 1 ? 'IDLE' : 'JOG';
          if (k < 1) {
            const dx = w.p2.x - w.p1.x;
            const dz = w.p2.z - w.p1.z;
            if (Math.abs(dx) + Math.abs(dz) > 0.05) w.group.rotation.y = Math.atan2(dx, dz);
          }
        }
        w.group.position.copy(pos);
        w.animator.setState(state);
        w.animator.update(w.rig, dt, state === 'JOG' ? 2.2 : 0);
      }
      camPos(t, desired, look);
      camera.position.lerp(desired, 1 - Math.exp(-3.2 * dt));
      camera.lookAt(look);
      renderer.render(scene, camera);
      if (t >= WALKOUT_DURATION_SEC && !finishedRef.current) {
        finishedRef.current = true;
        doneRef.current();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      host.replaceChildren();
    };
    // Mounted once per walkout; props are the launch-time XIs/kits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="absolute inset-0" role="img" aria-label="3D walkout: both teams emerge from the tunnel and line up" />;
}
