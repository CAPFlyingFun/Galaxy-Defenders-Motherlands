// ============================================================================
// controls.ts -- everything the player does, gathered into one place.
//
// Touch, mouse and keyboard all end up as the same few numbers:
//   moveX / moveY   the walk stick, each -1..1 (right and forward are +)
//   fireHeld        the fire button or key is down
//   look / zoom     how far the view was dragged or pinched since last asked
//   lookStickX / Y  the CAMERA stick (first person), each -1..1 (right and up are +)
//
// The canvas itself is the "look" surface: one finger (or the mouse) drags the
// view, two fingers pinch to zoom, the wheel zooms. The on-screen buttons and
// the sticks live in ui/hud.ts and write their state into the public fields
// here (stickX, stickY, lookStickX, lookStickY, buttonFire).
//
// The game loop calls sample() once per frame and then reads the results.
// ============================================================================

import { toGameX, toGameY } from '../core/orientation';

/** A drag shorter than this many pixels counts as a click. */
const CLICK_SLOP = 6;

/** What kind of view the game is in, which changes what a mouse click means. */
export type ClickMode = 'look-only' | 'click-fires';

export class Controls {
  // ---- Written by the HUD's on-screen controls ------------------------------
  stickX = 0;
  stickY = 0;
  /** The camera stick (first person): turns the view while the right thumb stays on FIRE. */
  lookStickX = 0;
  lookStickY = 0;
  buttonFire = false;

  // ---- Read by the game after sample() --------------------------------------
  moveX = 0;
  /** MOVE STICK SENSITIVITY (Settings -> CAMERA; Joshua, 2026-11-21): the stick's push is multiplied by this (set by the game). */
  moveScale = 1;
  moveY = 0;
  fireHeld = false;

  /** In first person a mouse click on the view fires one shot; in third person it does nothing. */
  clickMode: ClickMode = 'look-only';

  /** Called when the player presses a key that is not movement or fire (lower-case, e.g. "v"). */
  onKey: ((key: string) => void) | null = null;

  private readonly keys = new Set<string>();
  /** Fingers (or the mouse) currently down on the view: id -> last position. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private pinchDistance = 0;
  private clicks = 0;
  private dragTravel = 0;

  /** `surface` is the element whose drags move the view: the game's canvas. */
  constructor(private readonly surface: HTMLElement) {
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
    // Stop the long-press / right-click menu from covering the game.
    surface.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // If the window loses focus no key-up arrives, so let go of everything.
    window.addEventListener('blur', this.onBlur);
  }

  /** Once per frame: turn the raw keys, stick and buttons into moveX, moveY and fireHeld. */
  sample(): void {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    const forward = this.keys.has('w') || this.keys.has('arrowup');
    const back = this.keys.has('s') || this.keys.has('arrowdown');
    const keyX = (right ? 1 : 0) - (left ? 1 : 0);
    const keyY = (forward ? 1 : 0) - (back ? 1 : 0);

    // (MOVE STICK SENSITIVITY, Settings -> CAMERA: the stick's push scaled, never past its edge; the keys are full anyway)
    let sx = this.stickX * this.moveScale, sy = this.stickY * this.moveScale;
    const far = Math.hypot(sx, sy);
    if (far > 1) { sx /= far; sy /= far; }
    this.moveX = Math.max(-1, Math.min(1, sx + keyX));
    this.moveY = Math.max(-1, Math.min(1, sy + keyY));
    this.fireHeld = this.buttonFire || this.keys.has(' ');
  }

  /** How far the view was dragged sideways since the last call, in pixels (right is +). */
  takeLookX(): number {
    const value = this.lookX;
    this.lookX = 0;
    return value;
  }

  /** How far the view was dragged up or down since the last call, in pixels (down is +). */
  takeLookY(): number {
    const value = this.lookY;
    this.lookY = 0;
    return value;
  }

  /** How much zoom was asked for since the last call: + is "zoom out", - is "zoom in". */
  takeZoom(): number {
    const value = this.zoom;
    this.zoom = 0;
    return value;
  }

  /** How many single shots were clicked since the last call. */
  takeClicks(): number {
    const value = this.clicks;
    this.clicks = 0;
    return value;
  }

  dispose(): void {
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('wheel', this.onWheel);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  // ---- The view surface: drag to look, pinch to zoom --------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    // "Capture" keeps the drag coming to us even if the finger slides over a button.
    this.surface.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragTravel = 0;
    if (this.pointers.size === 2) this.pinchDistance = this.distanceBetweenPointers();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    // How far the finger moved on the SCREEN, turned into how far it moved in the GAME (the game may be
    // drawn turned a quarter turn: src/core/orientation.ts).
    const screenDx = event.clientX - pointer.x;
    const screenDy = event.clientY - pointer.y;
    const dx = toGameX(screenDx, screenDy);
    const dy = toGameY(screenDx, screenDy);
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size === 1) {
      this.lookX += dx;
      this.lookY += dy;
      this.dragTravel += Math.abs(dx) + Math.abs(dy);
    } else if (this.pointers.size === 2) {
      // Two fingers: compare how far apart they are now with a moment ago.
      const distance = this.distanceBetweenPointers();
      if (this.pinchDistance > 0 && distance > 0) this.zoom += Math.log(this.pinchDistance / distance);
      this.pinchDistance = distance;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) return;
    // A mouse press that hardly moved is a click: in first person that is one shot.
    if (event.type === 'pointerup' && event.pointerType === 'mouse' && this.dragTravel < CLICK_SLOP && this.clickMode === 'click-fires') {
      this.clicks++;
    }
    this.pinchDistance = 0;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom += Math.max(-1, Math.min(1, event.deltaY / 100)) * 0.18;
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private distanceBetweenPointers(): number {
    let first: { x: number; y: number } | null = null;
    for (const pointer of this.pointers.values()) {
      if (!first) first = pointer;
      else return Math.hypot(pointer.x - first.x, pointer.y - first.y);
    }
    return 0;
  }

  // ---- Keyboard ---------------------------------------------------------------

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    // Keep the arrow keys and space from scrolling the page.
    if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
    if (event.repeat) return;
    this.keys.add(key);
    if (this.onKey) this.onKey(key);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.pointers.clear();
  };
}
