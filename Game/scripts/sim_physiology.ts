// ============================================================================
// sim_physiology.ts -- THE v0.2.174 PHYSIOLOGY, MEASURED WITHOUT DRAWING ANYTHING (Joshua's decisions of 2026-11-25,
// the "GDM Physiology Design Review" doc). The game's own pace (src/input/pace.ts) and vitals (src/vitals/
// heroineVitals.ts), stepped 60 times a second exactly as main.ts steps the one played: the MOVE stick's push and the
// top pace set her pace, her real speed is her vitals' work, her vitals limit her pace. Prints:
//   1. each pace held from full to empty, then standing: breathing / heart on the way, how long, the winded hold, when
//      each pace comes back (jog 20%, run 30%, sprint 40% of her pool), stamina full again, her heart afterwards
//   2. her pool and times at 100, 75, 50, 30 and 10% energy (and walking only at 0)
//   3. Mary and John at the same speeds (his heart; his lungs are the builder's to add)
//   4. pregnant at full term, her slower paces
//   5. hills and a pack, and the four upgrades
//   6. energy: what a sprint, a jog and a rest cost and give back; a waking day and a night's sleep
// The numbers to expect are the doc's (CLAUDE.md v0.2.174 has them too).
//
// RUN IT (from Game/; esbuild comes with Vite, `@charb` is the builder's folder as in vite.config.ts):
//   node_modules/.bin/esbuild scripts/sim_physiology.ts --bundle --platform=node --format=esm \
//     --alias:@charb=../Char_B/src --outfile=/tmp/sim_physiology.mjs && node /tmp/sim_physiology.mjs
// ============================================================================

import { Pace, PACES } from '../src/input/pace';
import { HeroineVitals, type HeroineBody, type VitalsInput } from '../src/vitals/heroineVitals';

const FRAME = 1 / 60;
const MPH = 2.23694;
const MARY: HeroineBody = { age: 30, weeks: 0 };
const JOHN: HeroineBody = { age: 32, weeks: 0, male: true };
const fmt = (s: number): string => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

type Who = { pace: Pace; vitals: HeroineVitals; x: number; grade: number; loadKg: number };

/** A fresh, rested heroine, settled at rest for 20 s first. */
function fresh(body: HeroineBody = MARY, setUp?: (v: HeroineVitals) => void): Who {
  const vitals = new HeroineVitals(body);
  setUp?.(vitals);
  const h: Who = { pace: new Pace(), vitals, x: 0, grade: 0, loadKg: 0 };
  for (let i = 0; i < 20 / FRAME; i++) vitals.step(FRAME, { speed: 0, firing: false });
  return h;
}

/** One frame, as main.ts does it; she walks along x, up `grade` (the ground's height follows). */
function frame(h: Who, push: number): void {
  h.pace.step(FRAME, push, h.vitals.reading);
  h.x += h.pace.speed * FRAME;
  const input: VitalsInput = { speed: h.pace.speed, firing: false, ground: { x: h.x, z: 0, y: h.x * h.grade }, loadKg: h.loadKg };
  h.vitals.step(FRAME, input);
}

const r = (h: Who) => h.vitals.reading;
const bh = (h: Who) => `${r(h).breathsPerMinute.toFixed(1)} / ${r(h).heartRate.toFixed(0)}`;

/** Held at a pace (the top pace set to it, the stick at its edge) until empty or `most` seconds. */
function hold(h: Who, cap: number, most = 1800): number {
  h.pace.ceiling = cap;
  let t = 0;
  while (t < most && r(h).stamina > 0.001) { frame(h, 1); t += FRAME; }
  return t;
}

// ---- 1. Each pace from full to empty, then standing ---------------------------------------------------------------
{
  console.log('=== 1. Each pace from full to empty, then standing (Mary, starting fitness, full energy, flat) ===');
  for (const [cap, name] of [[2, 'JOG'], [3, 'RUN'], [4, 'SPRINT']] as const) {
    const h = fresh();
    h.pace.ceiling = cap;
    const marks: string[] = [];
    let t = 0, top = 0, topAt = 0;
    while (r(h).stamina > 0.001 && t < 1800) {
      frame(h, 1); t += FRAME;
      if (r(h).breathsPerMinute > top + 0.05) { top = r(h).breathsPerMinute; topAt = t; }
      for (const m of [5, 10, 20, 30, 60]) if (Math.abs(t - m) < FRAME / 2) marks.push(`${m} s ${bh(h)} (${(r(h).stamina * 100).toFixed(0)}%)`);
    }
    const empty = t;
    const after: string[] = [];
    let bent = 0, jogBack = -1, runBack = -1, sprintBack = -1, full = -1;
    for (let u = FRAME; u <= 300; u += FRAME) {
      frame(h, 0);
      if (h.pace.holdLeft > 0) bent = u;
      const share = r(h).stamina / r(h).staminaPool;
      if (jogBack < 0 && share >= 0.2) jogBack = u;
      if (runBack < 0 && share >= 0.3) runBack = u;
      if (sprintBack < 0 && share >= 0.4) sprintBack = u;
      if (full < 0 && share >= 0.999) full = u;
      for (const m of [10, 30, 60, 120, 180]) if (Math.abs(u - m) < FRAME / 2) after.push(`+${m} s ${bh(h)}`);
    }
    console.log(`${name.padEnd(7)} empty at ${fmt(empty)}; breathing top ${top.toFixed(1)} at ${fmt(topAt)}`);
    console.log(`        on the way: ${marks.join(' · ')}`);
    console.log(`        after: bent over ${bent.toFixed(1)} s; jog back +${jogBack.toFixed(1)} s, run +${runBack.toFixed(1)} s, sprint +${sprintBack.toFixed(1)} s; full +${full.toFixed(1)} s`);
    console.log(`        breathing / heart ${after.join(' · ')}`);
  }
  const w = fresh();
  for (let i = 0; i < 60 / FRAME; i++) frame(w, 1), (w.pace.ceiling = 1);
  console.log(`WALK    a minute in: ${bh(w)}, stamina ${(r(w).stamina * 100).toFixed(0)}% (refills)`);
}

// ---- 2. Energy and the pool ----------------------------------------------------------------------------------------
{
  console.log('\n=== 2. Her pool and times by energy (straight line, no floor) ===');
  for (const e of [1, 0.75, 0.5, 0.3, 0.1, 0]) {
    const times: string[] = [];
    for (const [cap, name] of [[4, 'sprint'], [3, 'run'], [2, 'jog']] as const) {
      const h = fresh(MARY, (v) => v.setEnergy(e));
      times.push(`${name} ${fmt(hold(h, cap))}`);
    }
    const h = fresh(MARY, (v) => v.setEnergy(e));
    h.pace.ceiling = 4;
    for (let i = 0; i < 3 / FRAME; i++) frame(h, 1);
    console.log(`${String(Math.round(e * 100)).padStart(3)}% energy: pool ${(r(h).staminaPool * 100).toFixed(0)} · ${e > 0 ? times.join(' · ') : 'only a walk'} · after 3 s of a full push ${(h.pace.speed * MPH).toFixed(1)} mph`);
  }
}

// ---- 3. Mary and John ----------------------------------------------------------------------------------------------
{
  console.log('\n=== 3. Mary and John at the same speeds, settled (breaths / heart), and how long ===');
  for (const [cap, name] of [[1, 'walk'], [2, 'jog'], [3, 'run'], [4, 'sprint']] as const) {
    const cells: string[] = [];
    for (const [who, body] of [['Mary', MARY], ['John', JOHN]] as const) {
      const h = fresh(body);
      h.pace.ceiling = cap;
      for (let i = 0; i < 20 / FRAME; i++) frame(h, 1);
      const settled = bh(h);
      const k = fresh(body);
      const t = cap === 1 ? null : hold(k, cap);
      cells.push(`${who} ${settled}${t === null ? '' : `, empty ${fmt(t)}`}`);
    }
    console.log(`${name.padEnd(7)} ${cells.join('   ')}`);
  }
}

// ---- 4. Pregnant at full term -----------------------------------------------------------------------------------------
{
  console.log('\n=== 4. Pregnant at full term (week 40), her full-term paces ===');
  for (const [cap, name] of [[1, 'walk'], [2, 'jog'], [3, 'run'], [4, 'sprint']] as const) {
    const h = fresh({ age: 28, weeks: 40 });
    h.pace.carrying = 1;
    const t = hold(h, cap, 900);
    console.log(`${name.padEnd(7)} ${(h.pace.speed * MPH).toFixed(1)} mph: ${t >= 899 ? 'never empties' : `empty at ${fmt(t)}`}`);
  }
}

// ---- 5. Hills, a pack, the upgrades -------------------------------------------------------------------------------
{
  console.log('\n=== 5. Hills and a pack (from full), and the upgrades ===');
  for (const [name, cap, grade, kg] of [['walk up 10%', 1, 0.1, 0], ['jog up 5%', 2, 0.05, 0], ['jog down 5%', 2, -0.05, 0], ['run up 5%', 3, 0.05, 0], ['jog, 10 kg pack', 2, 0, 10]] as const) {
    const h = fresh();
    h.grade = grade; h.loadKg = kg;
    const t = hold(h, cap, 900);
    console.log(`${name.padEnd(16)} ${t >= 899 ? 'never empties' : `empty at ${fmt(t)}`} (effort ${r(h).effort.toFixed(2)})`);
  }
  for (const fit of [0, 0.2, 0.4, 0.6, 1]) {
    const times = ([[2, 'jog'], [3, 'run'], [4, 'sprint']] as const).map(([cap, name]) => {
      const h = fresh(MARY, (v) => { v.fitness = fit; });
      const t = hold(h, cap, 1500);
      return `${name} ${t >= 1499 ? 'never' : fmt(t)}`;
    });
    console.log(`fitness ${String(Math.round(fit * 100)).padStart(3)}: ${times.join(' · ')}`);
  }
  for (const [name, set] of [['endurance 100', (v: HeroineVitals) => { v.endurance = 1; }], ['recovery 100', (v: HeroineVitals) => { v.recovery = 1; }], ['strength 100, jog up 5%', (v: HeroineVitals) => { v.strength = 1; }]] as const) {
    const h = fresh(MARY, set);
    if (name.includes('up')) h.grade = 0.05;
    const t = hold(h, name.includes('up') ? 2 : 4);
    let back = 0;
    for (let u = FRAME; u <= 300 && r(h).stamina / r(h).staminaPool < 0.999; u += FRAME) { frame(h, 0); back = u; }
    console.log(`${name.padEnd(24)} empty at ${fmt(t)}, full again ${fmt(back)} standing`);
  }
}

// ---- 6. Energy --------------------------------------------------------------------------------------------------------
// (since 2026-11-26 two parts: SLEEPINESS on game time, at the normal 6x here, and FATIGUE in real minutes)
{
  console.log('\n=== 6. Energy (sleepiness on game time at 6x, fatigue in real minutes) ===');
  const parts = (h: Who): string => `energy ${(r(h).energy * 100).toFixed(1)}% (sleepy ${(r(h).sleepiness * 100).toFixed(1)}, tired ${(r(h).fatigue * 100).toFixed(1)})`;
  const h = fresh();
  hold(h, 4);
  console.log(`a sprint to empty: ${parts(h)}`);
  const j = fresh();
  hold(j, 2);
  console.log(`a jog to empty: ${parts(j)}`);
  for (let i = 0; i < 300 / FRAME; i++) frame(j, 0);
  console.log(`  then standing 5 minutes: ${parts(j)} (fatigue back 1% a minute after the first; sleepiness only rises)`);
  const s = fresh(MARY, (v) => v.setEnergy(0.5));
  for (let i = 0; i < 300 / FRAME; i++) frame(s, 0);
  console.log(`standing 5 minutes from 50% (all sleepiness): ${parts(s)} (only sleep brings it back)`);
  const n = fresh();
  n.vitals.passTime(16, false);
  console.log(`16 game hours awake and still: ${parts(n)}`);
  n.vitals.passTime(8, true);
  console.log(`  then 8 hours asleep: ${parts(n)}`);
}

void PACES;
