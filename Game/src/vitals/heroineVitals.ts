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
import { ACTIVITY, STAMINA, beatOf, breathOf, pregnancyShare, restingVitals, stepVitals, type Vitals, type VitalsBody, type VitalsNow } from '@charb/actor/vitals';
import { ABDOMEN_PLACE, RECTUM, STOMACH } from '@charb/actor/abdominalOrgans';
import { BLADDER } from '@charb/actor/pelvicOrgans';
import { eat as gutEat, GUT, gutNeeds, restingGut, stepGut, type GutNeeds, type GutState } from '@charb/actor/gut';

/** Her food bar (0..1) from the food in her stomach, millilitres (VITALS_TUNING.foodBar). */
export function foodBarOf(stomachFoodMl: number): number {
  const room = ABDOMEN_PLACE.stomachRoomMl, most = STOMACH.mostMl, ml = Math.max(0, stomachFoodMl);
  return ml <= room ? 0.5 * (ml / room) : Math.min(1, 0.5 + 0.5 * ((ml - room) / (most - room)));
}

/**
 * Her WATER bar (0..1) from her water balance, millilitres: the water in her body over (or, below 0, under) what she
 * needs, plus what she has just drunk and is still in her stomach (VITALS_TUNING.waterBar). Like the food bar, half is
 * "about normal": balanced. Full is `fullOverMl` to spare (a fresh bottle in her); empty is `emptyUnderMl` short, 2% of
 * her weight, where the builder's thirst is at its strongest.
 */
export function waterBarOf(balanceMl: number): number {
  const w = VITALS_TUNING.waterBar;
  return balanceMl >= 0 ? Math.min(1, 0.5 + 0.5 * (balanceMl / w.fullOverMl)) : Math.max(0, 0.5 * (1 + balanceMl / w.emptyUnderMl));
}

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
    [2.64, ACTIVITY.jog],
    [4.18, ACTIVITY.run],
    // (a SPRINT is 0.9 of her hardest, not the builder's 1: Joshua's handoff of 2026-11-23 asks for 38-44 breaths a
    //  minute 15 s into a sprint and 42-48 at 20 s; at 1, with her effort now climbing in seconds (`effort` below), she
    //  was at the builder's ceiling of 50 from 20 s on. Her heart tops out near 173 instead of 182. Her stamina is the
    //  game's own rate by pace, so this does not change how long a sprint lasts.)
    [6.05, 0.9],
  ] as ReadonlyArray<readonly [speed: number, intensity: number]>,
  /** Firing both guns is work too: this much is added to her intensity while she shoots. */
  firingIntensity: 0.1,
  /**
   * HOW QUICKLY HER BODY CATCHES UP WITH WHAT SHE DOES (Joshua's handoff, 2026-11-23: "a roughly 20-second sprint feels
   * fast, but breathing catches up after movement stops. At exhaustion the display can be around 35 breaths/min instead
   * of the desired 40-50. Recovery currently feels acceptable"). Her EFFORT is the builder's: her body's lag behind the
   * work she does, which her breathing and her heart both read (Char_B/src/actor/vitals.ts `STAMINA.riseS` 30 s to climb
   * most of the way, 63%, and `fallS` 90 s to come back down). The builder is never edited here, so the game sets its own
   * time constants on top (seconds, 63% of the way; null keeps the builder's): before the builder's step moves her effort
   * by its own 30 or 90 s, the game puts it where that step will land it on the game's curve (`step`, 1).
   * RISE 4 s (his doc's starting point was 5-6 s: a time constant is not the time to the top, and the builder's
   * breathing climbs steeply only near her hardest, so 4 s, with a sprint at 0.9, is what lands his targets). FALL kept
   * at the builder's 90 s (his doc: "Keep 90 initially... Do not accelerate recovery just to accelerate exertion").
   * MEASURED with the game's own pace and vitals, a full sprint from rest to empty (`scripts/sim_sprint.ts`):
   *                  5 s   10 s   15 s   20 s   at 0%   stop+10 s   stop+30 s   (breaths a minute)
   *   before         15.5  16.6   18.5   21.3   36.8    28.7        19.1        heart 85 / 151 at 5 s / 0%
   *   now            23.9  37.9   44.1   47.6   50      41.5        24.9        heart 136 / 173
   *   his targets    23-28 32-38  38-44  42-48  40-50
   * So she comes down from a higher peak on the same 90 s: bent over WINDED up to its 20 s most (was about 12 s).
   */
  effort: { riseSeconds: 4 as number | null, fallSeconds: null as number | null },
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
  /**
   * HER FOOD BAR IS HER STOMACH (Joshua, 2026-11-19: "sync up the food stats with the stomach size? Full food = max
   * stomach, half food = about normal, below 1/3 to 1/4, hungry kicks in... sometimes it's really close to 25-30% where I
   * feel my stomach shrinking"). The bar is the food in her stomach: empty 0; at the room her stomach has between her
   * other organs (the builder's ABDOMEN_PLACE.stomachRoomMl, 450 mL, where her belly starts to stand out) half; at the
   * most a stomach holds (STOMACH.mostMl, 1.5 L, her belly at its fullest) full. HUNGER starts under `hungryUnder` of the
   * bar and is at its worst empty. Under half her belly draws IN, up to `shrinkMl` of room at empty (a third of it by 30%).
   */
  foodBar: { hungryUnder: 1 / 3, shrinkMl: 180 },
  /**
   * HER WATER BAR DRAINS (Joshua, 2026-11-19: "does the water drain at all? It seems to always be at max... fluids is
   * what really should be draining the fastest"). It was 1 minus the builder's thirst, which is not felt at all until
   * she is 0.5% of her weight short, so it sat full for hours of game time and the bar told nothing. Now it is her
   * water balance (waterBarOf): it falls from the moment she stops drinking, as her kidneys pass the extra and her skin,
   * breath and sweat lose the rest (about 100 mL an hour at rest, up to 500 more running hard). THIRST (speed, heart,
   * health) starts under `thirstyUnder` of the bar (400 mL short, near the builder's 1% of her weight, 600 mL) and is at
   * its worst empty (1.2 L short, the builder's 2%).
   */
  waterBar: { fullOverMl: 500, emptyUnderMl: 1200, thirstyUnder: 1 / 3 },
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
    byPace: [[0, 30, +1], [1.1, 60, +1], [2.64, 120, -1], [4.18, 75, -1], [6.05, 35, -1]] as ReadonlyArray<readonly [number, number, number]>,
    /**
     * The paces' speeds at FULL TERM (input/pace.ts PACES_FULL_TERM): as she gets further along her paces are slower,
     * so each row's SPEED moves to these (VitalsInput.carrying), and a slow full-term sprint still counts as a sprint.
     * The seconds stay as above; her pregnancy tires her through `pregnant` below, as before (Joshua: "keep what was
     * there").
     */
    speedsFullTerm: [0, 0.894, 1.72, 2.41, 3.44] as ReadonlyArray<number>,
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
    /**
     * WATER BEFORE FOOD (Joshua, 2026-11-19: "You can only survive a few days without water and longer without food"):
     * parched she loses health at the full rate; starving at this share of it. About 3 days against 3 weeks, so a
     * seventh.
     */
    hungerShare: 1 / 7,
    /** Hunger and thirst alone never take her health below this: they weaken her, enemies finish her. */
    needsFloor: 30,
  },
  /**
   * How fast she can move, as a share of her full speed: 1 when fresh. Tiredness, hunger and thirst each take a
   * share off, and she is never slower than `slowest`.
   */
  speed: { tiredFrom: 0.35, tiredCost: 0.35, hungerCost: 0.1, thirstCost: 0.15, slowest: 0.45 },
  /**
   * HER ENERGY, HER TIREDNESS OVER THE DAY (Joshua, 2026-11-21: "adding new stats like energy/effort, adrenaline";
   * "standing still not moving is fine for now to bring the energy back up"). Not her stamina (her wind, seconds to
   * empty and to refill): this goes over hours of her body's clock (gutHoursPerSecond, so the Body clock setting moves
   * it too). Moving, it drains: an ordinary day empties it in `awakeHours`, and work adds a full bar every `hardHours`
   * at her hardest (by her effort SQUARED: a walk costs little on top, a hard run a lot), and late in a pregnancy it
   * drains `pregnantMore` faster. Standing still (no walking, no
   * firing) it comes back, empty to full in `restHours`, until there are beds and sleep. Under `lowFrom` it costs her:
   * her stamina can fill only to `staminaMostAtEmpty` of its bar at empty energy, and her mood drops.
   * At the 15x clock (checked by simulation): 20 real minutes of walking costs about a third of it, 3 minutes of running
   * a tenth; standing still fills it from empty in 12 minutes.
   */
  energy: { awakeHours: 16, hardHours: 8, pregnantMore: 0.3, restHours: 3, lowFrom: 0.5, staminaMostAtEmpty: 0.5 },
  /**
   * ADRENALINE (Joshua, 2026-11-21): fear is the spark, adrenaline what it does to her body. It follows the worst of her
   * fear and a fight (she has fired in the last `fightSeconds`, at `fromFight`) up within `riseSeconds`, jumps on a hit
   * (`perHealthLost` a point), and fades over `fallSeconds` (95%) once they pass: fear can drop in seconds while it is
   * still up. While it is up: her heart and breathing are lifted (`heart`, `breaths` at full), her stamina refills
   * `staminaBack` faster, her pain is dulled by `dullsPain`. As it fades she CRASHES: a full fade costs `crashEnergy` of
   * her energy. GAME TUNING (real adrenaline lasts minutes; how strongly it acts varies a great deal).
   */
  adrenaline: { riseSeconds: 1, fallSeconds: 90, fightSeconds: 3, fromFight: 0.35, perHealthLost: 0.03, heart: 12, breaths: 2, staminaBack: 0.5, dullsPain: 0.6, crashEnergy: 0.12 },
  /**
   * HER MOOD (Joshua, 2026-11-21: "fear/mood"), 0 miserable .. 1 great, from her needs, the way a Sims mood works: full
   * marks less a share for each thing wearing on her at its worst (hunger, thirst, needing the bathroom past half,
   * pain, fear, low energy, being out of breath). It follows them over `seconds` (95%). Shown, and read nowhere else yet.
   */
  mood: { hunger: 0.3, thirst: 0.35, bathroom: 0.2, pain: 0.35, fear: 0.3, tired: 0.25, winded: 0.1, seconds: 12 },
  /**
   * HER BODY TEMPERATURE, degrees C (Joshua, 2026-11-21: "body temperature 🌡️ (heat, the sea, being wet)"): 37 at rest,
   * up to `hardest` working her hardest (a hard run's core heat), down `wet` with her skin wet and up to `water` more in
   * water to her chest (1 m deep). It follows over `riseSeconds` heating and `fallSeconds` cooling (95%). Shown only.
   */
  temperature: { rest: 37, hardest: 38.8, wet: 0.4, water: 1, waterFullAt: 1, riseSeconds: 90, fallSeconds: 150 },
  /**
   * HER BABY PRESSES ON HER BLADDER (Joshua, 2026-11-21): late in a pregnancy her bladder holds this share less (at
   * week 36 on), so the bathroom bar fills, and the urge comes, sooner.
   */
  bladderSqueeze: 0.3,
  /**
   * THE BATHROOM ETA (Joshua, 2026-11-21: "once it gets to 85% full, will show an ETA until you will go regardless of
   * what's going on"): from `etaFrom` full, the real seconds until it is full, from how fast it has been filling
   * (smoothed over `rateSeconds`). At full she goes, whatever she is doing (main.ts).
   */
  bathroomEta: { etaFrom: 0.85, rateSeconds: 8 },
} as const;

/** What the game tells her vitals each frame. */
export interface VitalsInput {
  /** her ground speed now, metres a second */
  readonly speed: number;
  /** is she shooting this frame? */
  readonly firing: boolean;
  /** how much danger she is in, 0 calm .. 1 terrifying (a breach, enemies close): it frightens her. Left out: none. */
  readonly threat?: number;
  /** how far along she is by her belly, 0 (first visible) .. 1 (full term): her paces' speeds (speedsFullTerm). Left out: 0. */
  readonly carrying?: number;
  /** how deep the water is at her feet, metres (0 dry land): it cools her. Left out: 0. */
  readonly waterDepth?: number;
  /** how wet her skin is, 0 dry .. 1 soaked (fresh from the water): it cools her. Left out: 0. */
  readonly wet?: number;
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
  /**
   * How far through this breath she is, 0 .. 1 (0 = she starts breathing in), and the share of it spent breathing in
   * (the builder's 0.4 at rest .. 0.48 at her hardest): her breathing's SOUND follows these (audio/breathSound.ts).
   */
  readonly breathCycle: number;
  readonly breathInShare: number;
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
  /** how far her belly draws in with her stomach nearly empty, millilitres of room (0 from half her food bar up) */
  readonly bellyShrinkMl: number;
  /** how full her stomach is, 0 empty .. 1 full */
  readonly stomach: number;
  /** percent points to ADD to her belly (the builder's 0-200 slider) for what is in her stomach */
  readonly bellyExtra: number;
  /** the share of her full speed she can manage now, `slowest` .. 1 */
  readonly speedShare: number;
  /**
   * THE BATHROOM BAR (Joshua, 2026-11-19: "add a bathroom stat to watch"): how full she is, 0 empty .. 1 can hold no
   * more: her bladder (the builder's 600 mL) or her rectum (300 mL), whichever is fuller.
   */
  readonly bathroom: number;
  /** her need to go: 0 none, 1 the urge (bladder 300 mL, rectum 150 mL), 2 strong (bladder 500 mL, rectum 240 mL) */
  readonly bathroomUrge: 0 | 1 | 2;
  /**
   * Real seconds until she cannot hold it (VITALS_TUNING.bathroomEta): from 85% full while it is filling; 0 once full;
   * null below 85% or while it is not filling.
   */
  readonly bathroomEta: number | null;
  /** her energy over the day, 0 exhausted .. 1 rested (VITALS_TUNING.energy) */
  readonly energy: number;
  /** her fear, 0 calm .. 1 terrified */
  readonly fear: number;
  /** her adrenaline, 0 .. 1 (VITALS_TUNING.adrenaline) */
  readonly adrenaline: number;
  /** her mood, 0 miserable .. 1 great (VITALS_TUNING.mood) */
  readonly mood: number;
  /** her body temperature, degrees C */
  readonly temperature: number;
  /** how much she hurts (after adrenaline dulls it), how hungry and how thirsty she is: each 0 none .. 1 worst */
  readonly pain: number;
  readonly hunger: number;
  readonly thirst: number;
}

/** The bathroom bar and her urge, from what is in her bladder and rectum (the builder's thresholds). */
/**
 * HOW LONG A BATHROOM VISIT TAKES, seconds (Joshua, 2026-11-22: food 12 s, water 5 s; it was 10 s for either: "someone
 * rarely ever goes in 5s, lol", 2026-11-21, when it was 5 for either). GAME TUNING.
 */
export const BATHROOM_VISIT = { bladderSeconds: 5, bowelSeconds: 12 } as const;

export function bathroomOf(bladderMl: number, rectumMl: number, squeeze = 0): { fill: number; urge: 0 | 1 | 2 } {
  // (her baby presses on her bladder: it holds `squeeze` less, and every mark on it comes that much sooner)
  const room = 1 - clamp(squeeze, 0, 0.9);
  const fill = clamp(Math.max(bladderMl / (BLADDER.mostMl * room), rectumMl / RECTUM.mostMl), 0, 1);
  // (the bladder's urge starts at 300 mL and is at its strongest by 500; the rectum's at 150, strongest by 1.6 times
  //  that, as the builder's gutNeeds reads them)
  const strong = bladderMl >= BLADDER.urgeMl[1] * room || rectumMl >= RECTUM.urgeMl * 1.6;
  const urge = strong ? 2 : bladderMl >= BLADDER.urgeMl[0] * room || rectumMl >= RECTUM.urgeMl ? 1 : 0;
  return { fill, urge };
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

/** A little over walking speed still counts as walking (her speed eases up to a pace and wavers about it). */
const WALK_LEEWAY = 1.05;

/**
 * How fast her stamina changes at a ground speed, a share of a full bar each second (+ refilling, - draining).
 * @param pregnancy  0 not pregnant .. 1 late pregnancy (VITALS_TUNING.pregnant)
 * @param drain      the exercise upgrade's multiplier on every drain (1 = as tuned)
 */
export function staminaRate(speed: number, firing: boolean, pregnancy: number, drain = 1, carrying: number | null = null): number {
  const T = VITALS_TUNING;
  // (each pace's speed as far along as she is: the same seconds, at her slower paces)
  const c = carrying === null ? 0 : Math.max(0, Math.min(1, carrying));
  const table: ReadonlyArray<readonly [number, number, number]> = c > 0
    ? T.stamina.byPace.map((row, i) => [row[0] + (T.stamina.speedsFullTerm[i] - row[0]) * c, row[1], row[2]] as const)
    : T.stamina.byPace;
  const rateOf = (row: readonly [number, number, number]): number => row[2] / row[1];
  // (the rate at this speed: between the two paces it lies between, or the last one past a sprint)
  let rate = rateOf(table[table.length - 1]);
  if (speed <= table[0][0]) rate = rateOf(table[0]);
  else if (speed > table[1][0] * WALK_LEEWAY && speed <= table[2][0]) {
    // ANYTHING FASTER THAN A WALK DRAINS, at the jog's rate at least (Joshua's table: walking refills, a jog and up
    // drain). Blended from the walk's refill to the jog's drain, a tired "jog" just over walking speed still refilled
    // a little: her stamina never reached empty, and she never stopped winded (Joshua, 2026-11-18).
    rate = rateOf(table[2]);
  } else for (let i = 1; i < table.length; i++) {
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
  private pregnancy: number;
  private gut: GutState = restingGut();
  private health: number = VITALS_TUNING.health.most;
  private now: VitalsNow;
  private needs: GutNeeds;
  /** Her energy over the day (VITALS_TUNING.energy), 0..1. (Not `vitals.energy`: that is the builder's name for her stamina.) */
  private dayEnergy = 1;
  /** Her adrenaline, 0..1, and the seconds left of "in a fight" since she last fired. */
  private adrenaline = 0;
  private fightLeft = 0;
  /** Her mood, 0..1, and her body temperature, degrees C. */
  private mood = 1;
  private temperature: number = VITALS_TUNING.temperature.rest;
  /** Her pain this step (dulled by adrenaline), for the reading. */
  private pain = 0;
  /** The bathroom bar last step, and how fast it has been filling (a share a real second, smoothed). */
  private lastBathroom = -1;
  private bathroomRate = 0;

  /**
   * `body`: her age in years and how many weeks pregnant she is (the builder's vitals add pregnancy's faster
   * heart, deeper breaths and lower staying power from these). Left out, the builder's own defaults are used.
   */
  constructor(private body: VitalsBody = {}) {
    this.pregnancy = pregnancyShare(body.weeks);
    this.now = stepVitals(this.vitals, 0, 0, this.body);
    const [foodMl, waterMl] = VITALS_TUNING.startMeal;
    this.gut = gutEat(this.gut, foodMl, waterMl);
    this.needs = this.gameNeeds();
  }

  /**
   * HOW MANY WEEKS PREGNANT she is now (0: not pregnant): Settings and story steps change it while she plays
   * (heroine/pregnancyPlan.ts). Her heart, breathing and staying power follow from the next step.
   */
  setWeeks(weeks: number): void {
    if (weeks === (this.body.weeks ?? 0)) return;
    this.body = { ...this.body, weeks };
    this.pregnancy = pregnancyShare(weeks);
  }

  /**
   * HER EFFORT ON THE GAME'S OWN CURVE (VITALS_TUNING.effort). The builder's step moves her effort toward the work she
   * does by a share k of the way (k = 1 - e^(-dt / its 30 or 90 s)). To land it where the game's time constant would
   * have it this frame (`target`), it is first set to the one place from which that share lands there:
   *   target = before + (work - before) * k   so   before = (target - work * k) / (1 - k).
   * That place is always between where it was and the target, on the same side of the work, so the builder's step takes
   * the same direction (rising or falling) the game meant. Nothing else of the builder's model is touched.
   */
  private leadEffort(dt: number, work: number): void {
    const { riseSeconds, fallSeconds } = VITALS_TUNING.effort;
    const e = this.vitals.effort;
    if (!Number.isFinite(e) || work === e) return;
    const rising = work > e;
    const ours = rising ? riseSeconds : fallSeconds;
    if (ours === null) return;
    const h = clamp(dt, 0, 0.5);   // (the builder's step holds a frame to half a second too)
    const theirs = rising ? STAMINA.riseS : STAMINA.fallS;
    const target = e + (work - e) * (1 - Math.exp(-h / ours));
    const k = 1 - Math.exp(-h / theirs);
    this.vitals.effort = (target - work * k) / (1 - k);
  }

  /** Move her vitals on by `dt` seconds of play. */
  step(dt: number, input: VitalsInput): void {
    if (dt <= 0) return;
    const tuning = VITALS_TUNING;

    // 1. Her breath and heart: the builder's model, told how hard she is working.
    const intensity = clamp(intensityAtSpeed(input.speed) + (input.firing ? tuning.firingIntensity : 0), 0, 1);
    const stamina = this.vitals.energy;
    this.leadEffort(dt, intensity);
    this.now = stepVitals(this.vitals, dt, intensity, this.body);
    // Her stamina: the game's own rate for her pace (VITALS_TUNING.stamina), not the builder's. What the builder's
    // step did to it is put back, and the game's change is made instead. (Her breath reads it the next frame.)
    // Thirst, pain and fear (VITALS_TUNING.stress): how strong each is now.
    const st = tuning.stress;
    const threat = clamp(input.threat ?? 0, 0, 1);
    this.fear += (threat - this.fear) * (1 - Math.exp(-dt / (threat > this.fear ? st.fearRiseSeconds : st.fearFallSeconds)));
    // ADRENALINE (VITALS_TUNING.adrenaline): up toward the worst of her fear and a fight, quickly; down slowly. As it
    // comes down she crashes: her energy pays for it.
    const ad = tuning.adrenaline;
    this.fightLeft = input.firing ? ad.fightSeconds : Math.max(0, this.fightLeft - dt);
    const adWant = Math.max(this.fear, this.fightLeft > 0 ? ad.fromFight : 0);
    const adWas = this.adrenaline;
    this.adrenaline += (adWant - this.adrenaline) * (1 - Math.exp((-3 * dt) / (adWant > this.adrenaline ? ad.riseSeconds : ad.fallSeconds)));
    if (this.adrenaline < adWas) this.dayEnergy = Math.max(0, this.dayEnergy - (adWas - this.adrenaline) * ad.crashEnergy);
    // (her pain, dulled while her adrenaline is up)
    const thirst = this.needs.thirst, fear = this.fear;
    const pain = clamp((st.painFrom - this.health) / st.painFrom, 0, 1) * (1 - ad.dullsPain * this.adrenaline);
    this.pain = pain;
    // ...they make her stamina drain faster
    const drainMore = 1 + st.thirst.drain * thirst + st.pain.drain * pain + st.fear.drain * fear;
    let rate = staminaRate(input.speed, input.firing, this.pregnancy, this.staminaDrain * drainMore, input.carrying ?? null);
    if (rate > 0) rate *= 1 + ad.staminaBack * this.adrenaline;   // (adrenaline: her wind comes back faster)
    // HER ENERGY (VITALS_TUNING.energy): low, her stamina cannot fill all the way
    const en = tuning.energy;
    const staminaMost = this.dayEnergy >= en.lowFrom ? 1 : en.staminaMostAtEmpty + (1 - en.staminaMostAtEmpty) * (this.dayEnergy / en.lowFrom);
    // (refilling stops at that most; stamina already above it is not taken away, it just drains as usual)
    this.vitals.energy = clamp(rate > 0 ? Math.min(stamina + rate * dt, Math.max(staminaMost, stamina)) : stamina + rate * dt, 0, 1);
    // ...and lift her heart and her breathing on top of what the work does. Her breath and her heartbeat are moved on
    // by the extra too, so what she shows (the heart on her card, her chest rising) goes at the rate the card says.
    // (each follows where the stress puts it at its own pace: her heart first, her breathing later; calming down
    //  slower, and slower still from the very top. "95% of the way in S seconds" is a time constant of S / 3.)
    const follow = (now: number, want: number, riseSeconds: number, most: number): number => {
      const high = clamp(now / most, 0, 1);
      const seconds = want >= now ? riseSeconds : riseSeconds * st.calmTimes * (1 + (st.calmTimesWhenHigh - 1) * high);
      return now + (want - now) * (1 - Math.exp((-3 * dt) / seconds));
    };
    const adr = this.adrenaline;
    this.extraBeats = follow(this.extraBeats, st.thirst.heart * thirst + st.pain.heart * pain + st.fear.heart * fear + ad.heart * adr, st.heartRiseSeconds, st.thirst.heart + st.pain.heart + st.fear.heart + ad.heart);
    this.extraBreaths = follow(this.extraBreaths, st.thirst.breaths * thirst + st.pain.breaths * pain + st.fear.breaths * fear + ad.breaths * adr, st.breathRiseSeconds, st.thirst.breaths + st.pain.breaths + st.fear.breaths + ad.breaths);
    // (never past the most a heart of her age can beat: about 220 less her age, 192 at 28. Fear on top of a sprint
    //  would otherwise show a number no real heart reaches.)
    const moreBeats = Math.min(this.now.beatsPerMinute + this.extraBeats, 220 - (this.body.age ?? 28)) - this.now.beatsPerMinute;
    const moreBreaths = this.extraBreaths;
    if (Math.abs(moreBeats) > 0.01 || moreBreaths > 0.01) {
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
    const hours = dt * this.gutHoursPerSecond;
    this.gut = stepGut(this.gut, hours);
    const [sweatRest, sweatHard] = tuning.sweatMlPerHour;
    this.gut.waterMl -= (sweatRest + (sweatHard - sweatRest) * this.now.felt) * hours;
    this.needs = this.gameNeeds();

    // 2b. HER ENERGY over the day: drains moving (more working hard, more late in a pregnancy), comes back standing still.
    const still = input.speed < 0.1 && !input.firing;
    if (still) this.dayEnergy += hours / en.restHours;
    else this.dayEnergy -= hours * (1 / en.awakeHours + (this.now.felt * this.now.felt) / en.hardHours) * (1 + en.pregnantMore * this.pregnancy);
    this.dayEnergy = clamp(this.dayEnergy, 0, 1);

    // 2c. HER BODY TEMPERATURE: warmed by work, cooled by wet skin and water
    const tt = tuning.temperature;
    const tempWant = tt.rest + (tt.hardest - tt.rest) * this.now.felt - tt.wet * clamp(input.wet ?? 0, 0, 1)
      - tt.water * clamp((input.waterDepth ?? 0) / tt.waterFullAt, 0, 1);
    this.temperature += (tempWant - this.temperature) * (1 - Math.exp((-3 * dt) / (tempWant > this.temperature ? tt.riseSeconds : tt.fallSeconds)));

    // 2d. THE BATHROOM: how fast it is filling (for its ETA)
    const fillNow = this.bathroomNow().fill;
    if (this.lastBathroom >= 0) {
      // (she has just gone, or a test has set her bladder: a jump, not filling. Start again from here.)
      //  The first rate measured after it is taken as it is, then smoothed: -1 marks "not measured yet".)
      const inst = (fillNow - this.lastBathroom) / dt;
      if (Math.abs(fillNow - this.lastBathroom) > 0.02) this.bathroomRate = -1;
      else if (this.bathroomRate < 0) this.bathroomRate = inst;
      else this.bathroomRate += (inst - this.bathroomRate) * (1 - Math.exp(-dt / tuning.bathroomEta.rateSeconds));
    }
    this.lastBathroom = fillNow;

    // 2e. HER MOOD: full marks less what wears on her (VITALS_TUNING.mood)
    const md = tuning.mood;
    const tired = clamp((en.lowFrom - this.dayEnergy) / en.lowFrom, 0, 1);
    const winded = clamp((0.2 - this.vitals.energy) / 0.2, 0, 1);
    const pressing = clamp((fillNow - 0.5) / 0.5, 0, 1);
    const moodWant = clamp(1 - md.hunger * this.needs.hunger - md.thirst * this.needs.thirst - md.bathroom * pressing
      - md.pain * pain - md.fear * fear - md.tired * tired - md.winded * winded, 0, 1);
    this.mood += (moodWant - this.mood) * (1 - Math.exp((-3 * dt) / md.seconds));

    // 3. Her health: it mends while she is fed and watered, and wears away while she is starving or parched.
    const h = tuning.health;
    const worstNeed = Math.max(this.needs.hunger, this.needs.thirst);
    // (how far past `badOver` each need is, 0..1; thirst counts in full, hunger as `hungerShare` of it)
    const past = (need: number) => clamp((need - h.badOver) / (1 - h.badOver), 0, 1);
    const wearing = past(this.needs.thirst) + h.hungerShare * past(this.needs.hunger);
    if (wearing > 0) {
      // (only down to the floor: if an enemy has already taken her lower, hunger and thirst do not add to it)
      if (this.health > h.needsFloor) this.health = Math.max(h.needsFloor, this.health - h.lossPerSecond * Math.min(1, wearing) * dt);
    } else if (worstNeed < h.wellUnder) this.health += h.regenPerSecond * dt;
    this.health = clamp(this.health, 0, h.most);
  }

  /**
   * HER BODY'S CLOCK: hours that pass for her stomach and gut in one real second (VITALS_TUNING.gutHoursPerSecond to
   * start). Settings -> FOOD & DRINK -> Body clock changes it to test (Joshua, 2026-11-19: "real life 1 hour is 6 hours
   * in the game" is 6 / 3600).
   */
  gutHoursPerSecond: number = VITALS_TUNING.gutHoursPerSecond;

  /** What is in her now, millilitres: her stomach (food, water), her bladder (for the readout and the tests). */
  get contents(): { readonly foodMl: number; readonly waterMl: number; readonly bladderMl: number } {
    return { foodMl: this.gut.stomachFoodMl, waterMl: this.gut.stomachWaterMl, bladderMl: this.gut.bladderMl };
  }

  /** TEST: her food bar down to `bar` (0..1) at once: her stomach's food set to what that bar is, nothing on its way. */
  setFoodBar(bar: number): void {
    const room = ABDOMEN_PLACE.stomachRoomMl, most = STOMACH.mostMl, b = clamp(bar, 0, 1);
    this.gut = { ...this.gut, stomachFoodMl: b <= 0.5 ? (b / 0.5) * room : room + ((b - 0.5) / 0.5) * (most - room), intestineMl: 0 };
    this.needs = this.gameNeeds();
  }

  /** TEST: her water bar down to `bar` (0..1) at once: as short of water as the builder's gut makes that thirst. */
  setWaterBar(bar: number): void {
    // (waterBarOf turned round: the balance that reads as this bar, with nothing left in her stomach)
    const w = VITALS_TUNING.waterBar, b = clamp(bar, 0, 1);
    const balance = b >= 0.5 ? ((b - 0.5) / 0.5) * w.fullOverMl : (b / 0.5 - 1) * w.emptyUnderMl;
    this.gut = { ...this.gut, waterMl: balance, stomachWaterMl: 0 };
    this.needs = this.gameNeeds();
  }

  /** Her bladder set to `ml` millilitres (to test the bathroom bar: Settings -> FOOD & DRINK -> Need to go / Must go now). */
  setBladder(ml: number): void {
    this.gut = { ...this.gut, bladderMl: clamp(ml, 0, BLADDER.mostMl) };
    this.needs = this.gameNeeds();
  }

  /** Her rectum set to `ml` millilitres (to test a bowel visit: Settings -> FOOD & DRINK -> Need to go #2). */
  setRectum(ml: number): void {
    this.gut = { ...this.gut, rectumMl: clamp(ml, 0, RECTUM.mostMl) };
    this.needs = this.gameNeeds();
  }

  /** She uses the bathroom: her bladder emptied (and her rectum, if she needed to go). */
  relieve(bowels = true): void {
    // (her bladder always; her bowels only on a visit for them: `bathroomVisit`)
    this.gut = { ...this.gut, bladderMl: 0, rectumMl: bowels ? 0 : this.gut.rectumMl };
    this.bathroomRate = -1;
    this.needs = this.gameNeeds();
  }

  /**
   * WHAT A BATHROOM VISIT IS NOW, AND HOW LONG IT TAKES (Joshua, 2026-11-22: "food ends up being longer relieving oneself
   * 🚽 (make it 12s), and the water 💧 quicker at 5s"): once her rectum is at its urge (the builder's RECTUM.urgeMl,
   * 150 mL) it is her bowels too, BATHROOM_VISIT.bowelSeconds, and both are emptied; otherwise only her bladder,
   * BATHROOM_VISIT.bladderSeconds. Asked as she squats; `relieve(bowels)` as she gets up.
   */
  bathroomVisit(): { seconds: number; bowels: boolean } {
    const bowels = this.gut.rectumMl >= RECTUM.urgeMl;
    return { seconds: bowels ? BATHROOM_VISIT.bowelSeconds : BATHROOM_VISIT.bladderSeconds, bowels };
  }

  /** She eats and/or drinks: millilitres of food and of water (a snack bar is about 150, a canteen swig 250). */
  consume(foodMl: number, waterMl: number): void {
    this.gut = gutEat(this.gut, Math.max(0, foodMl), Math.max(0, waterMl));
    this.needs = this.gameNeeds();
  }

  /** She is hurt (an enemy's hit) or mended (a med kit): health down or up by `amount`. */
  changeHealth(amount: number): void {
    this.health = clamp(this.health + amount, 0, VITALS_TUNING.health.most);
    // (a hit frightens her at once)
    if (amount < 0) {
      this.fear = Math.min(1, this.fear - amount * VITALS_TUNING.stress.fearPerHealthLost);
      // (and her adrenaline jumps at once)
      this.adrenaline = Math.min(1, this.adrenaline - amount * VITALS_TUNING.adrenaline.perHealthLost);
    }
  }

  /** The bathroom bar and her urge now, her baby's press on her bladder included. */
  private bathroomNow(): { fill: number; urge: 0 | 1 | 2 } {
    return bathroomOf(this.gut.bladderMl, this.gut.rectumMl, VITALS_TUNING.bladderSqueeze * this.pregnancy);
  }

  /** TEST: her energy set to `share` (0..1) at once (Settings -> FOOD & DRINK -> Make tired). */
  setEnergy(share: number): void { this.dayEnergy = clamp(share, 0, 1); }

  /**
   * Her hunger and thirst. Thirst as the builder's gut has it; HUNGER from her food bar (Joshua: hungry below a third of
   * it): 0 above `hungryUnder`, rising to 1 at empty.
   */
  private gameNeeds(): GutNeeds {
    const needs = gutNeeds(this.gut);
    const bar = foodBarOf(this.gut.stomachFoodMl), under = VITALS_TUNING.foodBar.hungryUnder;
    const water = waterBarOf(this.gut.waterMl + this.gut.stomachWaterMl), dry = VITALS_TUNING.waterBar.thirstyUnder;
    return { ...needs, hunger: clamp((under - bar) / under, 0, 1), thirst: clamp((dry - water) / dry, 0, 1) };
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
    const bath = this.bathroomNow();
    return {
      heartRate: this.now.beatsPerMinute,
      breathsPerMinute: this.now.breathsPerMinute,
      breathLitres: this.now.tidalL,
      breath: this.now.breath,
      breathCycle: this.vitals.cycle,
      breathInShare: this.now.inShare,
      beat: this.now.beat,
      stamina: this.vitals.energy,   // (her own, after the game's extra drain)
      effort: this.now.felt,
      health: this.health,
      food: foodBarOf(this.gut.stomachFoodMl),
      water: waterBarOf(this.gut.waterMl + this.gut.stomachWaterMl),
      stomachMl,
      bellyShrinkMl: VITALS_TUNING.foodBar.shrinkMl * clamp((0.5 - foodBarOf(this.gut.stomachFoodMl)) / 0.5, 0, 1),
      stomach,
      bellyExtra: stomach * tuning.bellyWhenFull,
      speedShare,
      bathroom: bath.fill,
      bathroomUrge: bath.urge,
      bathroomEta: bath.fill >= 0.999 ? 0 : bath.fill >= tuning.bathroomEta.etaFrom && this.bathroomRate > 1e-6 ? (1 - bath.fill) / this.bathroomRate : null,
      energy: this.dayEnergy,
      fear: this.fear,
      adrenaline: this.adrenaline,
      mood: this.mood,
      temperature: this.temperature,
      pain: this.pain,
      hunger: this.needs.hunger,
      thirst: this.needs.thirst,
    };
  }
}
