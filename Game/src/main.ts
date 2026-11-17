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
import { keepLandscape, onStageResize } from './core/orientation';
import { CameraRig } from './camera/cameraRig';
import { createStandInHeroine } from './heroine/standIn';
import { NO_LIMITS, PACE_TUNING, Pace, type PaceLimits } from './input/pace';
import { HeroineVitals } from './vitals/heroineVitals';
import { VitalsPanel } from './vitals/vitalsPanel';
import { loadHeroineSettings, saveSetting, type HeroineSettings } from './heroine/heroineSettings';
import { Controls } from './input/controls';
import { preventPageZoom } from './input/noZoom';
import { PlayerMotion } from './input/playerMotion';
import { Hud, type DomeDebugAction } from './ui/hud';
import { createCity } from './world/city';
import { CityWalls } from './world/collision';
import { DOME_RADIUS, PALETTE, SECTION_MAX_HP } from './world/config';
import { Dome } from './world/dome';
import { createGround } from './world/ground';
import { createSky } from './world/sky';
import { SkyTargets } from './world/targets';
import { Tracers } from './world/tracers';

/** What either real heroine can say about her own cost (the stand-in cannot): read by the debug readout. */
interface HeroineCost { triangles: number; drawCalls: number; updateMs: number; detail?: number; auto?: boolean; pixels?: number }
type GameHeroine = HeroineBody & {
  stats?: () => HeroineCost;
  /** The fast heroine only: change her detail and the frame rate Auto holds, while the game runs. */
  setDetail?: (detail: HeroineSettings['detail']) => void;
  setTargetFps?: (target: HeroineSettings['targetFps']) => void;
  /** The fast heroine only: the hidden live body (heroine/fast/liveBody.ts), and what it costs. */
  attachLive?: (live: import('./heroine/fast/liveBody').LiveBody | null) => void;
  liveInfo?: () => { stepMs: number; kicks: number } | null;
  /** The week of pregnancy her belly stands for, off her own chart (the fast heroine knows it from her look). */
  weeks?: number;
};

/**
 * THE ONE PLACE THE HEROINE IS MADE.
 * Everything else only knows her as a HeroineBody (core/contracts.ts).
 *
 * She is BLAZE in her pink-and-black suit (src/heroine/looks/blazeSuit.ts, built on the look Joshua saved for her in
 * src/heroine/looks/blaze.ts), drawn one of two ways, chosen in Settings ("Body") and remembered on the device
 * (src/heroine/heroineSettings.ts):
 *
 *   Performance (the default)  the FAST heroine (src/heroine/fast/): the builder's body file drawn the way Anthill
 *                              Airways' DEV Room draws it (detail levels, lighter triangle lists), wearing her
 *                              real suit from saved pictures of the builder's paint (fast/bakedLook.ts).
 *                              ?suit=tee wears the DEV Room's own painted tee and leggings (fast/devRoomLook.ts).
 *   Visual                     the Character Builder's own room, run out of sight (src/heroine/builderHeroine.ts):
 *                              the builder exactly, at several times the cost.
 *
 * Her code is fetched only when it is needed (the `import()`s below), and a line of text says she is loading.
 *
 *   ?heroine=fast|room|standin   force one of the two, or the simple stand-in figure (loads at once)
 *   ?look=blaze                  Joshua's own export (the all-pink two-piece), in place of the suit
 *   ?detail=, ?fps=, ?sharp=, ?body=light|full   see heroineSettings.ts
 *
 * If the fast heroine cannot be made (a look that has not been baked, a missing file) the Visual one is tried; if
 * that fails too the stand-in takes her place, so the game always starts.
 */
async function createHeroine(renderer: THREE.WebGLRenderer, scene: THREE.Scene, settings: HeroineSettings, say: (text: string) => void): Promise<GameHeroine> {
  const asked = new URLSearchParams(location.search);
  if (asked.get('heroine') === 'standin') return createStandInHeroine();
  const { lookKey, LOOKS } = await import('./heroine/looks');
  const look = lookKey(asked.get('look'));
  say('Loading Blaze…');
  if (settings.body === 'performance') {
    try {
      const { createFastHeroine } = await import('./heroine/fast/fastHeroine');
      const { BLAZE_PAINTED } = await import('./heroine/fast/devRoomLook');
      return await createFastHeroine({
        renderer, scene, look,
        // HER OWN SUIT, on the DEV Room's body (Joshua, 2026-11-17: "I didn't ask for a change of outfit, only how it
        // did the details and cut back the vertices. Place the outfit back like it was but keep the method"): the
        // body, its detail levels and its lighter triangle lists are the DEV Room's; her outfit is her real suit,
        // from the saved pictures of the builder's paint. ?suit=tee wears the DEV Room's own painted tee instead.
        painted: asked.get('suit') === 'tee' ? BLAZE_PAINTED : undefined,
        detail: settings.detail,
        targetFps: settings.targetFps,
        onProgress: (stage) => say(`Loading Blaze: ${stage}…`),
      });
    } catch (error) {
      console.error('The fast heroine could not be made; trying the Character Builder\'s own room.', error);
    }
  }
  try {
    const { createBuilderHeroine } = await import('./heroine/builderHeroine');
    return await createBuilderHeroine({
      renderer,
      scene,
      look: LOOKS[look],
      lightSkin: settings.skin === 'light',
      groundShadow: false, // the ground paints her shadow itself (src/world/ground.ts)
      onProgress: (stage) => say(`Loading Blaze: ${stage}…`),
    });
  } catch (error) {
    console.error('The Character Builder heroine could not be loaded; using the stand-in.', error);
    return createStandInHeroine();
  }
}

const MAX_STEP = 1 / 20; // a frame never counts for more than this many seconds
const FIRE_INTERVAL = 0.14; // seconds between shots while FIRE is held
const LOOK_STICK_SPEED = 520; // the camera stick pushed fully over turns the view like a drag of this many pixels a second
const AIM_RANGE = 150; // first person aims at a point this far along the line of sight
const SHADOW_FLOOR_RADIUS = 4; // metres: the patch of ground round her feet that can show her real shadow
const DEBUG_KEY = 'gdm.debug'; // "Show FPS and test tools" in Settings, remembered on this device

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const uiHost = document.getElementById('ui');
  const stage = document.getElementById('stage');
  if (!host || !uiHost || !stage) throw new Error('the page has no #stage, #app or #ui');
  keepLandscape(stage); // the game is always drawn wide, turning itself on an upright phone (src/core/orientation.ts)
  preventPageZoom(); // no double-tap or pinch zoom of the page itself (src/input/noZoom.ts)
  // The FPS readout and dome test buttons: on with "?debug=1" in the address, or the tick box in Settings.
  let debugRemembered = false;
  try { debugRemembered = localStorage.getItem(DEBUG_KEY) === '1'; } catch { /* private browsing: just off */ }
  const debug = new URLSearchParams(location.search).get('debug') === '1' || debugRemembered;

  // ---- Renderer ---------------------------------------------------------------
  // No shadows (the ground paints her shadow itself) and at most 2 device pixels
  // per CSS pixel: a phone's 3x screen would triple the work for little gain.
  // ("Sharpness" in Settings lowers that to 1: about a quarter of the pixels to fill.)
  const graphics = loadHeroineSettings();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, graphics.sharpness));
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
  scene.add(keyLight.target);

  // REAL SHADOWS (Joshua, 2026-11-17: "Allow real shadows"; the DEV Room's "Shadows: on", with its own numbers: a
  // 2048-pixel shadow picture, softened). The key light draws her once more, from where it stands, into a picture of
  // depths; anything that "receives" shadows then darkens where that picture says she is in the way.
  // The ground glows by itself and ignores lights, so a see-through disc lies just over it whose only
  // job is to show her shadow (three.js's ShadowMaterial: invisible but for the shadow on it).
  // The light's shadow box is small (6 m across) and follows her each frame, so the picture stays sharp. The disc
  // is small too (a few metres round her feet) and goes with her, so her shadow shows anywhere on the map and
  // not only in the plaza. (Both are moved in the loop below, where she is moved.)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  keyLight.shadow.mapSize.set(2048, 2048);
  const shadowBox = keyLight.shadow.camera;
  shadowBox.left = -3; shadowBox.right = 3; shadowBox.top = 3; shadowBox.bottom = -3; shadowBox.near = 1; shadowBox.far = 30;
  shadowBox.updateProjectionMatrix();
  keyLight.shadow.bias = -0.0005;
  // (depthWrite off: the disc only darkens what is under it. Left on, it hid the foot of the dome's glass wherever
  // it reached the dome wall, which showed as a thin black line along the bottom of the glass.)
  const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(SHADOW_FLOOR_RADIUS, 32), new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }));
  shadowFloor.rotation.x = -Math.PI / 2;   // laid flat
  shadowFloor.position.y = 0.012;          // a centimetre over the ground, so the two never flicker
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  // ---- Heroine, camera, controls -----------------------------------------------
  // A line of text in the middle of the screen while she loads (a character appears dressed, all at once).
  const loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;left:0;right:0;top:45%;text-align:center;font-size:15px;letter-spacing:.08em;color:#5ee8c8;pointer-events:none;text-shadow:0 0 8px #04060d;';
  uiHost.appendChild(loading);
  const heroine = await createHeroine(renderer, scene, graphics, (text) => { loading.textContent = text; });
  loading.remove();
  scene.add(heroine.root);
  // Real shadows on or off (Settings): the renderer's shadow pictures, the key light's, and every part of her casting.
  let realShadows = false;
  const applyShadows = (): void => {
    realShadows = graphics.shadows === 'on';
    renderer.shadowMap.enabled = realShadows;
    keyLight.castShadow = realShadows;
    shadowFloor.visible = realShadows;
    heroine.root.traverse((node) => { if ((node as THREE.Mesh).isMesh) node.castShadow = realShadows; });
    // (materials are compiled with or without shadows: they are made again for the new setting)
    scene.traverse((node) => { const m = (node as THREE.Mesh).material; if (m) for (const one of Array.isArray(m) ? m : [m]) one.needsUpdate = true; });
  };
  applyShadows();
  // THE LIVE BODY (Joshua, 2026-11-17: "everything enabled but only the skin drawn"): the Character Builder's whole
  // room for her (baby, womb, organs and the rest) opened out of sight and run every frame, never drawn. It is slow
  // to open, so it is opened now that she is on screen and attached when it is ready; the game is playable meanwhile.
  let liveNote = graphics.liveBody === 'on' && heroine.attachLive ? 'live body: loading…' : '';
  if (graphics.liveBody === 'on' && heroine.attachLive) {
    void (async () => {
      try {
        const [{ openLiveBody }, { LOOKS, lookKey }] = await Promise.all([import('./heroine/fast/liveBody'), import('./heroine/looks')]);
        const live = await openLiveBody(renderer, LOOKS[lookKey(new URLSearchParams(location.search).get('look'))]);
        heroine.attachLive?.(live);
        liveNote = '';
      } catch (error) {
        console.error('The live body could not be opened; she carries on without it.', error);
        liveNote = 'live body: could not open';
      }
    })();
  }

  // WHERE SHE CAN GO: anywhere under the dome (Joshua, 2026-11-17: "so I can like run from one end of the map to
  // the other"). The buildings are solid and the dome's glass stops her: `walls` knows both (src/world/collision.ts)
  // and `motion` asks it where each step really ends.
  const walls = new CityWalls(city.footprints);
  const motion = new PlayerMotion(walls);
  const rig = new CameraRig();
  const controls = new Controls(renderer.domElement);

  /** The stick's direction last frame, to notice her turning right round. */
  let lastMoveX = 0, lastMoveY = 0;

  // HER PACE AND HER VITALS.
  // Her pace (walk, jog, run, sprint) comes from how far the MOVE stick is pushed (src/input/pace.ts).
  // Her vitals (heart, breath, stamina, health, food, water) follow what she does (src/vitals/heroineVitals.ts):
  // Blaze is 28, and the week her belly stands for comes off her own chart in the Character Builder (her look's
  // pregnancy numbers; week 40 for a body that does not say), which its model of her breath
  // and heart takes into account. Her body shows them (she breathes faster and deeper after a run), and so does
  // the card along the top of the screen.
  const pace = new Pace();
  const vitals = new HeroineVitals({ age: 28, weeks: heroine.weeks ?? 40 });
  const vitalsPanel = new VitalsPanel();
  /** What her body allows this frame (her stamina, her share of full speed), from last frame's vitals. */
  let limits: PaceLimits = NO_LIMITS;
  let nextHand: Hand = 'right';
  let fireCooldown = 0;

  const toggleView = () => {
    rig.setMode(rig.mode === 'third' ? 'first' : 'third');
    heroine.setFirstPerson(rig.mode === 'first');
    controls.clickMode = rig.mode === 'first' ? 'click-fires' : 'look-only';
    // (the HUD keeps hold of the MOVE stick through this, so she goes on at the pace she had: src/ui/hud.ts)
    hud.setView(rig.mode);
  };

  /**
   * The dome section the camera is looking toward: the one the debug buttons act on. Found where the line of
   * sight meets the dome itself, so it is right from anywhere on the map and not only from the plaza.
   */
  const aim = new THREE.Vector3();
  const sectionInView = () => dome.sectionAtPoint(rig.aimPointOnBall(DOME_RADIUS, aim));

  const domeDebug = (action: DomeDebugAction) => {
    if (action === 'hit') sectionInView().damage(25);
    else if (action === 'shatter') sectionInView().damage(SECTION_MAX_HP);
    else dome.repairAll();
  };

  // (The "Free walk in third person" switch is gone: she always walks freely now. What a device remembered for
  // it is no longer read, so it is forgotten.)
  try { localStorage.removeItem('gdm.freeWalkThirdPerson'); } catch { /* private browsing: nothing was remembered */ }

  const hud = new Hud(uiHost, controls, {
    debug,
    onDebugChange(on) {
      // The readout is built when the game starts, so remember the choice and start again.
      try { localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); } catch { /* cannot remember it: nothing to do */ }
      location.reload();
    },
    graphics,
    onGraphicsChange(key, value) {
      graphics[key] = value;
      saveSetting(key, value);
      // Detail, the target frame rate and sharpness take hold at once; a different body (or its skin) is a different
      // heroine, so the game starts again with it.
      if (key === 'detail') heroine.setDetail?.(graphics.detail);
      else if (key === 'targetFps') heroine.setTargetFps?.(graphics.targetFps);
      else if (key === 'sharpness') fit();
      else if (key === 'shadows') applyShadows();
      else location.reload();
    },
    onToggleView: toggleView,
    onDomeDebug: domeDebug,
  });

  hud.topSlot().appendChild(vitalsPanel.element);

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
    const pixelRatio = Math.min(window.devicePixelRatio || 1, graphics.sharpness);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    sky.setPixelRatio(pixelRatio);
    rig.resize(width, height);
  };
  onStageResize(fit); // the stage tells us when the screen was turned or resized
  fit();

  if (debug) {
    // Lets the browser console (and test scripts) reach the parts of the game.
    (window as unknown as Record<string, unknown>).gdm = { renderer, scene, dome, city, heroine, motion, rig, controls, targets, pace, vitals, walls };
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
    // Looking around: a drag on the picture, plus the camera stick (first person). The stick's push is squared
    // (keeping its sign) so a small push aims finely and a full push turns quickly.
    const stickLookX = controls.lookStickX * Math.abs(controls.lookStickX) * LOOK_STICK_SPEED * dt;
    const stickLookY = controls.lookStickY * Math.abs(controls.lookStickY) * LOOK_STICK_SPEED * dt;
    rig.applyLook(controls.takeLookX() + stickLookX, controls.takeLookY() - stickLookY); // stick up looks up
    const zoom = controls.takeZoom();
    if (rig.mode === 'third') rig.applyZoom(zoom);

    // 2. Move the heroine.
    // She walks freely in every view (Joshua, 2026-11-17: "Remove the fixed moving ring, and let it be free
    // movement"). How far the stick is pushed sets her pace; where it points steers her.
    const push = Math.min(1, Math.hypot(controls.moveX, controls.moveY));
    // (turning right round, the stick pointing more than about 120 degrees from where it pointed: she loses a pace)
    if (push > PACE_TUNING.ringsFrom[0]) {
      const x = controls.moveX / push, y = controls.moveY / push;
      if (x * lastMoveX + y * lastMoveY < -0.5) pace.turnedBack();
      lastMoveX = x; lastMoveY = y;
    }
    pace.step(dt, push, limits);
    // The stick moves her relative to the way the camera looks: up is away from the camera, right is to its right.
    //   first person  she faces where she looks;
    //   third person  she turns to face the way she goes, and the camera keeps the side of her it was dragged to.
    // (Her facing is decided in one place: PlayerMotion.update, src/input/playerMotion.ts. The walls stop her there too.)
    if (rig.mode === 'first') motion.update(dt, controls.moveX, controls.moveY, rig.yaw, true, pace.speed);
    else motion.update(dt, controls.moveX, controls.moveY, rig.viewYaw, false, pace.speed);
    // (the key light, its shadow box and the patch of ground that shows her real shadow all go with her)
    keyLight.position.set(motion.x - 4, 10, motion.z + 6);
    keyLight.target.position.set(motion.x, 0, motion.z);
    shadowFloor.position.x = motion.x;
    shadowFloor.position.z = motion.z;
    heroine.setPosition(motion.x, motion.z);
    heroine.setYaw(motion.yaw);
    heroine.setWalk(motion.speed);
    heroine.update(info);
    // (her painted blob of a shadow is only for when real shadows are off: moved far away, it is not seen)
    if (realShadows) ground.setHeroine(1e6, 1e6); else ground.setHeroine(motion.x, motion.z);

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

    // 5b. Her vitals: what she just did (how fast she moved, whether she is shooting) moves her heart, her breath,
    // her stamina, her food and her water on; her body and the card along the top show them.
    const shooting = rig.mode === 'first' && (controls.fireHeld || clicks > 0);
    vitals.step(dt, { speed: motion.speed, firing: shooting });
    const reading = vitals.reading;
    limits = reading;
    heroine.setVitals?.(reading);
    vitalsPanel.show(reading);
    hud.setPace(pace.name, pace.ring);

    // 6. Draw.
    dome.update(info);
    renderer.render(scene, rig.camera);

    // 7. Debug readout, twice a second.
    if (debug) {
      readoutTimer += realDt;
      readoutFrames++;
      if (readoutTimer >= 0.5) {
        const fps = Math.round(readoutFrames / readoutTimer);
        // the whole frame, then the heroine's own share: her triangles as drawn, her detail level, her CPU time a frame
        const her = heroine.stats?.();
        const herLine = her
          ? `\nher: ${her.triangles.toLocaleString()} tris in ${her.drawCalls} draws` + (her.detail !== undefined ? ` · detail ${her.detail}%${her.auto ? ' auto' : ''}` : '') + ` · ${her.updateMs.toFixed(2)} ms CPU`
          : '';
        // (the hidden live body: what its step costs each frame, and whether her baby is kicking)
        const liveNow = heroine.liveInfo?.();
        const liveLine = liveNow ? `\nlive body: ${liveNow.stepMs.toFixed(1)} ms a frame${liveNow.kicks ? ` · ${liveNow.kicks} kick${liveNow.kicks > 1 ? 's' : ''}` : ''}` : liveNote ? `\n${liveNote}` : '';
        hud.setReadout(`${fps} FPS  ${renderer.info.render.calls} draws  ${renderer.info.render.triangles.toLocaleString()} tris${herLine}${liveLine}`);
        readoutTimer = 0;
        readoutFrames = 0;
      }
      const section = sectionInView();
      hud.setDomeLabel(`dome section ${section.index}: ${section.hp} HP`);
    }
  };
  requestAnimationFrame(frame);
}

// THE GAME AS AN APP: in the published game (not while developing), start the service worker the build wrote
// (dist/sw.js; see pwa() in vite.config.ts). It keeps the game's files on the device, so after the first visit
// the game opens quickly and works with no signal, and "Add to Home Screen" makes it a full-screen app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.warn('The game could not be kept on this device (service worker not registered).', error);
    });
  });
}

start().catch((error: unknown) => {
  // If something fails while starting (for example the dome model does not load), say so on the page.
  console.error(error);
  const message = document.createElement('p');
  message.style.cssText = `position:fixed;inset:0;margin:auto;height:3em;text-align:center;color:${PALETTE.gold}`;
  message.textContent = 'Galaxy Defenders could not start. Please reload the page.';
  document.body.appendChild(message);
});
