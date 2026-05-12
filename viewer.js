/**
 * viewer.js — Gacha Machine 3D Color Configurator
 *
 * Depends on three.js r160+ loaded via importmap (see index.html).
 *
 * Public API consumed by index.html:
 *   window.configurator.setPartColor(partName, hexColor)
 *   window.configurator.setFinish(finishName)   // 'matte' | 'gloss' | 'metallic'
 *   window.configurator.resetDefaults()
 *   window.configurator.saveScreenshot()
 */

import * as THREE from 'three';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader }    from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─────────────────────────────────────────────
//  Constants & defaults
// ─────────────────────────────────────────────

const MODEL_URL = 'models/gacha-machine.glb';
const HDRI_URL  = 'hdri/environment.hdr';

/** Canonical part names and their default hex colors. */
const PART_DEFAULTS = {
  Body:   '#e63946', // Red
  Door:   '#457b9d', // Steel blue
  Trim:   '#1d3557', // Dark navy
  Accent: '#f1c40f', // Yellow
};

/** PBR values per finish preset. */
const FINISH_PRESETS = {
  matte:    { roughness: 0.9, metalness: 0.0 },
  gloss:    { roughness: 0.1, metalness: 0.1 },
  metallic: { roughness: 0.3, metalness: 0.9 },
};

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────

// Current colors per part (mutable, synced with materials)
const currentColors = { ...PART_DEFAULTS };

// Currently selected finish
let currentFinish = 'gloss';

// Map from part name → THREE.Mesh (or array of meshes)
const partMeshes = {};

// ─────────────────────────────────────────────
//  Renderer setup
// ─────────────────────────────────────────────

const canvas = document.getElementById('three-canvas');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true, // needed for screenshot export
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ─────────────────────────────────────────────
//  Scene & camera
// ─────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1117);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(0, 1, 3);

// ─────────────────────────────────────────────
//  Orbit controls
// ─────────────────────────────────────────────

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 20;
controls.target.set(0, 0, 0);

// ─────────────────────────────────────────────
//  Lighting fallback (used if no HDRI loads)
// ─────────────────────────────────────────────

function addFallbackLighting() {
  // Hemisphere sky/ground light
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x222233, 1.4);
  scene.add(hemi);

  // Key light
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 50;
  key.shadow.camera.left = key.shadow.camera.bottom = -5;
  key.shadow.camera.right = key.shadow.camera.top = 5;
  scene.add(key);

  // Fill light
  const fill = new THREE.DirectionalLight(0x8888ff, 0.6);
  fill.position.set(-4, 3, -3);
  scene.add(fill);

  // Rim light
  const rim = new THREE.DirectionalLight(0xffeedd, 0.4);
  rim.position.set(0, -2, -4);
  scene.add(rim);
}

// ─────────────────────────────────────────────
//  HDRI environment loading
// ─────────────────────────────────────────────

function loadHDRI() {
  const pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileEquirectangularShader();

  const loader = new RGBELoader();
  loader.load(
    HDRI_URL,
    (texture) => {
      const envMap = pmremGen.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      scene.background  = envMap;
      texture.dispose();
      pmremGen.dispose();
    },
    undefined, // onProgress
    () => {
      // HDRI not found — use procedural lighting instead
      console.info('[viewer] No HDRI found, using procedural lighting.');
      addFallbackLighting();
      pmremGen.dispose();
    },
  );
}

// ─────────────────────────────────────────────
//  Material factory
// ─────────────────────────────────────────────

function makeMaterial(hexColor) {
  const { roughness, metalness } = FINISH_PRESETS[currentFinish];
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hexColor),
    roughness,
    metalness,
  });
}

// ─────────────────────────────────────────────
//  Assign material to a named mesh array
// ─────────────────────────────────────────────

function applyColorToMeshes(meshes, hexColor) {
  const { roughness, metalness } = FINISH_PRESETS[currentFinish];
  for (const mesh of meshes) {
    if (mesh.material) {
      mesh.material.color.set(hexColor);
      mesh.material.roughness = roughness;
      mesh.material.metalness = metalness;
    }
  }
}

// ─────────────────────────────────────────────
//  Placeholder geometry (shown when no GLB)
// ─────────────────────────────────────────────

function buildPlaceholder() {
  /*
   * Approximate a tall rectangular vending machine with distinct colored
   * sections so the UI colour-picking is still demonstrable.
   *
   * Hierarchy:
   *   Body   — main cabinet box
   *   Door   — inset front panel
   *   Trim   — thin frame strips around the door
   *   Accent — small detail cube (coin slot / button cluster)
   */

  const group = new THREE.Group();

  // Body — full cabinet
  const bodyGeo = new THREE.BoxGeometry(1, 1.8, 0.7);
  const bodyMesh = new THREE.Mesh(bodyGeo, makeMaterial(currentColors.Body));
  bodyMesh.name = 'Body';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Door — front panel slightly inset
  const doorGeo = new THREE.BoxGeometry(0.78, 1.3, 0.72);
  const doorMesh = new THREE.Mesh(doorGeo, makeMaterial(currentColors.Door));
  doorMesh.name = 'Door';
  doorMesh.position.set(0, 0.1, 0);
  doorMesh.castShadow = true;
  group.add(doorMesh);

  // Trim — top bar
  const trimGeo = new THREE.BoxGeometry(1.04, 0.08, 0.74);
  const trimMeshTop = new THREE.Mesh(trimGeo, makeMaterial(currentColors.Trim));
  trimMeshTop.name = 'Trim';
  trimMeshTop.position.set(0, 0.94, 0);
  group.add(trimMeshTop);

  // Trim — bottom bar (shares the same material instance as trimMeshTop)
  const trimMeshBot = trimMeshTop.clone();
  trimMeshBot.name = 'Trim';
  trimMeshBot.position.set(0, -0.94, 0);
  group.add(trimMeshBot);

  // Accent — coin/button block
  const accentGeo = new THREE.BoxGeometry(0.22, 0.14, 0.08);
  const accentMesh = new THREE.Mesh(accentGeo, makeMaterial(currentColors.Accent));
  accentMesh.name = 'Accent';
  accentMesh.position.set(0, -0.62, 0.37);
  accentMesh.castShadow = true;
  group.add(accentMesh);

  // Shadow-catcher floor
  const floorGeo = new THREE.PlaneGeometry(10, 10);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  floor.receiveShadow = true;
  scene.add(floor);

  return group;
}

// ─────────────────────────────────────────────
//  Centre & scale a loaded object
// ─────────────────────────────────────────────

function autoFit(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Move object so its bounding-box centre is at origin
  object.position.sub(center);

  // Scale so the tallest dimension fits in ~1.8 units
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scale = 1.8 / maxDim;
    object.scale.setScalar(scale);
  }

  // Adjust camera / controls to look at origin
  const scaledSize = size.clone().multiplyScalar(object.scale.x);
  const dist = Math.max(scaledSize.length() * 1.4, 2.5);
  camera.position.set(0, scaledSize.y * 0.3, dist);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ─────────────────────────────────────────────
//  Register mesh part by name prefix
// ─────────────────────────────────────────────

function registerParts(object) {
  const partKeys = Object.keys(PART_DEFAULTS);

  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;

    // Match the node name against known part names (case-insensitive prefix)
    const matched = partKeys.find(
      (k) => node.name.toLowerCase().startsWith(k.toLowerCase()),
    );

    if (matched) {
      if (!partMeshes[matched]) partMeshes[matched] = [];
      partMeshes[matched].push(node);

      // Replace material with a PBR one using current defaults
      node.material = makeMaterial(currentColors[matched]);
      node.castShadow = true;
      node.receiveShadow = true;
    } else {
      // Unrecognised part — upgrade to MeshStandardMaterial but keep colour
      const existing = node.material;
      const color = existing && existing.color ? existing.color : new THREE.Color(0x888888);
      node.material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.1,
      });
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

// ─────────────────────────────────────────────
//  Model loading
// ─────────────────────────────────────────────

function loadModel() {
  const statusEl  = document.getElementById('model-status');
  const overlayEl = document.getElementById('loading-overlay');

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      registerParts(model);
      autoFit(model);
      scene.add(model);

      overlayEl.classList.add('hidden');
      statusEl.textContent = '✓ Model loaded';
      statusEl.className   = 'loaded';
    },
    (xhr) => {
      if (xhr.total > 0) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        document.querySelector('.loading-text').textContent = `Loading model… ${pct}%`;
      }
    },
    () => {
      // GLB not found — show placeholder
      console.info('[viewer] GLB not found, using placeholder geometry.');
      const placeholder = buildPlaceholder();

      // Register placeholder meshes
      placeholder.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !node.name) return;
        const key = Object.keys(PART_DEFAULTS).find(
          (k) => node.name.toLowerCase().startsWith(k.toLowerCase()),
        );
        if (key) {
          if (!partMeshes[key]) partMeshes[key] = [];
          partMeshes[key].push(node);
        }
      });

      autoFit(placeholder);
      scene.add(placeholder);

      overlayEl.classList.add('hidden');
      statusEl.textContent = '⚠ Placeholder model';
      statusEl.className   = 'placeholder';
    },
  );
}

// ─────────────────────────────────────────────
//  Public configurator API
// ─────────────────────────────────────────────

/** Change the colour of a named part. */
function setPartColor(partName, hexColor) {
  currentColors[partName] = hexColor;
  if (partMeshes[partName] && partMeshes[partName].length > 0) {
    applyColorToMeshes(partMeshes[partName], hexColor);
  }
}

/** Change the finish for ALL parts. */
function setFinish(finishName) {
  if (!FINISH_PRESETS[finishName]) return;
  currentFinish = finishName;

  // Re-apply current colours with new roughness/metalness
  for (const [partName, hexColor] of Object.entries(currentColors)) {
    if (partMeshes[partName]) {
      applyColorToMeshes(partMeshes[partName], hexColor);
    }
  }
}

/** Reset all parts to their default colours and gloss finish. */
function resetDefaults() {
  currentFinish = 'gloss';

  for (const [partName, hexColor] of Object.entries(PART_DEFAULTS)) {
    currentColors[partName] = hexColor;
    if (partMeshes[partName]) {
      applyColorToMeshes(partMeshes[partName], hexColor);
    }
  }

  // Sync UI elements
  document.querySelectorAll('[data-part]').forEach((el) => {
    const part = el.dataset.part;
    if (el.type === 'color') el.value = PART_DEFAULTS[part];
    const hexInput = document.getElementById(`hex-${part.toLowerCase()}`);
    if (hexInput) hexInput.value = PART_DEFAULTS[part].toUpperCase();
  });

  document.querySelectorAll('.finish-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.finish === 'gloss');
  });
}

/** Save canvas as a PNG download. */
function saveScreenshot() {
  renderer.render(scene, camera); // ensure latest frame
  const link = document.createElement('a');
  link.download = 'gacha-machine-preview.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}

// Expose on window for index.html event handlers
window.configurator = { setPartColor, setFinish, resetDefaults, saveScreenshot };

// ─────────────────────────────────────────────
//  Resize handling
// ─────────────────────────────────────────────

function onResize() {
  const container = document.getElementById('viewer-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
//  Render loop
// ─────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────

loadHDRI();
loadModel();
animate();
