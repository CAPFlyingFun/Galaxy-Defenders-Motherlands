// ============================================================================
// cameraRig.ts -- the two cameras: third person and first person.
//
// THIRD PERSON  The camera floats behind and above the heroine and looks past
//               her, up toward the sky. Dragging turns the view, pinching
//               zooms. It turns around a point above her head (the "pivot"),
//               which keeps her in the lower part of the screen with the sky
//               over her. It never dips under the ground and never leaves the
//               air above the plaza, so it cannot poke into a building.
// FIRST PERSON  The camera sits at her eyes (heroine.eye()). Dragging looks
//               around; she can look straight down at her belly and almost
//               straight up.
//
// Both use the same two angles:
//   yaw    which compass direction the camera looks (0 = +Z, same as a heroine's yaw)
//   pitch  how far up (+) or down (-) it looks
// ============================================================================
import * as THREE from 'three';
import type { HeroineBody } from '../core/contracts';
import { PLAZA_RADIUS } from '../world/config';

export type ViewMode = 'third' | 'first';

/** Radians the view turns per pixel dragged. */
const LOOK_SPEED = 0.0045;

// ---- Third person ------------------------------------------------------------
const THIRD_PITCH_START = 0.16; // looking slightly up
const THIRD_PITCH_MIN = -0.45;
const THIRD_PITCH_MAX = 1.25;
const ZOOM_START = 0.17; // 0 = closest, 1 = furthest
const DISTANCE_NEAR = 3.2; // metres behind the pivot at zoom 0
const DISTANCE_FAR = 23; // ...and at zoom 1
const PIVOT_NEAR = 2.1; // height of the pivot at zoom 0
const PIVOT_FAR = 9; // ...and at zoom 1: zooming out also lifts the camera, to see over the plaza
/** The camera never goes lower than this. */
const MIN_CAMERA_HEIGHT = 0.4;
/** The camera stays inside this circle around the plaza centre, clear of every building. */
const CAMERA_LIMIT = PLAZA_RADIUS - 0.5;
/** How quickly the camera settles (bigger = snappier). */
const SMOOTHING = 14;

// ---- First person ------------------------------------------------------------
const FIRST_PITCH_MIN = -1.55; // straight down, at her belly
const FIRST_PITCH_MAX = 1.45; // nearly straight up

// ---- Field of view -----------------------------------------------------------
const FOV_PORTRAIT = 72; // a tall phone screen shows more sky
const FOV_LANDSCAPE = 58;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: ViewMode = 'third';

  /** Where the player WANTS to look; the third-person camera eases toward these. */
  yaw = 0;
  pitch = THIRD_PITCH_START;
  private zoom = ZOOM_START;

  // The eased values the third-person camera is actually at.
  private easedYaw = 0;
  private easedPitch = THIRD_PITCH_START;
  private easedZoom = ZOOM_START;
  private readonly pivot = new THREE.Vector3(0, PIVOT_NEAR, 0);
  private pivotPlaced = false;

  private readonly look = new THREE.Vector3(0, 0, 1);

  constructor() {
    // The near distance is small so her own body is not cut away in first person.
    this.camera = new THREE.PerspectiveCamera(FOV_PORTRAIT, 1, 0.06, 2000);
    // Turn to the side first (Y), then up or down (X): no rolling.
    this.camera.rotation.order = 'YXZ';
  }

  /** Call when the canvas changes shape. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = this.camera.aspect < 1 ? FOV_PORTRAIT : FOV_LANDSCAPE;
    this.camera.updateProjectionMatrix();
  }

  /** Switch between third and first person. The camera keeps looking the same compass direction. */
  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.pitch = mode === 'third' ? THIRD_PITCH_START : 0;
    this.easedYaw = this.yaw;
    this.easedPitch = this.pitch;
  }

  /** The view was dragged by this many pixels. */
  applyLook(pixelsX: number, pixelsY: number): void {
    // Dragging right looks right (a smaller compass angle); dragging up looks up.
    this.yaw -= pixelsX * LOOK_SPEED;
    this.pitch -= pixelsY * LOOK_SPEED;
    this.pitch =
      this.mode === 'third'
        ? clamp(this.pitch, THIRD_PITCH_MIN, THIRD_PITCH_MAX)
        : clamp(this.pitch, FIRST_PITCH_MIN, FIRST_PITCH_MAX);
  }

  /** Zoom the third-person camera: + moves it away, - brings it closer. */
  applyZoom(amount: number): void {
    this.zoom = clamp(this.zoom + amount * 0.55, 0, 1);
  }

  /** Turn the view by an angle, used to swing the camera round the plaza with her as she runs the ring. */
  swing(angle: number): void {
    this.yaw += angle;
  }

  /** Once per frame, after the heroine has moved: put the camera where it belongs. */
  update(dt: number, heroine: HeroineBody): void {
    if (this.mode === 'first') {
      heroine.eye(this.camera.position);
      this.setLook(this.yaw, this.pitch);
      return;
    }

    // --- Third person ---------------------------------------------------------
    // Ease toward what the player asked for. (1 - e^(-rate*dt)) is smooth at any frame rate.
    const ease = 1 - Math.exp(-SMOOTHING * dt);
    this.easedYaw += (this.yaw - this.easedYaw) * ease;
    this.easedPitch += (this.pitch - this.easedPitch) * ease;
    this.easedZoom += (this.zoom - this.easedZoom) * ease;

    // The pivot follows a point above her head.
    const feet = heroine.root.position;
    const pivotHeight = PIVOT_NEAR + (PIVOT_FAR - PIVOT_NEAR) * this.easedZoom;
    if (this.pivotPlaced) {
      this.pivot.x += (feet.x - this.pivot.x) * ease;
      this.pivot.z += (feet.z - this.pivot.z) * ease;
    } else {
      this.pivot.x = feet.x;
      this.pivot.z = feet.z;
      this.pivotPlaced = true;
    }
    this.pivot.y = pivotHeight;

    this.setLook(this.easedYaw, this.easedPitch);
    let distance = DISTANCE_NEAR + (DISTANCE_FAR - DISTANCE_NEAR) * this.easedZoom;

    // Rule 1: stay above the ground. Looking up swings the camera down behind
    // her; when it would go under, it slides closer along its line instead.
    if (this.look.y > 0.001) distance = Math.min(distance, (pivotHeight - MIN_CAMERA_HEIGHT) / this.look.y);

    // Rule 2: stay over the plaza. Walk back from the pivot until the edge of
    // the allowed circle and go no further. (Where a line from inside a circle
    // leaves it: solve |pivot + back * t| = radius for t.)
    const flat = Math.hypot(this.look.x, this.look.z);
    if (flat > 0.001) {
      const backX = -this.look.x / flat;
      const backZ = -this.look.z / flat;
      const along = this.pivot.x * backX + this.pivot.z * backZ;
      const inside = CAMERA_LIMIT * CAMERA_LIMIT - (this.pivot.x * this.pivot.x + this.pivot.z * this.pivot.z);
      const reach = -along + Math.sqrt(Math.max(0, along * along + inside));
      distance = Math.min(distance, Math.max(0.5, reach / flat));
    }

    this.camera.position.copy(this.pivot).addScaledVector(this.look, -distance);
  }

  /** A point `range` metres along the line the camera looks down: what first person aims at. */
  aimPoint(range: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.camera.position).addScaledVector(this.look, range);
  }

  /** The compass direction the camera really looks right now (after easing). */
  get viewYaw(): number {
    return this.mode === 'first' ? this.yaw : this.easedYaw;
  }

  /** Point the camera along (yaw, pitch) and remember that direction in `look`. */
  private setLook(yaw: number, pitch: number): void {
    const flat = Math.cos(pitch);
    this.look.set(Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat);
    // A three.js camera looks down its own -Z, so add half a turn to face +Z at yaw 0.
    this.camera.rotation.set(pitch, yaw + Math.PI, 0);
  }
}
