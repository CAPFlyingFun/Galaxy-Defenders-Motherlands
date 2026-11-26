// ============================================================================
// homeMindBody.ts -- A CHARACTER'S BODY AS THE MIND DRIVES IT, IN THE GAME (phases 4 and 5 of the AI Brain & Home plan):
// the mind's `MindBody` (src/mind/world.ts) filled in with the game's own systems. The mind is pure TypeScript and asks
// for things ("walk to the fridge's front, facing it", "sit", "lie down", "eat 45 mL of food"); this does them with the
// character's kit and body (main.ts hands it a few hooks), at the game's own real-time pace, and says how it is going.
//
// WALKING: the way round the walls and furniture from the walk grid (homeNav.ts), followed point by point at a walk (the
// kit's own walk: main.ts `stepStandingBy` reads `walkTo`); the thing being walked to is let through (the walker's
// walls ignore it, homeScene.ts `walkerWalls`), so a seat's spot right in front of it can be reached. A body that makes
// no headway for 2.5 s asks for its way again; after three tries it is 'blocked' (the mind then avoids that thing a
// while: mind/memory.ts).
//
// POSES (the game's own, not the builder's: Joshua, 2026-11-26, "I want you to do the poses and animations as it's game
// specific"):
//   SIT     turned to the seat's way (her back to the seat), then the game's sit (heroine/fast/sitPose.ts) onto the seat
//           behind her, asked each frame so she stays; let go, she bows and gets up as from the toilet.
//   DOZE    as SIT for now (the sofa nap): her head nodding off is for later.
//   LIE     A BED is not walked onto: the walk to its spot ends at its EDGE beside where her hips will lie, her back to
//           it; she sits on the edge, swings round and lies back, her hips on the duvet, her feet to its foot end
//           (fastHeroine.ts `lieOn`, the LIE numbers in sitPose.ts, her lying pose groundPose.ts LIE_POSE). Getting up is the same backwards, at the edge.
// ============================================================================
import type { MindBody, MoveStatus, Prop } from '../../mind/world';
import type { ActorId, Motion, ObjectSlot, SmartObject, Vec2 } from '../../mind/types';
import type { HeroineVitals } from '../../vitals/heroineVitals';
import type { HomeLayout } from './homeLayout';
import type { HomeNav } from './homeNav';
import type { WalkerWalls } from './homeScene';
import { DUVET_FROM_HEAD, DUVET_TOP, MATTRESS_TOP } from './homeScene';
import { foodMlForBar, waterMlBetween } from './mindBridge';

/** What the game hands this body: its walk, its turning, its sitting and lying, its vitals. main.ts fills it in. */
export interface HomeBodyHooks {
  readonly id: ActorId;
  readonly vitals: HeroineVitals;
  readonly walls: WalkerWalls;
  /** where they stand now (their kit's motion) */
  position(): Vec2;
  /** the way their body faces now (compass yaw) */
  facing(): number;
  /** where their floor is (metres) */
  floorY(): number;
  /** the body's own sit (fastHeroine.ts `sitFor`; asked each frame to stay seated) and how far seated it is (0..1) */
  sitFor(seconds: number, open?: boolean): void;
  sitShare(): number;
  /** the body's own lie (fastHeroine.ts `lieOn`) and how far lying it is (0..1) */
  lieOn(spot: { x: number; y: number; z: number; yaw: number } | null): void;
  lieShare(): number;
}

/** Near enough a point on the way to go on to the next; to the end. GAME TUNING. */
const NEXT_WITHIN = 0.25, ARRIVE_WITHIN = 0.12;
/** Turned to within this of a pose's way (radians) before she sits or lies. */
const TURNED_WITHIN = 0.12;
/** No headway for this long (0.05 m) asks for the way again; this many asks and the walk is blocked. */
const STUCK_SECONDS = 2.5, STUCK_TRIES = 3;
/** Sitting, the sit is asked to last this long ahead each frame: just over the bow before getting up (SIT_LOOK.bowBefore,
 *  2.5 s), so there is no bow while seated, and asked to stand, the bow starts within 0.4 s and up she gets. */
const SIT_AHEAD = 2.9;
/** At a bed's edge she stands this far out from the mattress's side, so her hips land just on it as she sits. */
const BED_EDGE_OUT = 0.24;
/** Her hip joints lie this far toward the foot from the bed's spot (its slot's `use`, by the pillow). */
const HIPS_FROM_PILLOW = 0.6;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** A bed being used: where she sits on its edge, which way her back is to it, and where she lies. */
interface BedPlan {
  readonly object: SmartObject;
  readonly edge: Vec2;
  readonly sitYaw: number;
  readonly hips: Vec2;
  readonly feetYaw: number;
  /** the top of what her hips lie on, over the floor: the duvet (from the bed's foot to its pillows) or the mattress */
  readonly under: number;
}

export class HomeMindBody implements MindBody {
  readonly id: ActorId;
  /** what the game reads each frame: where to walk (null: stand), where to look and which way to be held square */
  walkTo: Vec2 | null = null;
  lookYaw: number | null = null;
  holdYaw: number | null = null;
  /** asleep, how well, and working in place (exercise) */
  asleep = false;
  sleepQuality = 1;
  workload = 0;
  prop: Prop | null = null;
  /** the pose asked for now (the game sits or lays the body each frame while it is) */
  private wanted: Motion = 'stand';
  private bed: BedPlan | null = null;
  // (the walk)
  private path: Vec2[] = [];
  private pathTo: Vec2 | null = null;
  private pathUsing: string | null = null;
  private stuckFor = 0;
  private tries = 0;
  private lastAt: Vec2 = { x: 0, z: 0 };
  private dt = 0;

  constructor(private readonly hooks: HomeBodyHooks, private readonly layout: HomeLayout, private readonly nav: HomeNav) {
    this.id = hooks.id;
  }

  /** Seated or lying (for the vitals: resting, and her pose). */
  get seated(): boolean { return this.hooks.sitShare() > 0.5 || this.hooks.lieShare() > 0; }

  /** Once a frame BEFORE the mind ticks: the frame's seconds, and the pose asked for kept up. */
  frame(dt: number): void {
    this.dt = dt;
    if (this.wanted === 'sit' || this.wanted === 'doze') this.hooks.sitFor(SIT_AHEAD, true);
    if (this.wanted === 'lie' && this.bed) this.hooks.lieOn(this.lieSpot(this.bed));
    else this.hooks.lieOn(null);
  }

  /** The player takes them (or the mind lets go): no walk, no pose kept (they get up), nothing held. */
  release(): void {
    this.wanted = 'stand';
    this.bed = null;
    this.walkTo = null; this.lookYaw = null; this.holdYaw = null;
    this.path = []; this.pathTo = null;
    this.hooks.walls.ignore = null;
    this.hooks.lieOn(null);
    this.asleep = false; this.workload = 0; this.prop = null;
  }

  position(): Vec2 { return this.hooks.position(); }

  motion(): Motion {
    // (standing only once fully up: a body getting up is still in its pose)
    if (this.hooks.lieShare() > 0) return 'lie';
    if (this.hooks.sitShare() > 0) return this.wanted === 'doze' ? 'doze' : 'sit';
    return this.wanted === 'stand' ? 'stand' : this.wanted;
  }

  goTo(to: Vec2, facing: number | null): MoveStatus {
    // (a bed's spot is not walked to: its edge beside where her hips will lie is)
    const found = this.slotAt(to);
    let dest = to, destYaw = facing;
    if (found && found.slot.motion === 'lie') {
      this.bed = this.bedPlan(found.object, found.slot);
      dest = this.bed.edge; destYaw = this.bed.sitYaw;
    }
    const using = found?.object.id ?? null;
    const here = this.hooks.position();
    if (!this.pathTo || Math.hypot(this.pathTo.x - dest.x, this.pathTo.z - dest.z) > 0.01) {
      // (a new place: its way, the thing there let through)
      const way = this.nav.path(here, dest, using);
      if (!way) return 'blocked';
      this.path = way; this.pathTo = { ...dest }; this.pathUsing = using;
      this.hooks.walls.ignore = using;
      this.stuckFor = 0; this.tries = 0; this.lastAt = { ...here };
    }
    // (on along the way: the next point, or the end)
    while (this.path.length > 1 && Math.hypot(this.path[0].x - here.x, this.path[0].z - here.z) < NEXT_WITHIN) this.path.shift();
    const end = this.path[this.path.length - 1];
    if (this.path.length <= 1 && Math.hypot(end.x - here.x, end.z - here.z) < ARRIVE_WITHIN) {
      this.walkTo = null;
      this.holdYaw = destYaw;
      this.pathTo = null; this.path = [];
      return 'arrived';
    }
    this.walkTo = this.path[0];
    this.holdYaw = null;
    // (no headway: ask again; three times and give up)
    if (Math.hypot(here.x - this.lastAt.x, here.z - this.lastAt.z) > 0.05) { this.lastAt = { ...here }; this.stuckFor = 0; }
    else {
      this.stuckFor += this.dt;
      if (this.stuckFor > STUCK_SECONDS) {
        this.stuckFor = 0;
        if (++this.tries > STUCK_TRIES) { this.walkTo = null; this.pathTo = null; return 'blocked'; }
        const way = this.nav.path(here, dest, this.pathUsing);
        if (way) this.path = way;
      }
    }
    return 'moving';
  }

  stopMoving(): void {
    this.walkTo = null;
    this.path = []; this.pathTo = null;
  }

  pose(motion: Motion, facing: number | null): 'changing' | 'ready' {
    this.walkTo = null;
    if (motion === 'stand') {
      this.wanted = 'stand';
      const up = this.hooks.lieShare() <= 0 && this.hooks.sitShare() <= 0;
      if (up) { this.holdYaw = null; this.bed = null; }
      return up ? 'ready' : 'changing';
    }
    if (motion === 'lie') {
      if (!this.bed) return 'changing';   // (no bed walked to: the mind gives up after a while)
      // (her back to the bed first, then down onto its edge and back)
      this.holdYaw = this.bed.sitYaw;
      if (this.wanted !== 'lie' && Math.abs(wrap(this.hooks.facing() - this.bed.sitYaw)) > TURNED_WITHIN) return 'changing';
      this.wanted = 'lie';
      return this.hooks.lieShare() >= 1 ? 'ready' : 'changing';
    }
    // SIT or DOZE: turned the seat's way (her back to it), then down
    if (facing !== null) this.holdYaw = facing;
    if (this.wanted !== motion && facing !== null && Math.abs(wrap(this.hooks.facing() - facing)) > TURNED_WITHIN) return 'changing';
    this.wanted = motion;
    return this.hooks.sitShare() >= 1 ? 'ready' : 'changing';
  }

  consume(foodMl: number, waterMl: number): void { this.hooks.vitals.consume(foodMl, waterMl); }
  bathroomVisit(): { seconds: number; bowels: boolean } { return this.hooks.vitals.bathroomVisit(); }
  relieve(bowels: boolean): void { this.hooks.vitals.relieve(bowels); }
  sleep(asleep: boolean, quality: number): void { this.asleep = asleep; this.sleepQuality = quality; }
  exert(workload: number): void { this.workload = workload; }
  hold(prop: Prop | null): void { this.prop = prop; }
  lookAt(p: Vec2 | null): void {
    const here = this.hooks.position();
    this.lookYaw = p ? Math.atan2(p.x - here.x, p.z - here.z) : null;
  }
  foodMlForBar(bar: number): number { return foodMlForBar(bar); }
  waterMlForBar(bar: number): number { return waterMlBetween(this.hooks.vitals.reading.water, bar); }
  stomachFoodMl(): number { return this.hooks.vitals.contents.foodMl; }

  // ---- the home's things -----------------------------------------------------------------------------------------------

  /** The thing and slot whose spot (or way in) is at `p`, if any. */
  private slotAt(p: Vec2): { object: SmartObject; slot: ObjectSlot } | null {
    for (const object of this.layout.objects) {
      for (const slot of object.slots) {
        if (Math.hypot(slot.use.x - p.x, slot.use.z - p.z) < 0.03 || Math.hypot(slot.approach.x - p.x, slot.approach.z - p.z) < 0.03) return { object, slot };
      }
    }
    return null;
  }

  /**
   * A BED, as she will use it: in its own frame (its x across, its z toward its foot), her hips on her side's lane a
   * little toward the foot from its spot by the pillow; she sits on its edge on the side her way in is on, beside her
   * hips, her back to the bed; she lies with her feet to its foot.
   */
  private bedPlan(o: SmartObject, slot: ObjectSlot): BedPlan {
    const c = Math.cos(o.facing), s = Math.sin(o.facing);
    // (world to the bed's frame: x across, z toward its foot; and back)
    const local = (p: Vec2): Vec2 => { const dx = p.x - o.at.x, dz = p.z - o.at.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
    const world = (lx: number, lz: number): Vec2 => ({ x: o.at.x + lx * c + lz * s, z: o.at.z - lx * s + lz * c });
    const use = local(slot.use), way = local(slot.approach);
    const side = way.x >= 0 ? 1 : -1;
    const hipsZ = use.z + HIPS_FROM_PILLOW;
    const edge = world(side * (o.size.w / 2 + BED_EDGE_OUT), hipsZ);
    const hips = world(use.x, hipsZ);
    // (her back to the bed: facing out of its side, the bed's own x turned to the world)
    const outX = side * c, outZ = -side * s;
    // (the duvet covers the bed from its foot to its pillows, as homeScene.ts draws it)
    const under = hipsZ >= -o.size.d / 2 + DUVET_FROM_HEAD ? DUVET_TOP : MATTRESS_TOP;
    return { object: o, edge, sitYaw: Math.atan2(outX, outZ), hips, feetYaw: o.facing, under };
  }

  private lieSpot(b: BedPlan): { x: number; y: number; z: number; yaw: number } {
    // (on the top of what her hips lie on: her body lays her own flesh over it, groundPose.ts LIE_POSE)
    return { x: b.hips.x, y: this.hooks.floorY() + b.under, z: b.hips.z, yaw: b.feetYaw };
  }
}
