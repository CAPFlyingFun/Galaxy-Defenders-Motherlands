// ============================================================================
// armorLab.ts -- the ARMOR LAB (armor-lab.html): look at the armor on the real
// body.
//
// What it shows: the Character Builder's own body as a plain white mannequin,
// standing in the builder's standing pose with her feet posed for heels, and
// one heroine's rigid armor attached to her real bones.
//
// Its controls (a strip along the top):
//   * six buttons, one per heroine;
//   * ON BODY / PIECES: the armor on her, or every piece laid out on a grid;
//   * BELLY (0-200 %) and BUST sliders, driving her real shape keys, to see
//     the fit hold at every size;
//   * PLATES: show or hide the plates that follow her skin (belly shell,
//     chest, hips, thighs), built from her own skin surface;
//   * ARMS: hold her arms out, to see her sides (and that pieces follow bones);
//   * CHECK: test whether her skin pokes through any piece as she stands now.
// Drag to turn the view, pinch or wheel to zoom.
//
// The line at the bottom counts the armor's triangles and draw calls.
//
// armor-lab.html?measure=1 re-measures the body and shows the result, ready
// to be saved as src/armor/bodyFitData.ts (see lab/measure.ts).
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BODY_FIT } from './armor/bodyFitData';
import { HEROINE_IDS, HEROINE_LOOKS, type HeroineId } from './armor/looks';
import { attachRigidArmor, buildRigidArmor, type RigidArmor } from './armor/rigidArmor';
import { buildSkinPlates, type SkinPlates } from './armor/skinPlates';
import { loadMannequin, type Mannequin } from './armor/lab/mannequin';
import { measureBody } from './armor/lab/measure';
import { checkClearance } from './armor/lab/clearance';

const host = document.getElementById('app')!, panel = document.getElementById('panel')!, status = document.getElementById('status')!;
const query = new URLSearchParams(location.search);

// ---- The scene: simple lighting, as on a phone (one sky light, one sun, a little fill from behind) ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x262b34);
scene.add(new THREE.HemisphereLight(0xeaf0f8, 0x5a5f68, 1.3));
const sun = new THREE.DirectionalLight(0xfff2e2, 2.0);
sun.position.set(1.5, 2.8, 2.2);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbcd0ff, 0.7);
fill.position.set(-2, 1.5, -2);
scene.add(fill);
const gridLines = new THREE.GridHelper(6, 60, 0x66707e, 0x39404b);
scene.add(gridLines);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
/** Look at `target` from `distance` away, `turn` degrees round her (0 = from the front) and `tilt` degrees above level. */
function setView(turn: number, tilt: number, distance: number, target: [number, number, number] = [0, 0.95, 0]): void {
  const a = (turn * Math.PI) / 180, e = (tilt * Math.PI) / 180;
  controls.target.set(...target);
  camera.position.set(target[0] + Math.sin(a) * Math.cos(e) * distance, target[1] + Math.sin(e) * distance, target[2] + Math.cos(a) * Math.cos(e) * distance);
  controls.update();
}
function resize(): void {
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
setView(0, 4, 4.6);

// ---- The lab's state ----
let body: Mannequin | null = null;
let armor: RigidArmor | null = null;
let plates: SkinPlates | null = null;
let showPlates = query.get('plates') !== '0';
let dressing = 0; // (counts up each time she is re-dressed, so a slow build that has been overtaken is dropped)
let heroine: HeroineId = (HEROINE_IDS.includes(query.get('heroine') as HeroineId) ? query.get('heroine') : 'blaze') as HeroineId;
let view: 'body' | 'pieces' = 'body';
let armsOut = false;
let checkLine = '';
const laidOut = new THREE.Group(); // the pieces, when they are laid out on the grid
scene.add(laidOut);

/** (Re)build the heroine's armor and show it the way the view asks. */
function dress(): void {
  if (!body) return;
  armor?.dispose();
  armor = buildRigidArmor(HEROINE_LOOKS[heroine]);
  if (view === 'body') {
    body.root.visible = true;
    const missing = attachRigidArmor(armor, body.model);
    if (missing.length) console.warn('no bone found for', missing);
  } else {
    // PIECES: each piece alone, in its own frame, in rows on the grid.
    body.root.visible = false;
    const perRow = 4, gap = 0.4;
    Object.entries(armor.pieces).forEach(([slot, mesh], i) => {
      mesh.position.set(0, 0, 0);
      mesh.scale.setScalar(1);
      // (a gun is turned side-on, so its outline can be seen; everything else stands as it would on her, facing the camera)
      mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.startsWith('gun') ? -Math.PI / 2 : 0);
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      mesh.position.set(((i % perRow) - (perRow - 1) / 2) * gap - (box.min.x + box.max.x) / 2, 0.01 - box.min.y, -Math.floor(i / perRow) * gap * 1.1 - (box.min.z + box.max.z) / 2);
      laidOut.add(mesh);
    });
  }
  checkLine = '';
  showStatus();
  // Her skin-following plates (built a moment later: the skin has to be cut and thinned).
  plates?.dispose();
  plates = null;
  const turn = ++dressing;
  if (showPlates && view === 'body') {
    void buildSkinPlates(HEROINE_LOOKS[heroine], body.skin).then((made) => {
      if (turn !== dressing) { made.dispose(); return; }
      plates = made;
      (window as unknown as { platesReady: number }).platesReady = turn;
    });
  } else (window as unknown as { platesReady: number }).platesReady = turn;
}

/** Stand her up again (after a slider or the ARMS button). */
function pose(): void {
  body?.stand(BODY_FIT.heelPitch, BODY_FIT.soleLift, armsOut ? 0.9 : 0);
}

function showStatus(): void {
  if (!armor || !body) return;
  status.textContent = `${HEROINE_LOOKS[heroine].name} · rigid armor: ${armor.triangles.toLocaleString()} triangles, ${armor.drawCalls} draw calls`
    + (plates ? ` · skin plates: ${plates.triangles.toLocaleString()} triangles, 1 draw call` : '')
    + ` · whole view: ${renderer.info.render.triangles.toLocaleString()} triangles, ${renderer.info.render.calls} calls`
    + ` · belly ${body.belly}% bust ${body.bust}` + (checkLine ? `\n${checkLine}` : '');
}

// ---- The controls ----
function button(label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onTap);
  panel.appendChild(b);
  return b;
}
function slider(label: string, min: number, max: number, value: number, onChange: (v: number) => void): HTMLInputElement {
  const wrap = document.createElement('label'), input = document.createElement('input'), read = document.createElement('span');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(value);
  read.textContent = String(value);
  input.addEventListener('input', () => { read.textContent = input.value; onChange(+input.value); });
  wrap.append(label, input, read);
  panel.appendChild(wrap);
  return input;
}
const heroineButtons = new Map<HeroineId, HTMLButtonElement>();
const viewButtons: Record<string, HTMLButtonElement> = {};
function refreshButtons(): void {
  for (const [id, b] of heroineButtons) b.classList.toggle('on', id === heroine);
  viewButtons.body.classList.toggle('on', view === 'body');
  viewButtons.pieces.classList.toggle('on', view === 'pieces');
  viewButtons.arms.classList.toggle('on', armsOut);
  viewButtons.plates.classList.toggle('on', showPlates);
}
function setHeroine(id: HeroineId): void { heroine = id; dress(); refreshButtons(); }
function setViewMode(v: 'body' | 'pieces'): void {
  view = v;
  dress();
  refreshButtons();
  if (v === 'pieces') setView(0, 36, 4.6, [0, 0.1, -0.5]); else setView(0, 4, 4.6);
}
function setShape(belly: number, bust: number): void {
  if (!body) return;
  body.setShape(belly, bust);
  pose();
  checkLine = '';
}
function runCheck() {
  if (!body || !armor || view !== 'body') return null;
  const report = checkClearance(body, armor);
  const bad = Object.entries(report.pieces).filter(([, r]) => r.poking > 0).map(([slot, r]) => `${slot}: ${r.poking} points, up to ${(r.deepest * 1000).toFixed(1)} mm`);
  checkLine = bad.length ? `SKIN POKES THROUGH -> ${bad.join(' · ')}` : 'CHECK: no skin pokes through any piece';
  showStatus();
  return report;
}

for (const id of HEROINE_IDS) heroineButtons.set(id, button(HEROINE_LOOKS[id].name.toUpperCase(), () => setHeroine(id)));
const lineBreak = document.createElement('div');
lineBreak.className = 'gap';
panel.appendChild(lineBreak);
viewButtons.body = button('ON BODY', () => setViewMode('body'));
viewButtons.pieces = button('PIECES', () => setViewMode('pieces'));
const bellySlider = slider('BELLY %', 0, 200, 70, (v) => setShape(v, body?.bust ?? 0));
const bustSlider = slider('BUST', -100, 100, 0, (v) => setShape(body?.belly ?? 70, v));
viewButtons.arms = button('ARMS', () => { armsOut = !armsOut; pose(); refreshButtons(); });
viewButtons.plates = button('PLATES', () => { showPlates = !showPlates; dress(); refreshButtons(); });
button('CHECK', () => runCheck());

// ---- Start ----
loadMannequin().then((m) => {
  body = m;
  scene.add(m.root);
  if (query.get('measure')) {
    // Re-measure the body and show the result as text to save.
    const fit = measureBody(m);
    (window as unknown as { fit: unknown }).fit = fit;
    const box = document.createElement('textarea');
    box.value = JSON.stringify(fit);
    box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:40px;height:120px;user-select:text;-webkit-user-select:text';
    document.body.appendChild(box);
  }
  m.setShape(70, 0);
  pose();
  dress();
  refreshButtons();
  // (for looking at it from scripts)
  Object.assign(window as unknown as Record<string, unknown>, {
    lab: {
      body: m, scene, camera, renderer, THREE, setView, setHeroine, setViewMode, runCheck,
      setShape: (belly: number, bust: number) => { bellySlider.value = String(belly); bustSlider.value = String(bust); setShape(belly, bust); },
      setArms: (out: boolean) => { armsOut = out; pose(); refreshButtons(); },
      armor: () => armor, plates: () => plates,
      setPlates: (on: boolean) => { showPlates = on; dress(); refreshButtons(); },
    },
    labReady: true,
  });
}).catch((e) => {
  status.textContent = String(e?.stack ?? e);
  (window as unknown as { labError: string }).labError = String(e?.stack ?? e);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  showStatus();
});
