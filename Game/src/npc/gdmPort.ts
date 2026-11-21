// ============================================================================
// gdmPort.ts -- how the NPC brain's orders are carried out in THIS game, for ONE character.
//
// ChatGPT's template had `GdmNpcAdapter` (docs/npc-brain/src/gdmAdapter.ts): written against the game's code as it was,
// guessing at how each system would be reached, and moving the character itself. This is that adapter REWRITTEN for
// the game as it is now (Joshua, 2026-11-21: "customize it if need for our game"):
//   - each character has their OWN kit (main.ts `Kit`: their own holsters, belt reload, table, bars, door, movement,
//     turning, bursts), so the brain drives only its own character's things, never the player's;
//   - the port does not move or pose the body: it only says what it WANTS (`ActorWants`: walk toward here, look this
//     way, aim at that, fire). The character's own frame (main.ts `stepStandingBy`) carries those out, with the same
//     systems the player uses. One writer of movement per character per frame, as the template's notes ask.
//   - shooting is the game's own: the guns' bursts, their rounds, the tracers (main.ts). The brain only says "fire at
//     this target, this many shots"; `authorize` lets it fire only while that character is in AUTO.
// Orders this game has no world for yet (doors, bars, eat, drink, study...) are refused cleanly ('blocked'), never
// faked. The bathroom is where they stand, as it is for the player (there is no toilet yet).
// ============================================================================
import { RUNNING, SUCCEEDED, blocked, type FullCommand, type NeedsSnapshot, type NpcObservation, type NpcPort, type Point, type TaskResult } from './types';

type Hand = 'left' | 'right';

/** What the brain wants this character to do this frame (main.ts carries it out, then clears what was done). */
export interface ActorWants {
  /** Walk toward this point at a walk (null: stand). */
  walkTo: Point | null;
  /** Look this way, radians, compass yaw (null: as their turning decides). */
  look: number | null;
  /** Aim at this point (null: guns down). */
  aimAt: Point | null;
  /** Pull the trigger (bursts, the game's own cadence) while aimed. */
  fire: boolean;
  /** Shots fired so far (main.ts counts each one): how an order knows when it has fired enough. */
  shots: number;
}

/** What the port can reach of ONE character (main.ts makes this from their kit, their body and their vitals). */
export interface ActorHooks {
  readonly actorId: string;
  readonly wants: ActorWants;
  /** Where they stand now. */
  position(): Point;
  /** Their needs as the brain reads them (their own vitals). */
  needs(): NeedsSnapshot;
  /** How dangerous it is now, 0 .. 1 (the dome's state, for now). */
  danger(): number;
  /** Where a named thing is: 'target:N' a sky target, 'table' the weapon table, 'self' where they stand. */
  locate(id: string): Point | null;
  /** In AUTO (aim, fire and reload on their own). */
  auto(): boolean;
  /** Busy with something that has its own walk and hands (the table, a bar, a door), or squatting, or winded. */
  occupied(): boolean;
  /** Their guns: in a hand, holstered, rounds left. */
  hasGun(hand: Hand): boolean;
  holstered(hand: Hand): boolean;
  rounds(hand: Hand): number;
  /** Their holsters: whether they have any, whether a holster or a draw is running, and starting one. */
  hasHolsters(): boolean;
  holsterBusy(): boolean;
  holsterAll(): void;
  drawAll(): void;
  holsterOne(hand: Hand): void;
  /** Reloading: start one (from the belt, or at the table if the table is free), and whether one is running. */
  startReload(): boolean;
  reloading(): boolean;
  /** The bathroom where they stand: squat this long (their bladder is emptied when it ends), and whether still squatting. */
  squat(seconds: number): void;
  squatting(): boolean;
}

export class GdmActorPort implements NpcPort {
  /** Shots counted at the start of each fire order (by order id). */
  private readonly shotsAtStart = new Map<string, number>();

  constructor(readonly actor: ActorHooks) {}

  observe(): NpcObservation {
    return { actorId: this.actor.actorId, position: this.actor.position(), needs: this.actor.needs(), danger: this.actor.danger() };
  }

  locate(id: string): Point | null { return this.actor.locate(id); }

  /** Walking: the port only says where; the character's frame walks them there (and the walls stop them). */
  moveTo(point: Point, stopDistance: number): TaskResult {
    const p = this.actor.position();
    if (Math.hypot(point.x - p.x, point.z - p.z) <= stopDistance + 0.005) { this.actor.wants.walkTo = null; return SUCCEEDED; }
    this.actor.wants.walkTo = point;
    return RUNNING;
  }

  stopMoving(): void { this.actor.wants.walkTo = null; }

  /** Firing only in AUTO, only at a sky target the game knows, and never more than 20 shots an order. */
  authorize(c: FullCommand): boolean {
    if (c.kind !== 'fireAt') return true;
    return this.actor.auto() && c.maxShots > 0 && c.maxShots <= 20 && this.actor.locate(c.targetId) !== null;
  }

  perform(c: FullCommand, _dt: number, elapsed: number, first: boolean): TaskResult {
    const a = this.actor;
    switch (c.kind) {
      case 'holster': {
        if (!a.hasHolsters()) return blocked('No holsters');
        if (first) { if (c.hand && c.hand !== 'both') a.holsterOne(c.hand); else a.holsterAll(); }
        return a.holsterBusy() ? RUNNING : SUCCEEDED;
      }
      case 'draw': {
        if (!a.hasHolsters()) return blocked('No holsters');
        if (first) {
          if (!a.holstered('left') && !a.holstered('right')) return SUCCEEDED;   // (nothing holstered: already drawn)
          if (c.hand && c.hand !== 'both') a.holsterOne(c.hand); else a.drawAll();
        }
        return a.holsterBusy() ? RUNNING : SUCCEEDED;
      }
      case 'reload': {
        if (first && !a.startReload()) return blocked('No full clips on the belt, and the table is taken or out of reach');
        // (a little grace for the reload to begin: the table first draws holstered guns)
        return a.reloading() || elapsed < 0.3 ? RUNNING : SUCCEEDED;
      }
      case 'fireAt': {
        const at = a.locate(c.targetId);
        if (!at || !a.auto()) { this.stopFiring(); return blocked('No target, or no longer in AUTO'); }
        if (first) this.shotsAtStart.set(c.id, a.wants.shots);
        const fired = a.wants.shots - (this.shotsAtStart.get(c.id) ?? a.wants.shots);
        // (both guns empty: this order is done; the fight routine asks for a reload next)
        const empty = a.rounds('left') <= 0 && a.rounds('right') <= 0;
        if (fired >= c.maxShots || empty || a.occupied()) {
          this.shotsAtStart.delete(c.id);
          a.wants.fire = false;   // (the aim stays on the target until the next order, so her arms do not drop between bursts)
          return SUCCEEDED;
        }
        a.wants.aimAt = at;
        a.wants.look = Math.atan2(at.x - a.position().x, at.z - a.position().z);
        a.wants.fire = true;
        return RUNNING;
      }
      case 'useBathroom': {
        // (where they stand, as the player does, until there is a toilet: squat, and their bladder is emptied after)
        if (first) a.squat(c.seconds ?? 10);
        return a.squatting() ? RUNNING : SUCCEEDED;
      }
      case 'rest': return elapsed >= c.seconds ? SUCCEEDED : RUNNING;   // (standing still: their energy comes back)
      default: return blocked(`"${c.kind}" is not set up in this game yet`);
    }
  }

  cancel(c: FullCommand): void {
    this.shotsAtStart.delete(c.id);
    if (c.kind === 'fireAt') this.stopFiring();
  }

  /** Stop firing and lower the guns. */
  stopFiring(): void {
    this.actor.wants.fire = false;
    this.actor.wants.aimAt = null;
    this.actor.wants.look = null;
  }
}
