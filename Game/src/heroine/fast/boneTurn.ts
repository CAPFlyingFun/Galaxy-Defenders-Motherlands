// ============================================================================
// boneTurn.ts -- turning one bone by a rotation given in the WORLD's space.
//
// A bone's own rotation is kept relative to its parent, so "turn this bone
// about the world's upright axis" (or about any line in the world) has to be
// carried into the parent's frame first. Used wherever a pose is adjusted
// after the builder's poser has written it: her legs reached to her feet
// (footGround.ts), her arms kept clear of her belly (armClear.ts).
// ============================================================================
import * as THREE from 'three';

const parentQ = new THREE.Quaternion();

/**
 * Turn a bone by a rotation given in WORLD space, then bring the world matrices of the bone and everything hanging
 * from it up to date (so the next bone down the limb starts from where this one now is).
 */
export function turnInWorld(bone: THREE.Bone, worldTurn: THREE.Quaternion): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(parentQ);
  // local' = parent⁻¹ · turn · parent · local   (the same turn, seen from inside the parent's frame)
  bone.quaternion.premultiply(parentQ).premultiply(worldTurn).premultiply(parentQ.invert());
  bone.updateMatrixWorld(true);
}
