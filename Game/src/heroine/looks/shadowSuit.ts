// ============================================================================
// shadowSuit.ts -- BLAZE in the SHADOW OPERATIVE CATSUIT: look 1 of Joshua's
// outfit board (docs/reference/outfits/04-four-looks-board.png, 2026-11-19:
// "ChatGPT actually recommended starting with one as it's basically a whole
// body paint (catsuit) and could even paint the collar").
//
// Her body and head are the game's Blaze (blazeSuit.ts: Joshua's export, her
// dark ponytail). Her clothes are all the Character Builder's own paint:
//
//   Paint layer 1, THE CATSUIT: the builder's "Full bodysuit" template from her
//     ankles to her neck and wrists, in the builder's ATHLETIC fabric (a knit
//     with its own sheen) dyed a deep charcoal, nearly black. Not flat black: the
//     game's city is dark, and a flat black suit would lose her shape in it. Its
//     neckline is right up at the base of her neck (the collar), and its edging
//     -- the bands round her neck, wrists and ankles -- is the suit's red.
//
//   Paint layer 2, THE FINGERLESS GLOVES (painted by code: paintMask.ts): her
//     hands from her wrist to the roots of her fingers, in the suit's charcoal;
//     the same layer covers her cleavage, where the builder takes the suit's own
//     paint off for a strip of fabric we leave out (it showed as a line). (In a
//     near-black, the cleavage showed as a darker patch: so the suit's colour.)
//
//   Paint layer 3, THE RED STRIPES (painted by code): look 1's lines. On her
//     front, from the top of her shoulder down past the outside of her breast
//     and down her side to the front of her hip; on her legs, from her hip down
//     the front of her thigh and over her knee to the front of her shin; behind,
//     down the sides of her back; on her arms, down the outside.
//
// Her 3D gear (looks/gear.ts): her belt SLUNG on her hips, sagging at her front
// (Joshua: "sit on her hips but maybe sag down a bit in the front, which will
// work for the belly later"), thigh holsters, tall flat combat boots, cuffs.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import { plate, stripe, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { BLAZE_SUIT_LOOK } from './blazeSuit';

/** THE SUIT'S COLOURS (GAME TUNING). */
export const SHADOW_SUIT_COLOURS = Object.freeze({
  /** the catsuit: a deep charcoal, nearly black (in the builder's athletic knit) */
  suit: '#232429',
  /** the stripes: look 1's red */
  red: '#b3122a',
});

/** A colour in one of the builder's fabric families: its first colour (White) dyed with a tint, as the builder saves one. */
const dyed = (family: 'flat' | 'athletic', tint: string) => ({ family, colour: 0, tint }) as const;

/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A path through (along, turn) points, eased between them: for a stripe that curves round her as it goes. */
const through = (points: readonly (readonly [number, number])[]) => (along: number): number => {
  if (along <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k++) {
    const [a0, t0] = points[k - 1], [a1, t1] = points[k];
    if (along <= a1) return t0 + (t1 - t0) * smooth(a0, a1, along);
  }
  return points[points.length - 1][1];
};

// ------------------------------------------------------------------ the red stripes (paint layer 3)
// (as in graySuit.ts: `along` up her trunk or down her leg or arm, `turn` degrees round her: 0 her front, +90 her
//  outer side, 180 her back; both sides mirrored; widths in leg lengths, 0.01 is about 8 mm)

/** Down her front: from the top of her shoulder, past the outside of her breast, down her side to the front of her hip. */
const FRONT_STRIPE = through([[1.0, 80], [0.85, 55], [0.68, 46], [0.45, 52], [0.15, 58], [-0.2, 62]]);
/** Down her leg: from her hip, down the front of her thigh, over her knee, down the front of her shin. */
const LEG_STRIPE = through([[-0.2, 62], [0.2, 40], [0.47, 22], [0.7, 14], [0.95, 10]]);
/** Down her back: from her shoulder blade down the side of her back to her waist. */
const BACK_STRIPE = through([[0.95, 125], [0.6, 115], [0.25, 104], [-0.2, 96]]);
/** Down her arm: the outside of her upper arm and forearm. */
const ARM_STRIPE = through([[0, 75], [0.5, 85], [1, 80]]);

const paintStripes: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    let best = -1;
    if (surface.trunkPlace(v, place)) {
      best = Math.max(best,
        stripe(place, { from: -0.2, to: 1.0, half: 0.018, path: FRONT_STRIPE }),
        stripe(place, { from: -0.2, to: 0.95, half: 0.016, path: BACK_STRIPE }));
    }
    if (surface.legPlace(v, place)) best = Math.max(best, stripe(place, { from: -0.2, to: 0.95, half: 0.016, path: LEG_STRIPE }));
    if (surface.armPlace(v, place) && place.along <= 0.95) best = Math.max(best, stripe(place, { from: 0.02, to: 0.92, half: 0.013, path: ARM_STRIPE }));
    inside[v] = best;
  }
  return inside;
};

// ------------------------------------------------------------------ the fingerless gloves (paint layer 2)

/** Her hand from her wrist (1 along her arm) to the roots of her fingers. */
const GLOVE = Object.freeze({ from: 0.97, to: 1.2 });

/**
 * THE COLLAR (Joshua, 2026-11-19, with a close-up of Look 1: "make sure you have the collar going up to her neck"): a
 * mock neck in the suit's own colour, standing up her neck to about a quarter of the way from its base to the top of
 * her head behind, dipping a little lower in front under her chin. Heights in her neck's own measure (`neckPlace`).
 */
const COLLAR = Object.freeze({ back: 0.27, front: 0.21, chin: 0.11, chinFrom: 0.14 });

const paintGloves: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (surface.armPlace(v, place)) {
      // all the way round her hand between those two places: how far inside that band she is (leg lengths)
      inside[v] = Math.min(place.along - GLOVE.from, GLOVE.to - place.along) * 0.6;
      continue;
    }
    if (surface.trunkPlace(v, place)) {
      // ...and HER CLEAVAGE: the builder takes the suit's paint off there (for a strip of fabric across it, which we
      // leave out: on the gray suit it showed as a line across her breasts), so this layer covers it in the suit's colour
      inside[v] = plate(place, { from: 0.62, to: 0.98, centre: 0, widthTop: 34, widthBottom: 30, corner: 0.03 });
    }
    if (surface.neckPlace(v, place)) {
      // the collar's top: highest behind, lowest at the front, rising smoothly round her sides
      const top = COLLAR.front + (COLLAR.back - COLLAR.front) * (Math.abs(place.turn) / 180);
      // (a point far out from her neck's line up at her jaw's height is her jaw or chin, not her neck: left bare. Lower
      //  down, far out is the top of her shoulders, which rise above the base of her neck: covered)
      const collar = place.radius > COLLAR.chin && place.along > COLLAR.chinFrom ? -1 : (top - place.along) * 0.35;
      inside[v] = Math.max(inside[v], collar);
    }
  }
  return inside;
};

// ------------------------------------------------------------------ the look

const bodysuit = COVERAGE_TEMPLATES.find((t) => t.id === 'bodysuitFull');
if (!bodysuit) throw new Error("[shadowSuit] the builder has no 'bodysuitFull' template any more: shadowSuit.ts must be looked at again");

/** How the suit shows what is under it: her nipples hardly at all, her navel wholly (graySuit.ts says why). */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.15, navel: 1 } } as const;
const C = SHADOW_SUIT_COLOURS;

export const SHADOW_SUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  body: BLAZE_SUIT_LOOK.body,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
    shoes: 'none',
    detail: { nipple: 0.15, navel: 1 },
    layers: [
      // PAINT LAYER 1: the catsuit, red at its edges, its neckline up at the base of her neck (the collar)
      {
        choice: { fabric: dyed('athletic', C.suit), match: false, trim: dyed('athletic', C.red), stitch: 0.5, opacity: 1 },
        detail: DETAIL,
        template: { id: bodysuit.id, params: { ...bodysuit.params, neckFront: 1.0, neckBack: 1.0 } },
        mask: '',
      },
      // PAINT LAYER 2: the fingerless gloves, painted by `paintGloves` once she is loaded
      // (in the suit's own charcoal knit: near-black, the cleavage showed as a darker patch with an edge across her chest)
      { choice: { fabric: dyed('athletic', C.suit), match: true, trim: dyed('athletic', C.suit), stitch: 0.5, opacity: 1 }, detail: DETAIL, template: null, mask: '' },
      // PAINT LAYER 3: the red stripes, painted by `paintStripes`
      { choice: { fabric: dyed('athletic', C.red), match: true, trim: dyed('athletic', C.red), stitch: 0.5, opacity: 1 }, detail: DETAIL, template: null, mask: '' },
    ],
  },
  maskPainters: [null, paintGloves, paintStripes],
  // (no strip across her cleavage: the suit's paint runs into it, as on the gray suit)
  noCleavageBridge: true,
};

