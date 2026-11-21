// ============================================================================
// brain.ts -- ONE BRAIN PER CHARACTER: a queue of things to do, done one at a time.
//
// ChatGPT's "Motherlands NPC Brain v0.1" (docs/npc-brain/, made against this game's code, 2026-11-21), brought into
// the game as it was written (Joshua, 2026-11-21: "import and set up the AI brain ChatGPT did but customize it if
// need for our game"). Only its import lines were changed. How it works:
//   - orders (`Command`s, types.ts) go into a queue, highest priority first; one runs at a time;
//   - a higher-priority order interrupts one that may be interrupted (walking and waiting are queued again; eating,
//     shooting and doors never repeat);
//   - every order has a time limit, so a stuck character gives up instead of hanging;
//   - the MODE: 'ai' (it acts), 'player' (the player has them: it stops at once and does nothing), 'scripted' (only
//     the story's orders). main.ts sets 'player' on whoever is played and 'ai' on the one standing by.
// The brain itself never touches the game: everything goes through its port (gdmPort.ts), which turns its orders
// into what this game's systems do.
// ============================================================================
import { RUNNING, SUCCEEDED, blocked, type BrainEvent, type Command, type FullCommand, type NpcPort, type TaskResult } from './types';

export type ControlMode = 'ai' | 'player' | 'scripted';
interface Active { command: FullCommand; elapsed: number; first: boolean; stuckFor: number; lastDistance: number }
export interface BrainState {
  mode: ControlMode;
  active: { id: string; kind: string; elapsed: number } | null;
  queued: Array<{ id: string; kind: string; group?: string; priority: number }>;
}
const defaults: Required<Pick<FullCommand, 'priority' | 'source' | 'timeoutSeconds' | 'interruptible'>> = {
  priority: 40, source: 'routine', timeoutSeconds: 30, interruptible: true,
};

/** One NpcBrain PER character. Do not share a brain, needs, or movement between Mary and John. */
export class NpcBrain {
  readonly events: BrainEvent[] = [];
  private pending: FullCommand[] = [];
  private current: Active | null = null;
  private serial = 0;
  private mode: ControlMode = 'ai';
  private readonly maxQueue = 64;
  private readonly maxEvents = 100;

  constructor(readonly port: NpcPort) {}

  setMode(mode: ControlMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Control handoff cancels the current animation. It never transfers the old brain's control to another character.
    if (mode === 'player' && this.current) this.finish('interrupted', 'Player takeover');
    if (mode === 'scripted' && this.current && this.current.command.source !== 'story') this.finish('interrupted', 'Story takeover');
    this.port.stopMoving();
  }
  get controlMode(): ControlMode { return this.mode; }
  get active(): Readonly<FullCommand> | null { return this.current?.command ?? null; }
  get queued(): readonly FullCommand[] { return this.pending; }

  enqueue(order: Command): string {
    if (this.pending.length >= this.maxQueue) throw new Error('NPC command queue full');
    const cmd: FullCommand = {
      ...order,
      id: order.id ?? `${this.port.observe().actorId}:${++this.serial}`,
      priority: order.priority ?? defaults.priority,
      source: order.source ?? defaults.source,
      timeoutSeconds: order.timeoutSeconds ?? defaults.timeoutSeconds,
      interruptible: order.interruptible ?? defaults.interruptible,
    } as FullCommand;
    if (!Number.isFinite(cmd.priority) || !Number.isFinite(cmd.timeoutSeconds) || cmd.timeoutSeconds <= 0) throw new Error('Invalid command priority or timeout');
    if (this.current?.command.id === cmd.id || this.pending.some(c => c.id === cmd.id)) throw new Error(`Duplicate command id ${cmd.id}`);
    this.pending.push(cmd);
    // Stable sort: equal priorities keep their submission order; a need can insert ahead of an ordinary task.
    this.pending.sort((a, b) => b.priority - a.priority);
    return cmd.id;
  }

  /** For a sequence, preserve its order. Prefer a group and an identical priority. */
  enqueueSequence(orders: readonly Command[], group: string): string[] {
    if (this.pending.length + orders.length > this.maxQueue) throw new Error('NPC command queue full');
    return orders.map(o => this.enqueue({ ...o, group }));
  }

  hasGroup(group: string): boolean {
    return this.current?.command.group === group || this.pending.some(c => c.group === group);
  }

  cancelGroup(group: string): void {
    this.pending = this.pending.filter(c => c.group !== group);
    if (this.current?.command.group === group) this.finish('interrupted', 'Group cancelled');
  }

  clear(): void {
    this.pending = [];
    if (this.current) this.finish('interrupted', 'Cleared');
    this.port.stopMoving();
  }

  /** Run in GDM's unpaused frame(dt). No asynchronous timers or allocations proportional to world size. */
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.mode === 'player') return;
    const world = this.port.observe();
    if (world.incapacitated) { if (this.current) this.finish('interrupted', 'Incapacitated'); return; }
    if (this.mode === 'ai' && world.storyLocked) return; // Story controller owns the scene.
    const available = () => this.pending.findIndex(c => this.mode !== 'scripted' || c.source === 'story');
    const idx = available();
    if (idx >= 0 && this.current && this.current.command.interruptible && this.pending[idx]!.priority > this.current.command.priority) {
      // Requeue only repeat-safe navigation/wait; never replay consuming food, firing, or opening a door.
      const old = this.current.command;
      this.finish('interrupted', 'Higher priority order');
      if (['walkTo', 'walkToObject', 'follow', 'wait'].includes(old.kind)) this.pending.push(old);
      this.pending.sort((a, b) => b.priority - a.priority);
    }
    if (!this.current) {
      const startIndex = available();
      if (startIndex < 0) return;
      const [command] = this.pending.splice(startIndex, 1);
      if (!command) return;
      if (this.port.authorize && !this.port.authorize(command)) {
        this.emit(command, 'failed', 'Unauthorized by game/story policy');
        return;
      }
      this.current = { command, elapsed: 0, first: true, stuckFor: 0, lastDistance: Infinity };
      this.emit(command, 'started');
    }
    const a = this.current;
    if (!a) return;
    a.elapsed += dt;
    if (a.elapsed > a.command.timeoutSeconds) { this.finish('failed', 'Timed out'); return; }
    let result: TaskResult = RUNNING;
    const c = a.command;
    switch (c.kind) {
      case 'walkTo':
      case 'walkToObject':
      case 'follow': {
        const target = c.kind === 'walkTo' ? c.point : this.port.locate(c.targetId);
        if (!target) { result = blocked('Target missing or not loaded'); break; }
        const stopDistance = c.distance ?? (c.kind === 'follow' ? 2.5 : 0.9);
        const speed = c.speed ?? 1.4;
        if (stopDistance < 0 || speed < 0) { result = blocked('Invalid navigation settings'); break; }
        const p = world.position;
        const distance = Math.hypot(target.x - p.x, target.z - p.z);
        if (distance <= stopDistance + 0.005) {
          this.port.stopMoving();
          result = c.kind === 'follow' && c.seconds !== undefined && a.elapsed < c.seconds ? RUNNING : SUCCEEDED;
          break;
        }
        result = this.port.moveTo(target, stopDistance, speed, dt);
        if (result.status === 'running') {
          if (distance < a.lastDistance - 0.02) a.stuckFor = 0;
          else a.stuckFor += dt;
          if (a.stuckFor > 3) result = blocked('Navigation stalled: needs pathfinding or obstacle handling');
        }
        a.lastDistance = distance;
        break;
      }
      case 'wait': result = a.elapsed >= c.seconds ? SUCCEEDED : RUNNING; break;
      default: result = this.port.perform(c, dt, a.elapsed, a.first); break;
    }
    a.first = false;
    if (result.status === 'succeeded') this.finish('completed');
    if (result.status === 'blocked' || result.status === 'failed') this.finish('failed', result.reason ?? result.status);
  }

  /** Debug only; store semantic objectives in quest state, not mid-animation control state. */
  inspect(): BrainState {
    return {
      mode: this.mode,
      active: this.current ? { id: this.current.command.id, kind: this.current.command.kind, elapsed: this.current.elapsed } : null,
      queued: this.pending.map(c => ({ id: c.id, kind: c.kind, ...(c.group ? { group: c.group } : {}), priority: c.priority })),
    };
  }

  private finish(phase: 'completed' | 'interrupted' | 'failed', reason?: string): void {
    const a = this.current;
    if (!a) return;
    if (phase !== 'completed') this.port.cancel(a.command);
    this.port.stopMoving();
    this.current = null;
    this.emit(a.command, phase, reason);
  }
  private emit(c: FullCommand, phase: BrainEvent['phase'], reason?: string): void {
    const event: BrainEvent = { actorId: this.port.observe().actorId, commandId: c.id, kind: c.kind, phase, ...(reason ? { reason } : {}) };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
  }
}
