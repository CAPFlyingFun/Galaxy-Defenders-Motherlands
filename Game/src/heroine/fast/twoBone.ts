// ============================================================================
// twoBone.ts -- a limb of two bones (upper arm and forearm, or thigh and shin)
// brought so its end lands on a point: "two-bone IK", the same as Beyond
// Extinction's foot IK (characters/foot_ik.gd) and the Character Builder's
// reach.
//
// Three joints: the ROOT of the limb (shoulder or hip) stays where it is, the
// MIDDLE (elbow or knee) is a hinge, the END (wrist or ankle) goes to the
// target. With both bones' lengths fixed, the middle joint can only be on a
// circle round the line from root to target; the POLE says which point of
// that circle: the one toward the pole (an elbow hangs down and out, a knee
// points forward).
// ============================================================================
import * as THREE from 'three';
import { turnInWorld } from './boneTurn';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const line = new THREE.Vector3(), side = new THREE.Vector3(), middle = new THREE.Vector3(), endAt = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3();
const turn = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

/**
 * Bring `end` onto `target` (world), turning `upper` and `lower`, the middle joint toward `pole` (a world
 * direction), by `weight` of the way (0 untouched, 1 there). A target further than the limb reaches is reached as
 * far as it goes, `most` of its full length (a limb never quite locks straight).
 * @returns how far short of the target the end stays, metres (0: on it)
 */
export function solveTwoBone(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Object3D, target: THREE.Vector3,
                             pole: THREE.Vector3, weight = 1, most = 0.995): number {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const first = a.distanceTo(b), second = b.distanceTo(c);
  line.copy(target).sub(a);
  const wanted = line.length();
  const far = Math.max(Math.abs(first - second) + 1e-4, Math.min(wanted, (first + second) * most));
  if (wanted < 1e-6) return 0;
  line.normalize();
  // the pole made square to the line (if it runs along the line, any square direction will do)
  side.copy(pole).addScaledVector(line, -pole.dot(line));
  if (side.lengthSq() < 1e-10) side.set(0, 0, 1).addScaledVector(line, -line.z);
  side.normalize();
  // where the middle joint goes: `along` down the line, `off` out toward the pole
  const along = (first * first - second * second + far * far) / (2 * far);
  const off = Math.sqrt(Math.max(0, first * first - along * along));
  middle.copy(a).addScaledVector(line, along).addScaledVector(side, off);
  endAt.copy(a).addScaledVector(line, far);
  // the first bone toward the middle joint's place, then the second toward the end's
  turnPart(upper, from.copy(b).sub(a).normalize(), to.copy(middle).sub(a).normalize(), weight);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  turnPart(lower, from.copy(c).sub(b).normalize(), to.copy(endAt).sub(b).normalize(), weight);
  return Math.max(0, wanted - far);
}

/** Turn a bone so the world direction `from` becomes `to`, by `weight` of the way. */
export function turnPart(bone: THREE.Bone, fromDir: THREE.Vector3, toDir: THREE.Vector3, weight: number): void {
  turn.setFromUnitVectors(fromDir, toDir);
  if (weight < 1) turn.slerp(IDENTITY, 1 - weight);
  turnInWorld(bone, turn);
}
