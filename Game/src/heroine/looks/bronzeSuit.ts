// ============================================================================
// bronzeSuit.ts -- BLAZE in THE BRONZE CATSUIT: one of Joshua's catsuit
// STYLES (2026-11-20: "one piece catsuits... just different variations of
// looks as styles are better for the theme"; reference
// docs/reference/outfits/looks5-6-catsuit-styles-green-gold-and-bronze.jpg,
// the one on the right: "do the bronze one first, then the green one").
//
// Built on HIS OWN CATSUIT EXPORT (his Blaze, her braid and face, as Look 1:
// shadowSuit.ts `EXPORT_BODY`), and now ALL ON THE BUILDER'S OWN CATSUIT
// (Joshua, 2026-11-20, once the builder could do it: "redo the neckline").
// Since the builder's v0.9.59 its catsuit (the Full bodysuit template) is
// DRAWN: its neck opening, sleeves and leg ends have smooth edges with a band,
// and its NECKLINE runs from a low U or V up to a turtleneck (`neckFront` past
// 1 is a collar up her neck), with a NECK SHAPE (crew, U, V, scoop, square)
// and a NECK WIDTH. Since v0.9.60 it can have a CHEST CUTOUT (oval, diamond or
// keyhole; its width, height and drop under her neck joint, in metres), drawn
// as a hole in the same picture, so its edge is as smooth as the neckline's.
//
// Before, the keyhole and the low sweetheart were PAINTED BY CODE (a template
// could not have a hole), and a shape painted by code is only as fine as her
// skin's points: Joshua saw "the edgings look rough", and faint lines where
// the painted seams and cups met the suit. Those are gone; the suit is plain
// glossy bronze, its texture and shine from the game (looks/gear.ts).
//
// THREE VERSIONS (his three: "we have 3 now"):
//   `bronzeSuit`      THE KEYHOLE: a turtleneck up her neck and a keyhole
//                     cutout over the top of her cleavage, its slit running
//                     up through the collar (his favourite, the cutout);
//   `bronzeSuitLow`   THE LOW NECK: a low, slightly wide U, her neck and upper
//                     chest bare, as his picture has her;
//   `bronzeSuitHigh`  HIS HIGH NECK ("Blaze - copper HN"): a crew neck high on
//                     her chest, at 0.94 of her trunk. Under a high neck the
//                     builder leaves her cleavage to its own cleavage piece;
//                     in the game bits of her skin showed through that piece,
//                     so the gap is filled in the same bronze instead
//                     (`FILL_CLEAVAGE`: the same colour on both sides, so no
//                     edge shows) and the piece is left out.
// ============================================================================
import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import type { HeroineLook } from '../heroineLook';
import type { MaskPainter } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { EXPORT_BODY } from './shadowSuit';

/** THE COLOURS (GAME TUNING): from his picture. */
export const BRONZE_SUIT_COLOURS = Object.freeze({
  /** the catsuit: a warm copper bronze */
  bronze: '#84461f',
});

/**
 * THE NECKLINES (GAME TUNING; the builder's own numbers). `neckFront` is on her trunk, 0 her hip joints, 1 the base of
 * her neck; past 1 it is a collar up her neck (1.1 its highest, 5 cm up it). `neckShape` the builder's style, `neckWide`
 * a share of that style's own width (0.6 to 1.6). `cutout` in metres: `drop` its middle under her neck joint (her
 * breasts' tops are about 11 cm under it), `width` and `height` across it; null for none.
 */
export const BRONZE_NECKLINES = Object.freeze({
  keyhole: { neckFront: 1.06, neckShape: 'crew', neckWide: 1, cutout: { shape: 'keyhole', width: 0.085, height: 0.085, drop: 0.15 } },
  low: { neckFront: 0.7, neckShape: 'u', neckWide: 1.2, cutout: null },
  high: { neckFront: 0.94, neckShape: 'crew', neckWide: 1, cutout: null },
} as const);
type Neckline = (typeof BRONZE_NECKLINES)[keyof typeof BRONZE_NECKLINES];

/** A colour as the builder saves one: its smooth Flat family's White (colour 0) dyed with a tint. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
/** How much shows through: Look 1's (Joshua's own numbers for his catsuit). */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.43, navel: 0.81 } } as const;
const pick = (tint: string) => ({ fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 }) as const;
/** A paint layer left bare (the suit is one layer; the other two are not used). */
const NOTHING: MaskPainter = (surface) => new Float32Array(surface.count).fill(-1);
/** An unused paint layer, as the builder saves one. */
const EMPTY_LAYER = { choice: pick(BRONZE_SUIT_COLOURS.bronze), detail: DETAIL, template: null, mask: '' } as const;

/**
 * The builder's catsuit with one neckline: its OWN template numbers (taken from the builder, so its drawn catsuit's
 * `top: 'catsuit'` and anything it adds later come with it), the neckline's numbers laid over them.
 */
function catsuit(neck: Neckline) {
  const template = COVERAGE_TEMPLATES.find((t) => t.id === 'bodysuitFull');
  if (!template) throw new Error('[bronzeSuit] the builder has no Full bodysuit template');
  return {
    choice: pick(BRONZE_SUIT_COLOURS.bronze),
    detail: DETAIL,
    template: { id: template.id, params: { ...template.params, ...neck } },
    mask: '',
  };
}

/**
 * THE GAP UNDER A HIGH NECK FILLED IN (paint layer 2, the same bronze): her front between her breasts and up to the
 * neckline (`along` on her trunk from 0.7, within 45 degrees of her front's middle). It only ever lies on the suit or
 * on the gap the builder left, so its own rough edge is bronze on bronze and never shows.
 */
const FILL_CLEAVAGE: MaskPainter = (surface) => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (!surface.trunkPlace(v, place)) continue;
    inside[v] = Math.min(place.along - 0.7, (45 - Math.abs(place.turn)) / 180, BRONZE_NECKLINES.high.neckFront - place.along) * 0.5;
  }
  return inside;
};

/** One version of the bronze catsuit (`fillCleavage`: the gap under a high neck filled in, the builder's piece left out). */
function bronzeLook(neck: Neckline, fillCleavage = false): HeroineLook {
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    clothes: {
      ...(BLAZE_LOOK.clothes as object),
      // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
      shoes: 'none',
      detail: { nipple: null, navel: null },
      layers: [catsuit(neck), EMPTY_LAYER, EMPTY_LAYER],
    },
    // (the suit is the builder's template; the spare layers left bare, or the second filling the gap under a high neck)
    maskPainters: [null, fillCleavage ? FILL_CLEAVAGE : NOTHING, NOTHING],
    ...(fillCleavage ? { noCleavageBridge: true } : {}),
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** THE KEYHOLE: a turtleneck and a keyhole over the top of her cleavage. */
export const BRONZE_SUIT_LOOK: HeroineLook = bronzeLook(BRONZE_NECKLINES.keyhole);
/** THE LOW NECK: a low, slightly wide U. */
export const BRONZE_SUIT_LOW_LOOK: HeroineLook = bronzeLook(BRONZE_NECKLINES.low);
/** HIS HIGH NECK: a crew high on her chest. */
export const BRONZE_SUIT_HIGH_LOOK: HeroineLook = bronzeLook(BRONZE_NECKLINES.high, true);
