// ============================================================================
// repackUv.ts -- a TEXTURE LAYOUT WITH GAPS for the baked pictures.
//
// THE PROBLEM (seen 2026-11-17, in the game at third-person distance). The body
// file's texture layout is hundreds of small "islands" (patches of her skin
// flattened onto the picture) packed edge to edge with no space between them.
// The builder never minds: its paint is a number on each point, not a picture.
// But a BAKED picture has black leggings in one island touching bare skin in
// the next, and when she is far away the graphics card reads a blurred, smaller
// copy of the picture (a "mip level") in which neighbouring islands are
// averaged together. Thin skin-coloured lines appeared all over her black
// leggings, along every island edge.
//
// THE ANSWER. Give the baked pictures a layout of their own: the SAME islands,
// each one only MOVED (and all of them shrunk by one common factor), with a gap
// round every island. The bake then fills each gap with its island's own
// colours, so a blurred read near an edge still reads that island. Because an
// island is only moved and evenly shrunk, never turned or stretched, everything
// worked out from the layout's directions (the surface-detail picture) stays valid.
//
// The new layout is one (u, v) for every point of her skin, in the file's own
// point order; it is saved in shape.bin and the fast heroine uses it in place
// of the file's.
// ============================================================================
import { uvIslands } from '@charb/sarahlab/storyBake';

export interface Repacked {
  /** The new layout: u, v for each point. */
  readonly uv: Float32Array;
  /** How many islands there are, and the factor every island was shrunk by to make room for the gaps. */
  readonly islands: number;
  readonly scale: number;
}

/**
 * Re-pack a texture layout with a gap of `gap` (in layout units, 0-1) round every island.
 * @param uv     the file's layout, u, v for each point
 * @param index  her triangles (three point numbers each)
 */
export function repackUv(uv: Float32Array, index: ArrayLike<number>, gap: number): Repacked {
  const count = uv.length / 2;
  // Which island each triangle is on (the builder's own helper: triangles sharing a point are on one island).
  const islandOfTriangle = uvIslands(index, count);
  const islandOfPoint = new Int32Array(count).fill(-1);
  let islands = 0;
  for (let t = 0; t < islandOfTriangle.length; t++) {
    const island = islandOfTriangle[t];
    if (island + 1 > islands) islands = island + 1;
    for (let k = 0; k < 3; k++) islandOfPoint[index[t * 3 + k]] = island;
  }
  // each island's bounding box in the file's layout
  const x0 = new Float64Array(islands).fill(Infinity), y0 = new Float64Array(islands).fill(Infinity);
  const x1 = new Float64Array(islands).fill(-Infinity), y1 = new Float64Array(islands).fill(-Infinity);
  for (let v = 0; v < count; v++) {
    const island = islandOfPoint[v];
    if (island < 0) continue; // (a point no triangle uses)
    const x = uv[v * 2], y = uv[v * 2 + 1];
    if (x < x0[island]) x0[island] = x;
    if (x > x1[island]) x1[island] = x;
    if (y < y0[island]) y0[island] = y;
    if (y > y1[island]) y1[island] = y;
  }
  // tallest first, laid in rows ("shelves") across the picture
  const order = Array.from({ length: islands }, (_, i) => i).sort((a, b) => (y1[b] - y0[b]) - (y1[a] - y0[a]));
  const placeX = new Float64Array(islands), placeY = new Float64Array(islands);
  /** Lay every island out at `scale`; returns the height used (it fits when that is 1 or less). */
  const lay = (scale: number): number => {
    let x = gap, y = gap, row = 0;
    for (const island of order) {
      const w = (x1[island] - x0[island]) * scale, h = (y1[island] - y0[island]) * scale;
      if (x + w + gap > 1 && x > gap) { x = gap; y += row + gap; row = 0; }
      placeX[island] = x; placeY[island] = y;
      x += w + gap;
      if (h > row) row = h;
    }
    return y + row + gap;
  };
  // the largest common shrink at which everything fits (found by halving the range a few times)
  let low = 0.2, high = 1;
  for (let k = 0; k < 24; k++) { const mid = (low + high) / 2; if (lay(mid) <= 1) low = mid; else high = mid; }
  const scale = low;
  if (lay(scale) > 1) throw new Error('repack: her texture islands do not fit even at a fifth of their size');
  const out = new Float32Array(count * 2);
  for (let v = 0; v < count; v++) {
    const island = islandOfPoint[v];
    if (island < 0) { out[v * 2] = 0; out[v * 2 + 1] = 0; continue; }
    out[v * 2] = placeX[island] + (uv[v * 2] - x0[island]) * scale;
    out[v * 2 + 1] = placeY[island] + (uv[v * 2 + 1] - y0[island]) * scale;
  }
  return { uv: out, islands, scale };
}
