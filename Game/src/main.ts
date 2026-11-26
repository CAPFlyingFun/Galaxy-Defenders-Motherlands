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
import { setTextureCaps, textureCap } from './core/textureSizes';
import { isUpright, keepLandscape, onStageResize, onUprightChange, refitNow, whenOnItsSide } from './core/orientation';
import { checkScreen } from './core/screenFit';
import { loadKind, loadedAsPlanned, startLoadMeter } from './core/loadMeter';
import { connectSplash, showLastStart, showSplashError, showStartCount } from './ui/splash';
import { installGpuTally, type GpuTally } from './core/gpuTally';
import { loadBreak } from './core/loadPace';
import { START_SURVIVED, beginStartLog, lastStartClosed, lastStartSteps, markStart, startCountText } from './core/startupLog';
import { restartGame, setRestart } from './core/restart';
import { STANCE } from './heroine/fast/groundPose';
import { SIT } from './heroine/fast/sitPose';
import { PopUpToilet, TOILET_SIZE } from './world/toilet';
import { OtherDetail } from './heroine/fast/otherDetail';
import { onGlTrouble, watchGlTrouble } from './core/glTrouble';
import { createPause, type Pause } from './ui/pauseMenu';
import { CameraRig } from './camera/cameraRig';
import { createStandInHeroine } from './heroine/standIn';
import { NO_LIMITS, PACE_TUNING, Pace, type PaceLimits } from './input/pace';
import { HeroineVitals, VITALS_TUNING, lungsOfSave, type HeroineBody as VitalsBodyOf } from './vitals/heroineVitals';
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
import { environmentAt, makeEnvironment, type SkyEvent } from './world/island/proceduralSky';
import { GameClock } from './core/gameClock';
import { GROUND_COLOURS, GROUND_COLOURS_KEY, GROUND_KINDS, groundColoursNow } from './world/island/groundPaint';
import { TableUse } from './world/tableUse';
import { HolsterUse } from './world/holsterUse';
import { Door, DoorUse, DOOR, bodyRadius as doorBodyRadius } from './world/door';
import { BeltReload } from './world/beltReload';
import type { BeltGear } from './heroine/fast/beltGear';
import { BurstFire } from './world/burstFire';
import { GrabBars, GrabUse, type BarName } from './world/grabBars';
// (the NPC brain, ChatGPT's template fitted to this game: one per character, src/npc/)
import { AutoCombat, GdmActorPort, NeedsRoutine, NpcBrain, thoughtLines, type ActorHooks, type ActorWants } from './npc';
import { ThoughtBubble } from './ui/thoughtBubble';
import { Sound } from './audio/sound';
import { BreathSound, loadBreathVoice } from './audio/breathSound';
// THE PROLOGUE (v0.2.153; Joshua's opening demo, Draft 1): its code is fetched only when it is the map (types here)
import type { Tunnel } from './world/prologue/tunnel';
import type { Flashlight } from './world/prologue/flashlight';
import type { FlashlightProp } from './world/prologue/flashlightProp';
import type { CaveSounds } from './world/prologue/caveSounds';
import type { StoryDirector } from './story/storyDirector';
import type { GroundArrows } from './world/prologue/groundArrows';
import type { MiniMap } from './ui/miniMap';
import type { PrologueWorld } from './story/chapters/johnPrologue';

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
/**
 * JOHN'S OWN BODY for his vitals (Joshua, 2026-11-25: "Equal starting endurance, individual physiology"): 32, a man's
 * weight (vitals/heroineVitals.ts VITALS_TUNING.body), and since builder v0.9.76 HIS OWN LUNGS AND HEART, the builder's
 * (his look's saved body, or the male base body's own: 6.0 L, 120 L a minute at his hardest; 65 at rest, peak 208 -
 * 0.7 x his age; `lungsOfSave`, filled in where his vitals are made). His endurance starts the same as hers.
 */
const JOHN_BODY = { age: 32, weeks: 0, male: true } as const;
import { CAMERA_STYLES, CAMERA_STYLE_NAMES, type CameraStyle } from './camera/cameraRig';

/** What either real heroine can say about her own cost (the stand-in cannot): read by the debug readout. */
interface HeroineCost { triangles: number; drawCalls: number; updateMs: number; detail?: number; auto?: boolean; pixels?: number; pictures?: string; cameraMetres?: number; sharp?: boolean }
type GameHeroine = HeroineBody & {
  stats?: () => HeroineCost;
  /** The fast heroine only: change her detail and the frame rate Auto holds, while the game runs. */
  setDetail?: (detail: HeroineSettings['detail']) => void;
  setTargetFps?: (target: HeroineSettings['targetFps']) => void;
  /** The fast heroine only: the hidden live body (heroine/fast/liveBody.ts), and what it costs. */
  attachLive?: (live: import('./heroine/fast/liveBody').LiveBody | null) => void;
  liveInfo?: () => { stepMs: number; kicks: number; awake: boolean } | null;
  /** The fast heroine only: run her hidden live body, or let it sleep (frozen as it is): see `wakeBlazesLiveBody`. */
  setLiveAwake?: (awake: boolean) => void;
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
async function createHeroine(renderer: THREE.WebGLRenderer, scene: THREE.Scene, settings: HeroineSettings, say: (text: string) => void, outfit: string | null, onlyFast = false, parts: { headDetail?: number; handsDetail?: number; oneLevel?: boolean } = {}): Promise<GameHeroine> {
  const asked = new URLSearchParams(location.search);
  if (asked.get('heroine') === 'standin' && !onlyFast) return createStandInHeroine();
  const { lookKey, LOOKS } = await import('./heroine/looks');
  // (her outfit: the one asked for -- at the start the address's ?look=, else the one chosen in Settings
  //  (heroineSettings.ts OUTFIT_CHOICES); after a change in Settings, the new one: see `changeOutfit`)
  const look = lookKey(outfit);
  // (who: the look's own name, Blaze or John)
  const who = LOOKS[look]?.name ?? 'Blaze';
  // (and HIS steps said as his, on the male body: Joshua, 2026-11-22, the splash read "Loading John: unpacking her
  //  body…"; the body's own steps are written for her: `forHim` turns them)
  const male = LOOKS[look]?.body.model === 'male-base';
  const stageOf = (stage: string): string => (male ? forHim(stage) : stage);
  say(`Loading ${who}…`);
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
        // (the head and hands at their own detail when the level is lighter: John's, JOHN_HEAD_DETAIL and
        //  JOHN_HANDS_DETAIL; unset for Blaze)
        headDetail: parts.headDetail,
        handsDetail: parts.handsDetail,
        oneLevel: parts.oneLevel,
        onProgress: (stage) => say(`Loading ${who}: ${stageOf(stage)}…`),
      });
    } catch (error) {
      // (John is made only as a fast body: there is no second builder's room for him)
      if (onlyFast) throw error;
      console.error('The fast heroine could not be made; trying the Character Builder\'s own room.', error);
    }
  }
  if (onlyFast) throw new Error(`${who} needs Body: Performance`);
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
 * A loading step written for her, said of HIM: "unpacking her body" -> "unpacking his body", "dressing her" ->
 * "dressing him", "getting her ready to draw" -> "getting him ready to draw". `her` before one of his things is
 * his; any other `her` is him.
 */
function forHim(stage: string): string {
  return stage
    .replace(/\bher (body|hair|outfit|suit|clothes|pictures|shape|skin|face|live body|guns|belt)\b/g, 'his $1')
    .replace(/\bher\b/g, 'him')
    .replace(/\bHer\b/g, 'His')
    .replace(/\bshe\b/g, 'he')
    .replace(/\bShe\b/g, 'He');
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
/**
 * THE CAMERA STYLES AIMED BY HAND (Joshua, 2026-11-19: "allow some camera modes in manual... walking is fine, trying to
 * shoot and aim would be different and would need a closer view"): over her shoulder (the aiming view), follow, and
 * the two side views. While FIRE is held, and for MANUAL_AIM_HOLD seconds after, the camera is over her shoulder
 * whatever is chosen, so the crosshair aims where she does. Kept on this device apart from the other list.
 */
const MANUAL_CAMERA_STYLES: readonly CameraStyle[] = ['shoulder', 'follow', 'sideLeft', 'sideRight'];
const MANUAL_AIM_HOLD = 1.2;
/**
 * THE LOCK GIVES UP ON A WALL (v0.2.170, GAME TUNING): locked, she has LOCK_START_SECONDS to get going, then if she goes
 * slower than LOCK_STUCK_SPEED m/s over the ground (a wall, a tree trunk, deep water hold her) for LOCK_STUCK_SECONDS,
 * the lock lets go.
 */
const LOCK_START_SECONDS = 1.5;
const LOCK_STUCK_SPEED = 0.3;
const LOCK_STUCK_SECONDS = 0.8;
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
/** WINDED (Joshua, 2026-11-20): she bends over in this long, seconds (she straightens up over PACE_TUNING.windedRiseSeconds,
 * 1.5 s, once her breathing is down: input/pace.ts). */
const WINDED_IN = 0.6;
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
/** Kicks (bellyTouch.ts KICK_REACTION): faster than this pace (1 a walk, 2 a jog) she is BUSY. GAME TUNING. */
const KICK_BUSY_PACE = 1.5;
/** ...and slower than this, metres a second, with nothing to do, she is RELAXED. GAME TUNING. */
const KICK_STILL_SPEED = 0.1;
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
/** ...after waiting this long once the player lets go (seconds; Joshua, 2026-11-20: "add a 1s delay"; 2026-11-21: "raise
 * the wait time... from 1s to 10s, with the transition after the 10s": at the table, bars and door, and first person
 * following her auto-aim target). */
const BUSY_LOOK_WAIT = 10;
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
  keepLandscape(stage); // keeps the game fitted to the screen, and knows when a phone is held upright (src/core/orientation.ts)
  // TURN FIRST, THEN LOAD (v0.2.148; Joshua, 2026-11-22: "when I start almost always in portrait... when I rotate to
  // landscape, that's when the errors usually occur... force the turn, once turned in landscape, then it starts
  // everything"). A phone opened upright downloads and builds NOTHING until it is on its side and its size has
  // settled (orientation.ts `whenOnItsSide`): the biggest memory moment of a start (her pictures going up to the
  // graphics chip, the first picture) no longer lands in the middle of the turn. The time waiting is not loading time.
  if (isUpright()) {
    for (const id of ['rotate-step', 'splash-step']) { const node = document.getElementById(id); if (node) node.textContent = 'Turn your phone on its side to start'; }
  }
  const waitedForTurn = await whenOnItsSide(stage);
  const startSettings = loadHeroineSettings();
  const loadIs = loadKind(startSettings); // which kind of load this is: "fast live", "fast", "room"...
  const meter = startLoadMeter(loadIs, waitedForTurn);
  // HOW FAR THE LAST START GOT (Joshua, 2026-11-22: v0.2.142 "keeps crashing on load"; core/startupLog.ts): every step
  // of this start is written down on the phone as it is reached, with the megabytes downloaded and the graphics memory
  // asked for (est., `gpuTally`, counted from the moment the renderer is made). If the phone closed the LAST start
  // before it had played 30 s, the splash says where it stopped.
  let gpuTally: GpuTally | null = null;
  // (and WHICH MAP, with a count of this version's starts per map that lasted 30 s: v0.2.149, the town test)
  beginStartLog(VERSION_NUMBER, () => gpuTally?.totalMB() ?? 0, () => meter.bytes / 1048576, startSettings.map);
  showLastStart(lastStartClosed());
  showStartCount(startCountText());
  // (every turn of the phone is written down too, so a start the phone closed says whether a turn came just before)
  onUprightChange((upright) => markStart(upright ? 'turned upright' : 'turned on its side'));
  {
    // (every step the splash shows is a step of the start log too)
    const meterStep = meter.step.bind(meter);
    meter.step = (key: string, label: string): void => { meterStep(key, label); markStart(label); };
  }
  meter.step('world', startSettings.map === 'prologue' ? 'Beneath the island…' : 'Building the dome and the city…');
  /**
   * A SHORT BREAK between loading steps (Joshua, 2026-11-17). The page can only redraw (a turn of the phone, the
   * loading bar) when the game's code stops for a moment; one picture's time, here and there, lets it catch up.
   * (The Character Builder's own long step, opening her live body, cannot be broken up from here.)
   */
  const breathe = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
  /**
   * A PAUSE BEFORE A HEAVY STEP (v0.2.151; Joshua, 2026-11-22: "split up the loading process like (Light>Heavy>Light>
   * Heavy, etc…) with maybe a 1s break between loading"; core/loadPace.ts): a second of nothing, so the page can clear
   * what the last step left behind before the next big piece is unpacked. Each is a step of its own on the splash (and
   * in the start log, so a start the phone closes during one says so).
   */
  const pauseBefore = async (what: string): Promise<void> => {
    meter.step(`pause ${what}`, `A short pause before ${what}…`);
    await loadBreak();
  };
  const splash = connectSplash(meter);
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
  // TEXTURE SIZES (v0.2.148, core/textureSizes.ts): every picture made from here on is made to these, and Settings
  // changes them while the game runs (each picture of that kind made again, one at a time)
  void setTextureCaps({ character: graphics.characterTextures, world: graphics.worldTextures });
  // THE GAME'S SOUND (audio/sound.ts): one Web Audio context, woken by the first touch, at Settings -> SOUND's master
  // volume. Her breathing is its first sound (audio/breathSound.ts, `playBreaths` in the loop).
  const sound = new Sound();
  sound.setVolume(graphics.soundVolume / 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // (the graphics memory the game asks for, an estimate counted from every picture and buffer handed to the chip:
  //  core/gpuTally.ts; before anything is handed over)
  gpuTally = installGpuTally(renderer.getContext() as WebGL2RenderingContext);
  // (a shader the phone will not build, or the graphics lost, said on screen: core/glTrouble.ts)
  watchGlTrouble(renderer.domElement);
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
  // on the island is chosen (Settings -> WORLD -> Map, or ?map=town). THE TOWN'S PIECES ARE MADE ONLY FOR THE TOWN
  // (Joshua, 2026-11-21, ChatGPT's review): they used to be made on the island too and never shown, among them the
  // town's sky, drawn once into a 512-pixel cube on the graphics chip. On the island only the dome's twelve sections
  // are kept, as numbers (`Dome.sectionsOnly`): the danger she feels and the TEST TOOLS read them.
  const onIsland = graphics.map === 'island';
  // THE PROLOGUE (v0.2.153; Joshua, 2026-11-22: his opening demo, Draft 1, built first as a blockout): the story's
  // opening, John alone in a passage beneath the island (world/prologue/, story/). Its own small scene: no island, no
  // town, no Blaze (so no live body), only him. Settings -> WORLD -> Map -> Prologue, or ?map=prologue.
  const prologue = graphics.map === 'prologue';
  /** The domed town (neither the island nor the prologue): its sky, ground, city and dome are made only for it. */
  const onTown = !onIsland && !prologue;
  const sky = onTown ? createSky(renderer) : null;
  if (sky) {
    scene.background = sky.background;
    scene.add(sky.stars);
  }

  const ground = onTown ? createGround() : null;
  if (ground) scene.add(ground.mesh);

  const city = onTown ? createCity() : null;
  if (city) scene.add(city.group);

  const dome = onTown ? await Dome.load(`${import.meta.env.BASE_URL}models/Half_Sphere.obj`) : Dome.sectionsOnly();
  if (onTown) scene.add(dome.group);

  // THE ISLAND (src/world/island/): its 3 x 3 tiles of 3.5 km round her (v0.2.150: 16 x 16 over the island), the
  // coarse far island, the sea and the day sky. The game waits, behind the splash, only for the tile under her.
  let island: IslandWorld | null = null;
  if (onIsland) {
    meter.step('island', 'Opening the island…');
    const { createIslandWorld } = await import('./world/island/islandWorld');
    island = await createIslandWorld(`${import.meta.env.BASE_URL}island/`, scene, {
      landscaping: graphics.landscaping, ground: graphics.ground, grid: graphics.islandGrid, rivers: graphics.rivers === 'on',
      sky: graphics.sky,
    });
    scene.add(island.group);
    let told = -1;
    // (HER TILE ONLY before play, v0.2.150: the 8 round her come in one at a time once she is playing, `startStreaming`
    //  in beginPlaying below)
    await island.ready(0, 0, (done) => {
      if (done === told) return;
      told = done;
      meter.step(`island ground ${done}`, done ? 'The island: the ground under her is in' : 'The island: the ground under her…');
    });
    await breathe();
  }
  // THE PROLOGUE'S PASSAGE (world/prologue/tunnel.ts): built in code, nothing to download. In the dark: a black
  // background, and black fog so the passage fades into it beyond the flashlight. Its flashlight, its sounds and the
  // story (the overlay is made here, before the game's controls, so every control is drawn over it) come with it.
  let tunnel: Tunnel | null = null;
  let flashlight: Flashlight | null = null;
  /** THE FLASHLIGHT HE HOLDS (Joshua's handoff, 2026-11-23): the lamp in his right hand, whose lens the beam leaves. */
  let flashProp: FlashlightProp | null = null;
  let caveSounds: CaveSounds | null = null;
  let story: StoryDirector | null = null;
  /** THE WAY TO THE OBJECTIVE (Joshua, 2026-11-22: "ground arrows or something... a little compass 🧭 or mini map"): arrows
   *  on the passage's floor, and the minimap and compass (after Beyond Extinction's Minimap.ts). */
  let groundArrows: GroundArrows | null = null;
  let miniMap: MiniMap | null = null;
  /** How far along the passage John is (metres), worked out once a frame. */
  let prologueProgress = 0;
  /** The objective's place along the passage (metres), worked out when it changes. */
  let waypointWas: { x: number; z: number } | null = null, waypointS: number | null = null;
  if (prologue) {
    meter.step('tunnel', 'Beneath the island: the passage…');
    const [{ Tunnel }, { Flashlight }, { CaveSounds }, { StoryDirector }, { GroundArrows }, { MiniMap }, { createFlashlightProp }] = await Promise.all([
      import('./world/prologue/tunnel'), import('./world/prologue/flashlight'), import('./world/prologue/caveSounds'), import('./story/storyDirector'),
      import('./world/prologue/groundArrows'), import('./ui/miniMap'), import('./world/prologue/flashlightProp'),
    ]);
    tunnel = new Tunnel();
    scene.add(tunnel.group);
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.045);
    // (BEYOND EXTINCTION'S TONE MAPPING, which its lab's flashlight is lit with: ACES filmic, exposure 1.15. A torch
    //  close to the rock is far brighter than one down the passage; without it the wall in front of him went flat
    //  white. Only here: the island and the town keep the game's own look.)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    flashlight = new Flashlight(scene);
    flashProp = createFlashlightProp();
    caveSounds = new CaveSounds(sound);
    story = new StoryDirector(uiHost, caveSounds);
    // (black from the very first picture: the scene opens in the dark)
    story.overlay.fade(1, 0);
    groundArrows = new GroundArrows(tunnel);
    scene.add(groundArrows.group);
    miniMap = new MiniMap(story.overlay.top, tunnel.outline());
    miniMap.setShown(false);
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
  // (no sky beneath the island, and nothing to shoot at in the prologue)
  if (tunnel) targets.mesh.visible = false;
  const tracers = new Tracers();
  scene.add(tracers.mesh);

  // Two plain lights for the heroine. (The city, ground and dome glow by themselves and ignore lights.)
  const skyLight = new THREE.HemisphereLight(0xcfe0ff, 0x1a2740, 1.7);
  // THE KEY LIGHT'S DIRECTION (toward the sun or moon) and how far from her it stands (its old place, (-4, 10, 6)):
  // fixed as it has always been, or the procedural sky's sun by day and moon by night (`stepSky`)
  const DAY_KEY_DIR = new THREE.Vector3(-4, 10, 6).normalize();
  const KEY_REACH = Math.hypot(4, 10, 6);
  const keyDirNow = DAY_KEY_DIR.clone();
  // THE ONE GAME CLOCK (2026-11-26, Joshua's decisions 2c and 3a; core/gameClock.ts): the day and the time of day,
  // starting at Settings -> Time of day and run at Settings -> WORLD -> Game speed (6x normal: a game day in 4 real
  // hours). The sky shows its hour; her body's slow clocks (her gut, her sleepiness and sleep) run on it, through
  // `gameHoursPerSecond`, set for both characters every frame. Her walk, stamina, heart and breathing stay in real time.
  const clock = new GameClock(graphics.skyHour, graphics.gameSpeed);
  // THE PROCEDURAL SKY'S MOMENT (v0.2.167; world/island/proceduralSky.ts): the clock's hour, a storm's lightning, and
  // the Environment worked out from them each frame
  const environment = makeEnvironment();
  let lightning = 0, nextLightning = 6, skyHourShown = 0;
  /**
   * Each frame on the island with the procedural sky: the clock moves on (if a day cycle runs), a storm may flash, and
   * the moment's sky, light, haze and sea are set (the island's own parts by `island.setEnvironment`).
   */
  const stepSky = (dt: number, realDt: number): void => {
    if (!island || graphics.sky !== 'procedural') return;
    const skyHour = clock.hour;
    // LIGHTNING in a storm: now and then (every 4-14 s), a flash that dies away over a third of a second
    if (graphics.skyEvent === 'storm') {
      nextLightning -= dt;
      if (nextLightning <= 0) { lightning = 1; nextLightning = 4 + Math.random() * 10; }
    }
    lightning = Math.max(0, lightning - dt * 3);
    environmentAt(environment, skyHour, graphics.skyEvent, graphics.clouds === 'on', lightning * lightning);
    skyLight.color.copy(environment.hemiSky);
    skyLight.groundColor.copy(environment.hemiGround);
    skyLight.intensity = environment.hemiIntensity;
    keyLight.color.copy(environment.keyColour);
    keyLight.intensity = environment.keyIntensity;
    keyDirNow.copy(environment.keyDir);
    island.setEnvironment(environment, dt);
    // (the Settings slider follows a running clock, four times a second)
    skyHourShown += realDt;
    if (clock.rate > 0 && skyHourShown > 0.25) { skyHourShown = 0; hud.setSkyHour(skyHour); }
  };
  scene.add(skyLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(-4, 10, 6);
  scene.add(keyLight);
  scene.add(keyLight.target);
  /**
   * THE ISLAND'S OWN DAYTIME LIGHT, as it has always been (and as the procedural sky's 13:15 is): a blue-white sky light
   * from above and dark blue from below, and a white sun from (-4, 10, 6). The ground's colours were measured in it.
   */
  const dayLight = (): void => {
    skyLight.color.set(0xcfe0ff); skyLight.groundColor.set(0x1a2740); skyLight.intensity = 1.7;
    keyLight.color.set(0xffffff); keyLight.intensity = 1.5;
    keyDirNow.copy(DAY_KEY_DIR);
  };
  // (beneath the island there is no sky and no sun: only the faintest light, so he is never quite lost in the black;
  //  his flashlight does the rest)
  if (tunnel) { skyLight.color.set(0x8a9bb5); skyLight.groundColor.set(0x1a140e); skyLight.intensity = 0.07; keyLight.intensity = 0; }

  // REAL SHADOWS (Joshua, 2026-11-17: "Allow real shadows"; the DEV Room's "Shadows: on", with its own numbers: a
  // 2048-pixel shadow picture, softened). The key light draws her once more, from where it stands, into a picture of
  // depths; anything that "receives" shadows then darkens where that picture says she is in the way.
  // The ground glows by itself and ignores lights, so a see-through disc lies just over it whose only
  // job is to show her shadow (three.js's ShadowMaterial: invisible but for the shadow on it).
  // The light's shadow box is small (6 m across) and follows her each frame, so the picture stays sharp. The disc
  // is small too (a few metres round her feet) and goes with her, so her shadow shows anywhere on the map and
  // not only in the plaza. (Both are moved in the loop below, where she is moved.)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // (its size follows the WORLD texture setting, as Joshua confirmed, 2026-11-22: 1024 at 256 and 512, 2048 above;
  //  a 2048 shadow picture and its depths are 32 MB on the graphics chip, a 1024 one 8 MB)
  const shadowSizeFor = (world: number): number => (world <= 512 ? 1024 : 2048);
  keyLight.shadow.mapSize.set(shadowSizeFor(graphics.worldTextures), shadowSizeFor(graphics.worldTextures));
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
  /**
   * JOHN'S DETAIL, FIXED (Joshua, 2026-11-21: v0.2.128 froze on his iPhone about 10 s in; "Put him at 1% detail. If that
   * works, then we can do the face and hands only and try again… and slowly add more"). John is drawn at this ONE level,
   * played or standing by, whatever the Detail setting or the frame rate says: made once, never rebuilt (before, every
   * change of the frame rate made new copies of both bodies). Nothing of him is kept sharp (JOHN_SHARP_PARTS): with his
   * face, chest, belly, hands and arms kept, about 57,000 of his 222,000 triangles stayed at every level, so his 1 % was
   * about 92,000 triangles with his belt and guns; now about 36,000. Blaze is unchanged. null: he follows as before.
   */
  const JOHN_DETAIL: 1 | null = 1;
  /** John's face, hands and the rest kept sharp at his fixed level (fastHeroine.ts `sharpParts`): none, for now. */
  const JOHN_SHARP_PARTS = false;
  /** HIS FACE AT 70 % (Joshua, 2026-11-21, v0.2.133 ran with him at 1 %: "Let's try raising only his face details to
   *  30%"; v0.2.134 at 30 %: "His face is better, but not 100%"; then "Do face at 70%, hands at 15%"): his head, above
   *  his neck, kept at this detail while the rest of him is at JOHN_DETAIL (fastHeroine.ts `headDetail`, detailLevels.ts
   *  `headPart`: the rest lightened first with his head held, then his head alone). null: it goes with the rest.
   *  NOW 100 % (Joshua, 2026-11-21, with his new head and crew cut: "Can you put John's head at 100% detail"): his
   *  head kept whole, and his hair worn as its full file (fastHeroine.ts `showHair`). */
  const JOHN_HEAD_DETAIL: number | null = 100;
  /** HIS HANDS AT 15 % (the same ask), the same way (fastHeroine.ts `handsDetail`, detailLevels.ts `handPart`). */
  const JOHN_HANDS_DETAIL: number | null = 15;
  /** JOHN AS HE IS MADE: his fixed detail and nothing kept sharp (above), everything else as Settings say. */
  const johnSettings = (): HeroineSettings => (JOHN_DETAIL === null ? graphics : { ...graphics, detail: JOHN_DETAIL, sharpParts: JOHN_SHARP_PARTS ? graphics.sharpParts : 'off' });
  /** (held at one detail, he keeps only that one level: fastHeroine.ts `oneLevel`, v0.2.147) */
  const johnParts = (): { headDetail?: number; handsDetail?: number; oneLevel?: boolean } => (JOHN_DETAIL !== null ? { headDetail: JOHN_HEAD_DETAIL ?? undefined, handsDetail: JOHN_HANDS_DETAIL ?? undefined, oneLevel: true } : {});
  // What she is doing while she loads goes to the splash: each line she reports is one step of the load.
  // (her body is the first heavy step: a pause before it, v0.2.151)
  // (THE PROLOGUE: John is the first, and only, one made)
  await pauseBefore(prologue ? 'John' : 'Blaze');
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
  let bodyNow: GameHeroine = prologue
    ? await createHeroine(renderer, scene, johnSettings(), (text) => meter.step(text, text), 'john', true, johnParts())
    : await createHeroine(renderer, scene, graphics, (text) => meter.step(text, text), outfitNow);
  markStart(prologue ? 'John made' : 'Blaze made');
  /**
   * THE TWO OF THEM (Joshua, 2026-11-21: "Both in game for now... with maybe a 🔄 swap character to change and switch
   * between like how Beyond Extinction does it"). Blaze and John, Blaze's husband (heroine/looks/john.ts), each with
   * a body, their own vitals, where they stand and which way they face. The one being PLAYED is `bodyNow` (so
   * everything that works through `heroine` below works with them); the other stands where they were left, breathing,
   * their vitals running on (`swapCharacter`, and each frame in the loop). Made just below, once their vitals exist.
   */
  interface Character {
    readonly name: string;
    body: GameHeroine;
    readonly vitals: HeroineVitals;
    /** EVERYTHING THEY ARE DOING, THEIR OWN (Step 1, `Kit` below): where they are, which way they face, their guns,
     *  holsters, belt, the table, a bar or the door, their stance. Played or standing by, it is always theirs. */
    readonly kit: Kit;
    /** AUTO or MANUAL, their own (Joshua, 2026-11-21: "Each one should work auto independently"). While played it is
     *  the game's `graphics.autoFire`; swapped away, it is kept here, and their brain fights in AUTO (Step 2). */
    autoFire: 'on' | 'off';
    /** THEIR BRAIN (Step 2, src/npc/: ChatGPT's NPC brain fitted to this game): 'player' while played (it does
     *  nothing), 'ai' while standing by (their needs, and in AUTO their fight). Made by `setUpBrain`. */
    brain: NpcBrain | null;
    port: GdmActorPort | null;
    needs: NeedsRoutine | null;
    combat: AutoCombat | null;
    /** THEIR OWN CAMERA, kept while they are not played (Joshua, 2026-11-21: "each one should save independently and on
     *  swap back, will resume the same last heading"; again in v0.2.134, on its own: v0.2.129's held stances and guns
     *  are not brought back): its heading and tip (radians) and the view it was in; null until they have been played
     *  (then the camera starts looking the way they face). */
    cam: { yaw: number; pitch: number; mode: string } | null;
  }
  let john: Character | null = null, blaze: Character | null = null;
  /** Who is being played now (Blaze until the first swap). */
  let playing: Character | null = null;
  /** Whoever is NOT being played (null while John is not in the game). */
  const bystander = (): Character | null => (!john || !blaze ? null : playing === john ? blaze : john);
  const bystanderBody = (): GameHeroine | null => bystander()?.body ?? null;
  /** The detail of the one standing by: the player's within 20 m on a phone (always on a computer), then down to 1 %
   *  over 10 m (heroine/fast/otherDetail.ts). */
  const otherDetail = new OtherDetail();
  /** THE THOUGHT BUBBLE over the one standing by: what their brain is thinking (ui/thoughtBubble.ts; Settings -> TEST
   *  TOOLS -> AI thoughts). Put into the UI layer first, so every control is drawn over it. */
  const thoughtBubble = new ThoughtBubble(uiHost);
  const thoughtAt = new THREE.Vector3();
  // (scratch for the bubble's distances: the one standing by's middle and the camera's place)
  const otherMiddle = new THREE.Vector3(), cameraAt = new THREE.Vector3();
  /** How far above their eyes the bubble's tail points, metres (clear of the top of the head). */
  const THOUGHT_ABOVE = 0.3;
  /**
   * THEIR BREATHING, HEARD (Joshua, 2026-11-21: his ElevenLabs breathing files; audio/breathSound.ts): one breath at a
   * time with their own chest, from their own vitals, quieter the farther the camera is (`playBreaths`, every frame).
   * Blaze's voice is 'female'; John has none yet (Joshua makes the male files later): BREATH_VOICES names who has one.
   */
  const BREATH_VOICES: Readonly<Record<string, string>> = { Blaze: 'female' };
  // (her breathing files are loaded as a step of the load, 'Loading her breathing…' below; each one decoded in turn)
  const breaths = new Map<Character, BreathSound>();
  const breathAt = new THREE.Vector3();
  /**
   * BLAZE'S LIVE BODY ONLY WHEN SOMEONE IS NEAR HER (Joshua, 2026-11-22: "can we have Blaze's body live only if playing
   * her, or within 12m as another character to automatically stop rendering her live all the time especially if not
   * near her? It will freeze her live portions until close again"). Her hidden live body (her baby's kicks, her belly's
   * shape as the builder makes it: heroine/fast/liveBody.ts) is run while she is PLAYED, or while the one played (John)
   * is within LIVE_NEAR metres of her (her face, bust and belly are drawn sharp within 12 m too: fastHeroine.ts
   * `SHARP_WITHIN`); farther, it SLEEPS: not stepped at all, frozen as it was, until he comes near again. (It wakes at
   * LIVE_NEAR and sleeps only past LIVE_NEAR + 0.5 m, so walking along the line does not flick it.)
   */
  const LIVE_NEAR = 12;
  let blazeLiveAwake = true;
  const wakeBlazesLiveBody = (): void => {
    if (!blaze) return;
    let awake = true;
    if (playing !== blaze && playing) {
      const dx = playing.kit.motion.x - blaze.kit.motion.x, dz = playing.kit.motion.z - blaze.kit.motion.z;
      const metres = Math.hypot(dx, dz);
      awake = blazeLiveAwake ? metres <= LIVE_NEAR + 0.5 : metres <= LIVE_NEAR;
    }
    if (awake !== blazeLiveAwake) { blazeLiveAwake = awake; blaze.body.setLiveAwake?.(awake); markStart(awake ? 'Blaze live awake' : 'Blaze live asleep'); }
  };
  const playBreaths = (): void => {
    if (!(playingSince > 0) || !sound.start()) return;   // (from the first frame of play; no Web Audio here: silent)
    for (const c of [blaze, john]) {
      if (!c) continue;
      let b = breaths.get(c);
      const voice = BREATH_VOICES[c.name];
      if (!b && voice) { b = new BreathSound(sound, voice, __APP_VERSION__); breaths.set(c, b); }
      if (!b) continue;
      // (her own camera in first person: no distance at all)
      const metres = c === playing && rig.mode === 'first' ? 0 : c.body.eye(breathAt).distanceTo(rig.camera.position);
      b.update(c.vitals.reading, metres, graphics.breathVolume / 100);
    }
  };
  /** The Detail a character is drawn at while PLAYED: John's fixed one, or the Settings choice (Blaze). */
  const detailFor = (c: Character | null): HeroineSettings['detail'] => (c && c === john && JOHN_DETAIL !== null ? JOHN_DETAIL : graphics.detail);
  /** Blaze is the one being played (always, without John). */
  const playingBlaze = (): boolean => !john || playing !== john;
  /**
   * A STAND-IN for a body (see above): every question passed on to whichever body `bodyOf()` gives now. `heroine` is
   * the one PLAYED (`bodyNow`); each character's own kit has one for their own body (`makeKit`, Step 1), so their
   * holsters, table, bars and door keep working on THEM whoever is played, and through an outfit change.
   */
  const standIn = (bodyOf: () => GameHeroine): GameHeroine => new Proxy({} as GameHeroine, {
    get(_stand, key) {
      const body = bodyOf();
      const value = (body as unknown as Record<PropertyKey, unknown>)[key];
      // (her methods are run on her own body, as if called on it directly)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(body) : value;
    },
    has(_stand, key) { return key in bodyOf(); },
  });
  const heroine: GameHeroine = standIn(() => bodyNow);
  // (her skin's shine as chosen in Settings: 0 dry .. 25 natural .. 100 oily)
  heroine.setSkinShine?.(skinOilyOf(graphics.skinShine));
  await breathe();
  scene.add(heroine.root);
  // Real shadows on or off (Settings): the renderer's shadow pictures, the key light's, and every part of her casting.
  let realShadows = false;
  const applyShadows = (): void => {
    realShadows = graphics.shadows === 'on';
    renderer.shadowMap.enabled = realShadows;
    keyLight.castShadow = realShadows && !tunnel;
    shadowFloor.visible = realShadows && !island && !tunnel; // (on the island the ground itself takes her shadow; in the prologue's passage, its rock)
    heroine.root.traverse((node) => { if ((node as THREE.Mesh).isMesh) node.castShadow = realShadows; });
    // (and whoever is not being played)
    bystanderBody()?.root.traverse((node) => { if ((node as THREE.Mesh).isMesh) node.castShadow = realShadows; });
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
  if (graphics.liveBody === 'on' && heroine.attachLive && !prologue) {
    try {
      // (the next heavy step: a pause before it, v0.2.151)
      await pauseBefore('her live body');
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
  // (the town's walls only on the town: on the island its own walls stop her, `island.walls`)
  const walls = city ? new CityWalls(city.footprints) : null;
  // WHERE SHE STARTS: the island's centre point, the beach, facing inland (the sea behind her); the town's plaza,
  // looking out at the city (+Z). Her movement (`PlayerMotion`) and which way each part of her faces (`BodyTurn`,
  // src/input/bodyTurn.ts) are her own, in her kit (`makeKit`, below).
  const startMotion = new PlayerMotion();
  const START = tunnel ? tunnel.start : island ? { x: 0, z: 0, yaw: island.arrivalFacing } : { x: startMotion.x, z: startMotion.z, yaw: 0 };

  // THE WEAPON TABLE (Joshua, 2026-11-17: "a table you can actually grab to pick up and drop your guns"): beside
  // where she starts, so she can walk up to it, put her guns down on it and take them up again
  // (src/world/weaponTable.ts, src/world/tableUse.ts; her hands: src/heroine/fast/handReach.ts, lowerBody.ts).
  // (its clips in her outfit's gun colours, so a clip from the table matches her guns: looks/gear.ts)
  const [{ lookKey: tableLookKey }, { LOOK_GEAR }] = await Promise.all([import('./heroine/looks'), import('./heroine/looks/gear')]);
  const tableLook = tableLookKey(outfitNow);
  const table = new WeaponTable(graphics.tableHeight, LOOK_GEAR[tableLook]?.gun);
  // (NOT IN THE PROLOGUE: John is on an expedition, not at the armoury. They are made, as everything that asks after
  //  them expects them, but far off and not added to the scene)
  const away = tunnel ? 5000 : 0;
  table.place(1.6 + away, 9.85, 0);
  if (!tunnel) scene.add(table.root);
  // THINGS TO TAKE HOLD OF (Joshua's step #4, 2026-11-18): an upright pole and a waist-high rail beside the table, the
  // other side of the street (src/world/grabBars.ts; her fingers: src/heroine/fast/fingerTouch.ts).
  const bars = new GrabBars();
  bars.place('pole', -1.3 + away, 10.1, 0);
  bars.place('rail', -3.0 + away, 10.3, 0);
  if (!tunnel) scene.add(bars.pole, bars.rail);
  // THE DOOR (Joshua, 2026-11-18; src/world/door.ts): beside the rail, its pull side (the lever) toward the plaza
  const door = new Door();
  door.place(-5.2 + away, 10.2, Math.PI);
  if (!tunnel) scene.add(door.root);
  // (on the island the table, bars and door stand on the beach beside her, on the sand's own height)
  if (island) {
    table.root.position.y = groundUnder(1.6, 9.85);
    bars.pole.position.y = groundUnder(-1.3, 10.1);
    bars.rail.position.y = groundUnder(-3.0, 10.3);
    door.root.position.y = groundUnder(-5.2, 10.2);
    for (const thing of [table.root, bars.pole, bars.rail, door.root]) thing.updateMatrixWorld(true);
  }
  /** Where the door puts her back (one object, rewritten). */
  const doorOut = { x: 0, z: 0 };

  // ---- EVERYTHING A CHARACTER IS DOING, THEIR OWN (Step 1) -----------------------------------------------------------
  // Joshua, 2026-11-21: "Each character should store the complete state on swap whether crouching, holding on to
  // something, auto shooting". Before, the game had ONE of each thing she does (her holsters, her belt's reloads, the
  // table, the bars, the door, her pace, her bursts) and they worked on whoever was played: swapping handed John
  // Blaze's guns and table, and in AUTO the swap went strange. Now each character has a KIT of their own, on their OWN
  // body (a stand-in onto it, so an outfit change keeps working): made below for Blaze, and for John when he is made.
  // The game's names for these (`motion`, `turn`, `tableUse`, `holsterUse`...) POINT AT THE PLAYED ONE'S kit
  // (`pointAt`); the one standing by keeps theirs, and carries on with it each frame (`stepStandingBy`).
  // The table, the two bars and the door are the world's: ONE character at a time (`tableTaken`, `barTaken`, `doorTaken`).
  type Ask = { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null };
  /** The small values of what they are doing (the played one's live in the game's own variables, copied in and out at
   *  a swap: `saveState`, `loadState`; the one standing by's are here, and change here). */
  interface KitState {
    stance: 'stand' | 'crouch' | 'down'; stanceNoAim: boolean;
    bathroomLeft: number; bathroomBowels: boolean; mustGoNow: boolean;
    tableReloading: boolean; tableAfterDraw: 'both' | 'left' | 'right' | 'reload' | null;
    grabAfterHolster: BarName | null; grabAfterTable: BarName | null; doorAfterHolster: Hand | null; grabWhich: 'both' | Hand;
    aimTarget: number; supporting: boolean; gait: Gait; gaitResetLeft: number; windedWeight: number;
    waterDepthNow: number; wetFor: number; actionPitch: number; actionPitchWant: number; sinceFire: number;
    limits: PaceLimits; lastMoveX: number; lastMoveY: number;
  }
  interface Kit {
    /** A stand-in onto their own body (whichever it is now: an outfit change swaps it underneath). */
    readonly self: GameHeroine;
    readonly motion: PlayerMotion;
    readonly turn: BodyTurn;
    readonly turnInput: { view: 'first' | 'third'; look: number | null; move: number | null; hold: number | null; grip: boolean };
    readonly tableUse: TableUse; readonly tableAsk: Ask;
    readonly grabUse: GrabUse; readonly grabAsk: Ask;
    readonly doorUse: DoorUse; readonly doorAsk: Ask & { pull: THREE.Vector3 };
    readonly holsterUse: HolsterUse; readonly holsterAsk: { lookAt: THREE.Vector3 | null };
    readonly beltReload: BeltReload; readonly beltAsk: { lookAt: THREE.Vector3 | null };
    readonly gearOf: () => BeltGear | null;
    readonly pace: Pace;
    readonly burst: BurstFire;
    readonly eating: { food: number; water: number; seconds: number };
    /** Where their guns point (standing by, firing on their own). */
    readonly aim: THREE.Vector3;
    /** What their brain wants of them this frame (src/npc/gdmPort.ts). */
    readonly wants: ActorWants;
    readonly state: KitState;
    /** THEIR OWN POP-UP TOILET (src/world/toilet.ts; Joshua, 2026-11-22): it grows in behind them when they go. */
    readonly toilet: PopUpToilet;
  }
  const freshState = (): KitState => ({
    stance: 'stand', stanceNoAim: false, bathroomLeft: 0, bathroomBowels: false, mustGoNow: false, tableReloading: false, tableAfterDraw: null,
    grabAfterHolster: null, grabAfterTable: null, doorAfterHolster: null, grabWhich: 'both', aimTarget: 0, supporting: false,
    gait: 'stand', gaitResetLeft: 0, windedWeight: 0, waterDepthNow: 0, wetFor: Infinity, actionPitch: 0, actionPitchWant: 0,
    sinceFire: Infinity, limits: NO_LIMITS, lastMoveX: 0, lastMoveY: 0,
  });
  /** A character's own kit, on their own body (`self`), standing at x, z and facing `yaw`. Their guns start holstered. */
  const makeKit = (self: GameHeroine, x: number, z: number, yaw: number): Kit => {
    const motion = new PlayerMotion(island ? island.walls : tunnel ? tunnel.walls : walls);
    motion.x = x; motion.z = z;
    // (a body that can turn its parts apart is handed its turning once, and reads it every frame)
    const turn = new BodyTurn();
    turn.reset(yaw);
    self.setFacing?.(turn);
    // (the weapon table: src/world/tableUse.ts; the table itself is the world's, one for everyone)
    const tableUse = new TableUse(table, self);
    // HER THIGH HOLSTERS (Joshua, 2026-11-18: her guns away "on the go"; src/world/holsterUse.ts). She keeps walking.
    const holsterUse = new HolsterUse(self);
    holsterUse.startHolstered(); // (guns start in their holsters: DRAW takes them out)
    // RELOADING FROM HER BELT, ON THE GO (Joshua, 2026-11-18; src/world/beltReload.ts): one gun at a time, the other
    // holstered; the empty goes back into the pouch the fresh clip came from. The table's RELOAD refills her pouches.
    // (her belt gear is asked for each time: a new outfit brings a new belt)
    const gearOf = (): BeltGear | null => (self as unknown as { gear?: BeltGear }).gear ?? null;
    const beltReload = new BeltReload(self, gearOf, tableUse, holsterUse);
    tableUse.pouchesLow = () => {
      const gear = gearOf();
      return !!gear && Array.from({ length: gear.pouches }, (_, i) => gear.pouchState(i)).some((state) => state !== 'full');
    };
    const ask = (): Ask => ({ walkTo: null, look: null, yaw: 0, lookAt: null });
    const toilet = new PopUpToilet();
    scene.add(toilet.root);
    return {
      self, motion, turn, turnInput: { view: 'third', look: null, move: null, hold: null, grip: false },
      tableUse, tableAsk: ask(),
      // THINGS TO TAKE HOLD OF (Joshua's step #4, 2026-11-18): the pole and the rail (src/world/grabBars.ts)
      grabUse: new GrabUse(bars, self), grabAsk: ask(),
      // (the door: opening it, holding its handle while she walks it open or shut, letting go)
      doorUse: new DoorUse(door, self), doorAsk: { ...ask(), pull: new THREE.Vector3() },
      holsterUse, holsterAsk: { lookAt: null }, beltReload, beltAsk: { lookAt: null }, gearOf,
      pace: new Pace(), burst: new BurstFire(), eating: { food: 0, water: 0, seconds: 0 }, aim: new THREE.Vector3(),
      wants: { walkTo: null, look: null, aimAt: null, fire: false, shots: 0 },
      state: freshState(),
      toilet,
    };
  };
  // BLAZE'S KIT (her stand-in follows her body through outfit changes: `blaze.body`, or the body just made)
  const blazeKit = makeKit(standIn(() => blaze?.body ?? bodyNow), START.x, START.z, START.yaw);
  // THE PLAYED ONE'S THINGS, under the names the rest of the game uses (pointed at the other kit by a swap: `pointAt`)
  let motion = blazeKit.motion, turn = blazeKit.turn, turnInput = blazeKit.turnInput;
  let tableUse = blazeKit.tableUse, tableAsk = blazeKit.tableAsk, grabUse = blazeKit.grabUse, grabAsk = blazeKit.grabAsk;
  let doorUse = blazeKit.doorUse, doorAsk = blazeKit.doorAsk, holsterUse = blazeKit.holsterUse, holsterAsk = blazeKit.holsterAsk;
  let beltReload = blazeKit.beltReload, beltAsk = blazeKit.beltAsk, gearNow = blazeKit.gearOf;
  let pace = blazeKit.pace, burst = blazeKit.burst, eating = blazeKit.eating;
  /** Point the game's names for the played one's things at this kit (a swap). */
  const pointAt = (k: Kit): void => {
    motion = k.motion; turn = k.turn; turnInput = k.turnInput;
    tableUse = k.tableUse; tableAsk = k.tableAsk; grabUse = k.grabUse; grabAsk = k.grabAsk;
    doorUse = k.doorUse; doorAsk = k.doorAsk; holsterUse = k.holsterUse; holsterAsk = k.holsterAsk;
    beltReload = k.beltReload; beltAsk = k.beltAsk; gearNow = k.gearOf;
    pace = k.pace; burst = k.burst; eating = k.eating;
  };
  /** The played one's kit (Blaze's until there is a swap). */
  const kitNow = (): Kit => playing?.kit ?? blazeKit;
  /** The OTHER character's kit (null without John). */
  const otherKitOf = (k: Kit): Kit | null => [blaze, john].find((c) => !!c && c.kit !== k)?.kit ?? null;
  /** THE WORLD'S THINGS, ONE AT A TIME: the table while the other is at it or has guns lying on it; a bar the other
   *  is at; the door while the other has it. */
  const tableTaken = (k: Kit): boolean => { const o = otherKitOf(k); return !!o && (o.tableUse.busy || o.tableUse.lies('left') || o.tableUse.lies('right')); };
  const barTaken = (k: Kit, bar: BarName): boolean => { const o = otherKitOf(k); return !!o && o.grabUse.busy && o.grabUse.bar === bar; };
  const doorTaken = (k: Kit): boolean => { const o = otherKitOf(k); return !!o && o.doorUse.active; };
  /** A door waiting for this hand's gun to go into its holster first. */
  let doorAfterHolster: Hand | null = null;
  /** A bar to take hold of once her guns are on the table (a hand with a gun in it puts it down first). */
  let grabAfterTable: BarName | null = null;
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
    // (the other one at the table, or their guns lying on it: it is theirs until they are done)
    if (!h || grabUse.busy || holsterUse.busy || tableUse.busy || beltReload.busy || tableTaken(kitNow())) return;
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
  // (what her turning is told each frame is in her kit: `turnInput`)
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
  // (her pace is in her kit: `pace`)
  // (THE PROLOGUE: the first one made is John, with his own vitals, never pregnant; he is in MANUAL, nothing to fight)
  if (prologue) graphics.autoFire = 'off';
  /**
   * THEIR TRAINING (Joshua approved the four upgrades, 2026-11-25): fitness and Endurance, Recovery, Strength, 0-100, from
   * Settings -> TEST TOOLS for both of them until they are earned (vitals/heroineVitals.ts VITALS_TUNING.training).
   */
  const trainVitals = (v: HeroineVitals): HeroineVitals => {
    v.fitness = graphics.trainFitness / 100; v.endurance = graphics.trainEndurance / 100;
    v.recovery = graphics.trainRecovery / 100; v.strength = graphics.trainStrength / 100;
    return v;
  };
  // (John's lungs and heart as his look keeps them: builder v0.9.76; hers are the female body's own)
  const johnBody: VitalsBodyOf = { ...JOHN_BODY, ...lungsOfSave((await import('./heroine/looks')).LOOKS.john.body) };
  let vitals = trainVitals(prologue ? new HeroineVitals(johnBody) : new HeroineVitals({ age: 28, weeks: heroine.weeks ?? 40 }));
  const firstOne: Character = { name: prologue ? 'John' : 'Blaze', body: bodyNow, vitals, kit: blazeKit, cam: null, autoFire: graphics.autoFire === 'on' ? 'on' : 'off', brain: null, port: null, needs: null, combat: null };
  if (prologue) john = firstOne; else blaze = firstOne;
  playing = firstOne;

  // ---- JOHN, made beside her (heroine/looks/john.ts: the builder's male body as Joshua saved him, in black and neon
  // green). Only as a fast body (Body: Performance); if he cannot be made, she plays on alone (no 🔄).
  // His vitals are his own and never pregnant: the builder's vitals are the same model for both bodies, its organs
  // laid to each (Char_B actor/maleOrgans.ts: his bladder and prostate, no womb). His age is a guess until the story
  // says (30).
  /** Why John could not be made, if he could not (shown in a notice once the HUD is up). */
  let johnFailed: string | null = null;
  if (!prologue && graphics.body === 'performance' && new URLSearchParams(location.search).get('john') !== 'off') {
    try {
      // (his fixed detail and nothing kept sharp, if they are set: JOHN_DETAIL above; everything else as Settings say)
      const his: HeroineSettings = johnSettings();
      // (the next heavy step, right after her live body: a pause before it, v0.2.151. Three of Joshua's five town starts
      //  on v0.2.150 were closed at "Loading John: unpacking his body…")
      await pauseBefore('John');
      const body = await createHeroine(renderer, scene, his, (text) => meter.step(text, text), 'john', true, johnParts());
      // (1.4 m to her RIGHT and a little behind her, facing the same way: her left is where the weapons table stands,
      //  and at first he was put right on it)
      const x = motion.x - 1.4 * Math.cos(turn.base) - 0.6 * Math.sin(turn.base), z = motion.z + 1.4 * Math.sin(turn.base) - 0.6 * Math.cos(turn.base);
      // (his own kit, on his own body: his movement, turning, holsters, belt, his use of the table, bars and door; his
      //  guns start holstered, as hers do)
      const kit = makeKit(standIn(() => john?.body ?? body), x, z, turn.base);
      // (he starts in MANUAL whatever hers is: standing by in AUTO he would draw and fire the moment the game opens;
      //  swapped to, AUTO is set for him, and kept)
      john = { name: 'John', body, vitals: trainVitals(new HeroineVitals(johnBody)), kit, cam: null, autoFire: 'off', brain: null, port: null, needs: null, combat: null };
      markStart('John made');
      if (island) body.setGround?.(island.standAt);
      body.setPosition(x, z, groundUnder(x, z));
      body.setYaw(turn.base);
      body.setSkinShine?.(skinOilyOf(graphics.skinShine));
      scene.add(body.root);
      applyShadows();
    } catch (error) {
      console.error('John could not be made; Blaze plays on alone.', error);
      john = null;
      // (said on screen too, once the HUD is up: v0.2.126 left him out without a word on Joshua's iPhone)
      johnFailed = error instanceof Error ? error.message : String(error);
    }
  }

  // HER PREGNANCY, to test (Joshua, 2026-11-19; heroine/pregnancyPlan.ts): on or off and her belly, from Settings (as
  // her look has them until changed), and the week off her own chart. In the story her belly moves by EVENTS, a percent
  // at a time (`stepBelly`, below; Joshua, 2026-11-24: the time lapse taken out).
  const { LOOKS: ALL_LOOKS } = await import('./heroine/looks');
  const plan = new PregnancyPlan((ALL_LOOKS[tableLook]?.body as { pregnancy?: unknown } | undefined)?.pregnancy);
  if (graphics.pregnant === null) graphics.pregnant = plan.lookPregnant ? 'on' : 'off';
  if (graphics.belly === null) graphics.belly = Math.round(heroine.bellyNow?.() ?? plan.start);
  /** Pregnancy is on in Settings (it is BLAZE's: her body, her vitals). */
  const herPregnant = (): boolean => graphics.pregnant === 'on';
  /** The one being PLAYED is pregnant: Blaze, with Pregnancy on (her crawl, her carrying, her week chip). */
  const pregnantNow = (): boolean => herPregnant() && playingBlaze();
  /** Blaze's body, whether or not she is played. */
  const herBody = (): GameHeroine => (blaze ? blaze.body : heroine);

  // HER STANCE (Joshua, 2026-11-20: "Walk while crouch, crawling on belly (however, once pregnancy is on, make her crawl
  // on all four with weapons holstered)"; heroine/fast/groundPose.ts). The CROUCH and PRONE buttons: CROUCH crouches or
  // stands her up; PRONE takes her down (on her belly, or on all fours whenever Pregnancy is on) or stands her up.
  // Down there she goes no faster than a crawl; on her belly she aims and fires only while still; on all fours her guns
  // are holstered, and still she may draw ONE (the other hand and both knees stay down), put away again before she moves.
  let stance: 'stand' | 'crouch' | 'down' = 'stand';
  const stanceAsked = (): 'stand' | 'crouch' | 'prone' | 'fours' => (stance === 'down' ? (pregnantNow() ? 'fours' : 'prone') : stance);
  /** She is on her belly or all fours (or getting there) and moving, or getting down or up: no aiming or firing. */
  let stanceNoAim = false;
  /** Her belly and pregnancy as Settings (or a story step) have them, on her body, her live body and her vitals. */
  const applyPregnancy = (): void => {
    // (Blaze's alone: in the prologue there is no Blaze, and nothing of hers is put on John)
    if (!blaze) return;
    const belly = graphics.belly ?? plan.start;
    // (always on BLAZE, whoever is played)
    herBody().setPregnant?.(herPregnant());
    herBody().setBelly(belly);
    (blaze?.vitals ?? vitals).setWeeks(herPregnant() ? plan.weekFor(belly) : 0);
  };
  applyPregnancy();
  /**
   * HER BELLY ONE STORY STEP (Joshua, 2026-11-24: "event/quest triggers that will add +1%"; "Also add an -1% after
   * birth so it is set up as well for later"): `by` +1 as she grows, -1 as she settles after the birth, kept to the
   * slider's range. THE ONE WAY a quest, an event or a chapter moves her belly (give it to the chapter's world, as the
   * prologue's is given its hooks), the same as the two test buttons in Settings -> PREGNANCY. Kept as her setting, so
   * it is where she was the next time the game starts. Returns her belly now.
   */
  const stepBelly = (by: number): number => {
    const belly = plan.stepBelly(graphics.belly ?? plan.start, by, graphics.bellyUnlocked);
    if (belly === graphics.belly) return belly;
    graphics.belly = belly;
    saveSetting('belly', belly);
    applyPregnancy();
    hud.showBelly(belly);
    return belly;
  };
  /** Her belly as Settings shows it: the percent and the week it stands for (or "not pregnant"). */
  const bellyText = (percent: number): string => herPregnant() ? `${percent}% · ${weekText(plan.weekFor(percent))}` : `${percent}% · not pregnant`;
  const vitalsPanel = new VitalsPanel();
  // (Settings -> HUD: the list or the gauges, and the units; both change while she plays)
  vitalsPanel.setStyle(graphics.vitalsStyle);
  vitalsPanel.setShown(graphics.vitalsShown);
  vitalsPanel.setUnits(graphics.units);
  /**
   * How deep the water is at her feet now (metres), and how wet her skin still is (1 soaked .. 0 dry): they cool her
   * (her vitals' temperature). Wet as long as her skin shows it (heroine/fast/skinShine.ts): fully for 2 minutes out
   * of the water, then drying over 30 s.
   */
  let waterDepthNow = 0, wetFor = Infinity;
  const WET_HOLD = 120, WET_DRY = 30;
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
  /**
   * WINDED IN FIRST PERSON, A LOOK SHE WAS ALREADY TURNING AS SHE RAN OUT (v0.2.177; Joshua, 2026-11-26: "Winded didn't
   * make the camera look down like it was supposed to"): steering with the camera stick or a drag as her stamina ran
   * out freed her bowed head the same moment it began, so she never looked down. That look is CARRIED (`windedCarry`)
   * and does nothing until it stops (the stick back at its middle, the finger lifted); a look after that frees her
   * head, as before. `windedWasOn`: whether she was bent over (first person) last frame.
   */
  let windedCarry = false, windedWasOn = false;
  /** (the prologue: where the camera looks, his eyes, and the shake's offset; kept for each frame) */
  const storyLook = new THREE.Vector3(), storyEye = new THREE.Vector3(), shakeBy = new THREE.Vector3();
  // (the prologue's flashlight: where his eyes are and look, and its lens, world)
  const lightEye = new THREE.Vector3(), lightTurn = new THREE.Quaternion(), lightLook = new THREE.Vector3(), lensAt = new THREE.Vector3();
  const busyView = { on: false, yaw: 0, pitch: 0, lookYaw: 0, lookPitch: 0, setYaw: 0, setPitch: 0, idle: 0, fromYaw: 0, fromPitch: 0, dragging: false, returnSeconds: 1.5 };
  // (her guns' bursts, src/world/burstFire.ts, are in her kit: `burst`)

  // THE CAMERA STYLE in third person (src/camera/cameraRig.ts; Joshua, 2026-11-18): the CAM button goes round them.
  // EVERY START OPENS ON FOLLOW (Joshua, 2026-11-24: "starting 3rd person view is following"), aimed by hand or not; the
  // CAM button's choice lasts until the game is closed. (It was kept on the phone, 'gdm.cameraStyle' and
  // 'gdm.cameraStyleManual', and aimed by hand it started over her shoulder.) Firing still brings the shoulder camera
  // for a moment (MANUAL_AIM_HOLD).
  let cameraStyle: CameraStyle = 'follow';
  let manualStyle: CameraStyle = 'follow';
  /** Seconds since FIRE was last held (aimed by hand: the camera stays over her shoulder this long after). */
  let sinceFire = Infinity;
  /** THE LOCK (step 1 of the frame): where she was a frame ago and that frame's length, how long she has been locked, and
   *  how long she has been held up while locked. */
  const lockRun = { x: 0, z: 0, dt: 0, for: 0, stuck: 0 };
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
  if (tunnel) {
    // the passage: the camera kept out of the rock (cameraRig.ts `keepClear`), looking along the passage at the start
    const t = tunnel;
    rig.keepClear = (from, to) => t.keepClear(from, to);
    rig.faceAtOnce(t.start.yaw);
  }
  /**
   * AIMED BY HAND: always in first person; in third person when auto-fire is off (Joshua, 2026-11-18: "so you could
   * also shoot in 3rd person... over the shoulder view and a simple cross hair"). Then the camera is over her
   * shoulder, she looks where it looks, and FIRE shoots at the crosshair.
   */
  // (Joshua, 2026-11-18: one setting for BOTH views, so she can be watched working on her own in either, or played)
  const aimedByHand = (): boolean => graphics.autoFire === 'off';
  /**
   * Her facing held to the camera's way now: third person MANUAL, backing up, nothing else running, and only while she
   * aims (FIRE held, and the shoulder camera's MANUAL_AIM_HOLD after it) or in a SIDE view. (At a walk it was held to
   * side-step too, until Joshua, 2026-11-20: "remove the side step... and just rotate head which will turn her".)
   * THE BODY A TANK, THE CAMERA ITS TURRET (Joshua, 2026-11-24: "allow the joystick direction to move relative to the
   * players camera so if the camera is facing North but has the joystick facing backwards, the player will face South
   * (180°), but if the player keeps holding the stick down, and pans the camera to face East, the player will be moving
   * West... treat the body like a tank, the camera like the turret, but the body if joystick is released, will rotate
   * (head first) back towards the camera direction"): otherwise, in third person, she no longer backs up: the stick
   * pulled back turns her round to go toward the camera, read against the camera every frame (`runningFree`); let go,
   * her head turns to where the camera looks and her body follows it (bodyTurn.ts), as it always did. Aiming she still
   * backs up facing her aim, and the side views, which turn with her, keep it too (pulled back there she would turn,
   * and the camera round to her other side with her).
   */
  const walkSides = (): boolean => rig.mode === 'third' && aimedByHand() && !busyNow() && backingUp()
    && (controls.fireHeld || sinceFire < MANUAL_AIM_HOLD || rig.style === 'sideLeft' || rig.style === 'sideRight');
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
  // (what she is eating or drinking now, still to go into her, and the seconds left to take it: her kit's `eating`)
  /** Seconds left squatting for the bathroom (her bladder is emptied when they run out). */
  let bathroomLeft = 0;
  // (Joshua, 2026-11-21: "change the time from 5s to 10s, someone rarely ever goes in 5s, lol"; then 2026-11-22: "food
  //  ends up being longer relieving oneself 🚽 (make it 12s), and the water 💧 quicker at 5s": how long is her vitals'
  //  say, `bathroomVisit`, and whether it is her bowels too, emptied as she gets up)
  /** This visit is her bowels too (her rectum emptied with her bladder as she gets up). */
  let bathroomBowels = false;
  /**
   * SHE CAN HOLD IT NO LONGER (Joshua, 2026-11-21: "once it gets to 85% full, will show an ETA until you will go
   * regardless of what's going on"): her bathroom bar is full, so she lets go of whatever she holds, puts her guns
   * away, stands, and goes where she is (step 5b below). True until she has started.
   */
  let mustGoNow = false;
  /**
   * A BATHROOM VISIT (Joshua, 2026-11-22: the pop-up toilet, and "food ... 12s, and the water 💧 quicker at 5s"): they
   * SIT on a toilet that grows in just behind them (src/world/toilet.ts; how they sit: heroine/fast/sitPose.ts), or, if
   * there is no room for one there (`toiletFits`), squat where they stand as before. Returns how long it all takes
   * (sitting down and getting up included) and whether it is their bowels too (emptied with their bladder at the end).
   * The played one's (`intake`) and the one standing by's (their brain's `squat`) are the same.
   */
  const startVisit = (k: Kit, body: GameHeroine, v: HeroineVitals): { seconds: number; bowels: boolean } => {
    const visit = v.bathroomVisit();
    const seat = body.seatFor && body.sitFor ? body.seatFor() : null;
    if (seat && toiletFits(k, seat.back)) {
      const yaw = k.turn.base, x = k.motion.x - Math.sin(yaw) * seat.back, z = k.motion.z - Math.cos(yaw) * seat.back;
      k.toilet.show(x, groundUnder(k.motion.x, k.motion.z), z, yaw, seat.top);
      body.sitFor!(visit.seconds);
      // (sitting down and getting up, SIT.seconds each, on either side of the visit itself)
      return { seconds: SIT.seconds + visit.seconds + SIT.seconds, bowels: visit.bowels };
    }
    body.squatFor?.(visit.seconds);
    return { seconds: visit.seconds, bowels: visit.bowels };
  };
  /**
   * IS THERE ROOM FOR A TOILET just behind them (`back` metres behind them is the point under their hips)? Not in the
   * water, not where the ground behind them is more than 10 cm above or below where they stand (a slope, a step), not
   * where a wall, a building, the dome, a tree's trunk or the tunnel's rock is in the way (the same walls that stop
   * them walking: from where they stand back to its tank's back, and across its width there), and not on top of the
   * other character.
   */
  const toiletFits = (k: Kit, back: number): boolean => {
    if (k === playing?.kit ? waterDepthNow > 0.05 : k.state.waterDepthNow > 0.05) return false;
    const yaw = k.turn.base, ax = Math.sin(yaw), az = Math.cos(yaw), lx = az, lz = -ax;   // (ahead, and her left)
    const x = k.motion.x, z = k.motion.z, floor = groundUnder(x, z);
    const hx = x - ax * back, hz = z - az * back, far = back + TOILET_SIZE.behind;
    const spots = [[hx, hz], [x - ax * far, z - az * far], [hx + lx * TOILET_SIZE.halfWidth, hz + lz * TOILET_SIZE.halfWidth], [hx - lx * TOILET_SIZE.halfWidth, hz - lz * TOILET_SIZE.halfWidth]];
    for (const [px, pz] of spots) { const g = groundUnder(px, pz); if (Number.isFinite(g) && Math.abs(g - floor) > 0.1) return false; }
    const stops = island ? island.walls : tunnel ? tunnel.walls : walls;
    if (stops) {
      const out = { x: 0, z: 0 };
      // (from where they stand, back to its tank's back; then from under their hips out to each side)
      const clear = (fromX: number, fromZ: number, toX: number, toZ: number): boolean => {
        stops.move(fromX, fromZ, toX - fromX, toZ - fromZ, out);
        return Math.hypot(out.x - toX, out.z - toZ) < 0.02;
      };
      if (!clear(x, z, x - ax * far, z - az * far)) return false;
      for (const side of [1, -1]) if (!clear(hx, hz, hx + lx * side * TOILET_SIZE.halfWidth, hz + lz * side * TOILET_SIZE.halfWidth)) return false;
    }
    const other = [blaze, john].find((c) => c && c.kit !== k);
    if (other && Math.hypot(other.kit.motion.x - hx, other.kit.motion.z - hz) < 0.6) return false;
    return true;
  };
  const intake = (action: IntakeAction) => {
    if (action === 'hungry') { vitals.setFoodBar(0.25); return; }
    if (action === 'thirsty') { vitals.setWaterBar(0.25); return; }
    if (action === 'needToGo') { vitals.setBladder(350); return; }
    // (her bowels at their urge, 200 mL of the builder's 300: the 🚽 then takes 12 s, not 5)
    if (action === 'needToGo2') { vitals.setRectum(200); return; }
    if (action === 'mustGo') { vitals.setBladder(520); return; }
    if (action === 'tired') { vitals.setEnergy(0.1); return; }
    // (SLEEP 8 HOURS, until there are beds: both of them sleep through it where they stand, and the clock jumps on 8
    //  hours; their stomachs empty, bladders fill and sleepiness goes, as a night would)
    if (action === 'sleep8') {
      for (const c of [blaze, john]) c?.vitals.passTime(8, true);
      clock.skip(8 * 3600);
      hud.setSkyHour(clock.hour);
      return;
    }
    if (action === 'bathroom') {
      const visit = startVisit(playing?.kit ?? blazeKit, heroine, vitals);
      bathroomLeft = visit.seconds; bathroomBowels = visit.bowels;
      return;
    }
    const portion = INTAKE[action];
    eating.food += portion.food;
    eating.water += portion.water;
    eating.seconds = Math.max(eating.seconds, 0) + portion.seconds;
  };

  const domeDebug = (action: DomeDebugAction) => {
    if (action === 'wet') { heroine.soakSkin?.(); wetFor = 0; return; }
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
    if (blaze) blaze.body = bodyNow;
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
  /** An outfit chosen in Settings while John was played: Blaze puts it on when she is played again (`swapCharacter`). */
  let outfitPending = false;
  /**
   * ONLY THE OUTFITS WORN NOW ARE KEPT ON THE PHONE (Joshua, 2026-11-22: "only John and Blaze's last saved outfit from
   * the PWA... it also clears the past outfit so if you did Shadow, the Pink and back to Shadow, when you returned to
   * shadow it would redownload and remove the pink"). The game only ever FETCHES the outfits being worn (her outfit
   * now and John's); the offline copy (sw.js, vite.config.ts `pwa()`) kept every outfit fetched since. This tells it
   * which outfit folders to keep: every other outfit's files are let go. Sent once she has played a few seconds
   * (`tellGameIsUp`) and after every change of outfit. (Only in the published game: there is no offline copy while
   * developing.)
   */
  const keepWornOutfits = (): void => {
    void Promise.all([import('./heroine/looks'), import('./heroine/looks/bakedAs')]).then(([{ lookKey }, { BAKED_AS }]) => {
      // (each outfit's files are in the folder it was BAKED as: a two-tone catsuit is drawn over another's bake)
      const hers = lookKey(outfitNow);
      const folders = [BAKED_AS[hers] ?? hers];
      if (john) folders.push('john');
      tellOfflineCopy({ type: 'gdm-keep-outfits', folders });
    }).catch(() => {});
  };
  wornOutfitsNow = keepWornOutfits;

  const changeOutfit = async (): Promise<void> => {
    // (her outfits are BLAZE's: chosen while John is played, she changes when she is swapped back to)
    if (!playingBlaze()) { outfitPending = true; hud.showNotice(blaze ? 'Blaze changes when you swap back to her' : 'Outfits are Blaze\'s: she is not in the prologue'); return; }
    if (outfitChanging) { outfitAgain = true; return; }
    outfitChanging = true;
    try {
      do { outfitAgain = false; await swapBody(); } while (outfitAgain);
      // (the outfit she had on is let go of on the phone too: only the outfits worn now are kept, `keepWornOutfits`)
      keepWornOutfits();
    } catch (error) {
      // (if anything went wrong part-way, the game starts again cleanly instead: she is never left half changed)
      console.error('The outfit could not be changed while playing; starting again with it.', error);
      restart();
    } finally { outfitChanging = false; }
  };

  /**
   * 🔄 SWAP CHARACTER (Joshua, 2026-11-21, as Beyond Extinction does it): the camera, the sticks and the vitals card go
   * to the other one, AT ONCE, whatever the one played is doing. EACH KEEPS THEIR WHOLE STATE (Step 1; Joshua: "Each
   * character should store the complete state on swap whether crouching, holding on to something, auto shooting"):
   * crouched or down they stay so, a bar or the door held stays held, guns in hand stay in hand, a reload or a walk to
   * the table carries on; their AUTO or MANUAL is their own. The one left is run by their brain (Step 2: their needs,
   * and in AUTO their fight); swapped back to, the player has them again at once (their brain lets go).
   */
  /** The played one's small values, written into their kit as they are swapped away. */
  const saveState = (s: KitState): void => {
    s.stance = stance; s.stanceNoAim = stanceNoAim; s.bathroomLeft = bathroomLeft; s.bathroomBowels = bathroomBowels; s.mustGoNow = mustGoNow;
    s.tableReloading = tableReloading; s.tableAfterDraw = tableAfterDraw; s.grabAfterHolster = grabAfterHolster;
    s.grabAfterTable = grabAfterTable; s.doorAfterHolster = doorAfterHolster; s.grabWhich = grabWhich;
    s.aimTarget = aimTarget; s.supporting = supporting; s.gait = gait; s.gaitResetLeft = gaitResetLeft;
    s.windedWeight = windedWeight; s.waterDepthNow = waterDepthNow; s.wetFor = wetFor;
    s.actionPitch = actionPitch; s.actionPitchWant = actionPitchWant; s.sinceFire = sinceFire; s.limits = limits;
    s.lastMoveX = lastMoveX; s.lastMoveY = lastMoveY;
  };
  /** ...and taken back up from their kit as they are swapped to. */
  const loadState = (s: KitState): void => {
    stance = s.stance; stanceNoAim = s.stanceNoAim; bathroomLeft = s.bathroomLeft; bathroomBowels = s.bathroomBowels; mustGoNow = s.mustGoNow;
    tableReloading = s.tableReloading; tableAfterDraw = s.tableAfterDraw; grabAfterHolster = s.grabAfterHolster;
    grabAfterTable = s.grabAfterTable; doorAfterHolster = s.doorAfterHolster; grabWhich = s.grabWhich;
    aimTarget = s.aimTarget; supporting = s.supporting; gait = s.gait; gaitResetLeft = s.gaitResetLeft;
    windedWeight = s.windedWeight; waterDepthNow = s.waterDepthNow; wetFor = s.wetFor;
    actionPitch = s.actionPitch; actionPitchWant = s.actionPitchWant; sinceFire = s.sinceFire; limits = s.limits;
    lastMoveX = s.lastMoveX; lastMoveY = s.lastMoveY;
  };
  const swapCharacter = (): void => {
    const from = playing, to = bystander();
    if (!from || !to || frozen || outfitChanging) return;
    // THE ONE LEFT keeps all they are doing: their kit has their things already; the small values are written in
    saveState(from.kit.state);
    // (and where the camera looked while they were played, to be looked again when they are played again)
    from.cam = { yaw: rig.yaw, pitch: rig.pitch, mode: rig.mode };
    from.autoFire = graphics.autoFire === 'on' ? 'on' : 'off';
    // (seen from outside now: their head shown again; no crab steps or belly holding, which the stick drove)
    from.body.setFirstPerson(false);
    from.body.setSideSteps?.(null);
    from.body.setBellySupport?.(false);
    // (the lock on the stick is the player's, not theirs: it does not go with them, or on to the next one)
    controls.autoRun = false;
    // (their brain has them from now: their needs, and in AUTO their fight; it starts from nothing wanted)
    Object.assign(from.kit.wants, { walkTo: null, look: null, aimAt: null, fire: false });
    from.brain?.setMode('ai');
    // THE ONE NOW PLAYED: the game's names point at their things, and their small values are taken back up
    playing = to;
    bodyNow = to.body;
    vitals = to.vitals;
    pointAt(to.kit);
    loadState(to.kit.state);
    // (their brain lets go at once, stopping whatever it was doing: the player has them)
    to.brain?.setMode('player');
    to.port?.stopFiring();
    graphics.autoFire = to.autoFire;
    busyView.on = false;
    // THE CAMERA LOOKS WHERE IT DID WHEN THEY WERE LAST PLAYED (Joshua, 2026-11-21: "they need to save and resume their
    // last camera position per character"), at once; the first time, the way they face. The tip only if it was in this
    // same view (first and third person tip from different starting points).
    if (to.cam) rig.faceAtOnce(to.cam.yaw, to.cam.mode === rig.mode ? to.cam.pitch : undefined);
    else rig.faceAtOnce(to.kit.turn.base);
    // (the one played takes the Detail chosen in Settings, John his fixed one; the one left follows the player's level
    //  by distance, or, while John's is fixed, keeps its own: Blaze her Settings choice, John his JOHN_DETAIL)
    to.body.setDetail?.(detailFor(to));
    if (JOHN_DETAIL !== null) from.body.setDetail?.(detailFor(from));
    otherDetail.reset();
    applyView();
    hud.setSwap(from.name);
    hud.showNotice(`Now playing: ${to.name}`);
    // (an outfit chosen for Blaze while John was played is put on her now)
    if (to === blaze && outfitPending) { outfitPending = false; void changeOutfit(); }
  };

  /**
   * THE TABLE FOR A KIT that is not the played one's (the brain's reload, Step 2): as `useTable` does for the player, a
   * holstered gun the action needs is drawn first. False if it cannot start (the table taken, hands busy).
   */
  const useTableFor = (k: Kit, which: 'both' | 'left' | 'right' | 'reload'): boolean => {
    const h = k.self.hands;
    if (!h || k.grabUse.busy || k.holsterUse.busy || k.tableUse.busy || k.beltReload.busy || tableTaken(k)) return false;
    const holding = h.hasGun('left') || h.hasGun('right');
    const draw = which === 'reload' ? k.holsterUse.holstered.left || k.holsterUse.holstered.right
      : which === 'both' ? !holding && !k.tableUse.lies('left') && !k.tableUse.lies('right') && (k.holsterUse.holstered.left || k.holsterUse.holstered.right)
      : k.holsterUse.holstered[which];
    if (!draw) { k.tableUse.start(which); return true; }
    if (which === 'left' || which === 'right') k.holsterUse.start(which); else k.holsterUse.drawAll();
    k.state.tableAfterDraw = which;
    return true;
  };
  /** How dangerous it is now, 0..1 (the dome's worst section, set each frame: step 5b): the brains read it. */
  let dangerNow = 0;

  /**
   * THEIR BRAIN (Step 2; src/npc/, ChatGPT's NPC brain fitted to this game): what it can reach of them (`ActorHooks`:
   * their own kit, body and vitals only), the port that carries out its orders, their needs (the bathroom, where they
   * stand), and their fight in AUTO. In 'player' mode while played: it does nothing.
   */
  const setUpBrain = (c: Character): void => {
    const k = c.kit;
    const hooks: ActorHooks = {
      actorId: c.name.toLowerCase(),
      wants: k.wants,
      position: () => ({ x: k.motion.x, z: k.motion.z }),
      needs: () => {
        const r = c.vitals.reading;
        return { food: r.food, water: r.water, energy: r.energy, bathroom: r.bathroom, health: r.health / 100 };
      },
      danger: () => dangerNow,
      locate: (id) => {
        if (id === 'self') return { x: k.motion.x, z: k.motion.z };
        if (id.startsWith('target:')) { const at = targets.position(Number(id.slice(7))); return { x: at.x, y: at.y, z: at.z }; }
        return null;
      },
      auto: () => c.autoFire === 'on',
      occupied: () => k.tableUse.busy || k.grabUse.busy || k.doorUse.active || k.state.bathroomLeft > 0 || k.state.windedWeight > 0
        || k.state.mustGoNow || k.state.tableAfterDraw !== null || k.state.stance === 'down',
      hasGun: (hand) => c.body.hands?.hasGun(hand) ?? false,
      holstered: (hand) => k.holsterUse.holstered[hand],
      rounds: (hand) => k.tableUse.rounds[hand],
      hasHolsters: () => k.holsterUse.hasHolsters,
      holsterBusy: () => k.holsterUse.busy,
      holsterAll: () => { if (!k.holsterUse.busy && !k.beltReload.busy) k.holsterUse.holsterAll(); },
      drawAll: () => { if (!k.holsterUse.busy && !k.beltReload.busy) k.holsterUse.drawAll(); },
      holsterOne: (hand) => { if (!k.holsterUse.busy && !k.beltReload.busy) k.holsterUse.start(hand); },
      startReload: () => {
        if (k.beltReload.busy || k.tableUse.busy) return true;
        if (k.beltReload.canStart) { k.beltReload.start(); return true; }
        return useTableFor(k, 'reload');
      },
      reloading: () => k.beltReload.busy || k.tableUse.busy || k.state.tableAfterDraw !== null,
      // (as long as their own visit takes: 12 s with their bowels, 5 s with their bladder only; vitals `bathroomVisit`)
      squat: () => { const v = startVisit(k, c.body, c.vitals); k.state.bathroomLeft = v.seconds; k.state.bathroomBowels = v.bowels; },
      squatting: () => k.state.bathroomLeft > 0,
    };
    const port = new GdmActorPort(hooks);
    const brain = new NpcBrain(port);
    c.port = port;
    c.brain = brain;
    c.needs = new NeedsRoutine(brain);
    // (the sky target in front of their shoulders, as the player's AUTO picks hers)
    c.combat = new AutoCombat(brain, port, hooks, () => `target:${targets.pick(k.motion.x, k.motion.z, k.turn.shoulders)}`);
    brain.setMode(c === playing ? 'player' : 'ai');
  };
  for (const c of [blaze, john]) if (c) setUpBrain(c);

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
    // HER BELLY A STORY STEP either way (the test buttons: what a quest or event does)
    onBellyStep(by) { stepBelly(by); },
    // GROUND COLOURS (TEST TOOLS, v0.2.166): live on the island, remembered on this phone (only the kinds changed)
    onGroundColour(kind, which, hex) {
      let saved: Record<string, [string, string]> = {};
      try { saved = JSON.parse(localStorage.getItem(GROUND_COLOURS_KEY) ?? '{}') as Record<string, [string, string]>; } catch { /* none */ }
      if (kind === null) {
        try { localStorage.removeItem(GROUND_COLOURS_KEY); } catch { /* nothing kept */ }
        for (const k of GROUND_KINDS) for (const w of [0, 1] as const) island?.setGroundColour(k, w, GROUND_COLOURS[k][w]);
        return;
      }
      const pair = saved[kind] ?? [...groundColoursNow()[kind]] as [string, string];
      pair[which] = hex;
      saved[kind] = pair;
      try { localStorage.setItem(GROUND_COLOURS_KEY, JSON.stringify(saved)); } catch { /* not remembered: nothing to do */ }
      island?.setGroundColour(kind, which, hex);
    },
    onGraphicsChange(key, value) {
      graphics[key] = value;
      saveSetting(key, value);
      // (her pregnancy and belly take hold at once)
      if (key === 'pregnant' || key === 'belly' || key === 'bellyUnlocked') {
        applyPregnancy();
        hud.showBelly(graphics.belly ?? plan.start);
        return;
      }
      // Detail, the target frame rate and sharpness take hold at once; a different body (or its skin) is a different
      // heroine, so the game starts again with it.
      // (the target frame rate and skin shine are EVERYONE'S, Blaze's and John's, played or standing by: Joshua,
      //  2026-11-21, "link up him to the same detail %"; before, only the one played took a change)
      // (Detail is the PLAYER'S: the one standing by follows the player's level by distance, otherDetail.ts)
      // (Blaze takes it whether she is played or standing by; John keeps his fixed level: JOHN_DETAIL)
      if (key === 'detail') { if (JOHN_DETAIL === null) heroine.setDetail?.(graphics.detail); else blaze?.body.setDetail?.(graphics.detail); }
      else if (key === 'targetFps') { for (const c of [blaze, john]) c?.body.setTargetFps?.(graphics.targetFps); }
      else if (key === 'sharpness') fit();
      // TEXTURE SIZES, while the game runs (core/textureSizes.ts): each picture of the kind changed is made again from
      // its file, one at a time; the shadow picture follows the world's (made again at its next drawing)
      else if (key === 'characterTextures' || key === 'worldTextures') {
        void setTextureCaps({ character: graphics.characterTextures, world: graphics.worldTextures });
        const size = shadowSizeFor(graphics.worldTextures);
        if (keyLight.shadow.mapSize.x !== size) {
          keyLight.shadow.mapSize.set(size, size);
          keyLight.shadow.map?.dispose();
          keyLight.shadow.map = null;
        }
      }
      else if (key === 'shadows') applyShadows();
      else if (key === 'fovThird' || key === 'fovFirst') rig.setFov(graphics.fovThird, graphics.fovFirst);
      else if (key === 'zoomThird') rig.setZoom(graphics.zoomThird);
      else if (key === 'tableHeight') tableUse.setHeight(graphics.tableHeight);
      // (Settings' AUTO is the played one's own, as the button is)
      else if (key === 'autoFire') { if (playing) playing.autoFire = graphics.autoFire === 'on' ? 'on' : 'off'; applyView(); }
      else if (key === 'skinShine') { for (const c of [blaze, john]) c?.body.setSkinShine?.(skinOilyOf(graphics.skinShine)); }
      else if (key === 'trainFitness' || key === 'trainEndurance' || key === 'trainRecovery' || key === 'trainStrength') { for (const c of [blaze, john]) if (c) trainVitals(c.vitals); }
      // (sound: the master at once; her breathing's own is read every frame, `playBreaths`)
      else if (key === 'soundVolume') sound.setVolume(graphics.soundVolume / 100);
      else if (key === 'breathVolume') { /* live: read every frame */ }
      else if (key === 'vitalsStyle') vitalsPanel.setStyle(graphics.vitalsStyle);
      else if (key === 'vitalsShown') vitalsPanel.setShown(graphics.vitalsShown);
      else if (key === 'units') vitalsPanel.setUnits(graphics.units);
      else if (key === 'landscaping') island?.setLandscaping(graphics.landscaping); // (live; nothing on the town map)
      else if (key === 'ground') island?.setGround(graphics.ground); // (live: groundPaint.ts)
      // (the sky: live. Back to the picture, the lights go back to the island's own daytime light)
      else if (key === 'sky') { island?.setSkyMode(graphics.sky); if (graphics.sky === 'picture') dayLight(); }
      else if (key === 'skyHour') clock.setHour(graphics.skyHour);
      else if (key === 'gameSpeed') clock.speed = graphics.gameSpeed;
      else if (key === 'skyEvent' || key === 'clouds') { /* live: read every frame (stepSky) */ }
      // (the first-person eye's place is read every frame: nothing more to do. They used to fall through to a restart.)
      else if (key === 'eyeForward' || key === 'eyeHigher' || key === 'lookSensitivity' || key === 'moveSensitivity' || key === 'paceCap') { /* live: read every frame */ }
      // (her outfit, and the choices that make her a different body of the same kind, change while the game runs)
      else if (OUTFIT_CHANGE_KEYS.includes(key)) void changeOutfit();
      else restart();
    },
    onToggleView: toggleView,
    onCameraStyle: () => {
      if (aimedByHand()) {
        // (aimed by hand: its own few styles)
        manualStyle = MANUAL_CAMERA_STYLES[(MANUAL_CAMERA_STYLES.indexOf(manualStyle) + 1) % MANUAL_CAMERA_STYLES.length];
      } else {
        cameraStyle = CAMERA_STYLES[(CAMERA_STYLES.indexOf(cameraStyle) + 1) % CAMERA_STYLES.length];
      }
      applyView();
    },
    onDomeDebug: domeDebug,
    onIntake: intake,
    // (the 🚽: she goes as she does when she must, so her guns are put away first and nothing is left in her hands for the
    //  seat: step 5b of the frame, `mustGoNow`)
    onBathroom: () => { if (bathroomLeft <= 0) mustGoNow = true; },
    onSwap: () => swapCharacter(),
    // 🔦 LIGHT (the prologue): the flashlight off or on (not while the story holds him still, in the opening's dark)
    onLight: () => {
      if (!flashlight || story?.locked) return;
      flashlight.set(!flashlight.on);
      caveSounds?.click();
      hud.setLight(flashlight.on);
    },
    // THE PROMPT: the table's PUT DOWN / PICK UP when she is near it, else a bar's GRAB / LET GO (see promptFor);
    // in the prologue, the story's own (SCAN, near markings: story/storyDirector.ts)
    onPrompt: (which) => {
      if (promptIs === 'story') story?.act();
      else if (promptIs === 'table') useTable(which);
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
      // (it is the PLAYED one's own: each keeps theirs through a swap, Joshua: "Each one should work auto independently")
      if (playing) playing.autoFire = graphics.autoFire === 'on' ? 'on' : 'off';
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
  // (🔄 shows once there is someone to swap to: John, made beside her; none in the prologue, where he is alone)
  hud.setSwap(bystander()?.name ?? null);
  // (the prologue: no guns' buttons, and the flashlight's; the story's top layer over the controls)
  if (prologue) { hud.setStoryMode(true); hud.setLight(false); story?.overlay.liftAbove(); }
  if (johnFailed) hud.showNotice(`John couldn't load: ${johnFailed.slice(0, 60)}`, 8);
  onGlTrouble((line) => hud.showNotice(line, 12));
  /** Take hold of the bar she is near (with both hands, or the one picked with L or R), or let go of the one she holds. */
  function grabBar(which: 'both' | Hand = 'both'): void {
    {
      if (grabUse.holding) { grabUse.letGo(); return; }
      if (busyNow() || holsterUse.busy || beltReload.busy) return;
      const bar = grabUse.nearest(motion.x, motion.z).bar;
      if (barTaken(kitNow(), bar)) return;   // (the other one is at it)
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
  let promptIs: 'table' | 'grab' | 'door' | 'story' | null = null;
  /** She is side-stepping this frame (crab steps: her stamina pays a little more per metre). */
  let sideStepping = false;
  /** Open the door she is near (the hand at the handle's side, or the one picked), or let go of it. */
  function useDoor(which: 'both' | Hand): void {
    if (doorUse.holding) { doorUse.letGo(); return; }
    if (busyNow() || holsterUse.busy || beltReload.busy || doorUse.active || doorTaken(kitNow())) return;
    const hand = doorUse.handTo(motion.x, motion.z, which);
    // (that hand must be empty: its gun goes into its holster first, then she goes to the door)
    if (heroine.hands?.hasGun(hand) && holsterUse.hasHolsters) { holsterUse.start(hand); doorAfterHolster = hand; }
    else if (!heroine.hands?.hasGun(hand)) doorUse.start(motion.x, motion.z, hand);
  }

  hud.topSlot().appendChild(vitalsPanel.element);
  // EVERY START IS IN FIRST PERSON (Joshua, 2026-11-24: "The starting default view is 1st person"); the 1st/3rd button
  // goes to third person, which opens on Follow (above). `?view=third` starts in third person, for test pages.
  if (new URLSearchParams(location.search).get('view') !== 'third') rig.setMode('first');
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
  const fitSize = new THREE.Vector2();
  const fit = () => {
    // (upright, the game is hidden behind the cover: its picture keeps its landscape shape and is not resized for
    //  nothing. Opened upright, it has no landscape shape yet: it is given the upright screen's turned on its side.)
    if (isUpright() && fitted) return;
    const width = isUpright() ? host.clientHeight : host.clientWidth;
    const height = isUpright() ? host.clientWidth : host.clientHeight;
    fitted = true;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, graphics.sharpness);
    // ONCE, AND ONLY WHAT CHANGED (v0.2.148): three.js's setPixelRatio sets the size again itself, so every re-fit
    // rebuilt the drawing surface TWICE (measured: two in the same millisecond), and a re-fit to the same size rebuilt
    // it for nothing (setting a canvas's size, even to the size it has, makes a new one)
    // (size and sharpness set together, once: three.js's setDrawingBufferSize; its page size is the stage's own)
    const was = renderer.getSize(fitSize);
    if (was.x !== width || was.y !== height || renderer.getPixelRatio() !== pixelRatio) renderer.setDrawingBufferSize(width, height, pixelRatio);
    sky?.setPixelRatio(pixelRatio);
    rig.resize(width, height);
  };
  onStageResize(fit); // the stage tells us when the screen was turned or resized
  fit();

  if (debug) {
    // Lets the browser console (and test scripts) reach the parts of the game.
    // (the played one's things are read when asked: a swap points them at the other one's kit)
    (window as unknown as Record<string, unknown>).gdm = { cast: () => ({ blaze, john, playing }), swap: () => swapCharacter(), renderer, scene, dome, city, heroine, rig, controls, targets, walls, table, bars, door, island, plan, hud, intake, vitalsPanel, tunnel, story, flashlight, flashProp, groundArrows, miniMap,
      get motion() { return motion; }, get turn() { return turn; }, get pace() { return pace; }, get vitals() { return vitals; },
      // (the game's own clock, seconds of play: for test pages that time things in game time, not the browser's)
      get elapsed() { return elapsed; },
      // (her belly a story step, as a quest would: gdm.stepBelly(1), gdm.stepBelly(-1))
      stepBelly,
      // (the procedural sky for test pages: gdm.sky({ hour: 19, event: 'aurora', speed: 0, clouds: 'on' }); the moment now)
      sky(patch: { hour?: number; event?: SkyEvent; speed?: number; clouds?: 'on' | 'off' } = {}) {
        if (patch.hour !== undefined) clock.setHour(graphics.skyHour = patch.hour);
        if (patch.event) graphics.skyEvent = patch.event;
        if (patch.speed !== undefined) clock.speed = graphics.gameSpeed = patch.speed;
        if (patch.clouds) graphics.clouds = patch.clouds;
        return { hour: clock.hour, event: graphics.skyEvent, night: environment.night, key: environment.keyIntensity };
      },
      // (the game clock: gdm.clock.speed = 600, gdm.clock.setHour(22), gdm.clock.text)
      get clock() { return clock; },
      get tableUse() { return tableUse; }, get grabUse() { return grabUse; }, get holsterUse() { return holsterUse; },
      get beltReload() { return beltReload; }, get doorUse() { return doorUse; },
      // (each one's brain: what it is doing and what it has done, for the test pages)
      brain: (name: 'blaze' | 'john') => { const c = name === 'john' ? john : blaze; return c?.brain ? { ...c.brain.inspect(), events: c.brain.events.slice(-8) } : null; },
      kitOf: (name: 'blaze' | 'john') => (name === 'john' ? john : blaze)?.kit ?? null,
      // (her breathing, heard: whether the sound is running, and what each breather has played)
      breathing: () => ({ sound: sound.context?.state ?? 'none', who: [...breaths].map(([c, b]) => ({ name: c.name, ...b.stats() })) }),
      // (her vitals' tuning, for test pages to try numbers live: e.g. gdm.vitalsTuning.effort.riseSeconds = 4)
      vitalsTuning: VITALS_TUNING,
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
  // HER BREATHING, LOADED WITH EVERYTHING ELSE (Joshua, 2026-11-22: "load the audio on start… don't wait until after in
  // the game… that doesn't make sense"): the sound is made and her breathing files fetched and decoded (one at a time)
  // as a step of the load, so she is heard from her first breath. (v0.2.143 had them wait until 12 s into play.)
  const voices = Object.entries(BREATH_VOICES).filter(([name]) => [blaze, john].some((c) => c?.name === name)).map(([, voice]) => voice);
  // (none in the prologue: John has no breathing files yet)
  if (voices.length && sound.start()) {
    meter.step('breathing', 'Loading her breathing…');
    // (never a reason not to start: given 20 s at most, after which the files go on loading in play)
    await Promise.race([Promise.all(voices.map((voice) => loadBreathVoice(sound, voice, __APP_VERSION__))), new Promise((enough) => setTimeout(enough, 20000))]);
  }
  // TURNED UPRIGHT WHILE LOADING (v0.2.148): the downloading and building above carried on behind the cover, but the
  // picture is got ready and drawn (everything still to go up to the graphics chip) only once it is on its side
  // again. The meter's clock stands still meanwhile.
  if (isUpright()) {
    meter.hold();
    meter.step('turn', 'Turn your phone on its side to carry on');
    await whenOnItsSide(stage);
    meter.release();
  }
  // (getting the picture ready and drawing the first one are the last heavy steps: a pause before each, v0.2.151)
  await pauseBefore('getting the picture ready');
  meter.step('picture', 'Getting the picture ready…');
  try {
    // (never waited on for more than 5 seconds, and never a reason not to start: it is only a head start)
    await Promise.race([renderer.compileAsync(scene, rig.camera), new Promise((enough) => setTimeout(enough, 5000))]);
  } catch (error) {
    console.warn('The materials could not be got ready ahead of time; the first picture does it instead.', error);
  }
  await pauseBefore('the first picture');
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
  /** THE START LOG past loading (core/startupLog.ts): when play began, and which marks of it are written down. */
  let playingSince = 0, framesPlayed = 0, marked5 = false, marked30 = false;
  const beginPlaying = (): void => {
    playingSince = performance.now();
    markStart('playing');
    // THE ISLAND'S OTHER TILES, ITS WATER AND ITS FOREST come in now, one at a time (v0.2.150; Joshua, 2026-11-22: "the
    // rest actually in the game not before"): before play only the tile under her was loaded
    island?.startStreaming();
    // THE PROLOGUE'S STORY begins with the first frame of play (story/chapters/johnPrologue.ts)
    if (story && tunnel && flashlight && caveSounds) {
      const world: PrologueWorld = {
        tunnel, flashlight, sounds: caveSounds,
        progress: () => prologueProgress,
        playAgain: () => restartGame(),
      };
      const director = story;
      void import('./story/chapters/johnPrologue').then(({ playBeneathTheIsland }) => playBeneathTheIsland(director, world))
        .catch((error) => console.error('The prologue\'s story stopped:', error));
    }
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

  /** How far along a pregnancy slows a body (0 not pregnant .. 1 full term): Blaze's, by her belly now. */
  const carryingOf = (c: Character): number => c !== blaze || !herPregnant() ? 0
    : Math.max(0, Math.min(1, ((c.body.bellyNow?.() ?? 100) - PREGNANCY_ARC.firstBump) / (PREGNANCY_ARC.fullTermBump - PREGNANCY_ARC.firstBump)));
  /**
   * THE ONE STANDING BY, EACH FRAME (Step 1 and Step 2). What they were doing carries on with their own kit (a walk to
   * the table, a holster or a draw, a reload from their belt, a bar or the door held), their stance and a winded bend
   * hold, and their BRAIN, not the player's stick, says what else: their needs, and in AUTO their fight (src/npc/). The
   * same systems the player's frame uses, without the camera, the HUD or the stick; in the same order.
   */
  const stepStandingBy = (c: Character, dt: number, threat: number): void => {
    const k = c.kit, s = k.state, m = k.motion, body = c.body;
    // 1. THEIR BRAIN decides: their needs first, then in AUTO their fight; its orders say what it wants (k.wants)
    c.needs?.tick(dt);
    c.combat?.tick(dt);
    c.brain?.tick(dt);
    // 2. WHAT THEY WERE DOING CARRIES ON (each with its own walk and its own hands)
    k.tableAsk.yaw = k.turn.base;
    k.tableUse.update(dt, m.x, m.z, k.tableAsk);
    k.grabAsk.yaw = k.turn.base;
    k.grabUse.update(dt, m.x, m.z, k.grabAsk);
    k.doorAsk.yaw = k.turn.base;
    k.doorUse.update(dt, m.x, m.z, k.doorAsk);
    if (s.doorAfterHolster && !k.holsterUse.busy) { k.doorUse.start(m.x, m.z, s.doorAfterHolster); s.doorAfterHolster = null; }
    k.holsterUse.update(dt, k.holsterAsk);
    k.beltReload.update(dt, k.beltAsk);
    // (the table's reload has ended: their pouches are full again)
    if (s.tableReloading && k.tableUse.action !== 'reload') { const gear = k.gearOf(); gear?.setClips(gear.pouches); }
    s.tableReloading = k.tableUse.action === 'reload';
    if (s.tableAfterDraw && !k.holsterUse.busy) { const which = s.tableAfterDraw; s.tableAfterDraw = null; k.tableUse.start(which); }
    if (s.grabAfterHolster && !k.holsterUse.busy) { k.grabUse.start(s.grabAfterHolster, s.grabWhich); s.grabAfterHolster = null; }
    if (s.grabAfterTable && !k.tableUse.busy) { k.grabUse.start(s.grabAfterTable, s.grabWhich); s.grabAfterTable = null; }
    const busy = k.tableUse.busy || k.grabUse.busy || k.doorUse.busy;
    // (kicks, as for the one played: busy holding something, holstering, drawing, reloading or firing; relaxed with
    //  nowhere to walk; balanced walking)
    body.setKickMood?.(busy || k.holsterUse.busy || k.beltReload.busy || k.wants.fire ? 'busy' : k.wants.walkTo ? 'balanced' : 'relaxed');
    // 3. THEIR STANCE, as they were left (they stand up for the table, a bar, a door or the bathroom)
    if ((busy || s.mustGoNow || s.bathroomLeft > 0) && s.stance !== 'stand') s.stance = 'stand';
    body.setStance?.(s.stance === 'down' ? (c === blaze && herPregnant() ? 'fours' : 'prone') : s.stance);
    // 4. WALKING: what they are doing walks them (to the table, a bar), else their brain's walk, at a walk; their pace's
    //    winded hold runs down meanwhile, as it does for the player standing still
    const ask = k.tableUse.busy ? k.tableAsk : k.grabUse.busy ? k.grabAsk : k.doorAsk;
    const walkTo = busy ? ask.walkTo : k.wants.walkTo && s.bathroomLeft <= 0 && s.stance === 'stand' ? k.wants.walkTo : null;
    k.pace.carrying = carryingOf(c);
    k.pace.step(dt, 0, s.limits);
    if (walkTo) {
      const away = Math.hypot(walkTo.x - m.x, walkTo.z - m.z), toward = Math.atan2(walkTo.x - m.x, walkTo.z - m.z);
      m.update(dt, 0, 1, toward, dt > 0 ? Math.min(k.pace.paceSpeed(0), away / dt) : 0);
    } else m.update(dt, 0, 0, k.turn.base, 0);
    // (the door: holding it they stay on its rail; otherwise it is solid to them too)
    const radius = doorBodyRadius(body.hands?.bellyAhead() ?? 0, k.doorUse.holding);
    if (k.doorUse.holding) k.doorUse.keepOnRail(m, k.doorAsk.pull, radius);
    else if (door.keepOut(m.x, m.z, radius, doorOut)) { m.x = doorOut.x; m.z = doorOut.z; }
    // (winded: bent over until their breath has calmed, as the player is)
    const left = k.pace.holdLeft, rise = PACE_TUNING.windedRiseSeconds;
    s.windedWeight = left > 0 ? Math.min(1, k.pace.windedFor / WINDED_IN) * (k.pace.riseLeft >= 0 ? Math.min(1, k.pace.riseLeft / rise) : 1) : 0;
    body.setWinded?.(s.windedWeight, k.pace.windedCalm);
    // 5. WHICH WAY THEY FACE: what they are doing looks where it needs (the table, the bar); else where their brain looks
    //    (the target it fires at); else as they were. Holding the door they keep facing it.
    const ti = k.turnInput;
    ti.view = 'third';
    ti.move = m.heading;
    ti.look = ask.look ?? (busy ? null : k.wants.look);
    // (sitting on their toilet: square to it, their head alone looking round)
    ti.hold = k.doorUse.faceYaw() ?? (k.toilet.inUse ? k.toilet.yaw : null);
    ti.grip = k.toilet.inUse;
    k.turn.step(dt, ti);
    k.turn.headPitch = 0;
    // 6. AIM AND FIRE (their brain's fire order, in AUTO): in bursts, with their own guns' rounds; each shot a streak
    const noAim = busy || s.windedWeight > 0 || s.bathroomLeft > 0 || s.stance === 'down';
    const at = k.wants.aimAt;
    const aiming = !noAim && !!at && k.turn.aimed;
    if (aiming && at) body.aimAt(k.aim.set(at.x, at.y ?? 0, at.z)); else body.aimAt(null);
    let fired = false;
    k.burst.update(dt, aiming && k.wants.fire,
      (hand) => (body.hands?.hasGun(hand) ?? true) && k.tableUse.rounds[hand] > 0 && !k.holsterUse.handBusy(hand) && !k.beltReload.handBusy(hand),
      (hand) => {
        body.fire(hand);
        tracers.fire(body.muzzle(hand, muzzle), k.aim);
        k.tableUse.rounds[hand]--;
        k.wants.shots++;
        fired = true;
      });
    // 7. THE BATHROOM (their brain squats them where they stand: src/npc/gdmPort.ts): their bladder emptied as it ends
    if (s.bathroomLeft > 0) { s.bathroomLeft -= dt; if (s.bathroomLeft <= 0) { c.vitals.relieve(s.bathroomBowels); k.toilet.hide(); } }
    // (anything they were eating or drinking when swapped away still goes in, evenly over its seconds)
    const e = k.eating;
    if (e.seconds > 0) {
      const share = Math.min(1, dt / e.seconds), food = e.food * share, water = e.water * share;
      c.vitals.consume(food, water);
      e.food -= food; e.water -= water; e.seconds -= dt;
      if (e.seconds <= 0) { e.food = 0; e.water = 0; e.seconds = 0; }
    }
    // 8. THEIR BODY: where they stand, on the ground under them, wet as deep as the water at their feet
    const feetY = groundUnder(m.x, m.z);
    body.setPosition(m.x, m.z, feetY);
    if (island) {
      const groundY = island.groundAt(m.x, m.z), surface = Math.max(island.waterAt(m.x, m.z) ?? -Infinity, island.seaLevel);
      s.waterDepthNow = Number.isFinite(groundY) ? Math.max(0, surface - groundY) : 0;
      body.setWaterDepth?.(s.waterDepthNow);
    }
    body.setYaw(body.setFacing ? k.turn.base : k.turn.head);
    body.setWalk(m.speed);
    body.update(info);
    // HIS OR HER DETAIL (heroine/fast/otherDetail.ts): the player's own level within 20 m on a phone, then stepped down
    // (NOT while John's detail is fixed, JOHN_DETAIL: John keeps his, and Blaze standing by keeps her own Detail)
    const playerDetail = heroine.stats?.().detail;
    if (playerDetail !== undefined && JOHN_DETAIL === null) {
      const level = otherDetail.update(dt, playerDetail, Math.hypot(m.x - motion.x, m.z - motion.z));
      if (level !== null) body.setDetail?.(level);
    }
    // 9. THEIR VITALS: what they just did moves them on (walking, firing, the danger); their body breathes by them
    s.wetFor = s.waterDepthNow > 0.02 ? 0 : s.wetFor + dt;
    const wet = s.wetFor <= WET_HOLD ? 1 : Math.max(0, 1 - (s.wetFor - WET_HOLD) / WET_DRY);
    c.vitals.step(dt, { speed: m.speed, firing: fired, threat, ground: island ? { x: m.x, z: m.z, y: island.groundAt(m.x, m.z) } : undefined, waterDepth: s.waterDepthNow, wet });
    body.setVitals?.(c.vitals.reading);
    s.limits = c.vitals.reading;
  };

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
    // (the start log: the first frames of play, then 5 and 30 s; at 30 s this start counts as one that worked)
    if (playingSince > 0 && !marked30) {
      framesPlayed++;
      if (framesPlayed === 1 || framesPlayed === 5 || framesPlayed === 30) markStart(`frame ${framesPlayed}`);
      if (!marked5 && now - playingSince > 5000) { marked5 = true; markStart('5 s'); }
      if (now - playingSince > 30000) { marked30 = true; markStart(START_SURVIVED); }
    }
    // PAUSED: no time passes. `last` is kept at "now", so when the game resumes it carries on from this instant
    // and does not try to catch up (nothing jumps). Anything dragged or clicked meanwhile is thrown away. The
    // still picture is drawn again only when it is wanted (after the screen changed size, and now and then).
    if (pause?.paused) {
      last = now;
      wasPaused = true;
      sound.setPaused(true);   // (the sound stops with the game, and carries on with it)
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
      sound.setPaused(true);
      controls.takeLookX(); controls.takeLookY(); controls.takeZoom(); controls.takeClicks();
      return;
    }
    if (wasPaused) { wasPaused = false; heroine.resumed?.(); sound.setPaused(false); }
    // ---- (the game, as before) ---------------------------------------------------------------------------------

    const dt = document.hidden ? 0 : Math.min(MAX_STEP, Math.max(0, (now - last) / 1000));
    const realDt = (now - last) / 1000;
    last = now;
    elapsed += dt;
    // THE GAME CLOCK moves on by this frame's real seconds at its speed, and both characters' slow clocks with it
    // (their gut, sleepiness and sleep: game hours per real second; 0 while it is stopped)
    clock.advance(dt);
    for (const c of [blaze, john]) if (c) c.vitals.gameHoursPerSecond = clock.hoursPerRealSecond;
    info.dt = dt;
    info.elapsed = elapsed;

    // 1. What is the player doing? (with the player's sensitivities: Settings -> CAMERA)
    controls.moveScale = graphics.moveSensitivity / 100;
    rig.lookScale = graphics.lookSensitivity / 100;
    controls.sample();
    // THE LOCK (v0.2.170; Controls `autoRun`, the MOVE stick's lane in hud.ts): she runs ahead by herself until a
    // clear push ahead or back on the stick (Controls), or until here: she is WINDED (out of stamina, as she stops
    // anyway: Joshua, "Stop like normal when out of stamina"), BUSY (the table, a bar, the door), going to the toilet or
    // must go, DOWN (prone or all fours), or BLOCKED (a wall, a tree, deep water: barely moving for LOCK_STUCK_SECONDS
    // once she has had LOCK_START_SECONDS to get going). Where she goes is where the camera looks (as the stick is held
    // full ahead: first person her head is the camera; third person ahead of the camera).
    {
      // (how fast she really went last frame, over the ground: the walls and water hold her where the stick does not)
      const ran = lockRun.dt > 0 ? Math.hypot(motion.x - lockRun.x, motion.z - lockRun.z) / lockRun.dt : 0;
      lockRun.x = motion.x; lockRun.z = motion.z; lockRun.dt = dt;
      if (controls.autoRun) {
        lockRun.for += dt;
        lockRun.stuck = lockRun.for > LOCK_START_SECONDS && ran < LOCK_STUCK_SPEED ? lockRun.stuck + dt : 0;
        const stop = pace.holdLeft > 0 || busyNow() || doorUse.holding || mustGoNow || bathroomLeft > 0 || stance === 'down'
          || lockRun.stuck > LOCK_STUCK_SECONDS;
        if (stop) { controls.autoRun = false; controls.sample(); }
      } else { lockRun.for = 0; lockRun.stuck = 0; }
    }
    // Looking around: a drag on the picture, plus the camera stick (first person). The stick's push is squared
    // (keeping its sign) so a small push aims finely and a full push turns quickly.
    const stickLookX = controls.lookStickX * Math.abs(controls.lookStickX) * LOOK_STICK_SPEED * dt;   // (rig.lookScale turns these as it does a drag)
    const stickLookY = controls.lookStickY * Math.abs(controls.lookStickY) * LOOK_STICK_SPEED * dt;
    const lookX = controls.takeLookX() + stickLookX, lookY = controls.takeLookY() - stickLookY;
    // (winded in first person: a look already going on as she bent over is carried, and does nothing, until it stops:
    //  `windedCarry`; last frame's bend, as this frame's is worked out further on)
    {
      const windedOn = windedWeight > 0 && rig.mode === 'first';
      const turning = lookX !== 0 || lookY !== 0;
      if (windedOn && !windedWasOn) windedCarry = turning;
      if (!turning || !windedOn) windedCarry = false;
      windedWasOn = windedOn;
    }
    if (!windedCarry) rig.applyLook(lookX, lookY); // stick up looks up
    // (the player turned the view this frame: a look of hers laid over it gives way: see the belly glance below)
    const looked = !windedCarry && (lookX !== 0 || lookY !== 0);
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
    // (THE TOP PACE chosen over the MOVE stick: the stick builds up to it and no further, whoever is played)
    pace.ceiling = graphics.paceCap;
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
      if ((busyNow() || mustGoNow || bathroomLeft > 0) && stance !== 'stand') stance = 'stand';
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
      // (squatting for the bathroom: she stays where she is, and does not aim or fire)
      if (bathroomLeft > 0) { pace.speedMost = 0; stanceNoAim = true; }
      // (the story holding him still: the prologue's opening, in the dark)
      if (story?.locked) { pace.speedMost = 0; stanceNoAim = true; }
      // (going down on all fours: both guns are put away first, on the way down)
      if (st && st.asked === 'fours' && st.down < 1 && !holsterUse.busy && !beltReload.busy) holsterUse.holsterAll();
      hud.setStance(stanceAsked(), pregnantNow());
      // (the camera comes down with her)
      rig.lower = !st ? 0 : st.stance === 'prone' || st.asked === 'prone' ? 1.25 * Math.max(st.down, 0.35) : st.stance === 'fours' || st.asked === 'fours' ? 0.95 * Math.max(st.down, 0.4) : 0.45 * st.crouch;
    }
    // WINDED (Joshua, 2026-11-20: "she bends her torso forward about 35 degrees, bends her knees a little bit, and places
    // both hands... just above her knees... after that, she will stand back up to normal and ready to move again"): all
    // through her pace's winded hold (input/pace.ts: until her breathing is down to 28 a minute, 5-20 s) she is bent
    // over, eased in over WINDED_IN and straightened up over the 1.5 s after; no aiming or firing while bent over (her
    // hands are on her knees). How far her breathing has calmed goes with it: her look round lifts as it does (third
    // person: fastHeroine.ts `windedLook`).
    {
      const left = pace.holdLeft, rise = PACE_TUNING.windedRiseSeconds;
      windedWeight = left > 0 ? Math.min(1, pace.windedFor / WINDED_IN) * (pace.riseLeft >= 0 ? Math.min(1, pace.riseLeft / rise) : 1) : 0;
      heroine.setWinded?.(windedWeight, pace.windedCalm);
      if (left > 0) stanceNoAim = true;
    }
    // HER HANDS TO HER BELLY (heroine/fast/bellyTouch.ts): holding it up from a run (past 30 weeks); and whether she may
    // start a look down at a kick (not while firing or just after, not running)
    {
      supporting = supporting ? pace.level > SUPPORT_OFF_LEVEL : pace.level >= SUPPORT_ON_LEVEL;
      const week = pregnantNow() ? plan.weekFor(heroine.bellyNow?.() ?? graphics.belly ?? plan.start) : 0;
      heroine.setBellySupport?.(supporting && pregnantNow() && week >= SUPPORT_FROM_WEEK);
      heroine.setBellyLookAllowed?.(!controls.fireHeld && sinceFire > LOOK_AFTER_FIRE && pace.level < SUPPORT_ON_LEVEL);
      // HOW SHE TAKES A KICK BY WHAT SHE IS DOING (Joshua, 2026-11-23; bellyTouch.ts KICK_REACTION): BUSY firing or just
      // after, holding the table, a bar or the door, holstering, drawing or reloading, or faster than a walk; RELAXED
      // standing still with nothing to do; BALANCED all else (a walk, for one)
      const kickBusy = controls.fireHeld || sinceFire < LOOK_AFTER_FIRE || busyNow() || holsterUse.busy || beltReload.busy || pace.level > KICK_BUSY_PACE;
      heroine.setKickMood?.(kickBusy ? 'busy' : pace.speed < KICK_STILL_SPEED ? 'relaxed' : 'balanced');
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
    // (THE WORLD'S THINGS ONE AT A TIME: no button for the table, a bar or the door the other one has: `tableTaken`...)
    const atTable = tableUse.canUse(motion.x, motion.z) && !grabUse.busy && !holstering && !tableTaken(kitNow());
    const grabWord = tableUse.busy || grabAfterTable || holstering ? null
      : !grabUse.holding && barTaken(kitNow(), grabUse.nearest(motion.x, motion.z).bar) ? null : grabUse.label(motion.x, motion.z);
    // (the door: LET GO while she holds it; OPEN DOOR near a handle, when nothing else is running)
    const doorWord = doorUse.holding ? 'LET GO' : busyNow() || holstering || grabUse.busy || doorTaken(kitNow()) ? null : doorUse.label(motion.x, motion.z);
    promptIs = doorUse.holding ? 'door' : grabUse.holding && grabWord ? 'grab' : atTable ? 'table' : grabWord ? 'grab' : doorWord ? 'door' : null;
    hud.setPrompt(promptIs === 'table' ? tableUse.label() : promptIs === 'grab' ? grabWord : promptIs === 'door' ? doorWord : null);
    // (the story's prompt, where nothing else wants it: SCAN near markings in the prologue)
    const storyWord = story?.promptWord() ?? null;
    if (storyWord && !promptIs) { promptIs = 'story'; hud.setPrompt(storyWord); }
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
    //  90 degrees from her body, and her body stopped side-on. Since 2026-11-24 at ANY pace, a walk too: the body a
    //  tank, the camera its turret, `walkSides`)
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
    // (SITTING ON HER TOILET she stays square to it, her head alone looking round, as at the table: src/world/toilet.ts)
    const seatedYaw = playing?.kit.toilet.inUse ? playing.kit.toilet.yaw : null;
    turnInput.hold = doorUse.faceYaw() ?? seatedYaw ?? busyFace ?? (walkSides() ? rig.yaw : null);
    // (holding on in first person: her head alone turns, 90 degrees each way, the rest of her square: bodyTurn.ts `grip`)
    turnInput.grip = busyFace !== null || seatedYaw !== null;
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
    // (its direction: the procedural sky's sun or moon, or the fixed one, (-4, 10, 6), as it has always been)
    stepSky(dt, realDt);
    keyLight.position.set(motion.x + keyDirNow.x * KEY_REACH, feetY + keyDirNow.y * KEY_REACH, motion.z + keyDirNow.z * KEY_REACH);
    keyLight.target.position.set(motion.x, feetY, motion.z);
    shadowFloor.position.x = motion.x;
    shadowFloor.position.z = motion.z;
    heroine.setPosition(motion.x, motion.z, feetY);
    // HOW DEEP THE WATER IS AT HER FEET (her skin gets wet up to there: heroine/fast/skinShine.ts): a river or lake's
    // surface, or the sea's, above the ground under her
    if (island) {
      const ground = island.groundAt(motion.x, motion.z);
      const surface = Math.max(island.waterAt(motion.x, motion.z) ?? -Infinity, island.seaLevel);
      waterDepthNow = Number.isFinite(ground) ? Math.max(0, surface - ground) : 0;
      heroine.setWaterDepth?.(waterDepthNow);
    }
    // (a body that turns its parts apart was handed `turn` once, where it was made, and reads it each frame; one
    //  that cannot faces one way, all of it: where she looks, or the way she goes)
    heroine.setYaw(heroine.setFacing || rig.mode !== 'first' ? turn.base : turn.head);
    heroine.setWalk(motion.speed);
    heroine.update(info);
    // (the one NOT being played is stepped further down, once the danger is known: `stepStandingBy`)
    // (her painted blob of a shadow is only for when real shadows are off: moved far away, it is not seen)
    if (realShadows) ground?.setHeroine(1e6, 1e6); else ground?.setHeroine(motion.x, motion.z);

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
    // down at a kick (eased back); turning the view in first person frees her head (a look at a kick, bowed over
    // winded, or her looks as she sits) and it goes on from where the view is, so nothing jumps. ONCE: from then on the
    // view is the player's. (Until v0.2.177 a winded bow was taken over again EVERY frame the player turned the view,
    // the whole time she was bent over: each turn was thrown away for where her head was a frame before. Joshua,
    // 2026-11-26: "when I manually tried, it was like the camera was fighting something"; "it gets jittery".)
    {
      const w = heroine.bellyLook?.(lookSpot) ?? 0;
      if (w > 0 && controls.fireHeld) heroine.stopBellyLook?.();
      // (sitting down or getting up, her glance over her shoulder or her bow: src/heroine/fast/sitPose.ts SIT_LOOK.
      //  Turned round as she is, the view goes on from her head's way left and right too, not only up and down)
      const sitting = heroine.sitLook?.() ?? 0;
      // (bowed over winded, until her head is freed: fastHeroine.ts `windedLook`. THE FRAME SHE BENDS OVER: her bend was
      //  worked out after the look was read, so a look already going on is carried from this frame too, or it freed
      //  her head the moment it bowed: measured, the camera stick held into winded left the view level)
      if (windedWeight > 0 && rig.mode === 'first' && !windedWasOn && (lookX !== 0 || lookY !== 0)) windedCarry = true;
      windedWasOn = windedWasOn || (windedWeight > 0 && rig.mode === 'first');
      const bowed = windedWeight > 0 ? (heroine.windedLook?.() ?? 0) : 0;
      if (looked && !windedCarry && rig.mode === 'first' && (w > 0 || bowed > 0 || sitting > 0)) {
        const d = rig.lookDirection;
        if (sitting > 0) rig.yaw = Math.atan2(d.x, d.z);
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
    // (the prologue: how far along the passage he is, which also tells the passage where to look first for him, for
    //  his steps, the camera and the flashlight's beam)
    if (tunnel) prologueProgress = tunnel.progressAt(motion.x, motion.z);
    rig.update(dt, heroine);
    // THE PROLOGUE, once the camera is placed: the flashlight IN HIS RIGHT HAND (Joshua's handoff, 2026-11-23), its beam
    // from its lens to the spot his eyes look at (first person his eyes are the camera), his arm pointing it there; the
    // gap's light, the drips, the story's beats, and the stone's shake on the camera
    if (tunnel && flashlight && caveSounds && story) {
      rig.camera.getWorldDirection(storyLook);
      heroine.eye(storyEye);
      // (where his eyes look: his head's own way; without a head camera, from his eyes along the camera's look)
      if (heroine.eyeView) { heroine.eyeView(lightEye, lightTurn); lightLook.set(0, 0, -1).applyQuaternion(lightTurn); }
      else { lightEye.copy(storyEye); lightLook.copy(storyLook); }
      const rockAt = (from: THREE.Vector3, dir: THREE.Vector3, most: number) => tunnel.rayLength(from, dir, most);
      if (flashProp) {
        // (held in his right hand: asked every frame, so a body made again takes it up again)
        heroine.holdLight?.(flashProp.object);
        if (flashProp.object.parent) {
          flashProp.object.updateWorldMatrix(true, false);
          lensAt.copy(flashProp.lens).applyMatrix4(flashProp.object.matrixWorld);
        } else lensAt.copy(storyEye);
        // (his arm points it at the spot his eyes look at: posed there from the next frame, as his guns are)
        heroine.lightAt?.(flashlight.aimAt(lightEye, lightLook, rockAt));
      } else lensAt.copy(storyEye);
      flashlight.update(dt, lensAt, lightEye, lightLook, rockAt);
      flashProp?.setLit(flashlight.lit);
      tunnel.update(dt);
      caveSounds.update(dt);
      story.update(dt, motion.x, motion.z, rig.camera.position, storyLook);
      const shake = story.shakeNow;
      if (shake > 0) rig.camera.position.add(shakeBy.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(shake));
      hud.setLight(flashlight.on);
      // THE WAY TO THE OBJECTIVE: where it is along the passage (worked out when it changes), the arrows on the floor
      // toward it, how far it is on the objective, and the minimap (turned with the view: the camera's yaw)
      const wp = story.waypoint;
      if (wp !== waypointWas) { waypointWas = wp; waypointS = wp ? tunnel.sOf(wp.x, wp.z) : null; }
      groundArrows?.update(dt, prologueProgress, waypointS, story.locked);
      story.overlay.setDistance(waypointS === null ? null : Math.abs(waypointS - prologueProgress));
      if (miniMap) {
        miniMap.setShown(!story.locked);
        miniMap.setPlayer(motion.x, motion.z, Math.atan2(storyLook.x, storyLook.z));
        miniMap.setTarget(wp);
        miniMap.setPoints(tunnel.markings.filter((m) => m.scannable).map((m) => ({ x: m.at.x, z: m.at.z, done: story!.isScanned(m.id) })));
        miniMap.render(dt);
      }
    }
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
    if (!aimedByHand() && !busyNow() && !holsterUse.busy && !beltReload.busy && !tableAfterDraw && bathroomLeft <= 0 && !mustGoNow && tableUse.rounds.left === 0 && tableUse.rounds.right === 0) {
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
    dangerNow = threat;   // (the brains read it: src/npc/)
    // (what she is eating or drinking goes in a little each frame, evenly over its seconds)
    if (eating.seconds > 0) {
      const share = Math.min(1, dt / eating.seconds);
      const food = eating.food * share, water = eating.water * share;
      vitals.consume(food, water);
      eating.food -= food; eating.water -= water; eating.seconds -= dt;
      if (eating.seconds <= 0) { eating.food = 0; eating.water = 0; eating.seconds = 0; }
    }
    // (the bathroom: squatting, then her bladder emptied)
    if (bathroomLeft > 0) { bathroomLeft -= dt; if (bathroomLeft <= 0) { vitals.relieve(bathroomBowels); playing?.kit.toilet.hide(); } }
    // (each toilet growing in or shrinking away)
    for (const c of [blaze, john]) c?.kit.toilet.update(dt);
    // SHE CAN HOLD IT NO LONGER (mustGoNow): whatever she is doing, she lets go, her guns go away, and she goes
    if (mustGoNow && bathroomLeft <= 0) {
      if (grabUse.holding) grabUse.letGo();
      if (doorUse.holding) doorUse.letGo();
      // (anything she was about to do next is dropped)
      grabAfterHolster = null; grabAfterTable = null; tableAfterDraw = null; doorAfterHolster = null;
      const h = heroine.hands, gunInHand = !!h && holsterUse.hasHolsters && (h.hasGun('left') || h.hasGun('right'));
      if (gunInHand && !holsterUse.busy && !beltReload.busy) holsterUse.holsterAll();
      // (she goes once nothing is running: the table's walk, a holstering, a reload from her belt)
      if (!busyNow() && !holsterUse.busy && !beltReload.busy && !gunInHand) { mustGoNow = false; intake('bathroom'); }
    }
    // (wet: fully for WET_HOLD out of the water, then drying over WET_DRY)
    wetFor = waterDepthNow > 0.02 ? 0 : wetFor + dt;
    const wet = wetFor <= WET_HOLD ? 1 : Math.max(0, 1 - (wetFor - WET_HOLD) / WET_DRY);
    vitals.step(dt, { speed: motion.speed * (sideStepping ? SIDE_EFFORT : 1), firing: shooting, threat, ground: island ? { x: motion.x, z: motion.z, y: island.groundAt(motion.x, motion.z) } : undefined, waterDepth: waterDepthNow, wet });
    const reading = vitals.reading;
    // THE ONE NOT BEING PLAYED: what they were doing carries on, and their brain runs them (Step 1 and 2)
    {
      const other = bystander();
      if (other) stepStandingBy(other, dt, threat);
    }
    if (reading.bathroomEta === 0 && bathroomLeft <= 0) mustGoNow = true;
    limits = reading;
    heroine.setVitals?.(reading);
    vitalsPanel.show(reading, {
      speed: motion.speed,
      week: pregnantNow() ? plan.weekFor(heroine.bellyNow?.() ?? graphics.belly ?? plan.start) : null,
      kick: (heroine.liveInfo?.()?.kicks ?? 0) > 0,
      winded: pace.holdLeft > 0,
    });
    // (the 🚽 button: from her urge, hidden while she is already going)
    hud.setBathroom(bathroomLeft > 0 ? null : reading.bathroomUrge);
    hud.setPace(pace.name, pace.ring);

    // THE THOUGHT BUBBLE over the one standing by (Settings -> TEST TOOLS -> AI thoughts): just above their head, now
    // that the camera has moved for this frame; their brain's lines (npc/thoughts.ts), written 10 times a second
    {
      const other = bystander();
      if (other && other.brain && other.port && graphics.npcThoughts === 'on') {
        other.body.eye(thoughtAt);
        thoughtAt.y += THOUGHT_ABOVE;
        const h = other.body.hands, k = other.kit;
        thoughtBubble.update(realDt, rig.camera, thoughtAt, () => {
          // HOW FAR, AND HOW THEY ARE DRAWN (Joshua, 2026-11-22: "distance to other character so I can get where I want the
          // better quality to be so I can test pregnant and not"): metres from the one played and from the camera, their
          // detail now, their sharp set (face, bust, belly, hands within 12 m of the camera), Blaze's live body awake
          // or asleep (within 12 m of the one played: `wakeBlazesLiveBody`)
          const cost = other.body.stats?.();
          const live = other.body.liveInfo?.();
          const apart = playing ? Math.hypot(playing.kit.motion.x - k.motion.x, playing.kit.motion.z - k.motion.z) : null;
          // (the camera to their middle, worked out here every frame: their body only measures it while it is drawn, so
          //  out of view it would read the last time they were seen)
          otherMiddle.setFromMatrixPosition(other.body.root.matrixWorld);
          otherMiddle.y += other.body.height * 0.5;
          const camera = rig.camera.getWorldPosition(cameraAt).distanceTo(otherMiddle);
          return thoughtLines({
            name: other.name, brain: other.brain!, port: other.port!, combat: other.combat, needs: other.needs,
            auto: other.autoFire === 'on',
            rounds: { left: h?.hasGun('left') ? k.tableUse.rounds.left : null, right: h?.hasGun('right') ? k.tableUse.rounds.right : null },
            view: {
              apart, from: playing?.name ?? '', camera, detail: cost?.detail ?? null,
              // (John's detail is fixed, JOHN_DETAIL: no sharp or plain set to tell)
              sharp: other === john && JOHN_DETAIL !== null ? null : cost?.sharp ?? null, live: live ? live.awake : null,
            },
          });
        });
      } else thoughtBubble.hide();
    }
    // THEIR BREATHING, now that their vitals have moved on and the camera is where it is this frame
    playBreaths();
    // (and Blaze's live body run only while someone is near her: next frame's step)
    wakeBlazesLiveBody();

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
          // (and how her big pictures are kept on the graphics chip: ASTC on an iPhone when packed, WebP when not)
          lines.push(`her ${her.triangles.toLocaleString()} tris · ${her.drawCalls} draws · ${her.pictures ?? ''}`);
          lines.push((her.detail !== undefined ? `detail ${her.detail}%${her.auto ? ' auto' : ''} · ` : '') + `${her.updateMs.toFixed(2)} ms CPU`);
        }
        // (the hidden live body: what its step costs each frame, and whether her baby is kicking)
        const liveNow = heroine.liveInfo?.();
        if (liveNow) lines.push(liveNow.awake ? `live body ${liveNow.stepMs.toFixed(1)} ms` + (liveNow.kicks ? ` · ${liveNow.kicks} kick${liveNow.kicks > 1 ? 's' : ''}` : '') : 'live body asleep (far)');
        else if (blaze && blaze !== playing && blaze.body.liveInfo?.()?.awake === false) lines.push('Blaze live: asleep (far)');
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
        // (v0.2.174's chain: her workload over her capacity is her effort; the slope under her; her pool, her energy)
        {
          const v = vitals.reading;
          lines.push(`work ${v.workload.toFixed(2)}/${v.capacity.toFixed(2)} = ${v.effort.toFixed(2)} · ${Math.round(v.grade * 100)}%`);
          lines.push(`pool ${Math.round(v.staminaPool * 100)} · fit ${Math.round(v.fitness * 100)}`);
          // (her energy's two parts, 2026-11-26: sleepiness on game time, fatigue in real minutes; zz asleep)
          lines.push(`sleepy ${Math.round(v.sleepiness * 100)} · tired ${Math.round(v.fatigue * 100)}${v.asleep ? ' · zz' : ''}`);
        }
        // (the island's forest: trees drawn, in how many draws)
        // (the island's grid, ground and rivers as chosen in Settings -> WORLD: v0.2.166)
        if (island) lines.push(`isle ${island.grid}x${island.grid} · ${graphics.ground === 'textures' ? 'tex' : 'colours'} · rivers ${graphics.rivers}`);
        // (the game clock, its speed (FF while everyone sleeps) and the procedural sky's event: v0.2.167, 2026-11-26)
        lines.push(`${clock.text} · ${clock.fastForward ? 'FF ' : ''}${clock.rate}x${island && graphics.sky === 'procedural' ? ` · ${graphics.skyEvent}` : ''}`);
        const forest = island?.treeCounts();
        if (forest) lines.push(`trees ${forest.trees} · ${forest.draws} draws`);
        // (graphics memory asked for, an ESTIMATE: core/gpuTally.ts; and where the last start stopped, if the phone
        //  closed it: core/startupLog.ts)
        if (gpuTally) lines.push(`GPU est ${Math.round(gpuTally.totalMB())}MB · tex ${Math.round(gpuTally.textureBytes / 1048576)}`);
        // (the texture sizes in force: characters / world, core/textureSizes.ts)
        lines.push(`textures ${textureCap('character')} / ${textureCap('world')}`);
        for (const step of lastStartSteps()) lines.push(`last: ${step}`);
        hud.setReadout(lines.join('\n'));
        readoutTimer = 0;
        readoutFrames = 0;
      }
      const section = sectionInView();
      hud.setDomeLabel(`dome section ${section.index}: ${section.hp} HP`);
    }
  };
  requestAnimationFrame(frame);
  // (8 s into play, past the first frames that send every picture to the graphics chip: a new version may now install)
  window.setTimeout(tellGameIsUp, 8000);
}

// THE GAME AS AN APP: in the published game (not while developing), start the service worker the build wrote
// (dist/sw.js; see pwa() in vite.config.ts). It keeps the game's files on the device, so after the first visit
// the game opens quickly and works with no signal, and "Add to Home Screen" makes it a full-screen app.
// A NEW VERSION WAITS FOR THE GAME (Joshua, 2026-11-21: crashes near the end of loading right after an update): Safari
// checks for a new sw.js as the app opens, and its install used to fetch every file while the game was loading. Now
// the install waits (vite.config.ts) until this page tells it the game is up: `tellGameIsUp`, called once she has
// been playing a few seconds. Any worker of this game, installing, waiting or running, is told; one that starts
// installing later is told as it appears.
let gameIsUp = false;
const tellWorkers = (registration: ServiceWorkerRegistration | undefined): void => {
  if (!registration) return;
  for (const worker of [registration.installing, registration.waiting, registration.active]) worker?.postMessage('gdm-up');
};
/** Which outfits are worn now, told to the offline copy (set by the game once it has made them: `keepWornOutfits`). */
let wornOutfitsNow: (() => void) | null = null;
/** A message for the game's RUNNING offline copy (the active service worker), if there is one. */
function tellOfflineCopy(message: unknown): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.getRegistration().then((registration) => registration?.active?.postMessage(message)).catch(() => {});
}
function tellGameIsUp(): void {
  if (gameIsUp || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  gameIsUp = true;
  void navigator.serviceWorker.getRegistration().then(tellWorkers).catch(() => {});
  // (and which outfits to keep: every other one is let go of on the phone)
  wornOutfitsNow?.();
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
      // (a new version found later, the game already up: tell it at once, so it does not wait its 90 s)
      registration.addEventListener('updatefound', () => { if (gameIsUp) tellWorkers(registration); });
      if (gameIsUp) tellWorkers(registration);
    }).catch((error: unknown) => {
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
