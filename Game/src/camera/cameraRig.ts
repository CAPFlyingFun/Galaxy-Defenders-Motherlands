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
// THIRD PERSON HAS SIX STYLES (Joshua, 2026-11-18: "add all the cameras"),
// chosen with the CAM button; she plays the same in all of them (auto-aim):
//   follow     the one above
//   shoulder   close behind her right shoulder at head height (the crosshair
//              clear of her, as in over-the-shoulder shooters)
//   orbit      the follow camera circling her slowly on its own (a showcase);
//              dragging and pinching still work
//   top        high above, looking down at her and the plaza at 60 degrees;
//              dragging turns it, pinching raises and lowers it
//   drone      a camera flown with the MOVE stick while she stands still;
//              pinching sets its height; it keeps inside the dome and within
//              DRONE.range of her
//   cinematic  film angles of her (low in front, at her side, high and wide,
//              close), each slowly drifting, cut to the next every few seconds
//
// Both use the same two angles:
//   yaw    which compass direction the camera looks (0 = +Z, same as a heroine's yaw)
//   pitch  how far up (+) or down (-) it looks
// ============================================================================
import * as THREE from 'three';
import type { HeroineBody } from '../core/contracts';

export type ViewMode = 'third' | 'first';
/** How the third-person camera behaves (see the top of this file). */
export type CameraStyle = 'follow' | 'shoulder' | 'orbit' | 'top' | 'drone' | 'cinematic';
export const CAMERA_STYLES: readonly CameraStyle[] = ['follow', 'shoulder', 'orbit', 'top', 'drone', 'cinematic'];

/** GAME TUNING for the camera styles (metres, seconds, radians). */
export const STYLE = Object.freeze({
  /** SHOULDER: how far behind (closest, furthest with the zoom), how far to her right, how high. */
  shoulderNear: 0.75, shoulderFar: 2.6, shoulderSide: 0.38, shoulderUp: 1.55,
  /** ...and how far below her eyes it sits (metres), and how far down and up it may look (radians). */
  shoulderDown: -0.12,
  shoulderPitchMin: -1.1, shoulderPitchMax: 0.9,
  /** ORBIT: how fast it circles her, radians a second (about one turn in 40 seconds). */
  orbitSpeed: 0.16,
  /** TOP: how far it looks down, and its distance from her (closest, furthest with the zoom). */
  topPitch: -1.05, topNear: 6, topFar: 34,
  /** DRONE: how fast it flies, its height (lowest, highest with the zoom), the most it may be from her. */
  droneSpeed: 9, droneLow: 2.5, droneHigh: 30, droneRange: 60,
  /** CINEMATIC: how long each shot lasts, and how far it drifts while it does. */
  shotSeconds: 6, shotDrift: 0.9,
});

/**
 * THE CINEMATIC SHOTS, in her own frame (x her left, y up, z her front): where the camera stands, what it looks at,
 * and which way it drifts during the shot.
 */
const SHOTS: readonly { from: [number, number, number]; at: [number, number, number]; drift: [number, number, number] }[] = [
  { from: [0.6, 0.45, 2.6], at: [0, 1.25, 0], drift: [-1, 0.1, 0] },    // low in front, looking up at her
  { from: [-3.0, 1.4, 0.4], at: [0, 1.1, 0], drift: [0, 0, 1] },        // at her right side, tracking along
  { from: [5, 8.5, -9], at: [0, 1.0, 2], drift: [-1, 0, 0] },           // high and wide over her shoulder
  { from: [1.3, 1.05, 1.1], at: [0, 1.0, 0.1], drift: [0, 0.15, 0.3] }, // close, her belly and hands
  { from: [-1.2, 0.6, -2.4], at: [0, 1.5, 3], drift: [0, 0.2, 1] },     // low behind, looking past her
];

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
/**
 * The closest the third-person camera comes: HALF the old closest distance (Joshua, 2026-11-17: "make zoom double for
 * zoom inward... Out is good"). Zoom 0 is still where it was (3.2 m), so everything set before keeps its place; the
 * zoom simply goes on below 0 to here, the pivot staying at its lowest above her head.
 */
export const ZOOM_MIN = -(DISTANCE_NEAR / 2) / (DISTANCE_FAR - DISTANCE_NEAR);
/** How far behind the pivot the third-person camera is at a zoom, metres (for Settings to show). */
export function thirdPersonDistance(zoom: number): number {
  return DISTANCE_NEAR + (DISTANCE_FAR - DISTANCE_NEAR) * zoom;
}
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
  /** The third-person camera's style (CAM button). */
  style: CameraStyle = 'follow';
  /**
   * HER HEAD, for the over-the-shoulder camera, which is locked to it (Joshua, 2026-11-18): where her eyes are, the
   * way her head faces, and how far up or down she looks. Set by the game each frame; `valid` once it has been.
   */
  readonly head = { at: new THREE.Vector3(), yaw: 0, pitch: 0, valid: false };
  /** DRONE: the stick this frame (right, forward: -1..1), and how far from the plaza centre it may go (the dome). */
  readonly droneStick = { x: 0, y: 0 };
  droneLimit = 70;
  private readonly drone = new THREE.Vector3();
  private dronePlaced = false;
  /** CINEMATIC: which shot, and how long it has run. */
  private shot = 0;
  private shotTime = 0;
  /** The way she faced when this shot began (the shot's frame keeps it), and whether it has been read yet. */
  private shotYaw = 0;
  private shotYawSet = false;
  private readonly shotAt = new THREE.Vector3();

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
    // (always: the picture's new shape must reach the lens even when the field of view stays the same. Leaving this
    //  to fitFov, which only redrew the lens when the FOV changed, drew the picture squashed until a slider was moved:
    //  Joshua, 2026-11-17)
    this.camera.updateProjectionMatrix();
  }

  /** Set each view's field of view (degrees), taking hold at once. */
  setFov(third: number, first: number): void {
    this.fovThird = third;
    this.fovFirst = first;
    this.fitFov();
  }

  /** Where the third-person zoom is (0 closest .. 1 furthest): the camera goes there now (a pinch moves it after). */
  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, ZOOM_MIN, 1);
  }

  /** The field of view for the view she is in (a tall screen, which is never played, keeps its own). */
  private fitFov(): void {
    const fov = this.camera.aspect < 1 ? FOV_PORTRAIT : this.mode === 'first' ? this.fovFirst : this.fovThird;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /** Choose the third-person camera's style. */
  setStyle(style: CameraStyle): void {
    if (style === this.style) return;
    this.style = style;
    // (each starts where it makes sense: the drone where the camera is now, the cinematic at its first shot, top looking down)
    this.dronePlaced = false;
    this.shot = 0; this.shotTime = 0; this.shotYawSet = false;
    if (style === 'top') this.pitch = STYLE.topPitch;
    else if (this.pitch < THIRD_PITCH_MIN) this.pitch = THIRD_PITCH_START;
    if (style === 'shoulder') this.pitch = clamp(this.pitch, STYLE.shoulderPitchMin, STYLE.shoulderPitchMax);
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
      this.mode === 'first' ? clamp(this.pitch, FIRST_PITCH_MIN, FIRST_PITCH_MAX)
        : this.style === 'top' ? STYLE.topPitch // (top looks down at its own angle: a drag turns it only)
        : this.style === 'shoulder' ? clamp(this.pitch, STYLE.shoulderPitchMin, STYLE.shoulderPitchMax)
        : this.style === 'drone' ? clamp(this.pitch, -1.5, 0.6)
        : clamp(this.pitch, THIRD_PITCH_MIN, THIRD_PITCH_MAX);
  }

  /** Zoom the third-person camera: + moves it away, - brings it closer (as close as ZOOM_MIN). */
  applyZoom(amount: number): void {
    this.zoom = clamp(this.zoom + amount * 0.55, ZOOM_MIN, 1);
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
    if (this.style === 'orbit') this.yaw += STYLE.orbitSpeed * dt; // (circling on its own; a drag adds to it)
    if (this.style === 'shoulder' || this.style === 'top' || this.style === 'drone' || this.style === 'cinematic') {
      this.easedYaw += (this.yaw - this.easedYaw) * ease;
      this.easedPitch += (this.pitch - this.easedPitch) * ease;
      this.easedZoom += (this.zoom - this.easedZoom) * ease;
      this.placeStyle(dt, heroine, ease);
      return;
    }
    this.easedYaw += (this.yaw - this.easedYaw) * ease;
    this.easedPitch += (this.pitch - this.easedPitch) * ease;
    this.easedZoom += (this.zoom - this.easedZoom) * ease;

    // The pivot follows a point above her head, wherever on the map she is. Only the pivot moves with her: the
    // two angles are the player's alone, so the camera keeps the side of her it was dragged to while she runs.
    const feet = heroine.root.position;
    const pivotHeight = PIVOT_NEAR + (PIVOT_FAR - PIVOT_NEAR) * Math.max(0, this.easedZoom);
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

  /** The styles other than follow and orbit (shoulder, top, drone, cinematic). */
  private placeStyle(dt: number, heroine: HeroineBody, ease: number): void {
    const feet = heroine.root.position;
    const zoom = clamp(this.easedZoom, 0, 1);
    if (this.style === 'shoulder') {
      // LOCKED TO HER HEAD: looking where it looks (the middle of the screen is where she looks and aims), from behind
      // her right shoulder, a little below her eyes; it turns and tips with her head
      const yaw = this.head.valid ? this.head.yaw : this.easedYaw;
      const pitch = clamp(this.head.valid ? this.head.pitch : this.easedPitch, STYLE.shoulderPitchMin, STYLE.shoulderPitchMax);
      this.setLook(yaw, pitch);
      const back = STYLE.shoulderNear + (STYLE.shoulderFar - STYLE.shoulderNear) * zoom;
      const rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);
      if (this.head.valid) this.pivot.copy(this.head.at); else this.pivot.set(feet.x, STYLE.shoulderUp + 0.1, feet.z);
      this.pivot.x += rightX * STYLE.shoulderSide;
      this.pivot.z += rightZ * STYLE.shoulderSide;
      this.pivot.y += STYLE.shoulderDown;
      this.camera.position.copy(this.pivot).addScaledVector(this.look, -back);
      this.camera.position.y = Math.max(MIN_CAMERA_HEIGHT, this.camera.position.y);
      // (the player's own look starts from here when the view changes)
      this.easedYaw = yaw;
      return;
    }
    if (this.style === 'top') {
      // high up, looking down at her at its own angle; the zoom takes it further up and back
      this.setLook(this.easedYaw, STYLE.topPitch);
      const back = STYLE.topNear + (STYLE.topFar - STYLE.topNear) * zoom;
      this.pivot.set(feet.x, 0.8, feet.z);
      this.camera.position.copy(this.pivot).addScaledVector(this.look, -back);
      return;
    }
    if (this.style === 'drone') {
      // flown by the stick (forward is the way it looks), its height by the zoom; kept in the dome and near her
      if (!this.dronePlaced) { this.drone.copy(this.camera.position); this.dronePlaced = true; }
      const fx = Math.sin(this.easedYaw), fz = Math.cos(this.easedYaw);
      const step = STYLE.droneSpeed * dt;
      this.drone.x += (fx * this.droneStick.y - fz * this.droneStick.x) * step;
      this.drone.z += (fz * this.droneStick.y + fx * this.droneStick.x) * step;
      const height = STYLE.droneLow + (STYLE.droneHigh - STYLE.droneLow) * zoom;
      this.drone.y += (height - this.drone.y) * ease;
      // (near her: no further than its range)
      let dx = this.drone.x - feet.x, dz = this.drone.z - feet.z, d = Math.hypot(dx, dz);
      if (d > STYLE.droneRange) { this.drone.x = feet.x + dx / d * STYLE.droneRange; this.drone.z = feet.z + dz / d * STYLE.droneRange; }
      // (inside the dome: no further from the plaza centre than its limit)
      d = Math.hypot(this.drone.x, this.drone.z);
      if (d > this.droneLimit) { this.drone.x *= this.droneLimit / d; this.drone.z *= this.droneLimit / d; }
      this.camera.position.copy(this.drone);
      this.setLook(this.easedYaw, this.easedPitch);
      return;
    }
    // CINEMATIC: the shot's place in her own frame, drifting as it runs; cut to the next when its time is up
    this.shotTime += dt;
    if (this.shotTime > STYLE.shotSeconds) { this.shotTime = 0; this.shot = (this.shot + 1) % SHOTS.length; this.shotYawSet = false; }
    // (each shot keeps the way she faced WHEN IT BEGAN: turning with her as she turned, the camera spun round her
    //  whenever she walked, Joshua, 2026-11-18. It still goes where she goes, so she stays in it.)
    if (!this.shotYawSet) { this.shotYaw = heroine.root.rotation.y; this.shotYawSet = true; }
    const shot = SHOTS[this.shot], yaw = this.shotYaw, along = this.shotTime / STYLE.shotSeconds;
    const toWorld = (local: readonly number[], drift: number, out: THREE.Vector3): THREE.Vector3 => {
      const x = local[0] + shot.drift[0] * drift, y = local[1] + shot.drift[1] * drift, z = local[2] + shot.drift[2] * drift;
      // (her left is x, her front z: turned by her yaw)
      return out.set(feet.x + x * Math.cos(yaw) + z * Math.sin(yaw), y, feet.z - x * Math.sin(yaw) + z * Math.cos(yaw));
    };
    toWorld(shot.from, (along - 0.5) * STYLE.shotDrift, this.camera.position);
    this.camera.position.y = Math.max(MIN_CAMERA_HEIGHT, this.camera.position.y);
    toWorld(shot.at, 0, this.shotAt);
    this.camera.lookAt(this.shotAt);
    this.look.copy(this.shotAt).sub(this.camera.position).normalize();
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

  /** The compass direction the camera really looks right now (after easing): the stick moves her relative to it. */
  get viewYaw(): number {
    if (this.mode === 'first') return this.yaw;
    // (the cinematic camera turns on its own: read the way it really looks)
    if (this.style === 'cinematic') return Math.atan2(this.look.x, this.look.z);
    return this.easedYaw;
  }

  /** Point the camera along (yaw, pitch) and remember that direction in `look`. */
  private setLook(yaw: number, pitch: number): void {
    const flat = Math.cos(pitch);
    this.look.set(Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat);
    // A three.js camera looks down its own -Z, so add half a turn to face +Z at yaw 0.
    this.camera.rotation.set(pitch, yaw + Math.PI, 0);
  }
}
