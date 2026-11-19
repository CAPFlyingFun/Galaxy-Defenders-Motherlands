// ============================================================================
// looks/gear.ts -- each look's 3D GEAR: the colours of her belt, straps,
// holsters and pouches (beltGear.ts), and which fitted pieces she wears and in
// what colours (suitGear.ts: boots, wrist cuffs, shoulder plates).
//
// Kept apart from the looks themselves (looks/*.ts), which bring in the
// Character Builder's code: the fast heroine reads only this small file.
// A look not named here wears the belt in its own colours and no pieces.
// ============================================================================
import type { SuitGearStyle } from '../fast/suitGear';
import type { BELT_COLOURS } from '../fast/beltGear';
import type { GunColours } from '../guns';

export interface LookGear {
  /** The belt, straps, holsters and pouches (any left out keep beltGear.ts's own). */
  readonly belt?: Partial<Record<keyof typeof BELT_COLOURS, number>>;
  /** The belt's own line (beltGear.ts `line`): slung on her hips, never following a waistband. */
  readonly beltLine?: readonly [number, number, number];
  /**
   * How glossy her painted suit is, as a roughness (0 mirror, 1 matt): the builder's knits bake at 0.72 and up, her skin
   * well under 0.6, so the game swaps every cloth value for this one and leaves her skin as it is (`outfitMaterial.ts`).
   * Unset: the fabric's own. (Joshua, 2026-11-19, of the catsuit: "add a glossy almost leather shine to it".)
   */
  readonly clothShine?: number;
  /** Her guns' colours (and every clip's: in her pouches and on the table). Left out: dark metal and magenta. */
  readonly gun?: GunColours;
  /** The fitted pieces, if any. */
  readonly pieces?: SuitGearStyle;
}

export const LOOK_GEAR: Readonly<Record<string, LookGear>> = {
  /**
   * THE SHADOW OPERATIVE CATSUIT (shadowSuit.ts; look 1 of Joshua's board): a leather-brown belt SLUNG on her
   * hips -- at her sides a little over her hip joints, behind higher, at her front sagging down toward her pelvis --
   * with a steel buckle and red accents, black holsters and pouches; tall flat black combat boots with a red band and
   * dark wrist cuffs; no shoulder plates (look 1 has none) and no glowing strips.
   */
  shadowSuit: {
    // (a leather brown light enough to read on the near-black suit, as look 1's belt does)
    belt: { belt: 0x6e5443, edge: 0x947866, buckle: 0xb4b8c0, accent: 0xff0000, strap: 0x5a4436, holster: 0x121214, plate: 0x1c1c20 },
    beltLine: [-0.06, 0.035, 0.1],
    clothShine: 0.42,
    // (blackened metal and the suit's red, as the guns in Look 1's picture)
    gun: { metal: 0x141518, glow: 0xff0000 },
    pieces: {
      plate: '#1b1c20', trim: '#2c2d33', accent: '#ff0000', sole: '#0e0e10', glow: '',
      boots: true, cuffs: true, shoulders: false,
    },
  },  // (Joshua's plain catsuit: the catsuit's belt and guns, no boots or cuffs, and its fabric's own sheen)
  blazeCatsuit: {
    // (a leather brown light enough to read on the near-black suit, as look 1's belt does)
    belt: { belt: 0x6e5443, edge: 0x947866, buckle: 0xb4b8c0, accent: 0xff0000, strap: 0x5a4436, holster: 0x121214, plate: 0x1c1c20 },
    beltLine: [-0.06, 0.035, 0.1],
    // (blackened metal and the suit's red, as the guns in Look 1's picture)
    gun: { metal: 0x141518, glow: 0xff0000 },
  },
  /**
   * THE GRAY AND RED SUIT (graySuit.ts; Joshua's outfit design 2): a gray belt with silver edges and a glowing pale
   * blue accent where it was pink, holsters and pouches in dark gray; tall flat combat boots, wrist cuffs and shoulder
   * plates in the suit's light gray, darker gray and red, with glowing pale blue strips.
   */
  graySuit: {
    // (gunmetal gray and the suit's red)
    gun: { metal: 0x3c4049, glow: 0xc4142e },
    belt: { belt: 0x5a5e68, edge: 0xa9aeb8, buckle: 0xd0d4dc, accent: 0x9fe6ff, strap: 0x5a5e68, holster: 0x2a2d34, plate: 0x3c4049 },
    pieces: {
      plate: '#c9ccd3', trim: '#7d818b', accent: '#8e1f36', sole: '#25272d', glow: '#a8ecff',
      boots: true, cuffs: true, shoulders: true,
    },
  },
};
