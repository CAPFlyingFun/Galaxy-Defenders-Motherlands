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

// TURNING THE PHONE WHILE THE GAME IS OPEN (Joshua, 2026-11-17). With the phone's rotation lock OFF, turning the
// phone makes iOS spin the whole page, and a moment later the game un-turns its own stage to match: for that
// moment the picture is seen spinning and snapping back, though it ends up looking exactly as it did. So while
// that happens the game is hidden behind a plain dark COVER: it drops the instant the phone reports it is being
// turned, stays until the screen has stopped changing for COVER_HOLD_MS, and then fades away. The game the player
// sees before and after is the same landscape picture; the flip between is never shown.
const COVER_HOLD_MS = 900; // how long after the LAST change of screen shape the cover stays (iOS's spin takes about half a second)
const COVER_FADE_MS = 250; // how long the cover takes to fade away

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

  // The cover: a dark sheet over the whole screen (outside the stage, so it is never turned), normally invisible.
  const cover = document.createElement('div');
  cover.style.cssText = `position:fixed;inset:0;z-index:1000;background:#04060d;opacity:0;pointer-events:none;transition:opacity ${COVER_FADE_MS}ms ease`;
  document.body.appendChild(cover);
  let coverTimer = 0;
  /** Drop the cover at once (no fade in), and lift it once the screen has been still for COVER_HOLD_MS. */
  const coverUp = () => {
    cover.style.transition = 'none';
    cover.style.opacity = '1';
    window.clearTimeout(coverTimer);
    coverTimer = window.setTimeout(() => {
      cover.style.transition = `opacity ${COVER_FADE_MS}ms ease`;
      cover.style.opacity = '0';
    }, COVER_HOLD_MS);
  };

  let first = true;
  let lastWide = window.innerWidth > window.innerHeight;
  const layout = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Has the screen gone from tall to wide or back (the phone was turned)? Then hide the flip. Not the first
    // time (nothing has been shown yet), and not for ordinary resizing that keeps the same shape (a computer's
    // window being dragged, the phone's address bar sliding away).
    const wide = width > height;
    if (!first && touchScreen && wide !== lastWide) coverUp();
    first = false;
    lastWide = wide;
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
  // "orientationchange" arrives as the phone starts to turn, before the screen's new size is known: the cover
  // drops straight away, and the layout follows when the size arrives (the resize above).
  window.addEventListener('orientationchange', () => {
    if (touchScreen) coverUp();
    layout();
  });
  layout();
}
