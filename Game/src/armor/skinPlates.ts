// ============================================================================
// skinPlates.ts -- armor plates that FOLLOW HER SKIN (first version).
//
// A rigid piece is locked to one bone. A belly shell cannot be: her belly
// grows, breathes and sways. So these plates are made FROM HER OWN SKIN:
//
//   1. PICK THE SKIN. A plate's look names a region of her body (an oval over
//      her belly, a band round her hips, a stretch of thigh...: SkinRegion in
//      looks.ts). Every corner of her skin gets a number: positive inside the
//      region, negative outside, zero exactly on its edge.
//   2. SMOOTH IT AND THIN IT. Her skin there (and a little way round) is
//      copied. Small features of it (navel, nipples) are ironed out of the
//      copy, so it reads as a plate and not as painted skin; and since her
//      skin is far finer than a plate needs, the copy is simplified to about
//      a fifth of its triangles.
//   3. CUT IT OUT. The copy is cut exactly along the region's edge: a
//      triangle the edge passes through is CUT (new corners are made where
//      the number crosses zero), so the plate's outline is a clean curve, not
//      a saw-tooth of whole triangles. A band just inside the edge is cut the
//      same way and painted the plate's rim colour.
//   4. PUSH IT OUT. Every corner moves outward, along the way her skin faces
//      there, by the plate's thickness (6-12 mm), and a RIM joins the plate's
//      edge back down to her skin so it reads as a solid plate.
//   5. LET IT FOLLOW HER. The copy keeps, corner for corner, what her skin has:
//      which bones move it (and how much), and every SHAPE KEY (her belly at
//      each size, her bust, her breathing...). It is bound to her SAME
//      skeleton, and each frame it copies the strengths of her shape keys from
//      her skin. So it bends with her and grows with her belly, exactly.
//
// All of a heroine's plates are merged into ONE mesh with the shared armor
// material: one draw call.
//
// The body's own skin must be a SkinnedMesh that still HAS its shape keys
// (morph targets). The armor lab's mannequin does. See the note in the report
// about the game's body, which the builder may hand over with shapes baked in.
// ============================================================================
import * as THREE from 'three';
import type { BodyFit } from './bodyFit';
import { defaultKit, type ArmorKit } from './kit';
import { colourOf, type HeroineLook, type SkinPlateLook, type SkinRegion } from './looks';

export interface SkinPlates {
  /** The one mesh holding every plate. Already added next to her skin and bound to her skeleton. */
  readonly mesh: THREE.SkinnedMesh;
  readonly triangles: number;
  /** Triangles in each plate, by its id. */
  readonly byPlate: Record<string, number>;
  dispose(): void;
}

export interface SkinPlateOptions {
  readonly kit?: ArmorKit;
  /** How much of her skin's detail a plate keeps: 1 = every triangle, 0.2 = about a fifth (default). */
  readonly detail?: number;
  /** Only build the plates with these ids (default: all the look has). */
  readonly only?: readonly string[];
}

/** How wide the coloured band round a plate's edge is (metres). */
const BAND_WIDTH = 0.013;
/** The rim meets her skin this far above it (so the two never fight for the same pixels). */
const SKIN_CLEAR = 0.0008;

// ----------------------------------------------------------------------------
// What is worked out once about her skin
// ----------------------------------------------------------------------------

interface Source {
  readonly n: number;
  /** Each corner's place and facing, in the skin geometry's own units. */
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  /** Each corner's place on her 1.70 m rest body, metres: soles at y = 0, +z her front, +x her left. */
  readonly body: Float32Array;
  /** Corners at the very same place (the skin is split along its texture seams) share one number here. */
  readonly canon: Uint32Array;
  /** How much of each corner belongs to each limb (0..1). */
  readonly share: Record<'armL' | 'armR' | 'legL' | 'legR', Float32Array>;
  /** Her joints on the rest body, metres. */
  readonly joint: Record<string, THREE.Vector3>;
  /** Geometry units in one metre (for pushing corners out by millimetres). */
  readonly perMetre: number;
  /** The depth (z) of her torso's upright middle line. */
  readonly zAxis: number;
}

const sources = new WeakMap<THREE.BufferGeometry, Source>();

function readSource(skin: THREE.SkinnedMesh, fit: BodyFit): Source {
  const g = skin.geometry;
  const had = sources.get(g);
  if (had) return had;
  const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute, n = P.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), body = new Float32Array(n * 3), canon = new Uint32Array(n);
  const seen = new Map<string, number>(), v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
    nrm[i * 3] = N.getX(i); nrm[i * 3 + 1] = N.getY(i); nrm[i * 3 + 2] = N.getZ(i);
    const key = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`, first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    canon[i] = first ?? i;
    // (the skin's "bind matrix" takes its own units into the space her skeleton was bound in)
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(skin.bindMatrix);
    body[i * 3] = v.x; body[i * 3 + 1] = v.y; body[i * 3 + 2] = v.z;
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  // That space is not in metres and its floor is not at zero: scale her to her real height, soles at 0.
  const s = fit.height / (maxY - minY);
  for (let i = 0; i < n; i++) { body[i * 3] *= s; body[i * 3 + 1] = (body[i * 3 + 1] - minY) * s; body[i * 3 + 2] *= s; }
  const bindScale = new THREE.Vector3().setFromMatrixScale(skin.bindMatrix).x;

  // Her joints, from where each bone stood when the skin was bound to it.
  const bones = skin.skeleton.bones, m = new THREE.Matrix4();
  const at = (name: string): THREE.Vector3 => {
    const k = bones.findIndex((b) => b.name === name);
    if (k < 0) throw new Error(`skin plates: this body has no bone named ${name}`);
    const p = new THREE.Vector3().setFromMatrixPosition(m.copy(skin.skeleton.boneInverses[k]).invert());
    return p.set(p.x * s, (p.y - minY) * s, p.z * s);
  };
  const S = fit.slots, joint: Record<string, THREE.Vector3> = {};
  for (const side of ['L', 'R'] as const) {
    joint[`shoulder${side}`] = at(S[`shoulder${side}`].bone); joint[`elbow${side}`] = at(S[`forearm${side}`].bone); joint[`wrist${side}`] = at(S[`gun${side}`].bone);
    joint[`hip${side}`] = at(S[`thigh${side}`].bone); joint[`knee${side}`] = at(S[`shin${side}`].bone); joint[`ankle${side}`] = at(S[`foot${side}`].bone);
  }
  // How much of each corner each limb owns: the weights of that limb's bones, added up.
  const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const limbShare = (top: string): Float32Array => {
    const set = new Set<number>();
    bones.find((b) => b.name === top)!.traverse((o) => { const k = bones.indexOf(o as THREE.Bone); if (k >= 0) set.add(k); });
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (set.has(si.getComponent(i, k))) out[i] += sw.getComponent(i, k);
    return out;
  };
  const src: Source = {
    n, pos, nrm, body, canon,
    share: { armL: limbShare(S.shoulderL.bone), armR: limbShare(S.shoulderR.bone), legL: limbShare(S.thighL.bone), legR: limbShare(S.thighR.bone) },
    joint, perMetre: 1 / (s * bindScale),
    zAxis: (joint.hipL.z + joint.shoulderL.z) / 2,
  };
  sources.set(g, src);
  return src;
}

// ----------------------------------------------------------------------------
// 1. Regions: a number for every corner, positive inside (roughly metres from the edge)
// ----------------------------------------------------------------------------

const RAD = Math.PI / 180;
/** How far inside an arc an angle is, in degrees (negative = outside). The arc runs from `from` up to `to`. */
function insideArc(angle: number, from: number, to: number): number {
  const a = ((((angle - from) % 360) + 360) % 360), span = to - from;
  return a <= span ? Math.min(a, span - a) : -Math.min(a - span, 360 - a);
}

function regionField(src: Source, r: SkinRegion, out: Float32Array): void {
  const { n, body, share } = src;
  if (r.shape === 'oval') {
    const k = r.square ?? 2, scale = Math.min(r.radii[0], r.radii[1]) / k;
    for (let i = 0; i < n; i++) {
      const x = body[i * 3], y = body[i * 3 + 1], z = body[i * 3 + 2];
      let f = (1 - Math.abs((x - r.centre[0]) / r.radii[0]) ** k - Math.abs((y - r.centre[1]) / r.radii[1]) ** k) * scale;
      // only the side of her that faces the viewer (the oval is "seen from the front"), and never her arms
      f = Math.min(f, (r.face === 'front' ? z - src.zAxis : src.zAxis - z) + 0.015);
      f = Math.min(f, (0.5 - Math.max(share.armL[i], share.armR[i])) * 0.05);
      out[i] = f;
    }
  } else if (r.shape === 'band') {
    for (let i = 0; i < n; i++) {
      const x = body[i * 3], y = body[i * 3 + 1], z = body[i * 3 + 2];
      let f = Math.min(y - r.y[0], r.y[1] - y);
      if (r.arc) f = Math.min(f, insideArc(Math.atan2(x, z - src.zAxis) / RAD, r.arc[0], r.arc[1]) * RAD * Math.hypot(x, z - src.zAxis));
      f = Math.min(f, (0.5 - Math.max(share.armL[i], share.armR[i])) * 0.05);
      out[i] = f;
    }
  } else {
    const side = r.limb.endsWith('L') ? 'L' : 'R', arm = r.limb.includes('rm');
    const [ja, jb] = r.limb.startsWith('upperArm') ? ['shoulder', 'elbow'] : r.limb.startsWith('forearm') ? ['elbow', 'wrist'] : r.limb.startsWith('thigh') ? ['hip', 'knee'] : ['knee', 'ankle'];
    const A = src.joint[ja + side], B = src.joint[jb + side], own = share[`${arm ? 'arm' : 'leg'}${side}`];
    const along = B.clone().sub(A), L = along.length();
    along.multiplyScalar(1 / L);
    // The same frame the rigid pieces use: +Y back up the limb, +Z her front, +X the outer side (mirrored on her right).
    const Y = along.clone().negate(), Z = new THREE.Vector3(0, 0, 1).addScaledVector(Y, -Y.z).normalize(), X = new THREE.Vector3().crossVectors(Y, Z).multiplyScalar(side === 'L' ? 1 : -1);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.set(body[i * 3] - A.x, body[i * 3 + 1] - A.y, body[i * 3 + 2] - A.z);
      const t = p.dot(along) / L;
      let f = Math.min(t - r.along[0], r.along[1] - t) * L;
      if (r.arc) { const px = p.dot(X), pz = p.dot(Z); f = Math.min(f, insideArc(Math.atan2(px, pz) / RAD, r.arc[0], r.arc[1]) * RAD * Math.hypot(px, pz)); }
      f = Math.min(f, (own[i] - 0.15) * 0.1); // (never the other leg, or her torso)
      out[i] = f;
    }
  }
}

/** A plate's whole field: the largest of its regions, with its cuts taken out. */
function plateField(src: Source, plate: SkinPlateLook): Float32Array {
  const f = new Float32Array(src.n).fill(-1), one = new Float32Array(src.n);
  for (const r of plate.regions) { regionField(src, r, one); for (let i = 0; i < src.n; i++) f[i] = Math.max(f[i], one[i]); }
  for (const r of plate.cut ?? []) { regionField(src, r, one); for (let i = 0; i < src.n; i++) f[i] = Math.min(f[i], -one[i]); }
  return f;
}

// ----------------------------------------------------------------------------
// 2. Cutting her skin along a field's zero line (and along the inside of the edge band)
// ----------------------------------------------------------------------------

/**
 * A cut-out sheet. Each of its corners is a skin corner `a`, or a point part-way (`t`) along a skin edge from corner
 * `a` to corner `b`. Its triangles are tagged: 0 = the plate proper, 1 = the band round its edge.
 */
interface Cut {
  readonly a: Uint32Array; readonly b: Uint32Array; readonly t: Float32Array;
  readonly index: Uint32Array; readonly tag: Uint8Array;
}

/**
 * Cut a sheet of triangles (given as skin corner numbers) where the field `f` is positive. With a `band` width, the cut-out is also split along the line
 * `f = band`: outside that line is the edge band (tag 1), inside is the plate proper (tag 0). Both come out of the
 * same pass and share their corners along that line, so they meet without a crack.
 */
function cutOut(src: Source, triangles: ArrayLike<number>, f: Float32Array, band: number): Cut {
  const a: number[] = [], b: number[] = [], t: number[] = [], index: number[] = [], tag: number[] = [];
  const made = new Map<number, number>(), N = src.n;
  const whole = (i: number) => { let k = made.get(i); if (k === undefined) { k = a.length; made.set(i, k); a.push(i); b.push(i); t.push(0); } return k; };
  /** The point on skin edge i-j where the field equals `level` (which = 0 for the outline, 1 for the band line). */
  const crossing = (i: number, j: number, level: number, which: number) => {
    const lo = Math.min(i, j), hi = Math.max(i, j), key = (which + 1) * (N + 1) * (N + 1) + lo * (N + 1) + hi;
    let k = made.get(key);
    if (k === undefined) { k = a.length; made.set(key, k); a.push(lo); b.push(hi); t.push((f[lo] - level) / (f[lo] - f[hi])); }
    return k;
  };
  // A corner of the piece of a triangle being cut: its number in the sheet, its field value, and the skin edge it lies on.
  interface P { k: number; f: number; e0: number; e1: number }
  /** Keep the part of a polygon where (f - level) has the sign `keep` (+1 above the level, -1 below). */
  const clip = (poly: P[], level: number, which: number, keep: number): P[] => {
    const out: P[] = [];
    for (let q = 0; q < poly.length; q++) {
      const p0 = poly[q], p1 = poly[(q + 1) % poly.length];
      const in0 = (p0.f - level) * keep > 0, in1 = (p1.f - level) * keep > 0;
      if (in0) out.push(p0);
      if (in0 !== in1) {
        // (two corners on different sides of the level always lie on one edge of the skin triangle: find it)
        const ends = new Set([p0.e0, p0.e1, p1.e0, p1.e1]);
        if (ends.size === 2) { const [i, j] = [...ends]; out.push({ k: crossing(i, j, level, which), f: level, e0: i, e1: j }); }
      }
    }
    return out;
  };
  for (let q = 0; q < triangles.length; q += 3) {
    const c0 = triangles[q], c1 = triangles[q + 1], c2 = triangles[q + 2];
    if (f[c0] <= 0 && f[c1] <= 0 && f[c2] <= 0) continue;
    const tri: P[] = [c0, c1, c2].map((i) => ({ k: -1, f: f[i], e0: i, e1: i }));
    const inside = clip(tri, 0, 0, 1);
    for (const p of inside) if (p.k < 0) p.k = whole(p.e0);
    const parts: Array<[P[], number]> = band > 0 ? [[clip(inside, band, 1, 1), 0], [clip(inside, band, 1, -1), 1]] : [[inside, 0]];
    for (const [poly, which] of parts) for (let k = 1; k + 1 < poly.length; k++) { index.push(poly[0].k, poly[k].k, poly[k + 1].k); tag.push(which); }
  }
  return { a: new Uint32Array(a), b: new Uint32Array(b), t: new Float32Array(t), index: new Uint32Array(index), tag: new Uint8Array(tag) };
}

/** Mix a 3-number-per-corner table at a cut corner. */
function mix3(table: Float32Array, cut: Cut, k: number, out: number[] | Float32Array, o: number): void {
  const a = cut.a[k] * 3, b = cut.b[k] * 3, t = cut.t[k];
  out[o] = table[a] + (table[b] - table[a]) * t; out[o + 1] = table[a + 1] + (table[b + 1] - table[a + 1]) * t; out[o + 2] = table[a + 2] + (table[b + 2] - table[a + 2]) * t;
}

// ----------------------------------------------------------------------------
// Building
// ----------------------------------------------------------------------------

type Simplify = (index: Uint32Array, positions: Float32Array, target: number) => Uint32Array;
/** The simplifier (the "meshoptimizer" library). If it cannot be loaded, plates keep every triangle. */
async function loadSimplifier(): Promise<Simplify | null> {
  try {
    const { MeshoptSimplifier } = await import('meshoptimizer/simplifier');
    await MeshoptSimplifier.ready;
    return (index, positions, target) => MeshoptSimplifier.simplify(index, positions, 3, target, 0.01)[0];
  } catch {
    return null;
  }
}

/** Everything being gathered for the one merged mesh. */
class Gather {
  readonly pos: number[] = []; readonly nrm: number[] = []; readonly col: number[] = []; readonly fx: number[] = [];
  /** Which skin corners each new corner is mixed from (for its bones and its shape keys). */
  readonly a: number[] = []; readonly b: number[] = []; readonly t: number[] = [];
  readonly index: number[] = [];
}

/** The outline of a sheet: its edges used by exactly one triangle, as [from, to] pairs in the triangle's own direction. */
function outline(index: ArrayLike<number>, count: number): Array<[number, number]> {
  const edges = new Map<number, number>();
  for (let q = 0; q < index.length; q += 3) for (let e = 0; e < 3; e++) {
    const i = index[q + e], j = index[q + ((e + 1) % 3)], back = j * count + i;
    if (edges.has(back)) edges.delete(back); else edges.set(i * count + j, 1);
  }
  return [...edges.keys()].map((key) => [Math.floor(key / count), key % count]);
}

/**
 * SMOOTH a sheet's corners in place, then make sure it never dips under her skin.
 * A plate copied straight from skin would show every small feature of it (her navel, her nipples) in armor. So each
 * corner is eased toward the middle of its neighbours a few times, which irons such features flat; the outline stays
 * where it is. Smoothing a bump pulls the sheet DOWN into it, so wherever a corner has ended up below where her
 * skin is, the sheet is lifted back up there, spread over the corners around so the lift is a gentle swell.
 */
function smoothSheet(p: Float32Array, n: Float32Array, index: ArrayLike<number>, count: number): void {
  const near: number[][] = [];
  for (let k = 0; k < count; k++) near.push([]);
  const link = (i: number, j: number) => { if (!near[i].includes(j)) near[i].push(j); if (!near[j].includes(i)) near[j].push(i); };
  for (let q = 0; q < index.length; q += 3) { link(index[q], index[q + 1]); link(index[q + 1], index[q + 2]); link(index[q + 2], index[q]); }
  const fixed = new Uint8Array(count);
  for (const [i, j] of outline(index, count)) { fixed[i] = 1; fixed[j] = 1; }
  const skin = p.slice(), next = new Float32Array(p.length);
  for (let pass = 0; pass < 8; pass++) {
    for (let k = 0; k < count; k++) {
      const nb = near[k];
      if (fixed[k] || !nb.length) { next[k * 3] = p[k * 3]; next[k * 3 + 1] = p[k * 3 + 1]; next[k * 3 + 2] = p[k * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (const j of nb) { x += p[j * 3]; y += p[j * 3 + 1]; z += p[j * 3 + 2]; }
      // (only the part of the move that is straight in or out of her skin is kept. Sliding a corner sideways would
      // carry the plate's outline with it and make the edge wander)
      const along = ((x / nb.length - p[k * 3]) * n[k * 3] + (y / nb.length - p[k * 3 + 1]) * n[k * 3 + 1] + (z / nb.length - p[k * 3 + 2]) * n[k * 3 + 2]) * 0.6;
      next[k * 3] = p[k * 3] + n[k * 3] * along; next[k * 3 + 1] = p[k * 3 + 1] + n[k * 3 + 1] * along; next[k * 3 + 2] = p[k * 3 + 2] + n[k * 3 + 2] * along;
    }
    p.set(next);
  }
  // How far each corner is now UNDER her skin (measured along the way her skin faces there)...
  let lift = new Float32Array(count);
  for (let k = 0; k < count; k++) lift[k] = Math.max(0, -((p[k * 3] - skin[k * 3]) * n[k * 3] + (p[k * 3 + 1] - skin[k * 3 + 1]) * n[k * 3 + 1] + (p[k * 3 + 2] - skin[k * 3 + 2]) * n[k * 3 + 2]));
  // ...spread to its neighbours (three rounds of "take the largest nearby", then two of averaging)...
  for (let pass = 0; pass < 5; pass++) {
    const out = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      let most = lift[k], sum = lift[k];
      for (const j of near[k]) { most = Math.max(most, lift[j]); sum += lift[j]; }
      out[k] = pass < 3 ? most : Math.max(lift[k] * 0.5, sum / (near[k].length + 1));
    }
    lift = out;
  }
  // ...and lifted back out by that much.
  for (let k = 0; k < count; k++) { p[k * 3] += n[k * 3] * lift[k]; p[k * 3 + 1] += n[k * 3 + 1] * lift[k]; p[k * 3 + 2] += n[k * 3 + 2] * lift[k]; }
}

/**
 * Steps 1-3 for one plate: take the skin in and a little way round its region, smooth it, thin it.
 * Returns the thinned triangles (as skin corner numbers) and the smoothed place of every corner they use.
 */
function prepare(src: Source, skinIndex: ArrayLike<number>, f: Float32Array, simplify: Simplify | null, detail: number): { index: Uint32Array; pos: Float32Array; facing: Float32Array } {
  // The skin's triangles in the region and up to 3 cm outside it (whole triangles; the exact outline is cut later).
  const local = new Map<number, number>(), ids: number[] = [], tri: number[] = [];
  const id = (c: number) => { let k = local.get(c); if (k === undefined) { k = ids.length; local.set(c, k); ids.push(c); } return k; };
  for (let q = 0; q < skinIndex.length; q += 3) {
    const c0 = src.canon[skinIndex[q]], c1 = src.canon[skinIndex[q + 1]], c2 = src.canon[skinIndex[q + 2]];
    if (c0 === c1 || c1 === c2 || c0 === c2 || Math.max(f[c0], f[c1], f[c2]) < -0.03) continue;
    tri.push(id(c0), id(c1), id(c2));
  }
  const count = ids.length, p = new Float32Array(count * 3), nn = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) for (let e = 0; e < 3; e++) { p[k * 3 + e] = src.pos[ids[k] * 3 + e]; nn[k * 3 + e] = src.nrm[ids[k] * 3 + e]; }
  smoothSheet(p, nn, tri, count);
  // The way the smoothed sheet faces at each corner, worked out now while it still has all its triangles: the
  // thinned plate is shaded with these, so it looks as smooth as the full sheet though it has a quarter of the triangles.
  const facing = src.nrm.slice();
  const sum = new Float32Array(count * 3);
  for (let q = 0; q < tri.length; q += 3) {
    const i = tri[q] * 3, j = tri[q + 1] * 3, k = tri[q + 2] * 3;
    const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2], vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const c of [i, j, k]) { sum[c] += nx; sum[c + 1] += ny; sum[c + 2] += nz; }
  }
  for (let k = 0; k < count; k++) {
    const len = Math.hypot(sum[k * 3], sum[k * 3 + 1], sum[k * 3 + 2]);
    if (len > 0) for (let e = 0; e < 3; e++) facing[ids[k] * 3 + e] = sum[k * 3 + e] / len;
  }
  let index = new Uint32Array(tri);
  if (simplify && detail < 1 && index.length > 900) index = simplify(index, p, Math.max(300, Math.floor((index.length * detail) / 3) * 3));
  // Back to skin corner numbers, with a table of where each (smoothed) corner now is.
  const pos = src.pos.slice();
  for (let k = 0; k < count; k++) for (let e = 0; e < 3; e++) pos[ids[k] * 3 + e] = p[k * 3 + e];
  return { index: index.map((k) => ids[k]), pos, facing };
}

/**
 * Step 4 for one plate: push its cut-out sheet `lift` metres off her skin, give it its rim, and add it to the gather.
 * `pos` is where each skin corner is after smoothing. Returns how many triangles it added.
 */
function addSheet(src: Source, out: Gather, cut: Cut, pos: Float32Array, facing: Float32Array, lift: number, colour: number, bandColour: number): number {
  const count = cut.a.length, before = out.index.length;
  const p = new Float32Array(count * 3), nn = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    mix3(pos, cut, k, p, k * 3); mix3(src.nrm, cut, k, nn, k * 3);
    const len = Math.hypot(nn[k * 3], nn[k * 3 + 1], nn[k * 3 + 2]) || 1;
    nn[k * 3] /= len; nn[k * 3 + 1] /= len; nn[k * 3 + 2] /= len;
  }
  const parts = [0, 1].map((which) => cut.index.filter((_x, q) => cut.tag[Math.floor(q / 3)] === which));
  const all = cut.index;

  // The way the sheet faces at each corner, for shading (from the smoothed sheet: see `prepare`).
  const face = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    mix3(facing, cut, k, face, k * 3);
    const len = Math.hypot(face[k * 3], face[k * 3 + 1], face[k * 3 + 2]) || 1;
    face[k * 3] /= len; face[k * 3 + 1] /= len; face[k * 3 + 2] /= len;
  }

  const colours = [new THREE.Color().setHex(colour), new THREE.Color().setHex(bandColour)];
  const up = lift * src.perMetre, low = SKIN_CLEAR * src.perMetre;
  const push = (k: number, off: number, nx: number, ny: number, nz: number, col: THREE.Color) => {
    out.pos.push(p[k * 3] + nn[k * 3] * off, p[k * 3 + 1] + nn[k * 3 + 1] * off, p[k * 3 + 2] + nn[k * 3 + 2] * off);
    out.nrm.push(nx, ny, nz); out.col.push(col.r, col.g, col.b); out.fx.push(0, 0.36, 0);
    out.a.push(cut.a[k]); out.b.push(cut.b[k]); out.t.push(cut.t[k]);
    return out.pos.length / 3 - 1;
  };
  // 4a. The face: every corner pushed out the way her skin faces. (Corners on the line between plate and band are
  // made twice, once in each colour, so the colours meet in a crisp line.)
  for (const which of [0, 1]) {
    const placed = new Map<number, number>(), index = parts[which];
    const corner = (k: number) => { let j = placed.get(k); if (j === undefined) { j = push(k, up, face[k * 3], face[k * 3 + 1], face[k * 3 + 2], colours[which]); placed.set(k, j); } return j; };
    for (let q = 0; q < index.length; q += 3) out.index.push(corner(index[q]), corner(index[q + 1]), corner(index[q + 2]));
  }
  // 4b. The rim: along each outline edge, a strip from the face down to her skin, facing away from the plate.
  const rim = colours[parts[1].length ? 1 : 0];
  for (const [i, j] of outline(all, count)) {
    const ex = p[j * 3] - p[i * 3], ey = p[j * 3 + 1] - p[i * 3 + 1], ez = p[j * 3 + 2] - p[i * 3 + 2];
    const mx = nn[i * 3] + nn[j * 3], my = nn[i * 3 + 1] + nn[j * 3 + 1], mz = nn[i * 3 + 2] + nn[j * 3 + 2];
    let rx = ey * mz - ez * my, ry = ez * mx - ex * mz, rz = ex * my - ey * mx; // along the edge x out of the skin = away from the plate
    const len = Math.hypot(rx, ry, rz) || 1;
    rx /= len; ry /= len; rz /= len;
    const i1 = push(i, up, rx, ry, rz, rim), j1 = push(j, up, rx, ry, rz, rim), i0 = push(i, low, rx, ry, rz, rim), j0 = push(j, low, rx, ry, rz, rim);
    out.index.push(i1, j0, j1, i1, i0, j0);
  }
  return (out.index.length - before) / 3;
}

/**
 * Build a heroine's skin-following plates on a body and attach them to it.
 * `skin` is the body's own skinned skin mesh (with its shape keys).
 */
export async function buildSkinPlates(look: HeroineLook, skin: THREE.SkinnedMesh, opts: SkinPlateOptions = {}): Promise<SkinPlates> {
  const kit = opts.kit ?? defaultKit(), src = readSource(skin, kit.fit), detail = opts.detail ?? 0.2;
  const simplify = await loadSimplifier();
  const skinIndex = skin.geometry.index!.array, out = new Gather(), byPlate: Record<string, number> = {};

  for (const plate of look.skinPlates) {
    if (opts.only && !opts.only.includes(plate.id)) continue;
    const f = plateField(src, plate);
    const colour = colourOf(look.palette, plate.colour), rim = colourOf(look.palette, plate.rim ?? plate.colour);
    // (with a `rim` colour, the outer 13 mm of the plate is a band of that colour)
    const ready = prepare(src, skinIndex, f, simplify, detail);
    byPlate[plate.id] = addSheet(src, out, cutOut(src, ready.index, f, plate.rim !== undefined ? BAND_WIDTH : 0), ready.pos, ready.facing, plate.thickness, colour, rim);
  }

  // ---- 5. One geometry that carries, corner for corner, her skin's bones and shape keys ----
  const g = skin.geometry, count = out.pos.length / 3, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('armorFx', new THREE.Float32BufferAttribute(out.fx, 3));
  geo.setIndex(out.index);
  // Bones: each new corner takes those of the skin corner it came from. A corner made by a cut lies between TWO
  // skin corners, so it takes both their bones mixed by how far along it is, keeps the four strongest, and has them
  // add up to 1 again. (Without this a cut corner would follow one end's bones only, and the outline would go ragged
  // wherever she bends.)
  const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const bi = new Uint16Array(count * 4), bw = new Float32Array(count * 4), mixed = new Map<number, number>();
  for (let k = 0; k < count; k++) {
    const a = out.a[k], b = out.b[k], t = out.t[k];
    mixed.clear();
    for (let e = 0; e < 4; e++) {
      const wa = sw.getComponent(a, e) * (1 - t), wb = sw.getComponent(b, e) * t;
      if (wa > 0) mixed.set(si.getComponent(a, e), (mixed.get(si.getComponent(a, e)) ?? 0) + wa);
      if (wb > 0) mixed.set(si.getComponent(b, e), (mixed.get(si.getComponent(b, e)) ?? 0) + wb);
    }
    const top = [...mixed.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), total = top.reduce((sum, x) => sum + x[1], 0) || 1;
    top.forEach(([bone, w], e) => { bi[k * 4 + e] = bone; bw[k * 4 + e] = w / total; });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(bi, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(bw, 4));
  // Shape keys: each of her skin's keys that moves any corner of a plate is carried over (the rest are left out).
  const keys = g.morphAttributes.position ?? [], names = Object.entries(skin.morphTargetDictionary ?? {});
  const kept: Array<{ name: string; from: number }> = [], morphs: THREE.BufferAttribute[] = [];
  for (const [name, from] of names) {
    const M = keys[from] as THREE.BufferAttribute | undefined;
    if (!M) continue;
    const d = new Float32Array(count * 3);
    let moves = 0;
    for (let k = 0; k < count; k++) {
      const a = out.a[k], b = out.b[k], t = out.t[k];
      for (let e = 0; e < 3; e++) { const x = M.getComponent(a, e), y = t ? M.getComponent(b, e) : x; d[k * 3 + e] = x + (y - x) * t; moves = Math.max(moves, Math.abs(d[k * 3 + e])); }
    }
    if (moves < 1e-7) continue;
    kept.push({ name, from });
    morphs.push(new THREE.BufferAttribute(d, 3));
  }
  if (morphs.length) { geo.morphAttributes.position = morphs; geo.morphTargetsRelative = g.morphTargetsRelative; }

  const mesh = new THREE.SkinnedMesh(geo, kit.material);
  mesh.name = `skinPlates:${look.id}`;
  mesh.frustumCulled = false; // (its bounds would be those of her rest pose)
  // Sit exactly where her skin sits, on her skeleton.
  mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale);
  skin.parent?.add(mesh);
  mesh.bind(skin.skeleton, skin.bindMatrix);
  mesh.morphTargetDictionary = Object.fromEntries(kept.map((k, i) => [k.name, i]));
  mesh.morphTargetInfluences = kept.map(() => 0);
  // Each frame, just before it is drawn, take the strength of every shape key from her skin: it grows and breathes with her.
  mesh.onBeforeRender = () => {
    const from = skin.morphTargetInfluences, to = mesh.morphTargetInfluences;
    if (from && to) for (let i = 0; i < kept.length; i++) to[i] = from[kept[i].from];
  };

  return {
    mesh, byPlate, triangles: out.index.length / 3,
    dispose() { mesh.removeFromParent(); geo.dispose(); },
  };
}
