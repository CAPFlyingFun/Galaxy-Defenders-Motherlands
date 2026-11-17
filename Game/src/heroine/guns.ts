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

export interface Gun {
  /** The gun. Its matrix is set by hand each frame (`matrixAutoUpdate` is off). */
  readonly object: THREE.Mesh;
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

  return {
    object,
    tip: new THREE.Vector3(0, 0.055, 0.23),
    dispose(): void {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
