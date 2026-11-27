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
export type CameraStyle = 'follow' | 'shoulder' | 'orbit' | 'top' | 'drone' | 'cinematic' | 'sideLeft' | 'sideRight';
export const CAMERA_STYLES: readonly CameraStyle[] = ['follow', 'shoulder', 'orbit', 'top', 'drone', 'cinematic', 'sideLeft', 'sideRight'];
/** Each style's name under the CAM button. */
export const CAMERA_STYLE_NAMES: Readonly<Record<CameraStyle, string>> = Object.freeze({
  follow: 'follow', shoulder: 'shoulder', orbit: 'orbit', top: 'top', drone: 'drone', cinematic: 'cinematic',
  sideLeft: 'side L', sideRight: 'side R',
});

/** GAME TUNING for the camera styles (metres, seconds, radians). */
export const STYLE = Object.freeze({
  /** SHOULDER: how far behind (closest, furthest with the zoom), how far to her right, how high. */
  shoulderNear: 0.75, shoulderFar: 2.6, shoulderSide: 0.38, shoulderUp: 1.55,
  /** ...and how far below her eyes it sits (metres), and how far down and up it may look (radians). */
  shoulderDown: -0.12,
  shoulderPitchMin: -1.1, shoulderPitchMax: 0.9,
  /**
   * ...and LOOKING DOWN WITH HER (Joshua, 2026-11-19: "a higher view looking down and what she is doing"): for each
   * radian her head looks down, it rises this much higher and comes this much further back (metres), so her hands and
   * what they hold stay in view over her shoulder.
   */
  shoulderLiftPerDown: 0.32, shoulderBackPerDown: 0.35,
  /** ORBIT: how fast it circles her, radians a second (about one turn in 40 seconds). */
  orbitSpeed: 0.16,
  /** TOP: how far it looks down, and its distance from her (closest, furthest with the zoom). */
  topPitch: -1.05, topNear: 6, topFar: 34,
  /** DRONE: how fast it flies, its height (lowest, highest with the zoom), the most it may be from her. */
  droneSpeed: 9, droneLow: 2.5, droneHigh: 30, droneRange: 60,
  /** CINEMATIC: how long each shot lasts, and how far it drifts while it does. */
  shotSeconds: 6, shotDrift: 0.9,
  /**
   * SIDE (Joshua, 2026-11-19: "a side view camera locked to either side of her full profile to show the belly and side
   * profile"): square to her left or her right side, turning with her; how far (closest, furthest with the zoom), the
   * height it stands at and looks at (her middle, so all of her shows), and how quickly it follows her turning.
   */
  sideNear: 1.8, sideFar: 7, sideUp: 0.95, sideFollow: 4,
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
 * The closest the third-person camera comes: a QUARTER of zoom 0's distance, 0.8 m (Joshua, 2026-11-17: "make zoom
 * double for zoom inward... Out is good", which made it half, 1.6 m; then 2026-11-21: "double how close you can zoom in
 * with all the cameras"). Zoom 0 is still where it was (3.2 m), so everything set before keeps its place; the zoom
 * simply goes on below 0 to here, the pivot staying at its lowest above her head.
 */
export const ZOOM_MIN = -(DISTANCE_NEAR * 0.75) / (DISTANCE_FAR - DISTANCE_NEAR);
/**
 * THE OTHER STYLES' DISTANCES at a zoom (Joshua, 2026-11-21: "double how close you can zoom in with all the cameras"):
 * from zoom 0 to 1 their own closest to furthest, as before; below 0 on in to HALF their old closest at ZOOM_MIN (shoulder
 * 0.75 -> 0.38 m, side 1.8 -> 0.9 m, top 6 -> 3 m, drone 2.5 -> 1.25 m up). (They used to stop at zoom 0.)
 */
function styleSpan(near: number, far: number, zoom: number): number {
  if (zoom >= 0) return near + (far - near) * Math.min(1, zoom);
  return near * (1 - 0.5 * Math.min(1, zoom / ZOOM_MIN));
}
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
/**
 * THE NEAREST THE CAMERA DRAWS, metres (Joshua, 2026-11-20: her shoulder "cut through" turning her head at the bar).
 * First person 1 cm, so her shoulder, arms and belly are whole however near her eyes they come (her own head is hidden
 * from her camera, fastHeroine.ts `setFirstPerson`); third person 6 cm, as it always was. (The farthest: 20 km on the
 * island, 2 km in the town: main.ts.)
 */
const FIRST_NEAR = 0.01;
const THIRD_NEAR = 0.06;
const FOV_PORTRAIT = 72; // a tall phone screen shows more sky
const FOV_LANDSCAPE = 58;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** First person: the pitch her head can look at, radians [down, up] (her neck's reach; until she says, the old limits). */
  private readonly firstRange: [number, number] = [FIRST_PITCH_MIN, FIRST_PITCH_MAX];
  /** Which way the camera looks now (a unit direction, world). */
  get lookDirection(): THREE.Vector3 { return this.look; }
  mode: ViewMode = 'third';

  style: CameraStyle = 'follow';
  /**
   * HER HEAD, for the over-the-shoulder camera, which is locked to it (Joshua, 2026-11-18): where her eyes are, the
   * way her head faces, and how far up or down she looks. Set by the game each frame; `valid` once it has been.
   */
  readonly head = { at: new THREE.Vector3(), yaw: 0, pitch: 0, valid: false };
  /** DRONE: the stick this frame (right, forward: -1..1), and how far from the plaza centre it may go (the dome). */
  readonly droneStick = { x: 0, y: 0 };
  droneLimit = 70;
  /**
   * THE GROUND'S HEIGHT at a place, metres, on a map with hills (the island: src/world/island/islandWorld.ts); null on
   * the flat town (ground 0 everywhere). The camera never goes under it; NaN (not loaded there) counts as her feet's.
   */
  groundAt: ((x: number, z: number) => number) | null = null;
  /**
   * WALLS ROUND HER, FOR THE CAMERA (v0.2.153, the prologue's passage: world/prologue/tunnel.ts `keepClear`): given a
   * point by her (`from`, inside) and where the third-person camera wants to be (`to`), it brings `to` in along the
   * line between them to just short of the first rock in the way. null on the open maps (the camera goes anywhere).
   */
  keepClear: ((from: THREE.Vector3, to: THREE.Vector3) => void) | null = null;
  /**
   * A ROOF OVER HER (v0.2.179, the Fishers' home: its ceilings 2.7 m up), metres over her feet, or null (open sky).
   * The follow camera's pivot is kept this far up at the most: in a room its walls bring the camera in to a couple of
   * metres behind her, and from its usual pivot, 3.3 m up and looking level, she was under the bottom of the picture.
   */
  pivotCeiling: number | null = null;
  /**
   * ...and the CAMERA itself kept under it, metres over her feet (null: no roof): looking down at her in a room it rose
   * over the ceiling (one-sided, so unseen from above) and showed the house from over its walls. Brought in toward the
   * point it looks from, as by `keepClear`, so it still looks the same way.
   */
  cameraCeiling: number | null = null;
  /** (where the camera looks from, for `keepClear`, one vector kept for it) */
  private readonly clearFrom = new THREE.Vector3();
  /**
   * HOW MUCH LOWER SHE IS (Joshua, 2026-11-20: crouching, on her belly, on all fours), metres, set by the game: the
   * following camera's pivot and the side views come down with her, eased.
   */
  lower = 0;
  private easedLower = 0;
  private readonly drone = new THREE.Vector3();
  private dronePlaced = false;
  /** CINEMATIC: which shot, and how long it has run. */
  private shot = 0;
  private shotTime = 0;
  /** The way she faced when this shot began (the shot's frame keeps it), and whether it has been read yet. */
  private shotYaw = 0;
  /** SIDE: the way her body faced, as the camera follows it (eased), and whether it has been set yet. */
  private sideYaw = 0;
  private sidePlaced = false;
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
    this.camera = new THREE.PerspectiveCamera(FOV_PORTRAIT, 1, THIRD_NEAR, 2000);
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

  /** Look this way at once (no easing round to it): where she arrives on a map. With `pitch`, tipped that far at once
   *  too (a character swapped back to: main.ts `swapCharacter`). */
  faceAtOnce(yaw: number, pitch?: number): void {
    this.yaw = this.easedYaw = yaw;
    if (pitch !== undefined) this.pitch = this.easedPitch = pitch;
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
    this.sidePlaced = false; // (the side view starts square to her, at once)
    if (style === 'top') this.pitch = STYLE.topPitch;
    else if (this.pitch < THIRD_PITCH_MIN) this.pitch = THIRD_PITCH_START;
    if (style === 'shoulder') this.pitch = clamp(this.pitch, STYLE.shoulderPitchMin, STYLE.shoulderPitchMax);
    // (the side views: the pitch is HER HEAD'S up and down, level to begin with: see applyLook)
    if (style === 'sideLeft' || style === 'sideRight') this.pitch = 0;
  }

  /** Switch between third and first person. The camera keeps looking the same compass direction. */
  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // (first person draws from 1 cm, third from 6: see FIRST_NEAR)
    this.camera.near = mode === 'first' ? FIRST_NEAR : THIRD_NEAR;
    this.camera.updateProjectionMatrix();
    this.pitch = mode === 'third' ? THIRD_PITCH_START : 0;
    this.easedYaw = this.yaw;
    this.easedPitch = this.pitch;
    this.fitFov(); // (each view has its own field of view)
  }

  /** CAMERA SENSITIVITY (Settings -> CAMERA, 1 = the old LOOK_SPEED; Joshua, 2026-11-21): set by the game each frame. */
  lookScale = 1;

  /** The view was dragged by this many pixels. */
  applyLook(pixelsX: number, pixelsY: number): void {
    // Dragging right looks right (a smaller compass angle); dragging up looks up.
    this.yaw -= pixelsX * LOOK_SPEED * this.lookScale;
    this.pitch -= pixelsY * LOOK_SPEED * this.lookScale;
    this.pitch =
      // (first person: as far up and down as her neck reaches from her torso's line, as it was last frame)
      this.mode === 'first' ? clamp(this.pitch, this.firstRange[0], this.firstRange[1])
        // (THE SIDE VIEWS: the camera stays square to her side, and dragging up and down tips HER HEAD, as far as her
        //  neck reaches from her torso's line, as in first person: Joshua, 2026-11-20, "For the side views, can we make
        //  up and down work for the head?")
        : this.style === 'sideLeft' || this.style === 'sideRight' ? clamp(this.pitch, this.firstRange[0], this.firstRange[1])
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
    // (her neck's reach up and down this frame: first person and the side views look within it)
    const range = heroine.headPitchRange?.();
    if (range) { this.firstRange[0] = range[0]; this.firstRange[1] = range[1]; }
    if (this.mode === 'first') {
      // FIRST PERSON IS HER HEAD (Joshua, 2026-11-20: "un-hide the head... offset forward at touch and keep same eye
      // height like in Beyond Extinction... as it can only bend what the head can do"): the camera is fixed to her
      // skull, just clear of her face (fastHeroine.ts `eyeView`); it turns, tips and bobs with her head. Where the
      // player looks (yaw, pitch) is where her head is asked to look; the pitch is kept within her neck's reach from
      // her torso's line, so dragging past it does nothing (left and right: past 90 degrees her body turns).
      this.pitch = clamp(this.pitch, this.firstRange[0], this.firstRange[1]);
      if (heroine.eyeView) {
        // (on her head, exactly: no easing. Joshua, 2026-11-20: "make the camera like v0.2.102 attached to the bone no
        //  damping... the body naturally has a bob and sway adjustment... in 1st person, make 0% Bob, Sway": her own
        //  Bob and Sway are off in first person, fastHeroine.ts `setFirstPerson`, so her head is steady by itself)
        heroine.eyeView(this.camera.position, this.camera.quaternion);
        this.look.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      } else {
        heroine.eye(this.camera.position, this.pitch);
        this.setLook(this.yaw, this.pitch);
      }
      return;
    }

    // --- Third person ---------------------------------------------------------
    // Ease toward what the player asked for. (1 - e^(-rate*dt)) is smooth at any frame rate.
    const ease = 1 - Math.exp(-SMOOTHING * dt);
    if (this.style === 'orbit') this.yaw += STYLE.orbitSpeed * dt; // (circling on its own; a drag adds to it)
    if (this.style === 'shoulder' || this.style === 'top' || this.style === 'drone' || this.style === 'cinematic' || this.style === 'sideLeft' || this.style === 'sideRight') {
      this.easedYaw += (this.yaw - this.easedYaw) * ease;
      this.easedPitch += (this.pitch - this.easedPitch) * ease;
      this.easedZoom += (this.zoom - this.easedZoom) * ease;
      this.placeStyle(dt, heroine, ease);
      this.clearView(heroine);
      return;
    }
    this.easedYaw += (this.yaw - this.easedYaw) * ease;
    this.easedPitch += (this.pitch - this.easedPitch) * ease;
    this.easedZoom += (this.zoom - this.easedZoom) * ease;

    // The pivot follows a point above her head, wherever on the map she is. Only the pivot moves with her: the
    // two angles are the player's alone, so the camera keeps the side of her it was dragged to while she runs.
    const feet = heroine.root.position;
    this.easedLower += (this.lower - this.easedLower) * (1 - Math.exp(-3 * dt));
    const openPivot = Math.max(MIN_CAMERA_HEIGHT + 0.3, PIVOT_NEAR + (PIVOT_FAR - PIVOT_NEAR) * Math.max(0, this.easedZoom) - this.easedLower);
    const pivotHeight = this.pivotCeiling !== null ? Math.min(openPivot, this.pivotCeiling) : openPivot;
    if (this.pivotPlaced) {
      this.pivot.x += (feet.x - this.pivot.x) * ease;
      this.pivot.z += (feet.z - this.pivot.z) * ease;
    } else {
      this.pivot.x = feet.x;
      this.pivot.z = feet.z;
      this.pivotPlaced = true;
    }
    this.pivot.y = feet.y + pivotHeight; // (above her feet, wherever the ground is)

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
    // (on hills: never under the slope behind her)
    this.keepAboveGround(feet.y);
    this.clearView(heroine);
  }

  /**
   * THE CAMERA KEPT OUT OF THE ROCK (`keepClear`, set only where there are walls round her): brought in toward the
   * point it looks from, along its own line of sight, so it still looks the same way, only from nearer.
   */
  private clearView(heroine: HeroineBody): void {
    if (!this.keepClear && this.cameraCeiling === null) return;
    const feet = heroine.root.position;
    // (the side views and the cinematic shots look AT a point by her; the others look from their pivot)
    if (this.style === 'sideLeft' || this.style === 'sideRight' || this.style === 'cinematic') this.clearFrom.copy(this.shotAt);
    else if (this.style === 'drone') this.clearFrom.set(feet.x, feet.y + 1.5, feet.z);
    else this.clearFrom.copy(this.pivot);
    this.keepClear?.(this.clearFrom, this.camera.position);
    // (under the roof: along the same line, toward where it looks from, until it is under the ceiling)
    if (this.cameraCeiling !== null) {
      const top = feet.y + this.cameraCeiling, cam = this.camera.position, from = this.clearFrom;
      if (cam.y > top && from.y < top) cam.lerpVectors(from, cam, (top - from.y) / (cam.y - from.y));
    }
  }

  /** The lowest the camera may be at its own place: just over the ground there (or over her feet's level). */
  private keepAboveGround(feetY: number): void {
    const c = this.camera.position;
    const ground = this.groundAt ? this.groundAt(c.x, c.z) : 0;
    c.y = Math.max((Number.isFinite(ground) ? ground : feetY) + MIN_CAMERA_HEIGHT, c.y);
  }

  /** The styles other than follow and orbit (shoulder, top, drone, cinematic). */
  private placeStyle(dt: number, heroine: HeroineBody, ease: number): void {
    const feet = heroine.root.position;
    const zoom = clamp(this.easedZoom, ZOOM_MIN, 1);
    if (this.style === 'shoulder') {
      // LOCKED TO HER HEAD: looking where it looks (the middle of the screen is where she looks and aims), from behind
      // her right shoulder, a little below her eyes; it turns and tips with her head
      const yaw = this.head.valid ? this.head.yaw : this.easedYaw;
      const pitch = clamp(this.head.valid ? this.head.pitch : this.easedPitch, STYLE.shoulderPitchMin, STYLE.shoulderPitchMax);
      this.setLook(yaw, pitch);
      const down = Math.max(0, -pitch);
      const back = styleSpan(STYLE.shoulderNear, STYLE.shoulderFar, zoom) + down * STYLE.shoulderBackPerDown;
      const rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);
      if (this.head.valid) this.pivot.copy(this.head.at); else this.pivot.set(feet.x, feet.y + STYLE.shoulderUp + 0.1, feet.z);
      this.pivot.x += rightX * STYLE.shoulderSide;
      this.pivot.z += rightZ * STYLE.shoulderSide;
      this.pivot.y += STYLE.shoulderDown + down * STYLE.shoulderLiftPerDown;
      this.camera.position.copy(this.pivot).addScaledVector(this.look, -back);
      this.keepAboveGround(feet.y);
      // (the player's own look starts from here when the view changes)
      this.easedYaw = yaw;
      return;
    }
    if (this.style === 'sideLeft' || this.style === 'sideRight') {
      // SQUARE TO HER SIDE, whichever way she faces: her left is across her front (x = cos, z = -sin of her yaw). The
      // camera stands out that side at her middle's height, looking straight across at her, so her whole profile (her
      // belly and her back) shows; it swings round with her, eased, so a turn does not jerk it.
      const her = heroine.root.rotation.y;
      if (!this.sidePlaced) { this.sideYaw = her; this.sidePlaced = true; }
      let turn = her - this.sideYaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // (the short way round)
      this.sideYaw += turn * (1 - Math.exp(-STYLE.sideFollow * dt));
      const out = this.style === 'sideLeft' ? 1 : -1;
      const sideX = Math.cos(this.sideYaw) * out, sideZ = -Math.sin(this.sideYaw) * out;
      const back = styleSpan(STYLE.sideNear, STYLE.sideFar, zoom);
      this.easedLower += (this.lower - this.easedLower) * (1 - Math.exp(-3 * dt));
      const up = Math.max(0.25, STYLE.sideUp - this.easedLower * 0.6);
      this.camera.position.set(feet.x + sideX * back, feet.y + up, feet.z + sideZ * back);
      this.keepAboveGround(feet.y);
      this.shotAt.set(feet.x, feet.y + up, feet.z);
      this.camera.lookAt(this.shotAt);
      this.look.copy(this.shotAt).sub(this.camera.position).normalize();
      return;
    }
    if (this.style === 'top') {
      // high up, looking down at her at its own angle; the zoom takes it further up and back
      this.setLook(this.easedYaw, STYLE.topPitch);
      const back = styleSpan(STYLE.topNear, STYLE.topFar, zoom);
      this.pivot.set(feet.x, feet.y + 0.8, feet.z);
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
      const height = styleSpan(STYLE.droneLow, STYLE.droneHigh, zoom);
      this.drone.y += (feet.y + height - this.drone.y) * ease; // (its height over her feet)
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
      return out.set(feet.x + x * Math.cos(yaw) + z * Math.sin(yaw), feet.y + y, feet.z - x * Math.sin(yaw) + z * Math.cos(yaw));
    };
    toWorld(shot.from, (along - 0.5) * STYLE.shotDrift, this.camera.position);
    this.keepAboveGround(feet.y);
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
    if (this.style === 'cinematic' || this.style === 'sideLeft' || this.style === 'sideRight') return Math.atan2(this.look.x, this.look.z);
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
