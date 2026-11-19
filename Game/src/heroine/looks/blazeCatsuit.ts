// ============================================================================
// blazeCatsuit.ts -- BLAZE EXACTLY AS JOSHUA SAVED HER in his black catsuit
// (Character Builder export, 2026-11-19 12:59), nothing added: no stripes, no
// collar, no gloves, no shine. For comparing with the Shadow Operative catsuit
// built on it (shadowSuit.ts), and for seeing whether the builder's own black
// still reads against the game's dark city (Joshua, 2026-11-19: "see if it's
// still see-able or disappears").
//
// Her gear (looks/gear.ts) is the catsuit's belt and guns, so the two looks
// differ only in the suit's paint.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { BLAZE_LOOK } from './blaze';
import { EXPORT_BODY, EXPORT_SUIT_LAYER } from './shadowSuit';

export const BLAZE_CATSUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  // her body and head, exactly as exported (the same object the Shadow Operative catsuit uses)
  body: EXPORT_BODY,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
    shoes: 'sneakers',
    detail: { nipple: null, navel: null },
    // his one paint layer, as he saved it; the other two empty, as in his export
    layers: [EXPORT_SUIT_LAYER, null, null],
  },
};
