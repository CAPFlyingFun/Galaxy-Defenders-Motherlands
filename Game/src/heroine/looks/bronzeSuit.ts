// ============================================================================
// bronzeSuit.ts -- BLAZE in THE BRONZE CATSUIT: one of Joshua's catsuit
// STYLES (2026-11-20: "one piece catsuits... just different variations of
// looks as styles are better for the theme"; reference
// docs/reference/outfits/looks5-6-catsuit-styles-green-gold-and-bronze.jpg,
// the one on the right: "do the bronze one first, then the green one").
//
// Built on HIS OWN CATSUIT EXPORT (his Blaze, her braid and face, as Look 1:
// shadowSuit.ts `EXPORT_BODY`), all three paint layers by code:
//
// TWO VERSIONS (Joshua's ask): `bronzeSuit`, the keyhole over her chest with a
// band up her neck; `bronzeSuitLow`, a low sweetheart line and her neck bare.
//
//   Paint layer 1, THE CATSUIT: her from her ankles to her
//     wrists and up her neck in a high band, in a GLOSSY BRONZE, but bare over
//     her upper chest: a SWEETHEART neckline curving over the top of each breast
//     and dipping between them, up to the band round her neck. (Painted by code,
//     not from the builder's bodysuit template, so it can be open there.)
//   Paint layer 2, THE SEAMS: thin lines in a darker bronze: the
//     edge of the neckline and of the neck band, the underside of her bust, and
//     a seam down each side from her bust to her hip, as in his picture.
//   Paint layer 3, THE CUPS: a lighter, brighter bronze over her
//     bust, where his picture catches the light.
//
// The game makes it all shine (looks/gear.ts `clothShine`: smooth, glossy).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import type { LegPlace, MaskPainter, PaintSurface } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { EXPORT_BODY } from './shadowSuit';

/** THE COLOURS (GAME TUNING): from his picture. */
export const BRONZE_SUIT_COLOURS = Object.freeze({
  /** the catsuit: a warm copper bronze */
  bronze: '#84461f',
  /** the seams: the same, darker */
  seam: '#3c1f0c',
  /** the cups: lighter, catching the light */
  cups: '#9a5428',
});

/** A colour as the builder saves one: its smooth Flat family's White (colour 0) dyed with a tint. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
const RADIANS = Math.PI / 180;
/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A value eased through (position, value) points. */
const through = (given: readonly (readonly [number, number])[]) => {
  const points = [...given].sort((a, b) => a[0] - b[0]);
  return (x: number): number => {
    if (x <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      const [a0, v0] = points[k - 1], [a1, v1] = points[k];
      if (x <= a1) return v0 + (v1 - v0) * smooth(a0, a1, x);
    }
    return points[points.length - 1][1];
  };
};

// ------------------------------------------------------------------ the shapes
// (on her trunk: `along` 0 at her hip joints, 1 at the base of her neck; her waist about 0.33, her bust's underside about
//  0.55; `turn` round her in degrees, 0 her front's middle, 90 her side, 180 her back, both sides alike)

/**
 * THE SWEETHEART NECKLINE: by how far round her (degrees), how low the suit's top edge comes on her chest: over the top
 * of each breast (her bust reaches about 0.85 up her trunk), dipping between them in the middle, and rising to her shoulders by
 * about 50 degrees round, where the suit covers her to the base of her neck.
 */
const NECKLINE = through([[0, 0.73], [8, 0.77], [20, 0.81], [34, 0.85], [46, 0.93], [54, 1.05]]);

/**
 * VERSION B, THE LOW SWEETHEART (Joshua, 2026-11-20: "Maybe try two versions for the neckline, the cutout like this
 * one, and the other just lower it down to about the lowest without the top part to look like reference image... can
 * always add a collar piece after on top"): across the tops of her cups, rising round her sides to cover her
 * shoulders, and no band up her neck: her upper chest and neck bare, as in his picture.
 */
const NECKLINE_LOW = through([[0, 0.73], [8, 0.77], [20, 0.8], [36, 0.83], [50, 0.89], [62, 0.97], [72, 1.05]]);

/** THE NECK BAND: up her neck from its base (her neck's own measure: 0 its base), a little lower under her chin. */
const BAND = Object.freeze({ back: 0.22, front: 0.16, chin: 0.11, chinFrom: 0.13 });

/** Where the suit ends on her legs and arms (her ankles; her wrists: his picture's hands are bare). */
const SUIT_ENDS = Object.freeze({ ankle: 0.97, wrist: 1.0 });

/** THE SIDE SEAMS: their place round her (degrees) at each height, from under her bust curving to her hip. */
const SIDE_SEAM = through([[0.55, 52], [0.42, 62], [0.3, 66], [0.15, 62], [0.0, 56]]);
const SIDE_SEAM_SPAN = Object.freeze({ from: 0.0, to: 0.55 });
/** THE UNDERSIDE OF HER BUST: the seam's height by how far round her (degrees). */
const UNDER_BUST = through([[0, 0.6], [12, 0.56], [30, 0.53], [52, 0.55]]);
const UNDER_BUST_TO = 52;

/** How wide a seam is: its half width (leg lengths, about 2.5 mm each side). */
const SEAM = 0.0032;

interface Measured { suit: number; neckEdge: number; band: number; seams: number; cups: number }

/** One point, measured once for all three layers (leg lengths: how far inside each shape; minus outside). */
function measure(surface: PaintSurface, v: number, place: LegPlace, out: Measured, low: boolean): Measured {
  out.suit = -1; out.neckEdge = -1; out.band = -1; out.seams = -1; out.cups = -1;
  // (her TRUNK first: the top of her chest by her collarbones is also counted as her shoulders, and measured as an arm
  //  it was always covered, whatever the neckline said)
  if (surface.trunkPlace(v, place)) {
    const turn = Math.abs(place.turn), r = Math.max(0.05, place.radius);
    // the neckline: below it the suit; above it her chest is bare
    const below = ((low ? NECKLINE_LOW : NECKLINE)(turn) - place.along) * 0.8;
    out.suit = Math.min(1, below);
    out.neckEdge = below;
    // the seams: down each side, and under her bust
    const at = Math.min(SIDE_SEAM_SPAN.to, Math.max(SIDE_SEAM_SPAN.from, place.along));
    const side = Math.hypot((turn - SIDE_SEAM(at)) * RADIANS * r, place.along - at);
    const under = turn <= UNDER_BUST_TO ? Math.abs(place.along - UNDER_BUST(turn)) : Math.hypot(place.along - UNDER_BUST(UNDER_BUST_TO), (turn - UNDER_BUST_TO) * RADIANS * r);
    out.seams = SEAM - Math.min(side, under);
    // the cups: between the underside of her bust and the neckline, in front of the side seams
    out.cups = Math.min((place.along - UNDER_BUST(Math.min(turn, UNDER_BUST_TO))) * 0.8, below, (SIDE_SEAM(0.55) - turn) * RADIANS * r);
    return out;
  }
  if (surface.armPlace(v, place)) { out.suit = (SUIT_ENDS.wrist - place.along) * 0.6; return out; }
  if (surface.legPlace(v, place)) { out.suit = (SUIT_ENDS.ankle - place.along) * 0.78; return out; }
  if (!low && surface.neckPlace(v, place)) {
    // the band up her neck: highest behind, lower in front; her jaw and chin left bare
    const top = BAND.front + (BAND.back - BAND.front) * (Math.abs(place.turn) / 180);
    const inBand = (top - place.along) * 0.35;
    out.band = place.radius > BAND.chin && place.along > BAND.chinFrom ? -1 : inBand;
    out.suit = out.band;
  }
  return out;
}

const painter = (pick: (m: Measured) => number, low: boolean): MaskPainter => (surface) => {
  const inside = new Float32Array(surface.count);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 }, m: Measured = { suit: 0, neckEdge: 0, band: 0, seams: 0, cups: 0 };
  for (let v = 0; v < surface.count; v++) inside[v] = pick(measure(surface, v, place, m, low));
  return inside;
};

/** The three paint layers, for either neckline: the catsuit; its seams (only on the suit), the neckline's edge and
 *  the neck band's top edge; the brighter cups, a seam's width inside their edges. */
const painters = (low: boolean): MaskPainter[] => [
  painter((m) => m.suit, low),
  painter((m) => Math.max(Math.min(m.seams, m.suit), SEAM * 1.2 - Math.abs(m.neckEdge - SEAM * 1.2), m.band > -0.02 ? SEAM - Math.abs(m.band - SEAM) : -1), low),
  painter((m) => m.cups - SEAM * 2.5, low),
];

// ------------------------------------------------------------------ the look

/** How much shows through: Look 1's (Joshua's own numbers for his catsuit). */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.43, navel: 0.81 } } as const;
const C = BRONZE_SUIT_COLOURS;
const pick = (tint: string) => ({ fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 }) as const;

export const BRONZE_SUIT_LOOK: HeroineLook = {
  name: 'Blaze',
  body: EXPORT_BODY,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
    shoes: 'none',
    detail: { nipple: null, navel: null },
    layers: [
      { choice: pick(C.bronze), detail: DETAIL, template: null, mask: '' },
      { choice: pick(C.seam), detail: DETAIL, template: null, mask: '' },
      { choice: pick(C.cups), detail: DETAIL, template: null, mask: '' },
    ],
  },
  maskPainters: painters(false),
  // (no strip of fabric across her cleavage: it is bare there)
  noCleavageBridge: true,
  // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
  onlyNamedPieces: true,
};

/** VERSION B: the same suit with the low sweetheart neckline and no neck band (`NECKLINE_LOW`). */
export const BRONZE_SUIT_LOW_LOOK: HeroineLook = { ...BRONZE_SUIT_LOOK, maskPainters: painters(true) };
