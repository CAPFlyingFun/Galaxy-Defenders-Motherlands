// ============================================================================
// mindBridge.ts -- FROM THE GAME'S VITALS TO THE MIND'S NEEDS (and back, for sizing a meal or a drink).
//
// The mind (src/mind/) knows nothing of the game's vitals: it reads plain numbers (NeedsSnapshot). This file turns one
// reading of a character's vitals (src/vitals/heroineVitals.ts VitalsReading) into those numbers, and gives the
// millilitres behind the food and water bars, so a meal can be sized to a target on the bar ("Eat until stomach
// fullness reaches a randomized target between 60% and 75%").
// ============================================================================
import type { NeedsSnapshot } from '../../mind/types';
import { VITALS_TUNING, foodBarOf, waterBarOf, type VitalsReading } from '../../vitals/heroineVitals';

/** A character's needs as the mind reads them, from one reading of their vitals. */
export function needsFromReading(r: VitalsReading): NeedsSnapshot {
  return {
    food: r.food, water: r.water, energy: r.energy, sleepiness: r.sleepiness, fatigue: r.fatigue,
    stamina: r.staminaPool > 0.001 ? r.stamina / r.staminaPool : 0,
    bathroom: r.bathroom, bathroomUrge: r.bathroomUrge, bathroomEta: r.bathroomEta,
    health: r.health / 100, mood: r.mood, fear: r.fear, asleep: r.asleep,
  };
}

/** Millilitres of food in the stomach that read as `bar` on the food bar (foodBarOf turned round). */
export function foodMlForBar(bar: number): number {
  const b = Math.min(1, Math.max(0, bar));
  // (foodBarOf is a straight line from 0 to her stomach's room at half, and from there to its most at full: find the
  //  millilitres by halving, which works for any shape of it that only rises)
  let lo = 0, hi = 3000;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (foodBarOf(mid) < b) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Her water balance, millilitres, that reads as `bar` on the water bar (waterBarOf turned round). */
export function waterBalanceForBar(bar: number): number {
  const w = VITALS_TUNING.waterBar, b = Math.min(1, Math.max(0, bar));
  return b >= 0.5 ? ((b - 0.5) / 0.5) * w.fullOverMl : (b / 0.5 - 1) * w.emptyUnderMl;
}

/** Millilitres to drink to take the water bar from `now` to `target` (0 if it is there already). */
export function waterMlBetween(now: number, target: number): number {
  return Math.max(0, waterBalanceForBar(target) - waterBalanceForBar(now));
}

// (waterBarOf is re-exported for the simulation's checks)
export { waterBarOf };
