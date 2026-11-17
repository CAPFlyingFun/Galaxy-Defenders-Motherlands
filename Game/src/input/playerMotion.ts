// ============================================================================
// playerMotion.ts -- where the heroine stands and which way she faces.
//
// She walks FREELY, anywhere under the dome (Joshua, 2026-11-17: "Remove the
// fixed moving ring, and let it be free movement", "so I can like run from one
// end of the map to the other"). The stick says which way; her pace
// (src/input/pace.ts) says how fast; the city's walls and the dome's glass
// (src/world/collision.ts) say where she cannot go.
//
// This file only works out numbers (x, z, speed, and the way she is going).
// main.ts hands them to the heroine's body, whichever body that is. WHICH WAY
// SHE FACES is not decided here: her legs, her head and her torso each have a
// direction of their own (src/input/bodyTurn.ts), worked out from `heading`.
// ============================================================================
import type { GroundPoint } from '../world/collision';

/**
 * Where she starts: in the plaza, a few steps out from its middle, looking out at the city (+Z).
 * (The same spot as before the ring track was removed, so the game opens on the same view.)
 */
const START_X = 0;
const START_Z = 9;
/**
 * She counts as really going somewhere when she covers at least this share of the step the stick asked for; less
 * than that (walking into a wall) and `heading` is the way the stick sends her.
 */
const GOING_SHARE = 0.2;

/**
 * What stops her. The city's walls (`CityWalls` in src/world/collision.ts) answer to this; so could anything
 * else that can say where a step really ends.
 */
export interface Walls {
  /** She wants to step from (x, z) by (stepX, stepZ): write where she really ends up into `out`. */
  move(x: number, z: number, stepX: number, stepZ: number, out: GroundPoint): GroundPoint;
}

export class PlayerMotion {
  /** Where she stands. */
  x = START_X;
  z = START_Z;
  /**
   * The way she is moving over the ground this frame (radians, 0 = +Z), or null while she is not moving. It is the
   * way she REALLY went: sliding along a wall, that is along the wall. Walking straight into a wall she gets
   * nowhere, and it is the way the stick sends her. Her legs turn to this (src/input/bodyTurn.ts).
   */
  heading: number | null = null;
  /**
   * Her REAL ground speed this frame, in metres per second, for her walk animation and her vitals: how far she
   * actually got. Walking straight into a wall it is 0 (she stands against it instead of running on the spot);
   * sliding along a wall it is only the part of her pace that carries her along it.
   */
  speed = 0;

  /** The stick's direction when it was last pushed (right, forward), one unit long. */
  private headX = 0;
  private headY = 1;
  /** Where the walls say a step ends (one object, reused every frame). */
  private readonly spot: GroundPoint = { x: 0, z: 0 };

  /** `walls` is what she cannot walk through; with none (a test, a lab page) nothing stops her. */
  constructor(private readonly walls: Walls | null = null) {}

  /**
   * One frame of walking with the stick, relative to the direction the camera looks (`viewYaw`): stick up is
   * "away from the camera", stick right is "to the camera's right".
   * The stick gives only the DIRECTION here; `speed` is her ground speed, metres a second (her pace:
   * src/input/pace.ts). When the stick is let go she keeps her last direction while she slows to a stop.
   */
  update(dt: number, moveX: number, moveY: number, viewYaw: number, speed: number): void {
    const push = Math.hypot(moveX, moveY);
    if (push > 0.01) { this.headX = moveX / push; this.headY = moveY / push; }
    let travelled = 0;
    this.heading = null;
    if (speed > 0.01) {
      // "Forward" is the way the camera looks; "right" is to its right.
      const forwardX = Math.sin(viewYaw);
      const forwardZ = Math.cos(viewYaw);
      const stepX = (forwardX * this.headY - forwardZ * this.headX) * speed * dt;
      const stepZ = (forwardZ * this.headY + forwardX * this.headX) * speed * dt;
      const fromX = this.x;
      const fromZ = this.z;
      if (this.walls) {
        // The walls decide where the step really ends: she stops at a building or the dome, or slides along it.
        this.walls.move(fromX, fromZ, stepX, stepZ, this.spot);
        this.x = this.spot.x;
        this.z = this.spot.z;
      } else {
        this.x += stepX;
        this.z += stepZ;
      }
      travelled = Math.hypot(this.x - fromX, this.z - fromZ);
      // the way she is going: the way she really went, if she got anywhere; otherwise the way the stick sends her
      const asked = Math.hypot(stepX, stepZ);
      this.heading = travelled > asked * GOING_SHARE ? Math.atan2(this.x - fromX, this.z - fromZ) : Math.atan2(stepX, stepZ);
    }
    // (never more than her pace: being pushed out of a corner is not running faster)
    this.speed = dt > 0 ? Math.min(speed, travelled / dt) : 0;
  }
}
