// ============================================================================
// catsuit.ts -- THE BUILDER'S DRAWN CATSUIT, in any colour, neckline and
// two tones: the one recipe every catsuit style is made from (Joshua,
// 2026-11-20: "one piece catsuits... just different variations of looks as
// styles are better for the theme"; then "a variety of colors like we have
// the bronze, maybe a shiny gold, black, silver, etc, maybe even top half
// above belly/at bottom of breasts one tone, and below another, but still
// the same outfit").
//
// All of it is the builder's own (its v0.9.60), so every edge is drawn smooth:
//   paint layer 1  THE CATSUIT (the Full bodysuit template): its NECKLINE from
//                  a low U or V up to a turtleneck, its NECK SHAPE and WIDTH,
//                  and a CHEST CUTOUT (oval, diamond or keyhole) if wanted;
//   paint layer 3  under a high neck, the gap the builder leaves her cleavage
//                  (for its cleavage piece, through which her skin showed in
//                  the game) filled in the colour above it (`fillCleavage`).
//
// TWO TONES are the game's, not the bake's (looks/gear.ts `clothShine.twoTone`,
// outfitMaterial.ts): one colour above the bottom of her bust and all down her
// arms, the suit's own below, drawn per pixel so its line is clean. (Tried
// first, 2026-11-20: a long-sleeved top cut at her bust over the suit; the
// builder's shirt keeps its own hem and hangs a drape between her legs.)
//
// On HIS OWN CATSUIT EXPORT's body (his Blaze, her braid and face, as Look 1:
// shadowSuit.ts `EXPORT_BODY`). Its shine, metal and texture come from the game
// (looks/gear.ts `clothShine`); its boots, belt and guns from there too.
// ============================================================================
import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import type { HeroineLook } from '../heroineLook';
import type { MaskPainter } from '../paintMask';
import { BLAZE_LOOK } from './blaze';
import { EXPORT_BODY } from './shadowSuit';

/**
 * A NECKLINE (the builder's own numbers). `neckFront` on her trunk, 0 her hip joints, 1 the base of her neck; past 1
 * a collar up her neck (1.1 its highest, 5 cm up it). `neckShape` the builder's style (crew, u, v, scoop, square),
 * `neckWide` a share of that style's own width (0.6 to 1.6). `cutout` in metres: `drop` its middle under her neck
 * joint (her breasts' tops are about 11 cm under it), `width` and `height` across it; null for none.
 */
export interface CatsuitNeckline {
  readonly neckFront: number;
  readonly neckShape: 'crew' | 'u' | 'v' | 'scoop' | 'square';
  readonly neckWide: number;
  readonly cutout: { readonly shape: 'oval' | 'diamond' | 'keyhole'; readonly width: number; readonly height: number; readonly drop: number } | null;
}

/** THE NECKLINES the styles use (GAME TUNING). */
export const NECKLINES = Object.freeze({
  /** a turtleneck up her neck and a keyhole over the top of her cleavage, its slit up through the collar */
  keyhole: { neckFront: 1.06, neckShape: 'crew', neckWide: 1, cutout: { shape: 'keyhole', width: 0.085, height: 0.085, drop: 0.15 } },
  /** a low, slightly wide U: her neck and upper chest bare */
  lowU: { neckFront: 0.7, neckShape: 'u', neckWide: 1.2, cutout: null },
  /** Joshua's high crew ("Blaze - copper HN") */
  high: { neckFront: 0.94, neckShape: 'crew', neckWide: 1, cutout: null },
  /** a turtleneck and the builder's own diamond cutout over her cleavage (its "Catsuit, chest cutout" style) */
  diamond: { neckFront: 1.04, neckShape: 'crew', neckWide: 1, cutout: { shape: 'diamond', width: 0.09, height: 0.08, drop: 0.13 } },
} as const satisfies Record<string, CatsuitNeckline>);

/** One catsuit: its colour and its neckline. */
export interface CatsuitStyle {
  /** The suit's colour ('#rrggbb'). */
  readonly colour: string;
  readonly neck: CatsuitNeckline;
}

/** A colour as the builder saves one: its smooth Flat family's White (colour 0) dyed with a tint. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
/** How much shows through: Look 1's (Joshua's own numbers for his catsuit). */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.43, navel: 0.81 } } as const;
const pick = (tint: string) => ({ fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 }) as const;
/** A paint layer left bare. */
const NOTHING: MaskPainter = (surface) => new Float32Array(surface.count).fill(-1);
/** An unused paint layer, as the builder saves one. */
const emptyLayer = (tint: string) => ({ choice: pick(tint), detail: DETAIL, template: null, mask: '' });

/** One of the builder's templates, by its id, with some of its numbers changed. */
function template(id: string, change: Record<string, unknown>) {
  const t = COVERAGE_TEMPLATES.find((one) => one.id === id);
  if (!t) throw new Error(`[catsuit] the builder has no template '${id}'`);
  // (its OWN numbers, so its drawn catsuit's `top: 'catsuit'` and anything the builder adds later come with it)
  return { id: t.id, params: { ...t.params, ...change } };
}

/**
 * THE GAP UNDER A HIGH NECK FILLED IN: her front between her breasts and up to the neckline (`along` on her trunk from
 * 0.7, within 45 degrees of her front's middle). It only ever lies on the suit or on the gap the builder left, so its
 * own rough edge is the suit's colour on the suit's colour and never shows.
 */
export const fillCleavage = (neckFront: number, from = 0.7, half = 45): MaskPainter => (surface) => {
  const inside = new Float32Array(surface.count).fill(-1);
  const place = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (!surface.trunkPlace(v, place)) continue;
    // (from `from` up her trunk to the neckline, within `half` degrees of her front's middle; John's gap, on his
    //  differently proportioned trunk, wanted a wider, lower fill: john.ts)
    inside[v] = Math.min(place.along - from, (half - Math.abs(place.turn)) / 180, neckFront - place.along) * 0.5;
  }
  return inside;
};

/** A high neck (a crew or a collar) with no cutout: the builder leaves her cleavage to its cleavage piece. */
const needsFill = (neck: CatsuitNeckline): boolean => neck.neckFront >= 0.9 && !neck.cutout;

/** Blaze in one catsuit style. */
export function catsuitLook(style: CatsuitStyle): HeroineLook {
  const { colour, neck } = style;
  const fill = needsFill(neck);
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    clothes: {
      ...(BLAZE_LOOK.clothes as object),
      // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
      shoes: 'none',
      detail: { nipple: null, navel: null },
      layers: [
        // 1. the catsuit
        { choice: pick(colour), detail: DETAIL, template: template('bodysuitFull', { ...neck }), mask: '' },
        // 2. (not used)
        emptyLayer(colour),
        // 3. (painted by code, below: the gap under a high neck)
        emptyLayer(colour),
      ],
    },
    // (layer 1 is the builder's template; layer 3 fills the gap under a high neck, or is bare)
    maskPainters: [null, NOTHING, fill ? fillCleavage(neck.neckFront) : NOTHING],
    ...(fill ? { noCleavageBridge: true } : {}),
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}
