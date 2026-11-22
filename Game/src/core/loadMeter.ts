// ============================================================================
// loadMeter.ts -- how far along the game's loading is, measured HONESTLY.
//
// Joshua, 2026-11-17: "an actual loading bar with percentage and estimated
// time remaining". The splash (index.html, src/ui/splash.ts) draws the bar;
// this file works out the two numbers it shows. Neither is ever made up.
//
// WHAT MOVES THE BAR. Only real things that happen while the game loads:
//   - a STEP beginning ("unpacking her body", "dressing her", ...): the game
//     says so by calling step();
//   - a FILE being asked for, and its BYTES arriving. Nothing in the game has
//     to report those: while the game loads, this file stands in front of the
//     browser's `fetch` (the one door every file the game and the Character
//     Builder download comes through) and counts the bytes of each answer as
//     they arrive. No loader was changed for it.
// A step beginning, or a file being asked for, is a MARK. Marks happen in the
// same order every time, because they are the game's own code running. Bytes
// arriving fill in the stretch between one mark and the next. A timer never
// moves the bar.
//
// HOW MUCH EACH MARK IS WORTH. The game remembers, on this device, the moment
// each mark happened the LAST time it loaded (localStorage), and how many
// bytes arrived before the next one. So when "her hair is asked for" happens
// again, and last time that was 4 seconds into a 20 second load, the bar goes
// to 20%; and while the bytes that followed it last time arrive again, the
// bar moves on toward the next mark in step with them. The bar therefore
// moves at an even pace on the device it is running on, whatever that device
// is good or bad at, and sizes nobody knows ahead of time are known from the
// last load. The very first time, with nothing remembered, a table written
// into loadFirstTime.ts is used in its place: its shares are fixed guesses,
// but what moves the bar along them is still only real bytes and real steps.
//
// THE TIME LEFT. From the same memory: "last time, at this mark, there were
// 12 seconds to go". That is scaled by how fast THIS load has been going
// compared with the last, as a RUNNING AVERAGE over the last 5 seconds only
// (Joshua, 2026-11-19): a part that is slower this time makes the time grow
// rather than sit still or run out. Nothing is told for the first 5 seconds
// (the splash says it is estimating), and changes ease in over a second and a
// half. It is always the whole load's time, never one part's. The first time on
// a device there is nothing to go by, so no time is shown at all, rather than
// a number pulled out of the air. The same if the game was put in the
// background part-way through (its clock would no longer mean anything).
//
// A load that went wrong, or was interrupted, is not remembered.
//
// THE SIZE (Joshua, 2026-11-22: "TRADDOMIUM, BE would show the (Total Size/Current, % download, ETA)"): the bytes
// counted so far, against the bytes the whole load came to LAST time on this device (`bytesExpected`; not known on
// a device's first load, so then only what has arrived is told), and how fast they are arriving now (`bytesPerSecond`,
// over the last 2 seconds). A file the phone already keeps (the game's offline copy) arrives at once and is counted
// the same: what matters is that it is IN.
// ============================================================================
import { firstTimeRecord } from './loadFirstTime';

/**
 * One mark of a load, as it is written down:
 *   name    what happened: "step <key>" (a step began) or a file's name (it was asked for), or "done"
 *   at      when, in seconds from the moment the page was opened
 *   bytes   how many bytes arrived (of any file) between this mark and the next
 *   until   when the last of those bytes arrived, seconds (the same as `at` if there were none)
 */
export type LoadMark = [name: string, at: number, bytes: number, until: number];

/** One load, written down: its marks in the order they happened. */
export interface LoadRecord {
  /** How long the whole load took, seconds. */
  seconds: number;
  marks: LoadMark[];
}

export interface LoadMeter {
  /**
   * A new step of the loading begins. `key` names it, the same every time the game loads (it is what is
   * remembered); `label` is the line the splash shows under the bar.
   */
  step(key: string, label: string): void;
  /**
   * Everything is in: the bar is full. `remember` (true unless told otherwise) writes this load down for next
   * time; pass false for a load that did not go the usual way (her live body failed to open, say).
   */
  finish(remember?: boolean): void;
  /** How far along the loading is, 0 to 1. It only ever rises, and is 1 only after finish(). */
  readonly fraction: number;
  /** The line to show under the bar: what is loading now. */
  readonly label: string;
  /** Seconds left, as nearly as can honestly be told; null when it cannot be told (see the top of this file). */
  secondsLeft(): number | null;
  /** True in the first seconds of a remembered load, before the time left can be told: the splash says it is estimating. */
  readonly estimating: boolean;
  /**
   * True while this is a device's FIRST load of this kind and it is being timed for the next one: no time left can
   * be told yet, and the splash says so. (False once the game has been in the background: that load is not kept.)
   */
  readonly firstLoad: boolean;
  /** True once finish() has been called. */
  readonly finished: boolean;
  /** Bytes of every file this load has fetched so far (from the network or the phone's own store). */
  readonly bytes: number;
  /** What the whole load came to last time on this device, bytes; null when that is not known (a first load). */
  readonly bytesExpected: number | null;
  /** How fast bytes are arriving now, bytes a second (over the last 2 seconds). */
  bytesPerSecond(): number;
  /** Everything the meter knows, for the test scripts and the curious (`gdm.meter.report()` with ?debug=1). */
  report(): LoadReport;
}

export interface LoadReport {
  /** Which kind of load this is (see loadKind below): loads are only compared with loads of the same kind. */
  kind: string;
  /** True if this device remembered an earlier load of this kind; false if the first-time table is being used. */
  remembered: boolean;
  /** Seconds since the page was opened. */
  elapsed: number;
  /** How far along last time's load we are, seconds, and how long that load was. */
  position: number;
  total: number;
  fraction: number;
  /** Bytes counted so far, over every file. */
  bytes: number;
  /** This load so far, in the form it will be remembered in. */
  record: LoadRecord;
}

/** Where the loads are remembered on this device, and how many different kinds of load are kept. */
const STORAGE_KEY = 'gdm.loadRecords';
const KINDS_KEPT = 6;
/**
 * THE TIME LEFT (Joshua, 2026-11-19: "a running 5s average, and it waits to start until 5s after launch until it
 * gets some numbers"): how fast this load is going is judged over the last `window` real seconds only, and no time
 * is told until `waitFirst` seconds after it began (till then the splash says it is estimating).
 */
const RUNNING = { window: 5, waitFirst: 5 } as const;
/** This load is never taken to be going more than four times faster or slower than the last one. */
const PACE_LIMITS = { fastest: 0.25, slowest: 4 } as const;

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
/** A time to the nearest thousandth of a second (what is written down need be no finer). */
/** How long a new reckoning of the time left takes to ease in, seconds (secondsLeft). */
const EASE_SECONDS = 1.5;

const tidy = (seconds: number): number => Math.round(seconds * 1000) / 1000;
/** How far back the download speed is judged, seconds. */
const SPEED_WINDOW = 2;

/**
 * WHICH KIND OF LOAD THIS IS, as a few words: "fast live" (the Performance body with her live body), "fast",
 * "room" (the Visual body), "standin". A load is only ever compared with an earlier load of the same kind: the
 * Visual body takes several times as long as the Performance one, and their steps are different.
 * `settings` is the game's heroine settings (src/heroine/heroineSettings.ts); only two of them matter here.
 */
export function loadKind(settings: { body: string; liveBody: string; map?: string }, address: URLSearchParams = new URLSearchParams(location.search)): string {
  const body = address.get('heroine') === 'standin' ? 'standin' : settings.body === 'performance' ? 'fast' : 'room';
  // (only the fast body can carry the live body; a different look or suit downloads different files)
  const live = body === 'fast' && settings.liveBody === 'on' ? 'live' : '';
  // (the island and the town load quite different files)
  const map = settings.map === 'town' ? '' : 'island';
  return [body, live, map, address.get('look') ?? '', address.get('suit') ?? ''].filter((word) => word !== '').join(' ');
}

/**
 * Did a load of this `kind` turn out the way its kind says: the fast body made (or not), her live body opened (or
 * not)? Only such a load is worth remembering. One where the fast body failed and the Visual body took its place,
 * say, took quite different steps, and would be a poor guide to the next ordinary load.
 */
export function loadedAsPlanned(kind: string, got: { fastBody: boolean; liveBody: boolean }): boolean {
  const words = kind.split(' ');
  return words.includes('fast') === got.fastBody && words.includes('live') === got.liveBody;
}

// ---- Remembering a load on this device --------------------------------------------------------------------------------

interface Kept { version: 2; records: Record<string, LoadRecord & { savedAt: number }> }

function readKept(): Kept {
  try {
    const kept = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Kept | null;
    if (kept && kept.version === 2 && kept.records && typeof kept.records === 'object') return kept;
  } catch { /* nothing kept, private browsing, or not something this version wrote: start afresh */ }
  return { version: 2, records: {} };
}

/** The last load of this kind on this device, if there was one and it is something sensible. */
function readRecord(kind: string): LoadRecord | null {
  const record = readKept().records[kind];
  if (!record || !(record.seconds > 0.2) || !(record.seconds < 900) || !Array.isArray(record.marks)) return null;
  // Only well-formed marks are trusted, and a record with almost nothing in it could not move the bar: it is ignored.
  const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const marks = record.marks.filter((mark): mark is LoadMark =>
    Array.isArray(mark) && typeof mark[0] === 'string' && number(mark[1]) && number(mark[2]) && number(mark[3]) && mark[1] <= record.seconds && mark[3] >= mark[1]);
  return marks.length >= 3 ? { seconds: record.seconds, marks } : null;
}

function writeRecord(kind: string, record: LoadRecord): void {
  try {
    const kept = readKept();
    kept.records[kind] = { ...record, savedAt: Date.now() };
    // (only the few kinds loaded most lately are kept, so this never grows)
    const kinds = Object.keys(kept.records).sort((a, b) => kept.records[b].savedAt - kept.records[a].savedAt);
    for (const old of kinds.slice(KINDS_KEPT)) delete kept.records[old];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch { /* it cannot be remembered: the next load simply shows no time left */ }
}

// ---- The files -------------------------------------------------------------------------------------------------------

/**
 * The name a file is remembered under: its address under the game's own folder, without the "?r=..." some
 * addresses end with (that part changes when the file does). Null for anything that is not a file fetched from
 * the game's own site: a "blob:" address is a picture already in memory being unpacked, not a download.
 */
function fileName(input: RequestInfo | URL, init?: RequestInit): string | null {
  try {
    const asked = typeof Request === 'function' && input instanceof Request ? input : null;
    if ((init?.method ?? asked?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    const address = new URL(asked ? asked.url : String(input), document.baseURI);
    if ((address.protocol !== 'http:' && address.protocol !== 'https:') || address.origin !== location.origin) return null;
    const folder = new URL('./', document.baseURI).pathname;
    return address.pathname.startsWith(folder) ? address.pathname.slice(folder.length) : address.pathname;
  } catch {
    return null;
  }
}

// ---- The meter -------------------------------------------------------------------------------------------------------

/** A note of where the load had got to at a moment: seconds since the page opened, and seconds along last time's load. */
interface Note { at: number; position: number }

/**
 * Start measuring. Call it before the game asks for its first file.
 * `kind` says which kind of load this is (loadKind, above).
 */
export function startLoadMeter(kind: string): LoadMeter {
  // What this load is measured against: the last load of this kind on this device, or the first-time table.
  const kept = readRecord(kind);
  const remembered = kept !== null;
  const last: LoadRecord = kept ?? firstTimeRecord(kind);
  const total = last.seconds;
  /** Last time's marks, by name. */
  const lastMarks = new Map<string, LoadMark>();
  for (const mark of last.marks) if (!lastMarks.has(mark[0])) lastMarks.set(mark[0], mark);

  /** Seconds since the page was opened (the browser's own clock starts there). */
  const now = (): number => performance.now() / 1000;

  // ---- This load, as it happens --------------------------------------------------------------------------------
  /** This load's own marks, in order. This is what gets remembered. Bytes are added to the newest as they arrive. */
  const mine: LoadMark[] = [];
  /** How many times each name has been used (a file asked for twice gets "(2)" the second time). */
  const used = new Map<string, number>();
  /** The furthest mark of LAST time's load that has been reached, and how many bytes have arrived since it was. */
  let reachedLast: LoadMark | null = null, bytesSince = 0;
  /** How far along LAST time's load we are, seconds; and when that last went up. */
  let position = 0, movedAt = 0;
  const notes: Note[] = [];
  let label = '';
  let bytes = 0;
  /** What the whole load came to last time (the bytes of every mark), when it is remembered. */
  const bytesExpected = remembered ? last.marks.reduce((sum, mark) => sum + mark[2], 0) : null;
  /** The bytes counted and when, the last few seconds of them (for the speed). */
  const arrivals: { at: number; bytes: number }[] = [];
  let finished = false;
  /** The game went into the background while loading: its clock means nothing now. No time left is shown, nothing is remembered. */
  let interrupted = typeof document !== 'undefined' && document.hidden;
  const onHidden = (): void => { if (document.hidden) interrupted = true; };
  document.addEventListener('visibilitychange', onHidden);

  const once = (name: string): string => {
    const count = (used.get(name) ?? 0) + 1;
    used.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  };

  /** Move along last time's load to `to` seconds. Never backwards. */
  const advance = (to: number): void => {
    if (!(to > position)) return;
    position = Math.min(to, total);
    movedAt = now();
    // A note for judging this load's pace. Bytes arrive many times a second, so the newest note is only added
    // to when a tenth of a second has gone by; in between it is brought up to date.
    const newest = notes[notes.length - 1];
    if (newest && movedAt - newest.at < 0.1) newest.position = position;
    else {
      notes.push({ at: movedAt, position });
      if (notes.length > 240) notes.shift();
    }
  };

  /** A mark has been reached: write it down, and move to where it was last time (if it was part of that load). */
  const reach = (name: string): void => {
    const at = tidy(now());
    mine.push([name, at, 0, at]);
    const then = lastMarks.get(name);
    // (marks nearly always come in the same order as last time; one that comes early does not take the bar back)
    if (then && (!reachedLast || then[1] >= reachedLast[1])) {
      reachedLast = then;
      bytesSince = 0;
      advance(then[1]);
    }
  };

  /** `count` more bytes have arrived. */
  const counted = (count: number): void => {
    bytes += count;
    const t = now();
    arrivals.push({ at: t, bytes });
    while (arrivals.length > 1 && t - arrivals[0].at > SPEED_WINDOW) arrivals.shift();
    // Written down against this load's newest mark...
    const newest = mine[mine.length - 1];
    if (newest) {
      newest[2] += count;
      newest[3] = tidy(now());
    }
    // ...and the bar moves on from the mark it is at toward the next, by the share of the bytes that arrived
    // there last time which have arrived now. (No bytes arrived there last time: it waits for the next mark.)
    if (reachedLast && reachedLast[2] > 0) {
      bytesSince += count;
      advance(reachedLast[1] + (reachedLast[3] - reachedLast[1]) * Math.min(1, bytesSince / reachedLast[2]));
    }
  };

  // ---- Counting the bytes of every file, as they arrive ---------------------------------------------------------
  const countBytes = async (answer: Response): Promise<void> => {
    try {
      // An answer that is not the file (a "not found" page), or has nothing in it, is not counted.
      if (!answer.ok || !answer.body) return;
      // The game reads the answer itself, untouched. A COPY of it is read here, only to count.
      const reader = answer.clone().body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        counted(value.byteLength);
      }
    } catch { /* the download was cut off: the game deals with that itself; here it is simply not counted */ }
  };

  // The browser's `fetch`, with the counting in front of it. The game is handed the very same answer it would
  // have had (not a changed one), so nothing that loads a file can tell the difference.
  const realFetch = window.fetch;
  const countingFetch: typeof fetch = (input, init) => {
    const answer = realFetch.call(window, input, init);
    const name = finished ? null : fileName(input, init);
    if (name !== null) {
      reach(once(name)); // the file has been asked for: a mark
      // (asked for first, so the copy is taken before the game starts reading the answer)
      void answer.then(countBytes, () => { /* it never arrived: nothing to count */ });
    }
    return answer;
  };
  window.fetch = countingFetch;

  // ---- How fast this load is going, compared with the last -----------------------------------------------------
  /**
   * 1 = exactly as fast as last time, 2 = taking twice as long. Judged over the last few seconds' worth of
   * progress (LOOK_BACK): how long that stretch took this time, against how long it took last time. With little
   * to go on yet it stays near 1.
   *
   * It is judged from the first note onward (the game's code starting), not from the page being opened: how long
   * the page itself took to arrive says nothing about how fast the rest will go.
   */
  /** Where the bar was at `at` (seconds since this load began): the last note at or before it. */
  const positionAt = (at: number): number => {
    let found = 0;
    for (const note of notes) { if (note.at <= at) found = note.position; else break; }
    return found;
  };
  /**
   * THIS LOAD'S PACE, A RUNNING 5-SECOND AVERAGE: of the last `RUNNING.window` real seconds, how much of last time's
   * load did it get through? Seconds now per second then. A bar standing still in that window makes the pace slower
   * (so the time left grows, rather than sitting on a number); never more than four times faster or slower.
   */
  const pace = (): number => {
    const t = now(), from = Math.max(0, t - RUNNING.window);
    const covered = position - positionAt(from);
    if (covered <= 1e-6) return PACE_LIMITS.slowest;
    return clamp((t - from) / covered, PACE_LIMITS.fastest, PACE_LIMITS.slowest);
  };

  /** The time left as last shown, and when (see secondsLeft). */
  let shownLeft: number | null = null, shownAt = 0;

  const record = (): LoadRecord => ({ seconds: tidy(now()), marks: mine.map((mark) => [...mark] as LoadMark) });
  const fraction = (): number => (finished ? 1 : Math.min(0.99, position / total));

  return {
    step(key: string, text: string): void {
      if (finished) return;
      label = text;
      reach(once(`step ${key}`));
    },

    finish(remember = true): void {
      if (finished) return;
      reach('done');
      finished = true;
      // Step aside: the browser's own `fetch` is put back (unless something else has stood in front since).
      if (window.fetch === countingFetch) window.fetch = realFetch;
      document.removeEventListener('visibilitychange', onHidden);
      if (remember && !interrupted) writeRecord(kind, record());
    },

    get fraction(): number { return fraction(); },
    get label(): string { return label; },
    get firstLoad(): boolean { return !remembered && !interrupted; },
    get finished(): boolean { return finished; },
    get bytes(): number { return bytes; },
    get bytesExpected(): number | null { return bytesExpected !== null && bytesExpected > 0 ? bytesExpected : null; },
    bytesPerSecond(): number {
      // (the bytes counted in the last SPEED_WINDOW seconds, over that time; nothing lately: 0)
      const t = now();
      const from = arrivals.find((a) => t - a.at <= SPEED_WINDOW);
      if (!from || t - from.at < 0.25) return 0;
      return (bytes - from.bytes) / (t - from.at);
    },

    secondsLeft(): number | null {
      if (!remembered || interrupted || finished) return null;
      // (nothing told in the first seconds: there is not yet anything to judge the pace by)
      if (now() < RUNNING.waitFirst) return null;
      // THE WHOLE LOAD'S TIME LEFT: what was left at this point last time, at this load's running pace
      const target = (total - position) * pace();
      // ...SHOWN SMOOTHLY: it counts down a second each second, and eases toward each new reckoning over about a second
      // and a half rather than jumping to it
      const t = now();
      if (shownLeft === null) shownLeft = target;
      else {
        const counted = Math.max(0, shownLeft - (t - shownAt));
        shownLeft = counted + (target - counted) * Math.min(1, (t - shownAt) / EASE_SECONDS);
      }
      shownAt = t;
      return shownLeft;
    },
    /** True in the first seconds of a remembered load, before a time left can be told (the splash says it is estimating). */
    get estimating(): boolean { return remembered && !interrupted && !finished && now() < RUNNING.waitFirst; },

    report(): LoadReport {
      return { kind, remembered, elapsed: now(), position, total, fraction: fraction(), bytes, record: record() };
    },
  };
}
