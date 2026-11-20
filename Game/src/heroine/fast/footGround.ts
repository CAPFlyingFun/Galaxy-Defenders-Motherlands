// ============================================================================
// footGround.ts -- THE FAST HEROINE'S FEET ON THE FLOOR.
//
// The builder's pose (bodyMotion.ts) swings her legs from hips that never move
// up, down or sideways. Left like that, a leg stepping out in front of her has
// its foot in the air, and nothing holds a foot to the spot it was put down on.
// This file stands her on her feet (Joshua, 2026-11-17: "she is skating as her
// feet aren't actually driving her along the ground like it should be"):
//
//   1. THE FOOT THAT CARRIES HER IS THE ONE ON THE FLOOR. Her measured stride
//      (bodyMotion.ts `StrideTable`) says which foot is PLANTED at each moment of
//      a stride. She is lowered until that foot stands on the floor. Before, she
//      was lowered onto whichever ankle was lowest, and in a run that was often
//      the foot that had just pushed off: it stayed on the ground while it was
//      already swinging forward, which is a foot sliding.
//   2. HER LOOK'S BOB, AND A RUN'S BOUNCE. Walking, her legs' own rise and fall
//      shows by her look's Bob (the builder's WALK Bob: all of it at 200 %).
//      Running, her hips ride lower and bounce a little, lowest as each foot
//      carries her and highest between steps, and her standing knee bends to
//      take it up, as a runner's does.
//   3. A PLANTED FOOT STAYS WHERE IT WAS PUT DOWN. The spot on the ground where a
//      foot lands is remembered, and while that foot is planted its leg reaches
//      back to that spot each frame (hip, knee, ankle: a "two-bone reach"). Her
//      stride is already turned by the distance she really covers, so the reach
//      is a centimetre or two; it takes up what is left (her hips rolling and
//      turning with each step, a start, a stop, a turn). A foot can only be held
//      `lockMost` from where her pose has it: past that it slips, as a foot does.
//   4. NO FOOT GOES THROUGH THE FLOOR: A KNEE BENDS INSTEAD, by the same reach.
//      A swinging foot is kept just clear of the floor, so it is seen to leave
//      the ground when it stops carrying her.
//   5. HER WEIGHT SHIFTS OVER THE FOOT SHE STANDS ON (the builder's WALK Sway):
//      she is moved sideways by it, and her planted foot stays put under her.
//   6. A STEP ON THE SPOT. Standing, a foot left more than `stepOffset` from
//      where her pose stands it (her legs turned under her, or she has just
//      stopped) is picked up and set down where it belongs, one foot at a time:
//      she steps round as she turns (Joshua, 2026-11-17: "the feet move around
//      in the turn").
//
//   8. SHOULDER WIDTH, AND THE CRAB STEP (Joshua, 2026-11-18: "she should
//      stand and walk about shoulder width"; "if moving left, left leg moves 1
//      shoulder length to the left while the body catches up and then the
//      right leg ends up under the right shoulder"). Standing, each foot's HOME
//      is spread out from where the builder's stand puts it until her feet
//      are her own shoulder width apart. Going SIDEWAYS (`update`'s `crab`),
//      the builder's walk is not used: her LEAD foot (the side she goes to)
//      is picked up and set down one shoulder width out; when her body has
//      come over it, her TRAILING foot is picked up and set down under its
//      shoulder; and again. Every step while she stands (a crab step, or a
//      step on the spot) carries the foot from where it was to where it is
//      going, lifted on the way.
//
//   7. HER LEGS TURNED UNDER HER (Joshua's five bands, 2026-11-17: when her head
//      turns, her belly and hips turn 60 % of the way, her upper legs 40 %, her
//      lower legs and feet 20 %; the rule itself is input/bodyTurn.ts). Her hips
//      are turned here, which carries her hip joints round; each foot stays
//      where her pose stands it and only pivots on its spot; and each leg is
//      reached from its hip, where that now is, to its foot, with its thigh and
//      its shin each turned to face the way its band does.
//
//  10. TURNING ON THE SPOT, A STEP AT A TIME (Joshua, 2026-11-20: "whenever
//      she is tracking an object, she looks like she is marching in place but
//      her body rotates"; "for a Left turn: Left foot out to the side and back
//      a little with a left outward rotation. If the angle is more than 40°,
//      the right foot will move up and back towards the body with a left twist
//      and so on… right would be the opposite"). Standing, her planted feet
//      KEEP FACING THE WAY THEY LANDED while her body turns over them (no more
//      pivoting along with her), and a turn is stepped, not marched:
//        - once she has turned `turnStepAt` from the way her feet were set,
//          the foot on the side she turns to (her left, turning left) steps OUT
//          to its side and a little BACK, its toes turned out the way she turns;
//        - once she has turned `turnTrailAt` (40 degrees), her other foot comes
//          up and in, under its shoulder, turned to her new way ("a twist");
//        - and again, for as long as she keeps turning.
//      A turn that stops short of 40 degrees leaves her feet as they are; she
//      squares them up after standing still for `turnSettle`.
//   9. UNEVEN GROUND (Joshua, 2026-11-19, the island: "making sure her feet
//      actually walk and snap to the ground"). With `groundAt` set (the
//      island's drawn ground: src/world/island/), each foot stands on the
//      ground under IT, not on one flat floor at her root's height: she comes
//      down as far as her LOWER planted foot's ground is below her root (or up,
//      if both are higher), the knee of the higher foot bends to take up the
//      rest, a swinging foot clears the ground under it, and each foot is
//      tipped to lie along the slope it stands on (up to `tiltMost`).
//
// The builder has a fuller version of 3 and 4 for its own room (actor/
// humanFeet.ts: heels that rise, feet that follow slopes). This is a small one
// in the game's own space, that also handles running.
//
// Nothing here allocates while the game runs.
// ============================================================================
import { plantedAt } from './strideShape';
import * as THREE from 'three';
import type { BodyMotion } from './bodyMotion';
import { turnInWorld } from './boneTurn';

/** GAME TUNING for her feet on the floor. Lengths in metres, times in seconds, unless they say otherwise. */
export const FOOT_GROUND = {
  /** RUNNING: how far below standing her hips ride, as a share of her leg (hip to ankle). Her knees bend to take it up. */
  runDrop: 0.07,
  /** RUNNING: her bounce from lowest to highest when all of her Bob shows (her look's Bob and her speed scale it). */
  runBob: 0.025,
  /** UNEVEN GROUND: a foot's ground is taken as at most this far above or below her root's (a cliff edge is not a step). */
  groundMost: 0.45,
  /** ...a foot is tipped to lie along its slope by at most this much (radians, about 28 degrees)... */
  tiltMost: 0.5,
  /** ...measured over this distance either side of it, metres (the island's ground is flat across each 27 m square). */
  tiltSpan: 0.2,
  /** A swinging foot is kept at least this far off the floor through the middle of its swing... */
  clear: 0.015,
  /** ...easing in over this share of the swing after it leaves the ground, and out the same before it lands. */
  clearEase: 0.1,
  /** A planted foot is held to its spot up to this far from where her pose has it; past that it slips. */
  lockMost: 0.07,
  /** A foot that has stopped being planted eases back to where her pose has it over about this long. */
  release: 0.05,
  /** A correction smaller than this is not worth bending a knee for. */
  least: 0.0005,
  /** A straight leg is given this much forward, as a share of the thigh, so its knee knows which way to bend. */
  kneeForward: 0.05,
  /**
   * HER HIPS TURNED (see 7 above): her hip joints swing round and away from over her feet, so she comes down a
   * little for her legs to still reach them: this far standing, and this much more walking (a leg stepping out in
   * front has the least to spare), when her hips are turned `twistFull` radians (54 degrees: her head's full 90).
   */
  twistDropStanding: 0.015,
  twistDropWalking: 0.02,
  twistFull: (54 * Math.PI) / 180,
  /**
   * A STEP ON THE SPOT. Standing, a foot held more than `stepOffset` from where her pose stands it is picked up
   * `stepHeight` and set down where it belongs over `stepSeconds`, one foot at a time. Once she has been still for
   * `stepSettle`, a foot left more than `settleOffset` out is tidied the same way, so she ends standing square.
   */
  stepOffset: 0.04,
  stepHeight: 0.035,
  stepSeconds: 0.28,
  stepSettle: 0.3,
  settleOffset: 0.012,
  /** STANDING, her feet are this share of her shoulder width apart (ankle to ankle; 1: shoulder width). */
  stanceShare: 1,
  /**
   * THE CRAB STEP: her lead foot steps out `crabReach` of her shoulder width; her trailing foot steps in once it is
   * left `crabTrailAt` of a shoulder width behind its home; the lead steps again once her body is within
   * `crabLeadAt` of a shoulder width of being over it. A crab step is lifted `crabHeight` and takes `crabSeconds`,
   * or less when she goes faster (never under `crabSecondsLeast`). She counts as going sideways from `crabFrom`
   * metres a second across.
   */
  crabReach: 1,
  /** ...plus this share of how far she goes while the step is in the air (fast steps reach further). */
  crabSpeedReach: 2,
  /** ...but never more than this many shoulder widths (her legs only open so far). */
  crabReachMost: 1.8,
  crabTrailAt: 0.8,
  crabLeadAt: 0.12,
  crabHeight: 0.06,
  crabSeconds: 0.3,
  crabSecondsLeast: 0.14,
  crabFrom: 0.05,
  /** THE SHUFFLE: her trailing foot lands this share of a shoulder width closer to her lead foot than a crab walk's,
   * steps in this much sooner (of a shoulder width), and her feet are lifted this share less. */
  shuffleCloses: 0.5,
  shuffleSooner: 0.3,
  shuffleLower: 0.6,
  /** THE SKIP: how high her body hops as her trailing foot comes in (metres, with all of its hop), both feet in the air. */
  skipHop: 0.06,
  /** Standing, a planted foot may be held this far from its home before it slips (crab steps hold feet well out). */
  standLockMost: 0.6,
  /**
   * TURNING ON THE SPOT (see 10 above; radians unless they say otherwise). Her lead foot steps once she has turned
   * `turnStepAt` (about 15 degrees) from the way her feet were set; her other foot once she has turned `turnTrailAt`
   * (Joshua's 40 degrees). The lead foot lands `turnOut` metres out to its side and `turnBack` back, its toes
   * `toeOut` further round than her body; the other comes in `trailBack` back of its home, square to her. A turn step
   * takes `turnSeconds`. A planted foot's own way is held up to `faceMost` from her body's (an ankle turns only so
   * far; past it the foot turns with her). Turning slower than `turnStill` a second counts as standing still, and after
   * `turnSettle` seconds of that a foot left out of place is squared up.
   */
  turnStepAt: (15 * Math.PI) / 180,
  turnTrailAt: (40 * Math.PI) / 180,
  turnOut: 0.04,
  turnBack: 0.06,
  trailBack: 0.02,
  toeOut: (15 * Math.PI) / 180,
  turnSeconds: 0.32,
  faceMost: (55 * Math.PI) / 180,
  turnStill: (3 * Math.PI) / 180,
  turnSettle: 1.0,
} as const;

/**
 * Going sideways, for the crab step: the way she goes over the ground (world x and z, a unit direction), how fast
 * (metres a second), and which foot leads (0 her left, 1 her right: the side she goes toward).
 */
export interface CrabMove {
  x: number; z: number; speed: number; lead: 0 | 1;
  /** The style of step: 0 a crab walk, 1 a shuffle (the trailing foot closes in to half a shoulder width, feet low,
   * quicker), 2 a skip (a shuffle with a hop: both feet off the ground as the trailing foot comes in). In between, a blend. */
  style: number;
  /** How much of a skip's hop her body allows, 0..1 (her belly: a big belly shuffles instead). */
  hop: number;
}

/** One leg's bones: the hip joint (it turns her thigh), the knee (it turns her shin) and the ankle (her foot). */
export interface LegBones { readonly hip: THREE.Bone; readonly knee: THREE.Bone; readonly ankle: THREE.Bone }

/**
 * How her hips and legs are turned this frame, each measured from the way her root faces (radians about the upright
 * axis; Joshua's bands: her belly and hips, her upper legs, her lower legs and feet).
 */
export interface LegTwist {
  /** The bone that is turned for her hips: it carries her legs and her spine. */
  readonly hipsBone: THREE.Bone;
  hips: number;
  upperLegs: number;
  feet: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** An angle brought into -PI..PI (radians). */
const wrapAngle = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** 0 below `from`, 1 above `to`, an S-shaped ease between. */
const ease = (from: number, to: number, v: number) => { const t = clamp((v - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };
const fract = (v: number) => v - Math.floor(v);

// Scratch objects, made once.
const hipAt = new THREE.Vector3(), kneeAt = new THREE.Vector3(), ankleAt = new THREE.Vector3(), goal = new THREE.Vector3();
const line = new THREE.Vector3(), bend = new THREE.Vector3(), ahead = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
const parentQ = new THREE.Quaternion(), turn = new THREE.Quaternion(), footQ = new THREE.Quaternion();
const UPRIGHT = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), slope = new THREE.Vector3();

/** One foot's memory between frames. */
interface Foot {
  /** It is planted and held to a spot on the ground: that spot (world x and z of its ankle). */
  locked: boolean;
  lockX: number;
  lockZ: number;
  /** How far its ankle is moved from where her pose has it, over the ground (world x and z). */
  offX: number;
  offZ: number;
  /** This frame, as her pose has the leg before her hips are turned: where its ankle is, which way its knee is off
   * the line from hip to ankle, and how its foot lies. */
  readonly ankle: THREE.Vector3;
  readonly knee: THREE.Vector3;
  readonly lie: THREE.Quaternion;
  /** This frame: how far its ankle is to be raised, and whether its leg is to be reached at all. */
  raise: number;
  /** This frame: its HOME over the ground (where her pose stands it, spread to her stance width; world x and z). */
  homeX: number;
  homeZ: number;
}

export class FootGround {
  /** How far she is lowered now, metres (0 standing). For a readout. */
  drop = 0;
  /**
   * UNEVEN GROUND: the ground's height at a place (world metres), or null on a flat floor at her root's height. NaN
   * (nothing known there) counts as her root's height. Set by the game on the island (fastHeroine.ts setGround).
   */
  groundAt: ((x: number, z: number) => number) | null = null;
  /** CROUCHING (groundPose.ts): her hips this much lower, metres; her knees bend to keep her feet on the ground. */
  crouchDrop = 0;
  /** This frame: each foot's ground, metres above (+) or below (-) her root, and how it is tipped to lie on it. */
  private readonly groundUnder: [number, number] = [0, 0];
  private readonly tilt: [THREE.Quaternion, THREE.Quaternion] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly tilted: [boolean, boolean] = [false, false];
  /** How far each foot was lifted by bending its knee this frame, metres (left, right). For a readout and the tests. */
  readonly raised: [number, number] = [0, 0];
  /** Whether each foot is planted this frame (left, right). */
  readonly planted: [boolean, boolean] = [true, true];
  /** How far each foot is held from where her pose has it this frame, metres over the ground (left, right). */
  readonly held: [number, number] = [0, 0];
  /** Which foot is taking a step on the spot (-1: neither), and how far through it (0..1). */
  stepFoot = -1;
  private stepClock = 0;
  /** The step being taken: where the foot left from and where it will land (world x and z), and how long it takes. */
  private readonly stepFrom = [0, 0];
  private readonly stepTo = [0, 0];
  private stepSeconds: number = FOOT_GROUND.stepSeconds;
  private stepHigh: number = FOOT_GROUND.stepHeight;
  /** Going sideways, which foot steps next: her lead foot (out) or her trailing foot (in). */
  private crabNext: 'lead' | 'trail' = 'lead';
  /** The step being taken is a crab step (her trailing foot's, `stepHop` high: a skip's hop). */
  crabbing = false;
  private stepHop = 0;
  /** How high she is hopping this frame (metres). */
  private hopNow = 0;
  /** Her shoulder width, metres (set by the heroine, from her shoulder bones), and how far apart her pose stands her
   * ankles (measured when she is made). Her stance spreads her feet from the second to the first. */
  shoulderWidth = 0;
  readonly poseWidth: number;
  /** Seconds since she last moved or turned. */
  private stillFor = 0;
  /**
   * TURNING ON THE SPOT (see 10 above). `footFace`: the way each foot faces over the ground (world yaw, radians),
   * held while it is planted; `faceFrom`/`faceTo` the stepping foot's, as it leaves and as it lands. `squareYaw`: the
   * way her body faced when her feet were last set square to her. `turnStage`: 0 her feet square, 1 her lead foot has
   * stepped (`turnLead`), 2 her other foot is stepping in. `lastYaw` and `turnQuiet`: her body's way last frame, and
   * how long she has turned slower than `turnStill`.
   */
  private readonly footFace: [number, number] = [NaN, NaN];
  private faceFrom = 0;
  private faceTo = 0;
  private squareYaw = NaN;
  private turnStage: 0 | 1 | 2 = 0;
  private turnLead = 0;
  private lastYaw = NaN;
  private turnQuiet = 0;

  private readonly legs: readonly [LegBones, LegBones];
  private readonly feet: readonly [Foot, Foot] = [
    { locked: false, lockX: 0, lockZ: 0, offX: 0, offZ: 0, ankle: new THREE.Vector3(), knee: new THREE.Vector3(), lie: new THREE.Quaternion(), raise: 0, homeX: 0, homeZ: 0 },
    { locked: false, lockX: 0, lockZ: 0, offX: 0, offZ: 0, ankle: new THREE.Vector3(), knee: new THREE.Vector3(), lie: new THREE.Quaternion(), raise: 0, homeX: 0, homeZ: 0 },
  ];
  /** Where her fit sits when she stands, and how high each ankle is over the floor then (in her root's frame). */
  private readonly fitFloorY: number;
  private readonly standY: [number, number] = [0, 0];
  // scratch
  private readonly lift: [number, number] = [0, 0];
  private readonly swing: [number, number] = [-1, -1];

  /**
   * @param root   the heroine's root: the game moves and turns it; the floor is its y
   * @param fit    the group inside it that holds her at her size, soles on the floor: this file moves it down and sideways
   * @param left   her left leg's bones, and `right` her right's
   * @param leg    her leg's length, hip to ankle, metres
   * She must be standing (the builder's stand pose on her bones) when this is made: her ankles are measured as they are.
   */
  constructor(private readonly root: THREE.Object3D, private readonly fit: THREE.Object3D, left: LegBones, right: LegBones, private readonly leg: number) {
    this.legs = [left, right];
    this.fitFloorY = fit.position.y;
    root.updateMatrixWorld(true);
    for (let side = 0; side < 2; side++) this.standY[side] = this.legs[side].ankle.matrixWorld.elements[13] - root.position.y;
    this.poseWidth = new THREE.Vector3().setFromMatrixPosition(left.ankle.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(right.ankle.matrixWorld));
  }

  /** Let go of both feet (she has been put somewhere else: the spots her feet were held to mean nothing there). */
  letGo(): void {
    for (const foot of this.feet) { foot.locked = false; foot.offX = 0; foot.offZ = 0; }
    this.held[0] = 0;
    this.held[1] = 0;
    this.stepFoot = -1;
  }

  /**
   * One frame, after her pose is on her bones.
   * @param dt        seconds since the last frame
   * @param motion    her pose's state this frame: where she is in her stride, how much she walks or runs, her sway
   * @param share     how much of her legs' rise and fall shows, 0..1 (her look's Bob, eased off with her speed)
   * @param moving    she moved or turned this frame (a step on the spot waits for her to be still before it tidies her feet)
   * @param twist     how her hips and legs are turned from the way her root faces (null: not at all)
   * @param crab      she is going sideways (null: not): her feet take crab steps
   */
  update(dt: number, motion: BodyMotion, share: number, moving: boolean, twist: LegTwist | null = null, crab: CrabMove | null = null): void {
    const { root, fit, legs, feet, lift, swing } = this;
    const tuning = FOOT_GROUND, strides = motion.strides, walk = motion.walkBlend, run = motion.runBlend;
    this.stillFor = moving ? 0 : this.stillFor + dt;

    // Her bones as her pose has them, with her hips where they are when she stands (not yet lowered or shifted).
    fit.position.x = 0;
    fit.position.y = this.fitFloorY;
    root.updateMatrixWorld(true);
    for (let side = 0; side < 2; side++) lift[side] = legs[side].ankle.matrixWorld.elements[13] - root.position.y - this.standY[side];
    this.measureGround();

    // ---- which feet are planted, and how far through its swing each of the others is (0 leaving .. 1 landing) ----
    swing[0] = -1;
    swing[1] = -1;
    let drop = 0;
    // (her walk's own steps: while she walks, unless she has gone over to crab steps, which take her feet at once
    //  even while the builder's walk is still fading from her legs)
    const walking = walk > 0 && strides !== null && strides !== undefined && !(crab && crab.speed >= tuning.crabFrom) && !this.crabbing;
    if (walking && strides) {
      this.stepFoot = -1;                                          // (walking has steps of its own)
      this.crabbing = false;
      this.stepHop = 0;
      // (each foot is down for its share of the stride from where it lands, the left at 0.25 and the right at 0.75:
      //  the share follows her speed, so the faster she goes the more of each stride is in the air: strideShape.ts)
      const down = motion.shape.share;
      for (let side = 0; side < 2; side++) {
        const landsAt = side === 0 ? 0.25 : 0.75, leavesAt = fract(landsAt + down);
        this.planted[side] = plantedAt(motion.phase, side, down);
        if (this.planted[side]) continue;
        swing[side] = clamp(fract(motion.phase - leavesAt) / (1 - down), 0, 1);
      }

      // ---- how far she comes down ----
      // WALKING: onto the planted foot that is lower (both feet down between steps: the one behind, until the one in
      // front has come down to it). Her look's Bob shows that share of the rise and fall; the rest she stays down for.
      const need = Math.min(this.planted[0] ? lift[0] : Infinity, this.planted[1] ? lift[1] : Infinity);
      const most = strides.walk.needMost * walk;
      const walking = Number.isFinite(need) ? need + (1 - share) * Math.max(0, most - need) : most;
      if (run <= 0) drop = walking;
      else {
        // RUNNING: her hips ride lower, and bounce: highest between steps, lowest as each foot carries her.
        // (the middle of the moment both feet are up: from her left foot leaving to her right foot landing)
        const flight = fract(0.25 + down + (0.75 - 0.25 - down) / 2);
        const running = (tuning.runDrop * this.leg - 0.5 * tuning.runBob * share * Math.cos(4 * Math.PI * (motion.phase - flight))) * walk;
        drop = walking + (running - walking) * run;
      }
    } else {
      // STANDING: both feet planted but for the one taking a step (a crab step or a step on the spot: decided below,
      // once each foot's home is known)
      if (this.stepFoot >= 0) {
        this.stepClock += dt / this.stepSeconds;
        if (this.stepClock >= 1) {
          // (landed: held to where it came down)
          const f = feet[this.stepFoot];
          f.locked = true; f.lockX = this.stepTo[0]; f.lockZ = this.stepTo[1];
          this.footFace[this.stepFoot] = this.faceTo;   // (and keeps facing the way it landed)
          this.stepFoot = -1;
          this.crabbing = false;
          this.stepHop = 0;
        }
      }
      this.planted[0] = this.stepFoot !== 0;
      this.planted[1] = this.stepFoot !== 1;
    }
    // UNEVEN GROUND: down as far as her lower planted foot's ground is below her root (up, if both are higher), so that
    // foot reaches its ground just as it would a flat floor; the higher foot's knee bends for the rest (below)
    if (this.groundAt) {
      const g = this.groundUnder;
      const lowest = this.planted[0] && this.planted[1] ? Math.min(g[0], g[1]) : this.planted[0] ? g[0] : this.planted[1] ? g[1] : Math.min(g[0], g[1]);
      drop -= lowest;
    }
    // (her hips turned: her hip joints are no longer over her feet, so she comes down a little for her legs to reach)
    const turned = twist !== null && Math.abs(twist.hips) > 1e-4;
    if (turned) drop += (tuning.twistDropStanding + tuning.twistDropWalking * walk) * Math.min(1, Math.abs(twist.hips) / tuning.twistFull);
    drop += this.crouchDrop;
    this.drop = drop;

    // ---- each foot: held to its spot and on the floor if it is planted, clear of the floor if it swings ----
    const yaw = root.rotation.y, aheadX = Math.sin(yaw), aheadZ = Math.cos(yaw);
    // TURNING ON THE SPOT (see 10 above): how fast she is turning, and how far from the way her feet were set
    if (!Number.isFinite(this.lastYaw)) this.lastYaw = yaw;
    const turnRate = dt > 0 ? Math.abs(wrapAngle(yaw - this.lastYaw)) / dt : 0;
    this.lastYaw = yaw;
    this.turnQuiet = turnRate < tuning.turnStill ? this.turnQuiet + dt : 0;
    // (walking or going sideways her feet go with her walk: they face her way, and she counts as square)
    const feetFree = walking || this.crabbing || !!(crab && crab.speed >= tuning.crabFrom);
    if (feetFree || !Number.isFinite(this.squareYaw)) {
      this.squareYaw = yaw;
      this.turnStage = 0;
      if (this.stepFoot < 0 || walking) { this.footFace[0] = yaw; this.footFace[1] = yaw; }
    }
    for (let side = 0; side < 2; side++) if (!Number.isFinite(this.footFace[side])) this.footFace[side] = yaw;
    const turnedBy = wrapAngle(yaw - this.squareYaw);   // (+: she has turned to her left)
    // (she is about to be moved sideways by her sway: toward her left, which is across her forward)
    const shiftX = motion.sway * aheadZ, shiftZ = -motion.sway * aheadX;
    const fade = Math.exp(-dt / tuning.release);
    // HER STANCE: standing, each foot's home is spread out from where her pose stands it, to her shoulder width (her
    // left is across her forward: x = cos(yaw), z = -sin(yaw)); walking, the builder's stride has its own width
    const spread = this.shoulderWidth > 0 ? Math.max(0, (this.shoulderWidth * tuning.stanceShare - this.poseWidth) / 2) * (1 - walk) : 0;
    const leftX = Math.cos(yaw), leftZ = -Math.sin(yaw);
    for (let side = 0; side < 2; side++) {
      const foot = feet[side], out = side === 0 ? spread : -spread;
      foot.ankle.setFromMatrixPosition(legs[side].ankle.matrixWorld);
      foot.homeX = foot.ankle.x + leftX * out;
      foot.homeZ = foot.ankle.z + leftZ * out;
    }
    // STANDING: WHICH FOOT STEPS NEXT (when none is stepping)
    if (!walking && this.stepFoot < 0) {
      if (crab && crab.speed >= tuning.crabFrom && this.shoulderWidth > 0) {
        // THE CRAB STEP: how far each foot is out from its home, the way she goes (+ ahead of it, - left behind)
        const width = this.shoulderWidth;
        const lead = crab.lead, trail = lead === 0 ? 1 : 0;
        const along = (side: number): number => {
          const f = feet[side];
          const atX = f.locked ? f.lockX : f.homeX + shiftX, atZ = f.locked ? f.lockZ : f.homeZ + shiftZ;
          return (atX - f.homeX - shiftX) * crab.x + (atZ - f.homeZ - shiftZ) * crab.z;
        };
        const seconds = clamp(width / (2.2 * crab.speed), tuning.crabSecondsLeast, tuning.crabSeconds);
        // (the style: how much of a shuffle, and how much of a skip's hop)
        const shuffle = clamp(crab.style, 0, 1), skip = clamp(crab.style - 1, 0, 1) * clamp(crab.hop, 0, 1);
        const high = tuning.crabHeight * (1 - tuning.shuffleLower * shuffle);
        if (this.crabNext === 'lead' && along(lead) <= width * tuning.crabLeadAt) {
          // her lead foot steps OUT: one shoulder width further the way she goes
          // (faster, it reaches further, as a skip's stride lengthens: her body would otherwise outrun her feet)
          const out = Math.min(width * tuning.crabReachMost, width * tuning.crabReach + crab.speed * seconds * tuning.crabSpeedReach);
          this.beginStep(lead, crab.x * out, crab.z * out, seconds, high, false);
          this.crabbing = true;
          this.crabNext = 'trail';
        } else if (this.crabNext === 'trail' && along(trail) <= -width * (tuning.crabTrailAt - tuning.shuffleSooner * shuffle)) {
          // her trailing foot steps IN: to a shoulder width behind her lead foot (under its shoulder once her body is
          // over her lead foot), or, shuffling, closer: half that
          const l = feet[lead];
          const leadX = l.locked ? l.lockX : l.homeX + l.offX, leadZ = l.locked ? l.lockZ : l.homeZ + l.offZ;
          const gap = width * (1 - tuning.shuffleCloses * shuffle);
          this.beginStepTo(trail, leadX - crab.x * gap, leadZ - crab.z * gap, seconds, high);
          this.crabbing = true;
          this.stepHop = tuning.skipHop * skip;
          this.crabNext = 'lead';
        }
      } else {
        this.crabNext = 'lead';
        // her left is across her forward (x = cos(yaw), z = -sin(yaw)); `out` is +1 for her left foot, -1 her right
        const outOf = (side: number): number => (side === 0 ? 1 : -1);
        if (this.turnStage === 1 && turnedBy * outOf(this.turnLead) < 0) this.turnStage = 0;   // (she turned back the other way)
        if (this.turnStage === 2) {
          // HER OTHER FOOT HAS COME IN: her feet are set to her new way
          this.turnStage = 0;
          this.squareYaw = yaw;
        } else if (this.turnStage === 0 && Math.abs(turnedBy) >= tuning.turnStepAt) {
          // A TURN BEGINS: the foot on the side she turns to steps out to its side and a little back, toes turned out
          const lead = turnedBy > 0 ? 0 : 1, out = outOf(lead);
          this.beginStep(lead, -aheadX * tuning.turnBack + leftX * out * tuning.turnOut, -aheadZ * tuning.turnBack + leftZ * out * tuning.turnOut, tuning.turnSeconds, tuning.stepHeight, true);
          this.faceTo = yaw + out * tuning.toeOut;
          this.turnLead = lead;
          this.turnStage = 1;
        } else if (this.turnStage === 1 && Math.abs(turnedBy) >= tuning.turnTrailAt) {
          // PAST 40 DEGREES: her other foot comes up and in, under its shoulder, turned to her new way
          const trail = 1 - this.turnLead;
          this.beginStep(trail, -aheadX * tuning.trailBack, -aheadZ * tuning.trailBack, tuning.turnSeconds, tuning.stepHeight, true);
          this.faceTo = yaw;
          this.turnStage = 2;
        } else if (this.turnQuiet >= tuning.stepSettle && (this.turnStage === 0 && Math.abs(turnedBy) < tuning.turnStepAt * 0.5 || this.turnQuiet >= tuning.turnSettle)) {
          // A STEP ON THE SPOT (she is not turning, and her feet are square or the turn is long over): the foot held
          // furthest from its home goes first, set down at home and square to her. (Never while she turns: it stepped
          // in between her turn steps, so she marched again.)
          const far = this.held[0] >= this.held[1] ? 0 : 1;
          const facing = Math.max(Math.abs(wrapAngle(this.footFace[0] - yaw)), Math.abs(wrapAngle(this.footFace[1] - yaw)));
          const limit = this.stillFor >= tuning.stepSettle ? tuning.settleOffset : tuning.stepOffset;
          // (a foot turned away from her by more than her settle step counts too: it is squared up)
          const turnedFoot = Math.abs(wrapAngle(this.footFace[0] - yaw)) >= Math.abs(wrapAngle(this.footFace[1] - yaw)) ? 0 : 1;
          if (this.held[far] > limit) {
            this.beginStep(far, 0, 0, tuning.stepSeconds, tuning.stepHeight, true);
            this.faceTo = yaw;
          } else if (this.turnQuiet >= tuning.turnSettle && facing > tuning.turnStill * 2) {
            this.beginStep(turnedFoot, 0, 0, tuning.stepSeconds, tuning.stepHeight, true);
            this.faceTo = yaw;
          }
          if (this.turnQuiet >= tuning.turnSettle && this.held[0] <= limit && this.held[1] <= limit && facing <= tuning.turnStill * 2) {
            this.squareYaw = yaw;
            this.turnStage = 0;
          }
        }
      }
      this.planted[0] = this.stepFoot !== 0;
      this.planted[1] = this.stepFoot !== 1;
    }
    for (let side = 0; side < 2; side++) {
      const foot = feet[side], leg = legs[side];
      // her leg as her pose has it (her hips not yet turned): its ankle, how its foot lies, and which way its knee
      // stands off the line from hip to ankle
      foot.ankle.setFromMatrixPosition(leg.ankle.matrixWorld);
      leg.ankle.getWorldQuaternion(foot.lie);
      hipAt.setFromMatrixPosition(leg.hip.matrixWorld);
      line.copy(foot.ankle).sub(hipAt).normalize();
      foot.knee.setFromMatrixPosition(leg.knee.matrixWorld).sub(hipAt);
      foot.knee.addScaledVector(line, -foot.knee.dot(line));
      // where her pose (and her sway, and her stance) puts this ankle over the ground
      const poseX = foot.homeX + shiftX, poseZ = foot.homeZ + shiftZ;
      if (this.stepFoot === side && !walking) {
        // STEPPING (standing): carried from where it left to where it lands, smoothly, lifted on the way
        const t = clamp(this.stepClock, 0, 1), smooth = t * t * (3 - 2 * t);
        foot.locked = false;
        // (turned from the way it faced to the way it will land as it goes)
        this.footFace[side] = this.faceFrom + wrapAngle(this.faceTo - this.faceFrom) * smooth;
        foot.offX = this.stepFrom[0] + (this.stepTo[0] - this.stepFrom[0]) * smooth - poseX;
        foot.offZ = this.stepFrom[1] + (this.stepTo[1] - this.stepFrom[1]) * smooth - poseZ;
      } else if (this.planted[side]) {
        // PLANTED: held to the spot it was put down on (taken as it lands, from where it is this frame)
        if (!foot.locked) { foot.locked = true; foot.lockX = poseX + foot.offX; foot.lockZ = poseZ + foot.offZ; }
        foot.offX = foot.lockX - poseX;
        foot.offZ = foot.lockZ - poseZ;
        const far = Math.hypot(foot.offX, foot.offZ), most = walking ? tuning.lockMost : tuning.standLockMost;
        if (far > most) {
          // (further than a foot can be held: it slips, and its spot goes with it)
          const keep = most / far;
          foot.offX *= keep; foot.offZ *= keep;
          foot.lockX = poseX + foot.offX; foot.lockZ = poseZ + foot.offZ;
        }
      } else {
        // SWINGING: let go, easing back to where her pose has it
        foot.locked = false;
        foot.offX *= fade; foot.offZ *= fade;
      }
      this.held[side] = Math.hypot(foot.offX, foot.offZ);

      const above = lift[side] - this.groundUnder[side] - drop;    // where her pose leaves this foot: over ITS ground (+) or under it (-)
      let want = Math.max(above, 0);                               // (a planted foot above the floor cannot be reached down: a leg cannot grow)
      if (swing[side] >= 0) want = Math.max(want, tuning.clear * walk * ease(0, tuning.clearEase, swing[side]) * ease(0, tuning.clearEase, 1 - swing[side]));
      if (this.stepFoot === side) want = Math.max(want, this.stepHigh * Math.sin(Math.PI * clamp(this.stepClock, 0, 1)));
      foot.raise = want - above;
      this.raised[side] = foot.raise > tuning.least ? foot.raise : 0;
    }

    // ---- her hips turned (her belly's band): her hip joints swing round with them, her spine and all above too ----
    if (turned) {
      twist.hipsBone.parent?.getWorldQuaternion(parentQ);
      turn.setFromAxisAngle(UPRIGHT, twist.hips);
      twist.hipsBone.quaternion.premultiply(parentQ).premultiply(turn).premultiply(parentQ.invert());
      twist.hipsBone.updateMatrixWorld(true);
    }

    // ---- each leg reached from its hip to where its foot is to be ----
    const thighYaw = yaw + (turned ? twist.upperLegs : 0);
    for (let side = 0; side < 2; side++) {
      const foot = feet[side];
      // TURNING ON THE SPOT: how much further round this foot faces than her body (held to where it landed, as far
      // as her ankle turns; walking, none)
      let held = feetFree ? 0 : clamp(wrapAngle(this.footFace[side] - yaw), -tuning.faceMost, tuning.faceMost);
      if (feetFree) this.footFace[side] = yaw;
      else if (Math.abs(wrapAngle(this.footFace[side] - yaw)) > tuning.faceMost) this.footFace[side] = yaw + held;   // (past it, it turns with her)
      if (Math.abs(held) < 1e-4) held = 0;
      if (!turned && !this.tilted[side] && spread <= tuning.least && foot.raise <= tuning.least && this.held[side] <= tuning.least && held === 0) continue;
      goal.set(foot.homeX + foot.offX, foot.ankle.y + Math.max(0, foot.raise), foot.homeZ + foot.offZ);
      if (turned) {
        // her knee stands off the way her upper legs face; her foot lies as her pose had it, pivoted to its band
        bend.copy(foot.knee).applyAxisAngle(UPRIGHT, twist.upperLegs);
        footQ.setFromAxisAngle(UPRIGHT, twist.feet + held).multiply(foot.lie);
        if (this.tilted[side]) footQ.premultiply(this.tilt[side]); // (laid along its slope)
        this.reach(legs[side], goal, bend, Math.sin(thighYaw), Math.cos(thighYaw), footQ, twist.upperLegs - twist.hips, twist.feet - twist.upperLegs);
      } else {
        footQ.setFromAxisAngle(UPRIGHT, held).multiply(foot.lie);
        if (this.tilted[side]) footQ.premultiply(this.tilt[side]); // (laid along its slope)
        // (a foot turned on its own: its shin turns half of it, its thigh a quarter, as a leg does)
        this.reach(legs[side], goal, bend.copy(foot.knee).applyAxisAngle(UPRIGHT, held * 0.25), aheadX, aheadZ, footQ, held * 0.25, held * 0.25);
      }
    }

    // ---- and she is set down: lowered, and moved over the foot she stands on ----
    // (a SKIP: her whole body hops through the middle of her trailing foot's step, carrying her planted foot up off
    //  the ground with it: for a moment both feet are in the air)
    this.hopNow = this.stepFoot >= 0 && this.stepHop > 0 ? this.stepHop * Math.sin(Math.PI * clamp(this.stepClock, 0, 1)) : 0;
    fit.position.y = this.fitFloorY - drop + this.hopNow;
    fit.position.x = motion.sway;
  }

  /**
   * UNEVEN GROUND: the ground under each foot (where it was last frame: where her pose puts it plus how far it is held
   * from there), as metres above or below her root, and the tip that lays the foot along that ground's slope.
   */
  private measureGround(): void {
    const at = this.groundAt, tuning = FOOT_GROUND;
    for (let side = 0; side < 2; side++) {
      this.groundUnder[side] = 0;
      this.tilted[side] = false;
      if (!at) continue;
      const e = this.legs[side].ankle.matrixWorld.elements, foot = this.feet[side];
      const x = e[12] + foot.offX, z = e[14] + foot.offZ, base = this.root.position.y;
      const g = at(x, z);
      if (!Number.isFinite(g)) continue;
      this.groundUnder[side] = clamp(g - base, -tuning.groundMost, tuning.groundMost);
      // the slope there: the ground's rise across a short span east-west and north-south, as the way the ground faces
      const d = tuning.tiltSpan;
      const east = at(x + d, z) - at(x - d, z), south = at(x, z + d) - at(x, z - d);
      if (!Number.isFinite(east) || !Number.isFinite(south)) continue;
      slope.set(-east / (2 * d), 1, -south / (2 * d)).normalize();
      const angle = Math.acos(clamp(slope.y, -1, 1));
      if (angle < 0.01) continue;
      if (angle > tuning.tiltMost) slope.lerpVectors(UPRIGHT, slope, tuning.tiltMost / angle).normalize();
      this.tilt[side].setFromUnitVectors(UPRIGHT, slope);
      this.tilted[side] = true;
    }
  }

  /** Begin a step (standing) with one foot from where it is now to a spot (world x and z). */
  private beginStepTo(side: number, toX: number, toZ: number, seconds: number, high: number): void {
    this.beginStep(side, 0, 0, seconds, high, false);
    this.stepTo[0] = toX;
    this.stepTo[1] = toZ;
  }

  /**
   * Begin a step (standing) with one foot: from where it is now to its home plus (`aheadX`, `aheadZ`) metres; or, for
   * a crab step OUT (`fromHome` false), to where it is now plus that. Lifted `high`, over `seconds`.
   */
  private beginStep(side: number, aheadX: number, aheadZ: number, seconds: number, high: number, fromHome: boolean): void {
    const f = this.feet[side];
    const atX = f.locked ? f.lockX : f.homeX + f.offX, atZ = f.locked ? f.lockZ : f.homeZ + f.offZ;
    this.stepFrom[0] = atX; this.stepFrom[1] = atZ;
    this.stepTo[0] = (fromHome ? f.homeX : atX) + aheadX;
    this.stepTo[1] = (fromHome ? f.homeZ : atZ) + aheadZ;
    this.stepFoot = side;
    this.faceFrom = this.footFace[side];
    this.faceTo = this.root.rotation.y;   // (square to her, unless the caller says otherwise)
    this.stepClock = 0;
    this.stepSeconds = seconds;
    this.stepHigh = high;
    this.crabbing = false;
    this.stepHop = 0;
  }

  /**
   * Reach one leg from its hip, where that is now, to `goal` (where its ankle is to be, world metres). Its knee
   * stands off the line from hip to ankle toward `knee` (and never backward of `ahead`: a knee bends one way); its
   * thigh and its shin are each turned about their own length by `thighTurn` and `shinTurn` (radians: how much
   * further round each faces than the part above it); its foot is laid as `lie` says. A place her leg is too
   * short to reach is reached toward, as far as her leg goes.
   */
  private reach(leg: LegBones, goal: THREE.Vector3, knee: THREE.Vector3, aheadX: number, aheadZ: number, lie: THREE.Quaternion, thighTurn: number, shinTurn: number): void {
    hipAt.setFromMatrixPosition(leg.hip.matrixWorld);
    kneeAt.setFromMatrixPosition(leg.knee.matrixWorld);
    ankleAt.setFromMatrixPosition(leg.ankle.matrixWorld);
    const thigh = hipAt.distanceTo(kneeAt), shin = kneeAt.distanceTo(ankleAt);
    // the line from her hip to where her ankle is to be, and how long it is (never longer than her leg, never folded flat)
    line.copy(goal).sub(hipAt);
    const far = clamp(line.length(), Math.abs(thigh - shin) + 1e-4, (thigh + shin) * 0.9995);
    line.normalize();
    // Which way her knee goes: the way asked, off that line, with a little of her forward added (so a straight
    // leg bends forward) and any backward part taken out first (a knee does not bend backward).
    ahead.set(aheadX, 0, aheadZ).addScaledVector(line, -(aheadX * line.x + aheadZ * line.z));
    if (ahead.lengthSq() < 1e-8) ahead.set(aheadX, 0, aheadZ);
    ahead.normalize();
    if (knee !== bend) bend.copy(knee);
    bend.addScaledVector(line, -bend.dot(line));
    const backward = bend.dot(ahead);
    if (backward < 0) bend.addScaledVector(ahead, -backward);
    bend.addScaledVector(ahead, thigh * FOOT_GROUND.kneeForward).normalize();
    // the triangle hip, knee, ankle with its three sides known: the angle at the hip between the line and the thigh
    const cos = clamp((thigh * thigh + far * far - shin * shin) / (2 * thigh * far), -1, 1), sin = Math.sqrt(1 - cos * cos);
    // her thigh: from where it points now to where the new knee is...
    from.copy(kneeAt).sub(hipAt).normalize();
    to.copy(line).multiplyScalar(cos).addScaledVector(bend, sin).normalize();
    turnInWorld(leg.hip, turn.setFromUnitVectors(from, to));
    // ...and turned about its own length to face the way its band does
    if (Math.abs(thighTurn) > 1e-5) turnInWorld(leg.hip, turn.setFromAxisAngle(axis.copy(to).negate(), thighTurn));
    // her shin: from where the thigh has carried it to pointing at where the ankle is to be, then turned likewise
    kneeAt.setFromMatrixPosition(leg.knee.matrixWorld);
    ankleAt.setFromMatrixPosition(leg.ankle.matrixWorld);
    from.copy(ankleAt).sub(kneeAt).normalize();
    to.copy(hipAt).addScaledVector(line, far).sub(kneeAt).normalize();
    turnInWorld(leg.knee, turn.setFromUnitVectors(from, to));
    if (Math.abs(shinTurn) > 1e-5) turnInWorld(leg.knee, turn.setFromAxisAngle(axis.copy(to).negate(), shinTurn));
    // her foot: laid as asked (as it lay before her leg was bent, pivoted to its band)
    leg.knee.getWorldQuaternion(parentQ);
    leg.ankle.quaternion.copy(parentQ.invert()).multiply(lie);
  }
}
