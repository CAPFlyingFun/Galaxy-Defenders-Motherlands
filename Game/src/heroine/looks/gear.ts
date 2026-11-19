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

export interface LookGear {
  /** The belt, straps, holsters and pouches (any left out keep beltGear.ts's own). */
  readonly belt?: Partial<Record<keyof typeof BELT_COLOURS, number>>;
  /** The fitted pieces, if any. */
  readonly pieces?: SuitGearStyle;
}

export const LOOK_GEAR: Readonly<Record<string, LookGear>> = {
  /**
   * THE GRAY AND RED SUIT (graySuit.ts; Joshua's outfit design 2): a gray belt with silver edges and a glowing pale
   * blue accent where it was pink, holsters and pouches in dark gray; tall flat combat boots, wrist cuffs and shoulder
   * plates in the suit's light gray, darker gray and red, with glowing pale blue strips.
   */
  graySuit: {
    belt: { belt: 0x5a5e68, edge: 0xa9aeb8, buckle: 0xd0d4dc, accent: 0x9fe6ff, strap: 0x5a5e68, holster: 0x2a2d34, plate: 0x3c4049 },
    pieces: {
      plate: '#c9ccd3', trim: '#7d818b', accent: '#8e1f36', sole: '#25272d', glow: '#a8ecff',
      boots: true, cuffs: true, shoulders: true,
    },
  },
};
