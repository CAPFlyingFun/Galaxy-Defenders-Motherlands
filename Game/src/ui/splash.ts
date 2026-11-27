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
//   the time left    "about 12 seconds left". Never a made-up number: on the
//                    first load on a device there is nothing to go by yet, so
//                    the line says just that (the load is being timed, and
//                    the next one will show a time)
//   the size         "62.4 / 98.1 MB · 64% · 5.2 MB/s": downloaded of the whole
//                    load (as it came to last time on this device), its share
//                    and the speed now (Joshua, 2026-11-22, as TRADDOMIUM and
//                    Beyond Extinction show it). The first time: only what has
//                    arrived, as the whole is not known yet.
//   the last start   if the phone CLOSED the game while it started last time,
//                    where it had got to (core/startupLog.ts): a screenshot of
//                    the splash then says where it stopped. With it, a button
//                    to CLEAR THE SAVED FILES AND START FRESH (core/freshStart.ts;
//                    Joshua, 2026-11-22), there when the game cannot get as far
//                    as Settings.
//   the count        how many starts of this version reached 30 s, per map
//                    (v0.2.149: "town 4 of 5 · island 1 of 3"), for Joshua's
//                    test of whether the island is behind the crashes.
// ============================================================================
import type { LoadMeter } from '../core/loadMeter';
import { restartGame } from '../core/restart';
import { clearAndStartFresh } from '../core/freshStart';

export interface Splash {
  /** The game is ready: the bar fills, the splash fades away and is taken off the page. */
  done(): void;
}

/** How long the splash takes to fade (index.html: `#splash { transition: opacity .4s }`), milliseconds. */
const FADE_MS = 400;
/** What the time line says on a device's first load, when no time can honestly be given. */
/** The first seconds of a load, before the time left can be told (loadMeter.ts: it waits for a few seconds of numbers). */
const ESTIMATING_NOTE = 'estimating time left…';
const FIRST_LOAD_NOTE = 'Timing this first load, so the next one can show the time left';

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

/** Megabytes, to a tenth (1 MB = 1,048,576 bytes, as a phone's own Settings count them). */
const megabytes = (bytes: number): string => (bytes / 1048576).toFixed(1);

/**
 * THE DOWNLOAD LINE, as TRADDOMIUM writes it (Joshua, 2026-11-26): "Download: 30.6 / 105.5 MB (29.0% @ 0.4 MB/s)";
 * the whole not known (a first load), "Download: 30.6 MB (@ 0.4 MB/s)". Its percentage is of the BYTES, which is not
 * the bar's: the bar is the whole load, unpacking and building too.
 */
export function bytesText(bytes: number, expected: number | null, perSecond: number): string {
  if (bytes <= 0) return '';
  const speed = perSecond >= 1024 ? `@ ${megabytes(perSecond)} MB/s` : '';
  // (this load came to more than last time's: the whole is at least what has come)
  if (expected === null) return `Download: ${megabytes(bytes)} MB${speed ? ` (${speed})` : ''}`;
  const whole = Math.max(expected, bytes);
  const share = (Math.floor((bytes / whole) * 1000) / 10).toFixed(1);
  return `Download: ${megabytes(bytes)} / ${megabytes(whole)} MB (${share}%${speed ? ` ${speed}` : ''})`;
}

/** THE STEP'S OWN SHARE, to the right of its words: "4.2 / 15.4 MB · 27%" for a step that downloads, "64%" else. */
export function stepText(fraction: number | null, bytes: number, expected: number | null): string {
  if (fraction === null) return '';
  const whole = `${Math.floor(fraction * 100 + 1e-6)}%`;
  return expected !== null ? `${megabytes(bytes)} / ${megabytes(expected)} MB · ${whole}` : whole;
}

/**
 * Show where the LAST start stopped, if the phone closed it (core/startupLog.ts), on the splash and the cover, and with
 * it the button that clears the game's saved files and starts fresh (core/freshStart.ts).
 */
export function showLastStart(text: string | null): void {
  for (const id of ['splash-last', 'rotate-last']) {
    const node = document.getElementById(id);
    if (node) node.textContent = text ?? '';
  }
  for (const id of ['splash-fresh', 'rotate-fresh']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) continue;
    button.hidden = !text;
    button.onclick = (event) => {
      event.stopPropagation();
      button.disabled = true;
      button.textContent = 'Clearing saved files…';
      void clearAndStartFresh();
    };
  }
}

/** Show the count of starts of this version that reached 30 s, per map (core/startupLog.ts `startCountText`). */
export function showStartCount(text: string): void {
  for (const id of ['splash-count', 'rotate-count']) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }
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
  const sizeNode = document.getElementById('splash-bytes'), coverSize = document.getElementById('rotate-bytes');
  const writeSize = sizeNode ? writer(sizeNode) : (): void => {};
  const writeCoverSize = coverSize ? writer(coverSize) : (): void => {};
  // (the step's own share and its thin bar, on the splash and the cover)
  const stepPercents = ['splash-step-percent', 'rotate-step-percent'].map((id) => document.getElementById(id)).filter((n): n is HTMLElement => !!n).map(writer);
  const stepBars = ['splash-stepbar', 'rotate-stepbar'].map((id) => document.getElementById(id)).filter((n): n is HTMLElement => !!n);
  const stepFills = ['splash-stepfill', 'rotate-stepfill'].map((id) => document.getElementById(id)).filter((n): n is HTMLElement => !!n);
  let stepWidth = '', stepKnown = false;
  /** The size line is worked out a few times a second (the speed would flicker if written every picture). */
  let sizeAt = 0;
  // The same, on the "rotate your device" cover, for a phone held upright while loading (index.html .rotate-loading).
  const coverFill = document.getElementById('rotate-fill');
  const coverStep = document.getElementById('rotate-step'), coverPercent = document.getElementById('rotate-percent'), coverTime = document.getElementById('rotate-time');
  const writeCoverStep = coverStep ? writer(coverStep) : (): void => {};
  const writeCoverPercent = coverPercent ? writer(coverPercent) : (): void => {};
  const writeCoverTime = coverTime ? writer(coverTime) : (): void => {};
  let shownWidth = '';
  let request = 0;

  /** Put the meter's numbers on the splash. Called once for every picture the screen draws. */
  const show = (): void => {
    const fraction = meter.fraction;
    // The bar is as wide as the exact share done; the number beside it is that share in whole percent, rounded DOWN
    // (so it says 100 only when everything really is in). The tiny amount added first is for the computer's
    // arithmetic: 0.57 x 100 comes out as 56.99999999999999, which must still read 57.
    const width = `${(fraction * 100).toFixed(1)}%`;
    const whole = Math.floor(fraction * 100 + 1e-6);
    if (width !== shownWidth) {
      shownWidth = width;
      fill.style.width = width;
      if (coverFill) coverFill.style.width = width;
      bar?.setAttribute('aria-valuenow', String(whole));
    }
    writePercent(`${whole}%`);
    writeCoverPercent(`${whole}%`);
    if (meter.label) { writeStep(meter.label); writeCoverStep(meter.label); }
    // THE STEP'S OWN SHARE: its words and its thin bar (hidden while it cannot be told)
    const sp = meter.stepProgress();
    const known = sp.fraction !== null;
    if (known !== stepKnown) { stepKnown = known; for (const b of stepBars) b.classList.toggle('is-unknown', !known); }
    if (known) {
      const w = `${(sp.fraction! * 100).toFixed(0)}%`;
      if (w !== stepWidth) { stepWidth = w; for (const f of stepFills) f.style.width = w; }
    }
    const sText = stepText(sp.fraction, sp.bytes, sp.bytesExpected);
    for (const write of stepPercents) write(sText);
    // The time left, when it can be told. If it cannot: on a first load the line says why; otherwise it says nothing.
    const left = meter.secondsLeft();
    const timeText = left !== null ? timeLeftText(left) : meter.estimating ? ESTIMATING_NOTE : meter.firstLoad && !meter.finished ? FIRST_LOAD_NOTE : '';
    writeTime(timeText);
    writeCoverTime(timeText);
    const t = performance.now();
    if (t - sizeAt > 250) {
      sizeAt = t;
      const sizeText = bytesText(meter.bytes, meter.bytesExpected, meter.bytesPerSecond());
      writeSize(sizeText);
      writeCoverSize(sizeText);
    }
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
 * A tap anywhere then loads the page again. (The game installed on a phone's home screen has no reload button, so
 * "please reload the page" would be advice nobody could follow.)
 * If the page has no splash, the words are put in the middle of the page.
 */
export function showSplashError(text: string, colour: string): void {
  // (letting go of what the game already holds first: core/restart.ts)
  const again = (): void => restartGame();
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
    splash.addEventListener('click', again);
    return;
  }
  const message = document.createElement('p');
  message.style.cssText = `position:fixed;inset:0;margin:auto;height:3em;text-align:center;color:${colour}`;
  message.textContent = text;
  message.addEventListener('click', again);
  document.body.appendChild(message);
}
