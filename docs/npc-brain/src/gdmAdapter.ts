import { RUNNING, SUCCEEDED, blocked, failed, type FullCommand, type NeedsSnapshot, type NpcObservation, type NpcPort, type Point, type TaskResult } from './types.js';

/**
 * Structural subsets of the ACTUAL GDM public methods (2026-11-21, GDM v0.2.123).
 * These intentionally do not import Three.js or CCBS: the template typechecks on its own.
 * Claude should replace structural types with `import type` from the repo after integration.
 */
export interface GdmBody {
  setPosition(x: number, z: number, y?: number): void;
  setYaw(yaw: number): void;
  setWalk(speed: number): void;
  aimAt?(target: { x: number; y: number; z: number } | null): void;
  squatFor?(seconds: number): void;
  hands?: { hasGun(hand: 'left' | 'right'): boolean };
}
export interface GdmMotion {
  x: number; z: number; speed: number;
  update(dt: number, moveX: number, moveY: number, viewYaw: number, speed: number): void;
}
export interface GdmVitals {
  readonly reading: NeedsSnapshot;
  readonly contents?: { bladderMl: number };
  consume(foodMl: number, waterMl: number): void;
  relieve(): void;
}
export interface GdmDoorUse {
  readonly active: boolean;
  readonly holding: boolean;
  readonly busy: boolean;
  start(x: number, z: number, hand: 'left' | 'right'): void;
  letGo(): void;
}
export interface GdmGrabUse {
  readonly busy: boolean;
  readonly holding: boolean;
  readonly bar: 'pole' | 'rail' | null;
  start(bar: 'pole' | 'rail', which?: 'left' | 'right' | 'both'): void;
  letGo(): void;
}
export interface GdmHolsterUse {
  readonly busy: boolean;
  readonly hasHolsters: boolean;
  holsterAll(): boolean;
  start(which: 'left' | 'right' | 'both'): void;
}

/** Game-level shot callback MUST handle ammo, raycast/physics, LOS, damage and all policy checks.
 * `heroine.fire(hand)` alone is an animation/recoil, NOT the full shooting system. */
export interface CombatAction {
  /** Explicit permission. For defense this must also confirm the target is hostile and combat necessary. */
  canFire(targetId: string, mode: 'utility' | 'defense'): boolean;
  /** One REAL shot, with GDM's muzzle/tracers/rounds/damage logic. */
  shoot(targetId: string, mode: 'utility' | 'defense'): boolean;
  stop(): void;
}
export interface GdmNpcHooks {
  actorId: string;
  body: GdmBody;
  motion: GdmMotion;
  vitals: GdmVitals;
  /** Game world registry, not inferred from visible model names. */
  locate(id: string): Point | null;
  danger(): number;
  groundAt(x: number, z: number): number;
  /** Optional GDM world pathfinding; without it, navigation uses direct PlayerMotion steering and can stall on obstacles. */
  navigate?(point: Point, stopDistance: number, speed: number, dt: number): TaskResult;
  doorId?: string;
  doorUse?: GdmDoorUse;
  grabUse?: GdmGrabUse;
  holsterUse?: GdmHolsterUse;
  combat?: CombatAction;
  /** True if the NPC has a suitable private bathroom location. Otherwise the NPC will not relieve itself anywhere. */
  canUseBathroom?(): boolean;
  /** Optional movement / food / scanning animation authority. */
  startGesture?(type: 'eat' | 'drink' | 'bathroom' | 'scan' | 'repair' | 'study'): void;
  /** Quests and tools provide object interactions; the brain never invents object behavior. */
  interact?(command: FullCommand, dt: number, elapsed: number, first: boolean): TaskResult;
  /** After DoorUse reaches hold, GDM must walk the door's rail to swing it.
   * This callback completes only when the panel is actually open. */
  finishOpeningDoor?(doorId: string, dt: number): TaskResult;
  /** Optional: only return true after the GrabUse reach animation is fully in hold. */
  gripSettled?(bar: 'pole' | 'rail'): boolean;
  /** Ring or message, respecting mission comm restrictions. */
  phone?(recipientId: string, topic: string): boolean;
  storyLocked?(): boolean;
  incapacitated?(): boolean;
  /** Setting from story director; `defense` is not permitted by default. */
  mayUseDefensiveForce?(): boolean;
}
interface ActionProgress { shots: number; lastShot: number; committed: boolean }

/**
 * GDM adapter for NPCs. DOES NOT instantiate or control GDM's single-player `main.ts` objects.
 * When integrating, make one set of actor-owned motion, interactions and vitals PER NPC.
 * The existing GDM world loop must still call DoorUse.update and GrabUse.update EACH FRAME and
 * consume their walkTo/look requests. These systems have their own animation phases.
 */
export class GdmNpcAdapter implements NpcPort {
  private readonly progress = new Map<string, ActionProgress>();
  constructor(readonly gdm: GdmNpcHooks) {}

  observe(): NpcObservation {
    const { motion, actorId, vitals } = this.gdm;
    return {
      actorId,
      position: { x: motion.x, y: this.gdm.groundAt(motion.x, motion.z), z: motion.z },
      needs: vitals.reading,
      danger: this.gdm.danger(),
      storyLocked: this.gdm.storyLocked?.() ?? false,
      incapacitated: this.gdm.incapacitated?.() ?? false,
    };
  }
  locate(id: string): Point | null { return this.gdm.locate(id); }
  moveTo(point: Point, stopDistance: number, speed: number, dt: number): TaskResult {
    if (this.gdm.navigate) return this.gdm.navigate(point, stopDistance, speed, dt);
    const { motion, body } = this.gdm;
    const dx = point.x - motion.x, dz = point.z - motion.z, d = Math.hypot(dx, dz);
    if (d <= stopDistance + 0.005) { body.setWalk(0); return SUCCEEDED; }
    // DIRECT STEERING only: PlayerMotion respects walls, but it cannot plan around them.
    const yaw = Math.atan2(dx, dz);
    const requested = Math.min(Math.max(0, speed), Math.max(0, (d - stopDistance) / Math.max(dt, 1e-6)));
    motion.update(dt, 0, 1, yaw, requested);
    body.setPosition(motion.x, motion.z, this.gdm.groundAt(motion.x, motion.z));
    body.setYaw(yaw);
    body.setWalk(motion.speed);
    return Math.hypot(point.x - motion.x, point.z - motion.z) <= stopDistance + 0.005 ? SUCCEEDED : RUNNING;
  }
  stopMoving(): void { this.gdm.body.setWalk(0); }

  authorize(c: FullCommand): boolean {
    if (c.kind !== 'fireAt') return true;
    if (c.maxShots <= 0 || c.maxShots > 20) return false;
    if (!this.gdm.combat || !this.gdm.combat.canFire(c.targetId, c.mode)) return false;
    if (c.mode === 'defense') {
      // Prevent routine actors from independently initiating lethal combat. The game's story/combat
      // policy must explicitly authorize it, or the commander/player must ask for it.
      return !!this.gdm.mayUseDefensiveForce?.() && this.gdm.danger() >= 0.5
        && (c.source === 'story' || c.source === 'player-request' || c.source === 'safety');
    }
    return true; // Utility shot still needs `combat.canFire` to confirm environment/puzzle target.
  }

  perform(c: FullCommand, dt: number, elapsed: number, first: boolean): TaskResult {
    const g = this.gdm;
    let state = this.progress.get(c.id);
    if (!state) { state = { shots: 0, lastShot: -Infinity, committed: false }; this.progress.set(c.id, state); }
    const finish = (result: TaskResult): TaskResult => { if (result.status !== 'running') this.progress.delete(c.id); return result; };
    switch (c.kind) {
      case 'holster': {
        const h = g.holsterUse;
        if (!h || !h.hasHolsters) return finish(blocked('No available holsters'));
        if (first) { if (c.hand && c.hand !== 'both') h.start(c.hand); else h.holsterAll(); }
        return finish(h.busy ? RUNNING : SUCCEEDED);
      }
      case 'openDoor': {
        const d = g.doorUse;
        if (!d || (g.doorId && g.doorId !== c.doorId)) return finish(blocked('Door not available to this actor'));
        if (first) {
          if (d.active) return finish(blocked('Door occupied'));
          const hand = c.hand ?? 'right';
          if (g.body.hands?.hasGun(hand)) return finish(blocked('Holster this hand first'));
          d.start(g.motion.x, g.motion.z, hand);
        }
        // DoorUse.update reaches the handle/hold. The panel only swings when the
        // ACTOR moves along DoorUse's rail; never call it 'opened' at hold alone.
        if (!d.holding) return finish(d.active ? RUNNING : failed('Door action did not start or was cancelled'));
        return finish(g.finishOpeningDoor ? g.finishOpeningDoor(c.doorId, dt) : blocked('Door handle held: wire finishOpeningDoor to GDM rail movement'));
      }
      case 'grab': {
        const r = g.grabUse;
        if (!r) return finish(blocked('GrabBars not available'));
        if (first) {
          if (r.busy) return finish(blocked('Another grabbing action is active'));
          const hands = c.hand === 'both' || !c.hand ? ['left', 'right'] as const : [c.hand];
          if (hands.some(h => g.body.hands?.hasGun(h))) return finish(blocked('Holster first'));
          r.start(c.bar, c.hand ?? 'both');
        }
        if (r.holding && r.bar === c.bar) return finish(g.gripSettled && !g.gripSettled(c.bar) ? RUNNING : SUCCEEDED);
        return finish(r.busy ? RUNNING : failed('Grab action did not start'));
      }
      case 'releaseGrip': {
        if (first) { g.grabUse?.letGo(); g.doorUse?.letGo(); }
        return finish(!g.grabUse?.busy && !g.doorUse?.active ? SUCCEEDED : RUNNING);
      }
      case 'useBathroom': {
        if (!g.canUseBathroom?.()) return finish(blocked('NPC needs a safe/private bathroom location'));
        const seconds = c.seconds ?? 5;
        if (first) { g.startGesture?.('bathroom'); g.body.squatFor?.(seconds); }
        if (elapsed < seconds) return RUNNING;
        if (!state.committed) { state.committed = true; g.vitals.relieve(); }
        return finish(SUCCEEDED);
      }
      case 'eat':
      case 'drink': {
        if (first) g.startGesture?.(c.kind);
        if (elapsed < (c.seconds ?? 2)) return RUNNING;
        if (!state.committed) {
          state.committed = true;
          g.vitals.consume(c.kind === 'eat' ? (c.foodMl ?? 150) : 0, c.kind === 'drink' ? (c.waterMl ?? 250) : 0);
        }
        return finish(SUCCEEDED);
      }
      case 'rest': return finish(elapsed >= c.seconds ? SUCCEEDED : RUNNING); // vitals.step handles actual energy recovery.
      case 'fireAt': {
        if (!g.combat || !this.authorize(c)) return finish(blocked('Fire no longer permitted'));
        const target = g.locate(c.targetId);
        if (!target) return finish(blocked('Fire target not loaded'));
        const interval = Math.max(0.1, c.interval ?? 0.6);
        if (elapsed - state.lastShot >= interval) {
          // Let game-level raycasts decide whether a shot is possible; do not bypass the ammo/LOS system.
          if (!g.combat.shoot(c.targetId, c.mode)) return finish(blocked('Target not in line of sight, empty ammo, or other restriction'));
          state.shots++;
          state.lastShot = elapsed;
        }
        return finish(state.shots >= c.maxShots ? SUCCEEDED : RUNNING);
      }
      case 'call': {
        if (first && !g.phone?.(c.recipientId, c.topic)) return finish(blocked('Phone unavailable, no signal, or recipient busy'));
        return finish(SUCCEEDED);
      }
      case 'scan':
      case 'repair':
      case 'study':
      case 'interact': {
        if (!g.locate(c.targetId)) return finish(blocked('Target unavailable'));
        if (first && c.kind !== 'interact') g.startGesture?.(c.kind);
        // Object-specific events + outcomes belong to GDM world/quests.
        if (g.interact) return finish(g.interact(c, dt, elapsed, first));
        return finish(blocked('Register a GDM world interaction for this action'));
      }
      default: return finish(blocked(`Action ${c.kind} not handled by this adapter`));
    }
  }

  cancel(c: FullCommand): void {
    this.progress.delete(c.id);
    if (c.kind === 'fireAt') { this.gdm.combat?.stop(); this.gdm.body.aimAt?.(null); }
    if (c.kind === 'grab') this.gdm.grabUse?.letGo();
    if (c.kind === 'openDoor') this.gdm.doorUse?.letGo();
  }
}
