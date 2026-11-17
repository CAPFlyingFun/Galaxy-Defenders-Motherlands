// ============================================================================
// blazeSuit.ts -- BLAZE in PINK AND BLACK: her painted suit for the game.
//
// It STARTS FROM Joshua's own export (blaze.ts, read in below, never changed)
// and keeps his CUT exactly: the same sports bra shape, the same low-rise
// leggings cut under her belly, her bare belly, her body, her sneakers. Only
// colours, edging and one extra paint layer are different, all of it done with
// the Character Builder's own paint (nothing is patched from outside it).
//
// EVERYTHING CHANGED FROM HIS EXPORT (a proposal for him to approve):
//
//   Paint layer 1, the leggings (template 'leggingsUnder', every dial as he set it):
//     1. fabric colour: his pink tint #ff4bff  ->  the Flat family's Black (colour 4, no tint)
//     2. match: true -> false, so the edging has a colour of its own
//     3. trim (the waistband and the cuffs at the ends of the legs): Flat Black -> Flat with tint EDGE_GREY (silver-grey)
//     4. lowBand: { waist: 0.015 }  ->  { waist: 0.022, leg: 0.03 }  (a 2.2 cm waistband and 3 cm cuffs, to show the grey)
//
//   Paint layer 2, the sports bra (template 'sportsBra', every dial as he set it, neckFront 0.7 included):
//     5. fabric colour: his pink tint #ff4bff  ->  Flat Black (colour 4, no tint)
//     6. match: true -> false; the trim stays HIS pink #ff4bff, so the bra's bound edges and under-band are pink
//     7. band: { hem: 0.035 }  ->  { hem: 0.035, neck: 0.013 }  (the pink binding round neck, straps and armholes 1.3 cm wide, not 1; at 2 cm it smudged near the cleavage)
//
//   Paint layer 3 (EMPTY in his export):
//     8. NEW: a hand-painted layer in HIS pink #ff4bff, painted by code (paintMask.ts): on each leg a plate on the
//        front of the thigh, a plate on the shin, a smaller plate on the back of the calf, and a stripe that
//        sweeps from the outside of the hip round to the back of the thigh. They are laid over the black leggings.
//
//   Her head (his export has none, so she had the builder's copper ponytail):
//     9. NEW: body.head with hair colour HAIR_DARK (very dark brown), the same ponytail; everything else of her head as it was.
//
// WHY THE LEGGINGS AND BRA ARE BLACK WITH PINK ON TOP, and not pink with black on top. Either way she is pink and
// black. But a panel painted by code is fixed to her SKIN, while his under-belly waistband is drawn by the builder
// as a hoop that swings as her belly grows. A black panel over her hips could not follow that waistband, and a
// strip of pink of changing width would show between them. With black as the garment's own colour, the black
// reaches his waistband exactly (the builder draws that edge, razor sharp, at every belly size) and the pink
// plates sit safely inside the legs.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { plate, stripe, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';

/** Blaze's pink: the colour Joshua picked for her in the Character Room. */
const PINK = '#ff4bff';
/** The silver-grey of the edging (her waistband and cuffs), after the grey panels in his pictures of her. */
const EDGE_GREY = '#b9bdc9';
/** Her ponytail: a very dark brown, nearly black. */
const HAIR_DARK = '#1c120e';

/** The Character Builder's "Flat" fabric (a plain colour, no weave) in its Black, number 4 of its sixteen colours. */
const FLAT_BLACK = { family: 'flat', colour: 4 } as const;
/** A custom colour is the Flat family's White (colour 0) dyed with a tint: how the builder itself saves one. */
const flatTint = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;

// ------------------------------------------------------------------ the pink panels (paint layer 3)

/**
 * WHERE THE PINK GOES. For every point of her skin: how far inside a pink shape it is (paintMask.ts explains).
 * All lengths are in leg lengths (1 = hip joint to ankle, about 78 cm); her knee is at about 0.47. Angles are
 * degrees round her leg: 0 the front, +90 the outer side, 180 the back, -90 the inner side. Both legs get the same
 * shapes, mirrored.
 *
 * The shapes keep clear of three places on purpose: her waistband (it moves with her belly), her knees (her
 * skin stretches most there, and her 3D knee caps go on top) and the ends of the leggings' legs.
 */
const paintBlazePanels: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);   // -1: far outside everything (bare of this layer)
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (!surface.legPlace(v, place)) continue;

    // THE THIGH PLATE: the front of her thigh, turned a little to the outside, narrower toward her knee.
    const thigh = plate(place, { from: 0.15, to: 0.405, centre: 12, widthTop: 62, widthBottom: 44, corner: 0.05 });

    // THE SHIN PLATE: the front of her shin from under her knee to above her ankle.
    const shin = plate(place, { from: 0.545, to: 0.875, centre: 0, widthTop: 88, widthBottom: 70, corner: 0.04 });

    // THE HIP STRIPE: starts on the outside of her hip and sweeps round to the back of her thigh on its way down.
    const sweep = stripe(place, {
      from: 0.03, to: 0.40, half: 0.021,
      path: (along) => { const t = Math.min(1, Math.max(0, (along - 0.03) / 0.37)); return 100 + 62 * t * t * (3 - 2 * t); },
    });

    // THE CALF PLATE: a smaller plate on the back of her calf, so she is not all black from behind.
    const calf = plate(place, { from: 0.56, to: 0.80, centre: 180, widthTop: 58, widthBottom: 40, corner: 0.04 });

    // a point is pink when it is inside ANY of the shapes: the largest of the four distances
    inside[v] = Math.max(thigh, shin, sweep, calf);
  }
  return inside;
};

// ------------------------------------------------------------------ the look

/** The parts of an exported paint layer this file reads and changes (the rest is passed through untouched). */
interface ExportedLayer {
  readonly choice: { readonly fabric: unknown; readonly match: boolean; readonly trim: unknown; readonly stitch: number; readonly opacity: number | null };
  readonly detail: unknown;
  readonly template: { readonly id: string; readonly params: Record<string, unknown> } | null;
  readonly mask: string;
}
interface ExportedClothes { readonly layers: readonly (ExportedLayer | null)[] }

const his = BLAZE_LOOK.clothes as ExportedClothes;
const hisLeggings = his.layers[0], hisBra = his.layers[1];
// (if a new export ever moves his layers about, say so at once instead of quietly dressing her wrongly)
if (hisLeggings?.template?.id !== 'leggingsUnder' || hisBra?.template?.id !== 'sportsBra') {
  throw new Error('[blazeSuit] blaze.ts no longer has leggings on paint layer 1 and a sports bra on layer 2: blazeSuit.ts must be looked at again');
}

export const BLAZE_SUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  body: {
    ...BLAZE_LOOK.body,
    // (change 9) her head as the builder's own default head, with only her hair's colour chosen
    head: {
      hair: { style: 'ponytail', length: 1, colour: HAIR_DARK },
      eyes: { colour: null },
      brows: { colour: null, amount: 1 },   // null: her brows follow her hair's colour
      lips: { colour: null, amount: 0.55 },
      lashes: 1,
      face: {},
    },
  },
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    layers: [
      // PAINT LAYER 1: his leggings, black, with a silver-grey waistband and cuffs (changes 1-4)
      {
        ...hisLeggings,
        choice: { ...hisLeggings.choice, fabric: FLAT_BLACK, match: false, trim: flatTint(EDGE_GREY) },
        template: { id: hisLeggings.template.id, params: { ...hisLeggings.template.params, lowBand: { waist: 0.022, leg: 0.03 } } },
      },
      // PAINT LAYER 2: his sports bra, black, bound and banded in his pink (changes 5-7)
      {
        ...hisBra,
        choice: { ...hisBra.choice, fabric: FLAT_BLACK, match: false, trim: flatTint(PINK) },
        template: { id: hisBra.template.id, params: { ...hisBra.template.params, band: { hem: 0.035, neck: 0.013 } } },
      },
      // PAINT LAYER 3: the pink panels, painted by `paintBlazePanels` once she is loaded (change 8).
      // It is written the way the builder writes a hand-painted layer: no template, and a mask (filled in later).
      {
        choice: { fabric: flatTint(PINK), match: true, trim: flatTint(PINK), stitch: 1, opacity: 1 },
        detail: hisLeggings.detail,
        template: null,
        mask: '',
      },
    ],
  },
  maskPainters: [null, null, paintBlazePanels],
};
