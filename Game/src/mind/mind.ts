// ============================================================================
// mind/mind.ts -- ONE CHARACTER'S MIND: it reads their needs and feelings, scores what they could do, chooses, and runs
// the plan of what it chose through their body, step by step; and it remembers, and logs why.
//
// Joshua's brief, section 3: "1. Read the character's current needs and emotional state. 2. Identify available
// activities. 3. Calculate their priorities. 4. Select an appropriate activity. 5. Find a suitable destination or
// interactive object. 6. Navigate to it. 7. Perform the appropriate interaction and animation. 8. Update the relevant
// statistics. 9. Decide what to do next." And: "Avoid constantly interrupting activities because another need changes
// slightly. An emergency should be able to interrupt a normal activity, but ordinary activities should generally be
// completed." Section 14: "Do not evaluate every AI decision every rendered frame. Evaluate needs approximately once
// per second... Urgent events may trigger immediate reevaluation. Stagger AI updates across multiple characters."
//
// HOW (each frame, `tick`):
//   1. their FEELINGS move on by the game time that passed (emotions.ts); their day's counts too (sleep, idling);
//   2. in MANUAL or SCRIPTED mode that is all: the player or the story has them (anything running is let go);
//   3. once a second (each mind at its own moment in the second), or at once when a plan ends or fails, they DECIDE:
//      every activity scores itself (activities.ts); the best is chosen if nothing is running; if something is
//      running it is HELD TO (COMMITMENT): only an EMERGENCY stops a need half done (eating, sleeping, the toilet),
//      and a pastime gives way only to a need that beats it clearly (SWITCH_RATIO x its score + SWITCH_MARGIN);
//   4. the running PLAN moves on: reserve, walk, pose, work, let go (activities.ts Step), through the body.
// Everything chosen, switched, failed or finished goes in the DECISION LOG (memory.ts), with the scores beside it.
//
// The mind never touches the game: a MindWorld and a MindBody (world.ts) are all it has.
// ============================================================================
import type { ActivityId, ActorId, ControlMode, GameTime, NeedsSnapshot, SmartObject, Vec2 } from './types';
import type { CharacterProfile } from './profile';
import type { MindBody, MindWorld } from './world';
import type { Society } from './society';
import { Emotions, type EmotionState, type StoryPush } from './emotions';
import { Memory } from './memory';
import { trait } from './traits';
import { seededRng, seedOf, type Rng } from './random';
import { askedChoice, type Interaction } from './interact';
import { foodItem } from './food';
import {
  ACTIVITIES, ACTIVITY_BY_ID, ACTIVITY_SHORT, bathroomUrgency, foodUrgency, levelsNow, waterUrgency,
  type ActivityDef, type Choice, type LevelsNow, type MindContext, type OtherView, type Step,
} from './activities';

/** Seconds (real) between decisions. */
const THINK_EVERY = 1;
/** A companion's pastimes stay within this many metres of the one played. GAME TUNING. */
const COMPANION_REACH = 5;
/** A running pastime gives way only to a need scoring at least this ratio of it, plus this margin. */
const SWITCH_RATIO = 1.3, SWITCH_MARGIN = 8;
/** A need must score at least this to stop a pastime at all. */
const NEED_INTERRUPTS_FROM = 55;
/**
 * Real seconds a walk may take before it is given up as stuck; a pose, before it is given up (30: standing up from a
 * chair that pulls out is scooting out, getting up, stepping out and pushing it back in, 10-20 s with someone in the
 * way: at 15 John, asked to talk at the desk, gave up on it, v0.2.182).
 */
const WALK_GIVE_UP = 90, POSE_GIVE_UP = 30;
/**
 * A NEED THAT KEEPS FAILING (Joshua, 2026-11-26: John's meal failed nine times while his water ran down, the meal at
 * 99 always beating the drink at 60): each failure of it in the last FRUSTRATION_MINUTES game minutes multiplies its
 * appeal by FRUSTRATION_DAMP, so after one or two the next need comes first. GAME TUNING.
 */
const FRUSTRATION_MINUTES = 30, FRUSTRATION_DAMP = 0.6;

/** What is running: the activity, its choice, its plan and where it has got to. */
interface Running {
  readonly def: ActivityDef;
  readonly choice: Choice;
  readonly steps: Step[];
  index: number;
  /** seconds (real, and game) into the step now */
  stepReal: number;
  stepGame: number;
  /** the step now has begun (its `start` called) */
  begun: boolean;
  /** game seconds it started */
  readonly from: number;
  /** what it scored when chosen: held to (commitment) */
  readonly score: number;
}

/** Everything the debug panel shows of a mind (Joshua's brief, section 12). */
export interface MindDebug {
  readonly name: string;
  readonly mode: ControlMode;
  readonly activity: string | null;
  readonly reason: string;
  readonly step: string;
  readonly destination: string | null;
  readonly next: string | null;
  /** the best few choices: each activity, its word or two (`short`: "meal", "TV"), its score and why */
  readonly scores: readonly { readonly activity: ActivityId; readonly short: string; readonly score: number; readonly reason: string }[];
  /** the last thing that failed, if within the last 10 game minutes ("no way to the dining chair"), and when */
  readonly failed: { readonly text: string; readonly when: string } | null;
  readonly needs: NeedsSnapshot;
  readonly feel: Readonly<EmotionState>;
  readonly traits: CharacterProfile['traits'];
  readonly reserved: readonly string[];
  readonly nav: string;
  readonly objectives: { readonly personal: string | null; readonly story: string | null };
  readonly levels: LevelsNow;
}

const NO_NEEDS: NeedsSnapshot = { food: 0.5, water: 0.5, energy: 1, sleepiness: 0, fatigue: 0, stamina: 1, bathroom: 0, bathroomUrge: 0, bathroomEta: null, health: 1, mood: 1, fear: 0, asleep: false };

export class Mind {
  readonly id: ActorId;
  readonly emotions: Emotions;
  readonly memory = new Memory();
  readonly rng: Rng;
  /** who drives them (types.ts ControlMode) */
  mode: ControlMode;
  /** what they are working toward for themselves, and for the story (shown in the debug panel; the story sets its own) */
  readonly objectives: { personal: string | null; story: string | null } = { personal: null, story: null };
  private running: Running | null = null;
  private scores: Choice[] = [];
  private thinkIn: number;
  private needsNow: NeedsSnapshot = NO_NEEDS;
  private time: GameTime = { day: 1, hour: 0, seconds: 0 };
  private lastSeconds = -1;
  private nav = 'standing';
  private readonly meal: { targetBar: number; portionMl: number; eatenMl: number; from: string | null; item: string | null } = { targetBar: 0, portionMl: 0, eatenMl: 0, from: null, item: null };

  constructor(
    readonly profile: CharacterProfile,
    readonly body: MindBody,
    readonly world: MindWorld,
    private readonly society: Society,
    options: { seed?: number; mode?: ControlMode } = {},
  ) {
    this.id = profile.id;
    this.rng = seededRng(options.seed ?? seedOf(profile.id));
    this.emotions = new Emotions(profile.base);
    this.mode = options.mode ?? 'autonomous';
    // (each mind thinks at its own moment in the second: staggered)
    this.thinkIn = this.rng() * THINK_EVERY;
    society.add(this);
  }

  // ---- what others (and the debug panel) can see --------------------------------------------------------------------

  get activity(): ActivityId | null { return this.running?.def.id ?? null; }

  /**
   * THE THING THEY ARE BUSY WITH NOW: the one this step walks to or uses (the fridge on the way to the table, then
   * the chair), else the activity's own; null for none (a wander, a talk). The game turns their head to it (main.ts,
   * v0.2.181: "the head and body should act like using the bathroom... with automatic head/body movements").
   */
  get thing(): SmartObject | null {
    const r = this.running;
    if (!r) return null;
    // (the walk under way or the last one walked: what is used where they now stand; before any, the first ahead)
    for (let i = Math.min(r.index, r.steps.length - 1); i >= 0; i--) {
      const s = r.steps[i];
      if (s.kind === 'go' && s.pick) return s.pick.object;
    }
    for (const s of r.steps) if (s.kind === 'go' && s.pick) return s.pick.object;
    return r.choice.pick?.object ?? null;
  }
  get choice(): Choice | null { return this.running?.choice ?? null; }
  get needs(): NeedsSnapshot { return this.needsNow; }
  get asleep(): boolean { return this.needsNow.asleep; }
  /** seeing to a need: not to be bothered */
  get busy(): boolean { return this.running?.def.category === 'need'; }
  /** talking with `other` now (or on the way to) */
  isTalkingWith(other: ActorId): boolean { return this.running?.def.id === 'talk' && this.running.choice.with === other; }
  /** the step running now, in words */
  get doing(): string {
    const r = this.running;
    if (!r) return this.mode === 'autonomous' || this.mode === 'companion' ? 'deciding' : this.mode;
    const s = r.steps[r.index];
    return !s ? 'finishing' : s.kind === 'go' || s.kind === 'pose' || s.kind === 'work' || s.kind === 'do' ? s.what : r.def.label.toLowerCase();
  }
  /** "Walking to the kitchen: food 24% < 30%" */
  get thought(): string {
    const r = this.running;
    if (!r) return capital(this.doing);
    // (the reason without what the doing already says: "Talking with John: talk with John (lonely 11%)" is
    //  "Talking with John (lonely 11%)", "Reading: read" is "Reading"; Joshua, 2026-11-26, its text ran out of the bubble)
    const why = r.choice.reason, head = why.split(' (')[0].toLowerCase();
    if (head && this.doing.toLowerCase().includes(head)) {
      const rest = why.slice(head.length).trim();
      return rest ? `${capital(this.doing)} ${rest}` : capital(this.doing);
    }
    return `${capital(this.doing)}: ${why}`;
  }

  // ---- control ------------------------------------------------------------------------------------------------------

  /** Who drives them now. Taking them over lets go of whatever they were doing and holding (Joshua, section 10). */
  setMode(mode: ControlMode): void {
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    this.memory.note(this.time, this.when(), 'mode', this.activity, `${was} -> ${mode}`);
    if ((mode === 'manual' || mode === 'scripted') && this.running) this.stop('interrupted', `${mode === 'manual' ? 'the player' : 'the story'} took over`);
    this.thinkIn = 0;
  }

  /** A STORY EVENT reaches them: worries, sorrow or news (emotions.ts), logged. */
  storyEvent(push: StoryPush, why: string): void {
    this.emotions.storyEvent(push);
    this.memory.note(this.time, this.when(), 'story', this.activity, `${why} (${Object.entries(push).map(([k, v]) => `${k} +${Math.round((v ?? 0) * 100)}%`).join(', ')})`);
  }

  /** Think again at once (a body event: arrived, blocked; a change in the world). */
  wake(): void { this.thinkIn = 0; }

  // ---- each frame ---------------------------------------------------------------------------------------------------

  /** One frame: `realDt` real seconds; the game clock now; their needs now (from their vitals). */
  tick(realDt: number, time: GameTime, needs: NeedsSnapshot): void {
    const gameDt = this.lastSeconds < 0 ? 0 : Math.max(0, time.seconds - this.lastSeconds);
    this.lastSeconds = time.seconds;
    this.time = time;
    this.needsNow = needs;
    // 1. FEELINGS, and the day's counts
    this.feel(gameDt);
    const day = this.memory.day(time.day);
    if (needs.asleep) day.sleepHours += gameDt / 3600;
    if (!this.running && this.mode === 'autonomous') day.idleMinutes += gameDt / 60;
    // 2. THE PLAYER OR THE STORY has them: nothing more (but what the player asked them to do, `doNow`, is done)
    if (this.mode === 'manual' || this.mode === 'scripted') {
      if (this.mode === 'manual' && this.running) this.runStep(realDt, gameDt);
      return;
    }
    // 3. DECIDE, once a second (staggered), or at once when asked
    this.thinkIn -= realDt;
    if (this.thinkIn <= 0) { this.thinkIn = THINK_EVERY; this.decide(); }
    // 4. THE PLAN moves on
    if (this.running) this.runStep(realDt, gameDt);
  }

  /** The feelings' inputs, gathered, and one step of them. */
  private feel(gameDt: number): void {
    const n = this.needsNow, lv = this.levels();
    const unmet = Math.max(
      foodUrgency(n.food, lv.eatBelow), waterUrgency(n.water, this.profile.needs.drinkBelow),
      0.8 * bathroomUrgency(n.bathroom, this.profile.needs.bathroomFrom, this.profile.needs.bathroomAt),
      n.energy < 0.3 ? (0.3 - n.energy) / 0.3 : 0,
    );
    const step = this.running?.steps[this.running.index];
    const work = step?.kind === 'work' ? step : null;
    const motion = this.body.motion();
    const restful = work?.restful ?? (this.nav === 'walking' ? 0.35 : motion === 'lie' ? 0.85 : motion === 'doze' ? 0.8 : motion === 'sit' ? 0.65 : 0.45);
    const here = this.world.roomAt(this.body.position());
    this.emotions.update(gameDt / 3600, {
      unmetNeeds: Math.min(1, unmet * 0.9), mood: n.mood, fear: n.fear,
      partnerAway: !!this.profile.partnerId && this.society.isAway(this.profile.partnerId),
      talking: this.running?.def.id === 'talk' && !!work,
      company: this.society.others(this).some((m) => this.world.roomAt(m.body.position()) === here),
      restful, enjoying: work?.enjoying ?? 0, asleep: n.asleep,
      social: Math.max(trait(this.profile.traits, 'social'), trait(this.profile.traits, 'affectionate')),
    });
  }

  /** Their levels now (stress counted in). */
  levels(): LevelsNow { return levelsNow(this.profile, this.emotions.state, this.emotions.worry); }

  /** What an activity can see (activities.ts MindContext). */
  private context(): MindContext {
    const others: OtherView[] = this.society.others(this).map((m) => this.view(m));
    const leaderMind = this.society.leader();
    return {
      id: this.id, profile: this.profile, needs: this.needsNow, feel: this.emotions.state, memory: this.memory,
      world: this.world, body: this.body, rng: this.rng,
      day: this.time.day, hour: this.time.hour, now: this.time.seconds,
      levels: this.levels(), others,
      leader: leaderMind && leaderMind !== this ? this.view(leaderMind) : null,
      companion: this.mode === 'companion',
      running: this.activity,
      invite: (to, meetMe, meetThem, minutes) => this.society.invite(this, to, meetMe, meetThem, minutes),
      stillTalkingWith: (other) => {
        const m = this.society.get(other);
        if (!m || this.society.isAway(other)) return false;
        // (the one played: as long as they stay within 4 m)
        if (m.mode === 'manual') { const a = m.body.position(), b = this.body.position(); return Math.hypot(a.x - b.x, a.z - b.z) < 4; }
        return m.isTalkingWith(this.id);
      },
      meal: this.meal,
    };
  }

  private view(m: Mind): OtherView {
    return { id: m.id, name: m.profile.name, position: m.body.position(), room: this.world.roomAt(m.body.position()), activity: m.activity, asleep: m.asleep, busy: m.busy, played: m.mode === 'manual' };
  }

  // ---- deciding -----------------------------------------------------------------------------------------------------

  private decide(): void {
    const c = this.context();
    const choices: Choice[] = [];
    for (const def of ACTIVITIES) {
      const ch = def.evaluate(c);
      if (!ch || !Number.isFinite(ch.score) || ch.score <= 0) continue;
      // (A COMPANION keeps their pastimes near the one played: a pastime or a rest more than `COMPANION_REACH` from
      //  them is not considered, so they watch the screen beside her, not on the far side of the house)
      if (c.companion && c.leader && (def.category === 'fun' || def.category === 'rest')) {
        const at = ch.pick?.slot.use ?? ch.spot;
        if (at && Math.hypot(at.x - c.leader.position.x, at.z - c.leader.position.z) > COMPANION_REACH) continue;
      }
      // (A NEED THAT KEEPS FAILING lets the next one in: each time it failed in the last FRUSTRATION_MINUTES game
      //  minutes takes it down by FRUSTRATION_DAMP, so a meal that cannot be had stops standing in front of a drink;
      //  an emergency is still weighed first whatever its score)
      const failures = def.category === 'need' ? this.memory.failuresSince(def.id, c.now, FRUSTRATION_MINUTES) : 0;
      choices.push(failures ? { ...ch, score: ch.score * FRUSTRATION_DAMP ** failures, reason: `${ch.reason} (failed ${failures}x)` } : ch);
    }
    choices.sort((a, b) => b.score - a.score);
    this.scores = choices;
    // (an EMERGENCY is weighed first whatever its score: a bladder at 95% in the night must not wait behind a meal that
    //  scores 2 points more, which would itself wait behind the sleep it is "seeing through")
    const best = choices.find((ch) => ch.emergency) ?? choices[0];
    if (!best) return;
    const r = this.running;
    if (!r) { this.start(best, 'choose'); return; }
    if (best.activity === r.def.id && !best.emergency) return;
    const bestDef = ACTIVITY_BY_ID[best.activity];
    // AN EMERGENCY stops anything but another emergency of the same need
    if (best.emergency && !(r.choice.emergency && r.def.id === best.activity)) {
      if (r.choice.emergency && r.def.category === 'need') return;
      this.stop('interrupted', `emergency: ${best.reason}`);
      this.start(best, 'emergency');
      return;
    }
    // A NEED half done is seen through
    if (r.def.category === 'need') return;
    // A PASTIME (or resting, waiting, idling, following) gives way to a need that clearly beats it, or a waiting or
    // idling one to anything that does
    const clearly = best.score >= r.score * SWITCH_RATIO + SWITCH_MARGIN;
    const yields = (bestDef.category === 'need' && best.score >= NEED_INTERRUPTS_FROM) || r.def.category === 'idle' || r.def.category === 'wait' || (bestDef.category === 'follow' && this.mode === 'companion');
    if (clearly && yields) {
      this.memory.day(this.time.day).switches++;
      this.stop('interrupted', `${bestDef.label.toLowerCase()} came first: ${best.reason}`);
      this.start(best, 'switch');
    }
  }

  // ---- the player's own asks (mind/interact.ts) -----------------------------------------------------------------------

  /**
   * THE PLAYER ASKS (the interact button: main.ts): the one played does this NOW, as the AI would do it by themselves
   * (walking there, sitting, lying, eating...). They stay 'manual': once it is done nothing more is planned. False if
   * it cannot be done (no food left, the other person gone or busy).
   */
  doNow(i: Interaction): boolean {
    if (this.running) this.stop('interrupted', 'the player asked for something else');
    const choice = askedChoice(this.context(), i);
    if (!choice) { this.memory.note(this.time, this.when(), 'fail', i.activity, `${i.word}: cannot now`); return false; }
    this.start(choice, 'asked');
    return !!this.running;
  }

  /** The player lets go of what they asked for (the stick pushed, or the button): stopped where it is (they get up). */
  stopNow(): void {
    if (this.running) this.stop('interrupted', 'the player let go');
  }

  /** Whether the one played is doing something they asked for. */
  get asked(): boolean { return this.mode === 'manual' && !!this.running; }

  /** Starts a chosen activity: its plan made, logged with the best scores. */
  private start(choice: Choice, kind: 'choose' | 'switch' | 'emergency' | 'asked'): void {
    const def = ACTIVITY_BY_ID[choice.activity];
    const steps = def.plan(this.context(), choice);
    if (kind === 'emergency') this.memory.day(this.time.day).emergencies++;
    const top: Record<string, number> = {};
    for (const ch of this.scores.slice(0, 6)) top[ch.activity] = Math.round(ch.score);
    this.memory.note(this.time, this.when(), kind, def.id, `${def.label}: ${choice.reason}${choice.pick ? ` [${choice.pick.object.name}${choice.pick.slot.id !== 'front' && choice.pick.slot.id !== 'seat' ? ` ${choice.pick.slot.id}` : ''}]` : ''}`, top);
    if (!steps.length) { this.memory.note(this.time, this.when(), 'fail', def.id, 'no plan'); return; }
    this.running = { def, choice, steps, index: 0, stepReal: 0, stepGame: 0, begun: false, from: this.time.seconds, score: choice.score };
    if (def.category !== 'need' && def.category !== 'idle' && def.category !== 'wait') {
      const d = this.memory.day(this.time.day);
      d.pastimes[def.id] = (d.pastimes[def.id] ?? 0) + 1;
    }
  }

  /** A TALK ASKED OF THEM by another (society.ts): they come if they are free, and talk where they stand. */
  acceptTalk(from: Mind, mySpot: Vec2, theirSpot: Vec2, gameMinutes: number): boolean {
    if (this.mode === 'manual') return true;          // (the one played is talked to; nothing is planned for them)
    if (this.mode === 'scripted' || this.asleep) return false;
    const r = this.running;
    if (r && (r.def.category === 'need' || r.def.id === 'nap')) return false;
    if (this.scores.some((ch) => ACTIVITY_BY_ID[ch.activity].category === 'need' && ch.score >= 60)) return false;
    if (r) this.stop('interrupted', `${from.profile.name.split(' ')[0]} wanted to talk`);
    const choice: Choice = { activity: 'talk', score: 40, reason: `${from.profile.name.split(' ')[0]} wants to talk`, with: from.id, spot: theirSpot };
    const face = Math.atan2(theirSpot.x - mySpot.x, theirSpot.z - mySpot.z);
    const steps: Step[] = [
      { kind: 'pose', motion: 'stand', facing: face, what: `turning to ${from.profile.name.split(' ')[0]}` },
      { kind: 'work', what: `talking with ${from.profile.name.split(' ')[0]}`, gameSeconds: gameMinutes * 60 + 120, restful: 0.5, enjoying: 0.7, look: theirSpot, until: () => !from.isTalkingWith(this.id) },
    ];
    this.memory.note(this.time, this.when(), 'invite', 'talk', choice.reason);
    this.running = { def: ACTIVITY_BY_ID.talk, choice, steps, index: 0, stepReal: 0, stepGame: 0, begun: false, from: this.time.seconds, score: choice.score };
    const d = this.memory.day(this.time.day);
    d.pastimes.talk = (d.pastimes.talk ?? 0) + 1;
    return true;
  }

  // ---- running the plan ---------------------------------------------------------------------------------------------

  private runStep(realDt: number, gameDt: number): void {
    const r = this.running!;
    const step = r.steps[r.index];
    if (!step) { this.stop('finished', ''); return; }
    r.stepReal += realDt;
    r.stepGame += gameDt;
    const c = this.context();
    switch (step.kind) {
      case 'reserve': {
        if (this.world.reserve(step.pick.object.id, step.pick.slot.id, this.id)) this.next();
        else this.fail(`${step.pick.object.name} is taken`, step.pick.object.id);
        return;
      }
      case 'go': {
        // (stand up first, if sitting or lying)
        if (this.body.motion() !== 'stand') { this.nav = 'getting up'; if (this.body.pose('stand', null) !== 'ready') return; }
        const status = this.body.goTo(step.to, step.facing, step.within);
        this.nav = status === 'moving' ? 'walking' : status === 'waiting' ? 'waiting their turn' : status;
        // (waiting for someone on the spot is not being stuck: the body has its own limit for that)
        if (status === 'waiting') r.stepReal = 0;
        if (status === 'arrived') { if (step.pick) this.memory.worked(step.pick.object.id); this.next(); }
        else if (status === 'blocked') this.fail(`no way to ${step.pick ? `the ${step.pick.object.name.toLowerCase()}` : 'there'}`, step.pick?.object.id);
        else if (r.stepReal > WALK_GIVE_UP) this.fail(`stuck ${step.what}`, step.pick?.object.id);
        return;
      }
      case 'pose': {
        this.nav = 'in place';
        if (this.body.pose(step.motion, step.facing) === 'ready') this.next();
        else if (r.stepReal > POSE_GIVE_UP) this.fail(`could not manage ${step.what}`);
        return;
      }
      case 'do': {
        if (step.fn(c) === false) this.fail(`${step.what} did not work`, r.choice.via?.object.id ?? r.choice.pick?.object.id);
        else this.next();
        return;
      }
      case 'release': {
        this.world.release(this.id, step.objectId);
        this.next();
        return;
      }
      case 'work': {
        this.nav = 'in place';
        if (!r.begun) {
          r.begun = true;
          step.start?.(c);
          this.body.hold(step.prop ?? null);
          this.body.lookAt(step.look ?? null);
        }
        if (step.asleep) this.body.sleep(true, c.levels.sleepQuality);
        step.each?.(c, gameDt, realDt);
        const done = (step.gameSeconds !== undefined && r.stepGame >= step.gameSeconds)
          || (step.realSeconds !== undefined && r.stepReal >= step.realSeconds)
          || (step.until ? step.until(c) : step.gameSeconds === undefined && step.realSeconds === undefined);
        if (done) {
          step.end?.(c, true);
          this.endWork(step);
          this.next();
        }
        return;
      }
    }
  }

  /** The step done: on to the next (or the plan is finished). */
  private next(): void {
    const r = this.running!;
    r.index++;
    r.stepReal = 0;
    r.stepGame = 0;
    r.begun = false;
    if (r.index >= r.steps.length) this.stop('finished', '');
  }

  /** A work step over: hands empty, eyes free, awake, still. */
  private endWork(step: Extract<Step, { kind: 'work' }>): void {
    this.body.hold(null);
    this.body.lookAt(null);
    if (step.asleep) this.body.sleep(false, 1);
  }

  /** A step failed: the thing it was for is avoided a while, the plan stopped, and they think again at once. */
  private fail(why: string, objectId?: string): void {
    if (objectId) this.memory.failed(objectId, this.time.seconds);
    this.memory.day(this.time.day).failures++;
    this.stop('failed', why);
  }

  /** The plan ends (finished, interrupted, failed): whatever it holds let go, remembered, logged. */
  private stop(how: 'finished' | 'interrupted' | 'failed', why: string): void {
    const r = this.running;
    if (!r) return;
    const step = r.steps[r.index];
    if (step?.kind === 'work' && r.begun) { step.end?.(this.context(), false); this.endWork(step); }
    this.world.release(this.id);
    this.body.stopMoving();
    this.body.exert(0);
    // (a meal taken out of the fridge and not yet begun goes back in it: each failed try had thrown one away)
    if (this.meal.from && this.meal.item) {
      this.world.putBackItem(this.meal.from, this.meal.item);
      this.memory.note(this.time, this.when(), 'note', r.def.id, `put the ${foodItem(this.meal.item)?.name.toLowerCase() ?? 'food'} back`);
    }
    this.meal.from = null; this.meal.item = null;
    this.running = null;
    this.nav = 'standing';
    this.memory.did({ activity: r.def.id, from: r.from, to: this.time.seconds, how });
    this.memory.note(this.time, this.when(), how === 'finished' ? 'finish' : how === 'failed' ? 'fail' : 'interrupt', r.def.id, `${r.def.label}${why ? `: ${why}` : ''}`);
    this.thinkIn = how === 'failed' ? 0.5 : 0;
  }

  // ---- reading out --------------------------------------------------------------------------------------------------

  /** "D2 07:42" */
  when(): string {
    const m = Math.floor(this.time.hour * 60);
    return `D${this.time.day} ${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /** Everything the debug panel shows (Joshua's brief, section 12). */
  debug(): MindDebug {
    const r = this.running, step = r?.steps[r.index], after = r?.steps[r.index + 1];
    const words = (s: Step | undefined): string | null => !s ? null : s.kind === 'reserve' ? `reserve ${s.pick.object.name}` : s.kind === 'release' ? 'let go' : s.what;
    const dest = step?.kind === 'go' ? `${step.pick?.object.name ?? this.world.roomAt(step.to) ?? 'a spot'} (${step.to.x.toFixed(1)}, ${step.to.z.toFixed(1)})` : null;
    const reserved = this.world.objects().flatMap((o) => o.slots.filter((s) => this.world.holder(o.id, s.id) === this.id).map((s) => `${o.name} ${s.id}`));
    return {
      name: this.profile.name, mode: this.mode, activity: r?.def.label ?? null, reason: r?.choice.reason ?? '',
      step: this.doing, destination: dest, next: words(after),
      scores: this.scores.slice(0, 8).map((ch) => ({ activity: ch.activity, short: ACTIVITY_SHORT[ch.activity], score: Math.round(ch.score), reason: ch.reason })),
      failed: ((): { text: string; when: string } | null => {
        const f = this.memory.lastFailure();
        if (!f || this.time.seconds - f.at > 10 * 60) return null;
        // (only what went wrong: "Eat a meal: no way to the dining chair" -> "no way to the dining chair")
        const colon = f.text.indexOf(': ');
        return { text: colon >= 0 ? f.text.slice(colon + 2) : f.text, when: f.when.replace(/^D\d+ /, '') };
      })(),
      needs: this.needsNow, feel: this.emotions.state, traits: this.profile.traits, reserved, nav: this.nav,
      objectives: { ...this.objectives }, levels: this.levels(),
    };
  }

  /** What is kept between games and maps (Joshua: "Preserve individual character identities, memories, needs and
   *  personality profiles when switching characters or maps"). The plan running is not: they choose again. */
  save(): unknown {
    return { id: this.id, mode: this.mode, emotions: this.emotions.save(), memory: this.memory.save(), objectives: { ...this.objectives } };
  }

  load(saved: unknown): void {
    const s = saved as { mode?: ControlMode; emotions?: Parameters<Emotions['load']>[0]; memory?: unknown; objectives?: { personal: string | null; story: string | null } };
    if (s.mode) this.mode = s.mode;
    if (s.emotions) this.emotions.load(s.emotions);
    if (s.memory) this.memory.load(s.memory);
    if (s.objectives) { this.objectives.personal = s.objectives.personal; this.objectives.story = s.objectives.story; }
  }
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
