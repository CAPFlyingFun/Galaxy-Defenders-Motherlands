// ============================================================================
// handReach.ts -- her hands reaching for things in the world (Joshua,
// 2026-11-17: "set up an action pickup/drop... knowing the size and direction,
// then the hand/s and fingers will grab it").
//
// A hand is given a JOB: a place for her hand to be, as a whole pose (where her
// hand bone stands AND which way it is turned). For a gun that is easy to know
// exactly: the pose her hand would have to be in to hold the gun as it lies.
// So when her hand arrives, the gun can pass from the table to her hand (or
// from her hand to the table) with nothing jumping.
//
// HOW AN ARM IS SOLVED (the rules of TRADDOMIUM's and the story's reach, the
// Character Builder's humanReach.ts and TMB-Story's arms.js):
//   * the hand bone is the target; the shoulder stays where her pose put it;
//   * the elbow is a HINGE that hangs DOWN and a little OUT (and a little
//     back), never up, so it cannot flip;
//   * an arm never straightens all the way (a locked arm looks like a
//     mannequin's): a target too far is reached as far as the arm goes, and
//     her body is asked to come closer (lowerBody.ts bends her toward it);
//   * her hand turns to the job's pose;
//   * her fingers open as her hand travels, and close round what she takes.
//
// BLENDS, never pops: each hand's weight goes from 0 (her own pose: aiming,
// walking) to 1 (on the job) over REACH.seconds, eased in and out, so a hand
// arrives and leaves gently and travels along an arc (its turns are blended,
// not its position: a blend of turns swings, it does not slide).
//
// ONE JOB AFTER ANOTHER glides too (Joshua, 2026-11-18: in the reload "something
// looks off... the elbows and wrists"): a hand already on a job that is given
// the next one (onto the clip, the clip pulled out, over to the tray) moves
// from where it is to the new place, eased, its turn swung round the short
// way: longer for a longer move, lifting in an arc on the way (REACH.glide...). Before, it jumped there in one frame (its elbow
// up to 18 cm, its hand turned up to 110 degrees).
//
// The joint guard (jointGuard.ts) and the keep-clear (armClear.ts) run after
// this, so a reach never bends a joint past its limit or goes into her belly.
// ============================================================================
import * as THREE from 'three';
import type { ArmBones } from '../aimArms';
import { solveTwoBone } from './twoBone';

/** GAME TUNING, plain numbers to tune by eye. */
export const REACH = Object.freeze({
  /** How long a hand takes to reach its job, or to go back to her own pose, seconds (the story's 0.55). */
  seconds: 0.55,
  /**
   * A HAND GLIDING FROM ONE JOB STRAIGHT ON TO THE NEXT (Joshua, 2026-11-18: "add more points for the animation... so
   * it will naturally look smoother"): it takes longer the further it goes and the more it turns (glideBase, plus so
   * much a metre, plus so much a radian, between the least and the most), and on its way it lifts in an arc (by
   * glideLiftPerMetre of the distance at the middle, at most glideLiftMost) instead of sliding straight. A fixed 0.35 s
   * whatever the move rushed the long ones (up to 2.6 m/s and 530 degrees a second at their fastest).
   */
  glideBase: 0.25,
  glidePerMetre: 1.2,
  glidePerRadian: 0.18,
  glideLeast: 0.3,
  glideMost: 0.9,
  glideLiftPerMetre: 0.25,
  glideLiftMost: 0.06,
  /** The most of her arm's full length she reaches with (a little short of straight). */
  most: 0.97,
  /** Where her elbow hangs: straight down, plus this much out to her side, plus this much back. */
  poleOut: 0.6,
  poleBack: 0.25,
  /** Her fingers: closed round a gun's grip, and an empty hand's rest (percent, the builder's FINGERS slider). */
  gripHolding: 55,
  gripEmpty: 18,
  /** How quickly her fingers close or open (seconds for about two thirds of the way). */
  gripSeconds: 0.12,
});

const target = new THREE.Vector3(), pole = new THREE.Vector3(), out = new THREE.Vector3(), back = new THREE.Vector3();
const rootQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), localQ = new THREE.Quaternion();
const targetQ = new THREE.Quaternion(), scratchScale = new THREE.Vector3();

/** One hand's job and how far on it is. */
class HandJob {
  /** The pose her hand bone has on its job NOW, in the world (on its way from the last job to this one). */
  readonly pose = new THREE.Matrix4();
  /** The pose the job asks for, and the one the hand set out from (the last job's, where it was when it was asked). */
  readonly goal = new THREE.Matrix4();
  readonly from = new THREE.Matrix4();
  has = false;
  /** 0 her own pose, 1 on the job: eased by `seconds`. */
  weight = 0;
  /** How far from the last job to this one, 0..1, eased (1 when it came from her own pose: the weight does that). */
  moved = 1;
  /** The time along the way, 0..1, before easing (the weight is this, smoothed at both ends). */
  private along = 0;
  private movedAlong = 1;
  /** This glide's length (seconds) and how high it lifts at its middle (metres). */
  private glideSeconds: number = REACH.glideLeast;
  private lift = 0;

  /** A new job: from her own pose (the weight eases it in), or from the job it is on now (it glides across). */
  set(goal: THREE.Matrix4): void {
    if (this.weight > 0) {
      this.from.copy(this.pose); this.movedAlong = 0; this.moved = 0;
      // (how far and how much it turns: the glide's length and its arc)
      this.from.decompose(fromAt, fromQ, scratchScale);
      goal.decompose(goalAt, goalQ, goalScale);
      const metres = fromAt.distanceTo(goalAt), radians = fromQ.angleTo(goalQ);
      this.glideSeconds = Math.min(REACH.glideMost, Math.max(REACH.glideLeast, REACH.glideBase + metres * REACH.glidePerMetre + radians * REACH.glidePerRadian));
      this.lift = Math.min(REACH.glideLiftMost, metres * REACH.glideLiftPerMetre);
    } else { this.pose.copy(goal); this.movedAlong = 1; this.moved = 1; }
    this.goal.copy(goal);
    this.has = true;
  }

  advance(dt: number): void {
    this.along = Math.max(0, Math.min(1, this.along + (this.has ? 1 : -1) * dt / REACH.seconds));
    this.weight = smooth(this.along); // (leaves gently, arrives gently)
    if (this.movedAlong < 1) {
      this.movedAlong = Math.min(1, this.movedAlong + dt / this.glideSeconds);
      this.moved = smooth(this.movedAlong);
      // (its place across, lifted in an arc that is highest half way; its turn swung round the short way)
      this.from.decompose(fromAt, fromQ, scratchScale);
      this.goal.decompose(goalAt, goalQ, goalScale);
      fromAt.lerp(goalAt, this.moved);
      fromAt.y += this.lift * 4 * this.moved * (1 - this.moved);
      fromQ.slerp(goalQ, this.moved);
      this.pose.compose(fromAt, fromQ, goalScale);
    } else if (this.has) this.pose.copy(this.goal);
  }
}

/** Smoothstep, 0..1. */
const smooth = (x: number): number => x * x * (3 - 2 * x);
const fromAt = new THREE.Vector3(), goalAt = new THREE.Vector3(), fromQ = new THREE.Quaternion(), goalQ = new THREE.Quaternion();
const goalScale = new THREE.Vector3();

export class HandReach {
  /** Each hand's job: [left, right]. */
  private readonly jobs = [new HandJob(), new HandJob()];
  /** How far each hand's fingers are closed, percent [left, right] (read by bodyMotion.ts as her grip). */
  readonly grip: [number, number] = [REACH.gripHolding, REACH.gripHolding];
  /** How far short of its job each hand stayed last time, metres (its arm would not go further): her body leans in. */
  readonly short: [number, number] = [0, 0];
  /** Whether each hand holds something (its fingers close round it) [left, right]. */
  readonly holding: [boolean, boolean] = [true, true];

  /**
   * @param root her root (which way she faces: her left-right axis, for which side is "out")
   * @param arms her two arms, left then right
   */
  constructor(private readonly root: THREE.Object3D, private readonly arms: readonly [ArmBones, ArmBones]) {}

  /** Give a hand a job: the pose its hand bone is to reach (world), or null to bring it back to her own pose. */
  setJob(hand: 0 | 1, pose: THREE.Matrix4 | null): void {
    const job = this.jobs[hand];
    if (pose) job.set(pose);
    else job.has = false;
  }

  /** Whether a hand has a job now (it may still be on its way). */
  hasJob(hand: 0 | 1): boolean { return this.jobs[hand].has; }

  /** How far a hand is laid over her own pose, 0..1 (1: wholly on its job). */
  weight(hand: 0 | 1): number { return this.jobs[hand].weight; }

  /** How far a hand is on its way to its job, 0..1 (1: arrived), counting a glide from one job to the next. */
  progress(hand: 0 | 1): number { const job = this.jobs[hand]; return Math.min(job.weight, job.has ? job.moved : 1); }

  /** Where a hand's job is (world), or null when it has none: for her body to bend toward. */
  jobPoint(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3 | null {
    const job = this.jobs[hand];
    return job.has || job.weight > 0 ? out.setFromMatrixPosition(job.pose) : null;
  }

  /** Move the easing on (once a frame, before `apply`), and each hand's fingers toward closed or open. */
  advance(dt: number): void {
    for (let i = 0; i < 2; i++) {
      this.jobs[i].advance(dt);
      const wanted = this.holding[i] ? REACH.gripHolding : REACH.gripEmpty;
      this.grip[i] += (wanted - this.grip[i]) * (1 - Math.exp(-Math.max(0, dt) / REACH.gripSeconds));
      if (Math.abs(this.grip[i] - wanted) < 0.05) this.grip[i] = wanted;
    }
  }

  /** Lay each hand's job over her pose as it is now (the bones' world matrices must be up to date). */
  apply(): void {
    for (let i = 0; i < 2; i++) {
      const job = this.jobs[i];
      this.short[i] = 0;
      if (job.weight <= 0) continue;
      this.short[i] = this.solveArm(this.arms[i], job.pose, job.weight);
    }
  }

  /** One arm onto a hand pose, by `weight` (0 untouched, 1 exactly there). */
  private solveArm(arm: ArmBones, pose: THREE.Matrix4, weight: number): number {
    pose.decompose(target, targetQ, scratchScale);
    // THE ELBOW: down, out to her side and a little back (her left-right axis is her root's x, her back its -z)
    this.root.getWorldQuaternion(rootQ);
    pole.set(0, -1, 0)
      .addScaledVector(out.set(arm.side, 0, 0).applyQuaternion(rootQ), REACH.poleOut)
      .addScaledVector(back.set(0, 0, -1).applyQuaternion(rootQ), REACH.poleBack);
    // upper arm and forearm so her hand bone lands on the job (as far as her arm goes)
    const short = solveTwoBone(arm.upper, arm.fore, arm.hand, target, pole, weight, REACH.most);
    // THE HAND turned to the job's pose (in its parent's frame), blended by `weight`
    arm.fore.getWorldQuaternion(parentQ);
    localQ.copy(parentQ.invert()).multiply(targetQ);
    arm.hand.quaternion.slerp(localQ, weight);
    arm.hand.updateMatrixWorld(true);
    return short;
  }
}
