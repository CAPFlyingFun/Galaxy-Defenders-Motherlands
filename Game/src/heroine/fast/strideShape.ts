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
}

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
  return out;
}

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

/**
 * THE BUILDER'S ARM NUMBERS (Char_B humanPose.ts, which keeps them to itself), for `writeArms`, radians:
 *   swing   how far a whole arm swings fore and aft about the shoulder (walk 18, run 38 degrees);
 *   elbow   the bend held whatever the arm does (walk 8: an arm hangs; run 72: a runner's arms are up);
 *   pump    more bend as the arm comes forward, none going back (walk 14, run 18);
 * and for both: the arms hang a little in front of her (roll 6), out from her sides (flare 17: "17 hangs the arm clear
 * of the body with the hand beside the thigh"), the hand turned in a little at the wrist (8).
 */
const ARM = {
  walk: { swing: 18 * DEG, elbow: 8 * DEG, pump: 14 * DEG },
  run: { swing: 38 * DEG, elbow: 72 * DEG, pump: 18 * DEG },
  roll: 6 * DEG,
  flare: 17 * DEG,
  wristIn: 8 * DEG,
} as const;

/**
 * WRITE HER ARMS for this moment of the stride into the builder's pose (`turns`, as `poseHuman` filled it: her arms are
 * turns 3-8, the left then the right, each shoulder, elbow, wrist), over its own: the builder's swing, with her elbows
 * bent about X so they really bend (see the top of this file). Each arm goes with the OPPOSITE leg, crossing as the legs
 * cross: the builder's cycle, with the game's share of the stride a foot is down (`shape.share`), so her arms keep time
 * with the legs the game writes.
 */
export function writeArms(
  turns: MutableJointTurn[], measure: HumanMeasure, bind: readonly BindJoint[], phase: number, shape: StrideShape,
  stance: 'walk' | 'run',
): void {
  const joints = measure.joints;
  const left = measure.leftSign < 0 ? -1 : 1;
  // (positive: her LEFT leg thrown forward; the builder's own cycle)
  const cycle = Math.sin((phase - (shape.share / 2 - 0.25)) * 2 * Math.PI);
  writeArm(turns, 3, bind, joints.shoulderL, joints.elbowL, joints.wristL, left, -cycle, ARM[stance]);
  writeArm(turns, 6, bind, joints.shoulderR, joints.elbowR, joints.wristR, -left, cycle, ARM[stance]);
}

/**
 * One arm (the builder's writeArm, its elbow about X): lowered from the T to hang out a little from her side, swung
 * `forward` (-1 back .. +1 forward) about the shoulder, its elbow bent (and the bind's own kink taken out), its hand
 * turned in a little. `xSign` is the x the arm lies along in the bind (her left arm +, her right -, or the mirror).
 */
function writeArm(
  out: MutableJointTurn[], at: number, bind: readonly BindJoint[], shoulder: number, elbow: number, wrist: number,
  xSign: number, forward: number, arm: { swing: number; elbow: number; pump: number },
): void {
  const s = bind[shoulder], e = bind[elbow], w = bind[wrist];
  // (how far the bind's upper arm already droops below level, and how far its forearm is kinked back up from it)
  const droop = Math.atan2(s.y - e.y, Math.abs(e.x - s.x));
  const kink = droop - Math.atan2(e.y - w.y, Math.abs(w.x - e.x));
  writeTurnXZ(out[at], shoulder, -(ARM.roll + arm.swing * forward), -xSign * (Math.PI / 2 - ARM.flare - droop));
  const bend = arm.elbow + arm.pump * Math.max(0, forward);
  // THE ELBOW: the kink taken out about Z, then bent FORWARD. An arm that already HANGS in the bind (her body file:
  // more than 45 degrees down) bends about the line across her body (X), as groundPose.ts does; an arm bound straight
  // out in a T bends about Y, the builder's own way (writeElbow), which is right for such an arm
  if (droop > Math.PI / 4) writeTurnXZ(out[at + 1], elbow, -bend, -xSign * kink);
  else writeTurnYZ(out[at + 1], elbow, -xSign * bend, -xSign * kink);
  writeTurn(out[at + 2], wrist, 0, 0, 1, -xSign * ARM.wristIn);
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
