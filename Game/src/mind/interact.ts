// ============================================================================
// mind/interact.ts -- THE ONE PLAYED DOING THINGS THEMSELVES (Joshua, 2026-11-26: "Would be nice to have an
// interaction button when close to each other or like the sink, toilet, bed, etc, and manually do stuff (will still
// play programmed animations) as your main character"). Pure TypeScript, as the rest of the mind.
//
// WHAT IS IN REACH (`interactionsNear`): the thing the one played stands at and faces, in the room they are in (a
// toilet, a sink, the fridge, a chair, a bed...), with what they can do with it by its type (`INTERACTIONS`: the
// first is the button's own word; the rest are what the small ⇄ beside it goes round); or the other person, near and
// awake, to TALK to.
//
// DOING IT (mind.ts `doNow`): the same activity the AI runs, with its own plan and the game's own walking, sitting and
// lying (homeMindBody.ts), on the thing they chose (`askedChoice` turns the button into the AI's choice). The one
// played stays 'manual': nothing more is planned for them once it is done, and the stick or the button lets go of it.
//
// THE FRIDGE AND THE PANTRY OPEN A PANEL (v0.2.181; Joshua, 2026-11-27: "it shows you the food list you can choose
// yourself... like an inventory"): their button is OPEN FRIDGE / OPEN PANTRY (`panel`), the game shows what is in it
// (ui/foodPanel.ts), and a pick is an `eatItem` with that item: a full meal at the table, anything else standing there.
// ============================================================================
import type { ActivityId, ActorId, ObjectSlot, ObjectType, SmartObject, Vec2 } from './types';
import type { MindWorld } from './world';
import { pickSlot, type Choice, type MindContext, type Pick } from './activities';
import { atTheTable, type FoodItem } from './food';

/** One thing the one played can do: its button word, the activity, and the thing or person it is with. */
export interface Interaction {
  /** the button's word: SIT, USE TOILET, DRINK... */
  readonly word: string;
  readonly activity: ActivityId;
  readonly object?: SmartObject;
  readonly slot?: ObjectSlot;
  /** the person, for TALK */
  readonly with?: ActorId;
  readonly withName?: string;
  /** the fridge's or the pantry's panel to open (not an activity: main.ts shows what is in it) */
  readonly panel?: 'fridge' | 'pantry';
  /** what was picked from that panel (an `eatItem`) */
  readonly item?: FoodItem;
}

/** One way of using a type of thing: its word, its activity, and when it is offered. */
interface Offer {
  readonly word: string;
  readonly activity: ActivityId;
  readonly when?: (o: SmartObject, world: MindWorld) => boolean;
  readonly panel?: 'fridge' | 'pantry';
}

/**
 * WHAT EACH TYPE OF THING OFFERS, the button's word first. The AI's own activities, so each plays as it does when they
 * do it by themselves: SIT is its sit-and-rest, SLEEP its night (getting up when rested), EAT its meal (the fridge,
 * then a chair at the table), WATCH TV its film.
 */
export const INTERACTIONS: Partial<Record<ObjectType, readonly Offer[]>> = {
  toilet: [{ word: 'USE TOILET', activity: 'toilet' }],
  sink: [
    { word: 'DRINK', activity: 'drink' },
    { word: 'WASH UP', activity: 'washUp', when: (o) => o.room !== 'kitchen' },
  ],
  fridge: [{ word: 'OPEN FRIDGE', activity: 'eatItem', panel: 'fridge' }],
  cabinet: [{ word: 'OPEN PANTRY', activity: 'eatItem', panel: 'pantry' }],
  diningChair: [{ word: 'SIT', activity: 'rest' }],
  sofa: [
    { word: 'SIT', activity: 'rest' },
    { word: 'WATCH TV', activity: 'watchScreen', when: (o) => !!o.tags?.includes('faces-screen') },
    { word: 'NAP', activity: 'nap' },
    { word: 'READ', activity: 'read' },
  ],
  armchair: [
    { word: 'SIT', activity: 'rest' },
    { word: 'READ', activity: 'read' },
    { word: 'WATCH TV', activity: 'watchScreen', when: (o) => !!o.tags?.includes('faces-screen') },
  ],
  deskChair: [{ word: 'SIT', activity: 'rest' }, { word: 'READ', activity: 'read' }],
  bed: [{ word: 'SLEEP', activity: 'sleep' }],
  floorSpot: [{ word: 'EXERCISE', activity: 'exercise', when: (o) => !!o.tags?.includes('exercise') }],
  window: [{ word: 'LOOK OUTSIDE', activity: 'lookOutside' }],
};

/** How near a thing must be, metres from its edge (or from where it is used), and how far off their facing it may be. */
const REACH = 0.9, REACH_SPOT = 1.0, FACING_MOST = (80 * Math.PI) / 180;
/** Near enough to the other person to talk, metres, in the same room. */
const TALK_REACH = 2.2;

/** The way from a thing's box to a point: metres from its nearest edge (0 inside it). */
function boxDistance(o: SmartObject, p: Vec2): number {
  const dx = p.x - o.at.x, dz = p.z - o.at.z;
  // (into the thing's own frame: its width across x, its depth along z, its front toward +z)
  const c = Math.cos(o.facing), s = Math.sin(o.facing);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ox = Math.max(0, Math.abs(lx) - o.size.w / 2), oz = Math.max(0, Math.abs(lz) - o.size.d / 2);
  return Math.hypot(ox, oz);
}

/** How far a way is off another, radians (0..pi). */
const off = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * WHAT THE ONE PLAYED CAN DO HERE: the nearest thing in reach that they face (or stand right at), in their room, with
 * every way of using it they may (a slot of it free or theirs); or the other person to talk to, if they are nearer. The
 * button's word first; empty if nothing is in reach.
 */
export function interactionsNear(world: MindWorld, me: ActorId, at: Vec2, facing: number,
  others: readonly { readonly id: ActorId; readonly name: string; readonly position: Vec2; readonly asleep: boolean }[]): Interaction[] {
  const room = world.roomAt(at);
  let best: { o: SmartObject; slot: ObjectSlot; cost: number } | null = null;
  for (const o of world.objects()) {
    const offers = INTERACTIONS[o.type];
    if (!offers || (room !== null && o.room !== room)) continue;
    // (the slot nearest them that no one else holds)
    let slot: ObjectSlot | null = null, slotAway = Infinity;
    for (const s of o.slots) {
      const holder = world.holder(o.id, s.id);
      if (holder && holder !== me) continue;
      const d = Math.min(Math.hypot(s.use.x - at.x, s.use.z - at.z), Math.hypot(s.approach.x - at.x, s.approach.z - at.z));
      if (d < slotAway) { slotAway = d; slot = s; }
    }
    if (!slot) continue;
    const edge = boxDistance(o, at);
    if (edge > REACH && slotAway > REACH_SPOT) continue;
    // (facing it: the way to its middle within 80 degrees of their facing; right at it (half a metre), any way)
    const away = off(Math.atan2(o.at.x - at.x, o.at.z - at.z), facing);
    if (away > FACING_MOST && edge > 0.5 && slotAway > 0.5) continue;
    const cost = Math.min(edge, slotAway) + 0.4 * away;
    if (!best || cost < best.cost) best = { o, slot, cost };
  }
  // (the other person: near, in the same room, awake; nearer than the thing, they come first)
  let person: Interaction | null = null, personCost = Infinity;
  for (const other of others) {
    if (other.id === me || other.asleep) continue;
    const d = Math.hypot(other.position.x - at.x, other.position.z - at.z);
    if (d > TALK_REACH || (room !== null && world.roomAt(other.position) !== room)) continue;
    const cost = d - 0.3 + 0.4 * off(Math.atan2(other.position.x - at.x, other.position.z - at.z), facing);
    if (cost < personCost) { personCost = cost; person = { word: `TALK TO ${other.name.split(' ')[0].toUpperCase()}`, activity: 'talk', with: other.id, withName: other.name }; }
  }
  const things: Interaction[] = [];
  if (best) {
    for (const offer of INTERACTIONS[best.o.type] ?? []) {
      if (offer.when && !offer.when(best.o, world)) continue;
      things.push({ word: offer.word, activity: offer.activity, object: best.o, slot: best.slot, ...(offer.panel ? { panel: offer.panel } : {}) });
    }
  }
  if (person && (!best || personCost < best.cost)) return [person, ...things];
  return person ? [...things, person] : things;
}

/**
 * AN INTERACTION AS THE MIND'S CHOICE: the activity the AI would run, on the thing chosen. A pick from the fridge or
 * the pantry: a full meal is eaten at the table (the chair the AI would pick, else the sofa or an armchair, else
 * standing), anything else standing there. Null if it cannot be done (none left, the other person gone).
 */
export function askedChoice(c: MindContext, i: Interaction): Choice | null {
  const reason = 'the player asked';
  if (i.activity === 'talk') {
    const other = c.others.find((o) => o.id === i.with);
    return other ? { activity: 'talk', score: 100, reason, with: other.id, spot: other.position, asked: true } : null;
  }
  if (!i.object || !i.slot) return null;
  const here = c.body.position();
  const pick: Pick = { object: i.object, slot: i.slot, metres: c.world.travel(here, i.slot.approach) ?? 0 };
  if (i.activity === 'eatItem') {
    if (!i.item || !c.world.items(i.object.id).some((e) => e.item.id === i.item!.id && e.count > 0)) return null;
    const seat = atTheTable(i.item)
      ? pickSlot(c, ['diningChair'], { from: i.slot.use, othersOwn: true }) ?? pickSlot(c, ['sofa', 'armchair'], { from: i.slot.use, othersOwn: true })
      : null;
    return { activity: 'eatItem', score: 100, reason: `${reason}: ${i.item.name.toLowerCase()}`, pick: seat ?? pick, via: pick, item: i.item, asked: true };
  }
  return { activity: i.activity, score: 100, reason, pick, asked: true };
}

/**
 * THE NEAREST THING OF A TYPE, the walking way, with a slot free (or theirs), as an interaction: at home the 🚽 button
 * sends the one played to the nearest real toilet (main.ts), not the pop-up one. Null if none can be reached.
 */
export function nearestInteraction(world: MindWorld, me: ActorId, at: Vec2, type: ObjectType, word: string, activity: ActivityId): Interaction | null {
  let best: Interaction | null = null, bestWay = Infinity;
  for (const o of world.objects()) {
    if (o.type !== type) continue;
    for (const s of o.slots) {
      const holder = world.holder(o.id, s.id);
      if (holder && holder !== me) continue;
      const way = world.travel(at, s.approach);
      if (way !== null && way < bestWay) { bestWay = way; best = { word, activity, object: o, slot: s }; }
    }
  }
  return best;
}
