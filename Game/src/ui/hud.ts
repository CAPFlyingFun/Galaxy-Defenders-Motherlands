// ============================================================================
// hud.ts -- the on-screen controls, built from ordinary HTML elements.
//
//   bottom left    the MOVE stick (every view) and, in first person, the CAMERA stick beside it
//   bottom right   the view switch (first / third person) and, in first person, FIRE
//   centre         the first-person crosshair
//   top right      the settings gear and its panel (how the heroine is drawn, the test tools)
//   top middle     her vitals card (put there by main.ts: topSlot)
//   top left       with ?debug=1 (or the tick box in Settings): the readout (FPS, triangles...) and buttons to
//                  hurt the dome. It is only read: it never takes a touch and never covers a control.
//
// The buttons and stick do not move the heroine themselves. They only write
// what the player is doing into the Controls object (input/controls.ts); the
// game loop reads it from there, the same as it reads the keyboard.
// ============================================================================
import { toGameX, toGameY } from '../core/orientation';
import './hud.css';
import type { Controls } from '../input/controls';
import type { ViewMode } from '../camera/cameraRig';
import { FOV_RANGE, TABLE_RANGE, type HeroineSettings } from '../heroine/heroineSettings';
import { ZOOM_MIN, thirdPersonDistance } from '../camera/cameraRig';
import { TARGET_FPS } from '../heroine/fast/autoDetail';
import { PACE_TUNING } from '../input/pace';
import { DETAILS } from '../heroine/fast/detailLevels';

/** What the dome test buttons can ask for. */
export type DomeDebugAction = 'hit' | 'shatter' | 'repair-all';

export interface HudOptions {
  /** Show the debug readout and dome test buttons. */
  debug: boolean;
  /** The "Show FPS and test tools" tick box in Settings was changed. */
  onDebugChange(on: boolean): void;
  /** How the heroine is drawn, as the game started with it (src/heroine/heroineSettings.ts). */
  graphics: HeroineSettings;
  /** One of those choices was changed in Settings. */
  onGraphicsChange<K extends keyof HeroineSettings>(key: K, value: HeroineSettings[K]): void;
  onToggleView(): void;
  /** The weapon table's buttons (src/world/tableUse.ts): the main one ('both') or one hand's. */
  onUse?(which: 'both' | 'left' | 'right'): void;
  onDomeDebug(action: DomeDebugAction): void;
}

/** How far the stick's knob can travel from its middle, in pixels. */
const STICK_TRAVEL = 40;
/**
 * The MOVE stick's travel: 100 pixels from its middle to its edge, so each of its five rings is 20 pixels deep
 * (Joshua, 2026-11-17: "every 20 pixels is 1/5"). hud.css draws the stick to match (.gd-walk-stick).
 */
const MOVE_TRAVEL = 100;
/** The space kept between the readout and her vitals card, in pixels. */
const READOUT_GAP = 8;

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

/** A click that arrives this soon after a finger landed on the same button is that finger's own click, already answered. */
const SAME_TAP_MS = 700;

/**
 * Make `button` a TAP button that answers the instant a finger (or the mouse) lands on it, whatever else is
 * being held at the time.
 *
 * Joshua, 2026-11-17: "While moving holding the joystick forward, I can't switch between cameras. I have to stop
 * and release the stick to switch".
 *
 * WHY NOT JUST LISTEN FOR "click"? A phone only sends a click for a tap made with ONE finger on the screen. With
 * a thumb already holding the MOVE stick, a second finger's tap is not a click at all, so the button never
 * heard it. "pointerdown" is sent for every finger by itself, whatever the other fingers are doing.
 *
 * After an ordinary one-finger tap the phone still sends its click a moment later; that one is ignored (the tap
 * has already been answered). A click with NO finger behind it is answered: the keyboard (Enter or Space on
 * the button), or another part of the game pressing the button for the player (the control editor's
 * "Switch view": src/ui/layoutEditor.ts).
 */
function tapButton(button: HTMLElement, tap: () => void): void {
  let answeredAt = -Infinity;
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return; // only the mouse's main button
    answeredAt = performance.now();
    tap();
  });
  button.addEventListener('click', (event) => {
    // `detail` counts the presses of a real tap or mouse click (1, 2...); it is 0 for a click nothing pressed.
    if (event.detail === 0 && performance.now() - answeredAt > SAME_TAP_MS) tap();
  });
}

export class Hud {
  private readonly root: HTMLElement;
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
  /** The weapon table's buttons: shown only when she is near it (`setUse`). */
  private readonly useBar: HTMLElement;
  private readonly useMain: HTMLElement;
  private useLabel = '';
  /** The big word on the view button ("1st" or "3rd"): the view it switches TO. */
  private readonly viewName: HTMLElement;
  private readonly fireButton: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly readout: HTMLElement | null = null;
  private readonly domeLabel: HTMLElement | null = null;
  /** The box the readout and the dome test buttons are in (null when they are not shown). */
  private readonly debugPanel: HTMLElement | null = null;

  constructor(host: HTMLElement, private readonly controls: Controls, options: HudOptions) {
    this.root = element('div', 'gd-hud', host);

    // ---- Top left: the readout and the dome test buttons ----------------------
    // MADE FIRST, BEFORE EVERY CONTROL, ON PURPOSE. What is made later is drawn on top, so the gear, the view
    // switch, the sticks and her vitals card are all drawn over the readout and none of them can be hidden by
    // it. (Joshua, 2026-11-17: it used to be made last; when two more lines made it bigger it lay over the gear
    // and the view switch and caught the finger, so Settings could not be opened.) hud.css also lets a touch
    // pass straight through it: only its three buttons take one.
    if (options.debug) {
      const debug = element('div', 'gd-debug', this.root);
      this.debugPanel = debug;
      this.readout = element('pre', '', debug);
      this.domeLabel = element('pre', '', debug);
      const buttons = element('div', 'gd-debug-row', debug);
      const add = (label: string, action: DomeDebugAction) =>
        element('button', '', buttons, label).addEventListener('click', () => options.onDomeDebug(action));
      add('Hit -25', 'hit');
      add('Shatter', 'shatter');
      add('Repair all', 'repair-all');
    }

    // ---- Bottom left: moving ------------------------------------------------
    const move = element('div', 'gd-move', this.root);

    // The MOVE stick, in every view: she walks freely, anywhere under the dome (Joshua, 2026-11-17: "Remove the
    // fixed moving ring, and let it be free movement"). The two arrow buttons of the old ring track are gone.
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
    this.viewButton.setAttribute('aria-label', 'Switch view');
    // (its two lines of text are made once; only the big word changes, so the button a finger is on is never rebuilt)
    this.viewName = element('span', '', this.viewButton);
    element('small', '', this.viewButton, 'PERSON');
    // It answers as the finger LANDS, so the view can be switched while a thumb holds the MOVE stick (tapButton above).
    tapButton(this.viewButton, () => options.onToggleView());
    this.fireButton = element('button', 'gd-button gd-fire', actions, 'FIRE');
    holdButton(this.fireButton, (down) => (controls.buttonFire = down));

    // ---- Right side, above the view switch: the WEAPON TABLE's buttons --------------
    // (Joshua, 2026-11-17: a table to put her guns down on and pick them up from.) Shown only when she is near it.
    // Out of the bottom corners, which stay free for the player's controls: on the right, half way up.
    this.useBar = element('div', 'gd-use', this.root);
    this.useBar.hidden = true;
    this.useMain = element('button', 'gd-button gd-use-main', this.useBar, 'PUT DOWN');
    tapButton(this.useMain, () => options.onUse?.('both'));
    const oneHand = element('div', 'gd-use-hands', this.useBar);
    for (const [word, hand] of [['L', 'left'], ['R', 'right']] as const) {
      const button = element('button', 'gd-button gd-use-hand', oneHand, word);
      button.setAttribute('aria-label', `${hand} hand`);
      tapButton(button, () => options.onUse?.(hand));
    }

    // ---- Centre: crosshair ---------------------------------------------------
    this.crosshair = element('div', 'gd-crosshair', this.root);

    // ---- Top right: settings -------------------------------------------------
    const gear = element('button', 'gd-button gd-gear', this.root, '⚙'); // a gear
    gear.setAttribute('aria-label', 'Settings');
    const settings = element('div', 'gd-settings', this.root);
    settings.hidden = true;
    element('h2', '', settings, 'SETTINGS');
    // (The "Free walk in third person" tick box used to be here. She always walks freely now, so it is gone.)
    // A tick box for the FPS readout and the dome test buttons, so they can be turned on from a phone
    // without typing "?debug=1" into the address.
    const debugRow = element('label', '', settings);
    const debugBox = element('input', '', debugRow);
    debugBox.type = 'checkbox';
    debugBox.checked = options.debug;
    element('span', '', debugRow, 'Show FPS and test tools');
    debugBox.addEventListener('change', () => options.onDebugChange(debugBox.checked));
    // (the gear answers as the finger lands too, so Settings opens even while the MOVE stick is held)
    tapButton(gear, () => (settings.hidden = !settings.hidden));

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

    // ---- Settings: the camera (Joshua, 2026-11-17: "adjust the default zoom for 3rd person as well as FOV for both")
    // A slider for each, its value written beside it; each takes hold at once and is remembered on this device.
    const sliderRow = <K extends 'fovThird' | 'fovFirst' | 'zoomThird' | 'tableHeight'>(label: string, key: K, least: number, most: number, step: number, show: (v: number) => string): void => {
      const line = element('label', 'gd-choice gd-slider', settings);
      element('span', '', line, label);
      const value = element('b', '', line, show(options.graphics[key]));
      const slider = element('input', '', line);
      slider.type = 'range';
      slider.min = String(least); slider.max = String(most); slider.step = String(step);
      slider.value = String(options.graphics[key]);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        value.textContent = show(v);
        options.onGraphicsChange(key, v as HeroineSettings[K]);
      });
    };
    element('h2', 'gd-settings-part', settings, 'CAMERA');
    sliderRow('3rd person FOV', 'fovThird', FOV_RANGE.least, FOV_RANGE.most, 1, (v) => `${v}°`);
    sliderRow('1st person FOV', 'fovFirst', FOV_RANGE.least, FOV_RANGE.most, 1, (v) => `${v}°`);
    sliderRow('3rd person zoom', 'zoomThird', ZOOM_MIN, 1, 0.005, (v) => `${thirdPersonDistance(v).toFixed(1)} m`);
    element('small', 'gd-note', settings, 'Field of view: how wide each view sees (50-120°). Zoom: how far behind her the 3rd person camera starts (1.6 m to 23 m); pinch to zoom in play.');
    // ---- Settings: the weapon table (Joshua, 2026-11-17: "how can you adjust the table height") ----------------
    element('h2', 'gd-settings-part', settings, 'WEAPON TABLE');
    sliderRow('Table height', 'tableHeight', TABLE_RANGE.least, TABLE_RANGE.most, 0.01, (v) => `${Math.round(v * 100)} cm`);
    element('small', 'gd-note', settings, 'Low tables have her squat or kneel to reach her guns; the floor, kneel or squat at random.');

    this.setView('third');
  }

  /** The weapon table's buttons: shown with this word on the main one, or hidden (null). */
  setUse(label: string | null): void {
    this.useBar.hidden = label === null;
    // (the word is changed only when it changes: the button a finger is on is never rebuilt)
    if (label !== null && label !== this.useLabel) { this.useMain.textContent = label; this.useLabel = label; }
  }

  /** Show the controls that belong to the current view. */
  setView(mode: ViewMode): void {
    const first = mode === 'first';
    // The MOVE stick is there in every view; the CAMERA stick, FIRE and the crosshair only in first person.
    this.lookStick.hidden = !first;
    this.fireButton.hidden = !first;
    this.crosshair.hidden = !first;
    // The button names the view it switches TO.
    this.viewName.textContent = first ? '3rd' : '1st';

    // THE MOVE STICK IS NOT LET GO OF (Joshua, 2026-11-17: he wants to change view while moving). It is in both
    // views and the thumb is still on it, so it keeps what the thumb is telling it and her pace carries straight
    // through the switch. (It used to be zeroed here, which stopped her dead each time the view changed.)
    // Only what is now hidden is let go of, because a hidden control cannot be let go of by a finger.
    if (!first) {
      this.controls.buttonFire = false;
      this.fireButton.classList.remove('is-down');
      this.releaseLookStick();
    }
  }

  /** The readout's text: FPS, triangles and the rest, one short line each (debug only). */
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
      // A HIDDEN stick does nothing. The view can be switched while a thumb is on the CAMERA stick, which hides
      // it under the thumb; the thumb still "has" the stick until it lifts, and a hidden stick has no place on the
      // screen to measure from, so without this it read as pushed hard over and spun the third-person view.
      if (stick.hasPointerCapture(event.pointerId) && !stick.hidden) move(event);
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
    if (!this.slot) {
      this.slot = element('div', 'gd-top-slot', this.root);
      // The readout keeps clear of whatever is put here. A "ResizeObserver" tells us whenever the screen or the
      // card changes size (the phone is turned, the card is first filled in), and the readout is placed again.
      if (this.debugPanel && typeof ResizeObserver !== 'undefined') {
        const watch = new ResizeObserver(() => this.placeReadout());
        watch.observe(this.root);
        watch.observe(this.slot);
        // (the space the phone keeps at its edges changes when it is turned, while no size changes: placed again then)
        window.addEventListener('orientationchange', () => window.setTimeout(() => this.placeReadout(), 400));
        window.addEventListener('resize', () => this.placeReadout());
      }
    }
    return this.slot;
  }
  private slot: HTMLElement | null = null;

  /**
   * Keep the readout clear of her vitals card, which sits in the middle of the top edge: always BESIDE it, in the top
   * left corner, no wider than the room there (its lines wrap if they must). (It used to drop UNDER the card when the
   * room looked small; on Joshua's phone, narrower than the test screen, it did, and sat over the MOVE stick.)
   *
   * "offsetLeft / offsetWidth / offsetTop" are an element's place and size as the page laid it out, in the HUD's own
   * pixels, so this works the same whichever way the stage is turned.
   */
  private placeReadout(): void {
    const panel = this.debugPanel, slot = this.slot;
    if (!panel || !slot) return;
    // (the card is centred: the slot's box is as wide as the card, and its middle is the middle of the screen)
    const cardLeft = (this.root.clientWidth - slot.offsetWidth) / 2;
    const room = cardLeft - panel.offsetLeft - READOUT_GAP;
    panel.style.maxWidth = slot.offsetWidth === 0 ? '' : `${Math.max(120, Math.floor(room))}px`;
  }

  /** Let go of the CAMERA stick (used when the view changes and it is hidden, perhaps under a thumb). */
  private releaseLookStick(): void {
    this.lookStickKnob.style.transform = '';
    this.controls.lookStickX = 0;
    this.controls.lookStickY = 0;
  }
}
