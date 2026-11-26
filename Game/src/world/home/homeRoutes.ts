// ============================================================================
// homeRoutes.ts -- THE WAY FROM ONE PLACE IN A HOME TO ANOTHER, through its doorways: for the mind's distances and the
// headless simulation's walking, until the walk grid (phase 4) walks round the furniture too.
//
// Every room in the home is a rectangle, so inside one room a straight line is always a way (furniture aside, for
// now). Rooms meet at doorways (homeLayout.ts `Doorway`): a sliding door, or one of the open gaps along the living
// room and kitchen's side of the hall. So the shortest way is a shortest path through doorway points.
//
// HOW IT IS FOUND QUICKLY: the mind asks for a distance to every thing it might use, every second (about 60 asks a
// decision), and a search over every doorway for each ask was 80% of the minds' whole cost in the headless simulation
// (MEASURED 2026-11-26: a decision's frame up to 12 ms on the build machine). So the shortest way BETWEEN EVERY TWO
// DOORWAYS is worked out once (Floyd-Warshall over the home's dozen doorways, two joined when they open into the same
// room), and again only when a doorway is blocked or opened. An ask is then the best of: start -> a doorway of the
// start's room -> ... -> a doorway of the end's room -> end, two or three doorways each side.
//
// A doorway can be BLOCKED (`block`, for the tests: "Characters recover from blocked or unavailable destinations"): it
// is left out, and a place only reached through it has no way to it (null), which the mind treats as unreachable.
// ============================================================================
import type { Vec2 } from '../../mind/types';
import type { Doorway, HomeLayout, Room } from './homeLayout';

/** A way through the home: its points (from the start to the end, doorways between) and its length, metres. */
export interface Route {
  readonly points: readonly Vec2[];
  readonly length: number;
}

export class HomeRoutes {
  private readonly blocked = new Set<string>();
  /** the doorways that can be walked through now (not blocked, not to the outside) */
  private doors: Doorway[] = [];
  /** for each room, the indices (into `doors`) of its doorways */
  private doorsOf = new Map<string, number[]>();
  /** the shortest way between two doorways, metres (Infinity: none), and the doorway after `i` on the way to `j` */
  private between: Float64Array = new Float64Array(0);
  private nextOn: Int32Array = new Int32Array(0);

  constructor(private readonly layout: HomeLayout) {
    this.rebuild();
  }

  /** A doorway can no longer be walked through (a test), or can again. */
  block(doorId: string, blocked = true): void {
    if (blocked === this.blocked.has(doorId)) return;
    if (blocked) this.blocked.add(doorId);
    else this.blocked.delete(doorId);
    this.rebuild();
  }

  /** Whether a doorway is blocked. */
  isBlocked(doorId: string): boolean {
    return this.blocked.has(doorId);
  }

  /** The rooms a spot is in: one, or two on the line between them (a doorway's middle). */
  roomsAt(p: Vec2, slack = 0.03): Room[] {
    return this.layout.rooms.filter((room) => {
      const r = room.rect;
      return p.x >= r.x0 - slack && p.x <= r.x1 + slack && p.z >= r.z0 - slack && p.z <= r.z1 + slack;
    });
  }

  /**
   * THE SHORTEST WAY from `from` to `to` through the doorways that are not blocked, or null if there is none (or
   * either end is outside the home).
   */
  route(from: Vec2, to: Vec2): Route | null {
    const found = this.search(from, to);
    if (!found) return null;
    if (found.first < 0) return { points: [from, to], length: found.length };
    const points: Vec2[] = [from];
    for (let i = found.first; i >= 0; i = i === found.last ? -1 : this.nextOn[i * this.doors.length + found.last]) points.push(this.doors[i].at);
    points.push(to);
    return { points, length: found.length };
  }

  /** Just the length of the way, metres, or null if there is none (no points made: the mind's many asks). */
  distance(from: Vec2, to: Vec2): number | null {
    return this.search(from, to)?.length ?? null;
  }

  /** The best way's length and its first and last doorways (-1, -1: the same room, straight there). */
  private search(from: Vec2, to: Vec2): { length: number; first: number; last: number } | null {
    const startRooms = this.roomsAt(from), endRooms = this.roomsAt(to);
    if (!startRooms.length || !endRooms.length) return null;
    // (the same room: straight there)
    if (startRooms.some((r) => endRooms.includes(r))) return { length: dist(from, to), first: -1, last: -1 };
    const n = this.doors.length;
    let length = Infinity, first = -1, last = -1;
    for (const sr of startRooms) {
      for (const a of this.doorsOf.get(sr.id) ?? []) {
        const toA = dist(from, this.doors[a].at);
        for (const er of endRooms) {
          for (const b of this.doorsOf.get(er.id) ?? []) {
            const via = toA + this.between[a * n + b] + dist(this.doors[b].at, to);
            if (via < length) { length = via; first = a; last = b; }
          }
        }
      }
    }
    return length < Infinity ? { length, first, last } : null;
  }

  /** The doorways that can be used, and the shortest way between every two of them (Floyd-Warshall). */
  private rebuild(): void {
    this.doors = this.layout.doors.filter((d) => !this.blocked.has(d.id) && d.rooms[0] !== 'outside' && d.rooms[1] !== 'outside');
    const n = this.doors.length;
    this.doorsOf = new Map();
    this.doors.forEach((d, i) => {
      for (const r of d.rooms) {
        const list = this.doorsOf.get(r) ?? [];
        list.push(i);
        this.doorsOf.set(r, list);
      }
    });
    const D = new Float64Array(n * n).fill(Infinity), next = new Int32Array(n * n).fill(-1);
    for (let i = 0; i < n; i++) {
      D[i * n + i] = 0; next[i * n + i] = i;
      for (let j = 0; j < n; j++) {
        if (i === j || !this.doors[i].rooms.some((r) => this.doors[j].rooms.includes(r))) continue;
        D[i * n + j] = dist(this.doors[i].at, this.doors[j].at);
        next[i * n + j] = j;
      }
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const ik = D[i * n + k];
        if (ik === Infinity) continue;
        for (let j = 0; j < n; j++) {
          const via = ik + D[k * n + j];
          if (via < D[i * n + j]) { D[i * n + j] = via; next[i * n + j] = next[i * n + k]; }
        }
      }
    }
    this.between = D;
    this.nextOn = next;
  }
}

/** Straight-line distance on the floor. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
