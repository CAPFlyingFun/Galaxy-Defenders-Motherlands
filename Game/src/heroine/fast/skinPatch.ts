// ============================================================================
// skinPatch.ts -- A PIECE OF HER SKIN, MEASURED, for laying a hand on
// (Joshua, 2026-11-20: "lock in around 2mm of the belly's live skin"; "These
// two look off... re-measure and fix").
//
// Her hand on her belly first curled its fingers round a BALL as round as her
// belly under her palm. Measured against her skin as drawn, that was up to 5 mm
// into her in places and her thumb up to 11 mm off: a belly is not a ball over
// the width of a hand. A smooth curved patch fitted to her skin (a quadratic)
// was no better: right under the palm, but out at the fingertips it curved away
// from her real skin by up to a centimetre.
//
// So her skin is now MEASURED ON A GRID: a 26 x 26 cm square laid on her skin at
// the spot (u along her fingers, v across them, h out of her skin; her rest
// frame), each 4 mm cell holding how high her skin is there, from her own skin's
// points as they lie now (her breathing included), read again every few tenths
// of a second while her hand is there. Every finger, her thumb and her palm are
// measured against it: how far a point is out of her skin is its height over the
// grid there, square to the skin (`gap`).
//
// A small smooth fit round the spot itself (within 6 cm: the size of her palm)
// still gives the way her skin faces under her palm and how round it is.
// ============================================================================
import * as THREE from 'three';

/** Half the grid's width, metres: a whole hand from the middle of its palm, and some. */
const HALF = 0.13;
/** One cell of the grid, metres (her skin's points are about 4-6 mm apart on her belly). */
const CELL = 0.004;
/** Cells along each side. */
const SIDE = Math.round((2 * HALF) / CELL) + 1;
/** How far round the spot the smooth fit for her palm reaches, metres. */
const PALM_REACH = 0.06;
/** Points more than this under the outermost one in a cell are another layer of her (under her bust): left out. */
const LAYER = 0.015;

/** A visitor over her skin's points near the spot, each in her rest frame, metres. */
export type SkinSource = (visit: (x: number, y: number, z: number) => void) => void;

export class SkinPatch {
  /** The spot it is laid round, and its directions there: along (u), across (v), out of her skin (h). */
  readonly origin = new THREE.Vector3();
  readonly u = new THREE.Vector3();
  readonly v = new THREE.Vector3();
  readonly n = new THREE.Vector3();
  /** The smooth fit round the spot: h = c + p u + q v + A u^2 + B v^2 + C u v. */
  readonly fit = new Float64Array(6);
  /** Her skin's height in each cell (NaN: none of her there). */
  private readonly grid = new Float32Array(SIDE * SIDE);
  private readonly sum = new Float64Array(SIDE * SIDE * 3);
  private readonly top = new Float32Array(SIDE * SIDE);
  private readonly count = new Uint16Array(SIDE * SIDE);

  constructor(private readonly source: SkinSource) {}

  /**
   * Lay it on her: `origin` the spot, `n` its first-guess facing, `along` the way her fingers lie (all rest frame).
   * False if too few of her points are there to trust.
   */
  layOn(origin: THREE.Vector3, n: THREE.Vector3, along: THREE.Vector3): boolean {
    this.origin.copy(origin);
    this.n.copy(n).normalize();
    this.u.copy(along).addScaledVector(this.n, -along.dot(this.n)).normalize();
    this.v.crossVectors(this.n, this.u);
    if (!this.fitPalm()) return false;
    // (the spot onto her skin, and the frame turned to face as her skin does there; then the fit again in that frame)
    this.origin.addScaledVector(this.n, this.fit[0]);
    this.n.addScaledVector(this.u, -this.fit[1]).addScaledVector(this.v, -this.fit[2]).normalize();
    this.u.addScaledVector(this.n, -this.u.dot(this.n)).normalize();
    this.v.crossVectors(this.n, this.u);
    if (!this.fitPalm()) return false;
    this.refresh();
    return true;
  }

  /** Read her skin's points again into the grid (she breathes; her belly moves a little). */
  refresh(): void {
    const { grid, sum, top, count } = this;
    top.fill(-Infinity); count.fill(0); sum.fill(0);
    // (first the outermost point in each cell, then the mean of those near it: one layer of her, the outer one)
    this.each((u, v, h, cell) => { if (h > top[cell]) top[cell] = h; });
    this.each((u, v, h, cell) => {
      if (h < top[cell] - LAYER) return;
      sum[cell * 3] += u; sum[cell * 3 + 1] += v; sum[cell * 3 + 2] += h; count[cell]++;
    });
    for (let c = 0; c < SIDE * SIDE; c++) grid[c] = count[c] ? sum[c * 3 + 2] / count[c] : NaN;
    // (cells her points missed: from their neighbours, a few rings in)
    for (let pass = 0; pass < 4; pass++) {
      const before = grid.slice();
      for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
        const c = j * SIDE + i;
        if (!Number.isNaN(before[c])) continue;
        let s = 0, k = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= SIDE || jj >= SIDE) continue;
          const w = before[jj * SIDE + ii];
          if (!Number.isNaN(w)) { s += w; k++; }
        }
        if (k >= 3) grid[c] = s / k;
      }
    }
    // (each measured cell's height moved from where its points' middle was to the cell's own middle, by the slope there)
    const rough = grid.slice();
    for (let j = 1; j < SIDE - 1; j++) for (let i = 1; i < SIDE - 1; i++) {
      const c = j * SIDE + i;
      if (!count[c]) continue;
      const gu = (rough[c + 1] - rough[c - 1]) / (2 * CELL), gv = (rough[c + SIDE] - rough[c - SIDE]) / (2 * CELL);
      if (Number.isNaN(gu) || Number.isNaN(gv)) continue;
      const du = sum[c * 3] / count[c] - (i * CELL - HALF), dv = sum[c * 3 + 1] / count[c] - (j * CELL - HALF);
      grid[c] = rough[c] - gu * du - gv * dv;
    }
  }

  /** The way her skin faces under the middle of her palm (rest frame), into `out`. */
  facing(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.n); }

  /** How round her skin is under her palm along her fingers: the curve's radius, metres (0.6 if about flat). */
  curveAlong(): number {
    const bend = -2 * this.fit[3];
    return bend > 1e-3 ? Math.max(0.05, Math.min(0.6, 1 / bend)) : 0.6;
  }

  /**
   * HOW FAR A POINT (rest frame) IS OUT OF HER SKIN, metres (less than 0: inside her): its height over her skin where
   * it is, square to her skin there.
   */
  gap(point: THREE.Vector3): number {
    const px = point.x - this.origin.x, py = point.y - this.origin.y, pz = point.z - this.origin.z;
    const u = px * this.u.x + py * this.u.y + pz * this.u.z, v = px * this.v.x + py * this.v.y + pz * this.v.z;
    const h = px * this.n.x + py * this.n.y + pz * this.n.z;
    // (the grid, read between its four nearest cells)
    const fi = (u + HALF) / CELL, fj = (v + HALF) / CELL;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i >= 0 && j >= 0 && i < SIDE - 1 && j < SIDE - 1) {
      const g = this.grid, c = j * SIDE + i;
      const a = g[c], b = g[c + 1], d = g[c + SIDE], e = g[c + SIDE + 1];
      if (!Number.isNaN(a + b + d + e)) {
        const s = fi - i, t = fj - j;
        const hs = (a * (1 - s) + b * s) * (1 - t) + (d * (1 - s) + e * s) * t;
        const gu = ((b - a) * (1 - t) + (e - d) * t) / CELL, gv = ((d - a) * (1 - s) + (e - b) * s) / CELL;
        return (h - hs) / Math.sqrt(1 + gu * gu + gv * gv);
      }
    }
    // (off the grid, or where none of her is: the smooth fit)
    const f = this.fit, du = f[1] + 2 * f[3] * u + f[5] * v, dv = f[2] + 2 * f[4] * v + f[5] * u;
    return (h - (f[0] + f[1] * u + f[2] * v + f[3] * u * u + f[4] * v * v + f[5] * u * v)) / Math.sqrt(1 + du * du + dv * dv);
  }

  // Her skin's points in this frame: (u, v, h, the grid cell they fall in), those on the grid and on this side of her.
  private each(visit: (u: number, v: number, h: number, cell: number) => void): void {
    const o = this.origin, U = this.u, V = this.v, N = this.n;
    this.source((x, y, z) => {
      const px = x - o.x, py = y - o.y, pz = z - o.z;
      const h = px * N.x + py * N.y + pz * N.z;
      if (h < -0.08 || h > 0.08) return;
      const u = px * U.x + py * U.y + pz * U.z, v = px * V.x + py * V.y + pz * V.z;
      const i = Math.round((u + HALF) / CELL), j = Math.round((v + HALF) / CELL);
      if (i < 0 || j < 0 || i >= SIDE || j >= SIDE) return;
      visit(u, v, h, j * SIDE + i);
    });
  }

  // The smooth fit round the spot, least squares over her points within PALM_REACH. False if too few.
  private fitPalm(): boolean {
    const M = new Float64Array(36), r = new Float64Array(6), row = new Float64Array(6);
    let found = 0;
    this.each((u, v, h) => {
      if (u * u + v * v + h * h > PALM_REACH * PALM_REACH) return;
      row[0] = 1; row[1] = u; row[2] = v; row[3] = u * u; row[4] = v * v; row[5] = u * v;
      for (let a = 0; a < 6; a++) { r[a] += row[a] * h; for (let b = 0; b < 6; b++) M[a * 6 + b] += row[a] * row[b]; }
      found++;
    });
    if (found < 12) return false;
    // (Gaussian elimination with the largest pivot)
    for (let c = 0; c < 6; c++) {
      let best = c;
      for (let a = c + 1; a < 6; a++) if (Math.abs(M[a * 6 + c]) > Math.abs(M[best * 6 + c])) best = a;
      if (Math.abs(M[best * 6 + c]) < 1e-18) return false;
      if (best !== c) { for (let b = 0; b < 6; b++) { const t = M[c * 6 + b]; M[c * 6 + b] = M[best * 6 + b]; M[best * 6 + b] = t; } const t = r[c]; r[c] = r[best]; r[best] = t; }
      for (let a = c + 1; a < 6; a++) { const f = M[a * 6 + c] / M[c * 6 + c]; for (let b = c; b < 6; b++) M[a * 6 + b] -= f * M[c * 6 + b]; r[a] -= f * r[c]; }
    }
    for (let c = 5; c >= 0; c--) { let s = r[c]; for (let b = c + 1; b < 6; b++) s -= M[c * 6 + b] * this.fit[b]; this.fit[c] = s / M[c * 6 + c]; }
    return true;
  }
}
