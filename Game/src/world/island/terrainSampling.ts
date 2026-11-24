// ============================================================================
// terrainSampling.ts -- how high the island's ground is at a point, measured
// on the SAME triangles the graphics chip draws.
//
// Brought over from Beyond Extinction's web version (src/engine/terrainSampling.ts,
// main at 70f3f97), where it was worked out and tested; only the device choice
// below is simpler here. No three.js in this file: it is plain arithmetic.
//
// A tile is a P x P height picture (P = 513, rows north to south) drawn as a
// SEG x SEG grid of squares, each square split into two triangles. Anything
// that stands on the ground (the heroine, the weapon table) must stand on those
// drawn triangles and not on a smoother guess between the picture's points,
// or it sinks into the hill or floats over it by up to a few metres.
// ============================================================================

/**
 * How many squares a tile's grid has along each side. A tile is 7 km, so 192 squares are about 36 m each and 256
 * about 27 m. A phone gets 192 (37,000 corners a tile, nine tiles about her); a computer 256. Beyond Extinction
 * measured these on phones. `?seg=` in the address tries another (32..512). Chosen ONCE, when the game opens.
 * This is the grid of the tiles NEAR her; tiles further off use half of it (FAR_TILE_SEG). Each tile remembers which
 * it was built with, and its heights are always read with that one, so the drawn ground and the heights she stands
 * on always agree.
 */
export const SEG: number = (() => {
  try {
    const asked = parseInt(new URLSearchParams(location.search).get('seg') ?? '', 10);
    if (asked >= 32 && asked <= 512) return asked;
    const touch = 'ontouchstart' in globalThis || (navigator.maxTouchPoints || 0) > 0;
    return touch ? 192 : 256;
  } catch {
    return 192;
  }
})();

/** The grid of a tile that is not near her: half as fine, a quarter of the triangles (she is a kilometre or more away). */
export const FAR_TILE_SEG = Math.max(16, Math.round(SEG / 2));

/**
 * A TILE'S NAME from its column and row (0-based): A1 is the north-west tile. Columns go A, B, ... Z, then AA, AB, ...
 * as a spreadsheet's do (v0.2.166: the 32 x 32 and 64 x 64 grids have more than 26 columns; the old one-letter names
 * ran on into symbols past Z). The 8 x 8 and 16 x 16 grids' names are unchanged. scripts/make_island_tiles_n.py names
 * the files the same way.
 */
export function tileIdOf(col: number, row: number): string {
  let letters = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters + (row + 1);
}

/**
 * The height of grid corner (gi, gj) of a tile, 0..SEG each way: the height picture's value at that place, blended
 * from its four nearest points. Exactly what the tile's mesh is built with.
 */
export function vertexHeight(h: ArrayLike<number>, P: number, gi: number, gj: number, seg: number = SEG): number {
  const px = (gi / seg) * (P - 1);
  const py = (gj / seg) * (P - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(P - 1, x0 + 1);
  const y1 = Math.min(P - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  return h[y0 * P + x0] * (1 - tx) * (1 - ty) + h[y0 * P + x1] * tx * (1 - ty) + h[y1 * P + x0] * (1 - tx) * ty + h[y1 * P + x1] * tx * ty;
}

/**
 * The height of the DRAWN ground at a point given from the tile's centre (lx east, lz south, each -S/2..S/2), on a
 * tile built with a grid of `seg` squares.
 * three.js splits each square of the grid along the same diagonal every time (corners 00, 01, 10 make one triangle,
 * 01, 11, 10 the other); this finds which of the two the point is in and reads the height off that flat triangle.
 */
export function renderedSurfaceHeight(h: ArrayLike<number>, P: number, S: number, lx: number, lz: number, seg: number = SEG): number {
  const gu = Math.min(seg, Math.max(0, (lx / S + 0.5) * seg));
  const gv = Math.min(seg, Math.max(0, (lz / S + 0.5) * seg));
  const gi0 = Math.min(seg - 1, Math.floor(gu));
  const gj0 = Math.min(seg - 1, Math.floor(gv));
  const fx = gu - gi0;
  const fz = gv - gj0;
  const h00 = vertexHeight(h, P, gi0, gj0, seg);
  const h10 = vertexHeight(h, P, gi0 + 1, gj0, seg);
  const h01 = vertexHeight(h, P, gi0, gj0 + 1, seg);
  const h11 = vertexHeight(h, P, gi0 + 1, gj0 + 1, seg);
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/**
 * Terrarium colours to metres above the sea (below it, negative): metres = R*256 + G + B/256 - 32768. Nonsense
 * depths (the picture's "no data") are floored at 6 km down. (The tile worker has its own copy of this sum: a
 * worker cannot share the game's code.)
 */
export function decodeElevation(r: number, g: number, b: number): number {
  const e = r * 256 + g + b / 256 - 32768;
  return e < -6000 ? -6000 : e;
}
