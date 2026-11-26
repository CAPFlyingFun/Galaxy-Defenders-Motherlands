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
// HER LOOKS AND HANDS (`SIT_LOOK`, `SIT_HANDS`; fastHeroine.ts): sitting down she glances over a shoulder (left or
// right at random) and down at the seat, her chest twisting a little, until her hips land, the hand on that side
// steadying her on the seat's edge; seated she looks ahead (on the long visit a glance or two round); 2.5 s before she
// gets up her head bows all the way down, held while she leans forward with one hand (at random) on the seat and the
// other on its thigh, and lifts as she rises.
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

/**
 * HER OWN LOOKS WHILE SHE SITS (Joshua, 2026-11-22, Blaze looking right as his example: "toilet 🚽 pops up, she looks
 * down and to the right looking at the toilet while feet stay locked looking until seated completely... before she gets
 * up, she looks down all the way, holds and then her head lifts up as she gets up"; "maybe 2.5s prior"; the idle glances
 * were my idea, his "I like all"). Her head is turned as for a kick (fastHeroine.ts), so first person the view does it;
 * turning the view frees her head until she is up. GAME TUNING.
 */
export const SIT_LOOK = Object.freeze({
  /** SITTING DOWN she glances over one shoulder (left or right at random) and down at the seat: her head this far round
   *  from the way her body faces, degrees, her chest twisting `twist` of it with her... */
  side: 95, twist: 15,
  /** ...turning there over the first `glanceIn` seconds, held until her hips land (SIT.seatedAt), then back to ahead as
   *  she sits back upright. */
  glanceIn: 0.5,
  /** Her head bowed down this long before she begins to get up, seconds, over `bowIn` seconds; held while she leans
   *  forward, lifted as she rises (with her hips). Bowed to look `bowDown` degrees below level, at the floor by her feet:
   *  seated upright that is as far as her neck goes, chin to chest; leaning forward her head stays on the floor (all the
   *  way down from her LEANING torso folded her head back at her own lap). */
  bowBefore: 2.5, bowIn: 0.6, bowDown: 72,
  /** SEATED, IDLE GLANCES: only with at least `glancesFrom` seconds seated before her head bows (the 12 s visit, not the
   *  5 s one): one, or two from `twoFrom`; each glides `glide` seconds to a spot, holds a while, glides back. */
  glancesFrom: 5, twoFrom: 8, glide: 0.8, holdLeast: 1.2, holdMost: 2, gapLeast: 0.6, gapMost: 1.4,
  /** AN OPEN SIT (v0.2.179: the mind's, at home, on a chair, the sofa or a toilet, for as long as it wants): a glance
   *  now and then for as long as it lasts, `openGapLeast`-`openGapMost` seconds apart. */
  openGapLeast: 5, openGapMost: 14,
  /** Where she glances: degrees round from the way she faces (+ her left), and up (+) or down (-) from level. */
  spots: [[50, -12], [-50, -12], [70, -25], [-70, -25], [0, -55], [22, 4], [-22, 4]] as ReadonlyArray<readonly [number, number]>,
});

/**
 * HER HANDS WHILE SHE SITS (Joshua: "make the hand stabilizing the direction she is looking"; "Getting up, she should
 * randomly place any hand on the seat next to her hip"; the other on its thigh, my idea, his "I like all"). GAME TUNING.
 */
export const SIT_HANDS = Object.freeze({
  /** SITTING DOWN: the hand on the side she looks to goes to the seat's edge beside her hip from here, seconds into
   *  sitting down, until here (her hips are down at SIT.seatedAt; it lets go as she sits back upright). */
  seatFrom: 0.8, seatUntil: 2.3,
  /** GETTING UP (seconds left of it: SIT.seconds is seated): a random hand on the seat beside her hip until here (her
   *  hips a few cm up); the other on its thigh, pressing, until here (about halfway up). */
  upSeatUntil: 1.5, upThighUntil: 1.0,
  /** Where on the seat: out from the middle under her hips, across her (the seat is narrower than her hips and thighs,
   *  so this is its outer edge beside her thigh, the palm part over it), ahead, metres. */
  seatOut: 0.215, seatAhead: 0.04,
  /** Where on the thigh: this far from her hip toward her knee (a share of her thigh), the palm this far above the bone
   *  (the top of her thigh), metres; her fingers turned in toward her middle by this much. */
  thighAlong: 0.62, thighTop: 0.075, fingersIn: 0.3,
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

/**
 * LYING DOWN ON A BED (v0.2.179; Joshua, 2026-11-26: "I want you to do the poses and animations as it's game specific and
 * don't need it in the main CCBS repo"): the game's own pose, laid over her sit (fastHeroine.ts `lieOn`). She sits on
 * the bed's edge as on any seat (SIT), then over `seconds` swings round to lie along it, her legs straightening out of
 * the sit, tipped back flat (`tip`), her hip joints carried onto the mattress. Getting up is the same backwards: she
 * sits up onto the edge, then gets up as from any seat. GAME TUNING.
 */
export const LIE = Object.freeze({
  /** lying back (or sitting up again), seconds */
  seconds: 2.5,
  /** flat on her back: a quarter turn back about her left */
  tip: Math.PI / 2,
  /** while lying, she is kept seated at least this long ahead (over SIT_LOOK.bowBefore: no bow while she lies) */
  holdSit: 4,
  /** sitting up again, she stays seated this long once up on the edge (her bow before she gets up, then up) */
  upAfter: 3,
  /** her hip joints lie this far over the mattress's top (the flesh of her seat and back under them), metres */
  hipsOverMattress: 0.1,
  /**
   * HER HEAD ON THE PILLOW: lying flat her head sank into it, so her back is laid this far short of flat (radians, 12
   * degrees: her head about 15 cm up, on the pillow), and this much of her sit is kept (its hips bent 90: 0.13 of it
   * bends them the same 12, so her thighs lie level, her knees a little bent, her hands resting on her thighs).
   * Until Joshua's own lying pose comes from the pose builder.
   */
  incline: 12 * Math.PI / 180,
  sitKept: 0.13,
});
