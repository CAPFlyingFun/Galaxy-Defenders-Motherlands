// ============================================================================
// liveWaist.ts -- A LIVE WAISTBAND: leggings whose top moves as her belly
// grows, drawn by the game (Joshua, 2026-11-23, of Mary's casual M5 and M6,
// the under-belly leggings: "adjust the start stats at 0% look and blend it
// with 200% so as the belly grows it leggings go below the belly like the
// belt"; then his numbers set in the builder at every 50%, 0/50/100/150/200,
// "which I manually adjusted per every 50%").
//
// A baked outfit is a picture: its waistband cannot move. So the BAKE draws the
// leggings at their LOWEST (the least of each of his heights), and her skin
// above that line is in her picture as skin. For each point of her skin in the
// strip, the bake writes how far UNDER EACH OF HIS LINES it is, and under the
// baked one (up her trunk: 0 her hip joints, 1 her neck joint; minus, over it).
// The game blends the two lines either side of her belly now (`waistWeights`)
// and her skin's shader draws the leggings' own colour and shine wherever the
// point is under the blended line (outfitMaterial.ts `WAIST_GLSL`), its edge
// sharp at one pixel.
//
// The lines are the BUILDER'S OWN (bottomCut.ts `waistLine`: one sweep through
// its front, side and back heights, held low across her front by its bowl), and
// each point is measured AS THE BUILDER'S PAINT MEASURES IT (bodyRegions.ts
// `mapBody`, paintTemplates.ts `waistline`): up her trunk by its height between
// her hip joints and her neck joint, round her by how far forward it stands of a
// line through her spine's joints and her side seam (1 her front's middle, a
// half her sides, 0 her back's middle), on her BODY FILE'S REST POINTS (which
// carry the file's own 100% belly) and her joints as she was bound. (The first
// try measured her as baked, at 10%, the way the painted stripes are: its line
// lay about 5 cm under the builder's at her front, and further off at her hips.)
// EXCEPT THE HEIGHTS UP HER TRUNK ARE HER SHAPE'S AS BAKED (10%). Her shape as
// baked does not keep the rest shape's heights evenly from one point to the next
// (the builder: "within 8 mm"), and with the rest heights the edge, drawn sharp at
// every pixel on her skin as she is, came out torn (2026-11-23, at 0%); smoothed,
// it was clean at 0% and wavy at 100%; measured on her shape at each line's own
// belly, the bigger bellies' lines rode up over her belly (her belly's underside
// hangs below the line there; the builder's line keeps to her skin by its rest
// heights). Heights as baked keep to her skin the same way, smooth at every
// belly, a few millimetres from the builder's. Round her is the rest shape's, as
// the builder's (it only slides the line along itself).
// UNDER HER BELLY THE LINE IS THE BUILDER'S HOOP (2026-11-23, builder v0.9.74;
// Joshua, of the game's line at 50 and 100%: "the front legging lines appear too
// low/pointed"). A waistband whose front is under her belly is not a line along
// her skin in the builder: it is a HOOP, a tilted ring hinged at the middle of
// her back and swung down by how far her front stands out, that runs level
// across under her bump (bottomCut.ts `stayAt`, `planeAt`). Along her skin the
// line came to a point under her belly, where the hoop is a shallow U. So for
// every one of his lines that is a hoop (the builder's `lowSpec` gives it a
// hinge: his 50 to 200%), the bake asks the builder itself how far inside the
// hoop each point is (`hoopInside`, as the room draws it), ON HER SHAPE AT THAT
// LINE'S BELLY, and writes that; the lines that are not (his 0%) are measured as
// above. His numbers are read from the builder (`UNDER_BELLY_FOLLOW`,
// `followedAt`: the leggings following her belly, as its own room has them).
// Which points are her trunk (not her arms or head) is told as the stripes tell
// it (paintMask.ts `trunkPlace`).
// ============================================================================
import { waistLine } from '@charb/sarahlab/bottomCut';
import { MAP_LINES } from '@charb/sarahlab/bodyRegions';
import type { LegPlace, PaintSurface } from './paintMask';
import { smoothBand } from './liveBand';

/** One waistband's four numbers: its height at her front's middle, at her sides and at her back's middle, and its bowl. */
export type WaistNumbers = readonly [front: number, side: number, back: number, bowl: number];

/** A look's live waistband (HeroineLook `liveWaist`). */
export interface LiveWaist {
  /** The leggings' layer (0 first): the one the look bakes at `bakedWaist`'s numbers. */
  readonly layer: number;
  /** Where its top is at each belly (%) he set it at, from the smallest belly up: at most WAIST_KEYS_MOST. */
  readonly keys: readonly { readonly belly: number; readonly waist: WaistNumbers }[];
}

/** How many of his lines a look may have (four in one attribute of her skin, one in another). */
export const WAIST_KEYS_MOST = 5;

/**
 * How far UNDER the least of his heights the bake draws the leggings (trunk lengths, about 2 cm). The builder draws a
 * thin dark line about 1.5 cm over a drawn waistband's edge as it bakes; at the least of his heights it showed over the
 * game's edge (2026-11-23, at 100%, where his front is the least of his). Baked this much lower, it is always inside
 * what the game draws.
 */
export const WAIST_BAKED_UNDER = 0.04;

/** The line the bake draws the leggings at: under the least of each of his heights, so every one of his lines is over it. */
export function bakedWaist(w: LiveWaist): WaistNumbers {
  const least = (k: 0 | 1 | 2) => Math.min(...w.keys.map((key) => key.waist[k])) - WAIST_BAKED_UNDER;
  return [+least(0).toFixed(3), +least(1).toFixed(3), +least(2).toFixed(3), w.keys[0].waist[3]];
}

/**
 * How far past the strip a point is still written (trunk lengths; 0.1 is about 5 cm). A point not written reads as far
 * over every line as the file holds, so a triangle with one point written and one not jumps across it, and the drawn
 * edge, softened over how much its number changes from one pixel to the next, was softened over that jump: half drawn,
 * a zig-zag line over the strip and lumps in its edge (2026-11-23, the first try at 0.05). So the written points reach
 * well past the edges, and the softening is held to WAIST_SOFTEST.
 */
export const WAIST_OVER = 0.12;
export const WAIST_BELOW = 0.2;
/** The most an edge is softened over (trunk lengths, about 1 cm): a pixel any bigger is too far off to tell. */
export const WAIST_SOFTEST = 0.02;
/** How far under the BAKED line the game still draws the leggings (trunk lengths, about 1.5 cm): over their own black edging. */
export const WAIST_UNDER = 0.03;
/**
 * The numbers are written as 16-bit whole numbers, -32767..32767 for -WAIST_RANGE..WAIST_RANGE trunk lengths: her
 * skin's shader reads them as -1..1 (a "normalized" attribute) and multiplies back. Half the memory of plain numbers.
 */
export const WAIST_RANGE = 0.32;
/** A point not written: as far over every line as the file holds (never drawn). */
export const WAIST_NONE = -32767;

type V3 = readonly [number, number, number];
/** Her joints at rest that the builder's measures are made from (bodyRegions.ts `mapBody`). */
export interface WaistJoints { readonly pelvis: V3; readonly spine: V3; readonly chest: V3; readonly neck: V3; readonly hipL: V3; readonly hipR: V3 }

/**
 * THE BUILDER'S MEASURES of a point at rest (bodyRegions.ts `mapBody`, copied: it makes its whole map at once): how far
 * up her trunk (0 her hip joints, 1 her neck joint, by height) and round her (1 her front's middle, 0 her back's).
 */
export function builderMeasures(joints: WaistJoints, facing: number): (x: number, y: number, z: number) => { trunk: number; around: number } {
  const J = joints, hipMid: V3 = [(J.hipL[0] + J.hipR[0]) / 2, (J.hipL[1] + J.hipR[1]) / 2, (J.hipL[2] + J.hipR[2]) / 2];
  const trunkLen = Math.max(1e-6, J.neck[1] - hipMid[1]);
  // her spine as a line through her torso's joints (`mapBody`'s `spineZ`)
  const spine = [J.pelvis, J.spine, J.chest, J.neck].slice().sort((a, b) => a[1] - b[1]);
  const spineZ = (y: number): number => {
    if (y <= spine[0][1]) return spine[0][2];
    for (let i = 1; i < spine.length; i++) if (y <= spine[i][1]) { const a = spine[i - 1], b = spine[i], u = (y - a[1]) / Math.max(1e-6, b[1] - a[1]); return a[2] + (b[2] - a[2]) * u; }
    return spine[spine.length - 1][2];
  };
  return (x, y, z) => {
    const dz = (z - spineZ(y)) * facing - MAP_LINES.seamAhead * trunkLen, dx = x - hipMid[0], r = Math.hypot(dx, dz);
    return { trunk: (y - hipMid[1]) / trunkLen, around: r > 1e-9 ? 0.5 + 0.5 * (dz / r) : 0.5 };
  };
}

/** The waist's numbers for the points in or near its strip: which points, and how far under each of his lines and the baked one. */
export interface WaistPoints {
  readonly count: number;
  readonly index: Uint32Array;
  /** One list for each of his lines, in his order, then one for the baked line. */
  readonly under: readonly Float32Array[];
}

/** Which of her points are her trunk (not her arms or head), as the painted stripes tell it: 1 a point, 0 not. */
export function trunkPoints(surface: PaintSurface): Uint8Array {
  const out = new Uint8Array(surface.count), place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) out[v] = surface.trunkPlace(v, place) ? 1 : 0;
  return out;
}

/**
 * THE BAKE: for each point of her trunk (`trunk`) in or near the strip, how far under each of his lines it is, and
 * under the baked one. `lines`: his lines in his order, then the baked one. A line with a list in `told` (the builder's
 * hoop, worked out by the bake: how far inside it every point of her skin is, trunk lengths, + inside) is that; a line
 * without one is measured as the builder's paint has it (`builderMeasures`): round her on her body file's rest points
 * (`rest`), up her trunk on her shape as baked (`baked`: the header says why); three numbers a point, in her bind
 * space, the same points in the same order.
 */
export function measureWaist(
  lines: readonly WaistNumbers[], told: readonly (ArrayLike<number> | null)[], trunk: Uint8Array, rest: ArrayLike<number>, baked: ArrayLike<number>,
  joints: WaistJoints, facing: number,
): WaistPoints {
  if (lines.length < 2 || lines.length > WAIST_KEYS_MOST + 1) throw new Error(`a live waistband has 1 to ${WAIST_KEYS_MOST} lines, and the baked one`);
  if (told.length !== lines.length) throw new Error('measureWaist: a told list (or null) for each line');
  const index: number[] = [], under: number[][] = lines.map(() => []);
  const measure = builderMeasures(joints, facing);
  const d = new Array<number>(lines.length);
  for (let v = 0; v < trunk.length; v++) {
    if (!trunk[v]) continue;
    const at = measure(rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]).around;
    const up = measure(baked[v * 3], baked[v * 3 + 1], baked[v * 3 + 2]).trunk;
    for (let k = 0; k < lines.length; k++) d[k] = told[k] ? told[k]![v] : waistLine(lines[k], at).height - up;
    if (Math.max(...d) < -WAIST_OVER || Math.min(...d) > WAIST_BELOW) continue;
    index.push(v); d.forEach((x, k) => under[k].push(x));
  }
  return { count: trunk.length, index: Uint32Array.from(index), under: under.map((u) => Float32Array.from(u)) };
}

/** A number of trunk lengths as the file writes it. */
const toWhole = (x: number) => Math.round(Math.max(-1, Math.min(1, x / WAIST_RANGE)) * 32767);

/**
 * waist.bin: 'GDMW', a version (2), her point count, how many points are written and how many lists each has (his
 * lines and the baked one); then the points' numbers (32-bit), then each list (16-bit, signed: `toWhole`). About
 * 4 + 2 x lists bytes a point.
 */
export function packWaist(points: WaistPoints): Uint8Array {
  const n = points.index.length, lists = points.under.length;
  const bytes = new Uint8Array(20 + n * 4 + lists * n * 2);
  const view = new DataView(bytes.buffer);
  bytes.set([0x47, 0x44, 0x4d, 0x57], 0);   // 'GDMW'
  view.setUint32(4, 2, true);
  view.setUint32(8, points.count, true);
  view.setUint32(12, n, true);
  view.setUint32(16, lists, true);
  for (let k = 0; k < n; k++) view.setUint32(20 + k * 4, points.index[k], true);
  points.under.forEach((list, j) => { for (let k = 0; k < n; k++) view.setInt16(20 + n * 4 + (j * n + k) * 2, toWhole(list[k]), true); });
  return bytes;
}

/**
 * THE GAME: waist.bin as six numbers a point -- under his lines (the ones he did not set read WAIST_NONE) and, last,
 * under the baked line -- 16-bit, as her skin's attributes take them (shapedBody.ts `waistKeys`, `waistMore`).
 */
export function unpackWaist(file: ArrayBuffer | Uint8Array, count: number): Int16Array {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'GDMW') throw new Error('waist.bin: not a waist file');
  if (view.getUint32(4, true) !== 2) throw new Error('waist.bin: an old waist file (bake the look again)');
  if (view.getUint32(8, true) !== count) throw new Error(`waist.bin: written for ${view.getUint32(8, true)} points, her shape has ${count}`);
  const n = view.getUint32(12, true), lists = view.getUint32(16, true);
  const out = new Int16Array(count * 6).fill(WAIST_NONE);
  for (let j = 0; j < lists; j++) {
    // (his lines in the first five places, the baked one always in the sixth)
    const slot = j === lists - 1 ? 5 : j;
    for (let k = 0; k < n; k++) out[view.getUint32(20 + k * 4, true) * 6 + slot] = view.getInt16(20 + n * 4 + (j * n + k) * 2, true);
  }
  return out;
}

/**
 * How much of each of his lines is drawn at a belly (%): the two either side of it, by how near it is to each (a line
 * at each of his bellies exactly, the first under the first and the last over the last). `bellies` in his order.
 */
export function waistWeights(belly: number, bellies: readonly number[]): number[] {
  const w = new Array<number>(WAIST_KEYS_MOST).fill(0), last = bellies.length - 1;
  if (belly <= bellies[0] || last === 0) { w[0] = 1; return w; }
  if (belly >= bellies[last]) { w[last] = 1; return w; }
  for (let i = 0; i < last; i++) if (belly <= bellies[i + 1]) {
    const t = (belly - bellies[i]) / Math.max(1e-6, bellies[i + 1] - bellies[i]);
    w[i] = 1 - t; w[i + 1] = t; break;
  }
  return w;
}

/**
 * SMOOTHED OVER HER SKIN (liveBand.ts `smoothBand`, 48 passes, about 2 cm), each of the six lists alone, points not
 * written left out. NOT USED since each line is measured on her shape at its own belly: smoothed over her shape as
 * baked (10%), the edge was clean at 0% and wavy at 100% (2026-11-23). Kept for a look measured some other way.
 */
export function smoothWaist(waist: Int16Array, triangles: Uint32Array, position: Float32Array): Int16Array {
  const count = waist.length / 6;
  const written = new Uint8Array(count);
  for (let v = 0; v < count; v++) for (let j = 0; j < 6; j++) if (waist[v * 6 + j] !== WAIST_NONE) { written[v] = 1; break; }
  const pairs = new Float32Array(count * 2);
  for (let j = 0; j < 6; j++) {
    let used = false;
    for (let v = 0; v < count; v++) if (waist[v * 6 + j] !== WAIST_NONE) { used = true; break; }
    if (!used) continue;   // (a line he did not set)
    // (smoothBand smooths the first of each pair, over triangles whose points are all under its "far", 0.25: a point
    //  not written is put far)
    for (let v = 0; v < count; v++) pairs[v * 2] = written[v] ? (waist[v * 6 + j] / 32767) * WAIST_RANGE : 1;
    smoothBand(pairs, triangles, position);
    for (let v = 0; v < count; v++) if (written[v] && pairs[v * 2] < 0.25) waist[v * 6 + j] = toWhole(pairs[v * 2]);
  }
  return waist;
}
