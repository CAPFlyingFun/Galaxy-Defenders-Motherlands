// ============================================================================
// loadFirstTime.ts -- the loading bar's shares THE FIRST TIME on a device.
//
// The loading bar (loadMeter.ts) gives each real event of the load the share
// of the bar that it took LAST time on this device. The very first time there
// is no "last time", so one of the two tables below stands in for it.
//
// WHAT THE TABLES ARE. Each is a real first visit to the built game, written
// down by the load meter itself on the test machine (2026-11-17), with the
// connection held to about 1.5 megabytes a second: no files kept from before,
// everything downloaded. Each row is one MARK, in the form the meter remembers
// a load in (loadMeter.ts `LoadMark`):
//
//     [ what happened,  when (seconds),  bytes that arrived before the next mark,  when the last of them arrived ]
//
// On that visit a little under half the time went on files arriving and the
// rest on the work of building her, which is roughly what a phone on an
// ordinary connection sees. One number was changed by hand: the last step,
// drawing the first picture, is given 3 seconds. The test machine has no
// graphics chip and takes three times that; no phone does.
//
// THEY ARE ONLY SHARES. A phone is not the test machine, so on a first load
// the bar may hurry through one part and dawdle through another. It is still
// honest: it only moves when the bytes and the steps named here really
// happen. And it is only for one load: from the second load on, the phone's
// own last load is used, and the time left is shown as well.
//
// IF A FILE OR A STEP IS RENAMED, its row here simply never happens: the bar
// waits for the next row that does. Nothing breaks. To bring a table up to
// date, load the built game once with ?debug=1 in a browser that has never
// opened it and copy `gdm.meter.report().record.marks` from the console.
// ============================================================================
import type { LoadMark, LoadRecord } from './loadMeter';

/** The Performance body with her live body (the game's own settings): a first visit, 66.9 seconds on the test machine. */
const FAST_LIVE: LoadMark[] = [
  ['step world', 0.3, 0, 0.3],
  ['models/Half_Sphere.obj', 0.4, 4567, 1.2],
  ['step Loading Blaze…', 1.3, 0, 1.3],
  ['step Loading Blaze: body…', 1.4, 0, 1.4],
  ['charb/models/sarah-v2-body-slim.glb', 1.4, 0, 1.4],
  ['heroines/blazeSuit/look.json', 1.4, 5134, 1.4],
  ['heroines/blazeSuit/albedo.webp', 1.4, 0, 1.4],
  ['heroines/blazeSuit/normal.webp', 1.4, 0, 1.4],
  ['heroines/blazeSuit/surface.webp', 1.4, 0, 1.4],
  ['heroines/blazeSuit/shape.bin', 1.4, 0, 1.4],
  ['heroines/blazeSuit/pieces.bin', 1.4, 7284782, 6.1],
  ['heroines/blazeSuit/cleavageBridge.webp', 6.1, 0, 6.1],
  ['heroines/blazeSuit/sneaker.webp', 6.1, 13704348, 15.6],
  ['step Loading Blaze: unpacking her body…', 15.7, 0, 15.7],
  ['step Loading Blaze: dressing her…', 16.9, 0, 16.9],
  ['step Loading Blaze: hair…', 17.6, 0, 17.6],
  ['charb/models/hair/ponytail.glb', 17.6, 0, 17.6],
  ['charb/models/hair/ponytail-light.glb', 17.6, 1227516, 18.5],
  ['step Loading Blaze: getting her ready to draw…', 18.9, 0, 18.9],
  // ---- her live body: the Character Builder's room, opened out of sight (left out when "Live body" is off) ----
  ['step live body', 19.4, 0, 19.4],
  ['step live body: body and outfit', 21.2, 0, 21.2],
  ['charb/models/sarah-v2-body-zero.bin', 21.3, 0, 21.3],
  ['charb/models/sarah-v2-body-slim.glb (2)', 21.3, 20134756, 35.3],
  ['charb/models/sarah-v2-body-light.bin', 35.8, 1723680, 37.1],
  ['charb/models/hair/ponytail.glb (2)', 37.9, 0, 37.9],
  ['charb/models/sarah-v2-body-womb.bin', 52.4, 0, 52.4],
  ['charb/models/sarah-v2-body-milk.bin', 52.4, 0, 52.4],
  ['charb/models/sarah-baby.glb', 54.7, 5664604, 57.2],
  ['charb/models/sarah-baby-straight.glb', 58.2, 321248, 59.8],
  ['step live body: painting her panels', 61.5, 0, 61.5],
  ['step live body: ready', 63.4, 0, 63.4],
  // ---- the last two steps: the same for every kind of load ----
  ['step picture', 63.7, 0, 63.7],
  ['step first picture', 63.9, 0, 63.9],
  ['done', 66.9, 0, 66.9],
];

/** The Visual body (the Character Builder's own room is the heroine): a first visit, 49.6 seconds on the test machine. */
const ROOM: LoadMark[] = [
  ['step world', 0.4, 0, 0.4],
  ['models/Half_Sphere.obj', 0.5, 4567, 1.1],
  ['step Loading Blaze…', 1.2, 0, 1.2],
  ['step Loading Blaze: body and outfit…', 1.9, 0, 1.9],
  ['charb/models/sarah-v2-body-zero.bin', 2.0, 0, 2.0],
  ['charb/models/sarah-v2-body-slim.glb', 2.0, 20134756, 15.7],
  ['charb/models/sarah-v2-body-light.bin', 16.2, 1723680, 17.4],
  ['charb/models/hair/ponytail.glb', 18.1, 0, 18.1],
  ['charb/models/sarah-v2-body-womb.bin', 35.3, 0, 35.3],
  ['charb/models/sarah-v2-body-milk.bin', 35.3, 0, 35.3],
  ['charb/models/sarah-baby.glb', 37.8, 5664604, 40.1],
  ['charb/models/sarah-baby-straight.glb', 41.0, 321248, 42.9],
  ['step Loading Blaze: painting her panels…', 44.2, 0, 44.2],
  ['step Loading Blaze: ready…', 45.6, 0, 45.6],
  ['step picture', 46.4, 0, 46.4],
  ['step first picture', 46.6, 0, 46.6],
  ['done', 49.6, 0, 49.6],
];

/** A table as a load record: it lasted as long as its last mark says. */
function asRecord(marks: LoadMark[]): LoadRecord {
  return { seconds: marks[marks.length - 1][1], marks };
}

/**
 * `record` with one stretch of it taken out: everything from the mark called `from` up to (not including) the mark
 * called `to` is dropped, and everything after is moved that much earlier. (If either mark is not there, nothing is
 * taken out.)
 */
function without(record: LoadRecord, from: string, to: string): LoadRecord {
  const start = record.marks.find((mark) => mark[0] === from)?.[1];
  const end = record.marks.find((mark) => mark[0] === to)?.[1];
  if (start === undefined || end === undefined || end <= start) return record;
  const gap = end - start;
  const marks: LoadMark[] = [];
  for (const [name, at, bytes, until] of record.marks) {
    if (at < start) marks.push([name, at, bytes, Math.min(until, start)]);
    else if (at >= end) marks.push([name, at - gap, bytes, until - gap]);
  }
  return { seconds: record.seconds - gap, marks };
}

/**
 * What a first load of this `kind` is measured against (the kinds are loadMeter.ts's `loadKind`: "fast live",
 * "fast", "room", "standin", sometimes followed by the name of a look).
 */
export function firstTimeRecord(kind: string): LoadRecord {
  const words = kind.split(' ');
  if (words.includes('room')) return asRecord(ROOM);
  let record = asRecord(FAST_LIVE);
  // "Live body" off: that stretch of the load is not there.
  if (!words.includes('live')) record = without(record, 'step live body', 'step picture');
  // The stand-in figure is made on the spot: there is nothing of the heroine to load either.
  if (words.includes('standin')) record = without(record, 'step Loading Blaze…', 'step picture');
  return record;
}
