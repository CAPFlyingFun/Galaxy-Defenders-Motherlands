// ============================================================================
// pace.ts -- how fast she goes: WALK, JOG, RUN or SPRINT, worked out from how
// far the MOVE stick is pushed. Pure numbers: no page, no 3D.
//
// Joshua, 2026-11-17: "split the movement joystick up in parts or make it
// gradual so full deflection from standing would start walking... if you keep
// holding it forward after maybe 5s you will move into a light jog... then
// running... then sprinting, but also using a lot of energy/stamina... if you
// hold the joystick in the middle it will hold your speed, slightly forward or
// back will change the speed. Maybe split the joystick in like 5 rings."
//
// THE FIVE RINGS, by how far the stick is pushed from its middle (in ANY
// direction: the direction steers her, the distance sets her pace):
//
//   ring 0  the centre        she slows to a stop (also when the stick is let go)
//   ring 1  the inner ring    she eases DOWN a pace, never below a walk
//   ring 2  the middle ring   she HOLDS the pace she has
//   ring 3  the outer-middle  she builds UP slowly  (a pace every 5 seconds)
//   ring 4  the outer ring    she builds UP quickly (a pace every 2 seconds)
//
// So a full push from standing walks at once, then jogs, runs and sprints;
// easing the stick back to the middle ring keeps whatever pace she reached.
//
// HER BODY HAS A SAY (src/vitals/heroineVitals.ts): with little stamina left
// she cannot hold a sprint, then cannot hold a run; and tiredness, hunger and
// thirst take a share off her speed at every pace.
// ============================================================================

/** The four paces and their ground speeds, metres a second (the same speeds her vitals call a walk, jog, run, sprint). */
export const PACES = [
  { name: 'WALK', speed: 1.1 },
  { name: 'JOG', speed: 2.4 },
  { name: 'RUN', speed: 3.8 },
  { name: 'SPRINT', speed: 5.5 },
] as const;

/**
 * HER PACES AT FULL TERM (Joshua, 2026-11-17; Blaze at 150%, week 41): walk 2.0 mph, jog 3.5, run 4.9, sprint 7.0
 * (short bursts), in metres a second. From her first visible belly (25%) to full term, each pace's top speed goes from
 * PACES to these in a straight line (`Pace.carrying`); research: walking in the third trimester measured about 19%
 * slower, and runners lose about a minute a mile each trimester.
 */
export const PACES_FULL_TERM = [0.894, 1.565, 2.19, 3.13] as const;

/** Everything about the pace that is a choice. GAME TUNING. */
export const PACE_TUNING = {
  /** Where each ring begins, as a share of the stick's full push: rings 1, 2, 3 and 4. Below the first is the centre. */
  // (even fifths: on the MOVE stick, 100 pixels from middle to edge, each ring is 20 pixels deep)
  ringsFrom: [0.2, 0.4, 0.6, 0.8] as const,
  /** Seconds to change by one whole pace: easing down (ring 1), building slowly (ring 3), building quickly (ring 4). */
  downSeconds: 2,
  slowUpSeconds: 5,
  fastUpSeconds: 2,
  /** Pushed past what her stamina allows, she drops back a pace in this many seconds. */
  tiredDownSeconds: 1,
  // (Joshua, 2026-11-18: there is no slowing as her stamina runs low any more; at 20% she had already dropped from a
  //  sprint. She keeps her pace right down to empty, then stops at once, as letting go of the stick does.)
  /**
   * OUT OF STAMINA (Joshua, 2026-11-17: "as soon as you run out of stamina, the max speed is walk... after a 5s hold
   * which will prevent any walking"): at empty she stands winded this long, seconds, the MOVE stick doing nothing
   * (looking round, the camera and everything else still work); then she can only walk until her BREATHING is back
   * down to `windedUntilBreaths` a minute (Joshua: "I would raise based on the breathing rate"). 25 is the top of
   * the range a fit adult's breathing is back to a few minutes after hard exercise (15-25 a minute; light exercise is
   * 20-30, resting 12-20: Fitnessenger's breathing-rate table, from Joshua's research), AND her stamina is back to
   * at least `windedUntil` (so she cannot run straight out again; a body that gives no breathing rate goes by this
   * alone).
   */
  windedHoldSeconds: 5,
  windedUntilBreaths: 25,
  windedUntil: 0.15,
  /** How quickly her real speed follows the pace she is set to, metres a second each second (speeding up, slowing down). */
  speedUp: 5,
  slowDown: 9,
} as const;

/** What her body allows right now (from her vitals). */
export interface PaceLimits {
  /** her stamina, 0 empty .. 1 fresh */
  readonly stamina: number;
  /** the share of her full speed she can manage, 0..1 (tiredness, hunger and thirst) */
  readonly speedShare: number;
  /** her breaths a minute, if the game knows them (she has her breath back when it is low again) */
  readonly breathsPerMinute?: number;
}

/** Fresh and fed: no limits. For when the game has no vitals to ask. */
export const NO_LIMITS: PaceLimits = { stamina: 1, speedShare: 1 };

/** Which ring a push of the stick is in: 0 the centre .. 4 the outer ring. `push` is 0 (middle) .. 1 (the edge). */
export function ringOf(push: number): number {
  const from = PACE_TUNING.ringsFrom;
  let ring = 0;
  while (ring < from.length && push >= from[ring]) ring++;
  return ring;
}

export class Pace {
  /**
   * Her pace as one number: 0 standing, 1 a walk, 2 a jog, 3 a run, 4 a sprint, and anywhere in between while she
   * builds up or eases down (2.5 is half way from a jog to a run).
   */
  level = 0;
  /** The ring the stick is in now, 0-4. */
  ring = 0;
  /** Her ground speed now, metres a second. */
  speed = 0;
  /**
   * How far along her pregnancy is by her belly, 0 (her first visible belly) to 1 (full term): each pace's top speed
   * goes from PACES to PACES_FULL_TERM by this. Set by the game each frame (src/main.ts).
   */
  carrying = 0;
  /** Out of stamina: true from empty until her breath is back (walking only, after the hold). */
  winded = false;
  /** Seconds left of the winded hold (she cannot move at all while this is above 0). */
  holdLeft = 0;

  /** The name of the pace she is at (the nearest one), or '' standing. */
  get name(): string {
    if (this.holdLeft > 0) return 'Winded';
    return this.level < 0.5 ? '' : PACES[Math.min(PACES.length - 1, Math.round(this.level) - 1)].name;
  }

  /** One pace's top speed now (0 walk .. 3 sprint), metres a second: slower the further along she is. */
  paceSpeed(index: number): number {
    const c = Math.max(0, Math.min(1, this.carrying));
    return PACES[index].speed + (PACES_FULL_TERM[index] - PACES[index].speed) * c;
  }

  /** The speed that goes with a pace level: the paces' own speeds (as far along as she is), blended in between. */
  speedAt(level: number): number {
    if (level <= 0) return 0;
    if (level <= 1) return this.paceSpeed(0) * level;
    const lower = Math.min(PACES.length - 1, Math.floor(level) - 1), upper = Math.min(PACES.length - 1, lower + 1);
    return this.paceSpeed(lower) + (this.paceSpeed(upper) - this.paceSpeed(lower)) * (level - Math.floor(level));
  }

  /**
   * One frame.
   * @param dt      seconds since the last frame
   * @param push    how far the stick is pushed, 0 (middle) .. 1 (the edge)
   * @param limits  what her body allows (her stamina, her share of full speed)
   */
  step(dt: number, push: number, limits: PaceLimits = NO_LIMITS): void {
    const t = PACE_TUNING;
    this.ring = ringOf(push);

    // OUT OF STAMINA: the hold first (the stick does nothing), then walking only until she has her breath back
    if (!this.winded && limits.stamina <= 0.001) { this.winded = true; this.holdLeft = t.windedHoldSeconds; }
    const breathBack = (limits.breathsPerMinute === undefined || limits.breathsPerMinute <= t.windedUntilBreaths) && limits.stamina >= t.windedUntil;
    if (this.winded && this.holdLeft <= 0 && breathBack) this.winded = false;
    if (this.holdLeft > 0) {
      this.holdLeft = Math.max(0, this.holdLeft - dt);
      this.level = 0;
    } else if (this.ring === 0) {
      // the centre: she stops, and starts again from a walk
      this.level = 0;
    } else {
      // any push at all walks her at once
      if (this.level < 1) this.level = 1;
      if (this.ring === 1) this.level = Math.max(1, this.level - dt / t.downSeconds);
      else if (this.ring === 3) this.level += dt / t.slowUpSeconds;
      else if (this.ring === 4) this.level += dt / t.fastUpSeconds;
      // (ring 2 holds)

      // what her stamina allows: everything until it is empty; winded (after the hold), only a walk
      const most = this.winded ? 1 : 4;
      if (this.level > most) this.level = Math.max(most, this.level - dt / t.tiredDownSeconds);
    }

    // her real speed follows the pace smoothly: nobody is at a sprint the instant she decides to be
    const wanted = this.speedAt(this.level) * Math.max(0, Math.min(1, limits.speedShare));
    const change = wanted - this.speed;
    const most = (change > 0 ? t.speedUp : t.slowDown) * dt;
    this.speed += Math.max(-most, Math.min(most, change));
  }

  /** She turned right round: she loses a pace (nobody reverses at a full sprint). Never below a walk. */
  turnedBack(): void {
    if (this.level > 1) this.level = Math.max(1, this.level - 1);
  }
}
