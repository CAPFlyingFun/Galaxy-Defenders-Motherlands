// ============================================================================
// layoutEditor.ts -- move and resize the on-screen controls, and keep the
// arrangement on this device.
//
// Joshua, 2026-11-17: "a simple UI button editor where you can resize, drag,
// move, and save it locally".
//
// HOW TO USE IT
//   Settings (the gear)  ->  "Edit controls".
//   Drag a control to move it. Tap it to pick it, then use the SIZE slider.
//   "Switch view" shows the other view's controls (first / third person).
//   "Reset" puts everything back where the game puts it. "Done" closes.
//   Every change is saved at once (in this browser, on this device).
//
// HOW IT WORKS
// Normally the controls are laid out by the styles in hud.css (a corner each,
// stacked or side by side). A control that has been moved in the editor is
// taken out of that arrangement and pinned to its own place on the STAGE (the
// box the whole game is drawn in: src/core/orientation.ts):
//
//     x, y   where its CENTRE is, as a fraction of the stage (0.5, 0.5 = the
//            middle), so it keeps its place on any size of screen
//     size   how big it is drawn, 1 = the game's own size
//
// Controls that were never moved are left exactly as the game lays them out.
//
// This file stands by itself, like versionTag.ts: it finds the controls on
// the page by their class names and adds its own button to Settings, so the
// heads-up display's own code (hud.ts) does not need to know about it.
// ============================================================================
import { isRotated, toGameX, toGameY } from '../core/orientation';

/** Where the arrangement is kept on this device. */
const STORAGE_KEY = 'gdm.hudLayout';
/** The smallest and largest a control may be drawn (1 = the game's own size). */
const MIN_SIZE = 0.5;
const MAX_SIZE = 2;
/** A press that moves less than this many pixels is a tap (pick the control), not a drag. */
const TAP_SLOP = 6;

/** The controls that can be moved: a name for the save, how to find it on the page, and what to call it. */
const CONTROLS = [
  { id: 'move', selector: '.gd-walk-stick', label: 'MOVE stick' },
  { id: 'camera', selector: '.gd-look-stick', label: 'CAMERA stick' },
  { id: 'fire', selector: '.gd-fire', label: 'FIRE' },
  { id: 'view', selector: '.gd-view', label: 'View switch' },
  // (the weapon table's buttons, Joshua 2026-11-17: shown in play only near the table; always shown while editing)
  { id: 'use', selector: '.gd-use', label: 'Table buttons' },
  { id: 'grab', selector: '.gd-grab', label: 'Grab button' },
  // (The "Run left / right" arrow buttons of the old ring track were listed here; they are gone from the game.
  //  A place saved for them on a device is simply never read again.)
] as const;
type ControlId = (typeof CONTROLS)[number]['id'];

/** One control's saved place: its centre as a fraction of the stage, and its size. */
interface Placement { x: number; y: number; size: number }
type Layout = Partial<Record<ControlId, Placement>>;

// ---- Saving and loading -----------------------------------------------------------------------------------------------

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Partial<Placement>>;
    const layout: Layout = {};
    for (const { id } of CONTROLS) {
      const p = raw[id];
      // Only keep an entry that is three sensible numbers: anything else is ignored, never trusted.
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.size)) {
        layout[id] = { x: clamp(p.x as number, 0, 1), y: clamp(p.y as number, 0, 1), size: clamp(p.size as number, MIN_SIZE, MAX_SIZE) };
      }
    }
    return layout;
  } catch {
    return {}; // nothing saved, or private browsing: the game's own arrangement
  }
}

function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // The arrangement still holds until the page is closed; it just cannot be remembered.
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

// ---- Putting a control in its saved place -----------------------------------------------------------------------------

const layout: Layout = loadLayout();

/** The heads-up display's root (everything in it is positioned against the stage). */
function hudRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.gd-hud');
}

/**
 * Pin `element` at its saved place. It is moved to sit directly inside the heads-up display's root, so that
 * "left 30%, top 80%" means 30% across and 80% down the STAGE, whatever corner box it used to live in.
 * (hud.ts keeps its own reference to the element, so its buttons and sticks go on working, and showing or
 * hiding it for the current view still works: that is done with the `hidden` attribute, which moves with it.)
 */
function pin(element: HTMLElement, place: Placement): void {
  const root = hudRoot();
  if (!root) return;
  if (element.parentElement !== root) root.appendChild(element);
  element.dataset.gdmPinned = '1';
  element.style.position = 'absolute';
  element.style.left = `${(place.x * 100).toFixed(3)}%`;
  element.style.top = `${(place.y * 100).toFixed(3)}%`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.margin = '0';
  // "translate(-50%, -50%)" puts its CENTRE on the point; "scale" then sizes it about that centre.
  element.style.transform = `translate(-50%, -50%) scale(${place.size})`;
}

/** Pin every control that has a saved place and is on the page. */
function applyLayout(): void {
  for (const control of CONTROLS) {
    const place = layout[control.id];
    const element = document.querySelector<HTMLElement>(control.selector);
    if (place && element) pin(element, place);
  }
}

// ---- Screen points and stage points -----------------------------------------------------------------------------------

/** The stage's own width and height in its own pixels (it may be drawn turned a quarter turn on the screen). */
function stageSize(): { width: number; height: number } {
  const stage = document.getElementById('stage');
  return { width: stage?.offsetWidth || window.innerWidth, height: stage?.offsetHeight || window.innerHeight };
}

/**
 * A point on the SCREEN as a fraction across and down the STAGE.
 * Not turned: the stage fills the screen, so it is simply x / width and y / height.
 * Turned (a phone held upright): the stage's "across" runs DOWN the screen and its "down" runs to the screen's
 * LEFT, starting from the screen's right edge (see keepLandscape in orientation.ts).
 */
function toStageFraction(screenX: number, screenY: number): { x: number; y: number } {
  const { width, height } = stageSize();
  if (isRotated()) return { x: screenY / width, y: (window.innerWidth - screenX) / height };
  return { x: screenX / width, y: screenY / height };
}

// ---- The editor -------------------------------------------------------------------------------------------------------

let editor: HTMLElement | null = null;

function openEditor(): void {
  const root = hudRoot();
  if (!root || editor) return;
  const settings = document.querySelector<HTMLElement>('.gd-settings');
  if (settings) settings.hidden = true;

  // A sheet over the whole stage. It takes every touch, so nothing underneath (the game, the real buttons)
  // reacts while the controls are being arranged.
  const sheet = document.createElement('div');
  sheet.className = 'gd-layout-editor';
  sheet.style.cssText = 'position:absolute;inset:0;z-index:50;background:rgba(4,6,13,.45);touch-action:none;pointer-events:auto;';
  root.appendChild(sheet);
  editor = sheet;
  // (while editing, the controls that only show now and then, like the table's buttons, are shown to be placed)
  root.classList.add('is-editing');

  // ---- The bar along the top: which control is picked, its size, and the buttons --------------------------------
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:50%;top:calc(var(--safe-top) + 8px);transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 24px);padding:8px 10px;border:1px solid rgba(94,232,200,.55);border-radius:12px;background:rgba(4,6,13,.92);font-size:12px;color:#eaf2ff;';
  sheet.appendChild(bar);
  const picked = document.createElement('span');
  picked.style.cssText = 'min-width:118px;font-weight:700;color:#ffd56b;';
  bar.appendChild(picked);
  const sizeLabel = document.createElement('span');
  bar.appendChild(sizeLabel);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(MIN_SIZE * 100);
  slider.max = String(MAX_SIZE * 100);
  slider.step = '5';
  slider.style.cssText = 'width:130px;touch-action:pan-x;';
  bar.appendChild(slider);
  const barButton = (text: string, onTap: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = 'padding:7px 11px;border:1px solid rgba(94,232,200,.55);border-radius:9px;background:#101a2e;color:#eaf2ff;font:inherit;font-weight:700;';
    button.addEventListener('click', onTap);
    bar.appendChild(button);
    return button;
  };

  // ---- One handle for each control showing in this view -----------------------------------------------------------
  // A handle is a dashed outline drawn over the control, the same shape and size. Dragging the handle moves the
  // control; tapping it picks it for the size slider.
  const handles = new Map<ControlId, HTMLElement>();
  let pickedId: ControlId | null = null;

  /** The control's place right now, read off the page (used the first time a control is touched). */
  const placeNow = (element: HTMLElement): Placement => {
    const box = element.getBoundingClientRect();
    const centre = toStageFraction(box.left + box.width / 2, box.top + box.height / 2);
    return { x: clamp(centre.x, 0, 1), y: clamp(centre.y, 0, 1), size: 1 };
  };

  const pick = (id: ControlId | null) => {
    pickedId = id;
    const control = CONTROLS.find((c) => c.id === id);
    picked.textContent = control ? control.label : 'Tap or drag a control';
    const size = id ? layout[id]?.size ?? 1 : 1;
    slider.value = String(Math.round(size * 100));
    slider.disabled = !id;
    sizeLabel.textContent = id ? `Size ${Math.round(size * 100)}%` : 'Size';
    for (const [handleId, handle] of handles) handle.style.borderColor = handleId === id ? '#ffd56b' : 'rgba(234,242,255,.8)';
  };

  /** Lay every handle over its control (after anything moved, was resized, or the view changed). */
  const placeHandles = () => {
    for (const control of CONTROLS) {
      const element = document.querySelector<HTMLElement>(control.selector);
      let handle = handles.get(control.id);
      const showing = !!element && (!element.hidden || control.id === 'use' || control.id === 'grab') && element.offsetWidth > 0;
      if (!showing) {
        if (handle) handle.style.display = 'none';
        continue;
      }
      if (!handle) {
        handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;box-sizing:border-box;border:2px dashed rgba(234,242,255,.8);border-radius:18px;background:rgba(94,232,200,.12);touch-action:none;';
        const name = document.createElement('span');
        name.textContent = control.label;
        name.style.cssText = 'position:absolute;left:50%;top:-18px;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;letter-spacing:.08em;color:#eaf2ff;text-shadow:0 0 4px #04060d;pointer-events:none;';
        handle.appendChild(name);
        sheet.insertBefore(handle, bar);
        handles.set(control.id, handle);
        wireHandle(handle, control.id, element as HTMLElement);
      }
      // The handle is given the control's centre and drawn size, both in the stage's own measure.
      const place = layout[control.id] ?? placeNow(element as HTMLElement);
      const size = layout[control.id]?.size ?? 1;
      const { width, height } = stageSize();
      const w = (element as HTMLElement).offsetWidth * size;
      const h = (element as HTMLElement).offsetHeight * size;
      handle.style.display = '';
      handle.style.width = `${w}px`;
      handle.style.height = `${h}px`;
      handle.style.left = `${place.x * width - w / 2}px`;
      handle.style.top = `${place.y * height - h / 2}px`;
    }
  };

  /** Dragging a handle moves its control; a press that hardly moves picks it. */
  const wireHandle = (handle: HTMLElement, id: ControlId, element: HTMLElement) => {
    let lastX = 0, lastY = 0, travel = 0, dragging = false;
    handle.addEventListener('pointerdown', (event) => {
      handle.setPointerCapture(event.pointerId);
      lastX = event.clientX;
      lastY = event.clientY;
      travel = 0;
      dragging = true;
      pick(id);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      // How far the finger moved on the screen, turned into the stage's own right and down.
      const screenDx = event.clientX - lastX, screenDy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      travel += Math.abs(screenDx) + Math.abs(screenDy);
      if (travel < TAP_SLOP) return;
      const { width, height } = stageSize();
      const place = layout[id] ?? placeNow(element);
      place.x = clamp(place.x + toGameX(screenDx, screenDy) / width, 0.02, 0.98);
      place.y = clamp(place.y + toGameY(screenDx, screenDy) / height, 0.04, 0.96);
      layout[id] = place;
      pin(element, place);
      placeHandles();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (travel >= TAP_SLOP) saveLayout(layout);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  slider.addEventListener('input', () => {
    if (!pickedId) return;
    const element = document.querySelector<HTMLElement>(CONTROLS.find((c) => c.id === pickedId)!.selector);
    if (!element) return;
    const place = layout[pickedId] ?? placeNow(element);
    place.size = clamp(Number(slider.value) / 100, MIN_SIZE, MAX_SIZE);
    layout[pickedId] = place;
    pin(element, place);
    saveLayout(layout);
    sizeLabel.textContent = `Size ${Math.round(place.size * 100)}%`;
    placeHandles();
  });

  barButton('Switch view', () => {
    // The game's own view button does the switching; then show the handles of whatever is on screen now.
    document.querySelector<HTMLElement>('.gd-view')?.click();
    pick(null);
    requestAnimationFrame(placeHandles);
  });
  barButton('Reset', () => {
    // Back to the game's own arrangement. The controls were moved out of their corner boxes, so the simplest
    // sure way to put every one back is to forget the saved places and start the page again.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing was saved */ }
    location.reload();
  });
  barButton('Done', closeEditor);

  const onResize = () => placeHandles();
  window.addEventListener('resize', onResize);
  sheet.addEventListener('gdm-close', () => window.removeEventListener('resize', onResize), { once: true });

  pick(null);
  placeHandles();
}

function closeEditor(): void {
  if (!editor) return;
  editor.dispatchEvent(new Event('gdm-close'));
  editor.remove();
  editor = null;
  hudRoot()?.classList.remove('is-editing');
}

// ---- Starting up ------------------------------------------------------------------------------------------------------

/** Add the "Edit controls" button to the Settings panel, once. */
function addButton(panel: Element): void {
  if (panel.querySelector('.gd-edit-controls')) return;
  const button = document.createElement('button');
  button.className = 'gd-edit-controls';
  button.textContent = 'Edit controls';
  button.style.cssText = 'display:block;width:100%;margin-top:10px;padding:9px 10px;border:1px solid rgba(94,232,200,.55);border-radius:9px;background:#101a2e;color:#eaf2ff;font:inherit;font-weight:700;';
  button.addEventListener('click', openEditor);
  // Above the version line if it is there, so the version stays the last thing in the panel.
  panel.insertBefore(button, panel.querySelector('.gd-version'));
}

// The heads-up display appears a moment after the page starts (and is made again if it is ever rebuilt), so watch
// the page: whenever its controls are there, put the saved arrangement on them and add the button to Settings.
let scheduled = false;
const refresh = () => {
  scheduled = false;
  const panel = document.querySelector('.gd-settings');
  if (panel) addButton(panel);
  // Only controls not yet pinned need doing; pinning moves an element, which this watcher would see as a change.
  for (const control of CONTROLS) {
    const place = layout[control.id];
    const element = document.querySelector<HTMLElement>(control.selector);
    if (place && element && element.dataset.gdmPinned !== '1') pin(element, place);
  }
};
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(refresh);
}).observe(document.documentElement, { childList: true, subtree: true });
applyLayout();
refresh();
