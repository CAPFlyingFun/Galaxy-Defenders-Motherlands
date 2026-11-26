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
// resource availability"); a test can empty them (`setStock`).
// ============================================================================
import type { ActorId, SmartObject, StockKind, Vec2 } from '../../mind/types';
import type { MindWorld } from '../../mind/world';
import { roomAt, type HomeLayout } from './homeLayout';
import { HomeRoutes } from './homeRoutes';

export class HomeWorld implements MindWorld {
  readonly homeId: string;
  readonly routes: HomeRoutes;
  /** slot key ("toilet-1#seat") -> who holds it */
  private readonly holders = new Map<string, ActorId>();
  /** object id -> what is left in it */
  private readonly left = new Map<string, Partial<Record<StockKind, number>>>();
  private readonly byId = new Map<string, SmartObject>();

  constructor(readonly layout: HomeLayout) {
    this.homeId = layout.id;
    this.routes = new HomeRoutes(layout);
    for (const o of layout.objects) {
      this.byId.set(o.id, o);
      if (o.stock) this.left.set(o.id, { ...o.stock });
    }
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

  stock(objectId: string, kind: StockKind): number { return this.left.get(objectId)?.[kind] ?? 0; }

  take(objectId: string, kind: StockKind, count = 1): boolean {
    const s = this.left.get(objectId);
    if (!s || (s[kind] ?? 0) < count) return false;
    s[kind] = (s[kind] ?? 0) - count;
    return true;
  }

  /** TEST: set what is left in a thing (an empty fridge). */
  setStock(objectId: string, kind: StockKind, count: number): void {
    const s = this.left.get(objectId) ?? {};
    s[kind] = Math.max(0, count);
    this.left.set(objectId, s);
  }

  standSpots(room: string): readonly Vec2[] { return this.layout.standSpots[room] ?? []; }
  rooms(): readonly { id: string; name: string }[] { return this.layout.rooms; }

  /** Everything held now (the debug panel's "reserved"): slot key -> who. */
  held(): ReadonlyMap<string, ActorId> { return this.holders; }

  /** What is kept between games: the stock left (reservations are not: plans start again). */
  save(): unknown { return [...this.left.entries()]; }
  load(saved: unknown): void {
    for (const [id, s] of (saved as [string, Partial<Record<StockKind, number>>][]) ?? []) if (this.byId.has(id)) this.left.set(id, { ...s });
  }
}
