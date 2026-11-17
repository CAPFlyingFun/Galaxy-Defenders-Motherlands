// ============================================================================
// shapedBody.ts -- her skin's SHAPE, "baked": worked out once, not every frame.
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts, `bakeGeometry`, v0.29.4
// "Body shapes: baked", and the lines of `makePerson` that pick which shapes
// stay live).
//
// THE IDEA. The body file carries 43 body SHAPES (belly sizes, bust, navel and
// so on). Drawn "live", the graphics card re-blends all of them for every one
// of her 115,710 points on every frame, even though her belly size hardly ever
// changes. "Baked" means her final shape is worked out ONCE, here, into a plain
// set of points, and nothing is blended while she moves...
//
// ...EXCEPT her four MOTION shapes, which stay live (Joshua, 2026-11-14: "leave
// belly/breasts/breathing live, the rest baked"): the belly's sag, drop and
// sideways swing and the bust's drop. Their weights come from springs every
// frame (bodyMotion.ts), so her belly and bust still have weight when she walks.
//
// WHAT IS DIFFERENT HERE.
//   * Where the DEV Room added the file's shapes up by its own copy of the
//     builder's rules, the game starts from her BAKED LOOK's shape (shape.bin:
//     every point exactly where the builder itself finally put it, with all its
//     smoothing and softening). Only a CHANGE of belly is added with the
//     builder's rules (`setBelly`).
//   * Each detail level gets its own small copy holding only the points that
//     level still draws (the DEV Room's "only the points this detail level
//     uses, renumbered").
// ============================================================================
import * as THREE from 'three';
import { bellyWeights, breastGrowUnits, navelFlatFor, BELLY_MOTION, BREAST_TARGETS, BREAST_GROW_TARGET } from '@charb/sarahlab/sarahLabTool';

/** Her four motion shapes, in the order bodyMotion.ts writes their weights. (The names are the builder's own.) */
export const MOTION_SHAPES: readonly string[] = [BELLY_MOTION.tilt, BELLY_MOTION.bob, BELLY_MOTION.sway, BREAST_TARGETS.bob];
/** The bust's second growth shape in the body file (past the first's full size). */
const BREAST_GROW_MORE = 'shape:breastGrowMore';
/**
 * ALL HER BODY SHAPES LIVE (Joshua, 2026-11-17: "Keep all 43 live for most flexibility"; the DEV Room's "Body
 * shapes: live"). A level at or under this detail carries every body shape of the file for its own points, and the
 * graphics chip blends them each frame by her weights, so her belly, bust and navel can change at any moment with
 * nothing rewritten. Heavier levels keep her shape added in once with only her four motion shapes live: every shape
 * of the full body is some 160 MB on the graphics chip, a 30 % body's about 50 MB (Anthill Airways' own measure).
 */
export const LIVE_UP_TO = 30;
/** Below this detail her surface directions are worked out again from the triangles she has left (see `freshNormals`). */
const FRESH_NORMALS_BELOW = 25;

type Numbers = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** What a shaped body is made from. */
export interface ShapedBodySource {
  /** How many points her skin has. */
  readonly count: number;
  /** Her points and surface directions for her look as baked (x, y, z each). */
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** Where each point sits in her texture layout (u, v). */
  readonly uv: Float32Array;
  /** Which four bones move each point, and by how much. */
  readonly skinIndex: Uint16Array;
  readonly skinWeight: Float32Array;
  /** A body shape from the file by name: how far it moves each point (and turns each direction), or undefined. */
  readonly shapeMoves: (name: string) => Numbers | undefined;
  readonly shapeTurns: (name: string) => Numbers | undefined;
  /** The name of every body shape the file has, in the file's own order. */
  readonly shapeNames: readonly string[];
  /** The belly (0-200 %) the baked points are for, and her NAVEL control's setting (-100..100). */
  readonly bakedBelly: number;
  readonly navel: number;
}

/** One detail level's copy of her: its geometry, and which of her points each of its points is. */
interface Level {
  readonly detail: number;
  readonly geometry: THREE.BufferGeometry;
  /** `order[k]` is the number, in the full body, of this level's point k. */
  readonly order: Uint32Array;
  readonly triangles: Uint32Array;
  /** True: this level carries every body shape, live (see LIVE_UP_TO). */
  readonly live: boolean;
}

/** Every size-dependent shape's weight at a belly size, by name: the builder's own rules. */
export function shapeWeightsAt(belly: number, navel: number): Record<string, number> {
  const bust = breastGrowUnits(belly, 0);
  return {
    ...bellyWeights(belly),
    [BREAST_GROW_TARGET]: Math.min(1, bust),
    [BREAST_GROW_MORE]: Math.max(0, bust - 1),
    navelFlat: navelFlatFor(belly, navel),
  };
}

export class ShapedBody {
  /** Her belly now, 0-200 %. */
  belly: number;
  /** Her points and directions as shaped NOW (the baked ones, plus any change of belly). */
  private readonly position: Float32Array;
  private readonly normal: Float32Array;
  /** Her four motion shapes' moves for every point (x, y, z each), read from the file once. */
  private readonly motion: Float32Array[];
  private readonly levels = new Map<number, Level>();
  /**
   * Her points and directions with NO size shape added: her baked shape less every size shape at its baked weight.
   * A live level starts from these, so that with her weights set it is exactly her baked shape. Made when first needed.
   */
  private neutral: { position: Float32Array; normal: Float32Array } | null = null;

  constructor(private readonly source: ShapedBodySource) {
    this.belly = source.bakedBelly;
    this.position = source.position.slice();
    this.normal = source.normal.slice();
    const n = source.count;
    this.motion = MOTION_SHAPES.map((name) => {
      const moves = source.shapeMoves(name), out = new Float32Array(n * 3);
      // (read through getX/getY/getZ: the file stores them as small whole numbers that these decode)
      if (moves) for (let v = 0; v < n; v++) { out[v * 3] = moves.getX(v); out[v * 3 + 1] = moves.getY(v); out[v * 3 + 2] = moves.getZ(v); }
      return out;
    });
  }

  /** Her points as shaped now (x, y, z each, every point of the full body). Read only: do not write into it. */
  get points(): Float32Array { return this.position; }

  /** Does a level of this detail carry all her body shapes live? */
  isLive(detail: number): boolean { return detail <= LIVE_UP_TO; }
  /** Every size shape's weight for her belly as it is now, by name (the builder's rules): a live level's weights. */
  shapeWeights(): Record<string, number> { return shapeWeightsAt(this.belly, this.source.navel); }
  /** Let a level's copy go (it is made again if she comes back to it): a live level is big. */
  release(detail: number): void {
    const level = this.levels.get(detail);
    if (!level) return;
    level.geometry.dispose();
    this.levels.delete(detail);
  }
  private neutralShape(): { position: Float32Array; normal: Float32Array } {
    if (this.neutral) return this.neutral;
    const s = this.source, position = s.position.slice(), normal = s.normal.slice();
    const baked = shapeWeightsAt(s.bakedBelly, s.navel);
    for (const [name, weight] of Object.entries(baked)) {
      if (!weight) continue;
      const moves = s.shapeMoves(name), turns = s.shapeTurns(name);
      if (moves) for (let v = 0; v < s.count; v++) { position[v * 3] -= moves.getX(v) * weight; position[v * 3 + 1] -= moves.getY(v) * weight; position[v * 3 + 2] -= moves.getZ(v) * weight; }
      if (turns) for (let v = 0; v < s.count; v++) { normal[v * 3] -= turns.getX(v) * weight; normal[v * 3 + 1] -= turns.getY(v) * weight; normal[v * 3 + 2] -= turns.getZ(v) * weight; }
    }
    return (this.neutral = { position, normal });
  }

  /** Has this level's copy been made? */
  has(detail: number): boolean { return this.levels.has(detail); }
  /** A level's geometry, if it has been made. */
  geometry(detail: number): THREE.BufferGeometry | null { return this.levels.get(detail)?.geometry ?? null; }
  /** How many triangles a made level has. */
  triangles(detail: number): number { return (this.levels.get(detail)?.triangles.length ?? 0) / 3; }

  /**
   * Make one detail level's copy of her from its triangle list (detailLevels.ts): only the points the list uses,
   * renumbered, with her motion shapes for those points. A few milliseconds for a light level.
   */
  build(detail: number, index: Uint32Array): THREE.BufferGeometry {
    const old = this.levels.get(detail);
    if (old) return old.geometry;
    const s = this.source;
    // Only the points this level uses, renumbered in the order its triangles first name them.
    const remap = new Int32Array(s.count).fill(-1);
    const triangles = new Uint32Array(index.length);
    const orderList: number[] = [];
    for (let i = 0; i < index.length; i++) {
      const v = index[i];
      if (remap[v] < 0) { remap[v] = orderList.length; orderList.push(v); }
      triangles[i] = remap[v];
    }
    const order = Uint32Array.from(orderList), n = order.length;

    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const o = order[k];
      uv[k * 2] = s.uv[o * 2]; uv[k * 2 + 1] = s.uv[o * 2 + 1];
      for (let c = 0; c < 4; c++) { skinIndex[k * 4 + c] = s.skinIndex[o * 4 + c]; skinWeight[k * 4 + c] = s.skinWeight[o * 4 + c]; }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    // HER MOTION SHAPES STAY LIVE: the four are carried over, for this level's own points only.
    // (their moves only; a 1 cm sway turns her surface too little for the lighting to show)
    const live = this.isLive(detail);
    if (live) {
      // EVERY BODY SHAPE, for this level's own points: how each moves her points and turns her surface.
      const carry = (get: (name: string) => Numbers | undefined) => s.shapeNames.map((name) => {
        const from = get(name), own = new Float32Array(n * 3);
        if (from) for (let k = 0; k < n; k++) { const o = order[k]; own[k * 3] = from.getX(o); own[k * 3 + 1] = from.getY(o); own[k * 3 + 2] = from.getZ(o); }
        const attribute = new THREE.BufferAttribute(own, 3);
        attribute.name = name;
        return attribute;
      });
      geometry.morphAttributes.position = carry(s.shapeMoves);
      geometry.morphAttributes.normal = carry(s.shapeTurns);
    } else geometry.morphAttributes.position = this.motion.map((moves, m) => {
      const own = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { const o = order[k]; own[k * 3] = moves[o * 3]; own[k * 3 + 1] = moves[o * 3 + 1]; own[k * 3 + 2] = moves[o * 3 + 2]; }
      const attribute = new THREE.BufferAttribute(own, 3);
      attribute.name = MOTION_SHAPES[m];
      return attribute;
    });
    geometry.morphTargetsRelative = true;
    geometry.setIndex(new THREE.BufferAttribute(triangles, 1));

    const level: Level = { detail, geometry, order, triangles, live };
    this.levels.set(detail, level);
    this.fill(level);
    return geometry;
  }

  /**
   * Her belly, 0-200 %. Her baked points are moved by the DIFFERENCE between the builder's shape weights at the new
   * size and at the size she was baked at, so at her baked size she is exactly as the builder made her.
   * Every level made so far is refilled (a few milliseconds; call it sparingly).
   */
  setBelly(percent: number): void {
    const s = this.source;
    const belly = Math.max(0, Math.min(200, Math.round(percent)));
    if (belly === this.belly) return;
    this.belly = belly;
    this.position.set(s.position);
    this.normal.set(s.normal);
    const now = shapeWeightsAt(belly, s.navel), baked = shapeWeightsAt(s.bakedBelly, s.navel);
    for (const name of Object.keys(now)) {
      const change = now[name] - (baked[name] ?? 0);
      if (Math.abs(change) < 1e-6) continue;
      const moves = s.shapeMoves(name), turns = s.shapeTurns(name);
      if (!moves) continue;
      for (let v = 0; v < s.count; v++) {
        this.position[v * 3] += moves.getX(v) * change; this.position[v * 3 + 1] += moves.getY(v) * change; this.position[v * 3 + 2] += moves.getZ(v) * change;
        if (turns) { this.normal[v * 3] += turns.getX(v) * change; this.normal[v * 3 + 1] += turns.getY(v) * change; this.normal[v * 3 + 2] += turns.getZ(v) * change; }
      }
    }
    for (const level of this.levels.values()) this.fill(level);
  }

  /** Write her points and directions, as shaped now, into a level's copy. */
  private fill(level: Level): void {
    const position = level.geometry.getAttribute('position') as THREE.BufferAttribute, normal = level.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const P = position.array as Float32Array, N = normal.array as Float32Array, order = level.order;
    // (a live level holds her with no size shape added: the graphics chip adds them by her weights)
    const from = level.live ? this.neutralShape() : { position: this.position, normal: this.normal };
    for (let k = 0; k < order.length; k++) {
      const o = order[k] * 3;
      P[k * 3] = from.position[o]; P[k * 3 + 1] = from.position[o + 1]; P[k * 3 + 2] = from.position[o + 2];
      const x = from.normal[o], y = from.normal[o + 1], z = from.normal[o + 2], length = Math.hypot(x, y, z) || 1;
      N[k * 3] = x / length; N[k * 3 + 1] = y / length; N[k * 3 + 2] = z / length;
    }
    // (not on a live level: its directions must stay the ones its shapes' turns are added to)
    if (level.detail < FRESH_NORMALS_BELOW && !level.live) freshNormals(P, N, level.triangles);
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }

  dispose(): void {
    for (const level of this.levels.values()) level.geometry.dispose();
    this.levels.clear();
  }
}

/**
 * ON A MUCH LIGHTER BODY, NEW SURFACE DIRECTIONS (the DEV Room's v0.34 fix, ported with its numbers).
 * Each point remembers which way the fine skin faced there, and lighting uses that. Once most points are gone, a
 * point from under her jaw can end up holding a triangle on her chin, and her chin is lit as if it faced the ground
 * (dark blotches). So the directions are worked out again from the triangles she has now: each triangle's own
 * facing, added up at its three points (points in the same place share one sum, so the seams of her texture layout
 * do not show). The new direction is used only where the remembered one is badly off (more than about 45 degrees;
 * 20 on her face): everywhere else the fine skin's own direction hides the big flat triangles far better.
 */
function freshNormals(P: Float32Array, N: Float32Array, triangles: Uint32Array): void {
  const n = P.length / 3;
  // points in the same place share one sum: found by sorting them into a table keyed by their rounded place
  const sumOf = new Map<string, number>();
  const slot = new Uint32Array(n);
  // (rounded to about a ten-thousandth of her height, in her points' own units)
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y < low) low = y; if (y > high) high = y; }
  const grid = 16384 / Math.max(1e-9, high - low);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[i * 3] * grid)},${Math.round(P[i * 3 + 1] * grid)},${Math.round(P[i * 3 + 2] * grid)}`;
    let at = sumOf.get(key);
    if (at === undefined) { at = sumOf.size; sumOf.set(key, at); }
    slot[i] = at;
  }
  const sums = new Float32Array(sumOf.size * 3);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    // (the cross product's length is twice the triangle's area: big triangles count for more)
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const at = slot[triangles[t + k]] * 3; sums[at] += nx; sums[at + 1] += ny; sums[at + 2] += nz; }
  }
  const faceY = low + (high - low) * 0.86; // (her neck: stricter above it, where a wrong tint shows first)
  for (let i = 0; i < n; i++) {
    const at = slot[i] * 3;
    const length = Math.hypot(sums[at], sums[at + 1], sums[at + 2]) || 1;
    const fx = sums[at] / length, fy = sums[at + 1] / length, fz = sums[at + 2] / length;
    const agree = N[i * 3] * fx + N[i * 3 + 1] * fy + N[i * 3 + 2] * fz;
    if (agree > (P[i * 3 + 1] > faceY ? 0.94 : 0.7)) continue; // the remembered direction is good enough: keep it
    N[i * 3] = fx; N[i * 3 + 1] = fy; N[i * 3 + 2] = fz;
  }
}
