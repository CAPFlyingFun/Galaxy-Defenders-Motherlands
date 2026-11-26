// ============================================================================
// mind/types.ts -- THE MIND'S WORDS: places, time, needs, the things in a home and how they are used.
//
// The mind (src/mind/) is PLAIN TYPESCRIPT: no three.js, no page, no body geometry, nothing of the game imported
// (Joshua, 2026-11-26: "Keep the brain independent of Three.js and live character geometry so it can eventually
// support many NPCs and be reused in CCBS and my other games"). Everything it knows of the world comes through these
// plain types, and everything it does goes through the two doors in world.ts: a MindWorld (the home and the others)
// and a MindBody (one character's body). The game fills them in (src/world/home/), and so does the headless
// household simulation (scripts/sim_household.ts).
//
// Units: metres on the ground (x east, z north: the game's own, Y up is not needed here), compass yaw in radians
// (0 faces +z, as the game's `Math.atan2(dx, dz)`), game time in game seconds and game hours.
// ============================================================================

/** A spot on the ground, metres. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** Who a character is: 'mary', 'john'. */
export type ActorId = string;

/**
 * WHO DRIVES A CHARACTER (Joshua's brief, section 10):
 *   manual      the player: the mind only watches (its needs, feelings and memory go on), it plans nothing;
 *   autonomous  the mind runs their life;
 *   companion   the mind keeps their needs, and otherwise stays near the one played;
 *   scripted    the story drives them; the mind plans nothing but keeps watching, as in manual.
 */
export type ControlMode = 'manual' | 'autonomous' | 'companion' | 'scripted';

/** The game clock as the mind needs it (core/gameClock.ts): the day, the hour 0..24, and seconds since day 1 began. */
export interface GameTime {
  readonly day: number;
  readonly hour: number;
  readonly seconds: number;
}

/**
 * A CHARACTER'S NEEDS as the mind reads them, from their vitals (the game's own, src/vitals/heroineVitals.ts, turned
 * into these plain numbers by src/world/home/mindBridge.ts). Bars are 0 empty .. 1 full, as on the vitals card.
 */
export interface NeedsSnapshot {
  /** the food bar: food in her stomach (half is her normal 450 mL, full 1.5 L) */
  readonly food: number;
  /** the water bar: her water balance (half is balanced) */
  readonly water: number;
  /** energy 0 exhausted .. 1 rested: 1 less sleepiness and fatigue */
  readonly energy: number;
  /** sleepiness 0..1: game hours awake build it, only sleep takes it away */
  readonly sleepiness: number;
  /** fatigue 0..1: work builds it, rest takes it away */
  readonly fatigue: number;
  /** stamina now, a share of what her energy allows (1: all of it) */
  readonly stamina: number;
  /** the bathroom bar: her bladder or bowels, whichever is fuller (0..1) */
  readonly bathroom: number;
  /** her need to go: 0 none, 1 the urge, 2 strong */
  readonly bathroomUrge: 0 | 1 | 2;
  /** real seconds until she cannot hold it (from 85% full), null when not counting */
  readonly bathroomEta: number | null;
  /** health 0..1 */
  readonly health: number;
  /** mood 0..1 (her needs, the vitals' own) */
  readonly mood: number;
  /** fear 0..1 (danger) */
  readonly fear: number;
  /** asleep now (the body's) */
  readonly asleep: boolean;
}

/**
 * EVERYTHING A CHARACTER CAN CHOOSE TO DO (mind/activities.ts has what each one is):
 *   needs      toilet, eatMeal, snack, drink, sleep, nap, rest (sit down a while), washUp (a sink, morning and night)
 *   pastimes   watchScreen, read, lookOutside, wander, exercise, tidy, idle (stand a moment)
 *   others     talk (with whoever is home), follow (companion mode)
 *   waiting    waitTurn (by a thing someone else is using)
 */
export type ActivityId =
  | 'toilet' | 'eatMeal' | 'snack' | 'drink' | 'sleep' | 'nap' | 'rest' | 'washUp'
  | 'watchScreen' | 'read' | 'lookOutside' | 'wander' | 'exercise' | 'tidy' | 'idle'
  | 'talk' | 'follow' | 'waitTurn';

/** HOW A BODY IS POSED to use something: standing at it, sitting on it, lying in it, or sleeping sitting up (CCBS's doze). */
export type Motion = 'stand' | 'sit' | 'lie' | 'doze';

/** THE KINDS OF THING IN A HOME. */
export type ObjectType =
  | 'bed' | 'toilet' | 'shower' | 'sink' | 'fridge' | 'stove' | 'cabinet' | 'counter'
  | 'diningTable' | 'diningChair' | 'sofa' | 'armchair' | 'screen' | 'desk' | 'deskChair' | 'wardrobe'
  | 'window' | 'floorSpot';

/** What a resource in a thing is counted in: meals in the fridge, drinks, snacks in the cabinet. */
export type StockKind = 'meals' | 'drinks' | 'snacks';

/**
 * ONE PLACE TO USE A THING (Joshua's brief, section 4, "Every interactive object should support appropriate
 * metadata"): a double bed has two (one each side), a sofa three seats, a toilet one.
 */
export interface ObjectSlot {
  /** its name within the thing: 'west', 'seat-2' */
  readonly id: string;
  /** WHERE THE BODY STANDS to start using it (for a seat: just in front of it, facing away, ready to sit back) */
  readonly use: Vec2;
  /** the way the body faces while using it, compass yaw (0 faces +z) */
  readonly facing: number;
  /** where to walk to first, and where to step back to when done (the entry and exit) */
  readonly approach: Vec2;
  /** the pose it is used in */
  readonly motion: Motion;
  /** whose it is (their side of the bed), if anyone's: others use it only when nothing else will do */
  readonly owner?: ActorId;
}

/** A THING IN A HOME and everything the mind needs to know to use it. */
export interface SmartObject {
  readonly id: string;
  readonly type: ObjectType;
  /** for people: "Fridge", "Sofa" */
  readonly name: string;
  /** the room it stands in */
  readonly room: string;
  /** its middle on the floor */
  readonly at: Vec2;
  /** the way its front faces, compass yaw */
  readonly facing: number;
  /** its size on the floor, metres (width across its front, depth front to back): it blocks walking (later, the nav grid) */
  readonly size: { readonly w: number; readonly d: number };
  /** the places it can be used from (at least one) */
  readonly slots: readonly ObjectSlot[];
  /** what it holds, at the start (the home's runtime counts it down: world.ts) */
  readonly stock?: Partial<Record<StockKind, number>>;
  /** free words for the mind: 'faces-screen', 'quiet' */
  readonly tags?: readonly string[];
}
