// ============================================================================
// main.ts -- Galaxy Defenders: Motherlands starts here.
//
// For now: the renderer, the frame loop and an empty scene. The world (dome,
// city, cameras) and the heroine are added in src/world and src/heroine.
// ============================================================================
import * as THREE from 'three';
import type { FrameInfo } from './core/contracts';

const MAX_STEP = 1 / 20; // a frame never counts for more than this many seconds

function start(): void {
  const host = document.getElementById('app');
  if (!host) throw new Error('the page has no #app');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060d);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 1.5, 0);

  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', fit);
  fit();

  let last = performance.now(), elapsed = 0;
  const frame = (now: number) => {
    const dt = document.hidden ? 0 : Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    last = now;
    elapsed += dt;
    const info: FrameInfo = { dt, elapsed };
    void info;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
