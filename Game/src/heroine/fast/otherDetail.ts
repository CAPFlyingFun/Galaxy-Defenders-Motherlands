// =====================================================================================================================
//  THE DETAIL OF THE ONE NOT BEING PLAYED (Joshua, 2026-11-21: "current player is Auto Lite, anyone within 5m is the
//  same as the player's quality. Beyond 5m is 1% detailed but a smooth transition so it's not a snap from sharp to not
//  so much"; then: "Let's raise it to 20m for mobile, unlimited for PC since it can handle higher graphics")
// ---------------------------------------------------------------------------------------------------------------------
//  The one you play keeps the Detail chosen in Settings (Auto live by default: Smart FPS picks the level from the
//  frame rate). Anyone else, John or Blaze standing by, is drawn:
//
//  ON A PHONE (a touch screen, the same test the island's ground uses, world/island/terrainSampling.ts):
//    * within SAME_WITHIN (20 m) of the player: at the PLAYER'S OWN level, whatever it is at the moment;
//    * from 20 m to ONE_PERCENT_AT (30 m): stepped down the offered levels one at a time (30 -> 25 -> 15 -> 10 -> 5 ->
//      3 -> 2 -> 1 %), spread evenly over those 10 metres, so each step is a small change, not one jump from sharp
//      to 1 %;
//    * past 30 m: 1 %.
//  ON A COMPUTER (no touch screen): always at the player's own level, however far ("unlimited").
//  `?other_near=<metres>` sets the same-level distance by hand for a test (`?other_near=0` tries the ramp up close;
//  the ramp is always 10 m long after it).
//
//  The levels are separate meshes (detailLevels.ts DETAILS), so "smooth" here means many small steps. A step is only
//  taken once the distance is well into the next one (KEEP, three quarters of a step), so walking about right on a
//  line between two levels never flickers between them. It is worked out a few times a second (EVERY), not each
//  frame: a level that has not been made yet is built in the background, and asking for a new one every frame would
//  only queue work.
// =====================================================================================================================

import { DETAILS, type Detail } from './detailLevels';

/** A phone (or tablet): a touch screen. A computer has none. */
const ON_PHONE = (() => {
  try { return 'ontouchstart' in globalThis || (navigator.maxTouchPoints || 0) > 0; } catch { return true; }
})();

/** The same-level distance asked for in the address, for tests (metres), or null. */
const ASKED_NEAR = (() => {
  try {
    const asked = parseFloat(new URLSearchParams(location.search).get('other_near') ?? '');
    return Number.isFinite(asked) && asked >= 0 ? asked : null;
  } catch { return null; }
})();

/** The numbers, in one place to tune. */
export const OTHER_DETAIL = {
  /** Metres from the player inside which the other is drawn at the player's own level: 20 on a phone, every distance
   *  on a computer. */
  sameWithin: ASKED_NEAR ?? (ON_PHONE ? 20 : Infinity),
  /** How many metres past that the other has come down to 1 %; the steps are spread evenly over them. */
  rampMetres: 10,
  /** How far past a step, in steps, the distance must go before the level changes (no flicker on a line). */
  keep: 0.75,
  /** Seconds between looks (a new level may need building, so not every frame). */
  every: 0.2,
};

export class OtherDetail {
  /** The level index (into DETAILS) the other is drawn at now; -1 before the first look. */
  private index = -1;
  /** Seconds until the next look. */
  private wait = 0;

  /** Start again (after a swap: the one standing by is someone else now). */
  reset(): void { this.index = -1; this.wait = 0; }

  /**
   * Each frame: `playerDetail` is the level the player is drawn at NOW, `distance` how far the other stands from the
   * player (metres). Returns a level to give the other when it should change, otherwise null.
   */
  update(dt: number, playerDetail: number, distance: number): Detail | null {
    this.wait -= dt;
    if (this.wait > 0 && this.index >= 0) return null;
    this.wait = OTHER_DETAIL.every;

    // where the player's level sits in the list (the nearest offered one at or below it)
    let from = DETAILS.findIndex((d) => d <= playerDetail);
    if (from < 0) from = DETAILS.length - 1;
    const last = DETAILS.length - 1; // 1 %

    // how far along the ramp the distance is: 0 up to the same-level distance, 1 at the end of the ramp; and so the
    // level it asks for, as a fraction of the way down the list (on a computer always 0: the player's own level)
    const along = Math.min(1, Math.max(0, (distance - OTHER_DETAIL.sameWithin) / OTHER_DETAIL.rampMetres));
    const exact = from + along * (last - from);

    // the first look takes it straight; after that only a change of more than `keep` of a step moves it (and never
    // above the player's own level: the player may have gone lighter since)
    let next = this.index < 0 ? Math.round(exact) : this.index;
    if (this.index >= 0 && Math.abs(exact - this.index) > OTHER_DETAIL.keep) next = Math.round(exact);
    next = Math.max(from, Math.min(last, next));
    if (next === this.index) return null;
    this.index = next;
    return DETAILS[next];
  }
}
