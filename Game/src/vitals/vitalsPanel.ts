// ============================================================================
// vitalsPanel.ts -- the heroine's vitals on screen: a small card with her heart
// rate, breathing, and bars for health, stamina, food, water and the bathroom.
//
// It only DRAWS. It is handed a reading (see heroineVitals.ts) and shows it, so
// the same card works in the test page now and in the game's HUD later.
//
// It brings its own styles (added to the page once), so nothing else has to
// know about it. It is small on purpose: on a phone it sits along the top edge,
// leaving the bottom corners free for the player's controls.
// ============================================================================
import type { VitalsReading } from './heroineVitals';

/** The card's styles, added to the page the first time a panel is made. */
const STYLE = `
.gd-vitals { display: inline-flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 12px;
  background: #0b1018cc; border: 1px solid #ffffff26; color: #eaf2ff; font: 700 11px system-ui, sans-serif;
  letter-spacing: .04em; pointer-events: none; user-select: none; -webkit-user-select: none; }
.gd-vitals-heart { display: flex; align-items: center; gap: 5px; min-width: 64px; }
.gd-vitals-heart i { font-style: normal; color: #ff4f7b; display: inline-block; transform-origin: center; }
.gd-vitals-heart b { font-size: 15px; font-variant-numeric: tabular-nums; }
.gd-vitals-breath { opacity: .75; font-variant-numeric: tabular-nums; min-width: 44px; }
.gd-vitals-bars { display: grid; grid-template-columns: auto 74px; gap: 3px 6px; align-items: center; }
.gd-vitals-bars span { opacity: .8; font-size: 9px; }
.gd-vitals-bar { height: 6px; border-radius: 3px; background: #ffffff1f; overflow: hidden; }
.gd-vitals-bar div { height: 100%; width: 100%; border-radius: 3px; transform-origin: left center; transition: background .4s; }
/* THE BATHROOM BAR's urge: amber at the urge, red and pulsing when it is strong */
.gd-vitals-bars span.is-urge { color: #ffc24a; opacity: 1; }
.gd-vitals-bars span.is-strong { color: #ff5a5a; opacity: 1; animation: gd-vitals-pulse 1s ease-in-out infinite; }
.gd-vitals-bar.is-strong { animation: gd-vitals-pulse 1s ease-in-out infinite; }
@keyframes gd-vitals-pulse { 50% { opacity: .45; } }
`;

/** One bar: its label and its colour. */
const BARS = [
  { key: 'health', label: 'HEALTH', colour: '#ff4f7b' },
  { key: 'stamina', label: 'STAMINA', colour: '#ffd23f' },
  { key: 'food', label: 'FOOD', colour: '#ff9f43' },
  { key: 'water', label: 'WATER', colour: '#3fb6ff' },
  // (Joshua, 2026-11-19: "add a bathroom stat to watch". It fills as her bladder or rectum fills; its colour is her
  //  urge, see URGE_COLOURS)
  { key: 'bathroom', label: 'BATHROOM', colour: '#9aa6b8' },
] as const;

/** The bathroom bar's colour at each urge: none (a quiet grey), the urge (amber), strong (red). */
const URGE_COLOURS = ['#9aa6b8', '#ffc24a', '#ff5a5a'] as const;

export class VitalsPanel {
  /** The card. Put it wherever it should sit: `parent.appendChild(panel.element)`. */
  readonly element: HTMLDivElement;
  private readonly heart: HTMLElement;
  private readonly rate: HTMLElement;
  private readonly breath: HTMLElement;
  private readonly fills = new Map<string, HTMLDivElement>();
  /** The bathroom bar's label and track, which change with her urge. */
  private bathroomLabel!: HTMLElement;
  private bathroomTrack!: HTMLElement;
  /** What was last written, so the page is only touched when a number really changes (cheaper on a phone). */
  private last = new Map<string, string>();

  constructor() {
    if (!document.getElementById('gd-vitals-style')) {
      const style = document.createElement('style');
      style.id = 'gd-vitals-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this.element = document.createElement('div');
    this.element.className = 'gd-vitals';

    // Her heart: a heart that beats, and her beats a minute.
    const heartBox = document.createElement('div');
    heartBox.className = 'gd-vitals-heart';
    this.heart = document.createElement('i');
    this.heart.textContent = '♥';
    this.rate = document.createElement('b');
    heartBox.append(this.heart, this.rate);

    // Her breathing: breaths a minute.
    this.breath = document.createElement('div');
    this.breath.className = 'gd-vitals-breath';

    // The five bars.
    const bars = document.createElement('div');
    bars.className = 'gd-vitals-bars';
    for (const bar of BARS) {
      const label = document.createElement('span');
      label.textContent = bar.label;
      const track = document.createElement('div');
      track.className = 'gd-vitals-bar';
      const fill = document.createElement('div');
      fill.style.background = bar.colour;
      track.appendChild(fill);
      bars.append(label, track);
      this.fills.set(bar.key, fill);
      if (bar.key === 'bathroom') { this.bathroomLabel = label; this.bathroomTrack = track; }
    }
    this.element.append(heartBox, this.breath, bars);
  }

  /** Write `value` into `element`'s text or a style, but only if it changed. */
  private set(key: string, value: string, apply: (value: string) => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply(value);
  }

  /** Show a reading. Call it every frame; it only touches the page when something changed. */
  show(reading: VitalsReading): void {
    this.set('rate', reading.heartRate.toFixed(0), (v) => (this.rate.textContent = v));
    this.set('breath', `${reading.breathsPerMinute.toFixed(0)} br/min`, (v) => (this.breath.textContent = v));
    // The heart swells with each beat (her real heartbeat, so it speeds up as she works).
    this.set('beat', (1 + 0.28 * reading.beat).toFixed(2), (v) => (this.heart.style.transform = `scale(${v})`));
    const shares: Record<string, number> = {
      health: reading.health / 100,
      stamina: reading.stamina,
      food: reading.food,
      water: reading.water,
      bathroom: reading.bathroom,
    };
    for (const [key, share] of Object.entries(shares)) {
      const fill = this.fills.get(key)!;
      // (scaleX instead of width: the browser can do it without laying the page out again)
      this.set(key, Math.max(0, Math.min(1, share)).toFixed(3), (v) => (fill.style.transform = `scaleX(${v})`));
    }
    // Her urge: the bathroom bar's colour, and its label and bar pulse when it is strong.
    this.set('urge', String(reading.bathroomUrge), (v) => {
      const urge = Number(v) as 0 | 1 | 2;
      this.fills.get('bathroom')!.style.background = URGE_COLOURS[urge];
      this.bathroomLabel.classList.toggle('is-urge', urge === 1);
      this.bathroomLabel.classList.toggle('is-strong', urge === 2);
      this.bathroomTrack.classList.toggle('is-strong', urge === 2);
    });
  }
}
