// ============================================================================
// storyDirector.ts -- RUNS A CHAPTER OF THE STORY, beat by beat, inside the game's own clock.
//
// Joshua's plan (docs/plan/MOTHERLANDS_PLAN.md, sections 5 and 6): the story is told in chapters, each its own small
// scene; the opening demo's first one is John beneath the island. A chapter is written as a SCRIPT that reads like
// the draft itself (story/chapters/johnPrologue.ts):
//
//     await story.say('EXPEDITION LEADER', 'John? You still with us?', { radio: true });
//     story.objective('REJOIN THE EXPEDITION');
//     await story.until(() => w.progress() > 17);
//     await story.scanned('markingA');
//
// Each `await` waits for something in the GAME: a line to be read, some seconds of play, the player to get
// somewhere, a wall to be scanned. The director checks what it is waiting for once a frame (`update`, from the
// game's loop), with the game's own time: while the game is paused, or frozen changing an outfit, the story waits
// too, and nothing is missed.
//
// It also runs the SCANNER (the A.R.C.H. field scanner, the story's "inspect/scan" control): near a marking that can
// be scanned, and looking at it, the prompt bubble says SCAN (`promptWord`); a tap (`act`) reads it for a couple of
// seconds (he can keep moving, but not walk away), then the scanner's display shows what it found.
//
// And the CAMERA SHAKE when the stone vibrates (`shake`, read each frame by the game: `shakeNow`), and WHERE TO GO: the
// objective's place (`setWaypoint`), which the game shows with arrows on the floor, the minimap's dot or rim arrow and
// the distance on the objective (Joshua, 2026-11-22: "something to tell you which way towards your objective").
// ============================================================================

import * as THREE from 'three';
import { StoryOverlay } from '../ui/storyOverlay';
import type { Inscription } from './glyphs';

/** Something that can be scanned (a marking on a wall: world/prologue/tunnel.ts `Marking`). */
export interface Scannable {
  readonly id: string;
  readonly at: THREE.Vector3;
  readonly facing: THREE.Vector3;
  readonly inscription: Inscription;
  setGlow(amount: number): void;
}

/** What the scanner's display says of a scan: its title and its lines (the chapter writes them). */
export interface ScanReport { readonly title: string; readonly lines: readonly string[] }

/** The sounds the director plays for its beats (the chapter's world gives them: world/prologue/caveSounds.ts). */
export interface StorySounds {
  radioOn(): void;
  radioOff(): void;
  scanner(kind: 'start' | 'sweep' | 'done', seconds?: number): void;
}

/** How close to a marking he must be to scan it (metres, his feet to its middle along the ground). GAME TUNING. */
const SCAN_REACH = 3.4;
/** Walking further than this from it while it reads stops the scan. */
const SCAN_LOST = 4.6;
/** How long a scan takes (seconds). */
const SCAN_SECONDS = 2.4;
/** How long the scanner's display stays up unless tapped away (seconds). */
const DISPLAY_SECONDS = 9;

export class StoryDirector {
  readonly overlay: StoryOverlay;
  /** The player cannot move (the opening in the dark, a moment of the story). */
  locked = false;
  /** FOR THE TEST PAGES ONLY: the story's clock runs this many times faster (a slow test browser draws 2 frames a second). */
  timeScale = 1;
  /** Where the one played stands, and where the camera is and looks (updated each frame). */
  readonly at = new THREE.Vector3();
  private readonly camera = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** The story's own clock: seconds of PLAY (not paused) since it began. */
  private time = 0;
  /** What the script is waiting for: each checked once a frame, and let go when it comes true. */
  private waits: { test: () => boolean; done: () => void }[] = [];
  private readonly scannables = new Map<string, Scannable>();
  private readonly scannedIds = new Set<string>();
  /** Told of every scan finished (the chapter counts them). */
  onScanned: ((id: string) => void) | null = null;
  /** What each scan's display says (the chapter writes them). */
  reportFor: ((id: string) => ScanReport) | null = null;
  private scanning: { item: Scannable; done: number } | null = null;
  private near: Scannable | null = null;
  private shakeNowAmount = 0;
  private shaking: { strength: number; seconds: number; t: number } | null = null;
  private readonly toward = new THREE.Vector3();

  constructor(host: HTMLElement, private readonly sounds: StorySounds) {
    this.overlay = new StoryOverlay(host);
  }

  // ---- For the chapter's script -------------------------------------------------------------------------------------

  /** Wait until `test()` is true (checked once a frame of play). */
  until(test: () => boolean): Promise<void> {
    return new Promise((done) => { if (test()) done(); else this.waits.push({ test, done }); });
  }

  /** Wait this many seconds of play. */
  wait(seconds: number): Promise<void> {
    const at = this.time + seconds;
    return this.until(() => this.time >= at);
  }

  /**
   * A line spoken: shown as a subtitle for as long as it takes to read (about a third of a second a word, 2.2 to 6 s,
   * or `seconds`), then cleared. Over the radio, with a crackle and hiss.
   */
  async say(who: string, text: string, options: { radio?: boolean; seconds?: number } = {}): Promise<void> {
    const words = text.split(/\s+/).length;
    const seconds = options.seconds ?? Math.min(6, Math.max(2.2, 1.5 + words * 0.32));
    if (options.radio) this.sounds.radioOn();
    this.overlay.say(who, text, !!options.radio);
    await this.wait(seconds);
    if (options.radio) this.sounds.radioOff();
    this.overlay.say(null);
    await this.wait(0.25);
  }

  /** The objective on screen (and the line under it). */
  objective(title: string, line = ''): void { this.overlay.setObjective(title, line); }
  objectiveLine(line: string): void { this.overlay.setObjectiveLine(line); }
  objectiveDone(): void { this.overlay.objectiveDone(); }
  /** A hint under the objective for a few seconds. */
  hint(text: string, seconds = 6): void { this.overlay.showHint(text, seconds); }

  /** WHERE TO GO now: the objective's place (null: nowhere). The game shows the way to it (main.ts, the prologue). */
  waypoint: { readonly x: number; readonly z: number } | null = null;
  setWaypoint(at: { readonly x: number; readonly z: number } | null): void { this.waypoint = at; }

  /** The camera shakes (the stone vibrating): how much (metres, at its strongest) and for how long. */
  shake(strength: number, seconds: number): void { this.shaking = { strength, seconds, t: 0 }; }

  /** Things that can be scanned from now on. */
  addScannables(items: readonly Scannable[]): void { for (const item of items) this.scannables.set(item.id, item); }

  /** Has this been scanned? */
  isScanned(id: string): boolean { return this.scannedIds.has(id); }
  /** How many of these have been scanned. */
  scannedOf(ids: readonly string[]): number { return ids.filter((id) => this.scannedIds.has(id)).length; }

  /** Wait until this has been scanned AND its display has been read (closed). */
  scanned(id: string): Promise<void> {
    return this.until(() => this.scannedIds.has(id) && !this.overlay.displayOpen);
  }

  // ---- For the game, each frame ---------------------------------------------------------------------------------------

  /** How much the camera shakes this frame (metres). */
  get shakeNow(): number { return this.shakeNowAmount; }

  /** The prompt bubble's word now: SCAN near something to scan (null: nothing for the story). */
  promptWord(): string | null {
    if (this.scanning || this.overlay.displayOpen || this.locked) return null;
    return this.near ? 'SCAN' : null;
  }

  /** The prompt bubble was tapped: scan what he is near. */
  act(): void {
    if (!this.near || this.scanning || this.locked) return;
    this.scanning = { item: this.near, done: 0 };
    this.sounds.scanner('start');
    this.sounds.scanner('sweep', SCAN_SECONDS);
  }

  /**
   * Once a frame of PLAY: where he is and where the camera looks; then the scanner, the shake, and whatever the
   * script waits for.
   */
  update(dt: number, x: number, z: number, camera: THREE.Vector3, look: THREE.Vector3): void {
    dt *= this.timeScale;
    this.time += dt;
    this.at.set(x, 0, z);
    this.camera.copy(camera);
    this.look.copy(look).normalize();

    // THE SCANNER: what he is near (and looking at), and a scan reading
    this.near = null;
    if (!this.scanning) {
      let best = Infinity;
      for (const item of this.scannables.values()) {
        if (this.scannedIds.has(item.id)) continue;
        const ground = Math.hypot(item.at.x - x, item.at.z - z);
        if (ground > SCAN_REACH || ground >= best) continue;
        // (on its side of the wall, and the camera turned toward it, roughly)
        const front = (x - item.at.x) * item.facing.x + (z - item.at.z) * item.facing.z;
        this.toward.copy(item.at).sub(this.camera).normalize();
        if (front < 0.2 || this.toward.dot(this.look) < 0.35) continue;
        best = ground;
        this.near = item;
      }
    }
    if (this.scanning) {
      const s = this.scanning;
      if (Math.hypot(s.item.at.x - x, s.item.at.z - z) > SCAN_LOST) {
        // (walked away: the scan is lost)
        this.scanning = null;
        this.overlay.setScanning(null);
        this.hint('Scan lost: stay near the markings while it reads', 4);
      } else {
        s.done += dt / SCAN_SECONDS;
        this.overlay.setScanning(Math.min(1, s.done));
        if (s.done >= 1) {
          this.scanning = null;
          this.overlay.setScanning(null);
          this.scannedIds.add(s.item.id);
          this.sounds.scanner('done');
          const report = this.reportFor?.(s.item.id) ?? { title: 'A.R.C.H. FIELD SCANNER', lines: [] };
          this.overlay.showDisplay(report.title, s.item.inscription, report.lines, DISPLAY_SECONDS, () => undefined);
          this.onScanned?.(s.item.id);
        }
      }
    }
    // (the glow: a scannable one near him glows softly, pulsing; while it reads, brightly; once read, not at all)
    for (const item of this.scannables.values()) {
      const reading = this.scanning?.item === item;
      const glow = reading ? 0.65 + 0.35 * Math.sin(this.time * 14) : item === this.near ? 0.3 + 0.15 * Math.sin(this.time * 4) : 0;
      item.setGlow(glow);
    }

    // THE SHAKE: rising and falling over its time
    if (this.shaking) {
      const k = this.shaking;
      k.t += dt;
      this.shakeNowAmount = k.t >= k.seconds ? 0 : k.strength * Math.sin(Math.PI * (k.t / k.seconds));
      if (k.t >= k.seconds) this.shaking = null;
    } else this.shakeNowAmount = 0;

    // WHAT THE SCRIPT WAITS FOR (each let go once it is true; a let-go wait may add new ones, checked next frame)
    if (this.waits.length) {
      const now = this.waits;
      this.waits = [];
      for (const w of now) {
        if (w.test()) w.done(); else this.waits.push(w);
      }
    }
  }

  dispose(): void {
    this.waits = [];
    this.overlay.dispose();
  }
}
