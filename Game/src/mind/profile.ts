// ============================================================================
// mind/profile.ts -- WHO A CHARACTER IS, to their mind: personality, the levels at which each need moves them and how
// far they see it through, their daily habits, what they like doing, and (for some) how stress changes their eating.
//
// Joshua's brief, sections 2, 5, 7 and 8: character-specific brain profiles, configurable thresholds, personality traits
// "that influence activity priorities, preferences and thresholds", and a stress-eating trait that is "configurable and
// specific to Mary rather than universal behavior". A profile is PLAIN DATA (JSON-able): it can be saved with a
// character, and later live in CCBS with the character's body, lungs and heart.
//
// Every number is a share of the vitals card's bars (0 empty .. 1 full) unless it says otherwise.
// ============================================================================
import type { ActivityId, ActorId } from './types';
import type { Traits } from './traits';

/** When each need moves them, and how far they take it. */
export interface NeedLevels {
  /** they go to eat below this on the food bar (Joshua's table: 30%) */
  readonly eatBelow: number;
  /** a meal ends at a random point between these on the food bar (his: 60-75%, not always full) */
  readonly mealTarget: readonly [number, number];
  /** between meals, below this a snack appeals */
  readonly snackBelow: number;
  /** they go to drink below this on the water bar (his: 40%) */
  readonly drinkBelow: number;
  /** and drink until somewhere between these */
  readonly drinkTarget: readonly [number, number];
  /** the bathroom bar: from here it is worth going if it is handy; at `bathroomAt` they go (his: 75%) */
  readonly bathroomFrom: number;
  readonly bathroomAt: number;
  /** energy: below this a sit-down appeals by day (his: 40%) */
  readonly restBelow: number;
  /** energy: in their bedtime hours, below this they go to bed */
  readonly sleepBelow: number;
  /** energy: below this, at any hour, they must sleep, in a bed or wherever they can (his: 5-10%) */
  readonly collapseBelow: number;
}

/** Their day's usual shape, hours of the day (0..24). */
export interface Habits {
  /** when they usually wake (they wake within about half an hour of it, rested) */
  readonly wake: number;
  /** when they usually go to bed */
  readonly bedtime: number;
  /** their usual meal times (a meal is more likely near them) */
  readonly meals: readonly number[];
}

/**
 * STRESS EATING (Joshua's brief, section 8, for Mary): with stress the levels below move toward these, as far as her
 * stress (0..1) times her `stressEater` trait. Normal | stressed, his table:
 *   eating trigger   below 30% | below 45-55%        meal target   60-75% | 75-90%
 *   snacking         occasional | more frequent      restlessness  normal | more        sleep  normal | worse
 */
export interface StressEating {
  readonly eatBelow: readonly [number, number];
  readonly mealTarget: readonly [number, number];
  /** how much more a snack appeals at full stress (2: twice) */
  readonly snackMore: number;
  /** how much more wandering appeals at full stress */
  readonly restless: number;
  /** how well they sleep at full stress (0.8: their sleep restores 80% as much) */
  readonly sleepQuality: number;
}

/** The feelings they tend back toward when nothing is happening (emotions.ts), 0..1. */
export interface EmotionBase {
  readonly happiness: number;
  readonly stress: number;
  readonly comfort: number;
}

/** A CHARACTER'S PROFILE. */
export interface CharacterProfile {
  readonly id: ActorId;
  readonly name: string;
  /** where they live: they keep to it, and know their own bed in it (homeLayout.ts owners) */
  readonly homeId: string;
  /** their partner, if they have one: time together matters more (affectionate) */
  readonly partnerId?: ActorId;
  readonly traits: Traits;
  readonly needs: NeedLevels;
  readonly habits: Habits;
  /** how much they like each pastime (1 as anyone; 1.4 a favourite; 0.6 not much) */
  readonly likes: Readonly<Partial<Record<ActivityId, number>>>;
  readonly stressEating?: StressEating;
  readonly base: EmotionBase;
}

/** Anyone's levels, Joshua's table (section 5) as the starting point. */
export const DEFAULT_NEEDS: NeedLevels = {
  eatBelow: 0.3, mealTarget: [0.6, 0.75], snackBelow: 0.4,
  drinkBelow: 0.4, drinkTarget: [0.8, 0.95],
  bathroomFrom: 0.5, bathroomAt: 0.75,
  restBelow: 0.4, sleepBelow: 0.35, collapseBelow: 0.1,
};

/**
 * MARY "BLAZE" FISHER (the story's heroine; A.R.C.H. researcher). Her personality is a FIRST GUESS from the story so
 * far, for Joshua to change: curious and neat (a researcher), social and very affectionate (John's wife), a strong
 * stress eater (his section 8), moderately disciplined. She is up at 6:45 and in bed by 22:30.
 */
export const MARY_PROFILE: CharacterProfile = {
  id: 'mary',
  name: 'Mary Fisher',
  homeId: 'fisher-home',
  partnerId: 'john',
  traits: { active: 0.5, foodLover: 0.5, stressEater: 0.8, disciplined: 0.5, social: 0.7, curious: 0.7, cautious: 0.5, neat: 0.6, affectionate: 0.8, adventurous: 0.4 },
  needs: DEFAULT_NEEDS,
  habits: { wake: 6.75, bedtime: 22.5, meals: [7.5, 12.5, 18.5] },
  likes: { read: 1.3, talk: 1.3, lookOutside: 1.2, watchScreen: 1.0, exercise: 0.9, tidy: 1.1 },
  stressEating: { eatBelow: [0.45, 0.55], mealTarget: [0.75, 0.9], snackMore: 2, restless: 1.5, sleepQuality: 0.8 },
  base: { happiness: 0.65, stress: 0.15, comfort: 0.5 },
};

/**
 * JOHN "SPARKS" FISHER (Mary's husband; on the A.R.C.H. expedition). A FIRST GUESS too: active and adventurous (the
 * one who goes into the cave), fairly disciplined, less neat; no stress eating. Up at 6:15, in bed by 23:00.
 */
export const JOHN_PROFILE: CharacterProfile = {
  id: 'john',
  name: 'John Fisher',
  homeId: 'fisher-home',
  partnerId: 'mary',
  traits: { active: 0.8, foodLover: 0.6, stressEater: 0, disciplined: 0.6, social: 0.5, curious: 0.6, cautious: 0.4, neat: 0.3, affectionate: 0.6, adventurous: 0.8 },
  needs: DEFAULT_NEEDS,
  habits: { wake: 6.25, bedtime: 23, meals: [7, 12.5, 18.75] },
  likes: { exercise: 1.4, watchScreen: 1.2, read: 0.9, talk: 1.1, tidy: 0.7, lookOutside: 1.0 },
  base: { happiness: 0.65, stress: 0.12, comfort: 0.5 },
};

/** The profiles the game knows, by id. */
export const PROFILES: Readonly<Record<ActorId, CharacterProfile>> = { mary: MARY_PROFILE, john: JOHN_PROFILE };
