// ============================================================================
// heroineVitals.ts -- the heroine's body as numbers: heart rate, breathing,
// stamina, health, food and water.
//
// Joshua, 2026-11-17: "add human stats in like HR, Health, Stamina, Food,
// Water... tie directly to her body so as she eats or drinks it actually makes
// her stomach bigger which makes her belly a little bigger, tie stamina with
// her heart rate".
//
// WHERE THE NUMBERS COME FROM
// The Character Builder already holds a measured model of exactly this, written
// to carry over to any game ("stats and numbers, not game logic"):
//   Char_B/src/actor/vitals.ts   her breath and heartbeat from how hard she is
//                                working and how much energy she has left
//                                (resting 70 beats and 14 breaths a minute, a
//                                woman's peak heart rate by age, what pregnancy
//                                adds, how long she stays winded...)
//   Char_B/src/actor/gut.ts      what she has eaten and drunk moving through
//                                her stomach, and her hunger and thirst
// This file does NOT copy any of those numbers. It runs the builder's own two
// models and adds only what a GAME needs on top (each marked GAME TUNING):
//   - how her speed and her shooting turn into "how hard she is working"
//   - how fast her digestion runs compared with the clock (a mission lasts
//     minutes; a meal takes hours)
//   - sweat, health, and what being tired, hungry or thirsty does to her
//
// It is pure numbers: no 3D, no page. The game steps it once a frame and reads
// the results; her body (breathing rate, belly) and the display read from it.
// ============================================================================
import { ACTIVITY, beatOf, breathOf, pregnancyShare, restingVitals, stepVitals, type Vitals, type VitalsBody, type VitalsNow } from '@charb/actor/vitals';
import { STOMACH } from '@charb/actor/abdominalOrgans';
import { eat as gutEat, gutNeeds, restingGut, stepGut, type GutNeeds, type GutState } from '@charb/actor/gut';

/** Everything about the game's side of her vitals that is a choice, not a measurement. All GAME TUNING. */
export const VITALS_TUNING = {
  /**
   * How hard she is working (0 rest .. 1 her hardest) at each ground speed, metres a second. Between two rows the
   * value is blended. The intensities are the builder's own names (walk 0.3, jog 0.55, run 0.8, sprint 1); the
   * speeds are ordinary ones for a woman on foot, eased down a little for a heavy belly.
   */
  speedToIntensity: [
    [0, ACTIVITY.rest],
    [1.1, ACTIVITY.walk],
    [2.4, ACTIVITY.jog],
    [3.8, ACTIVITY.run],
    [5.5, ACTIVITY.sprint],
  ] as ReadonlyArray<readonly [speed: number, intensity: number]>,
  /** Firing both guns is work too: this much is added to her intensity while she shoots. */
  firingIntensity: 0.1,
  /**
   * Her digestion against the clock: how many hours pass for her stomach in one real second. 1/240 means one
   * minute of play is a quarter of an hour for her gut, so a ten-minute mission is two and a half hours: long
   * enough to get hungry and thirsty by the end, short enough that a snack between waves matters.
   * (Checked by simulation, 2026-11-17: at twice this rate, with heavier sweat, she was parched within four
   * minutes of running and dead of thirst in six. That is a survival game, not this one.)
   */
  gutHoursPerSecond: 1 / 240,
  /** Sweat, millilitres of water an hour (her gut's hours): this much at rest, up to this much at her hardest. */
  sweatMlPerHour: [30, 500] as readonly [rest: number, hardest: number],
  /** She starts a mission having eaten and drunk: this much food and water (mL) is in her at the start. */
  startMeal: [450, 400] as readonly [foodMl: number, waterMl: number],
  /**
   * HER STAMINA, BY PACE (Joshua, 2026-11-17: "anything but walking drains stamina at a specific rate... walking
   * actually gains stamina back but slowly, and faster if not moving"). A fixed rate for each pace, from the moment
   * she is at it: seconds from full to empty (a pace that drains) or from empty to full (one that refills). Between
   * two paces the rate is in between. These are for a heroine who is NOT pregnant; see `pregnant` just below.
   * (The builder's model, used before, built up over half a minute and barely drained below a hard run: too slow.)
   * Her breath and heart still come from the builder's model, which reads this stamina, so she is winded as it runs low.
   */
  stamina: {
    /** [speed m/s (the paces in input/pace.ts), seconds, +1 refills / -1 drains] */
    byPace: [[0, 30, +1], [1.1, 60, +1], [2.4, 120, -1], [3.8, 75, -1], [5.5, 35, -1]] as ReadonlyArray<readonly [number, number, number]>,
    /** Firing drains a little too: this many seconds of firing alone would empty her. */
    firingSeconds: 240,
  },
  /**
   * PREGNANT, SHE TIRES SOONER (real numbers: oxygen use rises 20 to 33% by term, a weight-bearing effort costs more,
   * and her oxygen reserve is smaller in the third trimester). At full effect (from week 36; growing from week 8, the
   * builder's own pregnancy curve) her stamina drains this much faster and refills this much slower.
   */
  pregnant: { drainFaster: 0.3, refillSlower: 0.2 },
  /**
   * WHAT ELSE RAISES HER HEART AND BREATHING (Joshua, 2026-11-17: "what other real life stuff affects the heart rate and
   * breathing?"). Three, each 0..1, each adding to her heart rate (beats a minute) and her breathing (breaths a minute)
   * at full strength, and making her stamina drain faster (a share more) at full strength:
   *   THIRST   her water bar running low. Real: heart rate up 3 to 5 beats a minute for every 1% of body weight lost
   *            as water; a badly dehydrated 4% is about +18, and the same work feels harder.
   *   PAIN     her health below `painFrom` (an injury): real pain makes breathing faster and SHALLOWER, and lifts the heart.
   *   FEAR     danger (a dome section hurt or breached; a hit on her; later, enemies close): adrenaline. It rises within
   *            a couple of seconds and fades over `fearFallSeconds` once the danger passes (real: fast breathing from
   *            fear passes once the fear is gone).
   * GAME TUNING (the sizes for pain and fear are the game's choice: real ones vary a great deal from person to person).
   */
  stress: {
    thirst: { heart: 18, breaths: 3, drain: 0.25 },
    pain: { heart: 15, breaths: 6, drain: 0.1, shallower: 0.25 },
    fear: { heart: 30, breaths: 8, drain: 0.2 },
    painFrom: 90,
    /** Her fear follows the danger quickly (it is what she feels), and fades a little slower once the danger has passed. */
    fearRiseSeconds: 0.5,
    fearFallSeconds: 6,
    /**
     * HER BODY CATCHES UP GRADUALLY (Joshua, 2026-11-17: "gradual over maybe 10-15s with heart rate first in the first
     * 5-7s, and breathing later like 12-15s... to calm down in real life takes almost twice as long, especially if
     * you're really high"). Seconds for each to get most of the way (95%) to where the stress puts it: her heart
     * rises in 6 and her breathing in 13.5; calming down takes twice that, and up to twice as long again when she was
     * at the very top (her heart 12 to 24 s, her breathing 27 to 54 s).
     */
    heartRiseSeconds: 6,
    breathRiseSeconds: 13.5,
    calmTimes: 2,
    calmTimesWhenHigh: 2,
    /** A hit on her frightens her this much at once (a share of full fear for each point of health lost, at most 1). */
    fearPerHealthLost: 0.04,
  },
  /**
   * THE EXERCISE UPGRADE, later (Joshua: "how fast her stamina drains, which could be an upgrade later by exercising"):
   * every drain is multiplied by this. 1 is the table above; fitter, it comes down.
   */
  staminaDrain: 1,
  /** Her belly grows by this many percent points of the builder's belly slider when her stomach is full (and by none when empty). */
  bellyWhenFull: 4,
  health: {
    most: 100,
    /** Health that comes back each second while she is fed and watered (hunger and thirst both under `wellUnder`). */
    regenPerSecond: 0.4,
    wellUnder: 0.6,
    /** Health lost each second while she is starving or parched (the need over `badOver`), at its worst. */
    lossPerSecond: 0.15,
    badOver: 0.85,
    /** Hunger and thirst alone never take her health below this: they weaken her, enemies finish her. */
    needsFloor: 30,
  },
  /**
   * How fast she can move, as a share of her full speed: 1 when fresh. Tiredness, hunger and thirst each take a
   * share off, and she is never slower than `slowest`.
   */
  speed: { tiredFrom: 0.35, tiredCost: 0.35, hungerCost: 0.1, thirstCost: 0.15, slowest: 0.45 },
} as const;

/** What the game tells her vitals each frame. */
export interface VitalsInput {
  /** her ground speed now, metres a second */
  readonly speed: number;
  /** is she shooting this frame? */
  readonly firing: boolean;
  /** how much danger she is in, 0 calm .. 1 terrifying (a breach, enemies close): it frightens her. Left out: none. */
  readonly threat?: number;
}

/** One reading of her vitals, for the display and for her body. */
export interface VitalsReading {
  /** beats a minute */
  readonly heartRate: number;
  /** breaths a minute, and how deep a breath is now (litres) */
  readonly breathsPerMinute: number;
  readonly breathLitres: number;
  /** her breath this instant: 0 all out .. 1 all in (her chest and belly follow this) */
  readonly breath: number;
  /** her heart's squeeze this instant, 0 .. 1 */
  readonly beat: number;
  /** stamina: the energy she has left, 0 empty .. 1 fresh */
  readonly stamina: number;
  /** how hard her body feels it is working, 0 .. 1 (winded stays high after she stops) */
  readonly effort: number;
  /** health, 0 .. 100 */
  readonly health: number;
  /** food and water as "how full", 1 = fed / watered, 0 = starving / parched (the reverse of hunger and thirst) */
  readonly food: number;
  readonly water: number;
  /** what is in her stomach, millilitres (food and water together) */
  readonly stomachMl: number;
  /** how full her stomach is, 0 empty .. 1 full */
  readonly stomach: number;
  /** percent points to ADD to her belly (the builder's 0-200 slider) for what is in her stomach */
  readonly bellyExtra: number;
  /** the share of her full speed she can manage now, `slowest` .. 1 */
  readonly speedShare: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Her working intensity at a ground speed (see VITALS_TUNING.speedToIntensity). */
export function intensityAtSpeed(speed: number): number {
  const table = VITALS_TUNING.speedToIntensity;
  if (speed <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [s1, i1] = table[i];
    if (speed <= s1) {
      const [s0, i0] = table[i - 1];
      return i0 + ((speed - s0) / (s1 - s0)) * (i1 - i0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * How fast her stamina changes at a ground speed, a share of a full bar each second (+ refilling, - draining).
 * @param pregnancy  0 not pregnant .. 1 late pregnancy (VITALS_TUNING.pregnant)
 * @param drain      the exercise upgrade's multiplier on every drain (1 = as tuned)
 */
export function staminaRate(speed: number, firing: boolean, pregnancy: number, drain = 1): number {
  const T = VITALS_TUNING, table = T.stamina.byPace;
  const rateOf = (row: readonly [number, number, number]): number => row[2] / row[1];
  // (the rate at this speed: between the two paces it lies between, or the last one past a sprint)
  let rate = rateOf(table[table.length - 1]);
  if (speed <= table[0][0]) rate = rateOf(table[0]);
  else for (let i = 1; i < table.length; i++) {
    if (speed <= table[i][0]) { const t = (speed - table[i - 1][0]) / (table[i][0] - table[i - 1][0]); rate = rateOf(table[i - 1]) + t * (rateOf(table[i]) - rateOf(table[i - 1])); break; }
  }
  if (firing) rate -= 1 / T.stamina.firingSeconds;
  return rate < 0 ? rate * drain * (1 + T.pregnant.drainFaster * pregnancy) : rate / (1 + T.pregnant.refillSlower * pregnancy);
}

/** The heroine's vitals. Make one per heroine, `step` it every frame, and read `reading`. */
export class HeroineVitals {
  /** The builder's own states: her breath and heart, and her gut. */
  private vitals: Vitals = restingVitals();
  /**
   * How fast her stamina drains against the builder's model, for THIS heroine (it starts at the game's tuning).
   * Exercise will lower it later: fitter, she tires more slowly.
   */
  staminaDrain: number = VITALS_TUNING.staminaDrain;
  /** Her fear now, 0..1 (VITALS_TUNING.stress): rises toward the danger she is in, fades after it. */
  private fear = 0;
  /** What thirst, pain and fear add to her heart (beats a minute) and breathing (breaths a minute) now: they lag behind. */
  private extraBeats = 0;
  private extraBreaths = 0;
  /** How far along her pregnancy is, 0 (not pregnant) to 1 (week 36 on): it makes her tire sooner. */
  private readonly pregnancy: number;
  private gut: GutState = restingGut();
  private health: number = VITALS_TUNING.health.most;
  private now: VitalsNow;
  private needs: GutNeeds;

  /**
   * `body`: her age in years and how many weeks pregnant she is (the builder's vitals add pregnancy's faster
   * heart, deeper breaths and lower staying power from these). Left out, the builder's own defaults are used.
   */
  constructor(private readonly body: VitalsBody = {}) {
    this.pregnancy = pregnancyShare(body.weeks);
    this.now = stepVitals(this.vitals, 0, 0, this.body);
    const [foodMl, waterMl] = VITALS_TUNING.startMeal;
    this.gut = gutEat(this.gut, foodMl, waterMl);
    this.needs = gutNeeds(this.gut);
  }

  /** Move her vitals on by `dt` seconds of play. */
  step(dt: number, input: VitalsInput): void {
    if (dt <= 0) return;
    const tuning = VITALS_TUNING;

    // 1. Her breath and heart: the builder's model, told how hard she is working.
    const intensity = clamp(intensityAtSpeed(input.speed) + (input.firing ? tuning.firingIntensity : 0), 0, 1);
    const stamina = this.vitals.energy;
    this.now = stepVitals(this.vitals, dt, intensity, this.body);
    // Her stamina: the game's own rate for her pace (VITALS_TUNING.stamina), not the builder's. What the builder's
    // step did to it is put back, and the game's change is made instead. (Her breath reads it the next frame.)
    // Thirst, pain and fear (VITALS_TUNING.stress): how strong each is now.
    const st = tuning.stress;
    const threat = clamp(input.threat ?? 0, 0, 1);
    this.fear += (threat - this.fear) * (1 - Math.exp(-dt / (threat > this.fear ? st.fearRiseSeconds : st.fearFallSeconds)));
    const thirst = this.needs.thirst, pain = clamp((st.painFrom - this.health) / st.painFrom, 0, 1), fear = this.fear;
    // ...they make her stamina drain faster
    const drainMore = 1 + st.thirst.drain * thirst + st.pain.drain * pain + st.fear.drain * fear;
    this.vitals.energy = clamp(stamina + staminaRate(input.speed, input.firing, this.pregnancy, this.staminaDrain * drainMore) * dt, 0, 1);
    // ...and lift her heart and her breathing on top of what the work does. Her breath and her heartbeat are moved on
    // by the extra too, so what she shows (the heart on her card, her chest rising) goes at the rate the card says.
    // (each follows where the stress puts it at its own pace: her heart first, her breathing later; calming down
    //  slower, and slower still from the very top. "95% of the way in S seconds" is a time constant of S / 3.)
    const follow = (now: number, want: number, riseSeconds: number, most: number): number => {
      const high = clamp(now / most, 0, 1);
      const seconds = want >= now ? riseSeconds : riseSeconds * st.calmTimes * (1 + (st.calmTimesWhenHigh - 1) * high);
      return now + (want - now) * (1 - Math.exp((-3 * dt) / seconds));
    };
    this.extraBeats = follow(this.extraBeats, st.thirst.heart * thirst + st.pain.heart * pain + st.fear.heart * fear, st.heartRiseSeconds, st.thirst.heart + st.pain.heart + st.fear.heart);
    this.extraBreaths = follow(this.extraBreaths, st.thirst.breaths * thirst + st.pain.breaths * pain + st.fear.breaths * fear, st.breathRiseSeconds, st.thirst.breaths + st.pain.breaths + st.fear.breaths);
    const moreBeats = this.extraBeats, moreBreaths = this.extraBreaths;
    if (moreBeats > 0.01 || moreBreaths > 0.01) {
      const h = clamp(dt, 0, 0.5);
      this.vitals.pulse = (this.vitals.pulse + (h * moreBeats) / 60) % 1;
      this.vitals.cycle = (this.vitals.cycle + (h * moreBreaths) / 60) % 1;
      const shallow = 1 - st.pain.shallower * pain;
      this.now = {
        ...this.now,
        beatsPerMinute: this.now.beatsPerMinute + moreBeats,
        breathsPerMinute: this.now.breathsPerMinute + moreBreaths,
        tidalL: this.now.tidalL * shallow,
        breathL: this.now.breathL * shallow,
        beat: beatOf(this.vitals.pulse),
        breath: breathOf(this.vitals.cycle, this.now.inShare),
      };
    }

    // 2. Her gut: the builder's model, with the clock run faster. Sweat takes water out of her as she works.
    const hours = dt * tuning.gutHoursPerSecond;
    this.gut = stepGut(this.gut, hours);
    const [sweatRest, sweatHard] = tuning.sweatMlPerHour;
    this.gut.waterMl -= (sweatRest + (sweatHard - sweatRest) * this.now.felt) * hours;
    this.needs = gutNeeds(this.gut);

    // 3. Her health: it mends while she is fed and watered, and wears away while she is starving or parched.
    const h = tuning.health;
    const worstNeed = Math.max(this.needs.hunger, this.needs.thirst);
    if (worstNeed > h.badOver) {
      // (only down to the floor: if an enemy has already taken her lower, hunger does not add to it)
      if (this.health > h.needsFloor) this.health = Math.max(h.needsFloor, this.health - h.lossPerSecond * ((worstNeed - h.badOver) / (1 - h.badOver)) * dt);
    } else if (worstNeed < h.wellUnder) this.health += h.regenPerSecond * dt;
    this.health = clamp(this.health, 0, h.most);
  }

  /** She eats and/or drinks: millilitres of food and of water (a snack bar is about 150, a canteen swig 250). */
  consume(foodMl: number, waterMl: number): void {
    this.gut = gutEat(this.gut, Math.max(0, foodMl), Math.max(0, waterMl));
    this.needs = gutNeeds(this.gut);
  }

  /** She is hurt (an enemy's hit) or mended (a med kit): health down or up by `amount`. */
  changeHealth(amount: number): void {
    this.health = clamp(this.health + amount, 0, VITALS_TUNING.health.most);
    // (a hit frightens her at once)
    if (amount < 0) this.fear = Math.min(1, this.fear - amount * VITALS_TUNING.stress.fearPerHealthLost);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Everything the display and her body need, as of the last `step`. */
  get reading(): VitalsReading {
    const tuning = VITALS_TUNING;
    const stomachMl = this.gut.stomachFoodMl + this.gut.stomachWaterMl;
    const stomach = clamp((stomachMl - STOMACH.emptyMl) / (STOMACH.fullMl - STOMACH.emptyMl), 0, 1);
    const s = tuning.speed;
    const tired = clamp((s.tiredFrom - this.vitals.energy) / s.tiredFrom, 0, 1); // 0 until her energy is under `tiredFrom`
    const speedShare = clamp(1 - tired * s.tiredCost - this.needs.hunger * s.hungerCost - this.needs.thirst * s.thirstCost, s.slowest, 1);
    return {
      heartRate: this.now.beatsPerMinute,
      breathsPerMinute: this.now.breathsPerMinute,
      breathLitres: this.now.tidalL,
      breath: this.now.breath,
      beat: this.now.beat,
      stamina: this.vitals.energy,   // (her own, after the game's extra drain)
      effort: this.now.felt,
      health: this.health,
      food: 1 - this.needs.hunger,
      water: 1 - this.needs.thirst,
      stomachMl,
      stomach,
      bellyExtra: stomach * tuning.bellyWhenFull,
      speedShare,
    };
  }
}
