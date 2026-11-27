// ============================================================================
// mind/food.ts -- WHAT IS IN THE FRIDGE AND THE PANTRY (v0.2.181; Joshua, 2026-11-27: "When a user gets to the
// refrigerator, it should be like sims or other games and it shows you the food list you can choose yourself like a
// large meal, snack, etc… basically, the food and water drink in setting but you can access from the fridge with little
// icons or images like an inventory and not all food needs to be cook"). Pure TypeScript, as the rest of the mind.
//
// THE ITEMS are the FOOD & DRINK amounts of Settings made into things: a SNACK 150 mL of food, a SMALL MEAL 400, a FULL
// MEAL 700; drinks 250 or 500 mL of water. None needs cooking or heating for now (his "leave alone for now").
//
// WHERE THEY ARE EATEN (Joshua: "if over a medium meal will sit at the table, anything else right there standing"): a
// FULL MEAL at the table (or the sofa or an armchair if the table is taken); a snack, a small meal or a drink right
// where they stand. The AI keeps to the same rule (activities.ts `itemPlan`).
//
// STOCK is kept per item in each fridge and pantry (homeWorld.ts); the old shelves the mind reasons with (meals,
// snacks, drinks: StockKind) are the sums of their items (`SHELF`).
// ============================================================================
import type { StockKind } from './types';

/** What an item is, for where it is eaten and how it counts: the AI's meals are small or full meals. */
export type FoodKind = 'snack' | 'smallMeal' | 'fullMeal' | 'drink';

/** One thing to eat or drink. */
export interface FoodItem {
  readonly id: string;
  readonly name: string;
  /** its picture on the panel (an emoji: nothing to download) */
  readonly emoji: string;
  readonly kind: FoodKind;
  /** what it puts in the stomach: food and water, mL (the vitals' own units) */
  readonly foodMl: number;
  readonly waterMl: number;
}

/** The shelf each kind is counted on (the mind's StockKind). */
export const SHELF: Readonly<Record<FoodKind, StockKind>> = { snack: 'snacks', smallMeal: 'meals', fullMeal: 'meals', drink: 'drinks' };

/** How each kind reads on the panel. */
export const KIND_WORD: Readonly<Record<FoodKind, string>> = { snack: 'Snack', smallMeal: 'Small meal', fullMeal: 'Full meal', drink: 'Drink' };

/** Every item, in the order the panel shows them. */
export const FOOD_ITEMS: readonly FoodItem[] = [
  // (in the fridge: food)
  { id: 'apple', name: 'Apple', emoji: '🍎', kind: 'snack', foodMl: 150, waterMl: 40 },
  { id: 'cheese', name: 'Cheese stick', emoji: '🧀', kind: 'snack', foodMl: 150, waterMl: 0 },
  { id: 'sandwich', name: 'Sandwich', emoji: '🥪', kind: 'smallMeal', foodMl: 400, waterMl: 0 },
  { id: 'salad', name: 'Salad', emoji: '🥗', kind: 'smallMeal', foodMl: 400, waterMl: 60 },
  { id: 'pasta', name: 'Pasta', emoji: '🍝', kind: 'fullMeal', foodMl: 700, waterMl: 0 },
  { id: 'readyMeal', name: 'Ready meal', emoji: '🍱', kind: 'fullMeal', foodMl: 700, waterMl: 0 },
  // (in the fridge: drinks)
  { id: 'water', name: 'Water bottle', emoji: '💧', kind: 'drink', foodMl: 0, waterMl: 500 },
  { id: 'juice', name: 'Juice', emoji: '🧃', kind: 'drink', foodMl: 0, waterMl: 250 },
  { id: 'milk', name: 'Milk', emoji: '🥛', kind: 'drink', foodMl: 0, waterMl: 250 },
  { id: 'sportsDrink', name: 'Sports drink', emoji: '🥤', kind: 'drink', foodMl: 0, waterMl: 500 },
  // (in the pantry)
  { id: 'granola', name: 'Granola bar', emoji: '🍫', kind: 'snack', foodMl: 150, waterMl: 0 },
  { id: 'banana', name: 'Banana', emoji: '🍌', kind: 'snack', foodMl: 150, waterMl: 20 },
  { id: 'trailMix', name: 'Trail mix', emoji: '🥜', kind: 'snack', foodMl: 150, waterMl: 0 },
  { id: 'cookies', name: 'Cookies', emoji: '🍪', kind: 'snack', foodMl: 150, waterMl: 0 },
];

const BY_ID = new Map(FOOD_ITEMS.map((i) => [i.id, i]));

/** An item by its id (undefined for none). */
export function foodItem(id: string): FoodItem | undefined { return BY_ID.get(id); }

/**
 * WHAT A FRIDGE AND THE PANTRY START WITH (and are filled back to by Settings -> FOOD & DRINK -> Restock fridge):
 * the fridge's meals come to 60 and its drinks to 40, as the home's larder did before items; the pantry's snacks 32.
 */
export const START_STOCK: Readonly<Record<'fridge' | 'cabinet', Readonly<Record<string, number>>>> = {
  fridge: { apple: 8, cheese: 6, sandwich: 14, salad: 12, pasta: 16, readyMeal: 18, water: 16, juice: 8, milk: 8, sportsDrink: 8 },
  cabinet: { granola: 10, banana: 6, trailMix: 8, cookies: 8 },
};

/** Eaten at the table (Joshua: "if over a medium meal will sit at the table"): a full meal. */
export function atTheTable(item: FoodItem): boolean { return item.kind === 'fullMeal'; }
