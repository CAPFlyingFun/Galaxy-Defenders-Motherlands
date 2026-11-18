// ============================================================================
// burstFire.ts -- her guns fire in short BURSTS (Joshua, 2026-11-17: "1/2/3 -
// wait a second - 1/2/3 instead of like a machine gun, and can even randomize
// the timing of each shot to feel dynamic").
//
// While the trigger is wanted (FIRE held in first person; aimed at a target in
// third person with auto-fire on), she fires a burst of BURST.shots, her two
// guns taking turns, a little apart; then waits about a second; then the next.
// Each gap is drawn at random between its least and most, so no two bursts
// sound alike. A gun that is empty (or put down) is skipped; with both empty
// she does not fire, and the empty one "clicks" (`clicked`, for the display).
// ============================================================================
import type { Hand } from '../core/contracts';

/** GAME TUNING, seconds. */
export const BURST = Object.freeze({
  /** Shots in a burst (both guns together, taking turns). */
  shots: 3,
  /** Between two shots of a burst, and between bursts: each drawn at random between these. */
  shotGap: [0.12, 0.18] as const,
  burstGap: [0.8, 1.2] as const,
});

const between = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

export class BurstFire {
  /** The hand that fires next. */
  next: Hand = 'right';
  /** A gun was empty this frame (the display flashes it). */
  clicked: Hand | null = null;
  private wait = 0;
  private shotsLeft: number = BURST.shots;
  /** A tap of FIRE: one whole burst, even if the finger has already lifted. */
  private pulled = false;

  /** One tap: a whole burst. */
  pull(): void { this.pulled = true; }

  /**
   * One frame.
   * @param wanted  is the trigger wanted now?
   * @param ready   can this hand fire (holds its gun and it has rounds)?
   * @param fire    fire one shot from this hand
   */
  update(dt: number, wanted: boolean, ready: (hand: Hand) => boolean, fire: (hand: Hand) => void): void {
    this.clicked = null;
    this.wait -= dt;
    wanted = wanted || this.pulled;
    if (!wanted) {
      // (let go: the next press starts a fresh burst, as soon as the last gap is over)
      if (this.wait <= 0) this.shotsLeft = BURST.shots;
      return;
    }
    if (this.wait > 0) return;
    // the hand whose turn it is, or the other if it cannot
    let hand = this.next;
    if (!ready(hand)) {
      this.clicked = hand;
      hand = hand === 'right' ? 'left' : 'right';
      if (!ready(hand)) { this.wait = between(BURST.burstGap); this.pulled = false; return; }
    }
    fire(hand);
    this.next = hand === 'right' ? 'left' : 'right';
    this.shotsLeft--;
    if (this.shotsLeft <= 0) { this.shotsLeft = BURST.shots; this.wait = between(BURST.burstGap); this.pulled = false; }
    else this.wait = between(BURST.shotGap);
  }
}
