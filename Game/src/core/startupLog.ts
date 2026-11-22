// =====================================================================================================================
// startupLog.ts -- HOW FAR THE LAST START GOT.
//
// Joshua, 2026-11-22 (v0.2.142): "I started again and now it keeps crashing on load". When an iPhone runs short of
// memory it closes the page AT ONCE: no error reaches the game and nothing can be said. So the game writes each step
// of its start down on the phone (localStorage, a few hundred letters) AS IT REACHES IT: every loading step the splash
// shows, the world, Blaze, John, the first frames drawn, and then 5 and 30 seconds of play. Each step keeps the seconds
// since the start, the megabytes downloaded so far and the graphics memory asked for so far (an estimate,
// core/gpuTally.ts). If the next start finds the last one never reached "30 s", the phone closed it: its last step is
// shown on the splash (splash.ts `showLastStart`), so a screenshot says where it stopped and how much was in.
// (First made for v0.2.131 on the wip-131 branch, 2026-11-21; brought in here with the downloaded megabytes added.)
//
// THE MAP, AND A COUNT OF STARTS (v0.2.149; Joshua, 2026-11-22: "change the starting location of the game to our
// smaller map, and let's see if it's the island, or not"): each start also writes down WHICH MAP it was on, and a small
// tally keeps, for this version and each map, how many starts there were and how many reached 30 s. The splash shows
// it (splash.ts `showStartCount`), so a few restarts on the town and a few on the island can be compared without
// counting by hand.
// =====================================================================================================================

const KEY = 'gdm.startLog';
/** The last step: reached, the start is counted as one that worked. */
export const START_SURVIVED = '30 s';

interface Step {
  /** the step */
  s: string;
  /** seconds since the start */
  t: number;
  /** graphics memory asked for so far, MB (est.) */
  mb: number;
  /** downloaded so far, MB */
  dl: number;
}
interface Log { version: string; map?: string; steps: Step[] }

let log: Log = { version: '', steps: [] };
let began = 0;
let memory: () => number = () => 0;
let downloaded: () => number = () => 0;
/** What the last start reached, if it was closed before START_SURVIVED (else null). */
let lastClosed: Log | null = null;
/** The steps written down so far are only the last few dozen (localStorage is small, and only the end matters). */
const STEPS_KEPT = 40;

// ---- THE COUNT OF STARTS (v0.2.149) ---------------------------------------------------------------------------------
const TALLY_KEY = 'gdm.startTally';
/** For each map, this version's starts: `began` (every start), `lasted` (those that reached START_SURVIVED). */
interface Tally { version: string; maps: Record<string, { began: number; lasted: number }> }
let tally: Tally = { version: '', maps: {} };
/** This start has been counted as one that lasted (only once). */
let countedLasted = false;

function saveTally(): void {
  try { localStorage.setItem(TALLY_KEY, JSON.stringify(tally)); } catch { /* not remembered: nothing to do */ }
}

/** This start, counted on its map (a new version starts the count again: an old version's starts say nothing now). */
function countThisStart(version: string, map: string): void {
  try {
    const before = JSON.parse(localStorage.getItem(TALLY_KEY) ?? 'null') as Tally | null;
    tally = before && before.version === version && before.maps && typeof before.maps === 'object' ? before : { version, maps: {} };
  } catch { tally = { version, maps: {} }; }
  const here = tally.maps[map] ?? { began: 0, lasted: 0 };
  here.began += 1;
  tally.maps[map] = here;
  saveTally();
}

/**
 * The count, as a short text for the splash: "Starts on v0.2.149 that reached 30 s: town 4 of 5 · island 1 of 3".
 * (This start is counted in `began` but cannot have lasted yet, so it is left out: what is shown is the starts before.)
 */
export function startCountText(): string {
  const parts: string[] = [];
  for (const [map, count] of Object.entries(tally.maps)) {
    const before = map === log.map ? count.began - 1 : count.began;
    if (before > 0) parts.push(`${map} ${count.lasted} of ${before}`);
  }
  return parts.length ? `Starts on ${tally.version} that reached 30 s: ${parts.join(' · ')}` : '';
}

/**
 * At the very start: read how the last start went, and begin this one's log. `mb` reads the graphics memory asked for
 * (est., MB); `dl` the megabytes downloaded so far; `map` which map this start is on ('town' or 'island').
 */
export function beginStartLog(version: string, mb: () => number, dl: () => number, map = ''): void {
  began = performance.now();
  memory = mb;
  downloaded = dl;
  try {
    const before = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Log | null;
    if (before && Array.isArray(before.steps) && before.steps.length && !before.steps.some((step) => step.s === START_SURVIVED)) lastClosed = before;
  } catch { /* nothing readable: nothing to say */ }
  log = { version, map, steps: [] };
  countThisStart(version, map || 'game');
  markStart('page');
}

/** A step reached: written down at once (so it is there even if the phone closes the game the next moment). */
export function markStart(step: string): void {
  if (!began) return;
  const last = log.steps[log.steps.length - 1];
  if (last && last.s === step) return;   // (the same step said twice: once is enough)
  log.steps.push({
    s: step.slice(0, 90),
    t: Math.round((performance.now() - began) / 100) / 10,
    mb: Math.round(memory()),
    dl: Math.round(downloaded() * 10) / 10,
  });
  // (only the latest are kept, but never the 30 s mark: the phone's TURNS are written down too (v0.2.148), and many
  //  turns in a long game would otherwise push it out, and the next start would say this one was closed)
  while (log.steps.length > STEPS_KEPT) {
    const old = log.steps.findIndex((step, i) => i > 0 && step.s !== START_SURVIVED);
    if (old < 0) break;
    log.steps.splice(old, 1);
  }
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { /* not remembered: nothing to do */ }
  // (reaching 30 s: this start lasted, on its map)
  if (step === START_SURVIVED && !countedLasted) {
    countedLasted = true;
    const here = tally.maps[log.map || 'game'];
    if (here) { here.lasted += 1; saveTally(); }
  }
}

/** The last start, if the phone closed it before it had run 30 s: where it stopped, as a short text (else null). */
export function lastStartClosed(): string | null {
  if (!lastClosed) return null;
  const last = lastClosed.steps[lastClosed.steps.length - 1];
  const where = lastClosed.map ? `, ${lastClosed.map}` : '';
  return `The last start (${lastClosed.version}${where}) was closed after: ${last.s} · ${last.t} s in · ${last.dl} MB downloaded · ~${last.mb} MB graphics (est.)`;
}

/** The last closed start's final steps, for the full readout: "step t s mb", the last few (short lines). */
export function lastStartSteps(): string[] {
  if (!lastClosed) return [];
  return lastClosed.steps.slice(-4).map((step) => `${step.s.slice(0, 18)} ${step.t}s ${step.dl}MB ~${step.mb}g`);
}
