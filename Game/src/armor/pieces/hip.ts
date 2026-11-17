// ============================================================================
// hip.ts -- what she wears at her hip: discs, pods, belt boxes and pouches.
//
// FRAME (slots "hipL" / "hipR", riding the PELVIS bone, so these do not swing
// with her legs):
//   origin = the hip joint of that side (where the thigh bone starts)
//   +Y up, +Z to her front, +X out to that side.
//   The right-side piece is the left one mirrored.
//
// SIZE. Each piece's back follows the measured side of her hip (which reaches
// about 9.5 cm out from the hip joint), taken at the BIGGEST belly, 200 %, so
// nothing here is ever pushed into by her belly. Pieces sit between 2 cm under
// the joint and 11 cm above it, and no further forward than 7 cm, which keeps
// them off her thigh and out of her belly's way.
//
// STYLES
//   'disc'    a flat round pouch with a ringed face (Vela; `strap` hangs a tab under it)
//   'reel'    a bigger dark drum with a hub: Tessa's hose reel (its "hose" point is marked)
//   'pod'     a domed pod with a pale disc set in it (Aurora)
//   'beltBox' a boxy belt unit with light stripes (Nova)
//   'pouches' two small belt pouches (Coral)
// ============================================================================
import * as THREE from 'three';
import { PieceBuilder, box, dark, faceted, glow, paint, place, revolve, type Finish } from '../geo';
import { sidePlate, sideReach, type SidePlateSpec } from '../fitShapes';
import { defaultKit, finishPiece, type ArmorKit, type PieceColors, type Side } from '../kit';

export type HipStyle = 'disc' | 'reel' | 'pod' | 'beltBox' | 'pouches';
export interface HipOptions {
  readonly style: HipStyle;
  /** 'disc' only: a short tab hanging under it. */
  readonly strap?: boolean;
}

/** Colours: main = the piece, second = its face detail, accent = caps, dark = backing, glow = lights. */
export function buildHipPiece(o: HipOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), fit = kit.fit, backing = dark(c.dark);
  /** A turned shape laid on its side so it faces outward, at (x, y, z). */
  const turned = (profile: Array<[number, number]>, x: number, y: number, z: number, finish: Finish) => b.add(revolve(profile, { seg: 20 }), finish, place(x, y, z, 0, 0, -Math.PI / 2));
  let hose: THREE.Vector3 | null = null;

  if (o.style === 'disc' || o.style === 'reel') {
    const reel = o.style === 'reel', R = reel ? 0.07 : 0.058, y = 0.045, z = -0.012;
    const spec: SidePlateSpec = { fit, y, z, radius: R, nu: 20, nv: 2, stand: reel ? 0.022 : 0.012 };
    const face = sideReach(spec) + spec.stand;
    b.addShell(sidePlate(spec), reel ? dark(c.dark, 0.45) : paint(c.main), backing);
    turned([[R - 0.004, 0], [R - 0.01, 0.007], [R * 0.62, 0.007], [R * 0.62, 0.002]], face, y, z, reel ? dark(c.dark, 0.35) : paint(c.second));
    turned([[R * 0.62, 0.002], [R * 0.5, 0.01], [R * 0.2, 0.013], [0, 0.013]], face, y, z, paint(reel ? c.main : c.accent));
    if (o.strap) b.add(box(0.005, 0.11, 0.024, 0.0015), dark(c.dark, 0.55), place(face - 0.006, y - R - 0.045, z));
    if (reel) {
      // the port the hose leaves by, on the drum's lower front edge
      b.add(revolve([[0.012, 0], [0.012, 0.02], [0.008, 0.024], [0, 0.024]], { seg: 10 }), paint(c.accent), place(face - 0.012, y - R * 0.8, z + R * 0.55, Math.PI * 0.75, 0, 0));
      hose = new THREE.Vector3(face - 0.012, y - R * 0.8 - 0.017, z + R * 0.55 + 0.017);
    }
  } else if (o.style === 'pod') {
    const R = 0.064, y = 0.04, z = -0.012;
    const spec: SidePlateSpec = { fit, y, z, radius: R, nu: 20, nv: 5, stand: 0.01, dome: 0.03 };
    b.addShell(sidePlate(spec), paint(c.main), backing);
    const face = sideReach(spec) + spec.stand + spec.dome!;
    turned([[0.04, -0.012], [0.04, 0.001], [0.034, 0.005], [0, 0.006]], face - 0.004, y, z, paint(c.second, 0.25));
  } else if (o.style === 'beltBox') {
    const y = 0.058, z = -0.005, H = 0.062, D = 0.13;
    const spec: SidePlateSpec = { fit, y, z, height: H, depth: D, nu: 4, nv: 2, stand: 0.016 };
    const s = sidePlate(spec), face = sideReach(spec) + spec.stand;
    b.add(faceted(s.outer), paint(c.main, 0.5)).add(s.inner, backing).add(s.rim, paint(c.main, 0.5));
    for (const dy of [0.014, -0.004]) b.add(box(0.004, 0.007, D * 0.72, 0.001), glow(c.glow), place(face, y + dy, z));
    b.add(box(0.006, 0.014, D * 0.3, 0.002), paint(c.accent), place(face, y - 0.022, z - D * 0.2));
  } else {
    for (const [z, H] of [[0.035, 0.058], [-0.04, 0.066]] as const) {
      const y = 0.052;
      const spec: SidePlateSpec = { fit, y, z, height: H, depth: 0.056, nu: 2, nv: 2, stand: 0.024 };
      const s = sidePlate(spec), face = sideReach(spec) + spec.stand;
      b.add(faceted(s.outer), paint(c.main, 0.5)).add(s.inner, backing).add(s.rim, paint(c.main, 0.5));
      b.add(box(0.005, H * 0.42, 0.06, 0.0015), paint(c.second), place(face, y + H * 0.3, z)); // the flap
      b.add(box(0.006, 0.01, 0.014, 0.001), paint(c.accent), place(face + 0.002, y + H * 0.08, z)); // its catch
    }
  }
  const mesh = finishPiece(b, `hip${side}`, kit, side);
  if (hose) mesh.userData.hose = hose.multiply(new THREE.Vector3(side === 'R' ? -1 : 1, 1, 1));
  return mesh;
}
