// ============================================================================
// homeBlocks.ts -- WHAT STOPS ANYONE IN THE FISHERS' HOME: the walls, the shut doors and the furniture, as plain
// boxes, made from the layout (homeLayout.ts) alone.
//
// PURE: no three.js, no page. The drawn home (homeScene.ts) builds its walls from here, and so does the headless
// household simulation (scripts/sim_household.ts), so the simulation walks into the very same chairs and tables the
// game does. (Joshua, 2026-11-26: Mary and John "didn't fill up with food or water and it kept saying they were": the
// dining chairs' seats were 12 cm from the table's edge, a body is kept 30 cm off anything solid, so nobody could ever
// reach one; the simulation's stand-in walked through furniture and never saw it.)
//
//   Block           one box on the floor: its middle, half sizes across and along its own frame, the way it faces;
//                   a door's box is solid only while the door is shut.
//   layoutBlocks    every box of a layout: each wall piece (windows and all), each sliding door (if a door's state is
//                   given; the simulation leaves them open), each solid thing (all but the floor's open spots and the
//                   windows, which stand in their walls).
//   HomeWalls       a walker's walls: a body (a circle of BODY_RADIUS) pushed out of every solid box; while it uses a
//                   thing, that thing's box -- and the thing it belongs with (`partOf`: a dining chair's table, the
//                   desk chair's desk) -- lets it through, but ONLY WITHIN LET_IN OF ITS SPOT (v0.2.181: let through
//                   all the way, Joshua saw them walk through the sofa to its seat); and the OTHER PEOPLE standing in
//                   the house are solid too (`people`): kept their `apart` off.
//   spotPush        how far a body standing on a spot is pushed off it (that thing let in near its spot): the test
//                   every spot passes.
// ============================================================================
import type { GroundPoint } from '../collision';
import type { Walls } from '../../input/playerMotion';
import type { SmartObject, Vec2 } from '../../mind/types';
import type { Doorway, HomeLayout, WallPiece } from './homeLayout';

/** A bed's mattress top over the floor, metres (its frame 0.3 high, the mattress 0.2 on it): where she lies. */
export const MATTRESS_TOP = 0.5;
/** A bed's duvet and pillows: their tops, metres over the floor (where a body lies on them). */
export const DUVET_TOP = 0.555, PILLOW_TOP = 0.62;
/** The duvet reaches from a bed's foot to this far from its head end, metres (to the pillows' front: a body lies on it). */
export const DUVET_FROM_HEAD = 0.5;
/**
 * THE TOILETS' SEAT over the floor, metres: where a body's hips come to rest when it sits, its own `seatFor().top`
 * (Mary 0.50-0.52 m, John 0.51). The toilets were 0.43 (the body sat 7 cm over them). (The chairs and cushions, where
 * the seat and thighs rest on a flat top, are lower: homeScene.ts CHAIR_TOP, CUSHION_TOP.)
 */
export const SEAT_TOP = 0.505;

/** A body is a circle this wide, metres (a doorway is 0.9 m wide). */
export const BODY_RADIUS = 0.3;
/** The walls' thickness: outer and inner, metres. */
export const OUTER_THICK = 0.2, INNER_THICK = 0.12;
/** Out on the lawn, no further than this from the house's middle, metres. */
export const WALK_OUT = 30;
/** A body this near a spot has arrived there (homeMindBody.ts `ARRIVE_WITHIN`), metres: a spot it is pushed further off can never be reached. */
export const SPOT_REACH = 0.12;
/**
 * THE THING BEING USED LETS A BODY IN ONLY THIS NEAR ITS SPOT, metres (its middle from the spot): a body steps into a
 * seat from in front of it, the last stretch, and walks round it the rest of the way (v0.2.181; Joshua, 2026-11-27: "I
 * saw them walk through the couch").
 */
export const LET_IN = 0.7;
/**
 * HOW FAR APART TWO PEOPLE ARE KEPT, their middles, metres (Joshua: "set collisions with each other"): a body standing
 * by the AI keeps the one PLAYED this far off, and so makes way for them (it is pushed); the one played is stopped a
 * little nearer (PLAYER_APART), so they shoulder past the AI rather than stop dead in front of it.
 */
export const PEOPLE_APART = 0.6, PLAYER_APART = 0.45;

/** Another person in the way: where they stand and how far off them a body is kept. */
export interface Person {
  readonly x: number;
  readonly z: number;
  readonly apart: number;
  /** a walker GIVES WAY to them (stops a moment) when they are just ahead: the one played, to the AI */
  readonly yieldTo?: boolean;
}

/** A box on the floor: its middle, its half sizes across (x) and along (z) its own frame, and the way it faces. */
export interface Block {
  readonly cx: number;
  readonly cz: number;
  readonly hx: number;
  readonly hz: number;
  readonly cos: number;
  readonly sin: number;
  /** solid only while this says so (a door: while it is shut) */
  readonly solid?: () => boolean;
  /** the camera keeps off it too (walls and doors, not furniture) */
  readonly view: boolean;
  /** the thing it is (furniture), or null (a wall, a door) */
  readonly objectId: string | null;
  /** a sliding door */
  readonly door: boolean;
  /** how far from its middle any of it reaches (a quick first test) */
  readonly reach: number;
}

export function block(cx: number, cz: number, w: number, d: number, facing: number, view: boolean, solid?: () => boolean, objectId: string | null = null): Block {
  return { cx, cz, hx: w / 2, hz: d / 2, cos: Math.cos(facing), sin: Math.sin(facing), view, solid, reach: Math.hypot(w, d) / 2, objectId, door: !!solid };
}

/** Is this thing solid (it stops a body)? Everything but an open spot on the floor (the mat) and a window (it stands in its wall). */
export function isSolid(o: SmartObject): boolean {
  return o.type !== 'floorSpot' && o.type !== 'window';
}

/** The box of one wall piece (the whole piece, windows and all). */
export function wallBlock(p: WallPiece): Block {
  const thick = p.outer ? OUTER_THICK : INNER_THICK;
  const alongX = Math.abs(p.a.z - p.b.z) < 1e-6;
  const lo = alongX ? Math.min(p.a.x, p.b.x) : Math.min(p.a.z, p.b.z), hi = alongX ? Math.max(p.a.x, p.b.x) : Math.max(p.a.z, p.b.z);
  const line = alongX ? p.a.z : p.a.x;
  const len = hi - lo, mid = (lo + hi) / 2;
  return alongX ? block(mid, line, len, thick, 0, true) : block(line, mid, thick, len, 0, true);
}

/** The box of a sliding door, solid while `shut()` says so. */
export function doorBlock(dw: Doorway, shut: () => boolean): Block {
  const thick = dw.rooms.includes('outside') ? OUTER_THICK : INNER_THICK;
  return dw.along === 'x' ? block(dw.at.x, dw.at.z, dw.width, thick, 0, true, shut) : block(dw.at.x, dw.at.z, thick, dw.width, 0, true, shut);
}

/** The box of one thing (only a solid one has one). */
export function objectBlock(o: SmartObject): Block {
  return block(o.at.x, o.at.z, o.size.w, o.size.d, o.facing, false, undefined, o.id);
}

/**
 * Every box of a layout: its walls, its sliding doors (each solid while `doorShut(door)` says so; with no `doorShut`,
 * the doors are left out: always open, as the simulation has them), and its solid things.
 */
export function layoutBlocks(layout: HomeLayout, doorShut?: (dw: Doorway) => () => boolean): Block[] {
  const blocks = layout.walls.map(wallBlock);
  if (doorShut) for (const dw of layout.doors.filter((d) => d.kind === 'sliding')) blocks.push(doorBlock(dw, doorShut(dw)));
  for (const o of layout.objects) if (isSolid(o)) blocks.push(objectBlock(o));
  return blocks;
}

/**
 * A WALKER'S WALLS: its circle pushed out of every solid box, three times over so a corner between two lets it go.
 * While it uses a thing (`ignore`), that thing lets it through, and so do the things that belong with it (`with`:
 * filled from each thing's `partOf`, both ways: a dining chair lets you through its table, and the table its chairs).
 */
export class HomeWalls implements Walls {
  /** the thing this walker is using now: its box, and its kin's, let them through (within LET_IN of `ignoreAt`) */
  ignore: string | null = null;
  /** the spot of the thing being used: only this near it is the thing let through (null: anywhere) */
  ignoreAt: Vec2 | null = null;
  /** the other people standing in the house (asked each step): a body is kept off each by their `apart` */
  people: () => readonly Person[] = () => [];
  /** each thing's kin (a chair's table; a table's chairs) */
  private readonly kin = new Map<string, Set<string>>();

  constructor(private readonly blocks: readonly Block[], private readonly middle: Vec2, objects: readonly SmartObject[] = []) {
    for (const o of objects) {
      if (!o.partOf) continue;
      const a = this.kin.get(o.id) ?? new Set<string>(), b = this.kin.get(o.partOf) ?? new Set<string>();
      a.add(o.partOf);
      b.add(o.id);
      this.kin.set(o.id, a);
      this.kin.set(o.partOf, b);
    }
  }

  /** Does the thing being used let a body at (x, z) through `objectId`'s box? Only near its spot. */
  private letsThrough(objectId: string | null, x: number, z: number): boolean {
    if (this.ignore === null || objectId === null) return false;
    if (objectId !== this.ignore && !(this.kin.get(this.ignore)?.has(objectId) ?? false)) return false;
    return this.ignoreAt === null || Math.hypot(x - this.ignoreAt.x, z - this.ignoreAt.z) <= LET_IN;
  }

  move(x: number, z: number, stepX: number, stepZ: number, out: GroundPoint): GroundPoint {
    let nx = x + stepX, nz = z + stepZ;
    const people = this.people();
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      // (the other people first: pushed off them, then the furniture and walls have the last word)
      for (const p of people) {
        let dx = nx - p.x, dz = nz - p.z;
        const d = Math.hypot(dx, dz);
        if (d >= p.apart) continue;
        // (right on top of them: out the way the step came from, or any way)
        if (d < 1e-4) { dx = -stepX || 1; dz = -stepZ; }
        const len = Math.hypot(dx, dz);
        nx = p.x + (dx / len) * p.apart;
        nz = p.z + (dz / len) * p.apart;
        moved = true;
      }
      for (const b of this.blocks) {
        const dx = nx - b.cx, dz = nz - b.cz;
        if (Math.abs(dx) > b.reach + BODY_RADIUS || Math.abs(dz) > b.reach + BODY_RADIUS) continue;
        if (b.solid && !b.solid()) continue;
        if (this.letsThrough(b.objectId, nx, nz)) continue;
        // (into the box's own frame: its x across, its z the way it faces)
        const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
        const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
        let px = lx - qx, pz = lz - qz;
        const dist = Math.hypot(px, pz);
        if (dist >= BODY_RADIUS) continue;
        if (dist > 1e-6) {
          const push = (BODY_RADIUS - dist) / dist;
          px *= push; pz *= push;
        } else {
          // (its middle inside the box: out by the nearest side)
          const toX = b.hx - Math.abs(lx), toZ = b.hz - Math.abs(lz);
          if (toX < toZ) { px = Math.sign(lx || 1) * (toX + BODY_RADIUS); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (toZ + BODY_RADIUS); }
        }
        // (back to the world: the inverse of the turn above)
        nx += px * b.cos + pz * b.sin;
        nz += -px * b.sin + pz * b.cos;
        moved = true;
      }
      if (!moved) break;
    }
    // (out on the lawn, no further than WALK_OUT from the house)
    const ox = nx - this.middle.x, oz = nz - this.middle.z, far = Math.hypot(ox, oz);
    if (far > WALK_OUT) { nx = this.middle.x + (ox / far) * WALK_OUT; nz = this.middle.z + (oz / far) * WALK_OUT; }
    out.x = nx; out.z = nz;
    return out;
  }
}

/**
 * HOW FAR OFF ITS SPOT A BODY IS PUSHED standing on `spot` while using `objectId` (that thing, and its kin, let through
 * within LET_IN of `letInAt`, the thing's own spot to use it from), metres. Over SPOT_REACH, nobody can ever arrive there.
 */
export function spotPush(walls: HomeWalls, objectId: string | null, spot: Vec2, letInAt: Vec2 | null = spot): number {
  const was = walls.ignore, wasAt = walls.ignoreAt, wasPeople = walls.people;
  walls.ignore = objectId; walls.ignoreAt = letInAt; walls.people = () => [];
  const out: GroundPoint = { x: 0, z: 0 };
  walls.move(spot.x, spot.z, 0, 0, out);
  walls.ignore = was; walls.ignoreAt = wasAt; walls.people = wasPeople;
  return Math.hypot(out.x - spot.x, out.z - spot.z);
}
