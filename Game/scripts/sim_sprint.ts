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
// (v0.2.174: the whole new physiology, every pace, energy, John, pregnancy and the upgrades, is in sim_physiology.ts.)
// ============================================================================

import { Pace } from '../src/input/pace';
import { HeroineVitals } from '../src/vitals/heroineVitals';

const FRAME = 1 / 60;
/** A walk's top speed, m/s (input/pace.ts PACES[0]). */
const PACE_WALK = new Pace().paceSpeed(0);
const MPH = 2.23694;

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
  h.vitals.step(FRAME, { speed: h.pace.speed, firing: false });
}

function line(tag: string, h: { pace: Pace; vitals: HeroineVitals }): string {
  const r = h.vitals.reading;
  return `${tag.padEnd(12)} ${(h.pace.speed * MPH).toFixed(1).padStart(5)} mph  stamina ${(r.stamina * 100).toFixed(0).padStart(3)}%` +
    `  effort ${r.effort.toFixed(2)}  breaths ${r.breathsPerMinute.toFixed(1).padStart(4)}  heart ${r.heartRate.toFixed(0)}`;
}

// ---- 1. A full sprint from rest to empty, then let go ----------------------------------------------------------------
{
  console.log('=== A full sprint to empty ===');
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

// ---- 1b. Each pace held from rest (the top pace set to it, the stick at its edge): breaths a minute every 10 s, and
// when her stamina is at 45 % (Joshua, 2026-11-25: each pace's top breathing reached by about half her pool)
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
// still winded (her stamina nowhere near full). Since v0.2.174 her paces come back one by one (jog at 20% of her pool,
// run 30%, sprint 40%); if she ever comes to empty again, she must stop and stand winded again.
{
  console.log('\n=== A jog to empty, winded, then the stick straight back to its edge, top pace SPRINT ===');
  // (a JOG to empty: its winded hold is short, so she is still low when she can move; after a sprint the 20 s hold
  //  refills her past 40% before she can)
  const h = fresh();
  h.pace.ceiling = 2;
  while (h.vitals.reading.stamina > 0.001) frame(h, 1);
  frame(h, 0);   // (her pace reads the empty bar on the next frame: the hold starts)
  while (h.pace.holdLeft > 0) frame(h, 0);
  h.pace.ceiling = 4;
  // (her stamina's share of her pool the first time she goes faster than a walk, a jog and a run; and how often she
  //  is dropped from a pace she had back to a slower one without going empty: there must be none, no flicking)
  const firstOver = [-1, -1, -1];
  let emptyMoving = 0, holds = 0, wasHeld = false, drops = 0, lastRegained = h.pace.regained;
  const speeds = [new Pace().paceSpeed(0), new Pace().paceSpeed(1), new Pace().paceSpeed(2)];
  for (let i = 0; i < 60 / FRAME; i++) {
    frame(h, 1);
    const held = h.pace.holdLeft > 0;
    if (held && !wasHeld) holds++;
    wasHeld = held;
    const share = h.vitals.reading.stamina / h.vitals.reading.staminaPool;
    for (let k = 0; k < 3; k++) if (firstOver[k] < 0 && h.pace.speed > speeds[k] + 0.1) firstOver[k] = share;
    if (!held && h.pace.regained < lastRegained && h.pace.regained > 1) drops++;
    lastRegained = h.pace.regained;
    if (h.vitals.reading.stamina <= 0.001 && h.pace.speed > PACE_WALK + 0.05) emptyMoving += FRAME;
  }
  const pct = (v: number) => (v < 0 ? 'never' : `${(v * 100).toFixed(0)}%`);
  console.log(`first faster than a walk at ${pct(firstOver[0])} of her pool, than a jog at ${pct(firstOver[1])}, than a run at ${pct(firstOver[2])}; ` +
    `dropped back without emptying: ${drops}; seconds faster than a walk at 0% stamina: ${emptyMoving.toFixed(1)}; bent over again ${holds} time(s) in 60 s`);
}
