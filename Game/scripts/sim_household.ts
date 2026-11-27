// ============================================================================
// sim_household.ts -- JOHN AND MARY LIVING IN THE HOUSE FOR DAYS, WITHOUT DRAWING ANYTHING: the phase-2 test of the mind
// (src/mind/), the game clock (src/core/gameClock.ts) and the home (src/world/home/), with the game's own vitals
// (src/vitals/heroineVitals.ts) and a simple stand-in body.
//
// Joshua, 2026-11-26: "Start with the game clock and headless AI mind simulation... Test several consecutive simulated
// days, not just one... Test resource shortages, blocked destinations, occupied objects and interrupted activities...
// Include decision logging from the beginning."
//
// THE BODY: since v0.2.180 the GAME'S OWN mind body (homeMindBody.ts), on the game's own walk grid and walls (homeNav.ts,
// homeBlocks.ts), over a stand-in for the drawn body (SimBody: its place, walked and pushed out of the walls as the
// game's walk is, at 1.1 m/s; its turn; its sit and lie, timed as the game's). Eating, drinking, the bathroom and sleep
// go to the vitals. The game's vitals are stepped as main.ts steps them, four times a real second, their slow clocks on
// the game clock (6x, and 120x while everyone home is asleep).
//
// SCENARIOS (each prints its days and its checks, PASS or FAIL):
//   0. spots        every spot of every thing in the house can be stood on and walked to, with the game's walls
//   1. normal       both at home, three days
//   2. pantry       the fridge nearly empty and few snacks: two days
//   3. blocked      bath 2's door blocked all day: one day
//   4. one toilet   bath 2 blocked and both bursting at once: who waits
//   5. takeover     the player takes Mary mid-activity for half a game hour, then gives her back
//   6. john away    John leaves on the expedition; worrying news for Mary; three days (her stress eating)
//   7. companion    Mary played, John a companion, for two game hours
//   8. save         a mind saved and loaded back gives the same mind
// The decision logs of scenario 1 and 6 are written out in full (/tmp/household/).
//
// RUN IT (from Game/; esbuild comes with Vite, `@charb` is the builder's folder as in vite.config.ts):
//   node_modules/.bin/esbuild scripts/sim_household.ts --bundle --platform=node --format=esm \
//     --alias:@charb=../Char_B/src --outfile=/tmp/sim_household.mjs && node /tmp/sim_household.mjs [scenario...]
// ============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameClock } from '../src/core/gameClock';
import { HeroineVitals, type HeroineBody } from '../src/vitals/heroineVitals';
import { Mind, Society, MARY_PROFILE, JOHN_PROFILE, type ActorId, type CharacterProfile, type ControlMode, type GameTime, type Vec2 } from '../src/mind';
import { generateHome, type HomeLayout } from '../src/world/home/homeLayout';
import { HomeWorld } from '../src/world/home/homeWorld';
import { needsFromReading } from '../src/world/home/mindBridge';
import { BODY_RADIUS, HomeWalls, PEOPLE_APART, SPOT_REACH, layoutBlocks, spotPush, type Block } from '../src/world/home/homeBlocks';
import { HomeNav } from '../src/world/home/homeNav';
import { HomeMindBody } from '../src/world/home/homeMindBody';

const STEP = 0.25;            // real seconds a frame
const WALK = 1.1;             // metres a second
const OUT = '/tmp/household';

// ---- THE STAND-IN BODY ----------------------------------------------------------------------------------------------
//
// SINCE v0.2.180 THE MIND'S BODY IS THE GAME'S OWN (homeMindBody.ts `HomeMindBody`), on the game's own walk grid
// (homeNav.ts) and walls (homeBlocks.ts): a chair it cannot reach, it cannot reach here either. (Joshua, 2026-11-26:
// in the game they "didn't fill up with food or water and it kept saying they were": every dining chair's spot was
// 12 cm from the table's edge and a body is kept 30 cm off anything solid; this simulation's first stand-in walked the
// doorways' routes straight through the furniture, and passed.) What stands in for the game is only the body under it
// (SimBody): its place, walked toward the HomeMindBody's `walkTo` at 1.1 m/s and pushed out of the walls exactly as the
// game's walk is; its turn toward `holdYaw`; and its sit (3 s down, 3 s up) and lie (on the bed's edge 3 s, then
// back 2.5 s), as the game's are timed.

/** How long sitting down takes, and lying back after it, seconds (sitPose.ts SIT.seconds, LIE.seconds). */
const SIT_SECONDS = 3, LIE_SECONDS = 2.5;
/** How fast the body turns on the spot, radians a second. */
const TURN_RATE = 4;

class SimBody {
  x: number;
  z: number;
  yaw = 0;
  /** seconds into sitting down (0 standing .. SIT_SECONDS seated), and into lying back from the edge */
  private sitT = 0;
  private lieT = 0;
  /** asked this frame: to stay seated, to lie */
  private sitAsked = false;
  private lieAsked = false;
  /** metres walked this frame, and in all */
  moved = 0;
  walked = 0;
  readonly mb: HomeMindBody;
  readonly walls: HomeWalls;

  constructor(readonly id: ActorId, start: Vec2, readonly vitals: HeroineVitals, layout: HomeLayout, nav: HomeNav, blocks: readonly Block[], middle: Vec2) {
    this.x = start.x; this.z = start.z;
    this.walls = new HomeWalls(blocks, middle, layout.objects);
    this.mb = new HomeMindBody({
      id, vitals, walls: this.walls,
      position: () => ({ x: this.x, z: this.z }),
      facing: () => this.yaw,
      floorY: () => 0,
      sitFor: () => { this.sitAsked = true; },
      sitShare: () => this.sitT / SIT_SECONDS,
      lieOn: (spot) => { if (spot) this.lieAsked = true; },
      lieShare: () => this.lieT / LIE_SECONDS,
    }, layout, nav);
  }

  position(): Vec2 { return { x: this.x, z: this.z }; }

  /** On their feet (not sitting, lying, or on the way down or up). */
  get standing(): boolean { return this.sitT <= 0 && this.lieT <= 0; }

  /** How far inside the furniture or walls they stand (the thing they use let in near its spot), metres. */
  inFurniture(): number {
    const people = this.walls.people;
    this.walls.people = () => [];
    const out = { x: 0, z: 0 };
    this.walls.move(this.x, this.z, 0, 0, out);
    this.walls.people = people;
    return Math.hypot(out.x - this.x, out.z - this.z);
  }

  /** Before the mind's tick: the frame's seconds to the mind's body, which asks again for the pose it keeps. */
  before(dt: number): void {
    this.sitAsked = false; this.lieAsked = false;
    this.mb.frame(dt);
  }

  /** After the mind's tick: the body does what was asked: walks, turns, sits, lies (or gets up). */
  after(dt: number): void {
    const mb = this.mb;
    // (walking: toward the next point, pushed out of the walls as the game's walk is)
    if (mb.walkTo && this.sitT <= 0 && this.lieT <= 0) {
      const dx = mb.walkTo.x - this.x, dz = mb.walkTo.z - this.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        const step = Math.min(d, WALK * dt);
        const out = { x: 0, z: 0 };
        this.walls.move(this.x, this.z, (dx / d) * step, (dz / d) * step, out);
        this.moved += Math.hypot(out.x - this.x, out.z - this.z);
        this.x = out.x; this.z = out.z;
        this.yaw = Math.atan2(dx, dz);
      }
    } else if (this.standing) {
      // (standing: pushed off anyone walking into them, as main.ts `nudge` does in the game)
      const out = { x: 0, z: 0 };
      this.walls.move(this.x, this.z, 0, 0, out);
      this.x = out.x; this.z = out.z;
    }
    if (!mb.walkTo && mb.holdYaw !== null && this.sitT <= 0 && this.lieT <= 0) {
      // (turned toward the way asked, before sitting or lying)
      const diff = Math.atan2(Math.sin(mb.holdYaw - this.yaw), Math.cos(mb.holdYaw - this.yaw));
      this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
    }
    // (sitting: down while asked, up when not; lying: on the edge first, then back; up the same way backwards)
    const sitting = this.sitAsked || this.lieAsked;
    if (this.lieAsked && this.sitT >= SIT_SECONDS) this.lieT = Math.min(LIE_SECONDS, this.lieT + dt);
    else if (!this.lieAsked && this.lieT > 0) this.lieT = Math.max(0, this.lieT - dt);
    if (sitting) this.sitT = Math.min(SIT_SECONDS, this.sitT + dt);
    else if (this.lieT <= 0) this.sitT = Math.max(0, this.sitT - dt);
  }

  /** The vitals' step for this frame: walking, or exercise felt as its walking speed; seated, asleep. */
  stepVitals(dt: number): void {
    const walkSpeed = this.moved / Math.max(1e-6, dt);
    // (exercise at a workload: the speed whose work it is, a walk 0.3 at 1.1 m/s to a jog 0.6 at 2.64)
    const exerciseSpeed = this.mb.workload > 0 ? 1.1 + ((this.mb.workload - 0.3) / 0.3) * (2.64 - 1.1) : 0;
    this.vitals.step(dt, { speed: Math.max(walkSpeed, exerciseSpeed), firing: false, seated: this.mb.seated, asleep: this.mb.asleep, sleepQuality: this.mb.sleepQuality });
    this.walked += this.moved;
    this.moved = 0;
  }
}

// ---- A HOUSEHOLD ------------------------------------------------------------------------------------------------------

interface Resident { readonly mind: Mind; readonly body: SimBody; readonly vitals: HeroineVitals }

class Household {
  readonly clock: GameClock;
  readonly world = new HomeWorld(generateHome());
  /** the game's own boxes and walk grid, made from the same layout (homeBlocks.ts, homeNav.ts) */
  readonly blocks: Block[];
  readonly nav: HomeNav;
  readonly middle: Vec2;
  readonly society = new Society();
  readonly people = new Map<ActorId, Resident>();
  /** samples every 15 game minutes, for the timeline file: time, then per person food, water, energy, bathroom, stress, loneliness, activity */
  readonly samples: string[] = [];
  private nextSample = 0;
  /** game seconds of mind time measured, and the real milliseconds the minds took */
  mindMs = 0;
  mindTicks = 0;
  /** the slowest single tick, ms (a frame on which a mind decided) */
  mindWorst = 0;
  /** the slowest after the first 2,000 frames (the JavaScript engine warmed up), and how many frames took over 1 ms */
  mindWorstWarm = 0;
  mindOver1 = 0;
  /** a check that no slot is ever held twice (counted each frame) */
  doubleHolds = 0;
  /** v0.2.181: frames a standing body was inside furniture or a wall (over 3 cm), the deepest, and of how many */
  inFurnitureFrames = 0;
  deepestIn = 0;
  standingFrames = 0;
  /** the nearest two people at home ever stood, both on their feet, metres */
  closestApart = Infinity;

  constructor(startHour = 7, readonly label = '') {
    this.clock = new GameClock(startHour, 6);
    const layout = this.world.layout, o = layout.origin;
    this.blocks = layoutBlocks(layout);
    this.middle = { x: o.x + layout.size.w / 2, z: o.z + layout.size.d / 2 };
    // (the walk grid over the house and half a metre round it, as homeScene.ts makes it)
    this.nav = new HomeNav(this.blocks, { x0: o.x - 0.5, z0: o.z - 0.5, x1: o.x + layout.size.w + 0.5, z1: o.z + layout.size.d + 0.5 }, BODY_RADIUS, layout.objects);
  }

  add(profile: CharacterProfile, body: HeroineBody, mode: ControlMode = 'autonomous'): Resident {
    const vitals = new HeroineVitals(body);
    vitals.setSleepiness(Math.max(0, (this.clock.hour - profile.habits.wake) * 0.045));
    const sim = new SimBody(profile.id, this.world.layout.spawns[profile.id], vitals, this.world.layout, this.nav, this.blocks, this.middle);
    const mind = new Mind(profile, sim.mb, this.world, this.society, { mode });
    const r = { mind, body: sim, vitals };
    this.people.set(profile.id, r);
    // (the others at home and on their feet are solid to them, as in the game: main.ts `walls.people`)
    sim.walls.people = () => [...this.people.values()]
      .filter((o) => o !== r && o.body.standing && !this.society.isAway(o.mind.id))
      // (one gives way to the other, by name: John to Mary... "ladies first")
      .map((o) => ({ x: o.body.x, z: o.body.z, apart: PEOPLE_APART, yieldTo: o.mind.id > profile.id }));
    return r;
  }

  get time(): GameTime { return { day: this.clock.day, hour: this.clock.hour, seconds: this.clock.totalSeconds }; }

  /** One frame of STEP real seconds. */
  frame(): void {
    const home = [...this.people.values()].filter((p) => !this.society.isAway(p.mind.id));
    // (sleep fast-forward: everyone at home asleep, and none of them played)
    this.clock.fastForward = home.length > 0 && home.every((p) => p.vitals.reading.asleep && p.mind.mode !== 'manual');
    this.clock.advance(STEP);
    const t = this.time;
    for (const p of this.people.values()) {
      p.vitals.gameHoursPerSecond = this.clock.hoursPerRealSecond;
      if (this.society.isAway(p.mind.id)) { p.vitals.step(STEP, { speed: 0.6, firing: false }); continue; }
      const t0 = performance.now();
      p.body.before(STEP);
      p.mind.tick(STEP, t, needsFromReading(p.vitals.reading));
      p.body.after(STEP);
      const took = performance.now() - t0;
      this.mindMs += took;
      this.mindTicks++;
      this.mindWorst = Math.max(this.mindWorst, took);
      if (took > 1) this.mindOver1++;
      if (this.mindTicks > 2000) this.mindWorstWarm = Math.max(this.mindWorstWarm, took);
      p.body.stepVitals(STEP);
    }
    // (v0.2.181: nobody standing inside the furniture or a wall; nobody on top of each other)
    const standing = home.filter((p) => p.body.standing);
    for (const p of standing) {
      const d = p.body.inFurniture();
      this.standingFrames++;
      if (d > 0.03) { this.inFurnitureFrames++; this.deepestIn = Math.max(this.deepestIn, d); }
    }
    for (let i = 0; i < standing.length; i++) for (let j = i + 1; j < standing.length; j++) {
      const apart = Math.hypot(standing[i].body.x - standing[j].body.x, standing[i].body.z - standing[j].body.z);
      if (apart < this.closestApart) {
        this.closestApart = apart;
        if (process.env.SIM_DEBUG && apart < 0.55) console.log(`    closest ${apart.toFixed(2)} at ${this.clock.text}: ${standing[i].mind.id} ${standing[i].mind.debug().step} (${standing[i].body.x.toFixed(2)}, ${standing[i].body.z.toFixed(2)}) / ${standing[j].mind.id} ${standing[j].mind.debug().step} (${standing[j].body.x.toFixed(2)}, ${standing[j].body.z.toFixed(2)})`);
      }
    }
    // (no slot held by two: the world keeps one holder per slot, so this counts only a broken world)
    const seen = new Set<string>();
    for (const key of this.world.held().keys()) { if (seen.has(key)) this.doubleHolds++; seen.add(key); }
    if (t.seconds >= this.nextSample) { this.nextSample = t.seconds + 900; this.sample(); }
  }

  /** Runs until the game clock reads `day` at `hour` (or later). */
  runUntil(day: number, hour: number, each?: () => void): void {
    const until = (day - 1) * 86400 + hour * 3600;
    while (this.clock.totalSeconds < until) { this.frame(); each?.(); }
  }

  private sample(): void {
    const parts = [`${this.clock.day}`, this.clock.timeText];
    for (const p of this.people.values()) {
      const r = p.vitals.reading, f = p.mind.emotions.state;
      parts.push(p.mind.id, r.food.toFixed(2), r.water.toFixed(2), r.energy.toFixed(2), r.bathroom.toFixed(2), f.stress.toFixed(2), f.loneliness.toFixed(2), this.society.isAway(p.mind.id) ? 'away' : p.mind.activity ?? '-');
    }
    this.samples.push(parts.join(','));
  }
}

// ---- REPORTING --------------------------------------------------------------------------------------------------------

const results: { scenario: string; check: string; pass: boolean; detail: string }[] = [];
function check(scenario: string, name: string, pass: boolean, detail: string): void {
  results.push({ scenario, check: name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
}

/** One person's day, as a line. */
function dayLine(h: Household, id: ActorId, day: number): string {
  const m = h.people.get(id)!.mind, d = m.memory.day(day);
  const pastimes = Object.entries(d.pastimes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  return `  ${m.profile.name.split(' ')[0].padEnd(5)} day ${day}: meals ${d.meals} (${Math.round(d.foodMl)} mL, big ${d.bigMeals}), snacks ${d.snacks}, drinks ${d.drinks} (${Math.round(d.waterMl)} mL, ${Math.round(d.waterWithFoodMl)} with food), toilet ${d.bathroom}, sleep ${d.sleepHours.toFixed(1)} h, switches ${d.switches}, emergencies ${d.emergencies}, failures ${d.failures}, idle ${Math.round(d.idleMinutes)} min\n           pastimes: ${pastimes || '-'}`;
}

/** The lowest each bar went over a run (from the samples), and how long it stayed under a line. */
/**
 * Their lowest needs over the run (and fullest bathroom). FOOD AWAKE only: the stomach empties a meal in a few game
 * hours, so it is near empty by every morning (a night's fast); `hungryAwake` is the longest they went awake with it
 * under 8%, in game minutes.
 */
function lows(h: Household, id: ActorId): { food: number; foodAwake: number; hungryAwake: number; water: number; energy: number; bathroomHigh: number } {
  let food = 1, foodAwake = 1, water = 1, energy = 1, bathroomHigh = 0, run = 0, hungryAwake = 0;
  for (const line of h.samples) {
    const p = line.split(','), i = p.indexOf(id);
    if (i < 0 || p[i + 7] === 'away') continue;
    const f = +p[i + 1], asleep = p[i + 7] === 'sleep';
    food = Math.min(food, f);
    if (!asleep) foodAwake = Math.min(foodAwake, f);
    run = !asleep && f < 0.08 ? run + 15 : 0;
    hungryAwake = Math.max(hungryAwake, run);
    water = Math.min(water, +p[i + 2]); energy = Math.min(energy, +p[i + 3]); bathroomHigh = Math.max(bathroomHigh, +p[i + 4]);
  }
  return { food, foodAwake, hungryAwake, water, energy, bathroomHigh };
}

/** When each sleep started and ended (from the decision log), "22:41-06:23". */
function sleeps(m: Mind): string[] {
  const out: string[] = [];
  let from: string | null = null;
  for (const e of m.memory.log) {
    if (e.activity !== 'sleep') continue;
    if (e.kind === 'choose' || e.kind === 'emergency' || e.kind === 'switch') from = e.when;
    else if ((e.kind === 'finish' || e.kind === 'interrupt' || e.kind === 'fail') && from) { out.push(`${from}-${e.when.slice(3)}${e.kind !== 'finish' ? ` (${e.text.split(': ')[1] ?? e.kind})` : ''}`); from = null; }
  }
  return out;
}

/** The first sample on `day` at or after `hour` (the samples are every 15 game minutes, never exactly on the hour). */
function sampleAt(h: Household, day: number, hour: number): string[] {
  const line = h.samples.find((l) => { const [d, hm] = l.split(','); const [hh, mm] = hm.split(':').map(Number); return +d === day && hh + mm / 60 >= hour; });
  return line?.split(',') ?? [];
}

function writeLog(name: string, h: Household): void {
  mkdirSync(OUT, { recursive: true });
  for (const p of h.people.values()) {
    const lines = p.mind.memory.log.map((e) => `${e.when}  ${e.kind.padEnd(9)} ${e.text}${e.scores ? `   {${Object.entries(e.scores).map(([k, v]) => `${k} ${v}`).join(', ')}}` : ''}`);
    writeFileSync(`${OUT}/${name}-${p.mind.id}-log.txt`, lines.join('\n') + '\n');
  }
  writeFileSync(`${OUT}/${name}-timeline.csv`, h.samples.join('\n') + '\n');
}

// ---- THE SCENARIOS ---------------------------------------------------------------------------------------------------

const MARY_BODY: HeroineBody = { age: 30, weeks: 0 };
const JOHN_BODY: HeroineBody = { age: 32, weeks: 0, male: true };

function normal(): Household {
  console.log('\n=== 1. NORMAL: both at home, three days from 07:00 on day 1 ===');
  const h = new Household(7);
  h.add(MARY_PROFILE, MARY_BODY);
  h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(4, 7);
  for (const day of [1, 2, 3]) for (const id of ['mary', 'john']) console.log(dayLine(h, id, day));
  for (const id of ['mary', 'john']) console.log(`  ${id} slept: ${sleeps(h.people.get(id)!.mind).join(' · ')}`);
  for (const id of ['mary', 'john']) {
    const m = h.people.get(id)!.mind, low = lows(h, id);
    const days = [1, 2, 3].map((d) => m.memory.day(d));
    check('normal', `${id}: eats every day`, days.every((d) => d.meals >= 2), days.map((d) => `${d.meals} meals`).join(', '));
    // (day 1 is 17 hours, from 07:00 with their water topped up: one big drink is enough there; a whole day, two)
    // (the water had: drunk, and with food since v0.2.181: a meal's glass of water, an apple's own)
    check('normal', `${id}: drinks every day`, days.every((d, i) => i === 0 ? d.drinks >= 1 && d.waterMl + d.waterWithFoodMl >= 400 : d.drinks >= 2 && d.waterMl + d.waterWithFoodMl >= 600), days.map((d) => `${d.drinks} (${Math.round(d.waterMl)} + ${Math.round(d.waterWithFoodMl)} mL with food)`).join(', '));
    check('normal', `${id}: uses the toilet every day`, days.every((d) => d.bathroom >= 3), days.map((d) => `${d.bathroom}`).join(', '));
    check('normal', `${id}: sleeps 6-10 h a night`, days.slice(1).every((d) => d.sleepHours >= 6 && d.sleepHours <= 10.5), days.map((d) => `${d.sleepHours.toFixed(1)} h`).join(', '));
    check('normal', `${id}: needs never neglected`, low.hungryAwake <= 30 && low.water >= 0.08 && low.bathroomHigh < 0.97, `food awake lowest ${pct(low.foodAwake)} (under 8% awake ${low.hungryAwake} min at most; asleep ${pct(low.food)}), water ${pct(low.water)}, energy ${pct(low.energy)}; fullest bathroom ${pct(low.bathroomHigh)}`);
    check('normal', `${id}: not idle for long`, days.every((d) => d.idleMinutes < 60), days.map((d) => `${Math.round(d.idleMinutes)} min`).join(', '));
    check('normal', `${id}: few switches`, days.every((d) => d.switches <= 6), days.map((d) => `${d.switches}`).join(', '));
    const kinds = days.map((d) => Object.keys(d.pastimes).length), most = days.map((d) => { const v = Object.values(d.pastimes); const all = v.reduce((a, b) => a + b, 0); return all ? Math.max(...v) / all : 0; });
    check('normal', `${id}: varied pastimes`, kinds.every((k) => k >= 4) && most.every((s) => s <= 0.45), kinds.map((k, i) => `${k} kinds, top ${pct(most[i])}`).join('; '));
  }
  check('normal', 'never two in one slot', h.doubleHolds === 0, `${h.doubleHolds}`);
  check('normal', 'never inside the furniture', h.inFurnitureFrames === 0,
    `${h.inFurnitureFrames} of ${h.standingFrames} frames on their feet over 3 cm in${h.inFurnitureFrames ? `, the deepest ${(h.deepestIn * 100).toFixed(1)} cm` : ''}`);
  // (kept PEOPLE_APART off each other; pressed into a corner together by a wall they can come a little nearer, but
  //  never closer than two shoulders touching, 0.45 m between their middles: once in three days, 0.47 m, at a window)
  check('normal', 'never on top of each other', h.closestApart >= 0.45, `the nearest they stood: ${h.closestApart.toFixed(2)} m`);
  console.log(`  the minds' cost: ${(h.mindMs / h.mindTicks * 1000).toFixed(1)} µs a mind a frame on average (${h.mindTicks} frames of ${STEP} s), stand-in body included; ${(h.mindMs / h.mindTicks / STEP * 1000).toFixed(0)} µs of a mind's work a real second; the slowest frame ${(h.mindWorst * 1000).toFixed(0)} µs (${(h.mindWorstWarm * 1000).toFixed(0)} once warmed up), ${h.mindOver1} frames over 1 ms`);
  writeLog('normal', h);
  return h;
}

function pantry(): void {
  console.log('\n=== 2. PANTRY: 3 meals in the fridge and 2 snacks, two days ===');
  const h = new Household(7);
  h.world.setStock('fridge-1', 'meals', 3);
  h.world.setStock('cabinet-1', 'snacks', 2);
  // (the fridge's own snacks too, since v0.2.181 kept by item: its apples and cheese)
  h.world.setStock('fridge-1', 'snacks', 0);
  h.add(MARY_PROFILE, MARY_BODY);
  h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(3, 7);
  for (const day of [1, 2]) for (const id of ['mary', 'john']) console.log(dayLine(h, id, day));
  const meals = ['mary', 'john'].reduce((s, id) => s + h.people.get(id)!.mind.memory.day(1).meals + h.people.get(id)!.mind.memory.day(2).meals, 0);
  const fails = ['mary', 'john'].reduce((s, id) => s + h.people.get(id)!.mind.memory.day(1).failures + h.people.get(id)!.mind.memory.day(2).failures, 0);
  check('pantry', 'no more meals eaten than there were', meals <= 3, `${meals} meals eaten`);
  check('pantry', 'no walking at an empty fridge again and again', fails <= 4, `${fails} failures in two days`);
  const m = h.people.get('mary')!.mind;
  check('pantry', 'they go hungry, but keep living', m.memory.day(2).drinks >= 3 && m.memory.day(2).bathroom >= 2, `Mary day 2: ${m.memory.day(2).drinks} drinks, ${m.memory.day(2).bathroom} toilet visits, lowest food ${pct(lows(h, 'mary').food)}`);
}

function blocked(): void {
  console.log('\n=== 3. BLOCKED: bath 2\'s door will not open, all day ===');
  const h = new Household(7);
  h.world.routes.block('door-bathroom');
  h.add(MARY_PROFILE, MARY_BODY);
  h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(2, 7);
  for (const id of ['mary', 'john']) console.log(dayLine(h, id, 1));
  const uses = ['mary', 'john'].flatMap((id) => h.people.get(id)!.mind.memory.log.filter((e) => e.kind === 'choose' && e.activity === 'toilet').map((e) => e.text));
  check('blocked', 'never sent to the blocked bathroom', uses.every((t) => !t.includes('bath 2')), `${uses.length} toilet trips, all to bath 1`);
  const fails = ['mary', 'john'].reduce((s, id) => s + h.people.get(id)!.mind.memory.day(1).failures, 0);
  check('blocked', 'no failures from it', fails <= 2, `${fails}`);
}

function oneToilet(): void {
  console.log('\n=== 4. ONE TOILET: bath 2 blocked, both bursting at 10:00 ===');
  const h = new Household(9);
  h.world.routes.block('door-bathroom');
  const mary = h.add(MARY_PROFILE, MARY_BODY), john = h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(1, 10);
  // (93% each: both past the emergency's 90% at once)
  mary.vitals.setBladder(560); john.vitals.setBladder(560);
  h.runUntil(1, 10.5);
  for (const p of [mary, john]) {
    const lines = p.mind.memory.log.filter((e) => e.at >= 10 * 3600 && e.at < 10.5 * 3600 && (e.activity === 'toilet' || e.activity === 'waitTurn')).map((e) => `${e.when} ${e.kind} ${e.text}`);
    console.log(`  ${p.mind.id}:\n    ${lines.join('\n    ')}`);
  }
  const waited = [mary, john].some((p) => p.mind.memory.log.some((e) => e.activity === 'waitTurn' && e.at >= 36000));
  const both = [mary, john].every((p) => p.mind.memory.log.some((e) => e.activity === 'toilet' && e.kind === 'finish' && e.at >= 36000));
  check('one toilet', 'one waited for the other', waited, waited ? 'yes' : 'no wait in the log');
  check('one toilet', 'both went', both, both ? 'yes' : 'one never went');
  check('one toilet', 'never two on it', h.doubleHolds === 0, `${h.doubleHolds}`);
}

function takeover(): void {
  console.log('\n=== 5. TAKEOVER: the player takes Mary at 12:30 for half a game hour ===');
  const h = new Household(11);
  const mary = h.add(MARY_PROFILE, MARY_BODY);
  h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(1, 12.5);
  const was = mary.mind.activity, held = [...h.world.held()].filter(([, w]) => w === 'mary').map(([k]) => k);
  mary.mind.setMode('manual');
  const after = [...h.world.held()].filter(([, w]) => w === 'mary').map(([k]) => k);
  h.runUntil(1, 13);
  mary.mind.setMode('autonomous');
  h.runUntil(1, 13.2);
  console.log(`  at 12:30 she was: ${was ?? 'nothing'} (holding ${held.join(', ') || 'nothing'}); after the takeover holding ${after.join(', ') || 'nothing'}; at 13:12 ${mary.mind.activity ?? 'deciding'}: ${mary.mind.thought}`);
  check('takeover', 'everything she held let go at once', after.length === 0, `${held.length} -> ${after.length}`);
  check('takeover', 'she carries on by herself after', !!mary.mind.activity, mary.mind.thought);
}

function johnAway(): Household {
  console.log('\n=== 6. JOHN AWAY: he leaves on day 1 at 08:00; worrying news for Mary on days 1 and 2 at 20:00 ===');
  const h = new Household(7);
  const mary = h.add(MARY_PROFILE, MARY_BODY), john = h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(1, 8);
  john.mind.setMode('scripted');
  h.society.setAway('john', true);
  h.world.release('john');
  h.runUntil(1, 20);
  mary.mind.storyEvent({ stress: 0.35, sadness: 0.2 }, 'no word from the expedition');
  h.runUntil(2, 20);
  mary.mind.storyEvent({ stress: 0.3, nervousness: 0.3 }, 'the radio signal was lost');
  h.runUntil(4, 7);
  for (const day of [1, 2, 3]) console.log(dayLine(h, 'mary', day));
  console.log(`  her feelings by day (at 21:00): ${[1, 2, 3].map((d) => { const s = sampleAt(h, d, 21); const i = s.indexOf('mary'); return `day ${d} stress ${pct(+s[i + 5])} lonely ${pct(+s[i + 6])}`; }).join(' · ')}`);
  console.log(`  slept: ${sleeps(mary.mind).join(' · ')}`);
  return h;
}

function compareStress(normalRun: Household, awayRun: Household): void {
  console.log('\n  MARY, NORMAL DAYS AGAINST JOHN-AWAY DAYS (days 2 and 3):');
  const sum = (h: Household) => {
    const m = h.people.get('mary')!.mind, d2 = m.memory.day(2), d3 = m.memory.day(3);
    const meals = m.memory.log.filter((e) => (e.activity === 'eatMeal') && e.kind !== 'finish' && e.kind !== 'interrupt' && e.kind !== 'fail' && e.at >= 86400 && e.at < 3 * 86400);
    return { meals: d2.meals + d3.meals, food: d2.foodMl + d3.foodMl, big: d2.bigMeals + d3.bigMeals, snacks: d2.snacks + d3.snacks, sleep: d2.sleepHours + d3.sleepHours, wander: (d2.pastimes.wander ?? 0) + (d3.pastimes.wander ?? 0), why: meals.map((e) => e.text.split(': ')[1]).slice(0, 4) };
  };
  const a = sum(normalRun), b = sum(awayRun);
  console.log(`    meals ${a.meals} -> ${b.meals}, food ${Math.round(a.food)} -> ${Math.round(b.food)} mL, big meals ${a.big} -> ${b.big}, snacks ${a.snacks} -> ${b.snacks}, wanders ${a.wander} -> ${b.wander}, sleep ${a.sleep.toFixed(1)} -> ${b.sleep.toFixed(1)} h`);
  console.log(`    why she ate, stressed: ${b.why.join(' | ')}`);
  check('john away', 'she eats more when stressed', b.food > a.food * 1.15, `${Math.round(a.food)} -> ${Math.round(b.food)} mL over two days`);
  check('john away', 'she snacks more', b.snacks >= a.snacks + 1, `${a.snacks} -> ${b.snacks}`);
  check('john away', 'her loneliness rose', (() => { const s = sampleAt(awayRun, 3, 21); return +s[s.indexOf('mary') + 6] > 0.5; })(), 'day 3 21:00');
  check('john away', 'John not counted at home', awayRun.people.get('john')!.mind.memory.day(2).meals === 0, `his day 2 meals: ${awayRun.people.get('john')!.mind.memory.day(2).meals}`);
}

function companion(): void {
  console.log('\n=== 7. COMPANION: Mary played (walking between rooms), John a companion, 10:00-12:00 ===');
  const h = new Household(10);
  const mary = h.add(MARY_PROFILE, MARY_BODY, 'manual'), john = h.add(JOHN_PROFILE, JOHN_BODY, 'companion');
  // (the player walks Mary from room to room, two game minutes in each)
  const stops: Vec2[] = ['kitchen', 'hall', 'bedroom', 'living', 'mainBedroom', 'kitchen'].map((r) => h.world.standSpots(r)[0]);
  let stop = 0, stay = 0, near = 0, samples = 0;
  h.runUntil(1, 12, () => {
    if (mary.body.mb.goTo(stops[stop % stops.length], null) === 'arrived') { stay += STEP * 6; if (stay > 120) { stay = 0; stop++; } }
    const a = mary.body.position(), b = john.body.position();
    samples++;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 4) near++;
  });
  const choices = john.mind.memory.log.filter((e) => e.kind === 'choose' || e.kind === 'switch' || e.kind === 'emergency').map((e) => e.activity);
  console.log(`  John's choices: ${[...new Set(choices)].map((a) => `${a} ${choices.filter((c) => c === a).length}`).join(', ')}`);
  check('companion', 'he stays near her', near / samples > 0.7, `within 4 m ${pct(near / samples)} of the time`);
}

function saveLoad(): void {
  console.log('\n=== 8. SAVE: Mary\'s mind saved on day 2 at 12:00 and loaded into a new one ===');
  const h = new Household(7);
  const mary = h.add(MARY_PROFILE, MARY_BODY);
  h.add(JOHN_PROFILE, JOHN_BODY);
  h.runUntil(2, 12);
  const json = JSON.stringify(mary.mind.save());
  const other = new Household(12);
  const copy = other.add(MARY_PROFILE, MARY_BODY);
  copy.mind.load(JSON.parse(json));
  const same = JSON.stringify(copy.mind.save()) === json;
  check('save', 'a saved mind loads back the same', same, `${(json.length / 1024).toFixed(1)} KB of JSON`);
}

/**
 * EVERY SPOT IN THE HOUSE: each thing's spot and its way in can be stood on (a body pushed no more than SPOT_REACH off
 * it by the walls, that thing and its kin let through), and the walk grid finds a way there from the hall and on from
 * the way in to the spot. (v0.2.179: the four dining chairs, the table, the desk and its chair and the kitchen window
 * could not be reached, and nothing said so.)
 */
function spots(): void {
  console.log('\n=== 0. SPOTS: every spot of every thing, with the game\'s walls and walk grid ===');
  const h = new Household(7), layout = h.world.layout;
  const walls = new HomeWalls(h.blocks, h.middle, layout.objects);
  const hall = layout.rooms.find((r) => r.kind === 'hall')!.rect;
  const from = { x: (hall.x0 + hall.x1) / 2, z: (hall.z0 + hall.z1) / 2 };
  const bad: string[] = [];
  let n = 0;
  for (const o of layout.objects) for (const s of o.slots) {
    n++;
    // (the thing let in only within LET_IN of its own spot, as when walking: a bed's, by its side where the way in is)
    const letIn = s.motion === 'lie' ? s.approach : s.use;
    const pushUse = s.motion === 'lie' ? 0 : spotPush(walls, o.id, s.use, letIn), pushIn = spotPush(walls, o.id, s.approach, letIn);
    const wayIn = h.nav.path(from, s.approach, o.id, letIn), wayOn = s.motion === 'lie' ? [] : h.nav.path(s.approach, s.use, o.id, letIn);
    if (pushUse > SPOT_REACH || pushIn > SPOT_REACH || !wayIn || !wayOn) {
      bad.push(`${o.name} ${s.id} (pushed ${pushUse.toFixed(2)} / ${pushIn.toFixed(2)} m${wayIn && wayOn ? '' : ', no way'})`);
    }
  }
  check('spots', 'every spot can be reached', bad.length === 0, bad.length ? bad.join('; ') : `all ${n} spots of ${layout.objects.length} things`);
}

// ---- RUN -----------------------------------------------------------------------------------------------------------

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const only = process.argv.slice(2);
const want = (name: string): boolean => !only.length || only.includes(name);
const t0 = performance.now();
let normalRun: Household | null = null;
if (want('spots')) spots();
if (want('normal') || want('away')) normalRun = normal();
if (want('pantry')) pantry();
if (want('blocked')) blocked();
if (want('toilet')) oneToilet();
if (want('takeover')) takeover();
if (want('away') || want('normal')) { const away = johnAway(); writeLog('away', away); if (normalRun) compareStress(normalRun, away); }
if (want('companion')) companion();
if (want('save')) saveLoad();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed in ${((performance.now() - t0) / 1000).toFixed(1)} s${failed.length ? `; FAILED: ${failed.map((f) => `${f.scenario}/${f.check}`).join('; ')}` : ''}`);
console.log(`decision logs and timelines: ${OUT}/`);
