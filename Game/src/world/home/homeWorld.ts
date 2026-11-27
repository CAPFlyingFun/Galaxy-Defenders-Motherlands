// ============================================================================
// homeWorld.ts -- A HOME AS THE MIND SEES IT (src/mind/world.ts MindWorld): its things, the way round it, who holds
// which thing, and what is left in the fridge and cabinet. Plain data and numbers: the headless simulation uses it as
// it is, and the drawn home (phase 3) will too.
//
// RESERVATIONS (Joshua's brief, section 11: "Characters should reserve interactive objects before using them. Two
// characters cannot use the same toilet simultaneously. A double bed can have two independent sleeping positions.
// Multiple dining chairs can be used simultaneously."): each thing's SLOT is held by one character at a time; a double
// bed has two slots, a sofa three, each dining chair one.
// STOCK: the fridge's meals and drinks and the cabinet's snacks count down as they are taken ("Find available food...
// resource availability"); a test can empty them (`setStock`). SINCE v0.2.181 BY ITEM (mind/food.ts: the apple, the
// sandwich, the pasta, the water bottle...): what the player picks from the fridge's panel and what the AI takes come
// off the same counts; the mind's shelves (meals, snacks, drinks) are the sums of their items. `restock` fills them
// back to their start (Settings -> FOOD & DRINK -> Restock fridge).
// ============================================================================
import { FOOD_ITEMS, SHELF, foodItem, type FoodItem } from '../../mind/food';
import type { ActorId, SmartObject, StockKind, Vec2 } from '../../mind/types';
import type { MindWorld } from '../../mind/world';
import { roomAt, type HomeLayout } from './homeLayout';
import { HomeRoutes } from './homeRoutes';

export class HomeWorld implements MindWorld {
  readonly homeId: string;
  readonly routes: HomeRoutes;
  /** slot key ("toilet-1#seat") -> who holds it */
  private readonly holders = new Map<string, ActorId>();
  /** object id -> item id -> how many are left in it */
  private readonly left = new Map<string, Map<string, number>>();
  private readonly byId = new Map<string, SmartObject>();

  constructor(readonly layout: HomeLayout) {
    this.homeId = layout.id;
    this.routes = new HomeRoutes(layout);
    for (const o of layout.objects) {
      this.byId.set(o.id, o);
    }
    this.restock();
  }

  /** Every fridge and pantry filled back to what it started with (its layout's `items`). */
  restock(): void {
    for (const o of this.layout.objects) if (o.items) this.left.set(o.id, new Map(Object.entries(o.items)));
  }

  objects(): readonly SmartObject[] { return this.layout.objects; }
  object(id: string): SmartObject | undefined { return this.byId.get(id); }
  travel(from: Vec2, to: Vec2): number | null { return this.routes.distance(from, to); }
  roomAt(p: Vec2): string | null { return roomAt(this.layout, p)?.id ?? null; }

  holder(objectId: string, slotId: string): ActorId | null { return this.holders.get(`${objectId}#${slotId}`) ?? null; }

  reserve(objectId: string, slotId: string, by: ActorId): boolean {
    const key = `${objectId}#${slotId}`, now = this.holders.get(key);
    if (now && now !== by) return false;
    this.holders.set(key, by);
    return true;
  }

  release(by: ActorId, objectId?: string): void {
    for (const [key, who] of [...this.holders]) if (who === by && (!objectId || key.startsWith(`${objectId}#`))) this.holders.delete(key);
  }

  stock(objectId: string, kind: StockKind): number {
    let n = 0;
    for (const [id, count] of this.left.get(objectId) ?? []) { const item = foodItem(id); if (item && SHELF[item.kind] === kind) n += count; }
    return n;
  }

  items(objectId: string): readonly { readonly item: FoodItem; readonly count: number }[] {
    const s = this.left.get(objectId);
    if (!s) return [];
    // (in the panel's order: FOOD_ITEMS)
    return FOOD_ITEMS.filter((i) => s.has(i.id)).map((item) => ({ item, count: s.get(item.id) ?? 0 }));
  }

  takeItem(objectId: string, itemId: string): boolean {
    const s = this.left.get(objectId);
    if (!s || (s.get(itemId) ?? 0) < 1) return false;
    s.set(itemId, (s.get(itemId) ?? 0) - 1);
    return true;
  }

  putBackItem(objectId: string, itemId: string): void {
    const s = this.left.get(objectId) ?? new Map<string, number>();
    s.set(itemId, (s.get(itemId) ?? 0) + 1);
    this.left.set(objectId, s);
  }

  /** TEST: set how many are left on one shelf of a thing (an empty fridge): spread over its items, one at a time. */
  setStock(objectId: string, kind: StockKind, count: number): void {
    const s = this.left.get(objectId);
    if (!s) return;
    const ids = [...s.keys()].filter((id) => { const item = foodItem(id); return !!item && SHELF[item.kind] === kind; });
    for (const id of ids) s.set(id, 0);
    for (let i = 0; i < Math.max(0, count) && ids.length; i++) s.set(ids[i % ids.length], (s.get(ids[i % ids.length]) ?? 0) + 1);
  }

  standSpots(room: string): readonly Vec2[] { return this.layout.standSpots[room] ?? []; }
  rooms(): readonly { id: string; name: string }[] { return this.layout.rooms; }

  /** Everything held now (the debug panel's "reserved"): slot key -> who. */
  held(): ReadonlyMap<string, ActorId> { return this.holders; }

  /** What is kept between games: the stock left (reservations are not: plans start again). */
  save(): unknown { return [...this.left.entries()].map(([id, s]) => [id, [...s.entries()]]); }
  load(saved: unknown): void {
    // (only a save by item: one from before v0.2.181 kept shelves, and is left as the start's stock)
    for (const [id, s] of (saved as [string, unknown][]) ?? []) if (this.byId.has(id) && Array.isArray(s)) this.left.set(id, new Map(s as [string, number][]));
  }
}
