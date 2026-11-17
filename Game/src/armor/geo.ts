// ============================================================================
// geo.ts -- the small geometry toolkit every armor piece is built with.
//
// An armor piece is made of PARTS (a shell, a plate, a glow strip...). Each
// part is a little BufferGeometry made by one of the shape functions below.
// A PieceBuilder collects the parts, gives each one a FINISH (its colour and
// whether it glows or is visor glass) and at the end MERGES them all into ONE
// mesh with ONE material, so a whole helmet or boot is a single draw call.
//
// How the finish travels: three numbers are stored on every corner (vertex):
//   * `color`    the paint colour (the standard three.js vertex colour);
//   * `armorFx`  x = glow (0 = paint, 1 = a light strip),
//                y = roughness (0 = mirror, 1 = chalk),
//                z = visor (1 = tinted glass with a bright rim).
// The shared armor material (materials.ts) reads them in its shader.
//
// SMOOTH OR HARD EDGES. three.js works a corner's "normal" (which way the
// surface faces there) out from the triangles that share that corner:
//   * parts whose triangles SHARE corners (an "indexed" geometry) come out
//     smoothly rounded;
//   * parts whose triangles each have their OWN three corners come out flat
//     and faceted, with crisp edges.
// So every shape function simply chooses which of the two it builds.
//
// WINDING. A triangle is only drawn from the side where its corners run
// anticlockwise. Every function here works out which side is "outside" for
// itself, so a piece never comes out inside-out.
//
// Units: metres. Y is up.
// ============================================================================
import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Finishes
// ----------------------------------------------------------------------------

/** How one part of a piece is painted. */
export interface Finish {
  /** Paint colour, as a hex number (0xff2a8a). */
  readonly color: number;
  /** 0 = ordinary paint, 1 = a glowing light strip. */
  readonly glow?: number;
  /** 0 = mirror smooth, 1 = chalky. Painted armor is about 0.4. */
  readonly rough?: number;
  /** 1 = visor glass (dark, glossy, with a bright rim where it curves away from the eye). */
  readonly visor?: number;
  /**
   * Optional: change the colour corner by corner (for a visor's top-to-bottom tint). Given the corner's position
   * in the piece's own frame; write the colour into `c` (it starts as `color`).
   */
  readonly shade?: (p: THREE.Vector3, c: THREE.Color) => void;
}

/** Glossy painted armor. */
export const paint = (color: number, rough = 0.38): Finish => ({ color, rough });
/** The dark, slightly rubbery under-armor: joints, straps, soles, gun bodies. */
export const dark = (color = 0x17181d, rough = 0.62): Finish => ({ color, rough });
/** A light strip. */
export const glow = (color: number, strength = 1): Finish => ({ color, glow: strength, rough: 0.5 });
/** Visor glass. */
export const visorGlass = (color: number, shade?: Finish['shade']): Finish => ({ color, rough: 0.12, visor: 1, shade });

// ----------------------------------------------------------------------------
// A loose bag of triangles (flat, hard-edged parts are built with this)
// ----------------------------------------------------------------------------

const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _n = new THREE.Vector3();

/** Collects triangles one by one; each gets its own three corners, so the result is flat shaded. */
export class TriSoup {
  private readonly p: number[] = [];

  /** Add a triangle. If `hint` is given the triangle is turned to face that way. Slivers of no area are skipped. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hint?: THREE.Vector3): void {
    _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(c, a));
    if (_n.lengthSq() < 1e-16) return;
    if (hint && _n.dot(hint) < 0) this.p.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  /** Add a four-cornered face (corners given going round it). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hint?: THREE.Vector3): void {
    this.tri(a, b, c, hint);
    this.tri(a, c, d, hint);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    return g;
  }
}

/** Turn every triangle of a geometry over (used when a part is mirrored, which would otherwise show its inside). */
export function flipWinding(g: THREE.BufferGeometry): void {
  if (g.index) {
    const a = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position.array as Float32Array;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
  }
}

/** Move every corner of a geometry with a function (bend, taper, squash). */
export function warp(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Make a smooth part faceted: every triangle gets its own corners. */
export function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) return g;
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

// ----------------------------------------------------------------------------
// grid: a smooth sheet from a function (domes, shells, patches, tubes)
// ----------------------------------------------------------------------------

/** Gives the point of a surface at (u, v), both running 0 to 1. */
export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => void;

export interface GridOptions {
  /** The sheet joins up with itself in the u direction (a tube, a ball). */
  readonly closeU?: boolean;
  /**
   * A point the sheet should face AWAY from (default: the origin). For a dome this is anywhere inside it.
   * Pass `faceToward: true` as well to make it face the point instead (an inner lining).
   */
  readonly from?: THREE.Vector3;
  readonly faceToward?: boolean;
}

/** A smooth sheet of nu x nv squares, its corners placed by `fn`. */
export function grid(nu: number, nv: number, fn: SurfaceFn, opts: GridOptions = {}): THREE.BufferGeometry {
  const cols = opts.closeU ? nu : nu + 1, rows = nv + 1;
  const pos = new Float32Array(cols * rows * 3), v = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      fn(i / nu, j / nv, v);
      pos.set([v.x, v.y, v.z], (j * cols + i) * 3);
    }
  }
  const at = (i: number, j: number) => j * cols + (i % cols);
  const P = (k: number, out: THREE.Vector3) => out.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const idx: number[] = [];
  const from = opts.from ?? new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), mid = new THREE.Vector3();
  let facing = 0; // adds up how much the sheet, as first built, faces away from `from`
  const push = (a: number, b: number, c: number) => {
    P(a, pa); P(b, pb); P(c, pc);
    _n.crossVectors(_ab.subVectors(pb, pa), _ac.subVectors(pc, pa));
    if (_n.lengthSq() < 1e-16) return; // (a sliver at a pole)
    facing += _n.dot(mid.copy(pa).add(pb).add(pc).multiplyScalar(1 / 3).sub(from));
    idx.push(a, b, c);
  };
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      push(a, b, c);
      push(a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  if ((facing < 0) !== !!opts.faceToward) flipWinding(g);
  return g;
}

/** A round tube along a curve (hoses, pipes). */
export function tube(curve: THREE.Curve<THREE.Vector3>, radius: number, along = 16, around = 8): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(along, false), c = new THREE.Vector3();
  const g = grid(around, along, (u, v, out) => {
    const k = Math.round(v * along), a = u * Math.PI * 2;
    curve.getPointAt(v, c);
    out.copy(c).addScaledVector(frames.normals[k], Math.cos(a) * radius).addScaledVector(frames.binormals[k], Math.sin(a) * radius);
  }, { closeU: true });
  // (a tube has no single "inside point", so its facing is settled here: away from its own centre line)
  const pos = g.attributes.position as THREE.BufferAttribute, idx = g.index!.array;
  const a = new THREE.Vector3().fromBufferAttribute(pos, idx[0]), b = new THREE.Vector3().fromBufferAttribute(pos, idx[1]), d = new THREE.Vector3().fromBufferAttribute(pos, idx[2]);
  _n.crossVectors(_ab.subVectors(b, a), _ac.subVectors(d, a));
  curve.getPointAt(0, c);
  if (_n.dot(a.sub(c)) < 0) flipWinding(g);
  return g;
}

// ----------------------------------------------------------------------------
// revolve: a profile spun round the Y axis (barrels, discs, rings, cuffs)
// ----------------------------------------------------------------------------

export interface RevolveOptions {
  /** How many steps round. */
  readonly seg?: number;
  /** The profile's last point joins back to its first (a ring with a hole through it). */
  readonly closed?: boolean;
  /** Only part of the way round: [from, to] in radians (0 = toward +Z, a quarter turn = toward +X). */
  readonly arc?: readonly [number, number];
  /** A bend in the profile sharper than this (radians) becomes a hard edge. */
  readonly crease?: number;
}

/**
 * Spin a profile of [radius, y] points round the Y axis. Round the axis it is smooth; along the profile, gentle
 * bends are smooth and sharp ones are hard edges. With `closed` and an `arc`, the two cut ends are capped.
 * A profile that starts and ends on the axis (radius 0) makes a closed solid.
 */
export function revolve(profile: ReadonlyArray<readonly [number, number]>, opts: RevolveOptions = {}): THREE.BufferGeometry {
  const seg = opts.seg ?? 16, closed = !!opts.closed, crease = opts.crease ?? 0.6;
  const n = profile.length, bands = closed ? n : n - 1;
  const full = !opts.arc, a0 = opts.arc ? opts.arc[0] : 0, a1 = opts.arc ? opts.arc[1] : Math.PI * 2;
  const per = full ? seg : seg + 1; // corners in one ring
  const pos: number[] = [], idx: number[] = [];
  const ring = (k: number): number => {
    const start = pos.length / 3, [r, y] = profile[k];
    for (let i = 0; i < per; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
    }
    return start;
  };
  // Which way does the profile run? (Worked out as the area it encloses against the axis: positive = the triangle
  // order used below already faces outward.)
  let area = 0;
  const loop: Array<readonly [number, number]> = closed ? [...profile] : [[0, profile[0][1]], ...profile, [0, profile[n - 1][1]]];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const flip = area < 0;
  const dir = (b: number) => {
    const p = profile[b], q = profile[(b + 1) % n];
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  };
  const sharp = (b0: number, b1: number) => {
    let d = Math.abs(dir(b0) - dir(b1));
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d > crease;
  };
  const first = ring(0);
  let start = first;
  for (let b = 0; b < bands; b++) {
    const k1 = (b + 1) % n;
    const last = b === bands - 1;
    // the ring this band ends on: a new one, unless the loop closes smoothly back onto the very first
    const end = last && closed && !sharp(b, 0) ? first : ring(k1);
    const r0 = profile[b][0], r1 = profile[k1][0];
    for (let i = 0; i < seg; i++) {
      const i1 = full ? (i + 1) % seg : i + 1;
      const a = start + i, bb = start + i1, c = end + i1, d = end + i;
      if (r0 > 1e-7) { if (flip) idx.push(a, c, bb); else idx.push(a, bb, c); }
      if (r1 > 1e-7) { if (flip) idx.push(a, d, c); else idx.push(a, c, d); }
    }
    // the ring the next band starts on: the same one for a gentle bend, a fresh copy for a hard edge
    if (!last) start = sharp(b, b + 1) ? ring(k1) : end;
  }
  // Cap the two cut ends of a partial ring
  if (closed && !full) {
    const tris = THREE.ShapeUtils.triangulateShape(profile.map(([r, y]) => new THREE.Vector2(r, y)), []);
    for (const [ang, sign] of [[a0, -1], [a1, 1]] as const) {
      const base = pos.length / 3;
      for (const [r, y] of profile) pos.push(r * Math.sin(ang), y, r * Math.cos(ang));
      const want = new THREE.Vector3(Math.cos(ang) * sign, 0, -Math.sin(ang) * sign); // the way the cap should face
      for (const t of tris) {
        const A = new THREE.Vector3(pos[(base + t[0]) * 3], pos[(base + t[0]) * 3 + 1], pos[(base + t[0]) * 3 + 2]);
        const B = new THREE.Vector3(pos[(base + t[1]) * 3], pos[(base + t[1]) * 3 + 1], pos[(base + t[1]) * 3 + 2]);
        const C = new THREE.Vector3(pos[(base + t[2]) * 3], pos[(base + t[2]) * 3 + 1], pos[(base + t[2]) * 3 + 2]);
        _n.crossVectors(_ab.subVectors(B, A), _ac.subVectors(C, A));
        if (_n.dot(want) < 0) idx.push(base + t[0], base + t[2], base + t[1]); else idx.push(base + t[0], base + t[1], base + t[2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ----------------------------------------------------------------------------
// prism: a flat outline given thickness (plates, gun bodies, boxes)
// ----------------------------------------------------------------------------

/** The area of an outline; positive when its points run anticlockwise. */
function signedArea(o: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** The same outline moved inward by `d` everywhere (used for the bevel round a plate's face). */
function inset(o: ReadonlyArray<readonly [number, number]>, d: number): Array<[number, number]> {
  const n = o.length, out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p = o[(i + n - 1) % n], c = o[i], q = o[(i + 1) % n];
    // the inward-facing direction of the edge before and the edge after this corner
    let ax = -(c[1] - p[1]), ay = c[0] - p[0], bx = -(q[1] - c[1]), by = q[0] - c[0];
    const al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
    ax /= al; ay /= al; bx /= bl; by /= bl;
    const k = d / Math.max(0.35, 1 + ax * bx + ay * by);
    out.push([c[0] + (ax + bx) * k, c[1] + (ay + by) * k]);
  }
  return out;
}

/**
 * A flat outline in the XY plane, given `depth` along Z (centred on z = 0), with every face flat and every edge
 * crisp. `bevel` cuts a small slope round the front and back faces so edges catch the light.
 */
export function prism(outline: ReadonlyArray<readonly [number, number]>, depth: number, bevel = 0): THREE.BufferGeometry {
  const o = signedArea(outline) < 0 ? [...outline].reverse() : [...outline];
  const n = o.length, h = depth / 2, b = Math.min(bevel, h * 0.9);
  const face = b > 0 ? inset(o, b) : o.map((p) => [p[0], p[1]] as [number, number]);
  const soup = new TriSoup();
  const V = (p: readonly [number, number], z: number) => new THREE.Vector3(p[0], p[1], z);
  // front and back faces
  const tris = THREE.ShapeUtils.triangulateShape(face.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const front = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(0, 0, -1);
  for (const t of tris) {
    soup.tri(V(face[t[0]], h), V(face[t[1]], h), V(face[t[2]], h), front);
    soup.tri(V(face[t[0]], -h), V(face[t[1]], -h), V(face[t[2]], -h), back);
  }
  // the sides (and the bevels, if any)
  const out = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.set(o[j][1] - o[i][1], -(o[j][0] - o[i][0]), 0); // outward from this edge (the outline runs anticlockwise)
    soup.quad(V(o[i], -(h - b)), V(o[j], -(h - b)), V(o[j], h - b), V(o[i], h - b), out);
    if (b > 0) {
      soup.quad(V(o[i], h - b), V(o[j], h - b), V(face[j], h), V(face[i], h), out.clone().setZ(out.length()));
      soup.quad(V(o[i], -(h - b)), V(o[j], -(h - b)), V(face[j], -h), V(face[i], -h), out.clone().setZ(-out.length()));
    }
  }
  return soup.geometry();
}

/** A box with every edge bevelled, centred on the origin. `corner` cuts the four upright corners as well. */
export function box(w: number, h: number, d: number, bevel = 0.004, corner = bevel): THREE.BufferGeometry {
  const x = w / 2, y = h / 2, c = Math.min(corner, x * 0.9, y * 0.9);
  const outline: Array<[number, number]> = c > 0
    ? [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]]
    : [[-x, -y], [x, -y], [x, y], [-x, y]];
  return prism(outline, d, bevel);
}

/** Points along an arc, for building rounded outlines. Angles in radians, anticlockwise from +X. */
export function arcPoints(cx: number, cy: number, r: number, from: number, to: number, steps: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) { const a = from + ((to - from) * i) / steps; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// ----------------------------------------------------------------------------
// shell: a curved plate with real thickness (shoulder pads, knee caps)
// ----------------------------------------------------------------------------

export interface ShellParts {
  /** The outside face (smooth). */
  readonly outer: THREE.BufferGeometry;
  /** The inside face (smooth), which faces the body. */
  readonly inner: THREE.BufferGeometry;
  /** The flat rim that joins the two round the edge. */
  readonly rim: THREE.BufferGeometry;
}

/**
 * A curved plate: `outer` gives its outside surface, `inner` its inside surface (the same sheet a little further in).
 * `inside` is any point on the body's side of the plate, so each face knows which way to look.
 */
export function shell(nu: number, nv: number, outer: SurfaceFn, inner: SurfaceFn, inside: THREE.Vector3, closeU = false): ShellParts {
  const soup = new TriSoup();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3(), hint = new THREE.Vector3();
  // One strip of rim along an edge of the sheet; `du, dv` step from the edge toward the middle of the sheet.
  const edge = (u0: number, v0: number, u1: number, v1: number, du: number, dv: number) => {
    outer(u0, v0, a); outer(u1, v1, b); inner(u1, v1, c); inner(u0, v0, d);
    outer((u0 + u1) / 2 + du, (v0 + v1) / 2 + dv, e);
    hint.copy(a).add(b).multiplyScalar(0.5).sub(e); // from the sheet's inside toward its edge = the way the rim faces
    soup.quad(a.clone(), b.clone(), c.clone(), d.clone(), hint);
  };
  for (let i = 0; i < nu; i++) {
    edge(i / nu, 0, (i + 1) / nu, 0, 0, 1 / nv);
    edge(i / nu, 1, (i + 1) / nu, 1, 0, -1 / nv);
  }
  if (!closeU) for (let j = 0; j < nv; j++) {
    edge(0, j / nv, 0, (j + 1) / nv, 1 / nu, 0);
    edge(1, j / nv, 1, (j + 1) / nv, -1 / nu, 0);
  }
  return {
    outer: grid(nu, nv, outer, { closeU, from: inside }),
    inner: grid(nu, nv, inner, { closeU, from: inside, faceToward: true }),
    rim: soup.geometry(),
  };
}

// ----------------------------------------------------------------------------
// PieceBuilder: collect parts, merge them into one mesh
// ----------------------------------------------------------------------------

const _col = new THREE.Color(), _p = new THREE.Vector3();

/** Collects the parts of one armor piece and merges them into a single geometry. */
export class PieceBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly fx: number[] = [];
  private readonly idx: number[] = [];

  /**
   * Add a part. The builder takes the geometry over (and frees it). `m`, if given, places the part
   * (a mirror, which has a negative scale, is handled: its triangles are turned back the right way).
   */
  add(g: THREE.BufferGeometry, finish: Finish, m?: THREE.Matrix4): this {
    if (m) {
      g.applyMatrix4(m);
      if (m.determinant() < 0) flipWinding(g);
    }
    g.deleteAttribute('normal');
    g.computeVertexNormals(); // smooth where corners are shared, flat where they are not
    const p = g.attributes.position as THREE.BufferAttribute, nn = g.attributes.normal as THREE.BufferAttribute;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i);
      this.pos.push(_p.x, _p.y, _p.z);
      this.nrm.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      _col.setHex(finish.color); // (setHex turns the screen colour into the "linear" colour lighting sums are done in)
      finish.shade?.(_p, _col);
      this.col.push(_col.r, _col.g, _col.b);
      this.fx.push(finish.glow ?? 0, finish.rough ?? 0.4, finish.visor ?? 0);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) this.idx.push(base + a[i]); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    g.dispose();
    return this;
  }

  /** Add a part twice: as given, and mirrored left-to-right (x to -x). */
  addPair(g: THREE.BufferGeometry, finish: Finish, m?: THREE.Matrix4): this {
    const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
    if (m) mirror.multiply(m);
    this.add(g.clone(), finish, mirror);
    return this.add(g, finish, m);
  }

  /** Add a curved plate with thickness: `face` on the outside, `lining` on the inside, and `rim` (default: the lining) round its edge. */
  addShell(s: ShellParts, face: Finish, lining: Finish, rim: Finish = lining): this {
    return this.add(s.outer, face).add(s.inner, lining).add(s.rim, rim);
  }

  /** How many triangles so far. */
  get triangles(): number { return this.idx.length / 3; }

  /**
   * Merge everything into one geometry. `mirrorX` flips the finished piece left-to-right (a right-side piece is the
   * left-side piece mirrored); `scale` sizes it.
   */
  build(mirrorX = false, scale = 1): THREE.BufferGeometry {
    const n = this.pos.length / 3;
    const pos = new Float32Array(this.pos), nrm = new Float32Array(this.nrm);
    const sx = mirrorX ? -1 : 1;
    for (let i = 0; i < n; i++) {
      pos[i * 3] *= sx * scale; pos[i * 3 + 1] *= scale; pos[i * 3 + 2] *= scale;
      nrm[i * 3] *= sx;
    }
    const idx = n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    if (mirrorX) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('armorFx', new THREE.BufferAttribute(new Float32Array(this.fx), 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ----------------------------------------------------------------------------
// Small helpers for placing parts
// ----------------------------------------------------------------------------

/** A placement: move to (x, y, z) after turning by (rx, ry, rz) radians and scaling. */
export function place(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0 below `a`, 1 above `b`, an S-shaped ease between. */
export const smooth = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
