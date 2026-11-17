// ============================================================================
// boot.ts -- heeled boots.
//
// FRAME (slots "footL" / "footR", riding the FOOT bone, the one at her ankle):
//   origin = the ankle joint
//   +Y straight up, +Z toward her toes, +X to the foot's outer side,
//   WITH HER FOOT POSED FOR HEELS: pitched toes-down by `fit.heelPitch`
//   (0.42 rad, 24 degrees) about the ankle, and her toes bent back level by
//   the same amount. In that pose this frame is level with the floor, and
//   the floor is at y = -fit.ankleHeight (18 cm under her ankle). The game's
//   body must pose her feet the same way, or the heel will not sit flat.
//   The right boot is the left boot mirrored.
//
// SIZE. The boot is built round her measured foot, slice by slice from heel
// to toe (her foot is about 24 cm long and 9.5 cm wide at the ball): the upper
// is 4 mm clear of her skin plus a 5 mm wall; the sole fills the space between
// her foot and the floor (14 mm under her toes, a heel block about 8.5 cm tall).
//
// HOW IT IS BUILT
//   upper   a closed, rounded tube lofted along the foot, in bands of colour:
//           heel counter, strap, vamp, toe cap;
//   collar  an oval sleeve round her leg from the ankle up to 9 cm above it
//           (it overlaps the bottom of the shin armor);
//   sole    a side-view outline (thin under the arch, a platform under the
//           ball) given the foot's width; and the heel block the same way.
//
// STYLES  'block' a wide, square block heel and round toe (Blaze, Coral, Vela, Nova)
//         'slim'  a narrower, tapered heel and a more pointed toe (Tessa, Aurora)
// ============================================================================
import * as THREE from 'three';
import { footSlice } from '../bodyFit';
import { PieceBuilder, clamp, dark, grid, lerp, paint, place, prism, revolve, shell, smooth, warp, type Finish } from '../geo';
import { SKIN_GAP, defaultKit, finishPiece, type ArmorKit, type PieceColors, type Side } from '../kit';

export type BootStyle = 'block' | 'slim';
export interface BootOptions {
  readonly style: BootStyle;
  /** A dark strap over the instep. */
  readonly strap?: boolean;
  /** A round boss on the outer ankle. */
  readonly disc?: boolean;
}

/** Colours: main = the upper, second = toe cap, accent = heel block (and disc), dark = sole, strap and lining. */
export function buildBoot(o: BootOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), fit = kit.fit, slices = fit.foot, slim = o.style === 'slim';
  const floor = -fit.ankleHeight, WALL = 0.005;
  const zHeel = slices[0].z - 0.016, zToe = slices[slices.length - 1].z + (slim ? 0.04 : 0.024);

  // ---- The line under her foot. The boot's inside must pass under every slice of her sole, so it is the
  // "tight string" stretched under the measured points (their lower convex hull), a little lower still.
  const hull: Array<[number, number]> = [];
  for (const s of slices) {
    const p: [number, number] = [s.z, s.yMin - SKIN_GAP];
    while (hull.length >= 2) {
      const a = hull[hull.length - 2], m = hull[hull.length - 1];
      if ((m[0] - a[0]) * (p[1] - a[1]) - (m[1] - a[1]) * (p[0] - a[0]) <= 0) hull.pop(); else break; // (m is above the string from a to p: drop it)
    }
    hull.push(p);
  }
  const under = (z: number): number => {
    if (z <= hull[0][0]) return hull[0][1];
    for (let i = 0; i + 1 < hull.length; i++) if (z <= hull[i + 1][0]) return lerp(hull[i][1], hull[i + 1][1], (z - hull[i][0]) / (hull[i + 1][0] - hull[i][0]));
    return hull[hull.length - 1][1];
  };
  // ---- The line over her foot: her instep and toes, plus the gap and the wall; capped where her leg begins (the collar takes over there).
  const over = (z: number): number => {
    let top = -Infinity;
    for (const dz of [-0.01, 0, 0.01]) top = Math.max(top, footSlice(fit, z + dz).yMax);
    return Math.min(0.03, top + SKIN_GAP + WALL);
  };
  /** One cross-section of the upper at z: a rounded box round her foot. `k` shrinks it (to close the two ends). */
  const section = (z: number, k: number, a: number, out: THREE.Vector3) => {
    const s = footSlice(fit, clamp(z, slices[0].z, slices[slices.length - 1].z));
    const point = slim ? lerp(1, 0.6, smooth(0.11, zToe, z)) : 1; // a slim boot narrows toward the toe
    const cx = (s.xMin + s.xMax) / 2, hw = ((s.xMax - s.xMin) / 2 + SKIN_GAP + WALL) * k * point;
    const lo = under(z) - 0.002, hi = over(z), cy = (lo + hi) / 2, hh = ((hi - lo) / 2) * k;
    const ca = Math.cos(a), sa = Math.sin(a), n = 2 / (sa < 0 ? 7 : 3.2); // (a "squircle": flatter sides than an oval; almost square underneath, where her sole is flat)
    out.set(cx + hw * Math.sign(ca) * Math.abs(ca) ** n, cy + hh * Math.sign(sa) * Math.abs(sa) ** n, z);
  };
  // The upper, in bands along the foot. Each band is one closed tube of squares.
  const band = (z0: number, z1: number, rows: number, finish: Finish) => {
    b.add(grid(14, rows, (u, v, out) => {
      const z = lerp(z0, z1, v), w = (z - zHeel) / (zToe - zHeel);
      section(z, Math.sqrt(Math.max(0, 1 - Math.abs(2 * w - 1) ** 16)), u * Math.PI * 2, out); // (full size but for the very ends, which round off shut)
    }, { closeU: true, from: new THREE.Vector3(0, (under((z0 + z1) / 2) + over((z0 + z1) / 2)) / 2, (z0 + z1) / 2) }), finish);
  };
  const strapZ0 = 0.022, strapZ1 = 0.052, toeZ = 0.108;
  band(zHeel, o.strap ? strapZ0 : toeZ, o.strap ? 5 : 9, paint(c.main));
  if (o.strap) { band(strapZ0, strapZ1, 2, dark(c.dark, 0.5)); band(strapZ1, toeZ, 3, paint(c.main)); }
  band(toeZ, zToe, 5, paint(c.second));

  // ---- The collar round her leg above the ankle ----
  const col = fit.footCollar, ccx = (col.min[0] + col.max[0]) / 2, ccz = (col.min[2] + col.max[2]) / 2;
  const crx = (col.max[0] - col.min[0]) / 2 + SKIN_GAP, crz = (col.max[2] - col.min[2]) / 2 + SKIN_GAP;
  const collar = (extra: (v: number) => number) => (u: number, v: number, out: THREE.Vector3) => {
    const a = u * Math.PI * 2, e = extra(v);
    out.set(ccx + (crx + e) * Math.sin(a), lerp(0.09, -0.04, v), ccz + (crz + e) * Math.cos(a));
  };
  b.addShell(shell(16, 4, collar((v) => 0.015 - 0.005 * smooth(0, 0.5, v)), collar(() => 0), new THREE.Vector3(ccx, 0.02, ccz), true), paint(c.main), dark(c.dark));
  // a band of the second colour round the top of the collar
  b.add(grid(16, 1, collar((v) => 0.0175 - 0.001 * v), { closeU: true, from: new THREE.Vector3(ccx, 0.08, ccz) }), paint(c.second), place(0, 0.09 * 0.72, 0, 0, 0, 0, 1, 0.28, 1));

  // ---- The sole and the heel block: side-view outlines, then widened to her foot ----
  const heelLen = slim ? 0.034 : 0.052, zh0 = zHeel + 0.004, zh1 = zh0 + heelLen;
  const zBall = 0.055, top = (z: number) => under(z) + 0.003, shank = (z: number) => under(z) - 0.009;
  const W0 = 0.08;
  /** Take an outline drawn in the side view as [z, y] points and make it a solid as wide as her foot at each z. */
  const sideSolid = (outline: Array<[number, number]>, widen: (p: THREE.Vector3) => number, finish: Finish) => {
    const g = prism(outline, W0, 0.003).applyMatrix4(place(0, 0, 0, 0, -Math.PI / 2)); // (drawn in x-y; turned so its x becomes z)
    warp(g, (p) => {
      const s = footSlice(fit, clamp(p.z, slices[0].z, slices[slices.length - 1].z));
      const point = slim ? lerp(1, 0.6, smooth(0.11, zToe, p.z)) : 1;
      p.x = (s.xMin + s.xMax) / 2 + (p.x / (W0 / 2)) * ((s.xMax - s.xMin) / 2 + SKIN_GAP + WALL - 0.004) * point * widen(p);
    });
    b.add(g, finish);
  };
  const along = (z0: number, z1: number, n: number, f: (z: number) => number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n); out.push([z, f(z)]); }
    return out;
  };
  // the heel block: from the seat under her heel straight down to the floor (a slim heel tapers as it goes down)
  const seat = top(zh0);
  sideSolid([[zh0, floor], [zh1 - (slim ? 0.008 : 0), floor], [zh1 + 0.004, shank(zh1 + 0.004)], ...along(zh1 + 0.004, zh0, 3, top)],
    (p) => (slim ? lerp(0.5, 0.95, clamp((p.y - floor) / (seat - floor), 0, 1)) : 0.95), paint(c.accent));
  // the sole: thin under the arch, a platform under the ball and toes
  sideSolid([[zh1, shank(zh1)], ...along(zh1 + 0.01, zBall, 5, shank), [zBall + 0.014, floor], [zToe - 0.03, floor], [zToe - 0.016, floor + 0.012], ...along(zToe - 0.016, zh1, 12, top)],
    () => 1, dark(c.dark, 0.7));

  if (o.disc) {
    const at = place(ccx + crx + 0.013, 0.005, ccz, 0, 0, -Math.PI / 2);
    b.add(revolve([[0.03, 0], [0.03, 0.006], [0.024, 0.012], [0.016, 0.012]], { seg: 14 }), dark(c.dark, 0.4), at);
    b.add(revolve([[0.016, 0.012], [0.014, 0.016], [0, 0.017]], { seg: 14 }), paint(c.accent), at.clone());
  }
  return finishPiece(b, `foot${side}`, kit, side);
}
