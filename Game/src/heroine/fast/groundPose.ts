// ============================================================================
// groundPose.ts -- CROUCHING, CRAWLING ON HER BELLY, AND ON ALL FOURS
// (Joshua, 2026-11-20: "Walk while crouch, crawling on belly (however, once
// pregnancy is on, make her crawl on all four with weapons holstered)";
// "Separate CROUCH and PRONE buttons"; "Whenever Pregnancy is on"; "On her
// belly, can she aim and fire propped on her elbows while still. While
// pregnant and not moving on all fours can pull out one if needed (keep 3
// contact points to ground), but has to holster it before moving").
//
// The Character Builder has no crouch and no crawl, so these are the game's,
// written the way the builder writes its walk: each joint's turn from her bind
// pose (the T she was made in), as an axis and an angle in that pose's own
// frame (Char_B humanRig.ts JointTurn), so they fit any body.
//
// HER STANCES (`Stance`):
//   STAND   as before.
//   CROUCH  her hips drop (`crouchDrop`, a share of her leg) and her feet stay
//           planted (footGround.ts bends her knees to them), her back leans
//           forward; she walks only, slower (`crouchSpeed`). She can aim and fire.
//   PRONE   (not pregnant) flat on her belly, propped on her elbows, her head
//           up to look ahead. Moving, the ARMY CRAWL: one elbow reaches ahead
//           as the opposite knee is drawn up beside her, then the other pair.
//           Still, she can aim and fire from her elbows.
//   FOURS   (pregnant) on her hands and knees, her belly clear of the ground,
//           her back about level. Moving, the diagonal crawl: her left hand and
//           right knee go forward together, then the other two. Her guns are
//           holstered; still, she can draw ONE (the other hand and both knees
//           stay down) and must holster it before she moves on.
//
// HOW SHE LIES DOWN: her whole body is TIPPED forward about her hips (`pitch`,
// set on the group that carries her model: fastHeroine.ts `fit`), lowered so her
// hips are at the height the stance has them, and posed in her own frame as if
// standing: "arms forward 111 degrees" is her elbows on the ground ahead of her
// once she lies down. Getting down and up is eased (`downSeconds`, `upSeconds`)
// from her crouch: knees first, then forward onto her elbows or hands.
// ============================================================================
import type { BindJoint, HumanMeasure, MutableJointTurn } from '@charb/actor/humanRig';

const DEG = Math.PI / 180;

export type Stance = 'stand' | 'crouch' | 'prone' | 'fours';

/**
 * WINDED (Joshua, 2026-11-20: "when she is winded, she bends her torso forward about 35 degrees, bends her knees a little
 * bit, and places both hands (free or holding something small like a gun) just above her knees"; fastHeroine.ts): the
 * pose she holds while out of breath (input/pace.ts: until her breathing is down to 28 a minute, 5-20 s), then she stands up over 1.5 s and can go again.
 * GAME TUNING, to tune by eye.
 */
export const WINDED = {
  /** How far she bends forward, degrees (most of it at her hips, the rest up her back: lowerBody.ts, as any bend). */
  lean: 40,
  /** ...and at most, leaning in a little more if her hands still fall short of her knees, degrees (never her hips forward). */
  leanMost: 50,
  /** How far her hips come down, a share of her leg's length (her knees bend to keep her feet on the ground). */
  drop: 0.36,
  /** Where her palms rest: this far up her thigh from her knee, metres, and on its front. */
  aboveKnee: 0.07,
  /** How far in toward her middle her fingers point down her thighs (0 straight down them). */
  fingersIn: 0.45,
  // (HER HEAD BOWED AS FAR AS IT GOES ON HER BENT BACK: her neck's own reach down from her torso's line,
  //  fastHeroine.ts `HEAD_DOWN_MOST`; first person the camera is her head, so the view goes with it)
  /** Her thigh's front, from its bone, just above her knee, metres (her palm rests on it). */
  thighFront: 0.06,
} as const;

/** Everything about her stances that is a choice. GAME TUNING, to tune by eye. */
export const STANCE = {
  /** Crouching: how far her hips drop, as a share of her leg, and how far her back leans forward (degrees). */
  crouchDrop: 0.36,
  crouchLean: 24,
  /** Seconds to crouch (and to stand up from a crouch). */
  crouchSeconds: 0.45,
  /**
   * Seconds to get down from a crouch onto her hands and knees, and onto her belly (through kneeling and all fours:
   * `downSteps`), and to get back up to a crouch (the same steps backward). (Was 1.0 and 1.2 for both, blended
   * straight across; with real steps a little longer.)
   */
  downSeconds: { fours: 1.7, prone: 2.2 },
  upSeconds: { fours: 1.8, prone: 2.3 },
  /**
   * NEVER UNDER THE GROUND (Joshua, 2026-11-21): getting down or up, if a knee, ankle, toe, hand, elbow or her head would go
   * below the ground, her whole body is lifted until it does not. How far each joint's middle sits above the ground
   * when it rests on it, metres (the flesh round the joint).
   */
  groundPad: { knee: 0.05, ankle: 0.05, toe: 0.045, wrist: 0.03, elbow: 0.04, head: 0.1, pelvis: 0.08 },
  /** Her top speeds, metres a second: crouch-walking, crawling on her belly, on all fours. */
  crouchSpeed: 0.9,
  proneSpeed: 0.35,
  foursSpeed: 0.55,
  /** Metres covered by one whole crawl cycle (both elbows or both hands once). */
  proneStride: 0.6,
  foursStride: 0.55,
  /** Her hips' height over the ground lying on her belly, metres. */
  proneHips: 0.13,
  /**
   * Her chest raised on her elbows, degrees: her whole body lies tipped this much short of flat about her hips (her
   * legs turned back at the hip by as much, so they still lie along the ground), and her back arched a little more.
   */
  proneRaise: 10,
  proneArch: 8,
  /** Her legs turned back at the hip lying down, degrees (measured: this lays them along the ground at that raise). */
  proneLegsBack: 3,
  /** Her upper arms forward from hanging, lying down (degrees: about straight down to her elbows), and her elbows' bend. */
  proneArmForward: 86,
  proneElbow: 70,
  /** Her head raised to look ahead, degrees, lying down and on all fours. */
  proneHeadUp: 55,
  foursHeadUp: 45,
} as const;

/** Her measured lengths, metres (from her own bones, as she stands: fastHeroine.ts). */
export interface BodySizes {
  /** hip joint to knee, knee to ankle */
  thigh: number;
  shin: number;
  /** shoulder joint to wrist, and on to the middle of her hand */
  arm: number;
  /** her hips' height and her shoulders' height as she stands, over the floor */
  hipHeight: number;
  shoulderHeight: number;
}

/**
 * HER POSE IN A STANCE, as turns from her bind pose (`out`, 17 of them), for this moment of her crawl (`phase`, 0..1)
 * and how much she is crawling (`move`, 0 still .. 1 going). `carry` is her belly (0 none .. 1 full term): on all fours
 * her knees go wider round it.
 */
export function stanceTurns(
  kind: 'prone' | 'fours', phase: number, move: number, carry: number, tip: number,
  measure: HumanMeasure, bind: readonly BindJoint[], out: MutableJointTurn[],
): MutableJointTurn[] {
  while (out.length < 17) out.push({ joint: -1, ax: 0, ay: 1, az: 0, radians: 0 });
  const j = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  const wave = (offset: number): number => Math.cos(2 * Math.PI * (phase + offset));
  // (a limb lifts while it comes forward: the half of its cycle where it moves ahead)
  const liftOf = (offset: number): number => Math.max(0, -Math.sin(2 * Math.PI * (phase + offset))) * move;
  let n = 0;
  const put = (joint: number, ax: number, ay: number, az: number, radians: number): void => {
    const t = out[n++]; t.joint = joint; t.ax = ax; t.ay = ay; t.az = az; t.radians = radians;
  };
  // her pelvis as she was made (her gait's own sway left out)
  put(j.pelvis, 0, 1, 0, 0);
  if (kind === 'prone') {
    // HER BACK ARCHED to raise her chest on her elbows, and her head up to look ahead
    const arch = STANCE.proneArch * DEG;
    putXZ(put, j.spine, -arch * 0.55, 0);
    putXZ(put, j.chest, -arch * 0.45, 0);
    // (all of it at her neck: the builder's `head` joint is the tip of her crown, which carries nothing)
    putXZ(put, j.neck, -(STANCE.proneHeadUp - STANCE.proneRaise) * DEG, 0);
    // HER ARMS: elbows on the ground ahead of her shoulders, forearms along the ground; crawling, each elbow reaches
    // further ahead in turn (the left half a cycle from the right)
    for (const side of [0, 1] as const) {
      const xSign = side === 0 ? left : -left, offset = side === 0 ? 0 : 0.5;
      const reach = wave(offset) * move, lift = liftOf(offset);
      arm(put, bind, side === 0 ? j.shoulderL : j.shoulderR, side === 0 ? j.elbowL : j.elbowR, side === 0 ? j.wristL : j.wristR, xSign,
        (STANCE.proneArmForward + 14 * reach + 8 * lift) * DEG, (STANCE.proneElbow - 10 * reach + 10 * lift) * DEG, 10 * DEG);
    }
    // HER LEGS: straight out behind her, a little apart, toes pointed; crawling, the knee opposite the reaching elbow
    // is drawn up beside her (her thigh out to the side, turned out so her shin lies along the ground)
    for (const side of [0, 1] as const) {
      const s = side === 0 ? left : -left, offset = side === 0 ? 0.5 : 0;
      const draw = Math.max(0, wave(offset)) * move;
      leg(put, side === 0 ? j.hipL : j.hipR, side === 0 ? j.kneeL : j.kneeR, side === 0 ? j.ankleL : j.ankleR, s,
        (-STANCE.proneLegsBack + 22 * draw) * DEG, (8 + 38 * draw) * DEG, (70 * draw) * DEG, (6 + 80 * draw) * DEG, (60 - 30 * draw) * DEG);
    }
  } else {
    // ON ALL FOURS: her thighs and arms straight down under her once she is tipped forward by `tip` (`tipOf`), her
    // shins along the ground behind her knees, her head up to look ahead
    putXZ(put, j.spine, 0, 0);
    putXZ(put, j.chest, 0, 0);
    putXZ(put, j.neck, -STANCE.foursHeadUp * DEG, 0);
    // (her knees wider apart round her belly)
    const wide = (8 + 10 * Math.min(2, Math.max(0, carry))) * DEG;
    for (const side of [0, 1] as const) {
      const xSign = side === 0 ? left : -left;
      // the diagonal crawl: her left hand with her right knee
      const offset = side === 0 ? 0 : 0.5;
      const swing = wave(offset) * move, lift = liftOf(offset);
      arm(put, bind, side === 0 ? j.shoulderL : j.shoulderR, side === 0 ? j.elbowL : j.elbowR, side === 0 ? j.wristL : j.wristR, xSign,
        tip + 12 * DEG * swing, (4 + 26 * lift) * DEG, 0, 1 - 0.5 * lift);
    }
    for (const side of [0, 1] as const) {
      const s = side === 0 ? left : -left, offset = side === 0 ? 0.5 : 0;
      const swing = wave(offset) * move, lift = liftOf(offset);
      leg(put, side === 0 ? j.hipL : j.hipR, side === 0 ? j.kneeL : j.kneeR, side === 0 ? j.ankleL : j.ankleR, s,
        tip + 12 * DEG * swing + 6 * DEG * lift, wide, 0, (90 + 14 * lift) * DEG, 50 * DEG);
    }
  }
  out.length = n;
  return out;
}

/**
 * GETTING DOWN, STEP BY STEP (Joshua, 2026-11-21: "a more realistic transition from standing to crawling without the body
 * sinking underground"; then, his marked pictures of v0.2.118: "still cuts in a bit, what about going the standing to
 * kneeling (one knee to both) then crawl?"). As a person gets down:
 *   1. ONE KNEE: from her crouch her right leg goes back and its knee down to the ground, its toes tucked under (heel up,
 *      the ball of the foot on the ground); her left foot stays flat in front, that knee up, shin straight up; her body
 *      upright, her hands on her front thigh.
 *   2. BOTH KNEES: her front knee comes down beside the other, both shins back along the ground, toes still tucked under.
 *   3. ALL FOURS: her hands go forward to the ground.
 *   4. PRONE (not pregnant): from all fours she lowers onto her elbows.
 * (v0.2.118 went from the crouch straight to both knees with her feet pointed: while her knees were still in the air her
 * toes pointed down into the floor. Tucked toes never point down.)
 */
export const KNEEL = {
  /** Her body's forward lean kneeling, degrees (her thighs kept straight down under it). */
  lean: 10,
  /** A kneeling knee's bend (its shin back along the ground, rising about 10 degrees to the ankle, held up by the tucked
   * toes), degrees. (86 left the ankle lower than the knee and the toes pointing into the floor.) */
  knee: 100,
  /** A kneeling foot: its toes tucked under, the foot reaching back and down from the ankle at about 45 degrees to the
   * ball of the foot on the ground, degrees of pointing (0 square to the shin). */
  tucked: 35,
  /** One knee: the front thigh forward (above level: her front knee a little higher than her hips, her shin straight
   * up under it to a flat foot at its standing height) and the front knee's bend, degrees. (80 and 85, then 98 and 108, put the
   * front foot 3-5 cm into the floor, and lifting her clear of it held her back knee off the ground.) */
  frontThigh: 114,
  frontKnee: 114,
  /** Bringing the front knee down beside the other, its shin folds up under her by this much more at the halfway point
   * (degrees), so its foot passes over the floor, not through it (straight across, the foot swept 15 cm under and
   * lifted her whole body off her back knee). */
  frontFold: 50,
  /** Her upper arms forward and her elbows bent so her hands rest on her thighs, degrees (one knee: a little further,
   * to her raised knee). */
  armForward: 30,
  armForwardOneKnee: 42,
  elbow: 35,
} as const;

/**
 * Her pose on one knee (`oneKnee` 1) or both (0), as turns from her bind pose, written into `out` (see KNEEL). Her right
 * knee is the one that goes down first.
 */
export function kneelTurns(oneKnee: number, carry: number, measure: HumanMeasure, bind: readonly BindJoint[], out: MutableJointTurn[]): MutableJointTurn[] {
  while (out.length < 17) out.push({ joint: -1, ax: 0, ay: 1, az: 0, radians: 0 });
  const j = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  const lean = KNEEL.lean * DEG;
  let n = 0;
  const put = (joint: number, ax: number, ay: number, az: number, radians: number): void => {
    const t = out[n++]; t.joint = joint; t.ax = ax; t.ay = ay; t.az = az; t.radians = radians;
  };
  put(j.pelvis, 0, 1, 0, 0);
  putXZ(put, j.spine, 0, 0);
  putXZ(put, j.chest, 0, 0);
  // (her head kept looking ahead over her small lean)
  putXZ(put, j.neck, -lean, 0);
  const armFwd = KNEEL.armForward + (KNEEL.armForwardOneKnee - KNEEL.armForward) * oneKnee;
  for (const side of [0, 1] as const) {
    const xSign = side === 0 ? left : -left;
    arm(put, bind, side === 0 ? j.shoulderL : j.shoulderR, side === 0 ? j.elbowL : j.elbowR, side === 0 ? j.wristL : j.wristR, xSign,
      (armFwd + KNEEL.lean) * DEG, KNEEL.elbow * DEG, 8 * DEG);
  }
  // (her knees a little apart, wider round her belly, as on all fours)
  const wide = (6 + 10 * Math.min(2, Math.max(0, carry))) * DEG;
  // HER RIGHT LEG: kneeling, its thigh straight down under her lean, its shin back along the ground, its toes tucked
  leg(put, j.hipR, j.kneeR, j.ankleR, -left, lean, wide, 0, KNEEL.knee * DEG, KNEEL.tucked * DEG);
  // HER LEFT LEG: on one knee, forward with its foot flat (thigh forward, shin straight up, the foot level); with both
  // knees down, kneeling like the right
  const front = (k: number, f: number): number => k + (f - k) * oneKnee;
  leg(put, j.hipL, j.kneeL, j.ankleL, left,
    front(lean, KNEEL.frontThigh * DEG + lean), front(wide, 6 * DEG), 0,
    front(KNEEL.knee * DEG, KNEEL.frontKnee * DEG) + KNEEL.frontFold * DEG * Math.sin(Math.PI * Math.min(1, Math.max(0, oneKnee))),
    front(KNEEL.tucked * DEG, (KNEEL.frontKnee - KNEEL.frontThigh) * DEG));
  out.length = n;
  return out;
}
/**
 * LYING ON HER BACK (v0.2.179; Joshua, 2026-11-26, of the first try, her sit tipped back: "Fix the head lying on the bed
 * (it's twisted at a weird angle… just needs to roll (tilt left and right some) and the body cutting in the bed"): her
 * pose for lying, written in her own standing frame and then tipped onto her back with her whole body (fastHeroine.ts
 * LIE). Until Joshua's own lying pose comes from the pose builder. GAME TUNING, degrees.
 */
export interface LiePose {
  /** her hip joints over the top of what she lies on, metres (the flesh of her seat and back under them) */
  hipsOver: number;
  /** her thighs a little forward of her body's line, and her knees a little bent (a body lying relaxed is never locked straight) */
  hips: number; knee: number;
  /** her legs a little apart, and rolled out about their length (lying on her back her feet fall outward) */
  legsOut: number; legsTurnOut: number;
  /** her feet: toes pointed away from her shins (more pushed her shoes' heels into the bed) */
  point: number;
  /** her arms down by her sides (no swing forward: forward is up off the bed), elbows a little bent, wrists turned in */
  armForward: number; elbow: number; wristIn: number;
  /** her head on the pillow: chin a little toward her chest, the bend shared from her chest up */
  chest: number; neck: number;
}
/**
 * Hers and his, MEASURED lying on the Fishers' bed (every point of their skin and gear against the duvet and pillow,
 * test pages `gdm.liePose`): her back, seat, thighs, calves and heels resting on the duvet within 2 cm, her head on
 * the pillow, nothing of their skin in it (the backs of their knees a little off it, as a relaxed leg's are); their belt
 * pouches 2-4 cm into the soft duvet. Hers is a smaller back and seat, and a head lifted further onto the pillow. (Her
 * sit tipped back, the first try, put his upper back 6 cm and his feet 17 cm into the bed.)
 */
export const LIE_POSE: { female: LiePose; male: LiePose } = {
  female: { hipsOver: 0.14, hips: 2, knee: 3, point: 0, legsOut: 5, legsTurnOut: 14, armForward: 0, elbow: 14, wristIn: 8, chest: 0, neck: 19 },
  male: { hipsOver: 0.165, hips: 2, knee: 3, point: 0, legsOut: 5, legsTurnOut: 14, armForward: 0, elbow: 14, wristIn: 8, chest: 0, neck: 4 },
};

/** Her pose lying on her back (LIE_POSE), as turns from her bind pose, written into `out`. */
export function lieTurns(pose: LiePose, measure: HumanMeasure, bind: readonly BindJoint[], out: MutableJointTurn[]): MutableJointTurn[] {
  const LIE_POSE = pose;
  while (out.length < 17) out.push({ joint: -1, ax: 0, ay: 1, az: 0, radians: 0 });
  const j = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  let n = 0;
  const put = (joint: number, ax: number, ay: number, az: number, radians: number): void => {
    const t = out[n++]; t.joint = joint; t.ax = ax; t.ay = ay; t.az = az; t.radians = radians;
  };
  put(j.pelvis, 0, 1, 0, 0);
  putXZ(put, j.spine, 0, 0);
  // (a turn about X with a POSITIVE angle bends her forward, chin toward her chest: prone's head goes up by a negative one)
  putXZ(put, j.chest, LIE_POSE.chest * DEG, 0);
  putXZ(put, j.neck, LIE_POSE.neck * DEG, 0);
  for (const side of [0, 1] as const) {
    const xSign = side === 0 ? left : -left;
    arm(put, bind, side === 0 ? j.shoulderL : j.shoulderR, side === 0 ? j.elbowL : j.elbowR, side === 0 ? j.wristL : j.wristR, xSign,
      LIE_POSE.armForward * DEG, LIE_POSE.elbow * DEG, LIE_POSE.wristIn * DEG);
  }
  for (const side of [0, 1] as const) {
    const s = side === 0 ? left : -left;
    leg(put, side === 0 ? j.hipL : j.hipR, side === 0 ? j.kneeL : j.kneeR, side === 0 ? j.ankleL : j.ankleR, s,
      LIE_POSE.hips * DEG, LIE_POSE.legsOut * DEG, LIE_POSE.legsTurnOut * DEG, LIE_POSE.knee * DEG, LIE_POSE.point * DEG);
  }
  out.length = n;
  return out;
}

/**
 * LYING ON HER SIDE (v0.2.179; Joshua, 2026-11-26: "Are they both sleeping on their sides yet or just back?", "Go ahead
 * and add first"): a relaxed side sleeper's pose, written in her own standing frame as if she lay on her LEFT side (the
 * bottom arm and leg her left); `sideTurns` mirrors it for her right. Her whole body is then rolled onto that side and
 * tipped back (fastHeroine.ts LIE). Her back a little rounded, her bottom arm forward with its hand by her face, her top
 * arm resting in front of her (late in a pregnancy, over her belly), her knees bent and together, the top one resting on
 * the lower (or a pillow between them: Joshua, "add a pillow between the legs but also the option for no pillow and the
 * legs touching for both of them"); her head resting on the pillow, bent down toward it a little. GAME TUNING, degrees
 * and metres.
 */
export interface SidePose {
  /** her hip joints over the top of what she lies on, metres (half her hips' width, and her flesh, under them) */
  hipsOver: number;
  /** her hip joints moved toward her BACK, metres, from the spot she lies on: curled on her side she reaches about half a
   *  metre in front of them (knees, hands) and only her back's depth behind, so laid at the middle of her half of the
   *  bed and facing its edge, her knees and hands went over it (Mary at the main bed's west side) */
  backShift: number;
  /** her back rounded forward, low and high */
  spine: number; chest: number;
  /** her back bent UP toward her top side, degrees, shared low and high: her shoulders are wider than her hips, so
   *  laid straight her lower shoulder went into the bed while her hips lay on it */
  lift: number;
  /** her head: chin a little toward her chest, and bent down toward the pillow (toward her lower shoulder) */
  neck: number; neckDown: number;
  /** the arm she lies on: forward at her shoulder, elbow bent (its hand by her face), and how far out from her side
   *  (out is DOWN into the bed once she lies on that side: her standing arm's 17 hung her elbow 9 cm into it) */
  bottomArm: number; bottomElbow: number; bottomOut: number;
  /** the arm on top: forward, elbow bent, and in across her front (negative out) so it rests in front of her */
  topArm: number; topElbow: number; topArmOut: number;
  /** the leg she lies on: thigh forward, knee bent, and out to her side (DOWN onto the bed: her hip joint stands over it
   *  by half her hips' width, so her knee and ankle come down to it) */
  bottomHips: number; bottomKnee: number; bottomLegOut: number;
  /** the leg on top: a little further forward, its knee a little more bent, and across onto the other (negative out):
   *  her legs together, the top knee resting on the lower one (MEASURED skin to skin, John and Mary at 10 and 150 %:
   *  her top knee 0-1.5 cm into the soft of the leg under it, their shoes touching) */
  topHips: number; topKnee: number; topOut: number;
  /** the top leg turned about its own length, degrees (both legs are turned out 6 lying on her back): turned IN (negative)
   *  its bent knee swings its foot UP, off the lower ankle, so her knees can rest together without her ankles crossing
   *  (laid across without it, her top shoe went 3 cm into the lower one). Not with a pillow (6, as the lower leg): held
   *  up by it, turned in her top foot rose 6-9 cm off the lower one */
  topTurnOut: number;
  /** ...or, with a PILLOW BETWEEN HER KNEES (`KNEE_PILLOW`), held up off the other by it: her knees' skin about 9 cm
   *  apart (a squashed knee pillow), so the out is per body (Mary's knees are narrower than John's) */
  pillowOut: number;
  /** her feet relaxed, toes pointed a little */
  point: number;
}
export const SIDE_POSE: { female: SidePose; male: SidePose } = {
  female: { hipsOver: 0.185, backShift: 0.16, spine: 8, chest: 6, lift: 16, neck: 8, neckDown: 34, bottomArm: 60, bottomElbow: 70, bottomOut: -5, topArm: 35, topElbow: 55, topArmOut: -15, bottomHips: 35, bottomKnee: 45, bottomLegOut: 4, topHips: 38, topKnee: 48, topOut: -17, topTurnOut: -14, pillowOut: 0, point: 20 },
  male: { hipsOver: 0.205, backShift: 0.16, spine: 8, chest: 6, lift: 12, neck: 8, neckDown: 30, bottomArm: 60, bottomElbow: 70, bottomOut: -5, topArm: 35, topElbow: 55, topArmOut: -15, bottomHips: 35, bottomKnee: 45, bottomLegOut: 0, topHips: 38, topKnee: 48, topOut: -18, topTurnOut: -6, pillowOut: -4, point: 20 },
};

/**
 * THE PILLOW BETWEEN HER KNEES (Joshua, 2026-11-26: "add a pillow between the legs but also the option for no pillow and
 * the legs touching for both of them"): its size, metres (along her thighs, across them, and as thick as it lies
 * squashed between her knees: worked out each frame from the gap between them, never under `thinnest`), and how far it
 * sits up her thighs from her knees.
 */
export const KNEE_PILLOW = { length: 0.32, width: 0.3, thinnest: 0.05, upThighs: 0.02, growSeconds: 0.3,
  /** a knee's own flesh round its joint, both knees together: the pillow is the gap less this (MEASURED: John 9-10 cm
   *  thick for a 9.3 cm gap between his knees' skin, Mary 8.8 for 8.9; a square pillow against round legs, it goes
   *  1-2 cm into the thighs and shins either side of the knees, as a soft one would squash round them) */
  kneeFlesh: 0.14 };

/** Her pose lying on her side (SIDE_POSE): `onLeft` her left side down, else her right; `pillow` between her knees. */
export function sideTurns(pose: SidePose, onLeft: boolean, pillow: boolean, measure: HumanMeasure, bind: readonly BindJoint[], out: MutableJointTurn[]): MutableJointTurn[] {
  while (out.length < 17) out.push({ joint: -1, ax: 0, ay: 1, az: 0, radians: 0 });
  const j = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  let n = 0;
  const put = (joint: number, ax: number, ay: number, az: number, radians: number): void => {
    const t = out[n++]; t.joint = joint; t.ax = ax; t.ay = ay; t.az = az; t.radians = radians;
  };
  put(j.pelvis, 0, 1, 0, 0);
  // (a turn about her forward axis takes what is above it toward -X for a positive angle: toward her left, on +left, by
  //  a negative one. `down` is the X of the side she lies on)
  const down = onLeft ? left : -left;
  putXZ(put, j.spine, pose.spine * DEG, down * pose.lift * 0.5 * DEG);
  putXZ(put, j.chest, pose.chest * DEG, down * pose.lift * 0.5 * DEG);
  // (her head bent back down toward her lower side, onto the pillow, by her back's lift and more)
  putXZ(put, j.neck, pose.neck * DEG, -down * (pose.neckDown + pose.lift) * DEG);
  // her arms: the one she lies on and the one on top
  for (const side of [0, 1] as const) {
    const isLeft = side === 0, bottom = isLeft === onLeft;
    const xSign = isLeft ? left : -left;
    arm(put, bind, isLeft ? j.shoulderL : j.shoulderR, isLeft ? j.elbowL : j.elbowR, isLeft ? j.wristL : j.wristR, xSign,
      (bottom ? pose.bottomArm : pose.topArm) * DEG, (bottom ? pose.bottomElbow : pose.topElbow) * DEG, 8 * DEG, 0,
      (bottom ? pose.bottomOut : pose.topArmOut) * DEG);
  }
  // her legs: the one she lies on and the one on top
  for (const side of [0, 1] as const) {
    const isLeft = side === 0, bottom = isLeft === onLeft;
    const s = isLeft ? left : -left;
    leg(put, isLeft ? j.hipL : j.hipR, isLeft ? j.kneeL : j.kneeR, isLeft ? j.ankleL : j.ankleR, s,
      (bottom ? pose.bottomHips : pose.topHips) * DEG, (bottom ? pose.bottomLegOut : pillow ? pose.pillowOut : pose.topOut) * DEG, (bottom || pillow ? 6 : pose.topTurnOut) * DEG,
      (bottom ? pose.bottomKnee : pose.topKnee) * DEG, pose.point * DEG);
  }
  out.length = n;
  return out;
}

/** Kneeling: her whole body's forward tip, radians (her lean), and her hips' height (her thigh down to her knee). */
export function kneelTip(): number { return KNEEL.lean * DEG; }
export function kneelHips(sizes: BodySizes): number { return foursHips(sizes); }

/**
 * HOW FAR ALONG EACH STEP OF GETTING DOWN SHE IS, from how far down she is (`down`, 0 crouched .. 1 down): onto one knee,
 * onto both, then all fours, then (prone only) onto her elbows, each 0..1, overlapping a little so it flows. (`oneKnee`
 * is how far her FRONT knee is still up: 1 on one knee, 0 once both are down.)
 */
export function downSteps(kind: 'prone' | 'fours', down: number, out: { kneel: number; oneKnee: number; fours: number; prone: number }): void {
  const part = (from: number, to: number): number => { const t = Math.max(0, Math.min(1, (down - from) / (to - from))); return t * t * (3 - 2 * t); };
  if (kind === 'fours') {
    out.kneel = part(0, 0.32); out.oneKnee = 1 - part(0.3, 0.58); out.fours = part(0.52, 1); out.prone = 0;
  } else {
    out.kneel = part(0, 0.24); out.oneKnee = 1 - part(0.22, 0.44); out.fours = part(0.4, 0.7); out.prone = part(0.64, 1);
  }
}

/** The forward tip of her whole body in a stance, radians (prone: flat; on all fours: her back about level). */
export function tipOf(kind: 'prone' | 'fours', sizes: BodySizes): number {
  if (kind === 'prone') return (90 - STANCE.proneRaise) * DEG;
  // her shoulders as high as her arm is long, her hips as high as her thigh: her back tilts up between them
  const torso = Math.max(0.2, sizes.shoulderHeight - sizes.hipHeight);
  const rise = foursShoulders(sizes) - foursHips(sizes);
  return 90 * DEG - Math.asin(Math.max(-0.5, Math.min(0.5, rise / torso)));
}
/** On all fours: her hips' height (her thigh straight down from them to her knee on the ground), metres. */
export function foursHips(sizes: BodySizes): number { return sizes.thigh + 0.05; }
/** ...and her shoulders' (her straight arms down to her hands). */
export function foursShoulders(sizes: BodySizes): number { return sizes.arm + 0.04; }

// ---- writing one joint, one arm, one leg ----------------------------------------------------------------------
type Put = (joint: number, ax: number, ay: number, az: number, radians: number) => void;

/** A turn about X then Z as one axis and angle (the builder's writeTurnXZ). */
function putXZ(put: Put, joint: number, x: number, z: number): void {
  const sx = Math.sin(x * 0.5), cx = Math.cos(x * 0.5), sz = Math.sin(z * 0.5), cz = Math.cos(z * 0.5);
  quat(put, joint, sx * cz, -sx * sz, cx * sz, cx * cz);
}

/** A rotation (x, y, z, w) as one axis and angle. */
function quat(put: Put, joint: number, qx: number, qy: number, qz: number, qw: number): void {
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
  const sine = Math.hypot(qx, qy, qz);
  if (sine < 1e-9) { put(joint, 0, 1, 0, 0); return; }
  put(joint, qx / sine, qy / sine, qz / sine, 2 * Math.atan2(sine, qw));
}

/** Multiply two rotations (x, y, z, w): a then b's frame... a * b. */
function mul(a: number[], b: number[]): number[] {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
const about = (x: number, y: number, z: number, angle: number): number[] => {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
};

/**
 * One arm: lowered from her T as the builder's standing arm is, then swung FORWARD by `forward` radians at the
 * shoulder, its elbow bent `elbow` (and taken out of the bind's kink), its wrist turned in a little.
 */
function arm(put: Put, bind: readonly BindJoint[], shoulder: number, elbow: number, wrist: number, xSign: number, forward: number, elbowBend: number, wristIn: number, flat = 0, outFromDown = 17 * DEG): void {
  const s = bind[shoulder], e = bind[elbow], w = bind[wrist];
  const droop = Math.atan2(s.y - e.y, Math.abs(e.x - s.x));
  const kink = droop - Math.atan2(e.y - w.y, Math.abs(w.x - e.x));
  // (lowered from her T to `outFromDown` off straight down, out to her side: the builder's standing arm's 17 degrees;
  //  less, or under 0, brings it in across her front)
  putXZ(put, shoulder, -forward, -xSign * (Math.PI / 2 - outFromDown - droop));
  // THE ELBOW: the bind's kink taken out about Z, then bent FORWARD about the line across her body (X), as a knee bends
  // the other way. (Not the builder's bend about Y: that assumes an arm straight out in a T, and her body file's arms
  // already hang nearly down, so a turn about Y only twisted her forearm about itself.)
  putXZ(put, elbow, -elbowBend, -xSign * kink);
  if (flat <= 0) { put(wrist, 0, 0, 1, -xSign * wristIn); return; }
  // PALM FLAT ON THE GROUND (Joshua, 2026-11-20: "is her hands flat on the ground while crawling?"): her hand turned
  // palm-back about its own length (as a forearm does to put a palm down), then bent back at the wrist so her fingers
  // point ahead: with her arm straight down under her shoulder, her palm lies flat, fingers forward. `flat` 0..1.
  const q = mul(about(1, 0, 0, -90 * DEG * flat), about(0, 1, 0, -90 * DEG * xSign * flat));
  quat(put, wrist, q[0], q[1], q[2], q[3]);
}

/**
 * One leg: its thigh FORWARD (`flex`, radians) and OUT to her side (`out`), turned OUT about its own length (`turnOut`),
 * its knee bent `knee`, its ankle pointing its toes `point` (on all fours and lying down her feet lie on their tops).
 * `s` is +1 for the leg on her +X side.
 */
function leg(put: Put, hip: number, knee: number, ankle: number, s: number, flex: number, out: number, turnOut: number, kneeBend: number, point: number): void {
  // (turned out about the leg's own length first, then out to the side, then forward: Rx(-flex) * Rz(s * out) * Ry(s * turnOut))
  const q = mul(mul(about(1, 0, 0, -flex), about(0, 0, 1, s * out)), about(0, 1, 0, s * turnOut));
  quat(put, hip, q[0], q[1], q[2], q[3]);
  put(knee, 1, 0, 0, kneeBend);
  putXZ(put, ankle, point, -s * out * 0.5);
}
