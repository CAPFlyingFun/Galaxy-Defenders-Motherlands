// ============================================================================
// thoughtBubble.ts -- A THOUGHT BUBBLE over the one standing by: what their brain is thinking.
//
// Joshua, 2026-11-21: "maybe draw over John his state of mind 🧠 that way I can know what it's 'Thinking' and if it's
// working." A small dark card with a tail, drawn over the head of whoever is NOT being played (npc/thoughts.ts writes
// its lines). Settings -> TEST TOOLS -> AI thoughts turns it on or off (`gdm.npcThoughts`, `?thoughts=off`).
//
// How it is drawn: it is a plain page element (not part of the 3D scene, so it costs nearly nothing), moved every
// frame to where their head is on screen. Each frame main.ts gives it a point in the world (just above their head);
// that point is turned into screen pixels with the camera, the same way the 3D picture is made:
//   1. into the camera's own space: if it is BEHIND the camera, the bubble is hidden;
//   2. projected: -1..1 across and up the screen, then into pixels of the game's area.
// In view, it sits over their head, kept on screen and NEVER lower than 55% of the screen's height, so the bottom
// corners stay free for the player's controls. OUT OF VIEW (to the side, behind the camera, or very far), pushing it
// against the edge put it under her vitals card or the 🔄 and ⚙️ buttons (checked at 932 x 430), so it DOCKS at the
// top middle instead, where nothing else is, without its tail, with an arrow (◀ or ▶) to the side they are on.
// It never takes a touch, and it sits UNDER every control (it is put in before the HUD), so it can never cover a button.
// Its words are written 10 times a second (writing page text every frame would cost more than it shows).
// ============================================================================
import * as THREE from 'three';
import './thoughtBubble.css';

/** How often its words are rewritten, seconds. */
const WORDS_EVERY = 0.1;
/** The lowest its bottom may come down the screen, as a share of the height (the bottom corners are the controls'). */
const LOWEST = 0.55;
/** Space kept from the screen's edges, pixels. */
const EDGE = 6;
/** Past this far from the camera, metres, it docks at the top (their head is too small to point at). */
const FARTHEST = 80;

export class ThoughtBubble {
  private readonly card: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly point = new THREE.Vector3();
  private shownText = '';
  private sinceWords = WORDS_EVERY;
  private shown = false;
  private lastX = NaN;
  private lastY = NaN;
  private docked = false;

  /**
   * @param host  the game's UI layer (#ui): the bubble is put in FIRST, so the HUD made after it draws over it
   */
  constructor(private readonly host: HTMLElement) {
    this.card = document.createElement('div');
    this.card.className = 'gd-thought';
    this.card.hidden = true;
    this.text = document.createElement('pre');
    this.card.appendChild(this.text);
    host.prepend(this.card);
  }

  /** Hide it (nobody standing by, or AI thoughts off). */
  hide(): void {
    if (!this.shown) return;
    this.card.hidden = true;
    this.shown = false;
  }

  /**
   * Show it over a point in the world (just above their head), with these lines. Call once a frame, after the camera
   * has moved for the frame.
   * @param dt      seconds since the last frame (for writing its words 10 times a second)
   * @param camera  the camera the game is drawn with
   * @param at      the world point the bubble's tail points at
   * @param words   its lines (only asked for when they are about to be written: `() => thoughtLines(...)`)
   */
  update(dt: number, camera: THREE.Camera, at: THREE.Vector3, words: () => readonly string[]): void {
    // 1. INTO THE CAMERA'S SPACE (x to the right, y up, the camera looking down -z)
    const p = this.point.copy(at).applyMatrix4(camera.matrixWorldInverse);
    const side = p.x;   // (which side of the view they are on: for the docked arrow)
    const width = this.host.clientWidth, height = this.host.clientHeight;
    let x = NaN, y = NaN;
    // 2. ONTO THE SCREEN: -1..1 across and up, then pixels of the game's area (not when behind the camera or too far)
    if (p.z < -0.05 && -p.z < FARTHEST) {
      p.applyMatrix4(camera.projectionMatrix);   // (a perspective divide follows: applyMatrix4 does it for a Vector3)
      x = (p.x + 1) / 2 * width;
      y = (1 - p.y) / 2 * height;
    }
    // (in view: their head is on the screen; otherwise it docks at the top middle, with an arrow their way)
    const docked = !(x >= 0 && x <= width && y >= 0 && y <= height);
    if (docked !== this.docked) { this.docked = docked; this.card.classList.toggle('is-docked', docked); this.lastX = NaN; }
    // (its words first, so its size is right for keeping it on screen)
    this.sinceWords += dt;
    if (this.sinceWords >= WORDS_EVERY || !this.shown) {
      this.sinceWords = 0;
      const lines = [...words()];
      if (docked && lines.length > 0) lines[0] = side < 0 ? `◀ ${lines[0]}` : `${lines[0]} ▶`;
      const text = lines.join('\n');
      if (text !== this.shownText) { this.text.textContent = text; this.shownText = text; }
    }
    if (!this.shown) { this.card.hidden = false; this.shown = true; this.lastX = NaN; }
    // 3. WHERE IT GOES: docked, the top middle (its top at the edge); in view, over their head, kept on screen (in
    //    from the sides and the top) and never below LOWEST (its tail is at its bottom middle)
    const w = this.card.offsetWidth, h = this.card.offsetHeight;
    if (docked) { x = width / 2; y = EDGE + h; }
    else {
      x = Math.min(width - EDGE - w / 2, Math.max(EDGE + w / 2, x));
      y = Math.min(height * LOWEST, Math.max(EDGE + h, y));
    }
    // (moved only when it has moved half a pixel: a page element moved for nothing still costs a layout)
    if (Math.abs(x - this.lastX) < 0.5 && Math.abs(y - this.lastY) < 0.5) return;
    this.lastX = x;
    this.lastY = y;
    this.card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}
