// ============================================================================
// builderHeroine.ts -- the game's heroine: the Character Builder's full body.
//
//   const heroine = await createBuilderHeroine({ renderer, scene });
//   scene.add(heroine.root);
//   ...each frame:  heroine.update(frame);
//
// She is the builder's own body, dressed, haired and kept alive (breathing,
// belly and bust springs, cloth) by the builder's own code, which runs out of
// sight in builderRoom.ts. This file is the thin layer the GAME talks to (the
// `HeroineBody` contract in core/contracts.ts):
//
//   * where she stands and which way she faces (`root`);
//   * walking and standing (the builder's own WALK and STAND);
//   * her belly (the builder's own BELLY slider);
//   * aiming and recoil (aimArms.ts, laid over the builder's pose);
//   * two placeholder guns in her hands (guns.ts) and where their muzzles are;
//   * the first-person eye point, and hiding her head for it.
//
// The promise resolves only when she is fully loaded AND dressed, so the game
// never shows her half made.
//
// HOW SHE IS DRAWN. Her body is not inside `root`. It stays in the builder's
// own scene and is drawn into the game's picture, where `root` is, by
// roomDraw.ts (read its header for why). For the game this changes nothing:
// add `root` to the scene, move it, turn it, and she is there.
// ============================================================================
import * as THREE from 'three';
import { HumanRig, findSkinnedMesh, readBindJoints } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
import { wearsLightSkin } from '@charb/sarahlab/skinChoice';
import type { FrameInfo, Hand, HeroineBody } from '../core/contracts';
import { ArmAim, findKnuckles, type ArmBones } from './aimArms';
import { ROOM_UNITS, SARAH_LAB_ACTION, SARAH_LAB_FIELD, openBuilderRoom, type BuilderRoom } from './builderRoom';
import { createGun, seatGunInHand, type Gun } from './guns';
import { RoomDrawer } from './roomDraw';
import { createGroundShadow } from './groundShadow';
import { defaultHeroineLook, DEFAULT_BELLY, type HeroineLook } from './heroineLook';

// ------------------------------------------------------------------ tuning

/** The first-person eye: this share of the way from the base of her skull to the top of her head... */
const EYE_UP = 0.42;
/** ...and this far in front of it (metres): clear of her face, so looking down shows her bust and belly. */
const EYE_FORWARD = 0.10;
/** Ground speed above which she walks instead of standing (metres a second). */
const WALK_FROM = 0.05;
/** The belly slider is moved at most this often (seconds): each move reshapes all of her skin on the CPU. */
const BELLY_EVERY = 0.1;
/** How far her fingers are curled round the guns' grips, percent (the builder's FINGERS slider). */
const GRIP_CURL = 55;
/** After her belly moves, the builder reshapes her skin on its next frame; code-painted panels are redone this many frames later. */
const REPAINT_AFTER_FRAMES = 2;
/** Her head bone's size while it is hidden in first person (not zero: a bone of no size has no inverse). */
const HIDDEN_HEAD = 0.001;

// ------------------------------------------------------------------ options

export interface BuilderHeroineOptions {
  /** The game's renderer (the builder compiles her materials with it). */
  readonly renderer: THREE.WebGLRenderer;
  /** Her look, as the Character Builder exports a character (heroineLook.ts). Default: the builder's default body and outfit. */
  readonly look?: HeroineLook;
  /** Her belly to start with, 0-200 %. Default 70. (Ignored when `look` is given: the look has its own.) */
  readonly belly?: number;
  /**
   * One of the builder's built-in outfits by name, used when the look brings no clothes. For example
   * 'painted long-sleeve tee + leggings' (all painted: costs nothing each frame). Default: the builder's own default,
   * a cloth-simulated red tee over painted leggings.
   */
  readonly outfit?: string;
  /**
   * Her light skin (about a third fewer triangles, the same shape): true, false, or 'auto' to choose as the builder
   * itself does (light on a phone, a tablet or a small screen). Default 'auto'.
   */
  readonly lightSkin?: boolean | 'auto';
  /**
   * The game's scene, if it exists already: her materials are then compiled for its lights while she loads, so her
   * first frame does not stutter. (Otherwise call `warmUp` once she is in the scene.)
   */
  readonly scene?: THREE.Scene;
  /** A soft round shadow on the ground under her (she casts no real shadow: roomDraw.ts). Default true. */
  readonly groundShadow?: boolean;
  /** Told what is loading, for a loading screen. */
  readonly onProgress?: (stage: string) => void;
}

/** What she costs to draw, counted from what is visible of her right now. */
export interface HeroineStats {
  readonly triangles: number;
  readonly drawCalls: number;
  /** Milliseconds the last `update` took on the CPU (the builder's room and the aim together), smoothed. */
  readonly updateMs: number;
  readonly clothTee: boolean;
}

/** The heroine, with a few things beyond the game's contract that a loading screen or a test page can use. */
export interface BuilderHeroine extends HeroineBody {
  stats(): HeroineStats;
  /**
   * Compile her materials for the scene she will be drawn in (its lights decide which shader programs are needed),
   * so the first frame she appears in does not stutter. Optional; call it after adding `root` to the scene.
   */
  warmUp(scene: THREE.Scene, camera: THREE.Camera): Promise<void>;
}

// ------------------------------------------------------------------ the pose hook

/**
 * THE AIM HAS TO GO ON IN THE MIDDLE OF THE BUILDER'S FRAME, not after it. Each frame the builder (1) poses her
 * bones, then (2) works out her springs and her cloth FROM those bones. If her arms were raised only after (2), the
 * cloth tee's sleeves would be simulated round arms that hang at her sides while her drawn arms point at the sky.
 *
 * The builder poses her with one call, `HumanRig.apply` (Char_B/src/view/HumanRig.ts). This wraps that method --
 * from the game's side, without touching the builder's file -- so a listener runs straight after every pose.
 * The wrapper is removed again when the last listener goes.
 */
type PosedListener = (rig: HumanRig) => void;
const posedListeners = new Set<PosedListener>();
let builderApply: typeof HumanRig.prototype.apply | null = null;

function onPosed(listener: PosedListener): () => void {
  if (!builderApply) {
    const original = HumanRig.prototype.apply;
    builderApply = original;
    HumanRig.prototype.apply = function (this: HumanRig, turns) {
      original.call(this, turns);
      for (const l of posedListeners) l(this);
    };
  }
  posedListeners.add(listener);
  return () => {
    posedListeners.delete(listener);
    if (posedListeners.size === 0 && builderApply) { HumanRig.prototype.apply = builderApply; builderApply = null; }
  };
}

/** The bones a rig poses (a private field of the builder's class, read here only to tell whose rig just posed). */
const bonesOf = (rig: HumanRig): readonly THREE.Bone[] => (rig as unknown as { bones: THREE.Bone[] }).bones;

// ------------------------------------------------------------------ the factory

export async function createBuilderHeroine(options: BuilderHeroineOptions): Promise<BuilderHeroine> {
  const look = options.look ?? defaultHeroineLook(options.belly ?? DEFAULT_BELLY);

  // Which skin: as asked, or as the builder's own page decides for this device (skinChoice.ts).
  const media = (query: string): boolean => { try { return matchMedia(query).matches; } catch { return false; } };
  const lightSkin = typeof options.lightSkin === 'boolean' ? options.lightSkin : wearsLightSkin({
    asked: null, measuring: false,
    coarse: media('(pointer: coarse)'), fine: media('(any-pointer: fine)'),
    width: screen.width, height: screen.height, ratio: window.devicePixelRatio || 1,
  });

  // ---- her place in the game's world ---------------------------------------------------------------------------
  // `root` is what the game adds to its scene, moves and turns. Her body itself stays in the builder's own scene
  // and is drawn where `root` is by the drawer (roomDraw.ts); `root` holds the drawer's invisible box, her guns and
  // the soft shadow under her feet.
  const root = new THREE.Group();
  root.name = 'heroine';
  let drawer: RoomDrawer | null = null;

  const room: BuilderRoom = await openBuilderRoom({
    renderer: options.renderer, look, outfit: options.outfit, lightSkin, onProgress: options.onProgress,
    prepareScene: (roomScene) => {
      drawer = new RoomDrawer(roomScene, root, ROOM_UNITS);
      // (given the game's scene now, her materials are compiled for its lights while she loads)
      if (options.scene) drawer.matchScene(options.scene);
    },
  });
  const draw = drawer as RoomDrawer | null;
  if (!draw) { room.dispose(); throw new Error('[heroine] the Character Builder room was not prepared'); }
  root.add(draw.proxy);
  const shadow = options.groundShadow === false ? null : createGroundShadow();
  if (shadow) root.add(shadow.object);

  // ---- her skeleton --------------------------------------------------------------------------------------------
  // The builder's own measuring code names her joints (shoulder, elbow, wrist, head...) whatever the file calls them.
  const skin = findSkinnedMesh(room.model);
  if (!skin) { room.dispose(); throw new Error('[heroine] the Character Builder body has no skinned mesh'); }
  const bones = skin.skeleton.bones;
  const joints = measureHuman(readBindJoints(room.model)).joints;
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

  // ---- the aim, laid on straight after each builder pose --------------------------------------------------------
  let target: THREE.Vector3 | null = null;       // the game's world point, or null
  const targetInRoom = new THREE.Vector3();      // the same point in the room's own space (centimetres)
  let hasTargetInRoom = false;
  const stopListening = onPosed((rig) => {
    if (bonesOf(rig)[0] !== bones[0] || aim.weight <= 0) return;
    room.model.updateMatrixWorld(true);
    aim.apply(hasTargetInRoom ? targetInRoom : null);
  });

  // ---- her guns ------------------------------------------------------------------------------------------------
  // Her fingers close round the grips (the builder's own FINGERS slider).
  room.setSlider(SARAH_LAB_FIELD.fingers, GRIP_CURL);
  const guns: Record<Hand, Gun> = { left: createGun(), right: createGun() };
  root.add(guns.left.object, guns.right.object);
  /** Where each gun sits in its hand: the gun's matrix in the hand bone's own space. Measured once, as she stands. */
  const gunInHand: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  /** Each hand bone's world matrix in the room's own space, as last read. */
  const handInRoom: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  const skullInRoom = new THREE.Vector3(), crownInRoom = new THREE.Vector3();
  const toMetres = new THREE.Matrix4().makeScale(1 / ROOM_UNITS, 1 / ROOM_UNITS, 1 / ROOM_UNITS);

  /** Read, in the room's space, everything the game may ask about before the next frame. */
  const readRoom = (): void => {
    handInRoom.left.copy(arms.left.hand.matrixWorld);
    handInRoom.right.copy(arms.right.hand.matrixWorld);
    skull.getWorldPosition(skullInRoom);
    crown.getWorldPosition(crownInRoom);
  };

  /** Work out where a gun sits in a hand, from the hand as it hangs at her side (called once; the maths is in guns.ts). */
  const seatGun = (hand: Hand): void => { seatGunInHand(arms[hand], ROOM_UNITS, gunInHand[hand]); };

  /** Put each gun where its hand is now (in `root`'s space: metres, her feet at the origin). */
  const placeGuns = (): void => {
    for (const hand of ['left', 'right'] as const) {
      guns[hand].object.matrix.multiplyMatrices(toMetres, handInRoom[hand]).multiply(gunInHand[hand]);
      guns[hand].object.matrixWorldNeedsUpdate = true;
    }
  };

  // ---- first person ----------------------------------------------------------------------------------------------
  let firstPerson = false;
  /** Her hair's meshes (the builder names their material 'sarahHair'). */
  const hairMeshes = (): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    room.model.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material?.name === 'sarahHair') out.push(mesh);
    });
    return out;
  };

  // ---- one step of the builder's room, with the game's extras round it -------------------------------------------
  let walking = false;
  let belly = look.body.bump, bellyWanted = belly, bellyWait = 0;
  /** Frames left until the look's code-painted panels are painted again (0: nothing waiting). */
  let repaintIn = 0;
  let updateMs = 0;
  let disposed = false;
  const inverseRoot = new THREE.Matrix4();

  const stepRoom = (dt: number, first = false): void => {
    // Her head is given back its size for the builder's own work...
    if (firstPerson) skull.scale.copy(skullSize);
    room.step(dt);
    if (first) { seatGun('left'); seatGun('right'); }
    readRoom();
    // ...and made vanishingly small for the drawing: its skin, face and hair's roots shrink into the top of her neck.
    if (firstPerson) skull.scale.setScalar(HIDDEN_HEAD);
    placeGuns();
  };
  // One step now: it seats the guns in her hands and closes her fingers before she is first drawn.
  stepRoom(1 / 60, true);
  stepRoom(1 / 60);

  // Her height: the highest point of her head and hair as she stands, over the floor her soles are on.
  // (measured once from her posed skin and hair, a sample of their points; in the room's units, so divided to metres)
  const height = ((): number => {
    let top = crownInRoom.y;
    const point = new THREE.Vector3();
    for (const mesh of [skin, ...hairMeshes()] as THREE.SkinnedMesh[]) {
      if (!mesh.isSkinnedMesh) continue;
      const count = mesh.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i += 5) {
        mesh.getVertexPosition(i, point);
        const y = point.applyMatrix4(mesh.matrixWorld).y;
        if (y > top) top = y;
      }
    }
    return top / ROOM_UNITS;
  })();

  const scratch = new THREE.Vector3();

  const heroine: BuilderHeroine = {
    root,
    height,
    get ready() { return !disposed; },

    setPosition(x: number, z: number, y = 0): void { root.position.set(x, y, z); }, // (y: the ground under her, on the island)
    setYaw(yaw: number): void { root.rotation.set(0, yaw, 0); },

    setWalk(speed: number): void {
      const walk = speed > WALK_FROM;
      if (walk === walking) return;
      walking = walk;
      // The builder's own WALK and STAND buttons. (Its walk is one unhurried pace, about 1.1 m/s: see the report.)
      room.press(walk ? SARAH_LAB_ACTION.walk : SARAH_LAB_ACTION.stand);
    },

    aimAt(point: THREE.Vector3 | null): void {
      if (!point) { target = null; return; }
      (target ??= new THREE.Vector3()).copy(point);
    },

    fire(hand: Hand): void { aim.fire(hand); },

    muzzle(hand: Hand, out: THREE.Vector3): THREE.Vector3 {
      root.updateWorldMatrix(true, false);
      return out.copy(guns[hand].tip).applyMatrix4(guns[hand].object.matrix).applyMatrix4(root.matrixWorld);
    },

    eye(out: THREE.Vector3): THREE.Vector3 {
      root.updateWorldMatrix(true, false);
      // From the base of her skull part of the way up to the top of her head, then forward (her own forward is +Z).
      out.copy(skullInRoom).lerp(crownInRoom, EYE_UP).multiplyScalar(1 / ROOM_UNITS);
      out.z += EYE_FORWARD;
      return out.applyMatrix4(root.matrixWorld);
    },

    setFirstPerson(on: boolean): void {
      if (on === firstPerson) return;
      firstPerson = on;
      for (const mesh of hairMeshes()) mesh.visible = !on;
      skull.scale.copy(on ? scratch.setScalar(HIDDEN_HEAD) : skullSize);
    },

    setBelly(percent: number): void { bellyWanted = Math.max(0, Math.min(200, Math.round(percent))); },

    update(frame: FrameInfo): void {
      if (disposed) return;
      const began = performance.now();
      // Her belly follows the slider, a step at a time (each step reshapes her skin, and re-cuts a cloth tee).
      bellyWait -= frame.dt;
      if (bellyWanted !== belly && bellyWait <= 0) { belly = bellyWanted; bellyWait = BELLY_EVERY; room.setSlider(SARAH_LAB_FIELD.bump, belly); repaintIn = REPAINT_AFTER_FRAMES; }
      // The target, moved from the game's world into the room's own space (centimetres, her feet at its origin, facing +Z).
      hasTargetInRoom = target !== null;
      if (target) {
        root.updateWorldMatrix(true, false);
        targetInRoom.copy(target).applyMatrix4(inverseRoot.copy(root.matrixWorld).invert()).multiplyScalar(ROOM_UNITS);
      }
      aim.advance(frame.dt, target !== null);
      stepRoom(frame.dt);
      // A look's code-painted panels (paintMask.ts) are laid again on her newly shaped skin, a frame or two after
      // her belly moved, so their edges stay smooth at every belly size.
      if (repaintIn > 0 && --repaintIn === 0) room.repaintMasks();
      updateMs += (performance.now() - began - updateMs) / 20;
    },

    stats(): HeroineStats {
      let triangles = 0, drawCalls = 0;
      const count = (n: THREE.Object3D) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh || mesh === draw.proxy) return;
        const g = mesh.geometry, all = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
        triangles += Math.max(0, Math.min(all - g.drawRange.start, g.drawRange.count)) / 3;
        drawCalls += Array.isArray(mesh.material) ? Math.max(1, g.groups.length) : 1;
      };
      room.scene.traverseVisible(count);
      root.traverseVisible(count);
      return { triangles: Math.round(triangles), drawCalls, updateMs, clothTee: room.clothTee };
    },

    async warmUp(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
      draw.matchScene(scene);
      await options.renderer.compileAsync(room.scene, draw.cameraFor(camera));
      await options.renderer.compileAsync(root, camera, scene);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      stopListening();
      root.removeFromParent();
      skull.scale.copy(skullSize);
      guns.left.dispose();
      guns.right.dispose();
      shadow?.dispose();
      draw.dispose();
      // The room frees her meshes, materials and textures.
      room.dispose();
    },
  };
  return heroine;
}
