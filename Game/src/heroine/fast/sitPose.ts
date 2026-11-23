// ============================================================================
// sitPose.ts -- sitting down on a seat and getting up again (the pop-up toilet first: src/world/toilet.ts).
//
// Joshua, 2026-11-22: "can you create a procedural toilet 🚽 that pops up just behind where either one are standing,
// and then can test the sitting pose and make sure that's good? Don't need any animations right now except getting up
// and down to test it works". Then his reference, a sit-to-stand diagram ("works the same in reverse to like sitting
// down 🪑 on a chair/toilet"): (a) sitting upright, (b) leaning forward on the seat with the feet drawn back under the
// knees, (c) the hips lifting off with the body leaning well forward, straightening as the knees straighten, (d)
// standing. His numbers: "make the first part 1s long... increase it to 3s total"; "make sure the feet are 0.6m
// apart"; the feet drawn back, yes; "fix his hands as well" (John's).
//
// THE POSE IS THE BUILDER'S OWN SIT (Char_B/src/actor/humanSeated.ts `poseSeated`, style 'sit', the PREGNANT posture in
// its SETTLED form, as her room sits her v2 body: torso upright, hips a little open, room between her thighs for her
// belly and the knees parting further as it grows, hands resting on her thighs). John sits the same way without a
// belly (the builder's plain sit held his hands out in front of him, as at a desk). It is laid over the standing pose
// by how far down the hips are (bodyMotion.ts `overlay`).
//
// A POSE BENDS JOINTS, IT DOES NOT MOVE HER (the builder's rule, humanSeated.ts "the chair does the rest"): her hips
// stay where they are and her legs swing forward under them. Her feet system (footGround.ts `seat`) does the rest: her
// body goes DOWN as far as her pose has lifted her ankles and BACK as far as it has swung them forward, so her feet
// stay planted and her hips come down onto the seat behind her.
//
// SITTING DOWN, 3 s (`SIT`, `sitPhase`; getting up is exactly the same backwards):
//   0.0-0.6 s  her feet step apart, left then right, to SIT.feetApart (0.6 m, middle to middle)
//   0.2-2.0 s  her hips go down and back onto the seat, her body leaning forward over her feet as they go (most, 40
//              degrees, as her hips reach the seat): (c) backwards. Her feet are DRAWN BACK under her knees all the
//              while (SIT.tuck behind where her seated pose would put them): her feet carry her weight until she sits.
//   2.0-3.0 s  seated, she sits back upright and her feet slide forward to rest: (b) backwards, then (a).
// So getting up: 1 s leaning forward with her feet drawn back, 2 s rising, her feet stepping back together at the end.
// HER LEAN IS AT HER HIPS (her pelvis tipped about her hip joints, her thighs kept where they are), her back straight
// and her head up, looking ahead; a little of it in her lower back.
//
// WHERE THE SEAT GOES (`seatShape`): the same sit worked out on her bones without drawing (the builder's
// `posedJoints`), says how high her hips come to rest above her feet and how far behind them: so the toilet is made
// for HER (Blaze's long legs sit higher than a short body would) and is put exactly under her hips.
// ============================================================================
import { poseSeated, posedJoints } from '@charb/actor/humanSeated';
import type { BindJoint, HumanMeasure, JointTurn, MutableJointTurn } from '@charb/actor/humanRig';

/** GAME TUNING (Joshua's numbers and his reference diagram, 2026-11-22; see the header). */
export const SIT = Object.freeze({
  /** Sitting down, standing to seated and settled, seconds; getting up takes the same, backwards. */
  seconds: 3,
  /** Her hips go down onto the seat from here to `seatedAt`, seconds into sitting down. */
  hipsFrom: 0.2,
  /** ...reaching it here; the rest (to `seconds`) she sits back upright and her feet slide forward to rest. */
  seatedAt: 2,
  /** Her feet step apart, one after the other, each over this many seconds, from the start. */
  stepSeconds: 0.3,
  /** ...lifted this high on the way, metres. */
  stepHeight: 0.06,
  /** Seated, her feet this far apart, middle to middle, metres (Joshua: 0.6). */
  feetApart: 0.6,
  /** Her feet drawn back under her knees until she sits back, metres behind where her seated pose rests them. */
  tuck: 0.12,
  /** Her body's lean forward as her hips reach the seat (or leave it), degrees. */
  leanMost: 40,
  /** How her lean is shared: most at her hips, a little in her lower back and chest; her head is turned back up by
   *  `headUp` of it, so she looks ahead (a little down), not at the floor (0.6 left her head bowed). */
  atHips: 0.7, atSpine: 0.2, atChest: 0.1, headUp: 0.85,
  /**
   * From her hip joints down to the seat she sits on, metres: the flesh of her buttocks under them, pressed a little.
   * (The builder's room puts her hips 0.1 above its stool's top.)
   */
  pad: 0.1,
});

/** Where she is in sitting down (`sitPhase`), each part 0..1 unless said. */
export interface SitPhase {
  /** How far down her hips are (her seated pose's share). */
  legs: number;
  /** Her lean forward, radians. */
  lean: number;
  /** How far each foot (left, right) has stepped out to SIT.feetApart. */
  readonly apart: [number, number];
  /** How high each foot is lifted for its step, metres. */
  readonly lift: [number, number];
  /** How far her feet have slid forward from drawn back to rest, metres (0 .. SIT.tuck). */
  ahead: number;
}

const DEG = Math.PI / 180;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (t: number): number => { const s = clamp01(t); return s * s * (3 - 2 * s); };

/** Her phase `seconds` into sitting down (0 standing .. SIT.seconds seated and settled), into `out`. */
export function sitPhase(seconds: number, out: SitPhase): SitPhase {
  const t = Math.max(0, Math.min(SIT.seconds, seconds));
  out.legs = smooth((t - SIT.hipsFrom) / (SIT.seatedAt - SIT.hipsFrom));
  // (her lean grows as her hips go down, most as they reach the seat; then she sits back upright)
  const leanMost = SIT.leanMost * DEG;
  out.lean = t < SIT.seatedAt ? leanMost * Math.sin(out.legs * Math.PI / 2) : leanMost * (1 - smooth((t - SIT.seatedAt) / (SIT.seconds - SIT.seatedAt)));
  // (her left foot steps out first, then her right; each lifted in an arc on the way)
  for (let side = 0; side < 2; side++) {
    const s = (t - side * SIT.stepSeconds) / SIT.stepSeconds;
    out.apart[side] = smooth(s);
    out.lift[side] = s > 0 && s < 1 ? SIT.stepHeight * Math.sin(Math.PI * s) : 0;
  }
  out.ahead = t < SIT.seatedAt ? 0 : SIT.tuck * smooth((t - SIT.seatedAt) / (SIT.seconds - SIT.seatedAt));
  return out;
}

/** Her sit, the builder's settled pregnant sit (see the header): `belly` her belly 0..200 % (John: 0). */
export function seatedTurns(measure: HumanMeasure, bind: readonly BindJoint[], belly: number, out: MutableJointTurn[]): readonly JointTurn[] {
  // (seconds 0: the builder's sit breathes through her chest, and her own breathing is already on her: once is enough)
  return poseSeated(measure, bind, { style: 'sit', seconds: 0, posture: 'pregnant', bump: Math.max(0, belly) / 100, settled: true }, out);
}

/** Where her hips come to rest when she sits, from her own bones (see the header). */
export interface SeatShape {
  /** Her hip joints above her ankles, seated, metres. */
  readonly hipsAboveAnkles: number;
  /** Her ankles in front of her hip joints, seated and settled, metres (along the way she faces). */
  readonly anklesAhead: number;
}

/**
 * Her sit worked out on her bind (no drawing): how high above her ankles her hips are and how far in front of them her
 * ankles are. `metresPerUnit` turns the bind's own units into metres. In the bind's frame her forward is +Z (the
 * builder's sign rules: a thigh along -Y swings FORWARD, to +Z, by Rx(-angle)).
 */
export function seatShape(measure: HumanMeasure, bind: readonly BindJoint[], belly: number, metresPerUnit: number): SeatShape {
  const turns = seatedTurns(measure, bind, belly, []);
  const at = posedJoints(bind, turns), j = measure.joints;
  const mid = (a: number, b: number, k: 0 | 1 | 2): number => (at[a][k] + at[b][k]) / 2;
  const hipsY = mid(j.hipL, j.hipR, 1), hipsZ = mid(j.hipL, j.hipR, 2);
  const anklesY = mid(j.ankleL, j.ankleR, 1), anklesZ = mid(j.ankleL, j.ankleR, 2);
  return { hipsAboveAnkles: (hipsY - anklesY) * metresPerUnit, anklesAhead: (anklesZ - hipsZ) * metresPerUnit };
}
