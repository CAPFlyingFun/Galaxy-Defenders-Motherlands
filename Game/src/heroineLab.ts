// ============================================================================
// heroineLab.ts -- the heroine's own test page (heroine-lab.html). A DEV TOOL.
//
// A plain floor, lights, the heroine, an orbit camera and a few buttons:
//   WALK (key W)          she walks a circle, the way the game will move her
//   AIM (key A)           both guns follow a magenta ball that flies round her
//   FIRE (key F / Space)  one shot, hands taking turns: recoil and a flash at the muzzle
//   BELLY slider          0-200 %, live
//   FIRST PERSON (key V)  the camera at her eye point; drag to look about
//
// Open it with `npm run dev` at /heroine-lab.html. Address options:
//   ?body=full | light    her full or light skin (default: chosen as the builder does, by device)
//   ?outfit=<name>        one of the builder's built-in outfits, e.g. ?outfit=painted long-sleeve tee + leggings
//   ?look=blaze           Joshua's Blaze exactly as he exported her from the Character Room (all pink)
//   ?look=blazeSuit       Blaze in pink and black: his export with black, edging and painted panels added
//   ?belly=<0-200>        her belly to start with (the default heroine only: a look brings its own belly)
//   ?heroine=fast         the FAST heroine (src/heroine/fast/: the game's "Body: Performance") in place of the
//                         builder's hosted room, wearing a baked look (?look=blazeSuit, the default, or ?look=blaze)
//   ?detail=auto|100|50|25|10|5|3|2|1   the fast heroine's detail (default 100 here, so pictures are of full detail)
//   ?hold                 start with the page's own frame loop stopped (for scripts; see below)
//
// For scripts (screenshots without waiting on a slow software renderer): `window.heroineLab` has `hold(true)` to
// stop the page's own frame loop, `advance(frames, dt)` to run frames by hand, and `picture()` to get the canvas.
// ============================================================================
import { BLAZE_LOOK } from './heroine/looks/blaze';
import { BLAZE_SUIT_LOOK } from './heroine/looks/blazeSuit';
import { DEFAULT_BELLY, type HeroineLook } from './heroine/heroineLook';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FrameInfo, Hand } from './core/contracts';
import { createBuilderHeroine, type BuilderHeroine } from './heroine/builderHeroine';
import { createFastHeroine, type FastHeroine } from './heroine/fast/fastHeroine';
import { nearestDetail } from './heroine/fast/detailLevels';
import { lookKey } from './heroine/looks';
import { BLAZE_PAINTED } from './heroine/fast/devRoomLook';

const MAX_STEP = 1 / 20;        // a frame never counts for more than this many seconds
const WALK_SPEED = 1.1;         // metres a second: the builder's own walking pace
/** A ground speed a test asked for (see `speed` on window.heroineLab); 0: none. */
const testSpeed = { value: Number(new URLSearchParams(location.search).get('speed') ?? 0) || 0 };
const WALK_RADIUS = 2.2;        // the circle she walks, metres

async function start(): Promise<void> {
  const host = document.getElementById('app')!, panel = document.getElementById('panel')!, status = document.getElementById('status')!;
  const asked = new URLSearchParams(location.search);

  // ---- renderer, scene, lights, floor ----------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2028);
  // The same four lights the Character Room itself uses, so she can be compared with the builder side by side.
  // (In the game the WORLD lights her; these are only this page's.)
  scene.add(new THREE.HemisphereLight(0xe8eef6, 0x5a5f68, 1.35));
  const key = new THREE.DirectionalLight(0xfff2e2, 2.0); key.position.set(1.5, 2.8, 2.2);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.9); rim.position.set(-2, 1.8, -2);
  const under = new THREE.DirectionalLight(0xffeedd, 0.7); under.position.set(0.6, -1.0, 2.0);
  scene.add(key, rim, under);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x2b313a, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  // A grid of one-metre squares: her size and her steps can be read against it.
  const grid = new THREE.GridHelper(12, 12, 0x5a6678, 0x3a4350);
  grid.position.y = 0.002;
  scene.add(floor, grid);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 200);
  camera.position.set(1.5, 1.35, 3.6);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.95, 0);
  orbit.enableDamping = true;

  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', fit);
  fit();

  // ---- the heroine -------------------------------------------------------------------------------------------------
  const began = performance.now();
  const body = asked.get('body');
  // The saved looks this page can show, by the name in the address (?look=blaze, ?look=blazeSuit).
  const looks: Record<string, HeroineLook> = { blaze: BLAZE_LOOK, blazeSuit: BLAZE_SUIT_LOOK };
  const look: HeroineLook | undefined = looks[asked.get('look') ?? ''];
  // The belly she starts with: a look's own (Blaze is 100), else the address's ?belly, else the default heroine's.
  const startBelly = look ? look.body.bump : asked.has('belly') ? Number(asked.get('belly')) : DEFAULT_BELLY;
  // Which heroine: the fast one (?heroine=fast) or the builder's hosted room.
  const fast = asked.get('heroine') === 'fast';
  let heroine: BuilderHeroine | FastHeroine;
  if (fast) {
    const detail = asked.get('detail');
    heroine = await createFastHeroine({
      renderer,
      scene,
      look: lookKey(asked.get('look')),
      // (her real suit; ?suit=tee wears the DEV Room's painted tee instead: see fast/devRoomLook.ts)
      painted: asked.get('suit') === 'tee' ? BLAZE_PAINTED : undefined,
      detail: detail === 'auto' ? 'auto' : detail === 'autoLive' ? 'autoLive' : nearestDetail(Number(detail ?? 100) || 100),
      onProgress: (stage) => { status.textContent = `Loading the fast heroine: ${stage}…`; },
    });
    scene.add(heroine.root);
  } else {
    const room = await createBuilderHeroine({
      renderer,
      scene,
      belly: asked.has('belly') ? Number(asked.get('belly')) : undefined,
      outfit: asked.get('outfit') ?? undefined,
      // ?look=...: one of the saved looks in place of the default heroine
      look,
      lightSkin: body === 'full' ? false : body === 'light' ? true : 'auto',
      onProgress: (stage) => { status.textContent = `Loading the heroine: ${stage}…`; },
    });
    scene.add(room.root);
    await room.warmUp(scene, camera);
    heroine = room;
  }
  const loadSeconds = (performance.now() - began) / 1000;

  // ---- the aim target: a small magenta ball flying round her ------------------------------------------------------
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2fb0 }));
  ball.visible = false;
  scene.add(ball);
  // A flash at a muzzle for a few frames after a shot: it shows where `muzzle()` says the shot leaves.
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  flash.visible = false;
  scene.add(flash);
  // A thin line from each muzzle to the target while aiming: are the guns really pointing at it?
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)), new THREE.LineBasicMaterial({ color: 0xff2fb0, transparent: true, opacity: 0.5 }));
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);

  // ---- state and controls -----------------------------------------------------------------------------------------
  const state = { walk: false, aim: false, firstPerson: false, aimTime: 0, walkAngle: 0, flashLeft: 0, nextHand: 'right' as Hand, look: { yaw: 0, pitch: -0.5 } };
  /** A script may hold the target still at one point (null: it flies its usual path). */
  let heldTarget: THREE.Vector3 | null = null;
  const button = (label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => onClick(b));
    panel.appendChild(b);
    return b;
  };
  const walkButton = button('WALK', (b) => { state.walk = !state.walk; b.classList.toggle('on', state.walk); });
  const aimButton = button('AIM', (b) => { state.aim = !state.aim; b.classList.toggle('on', state.aim); });
  const fireButton = button('FIRE', () => fire());
  const fpButton = button('FIRST PERSON', (b) => { state.firstPerson = !state.firstPerson; b.classList.toggle('on', state.firstPerson); heroine.setFirstPerson(state.firstPerson); orbit.enabled = !state.firstPerson;
    // (a wider lens in first person, as a game's would be)
    camera.fov = state.firstPerson ? 70 : 40; camera.updateProjectionMatrix(); });
  const bellyLabel = document.createElement('label');
  const bellySlider = document.createElement('input');
  bellySlider.type = 'range'; bellySlider.min = '0'; bellySlider.max = '200'; bellySlider.value = String(Math.max(0, Math.min(200, Math.round(startBelly))));   // (the slider and its label start at the belly she really has)
  const bellyText = document.createElement('span');
  const showBelly = () => { bellyText.textContent = `BELLY ${bellySlider.value}%`; };
  bellySlider.addEventListener('input', () => { heroine.setBelly(Number(bellySlider.value)); showBelly(); });
  showBelly();
  bellyLabel.append(bellyText, bellySlider);
  panel.appendChild(bellyLabel);

  const muzzlePoint = new THREE.Vector3();
  function fire(): void {
    const hand = state.nextHand;
    state.nextHand = hand === 'left' ? 'right' : 'left';
    heroine.fire(hand);
    flash.position.copy(heroine.muzzle(hand, muzzlePoint));
    state.flashLeft = 0.07;
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyW') walkButton.click();
    else if (e.code === 'KeyA') aimButton.click();
    else if (e.code === 'KeyF' || e.code === 'Space') fireButton.click();
    else if (e.code === 'KeyV') fpButton.click();
  });
  // First person: drag to look about (the orbit camera is off then).
  let dragging = false;
  renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || !state.firstPerson) return;
    state.look.yaw -= e.movementX * 0.005;
    state.look.pitch = Math.max(-1.45, Math.min(1.2, state.look.pitch - e.movementY * 0.005));
  });

  // ---- one frame -----------------------------------------------------------------------------------------------
  const target = new THREE.Vector3(), eye = new THREE.Vector3(), lookDir = new THREE.Vector3();
  let elapsed = 0, fps = 0;
  function frame(dt: number, draw = true): void {
    elapsed += dt;
    // WALK: the page moves her root round a circle and turns her along it; her legs are the builder's own walk.
    if (state.walk) state.walkAngle += (WALK_SPEED / WALK_RADIUS) * dt;
    const walked = state.walkAngle > 0;
    if (walked) {
      heroine.setPosition(Math.sin(state.walkAngle) * WALK_RADIUS - 0, Math.cos(state.walkAngle) * WALK_RADIUS - WALK_RADIUS);
      heroine.setYaw(state.walkAngle + Math.PI / 2);
    }
    // (?speed= or a test script's `heroineLab.speed` walks her at that ground speed, to see her stride at a jog or a run)
    heroine.setWalk(testSpeed.value > 0 ? testSpeed.value : state.walk ? WALK_SPEED : 0);

    // AIM: the ball flies a slow figure round her front, high and low, a few metres out.
    if (state.aim) {
      state.aimTime += dt;
      if (heldTarget) target.copy(heldTarget);
      else {
        const t = state.aimTime, bearing = heroine.root.rotation.y + Math.sin(t * 0.6) * 1.1;
        target.set(heroine.root.position.x + Math.sin(bearing) * 5, 1.6 + Math.sin(t * 0.9) * 1.5 + 1.2, heroine.root.position.z + Math.cos(bearing) * 5);
      }
      ball.position.copy(target);
      heroine.aimAt(target);
    } else heroine.aimAt(null);
    ball.visible = state.aim;

    const info: FrameInfo = { dt, elapsed };
    heroine.update(info);

    // the lines from the muzzles to the target, and the flash
    lines.visible = state.aim;
    if (state.aim) {
      const p = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      heroine.muzzle('left', muzzlePoint); p.setXYZ(0, muzzlePoint.x, muzzlePoint.y, muzzlePoint.z); p.setXYZ(1, target.x, target.y, target.z);
      heroine.muzzle('right', muzzlePoint); p.setXYZ(2, muzzlePoint.x, muzzlePoint.y, muzzlePoint.z); p.setXYZ(3, target.x, target.y, target.z);
      p.needsUpdate = true;
    }
    state.flashLeft -= dt;
    flash.visible = state.flashLeft > 0;

    // the camera: at her eye in first person (looking where the drag points, relative to her facing), else orbiting her
    if (state.firstPerson) {
      heroine.eye(eye);
      const yaw = heroine.root.rotation.y + state.look.yaw;
      lookDir.set(Math.sin(yaw) * Math.cos(state.look.pitch), Math.sin(state.look.pitch), Math.cos(yaw) * Math.cos(state.look.pitch));
      camera.position.copy(eye);
      camera.lookAt(eye.add(lookDir));
    } else {
      if (walked) orbit.target.set(heroine.root.position.x, 0.95, heroine.root.position.z);
      orbit.update();
    }
    if (draw) renderer.render(scene, camera);
  }

  const showStatus = () => {
    const s = heroine.stats(), r = renderer.info.render;
    // (what is particular to each heroine: the room's cloth tee, the fast body's detail level)
    const extra = 'clothTee' in s ? (s.clothTee ? ' (cloth tee simulated)' : '') : ` · detail ${s.detail}%${s.auto ? ' (auto)' : ''}`;
    status.textContent = `${fast ? 'FAST' : 'ROOM'} · ${heroine.height.toFixed(2)} m tall · her: ${s.triangles.toLocaleString()} triangles in ${s.drawCalls} draws · frame: ${r.triangles.toLocaleString()} triangles, ${r.calls} draws\n`
      + `her update ${s.updateMs.toFixed(2)} ms of CPU a frame${extra} · ${fps.toFixed(0)} FPS here · loaded in ${loadSeconds.toFixed(1)} s`;
  };

  // ---- the page's own loop, and the hooks a script can use instead ---------------------------------------------------
  let held = asked.has('hold'), last = performance.now();
  const loop = (now: number) => {
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    if (!held && !document.hidden) {
      frame(Math.min(MAX_STEP, raw));
      if (raw > 0) fps += (1 / raw - fps) / 10;
      showStatus();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  (window as unknown as Record<string, unknown>).heroineLab = {
    heroine, scene, camera, renderer, orbit, state, THREE,
    hold: (on: boolean) => { held = on; },
    // run `frames` frames; only the last one is drawn (a software renderer takes about a second a picture)
    /** Walk her at this ground speed, metres a second (0: as the WALK button says). */
    set speed(value: number) { testSpeed.value = value; },
    advance: (frames: number, dt = 1 / 30) => { for (let k = 0; k < frames; k++) frame(dt, k === frames - 1); showStatus(); return heroine.stats(); },
    // the picture as it is drawn now, as a JPEG data address (drawn and copied in one go)
    picture: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.92); },
    holdTarget: (x: number, y: number, z: number) => { heldTarget = new THREE.Vector3(x, y, z); },
    freeTarget: () => { heldTarget = null; },
    fire,
  };
  showStatus();
}

start().catch((error) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `The heroine did not load: ${String((error as Error)?.stack ?? error)}`;
  (window as unknown as Record<string, unknown>).heroineLabError = String((error as Error)?.stack ?? error);
  console.error(error);
});
