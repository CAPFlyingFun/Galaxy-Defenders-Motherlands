// ============================================================================
// orientation.ts -- the game is PLAYED IN LANDSCAPE (wide), and this file
// watches the screen for it.
//
// HOW IT WAS (2026-11-16): on a phone held upright the game turned ITSELF a
// quarter turn, so it was still drawn wide ("a forced orientation system").
//
// HOW IT IS NOW (Joshua, 2026-11-17): "Make it like how Beyond Extinction does
// it which if it starts in portrait or you rotate from landscape to portrait,
// it will pause ... will say, game is played in landscape, please rotate your
// device to play". So the game no longer turns itself:
//
//   - A phone held upright is covered by a "rotate your device" message. That
//     cover is plain CSS in index.html (#rotate-cover): the browser itself
//     shows and hides it, so no code here can leave it stuck.
//   - The phone's own rotation lock must be OFF to play: with it on, the phone
//     never tells the page it was turned and the cover stays up.
//   - While the phone is upright the game is paused (src/ui/pauseMenu.ts asks
//     this file to be told, with onUprightChange).
//
// WHAT THIS FILE STILL DOES
//   1. It RE-FITS the game whenever the screen changes shape. Everything the
//      game draws lives in one box, the "stage" (#stage in index.html); when
//      its size changes, everyone who asked with onStageResize() is told (the
//      3D picture then resizes itself to match).
//   2. It says whether a touch screen is being held upright: isUpright().
//      That answer, and the game box's size, come from screenFit.ts (Joshua,
//      2026-11-17): the screen is measured ONCE, kept as a landscape pair, and
//      flipped on a turn; the phone's own angle says which way it is held. The
//      page's own size is no longer trusted for either (the iPhone could leave
//      it stuck at the old shape after a turn). The game box stays landscape
//      behind the cover, so turning the phone never resizes the 3D picture.
//
// THE IPHONE'S LATE SIZE (Joshua, 2026-11-17: "When I started in portrait and
// move to landscape, it didn't resize"). Just after an iPhone is turned it
// still reports the OLD width and height for a short while, so a game that
// measures the screen once, the moment it is told "you were turned", fits
// itself to the old shape and stays that way. The fix is Beyond Extinction's
// (its src/engine/Game.ts `scheduleResize` and the top of its src/main.ts):
//   - measure again on every signal the browser gives (resize,
//     orientationchange, the visual viewport changing);
//   - and measure AGAIN several times over the next second;
//   - and, when the phone is turned, write the page's "viewport" setting out
//     afresh, which makes the iPhone work the page's size out again.
// On top of that a ResizeObserver watches the stage itself, so whenever the
// browser really does change its size, however late, the game hears of it.
//
// THE OLD NAMES STILL WORK. The controls call isRotated / toGameX / toGameY
// (written for the turned stage). They are kept so nothing else has to
// change: the stage is never turned now, so they simply pass screen numbers
// straight through.
// ============================================================================

import { checkScreen, isUprightNow, onTurn } from './screenFit';

/** After any sign that the screen changed, the stage is measured again after each of these waits (milliseconds). */
const MEASURE_AGAIN_MS = [120, 300, 600, 1000];
/** A touch screen that is taller than it is wide: the same test the cover in index.html uses. Keep the two the same. */
/** A stage this short or shorter (pixels) is a phone on its side: styles may pack things tighter (the `is-short` label). */
const SHORT_STAGE = 500;

const resizeListeners: Array<() => void> = [];
const uprightListeners: Array<(upright: boolean) => void> = [];

/** The game never draws itself turned any more (the "rotate your device" cover replaced that). Always false. */
export function isRotated(): boolean {
  return false;
}

/**
 * A movement measured on the SCREEN (dx to the right, dy downward, in pixels), as the GAME sees it.
 * The stage is never turned now, so the game's right is the screen's right and its down is the screen's down.
 */
export function toGameX(dx: number, _dy: number): number {
  return dx;
}
export function toGameY(_dx: number, dy: number): number {
  return dy;
}

/** Call `fn` whenever the stage has changed size (the screen was turned or resized). */
export function onStageResize(fn: () => void): void {
  resizeListeners.push(fn);
}

/** Upright or not, from screenFit.ts (the phone's own angle). */
function uprightNow(): boolean {
  return isUprightNow();
}

/** Is a touch screen being held upright right now (so the "rotate your device" cover is showing)? */
export function isUpright(): boolean {
  return uprightNow();
}

/** Call `fn` each time the phone is turned upright (true) or back on its side (false). */
export function onUprightChange(fn: (upright: boolean) => void): void {
  uprightListeners.push(fn);
}

/**
 * Start watching the stage. Call once, before anything measures it.
 * `stage` is the box holding the 3D picture and the controls (it fills the screen: index.html).
 *
 * (The name is from when this turned the stage to keep the game wide. It turns nothing now: the game is kept
 * landscape by the cover in index.html, and this keeps it FITTED to the screen.)
 */
export function keepLandscape(stage: HTMLElement): void {
  // ---- 1. Measuring the stage, and telling whoever asked when it has changed ------------------------------------
  let lastWidth = -1, lastHeight = -1, lastRatio = -1, lastUpright: boolean | null = null;
  const measure = (): void => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    // A label the styles may use: is-short = the stage is not tall (a phone on its side).
    stage.classList.toggle('is-short', Math.min(width, height) <= SHORT_STAGE);

    // Upright or not is checked here too, in case the browser's own "it changed" message (below) never came.
    const upright = uprightNow();
    if (upright !== lastUpright) {
      const first = lastUpright === null;
      lastUpright = upright;
      // (not the very first time: nobody has been told anything yet, and whoever cares asks isUpright() when it starts)
      if (!first) for (const fn of uprightListeners) fn(upright);
    }

    // Only a real change is passed on. Resizing the 3D picture wipes it, so it must not happen for nothing.
    if (width === lastWidth && height === lastHeight && ratio === lastRatio) return;
    lastWidth = width;
    lastHeight = height;
    lastRatio = ratio;
    for (const fn of resizeListeners) fn();
  };

  // ---- 2. Measuring again and again after the screen changes (the iPhone's late size, see the top of this file) --
  let frameRequest = 0;
  const timers: number[] = [];
  const measureSoon = (): void => {
    // once as the next picture is drawn...
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(measure);
    // ...and again several times over the next second (earlier waits that have not run yet are replaced)
    for (const timer of timers.splice(0)) window.clearTimeout(timer);
    for (const wait of MEASURE_AGAIN_MS) timers.push(window.setTimeout(measure, wait));
  };

  // ---- 3. The iPhone keeping the page's OLD size after a turn: write the "viewport" setting out afresh ----------
  // (Beyond Extinction's `kickViewport`.) The setting is made plain for a moment and then put back exactly as
  // index.html has it, which makes the browser work the page's size out again for the way it is now held.
  const viewport = document.querySelector('meta[name="viewport"]');
  const viewportText = viewport?.getAttribute('content') ?? '';
  const kickViewport = (): void => {
    if (!viewport || !viewportText) return;
    viewport.setAttribute('content', 'width=device-width');
    requestAnimationFrame(() => viewport.setAttribute('content', viewportText));
  };

  // ---- 4. Every signal a browser gives that the screen changed -------------------------------------------------
  window.addEventListener('resize', measureSoon);
  window.addEventListener('orientationchange', () => {
    kickViewport();
    window.setTimeout(kickViewport, 350); // once more when the phone's own turning animation is over
    measureSoon();
  });
  // (the newer name for the same thing, and the part of the page actually in view: the surest signal on an iPhone)
  try { screen.orientation?.addEventListener('change', measureSoon); } catch { /* an older browser: the signals above do */ }
  window.visualViewport?.addEventListener('resize', measureSoon);
  // (coming back to the game from another app, or from the browser's "back" memory)
  window.addEventListener('pageshow', measureSoon);
  // The stage itself: told by the browser whenever its real size changes, whatever the reason and however late.
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(stage);
  // Turned upright or back on its side (screenFit.ts, from the phone's angle): measured at once, and again as above.
  onTurn(() => { measure(); measureSoon(); });
  window.addEventListener('orientationchange', checkScreen);

  // (for the game to ask, when it knows the page may have been left at an old size: see refitNow)
  refit = (): void => { kickViewport(); measureSoon(); };

  measure();
}

let refit: () => void = () => {};
/**
 * Re-check the page's size now and over the next moments, as after a turn. The game calls this when loading ends
 * (Joshua, 2026-11-17): a turn made while the game was busy loading may have left the page laid out at the old
 * shape, because the page cannot redraw while the game's code is working; this puts it right at once.
 */
export function refitNow(): void { refit(); }

