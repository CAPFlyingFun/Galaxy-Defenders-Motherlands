// ============================================================================
// versionTag.ts -- the game's version, shown at the bottom of Settings.
//
// Joshua, 2026-11-17: "add a version number in settings so later on I can keep
// track on updates making sure I got the latest version".
//
// The line reads, for example:   v0.2.0 · ba6a109 · built Nov 17, 1:30 AM
//   v0.2.0     the version number (Game/package.json), raised with each update
//   ba6a109    the exact saved state of the code this build was made from
//   built ...  when it was built (US Central time)
// All three are written into the code by the build (Game/vite.config.ts).
//
// This file stands by itself: it waits for the Settings panel to appear on
// the page and adds its line there, so nothing else needs to know about it.
// ============================================================================

// Filled in by the build (vite.config.ts, `define`).
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

/** The version as text, also handy in the browser's console: type `gdmVersion`. */
export const VERSION_TEXT = `v${__APP_VERSION__} · ${__APP_COMMIT__} · built ${__APP_BUILT__}`;
(window as unknown as { gdmVersion: string }).gdmVersion = VERSION_TEXT;

/** Add the version line to the Settings panel, once. */
function addTo(panel: Element): void {
  if (panel.querySelector('.gd-version')) return;
  const line = document.createElement('div');
  line.className = 'gd-version';
  line.textContent = VERSION_TEXT;
  line.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid rgba(143,163,200,.25);font-size:11px;letter-spacing:.04em;color:#8fa3c8;';
  panel.appendChild(line);
}

// The Settings panel (class "gd-settings", made in src/ui/hud.ts) appears a moment after the page starts, so
// watch the page until it does. Keep watching: the panel is made again if the heads-up display is rebuilt.
const find = () => {
  const panel = document.querySelector('.gd-settings');
  if (panel) addTo(panel);
};
new MutationObserver(find).observe(document.documentElement, { childList: true, subtree: true });
find();
