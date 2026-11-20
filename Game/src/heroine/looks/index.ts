// ============================================================================
// looks/index.ts -- every saved look the game knows, by the name used in the
// address (?look=...) and for a baked look's folder (public/heroines/<name>/).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { BLAZE_LOOK } from './blaze';
import { BLAZE_SUIT_LOOK } from './blazeSuit';
import { GRAY_SUIT_LOOK } from './graySuit';
import { BLAZE_PINK_LOOK } from './blazePink';
import { SHADOW_SUIT_LOOK } from './shadowSuit';
import { BLAZE_CATSUIT_LOOK } from './blazeCatsuit';
import { SPACE_HEROINE_LOOK } from './spaceHeroine';
import { BRONZE_SUIT_HIGH_LOOK, BRONZE_SUIT_LOOK, BRONZE_SUIT_LOW_LOOK } from './bronzeSuit';

export const LOOKS: Readonly<Record<string, HeroineLook>> = {
  /** Blaze in pink and black: the game's Blaze (blazeSuit.ts). */
  blazeSuit: BLAZE_SUIT_LOOK,
  /** Blaze exactly as Joshua exported her from the Character Room: the all-pink two-piece (blaze.ts). */
  blaze: BLAZE_LOOK,
  /** Blaze in the gray and red suit: Joshua's outfit design 2 (graySuit.ts). Not the default until he approves it. */
  graySuit: GRAY_SUIT_LOOK,
  /** Blaze exactly as Joshua saved her on 2026-11-19: all pink, athletic fabric, short leggings (blazePink.ts). To try. */
  blazePink: BLAZE_PINK_LOOK,
  /** Blaze in the Shadow Operative catsuit: look 1 of Joshua's outfit board (shadowSuit.ts). */
  shadowSuit: SHADOW_SUIT_LOOK,
  /** Blaze exactly as Joshua saved her in his plain black catsuit (blazeCatsuit.ts): the catsuit's base, to compare. */
  blazeCatsuit: BLAZE_CATSUIT_LOOK,
  /** Blaze as the Anime Space Heroine: look 2 of Joshua's outfit board (spaceHeroine.ts). */
  spaceHeroine: SPACE_HEROINE_LOOK,
  /** Blaze in the bronze catsuit: one of Joshua's catsuit styles (bronzeSuit.ts). */
  bronzeSuit: BRONZE_SUIT_LOOK,
  /** Joshua's own low neck and high neck on the builder's template (bronzeSuit.ts). */
  bronzeSuitLow: BRONZE_SUIT_LOW_LOOK,
  bronzeSuitHigh: BRONZE_SUIT_HIGH_LOOK,
};

/** The look the game's heroine wears when the address does not name one. */
export const DEFAULT_LOOK = 'blazeSuit';

/** The look's key for what the address asked (`?look=`): a known name, or the default. */
export function lookKey(asked: string | null): string {
  return asked && asked in LOOKS ? asked : DEFAULT_LOOK;
}
