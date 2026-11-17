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
import { ACTIVITY, restingVitals, stepVitals, type Vitals, type VitalsBody, type VitalsNow } from '@charb/actor/vitals';
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
   * HOW FAST HER STAMINA DRAINS, against the builder's own model (Joshua, 2026-11-17, asked what "double it" meant:
   * "I meant more how fast her stamina drains which could be an upgrade later by exercising"). 2: it drains twice
   * as fast as the builder's model has it; 1 would be the builder's own. Only the DRAIN is changed: it fills again
   * at the builder's own speed. This is the number an exercise upgrade will bring down later (see `staminaDrain`
   * on the vitals themselves, which starts at this).
   */
  staminaDrain: 2,
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

/** The heroine's vitals. Make one per heroine, `step` it every frame, and read `reading`. */
export class HeroineVitals {
  /** The builder's own states: her breath and heart, and her gut. */
  private vitals: Vitals = restingVitals();
  /**
   * How fast her stamina drains against the builder's model, for THIS heroine (it starts at the game's tuning).
   * Exercise will lower it later: fitter, she tires more slowly.
   */
  staminaDrain: number = VITALS_TUNING.staminaDrain;
  private gut: GutState = restingGut();
  private health: number = VITALS_TUNING.health.most;
  private now: VitalsNow;
  private needs: GutNeeds;

  /**
   * `body`: her age in years and how many weeks pregnant she is (the builder's vitals add pregnancy's faster
   * heart, deeper breaths and lower staying power from these). Left out, the builder's own defaults are used.
   */
  constructor(private readonly body: VitalsBody = {}) {
    this.now = stepVitals(this.vitals, 0, 0, this.body);
    const [foodMl, waterMl] = VITALS_TUNING.startMeal;
    this.gut = gutEat(this.gut, foodMl, waterMl);
    this.needs = gutNeeds(this.gut);
  }

  /** Move her vitals on by `dt` seconds of play. */
  step(dt: number, input: VitalsInput): void {
    if (dt <= 0) return;
    const tuning = VITALS_TUNING;

    // 1. Her breath, heart and energy: the builder's model, told how hard she is working.
    const intensity = clamp(intensityAtSpeed(input.speed) + (input.firing ? tuning.firingIntensity : 0), 0, 1);
    const energyBefore = this.vitals.energy;
    this.now = stepVitals(this.vitals, dt, intensity, this.body);
    // Her stamina drains faster than the builder's model has it: whatever the model took this frame is taken that
    // many times over (the builder's code is not ours to change, so the extra is taken here, after its step).
    const drained = energyBefore - this.vitals.energy;
    if (drained > 0 && this.staminaDrain !== 1) this.vitals.energy = clamp(this.vitals.energy - drained * (this.staminaDrain - 1), 0, 1);

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
