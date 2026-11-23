// ============================================================================
// marySuits.ts -- MARY'S THREE CATSUITS, M1-M3 of Joshua's board.
//
// (Joshua, 2026-11-22, with ChatGPT's board of Mary's and John's suits, kept in
// docs/reference/outfits/mary-john-catsuits-m1-m3-j1-j3.jpg: "You can mostly
// reuse the plain catsuit and paint on the colors, stripes, panels, and other
// details using the existing CCBS system... Keep the outfits lightweight for
// mobile, make sure they work with Mary's full 0-200% belly slider"; then
// "starting with the 3 images in the first image".)
//   M1  A.R.C.H. RESEARCH SUIT   black, TEAL panels, a WHITE stripe down each leg and arm
//   M2  SUBTERRANEAN EXPLORER    black, ORANGE panels, bold orange rings round her knees
//   M3  STEALTH OPERATIVE        black, thin RED lines, red rings round her knees
//
// HOW EACH IS MADE. ALL OF IT IS PAINT ON HER SKIN, nothing new in 3D:
//   paint layer 1  JOSHUA'S PLAIN CATSUIT, exactly as he saved it (the builder's
//                  Full bodysuit: its mock collar up her neck, its long sleeves
//                  and legs; his black athletic knit). Its edges are the builder's.
//   paint layer 2  under its high collar the builder leaves her cleavage for a
//                  piece that is smaller in the game: the gap filled in the same
//                  black (catsuit.ts `fillCleavage`, as every high-necked catsuit).
//   paint layers 3-4  the PANELS, STRIPES AND RINGS, painted by code
//                  (paintMask.ts), in the builder's smooth Flat cloth: measured on
//                  her own trunk, arms and legs, so they lie where they should at
//                  any shape. Being paint, they stretch with her skin.
//   THE SIDE BAND  is NOT paint in the game: the game draws it live on her
//                  (liveBand.ts; v0.2.160, Joshua, 2026-11-23: over a big belly the
//                  painted band grew twice as wide and its edge went ragged on the
//                  phone's 1024 picture). It stays on the same skin, so it moves with
//                  her belly, but keeps its WIDTH at any belly and a sharp edge.
// Her belt, holsters and pouches (the game needs them), her guns and her low boots
// are the game's 3D gear in each suit's colours (looks/gear.ts `marySuitGear`). The
// A.R.C.H. emblem on the chest is left for later: a small painted shape comes out
// with rough edges (a painted shape is only as fine as her skin's points).
//
// The measures (paintMask.ts): `along` up her TRUNK (0 her hip joints, 1 the base
// of her neck), down her LEG (0 the hip joint, about 0.47 the knee, 1 the ankle)
// or ARM (0 the shoulder joint, 1 the wrist); `turn` degrees round her (0 her
// front, +90 her outer side, 180 her back; both sides mirrored); sizes in leg
// lengths (0.01 is about 8 mm). The shapes are GAME TUNING, judged against the board.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import type { MaskPainter } from '../paintMask';
import type { LiveBand } from '../liveBand';
import { any, armStripe, capOnArm, capOnTrunk, cuff, kneeRing, legStripe, painter, sideBand } from './suitShapes';
import { BLAZE_LOOK } from './blaze';
import { fillCleavage } from './catsuit';
import { EXPORT_BODY } from './shadowSuit';

// ------------------------------------------------------------------ Joshua's plain catsuit

/**
 * JOSHUA'S PLAIN CATSUIT (his export of 2026-11-23, docs/reference/characters/
 * character-blaze-plain-catsuit-2026-11-23.json, made in builder v0.9.72): its one paint layer, exactly as saved. Its
 * body is the catsuits' own (shadowSuit.ts `EXPORT_BODY`: the same numbers).
 */
const PLAIN_CATSUIT_LAYER = {
  choice: { fabric: { family: 'athletic', colour: 4 }, match: true, trim: null, stitch: 0.5, opacity: null },
  detail: { mode: 'auto', material: null, override: { nipple: 0.45, navel: 0.8 } },
  template: {
    id: 'bodysuitFull',
    params: {
      riseFront: 1, riseSide: 1, riseBack: 1, riseFrontWidth: 1, legStart: 0, legEnd: 1, feet: false,
      hemFront: -1, hemBack: -1, neckFront: 1.1, neckBack: 0.97, sleeve: 1,
      topFront: null, topBack: null, topSide: null, strap: 0, strapIn: 0, armhole: null,
      neckStyle: 'crew', legCut: null, length: null, top: 'catsuit',
    },
  },
  mask: '',
} as const;

/** A colour in the builder's smooth Flat cloth: its White dyed, as the builder saves one. The game gives it a gloss. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
/** A paint layer painted by code, in one colour (its mask made when she loads: builderRoom.ts). */
const coded = (tint: string) => ({
  choice: { fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 },
  detail: PLAIN_CATSUIT_LAYER.detail, template: null, mask: '',
});
/** The gap under the collar, filled in the catsuit's own black knit. */
const FILL_LAYER = { ...PLAIN_CATSUIT_LAYER, template: null };

// ------------------------------------------------------------------ the shapes
// (in suitShapes.ts, shared with Mary's casual sets: casualSets.ts)

// ------------------------------------------------------------------ the three suits

/**
 * One of Mary's catsuits: Joshua's plain catsuit, its collar gap filled, its painted layers (bottom first), and the side
 * band the game draws live (`side`: which of the painted layers it belongs to, the colour of, and where it runs).
 */
function marySuitLook(
  painted: readonly { readonly colour: string; readonly paint: MaskPainter }[],
  side: { readonly on: number; readonly trunk: LiveBand['trunk'] },
): HeroineLook {
  // (the painted layers come after his catsuit's two)
  const liveBand: LiveBand = { colour: painted[side.on].colour, layer: 2 + side.on, trunk: side.trunk };
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    clothes: {
      ...(BLAZE_LOOK.clothes as object),
      // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
      // (her boots are the game's: looks/gear.ts)
      shoes: 'none',
      detail: { nipple: null, navel: null },
      layers: [PLAIN_CATSUIT_LAYER, FILL_LAYER, ...painted.map((p) => coded(p.colour))],
    },
    // (layer 1 his template; layer 2 the gap under his collar, up to it: his neckline 1.1)
    // (filled from 0.55 up her trunk: from the usual 0.7 a slit of her skin showed under her cleavage, the first bake)
    maskPainters: [null, fillCleavage(PLAIN_CATSUIT_LAYER.template.params.neckFront, 0.55), ...painted.map((p) => p.paint)],
    liveBand,
    noCleavageBridge: true,
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** THE COLOURS (GAME TUNING, from the board). `suit` is the catsuit's black as a hex, for her 3D gear. */
export const MARY_SUIT_COLOURS = Object.freeze({
  suit: '#121316',
  research: { teal: '#18c6c8', white: '#e4e8ee' },
  explorer: { orange: '#f2961c' },
  stealth: { red: '#e0141c' },
});
const C = MARY_SUIT_COLOURS;

/**
 * M1, THE A.R.C.H. RESEARCH SUIT: teal caps over her shoulders, a teal band down each side (widest at her waist), a thin
 * teal line round each knee and teal cuffs; a white stripe down the outside of each leg and arm, beside the teal.
 */
export const MARY_RESEARCH_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.research.white,
    paint: painter({
      leg: (p) => legStripe(p, 0.012, 6),
      // (a little toward the front of her arm from the teal: at +26 it ran down the back of her arm)
      arm: (p) => armStripe(p, 0.008, 0.22, -24),
    }),
  },
  {
    colour: C.research.teal,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 1),
      leg: (p, knee) => kneeRing(p, knee, { wide: 0.045, tall: 0.06, half: 0.005, lift: 0.005 }),
      arm: (p) => any(capOnArm(p, 1), armStripe(p, 0.008), cuff(p, 0.04)),
    }),
  },
], { on: 1, trunk: sideBand(0.032, 0.012) });

/**
 * M2, THE SUBTERRANEAN EXPLORER: orange caps over her shoulders, a broad orange band down each side, an orange stripe
 * down the outside of each arm and leg, orange cuffs, and a bold orange ring round each knee.
 */
export const MARY_EXPLORER_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.explorer.orange,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 1),
      leg: (p, knee) => any(legStripe(p, 0.008, 4), kneeRing(p, knee, { wide: 0.05, tall: 0.065, half: 0.008, lift: 0.005 })),
      arm: (p) => any(capOnArm(p, 1), armStripe(p, 0.01), cuff(p, 0.045)),
    }),
  },
], { on: 0, trunk: sideBand(0.04, 0.014) });

/**
 * M3, THE STEALTH OPERATIVE: thin red lines, a small red cap over each shoulder, a red line down each side, the
 * outside of each arm and leg, red cuffs and a red ring round each knee.
 */
export const MARY_STEALTH_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.stealth.red,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 0.6),
      leg: (p, knee) => any(legStripe(p, 0.008), kneeRing(p, knee, { wide: 0.048, tall: 0.062, half: 0.006, lift: 0.005 })),
      arm: (p) => any(capOnArm(p, 0.6), armStripe(p, 0.008), cuff(p, 0.035)),
    }),
  },
], { on: 0, trunk: sideBand(0.012, 0.009) });
