// ============================================================================
// routines.ts -- the brain's small everyday decisions: what a character does about their own needs.
//
// ChatGPT's "Motherlands NPC Brain v0.1" (docs/npc-brain/src/routines.ts), brought into the game. CHANGED FOR THIS GAME
// (2026-11-21): the places it walks to are OPTIONAL. The game has no toilet, food or water station yet, so:
//   - THE BATHROOM is where they stand (as it is for the player: main.ts `intake('bathroom')`): guns away first, then a
//     squat, and their bladder is emptied as it ends (gdmPort.ts `useBathroom`);
//   - food, water and rest are left alone until there are places for them (a place given: walk there, then do it).
// The marks are the game's own (heroineVitals.ts): the bathroom bar goes red and pulses from 0.83 (bladder 500 mL);
// at 0.97 it is urgent and comes before anything else.
// It never advances a quest or a story moment: those belong to the story's own director, later.
// ============================================================================
import type { Command, NpcObservation } from './types';
import { NpcBrain } from './brain';

/** Where to go for each need. Any left out is done where they stand (the bathroom) or not at all (the rest). */
export interface DailyLocations {
  bathroomId?: string;
  foodStationId?: string;
  waterStationId?: string;
  bedId?: string;
}
export interface NpcPreferences {
  foodLow: number;
  waterLow: number;
  bathroomHigh: number;
  energyLow: number;
  checkEverySeconds: number;
}
export const DEFAULT_PREFERENCES: NpcPreferences = Object.freeze({
  foodLow: 0.3, waterLow: 0.3, bathroomHigh: 0.83, energyLow: 0.23, checkEverySeconds: 0.5,
});

export class NeedsRoutine {
  private since = 0;
  constructor(private readonly brain: NpcBrain, private readonly places: DailyLocations = {},
    private readonly preferences: NpcPreferences = DEFAULT_PREFERENCES) {}

  tick(dt: number): void {
    if (this.brain.controlMode !== 'ai') return;
    this.since += dt;
    if (this.since < this.preferences.checkEverySeconds) return;
    this.since = 0;
    const o = this.brain.port.observe();
    if (o.storyLocked || o.incapacitated) return;
    const p = this.preferences, n = o.needs;
    /** A need's orders: walk to its place first if it has one, then the action; all in one group, done once. */
    const seq = (group: string, priority: number, destination: string | undefined, actions: Command[]): void => {
      if (this.brain.hasGroup(group)) return;
      const options = { source: 'safety' as const, priority, timeoutSeconds: 90, interruptible: true };
      const walk: Command[] = destination ? [{ kind: 'walkToObject', targetId: destination, distance: 1.0, ...options }] : [];
      this.brain.enqueueSequence([...walk, ...actions.map((a) => ({ ...a, ...options }))], group);
    };
    // THE BATHROOM comes first even in danger (the game's own rule: at full she goes whatever is happening)
    if (n.bathroom >= p.bathroomHigh) {
      seq('need:bathroom', n.bathroom >= 0.97 ? 99 : 82, this.places.bathroomId, [{ kind: 'holster' }, { kind: 'useBathroom', seconds: 10 }]);
      return;
    }
    if (o.danger > 0.4) return;
    if (n.water < p.waterLow && this.places.waterStationId) {
      seq('need:water', 75, this.places.waterStationId, [{ kind: 'drink', waterMl: 250, seconds: 2 }]);
    } else if (n.food < p.foodLow && this.places.foodStationId) {
      seq('need:food', 70, this.places.foodStationId, [{ kind: 'eat', foodMl: 150, seconds: 2 }]);
    } else if (n.energy < p.energyLow && this.places.bedId) {
      seq('need:rest', 65, this.places.bedId, [{ kind: 'rest', seconds: 20, timeoutSeconds: 25 }]);
    }
  }
}

/** (ChatGPT's, kept for later: a partner asked to come and look at something. Needs `scan` set up in gdmPort.ts.) */
export function requestPartnerHelp(brain: NpcBrain, targetId: string): void {
  brain.enqueueSequence([
    { kind: 'walkToObject', targetId, distance: 1.5, source: 'player-request', priority: 85, timeoutSeconds: 90 },
    { kind: 'scan', targetId, seconds: 4, source: 'player-request', priority: 85, timeoutSeconds: 15 },
  ], `help:${targetId}`);
}

/** Compact need state for a character when their model is out of range. */
export function needsSummary(observation: NpcObservation): string {
  const n = observation.needs;
  return `${observation.actorId}: water ${Math.round(n.water * 100)}%, food ${Math.round(n.food * 100)}%, ` +
    `energy ${Math.round(n.energy * 100)}%, bathroom ${Math.round(n.bathroom * 100)}%`;
}
