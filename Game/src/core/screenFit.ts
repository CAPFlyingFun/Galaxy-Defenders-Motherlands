// ============================================================================
// screenFit.ts -- IS THE PHONE HELD UPRIGHT? The browser's own answer.
//
// TRADDOMIUM's way (Joshua, 2026-11-17: "look at how TRADDOMIUM handles the
// rotation... it is smooth"). Everything is sized by the browser itself:
//   - the game's box is the full width and 100dvh tall (index.html), so it
//     turns together with the page as iOS spins it, never a moment behind;
//   - the "rotate your device" cover is shown by a CSS rule alone
//     ("portrait AND worked by a finger"), switched by the browser at the very
//     moment it turns the page;
//   - this file asks the browser the SAME question, so the game pauses exactly
//     when the cover appears.
//
// (Before, v0.2.12 to v0.2.18: the screen's X and Y were saved at the start and
// the game sized itself in pixels from them, flipping them on a turn. Our own
// script then always ran a moment after iOS had turned the page, and the game
// sat off-centre for about a second each time. Gone.)
// ============================================================================

/** The cover's own test in index.html. Keep the two the same. */
const UPRIGHT_QUERY = '(orientation: portrait) and (pointer: coarse)';

let query: MediaQueryList | null = null;
try { query = typeof matchMedia === 'function' ? matchMedia(UPRIGHT_QUERY) : null; } catch { query = null; }

const listeners: Array<(upright: boolean) => void> = [];
let upright = !!query?.matches;

/** Look again (the browser's answer), and tell everyone who asked if it changed. */
function check(): void {
  const now = !!query?.matches;
  if (now === upright) return;
  upright = now;
  for (const fn of listeners) fn(upright);
}

// The browser says when its answer changes; the other signals are only there in case that message is late.
if (query) {
  if (typeof query.addEventListener === 'function') query.addEventListener('change', check);
  else (query as unknown as { addListener?: (fn: () => void) => void }).addListener?.(check); // older iPhones
}
window.addEventListener('resize', check);
window.addEventListener('orientationchange', check);
window.addEventListener('pageshow', check);

/** Is the phone held upright now (so the rotate cover is up and the game paused)? */
export function isUprightNow(): boolean { return upright; }
/** Call `fn` each time the phone is turned upright (true) or back on its side (false). */
export function onTurn(fn: (upright: boolean) => void): void { listeners.push(fn); }
/** Ask again now. */
export function checkScreen(): void { check(); }
