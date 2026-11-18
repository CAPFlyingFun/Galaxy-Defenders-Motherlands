// ============================================================================
// guns.ts -- two simple placeholder pistols, built from boxes and a cylinder.
//
// Dark metal with a magenta stripe that glows a little. Each gun is ONE mesh
// with two materials (two draw calls), modelled in metres:
//   * its origin is where her palm holds the grip;
//   * +Z is the way the barrel points, +Y is the top of the gun.
// builderHeroine.ts places each gun on a hand every frame. Real gun models (or
// the armor system's) can replace these later: only `tip` has to stay true.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArmBones } from './aimArms';

export interface Gun {
  /** The gun. Its matrix is set by hand each frame (`matrixAutoUpdate` is off). */
  readonly object: THREE.Mesh;
  /**
   * ITS CLIP (Joshua, 2026-11-17: 20 rounds a gun, reloaded at the table): its own small object in the bottom of the
   * grip, so it can be popped out and a new one clicked in. Its matrix is set by hand too.
   */
  readonly clip: THREE.Mesh;
  /** Where the clip sits in the gun (the gun's own space): put back here when a clip is clicked in. */
  readonly clipSeat: THREE.Matrix4;
  /** Where a shot leaves the barrel, in the gun's own space (metres). */
  readonly tip: THREE.Vector3;
  dispose(): void;
}

/** A box of the given size with its middle moved to (x, y, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function createGun(): Gun {
  // The dark parts: the slide (the long top block), the grip (angled back a little) and the barrel.
  const slide = box(0.034, 0.042, 0.2, 0, 0.05, 0.06);
  const grip = box(0.03, 0.11, 0.045, 0, -0.02, -0.01).rotateX(-0.22);
  const guard = box(0.012, 0.012, 0.06, 0, 0.012, 0.05);
  const barrel = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0.055, 0.19);
  const dark = mergeGeometries([slide, grip, guard, barrel]);
  // The magenta stripe along both sides of the slide, and a ring at the muzzle.
  const stripe = box(0.037, 0.008, 0.15, 0, 0.056, 0.07);
  const ring = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10).rotateX(Math.PI / 2).translate(0, 0.055, 0.222);
  const glow = mergeGeometries([stripe, ring]);
  // One geometry, two groups: group 0 is drawn with the dark material, group 1 with the magenta one.
  const geometry = mergeGeometries([dark, glow], true);
  for (const part of [slide, grip, guard, barrel, stripe, ring, dark, glow]) part.dispose();

  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.45, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xff2fb0, emissive: 0xff2fb0, emissiveIntensity: 0.8, roughness: 0.4 }),
  ];
  const object = new THREE.Mesh(geometry, materials);
  object.name = 'placeholder-gun';
  object.matrixAutoUpdate = false;
  // (her hands move it every frame and it is small: testing it against the camera's view costs more than drawing it)
  object.frustumCulled = false;

  const clip = createClip(materials);
  // (in the bottom of the grip, along the grip's slant, its base standing a little proud of it)
  const clipSeat = new THREE.Matrix4().makeRotationX(-0.22).multiply(new THREE.Matrix4().makeTranslation(0, CLIP.seatY, -0.01));
  clip.matrix.copy(clipSeat);
  object.add(clip);

  return {
    object,
    clip,
    clipSeat,
    tip: new THREE.Vector3(0, 0.055, 0.23),
    dispose(): void {
      geometry.dispose();
      clip.geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** A clip's size, metres, and where its middle sits in the grip (along the grip, from the gun's origin). */
export const CLIP = Object.freeze({ width: 0.024, height: 0.06, depth: 0.036, seatY: -0.058 });

/**
 * One clip: a dark box with a magenta base plate (the part that shows under the grip). Its origin is its middle; its
 * long side runs up and down the grip. Shares the gun's two materials (dark, magenta), so it costs one more draw.
 */
export function createClip(materials: THREE.Material[]): THREE.Mesh {
  const body = box(CLIP.width, CLIP.height, CLIP.depth, 0, 0, 0);
  const base = box(CLIP.width + 0.004, 0.008, CLIP.depth + 0.004, 0, -CLIP.height / 2, 0);
  const geometry = mergeGeometries([body, base], true);
  body.dispose(); base.dispose();
  const clip = new THREE.Mesh(geometry, materials);
  clip.name = 'clip';
  clip.matrixAutoUpdate = false;
  clip.frustumCulled = false;
  return clip;
}

/**
 * WHERE A GUN SITS IN A HAND: the gun's matrix in the hand bone's own space, worked out once from the hand as it
 * hangs at her side (she must be standing, facing +Z, her bones' world matrices up to date).
 *
 * Both heroines use it. `unitsPerMetre` is how many of the units her bones are measured in make one metre: 100 in
 * the builder's room (centimetres), 1 for a body that stands in the game's own world.
 */
export function seatGunInHand(arm: ArmBones, unitsPerMetre: number, out: THREE.Matrix4): THREE.Matrix4 {
  const wrist = arm.hand.getWorldPosition(new THREE.Vector3());
  const knuckles = new THREE.Vector3();
  for (const k of arm.knuckles) knuckles.add(k.getWorldPosition(new THREE.Vector3()));
  if (arm.knuckles.length) knuckles.multiplyScalar(1 / arm.knuckles.length); else knuckles.copy(wrist).add(new THREE.Vector3(0, -0.08 * unitsPerMetre, 0));
  // The barrel points the way her hand does (wrist to knuckles). With her arm hanging, her thumb is to the front:
  // that is the gun's top, so when the arm swings up level the gun is upright.
  const forward = knuckles.clone().sub(wrist).normalize();
  const top = new THREE.Vector3(0, 0, 1).addScaledVector(forward, -forward.z).normalize();
  const across = new THREE.Vector3().crossVectors(top, forward).normalize();
  // The grip sits in her palm: most of the way to her knuckles, and 2 cm toward her body (hanging, her palm
  // faces her thigh, so "toward her body" is toward her middle, x = 0).
  const inward = new THREE.Vector3(-Math.sign(wrist.x) || 0, 0, 0).addScaledVector(forward, Math.sign(wrist.x) * forward.x).normalize();
  const grip = wrist.clone().lerp(knuckles, 0.8).addScaledVector(inward, 0.02 * unitsPerMetre);
  const gunWorld = new THREE.Matrix4().makeBasis(across, top, forward).setPosition(grip).scale(new THREE.Vector3(unitsPerMetre, unitsPerMetre, unitsPerMetre));
  return out.copy(arm.hand.matrixWorld).invert().multiply(gunWorld);
}
