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
import { setRestart } from './core/restart';
import { STANCE } from './heroine/fast/groundPose';
import { createPause, type Pause } from './ui/pauseMenu';
import { CameraRig } from './camera/cameraRig';
import { createStandInHeroine } from './heroine/standIn';
import { NO_LIMITS, PACE_TUNING, Pace, type PaceLimits } from './input/pace';
import { HeroineVitals } from './vitals/heroineVitals';
import { VitalsPanel } from './vitals/vitalsPanel';
import { loadHeroineSettings, outfitLook, saveSetting, skinOilyOf, type HeroineSettings } from './heroine/heroineSettings';
import type { IntakeAction } from './ui/hud';
import { Controls } from './input/controls';
import { preventPageZoom } from './input/noZoom';
import { PlayerMotion } from './input/playerMotion';
import { BodyTurn, wrapAngle } from './input/bodyTurn';
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
import type { IslandWorld } from './world/island/islandWorld';
import { PregnancyPlan, weekText } from './heroine/pregnancyPlan';
import { TableUse } from './world/tableUse';
import { HolsterUse } from './world/holsterUse';
import { Door, DoorUse, DOOR, bodyRadius as doorBodyRadius } from './world/door';
import { BeltReload } from './world/beltReload';
import type { BeltGear } from './heroine/fast/beltGear';
import { BurstFire } from './world/burstFire';
import { GrabBars, GrabUse, type BarName } from './world/grabBars';

/**
 * SIDE STEPS (Joshua, 2026-11-18). GAME TUNING. In third person MANUAL, AT A WALK only (her pace under SIDE_WALK_UNDER:
 * a walk is 1, a jog 2), she keeps facing the way the camera looks and the stick gives FOUR moves, nothing between:
 * walk ahead, walk back, crab step left, crab step right (the nearest of the four to the way it is pushed). Faster,
 * there are no side steps: the stick moves her ahead, back, left or right of the camera and her body turns to run
 * that way. A crab step goes no faster than SIDE_WALK_MOST metres a second (her first belly) .. SIDE_WALK_MOST_FULL_TERM
 * (full term). A metre sideways costs SIDE_EFFORT times a metre forward (less efficient; with a big belly real work).
 * TAKEN OUT IN THIRD PERSON (Joshua, 2026-11-20: "remove the side step... and just rotate head which will turn her"):
 * the stick left or right now turns her head that way and her body follows it round (input/bodyTurn.ts `headLead`,
 * `bandLag`) at any pace. Kept: holding a door (her hand is on the handle, so she side-steps), and backing up
 * (pulled back she still keeps facing the camera's way and steps backward).
 */
const SIDE_WALK_MOST = 1.0;
const SIDE_WALK_MOST_FULL_TERM = 0.8;
const SIDE_EFFORT = 1.25;
import { CAMERA_STYLES, CAMERA_STYLE_NAMES, type CameraStyle } from './camera/cameraRig';

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
  strideNow?: () => { stride: number; share: number };
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
async function createHeroine(renderer: THREE.WebGLRenderer, scene: THREE.Scene, settings: HeroineSettings, say: (text: string) => void, outfit: string | null): Promise<GameHeroine> {
  const asked = new URLSearchParams(location.search);
  if (asked.get('heroine') === 'standin') return createStandInHeroine();
  const { lookKey, LOOKS } = await import('./heroine/looks');
  // (her outfit: the one asked for -- at the start the address's ?look=, else the one chosen in Settings
  //  (heroineSettings.ts OUTFIT_CHOICES); after a change in Settings, the new one: see `changeOutfit`)
  const look = lookKey(outfit);
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
        sharpParts: settings.sharpParts !== 'off',
        suitKnit: settings.suitKnit,
        hairStrands: settings.hairStrands !== 'off',
        skinTexture: settings.skinTexture !== 'off',
        faceLocks: settings.faceLocks === 'on',
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

/**
 * The Settings choices that change HER (a new body of the same kind) and are done WHILE THE GAME RUNS (main's
 * `changeOutfit`); every other one that needs a new heroine (the Body, Light or Full, the live body) still starts the
 * game again.
 */
// (and her live body on or off: the swap opens it, or lets go of it, as it makes her again: Joshua, 2026-11-21, a restart
//  for it crashed on his iPhone)
const OUTFIT_CHANGE_KEYS: readonly string[] = ['outfit', 'catsuitNeck', 'suitKnit', 'hairStrands', 'skinTexture', 'faceLocks', 'sharpParts', 'liveBody'];

/** How wide the portrait cover's still picture of the game is made, pixels (it is shown far smaller). */
const SNAPSHOT_WIDTH = 480;

const MAX_STEP = 1 / 20; // a frame never counts for more than this many seconds
const TABLE_WALK = 1.1;
/**
 * BLAZE'S PREGNANCY, from her Character Builder export (Joshua, 2026-11-19): her first visible belly (firstWeekBump,
 * 10 %) and full term (deliveryBump, 150 %, week 42). How far along she is between them slows her paces and tires her sooner
 * (src/input/pace.ts PACES_FULL_TERM, src/vitals/heroineVitals.ts byPaceFullTerm). LATER: read from her look.
 */
/** Where the third-person camera style is kept on this device. */
const CAMERA_STYLE_KEY = 'gdm.cameraStyle';
/**
 * THE CAMERA STYLES AIMED BY HAND (Joshua, 2026-11-19: "allow some camera modes in manual... walking is fine, trying to
 * shoot and aim would be different and would need a closer view"): over her shoulder (the aiming view), follow, and
 * the two side views. While FIRE is held, and for MANUAL_AIM_HOLD seconds after, the camera is over her shoulder
 * whatever is chosen, so the crosshair aims where she does. Kept on this device apart from the other list.
 */
const MANUAL_CAMERA_STYLES: readonly CameraStyle[] = ['shoulder', 'follow', 'sideLeft', 'sideRight'];
const MANUAL_CAMERA_STYLE_KEY = 'gdm.cameraStyleManual';
const MANUAL_AIM_HOLD = 1.2;
/** Her move, for squaring her feet up between moves (see GAIT_RESET). */
type Gait = 'stand' | 'ahead' | 'back' | 'left' | 'right' | 'go';
/**
 * SQUARED UP BETWEEN MOVES (Joshua, 2026-11-20): her feet are set side by side over this long at a walk, seconds; going
 * faster than GAIT_RESET_SPEED, shorter by as much (never under GAIT_RESET_LEAST).
 */
const GAIT_RESET = 0;          // (Joshua, 2026-11-20: 0.3 "was slightly too long", then 0.1, then "make it 0.0 (instant)":
                               //  her feet snap home in a frame and the next move starts at once)
const GAIT_RESET_SPEED = 1.1;
const GAIT_RESET_LEAST = 0;
/** Her facing held, the stick stays on its move until another is this many times nearer (about 54 degrees, not 45). */
const GAIT_KEEP = 1.4;
/** WINDED (Joshua, 2026-11-20): she bends over in this long, seconds, and straightens up over the hold's last so many. */
const WINDED_IN = 0.6;
const WINDED_OUT = 1.0;
/**
 * HOLDING HER BELLY UP AS SHE RUNS (Joshua, 2026-11-20: "from a run and up"; "anything over 30 weeks"): on from this
 * pace level (3 is a run: most of the way there), off again below the other (a little room, so it does not flicker), and
 * only from this week of her pregnancy.
 */
const SUPPORT_ON_LEVEL = 2.75;
const SUPPORT_OFF_LEVEL = 2.4;
const SUPPORT_FROM_WEEK = 30;
/** No look down at a kick while she fires, nor this long after, seconds (Joshua: never pull the view off a target). */
const LOOK_AFTER_FIRE = 3;
// First person while she is busy at the table or a bar: how quickly the view follows her head (seconds), and how far
// it tips down when she has no hands to look at (radians, about 45 degrees; with hands it looks at them).
const FIRST_PERSON_FOLLOW_SECONDS = 0.2;
const FIRST_PERSON_BUSY_PITCH = -0.8;
/** ...and the most it tips down to see her hands (radians, about 80 degrees: never quite straight down). */
const FIRST_PERSON_BUSY_PITCH_MOST = 1.4;
/** ...and how far the player may still look round meanwhile: 90 degrees to each side of it (up and down: her neck's reach). */
const BUSY_LOOK_SIDE = Math.PI / 2;
/**
 * ...and once the player lets go of the camera, it is back on her look this long after (seconds), starting at once;
 * a look turned further than BUSY_LOOK_RETURN_PER (radians, 60 degrees) takes longer in proportion, up to
 * BUSY_LOOK_RETURN_MOST.
 */
const BUSY_LOOK_RETURN_SECONDS = 1.5;
/** ...after waiting this long once the player lets go (seconds; Joshua, 2026-11-20: "add a 1s delay"). */
const BUSY_LOOK_WAIT = 1;
const BUSY_LOOK_RETURN_PER = Math.PI / 3;
const BUSY_LOOK_RETURN_MOST = 3;
/** First person, walking over to the table or a bar: how far the view looks down (radians, about 8 degrees). */
const FIRST_PERSON_WALK_PITCH = -0.14;
/** How quickly her look tips up or down to what she does (seconds, for about two thirds of the way). */
const ACTION_PITCH_SECONDS = 0.3;
/** The over-the-shoulder camera with nothing to look at: a little up (radians, about 10 degrees). */
const SHOULDER_REST_PITCH = 0.17;
const PREGNANCY_ARC = { firstBump: 10, fullTermBump: 150 } as const; // her pace walking up to the weapon table, metres a second (a walk)
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
  // (`let`: "Show full readout" in Settings turns it on or off while the game runs, below)
  let debug = new URLSearchParams(location.search).get('debug') === '1' || debugRemembered;

  // ---- Renderer ---------------------------------------------------------------
  // No shadows (the ground paints her shadow itself) and at most 2 device pixels
  // per CSS pixel: a phone's 3x screen would triple the work for little gain.
  // ("Sharpness" in Settings lowers that to 1: about a quarter of the pixels to fill.)
  const graphics = loadHeroineSettings();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // (if loading fails part-way and the splash's "tap to try again" reloads, the graphics chip is let go of first;
  //  once the game is up, `restart` below takes over with the full clean-up)
  setRestart(() => {
    try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* reloading anyway */ }
    window.setTimeout(() => location.reload(), 300);
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, graphics.sharpness));
  host.appendChild(renderer.domElement);

  // ---- World --------------------------------------------------------------------
  const scene = new THREE.Scene();
  // THE MAP (Joshua, 2026-11-19): the real island (the main game), or the domed town, kept to test in until its place
  // on the island is chosen (Settings -> WORLD -> Map, or ?map=town). The town's pieces are still made on the island
  // (the code round them expects them) but are not put in the scene, so they are neither drawn nor in her way.
  const onIsland = graphics.map === 'island';
  const sky = createSky(renderer);
  if (!onIsland) {
    scene.background = sky.background;
    scene.add(sky.stars);
  }

  const ground = createGround();
  if (!onIsland) scene.add(ground.mesh);

  const city = createCity();
  if (!onIsland) scene.add(city.group);

  const dome = await Dome.load(`${import.meta.env.BASE_URL}models/Half_Sphere.obj`);
  if (!onIsland) scene.add(dome.group);

  // THE ISLAND (src/world/island/): its 3 x 3 tiles round her, the coarse far island, the sea and the day sky. The
  // game waits, behind the splash, until the ground round her arrival point is all in.
  let island: IslandWorld | null = null;
  if (onIsland) {
    meter.step('island', 'Opening the island…');
    const { createIslandWorld } = await import('./world/island/islandWorld');
    island = await createIslandWorld(`${import.meta.env.BASE_URL}island/`, scene, { landscaping: graphics.landscaping });
    scene.add(island.group);
    let told = -1;
    await island.ready(0, 0, (done, of) => {
      if (done === told) return;
      told = done;
      meter.step(`island ground ${done}`, `The island: ground ${done} of ${of}…`);
    });
    await breathe();
  }
  /**
   * Where her feet go, metres: 0 on the flat town; on the island the ground, or in a deep river or lake, held up in the
   * water to her shoulders (islandWorld.ts standAt). The last good height if a tile is not in yet.
   */
  let groundY = 0;
  const groundUnder = (x: number, z: number): number => {
    if (!island) return 0;
    const g = island.standAt(x, z);
    if (Number.isFinite(g)) groundY = g;
    return groundY;
  };

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
  // HER OUTFIT NOW: the address's ?look= wins at the start, else the one chosen in Settings. A change in Settings
  // changes her outfit WHILE THE GAME RUNS (see `changeOutfit` below), and this follows it.
  // (a catsuit in the style chosen under Catsuit style: heroineSettings.ts outfitLook)
  let outfitNow: string | null = outfitLook(new URLSearchParams(location.search).get('look') ?? graphics.outfit, graphics.catsuitNeck) || null;
  /**
   * THE HEROINE AS THE REST OF THE GAME KNOWS HER (Joshua, 2026-11-20: "when I select a new outfit, does it restart the
   * whole app? It should freeze the screen, remove the old clothing, apply the new one, then unfreeze"). Everything
   * that works with her (the table, the bars, the door, her holsters, her belt reload, the camera, the loop below) is
   * given THIS one object, once. It is a stand-in that passes every question on to whichever body she is now
   * (`bodyNow`): a JavaScript Proxy. A change of outfit swaps `bodyNow` for the new body, and everything keeps working
   * with no new hand-over: they all ask `heroine.hands`, `heroine.root` and so on afresh each time.
   */
  let bodyNow: GameHeroine = await createHeroine(renderer, scene, graphics, (text) => meter.step(text, text), outfitNow);
  const heroine: GameHeroine = new Proxy({} as GameHeroine, {
    get(_stand, key) {
      const value = (bodyNow as unknown as Record<PropertyKey, unknown>)[key];
      // (her methods are run on her own body, as if called on it directly)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(bodyNow) : value;
    },
    has(_stand, key) { return key in bodyNow; },
  });
  // (her skin's shine as chosen in Settings: 0 dry .. 25 natural .. 100 oily)
  heroine.setSkinShine?.(skinOilyOf(graphics.skinShine));
  await breathe();
  scene.add(heroine.root);
  // Real shadows on or off (Settings): the renderer's shadow pictures, the key light's, and every part of her casting.
  let realShadows = false;
  const applyShadows = (): void => {
    realShadows = graphics.shadows === 'on';
    renderer.shadowMap.enabled = realShadows;
    keyLight.castShadow = realShadows;
    shadowFloor.visible = realShadows && !island; // (on the island the ground itself takes her shadow)
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
      const live = await openLiveBody(renderer, LOOKS[lookKey(outfitNow)], (stage) => meter.step(`live body: ${stage}`, `Blaze's live body: ${stage}…`));
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
  const motion = new PlayerMotion(island ? island.walls : walls);
  if (island) { motion.x = 0; motion.z = 0; } // (she arrives at the island's centre point: the beach)
  // Which way each part of her faces (src/input/bodyTurn.ts). She starts looking out at the city (+Z). A body that
  // can turn its parts apart is handed this once and reads it every frame.
  const turn = new BodyTurn();
  if (island) turn.reset(island.arrivalFacing); // (on the island she arrives facing inland, the sea behind her)
  heroine.setFacing?.(turn);

  // THE WEAPON TABLE (Joshua, 2026-11-17: "a table you can actually grab to pick up and drop your guns"): beside
  // where she starts, so she can walk up to it, put her guns down on it and take them up again
  // (src/world/weaponTable.ts, src/world/tableUse.ts; her hands: src/heroine/fast/handReach.ts, lowerBody.ts).
  // (its clips in her outfit's gun colours, so a clip from the table matches her guns: looks/gear.ts)
  const [{ lookKey: tableLookKey }, { LOOK_GEAR }] = await Promise.all([import('./heroine/looks'), import('./heroine/looks/gear')]);
  const tableLook = tableLookKey(outfitNow);
  const table = new WeaponTable(graphics.tableHeight, LOOK_GEAR[tableLook]?.gun);
  table.place(1.6, 9.85, 0);
  scene.add(table.root);
  const tableUse = new TableUse(table, heroine);
  /** What the table's action asks for this frame (one object, rewritten). */
  const tableAsk: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null } = { walkTo: null, look: null, yaw: 0, lookAt: null };
  // THINGS TO TAKE HOLD OF (Joshua's step #4, 2026-11-18): an upright pole and a waist-high rail beside the table, the
  // other side of the street (src/world/grabBars.ts; her fingers: src/heroine/fast/fingerTouch.ts).
  const bars = new GrabBars();
  bars.place('pole', -1.3, 10.1, 0);
  bars.place('rail', -3.0, 10.3, 0);
  scene.add(bars.pole, bars.rail);
  // THE DOOR (Joshua, 2026-11-18; src/world/door.ts): beside the rail, its pull side (the lever) toward the plaza
  const door = new Door();
  door.place(-5.2, 10.2, Math.PI);
  scene.add(door.root);
  // (on the island the table, bars and door stand on the beach beside her, on the sand's own height)
  if (island) {
    table.root.position.y = groundUnder(1.6, 9.85);
    bars.pole.position.y = groundUnder(-1.3, 10.1);
    bars.rail.position.y = groundUnder(-3.0, 10.3);
    door.root.position.y = groundUnder(-5.2, 10.2);
    for (const thing of [table.root, bars.pole, bars.rail, door.root]) thing.updateMatrixWorld(true);
  }
  const grabUse = new GrabUse(bars, heroine);
  const grabAsk: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null } = { walkTo: null, look: null, yaw: 0, lookAt: null };
  // (the door: opening it, holding its handle while she walks it open or shut, letting go)
  const doorUse = new DoorUse(door, heroine);
  const doorAsk: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null; pull: THREE.Vector3 } = { walkTo: null, look: null, yaw: 0, lookAt: null, pull: new THREE.Vector3() };
  /** Where the door puts her back (one object, rewritten). */
  const doorOut = { x: 0, z: 0 };
  /** A door waiting for this hand's gun to go into its holster first. */
  let doorAfterHolster: Hand | null = null;
  /** A bar to take hold of once her guns are on the table (a hand with a gun in it puts it down first). */
  let grabAfterTable: BarName | null = null;
  // HER THIGH HOLSTERS (Joshua, 2026-11-18: her guns away "on the go"; src/world/holsterUse.ts). She keeps walking.
  const holsterUse = new HolsterUse(heroine);
  holsterUse.startHolstered(); // (her guns start in their holsters: DRAW takes them out)
  /** Where she glances while she holsters or draws (one object, rewritten). */
  const holsterAsk: { lookAt: THREE.Vector3 | null } = { lookAt: null };
  // RELOADING FROM HER BELT, ON THE GO (Joshua, 2026-11-18; src/world/beltReload.ts): one gun at a time, the other
  // holstered; the empty goes back into the pouch the fresh clip came from. The table's RELOAD refills her pouches.
  // (her belt gear is asked for each time: a new outfit brings a new belt)
  const gearNow = (): BeltGear | null => (heroine as unknown as { gear?: BeltGear }).gear ?? null;
  const beltReload = new BeltReload(heroine, gearNow, tableUse, holsterUse);
  const beltAsk: { lookAt: THREE.Vector3 | null } = { lookAt: null };
  tableUse.pouchesLow = () => {
    const gear = gearNow();
    return !!gear && Array.from({ length: gear.pouches }, (_, i) => gear.pouchState(i)).some((state) => state !== 'full');
  };
  /** Whether the table's reload is running (when it ends, her pouches are full again). */
  let tableReloading = false;
  /** A table action waiting for her holstered guns to be drawn first; a bar waiting for her guns to be put away. */
  let tableAfterDraw: 'both' | 'left' | 'right' | 'reload' | null = null;
  let grabAfterHolster: BarName | null = null;
  /**
   * The table's buttons, with her holsters in mind: a holstered gun the action needs (to put on the table, to reload)
   * is drawn first, then the action begins.
   */
  const useTable = (which: 'both' | 'left' | 'right' | 'reload'): void => {
    const h = heroine.hands;
    if (!h || grabUse.busy || holsterUse.busy || tableUse.busy || beltReload.busy) return;
    const holding = h.hasGun('left') || h.hasGun('right');
    const draw = which === 'reload' ? holsterUse.holstered.left || holsterUse.holstered.right
      : which === 'both' ? !holding && !tableUse.lies('left') && !tableUse.lies('right') && (holsterUse.holstered.left || holsterUse.holstered.right)
      : holsterUse.holstered[which];
    if (!draw) { tableUse.start(which); return; }
    if (which === 'left' || which === 'right') holsterUse.start(which); else holsterUse.drawAll();
    tableAfterDraw = which;
  };
  /** Whether she is busy with the table or a bar (the stick waits, she does not aim or fire). */
  const busyNow = (): boolean => tableUse.busy || grabUse.busy || doorUse.busy;
  /** What her turning is told each frame (one object, rewritten: nothing new is made in the loop). */
  const turnInput: { view: 'first' | 'third'; look: number | null; move: number | null; hold: number | null; grip: boolean } = { view: 'third', look: null, move: null, hold: null, grip: false };
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

  // HER PREGNANCY, to test (Joshua, 2026-11-19; heroine/pregnancyPlan.ts): on or off and her belly, from Settings (as
  // her look has them until changed), the week off her own chart, and the time lapse from week 12 to her delivery week.
  const { LOOKS: ALL_LOOKS } = await import('./heroine/looks');
  const plan = new PregnancyPlan((ALL_LOOKS[tableLook]?.body as { pregnancy?: unknown } | undefined)?.pregnancy);
  if (graphics.pregnant === null) graphics.pregnant = plan.lookPregnant ? 'on' : 'off';
  if (graphics.belly === null) graphics.belly = Math.round(heroine.bellyNow?.() ?? plan.start);
  const pregnantNow = (): boolean => graphics.pregnant === 'on';

  // HER STANCE (Joshua, 2026-11-20: "Walk while crouch, crawling on belly (however, once pregnancy is on, make her crawl
  // on all four with weapons holstered)"; heroine/fast/groundPose.ts). The CROUCH and PRONE buttons: CROUCH crouches or
  // stands her up; PRONE takes her down (on her belly, or on all fours whenever Pregnancy is on) or stands her up.
  // Down there she goes no faster than a crawl; on her belly she aims and fires only while still; on all fours her guns
  // are holstered, and still she may draw ONE (the other hand and both knees stay down), put away again before she moves.
  let stance: 'stand' | 'crouch' | 'down' = 'stand';
  const stanceAsked = (): 'stand' | 'crouch' | 'prone' | 'fours' => (stance === 'down' ? (pregnantNow() ? 'fours' : 'prone') : stance);
  /** She is on her belly or all fours (or getting there) and moving, or getting down or up: no aiming or firing. */
  let stanceNoAim = false;
  /** Her belly and pregnancy as Settings (or the time lapse) have them, on her body, her live body and her vitals. */
  const applyPregnancy = (): void => {
    const belly = graphics.belly ?? plan.start;
    heroine.setPregnant?.(pregnantNow());
    heroine.setBelly(belly);
    vitals.setWeeks(pregnantNow() ? plan.weekFor(belly) : 0);
  };
  applyPregnancy();
  /** Her belly as Settings shows it: the percent and the week it stands for (or "not pregnant"). */
  const bellyText = (percent: number): string => pregnantNow() ? `${percent}% · ${weekText(plan.weekFor(percent))}` : `${percent}% · not pregnant`;
  const vitalsPanel = new VitalsPanel();
  /** What her body allows this frame (her stamina, her share of full speed), from last frame's vitals. */
  let limits: PaceLimits = NO_LIMITS;
  /**
   * First person while she is busy: where the view follows (her head, tipped to her hands), the player's own look on
   * top of it, and what was set last frame (to tell the player's drag from it).
   */
  const eyeAt = new THREE.Vector3(), handsAt = new THREE.Vector3(), handOne = new THREE.Vector3();
  /** Where she looks, up and down, while she does something: wanted this frame, and eased (radians). */
  let actionPitchWant = 0, actionPitch = 0;
  /** How much the over-the-shoulder camera follows her head's look rather than her target, 0 to 1 (eased). */
  let headDoing = 0;
  /** First person: how far the view is tipped down on top of the player's look, glancing at a holster (radians). */
  let fpGlance = 0;
  // (where her look down at a kick is: heroine/fast/bellyTouch.ts)
  const lookSpot = new THREE.Vector3();
  /** Holding her belly up as she runs (Joshua: "from a run and up"; "anything over 30 weeks"), with a little room each way. */
  let supporting = false;
  /** Her move now, and how long she still waits for her feet to be squared up before the next (see GAIT_RESET). */
  let gait: Gait = 'stand', gaitResetLeft = 0;
  /** How far she is bent over winded now, 0..1 (set each frame from her pace's winded hold). */
  let windedWeight = 0;
  const busyView = { on: false, yaw: 0, pitch: 0, lookYaw: 0, lookPitch: 0, setYaw: 0, setPitch: 0, idle: 0, fromYaw: 0, fromPitch: 0, dragging: false, returnSeconds: 1.5 };
  /** Her guns' bursts (src/world/burstFire.ts). */
  const burst = new BurstFire();

  // THE CAMERA STYLE in third person (src/camera/cameraRig.ts; Joshua, 2026-11-18): the CAM button goes round them,
  // and the choice is kept on this device.
  let cameraStyle: CameraStyle = 'follow';
  try {
    const kept = localStorage.getItem(CAMERA_STYLE_KEY) as CameraStyle | null;
    if (kept && CAMERA_STYLES.includes(kept)) cameraStyle = kept;
  } catch { /* (no storage: follow) */ }
  let manualStyle: CameraStyle = 'shoulder';
  try {
    const kept = localStorage.getItem(MANUAL_CAMERA_STYLE_KEY) as CameraStyle | null;
    if (kept && MANUAL_CAMERA_STYLES.includes(kept)) manualStyle = kept;
  } catch { /* (no storage: over her shoulder) */ }
  /** Seconds since FIRE was last held (aimed by hand: the camera stays over her shoulder this long after). */
  let sinceFire = Infinity;
  rig.droneLimit = DOME_RADIUS - 3;
  if (island) {
    // the island: the camera sees out to the far coast (16 km of haze), keeps over the hills, and the drone is free
    rig.camera.far = 20000;
    rig.camera.updateProjectionMatrix();
    rig.groundAt = island.groundAt;
    heroine.setGround?.(island.standAt); // (her feet on the ground under each of them, along its slope; in deep water, held up)
    rig.droneLimit = Infinity;
    rig.faceAtOnce(island.arrivalFacing);
  }
  /**
   * AIMED BY HAND: always in first person; in third person when auto-fire is off (Joshua, 2026-11-18: "so you could
   * also shoot in 3rd person... over the shoulder view and a simple cross hair"). Then the camera is over her
   * shoulder, she looks where it looks, and FIRE shoots at the crosshair.
   */
  // (Joshua, 2026-11-18: one setting for BOTH views, so she can be watched working on her own in either, or played)
  const aimedByHand = (): boolean => graphics.autoFire === 'off';
  /**
   * Her facing held to the camera's way now: third person MANUAL, backing up, nothing else running. (At a walk it was
   * held to side-step too, until Joshua, 2026-11-20: "remove the side step... and just rotate head which will turn her".)
   */
  const walkSides = (): boolean => rig.mode === 'third' && aimedByHand() && !busyNow() && backingUp();
  /**
   * The stick pulled back (more back than to either side). BACKING UP she keeps facing the camera's way at ANY pace
   * (Joshua, 2026-11-19: "facing South (camera was facing North) to go backwards... it did for a moment but then
   * started facing direction of travel not staying facing the camera's direction and backing up"), never faster
   * than her jog. Only ahead and to the sides does she turn and run once she is past a walk.
   */
  const backingUp = (): boolean => controls.moveY < 0 && Math.abs(controls.moveY) >= Math.abs(controls.moveX);
  /** Everything that follows from the view and the aiming: the camera's style, the buttons, what a click does. */
  const applyView = (): void => {
    rig.setStyle(rig.mode === 'third' && aimedByHand() ? (sinceFire < MANUAL_AIM_HOLD ? 'shoulder' : manualStyle) : cameraStyle);
    heroine.setFirstPerson(rig.mode === 'first');
    controls.clickMode = aimedByHand() ? 'click-fires' : 'look-only';
    // (the HUD keeps hold of the MOVE stick through this, so she goes on at the pace she had: src/ui/hud.ts)
    hud.setView(rig.mode, aimedByHand());
    hud.setCameraStyle(CAMERA_STYLE_NAMES[aimedByHand() ? manualStyle : cameraStyle]);
    hud.setAimMode(!aimedByHand());
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

  // FOOD AND DRINK, TO TEST (Joshua, 2026-11-19; Settings -> FOOD & DRINK). Eating and drinking take a few seconds: what
  // is being eaten goes into her a little each frame (`eating`, below in the loop), so her bar and her belly rise as she
  // eats. The amounts are ordinary portions, millilitres.
  const INTAKE: Record<'snack' | 'smallMeal' | 'fullMeal' | 'sip' | 'bottle' | 'canteen', { food: number; water: number; seconds: number }> = {
    snack: { food: 150, water: 0, seconds: 3 },
    smallMeal: { food: 400, water: 0, seconds: 6 },
    fullMeal: { food: 700, water: 0, seconds: 10 },
    sip: { food: 0, water: 100, seconds: 1.5 },
    bottle: { food: 0, water: 500, seconds: 5 },
    canteen: { food: 0, water: 1000, seconds: 8 },
  };
  /** What she is eating or drinking now, still to go into her, and the seconds left to take it. */
  const eating = { food: 0, water: 0, seconds: 0 };
  /** Seconds left squatting for the bathroom (her bladder is emptied when they run out). */
  let bathroomLeft = 0;
  const BATHROOM_SECONDS = 5;
  const intake = (action: IntakeAction) => {
    if (action === 'hungry') { vitals.setFoodBar(0.25); return; }
    if (action === 'thirsty') { vitals.setWaterBar(0.25); return; }
    if (action === 'needToGo') { vitals.setBladder(350); return; }
    if (action === 'mustGo') { vitals.setBladder(520); return; }
    if (action === 'bathroom') { bathroomLeft = BATHROOM_SECONDS; heroine.squatFor?.(BATHROOM_SECONDS); return; }
    const portion = INTAKE[action];
    eating.food += portion.food;
    eating.water += portion.water;
    eating.seconds = Math.max(eating.seconds, 0) + portion.seconds;
  };
  vitals.gutHoursPerSecond = graphics.bodyClock / 3600;

  const domeDebug = (action: DomeDebugAction) => {
    if (action === 'wet') { heroine.soakSkin?.(); return; }
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
  // (every other way of starting again -- the splash, the control editor -- goes through this one: core/restart.ts)
  setRestart(restart);

  /**
   * CHANGING HER OUTFIT WHILE THE GAME RUNS (Joshua, 2026-11-20: "It should freeze the screen, remove the old clothing,
   * apply the new one, then unfreeze with the outfit... CCBS actually switches almost instantly with no issues or
   * restarting of the whole app"). Settings -> HEROINE -> Outfit (and the other choices that make her a different
   * body: suit fabric, hair strands, skin depth, the locks by her face, the sharp face, bust and belly) come here
   * instead of restarting the game:
   *
   *   1. whatever she is doing ends first (a bar or a door is let go; a holster, a reload, the table, a squat finish);
   *   2. the picture FREEZES (the loop draws nothing and no game time passes) under a small "Changing outfit" cover;
   *   3. the old body is LET GO FIRST, before the new one is loaded, so the phone never holds two of her at once
   *      (holding two is what crashed the iPhone before). Her hidden live body is kept when the new outfit is on the
   *      same body (most are: it is the slowest thing of hers to open), else it is let go and opened again;
   *   4. the new body is made, put where she stood, facing the same way, with her belly, pregnancy, skin shine, view,
   *      shadows, guns (in her hands, holstered or on the table, each with its rounds) and full pouches as they were;
   *   5. the graphics chip is given the new body's materials ahead of time, and the picture UNFREEZES.
   *
   * Two changes made quickly one after the other run one after the other, the last one winning.
   */
  /** True while the picture is frozen for a change (the loop does nothing). */
  let frozen = false;
  /** A change is running; another was asked for meanwhile. */
  let outfitChanging = false, outfitAgain = false;
  /** The small cover over the frozen picture. */
  const outfitCover = document.createElement('div');
  outfitCover.style.cssText = 'position:fixed;inset:0;z-index:1500;display:none;align-items:center;justify-content:center;background:rgba(4,6,13,.55);color:#5ee8c8;font:600 15px system-ui;letter-spacing:.06em;text-align:center;pointer-events:all;';
  document.body.appendChild(outfitCover);
  /** Nothing of hers is running that a change of body would cut short. */
  const idleForChange = (): boolean => !busyNow() && !holsterUse.busy && !beltReload.busy && !tableAfterDraw
    && !grabAfterHolster && !grabAfterTable && doorAfterHolster === null && bathroomLeft <= 0 && !grabUse.holding && !doorUse.holding;
  /**
   * What the cover says while she changes. Made OUT HERE on purpose: the new body keeps this for good (it is how she
   * reports her loading), and a closure keeps everything its scope keeps -- made inside `swapBody` it held on to the
   * old body's belt, and through it the whole old body (about 500 MB, found with a heap snapshot, 2026-11-20).
   */
  const sayChanging = (text: string): void => { outfitCover.textContent = text.replace('Loading Blaze', 'Changing outfit'); };
  /** How many of a belt's pouches hold a full clip (also out here, for the same reason). */
  const fullPouchesOf = (gear: BeltGear | null): number => {
    let n = 0;
    if (gear) for (let i = 0; i < gear.pouches; i++) if (gear.pouchState(i) === 'full') n++;
    return n;
  };
  const swapBody = async (): Promise<void> => {
    // 1. her hands let go of a bar or a door; then wait for whatever is running to finish (checked ten times a second)
    if (grabUse.holding) grabUse.letGo();
    if (doorUse.holding) doorUse.letGo();
    while (!idleForChange()) await new Promise((done) => setTimeout(done, 100));
    // 2. freeze, and the cover
    frozen = true;
    outfitCover.textContent = 'Changing outfit…';
    outfitCover.style.display = 'flex';
    await breathe();
    const say = sayChanging;
    // what carries over: her outfit's look (old and new), and how many pouches hold a full clip
    const [{ lookKey, LOOKS }, { bareLook, openLiveBody }] = await Promise.all([import('./heroine/looks'), import('./heroine/fast/liveBody')]);
    const wanted = outfitLook(graphics.outfit, graphics.catsuitNeck);
    const fromLook = lookKey(outfitNow), toLook = lookKey(wanted || null);
    const fullPouches = fullPouchesOf(gearNow());
    // 3. let go of the old body first; her hidden live body is kept if the new outfit is on the same body
    const bodyOf = (key: string): string => JSON.stringify(bareLook(LOOKS[key]).body);
    const sameBody = bodyOf(fromLook) === bodyOf(toLook);
    const oldBody = bodyNow as GameHeroine & { detachLive?: () => import('./heroine/fast/liveBody').LiveBody | null };
    let live = oldBody.detachLive?.() ?? null;
    if (live && !sameBody) { live.dispose(); live = null; }
    oldBody.root.removeFromParent();
    oldBody.dispose();
    renderer.renderLists.dispose();
    await breathe();
    // 4. the new body, as she was
    outfitNow = wanted || null;
    bodyNow = await createHeroine(renderer, scene, graphics, say, outfitNow);
    scene.add(heroine.root);
    heroine.setSkinShine?.(skinOilyOf(graphics.skinShine));
    heroine.setFacing?.(turn);
    if (island) heroine.setGround?.(island.standAt);
    heroine.setPosition(motion.x, motion.z, island ? island.groundAt(motion.x, motion.z) : 0);
    heroine.setYaw(turn.base);
    applyShadows();
    applyView();
    if (graphics.liveBody === 'on' && heroine.attachLive) {
      try {
        if (!live) { say('Changing outfit: her live body…'); live = await openLiveBody(renderer, LOOKS[toLook], (stage) => sayChanging(`Changing outfit: live body, ${stage}…`)); }
        heroine.attachLive(live);
        live.readAgain(); // (the builder's shape for her belly is read again for the new body)
      } catch (error) { console.error('The live body could not be opened again; she carries on without it.', error); live = null; }
    } else live?.dispose();
    applyPregnancy(); // (after the live body is in, so it hears her belly and pregnancy too)
    holsterUse.reseat();
    tableUse.reseat();
    gearNow()?.setClips(fullPouches);
    // 5. her new materials handed to the graphics chip ahead of time (never waited on more than 5 s), then unfreeze
    say('Changing outfit: getting the picture ready…');
    try { await Promise.race([renderer.compileAsync(scene, rig.camera), new Promise((enough) => setTimeout(enough, 5000))]); }
    catch (error) { console.warn('The new outfit\'s materials could not be got ready ahead of time.', error); }
    outfitCover.style.display = 'none';
    frozen = false;
  };
  const changeOutfit = async (): Promise<void> => {
    if (outfitChanging) { outfitAgain = true; return; }
    outfitChanging = true;
    try {
      do { outfitAgain = false; await swapBody(); } while (outfitAgain);
    } catch (error) {
      // (if anything went wrong part-way, the game starts again cleanly instead: she is never left half changed)
      console.error('The outfit could not be changed while playing; starting again with it.', error);
      restart();
    } finally { outfitChanging = false; }
  };

  const hud = new Hud(uiHost, controls, {
    debug,
    onDebugChange(on) {
      // SHOWN OR HIDDEN AT ONCE (Joshua, 2026-11-21: "It's just a visual toggle"): it used to restart the whole game,
      // which crashed on his iPhone. Remembered for next time; the readout is filled from the next half second.
      try { localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); } catch { /* cannot remember it: nothing to do */ }
      debug = on;
      hud.setDebug(on);
    },
    graphics,
    bellyText,
    // THE TIME LAPSE: pregnant, from week 12 at a day a second (a tap again stops it where it is)
    onTimeLapse() {
      if (plan.lapseWeek !== null) { plan.lapseWeek = null; saveSetting('belly', graphics.belly); hud.showBelly(graphics.belly ?? plan.start, null); return; }
      graphics.pregnant = 'on';
      saveSetting('pregnant', 'on');
      plan.startLapse();
    },
    onGraphicsChange(key, value) {
      graphics[key] = value;
      saveSetting(key, value);
      // (her pregnancy and belly take hold at once; moving the belly by hand stops the time lapse)
      if (key === 'pregnant' || key === 'belly' || key === 'bellyUnlocked') {
        if (key === 'belly') plan.lapseWeek = null;
        applyPregnancy();
        hud.showBelly(graphics.belly ?? plan.start, null);
        return;
      }
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
      else if (key === 'skinShine') heroine.setSkinShine?.(skinOilyOf(graphics.skinShine));
      else if (key === 'bodyClock') vitals.gutHoursPerSecond = graphics.bodyClock / 3600;
      else if (key === 'landscaping') island?.setLandscaping(graphics.landscaping); // (live; nothing on the town map)
      // (the first-person eye's place is read every frame: nothing more to do. They used to fall through to a restart.)
      else if (key === 'eyeForward' || key === 'eyeHigher') { /* live */ }
      // (her outfit, and the choices that make her a different body of the same kind, change while the game runs)
      else if (OUTFIT_CHANGE_KEYS.includes(key)) void changeOutfit();
      else restart();
    },
    onToggleView: toggleView,
    onCameraStyle: () => {
      if (aimedByHand()) {
        // (aimed by hand: its own few styles)
        manualStyle = MANUAL_CAMERA_STYLES[(MANUAL_CAMERA_STYLES.indexOf(manualStyle) + 1) % MANUAL_CAMERA_STYLES.length];
        try { localStorage.setItem(MANUAL_CAMERA_STYLE_KEY, manualStyle); } catch { /* (kept for this visit only) */ }
      } else {
        cameraStyle = CAMERA_STYLES[(CAMERA_STYLES.indexOf(cameraStyle) + 1) % CAMERA_STYLES.length];
        try { localStorage.setItem(CAMERA_STYLE_KEY, cameraStyle); } catch { /* (kept for this visit only) */ }
      }
      applyView();
    },
    onDomeDebug: domeDebug,
    onIntake: intake,
    onBathroom: () => { if (bathroomLeft <= 0) intake('bathroom'); },
    // THE PROMPT: the table's PUT DOWN / PICK UP when she is near it, else a bar's GRAB / LET GO (see promptFor)
    onPrompt: (which) => {
      if (promptIs === 'table') useTable(which);
      else if (promptIs === 'grab') grabBar(which);
      else if (promptIs === 'door') useDoor(which);
    },
    // RELOAD: at the table, the table's reload (it refills her pouches too); anywhere else, from her belt
    onReload: () => {
      if (tableUse.canUse(motion.x, motion.z) && tableUse.needsReload) useTable('reload');
      else if (!busyNow() && !tableAfterDraw && !grabAfterHolster && !holsterUse.busy) beltReload.start();
    },
    // AUTO / MANUAL: her aim, fire and reload (the same as the choice in Settings, and remembered)
    onAimMode: () => {
      graphics.autoFire = graphics.autoFire === 'on' ? 'off' : 'on';
      saveSetting('autoFire', graphics.autoFire);
      applyView();
    },
    onHolster: (which) => {
      if (busyNow() || tableAfterDraw || grabAfterHolster || beltReload.busy || holsterUse.busy) return;
      // (on all fours: ONE gun at most, the other hand stays on the ground; drawn only while she is still)
      if (stance === 'down' && pregnantNow()) {
        const h = heroine.hands, held = (['left', 'right'] as const).filter((hand) => h?.hasGun(hand));
        if (held.length > 0) { holsterUse.start(held.length === 2 ? 'both' : held[0]); return; }
        if (pace.speed > 0.05 || !heroine.stanceInfo?.().settled) return;
        const hand = which === 'both' ? (holsterUse.holstered.right ? 'right' : 'left') : which;
        if (holsterUse.holstered[hand]) holsterUse.start(hand);
        return;
      }
      holsterUse.start(which);
    },
    onCrouch: () => { stance = stance === 'crouch' ? 'stand' : 'crouch'; },
    onProne: () => { stance = stance === 'down' ? 'stand' : 'down'; },
  });
  /** Take hold of the bar she is near (with both hands, or the one picked with L or R), or let go of the one she holds. */
  function grabBar(which: 'both' | Hand = 'both'): void {
    {
      if (grabUse.holding) { grabUse.letGo(); return; }
      if (busyNow() || holsterUse.busy || beltReload.busy) return;
      const bar = grabUse.nearest(motion.x, motion.z).bar;
      // (the hands that hold the bar must be empty: their guns go into her holsters, on the way, then she goes to the
      //  bar; Joshua, 2026-11-18: hands free "without having to go all the way to the table". With no holsters, onto
      //  the table first as before.)
      grabWhich = which;
      const full = bars.hands(bar, which).filter((hand) => heroine.hands?.hasGun(hand));
      if (full.length > 0 && holsterUse.hasHolsters) { holsterUse.start(full.length === 2 ? 'both' : full[0]); grabAfterHolster = bar; }
      else if (full.length > 0) { tableUse.start(full.length === 2 ? 'both' : full[0]); grabAfterTable = bar; }
      else grabUse.start(bar, which);
    }
  }
  /** The hands picked for the bar she is about to take hold of (kept while her guns go away first). */
  let grabWhich: 'both' | Hand = 'both';
  /** What THE PROMPT is for this frame: the table, a bar, the door, or nothing. */
  let promptIs: 'table' | 'grab' | 'door' | null = null;
  /** She is side-stepping this frame (crab steps: her stamina pays a little more per metre). */
  let sideStepping = false;
  /** Open the door she is near (the hand at the handle's side, or the one picked), or let go of it. */
  function useDoor(which: 'both' | Hand): void {
    if (doorUse.holding) { doorUse.letGo(); return; }
    if (busyNow() || holsterUse.busy || beltReload.busy || doorUse.active) return;
    const hand = doorUse.handTo(motion.x, motion.z, which);
    // (that hand must be empty: its gun goes into its holster first, then she goes to the door)
    if (heroine.hands?.hasGun(hand) && holsterUse.hasHolsters) { holsterUse.start(hand); doorAfterHolster = hand; }
    else if (!heroine.hands?.hasGun(hand)) doorUse.start(motion.x, motion.z, hand);
  }

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
    (window as unknown as Record<string, unknown>).gdm = { renderer, scene, dome, city, heroine, motion, turn, rig, controls, targets, pace, vitals, walls, table, tableUse, bars, grabUse, holsterUse, beltReload, door, doorUse, island, plan, hud, intake,
      // (for the test scripts: change her outfit as Settings does, and whether a change is running)
      changeOutfit: (key: string) => { graphics.outfit = key; saveSetting('outfit', key); return changeOutfit(); },
      outfitChanging: () => outfitChanging };
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
  /** The small canvas the portrait strip's picture is copied down into (see `snapshot`). */
  const snapshotCanvas = document.createElement('canvas');
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
      // SMALL (the iPhone audit, 2026-11-20): the strip shows it a few hundred pixels wide, but the whole screen was
      // encoded at its full size (about 6 MB of picture at once); now it is copied down to SNAPSHOT_WIDTH first, into
      // one small canvas kept for it. None while she is changing outfit (nothing of her to show).
      snapshot: () => {
        if (frozen) return null;
        renderer.render(scene, rig.camera);
        const from = renderer.domElement, k = Math.min(1, SNAPSHOT_WIDTH / from.width);
        snapshotCanvas.width = Math.max(1, Math.round(from.width * k));
        snapshotCanvas.height = Math.max(1, Math.round(from.height * k));
        snapshotCanvas.getContext('2d')?.drawImage(from, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
        return snapshotCanvas.toDataURL('image/jpeg', 0.7);
      },
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
    // CHANGING HER OUTFIT (`changeOutfit`): frozen as when paused; nothing is drawn, so the last picture stays up.
    if (frozen) {
      last = now;
      wasPaused = true;
      controls.takeLookX(); controls.takeLookY(); controls.takeZoom(); controls.takeClicks();
      return;
    }
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
    const lookX = controls.takeLookX() + stickLookX, lookY = controls.takeLookY() - stickLookY;
    rig.applyLook(lookX, lookY); // stick up looks up
    // (the player turned the view this frame: a look of hers laid over it gives way: see the belly glance below)
    const looked = lookX !== 0 || lookY !== 0;
    const zoom = controls.takeZoom();
    if (rig.mode === 'third') rig.applyZoom(zoom);

    // 2. Move the heroine.
    // She walks freely in every view (Joshua, 2026-11-17: "Remove the fixed moving ring, and let it be free
    // movement"). How far the stick is pushed sets her pace; where it points steers her.
    // (holding the door's handle she goes at a walk at most: src/world/door.ts)
    const push = Math.min(doorUse.holding ? DOOR.walkPush : 1, Math.hypot(controls.moveX, controls.moveY));
    // (turning right round, the stick pointing more than about 120 degrees from where it pointed: she loses a pace)
    if (push > PACE_TUNING.ringsFrom[0]) {
      const x = controls.moveX / push, y = controls.moveY / push;
      if (x * lastMoveX + y * lastMoveY < -0.5) pace.turnedBack();
      lastMoveX = x; lastMoveY = y;
    }
    // HOW FAR ALONG SHE IS, by her belly now: 0 at her first visible belly, 1 at full term (PREGNANCY_ARC).
    // (not pregnant: her belly is only her shape, and does not slow her)
    const carrying = pregnantNow() ? Math.max(0, Math.min(1, ((heroine.bellyNow?.() ?? 100) - PREGNANCY_ARC.firstBump) / (PREGNANCY_ARC.fullTermBump - PREGNANCY_ARC.firstBump))) : 0;
    // THE WEAPON TABLE'S ACTION, while one runs: it walks her to the table and turns her to it, and the stick waits.
    pace.carrying = carrying;
    tableAsk.yaw = turn.base;
    tableUse.update(dt, motion.x, motion.z, tableAsk);
    grabAsk.yaw = turn.base;
    grabUse.update(dt, motion.x, motion.z, grabAsk);
    doorAsk.yaw = turn.base;
    doorUse.update(dt, motion.x, motion.z, doorAsk);
    if (doorAfterHolster && !holsterUse.busy) { doorUse.start(motion.x, motion.z, doorAfterHolster); doorAfterHolster = null; }
    holsterUse.update(dt, holsterAsk);
    beltReload.update(dt, beltAsk);
    // (the table's reload has ended: her pouches are full again, the empties swapped for full clips)
    if (tableReloading && tableUse.action !== 'reload') { const gear = gearNow(); gear?.setClips(gear.pouches); }
    tableReloading = tableUse.action === 'reload';
    // (her guns are drawn: on to the table; her guns are away: on to the bar)
    if (tableAfterDraw && !holsterUse.busy) { const which = tableAfterDraw; tableAfterDraw = null; tableUse.start(which); }
    if (grabAfterHolster && !holsterUse.busy) { grabUse.start(grabAfterHolster, grabWhich); grabAfterHolster = null; }
    // (her guns are down: on to the bar)
    if (grabAfterTable && !tableUse.busy) { grabUse.start(grabAfterTable, grabWhich); grabAfterTable = null; }
    // HER STANCE: what she is asked to be, and what it allows her (input/pace.ts `levelMost`, `speedMost`)
    {
      // (busy at the table, a bar or a door: she stands up for it)
      if (busyNow() && stance !== 'stand') stance = 'stand';
      heroine.setStance?.(stanceAsked());
      const st = heroine.stanceInfo?.();
      const c = Math.max(0, Math.min(1, pace.carrying));
      const pushed = controls.moveX !== 0 || controls.moveY !== 0;
      pace.levelMost = 4; pace.speedMost = Infinity; stanceNoAim = false;
      if (st && !(st.asked === 'stand' && st.settled)) {
        pace.levelMost = 1;   // (crouched or down: a walk's pace at most)
        if (st.down > 0 && !st.settled) { pace.speedMost = 0; stanceNoAim = true; }   // (getting down or up: still)
        else if (st.stance === 'crouch' || st.asked === 'crouch' || st.asked === 'stand') pace.speedMost = STANCE.crouchSpeed * (1 - 0.25 * c);
        else if (st.stance === 'prone') { pace.speedMost = STANCE.proneSpeed; stanceNoAim = pushed || pace.speed > 0.05; }
        else {
          // ON ALL FOURS: her guns away to move (a gun in her hand is put away first, then she goes: a short wait)
          const h = heroine.hands, holding = !!h && (h.hasGun('left') || h.hasGun('right'));
          if (holding && pushed && !holsterUse.busy && !beltReload.busy) holsterUse.holsterAll();
          pace.speedMost = holding || holsterUse.busy ? 0 : STANCE.foursSpeed * (1 - 0.2 * c);
          stanceNoAim = pushed || pace.speed > 0.05;
        }
      }
      // (going down on all fours: both guns are put away first, on the way down)
      if (st && st.asked === 'fours' && st.down < 1 && !holsterUse.busy && !beltReload.busy) holsterUse.holsterAll();
      hud.setStance(stanceAsked(), pregnantNow());
      // (the camera comes down with her)
      rig.lower = !st ? 0 : st.stance === 'prone' || st.asked === 'prone' ? 1.25 * Math.max(st.down, 0.35) : st.stance === 'fours' || st.asked === 'fours' ? 0.95 * Math.max(st.down, 0.4) : 0.45 * st.crouch;
    }
    // WINDED (Joshua, 2026-11-20: "she bends her torso forward about 35 degrees, bends her knees a little bit, and places
    // both hands... just above her knees... after that, she will stand back up to normal and ready to move again"): all
    // through her pace's winded hold (input/pace.ts, 10 s) she is bent over, eased in over WINDED_IN and back up over the
    // hold's last WINDED_OUT; no aiming or firing while bent over (her hands are on her knees).
    {
      const hold = PACE_TUNING.windedHoldSeconds, left = pace.holdLeft;
      windedWeight = left > 0 ? Math.min(1, (hold - left) / WINDED_IN) * Math.min(1, left / WINDED_OUT) : 0;
      heroine.setWinded?.(windedWeight);
      if (left > 0) stanceNoAim = true;
    }
    // HER HANDS TO HER BELLY (heroine/fast/bellyTouch.ts): holding it up from a run (past 30 weeks); and whether she may
    // start a look down at a kick (not while firing or just after, not running)
    {
      supporting = supporting ? pace.level > SUPPORT_OFF_LEVEL : pace.level >= SUPPORT_ON_LEVEL;
      const week = pregnantNow() ? plan.weekFor(heroine.bellyNow?.() ?? graphics.belly ?? plan.start) : 0;
      heroine.setBellySupport?.(supporting && pregnantNow() && week >= SUPPORT_FROM_WEEK);
      heroine.setBellyLookAllowed?.(!controls.fireHeld && sinceFire > LOOK_AFTER_FIRE && pace.level < SUPPORT_ON_LEVEL);
    }
    // (whichever is running walks her and turns her)
    const ask = tableUse.busy ? tableAsk : grabUse.busy ? grabAsk : doorAsk;
    sideStepping = false;
    if (busyNow()) {
      heroine.setSideSteps?.(null);
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
      // AIMED BY HAND (first person, or MANUAL in third person), "up" is the way the player aims (rig.yaw). Over the
      // shoulder the camera is locked to her head, so taking "up" from the camera made a loop: walking back or
      // sideways her body turned to the way she went, her head was pulled round, the camera with it, "back" changed
      // and her body turned again: the camera spun (Joshua, 2026-11-18: 670 degrees in 9 s backwards, 2454 sideways).
      // SIDE STEPS (third person MANUAL at a walk, or holding a door: her facing held): the stick snaps to the nearest
      // of FOUR moves, ahead, back, left, right (Joshua: "only those 4 directions"), and left and right are crab steps
      const facingHeld = (turnInput.hold !== undefined && turnInput.hold !== null) || walkSides();
      let moveX = controls.moveX, moveY = controls.moveY;
      if (facingHeld && push > 0) {
        // (the four moves, with a little room each way: the stick stays on the move it is on until it is clearly
        //  nearer another, GAIT_KEEP, so a stick held near a diagonal does not flick between two)
        const sideways = gait === 'left' || gait === 'right' ? Math.abs(moveX) * GAIT_KEEP >= Math.abs(moveY)
          : gait === 'ahead' || gait === 'back' ? Math.abs(moveX) > Math.abs(moveY) * GAIT_KEEP
          : Math.abs(moveX) > Math.abs(moveY);
        if (sideways) moveY = 0; else moveX = 0;
        moveX = Math.sign(moveX) * (moveX !== 0 ? push : 0);
        moveY = Math.sign(moveY) * (moveY !== 0 ? push : 0);
      }
      // HOLDING THE DOOR SHE IS ON HER RAIL (Joshua, 2026-11-20, his drawing; src/world/door.ts `keepOnRail`): only
      // ahead (toward the door) and back move her, along the rail; the stick pushed sideways does nothing
      if (doorUse.holding) moveX = 0;
      sideStepping = facingHeld && moveX !== 0;
      let speed = pace.speed;
      // (backing up: no faster than her jog)
      if (facingHeld && moveY < 0) speed = Math.min(speed, pace.paceSpeed(1));
      if (sideStepping) {
        // (a crab step's top speed: a brisk walk, slower the further along she is)
        const c = Math.max(0, Math.min(1, pace.carrying));
        speed = Math.min(speed, SIDE_WALK_MOST + (SIDE_WALK_MOST_FULL_TERM - SIDE_WALK_MOST) * c);
      }
      // SQUARED UP BETWEEN MOVES (Joshua, 2026-11-20: "right before it say sidesteps to forward, it resets really
      // quickly (maybe 0.3s or variable depending on speed) to both feet side by side then plays the next one... and
      // as soon as you release the stick or it centers, it also puts the feet in the normal standing state"): her move
      // now (standing; ahead, back, left, right with her facing held; or just going, her body turned the way she goes);
      // when it changes from a move to anything else, her feet are set side by side first (footGround.ts 11), over
      // GAIT_RESET seconds at a walk, less the faster she was going, and she waits for them; then the new move starts.
      const gaitNow: Gait = push <= 0 || (moveX === 0 && moveY === 0) ? 'stand'
        : facingHeld ? (moveX > 0 ? 'right' : moveX < 0 ? 'left' : moveY > 0 ? 'ahead' : 'back') : 'go';
      if (gaitNow !== gait) {
        if (gait !== 'stand' && gaitResetLeft <= 0) {
          gaitResetLeft = Math.max(GAIT_RESET_LEAST, GAIT_RESET * Math.min(1, GAIT_RESET_SPEED / Math.max(0.01, motion.speed)));
          heroine.squareFeet?.(gaitResetLeft);
        }
        gait = gaitNow;
      }
      if (gaitResetLeft > 0) {
        gaitResetLeft -= dt;
        moveX = 0; moveY = 0;
        sideStepping = false;
      }
      // her feet: crab steps for left and right (fastHeroine.ts); a crab walk only (the walk's pace, 1)
      heroine.setSideSteps?.(facingHeld ? 1 : null);
      // (on her rail "ahead" is along it, toward the door, whichever way the camera looks)
      motion.update(dt, moveX, moveY, doorUse.holding ? doorUse.railYaw() : rig.mode === 'first' || aimedByHand() ? rig.yaw : rig.viewYaw, speed);
    }
    // THE DOOR: holding it, she is kept on her rail (the handle's pull moving her along it where the door cannot go,
    // the panel stopping her on it); otherwise the door is solid (src/world/door.ts)
    const doorRadius = doorBodyRadius(heroine.hands?.bellyAhead() ?? 0, doorUse.holding);
    if (doorUse.holding) {
      const went = doorUse.keepOnRail(motion, doorAsk.pull, doorRadius);
      // (her real pace, for her walk: only what she went along the rail)
      motion.speed = dt > 0 ? Math.min(motion.speed, went / dt) : 0;
    } else if (door.keepOut(motion.x, motion.z, doorRadius, doorOut)) { motion.x = doorOut.x; motion.z = doorOut.z; }
    // THE BUTTONS THAT SHOW ONLY WHEN NEEDED (Joshua, 2026-11-18): the prompt near the table or a bar (holding a bar,
    // LET GO; else the table if she is near it; else the bar), HOLSTER / DRAW with a gun in a hand or a holster,
    // RELOAD at the table or with a clip on her belt for a gun that is not full. Hidden while something else runs.
    const holstering = holsterUse.busy || beltReload.busy || tableAfterDraw !== null || grabAfterHolster !== null || doorAfterHolster !== null || doorUse.active;
    const atTable = tableUse.canUse(motion.x, motion.z) && !grabUse.busy && !holstering;
    const grabWord = tableUse.busy || grabAfterTable || holstering ? null : grabUse.label(motion.x, motion.z);
    // (the door: LET GO while she holds it; OPEN DOOR near a handle, when nothing else is running)
    const doorWord = doorUse.holding ? 'LET GO' : busyNow() || holstering || grabUse.busy ? null : doorUse.label(motion.x, motion.z);
    promptIs = doorUse.holding ? 'door' : grabUse.holding && grabWord ? 'grab' : atTable ? 'table' : grabWord ? 'grab' : doorWord ? 'door' : null;
    hud.setPrompt(promptIs === 'table' ? tableUse.label() : promptIs === 'grab' ? grabWord : promptIs === 'door' ? doorWord : null);
    hud.setHolster(busyNow() || holstering ? null : holsterUse.label());
    hud.setReload((atTable && tableUse.needsReload) || (!busyNow() && !holstering && beltReload.canStart));

    // 2b. WHICH WAY EACH PART OF HER FACES (src/input/bodyTurn.ts, Joshua's five bands of 2026-11-17: her head turns
    // up to 90 degrees from body North, her shoulders 80 % of that, her belly 60 %, her upper legs 40 %, her lower
    // legs and feet 20 %; past 90 body North is pulled round; when the looking stops it comes round to match).
    //   first person  she looks where the camera looks;
    //   third person  she looks at the sky target most in front of her shoulders (her auto-aim).
    // FIRST PERSON, STANDING STILL (Joshua, 2026-11-20: "remove all the delays, and have the body follow like it does in
    // 3rd person and based on our angle system... as soon as you need to go, there is minimal adjustments"): the view is
    // her head, and her body follows it as in third person (src/input/bodyTurn.ts: past 90 degrees body North is pulled
    // round, and once the look stops it comes round to match, each band a moment behind the one above). Nothing settles
    // the view back: her body comes to where she looks, so she already faces the way she will go.
    // (Before, v0.2.108-112: her body stayed put, and 1 s after the look stopped the view settled back to it over 1.5 s.)
    turnInput.view = rig.mode;
    turnInput.move = motion.heading;
    // (aimed by hand: she looks where the camera looks, in either view)
    // (...except RUNNING in third person MANUAL, Joshua 2026-11-19: she looks the way she runs, so her body turns right
    //  round when the stick sends her back toward the camera. Looking where the camera looks, her head could turn only
    //  90 degrees from her body, and her body stopped side-on.)
    const runningFree = rig.mode === 'third' && aimedByHand() && !walkSides() && (controls.moveX !== 0 || controls.moveY !== 0) && !busyNow();
    if (aimedByHand() && !runningFree) turnInput.look = rig.yaw;
    else if (runningFree) turnInput.look = null;
    else {
      // ON HER OWN she picks a target. With a camera that follows her (first person, over the shoulder) she picks the
      // one nearest where that camera already looks, so she keeps to it: picked by where her body faces, walking
      // turned her body, she picked another, the camera swung to it, "forward" changed and she turned again: the
      // camera spun round (Joshua, 2026-11-18).
      const cameraFollows = rig.mode === 'first' || rig.style === 'shoulder';
      aimTarget = targets.pick(motion.x, motion.z, cameraFollows ? rig.viewYaw : turn.shoulders);
      const at = targets.position(aimTarget);
      turnInput.look = Math.atan2(at.x - motion.x, at.z - motion.z);
    }
    // (while the table's action runs, she looks at the table)
    // (FIRST PERSON, holding on or working at something (Joshua, 2026-11-20: "When holding on to stuff like the bar or
    //  railing, I can only move the camera up and down, not left to right"): her BODY keeps facing it (`hold`), and her
    //  head looks where the player looks, the view held within 90 degrees each side of it (busyView below))
    const busyFace = rig.mode === 'first' && ask.look !== null ? ask.look : null;
    if (busyFace !== null) turnInput.look = rig.yaw;
    else if (ask.look !== null) turnInput.look = ask.look;
    // (holding the door's handle she keeps facing the door, whichever way she steps: bodyTurn.ts `hold`)
    // (MANUAL in third person, Joshua 2026-11-18: she keeps facing the way the camera looks, so the stick's forward and
    //  back go straight ahead and behind, and left and right are side steps. Her body used to turn to the way she
    //  walked: backing up she turned right round and faced the camera, south with the camera looking north)
    //  Only AT A WALK (Joshua, 2026-11-18): faster, her body turns to run the way the stick sends her.
    turnInput.hold = doorUse.faceYaw() ?? busyFace ?? (walkSides() ? rig.yaw : null);
    // (holding on in first person: her head alone turns, 90 degrees each way, the rest of her square: bodyTurn.ts `grip`)
    turnInput.grip = busyFace !== null;
    turn.step(dt, turnInput);
    // WHERE SHE LOOKS, UP AND DOWN, WHILE SHE DOES SOMETHING (Joshua, 2026-11-18: her head leads): at what she is
    // going to (the gun stands, the bar), looking down more as she comes close; once her hands are at work, at her
    // hands. Her head tips that way in third person, and in first person the view does.
    actionPitchWant = 0;
    // (holstering, drawing or reloading on the go: a glance down at the holster or the gun, then back)
    const gearLook = beltAsk.lookAt ?? holsterAsk.lookAt;
    if (!busyNow() && gearLook) {
      heroine.eye(eyeAt);
      actionPitchWant = Math.max(-FIRST_PERSON_BUSY_PITCH_MOST, Math.atan2(gearLook.y - eyeAt.y, Math.max(0.05, Math.hypot(gearLook.x - eyeAt.x, gearLook.z - eyeAt.z))));
    }
    if (busyNow()) {
      heroine.eye(eyeAt);
      const lookAt = ask.lookAt;
      actionPitchWant = lookAt ? Math.atan2(lookAt.y - eyeAt.y, Math.max(0.05, Math.hypot(lookAt.x - eyeAt.x, lookAt.z - eyeAt.z))) : FIRST_PERSON_WALK_PITCH;
      const hands = heroine.hands;
      const working = hands ? Math.max(hands.reached('left'), hands.reached('right')) : 0;
      if (hands && working > 0) {
        hands.handBone('left').getWorldPosition(handsAt);
        handsAt.add(hands.handBone('right').getWorldPosition(handOne)).multiplyScalar(0.5);
        // (how far ahead the hands are along the way she looks; behind her eye counts as a little ahead, looking down)
        const ahead = Math.max(0.02, (handsAt.x - eyeAt.x) * Math.sin(turn.head) + (handsAt.z - eyeAt.z) * Math.cos(turn.head));
        const atHands = Math.max(-FIRST_PERSON_BUSY_PITCH_MOST, Math.atan2(handsAt.y - eyeAt.y, ahead));
        actionPitchWant += (atHands - actionPitchWant) * Math.min(1, working * 1.5);
      }
    }
    actionPitch += (actionPitchWant - actionPitch) * (1 - Math.exp(-dt / ACTION_PITCH_SECONDS));
    // (first person her head looks where the player looks, up and down too: the camera is on her head, so the view is
    //  what her neck can reach: fastHeroine.ts `eyeView`)
    //  (and in third person's SIDE views, aimed by hand and doing nothing else: dragging up and down tips her head, as
    //  first person does; the side camera itself stays square to her: cameraRig.ts applyLook)
    const sideView = rig.mode === 'third' && (rig.style === 'sideLeft' || rig.style === 'sideRight') && aimedByHand() && !busyNow();
    turn.headPitch = rig.mode === 'third' && !sideView ? actionPitch : rig.pitch;
    heroine.setEyeOffset?.(graphics.eyeForward / 100, graphics.eyeHigher / 100);
    // (the key light, its shadow box and the patch of ground that shows her real shadow all go with her)
    const feetY = groundUnder(motion.x, motion.z); // (the island's ground under her; 0 on the town)
    keyLight.position.set(motion.x - 4, feetY + 10, motion.z + 6);
    keyLight.target.position.set(motion.x, feetY, motion.z);
    shadowFloor.position.x = motion.x;
    shadowFloor.position.z = motion.z;
    heroine.setPosition(motion.x, motion.z, feetY);
    // HOW DEEP THE WATER IS AT HER FEET (her skin gets wet up to there: heroine/fast/skinShine.ts): a river or lake's
    // surface, or the sea's, above the ground under her
    if (island) {
      const ground = island.groundAt(motion.x, motion.z);
      const surface = Math.max(island.waterAt(motion.x, motion.z) ?? -Infinity, island.seaLevel);
      heroine.setWaterDepth?.(Number.isFinite(ground) ? surface - ground : 0);
    }
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
    // (and FIRST PERSON ON HER OWN: the view follows her head to the target she aims at, with the same override)
    const followTarget = rig.mode === 'first' && !busyNow() && !aimedByHand() && turn.aimed;
    if (rig.mode === 'first' && (busyNow() || followTarget)) {
      if (!busyView.on) {
        // (the action has just begun: the view follows from where it is, with no look of the player's added yet)
        busyView.on = true;
        busyView.yaw = rig.yaw; busyView.pitch = rig.pitch;
        busyView.lookYaw = 0; busyView.lookPitch = 0; busyView.returnSeconds = BUSY_LOOK_RETURN_SECONDS; busyView.idle = BUSY_LOOK_WAIT + busyView.returnSeconds;
        busyView.fromYaw = 0; busyView.fromPitch = 0;
      } else {
        // (what the player dragged since last frame: rig.applyLook moved the view from where it was set)
        const draggedYaw = Math.atan2(Math.sin(rig.yaw - busyView.setYaw), Math.cos(rig.yaw - busyView.setYaw));
        const draggedPitch = rig.pitch - busyView.setPitch;
        busyView.lookYaw += draggedYaw;
        busyView.lookPitch += draggedPitch;
        // AN OVERRIDE, NOT A NEW PLACE (Joshua, 2026-11-18): the moment the player lets go of the camera, the view
        // starts back to what she is looking at, and is there BUSY_LOOK_RETURN_SECONDS later (eased at both ends)
        if (Math.abs(draggedYaw) > 1e-5 || Math.abs(draggedPitch) > 1e-5) {
          busyView.idle = 0;
          busyView.dragging = true;
        } else if (busyView.idle < BUSY_LOOK_WAIT + busyView.returnSeconds) {
          // (Joshua, 2026-11-20: "add a 1s delay after you have released the camera before it then goes back")
          busyView.idle = Math.min(BUSY_LOOK_WAIT + busyView.returnSeconds, busyView.idle + dt);
          const x = Math.max(0, busyView.idle - BUSY_LOOK_WAIT) / busyView.returnSeconds, left = 1 - x * x * (3 - 2 * x);
          busyView.lookYaw = busyView.fromYaw * left;
          busyView.lookPitch = busyView.fromPitch * left;
        }
      }
      const ease = 1 - Math.exp(-dt / FIRST_PERSON_FOLLOW_SECONDS);
      // (the view follows what she is doing: its way, or where her head turns to it; first person her head follows the
      //  player's look, so the view follows the thing itself)
      const busyWay = ask.look ?? turn.head;
      busyView.yaw += Math.atan2(Math.sin(busyWay - busyView.yaw), Math.cos(busyWay - busyView.yaw)) * ease;
      // (tipped down to HER HANDS, between the two: when she leans over the table her head is ahead of them, and a
      //  fixed tip passed right over them. Never quite straight down.)
      // (WALKING OVER she looks nearly level, as in third person; the view tips down to her hands only as they start to
      //  reach for something, as far as they have come: Joshua, 2026-11-18)
      // (the view looks where she looks: see actionPitchWant above)
      let wantPitch = actionPitchWant;
      if (followTarget) {
        heroine.eye(eyeAt);
        const at = targets.position(aimTarget);
        wantPitch = Math.atan2(at.y - eyeAt.y, Math.max(1, Math.hypot(at.x - eyeAt.x, at.z - eyeAt.z)));
      }
      busyView.pitch += (wantPitch - busyView.pitch) * ease;
      // (the player's look is limited while she holds on to something fixed; following a target it is not)
      const side = busyNow() ? BUSY_LOOK_SIDE : Math.PI;
      busyView.lookYaw = Math.max(-side, Math.min(side, busyView.lookYaw));
      // (up and down: the view's own pitch stays within what HER NECK REACHES from her torso's line, as everywhere in
      //  first person: leaning on a bar she looks further down than standing. Joshua, 2026-11-20: holding the railing
      //  "it appears to be not looking down far enough and when I try to look further, it stops me"; it was held to
      //  70 degrees each way of level)
      const reach = heroine.headPitchRange?.();
      const down = reach ? reach[0] : -1.5, up = reach ? reach[1] : 1.5;
      busyView.lookPitch = Math.max(down - busyView.pitch, Math.min(up - busyView.pitch, busyView.lookPitch));
      // (the look the return starts from is where the view really is: within the limits, not as far as it was dragged)
      if (busyView.dragging) {
        busyView.fromYaw = busyView.lookYaw; busyView.fromPitch = busyView.lookPitch; busyView.dragging = false;
        // (THE FURTHER IT WAS TURNED, THE LONGER IT TAKES BACK, so it never whips round: Joshua, 2026-11-18)
        const turned = Math.hypot(busyView.lookYaw, busyView.lookPitch);
        busyView.returnSeconds = Math.min(BUSY_LOOK_RETURN_MOST, BUSY_LOOK_RETURN_SECONDS * Math.max(1, turned / BUSY_LOOK_RETURN_PER));
      }
      rig.yaw = busyView.setYaw = busyView.yaw + busyView.lookYaw;
      rig.pitch = busyView.setPitch = busyView.pitch + busyView.lookPitch;
    } else busyView.on = false;
    // FIRST PERSON, HOLSTERING OR DRAWING ON THE GO (Joshua, 2026-11-18: her head leads): the view glances down at the
    // holster and comes back, on top of wherever the player looks (taken off again before the next frame's look, so
    // the player's own aim is never moved).
    {
      const base = busyView.on ? rig.pitch : rig.pitch - fpGlance;
      const glanceTo = rig.mode === 'first' && !busyNow() && (beltAsk.lookAt || holsterAsk.lookAt) ? Math.min(0, actionPitchWant - base) : 0;
      fpGlance += (glanceTo - fpGlance) * (1 - Math.exp(-dt / ACTION_PITCH_SECONDS));
      if (Math.abs(fpGlance) < 1e-4 && glanceTo === 0) fpGlance = 0;
      rig.pitch = base + fpGlance;
      // (following a target, the view's own look is worked out from the last frame's: the glance is not a drag)
      if (busyView.on) busyView.setPitch = rig.pitch;
    }
    // HER OWN LOOKS GIVE WAY TO THE PLAYER (first person is her head now: fastHeroine.ts `eyeView`): firing stops a look
    // down at a kick (eased back); turning the view in first person frees her head (a look at a kick, or bowed over
    // winded) and it goes on from where the view is, so nothing jumps
    {
      const w = heroine.bellyLook?.(lookSpot) ?? 0;
      if (w > 0 && controls.fireHeld) heroine.stopBellyLook?.();
      if (looked && rig.mode === 'first' && (w > 0 || windedWeight > 0)) {
        const d = rig.lookDirection;
        rig.pitch = Math.atan2(d.y, d.x * Math.sin(rig.yaw) + d.z * Math.cos(rig.yaw));
        heroine.freeLook?.();
      }
    }
    // THE OVER-THE-SHOULDER CAMERA IS LOCKED TO HER HEAD (Joshua, 2026-11-18): it sits behind her right shoulder and
    // looks where her head looks, turning and tipping with it. Up and down: where the player aims (aimed by hand),
    // where she is looking while she does something, or at the target she is aimed at.
    heroine.eye(rig.head.at);
    // (aimed by hand, the shoulder camera looks where the player aims, from her head: the middle of the screen is the
    //  aim, and it turns only when the player turns it. Walking backwards her body turns to the way she goes and her
    //  head with it; a camera that followed her head swung round with it. On her own, it follows her head.)
    rig.head.yaw = aimedByHand() && !busyNow() ? rig.yaw : turn.head;
    // (ON HER OWN, WHATEVER HER HEAD IS DOING, THE CAMERA DOES TOO -- Joshua, 2026-11-19: "following her head's
    //  direction, before resuming back at the target". At the table, a bar or a door, and ALSO holstering, drawing
    //  or reloading from her belt on the go, it looks down with her head; then it eases back up to the target over
    //  the same time her head takes, never jumping. `headDoing` is how much it is following her head: 0 to 1.)
    const doing = busyNow() || (!!(beltAsk.lookAt ?? holsterAsk.lookAt) && !aimedByHand());
    headDoing += ((doing ? 1 : 0) - headDoing) * (1 - Math.exp(-dt / ACTION_PITCH_SECONDS));
    if (aimedByHand() && !busyNow()) rig.head.pitch = rig.pitch;
    else {
      let free: number;
      if (rig.mode === 'third' && turn.aimed) {
        const at = targets.position(aimTarget);
        free = Math.atan2(at.y - rig.head.at.y, Math.max(1, Math.hypot(at.x - rig.head.at.x, at.z - rig.head.at.z)));
      } else free = rig.head.pitch + (SHOULDER_REST_PITCH - rig.head.pitch) * (1 - Math.exp(-dt / ACTION_PITCH_SECONDS));
      rig.head.pitch = free + (actionPitch - free) * headDoing;
    }
    rig.head.valid = true;
    // AIMED BY HAND, FIRING: over her shoulder while FIRE is held and a moment after, then back to the style chosen
    if (controls.fireHeld) sinceFire = 0; else sinceFire += dt;
    if (rig.mode === 'third' && aimedByHand()) rig.setStyle(sinceFire < MANUAL_AIM_HOLD ? 'shoulder' : manualStyle);
    hud.setCrosshairAway(rig.mode === 'third' && rig.style !== 'shoulder');
    rig.update(dt, heroine);
    // (the island: its tiles follow her, the sea follows the camera)
    island?.update(dt, motion.x, motion.z, rig.camera);

    // 4. Aim. First person: along the line of sight. Third person: auto-aim at a sky target.
    targets.update(info);
    if (busyNow() || stanceNoAim) {
      // (busy at the table or a bar, or crawling: no aiming)
      targets.setAimed(-1);
      heroine.aimAt(null);
    } else if (aimedByHand()) {
      // (aimed by hand, in first person or over her shoulder: at the crosshair, down the camera's line of sight)
      targets.setAimed(-1);
      if (rig.mode === 'third' && rig.style !== 'shoulder') {
        // (aimed by hand but the camera is not behind her, follow or a side view, so not firing: her guns are DOWN,
        //  not aimed (Joshua, 2026-11-20: "Why are the guns always raised and ready to shoot... and missing the
        //  crosshairs?"). FIRE puts the camera over her shoulder with the crosshair, and she aims at it.)
        heroine.aimAt(null);
      } else heroine.aimAt(rig.aimPoint(AIM_RANGE, aim));
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
    if (clicks > 0 && (aimedByHand() || turn.aimed)) burst.pull();
    const autoFiring = !aimedByHand() && turn.aimed;
    // (FIRE is always on screen: in MANUAL it is how she fires; in AUTO, held, she fires at her target too)
    const wantFire = !busyNow() && !stanceNoAim && ((controls.fireHeld && (aimedByHand() || turn.aimed)) || autoFiring);
    let firedNow = false;
    burst.update(dt, wantFire,
      // (a hand fires only with its gun in it and rounds in the gun)
      (hand) => (heroine.hands?.hasGun(hand) ?? true) && tableUse.rounds[hand] > 0 && !holsterUse.handBusy(hand) && !beltReload.handBusy(hand),
      (hand) => {
        heroine.fire(hand);
        tracers.fire(heroine.muzzle(hand, muzzle), aim);
        tableUse.rounds[hand]--;
        firedNow = true;
      });
    // (third person: with both guns empty she goes to the table and reloads on her own)
    // (from her belt if she has clips there, on the go; else at the table)
    if (!aimedByHand() && !busyNow() && !holsterUse.busy && !beltReload.busy && !tableAfterDraw && tableUse.rounds.left === 0 && tableUse.rounds.right === 0) {
      if (beltReload.canStart) beltReload.start(); else useTable('reload');
    }
    hud.setAmmo(heroine.hands?.hasGun('left') === false ? null : tableUse.rounds.left, heroine.hands?.hasGun('right') === false ? null : tableUse.rounds.right, burst.clicked !== null);
    tracers.update(info);

    // 5b. Her vitals: what she just did (how fast she moved, whether she is shooting) moves her heart, her breath,
    // her stamina, her food and her water on; her body and the card along the top show them.
    const shooting = firedNow;
    // (danger frightens her: for now the dome's state, the worst section: hurt up to 0.6, broken through 1. Step 1a's
    //  enemies coming close will add to it.)
    let threat = 0;
    for (const section of dome.sections) threat = Math.max(threat, section.shattered ? 1 : 0.6 * (1 - section.hp / SECTION_MAX_HP));
    // (what she is eating or drinking goes in a little each frame, evenly over its seconds)
    if (eating.seconds > 0) {
      const share = Math.min(1, dt / eating.seconds);
      const food = eating.food * share, water = eating.water * share;
      vitals.consume(food, water);
      eating.food -= food; eating.water -= water; eating.seconds -= dt;
      if (eating.seconds <= 0) { eating.food = 0; eating.water = 0; eating.seconds = 0; }
    }
    // (the bathroom: squatting, then her bladder emptied)
    if (bathroomLeft > 0) { bathroomLeft -= dt; if (bathroomLeft <= 0) vitals.relieve(); }
    vitals.step(dt, { speed: motion.speed * (sideStepping ? SIDE_EFFORT : 1), firing: shooting, threat, carrying });
    const reading = vitals.reading;
    limits = reading;
    heroine.setVitals?.(reading);
    vitalsPanel.show(reading);
    // (the 🚽 button: from her urge, hidden while she is already going)
    hud.setBathroom(bathroomLeft > 0 ? null : reading.bathroomUrge);
    hud.setPace(pace.name, pace.ring);
    // THE TIME LAPSE (Settings -> PREGNANCY): a day a second of play, her belly off her chart, to her delivery week
    if (plan.lapseWeek !== null) {
      const belly = plan.stepLapse(dt);
      graphics.belly = Math.round(belly);
      applyPregnancy();
      const week = plan.lapseWeek;
      hud.showBelly(belly, week === null ? null : weekText(week), true);
      if (week === null) saveSetting('belly', graphics.belly); // (it has stopped at her delivery week: kept)
    }

    // 6. Draw.
    dome.update(info);
    renderer.render(scene, rig.camera);

    // 7. The FPS line under her vitals card (always), and the full readout (Show full readout), twice a second.
    readoutTimer += realDt;
    readoutFrames++;
    if (!debug && readoutTimer >= 0.5) {
      hud.setFps(`${Math.round(readoutFrames / readoutTimer)} FPS · ${VERSION_NUMBER}`);
      readoutTimer = 0;
      readoutFrames = 0;
    }
    if (debug) {
      if (readoutTimer >= 0.5) {
        const fps = Math.round(readoutFrames / readoutTimer);
        hud.setFps(`${fps} FPS · ${VERSION_NUMBER}`);
        // THE READOUT IS KEPT IN SHORT LINES, about 30 letters at most, so that on a phone held sideways it fits
        // in the top left corner beside her vitals card and stays clear of the gear and the MOVE stick.
        // (Joshua, 2026-11-17: two long lines added here had made it grow over the gear and the view switch.)
        // The game's version is beside the FPS, so it can be read without opening Settings.
        const lines = [`${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} tris`];
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
        // (her feet: her stride now, metres, with the share of it a foot is down, and how fast she is really going; then which way she
        //  faces: body North and her head, and in third person whether her auto-aim has a target she can turn to)
        const strides = heroine.strideNow?.(), feet = heroine.feetInfo?.();
        if (strides && feet) {
          lines.push(`stride ${strides.stride.toFixed(2)} m ${Math.round(strides.share * 100)}% · ${feet.speed.toFixed(1)} m/s`);
          lines.push(`north ${Math.round(turn.base * 57.3)}° · head ${Math.round(turn.head * 57.3)}°` + (rig.mode === 'third' && turn.aimed ? ' · aimed' : ''));
        }
        // (her stomach, food + water, and her bladder: Settings -> FOOD & DRINK)
        const inside = vitals.contents;
        lines.push(`gut ${Math.round(inside.foodMl)}+${Math.round(inside.waterMl)} · bladder ${Math.round(inside.bladderMl)}`);
        // (the island's forest: trees drawn, in how many draws)
        const forest = island?.treeCounts();
        if (forest) lines.push(`trees ${forest.trees} · ${forest.draws} draws`);
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
