// ============================================================================
// mind/memory.ts -- WHAT A CHARACTER REMEMBERS, AND THE LOG OF WHY THEY DID WHAT THEY DID.
//
// SHORT TERM: what they did lately (so pastimes vary: Joshua, "Include activity variety so they don't repeatedly choose
// the same recreational activity"), and the things that let them down (a toilet they could not get to, an empty
// fridge), so they do not keep walking at what they cannot have ("Characters should not repeatedly walk toward
// inaccessible objects").
// LONG TERM: their days, counted (meals and how much, drinks, bathroom visits, sleep, pastimes, overeating): what the
// body changes of later phases will read ("Repeated overeating over an extended period may contribute to longer-term
// body changes"), and what the simulation reports.
// THE DECISION LOG (Joshua: "Include decision logging from the beginning"): every choice, switch, emergency, finish and
// failure, with the time, the reason and the scores beside it, so "we understand why a character is doing something
// instead of guessing". Kept to the last `LOG_KEPT` entries.
//
// All plain data: `save()` gives JSON that `load()` takes back (switching maps, saving the game).
// ============================================================================
import type { ActivityId, GameTime } from './types';

/** One thing they did (or tried to). */
export interface Done {
  readonly activity: ActivityId;
  /** game seconds (since day 1 began) it started and ended */
  readonly from: number;
  readonly to: number;
  readonly how: 'finished' | 'interrupted' | 'failed';
}

/** One entry of the decision log. */
export interface LogEntry {
  /** game seconds since day 1 began, and the clock's "Day 2 07:42" */
  readonly at: number;
  readonly when: string;
  readonly kind: 'choose' | 'switch' | 'emergency' | 'finish' | 'fail' | 'interrupt' | 'mode' | 'invite' | 'story' | 'note';
  readonly activity: ActivityId | null;
  readonly text: string;
  /** the best few scores when it chose (activity: score) */
  readonly scores?: Readonly<Record<string, number>>;
}

/** One day's counts. */
export interface DayCounts {
  meals: number;
  /** of those, ended at or past 85% on the food bar */
  bigMeals: number;
  snacks: number;
  foodMl: number;
  drinks: number;
  waterMl: number;
  bathroom: number;
  /** game hours asleep that day (sleep is counted to the day it happens in) */
  sleepHours: number;
  /** pastimes by name: how many times each */
  pastimes: Record<string, number>;
  /** decisions that changed what they were doing before it finished, not for an emergency */
  switches: number;
  emergencies: number;
  failures: number;
  /** game minutes doing nothing at all (no activity, between plans) */
  idleMinutes: number;
}

const LOG_KEPT = 600;
const RECENT_KEPT = 80;

export class Memory {
  readonly recent: Done[] = [];
  /** things that let them down: object id -> game seconds until they try it again */
  readonly avoid = new Map<string, number>();
  /** how many times in a row each thing has let them down (cleared when it works) */
  private readonly fails = new Map<string, number>();
  readonly days = new Map<number, DayCounts>();
  readonly log: LogEntry[] = [];

  /** A thing let them down: avoided for 10 game minutes the first time, 45 after that. */
  failed(objectId: string, now: number): void {
    const n = (this.fails.get(objectId) ?? 0) + 1;
    this.fails.set(objectId, n);
    this.avoid.set(objectId, now + (n >= 2 ? 45 : 10) * 60);
  }

  /** A thing worked: forgiven. */
  worked(objectId: string): void {
    this.fails.delete(objectId);
    this.avoid.delete(objectId);
  }

  /** Whether they are steering clear of a thing now. */
  avoiding(objectId: string, now: number): boolean {
    const until = this.avoid.get(objectId);
    if (until === undefined) return false;
    if (now >= until) { this.avoid.delete(objectId); return false; }
    return true;
  }

  /** Something done (or tried): remembered, and counted. */
  did(d: Done): void {
    this.recent.push(d);
    if (this.recent.length > RECENT_KEPT) this.recent.shift();
  }

  /** How long ago (game hours) they last did an activity, or Infinity. */
  hoursSince(activity: ActivityId, now: number): number {
    for (let i = this.recent.length - 1; i >= 0; i--) if (this.recent[i].activity === activity) return (now - this.recent[i].to) / 3600;
    return Infinity;
  }

  /** How many times they did an activity in the last `hours` game hours. */
  timesSince(activity: ActivityId, now: number, hours: number): number {
    let n = 0;
    for (let i = this.recent.length - 1; i >= 0 && now - this.recent[i].to <= hours * 3600; i--) if (this.recent[i].activity === activity) n++;
    return n;
  }

  /** Today's counts (made the first time asked). */
  day(day: number): DayCounts {
    let d = this.days.get(day);
    if (!d) {
      d = { meals: 0, bigMeals: 0, snacks: 0, foodMl: 0, drinks: 0, waterMl: 0, bathroom: 0, sleepHours: 0, pastimes: {}, switches: 0, emergencies: 0, failures: 0, idleMinutes: 0 };
      this.days.set(day, d);
    }
    return d;
  }

  /** A line in the decision log. */
  note(time: GameTime, when: string, kind: LogEntry['kind'], activity: ActivityId | null, text: string, scores?: Record<string, number>): LogEntry {
    const entry: LogEntry = { at: time.seconds, when, kind, activity, text, ...(scores ? { scores } : {}) };
    this.log.push(entry);
    if (this.log.length > LOG_KEPT) this.log.shift();
    return entry;
  }

  /** What is kept between games (the log's last 100 lines, the recent list, the avoid list, the day counts). */
  save(): unknown {
    return {
      recent: this.recent.slice(),
      avoid: [...this.avoid.entries()],
      days: [...this.days.entries()],
      log: this.log.slice(-100),
    };
  }

  load(saved: unknown): void {
    const s = saved as { recent?: Done[]; avoid?: [string, number][]; days?: [number, DayCounts][]; log?: LogEntry[] };
    this.recent.splice(0, this.recent.length, ...(s.recent ?? []));
    this.avoid.clear();
    for (const [k, v] of s.avoid ?? []) this.avoid.set(k, v);
    this.days.clear();
    for (const [k, v] of s.days ?? []) this.days.set(k, v);
    this.log.splice(0, this.log.length, ...(s.log ?? []));
  }
}
