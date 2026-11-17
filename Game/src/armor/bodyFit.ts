// ============================================================================
// bodyFit.ts -- how the armor FITS the real body: the shapes of the answers.
//
// The numbers themselves are in bodyFitData.ts. They are MEASURED from the
// Character Builder's body (sarah-v2-body-slim.glb) by the armor lab
// (lab/measure.ts: open armor-lab.html?measure=1), not typed in by hand:
//
//   * SLOTS. For each place a rigid piece goes ("head", "forearmL"...): the
//     bone it rides on, and where the piece's own frame sits inside that bone
//     (an offset, a turn and a scale). Parent the piece to the bone, copy the
//     three in, and it is on her. `attachRigidArmor` does exactly that.
//
//   * HER SIZES. How thick her forearm, shin and thigh are all the way down
//     and all the way round; how big her head, shoulders, feet and hands are.
//     The piece builders read these, so a shin guard is built 5 mm outside
//     her actual shin, not round a guessed cylinder.
//
// If the body file is ever re-made with different proportions, measure again
// and replace bodyFitData.ts; no piece has to be re-fitted by hand.
// ============================================================================

/** The places a rigid piece can be attached. */
export type ArmorSlot =
  | 'head'
  | 'shoulderL' | 'shoulderR'
  | 'forearmL' | 'forearmR'
  | 'kneeL' | 'kneeR'
  | 'shinL' | 'shinR'
  | 'footL' | 'footR'
  | 'hipL' | 'hipR'       // on the PELVIS bone, at the side of each hip (belts, pouches, discs)
  | 'thighL' | 'thighR'   // on the THIGH bone (a holster that swings with the leg)
  | 'gunL' | 'gunR';

export const ARMOR_SLOTS: readonly ArmorSlot[] = [
  'head', 'shoulderL', 'shoulderR', 'forearmL', 'forearmR', 'kneeL', 'kneeR', 'shinL', 'shinR',
  'footL', 'footR', 'hipL', 'hipR', 'thighL', 'thighR', 'gunL', 'gunR',
];

/** Where one slot's frame sits: which bone, and the frame's place inside that bone. */
export interface SlotFit {
  /** The bone's name in the body file (her bones are only numbered). */
  readonly bone: string;
  /** What that bone is, in words (the builder's own joint name). */
  readonly joint: string;
  /** The piece's place in the bone's own space: offset (in the bone's units), turn (a quaternion x, y, z, w), scale. */
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: number;
}

/**
 * How thick a limb is: its radius at stations down its length and at directions round it.
 * Row i is at height `y0 - i * dy` in the slot's frame (y = 0 is the joint, the limb runs toward -y).
 * Column k is at angle `k * 2pi / columns` round the limb: 0 = straight ahead (+z), a quarter turn = the outer side (+x).
 */
export interface LimbProfile {
  readonly y0: number;
  readonly dy: number;
  readonly rows: ReadonlyArray<ReadonlyArray<number>>;
}

/**
 * How far her skin reaches from a centre point, direction by direction (used for her shoulder).
 * Row j is at elevation `-90 + j * 180 / (rows - 1)` degrees (straight down to straight up);
 * column k is at angle `k * 360 / columns` round the upright axis (0 = +z, a quarter turn = +x).
 */
export interface PolarMap {
  readonly center: readonly [number, number, number];
  readonly rows: ReadonlyArray<ReadonlyArray<number>>;
}

/** A box: its low and high corner. */
export interface Extent { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }

/** One slice across her (heeled) foot, at distance z ahead of her ankle. */
export interface FootSlice { readonly z: number; readonly xMin: number; readonly xMax: number; readonly yMin: number; readonly yMax: number }

export interface BodyFit {
  /** The file this was measured from. */
  readonly source: string;
  /** Her height standing flat, metres. */
  readonly height: number;
  /** HEELS: how far each foot is pitched toes-down about the ankle (and the toes back up), radians. The game's body must pose her feet the same. */
  readonly heelPitch: number;
  /** How far her lowest point is held above the floor: the thickness of the boot's sole under the ball of her foot. */
  readonly soleLift: number;
  /** How high her ankle joint is above the floor in that pose. */
  readonly ankleHeight: number;
  readonly slots: Readonly<Record<ArmorSlot, SlotFit>>;
  /** Her head, in the head slot's frame: its box above the chin, the chin's height, and the neck's radius. */
  readonly head: { readonly box: Extent; readonly chinY: number; readonly neckRadius: number };
  /** Her left shoulder in its slot's frame: how far her skin reaches up, out, forward and back near the joint. */
  readonly shoulder: Extent;
  /** ...and the same shoulder as a map: how far her skin reaches in every direction from a point just under the joint. */
  readonly shoulderMap: PolarMap;
  /** Her left forearm (frame at the elbow), shin (frame at the knee: it also covers the knee and just above it) and thigh (frame at the hip). */
  readonly forearm: LimbProfile;
  readonly shin: LimbProfile;
  readonly thigh: LimbProfile;
  /** Her left foot, posed for heels, in the foot slot's frame (level with the floor): slices from heel to toe. */
  readonly foot: ReadonlyArray<FootSlice>;
  /** Her leg just above that ankle (from the ankle to 8.5 cm above it), as a box in the foot slot's frame: what the boot's collar goes round. */
  readonly footCollar: Extent;
  /** Her left hand in the gun slot's frame: its box, and the middle of her palm. */
  readonly hand: { readonly box: Extent; readonly palm: readonly [number, number, number] };
  /**
   * The side of her left hip in the hipL slot's frame: how far OUT (x) her skin reaches in each 2 cm cell of
   * height (rows, from y0 downward) and depth (columns, from z0 forward), the largest over bellies of 0 to 200 %.
   */
  readonly hipSide: { readonly y0: number; readonly z0: number; readonly step: number; readonly rows: ReadonlyArray<ReadonlyArray<number>> };
}

/** A limb's radius at height y and angle a (radians; 0 = front, quarter turn = outer side), read between the measured points. */
export function limbRadius(p: LimbProfile, y: number, a: number): number {
  const rows = p.rows.length, cols = p.rows[0].length;
  const fr = Math.min(rows - 1, Math.max(0, (p.y0 - y) / p.dy));
  const r0 = Math.floor(fr), r1 = Math.min(rows - 1, r0 + 1), tr = fr - r0;
  const turn = Math.PI * 2;
  const fc = ((((a % turn) + turn) % turn) / turn) * cols;
  const c0 = Math.floor(fc) % cols, c1 = (c0 + 1) % cols, tc = fc - Math.floor(fc);
  const top = p.rows[r0][c0] * (1 - tc) + p.rows[r0][c1] * tc, bot = p.rows[r1][c0] * (1 - tc) + p.rows[r1][c1] * tc;
  return top * (1 - tr) + bot * tr;
}

/** How far her skin reaches from a polar map's centre in direction (x, y, z) (need not be unit length). */
export function polarRadius(map: PolarMap, x: number, y: number, z: number): number {
  const rows = map.rows.length, cols = map.rows[0].length, len = Math.hypot(x, y, z) || 1;
  const el = Math.asin(Math.min(1, Math.max(-1, y / len))), turn = Math.PI * 2;
  const fr = ((el + Math.PI / 2) / Math.PI) * (rows - 1), r0 = Math.min(rows - 2, Math.floor(fr)), tr = fr - r0;
  const a = Math.atan2(x, z), fc = ((((a % turn) + turn) % turn) / turn) * cols;
  const c0 = Math.floor(fc) % cols, c1 = (c0 + 1) % cols, tc = fc - Math.floor(fc);
  const lo = map.rows[r0][c0] * (1 - tc) + map.rows[r0][c1] * tc, hi = map.rows[r0 + 1][c0] * (1 - tc) + map.rows[r0 + 1][c1] * tc;
  return lo * (1 - tr) + hi * tr;
}

/** How far out her hip's side reaches at height y, depth z (hipL slot frame). */
export function hipSideX(fit: BodyFit, y: number, z: number): number {
  const h = fit.hipSide, rows = h.rows.length, cols = h.rows[0].length;
  const fr = Math.min(rows - 1, Math.max(0, (h.y0 - y) / h.step)), fc = Math.min(cols - 1, Math.max(0, (z - h.z0) / h.step));
  const r0 = Math.min(rows - 2, Math.floor(fr)), c0 = Math.min(cols - 2, Math.floor(fc)), tr = fr - r0, tc = fc - c0;
  const top = h.rows[r0][c0] * (1 - tc) + h.rows[r0][c0 + 1] * tc, bot = h.rows[r0 + 1][c0] * (1 - tc) + h.rows[r0 + 1][c0 + 1] * tc;
  return top * (1 - tr) + bot * tr;
}

/** A foot slice at distance z ahead of the ankle, read between the measured slices. */
export function footSlice(fit: BodyFit, z: number): FootSlice {
  const f = fit.foot;
  if (z <= f[0].z) return f[0];
  if (z >= f[f.length - 1].z) return f[f.length - 1];
  const step = f[1].z - f[0].z, k = Math.floor((z - f[0].z) / step), t = (z - f[k].z) / step, a = f[k], b = f[Math.min(f.length - 1, k + 1)];
  const mix = (p: number, q: number) => p + (q - p) * t;
  return { z, xMin: mix(a.xMin, b.xMin), xMax: mix(a.xMax, b.xMax), yMin: mix(a.yMin, b.yMin), yMax: mix(a.yMax, b.yMax) };
}
