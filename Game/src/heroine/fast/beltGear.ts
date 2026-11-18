// ============================================================================
// beltGear.ts -- HER BELT, HER THIGH HOLSTERS AND HER CLIP POUCHES.
//
// Joshua (2026-11-18): "start adding holders on her waist/belt to put them
// away so her hands are free on the go without having to go all the way to
// the table"; thigh holsters, "where you can put one or both guns away", and
// "carry six extra clips". "The easiest way is probably create a fake belt
// around the top of her bottoms, along the same line".
//
// WHAT IS MADE, and how each part keeps to her:
//
//   * THE BELT, along the top of her leggings. Her painted leggings have a
//     grey waistband trim; the belt finds that trim in her own picture (each of
//     her skin's points knows where it sits in the picture), so it follows the
//     same slanting line: low at the front under her belly, high at her back.
//     Every point of the belt is PINNED to the few points of her skin nearest
//     it: it is moved by the same bones by the same amounts as that skin, it
//     sways with her belly's motion like that skin, and when her belly grows or
//     shrinks it is laid again on her new shape. So it never has to be posed
//     by hand, and it costs one draw on the graphics chip.
//   * TWO STRAPS ROUND EACH THIGH and a DROP STRAP from the belt down to each
//     holster: pinned to her skin the same way, in the same one piece.
//   * A HOLSTER ON EACH THIGH: one solid piece riding the thigh bone (it swings
//     with her leg), holding its gun barrel down, grip back, as a real
//     drop-leg holster does. Where the gun sits in it is kept (`holsterSeat`)
//     for putting a gun away and drawing it (the next step).
//   * SIX CLIP POUCHES, three behind each hip (clear of her belly, and of the
//     holster's reach), riding her hips. Each full pouch shows its clip's
//     magenta base on top. All six clips are one "instanced" mesh: two draws
//     for the lot.
//
// Units: metres, measured in her REST FRAME (her root as she stands: soles on
// the floor, facing +z). Made once while she stands; `reshape` when her belly
// changes. Nothing is made while the game runs.
// ============================================================================
import * as THREE from 'three';
import type { Hand } from '../../core/contracts';
import { CLIP, createClip } from '../guns';
import type { Egg } from './armClear';

/** GAME TUNING (metres, degrees). */
export const BELT = Object.freeze({
  /** The belt's height (top edge to bottom edge), its inner face off her skin, and its thickness. */
  width: 0.036,
  standOff: 0.003,
  thick: 0.006,
  /** How many places round her the belt is pinned. */
  around: 72,
  /**
   * THE BELT RISES WHEN HER BELLY IS SMALL (Joshua, 2026-11-18: "when the belly is flatter to have it sit higher and
   * have it linked to the belly % so as it grows, it naturally falls to not cut in the belly"). Up to the first belly
   * size its front sits on a gentle curve this far under its height at her sides, instead of the leggings' low V;
   * from there it eases down, and from the second size on it lies on the waistband trim, under her bump.
   */
  riseDrop: 0.035,
  riseUntilBelly: [25, 60] as readonly number[],
  /**
   * WHERE THE BELT GOES when her picture has no grey waistband trim to follow (the DEV Room's painted look): the top
   * of the belt above her hip joints, at her front, her sides and her back. (Measured on Blaze's leggings.)
   */
  fallbackAboveHips: [-0.025, 0.07, 0.13] as readonly number[],
  /** The straps' width, inner face off her skin, and thickness. */
  strapWidth: 0.024,
  strapStandOff: 0.002,
  strapThick: 0.004,
  /** The thigh straps, as distances down the holster from the gun's grip (the holster's top is about 2 cm down). */
  thighStrapsDown: [0.07, 0.175] as readonly number[],
  /** The holster: the space between her thigh and its back plate; how far forward of her thigh's middle its gun's slide sits. */
  holsterOffSkin: 0.007,
  /** How far below where her relaxed hand holds a gun the holstered gun's grip sits. */
  holsterDown: 0.035,
  holsterForward: 0.0,
  /** The pouches: where round her (degrees from straight ahead, toward her side and back), and how far above the belt's top their tops stand. */
  pouchAngles: [104, 122, 140] as readonly number[],
  pouchAbove: 0.006,
  /** How much of a clip stands out of the top of its pouch. */
  clipShows: 0.016,
});

/** The colours (one material with each point's own colour: one draw). */
const COLOUR = Object.freeze({
  // (gunmetal grey with lighter edges: her leggings are black, and a black belt on them could not be seen)
  belt: 0x3a3d45,
  edge: 0x8c9099,
  buckle: 0xb9bdc6,
  accent: 0xff2fb0,
  strap: 0x3a3d45,
  holster: 0x141519,
  plate: 0x2a2c33,
});

/** Where a gun's own parts are (guns.ts): its slide and barrel run along +z, its slide's top is +y. */
const GUN = Object.freeze({ halfWidth: 0.017, slideTop: 0.071, muzzle: 0.226 });

/** What the gear is made from: her skin, her bones, and where her guns hang. */
export interface BeltGearSource {
  /** Her root (her rest frame) and her skin (the belt rides her skin's own skeleton). */
  readonly root: THREE.Object3D;
  readonly skin: THREE.SkinnedMesh;
  /** Her belly now, 0-200 % (the belt rises over a small one: BELT.riseUntilBelly). */
  readonly belly: number;
  /** Her skin's points as shaped now (her mesh's own units), and her skin's units to her rest frame. */
  readonly points: Float32Array;
  readonly meshToRest: THREE.Matrix4;
  /** Which four bones move each point, and how much. */
  readonly skinIndex: ArrayLike<number>;
  readonly skinWeight: ArrayLike<number>;
  /** Her four motion shapes' moves for every point (her mesh's units), and their live weights (bodyMotion.ts writes them). */
  readonly motionMoves: readonly Float32Array[];
  readonly influences: number[];
  /** Her texture layout (u, v each point), and her painted picture (null: none: the belt goes by `fallbackAboveHips`). */
  readonly uv: Float32Array;
  readonly picture: CanvasImageSource | null;
  readonly pictureFlipY: boolean;
  /** Her trunk's bones (hips, pelvis, back), each thigh's bone, and which side is her left (+1: +x). */
  readonly trunkBones: readonly THREE.Bone[];
  readonly thighBone: Record<Hand, THREE.Bone>;
  readonly leftSign: number;
  /** Each gun's place in the world as it hangs in her relaxed hand now (where the holster's height comes from). */
  readonly gunHanging: Record<Hand, THREE.Matrix4>;
}

export interface BeltGear {
  /** Everything to draw (already in place: on her skeleton and her bones). */
  readonly meshes: readonly THREE.Object3D[];
  /** Each holster's bone, and where a gun sits in it, in that bone's own space (a gun given to the bone at this matrix is holstered). */
  holsterBone(hand: Hand): THREE.Bone;
  holsterSeat(hand: Hand, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * The room a holstered gun takes, as an egg shape on its thigh bone (armClear.ts): her free hand hangs beside the
   * gun's grip instead of through it.
   */
  holsterEgg(hand: Hand): Egg;
  /** How many pouches (six), and how many hold a clip now. Pouches 0-2 are on her left side, 3-5 on her right. */
  readonly pouches: number;
  readonly clips: number;
  /** Fill the pouches with this many clips (from the front pouch on each side, left and right in turn). */
  setClips(count: number): void;
  /** Whether a pouch holds a clip; and a clip's place in the world in pouch `i` now. */
  pouchFull(i: number): boolean;
  pouchClip(i: number, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * EACH POUCH: 'full' (a full clip, its magenta base glowing on top), 'empty' (an empty clip tucked back in after a
   * reload on the go, its base dark) or 'none' (its clip taken out). Joshua, 2026-11-18: the empty goes back into the
   * pouch the fresh one came from; the table swaps empties for full ones.
   */
  pouchState(i: number): 'full' | 'empty' | 'none';
  /** The bone the pouches ride, and where a clip stands in pouch `i` in that bone's own space. */
  pouchBone(): THREE.Bone;
  pouchSeat(i: number, out: THREE.Matrix4): THREE.Matrix4;
  /** Take the full clip out of pouch `i`: a clip of its own (on the pouches' bone, where it stood), the pouch left 'none'. */
  takeFull(i: number): THREE.Mesh | null;
  /**
   * An empty clip goes into pouch `i` (it must be 'none'): given to the pouches' bone where it is now (the caller
   * settles it into `pouchSeat`), its base made dark. The pouch is 'empty'.
   */
  stowEmpty(i: number, clip: THREE.Object3D): void;
  /** The pouches on one side of her (0-2 her left, 3-5 her right), front first. */
  side(hand: Hand): number[];
  /** Her belly changed shape: the belt and straps are laid again on her skin as it is now. */
  reshape(points: Float32Array, belly: number): void;
  /** For the tests: the belt's line (top edge height at the front, side and back), and how many skin points it was found on. */
  info(): { trim: number; front: number; side: number; back: number; holster: Record<Hand, number[]> };
  dispose(): void;
}

// ------------------------------------------------------------------ small helpers

const UP = new THREE.Vector3(0, 1, 0);
const deg = (d: number): number => (d * Math.PI) / 180;
/** The colour as three linear numbers (point colours are read as linear). */
const linear = (hex: number): [number, number, number] => { const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };

/**
 * A SPOT ON HER SKIN: the few skin points nearest it, and how much each counts. A belt point is a spot plus a fixed
 * push outward, so wherever those skin points go (bones, belly motion, a new belly), it goes with them.
 */
interface Spot { v: Int32Array; w: Float32Array }

/**
 * A MESH PINNED TO HER SKIN: points made of spots, built up face by face, then laid on her skin's points. Each face
 * strip has its own copies of its points, so edges between faces stay crisp.
 */
class PinnedMesh {
  readonly spots: Spot[] = [];
  readonly push: number[] = [];       // each point's push outward (x, y, z, rest frame, metres)
  readonly colour: number[] = [];
  readonly index: number[] = [];
  readonly out: number[] = [];        // each point's outward hint (which way its face should face)
  /** Rest-frame positions as first laid (for working out which way each triangle faces). */
  readonly at: THREE.Vector3[] = [];

  point(spot: Spot, push: THREE.Vector3, outward: THREE.Vector3, colour: [number, number, number], at: THREE.Vector3): number {
    this.spots.push(spot);
    this.push.push(push.x, push.y, push.z);
    this.out.push(outward.x, outward.y, outward.z);
    this.colour.push(...colour);
    this.at.push(at.clone());
    return this.spots.length - 1;
  }

  /** Quads between two equal rows of points (closed: the last joins the first), each made to face its points' outward hint. */
  strip(a: readonly number[], b: readonly number[], closed: boolean): void {
    const n = a.length, last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      this.tri(a[i], a[j], b[j]);
      this.tri(a[i], b[j], b[i]);
    }
  }

  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private tri(p: number, q: number, r: number): void {
    // (which way the triangle faces as wound, against the way its points say outward is)
    const n = this.e1.subVectors(this.at[q], this.at[p]).cross(this.e2.subVectors(this.at[r], this.at[p]));
    const ox = this.out[p * 3] + this.out[q * 3] + this.out[r * 3], oy = this.out[p * 3 + 1] + this.out[q * 3 + 1] + this.out[r * 3 + 1], oz = this.out[p * 3 + 2] + this.out[q * 3 + 2] + this.out[r * 3 + 2];
    if (n.x * ox + n.y * oy + n.z * oz >= 0) this.index.push(p, q, r); else this.index.push(p, r, q);
  }
}

/** A plain solid piece (a holster, the pouches): positions, colours and triangles, built in one frame. */
class SolidPiece {
  readonly position: number[] = [];
  readonly colour: number[] = [];
  readonly index: number[] = [];

  /**
   * A box with chamfered long edges, from `a` to `b` along its length, `w` wide and `h` tall about its middle line,
   * in the frame `m` (x across, y up, z along). Each face its own points (crisp edges). `open`: no cap at `a`.
   */
  box(m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: number, chamfer = 0, open = false): void {
    const c = Math.min(chamfer, (x1 - x0) / 3, (y1 - y0) / 3);
    // (the outline across: eight corners going round, or four)
    const ring: [number, number][] = c > 0
      ? [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]]
      : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const col = linear(colour), p = new THREE.Vector3();
    const add = (x: number, y: number, z: number): number => { p.set(x, y, z).applyMatrix4(m); this.position.push(p.x, p.y, p.z); this.colour.push(...col); return this.position.length / 3 - 1; };
    // the sides round its length
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
      const k = [add(ax, ay, z0), add(bx, by, z0), add(bx, by, z1), add(ax, ay, z1)];
      this.index.push(k[0], k[1], k[2], k[0], k[2], k[3]);
    }
    // its caps
    const cap = (z: number, flip: boolean): void => {
      const k = ring.map(([x, y]) => add(x, y, z));
      for (let i = 1; i + 1 < k.length; i++) this.index.push(...(flip ? [k[0], k[i + 1], k[i]] : [k[0], k[i], k[i + 1]]));
    };
    cap(z1, false);
    if (!open) cap(z0, true);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colour, 3));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return g;
  }
}

// ------------------------------------------------------------------ the factory

export function buildBeltGear(src: BeltGearSource): BeltGear {
  const { root, skin, meshToRest, skinIndex, skinWeight } = src;
  const bones = skin.skeleton.bones;
  const count = src.points.length / 3;
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const restToMesh = new THREE.Matrix4().copy(meshToRest).invert();

  // ---- her skin in her rest frame, and which of her points belong to her trunk and to each thigh --------------------
  const rest = new Float32Array(count * 3);
  {
    const p = new THREE.Vector3();
    for (let v = 0; v < count; v++) { p.fromArray(src.points, v * 3).applyMatrix4(meshToRest); rest[v * 3] = p.x; rest[v * 3 + 1] = p.y; rest[v * 3 + 2] = p.z; }
  }
  const boneNumber = (b: THREE.Bone): number => bones.indexOf(b);
  const trunk = new Set(src.trunkBones.map(boneNumber).filter((k) => k >= 0));
  const thigh: Record<Hand, number> = { left: boneNumber(src.thighBone.left), right: boneNumber(src.thighBone.right) };
  /** How much of a point is carried by these bones. */
  const share = (v: number, set: (k: number) => boolean): number => {
    let s = 0;
    for (let c = 0; c < 4; c++) if (set(skinIndex[v * 4 + c])) s += skinWeight[v * 4 + c];
    return s;
  };
  const restOf = (v: number, out: THREE.Vector3): THREE.Vector3 => out.set(rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]);
  const sideOf: Record<Hand, number> = { left: src.leftSign, right: -src.leftSign };
  const boneInRest = (b: THREE.Bone): THREE.Vector3 => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
  const hipY = Math.min(boneInRest(src.thighBone.left).y, boneInRest(src.thighBone.right).y);

  // Her body round her middle (trunk and thighs, never her arms or hands), from a little under her hips up.
  const middle: number[] = [];
  for (let v = 0; v < count; v++) {
    const y = rest[v * 3 + 1];
    if (y < hipY - 0.42 || y > hipY + 0.3) continue;
    if (share(v, (k) => trunk.has(k) || k === thigh.left || k === thigh.right) < 0.85) continue;
    middle.push(v);
  }

  // ---- finding spots on her skin ----------------------------------------------------------------------------------
  const scratch = new THREE.Vector3();
  /** The skin point nearest a place (of a list). */
  const nearestOne = (target: THREE.Vector3, list: readonly number[]): number => {
    let best = -1, bestD = Infinity;
    for (const v of list) {
      const dx = rest[v * 3] - target.x, dy = rest[v * 3 + 1] - target.y, dz = rest[v * 3 + 2] - target.z, d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  };
  /**
   * A spot on her skin under a place: the skin point nearest it, then the four points round that one, each counted
   * by how near it is (so the spot sits smoothly between her skin's points, not jumping from one to the next).
   */
  const spotAt = (target: THREE.Vector3, list: readonly number[], onSkin?: THREE.Vector3, outward?: THREE.Vector3): Spot => {
    const first = nearestOne(target, list);
    const centre = restOf(first, scratch).clone();
    // (with an outward way: the place itself, moved in or out to her skin there, so a row of spots keeps its height
    // instead of jumping to whichever skin point happened to be nearest)
    if (outward) centre.copy(target).addScaledVector(outward, scratch.sub(target).dot(outward));
    const K = 4, near: number[] = [], dist: number[] = [];
    for (const v of list) {
      const dx = rest[v * 3] - centre.x, dy = rest[v * 3 + 1] - centre.y, dz = rest[v * 3 + 2] - centre.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (near.length < K) { near.push(v); dist.push(d); continue; }
      let worst = 0;
      for (let i = 1; i < K; i++) if (dist[i] > dist[worst]) worst = i;
      if (d < dist[worst]) { near[worst] = v; dist[worst] = d; }
    }
    const w = new Float32Array(near.length);
    let sum = 0;
    for (let i = 0; i < near.length; i++) { w[i] = 1 / (dist[i] + 0.004); sum += w[i]; }
    for (let i = 0; i < near.length; i++) w[i] /= sum;
    const spot: Spot = { v: Int32Array.from(near), w };
    if (onSkin) spotPlace(spot, onSkin);
    return spot;
  };
  /** Where a spot is on her skin (rest frame) as she is shaped now. */
  const spotPlace = (spot: Spot, out: THREE.Vector3): THREE.Vector3 => {
    out.set(0, 0, 0);
    for (let i = 0; i < spot.v.length; i++) { const v = spot.v[i]; out.x += rest[v * 3] * spot.w[i]; out.y += rest[v * 3 + 1] * spot.w[i]; out.z += rest[v * 3 + 2] * spot.w[i]; }
    return out;
  };

  const pinned = new PinnedMesh();
  const C = { belt: linear(COLOUR.belt), edge: linear(COLOUR.edge), buckle: linear(COLOUR.buckle), accent: linear(COLOUR.accent), strap: linear(COLOUR.strap) };
  // (the pouches stay dark like the holsters: only the belt and straps are grey)

  /**
   * A BAND round (or along) her: rows of spots, top row and bottom row, each pushed out by `standOff` (its inner face)
   * and `standOff + thick` (its outer face), with its top and bottom edges closed: a strap with real thickness. The
   * outer face and its two edges get the given colours.
   */
  const band = (top: Spot[], bottom: Spot[], outward: THREE.Vector3[], standOff: number, thick: number, closed: boolean, face: [number, number, number], edge: [number, number, number]): void => {
    const at = new THREE.Vector3(), push = new THREE.Vector3(), down = new THREE.Vector3();
    const row = (spots: Spot[], off: number, colour: [number, number, number], hint: (i: number) => THREE.Vector3): number[] =>
      spots.map((s, i) => {
        push.copy(outward[i]).multiplyScalar(off);
        spotPlace(s, at).add(push);
        return pinned.point(s, push, hint(i), colour, at);
      });
    const out = (i: number) => outward[i];
    // the outer face
    pinned.strip(row(top, standOff + thick, face, out), row(bottom, standOff + thick, face, out), closed);
    // the top edge (facing up) and the bottom edge (facing down)
    pinned.strip(row(top, standOff, edge, () => UP), row(top, standOff + thick, edge, () => UP), closed);
    pinned.strip(row(bottom, standOff + thick, edge, () => down.set(0, -1, 0)), row(bottom, standOff, edge, () => down.set(0, -1, 0)), closed);
  };

  // ---- 1. THE BELT'S LINE: the top of her waistband trim, all the way round ----------------------------------------
  const N = BELT.around;
  const lineY = new Float32Array(N), lineR = new Float32Array(N);
  let cx = 0, cz = 0, trimPoints = 0;
  {
    const greys: number[] = [];
    if (src.picture) {
      // Her picture, drawn small (only a little of it is read: the colour under each point round her middle).
      const SIZE = 1024, canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.drawImage(src.picture, 0, 0, SIZE, SIZE);
        const px = g.getImageData(0, 0, SIZE, SIZE).data;
        for (const v of middle) {
          if (rest[v * 3 + 1] < hipY - 0.12) continue;
          const u = src.uv[v * 2], t = src.uv[v * 2 + 1];
          const x = Math.min(SIZE - 1, Math.max(0, Math.floor(u * SIZE))), y = Math.min(SIZE - 1, Math.max(0, Math.floor((src.pictureFlipY ? 1 - t : t) * SIZE)));
          const k = (y * SIZE + x) * 4, hi = Math.max(px[k], px[k + 1], px[k + 2]), lo = Math.min(px[k], px[k + 1], px[k + 2]);
          // (the trim: grey, neither her skin nor the leggings' black or magenta)
          if (hi - lo < 22 && hi > 105 && hi < 235) greys.push(v);
        }
      }
      canvas.width = canvas.height = 1;
    }
    if (greys.length >= N) {
      trimPoints = greys.length;
      for (const v of greys) { cx += rest[v * 3]; cz += rest[v * 3 + 2]; }
      cx /= greys.length; cz /= greys.length;
      // In each slice of angle round her, the trim's top (the highest of its grey points), and how far out it is there.
      lineY.fill(-Infinity);
      for (const v of greys) {
        const x = rest[v * 3] - cx, z = rest[v * 3 + 2] - cz, a = Math.atan2(x, z);
        const k = ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;
        if (rest[v * 3 + 1] > lineY[k]) { lineY[k] = rest[v * 3 + 1]; lineR[k] = Math.hypot(x, z); }
      }
    } else {
      // No trim to follow: her hips' height and a smooth slant from front to back (BELT.fallbackAboveHips).
      cx = 0; cz = 0;
      for (const v of middle) cz += rest[v * 3 + 2];
      cz /= Math.max(1, middle.length);
      const [f, s, b] = BELT.fallbackAboveHips, mean = (f + b) / 2;
      const a0 = (mean + s) / 2, a1 = (f - b) / 2, a2 = (mean - s) / 2;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        lineY[k] = hipY + a0 + a1 * Math.cos(a) + a2 * Math.cos(2 * a);
        // (how far out her skin is there: the furthest of her points near that height and angle)
        let r = 0;
        for (const v of middle) {
          const x = rest[v * 3] - cx, z = rest[v * 3 + 2] - cz;
          if (Math.abs(rest[v * 3 + 1] - lineY[k]) > 0.012) continue;
          const da = Math.atan2(Math.sin(Math.atan2(x, z) - a), Math.cos(Math.atan2(x, z) - a));
          if (Math.abs(da) < deg(4)) r = Math.max(r, Math.hypot(x, z));
        }
        lineR[k] = r;
      }
    }
    // Slices with no trim point take their neighbours' line; then the whole line is smoothed a little.
    for (let pass = 0; pass < N; pass++) {
      let missing = false;
      for (let k = 0; k < N; k++) {
        if (Number.isFinite(lineY[k]) && lineR[k] > 0) continue;
        missing = true;
        const a = (k + N - 1) % N, b = (k + 1) % N, okA = Number.isFinite(lineY[a]) && lineR[a] > 0, okB = Number.isFinite(lineY[b]) && lineR[b] > 0;
        if (okA && okB) { lineY[k] = (lineY[a] + lineY[b]) / 2; lineR[k] = (lineR[a] + lineR[b]) / 2; }
        else if (okA) { lineY[k] = lineY[a]; lineR[k] = lineR[a]; }
        else if (okB) { lineY[k] = lineY[b]; lineR[k] = lineR[b]; }
      }
      if (!missing) break;
    }
    // (four passes: the leggings' sharp V at her front is rounded a little, as a real belt would lie)
    for (let pass = 0; pass < 4; pass++) {
      const y = lineY.slice(), r = lineR.slice();
      for (let k = 0; k < N; k++) {
        const a = (k + N - 1) % N, b = (k + 1) % N;
        lineY[k] = (y[a] + 2 * y[k] + y[b]) / 4;
        lineR[k] = (r[a] + 2 * r[k] + r[b]) / 4;
      }
    }
  }
  /** The belt's top edge and outward way at an angle round her (radians, 0 = straight ahead, toward +x positive). */
  const lineAt = (angle: number): { y: number; r: number } => {
    const f = ((((angle / (Math.PI * 2)) * N) % N) + N) % N, k0 = Math.floor(f) % N, k1 = (k0 + 1) % N, t = f - Math.floor(f);
    return { y: lineY[k0] + (lineY[k1] - lineY[k0]) * t, r: lineR[k0] + (lineR[k1] - lineR[k0]) * t };
  };
  const outwardAt = (angle: number): THREE.Vector3 => new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

  // ---- 2. THE BELT, pinned along that line ---------------------------------------------------------------------------
  // The trim's top at each place round her: a spot on her skin, so it is found again wherever her belly takes it.
  const trimTop: Spot[] = [], trimBottom: Spot[] = [], beltOut: THREE.Vector3[] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, out = outwardAt(a), { y, r } = lineAt(a);
    const topTarget = new THREE.Vector3(cx + out.x * r, y, cz + out.z * r);
    trimTop.push(spotAt(topTarget, middle, undefined, out));
    // (the bottom edge: the skin a belt's width under the top, wherever her skin is there: her lower belly goes in)
    trimBottom.push(spotAt(topTarget.clone().addScaledVector(UP, -BELT.width), middle, undefined, out));
    beltOut.push(out);
  }
  // The belt's own spots: the trim's, or raised above it when her belly is small (`placeBelt`, again on every reshape).
  const beltTop: Spot[] = trimTop.map((t) => ({ v: t.v, w: t.w })), beltBottom: Spot[] = trimBottom.map((t) => ({ v: t.v, w: t.w }));
  /** Spots made from the belt's (the buckle's bar): worked out again whenever the belt's spots change. */
  const blended: { spot: Spot; a: Spot; b: Spot; t: number }[] = [];
  /** How far the belt rises over the trim at a belly size: 1 = all the way (her flattest), 0 = on the trim. */
  const riseFor = (belly: number): number => {
    const [from, to] = BELT.riseUntilBelly, t = Math.max(0, Math.min(1, (belly - from) / (to - from)));
    return 1 - t * t * (3 - 2 * t);
  };
  const placeBelt = (belly: number): void => {
    const rise = riseFor(belly), at = new THREE.Vector3(), side = new THREE.Vector3();
    // (her sides' trim height: the belt's front curve hangs from it)
    const sideY = (spotPlace(trimTop[Math.round(N / 4)], at).y + spotPlace(trimTop[Math.round((3 * N) / 4)], side).y) / 2;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, front = Math.max(0, Math.cos(a));
      spotPlace(trimTop[k], at);
      // (the raised line: a gentle curve at her front, never under the trim; behind her sides it is the trim itself)
      const lift = Math.max(0, sideY - BELT.riseDrop * front * front - at.y) * rise;
      if (lift < 0.001) { beltTop[k].v = trimTop[k].v; beltTop[k].w = trimTop[k].w; beltBottom[k].v = trimBottom[k].v; beltBottom[k].w = trimBottom[k].w; continue; }
      const out = beltOut[k], target = at.clone().addScaledVector(UP, lift);
      const top = spotAt(target, middle, undefined, out), bottom = spotAt(target.addScaledVector(UP, -BELT.width), middle, undefined, out);
      beltTop[k].v = top.v; beltTop[k].w = top.w; beltBottom[k].v = bottom.v; beltBottom[k].w = bottom.w;
    }
    for (const b of blended) { const m = blendSpot(b.a, b.b, b.t); b.spot.v = m.v; b.spot.w = m.w; }
  };
  placeBelt(src.belly);
  const beltTopAt = beltTop.map((t) => spotPlace(t, new THREE.Vector3())), beltBottomAt = beltBottom.map((t) => spotPlace(t, new THREE.Vector3()));
  band(beltTop, beltBottom, beltOut, BELT.standOff, BELT.thick, true, C.belt, C.edge);
  // Its buckle: a plate at her front, standing on the belt's face (low under her belly), with a magenta bar across it.
  {
    const span = 4, outs: THREE.Vector3[] = [];
    const tops: Spot[] = [], bottoms: Spot[] = [];
    for (let i = -span; i <= span; i++) {
      const k = (i + N) % N;
      tops.push(beltTop[k]); bottoms.push(beltBottom[k]); outs.push(beltOut[k]);
    }
    band(tops, bottoms, outs, BELT.standOff + BELT.thick, 0.003, false, C.buckle, C.buckle);
    // (the magenta bar: the middle of the plate, a little prouder)
    const t2: Spot[] = [], b2: Spot[] = [], o2: THREE.Vector3[] = [];
    for (let i = -span + 1; i <= span - 1; i++) {
      const k = (i + N) % N;
      // (spots a third of the way in from each edge: the bar is the middle third of the plate's height)
      const midTop = blendSpot(beltTop[k], beltBottom[k], 0.38), midBottom = blendSpot(beltTop[k], beltBottom[k], 0.62);
      blended.push({ spot: midTop, a: beltTop[k], b: beltBottom[k], t: 0.38 }, { spot: midBottom, a: beltTop[k], b: beltBottom[k], t: 0.62 });
      t2.push(midTop); b2.push(midBottom); o2.push(beltOut[k]);
    }
    band(t2, b2, o2, BELT.standOff + BELT.thick + 0.003, 0.0015, false, C.accent, C.accent);
  }

  // ---- 3. THE HOLSTERS: one on each thigh's outer side, where her relaxed hand hangs -------------------------------
  const holsterRest: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  const holsterSeat: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  const holsterMeshes: THREE.Mesh[] = [];
  const holsterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide });
  const holsterInfo: Record<Hand, number[]> = { left: [], right: [] };
  const holsterEggs: Record<Hand, Egg> = { left: { cx: 0, cy: 0, cz: 0, rx: 0, ry: 0, rz: 0, bone: 0 }, right: { cx: 0, cy: 0, cz: 0, rx: 0, ry: 0, rz: 0, bone: 0 } };
  for (const hand of ['left', 'right'] as const) {
    const s = sideOf[hand];
    // Her thigh's points on this side.
    const legPoints = middle.filter((v) => share(v, (k) => k === thigh[hand]) > 0.6 && Math.sign(rest[v * 3]) === s);
    // The gun as her relaxed hand holds it: its grip's height (where her hand will find it again).
    const hanging = new THREE.Matrix4().copy(rootInverse).multiply(src.gunHanging[hand]);
    const grip = new THREE.Vector3().setFromMatrixPosition(hanging);
    grip.y -= BELT.holsterDown;
    // Her thigh's middle, front to back (halfway between its front and its back, below her bottom), and its outer
    // side along where the gun will lie (from its grip down its length).
    let front = -Infinity, back = Infinity, outer = 0;
    for (const v of legPoints) {
      const y = rest[v * 3 + 1];
      if (y > grip.y - 0.08 || y < grip.y - GUN.muzzle) continue;
      front = Math.max(front, rest[v * 3 + 2]); back = Math.min(back, rest[v * 3 + 2]);
    }
    const thighZ = Number.isFinite(front) ? (front + back) / 2 : grip.z;
    for (const v of legPoints) {
      const y = rest[v * 3 + 1];
      if (y > grip.y - 0.02 || y < grip.y - GUN.muzzle || Math.abs(rest[v * 3 + 2] - thighZ) > 0.04) continue;
      outer = Math.max(outer, rest[v * 3] * s);
    }
    if (outer <= 0) outer = Math.abs(grip.x) - 0.04;
    // THE GUN IN ITS HOLSTER: barrel straight down, the top of its slide to her front, so its grip points back (the
    // gun's own axes: x across, y its top, z its barrel). Its slide lies along her thigh's middle, just off her skin.
    const across = new THREE.Vector3(1, 0, 0), top = new THREE.Vector3(0, 0, 1), barrel = new THREE.Vector3(0, -1, 0);
    const slideMiddle = (GUN.slideTop + 0.029) / 2;
    const gunX = s * (outer + BELT.holsterOffSkin + 0.004 + 0.006 + GUN.halfWidth);
    const gunZ = thighZ + BELT.holsterForward - slideMiddle;
    holsterRest[hand].makeBasis(across, top, barrel).setPosition(gunX, grip.y, gunZ);
    holsterInfo[hand] = [+gunX.toFixed(3), +grip.y.toFixed(3), +gunZ.toFixed(3), +(outer * s).toFixed(3)];
    // (the room it takes, round its grip and the top of the holster: an egg a little wider than the gun, from the grip
    //  sticking out behind to the holster's front, from just above the grip to a little down the holster)
    holsterEggs[hand] = { cx: gunX, cy: grip.y - 0.03, cz: gunZ + 0.035, rx: GUN.halfWidth + 0.008, ry: 0.06, rz: 0.08, bone: thigh[hand] };

    // Its shape, in the gun's own frame: a sleeve round the slide and barrel (from the trigger guard to past the
    // muzzle, open at the top for the gun), a plate on her thigh's side, and a magenta stripe down its outer face.
    const piece = new SolidPiece(), m = holsterRest[hand];
    const inner = -s;                                               // (the gun's x toward her thigh)
    const w = GUN.halfWidth + 0.005;
    piece.box(m, -w, w, -0.004, GUN.slideTop + 0.007, 0.022, GUN.muzzle + 0.014, COLOUR.holster, 0.008, true);
    // (its mouth's rim, a little proud)
    piece.box(m, -w - 0.002, w + 0.002, -0.006, GUN.slideTop + 0.009, 0.022, 0.034, COLOUR.plate, 0.009, true);
    // (the plate against her thigh: a little taller and longer than the sleeve)
    const plateX = inner * (w + 0.003);
    piece.box(m, Math.min(plateX, plateX + inner * 0.004), Math.max(plateX, plateX + inner * 0.004), -0.016, GUN.slideTop + 0.02, 0.0, GUN.muzzle - 0.01, COLOUR.plate, 0.004);
    // (the stripe, on the outer face)
    const outX = -inner * (w + 0.0005);
    piece.box(m, Math.min(outX, outX - inner * 0.0015), Math.max(outX, outX - inner * 0.0015), 0.028, 0.042, 0.05, GUN.muzzle - 0.006, COLOUR.accent);
    const mesh = new THREE.Mesh(piece.geometry(), holsterMaterial);
    mesh.name = `holster-${hand}`;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    // (built in her rest frame; it rides her thigh bone: rest frame -> world -> the bone's own space)
    const bone = src.thighBone[hand];
    bone.updateWorldMatrix(true, false);
    const toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(root.matrixWorld);
    mesh.geometry.applyMatrix4(toBone);
    mesh.geometry.computeVertexNormals();
    bone.add(mesh);
    holsterMeshes.push(mesh);
    holsterSeat[hand].copy(toBone).multiply(holsterRest[hand]);

    // THE THIGH STRAPS: round her thigh at two heights down the holster.
    const legAll = middle.filter((v) => share(v, (k) => k === thigh[hand]) > 0.5);
    for (const down of BELT.thighStrapsDown) {
      const y = grip.y - down, ring = 40;
      // (her thigh's middle at that height, and in each slice of angle round it the furthest point out)
      let mx = 0, mz = 0, mn = 0;
      for (const v of legAll) if (Math.abs(rest[v * 3 + 1] - y) < 0.012) { mx += rest[v * 3]; mz += rest[v * 3 + 2]; mn++; }
      if (mn < 8) continue;
      mx /= mn; mz /= mn;
      const radius = new Float32Array(ring);
      for (const v of legAll) {
        if (Math.abs(rest[v * 3 + 1] - y) > 0.012) continue;
        const x = rest[v * 3] - mx, z = rest[v * 3 + 2] - mz, k = ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * ring) % ring) + ring) % ring;
        radius[k] = Math.max(radius[k], Math.hypot(x, z));
      }
      for (let k = 0; k < ring; k++) if (radius[k] === 0) radius[k] = radius[(k + ring - 1) % ring] || radius[(k + 1) % ring];
      // (smoothed round, so the strap's edges run straight instead of following each skin point in and out)
      for (let pass = 0; pass < 2; pass++) {
        const r = radius.slice();
        for (let k = 0; k < ring; k++) radius[k] = (r[(k + ring - 1) % ring] + 2 * r[k] + r[(k + 1) % ring]) / 4;
      }
      const tops: Spot[] = [], bottoms: Spot[] = [], outs: THREE.Vector3[] = [];
      for (let k = 0; k < ring; k++) {
        const a = (k / ring) * Math.PI * 2, out = outwardAt(a), at = new THREE.Vector3(mx + out.x * radius[k], y, mz + out.z * radius[k]);
        tops.push(spotAt(at.clone().addScaledVector(UP, BELT.strapWidth / 2), legAll, undefined, out));
        bottoms.push(spotAt(at.clone().addScaledVector(UP, -BELT.strapWidth / 2), legAll, undefined, out));
        outs.push(out);
      }
      band(tops, bottoms, outs, BELT.strapStandOff, BELT.strapThick, true, C.strap, C.edge);
    }

    // THE DROP STRAP: from the belt's bottom edge down her hip to behind the holster's plate. Two columns of spots a
    // strap's width apart, down the outside of her hip along the holster's middle line.
    {
      const angle = Math.atan2(gunX - cx, thighZ - cz);
      const k = ((Math.round((angle / (Math.PI * 2)) * N) % N) + N) % N;
      const from = beltBottomAt[k].y + 0.004, to = grip.y - 0.05, rows = 8;
      const columns = [-BELT.strapWidth / 2, BELT.strapWidth / 2];
      const lines: Spot[][] = columns.map(() => []), outs: THREE.Vector3[] = [];
      const sideOut = new THREE.Vector3(s, 0, 0);
      for (let i = 0; i <= rows; i++) {
        const y = from + (to - from) * (i / rows);
        columns.forEach((dz, c) => {
          // (the outermost of her points at this height, along this column)
          let best = -1, bestX = -Infinity;
          for (const v of middle) {
            if (Math.abs(rest[v * 3 + 1] - y) > 0.01 || Math.abs(rest[v * 3 + 2] - (thighZ + dz)) > 0.008) continue;
            if (rest[v * 3] * s > bestX) { bestX = rest[v * 3] * s; best = v; }
          }
          const at = best >= 0 ? restOf(best, new THREE.Vector3()) : new THREE.Vector3(s * outer, y, thighZ + dz);
          lines[c].push(spotAt(at.setY(y), middle, undefined, sideOut));
        });
        outs.push(sideOut);
      }
      // (a band lying down her side: its "top" row is one column, its "bottom" the other; its edges face front and back)
      bandAlong(lines[0], lines[1], outs, s);
    }
  }

  /** A strap running down her side: two columns of spots; its face pushed out sideways, its long edges facing front and back. */
  function bandAlong(front: Spot[], back: Spot[], outs: THREE.Vector3[], s: number): void {
    const at = new THREE.Vector3(), push = new THREE.Vector3();
    const column = (spots: Spot[], off: number, hint: THREE.Vector3): number[] => spots.map((spot, i) => {
      push.copy(outs[i]).multiplyScalar(off);
      spotPlace(spot, at).add(push);
      return pinned.point(spot, push, hint, C.strap, at);
    });
    // (a little further off her skin than the thigh straps: down her hip her skin curves away under it)
    const inner = BELT.strapStandOff + 0.003, outer = inner + BELT.strapThick;
    const sideHint = new THREE.Vector3(s, 0, 0), frontHint = new THREE.Vector3(0, 0, -1), backHint = new THREE.Vector3(0, 0, 1);
    pinned.strip(column(front, outer, sideHint), column(back, outer, sideHint), false);
    const edges = (spots: Spot[], off: number, hint: THREE.Vector3): number[] => spots.map((spot, i) => {
      push.copy(outs[i]).multiplyScalar(off);
      spotPlace(spot, at).add(push);
      return pinned.point(spot, push, hint, C.edge, at);
    });
    pinned.strip(edges(front, inner, frontHint), edges(front, outer, frontHint), false);
    pinned.strip(edges(back, outer, backHint), edges(back, inner, backHint), false);
  }

  /** A spot part of the way from one spot to another (both kept, each counted by its share). */
  function blendSpot(a: Spot, b: Spot, t: number): Spot {
    const v = new Int32Array(a.v.length + b.v.length), w = new Float32Array(v.length);
    v.set(a.v); v.set(b.v, a.v.length);
    for (let i = 0; i < a.v.length; i++) w[i] = a.w[i] * (1 - t);
    for (let i = 0; i < b.v.length; i++) w[a.v.length + i] = b.w[i] * t;
    return { v, w };
  }

  // ---- 4. THE PINNED PIECE: belt, buckle, straps; one skinned mesh on her own skeleton ------------------------------
  const pointCount = pinned.spots.length;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(pointCount * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(pinned.colour, 3));
  geometry.setIndex(pinned.index);
  // Each point is moved by her bones as its skin points are: their bones and shares, added up, the four biggest kept.
  // (worked out again when the belt moves to other skin points: `reshape`)
  const holdIndex = new Uint16Array(pointCount * 4), holdWeight = new Float32Array(pointCount * 4);
  // (plain attributes on these very arrays: three's Uint16BufferAttribute and Float32BufferAttribute make their own
  // copies, and weights written here afterwards would never reach the graphics chip)
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(holdIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(holdWeight, 4));
  const weigh = (): void => {
    holdIndex.fill(0); holdWeight.fill(0);
    const tally = new Map<number, number>();
    for (let p = 0; p < pointCount; p++) {
      tally.clear();
      const spot = pinned.spots[p];
      for (let i = 0; i < spot.v.length; i++) for (let c = 0; c < 4; c++) {
        const k = skinIndex[spot.v[i] * 4 + c], w = skinWeight[spot.v[i] * 4 + c] * spot.w[i];
        if (w > 0) tally.set(k, (tally.get(k) ?? 0) + w);
      }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = best.reduce((t, [, w]) => t + w, 0) || 1;
      best.forEach(([k, w], c) => { holdIndex[p * 4 + c] = k; holdWeight[p * 4 + c] = w / sum; });
    }
    geometry.getAttribute('skinIndex').needsUpdate = true;
    geometry.getAttribute('skinWeight').needsUpdate = true;
  };
  weigh();
  // Her four motion shapes (her belly's sway, bob and tilt, her bust's bob) move each point as they move its skin.
  const motionAttributes = src.motionMoves.map(() => new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3));
  geometry.morphAttributes.position = motionAttributes;
  geometry.morphTargetsRelative = true;

  /** Lay the pinned piece on her skin's points as they are now (her mesh's units). */
  const lay = (points: Float32Array): void => {
    const p = new THREE.Vector3(), sum = new THREE.Vector3();
    for (let i = 0; i < pointCount; i++) {
      const spot = pinned.spots[i];
      sum.set(0, 0, 0);
      for (let j = 0; j < spot.v.length; j++) {
        p.fromArray(points, spot.v[j] * 3).applyMatrix4(meshToRest);
        sum.addScaledVector(p, spot.w[j]);
      }
      sum.x += pinned.push[i * 3]; sum.y += pinned.push[i * 3 + 1]; sum.z += pinned.push[i * 3 + 2];
      sum.applyMatrix4(restToMesh);
      positions[i * 3] = sum.x; positions[i * 3 + 1] = sum.y; positions[i * 3 + 2] = sum.z;
      // (each motion shape: its moves at the spot's skin points, shared out the same way; already in her mesh's units)
      src.motionMoves.forEach((moves, k) => {
        const target = motionAttributes[k].array as Float32Array;
        let x = 0, y = 0, z = 0;
        for (let j = 0; j < spot.v.length; j++) { const v = spot.v[j] * 3; x += moves[v] * spot.w[j]; y += moves[v + 1] * spot.w[j]; z += moves[v + 2] * spot.w[j]; }
        target[i * 3] = x; target[i * 3 + 1] = y; target[i * 3 + 2] = z;
      });
    }
    geometry.getAttribute('position').needsUpdate = true;
    for (const a of motionAttributes) a.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  };
  lay(src.points);

  const beltMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  const belt = new THREE.SkinnedMesh(geometry, beltMaterial);
  belt.name = 'belt-and-straps';
  belt.matrix.copy(skin.matrix);
  belt.matrix.decompose(belt.position, belt.quaternion, belt.scale);
  skin.parent?.add(belt);
  belt.bind(skin.skeleton, skin.bindMatrix);
  belt.morphTargetDictionary = Object.fromEntries(src.motionMoves.map((_, i) => [`motion${i}`, i]));
  belt.morphTargetInfluences = src.influences;

  // ---- 5. THE POUCHES, three behind each hip, and the clips standing in them ----------------------------------------
  const pouchCount = BELT.pouchAngles.length * 2;
  /** Each pouch's clip as it stands in it, in its bone's space; and the bone. */
  const clipSeat: THREE.Matrix4[] = [], clipBone: THREE.Bone[] = [];
  // (the pouches ride the bone that carries most of the belt behind her hips)
  const carrier = (() => {
    const tally = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      const a = (k / N) * 360;
      if (a < 95 || a > 265) continue;
      for (const spot of [beltTop[k], beltBottom[k]]) for (let i = 0; i < spot.v.length; i++) for (let c = 0; c < 4; c++) {
        const b = skinIndex[spot.v[i] * 4 + c];
        if (trunk.has(b)) tally.set(b, (tally.get(b) ?? 0) + skinWeight[spot.v[i] * 4 + c] * spot.w[i]);
      }
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? bones[best[0]] : src.trunkBones[0];
  })();
  carrier.updateWorldMatrix(true, false);
  const carrierToBone = new THREE.Matrix4().copy(carrier.matrixWorld).invert().multiply(root.matrixWorld);
  const pouches = new SolidPiece();
  const inner = { x: CLIP.width + 0.004, along: CLIP.depth + 0.005, tall: CLIP.height - BELT.clipShows + 0.004 };
  const wall = 0.003;
  for (const hand of ['left', 'right'] as const) {
    const s = sideOf[hand];
    for (const degrees of BELT.pouchAngles) {
      const angle = deg(degrees) * s, out = outwardAt(angle), along = new THREE.Vector3().crossVectors(out, UP);
      const k = ((Math.round((angle / (Math.PI * 2)) * N) % N) + N) % N;
      // (its back on the belt's face, its top a little above the belt's top)
      const onBelt = beltTopAt[k].clone().lerp(beltBottomAt[k], 0.5).addScaledVector(out, BELT.standOff + BELT.thick + 0.001);
      const topY = beltTopAt[k].y + BELT.pouchAbove;
      // The pouch's frame: x outward from her, y up, z along the belt; its origin at its back, top, middle.
      const frame = new THREE.Matrix4().makeBasis(out, UP, along).setPosition(onBelt.x, topY, onBelt.z);
      const depth = inner.x + 2 * wall, width = inner.along + 2 * wall, tall = inner.tall + wall;
      // its walls (open at the top for the clip), its front a little shorter, with a magenta mark on its front
      pouches.box(frame, 0, wall, -tall, 0, -width / 2, width / 2, COLOUR.plate);
      pouches.box(frame, depth - wall, depth, -tall, -0.006, -width / 2, width / 2, COLOUR.belt, 0.0015);
      pouches.box(frame, wall, depth - wall, -tall, 0, -width / 2, -width / 2 + wall, COLOUR.belt);
      pouches.box(frame, wall, depth - wall, -tall, 0, width / 2 - wall, width / 2, COLOUR.belt);
      pouches.box(frame, wall, depth - wall, -tall, -tall + wall, -width / 2 + wall, width / 2 - wall, COLOUR.belt);
      pouches.box(frame, depth, depth + 0.0012, -tall * 0.7, -tall * 0.55, -width / 3, width / 3, COLOUR.accent);
      // THE CLIP in it: upside down (its magenta base up, where her fingers find it), its thin side out from her.
      const clipFrame = new THREE.Matrix4().makeBasis(out, UP.clone().negate(), out.clone().cross(UP.clone().negate()));
      clipFrame.setPosition(onBelt.clone().addScaledVector(out, depth / 2).setY(topY + BELT.clipShows - CLIP.height / 2));
      clipSeat.push(new THREE.Matrix4().copy(carrierToBone).multiply(clipFrame));
      clipBone.push(carrier);
    }
  }
  const pouchGeometry = pouches.geometry();
  pouchGeometry.applyMatrix4(carrierToBone);
  pouchGeometry.computeVertexNormals();
  const pouchMesh = new THREE.Mesh(pouchGeometry, holsterMaterial);
  pouchMesh.name = 'clip-pouches';
  pouchMesh.matrixAutoUpdate = false;
  pouchMesh.frustumCulled = false;
  carrier.add(pouchMesh);

  // The clips: one instanced mesh (the guns' own clip shape and colours), a place for each pouch.
  const clipMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.45, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xff2fb0, emissive: 0xff2fb0, emissiveIntensity: 0.8, roughness: 0.4 }),
  ];
  const clipShape = createClip(clipMaterials);
  const clipMesh = new THREE.InstancedMesh(clipShape.geometry, clipMaterials, pouchCount);
  clipMesh.name = 'pouch-clips';
  clipMesh.matrixAutoUpdate = false;
  clipMesh.frustumCulled = false;
  carrier.add(clipMesh);
  const full: boolean[] = new Array(pouchCount).fill(false);
  /** The empty clips tucked back in (a pouch's own clip object), by pouch; and the dark base they are given. */
  const stowed: (THREE.Object3D | null)[] = new Array(pouchCount).fill(null);
  const emptyBase = new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.6, metalness: 0.3 });
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const showClips = (): void => {
    for (let i = 0; i < pouchCount; i++) clipMesh.setMatrixAt(i, full[i] ? clipSeat[i] : hidden);
    clipMesh.instanceMatrix.needsUpdate = true;
  };
  /** The order pouches are filled in: the front one on each side first, left and right in turn. */
  const fillOrder: number[] = [];
  for (let i = 0; i < BELT.pouchAngles.length; i++) fillOrder.push(i, BELT.pouchAngles.length + i);
  const setClips = (n: number): void => {
    // (the empties go: the table swaps them for full clips)
    for (let i = 0; i < pouchCount; i++) { const c = stowed[i]; if (c) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); stowed[i] = null; } }
    full.fill(false);
    for (let i = 0; i < Math.min(pouchCount, Math.max(0, Math.round(n))); i++) full[fillOrder[i]] = true;
    showClips();
  };
  setClips(pouchCount);

  const where = (k: number): number => lineAt((k / 360) * Math.PI * 2).y;
  return {
    meshes: [belt, ...holsterMeshes, pouchMesh, clipMesh],
    holsterBone: (hand) => src.thighBone[hand],
    holsterSeat: (hand, out) => out.copy(holsterSeat[hand]),
    holsterEgg: (hand) => holsterEggs[hand],
    pouches: pouchCount,
    get clips() { return full.filter(Boolean).length; },
    setClips,
    pouchFull: (i) => full[i] ?? false,
    pouchState: (i) => (full[i] ? 'full' : stowed[i] ? 'empty' : 'none'),
    pouchBone: () => carrier,
    pouchSeat: (i, out) => out.copy(clipSeat[i]),
    takeFull(i) {
      if (!full[i]) return null;
      full[i] = false;
      showClips();
      // (a clip of its own, standing exactly where the pouch's clip stood: the guns' clip shape and colours)
      const clip = new THREE.Mesh(clipShape.geometry.clone(), clipMaterials);
      clip.name = 'clip';
      clip.matrixAutoUpdate = false;
      clip.frustumCulled = false;
      clip.matrix.copy(clipSeat[i]);
      carrier.add(clip);
      clip.updateMatrixWorld(true);
      return clip;
    },
    stowEmpty(i, clip) {
      clip.updateWorldMatrix(true, false);
      carrier.updateWorldMatrix(true, false);
      clip.matrixAutoUpdate = false;
      clip.matrix.copy(carrier.matrixWorld).invert().multiply(clip.matrixWorld);
      carrier.add(clip);
      // (its base dark: it is empty)
      const mesh = clip as THREE.Mesh;
      if (Array.isArray(mesh.material)) mesh.material = [mesh.material[0], emptyBase];
      stowed[i] = clip;
    },
    side: (hand) => (hand === 'left' ? [0, 1, 2] : [3, 4, 5]).filter((i) => i < pouchCount),
    pouchClip(i, out) {
      const bone = clipBone[i];
      bone.updateWorldMatrix(true, false);
      return out.copy(bone.matrixWorld).multiply(clipSeat[i]);
    },
    reshape(points, belly) {
      // (her rest-frame points again, so the belt's place is found on her new shape; then laid and weighed again)
      const p = new THREE.Vector3();
      for (let v = 0; v < count; v++) { p.fromArray(points, v * 3).applyMatrix4(meshToRest); rest[v * 3] = p.x; rest[v * 3 + 1] = p.y; rest[v * 3 + 2] = p.z; }
      placeBelt(belly);
      weigh();
      lay(points);
    },
    info: () => ({ trim: trimPoints, front: +where(0).toFixed(3), side: +where(90).toFixed(3), back: +where(180).toFixed(3), holster: holsterInfo }),
    dispose(): void {
      belt.removeFromParent(); geometry.dispose(); beltMaterial.dispose();
      for (const mesh of holsterMeshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      pouchMesh.removeFromParent(); pouchGeometry.dispose(); holsterMaterial.dispose();
      clipMesh.removeFromParent(); clipMesh.dispose(); clipShape.geometry.dispose(); emptyBase.dispose();
      for (const c of stowed) if (c) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
      for (const m of clipMaterials) m.dispose();
    },
  };
}
