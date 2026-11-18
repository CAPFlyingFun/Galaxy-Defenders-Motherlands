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
}

/**
 * Which way each part of her faces, in radians about Y like `setYaw` (Joshua's five bands, 2026-11-17: "you can
 * turn your head +/-90°, the shoulders/arms/hands at 80% of that..., belly/torso..., upper legs..., lower
 * legs/feet"). Each is a direction in the world, not a turn from the part below it.
 */
export interface BodyFacing {
  readonly head: number;
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
   */
  reach(hand: Hand, pose: THREE.Matrix4 | null, limit?: { most: number; pivot: THREE.Vector3; along?: THREE.Vector3; tipsUpMost?: number }): void;
  /** How far a hand is on its way, 0..1 (1: arrived). */
  reached(hand: Hand): number;
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

  setPosition(x: number, z: number): void;
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
  eye(out: THREE.Vector3): THREE.Vector3;
  /** First person hides her head (and hair) so the camera is not inside it; her body stays drawn. */
  setFirstPerson(on: boolean): void;
  /** Belly size, 0-200 (%), as in the Character Builder. */
  setBelly(percent: number): void;
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
