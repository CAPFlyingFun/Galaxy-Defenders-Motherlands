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
import { SHADOW_ONLY_LAYER, type Hand, type HeroineBody } from './core/contracts';
import './core/screenFit'; // first: the screen measured once, the game box sized from it (Joshua, 2026-11-17)
import { isUpright, keepLandscape, onStageResize, refitNow } from './core/orientation';
import { checkScreen } from './core/screenFit';
import { loadKind, loadedAsPlanned, startLoadMeter } from './core/loadMeter';
import { connectSplash, showSplashError } from './ui/splash';
import { createPause, type Pause } from './ui/pauseMenu';
import { CameraRig } from './camera/cameraRig';
import { createStandInHeroine } from './heroine/standIn';
import { NO_LIMITS, PACE_TUNING, Pace, type PaceLimits } from './input/pace';
import { HeroineVitals } from './vitals/heroineVitals';
import { VitalsPanel } from './vitals/vitalsPanel';
import { loadHeroineSettings, saveSetting, type HeroineSettings } from './heroine/heroineSettings';
import { Controls } from './input/controls';
import { preventPageZoom } from './input/noZoom';
import { PlayerMotion } from './input/playerMotion';
import { BodyTurn } from './input/bodyTurn';
import { Hud, type DomeDebugAction } from './ui/hud';
import { VERSION_NUMBER } from './ui/versionTag';
import { createCity } from './world/city';
import { CityWalls } from './world/collision';
import { DOME_RADIUS, PALETTE, SECTION_MAX_HP } from './world/config';
import { Dome } from './world/dome';
import { createGround } from './world/ground';
import { createSky } from './world/sky';
import { SkyTargets } from './world/targets';
import { Tracers } from './world/tracers';
import { WeaponTable } from './world/weaponTable';
import { TableUse } from './world/tableUse';
import { BurstFire } from './world/burstFire';
import { GrabBars, GrabUse, type BarName } from './world/grabBars';
import { CAMERA_STYLES, type CameraStyle } from './camera/cameraRig';

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
  /** The fast heroine only: her stride as measured from her foot bones, and her feet on the floor this frame. */
  strideInfo?: () => { walk: { stride: number }; run: { stride: number } } | null;
  feetInfo?: () => { drop: number; held: readonly [number, number]; speed: number };
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
 * Her code is fetched only when it is needed (the `import()`s below), and the splash says what is loading (`say`).
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
const TABLE_WALK = 1.1;
/**
 * BLAZE'S PREGNANCY, from her Character Builder export (Joshua, 2026-11-17): her first visible belly (firstWeekBump)
 * and full term (deliveryBump, week 41). How far along she is between them slows her paces and tires her sooner
 * (src/input/pace.ts PACES_FULL_TERM, src/vitals/heroineVitals.ts byPaceFullTerm). LATER: read from her look.
 */
/** Where the third-person camera style is kept on this device. */
const CAMERA_STYLE_KEY = 'gdm.cameraStyle';
// First person while she is busy at the table or a bar: how quickly the view follows her head (seconds), and how far
// it tips down toward her hands (radians, about 45 degrees).
const FIRST_PERSON_FOLLOW_SECONDS = 0.2;
const FIRST_PERSON_BUSY_PITCH = -0.8;
/** ...and how far the player may still look round meanwhile: 90 degrees to each side of it, 70 up and down. */
const BUSY_LOOK_SIDE = Math.PI / 2;
const BUSY_LOOK_UP_DOWN = 70 * Math.PI / 180;
const PREGNANCY_ARC = { firstBump: 25, fullTermBump: 150 } as const; // her pace walking up to the weapon table, metres a second (a walk)
const LOOK_STICK_SPEED = 520; // the camera stick pushed fully over turns the view like a drag of this many pixels a second
const AIM_RANGE = 150; // first person aims at a point this far along the line of sight
const SHADOW_FLOOR_RADIUS = 4; // metres: the patch of ground round her feet that can show her real shadow
const DEBUG_KEY = 'gdm.debug'; // "Show FPS and test tools" in Settings, remembered on this device

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const uiHost = document.getElementById('ui');
  const stage = document.getElementById('stage');
  if (!host || !uiHost || !stage) throw new Error('the page has no #stage, #app or #ui');

  // ---- LOADING: the splash and its meter (Joshua, 2026-11-17) ---------------------------------------------------
  // "Create a simple splash screen while loading up everything with maybe an actual loading bar with percentage and
  // estimated time remaining" and "wait until it all loads in before starting for a smoother experience".
  // The splash is already on screen (it is written into index.html). From here until the game's first picture has
  // been drawn, every step below tells the METER what it is doing (`meter.step`), and the meter also counts the bytes
  // of every file as it arrives; the splash shows what the meter says (src/core/loadMeter.ts, src/ui/splash.ts).
  // Nothing of the game runs until all of it is in: the controls and the game loop are only made at the end.
  const loadIs = loadKind(loadHeroineSettings()); // which kind of load this is: "fast live", "fast", "room"...
  const meter = startLoadMeter(loadIs);
  meter.step('world', 'Building the dome and the city…');
  /**
   * A SHORT BREAK between loading steps (Joshua, 2026-11-17). The page can only redraw (a turn of the phone, the
   * loading bar) when the game's code stops for a moment; one picture's time, here and there, lets it catch up.
   * (The Character Builder's own long step, opening her live body, cannot be broken up from here.)
   */
  const breathe = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
  const splash = connectSplash(meter);

  keepLandscape(stage); // keeps the game fitted to the screen, and knows when a phone is held upright (src/core/orientation.ts)
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
  // (the shadow also sees what only casts a shadow: her hair in first person, see SHADOW_ONLY_LAYER)
  shadowBox.layers.enable(SHADOW_ONLY_LAYER);
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
  // What she is doing while she loads goes to the splash: each line she reports is one step of the load.
  await breathe();
  const heroine = await createHeroine(renderer, scene, graphics, (text) => meter.step(text, text));
  await breathe();
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
  // to open, and the game WAITS for it behind the splash (Joshua, 2026-11-17: "Yes, wait until it all loads in before
  // starting for a smoother experience"); each thing the room reports while opening is a step on the splash.
  // If it cannot be opened the game starts without it, and the debug readout says so.
  let liveNote = '';
  let liveOpened = false;
  if (graphics.liveBody === 'on' && heroine.attachLive) {
    try {
      await breathe();
      meter.step('live body', 'Blaze\'s live body: fetching its code…');
      const [{ openLiveBody }, { LOOKS, lookKey }] = await Promise.all([import('./heroine/fast/liveBody'), import('./heroine/looks')]);
      const live = await openLiveBody(renderer, LOOKS[lookKey(new URLSearchParams(location.search).get('look'))], (stage) => meter.step(`live body: ${stage}`, `Blaze's live body: ${stage}…`));
      heroine.attachLive(live);
      liveOpened = true;
    } catch (error) {
      console.error('The live body could not be opened; she carries on without it.', error);
      liveNote = 'live body: could not open';
    }
  }

  // WHERE SHE CAN GO: anywhere under the dome (Joshua, 2026-11-17: "so I can like run from one end of the map to
  // the other"). The buildings are solid and the dome's glass stops her: `walls` knows both (src/world/collision.ts)
  // and `motion` asks it where each step really ends.
  const walls = new CityWalls(city.footprints);
  const motion = new PlayerMotion(walls);
  // Which way each part of her faces (src/input/bodyTurn.ts). She starts looking out at the city (+Z). A body that
  // can turn its parts apart is handed this once and reads it every frame.
  const turn = new BodyTurn();
  heroine.setFacing?.(turn);

  // THE WEAPON TABLE (Joshua, 2026-11-17: "a table you can actually grab to pick up and drop your guns"): beside
  // where she starts, so she can walk up to it, put her guns down on it and take them up again
  // (src/world/weaponTable.ts, src/world/tableUse.ts; her hands: src/heroine/fast/handReach.ts, lowerBody.ts).
  const table = new WeaponTable(graphics.tableHeight);
  table.place(1.6, 9.85, 0);
  scene.add(table.root);
  const tableUse = new TableUse(table, heroine);
  /** What the table's action asks for this frame (one object, rewritten). */
  const tableAsk: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number } = { walkTo: null, look: null, yaw: 0 };
  // THINGS TO TAKE HOLD OF (Joshua's step #4, 2026-11-18): an upright pole and a waist-high rail beside the table, the
  // other side of the street (src/world/grabBars.ts; her fingers: src/heroine/fast/fingerTouch.ts).
  const bars = new GrabBars();
  bars.place('pole', -1.3, 10.1, 0);
  bars.place('rail', -3.0, 10.3, 0);
  scene.add(bars.pole, bars.rail);
  const grabUse = new GrabUse(bars, heroine);
  const grabAsk: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number } = { walkTo: null, look: null, yaw: 0 };
  /** A bar to take hold of once her guns are on the table (a hand with a gun in it puts it down first). */
  let grabAfterTable: BarName | null = null;
  /** Whether she is busy with the table or a bar (the stick waits, she does not aim or fire). */
  const busyNow = (): boolean => tableUse.busy || grabUse.busy;
  /** What her turning is told each frame (one object, rewritten: nothing new is made in the loop). */
  const turnInput: { view: 'first' | 'third'; look: number | null; move: number | null } = { view: 'third', look: null, move: null };
  /** The sky target her auto-aim picked this frame (third person). */
  let aimTarget = 0;
  const rig = new CameraRig();
  // (the camera as the player set it up in Settings: each view's field of view, and where the zoom starts)
  rig.setFov(graphics.fovThird, graphics.fovFirst);
  rig.setZoom(graphics.zoomThird);
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
  /**
   * First person while she is busy: where the view follows (her head, tipped to her hands), the player's own look on
   * top of it, and what was set last frame (to tell the player's drag from it).
   */
  const busyView = { on: false, yaw: 0, pitch: 0, lookYaw: 0, lookPitch: 0, setYaw: 0, setPitch: 0 };
  /** Her guns' bursts (src/world/burstFire.ts). */
  const burst = new BurstFire();

  // THE CAMERA STYLE in third person (src/camera/cameraRig.ts; Joshua, 2026-11-18): the CAM button goes round them,
  // and the choice is kept on this device.
  let cameraStyle: CameraStyle = 'follow';
  try {
    const kept = localStorage.getItem(CAMERA_STYLE_KEY) as CameraStyle | null;
    if (kept && CAMERA_STYLES.includes(kept)) cameraStyle = kept;
  } catch { /* (no storage: follow) */ }
  rig.droneLimit = DOME_RADIUS - 3;
  /**
   * AIMED BY HAND: always in first person; in third person when auto-fire is off (Joshua, 2026-11-18: "so you could
   * also shoot in 3rd person... over the shoulder view and a simple cross hair"). Then the camera is over her
   * shoulder, she looks where it looks, and FIRE shoots at the crosshair.
   */
  const aimedByHand = (): boolean => rig.mode === 'first' || graphics.autoFire === 'off';
  /** Everything that follows from the view and the aiming: the camera's style, the buttons, what a click does. */
  const applyView = (): void => {
    rig.setStyle(rig.mode === 'third' && aimedByHand() ? 'shoulder' : cameraStyle);
    heroine.setFirstPerson(rig.mode === 'first');
    controls.clickMode = aimedByHand() ? 'click-fires' : 'look-only';
    // (the HUD keeps hold of the MOVE stick through this, so she goes on at the pace she had: src/ui/hud.ts)
    hud.setView(rig.mode, aimedByHand());
    hud.setCameraStyle(cameraStyle);
  };
  const toggleView = () => {
    rig.setMode(rig.mode === 'third' ? 'first' : 'third');
    applyView();
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

  /**
   * STARTING THE GAME AGAIN, CLEANLY (Joshua, 2026-11-17: changing the body in Settings restarted the game, then it
   * loaded a second time and iOS said it had run into a problem). A reload used to come straight away, with the old
   * game's graphics (her body, her live body, the whole scene) still held on the graphics chip while the new game began
   * loading its own, both at once for a moment. Now everything is let go of first, the graphics chip is told to drop
   * the lot, and the page is loaded again a moment later.
   */
  let restarting = false;
  const restart = (): void => {
    if (restarting) return;
    restarting = true;
    const note = document.createElement('div');
    note.textContent = 'Restarting…';
    note.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:#04060d;color:#5ee8c8;font:600 15px system-ui;letter-spacing:.08em;';
    document.body.appendChild(note);
    try {
      heroine.dispose();
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose?.();
        for (const m of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
          for (const value of Object.values(m)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
          m.dispose();
        }
      });
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    } catch (error) { console.warn('Letting go before the restart did not finish; restarting anyway.', error); }
    window.setTimeout(() => location.reload(), 300);
  };

  const hud = new Hud(uiHost, controls, {
    debug,
    onDebugChange(on) {
      // The readout is built when the game starts, so remember the choice and start again.
      try { localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); } catch { /* cannot remember it: nothing to do */ }
      restart();
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
      else if (key === 'fovThird' || key === 'fovFirst') rig.setFov(graphics.fovThird, graphics.fovFirst);
      else if (key === 'zoomThird') rig.setZoom(graphics.zoomThird);
      else if (key === 'tableHeight') tableUse.setHeight(graphics.tableHeight);
      else if (key === 'autoFire') applyView();
      else restart();
    },
    onToggleView: toggleView,
    onCameraStyle: () => {
      cameraStyle = CAMERA_STYLES[(CAMERA_STYLES.indexOf(cameraStyle) + 1) % CAMERA_STYLES.length];
      try { localStorage.setItem(CAMERA_STYLE_KEY, cameraStyle); } catch { /* (kept for this visit only) */ }
      applyView();
    },
    onDomeDebug: domeDebug,
    onUse: (which) => { if (!grabUse.busy) tableUse.start(which); },
    onGrab: () => {
      if (grabUse.holding) { grabUse.letGo(); return; }
      if (busyNow()) return;
      const bar = grabUse.nearest(motion.x, motion.z).bar;
      // (the hands that hold the bar must be empty: their guns go on the table first, then she goes to the bar)
      const full = bars.hands(bar).filter((hand) => heroine.hands?.hasGun(hand));
      if (full.length > 0) { tableUse.start(full.length === 2 ? 'both' : full[0]); grabAfterTable = bar; }
      else grabUse.start(bar);
    },
  });

  hud.topSlot().appendChild(vitalsPanel.element);
  // (the camera style and the buttons for the view she starts in)
  applyView();

  controls.onKey = (key) => {
    if (key === 'v') toggleView();
    if (!debug) return;
    if (key === 'k') domeDebug('hit');
    if (key === 'j') domeDebug('shatter');
    if (key === 'l') domeDebug('repair-all');
  };

  // ---- Fit the canvas to the screen ----------------------------------------------
  let fitted = false;
  const fit = () => {
    // (upright, the game is hidden behind the cover: its picture keeps its landscape shape and is not resized for
    //  nothing. Opened upright, it has no landscape shape yet: it is given the upright screen's turned on its side.)
    if (isUpright() && fitted) return;
    const width = isUpright() ? host.clientHeight : host.clientWidth;
    const height = isUpright() ? host.clientWidth : host.clientHeight;
    fitted = true;
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
    (window as unknown as Record<string, unknown>).gdm = { renderer, scene, dome, city, heroine, motion, turn, rig, controls, targets, pace, vitals, walls, table, tableUse, bars, grabUse };
  }

  // ---- LOADING ENDS HERE, AND PAUSING BEGINS (Joshua, 2026-11-17) ------------------------------------------------
  // Everything is in. Two last steps behind the splash, so the game does not stutter as it appears: the graphics
  // chip is given every material to get ready, and then the game's FIRST picture is drawn (the first is by far the
  // slowest: every shape and picture is handed to the chip as it is first drawn). The splash lifts when that
  // picture is done: see the top of the loop below.
  await breathe();
  meter.step('picture', 'Getting the picture ready…');
  try {
    // (never waited on for more than 5 seconds, and never a reason not to start: it is only a head start)
    await Promise.race([renderer.compileAsync(scene, rig.camera), new Promise((enough) => setTimeout(enough, 5000))]);
  } catch (error) {
    console.warn('The materials could not be got ready ahead of time; the first picture does it instead.', error);
  }
  meter.step('first picture', 'Drawing the first picture…');
  /** How many frames have begun. The first one is drawn behind the splash; the game starts with the second. */
  let framesBegun = 0;
  // PAUSING (src/ui/pauseMenu.ts): "if it starts in portrait or you rotate from landscape to portrait, it will pause
  // and basically open up and pause menu if in the game already". The pause menu is made as the game starts (so a
  // phone that is upright at that moment starts paused). While `pause.paused` is true the loop below does nothing.
  let pause: Pause | null = null;
  /** The frame before this one was a paused one (so the first frame after a pause can say "carrying on"). */
  let wasPaused = false;
  const beginPlaying = (): void => {
    // (this load is remembered as a guide for the next only if it went the way its kind says it should)
    meter.finish(loadedAsPlanned(loadIs, { fastBody: !!heroine.attachLive, liveBody: liveOpened }));
    splash.done();
    // A turn made while loading may have left the page at the old shape (it could not redraw meanwhile): put it right.
    checkScreen();
    refitNow();
    pause = createPause({
      stage, host: uiHost,
      // A still picture of the game for the upright screen's strip: drawn once more, and read straight off.
      snapshot: () => { renderer.render(scene, rig.camera); return renderer.domElement.toDataURL('image/jpeg', 0.7); },
      // Whatever the player was holding is let go: the sticks back to their middles, no button down.
      onPause: () => {
        // (the two arrow buttons of the old ring track are gone: FIRE is the only button there is to let go of)
        controls.stickX = controls.stickY = controls.lookStickX = controls.lookStickY = 0;
        controls.buttonFire = false;
      },
    });
    if (debug) Object.assign((window as unknown as { gdm: object }).gdm, { pause });
  };
  // The keys do nothing until the game has started, nor while it is paused (V would switch the view behind the menu).
  const playKeys = controls.onKey;
  controls.onKey = (key) => { if (pause && !pause.paused) playKeys?.(key); };

  // ---- The loop --------------------------------------------------------------------
  const muzzle = new THREE.Vector3();
  // One FrameInfo is reused every frame (nothing new is created inside the loop).
  const info = { dt: 0, elapsed: 0 };
  let last = performance.now();
  let elapsed = 0;
  let readoutTimer = 0;
  let readoutFrames = 0;
  // (for the test scripts: the load meter, and the loop's own clock, to see that game time stands still)
  if (debug) Object.assign((window as unknown as { gdm: object }).gdm, { meter, frame: info });

  const frame = (now: number) => {
    if (restarting) return; // (the game is letting go of everything before it starts again: the loop stops)
    requestAnimationFrame(frame);

    // ---- LOADING ENDS, AND PAUSED? (see just above the loop) --------------------------------------------------
    // The second frame beginning means the first picture has been drawn: the splash lifts and the game starts.
    if (framesBegun < 2 && ++framesBegun === 2) beginPlaying();
    // PAUSED: no time passes. `last` is kept at "now", so when the game resumes it carries on from this instant
    // and does not try to catch up (nothing jumps). Anything dragged or clicked meanwhile is thrown away. The
    // still picture is drawn again only when it is wanted (after the screen changed size, and now and then).
    if (pause?.paused) {
      last = now;
      wasPaused = true;
      controls.takeLookX(); controls.takeLookY(); controls.takeZoom(); controls.takeClicks();
      if (pause.wantsPicture(now)) renderer.render(scene, rig.camera);
      return;
    }
    // Carrying on after a pause: she is told, so the time she stood paused is not counted as one very slow frame
    // (her detail is chosen by the frame rate: src/heroine/fast/autoDetail.ts).
    if (wasPaused) { wasPaused = false; heroine.resumed?.(); }
    // ---- (the game, as before) ---------------------------------------------------------------------------------

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
    // HOW FAR ALONG SHE IS, by her belly now: 0 at her first visible belly, 1 at full term (PREGNANCY_ARC).
    const carrying = Math.max(0, Math.min(1, ((heroine.bellyNow?.() ?? 100) - PREGNANCY_ARC.firstBump) / (PREGNANCY_ARC.fullTermBump - PREGNANCY_ARC.firstBump)));
    // THE WEAPON TABLE'S ACTION, while one runs: it walks her to the table and turns her to it, and the stick waits.
    pace.carrying = carrying;
    tableAsk.yaw = turn.base;
    tableUse.update(dt, motion.x, motion.z, tableAsk);
    grabAsk.yaw = turn.base;
    grabUse.update(dt, motion.x, motion.z, grabAsk);
    // (her guns are down: on to the bar)
    if (grabAfterTable && !tableUse.busy) { grabUse.start(grabAfterTable); grabAfterTable = null; }
    // (whichever is running walks her and turns her)
    const ask = tableUse.busy ? tableAsk : grabAsk;
    if (busyNow()) {
      pace.step(dt, 0, limits);
      if (ask.walkTo) {
        // (straight to her spot at a walk, the last step no further than the spot)
        const away = Math.hypot(ask.walkTo.x - motion.x, ask.walkTo.z - motion.z);
        const toward = Math.atan2(ask.walkTo.x - motion.x, ask.walkTo.z - motion.z);
        motion.update(dt, 0, 1, toward, dt > 0 ? Math.min(pace.paceSpeed(0), away / dt) : 0);
      } else motion.update(dt, 0, 0, turn.base, 0);
    } else if (rig.mode === 'third' && rig.style === 'drone') {
      // THE DRONE CAMERA: the stick flies the camera (src/camera/cameraRig.ts) and she stands where she is
      rig.droneStick.x = controls.moveX;
      rig.droneStick.y = controls.moveY;
      pace.step(dt, 0, limits);
      motion.update(dt, 0, 0, turn.base, 0);
    } else {
      rig.droneStick.x = 0; rig.droneStick.y = 0;
      pace.step(dt, push, limits);
      // The stick moves her relative to the way the camera looks: up is away from the camera, right is to its right
      // (in third person the camera keeps the side of her it was dragged to). The walls stop her there too.
      motion.update(dt, controls.moveX, controls.moveY, rig.mode === 'first' ? rig.yaw : rig.viewYaw, pace.speed);
    }
    // (its buttons show when she is near it and nothing is running)
    hud.setUse(tableUse.canUse(motion.x, motion.z) && !grabUse.busy ? tableUse.label() : null, tableUse.needsReload);
    hud.setGrab(tableUse.busy || grabAfterTable ? null : grabUse.label(motion.x, motion.z));

    // 2b. WHICH WAY EACH PART OF HER FACES (src/input/bodyTurn.ts, Joshua's five bands of 2026-11-17: her head turns
    // up to 90 degrees from body North, her shoulders 80 % of that, her belly 60 %, her upper legs 40 %, her lower
    // legs and feet 20 %; past 90 body North is pulled round; when the looking stops it comes round to match).
    //   first person  she looks where the camera looks;
    //   third person  she looks at the sky target most in front of her shoulders (her auto-aim).
    turnInput.view = rig.mode;
    turnInput.move = motion.heading;
    if (rig.mode === 'first') turnInput.look = rig.yaw;
    // (third person aimed by hand: she looks where the camera over her shoulder looks)
    else if (aimedByHand()) turnInput.look = rig.viewYaw;
    else {
      aimTarget = targets.pick(motion.x, motion.z, turn.shoulders);
      const at = targets.position(aimTarget);
      turnInput.look = Math.atan2(at.x - motion.x, at.z - motion.z);
    }
    // (while the table's action runs, she looks at the table)
    if (ask.look !== null) turnInput.look = ask.look;
    turn.step(dt, turnInput);
    // (the key light, its shadow box and the patch of ground that shows her real shadow all go with her)
    keyLight.position.set(motion.x - 4, 10, motion.z + 6);
    keyLight.target.position.set(motion.x, 0, motion.z);
    shadowFloor.position.x = motion.x;
    shadowFloor.position.z = motion.z;
    heroine.setPosition(motion.x, motion.z);
    // (a body that turns its parts apart was handed `turn` once, where it was made, and reads it each frame; one
    //  that cannot faces one way, all of it: where she looks, or the way she goes)
    heroine.setYaw(heroine.setFacing || rig.mode !== 'first' ? turn.base : turn.head);
    heroine.setWalk(motion.speed);
    heroine.update(info);
    // (her painted blob of a shadow is only for when real shadows are off: moved far away, it is not seen)
    if (realShadows) ground.setHeroine(1e6, 1e6); else ground.setHeroine(motion.x, motion.z);

    // 3. Put the camera where it belongs, now that she has moved.
    // FIRST PERSON, WHILE SHE IS BUSY AT THE TABLE OR A BAR (Joshua, 2026-11-18): you are her, so the view turns with
    // her head (to the table, the bar) and tips down a little to her hands. Left where the player had it, her head
    // turned away from it and the camera ended up in front of her face. The player has the camera back after.
    // THE PLAYER STILL LOOKS AROUND ON TOP OF THAT (Joshua, 2026-11-18: "would like to be able to look around +/- 90
    // degrees left and right and +/- 70 up and down... while it still does what it's doing"): the drag since last
    // frame is kept as a look of its own, added to where the view follows, and held within those limits.
    if (rig.mode === 'first' && busyNow()) {
      if (!busyView.on) {
        // (the action has just begun: the view follows from where it is, with no look of the player's added yet)
        busyView.on = true;
        busyView.yaw = rig.yaw; busyView.pitch = rig.pitch;
        busyView.lookYaw = 0; busyView.lookPitch = 0;
      } else {
        // (what the player dragged since last frame: rig.applyLook moved the view from where it was set)
        busyView.lookYaw += Math.atan2(Math.sin(rig.yaw - busyView.setYaw), Math.cos(rig.yaw - busyView.setYaw));
        busyView.lookPitch += rig.pitch - busyView.setPitch;
      }
      const ease = 1 - Math.exp(-dt / FIRST_PERSON_FOLLOW_SECONDS);
      busyView.yaw += Math.atan2(Math.sin(turn.head - busyView.yaw), Math.cos(turn.head - busyView.yaw)) * ease;
      busyView.pitch += (FIRST_PERSON_BUSY_PITCH - busyView.pitch) * ease;
      busyView.lookYaw = Math.max(-BUSY_LOOK_SIDE, Math.min(BUSY_LOOK_SIDE, busyView.lookYaw));
      // (up and down: the view's own pitch stays within +/- BUSY_LOOK_UP_DOWN, so the player's look is held to what fits)
      busyView.lookPitch = Math.max(-BUSY_LOOK_UP_DOWN - busyView.pitch, Math.min(BUSY_LOOK_UP_DOWN - busyView.pitch, busyView.lookPitch));
      rig.yaw = busyView.setYaw = busyView.yaw + busyView.lookYaw;
      rig.pitch = busyView.setPitch = busyView.pitch + busyView.lookPitch;
    } else busyView.on = false;
    rig.update(dt, heroine);

    // 4. Aim. First person: along the line of sight. Third person: auto-aim at a sky target.
    targets.update(info);
    if (busyNow()) {
      // (busy at the table or a bar: no aiming)
      targets.setAimed(-1);
      heroine.aimAt(null);
    } else if (aimedByHand()) {
      // (aimed by hand, in first person or over her shoulder: at the crosshair, down the camera's line of sight)
      targets.setAimed(-1);
      heroine.aimAt(rig.aimPoint(AIM_RANGE, aim));
    } else if (turn.aimed) {
      // (the target her top half has turned to, picked above with her turning)
      targets.setAimed(aimTarget);
      heroine.aimAt(aim.copy(targets.position(aimTarget)));
    } else {
      // (the nearest target is further round than her top half turns while she runs: not aimed at until she turns)
      targets.setAimed(-1);
      heroine.aimAt(null);
    }

    // 5. FIRE, IN BURSTS (src/world/burstFire.ts; Joshua, 2026-11-17: "1/2/3 - wait a second - 1/2/3"), each gun
    // with its 20 rounds (src/world/tableUse.ts). First person: FIRE held, or a tap for one burst. Third person, with
    // auto-fire on: whenever she is aimed at a target. Her guns take turns; each shot leaves a streak.
    const clicks = controls.takeClicks();
    if (aimedByHand() && clicks > 0) burst.pull();
    const autoFiring = !aimedByHand() && turn.aimed;
    const wantFire = !busyNow() && ((aimedByHand() && controls.fireHeld) || autoFiring);
    let firedNow = false;
    burst.update(dt, wantFire,
      // (a hand fires only with its gun in it and rounds in the gun)
      (hand) => (heroine.hands?.hasGun(hand) ?? true) && tableUse.rounds[hand] > 0,
      (hand) => {
        heroine.fire(hand);
        tracers.fire(heroine.muzzle(hand, muzzle), aim);
        tableUse.rounds[hand]--;
        firedNow = true;
      });
    // (third person: with both guns empty she goes to the table and reloads on her own)
    if (!aimedByHand() && !busyNow() && tableUse.rounds.left === 0 && tableUse.rounds.right === 0) tableUse.start('reload');
    hud.setAmmo(heroine.hands?.hasGun('left') === false ? null : tableUse.rounds.left, heroine.hands?.hasGun('right') === false ? null : tableUse.rounds.right, burst.clicked !== null);
    tracers.update(info);

    // 5b. Her vitals: what she just did (how fast she moved, whether she is shooting) moves her heart, her breath,
    // her stamina, her food and her water on; her body and the card along the top show them.
    const shooting = firedNow;
    // (danger frightens her: for now the dome's state, the worst section: hurt up to 0.6, broken through 1. Step 1a's
    //  enemies coming close will add to it.)
    let threat = 0;
    for (const section of dome.sections) threat = Math.max(threat, section.shattered ? 1 : 0.6 * (1 - section.hp / SECTION_MAX_HP));
    vitals.step(dt, { speed: motion.speed, firing: shooting, threat, carrying });
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
        // THE READOUT IS KEPT IN SHORT LINES, about 30 letters at most, so that on a phone held sideways it fits
        // in the top left corner beside her vitals card and stays clear of the gear and the MOVE stick.
        // (Joshua, 2026-11-17: two long lines added here had made it grow over the gear and the view switch.)
        // The game's version is beside the FPS, so it can be read without opening Settings.
        const lines = [`${fps} FPS · ${VERSION_NUMBER}`, `${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} tris`];
        // the heroine's own share: her triangles as drawn, her detail level, her CPU time a frame
        const her = heroine.stats?.();
        if (her) {
          lines.push(`her ${her.triangles.toLocaleString()} tris · ${her.drawCalls} draws`);
          lines.push((her.detail !== undefined ? `detail ${her.detail}%${her.auto ? ' auto' : ''} · ` : '') + `${her.updateMs.toFixed(2)} ms CPU`);
        }
        // (the hidden live body: what its step costs each frame, and whether her baby is kicking)
        const liveNow = heroine.liveInfo?.();
        if (liveNow) lines.push(`live body ${liveNow.stepMs.toFixed(1)} ms` + (liveNow.kicks ? ` · ${liveNow.kicks} kick${liveNow.kicks > 1 ? 's' : ''}` : ''));
        else if (liveNote) lines.push(liveNote);
        // (her feet: her measured stride walking / running, and how fast she is really going; then which way she
        //  faces: body North and her head, and in third person whether her auto-aim has a target she can turn to)
        const strides = heroine.strideInfo?.(), feet = heroine.feetInfo?.();
        if (strides && feet) {
          lines.push(`stride ${strides.walk.stride.toFixed(2)}/${strides.run.stride.toFixed(2)} m · ${feet.speed.toFixed(1)} m/s`);
          lines.push(`north ${Math.round(turn.base * 57.3)}° · head ${Math.round(turn.head * 57.3)}°` + (rig.mode === 'third' && turn.aimed ? ' · aimed' : ''));
        }
        hud.setReadout(lines.join('\n'));
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
  // (on the splash, which is still up: it covers the page, so a message under it would never be seen)
  console.error(error);
  showSplashError('Galaxy Defenders could not start. Tap here to try again.', PALETTE.gold);
});
