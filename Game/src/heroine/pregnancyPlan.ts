// ============================================================================
// pregnancyPlan.ts -- her pregnancy as the game plays it: on or off, her belly
// and the week it stands for, off HER OWN chart in the Character Builder.
//
// Joshua, 2026-11-19: "add in settings a toggle pregnancy on/off as well as a
// full range belly slider from 0-200%, but only 10-150% is the default range
// with unlock available... like the CCBS", and the story's plan: her belly at
// 10% for a while; then pregnancy is switched on with her belly still at 10%,
// which is week 12; from there it grows with the weeks (over quests, etc.) to
// 150% at week 42; pregnancy switches off at the birth, and over 3-4 game
// months her belly settles to 30%. And a TIME LAPSE to test it: week 12 to 42
// at one day a second (a week every 7 s), stopping at 42 exactly: 224 s.
//
// The weeks come from the builder's own chart (Char_B/src/sarahlab/baby.ts,
// v0.9.49: her START at week 12, her BIGGEST at her delivery week, on the
// builder's hybrid curve `bellyGrown` between). Blaze's numbers are in her
// look (START 10%, BIGGEST 150% at week 42, END 30%), so the game and the
// builder always give the same week for the same belly.
//
// The birth and the settling after it are for later (the story); this file is
// what both will read.
// ============================================================================
import { EARLY_WEEK, bellyGrown, herChart, herWeek, type PregnancyNumbers } from '@charb/sarahlab/baby';
import { readPregnancy } from '@charb/sarahlab/pregnancy';

/** The belly slider's ranges, percent (as in the builder: its usual range, and all of it once unlocked). */
export const BELLY_RANGE = Object.freeze({ least: 10, most: 150, unlockedLeast: 0, unlockedMost: 200 });
/** THE TIME LAPSE: one day a second, a week every 7 seconds (Joshua). */
export const LAPSE_SECONDS_PER_WEEK = 7;

export class PregnancyPlan {
  /** Her own numbers, as the builder reads them from her look. */
  private readonly numbers: PregnancyNumbers;
  /** Her chart: her START, her BIGGEST and its week, her END. */
  readonly start: number;
  readonly biggest: number;
  readonly deliveryWeek: number;
  readonly after: number;
  /** Whether her look says she is pregnant. */
  readonly lookPregnant: boolean;
  /** The time lapse: the week it is at (null while it is not running). */
  lapseWeek: number | null = null;

  /** @param pregnancy  her look's `body.pregnancy` (the builder's saved-character numbers), or nothing */
  constructor(pregnancy: unknown) {
    const p = readPregnancy(pregnancy);
    this.numbers = p;
    this.lookPregnant = p.pregnant;
    const chart = herChart(1, p);
    this.start = chart.firstWeekBump;
    this.biggest = chart.deliveryBump;
    this.deliveryWeek = chart.deliveryWeek;
    this.after = chart.afterBump;
  }

  /** The week her belly stands for, off her chart (week 12 at her START and under). */
  weekFor(bellyPercent: number): number {
    return herWeek(bellyPercent, 1, this.numbers);
  }

  /**
   * Her belly at a week, off her chart: her START up to week 12, then on the builder's curve to her BIGGEST at her
   * delivery week (the same chart `weekFor` reads, the other way round).
   */
  bellyFor(week: number): number {
    const chart = herChart(1, this.numbers);
    const u = bellyGrown((week - EARLY_WEEK) / Math.max(1e-6, chart.deliveryWeek - EARLY_WEEK));
    const a = chart.anchors;
    if (u <= a[0][1]) return a[0][0];
    for (let i = 1; i < a.length; i++) {
      if (u <= a[i][1]) { const [b0, u0] = a[i - 1], [b1, u1] = a[i]; return b0 + (b1 - b0) * (u - u0) / (u1 - u0); }
    }
    return a[a.length - 1][0];
  }

  /** Start the time lapse at week 12 (her belly at her START). */
  startLapse(): void {
    this.lapseWeek = EARLY_WEEK;
  }

  /**
   * Run the time lapse on by `dt` seconds: one day a second. Returns her belly for the week it has reached; it stops
   * (lapseWeek back to null) on her delivery week exactly.
   */
  stepLapse(dt: number): number {
    if (this.lapseWeek === null) return this.start;
    this.lapseWeek = Math.min(this.deliveryWeek, this.lapseWeek + dt / LAPSE_SECONDS_PER_WEEK);
    const belly = this.bellyFor(this.lapseWeek);
    if (this.lapseWeek >= this.deliveryWeek) this.lapseWeek = null;
    return belly;
  }
}

/** A week as "week 23 + 4 d" (whole days). */
export function weekText(week: number): string {
  const whole = Math.floor(week + 1e-6), days = Math.min(6, Math.floor((week - whole) * 7 + 1e-6));
  return days > 0 ? `week ${whole} + ${days} d` : `week ${whole}`;
}
