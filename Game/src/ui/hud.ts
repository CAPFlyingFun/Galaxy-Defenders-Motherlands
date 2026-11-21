// ============================================================================
// hud.ts -- the on-screen controls, built from ordinary HTML elements.
//
// JOSHUA'S LAYOUT (2026-11-18, his pick of five: "design 4", an edge rail and a prompt; "some buttons can hide
// until needed"; a button "just for switching Manual vs Auto from Fire so fire is always there"):
//
//   top left       her vitals card (put there by main.ts: topSlot), one line under it (FPS and version), and with
//                  "Show full readout" ticked in Settings the full readout under that. Only read: never a touch.
//   top right      the settings gear and its panel; each gun's rounds under it
//   bottom left    the MOVE stick (every view) and the CAMERA stick beside it (aimed by hand, and first person)
//   right edge     THE RAIL, square buttons that show only when they have something to do: HOLSTER / DRAW,
//                  RELOAD (at the table, or from her belt), CAM (third person camera styles), and AUTO / MANUAL
//                  (her aim, fire and reload); L and R beside it pick the hand for the next action
//   right middle   THE PROMPT: one bubble, only near something (PUT DOWN, PICK UP, GRAB POLE, LET GO...)
//   bottom right   FIRE (always there) and the view switch (first / third person)
//   centre         the crosshair (aimed by hand, and first person)
//
// Every one of these can be moved and sized in Settings -> Edit controls (layoutEditor.ts).
//
// The buttons and stick do not move the heroine themselves. They only write
// what the player is doing into the Controls object (input/controls.ts); the
// game loop reads it from there, the same as it reads the keyboard.
// ============================================================================
import { toGameX, toGameY } from '../core/orientation';
import './hud.css';
import type { Controls } from '../input/controls';
import type { ViewMode } from '../camera/cameraRig';
import { EYE_HEIGHT_RANGE, EYE_RANGE, FOV_RANGE, SENSITIVITY_RANGE, OUTFIT_CHOICES, CATSUIT_NECKS, LANDSCAPING_CHOICES, TABLE_RANGE, outfitLook, type HeroineSettings } from '../heroine/heroineSettings';
import { BELLY_RANGE } from '../heroine/pregnancyPlan';
import { ZOOM_MIN, thirdPersonDistance } from '../camera/cameraRig';
import { TARGET_FPS } from '../heroine/fast/autoDetail';
import { PACE_TUNING } from '../input/pace';
import { DETAILS } from '../heroine/fast/detailLevels';

/** What the dome test buttons can ask for. */
export type DomeDebugAction = 'hit' | 'shatter' | 'repair-all' | 'wet';
/** What Settings -> FOOD & DRINK can do (main.ts `intake`). */
export type IntakeAction = 'snack' | 'smallMeal' | 'fullMeal' | 'sip' | 'bottle' | 'canteen' | 'hungry' | 'thirsty' | 'needToGo' | 'mustGo' | 'bathroom';

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
  /** THE PROMPT was pressed (the table's PUT DOWN / PICK UP, a bar's GRAB / LET GO), for both hands or the hand picked. */
  onPrompt?(which: 'both' | 'left' | 'right'): void;
  /** RELOAD on the rail (at the table: the table's reload; anywhere else: from her belt). */
  onReload?(): void;
  /** AUTO / MANUAL on the rail: her aim, fire and reload switched over. */
  onAimMode?(): void;
  /** The CAM button: the next third-person camera style (src/camera/cameraRig.ts). */
  onCameraStyle?(): void;
  /** Her thigh holsters: put away or draw both ('both'), or the gun of the hand picked (src/world/holsterUse.ts). */
  onHolster?(which: 'both' | 'left' | 'right'): void;
  /** CROUCH and PRONE (Joshua, 2026-11-20: "Separate CROUCH and PRONE buttons"): crouch / stand; down / stand. */
  onCrouch?(): void;
  onProne?(): void;
  onDomeDebug(action: DomeDebugAction): void;
  /** THE BATHROOM BUTTON (🚽, top right, shown only when she needs to go): she goes, as Settings -> Bathroom. */
  onBathroom?(): void;
  /** A button in Settings -> FOOD & DRINK. */
  onIntake?(action: IntakeAction): void;
  /**
   * HER PREGNANCY, to test (heroine/pregnancyPlan.ts): what her belly percent is as a week ("week 24", or "not
   * pregnant"), and the time lapse (week 12 to her delivery week, a day a second) started or stopped.
   */
  bellyText?(percent: number): string;
  onTimeLapse?(): void;
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

/** The bellies every outfit is pictured at for Settings (public/thumbs/; the one nearest hers is shown). */
const THUMB_BELLIES = [10, 50, 80, 120, 150] as const;

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
  private readonly camButton: HTMLElement;
  private camText = '';
  /** THE RAIL (each shown only when it has something to do): holster / draw, reload, aim mode; and the L / R pair. */
  private readonly holsterButton: HTMLElement;
  /** CROUCH and PRONE (her stance: heroine/fast/groundPose.ts); lit while she is in it. */
  private readonly crouchButton: HTMLElement;
  private readonly proneButton: HTMLElement;
  private stanceShown = '';
  private readonly reloadButton: HTMLElement;
  /** THE BATHROOM BUTTON (🚽): beside the gear, shown only from her urge. */
  private readonly bathroomButton: HTMLElement;
  private readonly aimModeButton: HTMLElement;
  private readonly handsBox: HTMLElement;
  private readonly handButtons: Record<'left' | 'right', HTMLElement>;
  /** The hand picked with L or R for the next action (null: both). */
  private pickedHand: 'left' | 'right' | null = null;
  private holsterLabel = '';
  private aimModeLabel = '';
  /** THE PROMPT: one bubble, only near something. */
  private readonly prompt: HTMLElement;
  private promptLabel = '';
  /** The one line under her vitals card: FPS and version. */
  private readonly fpsLine: HTMLElement;
  /** Each gun's rounds, shown near the top right (Joshua, 2026-11-17: 20 a gun). */
  private readonly ammo: HTMLElement;
  private ammoText = '';
  /** The big word on the view button ("1st" or "3rd"): the view it switches TO. */
  private readonly viewName: HTMLElement;
  private readonly fireButton: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly domeLabel: HTMLElement;
  /** The box the readout is in: always made, hidden while "Show full readout" is off (`setDebug`). */
  private readonly debugPanel: HTMLElement;
  /** THE PREGNANCY rows in Settings: the belly slider and its value, and the time lapse's button; and the chip on screen. */
  private bellySlider: HTMLInputElement | null = null;
  private pregnantSelect: HTMLSelectElement | null = null;
  private bellyValue: HTMLElement | null = null;
  private lapseButton: HTMLElement | null = null;
  private readonly lapseChip: HTMLElement;
  private bellyTextOf: (percent: number) => string = (p) => `${p}%`;

  constructor(host: HTMLElement, private readonly controls: Controls, options: HudOptions) {
    this.root = element('div', 'gd-hud', host);

    // ---- Top left: the readout and the dome test buttons ----------------------
    // MADE FIRST, BEFORE EVERY CONTROL, ON PURPOSE. What is made later is drawn on top, so the gear, the view
    // switch, the sticks and her vitals card are all drawn over the readout and none of them can be hidden by
    // it. (Joshua, 2026-11-17: it used to be made last; when two more lines made it bigger it lay over the gear
    // and the view switch and caught the finger, so Settings could not be opened.) hud.css also lets a touch
    // pass straight through it: only its three buttons take one.
    // SHOWN OR HIDDEN WHILE THE GAME RUNS (Joshua, 2026-11-21: turning it on or off restarted the whole game, and the
    // restart crashed on his iPhone; "It's just a visual toggle"): it is always made, and `setDebug` shows or hides it.
    const debug = element('div', 'gd-debug', this.root);
    this.debugPanel = debug;
    this.readout = element('pre', '', debug);
    this.domeLabel = element('pre', '', debug);
    debug.hidden = !options.debug;
    // (the dome's test buttons are in Settings now, TEST TOOLS: Joshua, 2026-11-18, the corner was cluttered)

    // ---- Top middle: the time lapse's week (only while it runs; a tap stops it) -------------------------------------
    this.lapseChip = element('button', 'gd-lapse-chip', this.root);
    this.lapseChip.hidden = true;
    tapButton(this.lapseChip, () => options.onTimeLapse?.());

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
    // (FIRE is always there, Joshua 2026-11-18: in MANUAL it fires; in AUTO she fires on her own, and it adds bursts)
    this.fireButton = element('button', 'gd-button gd-fire', this.root, 'FIRE');
    holdButton(this.fireButton, (down) => (controls.buttonFire = down));

    // ---- Right edge: THE RAIL ------------------------------------------------------
    // Square buttons down the right edge, each its own (so each can be moved in Edit controls), each shown only when
    // it has something to do. Out of the bottom corners.
    const railButton = (className: string, word: string, small: string, label: string): HTMLElement => {
      const button = element('button', `gd-button gd-rail ${className}`, this.root);
      button.setAttribute('aria-label', label);
      element('span', '', button, word);
      if (small) element('small', '', button, small);
      return button;
    };
    this.holsterButton = railButton('gd-rail-holster', 'HOLSTER', '', 'Holster or draw');
    tapButton(this.holsterButton, () => options.onHolster?.(this.takeHand()));
    this.reloadButton = railButton('gd-rail-reload', 'RELOAD', '', 'Reload');
    tapButton(this.reloadButton, () => options.onReload?.());
    // (the CAM button, third person aimed on her own: follow, shoulder, orbit, top, drone, cinematic)
    this.camButton = railButton('gd-rail-cam gd-cam', 'CAM', 'FOLLOW', 'Camera style');
    tapButton(this.camButton, () => options.onCameraStyle?.());
    this.aimModeButton = railButton('gd-rail-aim', 'MANUAL', '', 'Auto or manual aim and fire');
    tapButton(this.aimModeButton, () => options.onAimMode?.());
    // CROUCH and PRONE (Joshua, 2026-11-20): always there, above FIRE, each lit while she is in its stance. PRONE says
    // ALL 4s while Pregnancy is on (she goes down on her hands and knees instead of her belly).
    this.crouchButton = element('button', 'gd-button gd-stance gd-crouch', this.root, 'CROUCH');
    this.crouchButton.setAttribute('aria-label', 'Crouch or stand');
    tapButton(this.crouchButton, () => options.onCrouch?.());
    this.proneButton = element('button', 'gd-button gd-stance gd-prone', this.root, 'PRONE');
    this.proneButton.setAttribute('aria-label', 'Lie down or stand');
    tapButton(this.proneButton, () => options.onProne?.());
    // THE BATHROOM BUTTON (Joshua, 2026-11-19): a 🚽 beside the gear, top right, shown only once she feels the urge
    // (it pulses red when the urge is strong). Tapped: she squats for 5 s and is emptied, until there are toilets.
    this.bathroomButton = element('button', 'gd-button gd-bathroom', this.root, '🚽');
    this.bathroomButton.setAttribute('aria-label', 'Go to the bathroom');
    this.bathroomButton.hidden = true;
    tapButton(this.bathroomButton, () => options.onBathroom?.());
    // L and R: the hand the next action is for (tapped again: both). Beside the top of the rail.
    this.handsBox = element('div', 'gd-hands', this.root);
    const pick = (hand: 'left' | 'right'): HTMLElement => {
      const button = element('button', 'gd-button gd-hand', this.handsBox, hand === 'left' ? 'L' : 'R');
      button.setAttribute('aria-label', `${hand} hand only`);
      tapButton(button, () => this.pickHand(this.pickedHand === hand ? null : hand));
      return button;
    };
    this.handButtons = { left: pick('left'), right: pick('right') };

    // ---- Right middle: THE PROMPT --------------------------------------------------
    // One bubble, only when she is near something: the table (PUT DOWN, PICK UP) or a bar (GRAB POLE, LET GO).
    this.prompt = element('button', 'gd-button gd-prompt', this.root, 'GRAB');
    this.prompt.hidden = true;
    tapButton(this.prompt, () => options.onPrompt?.(this.takeHand()));

    // ---- Top right, under the gear: each gun's rounds -----------------------------
    this.ammo = element('div', 'gd-ammo', this.root);

    // ---- Centre: crosshair ---------------------------------------------------
    this.crosshair = element('div', 'gd-crosshair', this.root);
    // (the one line under her vitals card, put there with the card: topSlot)
    this.fpsLine = document.createElement('div');
    this.fpsLine.className = 'gd-fps';
    this.handsBox.hidden = true;

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
    element('span', '', debugRow, 'Show full readout');
    debugBox.addEventListener('change', () => options.onDebugChange(debugBox.checked));
    // (the gear answers as the finger lands too, so Settings opens even while the MOVE stick is held)
    // (the outfit pictures follow her belly and the catsuit style: brought up to date as Settings opens)
    let refreshOutfits = (): void => {};
    tapButton(gear, () => { settings.hidden = !settings.hidden; if (!settings.hidden) refreshOutfits(); });

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
      list.addEventListener('change', () => { options.onGraphicsChange(key, choices[Number(list.value)][1]); refreshOutfits(); });
      if (note) element('small', 'gd-note', settings, note);
      return line;
    };
    // (the map: Joshua, 2026-11-19, the real island for the main game, the town kept as a test map)
    element('h2', 'gd-settings-part', settings, 'WORLD');
    choiceRow('Map', 'map', [['Island (Beyond Extinction\'s, true scale)', 'island'], ['Domed town (test)', 'town']], 'The island is the main map; the domed town is kept to test in until its place on the island is chosen. Changing it reloads the game.');
    choiceRow('Landscaping', 'landscaping', LANDSCAPING_CHOICES, 'The island\'s forest, on the real island\'s own vegetation map. Images only: photo trees to 900 m. Hybrid: real 3D trees near you (solid trunks), photos beyond. Objects only: 3D trees to 280 m. Changes at once.');
    element('h2', 'gd-settings-part', settings, 'HEROINE');
    // HER OUTFIT, AS PICTURES (Joshua, 2026-11-20: "a little thumbnail of what they look like, like in CCBS... bake the
    // images at 10%, 50%, 80%, 120%, and 150% and it will pick the closest based on the belly slider"): every outfit
    // was pictured ahead of time at those five bellies (public/thumbs/<look>-<belly>.webp, by the script
    // scripts/make_outfit_thumbs.py), so nothing is drawn live; each tile shows the one nearest her belly, and a catsuit
    // in the style chosen under Catsuit style. A tap puts it on (it changes while you play).
    {
      const line = element('div', 'gd-outfits', settings);
      element('span', 'gd-outfits-title', line, 'Outfit');
      const grid = element('div', 'gd-outfit-grid', line);
      const tiles = OUTFIT_CHOICES.map(([text, value]) => {
        const tile = element('button', 'gd-outfit', grid);
        tile.type = 'button';
        const picture = element('img', '', tile);
        picture.alt = text;
        picture.decoding = 'async';
        element('span', '', tile, text);
        // (a plain click, not the instant tap of the game's buttons: a finger dragging the list must be able to scroll it)
        tile.addEventListener('click', () => { options.onGraphicsChange('outfit', value); refreshOutfits(); });
        return { tile, picture, value };
      });
      refreshOutfits = () => {
        const belly = options.graphics.belly ?? BELLY_RANGE.least;
        const nearest = THUMB_BELLIES.reduce((best, b) => (Math.abs(b - belly) < Math.abs(best - belly) ? b : best));
        for (const { tile, picture, value } of tiles) {
          const src = `${import.meta.env.BASE_URL}thumbs/${outfitLook(value, options.graphics.catsuitNeck)}-${nearest}.webp`;
          if (!picture.src.endsWith(src)) picture.src = src;
          tile.classList.toggle('is-on', value === options.graphics.outfit);
        }
      };
      element('small', 'gd-note', settings, 'Her outfit, to try each as it is made; each picture at the belly nearest hers. It changes while you play (a few seconds).');
    }
    // (every catsuit colour in the same three styles: Joshua, 2026-11-20)
    choiceRow('Catsuit style', 'catsuitNeck', CATSUIT_NECKS, 'The style every catsuit is worn in: a keyhole under a turtleneck, a low neck, or a high neck. It changes while you play.');
    choiceRow('Body', 'body', [['Performance', 'performance'], ['Visual', 'visual']], 'Performance: the fast body, on the DEV Room\'s settings. Visual: the Character Builder\'s own room. Changing it reloads the game.');
    const fast = options.graphics.body === 'performance';
    // (the rows that belong to the other body are shown greyed out, so it is plain what each body offers)
    const detailRow = choiceRow('Detail', 'detail', [['Auto live', 'autoLive'], ['Auto', 'auto'], ...DETAILS.map((d) => [`${d}%`, d] as const)]);
    const targetRow = choiceRow('Target FPS', 'targetFps', TARGET_FPS.map((f) => [String(f), f] as const), 'Auto live: from 30% down to 1% by the frame rate (her face, bust, belly and hands kept sharp near the camera). Auto: up to 100%, lighter only if the frame rate needs it.');
    choiceRow('Sharpness', 'sharpness', [['2x', 2], ['1x', 1]]);
    choiceRow('Skin depth', 'skinTexture', [['On', 'on'], ['Off', 'off']], 'Pores and fine creases on her bare skin, and her own skin picture\'s depth: the Character Builder\'s hybrid. It changes while you play (a few seconds).');
    choiceRow('Locks by her face', 'faceLocks', [['Eased off her cheeks', 'off'], ['As the builder has them', 'on']], 'The small loose locks of hair by her cheeks. It changes while you play (a few seconds).');
    choiceRow('Hair strands', 'hairStrands', [['On', 'on'], ['Off', 'off']], 'On: her hair drawn as strands and locks with hair\'s own banded shine; Off: as the Character Builder draws it. It changes while you play (a few seconds).');
    choiceRow('Suit fabric', 'suitKnit', [['Woven mesh (your photo)', 'weave'], ['Perforated mesh (drawn)', 'mesh']], 'The fabric drawn over the Shadow Operative catsuit. It changes while you play (a few seconds).');
    const sharpRow = choiceRow('Sharp face, bust & belly', 'sharpParts', [['On', 'on'], ['Off', 'off']], 'On: her face, bust and belly stay as fine as at 100% at every detail level; the rest of her is lightened. It changes while you play (a few seconds).');
    choiceRow('Live body', 'liveBody', [['On', 'on'], ['Off', 'off']], 'On: her baby, womb, organs and the rest are kept and run but not drawn (kicks show on her belly). Loads after she appears. Changing it remakes her while the game runs, as an outfit change does.');
    choiceRow('Shadows', 'shadows', [['On', 'on'], ['Off', 'off']], 'On: she casts a real shadow on the plaza.');
    element('h2', 'gd-settings-part', settings, 'COMBAT');
    choiceRow('Auto aim, fire & reload', 'autoFire', [['Auto', 'on'], ['Manual', 'off']], 'Auto: in either view she aims at targets, fires bursts and, when both guns are empty, walks to the table and reloads on her own (first person: the view follows her; drag to look away). Manual: you aim with the crosshair, hold FIRE, and press RELOAD at the table (3rd person: over her shoulder).');

    const skinRow = choiceRow('Skin', 'skin', [['Light', 'light'], ['Full', 'full']], 'Skin is for the Visual body (reloads the game).');
    for (const [line, on] of [[detailRow, fast], [targetRow, fast], [sharpRow, fast], [skinRow, !fast]] as const) {
      line.classList.toggle('is-off', !on);
      const list = line.querySelector('select');
      if (list) list.disabled = !on;
    }

    // ---- Settings: the camera (Joshua, 2026-11-17: "adjust the default zoom for 3rd person as well as FOV for both")
    // A slider for each, its value written beside it; each takes hold at once and is remembered on this device.
    const sliderRow = <K extends 'fovThird' | 'fovFirst' | 'eyeForward' | 'eyeHigher' | 'lookSensitivity' | 'moveSensitivity' | 'zoomThird' | 'tableHeight' | 'skinShine'>(label: string, key: K, least: number, most: number, step: number, show: (v: number) => string): void => {
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
    // ---- Settings: her pregnancy, to test (Joshua, 2026-11-19; heroine/pregnancyPlan.ts) --------------------------
    // On or off; her belly on a slider (10-150%, or all of 0-200% once unlocked, as in the Character Builder), with the
    // week it stands for beside it; and the time lapse from week 12 to her delivery week, a day a second.
    element('h2', 'gd-settings-part', settings, 'PREGNANCY');
    this.pregnantSelect = choiceRow('Pregnancy', 'pregnant', [['On', 'on'], ['Off', 'off']], 'On: her belly stands for a week of her pregnancy (her chart in the Character Builder: 10% is week 12, 150% week 42), her baby kicks, and she tires sooner as it grows.').querySelector('select');
    if (options.bellyText) this.bellyTextOf = options.bellyText;
    {
      const line = element('label', 'gd-choice gd-slider gd-belly', settings);
      element('span', '', line, 'Belly');
      const lock = element('button', 'gd-button gd-lock', line, options.graphics.bellyUnlocked ? '🔓' : '🔒');
      lock.title = 'Unlock the full 0-200% range';
      const value = element('b', '', line);
      const slider = element('input', '', line);
      slider.type = 'range';
      slider.step = '1';
      const setRange = (open: boolean): void => {
        slider.min = String(open ? BELLY_RANGE.unlockedLeast : BELLY_RANGE.least);
        slider.max = String(open ? BELLY_RANGE.unlockedMost : BELLY_RANGE.most);
        lock.textContent = open ? '🔓' : '🔒';
      };
      setRange(options.graphics.bellyUnlocked);
      const start = options.graphics.belly ?? BELLY_RANGE.least;
      slider.value = String(start);
      value.textContent = this.bellyTextOf(start);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        value.textContent = this.bellyTextOf(v);
        options.onGraphicsChange('belly', v);
        refreshOutfits();
      });
      tapButton(lock, () => {
        const open = !options.graphics.bellyUnlocked;
        setRange(open);
        options.onGraphicsChange('bellyUnlocked', open);
        // (locked again with her belly outside 10-150%: it is brought inside)
        const v = Number(slider.value);
        if (!open && (v < BELLY_RANGE.least || v > BELLY_RANGE.most)) {
          const kept = Math.max(BELLY_RANGE.least, Math.min(BELLY_RANGE.most, v));
          slider.value = String(kept);
          value.textContent = this.bellyTextOf(kept);
          options.onGraphicsChange('belly', kept);
        }
      });
      // (the lock is a button inside the row's label: a tap on it must not also move the slider)
      lock.addEventListener('click', (event) => event.preventDefault());
      this.bellySlider = slider;
      this.bellyValue = value;
    }
    if (options.onTimeLapse) {
      const row = element('div', 'gd-debug-row', settings);
      this.lapseButton = element('button', 'gd-button', row, 'Time lapse ▶ week 12 → 42');
      tapButton(this.lapseButton, () => options.onTimeLapse?.());
      element('small', 'gd-note', settings, 'Plays her pregnancy from week 12 to week 42 at a day a second (a week every 7 s; 3 min 44 s), and stops at 42. Close Settings to watch; tap the week at the top of the screen to stop.');
    }

    // ---- Settings: her skin's shine (Joshua, 2026-11-19: "dry skin a little darker, more oily or wet skin ... the shine")
    sliderRow('Skin shine', 'skinShine', 0, 100, 1, (v) => (v < 15 ? 'dry' : v > 40 ? 'oily' : 'natural') + ` ${v}`);
    element('small', 'gd-note', settings, 'How shiny her bare skin is: dry (matte, a little darker) to oily (glossy). Water makes her wet up to where it came: shiny at once, for 2 minutes, then drying over 30 s (Get wet in TEST TOOLS to try it).');
    element('h2', 'gd-settings-part', settings, 'CAMERA');
    // (Joshua, 2026-11-21: "make movement and camera sensitivity adjustable in settings... then I can tweak both")
    sliderRow('Camera sensitivity', 'lookSensitivity', SENSITIVITY_RANGE.least, SENSITIVITY_RANGE.most, 5, (v) => `${v}%`);
    sliderRow('Move stick sensitivity', 'moveSensitivity', SENSITIVITY_RANGE.least, SENSITIVITY_RANGE.most, 5, (v) => `${v}%`);
    element('small', 'gd-note', settings, 'Camera: how far a drag or the camera stick turns the view (100% was the old speed). Move stick: above 100% each ring (walk, jog, run, sprint) comes with less of a push, below it with more.');
    sliderRow('3rd person FOV', 'fovThird', FOV_RANGE.least, FOV_RANGE.most, 1, (v) => `${v}°`);
    sliderRow('1st person FOV', 'fovFirst', FOV_RANGE.least, FOV_RANGE.most, 1, (v) => `${v}°`);
    // (Joshua, 2026-11-20: "add an offset forward/back... slider and I can adjust in the game and then share the exact
    //  offset": the first-person camera sits on her head just clear of her face; this moves it forward or back)
    sliderRow('1st person eye forward', 'eyeForward', EYE_RANGE.least, EYE_RANGE.most, 0.5, (v) => `${v > 0 ? '+' : ''}${v} cm`);
    sliderRow('1st person eye height', 'eyeHigher', EYE_HEIGHT_RANGE.least, EYE_HEIGHT_RANGE.most, 0.5, (v) => `${v > 0 ? '+' : ''}${v} cm`);
    element('small', 'gd-note', settings, 'The first-person camera rides on her head at her eyes (0, 0). Forward (+) or back (-) along her face, and up (+) or down (-), in centimetres; tell Claude the numbers you like.');
    sliderRow('3rd person zoom', 'zoomThird', ZOOM_MIN, 1, 0.005, (v) => `${thirdPersonDistance(v).toFixed(1)} m`);
    element('small', 'gd-note', settings, 'Field of view: how wide each view sees (50-120°). Zoom: how far behind her the 3rd person camera starts (1.6 m to 23 m); pinch to zoom in play.');
    // ---- Settings: the weapon table (Joshua, 2026-11-17: "how can you adjust the table height") ----------------
    element('h2', 'gd-settings-part', settings, 'WEAPON TABLE');
    sliderRow('Table height', 'tableHeight', TABLE_RANGE.least, TABLE_RANGE.most, 0.01, (v) => `${Math.round(v * 100)} cm`);
    element('small', 'gd-note', settings, 'Low tables have her squat or kneel to reach her guns; the floor, kneel or squat at random.');
    // ---- Settings: test tools (the dome's buttons used to sit in the readout, in the corner) -------------------------
    // ---- Settings: food and drink, to test (Joshua, 2026-11-19: "adding food and drink next with different sizes/amounts
    // to choose from to watch how the food adds, maybe a manual hungry button or quick drain"; main.ts `intake`) ------
    element('h2', 'gd-settings-part', settings, 'FOOD & DRINK');
    const intakeRow = (items: readonly (readonly [string, IntakeAction])[]): void => {
      const row = element('div', 'gd-debug-row', settings);
      for (const [label, action] of items) tapButton(element('button', 'gd-button', row, label), () => options.onIntake?.(action));
    };
    intakeRow([['Snack bar 150 mL', 'snack'], ['Small meal 400 mL', 'smallMeal'], ['Full meal 700 mL', 'fullMeal']]);
    intakeRow([['Sip 100 mL', 'sip'], ['Bottle 500 mL', 'bottle'], ['Canteen 1 L', 'canteen']]);
    intakeRow([['Make hungry', 'hungry'], ['Make thirsty', 'thirsty'], ['Bathroom', 'bathroom']]);
    // (to test THE BATHROOM BAR and the 🚽 button: her bladder to the urge, 350 mL, or a strong urge, 520 mL)
    intakeRow([['Need to go', 'needToGo'], ['Must go now', 'mustGo']]);
    element('small', 'gd-note', settings, 'Close Settings to watch: she eats or drinks over a few seconds and her food or water bar and her belly rise with it. Make hungry / thirsty: her bar to 25%. Bathroom: she squats for 5 s and her bladder is emptied (until there is a toilet). The full readout shows her stomach and bladder.');
    choiceRow('Body clock', 'bodyClock', [['1x (real time)', 1], ['6x (1 h = 6 h)', 6], ['15x (as it was)', 15], ['60x (fast test)', 60]], 'How fast her stomach empties and her bladder fills: game hours for each real hour.');
    element('h2', 'gd-settings-part', settings, 'TEST TOOLS');
    const tools = element('div', 'gd-debug-row', settings);
    const tool = (label: string, action: DomeDebugAction) => tapButton(element('button', 'gd-button', tools, label), () => options.onDomeDebug(action));
    tool('Hit dome -25', 'hit');
    tool('Shatter', 'shatter');
    tool('Repair all', 'repair-all');
    tool('Get wet', 'wet');

    this.setView('third');
  }

  /** The CAM button's word: the camera style now. */
  setCameraStyle(name: string): void {
    // (the style's name in small letters under CAM; the button itself is never rebuilt)
    const text = name.toUpperCase();
    if (text !== this.camText) { const small = this.camButton.querySelector('small'); if (small) small.textContent = text; this.camText = text; }
  }

  /** Each gun's rounds (null: no gun in that hand), and whether a gun just clicked empty. */
  setAmmo(left: number | null, right: number | null, empty: boolean): void {
    const text = `L ${left ?? '–'} · R ${right ?? '–'}`;
    if (text !== this.ammoText) { this.ammo.textContent = text; this.ammoText = text; }
    this.ammo.classList.toggle('is-empty', empty || (left === 0 && right === 0));
  }

  /** THE RAIL's HOLSTER button: shown with this word (HOLSTER, DRAW), or hidden (null). */
  /** Her stance for the CROUCH and PRONE buttons: the one she is asked to be in, and whether Pregnancy is on. */
  setStance(stance: 'stand' | 'crouch' | 'prone' | 'fours', pregnant: boolean): void {
    const key = `${stance}${pregnant}`;
    if (key === this.stanceShown) return;
    this.stanceShown = key;
    this.crouchButton.classList.toggle('is-on', stance === 'crouch');
    this.proneButton.classList.toggle('is-on', stance === 'prone' || stance === 'fours');
    this.proneButton.textContent = pregnant ? 'ALL 4s' : 'PRONE';
  }

  setHolster(label: string | null): void {
    this.holsterButton.hidden = label === null;
    if (label !== null && label !== this.holsterLabel) { (this.holsterButton.firstChild as HTMLElement).textContent = label; this.holsterLabel = label; }
    this.showHands();
  }

  /** THE BATHROOM BUTTON: hidden (null), shown at her urge (1), shown pulsing when it is strong (2). */
  setBathroom(urge: 0 | 1 | 2 | null): void {
    this.bathroomButton.hidden = !urge;
    this.bathroomButton.classList.toggle('is-strong', urge === 2);
  }

  /** THE RAIL's RELOAD button: shown when a reload would do something (at the table, or from her belt). */
  setReload(show: boolean): void { this.reloadButton.hidden = !show; }

  /** THE RAIL's AUTO / MANUAL button: the mode she is in now (what tapping it changes). */
  setAimMode(auto: boolean): void {
    const word = auto ? 'AUTO' : 'MANUAL';
    if (word === this.aimModeLabel) return;
    this.aimModeLabel = word;
    (this.aimModeButton.firstChild as HTMLElement).textContent = word;
    this.aimModeButton.classList.toggle('is-auto', auto);
  }

  /** THE PROMPT: shown with this word (PUT DOWN, PICK UP, GRAB POLE, LET GO...), or hidden (null). */
  setPrompt(label: string | null): void {
    this.prompt.hidden = label === null;
    if (label !== null && label !== this.promptLabel) { this.prompt.textContent = label; this.promptLabel = label; }
    this.showHands();
  }

  /** L and R show only while an action they apply to does (HOLSTER, or the prompt); hidden, the pick is let go. */
  private showHands(): void {
    const show = !this.holsterButton.hidden || !this.prompt.hidden;
    this.handsBox.hidden = !show;
    if (!show && this.pickedHand) this.pickHand(null);
  }

  /** Pick the hand for the next action (null: both); its button is lit. */
  private pickHand(hand: 'left' | 'right' | null): void {
    this.pickedHand = hand;
    this.handButtons.left.classList.toggle('is-on', hand === 'left');
    this.handButtons.right.classList.toggle('is-on', hand === 'right');
  }

  /** The hand an action is for: the one picked (then the pick is let go), or both. */
  private takeHand(): 'both' | 'left' | 'right' {
    const hand = this.pickedHand ?? 'both';
    this.pickHand(null);
    return hand;
  }

  /** The one line under her vitals card: FPS and version. */
  setFps(text: string): void { if (this.fpsLine.textContent !== text) this.fpsLine.textContent = text; }

  /** Show the controls that belong to the current view. */
  /**
   * @param manual  she is aimed and fired by hand: always in first person; in third person when auto-fire is off
   *                (Joshua, 2026-11-18: then the camera is over her shoulder, with the crosshair)
   */
  setView(mode: ViewMode, manual = mode === 'first'): void {
    const first = mode === 'first';
    // The MOVE stick and FIRE are there in every view (FIRE always: Joshua, 2026-11-18); the CAMERA stick and the
    // crosshair when she is aimed by hand, and always in first person (on her own there, the stick looks round)
    this.lookStick.hidden = !(manual || first);
    this.crosshair.hidden = !(manual || first);
    // (the camera styles are for third person, aimed on her own or by hand: by hand there are a few, and the camera goes
    //  over her shoulder while she aims and fires: main.ts MANUAL_CAMERA_STYLES)
    this.camButton.hidden = first;
    // The button names the view it switches TO.
    this.viewName.textContent = first ? '3rd' : '1st';

    // THE MOVE STICK IS NOT LET GO OF (Joshua, 2026-11-17: he wants to change view while moving). It is in both
    // views and the thumb is still on it, so it keeps what the thumb is telling it and her pace carries straight
    // through the switch. (It used to be zeroed here, which stopped her dead each time the view changed.)
    // Only what is now hidden is let go of, because a hidden control cannot be let go of by a finger.
    if (this.lookStick.hidden) this.releaseLookStick();
  }

  /** The readout's text: FPS, triangles and the rest, one short line each (debug only). */
  setReadout(text: string): void {
    this.readout.textContent = text;
  }

  /** Show or hide the full readout ("Show full readout" in Settings), at once. */
  setDebug(on: boolean): void {
    this.debugPanel.hidden = !on;
    if (on) this.placeReadout();
  }

  /** Which dome section the test buttons act on, and its health (debug only). */
  /**
   * HER BELLY changed by the game (the time lapse): the slider and its value follow, and the chip at the top shows the
   * week (`lapse` true) or goes away. The time lapse's button says Play or Stop.
   */
  showBelly(percent: number, lapse: string | null, pregnant?: boolean): void {
    const p = Math.round(percent);
    if (this.pregnantSelect && pregnant !== undefined) this.pregnantSelect.value = pregnant ? '0' : '1'; // (the list's On, Off)
    if (this.bellySlider && this.bellySlider.value !== String(p)) this.bellySlider.value = String(p);
    if (this.bellyValue) this.bellyValue.textContent = this.bellyTextOf(p);
    this.lapseChip.hidden = lapse === null;
    if (lapse !== null) this.lapseChip.textContent = `⏱ ${lapse} · ${p}%  ■`;
    if (this.lapseButton) this.lapseButton.textContent = lapse === null ? 'Time lapse ▶ week 12 → 42' : 'Stop the time lapse ■';
  }

  /**
   * The crosshair hidden while the camera is not behind her (aimed by hand in follow or a side view: there it would sit
   * on her, and FIRE brings the camera over her shoulder first), shown again when it is. Only ever hides it.
   */
  setCrosshairAway(away: boolean): void {
    this.crosshair.classList.toggle('is-away', away);
  }

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

  /** Where a card (her vitals) can be put: the top left corner (the FPS line goes under it). */
  topSlot(): HTMLElement {
    if (!this.slot) {
      this.slot = element('div', 'gd-top-slot', this.root);
      this.slot.appendChild(this.fpsLine);
      // The readout keeps clear of whatever is put here. A "ResizeObserver" tells us whenever the screen or the
      // card changes size (the phone is turned, the card is first filled in), and the readout is placed again.
      if (typeof ResizeObserver !== 'undefined') {
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
    if (!slot) return;
    // (Joshua's layout, 2026-11-18: her card and the FPS line are in the top left corner; the full readout goes
    //  right under them, no wider than the card's own corner)
    panel.style.left = `${slot.offsetLeft}px`;
    panel.style.top = `${slot.offsetTop + slot.offsetHeight + READOUT_GAP}px`;
    panel.style.maxWidth = '260px';
  }

  /** Let go of the CAMERA stick (used when the view changes and it is hidden, perhaps under a thumb). */
  private releaseLookStick(): void {
    this.lookStickKnob.style.transform = '';
    this.controls.lookStickX = 0;
    this.controls.lookStickY = 0;
  }
}
