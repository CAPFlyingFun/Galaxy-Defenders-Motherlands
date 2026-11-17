// ============================================================================
// autoDetail.ts -- AUTO detail: "keep a high FPS without losing any details".
//
// Two rules decide her detail level, and the HEAVIER of the two always wins:
//
//   1. WHAT THE EYE CAN SEE (her size on the screen). From how many screen
//      pixels tall she is drawn, a table gives the LIGHTEST level that cannot
//      be told from full detail at that size. Far away in third person that is
//      a light level; close up, and always in first person, it is 100 %.
//      Auto never draws her lighter than this, whatever the frame rate.
//
//   2. WHAT THE PHONE CAN HOLD (Smart FPS). She starts at 100 %. Twice a
//      second the real frame rate is compared with the target (30, 45 or 60):
//        10 % or more under the target  -> one level lighter, then 1.5 s for the frame rate to settle
//        10 % or more over (or as fast as this screen goes) for a while -> one level heavier again
//        in between                     -> hold
//      A step back up that fails soon after waits twice as long before the
//      next try (10 s, 20, 40, 60), so she does not flick back and forth.
//
// So detail is lowered only when the measured frame rate needs it, only one
// level at a time, and never past the point where it could be seen.
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts): rule 1 is its AUTO detail
// by camera distance (v0.35, with its "a level is only left once she is 10 %
// past its edge" so she does not flicker between two), re-measured in screen
// pixels so it holds for any zoom, lens and screen; rule 2 is its SMART FPS
// (v0.52/v0.54: the half-second judging, the 10 % band, the settle time, the
// doubling wait), with the thing it turns changed from "how many people are
// drawn" to "her detail level".
// ============================================================================
import { DETAILS, type Detail } from './detailLevels';

/** The frame rates the player can ask Smart FPS to hold. */
export const TARGET_FPS = [30, 45, 60] as const;
export type TargetFps = (typeof TARGET_FPS)[number];

/**
 * RULE 1's table: drawn at least `pixels` screen pixels tall, she needs at least this level. GAME TUNING, checked
 * against side-by-side pictures (a 25 % body at 200 pixels tall cannot be told from 100 %). Heaviest first.
 */
const NEEDS: readonly { readonly pixels: number; readonly detail: Detail }[] = [
  { pixels: 520, detail: 100 },   // filling most of a phone screen, and every first-person view
  { pixels: 300, detail: 50 },    // the closest third-person zoom
  { pixels: 160, detail: 25 },    // the usual third-person view
  { pixels: 90, detail: 10 },
  { pixels: 50, detail: 5 },
  { pixels: 0, detail: 3 },       // a speck at the far end of the zoom
];
/** A row is only left once she is this share past its edge (the DEV Room's 5 % each way). */
const EDGE = 0.05;

/** Smart FPS's timings (the DEV Room's SMART numbers). */
const SMART = { every: 0.5, band: 0.1, settle: 1.5, probe: 10, probeMost: 60 } as const;

export class AutoDetail {
  /** The frame rate to hold. */
  target: TargetFps = 30;
  /** The measured frame rate, as of the last half second (0 before the first measurement). */
  rate = 0;
  /** What Smart FPS last did, in a word (for the debug readout). */
  doing = 'holding';

  /** Which row of NEEDS she is in (0 = the heaviest). */
  private row = 0;
  /** How many levels lighter than 100 % Smart FPS would like her (0 = full detail). An index into DETAILS. */
  private lighter = 0;
  // Smart FPS's clock and counters
  private seconds = 0;
  private frames = 0;
  private milliseconds = 0;
  private clock = 0;
  private hold = 0;
  private probe: number = SMART.probe;
  private cutAt = -999;
  private raisedAt = -999;
  /** The fastest this screen has gone: a phone in Low Power Mode never passes 30, so "over the target" could never come. */
  private cap = 0;

  /** Start again from full detail (a setting was changed). */
  reset(): void {
    this.lighter = 0; this.seconds = 0; this.frames = 0; this.milliseconds = 0; this.hold = 0;
    this.probe = SMART.probe; this.cutAt = -999; this.raisedAt = -999; this.doing = 'holding';
  }

  /** The lightest level that cannot be told from full detail, drawn `pixels` tall (rule 1 alone). */
  private needed(pixels: number): Detail {
    let row = this.row;
    // heavier as soon as she is clearly inside a heavier row; lighter only once clearly past this row's own edge
    while (row > 0 && pixels > NEEDS[row - 1].pixels * (1 + EDGE)) row--;
    while (row < NEEDS.length - 1 && pixels < NEEDS[row].pixels * (1 - EDGE)) row++;
    this.row = row;
    return NEEDS[row].detail;
  }

  /**
   * One frame.
   * @param frameMs  the real time since the last frame, milliseconds
   * @param pixels   how tall she is drawn, in screen pixels (0 if she is out of view)
   * @returns the detail level she should be drawn at
   */
  update(frameMs: number, pixels: number): Detail {
    const floor = this.needed(pixels);
    this.judge(frameMs, DETAILS.indexOf(floor));
    // The heavier of the two rules: Smart FPS's wish, but never lighter than what the eye needs.
    const wished = DETAILS[Math.min(this.lighter, DETAILS.length - 1)];
    return wished > floor ? wished : floor;
  }

  /** Smart FPS: every half second, compare the frame rate with the target. `floorIndex`: the lightest level allowed now. */
  private judge(frameMs: number, floorIndex: number): void {
    // (back from the background, or a long freeze: not a frame time worth judging by)
    if ((typeof document !== 'undefined' && document.hidden) || frameMs > 3000) { this.seconds = 0; this.frames = 0; this.milliseconds = 0; return; }
    this.frames++;
    this.milliseconds += frameMs;
    this.seconds += frameMs / 1000;
    if (this.seconds < SMART.every) return;
    const rate = (this.frames * 1000) / this.milliseconds, took = this.seconds;
    this.seconds = 0; this.frames = 0; this.milliseconds = 0;
    this.rate = rate;
    this.clock += took;
    this.cap = Math.max(this.cap, Math.min(rate, 125));
    this.hold = Math.max(0, this.hold - took);
    // Smart FPS never asks for lighter than the eye allows (so when she comes close again she is heavy at once).
    if (this.lighter > floorIndex) this.lighter = floorIndex;

    if (rate < this.target * (1 - SMART.band)) {
      if (this.hold > 0) { this.doing = 'waiting'; return; }
      if (this.lighter >= floorIndex) { this.doing = 'at the lightest that cannot be seen'; return; }
      // too slow: ONE level lighter, then time to settle
      // (a step up that failed soon after: wait twice as long before the next)
      this.probe = this.clock - this.raisedAt < 8 ? Math.min(SMART.probeMost, this.probe * 2) : SMART.probe;
      this.lighter++;
      this.hold = SMART.settle;
      this.cutAt = this.clock;
      this.doing = 'lighter';
    } else if (rate >= this.target * (1 + SMART.band) || rate >= this.cap * 0.95) {
      if (this.lighter === 0) { this.doing = 'full detail'; return; }
      // fast for long enough: one level heavier again
      if (this.clock - this.cutAt > this.probe && this.clock - this.raisedAt > this.probe) {
        this.lighter--;
        this.raisedAt = this.clock;
        this.hold = SMART.settle;
        this.doing = 'heavier';
      } else this.doing = 'holding';
    } else this.doing = 'holding';
  }
}
