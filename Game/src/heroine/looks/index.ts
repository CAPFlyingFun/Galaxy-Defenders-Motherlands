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
import { COLOUR_CATSUIT_LOOKS, TWO_TONE_LOOKS } from './catsuitStyles';
import { JOHN_LOOK } from './john';
import { MARY_EXPLORER_SUIT_LOOK, MARY_RESEARCH_SUIT_LOOK, MARY_STEALTH_SUIT_LOOK } from './marySuits';
import { MARY_CASUAL_CROP_LOOK, MARY_CASUAL_FIELD_LOOK, MARY_CASUAL_HENLEY_LOOK, MARY_CASUAL_POLO_LOOK, MARY_CASUAL_TANK_LOOK, MARY_CASUAL_TEE_LOOK } from './casualSets';
import { asMary } from './maryHead';

/**
 * Every look as saved, before Mary's head goes on (below). The exports keep the heads they were saved with; the game
 * uses LOOKS.
 */
const SAVED_LOOKS: Readonly<Record<string, HeroineLook>> = {
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
  /** The same catsuit in more colours, and two tones (catsuitStyles.ts). */
  ...COLOUR_CATSUIT_LOOKS,
  ...TWO_TONE_LOOKS,
  /** Mary's catsuits M1-M3 (marySuits.ts; Joshua's board of Mary's and John's suits, 2026-11-22). */
  maryResearchSuit: MARY_RESEARCH_SUIT_LOOK,
  maryExplorerSuit: MARY_EXPLORER_SUIT_LOOK,
  maryStealthSuit: MARY_STEALTH_SUIT_LOOK,
  // MARY'S CASUAL OUTFITS (casualSets.ts; his own six, M1-M6)
  maryCasualTee: MARY_CASUAL_TEE_LOOK,
  maryCasualTank: MARY_CASUAL_TANK_LOOK,
  maryCasualHenley: MARY_CASUAL_HENLEY_LOOK,
  maryCasualPolo: MARY_CASUAL_POLO_LOOK,
  maryCasualCrop: MARY_CASUAL_CROP_LOOK,
  maryCasualField: MARY_CASUAL_FIELD_LOOK,
  /** John, Blaze's husband, as Joshua saved him (john.ts): the builder's male body. */
  john: JOHN_LOOK,
};

/**
 * THE LOOKS THE GAME USES: every look on her body worn by MARY "BLAZE" FISHER, with her one head and her freckles
 * (maryHead.ts; Joshua, 2026-11-22). The bake, the game and her hidden live body all read these.
 */
export const LOOKS: Readonly<Record<string, HeroineLook>> = Object.fromEntries(
  Object.entries(SAVED_LOOKS).map(([key, look]) => [key, asMary(look)]),
);

/** The look the game's heroine wears when the address does not name one. */
export const DEFAULT_LOOK = 'blazeSuit';

/** The look's key for what the address asked (`?look=`): a known name, or the default. */
export function lookKey(asked: string | null): string {
  return asked && asked in LOOKS ? asked : DEFAULT_LOOK;
}
