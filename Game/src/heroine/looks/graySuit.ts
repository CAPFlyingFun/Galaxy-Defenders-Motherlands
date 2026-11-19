// ============================================================================
// graySuit.ts -- BLAZE in the GRAY AND RED SUIT: Joshua's outfit design 2
// (docs/reference/outfits/02-catsuit-gray-red.png, 2026-11-18: "maybe the 2nd
// image with mainly all gray and red with the belly covered").
//
// A NEW LOOK beside blazeSuit.ts (her pink and black, which stays the game's
// look until he approves this one). Her body and head are Blaze's as in
// blazeSuit.ts; only her clothes are new, all of it the Character Builder's
// own paint:
//
//   Paint layer 1, THE SUIT: the builder's "Full bodysuit" template, in light
//     gray, from her ankles to the base of her neck and down to her wrists. It
//     covers her belly whole, so no painted edge has to follow her bump as it
//     grows (an edge baked for one belly stays where it was baked: bakedLook.ts).
//     Its edging (the bands at her neck, wrists and ankles) is the suit's red.
//
//   Paint layer 2, THE SUIT BEHIND HER CLEAVAGE STRIP (painted by code:
//     paintMask.ts): the builder takes the suit's own paint off from behind the
//     strip of fabric across her cleavage, which left skin showing round the
//     strip; this layer, in the suit's gray, fills it. (His picture's darker
//     gray panels would have used this layer: they can come later as 3D trim.)
//
//   Paint layer 3, THE RED BANDS (painted by code): his picture's sweeping red.
//     On her front, from the base of her neck down past the outside of each
//     breast and down the sides of her belly to her hips; behind, from her
//     shoulder blades down to her waist; on her legs, from the outside of her hip
//     down her thigh, across her knee to the inside of her shin; on her arms,
//     down the outside of her upper arm.
//
// NOT HERE (built in 3D by the game, as the plan says): the glowing lines along
// the panels' edges, her shoulder plates, wrist cuffs, the belt under her belly
// and her tall flat combat boots. Her shoes are off ('none'): the boots go over
// her feet.
//
// HOW THE SHAPES ARE WRITTEN: paintMask.ts measures every point of her skin as
// a place on her leg, her trunk or her arm (`along` down or up it, `turn`
// degrees round it: 0 her front, +90 her outer side, 180 her back), and each
// painter says how far inside its shapes the point is. Both sides of her get the
// same shapes, mirrored. All widths are in leg lengths (1 = hip joint to ankle,
// about 78 cm: 0.03 is about 2.3 cm).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import { plate, stripe, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { BLAZE_SUIT_LOOK } from './blazeSuit';

/** THE SUIT'S COLOURS (GAME TUNING; Joshua: "we can obviously modify the colors to be brighter or different themes"). */
export const GRAY_SUIT_COLOURS = Object.freeze({
  /** the suit itself: a light, cool gray */
  suit: '#d3d5da',
  /** the darker gray of his picture's side panels (for the 3D trim) */
  panel: '#8d9098',
  /** the red: a deep wine red, as in his picture */
  red: '#8e1f36',
});

/** A custom colour is the Flat family's White (colour 0) dyed with a tint: how the builder itself saves one. */
const flatTint = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;

/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A path through (along, turn) points, eased between them: for a band that curves round her as it goes. */
const through = (points: readonly (readonly [number, number])[]) => (along: number): number => {
  if (along <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k++) {
    const [a0, t0] = points[k - 1], [a1, t1] = points[k];
    if (along <= a1) return t0 + (t1 - t0) * smooth(a0, a1, along);
  }
  return points[points.length - 1][1];
};

// ------------------------------------------------------------------ the red bands (paint layer 3)

/** THE FRONT BAND on her trunk: from the top of her shoulder, down past the outside of her breast, down the side of her belly. */
const FRONT_BAND = through([[1.0, 78], [0.86, 52], [0.7, 44], [0.45, 42], [0.15, 50], [-0.2, 78]]);
/** THE BACK BAND on her trunk: from her shoulder blade down the side of her back to her hip (her back's middle stays gray). */
const BACK_BAND = through([[0.95, 128], [0.6, 118], [0.25, 106], [-0.2, 96]]);
/** THE LEG BAND: from the outside of her hip, down her thigh, across her knee to the inside of her shin. */
const LEG_BAND = through([[-0.2, 86], [0.25, 74], [0.45, 22], [0.6, -38], [0.95, -55]]);
/** THE ARM BAND: down the outside of her upper arm, onto the top of her forearm. */
const ARM_BAND = through([[0, 70], [0.5, 80], [1, 40]]);

const paintRed: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);   // -1: far outside everything (bare of this layer)
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    let best = -1;
    if (surface.trunkPlace(v, place)) {
      best = Math.max(best,
        stripe(place, { from: -0.2, to: 1.0, half: 0.032, path: FRONT_BAND }),
        stripe(place, { from: -0.2, to: 0.95, half: 0.03, path: BACK_BAND }));
    }
    if (surface.legPlace(v, place)) {
      best = Math.max(best, stripe(place, { from: -0.2, to: 0.95, half: 0.028, path: LEG_BAND }));
    }
    if (surface.armPlace(v, place)) {
      best = Math.max(best, stripe(place, { from: 0.02, to: 0.9, half: 0.022, path: ARM_BAND }));
    }
    inside[v] = best;
  }
  return inside;
};

// ------------------------------------------------------------------ the suit behind her cleavage strip (paint layer 2)

/**
 * The builder takes a top's paint off the skin behind the strip of fabric it stretches across her cleavage, so only
 * the strip shows there; round the strip's edges that left her bare skin showing. Paint on ANOTHER layer stays, so
 * this layer, in the suit's own gray, covers her cleavage under the strip. (It was to be the darker gray panels:
 * the builder has three paint layers and this needs one. The panels can come back as 3D trim later.)
 */
const paintUnderStrip: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (!surface.trunkPlace(v, place)) continue;
    // her chest's front between her breasts, from under them to her collarbones
    inside[v] = plate(place, { from: 0.62, to: 0.98, centre: 0, widthTop: 34, widthBottom: 30, corner: 0.03 });
  }
  return inside;
};

// ------------------------------------------------------------------ the look

const bodysuit = COVERAGE_TEMPLATES.find((t) => t.id === 'bodysuitFull');
if (!bodysuit) throw new Error("[graySuit] the builder has no 'bodysuitFull' template any more: graySuit.ts must be looked at again");

/** How the suit shows what is under it: her navel a little (the suit is thin), her nipples hardly at all. */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.15, navel: 0.35 } } as const;

const C = GRAY_SUIT_COLOURS;

export const GRAY_SUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  // her body and head as the game's Blaze has them (blazeSuit.ts: Joshua's export, with her dark ponytail)
  body: BLAZE_SUIT_LOOK.body,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: the builder knows it, and a name it does not know makes it fall back to
    //  its default outfit, which put its cloth tee over the suit in blotches)
    shoes: 'none',
    detail: { nipple: 0.15, navel: 0.35 },
    layers: [
      // PAINT LAYER 1: the suit, from her ankles to her neck and wrists, red at its edges (a high neck: 1 is the
      // base of her neck, where his picture's collar starts)
      {
        choice: { fabric: flatTint(C.suit), match: false, trim: flatTint(C.red), stitch: 1, opacity: 1 },
        detail: DETAIL,
        template: { id: bodysuit.id, params: { ...bodysuit.params, neckFront: 1.0, neckBack: 1.0 } },
        mask: '',
      },
      // PAINT LAYER 2: the suit's gray behind her cleavage strip, painted by `paintUnderStrip` once she is loaded
      { choice: { fabric: flatTint(C.suit), match: true, trim: flatTint(C.suit), stitch: 1, opacity: 1 }, detail: DETAIL, template: null, mask: '' },
      // PAINT LAYER 3: the red bands, painted by `paintRed`
      { choice: { fabric: flatTint(C.red), match: true, trim: flatTint(C.red), stitch: 1, opacity: 1 }, detail: DETAIL, template: null, mask: '' },
    ],
  },
  maskPainters: [null, paintUnderStrip, paintRed],
};
