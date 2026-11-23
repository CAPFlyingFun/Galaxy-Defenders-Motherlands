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
import type { LiveBand } from '../liveBand';
import { bakedWaist, type LiveWaist, type WaistNumbers } from '../liveWaist';
import { turnBetween, type LegPlace, type MaskPainter } from '../paintMask';
import { RADIANS, any, armStripe, band, kneeRing, painter, sideBand, through, LEG_PATH } from './suitShapes';
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

// ============================================================================
// THE BOARD'S TRIMS AND STRIPES (Joshua, 2026-11-23: "add the trimmings and
// stripes so that don't look boring and match the reference color styles").
// PAINTED BY CODE OVER HIS SAVES, nothing of his changed: each outfit's stripes
// in ITS OWN TRIM'S COLOUR (his bands at its neck and sleeves), with the
// board's grey and charcoal panels.
//
// A painted layer cannot see where his top or leggings end, so every shape is
// kept INSIDE ITS GARMENT by his own numbers, on the same measures the builder
// places them by (paintTemplates.ts): up her trunk (0 her hip joints, 1 the
// base of her neck), down her leg (0 her hip, 1 her ankle), down her arm (0 her
// shoulder, 1 her wrist). His tops' hems are at -0.1 (onto the tops of her
// legs), the crop tees' at 0.29; the tank's armhole at 0.8; the sleeves end at
// 0.32 (tee, henley), 0.3 (polo) and 0.62 (crop tees); the shorts at 0.23 down
// her leg; M3's leggings at 0.91 (its ankle bands below).
//
// THE SIDE PANEL of each long top (M1-M4) is DRAWN LIVE (liveBand.ts), as on
// Mary's catsuits: the same width at any belly.
// ============================================================================

/** A colour in the builder's smooth Flat cloth (its White dyed), as Mary's suits paint theirs (marySuits.ts). */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
/** A paint layer painted by code, in one colour. */
const coded = (tint: string) => ({
  choice: { fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 },
  detail: { mode: 'auto', material: null, override: { nipple: 0.45, navel: 0.8 } },
  template: null, mask: '',
});

// ---- shapes (how far inside, in leg lengths; minus outside) ----------------

/** Up to `end` along (a garment's edge), `margin` short of it (its own band, or room for the drawn edge). */
const before = (p: LegPlace, end: number, margin = 0.02): number => (end - margin - p.along) * 0.6;
/** From `start` along. */
const after = (p: LegPlace, start: number): number => (p.along - start) * 0.6;
/** All of a sleeve, from her shoulder to `end` along her arm, short of its band. */
const sleeve = (p: LegPlace, end: number): number => Math.min(before(p, end, 0.035), (p.along + 0.08) * 0.6);

/**
 * THE RAGLAN SHOULDER (M3, M4, M5): the top of each shoulder between two seams that run from beside her collar down to
 * her armpit, front and back (the board's coloured shoulders), on her trunk; her sleeve carries on below it.
 */
const RAGLAN_FRONT = through([[0.82, 80], [0.98, 56]]);
const RAGLAN_BACK = through([[0.82, 100], [0.98, 124]]);
/**
 * M3's shoulders, kept OFF HIS HENLEY'S NECKLINE (Joshua, 2026-11-23: "remove that purple part along that neckline...
 * the reference image doesn't have that stripe"). His henley's V is low and wide, and its top corners come out over
 * her collarbones. Near the base of her neck her trunk is shallow, so every point there is far round from her front
 * (the opening's corners are about 60-70 degrees round): a seam measured in degrees, at 56 or at 72 at the top, still
 * left violet bars right up against the V's violet edging. So this front seam is measured SIDEWAYS, how far out from
 * her middle a point is (leg lengths: 0.18, about 14 cm, at her armpit; 0.145, about 11 cm, at the base of her neck,
 * 2 cm clear of the V's edging): from the front it is a straight line from her armpit up over her shoulder, and the
 * grey of the henley runs all round the V. The back seam is the raglan's own.
 * (Tried first: Mary's catsuit caps: a straight yoke line across her upper chest with a ragged edge.)
 */
const M3_SEAM_OUT = through([[0.82, 0.18], [0.98, 0.145]]);
const raglanClear = (p: LegPlace): number => {
  if (p.along < 0.8) return -1;
  const out = p.radius * Math.sin(Math.abs(p.turn) * RADIANS); // how far out from her middle (leg lengths)
  const back = turnBetween(RAGLAN_BACK(p.along), p.turn) * RADIANS * p.radius;
  return Math.min(out - M3_SEAM_OUT(p.along), back, after(p, 0.82));
};
const raglan = (p: LegPlace): number => {
  if (p.along < 0.8) return -1;
  const front = turnBetween(p.turn, RAGLAN_FRONT(p.along)) * RADIANS * p.radius;
  const back = turnBetween(RAGLAN_BACK(p.along), p.turn) * RADIANS * p.radius;
  return Math.min(front, back, after(p, 0.82));
};
/** The raglan's two SEAMS as thin lines (M1: the board's piping over the shoulders). */
const raglanSeams = (p: LegPlace, half: number): number =>
  any(band(p, { from: 0.82, to: 0.97, path: RAGLAN_FRONT, half: () => half }),
    band(p, { from: 0.82, to: 0.97, path: RAGLAN_BACK, half: () => half }));

/** A SIDE PANEL drawn live, down her side from under her arm (`top` along) to her hem. */
const sidePanel = (waist: number, ends: number, top = 0.84): ((p: LegPlace) => ReturnType<ReturnType<typeof sideBand>>) => {
  const whole = sideBand(waist, ends);
  // (the catsuits' band, ended at `top`: lower under the tank's armhole)
  return (p) => { const at = whole(p); return p.along > top ? { ...at, past: Math.max(at.past, p.along - top) } : at; };
};

/** Down the outside of her leg (from below his tops' hems), `half` wide, or `widths` along it. */
const outerLeg = (p: LegPlace, from: number, to: number, half: (a: number) => number): number =>
  band(p, { from, to, path: LEG_PATH, half });
/** The board's curved panel lines on her leggings: down the front of her thigh to the inside of her knee, and down her shin. */
const thighCurve = (p: LegPlace, half: number): number =>
  band(p, { from: 0.15, to: 0.43, path: through([[0.15, 72], [0.43, -38]]), half: () => half });
const shinCurve = (p: LegPlace, half: number, to = 0.93): number =>
  band(p, { from: 0.56, to, path: through([[0.56, -30], [to, 34]]), half: () => half });
/** A filled oval on the front of her knee (M6's knee pads). */
const kneePad = (p: LegPlace, knee: number): number => {
  const wide = 0.05, tall = 0.075;
  const x = turnBetween(p.turn, 4) * RADIANS * p.radius, y = p.along - (knee + 0.01);
  return (1 - Math.hypot(x / wide, y / tall)) * Math.min(wide, tall);
};
/** A cargo pocket on the outside of her thigh (M6): a panel with rounded corners, and its flap's line across its top. */
const pocket = (p: LegPlace): number => {
  const from = 0.2, to = 0.36, centre = 90, halfDeg = 20, corner = 0.008;
  const across = Math.abs(turnBetween(p.turn, centre)) * RADIANS * p.radius, halfWidth = halfDeg * RADIANS * p.radius;
  const qx = across - (halfWidth - corner), qy = Math.abs(p.along - (from + to) / 2) - ((to - from) / 2 - corner);
  return corner - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
};
/** Short diagonal SLASHES (M5's glowing ones): two on the front of her thigh, one low on her shin. */
const slashes = (p: LegPlace): number => {
  const slash = (from: number, to: number, a: number, b: number) => band(p, { from, to, path: through([[from, a], [to, b]]), half: () => 0.0045 });
  return any(slash(0.19, 0.31, 66, 24), slash(0.23, 0.35, 66, 24), slash(0.8, 0.9, 58, 14));
};

// ---- the looks ----------------------------------------------------------------

/**
 * One of his outfits as a look: his clothes as saved; `neck`, his top's neckline when it is high enough for the
 * builder to lay its strip across her cleavage (the gap filled in the top's own fabric instead); then the PAINTED
 * layers (bottom first, each one colour) and the side panel the game draws live (`side.on`: which painted layer it is
 * the colour of).
 */
function casualLook(
  clothes: Clothes,
  neck: number | null,
  painted: readonly { readonly colour: string; readonly paint: MaskPainter }[] = [],
  side?: { readonly on: number; readonly trunk: LiveBand['trunk'] },
  waist?: LiveWaist['keys'],
): HeroineLook {
  // (a live waistband: his leggings, the first layer, baked at the least of his heights; the game moves their top
  //  between his lines as her belly grows: liveWaist.ts)
  const liveWaist: LiveWaist | null = waist ? { layer: 0, keys: waist } : null;
  const low = liveWaist ? bakedWaist(liveWaist) : null;
  const saved = clothes.layers.filter((layer) => layer !== null);
  const layers = low ? saved.map((layer, i) => i !== 0 || !layer.template ? layer : {
    ...layer, template: { ...layer.template, params: { ...layer.template.params, riseFront: low[0], riseSide: low[1], riseBack: low[2], lowBowl: low[3] } },
  }) : saved;
  const top = layers[1];
  const fill = neck !== null && top ? [{ choice: top.choice, detail: top.detail, template: null, mask: '' }] : [];
  const all = [...layers, ...fill, ...painted.map((p) => coded(p.colour))];
  if (all.length > 6) throw new Error('casualLook: the builder has six layers');
  const first = layers.length + fill.length;   // (the first painted layer)
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    // (his clothes as saved, the fill after his two layers, then the painted ones, the rest of the six empty)
    clothes: { ...clothes, layers: [...all, ...Array.from({ length: 6 - all.length }, () => null)] },
    maskPainters: [
      ...layers.map(() => null),
      ...(fill.length ? [fillCleavage(neck as number, 0.55)] : []),
      ...painted.map((p) => p.paint),
    ],
    ...(fill.length ? { noCleavageBridge: true } : {}),
    ...(side ? { liveBand: { colour: painted[side.on].colour, layer: first + side.on, trunk: side.trunk } } : {}),
    ...(liveWaist ? { liveWaist } : {}),
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** THE COLOURS (GAME TUNING): each outfit's own trim colour (brightened a little to read as piping), and the board's panels. */
export const CASUAL_TRIMS = Object.freeze({
  // M1: his collar and sleeve bands' royal blue, lifted (the board's is teal: his pick is blue)
  teeBlue: '#2f6fe0',
  // M2: his tank's burgundy, and the board's charcoal side panels and light grey leg lines
  tankBurgundy: '#6a1433',
  charcoal: '#2b2c31',
  lightGrey: '#9a9ca2',
  // M3: his bands' violet (the henley's and the leggings' ankle bands)
  violet: '#5317b8',
  // M4: his polo's and shorts' orange
  orange: '#e0601f',
  // M5: his white bands, and the board's glowing cyan
  white: '#d8dce2',
  cyan: '#19c3e6',
  // M6: the board's grey side panels and sleeve stripes, and charcoal knee pads and pockets
  grey: '#7d8084',
  pads: '#34363b',
});
const T = CASUAL_TRIMS;

/**
 * THE UNDER-BELLY LEGGINGS' WAISTBAND, M5 and M6 (Joshua, 2026-11-23: set by hand in the builder at every 50% of her
 * belly and sent as his screenshots, "which I manually adjusted per every 50%"): at each, its front, side and back
 * heights up her trunk and its bowl (0.7, as he saved them). He sets WAISTBAND (FRONT) and HIPS & BACK RISE; the builder
 * moves the side with the back (paintTemplates.ts `riseBack`), 0.175 under it as in both his saves. Between two of his
 * bellies the game blends the two lines (liveWaist.ts `waistWeights`).
 */
const under = (front: number, back: number): WaistNumbers => [front, +(back - 0.175).toFixed(3), back, 0.7];
export const UNDER_BELLY_WAIST: LiveWaist['keys'] = Object.freeze([
  { belly: 0, waist: under(0.13, 0.37) },
  { belly: 50, waist: under(-0.03, 0.33) },
  { belly: 100, waist: under(-0.06, 0.3) },
  { belly: 150, waist: under(-0.04, 0.27) },
  { belly: 200, waist: under(-0.05, 0.24) },
]);

/**
 * M1 TECH TEE & LEGGINGS (his crew neck: the builder's drawn crew, 1.8 cm under the base of her neck). The board's
 * piping in his blue: over each shoulder (the raglan seams), down each side (live), down the outside of each leg with a
 * line round each knee.
 */
export const MARY_CASUAL_TEE_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M1, 0.966, [
  {
    colour: T.teeBlue,
    paint: painter({
      trunk: (p) => raglanSeams(p, 0.004),
      leg: (p, knee) => any(outerLeg(p, 0.13, 0.95, () => 0.005), kneeRing(p, knee, { wide: 0.045, tall: 0.06, half: 0.004, lift: 0.005 })),
    }),
  },
], { on: 0, trunk: sidePanel(0.005, 0.004) });

/**
 * M2 EXPLORER TANK SET. The board's charcoal side panels on his burgundy tank (live, under its armholes), and on the
 * leggings its light grey lines down the front of each thigh and shin and a burgundy line down the outside.
 */
export const MARY_CASUAL_TANK_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M2, null, [
  { colour: T.charcoal, paint: painter({}) },
  { colour: T.lightGrey, paint: painter({ leg: (p) => any(thighCurve(p, 0.007), shinCurve(p, 0.007)) }) },
  { colour: T.tankBurgundy, paint: painter({ leg: (p) => outerLeg(p, 0.13, 0.95, () => 0.004) }) },
], { on: 0, trunk: sidePanel(0.03, 0.018, 0.74) });

/**
 * M3 ZIP TOP & LEGGINGS (the henley). The board's violet shoulders and sleeves (down to his violet sleeve bands) and
 * charcoal side panels (live) on his grey henley; on the leggings a broad violet stripe down the outside of each leg to
 * his ankle bands, and grey lines down the front of each thigh and shin. Its raglan's front seam is kept off the
 * henley's low V (`raglanClear`): with M4's and M5's seam the violet lay along the neckline as a stripe the board
 * does not have.
 */
export const MARY_CASUAL_HENLEY_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M3, null, [
  { colour: T.charcoal, paint: painter({}) },
  { colour: T.lightGrey, paint: painter({ leg: (p) => any(thighCurve(p, 0.006), shinCurve(p, 0.006, 0.88)) }) },
  {
    colour: T.violet,
    paint: painter({
      trunk: raglanClear,
      arm: (p) => sleeve(p, 0.32),
      leg: (p) => Math.min(outerLeg(p, 0.13, 0.9, through([[0.13, 0.011], [0.47, 0.017], [0.9, 0.01]])), before(p, 0.91, 0.01)),
    }),
  },
], { on: 0, trunk: sidePanel(0.028, 0.018) });

/**
 * M4 UTILITY ROMPER (the polo and shorts). The board's orange: shoulders and sleeves (down to his orange sleeve bands),
 * a broad side panel (live) carried on down the outside of the shorts to his orange hems, a zip line down her front and
 * piping down her back (her spine and either side).
 */
export const MARY_CASUAL_POLO_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M4, 0.966, [
  {
    colour: T.orange,
    paint: painter({
      trunk: (p) => any(
        raglan(p),
        // (the zip, from his hem to under the polo's placket)
        band(p, { from: -0.08, to: 0.84, path: () => 0, half: () => 0.0028 }),
        // (down her back: her spine, and a line either side over her shoulder blade)
        band(p, { from: -0.08, to: 0.93, path: () => 180, half: () => 0.003 }),
        band(p, { from: 0.12, to: 0.84, path: through([[0.12, 150], [0.55, 154], [0.84, 140]]), half: () => 0.003 }),
      ),
      arm: (p) => sleeve(p, 0.3),
      // (the side panel carried on down the shorts, short of his hems)
      leg: (p) => Math.min(outerLeg(p, -0.05, 0.2, () => 0.02), before(p, 0.23, 0.015)),
    }),
  },
], { on: 0, trunk: sidePanel(0.026, 0.02) });

/**
 * M5 CASUAL JACKET SET (the dark crop tee). The board's jacket colours: white over her shoulders and down the outside
 * of each 3/4 sleeve; on the leggings its glowing cyan slashes, two on each thigh and one low on each shin. Its leggings'
 * top slides down under her belly as it grows (UNDER_BELLY_WAIST).
 */
export const MARY_CASUAL_CROP_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M5, 0.92, [
  {
    colour: T.white,
    paint: painter({
      trunk: raglan,
      arm: (p) => Math.min(any(armStripe(p, 0.009, 0.0), sleeve(p, 0.16)), before(p, 0.62, 0.035)),
    }),
  },
  { colour: T.cyan, paint: painter({ leg: slashes }) },
], undefined, UNDER_BELLY_WAIST);

/**
 * M6 FIELD CASUAL (the olive crop tee). The board's grey side panels (from under her arm to his crop hem) and grey
 * stripe down the outside of each 3/4 sleeve; on the leggings its charcoal knee pads and cargo pockets. Its leggings'
 * top slides down under her belly as it grows (UNDER_BELLY_WAIST).
 */
export const MARY_CASUAL_FIELD_LOOK: HeroineLook = casualLook(CASUAL_EXPORTS.M6, 0.91, [
  {
    colour: T.grey,
    paint: painter({
      trunk: (p) => Math.min(band(p, { from: 0.3, to: 0.84, path: () => 90, half: () => 0.026 }), after(p, 0.34)),
      arm: (p) => Math.min(armStripe(p, 0.014, 0.0), before(p, 0.62, 0.035)),
    }),
  },
  { colour: T.pads, paint: painter({ leg: (p, knee) => any(kneePad(p, knee), pocket(p)) }) },
], undefined, UNDER_BELLY_WAIST);
