// ============================================================================
// mind/emotions.ts -- HOW A CHARACTER FEELS: eight feelings, each 0..1, moved by their needs, what they are doing, who is
// around, danger, and the story; each easing toward where those put it at its own pace, in GAME hours.
//
// Joshua's brief, section 7: "Emotional states could include: happiness, stress, nervousness, fear, loneliness,
// sadness, excitement, comfort. Emotions should respond to experiences, surroundings, relationships and storyline
// events." And section 8: while John is away Mary "may become increasingly stressed, nervous or lonely", and her
// personality answers it (her stress eating: profile.ts, activities.ts).
//
// WHAT MOVES EACH (all GAME TUNING, first numbers to tune by watching the simulation):
//   loneliness   up while their partner is away (most), slowly while nobody talks with them; down fast in a chat
//   stress       unmet needs, loneliness, fear and story worries push it up; rest, comfort and sleep bring it down
//   sadness      story sorrows and long loneliness, slow both ways
//   nervousness  fear, or stress past a point; quick
//   fear         the vitals' own (danger: heroineVitals.ts), as it is
//   excitement   new and absorbing things, story news; it fades within the hour
//   comfort      how they are resting (lying, a soft seat, standing, walking), less what they need
//   happiness    their mood (the vitals'), comfort, enjoying a pastime, less stress, sadness and loneliness
// ============================================================================
import type { EmotionBase } from './profile';

export interface EmotionState {
  happiness: number;
  stress: number;
  nervousness: number;
  fear: number;
  loneliness: number;
  sadness: number;
  excitement: number;
  comfort: number;
}

export type Emotion = keyof EmotionState;
export const EMOTIONS: readonly Emotion[] = ['happiness', 'stress', 'nervousness', 'fear', 'loneliness', 'sadness', 'excitement', 'comfort'];

/** What the feelings answer to this step (the mind gathers it: mind.ts). */
export interface EmotionInputs {
  /** how pressing their needs are together, 0 met .. 1 desperate */
  readonly unmetNeeds: number;
  /** the vitals' mood and fear, 0..1 */
  readonly mood: number;
  readonly fear: number;
  /** their partner is away from home (the story: John on the expedition) */
  readonly partnerAway: boolean;
  /** talking with someone now */
  readonly talking: boolean;
  /** someone else is in the same room */
  readonly company: boolean;
  /** how restful their pose and place are now: 0.35 walking .. 0.9 lying down */
  readonly restful: number;
  /** enjoying a pastime now (its appeal, 0..1) */
  readonly enjoying: number;
  /** asleep */
  readonly asleep: boolean;
  /** their social and affectionate traits, 0..1 (loneliness comes sooner to the social) */
  readonly social: number;
}

/** How fast each feeling eases toward where it is put, game hours (95% of the way is 3 of them). Rising | falling. */
const PACE = {
  loneliness: [8, 1.5],
  stress: [2, 3],
  sadness: [8, 10],
  nervousness: [0.3, 0.6],
  excitement: [0.1, 0.6],
  comfort: [0.25, 0.25],
  happiness: [1, 1],
} as const;

/** A story event's push: each feeling it moves, by how much (0..1, added at once, then it fades as below). */
export type StoryPush = Partial<Record<'stress' | 'sadness' | 'excitement' | 'nervousness', number>>;

/** A character's feelings. */
export class Emotions {
  readonly state: EmotionState;
  /**
   * WORRIES THE STORY HAS GIVEN THEM, still on their mind: a stress and a sorrow that fade over a game day or two
   * (`storyFadeHours`), holding their stress and sadness up meanwhile.
   */
  private storyStress = 0;
  private storySorrow = 0;
  private readonly storyFadeHours = 30;
  /**
   * WORRY: the part of their stress that is NOT their body's needs (their base, loneliness, fear, the story's worries,
   * less what calms them), at stress's own pace. It is what a stress eater eats over (activities.ts `levelsNow`): an
   * empty stomach in the morning stresses them a little, but it is hunger, not emotional eating, and counted as
   * stress it ate earlier and earlier the hungrier it got.
   */
  private worried = 0;
  get worry(): number { return this.worried; }

  constructor(private readonly base: EmotionBase) {
    this.state = { happiness: base.happiness, stress: base.stress, nervousness: 0, fear: 0, loneliness: 0.1, sadness: 0, excitement: 0, comfort: base.comfort };
  }

  /** One step of `hours` game hours. */
  update(hours: number, i: EmotionInputs): void {
    if (!(hours > 0)) return;
    const s = this.state;
    this.storyStress *= Math.exp(-hours / this.storyFadeHours);
    this.storySorrow *= Math.exp(-hours / this.storyFadeHours);
    // loneliness: their partner away pulls it toward 1; at home, with nobody to talk to, it creeps toward a third (the
    // social sooner); a chat takes it away
    const lonelyWant = i.talking ? 0 : i.partnerAway ? 1 : i.company ? 0.12 : 0.25 + 0.15 * i.social;
    ease(s, 'loneliness', lonelyWant, hours, i.talking ? 0.4 : undefined);
    // stress: their base, their needs, loneliness, fear and the story's worries; rest, comfort and sleep ease it
    const calming = i.asleep ? 0.25 : 0.12 * Math.max(0, i.restful - 0.5) / 0.4 + 0.08 * i.enjoying;
    const worryWant = clamp01(this.base.stress + 0.35 * s.loneliness + 0.4 * i.fear + this.storyStress - calming);
    const stressWant = clamp01(worryWant + 0.45 * i.unmetNeeds);
    ease(s, 'stress', stressWant, hours);
    {
      const [up, down] = PACE.stress, tau = (worryWant > this.worried ? up : down) / 3;
      this.worried += (worryWant - this.worried) * (1 - Math.exp(-hours / tau));
    }
    ease(s, 'sadness', clamp01(this.storySorrow + 0.35 * Math.max(0, s.loneliness - 0.3)), hours);
    ease(s, 'nervousness', clamp01(Math.max(i.fear, (s.stress - 0.35) * 1.3)), hours);
    s.fear = clamp01(i.fear);
    ease(s, 'excitement', clamp01(0.5 * i.enjoying * (i.talking ? 1 : 0.4)), hours);
    ease(s, 'comfort', clamp01(i.restful - 0.4 * i.unmetNeeds), hours);
    const happyWant = clamp01(0.3 * i.mood + 0.25 * this.base.happiness + 0.2 * s.comfort + 0.25 * i.enjoying + 0.1 * s.excitement
      - 0.35 * s.stress - 0.25 * s.sadness - 0.15 * s.loneliness + 0.15);
    ease(s, 'happiness', happyWant, hours);
  }

  /** A STORY EVENT (later, the story director's): worries, sorrows or news land at once and stay a while. */
  storyEvent(push: StoryPush): void {
    const s = this.state;
    if (push.stress) {
      this.storyStress = clamp01(this.storyStress + push.stress);
      s.stress = clamp01(s.stress + push.stress * 0.5);
      this.worried = clamp01(this.worried + push.stress * 0.5);
    }
    if (push.sadness) { this.storySorrow = clamp01(this.storySorrow + push.sadness); s.sadness = clamp01(s.sadness + push.sadness * 0.5); }
    if (push.excitement) s.excitement = clamp01(s.excitement + push.excitement);
    if (push.nervousness) s.nervousness = clamp01(s.nervousness + push.nervousness);
  }

  /** What is kept between games. */
  save(): { state: EmotionState; storyStress: number; storySorrow: number; worry: number } {
    return { state: { ...this.state }, storyStress: this.storyStress, storySorrow: this.storySorrow, worry: this.worried };
  }

  load(saved: { state: EmotionState; storyStress: number; storySorrow: number; worry?: number }): void {
    for (const e of EMOTIONS) this.state[e] = clamp01(saved.state[e] ?? this.state[e]);
    this.storyStress = clamp01(saved.storyStress);
    this.storySorrow = clamp01(saved.storySorrow);
    this.worried = clamp01(saved.worry ?? this.state.stress);
  }
}

/** One feeling a step toward `want`, at its own pace rising or falling (or `hoursOverride` game hours, if given). */
function ease(s: EmotionState, e: keyof typeof PACE, want: number, hours: number, hoursOverride?: number): void {
  const [up, down] = PACE[e];
  const tau = (hoursOverride ?? (want > s[e] ? up : down)) / 3;
  s[e] += (want - s[e]) * (1 - Math.exp(-hours / tau));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
