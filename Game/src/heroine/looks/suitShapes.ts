// ============================================================================
// suitShapes.ts -- THE SHAPES MARY'S OUTFITS ARE PAINTED WITH, shared by her
// catsuits (marySuits.ts) and her casual sets (casualSets.ts): bands that
// curve round her and change width as they go, shoulder caps, stripes down her
// arms and legs, wrist cuffs, rings round her knees, and the side band the
// game draws live (liveBand.ts).
//
// Every shape answers, for one point of her skin, HOW FAR INSIDE IT the point
// is (minus: outside), as the builder's painted layers want (paintMask.ts):
// `along` up her TRUNK (0 her hip joints, 1 the base of her neck), down her
// LEG (0 the hip joint, about 0.47 the knee, 1 the ankle) or ARM (0 the
// shoulder, 1 the wrist); `turn` degrees round her (0 her front, +90 her outer
// side, 180 her back, both sides mirrored); widths in leg lengths (0.01 is
// about 8 mm). Measured on her own body, so they lie where they should at any
// shape. (Moved here from marySuits.ts unchanged, 2026-11-23.)
// ============================================================================
import { plate, turnBetween, type LegPlace, type MaskPainter, type PaintSurface } from '../paintMask';
import type { BandPlace } from '../liveBand';

export const RADIANS = Math.PI / 180;
/** A smooth step from 0 (at `a`) to 1 (at `b`). */
export const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A curve through (along, value) points, eased between them: where a band runs, or how wide it is, as it goes. */
export const through = (given: readonly (readonly [number, number])[]) => {
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
export interface BandShape { readonly from: number; readonly to: number; readonly path: (along: number) => number; readonly half: (along: number) => number }

/**
 * Where a place is from a BAND (a stripe whose width may change as it goes: paintMask.ts `stripe` with a width for each
 * height): how far across from its middle line (signed), its half-width at the nearest place along it, and how far past
 * either end. Its ends are rounded.
 */
export function bandPlace(place: LegPlace, o: BandShape): BandPlace {
  const along = Math.min(o.to, Math.max(o.from, place.along));
  // (a band that slants is measured square to itself, not straight across)
  const step = 0.004, slope = ((o.path(along + step) - o.path(along - step)) / (2 * step)) * RADIANS * place.radius;
  const across = (turnBetween(place.turn, o.path(along)) * RADIANS * place.radius) / Math.sqrt(1 + slope * slope);
  return { across, half: o.half(along), past: Math.abs(place.along - along) };
}

/** A BAND as paint: how far inside it the place is (minus: outside). */
export function band(place: LegPlace, o: BandShape): number {
  const at = bandPlace(place, o);
  return at.half - Math.hypot(at.across, at.past);
}

/**
 * A RING round the front of her knee (an oval line round her kneecap): `wide` and `tall` its half-sizes, `half` half its
 * line's width (leg lengths). `knee` is where her knee is down her leg (the surface measures it).
 */
export function kneeRing(place: LegPlace, knee: number, o: { wide: number; tall: number; half: number; lift: number }): number {
  const x = turnBetween(place.turn, 0) * RADIANS * place.radius, y = place.along - (knee - o.lift);
  // how far from the oval's line: its "radius" there, less the oval's own (good enough for a near-round oval)
  const r = Math.hypot(x / o.wide, y / o.tall), scale = Math.min(o.wide, o.tall);
  return o.half - Math.abs(r - 1) * scale;
}

/** One painted layer from a rule for each part of her (each returns how far inside its shapes a point is). */
export function painter(parts: {
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
export const any = (...values: number[]): number => Math.max(-1, ...values);

/**
 * THE SHOULDER CAP: over the top of each shoulder, from the side of her collar out and down the top of her upper arm.
 * On her trunk: up near the base of her neck, round her side; on her arm: its top and outer side, near the shoulder.
 */
// (measured in DEGREES round her, not in lengths: near the base of her neck her trunk is narrow, so a width in lengths
//  spread right across the top of her chest as one band -- the first bake, 2026-11-22; and only her shoulder's top:
//  near her shoulders her trunk is wide and shallow, so most of her upper chest is already far round from her front)
export const capOnTrunk = (p: LegPlace, size: number): number =>
  plate(p, { from: 0.93, to: 1.03, centre: 108, widthTop: 10 * size, widthBottom: 16 * size, corner: 0.012 });
export const capOnArm = (p: LegPlace, size: number): number =>
  band(p, { from: -0.05, to: 0.17 * size, path: () => 90, half: through([[-0.05, 0.075 * size], [0.17 * size, 0.03 * size]]) });

/**
 * THE SIDE BAND: from under her arm down beside her breast (not over it), in toward her waist, out over her hip to the
 * top of her leg, where the leg's stripe carries on. `waist` is its half-width at her waist (it narrows top and bottom).
 * DRAWN LIVE by the game (liveBand.ts), not painted: this is where each point of her trunk is from it.
 */
export const SIDE_PATH = through([[1.0, 86], [0.82, 82], [0.66, 72], [0.45, 64], [0.22, 70], [-0.05, 80]]);
export const sideBand = (waist: number, ends: number): ((p: LegPlace) => BandPlace) => {
  const shape: BandShape = { from: -0.05, to: 0.84, path: SIDE_PATH, half: through([[-0.05, ends], [0.3, waist], [0.5, waist], [0.84, ends * 0.7]]) };
  return (p) => bandPlace(p, shape);
};

/** Down the outside of her arm, from her shoulder cap to her wrist. */
export const ARM_PATH = through([[0, 86], [0.5, 92], [1, 86]]);
export const armStripe = (p: LegPlace, half: number, from = 0.1, offset = 0): number =>
  band(p, { from, to: 0.97, path: (a) => ARM_PATH(a) + offset, half: () => half });
/** A cuff all the way round her wrist. */
export const cuff = (p: LegPlace, width: number): number => Math.min(p.along - (0.985 - width), 0.985 - p.along) * 0.6;

/** Down the outside of her leg, from her hip to her ankle. */
export const LEG_PATH = through([[-0.05, 80], [0.25, 88], [0.47, 84], [0.75, 78], [0.97, 74]]);
export const legStripe = (p: LegPlace, half: number, offset = 0): number =>
  band(p, { from: -0.05, to: 0.95, path: (a) => LEG_PATH(a) + offset, half: () => half });

