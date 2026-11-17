// ============================================================================
// aimArms.ts -- procedural aiming: both arms raised and pointed at a target.
//
// The Character Builder poses her (standing, walking, breathing). This file
// lays an AIM on top of that pose, straight onto her skeleton's bones:
//
//   1. her spine and chest turn a little toward the target;
//   2. each upper arm and forearm swing so the arm points from its shoulder at
//      the target, the elbow slightly bent, below and outside the line;
//   3. each hand lines up with the target, so a gun held in it points there;
//   4. a shot adds a short RECOIL: the elbow bends and the forearm kicks up.
//
// Everything is blended by `weight` (0 = the builder's pose untouched, 1 = full
// aim), so raising and lowering the guns is a smooth move, and held inside
// limits (how far a body can turn, how high an arm can point).
//
// SPACE. All the maths here is done in the space the bones' world matrices
// are in: the builder's own room (centimetres, her feet at its origin, facing
// +Z; see builderRoom.ts). So `target` must be given in that space;
// builderHeroine.ts converts the game's world point.
// ============================================================================
import * as THREE from 'three';

const DEG = Math.PI / 180;

/** The limits and amounts of the aim. Plain numbers, so they are easy to tune by eye in the heroine lab. */
export const AIM = Object.freeze({
  /** How far her upper body may turn toward a target to one side (spine and chest together). */
  torsoTurnMost: 30 * DEG,
  /** How much of the target's bearing her upper body takes (the rest is left to her arms). */
  torsoTurnShare: 0.45,
  /** How far to the side of straight-ahead an arm may point, and how far up and down. */
  armYawMost: 80 * DEG,
  armPitchUpMost: 78 * DEG,
  armPitchDownMost: 55 * DEG,
  /** The bend kept in her elbow while aiming (a locked-straight arm looks like a mannequin's). */
  elbowBend: 22 * DEG,
  /** RECOIL at its strongest: extra elbow bend, and how far the forearm kicks up. */
  recoilBend: 30 * DEG,
  recoilKick: 14 * DEG,
  /** How quickly a recoil dies away, and how quickly the arms come up or go down (seconds to cover ~63% of the way). */
  recoilSeconds: 0.09,
  raiseSeconds: 0.14,
});

/** The bones of one arm, and where the hand's knuckles are (to know which way the hand points). */
export interface ArmBones {
  /** +1 for her left arm, -1 for her right: which way is "outside" for this arm along her left-right axis. */
  readonly side: number;
  readonly upper: THREE.Bone;
  readonly fore: THREE.Bone;
  readonly hand: THREE.Bone;
  /** The first bone of each finger (not the thumb): their middle is the front of her palm. */
  readonly knuckles: readonly THREE.Bone[];
}

export interface AimBones {
  readonly spine: THREE.Bone;
  readonly chest: THREE.Bone;
  readonly left: ArmBones;
  readonly right: ArmBones;
}

/**
 * Find one hand's knuckle bones under its wrist: the first bone at or below the wrist that branches four ways or
 * more is the hand, each branch is a finger, and the branch furthest from the others is the thumb (left out).
 * (The same rule the builder's own finger code uses.)
 */
export function findKnuckles(wrist: THREE.Bone): THREE.Bone[] {
  const boneKids = (b: THREE.Object3D) => b.children.filter((c): c is THREE.Bone => (c as THREE.Bone).isBone === true);
  let hand: THREE.Object3D | null = null;
  const queue: THREE.Object3D[] = [wrist];
  while (queue.length) {
    const b = queue.shift()!;
    const kids = boneKids(b);
    if (kids.length >= 4) { hand = b; break; }
    queue.push(...kids);
  }
  if (!hand) return [];
  const fingers = boneKids(hand);
  const at = fingers.map((f) => f.getWorldPosition(new THREE.Vector3()));
  const middle = at.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / at.length);
  let thumb = 0;
  at.forEach((p, i) => { if (p.distanceTo(middle) > at[thumb].distanceTo(middle)) thumb = i; });
  return fingers.filter((_, i) => i !== thumb);
}

// Scratch objects, made once: nothing is allocated while the game runs.
const parentQ = new THREE.Quaternion(), turnQ = new THREE.Quaternion(), noTurn = new THREE.Quaternion();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const want = new THREE.Vector3(), pole = new THREE.Vector3(), now = new THREE.Vector3(), aimLine = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Turn a bone by a rotation given in WORLD space (and only `weight` of it), then bring the world matrices of the
 * bone and everything hanging from it up to date, so the next bone down the arm starts from where this one now is.
 */
function turnInWorld(bone: THREE.Bone, worldTurn: THREE.Quaternion, weight: number): void {
  if (!bone.parent) return;
  turnQ.copy(noTurn).slerp(worldTurn, weight);
  bone.parent.getWorldQuaternion(parentQ);
  // local' = parent⁻¹ · turn · parent · local   (the same turn, seen from inside the parent's frame)
  bone.quaternion.premultiply(parentQ).premultiply(turnQ).premultiply(parentQ.invert());
  bone.updateMatrixWorld(true);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The aim's own moving state: how far the arms are raised, and each hand's recoil. */
export class ArmAim {
  /** 0 = arms as the builder poses them, 1 = fully aimed. Eased toward 0 or 1 by `advance`. */
  weight = 0;
  private readonly kick = { left: 0, right: 0 };
  private readonly worldTurn = new THREE.Quaternion();
  /** Where she last aimed: kept so the arms come DOWN from where they were, not from nowhere. */
  private readonly lastTarget = new THREE.Vector3();
  private hasTarget = false;

  constructor(private readonly bones: AimBones) {}

  /** One shot from one hand: its recoil starts at full strength. */
  fire(hand: 'left' | 'right'): void { this.kick[hand] = 1; }

  /** Move the easing along by `dt` seconds. `aiming`: whether there is a target this frame. */
  advance(dt: number, aiming: boolean): void {
    const ease = 1 - Math.exp(-dt / AIM.raiseSeconds);
    this.weight += ((aiming ? 1 : 0) - this.weight) * ease;
    if (this.weight < 0.002 && !aiming) { this.weight = 0; this.hasTarget = false; }
    const fade = Math.exp(-dt / AIM.recoilSeconds);
    this.kick.left *= fade;
    this.kick.right *= fade;
  }

  /**
   * Lay the aim over the pose the bones have NOW. `target` is in the same space as the bones' world matrices;
   * null means "no target": the arms go on easing down from the last one.
   * The bones' world matrices must be up to date when this is called.
   */
  apply(target: THREE.Vector3 | null): void {
    if (target) { this.lastTarget.copy(target); this.hasTarget = true; }
    if (!this.hasTarget || this.weight <= 0) return;
    const w = this.weight, t = this.lastTarget, { spine, chest } = this.bones;

    // ---- 1. her upper body turns a little toward the target (about the upright axis) ----
    // Her facing is +Z in this space; the bearing is how far round from that the target is, seen from her chest.
    chest.getWorldPosition(a);
    const bearing = Math.atan2(t.x - a.x, t.z - a.z);
    const torso = clamp(bearing * AIM.torsoTurnShare, -AIM.torsoTurnMost, AIM.torsoTurnMost);
    this.worldTurn.setFromAxisAngle(UP, torso / 2);
    turnInWorld(spine, this.worldTurn, w);
    turnInWorld(chest, this.worldTurn, w);

    // ---- 2. each arm ----
    this.aimArm(this.bones.left, t, torso, this.kick.left, w);
    this.aimArm(this.bones.right, t, torso, this.kick.right, w);
  }

  private aimArm(arm: ArmBones, target: THREE.Vector3, torso: number, kick: number, w: number): void {
    // The line from her shoulder to the target, held inside what an arm can do: measured as a bearing (round from
    // where her turned chest faces) and a pitch (up from level), each clamped, then made back into a direction.
    arm.upper.getWorldPosition(a);
    aimLine.copy(target).sub(a);
    const flat = Math.hypot(aimLine.x, aimLine.z);
    const yaw = torso + clamp(wrapAngle(Math.atan2(aimLine.x, aimLine.z) - torso), -AIM.armYawMost, AIM.armYawMost);
    const pitch = clamp(Math.atan2(aimLine.y, flat), -AIM.armPitchDownMost, AIM.armPitchUpMost);
    aimLine.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    // Her elbow sits off that line, below it and to the outside: `pole` is that direction, square to the line.
    pole.set(arm.side * 0.55, -1, 0).addScaledVector(aimLine, -pole.dot(aimLine)).normalize();
    const bend = (AIM.elbowBend + AIM.recoilBend * kick) / 2;

    // Upper arm: from the shoulder, along the line but dipped toward the elbow's side.
    arm.fore.getWorldPosition(b);
    now.copy(b).sub(a).normalize();
    want.copy(aimLine).multiplyScalar(Math.cos(bend)).addScaledVector(pole, Math.sin(bend)).normalize();
    turnInWorld(arm.upper, this.worldTurn.setFromUnitVectors(now, want), w);

    // Forearm: back up toward the line by the same angle, so her hand lands on it; a shot kicks it up further.
    arm.fore.getWorldPosition(b);
    arm.hand.getWorldPosition(c);
    now.copy(c).sub(b).normalize();
    want.copy(aimLine).multiplyScalar(Math.cos(bend)).addScaledVector(pole, -Math.sin(bend)).addScaledVector(UP, Math.sin(AIM.recoilKick * kick)).normalize();
    turnInWorld(arm.fore, this.worldTurn.setFromUnitVectors(now, want), w);

    // Hand: its palm-forward direction (wrist to knuckles) along the aim line, so the gun in it points at the target.
    if (arm.knuckles.length > 0) {
      arm.hand.getWorldPosition(c);
      now.set(0, 0, 0);
      for (const k of arm.knuckles) now.add(k.getWorldPosition(a));
      now.multiplyScalar(1 / arm.knuckles.length).sub(c).normalize();
      want.copy(aimLine).addScaledVector(UP, Math.sin(AIM.recoilKick * kick)).normalize();
      turnInWorld(arm.hand, this.worldTurn.setFromUnitVectors(now, want), w);
    }
  }
}

/** An angle brought into -180°..180°. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
