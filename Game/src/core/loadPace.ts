// =====================================================================================================================
// loadPace.ts -- THE PAUSES BETWEEN THE HEAVY STEPS OF THE START.
//
// Joshua, 2026-11-22 (v0.2.151), after the town as well as the island kept being closed by his iPhone while it
// started ("the issue is probably maybe an overlap of reading the files it is bottlenecking the system. I think if we
// could split up the loading process like (Light>Heavy>Light>Heavy, etc…) with maybe a 1s break between loading").
// His screenshots: three of five town starts closed at "Loading John: unpacking his body…", right after Blaze's live
// body had been built; another at the first frame. An iPhone closes a page the moment its memory runs short, and
// that is most likely when one big piece is unpacked while the leftovers of the last one have not been cleared yet.
//
// So the start now does ONE heavy thing at a time, with a pause before each (main.ts and fastHeroine.ts):
//   the world (light) · pause · Blaze's body file · pause · her pictures, one at a time · her hair (light) ·
//   pause · her live body · pause · John's body file · pause · his pictures · his hair (light) ·
//   her breathing (light) · pause · the first picture
// A pause is a second of doing nothing at all (`LOAD_BREAK_MS`), and then two frames: time for the page to clear
// what the last step left behind and for the splash to be drawn. It costs about 6 seconds a start; the splash's time
// left learns them after the first start that gets all the way through (loadMeter.ts remembers each step's moment).
// =====================================================================================================================

/** How long each pause is, milliseconds (Joshua's "maybe a 1s break between loading"). */
export const LOAD_BREAK_MS = 1000;

/** A pause between two heavy steps of the start: LOAD_BREAK_MS of nothing, then two frames. */
export function loadBreak(ms: number = LOAD_BREAK_MS): Promise<void> {
  return new Promise((done) => {
    window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), ms);
  });
}
