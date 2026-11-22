// Striker FC — rendering/StadiumScene.tsx (Phase 02)
// React host for the full 3D stadium: SceneManager + pitch + stadium + crowd
// + goals + ball + overlays + 22 articulated players in 4-3-3 formations.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager, type WeatherPreset } from './SceneManager';
import { buildPitch } from './PitchBuilder';
import { buildStadium } from './StadiumBuilder';
import { buildCrowd } from './CrowdInstancer';
import { buildGoal } from './GoalRenderer';
import { buildPlayerRig, countRigDrawMeshes, isSharedRigMaterial, kitFor, type KitColors, type RigDetail } from './PlayerRig';
import { PlayerAnimator, type AnimState } from './PlayerAnimator';
import { perfTelemetry } from './PerfTelemetry';
import { BallRenderer } from './BallRenderer';
import { FieldOverlays } from './FieldOverlays';
import { CameraController, type CameraMode } from './CameraController';
import { getFormationById } from '../data/Formations';
import { getAllPlayers, getPlayerById } from '../data/PlayerDatabase';
import { SEED_CLUBS } from '../data/seedDatabase';
import type { PlayerTemplate } from '../core/types';
import type { GraphicsQuality } from '../store/useSettingsStore';
import { NetPhysics } from '../physics/NetPhysics';
import type { NetRegistry, PracticeRenderState } from '../physics/PracticeEngine';
import type { ScrimmageRenderState } from '../ai/ScrimmageEngine';

export interface StadiumSceneProps {
  weather: WeatherPreset;
  quality: GraphicsQuality;
  /** Phase 10: 0..1 multiplier over the quality tier's crowd budget. */
  crowdDensity?: number;
  cameraMode: CameraMode;
  goalWaveSignal: number;
  kickSignal: number;
  demoAnim: AnimState;
  onFps: (fps: number) => void;
  /** Called when the WebGL pitch cannot start, so the app can drop the
   *  persisted graphics quality to LOW before the player retries. */
  onGlFailed?: () => void;
  /** Phase 03 practice sandbox: live render state + net registry (nullable). */
  practiceState?: PracticeRenderState | null;
  netRegistry?: NetRegistry | null;
  /** Phase 04 full 11v11 scrimmage: live render state for all 22 players. */
  scrimmageState?: ScrimmageRenderState | null;
  /** Phase 05 slow-mo goal replay: interpolated frames + camera angle (1|2). */
  replayState?: ScrimmageRenderState | null;
  replayAngle?: 1 | 2;
  /** Epic fix round (P0-6): live kit colours for both sides — when the
   *  manager plays AS a club (or hosts one), the 3D teams wear those kits;
   *  a change rebuilds the rigs in place, transforms preserved. */
  homeKitColors?: KitColors | null;
  awayKitColors?: KitColors | null;
}

interface Actor {
  rig: ReturnType<typeof buildPlayerRig>;
  animator: PlayerAnimator;
  baseX: number; baseZ: number; phase: number; patrol: number; yaw: number;
  /** Phase 06: identity for the live-substitution rig rebuild watch. */
  templateId: string;
  kit: KitColors;
  gkKind: 'HOME_GK' | 'AWAY_GK';
  isGk: boolean;
  shirtNumber: number;
  /** FC Mobile skin pass: floating name label sprite above the head. */
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  /** Realistic-models pass: this actor's current LOD tier (distance
   *  switching rebuilds the rig at most twice per 30-frame window). */
  detail: RigDetail;
}

/** Draw (or redraw) a player's name onto his label sprite canvas:
 *  small white bold text with a soft dark shadow, no pill — the
 *  reference match frame's bare floating name tag. */
function drawNameLabel(a: Pick<Actor, 'labelCanvas' | 'labelTexture'>, name: string): void {
  const canvas = a.labelCanvas;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = '700 30px Barlow, "Noto Sans Bengali", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 5;
  g.shadowOffsetY = 2;
  g.fillStyle = '#ffffff';
  g.fillText(name, canvas.width / 2, canvas.height / 2);
  a.labelTexture.needsUpdate = true;
}

function makeNameLabel(name: string): Pick<Actor, 'label' | 'labelCanvas' | 'labelTexture'> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 2;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const label = new THREE.Sprite(material);
  label.scale.set(3.6, 0.79, 1);
  label.renderOrder = 20;
  label.visible = false;
  const parts = { label, labelCanvas: canvas, labelTexture: texture };
  drawNameLabel(parts, name);
  return parts;
}

function pickSquads(): { home: PlayerTemplate[]; away: PlayerTemplate[] } {
  const formation = getFormationById('4-3-3-attack')!;
  const all = getAllPlayers();
  const used = new Set<string>();
  const pick = (): PlayerTemplate[] => formation.slots.map((slot) => {
    const found = all.find((p) => p.position === slot.role && !used.has(p.id))
      ?? all.find((p) => !used.has(p.id))!;
    used.add(found.id);
    return found;
  });
  return { home: pick(), away: pick() };
}

export function StadiumScene({ weather, quality, crowdDensity = 1, cameraMode, goalWaveSignal, kickSignal, demoAnim, onFps, onGlFailed, practiceState, netRegistry, scrimmageState, replayState, replayAngle, homeKitColors, awayKitColors }: StadiumSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // WebGL failure surface: a refused context (phone GPU/WebView limits) or a
  // mid-match context loss shows this panel with a LOW-graphics retry instead
  // of leaving a frozen black canvas — or worse, crashing the whole app.
  const [glError, setGlError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const apiRef = useRef<{
    scene: SceneManager; crowd: ReturnType<typeof buildCrowd>;
    stadium: ReturnType<typeof buildStadium>; camera: CameraController;
    pitch: ReturnType<typeof buildPitch>;
  } | null>(null);
  const propsRef = useRef({ cameraMode, demoAnim });
  propsRef.current = { cameraMode, demoAnim };
  const practiceRef = useRef<PracticeRenderState | null>(null);
  practiceRef.current = practiceState ?? null;
  const scrimmageRef = useRef<ScrimmageRenderState | null>(null);
  scrimmageRef.current = scrimmageState ?? null;
  const replayRef = useRef<ScrimmageRenderState | null>(null);
  replayRef.current = replayState ?? null;
  const replayAngleRef = useRef<1 | 2>(1);
  replayAngleRef.current = replayAngle ?? 1;
  const netsRef = useRef<NetRegistry | null>(null);
  netsRef.current = netRegistry ?? null;
  const kickRef = useRef({ active: false, t: 0 });
  const ballRef = useRef<BallRenderer | null>(null);
  const crowdDensityRef = useRef(crowdDensity);
  crowdDensityRef.current = crowdDensity;
  const kitsPropRef = useRef<{ home: KitColors | null; away: KitColors | null }>({ home: null, away: null });
  kitsPropRef.current = { home: homeKitColors ?? null, away: awayKitColors ?? null };
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Guarded construction: THREE.WebGLRenderer throws when the device
    // refuses a WebGL context. Catch it here so the failure becomes the
    // in-scene fallback panel (glError) instead of an uncaught effect error
    // that unmounts the entire app to a blank page.
    let sm: SceneManager;
    try {
      sm = new SceneManager(host, quality);
    } catch {
      host.replaceChildren();
      setGlError('This device refused the 3D pitch renderer (WebGL unavailable). LOW graphics uses the lightest settings — DPR 1, no shadows, no antialiasing — and works on phones that refuse the higher tiers.');
      return;
    }
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setGlError('The 3D view lost its graphics context — this happens on phones when the GPU is under memory pressure. Retry in LOW graphics to keep playing.');
    };
    sm.renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    const pitch = buildPitch(quality);
    sm.registerPitchMaterial(pitch.material);
    sm.scene.add(pitch.group);
    const stadium = buildStadium();
    sm.scene.add(stadium.group);
    const homeClub = SEED_CLUBS.find((c) => c.id === 'dhaka_tigers')!;
    const awayClub = SEED_CLUBS.find((c) => c.id === 'man_sky')!;
    const crowd = buildCrowd(homeClub.primary, awayClub.primary, 6000);
    crowd.setBudget(Math.round(sm.crowdBudget() * crowdDensityRef.current));
    sm.scene.add(crowd.mesh);
    const goalL = buildGoal('LEFT');
    const goalR = buildGoal('RIGHT');
    sm.scene.add(goalL.group, goalR.group);
    // Phase 03: mass-spring nets bound to the renderer's live vertex arrays.
    const netL = new NetPhysics(goalL.netPositions, 'LEFT');
    const netR = new NetPhysics(goalR.netPositions, 'RIGHT');
    if (netsRef.current) {
      netsRef.current.left = netL;
      netsRef.current.right = netR;
    }
    const ball = new BallRenderer();
    ball.setPosition(0, 0.11, 0);
    ball.setSpin({ x: 0, y: 1, z: 0 }, 1.2);
    sm.scene.add(ball.group);
    ballRef.current = ball;
    const overlays = new FieldOverlays();
    sm.scene.add(overlays.group);
    // Phase 08: Skill Games glowing markers (targets / gate posts / zones),
    // driven by scrimmageState.skillMarkers. Meshes are pooled by signature.
    const markerGroup = new THREE.Group();
    sm.scene.add(markerGroup);
    let markerSignature = '';
    const syncSkillMarkers = (markers: NonNullable<typeof scrimmageState>['skillMarkers'], t: number) => {
      const sig = markers.map((m) => m.kind).join(',');
      if (sig !== markerSignature) {
        markerSignature = sig;
        while (markerGroup.children.length > 0) {
          const child = markerGroup.children[0]!;
          markerGroup.remove(child);
          child.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              (o.material as THREE.Material).dispose();
            }
          });
        }
        for (const m of markers) {
          const mat = new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.9, depthWrite: false });
          let mesh: THREE.Mesh;
          if (m.kind === 'TARGET') {
            mesh = new THREE.Mesh(new THREE.TorusGeometry(m.radius, 0.09, 10, 28), mat);
            mesh.rotation.y = Math.PI / 2; // face down the pitch toward the taker
          } else if (m.kind === 'GATE') {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10), mat);
          } else {
            mesh = new THREE.Mesh(new THREE.RingGeometry(m.radius - 0.22, m.radius, 36), mat);
            mesh.rotation.x = -Math.PI / 2;
          }
          mesh.renderOrder = 5;
          markerGroup.add(mesh);
        }
      }
      markers.forEach((m, i) => {
        const mesh = markerGroup.children[i] as THREE.Mesh | undefined;
        if (!mesh) return;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(m.hit ? '#64748b' : m.color);
        mat.opacity = m.active ? 0.75 + Math.sin(t * 6) * 0.25 : 0.45;
        if (m.kind === 'GATE') mesh.position.set(m.x, 0.75, m.z);
        else if (m.kind === 'ZONE') mesh.position.set(m.x, 0.06, m.z);
        else mesh.position.set(m.x, m.y, m.z);
        const pulse = m.active ? 1 + Math.sin(t * 6) * 0.07 : 1;
        mesh.scale.setScalar(pulse);
      });
      markerGroup.visible = markers.length > 0;
    };
    // Phase 05: free-kick dotted trajectory preview line.
    const trajectoryGeo = new THREE.BufferGeometry();
    trajectoryGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(27 * 3), 3));
    const trajectoryLine = new THREE.Line(
      trajectoryGeo,
      new THREE.LineDashedMaterial({ color: '#f5c542', dashSize: 0.55, gapSize: 0.35, transparent: true, opacity: 0.95 }),
    );
    trajectoryLine.visible = false;
    trajectoryLine.renderOrder = 4;
    sm.scene.add(trajectoryLine);
    const camera = new CameraController();

    // Kit state is mutable: Play-As-Club / session kits arrive via props
    // and the frame loop rebuilds rigs in place when they change.
    const rigDetail = quality === 'LOW' ? 'LOW' as const : 'FULL' as const;
    const kitState: { home: KitColors; away: KitColors } = {
      home: kitsPropRef.current.home ?? { primary: homeClub.primary, secondary: homeClub.secondary, shorts: '#0f172a', socks: homeClub.primary },
      away: kitsPropRef.current.away ?? { primary: awayClub.primary, secondary: awayClub.secondary, shorts: '#f8fafc', socks: awayClub.primary },
    };
    const homeKit = kitState.home;
    const awayKit = kitState.away;
    let appliedKitSig = `${homeKit.primary}|${awayKit.primary}`;
    const formation = getFormationById('4-3-3-attack')!;
    const squads = pickSquads();
    const actors: Actor[] = [];
    const makeTeam = (templates: PlayerTemplate[], kit: KitColors, gkKind: 'HOME_GK' | 'AWAY_GK', mirror: number) => {
      templates.forEach((tpl, i) => {
        const slot = formation.slots[i]!;
        const isGk = tpl.position === 'GK';
        const rig = buildPlayerRig(tpl.appearance, isGk ? kitFor(gkKind, homeKit, awayKit) : kit, tpl.shirtNumber ?? i + 1, tpl.shortName, rigDetail, { gk: isGk });
        const baseX = mirror * ((slot.nx - 0.5) * 105) * 0.92;
        const baseZ = ((slot.ny - 0.5) * 68) * 0.92 * (mirror < 0 ? -1 : 1);
        rig.group.position.set(baseX, 0, baseZ);
        rig.group.rotation.y = mirror > 0 ? Math.PI / 2 : -Math.PI / 2;
        sm.scene.add(rig.group);
        const labelParts = makeNameLabel(tpl.shortName);
        labelParts.label.position.set(baseX, 2.2, baseZ);
        sm.scene.add(labelParts.label);
        actors.push({
          rig, animator: new PlayerAnimator(tpl.preferredFoot),
          baseX, baseZ, phase: i * 1.37, patrol: isGk ? 0.3 : 0.8 + (i % 4) * 0.45,
          yaw: mirror > 0 ? Math.PI / 2 : -Math.PI / 2,
          templateId: tpl.id, kit, gkKind, isGk, shirtNumber: tpl.shirtNumber ?? i + 1,
          detail: rigDetail,
          ...labelParts,
        });
      });
    };

    // Phase 06: rebuild one actor's rig in place when a live substitution
    // swaps his template (new face, hair, shirt name/number) — transform and
    // animation state carry over, old geometry/materials are disposed.
    // Realistic-models pass: also used by the distance-LOD switch, which
    // passes an explicit detail tier. The dispose walk MUST skip the
    // shared rig materials (plate/face atlases, vertex-colour mats) —
    // disposing one here corrupts every other rig's textures.
    const rebuildActor = (idx: number, tpl: PlayerTemplate, detail: RigDetail = actors[idx]?.detail ?? rigDetail) => {
      const a = actors[idx];
      if (!a) return;
      const old = a.rig;
      const rig = buildPlayerRig(
        tpl.appearance,
        a.isGk ? kitFor(a.gkKind, kitState.home, kitState.away) : a.kit,
        a.shirtNumber,
        tpl.shortName,
        detail,
        { gk: a.isGk },
      );
      rig.group.position.copy(old.group.position);
      rig.group.rotation.copy(old.group.rotation);
      sm.scene.remove(old.group);
      old.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (isSharedRigMaterial(m)) return;
            const std = m as THREE.MeshStandardMaterial;
            std.map?.dispose();
            m.dispose();
          });
        }
      });
      sm.scene.add(rig.group);
      a.rig = rig;
      a.animator = new PlayerAnimator(tpl.preferredFoot);
      a.templateId = tpl.id;
      a.detail = detail;
      drawNameLabel(a, tpl.shortName);
    };
    makeTeam(squads.home, homeKit, 'HOME_GK', 1);
    makeTeam(squads.away, awayKit, 'AWAY_GK', -1);

    apiRef.current = { scene: sm, crowd, stadium, camera, pitch };
    sm.applyWeather('NIGHT_FLOODLIGHTS');

    let raf = 0;
    let last = performance.now();
    let fpsFrames = 0;
    let fpsTime = 0;
    let elapsed = 0;
    let lastImpactPulse = 0;
    let lastGoalPulse = 0;
    let lastActiveGlobal = -1;
    let frameCount = 0;
    let lastFrameStamp = 0;
    // --- Epic fix round (P0-1): render interpolation ---------------------
    // The sim steps at a fixed 60Hz; the display does not. Each actor and
    // the ball keep prev/curr snapshots: when the render state advances,
    // prev ← curr and curr ← new state, and every frame renders
    // lerp(prev, curr, alpha) with alpha = time since the advance over one
    // fixed step — motion is smooth at any refresh rate instead of
    // snapping at 60Hz. Yaw takes the shortest arc; a near-stationary
    // player foot-plant-locks to curr so his feet never skate.
    interface InterpSnap { x: number; z: number; yaw: number }
    const interpPrev: InterpSnap[] = actors.map((a) => ({ x: a.rig.group.position.x, z: a.rig.group.position.z, yaw: a.rig.group.rotation.y }));
    const interpCurr: InterpSnap[] = actors.map((a) => ({ x: a.rig.group.position.x, z: a.rig.group.position.z, yaw: a.rig.group.rotation.y }));
    const ballPrev = { x: 0, y: 0.11, z: 0 };
    const ballCurr = { x: 0, y: 0.11, z: 0 };
    let lastAdvanceAt = performance.now();
    const FIXED_STEP_MS = 1000 / 60;
    const advanceInterp = (
      sample: { players: { x: number; z: number; yaw: number }[]; ballPos: { x: number; y: number; z: number } },
      now: number,
    ): number => {
      // Advance detection keys on ANY player's movement (plus the ball):
      // keying on one fixed player froze everyone else's interpolation
      // whenever that player and the ball happened to be still.
      let advanced = sample.ballPos.x !== ballCurr.x
        || sample.ballPos.y !== ballCurr.y || sample.ballPos.z !== ballCurr.z;
      for (let i = 0; i < sample.players.length && !advanced; i += 1) {
        const p = sample.players[i];
        const curr = interpCurr[i];
        if (!p || !curr) { advanced = true; break; }
        if (p.x !== curr.x || p.z !== curr.z || p.yaw !== curr.yaw) advanced = true;
      }
      if (advanced) {
        for (let i = 0; i < 22; i += 1) {
          const p = sample.players[i];
          const prev = interpPrev[i];
          const curr = interpCurr[i];
          if (!p || !prev || !curr) continue;
          prev.x = curr.x; prev.z = curr.z; prev.yaw = curr.yaw;
          curr.x = p.x; curr.z = p.z; curr.yaw = p.yaw;
        }
        ballPrev.x = ballCurr.x; ballPrev.y = ballCurr.y; ballPrev.z = ballCurr.z;
        ballCurr.x = sample.ballPos.x; ballCurr.y = sample.ballPos.y; ballCurr.z = sample.ballPos.z;
        lastAdvanceAt = now;
        return 0;
      }
      return Math.min(1, Math.max(0, (now - lastAdvanceAt) / FIXED_STEP_MS));
    };
    const lerpYaw = (from: number, to: number, t: number): number => {
      const d = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return from + d * t;
    };
    // rAF starvation watchdog: some phone WebViews (and embedded frames
    // generally) stop delivering requestAnimationFrame callbacks to canvas
    // pages while timers keep running — the simulation (timer/rAF hybrid
    // elsewhere) survives but this view would sit black at 0 FPS forever.
    // frame() is the whole render body; loop() is its rAF driver. If no rAF
    // frame lands for 400ms, a 60Hz interval drives frame() directly until
    // rAF delivery resumes (tracked separately in lastRafAt).
    let lastRafAt = performance.now();
    const frame = (now: number) => {
      // Clamp both ways: the watchdog mixes performance.now() with rAF
      // timestamps, and a stale rAF timestamp would otherwise hand the
      // animators a hugely negative dt — their pose lerp turns that into
      // NaN transforms and all 22 players silently vanish.
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0, rawDt)) : 0;
      elapsed += dt;
      // Name labels default off each frame; the active sim branch below
      // lights up the controlled player, the ball carrier and the pass
      // target (the reference frame's floating name tags).
      for (const a of actors) a.label.visible = false;
      const showLabel = (idx: number) => {
        const a = actors[idx];
        if (!a) return;
        a.label.visible = true;
        a.label.position.set(a.rig.group.position.x, a.rig.group.position.y + 2.25, a.rig.group.position.z);
      };
      fpsFrames += 1; fpsTime += dt;
      if (fpsTime >= 0.5) { onFps(Math.round(fpsFrames / fpsTime)); fpsFrames = 0; fpsTime = 0; }

      const demo = propsRef.current.demoAnim;
      const practice = practiceRef.current;
      const scrimmage = scrimmageRef.current;
      const replay = replayRef.current;
      const replayOn = replay !== null && replay.enabled;
      const scrimmageOn = !replayOn && scrimmage !== null && scrimmage.enabled;
      const practiceOn = !replayOn && !scrimmageOn && practice !== null && practice.enabled;

      // Phase 05 replay: actors + ball are driven by the recorder's
      // interpolated slow-motion frames; camera uses the dramatic angles.
      if (replayOn && replay) {
        for (let i = 0; i < 22; i += 1) {
          const a = actors[i];
          const p = replay.players[i];
          if (!a || !p) continue;
          a.rig.group.position.x = p.x;
          a.rig.group.position.z = p.z;
          a.rig.group.rotation.y = p.yaw;
          a.animator.skillId = null; // replay frames don't carry skill flavour
          a.animator.setState(p.anim);
          a.animator.update(a.rig, dt, p.speed);
        }
        ball.setPosition(replay.ballPos.x, replay.ballPos.y, replay.ballPos.z);
        ball.trailMode = 'FINESSE';
        overlays.setOffsideLine(null);
        trajectoryLine.visible = false;
        markerGroup.visible = false;
      }

      // Phase 04 scrimmage: ALL 22 actors + ball are driven by the AI sim,
      // rendered through the P0-1 interpolation snapshots.
      if (scrimmageOn && scrimmage) {
        const alpha = advanceInterp(scrimmage, now);
        for (let i = 0; i < 22; i += 1) {
          const a = actors[i];
          const p = scrimmage.players[i];
          if (!a || !p) continue;
          // Phase 06: a substitution changed this slot's template — swap rigs.
          const wantId = scrimmage.playerTemplateIds[i];
          if (wantId && wantId !== a.templateId) {
            const tpl = getPlayerById(wantId);
            if (tpl) rebuildActor(i, tpl);
          }
          const prev = interpPrev[i]!;
          const curr = interpCurr[i]!;
          if (p.speed < 0.3) {
            // Foot-plant lock: a standing player never skates.
            a.rig.group.position.x = curr.x;
            a.rig.group.position.z = curr.z;
            a.rig.group.rotation.y = curr.yaw;
          } else {
            a.rig.group.position.x = prev.x + (curr.x - prev.x) * alpha;
            a.rig.group.position.z = prev.z + (curr.z - prev.z) * alpha;
            a.rig.group.rotation.y = lerpYaw(prev.yaw, curr.yaw, alpha);
          }
          a.animator.diveDirection = p.diveDir;
          a.animator.skillId = p.skill;
          a.animator.setState(p.anim);
          a.animator.update(a.rig, dt, p.speed);
        }
        ball.setPosition(
          ballPrev.x + (ballCurr.x - ballPrev.x) * alpha,
          ballPrev.y + (ballCurr.y - ballPrev.y) * alpha,
          ballPrev.z + (ballCurr.z - ballPrev.z) * alpha,
        );
        const w = scrimmage.ballAngVel;
        const wLen = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
        if (wLen > 0.01) ball.setSpin({ x: w.x / wLen, y: w.y / wLen, z: w.z / wLen }, wLen);
        // Phase 08: skill-game targets / gates / zones glow in-world.
        syncSkillMarkers(scrimmage.skillMarkers, elapsed);
        ball.trailMode = scrimmage.shotInFlight
          ? scrimmage.shotType === 'POWER' ? 'POWER' : scrimmage.shotType === 'FINESSE' || scrimmage.shotType === 'CHIP' ? 'FINESSE' : 'NONE'
          : 'NONE';
        if (scrimmage.impactPulse !== lastImpactPulse) {
          lastImpactPulse = scrimmage.impactPulse;
          camera.addShake(0.85);
        }
        if (scrimmage.goalPulse !== lastGoalPulse) {
          lastGoalPulse = scrimmage.goalPulse;
          stadium.flashGoalBoards();
          crowd.triggerGoalWave();
          camera.addShake(0.5);
          camera.celebrationFocus.set(scrimmage.ballPos.x - 3, 1, scrimmage.ballPos.z);
        }
        // P1-12: net vertex re-uploads throttled to ~30Hz — the spring sim
        // still runs at 60Hz, only the GPU upload cadence halves.
        if (frameCount % 2 === 0) {
          (goalL.netGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          (goalR.netGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
        // In-world indicators: active ring, green 2nd-presser ring, pass
        // target — positioned on the INTERPOLATED rigs, and the active
        // ring's arc reads the sim's REAL stamina (P0-8).
        const active = scrimmage.players[scrimmage.activeGlobal];
        const activeRig = actors[scrimmage.activeGlobal]?.rig.group.position;
        if (active && activeRig) overlays.setActivePlayer(activeRig.x, activeRig.z, active.stamina, elapsed, scrimmage.switchPulse);
        // Cycle-2 switch flash: the frame the controlled man changes, the
        // camera gets its 0.2 s ease toward the new framing.
        if (scrimmage.activeGlobal !== lastActiveGlobal) {
          lastActiveGlobal = scrimmage.activeGlobal;
          camera.easeToSwitch();
        }
        const secondRig = scrimmage.secondPresserGlobal >= 0 ? actors[scrimmage.secondPresserGlobal]?.rig.group.position : undefined;
        if (secondRig) overlays.setSecondDefender(secondRig.x, secondRig.z);
        else overlays.hideSecondDefender();
        const passRig = scrimmage.passTargetGlobal >= 0 ? actors[scrimmage.passTargetGlobal]?.rig.group.position : undefined;
        if (passRig) overlays.setPassTarget(passRig.x, passRig.z, elapsed);
        else overlays.hidePassTarget();
        // Floating name tags: controlled player + ball carrier + target.
        showLabel(scrimmage.activeGlobal);
        let carrierIdx = -1;
        let carrierDist = Infinity;
        scrimmage.players.forEach((p, i) => {
          const d = Math.hypot(p.x - scrimmage.ballPos.x, p.z - scrimmage.ballPos.z);
          if (d < carrierDist) { carrierDist = d; carrierIdx = i; }
        });
        if (carrierIdx >= 0 && carrierDist < 2.4) showLabel(carrierIdx);
        if (scrimmage.passTargetGlobal >= 0) showLabel(scrimmage.passTargetGlobal);
        // Phase 05: VAR offside line + free-kick trajectory preview.
        overlays.setOffsideLine(scrimmage.offsideLineX);
        if (scrimmage.trajectory && scrimmage.trajectory.length > 1) {
          const attr = trajectoryGeo.attributes.position as THREE.BufferAttribute;
          const pts = scrimmage.trajectory;
          const n = Math.min(27, pts.length);
          for (let i = 0; i < n; i += 1) {
            const p = pts[i]!;
            attr.setXYZ(i, p.x, p.y, p.z);
          }
          trajectoryGeo.setDrawRange(0, n);
          attr.needsUpdate = true;
          trajectoryLine.computeLineDistances();
          trajectoryLine.visible = true;
        } else {
          trajectoryLine.visible = false;
        }
      }

      // Phase 03 practice: home actors + ball are driven by the physics
      // sim, through the same P0-1 interpolation snapshots.
      if (practiceOn && practice) {
        const alpha = advanceInterp(practice, now);
        for (let i = 0; i < 11; i += 1) {
          const a = actors[i];
          const p = practice.players[i];
          if (!a || !p) continue;
          const prev = interpPrev[i]!;
          const curr = interpCurr[i]!;
          if (p.speed < 0.3) {
            a.rig.group.position.x = curr.x;
            a.rig.group.position.z = curr.z;
            a.rig.group.rotation.y = curr.yaw;
          } else {
            a.rig.group.position.x = prev.x + (curr.x - prev.x) * alpha;
            a.rig.group.position.z = prev.z + (curr.z - prev.z) * alpha;
            a.rig.group.rotation.y = lerpYaw(prev.yaw, curr.yaw, alpha);
          }
          a.animator.setState(p.anim);
          a.animator.update(a.rig, dt, p.speed);
        }
        ball.setPosition(
          ballPrev.x + (ballCurr.x - ballPrev.x) * alpha,
          ballPrev.y + (ballCurr.y - ballPrev.y) * alpha,
          ballPrev.z + (ballCurr.z - ballPrev.z) * alpha,
        );
        const w = practice.ballAngVel;
        const wLen = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
        if (wLen > 0.01) ball.setSpin({ x: w.x / wLen, y: w.y / wLen, z: w.z / wLen }, wLen);
        ball.trailMode = practice.shotInFlight
          ? practice.shotType === 'POWER' ? 'POWER' : practice.shotType === 'FINESSE' || practice.shotType === 'CHIP' ? 'FINESSE' : 'NONE'
          : 'NONE';
        showLabel(practice.activeIndex);
        // Impact pulses from the sim: post ping shake + goal celebration.
        if (practice.impactPulse !== lastImpactPulse) {
          lastImpactPulse = practice.impactPulse;
          camera.addShake(0.85);
        }
        if (practice.goalPulse !== lastGoalPulse) {
          lastGoalPulse = practice.goalPulse;
          stadium.flashGoalBoards();
          crowd.triggerGoalWave();
          camera.addShake(0.5);
          camera.celebrationFocus.set(practice.ballPos.x - 3, 1, practice.ballPos.z);
        }
        if (frameCount % 2 === 0) {
          (goalL.netGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          (goalR.netGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
      }

      actors.forEach((a, i) => {
        if (replayOn) return; // all 22 already driven by the replay frames
        if (scrimmageOn) return; // all 22 already driven by the scrimmage sim
        if (practiceOn && i < 11) return; // home team already driven above
        const isDemoAll = demo !== 'IDLE';
        const jogging = !isDemoAll && i % 4 === 1;
        if (isDemoAll) a.animator.setState(demo);
        else a.animator.setState(jogging ? 'JOG' : 'IDLE');
        const moving = isDemoAll ? (demo === 'JOG' || demo === 'SPRINT') : jogging;
        if (moving) {
          const t = elapsed * 0.55 + a.phase;
          const x = a.baseX + Math.sin(t) * a.patrol;
          const z = a.baseZ + Math.cos(t * 0.8) * a.patrol * 0.6;
          const vx = Math.cos(t) * a.patrol;
          const vz = -Math.sin(t * 0.8) * a.patrol * 0.48;
          a.rig.group.position.x = x;
          a.rig.group.position.z = z;
          if (Math.abs(vx) + Math.abs(vz) > 0.05) a.rig.group.rotation.y = Math.atan2(vx, vz);
        } else {
          a.rig.group.position.x = a.baseX;
          a.rig.group.position.z = a.baseZ;
          a.rig.group.rotation.y += ((a.yaw - a.rig.group.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
        }
        a.animator.update(a.rig, dt, moving ? 3.4 : 0);
      });

      // Kick demo: ball arcs to the right goal, then boards flash + wave.
      const kick = kickRef.current;
      if (kick.active && !practiceOn && !scrimmageOn) {
        kick.t += dt;
        const kt = Math.min(1, kick.t / 1.05);
        const bx = THREE.MathUtils.lerp(0, 51.4, kt);
        const by = 0.11 + Math.sin(kt * Math.PI) * 1.5 * (1 - kt * 0.4);
        ball.setPosition(bx, by, THREE.MathUtils.lerp(0, -1.6, kt));
        ball.trailMode = 'FINESSE';
        if (kt >= 1 && kick.t < 1.1) {
          stadium.flashGoalBoards();
          crowd.triggerGoalWave();
          camera.addShake(0.7);
          camera.celebrationFocus.set(48, 1, -2);
        }
        if (kick.t > 3.2) { kick.active = false; ball.trailMode = 'NONE'; ball.setPosition(0, 0.11, 0); }
      }
      ball.update(dt);
      if (!scrimmageOn && !replayOn) {
        // P0-8: the overlay arc reads REAL stamina — the practice sim's
        // active player here (the old build hardcoded 0.82 for everyone).
        const practiceStamina = practiceOn && practice ? practice.players[practice.activeIndex]?.stamina : undefined;
        overlays.setActivePlayer(
          actors[9]?.rig.group.position.x ?? 0,
          actors[9]?.rig.group.position.z ?? 0,
          practiceStamina ?? 1,
          elapsed,
        );
      }
      pitch.update(elapsed);
      stadium.update(elapsed, dt);
      crowd.update(elapsed, dt);
      sm.update(dt, elapsed);
      const bp = ball.position;
      camera.setMode(replayOn
        ? (replayAngleRef.current === 2 ? 'REPLAY_TIGHT' : 'REPLAY_GOAL')
        : propsRef.current.cameraMode);
      const focusIdx = scrimmageOn && scrimmage ? scrimmage.activeGlobal : 9;
      const focusActor = actors[focusIdx] ?? actors[9];
      // P0-1: the camera leads with the ball's REAL velocity (the old call
      // passed {x:0, z:0} — dead code that killed the broadcast lead).
      const velSrc = scrimmageOn && scrimmage ? scrimmage.ballVel : practiceOn && practice ? practice.ballVel : null;
      camera.update(sm.camera, dt, { x: bp.x, y: bp.y, z: bp.z }, { x: velSrc?.x ?? 0, z: velSrc?.z ?? 0 },
        focusActor ? { x: focusActor.rig.group.position.x, z: focusActor.rig.group.position.z, yaw: focusActor.rig.group.rotation.y } : null,
        Math.abs(bp.x) > 36);
      // P0-6: session kits arrived via props — rebuild the rigs in place.
      const propKits = kitsPropRef.current;
      if (propKits.home || propKits.away) {
        const sig = `${propKits.home?.primary ?? homeKit.primary}|${propKits.away?.primary ?? awayKit.primary}`;
        if (sig !== appliedKitSig) {
          appliedKitSig = sig;
          if (propKits.home) kitState.home = propKits.home;
          if (propKits.away) kitState.away = propKits.away;
          actors.forEach((a, i) => {
            a.kit = i < 11 ? kitState.home : kitState.away;
            const tpl = getPlayerById(a.templateId);
            if (tpl) rebuildActor(i, tpl);
          });
        }
      }
      sm.render();
      // P1-12: live perf telemetry (frame time + renderer counters).
      frameCount += 1;
      if (lastFrameStamp > 0) perfTelemetry.record(now - lastFrameStamp);
      lastFrameStamp = now;
      if (frameCount % 30 === 0) {
        let rigMeshes = 0;
        for (const a of actors) rigMeshes += countRigDrawMeshes(a.rig);
        // Real measured counters from the frame just rendered, tagged
        // with the live tier — the perf lab asserts the LOW budget
        // against this number, never a synthetic constant.
        perfTelemetry.sampleRenderer(sm.renderer.info, rigMeshes, qualityRef.current);
        (window as unknown as { __strikerPerf?: unknown }).__strikerPerf = perfTelemetry.snapshot();
        // Distance LOD (spec §3.3): every 30 frames, at most 2 rig
        // rebuilds, never mid-action and never during a replay. Near
        // players get FULL (MEDIUM/HIGH), far players DISTANT.
        if (!replayOn) {
          let rebuilt = 0;
          const camPos = sm.camera.position;
          for (let i = 0; i < actors.length && rebuilt < 2; i += 1) {
            const a = actors[i];
            if (!a) continue;
            const st = a.animator.state;
            if (st === 'KICK' || st === 'SHOOT' || st === 'SLIDE_TACKLE' || st === 'PASS_KICK' || st === 'STAND_TACKLE' || st === 'SKILL') continue;
            const dist = Math.hypot(a.rig.group.position.x - camPos.x, a.rig.group.position.z - camPos.z);
            const want: RigDetail = rigDetail === 'LOW'
              ? (dist > 25 ? 'DISTANT' : 'LOW')
              : dist < 12 ? 'FULL' : dist <= 25 ? 'LOW' : 'DISTANT';
            if (want !== a.detail) {
              const tpl = getPlayerById(a.templateId);
              if (tpl) { rebuildActor(i, tpl, want); rebuilt += 1; }
            }
          }
        }
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      lastRafAt = now;
      frame(now);
    };
    raf = requestAnimationFrame(loop);
    // Watchdog + starvation drive (see lastRafAt note above): checks rAF
    // liveness 5×/s; while rAF is starved, a 60Hz interval drives frame()
    // so the pitch still renders and animates inside throttling WebViews.
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
      sm.renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      if (netsRef.current) {
        if (netsRef.current.left === netL) netsRef.current.left = null;
        if (netsRef.current.right === netR) netsRef.current.right = null;
      }
      sm.dispose();
      apiRef.current = null;
    };
    // retryNonce re-runs this mount after a WebGL failure once the player
    // picks "Retry in LOW graphics" (quality itself is applied live by the
    // [quality] effect below; the nonce only rebuilds a dead renderer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce]);

  // SUNSET is a day preset (SceneManager's sunset sky, DAY ambience in
  // App.tsx): only the two NIGHT_* presets use the night grass / night
  // crowd and floodlights. (Was `weather !== 'DAY_CLEAR'`, which wrongly
  // treated SUNSET as night for the pitch and crowd.)
  useEffect(() => { const isNight = weather === 'NIGHT_FLOODLIGHTS' || weather === 'NIGHT_RAIN'; apiRef.current?.scene.applyWeather(weather); apiRef.current?.stadium.setFloodlightsOn(isNight); apiRef.current?.pitch.setNight(isNight); }, [weather]);
  useEffect(() => {
    const api = apiRef.current;
    if (api) { api.scene.applyGraphicsQuality(quality); api.crowd.setBudget(Math.round(api.scene.crowdBudget() * crowdDensityRef.current)); }
  }, [quality]);
  useEffect(() => {
    const api = apiRef.current;
    if (api) api.crowd.setBudget(Math.round(api.scene.crowdBudget() * crowdDensity));
  }, [crowdDensity]);
  useEffect(() => { apiRef.current?.camera.setMode(cameraMode); }, [cameraMode]);
  useEffect(() => { if (goalWaveSignal > 0) { apiRef.current?.crowd.triggerGoalWave(); apiRef.current?.stadium.flashGoalBoards(); } }, [goalWaveSignal]);
  useEffect(() => { if (kickSignal > 0) { kickRef.current = { active: true, t: 0 }; } }, [kickSignal]);

  return (
    <div ref={hostRef} className="absolute inset-0" aria-label="3D stadium viewport" role="img">
      {glError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0a120c] px-6 text-center" role="alert">
          <p className="font-display text-2xl font-bold uppercase tracking-widest text-white">3D pitch unavailable</p>
          <p className="max-w-[340px] text-sm leading-relaxed text-white/75">{glError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => { onGlFailed?.(); setGlError(null); setRetryNonce((n) => n + 1); }}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#0a120c]"
            >
              Retry in LOW graphics
            </button>
            <button
              type="button"
              onClick={() => { setGlError(null); setRetryNonce((n) => n + 1); }}
              className="rounded-lg border border-white/35 px-4 py-2 text-sm font-bold text-white"
            >
              Retry
            </button>
          </div>
          <p className="max-w-[340px] text-xs leading-relaxed text-white/50">
            The rest of the game — your club, squad, store and modes — keeps working from the tabs above.
          </p>
        </div>
      )}
    </div>
  );
}
