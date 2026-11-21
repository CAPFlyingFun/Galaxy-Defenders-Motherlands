// ============================================================================
// autoCombat.ts -- a character left in AUTO keeps fighting on their own (Step 2).
//
// Joshua, 2026-11-21: "Each one should work auto independently"; "yes for 2, but when you select that character, you
// can take control back". The player's own AUTO (main.ts) aims at the sky target in front of them, fires in bursts and
// reloads when both guns are empty. This does the same for the one standing by, through their brain: it does not
// fire by itself, it gives their brain ORDERS (draw, reload, fire at a target), which the brain runs one at a time
// and which anything more urgent (the bathroom) comes before. Only while their brain is in 'ai' mode: swapped to, the
// player has them and this stops at once (brain.ts `setMode('player')`).
// ============================================================================
import type { NpcBrain } from './brain';
import type { ActorHooks, GdmActorPort } from './gdmPort';

/** How the fight routine works (numbers easy to change). */
export const AUTO_COMBAT = {
  /** How often it looks at what to do next, seconds. */
  everySeconds: 0.25,
  /** Its orders' priority: below every need (the bathroom is 82-99). */
  priority: 40,
  /** Shots in one fire order (two bursts of three), then it looks again (a nearer target, an empty gun). */
  shotsPerOrder: 6,
};

export class AutoCombat {
  private since = 0;
  /**
   * WHAT IT IS THINKING (Joshua, 2026-11-21: "draw over John his state of mind 🧠 that way I can know what it's
   * 'Thinking' and if it's working"): the reason for its last decision, in a few words, for the thought bubble over
   * them (ui/thoughtBubble.ts, npc/thoughts.ts). Only read for show: nothing decides by it.
   */
  thought = '';

  /**
   * @param brain  this character's brain
   * @param port   their port (to lower their guns when the fight stops)
   * @param actor  what the port reaches of them
   * @param pick   the sky target they would aim at now, as an id the port can locate ('target:N'), or null
   */
  constructor(private readonly brain: NpcBrain, private readonly port: GdmActorPort, private readonly actor: ActorHooks,
    private readonly pick: () => string | null) {}

  tick(dt: number): void {
    if (this.brain.controlMode !== 'ai') { this.thought = 'Player has control'; return; }
    this.since += dt;
    if (this.since < AUTO_COMBAT.everySeconds) return;
    this.since = 0;
    const a = this.actor;
    // (MANUAL: nothing of their own; guns lowered if this was aiming them)
    if (!a.auto()) {
      this.thought = 'MANUAL: holding fire';
      if (this.brain.hasGroup('auto')) this.brain.cancelGroup('auto');
      if (a.wants.aimAt || a.wants.fire) this.port.stopFiring();
      return;
    }
    // (one fight order at a time; and not over something more important, or while their hands are taken)
    if (this.brain.hasGroup('auto')) return;   // (its thought stays the one that gave that order)
    const doing = this.brain.active;
    if (doing && doing.priority > AUTO_COMBAT.priority) { this.thought = 'A need comes first'; return; }
    if (a.occupied()) { this.thought = 'Hands busy: waiting'; if (a.wants.aimAt) this.port.stopFiring(); return; }
    const order = { group: 'auto', priority: AUTO_COMBAT.priority, source: 'routine' as const };
    // guns away: out they come
    if (!a.hasGun('left') && !a.hasGun('right')) {
      if (a.holstered('left') || a.holstered('right')) {
        this.thought = 'Guns holstered: drawing';
        this.brain.enqueue({ kind: 'draw', ...order, timeoutSeconds: 6 });
      } else this.thought = 'No guns: on the table?';
      return;
    }
    // both guns empty: reload (the belt first, else the table)
    if (a.rounds('left') <= 0 && a.rounds('right') <= 0) {
      if (!a.reloading()) { this.thought = 'Both guns empty: reload'; this.brain.enqueue({ kind: 'reload', ...order, timeoutSeconds: 40 }); }
      else this.thought = 'Reload under way';
      return;
    }
    // a target: fire at it
    const target = this.pick();
    if (target === null) { this.thought = 'No target in sight'; this.port.stopFiring(); return; }
    this.thought = `${target.replace(':', ' ')} is nearest: fire`;
    this.brain.enqueue({ kind: 'fireAt', targetId: target, mode: 'utility', maxShots: AUTO_COMBAT.shotsPerOrder, ...order, timeoutSeconds: 8 });
  }
}
