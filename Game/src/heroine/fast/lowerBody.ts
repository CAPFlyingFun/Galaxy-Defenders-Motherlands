// ============================================================================
// lowerBody.ts -- she gets down to what she reaches for (Joshua, 2026-11-17:
// "for stuff below belly, I am thinking squatting or bending down on one knee
// which is common as well, if it's mid belly or higher can bend forward", and
// "one knee on the ground, the other bent like a sideways L... can also
// randomly do both knees or only one, almost like a proposal pose").
//
// HOW LOW, BY WHERE IT IS against her own body (measured from her, so it fits
// any belly):
//
//   at mid-belly or higher   REACH: she bends forward at the hips only as much
//                            as her arm needs, her back fairly straight;
//   below mid-belly, above   LOW: her knees bend and her hips drop a little,
//   her knees                then she leans in;
//   below her knees          SQUAT: the Character Builder's squat (its birth
//                            pose, which works for every belly): knees wide
//                            round her belly, heels down, leaning forward;
//   on the floor             KNEEL: one knee down, the shin flat behind her,
//                            the other foot forward with its knee up (a
//                            proposal), or both knees down: chosen at random.
//
// The bigger her belly, the less she folds forward at the waist (her belly is
// in the way), so the lower poses come sooner.
//
// HOW IT IS DONE, over whatever pose she was in (standing, breathing):
//   1. her hips are lowered (and moved back a little to keep her balance);
//   2. she bends forward: most of it at her hips, the rest shared up her back;
//   3. each leg is solved again so its foot is where it should be: still on the
//      spot it stood on, or, kneeling, the knee on the floor and the shin flat;
//      each knee pointing the way the pose wants (forward, or out round her
//      belly in a squat);
// all of it by one eased weight, so she goes down and comes up smoothly.
//
// Her weight is then on her hips: the joint guard uses their PASSIVE range
// (`passive`, read by jointGuard.ts).
// ============================================================================
import * as THREE from 'three';
import type { Egg } from './armClear';
import { solveTwoBone } from './twoBone';
import { turnInWorld } from './boneTurn';

const DEG = Math.PI / 180;

/** GAME TUNING, plain numbers to tune by eye. */
export const LOWER = Object.freeze({
  /** How long going down (or coming back up) takes, seconds. */
  seconds: 0.6,
  /** Below this height above the floor, metres, she kneels. */
  floorBelow: 0.28,
  /** How much of her arm's length (shoulder to the hand bone) she reaches with, before she bends in for more. */
  armReach: 0.88,
  /** The most she folds forward, degrees: with no belly, and with a full one (her belly is in the way). */
  hingeMost: [75, 35] as const,
  /** Squatting and kneeling, the most she leans forward, degrees. */
  hingeDownMost: [45, 30] as const,
  /** Of a forward bend, the share at her hips (the rest is shared up her back). */
  hingeAtHips: 0.65,
  /** LOW: how far her hips drop for each metre the target is below her mid-belly, and at most, metres. */
  lowDropPerMetre: 0.7,
  lowDropMost: 0.3,
  /**
   * LEANING IN FURTHER when her hand still falls short (her arm straight): how quickly, metres of lean each second
   * for each metre short; first more bend (up to the most her belly allows), then her hips forward, at most this far.
   */
  leanInPerSecond: 4,
  hipsForwardMost: 0.18,
  /** SQUAT (the builder's birth squat): her hip-to-ankle distance as a share of her leg, knees out (degrees, plus per 100% of belly), hips back. */
  squatLeg: 0.48,
  squatSpread: 62,
  squatSpreadPerBump: 6,
  squatBack: 0.08,
  /** KNEEL: the knee's middle above the floor, the thigh's lean back from upright (degrees), the front foot forward. */
  kneeAboveFloor: 0.06,
  kneelThighLean: 12,
  kneelBothLean: 18,
  frontFootForward: 0.32,
  /** The kneeling foot's toes tipped down onto the floor, degrees. */
  kneelToesDown: 80,
});

type Mode = 'reach' | 'low' | 'squat' | 'kneelLeft' | 'kneelRight' | 'kneelBoth';

/** One leg's bones. */
export interface LowerLeg { readonly hip: THREE.Bone; readonly knee: THREE.Bone; readonly ankle: THREE.Bone }

const v = new THREE.Vector3(), w = new THREE.Vector3(), poleNow = new THREE.Vector3(), poleWant = new THREE.Vector3();
const leftAxis = new THREE.Vector3(), forward = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const rootQ = new THREE.Quaternion(), turn = new THREE.Quaternion();
const ankleAt = [new THREE.Vector3(), new THREE.Vector3()], ankleQ = [new THREE.Quaternion(), new THREE.Quaternion()];
const kneeAt = new THREE.Vector3(), footAt = new THREE.Vector3(), hipAt = new THREE.Vector3();

export class LowerBody {
  /** 0 standing as posed, 1 fully down: eased. */
  weight = 0;
  /** How much her weight is on her hips (squatting or kneeling), 0..1: for the joint guard's passive range. */
  passive = 0;
  /** What she is doing (for the readout and the tests). */
  mode: Mode = 'reach';

  /** Measured standing (her own frame, metres): her hips' and knees' heights, her trunk, her thigh and shin. */
  private readonly hipY: number;
  private readonly kneeY: number;
  private readonly ankleY: number;
  private readonly trunk: number;
  private readonly thigh: number;
  private readonly shin: number;
  private readonly arm: number;
  /** How far down and how far forward she is going, at full weight (worked out when the target is given). */
  /** (read by the tests: how far her hips drop and how far she bends forward, at full weight; metres, radians) */
  drop = 0;
  hinge = 0;
  private back = 0;
  private along = 0;
  private wantDown = false;
  private wantMode: Mode = 'reach';
  private lastTargetY = NaN;
  /** The most she may bend in this pose (her belly allows), radians; and how far she has leaned in further, metres. */
  private hingeMost = 0;
  private leanIn = 0;
  /**
   * Her hips' place as her pose left it, and as this wrote it. Her pose sets every bone's TURN afresh each frame, but
   * not her hips' PLACE: so the place this moved them to is put back first, each frame, or she would sink a little
   * further every frame.
   */
  private readonly hipsBefore = new THREE.Vector3();
  private readonly hipsWritten = new THREE.Vector3(NaN, NaN, NaN);

  /**
   * @param root      her root (her own frame: facing +z, her left +x, up +y)
   * @param hips      the bone her legs and her back hang from (moved and turned to lower her)
   * @param back      her back's bones, lowest first (share the rest of a forward bend)
   * @param legs      left then right
   * @param shoulder  one shoulder bone and its hand bone (to measure her arm)
   * @param leftSign  +1 if her left is her root's +x (measured from her joints, as the heroine does), else -1
   * She must be standing at rest when this is made.
   */
  constructor(private readonly root: THREE.Object3D, private readonly hips: THREE.Bone, private readonly backBones: readonly THREE.Bone[],
              private readonly legs: readonly [LowerLeg, LowerLeg], shoulder: THREE.Bone, hand: THREE.Bone, private readonly leftSign = 1) {
    root.updateMatrixWorld(true);
    const inFrame = (o: THREE.Object3D): THREE.Vector3 => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const l = legs[0];
    this.hipY = (inFrame(legs[0].hip).y + inFrame(legs[1].hip).y) / 2;
    this.kneeY = (inFrame(legs[0].knee).y + inFrame(legs[1].knee).y) / 2;
    this.ankleY = (inFrame(legs[0].ankle).y + inFrame(legs[1].ankle).y) / 2;
    this.trunk = inFrame(shoulder).y - this.hipY;
    this.thigh = inFrame(l.hip).distanceTo(inFrame(l.knee));
    this.shin = inFrame(l.knee).distanceTo(inFrame(l.ankle));
    this.arm = inFrame(shoulder).distanceTo(inFrame(hand)); // (to her hand bone: the bone a hand's job places)
  }

  /**
   * Where she is reaching (world), or null: back up. Called once a frame before `apply`.
   * @param belly  her belly's egg (armClear.ts: her own frame), for where mid-belly is; `bellyPercent` 0-200
   */
  aimAt(target: THREE.Vector3 | null, belly: Egg | null, bellyPercent: number): void {
    if (!target) { this.wantDown = false; return; }
    this.wantDown = true;
    // the target in her own frame (height above her floor, how far in front of her hips)
    v.copy(target);
    this.root.worldToLocal(v);
    const y = v.y, ahead = Math.hypot(v.x, v.z);
    // decided once a target is given (and again only if it moves up or down a lot), so she does not flick between poses
    if (!Number.isNaN(this.lastTargetY) && Math.abs(y - this.lastTargetY) < 0.15 && this.weight > 0) return;
    this.lastTargetY = y;
    const midBelly = belly ? belly.cy : this.hipY + 0.12;
    const full = Math.min(1, bellyPercent / 150);
    let mode: Mode;
    if (y >= midBelly) mode = 'reach';
    else if (y >= this.kneeY) mode = 'low';
    else if (y >= LOWER.floorBelow) mode = 'squat';
    else mode = (['kneelLeft', 'kneelRight', 'kneelBoth'] as const)[Math.floor(Math.random() * 3)];
    this.wantMode = mode;

    // HOW FAR DOWN: her hips' height in this pose (for each, worked out from her own legs)
    let hipsAt: number;
    this.back = 0;
    if (mode === 'reach') hipsAt = this.hipY;
    else if (mode === 'low') hipsAt = this.hipY - Math.min(LOWER.lowDropMost, (midBelly - y) * LOWER.lowDropPerMetre);
    else if (mode === 'squat') {
      hipsAt = this.ankleY + (this.thigh + this.shin) * LOWER.squatLeg * 0.92;
      this.back = LOWER.squatBack;
    } else {
      const lean = (mode === 'kneelBoth' ? LOWER.kneelBothLean : LOWER.kneelThighLean) * DEG;
      hipsAt = LOWER.kneeAboveFloor + this.thigh * Math.cos(lean);
      this.back = this.thigh * Math.sin(lean) * 0.5;
    }
    this.drop = Math.max(0, this.hipY - hipsAt);

    // HOW FAR FORWARD: the least bend that brings her shoulder within `armReach` of the target (her hips staying
    // where this pose puts them: the bend swings her shoulder forward and down round them). Tried every 2 degrees up
    // to the most her belly allows; if even that is not enough, the bend that comes closest.
    const most = (mode === 'reach' || mode === 'low' ? LOWER.hingeMost : LOWER.hingeDownMost);
    const hingeMost = (most[0] + (most[1] - most[0]) * full) * DEG;
    const reachOf = this.arm * LOWER.armReach;
    const fromHipsAhead = ahead + this.back, fromHipsUp = y - hipsAt;
    let best = 0, bestGap = Infinity;
    for (let h = 0; h <= hingeMost + 1e-6; h += 2 * DEG) {
      const gap = Math.hypot(fromHipsAhead - this.trunk * Math.sin(h), fromHipsUp - this.trunk * Math.cos(h)) - reachOf;
      if (gap <= 0) { best = h; bestGap = gap; break; }
      if (gap < bestGap) { best = h; bestGap = gap; }
    }
    this.hinge = best;
    this.hingeMost = hingeMost;
    this.leanIn = 0;
  }

  /** Move the easing on, and lay the lowering over her pose as it is now (the bones' world matrices up to date). */
  /**
   * Her hips back where her pose had them (if nothing else has moved them since this did). Called at the START of
   * her frame, before anything reads her pose: her feet are put on the floor from it (footGround.ts), and lowered
   * hips left in place would read as her feet sunk into the floor, and she would be lifted out of it.
   */
  restore(): void {
    if (this.hips.position.equals(this.hipsWritten)) this.hips.position.copy(this.hipsBefore);
    this.hipsWritten.set(NaN, NaN, NaN);
  }

  /**
   * How far short her hands stayed last frame, metres (handReach.ts): she leans in further, a little each frame, until
   * they arrive.
   */
  stillShort(short: number, dt: number): void {
    if (this.weight < 1 || !this.wantDown) return;
    if (short > 0.004) this.leanIn = Math.min(this.trunk * this.hingeMost + LOWER.hipsForwardMost, this.leanIn + short * LOWER.leanInPerSecond * dt * 10);
  }

  apply(dt: number, bellyPercent: number): void {
    this.hipsBefore.copy(this.hips.position);
    // (a new pose is begun only from standing: if the pose wanted changes while she is down, she comes up first)
    const going = this.wantDown && (this.weight <= 0 || this.mode === this.wantMode);
    if (this.weight <= 0) this.mode = this.wantMode;
    this.along = Math.max(0, Math.min(1, this.along + (going ? 1 : -1) * dt / LOWER.seconds));
    const x = this.along, k = x * x * (3 - 2 * x);
    this.weight = k;
    const kneeling = this.mode.startsWith('kneel');
    this.passive = this.mode === 'squat' || kneeling ? k : 0;
    if (k <= 0) { if (!this.wantDown) this.lastTargetY = NaN; return; }

    // Her frame now: her left, her forward.
    this.root.getWorldQuaternion(rootQ);
    leftAxis.set(1, 0, 0).applyQuaternion(rootQ);
    forward.set(0, 0, 1).applyQuaternion(rootQ);

    // 0. where each foot is now (on the floor where her steps put it), and which way it is turned
    for (let i = 0; i < 2; i++) { this.legs[i].ankle.getWorldPosition(ankleAt[i]); this.legs[i].ankle.getWorldQuaternion(ankleQ[i]); }

    // (leaning in further: first more bend, as far as her belly allows; then her hips forward)
    const moreBend = Math.min(Math.max(0, this.hingeMost - this.hinge), this.leanIn / this.trunk);
    const hipsForward = Math.min(LOWER.hipsForwardMost, Math.max(0, this.leanIn - moreBend * this.trunk));

    // 1. her hips lowered, and moved back a little (or forward, leaning in)
    this.hips.getWorldPosition(v);
    v.y -= this.drop * k;
    v.addScaledVector(forward, (hipsForward - this.back) * k);
    if (this.hips.parent) { this.hips.parent.worldToLocal(v); this.hips.position.copy(v); this.hipsWritten.copy(v); }
    this.hips.updateMatrixWorld(true);

    // 2. bent forward: most at her hips, the rest shared up her back (a turn about her left axis tips her forward)
    const hinge = (this.hinge + moreBend) * k;
    turnInWorld(this.hips, turn.setFromAxisAngle(leftAxis, hinge * LOWER.hingeAtHips));
    const rest = hinge * (1 - LOWER.hingeAtHips) / Math.max(1, this.backBones.length);
    for (const b of this.backBones) turnInWorld(b, turn.setFromAxisAngle(leftAxis, rest));

    // 3. each leg solved again: its foot where it belongs, its knee the way the pose wants
    const spread = (LOWER.squatSpread + LOWER.squatSpreadPerBump * Math.min(2, bellyPercent / 100)) * DEG;
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i], side = (i === 0 ? 1 : -1) * this.leftSign; // (which way is OUT for this leg)
      const down = this.mode === 'kneelBoth' || (this.mode === 'kneelLeft' && i === 0) || (this.mode === 'kneelRight' && i === 1);
      const front = kneeling && !down;
      leg.hip.getWorldPosition(hipAt);
      leg.knee.getWorldPosition(kneeAt);
      // where the knee points now (off the line from hip to foot): kept at the start, so nothing jumps
      w.copy(ankleAt[i]).sub(hipAt).normalize();
      poleNow.copy(kneeAt).sub(hipAt);
      poleNow.addScaledVector(w, -poleNow.dot(w));
      if (poleNow.lengthSq() < 1e-8) poleNow.copy(forward);
      poleNow.normalize();
      // ...and where the pose wants it: forward, or forward and out round her belly in a squat
      poleWant.copy(forward);
      if (this.mode === 'squat') poleWant.multiplyScalar(Math.cos(spread)).addScaledVector(leftAxis, side * Math.sin(spread));
      if (down) poleWant.addScaledVector(up, -0.2);
      poleWant.normalize();
      const pole = poleNow.lerp(poleWant, k).normalize();
      // the foot: where it stands, or (kneeling) the shin flat on the floor behind the knee, or (the front foot) a step ahead
      footAt.copy(ankleAt[i]);
      if (down) {
        // the knee under her hip on the floor, the foot a shin's length behind it, on its toes
        w.copy(hipAt).addScaledVector(forward, -this.thigh * Math.sin(LOWER.kneelThighLean * DEG) * 0.3);
        w.y = this.root.position.y + LOWER.kneeAboveFloor;
        v.copy(w).addScaledVector(forward, -this.shin * 0.97);
        v.y = this.root.position.y + LOWER.kneeAboveFloor + 0.03;
        footAt.lerp(v, k);
      } else if (front) {
        footAt.addScaledVector(forward, LOWER.frontFootForward * k);
      }
      solveTwoBone(leg.hip, leg.knee, leg.ankle, footAt, pole, 1);
      // the foot turned as it was (flat on the floor), or, kneeling, its toes tipped down onto the floor
      leg.knee.getWorldQuaternion(turn);
      if (down) ankleQ[i].premultiply(rootQ.setFromAxisAngle(leftAxis, LOWER.kneelToesDown * DEG * k));
      leg.ankle.quaternion.copy(turn.invert()).multiply(ankleQ[i]);
      leg.ankle.updateMatrixWorld(true);
      this.root.getWorldQuaternion(rootQ); // (rootQ was borrowed for the toes' turn)
    }
  }
}
