// ============================================================================
// mind/world.ts -- THE MIND'S TWO DOORS: the world it lives in (a home, its things, the way round it) and the body it
// drives. Both are interfaces only: the game fills them in with its own home and bodies (src/world/home/homeWorld.ts,
// later the characters' kits in main.ts), and the headless household simulation with its own simple bodies
// (scripts/sim_household.ts). So the mind runs the same in the game, in a test, in CCBS or in another game.
// ============================================================================
import type { ActorId, Motion, SmartObject, StockKind, Vec2 } from './types';

/** A home and its things, as one mind may use them. */
export interface MindWorld {
  /** which home this is (a character keeps to their own: profile.ts `homeId`) */
  readonly homeId: string;
  /** every thing in it */
  objects(): readonly SmartObject[];
  object(id: string): SmartObject | undefined;
  /** metres along the way from one spot to another, or null if there is no way (a blocked door) */
  travel(from: Vec2, to: Vec2): number | null;
  /** the room a spot is in, or null */
  roomAt(p: Vec2): string | null;
  /** who holds a thing's slot now, or null if it is free */
  holder(objectId: string, slotId: string): ActorId | null;
  /** take a thing's slot for oneself: false if someone else has it */
  reserve(objectId: string, slotId: string, by: ActorId): boolean;
  /** let go of everything one holds (or only of one thing) */
  release(by: ActorId, objectId?: string): void;
  /** how much of a resource a thing has left (meals in the fridge) */
  stock(objectId: string, kind: StockKind): number;
  /** take some: false if there is not enough */
  take(objectId: string, kind: StockKind, count?: number): boolean;
  /** put some back (a meal taken out and not eaten: the plan failed on the way to the table) */
  putBack(objectId: string, kind: StockKind, count?: number): void;
  /** a few spots to stand about in a room (wandering, a chat) */
  standSpots(room: string): readonly Vec2[];
  /** every room's id and name */
  rooms(): readonly { readonly id: string; readonly name: string }[];
}

/** Something in the hand while doing a thing. */
export type Prop = 'plate' | 'cup' | 'snack' | 'book';

/** What a walk is doing: still going, there, or unable to get there. */
export type MoveStatus = 'moving' | 'arrived' | 'blocked';

/**
 * ONE CHARACTER'S BODY, as the mind drives it. Every call is a wish for this frame; the body does it with the game's own
 * systems (its walk, the sit-down and stand-up, its vitals), at its own real-time pace, and says how it is going.
 */
export interface MindBody {
  readonly id: ActorId;
  /** where they stand now */
  position(): Vec2;
  /** the pose they are in now (or getting into) */
  motion(): Motion;
  /**
   * walk toward `to` (round the home's walls), and face `facing` (compass yaw) once there; call again each frame.
   * `within`: a person or a place to come NEAR, not onto (a talk, staying with someone): 'arrived' once this many
   * metres from it the walking way (not through a wall), turned to face it.
   */
  goTo(to: Vec2, facing: number | null, within?: number): MoveStatus;
  stopMoving(): void;
  /** take a pose where they stand (sit back onto what is behind them, lie down, stand up); 'ready' once in it */
  pose(motion: Motion, facing: number | null): 'changing' | 'ready';
  /** eat and drink, millilitres, now */
  consume(foodMl: number, waterMl: number): void;
  /** a bathroom visit: how long it takes (real seconds) and whether it is their bowels too (their vitals say) */
  bathroomVisit(): { seconds: number; bowels: boolean };
  /** the visit done: emptied */
  relieve(bowels: boolean): void;
  /** asleep or awake, and how well they sleep (0..1) */
  sleep(asleep: boolean, quality: number): void;
  /** working in place (exercise), a workload 0..1 their vitals feel as if walking or jogging; 0 to stop */
  exert(workload: number): void;
  /** something in the hand, or nothing */
  hold(prop: Prop | null): void;
  /** look at a spot (someone's face, the screen), or let go (null) */
  lookAt(p: Vec2 | null): void;
  /** millilitres of food in the stomach that would make the food bar read `bar` (for sizing a meal) */
  foodMlForBar(bar: number): number;
  /** millilitres of water that would bring the water bar from where it is to `bar` (for sizing a drink) */
  waterMlForBar(bar: number): number;
  /** millilitres of food in the stomach now */
  stomachFoodMl(): number;
}
