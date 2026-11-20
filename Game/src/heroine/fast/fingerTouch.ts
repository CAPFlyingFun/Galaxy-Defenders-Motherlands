// ============================================================================
// fingerTouch.ts -- HER FINGERS CLOSED ONTO WHAT SHE HOLDS, each one until it
// touches (Joshua, 2026-11-17: "gripping around a pole... each finger curling
// until it touches").
//
// What a hand holds is a SHAPE (a pole or a rail is a cylinder; the builder's
// own `GripShape`, actor/handGrip.ts). Once her arm has brought the hand there
// (handReach.ts), every finger and the thumb is closed onto it JOINT BY JOINT,
// as a real finger wraps: all its joints close together (as the builder bends
// them) until the nearest part of it touches; that first joint stays; the rest
// close on until they touch; and so on out to the tip. Each "until it touches"
// is the builder's `closeToTouch` (step out, then halve). A thick bar stops the
// fingers early, a thin one lets them close further: nothing is set by hand
// per bar.
//
// A finger is seen as a line of points (its joints, the middle of each of its
// bones, its tip), each the middle of a finger about 18 mm thick: a point
// "touches" when it is `pad` (half that) from the surface.
//
// It also says WHERE THE HAND MUST BE to hold a bar (`gripPose`): the palm
// laid on the bar, facing it, its fingers going round the way asked. The hand's
// own palm (which way it faces, which way the fingers run, where its middle
// is) is measured once from her own finger bones.
//
// The cost: about 20 tries a finger, each turning 3 bones; ten fingers. Only
// while a hand holds something (and while it lets go).
// ============================================================================
import * as THREE from 'three';
import { closeToTouch, shapeDistance, type GripShape } from '@charb/actor/handGrip';
import type { BodyMotion } from './bodyMotion';
import { PAD_FALLBACK, type HandPads } from './handPads';

/** GAME TUNING (metres, seconds). */
export const TOUCH = Object.freeze({
  /** Half a finger's thickness: a finger's middle line stops this far from what it holds. */
  pad: 0.009,
  /** ...and the thumb's half thickness, a little more (Joshua, 2026-11-18: the thumb cut into the pole). */
  thumbPad: 0.012,
  /**
   * The thumb may first open past straight by this much (percent): with the palm on a bar the straight thumb is often
   * already inside it, so it opens out, then closes until it rests on the bar's surface.
   */
  thumbOpen: 100,
  /** ...tried at so many places across its range; it "rests" when within this of the surface (metres); relaxed is here. */
  thumbSamples: 28,
  /** The thumbs-up: straight, opened this far out to the side (percent, below 0 opens). */
  thumbUp: -15,
  /** The palm's flesh: the palm's middle line is laid this far from the bar's surface. */
  palmThick: 0.016,
  /**
   * Where a bar lies across her hand, from the wrist toward the knuckles (0 the wrist, 1 the knuckles). A bar as thin
   * as a pole lies at the base of the fingers, as in a real grip (in the middle of the palm the fingers would close
   * beside it, not round it).
   */
  palmAlong: 0.95,
  /** How quickly the fingers close round (or open off) the bar once the hand is there. */
  seconds: 0.12,
  /**
   * A finger that meets nothing (it would close right round into a fist) stops here instead, 0..1 of a full close:
   * a relaxed curl (Joshua, 2026-11-18: "it still looks like it's closed fist most of the time").
   */
  missMost: 0.35,
  /** The hand counts as there once its reach is this far on (0..1). */
  arrivedFrom: 0.97,
  /** The search for the first touch: so many steps out, then halved so many times. */
  steps: 12,
  halvings: 6,
});

/** A hand's palm, measured in the hand bone's own space. */
interface PalmFrame {
  /** The middle of the palm (a point in the hand bone's space). */
  readonly point: THREE.Vector3;
  /** Three directions at right angles: along the fingers, across (little finger to index), and out of the palm. */
  readonly basis: THREE.Matrix4;
}

// scratch, made once
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
const wrist = new THREE.Vector3(), centre = new THREE.Vector3(), index = new THREE.Vector3(), little = new THREE.Vector3();
const thumbAt = new THREE.Vector3(), handQ = new THREE.Quaternion(), handS = new THREE.Vector3(), handT = new THREE.Vector3();
const world = new THREE.Matrix4(), rotation = new THREE.Matrix4(), q = new THREE.Quaternion(), offset = new THREE.Vector3();
const point: [number, number, number] = [0, 0, 0];

export class FingerTouch {
  /** What each hand holds now [left, right], or null. */
  readonly shapes: [GripShape | null, GripShape | null] = [null, null];
  /**
   * More room left between each hand's fingers and what they touch, metres (0: they rest on it). Her hand on her belly
   * (bellyTouch.ts) keeps 2 mm off her skin.
   */
  readonly gapMore: [number, number] = [0, 0];
  /**
   * HER FINGERS', THUMBS' AND PALMS' OWN THICKNESS, measured from her skin (handPads.ts; Joshua, 2026-11-20): each bone's
   * skin stands this far off its line. Null until measured: the old guesses (`PAD_FALLBACK`) serve.
   */
  pads: HandPads | null = null;
  /** A hand's palm flesh: from the middle of the palm to its skin, metres. */
  palmThick(hand: 0 | 1): number { return this.pads?.palm[hand] ?? PAD_FALLBACK.palm; }
  /** A hand's palm, for measuring: its middle, the way it faces and the line across it, in the world as she is now. */
  palmFace(hand: 0 | 1): { point: THREE.Vector3; out: THREE.Vector3; across: THREE.Vector3 } {
    const frame = this.palm(hand), bone = this.hands[hand];
    bone.updateWorldMatrix(true, false);
    const point = frame.point.clone().applyMatrix4(bone.matrixWorld);
    // (turned by the bone's turn alone, as the palm's directions were made: its world matrix also scales)
    const turn = bone.getWorldQuaternion(new THREE.Quaternion());
    const out = new THREE.Vector3().setFromMatrixColumn(frame.basis, 2).applyQuaternion(turn).normalize();
    const across = new THREE.Vector3().setFromMatrixColumn(frame.basis, 1).applyQuaternion(turn).normalize();
    return { point, out, across };
  }
  /**
   * Whether each hand KEEPS HOLD of its shape while it moves (a clip she carries): its fingers stay closed on it, and
   * do not open on the way as they do while the hand goes to take something.
   */
  readonly firm: [boolean, boolean] = [false, false];
  /** How far each hand's fingers are closed onto its shape, 0 (its own grip) .. 1 (touching): eased. */
  readonly amount: [number, number] = [0, 0];
  /** Each finger's joints' closures where they last touched, percent, from the knuckle out (kept while a hand lets go). */
  readonly touched: Float32Array[];
  /** Scratch: one finger's joints' closures, percent. */
  private readonly trying = new Float32Array(8);
  private readonly palms: (PalmFrame | null)[] = [null, null];
  /** Each hand's fingers, by number into `motion.fingers`. */
  private readonly ofHand: number[][] = [[], []];

  /**
   * @param motion  her motion (it owns her finger bones and how they bend)
   * @param hands   her two hand bones, left then right
   * @param root    her root (which side of her a hand is on)
   */
  constructor(private readonly motion: BodyMotion, private readonly hands: readonly [THREE.Object3D, THREE.Object3D], private readonly root: THREE.Object3D) {
    this.touched = motion.fingers.map((finger) => new Float32Array(finger.bones.length));
    motion.fingers.forEach((finger, i) => this.ofHand[finger.hand].push(i));
  }

  /**
   * WHERE HER HAND MUST BE TO HOLD A BAR: a pose for the hand bone (world). The middle of her palm on the bar's
   * surface at `at` (a point on its axis), facing it along `palmTo` (from the palm to the axis), the fingers running
   * round it toward `wrapToward` (of the bar's two ways round, the one nearer that direction).
   */
  gripPose(hand: 0 | 1, at: THREE.Vector3, axis: THREE.Vector3, palmTo: THREE.Vector3, wrapToward: THREE.Vector3, radius: number, out: THREE.Matrix4): THREE.Matrix4 {
    const palm = this.palm(hand);
    // the palm's facing, square to the bar
    p.copy(palmTo).addScaledVector(axis, -palmTo.dot(axis)).normalize();
    // across the hand runs along the bar, whichever way puts the fingers round toward `wrapToward`
    // (in the palm's own basis: along x across = out of the palm, so along = across x out)
    c.copy(axis).normalize();
    a.crossVectors(c, p);
    if (a.dot(wrapToward) < 0) { c.negate(); a.negate(); }
    world.makeBasis(a, c, p);
    // the turn that takes the palm's own directions onto these: world x (palm's own)^-1
    rotation.copy(palm.basis).transpose().premultiply(world);
    q.setFromRotationMatrix(rotation);
    // the palm's middle laid on the bar's surface (the hand bone is where it must be for that)
    this.hands[hand].matrixWorld.decompose(handT, handQ, handS);
    offset.copy(palm.point).multiply(handS).applyQuaternion(q);
    handT.copy(at).addScaledVector(p, -(radius + this.palmThick(hand))).sub(offset);
    return out.compose(handT, q, handS);
  }

  /**
   * One frame, after everything else has posed her (her fingers' own pose came from bodyMotion.ts: `base` is each
   * hand's grip, percent; `reached` how far each hand is on its way, 0..1).
   */
  apply(dt: number, base: readonly [number, number], reached: readonly [number, number]): void {
    const ease = 1 - Math.exp(-Math.max(0, dt) / TOUCH.seconds);
    for (const h of [0, 1] as const) {
      const shape = this.shapes[h];
      const wanted = shape && (this.firm[h] || reached[h] >= TOUCH.arrivedFrom) ? 1 : 0;
      this.amount[h] += (wanted - this.amount[h]) * ease;
      if (Math.abs(this.amount[h] - wanted) < 0.002) this.amount[h] = wanted;
      if (this.amount[h] <= 0) continue;
      this.hands[h].updateWorldMatrix(true, false);
      for (const i of this.ofHand[h]) {
        const finger = this.motion.fingers[i];
        // HOW FAR EACH JOINT CLOSES BEFORE IT TOUCHES (while she holds the bar; letting go, it opens from there)
        const touched = this.touched[i], n = touched.length;
        if (shape) {
          // (a hand laid flat on something, her belly, `gapMore`: her thumb lies along it as her fingers do, closing
          //  until it is off it by the same; round a bar it opens out and comes back to rest on the bar)
          const flat = this.gapMore[h] > 0;
          if (finger.thumb && !flat) this.restThumb(i, shape, touched);
          else touched.fill(0);
          for (let k = 0; k < (finger.thumb && !flat ? 0 : n); k++) {
            // joints k and out close together, from where they are, until the finger touches; then joint k stays
            const from = touched[k];
            const found = closeToTouch((closure) => {
              for (let j = 0; j < n; j++) this.trying[j] = j < k ? touched[j] : from + closure * (100 - from);
              return this.clearance(i, this.trying, shape, k);
            }, 1, 0.0015, TOUCH.steps, TOUCH.halvings);
            const at = from + found.closure * (100 - from);
            if (!found.touched) {
              // (nothing in the way: not a fist, a relaxed curl, no further than it had come)
              const relaxed = Math.max(from, TOUCH.missMost * 100);
              for (let j = k; j < n; j++) touched[j] = Math.min(at, relaxed);
              break;
            }
            for (let j = k; j < n; j++) touched[j] = at;
          }
        }
        for (let j = 0; j < n; j++) this.trying[j] = base[h] + (touched[j] - base[h]) * this.amount[h];
        this.motion.curlFingerJoints(i, this.trying);
        finger.bones[0].updateMatrixWorld(true);
      }
    }
  }

  /**
   * THE THUMB STANDS OUT TO THE SIDE, a thumbs-up, while the four fingers wrap over the bar (Joshua, 2026-11-18: "not
   * wrap underneath towards the palm like in a fist"): of its whole range, the place nearest `thumbUp` (straight, a
   * little opened) that does not go into the bar; if every place does, the least far in.
   */
  private restThumb(i: number, shape: GripShape, out: Float32Array): void {
    const n = out.length, samples = TOUCH.thumbSamples, least = -TOUCH.thumbOpen;
    let best = 0, bestScore = Infinity;
    for (let s = 0; s <= samples; s++) {
      const percent = least + (100 - least) * s / samples;
      for (let j = 0; j < n; j++) this.trying[j] = percent;
      // (from its second bone out: its first lies under the ball of her palm, where the bar sits against her palm)
      const clear = this.clearance(i, this.trying, shape, 1);
      // (clear of the bar, nearest the thumbs-up; in it worst, least far in)
      const score = clear < 0 ? 1000 - clear * 1000 : Math.abs(percent - TOUCH.thumbUp);
      if (score < bestScore) { bestScore = score; best = percent; }
    }
    out.fill(best);
  }

  /**
   * A finger with its joints closed so far (percent each): how far its nearest part is from the shape's surface,
   * metres. Only the part from joint `from` out is measured (the part before it already touches and stays put).
   */
  private clearance(i: number, percents: ArrayLike<number>, shape: GripShape, from: number): number {
    const finger = this.motion.fingers[i];
    this.motion.curlFingerJoints(i, percents);
    finger.bones[0].updateMatrixWorld(true);
    let nearest = Infinity;
    // (each joint past the knuckle, the tip, and the middle of every bone, less that bone's own pad: her skin's
    //  distance, not her bone's)
    const bones = finger.bones, pads = this.pads?.pad[i];
    for (let k = from; k < bones.length; k++) {
      bones[k].getWorldPosition(a);
      (k + 1 < bones.length ? bones[k + 1] : finger.tip).getWorldPosition(b);
      const pad = pads?.[k] ?? (finger.thumb ? TOUCH.thumbPad : TOUCH.pad);
      nearest = Math.min(nearest, this.distance(shape, c.copy(a).add(b).multiplyScalar(0.5)) - pad, this.distance(shape, b) - pad);
    }
    return nearest - this.gapMore[this.ofHand[0].includes(i) ? 0 : 1];
  }

  private distance(shape: GripShape, at: THREE.Vector3): number {
    point[0] = at.x; point[1] = at.y; point[2] = at.z;
    return shapeDistance(shape, point);
  }

  /** Which way a hand's fingers run, in the hand bone's own space (a direction). */
  fingersAlong(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3 { return out.setFromMatrixColumn(this.palm(hand).basis, 0); }

  /** The middle of a hand's palm where a bar lies across it, in the hand bone's own space. */
  palmPoint(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3 { return out.copy(this.palm(hand).point); }

  /**
   * A HAND LAID FLAT ON A SURFACE (her belly where the baby kicks: bellyTouch.ts): the pose her hand bone must have for
   * the middle of her palm to rest on `at`, her palm facing `palmTo` (into the surface), her fingers pointing along
   * `fingers` as near as the surface lets them.
   */
  flatPose(hand: 0 | 1, at: THREE.Vector3, palmTo: THREE.Vector3, fingers: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
    const palm = this.palm(hand);
    // (the palm's own basis: x along the fingers, y across the hand, z out of the palm, with x = y cross z)
    p.copy(palmTo).normalize();
    a.copy(fingers).addScaledVector(p, -fingers.dot(p)).normalize();
    c.crossVectors(p, a);
    world.makeBasis(a, c, p);
    rotation.copy(palm.basis).transpose().premultiply(world);
    q.setFromRotationMatrix(rotation);
    this.hands[hand].matrixWorld.decompose(handT, handQ, handS);
    offset.copy(palm.point).multiply(handS).applyQuaternion(q);
    handT.copy(at).addScaledVector(p, -this.palmThick(hand)).sub(offset);
    return out.compose(handT, q, handS);
  }

  /** A hand's palm, measured from her finger bones the first time it is asked for (it does not change). */
  private palm(h: 0 | 1): PalmFrame {
    const known = this.palms[h];
    if (known) return known;
    const hand = this.hands[h];
    hand.updateWorldMatrix(true, true);
    hand.getWorldPosition(wrist);
    // the knuckles: the thumb's apart; the others in a row, index nearest the thumb, little finger furthest
    const knuckles: THREE.Vector3[] = [];
    for (const i of this.ofHand[h]) {
      const finger = this.motion.fingers[i];
      const at = finger.bones[0].getWorldPosition(new THREE.Vector3());
      if (finger.thumb) thumbAt.copy(at); else knuckles.push(at);
    }
    knuckles.sort((x, y) => x.distanceTo(thumbAt) - y.distanceTo(thumbAt));
    index.copy(knuckles[0]); little.copy(knuckles[knuckles.length - 1]);
    centre.set(0, 0, 0);
    for (const k of knuckles) centre.add(k);
    centre.multiplyScalar(1 / knuckles.length);
    // WHICH WAY THE PALM FACES, measured, not worked out (Joshua, 2026-11-18: a palm read the wrong way round twisted
    // her wrist 180 degrees): her fingers are curled for a moment, and the palm faces the way their tips go.
    a.copy(centre).sub(wrist).normalize();
    c.copy(index).sub(little);
    const out = new THREE.Vector3().crossVectors(a, c).normalize();
    const curledTo = new THREE.Vector3();
    for (const i of this.ofHand[h]) {
      const finger = this.motion.fingers[i];
      if (finger.thumb) continue;
      this.motion.curlFinger(i, 90);
      finger.bones[0].updateMatrixWorld(true);
      curledTo.add(finger.tip.getWorldPosition(b)).sub(finger.bones[0].getWorldPosition(p));
    }
    if (curledTo.dot(out) < 0) out.negate();
    // (her fingers go back to her own pose on the next frame: bodyMotion.ts sets them every frame)
    // into the hand bone's own space (directions only: its turn undone)
    hand.getWorldQuaternion(handQ).invert();
    a.applyQuaternion(handQ);
    c.applyQuaternion(handQ);
    out.applyQuaternion(handQ);
    // square them: along; across (made square to along); out of the palm, which is along x across or its opposite
    c.addScaledVector(a, -c.dot(a)).normalize();
    p.crossVectors(a, c);
    if (p.dot(out) < 0) c.negate();
    p.crossVectors(a, c);
    const basis = new THREE.Matrix4().makeBasis(a.clone(), c.clone(), p.clone());
    const palmPoint = hand.worldToLocal(b.copy(wrist).lerp(centre, TOUCH.palmAlong));
    const frame: PalmFrame = { point: palmPoint.clone(), basis };
    this.palms[h] = frame;
    return frame;
  }
}
