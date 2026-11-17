// ============================================================================
// guns.ts -- the heroines' guns.
//
// FRAME (slots "gunL" / "gunR", riding the HAND bone, the one at her wrist):
//   origin = the middle of the grip, where her palm closes round it
//            (on the measured body: 8.5 cm along her hand from the wrist and
//            3.4 cm into her palm)
//   +Z = the way it shoots (out along her hand, in line with her forearm)
//   +Y = the top of the gun (her thumb's side)
//   +X = across the gun. Every gun is the same on both sides, so one design
//        serves either hand.
//
// Each gun's mesh carries two marked points as child objects, so the game can
// ask where they are in the world at any moment:
//   "muzzle"  where a shot leaves (also in mesh.userData.muzzle, in the gun's frame)
//   "grip"    the origin, where the hand holds it
// (Tessa's hose gun also marks "hoseEnd", the loose end of its hose.)
//
// SIZE. These are big, toy-like sidearms as in Joshua's pictures: 31-40 cm
// from the back of the frame to the muzzle, 3-5 cm thick, the grip 9 cm tall.
//
// HOW THEY ARE BUILT. Flat-sided parts are drawn as a SIDE-VIEW outline and
// given thickness (a bevelled slab); round parts (barrels) are a profile
// spun round the barrel's line. Light strips are thin slabs in the glow finish.
//
// DESIGNS
//   'longBlaster'  a long pistol with a barrel shroud over it (Blaze)
//   'blockBlaster' a tall, blocky slab with grooves and a barrel on top (Coral)
//   'slimPistol'   a long thin slide with a coloured rail (Vela)
//   'cannon'       a fat drum barrel with a flared muzzle (Nova)
//   'hoseGun'      a boxy sprayer fed by a hose from the grip (Tessa)
//   'smg'          a boxy machine pistol with a magazine and light strips (Aurora)
// ============================================================================
import * as THREE from 'three';
import { PieceBuilder, box, dark, glow, paint, place, prism, revolve, tube, type Finish } from '../geo';
import { defaultKit, finishPiece, type ArmorKit, type PieceColors } from '../kit';

export type GunDesign = 'longBlaster' | 'blockBlaster' | 'slimPistol' | 'cannon' | 'hoseGun' | 'smg';
export const GUN_DESIGNS: readonly GunDesign[] = ['longBlaster', 'blockBlaster', 'slimPistol', 'cannon', 'hoseGun', 'smg'];

export interface GunOptions {
  readonly design: GunDesign;
  /** 1 = as designed. */
  readonly size?: number;
}

/** Colours: main = the body, second = its second tone, accent = stripes and tips, dark = grip and barrel, glow = lights. */
export function buildGun(o: GunOptions, c: PieceColors, hand: 'L' | 'R', kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), k = o.size ?? 1;
  /** A slab from a side-view outline of [z, y] points, `thick` across, centred at x. */
  const slab = (outline: Array<[number, number]>, thick: number, finish: Finish, x = 0, bevel = 0.004) =>
    b.add(prism(outline, thick, Math.min(bevel, thick * 0.3)), finish, place(x, 0, 0, 0, -Math.PI / 2));
  /** A turned part along the barrel's line at height y: `profile` is [radius, z] points. */
  const turned = (profile: Array<[number, number]>, y: number, finish: Finish, seg = 14) =>
    b.add(revolve(profile, { seg }), finish, place(0, y, 0, Math.PI / 2));
  /** A thin strip on BOTH sides of the gun: `len` along z, `tall` in y, centred at (y, z), on the faces at x = +-half. */
  const sides = (half: number, y: number, z: number, tall: number, len: number, finish: Finish, proud = 0.0015) => {
    for (const s of [-1, 1]) b.add(box(proud * 2, tall, len, 0.0008), finish, place(s * half, y, z));
  };
  const body = paint(c.main, 0.45), second = paint(c.second, 0.45), grip = dark(c.dark, 0.7), steel = dark(c.dark, 0.35);
  // The grip is the same on every gun: a slab leaning back a little, with the origin at its middle.
  const gripSlab = (bottom = -0.05) => slab([[-0.024, bottom], [0.01, bottom], [0.022, 0.032], [-0.012, 0.032]], 0.028, grip);
  /** The small bar in front of the trigger. */
  const guard = (z1 = 0.075) => slab([[0.02, 0.032], [z1, 0.032], [z1 - 0.012, -0.004], [0.028, -0.004], [0.03, 0.004], [z1 - 0.02, 0.004], [z1 - 0.014, 0.024], [0.02, 0.024]], 0.012, steel, 0, 0.002);
  let muzzle = new THREE.Vector3(), hoseEnd: THREE.Vector3 | null = null;

  if (o.design === 'longBlaster') {
    gripSlab(); guard();
    slab([[-0.07, 0.03], [0.2, 0.03], [0.2, 0.05], [0.215, 0.064], [0.215, 0.092], [-0.05, 0.092], [-0.07, 0.074]], 0.036, body);
    slab([[0.09, 0.034], [0.2, 0.034], [0.19, 0.006], [0.1, 0.006]], 0.03, second);
    // the shroud over the barrel, with two collars, and the thin muzzle beyond it
    turned([[0, 0.0], [0.02, 0.0], [0.023, 0.006], [0.023, 0.12], [0.026, 0.124], [0.026, 0.14], [0.023, 0.144], [0.023, 0.29], [0.019, 0.3], [0.013, 0.3]], 0.11, steel);
    turned([[0.013, 0.3], [0.013, 0.375], [0.009, 0.375], [0.008, 0.33], [0, 0.33]], 0.11, dark(0x0c0d10, 0.6));
    sides(0.018, 0.068, 0.1, 0.014, 0.12, glow(c.glow));
    sides(0.018, 0.045, -0.02, 0.01, 0.06, paint(c.accent));
    muzzle.set(0, 0.11, 0.375);
  } else if (o.design === 'blockBlaster') {
    gripSlab(); 
    slab([[0.012, 0.034], [0.095, 0.034], [0.095, 0.006], [0.03, 0.006]], 0.03, grip);
    // the big slab body, with three dark grooves along each side
    slab([[-0.05, 0.03], [0.3, 0.03], [0.3, 0.15], [0.262, 0.166], [-0.02, 0.166], [-0.05, 0.14]], 0.05, body, 0, 0.005);
    for (const y of [0.06, 0.092, 0.124]) sides(0.025, y, 0.125, 0.007, 0.3, dark(c.dark, 0.6), 0.001);
    // the dark barrel housing along the top, and its muzzle with a coloured tip
    slab([[0.07, 0.16], [0.3, 0.16], [0.3, 0.198], [0.1, 0.198]], 0.03, steel);
    turned([[0, 0.29], [0.015, 0.29], [0.015, 0.37], [0.012, 0.372]], 0.18, steel);
    turned([[0.012, 0.372], [0.016, 0.372], [0.016, 0.386], [0.01, 0.386], [0.009, 0.36], [0, 0.36]], 0.18, paint(c.accent));
    muzzle.set(0, 0.18, 0.386);
  } else if (o.design === 'slimPistol') {
    gripSlab(); guard(0.07);
    slab([[-0.075, 0.03], [0.24, 0.03], [0.25, 0.044], [0.25, 0.076], [-0.06, 0.08], [-0.075, 0.066]], 0.028, body);
    slab([[0.075, 0.034], [0.23, 0.034], [0.218, 0.012], [0.085, 0.012]], 0.02, paint(c.accent));
    turned([[0, 0.24], [0.009, 0.24], [0.009, 0.315], [0.006, 0.315], [0.005, 0.29], [0, 0.29]], 0.064, steel, 10);
    turned([[0, 0.24], [0.006, 0.24], [0.006, 0.285], [0, 0.285]], 0.043, steel, 8);
    sides(0.014, 0.058, 0.02, 0.006, 0.13, paint(c.accent));
    sides(0.014, 0.066, 0.2, 0.008, 0.03, glow(c.glow));
    muzzle.set(0, 0.064, 0.315);
  } else if (o.design === 'cannon') {
    gripSlab(); guard();
    slab([[-0.04, 0.03], [0.13, 0.03], [0.13, 0.052], [-0.04, 0.052]], 0.04, second);
    // the drum barrel: a rear cap, the drum, a waist, and a flared muzzle with a dark bore
    turned([[0, -0.075], [0.034, -0.075], [0.046, -0.06], [0.046, 0.2], [0.04, 0.208], [0.04, 0.25], [0.056, 0.266], [0.056, 0.332], [0.046, 0.332]], 0.09, body, 16);
    turned([[0.046, 0.332], [0.042, 0.28], [0, 0.28]], 0.09, dark(0x08090b, 0.8), 16);
    sides(0.0455, 0.09, 0.07, 0.02, 0.15, paint(c.accent));
    sides(0.0455, 0.09, 0.07, 0.006, 0.12, glow(c.glow), 0.0025);
    slab([[-0.03, 0.134], [0.1, 0.134], [0.09, 0.146], [-0.02, 0.146]], 0.016, steel, 0, 0.002);
    muzzle.set(0, 0.09, 0.332);
  } else if (o.design === 'hoseGun') {
    gripSlab(-0.058); guard();
    slab([[-0.06, 0.03], [0.19, 0.03], [0.19, 0.1], [-0.04, 0.1], [-0.06, 0.08]], 0.04, body);
    slab([[-0.02, 0.1], [0.12, 0.1], [0.11, 0.112], [-0.01, 0.112]], 0.018, second, 0, 0.002);
    turned([[0, 0.185], [0.017, 0.185], [0.017, 0.25], [0.012, 0.25], [0.011, 0.215], [0, 0.215]], 0.068, steel);
    sides(0.02, 0.066, 0.06, 0.012, 0.14, paint(c.accent));
    // the hose: from a collar under the grip, hanging in a loop behind her hand
    b.add(revolve([[0.012, 0], [0.012, 0.016], [0.009, 0.016]], { seg: 10 }), paint(c.accent), place(-0.007, -0.072, 0));
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.058, -0.007), new THREE.Vector3(0, -0.1, -0.008), new THREE.Vector3(0, -0.2, -0.05), new THREE.Vector3(0, -0.25, -0.15), new THREE.Vector3(0, -0.2, -0.24), new THREE.Vector3(0, -0.12, -0.27)]);
    b.add(tube(path, 0.008, 18, 7), dark(c.dark, 0.75));
    hoseEnd = new THREE.Vector3(0, -0.12, -0.27);
    muzzle.set(0, 0.068, 0.25);
  } else {
    gripSlab(); guard(0.07);
    slab([[-0.095, 0.03], [0.17, 0.03], [0.17, 0.046], [0.2, 0.06], [0.2, 0.1], [-0.095, 0.1]], 0.04, body);
    slab([[0.082, 0.034], [0.124, 0.034], [0.114, -0.07], [0.08, -0.07]], 0.024, second); // the magazine
    slab([[-0.02, 0.1], [0.11, 0.1], [0.1, 0.113], [-0.01, 0.113]], 0.016, steel, 0, 0.002); // the sight rail
    turned([[0, 0.195], [0.019, 0.195], [0.019, 0.315], [0.015, 0.32], [0.011, 0.32]], 0.078, steel);
    turned([[0.011, 0.32], [0.011, 0.345], [0.008, 0.345], [0.007, 0.31], [0, 0.31]], 0.078, dark(0x0c0d10, 0.6), 10);
    sides(0.02, 0.084, 0.05, 0.008, 0.17, glow(c.glow));
    sides(0.02, 0.05, 0.12, 0.012, 0.05, paint(c.accent));
    muzzle.set(0, 0.078, 0.345);
  }

  const mesh = finishPiece(b, `gun${hand}`, kit, 'L', k);
  muzzle.multiplyScalar(k);
  const mark = (name: string, at: THREE.Vector3) => { const o3 = new THREE.Object3D(); o3.name = name; o3.position.copy(at); mesh.add(o3); };
  mark('muzzle', muzzle); mark('grip', new THREE.Vector3());
  mesh.userData.muzzle = muzzle.clone();
  mesh.userData.grip = new THREE.Vector3();
  if (hoseEnd) { hoseEnd.multiplyScalar(k); mark('hoseEnd', hoseEnd); mesh.userData.hoseEnd = hoseEnd.clone(); }
  return mesh;
}
