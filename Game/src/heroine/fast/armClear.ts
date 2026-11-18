// ============================================================================
// armClear.ts -- HER ARMS KEEP CLEAR OF HER BELLY AND HER BREASTS.
//
// Joshua (2026-11-17): "a simple collision to prevent the arms from crossing
// into the belly. It will like either go above or below the belly depending on
// if you're looking up or downwards. So if you turn your body to the left and
// your arms go left, the left arm will be free to swing as it pleases, but the
// right hand will stop at the belly probably about 2 cm just for a slight
// spacing. If you're looking upward, the hand will cross over the belly more as
// it can go above it and if looking downwards, will stop at the belly."
// And then: "don't forget about the breasts... have it like rotate shoulder up
// or down, and bend at the elbow as needed".
//
// HOW IT WORKS, in three small parts:
//
//   1. HER BELLY AND EACH BREAST AS AN EGG. Each is measured from her own skin
//      (when she is made, and again whenever her shape changes) as an egg
//      shape, an "ellipsoid": a middle point and three half-sizes (side to side,
//      up and down, front to back). Testing a point against an egg is one line
//      of sums, where testing it against the hundred thousand points of her
//      skin would cost a frame. Each egg rides on the bone that carries most of
//      that part of her skin, so it turns and leans as that part of her does.
//
//   2. A FEW BALLS ALONG EACH ARM: two on her upper arm, her elbow, the middle
//      of her forearm, her wrist and the middle of her palm. A ball is "in" an
//      egg when it is inside the egg grown by the ball's own size plus the gap.
//
//   3. PUSHED STRAIGHT OUT, AND THE ARM MADE TO FIT. A ball that is in is moved
//      out along the line from the egg's middle through the ball. That line is
//      what gives Joshua's rule for free: a hand coming across at belly height
//      is pushed back the way it came (it STOPS at her belly); a hand coming in
//      high is pushed up (it goes OVER her belly); one coming in low goes under.
//      Her arm is two rods of fixed length (shoulder to elbow, elbow to wrist),
//      so the push is worked out on her ELBOW and her WRIST, a few rounds of:
//        - a ball on her upper arm (or her elbow itself) moves her ELBOW: her
//          shoulder rotates her arm up, down or out of the way;
//        - a ball on her forearm or hand moves her WRIST: her elbow bends as
//          needed;
//        - each rod is put back to its own length.
//      Whatever is not pushed stays where her pose put it, so her hand stays as
//      near as it can to where she aims, and it is kept pointing as it pointed,
//      so her gun still points there.
//
// HER THIGHS TOO (Joshua, 2026-11-17: "the same for the upper leg, and it stops
// the same distance and/or offset away from the belly so her legs spread apart
// a little more depending what she is trying to do"). Balls along each thigh
// and at the knee are kept off her belly the same way; her knee is swung OUT
// round the line from her hip to her ankle, so her foot stays exactly where it
// stands (a planted foot never slides) and her legs simply open a little.
//
// It is done after her pose and her aim are on her bones, so it corrects
// whatever they did: aiming across herself, her arms swinging as she runs, her
// shoulders turned further than her belly.
//
// Nothing here allocates while the game runs.
// ============================================================================
import * as THREE from 'three';
import type { ArmBones } from '../aimArms';
import { turnInWorld } from './boneTurn';

/** GAME TUNING. Lengths in metres. */
export const ARM_CLEAR = {
  /** The space kept between her arm and her body (Joshua: "about 2 cm just for a slight spacing"). */
  gap: 0.02,
  /** Her arm as balls: how big each is. */
  upperArm: 0.042,
  elbow: 0.038,
  forearm: 0.04,
  wrist: 0.032,
  palm: 0.045,
  /** Her thigh as balls: two along it (from her hip, 0, to her knee, 1) and her knee. A thigh is thick near the hip. */
  thigh: 0.075,
  thighAt: [0.5, 0.8],
  knee: 0.06,
  /**
   * How quickly her knee swings out when her thigh meets her belly, and back in when it clears, seconds (about two
   * thirds of the way there in that time). Out quickly so her leg never sinks into her belly for long; back in more
   * slowly so a running stride does not snap her knee in and out every step.
   */
  kneeOutSeconds: 0.06,
  kneeInSeconds: 0.3,
  /** The most her knee is swung round its circle in one go, radians (about 35 degrees). */
  kneeMostTurn: 0.6,
  /** Where her upper arm's two balls sit, from her shoulder (0) to her elbow (1), and her forearm's from elbow to wrist. */
  upperArmAt: [0.5, 0.8],
  forearmAt: 0.55,
  /** How many rounds of pushing out and putting her arm's two lengths right are done in one frame. */
  rounds: 6,
  /** A move smaller than this is not worth turning her arm's bones for. */
  least: 0.0008,
} as const;

/**
 * A part of her as an egg shape, in her own frame as she stands (metres: x toward her left, y up from the floor, z
 * the way she faces): its middle and its three half-sizes. And the bone that carries most of that part of her skin
 * (its number in her skeleton).
 */
export interface Egg { cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; bone: number }

/** Her skin for measuring: her points as shaped, her own frame, which bones hold each point, and which bones are her trunk's. */
export interface SkinToMeasure {
  /** Her skin's points as shaped (x, y, z each, her mesh's own units). */
  readonly points: Float32Array;
  /** Those units to her own frame as she stands (metres, floor at 0, facing +z). */
  readonly toFrame: THREE.Matrix4;
  /** Which four bones hold each point, and how much each holds it. */
  readonly skinIndex: ArrayLike<number>;
  readonly skinWeight: ArrayLike<number>;
  /** For each bone, 1 if it is part of her trunk (her hips and her back: not her arms or legs). */
  readonly isTrunk: Uint8Array;
}

/** The bone that holds the most of some points' weight (given each bone's share added up). */
function heaviest(weights: Float32Array): number {
  let at = 0;
  for (let k = 1; k < weights.length; k++) if (weights[k] > weights[at]) at = k;
  return at;
}

/**
 * MEASURE HER BELLY from her skin: an egg from her hips up to under her bust.
 * @param low     the height of her hip joints, and `high` the height under her bust (her frame, metres)
 * @param spineZ  how far forward her spine is at belly height (her frame, metres)
 */
export function fitBelly(skin: SkinToMeasure, low: number, high: number, spineZ: number): Egg {
  const { points, toFrame, skinIndex, skinWeight, isTrunk } = skin;
  // Her trunk in thin slices up its height: how far forward each reaches, and how wide it is.
  const SLICE = 0.02, bottom = low - 0.1, count = Math.max(1, Math.ceil((high - bottom) / SLICE));
  const front = new Float32Array(count).fill(-Infinity), wide = new Float32Array(count);
  const carried = new Float32Array(isTrunk.length);
  const point = new THREE.Vector3();
  for (let v = 0; v * 3 < points.length; v++) {
    let trunk = 0;
    for (let c = 0; c < 4; c++) if (isTrunk[skinIndex[v * 4 + c]]) trunk += skinWeight[v * 4 + c];
    if (trunk < 0.6) continue;
    point.set(points[v * 3], points[v * 3 + 1], points[v * 3 + 2]).applyMatrix4(toFrame);
    if (point.z < spineZ) continue;                                // (her front half only: her arms never reach her back)
    const k = Math.floor((point.y - bottom) / SLICE);
    if (k < 0 || k >= count) continue;
    if (point.z > front[k]) front[k] = point.z;
    if (Math.abs(point.x) > wide[k]) wide[k] = Math.abs(point.x);
    // (which bone carries her belly: the one holding most of the points well out in front)
    if (point.z > spineZ + 0.12) for (let c = 0; c < 4; c++) carried[skinIndex[v * 4 + c]] += skinWeight[v * 4 + c];
  }
  // Where she reaches furthest forward is the middle of her belly, and how far that is in front of her spine is its
  // half-size front to back.
  let at = 0;
  for (let k = 1; k < count; k++) if (front[k] > front[at]) at = k;
  const cy = bottom + (at + 0.5) * SLICE, cz = spineZ, rz = Math.max(0.08, front[at] - cz);
  // Its half-size side to side: her widest within a hand's breadth of that height.
  let rx = 0.1;
  for (let k = Math.max(0, at - 4); k <= Math.min(count - 1, at + 4); k++) rx = Math.max(rx, wide[k]);
  // Its half-size up and down: each slice that is part of the bulge says how tall an egg would pass through it; the
  // middle one of those answers is taken (so one odd slice, a waistband's edge, does not decide it).
  const heights: number[] = [];
  for (let k = 0; k < count; k++) {
    if (!Number.isFinite(front[k])) continue;
    const reach = (front[k] - cz) / rz;
    if (reach < 0.35 || reach > 0.93) continue;
    heights.push(Math.abs(bottom + (k + 0.5) * SLICE - cy) / Math.sqrt(1 - reach * reach));
  }
  heights.sort((a, b) => a - b);
  const ry = Math.min(0.35, Math.max(0.12, heights.length > 0 ? heights[heights.length >> 1] : (high - low) / 2));
  return { cx: 0, cy, cz, rx, ry, rz, bone: heaviest(carried) };
}

/**
 * MEASURE HER BREASTS from her skin: one egg each (her left, then her right), between `low` (the height under her
 * bust) and `high` (the height of her shoulders), her frame, metres.
 */
export function fitBreasts(skin: SkinToMeasure, low: number, high: number): [Egg, Egg] {
  const { points, toFrame, skinIndex, skinWeight, isTrunk } = skin;
  const point = new THREE.Vector3();
  // One pass to find, on each side: the point that stands furthest forward, how wide she is, and how far forward her
  // chest is where it begins (just under her collarbones: her chest without her breasts).
  const frontAt = [new THREE.Vector3(0, 0, -Infinity), new THREE.Vector3(0, 0, -Infinity)], wide = [0, 0], chest = [-Infinity, -Infinity];
  const carried = [new Float32Array(isTrunk.length), new Float32Array(isTrunk.length)];
  const top = high - 0.03;
  const each = (visit: (side: number, v: number) => void): void => {
    for (let v = 0; v * 3 < points.length; v++) {
      let trunk = 0;
      for (let c = 0; c < 4; c++) if (isTrunk[skinIndex[v * 4 + c]]) trunk += skinWeight[v * 4 + c];
      if (trunk < 0.6) continue;
      point.set(points[v * 3], points[v * 3 + 1], points[v * 3 + 2]).applyMatrix4(toFrame);
      if (point.y < low || point.y > high || Math.abs(point.x) < 0.02) continue;
      visit(point.x > 0 ? 0 : 1, v);
    }
  };
  each((side) => {
    if (point.z > frontAt[side].z) frontAt[side].copy(point);
    if (Math.abs(point.x) > wide[side]) wide[side] = Math.abs(point.x);
    if (point.y > top && point.z > chest[side]) chest[side] = point.z;
  });
  // A second pass: how tall each breast is (the points that stand well out from her chest), and which bone carries it.
  const lowest = [Infinity, Infinity], highest = [-Infinity, -Infinity];
  each((side, v) => {
    const out = frontAt[side].z - (Number.isFinite(chest[side]) ? chest[side] : frontAt[side].z - 0.06);
    if (point.z < frontAt[side].z - out * 0.55) return;
    lowest[side] = Math.min(lowest[side], point.y);
    highest[side] = Math.max(highest[side], point.y);
    for (let c = 0; c < 4; c++) carried[side][skinIndex[v * 4 + c]] += skinWeight[v * 4 + c];
  });
  const egg = (side: number): Egg => {
    const sign = side === 0 ? 1 : -1;
    const cz = Number.isFinite(chest[side]) ? Math.min(chest[side], frontAt[side].z - 0.04) : frontAt[side].z - 0.06;
    const tall = Number.isFinite(lowest[side]) ? (highest[side] - lowest[side]) / 2 : 0.06;
    return {
      cx: sign * wide[side] / 2, cy: Number.isFinite(lowest[side]) ? (highest[side] + lowest[side]) / 2 : frontAt[side].y, cz,
      rx: Math.max(0.04, wide[side] / 2), ry: Math.min(0.14, Math.max(0.05, tall)), rz: frontAt[side].z - cz, bone: heaviest(carried[side]),
    };
  };
  return [egg(0), egg(1)];
}

/** One leg's bones, for keeping the thigh off her belly. */
export interface LegBonesForClear { readonly hip: THREE.Bone; readonly knee: THREE.Bone; readonly ankle: THREE.Bone }

/** One egg in use: its shape, the bone that carries it, and this frame's way from the world into the egg's own frame and back. */
interface Obstacle { egg: Egg; carrier: THREE.Bone; readonly toFit: THREE.Matrix4; readonly fromFit: THREE.Matrix4 }

// Scratch objects, made once.
const shoulderAt = new THREE.Vector3(), elbowAt = new THREE.Vector3(), wristAt = new THREE.Vector3(), palmOff = new THREE.Vector3(), ballAt = new THREE.Vector3();
const elbowWas = new THREE.Vector3(), wristWas = new THREE.Vector3();
const inFit = new THREE.Vector3(), push = new THREE.Vector3(), out = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3(), knuckle = new THREE.Vector3();
const turn = new THREE.Quaternion(), handQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

export class ArmClear {
  /** Switched off, her arms are left exactly as her pose and her aim have them (for comparing, in the lab). */
  on = true;
  /** How far each arm was moved this frame to keep it clear, metres (left, right). For a readout and the tests. */
  readonly moved: [number, number] = [0, 0];
  /** How far each knee was moved this frame to keep its thigh off her belly, metres (left, right). */
  readonly kneeMoved: [number, number] = [0, 0];
  /**
   * Each knee's swing out round the hip-to-ankle line, as the distance along that circle, metres, eased from frame
   * to frame (see kneeOutSeconds). Kept in metres, not an angle: with her leg nearly straight the circle is tiny and
   * the same angle would mean almost nothing, then a big swing a moment later as her knee bends.
   */
  private kneeSwing: [number, number] = [0, 0];
  private legs: readonly LegBonesForClear[] = [];
  /**
   * Whether her thighs are kept off her belly this frame. Off while she kneels: her knees are on the floor where the
   * kneel puts them (lowerBody.ts opens them round her belly itself), and swinging them would lift them off it.
   */
  thighs = true;
  /** Her legs (call once): their thighs are kept off her belly too. */
  setLegs(legs: readonly LegBonesForClear[]): void { this.legs = legs; }

  private readonly arms: readonly [ArmBones, ArmBones];
  private obstacles: Obstacle[] = [];
  /** Each of her bones as it stood in her own frame when she was made: an egg is kept in its carrier's frame of then. */
  private readonly standing: THREE.Matrix4[] = [];

  /**
   * @param frame  the heroine's root (her own frame: the floor at 0, facing +z)
   * @param bones  her skeleton's bones (an egg names its carrier by its number in these)
   * She must be standing, nothing of her turned, when this is made: her bones are remembered as they stand now.
   */
  constructor(frame: THREE.Object3D, private readonly bones: readonly THREE.Bone[], left: ArmBones, right: ArmBones) {
    this.arms = [left, right];
    frame.updateMatrixWorld(true);
    const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert();
    for (const bone of bones) this.standing.push(new THREE.Matrix4().multiplyMatrices(toFrame, bone.matrixWorld));
  }

  /** Her eggs as measured (her belly, her breasts): given when she is made and again whenever her shape changes. */
  setEggs(eggs: readonly Egg[]): void {
    this.obstacles = eggs.map((egg) => ({ egg, carrier: this.bones[egg.bone], toFit: new THREE.Matrix4(), fromFit: new THREE.Matrix4() }));
  }
  /** Her eggs, for a readout and the tests. */
  get eggs(): readonly Egg[] { return this.obstacles.map((o) => o.egg); }

  /**
   * HER BELLY'S FURTHEST POINT ALONG A DIRECTION, in the world, as she is posed now (her bones' world matrices up to
   * date): for keeping her off the weapon table (Joshua, 2026-11-17: "a simple collision to the table to belly/body so
   * it doesn't matter the belly size"). Null if she has no belly egg.
   */
  bellyFurthest(direction: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    const o = this.obstacles[0];
    if (!o) return null;
    const egg = o.egg;
    o.toFit.copy(o.carrier.matrixWorld).invert().premultiply(this.standing[egg.bone]);
    o.fromFit.copy(o.toFit).invert();
    // the direction in the egg's own frame; the point of an egg furthest along d is its middle + R²d / |Rd|
    from.copy(direction).transformDirection(o.toFit);
    const sx = egg.rx * egg.rx * from.x, sy = egg.ry * egg.ry * from.y, sz = egg.rz * egg.rz * from.z;
    const n = Math.sqrt(sx * from.x + sy * from.y + sz * from.z) || 1;
    return out.set(egg.cx + sx / n, egg.cy + sy / n, egg.cz + sz / n).applyMatrix4(o.fromFit);
  }

  /**
   * One frame, after her pose, her turns and her aim are on her bones (and their world matrices are up to date):
   * each arm is moved out of her belly and her breasts if it is in them.
   */
  /** @param dt seconds since the last frame (her knees ease out and back in over time; see kneeOutSeconds) */
  update(dt = 1 / 30): void {
    this.moved[0] = 0;
    this.moved[1] = 0;
    if (!this.on || this.obstacles.length === 0) return;
    // the world to the frame each egg is kept in, and back (its carrier bone carries that frame about)
    for (const o of this.obstacles) {
      o.toFit.copy(o.carrier.matrixWorld).invert().premultiply(this.standing[o.egg.bone]);
      o.fromFit.copy(o.toFit).invert();
    }
    this.updateLegs(dt);
    for (let side = 0; side < 2; side++) {
      const arm = this.arms[side];
      // her arm as two rods: shoulder to elbow, elbow to wrist; and where the middle of her palm is from her wrist
      // (part of the way to her knuckles: it goes with her hand, which is kept pointing as it points)
      shoulderAt.setFromMatrixPosition(arm.upper.matrixWorld);
      elbowAt.setFromMatrixPosition(arm.fore.matrixWorld);
      wristAt.setFromMatrixPosition(arm.hand.matrixWorld);
      palmOff.set(0, 0, 0);
      if (arm.knuckles.length > 0) {
        for (const k of arm.knuckles) palmOff.add(knuckle.setFromMatrixPosition(k.matrixWorld));
        palmOff.multiplyScalar(1 / arm.knuckles.length).sub(wristAt).multiplyScalar(0.6);
      }
      const upperLength = shoulderAt.distanceTo(elbowAt), foreLength = elbowAt.distanceTo(wristAt);
      elbowWas.copy(elbowAt);
      wristWas.copy(wristAt);

      let touched = false;
      for (let round = 0; round < ARM_CLEAR.rounds; round++) {
        let pushed = false;
        // HER UPPER ARM AND ELBOW move her ELBOW (her shoulder rotates her arm out of the way). A ball part of the
        // way along the rod moves less than the rod's end does, so the end is moved further than the ball needs.
        for (const at of ARM_CLEAR.upperArmAt) if (this.pushOut(ballAt.copy(shoulderAt).lerp(elbowAt, at), ARM_CLEAR.upperArm)) { elbowAt.addScaledVector(push, 1 / at); pushed = true; }
        if (this.pushOut(ballAt.copy(elbowAt), ARM_CLEAR.elbow)) { elbowAt.add(push); pushed = true; }
        // (her upper arm keeps its length)
        elbowAt.sub(shoulderAt).setLength(upperLength).add(shoulderAt);
        // HER FOREARM AND HAND move her WRIST (her elbow bends as needed).
        if (this.pushOut(ballAt.copy(elbowAt).lerp(wristAt, ARM_CLEAR.forearmAt), ARM_CLEAR.forearm)) { wristAt.addScaledVector(push, 1 / ARM_CLEAR.forearmAt); pushed = true; }
        if (this.pushOut(ballAt.copy(wristAt), ARM_CLEAR.wrist)) { wristAt.add(push); pushed = true; }
        if (this.pushOut(ballAt.copy(wristAt).add(palmOff), ARM_CLEAR.palm)) { wristAt.add(push); pushed = true; }
        // (her forearm keeps its length)
        wristAt.sub(elbowAt).setLength(foreLength).add(elbowAt);
        if (!pushed) break;
        touched = true;
      }
      const moved = Math.max(elbowAt.distanceTo(elbowWas), wristAt.distanceTo(wristWas));
      if (!touched || moved <= ARM_CLEAR.least) continue;
      this.moved[side] = moved;

      // Her bones turned to match: her upper arm to point at where her elbow now is, her forearm at her wrist, and
      // her hand turned back to point as it did (with everything it carries: her fingers, her gun).
      arm.hand.getWorldQuaternion(handQ);
      from.copy(elbowWas).sub(shoulderAt).normalize();
      to.copy(elbowAt).sub(shoulderAt).normalize();
      turnInWorld(arm.upper, turn.setFromUnitVectors(from, to));
      from.setFromMatrixPosition(arm.hand.matrixWorld).sub(elbowAt).normalize();
      to.copy(wristAt).sub(elbowAt).normalize();
      turnInWorld(arm.fore, turn.setFromUnitVectors(from, to));
      arm.fore.getWorldQuaternion(parentQ);
      arm.hand.quaternion.copy(parentQ.invert()).multiply(handQ);
      arm.hand.updateMatrixWorld(true);
    }
  }

  /**
   * HER THIGHS (see the top of this file): each thigh's balls kept off her belly (her first egg) by swinging her knee
   * out round the line from her hip to her ankle. Her foot does not move.
   */
  private updateLegs(dt: number): void {
    this.kneeMoved[0] = this.kneeMoved[1] = 0;
    const belly = this.obstacles.slice(0, 1);
    if (!this.on || !this.thighs || belly.length === 0) { this.kneeSwing[0] = this.kneeSwing[1] = 0; return; }
    const all = this.obstacles;
    this.obstacles = belly; // (only her belly: her thighs never reach her breasts)
    try {
      this.legs.forEach((leg, side) => {
        leg.hip.getWorldPosition(shoulderAt);   // (the scratch names are the arm's: here hip, knee, ankle)
        leg.knee.getWorldPosition(elbowAt);
        leg.ankle.getWorldPosition(wristAt);
        elbowWas.copy(elbowAt);
        // the circle her knee can move on with her hip and her ankle where they are: round the line between them
        const axis = from.copy(wristAt).sub(shoulderAt).normalize();
        const centre = to.copy(shoulderAt).addScaledVector(axis, inFit.copy(elbowAt).sub(shoulderAt).dot(axis));
        const radius = elbowAt.distanceTo(centre);
        if (radius < 1e-4) return; // (leg dead straight: no circle to swing on, and nothing to swing)
        // 1. WHERE HER KNEE WOULD HAVE TO BE: the thigh's balls pushed off her belly, back onto the circle each round
        for (let round = 0; round < ARM_CLEAR.rounds; round++) {
          let pushed = false;
          for (const at of ARM_CLEAR.thighAt) if (this.pushOut(ballAt.copy(shoulderAt).lerp(elbowAt, at), ARM_CLEAR.thigh)) { elbowAt.addScaledVector(push, 1 / at); pushed = true; }
          if (this.pushOut(ballAt.copy(elbowAt), ARM_CLEAR.knee)) { elbowAt.add(push); pushed = true; }
          if (!pushed) break;
          elbowAt.sub(centre);
          elbowAt.addScaledVector(axis, -elbowAt.dot(axis));
          if (elbowAt.lengthSq() < 1e-10) elbowAt.copy(elbowWas).sub(centre);
          elbowAt.setLength(radius).add(centre);
        }
        // 2. THAT AS A SWING ROUND THE LINE (metres along the circle, + one way, - the other), eased so a stride never
        //    snaps it
        const a = ballAt.copy(elbowWas).sub(centre), b = knuckle.copy(elbowAt).sub(centre);
        const want = Math.atan2(axis.dot(push.copy(a).cross(b)), a.dot(b)) * radius;
        const had = this.kneeSwing[side];
        const seconds = Math.abs(want) > Math.abs(had) ? ARM_CLEAR.kneeOutSeconds : ARM_CLEAR.kneeInSeconds;
        const swing = had + (want - had) * (1 - Math.exp(-Math.max(0, dt) / seconds));
        this.kneeSwing[side] = swing;
        if (Math.abs(swing) <= ARM_CLEAR.least) return;
        // 3. HER KNEE SWUNG THAT FAR round the circle (never more than kneeMostTurn: her hip's own limit is kept by
        //    the joint guard after this)
        const angle = THREE.MathUtils.clamp(swing / radius, -ARM_CLEAR.kneeMostTurn, ARM_CLEAR.kneeMostTurn);
        elbowAt.copy(a).applyAxisAngle(axis, angle).add(centre);
        this.kneeMoved[side] = elbowAt.distanceTo(elbowWas);
        // her thigh turned to the new knee, her shin back onto her ankle, her foot left pointing as it pointed
        leg.ankle.getWorldQuaternion(handQ);
        turnInWorld(leg.hip, turn.setFromUnitVectors(ballAt.copy(elbowWas).sub(shoulderAt).normalize(), knuckle.copy(elbowAt).sub(shoulderAt).normalize()));
        leg.knee.getWorldPosition(elbowAt);
        leg.ankle.getWorldPosition(ballAt);
        turnInWorld(leg.knee, turn.setFromUnitVectors(ballAt.sub(elbowAt).normalize(), knuckle.copy(wristAt).sub(elbowAt).normalize()));
        leg.knee.getWorldQuaternion(parentQ);
        leg.ankle.quaternion.copy(parentQ.invert()).multiply(handQ);
        leg.ankle.updateMatrixWorld(true);
      });
    } finally { this.obstacles = all; }
  }

  /**
   * One ball against every egg. If it is in any, `push` is set to the move that takes it out of the one it is
   * deepest in (straight out from that egg's middle, to the egg's surface grown by the ball's size and the gap),
   * and true is returned.
   */
  private pushOut(ball: THREE.Vector3, size: number): boolean {
    const grow = size + ARM_CLEAR.gap;
    let furthest = 0;
    for (const o of this.obstacles) {
      const egg = o.egg;
      inFit.copy(ball).applyMatrix4(o.toFit);
      // (where the ball is in the egg, each direction measured in the egg's own half-size there: under 1 is inside)
      const x = (inFit.x - egg.cx) / (egg.rx + grow), y = (inFit.y - egg.cy) / (egg.ry + grow), z = (inFit.z - egg.cz) / (egg.rz + grow);
      const depth = Math.hypot(x, y, z);
      if (depth >= 1) continue;
      // straight out from the egg's middle through the ball (dead centre: straight forward)
      if (depth < 1e-4) out.set(egg.cx, egg.cy, egg.cz + egg.rz + grow);
      else out.set(egg.cx + (inFit.x - egg.cx) / depth, egg.cy + (inFit.y - egg.cy) / depth, egg.cz + (inFit.z - egg.cz) / depth);
      out.applyMatrix4(o.fromFit).sub(ball);
      const far = out.length();
      if (far > furthest) { furthest = far; push.copy(out); }
    }
    return furthest > 0;
  }
}
