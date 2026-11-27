// ============================================================================
// homeNav.ts -- THE WALK GRID: a way round the furniture, not just through the doorways (phase 4 of the AI Brain & Home
// plan). PLAIN NUMBERS: no three.js.
//
// The doorway routes (homeRoutes.ts) are what the mind reasons with: how far a thing is, whether there is a way at all.
// They go straight across a room, and a straight line from the hall to the sofa's middle seat runs into the sofa. So a
// body that really walks (the game's, homeMindBody.ts) asks THIS for its way: the floor of the house cut into squares
// of `CELL` metres, each one free or not for a body of `radius` (every wall, and every thing on the floor, grown by
// that much); A* across the free squares (eight ways, corners not cut), then the corners that are not needed taken out
// (from each point, on to the furthest point it can see in a straight line), so the way is a few straight legs.
//
// THE THING BEING USED IS LET THROUGH: a seat's spot to sit from is in front of the seat, closer than a body's radius,
// and the bed's side is right against the bed. The way to a thing is asked with that thing's id: its own squares are
// free for that walk (the game's walls let the walker through it too: homeScene.ts `walkerWalls`).
//
// SLIDING DOORS ARE FREE: they open as anyone comes near, so the way goes straight through a doorway.
// ============================================================================
import type { Vec2 } from '../../mind/types';

/** The size of a square, metres. GAME TUNING (finer is smoother and slower: about 10,000 squares for the house). */
export const CELL = 0.15;

/** A box on the floor, as homeScene.ts keeps them: its middle, half sizes in its own frame, and the way it faces. */
export interface NavBox {
  readonly cx: number;
  readonly cz: number;
  readonly hx: number;
  readonly hz: number;
  readonly cos: number;
  readonly sin: number;
  /** the thing it is (furniture), or null (a wall) */
  readonly objectId: string | null;
  /** a door: never in the way here (it opens) */
  readonly door: boolean;
}

export class HomeNav {
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  /** 1 a square a wall stops a body on */
  private readonly wall: Uint8Array;
  /** the furniture in the way on a square: -1 none, -2 more than one, else its index in `ids` */
  private readonly owner: Int16Array;
  private readonly ids: string[] = [];
  /** a square more than one thing is in the way on (`owner` -2): which things (their indexes in `ids`) */
  private readonly owners = new Map<number, Set<number>>();
  /** each thing's kin, by id (a chair's table, a table's chairs: SmartObject `partOf`): walking to one lets you through the other */
  private readonly kin = new Map<string, Set<string>>();
  // (the search's own arrays, kept between searches)
  private readonly cost: Float32Array;
  private readonly from: Int32Array;
  private readonly closed: Uint8Array;
  private heap: number[] = [];

  constructor(boxes: readonly NavBox[], bounds: { x0: number; z0: number; x1: number; z1: number }, private readonly radius: number,
    objects: readonly { readonly id: string; readonly partOf?: string }[] = []) {
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    for (const o of objects) {
      if (!o.partOf) continue;
      const a = this.kin.get(o.id) ?? new Set<string>(), b = this.kin.get(o.partOf) ?? new Set<string>();
      a.add(o.partOf);
      b.add(o.id);
      this.kin.set(o.id, a);
      this.kin.set(o.partOf, b);
    }
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / CELL);
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / CELL);
    const n = this.nx * this.nz;
    this.wall = new Uint8Array(n);
    this.owner = new Int16Array(n).fill(-1);
    this.cost = new Float32Array(n);
    this.from = new Int32Array(n);
    this.closed = new Uint8Array(n);
    for (const b of boxes) {
      if (b.door) continue;
      const idx = b.objectId === null ? -1 : this.ids.push(b.objectId) - 1;
      // (the squares within the box's reach and a body's radius, tested one by one)
      const reach = Math.hypot(b.hx, b.hz) + radius;
      const i0 = Math.max(0, Math.floor((b.cx - reach - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.ceil((b.cx + reach - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((b.cz - reach - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.ceil((b.cz + reach - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
          const dx = x - b.cx, dz = z - b.cz;
          const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
          const ox = Math.max(0, Math.abs(lx) - b.hx), oz = Math.max(0, Math.abs(lz) - b.hz);
          if (Math.hypot(ox, oz) >= radius) continue;
          const k = j * this.nx + i;
          if (idx < 0) this.wall[k] = 1;
          else if (this.owner[k] === -1 || this.owner[k] === idx) this.owner[k] = idx;
          else {
            // (a second thing on this square: which ones are kept, so walking to all of them at once can still pass)
            const set = this.owners.get(k) ?? new Set<number>(this.owner[k] >= 0 ? [this.owner[k]] : []);
            set.add(idx);
            this.owners.set(k, set);
            this.owner[k] = -2;
          }
        }
      }
    }
  }

  /**
   * THE WAY from `start` to `end` round the walls and furniture (`using`: the thing being walked to, let through, and
   * the things it belongs with: a dining chair's table), as a few points after `start`, the last of them `end` itself;
   * null if there is no way.
   */
  path(start: Vec2, end: Vec2, using: string | null = null): Vec2[] | null {
    // (the thing walked to, and its kin, let through: every index of a box of theirs)
    const use = new Set<number>();
    if (using !== null) {
      for (const id of [using, ...(this.kin.get(using) ?? [])]) this.ids.forEach((other, i) => { if (other === id) use.add(i); });
    }
    const free = (k: number): boolean => {
      if (this.wall[k] !== 0) return false;
      const o = this.owner[k];
      if (o === -1) return true;
      if (o >= 0) return use.has(o);
      for (const i of this.owners.get(k) ?? []) if (!use.has(i)) return false;
      return use.size > 0;
    };
    const s = this.nearestFree(this.cellOf(start), free), e = this.nearestFree(this.cellOf(end), free);
    if (s < 0 || e < 0) return null;
    const cells = this.search(s, e, free);
    if (!cells) return null;
    // (corners not needed taken out: from each point, on to the furthest it sees in a straight line)
    const points: Vec2[] = [];
    let at = start;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) { if (this.sees(at, this.centre(cells[m]), free)) { far = m; break; } }
      const p = this.centre(cells[far]);
      points.push(p);
      at = p;
      k = far + 1;
    }
    // (the end itself: the last square's middle is near it, and a seat's spot may be on a square that is not free. A walk
    //  to no thing whose end is not free (a person on the sofa, a spot by a wall) ends on the free square nearest it:
    //  walking on into the sofa, the walls held her short and she never arrived)
    const last = using === null && !free(this.cellOf(end)) ? this.centre(e) : end;
    if (points.length && Math.hypot(points[points.length - 1].x - last.x, points[points.length - 1].z - last.z) < CELL * 1.5) points.pop();
    if (points.length && this.sees(points.length > 1 ? points[points.length - 2] : start, last, free)) points.pop();
    points.push({ x: last.x, z: last.z });
    return points;
  }

  /** How many squares are free and stopped (for tests). */
  counts(): { cells: number; walls: number; furniture: number } {
    let walls = 0, furniture = 0;
    for (let k = 0; k < this.wall.length; k++) { if (this.wall[k]) walls++; else if (this.owner[k] !== -1) furniture++; }
    return { cells: this.wall.length, walls, furniture };
  }

  // ---- the squares ------------------------------------------------------------------------------------------------------

  private cellOf(p: Vec2): number {
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor((p.x - this.x0) / CELL)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.floor((p.z - this.z0) / CELL)));
    return j * this.nx + i;
  }

  private centre(k: number): Vec2 {
    return { x: this.x0 + ((k % this.nx) + 0.5) * CELL, z: this.z0 + (Math.floor(k / this.nx) + 0.5) * CELL };
  }

  /** The free square nearest `k` (itself if free), searching outward ring by ring up to a metre; -1 if none. */
  private nearestFree(k: number, free: (k: number) => boolean): number {
    if (free(k)) return k;
    const ci = k % this.nx, cj = Math.floor(k / this.nx);
    for (let r = 1; r <= Math.ceil(1 / CELL); r++) {
      let best = -1, bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
          const kk = j * this.nx + i;
          if (!free(kk)) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bestD) { bestD = d; best = kk; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Whether a straight line from a to b crosses only free squares (looked at every third of a square). */
  private sees(a: Vec2, b: Vec2, free: (k: number) => boolean): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / (CELL / 3)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!free(this.cellOf({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }))) return false;
    }
    return true;
  }

  /** A* from square s to square e, eight ways (a corner only where both its sides are free); the squares, or null. */
  private search(s: number, e: number, free: (k: number) => boolean): number[] | null {
    const nx = this.nx, nz = this.nz, cost = this.cost, from = this.from, closed = this.closed;
    cost.fill(Infinity); closed.fill(0); from.fill(-1);
    const ei = e % nx, ej = Math.floor(e / nx);
    const guess = (k: number): number => {
      const dx = Math.abs((k % nx) - ei), dz = Math.abs(Math.floor(k / nx) - ej);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    this.heap = [];
    const heap = this.heap, score: number[] = [];
    const push = (k: number, f: number): void => {
      heap.push(k); score[k] = f;
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (score[heap[p]] <= score[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = (): number => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && score[heap[l]] < score[heap[m]]) m = l;
          if (r < heap.length && score[heap[r]] < score[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    cost[s] = 0;
    push(s, guess(s));
    while (heap.length) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === e) {
        const out: number[] = [];
        for (let c = e; c !== s; c = from[c]) out.push(c);
        out.reverse();
        return out;
      }
      const i = k % nx, j = Math.floor(k / nx);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const kk = jj * nx + ii;
          if (closed[kk] || !free(kk)) continue;
          if (di && dj && (!free(j * nx + ii) || !free(jj * nx + i))) continue;
          const c = cost[k] + (di && dj ? Math.SQRT2 : 1);
          if (c < cost[kk]) { cost[kk] = c; from[kk] = k; push(kk, c + guess(kk)); }
        }
      }
    }
    return null;
  }
}
