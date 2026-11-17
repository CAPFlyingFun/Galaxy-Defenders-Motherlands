// ============================================================================
// pauseMenu.ts -- PAUSING the game, and the small menu that goes with it.
//
// Joshua, 2026-11-17: "if it starts in portrait or you rotate from landscape
// to portrait, it will pause and basically open up and pause menu if in the
// game already ... in game will pause for you."
//
// WHAT HAPPENS
//   1. The phone is turned upright while playing. The "rotate your device"
//      cover appears (that part is plain CSS in index.html) and, here, the
//      game PAUSES and this menu is opened underneath the cover.
//   2. The phone is turned back on its side. The cover goes, and the menu is
//      there: PAUSED, with Resume and Settings.
//   3. The game stays paused until Resume is pressed. (It does not start
//      again by itself: a thumb may not be back on the stick yet.)
//   "Settings" opens the game's ordinary Settings panel (hud.ts) over the menu.
//
// WHAT "PAUSED" MEANS. The game's loop (main.ts) asks `paused` at the top of
// every frame and, while it is true, does nothing at all: no time passes, so
// she does not move, her vitals and stamina stand still, nothing fires. When
// the game resumes, the loop carries on from that same instant (it does not
// try to catch up on the time it was paused), so nothing jumps.
//
// HELD CONTROLS ARE LET GO. If a thumb was on the stick or on FIRE when the
// game paused, it is let go of here, so she is not still running or shooting
// by herself when the game resumes: see letGo() below.
//
// This file makes the menu and keeps the "paused" yes-or-no. The loop does
// the actual stopping, by asking it.
// ============================================================================
import './pauseMenu.css';
import { isUpright, onStageResize, onUprightChange } from '../core/orientation';

export interface Pause {
  /** True while the game is paused. The game loop asks this at the top of every frame. */
  readonly paused: boolean;
  /** Pause the game and open the menu. (Already paused: nothing happens.) */
  pause(): void;
  /**
   * Close the menu and carry on playing. Refused (false) while the phone is held upright: the game cannot be
   * seen then, so it stays paused.
   */
  resume(): boolean;
  /**
   * While paused: should the still picture be drawn again now? `now` is the frame's time, milliseconds.
   * The picture has to be drawn again after the screen changes size (resizing wipes it), and it is refreshed a few
   * times a second besides, so a change made in Settings shows. Upright too: the game is the strip under the menu.
   */
  wantsPicture(now: number): boolean;
}

export interface PauseOptions {
  /** The box the whole game is drawn in (#stage). It is labelled `is-paused` while the game is paused. */
  readonly stage: HTMLElement;
  /** The layer the menu is put in: the controls layer (#ui). */
  readonly host: HTMLElement;
  /** Called as the game pauses, after the fingers and keys have been let go: the game zeroes its own controls here. */
  readonly onPause: () => void;
}

/** While paused, the still picture is drawn again this often (milliseconds): four times a second. */
const STILL_PICTURE_MS = 250;

/**
 * Make a button for the menu. `onPress` is called when a finger (or the mouse) that went down on the button comes
 * up again still on it.
 *
 * WHY NOT THE USUAL "click". A phone only sends a "click" for a tap made with ONE finger on the glass. With the
 * phone held in both hands, the other thumb is often resting on the screen already, and then a tap on Resume would
 * send no click at all: the button would seem dead. So the finger's own down and up are listened for (each finger
 * reports those by itself, whatever the others are doing), the same way the game's FIRE button works.
 */
function button(className: string, text: string, parent: HTMLElement, onPress: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.className = className;
  node.textContent = text;
  /** The finger that is down on this button now (null: none). */
  let finger: number | null = null;
  node.addEventListener('pointerdown', (event) => { finger = event.pointerId; });
  node.addEventListener('pointercancel', () => { finger = null; });
  node.addEventListener('pointerup', (event) => {
    if (finger !== event.pointerId) return;
    finger = null;
    // (a finger that slid off the button before lifting has changed its mind)
    const box = node.getBoundingClientRect();
    if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) onPress();
  });
  // A keyboard's Enter or Space still arrives as a "click" (one that no finger made: its `detail` is 0).
  node.addEventListener('click', (event) => { if (event.detail === 0) onPress(); });
  parent.appendChild(node);
  return node;
}

/**
 * Make the pause menu (hidden) and start watching for the phone being turned upright.
 * Call this at the moment the game starts: if the phone is upright already, the game starts paused.
 */
export function createPause(options: PauseOptions): Pause {
  const { stage, host } = options;
  let paused = false;

  // ---- The menu ----------------------------------------------------------------------------------------------
  const sheet = document.createElement('div');
  sheet.className = 'gd-pause';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Game paused');
  const card = document.createElement('div');
  card.className = 'gd-pause-card';
  const title = document.createElement('h2');
  title.textContent = 'PAUSED';
  card.appendChild(title);
  sheet.appendChild(card);
  host.appendChild(sheet);
  // A tap on the menu must end ON the menu. Left alone, the phone would follow the tap with a "click" a moment
  // later, and by then Resume has taken the menu away: the click would land on whatever control lies underneath.
  sheet.addEventListener('touchend', (event) => { if (event.cancelable) event.preventDefault(); }, { passive: false });

  // ---- "Settings": the game's own Settings panel (hud.ts makes it; it is found on the page by its class name) ----
  let watchedPanel: HTMLElement | null = null;
  const settingsPanel = (): HTMLElement | null => {
    const panel = document.querySelector<HTMLElement>('.gd-settings');
    // The panel can be opened and closed from elsewhere too (the control editor closes it), so it is watched: the
    // menu moves aside while it is open and the button says what pressing it will do.
    if (panel && panel !== watchedPanel) {
      watchedPanel = panel;
      new MutationObserver(showSettingsState).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }
    return panel;
  };
  const showSettingsState = (): void => {
    const open = !!watchedPanel && !watchedPanel.hidden;
    sheet.classList.toggle('has-settings', open);
    settingsButton.textContent = open ? 'Close settings' : 'Settings';
  };

  button('gd-pause-resume', 'Resume', card, () => { resume(); });
  const settingsButton = button('gd-pause-settings', 'Settings', card, () => {
    const panel = settingsPanel();
    if (panel) panel.hidden = !panel.hidden;
    showSettingsState();
  });

  // ---- Letting go of whatever the player was holding ---------------------------------------------------------------
  // Every finger (or mouse button) that is down, and what it went down on. The browser keeps sending a finger's
  // moves to the control it first touched until it lifts; to let go on the player's behalf, the game has to know
  // which fingers those are.
  const held = new Map<number, Element>();
  window.addEventListener('pointerdown', (event) => { if (event.target instanceof Element) held.set(event.pointerId, event.target); }, true);
  const lifted = (event: PointerEvent): void => { held.delete(event.pointerId); };
  window.addEventListener('pointerup', lifted, true);
  window.addEventListener('pointercancel', lifted, true);

  const letGo = (): void => {
    for (const [finger, target] of [...held]) {
      // 1. The control stops owning the finger (the stick and FIRE "capture" it so a thumb can slide off them)...
      for (let node: Element | null = target; node; node = node.parentElement) {
        try { if (node.hasPointerCapture(finger)) node.releasePointerCapture(finger); } catch { /* that finger has already gone */ }
      }
      // 2. ...and is told the touch is over, exactly as the phone itself would tell it ("pointercancel"): the stick
      //    springs back to its middle, FIRE lets go, and the picture forgets the drag.
      target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: finger, bubbles: true }));
    }
    held.clear();
    // 3. Keys held on a keyboard: the controls drop every key when the window loses the player's attention
    //    (input/controls.ts listens for "blur"), so that is what they are told has happened.
    window.dispatchEvent(new Event('blur'));
    // 4. The game's own part.
    options.onPause();
  };

  // ---- Pausing and resuming -----------------------------------------------------------------------------------------
  /** Draw the still picture again at the next chance (true to begin with: the first paused frame draws it). */
  let pictureWanted = true;
  let pictureAt = 0;
  // (resizing the 3D picture wipes it, so after every change of screen size it must be drawn again)
  onStageResize(() => { pictureWanted = true; });

  const pause = (): void => {
    if (paused) return;
    paused = true;
    letGo();
    settingsPanel();
    showSettingsState();
    sheet.hidden = false;
    stage.classList.add('is-paused');
    pictureWanted = true;
  };

  const resume = (): boolean => {
    if (!paused) return true;
    if (isUpright()) return false;
    // (Settings closes with the menu, so the game comes back with a clear screen)
    const panel = settingsPanel();
    if (panel) panel.hidden = true;
    sheet.hidden = true;
    stage.classList.remove('is-paused');
    paused = false;
    return true;
  };

  // ---- UPRIGHT: the pause menu on the cover, the game in a strip below it (Joshua, 2026-11-17) -------------------------
  // index.html holds the buttons; they are wired here. The game has started: the page is labelled for it, and the
  // cover shows "PAUSED" with Resume and Settings in place of "rotate your device".
  document.documentElement.classList.add('gd-playing');
  const coverSettings = document.querySelector<HTMLElement>('.rotate-settings');
  const coverSlot = document.querySelector<HTMLElement>('.rotate-settings-slot');
  /** Where the Settings panel lives normally (in the controls), so it can be put back after its visit to the cover. */
  let panelHome: { parent: Node; before: Node | null } | null = null;
  const settingsHome = (): void => {
    const panel = settingsPanel();
    if (!panel || !panelHome) return;
    panel.hidden = true;
    panelHome.parent.insertBefore(panel, panelHome.before);
    panelHome = null;
    if (coverSettings) coverSettings.textContent = 'Settings';
    showSettingsState();
  };
  const resumeButton = document.querySelector<HTMLElement>('.rotate-resume');
  if (resumeButton) {
    // (it cannot play upright: Resume says so, gently, and does nothing else)
    resumeButton.addEventListener('click', () => { resumeButton.animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 220); });
  }
  if (coverSettings && coverSlot) {
    coverSettings.addEventListener('click', () => {
      const panel = settingsPanel();
      if (!panel) return;
      if (panelHome) { settingsHome(); return; }
      // The game's own Settings panel is moved into the cover while it is open there (the game in the strip is far
      // too small to use it). Moving it keeps everything it does; it goes home when closed or when the phone turns.
      panelHome = { parent: panel.parentNode as Node, before: panel.nextSibling };
      coverSlot.appendChild(panel);
      panel.hidden = false;
      coverSettings.textContent = 'Close settings';
    });
  }

  // Turned upright: pause. Turned back: the menu is already open and waits for Resume (Settings goes home first).
  onUprightChange((upright) => { if (upright) pause(); else settingsHome(); });
  if (isUpright()) pause();

  return {
    get paused(): boolean { return paused; },
    pause,
    resume,
    wantsPicture(now: number): boolean {
      // (upright too: the game is shown in the strip under the pause menu)
      if (!pictureWanted && now - pictureAt < STILL_PICTURE_MS) return false;
      pictureWanted = false;
      pictureAt = now;
      return true;
    },
  };
}
