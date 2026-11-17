// ============================================================================
// orientation.ts -- the game is ALWAYS drawn landscape (wide).
//
// Joshua, 2026-11-16: "draws it landscape view regardless, like a forced
// orientation system, using the screen's own pixels".
//
// A web page cannot lock an iPhone's screen sideways (Safari does not allow
// it), so the game turns ITSELF. Everything the game draws lives inside one
// box, the "stage" (#stage in index.html: the 3D picture and the controls).
//
//   - Screen wider than tall (a computer, a tablet, a phone already turned):
//     the stage simply fills the screen.
//   - Touch screen taller than wide (a phone held upright, or with its
//     rotation lock on): the stage is made as WIDE as the screen is TALL, and
//     turned a quarter turn clockwise, so holding the phone sideways (top of
//     the phone to the left) shows the game the right way up.
//
// Turning the picture is the easy half. Fingers still report where they are
// on the SCREEN, so a swipe "up the screen" must be read as a swipe "to the
// right in the game". toGameX / toGameY below do that for every drag, stick
// and swipe; the controls call them instead of using screen numbers directly.
//
// A mouse-and-keyboard computer with a tall window is left alone: it has no
// way to be "held sideways", so the game just uses the window's shape.
// ============================================================================

/** True while the stage is turned a quarter turn (a touch screen taller than it is wide). */
let rotated = false;
const listeners: Array<() => void> = [];

/** Is the game currently drawing itself turned a quarter turn? */
export function isRotated(): boolean {
  return rotated;
}

/**
 * A movement measured on the SCREEN (dx to the right, dy downward, in pixels), as the GAME sees it.
 * Turned: the game's "right" runs DOWN the screen, and the game's "down" runs to the screen's LEFT.
 */
export function toGameX(dx: number, dy: number): number {
  return rotated ? dy : dx;
}
export function toGameY(dx: number, dy: number): number {
  return rotated ? -dx : dy;
}

/** Call `fn` whenever the stage has been laid out again (the screen was turned or resized). */
export function onStageResize(fn: () => void): void {
  listeners.push(fn);
}

/**
 * Start keeping the stage landscape. Call once, before anything measures the stage.
 * `stage` is the box holding the 3D picture and the controls.
 */
export function keepLandscape(stage: HTMLElement): void {
  // "coarse" = the main way of pointing is a finger. Asked once: it does not change while the game runs.
  const touchScreen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  const layout = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    rotated = touchScreen && height > width;

    if (rotated) {
      // The stage is `height` wide and `width` tall, turned clockwise about its top-left corner. Turning it
      // swings it off the left edge of the screen, so it is first slid right by the screen's width.
      stage.style.width = `${height}px`;
      stage.style.height = `${width}px`;
      stage.style.transform = `translateX(${width}px) rotate(90deg)`;
    } else {
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      stage.style.transform = '';
    }
    // Two labels the styles use (src/ui/hud.css):
    //   is-rotated  the notch and home bar are on different sides of the game than usual
    //   is-short    the stage is not tall (a phone on its side): controls sit side by side
    stage.classList.toggle('is-rotated', rotated);
    stage.classList.toggle('is-short', Math.min(width, height) <= 500);
    for (const fn of listeners) fn();
  };

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  layout();
}
