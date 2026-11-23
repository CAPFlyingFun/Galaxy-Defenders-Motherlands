// ============================================================================
// vitalsPanel.ts -- the heroine's vitals on screen: her vitals card, top left.
//
// Joshua's design, 2026-11-21 (he approved each step as a drawing first):
//   "Can we add the speed and maybe more stats like fear/mood... a smart UI like maybe a mix of round, flat, and
//    plain number"; then "all the bars kind of looks too busy... icon with the same rounded bars... maybe a hexagon";
//   "use common icons like 🚽... a 👻 for fear"; "the important ones a little bigger"; "split in 3 rows"; "make the
//   top 4 round, and keep the others hexagon"; "do a layout like the left part (icon: number/%, and what it is)
//   written cleanly and we can create two layouts to choose from"; "⛑️ for health"; "Layout B as default".
//
// TWO LAYOUTS (Settings -> HUD -> Vitals style):
//   LIST (B, the default)  two columns: an emoji, a number, what it is. Her heart, breathing and speed first, then her
//                          eleven stats in priority order.
//   GAUGES (A)             her heart, breathing and speed as plain numbers on the left; on the right four ROUND gauges
//                          (the four most important) over two rows of HEXAGON gauges (four, then three tucked between
//                          them, honeycomb fashion). Each gauge's ring fills like the old bars did.
// Both show the same stats in the same order (VITALS_PRIORITY). A small stat that becomes URGENT (the bathroom from
// 85% full, her energy nearly gone...) SWAPS places with the least important of the big four until it is not, so it
// is always where the eye goes first. Anything that needs her attention pulses.
//
// Under the card, small CHIPS show only while they apply: her pregnancy week, a kick, winded, pain, hungry, thirsty.
//
// BASICS OR ALL (Joshua, 2026-11-22: "how about we keep the basics, and hide the rest or have the rest optional
// information to display"; Settings -> HUD -> Vitals shown, `setShown`): BASICS, the default, shows only the four big
// places (health, water, food, stamina, with an urgent one swapped in as above), in either layout: the list's first
// column without her heart, breathing and speed; the gauges' four round ones without the numbers on the left or the
// hexagons. ALL shows everything, as before. The chips show in both.
//
// It only DRAWS. It is handed a reading (heroineVitals.ts) and a few things from the game (her speed, her pace, the
// chips' states) and shows them. It only touches the page when something it shows has changed (cheaper on a phone).
// It never takes a touch: the HUD's controls stay free (Joshua's rule for the top-left corner).
// ============================================================================
import type { VitalsReading } from './heroineVitals';

/** Which layout (heroineSettings.ts `vitalsStyle`). */
export type VitalsStyle = 'list' | 'gauges';
/** How much it shows (heroineSettings.ts `vitalsShown`). */
export type VitalsShown = 'basics' | 'all';
/** Which units her speed and temperature are shown in (heroineSettings.ts `units`). */
export type VitalsUnits = 'imperial' | 'metric' | 'both';

/** What the game adds to her reading for the card: her speed and pace, and the chips' states. */
export interface VitalsExtra {
  /** her ground speed, metres a second */
  readonly speed: number;
  /** the week of her pregnancy, or null when she is not pregnant */
  readonly week: number | null;
  /** the baby is kicking now */
  readonly kick: boolean;
  /** she is bent over winded */
  readonly winded: boolean;
}

/** Her eleven stats. */
export type VitalsStat = 'health' | 'water' | 'food' | 'stamina' | 'energy' | 'bathroom' | 'fear' | 'adrenaline' | 'mood' | 'temperature' | 'effort';

/**
 * THE PRIORITY LIST (Joshua, 2026-11-21: "like the important ones a little bigger then the other ones. Will need to
 * set up a priority list"): most important first. The first four are the big round gauges (and the first rows of the
 * list); an urgent one further down swaps up into them (see `orderNow`).
 */
export const VITALS_PRIORITY: readonly VitalsStat[] = ['health', 'water', 'food', 'stamina', 'energy', 'bathroom', 'fear', 'adrenaline', 'mood', 'temperature', 'effort'];

/** How many of the priority list are big (round gauges, the list's first column). */
const BIG = 4;

/** One stat as it is to be shown this frame. */
interface StatView {
  readonly emoji: string;
  /** how full its ring is, 0..1 */
  readonly share: number;
  readonly colour: string;
  /** what a gauge shows in its middle (short: a number, a countdown) */
  readonly gauge: string;
  /** what the list shows: its number, and what it is */
  readonly number: string;
  readonly name: string;
  /** needs her attention: it pulses */
  readonly alert: boolean;
  /** so urgent it swaps into the big four */
  readonly urgent: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const percentOf = (share: number) => `${Math.round(clamp01(share) * 100)}`;
/** Seconds as m:ss (the bathroom countdown). */
const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Her mood's face and word: great, okay, uneasy, miserable (Joshua approved these). */
const moodFace = (mood: number): readonly [string, string] =>
  mood >= 0.75 ? ['😄', 'great'] : mood >= 0.5 ? ['🙂', 'okay'] : mood >= 0.25 ? ['😟', 'uneasy'] : ['😫', 'miserable'];
/** The bathroom's colour by her urge: a quiet grey, amber at the urge, red when strong or nearly full. */
const URGE_COLOURS = ['#9aa6b8', '#ffc24a', '#ff5a5a'] as const;
/** Her temperature's colour: blue cold, green comfortable, orange warm, red hot (degrees C). */
const tempColour = (c: number) => (c < 36.3 ? '#5ab0ff' : c < 37.6 ? '#7bd88f' : c < 38.3 ? '#ffb24a' : '#ff5a5a');
const toF = (c: number) => c * 1.8 + 32;

/** Each stat as shown, from her reading. */
function viewOf(key: VitalsStat, r: VitalsReading, units: VitalsUnits): StatView {
  switch (key) {
    case 'health': {
      const share = r.health / 100;
      return { emoji: '⛑️', share, colour: '#ff5a7a', gauge: percentOf(share), number: `${percentOf(share)}%`, name: 'health', alert: share < 0.25, urgent: false };
    }
    case 'water':
      return { emoji: '💧', share: r.water, colour: '#3ab4ff', gauge: percentOf(r.water), number: `${percentOf(r.water)}%`, name: 'water', alert: r.thirst > 0, urgent: false };
    case 'food':
      return { emoji: '🍽️', share: r.food, colour: '#ff9a3c', gauge: percentOf(r.food), number: `${percentOf(r.food)}%`, name: 'food', alert: r.hunger > 0, urgent: false };
    case 'stamina':
      return { emoji: '⚡️', share: r.stamina, colour: '#ffd23f', gauge: percentOf(r.stamina), number: `${percentOf(r.stamina)}%`, name: 'stamina', alert: r.stamina < 0.15, urgent: false };
    case 'energy':
      return { emoji: '🔋', share: r.energy, colour: r.energy < 0.25 ? '#ff5a5a' : '#7bd88f', gauge: percentOf(r.energy), number: `${percentOf(r.energy)}%`, name: 'energy', alert: r.energy < 0.25, urgent: r.energy < 0.15 };
    case 'bathroom': {
      // (from 85% full: the countdown until she cannot hold it, in red)
      const eta = r.bathroomEta;
      const counting = eta !== null;
      return {
        emoji: '🚽', share: r.bathroom, colour: counting ? URGE_COLOURS[2] : URGE_COLOURS[r.bathroomUrge],
        gauge: counting ? clock(eta) : percentOf(r.bathroom), number: `${percentOf(r.bathroom)}%`,
        name: counting ? `bathroom ${clock(eta)}` : 'bathroom', alert: counting || r.bathroomUrge === 2, urgent: r.bathroom >= 0.85,
      };
    }
    case 'fear':
      return { emoji: '👻', share: r.fear, colour: '#b07cf0', gauge: percentOf(r.fear), number: `${percentOf(r.fear)}%`, name: 'fear', alert: r.fear > 0.6, urgent: r.fear > 0.75 };
    case 'adrenaline':
      return { emoji: '🔥', share: r.adrenaline, colour: '#ff6a3d', gauge: percentOf(r.adrenaline), number: `${percentOf(r.adrenaline)}%`, name: 'adrenaline', alert: r.adrenaline > 0.75, urgent: false };
    case 'mood': {
      const [face, word] = moodFace(r.mood);
      return { emoji: face, share: r.mood, colour: '#f4a3c4', gauge: percentOf(r.mood), number: `${percentOf(r.mood)}%`, name: `mood · ${word}`, alert: r.mood < 0.25, urgent: r.mood < 0.15 };
    }
    case 'temperature': {
      const c = r.temperature, f = toF(c);
      // (the ring is half full at 37 C, empty at 35, full at 39)
      const share = clamp01((c - 35) / 4);
      const gauge = units === 'metric' ? `${c.toFixed(1)}°` : `${Math.round(f)}°`;
      // (its units kept together, Joshua: "keep the units together like... 96.6F(31.6C)": 100.4 °F (38.0°C). The 🌡️
      //  says what it is, so the name is left out and the line stays short.)
      const number = units === 'metric' ? c.toFixed(1) : f.toFixed(1);
      const name = units === 'both' ? `°F (${c.toFixed(1)}°C)` : units === 'metric' ? '°C' : '°F';
      const out = c < 35.8 || c > 38.5;
      return { emoji: '🌡️', share, colour: tempColour(c), gauge, number, name, alert: out, urgent: out };
    }
    case 'effort':
      return { emoji: '💪', share: r.effort, colour: '#ffb27a', gauge: percentOf(r.effort), number: `${percentOf(r.effort)}%`, name: 'effort', alert: false, urgent: false };
  }
}

/**
 * The order to show them in now: the priority list, with each URGENT stat below the big four swapped with the least
 * important big one that is not urgent itself (so the rest keep their places).
 */
function orderNow(views: ReadonlyMap<VitalsStat, StatView>): VitalsStat[] {
  const order = [...VITALS_PRIORITY];
  for (let i = BIG; i < order.length; i++) {
    if (!views.get(order[i])!.urgent) continue;
    for (let j = BIG - 1; j >= 0; j--) {
      if (views.get(order[j])!.urgent) continue;
      [order[i], order[j]] = [order[j], order[i]];
      break;
    }
  }
  return order;
}

/** The card's styles, added to the page the first time a panel is made. */
const STYLE = `
.gd-vitals { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; color: #eaf2ff;
  font: 500 11px system-ui, -apple-system, sans-serif; pointer-events: none; user-select: none; -webkit-user-select: none; }
.gd-vitals-card { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 12px;
  background: #0b1018cc; border: 1px solid #ffffff26; }
.gd-vitals-card[hidden], .gd-vitals [hidden] { display: none !important; }
.gd-vitals-num { font-variant-numeric: tabular-nums; }
.gd-vitals-dim { color: #9aa6b8; }
.gd-vitals-heart { display: inline-block; transform-origin: center; }
/* GAUGES: the plain numbers on the left */
.gd-vitals-left { display: flex; flex-direction: column; gap: 6px; width: 100px; white-space: nowrap; }
.gd-vitals-left b { font-weight: 600; font-size: 15px; }
.gd-vitals-left b.is-big { font-size: 18px; }
.gd-vitals-left small { display: block; margin-left: 20px; font-size: 10.5px; }
.gd-vitals-gauges { position: relative; width: 230px; height: 126px; }
.gd-vitals-gauges svg { position: absolute; left: 0; top: 0; overflow: visible; }
.gd-vitals-mid { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.gd-vitals-mid span:last-child { margin-top: 1px; font-variant-numeric: tabular-nums; }
.gd-vitals-mid.is-alert span:last-child { color: #ff8a8a; }
.gd-vitals-ring { transition: stroke .4s; }
.gd-vitals-ring.is-alert { animation: gd-vitals-pulse 1.2s ease-in-out infinite; }
@keyframes gd-vitals-pulse { 50% { opacity: .35; } }
/* LIST: two columns of icon, number, name */
.gd-vitals-list { display: grid; grid-template-columns: repeat(2, auto); column-gap: 10px; }
/* (FIXED widths, Joshua's screenshots 2026-11-21: the card grew and shrank with "SPRINT" or "WINDED" and "100.4°F" ran
    into its name. Now every row is the same width whatever it says; anything longer is cut with "...".) */
.gd-vitals-row { display: grid; grid-template-columns: 18px 40px 98px; align-items: center; line-height: 16px; white-space: nowrap; }
.gd-vitals-row i { overflow: hidden; text-overflow: ellipsis; }
.gd-vitals-row b { font-weight: 600; font-size: 12px; text-align: right; padding-right: 5px; font-variant-numeric: tabular-nums; }
.gd-vitals-row i { font-style: normal; color: #9aa6b8; letter-spacing: .02em; }
.gd-vitals-row.is-alert b { animation: gd-vitals-pulse 1.2s ease-in-out infinite; }
.gd-vitals-row.is-alert i { color: #ff8a8a; }
/* CHIPS under the card */
.gd-vitals-chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 330px; }
.gd-vitals-chips span { background: #0b1018cc; border: 1px solid #ffffff1f; border-radius: 10px; padding: 1px 8px;
  font-size: 10.5px; letter-spacing: .06em; line-height: 15px; }
`;

const SVG = 'http://www.w3.org/2000/svg';

/** The chips under the card. */
type ChipKey = 'week' | 'kick' | 'winded' | 'pain' | 'hungry' | 'thirsty';

/** One gauge on the card: its shape (round or hexagon), its ring, and the emoji and number in its middle. */
interface GaugeSlot {
  readonly ring: SVGElement;
  readonly mid: HTMLElement;
  readonly emoji: HTMLElement;
  readonly value: HTMLElement;
}

/** One row of the list: its emoji, number and name. */
interface ListRow {
  readonly row: HTMLElement;
  readonly emoji: HTMLElement;
  readonly number: HTMLElement;
  readonly name: HTMLElement;
}

/** A hexagon standing on a point, round (cx, cy), `r` from the middle to a corner, starting at its top corner. */
function hexPoints(cx: number, cy: number, r: number): string {
  const w = r * 0.866;
  return [[cx, cy - r], [cx + w, cy - r / 2], [cx + w, cy + r / 2], [cx, cy + r], [cx - w, cy + r / 2], [cx - w, cy - r / 2]]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/**
 * Where the eleven gauges sit (Joshua's approved drawing): four round ones along the top, four hexagons under them,
 * three more tucked between those. [x, y of the middle, size (r), round?, emoji px, number px, ring width]
 */
const GAUGE_PLACES: ReadonlyArray<readonly [number, number, number, boolean, number, number, number]> = [
  ...[0, 1, 2, 3].map((i) => [40 + i * 50, 25, 23, true, 15, 12, 4] as const),
  ...[0, 1, 2, 3].map((i) => [52 + i * 42, 72, 18, false, 13, 11, 3.5] as const),
  ...[0, 1, 2].map((i) => [73 + i * 42, 105, 18, false, 13, 11, 3.5] as const),
];

export class VitalsPanel {
  /** The whole thing (card and chips). Put it wherever it should sit: `parent.appendChild(panel.element)`. */
  readonly element: HTMLDivElement;
  private readonly gaugesCard: HTMLElement;
  private readonly listCard: HTMLElement;
  private style: VitalsStyle = 'list';
  private shown: VitalsShown = 'basics';
  /** What BASICS hides: the gauges' left numbers, their hexagons (back, ring and middle), and the list's heart, breathing
   *  and speed rows and its second column; and the gauges' box, made shorter. */
  private readonly allOnly: (HTMLElement | SVGElement)[] = [];
  private readonly gaugesBox: HTMLElement;
  private readonly listGrid: HTMLElement;
  private readonly gaugesSvg: SVGElement;
  private units: VitalsUnits = 'both';
  /** GAUGES: the hearts (one in each layout: they beat), the numbers on the left, and the eleven gauges. */
  private readonly hearts: HTMLElement[] = [];
  private readonly gRate: HTMLElement;
  private readonly gBreath: HTMLElement;
  private readonly gSpeed: HTMLElement;
  private readonly gSpeedUnit: HTMLElement;
  private readonly gSpeedOther: HTMLElement;
  private readonly slots: GaugeSlot[] = [];
  /** LIST: its rows: heart, breathing, speed, then the eleven stats. */
  private readonly lRate: ListRow;
  private readonly lBreath: ListRow;
  private readonly lSpeed: ListRow;
  private readonly lStats: ListRow[] = [];
  /** CHIPS */
  private readonly chips: Record<ChipKey, HTMLElement>;
  /** What was last written, so the page is only touched when something really changes. */
  private last = new Map<string, string>();
  /** When everything but the heart was last written (ms). */
  private lastFull = -Infinity;

  constructor() {
    if (!document.getElementById('gd-vitals-style')) {
      const style = document.createElement('style');
      style.id = 'gd-vitals-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    this.element = document.createElement('div');
    this.element.className = 'gd-vitals';

    // ---- LAYOUT A, GAUGES ---------------------------------------------------------------------------------------
    this.gaugesCard = make('div', 'gd-vitals-card', this.element);
    const left = make('div', 'gd-vitals-left', this.gaugesCard);
    this.allOnly.push(left);
    const heartLine = make('div', '', left);
    this.hearts.push(make('span', 'gd-vitals-heart', heartLine, '❤️'));
    heartLine.append(' ');
    this.gRate = make('b', 'gd-vitals-num is-big', heartLine);
    make('span', 'gd-vitals-dim', heartLine, ' bpm');
    const breathLine = make('div', '', left, '🫁 ');
    this.gBreath = make('b', 'gd-vitals-num', breathLine);
    make('span', 'gd-vitals-dim', breathLine, ' br/min');
    const speedLine = make('div', '', left, '🏃‍♀️ ');
    this.gSpeed = make('b', 'gd-vitals-num', speedLine);
    this.gSpeedUnit = make('span', 'gd-vitals-dim', speedLine);
    // (the other unit with it, in brackets: Joshua, "keep the units together like 2.6mph(7.6km)"; on the gauges card
    //  just under it, as on one line it made the card 50 px wider. Her pace's name is not on the card: it is over the
    //  MOVE stick already, and WINDED has its chip.)
    this.gSpeedOther = make('small', 'gd-vitals-dim gd-vitals-num', speedLine);
    const gauges = make('div', 'gd-vitals-gauges', this.gaugesCard);
    this.gaugesBox = gauges;
    const svg = document.createElementNS(SVG, 'svg');
    this.gaugesSvg = svg;
    svg.setAttribute('width', '230');
    svg.setAttribute('height', '126');
    gauges.appendChild(svg);
    for (const [cx, cy, r, round, emojiPx, numberPx, width] of GAUGE_PLACES) {
      // (its shape twice: a dark one with a grey edge behind, and the coloured ring over it, filled to its share. The
      //  ring is drawn as a dash `share` of its length long: "pathLength 100" makes its whole length 100, whatever its
      //  size, and a round one is turned so its dash starts at the top, as a hexagon's starts at its top corner.)
      const shape = (): SVGElement => {
        const el = document.createElementNS(SVG, round ? 'circle' : 'polygon');
        if (round) {
          el.setAttribute('cx', String(cx)); el.setAttribute('cy', String(cy)); el.setAttribute('r', String(r - 2));
          el.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
        } else el.setAttribute('points', hexPoints(cx, cy, r));
        el.setAttribute('stroke-width', String(width));
        return el;
      };
      const back = shape();
      back.setAttribute('fill', '#1a2029');
      back.setAttribute('stroke', '#ffffff24');
      svg.appendChild(back);
      const ring = shape();
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke-linejoin', 'round');
      ring.setAttribute('pathLength', '100');
      ring.setAttribute('class', 'gd-vitals-ring');
      svg.appendChild(ring);
      const mid = make('div', 'gd-vitals-mid', gauges);
      mid.style.left = `${cx - r}px`; mid.style.top = `${cy - r}px`;
      mid.style.width = `${2 * r}px`; mid.style.height = `${2 * r}px`;
      const emoji = make('span', '', mid);
      emoji.style.fontSize = `${emojiPx}px`;
      const value = make('span', '', mid);
      value.style.fontSize = `${numberPx}px`;
      this.slots.push({ ring, mid, emoji, value });
      // (the hexagons are ALL only: BASICS keeps the four round ones)
      if (!round) this.allOnly.push(back, ring, mid);
    }

    // ---- LAYOUT B, THE LIST -------------------------------------------------------------------------------------
    this.listCard = make('div', 'gd-vitals-card', this.element);
    const list = make('div', 'gd-vitals-list', this.listCard);
    this.listGrid = list;
    const columnA = make('div', '', list), columnB = make('div', '', list);
    this.allOnly.push(columnB);
    const row = (parent: HTMLElement, emoji = ''): ListRow => {
      const line = make('div', 'gd-vitals-row', parent);
      return { row: line, emoji: make('span', '', line, emoji), number: make('b', '', line), name: make('i', '', line) };
    };
    this.lRate = row(columnA);
    this.hearts.push(make('span', 'gd-vitals-heart', this.lRate.emoji, '❤️'));
    this.lRate.name.textContent = 'bpm';
    this.lBreath = row(columnA, '🫁');
    this.lBreath.name.textContent = 'br/min';
    this.lSpeed = row(columnA, '🏃‍♀️');
    this.allOnly.push(this.lRate.row, this.lBreath.row, this.lSpeed.row);
    for (let i = 0; i < VITALS_PRIORITY.length; i++) this.lStats.push(row(i < BIG ? columnA : columnB));

    // ---- CHIPS ----------------------------------------------------------------------------------------------------
    const chipBox = make('div', 'gd-vitals-chips', this.element);
    const chip = (text: string, colour: string): HTMLElement => {
      const el = make('span', '', chipBox, text);
      el.style.color = colour;
      el.hidden = true;
      return el;
    };
    this.chips = {
      week: chip('', '#eaf2ff'),
      kick: chip('👶 KICK', '#f4a3c4'),
      winded: chip('😮‍💨 WINDED', '#ffd23f'),
      pain: chip('🤕 PAIN', '#ff8a8a'),
      hungry: chip('🍽️ HUNGRY', '#ff9a3c'),
      thirsty: chip('💧 THIRSTY', '#7fc8ff'),
    };
    this.setStyle('list');
    this.setShown('basics');
  }

  /** How much it shows (Settings -> HUD -> Vitals shown): the basics, or all of it. */
  setShown(shown: VitalsShown): void {
    this.shown = shown;
    const all = shown === 'all';
    for (const el of this.allOnly) {
      if (el instanceof HTMLElement) el.hidden = !all; else el.style.display = all ? '' : 'none';
    }
    // (BASICS: the gauges' box only as tall as the round ones)
    const tall = all ? 126 : 50;
    this.gaugesBox.style.height = `${tall}px`;
    this.gaugesSvg.setAttribute('height', String(tall));
    // (and the list one column wide: its gap would leave the card 10 px too wide)
    this.listGrid.style.gridTemplateColumns = all ? '' : 'auto';
    this.last.clear();
  }

  /** Which layout to show (Settings -> HUD -> Vitals style). */
  setStyle(style: VitalsStyle): void {
    this.style = style;
    this.gaugesCard.hidden = style !== 'gauges';
    this.listCard.hidden = style !== 'list';
    this.last.clear(); // (the one now shown is written in full on the next frame)
  }

  /** Which units her speed and temperature are in (Settings -> HUD -> Units). */
  setUnits(units: VitalsUnits): void {
    this.units = units;
    this.last.clear();
  }

  /** Write `value` with `apply`, but only if it changed since last time. */
  private set(key: string, value: string, apply: (value: string) => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply(value);
  }

  /** Show a reading. Call it every frame; it only touches the page when something changed. */
  show(reading: VitalsReading, extra: VitalsExtra = { speed: 0, week: null, kick: false, winded: false }): void {
    const units = this.units;
    // Her heart swells with each beat (her real heartbeat, so it speeds up as she works).
    this.set('beat', (1 + 0.28 * reading.beat).toFixed(2), (v) => this.hearts.forEach((h) => (h.style.transform = `scale(${v})`)));
    // Everything else ten times a second, not every frame: the numbers read just as well, and the phone redraws the
    // card (and its emoji) a sixth as often. (A change of layout or units shows at once: `last` is emptied then.)
    const now = performance.now();
    if (this.last.size > 1 && now - this.lastFull < 100) return;
    this.lastFull = now;
    const rate = reading.heartRate.toFixed(0), breaths = reading.breathsPerMinute.toFixed(0);
    // Her speed: mph and km/h (Both shows mph first, km/h under it)
    const mph = (extra.speed * 2.23694).toFixed(1), kmh = (extra.speed * 3.6).toFixed(1);
    const [speedMain, unitMain] = units === 'metric' ? [kmh, 'km/h'] : [mph, 'mph'];

    // Her eleven stats, and their order now.
    const views = new Map<VitalsStat, StatView>();
    for (const key of VITALS_PRIORITY) views.set(key, viewOf(key, reading, units));
    const order = orderNow(views);

    if (this.style === 'gauges') {
      this.set('g.rate', rate, (v) => (this.gRate.textContent = v));
      this.set('g.breath', breaths, (v) => (this.gBreath.textContent = v));
      this.set('g.speed', speedMain, (v) => (this.gSpeed.textContent = v));
      this.set('g.unit', unitMain, (v) => (this.gSpeedUnit.textContent = ` ${v}`));
      this.set('g.other', units === 'both' ? `(${kmh} km/h)` : '', (v) => (this.gSpeedOther.textContent = v));
      order.forEach((key, i) => {
        const view = views.get(key)!, slot = this.slots[i];
        this.set(`g${i}.emoji`, view.emoji, (v) => (slot.emoji.textContent = v));
        this.set(`g${i}.value`, view.gauge, (v) => (slot.value.textContent = v));
        this.set(`g${i}.colour`, view.colour, (v) => slot.ring.setAttribute('stroke', v));
        // (an empty ring is not drawn at all: a round one's rounded end would leave a dot)
        this.set(`g${i}.share`, (clamp01(view.share) * 100).toFixed(1), (v) => {
          slot.ring.setAttribute('stroke-dasharray', `${v} 100`);
          slot.ring.setAttribute('stroke-linecap', Number(v) > 1 && i < BIG ? 'round' : 'butt');
          slot.ring.style.visibility = Number(v) > 0.2 ? '' : 'hidden';
        });
        this.set(`g${i}.alert`, String(view.alert), (v) => {
          slot.ring.classList.toggle('is-alert', v === 'true');
          slot.mid.classList.toggle('is-alert', v === 'true');
        });
      });
    } else {
      this.set('l.rate', rate, (v) => (this.lRate.number.textContent = v));
      this.set('l.breath', breaths, (v) => (this.lBreath.number.textContent = v));
      // (13.5 mph (21.8 km/h): its units together on one line)
      this.set('l.speed', speedMain, (v) => (this.lSpeed.number.textContent = v));
      this.set('l.unit', units === 'both' ? `mph (${kmh} km/h)` : unitMain, (v) => (this.lSpeed.name.textContent = v));
      order.forEach((key, i) => {
        const view = views.get(key)!, row = this.lStats[i];
        this.set(`l${i}.emoji`, view.emoji, (v) => (row.emoji.textContent = v));
        this.set(`l${i}.number`, view.number, (v) => (row.number.textContent = v));
        this.set(`l${i}.colour`, view.colour, (v) => (row.number.style.color = v));
        this.set(`l${i}.name`, view.name, (v) => (row.name.textContent = v));
        this.set(`l${i}.alert`, String(view.alert), (v) => row.row.classList.toggle('is-alert', v === 'true'));
      });
    }

    // The chips: each only while it applies.
    const chip = (key: ChipKey, on: boolean, text?: string) => {
      this.set(`c.${key}`, on ? text ?? 'on' : '', () => {
        const el = this.chips[key];
        el.hidden = !on;
        if (text) el.textContent = text;
      });
    };
    chip('week', extra.week !== null, extra.week !== null ? `🤰 WEEK ${Math.floor(extra.week)}` : undefined);
    chip('kick', extra.kick);
    chip('winded', extra.winded);
    chip('pain', reading.pain > 0.05);
    chip('hungry', reading.hunger > 0);
    chip('thirsty', reading.thirst > 0);
  }
}
