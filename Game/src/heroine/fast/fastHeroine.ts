// ============================================================================
// fastHeroine.ts -- THE FAST HEROINE ("Body: Performance" in Settings).
//
//   const heroine = await createFastHeroine({ renderer, scene, look: 'blazeSuit' });
//   scene.add(heroine.root);
//   ...each frame:  heroine.update(frame);
//
// WHY THERE ARE TWO HEROINES. The first one (builderHeroine.ts, "Body: Visual")
// runs the Character Builder's whole Character Room out of sight and draws its
// scene into the game's picture. That is the builder exactly, but the room does
// a great deal of work every frame (it was built to EDIT a character, not to
// play one) and on Joshua's phone the game ran at 31-37 FPS with it. In another
// of his games, Anthill Airways, a test room (its "DEV Room") draws the very
// same body file at 60 FPS. This file is that room's way of drawing ONE body,
// brought into this game:
//
//   * the body file is loaded once and her underwear pieces are thrown away   (bodyFile.ts)
//   * her shape is "baked": worked out once, only her 4 motion shapes stay live (shapedBody.ts)
//   * her outfit is not painted by shader code each frame: it is a baked
//     picture of the builder's own finished paint                              (bakedLook.ts, outfitMaterial.ts)
//   * lighter detail levels are made when first needed, in the background      (detailLevels.ts)
//   * AUTO detail lowers her detail only when the frame rate needs it, and
//     never where it could be seen                                             (autoDetail.ts)
//   * she stands, breathes and walks by the builder's own posing code          (bodyMotion.ts)
//   * her feet drive her: her stride is measured from her foot bones and
//     turned by the ground she covers; planted feet are held to their spot     (footGround.ts)
//   * her arms keep clear of her belly and her breasts: they stop at them,
//     or go over them                                                         (armClear.ts)
//   * each part of her turns its own way, by the game's rule: her head, her
//     shoulders, her belly and hips, her upper legs, her lower legs and feet   (`setFacing`; input/bodyTurn.ts)
//
// She is an ordinary object in the game's scene (no hidden room, no second
// scene drawn inside the first): `root` holds her skeleton, her skin, her hair
// her outfit's few extra pieces and her guns: nine draw calls in all for Blaze
// (skin, hair, the fabric across her cleavage, two for her sneakers, four for her two guns).
//
// WHAT SHE DOES NOT HAVE that the "Visual" body does is listed at the end of
// this file's factory (`createFastHeroine`), and in the report that came with it.
// ============================================================================
import * as THREE from 'three';
import { type BodyFacing, type BodyVitals, type FrameInfo, type Hand, type HeroineBody } from '../../core/contracts';
import { ArmAim, findKnuckles, type ArmBones } from '../aimArms';
import { createGun, seatGunInHand, type Gun } from '../guns';
import { AutoDetail, type TargetFps } from './autoDetail';
import { loadBakedLook, type BakedLook } from './bakedLook';
import { BAREFOOT_HEIGHT_METRES, makePaintedMaterials, shapeFromFile, type PaintedLook } from './devRoomLook';
import { loadBodyFile } from './bodyFile';
import { BodyMotion, walkEase, type StrideTable } from './bodyMotion';
import { FootGround, type LegTwist, type CrabMove } from './footGround';
import { ArmClear, fitBelly, fitBreasts, type Egg } from './armClear';
import { JointGuard, type JointExcess } from './jointGuard';
import { HandReach } from './handReach';
import { FingerTouch } from './fingerTouch';
import { LowerBody } from './lowerBody';
import { BellyTouch } from './bellyTouch';
import { measureHandPads } from './handPads';
import { SkinPatch } from './skinPatch';
import { STANCE, WINDED, downSteps, foursHips, kneelHips, kneelTip, kneelTurns, stanceTurns, tipOf, type BodySizes, type Stance } from './groundPose';
import type { MutableJointTurn } from '@charb/actor/humanRig';
import { DetailLevels, DetailMaker, sharpParts, skinImportance, type Detail } from './detailLevels';
import { PLAIN_KEY, detailOfKey } from './shapedBody';
import { buildExtraPieces } from './extraPieces';
import { buildBeltGear, type BeltGear } from './beltGear';
import { buildSuitGear, type SuitGear } from './suitGear';
import { LOOK_GEAR } from '../looks/gear';
import { loadFastHair, type FastHair } from './fastHair';
import { FINE_FROM_DETAIL, makeSkinMaterials, SUIT_KNITS, type ClothShine, type SkinMaterials } from './outfitMaterial';
import { addSkinTexture, loadSkinPictures } from './skinTexture';
import { addSkinShine, shineUniforms, SkinWetness } from './skinShine';
import { shapeWeightsAt } from './shapedBody';
import { SkinBreath } from './skinBreath';
import { WALK_WEIGHT } from '@charb/actor/walkWeight';
import type { LiveBody } from './liveBody';
import { weekForBump } from '@charb/sarahlab/baby';

/**
 * SIDE STEPS (Joshua, 2026-11-18). GAME TUNING. With her facing held the game gives her only four moves (ahead, back,
 * left, right: src/main.ts); going more across than along the way she faces (past SIDE_ZONE_FROM) her feet take crab
 * steps. (The shuffle and the skip, below and in footGround.ts, are kept for later: the game asks only for a crab walk
 * now, Joshua: "only side step in walk".) A skip's hop is all there at SIDE_HOP_FULL belly percent, gone by SIDE_HOP_GONE.
 */
const SIDE_ZONE_FROM = (45 * Math.PI) / 180;
const SIDE_HOP_FULL = 25;
const SIDE_HOP_GONE = 100;
import { MOTION_SHAPES, ShapedBody } from './shapedBody';

// ------------------------------------------------------------------ tuning (the same numbers as builderHeroine.ts)

/**
 * HER EYES, MEASURED ON HER (Joshua, 2026-11-19: "measure at the eye balls... if the head is on the body, you tilt the
 * head down 70 degrees, how far forward of an offset is there?... I'd measure from the actual head and then place the
 * camera accordingly"). Read off her skin standing level: her corneas 0.3 cm ahead of her body's line at 1.595 m, so
 * the middle of her eyeballs (1.2 cm further back) sits this far AHEAD of and ABOVE the base of her skull (the joint her
 * head nods on, 1.544 m), metres. The first-person camera is there, not in front of her face as before.
 */
const EYE_AHEAD = 0.075;
const EYE_ABOVE = 0.051;
/**
 * FIRST PERSON IS HER HEAD (Joshua, 2026-11-20: "un-hide the head and always keep it visible and just offset forward at
 * touch and keep same eye height like in Beyond Extinction... as it can only bend what the head can do"): the camera is
 * fixed to her skull AT HER EYES (the middle of her eyeballs). It turns, tips and bobs with her head; her head is drawn,
 * and her own face, closer than the camera's nearest 6 cm, is never seen (and its inside faces away). First it was
 * moved forward until just clear of her face (her nose's tip, `measureFace`, 3.7 cm on Blaze, plus 5 mm), but looking
 * down that took it 4 cm lower still, by her chin (Joshua: "Camera seems too low"). Settings -> CAMERA -> 1st person
 * eye forward and eye height move it from there (`setEyeOffset`): along her face and her head's own up.
 */
/**
 * HER NECK'S REACH (Joshua, 2026-11-20: "neck motion is roughly 45-60 upward, 70-80 downward, and 70-90 to either
 * side"; measured studies agree: about 127 degrees from full flexion to full extension, 146 of rotation in all):
 * her head tips up and down at most this far FROM HER TORSO'S OWN LINE, whatever her pose (standing, crouched, bent
 * over, on all fours). Her head's turn to the side stays Joshua's five bands (input/bodyTurn.ts).
 */
/** Her head kept level from this ground speed (m/s, a fast walk) fully by this one (a jog): see "KEPT LEVEL FROM A JOG UP". */
const HEAD_LEVEL_FROM = 1.6;
const HEAD_LEVEL_AT = 2.4;
const HEAD_UP_MOST = (55 * Math.PI) / 180;
const HEAD_DOWN_MOST = (75 * Math.PI) / 180;
/** Moved further than this between two frames, metres, she was put somewhere else (not a step: her stride does not turn). */
const JUMP_METRES = 1.5;
/**
 * EACH PART OF HER TURNED ITS OWN WAY (`setFacing`; Joshua's five bands). Her hips are turned with her belly
 * (footGround.ts does that, with her legs). Above them, the further turn from her belly to her shoulders is shared
 * out up her back, from her lower spine to her chest: most of it on her lower spine's bone, because that is the bone
 * that carries her bust (four fifths of it, as measured on her skin), and her bust goes with her shoulders in
 * Joshua's picture; her belly is carried by her hips' bone and stays with it. And the turn from her shoulders to her
 * head is shared between her neck and her skull. GAME TUNING.
 */
const BACK_TURN_SHARES = [0.8, 0.1, 0.1];
const HEAD_TURN_SHARES = [0.4, 0.6];
/**
 * Guards (the game's rule keeps well within these): the most her hips, her upper legs and her feet are turned from
 * the way her root faces, and the most her shoulders are turned from her belly and her head from her shoulders.
 */
const DEG = Math.PI / 180;
const HIPS_TURN_MOST = 60 * DEG, UPPER_LEGS_TURN_MOST = 42 * DEG, FEET_TURN_MOST = 24 * DEG, BACK_TURN_MOST = 30 * DEG, HEAD_TURN_MOST = 30 * DEG;
/** Her belly is reshaped at most this often (seconds): each change rewrites her points on the CPU. */
const BELLY_EVERY = 0.1;
/** How far her fingers are curled round the guns' grips, percent (the builder's FINGERS slider). */
const GRIP_CURL = 55;
/** A quiet breath at rest, for when the game gives no vitals (its `breath` is rewritten each frame). */
const REST_BREATH = { breath: 0, breathLitres: 0.5, breathsPerMinute: 14, stomachMl: 0 };
/**
 * HER HEAD IN FIRST PERSON (Joshua, 2026-11-17: "is it possible for the shadow of her to be complete if hiding the
 * head? It shows she is headless"). It used to be hidden by shrinking her skull BONE, which shrank it for her shadow
 * too (and her hair with it, as it hangs on that bone). Now her bones are left alone and her head is folded away
 * only in the picture the camera draws: a few lines added to her skin's shader (`hideHeadPatch` below) pull every
 * point her skull carries into the base of her skull, as the shrunk bone did. Her shadow is drawn by three.js with a
 * shader of its own, which these lines are not in, so it keeps her whole head. Her hair is kept too, on the
 * picture the same way (`hideHairPatch`), its shadow kept.
 */
const HEAD_GLSL_BONES = 8;
/**
 * HER FACE, BUST AND BELLY KEPT SHARP WITH THE CAMERA NEAR (Joshua, 2026-11-19: "at 2m out (or body height)"): within
 * this many metres of her middle; it counts as far again only past SHARP_LEAVE (a little give, so no flicker).
 */
const SHARP_WITHIN = 2.0;
/**
 * SQUATTING ON PURPOSE (Joshua, 2026-11-19: until there is a toilet, "she can just sit or squat down for 5s and then
 * stand up"): she gets down to a point this far above her floor and ahead of her (metres), low enough for lowerBody.ts
 * to choose its squat (the Character Builder's, which works for every belly) and not so low that she kneels.
 */
const SQUAT_POINT = Object.freeze({ up: 0.32, ahead: 0.22 });
const SHARP_LEAVE = 2.3;
/** A ball this big round her middle is what the camera's view is tested against (metres): her arms out, guns included. */
const VIEW_BALL_RADIUS = 1.5;

// ------------------------------------------------------------------ options and extras

/**
 * Her detail: 'autoLive', 'auto', or one fixed level.
 *   autoLive  SMART FPS turns her detail (Joshua, 2026-11-17: "Instead of Smart FPS controlling the amount of people,
 *             have it control the details instead from a max up to 30% details down to 1%, but still auto depending
 *             on FPS"): she starts at 30 %, goes a level lighter while the frame rate is under the target and comes
 *             back a level when it has been over it for a while. (Its levels once carried all her body shapes live;
 *             since 2026-11-20 they are made like the others, which costs far less memory: shapedBody.ts LIVE_UP_TO.)
 *   auto      as much as the eye can see at her size on screen (up to 100 %), lighter only if the frame rate needs it.
 */
export type DetailChoice = 'autoLive' | 'auto' | Detail;
/** How many detail levels are kept made at once besides her full 100 % (the ones she wore last). */
const KEEP_LEVELS = 3;
/** The heaviest level AUTO LIVE draws her at. */
const AUTO_LIVE_TOP: Detail = 30;

export interface FastHeroineOptions {
  /** The game's renderer (her materials are compiled with it before she is shown). */
  readonly renderer: THREE.WebGLRenderer;
  /** Which baked look she wears: a folder name under public/heroines/ (bakedLook.ts). Not read when `painted` is given. */
  readonly look: string;
  /**
   * Dress her THE DEV ROOM'S WAY instead (devRoomLook.ts): nothing baked, her shape from the file's own body shapes,
   * a tee and leggings coloured over her skin in the shader. Her belly can then change size freely.
   */
  readonly painted?: PaintedLook;
  /** The game's scene, if it exists already: her materials are compiled for its lights while she loads. */
  readonly scene?: THREE.Scene;
  /** Her detail: 'auto', or one of the fixed levels (percent). Default 'auto'. */
  readonly detail?: DetailChoice;
  /** The frame rate AUTO detail holds. Default 30. */
  readonly targetFps?: TargetFps;
  /** Her face, bust and belly kept as fine as at 100% at every level (detailLevels.ts `sharpParts`). Default true. */
  readonly sharpParts?: boolean;
  /** The catsuit's knit in place of her look's own (outfitMaterial.ts SUIT_KNITS), for looks that wear a live knit. */
  readonly suitKnit?: keyof typeof SUIT_KNITS;
  /** Her hair drawn as strands and locks (hairStrands.ts). Default true. */
  readonly hairStrands?: boolean;
  /** Leave the small loose locks by her face where the file has them, on her cheeks (fastHair.ts liftFaceLocks). Default false: lifted out of her cheeks. */
  readonly faceLocks?: boolean;
  /** Her skin's depth, the builder's hybrid, on her bare skin (skinTexture.ts). Default true. */
  readonly skinTexture?: boolean;
  /** Told what is loading, for a loading screen. */
  readonly onProgress?: (stage: string) => void;
}

/** What she costs to draw, for the debug readout. */
export interface FastHeroineStats {
  /** Her triangles as drawn now (skin, hair and guns). */
  readonly triangles: number;
  readonly drawCalls: number;
  /** Milliseconds her last `update` took on the CPU, smoothed. */
  readonly updateMs: number;
  /** The detail level she is drawn at now, percent, and whether AUTO chose it. */
  readonly detail: number;
  readonly auto: boolean;
  /** How tall she was last drawn, in screen pixels (what AUTO goes by). */
  readonly pixels: number;
  /** The frame rate AUTO measured, and what it last did. */
  readonly fps: number;
  readonly doing: string;
}

export interface FastHeroine extends HeroineBody {
  stats(): FastHeroineStats;
  /** Change her detail: 'auto' or a fixed level. Takes effect as soon as the level is ready (at once if it was made before). */
  setDetail(detail: DetailChoice): void;
  /** For test pages: where her main joints are now (world metres), by the builder's joint names. */
  jointsNow(): Record<string, [number, number, number]>;
  /** For test pages: the hand on her belly where the baby kicked (0 left, 1 right), -1 none. */
  bellyHandNow(): number;
  /** For test pages: each hand's reach this frame. */
  reachNow(): unknown;
  /** For test pages: how far each part of a hand really is from her skin (mm). */
  handGaps(hand: 0 | 1): unknown;
  /**
   * For test pages: a kick on her belly, `round` radians round from her front (+ toward her left), `up` up it; it
   * always calls a hand, at once; `look`: she looks down at it; `both`: both hands (null: by chance).
   */
  pokeBelly(round: number, up?: number, look?: boolean, both?: boolean | null): void;
  /** For test pages: which hand holds her belly up as she runs (-1 none), and each hand's belly touch. */
  bellyHoldsNow(): { support: number; holds: [boolean, boolean] };
  /**
   * Attach THE LIVE BODY (liveBody.ts): the builder's whole hidden room, run each frame and never drawn. Her baby's
   * kicks then show on her skin. Null takes it away again.
   */
  attachLive(live: LiveBody | null): void;
  /**
   * Take THE LIVE BODY back out of her WITHOUT letting it go, and return it (null if she had none): for a change of
   * outfit on the same body (main.ts `changeOutfit`), so the slow hidden room is not opened again for the new one.
   */
  detachLive(): LiveBody | null;
  /** The live body's cost and state, for the debug readout: milliseconds a step (smoothed), kicks showing; null if none. */
  liveInfo(): { stepMs: number; kicks: number } | null;
  /** Change the frame rate AUTO detail holds. */
  setTargetFps(target: TargetFps): void;
  /**
   * FOR THE LAB: walk her on the spot at this ground speed, metres a second (negative: backing up; 0: off, her steps
   * follow the ground she really covers, as in the game).
   */
  treadmill(speed: number): void;
  /** Her feet on the floor this frame, for a readout and the tests: how far she is lowered, which feet are planted, how far each was raised by bending its knee (metres). */
  feetInfo(): { drop: number; planted: readonly [boolean, boolean]; raised: readonly [number, number]; held: readonly [number, number]; stepFoot: number; phase: number; walk: number; run: number; speed: number; sway: number; widths: readonly [number, number] };
  /** Her belly's and her breasts' measured shapes, and how far each arm was moved to keep it clear of them this frame (armClear.ts), for the tests. */
  armInfo(): { eggs: readonly Egg[]; moved: readonly [number, number]; kneeMoved: readonly [number, number] };
  /** For the tests: each hand's wrist this frame (degrees from her own pose: as asked, its limit, as laid). */
  wristInfo(): readonly { asked: number; limit: number; laid: number; start: number; weight: number; raw: number; moved: number; limited: boolean }[];
  /** FOR THE LAB: switch the arm and belly collision off (her arms are left as her pose and aim have them) or on again. */
  keepArmsClear(on: boolean): void;
  /** How far past its real limit each kind of joint went this frame, degrees (jointGuard.ts), for the tests. */
  jointInfo(): JointExcess;
  /** FOR THE LAB: switch the joint limits off (still measured) or on again. */
  keepJointsReal(on: boolean): void;
  /** Her stride as measured from her own foot bones, walking and running (bodyMotion.ts), for a readout and the tests. */
  strideInfo(): { readonly walk: StrideTable; readonly run: StrideTable } | null;
  /** Her stride now (strideShape.ts): metres for two steps, and the share of it each foot is down. */
  strideNow(): { readonly stride: number; readonly share: number };
  /**
   * Her breathing now, for a readout: how far her chest and her belly are moved out where each moves most, and how far
   * her belly stands out for her stomach (millimetres); and her trunk as measured at about navel height (its half
   * width to her left and right, her spine's front and her front, metres in her rest frame).
   */
  breathInfo(): { chestMm: number; bellyMm: number; fullMm: number; trunk: number[] };
  /** Megabytes downloaded for her, and seconds she took to load. */
  readonly loaded: { readonly megabytes: number; readonly seconds: number };
  /** The week of pregnancy her belly stands for, off her own chart (0: not pregnant). Her vitals take it into account. */
  readonly weeks: number;
  /** Her belt, thigh holsters and clip pouches (beltGear.ts): where a gun sits holstered, and the clips she carries. */
  readonly gear: BeltGear;
  /** How long each lighter detail level took to work out, milliseconds (only levels made so far). */
  levelTimes(): Record<number, number>;
}

/** An attribute's numbers as plain floats (the file stores some as small whole numbers; `getComponent` decodes them). */
function floats(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): Float32Array {
  const out = new Float32Array(attribute.count * size);
  for (let i = 0; i < attribute.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = attribute.getComponent(i, c);
  return out;
}

// ------------------------------------------------------------------ the factory

/** Her look's cloth shine, with the knit chosen in Settings in place of its own (only where the look wears a knit). */
function withKnit(shine: ClothShine | undefined, knit: ClothShine['knit']): ClothShine | undefined {
  // (a look whose knit is laid on one colour of its own, as Look 2's navy, keeps its own picture: the setting is the catsuit's)
  return shine?.knit && knit && !shine.knitOn ? { ...shine, knit } : shine;
}

export async function createFastHeroine(options: FastHeroineOptions): Promise<FastHeroine> {
  const began = performance.now();
  const say = (stage: string) => options.onProgress?.(stage);

  // ---- 1. everything she is made from, fetched together -----------------------------------------------------------
  const painted = options.painted ?? null;
  const [file, baked] = await Promise.all([loadBodyFile(say), painted ? Promise.resolve(null) : loadBakedLook(options.look)]);
  const skin = file.skin;
  const fileGeometry = skin.geometry;
  const count = fileGeometry.getAttribute('position').count;
  // THE DEV ROOM'S WAY: no baked files. Her shape is the file's own points with her body shapes added in at the
  // weights the builder's rules give for her belly and navel, here and now (devRoomLook.ts).
  const look: BakedLook = baked ?? (() => {
    const dictionary0 = skin.morphTargetDictionary ?? {};
    const moves0 = fileGeometry.morphAttributes.position ?? [], turns0 = fileGeometry.morphAttributes.normal ?? [];
    const shape = shapeFromFile(
      fileGeometry, shapeWeightsAt(painted!.bump, painted!.navel),
      (name) => (dictionary0[name] !== undefined ? moves0[dictionary0[name]] : undefined),
      (name) => (dictionary0[name] !== undefined ? turns0[dictionary0[name]] : undefined),
    );
    // (the same form a baked look has, so everything below reads either; it has no pictures and no extra pieces)
    const none = new THREE.Texture();
    return {
      manifest: {
        version: 1, look: `painted:${painted!.name}`, bakedAt: '', builderVersion: '', belly: painted!.bump, vertexCount: count,
        barefootHeightMetres: BAREFOOT_HEIGHT_METRES, navel: painted!.navel, normalScale: [1, 1], hair: painted!.hair,
        files: { albedo: '', normal: '', surface: '', shape: '', pieces: null },
      },
      albedo: none, normal: none, surface: none, shape, pieces: [], piecePictures: new Map(), megabytes: 0,
      dispose(): void { none.dispose(); },
    };
  })();
  if (look.shape.count !== count || look.manifest.vertexCount !== count) {
    look.dispose();
    throw new Error(`[heroine] the baked look "${options.look}" was made for a body of ${look.shape.count} points; the body file has ${count}. Bake the look again (src/bake/bakeLook.ts).`);
  }
  say('dressing her');

  // ---- 2. her shape, baked ---------------------------------------------------------------------------------------
  // The file's own body shapes, by name. Only the few a change of belly needs are ever read again; the rest are let go.
  const dictionary = skin.morphTargetDictionary ?? {};
  const fileMoves = fileGeometry.morphAttributes.position ?? [], fileTurns = fileGeometry.morphAttributes.normal ?? [];
  const shapeMoves = (name: string) => (dictionary[name] !== undefined ? fileMoves[dictionary[name]] : undefined);
  const shapeTurns = (name: string) => (dictionary[name] !== undefined ? fileTurns[dictionary[name]] : undefined);
  // (every body shape's name, in the file's own order)
  const shapeNames = Object.entries(dictionary).sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const fileIndex = fileGeometry.index;
  if (!fileIndex) throw new Error('[heroine] the body file has no triangle list');
  const fullIndex = Uint32Array.from(fileIndex.array);

  // her texture layout: the baked pictures' own (the file's islands moved apart), or the file's if the look has none
  const layout = look.shape.uv ?? floats(fileGeometry.getAttribute('uv'), 2);
  // which bones move each point: the builder's corrected ones from the bake, or the file's own
  const holdIndex = look.shape.skinIndex ?? Uint16Array.from(floats(fileGeometry.getAttribute('skinIndex'), 4));
  const holdWeight = look.shape.skinWeight ?? floats(fileGeometry.getAttribute('skinWeight'), 4);
  const body = new ShapedBody({
    count,
    position: look.shape.position,
    normal: look.shape.normal,
    uv: layout,
    skinIndex: holdIndex,
    skinWeight: holdWeight,
    shapeMoves, shapeTurns,
    shapeNames,
    bakedBelly: look.manifest.belly,
    navel: look.manifest.navel,
    triangles: fullIndex,
  });

  // ---- 3. her detail levels ----------------------------------------------------------------------------------------
  // (the lightening is told her points, her texture layout and how important each point is: detailLevels.ts)
  const box = new THREE.Box3().setFromArray(look.shape.position);
  const maker = new DetailMaker();
  const importance = skinImportance(look.shape.position, box, shapeMoves);
  // TWO SETS OF LEVELS (Joshua, 2026-11-19: "make the sharp camera LOD at 2m out (or body height) and beyond that, it
  // starts fading like normal"): with her face, bust and belly kept sharp (mesh 0), for the camera within
  // `SHARP_WITHIN` of her, and lightened all over like before (mesh 2), for the camera further off. Each is made only
  // when first wanted. With "Sharp face, bust & belly" off, the plain set alone.
  const keepSharp = options.sharpParts !== false;
  maker.setMesh(0, look.shape.position, fullIndex, box, layout, importance, keepSharp ? sharpParts(look.shape.position, box, shapeMoves) : null);
  const levels = new DetailLevels(maker, 0, fullIndex);
  if (keepSharp) maker.setMesh(2, look.shape.position, fullIndex, box, layout, importance, null);
  const plainLevels = keepSharp ? new DetailLevels(maker, 2, fullIndex) : levels;

  // Her skin starts at full detail: the file's own geometry (all 43 shapes) is swapped for her baked one.
  skin.geometry = body.build(100, fullIndex);
  fileGeometry.dispose();
  // (only her four motion shapes are on her now, in MOTION_SHAPES' order)
  const influences = [0, 0, 0, 0];
  skin.morphTargetDictionary = Object.fromEntries(MOTION_SHAPES.map((name, i) => [name, i]));
  skin.morphTargetInfluences = influences;
  // ...and on a LIVE level (30 % and lighter: shapedBody.ts) every body shape of the file, by name, at her weights.
  const bakedDictionary = skin.morphTargetDictionary;
  const liveDictionary: Record<string, number> = Object.fromEntries(shapeNames.map((name, i) => [name, i]));
  const liveInfluences: number[] = shapeNames.map(() => 0);
  const liveMotionAt = MOTION_SHAPES.map((name) => liveDictionary[name] ?? -1);
  /** Her size shapes' weights written into the live set (her belly, bust and navel as they are now). */
  const setLiveShape = (): void => {
    liveInfluences.fill(0);
    for (const [name, weight] of Object.entries(body.shapeWeights())) if (liveDictionary[name] !== undefined) liveInfluences[liveDictionary[name]] = weight;
  };
  setLiveShape();

  // ---- 4. her outfit: the baked pictures on one plain material -----------------------------------------------------
  // (her look's gear and shine by the look ASKED FOR, not the folder it was baked in: a two-tone catsuit wears another
  //  look's bake (looks/gear.ts `bakedAs`) with its own colours)
  const lookGear = LOOK_GEAR[options.look] ?? LOOK_GEAR[look.manifest.look];
  // (or, the DEV Room's way, the file's own skin material with a tee and leggings coloured over it in the shader)
  const fileMaterial = Array.isArray(skin.material) ? skin.material[0] : skin.material;
  // (her skin model's own units to a metre, for the live knit's size: her height in the model is about 1.68 m)
  skin.geometry.computeBoundingBox();
  const unitsPerMetre = (skin.geometry.boundingBox!.max.y - skin.geometry.boundingBox!.min.y) / 1.68;
  const materials = painted ? makePaintedMaterials(fileMaterial, box, painted) : makeSkinMaterials(fileMaterial, look, options.renderer, withKnit(lookGear?.clothShine, options.suitKnit ? SUIT_KNITS[options.suitKnit] : undefined), unitsPerMetre);
  // HER SKIN'S DEPTH (Joshua, 2026-11-19; skinTexture.ts): the builder's hybrid, her own skin picture's depth and its pore
  // and crease tile, on her bare skin
  /** Her skin-depth pictures (kept here so `dispose` lets them go: they live only in her shader's uniforms). */
  let skinPictures: ReturnType<typeof loadSkinPictures> | null = null;
  if (options.skinTexture !== false && !painted) {
    skinPictures = loadSkinPictures(options.look, options.renderer);
    for (const m of [materials.fine, materials.plain]) addSkinTexture(m as THREE.MeshStandardMaterial, skinPictures, unitsPerMetre);
  }
  // HER SKIN'S SHINE (Joshua, 2026-11-19; skinShine.ts): dry to oily (a setting), and wet from the water
  const shine = shineUniforms(unitsPerMetre);
  const wetness = new SkinWetness();
  /** Her feet in her model's own height (the bottom of her baked shape): the water line is measured up from here. */
  const feetInModel = box.min.y;
  let waterDepth = 0;
  /** Seconds left of squatting on purpose (`squatFor`: the bathroom, for now). */
  let squatLeft = 0;
  if (!painted) for (const m of [materials.fine, materials.plain]) addSkinShine(m as THREE.MeshStandardMaterial, shine);
  skin.material = materials.fine;
  skin.castShadow = false;
  skin.receiveShadow = false;

  // ---- 5. her place in the game's world ----------------------------------------------------------------------------
  // root (the game moves and turns this)  >  fit (her size, her feet on the floor, facing +Z)  >  the body file's scene
  const root = new THREE.Group();
  root.name = 'heroine';
  const fit = new THREE.Group();
  fit.name = 'heroine-fit';
  fit.add(file.scene);
  root.add(fit);

  // ---- 5b. the outfit's extra pieces (the fabric across her cleavage, her sneakers): extraPieces.ts ------------------
  const pieces = buildExtraPieces(look, skin, influences, maker, 1);

  // ---- 6. her hair ---------------------------------------------------------------------------------------------------
  let hair: FastHair | null = null;
  if (look.manifest.hair) {
    say('hair');
    hair = await loadFastHair(look.manifest.hair, skin, options.hairStrands !== false, options.faceLocks === true);
  }

  // ---- 7. her skeleton and how she moves ---------------------------------------------------------------------------
  let motion = new BodyMotion(file.scene, skin, GRIP_CURL, look.manifest.motion);
  /** The top of her bare head over the floor as she stands (her sneakers' soles under her), metres. */
  let crownOverFloor = look.manifest.barefootHeightMetres;
  // One frame of standing, then she is measured as she stands: how tall, where her soles are, which way she faces.
  motion.update(0, 0, 0, body.belly);
  root.updateMatrixWorld(true);
  {
    const point = new THREE.Vector3();
    let top = -Infinity, bottom = Infinity, front = 0, back = 0;
    const pelvis = skin.skeleton.bones[motion.measure.joints.pelvis].getWorldPosition(new THREE.Vector3());
    const points = skin.geometry.getAttribute('position').count;
    for (let i = 0; i < points; i += 2) {
      skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld);
      if (point.y > top) top = point.y;
      if (point.y < bottom) bottom = point.y;
      // (her belly says which way is forward: at its height far more of her reaches one way than the other)
      if (Math.abs(point.y - pelvis.y) < 0.12 * (top - bottom || 1)) { front = Math.max(front, point.z - pelvis.z); back = Math.max(back, pelvis.z - point.z); }
    }
    // The size she is in the builder's room, sole to crown, barefoot (the bake measured it the same way).
    const scale = look.manifest.barefootHeightMetres / Math.max(1e-6, top - bottom);
    fit.scale.setScalar(scale);
    // What she stands on: her own soles, or her sneakers' if she wears them.
    let lowest = bottom;
    for (const mesh of pieces.meshes) {
      const piecePoints = mesh.geometry.getAttribute('position').count;
      for (let i = 0; i < piecePoints; i += 2) lowest = Math.min(lowest, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y);
    }
    crownOverFloor = (top - lowest) * scale;
    fit.position.y = -lowest * scale;
    // WHICH WAY SHE FACES is read from her skeleton: with her left shoulder on one side and "up" above her, forward is
    // the third direction (left x up). Her belly's reach was used before, and got it wrong for a body without the
    // builder's baked shape, whose bottom reaches further back than her belly reaches forward of her pelvis bone:
    // she stood back to front, her arms aiming behind her (Joshua, 2026-11-17: "the arms are facing backwards").
    {
      const left = skin.skeleton.bones[motion.measure.joints.shoulderL].getWorldPosition(new THREE.Vector3());
      const right = skin.skeleton.bones[motion.measure.joints.shoulderR].getWorldPosition(new THREE.Vector3());
      const forward = left.sub(right).cross(new THREE.Vector3(0, 1, 0));
      // (her belly's vote is kept only for a skeleton whose shoulders tell nothing)
      if (forward.lengthSq() > 1e-10 ? forward.z < 0 : back > front) fit.rotation.y = Math.PI;
    }
    root.updateMatrixWorld(true);
    // (her stride is measured in her skeleton's own units against the world, so it is measured again at her real size)
    motion.dispose();
    motion = new BodyMotion(file.scene, skin, GRIP_CURL, look.manifest.motion);
    // HER STRIDE, MEASURED FROM HER FOOT BONES as she stands here at her real size (bodyMotion.ts `measureStrides`)
    motion.measureStrides(root, body.belly);
    motion.update(0, 0, 0, body.belly);
    root.updateMatrixWorld(true);
  }

  // ---- 7b. her skin breathes (skinBreath.ts: the builder's own breathing, fitted to this body) ---------------------
  // Her skin's own units to her REST FRAME: metres, her soles on the floor, facing +z. That is the heroine's root as
  // she stands here, so it is "her skin's place in the world, seen from her root". (The builder's `restOfMesh`: her
  // skin's bind, carried by her first bone, in her mesh's place.)
  const meshToRest = (() => {
    const first = skin.skeleton.bones[0];
    const held = new THREE.Matrix4().copy(skin.bindMatrixInverse).multiply(first.matrixWorld).multiply(skin.skeleton.boneInverses[0]).multiply(skin.bindMatrix);
    return new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(skin.matrixWorld).multiply(held);
  })();
  const breath = new SkinBreath(meshToRest, look.manifest.weeks ?? weekForBump(body.belly));
  const layBreath = (): void => breath.lay(body.points, fullIndex, skin, holdIndex, holdWeight);
  layBreath();
  breath.patch(materials.fine);
  breath.patch(materials.plain);
  // (what she wears over her TRUNK breathes with it: the fabric across her cleavage, or it would sink into her chest.
  //  Her sneakers do not: they are nowhere near her breathing, and their points are stored in a space of their own,
  //  which the breathing read as part of her trunk: it pulled a long white spike out of each toe.)
  {
    const point = new THREE.Vector3();
    root.updateMatrixWorld(true);
    for (const mesh of pieces.meshes) {
      const count = mesh.geometry.getAttribute('position').count;
      let top = -Infinity;
      for (let i = 0; i < count; i += 3) top = Math.max(top, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y);
      if (top - root.position.y < look.manifest.barefootHeightMetres * 0.45) continue;   // (it is all below her hips)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) breath.patch(material);
    }
  }
  /** Her vitals as the game last gave them; until it does, a quiet breath at rest (14 a minute, half a litre). */
  let vitals: BodyVitals | null = null;
  /** The hidden live body, once it has been opened and attached; and how long its steps take, milliseconds, smoothed. */
  let live: LiveBody | null = null, liveMs = 0;
  /** A clock that runs at the speed of her breathing, for her bones' own small breathing move (the builder's stand). */
  let breathClock = 0;

  const bones = skin.skeleton.bones, joints = motion.measure.joints;
  // HER FEET ON THE FLOOR (footGround.ts): she is lowered onto the foot that carries her and moved over it, a knee
  // bends rather than a foot going through the floor, and she steps round when her legs turn on the spot. Made now,
  // while she stands, because it measures where her ankles are when her feet are flat on the floor.
  root.updateMatrixWorld(true);
  const ground = new FootGround(root, fit,
    { hip: bones[joints.hipL], knee: bones[joints.kneeL], ankle: bones[joints.ankleL] },
    { hip: bones[joints.hipR], knee: bones[joints.kneeR], ankle: bones[joints.ankleR] }, motion.legMetres);
  const bone = (index: number): THREE.Bone => bones[index];
  const arm = (side: number, shoulder: number, elbow: number, wrist: number): ArmBones => ({
    side, upper: bone(shoulder), fore: bone(elbow), hand: bone(wrist), knuckles: findKnuckles(bone(wrist)),
  });
  // (which side is her left along X is measured from her joints, not assumed)
  const leftSign = Math.sign(bone(joints.shoulderL).getWorldPosition(new THREE.Vector3()).x - bone(joints.shoulderR).getWorldPosition(new THREE.Vector3()).x) || 1;
  const arms = { left: arm(leftSign, joints.shoulderL, joints.elbowL, joints.wristL), right: arm(-leftSign, joints.shoulderR, joints.elbowR, joints.wristR) };
  // HER SIZES FOR CROUCHING AND CRAWLING (groundPose.ts), measured from her own bones as she stands now (metres), and
  // the middle of her hips in her model's group (`fit`): the point her body is tipped forward about to lie down.
  root.updateMatrixWorld(true);
  const sizes: BodySizes = (() => {
    const at = (i: number): THREE.Vector3 => bones[i].getWorldPosition(new THREE.Vector3());
    const hip = at(joints.hipL), knee = at(joints.kneeL), ankle = at(joints.ankleL);
    const shoulder = at(joints.shoulderL), elbow = at(joints.elbowL), wrist = at(joints.wristL), base = root.position.y;
    // (her arm from shoulder to the middle of her hand: 8 cm past her wrist)
    return { thigh: hip.distanceTo(knee), shin: knee.distanceTo(ankle), arm: shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) + 0.08,
      hipHeight: hip.y - base, shoulderHeight: shoulder.y - base };
  })();
    /** Getting down: how far along each step she is (groundPose.ts `downSteps`), and where a joint is (reused). */
  const steps = { kneel: 0, oneKnee: 0, fours: 0, prone: 0 };
  const padAt = new THREE.Vector3();
  /** The joints kept above the ground getting down, with the flesh round each (STANCE.groundPad). */
  const GROUND_PADS: ReadonlyArray<readonly [keyof typeof joints, number]> = [
    ['kneeL', STANCE.groundPad.knee], ['kneeR', STANCE.groundPad.knee], ['ankleL', STANCE.groundPad.ankle], ['ankleR', STANCE.groundPad.ankle],
    ['wristL', STANCE.groundPad.wrist], ['wristR', STANCE.groundPad.wrist], ['elbowL', STANCE.groundPad.elbow], ['elbowR', STANCE.groundPad.elbow],
    ['head', STANCE.groundPad.head], ['pelvis', STANCE.groundPad.pelvis],
  ];
  /** Her toes: the bone past each ankle (the ball of her foot), found from her bind; kept above the ground too. */
  const toeBones = [joints.ankleL, joints.ankleR].map((ankle) => motion.bind.findIndex((b) => b.parent === ankle)).filter((k) => k >= 0);
const hipsInFit = fit.worldToLocal(bones[joints.hipL].getWorldPosition(new THREE.Vector3()).add(bones[joints.hipR].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5));
  // HER SHOULDER WIDTH (shoulder joint to shoulder joint, as she stands now): her feet stand this far apart, and a crab
  // step goes this far (footGround.ts)
  ground.shoulderWidth = new THREE.Vector3().setFromMatrixPosition(arms.left.upper.matrixWorld)
    .distanceTo(new THREE.Vector3().setFromMatrixPosition(arms.right.upper.matrixWorld));
  // TWO TONES (outfitMaterial.ts `twoTone`): her arms' bones, every one from each shoulder joint out to her fingertips,
  // wear the top colour all down her arms; and her feet's height as baked, for the line across her trunk
  if ('setToneArms' in materials) {
    const armBones: number[] = [];
    for (const shoulder of [arms.left.upper, arms.right.upper]) shoulder.traverse((node) => { const i = bones.indexOf(node as THREE.Bone); if (i >= 0) armBones.push(i); });
    (materials as SkinMaterials).setToneArms(armBones, skin.geometry.boundingBox!.min.y);
  }
  const aim = new ArmAim({ spine: bone(joints.spine), chest: bone(joints.chest), ...arms });
  // Her head: the builder's `head` joint is the very top of her head (a tip that carries nothing); the bone that
  // carries her skull, face and hair is its parent.
  const crown = bone(joints.head);
  const skull = crown.parent && (crown.parent as THREE.Bone).isBone && crown.parent !== bone(joints.neck) ? (crown.parent as THREE.Bone) : crown;
  // (the base of her neck: her torso's line runs from her pelvis to it)
  const neckBone = bone(joints.neck);
  // HER HEAD'S OWN FORWARD AND UP, in her skull's own space (her skull as she stands, level, facing ahead): her head's
  // tip is measured along it, and the first-person camera looks down it. Her camera's turn in that space follows.
  skull.updateWorldMatrix(true, false);
  const headForwardLocal = new THREE.Vector3(), headUpLocal = new THREE.Vector3(), cameraInHead = new THREE.Quaternion();
  {
    const q = skull.getWorldQuaternion(new THREE.Quaternion()).invert(), r = root.getWorldQuaternion(new THREE.Quaternion());
    headForwardLocal.set(0, 0, 1).applyQuaternion(r).applyQuaternion(q).normalize();
    headUpLocal.set(0, 1, 0).applyQuaternion(r).applyQuaternion(q);
    headUpLocal.addScaledVector(headForwardLocal, -headUpLocal.dot(headForwardLocal)).normalize();
    // (a camera looks down its own -Z with +Y up: those, in her skull's space)
    const back = headForwardLocal.clone().negate(), right = new THREE.Vector3().crossVectors(headUpLocal, back);
    cameraInHead.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, headUpLocal, back));
  }
  const eyeSkull = new THREE.Vector3(), eyeQ = new THREE.Quaternion();
  /** How far ahead of the middle of her eyes her face (her nose's tip) is, metres: measured from her skin, once. */
  let faceAhead = NaN;
  /** The player's own offset for the first-person camera, forward (+) or back, metres (Settings). */
  let eyeForward = 0, eyeHigher = 0;
  // HER BACK, for turning her shoulders further than her belly: every bone from her lower spine up to her chest (the
  // bone her arms and neck hang from), found by walking down from her chest. Her neck up to her skull, for her head.
  // And the bone that is turned for her hips: the one her legs and her spine both hang from, or the bone above it
  // when there is one (on her skeleton that one stands between her hip joints, so her hips turn about their middle).
  const backBones: THREE.Bone[] = [];
  for (let b: THREE.Object3D | null = bone(joints.chest); b && (b as THREE.Bone).isBone; b = b.parent) {
    backBones.unshift(b as THREE.Bone);
    if (b === bone(joints.spine)) break;
  }
  const neckBones: THREE.Bone[] = skull === bone(joints.neck) ? [skull] : [bone(joints.neck), skull];

  // HER HEAD, FOLDED AWAY IN FIRST PERSON (see the top of this file). The bones that are her head: her skull and
  // everything hanging from it (the top of her head, her jaw and eyes if she has them), by their numbers in her
  // skeleton, which is how her skin names them.
  const headBones: number[] = [];
  skull.traverse((node) => { const k = skin.skeleton.bones.indexOf(node as THREE.Bone); if (k >= 0 && headBones.length < HEAD_GLSL_BONES) headBones.push(k); });
  const headUniforms = {
    uHideHead: { value: 0 },
    uHeadBones: { value: Array.from({ length: HEAD_GLSL_BONES }, (_, i) => headBones[i] ?? -1) },
  };
  /** Add the folding to a material's shader (after anything it already adds). Only the camera's picture uses it. */
  const hideHeadPatch = (material: THREE.Material): void => {
    const before = material.onBeforeCompile, key = material.customProgramCacheKey;
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      Object.assign(shader.uniforms, headUniforms);
      // HIDDEN, NOT MOVED (Joshua, 2026-11-20: "don't scale the head down or anything, just hide it (shadows stay)"):
      // each point carries the share of it her head's bones move (`vHeadShare`); where that is over half, the camera's
      // picture leaves the pixel out. Nothing of her is moved or shrunk, her neck included; her shadow is drawn with
      // three.js's own shader, which this is not in, so it keeps her whole head.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uHideHead;\nuniform float uHeadBones[${HEAD_GLSL_BONES}];\nvarying float vHeadShare;`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
vHeadShare = 0.0;
if (uHideHead > 0.5) {
  for (int b = 0; b < ${HEAD_GLSL_BONES}; b++) {
    float bone = uHeadBones[b];
    if (bone < 0.0) continue;
    vHeadShare += (abs(skinIndex.x - bone) < 0.5 ? skinWeight.x : 0.0) + (abs(skinIndex.y - bone) < 0.5 ? skinWeight.y : 0.0)
                + (abs(skinIndex.z - bone) < 0.5 ? skinWeight.z : 0.0) + (abs(skinIndex.w - bone) < 0.5 ? skinWeight.w : 0.0);
  }
}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uHideHead;\nvarying float vHeadShare;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (uHideHead > 0.5 && vHeadShare > 0.5) discard;`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|hidehead`; };
    material.needsUpdate = true;
  };
  hideHeadPatch(materials.fine);
  hideHeadPatch(materials.plain);
  /**
   * HER HAIR HIDDEN FROM HER OWN CAMERA AS HER HEAD IS (Joshua, 2026-11-20: "Head is good, but no hair in the shadow"):
   * every pixel of it left out of the camera's picture in first person (`uHideHead`), nothing moved. It had been put on
   * the shadow-only layer, but three.js draws into a shadow only what the MAIN camera's layers see, so her hair dropped
   * out of her shadow too; her shadow is drawn with three.js's own shader, which this is not in, so it keeps her hair.
   */
  const hideHairPatch = (material: THREE.Material): void => {
    if (material.userData.hideHair) return;
    material.userData.hideHair = true;
    const before = material.onBeforeCompile, key = material.customProgramCacheKey;
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      shader.uniforms.uHideHead = headUniforms.uHideHead;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uHideHead;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (uHideHead > 0.5) discard;`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|hidehair`; };
    material.needsUpdate = true;
  };
  /** Her hair: drawn in third person; in first person hidden from her camera (its shadow kept: `hideHairPatch`). */
  const showHair = (detail: Detail = drawnDetail): void => {
    if (!hair) return;
    hair.show(detail, true);
    for (const mesh of [hair.full, hair.light]) {
      if (!mesh) continue;
      mesh.layers.set(0);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) hideHairPatch(material);
    }
  };
  const pelvisBone = bone(joints.pelvis);
  const hipsBone = pelvisBone.parent && (pelvisBone.parent as THREE.Bone).isBone ? (pelvisBone.parent as THREE.Bone) : pelvisBone;
  /** How her hips and legs are turned this frame (one object, rewritten each frame: footGround.ts reads it). */
  const legTwist: LegTwist = { hipsBone, hips: 0, upperLegs: 0, feet: 0 };
  /** Going sideways this frame (the crab step), refilled each frame. */
  const crabMove: CrabMove = { x: 0, z: 0, speed: 0, lead: 0, style: 0, hop: 0 };
  /** The game holds her facing and she side-steps (`setSideSteps`): her pace level then, or null. */
  let sideLevel: number | null = null;

  // HER ARMS KEEP CLEAR OF HER BELLY AND HER BREASTS (armClear.ts; Joshua, 2026-11-17: "a simple collision to prevent
  // the arms from crossing into the belly", "don't forget about the breasts"). Her belly and each breast are measured
  // from her own skin as egg shapes, here and again whenever her belly's size changes; each rides on the bone that
  // carries most of it. Made now, while she stands.
  root.updateMatrixWorld(true);
  const armClear = new ArmClear(root, bones, arms.left, arms.right);
  const measureEggs = ((): (() => Egg[]) => {
    // (her trunk's bones: her hips and her back, not her arms or legs; and the heights her belly and bust lie between)
    const isTrunk = new Uint8Array(bones.length);
    for (const b of [hipsBone, pelvisBone, ...backBones]) { const k = bones.indexOf(b); if (k >= 0) isTrunk[k] = 1; }
    const inFrame = (b: THREE.Bone): THREE.Vector3 => root.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    const hips = Math.min(inFrame(bone(joints.hipL)).y, inFrame(bone(joints.hipR)).y);
    const underBust = inFrame(backBones[Math.max(0, backBones.length - 2)]).y, lowerSpine = inFrame(backBones[0]).z;
    const shoulders = Math.max(inFrame(bone(joints.shoulderL)).y, inFrame(bone(joints.shoulderR)).y);
    return () => {
      const skinNow = { points: body.points, toFrame: meshToRest, skinIndex: holdIndex, skinWeight: holdWeight, isTrunk };
      return [fitBelly(skinNow, hips, underBust, lowerSpine), ...fitBreasts(skinNow, underBust - 0.01, shoulders)];
    };
  })();
  /** Her belly's and breasts' eggs as last measured (a holstered gun's room is added to these: holsterRoom). */
  let bodyEggs = measureEggs();
  armClear.setEggs(bodyEggs);
  armClear.setLegs([
    { hip: bones[joints.hipL], knee: bones[joints.kneeL], ankle: bones[joints.ankleL] },
    { hip: bones[joints.hipR], knee: bones[joints.kneeR], ankle: bones[joints.ankleR] },
  ]);

  // HER JOINTS STAY WITHIN WHAT A REAL BODY CAN DO (jointGuard.ts; Joshua, 2026-11-17): shoulders, elbows, wrists,
  // hips, knees and ankles kept within the normal ranges, a little looser. Made now, while she stands at rest.
  const joints2 = new JointGuard(root, bone(joints.chest), pelvisBone, [arms.left, arms.right], [
    { side: leftSign, hip: bones[joints.hipL], knee: bones[joints.kneeL], ankle: bones[joints.ankleL] },
    { side: -leftSign, hip: bones[joints.hipR], knee: bones[joints.kneeR], ankle: bones[joints.ankleR] },
  ]);
  // HER HANDS REACH FOR THINGS, AND SHE GETS DOWN TO THEM (handReach.ts, lowerBody.ts; Joshua, 2026-11-17: the weapon
  // table). Made now, while she stands at rest.
  const reach = new HandReach(root, [arms.left, arms.right]);
  // HER FINGERS CLOSED ONTO WHAT SHE HOLDS, each one until it touches (fingerTouch.ts: a pole, a rail)
  const touch = new FingerTouch(motion, [arms.left.hand, arms.right.hand], root);
  const lower = new LowerBody(root, hipsBone, backBones,
    [{ hip: bones[joints.hipL], knee: bones[joints.kneeL], ankle: bones[joints.ankleL] },
     { hip: bones[joints.hipR], knee: bones[joints.kneeR], ankle: bones[joints.ankleR] }],
    bone(joints.shoulderL), bone(joints.wristL), leftSign, bone(joints.shoulderR));
  /** Where her hands are reaching (the middle of the hands that have a job), for her body to get down to. */
  const reachPoint = new THREE.Vector3(), reachOne = new THREE.Vector3();
  /** What her body keeps off (the table's near face), and scratch for her belly's furthest point toward it. */
  let keepFace: { point: THREE.Vector3; outward: THREE.Vector3; top: number } | null = null;
  const bellyAt = new THREE.Vector3(), toward = new THREE.Vector3(), bellyLow = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
  /** How close her belly may come to what it keeps off, metres. */
  const KEEP_GAP = 0.02;
  const upQuaternion = new THREE.Quaternion(), heldQuaternion = new THREE.Quaternion(), UP_AXIS = new THREE.Vector3(0, 1, 0);
  /** Turn a bone about the world's upright axis by `angle` (radians), whatever its parents are doing. */
  /** Turn a bone about a world axis by `angle`, keeping its parent where it is (as turnUpright, about any axis). */
  const turnAbout = (b: THREE.Bone, axis: THREE.Vector3, angle: number): void => {
    if (!b.parent || Math.abs(angle) < 1e-5) return;
    b.parent.getWorldQuaternion(heldQuaternion);
    upQuaternion.setFromAxisAngle(axis, angle);
    b.quaternion.premultiply(heldQuaternion).premultiply(upQuaternion).premultiply(heldQuaternion.invert());
  };
  const tipAxis = new THREE.Vector3();
  // (for `steadyHead`: her skull's forward and up now and as they should be, and the turn between them)
  const nowF = new THREE.Vector3(), nowU = new THREE.Vector3(), nowS = new THREE.Vector3();
  const wantF = new THREE.Vector3(), wantU = new THREE.Vector3(), wantS = new THREE.Vector3();
  const nowBasis = new THREE.Matrix4(), wantBasis = new THREE.Matrix4(), steadyTurn = new THREE.Quaternion();
  const spineAxis = new THREE.Vector3();
  /** How far her head's frame leans with her torso this frame, radians (her torso's lean; none from a jog up). */
  let headFrameLean = 0;
  /**
   * HER TORSO'S FRAME: her body's way `yaw` leaned forward by `lean` (radians): its forward, up and side (her left as
   * the compass turns), written into torsoF, torsoU, torsoS.
   */
  const torsoF = new THREE.Vector3(), torsoU = new THREE.Vector3(), torsoS = new THREE.Vector3();
  const torsoFrame = (yaw: number, lean: number): void => {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sl = Math.sin(lean), cl = Math.cos(lean);
    torsoF.set(sy * cl, -sl, cy * cl);
    torsoU.set(sy * sl, cl, cy * sl);
    torsoS.crossVectors(torsoU, torsoF);
  };
  /**
   * A way in the world (its compass angle FROM HER BODY'S WAY, and its pitch) as her head's turn and tip in her torso's
   * frame: tipped q up from her torso's line and swung r about her torso's up, a head looks along
   * (cos q cos r) forward + (cos q sin r) side + (sin q) up; so q = asin of its up part, r = the angle of the rest.
   * Returns [r, q - lean] (the tip as the player's pitch is: her torso's line is `lean` below level).
   */
  const sideAndTip = (fromBody: number, pitch: number): [number, number] => {
    torsoFrame(0, headFrameLean);
    wayNow.set(Math.sin(fromBody) * Math.cos(pitch), Math.sin(pitch), Math.cos(fromBody) * Math.cos(pitch));
    const q = Math.asin(Math.max(-1, Math.min(1, wayNow.dot(torsoU))));
    return [Math.atan2(wayNow.dot(torsoS), wayNow.dot(torsoF)), q - headFrameLean];
  };
  const wayNow = new THREE.Vector3(), rightNeat = new THREE.Vector3();
  const skullWorldQ = new THREE.Quaternion(), skullParentQ = new THREE.Quaternion();
  /**
   * Turn her skull (about its own base): from her body's way `yaw`, tipped `tip` from her torso's line (radians; past
   * straight down too) and swung `side` about her torso's up, both fixed to her torso's angle, no roll of its own. Her
   * neck is left as it is. (See "HER HEAD HELD STEADY" and "HER HEAD TURNS ABOUT HER TORSO".)
   */
  const steadyHead = (yaw: number, tip: number, side: number): void => {
    if (!skull.parent) return;
    skull.updateWorldMatrix(true, false);
    skull.getWorldQuaternion(skullWorldQ);
    nowF.copy(headForwardLocal).applyQuaternion(skullWorldQ);
    nowU.copy(headUpLocal).applyQuaternion(skullWorldQ);
    nowS.crossVectors(nowF, nowU).normalize();
    nowU.crossVectors(nowS, nowF).normalize();
    // FIXED TO HER TORSO'S ANGLE (Joshua, 2026-11-20: "The head's yaw and pitch need to be fixed to the torso's
    // angle"): as a gimbal sitting on her torso, her head is swung `side` about her torso's up, then tipped `tip` from
    // her torso's line, no roll of its own. Standing, her torso's up is the world's: an ordinary turn, level whatever
    // the tip. Leaning in, the turn goes with her torso.
    torsoFrame(yaw, headFrameLean);
    rightNeat.copy(torsoF).applyAxisAngle(torsoU, side);   // (her torso's forward, swung)
    const ct = Math.cos(tip), st = Math.sin(tip);
    wantF.copy(rightNeat).multiplyScalar(ct).addScaledVector(torsoU, st);
    wantU.copy(rightNeat).multiplyScalar(-st).addScaledVector(torsoU, ct);
    wantS.crossVectors(wantF, wantU).normalize();
    // (the turn that takes the one set of directions onto the other: want · now⁻¹; a basis's inverse is its transpose)
    nowBasis.makeBasis(nowF, nowU, nowS);
    wantBasis.makeBasis(wantF, wantU, wantS);
    steadyTurn.setFromRotationMatrix(wantBasis.multiply(nowBasis.transpose()));
    // (laid on her skull in the world, then written back as a turn from its parent)
    skullWorldQ.premultiply(steadyTurn);
    skull.parent.getWorldQuaternion(skullParentQ);
    skull.quaternion.copy(skullParentQ.invert().multiply(skullWorldQ));
    skull.updateMatrixWorld(true);
  };
  const turnUpright = (b: THREE.Bone, angle: number): void => {
    if (!b.parent || Math.abs(angle) < 1e-5) return;
    b.parent.getWorldQuaternion(heldQuaternion);
    upQuaternion.setFromAxisAngle(UP_AXIS, angle);
    // local' = parent⁻¹ · turn · parent · local
    b.quaternion.premultiply(heldQuaternion).premultiply(upQuaternion).premultiply(heldQuaternion.invert());
  };

  // Her height with her hair, as she stands (a sample of her hair's points over the top of her skin).
  let height = crownOverFloor;
  if (hair) {
    const point = new THREE.Vector3(), mesh = hair.full, points = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < points; i += 5) { const y = mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y; if (y > height) height = y; }
  }

  // ---- 8. her guns: each one a child of its hand's bone, so it costs nothing to move ---------------------------------
  // (her guns in her outfit's colours: looks/gear.ts)
  const gunColours = lookGear?.gun;
  const guns: Record<Hand, Gun> = { left: createGun(gunColours), right: createGun(gunColours) };
  /** Where each gun sits in its hand (in the hand bone's frame): kept, so a gun put down can be taken up again exactly. */
  const seat: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  for (const hand of ['left', 'right'] as const) {
    // (worked out as she stands now, facing +Z, in metres: guns.ts)
    seatGunInHand(arms[hand], 1, seat[hand]);
    guns[hand].object.matrix.copy(seat[hand]);
    arms[hand].hand.add(guns[hand].object);
  }
  // ---- 8b. her belt, thigh holsters and clip pouches (beltGear.ts; Joshua, 2026-11-18): made now, while her arms
  // hang relaxed, so each holster sits where her hand hangs. The belt follows her leggings' waistband.
  const gear: BeltGear = buildBeltGear({
    root, skin, belly: body.belly, points: body.points, meshToRest, skinIndex: holdIndex, skinWeight: holdWeight,
    motionMoves: MOTION_SHAPES.map((_, k) => body.motionMoves(k)), influences,
    uv: layout, picture: (look.albedo.image as CanvasImageSource | undefined) ?? null, pictureFlipY: look.albedo.flipY,
    trunkBones: [hipsBone, pelvisBone, ...backBones],
    thighBone: { left: bones[joints.hipL], right: bones[joints.hipR] },
    leftSign,
    gunHanging: {
      left: new THREE.Matrix4().copy(arms.left.hand.matrixWorld).multiply(seat.left),
      right: new THREE.Matrix4().copy(arms.right.hand.matrixWorld).multiply(seat.right),
    },
    // (the outfit's own colours for it: looks/gear.ts)
    colours: lookGear?.belt,
    gunColours,
    line: lookGear?.beltLine,
    holsters: lookGear?.holsters,
    pouches: lookGear?.pouches,
  });
  /** The thighs with a holster drawn (an outfit may have one: looks/gear.ts); a gun put away on the other is stowed out of sight. */
  const holstered = lookGear?.holsters ?? (['left', 'right'] as const);
  // ---- 8c. the outfit's fitted pieces (suitGear.ts; Joshua, 2026-11-18, the gray and red suit): tall flat boots, wrist
  // cuffs and shoulder plates, each a shell shaped round her own skin on one bone. Made now, while she stands.
  const piecesStyle = lookGear?.pieces;
  const suit: SuitGear | null = piecesStyle ? buildSuitGear({
    skin, points: body.points, skinIndex: holdIndex, skinWeight: holdWeight, root, leftSign,
    arm: { left: { upper: arms.left.upper, fore: arms.left.fore, hand: arms.left.hand }, right: { upper: arms.right.upper, fore: arms.right.fore, hand: arms.right.hand } },
    leg: {
      left: { thigh: bones[joints.hipL], shin: bones[joints.kneeL], foot: bones[joints.ankleL] },
      right: { thigh: bones[joints.hipR], shin: bones[joints.kneeR], foot: bones[joints.ankleR] },
    },
    neck: { neck: neckBone, skull },
  }, piecesStyle) : null;
  const handIndex = (hand: Hand): 0 | 1 => (hand === 'left' ? 0 : 1);
  /** Each hand's reach is to something within reach as she stands (her own holster): her body does not get down to it. */
  const stayUp: [boolean, boolean] = [false, false];
  /**
   * HER FREE HAND HANGS BESIDE A HOLSTERED GUN, NOT THROUGH IT (Joshua, 2026-11-18): while a gun is in its holster,
   * the room it takes (an egg on her thigh: beltGear.ts) is one more thing her arms keep clear of (armClear.ts), as her
   * belly is. Not while that hand reaches for it (it must get to the grip). Given to her arms only when that changes.
   */
  let roomFor = '';
  const holsterRoom = (): void => {
    // (only where a holster is drawn: Look 2 has none on her left, and keeping clear of the room a gun there would take,
    //  stowed out of sight, pulled her empty left hand forward across her thigh and her forearm in flat: Joshua,
    //  2026-11-20, "her arm is flat like a pancake")
    const sides = (['left', 'right'] as const).filter((hand) => holstered.includes(hand) && guns[hand].object.parent === gear.holsterBone(hand) && reach.weight(handIndex(hand)) <= 0 && !reach.hasJob(handIndex(hand)));
    const key = sides.join(',');
    if (key === roomFor) return;
    roomFor = key;
    armClear.setEggs([...bodyEggs, ...sides.map((hand) => gear.holsterEgg(hand))]);
  };
  /** Whether each hand holds its gun (its fingers may close on other things too: a clip). */
  const gunIn: Record<Hand, boolean> = { left: true, right: true };
  const gunSeen = new THREE.Matrix4();
  // HER HAND TO HER BELLY WHEN THE BABY KICKS (bellyTouch.ts; Joshua, 2026-11-20): a free hand's palm laid on the spot
  // for 3 s. A hand is free with no gun in it, holding nothing, and no job of the game's.
  // (her trunk's bones, for finding her belly's own skin: her hips and her back)
  const trunkBone = new Uint8Array(bones.length);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const curveWay = new THREE.Vector3();
  for (const b of [hipsBone, pelvisBone, ...backBones]) { const k = bones.indexOf(b); if (k >= 0) trunkBone[k] = 1; }
  // HER FINGERS', THUMBS' AND PALMS' THICKNESS, measured from her own skin (handPads.ts): every hand job lays her skin,
  // not her bones, on what it touches
  try {
    touch.pads = measureHandPads({
      skin, fingers: motion.fingers, hands: [arms.left.hand as THREE.Bone, arms.right.hand as THREE.Bone], palmOf: (hand) => touch.palmFace(hand),
      straighten: () => { motion.fingers.forEach((_, i) => motion.curlFinger(i, 0)); root.updateMatrixWorld(true); },
    });
    console.info('[hand pads]', JSON.stringify({ palm: touch.pads.palm.map((v) => +(v * 1000).toFixed(1)), fingers: touch.pads.pad.map((f, i) => ({ hand: motion.fingers[i].hand, thumb: motion.fingers[i].thumb, mm: f.map((v) => +(v * 1000).toFixed(1)), outside: touch.pads?.side[i]?.map((v) => +(v * 1000).toFixed(1)) })) }));
  } catch (error) { console.warn('Her hands\' thickness could not be measured; the usual sizes serve.', error); }
  const bellyHand: BellyTouch = new BellyTouch({
    // (how far a hand reaches: its upper arm and forearm, nearly straight)
    armLength: (hand) => { const a = hand === 0 ? arms.left : arms.right; return (a.upper.getWorldPosition(v1).distanceTo(a.fore.getWorldPosition(v2)) + v2.distanceTo(a.hand.getWorldPosition(v1))) * 0.95; },
    restToWorld: (point, out, direction) => armClear.restToWorld(point, out, direction),
    insideBelly: (point, grow) => armClear.insideBelly(point, grow),
    shoulder: (hand, out) => out.setFromMatrixPosition(hand === 0 ? arms.left.upper.matrixWorld : arms.right.upper.matrixWorld),
    free: (hand): boolean => !gunIn[hand === 0 ? 'left' : 'right'] && !windedJob[hand] && (bellyHand.holds(hand) || touch.shapes[hand] === null && !reach.hasJob(hand)),
    // (a spot on her belly's egg, as she stood: `round` round from her front, `up` up it; the way out of it there)
    onBelly: (round, up, spot, out) => {
      const e = armClear.eggs[0];
      if (!e) return false;
      const d = v1.set(Math.sin(round), up, Math.cos(round)).normalize();
      spot.set(e.cx + e.rx * d.x, e.cy + e.ry * d.y, e.cz + e.rz * d.z);
      out.set(d.x / e.rx, d.y / e.ry, d.z / e.rz).normalize();
      return true;
    },
    // (the place opposite a spot round her belly's middle: turned about the line straight out of its front)
    opposite: (spot, turn, outSpot, outOut) => {
      const e = armClear.eggs[0];
      if (!e) return false;
      const ux = (spot.x - e.cx) / e.rx, uy = (spot.y - e.cy) / e.ry, uz = (spot.z - e.cz) / e.rz;
      const c = Math.cos(turn), sn = Math.sin(turn);
      const d = v1.set(ux * c - uy * sn, ux * sn + uy * c, uz).normalize();
      outSpot.set(e.cx + e.rx * d.x, e.cy + e.ry * d.y, e.cz + e.rz * d.z);
      outOut.set(d.x / e.rx, d.y / e.ry, d.z / e.rz).normalize();
      return true;
    },
    // HER SKIN AT THE SPOT, ITSELF (Joshua, 2026-11-20: "lock in around 2mm of the belly's live skin"; "re-measure and
    // fix"): her trunk's own skin points round the spot, as they lie NOW (skinned, breathing; CPU, a few thousand of
    // them), each taken back to her rest frame, measured onto a grid laid on her skin there (skinPatch.ts); every
    // finger, her thumb and her palm are measured against it. Her points near the spot are found once a touch (from
    // her shaped points, cheap); the grid is read again from them while her hand is there (bellyTouch.ts).
    skinPatch: (spot, out, worldWay) => {
      const geometry = skin.geometry, pos = geometry.getAttribute('position');
      const idx = geometry.getAttribute('skinIndex'), wt = geometry.getAttribute('skinWeight');
      const m = meshToRest.elements, near: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        let top = 0, most = wt.getX(i);
        for (let j = 1; j < 4; j++) { const w = wt.getComponent(i, j); if (w > most) { most = w; top = j; } }
        if (!trunkBone[idx.getComponent(i, top)]) continue;
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const dx = m[0] * x + m[4] * y + m[8] * z + m[12] - spot.x, dy = m[1] * x + m[5] * y + m[9] * z + m[13] - spot.y, dz = m[2] * x + m[6] * y + m[10] * z + m[14] - spot.z;
        if (dx * dx + dy * dy + dz * dz < 0.2 * 0.2) near.push(i);
      }
      const at = new THREE.Vector3();
      const patch = new SkinPatch((visit) => {
        if (skin.geometry !== geometry) return;   // (her detail level changed: the grid keeps what it had)
        for (const i of near) {
          skin.getVertexPosition(i, at);
          armClear.worldToRest(skin.localToWorld(at), at);
          visit(at.x, at.y, at.z);
        }
      });
      const way = armClear.worldToRestDirection(worldWay, curveWay);
      return patch.layOn(spot, out, way) ? patch : null;
    },
    // (a point in the world, how far out of that patch: the hand's own fingers and palm, as posed now)
    worldToRest: (point, out) => armClear.worldToRest(point, out),
    // (her skin's points as shaped, in her rest frame: the outermost of those within 1.5 cm of the line through the spot
    //  along `out`, and no more than 6 cm either side of it: the spot is moved onto it. Only her TRUNK's skin: her arms
    //  hang beside her belly as she stood, and the spot went out onto her arm)
    ontoSkin: (spot, out) => {
      const pts = body.points, m = meshToRest.elements, n = pts.length / 3;
      let best = -Infinity;
      for (let i = 0; i < n; i++) {
        let heaviest = 0;
        for (let k = 1; k < 4; k++) if (holdWeight[i * 4 + k] > holdWeight[i * 4 + heaviest]) heaviest = k;
        if (!trunkBone[holdIndex[i * 4 + heaviest]]) continue;
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const px = m[0] * x + m[4] * y + m[8] * z + m[12] - spot.x, py = m[1] * x + m[5] * y + m[9] * z + m[13] - spot.y, pz = m[2] * x + m[6] * y + m[10] * z + m[14] - spot.z;
        const along = px * out.x + py * out.y + pz * out.z;
        if (along < -0.06 || along > 0.06 || along <= best) continue;
        if (px * px + py * py + pz * pz - along * along < 0.015 * 0.015) best = along;
      }
      if (Number.isFinite(best)) spot.addScaledVector(out, best);
    },
    // (her fingers open a little as her hand comes, then close smoothly round her belly's curve, `gap` off her skin)
    setCurve: (hand, centre, radius, gap, surface) => {
      touch.surface[hand] = surface;
      if (!centre) { touch.shapes[hand] = null; touch.gapMore[hand] = 0; reach.opening[hand] = false; return; }
      const shape = touch.shapes[hand];
      if (shape && shape.kind === 'sphere') { (shape.centre as unknown as number[])[0] = centre.x; (shape.centre as unknown as number[])[1] = centre.y; (shape.centre as unknown as number[])[2] = centre.z; (shape as { radius: number }).radius = radius; }
      else touch.shapes[hand] = { kind: 'sphere', centre: [centre.x, centre.y, centre.z], radius };
      touch.gapMore[hand] = gap;
      reach.opening[hand] = true;
    },
    left: (out) => out.set(1, 0, 0).applyQuaternion(root.quaternion),
    forward: (out) => out.set(0, 0, 1).applyQuaternion(root.quaternion),
    flatPose: (hand, at, palmTo, fingers, out) => touch.flatPose(hand, at, palmTo, fingers, out),
    // (her body does not get down to it: it is her own belly)
    setJob: (hand, pose) => { reach.setJob(hand, pose); stayUp[hand] = pose !== null; },
    moveJob: (hand, pose) => reach.moveJob(hand, pose),
    progress: (hand) => reach.progress(hand),
  });

  // ---- 9. never drawn when she is out of the camera's view --------------------------------------------------------
  // three.js tests a skinned mesh against the view with a ball it would otherwise work out by posing every one of her
  // points on the CPU. She is given a generous ball round her middle instead, in each mesh's own space.
  const viewBall = (mesh: THREE.SkinnedMesh): void => {
    const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const centre = new THREE.Vector3(0, look.manifest.barefootHeightMetres * 0.55, 0).applyMatrix4(toMesh);
    mesh.boundingSphere = new THREE.Sphere(centre, VIEW_BALL_RADIUS / mesh.matrixWorld.getMaxScaleOnAxis());
    mesh.frustumCulled = true;
  };
  viewBall(skin);
  if (hair) { viewBall(hair.full); if (hair.light) viewBall(hair.light); }
  for (const mesh of pieces.meshes) viewBall(mesh);
  for (const mesh of gear.meshes) if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) viewBall(mesh as THREE.SkinnedMesh);

  // ---- 10. detail: what she is drawn at, and what she is asked to be ---------------------------------------------------
  const auto = new AutoDetail();
  auto.target = options.targetFps ?? 30;
  let choice: DetailChoice = options.detail ?? 'auto';
  let drawnDetail: Detail = 100;
  /** The level KEY she is drawn at (shapedBody.ts PLAIN_KEY: the detail, plus PLAIN_KEY when not kept sharp). */
  let drawnKey = 100;
  /** The camera is near her (within SHARP_WITHIN; back out past SHARP_LEAVE): her face, bust and belly kept sharp. */
  let near = true;
  /** How far the camera last was from her middle, metres (written by the draw, below). */
  let cameraDistance = 0;
  let firstPerson = false;
  const waitingFor = new Set<number>();
  /** How tall she was last drawn, in screen pixels: written by the draw itself (below), read by AUTO the next frame. */
  let pixels = 9999;

  /** The level keys she has worn, latest first (see KEEP_LEVELS in `wear`). */
  let worn: number[] = [];
  const wear = (key: number): void => {
    const geometry = body.geometry(key);
    if (!geometry) return;
    const before = drawnKey, detail = detailOfKey(key) as Detail;
    drawnKey = key;
    drawnDetail = detail;
    skin.geometry = geometry;
    // which shapes this level's body carries: all of them live, or only her four motion shapes
    if (body.isLive(key)) { skin.morphTargetDictionary = liveDictionary; skin.morphTargetInfluences = liveInfluences; }
    else { skin.morphTargetDictionary = bakedDictionary; skin.morphTargetInfluences = influences; }
    // (a LIVE level she has left is let go, whatever its size: each carries every one of her 43 body shapes, tens of
    //  megabytes, and with her hands kept sharp too (v0.2.81) the low levels near the camera are nearly as heavy as
    //  the high ones. Kept, Smart FPS stepping 5 -> 3 -> 2 -> 1 % held four of them, near and far, and the iPhone
    //  closed the game a few seconds in (Joshua, 2026-11-19). Coming back to one makes it again in the worker.)
    if (before !== key && body.isLive(before)) body.release(before);
    // A FEW LEVELS KEPT, NOT ALL (the iPhone audit, 2026-11-20): Smart FPS and the camera going near and far step her
    // through many levels (30, 20, 10, 5, 3, 2, 1 %, each sharp and plain), and each one made was kept for good, each a
    // copy of her points with its own copy on the graphics chip. Now only the levels she wore last (KEEP_LEVELS) and
    // her full 100 % are kept; one she comes back to is built again from its kept triangle list (quick).
    if (before !== key) {
      worn = worn.filter((k) => k !== key);
      worn.unshift(key);
      for (const old of worn.splice(KEEP_LEVELS)) if (old !== 100 && old !== key) body.release(old);
    }
    skin.material = detail >= FINE_FROM_DETAIL ? materials.fine : materials.plain;
    showHair(detail);
    pieces.setDetail(detail);
  };
  /**
   * Ask for a level: worn at once if it has been made, otherwise made in the background and worn when ready. Near (or
   * first person) it is the level with her face, bust and belly kept sharp; further off the plain one. 100 % is one.
   */
  const want = (detail: Detail): void => {
    const sharp = keepSharp && (near || firstPerson);
    const key = detail === 100 || sharp ? detail : detail + PLAIN_KEY;
    wantedKey = key;
    if (key === drawnKey) return;
    if (body.has(key)) { wear(key); return; }
    if (waitingFor.has(key)) return;
    waitingFor.add(key);
    (sharp ? levels : plainLevels).get(detail).then((index) => {
      waitingFor.delete(key);
      if (disposed) return;
      // (built and worn only if it is still the level wanted: the player or the camera may have changed it meanwhile.
      //  A level no longer wanted is NOT built: before, it was built anyway and kept, unused (the iPhone audit,
      //  2026-11-20). Its list of triangles is kept by the maker, so building it later is quick.)
      if (wantedKey !== key) return;
      body.build(key, index);
      wear(key);
    }).catch((error: unknown) => { waitingFor.delete(key); console.warn(`[heroine] detail ${detail}% could not be made; she keeps ${drawnDetail}%`, error); });
  };
  let wantedKey = 100;
  let wanted: Detail = 100;

  // The draw tells us the camera: three.js calls this just before her skin is drawn (and not at all when she is out of view).
  const middle = new THREE.Vector3(), eyeAt = new THREE.Vector3(), size = new THREE.Vector2();
  skin.onBeforeRender = (renderer, _scene, camera) => {
    middle.setFromMatrixPosition(root.matrixWorld);
    middle.y += height * 0.5;
    const distance = Math.max(0.05, eyeAt.setFromMatrixPosition(camera.matrixWorld).distanceTo(middle));
    cameraDistance = distance;
    // (near: within SHARP_WITHIN; once near, it takes SHARP_LEAVE to count as far again, so it does not flicker between)
    near = near ? distance < SHARP_LEAVE : distance < SHARP_WITHIN;
    // how many screen pixels her height covers at that distance, through this camera's lens
    renderer.getDrawingBufferSize(size);
    pixels = (height / distance) * camera.projectionMatrix.elements[5] * 0.5 * size.y;
  };

  // ---- 11. compiled and uploaded before she is shown, so her first frame does not stutter ----------------------------
  say('getting her ready to draw');
  if (!painted) for (const picture of [look.albedo, look.normal, look.surface]) options.renderer.initTexture(picture);
  if (options.scene) {
    const camera = new THREE.PerspectiveCamera();
    // (both skin materials, so a change to a light level later compiles nothing)
    await options.renderer.compileAsync(root, camera, options.scene);
    skin.material = materials.plain;
    await options.renderer.compileAsync(skin, camera, options.scene);
    skin.material = materials.fine;
  }
  hair?.show(drawnDetail, true);

  // ---- 12. the heroine the game talks to -----------------------------------------------------------------------------
  /**
   * HER STEPS FOLLOW THE GROUND SHE REALLY COVERS (Joshua, 2026-11-17: "her feet aren't actually driving her along
   * the ground like it should be"): where her root was last frame and which way it faced. The distance between
   * frames, along the way her legs face, is what turns her stride (bodyMotion.ts); the speed the game says she
   * walks at (`setWalk`) is not used.
   */
  let lastX = 0, lastZ = 0, lastYaw = 0, placed = false;
  /** For the lab only: walk her on the spot at this ground speed, metres a second (0: off). */
  let treadmill = 0;
  /** Which way each part of her faces, when the game says so (`setFacing`: its object, read each frame); null: all one way. */
  let facing: BodyFacing | null = null;
  // HER STANCE (groundPose.ts): what the game asked for; how far crouched (0 standing .. 1) and how far down on her
  // belly or hands and knees (0 .. 1, from her crouch), eased; and where she is in her crawl
  let stanceAsked: Stance = 'stand';
  let crouchW = 0, downW = 0, crawlPhase = 0;
  // WINDED (groundPose.ts WINDED; Joshua, 2026-11-20): how far she is bent over, hands on her knees, as the game asks
  // (`setWinded`, eased by the game), smoothed; last frame's (straightening up: her hands come off her knees); and which
  // hands are on her knees
  let windedW = 0, windedS = 0, windedWas = 0, windedRising = false;
  // HER TORSO'S LEAN forward of how she stands, radians (+ forward): the line from her pelvis to the base of her neck,
  // along the way she faces, against how it lies as she stands (measured the first time). Worked out each frame once
  // her body is bent and lowered; her head's up and down are measured from it.
  let torsoLean = 0, leanBase = NaN;
  const leanFrom = new THREE.Vector3(), leanTo = new THREE.Vector3();
  const measureLean = (): void => {
    bone(joints.pelvis).getWorldPosition(leanFrom);
    neckBone.getWorldPosition(leanTo).sub(leanFrom);
    const yaw = root.rotation.y;
    const raw = Math.atan2(leanTo.x * Math.sin(yaw) + leanTo.z * Math.cos(yaw), leanTo.y);
    if (!Number.isFinite(leanBase)) leanBase = raw;
    torsoLean = raw - leanBase;
  };
  // WINDED: the player turned the view (first person): her head is theirs again until she stands up (`freeLook`)
  let windedLookFree = false;
  const headRange: [number, number] = [0, 0];
  const skullQ = new THREE.Quaternion(), headFwd = new THREE.Vector3();
  const windedJob: [boolean, boolean] = [false, false];
  const windedPose: [THREE.Matrix4, THREE.Matrix4] = [new THREE.Matrix4(), new THREE.Matrix4()];
  const kneeAt = new THREE.Vector3(), hipAt = new THREE.Vector3(), thighWay = new THREE.Vector3(), thighFront = new THREE.Vector3();
  const inWay = new THREE.Vector3(), palmOnKnee = new THREE.Vector3(), palmToKnee = new THREE.Vector3(), fingersDown = new THREE.Vector3();
  /**
   * HER HANDS ON HER KNEES WHILE SHE IS WINDED (Joshua: "places both hands (free or holding something small like a gun)
   * just above her knees"): each palm on the front of its own thigh, `WINDED.aboveKnee` up from the knee, fingers down
   * the thigh and a little in; a hand busy with something of the game's is left to it. As she straightens up (the game
   * easing her out), her hands come off first.
   */
  const windedHands = (): void => {
    const want = windedS > 0.05 && windedRising;
    for (const i of [0, 1] as const) {
      if (!want) { if (windedJob[i]) { reach.setJob(i, null); windedJob[i] = false; stayUp[i] = false; } continue; }
      if (!windedJob[i] && reach.hasJob(i) && !bellyHand.holds(i)) continue;
      bones[i === 0 ? joints.hipL : joints.hipR].getWorldPosition(hipAt);
      bones[i === 0 ? joints.kneeL : joints.kneeR].getWorldPosition(kneeAt);
      thighWay.copy(kneeAt).sub(hipAt).normalize();
      // (the front of her thigh: her forward, square to her thigh)
      thighFront.set(0, 0, 1).applyQuaternion(root.quaternion);
      thighFront.addScaledVector(thighWay, -thighFront.dot(thighWay)).normalize();
      palmOnKnee.copy(kneeAt).addScaledVector(thighWay, -WINDED.aboveKnee).addScaledVector(thighFront, WINDED.thighFront);
      palmToKnee.copy(thighFront).negate();
      // (toward her middle: her left leg's is to her right)
      inWay.set(1, 0, 0).applyQuaternion(root.quaternion).multiplyScalar(i === 0 ? -1 : 1);
      fingersDown.copy(thighWay).addScaledVector(inWay, WINDED.fingersIn);
      fingersDown.addScaledVector(thighFront, -fingersDown.dot(thighFront)).normalize();
      touch.flatPose(i, palmOnKnee, palmToKnee, fingersDown, windedPose[i]);
      if (!windedJob[i]) { bellyHand.cancel(i); reach.setJob(i, windedPose[i]); stayUp[i] = true; windedJob[i] = true; }
      else reach.moveJob(i, windedPose[i]);
    }
  };
  const lookSpot = new THREE.Vector3(), skullAt = new THREE.Vector3();
  let downKind: 'prone' | 'fours' = 'prone';
  const stanceOut: MutableJointTurn[] = [];
  const hipsTipped = new THREE.Vector3(), tipQ = new THREE.Quaternion(), X_AXIS = new THREE.Vector3(1, 0, 0), leanAxis = new THREE.Vector3();
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  let target: THREE.Vector3 | null = null;
  let bellyWanted = body.belly, bellyWait = 0;
  let updateMs = 0, lastUpdateAt = performance.now();
  let disposed = false;
  const skullPlace = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), skullScale = new THREE.Vector3();
  /** Her skull's place and turn now, at its true size (it may be shrunk: the old first person folded it away). */
  const skullFrame = (): void => {
    skull.parent?.updateWorldMatrix(true, false);
    skullPlace.compose(skull.position, skull.quaternion, one);
    if (skull.parent) skullPlace.premultiply(skull.parent.matrixWorld);
    skullPlace.decompose(eyeSkull, eyeQ, skullScale);
  };
  /**
   * HOW FAR HER FACE STANDS AHEAD OF HER EYES, metres: of her skin's points carried by her skull, as she is posed now,
   * those within 2 cm of the line straight ahead from between her eyes (side to side) and 5 cm of it (up and down), the
   * furthest forward: the tip of her nose. Once, the first time the camera is placed.
   */
  const measureFace = (): number => {
    skullFrame();
    const eyeAt = new THREE.Vector3().copy(headForwardLocal).multiplyScalar(EYE_AHEAD).addScaledVector(headUpLocal, EYE_ABOVE).applyQuaternion(eyeQ).add(eyeSkull);
    const fwd = headForwardLocal.clone().applyQuaternion(eyeQ), up = headUpLocal.clone().applyQuaternion(eyeQ), side = new THREE.Vector3().crossVectors(fwd, up);
    const index = skin.geometry.getAttribute('skinIndex'), weight = skin.geometry.getAttribute('skinWeight');
    const skullIndex = skin.skeleton.bones.indexOf(skull);
    skin.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let most = 0.01;
    for (let i = 0; i < index.count; i++) {
      let top = 0, heaviest = weight.getX(i);
      for (let j = 1; j < 4; j++) { const w = weight.getComponent(i, j); if (w > heaviest) { heaviest = w; top = j; } }
      if (index.getComponent(i, top) !== skullIndex) continue;
      skin.localToWorld(skin.getVertexPosition(i, v)).sub(eyeAt);
      if (Math.abs(v.dot(side)) > 0.02 || Math.abs(v.dot(up)) > 0.05) continue;
      most = Math.max(most, v.dot(fwd));
    }
    console.info('[first person] her face stands', (most * 100).toFixed(1), 'cm ahead of her eyes');
    return most;
  };
  const megabytes = file.megabytes + look.megabytes + (hair?.megabytes ?? 0);
  const seconds = (performance.now() - began) / 1000;

  const heroine: FastHeroine = {
    root,
    height,
    get ready() { return !disposed; },
    loaded: { megabytes, seconds },
    weeks: look.manifest.weeks ?? weekForBump(body.belly),
    gear,

    setPosition(x: number, z: number, y = 0): void { root.position.set(x, y, z); }, // (y: the ground under her, on the island)
    setYaw(yaw: number): void { root.rotation.set(0, yaw, 0); },
    setFacing(now: BodyFacing | null): void { facing = now; },
    // (crouching, on her belly or on all fours: groundPose.ts; she goes there over a second or so)
    setStance(stance: Stance): void { stanceAsked = stance; },
    // (for test pages: the hand on her belly where the baby kicked, -1 none)
    bellyHandNow(): number { return bellyHand.hand; },
    // (for test pages: HOW FAR EACH PART OF A HAND REALLY IS FROM HER SKIN, mm: her skin posed on the CPU as drawn now,
    //  trunk only, near the hand; each finger bone's middle and end less its pad, the palm's middle less its flesh)
    handGaps(hand: 0 | 1): unknown {
      skin.updateMatrixWorld(true); skin.skeleton.update();
      const handBone = hand === 0 ? arms.left.hand : arms.right.hand, at = handBone.getWorldPosition(new THREE.Vector3());
      const idx = skin.geometry.getAttribute('skinIndex'), wt = skin.geometry.getAttribute('skinWeight');
      const near: THREE.Vector3[] = [];
      for (let i = 0; i < idx.count; i++) {
        let top = 0, most = wt.getX(i);
        for (let j = 1; j < 4; j++) { const w = wt.getComponent(i, j); if (w > most) { most = w; top = j; } }
        if (!trunkBone[idx.getComponent(i, top)]) continue;
        const v = skin.localToWorld(skin.getVertexPosition(i, new THREE.Vector3()));
        if (v.distanceTo(at) < 0.2) near.push(v);
      }
      // (the real skin's nearest point; and, as a second number, what the hand itself measures: its patch)
      const surf = touch.surface[hand];
      const gap = (p: THREE.Vector3): number => { let d = Infinity; for (const v of near) d = Math.min(d, v.distanceTo(p)); return d; };
      const pg = (p: THREE.Vector3): number => surf ? surf(p) : NaN;
      const out: unknown[] = [];
      motion.fingers.forEach((f, i) => {
        if (f.hand !== hand) return;
        // (a thumb laid flat rests on its OUTSIDE: measured with that side's flesh)
        const pads = (f.thumb ? touch.pads?.side[i] : touch.pads?.pad[i]) ?? [];
        out.push({ thumb: f.thumb, mm: f.bones.map((b, k) => {
          const a2 = b.getWorldPosition(new THREE.Vector3()), b2 = (k + 1 < f.bones.length ? f.bones[k + 1] : f.tip).getWorldPosition(new THREE.Vector3());
          const mid = a2.clone().add(b2).multiplyScalar(0.5), pad = pads[k] ?? 0.009;
          return [+((gap(mid) - pad) * 1000).toFixed(1), +((gap(b2) - pad) * 1000).toFixed(1), +((pg(mid) - pad) * 1000).toFixed(1), +((pg(b2) - pad) * 1000).toFixed(1)];
        }) });
      });
      const palm = touch.palmFace(hand).point;
      return { near: near.length, palm: [+((gap(palm) - touch.palmThick(hand)) * 1000).toFixed(1), +((pg(palm) - touch.palmThick(hand)) * 1000).toFixed(1)], fingers: out };
    },
    // (for test pages: each hand's reach this frame: how far it fell short, and its job's weight)
    reachNow(): unknown { return { short: [...reach.short], weight: [reach.weight(0), reach.weight(1)], progress: [reach.progress(0), reach.progress(1)], wrist: reach.wristInfo, guard: { ...joints2.excess }, amount: [...touch.amount], closed: touch.touched.map((t) => Array.from(t).map((v) => Math.round(v))), shape: touch.shapes.map((x) => x ? JSON.stringify(x) : null) }; },
    // (for test pages: a kick on her belly's egg, `round` radians round from her front (+ toward her left), `up` up it)
    pokeBelly(round: number, up = 0, look = false, both: boolean | null = false): void {
      const e = armClear.eggs[0];
      if (!e) return;
      const d = new THREE.Vector3(Math.sin(round), up, Math.cos(round)).normalize();
      const spot = new THREE.Vector3(e.cx + e.rx * d.x, e.cy + e.ry * d.y, e.cz + e.rz * d.z);
      bellyHand.poke(spot, new THREE.Vector3(d.x / e.rx, d.y / e.ry, d.z / e.rz).normalize(), look, both);
    },
    bellyHoldsNow() { return { support: bellyHand.supporting, holds: [bellyHand.holds(0), bellyHand.holds(1)] as [boolean, boolean] }; },
    // HER HANDS TO HER BELLY (bellyTouch.ts): holding it up as she runs, and her look down at a kick (the game's say)
    setBellySupport(on: boolean): void { bellyHand.setSupport(on); },
    setBellyLookAllowed(ok: boolean): void { bellyHand.lookAllowed = ok; },
    bellyLook(out: THREE.Vector3): number { return bellyHand.look(out); },
    stopBellyLook(): void { bellyHand.stopLook(); },
    // WINDED (groundPose.ts WINDED): bent over, hands on her knees, by this much (0..1; the game eases it)
    setWinded(weight: number): void { windedW = Math.max(0, Math.min(1, weight)); },
    // (how far she is bent forward now, radians: her hips and back, as lowerBody.ts bends her)
    bentNow(): number { return lower.bentNow; },
    // (how far her torso leans forward of how she stands, radians: any pose, bending, crouching, on her belly...)
    torsoLean(): number { return torsoLean; },
    // (for test pages: where her main joints are now, world metres)
    jointsNow(): Record<string, [number, number, number]> {
      const out: Record<string, [number, number, number]> = {}, v = new THREE.Vector3();
      for (const name of ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'] as const) {
        bones[joints[name]].getWorldPosition(v);
        out[name] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
      }
      // (and her toes: the bone past each ankle, the ball of her foot)
      toeBones.forEach((k, i) => { bones[k].getWorldPosition(v); out[i === 0 ? 'toeL' : 'toeR'] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; });
      return out;
    },
    stanceInfo() {
      const now: Stance = downW >= 1 ? downKind : downW > 0 ? (stanceAsked === 'prone' || stanceAsked === 'fours' ? stanceAsked : downKind) : crouchW >= 1 ? 'crouch' : crouchW > 0 ? (stanceAsked === 'stand' ? 'stand' : 'crouch') : 'stand';
      // (settled: where she was asked to be, not getting down or up)
      const settled = stanceAsked === 'stand' ? crouchW === 0 && downW === 0 : stanceAsked === 'crouch' ? crouchW === 1 && downW === 0 : downW === 1 && downKind === stanceAsked;
      return { stance: now, asked: stanceAsked, settled, crouch: crouchW, down: downW };
    },
    setSideSteps(level: number | null): void { sideLevel = level; },
    // SQUARED UP BETWEEN MOVES (footGround.ts 11; the game asks as she changes from one move to another, or stops)
    squareFeet(seconds: number): void { if (downW === 0) ground.squareUp(seconds); },
    // (the island's ground: each foot on the ground under it, laid along its slope: footGround.ts 9)
    setGround(groundAt: ((x: number, z: number) => number) | null): void { ground.groundAt = groundAt; },
    // (her steps follow the distance she really covers, measured each frame in `update`: the game's speed is not needed)
    setWalk(_speed: number): void {},
    treadmill(speed: number): void { treadmill = speed; },

    aimAt(point: THREE.Vector3 | null): void {
      if (!point) { target = null; return; }
      (target ??= new THREE.Vector3()).copy(point);
    },
    // (a hand that has put its gun down has nothing to fire)
    fire(hand: Hand): void { if (gunIn[hand]) aim.fire(hand); },

    hands: {
      hasGun: (hand) => gunIn[hand],
      handPoseForGun: (hand, gunWorld, out) => out.copy(gunWorld).multiply(gunSeen.copy(seat[hand]).invert()),
      reach: (hand, pose, limit, up = false) => { bellyHand.cancel(handIndex(hand)); reach.setJob(handIndex(hand), pose, limit); if (pose) stayUp[handIndex(hand)] = up; },
      reached: (hand) => reach.progress(handIndex(hand)),
      moveReach: (hand, pose) => reach.moveJob(handIndex(hand), pose),
      holster: (hand) => ({ bone: gear.holsterBone(hand), seat: gear.holsterSeat(hand, new THREE.Matrix4()) }),
      releaseGun(hand, parent) {
        const gun = guns[hand].object;
        gun.updateWorldMatrix(true, false);
        parent.updateWorldMatrix(true, false);
        // (kept exactly where it is: its place in the world, seen from its new parent)
        gun.matrix.copy(parent.matrixWorld).invert().multiply(gun.matrixWorld);
        parent.add(gun);
        reach.holding[handIndex(hand)] = false;
        gunIn[hand] = false;
        return gun;
      },
      takeGun(hand) {
        const gun = guns[hand].object;
        arms[hand].hand.add(gun);
        gun.matrix.copy(seat[hand]);
        reach.holding[handIndex(hand)] = true;
        gunIn[hand] = true;
      },
      keepOff: (face) => { keepFace = face; },
      bellyAhead: () => { const e = armClear.eggs[0]; return e ? e.cz + e.rz : 0.15; },
      gun: (hand) => guns[hand].object,
      gunClip: (hand) => guns[hand].clip,
      gunSeat: (hand, out) => out.copy(seat[hand]),
      clipSeat: (out) => out.copy(guns.left.clipSeat),
      handBone: (hand) => arms[hand].hand,
      setHolding: (hand, holding) => { reach.holding[handIndex(hand)] = holding; },
      gripPose: (hand, at, axis, palmTo, wrapToward, radius, out) => touch.gripPose(handIndex(hand), at, axis, palmTo, wrapToward, radius, out),
      hold(hand, shape, firm = false) {
        const i = handIndex(hand);
        touch.shapes[i] = shape;
        touch.firm[i] = firm && shape !== null;
        // (on the way to a bar the fingers open wide; letting go, they go back to holding a gun or resting)
        reach.holding[i] = shape ? false : gunIn[hand];
        reach.opening[i] = shape !== null && !firm;
      },
      touching: (hand) => touch.amount[handIndex(hand)],
      palmPoint: (hand, out) => touch.palmPoint(handIndex(hand), out),
      fingersAlong: (hand, out) => touch.fingersAlong(handIndex(hand), out),
      lowering: () => ({ weight: lower.weight, mode: lower.mode, drop: lower.drop, bend: lower.hinge * 180 / Math.PI }),
    },

    muzzle(hand: Hand, out: THREE.Vector3): THREE.Vector3 {
      const gun = guns[hand];
      gun.object.updateWorldMatrix(true, false);
      return out.copy(gun.tip).applyMatrix4(gun.object.matrixWorld);
    },

    // HER EYES (the middle of them), where her head has them now: from the base of her skull, as measured on her
    // standing (EYE_AHEAD, EYE_ABOVE), turned with her head. (`pitch` was for the old camera; her head does that now.)
    eye(out: THREE.Vector3, _pitch = 0): THREE.Vector3 {
      skullFrame();
      return out.copy(headForwardLocal).multiplyScalar(EYE_AHEAD).addScaledVector(headUpLocal, EYE_ABOVE).applyQuaternion(eyeQ).add(eyeSkull);
    },
    // THE FIRST-PERSON CAMERA ON HER HEAD (see EYE_AHEAD): at her eyes, plus the player's offsets; turned as her head
    // is, looking where her head looks.
    eyeView(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
      skullFrame();
      if (!Number.isFinite(faceAhead)) faceAhead = measureFace();
      // (height along her head's own up, so it stays clear of her face as her head bows: straight up in the world, a
      //  bowed head's own face came into view from above it)
      position.copy(headForwardLocal).multiplyScalar(EYE_AHEAD + eyeForward).addScaledVector(headUpLocal, EYE_ABOVE + eyeHigher).applyQuaternion(eyeQ).add(eyeSkull);
      quaternion.copy(eyeQ).multiply(cameraInHead);
    },
    setEyeOffset(forward: number, higher: number): void { eyeForward = forward; eyeHigher = higher; },
    headPitchRange(): readonly [number, number] { headRange[0] = -HEAD_DOWN_MOST - torsoLean; headRange[1] = HEAD_UP_MOST - torsoLean; return headRange; },
    freeLook(): void { if (windedW > 0) windedLookFree = true; bellyHand.stopLook(); },

    setKnitStitch(stitch: number): void {
      // (only the baked-look materials have a live knit; the DEV Room's way has none)
      if ('setKnitStitch' in materials) (materials as { setKnitStitch(stitch: number): void }).setKnitStitch(stitch);
    },

    setFirstPerson(on: boolean): void {
      if (on === firstPerson) return;
      firstPerson = on;
      // HER HEAD AND HAIR HIDDEN FROM HER OWN CAMERA, SHADOWS KEPT (Joshua, 2026-11-20: "just hide it (shadows stay)"):
      // the first-person camera now draws from 1 cm (cameraRig.ts FIRST_NEAR), so her shoulder, arms and belly are
      // whole however near they come; at 1 cm her own cheek and nose filled the view. The camera stays locked to her
      // skull at her eyes (`eyeView`); her hair is hidden from her camera the same way (`hideHairPatch`). (Hidden in v0.2.103-106 too, when the
      // eased camera had let her face poke through; nothing is eased now.)
      headUniforms.uHideHead.value = on ? 1 : 0;
      showHair();
      // NO BOB OR SWAY IN FIRST PERSON (Joshua, 2026-11-20: "the body naturally has a bob and sway adjustment like what
      // you were trying to do... in 1st person, make 0% Bob, Sway, but show it in 3rd person"): her look's own Bob and
      // Sway (bodyMotion.ts `bobSwayShare`), so the camera on her head is steady without being eased
      motion.bobSwayShare = on ? 0 : 1;
    },

    // (her hidden live body follows her belly and her pregnancy, so the kicks come from a womb her size: liveBody.ts)
    setBelly(percent: number): void { bellyWanted = Math.max(0, Math.min(200, Math.round(percent))); live?.setBelly(bellyWanted); },
    setPregnant(on: boolean): void { live?.setPregnant(on); },
    setWaterDepth(metres: number): void { waterDepth = Math.max(0, metres); },
    squatFor(seconds: number): void { squatLeft = Math.max(squatLeft, seconds); },
    setSkinShine(oily: number): void { shine.skinOily.value = Math.max(-1, Math.min(1, oily)); },
    soakSkin(): void { wetness.soak(); },
    bellyNow: () => body.belly,
    setVitals(now: BodyVitals): void { vitals = now; },
    attachLive(body: LiveBody | null): void { live = body; liveMs = 0; },
    detachLive(): LiveBody | null { const was = live; live = null; liveMs = 0; return was; },
    liveInfo(): { stepMs: number; kicks: number } | null { return live ? { stepMs: liveMs, kicks: live.kicking() } : null; },
    /** Her stride as measured from her foot bones (bodyMotion.ts `measureStrides`), for the lab and the tests. */
    strideInfo(): { readonly walk: StrideTable; readonly run: StrideTable } | null { return motion.strides; },
    strideNow() { return motion.shape; },
    wristInfo: () => reach.wristInfo,
    armInfo() { return { eggs: armClear.eggs, moved: armClear.moved, kneeMoved: armClear.kneeMoved }; },
    keepArmsClear(on: boolean): void { armClear.on = on; },
    jointInfo(): JointExcess { joints2.measure(); return { ...joints2.excess }; },
    keepJointsReal(on: boolean): void { joints2.on = on; },
    feetInfo() { return { drop: ground.drop, planted: ground.planted, raised: ground.raised, held: ground.held, stepFoot: ground.stepFoot, phase: motion.phase, walk: motion.walkBlend, run: motion.runBlend, speed: motion.speed, sway: motion.sway, widths: [ground.shoulderWidth, ground.poseWidth] as const }; },
    breathInfo(): { chestMm: number; bellyMm: number; fullMm: number; trunk: number[] } {
      const m = breath.moveMillimetres, mid = breath.uniforms.breathSlices.value[12];
      return { chestMm: m.chest, bellyMm: m.belly, fullMm: breath.fullMillimetres, trunk: [mid.x, mid.y, mid.z, mid.w] };
    },

    /**
     * The game was paused and is carrying on: her frame clock starts again from now. (Her detail is chosen by the
     * frame rate, Smart FPS; left alone, a pause would look like one frame that took seconds, and she would be
     * made lighter for it.)
     */
    resumed(): void { lastUpdateAt = performance.now(); },

    update(frame: FrameInfo): void {
      if (disposed) return;
      // how wet she is now, and up to where (her model's own height)
      wetness.step(frame.dt, waterDepth);
      shine.skinWet.value = wetness.amount;
      shine.skinWetLine.value = wetness.line > 0 ? feetInModel + wetness.line * unitsPerMetre : -1e6;
      const now = performance.now();
      const frameMs = now - lastUpdateAt;
      lastUpdateAt = now;

      // Her belly follows what was asked, a step at a time (each step rewrites her points).
      bellyWait -= frame.dt;
      if (bellyWanted !== body.belly && bellyWait <= 0) { bellyWait = BELLY_EVERY; body.setBelly(bellyWanted); setLiveShape(); layBreath(); bodyEggs = measureEggs(); roomFor = '?'; gear.reshape(body.points, body.belly); }

      // THE LIVE BODY: everything of her that is not drawn is run on, and what her baby does to her skin is taken from it.
      if (live) { liveMs += (live.step(frame.dt) - liveMs) / 20; breath.setKicks(live.kickAt, live.kickDir); }
      // HER BELLY AS THE BUILDER SHAPES IT (Joshua, 2026-11-19: "a pointy belly... it needs to basically rebake the look
      // every second at the new size"): when the hidden live body has settled after a change (liveBody.ts), the weights
      // the builder gives each of her body shapes are read off it and she takes them (shapedBody.ts setBuilderWeights);
      // what is measured off her shape is measured again
      const read = live?.takeShape() ?? null;
      if (read && live) {
        body.setBuilderWeights(read.weights, live.openShape.weights, read.points, live.openShape.points);
        setLiveShape(); layBreath(); bodyEggs = measureEggs(); roomFor = '?'; gear.reshape(body.points, body.belly);
      }

      // Her breath: her skin's move from her vitals (or a quiet breath at rest), and her bones' at the same pace.
      // (the builder's stand breathes fifteen times a minute by its clock: the clock is run faster or slower)
      const perMinute = vitals?.breathsPerMinute ?? 14;
      breathClock += frame.dt * (perMinute / 15);
      if (vitals) breath.set(vitals);
      else { REST_BREATH.breath = 0.5 - 0.5 * Math.cos(breathClock * Math.PI * 2 * 0.25); breath.set(REST_BREATH); }

      // HOW FAR SHE REALLY MOVED since the last frame, along the way her legs face (backward is negative), and how
      // far her legs turned. (The first frame, and a move too far to be a step, count as being put there: no step.)
      const yawNow = root.rotation.y;
      let along = 0, moving = false, crab: CrabMove | null = null;
      {
        const movedX = root.position.x - lastX, movedZ = root.position.z - lastZ;
        if (placed && movedX * movedX + movedZ * movedZ < JUMP_METRES * JUMP_METRES) {
          along = movedX * Math.sin(yawNow) + movedZ * Math.cos(yawNow);
          // SIDE STEPS (Joshua, 2026-11-18): going more across the way she faces than along it, her feet take crab
          // steps, her feet still facing ahead (footGround.ts). Only while the game holds her facing (`setSideSteps`):
          // otherwise her body turns to the way she goes. Her left is across her forward: x = cos(yaw), z = -sin(yaw).
          const across = movedX * Math.cos(yawNow) - movedZ * Math.sin(yawNow);
          const went = Math.hypot(movedX, movedZ);
          const offAxis = Math.abs(Math.atan2(across, Math.abs(along)));   // 0 straight ahead or back .. pi/2 straight across
          const stepping = ground.stepFoot >= 0 && ground.crabbing;        // (a crab step still in the air finishes first)
          if (sideLevel !== null && frame.dt > 0 && went > 1e-6 && (offAxis > SIDE_ZONE_FROM || stepping)) {
            crab = crabMove;
            crabMove.x = movedX / went; crabMove.z = movedZ / went;
            crabMove.speed = went / frame.dt;
            crabMove.lead = across > 0 ? 0 : 1;
            // THE STYLE OF STEP, from her pace: a crab walk (walk, jog), a shuffle (run), a skip (sprint); and how much
            // of a skip's hop her belly allows (all of it at 25 %, none from 100 %: late on it is a fast shuffle)
            crabMove.style = Math.max(0, Math.min(2, sideLevel - 2));
            crabMove.hop = Math.max(0, Math.min(1, (SIDE_HOP_GONE - body.belly) / (SIDE_HOP_GONE - SIDE_HOP_FULL)));
            along = 0;
          } else if (stepping && went <= 1e-6) {
            // (stopped with a crab step in the air: it lands where it was going)
            crab = crabMove;
            crabMove.speed = 0;
          }
        } else ground.letGo();                                     // (put somewhere else: the spots her feet stood on are not here)
      }
      lastX = root.position.x; lastZ = root.position.z; lastYaw = yawNow; placed = true;
      if (treadmill !== 0) along = treadmill * frame.dt;

      // Her pose (the builder's stand, walk or run, her fingers) and the weight of her belly and bust.
      // (each hand's fingers: closed round its gun, or relaxed when it holds nothing: handReach.ts eases them)
      // HER STANCE, eased (groundPose.ts): crouching first, then down from her crouch onto her belly or hands and knees;
      // getting up, back to her crouch first. (A different way down, say on her belly to all fours as her pregnancy is
      // turned on, comes up to her crouch and goes down again.)
      {
        const wantDown = stanceAsked === 'prone' || stanceAsked === 'fours';
        if (wantDown && (downW === 0 || downKind === stanceAsked)) {
          crouchW = Math.min(1, crouchW + frame.dt / STANCE.crouchSeconds);
          if (crouchW >= 1) { if (downW === 0) downKind = stanceAsked as 'prone' | 'fours'; downW = Math.min(1, downW + frame.dt / STANCE.downSeconds[downKind]); }
        } else {
          downW = Math.max(0, downW - frame.dt / STANCE.upSeconds[downKind]);
          if (downW === 0) crouchW = stanceAsked === 'stand' ? Math.max(0, crouchW - frame.dt / STANCE.crouchSeconds) : Math.min(1, crouchW + frame.dt / STANCE.crouchSeconds);
        }
      }
      const downS = smooth(downW), crouchS = smooth(crouchW);
      windedS = downS > 0 ? 0 : smooth(windedW);
      windedRising = windedW > 0 && windedW >= windedWas - 1e-6;
      if (windedW <= 0) windedLookFree = false;
      windedWas = windedW;
      lower.restore(); // (her hips as her pose leaves them, before anything reads her pose: lowerBody.ts)
      reach.advance(frame.dt);
      motion.grip[0] = reach.grip[0]; motion.grip[1] = reach.grip[1];
      // (squaring her feet up between moves: her walk fades out as they go, gone as they land: footGround.ts 11)
      { const sq = ground.squaring; motion.standCap = sq >= 0 ? 1 - sq * sq * (3 - 2 * sq) : 1; }
      motion.update(frame.dt, breathClock, along, body.belly);
      influences[0] = motion.weights[0]; influences[1] = motion.weights[1]; influences[2] = motion.weights[2]; influences[3] = motion.weights[3];
      // (the same four on a live level, where they sit among all her other shapes)
      for (let i = 0; i < 4; i++) if (liveMotionAt[i] >= 0) liveInfluences[liveMotionAt[i]] = motion.weights[i];

      // Her feet on the floor (footGround.ts): she is set down on the foot that carries her, each planted foot held
      // to the spot it landed on. How much of her legs' rise and fall shows is her look's Bob, eased off with her speed.
      // EACH PART OF HER TURNED ITS OWN WAY (`setFacing`; the rule is the game's, input/bodyTurn.ts). Her hips and
      // legs first: they are turned with her feet kept on their spots, so footGround.ts does it.
      const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
      const within = (angle: number, most: number): number => Math.max(-most, Math.min(most, angle));
      if (facing) {
        legTwist.hips = within(wrap(facing.belly - yawNow), HIPS_TURN_MOST);
        legTwist.upperLegs = within(wrap(facing.upperLegs - yawNow), UPPER_LEGS_TURN_MOST);
        legTwist.feet = within(wrap(facing.feet - yawNow), FEET_TURN_MOST);
      }
      // (crouching: her hips lower, her knees bent to keep her feet on the ground; lying down or on all fours her feet
      //  no longer carry her, so they are let go, to be set down afresh when she stands)
      ground.crouchDrop = STANCE.crouchDrop * motion.legMetres * crouchS;
      if (downW < 1) ground.update(frame.dt, motion, Math.min(1, WALK_WEIGHT.bob * (motion.walkBob / 100) * walkEase(motion.speed)), moving, facing && downS < 0.5 ? legTwist : null, crab);
      else ground.letGo();
      // CROUCHED, HER BACK LEANS FORWARD (most of it low in her back), about the line across her hips
      if (crouchS > 0 && downS < 1) {
        const lean = STANCE.crouchLean * (Math.PI / 180) * crouchS * (1 - downS);
        leanAxis.set(Math.cos(yawNow), 0, -Math.sin(yawNow));   // (her left: across her forward)
        // (a turn about her left tips her top forward)
        turnAbout(bone(joints.spine), leanAxis, lean * 0.65);
        turnAbout(bone(joints.chest), leanAxis, lean * 0.35);
        // (her head kept up, looking ahead, not at the ground)
        turnAbout(bone(joints.neck), leanAxis, -lean * 0.8);
      }

      // ON HER BELLY OR ON ALL FOURS (groundPose.ts): STEP BY STEP, as a person gets down (Joshua, 2026-11-21: "a more
      // realistic transition from standing to crawling without the body sinking underground"): from her crouch her
      // knees go to the ground (KNEELING, body upright), then her hands go forward (ALL FOURS), and for prone she lowers
      // onto her elbows. Each step's pose is laid over the one before, her whole body tipped forward about her hips and
      // set down to that step's height, eased together; on a slope, along it. (Before, her crouch was blended straight
      // into the last pose: halfway she tipped forward like a falling plank, her feet and shins through the floor.)
      if (downW > 0) {
        const going = Math.min(1, Math.abs(along) / Math.max(1e-4, frame.dt) / 0.15);
        crawlPhase = (crawlPhase + along / (downKind === 'prone' ? STANCE.proneStride : STANCE.foursStride) + 1) % 1;
        downSteps(downKind, downW, steps);
        // the poses, one over the other: one knee then both over her crouch, all fours over kneeling, prone over all fours
        motion.overlay(kneelTurns(steps.oneKnee, body.belly / 100, motion.measure, motion.bind, stanceOut), steps.kneel);
        const foursTip = tipOf('fours', sizes);
        if (steps.fours > 0) motion.overlay(stanceTurns('fours', downKind === 'fours' ? crawlPhase : 0, downKind === 'fours' ? going : 0, body.belly / 100, foursTip, motion.measure, motion.bind, stanceOut), steps.fours);
        if (steps.prone > 0) motion.overlay(stanceTurns('prone', crawlPhase, going, body.belly / 100, tipOf('prone', sizes), motion.measure, motion.bind, stanceOut), steps.prone);
        // (the ground's slope along the way she faces: her body lies along it)
        let slope = 0;
        if (ground.groundAt) {
          const ax = Math.sin(yawNow) * 0.7, az = Math.cos(yawNow) * 0.7, x = root.position.x, z = root.position.z;
          const ahead = ground.groundAt(x + ax, z + az), behind = ground.groundAt(x - ax, z - az);
          if (Number.isFinite(ahead) && Number.isFinite(behind)) slope = Math.atan2(ahead - behind, 1.4);
        }
        // her tip and her hips' height, step by step: kneeling's small lean, all fours' level back, prone's flat
        let tipWant = kneelTip() * steps.kneel;
        tipWant += (foursTip - tipWant) * steps.fours;
        tipWant += (tipOf('prone', sizes) - tipWant) * steps.prone;
        let hipsWant = kneelHips(sizes);
        hipsWant += (foursHips(sizes) - hipsWant) * steps.fours;
        hipsWant += (STANCE.proneHips - hipsWant) * steps.prone;
        const tipNow = tipWant - slope * downS;
        fit.rotation.x = tipNow;
        hipsTipped.copy(hipsInFit).applyQuaternion(tipQ.setFromAxisAngle(X_AXIS, tipNow));
        // (from where her crouch has her, to her hips at the step's height, where they were across the ground)
        fit.position.x *= 1 - steps.kneel;
        fit.position.y += (hipsWant - hipsTipped.y - fit.position.y) * steps.kneel;
        fit.position.z = hipsInFit.z - hipsTipped.z;
        fit.updateMatrixWorld(true);
        // NEVER UNDER THE GROUND: the lowest of her knees, feet, hands, elbows, head and hips (each with the flesh round
        // its joint, STANCE.groundPad) is found against the ground under it, and her whole body lifted by as much as it
        // is under (never lowered: the steps above set her down). Measured, not guessed: whatever the blend does
        // between two poses, nothing of her goes through the floor.
        let under = 0;
        for (const [name, pad] of GROUND_PADS) {
          bones[joints[name]].getWorldPosition(padAt);
          const floor = ground.groundAt ? ground.groundAt(padAt.x, padAt.z) : NaN;
          const below = (Number.isFinite(floor) ? floor : root.position.y) + pad - padAt.y;
          if (below > under) under = below;
        }
        for (const k of toeBones) {
          bones[k].getWorldPosition(padAt);
          const floor = ground.groundAt ? ground.groundAt(padAt.x, padAt.z) : NaN;
          const below = (Number.isFinite(floor) ? floor : root.position.y) + STANCE.groundPad.toe - padAt.y;
          if (below > under) under = below;
        }
        if (under > 0) { fit.position.y += under / Math.max(1e-6, root.scale.y); fit.updateMatrixWorld(true); }
      } else if (fit.rotation.x !== 0) { fit.rotation.x = 0; fit.position.z = 0; }

      // ...then her shoulders, turned further than her belly (shared out up her back), and her head, further than
      // her shoulders (her neck and skull). Each is a turn about the upright axis, laid over her pose.
      // (lying down or on all fours, none of this: her body faces the way it lies; her eyes and aim do the looking)
      const upright = 1 - downS;
      const bellyYaw = facing ? yawNow + legTwist.hips * upright : yawNow;
      const backTurn = facing ? within(wrap(facing.shoulders - bellyYaw), BACK_TURN_MOST) * upright : 0;
      // HER HEAD TURNS ABOUT HER TORSO (Joshua, 2026-11-20: "the left and right ended up on the twist axis... it's
      // supposed to be left and right relative to the torso like standing"; then, turned about its own up: "it's rolling
      // and not yawing"; "The head's yaw and pitch need to be fixed to the torso's angle"): it swings left or right
      // ABOUT HER TORSO'S UP (`headSide`, from her body's way) and tips up or down from her torso's line (`headTip`,
      // then `rel` below), no roll of its own (`steadyHead`). Standing, that is an ordinary turn, level at any tip;
      // leaning on a bar it swings with her torso. (About the world's upright, leaning over and
      // looking down, it spun the view like a screw.)
      //   first person  the player's look IS that tip and turn (rig yaw less her body's way, rig pitch);
      //   third person  her look is a way in the world (a target): the tip and turn that point her head along it.
      // HER HEAD KEPT LEVEL FROM A JOG UP (Joshua, 2026-11-20: "while anything over a walk, keep the neck and head
      // level and the body and move as needed... Winded, Walk, idle, and other things would be normal with natural
      // angle tilts"): her head's frame is her torso's (leaned `torsoLean`) at a walk and below, the world's level from
      // a jog up, eased between (HEAD_LEVEL_FROM .. HEAD_LEVEL_AT, m/s). Running she leans; her head does not.
      const levelS = Math.min(1, Math.max(0, (motion.speed - HEAD_LEVEL_FROM) / (HEAD_LEVEL_AT - HEAD_LEVEL_FROM)));
      headFrameLean = torsoLean * (1 - levelS * levelS * (3 - 2 * levelS));
      let headSide = 0, headTip = facing?.headPitch ?? 0;
      if (facing) {
        if (firstPerson) headSide = wrap(facing.head - yawNow);
        else [headSide, headTip] = sideAndTip(facing.head - yawNow, headTip);
      }
      // SHE LOOKS DOWN AT HER HAND WHERE THE BABY KICKED (bellyTouch.ts `look`; Joshua, 2026-11-20), over where she was
      // looking: her head turned and tipped toward the spot by as much as the look is on (in first person too: the
      // camera is on her head)
      const looking = bellyHand.look(lookSpot) * upright;
      if (looking > 0) {
        skull.updateWorldMatrix(true, false);
        skull.getWorldPosition(skullAt);
        const dx = lookSpot.x - skullAt.x, dz = lookSpot.z - skullAt.z, flat = Math.hypot(dx, dz);
        // (a spot nearly straight below her head says little about which way: her head turns only as far as it says)
        const [spotSide, spotTip] = sideAndTip(Math.atan2(dx, dz) - yawNow, Math.atan2(lookSpot.y - skullAt.y, Math.max(0.05, flat)));
        headSide += wrap(spotSide - headSide) * looking * Math.min(1, flat / 0.15);
        headTip += (spotTip - headTip) * looking;
      }
      const headYaw = yawNow + headSide;
      const headTurn = facing || looking > 0 ? within(wrap(headYaw - (bellyYaw + backTurn)), HEAD_TURN_MOST) * upright : 0;
      // (her back's and neck's turns go ALONG HER SPINE, pelvis to neck, not about the world's upright: crouched or
      //  leaning in, she twists in herself instead of swinging sideways)
      root.updateMatrixWorld(true);
      bone(joints.pelvis).getWorldPosition(leanFrom);
      spineAxis.copy(neckBone.getWorldPosition(leanTo)).sub(leanFrom).normalize();
      if (Math.abs(backTurn) > 1e-4) for (let i = 0; i < backBones.length; i++) turnAbout(backBones[i], spineAxis, backTurn * (BACK_TURN_SHARES[i + BACK_TURN_SHARES.length - backBones.length] ?? 0));
      if (Math.abs(headTurn) > 1e-4) for (let i = 0; i < neckBones.length; i++) turnAbout(neckBones[i], spineAxis, headTurn * (HEAD_TURN_SHARES[i + HEAD_TURN_SHARES.length - neckBones.length] ?? 0));
      // (her head's tip up or down comes after her body is bent and lowered, below: it is measured from her torso)

      // GETTING DOWN TO WHAT HER HANDS REACH FOR (lowerBody.ts): toward the middle of the hands that have a job.
      root.updateMatrixWorld(true);
      {
        let count = 0;
        reachPoint.set(0, 0, 0);
        for (const i of [0, 1] as const) if (reach.hasJob(i) && !stayUp[i] && reach.jobPoint(i, reachOne)) { reachPoint.add(reachOne); count++; }
        // (SQUATTING ON PURPOSE: the bathroom, until there is a toilet: a point just above the floor in front of her,
        //  which is what makes lowerBody.ts choose its squat)
        if (squatLeft > 0) { squatLeft -= frame.dt; root.localToWorld(reachPoint.set(0, SQUAT_POINT.up, SQUAT_POINT.ahead)); count = 1; }
        // (WINDED: bent over, her knees a little bent, her hands going to her knees: groundPose.ts WINDED; her body
        //  bends as it does to reach for anything, and leans in a little more if her hands still fall short)
        if (windedRising && windedS > 0) lower.bendOver(WINDED.drop * motion.legMetres, WINDED.lean * (Math.PI / 180), WINDED.leanMost * (Math.PI / 180));
        else lower.aimAt(count > 0 ? (squatLeft > 0 ? reachPoint : reachPoint.multiplyScalar(1 / count)) : null, armClear.eggs[0] ?? null, body.belly);
        lower.apply(frame.dt, body.belly);
        // HER BELLY KEPT OFF THE TABLE (Joshua: "so it doesn't matter the belly size"): its point nearest the table's
        // face; if that is closer than KEEP_GAP (and her belly is low enough to meet the table, not above its top),
        // her hips are held back by as much (next frame on: lowerBody.ts `keepOff`).
        if (keepFace && armClear.bellyFurthest(toward.copy(keepFace.outward).negate(), bellyAt) && armClear.bellyFurthest(DOWN, bellyLow)) {
          const clear = bellyAt.sub(keepFace.point).dot(keepFace.outward);
          const meets = bellyLow.y < keepFace.top + KEEP_GAP;
          lower.keepOff(meets ? KEEP_GAP - clear : -1, frame.dt);
        } else lower.keepOff(-1, frame.dt);
      }

      // HER HEAD TIPPED UP OR DOWN, MEASURED FROM HER TORSO (Joshua, 2026-11-20: her head's limits are "relative to the
      // torso's angle... same for all directions"; "neck motion is roughly 45-60 upward, 70-80 downward"): now that her
      // body is bent and lowered, her torso's lean is measured (the line from her pelvis to her neck, forward of how it
      // stands); the way she wants to look (world: the player's view in first person, what she is doing in third, a
      // kick on her belly) is taken as an angle from her torso's own line and held within HEAD_UP_MOST and
      // HEAD_DOWN_MOST of it; WINDED, her head is bowed all the way down (chin to chest: "the max downward angle relative
      // to the torso"). Her head is turned from where her pose has it to there, shared between her neck and her skull.
      {
        measureLean();
        let rel = Math.max(-HEAD_DOWN_MOST, Math.min(HEAD_UP_MOST, headTip + torsoLean));
        if (windedS > 0 && !windedLookFree) rel += (-HEAD_DOWN_MOST - rel) * windedS;
        // (how far her pose already has her head tipped from her torso's line: her forward's pitch, plus her lean)
        skull.updateWorldMatrix(true, false);
        skull.getWorldQuaternion(skullQ);
        headFwd.copy(headForwardLocal).applyQuaternion(skullQ);
        const nowRel = Math.asin(Math.max(-1, Math.min(1, headFwd.y))) + torsoLean;
        const tip = rel - nowRel;
        if (Math.abs(tip) > 1e-4) {
          tipAxis.set(Math.sin(headYaw), 0, Math.cos(headYaw)).cross(UP_AXIS).normalize();
          for (let i = 0; i < neckBones.length; i++) turnAbout(neckBones[i], tipAxis, tip * (HEAD_TURN_SHARES[i + HEAD_TURN_SHARES.length - neckBones.length] ?? 0));
          root.updateMatrixWorld(true);
        }
        // HER HEAD HELD STEADY (Joshua, 2026-11-20: "The camera bob is fixed, but the sway is still there"): her walk
        // still twists her hips and shoulders, and her neck carried her head with them. As a real person keeps her eyes
        // steady, her skull is turned to look EXACTLY where it is meant to: tipped `rel` from her torso's line, turned
        // `headSide` about its own up, no roll; only her skull, about its own base, every frame, nothing eased. In
        // both views (her body still sways in third person; her head, as anyone's, keeps its aim).
        // (its tip from her head's frame: from her torso's line, or from level running)
        steadyHead(yawNow, rel - torsoLean + headFrameLean, headSide);
      }

      // The aim goes on top of that pose, in the game's own world (her bones are ordinary objects in it).
      // (her shoulders face `shouldersYaw`: her arms point from there, as far to each side as arms go)
      // (each arm aims only with its gun in its hand, and not while it reaches for something)
      aim.armWeight.left = gunIn.left ? 1 - reach.weight(0) : 0;
      aim.armWeight.right = gunIn.right ? 1 - reach.weight(1) : 0;
      aim.advance(frame.dt, target !== null);
      root.updateMatrixWorld(true);
      if (aim.weight > 0) {
        aim.facing = bellyYaw + backTurn;
        aim.apply(target);
      }

      // Her joints within their real ranges (jointGuard.ts), then her arms kept clear of her belly and her breasts
      // (armClear.ts), then her joints checked once more (so keeping clear never bends one past its limit). After
      // everything that poses her, so these correct all of it.
      // A KICK: a free hand to her belly (bellyTouch.ts), before her hands are laid on their jobs. Not while she is down.
      root.updateMatrixWorld(true);
      // (and her hands on her knees while she is winded, instead)
      windedHands();
      bellyHand.update(frame.dt, live ? live.kickAt : null, live ? live.kickDir : null, downS === 0 && windedS === 0);
      // Her hands on their jobs (handReach.ts), over the aim. A hand that cannot get there makes her lean in.
      reach.apply();
      lower.stillShort(Math.max(reach.short[0], reach.short[1]), frame.dt);

      joints2.passive = lower.passive;
      armClear.thighs = !(lower.weight > 0 && lower.mode.startsWith('kneel'));
      joints2.update();
      // (a holstered gun is kept clear of too, by the hand that is not reaching for it: see holsterRoom)
      holsterRoom();
      // (Look 2's hip panels swing with her thighs, now that she is posed: suitGear.ts)
      suit?.update(frame.dt);
      // (a gun put away where the outfit has no holster is stowed, out of sight, until it is drawn again)
      for (const hand of ['left', 'right'] as const) {
        if (holstered.includes(hand)) continue;
        guns[hand].object.visible = guns[hand].object.parent !== gear.holsterBone(hand);
      }
      // (a hand that holds something, or is closing on it, stays on it: her elbow keeps her arm clear instead)
      // (and a hand laid on her belly where the baby kicked stays there: her elbow keeps clear instead)
      for (const i of [0, 1] as const) armClear.holdHand[i] = (touch.shapes[i] !== null || bellyHand.holds(i)) && reach.weight(i) > 0.5;
      // (lying down or on all fours her arms are on the ground ahead of her body, not crossing it: nothing to keep clear,
      //  and its upright rules would lift her forearms off the ground)
      if (downS < 0.5) armClear.update(frame.dt);
      joints2.update();
      // (her wrists within their limits once more: the corrections above may have turned a hand)
      reach.holdWrists();
      // Her fingers closed onto a bar she holds, each until it touches (fingerTouch.ts): last, over her finished pose.
      touch.apply(frame.dt, reach.grip, [reach.progress(0), reach.progress(1)]);


      // Her detail level: the fixed one asked for, or AUTO's.
      // AUTO LIVE: Smart FPS turns her detail, from 30 % down to 1 %, by the frame rate alone.
      if (choice === 'autoLive') wanted = auto.updateSmart(frameMs, AUTO_LIVE_TOP);
      else wanted = choice === 'auto' ? auto.update(frameMs, firstPerson ? 9999 : pixels) : choice;
      want(wanted);

      updateMs += (performance.now() - now - updateMs) / 20;
    },

    stats(): FastHeroineStats {
      const skinTriangles = (skin.geometry.index?.count ?? 0) / 3;
      const gunTriangles = (guns.left.object.geometry.index?.count ?? 0) / 3 * 2;
      const hairDrawn = hair && (hair.full.visible || hair.light?.visible) ? 1 : 0;
      return {
        triangles: Math.round(skinTriangles + (hair?.triangles() ?? 0) + pieces.triangles() + gunTriangles),
        drawCalls: 1 + hairDrawn + pieces.meshes.length + 4, // her skin, her hair, her outfit's extra pieces, and two guns of two materials each
        updateMs, detail: drawnDetail, auto: choice === 'auto' || choice === 'autoLive', pixels: Math.round(pixels), fps: auto.rate, doing: auto.doing,
      };
    },

    setDetail(detail: DetailChoice): void {
      choice = detail;
      auto.reset();
    },
    setTargetFps(value: TargetFps): void { auto.target = value; auto.reset(); },
    levelTimes(): Record<number, number> { return Object.fromEntries(levels.tookMs); },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      // (her hidden live body too: the Character Builder's whole room, the largest thing she holds)
      live?.dispose();
      live = null;
      for (const hand of ['left', 'right'] as const) { guns[hand].object.removeFromParent(); guns[hand].dispose(); }
      hair?.dispose();
      pieces.dispose();
      gear.dispose();
      suit?.dispose();
      skin.onBeforeRender = () => {};
      body.dispose();
      materials.dispose();
      skinPictures?.own.dispose(); skinPictures?.tile.dispose();
      look.dispose();
      maker.dispose();
      motion.dispose();
      skin.skeleton.dispose();
    },
  };
  // (start at the level asked for, if it is a fixed one)
  if (choice !== 'auto' && choice !== 'autoLive') { wanted = choice; want(choice); }
  return heroine;

  // WHAT THE FAST HEROINE DOES NOT HAVE (the "Visual" body does):
  //   * the builder's face movement (blinks), and its pose-by-pose skin corrections at her hips and knees;
  //   * the builder's own foot lock (actor/humanFeet.ts: heels that rise, feet that follow slopes): she has a small
  //     one of her own for flat ground (footGround.ts);
  //   * painted edges that re-draw themselves as her belly changes (they are baked at her look's belly);
  //   * a cloth-simulated tee (her painted outfits and their baked pieces only).
}
