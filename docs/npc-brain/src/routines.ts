import type { Command, NpcObservation } from './types.js';
import { NpcBrain } from './brain.js';

/**
 * Small deterministic decision layer: urgency > work. It never advances quests or completes
 * archaeological mysteries while the player is elsewhere. All world dependencies are named IDs.
 */
export interface DailyLocations {
  bathroomId: string;
  foodStationId: string;
  waterStationId: string;
  bedId: string;
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
  constructor(private readonly brain: NpcBrain, private readonly places: DailyLocations,
    private readonly preferences: NpcPreferences = DEFAULT_PREFERENCES) {}

  tick(dt: number): void {
    if (this.brain.controlMode !== 'ai') return;
    this.since += dt;
    if (this.since < this.preferences.checkEverySeconds) return;
    this.since = 0;
    const o = this.brain.port.observe();
    if (o.storyLocked || o.incapacitated || o.danger > 0.4) return;
    const p = this.preferences, n = o.needs;
    const seq = (group: string, priority: number, destination: string, action: Command): void => {
      if (this.brain.hasGroup(group)) return;
      const options = { source: 'safety' as const, priority, timeoutSeconds: 90, interruptible: true };
      this.brain.enqueueSequence([
        { kind: 'walkToObject', targetId: destination, distance: 1.0, ...options },
        { ...action, ...options },
      ], group);
    };
    if (n.bathroom >= p.bathroomHigh) {
      seq('need:bathroom', n.bathroom >= 0.97 ? 99 : 82, this.places.bathroomId, { kind: 'useBathroom', seconds: 5 });
    } else if (n.water < p.waterLow) {
      seq('need:water', 75, this.places.waterStationId, { kind: 'drink', waterMl: 250, seconds: 2 });
    } else if (n.food < p.foodLow) {
      seq('need:food', 70, this.places.foodStationId, { kind: 'eat', foodMl: 150, seconds: 2 });
    } else if (n.energy < p.energyLow) {
      seq('need:rest', 65, this.places.bedId, { kind: 'rest', seconds: 20, timeoutSeconds: 25 });
    }
  }
}

export function requestPartnerHelp(brain: NpcBrain, targetId: string): void {
  brain.enqueueSequence([
    { kind: 'walkToObject', targetId, distance: 1.5, source: 'player-request', priority: 85, timeoutSeconds: 90 },
    { kind: 'scan', targetId, seconds: 4, source: 'player-request', priority: 85, timeoutSeconds: 15 },
  ], `help:${targetId}`);
}

export function archaeologicalShift(brain: NpcBrain, locationId: string, artifactId: string): void {
  // This is an NPC task, NOT a quest-completion trigger. Quests advance only in their own director.
  brain.enqueueSequence([
    { kind: 'walkToObject', targetId: locationId, source: 'routine', priority: 30, timeoutSeconds: 120 },
    { kind: 'study', targetId: artifactId, seconds: 15, source: 'routine', priority: 30, timeoutSeconds: 20 },
    { kind: 'rest', seconds: 3, source: 'routine', priority: 30, timeoutSeconds: 5 },
  ], `shift:${artifactId}`);
}

/** Compact need state for a character when their model is out of range. */
export function needsSummary(observation: NpcObservation): string {
  const n = observation.needs;
  return `${observation.actorId}: water ${Math.round(n.water * 100)}%, food ${Math.round(n.food * 100)}%, ` +
    `energy ${Math.round(n.energy * 100)}%, bathroom ${Math.round(n.bathroom * 100)}%`;
}
