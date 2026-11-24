// ============================================================================
// floraKit.ts -- THE TOOLS THE SCI-FI FLORA IS BUILT WITH (made in code, no
// downloaded models).
//
// Every plant in flora/ is one model ONE UNIT TALL standing on its foot at the
// origin (as the island's 3D trees are, treeModels.ts), so a planted one is
// the model stretched by its height and turned. These are the pieces they are
// put together from:
//
//   rng / noise3 / fbm  a steady random number generator (the same seed, the
//                       same plant) and smooth noise for mottled colours;
//   Mesher              a model growing point by point: where each point is,
//                       its COLOUR (vertex colours: no pictures at all), its
//                       GLOW (how brightly it shines, whether by day too, how
//                       white its core is) and its BEND (how much the wind
//                       moves it); its surfaces' directions are worked out at
//                       the end from its triangles, so every part is smooth;
//   surface             a grid of points made into triangles, and turned to
//                       face OUT (the way a hint says) so nothing is drawn
//                       inside out (only the front of a triangle is drawn);
//   frames / sweep      a tube along a bent line (stems, stalks, tubes);
//   lathe               a shape turned round an axis from its side outline
//                       (caps, skirts, pods, shelves, a boulder);
//   wart                a small bump sunk into a surface (spots, scales,
//                       pores), so it never flickers against what it sits on.
// ============================================================================
import * as THREE from 'three';

// ---- randomness ----------------------------------------------------------------------------------------------------
/** A steady random number generator: the same seed always gives the same numbers (the same plant). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number 0..1 for a whole-number corner of the noise grid (always the same for the same corner and seed). */
function corner(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** SMOOTH NOISE 0..1: random values at the corners of a grid, blended smoothly in between. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  // (eased, so the blend has no creases at the grid lines)
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => corner(xi + dx, yi + dy, zi + dz, seed);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** Layered noise 0..1 (big blotches with finer ones on top), for mottled caps and streaky stems. */
export function fbm(x: number, y: number, z: number, seed = 0, octaves = 3): number {
  let sum = 0, amp = 1, total = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise3(x * f, y * f, z * f, seed + o * 17) * amp;
    total += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / total;
}

// ---- colours -------------------------------------------------------------------------------------------------------
/** A colour from a hex number (as the island's palette is written: sRGB; three.js keeps it linear inside). */
export const hex = (h: number): THREE.Color => new THREE.Color(h);

/** Two colours blended: `t` 0 is `a`, 1 is `b`. A new colour. */
export function mix(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, Math.min(1, Math.max(0, t)));
}

/** A colour made lighter (k > 1) or darker (k < 1). A new colour. */
export function shade(c: THREE.Color, k: number): THREE.Color {
  return c.clone().multiplyScalar(k);
}

/** How smoothly a number passes from `a` to `b` (0 below a, 1 above b, eased between). */
export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---- the glow written on each point --------------------------------------------------------------------------------
/**
 * A POINT'S GLOW, three numbers (the flora material reads them, floraMaterial.ts):
 *   [0] strength  0 none .. 1 full (a soft edge is a point at 0.3 beside one at 1)
 *   [1] always    1 it glows day and night (dimmer by day), 0 only at night
 *   [2] core      0 the glow's own colour .. 1 near white (the hot middle of a light)
 */
export type Glow = readonly [number, number, number];
export const NO_GLOW: Glow = [0, 0, 0];

// ---- a model growing point by point --------------------------------------------------------------------------------
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3(), _h = new THREE.Vector3();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3();

/** Triangles being gathered for one joined surface, with the votes on which way it faces (Mesher.close). */
export class Patch { tris: number[] = []; vote = 0; }

export class Mesher {
  private pos: number[] = [];
  private col: number[] = [];
  private glw: number[] = [];
  private bnd: number[] = [];
  private idx: number[] = [];

  /** How many points so far. */
  get count(): number { return this.pos.length / 3; }
  /** How many triangles so far. */
  get triangles(): number { return this.idx.length / 3; }

  /** Add a point; its number is returned (for the triangles). */
  add(p: THREE.Vector3, c: THREE.Color, g: Glow = NO_GLOW, bend = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.glw.push(g[0], g[1], g[2]);
    this.bnd.push(bend);
    return this.count - 1;
  }

  /** Where point `i` is (into `out`). */
  at(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  /**
   * A GRID OF POINTS MADE INTO TRIANGLES (one surface, turned to face out on its own: see `patch`). Rows run down
   * the grid, columns across (`wrap`: the last column joins the first, as round a stem). A row may name the same
   * point in every column (the tip of a cap): its triangles become a fan. `out(row, col)` says roughly which way is
   * out at each point.
   */
  surface(grid: number[][], wrap: boolean, out: (row: number, col: number) => THREE.Vector3): void {
    const p = new Patch();
    this.grid(p, grid, wrap, out);
    this.close(p);
  }

  /** Add a grid's triangles to a patch (see `surface`). */
  grid(patch: Patch, grid: number[][], wrap: boolean, out: (row: number, col: number) => THREE.Vector3): void {
    const rows = grid.length, cols = grid[0].length;
    for (let r = 0; r < rows - 1; r++) {
      const last = wrap ? cols : cols - 1;
      for (let s = 0; s < last; s++) {
        const s1 = (s + 1) % cols;
        const p00 = grid[r][s], p01 = grid[r][s1], p11 = grid[r + 1][s1], p10 = grid[r + 1][s];
        this.tri(patch, p00, p01, p11, out(r, s));
        this.tri(patch, p00, p11, p10, out(r, s));
      }
    }
  }

  /**
   * A STITCH between a ring of N points and a ring of 2N round the same way (a cap's top and its gills, which need
   * twice the points): each step of the first ring meets two of the second in three triangles that share every
   * corner, so the two are joined with no gap at all.
   */
  stitch(patch: Patch, ring: number[], ring2: number[], out: (v: number) => THREE.Vector3): void {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a0 = ring[i], a1 = ring[(i + 1) % n];
      const b0 = ring2[2 * i], b1 = ring2[2 * i + 1], b2 = ring2[(2 * i + 2) % (2 * n)];
      this.tri(patch, a0, a1, b1, out(a0));
      this.tri(patch, a0, b1, b0, out(a0));
      this.tri(patch, a1, b2, b1, out(a1));
    }
  }

  /** One triangle into a patch, with its vote on which way is out (a triangle with two corners on one point is none). */
  private tri(patch: Patch, i: number, j: number, k: number, out: THREE.Vector3): void {
    if (i === j || j === k || i === k) return;
    const a = this.at(i, _pa), b = this.at(j, _pb), c = this.at(k, _pc);
    _fn.crossVectors(_e1.subVectors(b, a), _e2.subVectors(c, a));
    if (_fn.lengthSq() < 1e-16) return;
    patch.vote += Math.sign(_fn.dot(_h.copy(out)));
    patch.tris.push(i, j, k);
  }

  /**
   * A PATCH IS FINISHED: its triangles are wound so MOST of them face the way their hints say out (three.js draws
   * only a triangle's front: the side its corners go round anticlockwise). Decided once for the whole patch, so one
   * joined surface is never half one way and half the other.
   */
  close(patch: Patch): void {
    const tris = patch.tris;
    if (patch.vote < 0) for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; }
    for (const t of tris) this.idx.push(t);
    patch.tris = [];
  }

  /** The finished model: points, colours, glow, bend and triangles; each point's facing worked out from its triangles. */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glw, 3));
    g.setAttribute('bend', new THREE.Float32BufferAttribute(this.bnd, 1));
    g.setIndex(this.idx);
    // (SMOOTH: a point shared by several triangles faces the way they face on average; parts that should have a crisp
    //  edge, like a cap's top and its gills, are made of separate points)
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---- frames along a bent line --------------------------------------------------------------------------------------
/** A place along a line: the point, the way the line goes (t) and two directions square to it (u, v = t x u). */
export interface Frame { p: THREE.Vector3; t: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }

/**
 * FRAMES ALONG A LINE that do not twist as the line bends (each one's u carried on from the last: a "parallel
 * transport"), so a tube along it has no corkscrew in it. Upright lines start with u along +x.
 */
export function frames(line: THREE.Vector3[]): Frame[] {
  const out: Frame[] = [];
  const u = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < line.length; i++) {
    const t = new THREE.Vector3().subVectors(line[Math.min(line.length - 1, i + 1)], line[Math.max(0, i - 1)]).normalize();
    u.addScaledVector(t, -u.dot(t));
    if (u.lengthSq() < 1e-8) u.set(0, 0, 1).addScaledVector(t, -t.z);
    u.normalize();
    out.push({ p: line[i].clone(), t, u: u.clone(), v: new THREE.Vector3().crossVectors(t, u) });
  }
  return out;
}

/** A frame standing at `p` with its t along `up` (for a cap on a stem's tip, a bump on a surface...). */
export function frameAt(p: THREE.Vector3, up: THREE.Vector3, hintU = new THREE.Vector3(1, 0, 0)): Frame {
  const t = up.clone().normalize();
  const u = hintU.clone().addScaledVector(t, -hintU.dot(t));
  if (u.lengthSq() < 1e-8) u.set(0, 0, 1).addScaledVector(t, -t.z);
  u.normalize();
  return { p: p.clone(), t, u, v: new THREE.Vector3().crossVectors(t, u) };
}

/** Which way round a frame `a` radians points: u at 0, v at a quarter turn. */
export function around(f: Frame, a: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(f.u).multiplyScalar(Math.cos(a)).addScaledVector(f.v, Math.sin(a));
}

/**
 * ONE RING of points round frame `f`'s axis, `cols` round (from angle `turn`): `at(angle, col)` gives each point's
 * distance out (r), height along the axis (y), colour, glow and bend. If the first point is ON the axis (r = 0) the
 * ring is one point (a tip), named `cols` times so it joins like any other ring.
 */
export function ring(m: Mesher, f: Frame, cols: number, at: (a: number, col: number) => Ring, turn = 0): number[] {
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const first = at(turn, 0);
  if (first.r < 1e-7) {
    p.copy(f.p).addScaledVector(f.t, first.y ?? 0);
    return new Array(cols).fill(m.add(p, first.c, first.g ?? NO_GLOW, first.b ?? 0));
  }
  const out: number[] = [];
  for (let s = 0; s < cols; s++) {
    const a = turn + (s / cols) * Math.PI * 2;
    const k = s === 0 ? first : at(a, s);
    p.copy(f.p).addScaledVector(around(f, a, d), k.r).addScaledVector(f.t, k.y ?? 0);
    out.push(m.add(p, k.c, k.g ?? NO_GLOW, k.b ?? 0));
  }
  return out;
}

/** What one point of a tube or a lathe is: its radius (and height, on a lathe), colour, glow and bend. */
export interface Ring { r: number; y?: number; c: THREE.Color; g?: Glow; b?: number }

/**
 * A TUBE ALONG FRAMES, `sides` round (joined all the way round, so it is smooth with no seam). `ring(row, angle)`
 * says each point's radius, colour, glow and bend. `inward` turns it to face its middle (the inside wall of a tube).
 * The grid of point numbers is returned (to join more to it).
 */
export function sweep(m: Mesher, fr: Frame[], sides: number, ring: (row: number, a: number) => Ring, inward = false, turn = 0): number[][] {
  const grid: number[][] = [];
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < fr.length; i++) {
    const row: number[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + turn;
      const k = ring(i, a);
      p.copy(fr[i].p).addScaledVector(around(fr[i], a, d), k.r);
      row.push(m.add(p, k.c, k.g ?? NO_GLOW, k.b ?? 0));
    }
    grid.push(row);
  }
  const at = new THREE.Vector3();
  m.surface(grid, true, (r, c) => {
    m.at(grid[r][c], at).sub(fr[r].p);
    return inward ? at.negate() : at;
  });
  return grid;
}

/**
 * A LATHE: a shape turned round frame `f`'s axis from its side outline. `rows` points down the outline, `cols` round
 * (all the way round, or only from `from` to `to` radians: a shelf); `at(row, angle)` gives each point's distance
 * from the axis (r) and height along it (y), its colour, glow and bend; a row whose first point has r = 0 is ONE
 * point (the tip: a fan). `hint(row, angle)` is a point inside the shape in the same outline terms (its r and y):
 * out is away from it.
 */
export function lathe(
  m: Mesher, f: Frame, rows: number, cols: number,
  at: (row: number, a: number, col: number) => Ring,
  hint: (row: number, a: number) => { r: number; y: number },
  range?: { from: number; to: number },
): number[][] {
  const grid: number[][] = [];
  const wrap = !range;
  const n = wrap ? cols : cols + 1;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const angle = (s: number) => (wrap ? (s / cols) * Math.PI * 2 : range!.from + (range!.to - range!.from) * (s / cols));
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    const first = at(r, angle(0), 0);
    if (wrap && first.r < 1e-7) {
      // (the tip: one point for the whole row)
      p.copy(f.p).addScaledVector(f.t, first.y ?? 0);
      const one = m.add(p, first.c, first.g ?? NO_GLOW, first.b ?? 0);
      for (let s = 0; s < n; s++) row.push(one);
    } else {
      for (let s = 0; s < n; s++) {
        const a = angle(s);
        const k = s === 0 ? first : at(r, a, s);
        p.copy(f.p).addScaledVector(around(f, a, d), k.r).addScaledVector(f.t, k.y ?? 0);
        row.push(m.add(p, k.c, k.g ?? NO_GLOW, k.b ?? 0));
      }
    }
    grid.push(row);
  }
  const pt = new THREE.Vector3(), centre = new THREE.Vector3();
  m.surface(grid, wrap, (r, c) => {
    const h = hint(r, angle(c));
    centre.copy(f.p).addScaledVector(around(f, angle(c), d), h.r).addScaledVector(f.t, h.y);
    return m.at(grid[r][c], pt).sub(centre);
  });
  return grid;
}

/**
 * A WART: a small round bump sitting on a surface at `p` facing `n` (a spot on a cap, a scale, a pore), `radius`
 * across and `height` proud of it. Its foot is SUNK into the surface, so the two cross and never flicker.
 */
export function wart(m: Mesher, p: THREE.Vector3, n: THREE.Vector3, radius: number, height: number, sides: number, foot: THREE.Color, top: THREE.Color, g: Glow = NO_GLOW, topGlow: Glow = g): void {
  const f = frameAt(p, n);
  const rows = [
    { r: radius, y: -height * 0.9 },
    { r: radius * 0.72, y: height * 0.55 },
    { r: 0, y: height },
  ];
  lathe(m, f, rows.length, sides, (row) => ({ ...rows[row], c: row === 0 ? foot : top, g: row === 0 ? g : topGlow }), () => ({ r: 0, y: -radius }));
}
