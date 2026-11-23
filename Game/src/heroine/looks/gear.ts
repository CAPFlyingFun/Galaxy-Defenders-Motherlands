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
import { BRONZE_PEBBLE, GOLD_GLITTER, NAVY_SPARKLE, WHITE_TECH, PERFORATED_MESH, type ClothShine } from '../fast/outfitMaterial';

export interface LookGear {
  /** The belt, straps, holsters and pouches (any left out keep beltGear.ts's own). */
  readonly belt?: Partial<Record<keyof typeof BELT_COLOURS, number>>;
  /** The belt's own line (beltGear.ts `line`): slung on her hips, never following a waistband. */
  readonly beltLine?: readonly [number, number, number];
  /**
   * How glossy her painted suit is, as roughnesses (0 mirror, 1 matt): `cloth` for its knits (the builder's bake them at
   * 0.72 and up), `trim` for its smooth Flat cloth (0.92); her skin is well under 0.6 and keeps its own
   * (`outfitMaterial.ts`). Unset: the fabrics' own. (Joshua, 2026-11-19, of the catsuit: "add a glossy almost leather
   * shine to it"; then, the shine picking out her nipples: half the shine on the knit, the glossy black on the trim.)
   */
  readonly clothShine?: ClothShine;
  /** Her guns' colours (and every clip's: in her pouches and on the table). Left out: dark metal and magenta. */
  readonly gun?: GunColours;
  /** The fitted pieces, if any. */
  readonly pieces?: SuitGearStyle;
  /** Which thighs carry a holster (left out: both), and whether she has clip pouches (left out: yes). beltGear.ts. */
  readonly holsters?: readonly ('left' | 'right')[];
  readonly pouches?: boolean;
}

/** The same gear for a catsuit's three styles: its keyhole (the name as it is), `Low` and `High` (catsuitStyles.ts). */
const inThreeStyles = (gear: Record<string, LookGear>): Record<string, LookGear> =>
  Object.fromEntries(Object.entries(gear).flatMap(([name, g]) => ['', 'Low', 'High'].map((style) => [name + style, g])));

/** TWO TONES: where the top colour ends, metres up her from her feet as baked (the bottom of her bust; GAME TUNING). */
const TWO_TONE_LINE = 1.19;

/**
 * A CATSUIT STYLE's gear (catsuitStyles.ts; Joshua, 2026-11-20: more colours of the same catsuit): flat knee-high boots
 * in the suit's lower colour (`boot`) with a darker trim, a belt in `belt`, guns in `gun` with an `accent` glow; its
 * cloth very glossy, with `metal` sheen for the metallic ones.
 */
function catsuitGear(o: { boot: string; trim: string; accent: string; sole: string; belt: number; edge: number; buckle: number; gun: number; metal?: number; cloth?: number; twoTone?: { on: string; top: string } }): LookGear {
  const accent = parseInt(o.accent.slice(1), 16);
  return {
    belt: { belt: o.belt, edge: o.edge, buckle: o.buckle, accent, strap: o.belt, holster: o.gun, plate: o.edge },
    beltLine: [-0.06, 0.035, 0.1],
    clothShine: {
      cloth: o.cloth ?? 0.28, trim: 0.16, ...(o.metal !== undefined ? { metal: o.metal } : {}),
      // (two tones: the top colour above the bottom of her bust, `TWO_TONE_LINE` metres up her, and down her arms)
      ...(o.twoTone ? { twoTone: { ...o.twoTone, line: TWO_TONE_LINE } } : {}),
    },
    gun: { metal: o.gun, glow: accent },
    pieces: { plate: o.boot, trim: o.trim, accent: o.accent, sole: o.sole, glow: '', boots: true, cuffs: false, shoulders: false, bootTop: 0.03 },
  };
}

/**
 * MARY'S SUITS' GEAR (marySuits.ts; Joshua's board, M1-M3): a near-black belt with the suit's `accent` on its buckle and
 * fittings, slung on her hips, with holsters and pouches; dark guns glowing the accent; low flat combat boots, dark gray,
 * the accent round their tops and down their fronts (the board's ankle boots); the suit glossy, as on the board.
 */
function marySuitGear(accent: string): LookGear {
  const a = parseInt(accent.slice(1), 16);
  return {
    belt: { belt: 0x1b1c20, edge: 0x34373d, buckle: 0xb8bcc4, accent: a, strap: 0x1b1c20, holster: 0x131417, plate: 0x26282d },
    beltLine: [-0.06, 0.035, 0.1],
    // (glossy as the board's suits, a satin rather than a latex: 0.34 read as latex)
    clothShine: { cloth: 0.46, trim: 0.3 },
    gun: { metal: 0x16171a, glow: a },
    // (low boots: their tops 70% of the way down her shin)
    pieces: { plate: '#202226', trim: '#141518', accent, sole: '#0b0b0d', glow: '', boots: true, cuffs: false, shoulders: false, bootTop: 0.7 },
  };
}

export const LOOK_GEAR: Readonly<Record<string, LookGear>> = {
  /** MARY'S CATSUITS (marySuits.ts): M1 teal, M2 orange, M3 red. */
  maryResearchSuit: marySuitGear('#18c6c8'),
  maryExplorerSuit: marySuitGear('#f2961c'),
  maryStealthSuit: marySuitGear('#e0141c'),
  // THE CATSUIT COLOURS, each in its three styles (catsuitStyles.ts): the same gear for every style
  ...inThreeStyles({
    /** THE GOLD CATSUIT: gold boots, a black belt with gold fittings, black guns glowing gold; a metal sheen. */
    catsuitGold: catsuitGear({ boot: '#c8962e', trim: '#7a5414', accent: '#f0c24a', sole: '#1a1408', belt: 0x16140f, edge: 0x2a241a, buckle: 0xe0b040, gun: 0x18150e, metal: 0.35, cloth: 0.24 }),
    /** THE BLACK CATSUIT: black boots, a black belt with silver fittings, black guns glowing silver-blue. */
    catsuitBlack: catsuitGear({ boot: '#16171b', trim: '#2c2e34', accent: '#9fc3ff', sole: '#08080a', belt: 0x1a1a1e, edge: 0x34363c, buckle: 0xc0c4cc, gun: 0x121316, cloth: 0.22 }),
    /** THE SILVER CATSUIT: silver boots, a dark belt with silver fittings, dark guns glowing cyan; a metal sheen. */
    catsuitSilver: catsuitGear({ boot: '#a9aeb6', trim: '#5c6068', accent: '#7fe8ff', sole: '#141518', belt: 0x24262c, edge: 0x4a4e56, buckle: 0xd0d4dc, gun: 0x1c1e22, metal: 0.35, cloth: 0.24 }),
    /** BLACK AND GOLD (the gold catsuit's bakes): gold boots, the lower colour; a black belt with gold fittings. */
    catsuitBlackGold: catsuitGear({ boot: '#c8962e', trim: '#16171b', accent: '#f0c24a', sole: '#0c0b08', belt: 0x16140f, edge: 0x2a241a, buckle: 0xe0b040, gun: 0x18150e, metal: 0.25, cloth: 0.24, twoTone: { on: '#c8962e', top: '#141519' } }),
    /** GOLD AND BLACK (the black catsuit's bakes): black boots edged gold; a black belt with gold fittings. */
    catsuitGoldBlack: catsuitGear({ boot: '#16171b', trim: '#c8962e', accent: '#f0c24a', sole: '#08080a', belt: 0x16140f, edge: 0x2a241a, buckle: 0xe0b040, gun: 0x18150e, metal: 0.25, cloth: 0.24, twoTone: { on: '#141519', top: '#c8962e' } }),
    /** BLACK AND SILVER (the silver catsuit's bakes): silver boots, a dark belt with silver fittings. */
    catsuitBlackSilver: catsuitGear({ boot: '#a9aeb6', trim: '#16171b', accent: '#7fe8ff', sole: '#141518', belt: 0x1a1a1e, edge: 0x34363c, buckle: 0xd0d4dc, gun: 0x121316, metal: 0.25, cloth: 0.24, twoTone: { on: '#a9aeb6', top: '#141519' } }),
  }),
  /**
   * THE SHADOW OPERATIVE CATSUIT (shadowSuit.ts; look 1 of Joshua's board): a leather-brown belt SLUNG on her
   * hips -- at her sides a little over her hip joints, behind higher, at her front sagging down toward her pelvis --
   * with a steel buckle and red accents, black holsters and pouches; tall flat black combat boots with a red band and
   * dark wrist cuffs; no shoulder plates (look 1 has none) and no glowing strips.
   */
  /**
   * JOHN (john.ts; Joshua, 2026-11-21: "Black and Neon Green"): a black belt, straps and holsters with neon green
   * fittings, black guns glowing neon green (and his clips).
   */
  john: {
    belt: { belt: 0x141416, edge: 0x24262a, buckle: 0x39ff14, accent: 0x39ff14, strap: 0x141416, holster: 0x101012, plate: 0x24262a },
    gun: { metal: 0x121314, glow: 0x39ff14 },
  },
  shadowSuit: {
    // (a leather brown light enough to read on the near-black suit, as look 1's belt does)
    belt: { belt: 0x6e5443, edge: 0x947866, buckle: 0xb4b8c0, accent: 0xff0000, strap: 0x5a4436, holster: 0x121214, plate: 0x1c1c20 },
    beltLine: [-0.06, 0.035, 0.1],
    // (the knit: between the full gloss, 0.42, and half of it, 0.57 -- Joshua, 2026-11-19: "I prefer the more glossy
    //  look as it looks more like a sci-fi spacesuit... between the two... a good compromise"; the smooth trim: glossier)
    // (darken: the knit's Dark gray about half way to its Black -- Joshua: "darkening the image about 50%")
    // (knit: the game's knit over the suit -- the PERFORATED MESH of his picture; the athletic knit was at the stitch
    //  Joshua picked from the 1x-4x pictures, 2.2x)
    clothShine: { cloth: 0.49, trim: 0.22, darken: 0.48, knit: { ...PERFORATED_MESH, stitch: 1.5, strength: 1 } },
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
   * THE BRONZE CATSUIT (bronzeSuit.ts; one of Joshua's catsuit styles): its smooth bronze very glossy, as his picture's
   * near-liquid sheen; a dark leather belt with bronze fittings; flat knee-high bronze boots, no cuffs; bronzed guns.
   */
  bronzeSuit: {
    belt: { belt: 0x3a2416, edge: 0x6a4228, buckle: 0xc07a40, accent: 0xc07a40, strap: 0x2e1c10, holster: 0x2a1a0e, plate: 0x4a2812 },
    beltLine: [-0.06, 0.035, 0.1],
    // (Joshua's pebble picture's grain over the bronze: 12 cm a repeat, 0.3 mm deep)
    clothShine: { cloth: 0.3, trim: 0.16, prints: [{ ...BRONZE_PEBBLE, on: '#84461f', metres: 0.12, depth: 0.0003 }] },
    gun: { metal: 0x2a1a0e, glow: 0xc07a40 },
    pieces: {
      plate: '#8a5028', trim: '#4a2812', accent: '#c07a40', sole: '#1e120a', glow: '',
      boots: true, cuffs: false, shoulders: false,
      // (KNEE-HIGH and flat: Joshua, 2026-11-20, "knee high flat-footed boots")
      bootTop: 0.03,
    },
  },  // (version B: the same gear)
  bronzeSuitLow: {
    belt: { belt: 0x3a2416, edge: 0x6a4228, buckle: 0xc07a40, accent: 0xc07a40, strap: 0x2e1c10, holster: 0x2a1a0e, plate: 0x4a2812 },
    beltLine: [-0.06, 0.035, 0.1],
    // (Joshua's pebble picture's grain over the bronze: 12 cm a repeat, 0.3 mm deep)
    clothShine: { cloth: 0.3, trim: 0.16, prints: [{ ...BRONZE_PEBBLE, on: '#84461f', metres: 0.12, depth: 0.0003 }] },
    gun: { metal: 0x2a1a0e, glow: 0xc07a40 },
    pieces: {
      plate: '#8a5028', trim: '#4a2812', accent: '#c07a40', sole: '#1e120a', glow: '',
      boots: true, cuffs: false, shoulders: false,
      // (KNEE-HIGH and flat: Joshua, 2026-11-20, "knee high flat-footed boots")
      bootTop: 0.03,
    },
  },  // (his high neck: the same gear)
  bronzeSuitHigh: {
    belt: { belt: 0x3a2416, edge: 0x6a4228, buckle: 0xc07a40, accent: 0xc07a40, strap: 0x2e1c10, holster: 0x2a1a0e, plate: 0x4a2812 },
    beltLine: [-0.06, 0.035, 0.1],
    // (Joshua's pebble picture's grain over the bronze: 12 cm a repeat, 0.3 mm deep)
    clothShine: { cloth: 0.3, trim: 0.16, prints: [{ ...BRONZE_PEBBLE, on: '#84461f', metres: 0.12, depth: 0.0003 }] },
    gun: { metal: 0x2a1a0e, glow: 0xc07a40 },
    pieces: {
      plate: '#8a5028', trim: '#4a2812', accent: '#c07a40', sole: '#1e120a', glow: '',
      boots: true, cuffs: false, shoulders: false,
      // (KNEE-HIGH and flat: Joshua, 2026-11-20, "knee high flat-footed boots")
      bootTop: 0.03,
    },
  },
  /**
   * THE ANIME SPACE HEROINE (spaceHeroine.ts; look 2 of Joshua's board): a brown leather belt with gold buckle and
   * edges; the holster navy; her guns dark with gold. Her leotard a smooth satin sheen. (Her 3D pieces come next.)
   */
  spaceHeroine: {
    belt: { belt: 0x6a4a34, edge: 0xc9a35e, buckle: 0xd8b46a, accent: 0xc9a35e, strap: 0x3a2a20, holster: 0x1c2445, plate: 0x1c2445 },
    beltLine: [-0.06, 0.035, 0.1],
    // (Joshua's pictures laid on in their own colours: his navy over the navy, a 10 cm repeat; his gold glitter over the
    //  gold, a 4 cm repeat, so its glints are fine on the thin piping; his white tech pattern over the white, 14 cm. Depth, Joshua: "add some depth to the blue and gold": 0.4 and 0.3 mm)
    clothShine: { cloth: 0.5, trim: 0.42, prints: [{ ...NAVY_SPARKLE, on: '#1c2445', metres: 0.1, depth: 0.0004 }, { ...GOLD_GLITTER, on: '#c59b60', metres: 0.04, depth: 0.0003 }, { ...WHITE_TECH, on: '#efeef3', metres: 0.14 }] },
    gun: { metal: 0x23283a, glow: 0xd8b46a },
    // (Joshua, 2026-11-19: "Go for one holster": on her right thigh, as in his picture; no clip pouches)
    holsters: ['right'], pouches: false,
    // (her pieces, Look 2's set: plate = its white, trim = its navy, accent = its gold, sole navy)
    pieces: {
      plate: '#eeeef2', trim: '#1c2445', accent: '#c9a35e', sole: '#1c2445', glow: '',
      boots: true, cuffs: true, shoulders: true, design: 'anime', knees: true, collar: true, gloves: true, hipPanelLining: '#b3202a',
      // (the panels hang from the middle of the belt: its top is 3.5 cm over her hip joints at her sides, 10 cm behind)
      hipPanelTop: [0.017, 0.082],
    },
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
