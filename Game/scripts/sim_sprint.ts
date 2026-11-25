// ============================================================================
// sim_sprint.ts -- HER SPRINT, MEASURED WITHOUT DRAWING ANYTHING: the game's own pace (src/input/pace.ts) and vitals
// (src/vitals/heroineVitals.ts, which runs the builder's breathing and heart), stepped 60 times a second exactly as
// main.ts steps the one played: the MOVE stick's push sets her pace, her real speed is her vitals' work, her vitals
// limit her pace. Prints, at 0, 5, 10, 15 and 20 s of a full push, at empty stamina and after letting go: her speed
// (mph), stamina, effort, breaths a minute and heart rate; how long she takes to reach 13 mph; how long she stands
// winded. Then the TOP PACE (Joshua's handoff, 2026-11-23): a full push held under each ceiling, and the ceiling
// lowered from a sprint to a walk while she runs (her speed must come down smoothly, never jump).
//
// Joshua's handoff, 2026-11-23, asked for these readings ("Log at 0, 5, 10, 15, 20 seconds and at 0% stamina: actual
// speed (mph), stamina (%), effort, breaths/min, heart rate"); the numbers are in heroineVitals.ts `effort` and CLAUDE.md.
//
// RUN IT (from Game/; esbuild comes with Vite, `@charb` is the builder's folder as in vite.config.ts):
//   node_modules/.bin/esbuild scripts/sim_sprint.ts --bundle --platform=node --format=esm \
//     --alias:@charb=../Char_B/src --outfile=/tmp/sim_sprint.mjs && node /tmp/sim_sprint.mjs
// To compare with the builder's own effort curve (a 30 s rise, a sprint counted as 1): add `before`.
// ============================================================================

import { Pace } from '../src/input/pace';
import { HeroineVitals, VITALS_TUNING } from '../src/vitals/heroineVitals';

const FRAME = 1 / 60;
/** A walk's top speed, m/s (input/pace.ts PACES[0]). */
const PACE_WALK = new Pace().paceSpeed(0);
const MPH = 2.23694;
const before = process.argv.includes('before');
// (`old`: her breathing's climb as in v0.2.164-172, an effort time constant, not by pace)
if (process.argv.includes('old') || before) (VITALS_TUNING as unknown as { breathByPace: unknown }).breathByPace = null;
// (`rise=N`: try another rise time for her effort, in seconds, to compare)
const riseArg = process.argv.find((a) => a.startsWith('rise='));
if (riseArg) (VITALS_TUNING as unknown as { effort: { riseSeconds: number | null } }).effort.riseSeconds = Number(riseArg.slice(5));
// (`sprint=N`: try another share of her hardest for a sprint)
const sprintArg = process.argv.find((a) => a.startsWith('sprint='));
if (sprintArg) {
  const table = (VITALS_TUNING as unknown as { speedToIntensity: [number, number][] }).speedToIntensity;
  table[4] = [table[4][0], Number(sprintArg.slice(7))];
}
if (before) {
  // (the builder's own: its 30 s rise, and a sprint as her hardest)
  const tuning = VITALS_TUNING as unknown as { effort: { riseSeconds: number | null }; speedToIntensity: [number, number][] };
  tuning.effort.riseSeconds = null;
  tuning.speedToIntensity[4] = [tuning.speedToIntensity[4][0], 1];
}

/** A fresh, rested heroine (age 30, not pregnant), settled at rest for 20 s first. */
function fresh(): { pace: Pace; vitals: HeroineVitals } {
  const pace = new Pace();
  const vitals = new HeroineVitals({ age: 30, weeks: 0 });
  for (let i = 0; i < 20 / FRAME; i++) vitals.step(FRAME, { speed: 0, firing: false });
  return { pace, vitals };
}

/** One frame, as main.ts does it: her pace from the push and what her body allows, then her vitals from her speed. */
function frame(h: { pace: Pace; vitals: HeroineVitals }, push: number): void {
  h.pace.step(FRAME, push, h.vitals.reading);
  h.vitals.step(FRAME, { speed: h.pace.speed, firing: false, carrying: 0, pace: h.pace.level });
}

function line(tag: string, h: { pace: Pace; vitals: HeroineVitals }): string {
  const r = h.vitals.reading;
  return `${tag.padEnd(12)} ${(h.pace.speed * MPH).toFixed(1).padStart(5)} mph  stamina ${(r.stamina * 100).toFixed(0).padStart(3)}%` +
    `  effort ${r.effort.toFixed(2)}  breaths ${r.breathsPerMinute.toFixed(1).padStart(4)}  heart ${r.heartRate.toFixed(0)}`;
}

// ---- 1. A full sprint from rest to empty, then let go ----------------------------------------------------------------
{
  console.log(`=== A full sprint to empty (${before ? 'BEFORE: the builder\'s 30 s rise, sprint 1' : 'NOW'}) ===`);
  const h = fresh();
  let t = 0, at13 = -1, emptyAt = -1, bentFor = 0, walkOnly = 0;
  const marks = new Set([0, 5, 10, 15, 20]);
  console.log(line('0 s', h));
  while (emptyAt < 0 && t < 120) {
    frame(h, 1);
    t += FRAME;
    if (at13 < 0 && h.pace.speed * MPH >= 13) at13 = t;
    for (const m of marks) if (m > 0 && Math.abs(t - m) < FRAME / 2) console.log(line(`${m} s`, h));
    if (h.vitals.reading.stamina <= 0.001) { emptyAt = t; console.log(line(`0% (${t.toFixed(1)} s)`, h)); }
  }
  for (let s = 0; s < 60 / FRAME; s++) {
    frame(h, 0);
    const after = (s + 1) * FRAME;
    if (h.pace.holdLeft > 0) bentFor = after;
    if (h.pace.winded) walkOnly = after;
    for (const m of [5, 10, 20, 30]) if (Math.abs(after - m) < FRAME / 2) console.log(line(`stop+${m} s`, h));
  }
  console.log(`13 mph after ${at13.toFixed(1)} s; winded: bent over ${bentFor.toFixed(1)} s, then walking only until ${walkOnly.toFixed(1)} s after empty`);
}

// ---- 1b. Each pace held from rest (the top pace set to it, the stick at its edge): breaths a minute every 10 s, when
// her stamina is at 45 %, and how long it took (Joshua, 2026-11-25: each pace's top breathing reached by 45 % stamina)
{
  console.log('\n=== Each pace held from rest: breaths a minute (stamina) every 10 s, and at 45 % stamina ===');
  for (const [cap, name] of [[1, 'WALK'], [2, 'JOG'], [3, 'RUN'], [4, 'SPRINT']] as const) {
    const h = fresh();
    h.pace.ceiling = cap;
    let t = 0, at45 = -1;
    const cells: string[] = [];
    while (t < 90) {
      frame(h, 1);
      t += FRAME;
      const r = h.vitals.reading;
      if (at45 < 0 && r.stamina <= 0.45) { at45 = t; cells.push(`45% @${t.toFixed(0)} s: ${r.breathsPerMinute.toFixed(1)}`); }
      if (Math.abs(t / 10 - Math.round(t / 10)) < FRAME / 20 && Math.round(t) % 10 === 0)
        cells.push(`${Math.round(t)} s ${r.breathsPerMinute.toFixed(1)} (${(r.stamina * 100).toFixed(0)}%, ${r.heartRate.toFixed(0)})`);
    }
    console.log(`${name.padEnd(7)} ${cells.join(' · ')}`);
  }
}

// ---- 2. The top pace: a full push under each ceiling -------------------------------------------------------------------
{
  console.log('\n=== The top pace: the stick held at its edge for 6 s under each ===');
  for (const [cap, name] of [[1, 'WALK'], [2, 'JOG'], [3, 'RUN'], [4, 'SPRINT']] as const) {
    const h = fresh();
    h.pace.ceiling = cap;
    for (let i = 0; i < 6 / FRAME; i++) frame(h, 1);
    console.log(`${name.padEnd(7)} ${(h.pace.speed * MPH).toFixed(1).padStart(5)} mph (${h.pace.name})`);
  }
}

// ---- 3. Lowered while she sprints: from a sprint to a walk, her speed every half second --------------------------------
{
  console.log('\n=== Sprinting, then the top pace set to WALK: her speed every half second (no jump) ===');
  const h = fresh();
  for (let i = 0; i < 5 / FRAME; i++) frame(h, 1);
  h.pace.ceiling = 1;
  const speeds: string[] = [];
  let biggest = 0, was = h.pace.speed;
  for (let i = 1; i <= 4 / FRAME; i++) {
    frame(h, 1);
    biggest = Math.max(biggest, Math.abs(h.pace.speed - was) / FRAME);
    was = h.pace.speed;
    if (i % 30 === 0) speeds.push((h.pace.speed * MPH).toFixed(1));
  }
  console.log(`${speeds.join(' -> ')} mph; the quickest change ${biggest.toFixed(1)} m/s each second`);
}

// ---- 4. Pushing on while winded (Joshua, 2026-11-24, his screenshot: 0% stamina, still running at 8.8 mph): --------
// a sprint to empty, the stick let go while she stands bent over, then pushed straight back to its edge while she is
// still winded (her stamina nowhere near full). She must only walk until her breath is back; and if she ever comes to
// empty again, she must stop and stand winded again.
{
  console.log('\n=== Winded, then the stick straight back to its edge (her stamina not back to full) ===');
  const h = fresh();
  while (h.vitals.reading.stamina > 0.001) frame(h, 1);
  while (h.pace.holdLeft > 0) frame(h, 0);
  let fastest = 0, emptyMoving = 0, holds = 0, wasHeld = false;
  for (let i = 0; i < 60 / FRAME; i++) {
    frame(h, 1);
    const held = h.pace.holdLeft > 0;
    if (held && !wasHeld) holds++;
    wasHeld = held;
    if (h.pace.winded && !held) fastest = Math.max(fastest, h.pace.speed);
    if (h.vitals.reading.stamina <= 0.001 && h.pace.speed > PACE_WALK + 0.05) emptyMoving += FRAME;
  }
  console.log(`while winded at most ${(fastest * MPH).toFixed(1)} mph (a walk is ${(PACE_WALK * MPH).toFixed(1)}); ` +
    `seconds faster than a walk at 0% stamina: ${emptyMoving.toFixed(1)}; bent over again ${holds} time(s) in 60 s`);
}
