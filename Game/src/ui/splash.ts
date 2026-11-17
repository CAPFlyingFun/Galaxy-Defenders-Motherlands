// ============================================================================
// splash.ts -- fills in the SPLASH while the game loads, and takes it away
// when the game is ready.
//
// Joshua, 2026-11-17: "Create a simple splash screen while loading up
// everything with maybe an actual loading bar with percentage and estimated
// time remaining."
//
// The splash itself is not made here. It is written into index.html (its
// words and its looks), so it is on screen from the first moment, before any
// of the game's code has arrived. This file only keeps four things on it up
// to date, from the load meter (src/core/loadMeter.ts), which is where the
// numbers come from and why they can be trusted:
//
//   the bar          how far along the loading is
//   the percentage   the same, as a number (it only ever rises)
//   the line         what is loading now ("Loading Blaze: unpacking her body…")
//   the time left    "about 12 seconds left", or nothing at all when there is
//                    not yet anything honest to say (the first load on a device)
// ============================================================================
import type { LoadMeter } from '../core/loadMeter';

export interface Splash {
  /** The game is ready: the bar fills, the splash fades away and is taken off the page. */
  done(): void;
}

/** How long the splash takes to fade (index.html: `#splash { transition: opacity .4s }`), milliseconds. */
const FADE_MS = 400;

/**
 * Keep the words in `node` in one piece of text that is REWRITTEN, never replaced. Two other small scripts watch
 * the page for things being added to it (versionTag.ts, layoutEditor.ts); putting new text in would wake them
 * many times a second, rewriting the text that is already there does not. Returns the way to write to it.
 */
function writer(node: HTMLElement): (text: string) => void {
  const text = document.createTextNode(node.textContent ?? '');
  node.replaceChildren(text);
  let shown = text.data;
  return (next: string): void => {
    if (next === shown) return; // the page is only touched when the words change
    shown = next;
    text.data = next;
  };
}

/** The time left, in words. Rounded more coarsely the further off it is: nobody can promise "43 seconds". */
export function timeLeftText(seconds: number | null): string {
  if (seconds === null) return ''; // it cannot be told: say nothing
  if (seconds < 1) return 'almost there…';
  if (seconds < 20) {
    const whole = Math.round(seconds);
    return `about ${whole} second${whole === 1 ? '' : 's'} left`;
  }
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} seconds left`;
  const minutes = Math.round(seconds / 30) / 2; // to the nearest half minute
  return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

/** Start showing `meter` on the splash. (On a page with no splash this does nothing.) */
export function connectSplash(meter: LoadMeter): Splash {
  const splash = document.getElementById('splash');
  const bar = document.getElementById('splash-bar');
  const fill = document.getElementById('splash-fill');
  const step = document.getElementById('splash-step');
  const percent = document.getElementById('splash-percent');
  const time = document.getElementById('splash-time');
  if (!splash || !fill || !step || !percent || !time) return { done(): void {} };

  const writeStep = writer(step);
  const writePercent = writer(percent);
  const writeTime = writer(time);
  let shownWidth = '';
  let request = 0;

  /** Put the meter's numbers on the splash. Called once for every picture the screen draws. */
  const show = (): void => {
    const fraction = meter.fraction;
    // The bar is as wide as the exact share done; the number beside it is that share in whole percent, rounded DOWN
    // (so it says 100 only when everything really is in).
    const width = `${(fraction * 100).toFixed(1)}%`;
    if (width !== shownWidth) {
      shownWidth = width;
      fill.style.width = width;
      bar?.setAttribute('aria-valuenow', String(Math.floor(fraction * 100)));
    }
    writePercent(`${Math.floor(fraction * 100)}%`);
    if (meter.label) writeStep(meter.label);
    writeTime(timeLeftText(meter.secondsLeft()));
  };
  const loop = (): void => {
    show();
    request = requestAnimationFrame(loop);
  };
  loop();

  return {
    done(): void {
      cancelAnimationFrame(request);
      show(); // (the meter has been told it is finished: this writes 100%)
      writeStep('Ready');
      // Fade away. From this moment the splash lets touches through to the game beneath it.
      splash.classList.add('is-done');
      window.setTimeout(() => splash.remove(), FADE_MS + 100);
    },
  };
}

/**
 * Loading failed and the game cannot start: say so on the splash, in place of what was loading, in `colour`.
 * (If the page has no splash, the words are put in the middle of the page.)
 */
export function showSplashError(text: string, colour: string): void {
  const splash = document.getElementById('splash');
  const step = document.getElementById('splash-step');
  if (splash && step) {
    splash.classList.remove('is-done');
    splash.classList.add('is-broken'); // (index.html: the words may wrap, and the light stops sweeping along the bar)
    // New words in place of the old ones. (This also cuts the line loose from the loop above, which would
    // otherwise write "what is loading" back over the message.)
    step.textContent = text;
    step.style.color = colour;
    const time = document.getElementById('splash-time');
    if (time) time.textContent = '';
    return;
  }
  const message = document.createElement('p');
  message.style.cssText = `position:fixed;inset:0;margin:auto;height:3em;text-align:center;color:${colour}`;
  message.textContent = text;
  document.body.appendChild(message);
}
