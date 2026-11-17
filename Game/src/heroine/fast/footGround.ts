// ============================================================================
// footGround.ts -- THE FAST HEROINE'S FEET ON THE FLOOR.
//
// The builder's pose (bodyMotion.ts) swings her legs from hips that never move
// up, down or sideways. Left like that, a leg stepping out in front of her has
// its foot in the air, and nothing holds a foot to the spot it was put down on.
// This file stands her on her feet (Joshua, 2026-11-17: "she is skating as her
// feet aren't actually driving her along the ground like it should be"):
//
//   1. THE FOOT THAT CARRIES HER IS THE ONE ON THE FLOOR. Her measured stride
//      (bodyMotion.ts `StrideTable`) says which foot is PLANTED at each moment of
//      a stride. She is lowered until that foot stands on the floor. Before, she
//      was lowered onto whichever ankle was lowest, and in a run that was often
//      the foot that had just pushed off: it stayed on the ground while it was
//      already swinging forward, which is a foot sliding.
//   2. HER LOOK'S BOB, AND A RUN'S BOUNCE. Walking, her legs' own rise and fall
//      shows by her look's Bob (the builder's WALK Bob: all of it at 200 %).
//      Running, her hips ride lower and bounce a little, lowest as each foot
//      carries her and highest between steps, and her standing knee bends to
//      take it up, as a runner's does.
//   3. A PLANTED FOOT STAYS WHERE IT WAS PUT DOWN. The spot on the ground where a
//      foot lands is remembered, and while that foot is planted its leg reaches
//      back to that spot each frame (hip, knee, ankle: a "two-bone reach"). Her
//      stride is already turned by the distance she really covers, so the reach
//      is a centimetre or two; it takes up what is left (her hips rolling and
//      turning with each step, a start, a stop, a turn). A foot can only be held
//      `lockMost` from where her pose has it: past that it slips, as a foot does.
//   4. NO FOOT GOES THROUGH THE FLOOR: A KNEE BENDS INSTEAD, by the same reach.
//      A swinging foot is kept just clear of the floor, so it is seen to leave
//      the ground when it stops carrying her.
//   5. HER WEIGHT SHIFTS OVER THE FOOT SHE STANDS ON (the builder's WALK Sway):
//      she is moved sideways by it, and her planted foot stays put under her.
//   6. A STEP ON THE SPOT. Standing, a foot left more than `stepOffset` from
//      where her pose stands it (her legs turned under her, or she has just
//      stopped) is picked up and set down where it belongs, one foot at a time:
//      she steps round as she turns (Joshua, 2026-11-17: "the feet move around
//      in the turn").
//
// The builder has a fuller version of 3 and 4 for its own room (actor/
// humanFeet.ts: heels that rise, feet that follow slopes). This is a small one
// for flat ground, in the game's own space, that also handles running.
//
// Nothing here allocates while the game runs.
// ============================================================================
import * as THREE from 'three';
import { STRIDE_SAMPLES, type BodyMotion } from './bodyMotion';

/** GAME TUNING for her feet on the floor. Lengths in metres, times in seconds, unless they say otherwise. */
export const FOOT_GROUND = {
  /** RUNNING: how far below standing her hips ride, as a share of her leg (hip to ankle). Her knees bend to take it up. */
  runDrop: 0.07,
  /** RUNNING: her bounce from lowest to highest when all of her Bob shows (her look's Bob and her speed scale it). */
  runBob: 0.025,
  /** A swinging foot is kept at least this far off the floor through the middle of its swing... */
  clear: 0.015,
  /** ...easing in over this share of the swing after it leaves the ground, and out the same before it lands. */
  clearEase: 0.1,
  /** A planted foot is held to its spot up to this far from where her pose has it; past that it slips. */
  lockMost: 0.07,
  /** A foot that has stopped being planted eases back to where her pose has it over about this long. */
  release: 0.05,
  /** A correction smaller than this is not worth bending a knee for. */
  least: 0.0005,
  /** A straight leg is given this much forward, as a share of the thigh, so its knee knows which way to bend. */
  kneeForward: 0.05,
  /**
   * A STEP ON THE SPOT. Standing, a foot held more than `stepOffset` from where her pose stands it is picked up
   * `stepHeight` and set down where it belongs over `stepSeconds`, one foot at a time. Once she has been still for
   * `stepSettle`, a foot left more than `settleOffset` out is tidied the same way, so she ends standing square.
   */
  stepOffset: 0.04,
  stepHeight: 0.035,
  stepSeconds: 0.28,
  stepSettle: 0.3,
  settleOffset: 0.012,
} as const;

/** One leg's bones: the hip joint (it turns her thigh), the knee (it turns her shin) and the ankle (her foot). */
export interface LegBones { readonly hip: THREE.Bone; readonly knee: THREE.Bone; readonly ankle: THREE.Bone }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 0 below `from`, 1 above `to`, an S-shaped ease between. */
const ease = (from: number, to: number, v: number) => { const t = clamp((v - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };
const fract = (v: number) => v - Math.floor(v);

// Scratch objects, made once.
const hipAt = new THREE.Vector3(), kneeAt = new THREE.Vector3(), ankleAt = new THREE.Vector3(), goal = new THREE.Vector3();
const line = new THREE.Vector3(), bend = new THREE.Vector3(), ahead = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
const parentQ = new THREE.Quaternion(), turn = new THREE.Quaternion(), footQ = new THREE.Quaternion();

/**
 * Turn a bone by a rotation given in WORLD space, then bring the world matrices of the bone and everything hanging
 * from it up to date (so the next bone down the leg starts from where this one now is).
 */
function turnInWorld(bone: THREE.Bone, worldTurn: THREE.Quaternion): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(parentQ);
  // local' = parent⁻¹ · turn · parent · local   (the same turn, seen from inside the parent's frame)
  bone.quaternion.premultiply(parentQ).premultiply(worldTurn).premultiply(parentQ.invert());
  bone.updateMatrixWorld(true);
}

/** One foot's memory between frames. */
interface Foot {
  /** It is planted and held to a spot on the ground: that spot (world x and z of its ankle). */
  locked: boolean;
  lockX: number;
  lockZ: number;
  /** How far its ankle is moved from where her pose has it, over the ground (world x and z). */
  offX: number;
  offZ: number;
}

export class FootGround {
  /** How far she is lowered now, metres (0 standing). For a readout. */
  drop = 0;
  /** How far each foot was lifted by bending its knee this frame, metres (left, right). For a readout and the tests. */
  readonly raised: [number, number] = [0, 0];
  /** Whether each foot is planted this frame (left, right). */
  readonly planted: [boolean, boolean] = [true, true];
  /** How far each foot is held from where her pose has it this frame, metres over the ground (left, right). */
  readonly held: [number, number] = [0, 0];
  /** Which foot is taking a step on the spot (-1: neither), and how far through it (0..1). */
  stepFoot = -1;
  private stepClock = 0;
  /** Seconds since she last moved or turned. */
  private stillFor = 0;

  private readonly legs: readonly [LegBones, LegBones];
  private readonly feet: readonly [Foot, Foot] = [
    { locked: false, lockX: 0, lockZ: 0, offX: 0, offZ: 0 },
    { locked: false, lockX: 0, lockZ: 0, offX: 0, offZ: 0 },
  ];
  /** Where her fit sits when she stands, and how high each ankle is over the floor then (in her root's frame). */
  private readonly fitFloorY: number;
  private readonly standY: [number, number] = [0, 0];
  // scratch
  private readonly lift: [number, number] = [0, 0];
  private readonly swing: [number, number] = [-1, -1];

  /**
   * @param root   the heroine's root: the game moves and turns it; the floor is its y
   * @param fit    the group inside it that holds her at her size, soles on the floor: this file moves it down and sideways
   * @param left   her left leg's bones, and `right` her right's
   * @param leg    her leg's length, hip to ankle, metres
   * She must be standing (the builder's stand pose on her bones) when this is made: her ankles are measured as they are.
   */
  constructor(private readonly root: THREE.Object3D, private readonly fit: THREE.Object3D, left: LegBones, right: LegBones, private readonly leg: number) {
    this.legs = [left, right];
    this.fitFloorY = fit.position.y;
    root.updateMatrixWorld(true);
    for (let side = 0; side < 2; side++) this.standY[side] = this.legs[side].ankle.matrixWorld.elements[13] - root.position.y;
  }

  /** Let go of both feet (she has been put somewhere else: the spots her feet were held to mean nothing there). */
  letGo(): void {
    for (const foot of this.feet) { foot.locked = false; foot.offX = 0; foot.offZ = 0; }
    this.held[0] = 0;
    this.held[1] = 0;
    this.stepFoot = -1;
  }

  /**
   * One frame, after her pose is on her bones.
   * @param dt        seconds since the last frame
   * @param motion    her pose's state this frame: where she is in her stride, how much she walks or runs, her sway
   * @param share     how much of her legs' rise and fall shows, 0..1 (her look's Bob, eased off with her speed)
   * @param moving    she moved or turned this frame (a step on the spot waits for her to be still before it tidies her feet)
   */
  update(dt: number, motion: BodyMotion, share: number, moving: boolean): void {
    const { root, fit, legs, feet, lift, swing } = this;
    const tuning = FOOT_GROUND, strides = motion.strides, walk = motion.walkBlend, run = motion.runBlend;
    this.stillFor = moving ? 0 : this.stillFor + dt;

    // Her bones as her pose has them, with her hips where they are when she stands (not yet lowered or shifted).
    fit.position.x = 0;
    fit.position.y = this.fitFloorY;
    root.updateMatrixWorld(true);
    for (let side = 0; side < 2; side++) lift[side] = legs[side].ankle.matrixWorld.elements[13] - root.position.y - this.standY[side];

    // ---- which feet are planted, and how far through its swing each of the others is (0 leaving .. 1 landing) ----
    swing[0] = -1;
    swing[1] = -1;
    let drop = 0;
    if (walk > 0 && strides) {
      this.stepFoot = -1;                                          // (walking has steps of its own)
      const table = run >= 0.5 ? strides.run : strides.walk;
      const k = Math.min(STRIDE_SAMPLES - 1, Math.floor(motion.phase * STRIDE_SAMPLES));
      for (let side = 0; side < 2; side++) {
        this.planted[side] = table.planted[side][k] === 1;
        if (this.planted[side]) continue;
        const length = fract(table.landsAt[side] - table.leavesAt[side]) || 1;
        swing[side] = clamp(fract(motion.phase - table.leavesAt[side]) / length, 0, 1);
      }

      // ---- how far she comes down ----
      // WALKING: onto the planted foot that is lower (both feet down between steps: the one behind, until the one in
      // front has come down to it). Her look's Bob shows that share of the rise and fall; the rest she stays down for.
      const need = Math.min(this.planted[0] ? lift[0] : Infinity, this.planted[1] ? lift[1] : Infinity);
      const most = strides.walk.needMost * walk;
      const walking = Number.isFinite(need) ? need + (1 - share) * Math.max(0, most - need) : most;
      if (run <= 0) drop = walking;
      else {
        // RUNNING: her hips ride lower, and bounce: highest between steps, lowest as each foot carries her.
        const flight = strides.run.flightAt ?? 0.7;
        const running = (tuning.runDrop * this.leg - 0.5 * tuning.runBob * share * Math.cos(4 * Math.PI * (motion.phase - flight))) * walk;
        drop = walking + (running - walking) * run;
      }
    } else {
      // STANDING: both feet planted, but for a step on the spot, which is one foot picked up and set down.
      if (this.stepFoot >= 0) {
        this.stepClock += dt / tuning.stepSeconds;
        if (this.stepClock >= 1) this.stepFoot = -1;
      }
      if (this.stepFoot < 0) {
        // the foot held furthest from where her pose stands it goes first
        const far = this.held[0] >= this.held[1] ? 0 : 1;
        const limit = this.stillFor >= tuning.stepSettle ? tuning.settleOffset : tuning.stepOffset;
        if (this.held[far] > limit) { this.stepFoot = far; this.stepClock = 0; }
      }
      this.planted[0] = this.stepFoot !== 0;
      this.planted[1] = this.stepFoot !== 1;
    }
    this.drop = drop;

    // ---- each foot: held to its spot and on the floor if it is planted, clear of the floor if it swings ----
    const yaw = root.rotation.y, aheadX = Math.sin(yaw), aheadZ = Math.cos(yaw);
    // (she is about to be moved sideways by her sway: toward her left, which is across her forward)
    const shiftX = motion.sway * aheadZ, shiftZ = -motion.sway * aheadX;
    const fade = Math.exp(-dt / tuning.release);
    for (let side = 0; side < 2; side++) {
      const foot = feet[side], leg = legs[side];
      // where her pose (and her sway) puts this ankle over the ground
      const poseX = leg.ankle.matrixWorld.elements[12] + shiftX, poseZ = leg.ankle.matrixWorld.elements[14] + shiftZ;
      if (this.planted[side]) {
        // PLANTED: held to the spot it was put down on (taken as it lands, from where it is this frame)
        if (!foot.locked) { foot.locked = true; foot.lockX = poseX + foot.offX; foot.lockZ = poseZ + foot.offZ; }
        foot.offX = foot.lockX - poseX;
        foot.offZ = foot.lockZ - poseZ;
        const far = Math.hypot(foot.offX, foot.offZ);
        if (far > tuning.lockMost) {
          // (further than a foot can be held: it slips, and its spot goes with it)
          const keep = tuning.lockMost / far;
          foot.offX *= keep; foot.offZ *= keep;
          foot.lockX = poseX + foot.offX; foot.lockZ = poseZ + foot.offZ;
        }
      } else {
        // SWINGING: let go, easing back to where her pose has it
        foot.locked = false;
        foot.offX *= fade; foot.offZ *= fade;
      }
      this.held[side] = Math.hypot(foot.offX, foot.offZ);

      const above = lift[side] - drop;                             // where her pose leaves this foot: over the floor (+) or under it (-)
      let want = Math.max(above, 0);                               // (a planted foot above the floor cannot be reached down: a leg cannot grow)
      if (swing[side] >= 0) want = Math.max(want, tuning.clear * walk * ease(0, tuning.clearEase, swing[side]) * ease(0, tuning.clearEase, 1 - swing[side]));
      if (this.stepFoot === side) want = Math.max(want, tuning.stepHeight * Math.sin(Math.PI * this.stepClock));
      const raise = want - above;
      this.raised[side] = raise > tuning.least ? raise : 0;
      if (raise > tuning.least || this.held[side] > tuning.least) this.reach(leg, foot.offX, Math.max(0, raise), foot.offZ, aheadX, aheadZ);
    }

    // ---- and she is set down: lowered, and moved over the foot she stands on ----
    fit.position.y = this.fitFloorY - drop;
    fit.position.x = motion.sway;
  }

  /**
   * Bend one leg so its ankle is moved by (x, y, z) metres from where her pose has it (world axes). The hip stays
   * where it is; the knee goes forward (a knee bends one way); the foot stays as level as it was. A place her leg is
   * too short to reach is reached toward, as far as her leg goes.
   */
  private reach(leg: LegBones, x: number, y: number, z: number, aheadX: number, aheadZ: number): void {
    hipAt.setFromMatrixPosition(leg.hip.matrixWorld);
    kneeAt.setFromMatrixPosition(leg.knee.matrixWorld);
    ankleAt.setFromMatrixPosition(leg.ankle.matrixWorld);
    leg.ankle.getWorldQuaternion(footQ);
    const thigh = hipAt.distanceTo(kneeAt), shin = kneeAt.distanceTo(ankleAt);
    goal.set(ankleAt.x + x, ankleAt.y + y, ankleAt.z + z);
    // the line from her hip to where her ankle is to be, and how long it is (never longer than her leg, never folded flat)
    line.copy(goal).sub(hipAt);
    const far = clamp(line.length(), Math.abs(thigh - shin) + 1e-4, (thigh + shin) * 0.9995);
    line.normalize();
    // Which way her knee goes: where it is now, off that line, with a little of her forward added (so a straight
    // leg bends forward) and any backward part taken out first (a knee does not bend backward).
    ahead.set(aheadX, 0, aheadZ).addScaledVector(line, -(aheadX * line.x + aheadZ * line.z));
    if (ahead.lengthSq() < 1e-8) ahead.set(aheadX, 0, aheadZ);
    ahead.normalize();
    bend.copy(kneeAt).sub(hipAt);
    bend.addScaledVector(line, -bend.dot(line));
    const backward = bend.dot(ahead);
    if (backward < 0) bend.addScaledVector(ahead, -backward);
    bend.addScaledVector(ahead, thigh * FOOT_GROUND.kneeForward).normalize();
    // the triangle hip, knee, ankle with its three sides known: the angle at the hip between the line and the thigh
    const cos = clamp((thigh * thigh + far * far - shin * shin) / (2 * thigh * far), -1, 1), sin = Math.sqrt(1 - cos * cos);
    // her thigh: from where it points now to where the new knee is
    from.copy(kneeAt).sub(hipAt).normalize();
    to.copy(line).multiplyScalar(cos).addScaledVector(bend, sin).normalize();
    turnInWorld(leg.hip, turn.setFromUnitVectors(from, to));
    // her shin: from where the thigh's turn has carried it to pointing at where the ankle is to be
    kneeAt.setFromMatrixPosition(leg.knee.matrixWorld);
    ankleAt.setFromMatrixPosition(leg.ankle.matrixWorld);
    from.copy(ankleAt).sub(kneeAt).normalize();
    to.copy(hipAt).addScaledVector(line, far).sub(kneeAt).normalize();
    turnInWorld(leg.knee, turn.setFromUnitVectors(from, to));
    // her foot: turned back to how it lay before her leg was bent
    leg.knee.getWorldQuaternion(parentQ);
    leg.ankle.quaternion.copy(parentQ.invert()).multiply(footQ);
  }
}
