// ============================================================================
// homeLayout.ts -- A HOME, GENERATED FROM A ROOM LIST: its rooms, walls, sliding doors and every thing in it, with the
// metadata the mind uses (src/mind/types.ts SmartObject). PLAIN DATA: no three.js. The headless household simulation
// (scripts/sim_household.ts) lives in it now; the drawn house (phase 3) and the walk grid (phase 4) are made from it.
//
// Joshua, 2026-11-26 (the plan's floor plan, approved): one floor, about 16 x 12 m, every room off one hallway; a main
// bedroom with its own bathroom, a second bathroom, two more bedrooms; an open kitchen with dining and an open living
// room at the front; a front door and a back door; automatic SLIDING doors (his 5a). "Prioritize functionality over
// detailed decoration initially. The house should eventually support reusable procedural layouts, different sizes and
// multiple residences."
//
// HOW IT IS LAID OUT (seen from above, north up; x east, z north; the house's own 0,0 its south-west corner, moved to
// `origin` in the world):
//
//     z = D   +------------+------+------+--------+--------+
//             | main bed   |ensuite| bath |  bed 2 |  bed 3 |   BACK ROW: rooms with a door onto the hall
//             |            |       |      |        |        |   (the ensuite's door is into the main bedroom)
//             +----D-------+------+--D---+---D----+---D----+
//             |                 HALL                        |
//             +- - - - - - - - - +-----+- - - - - - - - - - +   FRONT ROW: open onto the hall (dashed)
//             |  living          |entry|  kitchen + dining  D   (back door, east)
//             |                  |     |                    |
//     z = 0   +------------------+--D--+--------------------+   (front door, south)
//
// A room list (HomeSpec) gives each row's rooms and their widths; the furnishing below places each kind's things
// against its walls, so a wider or narrower home lays out the same way.
// ============================================================================
import type { ActorId, Motion, ObjectSlot, ObjectType, SmartObject, Vec2 } from '../../mind/types';
import { START_STOCK } from '../../mind/food';

/** The kinds of room a home is made of. */
export type RoomKind = 'mainBedroom' | 'bedroom' | 'bathroom' | 'ensuite' | 'living' | 'entry' | 'kitchen' | 'hall';

/** A rectangle on the floor, metres: x from x0 to x1, z from z0 to z1. */
export interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** One room as built. */
export interface Room {
  readonly id: string;
  readonly kind: RoomKind;
  readonly name: string;
  readonly rect: Rect;
}

/**
 * A DOORWAY: two rooms joined at a point on the wall between them. `sliding` doors open by themselves as someone comes
 * near (Joshua's 5a); `open` doorways have no door at all (the living room and kitchen onto the hall). `outside` is the
 * name used for the world beyond an outer door.
 */
export interface Doorway {
  readonly id: string;
  readonly rooms: readonly [string, string];
  /** its middle, on the wall */
  readonly at: Vec2;
  /** how wide the gap is, metres */
  readonly width: number;
  /** the wall it is in runs along x ('x') or along z ('z') */
  readonly along: 'x' | 'z';
  readonly kind: 'sliding' | 'open';
}

/** A STRAIGHT PIECE OF WALL (doorways are gaps between pieces). Windows are wall that can be looked out of. */
export interface WallPiece {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly outer: boolean;
  /** a window along it (only the drawing cares: it is still wall to walk into) */
  readonly window?: boolean;
}

/** The whole home. */
export interface HomeLayout {
  readonly id: string;
  readonly name: string;
  /** where the house's own 0,0 sits in the world */
  readonly origin: Vec2;
  readonly size: { readonly w: number; readonly d: number };
  readonly rooms: readonly Room[];
  readonly doors: readonly Doorway[];
  readonly walls: readonly WallPiece[];
  readonly objects: readonly SmartObject[];
  /** where each resident starts (and later, comes home to) */
  readonly spawns: Readonly<Record<ActorId, Vec2>>;
  /** a place or two in each room to stand about in (wandering, a chat): room id to spots */
  readonly standSpots: Readonly<Record<string, readonly Vec2[]>>;
}

/** One room of a row in the list, and how wide it is. */
export interface RoomSpec {
  readonly kind: RoomKind;
  readonly width: number;
  readonly name?: string;
}

/** A HOME AS A ROOM LIST: the back row and the front row, their depths, the hall between, who sleeps where, the larder. */
export interface HomeSpec {
  readonly id: string;
  readonly name: string;
  readonly back: readonly RoomSpec[];
  readonly front: readonly RoomSpec[];
  readonly backDepth: number;
  readonly hallWidth: number;
  readonly frontDepth: number;
  /** the main bed's two sides: [west, east] */
  readonly mainBed: readonly [ActorId, ActorId];
  /** who lives here, and where each starts */
  readonly residents: Readonly<Record<ActorId, Vec2>>;
}

/**
 * THE FISHERS' HOME, the approved plan (the AI Brain & Home plan doc, 2026-11-26): 16 x 12 m. Mary on the bed's west
 * side, John on its east (a first guess: Joshua can swap them). The fridge holds 60 meals and 40 drinks, the cabinet 30
 * snacks: a well-stocked home for several days (the simulation's pantry test empties them on purpose).
 */
export const FISHER_HOME: HomeSpec = {
  id: 'fisher-home',
  name: "The Fishers' home",
  back: [
    { kind: 'mainBedroom', width: 5, name: 'Main bedroom' },
    { kind: 'ensuite', width: 2.5, name: 'Bath 1' },
    { kind: 'bathroom', width: 2.5, name: 'Bath 2' },
    { kind: 'bedroom', width: 3, name: 'Bedroom 2' },
    { kind: 'bedroom', width: 3, name: 'Bedroom 3' },
  ],
  front: [
    { kind: 'living', width: 7, name: 'Living room' },
    { kind: 'entry', width: 2, name: 'Entry' },
    { kind: 'kitchen', width: 7, name: 'Kitchen and dining' },
  ],
  backDepth: 5,
  hallWidth: 1.5,
  frontDepth: 5.5,
  mainBed: ['mary', 'john'],
  residents: { mary: { x: 5.0, z: 3.6 }, john: { x: 5.6, z: 2.2 } },
};

/** Inner doors: how wide the gap is. The front door is wider. */
const DOOR_WIDTH = 0.9, FRONT_DOOR_WIDTH = 1.2;
/** Compass yaws: facing +z (north) is 0, east +PI/2, west -PI/2, south PI. */
const NORTH = 0, EAST = Math.PI / 2, SOUTH = Math.PI, WEST = -Math.PI / 2;
/**
 * SEATS (Joshua, 2026-11-26, his screenshots: Mary's shins through the sofa's front, nobody able to reach a dining
 * chair). Sitting takes a body BACK from where it stood to where its hips rest by about this much (each body's own
 * `seatFor().back`: Mary 0.39 m, John 0.35 m), metres: the body stands this far in front of where its hips are to go.
 */
export const SEAT_BACK = 0.37;
/** Where the hips rest, metres along the seat's facing from the thing's middle: the sofa (0.9 m deep, its cushions'
 *  front edge 0.42 m out) and the armchair (0.8 m) on the front of their cushions, the toilet over its middle (the
 *  pop-up toilet's own model: its hips 6 cm in front of its middle). The feet then stand 12 cm clear of the front. */
const SOFA_HIPS = 0.2, ARMCHAIR_HIPS = 0.15, TOILET_HIPS = 0.06;
/** A dining chair's middle is pulled out this far from the table's edge, metres (its sitter stands 0.21 m off the edge). */
const CHAIR_OUT = 0.6;

/**
 * BUILDS A HOME from its room list, in the world at `origin` (the house's own south-west corner). Every number here
 * is in the house's own metres first and moved to the world at the end (`at`).
 */
export function generateHome(spec: HomeSpec = FISHER_HOME, origin: Vec2 = { x: -8, z: -6 }): HomeLayout {
  const W = Math.max(sum(spec.back), sum(spec.front));
  const zHall0 = spec.frontDepth, zHall1 = spec.frontDepth + spec.hallWidth, D = zHall1 + spec.backDepth;
  const at = (x: number, z: number): Vec2 => ({ x: origin.x + x, z: origin.z + z });
  const rectAt = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0: origin.x + x0, z0: origin.z + z0, x1: origin.x + x1, z1: origin.z + z1 });

  // ---- 1. ROOMS: the back row, the hall, the front row (the last room of a row stretched to the full width) --------
  const rooms: Room[] = [];
  const local = new Map<string, Rect>();   // (each room's rectangle in the house's own metres, for the furnishing)
  const kindCount = new Map<RoomKind, number>();
  const idFor = (kind: RoomKind): string => {
    const n = (kindCount.get(kind) ?? 0) + 1;
    kindCount.set(kind, n);
    return n === 1 ? kind : `${kind}${n}`;
  };
  const addRow = (row: readonly RoomSpec[], z0: number, z1: number): Room[] => {
    const made: Room[] = [];
    let x = 0;
    row.forEach((r, i) => {
      const x1 = i === row.length - 1 ? W : x + r.width;
      const id = idFor(r.kind);
      local.set(id, { x0: x, z0, x1, z1 });
      const room: Room = { id, kind: r.kind, name: r.name ?? id, rect: rectAt(x, z0, x1, z1) };
      rooms.push(room);
      made.push(room);
      x = x1;
    });
    return made;
  };
  const backRow = addRow(spec.back, zHall1, D);
  local.set('hall', { x0: 0, z0: zHall0, x1: W, z1: zHall1 });
  rooms.push({ id: 'hall', kind: 'hall', name: 'Hallway', rect: rectAt(0, zHall0, W, zHall1) });
  const frontRow = addRow(spec.front, 0, zHall0);
  const L = (id: string): Rect => local.get(id)!;

  // ---- 2. DOORWAYS ---------------------------------------------------------------------------------------------
  const doors: Doorway[] = [];
  // the back row: each room's sliding door onto the hall, in the middle of its south wall; an ensuite's into the room
  // beside it (the one before it in the row), on the wall between them, toward the north end
  backRow.forEach((room, i) => {
    const r = L(room.id);
    if (room.kind === 'ensuite' && i > 0) {
      doors.push({ id: `door-${room.id}`, rooms: [backRow[i - 1].id, room.id], at: at(r.x0, r.z0 + (r.z1 - r.z0) * 0.7), width: DOOR_WIDTH, along: 'z', kind: 'sliding' });
    } else {
      doors.push({ id: `door-${room.id}`, rooms: ['hall', room.id], at: at((r.x0 + r.x1) / 2, r.z0), width: DOOR_WIDTH, along: 'x', kind: 'sliding' });
    }
  });
  // the front row: open onto the hall along its whole width (an open doorway every 0.75 m along it, so the way from
  // the hall in can come straight in), the entry's front door in the middle of its south wall, the kitchen's back
  // door in the house's east wall if the kitchen is at the east end
  for (const room of frontRow) {
    const r = L(room.id);
    const steps = Math.max(1, Math.floor((r.x1 - r.x0 - 0.6) / 0.75));
    for (let k = 0; k <= steps; k++) {
      const x = r.x0 + 0.3 + ((r.x1 - r.x0 - 0.6) * k) / steps;
      doors.push({ id: `open-${room.id}-${k}`, rooms: ['hall', room.id], at: at(x, r.z1), width: 0.75, along: 'x', kind: 'open' });
    }
    if (room.kind === 'entry') doors.push({ id: 'front-door', rooms: [room.id, 'outside'], at: at((r.x0 + r.x1) / 2, 0), width: FRONT_DOOR_WIDTH, along: 'x', kind: 'sliding' });
    if (room.kind === 'kitchen' && r.x1 >= W - 1e-6) doors.push({ id: 'back-door', rooms: [room.id, 'outside'], at: at(W, 2.3), width: DOOR_WIDTH, along: 'z', kind: 'sliding' });
  }

  // ---- 3. WALLS: the outer box, the hall's north wall, the back row's partitions and the front row's around the
  // entry; each cut where a sliding door is (open doorways have no wall at all) ------------------------------------
  const walls: WallPiece[] = [];
  const sliding = doors.filter((d) => d.kind === 'sliding');
  /** A straight wall from a to b (house metres), cut round every sliding door that lies on it. */
  const wall = (ax: number, az: number, bx: number, bz: number, outer: boolean, window = false): void => {
    const horizontal = az === bz;
    const lo = horizontal ? Math.min(ax, bx) : Math.min(az, bz), hi = horizontal ? Math.max(ax, bx) : Math.max(az, bz);
    const cuts = sliding
      .filter((d) => (horizontal ? d.along === 'x' && Math.abs(d.at.z - origin.z - az) < 1e-6 : d.along === 'z' && Math.abs(d.at.x - origin.x - ax) < 1e-6))
      .map((d) => { const c = horizontal ? d.at.x - origin.x : d.at.z - origin.z; return [c - d.width / 2, c + d.width / 2] as const; })
      .filter(([a, b]) => b > lo && a < hi)
      .sort((p, q) => p[0] - q[0]);
    let from = lo;
    for (const [a, b] of cuts) {
      if (a > from + 1e-6) walls.push(horizontal ? { a: at(from, az), b: at(a, az), outer, window } : { a: at(ax, from), b: at(ax, a), outer, window });
      from = Math.max(from, b);
    }
    if (hi > from + 1e-6) walls.push(horizontal ? { a: at(from, az), b: at(hi, az), outer, window } : { a: at(ax, from), b: at(ax, hi), outer, window });
  };
  wall(0, 0, W, 0, true, true);     // south (front), windows
  wall(0, D, W, D, true, true);     // north (back), windows
  wall(0, 0, 0, D, true, true);     // west
  wall(W, 0, W, D, true, true);     // east
  wall(0, zHall1, W, zHall1, false);   // the hall's north wall, the back row's doors in it
  for (const room of backRow.slice(1)) { const r = L(room.id); wall(r.x0, zHall1, r.x0, D, false); }
  for (const room of frontRow) {
    // (only the entry is walled off from its neighbours; the living room and kitchen are open to the hall)
    if (room.kind !== 'entry') continue;
    const r = L(room.id);
    wall(r.x0, 0, r.x0, zHall0, false);
    wall(r.x1, 0, r.x1, zHall0, false);
  }

  // ---- 4. FURNISHING: each kind of room's things against its walls (in the house's own metres, then moved) -------
  const objects: SmartObject[] = [];
  const standSpots: Record<string, Vec2[]> = {};
  const used = new Map<string, number>();
  /** A thing at (x, z) in house metres, facing `facing`, with its slots (also in house metres). */
  /** Put a thing in the home; returns its id (a chair is put `partOf` its table by that id). */
  const put = (type: ObjectType, name: string, room: string, x: number, z: number, facing: number, w: number, d: number, slots: SlotSpec[], extra: { items?: SmartObject['items']; tags?: string[]; partOf?: string } = {}): string => {
    const n = (used.get(type) ?? 0) + 1;
    used.set(type, n);
    const id = `${type}-${n}`;
    objects.push({
      id, type, name, room, at: at(x, z), facing, size: { w, d },
      slots: slots.map((s) => ({ id: s.id, use: at(s.use[0], s.use[1]), facing: s.facing, approach: at(s.approach[0], s.approach[1]), motion: s.motion, ...(s.owner ? { owner: s.owner } : {}) })),
      ...(extra.items ? { items: extra.items } : {}),
      ...(extra.tags ? { tags: extra.tags } : {}),
      ...(extra.partOf ? { partOf: extra.partOf } : {}),
    });
    return id;
  };
  /** A slot standing in front of a thing: `out` metres out along the way its front faces, the body facing back at it. */
  const front = (id: string, x: number, z: number, facing: number, out: number, motion: Motion = 'stand', owner?: ActorId): SlotSpec => ({
    id, use: [x + Math.sin(facing) * out, z + Math.cos(facing) * out], facing: facing + Math.PI,
    approach: [x + Math.sin(facing) * (out + 0.5), z + Math.cos(facing) * (out + 0.5)], motion, owner,
  });
  /**
   * A SEAT: the body stands in front of it, facing the way it faces, and sits back onto it. `hipsAt` is where on the
   * seat the hips are to come to rest, metres along its facing from (x, z) (the thing's middle); the body stands
   * SEAT_BACK in front of that (as far as sitting takes it back: each body's own, `seatFor().back`, Mary 0.39 m, John
   * 0.35 m), so its feet are clear of the seat's front (Joshua's sofa screenshot, 2026-11-26: the spot was 0.32 m out
   * from every seat's middle, which on the 0.9 m deep sofa is INSIDE it: Mary's feet stood in its base and her shins
   * came through its front). It is come at from straight in front.
   */
  const seat = (id: string, x: number, z: number, facing: number, hipsAt: number, owner?: ActorId): SlotSpec => {
    const s = Math.sin(facing), c = Math.cos(facing), u = hipsAt + SEAT_BACK;
    return { id, use: [x + s * u, z + c * u], facing, approach: [x + s * (u + 0.55), z + c * (u + 0.55)], motion: 'sit', owner };
  };
  /**
   * A CHAIR AT A TABLE (a dining chair, the desk chair): pulled out from it (`out` metres from the table's edge to the
   * chair's middle), facing it. The hips rest just behind the chair's middle; the body stands SEAT_BACK in front of
   * that, between the chair and the table, and comes at it from BEHIND the chair (the table's in front). The chair is
   * put `partOf` the table, so whoever uses it may stand over the table's edge (homeBlocks.ts): a body is kept 0.3 m
   * off anything solid, and the chairs' spots were 12 cm from the table's edge, so nobody could ever sit at the table
   * (Joshua, 2026-11-26: they "didn't fill up with food or water").
   */
  const tableSeat = (cx: number, cz: number, facing: number): SlotSpec => {
    const s = Math.sin(facing), c = Math.cos(facing), u = -0.02 + SEAT_BACK;
    return { id: 'seat', use: [cx + s * u, cz + c * u], facing, approach: [cx - s * 0.55, cz - c * 0.55], motion: 'sit' };
  };
  const spots = (room: string, ...pts: [number, number][]): void => { standSpots[room] = pts.map(([x, z]) => at(x, z)); };

  let bedroomIndex = 0;
  for (const room of rooms) {
    const r = L(room.id), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    switch (room.kind) {
      case 'mainBedroom': {
        // a double bed, its head against the north wall, one side each (who sleeps where: spec.mainBed); a wardrobe
        // on the west wall; the window on the west wall by the bed
        const bz = r.z1 - 1.05;
        put('bed', 'Double bed', room.id, cx, bz, SOUTH, 1.6, 2.1, [
          { id: 'west', use: [cx - 0.4, r.z1 - 0.55], facing: SOUTH, approach: [cx - 1.25, bz], motion: 'lie', owner: spec.mainBed[0] },
          { id: 'east', use: [cx + 0.4, r.z1 - 0.55], facing: SOUTH, approach: [cx + 1.25, bz], motion: 'lie', owner: spec.mainBed[1] },
        ], { tags: ['double'] });
        put('wardrobe', 'Wardrobe', room.id, r.x0 + 0.3, r.z0 + 1.4, EAST, 1.2, 0.6, [front('front', r.x0 + 0.3, r.z0 + 1.4, EAST, 0.65)]);
        if (r.x0 === 0) put('window', 'Bedroom window', room.id, r.x0 + 0.05, r.z1 - 0.45, EAST, 1.0, 0.1, [front('look', r.x0 + 0.05, r.z1 - 0.45, EAST, 0.55)]);
        spots(room.id, [cx - 1.4, r.z0 + 1.3], [cx + 1.3, r.z0 + 1.6]);
        break;
      }
      case 'ensuite':
      case 'bathroom': {
        // a toilet against the north wall at the east end; a shower in a corner away from the door; a sink on the
        // east wall (an ensuite's door is on its west wall, a bathroom's on its south wall)
        const tx = r.x1 - 0.5, tz = r.z1 - 0.4;
        put('toilet', room.kind === 'ensuite' ? 'Toilet (bath 1)' : `Toilet (${room.name.toLowerCase()})`, room.id, tx, tz, SOUTH, 0.4, 0.7, [seat('seat', tx, tz, SOUTH, TOILET_HIPS)]);
        const showerSouth = room.kind === 'ensuite';
        const sx = showerSouth ? r.x1 - 0.55 : r.x0 + 0.55, sz = showerSouth ? r.z0 + 0.6 : r.z1 - 0.55;
        put('shower', 'Shower', room.id, sx, sz, showerSouth ? NORTH : SOUTH, 1.1, 1.1, [{ id: 'in', use: [sx, sz], facing: showerSouth ? NORTH : SOUTH, approach: [sx + (showerSouth ? -0.2 : 0.3), sz + (showerSouth ? 0.9 : -0.9)], motion: 'stand' }]);
        const kz = showerSouth ? r.z0 + 2.2 : r.z0 + 1.8;
        put('sink', `Sink (${room.name.toLowerCase()})`, room.id, r.x1 - 0.25, kz, WEST, 0.5, 0.45, [front('front', r.x1 - 0.25, kz, WEST, 0.5)]);
        spots(room.id, [cx - 0.2, cz - 0.4]);
        break;
      }
      case 'bedroom': {
        // a single bed, its head against the north wall at the east end; the first spare room a wardrobe, the next a
        // desk and chair, on the west wall; a window on the north wall at the west end
        bedroomIndex++;
        const bx = r.x1 - 0.55, bz = r.z1 - 1.0;
        put('bed', `Bed (${room.name.toLowerCase()})`, room.id, bx, bz, SOUTH, 0.9, 2.0, [
          { id: 'side', use: [bx, r.z1 - 0.5], facing: SOUTH, approach: [bx - 0.85, bz], motion: 'lie' },
        ], { tags: ['single', 'guest'] });
        if (bedroomIndex % 2 === 1) put('wardrobe', 'Wardrobe', room.id, r.x0 + 0.3, r.z0 + 1.6, EAST, 1.2, 0.6, [front('front', r.x0 + 0.3, r.z0 + 1.6, EAST, 0.65)]);
        else {
          // (the desk, 1.2 long against the west wall; tidied from its south end, where the chair is not)
          const dz = r.z1 - 1.6;
          const desk = put('desk', 'Desk', room.id, r.x0 + 0.3, dz, EAST, 1.2, 0.6, [{
            id: 'front', use: [r.x0 + 0.95, dz - 0.55], facing: WEST, approach: [r.x0 + 1.45, dz - 0.55], motion: 'stand',
          }]);
          // (the chair at the desk, pulled out 0.4 m from its edge: she sits facing the desk, west; further out, it closed
          //  the way between it and the bed to the window: the walk grid's squares are 15 cm, and a gap must be wider
          //  than a body's 0.6 m by about a square)
          const chairX = r.x0 + 0.6 + 0.4;
          put('deskChair', 'Desk chair', room.id, chairX, dz, WEST, 0.5, 0.5, [tableSeat(chairX, dz, WEST)], { tags: ['read'], partOf: desk });
        }
        // (the window toward the room's middle: at its west end the desk stood in the way of looking out)
        put('window', `Window (${room.name.toLowerCase()})`, room.id, r.x0 + 1.6, r.z1 - 0.05, SOUTH, 1.0, 0.1, [front('look', r.x0 + 1.6, r.z1 - 0.05, SOUTH, 0.55)]);
        spots(room.id, [cx - 0.4, r.z0 + 1.0]);
        break;
      }
      case 'living': {
        // the screen on the west wall; the sofa facing it (three seats); two armchairs either side, turned toward it;
        // the front window on the south wall; an open patch of floor for exercise
        const sx = r.x0 + 0.15, sz = cz;
        put('screen', 'Screen', room.id, sx, sz, EAST, 2.0, 0.15, [front('front', sx, sz, EAST, 1.2)], { tags: ['screen'] });
        const fx = r.x0 + 3.6;
        put('sofa', 'Sofa', room.id, fx, cz, WEST, 2.3, 0.9, [
          seat('seat-1', fx, cz - 0.75, WEST, SOFA_HIPS), seat('seat-2', fx, cz, WEST, SOFA_HIPS), seat('seat-3', fx, cz + 0.75, WEST, SOFA_HIPS),
        ], { tags: ['faces-screen', 'soft'] });
        for (const [ax, az] of [[r.x0 + 2.1, r.z0 + 0.75], [r.x0 + 2.1, r.z1 - 0.75]] as const) {
          const toScreen = Math.atan2(sx - ax, sz - az);
          put('armchair', 'Armchair', room.id, ax, az, toScreen, 0.8, 0.8, [seat('seat', ax, az, toScreen, ARMCHAIR_HIPS)], { tags: ['faces-screen', 'soft'] });
        }
        put('window', 'Front window', room.id, r.x0 + 4.2, r.z0 + 0.05, NORTH, 1.6, 0.1, [front('look', r.x0 + 4.2, r.z0 + 0.05, NORTH, 0.55)]);
        put('floorSpot', 'Open floor', room.id, r.x1 - 1.6, cz - 0.6, NORTH, 1.6, 1.6, [{ id: 'mat', use: [r.x1 - 1.6, cz - 0.6], facing: WEST, approach: [r.x1 - 1.6, cz - 0.6], motion: 'stand' }], { tags: ['exercise'] });
        // (open floor has nothing to go round, so it is come at from any side: its approach is its own middle)
        spots(room.id, [r.x0 + 5.0, r.z0 + 3.6], [r.x0 + 5.6, r.z0 + 2.2], [r.x0 + 4.6, r.z0 + 1.2]);
        break;
      }
      case 'entry': {
        spots(room.id, [cx, r.z0 + 1.4]);
        break;
      }
      case 'kitchen': {
        // the fridge and stove on the east wall (the back door between them and the south wall), the sink, cabinet
        // and counter along the south wall, the dining table and its four chairs in the middle-west, a window south
        const ex = r.x1 - 0.35;
        put('fridge', 'Fridge', room.id, ex, r.z1 - 0.9, WEST, 0.8, 0.7, [front('front', ex, r.z1 - 0.9, WEST, 0.7)], { items: START_STOCK.fridge });
        put('stove', 'Stove', room.id, ex, r.z0 + 3.4, WEST, 0.7, 0.65, [front('front', ex, r.z0 + 3.4, WEST, 0.65)]);
        put('sink', 'Kitchen sink', room.id, r.x1 - 2.5, r.z0 + 0.3, NORTH, 0.8, 0.6, [front('front', r.x1 - 2.5, r.z0 + 0.3, NORTH, 0.6)]);
        put('cabinet', 'Pantry', room.id, r.x1 - 1.5, r.z0 + 0.3, NORTH, 0.8, 0.6, [front('front', r.x1 - 1.5, r.z0 + 0.3, NORTH, 0.6)], { items: START_STOCK.cabinet });
        put('counter', 'Counter', room.id, r.x1 - 3.5, r.z0 + 0.3, NORTH, 1.0, 0.6, [front('front', r.x1 - 3.5, r.z0 + 0.3, NORTH, 0.6)]);
        const tx = r.x0 + 2.5, tz = cz + 0.2;
        // (the table, 1.6 x 0.9; tidied from its east end, clear of the chairs)
        const table = put('diningTable', 'Dining table', room.id, tx, tz, NORTH, 1.6, 0.9, [front('side', tx, tz, EAST, 1.15)]);
        // (the chairs: two on the north side facing south, two on the south side facing north, each facing the table,
        //  pulled out CHAIR_OUT from its edge)
        const chairZ = 0.45 + CHAIR_OUT;
        for (const [x, z, facing] of [[tx - 0.4, tz + chairZ, SOUTH], [tx + 0.4, tz + chairZ, SOUTH], [tx - 0.4, tz - chairZ, NORTH], [tx + 0.4, tz - chairZ, NORTH]] as const) {
          put('diningChair', 'Dining chair', room.id, x, z, facing, 0.45, 0.45, [tableSeat(x, z, facing)], { tags: ['table'], partOf: table });
        }
        // (the window over the sink: looked out of from in front of the sink, the sink between; at 0.55 m out the body
        //  stood in the sink)
        put('window', 'Kitchen window', room.id, r.x0 + 4.6, r.z0 + 0.05, NORTH, 1.2, 0.1, [front('look', r.x0 + 4.6, r.z0 + 0.05, NORTH, 0.9)]);
        spots(room.id, [r.x1 - 2.4, r.z1 - 1.6], [tx + 1.6, tz + 1.4]);
        break;
      }
      case 'hall': {
        spots(room.id, [r.x0 + 4, cz], [r.x1 - 4, cz]);
        break;
      }
    }
  }

  const spawns: Record<ActorId, Vec2> = {};
  for (const [who, p] of Object.entries(spec.residents)) spawns[who] = at(p.x, p.z);
  return { id: spec.id, name: spec.name, origin, size: { w: W, d: D }, rooms, doors, walls, objects, spawns, standSpots };
}

/** A slot before it is moved into the world: house metres. */
interface SlotSpec {
  readonly id: string;
  readonly use: readonly [number, number];
  readonly facing: number;
  readonly approach: readonly [number, number];
  readonly motion: Motion;
  readonly owner?: ActorId;
}

/** A row's width. */
function sum(row: readonly RoomSpec[]): number {
  return row.reduce((s, r) => s + r.width, 0);
}

/** The room a spot is in (on a wall between two, the first found), or null outside. */
export function roomAt(layout: HomeLayout, p: Vec2, slack = 0.02): Room | null {
  for (const room of layout.rooms) {
    const r = room.rect;
    if (p.x >= r.x0 - slack && p.x <= r.x1 + slack && p.z >= r.z0 - slack && p.z <= r.z1 + slack) return room;
  }
  return null;
}

/** Every slot of every thing, flat (for checks and the drawing). */
export function allSlots(layout: HomeLayout): { object: SmartObject; slot: ObjectSlot }[] {
  return layout.objects.flatMap((object) => object.slots.map((slot) => ({ object, slot })));
}
