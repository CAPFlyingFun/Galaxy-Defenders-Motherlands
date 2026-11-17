// ============================================================================
// hud.ts -- the on-screen controls, built from ordinary HTML elements.
//
//   bottom left    moving: two arrow buttons (ring track) OR a stick (free walk)
//   bottom right   the view switch (first / third person) and, in first person, FIRE
//   centre         the first-person crosshair
//   top right      the settings gear and its panel
//   top left       with ?debug=1: FPS, draw calls and buttons to hurt the dome
//
// The buttons and stick do not move the heroine themselves. They only write
// what the player is doing into the Controls object (input/controls.ts); the
// game loop reads it from there, the same as it reads the keyboard.
// ============================================================================
import './hud.css';
import type { Controls } from '../input/controls';
import type { ViewMode } from '../camera/cameraRig';

/** What the dome test buttons can ask for. */
export type DomeDebugAction = 'hit' | 'shatter' | 'repair-all';

export interface HudOptions {
  /** Show the debug readout and dome test buttons. */
  debug: boolean;
  /** Whether "Free walk in third person" starts ticked. */
  freeWalk: boolean;
  onFreeWalkChange(on: boolean): void;
  onToggleView(): void;
  onDomeDebug(action: DomeDebugAction): void;
}

/** How far the stick's knob can travel from its middle, in pixels. */
const STICK_TRAVEL = 40;

/** Make an element with a class, optionally with text, inside `parent`. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/**
 * Make `button` a hold-down button: `change(true)` while a finger or the mouse
 * holds it, `change(false)` when it lets go (or the touch is cancelled).
 */
function holdButton(button: HTMLElement, change: (down: boolean) => void): void {
  const set = (down: boolean) => {
    button.classList.toggle('is-down', down);
    change(down);
  };
  button.addEventListener('pointerdown', (event) => {
    // "Capture" keeps the release coming to this button even if the finger slides off it.
    button.setPointerCapture(event.pointerId);
    set(true);
  });
  button.addEventListener('pointerup', () => set(false));
  button.addEventListener('pointercancel', () => set(false));
  button.addEventListener('lostpointercapture', () => set(false));
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly ringButtons: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly viewButton: HTMLElement;
  private readonly fireButton: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly readout: HTMLElement | null = null;
  private readonly domeLabel: HTMLElement | null = null;

  constructor(host: HTMLElement, private readonly controls: Controls, options: HudOptions) {
    this.root = element('div', 'gd-hud', host);

    // ---- Bottom left: moving ------------------------------------------------
    const move = element('div', 'gd-move', this.root);
    this.ringButtons = element('div', 'gd-ring-buttons', move);
    const left = element('button', 'gd-button', this.ringButtons, '◀'); // a left-pointing triangle
    const right = element('button', 'gd-button', this.ringButtons, '▶'); // a right-pointing triangle
    left.setAttribute('aria-label', 'Run left');
    right.setAttribute('aria-label', 'Run right');
    holdButton(left, (down) => (controls.buttonLeft = down));
    holdButton(right, (down) => (controls.buttonRight = down));

    this.stick = element('div', 'gd-stick', move);
    this.stickKnob = element('div', 'gd-stick-knob', this.stick);
    this.wireStick();

    // ---- Bottom right: view switch and fire ----------------------------------
    const actions = element('div', 'gd-actions', this.root);
    this.viewButton = element('button', 'gd-button gd-view', actions);
    this.viewButton.addEventListener('click', () => options.onToggleView());
    this.fireButton = element('button', 'gd-button gd-fire', actions, 'FIRE');
    holdButton(this.fireButton, (down) => (controls.buttonFire = down));

    // ---- Centre: crosshair ---------------------------------------------------
    this.crosshair = element('div', 'gd-crosshair', this.root);

    // ---- Top right: settings -------------------------------------------------
    const gear = element('button', 'gd-button gd-gear', this.root, '⚙'); // a gear
    gear.setAttribute('aria-label', 'Settings');
    const settings = element('div', 'gd-settings', this.root);
    settings.hidden = true;
    element('h2', '', settings, 'SETTINGS');
    const row = element('label', '', settings);
    const freeWalk = element('input', '', row);
    freeWalk.type = 'checkbox';
    freeWalk.checked = options.freeWalk;
    element('span', '', row, 'Free walk in third person');
    freeWalk.addEventListener('change', () => options.onFreeWalkChange(freeWalk.checked));
    gear.addEventListener('click', () => (settings.hidden = !settings.hidden));

    // ---- Top left: debug -----------------------------------------------------
    if (options.debug) {
      const debug = element('div', 'gd-debug', this.root);
      this.readout = element('pre', '', debug);
      this.domeLabel = element('pre', '', debug);
      const buttons = element('div', 'gd-debug-row', debug);
      const add = (label: string, action: DomeDebugAction) =>
        element('button', '', buttons, label).addEventListener('click', () => options.onDomeDebug(action));
      add('Hit -25', 'hit');
      add('Shatter', 'shatter');
      add('Repair all', 'repair-all');
    }

    this.setView('third', options.freeWalk);
  }

  /** Show the controls that belong to the current view and way of moving. */
  setView(mode: ViewMode, freeWalk: boolean): void {
    const first = mode === 'first';
    const useStick = first || freeWalk;
    this.ringButtons.hidden = useStick;
    this.stick.hidden = !useStick;
    this.fireButton.hidden = !first;
    this.crosshair.hidden = !first;
    // The button names the view it switches TO.
    this.viewButton.innerHTML = first ? '3rd<small>PERSON</small>' : '1st<small>PERSON</small>';

    // Whatever is now hidden cannot be let go of, so let go of everything.
    this.controls.buttonLeft = false;
    this.controls.buttonRight = false;
    this.controls.buttonFire = false;
    this.releaseStick();
  }

  /** The FPS / draw call text (debug only). */
  setReadout(text: string): void {
    if (this.readout) this.readout.textContent = text;
  }

  /** Which dome section the test buttons act on, and its health (debug only). */
  setDomeLabel(text: string): void {
    if (this.domeLabel && this.domeLabel.textContent !== text) this.domeLabel.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }

  // ---- The stick ---------------------------------------------------------------

  private wireStick(): void {
    const move = (event: PointerEvent) => {
      // How far the finger is from the middle of the stick, limited to the knob's travel.
      const box = this.stick.getBoundingClientRect();
      let dx = event.clientX - (box.left + box.width / 2);
      let dy = event.clientY - (box.top + box.height / 2);
      const length = Math.hypot(dx, dy);
      if (length > STICK_TRAVEL) {
        dx *= STICK_TRAVEL / length;
        dy *= STICK_TRAVEL / length;
      }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.controls.stickX = dx / STICK_TRAVEL;
      this.controls.stickY = -dy / STICK_TRAVEL; // up on the screen is "forward"
    };
    this.stick.addEventListener('pointerdown', (event) => {
      this.stick.setPointerCapture(event.pointerId);
      move(event);
    });
    this.stick.addEventListener('pointermove', (event) => {
      if (this.stick.hasPointerCapture(event.pointerId)) move(event);
    });
    this.stick.addEventListener('pointerup', () => this.releaseStick());
    this.stick.addEventListener('pointercancel', () => this.releaseStick());
    this.stick.addEventListener('lostpointercapture', () => this.releaseStick());
  }

  private releaseStick(): void {
    this.stickKnob.style.transform = '';
    this.controls.stickX = 0;
    this.controls.stickY = 0;
  }
}
