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
import { SHADOW_ONLY_LAYER, type BodyFacing, type BodyVitals, type FrameInfo, type Hand, type HeroineBody } from '../../core/contracts';
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
import { DetailLevels, DetailMaker, skinImportance, type Detail } from './detailLevels';
import { buildExtraPieces } from './extraPieces';
import { buildBeltGear, type BeltGear } from './beltGear';
import { buildSuitGear, type SuitGear } from './suitGear';
import { LOOK_GEAR } from '../looks/gear';
import { loadFastHair, type FastHair } from './fastHair';
import { FINE_FROM_DETAIL, makeSkinMaterials } from './outfitMaterial';
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

/** The first-person eye: this share of the way from the base of her skull to the top of her head... */
const EYE_UP = 0.42;
/** ...and this far in front of it (metres): clear of her face, so looking down shows her bust and belly. */
const EYE_FORWARD = 0.10;
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
/** The most her head tips up or down (radians, 45 degrees); she looks further with her eyes and her bend. */
const HEAD_TIP_MOST = Math.PI / 4;
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
 * shadow-only layer (core/contracts.ts SHADOW_ONLY_LAYER): not drawn, but it casts its shadow.
 */
const HEAD_GLSL_BONES = 8;
/** A ball this big round her middle is what the camera's view is tested against (metres): her arms out, guns included. */
const VIEW_BALL_RADIUS = 1.5;

// ------------------------------------------------------------------ options and extras

/**
 * Her detail: 'autoLive', 'auto', or one fixed level.
 *   autoLive  SMART FPS turns her detail (Joshua, 2026-11-17: "Instead of Smart FPS controlling the amount of people,
 *             have it control the details instead from a max up to 30% details down to 1%, but still auto depending
 *             on FPS"): she starts at 30 %, goes a level lighter while the frame rate is under the target and comes
 *             back a level when it has been over it for a while. At these levels all her body shapes are live.
 *   auto      as much as the eye can see at her size on screen (up to 100 %), lighter only if the frame rate needs it.
 */
export type DetailChoice = 'autoLive' | 'auto' | Detail;
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
  /**
   * Attach THE LIVE BODY (liveBody.ts): the builder's whole hidden room, run each frame and never drawn. Her baby's
   * kicks then show on her skin. Null takes it away again.
   */
  attachLive(live: LiveBody | null): void;
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
  });

  // ---- 3. her detail levels ----------------------------------------------------------------------------------------
  // (the lightening is told her points, her texture layout and how important each point is: detailLevels.ts)
  const box = new THREE.Box3().setFromArray(look.shape.position);
  const maker = new DetailMaker();
  maker.setMesh(0, look.shape.position, fullIndex, box, layout, skinImportance(look.shape.position, box, shapeMoves));
  const levels = new DetailLevels(maker, 0, fullIndex);

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
  // (or, the DEV Room's way, the file's own skin material with a tee and leggings coloured over it in the shader)
  const fileMaterial = Array.isArray(skin.material) ? skin.material[0] : skin.material;
  // (her skin model's own units to a metre, for the live knit's size: her height in the model is about 1.68 m)
  skin.geometry.computeBoundingBox();
  const unitsPerMetre = (skin.geometry.boundingBox!.max.y - skin.geometry.boundingBox!.min.y) / 1.68;
  const materials = painted ? makePaintedMaterials(fileMaterial, box, painted) : makeSkinMaterials(fileMaterial, look, options.renderer, LOOK_GEAR[look.manifest.look]?.clothShine, unitsPerMetre);
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
    hair = await loadFastHair(look.manifest.hair, skin);
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
  // HER SHOULDER WIDTH (shoulder joint to shoulder joint, as she stands now): her feet stand this far apart, and a crab
  // step goes this far (footGround.ts)
  ground.shoulderWidth = new THREE.Vector3().setFromMatrixPosition(arms.left.upper.matrixWorld)
    .distanceTo(new THREE.Vector3().setFromMatrixPosition(arms.right.upper.matrixWorld));
  const aim = new ArmAim({ spine: bone(joints.spine), chest: bone(joints.chest), ...arms });
  // Her head: the builder's `head` joint is the very top of her head (a tip that carries nothing); the bone that
  // carries her skull, face and hair is its parent.
  const crown = bone(joints.head);
  const skull = crown.parent && (crown.parent as THREE.Bone).isBone && crown.parent !== bone(joints.neck) ? (crown.parent as THREE.Bone) : crown;
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
    uSkullAt: { value: new THREE.Vector3() },
  };
  /** Add the folding to a material's shader (after anything it already adds). Only the camera's picture uses it. */
  const hideHeadPatch = (material: THREE.Material): void => {
    const before = material.onBeforeCompile, key = material.customProgramCacheKey;
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      Object.assign(shader.uniforms, headUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uHideHead;\nuniform float uHeadBones[${HEAD_GLSL_BONES}];\nuniform vec3 uSkullAt;`)
        // (after her bones have posed her: each point is pulled into the base of her skull by the share of it her head carries)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
if (uHideHead > 0.5) {
  float headShare = 0.0;
  for (int b = 0; b < ${HEAD_GLSL_BONES}; b++) {
    float bone = uHeadBones[b];
    if (bone < 0.0) continue;
    headShare += (abs(skinIndex.x - bone) < 0.5 ? skinWeight.x : 0.0) + (abs(skinIndex.y - bone) < 0.5 ? skinWeight.y : 0.0)
               + (abs(skinIndex.z - bone) < 0.5 ? skinWeight.z : 0.0) + (abs(skinIndex.w - bone) < 0.5 ? skinWeight.w : 0.0);
  }
  transformed = mix(transformed, uSkullAt, clamp(headShare, 0.0, 1.0) * 0.999);
}`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|hidehead`; };
    material.needsUpdate = true;
  };
  hideHeadPatch(materials.fine);
  hideHeadPatch(materials.plain);
  /** Her hair: drawn in third person; in first person only its shadow (the shadow-only layer). */
  const showHair = (detail: Detail = drawnDetail): void => {
    if (!hair) return;
    hair.show(detail, true);
    for (const mesh of [hair.full, hair.light]) if (mesh) mesh.layers.set(firstPerson ? SHADOW_ONLY_LAYER : 0);
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
  const gunColours = LOOK_GEAR[look.manifest.look]?.gun;
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
    colours: LOOK_GEAR[look.manifest.look]?.belt,
    gunColours,
    line: LOOK_GEAR[look.manifest.look]?.beltLine,
  });
  // ---- 8c. the outfit's fitted pieces (suitGear.ts; Joshua, 2026-11-18, the gray and red suit): tall flat boots, wrist
  // cuffs and shoulder plates, each a shell shaped round her own skin on one bone. Made now, while she stands.
  const piecesStyle = LOOK_GEAR[look.manifest.look]?.pieces;
  const suit: SuitGear | null = piecesStyle ? buildSuitGear({
    skin, points: body.points, skinIndex: holdIndex, skinWeight: holdWeight, root, leftSign,
    arm: { left: { upper: arms.left.upper, fore: arms.left.fore, hand: arms.left.hand }, right: { upper: arms.right.upper, fore: arms.right.fore, hand: arms.right.hand } },
    leg: {
      left: { thigh: bones[joints.hipL], shin: bones[joints.kneeL], foot: bones[joints.ankleL] },
      right: { thigh: bones[joints.hipR], shin: bones[joints.kneeR], foot: bones[joints.ankleR] },
    },
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
    const sides = (['left', 'right'] as const).filter((hand) => guns[hand].object.parent === gear.holsterBone(hand) && reach.weight(handIndex(hand)) <= 0 && !reach.hasJob(handIndex(hand)));
    const key = sides.join(',');
    if (key === roomFor) return;
    roomFor = key;
    armClear.setEggs([...bodyEggs, ...sides.map((hand) => gear.holsterEgg(hand))]);
  };
  /** Whether each hand holds its gun (its fingers may close on other things too: a clip). */
  const gunIn: Record<Hand, boolean> = { left: true, right: true };
  const gunSeen = new THREE.Matrix4();

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
  let firstPerson = false;
  const waitingFor = new Set<number>();
  /** How tall she was last drawn, in screen pixels: written by the draw itself (below), read by AUTO the next frame. */
  let pixels = 9999;

  const wear = (detail: Detail): void => {
    const geometry = body.geometry(detail);
    if (!geometry) return;
    const before = drawnDetail;
    drawnDetail = detail;
    skin.geometry = geometry;
    // which shapes this level's body carries: all of them live, or only her four motion shapes
    if (body.isLive(detail)) { skin.morphTargetDictionary = liveDictionary; skin.morphTargetInfluences = liveInfluences; }
    else { skin.morphTargetDictionary = bakedDictionary; skin.morphTargetInfluences = influences; }
    // (a live level she has left is let go if it is a heavy one: its shapes are tens of megabytes)
    if (before !== detail && body.isLive(before) && before > 5) body.release(before);
    skin.material = detail >= FINE_FROM_DETAIL ? materials.fine : materials.plain;
    showHair(detail);
    pieces.setDetail(detail);
  };
  /** Ask for a level: worn at once if it has been made, otherwise made in the background and worn when ready. */
  const want = (detail: Detail): void => {
    if (detail === drawnDetail) return;
    if (body.has(detail)) { wear(detail); return; }
    if (waitingFor.has(detail)) return;
    waitingFor.add(detail);
    levels.get(detail).then((index) => {
      waitingFor.delete(detail);
      if (disposed) return;
      body.build(detail, index);
      // (worn only if it is still the level wanted: the player may have changed the setting meanwhile)
      if (wanted === detail) wear(detail);
    }).catch((error: unknown) => { waitingFor.delete(detail); console.warn(`[heroine] detail ${detail}% could not be made; she keeps ${drawnDetail}%`, error); });
  };
  let wanted: Detail = 100;

  // The draw tells us the camera: three.js calls this just before her skin is drawn (and not at all when she is out of view).
  const middle = new THREE.Vector3(), eyeAt = new THREE.Vector3(), size = new THREE.Vector2();
  skin.onBeforeRender = (renderer, _scene, camera) => {
    middle.setFromMatrixPosition(root.matrixWorld);
    middle.y += height * 0.5;
    const distance = Math.max(0.05, eyeAt.setFromMatrixPosition(camera.matrixWorld).distanceTo(middle));
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
  let target: THREE.Vector3 | null = null;
  let bellyWanted = body.belly, bellyWait = 0;
  let updateMs = 0, lastUpdateAt = performance.now();
  let disposed = false;
  const skullPlace = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
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
    setSideSteps(level: number | null): void { sideLevel = level; },
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
      reach: (hand, pose, limit, up = false) => { reach.setJob(handIndex(hand), pose, limit); if (pose) stayUp[handIndex(hand)] = up; },
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

    eye(out: THREE.Vector3): THREE.Vector3 {
      // From the base of her skull part of the way up to the top of her head. Her skull bone may be shrunk to
      // nothing (first person), so its place is worked out with its true size: parent x (position, rotation, size 1).
      skull.parent?.updateWorldMatrix(true, false);
      skullPlace.compose(skull.position, skull.quaternion, one);
      if (skull.parent) skullPlace.premultiply(skull.parent.matrixWorld);
      out.copy(crown.position).multiplyScalar(EYE_UP).applyMatrix4(skullPlace);
      // ...then forward, the way her head faces
      const yaw = facing?.head ?? root.rotation.y;
      out.x += Math.sin(yaw) * EYE_FORWARD;
      out.z += Math.cos(yaw) * EYE_FORWARD;
      return out;
    },

    setKnitStitch(stitch: number): void {
      // (only the baked-look materials have a live knit; the DEV Room's way has none)
      if ('setKnitStitch' in materials) (materials as { setKnitStitch(stitch: number): void }).setKnitStitch(stitch);
    },

    setFirstPerson(on: boolean): void {
      if (on === firstPerson) return;
      firstPerson = on;
      // Her head folded away in the camera's picture only (her shadow keeps it); her hair moved to the shadow-only layer.
      headUniforms.uHideHead.value = on ? 1 : 0;
      showHair();
    },

    // (her hidden live body follows her belly and her pregnancy, so the kicks come from a womb her size: liveBody.ts)
    setBelly(percent: number): void { bellyWanted = Math.max(0, Math.min(200, Math.round(percent))); live?.setBelly(bellyWanted); },
    setPregnant(on: boolean): void { live?.setPregnant(on); },
    bellyNow: () => body.belly,
    setVitals(now: BodyVitals): void { vitals = now; },
    attachLive(body: LiveBody | null): void { live = body; liveMs = 0; },
    liveInfo(): { stepMs: number; kicks: number } | null { return live ? { stepMs: liveMs, kicks: live.kicking() } : null; },
    /** Her stride as measured from her foot bones (bodyMotion.ts `measureStrides`), for the lab and the tests. */
    strideInfo(): { readonly walk: StrideTable; readonly run: StrideTable } | null { return motion.strides; },
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
      lower.restore(); // (her hips as her pose leaves them, before anything reads her pose: lowerBody.ts)
      reach.advance(frame.dt);
      motion.grip[0] = reach.grip[0]; motion.grip[1] = reach.grip[1];
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
      ground.update(frame.dt, motion, Math.min(1, WALK_WEIGHT.bob * (motion.walkBob / 100) * walkEase(motion.speed)), moving, facing ? legTwist : null, crab);

      // ...then her shoulders, turned further than her belly (shared out up her back), and her head, further than
      // her shoulders (her neck and skull). Each is a turn about the upright axis, laid over her pose.
      const bellyYaw = facing ? yawNow + legTwist.hips : yawNow;
      const backTurn = facing ? within(wrap(facing.shoulders - bellyYaw), BACK_TURN_MOST) : 0;
      const headTurn = facing ? within(wrap(facing.head - (bellyYaw + backTurn)), HEAD_TURN_MOST) : 0;
      if (Math.abs(backTurn) > 1e-4) for (let i = 0; i < backBones.length; i++) turnUpright(backBones[i], backTurn * (BACK_TURN_SHARES[i + BACK_TURN_SHARES.length - backBones.length] ?? 0));
      if (Math.abs(headTurn) > 1e-4 && !firstPerson) for (let i = 0; i < neckBones.length; i++) turnUpright(neckBones[i], headTurn * (HEAD_TURN_SHARES[i + HEAD_TURN_SHARES.length - neckBones.length] ?? 0));
      // HER HEAD TIPPED UP OR DOWN (where she looks while she does something), shared between her neck and skull as the
      // turn is, about the line across her head (square to the way it faces), within HEAD_TIP_MOST
      const tip = facing?.headPitch ?? 0;
      if (Math.abs(tip) > 1e-4 && !firstPerson) {
        const yaw = facing!.head;
        tipAxis.set(Math.sin(yaw), 0, Math.cos(yaw)).cross(UP_AXIS).normalize();
        const angle = Math.max(-HEAD_TIP_MOST, Math.min(HEAD_TIP_MOST, tip));
        for (let i = 0; i < neckBones.length; i++) turnAbout(neckBones[i], tipAxis, angle * (HEAD_TURN_SHARES[i + HEAD_TURN_SHARES.length - neckBones.length] ?? 0));
      }

      // GETTING DOWN TO WHAT HER HANDS REACH FOR (lowerBody.ts): toward the middle of the hands that have a job.
      root.updateMatrixWorld(true);
      {
        let count = 0;
        reachPoint.set(0, 0, 0);
        for (const i of [0, 1] as const) if (reach.hasJob(i) && !stayUp[i] && reach.jobPoint(i, reachOne)) { reachPoint.add(reachOne); count++; }
        lower.aimAt(count > 0 ? reachPoint.multiplyScalar(1 / count) : null, armClear.eggs[0] ?? null, body.belly);
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
      // Her hands on their jobs (handReach.ts), over the aim. A hand that cannot get there makes her lean in.
      reach.apply();
      lower.stillShort(Math.max(reach.short[0], reach.short[1]), frame.dt);

      joints2.passive = lower.passive;
      armClear.thighs = !(lower.weight > 0 && lower.mode.startsWith('kneel'));
      joints2.update();
      // (a holstered gun is kept clear of too, by the hand that is not reaching for it: see holsterRoom)
      holsterRoom();
      // (a hand that holds something, or is closing on it, stays on it: her elbow keeps her arm clear instead)
      for (const i of [0, 1] as const) armClear.holdHand[i] = touch.shapes[i] !== null && reach.weight(i) > 0.5;
      armClear.update(frame.dt);
      joints2.update();
      // (her wrists within their limits once more: the corrections above may have turned a hand)
      reach.holdWrists();
      // Her fingers closed onto a bar she holds, each until it touches (fingerTouch.ts): last, over her finished pose.
      touch.apply(frame.dt, reach.grip, [reach.progress(0), reach.progress(1)]);

      // First person: where the base of her skull is now, in her skin's own space (her head is folded into it).
      if (firstPerson) {
        skull.getWorldPosition(headUniforms.uSkullAt.value);
        skin.worldToLocal(headUniforms.uSkullAt.value);
      }

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
