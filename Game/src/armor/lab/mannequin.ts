// ============================================================================
// mannequin.ts -- the REAL heroine body, shown as a plain white mannequin.
//
// The armor lab does not fit armor on a made-up dummy. It loads the Character
// Builder's own body file (Char_B/public/models/sarah-v2-body-slim.glb, read
// through the `charb/` address the game's Vite setup serves), paints it one
// flat matte colour, and stands it in the builder's own standing pose. Every
// armor piece is then sized and placed on this body, so what fits here fits
// in the game.
//
// What this file knows how to do:
//   * load the body and find its joints. Her bones are called Bone_000 ...
//     Bone_067, with no "head" or "left arm" among them, so the builder's own
//     measuring code (humanSkeleton.ts) finds each joint by where it is;
//   * set her BELLY (0-200 %) and BUST with her real shape keys ("morph
//     targets"), using the builder's own rules for which key means what;
//   * stand her as the builder does (arms a little away from her sides);
//   * pose her feet for HEELS (toes down, heel up) and lift her so the balls
//     of her feet rest on the soles of her boots;
//   * tell the fitting code where every point of her skin is right now.
//
// Nothing here is used by the game itself: the game's heroine comes from the
// builder's own room (heroine/builderRoom.ts). The armor only needs the same
// skeleton, which both have.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HumanRig } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
import { poseHuman } from '@charb/actor/humanPose';
import type { HumanJointName, HumanMeasure, MutableJointTurn } from '@charb/actor/humanRig';

/** Where the body file is served from (see `charb()` in Game/vite.config.ts). */
export const BODY_URL = 'charb/models/sarah-v2-body-slim.glb';

// ---- The builder's own shape rules (as in its sarahLabTool.ts; the same copies the Anthill Airways DEV Room uses) ----

/**
 * The builder's belly sizes: the file itself is the 100 % belly, each named key is that belly at another size
 * ('belly' = flat, 0 %), and a size in between cross-fades the two keys either side of it.
 */
const BELLY_KEYS: ReadonlyArray<readonly [number, string | null]> = [
  [2, 'belly200'], [1.5, 'belly150'], [1, null], [0.75, 'belly75'], [0.6, 'belly60'], [0.5, 'belly50'], [0.3, 'belly30'], [0.25, 'belly25'], [0, 'belly'],
];
export function bellyWeights(percent: number): Record<string, number> {
  const s = Math.min(2, Math.max(0, percent / 100));
  const out: Record<string, number> = {};
  for (let i = 0; i + 1 < BELLY_KEYS.length; i++) {
    const [hi, hiName] = BELLY_KEYS[i], [lo, loName] = BELLY_KEYS[i + 1];
    if (s > hi || s < lo) continue;
    const k = (s - lo) / (hi - lo);
    if (hiName) out[hiName] = k;
    if (loName) out[loName] = 1 - k;
    break;
  }
  return out;
}

/**
 * The builder's bust: it grows a little with the belly, and its SIZE control goes on top (+100 is twice the volume
 * of her own bust, -100 is half). Up to 1.55x is the 'breastGrow' key; the rest of the way is 'shape:breastGrowMore'.
 */
export function bustWeights(bellyPercent: number, sizePercent: number): Record<string, number> {
  const p = Math.min(200, Math.max(0, bellyPercent));
  const base = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  const size = Math.min(100, Math.max(-100, sizePercent));
  const volume = base + ((size >= 0 ? 2.0 : 0.5) - base) * (Math.abs(size) / 100);
  const units = (Math.cbrt(volume) - 1) / (Math.cbrt(1.55) - 1);
  return { breastGrow: Math.min(1, units), 'shape:breastGrowMore': Math.max(0, units - 1) };
}

/** The builder's navel rule: her modelled outie is settled into an ordinary navel until late pregnancy. */
function navelFlat(bellyPercent: number): number {
  const t = Math.min(1, Math.max(0, (bellyPercent - 75) / 25));
  return 1 - t * t * (3 - 2 * t);
}

// ---- The mannequin ----

/** The bones the armor rides on, by what they are. (`toeL/R` are the bones past each ankle, bent back level for heels.) */
export type ArmorBone = HumanJointName | 'toeL' | 'toeR';

export interface Mannequin {
  /** Add this to the scene. Her soles are at y = `soleLift` above its origin (the boot's sole fills the gap). */
  readonly root: THREE.Group;
  /** Her main skin (the one big mesh the fitting measures and the skin-following plates are cut from). */
  readonly skin: THREE.SkinnedMesh;
  /** Every mesh of her (skin, eyes, lashes...), all sharing one skeleton. */
  readonly meshes: THREE.SkinnedMesh[];
  /** The loaded model's top object: the node her skeleton hangs under (what `attachRigidArmor` is given). */
  readonly model: THREE.Object3D;
  /** Each named joint's bone. */
  readonly bones: Readonly<Record<ArmorBone, THREE.Bone>>;
  readonly measure: HumanMeasure;
  /** Where each bone stood, in the world, as the file was loaded (her "rest" pose: standing, arms a little away from her sides, feet flat). */
  readonly restWorld: ReadonlyMap<THREE.Bone, THREE.Matrix4>;
  /** Her shape now. */
  belly: number;
  bust: number;
  /** How far her feet are pitched for heels, radians (0 = flat). */
  heelPitch: number;
  /** Set her belly (0-200 %) and bust size (-100..100) with her real shape keys. */
  setShape(bellyPercent: number, bustPercent: number): void;
  /**
   * Stand her in the builder's standing pose, feet pitched `heelPitch` radians for heels (toes down), and lift her
   * so her lowest point is `soleLift` metres above the floor (the thickness of a boot's sole).
   */
  stand(heelPitch: number, soleLift: number, armsOut?: number): void;
  /** Where every corner of her skin is right now, in world space (x, y, z, x, y, z ...). Slow: for fitting, not for every frame. */
  skinPositions(): Float32Array;
  dispose(): void;
}

/** Load the body and make it a mannequin. */
export async function loadMannequin(url: string = BODY_URL): Promise<Mannequin> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;
  const root = new THREE.Group();
  root.name = 'mannequin';
  root.add(model);

  // One flat, matte, light-grey material for all of her: a shop mannequin, so the armor is what the eye reads.
  const white = new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.92, metalness: 0 });
  const meshes: THREE.SkinnedMesh[] = [];
  const old = new Set<THREE.Material>();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) old.add(m);
    // (the file also carries the builder's bikini as separate thin meshes lying on her skin: a mannequin has no use for it)
    if (mats.some((m) => m.name === 'bikini')) mesh.visible = false;
    mesh.material = white;
    mesh.frustumCulled = false; // (a skinned mesh's bounds are those of its rest pose, so three could wrongly hide her)
    meshes.push(mesh);
  });
  // (her skin's pictures are never shown here, so they are let go at once)
  for (const m of old) {
    for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
    m.dispose();
  }
  // Her main skin is by far the biggest mesh.
  const skin = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));

  // Find her joints the builder's way: by measuring the skeleton, since the bones have no useful names.
  const rig = new HumanRig(model);
  const measure = measureHuman(rig.bind);
  const all = skin.skeleton.bones;
  const bones = {} as Record<ArmorBone, THREE.Bone>;
  for (const [name, index] of Object.entries(measure.joints)) bones[name as HumanJointName] = all[index];
  // (the toe bone is the ankle bone's own child)
  bones.toeL = bones.ankleL.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone;
  bones.toeR = bones.ankleR.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone;

  // Remember where every bone stands before anything poses her: the armor's fit is worked out against this.
  root.updateMatrixWorld(true);
  const restWorld = new Map<THREE.Bone, THREE.Matrix4>();
  for (const b of all) restWorld.set(b, b.matrixWorld.clone());

  const turns: MutableJointTurn[] = [];
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), turn = new THREE.Quaternion();
  /** Turn a bone by `angle` about the WORLD's left-right axis, whatever its own axes are. */
  const pitchBone = (bone: THREE.Bone, angle: number) => {
    bone.parent!.updateWorldMatrix(true, false);
    bone.parent!.getWorldQuaternion(parentQ);
    turn.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    // world turn -> the bone's own (local) turn:  local' = parent^-1 * turn * parent * local
    q.copy(parentQ).invert().multiply(turn).multiply(parentQ).multiply(bone.quaternion);
    bone.quaternion.copy(q);
  };

  const mannequin: Mannequin = {
    root, skin, meshes, model, bones, measure, restWorld,
    belly: 0, bust: 0, heelPitch: 0,

    setShape(bellyPercent, bustPercent) {
      this.belly = bellyPercent;
      this.bust = bustPercent;
      const shape: Record<string, number> = { ...bellyWeights(bellyPercent), ...bustWeights(bellyPercent, bustPercent), navelFlat: navelFlat(bellyPercent) };
      for (const mesh of meshes) {
        const dict = mesh.morphTargetDictionary, inf = mesh.morphTargetInfluences;
        if (!dict || !inf) continue;
        inf.fill(0);
        for (const [name, w] of Object.entries(shape)) if (dict[name] !== undefined) inf[dict[name]] = w;
      }
    },

    stand(heelPitch, soleLift, armsOut = 0) {
      this.heelPitch = heelPitch;
      model.position.y = 0;
      // The builder's own standing pose (at "second 0", so she is not mid-breath).
      rig.apply(poseHuman(measure, rig.bind, { stance: 'stand', phase: 0, seconds: 0, lean: 0, carry: this.belly / 100 }, turns));
      // (the lab can hold her arms further out, to see her sides and to check that pieces follow their bones)
      if (armsOut) {
        const roll = new THREE.Vector3(0, 0, 1);
        for (const [bone, sign] of [[bones.shoulderL, measure.leftSign], [bones.shoulderR, -measure.leftSign]] as const) {
          bone.parent!.updateWorldMatrix(true, false);
          bone.parent!.getWorldQuaternion(parentQ);
          turn.setFromAxisAngle(roll, armsOut * sign);
          bone.quaternion.copy(q.copy(parentQ).invert().multiply(turn).multiply(parentQ).multiply(bone.quaternion));
        }
      }
      // HEELS: each foot turns toes-down about its ankle, and its toes turn back up so they lie flat on the sole.
      if (heelPitch) {
        for (const side of ['L', 'R'] as const) {
          pitchBone(bones[`ankle${side}`], heelPitch);
          pitchBone(bones[`toe${side}`], -heelPitch);
        }
      }
      // Lift her so her lowest point (the balls of her feet) rests `soleLift` above the floor.
      root.updateMatrixWorld(true);
      const p = this.skinPositions();
      let low = Infinity;
      for (let i = 1; i < p.length; i += 3) if (p[i] < low) low = p[i];
      model.position.y = soleLift - low;
      root.updateMatrixWorld(true);
    },

    skinPositions() {
      root.updateMatrixWorld(true);
      const n = skin.geometry.attributes.position.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld); // (her shape keys and her bones, both applied)
        out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
      }
      return out;
    },

    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      white.dispose();
      rig.dispose();
    },
  };
  mannequin.setShape(0, 0);
  mannequin.stand(0, 0);
  return mannequin;
}
