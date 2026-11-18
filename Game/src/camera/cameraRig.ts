// ============================================================================
// cameraRig.ts -- the two cameras: third person and first person.
//
// THIRD PERSON  The camera floats behind and above the heroine and looks past
//               her, up toward the sky. Dragging turns the view, pinching
//               zooms. It turns around a point above her head (the "pivot"),
//               which keeps her in the lower part of the screen with the sky
//               over her. The pivot goes wherever she goes, anywhere under
//               the dome, and the camera stays on the side of her the player
//               dragged it to: it never turns by itself. It never dips under
//               the ground. Nothing else stops it for now (Joshua knows,
//               2026-11-17): it can pass through a building, and when she
//               stands with her back to the dome it looks in at her through
//               the glass from just outside.
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

export type ViewMode = 'third' | 'first';

/** Radians the view turns per pixel dragged. */
const LOOK_SPEED = 0.0045;

// ---- Third person ------------------------------------------------------------
const THIRD_PITCH_START = 0.16; // looking slightly up
const THIRD_PITCH_MIN = -0.45;
const THIRD_PITCH_MAX = 1.25;
const ZOOM_START = 0.17; // 0 = closest, 1 = furthest
const ZOOM_OUT_SPEED = 0.55; // how much of the whole zoom one unit of pinch moves it, out...
const ZOOM_IN_SPEED = 1.1; // ...and in (twice as fast)
const DISTANCE_NEAR = 3.2; // metres behind the pivot at zoom 0
const DISTANCE_FAR = 23; // ...and at zoom 1
const PIVOT_NEAR = 2.1; // height of the pivot at zoom 0
const PIVOT_FAR = 9; // ...and at zoom 1: zooming out also lifts the camera, to see over the plaza
/** The camera never goes lower than this. */
const MIN_CAMERA_HEIGHT = 0.4;
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

  /** Each view's field of view, degrees (Settings, CAMERA: 50-120). */
  fovThird = FOV_LANDSCAPE;
  fovFirst = FOV_LANDSCAPE;

  /** Call when the canvas changes shape. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.fitFov();
  }

  /** Set each view's field of view (degrees), taking hold at once. */
  setFov(third: number, first: number): void {
    this.fovThird = third;
    this.fovFirst = first;
    this.fitFov();
  }

  /** Where the third-person zoom is (0 closest .. 1 furthest): the camera goes there now (a pinch moves it after). */
  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, 0, 1);
  }

  /** The field of view for the view she is in (a tall screen, which is never played, keeps its own). */
  private fitFov(): void {
    const fov = this.camera.aspect < 1 ? FOV_PORTRAIT : this.mode === 'first' ? this.fovFirst : this.fovThird;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /** Switch between third and first person. The camera keeps looking the same compass direction. */
  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.pitch = mode === 'third' ? THIRD_PITCH_START : 0;
    this.easedYaw = this.yaw;
    this.easedPitch = this.pitch;
    this.fitFov(); // (each view has its own field of view)
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

  /**
   * Zoom the third-person camera: + moves it away, - brings it closer. Coming closer goes twice as fast as going
   * away (Joshua, 2026-11-17: "make zoom double for zoom inward... Out is good").
   */
  applyZoom(amount: number): void {
    this.zoom = clamp(this.zoom + amount * (amount < 0 ? ZOOM_IN_SPEED : ZOOM_OUT_SPEED), 0, 1);
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

    // The pivot follows a point above her head, wherever on the map she is. Only the pivot moves with her: the
    // two angles are the player's alone, so the camera keeps the side of her it was dragged to while she runs.
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

    // (There used to be a Rule 2 here, "stay over the plaza", which held the camera inside a circle round the
    // plaza centre so it could not poke into a building. She goes anywhere now, so that rule is gone: the camera
    // simply keeps its distance behind the pivot. It may pass through a building, and with her back to the dome
    // it ends up just outside the glass, looking in past her at the city. Stopping the camera at walls is a
    // later job; `CityWalls` in src/world/collision.ts is where the walls are known.)

    this.camera.position.copy(this.pivot).addScaledVector(this.look, -distance);
  }

  /** A point `range` metres along the line the camera looks down: what first person aims at. */
  aimPoint(range: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.camera.position).addScaledVector(this.look, range);
  }

  /**
   * Where the line the camera looks down meets a ball of `radius` metres round the plaza centre: the part of
   * the dome it is looking toward, wherever under the dome the camera is. (A point a fixed way ahead only told
   * that from near the plaza; from the far side of the map it would land in the middle of the city.)
   */
  aimPointOnBall(radius: number, out: THREE.Vector3): THREE.Vector3 {
    // Where a line leaves a ball: solve |camera + look * t| = radius for t, and take the further answer (the
    // way out), which is also right when the camera has swung just outside the glass and looks back in.
    const from = this.camera.position;
    const along = from.dot(this.look);
    const under = along * along + radius * radius - from.lengthSq();
    // (a camera outside the ball whose line misses it altogether: then just a point `radius` ahead)
    const reach = under >= 0 ? Math.max(0, -along + Math.sqrt(under)) : radius;
    return out.copy(from).addScaledVector(this.look, reach);
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
