// ============================================================================
// mind/society.ts -- THE MINDS IN ONE PLACE TOGETHER: who is home, who is away, who is being played, and asking another
// to talk. One Society per home (or per map); every Mind in it is told of it (mind.ts).
//
// Away (the story: John on the expedition) means not in this home at all: the others do not see them, and a partner
// away makes their partner lonely (emotions.ts).
// ============================================================================
import type { ActorId, Vec2 } from './types';
import type { Mind } from './mind';

export class Society {
  private readonly minds = new Map<ActorId, Mind>();
  private readonly away = new Set<ActorId>();

  add(mind: Mind): void { this.minds.set(mind.id, mind); }
  remove(id: ActorId): void { this.minds.delete(id); }
  get(id: ActorId): Mind | undefined { return this.minds.get(id); }
  all(): Mind[] { return [...this.minds.values()]; }

  /** Someone leaves home (or comes back). */
  setAway(id: ActorId, away: boolean): void {
    if (away) this.away.add(id);
    else this.away.delete(id);
  }
  isAway(id: ActorId): boolean { return this.away.has(id) || !this.minds.has(id); }

  /** Everyone at home. */
  present(): Mind[] { return this.all().filter((m) => !this.away.has(m.id)); }

  /** Everyone at home but `mind`. */
  others(mind: Mind): Mind[] { return this.present().filter((m) => m !== mind); }

  /** The one the player has (a companion stays near them), if any at home. */
  leader(): Mind | null { return this.present().find((m) => m.mode === 'manual') ?? null; }

  /** `from` asks `to` to talk, meeting at these spots for about `gameMinutes`: whether they come. */
  invite(from: Mind, to: ActorId, meetFrom: Vec2, meetTo: Vec2, gameMinutes: number): boolean {
    const other = this.minds.get(to);
    if (!other || this.away.has(to)) return false;
    return other.acceptTalk(from, meetTo, meetFrom, gameMinutes);
  }
}
