// ============================================================================
// sim_stamina_breath.ts -- HER STAMINA TIED TO HER BREATHING, MEASURED (Joshua, 2026-11-25, planning: "tie stamina
// drain to the bpm, so it actually doesn't start draining until the bpm passes the max for walking"; drain 8.5 % of
// her breathing a second, refill 3 % of it). Nothing is drawn: the game's own pace (src/input/pace.ts) and vitals
// (src/vitals/heroineVitals.ts, which runs the builder's breathing and heart), stepped 60 times a second as main.ts
// steps the one played, with VITALS_TUNING.staminaByBreath switched on.
//
// For each pace, from fresh (the top pace set to it, the stick at its edge): when her breathing reaches the pace's top
// and her stamina then, the drain at the top, when she is empty. Then, from empty: the refill standing (bent over,
// then standing still) and walking, how fast it starts and how long to 50 % and 100 %.
//
// RUN IT (from Game/):
//   node_modules/.bin/esbuild scripts/sim_stamina_breath.ts --bundle --platform=node --format=esm \
//     --alias:@charb=../Char_B/src --outfile=/tmp/sim_stamina_breath.mjs && node /tmp/sim_stamina_breath.mjs
// Options (the game's own tuning when left out): line=26 drain=8.5 refill=4.25 walk=20 jog=32 run=40 sprint=48 (breaths a
// minute; drain and refill are % of her
// breathing, read as % of a full bar a second: 8.5 % of 32 breaths a minute is 2.72 % a second).
// ============================================================================

import { Pace } from '../src/input/pace';
import { HeroineVitals, VITALS_TUNING } from '../src/vitals/heroineVitals';

const FRAME = 1 / 60;
const arg = (name: string, fallback: number): number => {
  const a = process.argv.find((x) => x.startsWith(`${name}=`));
  return a ? Number(a.slice(name.length + 1)) : fallback;
};

// (the settings tried, written over the game's tuning for this run only)
const tuning = VITALS_TUNING as unknown as {
  staminaByBreath: { line: number; drainPercent: number; refillPercent: number } | null;
  breathByPace: { tops: [number, number][] } | null;
};
const sb0 = tuning.staminaByBreath ?? { line: 26, drainPercent: 8.5, refillPercent: 4.25 };
tuning.staminaByBreath = { line: arg('line', sb0.line), drainPercent: arg('drain', sb0.drainPercent), refillPercent: arg('refill', sb0.refillPercent) };
const tops = tuning.breathByPace!.tops;
tops[1] = [tops[1][0], arg('walk', tops[1][1])];
tops[2] = [tops[2][0], arg('jog', tops[2][1])];
tops[3] = [tops[3][0], arg('run', tops[3][1])];
tops[4] = [tops[4][0], arg('sprint', tops[4][1])];

type Heroine = { pace: Pace; vitals: HeroineVitals };

/** A fresh, rested heroine (age 30, not pregnant), settled at rest for 20 s first. */
function fresh(): Heroine {
  const pace = new Pace();
  const vitals = new HeroineVitals({ age: 30, weeks: 0 });
  for (let i = 0; i < 20 / FRAME; i++) vitals.step(FRAME, { speed: 0, firing: false });
  return { pace, vitals };
}

/** One frame, as main.ts does it: her pace from the push and what her body allows, then her vitals. */
function frame(h: Heroine, push: number): void {
  h.pace.step(FRAME, push, h.vitals.reading);
  h.vitals.step(FRAME, { speed: h.pace.speed, firing: false, carrying: 0, pace: h.pace.level });
}

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;
const f1 = (x: number): string => x.toFixed(1);

console.log(`line ${tuning.staminaByBreath!.line} · drain ${tuning.staminaByBreath!.drainPercent}% · refill ` +
  `${tuning.staminaByBreath!.refillPercent}% (of her breathing, as % of a full bar a second) · tops walk ${tops[1][1]}, ` +
  `jog ${tops[2][1]}, run ${tops[3][1]}, sprint ${tops[4][1]}\n`);

// ---- 1. Each pace from fresh to empty -----------------------------------------------------------------------------------
for (const [cap, name] of [[2, 'JOG'], [3, 'RUN'], [4, 'SPRINT']] as const) {
  const h = fresh();
  h.pace.ceiling = cap;
  const top = tops[cap][1];
  let t = 0, topAt = -1, topStamina = 0, drainAtTop = 0, emptyAt = -1, firstDrain = -1, was = 1;
  while (t < 300 && emptyAt < 0) {
    frame(h, 1);
    t += FRAME;
    const r = h.vitals.reading;
    const perSecond = (r.stamina - was) / FRAME;
    was = r.stamina;
    if (firstDrain < 0 && perSecond < -1e-4) firstDrain = t;
    if (topAt < 0 && r.breathsPerMinute >= top - 0.2) { topAt = t; topStamina = r.stamina; drainAtTop = -perSecond; }
    if (r.stamina <= 0.001) emptyAt = t;
  }
  console.log(`${name.padEnd(7)} top ${top} at ${f1(topAt)} s (stamina ${pct(topStamina)}), draining from ${f1(firstDrain)} s, ` +
    `${(drainAtTop * 100).toFixed(2)}%/s at the top, empty at ${f1(emptyAt)} s`);

  for (const after of ['stand', 'walk'] as const) {
    // (run the same pace to empty again on a new heroine, then recover this way)
    const k = fresh();
    k.pace.ceiling = cap;
    while (k.vitals.reading.stamina > 0.001) frame(k, 1);
    // (from empty: walking, the stick is held at its edge with the top pace at a walk; she walks once her hold ends)
    let s = 0, at50 = -1, at100 = -1, startRate = 0;
    const start = k.vitals.reading.stamina, breathAtStop = k.vitals.reading.breathsPerMinute;
    k.pace.ceiling = 1;
    while (s < 400 && at100 < 0) {
      frame(k, after === 'walk' ? 1 : 0);
      s += FRAME;
      const r = k.vitals.reading;
      if (Math.abs(s - 2) < FRAME / 2) startRate = (r.stamina - start) / 2;   // (the first two seconds' refill, a second: she is still slowing to a stop for part of the first)
      if (at50 < 0 && r.stamina >= 0.5) at50 = s;
      if (r.stamina >= 0.999) at100 = s;
    }
    console.log(`        from empty, ${after === 'stand' ? 'standing' : 'walking '}: breathing ${f1(breathAtStop)} at the stop, ` +
      `refill ${(startRate * 100).toFixed(2)}%/s over the first 2 s, 50% at ${f1(at50)} s, full at ${f1(at100)} s`);
  }
}

// ---- 2. Walking and standing from fresh at half stamina ------------------------------------------------------------------
{
  console.log('');
  for (const [push, what] of [[0, 'standing'], [1, 'walking ']] as const) {
    const h = fresh();
    h.pace.ceiling = 1;
    (h.vitals as unknown as { vitals: { energy: number } }).vitals.energy = 0.5;
    let s = 0, at100 = -1;
    const rates: string[] = [];
    let last = 0.5;
    while (s < 400 && at100 < 0) {
      frame(h, push);
      s += FRAME;
      const r = h.vitals.reading;
      if ([10, 30, 60].some((m) => Math.abs(s - m) < FRAME / 2)) rates.push(`${Math.round(s)} s ${(((r.stamina - last) / FRAME) * 100).toFixed(2)}%/s (${f1(r.breathsPerMinute)})`);
      last = r.stamina;
      if (r.stamina >= 0.999) at100 = s;
    }
    console.log(`From 50 % at rest, ${what}: refill ${rates.join(' · ')}, full at ${f1(at100)} s`);
  }
}
