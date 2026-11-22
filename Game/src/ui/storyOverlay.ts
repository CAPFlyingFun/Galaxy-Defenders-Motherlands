// ============================================================================
// storyOverlay.ts -- WHAT THE STORY PUTS ON SCREEN (the prologue first; every chapter after it).
//
// Joshua's opening demo, Draft 1 (2026-11-22) is told with: a black screen and a time card ("DAY 9 | 07:42 | A.R.C.H.
// EXPEDITION SITE"), lines of dialogue (many of them over the radio), GAMEPLAY OBJECTIVES, the A.R.C.H. scanner's
// display when John scans a wall, and, for now, a card at the end of the scene. In a BLOCKOUT the voices are TEXT
// (subtitles); recorded voices can come later and the subtitles stay.
//
//   FADE         the whole screen black, faded in and out (the scene's opening, later its cut to black).
//   TIME CARD    a line of capitals in the middle of the black, typed out.
//   SUBTITLE     bottom middle, between the MOVE stick and the right-hand buttons: who speaks (a radio voice in
//                A.R.C.H. teal, marked RADIO) and what they say.
//   OBJECTIVE    top middle, small: OBJECTIVE, its name, and a line under it (what is found so far). Ticked off when done.
//   HINT         under the objective for a few seconds: how a control works, the first time it is needed.
//   SCANNING     a bar in the middle while the scanner reads, then the scanner's DISPLAY: the inscription's symbols,
//                known in teal with their numbers, unknown with a "?", and a few lines of what it found. A tap closes it.
//   END CARD     the scene complete: what comes next, and two buttons.
//
// Nothing here takes a touch but the scanner's display and the end card's buttons: the game is played through it.
// Made before the game's controls (main.ts), so every control is drawn over it.
// ============================================================================

import './storyOverlay.css';
import { scannerCanvas, type Inscription } from '../story/glyphs';

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export class StoryOverlay {
  private readonly root: HTMLElement;
  private readonly fadeLayer: HTMLElement;
  private readonly timeCard: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly subtitleWho: HTMLElement;
  private readonly subtitleText: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveTitle: HTMLElement;
  private readonly objectiveLine: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly scanBar: HTMLElement;
  private readonly scanFill: HTMLElement;
  private readonly scanWords: HTMLElement;
  private readonly display: HTMLElement;
  private readonly card: HTMLElement;
  private hintTimer = 0;
  private typing = 0;
  private displayClose: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = make('div', 'st-root', host);
    this.fadeLayer = make('div', 'st-fade', this.root);
    this.timeCard = make('div', 'st-timecard', this.root);
    this.subtitle = make('div', 'st-sub', this.root);
    this.subtitleWho = make('div', 'st-sub-who', this.subtitle);
    this.subtitleText = make('div', 'st-sub-text', this.subtitle);
    this.objective = make('div', 'st-objective', this.root);
    make('div', 'st-objective-label', this.objective, 'OBJECTIVE');
    this.objectiveTitle = make('div', 'st-objective-title', this.objective);
    this.objectiveLine = make('div', 'st-objective-line', this.objective);
    this.hint = make('div', 'st-hint', this.root);
    this.scanBar = make('div', 'st-scanbar', this.root);
    this.scanWords = make('div', 'st-scanbar-words', this.scanBar, 'SCANNING');
    const track = make('div', 'st-scanbar-track', this.scanBar);
    this.scanFill = make('div', 'st-scanbar-fill', track);
    this.display = make('div', 'st-display', this.root);
    this.card = make('div', 'st-card', this.root);
    for (const node of [this.timeCard, this.subtitle, this.objective, this.hint, this.scanBar, this.display, this.card]) node.hidden = true;
    // (the scanner's display closes at a tap anywhere on it)
    this.display.addEventListener('pointerdown', (event) => { event.stopPropagation(); this.displayClose?.(); });
  }

  /** The screen faded to black (1) or clear (0), over `seconds`. */
  fade(to: number, seconds: number): void {
    this.fadeLayer.style.transition = `opacity ${seconds}s ease`;
    this.fadeLayer.style.opacity = String(to);
  }

  /** The time card typed out in the middle of the screen (null: gone, faded). */
  showTimeCard(text: string | null): void {
    window.clearInterval(this.typing);
    if (text === null) { this.timeCard.classList.add('is-going'); window.setTimeout(() => { this.timeCard.hidden = true; this.timeCard.classList.remove('is-going'); }, 700); return; }
    this.timeCard.hidden = false;
    this.timeCard.classList.remove('is-going');
    this.timeCard.textContent = '';
    let shown = 0;
    this.typing = window.setInterval(() => {
      shown++;
      this.timeCard.textContent = text.slice(0, shown);
      if (shown >= text.length) window.clearInterval(this.typing);
    }, 38);
  }

  /** A line spoken: who (and whether over the radio) and what; null clears it. */
  say(who: string | null, text = '', radio = false): void {
    if (who === null) { this.subtitle.hidden = true; return; }
    this.subtitle.hidden = false;
    this.subtitle.classList.toggle('is-radio', radio);
    this.subtitleWho.textContent = radio ? `${who} · RADIO` : who;
    this.subtitleText.textContent = text;
  }

  /** The objective (null: none), and the line under it. */
  setObjective(title: string | null, line = ''): void {
    if (title === null) { this.objective.hidden = true; return; }
    this.objective.hidden = false;
    this.objective.classList.remove('is-done');
    this.objectiveTitle.textContent = title;
    this.objectiveLine.textContent = line;
    this.objectiveLine.hidden = !line;
  }

  /** The line under the objective only (what is found so far). */
  setObjectiveLine(line: string): void {
    this.objectiveLine.textContent = line;
    this.objectiveLine.hidden = !line;
  }

  /** The objective ticked off (it stays a moment, then goes). */
  objectiveDone(): void {
    this.objective.classList.add('is-done');
  }

  /** A hint under the objective for `seconds` (how a control works). */
  showHint(text: string, seconds: number): void {
    window.clearTimeout(this.hintTimer);
    this.hint.textContent = text;
    this.hint.hidden = false;
    this.hintTimer = window.setTimeout(() => { this.hint.hidden = true; }, seconds * 1000);
  }

  /** The scanner reading: how far (0..1), or null when it is not. */
  setScanning(done: number | null): void {
    if (done === null) { this.scanBar.hidden = true; return; }
    this.scanBar.hidden = false;
    this.scanWords.textContent = `A.R.C.H. SCANNER · READING ${Math.round(done * 100)}%`;
    this.scanFill.style.width = `${Math.round(done * 100)}%`;
  }

  /**
   * THE SCANNER'S DISPLAY: the inscription (story/glyphs.ts), a title, and its lines; `onClose` once it is closed (a
   * tap, or by itself after `seconds`).
   */
  showDisplay(title: string, ins: Inscription, lines: readonly string[], seconds: number, onClose: () => void): void {
    this.display.replaceChildren();
    make('div', 'st-display-title', this.display, title);
    const picture = scannerCanvas(ins, 540, 66 * ins.rows.length);
    picture.className = 'st-display-picture';
    this.display.appendChild(picture);
    for (const line of lines) make('div', 'st-display-line', this.display, line);
    make('div', 'st-display-close', this.display, 'tap to close');
    this.display.hidden = false;
    let closed = false;
    const timer = window.setTimeout(() => close(), seconds * 1000);
    const close = (): void => {
      if (closed) return;
      closed = true;
      window.clearTimeout(timer);
      this.display.hidden = true;
      this.displayClose = null;
      onClose();
    };
    this.displayClose = close;
  }

  /** Is the scanner's display open? */
  get displayOpen(): boolean { return !this.display.hidden; }

  /** THE END CARD: a heading, lines, and buttons (each with what it does). */
  showCard(heading: string, lines: readonly string[], buttons: readonly { label: string; act: () => void }[]): void {
    this.card.replaceChildren();
    make('div', 'st-card-heading', this.card, heading);
    for (const line of lines) make('div', 'st-card-line', this.card, line);
    const row = make('div', 'st-card-buttons', this.card);
    for (const b of buttons) {
      const button = make('button', 'st-card-button', row, b.label);
      button.addEventListener('pointerdown', (event) => { event.stopPropagation(); event.preventDefault(); b.act(); });
    }
    this.card.hidden = false;
  }

  hideCard(): void { this.card.hidden = true; }

  dispose(): void {
    window.clearInterval(this.typing);
    window.clearTimeout(this.hintTimer);
    this.root.remove();
  }
}
