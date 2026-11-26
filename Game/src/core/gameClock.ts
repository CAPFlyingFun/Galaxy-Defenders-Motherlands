// ============================================================================
// gameClock.ts -- THE ONE GAME CLOCK: what day it is and what time of day, for everything that lives on the day.
//
// Joshua, 2026-11-26 (his decisions on the AI brain plan, 2c and 3a): "Adjustable game clock. Keep 6x (4 real hours per
// game day) as the normal gameplay default, but support 1x, 6x, 15x, 30x, 60x, 120x and faster debug simulation. Allow
// sleep fast-forward when appropriate." And: "Daily tiredness, digestion, hunger, bathroom needs and sleep should follow
// game time, while movement, stamina drain, heart rate, breathing and physical exertion should continue using real
// gameplay seconds during normal play."
//
// So the game keeps TWO kinds of time, and this file is the second:
//   - REAL SECONDS: the frame's own time. Her walk, her stamina, her heart and breathing, a sit-down's 3 s all run on it.
//   - GAME TIME (this clock): the time of day the sky shows, and her body's slow clocks: her stomach emptying, her
//     bladder filling, her sleepiness over the day, sleep itself, and the mind's habits (bedtime, meal times).
// The clock runs at `speed` game seconds for each real second: 6 (the default) makes a game day 4 real hours.
//
// SLEEP FAST-FORWARD: when everyone the game is running is asleep, the game sets `fastForward` and the clock runs at
// SLEEP_FAST_SPEED instead (an 8-hour night in 4 real minutes at 120x); whoever wakes clears it.
//
// Pure numbers: no page, no 3D, no game imports. The headless household simulation (scripts/sim_household.ts) runs the
// same clock as the game.
// ============================================================================

/** Seconds in a game day. */
export const DAY_SECONDS = 24 * 3600;

/**
 * THE SPEEDS a player can choose (Settings -> WORLD -> Game speed), game seconds per real second. 0 stops the clock
 * (the sky, digestion and sleepiness hold still: for pictures and tests). The last two are for testing only.
 */
export const CLOCK_SPEEDS = [0, 1, 6, 15, 30, 60, 120, 600] as const;
/** The normal speed (Joshua's 6x: a game day in 4 real hours). */
export const NORMAL_SPEED = 6;
/** How fast the clock runs while everyone is asleep (an 8-hour night in 4 real minutes). */
export const SLEEP_FAST_SPEED = 120;

/** What the clock keeps between games (saving, and moving characters between maps). */
export interface ClockSave {
  readonly day: number;
  readonly secondOfDay: number;
  readonly speed: number;
}

/** The game's one clock. Make one, `advance` it every frame by the real seconds that passed, read `hour`. */
export class GameClock {
  /** Day 1 is the first. */
  day = 1;
  /** Seconds since midnight, 0 .. DAY_SECONDS. */
  secondOfDay: number;
  /** Game seconds for each real second (CLOCK_SPEEDS; any positive number works). 0: stopped. */
  speed: number;
  /** Set while everyone is asleep: the clock runs at SLEEP_FAST_SPEED (if that is faster than `speed`). */
  fastForward = false;
  /** Set while the game is paused (its menu, an outfit change): no game time passes. */
  paused = false;

  constructor(hour = 7, speed = NORMAL_SPEED, day = 1) {
    this.secondOfDay = wrapDay(hour * 3600);
    this.speed = Math.max(0, speed);
    this.day = Math.max(1, Math.floor(day));
  }

  /** Game seconds that pass for each real second NOW (the fast-forward counted in, 0 paused or stopped). */
  get rate(): number {
    if (this.paused || this.speed <= 0) return 0;
    return this.fastForward ? Math.max(this.speed, SLEEP_FAST_SPEED) : this.speed;
  }

  /** Game HOURS for each real second now: what the body's slow clocks are stepped by (heroineVitals.ts). */
  get hoursPerRealSecond(): number {
    return this.rate / 3600;
  }

  /**
   * One frame: `realSeconds` of real time pass. Returns the game seconds that passed (0 paused or stopped), and moves
   * the day on past midnight.
   */
  advance(realSeconds: number): number {
    if (!(realSeconds > 0)) return 0;
    const gameSeconds = realSeconds * this.rate;
    this.skip(gameSeconds);
    return gameSeconds;
  }

  /** Jumps the clock on by `gameSeconds` (a sleep skip, a test), over midnight as many times as it takes. */
  skip(gameSeconds: number): void {
    if (!(gameSeconds > 0)) return;
    const total = this.secondOfDay + gameSeconds;
    this.day += Math.floor(total / DAY_SECONDS);
    this.secondOfDay = total % DAY_SECONDS;
  }

  /** The time of day in hours, 0 .. 24 (7.5 is half past seven in the morning). */
  get hour(): number {
    return this.secondOfDay / 3600;
  }

  /** Sets the time of day (the Time of day slider), keeping the day. */
  setHour(hour: number): void {
    this.secondOfDay = wrapDay(hour * 3600);
  }

  /** Game seconds since the start of day 1: one number that only goes up (the mind's memory is stamped with it). */
  get totalSeconds(): number {
    return (this.day - 1) * DAY_SECONDS + this.secondOfDay;
  }

  /** "07:42". */
  get timeText(): string {
    return clockText(this.hour);
  }

  /** "Day 3 · 07:42". */
  get text(): string {
    return `Day ${this.day} · ${this.timeText}`;
  }

  save(): ClockSave {
    return { day: this.day, secondOfDay: this.secondOfDay, speed: this.speed };
  }

  load(saved: ClockSave): void {
    this.day = Math.max(1, Math.floor(saved.day));
    this.secondOfDay = wrapDay(saved.secondOfDay);
    this.speed = Math.max(0, saved.speed);
  }
}

/** An hour of the day as "HH:MM" (24-hour). */
export function clockText(hour: number): string {
  const minutes = Math.floor(((hour % 24) + 24) % 24 * 60 + 1e-6);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Hours from `from` forward to `to` on a 24-hour face (22 to 6 is 8). */
export function hoursUntil(from: number, to: number): number {
  return (((to - from) % 24) + 24) % 24;
}

/** Whether `hour` lies in the window from `start` to `end`, the window allowed to run past midnight (22 to 6). */
export function inWindow(hour: number, start: number, end: number): boolean {
  return hoursUntil(start, hour) < hoursUntil(start, end);
}

/** Seconds into a day, kept within 0 .. DAY_SECONDS. */
function wrapDay(seconds: number): number {
  return ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
}
