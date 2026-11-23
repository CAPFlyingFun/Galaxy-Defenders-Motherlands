// ============================================================================
// casualSets.ts -- MARY'S FIRST THREE CASUAL OUTFITS (M1-M3).
//
// NOT IN THE GAME YET (Joshua, 2026-11-22: "starting with the 3 images in the first image, once I approve those, can
// move to the other's as it could be more complicated"): the catsuits of his first board come first (marySuits.ts).
// These are written and type-checked, not baked or tested; to add them: looks/index.ts, Settings' OUTFIT_CHOICES and
// their gear (looks/gear.ts `marySuitGear`), then bake.
//
// (Joshua, 2026-11-22, with ChatGPT's board "MARY - CASUAL OPTIONS", kept in
// docs/reference/outfits/mary-john-casual-options-m1-m6-j1-j6.jpg: "Focus on
// Mary's first three casual designs (M1-M3): the teal tech tee, burgundy
// explorer tank, and gray/purple zip top with matching leggings... You can
// mostly reuse the plain catsuit and paint on the colors, stripes, panels...
// For the short-sleeve and sleeveless looks, use the existing clothing
// controls where possible rather than building complicated new geometry.
// Keep the outfits lightweight for mobile, make sure they work with Mary's
// full 0-200% belly slider".)
//
// HOW EACH IS MADE. All of it is PAINT on her skin, nothing new in 3D:
//   paint layer 1  her LEGGINGS: the builder's high-rise leggings template,
//                  dark charcoal (its edges drawn by the builder, smooth);
//   paint layer 2  her TOP: the builder's own short-sleeve T-shirt or tank
//                  top template, its neck, sleeve and hem bands (the template's
//                  TRIM) in the outfit's accent colour;
//   paint layers 3-4  the outfit's PANELS AND STRIPES, painted by code
//                  (paintMask.ts): measured on her own trunk, legs and arms,
//                  so they follow her shape at any belly.
// Being paint, all three stretch with her belly from 0 to 200% exactly as her
// skin does (the fast heroine draws them baked on her skin picture; nothing
// extra is drawn in play). Her belt, holsters, pouches and low boots are the
// game's usual gear in each outfit's colours (looks/gear.ts).
//
// On JOSHUA'S PLAIN CATSUIT EXPORT's body (2026-11-23; docs/reference/
// characters/character-blaze-plain-catsuit-2026-11-23.json: the same body as
// shadowSuit.ts `EXPORT_BODY`), worn as Mary (her head and freckles:
// maryHead.ts, through looks/index.ts).
//
// Measures used below (paintMask.ts): `along` up her TRUNK (0 her hip joints,
// 1 the base of her neck), down her LEG (0 the hip joint, about 0.47 the knee,
// 1 the ankle) or ARM (0 the shoulder, 1 the wrist); `turn` degrees round her
// (0 her front, +90 her outer side, 180 her back, both sides mirrored); widths
// in leg lengths (0.01 is about 8 mm). GAME TUNING, judged against the board.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { plate, stripe, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { template } from './catsuit';
import { EXPORT_BODY } from './shadowSuit';

// ------------------------------------------------------------------ fabrics

/** A colour in one of the builder's fabric families: its first colour (White) dyed with a tint, as the builder saves one. */
const dyed = (family: 'flat' | 'athletic' | 'jersey', tint: string) => ({ family, colour: 0, tint }) as const;
/** A layer's fabric: `body` all over, `trim` its template's edging bands (neck, sleeves, hem, waistband). */
const fabric = (family: 'athletic' | 'jersey', body: string, trim: string) =>
  ({ fabric: dyed(family, body), match: false, trim: dyed(family, trim), stitch: 1, opacity: 1 }) as const;
/** How much shows through. Leggings as the catsuits (Joshua's own numbers); a top a little less (it is a looser knit). */
const LEGGINGS_DETAIL = { mode: 'auto', material: null, override: { nipple: 0.43, navel: 0.81 } } as const;
const TOP_DETAIL = { mode: 'auto', material: null, override: { nipple: 0.3, navel: 0.6 } } as const;
/** A layer painted by code: its fabric, no template, its mask made when she loads (builderRoom.ts). */
const coded = (tint: string) => ({ choice: fabric('athletic', tint, tint), detail: LEGGINGS_DETAIL, template: null, mask: '' });

// ------------------------------------------------------------------ shapes

/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A path through (along, turn) points, eased between them: a stripe that curves round her as it goes. */
const through = (given: readonly (readonly [number, number])[]) => {
  const points = [...given].sort((a, b) => a[0] - b[0]);
  return (along: number): number => {
    if (along <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      const [a0, t0] = points[k - 1], [a1, t1] = points[k];
      if (along <= a1) return t0 + (t1 - t0) * smooth(a0, a1, along);
    }
    return points[points.length - 1][1];
  };
};

/** A panel down her side, inside her top: from just over its hem up to under her arm, `half` degrees each side of 90. */
const sidePanel = (place: LegPlace, o: { from: number; to: number; half: number; centre?: number }): number =>
  plate(place, { from: o.from, to: o.to, centre: o.centre ?? 92, widthTop: o.half, widthBottom: o.half * 0.8, corner: 0.02 });

/** One painted layer from a rule for each part of her (each returns how far inside the shapes a point is; -1 nothing). */
function painter(parts: { trunk?: (p: LegPlace) => number; leg?: (p: LegPlace) => number; arm?: (p: LegPlace) => number }): MaskPainter {
  return (surface: PaintSurface): Float32Array => {
    const inside = new Float32Array(surface.count).fill(-1);
    const place: LegPlace = { along: 0, turn: 0, radius: 0 };
    for (let v = 0; v < surface.count; v++) {
      let best = -1;
      if (parts.trunk && surface.trunkPlace(v, place)) best = Math.max(best, parts.trunk(place));
      if (parts.leg && surface.legPlace(v, place)) best = Math.max(best, parts.leg(place));
      if (parts.arm && surface.armPlace(v, place)) best = Math.max(best, parts.arm(place));
      inside[v] = best;
    }
    return inside;
  };
}

/** Her top's hem (just above her crotch, the builder's painted shirts' only length) and armpits, up her trunk. */
const TOP = Object.freeze({ hem: 0.06, armpit: 0.78 });

// ------------------------------------------------------------------ the looks

/** One casual set: its leggings and top, and its code-painted layers (bottom first). */
function casualLook(o: {
  leggings: string; leggingsTrim: string;
  top: { template: string; family: 'athletic' | 'jersey'; colour: string; trim: string; change?: Record<string, unknown> };
  painted: readonly { readonly colour: string; readonly paint: MaskPainter }[];
}): HeroineLook {
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    clothes: {
      ...(BLAZE_LOOK.clothes as object),
      // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
      // (her boots are the game's: looks/gear.ts)
      shoes: 'none',
      detail: { nipple: null, navel: null },
      layers: [
        // 1. her leggings: the builder's high-rise leggings
        { choice: fabric('athletic', o.leggings, o.leggingsTrim), detail: LEGGINGS_DETAIL, template: template('leggingsHigh', {}), mask: '' },
        // 2. her top: the builder's own template, its bands in the accent colour
        { choice: fabric(o.top.family, o.top.colour, o.top.trim), detail: TOP_DETAIL, template: template(o.top.template, o.top.change ?? {}), mask: '' },
        // 3.. the panels and stripes, painted by code
        ...o.painted.map((p) => coded(p.colour)),
      ],
    },
    maskPainters: [null, null, ...o.painted.map((p) => p.paint)],
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** THE COLOURS (GAME TUNING, from the board). */
export const CASUAL_COLOURS = Object.freeze({
  /** her leggings, all three: a dark charcoal, a little lighter than the catsuits' near-black so the stripes read */
  leggings: '#24272d',
  techTee: { tee: '#1d2026', teal: '#19c2c4' },
  explorer: { tank: '#6e1d2c', tankTrim: '#4a121d', panel: '#2a0f16', stripe: '#9a9ea6' },
  zipTop: { top: '#b4b8bf', purple: '#7b2f9e', panel: '#5d6169' },
});
const C = CASUAL_COLOURS;

/**
 * M1, THE A.R.C.H. TECH TEE AND LEGGINGS: a near-black short-sleeve tee, its collar, sleeve and hem bands teal; a teal
 * panel down each side of it; on her leggings a teal stripe from her outer hip, sweeping round the front of her knee
 * and down her shin.
 */
export const MARY_TECH_TEE_LOOK: HeroineLook = casualLook({
  leggings: C.leggings, leggingsTrim: C.leggings,
  top: { template: 'teeShort', family: 'jersey', colour: C.techTee.tee, trim: C.techTee.teal },
  painted: [{
    colour: C.techTee.teal,
    paint: painter({
      trunk: (p) => sidePanel(p, { from: TOP.hem + 0.04, to: TOP.armpit - 0.03, half: 9 }),
      leg: (p) => stripe(p, { from: -0.02, to: 0.93, half: 0.011, path: through([[-0.02, 96], [0.22, 82], [0.44, 38], [0.56, 22], [0.75, 12], [0.93, 8]]) }),
    }),
  }],
});

/**
 * M2, THE EXPLORER TANK SET: a burgundy tank top (the builder's, its straps and edges a darker burgundy) with a
 * near-black burgundy panel down each side; on her leggings a light gray stripe from her outer hip, across the front
 * of her thigh, past the inside of her knee and down the inside of her shin.
 */
export const MARY_EXPLORER_TANK_LOOK: HeroineLook = casualLook({
  leggings: C.leggings, leggingsTrim: C.leggings,
  top: { template: 'tank', family: 'athletic', colour: C.explorer.tank, trim: C.explorer.tankTrim },
  painted: [
    {
      colour: C.explorer.stripe,
      paint: painter({
        leg: (p) => stripe(p, { from: -0.02, to: 0.93, half: 0.013, path: through([[-0.02, 100], [0.2, 70], [0.42, 10], [0.55, -25], [0.75, -40], [0.93, -45]]) }),
      }),
    },
    {
      colour: C.explorer.panel,
      // (the tank's sides only: under its armholes, which are lower than a tee's)
      paint: painter({ trunk: (p) => sidePanel(p, { from: TOP.hem + 0.04, to: 0.66, half: 13 }) }),
    },
  ],
});

/**
 * M3, THE ZIP TOP AND LEGGINGS: a light gray short-sleeve top with a mock collar, its collar, sleeve and hem bands
 * purple, a purple panel down each side and a purple zip down the front from the collar; on her leggings a mid-gray
 * panel down the front of each thigh and a purple stripe down the outside of each leg.
 */
export const MARY_ZIP_TOP_LOOK: HeroineLook = casualLook({
  leggings: C.leggings, leggingsTrim: C.leggings,
  // (the builder's T-shirt with its crew neck taken up her neck into a low mock collar: its NECKLINE dial, 1.04)
  top: { template: 'teeShort', family: 'jersey', colour: C.zipTop.top, trim: C.zipTop.purple, change: { neckFront: 1.04 } },
  painted: [
    {
      colour: C.zipTop.panel,
      paint: painter({ leg: (p) => plate(p, { from: 0.04, to: 0.4, centre: 20, widthTop: 30, widthBottom: 22, corner: 0.03 }) }),
    },
    {
      colour: C.zipTop.purple,
      paint: painter({
        trunk: (p) => Math.max(
          sidePanel(p, { from: TOP.hem + 0.04, to: TOP.armpit - 0.03, half: 10 }),
          // the zip: a narrow strip down her front from the collar, about 12 cm
          stripe(p, { from: 0.8, to: 1.02, half: 0.006, path: () => 0 })),
        leg: (p) => stripe(p, { from: -0.02, to: 0.93, half: 0.011, path: through([[-0.02, 92], [0.47, 88], [0.93, 84]]) }),
      }),
    },
  ],
});
