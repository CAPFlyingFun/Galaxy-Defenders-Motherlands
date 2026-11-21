// =====================================================================================================================
// startupLog.ts -- HOW FAR THE LAST START GOT (Joshua and ChatGPT's review, 2026-11-21: the iPhone closes the game a
// split second after both characters are drawn, before any message can be shown).
// ---------------------------------------------------------------------------------------------------------------------
// When an iPhone runs out of memory it closes the page at once: no error reaches the game, nothing can be said. So the
// game writes each step of its start down on the phone (localStorage, a few hundred letters) AS IT REACHES IT: the
// world, Blaze, her hidden live body, John, the first frames, and then 5 and 30 seconds of play. Each step keeps the
// seconds since the start and the graphics memory asked for so far (est., core/gpuTally.ts). If the next start finds
// the last one never reached "30 s", that one was closed: its last step is shown (a notice, and the full readout), so
// a screenshot says where it died and how much had been asked for.
// =====================================================================================================================

const KEY = 'gdm.startLog';
/** The last step: reached, the start is counted as one that worked. */
export const START_SURVIVED = '30 s';

interface Step { s: string; t: number; mb: number }
interface Log { version: string; steps: Step[] }

let log: Log = { version: '', steps: [] };
let began = 0;
let memory: () => number = () => 0;
/** What the last start reached, if it was closed before START_SURVIVED (else null). */
let lastClosed: Log | null = null;

/** At the very start: read how the last start went, and begin this one's log. `mb` reads the graphics memory (est.). */
export function beginStartLog(version: string, mb: () => number): void {
  began = performance.now();
  memory = mb;
  try {
    const before = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Log | null;
    if (before && before.steps.length && !before.steps.some((step) => step.s === START_SURVIVED)) lastClosed = before;
  } catch { /* nothing readable: nothing to say */ }
  log = { version, steps: [] };
  markStart('page');
}

/** A step reached: written down at once (so it is there even if the phone closes the game the next moment). */
export function markStart(step: string): void {
  log.steps.push({ s: step, t: Math.round((performance.now() - began) / 100) / 10, mb: Math.round(memory()) });
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { /* not remembered: nothing to do */ }
}

/** The last start, if it was closed before it had run 30 s: its last step as a short line (else null). */
export function lastStartClosed(): string | null {
  if (!lastClosed) return null;
  const last = lastClosed.steps[lastClosed.steps.length - 1];
  return `Last start (${lastClosed.version}) stopped after: ${last.s} · ${last.t}s · ~${last.mb} MB est.`;
}

/** The last closed start's steps, for the full readout: "step t s mb", the last few (short lines). */
export function lastStartSteps(): string[] {
  if (!lastClosed) return [];
  return lastClosed.steps.slice(-4).map((step) => `${step.s} ${step.t}s ~${step.mb}MB`);
}
