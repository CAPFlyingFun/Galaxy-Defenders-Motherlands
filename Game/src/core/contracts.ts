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

  /** Her vitals this frame, for a body that can show them (optional: a body without it breathes at rest). */
  setVitals?(vitals: BodyVitals): void;

  /**
   * THE GAME WAS PAUSED and is carrying on (src/ui/pauseMenu.ts): the time that went by while it was paused is not a
   * frame. A body that times its own frames (the fast heroine does, to choose her detail by the frame rate) starts
   * its clock again here, so a pause is never mistaken for one very slow frame. Optional.
   */
  resumed?(): void;

  update(frame: FrameInfo): void;
  dispose(): void;
}
