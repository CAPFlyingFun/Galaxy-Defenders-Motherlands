// ============================================================================
// homeMindBody.ts -- A CHARACTER'S BODY AS THE MIND DRIVES IT, IN THE GAME (phases 4 and 5 of the AI Brain & Home plan):
// the mind's `MindBody` (src/mind/world.ts) filled in with the game's own systems. The mind is pure TypeScript and asks
// for things ("walk to the fridge's front, facing it", "sit", "lie down", "eat 45 mL of food"); this does them with the
// character's kit and body (main.ts hands it a few hooks), at the game's own real-time pace, and says how it is going.
//
// WALKING: the way round the walls and furniture from the walk grid (homeNav.ts), followed point by point at a walk (the
// kit's own walk: main.ts `stepStandingBy` reads `walkTo`); the thing being walked to is let in near its spot only
// (homeBlocks.ts LET_IN: the walker's walls and the walk grid alike), so the way goes round it and a seat's spot right in
// front of it can be reached. A body that makes no headway for 2.5 s asks for its way again; after three tries it is
// 'blocked' (the mind then avoids that thing a while: mind/memory.ts).
// OTHER PEOPLE (v0.2.181; Joshua: "set collisions with each other"): solid (the walls keep them apart), and the way is
// asked round anyone standing on it; held up by someone (within a metre, no headway), the body WAITS for them to pass,
// asking its way again, up to WAIT_FOR_PEOPLE before it counts as stuck.
//
// POSES (the game's own, not the builder's: Joshua, 2026-11-26, "I want you to do the poses and animations as it's game
// specific"):
//   SIT     turned to the seat's way (her back to the seat), then the game's sit (heroine/fast/sitPose.ts) onto the seat
//           behind her, asked each frame so she stays; let go, she bows and gets up as from the toilet.
//   DOZE    as SIT for now (the sofa nap): her head nodding off is for later.
//   LIE     A BED is not walked onto: the walk to its spot ends at its EDGE beside where her hips will lie, her back to
//           it; she sits on the edge, swings round and lies back, her hips on the duvet, her feet to its foot end
//           (fastHeroine.ts `lieOn`, the LIE numbers in sitPose.ts, her lying pose groundPose.ts LIE_POSE). Getting up is the same backwards, at the edge.
//   A CHAIR AT A TABLE (v0.2.182; Joshua, 2026-11-27: "we need to be able for the characters to pull the chair out... sit
//           down, and back at the table"; "make sure with Mary's large belly, her belly doesn't clip the table"): it stands
//           tucked in (homeChairs.ts). Walked to (its slot's approach), she stands BESIDE ITS BACK on its free side, faces
//           the table, takes its backrest's top in the hand nearer it, and walks back with it: it slides out, as far as
//           her belly needs (`pullFor`); she lets go, steps round its front into the gap facing the table, her belly kept
//           off its edge (`keepFace`), and sits; SEATED, she SCOOTS IN with it until her belly is just off the table's
//           edge (`scootFor`, measured on her body as she sits: `bellyFurthest`). Getting up is the same backwards
//           (`leaving`): she scoots out, gets up, steps out to its side, takes hold and walks it back in. Asked to stand by
//           the mind, let go by the player (GET UP) or interrupted, she always scoots out before she stands; the push back
//           in is skipped only if the player takes her (the stick) once she is up.
//
// HER BELLY AT THE COUNTER (v0.2.182; Joshua: "or even like standing at the sink, etc"): at a thing she stands at (the
// sink, the fridge, the stove, a counter), her spot is moved back as far as her belly stands out past it
// (`clearOfBelly`), and her body is kept off its front while she stands there (`keepFace`: fastHeroine.ts holds her hips
// back if her belly would still touch, as at the weapons table).
// ============================================================================
import type { MindBody, MoveStatus, Prop } from '../../mind/world';
import type { ActorId, Motion, ObjectSlot, SmartObject, Vec2 } from '../../mind/types';
import type { HeroineVitals } from '../../vitals/heroineVitals';
import type { HomeLayout } from './homeLayout';
import type { HomeNav } from './homeNav';
import type { WalkerWalls } from './homeScene';
import { DUVET_FROM_HEAD, DUVET_TOP, MATTRESS_TOP, SQUEEZE_LEAST, objectBlock, rayToBlock } from './homeBlocks';
import { CHAIR, type HomeChairs, type PullChair } from './homeChairs';
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
  lieOn(spot: { x: number; y: number; z: number; yaw: number; side?: number; pillow?: boolean } | null): void;
  /** Settings -> TEST TOOLS -> Knee pillow: a pillow between their knees on a side, mixed, always or never */
  kneePillow?(): 'mixed' | 'always' | 'never';
  lieShare(): number;
  /** how far their belly stands out in front of their middle, standing, metres (the body's `bellyAhead`; none: 0.15) */
  bellyAhead?(): number;
  /** the point of their belly furthest along (dirX, dirZ) NOW (seated), world metres; null if not known */
  bellyFurthest?(dirX: number, dirZ: number): Vec2 | null;
  /** moved by (dx, dz) with the chair they sit on (scooting in or out): the game moves them and their feet */
  carry?(dx: number, dz: number): void;
  /** a hand to a rail (a chair's backrest top) and holding it, or null: let go */
  grip?(hand: Hand, rail: Rail | null): void;
  /** how far a hand is on its way to what it reaches for, 0..1 */
  gripped?(hand: Hand): number;
}

/** A hand of theirs. */
export type Hand = 'left' | 'right';
/** A point in the world, metres (y up from the floor). */
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
/**
 * A RAIL a hand takes hold of (a chair's backrest top): a bar from `a` to `b` of `radius`, the hand at `at`, its palm
 * turned toward `palm` (a way), its fingers going round toward `wrap` (a way).
 */
export interface Rail { readonly a: Vec3; readonly b: Vec3; readonly at: Vec3; readonly radius: number; readonly palm: Vec3; readonly wrap: Vec3 }
/** A FACE their belly is kept off (a counter's front, the table's edge): a point on it, its way out toward them, its top. */
export interface KeepFace { readonly x: number; readonly z: number; readonly outX: number; readonly outZ: number; readonly top: number }

/**
 * THE TOPS OF THE THINGS THEY STAND AT, metres over the floor (homeScene.ts draws them so): their belly is kept off a
 * thing's front only where it is low enough to meet it.
 */
const THING_TOP: Readonly<Record<string, number>> = {
  sink: 0.86, counter: 0.9, cabinet: 0.9, stove: 0.91, fridge: 1.85, wardrobe: 2.1, desk: 0.76, diningTable: 0.76,
  screen: 2.05, window: 2.7, shower: 2.1,
};
/** Their belly this far off the front of a thing they stand at, metres. GAME TUNING. */
const BELLY_CLEAR = 0.04;
/** A hand's hold on a chair's backrest takes this long at most before she pulls or pushes, seconds. */
const GRIP_SECONDS = 0.8;
/** After letting go of a chair, a moment before she steps round it, seconds. */
const LET_GO_SECONDS = 0.25;
/** Up from a chair, she steps out to its side to push it back in within this long, or leaves it out (someone stands
 *  there: John come to talk to her), seconds. */
const OUT_MOST = 5;
/** A chair is not moved into anyone: it stops this far short of their middle, metres (their body's circle: any nearer
 *  and they were squeezed between it and the bed behind them, in the simulation). */
const CHAIR_KEEPS_OFF = 0.3;
/** Someone in the way of a chair she pulls, pushes or scoots on: she waits this long, seconds, then gives up (pulling:
 *  the chair let down, the mind picks something else; pushing: it is left out; scooting out: she gets up where she is). */
const CHAIR_WAIT_MOST = 6;

/** Where in using a chair she is (see the top of this file). */
type SeatPhase = 'grab' | 'grip' | 'pull' | 'letGo' | 'in' | 'sit' | 'scootIn' | 'seated' | 'scootOut' | 'rise' | 'out' | 'gripPush' | 'push' | 'letGoPush';
/** The phases before she stands in the gap in front of the seat (let go of, the chair stays where it is). */
const BEFORE_GAP: ReadonlySet<SeatPhase> = new Set(['grab', 'grip', 'pull', 'letGo', 'in']);
/** A chair being used: which, how far she pulls it out, where she is in it, the hand on it. */
interface SeatPlan {
  readonly c: PullChair;
  /** how far she pulls it out (for her belly: `pullFor`) */
  readonly pull: number;
  phase: SeatPhase;
  readonly hand: Hand;
  /** seconds in this phase (the grip, the let go) */
  t: number;
  /** getting up and putting it back (asked to stand, or let go) */
  leaving: boolean;
  /** seated, how far out the chair is once scooted in */
  scootTo: number;
  /** her hand has hold of it now */
  holding: boolean;
  /** seconds pulling or pushing without it moving (held up by a wall behind her: done where it is) */
  stall: number;
  /** pushing it in from where she stands, arm out (it has hardly gone in for REACH_AFTER: someone kept her off her line) */
  reach: boolean;
  /** pushing: how far out it was when it last went in a good step (MARK_STEP), and the seconds since */
  mark: number;
  markT: number;
}
/** Pulling or pushing and the chair has not moved this long, seconds: done where it is (the last few cm are not walked). */
const STALL_SECONDS = 0.8;
/**
 * Pulling or pushing, she walks a straight line beside the chair (its grab spot as it comes out or goes in). Pushed off
 * it sideways further than this, metres (someone standing by it: in the simulation Mary, come to talk, stood on John's
 * line as he pushed the desk chair in, and he was pushed into the chair's own lane, then out of its box into her), the
 * chair waits while she steps back onto it; still off it after CHAIR_WAIT_MOST, it is left where it is.
 */
const LINE_OFF = 0.05;
/**
 * PUSHING IT IN, and it has not gone in MARK_STEP metres for this long, seconds (someone standing by her line, come to
 * talk to her, kept pushing her off it and she kept stepping back on: they waited for her, she for them): she pushes it
 * the rest of the way in from where she stands, as far as her arm reaches it (REACH_MOST, her middle to its backrest),
 * and lets go there. Before, both waited until the talk gave up (seed 5 of the simulation).
 */
const REACH_AFTER = 1.2, REACH_MOST = 0.75, MARK_STEP = 0.05;
/** No way only because of a chair someone is using: waited for this long at most, seconds (`walk`). */
const CHAIR_WAY_WAIT_MOST = 20;

/** Near enough a point on the way to go on to the next; to the end. GAME TUNING. */
const NEXT_WITHIN = 0.25, ARRIVE_WITHIN = 0.12;
/** Turned to within this of a pose's way (radians) before she sits or lies. */
const TURNED_WITHIN = 0.12;
/** No headway for this long (0.05 m) asks for the way again; this many asks and the walk is blocked. */
const STUCK_SECONDS = 2.5, STUCK_TRIES = 3;
/** Held up by someone: asked again this often while they stand in the way (s), waited for this long in all (s). */
const PERSON_STUCK_SECONDS = 0.8, WAIT_FOR_PEOPLE = 12;
/** Someone within this of the next leg (m), looked at this often (s): the way is asked again round them. */
const PERSON_ON_WAY = 0.9, PERSON_LOOK_EVERY = 0.5;
/**
 * GIVING WAY (v0.2.181): someone they give way to (the one played; in the simulation, by name) this near (m) and this
 * far round from the way they walk (radians) and they stop, at most this long (s) at a time, while the other passes
 * (and shoulders them aside: main.ts `nudge`). Met head on in a doorway, the walls had pressed the two together.
 */
const GIVE_WAY_WITHIN = 1.1, GIVE_WAY_AHEAD = 0.9, GIVE_WAY_MOST = 3;
/**
 * WAITING THEIR TURN AT A SPOT (v0.2.181): someone standing this near (m) where they are going (at the fridge, getting a
 * snack) and they stop once this near (m) and wait for them to move, at most this many GAME minutes (a snack eaten at
 * the fridge, a small meal), not counted as stuck. Before, they pressed against them 12 s and gave up: "no way to the
 * fridge" (the household simulation, Mary while John had an apple there).
 */
const SPOT_TAKEN_WITHIN = 0.5, SPOT_WAIT_FROM = 1.3, SPOT_WAIT_MOST = 15;
/** Sitting, the sit is asked to last this long ahead each frame: just over the bow before getting up (SIT_LOOK.bowBefore,
 *  2.5 s), so there is no bow while seated, and asked to stand, the bow starts within 0.4 s and up she gets. */
const SIT_AHEAD = 2.9;
/**
 * SLEEPING SIDES: how likely her back, left side and right side are (any day, and from `lateFrom` weeks pregnant), and
 * how many game minutes between turning over (people change position some 10-20 times a night).
 */
const SLEEP_SIDES = {
  usual: { back: 0.3, left: 0.35, right: 0.35 },
  late: { back: 0.05, left: 0.7, right: 0.25 },
  lateFrom: 28,
  turnLeast: 30, turnMost: 90,
  /** how often, settling on a side, a pillow goes between their knees (Knee pillow: Mixed), and late in a pregnancy */
  pillow: 0.45, pillowLate: 0.8,
} as const;
/** At a bed's edge she stands this far out from the mattress's side, so her hips land just on it as she sits. */
const BED_EDGE_OUT = 0.24;
/** Her hip joints lie this far toward the foot from the bed's spot (its slot's `use`, by the pillow). */
const HIPS_FROM_PILLOW = 0.6;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** How far a point is from the line from a to b (its nearest point on it), metres. */
function toSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

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
  /** walking, keep facing this way (null: the way they walk): backing up with a chair as they pull it out */
  faceWalking: number | null = null;
  /** walking, no faster than this (m/s; null: their walk): pulling or pushing a chair */
  walkSpeed: number | null = null;
  /** their belly kept off this face now (a counter's front, the table's edge), or null */
  keepFace: KeepFace | null = null;
  /** the pose asked for now (the game sits or lays the body each frame while it is) */
  private wanted: Motion = 'stand';
  private bed: BedPlan | null = null;
  /** the chair being used (pulled out, sat on, put back), or null */
  private seat: SeatPlan | null = null;
  /** seconds waited for a chair someone is using to stop closing the only way (`walk`) */
  private chairWait = 0;
  // (the walk)
  private path: Vec2[] = [];
  private pathTo: Vec2 | null = null;
  private pathUsing: string | null = null;
  /** where the thing walked to lets this body in (its spot; a bed's edge), or null (a walk to no thing) */
  private letInAt: Vec2 | null = null;
  /** seconds to the next look for someone on the way, and waited for people so far on this walk */
  private personLookIn = 0;
  private waitedFor = 0;
  /** seconds given way so far (to GIVE_WAY_MOST), and then past them without giving way until they are clear */
  private gaveWayFor = 0;
  /** game minutes waited for someone on the spot they are going to (to SPOT_WAIT_MOST) */
  private spotWaited = 0;
  private stuckFor = 0;
  /** Lying: her side now (+1 her left, -1 her right, 0 her back; public for test pages) and game minutes to her next turn. */
  sleepSide = 0;
  turnOverIn = 0;
  /** On a side, a pillow between her knees (chosen with the side, `SLEEP_SIDES.pillow`; public for test pages). */
  kneePillow = false;
  private tries = 0;
  private lastAt: Vec2 = { x: 0, z: 0 };
  private dt = 0;

  constructor(private readonly hooks: HomeBodyHooks, private readonly layout: HomeLayout, private readonly nav: HomeNav,
    /** the home's chairs that pull out (homeChairs.ts), or null: every chair a plain seat */
    private readonly chairs: HomeChairs | null = null) {
    this.id = hooks.id;
  }

  /** Seated or lying (for the vitals: resting, and her pose). */
  get seated(): boolean { return this.hooks.sitShare() > 0.5 || this.hooks.lieShare() > 0; }

  /** Getting up from a chair and putting it back (the game walks them for it, even once the mind has let go). */
  get leaving(): boolean { return !!this.seat?.leaving; }

  /** On a walk somewhere now (a way to follow, waiting on it or not): only passing where they stand (`Person.passing`). */
  get going(): boolean { return this.pathTo !== null && this.path.length > 0; }

  /** The chair they are using (or leaving), if any: where it is now, for the game to look at. */
  get chairNow(): { object: SmartObject; at: Vec2 } | null {
    return this.seat && this.chairs ? { object: this.seat.c.object, at: this.chairs.middle(this.seat.c) } : null;
  }

  /** The player takes them while they put a chair back, once they are up: the chair stays where it is. */
  stopLeaving(): void {
    const s = this.seat;
    if (!s?.leaving || this.hooks.sitShare() > 0) return;
    this.abandonSeat();
    this.walkTo = null; this.holdYaw = null; this.path = []; this.pathTo = null;
  }

  /** Once a frame BEFORE the mind ticks: the frame's seconds, and the pose asked for kept up. */
  frame(dt: number): void {
    this.dt = dt;
    // (walking the ordinary way unless a chair being pulled or pushed says otherwise, this frame)
    this.faceWalking = null; this.walkSpeed = null;
    // (getting up from a chair and putting it back: whether or not the mind still has them)
    if (this.seat?.leaving) this.stepLeaving();
    // (asleep in bed, she TURNS OVER now and then: game minutes, so the night's turns come at any clock speed)
    if (this.wanted === 'lie' && this.asleep && this.hooks.lieShare() >= 1) {
      this.turnOverIn -= dt * this.hooks.vitals.gameHoursPerSecond * 60;
      if (this.turnOverIn <= 0) { this.sleepSide = this.pickSide(this.sleepSide); this.turnOverIn = this.nextTurnOver(); }
    }
    if (this.wanted === 'sit' || this.wanted === 'doze') this.hooks.sitFor(SIT_AHEAD, true);
    if (this.wanted === 'lie' && this.bed) this.hooks.lieOn(this.lieSpot(this.bed));
    else this.hooks.lieOn(null);
  }

  /** The player takes them (or the mind lets go): no walk, no pose kept (they get up), nothing held. At a chair, they
   *  scoot out before they stand, then put it back (`leaving`). */
  release(): void {
    const atChair = !!this.seat && !BEFORE_GAP.has(this.seat.phase);
    if (atChair) this.beginLeaving(); else { this.abandonSeat(); this.wanted = 'stand'; }
    this.bed = null;
    this.walkTo = null; this.lookYaw = null; this.holdYaw = null;
    this.path = []; this.pathTo = null;
    if (!atChair) { this.hooks.walls.ignore = null; this.hooks.walls.ignoreAt = null; this.letInAt = null; }
    this.keepFace = null;
    this.hooks.lieOn(null);
    this.asleep = false; this.workload = 0; this.prop = null;
  }

  position(): Vec2 { return this.hooks.position(); }

  motion(): Motion {
    // (standing only once fully up: a body getting up is still in its pose; at a chair, once it is put back)
    if (this.seat?.leaving) return 'sit';
    if (this.hooks.lieShare() > 0) return 'lie';
    if (this.hooks.sitShare() > 0) return this.wanted === 'doze' ? 'doze' : 'sit';
    return this.wanted === 'stand' ? 'stand' : this.wanted;
  }

  goTo(to: Vec2, facing: number | null, within = 0): MoveStatus {
    // (a bed's spot is not walked to: its edge beside where her hips will lie is; a person is walked up to, not onto)
    const found = within > 0 ? null : this.slotAt(to);
    const chair = found && found.slot.motion === 'sit' ? this.chairs?.get(found.object.id) : undefined;
    // (a chair being put back is finished first; one stood at, and left for somewhere else, is put back first too;
    //  one only started on is let go where it is)
    if (this.seat) {
      if (this.seat.leaving) return 'moving';
      if (chair !== this.seat.c) {
        if (BEFORE_GAP.has(this.seat.phase)) this.abandonSeat();
        else { this.beginLeaving(); return 'moving'; }
      }
    }
    if (found && chair) return this.goToChair(chair, found.slot, to);
    let dest = to, destYaw = facing;
    if (found && found.slot.motion === 'lie') {
      this.bed = this.bedPlan(found.object, found.slot);
      dest = this.bed.edge; destYaw = this.bed.sitYaw;
    } else if (found && found.slot.motion === 'stand') dest = this.clearOfBelly(found.object, found.slot);
    const using = found?.object.id ?? null;
    // (where the thing lets her in: a seat's own spot to sit from, a bed's edge)
    const letInAt = found ? (found.slot.motion === 'lie' ? dest : found.slot.use) : null;
    const status = this.walk(dest, destYaw, using, letInAt, within, to, facing);
    // (there: her belly kept off the front of the thing she stands at)
    if (status === 'arrived' && found && found.slot.motion === 'stand') this.keepFace = this.faceOf(found.object, found.slot);
    return status;
  }

  /**
   * THE WALK to `dest` (arriving faced `destYaw`), round the walls, the furniture (`using` let in near `letInAt`) and
   * anyone standing; `within` > 0: up to someone (`to`), stopping that far off them along the way.
   */
  private walk(dest: Vec2, destYaw: number | null, using: string | null, letInAt: Vec2 | null, within = 0, to: Vec2 = dest, facing: number | null = destYaw): MoveStatus {
    const here = this.hooks.position();
    // (a person walked up to moves: their way is asked again only once they have moved a third of a metre)
    if (!this.pathTo || Math.hypot(this.pathTo.x - dest.x, this.pathTo.z - dest.z) > (within > 0 ? 0.3 : 0.01)) {
      // (a new place: its way, the thing there let in near its spot; nothing stood at yet)
      this.keepFace = null;
      this.letInAt = letInAt;
      const way = this.wayTo(here, dest, using);
      if (!way) {
        // (no way only because someone is using a chair in it (pulling it out, sitting at it): they wait a while for
        //  it to go back in; the desk chair pulled out closes the way past the bed to bedroom 3's window)
        if (this.chairWait < CHAIR_WAY_WAIT_MOST && this.nav.path(here, dest, using, letInAt ?? dest, [], true)) {
          this.chairWait += this.dt;
          this.walkTo = null; this.holdYaw = null;
          return 'waiting';
        }
        this.chairWait = 0;
        return 'blocked';
      }
      this.chairWait = 0;
      this.path = way; this.pathTo = { ...dest }; this.pathUsing = using;
      this.hooks.walls.ignore = using; this.hooks.walls.ignoreAt = letInAt;
      this.stuckFor = 0; this.tries = 0; this.waitedFor = 0; this.spotWaited = 0; this.lastAt = { ...here };
    }
    // (on along the way: the next point, or the end)
    while (this.path.length > 1 && Math.hypot(this.path[0].x - here.x, this.path[0].z - here.z) < NEXT_WITHIN) this.path.shift();
    const end = this.path[this.path.length - 1];
    // (NEAR, NOT ONTO: arrived once the walk left, and from its end to them, is no more than `within`: a metre from
    //  someone on the sofa the walking way, never a metre off through a wall; turned to face them)
    if (within > 0) {
      let left = Math.hypot(this.path[0].x - here.x, this.path[0].z - here.z) + Math.hypot(end.x - to.x, end.z - to.z);
      for (let i = 1; i < this.path.length; i++) left += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
      // (or simply that near them with no wall between: their way can end on their far side, and she circled them,
      //  pushed off them, in the simulation: a metre off them she is there, whatever way is left)
      if (left <= within || (Math.hypot(to.x - here.x, to.z - here.z) <= within && this.nav.noWallBetween(here, to))) {
        this.walkTo = null;
        this.holdYaw = facing ?? Math.atan2(to.x - here.x, to.z - here.z);
        this.pathTo = null; this.path = [];
        return 'arrived';
      }
    }
    if (this.path.length <= 1 && Math.hypot(end.x - here.x, end.z - here.z) < ARRIVE_WITHIN) {
      this.walkTo = null;
      this.holdYaw = destYaw;
      this.pathTo = null; this.path = [];
      return 'arrived';
    }
    this.walkTo = this.path[0];
    this.holdYaw = null;
    // (THEIR TURN: someone on the spot itself, and they are nearly there: they stop, face it and wait for them to go)
    if (within <= 0 && this.walkLeft() < SPOT_WAIT_FROM
      && this.hooks.walls.people().some((p) => !p.passing && Math.hypot(p.x - dest.x, p.z - dest.z) < SPOT_TAKEN_WITHIN)) {
      this.spotWaited += this.dt * this.hooks.vitals.gameHoursPerSecond * 60;
      if (this.spotWaited > SPOT_WAIT_MOST) { this.walkTo = null; this.pathTo = null; return 'blocked'; }
      this.walkTo = null;
      this.holdYaw = Math.atan2(dest.x - here.x, dest.z - here.z);
      this.lastAt = { ...here }; this.stuckFor = 0;
      return 'waiting';
    }
    // (GIVING WAY: someone they give way to just ahead, and not the one they walk up to: they stop, a few seconds at most)
    {
      const ax = this.walkTo.x - here.x, az = this.walkTo.z - here.z, al = Math.hypot(ax, az) || 1;
      const ahead = this.hooks.walls.people().some((p) => {
        if (!p.yieldTo) return false;
        if (within > 0 && Math.hypot(p.x - to.x, p.z - to.z) < 0.5) return false;
        const dx = p.x - here.x, dz = p.z - here.z, d = Math.hypot(dx, dz);
        return d < GIVE_WAY_WITHIN && Math.acos(Math.max(-1, Math.min(1, (dx * ax + dz * az) / (d * al || 1)))) < GIVE_WAY_AHEAD;
      });
      if (ahead && this.gaveWayFor < GIVE_WAY_MOST) {
        this.gaveWayFor += this.dt;
        this.walkTo = null;
        this.lastAt = { ...here }; this.stuckFor = 0;
        return 'moving';
      }
      if (!ahead) this.gaveWayFor = 0;
    }
    // (someone standing on the next leg: the way asked again round them, twice a second at most)
    this.personLookIn -= this.dt;
    if (this.personLookIn <= 0) {
      this.personLookIn = PERSON_LOOK_EVERY;
      if (this.hooks.walls.people().some((p) => toSegment(p, here, this.path[0]) < PERSON_ON_WAY)) {
        const way = this.wayTo(here, dest, this.pathUsing);
        if (way) { this.path = way; this.walkTo = this.path[0]; }
      }
    }
    // (no headway: ask again; three times and give up. Held up by SOMEONE, it waits for them instead, asking again)
    if (Math.hypot(here.x - this.lastAt.x, here.z - this.lastAt.z) > 0.05) { this.lastAt = { ...here }; this.stuckFor = 0; }
    else {
      this.stuckFor += this.dt;
      const byPerson = this.hooks.walls.people().some((p) => Math.hypot(p.x - here.x, p.z - here.z) < 1) && this.waitedFor < WAIT_FOR_PEOPLE;
      if (this.stuckFor > (byPerson ? PERSON_STUCK_SECONDS : STUCK_SECONDS)) {
        if (byPerson) this.waitedFor += this.stuckFor;
        this.stuckFor = 0;
        if (!byPerson && ++this.tries > STUCK_TRIES) { this.walkTo = null; this.pathTo = null; return 'blocked'; }
        const way = this.wayTo(here, dest, this.pathUsing);
        if (way) this.path = way;
      }
    }
    return 'moving';
  }

  /** The way to `dest` round the walls, the furniture (the thing used let in near its spot) and anyone standing; with
   *  no way round them (one blocks the only door), the way through, to wait for them on. */
  private wayTo(here: Vec2, dest: Vec2, using: string | null): Vec2[] | null {
    const letIn = this.letInAt ?? dest;
    const people = this.hooks.walls.people();
    return (people.length ? this.nav.path(here, dest, using, letIn, people) : null) ?? this.nav.path(here, dest, using, letIn);
  }

  /** How far the walk under way has left to go, metres (along its way; 0 when not walking). */
  walkLeft(): number {
    if (!this.walkTo || !this.path.length) return 0;
    const here = this.hooks.position();
    let left = Math.hypot(this.path[0].x - here.x, this.path[0].z - here.z);
    for (let i = 1; i < this.path.length; i++) left += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
    return left;
  }

  stopMoving(): void {
    this.walkTo = null;
    this.path = []; this.pathTo = null;
    this.keepFace = null;
    // (a chair only started on is let go where it is; one sat on is put back once they are asked to stand)
    if (this.seat && BEFORE_GAP.has(this.seat.phase)) this.abandonSeat();
  }

  pose(motion: Motion, facing: number | null): 'changing' | 'ready' {
    // AT A CHAIR: sat on and scooted in; asked to stand, scooted out, up, and put back (`stepLeaving`, each frame)
    if (this.seat) {
      if (motion === 'stand') {
        if (BEFORE_GAP.has(this.seat.phase)) this.abandonSeat();
        else { if (!this.seat.leaving) this.beginLeaving(); return 'changing'; }
      } else if ((motion === 'sit' || motion === 'doze') && !this.seat.leaving && !BEFORE_GAP.has(this.seat.phase)) return this.sitOnChair(motion, facing);
    }
    this.walkTo = null;
    if (motion === 'stand') {
      // (someone standing right at them: they stay down until there is room to stand up into; in the simulation John
      //  got up from the sofa into Mary walking past it, 29 cm apart)
      if (this.wanted !== 'stand' && this.hooks.sitShare() >= 1 && this.someoneAtUs()) return 'changing';
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
      // (lying down: the side she will lie on, and how long before she first turns over)
      if (this.wanted !== 'lie') { this.sleepSide = this.pickSide(null); this.turnOverIn = this.nextTurnOver(); }
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

  // ---- a chair at a table (v0.2.182: see the top of this file) ----------------------------------------------------------

  /** The way a chair faces (toward its table), as a compass yaw: the way she faces to pull, push and sit on it. */
  private yawOf(c: PullChair): number { return Math.atan2(c.fwd.x, c.fwd.z); }

  /** Their belly's reach in front of them standing (none told: a flat front's). */
  private bellyAhead(): number { return this.hooks.bellyAhead?.() ?? 0.15; }

  /** The walk to a chair (its slot's approach: beside its back), then the pull and the step into the gap (its slot's use). */
  private goToChair(c: PullChair, slot: ObjectSlot, to: Vec2): MoveStatus {
    const chairs = this.chairs!;
    if (!this.seat) {
      // (the hand on her side nearer the chair: her right is (-cos, sin) of her facing, and the chair is on her -side)
      const yaw = this.yawOf(c), rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const hand: Hand = -c.side.x * rx - c.side.z * rz > 0 ? 'right' : 'left';
      this.seat = { c, pull: chairs.pullFor(c, this.bellyAhead()), phase: 'grab', hand, t: 0, leaving: false, scootTo: 0, holding: false, stall: 0, reach: false, mark: Infinity, markT: 0 };
      // (theirs until they are done with it: not bumped by anyone, and the walk grid sees it where it is)
      chairs.hold(c, true);
    }
    const s = this.seat, yaw = this.yawOf(c);
    // (its slot's approach: to beside its back, where it is now; already pulled out far enough, nothing to do there)
    if (Math.hypot(to.x - slot.approach.x, to.z - slot.approach.z) < 0.03 && Math.hypot(to.x - slot.use.x, to.z - slot.use.z) >= 0.03) {
      if (s.phase !== 'grab' || c.out >= s.pull - 0.02) return 'arrived';
      return this.walk(chairs.grabSpot(c), yaw, null, null);
    }
    switch (s.phase) {
      case 'grab': {
        if (c.out >= s.pull - 0.02) { s.phase = 'in'; return 'moving'; }
        const status = this.walk(chairs.grabSpot(c), yaw, null, null);
        if (status !== 'arrived') return status;
        // (turned to the table, then her hand to its backrest)
        this.holdYaw = yaw;
        if (Math.abs(wrap(this.hooks.facing() - yaw)) > TURNED_WITHIN) return 'moving';
        this.gripChair(s);
        s.phase = 'grip'; s.t = 0;
        return 'moving';
      }
      case 'grip': {
        s.t += this.dt;
        this.gripChair(s);
        if (s.t >= GRIP_SECONDS || (this.hooks.gripped?.(s.hand) ?? 1) >= 0.95) { s.phase = 'pull'; s.t = 0; }
        return 'moving';
      }
      case 'pull': {
        // (it comes out as far as she has gone back from where she stood to take it: never back in, never past her pull)
        const here = this.hooks.position(), from = chairs.grabSpot(c, 0), end = chairs.grabSpot(c, s.pull);
        const back = -((here.x - from.x) * c.fwd.x + (here.z - from.z) * c.fwd.z);
        const next = Math.min(s.pull, Math.max(c.out, back));
        // (pushed off her line beside it: the chair waits while she steps back onto it)
        if (this.offLine(s, here, from, c.out, s.pull)) {
          if (s.t > CHAIR_WAIT_MOST) { this.abandonSeat(); this.walkTo = null; return 'blocked'; }
          return 'waiting';
        }
        // (someone behind it: she waits, holding it, for them to move; a while, and she gives up on it)
        if (this.chairBlocked(c, next)) {
          s.t += this.dt;
          if (s.t > CHAIR_WAIT_MOST) { this.abandonSeat(); this.walkTo = null; return 'blocked'; }
          this.gripChair(s); this.walkTo = null; this.holdYaw = yaw;
          return 'waiting';
        }
        s.t = 0;
        s.stall = next > c.out + 1e-4 ? 0 : s.stall + this.dt;
        chairs.set(c, next);
        this.gripChair(s);
        if (c.out >= s.pull - 0.005 || Math.hypot(end.x - here.x, end.z - here.z) < 0.04 || s.stall > STALL_SECONDS) {
          if (s.stall <= STALL_SECONDS) chairs.set(c, s.pull);
          this.letGoOfChair(s);
          this.walkTo = null;
          s.phase = 'letGo'; s.t = 0; s.stall = 0;
          return 'moving';
        }
        // (backing up with it, still facing the table, at a pull's pace)
        this.walkTo = end; this.holdYaw = null;
        this.faceWalking = yaw; this.walkSpeed = CHAIR.pullSpeed;
        return 'moving';
      }
      case 'letGo': {
        s.t += this.dt;
        if (s.t >= LET_GO_SECONDS) s.phase = 'in';
        return 'moving';
      }
      case 'in': {
        // (round its front into the gap, facing the table; the chair and the table let her in near her spot)
        const spot = chairs.standSpot(c);
        const status = this.walk(spot, yaw, c.object.id, spot);
        if (status !== 'arrived') return status;
        this.keepFace = this.tableFace(c);
        s.phase = 'sit';
        return 'arrived';
      }
      default:
        return 'arrived';
    }
  }

  /** Sitting on the chair, then scooting in with it until her belly is just off the table's edge. */
  private sitOnChair(motion: Motion, facing: number | null): 'changing' | 'ready' {
    const s = this.seat!, c = s.c, chairs = this.chairs!;
    this.walkTo = null;
    if (s.phase === 'sit') {
      // (her back to the seat, then down, as on any seat)
      if (facing !== null) this.holdYaw = facing;
      if (this.wanted !== motion && facing !== null && Math.abs(wrap(this.hooks.facing() - facing)) > TURNED_WITHIN) return 'changing';
      this.wanted = motion;
      this.keepFace = null;
      if (this.hooks.sitShare() < 1) return 'changing';
      // (seated: how far in she can go, measured on her as she sits: her belly's front toward the table)
      const front = this.hooks.bellyFurthest?.(c.fwd.x, c.fwd.z) ?? null;
      s.scootTo = c.out - chairs.scootFor(c, front ?? this.bellyGuess(c));
      s.phase = 'scootIn';
    }
    if (s.phase === 'scootIn') {
      if (!this.slide(c, s.scootTo, true)) return 'changing';
      s.phase = 'seated';
    }
    return 'ready';
  }

  /** Where a body with no measured belly (the simulation's) has its belly's front seated: in front of its hips. */
  private bellyGuess(c: PullChair): Vec2 {
    const hips = this.chairs!.hipsSpot(c), ahead = this.bellyAhead() + 0.04;
    return { x: hips.x + c.fwd.x * ahead, z: hips.z + c.fwd.z * ahead };
  }

  /** Begin getting up from the chair and putting it back (scooted out first if seated). */
  private beginLeaving(): void {
    const s = this.seat;
    if (!s || s.leaving) return;
    s.leaving = true;
    s.phase = this.hooks.sitShare() > 0 || s.phase === 'scootIn' || s.phase === 'seated' ? 'scootOut' : 'out';
    this.keepFace = null;
  }

  /** GETTING UP FROM A CHAIR AND PUTTING IT BACK, each frame (`frame`): out, up, to its side, hold, walk it back in. */
  private stepLeaving(): void {
    const s = this.seat!, c = s.c, chairs = this.chairs!, yaw = this.yawOf(c);
    switch (s.phase) {
      case 'scootOut': {
        // (still seated: the sit kept, the chair and she slide back out to where she sat down; someone standing behind
        //  it a while, and she gets up where she is)
        s.t += this.dt;
        this.wanted = this.wanted === 'doze' ? 'doze' : 'sit';
        this.walkTo = null; this.holdYaw = yaw;
        if (this.slide(c, s.pull, true) || s.t > CHAIR_WAIT_MOST) { s.phase = 'rise'; s.t = 0; }
        return;
      }
      case 'rise': {
        // (someone standing right at her: she stays seated a while for them to pass)
        if (this.wanted !== 'stand' && this.hooks.sitShare() >= 1 && this.someoneAtUs() && s.t < CHAIR_WAIT_MOST) { s.t += this.dt; return; }
        this.wanted = 'stand';
        this.walkTo = null; this.holdYaw = yaw;
        if (this.hooks.sitShare() <= 0) { s.phase = 'out'; s.t = 0; this.path = []; this.pathTo = null; }
        return;
      }
      case 'out': {
        // (out of the gap to beside its back, the chair and the table letting her out near where she stood; no way
        //  there, or someone standing in it a while, and the chair is left out)
        s.t += this.dt;
        const status = this.walk(chairs.grabSpot(c), yaw, c.object.id, chairs.standSpot(c));
        if (status === 'blocked' || (status !== 'arrived' && s.t > OUT_MOST)) { this.abandonSeat(); this.walkTo = null; return; }
        if (status !== 'arrived') return;
        this.walkTo = null; this.holdYaw = yaw;
        if (Math.abs(wrap(this.hooks.facing() - yaw)) > TURNED_WITHIN) return;
        this.gripChair(s);
        s.phase = 'gripPush'; s.t = 0;
        return;
      }
      case 'gripPush': {
        s.t += this.dt;
        this.walkTo = null; this.holdYaw = yaw;
        this.gripChair(s);
        if (s.t >= GRIP_SECONDS || (this.hooks.gripped?.(s.hand) ?? 1) >= 0.95) { s.phase = 'push'; s.t = 0; }
        return;
      }
      case 'push': {
        // (it goes in as far as she has walked toward the table from where she took it: never out again)
        const here = this.hooks.position(), home = chairs.grabSpot(c, 0);
        const left = -((here.x - home.x) * c.fwd.x + (here.z - home.z) * c.fwd.z);
        const next = Math.max(0, Math.min(c.out, left));
        // (pushed in from where she stands, arm out: slid home at its scoot's pace, if her arm still reaches its back)
        if (s.reach) {
          this.walkTo = null; this.holdYaw = yaw;
          const back = chairs.middle(c);
          const arm = Math.hypot(back.x - c.fwd.x * 0.2 - here.x, back.z - c.fwd.z * 0.2 - here.z);
          if (arm > REACH_MOST) { this.abandonSeat(); return; }
          this.gripChair(s);
          if (!this.slide(c, 0, false)) return;
          this.letGoOfChair(s);
          s.phase = 'letGoPush'; s.t = 0;
          return;
        }
        // (hardly going in a while: from where she is, arm out)
        if (c.out < s.mark - MARK_STEP || s.mark === Infinity) { s.mark = c.out; s.markT = 0; }
        else s.markT += this.dt;
        if (s.markT > REACH_AFTER) { s.reach = true; this.walkTo = null; return; }
        // (pushed off her line beside it: the chair waits while she steps back onto it; a while, and it is left out)
        if (this.offLine(s, here, home, 0, c.out)) {
          if (s.t > CHAIR_WAIT_MOST) { this.abandonSeat(); this.walkTo = null; }
          return;
        }
        // (someone in its way: she waits, holding it, for them to move; a while, and it is left where it is)
        if (this.chairBlocked(c, next)) {
          s.t += this.dt;
          if (s.t > CHAIR_WAIT_MOST) { this.abandonSeat(); this.walkTo = null; return; }
          this.gripChair(s); this.walkTo = null; this.holdYaw = yaw;
          return;
        }
        s.t = 0;
        s.stall = next < c.out - 1e-4 ? 0 : s.stall + this.dt;
        chairs.set(c, next);
        this.gripChair(s);
        // (held up short of it, a wall or a thing at her back: the last few centimetres slid home from where she stands;
        //  further out than that, it is left where it is)
        if (s.stall > STALL_SECONDS) {
          if (c.out >= 0.12) { this.abandonSeat(); this.walkTo = null; return; }
          this.walkTo = null; this.holdYaw = yaw;
          if (!this.slide(c, 0, false)) return;
        }
        if (c.out <= 0.005 || Math.hypot(home.x - here.x, home.z - here.z) < 0.04) {
          chairs.set(c, 0);
          this.letGoOfChair(s);
          this.walkTo = null;
          s.phase = 'letGoPush'; s.t = 0;
          return;
        }
        this.walkTo = home; this.holdYaw = null;
        this.faceWalking = yaw; this.walkSpeed = CHAIR.pullSpeed;
        return;
      }
      case 'letGoPush': {
        s.t += this.dt;
        this.walkTo = null; this.holdYaw = yaw;
        if (s.t >= LET_GO_SECONDS) { this.chairs!.hold(c, false); this.seat = null; this.holdYaw = null; this.hooks.walls.ignore = null; this.hooks.walls.ignoreAt = null; this.letInAt = null; }
        return;
      }
      default:
        // (a phase before the gap: nothing to put back)
        this.abandonSeat();
    }
  }

  /** Someone standing nearer them than they are kept apart (getting up now would put them on top of each other). */
  private someoneAtUs(): boolean {
    const here = this.hooks.position();
    return this.hooks.walls.people().some((p) => Math.hypot(p.x - here.x, p.z - here.z) < Math.min(p.apart, SQUEEZE_LEAST + 0.05));
  }

  /** Let go of the chair where it is (her hand off it), and of the plan. */
  private abandonSeat(): void {
    const s = this.seat;
    if (!s) return;
    this.letGoOfChair(s);
    // (still in the gap between it and the table, or beside it: they and the table let her walk out of them first)
    this.hooks.walls.escape = s.c.object.id;
    // (left where it is: anyone walking into it from behind bumps it back in)
    this.chairs?.hold(s.c, false);
    this.seat = null;
    this.faceWalking = null; this.walkSpeed = null;
  }

  /**
   * PULLING OR PUSHING, OFF HER LINE: true if she has been pushed further than LINE_OFF to the side of the straight line
   * she walks beside the chair (through `home`, its grab spot tucked in, along its forward way), and then she is sent
   * straight back onto it (the nearest point on it, between `least` and `most` metres out), the chair held where it is
   * and its wait counted (`s.t`; the caller gives up past CHAIR_WAIT_MOST). Back on it, the wait starts again.
   */
  private offLine(s: SeatPlan, here: Vec2, home: Vec2, least: number, most: number): boolean {
    const c = s.c;
    const rx = here.x - home.x, rz = here.z - home.z;
    const aside = rx * c.side.x + rz * c.side.z;
    if (Math.abs(aside) <= LINE_OFF) return false;
    s.t += this.dt;
    // (the point on the line beside her: how far out she is along it, held to the chair's travel)
    const out = Math.max(least, Math.min(most, -(rx * c.fwd.x + rz * c.fwd.z)));
    this.gripChair(s);
    this.walkTo = { x: home.x - c.fwd.x * out, z: home.z - c.fwd.z * out };
    this.holdYaw = null;
    this.faceWalking = this.yawOf(c); this.walkSpeed = CHAIR.pullSpeed;
    return true;
  }

  /**
   * Slide the chair toward `out` metres pulled out at its scoot's pace (seated, she goes with it: `carry`); true once
   * there.
   */
  private slide(c: PullChair, out: number, carry: boolean): boolean {
    const step = CHAIR.scootSpeed * this.dt, was = c.out;
    const next = Math.abs(out - was) <= step ? out : was + Math.sign(out - was) * step;
    // (not into anyone standing behind it: it waits)
    if (this.chairBlocked(c, next)) return false;
    this.chairs!.set(c, next);
    const moved = c.out - was;
    // (the chair goes -fwd as it comes out: she goes with it)
    if (carry && Math.abs(moved) > 1e-6) this.hooks.carry?.(-c.fwd.x * moved, -c.fwd.z * moved);
    return Math.abs(c.out - out) < 1e-4;
  }

  /** Whether the chair, moved to `out`, would run into someone standing (not into them: it waits). */
  private chairBlocked(c: PullChair, out: number): boolean {
    if (Math.abs(out - c.out) < 1e-6) return false;
    for (const p of this.hooks.walls.people()) {
      // (only someone it moves toward: one it moves away from is no matter)
      if (this.chairs!.hits(c, out, p.x, p.z, CHAIR_KEEPS_OFF) && !this.chairs!.hits(c, c.out, p.x, p.z, CHAIR_KEEPS_OFF)) return true;
    }
    return false;
  }

  /** Her hand on the chair's backrest top (again each frame, where it is now). */
  private gripChair(s: SeatPlan): void {
    s.holding = true;
    this.hooks.grip?.(s.hand, this.backrest(s.c));
  }

  private letGoOfChair(s: SeatPlan): void {
    if (s.holding) this.hooks.grip?.(s.hand, null);
    s.holding = false;
  }

  /** A chair's backrest top as a rail (homeScene.ts draws it: 0.48 m to 0.96 m up, 5 cm thick, at the chair's back). */
  private backrest(c: PullChair): Rail {
    const m = this.chairs!.middle(c), w = Math.min(c.object.size.w, c.object.size.d), scale = w / 0.45;
    const back = w / 2 - 0.025 * scale, y = 0.96 - 0.025;
    const bx = m.x - c.fwd.x * back, bz = m.z - c.fwd.z * back;
    const half = w / 2, at = w / 2 - 0.07;
    // (the palm down onto it and a little toward the chair's far side; the fingers round toward its seat)
    const px = -c.side.x * 0.35, pz = -c.side.z * 0.35, pl = Math.hypot(px, 1, pz);
    return {
      a: { x: bx - c.side.x * half, y, z: bz - c.side.z * half },
      b: { x: bx + c.side.x * half, y, z: bz + c.side.z * half },
      at: { x: bx + c.side.x * at, y, z: bz + c.side.z * at },
      radius: 0.025 * scale,
      palm: { x: px / pl, y: -1 / pl, z: pz / pl },
      wrap: { x: c.fwd.x, y: 0, z: c.fwd.z },
    };
  }

  /** The table's edge in front of a chair, for her belly to be kept off. */
  private tableFace(c: PullChair): KeepFace {
    const x = c.home.x + c.fwd.x * c.edge, z = c.home.z + c.fwd.z * c.edge;
    return { x, z, outX: -c.fwd.x, outZ: -c.fwd.z, top: THING_TOP.diningTable };
  }

  /**
   * WHERE SHE STANDS AT A THING, HER BELLY CLEAR OF IT (Joshua: "her belly doesn't clip... standing at the sink"): its
   * slot's spot, moved back as far as her belly would reach past the thing's front (and BELLY_CLEAR more).
   */
  private clearOfBelly(o: SmartObject, slot: ObjectSlot): Vec2 {
    const f = { x: Math.sin(slot.facing), z: Math.cos(slot.facing) };
    const toFront = rayToBlock(slot.use, f, objectBlock(o));
    if (!Number.isFinite(toFront)) return slot.use;
    const back = this.bellyAhead() + BELLY_CLEAR - toFront;
    return back > 0 ? { x: slot.use.x - f.x * back, z: slot.use.z - f.z * back } : slot.use;
  }

  /** The front of a thing she stands at (its face toward her spot), for her belly to be kept off; null: not in front of it. */
  private faceOf(o: SmartObject, slot: ObjectSlot): KeepFace | null {
    const f = { x: Math.sin(slot.facing), z: Math.cos(slot.facing) };
    const toFront = rayToBlock(slot.use, f, objectBlock(o));
    if (!Number.isFinite(toFront)) return null;
    return { x: slot.use.x + f.x * toFront, z: slot.use.z + f.z * toFront, outX: -f.x, outZ: -f.z, top: THING_TOP[o.type] ?? 1 };
  }

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

  private lieSpot(b: BedPlan): { x: number; y: number; z: number; yaw: number; side: number; pillow: boolean } {
    // (on the top of what her hips lie on: her body lays her own flesh over it, groundPose.ts LIE_POSE)
    // (the knee pillow: the setting's Always or Never at once, else as chosen with her side)
    const setting = this.hooks.kneePillow?.() ?? 'mixed';
    const pillow = setting === 'always' ? true : setting === 'never' ? false : this.kneePillow;
    return { x: b.hips.x, y: this.hooks.floorY() + b.under, z: b.hips.z, yaw: b.feetYaw, side: this.sleepSide, pillow };
  }

  /**
   * WHICH WAY SHE SLEEPS (Joshua, 2026-11-26: "Are they both sleeping on their sides yet or just back?"): her back, her
   * left side or her right (`SLEEP_SIDES`), at random by those weights, never the one she is on when she turns over.
   * From 28 weeks pregnant mostly on her side, her left the most (as she is told to then: off her back, the left best for
   * the baby's blood flow). With a side, whether a pillow goes between her knees (more often late in a pregnancy).
   */
  private pickSide(now: number | null): number {
    const late = this.hooks.vitals.weeksPregnant >= SLEEP_SIDES.lateFrom;
    const w = late ? SLEEP_SIDES.late : SLEEP_SIDES.usual;
    const choices = ([[0, w.back], [1, w.left], [-1, w.right]] as const).filter(([side]) => side !== now);
    let roll = Math.random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
    let side: number = choices[choices.length - 1][0];
    for (const [s, weight] of choices) { roll -= weight; if (roll <= 0) { side = s; break; } }
    // (and, on a side, a pillow between her knees or her legs together: Joshua, 2026-11-26, "for both of them")
    this.kneePillow = side !== 0 && Math.random() < (late ? SLEEP_SIDES.pillowLate : SLEEP_SIDES.pillow);
    return side;
  }

  /** Game minutes until her next turn over. */
  private nextTurnOver(): number {
    return SLEEP_SIDES.turnLeast + Math.random() * (SLEEP_SIDES.turnMost - SLEEP_SIDES.turnLeast);
  }
}
