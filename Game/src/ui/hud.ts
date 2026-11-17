// ============================================================================
// hud.ts -- the on-screen controls, built from ordinary HTML elements.
//
//   bottom left    moving: two arrow buttons (ring track) OR a stick (free walk)
//   bottom right   the view switch (first / third person) and, in first person, FIRE
//   centre         the first-person crosshair
//   top right      the settings gear and its panel (free walk, how the heroine is drawn, the test tools)
//   top left       with ?debug=1: FPS, draw calls and buttons to hurt the dome
//
// The buttons and stick do not move the heroine themselves. They only write
// what the player is doing into the Controls object (input/controls.ts); the
// game loop reads it from there, the same as it reads the keyboard.
// ============================================================================
import { toGameX, toGameY } from '../core/orientation';
import './hud.css';
import type { Controls } from '../input/controls';
import type { ViewMode } from '../camera/cameraRig';
import type { HeroineSettings } from '../heroine/heroineSettings';
import { TARGET_FPS } from '../heroine/fast/autoDetail';
import { PACE_TUNING } from '../input/pace';
import { DETAILS } from '../heroine/fast/detailLevels';

/** What the dome test buttons can ask for. */
export type DomeDebugAction = 'hit' | 'shatter' | 'repair-all';

export interface HudOptions {
  /** Show the debug readout and dome test buttons. */
  debug: boolean;
  /** Whether "Free walk in third person" starts ticked. */
  freeWalk: boolean;
  onFreeWalkChange(on: boolean): void;
  /** The "Show FPS and test tools" tick box in Settings was changed. */
  onDebugChange(on: boolean): void;
  /** How the heroine is drawn, as the game started with it (src/heroine/heroineSettings.ts). */
  graphics: HeroineSettings;
  /** One of those choices was changed in Settings. */
  onGraphicsChange<K extends keyof HeroineSettings>(key: K, value: HeroineSettings[K]): void;
  onToggleView(): void;
  onDomeDebug(action: DomeDebugAction): void;
}

/** How far the stick's knob can travel from its middle, in pixels. */
const STICK_TRAVEL = 40;
/**
 * The MOVE stick's travel: 100 pixels from its middle to its edge, so each of its five rings is 20 pixels deep
 * (Joshua, 2026-11-17: "every 20 pixels is 1/5"). hud.css draws the stick to match (.gd-walk-stick).
 */
const MOVE_TRAVEL = 100;

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
  private readonly stickRings: HTMLElement[];
  private readonly paceLabel: HTMLElement;
  /** What the stick last showed, so the page is only touched when it changes. */
  private shownPace = '';
  private shownRing = -1;
  private readonly lookStick: HTMLElement;
  private readonly lookStickKnob: HTMLElement;
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

    // The WALK stick (first person, and third person with "free walk" on).
    this.stick = element('div', 'gd-stick gd-walk-stick', move);
    element('span', 'gd-stick-label', this.stick, 'MOVE');
    // THE FIVE RINGS (src/input/pace.ts): four circles drawn on the stick, one where each ring begins, so the thumb
    // can see where it is: centre = stop, inner = ease down, middle = hold, outer-middle = build slowly,
    // outer = build quickly. Each circle is as wide as the knob's middle travels at that ring's push.
    this.stickRings = PACE_TUNING.ringsFrom.map((from) => {
      const ring = element('div', 'gd-stick-ring', this.stick);
      const across = from * MOVE_TRAVEL * 2;
      ring.style.width = ring.style.height = `${across}px`;
      ring.style.margin = `${-across / 2}px 0 0 ${-across / 2}px`;
      return ring;
    });
    // Her pace in words, over the stick: WALK, JOG, RUN or SPRINT.
    this.paceLabel = element('span', 'gd-pace', this.stick);
    this.stickKnob = element('div', 'gd-stick-knob', this.stick);
    this.wireStick(this.stick, this.stickKnob, (x, y) => {
      controls.stickX = x;
      controls.stickY = y;
    }, MOVE_TRAVEL);

    // The CAMERA stick (first person only; Joshua, 2026-11-16: "fire with your right hand and move the camera
    // around in 1st person with your left"). It sits in the bottom-left corner under the walk stick, so the left
    // thumb aims while the right thumb holds FIRE. Dragging on the picture still looks around as before.
    this.lookStick = element('div', 'gd-stick gd-look-stick', move);
    element('span', 'gd-stick-label', this.lookStick, 'CAMERA');
    this.lookStickKnob = element('div', 'gd-stick-knob', this.lookStick);
    this.wireStick(this.lookStick, this.lookStickKnob, (x, y) => {
      controls.lookStickX = x;
      controls.lookStickY = y;
    });

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
    // A second tick box: the FPS readout and the dome test buttons, so they can be turned on from a phone
    // without typing "?debug=1" into the address.
    const debugRow = element('label', '', settings);
    const debugBox = element('input', '', debugRow);
    debugBox.type = 'checkbox';
    debugBox.checked = options.debug;
    element('span', '', debugRow, 'Show FPS and test tools');
    debugBox.addEventListener('change', () => options.onDebugChange(debugBox.checked));
    gear.addEventListener('click', () => (settings.hidden = !settings.hidden));

    // ---- Settings: how the heroine is drawn -----------------------------------
    // Each row is a label with a drop-down list. `choices` pairs what is shown with what is kept.
    const choiceRow = <K extends keyof HeroineSettings>(label: string, key: K, choices: readonly (readonly [string, HeroineSettings[K]])[], note = ''): HTMLElement => {
      const line = element('label', 'gd-choice', settings);
      element('span', '', line, label);
      const list = element('select', '', line);
      choices.forEach(([text, value], i) => {
        const option = element('option', '', list, text);
        option.value = String(i);
        if (value === options.graphics[key]) option.selected = true;
      });
      list.addEventListener('change', () => options.onGraphicsChange(key, choices[Number(list.value)][1]));
      if (note) element('small', 'gd-note', settings, note);
      return line;
    };
    element('h2', 'gd-settings-part', settings, 'HEROINE');
    choiceRow('Body', 'body', [['Performance', 'performance'], ['Visual', 'visual']], 'Performance: the fast body, on the DEV Room\'s settings. Visual: the Character Builder\'s own room. Changing it reloads the game.');
    const fast = options.graphics.body === 'performance';
    // (the rows that belong to the other body are shown greyed out, so it is plain what each body offers)
    const detailRow = choiceRow('Detail', 'detail', [['Auto live', 'autoLive'], ['Auto', 'auto'], ...DETAILS.map((d) => [`${d}%`, d] as const)]);
    const targetRow = choiceRow('Target FPS', 'targetFps', TARGET_FPS.map((f) => [String(f), f] as const), 'Auto live: from 30% down to 1% by the frame rate, all her body shapes live. Auto: up to 100%, lighter only if the frame rate needs it.');
    choiceRow('Sharpness', 'sharpness', [['2x', 2], ['1x', 1]]);
    choiceRow('Live body', 'liveBody', [['On', 'on'], ['Off', 'off']], 'On: her baby, womb, organs and the rest are kept and run but not drawn (kicks show on her belly). Loads after she appears. Changing it reloads the game.');
    choiceRow('Shadows', 'shadows', [['On', 'on'], ['Off', 'off']], 'On: she casts a real shadow on the plaza.');
    const skinRow = choiceRow('Skin', 'skin', [['Light', 'light'], ['Full', 'full']], 'Skin is for the Visual body (reloads the game).');
    for (const [line, on] of [[detailRow, fast], [targetRow, fast], [skinRow, !fast]] as const) {
      line.classList.toggle('is-off', !on);
      const list = line.querySelector('select');
      if (list) list.disabled = !on;
    }

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
    // The MOVE stick is used in every view now (Joshua, 2026-11-17: the ring stick sets her pace). On the ring
    // track only its left and right count. The two arrow buttons it replaced stay hidden.
    void freeWalk;
    this.ringButtons.hidden = true;
    this.stick.hidden = false;
    this.lookStick.hidden = !first;
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

  /**
   * Make `stick` a thumb stick: while a finger drags inside it, its `knob` follows the finger (up to
   * STICK_TRAVEL pixels from the middle) and `write` is told where it is, each direction -1..1
   * (right is +x, UP on the screen is +y). Letting go writes 0, 0 and the knob springs back.
   */
  private wireStick(stick: HTMLElement, knob: HTMLElement, write: (x: number, y: number) => void, travel = STICK_TRAVEL): void {
    const release = () => {
      knob.style.transform = '';
      write(0, 0);
    };
    const move = (event: PointerEvent) => {
      // How far the finger is from the middle of the stick, limited to the knob's travel.
      const box = stick.getBoundingClientRect();
      // (measured on the screen, then turned into the game's own right and down: src/core/orientation.ts)
      const screenDx = event.clientX - (box.left + box.width / 2);
      const screenDy = event.clientY - (box.top + box.height / 2);
      let dx = toGameX(screenDx, screenDy);
      let dy = toGameY(screenDx, screenDy);
      const length = Math.hypot(dx, dy);
      if (length > travel) {
        dx *= travel / length;
        dy *= travel / length;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      write(dx / travel, -dy / travel); // up on the screen is +
    };
    stick.addEventListener('pointerdown', (event) => {
      // "Capture" keeps the drag coming to this stick even when the thumb slides outside its circle.
      stick.setPointerCapture(event.pointerId);
      move(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (stick.hasPointerCapture(event.pointerId)) move(event);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    stick.addEventListener('lostpointercapture', release);
  }

  /**
   * Show her pace on the MOVE stick: its name over the stick, and which ring the thumb is in (the circle that
   * ring begins at is lit; ring 0, the centre, lights none).
   */
  setPace(name: string, ring: number): void {
    if (name !== this.shownPace) { this.shownPace = name; this.paceLabel.textContent = name; }
    if (ring !== this.shownRing) {
      this.shownRing = ring;
      this.stickRings.forEach((circle, k) => circle.classList.toggle('is-on', k === ring - 1));
    }
  }

  /** Where a card (her vitals) can be put: along the top edge, in the middle. */
  topSlot(): HTMLElement {
    return (this.slot ??= element('div', 'gd-top-slot', this.root));
  }
  private slot: HTMLElement | null = null;

  /** Let go of both sticks (used when the view changes and a stick may be hidden under a thumb). */
  private releaseStick(): void {
    this.stickKnob.style.transform = '';
    this.lookStickKnob.style.transform = '';
    this.controls.stickX = 0;
    this.controls.stickY = 0;
    this.controls.lookStickX = 0;
    this.controls.lookStickY = 0;
  }
}
