// ============================================================================
// marySuits.ts -- MARY'S THREE CATSUITS, M1-M3 of Joshua's board.
//
// (Joshua, 2026-11-22, with ChatGPT's board of Mary's and John's suits, kept in
// docs/reference/outfits/mary-john-catsuits-m1-m3-j1-j3.jpg: "You can mostly
// reuse the plain catsuit and paint on the colors, stripes, panels, and other
// details using the existing CCBS system... Keep the outfits lightweight for
// mobile, make sure they work with Mary's full 0-200% belly slider"; then
// "starting with the 3 images in the first image".)
//   M1  A.R.C.H. RESEARCH SUIT   black, TEAL panels, a WHITE stripe down each leg and arm
//   M2  SUBTERRANEAN EXPLORER    black, ORANGE panels, bold orange rings round her knees
//   M3  STEALTH OPERATIVE        black, thin RED lines, red rings round her knees
//
// HOW EACH IS MADE. ALL OF IT IS PAINT ON HER SKIN, nothing new in 3D:
//   paint layer 1  JOSHUA'S PLAIN CATSUIT, exactly as he saved it (the builder's
//                  Full bodysuit: its mock collar up her neck, its long sleeves
//                  and legs; his black athletic knit). Its edges are the builder's.
//   paint layer 2  under its high collar the builder leaves her cleavage for a
//                  piece that is smaller in the game: the gap filled in the same
//                  black (catsuit.ts `fillCleavage`, as every high-necked catsuit).
//   paint layers 3-4  the PANELS, STRIPES AND RINGS, painted by code
//                  (paintMask.ts), in the builder's smooth Flat cloth: measured on
//                  her own trunk, arms and legs, so they lie where they should at
//                  any shape. Being paint, they stretch with her skin.
//   THE SIDE BAND  is NOT paint in the game: the game draws it live on her
//                  (liveBand.ts; v0.2.160, Joshua, 2026-11-23: over a big belly the
//                  painted band grew twice as wide and its edge went ragged on the
//                  phone's 1024 picture). It stays on the same skin, so it moves with
//                  her belly, but keeps its WIDTH at any belly and a sharp edge.
// Her belt, holsters and pouches (the game needs them), her guns and her low boots
// are the game's 3D gear in each suit's colours (looks/gear.ts `marySuitGear`). The
// A.R.C.H. emblem on the chest is left for later: a small painted shape comes out
// with rough edges (a painted shape is only as fine as her skin's points).
//
// The measures (paintMask.ts): `along` up her TRUNK (0 her hip joints, 1 the base
// of her neck), down her LEG (0 the hip joint, about 0.47 the knee, 1 the ankle)
// or ARM (0 the shoulder joint, 1 the wrist); `turn` degrees round her (0 her
// front, +90 her outer side, 180 her back; both sides mirrored); sizes in leg
// lengths (0.01 is about 8 mm). The shapes are GAME TUNING, judged against the board.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { plate, turnBetween, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import type { BandPlace, LiveBand } from '../liveBand';
import { BLAZE_LOOK } from './blaze';
import { fillCleavage } from './catsuit';
import { EXPORT_BODY } from './shadowSuit';

// ------------------------------------------------------------------ Joshua's plain catsuit

/**
 * JOSHUA'S PLAIN CATSUIT (his export of 2026-11-23, docs/reference/characters/
 * character-blaze-plain-catsuit-2026-11-23.json, made in builder v0.9.72): its one paint layer, exactly as saved. Its
 * body is the catsuits' own (shadowSuit.ts `EXPORT_BODY`: the same numbers).
 */
const PLAIN_CATSUIT_LAYER = {
  choice: { fabric: { family: 'athletic', colour: 4 }, match: true, trim: null, stitch: 0.5, opacity: null },
  detail: { mode: 'auto', material: null, override: { nipple: 0.45, navel: 0.8 } },
  template: {
    id: 'bodysuitFull',
    params: {
      riseFront: 1, riseSide: 1, riseBack: 1, riseFrontWidth: 1, legStart: 0, legEnd: 1, feet: false,
      hemFront: -1, hemBack: -1, neckFront: 1.1, neckBack: 0.97, sleeve: 1,
      topFront: null, topBack: null, topSide: null, strap: 0, strapIn: 0, armhole: null,
      neckStyle: 'crew', legCut: null, length: null, top: 'catsuit',
    },
  },
  mask: '',
} as const;

/** A colour in the builder's smooth Flat cloth: its White dyed, as the builder saves one. The game gives it a gloss. */
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint }) as const;
/** A paint layer painted by code, in one colour (its mask made when she loads: builderRoom.ts). */
const coded = (tint: string) => ({
  choice: { fabric: flat(tint), match: true, trim: flat(tint), stitch: 1, opacity: 1 },
  detail: PLAIN_CATSUIT_LAYER.detail, template: null, mask: '',
});
/** The gap under the collar, filled in the catsuit's own black knit. */
const FILL_LAYER = { ...PLAIN_CATSUIT_LAYER, template: null };

// ------------------------------------------------------------------ the shapes

const RADIANS = Math.PI / 180;
/** A smooth step from 0 (at `a`) to 1 (at `b`). */
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A curve through (along, value) points, eased between them: where a band runs, or how wide it is, as it goes. */
const through = (given: readonly (readonly [number, number])[]) => {
  const points = [...given].sort((a, b) => a[0] - b[0]);
  return (along: number): number => {
    if (along <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      const [a0, v0] = points[k - 1], [a1, v1] = points[k];
      if (along <= a1) return v0 + (v1 - v0) * smooth(a0, a1, along);
    }
    return points[points.length - 1][1];
  };
};

/** A band's shape: its middle runs `path(along)` degrees round her, half `half(along)` wide (leg lengths), from `from` to `to`. */
interface BandShape { readonly from: number; readonly to: number; readonly path: (along: number) => number; readonly half: (along: number) => number }

/**
 * Where a place is from a BAND (a stripe whose width may change as it goes: paintMask.ts `stripe` with a width for each
 * height): how far across from its middle line (signed), its half-width at the nearest place along it, and how far past
 * either end. Its ends are rounded.
 */
function bandPlace(place: LegPlace, o: BandShape): BandPlace {
  const along = Math.min(o.to, Math.max(o.from, place.along));
  // (a band that slants is measured square to itself, not straight across)
  const step = 0.004, slope = ((o.path(along + step) - o.path(along - step)) / (2 * step)) * RADIANS * place.radius;
  const across = (turnBetween(place.turn, o.path(along)) * RADIANS * place.radius) / Math.sqrt(1 + slope * slope);
  return { across, half: o.half(along), past: Math.abs(place.along - along) };
}

/** A BAND as paint: how far inside it the place is (minus: outside). */
function band(place: LegPlace, o: BandShape): number {
  const at = bandPlace(place, o);
  return at.half - Math.hypot(at.across, at.past);
}

/**
 * A RING round the front of her knee (an oval line round her kneecap): `wide` and `tall` its half-sizes, `half` half its
 * line's width (leg lengths). `knee` is where her knee is down her leg (the surface measures it).
 */
function kneeRing(place: LegPlace, knee: number, o: { wide: number; tall: number; half: number; lift: number }): number {
  const x = turnBetween(place.turn, 0) * RADIANS * place.radius, y = place.along - (knee - o.lift);
  // how far from the oval's line: its "radius" there, less the oval's own (good enough for a near-round oval)
  const r = Math.hypot(x / o.wide, y / o.tall), scale = Math.min(o.wide, o.tall);
  return o.half - Math.abs(r - 1) * scale;
}

/** One painted layer from a rule for each part of her (each returns how far inside its shapes a point is). */
function painter(parts: {
  trunk?: (p: LegPlace) => number;
  leg?: (p: LegPlace, knee: number) => number;
  arm?: (p: LegPlace) => number;
}): MaskPainter {
  return (surface: PaintSurface): Float32Array => {
    const inside = new Float32Array(surface.count).fill(-1);
    const place: LegPlace = { along: 0, turn: 0, radius: 0 };
    for (let v = 0; v < surface.count; v++) {
      let best = -1;
      if (parts.trunk && surface.trunkPlace(v, place)) best = Math.max(best, parts.trunk(place));
      if (parts.leg && surface.legPlace(v, place)) best = Math.max(best, parts.leg(place, surface.knee));
      // (her arm up to her wrist: the paint stops with the suit's sleeve)
      if (parts.arm && surface.armPlace(v, place) && place.along < 1.0) best = Math.max(best, parts.arm(place));
      inside[v] = best;
    }
    return inside;
  };
}

/** The most of any shapes (how far inside the nearest one a place is). */
const any = (...values: number[]): number => Math.max(-1, ...values);

/**
 * THE SHOULDER CAP: over the top of each shoulder, from the side of her collar out and down the top of her upper arm.
 * On her trunk: up near the base of her neck, round her side; on her arm: its top and outer side, near the shoulder.
 */
// (measured in DEGREES round her, not in lengths: near the base of her neck her trunk is narrow, so a width in lengths
//  spread right across the top of her chest as one band -- the first bake, 2026-11-22; and only her shoulder's top:
//  near her shoulders her trunk is wide and shallow, so most of her upper chest is already far round from her front)
const capOnTrunk = (p: LegPlace, size: number): number =>
  plate(p, { from: 0.93, to: 1.03, centre: 108, widthTop: 10 * size, widthBottom: 16 * size, corner: 0.012 });
const capOnArm = (p: LegPlace, size: number): number =>
  band(p, { from: -0.05, to: 0.17 * size, path: () => 90, half: through([[-0.05, 0.075 * size], [0.17 * size, 0.03 * size]]) });

/**
 * THE SIDE BAND: from under her arm down beside her breast (not over it), in toward her waist, out over her hip to the
 * top of her leg, where the leg's stripe carries on. `waist` is its half-width at her waist (it narrows top and bottom).
 * DRAWN LIVE by the game (liveBand.ts), not painted: this is where each point of her trunk is from it.
 */
const SIDE_PATH = through([[1.0, 86], [0.82, 82], [0.66, 72], [0.45, 64], [0.22, 70], [-0.05, 80]]);
const sideBand = (waist: number, ends: number): ((p: LegPlace) => BandPlace) => {
  const shape: BandShape = { from: -0.05, to: 0.84, path: SIDE_PATH, half: through([[-0.05, ends], [0.3, waist], [0.5, waist], [0.84, ends * 0.7]]) };
  return (p) => bandPlace(p, shape);
};

/** Down the outside of her arm, from her shoulder cap to her wrist. */
const ARM_PATH = through([[0, 86], [0.5, 92], [1, 86]]);
const armStripe = (p: LegPlace, half: number, from = 0.1, offset = 0): number =>
  band(p, { from, to: 0.97, path: (a) => ARM_PATH(a) + offset, half: () => half });
/** A cuff all the way round her wrist. */
const cuff = (p: LegPlace, width: number): number => Math.min(p.along - (0.985 - width), 0.985 - p.along) * 0.6;

/** Down the outside of her leg, from her hip to her ankle. */
const LEG_PATH = through([[-0.05, 80], [0.25, 88], [0.47, 84], [0.75, 78], [0.97, 74]]);
const legStripe = (p: LegPlace, half: number, offset = 0): number =>
  band(p, { from: -0.05, to: 0.95, path: (a) => LEG_PATH(a) + offset, half: () => half });

// ------------------------------------------------------------------ the three suits

/**
 * One of Mary's catsuits: Joshua's plain catsuit, its collar gap filled, its painted layers (bottom first), and the side
 * band the game draws live (`side`: which of the painted layers it belongs to, the colour of, and where it runs).
 */
function marySuitLook(
  painted: readonly { readonly colour: string; readonly paint: MaskPainter }[],
  side: { readonly on: number; readonly trunk: LiveBand['trunk'] },
): HeroineLook {
  // (the painted layers come after his catsuit's two)
  const liveBand: LiveBand = { colour: painted[side.on].colour, layer: 2 + side.on, trunk: side.trunk };
  return {
    name: 'Blaze',
    body: EXPORT_BODY,
    clothes: {
      ...(BLAZE_LOOK.clothes as object),
      // (the outfit's NAME stays Blaze's own: one the builder does not know makes it put its default tee on her)
      // (her boots are the game's: looks/gear.ts)
      shoes: 'none',
      detail: { nipple: null, navel: null },
      layers: [PLAIN_CATSUIT_LAYER, FILL_LAYER, ...painted.map((p) => coded(p.colour))],
    },
    // (layer 1 his template; layer 2 the gap under his collar, up to it: his neckline 1.1)
    // (filled from 0.55 up her trunk: from the usual 0.7 a slit of her skin showed under her cleavage, the first bake)
    maskPainters: [null, fillCleavage(PLAIN_CATSUIT_LAYER.template.params.neckFront, 0.55), ...painted.map((p) => p.paint)],
    liveBand,
    noCleavageBridge: true,
    // (the room's unnamed sheet over her crotch, in her skin's colour, is left out: heroineLook.ts)
    onlyNamedPieces: true,
  };
}

/** THE COLOURS (GAME TUNING, from the board). `suit` is the catsuit's black as a hex, for her 3D gear. */
export const MARY_SUIT_COLOURS = Object.freeze({
  suit: '#121316',
  research: { teal: '#18c6c8', white: '#e4e8ee' },
  explorer: { orange: '#f2961c' },
  stealth: { red: '#e0141c' },
});
const C = MARY_SUIT_COLOURS;

/**
 * M1, THE A.R.C.H. RESEARCH SUIT: teal caps over her shoulders, a teal band down each side (widest at her waist), a thin
 * teal line round each knee and teal cuffs; a white stripe down the outside of each leg and arm, beside the teal.
 */
export const MARY_RESEARCH_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.research.white,
    paint: painter({
      leg: (p) => legStripe(p, 0.012, 6),
      // (a little toward the front of her arm from the teal: at +26 it ran down the back of her arm)
      arm: (p) => armStripe(p, 0.008, 0.22, -24),
    }),
  },
  {
    colour: C.research.teal,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 1),
      leg: (p, knee) => kneeRing(p, knee, { wide: 0.045, tall: 0.06, half: 0.005, lift: 0.005 }),
      arm: (p) => any(capOnArm(p, 1), armStripe(p, 0.008), cuff(p, 0.04)),
    }),
  },
], { on: 1, trunk: sideBand(0.032, 0.012) });

/**
 * M2, THE SUBTERRANEAN EXPLORER: orange caps over her shoulders, a broad orange band down each side, an orange stripe
 * down the outside of each arm and leg, orange cuffs, and a bold orange ring round each knee.
 */
export const MARY_EXPLORER_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.explorer.orange,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 1),
      leg: (p, knee) => any(legStripe(p, 0.008, 4), kneeRing(p, knee, { wide: 0.05, tall: 0.065, half: 0.008, lift: 0.005 })),
      arm: (p) => any(capOnArm(p, 1), armStripe(p, 0.01), cuff(p, 0.045)),
    }),
  },
], { on: 0, trunk: sideBand(0.04, 0.014) });

/**
 * M3, THE STEALTH OPERATIVE: thin red lines, a small red cap over each shoulder, a red line down each side, the
 * outside of each arm and leg, red cuffs and a red ring round each knee.
 */
export const MARY_STEALTH_SUIT_LOOK: HeroineLook = marySuitLook([
  {
    colour: C.stealth.red,
    paint: painter({
      trunk: (p) => capOnTrunk(p, 0.6),
      leg: (p, knee) => any(legStripe(p, 0.008), kneeRing(p, knee, { wide: 0.048, tall: 0.062, half: 0.006, lift: 0.005 })),
      arm: (p) => any(capOnArm(p, 0.6), armStripe(p, 0.008), cuff(p, 0.035)),
    }),
  },
], { on: 0, trunk: sideBand(0.012, 0.009) });
