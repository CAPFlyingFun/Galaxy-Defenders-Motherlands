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
import { textureSizesOffered } from '../core/textureSizes';
import { toGameX, toGameY } from '../core/orientation';
import './hud.css';
import type { Controls } from '../input/controls';
import type { ViewMode } from '../camera/cameraRig';
import { GROUND_COLOURS, GROUND_KINDS, groundColoursNow, type GroundKind } from '../world/island/groundPaint';
import { EYE_HEIGHT_RANGE, EYE_RANGE, FOV_RANGE, SENSITIVITY_RANGE, OUTFIT_CHOICES, CATSUIT_NECKS, LANDSCAPING_CHOICES, GROUND_CHOICES, ISLAND_GRID_CHOICES, SKY_CHOICES, GAME_SPEED_CHOICES, SKY_EVENT_CHOICES, TABLE_RANGE, outfitLook, type HeroineSettings } from '../heroine/heroineSettings';
import { BELLY_RANGE } from '../heroine/pregnancyPlan';
import { ZOOM_MIN, thirdPersonDistance } from '../camera/cameraRig';
import { TARGET_FPS } from '../heroine/fast/autoDetail';
import { PACE_TUNING } from '../input/pace';
import { DETAILS } from '../heroine/fast/detailLevels';
import { clearAndStartFresh } from '../core/freshStart';

/** What the dome test buttons can ask for. */
export type DomeDebugAction = 'hit' | 'shatter' | 'repair-all' | 'wet';
/** What Settings -> FOOD & DRINK can do (main.ts `intake`). */
export type IntakeAction = 'snack' | 'smallMeal' | 'fullMeal' | 'sip' | 'bottle' | 'canteen' | 'hungry' | 'thirsty' | 'needToGo' | 'needToGo2' | 'mustGo' | 'bathroom' | 'tired' | 'sleep8';

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
  /** The 🔄 button: play the other character (Blaze or John). */
  onSwap?(): void;
  /** THE 🔦 LIGHT button (the story's flashlight, v0.2.153): switched off or on. */
  onLight?(): void;
  /** A button in Settings -> FOOD & DRINK. */
  onIntake?(action: IntakeAction): void;
  /**
   * HER PREGNANCY, to test (heroine/pregnancyPlan.ts): what her belly percent is as a week ("week 24", or "not
   * pregnant"), and her belly moved ONE STORY STEP (`by` +1 as she grows, -1 as she settles after the birth): the
   * same step a quest or an event takes (main.ts `stepBelly`).
   */
  bellyText?(percent: number): string;
  onBellyStep?(by: number): void;
  /**
   * TEST TOOLS -> Ground colours (v0.2.166): a kind of ground's base (0) or accent (1) colour changed, as hex; or all
   * back to the approved palette (`kind` null). Live on the island; remembered on this phone.
   */
  onGroundColour?(kind: GroundKind | null, which: 0 | 1, hex: string): void;
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
function tapButton(button: HTMLElement | SVGElement, tap: () => void): void {
  let answeredAt = -Infinity;
  // (a picture's piece, an SVG element, can be a button too: the top pace's sections. Its events are typed as plain
  //  events, so each is read as the pointer or mouse event it is)
  button.addEventListener('pointerdown', (e) => {
    const event = e as PointerEvent;
    if (event.pointerType === 'mouse' && event.button !== 0) return; // only the mouse's main button
    answeredAt = performance.now();
    tap();
  });
  button.addEventListener('click', (e) => {
    const event = e as MouseEvent;
    // `detail` counts the presses of a real tap or mouse click (1, 2...); it is 0 for a click nothing pressed.
    if (event.detail === 0 && performance.now() - answeredAt > SAME_TAP_MS) tap();
  });
}

/** The top pace's four choices, slowest first (input/pace.ts PACES). */
const PACE_CAP_NAMES = ['WALK', 'JOG', 'RUN', 'SPRINT'] as const;
/**
 * THE TOP PACE'S CURVE OVER THE MOVE STICK (v0.2.169; GAME TUNING). Measured in px at the stick's own size (200 px
 * across, its middle at 0, 0: hud.css `.gd-walk-stick`), and angles in degrees round its middle as a clock's hands are not: 0 to its right,
 * 90 straight up, going round to the left (as in school maths). The curve is drawn in a picture sized as a share of
 * the stick (`.gd-pace-arc`), so a stick made bigger or smaller (Edit controls) takes the curve with it.
 *   inner, outer  the band's edges from the stick's middle (the stick's own edge is 100 + its 2 px border). v0.2.170:
 *                 BIGGER, 40 px deep (was 26; Joshua: "the buttons are a touch too small", his pick "B", the curve
 *                 made bigger)
 *   from, to      where the band begins and ends. v0.2.170: TURNED ABOUT 60 DEGREES CLOCKWISE (his "B, but rotated
 *                 it all clockwise about 60°"), round the stick's RIGHT side, from just right of straight up (where
 *                 the lock's lane rises: LOCK_LANE) to below the stick's middle on its right. Nothing of it is left of
 *                 the stick (the phone's camera cutout is there on his layout). The CAMERA stick beside it is set
 *                 further over (hud.css, its --gap) so the two do not meet.
 *   gap           the space between two sections
 *   share         each section's share of the band, by its word's length (SPRINT needs the most room)
 */
const PACE_ARC = { inner: 106, outer: 146, from: 77, to: -45, gap: 2.5, share: [6, 5, 5, 8] } as const;
/** The stick's own size the curve is measured at, px (hud.css `.gd-walk-stick` width). */
const PACE_ARC_STICK = 200;
/** The picture's half-size, px at that size: it reaches the band's outer edge with a little to spare. */
const PACE_ARC_HALF = 150;

/**
 * THE LOCK'S LANE (v0.2.170; Joshua, 2026-11-24, his pick #1, TRADDOMIUM's first version, `legacy/v0-main`
 * src/input/autoRun.ts): push the MOVE stick up PAST ITS RIM and a lane of chevrons rises from its top with a 🔒 at
 * its end; let go ON the lock and she runs ahead by herself (Controls `autoRun`). Its rules, kept:
 *   - a full push ahead never locks it: there has to be travel past the rim (`from`);
 *   - reaching the lock only gets it READY; the lock happens when the thumb is lifted there, so sliding back out of
 *     it is a free change of mind;
 *   - only a push that is roughly UP counts (within `cone` degrees of straight up): a hard drag to the side past the
 *     rim is a big push to the side, not a lock.
 * Distances are in the stick's own radius (its middle to its edge: MOVE_TRAVEL at its own size), so a stick made
 * bigger or smaller in Edit controls keeps them. TRADDOMIUM's lock was at 1.9 radii of a 64 px stick (122 px); ours
 * is 100 px across its middle-to-edge, so 1.55 (155 px, 116 on Joshua's 75 % stick). GAME TUNING.
 */
const LOCK_LANE = { from: 1.1, lock: 1.55, cone: 35 } as const;

/**
 * The lock's lane: a column over the stick's top, three chevrons and the 🔒 at its end, unseen until a thumb pushes
 * past the rim (a ladder up the side of the screen all the time was what TRADDOMIUM's earlier build got wrong). A child
 * of the stick, sized as shares of it (hud.css `.gd-lock-lane`), so it moves and scales with it. Takes no touch: the
 * stick holds the thumb (pointer capture) wherever it goes.
 */
function makeLockLane(stick: HTMLElement): { lane: HTMLElement; chevrons: HTMLElement[] } {
  const lane = element('div', 'gd-lock-lane', stick);
  element('span', 'gd-lock-lane-lock', lane, '🔒');
  const chevrons = [0, 1, 2].map(() => element('span', 'gd-lock-lane-chevron', lane, '▲'));
  return { lane, chevrons };
}

/**
 * Where a thumb is in the lock's lane, from how far it is from the stick's middle in the stick's own radii (x right,
 * y UP; past the rim too, the stick holds the thumb wherever it goes): 'none' inside the rim's margin or off to the
 * side, 'arming' in the lane, 'ready' in the lock. TRADDOMIUM's `laneAt`.
 */
function laneAt(x: number, y: number): 'none' | 'arming' | 'ready' {
  const reach = Math.hypot(x, y);
  if (reach < LOCK_LANE.from) return 'none';
  if (y / reach < Math.cos((LOCK_LANE.cone * Math.PI) / 180)) return 'none';
  return reach >= LOCK_LANE.lock ? 'ready' : 'arming';
}

/** A point on a circle round the stick's middle, as the picture is laid out (y down): angle in degrees, as PACE_ARC.
 *  (Angles under 0 are below the stick's middle: the turned curve of v0.2.170 runs down to -45.) */
function arcPoint(radius: number, degrees: number): string {
  const a = (degrees * Math.PI) / 180;
  return `${(radius * Math.cos(a)).toFixed(2)} ${(-radius * Math.sin(a)).toFixed(2)}`;
}

/**
 * THE TOP PACE, FOUR CURVED SECTIONS OVER THE MOVE STICK (Joshua, 2026-11-24: "layout the speed selectors as a curve
 * that matches the size or link it to the joystick so it's all together in one"; his mockup pick): drawn as a child of
 * the stick, so it moves and scales with it. Each section is a piece of a ring (two arcs joined at their ends), its word
 * written along the ring's middle (`textPath`). Returns the picture and its four sections (WALK first).
 */
function makePaceArc(stick: HTMLElement): { arc: SVGSVGElement; sections: SVGGElement[] } {
  const SVG = 'http://www.w3.org/2000/svg';
  const arc = document.createElementNS(SVG, 'svg');
  arc.setAttribute('class', 'gd-pace-arc');
  arc.setAttribute('viewBox', `${-PACE_ARC_HALF} ${-PACE_ARC_HALF} ${PACE_ARC_HALF * 2} ${PACE_ARC_HALF * 2}`);
  // (sized and placed as shares of the stick, so it scales with it: the CSS reads these two numbers)
  arc.style.setProperty('--arc-size', `${((PACE_ARC_HALF * 2) / PACE_ARC_STICK) * 100}%`);
  arc.style.setProperty('--arc-at', `${(-(PACE_ARC_HALF * 2 - PACE_ARC_STICK) / 2 / PACE_ARC_STICK) * 100}%`);
  const { inner, outer, from, to, gap, share } = PACE_ARC;
  const middle = (inner + outer) / 2;
  const total = share.reduce((a, b) => a + b, 0);
  const room = from - to - gap * (share.length - 1);   // (the degrees left for the sections themselves)
  let start = from;
  const sections = PACE_CAP_NAMES.map((name, i) => {
    const end = start - (room * share[i]) / total;
    const g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', 'gd-pace-seg');
    // the section: along the outer edge clockwise (sweep 1), in to the inner edge, back along it, and closed
    const shape = document.createElementNS(SVG, 'path');
    shape.setAttribute('class', 'gd-pace-seg-shape');
    shape.setAttribute('d', `M${arcPoint(outer, start)} A${outer} ${outer} 0 0 1 ${arcPoint(outer, end)} L${arcPoint(inner, end)} A${inner} ${inner} 0 0 0 ${arcPoint(inner, start)} Z`);
    g.appendChild(shape);
    // its word, along the band's middle (an unseen path for the text to follow), centred, a third of a letter down
    const id = `gd-pace-arc-${i}`;
    const line = document.createElementNS(SVG, 'path');
    line.setAttribute('id', id);
    line.setAttribute('d', `M${arcPoint(middle, start)} A${middle} ${middle} 0 0 1 ${arcPoint(middle, end)}`);
    line.setAttribute('fill', 'none');
    g.appendChild(line);
    const text = document.createElementNS(SVG, 'text');
    text.setAttribute('class', 'gd-pace-seg-text');
    text.setAttribute('dy', '0.35em');
    const along = document.createElementNS(SVG, 'textPath');
    along.setAttribute('href', `#${id}`);
    along.setAttribute('startOffset', '50%');
    along.setAttribute('text-anchor', 'middle');
    along.textContent = name;
    text.appendChild(along);
    g.appendChild(text);
    arc.appendChild(g);
    start = end - gap;
    return g;
  });
  stick.appendChild(arc);
  return { arc, sections };
}

/** The bellies every outfit is pictured at for Settings (public/thumbs/; the one nearest hers is shown). */
const THUMB_BELLIES = [10, 50, 80, 120, 150] as const;

/** An hour of the day (0-24, with fractions) as a 24-hour clock: 13.25 -> "13:15". */
function clockText(hour: number): string {
  const minutes = Math.round(hour * 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly stickRings: HTMLElement[];
  private readonly paceLabel: HTMLElement;
  /** The top pace's curve over the MOVE stick, and its four sections (WALK, JOG, RUN, SPRINT). */
  private readonly paceArc: SVGSVGElement;
  private readonly paceCapOptions: SVGGElement[];
  /** The lock's lane over the MOVE stick (LOCK_LANE), where the thumb is in it now, and what the knob shows locked. */
  private readonly lockLane: HTMLElement;
  private laneNow: 'none' | 'arming' | 'ready' = 'none';
  private shownLocked = false;
  /** A thumb is on the MOVE stick now (the knob is its to place). */
  private moveHeld = false;
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
  /** 🔄 SWAP CHARACTER (Joshua, 2026-11-21: "a 🔄 swap character... like how Beyond Extinction does it"; "Next to the Settings is good"). */
  private readonly swapButton: HTMLElement;
  /** A short note in the middle of the top of the screen ("Now playing: John"), gone after a couple of seconds. */
  private readonly notice: HTMLElement;
  private noticeTimer = 0;
  private readonly aimModeButton: HTMLElement;
  /** 🔦 LIGHT on the rail: the story's flashlight (only where there is one: the prologue). */
  private readonly lightButton: HTMLElement;
  private lightShown: boolean | null = null;
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
  /** THE PREGNANCY rows in Settings: the belly slider and its value. */
  private bellySlider: HTMLInputElement | null = null;
  private pregnantSelect: HTMLSelectElement | null = null;
  private bellyValue: HTMLElement | null = null;
  /** Settings -> WORLD -> Time of day: its slider and value, which follow the clock while a day cycle runs. */
  private skyHourSlider: HTMLInputElement | null = null;
  private skyHourValue: HTMLElement | null = null;
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
    // Her pace in words, over the stick: WALK, JOG, RUN or SPRINT. (Kept for the Visual body and old layouts, but
    // hidden since v0.2.164: the TOP PACE row below sits where it was and shows her pace itself.)
    this.paceLabel = element('span', 'gd-pace', this.stick);
    // THE TOP PACE (Joshua's handoff, 2026-11-23: "Keep the existing five-ring dynamic joystick; add a tappable
    // maximum-pace selector (Walk / Jog / Run / Sprint)"): the one chosen lit GOLD, the pace she is at now ringed in
    // teal (`setPace`), as the word over the stick used to say it; winded, all dimmed. The stick pushed to its edge
    // builds up to the chosen one and no further (input/pace.ts `ceiling`); the rings work as ever below it.
    // SINCE v0.2.169 A CURVE OVER THE STICK, PART OF IT (Joshua, 2026-11-24, `makePaceArc`): it moves and scales with
    // the stick in Edit controls (no control of its own any more: "Top pace" left the list, a place saved for it is
    // never read). It was a row of four over the stick, wider than it, so on his layout WALK hung past the stick's left
    // side under the phone's camera cutout.
    const paceArc = makePaceArc(this.stick);
    this.paceArc = paceArc.arc;
    this.paceCapOptions = paceArc.sections.map((section, i) => {
      // (a section is inside the stick: its touch must not ALSO grab the stick and move her)
      section.addEventListener('pointerdown', (event) => event.stopPropagation());
      tapButton(section, () => {
        this.setPaceCap(i + 1);
        options.onGraphicsChange('paceCap', i + 1);
      });
      return section;
    });
    this.setPaceCap(options.graphics.paceCap);
    // THE LOCK'S LANE (LOCK_LANE): it rises from the stick's top while the thumb pushes up past the rim
    this.lockLane = makeLockLane(this.stick).lane;
    this.stickKnob = element('div', 'gd-stick-knob', this.stick);
    this.wireStick(this.stick, this.stickKnob, (x, y) => {
      controls.stickX = x;
      controls.stickY = y;
    }, MOVE_TRAVEL, {
      reach: (x, y) => { this.moveHeld = true; this.showLane(laneAt(x, y)); },
      // (lifted IN the lock: she runs on by herself; lifted anywhere else, nothing; the knob is the lock's to place)
      lift: () => {
        this.moveHeld = false;
        if (this.laneNow === 'ready') controls.autoRun = true;
        this.showLane('none');
        this.shownLocked = !controls.autoRun;   // (so the next setPace places the knob as the lock has it)
      },
    });

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
    // 🔦 LIGHT (v0.2.153, the prologue: Joshua's draft, "introduce movement, flashlight, and inspect/scan controls"):
    // where HOLSTER is on the other maps (the story hides the guns' buttons); lit while the flashlight is on
    this.lightButton = railButton('gd-rail-light', '🔦', 'LIGHT', 'Flashlight on or off');
    this.lightButton.hidden = true;
    tapButton(this.lightButton, () => options.onLight?.());
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
    // 🔄 SWAP CHARACTER: left of the gear (Joshua: "Next to the Settings is good. I can always move it": Edit controls).
    // Shown once there is someone to swap to. Tapped: the camera, the sticks and the vitals card go to the other one,
    // and the one left behind stays standing where they were (main.ts `swapCharacter`).
    this.swapButton = element('button', 'gd-button gd-swap', this.root, '🔄');
    this.swapButton.setAttribute('aria-label', 'Swap character');
    this.swapButton.hidden = true;
    tapButton(this.swapButton, () => options.onSwap?.());
    this.notice = element('div', 'gd-notice', this.root);
    this.notice.hidden = true;
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
    choiceRow('Map', 'map', [['Island (Beyond Extinction\'s, true scale)', 'island'], ['Domed town (test)', 'town'], ['Prologue: John beneath the island (story)', 'prologue'], ['The Fishers\' home (AI brain test)', 'home']], 'The island is the main map; the domed town is kept to test in until its place on the island is chosen; the prologue is the story\'s opening (John only, Scene 1 so far); the home is the Fishers\' house, where the AI brain will live (3 bedrooms, 2 bathrooms, sliding doors). Changing it reloads the game.');
    // TEXTURE SIZES (v0.2.148, core/textureSizes.ts): the largest side of a picture on the graphics chip; each step a
    // quarter of the memory of the one above; 4096 only on a computer (a phone is never offered what would close it)
    const sizeChoices = textureSizesOffered().map((s) => [String(s), s] as const);
    choiceRow('World textures', 'worldTextures', sizeChoices, 'The largest the island\'s ground, river, tree and bark pictures, her suit\'s fabric and the skin\'s pores are drawn (pixels; each step down is a quarter of the memory). The sky and the coastline stay as they are; the shadows are 1024 at 512 and under, 2048 above. It changes while you play.');
    choiceRow('Ground', 'ground', GROUND_CHOICES, 'Solid colours: the island\'s own palette, with a fine pattern near you that fades to plain colour further off; no pictures to download, lighter for the phone. Textures: the ground pictures as before. Changes at once.');
    // THE SKY (v0.2.167; Joshua, 2026-11-24: "let's create a procedural sky as it gives up more options and saves
    // textures/memory. It can be as a separate option in settings"; world/island/proceduralSky.ts)
    choiceRow('Sky', 'sky', SKY_CHOICES, 'Procedural: the sky drawn by code with a time of day: sun, moon and stars, clouds, sunrise and sunset, and the sky events below; the light, the haze and the sea follow it. Nothing to download. Picture: the daytime sky picture as before. Changes at once.');
    {
      // (its own slider here, the time of day: the game clock's hour; it follows the clock as it runs: `setSkyHour`)
      const line = element('label', 'gd-choice gd-slider', settings);
      element('span', '', line, 'Time of day');
      const value = element('b', '', line, clockText(options.graphics.skyHour));
      const slider = element('input', '', line);
      slider.type = 'range';
      slider.min = '0'; slider.max = '24'; slider.step = '0.25';
      slider.value = String(options.graphics.skyHour);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        value.textContent = clockText(v);
        options.onGraphicsChange('skyHour', v);
      });
      this.skyHourSlider = slider;
      this.skyHourValue = value;
    }
    element('small', 'gd-note', settings, 'The game clock\'s hour: the sky shows it, and her body\'s day runs on it. 13:15 is the island\'s light as it has always been; the sun rises about 6:00 and sets about 18:00. Changes at once.');
    choiceRow('Game speed', 'gameSpeed', GAME_SPEED_CHOICES, 'How fast the game clock runs: game time for each real second. The sky, her stomach and bladder, her sleepiness and sleep follow it; her walk, stamina, heart and breathing stay in real time. 6x is normal play (a game day in 4 hours). Stopped holds the time still. Changes at once.');
    choiceRow('Sky event', 'skyEvent', SKY_EVENT_CHOICES, 'Clear; a tropical storm (slate clouds, dim light, haze, lightning); an aurora (curtains of light, as it gets dark); or alien bands across the sky (faint by day, bright by night). Changes at once.');
    choiceRow('Clouds', 'clouds', [['On', 'on'], ['Off', 'off']], 'A few soft clouds drifting (a storm always has them). Off is a little lighter for the phone. Changes at once.');
    choiceRow('Island grid', 'islandGrid', ISLAND_GRID_CHOICES, 'How many tiles the 56 km island is cut into: the nine round you are loaded in full. Smaller tiles load and build quicker but cover less. To compare on your phone; 16 x 16 is the default. Changing it reloads the game.');
    choiceRow('Rivers & lakes', 'rivers', [['Off', 'off'], ['On', 'on']], 'The real island\'s rivers and lakes, cut into the ground and filled. Off until the island\'s own lakes are made. Changing it reloads the game.');
    choiceRow('Landscaping', 'landscaping', LANDSCAPING_CHOICES, 'The island\'s forest, on the real island\'s own vegetation map. Images only: photo trees to 900 m. Hybrid: real 3D trees near you (solid trunks), photos beyond. Objects only: 3D trees to 280 m. Sci-fi flora: the island\'s own giant mushrooms and alien plants (some glow at night). Changes at once.');
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
    choiceRow('Character textures', 'characterTextures', textureSizesOffered().map((s) => [String(s), s] as const), 'The largest her (and John\'s) outfit, skin depth and hair pictures are drawn (pixels; each step down is a quarter of the memory). It changes while you play (a few seconds).');
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
    const sliderRow = <K extends 'fovThird' | 'fovFirst' | 'eyeForward' | 'eyeHigher' | 'lookSensitivity' | 'moveSensitivity' | 'zoomThird' | 'tableHeight' | 'skinShine' | 'soundVolume' | 'breathVolume' | 'trainFitness' | 'trainEndurance' | 'trainRecovery' | 'trainStrength'>(label: string, key: K, least: number, most: number, step: number, show: (v: number) => string): void => {
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
    // week it stands for beside it; and her belly a story step either way (+1% / -1%: Joshua, 2026-11-24, the time lapse
    // taken out, "event/quest triggers that will add +1%", "an -1% after birth").
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
    if (options.onBellyStep) {
      const row = element('div', 'gd-debug-row', settings);
      const down = element('button', 'gd-button', row, '−1% (after the birth)');
      const up = element('button', 'gd-button', row, '+1% (story event)');
      tapButton(down, () => options.onBellyStep?.(-1));
      tapButton(up, () => options.onBellyStep?.(1));
      element('small', 'gd-note', settings, 'What a quest or story event does to her belly: one percent at a time, up as she grows, down as she settles after the birth (to her 30%).');
    }

    // ---- Settings: her skin's shine (Joshua, 2026-11-19: "dry skin a little darker, more oily or wet skin ... the shine")
    sliderRow('Skin shine', 'skinShine', 0, 100, 1, (v) => (v < 15 ? 'dry' : v > 40 ? 'oily' : 'natural') + ` ${v}`);
    element('small', 'gd-note', settings, 'How shiny her bare skin is: dry (matte, a little darker) to oily (glossy). Water makes her wet up to where it came: shiny at once, for 2 minutes, then drying over 30 s (Get wet in TEST TOOLS to try it).');
    // ---- Settings: her vitals card (Joshua, 2026-11-21: two layouts to choose from, the list by default; units) ------
    element('h2', 'gd-settings-part', settings, 'HUD');
    choiceRow('Vitals shown', 'vitalsShown', [['Basics', 'basics'], ['All', 'all']], 'Basics: health, water, food and stamina; another (the bathroom near full, energy nearly gone...) takes a place while it is urgent. All: her heart, breathing and speed and all eleven stats. Changes at once.');
    choiceRow('Vitals style', 'vitalsStyle', [['List', 'list'], ['Gauges', 'gauges']], 'List: each stat as an icon, its number and its name, in two columns. Gauges: the four most important as round gauges, the rest as hexagons. An urgent one moves up into the first places. Changes at once.');
    choiceRow('Units', 'units', [['Both', 'both'], ['Imperial (mph, °F)', 'imperial'], ['Metric (km/h, °C)', 'metric']], 'Her speed and her body temperature.');
    // ---- Settings: sound (Joshua, 2026-11-21: her breathing, the game's first sound; audio/sound.ts, breathSound.ts)
    element('h2', 'gd-settings-part', settings, 'SOUND');
    sliderRow('Master volume', 'soundVolume', 0, 100, 5, (v) => (v === 0 ? 'off' : `${v}%`));
    sliderRow('Breathing volume', 'breathVolume', 0, 100, 5, (v) => (v === 0 ? 'off' : `${v}%`));
    element('small', 'gd-note', settings, 'Her breathing follows her chest, breath by breath: soft when she is calm, full when she is out of breath, quieter the farther the camera is. On an iPhone the silent switch mutes the game.');
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
    intakeRow([['Need to go', 'needToGo'], ['Need to go #2', 'needToGo2'], ['Must go now', 'mustGo']]);
    intakeRow([['Make tired', 'tired'], ['Sleep 8 hours', 'sleep8']]);
    element('small', 'gd-note', settings, 'Close Settings to watch: she eats or drinks over a few seconds and her food or water bar and her belly rise with it. Make hungry / thirsty: her bar to 25%. Bathroom: she squats for 10 s and her bladder is emptied (until there is a toilet). From 85% full the 🚽 counts down; at 0:00 she goes wherever she is. Make tired: her energy to 10% (only sleep brings it back now). Sleep 8 hours: both of them sleep and the clock jumps 8 hours (until there are beds). The full readout shows her stomach, bladder, sleepiness and fatigue.');
    element('h2', 'gd-settings-part', settings, 'TEST TOOLS');
    const tools = element('div', 'gd-debug-row', settings);
    const tool = (label: string, action: DomeDebugAction) => tapButton(element('button', 'gd-button', tools, label), () => options.onDomeDebug(action));
    tool('Hit dome -25', 'hit');
    tool('Shatter', 'shatter');
    tool('Repair all', 'repair-all');
    tool('Get wet', 'wet');
    // START FRESH (Joshua, 2026-11-22: "a manual clear local saved data from phone, so when I start again, it loads it
    // all from scratch"; core/freshStart.ts): every file the game keeps on the phone let go, then it starts again and
    // downloads everything. Two taps, so it is never done by a slip of the finger.
    {
      const fresh = element('button', 'gd-button', tools, 'Clear saved files');
      let armed = 0;
      tapButton(fresh, () => {
        if (!armed) {
          fresh.textContent = 'Tap again to clear';
          armed = window.setTimeout(() => { armed = 0; fresh.textContent = 'Clear saved files'; }, 3000);
          return;
        }
        window.clearTimeout(armed);
        fresh.textContent = 'Clearing…';
        void clearAndStartFresh();
      });
    }
    element('small', 'gd-note', settings, 'Clear saved files: everything the game keeps on this phone (its code, outfits, the builder\'s files, the island) is let go and the game starts again, downloading it all. Your settings are kept.');
    // TRAINING, TO TEST (Joshua approved the four upgrades, 2026-11-25): both characters, until they are earned
    sliderRow('Fitness', 'trainFitness', 0, 100, 1, (v) => `${v}`);
    sliderRow('Endurance', 'trainEndurance', 0, 100, 5, (v) => `${v}% · ${100 + v / 2} pts`);
    sliderRow('Recovery', 'trainRecovery', 0, 100, 5, (v) => `${v}% · +${(v * 0.3).toFixed(0)}%`);
    sliderRow('Strength', 'trainStrength', 0, 100, 5, (v) => `${v}% · hills −${(v * 0.15).toFixed(0)}%`);
    element('small', 'gd-note', settings, 'Training, for both until it is earned: Fitness (cardio, starts at 20) makes every pace easier, so she lasts longer and breathes and beats slower; at 60 a jog never empties. Endurance: a bigger stamina pool (up to 150 points). Recovery: stamina back faster (up to 30%). Strength: hills and loads up to 15% easier.');
    // GROUND COLOURS (v0.2.166; for Joshua to tune the island's palette on his phone and send the numbers): each kind of
    // ground's base and accent colour as the phone's own colour picker, live on the island; Reset puts back the
    // approved palette (world/island/groundPaint.ts GROUND_COLOURS).
    if (options.onGroundColour) {
      const box = element('div', 'gd-ground-colours', settings);
      element('span', 'gd-ground-colours-title', box, 'Ground colours (base · accent)');
      const pickers: { kind: GroundKind; which: 0 | 1; input: HTMLInputElement }[] = [];
      const now = groundColoursNow();
      for (const kind of GROUND_KINDS) {
        const row = element('label', 'gd-ground-colour', box);
        element('span', '', row, kind);
        for (const which of [0, 1] as const) {
          const input = element('input', '', row);
          input.type = 'color';
          input.value = now[kind][which].toLowerCase();
          const hexText = element('code', '', row, now[kind][which].toUpperCase());
          input.addEventListener('input', () => { hexText.textContent = input.value.toUpperCase(); options.onGroundColour?.(kind, which, input.value); });
          pickers.push({ kind, which, input });
        }
      }
      const reset = element('button', 'gd-button', box, 'Reset to the approved colours');
      tapButton(reset, () => {
        options.onGroundColour?.(null, 0, '');
        for (const p of pickers) {
          p.input.value = GROUND_COLOURS[p.kind][p.which].toLowerCase();
          (p.input.nextElementSibling as HTMLElement).textContent = GROUND_COLOURS[p.kind][p.which];
        }
      });
      element('small', 'gd-note', settings, 'The island\'s Solid colours ground: tap a colour to change it, and see it on the ground at once (close Settings to look). Kept on this phone; send Claude the codes you like. Reset puts back the approved palette.');
    }
    // (THE BRAIN'S THOUGHTS over the one standing by: Joshua, 2026-11-21, "so I can know what it's 'Thinking'")
    choiceRow('AI thoughts', 'npcThoughts', [['Show', 'on'], ['Hide', 'off']], 'A bubble over the one you are not playing (John while you play Blaze, Blaze while you play John): who, AUTO or MANUAL and their rounds; what their brain is doing now; why (🎯 its fight, 🩺 its needs); what is next; how the last order ended (✓ done, ⏸ stopped, ✗ failed and why); and their needs as it sees them (🚽 💧 🍽️ 🔋, ⚠️ danger). Changes at once.');

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
  /** Show the 🔄 button (there is someone to swap to), and what it says when pressed: the name of the one it swaps to. */
  setSwap(other: string | null): void {
    this.swapButton.hidden = other === null;
    if (other) this.swapButton.setAttribute('aria-label', `Swap to ${other}`);
  }

  /** A short note at the top of the screen for a couple of seconds ("Now playing: John"). */
  showNotice(text: string, seconds = 2.2): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => { this.notice.hidden = true; }, seconds * 1000);
  }

  setBathroom(urge: 0 | 1 | 2 | null): void {
    this.bathroomButton.hidden = !urge;
    this.bathroomButton.classList.toggle('is-strong', urge === 2);
  }

  /**
   * THE STORY'S SCREEN (v0.2.153, the prologue): John is an archaeologist on an expedition, not in a fight, so FIRE,
   * the gun buttons (HOLSTER / DRAW, RELOAD, AUTO / MANUAL, L / R) and the rounds are hidden (hud.css `.is-story`).
   */
  setStoryMode(on: boolean): void { this.root.classList.toggle('is-story', on); }

  /** 🔦 LIGHT: hidden (null), or shown lit (true) or not (false). */
  setLight(on: boolean | null): void {
    if (on === this.lightShown) return;
    this.lightShown = on;
    this.lightButton.hidden = on === null;
    this.lightButton.classList.toggle('is-on', on === true);
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
   * HER BELLY changed by the game (a story step, or the lock bringing it back into range): the slider and its value
   * follow; and her Pregnancy on or off, when given.
   */
  /** THE TIME OF DAY as the clock moves it (a day cycle running): the slider and its value follow, unless being dragged. */
  setSkyHour(hour: number): void {
    if (!this.skyHourSlider || !this.skyHourValue || document.activeElement === this.skyHourSlider) return;
    this.skyHourSlider.value = String(Math.round(hour * 4) / 4);
    this.skyHourValue.textContent = clockText(hour);
  }

  showBelly(percent: number, pregnant?: boolean): void {
    const p = Math.round(percent);
    if (this.pregnantSelect && pregnant !== undefined) this.pregnantSelect.value = pregnant ? '0' : '1'; // (the list's On, Off)
    if (this.bellySlider && this.bellySlider.value !== String(p)) this.bellySlider.value = String(p);
    if (this.bellyValue) this.bellyValue.textContent = this.bellyTextOf(p);
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
  private wireStick(stick: HTMLElement, knob: HTMLElement, write: (x: number, y: number) => void, travel = STICK_TRAVEL,
    hooks?: { reach(x: number, y: number): void; lift(): void }): void {
    const release = () => {
      knob.style.transform = '';
      write(0, 0);
      hooks?.lift();
    };
    const move = (event: PointerEvent) => {
      // How far the finger is from the middle of the stick, limited to the knob's travel.
      const box = stick.getBoundingClientRect();
      // (measured on the screen, then turned into the game's own right and down: src/core/orientation.ts)
      // A STICK MADE BIGGER OR SMALLER IN EDIT CONTROLS (v0.2.170): it is drawn scaled (layoutEditor.ts `pin`), so its
      // rim is nearer or further on the screen than `travel`; the finger is measured in the stick's OWN size, so the
      // knob stays under the finger and its rim is a full push whatever its size. (Before, on a stick at 75 % a full
      // push took a third more than the rim, past the drawn rings.)
      const scale = box.width / Math.max(1, stick.offsetWidth) || 1;
      const screenDx = (event.clientX - (box.left + box.width / 2)) / scale;
      const screenDy = (event.clientY - (box.top + box.height / 2)) / scale;
      let dx = toGameX(screenDx, screenDy);
      let dy = toGameY(screenDx, screenDy);
      // (where the thumb is before the knob is held to the rim: the lock's lane is out past it)
      hooks?.reach(dx / travel, -dy / travel);
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
    if (name !== this.shownPace) {
      this.shownPace = name;
      this.paceLabel.textContent = name;
      // (the pace she is at, ringed in the top pace row; winded, the whole row dimmed: she can only walk)
      const now = PACE_CAP_NAMES.findIndex((n) => n === name.toUpperCase());
      this.paceCapOptions.forEach((option, k) => option.classList.toggle('is-now', k === now));
      this.paceArc.classList.toggle('is-winded', name.toUpperCase() === 'WINDED');
    }
    // LOCKED (Controls `autoRun`): the 🔒 stays just over the stick, gold, and the knob rests near the stick's top edge,
    // as a thumb holding it ahead would; a thumb on the stick places the knob itself
    const locked = this.controls.autoRun;
    if (locked !== this.shownLocked) {
      this.shownLocked = locked;
      this.lockLane.classList.toggle('is-locked', locked);
      this.stick.classList.toggle('is-locked', locked);
      // (0.72 of the way up: the lock sits just over the rim, and the knob just under it)
      if (!this.moveHeld) this.stickKnob.style.transform = locked ? `translate(0px, ${-MOVE_TRAVEL * 0.72}px)` : '';
    }
    if (ring !== this.shownRing) {
      this.shownRing = ring;
      this.stickRings.forEach((circle, k) => circle.classList.toggle('is-on', k === ring - 1));
    }
  }

  /** Show where the thumb is in the lock's lane: unseen, the chevrons lighting as it goes up, or the lock ready. */
  private showLane(where: 'none' | 'arming' | 'ready'): void {
    if (where === this.laneNow) return;
    this.laneNow = where;
    this.lockLane.classList.toggle('is-arming', where === 'arming');
    this.lockLane.classList.toggle('is-ready', where === 'ready');
  }

  /** Light the top pace chosen (1 walk .. 4 sprint) on the curve over the MOVE stick. */
  setPaceCap(cap: number): void {
    this.paceCapOptions.forEach((option, k) => option.classList.toggle('is-on', k === cap - 1));
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
