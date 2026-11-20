// ============================================================================
// contracts.ts -- the few shapes every part of the game agrees on.
//
// UNITS: metres. Y is up. The centre of the plaza is the origin (0, 0, 0).
// A heroine at yaw 0 faces +Z.
//
// The WORLD (dome, city, cameras) and the HEROINE (the Character Builder body)
// are built separately and meet only through what is written here, so either
// can be swapped (a stand-in heroine while the real body loads, a new theme
// under the same dome) without the other noticing.
// ============================================================================
import type * as THREE from 'three';
import type { GripShape } from '@charb/actor/handGrip';

/** One step of the game loop. */
/**
 * THE SHADOW-ONLY LAYER. Something put on this layer (three.js "layers") is not drawn by the game's camera but does
 * cast its shadow: the key light's shadow camera looks at it too (main.ts). Used for her hair in first person, so
 * her shadow keeps its head while the camera, inside her head, sees none of it (Joshua, 2026-11-17).
 */
export const SHADOW_ONLY_LAYER = 1;

export interface FrameInfo {
  /** Seconds since the last frame, clamped so a hiccup never throws things across the map. */
  readonly dt: number;
  /** Seconds the game has been running (paused time not counted). */
  readonly elapsed: number;
}

export type Hand = 'left' | 'right';

/**
 * A heroine the game can stand in the plaza, walk, aim and shoot with.
 * The stand-in (a simple figure) and the real Character Builder body both answer to this.
 */
/**
 * What her body shows of her vitals (src/vitals/heroineVitals.ts): her skin breathes by these, and her belly stands
 * out a little for a full stomach.
 */
export interface BodyVitals {
  /** her breath this instant: 0 all out .. 1 all in */
  readonly breath: number;
  /** how much air a whole breath takes now, litres (deeper when she is working hard) */
  readonly breathLitres: number;
  /** breaths a minute */
  readonly breathsPerMinute: number;
  /** what is in her stomach, millilitres */
  readonly stomachMl: number;
  /** how far her belly draws in with her stomach nearly empty, millilitres of room (vitals/heroineVitals.ts foodBar) */
  readonly bellyShrinkMl?: number;
}

/**
 * Which way each part of her faces, in radians about Y like `setYaw` (Joshua's five bands, 2026-11-17: "you can
 * turn your head +/-90°, the shoulders/arms/hands at 80% of that..., belly/torso..., upper legs..., lower
 * legs/feet"). Each is a direction in the world, not a turn from the part below it.
 */
export interface BodyFacing {
  readonly head: number;
  /**
   * How far her head tips up (+) or down (-), radians (Joshua, 2026-11-18: she looks down at what she is about to do,
   * up toward what she goes to next). Optional: 0, level.
   */
  readonly headPitch?: number;
  /** Her shoulders, arms and hands (and her guns). */
  readonly shoulders: number;
  /** Her belly and torso, her hips with them. */
  readonly belly: number;
  readonly upperLegs: number;
  /** Her lower legs and feet. */
  readonly feet: number;
}

/** What a body's hands can do in the world: reach for a pose, and hand a gun over (see HeroineBody.hands). */
export interface HeroineHands {
  /** Whether this hand holds its gun. */
  hasGun(hand: Hand): boolean;
  /** The pose (world) her hand bone must have to hold a gun that lies at `gunWorld` (the gun's own world matrix). */
  handPoseForGun(hand: Hand, gunWorld: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * Send a hand to a pose (world), bending her down to it as needed; null brings it back to her own pose. `limit`
   * holds her wrist within `most` radians of her own pose's, keeping `pivot` (a point in the hand) where the pose puts it.
   * `stayUp`: her body does not get down to it (her own holster: it is within reach as she stands).
   */
  reach(hand: Hand, pose: THREE.Matrix4 | null, limit?: { most: number; pivot: THREE.Vector3; along?: THREE.Vector3; tipsUpMost?: number }, stayUp?: boolean): void;
  /** How far a hand is on its way, 0..1 (1: arrived). */
  reached(hand: Hand): number;
  /**
   * Move a hand's job (given with `reach`) to a new pose without starting its glide again: for something that moves
   * with her as she walks (her own holster, on her swinging thigh). Ignored when the hand has no job.
   */
  moveReach(hand: Hand, pose: THREE.Matrix4): void;
  /**
   * HER HOLSTERS (her belt gear: beltGear.ts), if she wears them: the bone each rides, and where a holstered gun sits
   * in that bone's own space. Null: no holsters.
   */
  holster(hand: Hand): { bone: THREE.Object3D; seat: THREE.Matrix4 } | null;
  /** Let go of this hand's gun: it stays where it is, given to `parent` (a table). Returns the gun. */
  releaseGun(hand: Hand, parent: THREE.Object3D): THREE.Object3D;
  /** Take this hand's gun back (wherever it lies): it is held as before. */
  takeGun(hand: Hand): void;
  /** A hand's gun (wherever it is: in her hand, on the table), its clip, and how a gun sits in that hand (hand space). */
  gun(hand: Hand): THREE.Object3D;
  gunClip(hand: Hand): THREE.Object3D;
  gunSeat(hand: Hand, out: THREE.Matrix4): THREE.Matrix4;
  /** Where a clip sits in its gun (the gun's own space). */
  clipSeat(out: THREE.Matrix4): THREE.Matrix4;
  /** The bone a hand's job places (things held in that hand are given to it). */
  handBone(hand: Hand): THREE.Object3D;
  /** Whether a hand's fingers are closed (holding something) or open: set while she handles clips. */
  setHolding(hand: Hand, holding: boolean): void;
  /**
   * Something in front of her that her body must keep off (a table): a vertical face (a point on it, and its
   * outward direction, toward her), up to a height `top` (the table's top). Null: nothing.
   */
  keepOff(face: { point: THREE.Vector3; outward: THREE.Vector3; top: number } | null): void;
  /** How far her belly stands out in front of her, metres from her middle (for where she stands at a table). */
  bellyAhead(): number;
  /**
   * GRABBING A BAR (fingerTouch.ts). The pose her hand bone must have to hold a bar: the palm's middle on its surface
   * at `at` (a point on its axis), facing it along `palmTo`, the fingers going round toward `wrapToward`.
   */
  gripPose(hand: Hand, at: THREE.Vector3, axis: THREE.Vector3, palmTo: THREE.Vector3, wrapToward: THREE.Vector3, radius: number, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * What this hand holds (its fingers close round it, each until it touches, once the hand is there), or null: let go.
   * `firm`: it already has hold and keeps it while it moves (a clip she carries).
   */
  hold(hand: Hand, shape: GripShape | null, firm?: boolean): void;
  /** The middle of a hand's palm where a bar lies across it (the hand bone's own space). */
  palmPoint(hand: Hand, out: THREE.Vector3): THREE.Vector3;
  /** Which way a hand's fingers run (the hand bone's own space). */
  fingersAlong(hand: Hand, out: THREE.Vector3): THREE.Vector3;
  /** How far a hand's fingers are closed onto what it holds, 0..1. */
  touching(hand: Hand): number;
  /** How low she is (0 standing, 1 fully down) and how (reach, low, squat, kneelLeft, kneelRight, kneelBoth). */
  lowering(): { weight: number; mode: string; drop?: number; bend?: number };
}

export interface HeroineBody {
  /** Add this to the scene. Her feet are at its origin. */
  readonly root: THREE.Object3D;
  /** How tall she stands, in metres (heels included). */
  readonly height: number;
  /** True once she is fully loaded AND dressed (a character appears dressed, all at once). */
  readonly ready: boolean;

  /** Where her feet are: (x, z) on the map, and `y` the ground's height there (0 on the flat town; the island's hills). */
  setPosition(x: number, z: number, y?: number): void;
  /**
   * Which way she faces, in radians about Y (0 = +Z). For a body with `setFacing`, this is BODY NORTH: the way she
   * faces when nothing of her is turned.
   */
  setYaw(yaw: number): void;
  /**
   * EACH PART OF HER TURNED ITS OWN WAY (Joshua's five bands, 2026-11-17; the rule itself is src/input/bodyTurn.ts).
   * The object is kept and read every frame, so the game hands over one object once and goes on changing it.
   * Optional: a body that cannot turn its parts apart leaves this out, and the game faces all of it one way.
   */
  setFacing?(facing: BodyFacing | null): void;
  /**
   * SIDE STEPS (Joshua, 2026-11-18): the game holds her facing (third person MANUAL, a door) and she may be moved any
   * way across it; her feet then take crab steps for every way but nearly straight ahead or back. `level` is her pace
   * (1 walk .. 4 sprint: the style of step: crab walk, shuffle, skip). Null: her body turns to the way she goes, and
   * she always walks. Optional: a body without crab steps leaves this out.
   */
  setSideSteps?(level: number | null): void;
  /**
   * UNEVEN GROUND (the island): the ground's height at a place, metres, so each foot stands on the ground under it and
   * lies along its slope. Null (and a body without this): a flat floor at her root's height. Optional.
   */
  setGround?(groundAt: ((x: number, z: number) => number) | null): void;
  /**
   * Ground speed in m/s (0 = standing). Her legs follow this; the game moves her root. (A body that reads how far
   * it really moved between frames, as the fast heroine does, does not need it.)
   */
  setWalk(speed: number): void;
  /** A world point her guns point at; null lowers them to rest. */
  aimAt(target: THREE.Vector3 | null): void;
  /** One shot from one hand: the recoil kick. */
  fire(hand: Hand): void;
  /** Where a shot leaves a gun, in world space. */
  muzzle(hand: Hand, out: THREE.Vector3): THREE.Vector3;
  /** Where the first-person camera sits, in world space: at her head bone, pushed forward so looking down shows her belly. */
  /** Where her eyes are, world space; `pitch` (radians, + up) tilts her head and neck to look up or down. */
  eye(out: THREE.Vector3, pitch?: number): THREE.Vector3;
  /** First person hides her head (and hair) so the camera is not inside it; her body stays drawn. */
  setFirstPerson(on: boolean): void;
  /** The live knit's stitch size, for an outfit that has one (looks/gear.ts `knit`): for test pages; the game uses the look's. */
  setKnitStitch?(stitch: number): void;
  /** Belly size, 0-200 (%), as in the Character Builder. */
  setBelly(percent: number): void;
  /** Pregnant or not (Settings; heroine/pregnancyPlan.ts). Optional: only a body with a live body inside has anything to change. */
  setPregnant?(on: boolean): void;
  /** How deep the water is at her feet, metres (0 out of it): her skin gets wet up to there (fast/skinShine.ts). */
  setWaterDepth?(metres: number): void;
  /** Her skin's own shine: -1 dry .. 0 natural .. +1 oily (Settings -> HEROINE -> Skin shine). */
  setSkinShine?(oily: number): void;
  /** Squat down for this many seconds, then stand up (the bathroom, until there is a toilet). */
  squatFor?(seconds: number): void;
  /**
   * HER STANCE (Joshua, 2026-11-20; heroine/fast/groundPose.ts): standing, crouching, on her belly, or on all fours. She
   * gets there over a second or so (crouching first, then down; up through her crouch).
   */
  setStance?(stance: 'stand' | 'crouch' | 'prone' | 'fours'): void;
  /** Where she is: the stance she is in (or on her way through), the one asked for, and whether she has got there. */
  stanceInfo?(): { stance: 'stand' | 'crouch' | 'prone' | 'fours'; asked: 'stand' | 'crouch' | 'prone' | 'fours'; settled: boolean; crouch: number; down: number };
  /**
   * HER HANDS TO HER BELLY (Joshua, 2026-11-20; heroine/fast/bellyTouch.ts): hold it up with a free hand (the game: from
   * a run, past 30 weeks), or not.
   */
  setBellySupport?(on: boolean): void;
  /** Whether she may start a look down at her hand where the baby kicked (not while she fires or runs). */
  setBellyLookAllowed?(ok: boolean): void;
  /**
   * Her look down at her hand where the baby kicked: how far it is on (0 none .. 1 right at it), and the spot (world) in
   * `out`. First person, the view does the looking (main.ts).
   */
  bellyLook?(out: THREE.Vector3): number;
  /** The player turned the view or fired: her look down stops (eased off) and her hands let go. */
  stopBellyLook?(): void;
  /**
   * WINDED (Joshua, 2026-11-20): bent over, hands just above her knees, by this much (0 standing .. 1 right over); the
   * game eases it in and out.
   */
  setWinded?(weight: number): void;
  /** Wet her all over at once (Settings -> TEST TOOLS -> Get wet). */
  soakSkin?(): void;
  /** Her belly's size now, percent (optional: a body that does not say is taken to be at its look's own size). */
  bellyNow?(): number;

  /** Her vitals this frame, for a body that can show them (optional: a body without it breathes at rest). */
  setVitals?(vitals: BodyVitals): void;

  /**
   * THE GAME WAS PAUSED and is carrying on (src/ui/pauseMenu.ts): the time that went by while it was paused is not a
   * frame. A body that times its own frames (the fast heroine does, to choose her detail by the frame rate) starts
   * its clock again here, so a pause is never mistaken for one very slow frame. Optional.
   */
  resumed?(): void;

  /**
   * HER HANDS IN THE WORLD (the weapon table; Joshua, 2026-11-17: "a table you can actually grab to pick up and drop
   * your guns"). Optional: a body without hands that reach leaves these out, and her guns never leave her hands.
   */
  hands?: HeroineHands;

  update(frame: FrameInfo): void;
  dispose(): void;
}
