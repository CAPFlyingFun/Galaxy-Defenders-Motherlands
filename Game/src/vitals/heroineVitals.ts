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
// This file does NOT copy any of those numbers. It runs the builder's own
// breathing (her lungs) and gut, and adds what a GAME needs on top (each marked
// GAME TUNING):
//   - SINCE v0.2.174 the chain from what she does to how she tires (Joshua's
//     decisions of 2026-11-25, VITALS_TUNING's first entry): her workload, her
//     capacity, her relative effort, her stamina and her energy, and the
//     exertion her breathing and heart follow
//   - how fast her digestion runs compared with the clock (a mission lasts
//     minutes; a meal takes hours)
//   - sweat, health, and what being tired, hungry or thirsty does to her
//
// It is pure numbers: no 3D, no page. The game steps it once a frame and reads
// the results; her body (breathing rate, belly) and the display read from it.
// ============================================================================
import { PREGNANT_BREATH, STAMINA, beatOf, breathOf, heartDefault, lungsDefault, peakHeart, pregnancyShare, readHeart, readLungs, restingVitals, vitalsFor, type Vitals, type VitalsBody, type VitalsNow } from '@charb/actor/vitals';
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
   * THE MODEL, v0.2.174 (Joshua's decisions of 2026-11-25, worked out in the "GDM Physiology Design Review" doc with
   * ChatGPT's help). One chain, worked out in this order every frame, nothing reading back up it:
   *   her speed, the slope and what she carries  -> her WORKLOAD (what her body is doing; the same for anyone)
   *   her fitness, thirst, pain, pregnancy, heat, adrenaline -> her CAPACITY (how much she can do)
   *   RELATIVE EFFORT = workload / capacity -> her STAMINA's rate; it is what the Effort stat shows
   *   her EXERTION (her body catching up with that effort, and coming back down after) -> her BREATHING and HEART
   *   the stamina she has spent -> quicker breathing (one way only: her breathing never drives her stamina)
   *   her ENERGY -> how big her stamina pool is; her workload spends energy, rest gives it back
   *
   * WORKLOAD by her ground speed, metres a second: a share of what a fresh heroine at starting fitness does at her
   * hardest, blended between rows (on past the last along its slope). The rows are the paces (input/pace.ts PACES: a
   * walk 2.5 mph, jog 5.9, run 9.4, sprint 13.5) at the builder's own names for them (walk 0.3, jog 0.55 -> 0.6, run
   * 0.8, sprint 1). Her slower paces late in a pregnancy are slower speeds, so they are less work; her pregnancy is
   * counted in its weight and her capacity instead.
   */
  workBySpeed: [[0, 0], [1.1, 0.3], [2.64, 0.6], [4.18, 0.8], [6.05, 1]] as ReadonlyArray<readonly [speed: number, work: number]>,
  /** Firing both guns is work too: this much is added while she shoots. */
  firingWork: 0.1,
  /**
   * HILLS, from the ACSM metabolic equations (walking oxygen use = 0.1 x speed + 1.8 x speed x grade + 3.5, running 0.2
   * x speed + 0.9 x speed x grade + 3.5, speed in metres a minute; https://pacompendium.com/unite-conversions): uphill a
   * walk costs 1 + `walkUp` x the grade times as much, a run (from `runFrom` m/s, 5 mph) 1 + `runUp` x the grade;
   * downhill 1 + `down` x the grade (it is below 0 there), never under `least`. The grade is rise over distance (5% is
   * 0.05). So a walk up a 10% slope is about a jog's work, and a jog up 5% is about a run's.
   */
  hill: { walkUp: 12, runUp: 4.2, down: 2, least: 0.75, runFrom: 2.24 },
  /** Her pregnancy's weight at full term, kilograms, carried as a load: workload x (her body + the load) / her body. */
  pregnantKg: 12,
  /**
   * CAPACITY (1 = a fresh heroine at starting fitness): (`fitnessLeast` + `fitnessGain` x her fitness) x (1 - `thirst` x
   * her thirst) x (1 - `pain` x her pain) x (1 - `pregnancy` x her pregnancy) x (1 + `adrenaline` x her adrenaline),
   * and `heatPerDegree` off for each degree of her body over `heatFrom` C. Each condition is counted HERE and nowhere
   * else (before, thirst, pain, fear and pregnancy each multiplied her stamina's drain: together 2.15 times).
   */
  capacity: { fitnessLeast: 0.95, fitnessGain: 0.25, thirst: 0.12, pain: 0.25, pregnancy: 0.2, adrenaline: 0.1, heatFrom: 38.5, heatPerDegree: 0.1 },
  /**
   * HER STAMINA BY HER RELATIVE EFFORT, points a second of a 100-point pool (+ refills, - drains), blended between rows,
   * on past the last along its slope. At starting fitness on flat ground: standing +2.2 (full in 45 s) and walking
   * +1.1 (91 s), Joshua's; none at 0.55; a jog -0.21 (7:56 from full), a run -0.83 (2:00), a sprint -2.5 (40 s), his
   * pick of the three; harder still (a sprint uphill, hurt) -5 at 1.3. A hill, a load, low fitness, thirst, pain and
   * her pregnancy all move her along this one curve.
   */
  staminaByEffort: [[0, 2.2], [0.3, 1.1], [0.55, 0], [0.6, -0.21], [0.8, -0.83], [1, -2.5], [1.3, -5]] as ReadonlyArray<readonly [effort: number, perSecond: number]>,
  /** Her stamina pool, points, before her energy and the Endurance upgrade (the curve above is for 100). */
  staminaPoints: 100,
  /**
   * HER EXERTION: her body catching up with her relative effort, and coming back down after it (what her breathing and
   * heart read). UP: 95% of the way in `breathUpPerMph` seconds for each mph of her speed (Joshua: "one second per mph":
   * a sprint 13.5 s), her heart in `heartUpPerMph` (2 s per mph, between v0.2.172's 136 beats 5 s into a sprint and the
   * shelved v0.2.173's 99), never quicker than `quickest` seconds (95%). It chases from wherever it is, so going from a
   * jog to a sprint does not start over. DOWN: 63% of the way in `breathDown` seconds and her heart in `heartDown`, each
   * [no fitness, full fitness] (at starting fitness 37 s and 135 s: real recovery data has a woman's heart about 28 beats
   * lower a minute after hard work, 51 after two). While her pool is refilling she stays at least `winded` x the share
   * of it she has spent (the builder's own STAMINA.winded), so she calms as she gets her wind back. At most `most`.
   */
  exertion: { breathUpPerMph: 1, heartUpPerMph: 2, quickest: 1.5, breathDown: [40, 25] as readonly [number, number], heartDown: [150, 75] as readonly [number, number], winded: 0.6, most: 1.15 },
  /**
   * HER BREATHING, JOSHUA'S PLAN B (v0.2.175, 2026-11-25: "a reverse BrPM based on stamina remaining... when you get to
   * 50% stamina, you are 50% of the way to 50 BrPM, at 10% stamina remaining, you are 90% to max BrPM, and at 0%
   * stamina, you will be at 50"; of the two ways to start it, his "I'd go with B"). Two numbers for each exertion,
   * breaths a minute:
   *   START (`breathStart`): what her breathing jumps to in the first seconds of a pace, as her exertion catches up
   *     (above: one second per mph): a walk 19, jog 25, run 28, sprint 30 (what v0.2.174 reached 5 s in).
   *   TOP (`breathTop`): what it reaches when her pool is EMPTY: a jog 30, run 38, sprint 50 (v0.2.174's tops).
   * Between them a STRAIGHT LINE BY THE SHARE OF HER POOL SHE HAS SPENT: half her stamina left, half way from her start
   * to her top; 10% left, 90% of the way; empty, at her top. A walk refills her, so it stays at its start. Stopping, she
   * comes back down that line as her stamina refills, and her top lets go of the pace she ran at her exertion's own pace
   * down (`breathe`, `exertTop`): a sprint to half and then a jog settles onto the jog's own line.
   * The builder's own breathing (vitalsFor: the air she needs a minute over a breath's size, by her lungs) is asked at
   * the effort that breathes these for its default lungs (`feltForBreaths`), her start fresh and her top at
   * `breathTopTired` of the builder's tiredness (its quicker, shallower breaths: without it its lungs top out at 47), so
   * a body with other lungs (John, once the builder has lung settings) breathes its own way at the same exertion.
   * (Before, v0.2.174: her fresh rate, 43 sprinting, quickened by tiredness to her top once HALF her pool was spent, and
   * held there for the second half.)
   */
  breathStart: [[0, 14], [0.3, 19], [0.6, 25], [0.8, 28], [1, 30], [1.15, 32]] as ReadonlyArray<readonly [exertion: number, breathsPerMinute: number]>,
  breathTop: [[0, 14], [0.3, 19], [0.6, 30], [0.8, 38], [1, 50], [1.15, 50]] as ReadonlyArray<readonly [exertion: number, breathsPerMinute: number]>,
  breathTopTired: 0.48,
  /**
   * HER HEART by her exertion: the share of her heart-rate reserve (her rest to her peak) she uses, which tracks the
   * share of her oxygen-uptake reserve (Swain and Leutholtz 1997; https://jssm.org/jssm-05-662.xml%3EFulltext). Mary:
   * a walk 103, jog 145, run 163, sprint 173 (Joshua's targets). As she tires it DRIFTS up (cardiac drift), up to
   * `driftMost` beats with her pool empty, following over `driftSeconds`.
   */
  heartReserve: [[0, 0], [0.3, 0.3], [0.6, 0.68], [0.8, 0.845], [1, 0.936], [1.15, 1]] as ReadonlyArray<readonly [exertion: number, share: number]>,
  heartDrift: { driftMost: 8, driftSeconds: 30 },
  /**
   * TRAINING AND UPGRADES (Joshua approved all four, 2026-11-25), each 0 .. 1, per character (HeroineVitals `fitness`,
   * `endurance`, `recovery`, `strength`; Settings -> TEST TOOLS sets them until they are earned). FITNESS (cardio,
   * shown 0-100; both start at `startFitness`, 20) is her capacity above. ENDURANCE: her pool up to `enduranceMore`
   * more (100 -> 150). RECOVERY: her refill x (1 + `recoveryMore` x it). STRENGTH: `strengthEase` x it off the extra
   * work hills and loads add.
   */
  training: { startFitness: 0.2, enduranceMore: 0.5, recoveryMore: 0.3, strengthEase: 0.15 },
  /**
   * HER OWN BODY (Joshua: "Equal starting endurance, individual physiology"): her weight, kg (a load is read against
   * it). HER LUNGS AND HEART ARE THE BUILDER'S since v0.9.76 (Joshua: "Implement in CCBS"; Char_B actor/vitals.ts
   * `Lungs`, `Heart`): a body's own (`HeroineBody.lungs`, `.heart`, as a character saved in the builder keeps them) or
   * its sex's defaults (`lungsDefault`, `heartDefault`): hers the builder's BREATHING and HEARTBEAT (4.2 L, a breath
   * 0.5 L, 80 L a minute at her hardest; 70 at rest, peak 206 - 0.88 x her age, Gulati 2010); his MALE_LUNGS and
   * MALE_HEART (6.0 L, a breath 0.5 L, 120 L a minute at his hardest; 65 at rest, peak 208 - 0.7 x his age, Tanaka
   * 2001). The game's own numbers for them, here until v0.2.175, were the same.
   */
  body: { womanKg: 60, manKg: 80 },
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
   * WHAT ELSE RAISES HER HEART AND BREATHING (Joshua, 2026-11-17: "what other real life stuff affects the heart rate and
   * breathing?"). Three, each 0..1, each adding to her heart rate (beats a minute) and her breathing (breaths a minute)
   * at full strength:
   *   THIRST   her water bar running low. Real: heart rate up 3 to 5 beats a minute for every 1% of body weight lost
   *            as water; a badly dehydrated 4% is about +18, and the same work feels harder.
   *   PAIN     her health below `painFrom` (an injury): real pain makes breathing faster and SHALLOWER, and lifts the heart.
   *   FEAR     danger (a dome section hurt or breached; a hit on her; later, enemies close): adrenaline. It rises within
   *            a couple of seconds and fades over `fearFallSeconds` once the danger passes (real: fast breathing from
   *            fear passes once the fear is gone).
   * Since v0.2.174 thirst and pain lower her CAPACITY (`capacity` above), so the same pace is harder work; FEAR no longer
   * touches her stamina at all (Joshua: it punished her for fleeing exactly when she needed to).
   * GAME TUNING (the sizes for pain and fear are the game's choice: real ones vary a great deal from person to person).
   */
  stress: {
    thirst: { heart: 18, breaths: 3 },
    pain: { heart: 15, breaths: 6, shallower: 0.25 },
    fear: { heart: 30, breaths: 8 },
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
   * How fast she can move, as a share of her full speed: 1 when fresh. Hunger and thirst each take a share off, and she
   * is never slower than `slowest`. (Since v0.2.174 her stamina takes nothing off: Joshua, "I do not want movement speed
   * to gradually decrease simply because stamina is draining... not like a spinning top": she keeps her pace to empty.)
   */
  speed: { hungerCost: 0.1, thirstCost: 0.15, slowest: 0.45 },
  /**
   * HER ENERGY, HER READINESS OVER THE DAY (Joshua, 2026-11-21: "adding new stats like energy/effort, adrenaline"),
   * IN REAL MINUTES since v0.2.174 (his decision; it was on her body's clock): moving costs (`moveBase` + `moveWork` x
   * her workload squared) % a minute (a walk 0.3, jog 0.9, run 1.5, sprint 2.3: a whole sprint 1.5%, an 8-minute jog 7%);
   * standing still it comes back `restPerMinute` % a minute once she has been still `restAfter` seconds (sitting
   * `seatedPerMinute`), at `unfedRest` of that while she is hungry or thirsty; sleep, later, fills it.
   * IT IS HER STAMINA POOL (Joshua: "Your direct linear formula, no floor"): her pool is her base x her energy, so at
   * half her energy she has half her points to spend, and at 0 only a walk (input/pace.ts) until she has rested. Under
   * `lowFrom` it lowers her mood too.
   */
  energy: { moveBase: 0.1, moveWork: 2.2, restAfter: 60, restPerMinute: 1, seatedPerMinute: 2, unfedRest: 0.5, lowFrom: 0.5 },
  /**
   * ADRENALINE (Joshua, 2026-11-21): fear is the spark, adrenaline what it does to her body. It follows the worst of her
   * fear and a fight (she has fired in the last `fightSeconds`, at `fromFight`) up within `riseSeconds`, jumps on a hit
   * (`perHealthLost` a point), and fades over `fallSeconds` (95%) once they pass: fear can drop in seconds while it is
   * still up. While it is up: her heart and breathing are lifted (`heart`, `breaths` at full), her capacity is up to
   * `capacity.adrenaline` higher (10%: since v0.2.174, Joshua's pick, in place of refilling her stamina half again as
   * fast), her pain is dulled by `dullsPain`. As it fades she CRASHES: a full fade costs `crashEnergy` of her energy.
   * GAME TUNING (real adrenaline lasts minutes; how strongly it acts varies a great deal).
   */
  adrenaline: { riseSeconds: 1, fallSeconds: 90, fightSeconds: 3, fromFight: 0.35, perHealthLost: 0.03, heart: 12, breaths: 2, dullsPain: 0.6, crashEnergy: 0.12 },
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
  /**
   * where she stands this frame and the ground's height there, metres: the slope she climbs is worked out from it
   * (VITALS_TUNING.hill). Left out (the flat town): level ground.
   */
  readonly ground?: { readonly x: number; readonly z: number; readonly y: number };
  /** what she carries besides her own body, kg (a pack, later). Left out: nothing. */
  readonly loadKg?: number;
  /** is she sitting (energy comes back faster)? Left out: no. */
  readonly seated?: boolean;
  /** how deep the water is at her feet, metres (0 dry land): it cools her. Left out: 0. */
  readonly waterDepth?: number;
  /** how wet her skin is, 0 dry .. 1 soaked (fresh from the water): it cools her. Left out: 0. */
  readonly wet?: number;
}

/**
 * HER OWN BODY for her vitals: the builder's (her age, how many weeks pregnant, her own LUNGS and HEART: VitalsBody
 * `lungs`, `heart`) and the game's (VITALS_TUNING.body): a man (his weight, and his sex's lungs and heart when he has
 * none of his own), her weight if not the usual one.
 */
export interface HeroineBody extends VitalsBody {
  readonly male?: boolean;
  readonly bodyKg?: number;
}

/**
 * A SAVED CHARACTER'S OWN LUNGS AND HEART: what an export of the builder keeps with its body (v0.9.76 and after:
 * `lungs`, `heart`, each number held to its range by the builder's `readLungs`, `readHeart`), or, for a save from
 * before or a number left out, its body's own (the male base body's for 'male-base', the female's otherwise).
 */
export function lungsOfSave(body: { readonly model?: string; readonly lungs?: unknown; readonly heart?: unknown }): Pick<HeroineBody, 'lungs' | 'heart'> {
  const male = body.model === 'male-base';
  return { lungs: readLungs(body.lungs, lungsDefault(male)), heart: readHeart(body.heart, heartDefault(male)) };
}

/** A body with its lungs and heart filled in: its own, or its sex's defaults (the builder's `lungsDefault`, `heartDefault`). */
export function withOwnLungs(body: HeroineBody): HeroineBody {
  return { ...body, lungs: body.lungs ?? lungsDefault(!!body.male), heart: body.heart ?? heartDefault(!!body.male) };
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
  /** her stamina, a share of her whole pool (her base, with the Endurance upgrade): 0 empty .. 1 full */
  readonly stamina: number;
  /**
   * how much of that pool she can have now, the same share (her energy: Joshua's straight line): the stamina bar's
   * last part, past this, is out of reach until she has rested
   */
  readonly staminaPool: number;
  /** her RELATIVE EFFORT: her workload over her capacity, 0 at rest .. 1 a fresh sprint (more uphill or hurt) */
  readonly effort: number;
  /** her exertion, 0 .. 1.15: her body catching up with her effort, and still up after she stops (her breathing reads it) */
  readonly exertion: number;
  /** her workload (a share of a fresh sprint's), her capacity (1 = fresh at starting fitness), the slope (rise / distance) */
  readonly workload: number;
  readonly capacity: number;
  readonly grade: number;
  /** her fitness, 0 .. 1 (shown as 0-100) */
  readonly fitness: number;
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

/** A table's value at `x`, blended between its rows; past either end it carries on along the end rows' slope. */
function along(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  const n = table.length;
  // (the two rows `x` lies between, or the first two / last two when it is past an end)
  let i = 1;
  while (i < n - 1 && x > table[i][0]) i++;
  const [x0, y0] = table[i - 1], [x1, y1] = table[i];
  return y0 + ((x - x0) / Math.max(1e-9, x1 - x0)) * (y1 - y0);
}

/** Her workload at a ground speed on flat ground, carrying nothing (VITALS_TUNING.workBySpeed). Never below 0. */
export function workAtSpeed(speed: number): number {
  return Math.max(0, along(VITALS_TUNING.workBySpeed, Math.max(0, speed)));
}

/** How much more work a slope makes at a speed (VITALS_TUNING.hill): 1 on the flat. */
export function hillFactor(grade: number, speed: number): number {
  const h = VITALS_TUNING.hill;
  if (grade >= 0) return 1 + (speed >= h.runFrom ? h.runUp : h.walkUp) * grade;
  return Math.max(h.least, 1 + h.down * grade);
}

/** Her stamina's change at a relative effort, points a second of a 100-point pool (VITALS_TUNING.staminaByEffort). */
export function staminaAtEffort(effort: number): number {
  return along(VITALS_TUNING.staminaByEffort, Math.max(0, effort));
}

/**
 * THE EFFORT THE BUILDER'S BREATHING TAKES to breathe her START or her TOP at an exertion (VITALS_TUNING.breathStart,
 * breathTop), for its default lungs: worked out once by halving (its breathing rises with the effort it is asked),
 * every 0.025 of exertion, then read between. Her start is asked fresh, her top at `breathTopTired` of the builder's
 * tiredness (`feltEnergy`). Asked of a body with other lungs, the same effort gives the same share of its air and the
 * same share of its breath's size, so it breathes its own rate.
 */
const feltTables: { start?: number[]; top?: number[] } = {};
const FELT_STEP = 0.025;
/** The builder's energy (1 fresh .. 0 spent) her start and her top are asked at. */
export function feltEnergy(which: 'start' | 'top'): number {
  return which === 'start' ? 1 : 1 - VITALS_TUNING.breathTopTired;
}
export function feltForBreaths(which: 'start' | 'top', exertion: number): number {
  let table = feltTables[which];
  if (!table) {
    table = [];
    const wants = which === 'start' ? VITALS_TUNING.breathStart : VITALS_TUNING.breathTop, energy = feltEnergy(which);
    for (let x = 0; x <= VITALS_TUNING.exertion.most + 1e-9; x += FELT_STEP) {
      const want = along(wants, x);
      let low = 0, high = 1;
      if (vitalsFor(1, energy).breathsPerMinute <= want) low = 1;
      else for (let k = 0; k < 24; k++) { const mid = (low + high) / 2; if (vitalsFor(mid, energy).breathsPerMinute < want) low = mid; else high = mid; }
      table.push(low === 1 ? 1 : (low + high) / 2);
    }
    feltTables[which] = table;
  }
  const at = clamp(exertion, 0, VITALS_TUNING.exertion.most) / FELT_STEP;
  const i = Math.min(table.length - 2, Math.floor(at)), f = at - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

/** A body's peak heart rate by its own heart (the builder's `peakHeart`: a woman's 206 - 0.88 x her age, a man's 208 - 0.7 x his). */
export function peakHeartOf(body: HeroineBody): number {
  return peakHeart(body.age ?? 28, body.heart ?? heartDefault(!!body.male));
}

const MPH = 2.23694;

/** The heroine's vitals. Make one per heroine, `step` it every frame, and read `reading`. */
export class HeroineVitals {
  /** The builder's own states: where her breath and heartbeat are in their cycles, a breath's size, her heart's drift. */
  private vitals: Vitals = restingVitals();
  /**
   * HER TRAINING (VITALS_TUNING.training), 0 .. 1 each: her fitness (cardio; she starts at 20 of 100), and the three
   * upgrades, Endurance (her pool), Recovery (her refill) and Strength (hills and loads). Set by Settings -> TEST TOOLS
   * until they are earned.
   */
  fitness: number = VITALS_TUNING.training.startFitness;
  endurance = 0;
  recovery = 0;
  strength = 0;
  /** Her fear now, 0..1 (VITALS_TUNING.stress): rises toward the danger she is in, fades after it. */
  private fear = 0;
  /** What thirst, pain and fear add to her heart (beats a minute) and breathing (breaths a minute) now: they lag behind. */
  private extraBeats = 0;
  private extraBreaths = 0;
  /** How far along her pregnancy is, 0 (not pregnant) to 1 (week 36 on): its weight and her smaller capacity. */
  private pregnancy: number;
  private gut: GutState = restingGut();
  private health: number = VITALS_TUNING.health.most;
  private now: VitalsNow;
  private needs: GutNeeds;
  /** Her energy over the day (VITALS_TUNING.energy), 0..1. (Not `vitals.energy`: that is the builder's name for stamina.) */
  private dayEnergy = 1;
  /** Her stamina, points (0 .. her pool: her base x her energy). */
  private staminaPoints: number;
  /** Her exertion, for her breathing and for her heart (VITALS_TUNING.exertion): each on its own timing. */
  private exertBreath = 0;
  private exertHeart = 0;
  /**
   * The exertion her breathing's TOP is read at (VITALS_TUNING.breathTop): up with her breathing's exertion at once,
   * down after it at its own pace down, so stopping she does not drop from a sprint's top to a stand's in a moment.
   */
  private exertTop = 0;
  /** Her workload, capacity and relative effort this step, and the slope under her (smoothed), for the reading. */
  private workload = 0;
  private capacity = 1;
  private effort = 0;
  private grade = 0;
  private lastGround: { x: number; z: number; y: number } | null = null;
  /** Seconds she has been still (her energy starts coming back after VITALS_TUNING.energy.restAfter). */
  private stillFor = 0;
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
   * `body`: her age in years and how many weeks pregnant she is (the builder's vitals add pregnancy's faster heart and
   * deeper breaths from these), her own lungs and heart (left out, her sex's: `withOwnLungs`), and the game's own
   * (HeroineBody: a man, his weight). Left out, the builder's own defaults and a woman's.
   */
  private body: HeroineBody;
  constructor(body: HeroineBody = {}) {
    this.body = withOwnLungs(body);
    this.pregnancy = pregnancyShare(body.weeks);
    this.staminaPoints = this.poolPoints();
    this.now = this.breathe(0, 0);
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

  /** Her whole stamina pool, points: her base with the Endurance upgrade (VITALS_TUNING.training). */
  private basePoints(): number {
    return VITALS_TUNING.staminaPoints * (1 + VITALS_TUNING.training.enduranceMore * clamp(this.endurance, 0, 1));
  }

  /** The part of it she can have now, points: her base x her energy (Joshua's straight line, no floor). */
  private poolPoints(): number {
    return this.basePoints() * this.dayEnergy;
  }

  /**
   * THE SLOPE UNDER HER (VITALS_TUNING.hill): the ground's rise over the distance she has moved, smoothed over about
   * half a second; a jump (a swap, a reload of the map) starts it again. Level when the game gives no ground.
   */
  private measureGrade(dt: number, ground: VitalsInput['ground']): void {
    if (!ground || !Number.isFinite(ground.y)) { this.grade += (0 - this.grade) * (1 - Math.exp(-dt / 0.5)); this.lastGround = null; return; }
    const last = this.lastGround;
    if (!last) { this.lastGround = { ...ground }; return; }
    const moved = Math.hypot(ground.x - last.x, ground.z - last.z);
    if (moved > 5) { this.lastGround = { ...ground }; this.grade = 0; return; }
    if (moved < 0.05) return;   // (too little to tell a slope by: kept until she has gone a little further)
    const slope = clamp((ground.y - last.y) / moved, -0.6, 0.6);
    this.grade += (slope - this.grade) * (1 - Math.exp(-dt / 0.5));
    this.lastGround = { ...ground };
  }

  /**
   * HER BREATH AND HEART THIS STEP, from her exertion and the stamina she has spent (`spent`, a share of her pool):
   * her breathing Joshua's plan B (VITALS_TUNING.breathStart, breathTop): the builder's breathing (vitalsFor, her
   * lungs) at her START for her exertion now and at her TOP for `exertTop`, and the straight line between them by what
   * she has spent (her breath's rate, its size and its in-share alike); her heart from her heart-rate reserve
   * (VITALS_TUNING.heartReserve), her rest, her peak and its drift. Fear, pain, thirst and adrenaline are added after
   * (`step`). Moves her breath and heartbeat on by `dt` at these rates.
   */
  private breathe(dt: number, spent: number, extraBreaths = 0, extraBeats = 0, shallow = 1): VitalsNow {
    const T = VITALS_TUNING, X = T.exertion, h = clamp(dt, 0, 0.5);
    const feltHeart = Math.max(this.exertHeart, X.winded * spent);
    // her breathing: her start, and the share of the way to her top that the stamina she has spent takes her
    const start = vitalsFor(feltForBreaths('start', this.exertBreath), feltEnergy('start'), this.body);
    const top = vitalsFor(feltForBreaths('top', this.exertTop), feltEnergy('top'), this.body);
    const way = clamp(spent, 0, 1);
    const breathsAir = start.breathsPerMinute + Math.max(0, top.breathsPerMinute - start.breathsPerMinute) * way;
    const tidalAir = start.tidalL + (top.tidalL - start.tidalL) * way;
    const air = { breathsPerMinute: breathsAir, tidalL: tidalAir, inShare: start.inShare + (top.inShare - start.inShare) * way };
    // her heart: her rest (and pregnancy's), her peak, the share of the reserve between, and its drift as she tires
    const rest = (this.body.heart ?? heartDefault(!!this.body.male)).restPerMinute + PREGNANT_BREATH.heart * this.pregnancy;
    const peak = Math.max(rest + 20, peakHeartOf(this.body));
    const driftWant = T.heartDrift.driftMost * spent * clamp(this.exertHeart / 0.5, 0, 1);
    this.vitals.drift += (driftWant - this.vitals.drift) * (1 - Math.exp(-h / T.heartDrift.driftSeconds));
    const beatsWork = Math.min(peak, rest + (peak - rest) * clamp(along(T.heartReserve, feltHeart), 0, 1) + this.vitals.drift);
    // (fear on top of a sprint never past the most a heart of her age can beat: about 220 less her age)
    const beats = Math.min(beatsWork + extraBeats, Math.max(beatsWork, 220 - (this.body.age ?? 28)));
    const breaths = air.breathsPerMinute + extraBreaths;
    // a breath's size follows smoothly; her breath and her pulse go on
    this.vitals.tidalL += (air.tidalL * shallow - this.vitals.tidalL) * (1 - Math.exp(-h / STAMINA.depthS));
    this.vitals.cycle = (this.vitals.cycle + (h * breaths) / 60) % 1;
    this.vitals.pulse = (this.vitals.pulse + (h * beats) / 60) % 1;
    const breath = breathOf(this.vitals.cycle, air.inShare);
    return {
      breathsPerMinute: breaths, beatsPerMinute: beats, tidalL: this.vitals.tidalL, breathL: this.vitals.tidalL * breath, breath,
      beat: beatOf(this.vitals.pulse), inShare: air.inShare, airLPerMin: breaths * this.vitals.tidalL,
      effort: this.effort, energy: this.staminaPoints / Math.max(1e-9, this.basePoints()), felt: this.exertBreath,
    };
  }

  /** Move her vitals on by `dt` seconds of play. */
  step(dt: number, input: VitalsInput): void {
    if (dt <= 0) return;
    const tuning = VITALS_TUNING, X = tuning.exertion, st = tuning.stress, ad = tuning.adrenaline, en = tuning.energy;

    // 1. WHAT SHE FEELS: fear follows the danger; adrenaline the worst of fear and a fight (fading, she crashes: her
    //    energy pays); pain from her health, dulled while her adrenaline is up; thirst from her water
    const threat = clamp(input.threat ?? 0, 0, 1);
    this.fear += (threat - this.fear) * (1 - Math.exp(-dt / (threat > this.fear ? st.fearRiseSeconds : st.fearFallSeconds)));
    this.fightLeft = input.firing ? ad.fightSeconds : Math.max(0, this.fightLeft - dt);
    const adWant = Math.max(this.fear, this.fightLeft > 0 ? ad.fromFight : 0);
    const adWas = this.adrenaline;
    this.adrenaline += (adWant - this.adrenaline) * (1 - Math.exp((-3 * dt) / (adWant > this.adrenaline ? ad.riseSeconds : ad.fallSeconds)));
    if (this.adrenaline < adWas) this.dayEnergy = Math.max(0, this.dayEnergy - (adWas - this.adrenaline) * ad.crashEnergy);
    const thirst = this.needs.thirst, fear = this.fear;
    const pain = clamp((st.painFrom - this.health) / st.painFrom, 0, 1) * (1 - ad.dullsPain * this.adrenaline);
    this.pain = pain;

    // 2. HER WORKLOAD (VITALS_TUNING.workBySpeed, hill, pregnantKg): her speed's work, firing's, then the slope and what
    //    she carries; Strength takes a share off the extra a slope or a load adds
    this.measureGrade(dt, input.ground);
    const kg = this.body.bodyKg ?? (this.body.male ? tuning.body.manKg : tuning.body.womanKg);
    const flat = workAtSpeed(input.speed) + (input.firing ? tuning.firingWork : 0);
    const harder = hillFactor(this.grade, input.speed) * ((kg + Math.max(0, input.loadKg ?? 0) + tuning.pregnantKg * this.pregnancy) / kg);
    const ease = harder > 1 ? 1 - tuning.training.strengthEase * clamp(this.strength, 0, 1) : 1;
    this.workload = flat * (1 + (harder - 1) * ease);

    // 3. HER CAPACITY (VITALS_TUNING.capacity): her fitness, less what thirst, pain, her pregnancy and heat take, more
    //    while her adrenaline is up
    const cap = tuning.capacity;
    this.capacity = (cap.fitnessLeast + cap.fitnessGain * clamp(this.fitness, 0, 1)) * (1 - cap.thirst * thirst) * (1 - cap.pain * pain)
      * (1 - cap.pregnancy * this.pregnancy) * (1 + cap.adrenaline * this.adrenaline)
      * Math.max(0.5, 1 - cap.heatPerDegree * Math.max(0, this.temperature - cap.heatFrom));

    // 4. HER RELATIVE EFFORT, and her STAMINA by it (VITALS_TUNING.staminaByEffort), within her pool (her energy)
    this.effort = this.workload / Math.max(0.05, this.capacity);
    let rate = staminaAtEffort(this.effort) * (tuning.staminaPoints / 100);
    if (rate > 0) rate *= 1 + tuning.training.recoveryMore * clamp(this.recovery, 0, 1);
    const pool = this.poolPoints();
    this.staminaPoints = clamp(this.staminaPoints + rate * dt, 0, pool);
    // (the share of her pool she has spent: none when she has no pool to spend)
    const spent = pool > 0.5 ? 1 - this.staminaPoints / pool : 0;

    // 5. HER EXERTION (VITALS_TUNING.exertion): up at Joshua's "one second per mph" (her heart at two), down slower,
    //    fitter quicker; never restarted, it chases from wherever it is
    const want = clamp(this.effort, 0, X.most), mph = input.speed * MPH, fit = clamp(this.fitness, 0, 1);
    const upBreath = Math.max(X.quickest, X.breathUpPerMph * mph) / 3, upHeart = Math.max(X.quickest, X.heartUpPerMph * mph) / 3;
    const downBreath = X.breathDown[0] + (X.breathDown[1] - X.breathDown[0]) * fit;
    const downHeart = X.heartDown[0] + (X.heartDown[1] - X.heartDown[0]) * fit;
    this.exertBreath += (want - this.exertBreath) * (1 - Math.exp(-dt / (want > this.exertBreath ? upBreath : downBreath)));
    this.exertHeart += (want - this.exertHeart) * (1 - Math.exp(-dt / (want > this.exertHeart ? upHeart : downHeart)));
    this.exertTop = this.exertBreath >= this.exertTop ? this.exertBreath : this.exertTop + (this.exertBreath - this.exertTop) * (1 - Math.exp(-dt / downBreath));

    // 6. WHAT ELSE LIFTS HER HEART AND BREATHING (thirst, pain, fear, adrenaline), each following where it puts them
    //    at its own pace: her heart first, her breathing later; calming down slower, and slower still from the very
    //    top ("95% of the way in S seconds" is a time constant of S / 3)
    const follow = (now: number, wanted: number, riseSeconds: number, most: number): number => {
      const high = clamp(now / most, 0, 1);
      const seconds = wanted >= now ? riseSeconds : riseSeconds * st.calmTimes * (1 + (st.calmTimesWhenHigh - 1) * high);
      return now + (wanted - now) * (1 - Math.exp((-3 * dt) / seconds));
    };
    const adr = this.adrenaline;
    this.extraBeats = follow(this.extraBeats, st.thirst.heart * thirst + st.pain.heart * pain + st.fear.heart * fear + ad.heart * adr, st.heartRiseSeconds, st.thirst.heart + st.pain.heart + st.fear.heart + ad.heart);
    this.extraBreaths = follow(this.extraBreaths, st.thirst.breaths * thirst + st.pain.breaths * pain + st.fear.breaths * fear + ad.breaths * adr, st.breathRiseSeconds, st.thirst.breaths + st.pain.breaths + st.fear.breaths + ad.breaths);

    // 7. HER BREATH AND HEART (`breathe`): her breathing and heart from her exertion and what she has spent, the extra on
    //    top, her breath shallower in pain
    this.now = this.breathe(dt, spent, this.extraBreaths, this.extraBeats, 1 - st.pain.shallower * pain);

    // 8. Her gut: the builder's model, with the clock run faster. Sweat takes water out of her as she works.
    const work = clamp(this.workload, 0, 1);
    const hours = dt * this.gutHoursPerSecond;
    this.gut = stepGut(this.gut, hours);
    const [sweatRest, sweatHard] = tuning.sweatMlPerHour;
    this.gut.waterMl -= (sweatRest + (sweatHard - sweatRest) * work) * hours;
    this.needs = this.gameNeeds();

    // 9. HER ENERGY (VITALS_TUNING.energy), in real minutes: moving spends it by her workload squared; still for a minute,
    //    it comes back (sitting faster, half as fast hungry or thirsty)
    const active = input.speed >= 0.1 || input.firing;
    this.stillFor = active ? 0 : this.stillFor + dt;
    if (active) this.dayEnergy -= ((en.moveBase + en.moveWork * this.workload * this.workload) / 100 / 60) * dt;
    else if (this.stillFor >= en.restAfter) {
      const unfed = this.needs.hunger > 0 || this.needs.thirst > 0 ? en.unfedRest : 1;
      this.dayEnergy += (((input.seated ? en.seatedPerMinute : en.restPerMinute) * unfed) / 100 / 60) * dt;
    }
    this.dayEnergy = clamp(this.dayEnergy, 0, 1);
    // (her pool shrinks with it: stamina over the new pool is trimmed as it goes, a little at a time)
    this.staminaPoints = Math.min(this.staminaPoints, this.poolPoints());

    // 10. HER BODY TEMPERATURE: warmed by work, cooled by wet skin and water
    const tt = tuning.temperature;
    const tempWant = tt.rest + (tt.hardest - tt.rest) * work - tt.wet * clamp(input.wet ?? 0, 0, 1)
      - tt.water * clamp((input.waterDepth ?? 0) / tt.waterFullAt, 0, 1);
    this.temperature += (tempWant - this.temperature) * (1 - Math.exp((-3 * dt) / (tempWant > this.temperature ? tt.riseSeconds : tt.fallSeconds)));

    // 11. THE BATHROOM: how fast it is filling (for its ETA)
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

    // 12. HER MOOD: full marks less what wears on her (VITALS_TUNING.mood)
    const md = tuning.mood;
    const tired = clamp((en.lowFrom - this.dayEnergy) / en.lowFrom, 0, 1);
    const winded = clamp((spent - 0.8) / 0.2, 0, 1);
    const pressing = clamp((fillNow - 0.5) / 0.5, 0, 1);
    const moodWant = clamp(1 - md.hunger * this.needs.hunger - md.thirst * this.needs.thirst - md.bathroom * pressing
      - md.pain * pain - md.fear * fear - md.tired * tired - md.winded * winded, 0, 1);
    this.mood += (moodWant - this.mood) * (1 - Math.exp((-3 * dt) / md.seconds));

    // 13. Her health: it mends while she is fed and watered, and wears away while she is starving or parched.
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
    const speedShare = clamp(1 - this.needs.hunger * s.hungerCost - this.needs.thirst * s.thirstCost, s.slowest, 1);
    const bath = this.bathroomNow();
    const base = Math.max(1e-9, this.basePoints());
    return {
      heartRate: this.now.beatsPerMinute,
      breathsPerMinute: this.now.breathsPerMinute,
      breathLitres: this.now.tidalL,
      breath: this.now.breath,
      breathCycle: this.vitals.cycle,
      breathInShare: this.now.inShare,
      beat: this.now.beat,
      stamina: this.staminaPoints / base,
      staminaPool: this.poolPoints() / base,
      effort: this.effort,
      exertion: this.now.felt,
      workload: this.workload,
      capacity: this.capacity,
      grade: this.grade,
      fitness: clamp(this.fitness, 0, 1),
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
