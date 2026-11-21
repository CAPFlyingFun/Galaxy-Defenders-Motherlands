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
 * pose she holds while out of breath (input/pace.ts `windedHoldSeconds`, 10 s), then she stands up and can go again.
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
  /**
   * HER HEAD BOWED AS FAR AS IT GOES, ON HER BENT BACK (Joshua, 2026-11-20: "have it at the max downward angle
   * relative to the torso as the head doesn't offset off the torso"): her chin to her chest, degrees from her back's
   * own line, whatever her bend; first person the view looks the same way (past straight down: src/main.ts).
   */
  headDown: 65,
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
  /** Seconds to get down from a crouch onto her belly or hands and knees, and to get back up to a crouch. */
  downSeconds: 1.0,
  upSeconds: 1.2,
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
function arm(put: Put, bind: readonly BindJoint[], shoulder: number, elbow: number, wrist: number, xSign: number, forward: number, elbowBend: number, wristIn: number, flat = 0): void {
  const s = bind[shoulder], e = bind[elbow], w = bind[wrist];
  const droop = Math.atan2(s.y - e.y, Math.abs(e.x - s.x));
  const kink = droop - Math.atan2(e.y - w.y, Math.abs(w.x - e.x));
  putXZ(put, shoulder, -forward, -xSign * (Math.PI / 2 - 17 * DEG - droop));
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
