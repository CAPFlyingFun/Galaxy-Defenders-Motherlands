// ============================================================================
// jointGuard.ts -- HER JOINTS STAY WITHIN WHAT A REAL BODY CAN DO.
//
// Joshua (2026-11-17): "go through all the body joints so like the arm doesn't
// flip behind the head and shoulder bends at angles it shouldn't... based on
// real life statistics", "close but a slight average".
//
// THE NUMBERS are the Character Builder's own master table (Char_B
// data/jointRange.ts, Joshua 2026-11-04: "one master stat" for every human
// character): the CDC's Joint Range of Motion Study (adults 20-44, by sex) and
// the AAOS normal values. The woman's numbers, each opened up by LOOSER (10%):
// she is a fit heroine, "a slight average" above. Never a copy of a number:
// they are read from that table, so the game and the builder always agree, and
// so do the builder's own starting poses (stand, walk, sit, T-pose, and the
// birth poses), which it holds to the same table.
//
//   shoulder   forward 172, back 63 (less with the arm raised: an arm overhead
//              hardly goes behind the head), across the body 50
//   elbow      bends up to 150
//   wrist      70 to 80 each way
//   hip        forward 134, back 18, out 40, across 20
//   knee       bends up to 142
//   ankle      down 62 from standing
//   (her neck, back and the turn of each part of her are already kept within
//    their ranges by the game's turning rule: input/bodyTurn.ts)
//
// SQUATTING AND KNEELING put her weight on her hips, and the table's PASSIVE
// range (how far a joint gives when it is loaded: further) is the one used then,
// as the builder does for its squat and lunge (`passive`, 0 to 1, set by
// lowerBody.ts while she is down).
//
// HOW. Every frame, after everything that poses her (her walk, her turns, her
// aim, her arms kept off her belly), each joint is looked at in the frame of
// the body part it hangs from (a shoulder in her chest's frame, a hip in her
// pelvis's): which way its bone points. If that is past a limit, the bone is
// turned back to the limit by the smallest turn. Her hand is kept pointing as
// it pointed (her gun still points where she aims, as near as her arm lets
// it). How far past each limit she was is kept (`excess`) for the tests.
//
// Nothing here allocates while the game runs.
// ============================================================================
import * as THREE from 'three';
import type { ArmBones } from '../aimArms';
import { turnInWorld } from './boneTurn';
import { rangeDeg } from '@charb/data/jointRange';

const DEG = Math.PI / 180;
/** GAME TUNING: how much past the average normal range she can go (Joshua: "a slight average"). */
export const LOOSER = 1.1;

/** The limits, degrees, as measured on real women (before LOOSER): from the builder's table (data/jointRange.ts). */
const F = 'female' as const;
export const JOINT_LIMITS = {
  /**
   * An arm's furthest BEHIND her, by how high it is raised: hanging down (the table's shoulder extension), level with
   * the shoulder, and straight up. GAME TUNING for the last two, which the table has no number for: three quarters of
   * it level, a third of it overhead (an arm overhead hardly goes behind the head).
   */
  shoulderBack: [rangeDeg('shoulder', 'extension', F), rangeDeg('shoulder', 'extension', F) * 0.75, rangeDeg('shoulder', 'extension', F) / 3] as const,
  /** An arm's furthest ACROSS her body: in front of her (the table's adduction), and behind her (GAME TUNING: a third). */
  shoulderAcross: [rangeDeg('shoulder', 'adduction', F), rangeDeg('shoulder', 'adduction', F) / 3] as const,
  elbowBend: rangeDeg('elbow', 'flexion', F),
  /** (one cone for the wrist: the smaller of its two bends, toward the back of the hand) */
  wrist: Math.min(rangeDeg('wrist', 'flexion', F), rangeDeg('wrist', 'extension', F)),
  hipForward: rangeDeg('hip', 'flexion', F),
  hipBack: rangeDeg('hip', 'extension', F),
  hipOut: rangeDeg('hip', 'abduction', F),
  hipAcross: rangeDeg('hip', 'adduction', F),
  kneeBend: rangeDeg('knee', 'flexion', F),
  /** (one cone for the ankle: its larger bend, the foot pointed down) */
  ankle: rangeDeg('ankle', 'plantarflexion', F),
} as const;

/** Her hips' PASSIVE limits (loaded: squatting, kneeling), degrees, before LOOSER: the table's passive column. */
export const HIP_PASSIVE = {
  forward: rangeDeg('hip', 'flexion', F, 'passive'),
  out: rangeDeg('hip', 'abduction', F, 'passive'),
  across: rangeDeg('hip', 'adduction', F, 'passive'),
} as const;

/** One leg's bones, for the guard. */
export interface LegGuardBones { readonly side: number; readonly hip: THREE.Bone; readonly knee: THREE.Bone; readonly ankle: THREE.Bone }

/** How far past its limit each joint went this frame, degrees (0 = within), for the tests. */
export interface JointExcess { shoulder: number; elbow: number; wrist: number; hip: number; knee: number; ankle: number }

// Scratch objects, made once.
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), handQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A rest frame: a bone's turn, at rest, relative to her root (so "forward, up, her left" can be read off it later). */
function restInRoot(root: THREE.Object3D, bone: THREE.Object3D): THREE.Quaternion {
  root.getWorldQuaternion(q2);
  return bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(q2.invert());
}

export class JointGuard {
  on = true;
  /** 0 standing, 1 squatting or kneeling (her weight on her hips): her hips' limits go from active to PASSIVE. */
  passive = 0;
  /** How far past its limit each kind of joint went this frame (the most of either side), degrees. */
  readonly excess: JointExcess = { shoulder: 0, elbow: 0, wrist: 0, hip: 0, knee: 0, ankle: 0 };

  private readonly chestRest: THREE.Quaternion;
  private readonly pelvisRest: THREE.Quaternion;
  /** Each hand's direction (wrist to palm) and each foot's (ankle to toe), at rest, in its parent bone's own frame. */
  private readonly handRest: THREE.Vector3[];
  private readonly footRest: THREE.Vector3[];

  /**
   * @param root   her root (her own frame: facing +z, her left +x, up +y)
   * @param chest  the bone her arms hang from (their shoulders are read in its frame)
   * @param pelvis the bone her legs hang from
   * She must be standing at rest, nothing turned, when this is made.
   */
  constructor(root: THREE.Object3D, private readonly chest: THREE.Bone, private readonly pelvis: THREE.Bone,
              private readonly arms: readonly ArmBones[], private readonly legs: readonly LegGuardBones[]) {
    root.updateMatrixWorld(true);
    this.chestRest = restInRoot(root, chest);
    this.pelvisRest = restInRoot(root, pelvis);
    this.handRest = arms.map((arm) => this.inLocal(arm.fore, this.palm(arm, new THREE.Vector3()).sub(arm.hand.getWorldPosition(new THREE.Vector3()))));
    this.footRest = legs.map((leg) => {
      const toe = leg.ankle.children.find((child) => (child as THREE.Bone).isBone);
      const tip = toe ? toe.getWorldPosition(new THREE.Vector3()) : leg.ankle.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.1));
      return this.inLocal(leg.knee, tip.sub(leg.ankle.getWorldPosition(new THREE.Vector3())));
    });
  }

  /**
   * Measure only, changing nothing: how far past its limit each joint is NOW (into `excess`). For the tests, after
   * the last `update` of a frame: what is left when everything is done.
   */
  measure(): void {
    const on = this.on;
    this.on = false;
    this.update();
    this.on = on;
  }

  /** One frame, after everything that poses her: every joint brought back within its limits. */
  update(): void {
    const x = this.excess;
    x.shoulder = x.elbow = x.wrist = x.hip = x.knee = x.ankle = 0;
    for (const arm of this.arms) {
      arm.hand.getWorldQuaternion(handQ); // (her hand, pointing as it points: kept so)
      x.shoulder = Math.max(x.shoulder, this.shoulder(arm));
      x.elbow = Math.max(x.elbow, this.hinge(arm.upper, arm.fore, arm.hand, JOINT_LIMITS.elbowBend * LOOSER));
      this.keepHand(arm);
      x.wrist = Math.max(x.wrist, this.wrist(arm, this.handRest[this.arms.indexOf(arm)]));
    }
    this.legs.forEach((leg, i) => {
      x.hip = Math.max(x.hip, this.hip(leg));
      x.knee = Math.max(x.knee, this.hinge(leg.hip, leg.knee, leg.ankle, JOINT_LIMITS.kneeBend * LOOSER));
      x.ankle = Math.max(x.ankle, this.cone(leg.knee, leg.ankle, this.footTip(leg, e), this.footRest[i], JOINT_LIMITS.ankle * LOOSER));
    });
  }

  // ---- The joints ------------------------------------------------------------------------------------------------

  /**
   * A SHOULDER: which way the upper arm points, in her chest's frame (forward, up, and OUT to its own side). Too far
   * behind her (by how high the arm is: an arm overhead hardly goes behind her head) or too far across her: turned
   * back to the limit. Returns how far past it was, degrees.
   */
  private shoulder(arm: ArmBones): number {
    const L = JOINT_LIMITS.shoulderBack, A = JOINT_LIMITS.shoulderAcross;
    return this.region(this.chest, this.chestRest, arm.upper, arm.fore, arm.side, (dir) => {
      const up = dir.y;
      // furthest behind, by how high: hanging (up -1), level (0), overhead (+1)
      const back = (up < 0 ? L[1] + (L[0] - L[1]) * -up : L[1] + (L[2] - L[1]) * up) * LOOSER * DEG;
      const across = (dir.z >= 0 ? A[0] : A[0] + (A[1] - A[0]) * Math.min(1, -dir.z / Math.sin(back))) * LOOSER * DEG;
      return { minForward: -Math.sin(back), minOut: -Math.sin(across), maxOut: 2, maxUp: 2 };
    });
  }

  /** A HIP: which way the thigh points, in her pelvis's frame: not too far back, out, across, or up in front. */
  private hip(leg: LegGuardBones): number {
    const H = JOINT_LIMITS, p = this.passive;
    // (active standing, passive with her weight on them: blended by how far down she is)
    const forward = H.hipForward + (Math.max(H.hipForward, HIP_PASSIVE.forward) - H.hipForward) * p;
    const out = H.hipOut + (Math.max(H.hipOut, HIP_PASSIVE.out) - H.hipOut) * p;
    const across = H.hipAcross + (Math.max(H.hipAcross, HIP_PASSIVE.across) - H.hipAcross) * p;
    return this.region(this.pelvis, this.pelvisRest, leg.hip, leg.knee, leg.side, () => ({
      minForward: -Math.sin(H.hipBack * LOOSER * DEG),
      minOut: -Math.sin(across * LOOSER * DEG),
      maxOut: Math.sin(Math.min(89, out * LOOSER) * DEG),
      // (forward and up: at most this far from hanging straight down)
      maxUp: -Math.cos(Math.min(179, forward * LOOSER) * DEG),
    }));
  }

  /**
   * A ball joint kept inside a region: the bone's direction (from `bone` to `tip`) read in the frame `frame` had at
   * rest (x her left, y up, z forward; x turned to point OUT on this `side`), kept within `limits(direction)`.
   */
  private region(frame: THREE.Bone, frameRest: THREE.Quaternion, bone: THREE.Bone, tip: THREE.Object3D, side: number,
                 limits: (dir: THREE.Vector3) => { minForward: number; minOut: number; maxOut: number; maxUp: number }): number {
    bone.getWorldPosition(a);
    tip.getWorldPosition(b);
    const world = b.sub(a).normalize();
    // into the frame's rest axes: world -> the frame's own -> as it was at rest in her root
    frame.getWorldQuaternion(q);
    const dir = c.copy(world).applyQuaternion(q.invert()).applyQuaternion(frameRest);
    dir.x *= side; // (x now points OUT, away from her middle, on this side)
    const before = d.copy(dir);
    for (let pass = 0; pass < 3; pass++) {
      const lim = limits(dir);
      // each limit is a plane the direction must stay on one side of; past it, it is moved onto it and the rest
      // of the direction is scaled to keep its length
      if (dir.z < lim.minForward) setAxis(dir, 'z', lim.minForward);
      if (dir.x < lim.minOut) setAxis(dir, 'x', lim.minOut);
      if (dir.x > lim.maxOut) setAxis(dir, 'x', lim.maxOut);
      if (dir.y > lim.maxUp) setAxis(dir, 'y', lim.maxUp);
    }
    const past = before.angleTo(dir) / DEG;
    if (past < 0.05) return 0;
    if (!this.on) return past;
    // back into the world, and the bone turned the smallest way onto it
    dir.x *= side;
    frame.getWorldQuaternion(q);
    dir.applyQuaternion(q2.copy(frameRest).invert()).applyQuaternion(q);
    turnInWorld(bone, q2.setFromUnitVectors(world, dir.normalize()));
    return past;
  }

  /** A HINGE (elbow, knee): the angle between the bone before it and this one, no more than `most` degrees. */
  private hinge(above: THREE.Bone, joint: THREE.Bone, tip: THREE.Object3D, most: number): number {
    above.getWorldPosition(a);
    joint.getWorldPosition(b);
    tip.getWorldPosition(c);
    const upper = a.subVectors(b, a).normalize(), lower = c.sub(b).normalize();
    const bend = upper.angleTo(lower) / DEG;
    if (bend <= most) return 0;
    if (this.on) {
      // turned straighter about the axis it bends round, by what is past the limit
      d.crossVectors(upper, lower).normalize();
      turnInWorld(joint, q.setFromAxisAngle(d, -(bend - most) * DEG));
    }
    return bend - most;
  }

  /** A WRIST: her hand's direction against her forearm's, within its limit (her hand is kept pointing as near as it can). */
  private wrist(arm: ArmBones, rest: THREE.Vector3): number {
    return this.cone(arm.fore, arm.hand, this.palm(arm, e), rest, JOINT_LIMITS.wrist * LOOSER);
  }

  /** A cone: the direction from `joint` to `tip`, no more than `most` degrees from its rest (`rest`, in `parent`'s frame). */
  private cone(parent: THREE.Bone, joint: THREE.Bone, tip: THREE.Vector3, rest: THREE.Vector3, most: number): number {
    joint.getWorldPosition(a);
    const now = b.copy(tip).sub(a).normalize();
    parent.getWorldQuaternion(q);
    const want = c.copy(rest).applyQuaternion(q).normalize();
    const angle = now.angleTo(want) / DEG;
    if (angle <= most) return 0;
    if (this.on) {
      // the smallest turn that brings it back to the edge of the cone
      d.crossVectors(now, want).normalize();
      turnInWorld(joint, q.setFromAxisAngle(d, (angle - most) * DEG));
    }
    return angle - most;
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------------

  /** Her hand turned back to point as it did before the guard (her shoulder and elbow may have moved). */
  private keepHand(arm: ArmBones): void {
    if (!this.on) return;
    arm.fore.getWorldQuaternion(parentQ);
    arm.hand.quaternion.copy(parentQ.invert()).multiply(handQ);
    arm.hand.updateMatrixWorld(true);
  }
  /** The middle of her palm: part of the way from her wrist to her knuckles. */
  private palm(arm: ArmBones, out: THREE.Vector3): THREE.Vector3 {
    arm.hand.getWorldPosition(out);
    if (arm.knuckles.length === 0) return out.add(a.set(0, -0.08, 0));
    a.set(0, 0, 0);
    for (const k of arm.knuckles) a.add(k.getWorldPosition(b));
    return out.lerp(a.multiplyScalar(1 / arm.knuckles.length), 0.6);
  }
  /** The tip of her foot (her toe joint, or a little ahead of her ankle). */
  private footTip(leg: LegGuardBones, out: THREE.Vector3): THREE.Vector3 {
    const toe = leg.ankle.children.find((child) => (child as THREE.Bone).isBone);
    return toe ? toe.getWorldPosition(out) : leg.ankle.getWorldPosition(out).add(a.set(0, 0, 0.1));
  }
  /** A world direction, as seen in a bone's own frame. */
  private inLocal(bone: THREE.Object3D, world: THREE.Vector3): THREE.Vector3 {
    return world.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  }
}

/** Set one part of a unit direction, and scale the other two to keep its length 1. */
function setAxis(v: THREE.Vector3, axis: 'x' | 'y' | 'z', value: number): void {
  value = clamp(value, -1, 1);
  const others = axis === 'x' ? Math.hypot(v.y, v.z) : axis === 'y' ? Math.hypot(v.x, v.z) : Math.hypot(v.x, v.y);
  const k = others > 1e-6 ? Math.sqrt(Math.max(0, 1 - value * value)) / others : 0;
  if (axis !== 'x') v.x *= k;
  if (axis !== 'y') v.y *= k;
  if (axis !== 'z') v.z *= k;
  v[axis] = value;
}
