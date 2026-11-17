// ============================================================================
// playerMotion.ts -- where the heroine stands and which way she faces.
//
// Two ways of moving:
//   RING  she runs left or right along the ring track and faces OUTWARD,
//         toward the city and sky she is defending.
//   FREE  a stick walks her anywhere inside the plaza.
//
// This file only works out numbers (x, z, yaw, speed). main.ts hands them to
// the heroine's body, whichever body that is.
// ============================================================================
import { PLAZA_RADIUS, RING_RADIUS } from '../world/config';

const RUN_SPEED = 4.6; // metres per second along the ring
const WALK_SPEED = 3.4; // metres per second in free walk
/** She stays this far inside the plaza's edge. */
const EDGE_MARGIN = 0.7;
/** How quickly she turns to a new heading (bigger = snappier). */
const TURN_RATE = 10;
/** How quickly she drifts back onto the ring when ring mode starts (metres per second). */
const RETURN_SPEED = 4;

/** Bring an angle into the range -PI..PI. */
function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PlayerMotion {
  /** Where she stands. */
  x = 0;
  z = RING_RADIUS;
  /** Which way she faces (radians, 0 = +Z). */
  yaw = 0;
  /** Her ground speed this frame, in metres per second, for her walk animation. */
  speed = 0;

  /** Her compass direction from the plaza centre: where on the ring she is. */
  ringAngle = 0;
  /** Her distance from the plaza centre. */
  private radius = RING_RADIUS;

  /**
   * RING: run along the track. `direction` is -1 (left), 0 or +1 (right) as
   * seen by a camera standing behind her.
   * Returns how far round the plaza she moved, in radians, so the camera can swing with her.
   */
  updateRing(dt: number, direction: number): number {
    // Seen from behind her, "right" is toward a SMALLER compass angle.
    const turned = (-direction * RUN_SPEED * dt) / RING_RADIUS;
    this.ringAngle = wrapAngle(this.ringAngle + turned);

    // If she is off the ring (free walk just ended) she drifts back onto it.
    const off = RING_RADIUS - this.radius;
    const drift = Math.max(-RETURN_SPEED * dt, Math.min(RETURN_SPEED * dt, off));
    this.radius += drift;

    this.x = Math.sin(this.ringAngle) * this.radius;
    this.z = Math.cos(this.ringAngle) * this.radius;
    this.speed = Math.max(Math.abs(direction) * RUN_SPEED, dt > 0 ? Math.abs(drift) / dt : 0);
    // She faces outward: her yaw is her own compass direction.
    this.turnToward(this.ringAngle, dt);
    return turned;
  }

  /**
   * FREE: walk with the stick, relative to the direction the camera looks
   * (`viewYaw`). With `faceView` she always faces where the camera looks
   * (first person); without it she turns to face the way she walks.
   */
  updateFree(dt: number, moveX: number, moveY: number, viewYaw: number, faceView: boolean): void {
    // The stick's push, never more than full speed even on a diagonal.
    const push = Math.min(1, Math.hypot(moveX, moveY));
    if (push > 0.01) {
      // "Forward" is the way the camera looks; "right" is to its right.
      const forwardX = Math.sin(viewYaw);
      const forwardZ = Math.cos(viewYaw);
      const scale = (WALK_SPEED * dt) / Math.max(1, Math.hypot(moveX, moveY));
      const stepX = (forwardX * moveY - forwardZ * moveX) * scale;
      const stepZ = (forwardZ * moveY + forwardX * moveX) * scale;
      this.x += stepX;
      this.z += stepZ;

      // Keep her inside the plaza.
      const limit = PLAZA_RADIUS - EDGE_MARGIN;
      const distance = Math.hypot(this.x, this.z);
      if (distance > limit) {
        this.x *= limit / distance;
        this.z *= limit / distance;
      }
      if (!faceView) this.turnToward(Math.atan2(stepX, stepZ), dt);
    }
    if (faceView) this.yaw = viewYaw;
    this.speed = push * WALK_SPEED;

    // Remember where on the ring she would be, so switching back to ring mode starts from here.
    this.radius = Math.hypot(this.x, this.z);
    if (this.radius > 0.01) this.ringAngle = Math.atan2(this.x, this.z);
  }

  /** Turn smoothly toward a heading, the short way round. */
  private turnToward(heading: number, dt: number): void {
    this.yaw = wrapAngle(this.yaw + wrapAngle(heading - this.yaw) * (1 - Math.exp(-TURN_RATE * dt)));
  }
}
