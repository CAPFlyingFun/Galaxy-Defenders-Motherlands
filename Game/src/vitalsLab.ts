// ============================================================================
// vitalsLab.ts -- the Vitals Lab test page (vitals-lab.html).
//
// A place to try the heroine's vitals without the 3D game: pick what she is
// doing (standing, walking, jogging, running, sprinting), hold FIRE, give her
// a snack or a drink, hit her, and watch her heart rate, breathing, stamina,
// health, food, water and stomach respond. The clock can be run faster to see
// a whole ten-minute mission in under a minute.
//
// The game itself is not touched by this page; it only uses the same vitals
// model (src/vitals/heroineVitals.ts) and the same on-screen card
// (src/vitals/vitalsPanel.ts) the game will use.
// ============================================================================
import { HeroineVitals } from './vitals/heroineVitals';
import { VitalsPanel } from './vitals/vitalsPanel';

// Blaze for the test: 28 years old, 30 weeks pregnant (the builder's vitals take both into account).
const BODY = { age: 28, weeks: 30 };
let vitals = new HeroineVitals(BODY);
const panel = new VitalsPanel();
document.getElementById('card')!.appendChild(panel.element);

// What she is doing: a name and a ground speed (metres a second).
const PACES = [
  { name: 'Stand', speed: 0 },
  { name: 'Walk', speed: 1.1 },
  { name: 'Jog', speed: 2.4 },
  { name: 'Run', speed: 3.8 },
  { name: 'Sprint', speed: 5.5 },
];
let speed = 0;
let firing = false;
let clockRate = 1;
let played = 0; // seconds of play so far

/** Make a button in the row `rowId`. */
function button(rowId: string, text: string, onTap: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', () => onTap(b));
  document.getElementById(rowId)!.appendChild(b);
  return b;
}

/** Light up one button of a group and dim the others. */
function choose(group: HTMLButtonElement[], chosen: HTMLButtonElement): void {
  for (const b of group) b.classList.toggle('on', b === chosen);
}

// The pace buttons.
const paceButtons: HTMLButtonElement[] = [];
for (const pace of PACES) {
  const b = button('pace', pace.name, (self) => {
    speed = pace.speed;
    choose(paceButtons, self);
  });
  paceButtons.push(b);
}
paceButtons[0].classList.add('on');

// Actions.
button('acts', 'Fire: off', (b) => {
  firing = !firing;
  b.textContent = firing ? 'Fire: ON' : 'Fire: off';
  b.classList.toggle('on', firing);
});
button('acts', 'Snack (150 mL)', () => vitals.consume(150, 0));
button('acts', 'Drink (250 mL)', () => vitals.consume(0, 250));
button('acts', 'Meal (400 + 300)', () => vitals.consume(400, 300));
button('acts', 'Hit (-15)', () => vitals.changeHealth(-15));
button('acts', 'Med kit (+25)', () => vitals.changeHealth(25));
button('acts', 'Start over', () => {
  vitals = new HeroineVitals(BODY);
  played = 0;
});

// The clock.
const clockButtons: HTMLButtonElement[] = [];
for (const rate of [1, 10, 30]) {
  const b = button('clock', `${rate}x`, (self) => {
    clockRate = rate;
    choose(clockButtons, self);
  });
  clockButtons.push(b);
}
clockButtons[0].classList.add('on');

const numbers = document.getElementById('numbers')!;
const percent = (share: number) => `${(share * 100).toFixed(0)}%`;
let lastTime = performance.now();
let lastText = '';

function frame(now: number): void {
  // Real seconds since the last frame (capped, so a page left in the background does not jump ahead).
  const real = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  // A faster clock is taken as many small steps, so the result is the same as playing it at normal speed.
  for (let i = 0; i < clockRate; i++) vitals.step(real, { speed, firing });
  played += real * clockRate;

  const r = vitals.reading;
  panel.show(r);
  const minutes = Math.floor(played / 60);
  const seconds = Math.floor(played % 60).toString().padStart(2, '0');
  const text = [
    `time played    ${minutes}:${seconds}`,
    `heart rate     ${r.heartRate.toFixed(0)} beats/min`,
    `breathing      ${r.breathsPerMinute.toFixed(0)} breaths/min, ${r.breathLitres.toFixed(2)} L each`,
    `effort felt    ${percent(r.effort)}`,
    `stamina        ${percent(r.stamina)}`,
    `health         ${r.health.toFixed(0)}`,
    `food           ${percent(r.food)}`,
    `water          ${percent(r.water)}`,
    `stomach        ${percent(r.stomach)} full`,
    `belly          +${r.bellyExtra.toFixed(1)} points`,
    `top speed      ${percent(r.speedShare)} of full`,
  ].join('\n');
  if (text !== lastText) {
    numbers.textContent = text;
    lastText = text;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
