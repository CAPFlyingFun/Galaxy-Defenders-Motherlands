// ============================================================================
// collision.ts -- what the heroine cannot walk through: the buildings and the
// dome's glass. Pure numbers: no page, no 3D, so it can be tested by itself.
//
// Joshua, 2026-11-17: "don't limit the ring to that small section so I can
// like run from one end of the map to the other". So the whole map is open,
// and this file is what makes its walls solid.
//
// HOW IT WORKS (seen from above, looking straight down on the city):
//
//   she         is a CIRCLE about as wide as she is            (HEROINE_RADIUS)
//   a building  is a BOX lined up with the streets             (its "footprint")
//   the dome    is a wall of twelve straight sides round it all
//
// Each frame the game says "she wants to step from here, by this much". The
// step is taken, and then:
//
//   - if her circle overlaps a box, she is pushed straight back out of it by
//     the shortest way. Walk into a wall at an angle and only the part of the
//     step that went INTO the wall is undone; the part that went ALONG it is
//     kept, so she SLIDES along the wall. At a corner she is pushed away from
//     the corner point itself, so she rounds it smoothly;
//   - if she is past the dome's line she is put back on it, the same way.
//
// Two buildings on one block stand closer together than she is wide. Those
// alleys are FILLED IN (they get a box of their own), so that the side of a
// block is one flat wall to her and she never catches on an alley's mouth.
//
// TO CHECK IT BY ITSELF: `cityFootprints()` in city.ts gives the real city's
// boxes as plain numbers; make a `CityWalls` from them and call `move`.
//
// FINDING THE NEARBY BOXES QUICKLY. There are a few hundred buildings and she
// can only ever touch the one or two beside her. So, once, the boxes are
// sorted into a grid of square cells (each as big as a city block and its
// street). Every cell keeps a short list of the boxes that reach into it, and
// a step looks only at the list of the cell she is standing in.
// ============================================================================
import { CITY_PITCH, DOME_RADIUS, DOME_SECTIONS, azimuthOf, sectionIndexAt } from './config';

/** Where one building stands on the ground: the box its walls enclose, in metres. (The city makes these: city.ts.) */
export interface Footprint {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A place on the ground. */
export interface GroundPoint {
  x: number;
  z: number;
}

/**
 * Seen from above she is a circle of this radius, in metres. Measured on Blaze: standing, nothing of her is further
 * than about 0.31 m from the line straight up through her feet (her belly reaches 0.24 m in front of it); with her
 * arms up to aim, her hands and guns reach about 0.5 m. So this keeps her body and belly well clear of a wall, and
 * her first-person eye (0.1 m in front of her head) a good 0.3 m from it. GAME TUNING.
 */
export const HEROINE_RADIUS = 0.45;

/**
 * Her centre stops this far short of the foot of the dome's glass, in metres. More than her radius, because the
 * glass leans inward as it rises (it is the bottom of a ball: about 0.19 m nearer for every metre up), so at the
 * height of her head it is a third of a metre nearer than at her feet. It also leaves her standing just inside the
 * bright line the ground paints along the foot of the glass (src/world/ground.ts).
 */
export const DOME_WALL_MARGIN = 1.2;

// ---- The dome wall ---------------------------------------------------------------------------------------------------

/** The angle one dome section spans. */
const SLICE = (Math.PI * 2) / DOME_SECTIONS;

/**
 * THE GLASS IS FLAT. The dome model has twelve corner posts standing DOME_RADIUS from the centre, one on each border
 * between two sections, and between two posts the glass is one flat panel. So the middle of a panel is NEARER the
 * centre than the posts are: this far (about 120.7 m under a 125 m dome). Seen from above the dome is not a circle
 * but a twelve-sided shape, and this is the distance from the centre to the middle of each side.
 */
export const DOME_WALL_DISTANCE = DOME_RADIUS * Math.cos(SLICE / 2);

/** For each of the twelve panels: the direction along the ground that points straight out through its middle. */
const PANEL_X: number[] = [];
const PANEL_Z: number[] = [];
for (let i = 0; i < DOME_SECTIONS; i++) {
  const middle = (i + 0.5) * SLICE; // the compass direction of the middle of section i (0 = +Z, as a heroine's yaw)
  PANEL_X.push(Math.sin(middle));
  PANEL_Z.push(Math.cos(middle));
}

/**
 * Keep a point on the ground inside the dome, at least `margin` metres short of the glass. A point that is already
 * inside is left alone; one that is past the line is put on the nearest point of the line (so walking into the
 * glass at an angle slides along it, as with a building's wall). Returns true if the point had to be moved.
 */
export function keepInsideDome(point: GroundPoint, margin: number): boolean {
  const limit = DOME_WALL_DISTANCE - margin;
  // (most of the time she is nowhere near the wall: inside this circle nothing can be wrong)
  if (point.x * point.x + point.z * point.z <= limit * limit) return false;
  // Which panel is she in front of? The one whose section her compass direction falls in.
  const panel = sectionIndexAt(azimuthOf(point.x, point.z));
  const outX = PANEL_X[panel];
  const outZ = PANEL_Z[panel];
  // Measure her place two ways: how far OUT toward the panel she is, and how far ALONG it (sideways).
  const out = point.x * outX + point.z * outZ;
  if (out <= limit) return false;
  // Too far out: bring her back onto the line, keeping her place along it. At the very end of a panel (in the
  // corner by a post) "along" is held to the panel's own length, which puts her exactly in the corner.
  const halfLength = limit * Math.tan(SLICE / 2);
  const along = Math.max(-halfLength, Math.min(halfLength, point.x * outZ - point.z * outX));
  point.x = outX * limit + outZ * along;
  point.z = outZ * limit - outX * along;
  return true;
}

// ---- The buildings ---------------------------------------------------------------------------------------------------

/** How many times at most the "push her out of the worst overlap" step is repeated for one piece of a step. */
const PASSES = 12;
/** An overlap smaller than this (a hundredth of a millimetre) counts as touching, not overlapping. */
const TOUCH = 1e-5;
/** The longest step is cut into at most this many pieces (see `move`). */
const MAX_PIECES = 32;
/** A gap between two buildings must be this much wider than she is, in metres, or it is filled in (see the constructor). */
const GAP_ROOM = 0.1;
/** What a cell with no buildings near it hands out. */
const NOTHING: readonly number[] = [];

/**
 * Everything solid in the city, as the heroine meets it: the buildings' footprints and the dome's wall.
 * Make one from the city's footprints (`new CityWalls(city.footprints)`), then ask it to `move` her.
 */
export class CityWalls {
  /** How many buildings it knows. */
  readonly count: number;
  /** How many alleys too narrow for her it filled in (see the constructor). */
  readonly filled: number;

  /** Everything solid: the buildings, then the filled-in alleys. */
  private readonly boxes: readonly Footprint[];
  // The grid: `columns` by `rows` square cells of CITY_PITCH metres, starting at (originX, originZ).
  // cells[row * columns + column] lists the numbers of the boxes within reach of that cell.
  private readonly cells: number[][] = [];
  private readonly columns: number;
  private readonly rows: number;
  private readonly originX: number;
  private readonly originZ: number;

  /**
   * @param footprints  where the buildings stand (city.ts)
   * @param radius      how big a circle she is
   * @param domeMargin  how far short of the glass her centre stops
   */
  constructor(footprints: readonly Footprint[], readonly radius = HEROINE_RADIUS, readonly domeMargin = DOME_WALL_MARGIN) {
    // ALLEYS TOO NARROW FOR HER ARE FILLED IN. Two buildings on one block stand 0.7 m apart, less than she is wide.
    // She could never get into such a gap, but its mouth is a notch in an otherwise flat wall, and sliding along
    // that wall she would catch in it and stop. So wherever two boxes face each other across a gap she cannot fit
    // through, the gap gets a box of its own, flush with both walls, and the two walls become one.
    const boxes = footprints.slice();
    const tooNarrow = radius * 2 + GAP_ROOM;
    for (let a = 0; a < footprints.length; a++) {
      for (let b = a + 1; b < footprints.length; b++) {
        const one = footprints[a], other = footprints[b];
        // How far apart the two are along X and along Z. A negative number means they overlap that way.
        const gapX = Math.max(one.minX, other.minX) - Math.min(one.maxX, other.maxX);
        const gapZ = Math.max(one.minZ, other.minZ) - Math.min(one.maxZ, other.maxZ);
        if (gapX > 0 && gapX < tooNarrow && gapZ < 0) {
          // side by side: the gap runs along Z, for as long as both walls do
          boxes.push({ minX: Math.min(one.maxX, other.maxX), maxX: Math.max(one.minX, other.minX), minZ: Math.max(one.minZ, other.minZ), maxZ: Math.min(one.maxZ, other.maxZ) });
        } else if (gapZ > 0 && gapZ < tooNarrow && gapX < 0) {
          // one behind the other: the gap runs along X
          boxes.push({ minX: Math.max(one.minX, other.minX), maxX: Math.min(one.maxX, other.maxX), minZ: Math.min(one.maxZ, other.maxZ), maxZ: Math.max(one.minZ, other.minZ) });
        }
      }
    }
    this.boxes = boxes;
    this.count = footprints.length;
    this.filled = boxes.length - footprints.length;

    // A box "reaches into" a cell if any point of the cell is close enough to touch it: her radius, and a little over.
    const reach = radius + 0.05;
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    for (const box of boxes) {
      minX = Math.min(minX, box.minX - reach);
      maxX = Math.max(maxX, box.maxX + reach);
      minZ = Math.min(minZ, box.minZ - reach);
      maxZ = Math.max(maxZ, box.maxZ + reach);
    }
    // (the grid starts on a whole number of cells, so its lines fall along the middle of the streets)
    this.originX = Math.floor(minX / CITY_PITCH) * CITY_PITCH;
    this.originZ = Math.floor(minZ / CITY_PITCH) * CITY_PITCH;
    this.columns = Math.max(1, Math.ceil((maxX - this.originX) / CITY_PITCH));
    this.rows = Math.max(1, Math.ceil((maxZ - this.originZ) / CITY_PITCH));
    for (let i = 0; i < this.columns * this.rows; i++) this.cells.push([]);

    boxes.forEach((box, number) => {
      const firstColumn = Math.max(0, Math.floor((box.minX - reach - this.originX) / CITY_PITCH));
      const lastColumn = Math.min(this.columns - 1, Math.floor((box.maxX + reach - this.originX) / CITY_PITCH));
      const firstRow = Math.max(0, Math.floor((box.minZ - reach - this.originZ) / CITY_PITCH));
      const lastRow = Math.min(this.rows - 1, Math.floor((box.maxZ + reach - this.originZ) / CITY_PITCH));
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) this.cells[row * this.columns + column].push(number);
      }
    });
  }

  /**
   * She wants to step from (x, z) by (stepX, stepZ) metres. Where she really ends up is written into `out`
   * (which is also returned): the same place if nothing is in the way; otherwise as far as the walls allow,
   * sliding along them.
   *
   * A long step is taken in pieces shorter than she is wide, each checked by itself, so however fast she goes she
   * can never jump clean over a corner.
   */
  move(x: number, z: number, stepX: number, stepZ: number, out: GroundPoint): GroundPoint {
    const length = Math.hypot(stepX, stepZ);
    const pieces = Math.min(MAX_PIECES, Math.max(1, Math.ceil(length / (this.radius * 0.5))));
    out.x = x;
    out.z = z;
    for (let i = 0; i < pieces; i++) {
      const beforeX = out.x;
      const beforeZ = out.z;
      out.x += stepX / pieces;
      out.z += stepZ / pieces;
      if (!this.settle(out)) {
        // She could not be put anywhere clear (pressed into a gap too tight for her): she stays where she was.
        out.x = beforeX;
        out.z = beforeZ;
        break;
      }
    }
    return out;
  }

  /**
   * Push a point clear of every building and inside the dome. Returns true once it is clear, false if after
   * several tries it still overlaps something (which `move` answers by not taking that piece of the step).
   */
  settle(point: GroundPoint): boolean {
    const radius = this.radius;
    for (let pass = 0; pass < PASSES; pass++) {
      // THE DEEPEST FIRST. Find the ONE box she overlaps most, push her out of that one only, then look again.
      // (Why not push her out of every box in turn? A long wall is several boxes end to end: buildings, and the
      // filled-in alleys between them. Pressed into such a wall she overlaps the box in front of her and also,
      // by a little, the CORNER of the next box along. Pushed away from that corner she would be nudged backward
      // along the wall every frame, and stall at each join. Pushed out of the box in front of her first, she
      // ends up clear of the neighbour's corner as well, and the joined boxes behave as one flat wall.)
      const near = this.near(point.x, point.z);
      let worst: Footprint | null = null;
      let worstOverlap = TOUCH; // (an overlap smaller than this is just touching)
      for (let k = 0; k < near.length; k++) {
        const box = this.boxes[near[k]];
        const overlap = this.overlap(point.x, point.z, box);
        if (overlap > worstOverlap) { worstOverlap = overlap; worst = box; }
      }
      let moved = false;
      if (worst) {
        // The point of the box nearest her centre. (Holding her place to the box's sides gives exactly that.)
        const awayX = point.x - Math.max(worst.minX, Math.min(worst.maxX, point.x));
        const awayZ = point.z - Math.max(worst.minZ, Math.min(worst.maxZ, point.z));
        const distance = Math.hypot(awayX, awayZ);
        if (distance > 1e-9) {
          // Push her straight away from that nearest point, just far enough to touch.
          point.x += (awayX / distance) * (radius - distance);
          point.z += (awayZ / distance) * (radius - distance);
        } else {
          // Her centre is INSIDE the box (only if she is put there; never by walking): out by the nearest wall.
          const toMinX = point.x - worst.minX, toMaxX = worst.maxX - point.x;
          const toMinZ = point.z - worst.minZ, toMaxZ = worst.maxZ - point.z;
          const least = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (least === toMinX) point.x = worst.minX - radius;
          else if (least === toMaxX) point.x = worst.maxX + radius;
          else if (least === toMinZ) point.z = worst.minZ - radius;
          else point.z = worst.maxZ + radius;
        }
        moved = true;
      }
      if (keepInsideDome(point, this.domeMargin)) moved = true;
      if (!moved) return true; // nothing left to push her out of: she is clear
    }
    return !this.touching(point.x, point.z, 1e-3);
  }

  /**
   * How far a circle of her size at (x, z) reaches into a box, in metres: 0 or less means clear of it. With her
   * centre outside the box that is her radius less the distance to the box's nearest point; with her centre
   * inside, her radius plus how far in she is.
   */
  private overlap(x: number, z: number, box: Footprint): number {
    const awayX = x - Math.max(box.minX, Math.min(box.maxX, x));
    const awayZ = z - Math.max(box.minZ, Math.min(box.maxZ, z));
    const distance = Math.hypot(awayX, awayZ);
    if (distance > 1e-9) return this.radius - distance;
    return this.radius + Math.min(x - box.minX, box.maxX - x, z - box.minZ, box.maxZ - z);
  }

  /**
   * Would a circle of her size at (x, z) overlap a building, or be past the dome's line, by more than `slack` metres?
   * (For checks and tests; `move` does not need it to do its work.)
   */
  touching(x: number, z: number, slack = TOUCH): boolean {
    const near = this.near(x, z);
    for (let k = 0; k < near.length; k++) {
      if (this.overlap(x, z, this.boxes[near[k]]) > slack) return true;
    }
    const limit = DOME_WALL_DISTANCE - this.domeMargin;
    const panel = sectionIndexAt(azimuthOf(x, z));
    return x * PANEL_X[panel] + z * PANEL_Z[panel] - limit > slack;
  }

  /** The numbers of the boxes near a point: the list of the cell it is in. */
  private near(x: number, z: number): readonly number[] {
    const column = Math.floor((x - this.originX) / CITY_PITCH);
    const row = Math.floor((z - this.originZ) / CITY_PITCH);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return NOTHING;
    return this.cells[row * this.columns + column];
  }
}
