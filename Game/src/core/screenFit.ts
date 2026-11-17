// ============================================================================
// screenFit.ts -- THE SCREEN'S SIZE, MEASURED ONCE AND FLIPPED ON A TURN.
//
// Joshua, 2026-11-17: "on first load, it needs to store the X and the Y phone
// pixel ratios ... automatic level if it starts in landscape or portrait based
// upon the X and the Y, and then on rotation, then it will just flip the X and
// the Y around without reloading the whole thing again."
//
// WHAT WENT WRONG BEFORE. After the phone was turned, the iPhone sometimes
// kept laying the page out at its OLD size: on its side, the page was still
// 430 wide and 932 tall (his screenshot: the "rotate" cover drawn on the left
// two fifths of a landscape screen, black beside it). Everything that asked
// the page "how big are you?" or "are you upright?" got the old answer, so the
// cover stayed up and the game stayed paused, and the 3D picture was resized
// back and forth (each resize throws its picture away and builds it again,
// which is what felt like "reloading the whole thing").
//
// HOW IT WORKS NOW.
//   1. At the first load the screen's width and height are measured ONCE and
//      kept as the LANDSCAPE size (long side across, short side down): if the
//      phone starts upright the two are simply swapped. They are also kept on
//      the device, so the next load knows them even when opened upright.
//   2. Which way the phone is held is read from the phone's own ANGLE
//      (0 or 180 degrees: upright; 90 or -90: on its side), which the iPhone
//      reports at once and never gets stuck on, not from the page's size.
//   3. The game's box (#stage), the splash and the rotate cover are given
//      their sizes in pixels from the kept pair (index.html reads them as
//      --gd-w / --gd-h and --gd-cw / --gd-ch). On its side: the landscape
//      pair. Upright: the cover gets the pair flipped. THE GAME'S BOX NEVER
//      CHANGES SIZE WHEN THE PHONE IS TURNED: it stays landscape behind the
//      cover, so the 3D picture is never resized and nothing is rebuilt.
//   4. When the page does report a real landscape size (wider than tall, on
//      its side), and it differs from the kept pair (the browser's own bars
//      in Safari, say), that real size is taken and kept instead.
//
// A computer with a mouse is never "upright": its game box simply follows the
// window.
// ============================================================================

/** Where the landscape size is kept on this device. */
const KEY = 'gdm.screenSize';

export interface ScreenPair { readonly width: number; readonly height: number }

/** A touch screen (a phone or tablet), not a computer with a mouse. */
const touch = (): boolean => {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
};

/**
 * Is the phone held upright, by its own ANGLE? null if the browser cannot say. (The newer `screen.orientation`
 * first; older iPhones have only `window.orientation`, in degrees.)
 */
function angleUpright(): boolean | null {
  try {
    const type = screen.orientation?.type;
    if (typeof type === 'string') return type.startsWith('portrait');
  } catch { /* not there: the older way below */ }
  const degrees = (window as unknown as { orientation?: number }).orientation;
  if (typeof degrees === 'number') return degrees === 0 || degrees === 180;
  return null;
}

/** Upright now: a touch screen whose angle says so (or, if it cannot say, whose page is taller than wide). */
function readUpright(): boolean {
  if (!touch()) return false;
  return angleUpright() ?? window.innerHeight > window.innerWidth;
}

function loadKept(): ScreenPair | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ScreenPair | null;
    if (kept && kept.width > kept.height && kept.height > 200 && kept.width < 5000) return { width: kept.width, height: kept.height };
  } catch { /* nothing kept */ }
  return null;
}
function keep(pair: ScreenPair): void {
  try { localStorage.setItem(KEY, JSON.stringify(pair)); } catch { /* cannot be kept: measured again next load */ }
}

// ---- The state ---------------------------------------------------------------------------------------------------------
let upright = readUpright();
/** The LANDSCAPE size: long side across, short side down (CSS pixels). */
let landscape: ScreenPair = (() => {
  const w = window.innerWidth, h = window.innerHeight;
  // Measured as the page stands now; upright, the two are swapped (Joshua's "flip the X and the Y").
  const measured = { width: Math.max(w, h), height: Math.min(w, h) };
  // A size kept from an earlier load is better than a swapped upright one (on its side the browser's bars differ).
  const kept = loadKept();
  if (!touch()) return { width: w, height: h };
  if (!upright && w > h) { keep(measured); return measured; }
  return kept ?? measured;
})();

const listeners: Array<(upright: boolean) => void> = [];

/** Write the sizes onto the page (index.html sizes the stage, the splash and the cover by them). */
function apply(): void {
  const root = document.documentElement.style;
  root.setProperty('--gd-w', `${landscape.width}px`);
  root.setProperty('--gd-h', `${landscape.height}px`);
  // the cover is shown upright: the pair flipped
  root.setProperty('--gd-cw', `${landscape.height}px`);
  root.setProperty('--gd-ch', `${landscape.width}px`);
  // THE STRIP (Joshua, 2026-11-17: the pause menu on the top part of an upright phone, the game below it). Upright,
  // the game's landscape box is shrunk to the phone's width and sits along the bottom; the cover takes the rest.
  // On his phone: 430 / 932 = 0.46, so the strip is about 200 pixels tall, a fifth of the screen.
  const scale = landscape.height / landscape.width, strip = landscape.height * scale;
  root.setProperty('--gd-scale', String(scale));
  root.setProperty('--gd-strip-h', `${strip}px`);
  root.setProperty('--gd-strip-top', `${landscape.width - strip}px`);
  document.documentElement.classList.add('gd-fit');
  document.documentElement.classList.toggle('gd-upright', upright);
}

/**
 * Look again: has the phone been turned, and has the page now reported a real landscape size? Called on every signal
 * the browser gives, and a few times after each (the iPhone's size can arrive late).
 */
function check(): void {
  const nowUpright = readUpright();
  if (!touch()) {
    // a computer: the game box follows the window
    landscape = { width: window.innerWidth, height: window.innerHeight };
  } else if (!nowUpright && window.innerWidth > window.innerHeight) {
    // on its side AND the page agrees: a real landscape size, taken if it changed (by more than a pixel or two)
    const w = window.innerWidth, h = window.innerHeight;
    if (Math.abs(w - landscape.width) > 2 || Math.abs(h - landscape.height) > 2) {
      landscape = { width: w, height: h };
      keep(landscape);
    }
  }
  const turned = nowUpright !== upright;
  upright = nowUpright;
  apply();
  // (back on its side: the page may have been left scrolled by the old layout)
  if (turned && !upright) window.scrollTo(0, 0);
  if (turned) for (const fn of listeners) fn(upright);
}

const timers: number[] = [];
/** Check now, and again over the next second and a half. */
function checkSoon(): void {
  check();
  for (const t of timers.splice(0)) window.clearTimeout(t);
  for (const wait of [100, 300, 700, 1500]) timers.push(window.setTimeout(check, wait));
}

apply();
window.addEventListener('resize', checkSoon);
window.addEventListener('orientationchange', checkSoon);
window.addEventListener('pageshow', checkSoon);
try { screen.orientation?.addEventListener('change', checkSoon); } catch { /* older browser: the signals above do */ }
window.visualViewport?.addEventListener('resize', checkSoon);

/** Is the phone held upright now (so the rotate cover is up and the game paused)? */
export function isUprightNow(): boolean { return upright; }
/** The game's landscape size, CSS pixels. */
export function landscapeSize(): ScreenPair { return landscape; }
/** Call `fn` each time the phone is turned upright (true) or back on its side (false). */
export function onTurn(fn: (upright: boolean) => void): void { listeners.push(fn); }
/** Ask for a check now (and over the next moments). */
export function checkScreen(): void { checkSoon(); }
