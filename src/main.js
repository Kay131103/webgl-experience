import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ------------------------------------------------------------------
 *  NEBULA — an interactive GPU particle galaxy.
 *  Every particle lives on the GPU; JS only updates a few uniforms
 *  per frame (time, pointer world position, audio level), so it
 *  stays smooth even with tens of thousands of particles.
 * ------------------------------------------------------------------ */

const COUNT = window.innerWidth < 700 ? 12000 : 25000;
const canvas = document.querySelector("#scene");

/* ---------- renderer / scene / camera ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050510");

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3.2, 7.5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.minDistance = 2.5;
controls.maxDistance = 20;

/* ---------- galaxy geometry ---------- */
const COUNT_COLORS = 2;
const palette = [
  { inside: new THREE.Color("#ffb37b"), outside: new THREE.Color("#5a8dff") }, // amber → blue
  { inside: new THREE.Color("#ff7bd5"), outside: new THREE.Color("#7c6cff") }, // pink → violet
  { inside: new THREE.Color("#a5ffb0"), outside: new THREE.Color("#37b6ff") }, // mint → cyan
];
let paletteIndex = 0;

const geometry = new THREE.BufferGeometry();
{
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const randoms = new Float32Array(COUNT);
  const mixes = new Float32Array(COUNT);

  const branches = 4;
  const radiusMax = 5.5;
  const spin = 1.15;
  const randomness = 0.32;
  const randPow = 2.6;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const r = Math.random() * radiusMax;
    const branchAngle = ((i % branches) / branches) * Math.PI * 2;
    const spinAngle = r * spin;

    const rx = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * randomness * r;
    const ry = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * randomness * r * 0.55;
    const rz = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * randomness * r;

    positions[i3] = Math.cos(branchAngle + spinAngle) * r + rx;
    positions[i3 + 1] = ry;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + rz;

    mixes[i] = r / radiusMax;
    scales[i] = Math.random();
    randoms[i] = Math.random();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColorMix", new THREE.BufferAttribute(mixes, 1));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/* ---------- shaders ---------- */
const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAudio;
uniform float uSize;
uniform vec3 uPointer;
uniform float uPointerActive;
attribute float aScale;
attribute float aRandom;
attribute float aColorMix;
varying float vMix;
varying float vAudio;

void main() {
  vec3 pos = position;

  // differential rotation — inner stars orbit faster
  float dist = length(pos.xz);
  float angle = uTime * (0.05 + 0.35 / max(dist, 0.6));
  float c = cos(angle);
  float s = sin(angle);
  pos.xz = mat2(c, -s, s, c) * pos.xz;

  // audio-reactive shimmer
  float pulse = sin(uTime * 4.0 + aRandom * 40.0) * 0.5 + 0.5;
  pos.y += pulse * uAudio * 0.9 * aRandom;
  vAudio = uAudio;

  // pointer gravity-well — particles bend away from the cursor
  if (uPointerActive > 0.5) {
    vec3 toPointer = uPointer - pos;
    float d = length(toPointer);
    float force = exp(-d * d * 1.4) * 1.6;
    pos -= normalize(toPointer + 0.0001) * force;
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float size = uSize * aScale * (1.0 + uAudio * 2.0 * pulse * aRandom);
  gl_PointSize = clamp(size * (180.0 / -mv.z), 0.5, 28.0);
  gl_Position = projectionMatrix * mv;
  vMix = aColorMix;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vMix;
varying float vAudio;

void main() {
  float d = distance(gl_PointCoord, vec2(0.5));
  float strength = pow(max(0.0, 1.0 - d * 2.0), 3.0);
  vec3 color = mix(uColorA, uColorB, vMix);
  color += vAudio * 0.35;
  gl_FragColor = vec4(color, strength);
}
`;

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uAudio: { value: 0 },
    uSize: { value: 1.4 * Math.min(window.devicePixelRatio, 2) },
    uPointer: { value: new THREE.Vector3(999, 999, 999) },
    uPointerActive: { value: 0 },
    uColorA: { value: palette[0].inside.clone() },
    uColorB: { value: palette[0].outside.clone() },
  },
});

const points = new THREE.Points(geometry, material);
scene.add(points);

function applyPalette(i) {
  material.uniforms.uColorA.value.copy(palette[i].inside);
  material.uniforms.uColorB.value.copy(palette[i].outside);
}

/* ---------- pointer → world position (gravity well) ---------- */
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(999, 999);
const plane = new THREE.Plane();
const camDir = new THREE.Vector3();
const hit = new THREE.Vector3(999, 999, 999);

window.addEventListener("pointermove", (e) => {
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
window.addEventListener("pointerleave", () => pointerNdc.set(999, 999));

function updatePointerWorld() {
  if (pointerNdc.x > 10) {
    material.uniforms.uPointerActive.value = 0;
    return;
  }
  camera.getWorldDirection(camDir);
  plane.setFromNormalAndCoplanarPoint(camDir, points.position);
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.ray.intersectPlane(plane, hit)) {
    material.uniforms.uPointer.value.copy(hit);
    material.uniforms.uPointerActive.value = 1;
  }
}

/* ---------- audio-reactive mode ---------- */
let audioCtx = null;
let analyser = null;
let audioData = null;
let audioLevel = 0;
const audioBtn = document.querySelector("#audioBtn");

audioBtn.addEventListener("click", async () => {
  if (audioCtx) {
    // off
    await audioCtx.close();
    audioCtx = null;
    analyser = null;
    audioBtn.textContent = "🎙 Audio-reactive: off";
    audioBtn.classList.remove("active");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    audioData = new Uint8Array(analyser.frequencyBinCount);
    audioBtn.textContent = "🎙 Audio-reactive: ON";
    audioBtn.classList.add("active");
  } catch (err) {
    audioBtn.textContent = "🎙 Mic blocked";
    console.warn(err);
  }
});

function updateAudio() {
  if (!analyser) return;
  analyser.getByteFrequencyData(audioData);
  let sum = 0;
  for (const v of audioData) sum += v;
  const target = Math.min(1, (sum / audioData.length / 255) * 2.2);
  audioLevel += (target - audioLevel) * 0.25;
  material.uniforms.uAudio.value = audioLevel;
}

/* ---------- UI ---------- */
const spinBtn = document.querySelector("#spinBtn");
spinBtn.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  spinBtn.classList.toggle("active", controls.autoRotate);
});

canvas.addEventListener("dblclick", () => {
  paletteIndex = (paletteIndex + 1) % palette.length;
  applyPalette(paletteIndex);
});

/* ---------- resize ---------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- loop ---------- */
const clock = new THREE.Clock();
const fpsEl = document.querySelector("#fps");
let frames = 0;
let fpsTimer = 0;

function tick() {
  const dt = clock.getDelta();
  material.uniforms.uTime.value += dt;

  updatePointerWorld();
  updateAudio();
  controls.update();
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = `${COUNT.toLocaleString()} particles · ${Math.round(frames / fpsTimer)} fps`;
    frames = 0;
    fpsTimer = 0;
  }
  requestAnimationFrame(tick);
}
tick();
