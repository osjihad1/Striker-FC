// Striker FC — rendering/PlayerShowcase.tsx
// The 3D player showcase: the real PlayerRig on a lit podium, slowly
// rotating under stadium lights, cycling match animations (idle with the
// foot resting on the ball → jog → SHOOT → the player's own celebration)
// with a paneled ball at its feet. Used in the Lobby hero (the captain)
// and in Player Detail, so the human-shaped model is the first thing the
// manager sees — not a flat card. If the device refuses WebGL here, it
// falls back to the procedural SVG portrait instead of a black box: the
// lobby never blanks for a decorative canvas.
//
// Realistic-models pass (spec §4.2/§4.3): the showcase builds the rig at
// the HERO detail tier (LOW phones fall back per `lowFallback`), the
// camera pulled back to 4.35 m for the taller new silhouette, and the
// cycle shows the SHOOT state — shooting is what the user judges.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlayerTemplate } from '../core/types';
import { buildPlayerRig, isSharedRigMaterial, type KitColors, type RigDetail } from './PlayerRig';
import { PlayerAnimator, type AnimState } from './PlayerAnimator';
import { settingsStore } from '../store/useSettingsStore';
import { BallRenderer } from './BallRenderer';
import { AthletePortrait } from '../ui/components/PlayerCard';

/** The showcase cycle (spec §2.6.5): idle → jog → SHOOT → the player's
 *  own celebration. KICK stays in the cycle only for SIU celebrators. */
function cycleFor(template: PlayerTemplate): { state: AnimState; holdSec: number }[] {
  const celebration = (template.celebration ?? 'CELEBRATE_FIST_PUMP') as AnimState;
  const cycle: { state: AnimState; holdSec: number }[] = [
    { state: 'IDLE', holdSec: 2.4 },
    { state: 'JOG', holdSec: 2.6 },
    { state: 'SHOOT', holdSec: 1.6 },
  ];
  if (celebration === 'CELEBRATE_SIU') cycle.push({ state: 'KICK', holdSec: 1.4 });
  cycle.push({ state: celebration, holdSec: 2.8 });
  return cycle;
}

export function PlayerShowcase({
  template, kit, shirtNumber, height = 300, label, framing = 'FULL', lowFallback = 'LOW',
}: {
  template: PlayerTemplate;
  kit: KitColors;
  shirtNumber: number;
  height?: number;
  label?: string;
  /** Epic P0-4: 'FACE' frames a slow-orbit close-up on the head so the
   *  player's face morphs / beard / hair are actually visible. */
  framing?: 'FULL' | 'FACE';
  /** Which rig tier a LOW-graphics phone gets here: the lobby degrades
   *  to LOW, the player-detail stage keeps FULL (spec §4.3.5). */
  lowFallback?: 'LOW' | 'FULL';
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const templateRef = useRef(template);
  templateRef.current = template;
  const kitRef = useRef(kit);
  kitRef.current = kit;
  const numberRef = useRef(shirtNumber);
  numberRef.current = shirtNumber;
  // Rebuild the stage when the showcased player changes (captain swaps,
  // a different card opened in Player Detail, home/away kit toggle).
  const stageKey = `${template.id}:${shirtNumber}:${kit.primary}:${kit.secondary}:${kit.shorts}:${framing}:${lowFallback}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) return;
    // P1-12: the showcase respects the LOW tier — no antialias buffer,
    // DPR 1, and the culled-detail rig — so a LOW phone never pays
    // flagship prices for a lobby decoration.
    const lowTier = settingsStore.getState().graphicsQuality === 'LOW';
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lowTier, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const tpl = templateRef.current;
    renderer.setPixelRatio(lowTier ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 300, host.clientHeight || height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, (host.clientWidth || 300) / (host.clientHeight || height), 0.1, 60);
    if (framing === 'FACE') {
      camera.position.set(0.3, 1.95, 1.2);
      camera.lookAt(0, 1.9, 0);
    } else {
      // Pulled back 10% (spec §4.2.2): the new rig reads ~0.06 m taller
      // with the trapezius, hair volume and lathe boots.
      camera.position.set(0.55, 1.38, 4.35);
      camera.lookAt(0, 0.92, 0);
    }

    // Stadium lighting: cool key floodlight, warm rim, soft fill + hemi.
    const key = new THREE.DirectionalLight('#e8f2ff', 2.6);
    key.position.set(2.6, 4.4, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.6; key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.6; key.shadow.camera.bottom = -0.4;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#f5c542', 1.5);
    rim.position.set(-2.8, 2.6, -2.6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight('#a3e635', 0.5);
    fill.position.set(-2.2, 1.2, 2.8);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight('#bcd7ff', '#14251a', 0.65));

    // Podium: a floodlit grass disc on a dark plinth with a gold trim ring.
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.06, 1.18, 0.16, 40),
      new THREE.MeshStandardMaterial({ color: '#0d1526', roughness: 0.5, metalness: 0.35 }),
    );
    plinth.position.y = -0.08;
    plinth.receiveShadow = true;
    scene.add(plinth);
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(1.06, 0.016, 8, 48),
      new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.3, metalness: 0.7 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.005;
    scene.add(trim);
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(1.04, 40),
      new THREE.MeshStandardMaterial({ color: '#1d4d24', roughness: 0.95 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.006;
    grass.receiveShadow = true;
    scene.add(grass);

    const detail: RigDetail = lowTier ? lowFallback : 'HERO';
    const rig = buildPlayerRig(tpl.appearance, kitRef.current, numberRef.current, tpl.shortName, detail);
    rig.setShadowVisible(false); // the podium shadow comes from the key light
    scene.add(rig.group);
    const animator = new PlayerAnimator(tpl.preferredFoot);
    animator.ballRest = true; // idle = foot resting on the ball (spec §2.2)
    const ball = new BallRenderer();
    // The ball rides WITH the rig (front-right of the feet) so the
    // resting foot stays on it while the podium turntable rotates.
    ball.setPosition(0.2, 0.11, 0.3);
    rig.group.add(ball.group);
    const cycle = cycleFor(tpl);

    const resize = new ResizeObserver(() => {
      const w = host.clientWidth || 300;
      const h = host.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resize.observe(host);

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let lastRafAt = performance.now();
    const frame = (now: number) => {
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0, rawDt)) : 0;
      elapsed += dt;
      // Animation cycle: hold each state, then advance.
      let acc = 0;
      let idx = 0;
      const cycleTotal = cycle.reduce((a, c) => a + c.holdSec, 0);
      const tInCycle = elapsed % cycleTotal;
      for (let i = 0; i < cycle.length; i += 1) {
        if (tInCycle < acc + cycle[i]!.holdSec) { idx = i; break; }
        acc += cycle[i]!.holdSec;
        idx = i;
      }
      const state = cycle[idx]!.state;
      if (state === 'KICK' && animator.state !== 'KICK') animator.triggerKick();
      else if (state === 'SHOOT' && animator.state !== 'SHOOT') animator.triggerShoot();
      else if (state !== 'KICK' && state !== 'SHOOT') animator.setState(state);
      animator.update(rig, dt, state === 'JOG' ? 3.4 : 0);
      if (framing === 'FACE') {
        // Slow orbit around the head; the rig holds still so the face
        // stays framed (head world height ≈ 1.9 m on the podium rig).
        // The orbit slowed (spec §4.2.2): the face has detail worth seeing.
        rig.group.rotation.y = 0.15;
        const a = elapsed * 0.25;
        camera.position.set(Math.sin(a) * 0.62, 1.95 + Math.sin(elapsed * 0.22) * 0.05, Math.cos(a) * 1.18);
        camera.lookAt(0, 1.9, 0);
      } else {
        rig.group.rotation.y = Math.sin(elapsed * 0.45) * 0.85 + 0.35;
      }
      ball.update(dt);
      renderer.render(scene, camera);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      lastRafAt = now;
      frame(now);
    };
    raf = requestAnimationFrame(loop);
    // Same rAF-starvation watchdog as the stadium: if the WebView stops
    // delivering frames to this canvas, drive it from a timer instead.
    let driveTimer: number | null = null;
    const watchdog = window.setInterval(() => {
      const starved = performance.now() - lastRafAt > 400;
      if (starved && driveTimer === null) {
        driveTimer = window.setInterval(() => frame(performance.now()), 16);
      } else if (!starved && driveTimer !== null) {
        window.clearInterval(driveTimer);
        driveTimer = null;
      }
    }, 200);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(watchdog);
      if (driveTimer !== null) window.clearInterval(driveTimer);
      resize.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          // Shared rig materials (the atlases!) belong to every rig —
          // disposing one here would break the match scene's textures.
          if (isSharedRigMaterial(mat)) continue;
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey, failed]);

  if (failed) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ height }}
        role="img"
        aria-label={label ?? `${template.name} 3D showcase unavailable on this device — portrait shown instead`}
      >
        <div className="h-full max-w-[220px]">
          <AthletePortrait
            appearance={template.appearance}
            primary={kit.primary}
            secondary={kit.secondary}
            label={`${template.name} portrait`}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="relative w-full"
      style={{ height }}
      role="img"
      aria-label={label ?? `${template.name} — rotating 3D player showcase on a podium`}
    />
  );
}
