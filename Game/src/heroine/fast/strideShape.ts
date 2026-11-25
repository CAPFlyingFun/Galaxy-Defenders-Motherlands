// ============================================================================
// strideShape.ts -- HER STRIDE GROWS WITH HER SPEED (Joshua, 2026-11-20:
// "increase her stride length as that's realistic. Her feet spacing looks the
// same walking or sprinting and the faster you run, the longer the stride
// length"; "let the longer stride carry her about 10% faster").
//
// The builder's walk and run (Char_B humanPose.ts `poseHuman`) each have ONE
// step length and one share of the stride that a foot is on the ground: walk
// 0.8 of her leg with each foot down 60% of the time, run 0.9 with 40%. Every
// run was the same 1.8 m stride, only quicker. A real runner covers more ground
// with every step the faster she goes, and most of the extra is TIME IN THE AIR:
// her foot is on the ground for less and less of each stride (about 60% walking,
// 40% at an easy run, under 30% sprinting).
//
// So the game writes her legs itself, the builder's way (the same `writeLeg`:
// a planted foot sweeps back at the very pace the ground goes by, a swinging
// one comes through on a smooth curve, the knee folding most mid-swing), but
// with three numbers that follow her speed (`shapeAt`):
//   STRIDE  metres for two steps: 0.95 m strolling, 1.18 walking, 1.95
//           jogging, 2.55 running, 3.1 sprinting (shorter as her belly grows,
//           as the builder's own `carryGait` shortens it)
//   SHARE   of each stride a foot is down: 0.62 .. 0.235 (the rest is flight)
//   LIFT    how high the knee folds the foot up: a sprint kicks its heel high
// and her feet come in toward one line the faster she goes (`narrow`), as a
// runner's do. Her arms, lean and breath stay the builder's.
//
// The step a planted foot sweeps is stride x share: about 0.8 of her leg
// walking (as the builder's) and 0.9 from a jog up (the builder's run), so her
// hip never reaches further than the builder's own run: the stride grows in the
// AIR, as a real one does (the rig has no heel-to-toe roll or turning pelvis
// to lengthen the step on the ground).
//
// HER ARMS TOO (`writeArms`; Joshua, 2026-11-24: "their hands are passing
// through their body"): the builder's walk and run swing her arms by its own
// numbers (the swing, the arms hanging out a little, a runner's elbows up at 72
// degrees), but it bends an elbow ABOUT Y, which assumes an arm straight out in
// a T. This body file's arms already hang nearly down, so that turn only TWISTED
// her forearm about itself (CLAUDE.md, groundPose.ts `arm`): her elbows stayed
// straight at a run and her hands swung through her hips and thighs (measured:
// fingertips 5-7 cm in, a fifth of the time, jogging and sprinting). The game
// writes her arms with the builder's numbers, the elbow bent about X (across her
// body) as groundPose.ts bends it, so a runner's elbows really are up.
//
// HER ARMS BY HER SPEED, AND NEVER QUITE THE SAME TWICE (Joshua, 2026-11-24:
// "the hands should look random and not so forward all the time when walking
// to sprinting... research how positioning for walking to sprinting"): the
// builder's two sets swung each arm the same amount before and behind her
// shoulder, a little in front of hanging, the elbow held at one bend, so a
// runner's hands stayed in front of her all stride. What is measured and
// taught instead (ARM_ROWS): walking, the arm is kept MOSTLY STRAIGHT and
// swings like a pendulum, more behind than before her; running, the elbow
// near 90 degrees and DRIVEN BACK, the hands low near the waist, toward but
// not across her middle; sprinting, "hip to cheek", the elbow closed to 60-90
// in front and OPENED to 90-120 behind, so the hand passes her hip. So each
// row has its own swing before and behind, its own bend in front and behind
// (the elbow opens as the arm goes back), and the arm hangs out a little more
// behind than in front. Swing and bend grow with her speed, row to row.
// AND EACH ARM ITS OWN WAY EACH STRIDE (`ArmVariety`): slow walking arms differ
// left to right and stride to stride (their swings only loosely alike), and
// grow more alike the faster she goes: each arm's swing, its middle, its
// elbow and how far out it hangs drift on their own, a new aim every stride or
// two, by most at a walk and least at a sprint (still clearly), and one arm
// swings a little more than the other for good (each body its own).
// ============================================================================
import type { BindJoint, HumanMeasure, MutableJointTurn } from '@charb/actor/humanRig';

const DEG = Math.PI / 180;

/** One shape of stride. */
export interface StrideShape {
  /** metres for two steps (left foot to left foot) */
  stride: number;
  /** the share of a stride each foot is on the ground */
  share: number;
  /** how far the knee folds the foot up mid-swing, a share of her leg */
  lift: number;
  /** how far behind her hip a planted leg goes at most, radians */
  back: number;
  /** each thigh turned in toward the middle, radians (her feet nearer one line) */
  narrow: number;
  /** HER ARMS (ARM_ROWS): how far each swings in front of and behind hanging, radians */
  swingFront: number;
  swingBack: number;
  /** her elbow's bend at the front of the swing and at the back of it, radians (0 straight) */
  elbowFront: number;
  elbowBack: number;
  /** how far out from her side each arm hangs at the front of the swing and at the back, radians */
  flareFront: number;
  flareBack: number;
  /** how much each arm wanders from stride to stride (`ArmVariety`), 1 most (a walk) */
  variety: number;
}

/**
 * HER ARMS AT EACH SPEED (see the top of this file; GAME TUNING toward the measured and the taught), degrees:
 * [speed m/s, swing in front, swing behind, elbow bent in front, elbow bent behind, out at front, out behind, variety]
 * The elbow's bend is from straight (90 is a right angle). Walking her arm is near straight and swings more behind;
 * from a jog (2.64) her elbow is near a right angle, closing in front and opening behind, and her ELBOWS DRIVEN BACK
 * (each swing reaches further behind than before her: at the back of a jog her hand is at her waistband, 4 cm behind her
 * shoulder); at a sprint (6.05) her hand comes up to about her cheek in front (shoulder 40 + elbow 110 = forearm 150
 * degrees from hanging) and passes her hip behind (-56 + 64: her forearm just forward of straight down).
 * (A first set, swung about as far in front as behind, kept her running hands in front of her hips three fifths of the
 * time and never behind them at a jog: measured.)
 */
export const ARM_ROWS: ReadonlyArray<readonly [number, number, number, number, number, number, number, number]> = [
  [0.0, 4, 6, 8, 5, 17, 17, 1],
  [0.4, 6, 10, 10, 6, 17, 17, 1],
  [1.1, 10, 20, 24, 8, 16, 18, 1],
  [1.9, 13, 28, 50, 26, 15, 18, 0.9],
  [2.64, 16, 36, 86, 66, 14, 19, 0.8],
  [4.18, 24, 44, 98, 68, 13, 20, 0.7],
  [6.05, 40, 56, 110, 64, 12, 21, 0.6],
];

/**
 * THE STRIDE AT EACH SPEED (GAME TUNING toward the measured, for a woman about 1.6 m tall; her walk 1.1 m/s, jog 2.64,
 * run 4.18, sprint 6.05: input/pace.ts). Between two rows everything is blended, so nothing jumps.
 * [speed m/s, stride m, share down, knee lift (leg), back (degrees), feet in (degrees)]
 */
export const STRIDE_ROWS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0.0, 0.9, 0.62, 0.05, 12, 0],
  [0.4, 0.95, 0.62, 0.05, 12, 0],
  [1.1, 1.18, 0.56, 0.06, 13, 0.5],
  [1.9, 1.55, 0.46, 0.11, 15, 1.2],
  [2.64, 1.95, 0.37, 0.16, 16, 2],
  [4.18, 2.55, 0.285, 0.22, 18, 3],
  [6.05, 3.1, 0.235, 0.3, 20, 4],
];
/** The shape at a speed (and her belly: `carry` 0 none .. 1 full term .. 2), into `out`. */
export function shapeAt(speed: number, carry: number, out: StrideShape): StrideShape {
  const rows = STRIDE_ROWS;
  let i = 0;
  while (i < rows.length - 2 && speed > rows[i + 1][0]) i++;
  const a = rows[i], b = rows[i + 1];
  const t = Math.max(0, Math.min(1, (speed - a[0]) / Math.max(1e-6, b[0] - a[0])));
  const mix = (k: number): number => a[k] + (b[k] - a[k]) * t;
  // (a belly shortens the step, as the builder's carryGait does: 18% at full term)
  const c = Math.min(2, Math.max(0, Number.isFinite(carry) ? carry : 0));
  out.stride = mix(1) * (1 - 0.18 * c);
  out.share = mix(2);
  out.lift = mix(3);
  out.back = mix(4) * DEG;
  // (a big belly keeps her feet apart instead: the thighs pass either side of it)
  out.narrow = mix(5) * DEG * Math.max(0, 1 - c);
  // HER ARMS, from their own rows, blended the same way
  const arms = ARM_ROWS;
  let j = 0;
  while (j < arms.length - 2 && speed > arms[j + 1][0]) j++;
  const p = arms[j], q = arms[j + 1];
  const u = Math.max(0, Math.min(1, (speed - p[0]) / Math.max(1e-6, q[0] - p[0])));
  const arm = (k: number): number => p[k] + (q[k] - p[k]) * u;
  out.swingFront = arm(1) * DEG;
  out.swingBack = arm(2) * DEG;
  out.elbowFront = arm(3) * DEG;
  out.elbowBack = arm(4) * DEG;
  out.flareFront = arm(5) * DEG;
  out.flareBack = arm(6) * DEG;
  out.variety = arm(7);
  return out;
}

/**
 * EACH ARM ITS OWN WAY EACH STRIDE (see the top of this file): for each arm, four slow wanderings, each -1..1: its
 * swing's size, its swing's middle, its elbow's bend and how far out it hangs. Each glides (eased) to a new aim picked
 * every `VARIETY_SECONDS`, its own times, so the two arms never change together. Plus one arm that always swings a
 * little more (`favour`, chosen once per body). One per body (bodyMotion.ts), stepped each frame.
 */
export class ArmVariety {
  /** per arm (left, right), per wandering (swing, middle, elbow, out): where it glides from, to, and how far along */
  private readonly from = [new Float32Array(4), new Float32Array(4)];
  private readonly to = [new Float32Array(4), new Float32Array(4)];
  private readonly along = [new Float32Array(4), new Float32Array(4)];
  private readonly takes = [new Float32Array(4), new Float32Array(4)];
  /** now, per arm: -1..1 each */
  readonly now = [new Float32Array(4), new Float32Array(4)];
  /** the arm that swings a little more, for good: +1 her left, -1 her right */
  readonly favour = Math.random() < 0.5 ? 1 : -1;

  constructor() {
    for (let a = 0; a < 2; a++) for (let k = 0; k < 4; k++) {
      this.to[a][k] = this.from[a][k] = Math.random() * 2 - 1;
      this.takes[a][k] = this.nextTakes();
      this.along[a][k] = Math.random();
    }
  }

  private nextTakes(): number { return VARIETY_SECONDS[0] + Math.random() * (VARIETY_SECONDS[1] - VARIETY_SECONDS[0]); }

  /** On by `dt` seconds. */
  step(dt: number): void {
    for (let a = 0; a < 2; a++) for (let k = 0; k < 4; k++) {
      let t = this.along[a][k] + dt / this.takes[a][k];
      if (t >= 1) {
        // (there: a new aim, from where it is)
        this.from[a][k] = this.to[a][k];
        this.to[a][k] = Math.random() * 2 - 1;
        this.takes[a][k] = this.nextTakes();
        t = 0;
      }
      this.along[a][k] = t;
      const e = t * t * (3 - 2 * t);
      this.now[a][k] = this.from[a][k] + (this.to[a][k] - this.from[a][k]) * e;
    }
  }
}

/** A wandering's new aim comes every this many seconds (picked between the two): about a stride or two. */
const VARIETY_SECONDS = [0.6, 1.3] as const;

/**
 * HOW FAR EACH WANDERING GOES at `variety` 1 (a walk; less as she speeds up): the swing's size by +-22 %, its middle
 * +-5 degrees, the elbow +-10 degrees, out from her side 0 to 4 degrees MORE (never in: walking at a 200 % belly with a gun
 * in hand, an arm wandering in brought her hand 1 mm into her hip); and the favoured arm's swing 6 % more for good.
 */
const VARIETY = { swing: 0.22, middle: 5 * (Math.PI / 180), elbow: 10 * (Math.PI / 180), out: 4 * (Math.PI / 180), favour: 0.06 } as const;

/** Where each foot lands and leaves in a stride (0..1), for her feet's planting: the left lands at 0.25, the right at 0.75. */
export function plantedAt(phase: number, side: number, share: number): boolean {
  const legPhase = fract(phase - (side === 0 ? 0.25 : 0.75));
  return legPhase < share;
}

/**
 * WRITE HER LEGS for this moment of the stride into the builder's pose (`turns`, as `poseHuman` filled it: her legs are
 * turns 9-14), over its own. `legMetres` is her leg in the bind's units per metre... `unitsPerMetre` turns the stride's
 * metres into her leg's units.
 */
export function writeLegs(
  turns: MutableJointTurn[], measure: HumanMeasure, bind: readonly BindJoint[], phase: number, shape: StrideShape,
  carry: number, unitsPerMetre: number,
): void {
  const joints = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  const leg = measure.legLength;
  // the step a planted foot sweeps, a share of her leg: stride x share
  const sweep = Math.min(1.25, (shape.stride * unitsPerMetre * shape.share) / Math.max(1e-6, leg));
  const back = Math.min(sweep / 2, Math.sin(shape.back)), front = Math.min(0.85, sweep - back);
  // the knee's fold that lifts the foot that far, against her own shin
  const knee = bind[joints.kneeL], ankle = bind[joints.ankleL];
  const shin = Math.hypot(ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z);
  const kneeBend = shin > 0 ? Math.acos(Math.max(-1, Math.min(1, 1 - (shape.lift * leg) / shin))) : 0;
  // the builder's own turn of a thigh out round a belly, less the turn in that brings a runner's feet to one line
  const spread = Math.min(2, Math.max(0, carry)) * 3.5 * DEG - shape.narrow;
  writeLeg(turns, 9, joints.hipL, joints.kneeL, joints.ankleL, fract(phase - 0.25), shape.share, front, back, kneeBend, left * spread, shape.back);
  writeLeg(turns, 12, joints.hipR, joints.kneeR, joints.ankleR, fract(phase + 0.25), shape.share, front, back, kneeBend, -left * spread, shape.back);
}

/** The hand turned in a little at the wrist (the builder's 8 degrees). */
const WRIST_IN = 8 * DEG;

/**
 * WRITE HER ARMS for this moment of the stride into the builder's pose (`turns`, as `poseHuman` filled it: her arms are
 * turns 3-8, the left then the right, each shoulder, elbow, wrist), over its own: the swing at her speed (`shape`'s arm
 * numbers, ARM_ROWS), each arm's own wandering (`variety`), her elbows bent about the axis this body's elbows really bend
 * about (see the top of this file). Each arm goes with the OPPOSITE leg, crossing as the legs cross: the builder's
 * cycle, with the game's share of the stride a foot is down (`shape.share`), so her arms keep time with her legs.
 */
export function writeArms(
  turns: MutableJointTurn[], measure: HumanMeasure, bind: readonly BindJoint[], phase: number, shape: StrideShape,
  variety: ArmVariety,
): void {
  const joints = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  // (positive: her LEFT leg thrown forward; the builder's own cycle)
  const cycle = Math.sin((phase - (shape.share / 2 - 0.25)) * 2 * Math.PI);
  writeArm(turns, 3, bind, joints.shoulderL, joints.elbowL, joints.wristL, left, -cycle, shape, variety.now[0], variety.favour);
  writeArm(turns, 6, bind, joints.shoulderR, joints.elbowR, joints.wristR, -left, cycle, shape, variety.now[1], -variety.favour);
}

/**
 * One arm (after the builder's writeArm, its elbow bent the way this body's bends): lowered from the T to hang out from
 * her side, swung `forward` (-1 at the back of its swing .. +1 at the front) about the shoulder, about a middle a little
 * behind hanging, its elbow bent more as it comes forward and opened as it goes back, its hand turned in a little.
 * `xSign` is the x the arm lies along in the bind (her left arm +, her right -, or the mirror). `own` is this arm's
 * wandering now (swing, middle, elbow, out: -1..1 each), `favoured` +1 for the arm that swings a little more.
 */
function writeArm(
  out: MutableJointTurn[], at: number, bind: readonly BindJoint[], shoulder: number, elbow: number, wrist: number,
  xSign: number, forward: number, shape: StrideShape, own: Float32Array, favoured: number,
): void {
  const s = bind[shoulder], e = bind[elbow], w = bind[wrist];
  // (how far the bind's upper arm already droops below level, and how far its forearm is kinked back up from it)
  const droop = Math.atan2(s.y - e.y, Math.abs(e.x - s.x));
  const kink = droop - Math.atan2(e.y - w.y, Math.abs(w.x - e.x));
  const v = shape.variety;
  // (how far along from the back of its swing to the front: 0 .. 1)
  const ahead = (forward + 1) / 2;
  // THE SWING about the shoulder: its middle and size from the front and back numbers, each arm wandering its own way
  const size = ((shape.swingFront + shape.swingBack) / 2) * (1 + v * VARIETY.swing * own[0] + (favoured > 0 ? VARIETY.favour : 0));
  const middle = (shape.swingFront - shape.swingBack) / 2 + v * VARIETY.middle * own[1];
  const swing = middle + size * forward;
  // OUT FROM HER SIDE: a little more behind than in front (in front it comes in toward her middle)
  // (its wandering only ever takes it further out: own[3] -1..1 read as 0..1)
  const flare = shape.flareBack + (shape.flareFront - shape.flareBack) * ahead + v * VARIETY.out * (own[3] + 1) / 2;
  writeTurnXZ(out[at], shoulder, -swing, -xSign * (Math.PI / 2 - flare - droop));
  // THE ELBOW: closed most at the front of the swing and opened at the back; the kink taken out about Z. An arm that
  // already HANGS in the bind (her body file: more than 45 degrees down) bends about the line across her body (X), as
  // groundPose.ts does; an arm bound straight out in a T bends about Y, the builder's own way (writeElbow)
  const bend = Math.max(0, shape.elbowBack + (shape.elbowFront - shape.elbowBack) * ahead + v * VARIETY.elbow * own[2]);
  if (droop > Math.PI / 4) writeTurnXZ(out[at + 1], elbow, -bend, -xSign * kink);
  else writeTurnYZ(out[at + 1], elbow, -xSign * bend, -xSign * kink);
  writeTurn(out[at + 2], wrist, 0, 0, 1, -xSign * WRIST_IN);
}

/** A turn about Y then Z as one axis and angle (the builder's writeElbow). */
function writeTurnYZ(turn: MutableJointTurn, joint: number, yRadians: number, zRadians: number): void {
  const sy = Math.sin(yRadians * 0.5), cy = Math.cos(yRadians * 0.5);
  const sz = Math.sin(zRadians * 0.5), cz = Math.cos(zRadians * 0.5);
  let qx = sy * sz, qy = sy * cz, qz = cy * sz, qw = cy * cz;
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
  const sine = Math.hypot(qx, qy, qz);
  if (sine < 1e-9) { writeTurn(turn, joint, 0, 1, 0, 0); return; }
  writeTurn(turn, joint, qx / sine, qy / sine, qz / sine, 2 * Math.atan2(sine, qw));
}

/** The stride, metres, her place in it moves on by (the ground passes a planted foot at exactly this rate). */
export function strideMetres(shape: StrideShape, measure: HumanMeasure, unitsPerMetre: number): number {
  const leg = measure.legLength;
  const sweep = Math.min(1.25, (shape.stride * unitsPerMetre * shape.share) / Math.max(1e-6, leg));
  const back = Math.min(sweep / 2, Math.sin(shape.back)), front = Math.min(0.85, sweep - back);
  // (the step the foot really sweeps, in case it was held in; the builder's humanStride, in metres)
  return ((front + back) * leg) / unitsPerMetre / shape.share;
}

// ---- the builder's leg, with the share and how far back it goes as numbers (Char_B humanPose.ts writeLeg) ----
function writeLeg(
  out: MutableJointTurn[], at: number, hip: number, knee: number, ankle: number, legPhase: number, share: number,
  front: number, back: number, kneeBend: number, spread: number, backMost: number,
): void {
  let forward: number;
  let fold = 0;
  if (legPhase < share) {
    // PLANTED: from furthest forward to furthest back at one even pace (the ground going by)
    forward = 1 - (2 * legPhase) / share;
  } else {
    // SWINGING: a smooth curve from -1 back to +1 that leaves and arrives at the planted pace (no jerk, no stub)
    const u = (legPhase - share) / (1 - share);
    const m = (-2 * (1 - share)) / share;
    forward = ((-4 * u + 6) * u) * u - 1 + m * (((2 * u - 3) * u + 1) * u);
    fold = (1 - Math.cos(2 * Math.PI * u)) / 2;
  }
  // the foot's place along the ground under the hip (a share of her leg); the hip's angle is its asin
  const place = Math.max(-back, (front - back) / 2 + ((front + back) / 2) * forward);
  const hipAngle = Math.asin(Math.max(-1, Math.min(1, place)));
  writeTurnXZ(out[at], hip, -hipAngle, spread);
  writeTurn(out[at + 1], knee, 1, 0, 0, kneeBend * fold);
  // the ankle undoes the hip and the knee, so the sole stays level on the ground; swinging, the toes trail
  const ankleFlex = Math.max(-backMost, hipAngle - kneeBend * fold * 0.5);
  writeTurnXZ(out[at + 2], ankle, ankleFlex, -spread);
}

function writeTurn(turn: MutableJointTurn, joint: number, ax: number, ay: number, az: number, radians: number): void {
  turn.joint = joint; turn.ax = ax; turn.ay = ay; turn.az = az; turn.radians = radians;
}

/** A turn about X then Z as one axis and angle (the builder's writeTurnXZ). */
function writeTurnXZ(turn: MutableJointTurn, joint: number, xRadians: number, zRadians: number): void {
  const sx = Math.sin(xRadians * 0.5), cx = Math.cos(xRadians * 0.5);
  const sz = Math.sin(zRadians * 0.5), cz = Math.cos(zRadians * 0.5);
  let qx = sx * cz, qy = -sx * sz, qz = cx * sz, qw = cx * cz;
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
  const sine = Math.hypot(qx, qy, qz);
  if (sine < 1e-9) { writeTurn(turn, joint, 0, 1, 0, 0); return; }
  const scale = 1 / sine;
  writeTurn(turn, joint, qx * scale, qy * scale, qz * scale, 2 * Math.atan2(sine, qw));
}

function fract(x: number): number { return x - Math.floor(x); }
