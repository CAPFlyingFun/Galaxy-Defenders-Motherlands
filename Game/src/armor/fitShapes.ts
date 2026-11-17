// ============================================================================
// fitShapes.ts -- plates that hug the real body.
//
// Three ways a rigid piece is shaped to her, each from her measured sizes:
//
//  * limbPlate   round a forearm, shin or thigh. Her limb is not a tube: the
//                measurements say how far her skin reaches at every height and
//                in every direction round the bone, and the plate's INSIDE is
//                laid a few millimetres outside that. Its OUTSIDE is whatever
//                the design wants (a smooth sleeve, a boxy knee block...).
//  * domePlate   over a shoulder, the same idea in every direction from a
//                point under the joint.
//  * sidePlate   on the side of a hip.
//
// Because the inside always follows her and the outside is always further
// out, a piece made here cannot cut into her, whatever its style.
// Each returns the three parts of a shell (outside, lining, rim): see geo.ts.
// ============================================================================
import * as THREE from 'three';
import { limbRadius, polarRadius, hipSideX, type BodyFit, type LimbProfile, type PolarMap } from './bodyFit';
import { shell, type ShellParts } from './geo';
import { SKIN_GAP } from './kit';

const TURN = Math.PI * 2;
export const deg = (d: number): number => (d * Math.PI) / 180;

export interface LimbPlateSpec {
  readonly profile: LimbProfile;
  /** Top and bottom of the plate (y in the slot's frame; the limb runs down -y). */
  readonly y0: number;
  readonly y1: number;
  /** How far round it reaches, radians (0 = front, quarter turn = outer side). Leave both out for all the way round. */
  readonly a0?: number;
  readonly a1?: number;
  /** ...or a reach that changes down the plate: given v (0 top .. 1 bottom), returns [from, to]. */
  readonly span?: (v: number) => readonly [number, number];
  /** Squares round and down. */
  readonly nu: number;
  readonly nv: number;
  /** The plate's thickness at (u across 0..1, v down 0..1), metres. */
  readonly thick: (u: number, v: number) => number;
  /** How far above her skin the plate's inside sits (default: the standard gap). An overlay on a sleeve sits on the sleeve. */
  readonly base?: number | ((u: number, v: number) => number);
  /** Optional: the outside as a radius of its own, given the angle, height and the inside's radius there (a boxy block). */
  readonly outer?: (a: number, y: number, inner: number, u: number, v: number) => number;
}

/** A plate round a limb. */
export function limbPlate(s: LimbPlateSpec): ShellParts {
  const full = !s.span && (s.a0 === undefined || s.a1 === undefined);
  const where = (u: number, v: number): readonly [number, number, number] => {
    const [from, to] = s.span ? s.span(v) : full ? [0, TURN] : [s.a0!, s.a1!];
    const a = from + (to - from) * u, y = s.y0 + (s.y1 - s.y0) * v;
    const base = typeof s.base === 'function' ? s.base(u, v) : s.base ?? SKIN_GAP;
    return [a, y, limbRadius(s.profile, y, a) + base];
  };
  const outer = (u: number, v: number, out: THREE.Vector3) => {
    const [a, y, inner] = where(u, v);
    const r = s.outer ? Math.max(inner + 0.002, s.outer(a, y, inner, u, v)) : inner + s.thick(u, v);
    out.set(r * Math.sin(a), y, r * Math.cos(a));
  };
  const inner = (u: number, v: number, out: THREE.Vector3) => {
    const [a, y, r] = where(u, v);
    out.set(r * Math.sin(a), y, r * Math.cos(a));
  };
  // (a point inside the limb, for the faces to look away from: on the bone, half way down the plate)
  return shell(s.nu, s.nv, outer, inner, new THREE.Vector3(0, (s.y0 + s.y1) / 2, 0), full);
}

export interface DomePlateSpec {
  readonly map: PolarMap;
  /** The direction the middle of the plate faces (from the map's centre). */
  readonly axis: THREE.Vector3;
  /** How far from that direction the plate reaches, radians: from `cone0` (0 = a full cap) to `cone1`. */
  readonly cone0?: number;
  readonly cone1: number;
  /** Optional: squash the reach by direction round the axis (u 0..1), to give the edge a shape. */
  readonly reach?: (u: number) => number;
  /**
   * Optional: stop the plate, in each direction round the axis, where her skin is further than this from the centre
   * (metres). Round a shoulder that is where her arm's own roundness ends and her chest, back or neck begins, so the
   * pad stays a pad and does not spread over her torso.
   */
  readonly skinLimit?: number;
  readonly nu: number;
  readonly nv: number;
  /** Thickness at (u round the axis, v from the middle out to the edge). */
  readonly thick: (u: number, v: number) => number;
  readonly base?: number;
  /** Optional: the outside as a distance of its own from the centre, given the direction and the inside's distance. */
  readonly outer?: (dir: THREE.Vector3, inner: number, u: number, v: number) => number;
}

/** A plate over a rounded part of her (a shoulder), reaching out from a middle direction like a cap. */
export function domePlate(s: DomePlateSpec): ShellParts {
  const axis = s.axis.clone().normalize();
  // two directions square to the axis, to go round it with
  const side = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize(), up = new THREE.Vector3().crossVectors(axis, side);
  const c = new THREE.Vector3(...s.map.center), dir = new THREE.Vector3();
  const point = (psi: number, phi: number) => dir.copy(axis).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi) * Math.cos(psi)).addScaledVector(up, Math.sin(phi) * Math.sin(psi));
  // How far the plate may reach in each direction round the axis (as a share of cone1), if her skin sets a limit.
  let limit: number[] | null = null;
  if (s.skinLimit !== undefined) {
    limit = [];
    for (let i = 0; i < s.nu; i++) {
      let k = 1;
      for (let step = 1; step <= 32; step++) {
        point((i / s.nu) * TURN, (s.cone1 * step) / 32);
        if (polarRadius(s.map, dir.x, dir.y, dir.z) > s.skinLimit) { k = (step - 1) / 32; break; }
      }
      limit.push(k);
    }
    // (evened out, so the edge is a smooth line)
    for (let pass = 0; pass < 2; pass++) limit = limit.map((_x, i, a) => Math.min(a[i], (a[(i + a.length - 1) % a.length] + a[i] + a[(i + 1) % a.length]) / 3));
  }
  const reachAt = (u: number): number => {
    let k = s.reach ? s.reach(u) : 1;
    if (limit) { const f = u * s.nu, i = Math.floor(f) % s.nu, t = f - Math.floor(f); k = Math.min(k, limit[i] * (1 - t) + limit[(i + 1) % s.nu] * t); }
    return k;
  };
  const aim = (u: number, v: number) => {
    const psi = u * TURN, phi = (s.cone0 ?? 0) + (s.cone1 * reachAt(u) - (s.cone0 ?? 0)) * v;
    point(psi, phi);
    return polarRadius(s.map, dir.x, dir.y, dir.z) + (s.base ?? SKIN_GAP);
  };
  const outer = (u: number, v: number, out: THREE.Vector3) => {
    const inner = aim(u, v);
    const r = s.outer ? Math.max(inner + 0.002, s.outer(dir, inner, u, v)) : inner + s.thick(u, v);
    out.copy(c).addScaledVector(dir, r);
  };
  const inner = (u: number, v: number, out: THREE.Vector3) => { const r = aim(u, v); out.copy(c).addScaledVector(dir, r); };
  return shell(s.nu, s.nv, outer, inner, c, true);
}

export interface SidePlateSpec {
  readonly fit: BodyFit;
  /** The middle of the plate on her hip's side: height y and depth z in the hip slot's frame. */
  readonly y: number;
  readonly z: number;
  /** A round plate of this radius... */
  readonly radius?: number;
  /** ...or a rectangular one, this tall and this deep. */
  readonly height?: number;
  readonly depth?: number;
  readonly nu: number;
  readonly nv: number;
  /** How far out the plate's face stands from the furthest her skin reaches under it (a flat face), metres... */
  readonly stand: number;
  /** ...plus this much more toward the middle (a dome), at v = 0 (the middle) fading to none at the edge. */
  readonly dome?: number;
}

/** How far her skin reaches out under a plate on her hip (the largest, anywhere under it). */
export function sideReach(s: SidePlateSpec): number {
  let reach = 0;
  const hy = s.radius ?? s.height! / 2, hz = s.radius ?? s.depth! / 2;
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) reach = Math.max(reach, hipSideX(s.fit, s.y + (hy * i) / 4, s.z + (hz * j) / 4));
  return reach + SKIN_GAP;
}

/** A plate on the side of her hip: its back follows her, its face is flat (or domed) and stands clear of her. */
export function sidePlate(s: SidePlateSpec): ShellParts {
  const face = sideReach(s) + s.stand;
  if (s.radius !== undefined) {
    const R = s.radius;
    const at = (u: number, v: number) => [s.y + Math.sin(u * TURN) * R * v, s.z + Math.cos(u * TURN) * R * v] as const;
    return shell(s.nu, s.nv,
      (u, v, out) => { const [y, z] = at(u, v); out.set(face + (s.dome ?? 0) * (1 - v * v), y, z); },
      (u, v, out) => { const [y, z] = at(u, v); out.set(Math.min(face - 0.002, hipSideX(s.fit, y, z) + SKIN_GAP), y, z); },
      new THREE.Vector3(0, s.y, s.z), true);
  }
  const H = s.height!, D = s.depth!;
  const at = (u: number, v: number) => [s.y + H * (0.5 - v), s.z + D * (u - 0.5)] as const;
  return shell(s.nu, s.nv,
    (u, v, out) => { const [y, z] = at(u, v); out.set(face + (s.dome ?? 0) * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2), y, z); },
    (u, v, out) => { const [y, z] = at(u, v); out.set(Math.min(face - 0.002, hipSideX(s.fit, y, z) + SKIN_GAP), y, z); },
    new THREE.Vector3(0, s.y, s.z), false);
}
