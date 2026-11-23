// ============================================================================
// liveBand.ts -- a LIVE BAND: a painted stripe the GAME draws on her, every
// frame, instead of baking it into her picture.
//
// WHY (Joshua, 2026-11-23, Mary's M1 suit in the game at a big belly: "the
// stripes on the side changed with the larger belly. Can we keep it
// consistent?", "just need to make sure the width is the same regardless of
// belly size"; then, with his screenshot, the band's edge ragged: "Yep, it is
// a little bit"). A painted stripe is baked into her colour picture at the
// belly she was baked at (10 %). Two things then go wrong over a growing belly:
//   * it is PAINT, so it STRETCHES with her skin: at 200 % the side band over
//     her belly was twice as wide as at 10 %;
//   * its edge is only as sharp as her picture, and the phone draws her at
//     1024 (core/textureSizes.ts): stretched twice over, the edge's texels show
//     as a blurred, ragged line.
//
// WHAT IS DONE INSTEAD. The bake leaves the band out of her picture and writes,
// for every point of her skin near it, two numbers (band.bin):
//   across  how far the point is from the band's MIDDLE LINE, square to it,
//           measured over her skin as baked (in leg lengths, as the painters
//           measure; minus on one side of the line, plus on the other)
//   half    half the band's width there (0 off the band's ends; its rounded
//           ends are worked into it)
// The game hands them to her skin's shader with each point, and the shader
// draws the band where |across| is under `half` -- after first turning
// `across` into how far it is NOW: her skin there may have stretched since the
// bake (her belly grew) or shrunk (it went down), and the shader measures by
// how much, square to the band, from how `across` changes from one pixel to
// the next on her skin as it is now and on her skin as baked
// (outfitMaterial.ts). So:
//   * the band stays ON THE SAME SKIN: its middle line moves with her belly,
//     as cloth markings do (Joshua: "I don't mind if it goes with the belly");
//   * its WIDTH stays what it was at the bake, at any belly from 0 to 200 %;
//   * its EDGE is worked out for every pixel, so it is sharp at any texture
//     size, as near as the camera comes.
// On the builder's own body (Body: Visual, and the builder's room) the band is
// still plain paint, in its own paint layer (`paintedBand`): that body draws its
// paint itself.
// ============================================================================
import type { LegPlace, MaskPainter, PaintSurface } from './paintMask';

/** Where one point of her trunk is from a band (leg lengths, as the painters measure). */
export interface BandPlace {
  /** How far from the band's middle line, square to it: minus one side, plus the other. */
  readonly across: number;
  /** Half the band's width at the nearest place along it. */
  readonly half: number;
  /** How far past either END of the band the point is, along her (0 between its ends). */
  readonly past: number;
}

/** A band the game draws live on her trunk. */
export interface LiveBand {
  /**
   * Its colour, '#rrggbb': the tint of the builder's smooth Flat cloth it stands for. (A Flat cloth bakes as exactly
   * its tint: MEASURED on Mary's suits, 2026-11-23, teal #18c6c8 baked as 24 199 201, orange as 242 151 29.)
   */
  readonly colour: string;
  /** The paint layer (0 first) the band is painted into on the builder's own body, where it is still paint. */
  readonly layer: number;
  /** Where a point of her trunk (paintMask.ts `trunkPlace`) is from the band. */
  readonly trunk: (place: LegPlace) => BandPlace;
}

/** What a point far from the band is given (leg lengths): far enough to be outside any band. */
export const BAND_FAR = 0.25;
/**
 * Points nearer the band's middle than this (leg lengths, about 12 cm) are written down; the rest are BAND_FAR. Every
 * triangle the band touches then has all three of its points written down (her widest band is 0.04 each side).
 */
const BAND_KEEP = 0.15;
/**
 * A point further than this outside the band's edge (leg lengths, about 5 cm) is given a `half` of 0. Between a point
 * written down and one that is not, `across` jumps (to BAND_FAR, always plus): blended over their triangle it passes
 * through 0, and with a `half` it drew a thin line there, down the front of her belly (the first bake, 2026-11-23).
 */
const BAND_EDGE_ROOM = 0.06;
/** How fine the numbers are kept (leg lengths for each step of a 16-bit number: 8 thousandths of a millimetre). */
const BAND_STEP = 1e-5;

/** Half the band's width at a point, its rounded ends worked in (a circle past each end). */
const halfAt = (place: BandPlace): number => Math.sqrt(Math.max(0, place.half * place.half - place.past * place.past));

/**
 * THE BAND AS PAINT, for the builder's own body: the layer's own painter with the band added to it (how far inside
 * the band each point is, as every painter answers).
 */
export function paintedBand(band: LiveBand, base: MaskPainter | null): MaskPainter {
  return (surface: PaintSurface): Float32Array => {
    const inside = base ? base(surface) : new Float32Array(surface.count).fill(-1);
    const place: LegPlace = { along: 0, turn: 0, radius: 0 };
    for (let v = 0; v < surface.count; v++) {
      if (!surface.trunkPlace(v, place)) continue;
      const at = band.trunk(place);
      inside[v] = Math.max(inside[v], at.half - Math.hypot(at.across, at.past));
    }
    return inside;
  };
}

/** The band's numbers for the points near it: which points, and their `across` and `half` (leg lengths). */
export interface BandPoints {
  /** How many points her whole skin has. */
  readonly count: number;
  readonly index: Uint32Array;
  readonly across: Float32Array;
  readonly half: Float32Array;
}

/** Measure every point of her skin against the band (at the bake: her skin as the builder shaped her). */
export function measureBand(band: LiveBand, surface: PaintSurface): BandPoints {
  const index: number[] = [], across: number[] = [], half: number[] = [];
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (!surface.trunkPlace(v, place)) continue;
    const at = band.trunk(place);
    if (!(Math.abs(at.across) < BAND_KEEP)) continue;
    const half0 = halfAt(at);
    index.push(v); across.push(at.across); half.push(Math.abs(at.across) > half0 + BAND_EDGE_ROOM ? 0 : half0);
  }
  return { count: surface.count, index: Uint32Array.from(index), across: Float32Array.from(across), half: Float32Array.from(half) };
}

/**
 * band.bin: 'GDMB', a version (1), her point count and how many points are written; then their numbers (32-bit),
 * their `across` (16-bit, signed) and their `half` (16-bit), each in steps of BAND_STEP. About 8 bytes a point.
 */
export function packBand(points: BandPoints): Uint8Array {
  const n = points.index.length;
  const bytes = new Uint8Array(16 + n * 8);
  const view = new DataView(bytes.buffer);
  bytes.set([0x47, 0x44, 0x4d, 0x42], 0);   // 'GDMB'
  view.setUint32(4, 1, true);
  view.setUint32(8, points.count, true);
  view.setUint32(12, n, true);
  const step = (x: number, most: number) => Math.round(Math.max(-most, Math.min(most, x)) / BAND_STEP);
  for (let k = 0; k < n; k++) {
    view.setUint32(16 + k * 4, points.index[k], true);
    view.setInt16(16 + n * 4 + k * 2, step(points.across[k], 0.32), true);
    view.setUint16(16 + n * 6 + k * 2, step(points.half[k], 0.65), true);
  }
  return bytes;
}

/**
 * band.bin read back for every point of her skin: two numbers a point (`across`, `half`), the points far from the
 * band given BAND_FAR and 0. What the game hands her shader (shapedBody.ts `bandAt`).
 */
export function unpackBand(buffer: ArrayBuffer, count: number): Float32Array {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'GDMB' || view.getUint32(4, true) !== 1) throw new Error('band.bin is not a band file this game reads');
  if (view.getUint32(8, true) !== count) throw new Error(`band.bin is for ${view.getUint32(8, true)} points, her skin has ${count}`);
  const n = view.getUint32(12, true);
  const out = new Float32Array(count * 2);
  for (let v = 0; v < count; v++) out[v * 2] = BAND_FAR;
  for (let k = 0; k < n; k++) {
    const v = view.getUint32(16 + k * 4, true);
    out[v * 2] = view.getInt16(16 + n * 4 + k * 2, true) * BAND_STEP;
    out[v * 2 + 1] = view.getUint16(16 + n * 6 + k * 2, true) * BAND_STEP;
  }
  return out;
}

/** How many times the band's middle-line distance is smoothed over each point's neighbours as she loads (`smoothBand`). */
export const BAND_SMOOTHING = 48;

/**
 * POINTS IN THE SAME PLACE, AS ONE. Her skin's texture layout is cut into hundreds of small islands, and a point on the
 * edge of one is two (or more) points in the file, one for each island, in the very same place. Anything smoothed over
 * her triangles must treat them as one, or each copy is smoothed with its own island's side and they drift apart: the
 * band cracked along every seam (2026-11-23). For each of `points`, the first point found in the same place (to about a
 * hundred-thousandth of her height); -1 for the rest of her.
 */
export function samePlace(position: Float32Array, points: Iterable<number>): Int32Array {
  const count = position.length / 3, first = new Int32Array(count).fill(-1);
  let low = Infinity, high = -Infinity;
  for (let v = 0; v < count; v++) { const y = position[v * 3 + 1]; if (y < low) low = y; if (y > high) high = y; }
  const step = Math.max(1e-9, (high - low) * 1e-5);
  const seen = new Map<string, number>();
  for (const v of points) {
    const key = `${Math.round(position[v * 3] / step)},${Math.round(position[v * 3 + 1] / step)},${Math.round(position[v * 3 + 2] / step)}`;
    const at = seen.get(key);
    if (at === undefined) { seen.set(key, v); first[v] = v; } else first[v] = at;
  }
  return first;
}

/**
 * SMOOTH THE BAND'S MIDDLE-LINE DISTANCE (`across`) over her skin, in place, as she loads: each point near the band the
 * average of its triangles' averages, `passes` times (about a centimetre round it), points in the same place as one
 * (`samePlace`). Her skin is measured point by point (paintMask.ts `trunkPlace`), so `across` wobbles a little from one
 * point to the next; a painted band hid it in its soft ramp, but an edge drawn sharp for every pixel showed it as small
 * notches (2026-11-23, at every belly). `half` is left as measured (where it is 0, it stays 0: see BAND_EDGE_ROOM).
 * Points far from the band (BAND_FAR) are left as they are and kept out of their neighbours' averages.
 */
export function smoothBand(band: Float32Array, triangles: Uint32Array, position: Float32Array, passes = BAND_SMOOTHING): Float32Array {
  const count = band.length / 2;
  const near = (v: number) => band[v * 2] < BAND_FAR - 1e-6;
  // the triangles whose three points are all near the band, and those points
  const tris: number[] = [], points = new Set<number>();
  for (let t = 0; t < triangles.length; t += 3) {
    if (!near(triangles[t]) || !near(triangles[t + 1]) || !near(triangles[t + 2])) continue;
    tris.push(t); points.add(triangles[t]); points.add(triangles[t + 1]); points.add(triangles[t + 2]);
  }
  const one = samePlace(position, points);
  const sum = new Float32Array(count), weight = new Uint16Array(count);
  for (let pass = 0; pass < passes; pass++) {
    sum.fill(0); weight.fill(0);
    for (const t of tris) {
      const p = triangles[t], q = triangles[t + 1], r = triangles[t + 2];
      const mean = (band[p * 2] + band[q * 2] + band[r * 2]) / 3;
      for (const v of [p, q, r]) { sum[one[v]] += mean; weight[one[v]]++; }
    }
    for (const v of points) band[v * 2] = sum[one[v]] / weight[one[v]];
  }
  return band;
}
