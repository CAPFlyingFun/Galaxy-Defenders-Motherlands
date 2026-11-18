// ============================================================================
// clipGrip.ts -- WHERE HER HAND GOES TO TAKE A CLIP: shared by the weapon
// table's reload (tableUse.ts) and her reload from her belt (beltReload.ts).
//
// Joshua (2026-11-18): take the clip "in the inside palm like grabbing the
// pole", not by the fingertips; her fingers never bent backwards; no twisted
// wrists, no reaching round the far side.
//
// A clip is a box (2.4 cm across, 3.6 cm deep, 6 cm long). Her hand holds it
// as she holds the pole (fingerTouch.ts `gripPose`): palm on its side, fingers
// round it, thumb along it toward `up`. Of the grips all the way round it, the
// one used is:
//   * on HER side of the clip (her palm faces away from her shoulder: she never
//     reaches round it),
//   * within GRIP.fromHandshake of the "handshake" (palm toward her middle),
//   * the one her hand turns LEAST to get to from how it is turned now.
// Her palm is laid on the clip's real side the way it faces (its depth, not a
// round bar's: a palm sunk into the wide side made her fingers bend backwards).
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineHands } from '../core/contracts';
import { CLIP } from '../heroine/guns';

/** GAME TUNING. */
export const GRIP = Object.freeze({
  /** How many grips round a clip are tried (every 15 degrees). */
  tries: 24,
  /** How near the handshake they stay (a cosine: 0.82 is about 35 degrees). */
  fromHandshake: 0.82,
  /** How far out from her middle her shoulder is, and how high, metres (where her arm comes from). */
  shoulderOut: 0.18,
  shoulderUp: 1.35,
});

const place = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
const up = new THREE.Vector3(), across = new THREE.Vector3(), deep = new THREE.Vector3();
const handNow = new THREE.Quaternion(), shoulderTo = new THREE.Vector3(), roundA = new THREE.Vector3(), roundB = new THREE.Vector3();
const handshake = new THREE.Vector3(), palmWay = new THREE.Vector3(), wrapWay = new THREE.Vector3();
const gripAt = new THREE.Vector3(), gripTurn = new THREE.Quaternion(), gripSize = new THREE.Vector3(), tryPose = new THREE.Matrix4();

/**
 * The pose (world) for hand `hand` to take a clip whose own matrix (world) is `clipAt`.
 * @param upSign     which way along the clip her thumb points: +1 its own +y (base to top: a clip standing upright),
 *                   -1 its -y (a clip standing on its head, as in her pouches: its base is up)
 * @param holdAlong  where along the clip her hand goes, metres from its middle toward her thumb (negative: away)
 */
export function clipGrip(h: HeroineHands, root: THREE.Object3D, hand: Hand, clipAt: THREE.Matrix4, upSign: 1 | -1, holdAlong: number, out: THREE.Matrix4): THREE.Matrix4 {
  root.updateWorldMatrix(true, false);
  clipAt.decompose(place, turn, size);
  up.set(0, upSign, 0).applyQuaternion(turn);
  across.set(1, 0, 0).applyQuaternion(turn);
  deep.set(0, 0, 1).applyQuaternion(turn);
  place.addScaledVector(up, holdAlong);
  const side = hand === 'left' ? 1 : -1; // (her left is her root's +x)
  // how her hand is turned now, and the way from her shoulder to the clip (square to the clip)
  const bone = h.handBone(hand);
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(handNow);
  shoulderTo.set(side * GRIP.shoulderOut, GRIP.shoulderUp, 0).applyMatrix4(root.matrixWorld);
  shoulderTo.subVectors(place, shoulderTo);
  shoulderTo.addScaledVector(up, -shoulderTo.dot(up)).normalize();
  // two directions square to the clip, to go round it with
  roundA.set(1, 0, 0).transformDirection(root.matrixWorld);
  roundA.addScaledVector(up, -roundA.dot(up));
  if (roundA.lengthSq() < 1e-6) roundA.set(0, 0, 1).transformDirection(root.matrixWorld).addScaledVector(up, -up.z);
  roundA.normalize();
  roundB.crossVectors(up, roundA);
  // the handshake: her palm toward her middle (the pole's grip)
  handshake.set(-side, 0, 0).transformDirection(root.matrixWorld);
  handshake.addScaledVector(up, -handshake.dot(up)).normalize();
  let bestTurn = Infinity, found = false;
  for (let k = 0; k < GRIP.tries; k++) {
    const angle = (k / GRIP.tries) * Math.PI * 2;
    palmWay.copy(roundA).multiplyScalar(Math.cos(angle)).addScaledVector(roundB, Math.sin(angle));
    if (palmWay.dot(shoulderTo) < 0.1) continue;               // (her palm would face back at her: round the far side)
    if (palmWay.dot(handshake) < GRIP.fromHandshake) continue;   // (kept near the handshake)
    wrapWay.crossVectors(up, palmWay);                            // (this way round, her thumb points along `up`)
    // (the clip's side, the way her palm faces: it is a box)
    const reach = Math.abs(palmWay.dot(across)) * CLIP.width / 2 + Math.abs(palmWay.dot(deep)) * CLIP.depth / 2;
    h.gripPose(hand, place, up, palmWay, wrapWay, reach, tryPose);
    tryPose.decompose(gripAt, gripTurn, gripSize);
    const turned = gripTurn.angleTo(handNow);
    if (turned < bestTurn) { bestTurn = turned; out.copy(tryPose); found = true; }
  }
  if (found) return out;
  // (none on her side: the handshake itself, its fingers round the clip's front)
  wrapWay.set(0, 0, 1).transformDirection(root.matrixWorld);
  const reach = Math.abs(handshake.dot(across)) * CLIP.width / 2 + Math.abs(handshake.dot(deep)) * CLIP.depth / 2;
  return h.gripPose(hand, place, up, handshake, wrapWay, reach, out);
}
