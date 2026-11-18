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
  /** ...and a hand on its way to take something: open wide, ready to close round it. */
  gripOpen: 3,
  /** How quickly her fingers close or open (seconds for about two thirds of the way). */
  gripSeconds: 0.12,
});

const target = new THREE.Vector3(), pole = new THREE.Vector3(), out = new THREE.Vector3(), back = new THREE.Vector3();
const rootQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), localQ = new THREE.Quaternion();
const targetQ = new THREE.Quaternion(), scratchScale = new THREE.Vector3();
const startAt = new THREE.Vector3(), startQ = new THREE.Quaternion(), startScale = new THREE.Vector3(), startPose = new THREE.Matrix4();
/** (a separate quaternion for each limited turn: blending one into itself returned the relaxed hand, a 50-degree jump) */
const capQ = new THREE.Quaternion();
const ownQ = new THREE.Quaternion(), heldQ = new THREE.Quaternion(), worldHeldQ = new THREE.Quaternion();
const upperWas = new THREE.Quaternion(), foreWas = new THREE.Quaternion();
const pivotAsked = new THREE.Vector3(), pivotHeld = new THREE.Vector3(), zero = new THREE.Vector3();
const tipsAt = new THREE.Vector3(), tipsWant = new THREE.Vector3(), tipTurn = new THREE.Quaternion(), foreQ = new THREE.Quaternion();

/** A hand job's wrist limit: the most it may turn from her own pose (radians), and the point in the hand kept in place. */
export interface WristLimit {
  readonly most: number;
  readonly pivot: THREE.Vector3;
  /** Which way her fingers run (the hand's own space), and how far above level they may point (a sine: 0 level). */
  readonly along?: THREE.Vector3;
  readonly tipsUpMost?: number;
}

/** One hand's job and how far on it is. */
class HandJob {
  /** The pose her hand bone has on its job NOW, in the world (on its way from the last job to this one). */
  readonly pose = new THREE.Matrix4();
  /** The pose the job asks for, and the one the hand set out from (the last job's, where it was when it was asked). */
  readonly goal = new THREE.Matrix4();
  readonly from = new THREE.Matrix4();
  has = false;
  /**
   * THE MOST HER WRIST MAY TURN for this job, radians from how her own pose holds the hand (Infinity: as the pose
   * asks), and the point in the hand (its own space) kept where the pose puts it when the wrist is held back: the
   * middle of her palm, so it still lands on what she takes.
   */
  wristMost = Infinity;
  /** Her own pose's hand (in its forearm's frame) when this job was last laid over it: the wrist limit's start. */
  readonly own = new THREE.Quaternion();
  /**
   * How far her wrist was turned when this job began (radians): the limit starts there and closes to `wristMost` as
   * the hand glides on, instead of pulling the wrist in at once (a gun coming off its stand turned 57 degrees in a frame).
   */
  wristAtStart = 0;
  /** Where the arm was last aimed for this job (after the wrist limit moved it): a next job glides from here. */
  readonly lastTarget = new THREE.Vector3();
  hasTarget = false;
  /** The wrist limit now: from where it started to `wristMost`, as far as the hand has glided. */
  get wristNow(): number { return this.wristAtStart > this.wristMost ? this.wristAtStart + (this.wristMost - this.wristAtStart) * this.moved : this.wristMost; }
  readonly pivot = new THREE.Vector3();
  /** Which way her fingers run in the hand's own space, and how far above level they may point (1: no limit). */
  readonly fingersAlong = new THREE.Vector3(1, 0, 0);
  tipsUpMost = 1;
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

  /**
   * A new job: from her own pose (the weight eases it in), or from the job it is on now (it glides across, from where
   * the hand REALLY is: `actual`, its world matrix; a wrist held back may have kept it off the last job's pose, and
   * gliding from that pose instead jumped the hand there first).
   */
  set(goal: THREE.Matrix4, actual?: THREE.Matrix4): void {
    if (this.weight > 0) {
      this.from.copy(actual ?? this.pose); this.movedAlong = 0; this.moved = 0;
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
  /** Whether each hand is on its way to take something (its fingers open wide) [left, right]. */
  readonly opening: [boolean, boolean] = [false, false];

  /**
   * @param root her root (which way she faces: her left-right axis, for which side is "out")
   * @param arms her two arms, left then right
   */
  constructor(private readonly root: THREE.Object3D, private readonly arms: readonly [ArmBones, ArmBones]) {}

  /**
   * Give a hand a job: the pose its hand bone is to reach (world), or null to bring it back to her own pose.
   * `wristMost` (radians) holds her wrist within that much of her own pose's, keeping `pivot` (a point in the hand) on
   * its place (see `WristLimit`).
   */
  setJob(hand: 0 | 1, pose: THREE.Matrix4 | null, limit?: WristLimit): void {
    const job = this.jobs[hand];
    if (pose) {
      // (a next job glides from where the arm was AIMED, turned as the hand really is: where the hand really is would
      //  count twice what moved it off its aim, keeping it clear of her body, and jumped it up to 12 cm)
      const hand_ = this.arms[hand].hand;
      hand_.updateWorldMatrix(true, false);
      hand_.matrixWorld.decompose(startAt, startQ, startScale);
      if (job.hasTarget) startAt.copy(job.lastTarget);
      job.set(pose, startPose.compose(startAt, startQ, startScale));
      job.wristMost = limit?.most ?? Infinity;
      job.wristAtStart = job.weight > 0 ? job.own.angleTo(hand_.quaternion) : 0;
      job.pivot.copy(limit?.pivot ?? zero);
      job.tipsUpMost = limit?.tipsUpMost ?? 1;
      if (limit?.along) job.fingersAlong.copy(limit.along);
    } else job.has = false;
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
      const wanted = this.opening[i] ? REACH.gripOpen : this.holding[i] ? REACH.gripHolding : REACH.gripEmpty;
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
      this.short[i] = this.solveArm(this.arms[i], job.pose, job.weight, job);
    }
  }

  /**
   * HER WRISTS HELD WITHIN THEIR LIMITS ONCE MORE, as the very last thing that turns her (after her arms are kept clear
   * of her belly and her joints within their ranges: those may turn a hand again).
   */
  holdWrists(): void {
    for (let i = 0; i < 2; i++) {
      const job = this.jobs[i];
      if (job.weight <= 0 || !Number.isFinite(job.wristMost)) continue;
      const hand = this.arms[i].hand;
      const most = job.wristNow + (Math.PI - job.wristNow) * (1 - job.weight); // (eased in with the job)
      const angle = job.own.angleTo(hand.quaternion);
      if (angle > most) { hand.quaternion.copy(capQ.copy(job.own).slerp(hand.quaternion, most / angle)); hand.updateMatrixWorld(true); }
    }
  }

  /** For the tests: each hand's wrist this frame (degrees): as its job asked, the limit now, as laid. */
  readonly wristInfo = [{ asked: 0, limit: 0, laid: 0, start: 0, weight: 0, raw: 0, moved: 0, limited: false }, { asked: 0, limit: 0, laid: 0, start: 0, weight: 0, raw: 0, moved: 0, limited: false }];

  /** One arm onto a hand pose, by `weight` (0 untouched, 1 exactly there). */
  private solveArm(arm: ArmBones, pose: THREE.Matrix4, weight: number, job: HandJob): number {
    pose.decompose(target, targetQ, scratchScale);
    // THE ELBOW: down, out to her side and a little back (her left-right axis is her root's x, her back its -z)
    this.root.getWorldQuaternion(rootQ);
    pole.set(0, -1, 0)
      .addScaledVector(out.set(arm.side, 0, 0).applyQuaternion(rootQ), REACH.poleOut)
      .addScaledVector(back.set(0, 0, -1).applyQuaternion(rootQ), REACH.poleBack);
    // HER WRIST HELD WITHIN ITS LIMIT (Joshua, 2026-11-18: "her wrists should turn less than +/-50 degrees through the
    // whole reloading"): her own pose's hand is the start; a job that asks for more turn than `wristMost` gets that
    // much and no more. The hand bone is then moved so the middle of her palm (the pivot) is still where the job
    // put it: her arm is solved once to see where her forearm will be, then again for real.
    // (her own pose's hand this frame, before the job: the wrist limit is measured from it)
    ownQ.copy(arm.hand.quaternion);
    job.own.copy(ownQ);
    let limited = false;
    if (Number.isFinite(job.wristMost)) {
      upperWas.copy(arm.upper.quaternion); foreWas.copy(arm.fore.quaternion);
      solveTwoBone(arm.upper, arm.fore, arm.hand, target, pole, 1, REACH.most);
      arm.fore.getWorldQuaternion(parentQ);
      localQ.copy(parentQ).invert().multiply(targetQ);
      const angle = ownQ.angleTo(localQ);
      if (angle > job.wristNow) {
        limited = true;
        heldQ.copy(ownQ).slerp(localQ, job.wristNow / angle);
        // (where the pivot would be with the hand as asked, and with it held back: the target moves by the difference)
        worldHeldQ.copy(parentQ).multiply(heldQ);
        pivotAsked.copy(job.pivot).multiply(scratchScale).applyQuaternion(targetQ);
        pivotHeld.copy(job.pivot).multiply(scratchScale).applyQuaternion(worldHeldQ);
        target.add(pivotAsked).sub(pivotHeld);
      }
      arm.upper.quaternion.copy(upperWas); arm.fore.quaternion.copy(foreWas);
      arm.upper.updateMatrixWorld(true);
    }
    // upper arm and forearm so her hand bone lands on the job (as far as her arm goes)
    job.lastTarget.copy(target); job.hasTarget = true;
    const short = solveTwoBone(arm.upper, arm.fore, arm.hand, target, pole, weight, REACH.most);
    // THE HAND turned to the job's pose (in its parent's frame), blended by `weight`
    arm.fore.getWorldQuaternion(parentQ);
    localQ.copy(parentQ.invert()).multiply(targetQ);
    { const i = this.wristInfo[arm === this.arms[0] ? 0 : 1] as Record<string, unknown>; i.raw = ownQ.angleTo(localQ) * 57.3; i.moved = job.moved; i.limited = limited;
      i.target = target.toArray().map((v) => +v.toFixed(3)); i.from = new THREE.Vector3().setFromMatrixPosition(job.from).toArray().map((v) => +v.toFixed(3)); i.pose = new THREE.Vector3().setFromMatrixPosition(job.pose).toArray().map((v) => +v.toFixed(3)); }
    if (limited || Number.isFinite(job.wristMost)) {
      const angle = ownQ.angleTo(localQ);
      if (angle > job.wristNow) localQ.copy(capQ.copy(ownQ).slerp(localQ, job.wristNow / angle));
    }
    // HER FINGERTIPS NEVER TO THE SKY (Joshua, 2026-11-18: "finger tips either facing towards each other or the
    // ground... never up"): if this turn would point them higher than tipsUpMost, the hand is tipped down by just
    // enough (about its wrist), then held within its wrist limit again.
    if (job.tipsUpMost < 1) {
      // (parentQ holds the forearm's turn UNDONE, from above: undone again it is the forearm's turn, without changing it)
      foreQ.copy(parentQ).invert();
      worldHeldQ.copy(foreQ).multiply(localQ); // the hand's turn in the world
      tipsAt.copy(job.fingersAlong).applyQuaternion(worldHeldQ);
      if (tipsAt.y > job.tipsUpMost) {
        tipsWant.set(tipsAt.x, 0, tipsAt.z);
        const flat = tipsWant.length();
        if (flat > 1e-4) tipsWant.multiplyScalar(Math.sqrt(1 - job.tipsUpMost * job.tipsUpMost) / flat).setY(job.tipsUpMost);
        else tipsWant.set(1, 0, 0);
        tipTurn.setFromUnitVectors(tipsAt, tipsWant.normalize());
        worldHeldQ.premultiply(tipTurn);
        localQ.copy(parentQ).multiply(worldHeldQ); // (parentQ is the forearm's turn undone)
        const angle = ownQ.angleTo(localQ);
        if (angle > job.wristNow) localQ.copy(capQ.copy(ownQ).slerp(localQ, job.wristNow / angle));
      }
    }
    const info = this.wristInfo[arm === this.arms[0] ? 0 : 1];
    info.asked = ownQ.angleTo(localQ) * 57.3; info.limit = job.wristNow * 57.3; info.start = job.wristAtStart * 57.3; info.weight = weight;
    arm.hand.quaternion.slerp(localQ, weight);
    info.laid = ownQ.angleTo(arm.hand.quaternion) * 57.3;
    arm.hand.updateMatrixWorld(true);
    return short;
  }
}
