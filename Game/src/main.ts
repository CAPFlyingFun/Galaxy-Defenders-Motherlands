// ============================================================================
// main.ts -- Galaxy Defenders: Motherlands starts here.
//
// This file builds the pieces and runs the game loop:
//   the WORLD     dome, city, ground, sky               (src/world)
//   the HEROINE   made by createHeroine() just below     (src/heroine)
//   the CAMERAS   third person and first person          (src/camera)
//   the CONTROLS  touch, mouse, keyboard and the HUD      (src/input, src/ui)
//
// Add "?debug=1" to the address for an FPS / draw-call readout and buttons
// that damage the dome (keys: K = hit, J = shatter, L = repair all).
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineBody } from './core/contracts';
import { CameraRig } from './camera/cameraRig';
import { createStandInHeroine } from './heroine/standIn';
import { Controls } from './input/controls';
import { PlayerMotion } from './input/playerMotion';
import { Hud, type DomeDebugAction } from './ui/hud';
import { createCity } from './world/city';
import { DOME_RADIUS, PALETTE, SECTION_MAX_HP } from './world/config';
import { Dome } from './world/dome';
import { createGround } from './world/ground';
import { createSky } from './world/sky';
import { SkyTargets } from './world/targets';
import { Tracers } from './world/tracers';

/**
 * THE ONE PLACE THE HEROINE IS MADE.
 * Everything else only knows her as a HeroineBody (core/contracts.ts), so to
 * swap the stand-in for the real Character Builder body, change this one line.
 */
function createHeroine(): HeroineBody {
  return createStandInHeroine();
}

const MAX_STEP = 1 / 20; // a frame never counts for more than this many seconds
const FIRE_INTERVAL = 0.14; // seconds between shots while FIRE is held
const AIM_RANGE = 150; // first person aims at a point this far along the line of sight
const FREE_WALK_KEY = 'gdm.freeWalkThirdPerson'; // where the setting is remembered on this device

/** Read the remembered "free walk" setting (private browsing may refuse; then it is simply off). */
function loadFreeWalk(): boolean {
  try {
    return localStorage.getItem(FREE_WALK_KEY) === '1';
  } catch {
    return false;
  }
}

function saveFreeWalk(on: boolean): void {
  try {
    localStorage.setItem(FREE_WALK_KEY, on ? '1' : '0');
  } catch {
    // Not being able to remember a setting is not worth stopping the game for.
  }
}

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const uiHost = document.getElementById('ui');
  if (!host || !uiHost) throw new Error('the page has no #app or #ui');
  const debug = new URLSearchParams(location.search).get('debug') === '1';

  // ---- Renderer ---------------------------------------------------------------
  // No shadows (the ground paints her shadow itself) and at most 2 device pixels
  // per CSS pixel: a phone's 3x screen would triple the work for little gain.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);

  // ---- World --------------------------------------------------------------------
  const scene = new THREE.Scene();
  const sky = createSky(renderer);
  scene.background = sky.background;
  scene.add(sky.stars);

  const ground = createGround();
  scene.add(ground.mesh);

  const city = createCity();
  scene.add(city.group);

  const dome = await Dome.load(`${import.meta.env.BASE_URL}models/Half_Sphere.obj`);
  scene.add(dome.group);

  const targets = new SkyTargets();
  scene.add(targets.mesh);
  const tracers = new Tracers();
  scene.add(tracers.mesh);

  // Two plain lights for the heroine. (The city, ground and dome glow by themselves and ignore lights.)
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a2740, 1.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(-4, 10, 6);
  scene.add(keyLight);

  // ---- Heroine, camera, controls -----------------------------------------------
  const heroine = createHeroine();
  scene.add(heroine.root);
  const motion = new PlayerMotion();
  const rig = new CameraRig();
  const controls = new Controls(renderer.domElement);

  let freeWalk = loadFreeWalk();
  /** When a run along the ring starts, this remembers whether left and right must be swapped (see below). */
  let ringFlip = 1;
  let wasRunning = false;
  let nextHand: Hand = 'right';
  let fireCooldown = 0;

  const toggleView = () => {
    rig.setMode(rig.mode === 'third' ? 'first' : 'third');
    heroine.setFirstPerson(rig.mode === 'first');
    controls.clickMode = rig.mode === 'first' ? 'click-fires' : 'look-only';
    hud.setView(rig.mode, freeWalk);
  };

  /** The dome section the camera is looking toward: the one the debug buttons act on. */
  const aim = new THREE.Vector3();
  const sectionInView = () => dome.sectionAtPoint(rig.aimPoint(DOME_RADIUS, aim));

  const domeDebug = (action: DomeDebugAction) => {
    if (action === 'hit') sectionInView().damage(25);
    else if (action === 'shatter') sectionInView().damage(SECTION_MAX_HP);
    else dome.repairAll();
  };

  const hud = new Hud(uiHost, controls, {
    debug,
    freeWalk,
    onFreeWalkChange(on) {
      freeWalk = on;
      saveFreeWalk(on);
      hud.setView(rig.mode, freeWalk);
    },
    onToggleView: toggleView,
    onDomeDebug: domeDebug,
  });

  controls.onKey = (key) => {
    if (key === 'v') toggleView();
    if (!debug) return;
    if (key === 'k') domeDebug('hit');
    if (key === 'j') domeDebug('shatter');
    if (key === 'l') domeDebug('repair-all');
  };

  // ---- Fit the canvas to the screen ----------------------------------------------
  const fit = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    sky.setPixelRatio(pixelRatio);
    rig.resize(width, height);
  };
  window.addEventListener('resize', fit);
  fit();

  if (debug) {
    // Lets the browser console (and test scripts) reach the parts of the game.
    (window as unknown as Record<string, unknown>).gdm = { renderer, scene, dome, city, heroine, motion, rig, controls, targets };
  }

  // ---- The loop --------------------------------------------------------------------
  const muzzle = new THREE.Vector3();
  // One FrameInfo is reused every frame (nothing new is created inside the loop).
  const info = { dt: 0, elapsed: 0 };
  let last = performance.now();
  let elapsed = 0;
  let readoutTimer = 0;
  let readoutFrames = 0;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = document.hidden ? 0 : Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    const realDt = (now - last) / 1000;
    last = now;
    elapsed += dt;
    info.dt = dt;
    info.elapsed = elapsed;

    // 1. What is the player doing?
    controls.sample();
    rig.applyLook(controls.takeLookX(), controls.takeLookY());
    const zoom = controls.takeZoom();
    if (rig.mode === 'third') rig.applyZoom(zoom);

    // 2. Move the heroine.
    if (rig.mode === 'first') {
      motion.updateFree(dt, controls.moveX, controls.moveY, rig.yaw, true);
    } else if (freeWalk) {
      motion.updateFree(dt, controls.moveX, controls.moveY, rig.viewYaw, false);
    } else {
      // "Left" must mean left ON SCREEN. If the player has dragged the view round to
      // look back at her, screen-left is the other way along the ring, so swap. The
      // choice is made once, when a run starts, so it never flips mid-run.
      const running = controls.ringDir !== 0;
      if (running && !wasRunning) ringFlip = Math.cos(rig.yaw - motion.ringAngle) >= 0 ? 1 : -1;
      wasRunning = running;
      // The camera swings round the plaza by the same angle she ran.
      rig.swing(motion.updateRing(dt, controls.ringDir * ringFlip));
    }
    heroine.setPosition(motion.x, motion.z);
    heroine.setYaw(motion.yaw);
    heroine.setWalk(motion.speed);
    heroine.update(info);
    ground.setHeroine(motion.x, motion.z);

    // 3. Put the camera where it belongs, now that she has moved.
    rig.update(dt, heroine);

    // 4. Aim. First person: along the line of sight. Third person: auto-aim at a sky target.
    targets.update(info);
    if (rig.mode === 'first') {
      targets.setAimed(-1);
      heroine.aimAt(rig.aimPoint(AIM_RANGE, aim));
    } else {
      const target = targets.pick(motion.x, motion.z, motion.yaw);
      targets.setAimed(target);
      heroine.aimAt(aim.copy(targets.position(target)));
    }

    // 5. Fire (first person only): hands take turns, and each shot leaves a streak.
    fireCooldown -= dt;
    const clicks = controls.takeClicks();
    if (rig.mode === 'first' && fireCooldown <= 0 && (controls.fireHeld || clicks > 0)) {
      fireCooldown = FIRE_INTERVAL;
      heroine.fire(nextHand);
      tracers.fire(heroine.muzzle(nextHand, muzzle), aim);
      nextHand = nextHand === 'right' ? 'left' : 'right';
    }
    tracers.update(info);

    // 6. Draw.
    dome.update(info);
    renderer.render(scene, rig.camera);

    // 7. Debug readout, twice a second.
    if (debug) {
      readoutTimer += realDt;
      readoutFrames++;
      if (readoutTimer >= 0.5) {
        const fps = Math.round(readoutFrames / readoutTimer);
        hud.setReadout(`${fps} FPS  ${renderer.info.render.calls} draws  ${renderer.info.render.triangles} tris`);
        readoutTimer = 0;
        readoutFrames = 0;
      }
      const section = sectionInView();
      hud.setDomeLabel(`dome section ${section.index}: ${section.hp} HP`);
    }
  };
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  // If something fails while starting (for example the dome model does not load), say so on the page.
  console.error(error);
  const message = document.createElement('p');
  message.style.cssText = `position:fixed;inset:0;margin:auto;height:3em;text-align:center;color:${PALETTE.gold}`;
  message.textContent = 'Galaxy Defenders could not start. Please reload the page.';
  document.body.appendChild(message);
});
