// ============================================================================
// mind/traits.ts -- PERSONALITY: the traits a character can have, each 0 (not at all) to 1 (very).
//
// Joshua's brief, section 7: "Traits should influence activity priorities, preferences and thresholds rather than
// forcing identical behavior every time." So a trait is never a rule: it scales how much an activity appeals
// (activities.ts reads them), or moves a threshold (the stress eater's: profile.ts). Characters can have them set by
// hand (profile.ts) or rolled (`randomTraits`).
// ============================================================================

/** The traits, and what each one does in the mind (activities.ts, mind.ts). */
export const TRAITS = {
  active: 'Exercises and wanders more; restless when kept still.',
  foodLover: 'Enjoys meals more (cooks more often, a meal lifts their mood); a little hungrier for them.',
  stressEater: 'Eats sooner, more and snacks more often when stressed (their profile says how much).',
  disciplined: 'Keeps to their habits: meals and bed at their usual times, less chance in their choices.',
  social: 'Seeks conversation; lonely sooner.',
  curious: 'Reads, looks out of windows, investigates.',
  cautious: 'Avoids danger and risk (later: the world outside).',
  neat: 'Tidies up; washes up in the morning and before bed.',
  affectionate: 'Seeks time with their partner most of all.',
  adventurous: 'Goes exploring, looks outside (later: leaves the house).',
} as const;

export type Trait = keyof typeof TRAITS;
export const TRAIT_NAMES = Object.keys(TRAITS) as Trait[];

/** A character's traits: every trait 0..1 (left out: 0). */
export type Traits = Readonly<Partial<Record<Trait, number>>>;

/** A trait's strength, 0..1 (0 if they do not have it). */
export function trait(traits: Traits, name: Trait): number {
  const v = traits[name];
  return v === undefined || !Number.isFinite(v) ? 0 : Math.min(1, Math.max(0, v));
}

/** ROLLED TRAITS for a new character (an NPC later): each 0..1, most of them mild, a few strong. */
export function randomTraits(rng: () => number): Traits {
  const out: Partial<Record<Trait, number>> = {};
  for (const name of TRAIT_NAMES) out[name] = Math.round(Math.pow(rng(), 1.6) * 100) / 100;
  return out;
}
