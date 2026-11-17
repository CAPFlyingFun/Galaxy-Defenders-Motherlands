// ============================================================================
// bodyMotion.ts -- how the fast heroine MOVES: standing, breathing, walking,
// the weight of her belly and bust, her fingers round the grips.
//
// Every rule in here is the Character Builder's own, used straight from Char_B
// (never copied): `poseHuman` (how a body stands, breathes and steps),
// `weighWalk` / `walkWeight` (her weight shifting over each foot),
// `HumanRig` (turning the pose into bone rotations), the belly's and bust's
// springs and the walk's bounce (`sarahLabTool.ts`), and how far each finger
// joint may bend (`fingerBend`).
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts, the per-person part of
// `tick` and the `live` part of `makePerson`): the ORDER those rules are called
// in each frame, the stride worked out from how far she has walked, and writing
// the four motion weights into her skin. Changed for the game:
//   * one heroine, not a crowd, so nothing here is per-person bookkeeping;
//   * a short BLEND between standing and walking (the DEV Room's people only
//     ever walked; the game starts and stops her all the time);
//   * her fingers are curled round her guns' grips. Finding her fingers in the
//     skeleton is ported from the builder's room (SarahLabScene.ts
//     `findFingers`, which that file does not export).
//
// Nothing here allocates while the game runs, with one small exception noted
// at `walkWeight` below (the builder's function returns a new three-number
// object each call).
// ============================================================================
import * as THREE from 'three';
import { HumanRig } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
import { humanStride, poseHuman } from '@charb/actor/humanPose';
import { walkWeight, weighWalk } from '@charb/actor/walkWeight';
import type { BindJoint, HumanGait, HumanMeasure, JointTurn, MutableJointTurn } from '@charb/actor/humanRig';
import {
  BELLY_MOTION, BELLY_SWING, THUMB_TO_PALM, breastBobWeight, fingerBend, restingBellySpring, sizeTiltDeg,
  stepBellySpring, stepBreastSpring, walkBounceAccel, walkSwayAccel, type BellySpring,
} from '@charb/sarahlab/sarahLabTool';

/** The pace of the builder's walk, metres a second: her legs step at this pace however fast the game moves her. */
const WALK_PACE = 1.1;
/** Standing eases into walking (and back) over about this long, seconds. */
const WALK_BLEND_SECONDS = 0.16;
/**
 * How much the belly pitches for each centimetre it drops (it swings, it does not slide). The builder's own number
 * (`BOUNCE_TILT` in sarahLabTool.ts, which that file keeps to itself): a quarter of 0.1 rad, in tilt-shape weights.
 */
const BOUNCE_TILT = 0.25 * (0.1 / BELLY_MOTION.tiltRad);

/** One finger: its joints from the knuckle out, and the axis it curls about (in the skeleton's bind space). */
interface Finger { readonly joints: readonly number[]; readonly axis: THREE.Vector3; readonly thumb: boolean }

/**
 * Each hand's fingers, from the bind pose (ported from the builder's `findFingers`): under each wrist, the first
 * joint that branches four ways or more is the hand, and each branch is a finger. The thumb is the branch whose base
 * is furthest from the others. A finger curls about the axis across its own length and the palm's facing; the thumb
 * folds across the palm toward the little finger.
 */
function findFingers(bind: readonly BindJoint[], measure: HumanMeasure): Finger[] {
  const kids = bind.map(() => [] as number[]);
  bind.forEach((b, i) => { if (b.parent >= 0) kids[b.parent].push(i); });
  const at = (i: number) => new THREE.Vector3(bind[i].x, bind[i].y, bind[i].z);
  const out: Finger[] = [];
  for (const wrist of [measure.joints.wristL, measure.joints.wristR]) {
    let hand = -1;
    const queue = [wrist];
    while (queue.length) {
      const j = queue.shift()!;
      if (kids[j].length >= 4) { hand = j; break; }
      queue.push(...kids[j]);
    }
    if (hand < 0) continue;
    const chains = kids[hand].map((root) => {
      const chain = [root];
      let j = root;
      while (kids[j].length > 0) { j = kids[j][0]; chain.push(j); }
      return chain;
    });
    const bases = chains.map((c) => at(c[0]));
    const centre = bases.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / bases.length);
    const thumbIndex = bases.reduce((best, b, i) => (b.distanceTo(centre) > bases[best].distanceTo(centre) ? i : best), 0);
    const others = chains.filter((_, i) => i !== thumbIndex);
    if (others.length < 2) continue;
    const thumbBase = bases[thumbIndex];
    others.sort((a, b) => at(a[0]).distanceTo(thumbBase) - at(b[0]).distanceTo(thumbBase));
    const index = at(others[0][0]), pinky = at(others[others.length - 1][0]);
    const along = centre.clone().sub(at(wrist)).normalize();
    const across = index.clone().sub(pinky).normalize();
    // the palm's facing; a mirror image flips a cross product, so the hand's side puts it back
    const side = Math.sign(at(wrist).x) || 1;
    const palm = new THREE.Vector3().crossVectors(along, across).multiplyScalar(side).normalize();
    for (const [i, chain] of chains.entries()) {
      const joints = chain.slice(0, -1); // (the last joint is the fingertip: nothing bends there)
      if (joints.length === 0) continue;
      const dir = at(chain[chain.length - 1]).sub(at(chain[0])).normalize();
      const thumb = i === thumbIndex;
      const toward = thumb ? palm.clone().multiplyScalar(THUMB_TO_PALM).sub(across).normalize() : palm;
      out.push({ joints, axis: new THREE.Vector3().crossVectors(dir, toward).normalize(), thumb });
    }
  }
  return out;
}

export class BodyMotion {
  /** The builder's names for her joints (shoulder, elbow, wrist, head...), as numbers into her skeleton's bones. */
  readonly measure: HumanMeasure;
  /** This frame's weights for her four motion shapes, in shapedBody.ts's MOTION_SHAPES order. */
  readonly weights = [0, 0, 0, 0];
  /** 0 standing, 1 walking, in between while she starts or stops. */
  walkBlend = 0;

  private readonly rig: HumanRig;
  private readonly bones: readonly THREE.Bone[];
  /** Her skeleton's own units in one metre of the game (two of her joints, measured both ways). */
  private readonly unitsPerMetre: number;
  private readonly belly: BellySpring = restingBellySpring();
  private readonly breast: BellySpring = restingBellySpring();
  /** How far she has walked at the builder's pace, metres: her place in her stride comes from this. */
  private walked = 0;
  // scratch, made once
  private readonly standTurns: MutableJointTurn[] = [];
  private readonly walkTurns: MutableJointTurn[] = [];
  private readonly weighedTurns: MutableJointTurn[] = [];
  private readonly fingerTurns: MutableJointTurn[] = [];
  /** A pose's bone rotations kept aside while the other pose is worked out (x, y, z, w for each bone). */
  private readonly kept: Float32Array;
  private readonly keptQ = new THREE.Quaternion();
  /** The one gait object handed to `poseHuman` each frame (its fields are rewritten, nothing new is made). */
  private readonly gait: { stance: HumanGait['stance']; phase: number; seconds: number; lean: number; carry: number } = { stance: 'stand', phase: 0, seconds: 0, lean: 0, carry: 0 };

  /**
   * @param model      the body file's scene, already placed (and scaled) inside the heroine's root
   * @param skin       her skin: its skeleton's bones are the ones posed
   * @param gripCurl   how far her fingers are closed, percent (the builder's FINGERS slider)
   */
  constructor(model: THREE.Object3D, skin: THREE.SkinnedMesh, gripCurl: number) {
    this.rig = new HumanRig(model);
    this.bones = skin.skeleton.bones;
    this.measure = measureHuman(this.rig.bind);
    this.kept = new Float32Array(this.bones.length * 4);

    // How big her skeleton's units are in the game's metres: the same two joints measured in the bind pose's own
    // units and in the world (the DEV Room's way, so the stride below is right whatever the file's units are).
    model.updateWorldMatrix(true, true);
    const a = this.measure.joints.head, b = this.measure.joints.ankleL, bind = this.rig.bind;
    const inWorld = this.bones[a].getWorldPosition(new THREE.Vector3()).distanceTo(this.bones[b].getWorldPosition(new THREE.Vector3()));
    const inBind = Math.hypot(bind[a].x - bind[b].x, bind[a].y - bind[b].y, bind[a].z - bind[b].z);
    this.unitsPerMetre = inBind / Math.max(1e-6, inWorld);

    // Her fingers' curl never changes, so its turns are written once.
    for (const finger of findFingers(this.rig.bind, this.measure)) {
      finger.joints.forEach((joint, k) => {
        this.fingerTurns.push({ joint, ax: finger.axis.x, ay: finger.axis.y, az: finger.axis.z, radians: fingerBend(gripCurl, k, finger.thumb) });
      });
    }
  }

  /**
   * One frame: pose her bones and work out her motion shapes' weights.
   * @param dt        seconds since the last frame
   * @param seconds   a free-running clock, for her breathing
   * @param walking   whether the game is moving her
   * @param belly     her belly, 0-200 % (a big belly walks shorter and wider, and swings more)
   */
  update(dt: number, seconds: number, walking: boolean, belly: number): void {
    const measure = this.measure, bind = this.rig.bind, gait = this.gait;
    const carry = belly / 100;

    // ---- standing or walking, eased from one to the other ----
    const ease = 1 - Math.exp(-dt / WALK_BLEND_SECONDS);
    this.walkBlend += ((walking ? 1 : 0) - this.walkBlend) * ease;
    if (walking && this.walkBlend > 0.999) this.walkBlend = 1;
    if (!walking && this.walkBlend < 0.001) { this.walkBlend = 0; this.walked = 0; }
    const blend = this.walkBlend;

    gait.seconds = seconds;
    gait.lean = 0;
    gait.carry = carry;
    let phase = 0, strideSeconds = 0;
    if (blend < 1) {
      // The builder's own stand: a person standing still, breathing.
      gait.stance = 'stand';
      gait.phase = 0;
      this.rig.apply(poseHuman(measure, bind, gait, this.standTurns));
    }
    if (blend > 0) {
      if (blend < 1) this.keep();
      // The builder's own walk: a step of her stride, with her weight shifting over each foot.
      const stride = humanStride(measure, 'walk', carry);              // one whole stride, in her skeleton's units
      this.walked += WALK_PACE * dt;
      phase = ((this.walked * this.unitsPerMetre) / stride) % 1;
      strideSeconds = stride / (WALK_PACE * this.unitsPerMetre);
      gait.stance = 'walk';
      gait.phase = phase;
      const steps = poseHuman(measure, bind, gait, this.walkTurns);
      // (`walkWeight` is the builder's and returns a small new object each call: the one thing made per frame here)
      this.rig.apply(weighWalk(measure, steps, walkWeight(phase, 'walk'), this.weighedTurns));
      if (blend < 1) this.mixWithKept(blend);
    }
    // her fingers round the grips, over whichever pose she is in
    this.rig.set(this.fingerTurns as readonly JointTurn[]);

    // ---- the weight of her belly and bust: springs that feel the walk's bounce and sway ----
    const upAccel = blend > 0 ? walkBounceAccel(phase, strideSeconds) * blend : 0;
    const leftAccel = blend > 0 ? walkSwayAccel(phase, strideSeconds) * blend : 0;
    stepBellySpring(this.belly, dt, upAccel, leftAccel);
    stepBreastSpring(this.breast, dt, upAccel, leftAccel);
    // The four weights, by the builder's own rule (`bellyMotionWeights` and `breastBobWeight`; the first is written out
    // here because the builder's version returns a new object every call):
    const size = Math.min(200, Math.max(0, belly)) / 100;
    const bob = this.belly.y / BELLY_MOTION.bobM;
    const swing = BELLY_SWING * Math.min(1, size);                       // a bigger belly swings more, up to full term
    this.weights[0] = (sizeTiltDeg(belly) * (Math.PI / 180)) / BELLY_MOTION.tiltRad + swing * BOUNCE_TILT * bob; // bellyTilt
    this.weights[1] = swing * bob;                                       // bellyBob
    this.weights[2] = swing * (this.belly.x / BELLY_MOTION.bobM);        // bellySway
    this.weights[3] = breastBobWeight(belly, this.breast);               // breastBob
  }

  /** Put every bone back as the file has it (for when she is taken apart). */
  dispose(): void { this.rig.dispose(); }

  /** Remember every bone's rotation as it is now. */
  private keep(): void {
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.toArray(this.kept, i * 4);
  }
  /** Each bone's rotation becomes a mix of the remembered pose and the one it has now (`share` of the new one). */
  private mixWithKept(share: number): void {
    for (let i = 0; i < this.bones.length; i++) {
      const q = this.bones[i].quaternion;
      this.keptQ.fromArray(this.kept, i * 4);
      q.copy(this.keptQ.slerp(q, share));
    }
  }
}
