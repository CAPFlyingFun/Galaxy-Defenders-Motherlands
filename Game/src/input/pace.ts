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
// HER BODY HAS A SAY (src/vitals/heroineVitals.ts): she keeps her pace right
// down to empty stamina (no slow fade: Joshua, 2026-11-25); then she stands
// winded, and gets her paces back one by one as her stamina comes back (jog at
// 20% of her pool, run at 30%, sprint at 40%). Hunger and thirst take a share
// off her speed at every pace.
// ============================================================================

/** The four paces and their ground speeds, metres a second (the same speeds her vitals call a walk, jog, run, sprint). */
// (Joshua, 2026-11-20: "let the longer stride carry her about 10% faster": jog, run and sprint are 10% quicker than
//  they were, 2.4, 3.8 and 5.5, now that each stride is longer: heroine/fast/strideShape.ts)
export const PACES = [
  { name: 'WALK', speed: 1.1 },
  { name: 'JOG', speed: 2.64 },
  { name: 'RUN', speed: 4.18 },
  { name: 'SPRINT', speed: 6.05 },
] as const;

/**
 * HER PACES AT FULL TERM (Joshua, 2026-11-17; Blaze at 150%, week 41): walk 2.0 mph, jog 3.5, run 4.9, sprint 7.0
 * (short bursts), in metres a second. From her first visible belly (10% since 2026-11-19) to full term, each pace's top speed goes from
 * PACES to these in a straight line (`Pace.carrying`); research: walking in the third trimester measured about 19%
 * slower, and runners lose about a minute a mile each trimester.
 */
export const PACES_FULL_TERM = [0.894, 1.72, 2.41, 3.44] as const;   // (jog, run, sprint 10% over his 3.5, 4.9, 7.0 mph)

/** Everything about the pace that is a choice. GAME TUNING. */
export const PACE_TUNING = {
  /** Where each ring begins, as a share of the stick's full push: rings 1, 2, 3 and 4. Below the first is the centre. */
  // (even fifths: on the MOVE stick, 100 pixels from middle to edge, each ring is 20 pixels deep)
  ringsFrom: [0.2, 0.4, 0.6, 0.8] as const,
  /** Seconds to change by one whole pace: easing down (ring 1), building slowly (ring 3), building quickly (ring 4). */
  // (Joshua, 2026-11-21: "It feels like driving a semi": 2 / 5 / 2 s took 6 s from a walk to a sprint at the edge and 15
  //  s on ring 3; now about 1.8 s and 4.5 s, as a person picks up pace)
  downSeconds: 0.7,
  slowUpSeconds: 1.5,
  fastUpSeconds: 0.6,
  /** Pushed past what her stamina allows, she drops back a pace in this many seconds. */
  tiredDownSeconds: 1,
  // (Joshua, 2026-11-18: there is no slowing as her stamina runs low any more; at 20% she had already dropped from a
  //  sprint. She keeps her pace right down to empty, then stops at once, as letting go of the stick does.)
  /**
   * OUT OF STAMINA (Joshua, 2026-11-17: "as soon as you run out of stamina, the max speed is walk... after a 5s hold
   * which will prevent any walking"; 10 s, 2026-11-20, bent over with her hands on her knees: main.ts WINDED): at empty
   * she stands WINDED, the MOVE stick doing nothing (looking round, the camera and everything else still work), UNTIL HER
   * BREATHING IS DOWN TO `windedBreathsUp` a minute (Joshua, 2026-11-21: "wait to release her until her breathing is
   * about 28 or lower instead of our 10s so it's more dynamic so it could take 5s or 15s"), at least `windedLeast`
   * seconds (jogging her stamina out barely raises her breathing: 1.5 s, a flash) and at most `windedMost` (fear and a
   * threat add breaths on top, and could keep her bent over all through a fight); then she straightens up over
   * `windedRiseSeconds` (his: "the same 1.5s for consistency", the camera's return). Measured with the game's vitals:
   * a sprint to empty breathes 37 a minute and is down to 28 in 11 s, a run (41) in 15 s.
   * AFTER THAT, HER PACES COME BACK ONE BY ONE (Joshua, 2026-11-25: "Resuming after exhaustion: Jog 20%, run 30%, sprint
   * 40%"): only a walk until her stamina is back to `resumeAt[0]` of her pool (her base x her energy), a jog until
   * `resumeAt[1]`, a run until `resumeAt[2]`; from there everything (so a few points back never flick her from a sprint
   * to a walk and back). With no pool at all (her energy at 0: his straight line, no floor) she can only walk until she
   * has rested.
   */
  windedBreathsUp: 28,
  windedLeast: 5,
  windedMost: 20,
  windedRiseSeconds: 1.5,
  resumeAt: [0.2, 0.3, 0.4] as readonly [jog: number, run: number, sprint: number],
  /** How quickly her real speed follows the pace she is set to, metres a second each second (speeding up, slowing down). */
  speedUp: 6,
  slowDown: 9,
} as const;

/** What her body allows right now (from her vitals). */
export interface PaceLimits {
  /** her stamina, 0 empty .. 1 fresh (a share of her whole pool) */
  readonly stamina: number;
  /** how much of her whole pool she can have now, the same share (her energy); left out, all of it */
  readonly staminaPool?: number;
  /** the share of her full speed she can manage, 0..1 (hunger and thirst) */
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
  /** Out of stamina: true from empty until 40% of her pool is back (after the hold her paces come back one by one). */
  winded = false;
  /** Winded: the fastest pace she has back so far (1 a walk .. 4 a sprint: PACE_TUNING.resumeAt). */
  regained = 4;
  /** Seconds left of the winded hold: above 0 while she is bent over or straightening up (she cannot move at all). While
   * bent over it is the rise still to come plus a moment; straightening up, the seconds left of it. */
  holdLeft = 0;
  /** Winded: seconds she has been bent over, and seconds left straightening up (-1 until she starts to). */
  windedFor = 0;
  riseLeft = -1;
  /** Her breathing when she went winded, a minute (how far it has calmed since: `windedCalm`). */
  private windedFrom = 0;
  /** How far her breathing has calmed since she went winded, 0 (as it was) .. 1 (down to `windedBreathsUp`). */
  windedCalm = 0;
  /**
   * HER STANCE'S LIMITS (Joshua, 2026-11-20: crouching, crawling; heroine/fast/groundPose.ts), set by the game each
   * frame: the highest pace she can be at (1: a walk only) and her top speed, metres a second (0 while she gets down or
   * up). Standing: none.
   */
  levelMost = 4;
  speedMost = Infinity;
  /**
   * THE PLAYER'S TOP PACE (Joshua's handoff, 2026-11-23: "a four-option maximum-speed selector coexists with the
   * existing dynamic ring joystick. At 100% deflection, movement is limited to the selected pace"): 1 walk, 2 jog, 3
   * run, 4 sprint (no limit). The rings work as ever below it; the stick pushed to its edge builds up to it and no
   * further. Lowered while she goes faster, she eases down a pace a second (`tiredDownSeconds`) and her real speed
   * follows as it always does (`slowDown`): no jump. Set by the game each frame (main.ts, `gdm.paceCap`).
   */
  ceiling = 4;

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

    // OUT OF STAMINA: the hold first (the stick does nothing), then her paces back one by one as her stamina comes back
    // (`resumeAt`, shares of her pool). It comes only while she is going somewhere: standing still with an empty pool
    // (her energy at 0) she is not winded, only unable to go faster than a walk.
    const breaths = limits.breathsPerMinute;
    const pool = Math.max(0, Math.min(1, limits.staminaPool ?? 1));
    const back = pool > 0.001 ? limits.stamina / pool : 0;
    // (empty again on a pace she had got back counts too; walking on an empty pool does not)
    const emptied = limits.stamina <= 0.001 && pool > 0.001 && this.level >= 1 && this.holdLeft <= 0;
    if (emptied && (!this.winded || this.regained > 1)) {
      this.winded = true; this.regained = 1; this.windedFor = 0; this.riseLeft = -1; this.holdLeft = t.windedRiseSeconds + 1;
      this.windedFrom = Math.max(t.windedBreathsUp + 1, breaths ?? 0); this.windedCalm = 0;
    }
    // (a pace once back STAYS back until she is empty again: going at it drains her under its mark at once, and she must
    //  not flick back to a walk every time: Joshua, "avoid repeatedly switching... every time a tiny amount regenerates")
    if (this.winded) this.regained = Math.max(this.regained, back >= t.resumeAt[2] ? 4 : back >= t.resumeAt[1] ? 3 : back >= t.resumeAt[0] ? 2 : 1);
    if (this.winded && this.holdLeft <= 0 && this.regained >= 4) this.winded = false;
    if (this.holdLeft > 0) {
      // BENT OVER until her breathing is down (at least windedLeast, at most windedMost seconds), then STRAIGHTENING UP
      this.windedFor += dt;
      if (breaths !== undefined) this.windedCalm = Math.max(this.windedCalm, Math.min(1, Math.max(0, (this.windedFrom - breaths) / (this.windedFrom - t.windedBreathsUp))));
      if (this.riseLeft < 0) {
        const down = breaths === undefined ? this.windedFor >= t.windedLeast * 2 : breaths <= t.windedBreathsUp;
        if ((this.windedFor >= t.windedLeast && down) || this.windedFor >= t.windedMost) this.riseLeft = t.windedRiseSeconds;
        this.holdLeft = t.windedRiseSeconds + 1;
      } else {
        this.riseLeft = Math.max(0, this.riseLeft - dt);
        this.holdLeft = this.riseLeft;
        if (this.riseLeft <= 0) this.riseLeft = -1;
      }
      this.level = 0;
    } else if (this.ring === 0) {
      // the centre: she stops, and starts again from a walk
      this.level = 0;
    } else {
      // any push at all walks her at once
      if (this.level < 1) this.level = 1;
      const was = this.level;
      if (this.ring === 1) this.level = Math.max(1, this.level - dt / t.downSeconds);
      else if (this.ring === 3) this.level += dt / t.slowUpSeconds;
      else if (this.ring === 4) this.level += dt / t.fastUpSeconds;
      // (ring 2 holds)

      // what her stamina allows: everything until it is empty; winded (after the hold), the paces she has the stamina
      // back for (`resumeAt`); no pool at all, a walk; and never past the player's top pace
      const allowed = pool <= 0.001 ? 1 : this.winded ? this.regained : 4;
      const most = Math.min(allowed, this.levelMost, Math.max(1, Math.min(4, this.ceiling)));
      // (over it she eases down from where she WAS, a pace each `tiredDownSeconds`, never building up meanwhile: before,
      //  on the outer ring she built up quicker, a pace each 0.6 s, than she came down, a pace a second, so the limit
      //  crept up and she went past it: found measuring the top pace, `scripts/sim_sprint.ts`; it was so for the walk
      //  only after being winded too)
      if (this.level > most) this.level = Math.max(most, Math.min(this.level, was) - dt / t.tiredDownSeconds);
    }

    // her real speed follows the pace smoothly: nobody is at a sprint the instant she decides to be
    const wanted = Math.min(this.speedMost, this.speedAt(this.level) * Math.max(0, Math.min(1, limits.speedShare)));
    const change = wanted - this.speed;
    const most = (change > 0 ? t.speedUp : t.slowDown) * dt;
    this.speed += Math.max(-most, Math.min(most, change));
  }

  /** She turned right round: she loses a pace (nobody reverses at a full sprint). Never below a walk. */
  turnedBack(): void {
    if (this.level > 1) this.level = Math.max(1, this.level - 1);
  }
}
