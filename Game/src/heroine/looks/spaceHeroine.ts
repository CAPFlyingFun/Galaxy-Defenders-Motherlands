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
//   Paint layer 3, THE WHITE (`paintWhite`, by code): her bodice above her
//     bust's underside, except the navy panel that runs up between her breasts
//     to a point; her upper back. Painted only on her trunk, so it never goes
//     past the leotard's own edges.
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

/** Where the white starts, by how far round her (degrees, 0 her front, 180 her back): under her bust in front, lower behind. */
const WHITE_FROM = through([[0, 0.5], [60, 0.49], [100, 0.43], [130, 0.33], [180, 0.3]]);
/** How far below the base of her neck the white stops (the leotard's own neckline is there, edged gold). */
const WHITE_TO = 0.925;   // (Joshua's neckline is at 0.95 in front: the white stays a little under it)

/** How far round her the white reaches: from her front's middle (degrees), and from her back's middle. */
const WHITE_SIDE = Object.freeze({ front: 72, back: 58 });

/**
 * THE NAVY PANEL up her front between the white: its half width round her (degrees) at each height, from under her
 * bust narrowing to a point between her breasts.
 */
const PANEL_HALF = through([[0.4, 30], [0.52, 30], [0.6, 20], [0.68, 0]]);
const PANEL_TOP = 0.68;

/** How far inside the white a trunk point is (leg lengths; minus outside). */
function whiteAt(place: LegPlace): number {
  const turn = Math.abs(place.turn);
  const r = Math.max(0.05, place.radius);
  // outside the panel: how far round past its edge (at and above its point, nothing of it)
  const pastPanel = place.along >= PANEL_TOP ? 1 : (turn - PANEL_HALF(place.along)) * RADIANS * r;
  // (round her sides it stops short of her armpits, in a clean line: navy there, as his picture's sides are; behind,
  //  a white yoke down the middle of her back)
  const front = (WHITE_SIDE.front - turn) * RADIANS * r, back = (WHITE_SIDE.back - (180 - turn)) * RADIANS * r;
  return Math.min((place.along - WHITE_FROM(turn)) * 0.8, (WHITE_TO - place.along) * 0.8, pastPanel, Math.max(front, back));
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
