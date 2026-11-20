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

/** THE GOLD CATSUIT: shiny gold, the keyhole and turtleneck. */
export const GOLD_CATSUIT_LOOK: HeroineLook = catsuitLook({ colour: C.gold, neck: NECKLINES.keyhole });
/** THE BLACK CATSUIT: glossy black, the high neck. */
export const BLACK_CATSUIT_LOOK: HeroineLook = catsuitLook({ colour: C.black, neck: NECKLINES.high });
/** THE SILVER CATSUIT: silver, a turtleneck and the builder's diamond cutout. */
export const SILVER_CATSUIT_LOOK: HeroineLook = catsuitLook({ colour: C.silver, neck: NECKLINES.diamond });

/**
 * TWO TONES: each is one of the three above, baked once, with its top half recoloured by the game (gear.ts
 * `bakedAs` and `clothShine.twoTone`): the same catsuit, the same files.
 *   catsuitBlackGold    black above, gold below (the gold catsuit's keyhole)
 *   catsuitGoldBlack    gold above, black below (the black catsuit's high neck)
 *   catsuitBlackSilver  black above, silver below (the silver catsuit's diamond)
 */
export const TWO_TONE_LOOKS: Readonly<Record<string, HeroineLook>> = {
  catsuitBlackGold: GOLD_CATSUIT_LOOK,
  catsuitGoldBlack: BLACK_CATSUIT_LOOK,
  catsuitBlackSilver: SILVER_CATSUIT_LOOK,
};
