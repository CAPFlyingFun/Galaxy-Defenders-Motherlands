// ============================================================================
// casualSets.ts -- MARY'S SIX CASUAL OUTFITS (M1-M6), JOSHUA'S OWN.
//
// (Joshua, 2026-11-23, after my first three -- the builder's tops tucked into
// low-rise leggings, with the board's piping and stripes painted on: "mine I
// believe are better then your when it comes to the shirt… Here are the 6
// close outfits (M1-M6) based on what's in CCBS without any extra trim and
// stuff"; "It all works up to 200% belly, I tested in CCBS". His export:
// docs/reference/characters/character-mary-casual-m1-m6-2026-11-23.json, made
// after ChatGPT's board "MARY - CASUAL OPTIONS",
// docs/reference/outfits/mary-john-casual-options-m1-m6-j1-j6.jpg.)
//
// EACH IS HIS SAVE EXACTLY: the builder's own leggings or shorts and its own
// top, his fabrics, colours and dials, the builder's sneakers. Plain, as he
// made them:
//   M1  TECH TEE & LEGGINGS   a dark short-sleeve T-shirt, blue bands, over
//                             over-belly leggings
//   M2  EXPLORER TANK SET     a burgundy tank top over over-belly leggings
//   M3  ZIP TOP & LEGGINGS    a light gray HENLEY (its placket for the board's
//                             zip), purple bands, over-belly leggings with
//                             purple ankle bands
//   M4  UTILITY ROMPER        a dark POLO, orange bands, over-belly SHORTS
//                             with orange hems
//   M5  CASUAL JACKET SET     a dark 3/4-sleeve CROP TEE, white bands, her
//                             belly bare over under-belly leggings
//   M6  FIELD CASUAL          an olive 3/4-sleeve crop tee, her belly bare over
//                             under-belly leggings
//
// TWO THINGS THE GAME ADDS, so they look as they do in the builder:
//   * HIS HIGH-NECKED TOPS (M1, M4, M5, M6) have the gap under their neck at
//     her cleavage FILLED in the top's own fabric (catsuit.ts
//     `fillCleavage`), and the builder's strip across her cleavage left out
//     (`noCleavageBridge`): baked, that strip drew a hole in the tee at her
//     chest (my first try, 2026-11-23). The tank's and henley's necks are low
//     enough that the builder lays no strip.
//   * THE SHIRTS' HEM BAND: the builder hangs a painted shirt's smooth, level
//     hem band round her (its drape, tunicDrape.ts); the bake keeps that band
//     and colours it from the shirt (capturePieces.ts), and the game draws it
//     over her skin (extraPieces.ts).
//
// On JOSHUA'S PLAIN CATSUIT EXPORT's body (his casual saves carry none: the
// same body as her catsuits, shadowSuit.ts `EXPORT_BODY`), worn as Mary (her
// head: maryHead.ts, through looks/index.ts). Her belt, holsters and guns are
// the game's in each outfit's trim colour (looks/gear.ts `maryCasualGear`).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { fillCleavage } from './catsuit';
import { EXPORT_BODY } from './shadowSuit';

// (each the `clothes` of his export, exactly as saved: generated from the JSON, thumbnails left out)
export const CASUAL_EXPORTS = {
  /** Blaze - M1, saved 2026-11-23T12:38:11.945Z */
  M1: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":true,"trim":null,"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsFull","params":{"riseFront":0.48,"riseSide":0.4,"riseBack":0.4,"riseFrontWidth":1,"legStart":0,"legEnd":1,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":4},"match":false,"trim":{"family":"jersey","colour":14},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"teeShort","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":-0.1,"hemBack":-0.1,"neckFront":0.966,"neckBack":0.97,"sleeve":0.32,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":0}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
  /** Blaze - M2, saved 2026-11-23T12:39:34.510Z */
  M2: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":true,"trim":null,"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsFull","params":{"riseFront":0.48,"riseSide":0.4,"riseBack":0.4,"riseFrontWidth":1,"legStart":0,"legEnd":1,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":0,"tint":"#551029"},"match":false,"trim":{"family":"jersey","colour":4},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"tank","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":-0.1,"hemBack":-0.1,"neckFront":0.79,"neckBack":0.9,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0.55,"strapIn":1,"armhole":0.8,"neckStyle":"crew","legCut":null,"length":0,"top":"tank"}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
  /** Blaze - M3, saved 2026-11-23T12:43:42.916Z */
  M3: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":false,"trim":{"family":"athletic","colour":15},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsFull","params":{"riseFront":0.48,"riseSide":0.4,"riseBack":0.4,"riseFrontWidth":1,"legStart":0,"legEnd":0.91,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":1},"match":false,"trim":{"family":"jersey","colour":15},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"henley","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":-0.1,"hemBack":-0.1,"neckFront":0.76,"neckBack":0.97,"sleeve":0.32,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":0,"detail":"henley"}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
  /** Blaze - M4, saved 2026-11-23T12:46:14.593Z */
  M4: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":false,"trim":{"family":"athletic","colour":9},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsFull","params":{"riseFront":0.48,"riseSide":0.4,"riseBack":0.4,"riseFrontWidth":1,"legStart":0,"legEnd":0.23,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null,"lowBand":{"waist":0.0178}}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":4},"match":false,"trim":{"family":"jersey","colour":9},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"polo","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":-0.1,"hemBack":-0.1,"neckFront":0.966,"neckBack":0.97,"sleeve":0.3,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":0,"band":{"sleeve":0.02},"detail":"polo"}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
  /** Blaze - M5, saved 2026-11-23T12:51:52.581Z */
  M5: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":true,"trim":{"family":"athletic","colour":14},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsUnder","params":{"riseFront":-0.02,"riseSide":0.155,"riseBack":0.33,"riseFrontWidth":1,"legStart":0,"legEnd":1,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null,"lowBand":{"waist":0.015},"lowBowl":0.7}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":4},"match":false,"trim":{"family":"jersey","colour":0},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"cropTee","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":0.29,"hemBack":0.28999999999999937,"neckFront":0.92,"neckBack":0.97,"sleeve":0.62,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null,"top":"cropTee"}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
  /** Blaze - M6, saved 2026-11-23T12:54:45.338Z */
  M6: {"outfit":"painted ringer tee + leggings","shirtLength":0,"layers":[{"choice":{"fabric":{"family":"athletic","colour":4},"match":true,"trim":{"family":"athletic","colour":14},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"leggingsUnder","params":{"riseFront":-0.04,"riseSide":0.09499999999999997,"riseBack":0.27,"riseFrontWidth":1,"legStart":0,"legEnd":1,"feet":false,"hemFront":null,"hemBack":null,"neckFront":null,"neckBack":null,"sleeve":-1,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null,"lowBand":{"waist":0.015},"lowBowl":0.7}},"mask":""},{"choice":{"fabric":{"family":"athletic","colour":0,"tint":"#2e2e00"},"match":true,"trim":{"family":"jersey","colour":0},"stitch":1,"opacity":null},"detail":{"mode":"auto","material":null,"override":{"nipple":0.45,"navel":0.8}},"template":{"id":"cropTee","params":{"riseFront":null,"riseSide":null,"riseBack":null,"riseFrontWidth":1,"legStart":0,"legEnd":0,"feet":false,"hemFront":0.29,"hemBack":0.28999999999999937,"neckFront":0.91,"neckBack":0.97,"sleeve":0.62,"topFront":null,"topBack":null,"topSide":null,"strap":0,"strapIn":0,"armhole":null,"neckStyle":"crew","legCut":null,"length":null,"top":"cropTee"}},"mask":""},null,null,null,null],"garments":{},"detail":{"nipple":null,"navel":null},"shoes":"sneakers"},
} as const;

type Clothes = (typeof CASUAL_EXPORTS)[keyof typeof CASUAL_EXPORTS];

/**
 * One of his outfits as a look. `neck`: his top's neckline when it is high enough for the builder to lay its strip
 * across her cleavage (his top is the second layer): the gap is filled in the top's own fabric instead.
 */
function casualLook(clothes: Clothes, neck: number | null): HeroineLook {
  const layers = clothes.layers.filter((layer) => layer !== null);
  const top = layers[1];
  const fill = neck !== null && top ? [{ choice: top.choice, detail: top.detail, template: null, mask: '' }] : [];
  const all = [...layers, ...fill];
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    // (his clothes as saved, the fill after his two layers, the rest of the builder's six layers empty)
    clothes: { ...clothes, layers: [...all, ...Array.from({ length: 6 - all.length }, () => null)] },
    ...(fill.length ? { maskPainters: [null, null, fillCleavage(neck as number, 0.55)], noCleavageBridge: true } : {}),
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** M1 TECH TEE & LEGGINGS (his crew neck: the builder's drawn crew, 1.8 cm under the base of her neck). */
export const MARY_CASUAL_TEE_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M1, 0.966);
/** M2 EXPLORER TANK SET. */
export const MARY_CASUAL_TANK_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M2, null);
/** M3 ZIP TOP & LEGGINGS (the henley). */
export const MARY_CASUAL_HENLEY_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M3, null);
/** M4 UTILITY ROMPER (the polo and shorts). */
export const MARY_CASUAL_POLO_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M4, 0.966);
/** M5 CASUAL JACKET SET (the dark crop tee). */
export const MARY_CASUAL_CROP_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M5, 0.92);
/** M6 FIELD CASUAL (the olive crop tee). */
export const MARY_CASUAL_FIELD_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M6, 0.91);
