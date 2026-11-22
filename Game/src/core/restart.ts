// ============================================================================
// restart.ts -- ONE WAY TO START THE GAME AGAIN, from anywhere.
//
// Joshua, 2026-11-17, then again 2026-11-19: iOS showed "A problem repeatedly
// occurred". A reload that comes while the old game is still held on the
// graphics chip (her body, her hidden live body, the whole scene) has the new
// game loading on top of the old: two at once, more than the phone allows.
// main.ts lets everything go first and then reloads; it hands that job to
// `setRestart` here. Anything else that wants a fresh start (the splash's
// "tap to try again", the control editor's Reset) calls `restartGame`, so
// every reload lets go first. Until main.ts has handed over its job, a plain
// reload is all there is (nothing heavy is held yet).
// ============================================================================

import { markRestart } from './startupLog';

let letGoAndReload: (() => void) | null = null;

/** main.ts: the job that lets go of the game's graphics and then reloads the page (replaces any earlier one). */
export function setRestart(job: () => void): void {
  letGoAndReload = job;
}

/** Start the game again, letting go of everything it holds first. */
export function restartGame(): void {
  // (a start ended on purpose: the next one is not told the phone closed it, core/startupLog.ts)
  markRestart();
  if (letGoAndReload) letGoAndReload();
  else location.reload();
}
