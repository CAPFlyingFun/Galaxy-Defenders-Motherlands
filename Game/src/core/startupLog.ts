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
interface Log { version: string; steps: Step[] }

let log: Log = { version: '', steps: [] };
let began = 0;
let memory: () => number = () => 0;
let downloaded: () => number = () => 0;
/** What the last start reached, if it was closed before START_SURVIVED (else null). */
let lastClosed: Log | null = null;
/** The steps written down so far are only the last few dozen (localStorage is small, and only the end matters). */
const STEPS_KEPT = 40;

/**
 * At the very start: read how the last start went, and begin this one's log. `mb` reads the graphics memory asked for
 * (est., MB); `dl` the megabytes downloaded so far.
 */
export function beginStartLog(version: string, mb: () => number, dl: () => number): void {
  began = performance.now();
  memory = mb;
  downloaded = dl;
  try {
    const before = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Log | null;
    if (before && Array.isArray(before.steps) && before.steps.length && !before.steps.some((step) => step.s === START_SURVIVED)) lastClosed = before;
  } catch { /* nothing readable: nothing to say */ }
  log = { version, steps: [] };
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
}

/** The last start, if the phone closed it before it had run 30 s: where it stopped, as a short text (else null). */
export function lastStartClosed(): string | null {
  if (!lastClosed) return null;
  const last = lastClosed.steps[lastClosed.steps.length - 1];
  return `The last start (${lastClosed.version}) was closed after: ${last.s} · ${last.t} s in · ${last.dl} MB downloaded · ~${last.mb} MB graphics (est.)`;
}

/** The last closed start's final steps, for the full readout: "step t s mb", the last few (short lines). */
export function lastStartSteps(): string[] {
  if (!lastClosed) return [];
  return lastClosed.steps.slice(-4).map((step) => `${step.s.slice(0, 18)} ${step.t}s ${step.dl}MB ~${step.mb}g`);
}
