// ============================================================================
// catsuitStyles.ts -- MORE CATSUIT STYLES, each the same catsuit in its own
// colours (Joshua, 2026-11-20: "a variety of colors like we have the bronze,
// maybe a shiny gold, black, sliver, etc, maybe even top half above belly/at
// bottom of breasts one tone, and below another, but still the same outfit").
//
// Each is made by catsuit.ts from the builder's drawn catsuit, so every edge is
// smooth; the two-tone ones are drawn by the game over one of these (below); its shine and metal, boots, belt and guns are in looks/gear.ts under
// the same name. A new one: add it here, to looks/index.ts and to
// heroineSettings.ts OUTFIT_CHOICES, give it its gear, then bake it
// (scripts/bake_heroine.py <name>, then scripts/make_skin_height.py).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { NECKLINES, catsuitLook } from './catsuit';

/** THE COLOURS (GAME TUNING). Each is the suit's flat colour; the game adds its gloss and metal (gear.ts). */
export const CATSUIT_COLOURS = Object.freeze({
  /** a rich polished gold */
  gold: '#c8962e',
  /** a deep glossy black, a touch blue so its gloss reads */
  black: '#141519',
  /** a cool bright silver */
  silver: '#a9aeb6',
});
const C = CATSUIT_COLOURS;

/**
 * EVERY COLOUR IN THE SAME THREE STYLES as the bronze (Joshua, 2026-11-20: "Make sure all outfits have the same style per
 * color"): the KEYHOLE (a turtleneck and a keyhole), the LOW neck (a low wide U) and the HIGH neck (his crew). Named
 * `catsuit<Colour>` (the keyhole), `catsuit<Colour>Low` and `catsuit<Colour>High`; Settings picks the colour under
 * Outfit and the style under Catsuit neckline (heroineSettings.ts `outfitLook`).
 */
const STYLE_NECKS = { '': NECKLINES.keyhole, Low: NECKLINES.lowU, High: NECKLINES.high } as const;
const inEveryStyle = (name: string, colour: string): Record<string, HeroineLook> =>
  Object.fromEntries(Object.entries(STYLE_NECKS).map(([suffix, neck]) => [`${name}${suffix}`, catsuitLook({ colour, neck })]));

/** THE COLOURED CATSUITS: gold, black and silver, each in the three styles. */
export const COLOUR_CATSUIT_LOOKS: Readonly<Record<string, HeroineLook>> = {
  ...inEveryStyle('catsuitGold', C.gold),
  ...inEveryStyle('catsuitBlack', C.black),
  ...inEveryStyle('catsuitSilver', C.silver),
};

/**
 * TWO TONES: each is one of the colours above, baked once per style, with its top half recoloured by the game
 * (looks/bakedAs.ts and gear.ts `clothShine.twoTone`): the same catsuit, the same files, in the same three styles.
 *   catsuitBlackGold    black above, gold below (the gold catsuit's bakes)
 *   catsuitGoldBlack    gold above, black below (the black catsuit's)
 *   catsuitBlackSilver  black above, silver below (the silver catsuit's)
 */
export const TWO_TONE_LOOKS: Readonly<Record<string, HeroineLook>> = Object.fromEntries(
  (['', 'Low', 'High'] as const).flatMap((suffix) => [
    [`catsuitBlackGold${suffix}`, COLOUR_CATSUIT_LOOKS[`catsuitGold${suffix}`]],
    [`catsuitGoldBlack${suffix}`, COLOUR_CATSUIT_LOOKS[`catsuitBlack${suffix}`]],
    [`catsuitBlackSilver${suffix}`, COLOUR_CATSUIT_LOOKS[`catsuitSilver${suffix}`]],
  ]),
);
