// ============================================================================
// bronzeSuit.ts -- BLAZE in THE BRONZE CATSUIT: one of Joshua's catsuit
// STYLES (2026-11-20: "one piece catsuits... just different variations of
// looks as styles are better for the theme"; reference
// docs/reference/outfits/looks5-6-catsuit-styles-green-gold-and-bronze.jpg,
// the one on the right: "do the bronze one first, then the green one").
//
// Made by the catsuit recipe every style shares (catsuit.ts): the builder's own
// DRAWN catsuit (its v0.9.60), so its edges are smooth. Before, the keyhole and
// the low sweetheart were PAINTED BY CODE (a template could not have a hole),
// and a shape painted by code is only as fine as her skin's points: Joshua saw
// "the edgings look rough", and faint lines where painted seams and cups met
// the suit. The suit is plain glossy bronze; its texture and shine come from
// the game (looks/gear.ts).
//
// THREE VERSIONS (his three: "we have 3 now"):
//   `bronzeSuit`      THE KEYHOLE: a turtleneck up her neck and a keyhole
//                     cutout over the top of her cleavage, its slit running
//                     up through the collar (his favourite, the cutout);
//   `bronzeSuitLow`   THE LOW NECK: a low, slightly wide U, her neck and upper
//                     chest bare, as his picture has her;
//   `bronzeSuitHigh`  HIS HIGH NECK ("Blaze - copper HN"): a crew high on her
//                     chest, at 0.94 of her trunk (the gap the builder leaves
//                     there filled in bronze: catsuit.ts).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { NECKLINES, catsuitLook } from './catsuit';

/** THE COLOURS (GAME TUNING): from his picture. */
export const BRONZE_SUIT_COLOURS = Object.freeze({
  /** the catsuit: a warm copper bronze */
  bronze: '#84461f',
});

/** THE KEYHOLE: a turtleneck and a keyhole over the top of her cleavage. */
export const BRONZE_SUIT_LOOK: HeroineLook = catsuitLook({ colour: BRONZE_SUIT_COLOURS.bronze, neck: NECKLINES.keyhole });
/** THE LOW NECK: a low, slightly wide U. */
export const BRONZE_SUIT_LOW_LOOK: HeroineLook = catsuitLook({ colour: BRONZE_SUIT_COLOURS.bronze, neck: NECKLINES.lowU });
/** HIS HIGH NECK: a crew high on her chest. */
export const BRONZE_SUIT_HIGH_LOOK: HeroineLook = catsuitLook({ colour: BRONZE_SUIT_COLOURS.bronze, neck: NECKLINES.high });
