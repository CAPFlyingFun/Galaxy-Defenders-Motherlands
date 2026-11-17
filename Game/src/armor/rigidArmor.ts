// ============================================================================
// rigidArmor.ts -- build a heroine's rigid armor, and put it on her.
//
//   const armor = buildRigidArmor(HEROINE_LOOKS.blaze);
//   attachRigidArmor(armor, heroineModel);   // any object her skeleton is under
//   ...
//   armor.dispose();
//
// `buildRigidArmor` makes every rigid piece the look names. Each piece already
// carries its FIT: the name of the bone it rides on and its place inside that
// bone (measured on the real body: bodyFitData.ts). `attachRigidArmor` finds
// each bone by name and parents the piece to it: no fitting, no numbers.
//
// DRAW CALLS. Every piece is one mesh with the one shared armor material, so
// one piece = one draw call. Pieces that ride the SAME bone are merged into
// one mesh to save calls: the knee guard goes into the shin armor (both ride
// the shin bone), and the two hip pieces into one (both ride the pelvis).
// Pass `{ merge: false }` to keep them apart.
// ============================================================================
import * as THREE from 'three';
import { ARMOR_SLOTS, type ArmorSlot, type SlotFit } from './bodyFit';
import { defaultKit, type ArmorKit } from './kit';
import { pieceColours, type HeroineLook } from './looks';
import { buildHelmet } from './pieces/helmet';
import { buildShoulderPad } from './pieces/shoulder';
import { buildForearmGuard, buildKneeGuard, buildShinArmor, buildThighHolster } from './pieces/limbs';
import { buildBoot } from './pieces/boot';
import { buildHipPiece } from './pieces/hip';
import { buildGun } from './pieces/guns';

export interface RigidArmor {
  /** The pieces, by the slot each belongs in. Not parented to anything until `attachRigidArmor`. */
  readonly pieces: Partial<Record<ArmorSlot, THREE.Mesh>>;
  /** Triangles in all the pieces together, and how many draw calls they cost (one per piece). */
  readonly triangles: number;
  readonly drawCalls: number;
  /** Take every piece off whatever it is attached to and free its geometry. (The shared material is the kit's: it lives on.) */
  dispose(): void;
}

export interface BuildOptions {
  /** Merge pieces that ride the same bone into one mesh (default true). */
  readonly merge?: boolean;
  readonly kit?: ArmorKit;
}

const fitMatrix = (f: SlotFit): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(...f.position), new THREE.Quaternion(...f.quaternion), new THREE.Vector3(f.scale, f.scale, f.scale));

/** Fold piece `b` into piece `a` (both ride the same bone): `b`'s corners are re-expressed in `a`'s frame. */
function mergeInto(a: THREE.Mesh, b: THREE.Mesh, fitA: SlotFit, fitB: SlotFit): void {
  const ga = a.geometry, gb = b.geometry;
  gb.applyMatrix4(fitMatrix(fitA).invert().multiply(fitMatrix(fitB)));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'armorFx']) {
    const x = ga.attributes[name].array as Float32Array, y = gb.attributes[name].array as Float32Array;
    const joined = new Float32Array(x.length + y.length);
    joined.set(x); joined.set(y, x.length);
    out.setAttribute(name, new THREE.BufferAttribute(joined, 3));
  }
  const na = ga.attributes.position.count, ia = ga.index!.array, ib = gb.index!.array;
  const index = new Uint32Array(ia.length + ib.length);
  index.set(ia);
  for (let i = 0; i < ib.length; i++) index[ia.length + i] = ib[i] + na;
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  // (marked points and notes on the folded-in piece move across too)
  for (const child of [...b.children]) a.add(child);
  Object.assign(a.userData, b.userData);
  ga.dispose(); gb.dispose();
  a.geometry = out;
}

/** Build every rigid piece of a look. */
export function buildRigidArmor(look: HeroineLook, opts: BuildOptions = {}): RigidArmor {
  const kit = opts.kit ?? defaultKit(), r = look.rigid, pal = look.palette;
  const pieces: Partial<Record<ArmorSlot, THREE.Mesh>> = {};
  const col = (p: { paint?: Parameters<typeof pieceColours>[1] }) => pieceColours(pal, p.paint);

  pieces.head = buildHelmet(r.helmet, col(r.helmet), kit);
  for (const s of ['L', 'R'] as const) {
    const sh = r[`shoulder${s}`], fa = r[`forearm${s}`], kn = r[`knee${s}`], sn = r[`shin${s}`], bt = r[`boot${s}`], hp = r[`hip${s}`], th = r[`thigh${s}`], gn = r[`gun${s}`];
    if (sh) pieces[`shoulder${s}`] = buildShoulderPad(sh, col(sh), s, kit);
    if (fa) pieces[`forearm${s}`] = buildForearmGuard(fa, col(fa), s, kit);
    if (kn) pieces[`knee${s}`] = buildKneeGuard(kn, col(kn), s, kit);
    if (sn) pieces[`shin${s}`] = buildShinArmor(sn, col(sn), s, kit);
    if (bt) pieces[`foot${s}`] = buildBoot(bt, col(bt), s, kit);
    if (hp) pieces[`hip${s}`] = buildHipPiece(hp, col(hp), s, kit);
    if (th) pieces[`thigh${s}`] = buildThighHolster(th, col(th), s, kit);
    if (gn) pieces[`gun${s}`] = buildGun(gn, col(gn), s, kit);
  }

  // Pieces on the same bone become one mesh (one draw call).
  if (opts.merge !== false) {
    const fold = (keep: ArmorSlot, gone: ArmorSlot) => {
      const a = pieces[keep], b = pieces[gone];
      if (!a || !b) return;
      mergeInto(a, b, kit.fit.slots[keep], kit.fit.slots[gone]);
      delete pieces[gone];
    };
    fold('shinL', 'kneeL'); fold('shinR', 'kneeR'); fold('hipL', 'hipR');
  }

  // Give each piece its fit: the bone it rides and its place inside that bone.
  let triangles = 0, drawCalls = 0;
  for (const slot of ARMOR_SLOTS) {
    const mesh = pieces[slot];
    if (!mesh) continue;
    const f = kit.fit.slots[slot];
    mesh.position.set(...f.position);
    mesh.quaternion.set(...f.quaternion);
    mesh.scale.setScalar(f.scale);
    mesh.userData.armorSlot = slot;
    mesh.userData.armorBone = f.bone;
    mesh.userData.fit = f;
    triangles += mesh.geometry.index!.count / 3;
    drawCalls++;
  }

  return {
    pieces, triangles, drawCalls,
    dispose() {
      for (const mesh of Object.values(pieces)) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    },
  };
}

/**
 * Put the armor on a body: each piece is parented to the bone it names, found by name anywhere under `skeletonRoot`
 * (the loaded model, or any object her bones are under). Returns the slots whose bone could not be found (none, on
 * the body the fit was measured from).
 */
export function attachRigidArmor(armor: RigidArmor, skeletonRoot: THREE.Object3D): ArmorSlot[] {
  const bones = new Map<string, THREE.Object3D>();
  skeletonRoot.traverse((o) => { if ((o as THREE.Bone).isBone && !bones.has(o.name)) bones.set(o.name, o); });
  const missing: ArmorSlot[] = [];
  for (const [slot, mesh] of Object.entries(armor.pieces) as Array<[ArmorSlot, THREE.Mesh]>) {
    const bone = bones.get(mesh.userData.armorBone as string);
    if (bone) bone.add(mesh); else missing.push(slot);
  }
  return missing;
}

/** Where a gun's shot leaves it, in world space (after `attachRigidArmor`). Null if she has no gun in that hand. */
export function gunMuzzle(armor: RigidArmor, hand: 'L' | 'R', out: THREE.Vector3): THREE.Vector3 | null {
  const gun = armor.pieces[`gun${hand}`], mark = gun?.getObjectByName('muzzle');
  return mark ? mark.getWorldPosition(out) : null;
}
