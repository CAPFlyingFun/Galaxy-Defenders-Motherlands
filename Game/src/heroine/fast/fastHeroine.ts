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
import type { BodyVitals, FrameInfo, Hand, HeroineBody } from '../../core/contracts';
import { ArmAim, findKnuckles, type ArmBones } from '../aimArms';
import { createGun, seatGunInHand, type Gun } from '../guns';
import { AutoDetail, type TargetFps } from './autoDetail';
import { loadBakedLook, type BakedLook } from './bakedLook';
import { BAREFOOT_HEIGHT_METRES, makePaintedMaterials, shapeFromFile, type PaintedLook } from './devRoomLook';
import { loadBodyFile } from './bodyFile';
import { BodyMotion } from './bodyMotion';
import { DetailLevels, DetailMaker, skinImportance, type Detail } from './detailLevels';
import { buildExtraPieces } from './extraPieces';
import { loadFastHair, type FastHair } from './fastHair';
import { FINE_FROM_DETAIL, makeSkinMaterials } from './outfitMaterial';
import { shapeWeightsAt } from './shapedBody';
import { SkinBreath } from './skinBreath';
import { weekForBump } from '@charb/sarahlab/baby';
import { MOTION_SHAPES, ShapedBody } from './shapedBody';

// ------------------------------------------------------------------ tuning (the same numbers as builderHeroine.ts)

/** The first-person eye: this share of the way from the base of her skull to the top of her head... */
const EYE_UP = 0.42;
/** ...and this far in front of it (metres): clear of her face, so looking down shows her bust and belly. */
const EYE_FORWARD = 0.10;
/** Ground speed above which she walks instead of standing (metres a second). */
const WALK_FROM = 0.05;
/** Her belly is reshaped at most this often (seconds): each change rewrites her points on the CPU. */
const BELLY_EVERY = 0.1;
/** How far her fingers are curled round the guns' grips, percent (the builder's FINGERS slider). */
const GRIP_CURL = 55;
/** A quiet breath at rest, for when the game gives no vitals (its `breath` is rewritten each frame). */
const REST_BREATH = { breath: 0, breathLitres: 0.5, breathsPerMinute: 14, stomachMl: 0 };
/** Her head bone's size while it is hidden in first person (not zero: a bone of no size has no inverse). */
const HIDDEN_HEAD = 0.001;
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
  /** Change the frame rate AUTO detail holds. */
  setTargetFps(target: TargetFps): void;
  /**
   * Her breathing now, for a readout: how far her chest and her belly are moved out where each moves most, and how far
   * her belly stands out for her stomach (millimetres); and her trunk as measured at about navel height (its half
   * width to her left and right, her spine's front and her front, metres in her rest frame).
   */
  breathInfo(): { chestMm: number; bellyMm: number; fullMm: number; trunk: number[] };
  /** Megabytes downloaded for her, and seconds she took to load. */
  readonly loaded: { readonly megabytes: number; readonly seconds: number };
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
  const materials = painted ? makePaintedMaterials(fileMaterial, box, painted) : makeSkinMaterials(fileMaterial, look, options.renderer);
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
  let motion = new BodyMotion(file.scene, skin, GRIP_CURL);
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
    motion = new BodyMotion(file.scene, skin, GRIP_CURL);
    motion.update(0, 0, 0, body.belly);
    root.updateMatrixWorld(true);
  }

  // ---- 7b. her skin breathes (skinBreath.ts: the builder's own breathing, fitted to this body) ---------------------
  // Her skin's own units to her REST FRAME: metres, her soles on the floor, facing +z. That is the heroine's root as
  // she stands here, so it is "her skin's place in the world, seen from her root". (The builder's `restOfMesh`: her
  // skin's bind, carried by her first bone, in her mesh's place.)
  const breath = (() => {
    const first = skin.skeleton.bones[0];
    const held = new THREE.Matrix4().copy(skin.bindMatrixInverse).multiply(first.matrixWorld).multiply(skin.skeleton.boneInverses[0]).multiply(skin.bindMatrix);
    const meshToRest = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(skin.matrixWorld).multiply(held);
    return new SkinBreath(meshToRest, weekForBump(body.belly));
  })();
  const layBreath = (): void => breath.lay(body.points, fullIndex, skin, holdIndex, holdWeight);
  layBreath();
  breath.patch(materials.fine);
  breath.patch(materials.plain);
  // (what she wears over her skin breathes with it: the fabric across her cleavage, or it would sink into her chest)
  for (const mesh of pieces.meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) breath.patch(material);
  /** Her vitals as the game last gave them; until it does, a quiet breath at rest (14 a minute, half a litre). */
  let vitals: BodyVitals | null = null;
  /** A clock that runs at the speed of her breathing, for her bones' own small breathing move (the builder's stand). */
  let breathClock = 0;

  const bones = skin.skeleton.bones, joints = motion.measure.joints;
  const bone = (index: number): THREE.Bone => bones[index];
  const arm = (side: number, shoulder: number, elbow: number, wrist: number): ArmBones => ({
    side, upper: bone(shoulder), fore: bone(elbow), hand: bone(wrist), knuckles: findKnuckles(bone(wrist)),
  });
  // (which side is her left along X is measured from her joints, not assumed)
  const leftSign = Math.sign(bone(joints.shoulderL).getWorldPosition(new THREE.Vector3()).x - bone(joints.shoulderR).getWorldPosition(new THREE.Vector3()).x) || 1;
  const arms = { left: arm(leftSign, joints.shoulderL, joints.elbowL, joints.wristL), right: arm(-leftSign, joints.shoulderR, joints.elbowR, joints.wristR) };
  const aim = new ArmAim({ spine: bone(joints.spine), chest: bone(joints.chest), ...arms });
  // Her head: the builder's `head` joint is the very top of her head (a tip that carries nothing); the bone that
  // carries her skull, face and hair is its parent.
  const crown = bone(joints.head);
  const skull = crown.parent && (crown.parent as THREE.Bone).isBone && crown.parent !== bone(joints.neck) ? (crown.parent as THREE.Bone) : crown;
  const skullSize = skull.scale.clone();

  // Her height with her hair, as she stands (a sample of her hair's points over the top of her skin).
  let height = crownOverFloor;
  if (hair) {
    const point = new THREE.Vector3(), mesh = hair.full, points = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < points; i += 5) { const y = mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y; if (y > height) height = y; }
  }

  // ---- 8. her guns: each one a child of its hand's bone, so it costs nothing to move ---------------------------------
  const guns: Record<Hand, Gun> = { left: createGun(), right: createGun() };
  for (const hand of ['left', 'right'] as const) {
    // (worked out as she stands now, facing +Z, in metres: guns.ts)
    seatGunInHand(arms[hand], 1, guns[hand].object.matrix);
    arms[hand].hand.add(guns[hand].object);
  }

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
    hair?.show(detail, !firstPerson);
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
  let walking = false;
  /** Her ground speed as the game last gave it, metres a second: her stride keeps pace with it. */
  let speedNow = 0;
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

    setPosition(x: number, z: number): void { root.position.set(x, 0, z); },
    setYaw(yaw: number): void { root.rotation.set(0, yaw, 0); },
    setWalk(speed: number): void { walking = speed > WALK_FROM; speedNow = speed; },

    aimAt(point: THREE.Vector3 | null): void {
      if (!point) { target = null; return; }
      (target ??= new THREE.Vector3()).copy(point);
    },
    fire(hand: Hand): void { aim.fire(hand); },

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
      // ...then forward, the way she faces
      const yaw = root.rotation.y;
      out.x += Math.sin(yaw) * EYE_FORWARD;
      out.z += Math.cos(yaw) * EYE_FORWARD;
      return out;
    },

    setFirstPerson(on: boolean): void {
      if (on === firstPerson) return;
      firstPerson = on;
      // Her head bone made vanishingly small: her face and scalp shrink into the top of her neck; her hair is not drawn.
      if (on) skull.scale.setScalar(HIDDEN_HEAD); else skull.scale.copy(skullSize);
      hair?.show(drawnDetail, !on);
    },

    setBelly(percent: number): void { bellyWanted = Math.max(0, Math.min(200, Math.round(percent))); },
    setVitals(now: BodyVitals): void { vitals = now; },
    breathInfo(): { chestMm: number; bellyMm: number; fullMm: number; trunk: number[] } {
      const m = breath.moveMillimetres, mid = breath.uniforms.breathSlices.value[12];
      return { chestMm: m.chest, bellyMm: m.belly, fullMm: breath.fullMillimetres, trunk: [mid.x, mid.y, mid.z, mid.w] };
    },

    update(frame: FrameInfo): void {
      if (disposed) return;
      const now = performance.now();
      const frameMs = now - lastUpdateAt;
      lastUpdateAt = now;

      // Her belly follows what was asked, a step at a time (each step rewrites her points).
      bellyWait -= frame.dt;
      if (bellyWanted !== body.belly && bellyWait <= 0) { bellyWait = BELLY_EVERY; body.setBelly(bellyWanted); setLiveShape(); layBreath(); }

      // Her breath: her skin's move from her vitals (or a quiet breath at rest), and her bones' at the same pace.
      // (the builder's stand breathes fifteen times a minute by its clock: the clock is run faster or slower)
      const perMinute = vitals?.breathsPerMinute ?? 14;
      breathClock += frame.dt * (perMinute / 15);
      if (vitals) breath.set(vitals);
      else { REST_BREATH.breath = 0.5 - 0.5 * Math.cos(breathClock * Math.PI * 2 * 0.25); breath.set(REST_BREATH); }

      // Her pose (the builder's stand or walk, her fingers) and the weight of her belly and bust.
      motion.update(frame.dt, breathClock, walking ? speedNow : 0, body.belly);
      influences[0] = motion.weights[0]; influences[1] = motion.weights[1]; influences[2] = motion.weights[2]; influences[3] = motion.weights[3];
      // (the same four on a live level, where they sit among all her other shapes)
      for (let i = 0; i < 4; i++) if (liveMotionAt[i] >= 0) liveInfluences[liveMotionAt[i]] = motion.weights[i];

      // The aim goes on top of that pose, in the game's own world (her bones are ordinary objects in it).
      aim.advance(frame.dt, target !== null);
      if (aim.weight > 0) {
        root.updateMatrixWorld(true);
        aim.facing = root.rotation.y;
        aim.apply(target);
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
      skull.scale.copy(skullSize);
      for (const hand of ['left', 'right'] as const) { guns[hand].object.removeFromParent(); guns[hand].dispose(); }
      hair?.dispose();
      pieces.dispose();
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
  //   * the builder's skin-level breathing, face movement (blinks), and its pose-by-pose skin corrections at her
  //     hips and knees: she breathes and walks by her bones alone;
  //   * painted edges that re-draw themselves as her belly changes (they are baked at her look's belly);
  //   * a cloth-simulated tee (her painted outfits and their baked pieces only).
}
