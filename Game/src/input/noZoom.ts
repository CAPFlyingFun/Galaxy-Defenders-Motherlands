// ============================================================================
// noZoom.ts -- stops the phone's browser from zooming the page.
//
// On an iPhone, tapping twice quickly (as you do on FIRE or the run buttons)
// makes Safari zoom into the page, and a two-finger pinch zooms the whole page
// instead of the game's camera. A game wants neither, so both are switched off:
//
//   - CSS `touch-action: none` on the page (index.html) tells the browser the
//     game handles every touch itself;
//   - Safari's own pinch events (`gesturestart` ...) are cancelled;
//   - a second tap that lands within 350 ms of the first is cancelled, which is
//     the tap Safari would have turned into a zoom. The tap still reaches the
//     game's buttons: they listen for the finger going DOWN (pointerdown),
//     which has already happened by then.
// ============================================================================

const DOUBLE_TAP_MS = 350; // two taps closer together than this count as a double tap

export function preventPageZoom(): void {
  // Safari-only pinch events: cancelling them keeps the page at its normal size.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }

  // The double tap. `passive: false` is needed, or the browser ignores preventDefault on touch events.
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = performance.now();
    // Leave form controls alone (the settings tick boxes): cancelling their touch would stop them ticking.
    const target = event.target as HTMLElement | null;
    const isControl = !!target && (target.tagName === 'INPUT' || target.tagName === 'LABEL' || !!target.closest('label'));
    if (now - lastTouchEnd < DOUBLE_TAP_MS && !isControl) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Desktop browsers: a double click must not select text or zoom either.
  document.addEventListener('dblclick', (event) => event.preventDefault());
}
