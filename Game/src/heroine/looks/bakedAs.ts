// ============================================================================
// bakedAs.ts -- LOOKS THAT WEAR ANOTHER LOOK'S BAKE: a look named here is
// drawn from the named look's baked files (public/heroines/<that>/), with its
// own gear and colours from looks/gear.ts. So a two-tone catsuit (Joshua,
// 2026-11-20: "top half... one tone, and below another, but still the same
// outfit") is one bake recoloured by the game, not a bake of its own.
// Kept apart (no imports) so the baked-look loader can read it.
// ============================================================================

/** A look's name -> the look whose baked files it is drawn from. */
export const BAKED_AS: Readonly<Record<string, string>> = {
  /** black above the bottom of her bust and down her arms, gold below (the gold catsuit's keyhole) */
  catsuitBlackGold: 'catsuitGold',
  /** gold above, black below (the black catsuit's high neck) */
  catsuitGoldBlack: 'catsuitBlack',
  /** black above, silver below (the silver catsuit's diamond) */
  catsuitBlackSilver: 'catsuitSilver',
};
