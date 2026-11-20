// ============================================================================
// spaceHeroine.ts -- BLAZE as the ANIME SPACE HEROINE: look 2 of Joshua's
// outfit board (docs/reference/outfits/04-four-looks-board.png and his two
// close-ups, look2-anime-space-heroine-front.jpg / -back.jpg, 2026-11-19:
// "try and make it as close as possible").
//
// HIS CHOICES (2026-11-19): the side cutouts at her waist ("try and do the
// cutouts if possible"), small heels on her boots, the white hip panels
// mid-thigh, one holster.
//
// THE LEOTARD STARTS FROM THE BUILDER'S OWN (Joshua, 2026-11-19: "Try using
// the painted swimsuit and adding to it, it covers the crotch and all that"):
//
//   Paint layer 1, THE LEOTARD: the builder's "Long-sleeve leotard" template
//     (the swimsuit's own high-cut leg openings and the strip between her legs,
//     but its high crew neck, as his picture's; the swimsuit's scoop would leave
//     her upper chest bare), with SHORT SLEEVES and the neck of Joshua's own base
//     (his export, "character-blaze-white-leotard"), in NAVY, its edging GOLD:
//     the builder draws gold bands round the leg openings, neck and armholes.
//
//   Paint layer 2, THE GOLD PIPING (`paintPiping`, by code): the white parts a
//     little bigger, so a thin gold line shows round each.
//
//   Paint layer 3, THE WHITE (`paintWhite`, by code; `whiteAt` has its
//     shapes): the cups over her breasts with a navy V between them, a band down
//     each side of the navy front, her hips, a yoke on her upper back. Painted
//     only on her trunk, so it never goes past the leotard's own edges.
//
// THE WINDOWS at her waist are not in it: a template can only be painted over,
// never cut, so skin cannot show through the leotard. (Painting the whole
// leotard by code instead could have them; the template's crotch and leg cut
// are why it was taken.)
//
// Her collar up her neck and her fingerless gloves are 3D (fast/suitGear.ts),
// as her plates, bracers, knee caps and boots are.
//
// Her 3D gear (looks/gear.ts, fast/suitGear.ts, fast/hipPanels.ts): navy
// shoulder plates edged in gold, long white bracers with gold bands, navy knee
// caps, tall white boots with gold trim, navy toes and small heels; a brown and
// gold belt with ONE holster, on her right thigh; and the white hip panels with
// their red lining, hinged at the belt and swinging with her thighs.
//
// HOW THE SHAPES ARE WRITTEN: as in shadowSuit.ts (paintMask.ts): every point of
// her skin is a place on her trunk, a leg, an arm or her neck (`along` and
// `turn`: 0 her front, +90 her outer side, 180 her back, both sides mirrored);
// each painter says how far inside its shapes the point is (leg lengths: 0.01
// is about 8 mm).
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import type { LegPlace, MaskPainter } from '../paintMask';
import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import { BLAZE_LOOK } from './blaze';

/** THE COLOURS, from his picture's swatches (GAME TUNING). */
export const SPACE_HEROINE_COLOURS = Object.freeze({
  /** the leotard: a warm pearl white */
  white: '#eeeef2',
  /** the navy panels, collar, gloves */
  navy: '#1c2445',
  /** the gold piping */
  gold: '#c9a35e',
  /** the hip panels' lining */
  red: '#b3202a',
});

/** A colour as the builder saves one: its Flat family's White (colour 0) dyed with a tint. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;

/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A value eased through (position, value) points, whichever order they are written in. */
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
const RADIANS = Math.PI / 180;

// ------------------------------------------------------------------ the white (on her trunk: `along` 0 at her hip
// joints, 1 at the base of her neck; her waist is about 0.33 and her bust's underside about 0.55, measured on her)

/**
 * THE WHITE, from Joshua's enhanced picture of Look 2 (2026-11-20). Each shape's measures are on her trunk: `along` up
 * it (her waist about 0.33, her bust's underside about 0.55, the base of her neck 1), `turn` round it in degrees (0 her
 * front's middle, 90 her side, 180 her back's middle; both sides alike).
 *
 *   THE CUPS: white over her breasts, from under them up toward her collarbones, round to the sides of her chest
 *     (navy beyond, under her arms), with a narrow navy V down the middle from her collar to her breastbone.
 *   THE SIDE BANDS: a white band down each side of the navy front panel, from under her bust curving out to her hip.
 *   THE HIPS: white over her hips beside the navy brief, from the bands down toward the leg openings.
 *   THE YOKE: white over her upper back, tapering to a point toward her waist.
 */
const CUPS = Object.freeze({ top: 0.88, out: 50 });
/** The cups' lower edge by how far round her (degrees): high in the middle, where the navy rises between her breasts. */
const CUPS_BOTTOM = through([[0, 0.64], [14, 0.6], [28, 0.53], [50, 0.5]]);
/** The navy V between the cups: its half width (degrees) at each height, from her collar down to its point. */
const V_HALF = through([[0.62, 4], [0.7, 9], [0.8, 11], [0.9, 14]]);
/** The side bands' middle (degrees round her) at each height, and their half width (leg lengths, about 2.3 cm). */
const BAND_PATH = through([[0.52, 40], [0.4, 36], [0.28, 38], [0.16, 46], [0.04, 56]]);
const BAND_HALF = 0.03;
const BAND_SPAN = Object.freeze({ from: 0.04, to: 0.54 });
/** The hips: below this height (trunk), from this far round to this far (degrees). */
const HIPS = Object.freeze({ top: 0.08, from: 46, to: 118, bottom: -0.05 });
/** The yoke: half width round her back (degrees) at each height, down to its point. */
const YOKE_HALF = through([[0.36, 0], [0.5, 22], [0.7, 38], [0.92, 42]]);
const YOKE_TIP = 0.37;
/** The white stops a little under the leotard's own neckline (Joshua's: 0.95 in front). */
const WHITE_TO = 0.925;

/** How far inside the white a trunk point is (leg lengths; minus outside). */
function whiteAt(place: LegPlace): number {
  const turn = Math.abs(place.turn), r = Math.max(0.05, place.radius), along = place.along;
  const round = (deg: number) => deg * RADIANS * r;   // degrees round her as a distance on her skin
  const top = (WHITE_TO - along) * 0.8;
  // the cups: between their bottom and top, inside `out` from her front, outside the navy V
  const cups = Math.min((along - CUPS_BOTTOM(turn)) * 0.8, (CUPS.top - along) * 0.8, round(CUPS.out - turn), round(turn - V_HALF(along)));
  // the side bands
  const at = Math.min(BAND_SPAN.to, Math.max(BAND_SPAN.from, along));
  const bands = BAND_HALF - Math.hypot(round(turn - BAND_PATH(at)), along - at);
  // the hips
  const hips = Math.min((HIPS.top - along) * 0.8, (along - HIPS.bottom) * 0.8, round(turn - HIPS.from), round(HIPS.to - turn));
  // the yoke behind
  const yoke = Math.min(top, (along - YOKE_TIP) * 0.8, round(YOKE_HALF(along) - (180 - turn)));
  return Math.max(cups, bands, hips, yoke);
}

/** THE GOLD PIPING round the white: how much bigger the gold is than the white (leg lengths, about 5 mm). */
const PIPING = 0.0065;

/** Paint layer 2: the white made a little bigger, in gold (the white goes over it, leaving the gold line). */
const paintPiping: MaskPainter = (surface) => {
  const inside = new Float32Array(surface.count);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) inside[v] = surface.trunkPlace(v, place) ? whiteAt(place) + PIPING : -1;
  return inside;
};

/** Paint layer 3: the white. */
const paintWhite: MaskPainter = (surface) => {
  const inside = new Float32Array(surface.count);
  const place: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) inside[v] = surface.trunkPlace(v, place) ? whiteAt(place) : -1;
  return inside;
};

// ------------------------------------------------------------------ the look

const leotard = COVERAGE_TEMPLATES.find((t) => t.id === 'bodysuit');
if (!leotard) throw new Error("[spaceHeroine] the builder has no 'bodysuit' (Long-sleeve leotard) template any more: spaceHeroine.ts must be looked at again");

/** Her nipples hardly show through; her navel shows wholly, so her pregnancy's outie is hers (as graySuit.ts). */
const DETAIL = { mode: 'auto', material: null, override: { nipple: 0.15, navel: 1 } } as const;
const C = SPACE_HEROINE_COLOURS;
const pick = (tint: string) => ({ fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 }) as const;

/**
 * The leotard's dials (Joshua's), and its gold edging: bands (metres) at its neck and sleeves, and round its leg openings.
 */
// (JOSHUA'S OWN BASE, 2026-11-19, "Try using what I did for a base": his export of Blaze in the white leotard -- the
//  template's own leg cut, its neck at 0.95 in front and 0.97 behind, SHORT SLEEVES at 0.27. Its colours and his knit
//  picture are not taken: "Not the right texture for the outfit". The gold edging bands are added here.)
const LEOTARD_PARAMS = { ...leotard.params, neckFront: 0.95, neckBack: 0.97, sleeve: 0.27, band: { neck: 0.008, sleeve: 0.008, hem: 0 }, lowBand: { waist: 0, leg: 0.008, top: 0 } };

/** Joshua's export of Blaze for this look (2026-11-19, "character-blaze-white-leotard"): her body and head exactly as saved. */
const EXPORT_BODY = {
  "model": "v2-body",
  "bump": 10,
  "shape": "{\"version\":1,\"shape\":{\"bellyLower\":5,\"navel\":20,\"babyFloat\":200,\"breastSize\":5,\"milk\":50,\"breastBounce\":200,\"walkBob\":200,\"walkSway\":200,\"legGap\":1.5}}",
  "refine": false,
  "random": {
    "rules": {},
    "groups": []
  },
  "pregnancy": {
    "pregnant": false,
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

export const SPACE_HEROINE_LOOK: HeroineLook = {
  name: 'Blaze',
  // her body and head as Joshua saved her with his white leotard (her braid, his face settings)
  body: EXPORT_BODY,
  clothes: {
    ...(BLAZE_LOOK.clothes as object),
    // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
    shoes: 'none',
    detail: { nipple: 0.15, navel: 1 },
    layers: [
      // PAINT LAYER 1: the leotard, navy, edged gold
      { choice: { fabric: flat(C.navy), match: false, trim: flat(C.gold), stitch: 1, opacity: 1 }, detail: DETAIL, template: { id: leotard.id, params: LEOTARD_PARAMS }, mask: '' },
      // PAINT LAYER 2: the gold piping round the white (`paintPiping`)
      { choice: pick(C.gold), detail: DETAIL, template: null, mask: '' },
      // PAINT LAYER 3: the white (`paintWhite`)
      { choice: pick(C.white), detail: DETAIL, template: null, mask: '' },
    ],
  },
  maskPainters: [null, paintPiping, paintWhite],
  // (no strip of fabric across her cleavage: the builder makes it in the leotard's own navy, which showed as a navy
  //  patch on the white; the white is painted right into her cleavage instead)
  noCleavageBridge: true,
};
