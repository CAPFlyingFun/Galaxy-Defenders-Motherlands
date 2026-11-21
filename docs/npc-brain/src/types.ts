/** GDM-friendly world coordinates: metres, Y up, compass yaw 0 = +Z. */
export interface Point { x: number; y?: number; z: number }
export type HandChoice = 'left' | 'right' | 'both';
export type CommandSource = 'story' | 'player-request' | 'safety' | 'routine';

export interface CommandOptions {
  /** Higher interrupts lower, when the current action is interruptible. */
  priority?: number;
  source?: CommandSource;
  timeoutSeconds?: number;
  interruptible?: boolean;
}
interface Named {
  /** Set automatically by NpcBrain.enqueue() if omitted. */
  id?: string;
  /** Group multiple orders, e.g. 'need:bathroom' or 'quest:arch-01'. */
  group?: string;
}
export type Command = (CommandOptions & Named) & (
  | { kind: 'walkTo'; point: Point; distance?: number; speed?: number }
  | { kind: 'walkToObject'; targetId: string; distance?: number; speed?: number }
  | { kind: 'follow'; targetId: string; distance?: number; speed?: number; seconds?: number }
  | { kind: 'grab'; bar: 'pole' | 'rail'; hand?: HandChoice }
  | { kind: 'releaseGrip' }
  | { kind: 'openDoor'; doorId: string; hand?: 'left' | 'right' }
  | { kind: 'holster'; hand?: HandChoice }
  | { kind: 'fireAt'; targetId: string; mode: 'utility' | 'defense'; maxShots: number; interval?: number }
  | { kind: 'eat'; foodMl?: number; seconds?: number }
  | { kind: 'drink'; waterMl?: number; seconds?: number }
  | { kind: 'useBathroom'; seconds?: number }
  | { kind: 'rest'; seconds: number }
  | { kind: 'scan' | 'repair' | 'study'; targetId: string; seconds?: number }
  | { kind: 'call'; recipientId: string; topic: string }
  | { kind: 'interact'; targetId: string; action: string; seconds?: number }
  | { kind: 'wait'; seconds: number }
);
export type FullCommand = Command & { id: string; priority: number; source: CommandSource; timeoutSeconds: number; interruptible: boolean };
export type TaskStatus = 'running' | 'succeeded' | 'blocked' | 'failed';
export interface TaskResult { status: TaskStatus; reason?: string }
export const RUNNING: TaskResult = { status: 'running' };
export const SUCCEEDED: TaskResult = { status: 'succeeded' };
export const blocked = (reason: string): TaskResult => ({ status: 'blocked', reason });
export const failed = (reason: string): TaskResult => ({ status: 'failed', reason });

export interface NeedsSnapshot {
  /** GDM's VitalsReading: 0 empty .. 1 full. */
  food: number;
  water: number;
  energy: number;
  /** GDM's VitalsReading bathroom FILL: 0 empty .. 1 urgent. */
  bathroom: number;
  health: number;
}
export interface NpcObservation {
  actorId: string;
  position: Point;
  needs: NeedsSnapshot;
  /** 0..1, where 1 means immediate danger. Provided by game world. */
  danger: number;
  /** True if quest/cutscene says routine decisions must pause. */
  storyLocked?: boolean;
  /** True when character is unconscious or cannot act. */
  incapacitated?: boolean;
}
/** Port handles movement + GDM animation systems. It must never silently teleport. */
export interface NpcPort {
  observe(): NpcObservation;
  /** Dynamic target resolution. None for objects not yet loaded or known. */
  locate(targetId: string): Point | null;
  /** Request path following; report 'blocked' if route cannot be found. */
  moveTo(point: Point, stopDistance: number, speed: number, dt: number): TaskResult;
  /** Called when moving ends or is interrupted. */
  stopMoving(): void;
  /** Start or continue an action, driven by its existing GDM owner (door, grab, vitals...). */
  perform(command: FullCommand, dt: number, elapsed: number, first: boolean): TaskResult;
  /** Cancel active gameplay effects (including fire/reach). */
  cancel(command: FullCommand): void;
  /** Optional: let game reject story-unsafe orders. */
  authorize?(command: FullCommand): boolean;
}
export interface BrainEvent {
  actorId: string;
  commandId: string;
  kind: Command['kind'];
  phase: 'started' | 'completed' | 'interrupted' | 'failed';
  reason?: string;
}
