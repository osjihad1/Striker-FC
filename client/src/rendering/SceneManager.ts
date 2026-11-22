// Striker FC — rendering/SceneManager.ts (Phase 02, Spec 07 §1)
// WebGLRenderer with ACES tone mapping, soft shadows, weather presets,
// graphics-quality tiers and an instanced rain system for NIGHT_RAIN.
import * as THREE from 'three';
import type { WeatherType } from '../core/types';
import type { GraphicsQuality } from '../store/useSettingsStore';

export type WeatherPreset = WeatherType;

interface WeatherDef {
  skyTop: string; skyBottom: string; fog: string; fogDensity: number;
  sunColor: string; sunIntensity: number; sunPos: [number, number, number];
  ambient: number; exposure: number; grassRoughness: number;
}

const WEATHER: Record<WeatherPreset, WeatherDef> = {
  DAY_CLEAR: { skyTop: '#3b82c4', skyBottom: '#cfe8f7', fog: '#cfe8f7', fogDensity: 0.0016, sunColor: '#fff6e5', sunIntensity: 2.6, sunPos: [60, 90, 35], ambient: 0.75, exposure: 1.12, grassRoughness: 0.92 },
  SUNSET: { skyTop: '#3b2a63', skyBottom: '#ff9e5e', fog: '#e88a5a', fogDensity: 0.0022, sunColor: '#ff9e5e', sunIntensity: 2.1, sunPos: [-80, 26, 20], ambient: 0.5, exposure: 1.08, grassRoughness: 0.9 },
  NIGHT_FLOODLIGHTS: { skyTop: '#050b1e', skyBottom: '#12244d', fog: '#0a1730', fogDensity: 0.0026, sunColor: '#dbeafe', sunIntensity: 1.5, sunPos: [40, 80, -30], ambient: 0.32, exposure: 1.15, grassRoughness: 0.88 },
  NIGHT_RAIN: { skyTop: '#04081a', skyBottom: '#0e1e3d', fog: '#0a1730', fogDensity: 0.0034, sunColor: '#cfe4ff', sunIntensity: 1.35, sunPos: [40, 80, -30], ambient: 0.28, exposure: 1.1, grassRoughness: 0.28 },
};

const RAIN_COUNT = 1400;

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private rain: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private rainData: { x: number; y: number; z: number; speed: number }[] = [];
  private rainDummy = new THREE.Object3D();
  weather: WeatherPreset = 'NIGHT_FLOODLIGHTS';
  quality: GraphicsQuality = 'HIGH';
  private pitchMaterial: THREE.MeshStandardMaterial | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement, initialQuality: GraphicsQuality = 'HIGH') {
    this.container = container;
    // The starting tier is applied from the very first frame: on LOW the
    // renderer is created without an antialias buffer and the constructor's
    // applyGraphicsQuality below pins DPR 1 + shadows off immediately, so a
    // phone never pays the HIGH-tier allocation spike (DPR 2 + 2048px shadow
    // maps) before the React quality effect gets a chance to downgrade it.
    this.quality = initialQuality;
    this.renderer = new THREE.WebGLRenderer({ antialias: initialQuality !== 'LOW', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(container.clientWidth || 960, container.clientHeight || 540);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#0a1730', 0.0026);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 600);
    this.camera.position.set(0, 22, 46);

    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(320, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color('#050b1e') }, bottom: { value: new THREE.Color('#12244d') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
      }),
    );
    this.scene.add(this.skyMesh);

    this.sun = new THREE.DirectionalLight('#dbeafe', 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -75; this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 60; this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd7ff', '#1d3320', 0.5);
    this.scene.add(this.hemi);

    // Rain streaks — one InstancedMesh of thin stretched cylinders.
    const rainGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.85, 4, 1, true);
    const rainMat = new THREE.MeshBasicMaterial({ color: '#a8c8ee', transparent: true, opacity: 0.5, depthWrite: false });
    this.rain = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
    this.rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      this.rainData.push({ x: (Math.random() - 0.5) * 150, y: Math.random() * 42, z: (Math.random() - 0.5) * 110, speed: 22 + Math.random() * 12 });
    }
    this.scene.add(this.rain);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.applyWeather(this.weather);
    this.applyGraphicsQuality(this.quality);
  }

  registerPitchMaterial(mat: THREE.MeshStandardMaterial): void { this.pitchMaterial = mat; }

  handleResize(): void {
    const w = this.container.clientWidth || 960;
    const h = this.container.clientHeight || 540;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  applyGraphicsQuality(q: GraphicsQuality): void {
    this.quality = q;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (q === 'LOW') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
    } else if (q === 'MEDIUM') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
    } else if (q === 'ULTRA') {
      // Phase 10: full device resolution (capped at 2× for fill-rate sanity),
      // 2048 shadows — the flagship tier.
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
    }
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.material) (m.material as THREE.Material).needsUpdate = true; });
    this.handleResize();
  }

  /** Crowd budget per quality tier (Spec 07 §1; ULTRA added in Phase 10). */
  crowdBudget(): number {
    return this.quality === 'LOW' ? 1200
      : this.quality === 'MEDIUM' ? 2500
        : this.quality === 'HIGH' ? 4000 : 6000;
  }

  applyWeather(w: WeatherPreset): void {
    this.weather = w;
    const def = WEATHER[w];
    this.skyMesh.material.uniforms.top!.value.set(def.skyTop);
    this.skyMesh.material.uniforms.bottom!.value.set(def.skyBottom);
    (this.scene.fog as THREE.FogExp2).color.set(def.fog);
    (this.scene.fog as THREE.FogExp2).density = def.fogDensity;
    this.sun.color.set(def.sunColor);
    this.sun.intensity = def.sunIntensity;
    this.sun.position.set(...def.sunPos);
    this.hemi.intensity = def.ambient;
    this.renderer.toneMappingExposure = def.exposure;
    this.rain.visible = w === 'NIGHT_RAIN';
    if (this.pitchMaterial) this.pitchMaterial.roughness = def.grassRoughness;
  }

  update(dt: number, time: number): void {
    if (this.rain.visible) {
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        const d = this.rainData[i]!;
        d.y -= d.speed * dt;
        d.x += dt * 2.2; // slight wind slant drift
        if (d.y < 0) { d.y = 40 + Math.random() * 4; d.x = (Math.random() - 0.5) * 150; d.z = (Math.random() - 0.5) * 110; }
        this.rainDummy.position.set(d.x, d.y, d.z);
        this.rainDummy.rotation.set(0, 0, 0.1);
        this.rainDummy.updateMatrix();
        this.rain.setMatrixAt(i, this.rainDummy.matrix);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    void time;
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  dispose(): void {
    this.resizeObserver?.disconnect();
    // Phase 10 memory audit: release every GPU resource in the graph —
    // geometries, materials, textures and instanced buffers — so exiting to
    // the hub and re-entering matches never leaks WebGL memory.
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.normalMap?.dispose();
        std.roughnessMap?.dispose();
        m.dispose();
      }
      const inst = o as THREE.InstancedMesh;
      if (inst.instanceMatrix) inst.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
