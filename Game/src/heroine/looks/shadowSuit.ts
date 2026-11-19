// ============================================================================
// shadowSuit.ts -- BLAZE in the SHADOW OPERATIVE CATSUIT: look 1 of Joshua's
// outfit board (docs/reference/outfits/04-four-looks-board.png, 2026-11-19:
// "ChatGPT actually recommended starting with one as it's basically a whole
// body paint (catsuit) and could even paint the collar").
//
// HER BODY, HEAD AND CATSUIT ARE JOSHUA'S OWN (his Character Builder export of
// 2026-11-19, 12:59: "I have her in a black catsuit already from CCBS... all you
// need to do is do the collar and paint stripes on it"): copied here exactly as
// saved -- her braid, eye and lip colours and face, and her body.
//
//   Paint layer 1, THE CATSUIT: his fabric exactly (the builder's ATHLETIC knit,
//     its Black, his detail settings), its shape painted by code from her ankles
//     to her wrists and neck, so it covers her cleavage too (`paintSuit`).
//
//   Paint layer 2, THE GLOSSY BLACK TRIM (painted by code: paintMask.ts), in
//     the builder's smooth FLAT black, which the game makes shine (looks/gear.ts
//     `clothShine`; the knit suit gets half the shine): a border each side of
//     every red stripe (Joshua: "plain black, sheen black, and red in the
//     middle"), fingerless gloves from her wrist to the roots of her fingers,
//     and a mock collar up her neck. (The builder has three paint layers.)
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
import { stripe, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';

/** Joshua's export of Blaze in her black catsuit (2026-11-19), exactly as saved. */
export const EXPORT_BODY = {
    "model": "v2-body",
    "bump": 10,
    "shape": "{\"version\":1,\"shape\":{\"bellyLower\":5,\"navel\":20,\"babyFloat\":200,\"breastSize\":5,\"milk\":50,\"breastBounce\":200,\"walkBob\":200,\"walkSway\":200,\"legGap\":1.5}}",
    "refine": false,
    "random": {
      "rules": {},
      "groups": []
    },
    "pregnancy": {
      "pregnant": true,
      "week": null,
      "weekAtBump": null,
      "firstWeekBump": 10,
      "deliveryBump": 150,
      "deliveryWeek": 42,
      "afterBump": 30,
      "births": null
    },
    "head": {
      "hair": {
        "style": "braid",
        "length": 1,
        "colour": "#1c1b1d"
      },
      "eyes": {
        "colour": "#7fa2c6"
      },
      "brows": {
        "colour": null,
        "amount": 1
      },
      "lips": {
        "colour": "#b81c28",
        "amount": 0.55
      },
      "lashes": 1,
      "face": {
        "cheekFullness": 0.7,
        "jawCorner": -0.6,
        "chinForward": -0.3,
        "noseBridge": 0.1,
        "noseTip": -0.28,
        "eyeSize": -0.54,
        "browHeight": 0.1,
        "cheekbones": -0.3,
        "eyeTilt": -0.6,
        "earSize": 0.02,
        "lipFullness": -1,
        "mouthWidth": -0.52,
        "noseWidth": -0.15,
        "noseLength": -0.43
      }
    }
  } as const;
export const EXPORT_SUIT_LAYER = {
        "choice": {
          "fabric": {
            "family": "athletic",
            "colour": 4
          },
          "match": true,
          "trim": null,
          "stitch": 0.5,
          "opacity": null
        },
        "detail": {
          "mode": "auto",
          "material": null,
          "override": {
            "nipple": 0.45,
            "navel": 0.8
          }
        },
        "template": {
          "id": "bodysuitFull",
          "params": {
            "riseFront": 1,
            "riseSide": 1,
            "riseBack": 1,
            "riseFrontWidth": 1,
            "legStart": 0,
            "legEnd": 1,
            "feet": false,
            "hemFront": -1,
            "hemBack": -1,
            "neckFront": 0.94,
            "neckBack": 0.97,
            "sleeve": 1,
            "topFront": null,
            "topBack": null,
            "topSide": null,
            "strap": 0,
            "strapIn": 0,
            "armhole": null,
            "neckStyle": "crew",
            "legCut": null,
            "length": null
          }
        },
        "mask": ""
      } as const;

/** THE SUIT'S COLOURS (GAME TUNING). */
export const SHADOW_SUIT_COLOURS = Object.freeze({
  /** the catsuit: Joshua's (the builder's athletic knit, its Black: colour 4), as a hex for the 3D gear */
  suit: '#101016',
  /** the stripes: neon red (Joshua, 2026-11-19: "a brighter neon red: FF0000") */
  red: '#ff0000',
});

/** A colour in one of the builder's fabric families: its first colour (White) dyed with a tint, as the builder saves one. */
const dyed = (family: 'flat' | 'athletic', tint: string) => ({ family, colour: 0, tint }) as const;

/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A path through (along, turn) points, eased between them: for a stripe that curves round her as it goes. */
const through = (given: readonly (readonly [number, number])[]) => {
  // (the points in order up the `along` measure, whichever way they were written: the trunk's stripes are written from
  //  the top of her shoulder down, and taken as written the path never curved and jumped at its top end, where it then
  //  smeared sideways into a ragged band. Joshua, 2026-11-19: "fix the jagged edges")
  const points = [...given].sort((a, b) => a[0] - b[0]);
  return (along: number): number => path(points, along);
};
const path = (points: readonly (readonly [number, number])[], along: number): number => {
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

/** Down her side: from the top of her shoulder, beside her breast (not over it), down her side to the front of her hip. */
// (Joshua, 2026-11-19, from his Look 1 picture: "the stripes are mainly to the side, but yours crosses over the
//  breasts some". It ran in to 46 degrees at her chest; now it keeps out at her sides past her bust and waist, then
//  eases toward the front of her hip to meet her leg's stripe)
const FRONT_STRIPE = through([[1.0, 82], [0.85, 78], [0.68, 76], [0.45, 74], [0.15, 70], [-0.2, 62]]);
/** Down her leg: from her hip, down the front of her thigh, over her knee, down the front of her shin. */
const LEG_STRIPE = through([[-0.2, 62], [0.2, 40], [0.47, 22], [0.7, 14], [0.95, 10]]);
/** Down her back: from her shoulder blade down the side of her back to her waist. */
const BACK_STRIPE = through([[0.95, 125], [0.6, 115], [0.25, 104], [-0.2, 96]]);
/** Down her arm: the outside of her upper arm and forearm. */
const ARM_STRIPE = through([[0, 75], [0.5, 85], [1, 80]]);

/**
 * Where the trunk's stripes end, up near the tops of her shoulders, with rounded ends: short of the base of her neck,
 * where her trunk's measure stops (run into it, they ended in a ragged edge along her shoulders' tops).
 */
const STRIPE_TOP = Object.freeze({ front: 0.92, back: 0.88 });

/**
 * How far inside the red stripes a point is, with each stripe made `wider` (leg lengths) on each side: 0 the stripes
 * themselves (paint layer 3), more for the glossy black borders round them (paint layer 2).
 */
function stripes(surface: PaintSurface, v: number, place: LegPlace, wider: number): number {
  let best = -1;
  if (surface.trunkPlace(v, place)) {
    best = Math.max(best,
      stripe(place, { from: -0.2, to: STRIPE_TOP.front, half: 0.018 + wider, path: FRONT_STRIPE }),
      stripe(place, { from: -0.2, to: STRIPE_TOP.back, half: 0.016 + wider, path: BACK_STRIPE }));
  }
  if (surface.legPlace(v, place)) best = Math.max(best, stripe(place, { from: -0.2, to: 0.95, half: 0.016 + wider, path: LEG_STRIPE }));
  if (surface.armPlace(v, place) && place.along <= 0.95) best = Math.max(best, stripe(place, { from: 0.02, to: 0.92, half: 0.013 + wider, path: ARM_STRIPE }));
  return best;
}

const paintStripes: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) inside[v] = stripes(surface, v, place, 0);
  return inside;
};

// ------------------------------------------------------------------ the catsuit itself (paint layer 1)

/**
 * PAINT LAYER 1 BY CODE: all of her from her ankles to her wrists and up to the base of her neck, in Joshua's own
 * catsuit fabric. (His template, the builder's "Full bodysuit", leaves her cleavage bare for a cleavage piece that in
 * the game is smaller than the gap, and the builder has only three paint layers, the trim and the red using the other
 * two. Painted here it covers her cleavage too. Where it ends is under her boots, her gloves and her collar.)
 */
const SUIT_ENDS = Object.freeze({ ankle: 0.97, wrist: 1.02 });

const paintSuit: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    // (each how far inside the suit the point is, leg lengths: well inside except near where it ends)
    let best = -1;
    if (surface.armPlace(v, place)) best = (SUIT_ENDS.wrist - place.along) * 0.6;
    else if (surface.legPlace(v, place)) best = (SUIT_ENDS.ankle - place.along) * 0.78;
    else if (surface.trunkPlace(v, place)) best = 1;
    else if (surface.neckPlace(v, place)) best = (0.02 - place.along) * 0.35;   // (up to just over the base of her neck)
    inside[v] = best;
  }
  return inside;
};

// ------------------------------------------------------------------ the glossy black trim (paint layer 2)

/**
 * THE BORDERS (Joshua, 2026-11-19: "add a shiny black border on each side of the red strips so is more plain black,
 * sheen black, and red in the middle"): each stripe in glossy black this much wider on each side (leg lengths; 0.01 is
 * about 8 mm). The red is painted over the middle of it.
 */
const BORDER = 0.015;

/** Her hand from her wrist (1 along her arm) to the roots of her fingers: the fingerless gloves. */
const GLOVE = Object.freeze({ from: 0.97, to: 1.2 });

/**
 * THE COLLAR (Joshua, 2026-11-19, with a close-up of Look 1: "make sure you have the collar going up to her neck"): a
 * mock neck in the glossy black, from just under the base of her neck (the suit, painted by `paintSuit`, runs up
 * to it; reaching lower it showed as a black yoke on the dark gray) up her neck to about a quarter of the way to the top of her head behind, dipping a little lower in front
 * under her chin. Heights in her neck's own measure (`neckPlace`).
 */
const COLLAR = Object.freeze({ bottom: -0.04, back: 0.27, front: 0.21, chin: 0.11, chinFrom: 0.14 });

/**
 * PAINT LAYER 2, ALL IN THE GLOSSY BLACK: the stripes' borders, the fingerless gloves and the collar. (The builder has
 * three paint layers: the suit, this, the red.)
 */
const paintTrim: MaskPainter = (surface: PaintSurface): Float32Array => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    // the borders: the stripes made wider
    let best = stripes(surface, v, place, BORDER);
    // the gloves: all the way round her hand between those two places (how far inside that band, leg lengths)
    if (surface.armPlace(v, place)) best = Math.max(best, Math.min(place.along - GLOVE.from, GLOVE.to - place.along) * 0.6);
    if (surface.neckPlace(v, place)) {
      // the collar's top: highest behind, lowest at the front, rising smoothly round her sides
      const top = COLLAR.front + (COLLAR.back - COLLAR.front) * (Math.abs(place.turn) / 180);
      const inBand = Math.min(top - place.along, place.along - COLLAR.bottom) * 0.35;
      // (a point far out from her neck's line up at her jaw's height is her jaw or chin, not her neck: left bare. Lower
      //  down, far out is the top of her shoulders, which rise above the base of her neck: covered)
      best = Math.max(best, place.radius > COLLAR.chin && place.along > COLLAR.chinFrom ? -1 : inBand);
    }
    inside[v] = best;
  }
  return inside;
};

// ------------------------------------------------------------------ the look


/** How the suit shows what is under it: Joshua's own setting from his export. */
const DETAIL = EXPORT_SUIT_LAYER.detail;
/**
 * THE CATSUIT'S FABRIC: Joshua's athletic knit, but its Dark gray, darkened, and at a bigger stitch (Joshua, 2026-11-19, of
 * Look 1's picture: "almost looks like it has little holes for the type of fabric and ours is more plain... scale it
 * bigger to match... slightly more dark grey than actually black"). At his 0.5 the knit was too fine to show on her.
 */
// (Then, 2026-11-19: "that gray is slightly too light, and the black is too dark... match between the two". The knit
//  stays its Dark gray, whose stitches show; the GAME darkens it about half way to its Black: looks/gear.ts
//  `clothShine.darken`. Dyed that dark instead, by the builder's colour picker, the stitches were lost.)
const SUIT_FABRIC = Object.freeze({ colour: 3, stitch: 2 });
const SUIT_LAYER = {
  ...EXPORT_SUIT_LAYER,
  choice: { ...EXPORT_SUIT_LAYER.choice, fabric: { ...EXPORT_SUIT_LAYER.choice.fabric, colour: SUIT_FABRIC.colour }, stitch: SUIT_FABRIC.stitch },
};
/** THE GLOSSY BLACK of the trim: the builder's FLAT family (no knit), its Black. The game makes it shine (looks/gear.ts). */
const GLOSS_PICK = { fabric: { family: 'flat', colour: 4 }, match: true, trim: null, stitch: 0.5, opacity: 1 } as const;
const C = SHADOW_SUIT_COLOURS;

export const SHADOW_SUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  body: EXPORT_BODY,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
    shoes: 'none',
    detail: { nipple: null, navel: null },
    layers: [
      // PAINT LAYER 1: the catsuit: Joshua's athletic knit in its Dark gray (darkened by the game) at a bigger stitch, his detail settings, its
      // shape painted by `paintSuit`
      SUIT_LAYER,
      // PAINT LAYER 2: the glossy black trim (the stripes' borders, the gloves, the collar), painted by `paintTrim`
      { choice: GLOSS_PICK, detail: DETAIL, template: null, mask: '' },
      // PAINT LAYER 3: the red stripes, painted by `paintStripes`
      { choice: { fabric: dyed('athletic', C.red), match: true, trim: dyed('athletic', C.red), stitch: 0.5, opacity: 1 }, detail: DETAIL, template: null, mask: '' },
    ],
  },
  maskPainters: [paintSuit, paintTrim, paintStripes],
};

