// ============================================================================
// floraLab.ts -- THE FLORA LAB (flora-lab.html): look at the island's sci-fi
// flora one species at a time, or all together, by day and by night.
//
// What it shows: each species on a patch of the island's ground (Joshua's
// approved colours), a 1.7 m capsule beside it for scale (her height, about),
// drawn exactly as the game will draw them: one InstancedMesh per model, the
// two shared flora materials, each glowing plant given its glow colour.
//
// Its controls (a strip along the top):
//   * one button per species variant, and ALL (the group);
//   * DAY / NIGHT: the island's daylight, or a dark sky and low light, with the
//     flora's night glow turned up (floraMaterial.ts `night`);
//   * NEAR / FAR: the close model or the light one;
//   * HUE: every glowing plant in its own colour, or all in one of the six;
//   * WIRE: the triangles.
// Drag to turn the view, pinch or wheel to zoom.
//
// The line at the bottom: the species, its sizes, how it glows, and its
// triangles near and far.
//
// For test scripts: flora-lab.html?s=<id or all>&night=1&lod=far&hue=cyan&wire=1, and window.floraLab (show, setNight,
// setLod, setHue, setWire, view, ready).
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FLORA_HUES, FLORA_HUE_NAMES, makeFloraMaterials, setGlowHue, type FloraHue } from './world/island/flora/floraMaterial';
import { FLORA_IDS, GROUND, buildFlora, triangles, type FloraId, type FloraModel } from './world/island/flora/floraModels';
import { FLORA_SPECIES, floraSpecies } from './world/island/flora/floraSpecies';
import { fbm, mix } from './world/island/flora/floraKit';

const host = document.getElementById('app')!, panel = document.getElementById('panel')!, status = document.getElementById('status')!;
const query = new URLSearchParams(location.search);

// ---- the scene: lit as the island is (no tone mapping, its two plain lights) ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sky = new THREE.HemisphereLight(0xcfe0ff, 0x1a2740, 1.7);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-40, 100, 60);
scene.add(sun);
const DAY = { background: 0xbcc6cc, sky: [0xcfe0ff, 0x1a2740, 1.7], sun: [0xffffff, 1.5], fog: [220, 1800] } as const;
const NIGHT = { background: 0x05070d, sky: [0x3a4a70, 0x06070b, 0.32], sun: [0x9db3e6, 0.22], fog: [70, 520] } as const;
scene.fog = new THREE.Fog(DAY.background, DAY.fog[0], DAY.fog[1]);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
function resize(): void {
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
/** Look at `target` from `dist` away, `turn` degrees round (0 = from +z) and `tilt` degrees above level. */
function view(turn: number, tilt: number, dist: number, target: [number, number, number]): void {
  const a = (turn * Math.PI) / 180, e = (tilt * Math.PI) / 180;
  controls.target.set(...target);
  camera.position.set(target[0] + Math.sin(a) * Math.cos(e) * dist, target[1] + Math.sin(e) * dist, target[2] + Math.cos(a) * Math.cos(e) * dist);
  controls.update();
}

// ---- the ground: a patch of the island in its approved colours (grass with teal patches, forest floor where the
// flora stands, a soil path, sand far out), coloured point by point ----
{
  const size = 420, segs = 280;
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n1 = fbm(x * 0.05, 0, z * 0.05, 3), n2 = fbm(x * 0.17, 1, z * 0.17, 5), d = Math.hypot(x, z + 12);
    let c = mix(GROUND.grass, GROUND.teal, Math.max(0, n1 - 0.45) * 3);
    // (forest floor round where the flora stands, broken at its edge)
    c = mix(c, mix(GROUND.forest, GROUND.forestLight, n2), 1 - Math.min(1, Math.max(0, (d - 18 - n1 * 16) / 10)));
    // (a soil path winding across)
    const path = Math.abs(z - 9 - Math.sin(x * 0.06) * 6) - 1.2 - n2 * 1.5;
    c = mix(c, mix(GROUND.soil, GROUND.soilDark, n2), 1 - Math.min(1, Math.max(0, path / 1.2)));
    // (flecks of the violet mineral and bare rock)
    c = mix(c, GROUND.violet, Math.max(0, n2 - 0.72) * 3);
    c = mix(c, GROUND.rock, Math.max(0, fbm(x * 0.4, 2, z * 0.4, 9) - 0.74) * 3);
    // (sand far out)
    c = mix(c, mix(GROUND.sand, GROUND.sandDark, n2), Math.min(1, Math.max(0, (d - 120 - n1 * 40) / 30)));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.name = 'lab-ground';
  scene.add(ground);
}

// ---- the 1.7 m stand-in (a capsule: 1.26 m of tube and 0.22 m round, so 1.7 m tall) ----
const human = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.26, 6, 14), new THREE.MeshStandardMaterial({ color: 0xe0743a, roughness: 0.6 }));
human.name = 'lab-human-1.7m';
scene.add(human);

// ---- a basalt slab for the shelf tiers to grow on (lab only; in the game: a cliff, a trunk, a giant's stem) ----
const slab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 1.2), new THREE.MeshStandardMaterial({ color: GROUND.basalt, roughness: 0.95 }));
slab.name = 'lab-slab';
scene.add(slab);

// ---- the flora: both materials, and an InstancedMesh per model, made when first shown ----
const flora = makeFloraMaterials();
const models = new Map<FloraId, FloraModel>();
const meshes = new Map<string, THREE.InstancedMesh>();
function meshFor(id: FloraId, lod: 'near' | 'far'): THREE.InstancedMesh {
  const key = `${id}-${lod}`;
  let mesh = meshes.get(key);
  if (!mesh) {
    if (!models.has(id)) models.set(id, buildFlora(id));
    const material = floraSpecies(id).material === 'glow' ? flora.glow : flora.lit;
    mesh = new THREE.InstancedMesh(models.get(id)![lod], material, 12);
    mesh.name = `flora-${key}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.set(key, mesh);
  }
  return mesh;
}

/** One planted plant in the lab: where, how tall (metres), turned how far (radians), its glow colour. */
interface Plant { id: FloraId; x: number; z: number; h: number; turn: number; hue?: FloraHue; y?: number }
/** What each button shows: its plants, and where the capsule and the slab stand. */
interface Scene { plants: Plant[]; human: [number, number]; slab?: [number, number, number]; look?: { turn?: number; tilt?: number; from?: [number, number, number]; at?: [number, number, number] } }

const one = (id: FloraId, plants: [number, number, number, number][], humanAt: [number, number]): Scene => ({
  plants: plants.map(([x, z, h, turn]) => ({ id, x, z, h, turn })), human: humanAt,
});
const SCENES: Record<FloraId | 'all', Scene> = {
  lanternCap: one('lanternCap', [[0, 0, 12, 0.3], [-9, -7, 8.5, 2.2]], [3.2, 2.6]),
  umberParasol: one('umberParasol', [[0, 0, 10, 0.5], [9, -7, 14, 3.4]], [3, 2.6]),
  skyParasol: one('skyParasol', [[0, 0, 30, 0.2]], [4.5, 3.5]),
  rustCrown: one('rustCrown', [[0, 0, 26, 1.1]], [4.5, 3.5]),
  glowbellCluster: one('glowbellCluster', [[0, 0, 1.4, 0.2], [-1.9, -0.8, 0.6, 1.7], [2.2, -1.6, 3.6, 4]], [1.1, 1.3]),
  buttonCluster: one('buttonCluster', [[0, 0, 0.8, 0.4], [-1.4, -0.5, 0.35, 2.2], [1.8, -1.4, 2.4, 5]], [1.0, 1.2]),
  bracketBoulder: one('bracketBoulder', [[0, 0, 2.2, 0.7], [-3.2, -2.4, 1.2, 3.1]], [2.2, 1.6]),
  bracketTiers: { plants: [{ id: 'bracketTiers', x: -0.6, z: 0, h: 2.4, turn: 0, y: 0.1 }, { id: 'bracketTiers', x: 0.95, z: 0, h: 1.2, turn: 0, y: 1.3 }], human: [2.2, 1.4], slab: [0, 1.6, -0.6] },
  siphonCoral: one('siphonCoral', [[0, 0, 1.8, 0.3], [-1.5, -0.9, 0.9, 2.5], [1.5, -1.4, 2.7, 4.4]], [1.4, 1.3]),
  crescentFern: one('crescentFern', [[0, 0, 2.0, 0.6], [-2.6, -1.4, 1.2, 2.9]], [2.0, 1.6]),
  sporePods: one('sporePods', [[0, 0, 1.6, 0.1], [-1.6, -0.9, 0.9, 2.3]], [1.4, 1.2]),
  // ALL OF THEM: the giants behind, the tall caps between, the small flora in front round the capsule
  all: {
    plants: [
      { id: 'skyParasol', x: 4, z: -34, h: 31, turn: 0.4 },
      { id: 'rustCrown', x: -24, z: -44, h: 24, turn: 1.2 },
      { id: 'lanternCap', x: -10, z: -13, h: 12, turn: 2.0 },
      { id: 'umberParasol', x: 12, z: -16, h: 10.5, turn: 0.9 },
      { id: 'glowbellCluster', x: -2.6, z: 1.6, h: 1.3, turn: 0.3 },
      { id: 'buttonCluster', x: -1.2, z: 3.2, h: 0.7, turn: 1.4 },
      { id: 'bracketBoulder', x: 3.8, z: 0.2, h: 2.0, turn: 2.6 },
      { id: 'siphonCoral', x: -5, z: -0.8, h: 1.8, turn: 0.2 },
      { id: 'crescentFern', x: 1.2, z: -3, h: 2.1, turn: 0.5 },
      { id: 'sporePods', x: 6.2, z: -2.6, h: 1.6, turn: 1.0 },
      { id: 'bracketTiers', x: -8.7, z: -5.4, h: 2.6, turn: 0, y: 0.1 },
    ],
    human: [0.4, 2.6], slab: [-8.1, 1.6, -6],
    // (from just over head height, looking up a little: the giants whole, the capsule and the small flora near)
    look: { from: [-1.5, 1.9, 17.5], at: [-1, 10.5, -20] },
  },
};

// ---- the lab's state ----
let shown: FloraId | 'all' = (query.get('s') && (FLORA_IDS as string[]).concat('all').includes(query.get('s')!) ? query.get('s') : 'lanternCap') as FloraId | 'all';
let night = query.get('night') === '1';
let lod: 'near' | 'far' = query.get('lod') === 'far' ? 'far' : 'near';
let hueMode: FloraHue | 'own' = (FLORA_HUE_NAMES as string[]).includes(query.get('hue') ?? '') ? (query.get('hue') as FloraHue) : 'own';
let wire = query.get('wire') === '1';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();
/** Put the plants of the shown scene into their instanced meshes (the others emptied). */
function place(): void {
  for (const mesh of meshes.values()) { mesh.count = 0; mesh.visible = false; }
  const sc = SCENES[shown];
  const counts = new Map<string, number>();
  // (in ALL, each glowing species its own colour; one species alone, its plants in two colours to show the choice)
  const ownHues: FloraHue[] = ['violet', 'cyan', 'emerald', 'amber', 'magenta', 'crimson'];
  sc.plants.forEach((p, k) => {
    const mesh = meshFor(p.id, lod);
    const i = counts.get(mesh.name) ?? 0;
    counts.set(mesh.name, i + 1);
    q.setFromAxisAngle(up, p.turn);
    m4.compose(pv.set(p.x, p.y ?? 0, p.z), q, sv.setScalar(p.h));
    mesh.setMatrixAt(i, m4);
    mesh.count = i + 1;
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
    const sp = floraSpecies(p.id);
    if (sp.material === 'glow') {
      const own = shown === 'all' ? sp.hue! : (k === 0 ? sp.hue! : ownHues[(ownHues.indexOf(sp.hue!) + 3) % ownHues.length]);
      setGlowHue(mesh, i, hueMode === 'own' ? own : hueMode);
    }
  });
  // (the capsule BESIDE the first plant, on the right as the camera looks, a little behind its middle; in ALL where set)
  if (shown === 'all') human.position.set(sc.human[0], 0.85, sc.human[1]);
  else {
    const p = sc.plants[0], turn = ((sc.look?.turn ?? 24) * Math.PI) / 180;
    const off = reachOf(p) * (floraSpecies(p.id).family === 'giant cap' || floraSpecies(p.id).family === 'tall cap' ? 0.55 : 1) + 0.6;
    human.position.set(p.x + Math.cos(turn) * off + Math.sin(turn) * -0.2, 0.85, p.z - Math.sin(turn) * off + Math.cos(turn) * -0.2);
    if (p.id === 'bracketTiers') human.position.set(2.4, 0.85, 0.9);
  }
  slab.visible = !!sc.slab;
  if (sc.slab) slab.position.set(...sc.slab);
}

/**
 * Frame the shown scene: its plants and the capsule all in view, from a little above the ground (low enough to see
 * under the caps), turned a little off the front.
 */
function frame(): void {
  const sc = SCENES[shown];
  if (sc.look?.from && sc.look.at) {
    camera.position.set(...sc.look.from);
    controls.target.set(...sc.look.at);
    controls.update();
    return;
  }
  const box = new THREE.Box3();
  for (const p of sc.plants) {
    const r = reachOf(p);
    box.expandByPoint(new THREE.Vector3(p.x - r, 0, p.z - r));
    box.expandByPoint(new THREE.Vector3(p.x + r, (p.y ?? 0) + p.h, p.z + r));
  }
  box.expandByPoint(new THREE.Vector3(human.position.x, 1.7, human.position.z));
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const vfov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const wide = Math.hypot(size.x, size.z);
  // FROM EYE HEIGHT (1.7 m), as she would see them: far enough back that the ground at the foot and the top both fit
  const eye = 1.7;
  let dist = (wide / 2) / Math.tan(hfov / 2) * 1.1 + wide * 0.35;
  for (let k = 0; k < 80 && Math.atan(Math.max(0, size.y - eye) / dist) + Math.atan(eye / dist) > vfov * 0.82; k++) dist *= 1.06;
  const middle = (Math.atan(Math.max(0, size.y - eye) / dist) - Math.atan(eye / dist)) / 2;
  // (that distance is to the group's middle: the nearest of them is closer by half its depth)
  dist += wide * 0.35;
  const turn = ((sc.look?.turn ?? 24) * Math.PI) / 180;
  camera.position.set(centre.x + Math.sin(turn) * dist, eye, centre.z + Math.cos(turn) * dist);
  controls.target.set(centre.x, eye + Math.tan(middle) * dist, centre.z);
  controls.update();
}

/** How far a plant spreads round its foot (metres), roughly. */
function reachOf(p: Plant): number {
  const f = floraSpecies(p.id).family;
  return p.h * (f === 'giant cap' ? 0.42 : f === 'tall cap' ? 0.32 : p.id === 'crescentFern' ? 0.62 : 0.45);
}

function setNight(on: boolean): void {
  night = on;
  const L = on ? NIGHT : DAY;
  scene.background = new THREE.Color(L.background);
  (scene.fog as THREE.Fog).color.set(L.background);
  (scene.fog as THREE.Fog).near = L.fog[0];
  (scene.fog as THREE.Fog).far = L.fog[1];
  sky.color.set(L.sky[0]); sky.groundColor.set(L.sky[1]); sky.intensity = L.sky[2];
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1];
  if (on) sun.position.set(50, 80, -30); else sun.position.set(-40, 100, 60);
  // THE FLORA'S NIGHT: the game will ease this from 0 to 1 over dusk
  flora.uniforms.night.value = on ? 1 : 0;
  render();
}

// ---- the buttons ----
const buttons = new Map<string, HTMLButtonElement>();
function button(key: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  panel.appendChild(b);
  buttons.set(key, b);
  return b;
}
const SHORT: Record<FloraId, string> = {
  lanternCap: 'Lantern', umberParasol: 'Umber', skyParasol: 'Sky', rustCrown: 'Rust', glowbellCluster: 'Glowbell',
  buttonCluster: 'Button', bracketBoulder: 'Boulder', bracketTiers: 'Tiers', siphonCoral: 'Coral', crescentFern: 'Fern', sporePods: 'Pods',
};
for (const id of FLORA_IDS) button(id, SHORT[id], () => show(id));
button('all', 'ALL', () => show('all'));
panel.appendChild(Object.assign(document.createElement('span'), { className: 'gap' }));
button('night', 'NIGHT', () => { setNight(!night); refresh(); });
button('lod', 'FAR', () => { setLod(lod === 'near' ? 'far' : 'near'); });
button('hue', 'HUE: own', () => { const all: (FloraHue | 'own')[] = ['own', ...FLORA_HUE_NAMES]; setHue(all[(all.indexOf(hueMode) + 1) % all.length]); });
button('wire', 'WIRE', () => setWire(!wire));

function refresh(): void {
  for (const id of [...FLORA_IDS, 'all']) buttons.get(id)!.classList.toggle('on', id === shown);
  buttons.get('night')!.classList.toggle('on', night);
  buttons.get('lod')!.classList.toggle('on', lod === 'far');
  buttons.get('wire')!.classList.toggle('on', wire);
  buttons.get('hue')!.textContent = `HUE: ${hueMode}`;
  // THE LINE AT THE BOTTOM
  if (shown === 'all') {
    let near = 0, far = 0;
    for (const p of SCENES.all.plants) { const m = models.get(p.id)!; near += triangles(m.near); far += triangles(m.far); }
    const draws = [...meshes.values()].filter((m) => m.visible && m.count > 0).length;
    status.textContent = `ALL ${FLORA_SPECIES.length} variants · capsule 1.7 m · ${lod.toUpperCase()} · ${draws} draws\n`
      + `one of each: ${near.toLocaleString()} triangles near, ${far.toLocaleString()} far${night ? ' · NIGHT' : ''}`;
  } else {
    const sp = floraSpecies(shown), m = models.get(shown)!;
    status.textContent = `${sp.name} · ${sp.family} · ${sp.sizeM[0]}-${sp.sizeM[1]} m · glow: ${sp.glows}\n`
      + `near ${triangles(m.near).toLocaleString()} ▲ ${m.near.getAttribute('position').count.toLocaleString()} pts · far ${triangles(m.far).toLocaleString()} ▲ ${m.far.getAttribute('position').count.toLocaleString()} pts · showing ${lod.toUpperCase()} · capsule 1.7 m${night ? ' · NIGHT' : ''}`;
  }
  render();
}

function show(id: FloraId | 'all'): void { shown = id; place(); frame(); refresh(); }
function setLod(l: 'near' | 'far'): void { lod = l; place(); refresh(); }
function setHue(h: FloraHue | 'own'): void { hueMode = h; place(); refresh(); }
function setWire(on: boolean): void { wire = on; flora.lit.wireframe = flora.glow.wireframe = wire; refresh(); }

// ---- drawing: every frame while the view moves (and for the wind and the glow's breath) ----
const timer = new THREE.Timer();
let frames = 0;
function render(): void { renderer.render(scene, camera); }
renderer.setAnimationLoop(() => {
  timer.update();
  flora.uniforms.time.value = timer.getElapsed();
  controls.update();
  render();
  frames++;
  if (frames === 3) lab.ready = true;
});

// ---- for test scripts ----
const lab = {
  ready: false,
  show, setNight, setLod, setHue, setWire, view,
  hues: FLORA_HUES,
  uniforms: flora.uniforms,
};
(window as unknown as { floraLab: typeof lab }).floraLab = lab;

flora.lit.wireframe = flora.glow.wireframe = wire;
setNight(night);
show(shown);
