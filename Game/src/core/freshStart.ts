// ============================================================================
// freshStart.ts -- CLEAR THE GAME'S SAVED FILES FROM THE PHONE, AND START AGAIN.
//
// Joshua, 2026-11-22: "can we add a manual clear local saved data from phone,
// so when I start again, it loads it all from scratch?" The game keeps its
// files on the phone (the offline copy: its service worker and its stores,
// vite.config.ts `pwa()`), so a start after the first takes most of them from
// the phone in a moment rather than downloading them. This lets ALL of that go:
//   - this game's stores (gdm-app-..., gdm-files: its code, outfits, the
//     builder's files, the island),
//   - this game's service worker (the next start downloads everything from the
//     network and sets up a new offline copy once the game is up),
//   - the start log (core/startupLog.ts), so the next start is not told about
//     this one, which is ended on purpose.
// Kept: every setting (Settings), the load timings (the splash's time left) and
// the controls' layout. Only THIS game's things are touched: the other games on
// the same site (capflyingfun.github.io) have their own stores and workers.
//
// Two ways in: Settings -> TEST TOOLS -> Clear saved files, and a button on the
// loading screen when the last start was closed by the phone (so it can be used
// when the game cannot get far enough to open Settings).
// ============================================================================
import { restartGame } from './restart';

/** Let go of this game's saved files and its offline copy (see above). Resolves once done; never throws. */
export async function clearSavedFiles(): Promise<{ stores: number; workers: number }> {
  let stores = 0, workers = 0;
  try {
    for (const name of await caches.keys()) {
      if (name.startsWith('gdm-') && (await caches.delete(name))) stores++;
    }
  } catch { /* no stores here (private browsing, or none made yet) */ }
  try {
    // (only this game's worker: its scope is this game's own folder)
    const scope = new URL(import.meta.env.BASE_URL, location.href).href;
    for (const registration of (await navigator.serviceWorker?.getRegistrations()) ?? []) {
      if (registration.scope === scope && (await registration.unregister())) workers++;
    }
  } catch { /* no service workers here */ }
  try { localStorage.removeItem('gdm.startLog'); } catch { /* nothing kept */ }
  return { stores, workers };
}

/** Clear the saved files, then start the game again (letting go of its graphics first: core/restart.ts). */
export async function clearAndStartFresh(): Promise<void> {
  const cleared = await clearSavedFiles();
  console.info(`[fresh start] ${cleared.stores} stores and ${cleared.workers} service worker cleared; starting again`);
  restartGame();
}
