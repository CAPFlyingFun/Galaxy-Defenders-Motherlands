// ============================================================================
// mind/activities.ts -- EVERYTHING A CHARACTER CAN CHOOSE TO DO: how much each appeals right now (a score, with the
// reason in words), and the steps it takes (a plan), as data and small functions.
//
// Joshua's brief, section 3 (the loop the mind runs, mind.ts): read the needs and feelings, find what can be done,
// score it, choose, find the thing to use, walk there, use it, update the stats, choose again. "Priority calculations
// should consider: urgency of the need, personality, current emotional state, distance to the destination,
// availability of resources, safety, current activity, storyline objectives." Section 6: "I do not want the AI to
// stand idle indefinitely... Characters should still occasionally stand idle naturally."
//
// SCORES run about 0..100: a pressing need is 60-100, a pastime 5-40. A need's score is 100 x its URGENCY (0..1, the
// curves below, from the character's own levels: profile.ts); a pastime's is its BASE appeal x their traits and
// likes x VARIETY (less if done lately) x a little chance (each mind's own seeded dice), less a little for each metre
// to walk. What is running is held to unless something clearly better comes (mind.ts: commitment), and only an
// EMERGENCY stops a need half done.
//
// A PLAN is steps (mind.ts runs them): reserve a thing, walk to it, take a pose, work at it a while (eating, sleeping,
// talking: game minutes, or a bathroom visit's real seconds), and let go.
// ============================================================================
import type { ActivityId, ActorId, Motion, NeedsSnapshot, ObjectSlot, ObjectType, SmartObject, Vec2 } from './types';
import type { CharacterProfile } from './profile';
import type { EmotionState } from './emotions';
import type { Memory } from './memory';
import type { MindBody, MindWorld, Prop } from './world';
import { trait, type Trait } from './traits';
import { between, type Rng } from './random';
import { atTheTable, type FoodItem, type FoodKind } from './food';

/** What kind of thing an activity is: it decides what may interrupt it (mind.ts). */
export type Category = 'need' | 'rest' | 'fun' | 'social' | 'idle' | 'follow' | 'wait';

/** The thing chosen to use, and one of its slots, and how far away it is. */
export interface Pick {
  readonly object: SmartObject;
  readonly slot: ObjectSlot;
  readonly metres: number;
}

/** One activity, scored: what it would be now and why. */
export interface Choice {
  readonly activity: ActivityId;
  readonly score: number;
  readonly reason: string;
  readonly emergency?: boolean;
  /** the main thing it uses (the chair for a meal, the toilet, their side of the bed) */
  readonly pick?: Pick;
  /** a second thing on the way (the fridge for a meal) */
  readonly via?: Pick;
  /** a spot to go to (wandering, following, a chat) */
  readonly spot?: Vec2;
  /** who it is with (a chat) */
  readonly with?: ActorId;
  /** the player asked for it (interact.ts): a drink or a meal is had even when they are not thirsty or hungry */
  readonly asked?: boolean;
  /** what they will eat or drink (mind/food.ts): a meal's, a snack's or the player's pick */
  readonly item?: FoodItem;
}

/** One step of a plan. */
export type Step =
  | { readonly kind: 'reserve'; readonly pick: Pick }
  | { readonly kind: 'go'; readonly to: Vec2; readonly facing: number | null; readonly what: string; readonly pick?: Pick; readonly within?: number }
  | { readonly kind: 'pose'; readonly motion: Motion; readonly facing: number | null; readonly what: string }
  | {
    readonly kind: 'work';
    readonly what: string;
    /** how long it lasts: game seconds, or real seconds (a bathroom visit), or until `until` says so */
    gameSeconds?: number;
    realSeconds?: number;
    readonly until?: (c: MindContext) => boolean;
    readonly start?: (c: MindContext) => void;
    readonly each?: (c: MindContext, gameDt: number, realDt: number) => void;
    readonly end?: (c: MindContext, finished: boolean) => void;
    /** how it feels while it lasts (emotions.ts): restful 0.35 walking .. 0.9 lying; enjoying 0..1; asleep */
    readonly restful?: number;
    readonly enjoying?: number;
    readonly asleep?: boolean;
    /** what is in the hand meanwhile, and where they look */
    readonly prop?: Prop;
    readonly look?: Vec2;
  }
  | { readonly kind: 'do'; readonly what: string; readonly fn: (c: MindContext) => boolean | void }
  | { readonly kind: 'release'; readonly objectId?: string };

/** An activity: what it is, how it scores, how it is done. */
export interface ActivityDef {
  readonly id: ActivityId;
  /** for people: "Eat a meal" */
  readonly label: string;
  readonly category: Category;
  evaluate(c: MindContext): Choice | null;
  plan(c: MindContext, choice: Choice): Step[];
}

/** What an activity can see of its character (the mind gives it: mind.ts). */
export interface MindContext {
  readonly id: ActorId;
  readonly profile: CharacterProfile;
  readonly needs: NeedsSnapshot;
  readonly feel: Readonly<EmotionState>;
  readonly memory: Memory;
  readonly world: MindWorld;
  readonly body: MindBody;
  readonly rng: Rng;
  /** the game clock now: day, hour 0..24, game seconds since day 1 */
  readonly day: number;
  readonly hour: number;
  readonly now: number;
  /** their levels now, stress counted in (the stress eater's move: `levelsNow`) */
  readonly levels: LevelsNow;
  /** the others at home with them, as the mind sees them */
  readonly others: readonly OtherView[];
  /** the one being played, if any (a companion follows them) */
  readonly leader: OtherView | null;
  /** companion mode */
  readonly companion: boolean;
  /** the activity running now, and its choice */
  readonly running: ActivityId | null;
  /** talk to another mind: whether they come (society.ts) */
  invite(to: ActorId, meetMe: Vec2, meetThem: Vec2, gameMinutes: number): boolean;
  /** whether the one they are talking with is still talking with them */
  stillTalkingWith(other: ActorId): boolean;
  /**
   * a meal's size and target, worked out when it starts (kept for its plan); `from` is the fridge it was taken out of
   * until it is eaten (a plan that stops first puts it back: mind.ts `stop`)
   */
  meal: { targetBar: number; portionMl: number; eatenMl: number; from: string | null; item: string | null };
}

/** How the mind sees someone else at home. */
export interface OtherView {
  readonly id: ActorId;
  readonly name: string;
  readonly position: Vec2;
  readonly room: string | null;
  readonly activity: ActivityId | null;
  readonly asleep: boolean;
  /** they are seeing to a need (eating, the bathroom, sleep): not to be bothered */
  readonly busy: boolean;
  /** the player has them */
  readonly played: boolean;
}

/** A character's levels right now, stress counted in. */
export interface LevelsNow {
  readonly eatBelow: number;
  readonly mealTarget: readonly [number, number];
  readonly snackBelow: number;
  /** how much more snacks appeal (1: as normal) */
  readonly snackMore: number;
  /** how much more wandering appeals (1: as normal) */
  readonly restless: number;
  /** how well they sleep now, 0..1 */
  readonly sleepQuality: number;
  /** their stress x their stress-eater trait, 0..1: how far their stress has moved their eating */
  readonly stressEating: number;
}

/**
 * THEIR LEVELS NOW: with WORRY (their stress less their body's needs: emotions.ts), a stress eater's move toward their
 * stressed levels (profile.ts StressEating).
 */
export function levelsNow(profile: CharacterProfile, feel: Readonly<EmotionState>, worry = feel.stress): LevelsNow {
  const n = profile.needs, se = profile.stressEating, s = Math.min(1, worry * trait(profile.traits, 'stressEater'));
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  if (!se) return { eatBelow: n.eatBelow, mealTarget: n.mealTarget, snackBelow: n.snackBelow, snackMore: 1, restless: 1, sleepQuality: 1 - 0.15 * feel.stress, stressEating: 0 };
  // (the stressed ends of the ranges are their middles: the dice pick within the range at the meal itself)
  const eatStressed = (se.eatBelow[0] + se.eatBelow[1]) / 2;
  return {
    eatBelow: lerp(n.eatBelow, eatStressed, s),
    mealTarget: [lerp(n.mealTarget[0], se.mealTarget[0], s), lerp(n.mealTarget[1], se.mealTarget[1], s)],
    snackBelow: lerp(n.snackBelow, eatStressed + 0.1, s),
    snackMore: 1 + (se.snackMore - 1) * s,
    restless: 1 + (se.restless - 1) * s,
    sleepQuality: Math.min(1 - 0.15 * feel.stress, lerp(1, se.sleepQuality, s)),
    stressEating: s,
  };
}

// ---- URGENCY CURVES: a need 0..1 from a bar and their levels ---------------------------------------------------------

/**
 * FOOD: nothing above their level (between meals a snack appeals instead: `snack`), 0.6 at it (enough to go), 1 at
 * empty.
 */
export function foodUrgency(bar: number, below: number): number {
  if (bar >= below) return 0;
  return 0.6 + (0.4 * (below - bar)) / Math.max(0.01, below);
}

/** WATER: a little appeal just above their level (a drink when handy), 0.6 at it, 1 at empty. */
export function waterUrgency(bar: number, below: number): number {
  if (bar >= below + 0.15) return 0;
  if (bar >= below) return (0.6 * (below + 0.15 - bar)) / 0.15;
  return 0.6 + (0.4 * (below - bar)) / Math.max(0.01, below);
}

/** THE BATHROOM: nothing under `from`, 0.3-0.65 from there to `at` (worth it if handy), 0.75-1 past `at` (go). */
export function bathroomUrgency(fill: number, from: number, at: number): number {
  if (fill < from) return 0;
  if (fill < at) return 0.3 + (0.35 * (fill - from)) / (at - from);
  return Math.min(1, 0.75 + (0.25 * (fill - at)) / Math.max(0.01, 1 - at));
}

/**
 * IN THEIR NIGHT (from half an hour before their bedtime to half an hour before their waking time) eating, snacking and
 * drinking appeal this share as much: up for the toilet at 05:30 with an empty stomach, they go back to bed, not to the
 * fridge (a night's fast is normal: the stomach is empty by every morning). Out of it, 1.
 */
export function nightDamp(c: MindContext): number {
  const h = c.profile.habits;
  return inNight(c.hour, h.bedtime, h.wake - 0.5) ? 0.45 : 1;
}

/** The hour is in their night (from half an hour before their bedtime to their waking time). */
export function inNight(hour: number, bedtime: number, wake: number): boolean {
  const since = (((hour - (bedtime - 0.5)) % 24) + 24) % 24, span = (((wake - (bedtime - 0.5)) % 24) + 24) % 24;
  return since < span;
}

// ---- PICKING A THING ------------------------------------------------------------------------------------------------

/** Someone standing this near a slot's spot (m) has it, reserved or not. */
const SPOT_TAKEN = 0.5;

/**
 * THE BEST FREE SLOT among things of these types: free (or theirs already), nobody standing on it, not one they are
 * avoiding, reachable; their OWN (their side of the bed) first, then the nearest; another's own only if `othersOwn`.
 * Null if none.
 */
export function pickSlot(c: MindContext, types: readonly ObjectType[], options: {
  readonly filter?: (o: SmartObject, s: ObjectSlot) => boolean; readonly othersOwn?: boolean; readonly from?: Vec2; readonly stock?: 'meals' | 'drinks' | 'snacks';
} = {}): Pick | null {
  const from = options.from ?? c.body.position();
  let best: Pick | null = null, bestCost = Infinity;
  for (const object of c.world.objects()) {
    if (!types.includes(object.type) || c.memory.avoiding(object.id, c.now)) continue;
    if (options.stock && c.world.stock(object.id, options.stock) <= 0) continue;
    for (const slot of object.slots) {
      const holder = c.world.holder(object.id, slot.id);
      if (holder && holder !== c.id) continue;
      if (slot.owner && slot.owner !== c.id && !options.othersOwn) continue;
      if (options.filter && !options.filter(object, slot)) continue;
      // (someone standing on its spot -- at the sink, whose spot is the kitchen window's too -- and it is not free: one
      //  of the household simulation's walks waited there for John, then gave up)
      if (c.others.some((o) => Math.hypot(o.position.x - slot.use.x, o.position.z - slot.use.z) < SPOT_TAKEN)) continue;
      const metres = c.world.travel(from, slot.approach);
      if (metres === null) continue;
      // (their own first: as if 30 m nearer; another's own last: 30 m further)
      const cost = metres - (slot.owner === c.id ? 30 : 0) + (slot.owner && slot.owner !== c.id ? 30 : 0);
      if (cost < bestCost) { bestCost = cost; best = { object, slot, metres }; }
    }
  }
  return best;
}

/**
 * Whether every REACHABLE thing of these types is taken (someone else has every slot), and the nearest of them to wait
 * by. One they cannot get to (behind a door that will not open) is neither free nor worth waiting for.
 */
function allTaken(c: MindContext, types: readonly ObjectType[]): Pick | null {
  let near: Pick | null = null;
  for (const object of c.world.objects()) {
    if (!types.includes(object.type)) continue;
    for (const slot of object.slots) {
      const metres = c.world.travel(c.body.position(), slot.approach);
      if (metres === null) continue;
      const holder = c.world.holder(object.id, slot.id);
      if (!holder || holder === c.id) return null;
      if (!near || metres < near.metres) near = { object, slot, metres };
    }
  }
  return near;
}

// ---- STEPS USED BY MANY -------------------------------------------------------------------------------------------

/** Walk to a slot: its approach, then where it is used, facing the way it is used. */
function goTo(p: Pick, what: string): Step[] {
  return [
    { kind: 'go', to: p.slot.approach, facing: null, what, pick: p },
    { kind: 'go', to: p.slot.use, facing: p.slot.facing, what, pick: p },
  ];
}

/** Use a slot in its pose: walk there and sit, lie or stand. */
function settleAt(p: Pick, what: string): Step[] {
  return [...goTo(p, what), { kind: 'pose', motion: p.slot.motion === 'lie' ? 'lie' : p.slot.motion, facing: p.slot.facing, what }];
}

/** Stand up again (if sitting or lying). */
const standUp: Step = { kind: 'pose', motion: 'stand', facing: null, what: 'getting up' };

/** How far away a pastime is costs this much appeal a metre (across the house, about 4 points); a need, less. */
const PASTIME_PER_METRE = 0.3, NEED_PER_METRE = 0.2;

/**
 * VARIETY: a pastime done in the last 1.5 game hours appeals half as much, in the last 4 hours 80%; done 3 times in
 * the last 12, 70% again. Then a little chance (0.85-1.15), each mind's own dice.
 */
export function variety(c: MindContext, id: ActivityId): number {
  const since = c.memory.hoursSince(id, c.now);
  let v = since < 1.5 ? 0.5 : since < 4 ? 0.8 : 1;
  if (c.memory.timesSince(id, c.now, 12) >= 3) v *= 0.7;
  return v * between(c.rng, 0.85, 1.15);
}

/** How much they like a pastime (profile.ts likes, 1 if not said). */
function like(c: MindContext, id: ActivityId): number {
  return c.profile.likes[id] ?? 1;
}

const t = (c: MindContext, name: Trait): number => trait(c.profile.traits, name);
const pct = (v: number): string => `${Math.round(v * 100)}%`;

// ---- THE ACTIVITIES -------------------------------------------------------------------------------------------------

/** THE TOILET: a free toilet (their own bathroom's first by distance), sit, the visit (the vitals' 5 or 12 s), done. */
const toilet: ActivityDef = {
  id: 'toilet', label: 'Use the toilet', category: 'need',
  evaluate(c) {
    const n = c.needs, lv = c.profile.needs;
    const u = bathroomUrgency(n.bathroom, lv.bathroomFrom, lv.bathroomAt);
    if (u <= 0) return null;
    // (an emergency from 90% full: the vitals' countdown is in REAL seconds, which mean nothing while the clock runs
    //  fast at night, so the bar itself says when)
    const emergency = n.bathroom >= 0.9;
    const pick = pickSlot(c, ['toilet']);
    const why = `bathroom ${pct(n.bathroom)}${n.bathroom >= lv.bathroomAt ? ` ≥ ${pct(lv.bathroomAt)}` : ' (handy)'}${emergency ? ', must go' : ''}`;
    if (!pick) {
      // (every toilet taken: wait by the nearest, unless it is not that pressing)
      const taken = allTaken(c, ['toilet']);
      if (taken && u >= 0.6) return { activity: 'waitTurn', score: 100 * u - 5, reason: `${why}; ${taken.object.name} taken, waiting`, emergency, pick: taken };
      return null;
    }
    return { activity: 'toilet', score: 100 * u - NEED_PER_METRE * pick.metres, reason: why, emergency, pick };
  },
  plan(c, ch) {
    const p = ch.pick!;
    let bowels = false;
    // (the visit's length is the vitals' own, 5 s or 12 s of real time: asked as she sits, `start`)
    const visit: Extract<Step, { kind: 'work' }> = {
      kind: 'work', what: 'on the toilet', realSeconds: 5, restful: 0.6,
      start: (cc) => { const v = cc.body.bathroomVisit(); bowels = v.bowels; visit.realSeconds = v.seconds; },
      end: (cc, finished) => { if (finished) { cc.body.relieve(bowels); cc.memory.day(cc.day).bathroom++; } },
    };
    return [{ kind: 'reserve', pick: p }, ...settleAt(p, `going to the ${p.object.name.toLowerCase()}`), visit, standUp, { kind: 'release' }];
  },
};

/** WAITING FOR A TAKEN TOILET: stand by it until it is free (up to 4 game minutes), then choose again. */
const waitTurn: ActivityDef = {
  id: 'waitTurn', label: 'Wait for the toilet', category: 'wait',
  evaluate() { return null; },   // (offered by `toilet` itself)
  plan(c, ch) {
    const p = ch.pick!;
    return [
      { kind: 'go', to: p.slot.approach, facing: null, what: `waiting for the ${p.object.name.toLowerCase()}` },
      { kind: 'work', what: 'waiting', gameSeconds: 240, restful: 0.4, until: (cc) => !cc.world.holder(p.object.id, p.slot.id) },
    ];
  },
};

/**
 * A MEAL: from the fridge (one of its meals), sometimes cooked on the stove (the food lover more often), eaten sitting
 * (a dining chair; else the sofa or an armchair), until the food bar reaches a target drawn from their range (60-75%,
 * a stress eater's moving toward 75-90%): Joshua, "Select a meal of an appropriate randomized size... Eat until stomach
 * fullness reaches a randomized target... Do not automatically refill stomach fullness to 100% every time."
 */
/**
 * WHICH ITEM THEY TAKE of a kind (mind/food.ts), from a fridge or the pantry: one with some left, the more of it there
 * is the likelier (later, their favourites), of the first of `kinds` with any left; null if none of them is.
 */
function pickItem(c: MindContext, objectId: string, kinds: readonly FoodKind[]): FoodItem | null {
  // (the kinds IN ORDER: the first with any left, then one of that kind by how many are left. At first all of the
  //  kinds were in one draw, so a full meal wanted came out a sandwich two times in three: more, smaller meals)
  const all = c.world.items(objectId).filter((e) => e.count > 0);
  const kind = kinds.find((k) => all.some((e) => e.item.kind === k));
  const left = all.filter((e) => e.item.kind === kind);
  if (!left.length) return null;
  let roll = c.rng() * left.reduce((n, e) => n + e.count, 0);
  for (const e of left) { roll -= e.count; if (roll <= 0) return e.item; }
  return left[left.length - 1].item;
}

/** Where a full meal is eaten (food.ts `atTheTable`): a chair at the table; once the table has let them down, the
 *  sofa or an armchair (Joshua, 2026-11-26: they went from one dining chair to the next and never ate). */
function mealSeat(c: MindContext, from: Vec2, othersOwn = false): Pick | null {
  const tableLetDown = c.world.objects().some((o) => o.type === 'diningChair' && c.memory.avoiding(o.id, c.now));
  return (tableLetDown ? null : pickSlot(c, ['diningChair'], { from, othersOwn })) ?? pickSlot(c, ['sofa', 'armchair'], { from, othersOwn });
}

/**
 * HAVING AN ITEM (v0.2.181; mind/food.ts): to the fridge or pantry, one taken out, then A FULL MEAL eaten sitting at
 * the table (`seat`), ANYTHING ELSE RIGHT THERE STANDING (Joshua: "if over a medium meal will sit at the table,
 * anything else right there standing"). Food at about 45 mL a game minute (a snack in 3 minutes), a glass of water's
 * worth with a meal, a drink at 250 mL a minute. The AI's meals and snacks, and the player's own pick, alike.
 * `targetBar`: the AI stops a meal once their food bar is there (the rest cleared away); the player's pick is had whole.
 */
export function itemPlan(c: MindContext, source: Pick, item: FoodItem, seat: Pick | null, targetBar: number | null, stove: Pick | null = null): Step[] {
  const drinking = item.kind === 'drink', snacking = item.kind === 'snack';
  const steps: Step[] = [];
  if (seat) steps.push({ kind: 'reserve', pick: seat });
  steps.push(
    ...goTo(source, `going to the ${source.object.name.toLowerCase()}`),
    {
      kind: 'do', what: `taking ${anItem(item)}`,
      fn: (cc) => {
        if (!cc.world.takeItem(source.object.id, item.id)) return false;
        // (in their hands until it is begun: a plan that stops before then puts it back where it came from)
        cc.meal.from = source.object.id; cc.meal.item = item.id;
        cc.meal.targetBar = targetBar ?? 2;
        cc.meal.portionMl = drinking ? item.waterMl : item.foodMl;
        cc.meal.eatenMl = 0;
        return true;
      },
    },
    { kind: 'work', what: `getting ${anItem(item)} out`, gameSeconds: 20, restful: 0.4 },
  );
  // (the AI now and then cooks a full meal on the stove first, as before items; nothing needs it)
  if (stove) steps.push(...goTo(stove, 'cooking'), { kind: 'work', what: 'cooking', gameSeconds: between(c.rng, 8, 16) * 60, restful: 0.4, enjoying: 0.3 * t(c, 'foodLover') });
  if (seat) steps.push(...settleAt(seat, 'sitting down to eat'));
  steps.push({
    kind: 'work', what: `${drinking ? 'drinking' : 'eating'} ${anItem(item)}`, prop: drinking ? 'cup' : snacking ? 'snack' : 'plate',
    restful: seat ? 0.65 : 0.4, enjoying: snacking || drinking ? 0.3 : 0.3 + 0.4 * t(c, 'foodLover'),
    each: (cc, gameDt) => {
      // (begun, it is theirs: eaten, or what is left of it cleared away; not put back)
      cc.meal.from = null;
      const rate = drinking ? 250 : snacking ? item.foodMl / 3 : 45;
      const bite = Math.min(cc.meal.portionMl - cc.meal.eatenMl, (rate / 60) * gameDt);
      if (bite <= 0) return;
      const share = bite / Math.max(1, cc.meal.portionMl);
      // (its own water with it, and a meal's glass of water: 8 mL a minute)
      if (drinking) cc.body.consume(0, bite);
      else {
        const water = item.waterMl * share + (snacking ? 0 : (8 / 60) * gameDt);
        cc.body.consume(bite, water);
        cc.memory.day(cc.day).waterWithFoodMl += water;
      }
      cc.meal.eatenMl += bite;
    },
    until: (cc) => cc.meal.eatenMl >= cc.meal.portionMl - 0.5 || (!drinking && cc.needs.food >= cc.meal.targetBar),
    end: (cc, finished) => {
      cc.meal.from = null; cc.meal.item = null;
      const d = cc.memory.day(cc.day);
      if (drinking) { d.drinks++; d.waterMl += cc.meal.eatenMl; return; }
      // (a meal broken off before 100 mL is not counted as one: its food still is)
      if (snacking) d.snacks++;
      else if (cc.meal.eatenMl >= 100) d.meals++;
      d.foodMl += cc.meal.eatenMl;
      if (finished && !snacking && cc.needs.food >= 0.85) d.bigMeals++;
    },
  });
  if (seat) steps.push(standUp, { kind: 'release' });
  return steps;
}

/** "a sandwich", "an apple". */
function anItem(item: FoodItem): string {
  return `${/^[aeiou]/i.test(item.name) ? 'an' : 'a'} ${item.name.toLowerCase()}`;
}

/**
 * A MEAL from the fridge: urgent below their eat level, or near one of their meal times. THE SIZE comes from how much
 * would take their food bar to a target in their range: more than a small meal's 400 mL is a FULL MEAL (pasta, a ready
 * meal), eaten at the table, stopped at their target; less, a SMALL MEAL (a sandwich, a salad), eaten standing at the
 * fridge (Joshua's rule, food.ts).
 */
const eatMeal: ActivityDef = {
  id: 'eatMeal', label: 'Eat a meal', category: 'need',
  evaluate(c) {
    const bar = c.needs.food, lv = c.levels;
    let u = foodUrgency(bar, lv.eatBelow);
    // (within 45 game minutes of one of their meal times, a meal appeals if they could eat and have not eaten one in
    //  the last 2.5 game hours -- the disciplined keep to it more -- but not enough to break off what they are doing:
    //  under `NEED_INTERRUPTS_FROM`, so lunch waits for the end of a film)
    const nearMeal = c.profile.habits.meals.some((h) => Math.abs(((((c.hour - h) % 24) + 36) % 24) - 12) <= 0.75)
      && c.memory.hoursSince('eatMeal', c.now) > 2.5;
    if (nearMeal && bar < lv.eatBelow + 0.25) u = Math.max(u, 0.38 + 0.14 * t(c, 'disciplined'));
    if (u <= 0) return null;
    const fridge = pickSlot(c, ['fridge'], { stock: 'meals' });
    if (!fridge) return null;
    // (how much they want: to the middle of their target range)
    const [lo, hi] = lv.mealTarget;
    const want = c.body.foodMlForBar((lo + hi) / 2) - c.body.stomachFoodMl();
    const item = pickItem(c, fridge.object.id, want >= FULL_MEAL_FROM ? ['fullMeal', 'smallMeal'] : ['smallMeal', 'fullMeal']) ;
    if (!item) return null;
    // (a full meal at the table; with no seat free, standing at the fridge after all)
    const seat = atTheTable(item) ? mealSeat(c, fridge.slot.use) : null;
    const why = `food ${pct(bar)}${bar < lv.eatBelow ? ` < ${pct(lv.eatBelow)}` : nearMeal ? ' (meal time)' : ''}${lv.stressEating > 0.15 ? ' (stressed)' : ''}`;
    return { activity: 'eatMeal', score: 100 * u * (1 + 0.15 * t(c, 'foodLover')) * nightDamp(c) - NEED_PER_METRE * (fridge.metres + (seat?.metres ?? 0)), reason: `${why}: ${item.name.toLowerCase()}`, pick: seat ?? fridge, via: fridge, item };
  },
  plan(c, ch) {
    const fridge = ch.via!, item = ch.item!;
    const seat = ch.pick && ch.pick.object.id !== fridge.object.id ? ch.pick : null;
    // (their target: the meal is stopped there; the rest cleared away. A full meal is cooked now and then)
    const [lo, hi] = c.levels.mealTarget;
    const cooks = !!seat && c.rng() < 0.25 + 0.4 * t(c, 'foodLover');
    const stove = cooks ? pickSlot(c, ['stove'], { from: fridge.slot.use }) : null;
    return itemPlan(c, fridge, item, seat, between(c.rng, lo, hi), stove);
  },
};

/** A meal they would need more food than this for (mL) is a full one, at the table (more than a small meal's 400:
 *  the AI stops eating at its target, so a full meal is never too much); this or less, a small one, standing. */
const FULL_MEAL_FROM = 420;

/**
 * A SNACK from the cabinet, between meals: a little appeal below their snack level, more for a stress eater (Joshua's
 * "Snacking: occasional | more frequent"), eaten standing there.
 */
/** A snack's appeal before stress eating doubles it (and a wish for something different damps it). */
const SNACK_APPEAL = 28;

const snack: ActivityDef = {
  id: 'snack', label: 'Have a snack', category: 'need',
  evaluate(c) {
    const bar = c.needs.food, lv = c.levels;
    if (bar >= lv.snackBelow || bar < lv.eatBelow - 0.05) return null;
    // (the pantry, or the fridge's fruit and cheese)
    const cab = pickSlot(c, ['cabinet', 'fridge'], { stock: 'snacks' });
    if (!cab) return null;
    const item = pickItem(c, cab.object.id, ['snack']);
    if (!item) return null;
    // (a stress eater GRAZES (Joshua's table: snacks x2): stressed, the wish for something different hardly damps it, and
    //  at its fullest, 28 x 2 = 56, it can break off a quiet pastime as a need does (mind.ts NEED_INTERRUPTS_FROM 55).
    //  At 26 with the usual damping, measured on the game's walls, she snacked no more stressed than not: 7 -> 6)
    const tiring = variety(c, 'snack') + (1 - variety(c, 'snack')) * lv.stressEating;
    const score = SNACK_APPEAL * lv.snackMore * tiring * nightDamp(c) - PASTIME_PER_METRE * cab.metres * 0.5;
    return { activity: 'snack', score, reason: `food ${pct(bar)} < ${pct(lv.snackBelow)}${lv.snackMore > 1.15 ? ' (stress snacking)' : ''}: ${item.name.toLowerCase()}`, pick: cab, item };
  },
  // (eaten right there, standing: food.ts)
  plan(c, ch) { return itemPlan(c, ch.pick!, ch.item!, null, null); },
};

/**
 * THE PLAYER'S OWN PICK from the fridge's or the pantry's panel (mind/interact.ts, main.ts): never chosen by the AI;
 * had whole, a full meal at the table, anything else standing there (`itemPlan`).
 */
const eatItem: ActivityDef = {
  id: 'eatItem', label: 'Have something', category: 'need',
  evaluate() { return null; },
  plan(c, ch) {
    const source = ch.via!, item = ch.item!;
    const seat = ch.pick && ch.pick.object.id !== source.object.id ? ch.pick : null;
    return itemPlan(c, source, item, seat, null);
  },
};

/** A DRINK of water at a sink (the kitchen's, or a bathroom's if nearer), until the water bar is in their target range. */
const drink: ActivityDef = {
  id: 'drink', label: 'Get a drink', category: 'need',
  evaluate(c) {
    const bar = c.needs.water, lv = c.profile.needs;
    const u = waterUrgency(bar, lv.drinkBelow);
    if (u <= 0) return null;
    const sink = pickSlot(c, ['sink']);
    if (!sink) return null;
    return { activity: 'drink', score: 100 * u * (bar < 0.2 ? 1 : nightDamp(c)) - NEED_PER_METRE * sink.metres, reason: `water ${pct(bar)}${bar < lv.drinkBelow ? ` < ${pct(lv.drinkBelow)}` : ''}`, emergency: bar < 0.08, pick: sink };
  },
  plan(c, ch) {
    const sink = ch.pick!, [lo, hi] = c.profile.needs.drinkTarget;
    const target = between(c.rng, lo, hi);
    let drunk = 0;
    const most = Math.min(700, Math.max(200, c.body.waterMlForBar(target)));
    return [
      ...goTo(sink, `going to the ${sink.object.name.toLowerCase()}`),
      {
        kind: 'work', what: 'drinking', prop: 'cup', restful: 0.4,
        // (a glass about every game minute: 250 mL)
        each: (cc, gameDt) => { const sip = Math.min(most - drunk, (250 / 60) * gameDt); if (sip > 0) { cc.body.consume(0, sip); drunk += sip; } },
        // (asked for by the player: a glass at least, thirsty or not)
        until: (cc) => drunk >= most - 0.5 || (cc.needs.water >= target && (!ch.asked || drunk >= 250)),
        end: (cc) => { const d = cc.memory.day(cc.day); d.drinks++; d.waterMl += drunk; },
      },
    ];
  },
};

/**
 * SLEEP: in their own side of the bed (else a free guest bed, else the sofa), from their bedtime (the disciplined keep
 * to it), or whenever their energy is spent (an emergency below `collapseBelow`). They wake rested near their waking
 * time, or past it, or for an emergency (the bathroom in the night), and go back to bed after if it is still night.
 */
const sleep: ActivityDef = {
  id: 'sleep', label: 'Sleep', category: 'need',
  evaluate(c) {
    const n = c.needs, lv = c.profile.needs, h = c.profile.habits;
    // (their night for going to bed ends half an hour before their waking time, where waking begins: `until` below)
    const night = inNight(c.hour, h.bedtime, h.wake - 0.5);
    let u = 0, why = '';
    if (n.energy < lv.collapseBelow) { u = 1; why = `energy ${pct(n.energy)} < ${pct(lv.collapseBelow)}: exhausted`; }
    else if (night) {
      u = Math.min(1, 0.45 + 0.35 * t(c, 'disciplined') + Math.max(0, 0.6 - n.energy) * 1.2);
      why = `bedtime (${clock(h.bedtime)}), energy ${pct(n.energy)}`;
    } else if (n.energy < lv.sleepBelow && n.sleepiness > 0.5) {
      u = 0.5 + (lv.sleepBelow - n.energy) * 1.5;
      why = `energy ${pct(n.energy)} < ${pct(lv.sleepBelow)}`;
    }
    if (u <= 0) return null;
    const bed = pickSlot(c, ['bed']) ?? pickSlot(c, ['sofa']);
    if (!bed) return null;
    return { activity: 'sleep', score: 100 * u, reason: why + (bed.object.type === 'sofa' ? ', no bed free: the sofa' : bed.slot.owner === c.id ? ', own bed' : ''), emergency: n.energy < lv.collapseBelow, pick: bed };
  },
  plan(c, ch) {
    const bed = ch.pick!, h = c.profile.habits;
    let slept = 0;
    return [
      { kind: 'reserve', pick: bed },
      ...goTo(bed, bed.object.type === 'sofa' ? 'going to the sofa to sleep' : 'going to bed'),
      { kind: 'pose', motion: bed.object.type === 'sofa' ? 'doze' : 'lie', facing: bed.slot.facing, what: 'lying down' },
      {
        kind: 'work', what: 'asleep', asleep: true, restful: 0.9,
        each: (_cc, gameDt) => { slept += gameDt; },
        // (awake: rested once it is near or past their waking time; past it by 1.5 h, up anyway; a daytime sleep
        //  once the worst of it is gone)
        until: (cc) => {
          const n = cc.needs, night = inNight(cc.hour, h.bedtime, h.wake - 0.5);
          if (!night && n.sleepiness <= 0.2 && slept > 1800 && inNight(cc.hour, h.wake + 2, h.bedtime - 1)) return true;
          const awakeWindow = (((cc.hour - (h.wake - 0.5)) % 24) + 24) % 24 < 12;
          return awakeWindow && (n.sleepiness <= 0.04 || (((cc.hour - (h.wake + 1.5)) % 24) + 24) % 24 < 10);
        },
      },
      standUp,
      { kind: 'release' },
    ];
  },
};

/** A NAP on the sofa by day, when very sleepy (sleepiness past 55%, energy under 45%): 20-40 game minutes asleep. */
const nap: ActivityDef = {
  id: 'nap', label: 'Nap on the sofa', category: 'rest',
  evaluate(c) {
    const n = c.needs, h = c.profile.habits;
    if (inNight(c.hour, h.bedtime, h.wake) || n.sleepiness < 0.55 || n.energy > 0.45) return null;
    const seat = pickSlot(c, ['sofa']);
    if (!seat) return null;
    return { activity: 'nap', score: (35 + 60 * (n.sleepiness - 0.55)) * variety(c, 'nap') - PASTIME_PER_METRE * seat.metres, reason: `sleepy ${pct(n.sleepiness)}, energy ${pct(n.energy)}`, pick: seat };
  },
  plan(c, ch) {
    const seat = ch.pick!;
    return [
      { kind: 'reserve', pick: seat }, ...goTo(seat, 'going for a nap'),
      { kind: 'pose', motion: 'doze', facing: seat.slot.facing, what: 'settling in' },
      { kind: 'work', what: 'napping', asleep: true, restful: 0.85, gameSeconds: between(c.rng, 20, 40) * 60 },
      standUp, { kind: 'release' },
    ];
  },
};

/** A SIT-DOWN when tired (fatigue, low stamina, low energy by day): a seat for 15-30 game minutes. */
const rest: ActivityDef = {
  id: 'rest', label: 'Sit and rest', category: 'rest',
  evaluate(c) {
    const n = c.needs, lv = c.profile.needs;
    const u = Math.max(n.fatigue >= 0.12 ? 0.25 + n.fatigue : 0, n.stamina < 0.3 ? 0.5 : 0, n.energy < lv.restBelow ? 0.3 + (lv.restBelow - n.energy) : 0);
    if (u <= 0) return null;
    const seat = pickSlot(c, ['sofa', 'armchair', 'diningChair', 'deskChair']);
    if (!seat) return null;
    return { activity: 'rest', score: 60 * u * variety(c, 'rest') - PASTIME_PER_METRE * seat.metres * 0.5, reason: `tired: fatigue ${pct(n.fatigue)}, energy ${pct(n.energy)}`, pick: seat };
  },
  plan(c, ch) {
    const seat = ch.pick!;
    return [{ kind: 'reserve', pick: seat }, ...settleAt(seat, 'going to sit down'), { kind: 'work', what: 'resting', restful: 0.75, gameSeconds: between(c.rng, 15, 30) * 60 }, standUp, { kind: 'release' }];
  },
};

/** WASHING UP at a bathroom sink after waking and before bed (the neat, more): 3-5 game minutes. */
const washUp: ActivityDef = {
  id: 'washUp', label: 'Wash up', category: 'rest',
  evaluate(c) {
    const h = c.profile.habits, since = c.memory.hoursSince('washUp', c.now);
    const morning = (((c.hour - h.wake) % 24) + 24) % 24 < 1.5 && c.memory.hoursSince('sleep', c.now) < 2;
    const evening = (((h.bedtime - c.hour) % 24) + 24) % 24 < 1;
    if (!(morning || evening) || since < 3) return null;
    const sink = pickSlot(c, ['sink'], { filter: (o) => o.room !== 'kitchen' });
    if (!sink) return null;
    return { activity: 'washUp', score: 30 * (0.6 + 0.6 * t(c, 'neat')) - PASTIME_PER_METRE * sink.metres * 0.5, reason: morning ? 'morning wash' : 'washing up before bed', pick: sink };
  },
  plan(c, ch) {
    const sink = ch.pick!;
    return [...goTo(sink, 'going to wash up'), { kind: 'work', what: 'washing up', gameSeconds: between(c.rng, 3, 5) * 60, restful: 0.4 }];
  },
};

/** A pastime at a seat: watch the screen, or read. */
function seatedPastime(id: 'watchScreen' | 'read', label: string, base: (c: MindContext) => number, types: readonly ObjectType[], what: string, minutes: [number, number], extra: { prop?: Prop; tag?: string } = {}): ActivityDef {
  return {
    id, label, category: 'fun',
    evaluate(c) {
      const seat = pickSlot(c, types, { filter: (o) => !extra.tag || !!o.tags?.includes(extra.tag) });
      if (!seat) return null;
      const score = base(c) * like(c, id) * variety(c, id) - PASTIME_PER_METRE * seat.metres;
      return { activity: id, score, reason: label.toLowerCase(), pick: seat };
    },
    plan(c, ch) {
      const seat = ch.pick!;
      const screen = id === 'watchScreen' ? c.world.objects().find((o) => o.type === 'screen' && o.room === seat.object.room) : undefined;
      return [
        { kind: 'reserve', pick: seat }, ...settleAt(seat, `going to ${label.toLowerCase()}`),
        { kind: 'work', what, gameSeconds: between(c.rng, minutes[0], minutes[1]) * 60, restful: 0.72, enjoying: 0.6, ...(extra.prop ? { prop: extra.prop } : {}), ...(screen ? { look: screen.at } : {}) },
        standUp, { kind: 'release' },
      ];
    },
  };
}

const watchScreen = seatedPastime('watchScreen', 'Watch the screen', (c) => 24 * (c.hour >= 19 || c.hour < 1 ? 1.35 : 1) * (1 + 0.3 * (1 - c.needs.energy)), ['sofa', 'armchair'], 'watching the screen', [30, 80], { tag: 'faces-screen' });
const read = seatedPastime('read', 'Read', (c) => 18 * (1 + 0.6 * t(c, 'curious')), ['armchair', 'sofa', 'deskChair'], 'reading', [20, 55], { prop: 'book' });

/** LOOKING OUT OF A WINDOW for a few game minutes (the curious and adventurous, more). */
const lookOutside: ActivityDef = {
  id: 'lookOutside', label: 'Look outside', category: 'fun',
  evaluate(c) {
    const w = pickSlot(c, ['window']);
    if (!w) return null;
    return { activity: 'lookOutside', score: 11 * (1 + 0.5 * t(c, 'curious') + 0.4 * t(c, 'adventurous')) * like(c, 'lookOutside') * variety(c, 'lookOutside') - PASTIME_PER_METRE * w.metres * 0.5, reason: 'look outside', pick: w };
  },
  plan(c, ch) {
    const w = ch.pick!;
    return [...goTo(w, 'going to the window'), { kind: 'work', what: 'looking outside', gameSeconds: between(c.rng, 2, 5) * 60, restful: 0.45, enjoying: 0.35 }];
  },
};

/** WANDERING to another room and looking about (the active, and the restless: a stressed stress eater). */
const wander: ActivityDef = {
  id: 'wander', label: 'Wander', category: 'fun',
  evaluate(c) {
    const here = c.world.roomAt(c.body.position());
    const rooms = c.world.rooms().filter((r) => r.id !== here && c.world.standSpots(r.id).length);
    if (!rooms.length) return null;
    const room = rooms[Math.floor(c.rng() * rooms.length)];
    const spots = c.world.standSpots(room.id), spot = spots[Math.floor(c.rng() * spots.length)];
    const metres = c.world.travel(c.body.position(), spot);
    if (metres === null) return null;
    return { activity: 'wander', score: 8 * (1 + 0.6 * t(c, 'active')) * c.levels.restless * variety(c, 'wander') - 0.15 * metres, reason: `wander to the ${room.name.toLowerCase()}${c.levels.restless > 1.15 ? ' (restless)' : ''}`, spot };
  },
  plan(c, ch) {
    return [{ kind: 'go', to: ch.spot!, facing: null, what: 'wandering' }, { kind: 'work', what: 'looking around', gameSeconds: between(c.rng, 1, 2.5) * 60, restful: 0.4, enjoying: 0.2 }];
  },
};

/** EXERCISE on the open floor: not on a full stomach, nor tired; 15-30 game minutes of work like a jog (the active, more). */
const exercise: ActivityDef = {
  id: 'exercise', label: 'Exercise', category: 'fun',
  evaluate(c) {
    const n = c.needs;
    if (n.food > 0.75 || n.energy < 0.45 || n.fatigue > 0.15 || c.memory.hoursSince('eatMeal', c.now) < 1) return null;
    const mat = pickSlot(c, ['floorSpot'], { filter: (o) => !!o.tags?.includes('exercise') });
    if (!mat) return null;
    const since = c.memory.hoursSince('exercise', c.now);
    return { activity: 'exercise', score: 14 * (1 + t(c, 'active')) * like(c, 'exercise') * (since < 8 ? 0.2 : 1) * variety(c, 'exercise') - PASTIME_PER_METRE * mat.metres * 0.5, reason: 'exercise', pick: mat };
  },
  plan(c, ch) {
    const mat = ch.pick!;
    return [
      { kind: 'reserve', pick: mat }, ...goTo(mat, 'going to exercise'),
      { kind: 'work', what: 'exercising', gameSeconds: between(c.rng, 15, 30) * 60, restful: 0.3, enjoying: 0.5, start: (cc) => cc.body.exert(0.5), end: (cc) => cc.body.exert(0) },
      { kind: 'release' },
    ];
  },
};

/** TIDYING: a few things in one room (a counter, a wardrobe, a desk), a few game minutes each (the neat, more). */
const tidy: ActivityDef = {
  id: 'tidy', label: 'Tidy up', category: 'fun',
  evaluate(c) {
    const spot = pickSlot(c, ['counter', 'wardrobe', 'desk', 'diningTable']);
    if (!spot) return null;
    return { activity: 'tidy', score: 10 * (1 + t(c, 'neat')) * like(c, 'tidy') * variety(c, 'tidy') - PASTIME_PER_METRE * spot.metres * 0.5, reason: 'tidy up', pick: spot };
  },
  plan(c, ch) {
    const first = ch.pick!;
    const more = c.world.objects().filter((o) => o.room === first.object.room && o.id !== first.object.id && ['counter', 'wardrobe', 'desk', 'diningTable', 'sink', 'stove'].includes(o.type));
    const steps: Step[] = [...goTo(first, 'tidying'), { kind: 'work', what: 'tidying', gameSeconds: between(c.rng, 2, 4) * 60, restful: 0.35 }];
    const second = more[Math.floor(c.rng() * more.length)];
    if (second) steps.push(...goTo({ object: second, slot: second.slots[0], metres: 0 }, 'tidying'), { kind: 'work', what: 'tidying', gameSeconds: between(c.rng, 2, 4) * 60, restful: 0.35 });
    return steps;
  },
};

/** STANDING A MOMENT where they are, looking about: always there, a little appeal (Joshua: "still occasionally stand idle naturally"). */
const idle: ActivityDef = {
  id: 'idle', label: 'Stand a moment', category: 'idle',
  evaluate(c) {
    return { activity: 'idle', score: 5 * between(c.rng, 0.7, 1.3), reason: 'nothing pressing' };
  },
  plan(c) {
    return [{ kind: 'work', what: 'standing', gameSeconds: between(c.rng, 1, 3) * 60, restful: 0.45 }];
  },
};

/**
 * A CHAT with whoever is home (their partner most of all): asked first, and they come if they are free (society.ts);
 * the one played is talked to where they stand. Loneliness, the social and the affectionate make it appeal.
 */
/** How far apart two people stand to talk, metres. */
const TALK_APART = 1.0;

const talk: ActivityDef = {
  id: 'talk', label: 'Talk', category: 'social',
  evaluate(c) {
    if (c.memory.hoursSince('talk', c.now) < 2) return null;
    let best: Choice | null = null;
    for (const o of c.others) {
      if (o.asleep || o.busy || c.memory.avoiding(`talk:${o.id}`, c.now)) continue;
      const metres = c.world.travel(c.body.position(), o.position);
      if (metres === null) continue;
      const partner = o.id === c.profile.partnerId;
      const score = (12 + 45 * c.feel.loneliness + 12 * t(c, 'social') + (partner ? 12 * t(c, 'affectionate') : 0)) * like(c, 'talk') * variety(c, 'talk') - 0.4 * metres;
      if (!best || score > best.score) best = { activity: 'talk', score, reason: `talk with ${o.name.split(' ')[0]} (lonely ${pct(c.feel.loneliness)})`, with: o.id, spot: o.position };
    }
    return best;
  },
  plan(c, ch) {
    const other = c.others.find((o) => o.id === ch.with);
    if (!other) return [];
    // (meet: they stand a metre apart; I go up to them, they turn to me. I walk TO them and stop a metre off, the walking
    //  way: a spot worked out a metre from them toward me could be inside the sofa they sit on, or through a wall, and
    //  the walk there never arrived: in the household simulation on the game's walls, 2-4 talks a day failed so)
    const me = c.body.position(), dx = me.x - other.position.x, dz = me.z - other.position.z, d = Math.hypot(dx, dz) || 1;
    const meetMe = { x: other.position.x + (dx / d) * TALK_APART, z: other.position.z + (dz / d) * TALK_APART };
    const minutes = between(c.rng, 10, 25);
    return [
      {
        kind: 'do', what: `asking ${other.name.split(' ')[0]} to talk`,
        fn: (cc) => {
          if (cc.invite(other.id, meetMe, other.position, minutes)) return true;
          cc.memory.failed(`talk:${other.id}`, cc.now);
          return false;
        },
      },
      { kind: 'go', to: { ...other.position }, facing: null, within: TALK_APART, what: `going to talk with ${other.name.split(' ')[0]}` },
      { kind: 'work', what: `talking with ${other.name.split(' ')[0]}`, gameSeconds: minutes * 60, restful: 0.5, enjoying: 0.7, look: other.position, until: (cc) => !cc.stillTalkingWith(other.id) },
    ];
  },
};

/** COMPANION MODE: stay near the one being played (a step behind, never in their way). */
const follow: ActivityDef = {
  id: 'follow', label: 'Stay close', category: 'follow',
  evaluate(c) {
    if (!c.companion || !c.leader) return null;
    const me = c.body.position(), l = c.leader.position, d = Math.hypot(me.x - l.x, me.z - l.z);
    // (62 when they are more than 3 m off: over any pastime, and only a need from 86 -- a need well under way --
    //  breaks it off; beside them, 30: a pastime near them, or staying with them)
    return { activity: 'follow', score: d > 3 ? 62 : 30, reason: `with ${c.leader.name.split(' ')[0]} (${d.toFixed(1)} m)`, spot: l, with: c.leader.id };
  },
  plan() {
    // (re-aimed every frame at the one played, stopping 1.6 m short of them the walking way; for half a game hour, then
    //  chosen again)
    return [{
      kind: 'work', what: 'staying close', gameSeconds: 30 * 60, restful: 0.45,
      each: (cc) => {
        const l = cc.leader?.position;
        if (!l) return;
        const me = cc.body.position(), d = Math.hypot(me.x - l.x, me.z - l.z);
        if (d > 2.2) cc.body.goTo(l, null, 1.6);
        else cc.body.stopMoving();
        cc.body.lookAt(l);
      },
      until: (cc) => !cc.leader || !cc.companion,
    }];
  },
};

/** Every activity, in the order they are listed in the debug panel. */
/** Each activity in a word or two, for the thought bubble's scores line ("meal 99 · drink 60 · TV 22"). */
export const ACTIVITY_SHORT: Readonly<Record<ActivityId, string>> = {
  toilet: 'toilet', waitTurn: 'wait', eatMeal: 'meal', snack: 'snack', drink: 'drink', sleep: 'sleep', nap: 'nap',
  rest: 'rest', washUp: 'wash', watchScreen: 'TV', read: 'read', lookOutside: 'window', wander: 'wander',
  exercise: 'exercise', tidy: 'tidy', idle: 'idle', talk: 'talk', follow: 'follow', eatItem: 'eat',
};

export const ACTIVITIES: readonly ActivityDef[] = [toilet, eatMeal, snack, drink, sleep, nap, rest, washUp, watchScreen, read, lookOutside, wander, exercise, tidy, idle, talk, follow, waitTurn, eatItem];
export const ACTIVITY_BY_ID: Readonly<Record<ActivityId, ActivityDef>> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a])) as Record<ActivityId, ActivityDef>;

/** "22:30" for an hour of the day. */
function clock(hour: number): string {
  const m = Math.round((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
