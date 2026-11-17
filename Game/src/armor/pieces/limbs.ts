// ============================================================================
// limbs.ts -- forearm guards, knee guards, shin armor and the thigh holster.
//
// Every piece here hugs a limb: its INSIDE is her measured forearm, shin or
// thigh plus a 4 mm gap, so it fits whatever its style (see fitShapes.ts).
//
// FRAMES (the right-side piece is the left one mirrored: its outer side is -X)
//   forearm guard  slots "forearmL/R", on the FOREARM bone.
//       origin = the elbow joint; the forearm runs down -Y (her wrist is at
//       y = -0.26); +Z her front, +X the arm's outer side (arm hanging).
//       A guard covers y = -0.05 .. -0.205; her forearm there is 5-7 cm thick.
//   knee guard     slots "kneeL/R", on the SHIN bone (so it stays on the shin
//       as the knee bends and the thigh swings away behind it).
//       origin = the knee joint; +Y up toward the hip, +Z front, +X outer side.
//       It covers the front of the knee from 7 cm above the joint to 8 cm below.
//   shin armor     slots "shinL/R", on the SHIN bone, same frame as the knee.
//       The shin runs down -Y (her ankle is at y = -0.41). The armor covers
//       y = -0.085 .. -0.335; the boot's collar takes over below that.
//   thigh holster  slots "thighL/R", on the THIGH bone.
//       origin = the hip joint; the thigh runs down -Y (her knee is at
//       y = -0.37); +Z front, +X outer side. The holster hangs at
//       y = -0.13 .. -0.30 on the outer side.
// ============================================================================
import * as THREE from 'three';
import { limbRadius } from '../bodyFit';
import { PieceBuilder, dark, faceted, glow, lerp, paint, place, revolve, smooth, type Finish, type ShellParts } from '../geo';
import { deg, limbPlate } from '../fitShapes';
import { SKIN_GAP, defaultKit, finishPiece, type ArmorKit, type PieceColors, type Side } from '../kit';

/** Add a shell whose outside is faceted (flat panels, crisp edges). */
function addFaceted(b: PieceBuilder, s: ShellParts, face: Finish, lining: Finish): void {
  b.add(faceted(s.outer), face).add(s.inner, lining).add(s.rim, lining);
}

// ----------------------------------------------------------------------------
// Forearm guards
// ----------------------------------------------------------------------------

/**
 * 'gauntlet'  a full sleeve with a raised outer plate and a flared cuff (Blaze, Nova)
 * 'sleek'     a half shell on the outer side held by two straps (Coral, Tessa, Aurora)
 * 'cuff'      just a wrist cuff with a light stud (Vela)
 */
export type ForearmStyle = 'gauntlet' | 'sleek' | 'cuff';
export interface ForearmOptions {
  readonly style: ForearmStyle;
  /** A light strip near the wrist ('sleek' only). */
  readonly glowTip?: boolean;
}

/** Colours: main = the guard, second = its raised plate, accent = the cuff, dark = straps and lining, glow = lights. */
export function buildForearmGuard(o: ForearmOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), profile = kit.fit.forearm, lining = dark(c.dark);
  if (o.style === 'gauntlet') {
    const sleeve = (_u: number, v: number) => 0.007 + 0.007 * smooth(0.78, 1, v); // thicker at the wrist: the flared cuff
    b.addShell(limbPlate({ profile, y0: -0.05, y1: -0.205, nu: 16, nv: 7, thick: sleeve }), paint(c.main), lining);
    // the raised plate along the outer side, narrowing toward the wrist
    b.addShell(limbPlate({ profile, y0: -0.062, y1: -0.172, span: (v) => [deg(90) - deg(lerp(62, 40, v)), deg(90) + deg(lerp(62, 40, v))], nu: 8, nv: 5, base: SKIN_GAP + 0.006, thick: (u) => 0.007 + 0.004 * (1 - Math.abs(2 * u - 1)) }), paint(c.second), paint(c.second));
    // the cuff's coloured band
    b.addShell(limbPlate({ profile, y0: -0.183, y1: -0.2, nu: 16, nv: 1, base: SKIN_GAP + 0.012, thick: () => 0.004 }), paint(c.accent), paint(c.accent));
  } else if (o.style === 'sleek') {
    b.addShell(limbPlate({ profile, y0: -0.055, y1: -0.2, a0: deg(-22), a1: deg(202), nu: 12, nv: 6, thick: (u, v) => 0.006 + 0.004 * Math.sin(Math.PI * u) * (1 - 0.5 * v) }), paint(c.main), lining);
    for (const y of [-0.078, -0.168]) b.addShell(limbPlate({ profile, y0: y, y1: y - 0.02, nu: 14, nv: 1, thick: () => 0.003 }), dark(c.dark), lining);
    // a panel line of the second colour down the outer side
    b.addShell(limbPlate({ profile, y0: -0.07, y1: -0.16, a0: deg(72), a1: deg(108), nu: 3, nv: 4, base: SKIN_GAP + 0.009, thick: () => 0.003 }), paint(c.second), paint(c.second));
    if (o.glowTip) b.addShell(limbPlate({ profile, y0: -0.172, y1: -0.19, a0: deg(40), a1: deg(140), nu: 6, nv: 1, base: SKIN_GAP + 0.007, thick: () => 0.004 }), glow(c.glow), glow(c.glow));
  } else {
    b.addShell(limbPlate({ profile, y0: -0.16, y1: -0.208, nu: 16, nv: 3, thick: (_u, v) => 0.008 + 0.003 * Math.sin(Math.PI * v) }), paint(c.main), lining);
    b.addShell(limbPlate({ profile, y0: -0.172, y1: -0.196, a0: deg(72), a1: deg(108), nu: 3, nv: 2, base: SKIN_GAP + 0.01, thick: () => 0.004 }), glow(c.glow, 0.8), paint(c.accent));
  }
  return finishPiece(b, `forearm${side}`, kit, side);
}

// ----------------------------------------------------------------------------
// Knee guards
// ----------------------------------------------------------------------------

/**
 * 'block'   a boxy cap with flat front and sides (Vela, Nova, Tessa, Aurora)
 * 'shield'  a pointed, faceted plate with a ridge down its middle (Blaze, Coral)
 * 'round'   a smooth dome
 */
export type KneeStyle = 'block' | 'shield' | 'round';
export interface KneeOptions {
  readonly style: KneeStyle;
  /** Lights on the front: one wide panel, or two bars. */
  readonly light?: 'none' | 'panel' | 'bars';
}

/** Colours: main = the cap, second = its top band, dark = lining, glow = lights. */
export function buildKneeGuard(o: KneeOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), profile = kit.fit.shin, lining = dark(c.dark);
  const half = deg(62), yTop = 0.068, yBot = -0.078;
  if (o.style === 'block') {
    // Find the box that just holds the front of her knee: how far forward (zF) and to each side (xOut, xIn) her skin reaches under the cap.
    let zF = 0, xOut = 0, xIn = 0;
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 8; j++) {
      const a = lerp(-half, half, i / 12), r = limbRadius(profile, lerp(yTop, yBot, j / 8), a) + SKIN_GAP;
      zF = Math.max(zF, r * Math.cos(a)); xOut = Math.max(xOut, r * Math.sin(a)); xIn = Math.max(xIn, -r * Math.sin(a));
    }
    zF += 0.016; xOut += 0.007; xIn += 0.007;
    // ...and the distance to that box's wall in direction a
    const boxR = (a: number, grow = 0) => Math.min((zF + grow) / Math.max(0.05, Math.cos(a)), (a > 0 ? xOut : xIn) / Math.max(0.05, Math.abs(Math.sin(a))));
    // the top and bottom ends slope in, so the block has bevelled ends
    const ends = (v: number) => smooth(0, 0.16, v) * smooth(1, 0.84, v);
    addFaceted(b, limbPlate({ profile, y0: yTop, y1: yBot, a0: -half, a1: half, nu: 8, nv: 6, thick: () => 0.004, outer: (a, _y, inner, _u, v) => inner + 0.004 + (boxR(a) - inner - 0.004) * ends(v) }), paint(c.main), lining);
    // a band of the second colour across the top
    addFaceted(b, limbPlate({ profile, y0: yTop - 0.022, y1: yTop - 0.05, a0: -half * 0.86, a1: half * 0.86, nu: 6, nv: 1, thick: () => 0.004, outer: (a) => boxR(a, 0.004) }), paint(c.second), paint(c.second));
    const light = (a0: number, a1: number, y0: number, y1: number) =>
      b.addShell(limbPlate({ profile, y0, y1, a0, a1, nu: 2, nv: 1, thick: () => 0.004, outer: (a) => (zF + 0.0035) / Math.cos(a) }), glow(c.glow), dark(c.dark));
    if (o.light === 'panel') light(deg(-30), deg(30), -0.012, -0.052);
    if (o.light === 'bars') { light(deg(-30), deg(30), -0.006, -0.022); light(deg(-30), deg(30), -0.034, -0.05); }
  } else if (o.style === 'shield') {
    const reach = (v: number) => half * lerp(0.2, 1, Math.sin(Math.PI * (0.1 + 0.85 * v)) ** 0.8);
    addFaceted(b, limbPlate({ profile, y0: yTop + 0.006, y1: yBot - 0.004, span: (v) => [-reach(v), reach(v)], nu: 6, nv: 6, thick: (u) => 0.006 + 0.014 * (1 - Math.abs(2 * u - 1)) }), paint(c.main), lining);
    addFaceted(b, limbPlate({ profile, y0: yTop - 0.02, y1: -0.02, span: (v) => [-reach(v) * 0.45, reach(v) * 0.45], nu: 2, nv: 3, base: SKIN_GAP + 0.012, thick: (u) => 0.006 + 0.007 * (1 - Math.abs(2 * u - 1)) }), paint(c.second), paint(c.second));
  } else {
    b.addShell(limbPlate({ profile, y0: yTop, y1: yBot, a0: -half, a1: half, nu: 10, nv: 7, thick: (u, v) => 0.005 + 0.017 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) }), paint(c.main), lining);
  }
  return finishPiece(b, `knee${side}`, kit, side);
}

// ----------------------------------------------------------------------------
// Shin armor
// ----------------------------------------------------------------------------

/** 'smooth' = a rounded greave; 'faceted' = the same in flat panels. */
export type ShinStyle = 'smooth' | 'faceted';
export interface ShinOptions {
  readonly style: ShinStyle;
  /** A raised plate down the front, in the second colour. */
  readonly frontPlate?: boolean;
  /** A short light strip on the outer side. */
  readonly light?: boolean;
  /** A round boss on the outer side, just under the knee. */
  readonly disc?: boolean;
}

/** Colours: main = the greave, second = its front plate, accent = the disc, dark = lining, glow = the light. */
export function buildShinArmor(o: ShinOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), profile = kit.fit.shin, lining = dark(c.dark), flat = o.style === 'faceted';
  const add = (s: ShellParts, face: Finish, inside: Finish) => (flat ? addFaceted(b, s, face, inside) : void b.addShell(s, face, inside));
  const y0 = -0.085, y1 = -0.335;
  // the greave: a touch thicker at its top and bottom edges
  const wall = (_u: number, v: number) => 0.007 + 0.004 * (smooth(0.12, 0, v) + smooth(0.9, 1, v));
  add(limbPlate({ profile, y0, y1, nu: flat ? 10 : 16, nv: flat ? 6 : 8, thick: wall }), paint(c.main), lining);
  if (o.frontPlate !== false) {
    add(limbPlate({ profile, y0: y0 - 0.012, y1: y1 + 0.03, span: (v) => [-deg(lerp(60, 30, v)), deg(lerp(60, 30, v))], nu: flat ? 4 : 8, nv: flat ? 4 : 6, base: SKIN_GAP + 0.006, thick: (u) => 0.006 + 0.006 * (1 - Math.abs(2 * u - 1)) }), paint(c.second), paint(c.second));
  }
  if (o.light) b.addShell(limbPlate({ profile, y0: -0.2, y1: -0.212, a0: deg(55), a1: deg(125), nu: 5, nv: 1, base: SKIN_GAP + 0.01, thick: () => 0.003 }), glow(c.glow), dark(c.dark));
  if (o.disc) {
    const y = -0.125, r = limbRadius(profile, y, deg(100)) + SKIN_GAP + 0.006;
    const at = place(r * Math.sin(deg(100)), y, r * Math.cos(deg(100)), 0, deg(10), -Math.PI / 2);
    b.add(revolve([[0.034, 0], [0.034, 0.008], [0.027, 0.014], [0.02, 0.014]], { seg: 16 }), dark(c.dark, 0.4), at);
    b.add(revolve([[0.02, 0.014], [0.018, 0.018], [0, 0.019]], { seg: 16 }), paint(c.accent), at.clone());
  }
  return finishPiece(b, `shin${side}`, kit, side);
}

// ----------------------------------------------------------------------------
// Thigh holster
// ----------------------------------------------------------------------------

export interface HolsterOptions {
  /** A stripe of light down its face. */
  readonly light?: boolean;
}

/** A boxy holster on the outer thigh, held by a strap. Colours: main = the box (usually dark), accent = its cap, dark = strap. */
export function buildThighHolster(o: HolsterOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), profile = kit.fit.thigh, lining = dark(c.dark);
  const y0 = -0.13, y1 = -0.3, a0 = deg(62), a1 = deg(118);
  let xOut = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const a = lerp(a0, a1, i / 8); xOut = Math.max(xOut, (limbRadius(profile, lerp(y0, y1, j / 8), a) + SKIN_GAP) * Math.sin(a)); }
  const face = xOut + 0.032;
  const ends = (v: number) => smooth(0, 0.1, v) * smooth(1, 0.9, v);
  addFaceted(b, limbPlate({ profile, y0, y1, a0, a1, nu: 4, nv: 6, thick: () => 0.004, outer: (a, _y, inner, _u, v) => inner + 0.004 + (face / Math.sin(a) - inner - 0.004) * ends(v) }), paint(c.main, 0.5), lining);
  addFaceted(b, limbPlate({ profile, y0: y0 - 0.012, y1: y0 - 0.04, a0: a0 + deg(4), a1: a1 - deg(4), nu: 3, nv: 1, thick: () => 0.004, outer: (a) => (face + 0.004) / Math.sin(a) }), paint(c.accent), paint(c.accent));
  if (o.light) b.addShell(limbPlate({ profile, y0: y0 - 0.06, y1: y1 + 0.03, a0: deg(84), a1: deg(96), nu: 1, nv: 2, thick: () => 0.004, outer: (a) => (face + 0.003) / Math.sin(a) }), glow(c.glow), dark(c.dark));
  // the strap round the thigh
  b.addShell(limbPlate({ profile, y0: -0.15, y1: -0.172, nu: 18, nv: 1, thick: () => 0.004 }), dark(c.dark), lining);
  return finishPiece(b, `thigh${side}`, kit, side);
}
