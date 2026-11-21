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
//   * HER STRIDE IS MEASURED FROM HER OWN FOOT BONES (`measureStrides`) and
//     turned by the distance she really covers, backward when she backs up
//     (Joshua, 2026-11-17). Standing her on the floor, and holding each planted
//     foot to its spot, is footGround.ts;
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
import { poseHuman } from '@charb/actor/humanPose';
import { walkWeight, weighWalk } from '@charb/actor/walkWeight';
import { shapeAt, strideMetres, writeLegs, type StrideShape } from './strideShape';
import type { BindJoint, HumanGait, HumanMeasure, JointTurn, MutableJointTurn } from '@charb/actor/humanRig';
import {
  BELLY_MOTION, BELLY_SWING, THUMB_TO_PALM, breastBobWeight, fingerBend, restingBellySpring, sizeTiltDeg,
  stepBellySpring, stepBreastSpring, walkBounceAccel, walkSwayAccel, type BellySpring,
} from '@charb/sarahlab/sarahLabTool';

/** Slower than this over the ground, metres a second, she is standing (not walking). */
const WALK_FROM = 0.05;
/**
 * Her ground speed is read from how far she moved each frame, which jitters with the frame's length; it is smoothed
 * over about this long, seconds, before it decides whether she stands, walks or runs.
 */
const SPEED_SMOOTH_SECONDS = 0.08;
/**
 * Above this ground speed she RUNS (the builder's 'run' stride: both feet off the ground between steps), below it
 * she walks. It sits between a walk (1.1 m/s) and a jog (2.4); `RUN_BACK` is where a run drops back to a walk, a
 * little lower, so a speed hovering at the line does not flick between the two.
 */
const RUN_FROM = 1.9, RUN_BACK = 1.6;
/**
 * HER BOB AND SWAY EASE OFF AS SHE SPEEDS UP (Joshua, 2026-11-17: "normal walking the Bob/Sway is at 200%, but the
 * faster she moves, it lowers the amount"). At a walk (`fullAt`, metres a second) she has all of her look's Bob and
 * Sway; by a sprint (`leastAt`) she has `least` of them (half: her 200 % becomes 100 %), evenly in between.
 * GAME TUNING.
 */
export const WALK_EASE = { fullAt: 1.1, leastAt: 5.5, least: 0.5 } as const;
/** The share of her look's Bob and Sway she has at a ground speed (see WALK_EASE). */
export function walkEase(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - WALK_EASE.fullAt) / (WALK_EASE.leastAt - WALK_EASE.fullAt)));
  return 1 - (1 - WALK_EASE.least) * t;
}
/** How much she moves as she walks, percent of the builder's own tuning (her look's body settings). */
export interface MotionSettings { readonly walkBob: number; readonly walkSway: number; readonly breastBounce: number }
/**
 * A foot counts as PLANTED while its pace back under her is within this share of a planted foot's steady pace (see
 * `measureStrides`). Not exactly that pace all the way: her hips turn a few degrees with each step, which carries a
 * planted foot slightly faster in the middle of its step and slower at its ends (about 6 % each way as measured).
 */
const PLANTED_BAND = 0.13;
/** A walk eases into a run (and back) over about this long, seconds. */
const RUN_BLEND_SECONDS = 0.22;
/** Standing eases into walking (and back) over about this long, seconds. */
const WALK_BLEND_SECONDS = 0.16;
/**
 * How much the belly pitches for each centimetre it drops (it swings, it does not slide). The builder's own number
 * (`BOUNCE_TILT` in sarahLabTool.ts, which that file keeps to itself): a quarter of 0.1 rad, in tilt-shape weights.
 */
const BOUNCE_TILT = 0.25 * (0.1 / BELLY_MOTION.tiltRad);

/**
 * ONE STRIDE AS HER OWN FEET TAKE IT, measured from her foot bones (Joshua, 2026-11-17: "she is skating as her feet
 * aren't actually driving her along the ground like it should be... Best way for the moment is measure the actual
 * stride length from foot bone to foot bone, and sync that number with the room's scale").
 *
 * She is posed through one whole stride, `STRIDE_SAMPLES` moments of it, and at each her two ankle bones are read in
 * her own frame (metres, her feet's ground under her, forward along +z). A foot that is PLANTED is carrying her: it
 * moves back under her at one steady pace, and that pace is the ground going by. So:
 *   - `stride` is how far the ground goes by in one whole stride (left foot down to left foot down): the planted
 *     foot's pace, read off her bones. Her stride is turned by the distance she really covers, divided by this, and
 *     then a planted foot stays where it was put down;
 *   - `planted` says, for each foot at each moment, whether it is one of those feet;
 *   - `lift` is how far each ankle is above where it is when she stands (her pose swings her legs from hips that
 *     never move, so a leg out in front of her has its foot off the floor: she has to come down by that much for
 *     that foot to stand on the ground).
 */
export interface StrideTable {
  /** How far the ground goes by in one whole stride, metres. */
  readonly stride: number;
  /** The share of a stride each foot is planted (about 0.6 walking: both feet down between steps; 0.4 running). */
  readonly share: number;
  /** For her left foot [0] and her right [1], at each of the `STRIDE_SAMPLES` moments of a stride: */
  /** ...its ankle along her forward, metres from under her; */
  readonly along: readonly [Float32Array, Float32Array];
  /** ...its ankle's height over where it is when she stands, metres; */
  readonly lift: readonly [Float32Array, Float32Array];
  /** ...and 1 while it is planted (carrying her), 0 while it swings. */
  readonly planted: readonly [Uint8Array, Uint8Array];
  /** Where in the stride each foot is set down and where it is picked up again (0..1; left, right). */
  readonly landsAt: readonly [number, number];
  readonly leavesAt: readonly [number, number];
  /**
   * How far she comes down for the foot that carries her to stand on the floor with its leg straight: the lower of
   * her planted ankles' `lift`, at its most through a stride and at its least, metres. (The difference is her
   * legs' own rise and fall: what her look's Bob shows a share of.)
   */
  readonly needMost: number;
  readonly needLeast: number;
  /**
   * The middle of the moment both feet are off the ground, between her left foot leaving and her right landing
   * (0..1), when there is such a moment (a run); null when a foot is always down (a walk).
   */
  readonly flightAt: number | null;
  /**
   * The moment of a stride that is nearest to standing (0..1): her feet side by side under her, her left foot on
   * its way forward. A walk STARTS here, so her first step is a foot going forward from where it stood (starting
   * anywhere else, a foot would first have to slide to its place in the stride).
   */
  readonly startAt: number;
}
/** How many moments of a stride are measured. */
export const STRIDE_SAMPLES = 240;

/** One finger: its joints from the knuckle out, and the axis it curls about (in the skeleton's bind space). */
interface Finger { readonly joints: readonly number[]; readonly tip: number; readonly axis: THREE.Vector3; readonly thumb: boolean }

/**
 * ONE FINGER, AS THE GAME SEES IT (for closing it onto what the hand holds: fingerTouch.ts). Its bones from the
 * knuckle out, its fingertip bone (nothing bends there), which hand (0 left, 1 right) and whether it is the thumb.
 */
export interface HandFinger {
  readonly hand: number;
  readonly thumb: boolean;
  readonly bones: readonly THREE.Bone[];
  readonly tip: THREE.Bone;
}

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
      out.push({ joints, tip: chain[chain.length - 1], axis: new THREE.Vector3().crossVectors(dir, toward).normalize(), thumb });
    }
  }
  return out;
}

export class BodyMotion {
  /** The builder's names for her joints (shoulder, elbow, wrist, head...), as numbers into her skeleton's bones. */
  readonly measure: HumanMeasure;
  /** Her bind pose's joints (the T she was made in), as the builder reads them. */
  get bind(): readonly BindJoint[] { return this.rig.bind; }
  /** This frame's weights for her four motion shapes, in shapedBody.ts's MOTION_SHAPES order. */
  readonly weights = [0, 0, 0, 0];
  /** Her look's Bob, percent (read by the heroine, who lifts and lowers her by it: fastHeroine.ts). */
  get walkBob(): number { return this.settings.walkBob; }
  /** 0 standing, 1 walking, in between while she starts or stops. */
  walkBlend = 0;
  /**
   * SQUARED UP BETWEEN MOVES (footGround.ts 11; Joshua, 2026-11-20): while her feet are set side by side, her walk is
   * held to at most this much (1: as it would be; 0: standing, her next walk starting from the stride's beginning).
   */
  standCap = 1;
  /** 0 walking, 1 running, in between while one eases into the other. */
  runBlend = 0;
  /** Where she is in her stride, 0..1 wrapping (the builder's cycle: her left foot lands at 0.25, her right at 0.75). */
  get phase(): number { return this.stridePhase; }
  /** Her ground speed along the way her legs face, metres a second, smoothed (never negative: backing up counts the same). */
  speed = 0;
  /**
   * How far her body is over the foot she stands on now, metres toward her left (the builder's WALK Sway). Her legs
   * are leaned back under her by this much, so whoever places her moves her by it and her feet stay where they were
   * (footGround.ts does).
   */
  sway = 0;

  /** Her stride as her own feet take it, walking and running (measured by `measureStrides`; null until then). */
  strides: { readonly walk: StrideTable; readonly run: StrideTable } | null = null;
  /**
   * HER STRIDE NOW (strideShape.ts): its length, the share of it each foot is down (the rest is flight), how high the
   * knee lifts. Follows her speed every frame; her feet's planting goes by it (footGround.ts).
   */
  readonly shape: StrideShape = { stride: 1.18, share: 0.56, lift: 0.06, back: 0, narrow: 0 };
  /** The belly her strides were measured at (a bigger belly steps shorter: they are measured again when it changes). */
  private measuredBelly = -1;

  private readonly rig: HumanRig;
  private readonly bones: readonly THREE.Bone[];
  /** Her skeleton's own units in one metre of the game (two of her joints, measured both ways). */
  private readonly unitsPerMetre: number;
  private readonly belly: BellySpring = restingBellySpring();
  private readonly breast: BellySpring = restingBellySpring();
  /** Where she is in her stride, 0..1 wrapping: it turns by the distance she really covers, so her feet do not slide. */
  private stridePhase = 0;
  /** She is running (not walking). */
  private running = false;
  /** Her leg's length, hip to ankle, in the game's metres. */
  readonly legMetres: number;
  /** The heroine's root her strides were measured in (they are measured again there when her belly changes). */
  private measuredIn: THREE.Object3D | null = null;
  /** A second pose kept aside, for easing a walk into a run. */
  private readonly keptGait: Float32Array;
  // scratch, made once
  private readonly standTurns: MutableJointTurn[] = [];
  private readonly walkTurns: MutableJointTurn[] = [];
  private readonly weighedTurns: MutableJointTurn[] = [];
  private readonly fingerTurns: MutableJointTurn[] = [];
  /** For each finger turn: which hand (0 left, 1 right), how far along its finger (0 the knuckle) and whether a thumb. */
  private readonly fingerOf: { hand: number; k: number; thumb: boolean }[] = [];
  /** Each finger of both hands (fingerTouch.ts closes them one at a time), and each one's own joint turns. */
  readonly fingers: HandFinger[] = [];
  private readonly fingerOwnTurns: MutableJointTurn[][] = [];
  /**
   * HOW FAR EACH HAND'S FINGERS ARE CLOSED, percent (the builder's FINGERS slider), left and right: round a gun's
   * grip when she holds one, relaxed when her hand is empty, eased between as she takes hold or lets go (the hand
   * reach sets these each frame: handReach.ts).
   */
  readonly grip: [number, number];
  private readonly gripWas: [number, number] = [NaN, NaN];
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
  constructor(private readonly model: THREE.Object3D, skin: THREE.SkinnedMesh, gripCurl: number, private readonly settings: MotionSettings = { walkBob: 100, walkSway: 100, breastBounce: 100 }) {
    this.rig = new HumanRig(model);
    this.bones = skin.skeleton.bones;
    this.measure = measureHuman(this.rig.bind);
    this.kept = new Float32Array(this.bones.length * 4);
    this.keptGait = new Float32Array(this.bones.length * 4);

    // How big her skeleton's units are in the game's metres: the same two joints measured in the bind pose's own
    // units and in the world (the DEV Room's way, so the stride below is right whatever the file's units are).
    model.updateWorldMatrix(true, true);
    const a = this.measure.joints.head, b = this.measure.joints.ankleL, bind = this.rig.bind;
    const inWorld = this.bones[a].getWorldPosition(new THREE.Vector3()).distanceTo(this.bones[b].getWorldPosition(new THREE.Vector3()));
    const inBind = Math.hypot(bind[a].x - bind[b].x, bind[a].y - bind[b].y, bind[a].z - bind[b].z);
    this.unitsPerMetre = inBind / Math.max(1e-6, inWorld);
    this.legMetres = this.measure.legLength / this.unitsPerMetre;

    // Her fingers: each joint's turn, and which hand it is on (found up its bones to her left or her right wrist).
    // Their curl is worked out again only when a hand's grip changes.
    this.grip = [gripCurl, gripCurl];
    const bones = this.rig.bind, { wristL, wristR } = this.measure.joints;
    const handOf = (joint: number): number => {
      for (let j = joint; j >= 0; j = bones[j].parent) { if (j === wristL) return 0; if (j === wristR) return 1; }
      return 1;
    };
    for (const finger of findFingers(this.rig.bind, this.measure)) {
      const own: MutableJointTurn[] = [];
      finger.joints.forEach((joint, k) => {
        const turn = { joint, ax: finger.axis.x, ay: finger.axis.y, az: finger.axis.z, radians: fingerBend(gripCurl, k, finger.thumb) };
        this.fingerTurns.push(turn);
        own.push({ ...turn });
        this.fingerOf.push({ hand: handOf(joint), k, thumb: finger.thumb });
      });
      this.fingers.push({ hand: handOf(finger.joints[0]), thumb: finger.thumb, bones: finger.joints.map((j) => this.bones[j]), tip: this.bones[finger.tip] });
      this.fingerOwnTurns.push(own);
    }
  }

  /**
   * CLOSE ONE FINGER to `percent` (0 straight, 100 a fist; the builder's FINGERS slider), its joints bending together
   * as the builder bends them, over whatever pose she has now. Only that finger's bones are turned: the caller updates
   * their world matrices if it needs to read them.
   */
  curlFinger(finger: number, percent: number): void {
    const own = this.fingerOwnTurns[finger], thumb = this.fingers[finger].thumb;
    for (let k = 0; k < own.length; k++) own[k].radians = fingerBend(percent, k, thumb);
    this.rig.set(own as readonly JointTurn[]);
  }

  /** The same, each joint of the finger closed its own amount (percent, from the knuckle out). */
  curlFingerJoints(finger: number, percents: ArrayLike<number>): void {
    const own = this.fingerOwnTurns[finger], thumb = this.fingers[finger].thumb;
    // (below 0 it opens PAST straight, as far as the same amount closes it: a thumb lifting off what the hand holds)
    for (let k = 0; k < own.length; k++) own[k].radians = percents[k] >= 0 ? fingerBend(percents[k], k, thumb) : -fingerBend(-percents[k], k, thumb);
    this.rig.set(own as readonly JointTurn[]);
  }

  /**
   * One frame: pose her bones and work out her motion shapes' weights.
   * @param dt        seconds since the last frame
   * @param seconds   a free-running clock, for her breathing
   * @param distance  how far she really moved since the last frame along the way her legs face, metres: forward is
   *                  positive, backing up negative. HER STRIDE IS TURNED BY THIS and by nothing else, so her feet
   *                  step as far as she went: not at all against a wall, and backward when she backs up
   * @param belly     her belly, 0-200 % (a big belly walks shorter and wider, and swings more)
   */
  update(dt: number, seconds: number, distance: number, belly: number): void {
    // (her belly changed: her stride is a different length, so it is measured again)
    if (this.measuredIn && Math.abs(belly - this.measuredBelly) >= 2) this.measureStrides(this.measuredIn, belly);

    // Her ground speed, from the distance she covered: it decides whether she stands, walks or runs.
    const covered = dt > 0 ? Math.abs(distance) / dt : 0;
    this.speed += (covered - this.speed) * (dt > 0 ? 1 - Math.exp(-dt / SPEED_SMOOTH_SECONDS) : 1);
    if (covered === 0 && this.speed < 0.02) this.speed = 0;
    const speed = this.speed, walking = speed > WALK_FROM;
    const measure = this.measure, bind = this.rig.bind, gait = this.gait;
    const carry = belly / 100;

    // ---- standing or walking, eased from one to the other ----
    const ease = 1 - Math.exp(-dt / WALK_BLEND_SECONDS);
    this.walkBlend += ((walking ? 1 : 0) - this.walkBlend) * ease;
    if (walking && this.walkBlend > 0.999) this.walkBlend = 1;
    // (standing again: her next walk starts from the moment of a stride that is nearest to standing)
    if (this.walkBlend > this.standCap) this.walkBlend = Math.max(0, this.standCap);
    if ((!walking || this.standCap <= 0) && this.walkBlend < 0.001) { this.walkBlend = 0; this.stridePhase = this.strides?.walk.startAt ?? 0; this.running = false; this.runBlend = 0; }
    // walking or running, eased the same way
    if (this.running ? speed < RUN_BACK : speed > RUN_FROM) this.running = !this.running;
    this.runBlend += ((this.running ? 1 : 0) - this.runBlend) * (1 - Math.exp(-dt / RUN_BLEND_SECONDS));
    if (this.runBlend > 0.999) this.runBlend = 1; else if (this.runBlend < 0.001) this.runBlend = 0;
    const run = this.runBlend;
    const blend = this.walkBlend;

    gait.seconds = seconds;
    gait.lean = 0;
    gait.carry = carry;
    let phase = 0, strideSeconds = 0;
    this.sway = 0;
    if (blend < 1) {
      // The builder's own stand: a person standing still, breathing.
      gait.stance = 'stand';
      gait.phase = 0;
      this.rig.apply(poseHuman(measure, bind, gait, this.standTurns));
    }
    if (blend > 0) {
      if (blend < 1) this.keep();
      // The builder's own walk or run: a step of her stride, with her weight shifting over each foot. One whole
      // stride's length is the walk's, the run's, or between them while one eases into the other: MEASURED FROM HER
      // OWN FOOT BONES (`measureStrides`; the builder's own figure only until that has run). Her place in the stride
      // moves on by how far she really went, so her feet stay where they land; backward when she backs up.
      // HER STRIDE BY HER SPEED (Joshua, 2026-11-20: "the faster you run, the longer the stride length";
      // strideShape.ts): the game writes her legs, so the stride is the one her legs take at this speed.
      shapeAt(speed, carry, this.shape);
      const stride = strideMetres(this.shape, measure, this.unitsPerMetre);
      const turned = this.stridePhase + distance / stride;
      this.stridePhase = turned - Math.floor(turned);
      phase = this.stridePhase;
      // (how long a stride takes at this speed: what her belly and bust feel the bounce of)
      strideSeconds = stride / Math.max(0.3, speed);
      gait.phase = phase;
      /**
       * Pose her in one stance, and say how far her body is over her standing foot (a share of her leg, toward her
       * left). (The builder's `walkWeight` returns a small new object each call: made per frame.)
       */
      const poseAs = (stance: 'walk' | 'run'): number => {
        gait.stance = stance;
        const steps = poseHuman(measure, bind, gait, this.walkTurns);
        // (her legs her own: the stride at her speed, over the builder's fixed walk or run legs)
        writeLegs(this.walkTurns, measure, bind, phase, this.shape, carry, this.unitsPerMetre);
        // (how far her body moves over the foot she stands on: her look's SWAY, eased off with her speed)
        const weight = walkWeight(phase, stance, (this.settings.walkSway / 100) * walkEase(speed));
        this.rig.apply(weighWalk(measure, steps, weight, this.weighedTurns));
        return weight.sway;
      };
      let sway = 0;
      if (run <= 0) sway = poseAs('walk');
      else if (run >= 1) sway = poseAs('run');
      else {
        // between the two: the walk's pose kept aside, then the run's mixed over it
        const walkSway = poseAs('walk');
        for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.toArray(this.keptGait, i * 4);
        const runSway = poseAs('run');
        for (let i = 0; i < this.bones.length; i++) {
          const q = this.bones[i].quaternion;
          this.keptQ.fromArray(this.keptGait, i * 4);
          q.copy(this.keptQ.slerp(q, run));
        }
        sway = walkSway + (runSway - walkSway) * run;
      }
      if (blend < 1) this.mixWithKept(blend);
      this.sway = sway * this.legMetres * blend;
    }
    // her fingers round the grips (or relaxed, an empty hand), over whichever pose she is in
    if (this.grip[0] !== this.gripWas[0] || this.grip[1] !== this.gripWas[1]) {
      this.fingerTurns.forEach((turn, i) => { const f = this.fingerOf[i]; turn.radians = fingerBend(this.grip[f.hand], f.k, f.thumb); });
      this.gripWas[0] = this.grip[0]; this.gripWas[1] = this.grip[1];
    }
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
    this.weights[3] = breastBobWeight(belly, this.breast) * (this.settings.breastBounce / 100); // breastBob, by her look's BOUNCE
  }

  /**
   * MEASURE HER STRIDE FROM HER FOOT BONES (see StrideTable), walking and running, at this belly.
   * She is posed through a whole stride of each, exactly as `update` poses her, and her ankles are read in `frame`'s
   * own space: the heroine's root (metres, the floor at 0, forward along +z). Her bones are left in the last pose
   * measured, so this is called before a frame's own pose is laid (or while she is being built).
   */
  measureStrides(frame: THREE.Object3D, belly: number): void {
    this.measuredIn = frame;
    const measure = this.measure, bind = this.rig.bind, gait = this.gait, joints = measure.joints;
    const ankles = [this.bones[joints.ankleL], this.bones[joints.ankleR]];
    frame.updateWorldMatrix(true, false);
    const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert(), point = new THREE.Vector3();
    /** Her ankles as her bones have them now, in the frame: [left along, left height, right along, right height]. */
    const read = (out: number[]): number[] => {
      this.model.updateMatrixWorld(true);
      for (let side = 0; side < 2; side++) {
        point.setFromMatrixPosition(ankles[side].matrixWorld).applyMatrix4(toFrame);
        out[side * 2] = point.z;
        out[side * 2 + 1] = point.y;
      }
      return out;
    };
    gait.seconds = 0;
    gait.lean = 0;
    gait.carry = belly / 100;
    // as she stands: where each ankle is when its foot is flat on the floor under her
    gait.stance = 'stand';
    gait.phase = 0;
    this.rig.apply(poseHuman(measure, bind, gait, this.standTurns));
    const stand = read([0, 0, 0, 0]), now = [0, 0, 0, 0];

    const tableShape: StrideShape = { stride: 0, share: 0, lift: 0, back: 0, narrow: 0 };
    const table = (stance: 'walk' | 'run', speed: number): StrideTable => {
      const N = STRIDE_SAMPLES;
      const along: [Float32Array, Float32Array] = [new Float32Array(N), new Float32Array(N)];
      const lift: [Float32Array, Float32Array] = [new Float32Array(N), new Float32Array(N)];
      const planted: [Uint8Array, Uint8Array] = [new Uint8Array(N), new Uint8Array(N)];
      gait.stance = stance;
      for (let k = 0; k < N; k++) {
        gait.phase = k / N;
        const steps = poseHuman(measure, bind, gait, this.walkTurns);
        writeLegs(this.walkTurns, measure, bind, gait.phase, shapeAt(speed, belly / 100, tableShape), belly / 100, this.unitsPerMetre);
        this.rig.apply(weighWalk(measure, steps, walkWeight(gait.phase, stance, (this.settings.walkSway / 100) * walkEase(speed)), this.weighedTurns));
        read(now);
        for (let side = 0; side < 2; side++) { along[side][k] = now[side * 2]; lift[side][k] = now[side * 2 + 1] - stand[side * 2 + 1]; }
      }
      // Each foot's pace along her forward, metres a stride (going back under her is negative). A PLANTED foot goes
      // back at one steady pace (the ground going by); a swinging foot is going forward, or back at some other pace.
      // So: the middle value of all the backward paces is a planted foot's (a foot is planted for more of a stride
      // than it swings backward), and each foot is planted through its longest unbroken stretch within a little of
      // that pace.
      const pace = (side: number, k: number): number => (along[side][(k + 1) % N] - along[side][(k + N - 1) % N]) * (N / 2);
      const backward: number[] = [];
      for (let side = 0; side < 2; side++) for (let k = 0; k < N; k++) { const v = pace(side, k); if (v < 0) backward.push(v); }
      backward.sort((a, b) => a - b);
      const steady = backward.length > 0 ? backward[backward.length >> 1] : 0;
      const landsAt: [number, number] = [0, 0], leavesAt: [number, number] = [0, 0];
      let sum = 0, count = 0;
      for (let side = 0; side < 2; side++) {
        const near = (k: number): boolean => { const v = pace(side, k % N); return v < 0 && Math.abs(v - steady) <= -steady * PLANTED_BAND; };
        // the longest unbroken stretch (it may run across the end of the table and on from its start)
        let bestStart = 0, bestLength = 0;
        for (let start = 0; start < N; start++) {
          if (!near(start) || near(start + N - 1)) continue;        // (a stretch starts where the sample before is not in it)
          let length = 0;
          while (length < N && near(start + length)) length++;
          if (length > bestLength) { bestLength = length; bestStart = start; }
        }
        for (let i = 0; i < bestLength; i++) { const k = (bestStart + i) % N; planted[side][k] = 1; sum -= pace(side, k); count++; }
        landsAt[side] = bestStart / N;
        leavesAt[side] = ((bestStart + bestLength) % N) / N;
      }
      // how far she must come down for her carrying foot to be on the floor: the lower planted ankle, through a stride
      let needMost = 0, needLeast = Infinity, flight = 0;
      for (let k = 0; k < N; k++) {
        const left = planted[0][k] === 1, right = planted[1][k] === 1;
        if (!left && !right) { flight++; continue; }
        const need = Math.min(left ? lift[0][k] : Infinity, right ? lift[1][k] : Infinity);
        needMost = Math.max(needMost, need);
        needLeast = Math.min(needLeast, need);
      }
      // (nearest to standing: her right foot planted, her left swinging forward past it)
      let startAt = 0, closest = Infinity;
      for (let k = 0; k < N; k++) {
        if (planted[0][k] === 1 || planted[1][k] === 0 || pace(0, k) <= 0) continue;
        const apart = Math.abs(along[0][k] - along[1][k]);
        if (apart < closest) { closest = apart; startAt = k / N; }
      }
      // (both feet off the ground: from her left foot leaving to her right foot landing, if that is a gap at all)
      const gap = (landsAt[1] - leavesAt[0] + 1) % 1;
      const flightAt = flight > 0 && gap < 0.5 ? (leavesAt[0] + gap / 2) % 1 : null;
      return {
        stride: count > 0 ? sum / count : 0, share: count / (2 * N), along, lift, planted, landsAt, leavesAt,
        needMost, needLeast: Number.isFinite(needLeast) ? needLeast : 0, flightAt, startAt,
      };
    };
    // (her sway eases off with her speed, so each is measured at a speed of its own: a walk, a run)
    this.strides = { walk: table('walk', WALK_EASE.fullAt), run: table('run', 4.18) };
    this.measuredBelly = belly;
    if (this.walkBlend === 0) this.stridePhase = this.strides.walk.startAt;
  }

  /** Put every bone back as the file has it (for when she is taken apart). */
  dispose(): void { this.rig.dispose(); }

  /**
   * A POSE LAID OVER THE ONE SHE HAS (groundPose.ts: lying on her belly, on all fours): the joints `turns` names take
   * those turns, mixed in by `weight` (0 none .. 1 wholly), every other bone left as it is.
   */
  overlay(turns: readonly JointTurn[], weight: number): void {
    if (weight <= 0) return;
    if (weight < 1) this.keep();
    this.rig.set(turns);
    if (weight < 1) this.mixWithKept(weight);
  }

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
