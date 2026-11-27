// ============================================================================
// homeChairs.ts -- THE CHAIRS THAT PULL OUT (v0.2.182; Joshua, 2026-11-27: "we need to be able for the characters to
// pull the chair out, or twist them sit down, and back at the table. Now that we have collisions, it's failing to sit I
// guess because it walks through the chair from behind it"; then "make sure with Mary's large belly, her belly doesn't
// clip the table").
//
// PURE: no three.js, no page. The game (homeScene.ts draws them, main.ts walks them) and the headless household
// simulation (scripts/sim_household.ts) share it, so both walk round the very same chairs.
//
// A dining chair (and the desk chair) stands TUCKED IN at its table: its middle CHAIR.tuck out from the table's edge,
// its seat's front just under the top. To sit on it a body (homeMindBody.ts):
//   1. stands beside its BACK on its free side (`grabSpot`: the table's end, not the next chair), facing the table,
//      takes hold of its backrest and walks back with it: it slides out (`out`, metres);
//   2. steps round its front into the gap between it and the table (`standSpot`), facing the table, its back to the
//      seat, as far from the table's edge as her BELLY needs (`pullFor`: the chair is pulled out that much further);
//   3. sits, and SCOOTS IN with it until her belly is just off the table's edge (`scootFor`), but no nearer than
//      CHAIR.nearestSeated;
// and the same backwards: scoots out, gets up, steps to its side and pushes it back in.
//
// Each chair's BOX is one object that moves with it (`block`): the walls (homeBlocks.ts HomeWalls) hold the very same
// object, so they stop a body where the chair is now; the walk grid (homeNav.ts) is told the chairs move (`version`).
//
// A CHAIR LEFT OUT (nobody using it: `held` false, someone gave up on putting it back because a person stood where
// they had to): walked into from behind, it is BUMPED back in toward its table (`bump`, asked by the walls), as a
// chair is; so the walk grid plans as if it were tucked in (`navBlock`). In the simulation a desk chair left out made
// the way to the window past it too narrow, and someone standing beside it was wedged between it and the desk.
// ============================================================================
import type { SmartObject, Vec2 } from '../../mind/types';
import { block, rayToBlock, type Block } from './homeBlocks';

/** GAME TUNING: the chairs, in metres and metres a second. */
export const CHAIR = {
  /** tucked in: its middle this far out from the table's edge (a 0.45 m seat's front 7.5 cm under the table's top) */
  tuck: 0.15,
  /** pulled out at least this far, at most this far (from tucked in) */
  pullLeast: 0.45,
  pullMost: 0.85,
  /** where the hips rest, from its middle toward the table (homeLayout.ts tableSeat) */
  hipsAt: -0.02,
  /** sitting takes a body this far back from where it stood (homeLayout.ts SEAT_BACK: Mary 0.39, John 0.35) */
  seatBack: 0.37,
  /** where a body stands to pull or push it: this far out to its free side from its middle, and this far behind it */
  grabSide: 0.55,
  grabBack: 0.2,
  /** HER BELLY this far off the table's edge, standing in the gap and seated (Joshua: "her belly doesn't clip the table") */
  bellyClear: 0.04,
  /**
   * scooted in no nearer than this: its middle this far out from the table's edge (her knees under the top, her hands
   * resting on her thighs just short of its edge: at 0.22 John's hands went 2 cm into the desk's top, measured)
   */
  nearestSeated: 0.32,
  /** how fast it slides as she pulls or pushes it, and as she scoots in or out on it */
  pullSpeed: 0.5,
  scootSpeed: 0.3,
} as const;

/** A box that moves (a chair's): the same object the walls hold, its middle changed as the chair slides. */
export interface MovableBlock extends Block {
  cx: number;
  cz: number;
}

/** One chair that pulls out. */
export interface PullChair {
  readonly object: SmartObject;
  /** its middle tucked in */
  readonly home: Vec2;
  /** a unit way toward the table (the way it faces) */
  readonly fwd: Vec2;
  /** a unit way to its free side (where a body stands to pull it) */
  readonly side: Vec2;
  /** from its tucked-in middle to the table's edge, along `fwd` (negative: its middle is under the table) */
  readonly edge: number;
  /** how far it is pulled out now, metres (0 tucked in) */
  out: number;
  /** its box, where it is now (held by the walls too) */
  readonly block: MovableBlock;
  /** someone is using it (pulling, sitting, putting it back): it is not bumped, and the walk grid sees it where it is */
  held: boolean;
  /** its box as the walk grid sees it: where it is while held; left out, tucked in (it is bumped in on the way) */
  readonly navBlock: MovableBlock;
}

export class HomeChairs {
  readonly list: PullChair[] = [];
  /** goes up each time a chair moves (the walk grid looks at it) */
  version = 0;
  private readonly byId = new Map<string, PullChair>();

  constructor(objects: readonly SmartObject[]) {
    const byId = new Map(objects.map((o) => [o.id, o] as const));
    for (const o of objects) {
      if (!o.pullsOut) continue;
      const fwd = { x: Math.sin(o.facing), z: Math.cos(o.facing) };
      // (how far ahead its table's edge is: a ray from its middle along the way it faces, to the table's box)
      const table = o.partOf ? byId.get(o.partOf) : undefined;
      const edge = table ? rayToBlock(o.at, fwd, block(table.at.x, table.at.z, table.size.w, table.size.d, table.facing, false)) : CHAIR.tuck;
      const b = block(o.at.x, o.at.z, o.size.w, o.size.d, o.facing, false, undefined, o.id) as MovableBlock;
      const nb = block(o.at.x, o.at.z, o.size.w, o.size.d, o.facing, false, undefined, o.id) as MovableBlock;
      const chair: PullChair = { object: o, home: o.at, fwd, side: o.pullsOut.side, edge: Number.isFinite(edge) ? edge : CHAIR.tuck, out: 0, block: b, held: false, navBlock: nb };
      this.list.push(chair);
      this.byId.set(o.id, chair);
    }
  }

  /** The chair this thing is (if it pulls out). */
  get(id: string | null | undefined): PullChair | undefined { return id ? this.byId.get(id) : undefined; }

  /** Its middle, pulled out `out` metres (now, if not given). */
  middle(c: PullChair, out = c.out): Vec2 {
    return { x: c.home.x - c.fwd.x * out, z: c.home.z - c.fwd.z * out };
  }

  /** Slide it to `out` metres pulled out: its box goes with it. */
  set(c: PullChair, out: number): void {
    const o = Math.max(0, Math.min(CHAIR.pullMost, out));
    if (Math.abs(o - c.out) < 1e-6) return;
    c.out = o;
    const m = this.middle(c);
    c.block.cx = m.x; c.block.cz = m.z;
    this.layNav(c);
    this.version++;
  }

  /** Someone takes it to use (true) or is done with it, put back or left out (false). */
  hold(c: PullChair, on: boolean): void {
    if (c.held === on) return;
    c.held = on;
    this.layNav(c);
    this.version++;
  }

  /** The walk grid's box: where it is while held, tucked in while nobody has it. */
  private layNav(c: PullChair): void {
    const m = c.held ? this.middle(c) : c.home;
    c.navBlock.cx = m.x; c.navBlock.cz = m.z;
  }

  /**
   * BUMPED BACK IN: a body's circle (radius `r` at x, z) walking into a chair nobody is using, from behind it (from the
   * far side of its middle from the table), slides it toward its table just far enough to be clear of the body, no
   * further than tucked in; not into anyone else (`blocked(out)`: someone it would run into there). True if it moved.
   */
  bump(c: PullChair, x: number, z: number, r: number, blocked: (out: number) => boolean): boolean {
    if (c.held || c.out <= 1e-4) return false;
    const m = this.middle(c);
    // (only from behind or beside its back: walked into from the table's side it would go toward them)
    if ((x - m.x) * c.fwd.x + (z - m.z) * c.fwd.z > 0) return false;
    if (!this.hits(c, c.out, x, z, r)) return false;
    // (the most it can stay out and be clear of them: the overlap only shrinks as it goes in)
    let lo = 0, hi = c.out;
    if (!this.hits(c, 0, x, z, r)) {
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (this.hits(c, mid, x, z, r)) hi = mid; else lo = mid; }
    }
    const to = lo;
    if (to >= c.out - 1e-4 || blocked(to)) return false;
    this.set(c, to);
    return true;
  }

  /**
   * Whether it would run into someone, pulled out `out`: a circle of radius `r` at (x, z) overlapping its box there.
   * A chair is not pulled or pushed through anyone (homeMindBody.ts waits for them).
   */
  hits(c: PullChair, out: number, x: number, z: number, r: number): boolean {
    const m = this.middle(c, out), b = c.block;
    const dx = x - m.x, dz = z - m.z;
    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
    const ox = Math.max(0, Math.abs(lx) - b.hx), oz = Math.max(0, Math.abs(lz) - b.hz);
    return Math.hypot(ox, oz) < r;
  }

  /** Where a body stands to pull or push it, pulled out `out`: beside its back, on its free side. */
  grabSpot(c: PullChair, out = c.out): Vec2 {
    const m = this.middle(c, out);
    return { x: m.x + c.side.x * CHAIR.grabSide - c.fwd.x * CHAIR.grabBack, z: m.z + c.side.z * CHAIR.grabSide - c.fwd.z * CHAIR.grabBack };
  }

  /** Where a body stands to sit on it, pulled out `out`: in front of its seat, facing the table, SEAT_BACK from the hips. */
  standSpot(c: PullChair, out = c.out): Vec2 {
    const m = this.middle(c, out), u = CHAIR.hipsAt + CHAIR.seatBack;
    return { x: m.x + c.fwd.x * u, z: m.z + c.fwd.z * u };
  }

  /** Where the hips rest on it, pulled out `out`. */
  hipsSpot(c: PullChair, out = c.out): Vec2 {
    const m = this.middle(c, out);
    return { x: m.x + c.fwd.x * CHAIR.hipsAt, z: m.z + c.fwd.z * CHAIR.hipsAt };
  }

  /**
   * HOW FAR TO PULL IT OUT for a body whose belly stands `bellyAhead` metres in front of its middle (homeMindBody.ts asks
   * the body: heroine hands' `bellyAhead`): far enough that, standing in front of the seat facing the table, her belly is
   * CHAIR.bellyClear off its edge; at least CHAIR.pullLeast, at most CHAIR.pullMost.
   */
  pullFor(c: PullChair, bellyAhead: number): number {
    // (standing at standSpot(out) her middle is edge + out - (hipsAt + seatBack) from the table's edge)
    const need = bellyAhead + CHAIR.bellyClear - c.edge + CHAIR.hipsAt + CHAIR.seatBack;
    return Math.max(CHAIR.pullLeast, Math.min(CHAIR.pullMost, need));
  }

  /**
   * HOW FAR IT CAN BE SCOOTED IN, seated, metres: her belly's front (`bellyFront`, the world point of her belly furthest
   * toward the table now: armClear.ts `bellyFurthest`) stops CHAIR.bellyClear off the table's edge, and the chair no
   * nearer than CHAIR.nearestSeated. Never less than 0 (a belly already at the edge: she stays where she sat).
   */
  scootFor(c: PullChair, bellyFront: Vec2 | null): number {
    const m = this.middle(c);
    // (the table's edge along fwd from the chair's middle now)
    const edgeNow = c.edge + c.out;
    let room = edgeNow - CHAIR.nearestSeated;
    if (bellyFront) {
      const ahead = (bellyFront.x - m.x) * c.fwd.x + (bellyFront.z - m.z) * c.fwd.z;
      room = Math.min(room, edgeNow - ahead - CHAIR.bellyClear);
    }
    return Math.max(0, Math.min(c.out, room));
  }
}
