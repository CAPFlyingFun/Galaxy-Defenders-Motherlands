// ============================================================================
// bellyTouch.ts -- HER HANDS TO HER BELLY: WHEN THE BABY KICKS, AND HOLDING IT
// UP WHEN SHE RUNS (Joshua, 2026-11-20).
//
// A KICK (the builder's own, from her hidden live body, liveBody.ts: a place on
// her skin as she stood, a way out and a push). When a NEW kick starts:
//   1. NOT EVERY TIME (Joshua: "about 35% of the time there is a kick she puts a
//      hand on her belly"): `chance` it calls a hand at all;
//   2. NOT AT ONCE (Joshua: "randomize (3-7s after a kick)"): she waits a moment
//      first (`waitLeast`-`waitMost`), as someone does who notices and then
//      reaches; a hand that is busy by then is not sent;
//   3. WHICH HAND: of the free ones (nothing in them, no job of their own), the
//      one nearer the kick; the far hand may only CROSS her belly if the straight
//      way from its shoulder to just in front of the spot stays out of her belly;
//   4. BOTH HANDS sometimes (Joshua: "if no guns or not carrying anything, she
//      can randomly place both hands on her belly... the other... basically 180
//      degrees the opposite direction, but can also be randomized"): with both
//      hands free, `bothChance` of the time the other hand rests on the far side
//      of her belly, opposite the kick round its middle, give or take
//      `oppositeSpread`;
//   5. it RESTS there (fingerTouch.ts lays its palm and every finger 2 mm off her
//      own skin, skinPatch.ts) for `restLeast`-`restMost` seconds;
//   6. SHE LOOKS sometimes (Joshua: "out of the 35% that she does, about 40% of
//      that she actually looks"): `lookChance` of the touches, 2-3 s after her
//      hand lands, her head goes down to it over 1 s, stays 0.5 s and comes back
//      up over 1 s ("so it takes 2.5s per look"); her hands let go as it comes
//      back up ("as the camera goes back to normal, that's when the hands
//      release"). The game says when a look may start (`lookAllowed`: not while
//      she fires or runs), and stops it (`stopLook`: the player turns the view
//      in first person, or fires): it eases off and her hands let go;
//   7. then a short rest (`restSeconds`) before another kick can call a hand.
//
// HOLDING HER BELLY UP AS SHE RUNS (Joshua: "if anything over a jog, one of her
// hands sits on the underside of the belly to help with moving quickly since
// moving fast does put a lot of pressure on the belly skin"; from a run, past 30
// weeks: the game says when, `setSupport`): a free hand cups the underside of
// her belly, palm up against it, fingers toward her other side, for as long as
// she runs; the other hand keeps swinging (or keeps its gun). Let go the moment
// that hand is needed, or she slows.
//
// Nothing while her body is down on the ground or winded (`allowed` false), and
// a hand the game gives a job meanwhile is let go at once (`cancel`).
// ============================================================================
import * as THREE from 'three';
import type { SkinPatch } from './skinPatch';

/** GAME TUNING (Joshua's numbers, 2026-11-20). */
export const BELLY_TOUCH = {
  /** The share of kicks that call a hand at all. */
  chance: 0.35,
  /** The share of those touches on which she also looks down at it. */
  lookChance: 0.4,
  /** She notices the kick and reaches after this long, seconds (a random time between the two). */
  waitLeast: 3,
  waitMost: 7,
  /** Her hand rests on the spot this long once it is there, seconds (random between the two), unless she looks. */
  restLeast: 3,
  restMost: 7,
  /** She starts to look this long after her hand lands, seconds (random between the two). */
  lookAfterLeast: 2,
  lookAfterMost: 3,
  /** THE LOOK (Joshua: "1s down, hold for 0.5s, then back up over 1s"), seconds; her hands let go as it ends. */
  lookDown: 1,
  lookHold: 0.5,
  lookUp: 1,
  /** A look stopped by the player eases off over this long, seconds (never a jump). */
  lookStop: 0.3,
  /** With both hands free, the share of touches on which both go. */
  bothChance: 1 / 3,
  /** The second hand's place: opposite the kick round her belly's middle, give or take this much, radians. */
  oppositeSpread: (25 * Math.PI) / 180,
  /** At most this long on the way before it gives up (an arm that cannot get there), seconds. */
  reachSeconds: 1.6,
  /** After a touch, this long before another kick can call a hand, seconds. */
  restSeconds: 1.5,
  /** Her arm's way to the spot must stay this far out of her belly, metres (else that hand does not cross over). */
  crossClear: 0.02,
  /** A spot is within a hand's reach if no further from its shoulder than its arm and this much more (wrist to palm), metres. */
  handReach: 0.1,
  /** Her hand comes in to the spot from this far in front of it, metres. */
  approach: 0.12,
  /**
   * HOW FAR OFF HER SKIN HER HAND RESTS (Joshua, 2026-11-20: "lock in around 2mm of the belly's live skin"), metres:
   * her palm and every finger (fingerTouch.ts), her palm over the kick's bump while it lasts.
   */
  gap: 0.002,
  /** Her skin under the hand is read again this often while it is there, seconds (her breathing moves it). */
  reread: 0.3,
  /**
   * WHERE HER HAND HOLDS HER BELLY UP AS SHE RUNS, on her belly's egg: tried from `round` radians round from her front
   * toward the hand's own side and `up` how far up it (below 0: under it; -1.3 is well under her belly's front, about
   * 52 degrees below its middle), then up its curve and round toward her side until her arm reaches (`startSupport`).
   */
  supportRound: 0.45,
  supportUp: -1.3,
  /** ...her fingers pointing in toward her other side and this much forward (1: as much forward as in). */
  supportForward: 0.7,
  /** A hand wanted for holding her belly that is busy is tried again after this long, seconds. */
  supportRetry: 0.5,
} as const;

/** What the touch needs from her body (fastHeroine.ts gives it). */
export interface BellyTouchBody {
  /** A point (or a direction) of her body as she stood, where it is now in the world (armClear.ts `restToWorld`). */
  restToWorld(point: THREE.Vector3, out: THREE.Vector3, direction?: boolean): THREE.Vector3;
  /** Whether a world point is inside her belly grown by `grow` metres. */
  insideBelly(point: THREE.Vector3, grow: number): boolean;
  /** How far a hand reaches from its shoulder to its hand bone, metres (nearly straight). */
  armLength(hand: 0 | 1): number;
  /** A hand's shoulder, world. */
  shoulder(hand: 0 | 1, out: THREE.Vector3): THREE.Vector3;
  /** Whether a hand is free now (no gun, no job, nothing the game is doing with it: a hand on her belly counts as free). */
  free(hand: 0 | 1): boolean;
  /** Her left, world (across her forward), and her forward. */
  left(out: THREE.Vector3): THREE.Vector3;
  forward(out: THREE.Vector3): THREE.Vector3;
  /** The pose her hand bone needs for its palm to lie flat on `at`, facing `palmTo`, fingers along `fingers`. */
  flatPose(hand: 0 | 1, at: THREE.Vector3, palmTo: THREE.Vector3, fingers: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * Her belly under the hand, for its fingers (a ball touching her skin at the spot, as round as her belly is there,
   * and the real surface its fingers measure), kept `gap` off; null: none (the hand goes back to her own pose).
   */
  setCurve(hand: 0 | 1, centre: THREE.Vector3 | null, radius: number, gap: number, surface: ((point: THREE.Vector3) => number) | null): void;
  /** HER OWN SKIN AT A SPOT (as she stood): the spot moved along `out` onto her skin's outermost points there. */
  ontoSkin(spot: THREE.Vector3, out: THREE.Vector3): void;
  /** A spot on her belly's egg (as she stood): `round` radians round from her front (+ toward her left), `up` up it. */
  onBelly(round: number, up: number, spot: THREE.Vector3, out: THREE.Vector3): boolean;
  /**
   * The place OPPOSITE a spot round her belly's middle (as she stood): turned `turn` radians about the line straight out
   * of her belly's front (PI: right across, top to underbelly, left to right).
   */
  opposite(spot: THREE.Vector3, turn: number, outSpot: THREE.Vector3, outOut: THREE.Vector3): boolean;
  /** HER SKIN ROUND A SPOT, ITSELF (as she stood), measured onto a grid for the hand (skinPatch.ts); null if too few of her points are there. */
  skinPatch(spot: THREE.Vector3, out: THREE.Vector3, worldWay: THREE.Vector3): SkinPatch | null;
  /** A point in the world now, where it was as she stood (her rest frame). */
  worldToRest(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  /** Give a hand this pose to reach (null: back to her own pose), or move the pose it is reaching for. */
  setJob(hand: 0 | 1, pose: THREE.Matrix4 | null): void;
  moveJob(hand: 0 | 1, pose: THREE.Matrix4): void;
  /** How far a hand is on its way, 0..1 (1: there). */
  progress(hand: 0 | 1): number;
}

const spotWorld = new THREE.Vector3(), outWorld = new THREE.Vector3(), shoulderAt = new THREE.Vector3(), otherShoulder = new THREE.Vector3();
const leftWay = new THREE.Vector3(), fingers = new THREE.Vector3(), palmTo = new THREE.Vector3(), step = new THREE.Vector3();
const centre = new THREE.Vector3(), restPoint = new THREE.Vector3(), target = new THREE.Vector3();

/** A random number between two. */
const between = (least: number, most: number): number => least + Math.random() * (most - least);
/** Smooth 0..1 (eased at both ends). */
const smooth = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** ONE HAND ON HER BELLY: where (as she stood), and its skin there. */
class HandOn {
  /** Its spot and the way out of her skin there (her rest frame). */
  readonly spot = new THREE.Vector3();
  readonly out = new THREE.Vector3(0, 0, 1);
  /** Which of the builder's kicks it is for (-1: none), and how far that kick's bump stands out under it now. */
  kick = -1;
  push = 0;
  /** Her skin's curve under it along her fingers, metres (measured once a touch; -1 not yet). */
  curve = -1;
  /** Her skin under it (skinPatch.ts), and seconds before it is read again. */
  patch: SkinPatch | null = null;
  reread = 0;
  /** Seconds since it set off, and since it got there. */
  timer = 0;
  there = 0;
  readonly pose = new THREE.Matrix4();
  /** How far a point in the world is out of her skin under the hand (and the kick's bump), metres. */
  readonly surface: (point: THREE.Vector3) => number;
  constructor(readonly hand: 0 | 1, readonly kind: 'kick' | 'pair' | 'support', body: BellyTouchBody) {
    this.surface = (point) => {
      if (!this.patch) return Infinity;
      const gap = this.patch.gap(body.worldToRest(point, restPoint));
      // (the kick's bump stands her skin out under the middle of her palm: about as wide as a palm, fading off)
      if (this.push <= 0) return gap;
      return gap - this.push * Math.exp(-restPoint.distanceToSquared(this.spot) / (2 * 0.035 * 0.035));
    };
  }
}

/** A kick she has noticed and is about to reach for. */
interface Waiting {
  left: number;
  readonly spot: THREE.Vector3;
  readonly out: THREE.Vector3;
  readonly kick: number;
  readonly look: boolean;
  readonly both: boolean | null;
}

export class BellyTouch {
  /** The game's say on whether she may start a look now (not while she fires or runs: main.ts). */
  lookAllowed = true;
  /** Her hands on her belly now (or on their way): the kick's (and its pair), and the one holding it up. */
  private kickHand: HandOn | null = null;
  private pairHand: HandOn | null = null;
  private supportHand: HandOn | null = null;
  /** A kick noticed, waiting to be reached for. */
  private waiting: Waiting | null = null;
  /** Seconds before another kick can call a hand. */
  private rest = 0;
  /** This touch: how long it rests, and its look (when it starts after landing, how far along, -1 not looking). */
  private restFor = 0;
  private lookAt = -1;
  private lookT = -1;
  /** A look the player stopped: its weight easing off (-1: none). */
  private stopping = -1;
  private lookWeight = 0;
  /** Holding her belly up as she runs: wanted by the game, and seconds before a busy hand is tried again. */
  private supportWanted = false;
  private supportRetry = 0;
  /** Each kick's push last frame (a kick starts when its push rises from nothing), and where it was. */
  private readonly before: number[] = [];
  private readonly kickSpots: THREE.Vector3[] = [];

  constructor(private readonly body: BellyTouchBody) {}

  /** Which hands are on her belly now (for her arms: a hand on her belly stays put, her elbow keeps clear). */
  holds(hand: 0 | 1): boolean {
    return this.kickHand?.hand === hand || this.pairHand?.hand === hand || this.supportHand?.hand === hand;
  }

  /** The hand the kick called (for test pages), or -1. */
  get hand(): number { return this.kickHand ? this.kickHand.hand : -1; }

  /** Holding her belly up (the game: from a run, past 30 weeks), or not. */
  setSupport(on: boolean): void { this.supportWanted = on; }

  /** The hand holding her belly up, or -1. */
  get supporting(): number { return this.supportHand ? this.supportHand.hand : -1; }

  /**
   * WHERE SHE LOOKS NOW, for her head and (first person) the view: how far she is looking down at her hand (0 not at
   * all .. 1 right at it), and the spot on her skin under it (world) in `out`.
   */
  look(out: THREE.Vector3): number {
    if (this.lookWeight <= 0 || !this.kickHand) return 0;
    this.body.restToWorld(this.kickHand.spot, out);
    return this.lookWeight;
  }

  /** The player turned the view or fired: a look stops (eased off), and her hands let go as it ends. */
  stopLook(): void {
    if (this.lookT >= 0 && this.stopping < 0) { this.stopping = this.lookWeight; this.lookT = -1; }
  }

  /**
   * A kick asked for by hand (test pages, which have no live body to kick): at `spot`, pushing out along `out` (rest
   * frame). It always calls a hand, at once; `look` and `both` as asked (null: by chance).
   */
  private poked: { spot: THREE.Vector3; out: THREE.Vector3; look: boolean; both: boolean | null } | null = null;
  poke(spot: THREE.Vector3, out: THREE.Vector3, look = false, both: boolean | null = false): void {
    this.poked = { spot: spot.clone(), out: out.clone(), look, both };
  }

  /** The game gave this hand something to do: let go of the belly at once (its own job has replaced ours). */
  cancel(hand: 0 | 1): void {
    if (this.supportHand?.hand === hand) { this.supportHand = null; this.supportRetry = BELLY_TOUCH.supportRetry; }
    if (this.kickHand?.hand === hand || this.pairHand?.hand === hand) {
      // (the other hand of a pair lets go too: the touch is over)
      const other = this.kickHand?.hand === hand ? this.pairHand : this.kickHand;
      if (other) this.release(other);
      this.kickHand = this.pairHand = null;
      this.endTouch();
    }
  }

  /**
   * One frame, after her pose (her bones' world matrices up to date), before her hands are laid on their jobs.
   * `kickAt`/`kickDir`: the builder's kicks now (xyz her rest frame; `kickAt.w` the push, 0 = none; `kickDir.xyz` the
   * way out). `allowed`: false while her body cannot (down on the ground, winded): every hand is let go.
   */
  update(dt: number, kickAt: readonly THREE.Vector4[] | null, kickDir: readonly THREE.Vector4[] | null, allowed: boolean): void {
    this.rest = Math.max(0, this.rest - dt);
    this.supportRetry = Math.max(0, this.supportRetry - dt);
    if (!allowed) { this.letGoAll(); this.waiting = null; this.poked = null; return; }

    // ---- a NEW kick: does she notice it enough to reach? (Joshua's 35%; she reaches 3-7 s later) ----
    if (kickAt) {
      for (let k = 0; k < kickAt.length; k++) {
        const was = this.before[k] ?? 0, now = kickAt[k].w;
        this.before[k] = now;
        (this.kickSpots[k] ??= new THREE.Vector3()).set(kickAt[k].x, kickAt[k].y, kickAt[k].z);
        if (!(was <= 0 && now > 0) || !kickDir || this.waiting || this.kickHand || this.rest > 0) continue;
        if (Math.random() >= BELLY_TOUCH.chance) continue;
        this.waiting = {
          left: between(BELLY_TOUCH.waitLeast, BELLY_TOUCH.waitMost),
          spot: this.kickSpots[k].clone(), out: new THREE.Vector3(kickDir[k].x, kickDir[k].y, kickDir[k].z).normalize(),
          kick: k, look: Math.random() < BELLY_TOUCH.lookChance, both: null,
        };
      }
    }
    if (this.poked && !this.kickHand) {
      this.waiting = { left: 0, spot: this.poked.spot, out: this.poked.out.normalize(), kick: -1, look: this.poked.look, both: this.poked.both };
      this.poked = null;
    }
    if (this.waiting && (this.waiting.left -= dt) <= 0) {
      const w = this.waiting;
      this.waiting = null;
      this.reachFor(w);
    }

    // ---- holding her belly up as she runs ----
    if (this.supportHand && (!this.supportWanted || !this.body.free(this.supportHand.hand))) {
      this.release(this.supportHand);
      this.supportHand = null;
    }
    if (this.supportWanted && !this.supportHand && this.supportRetry <= 0) this.startSupport();

    // ---- the hands there, or on their way: their spots carried with her ----
    for (const on of [this.kickHand, this.pairHand, this.supportHand]) {
      if (!on) continue;
      if (!this.body.free(on.hand)) { this.cancel(on.hand); continue; }
      on.timer += dt;
      // (the kick's bump under her palm, eased: her hand rides out on it and back as it goes down; only while that kick
      //  is still the one at this spot: after her wait it has usually gone down)
      const k = on.kick;
      const bump = k >= 0 && kickAt && kickAt[k] && this.kickSpots[k].distanceTo(on.spot) < 0.03 ? Math.max(0, kickAt[k].w) : 0;
      on.push += (bump - on.push) * (1 - Math.exp(-dt / 0.15));
      // (her skin under the hand read again now and then: she breathes)
      if (on.patch && (on.reread -= dt) <= 0) { on.patch.refresh(); on.reread = BELLY_TOUCH.reread; }
      this.body.moveJob(on.hand, this.place(on));
      if (this.body.progress(on.hand) >= 0.95) on.there += dt;
    }

    // ---- the kick's touch: how long it rests, her look, letting go ----
    const lead = this.kickHand;
    this.lookWeight = 0;
    if (this.stopping >= 0) {
      // (a look the player stopped: eased off, then her hands let go)
      this.stopping = Math.max(0, this.stopping - dt / BELLY_TOUCH.lookStop);
      this.lookWeight = smooth(this.stopping);
      if (this.stopping <= 0) { this.stopping = -1; this.letGoKick(); }
      return;
    }
    if (!lead) return;
    if (lead.there === 0 && lead.timer >= BELLY_TOUCH.reachSeconds) { this.letGoKick(); return; }
    if (this.lookAt >= 0 && this.lookT < 0 && lead.there >= this.lookAt) {
      // (time to look: only if the game allows it now; otherwise not this time)
      if (this.lookAllowed) this.lookT = 0; else this.lookAt = -1;
    }
    if (this.lookT >= 0) {
      this.lookT += dt;
      const { lookDown: down, lookHold: hold, lookUp: up } = BELLY_TOUCH;
      const t = this.lookT;
      this.lookWeight = t < down ? smooth(t / down) : t < down + hold ? 1 : smooth(1 - (t - down - hold) / up);
      // (her hands let go as her head comes back up)
      if (t >= down + hold + up) { this.lookWeight = 0; this.letGoKick(); }
      return;
    }
    if (this.lookAt < 0 && lead.there >= this.restFor) this.letGoKick();
  }

  // Reach for a noticed kick: the nearer free hand (or the far one, across), and perhaps the other hand opposite it.
  private reachFor(w: Waiting): void {
    const b = this.body;
    const spot = w.spot.clone(), out = w.out.clone();
    b.ontoSkin(spot, out);
    const hand = this.pickHand(spot, out, this.supportHand ? this.supportHand.hand : -1);
    if (hand < 0) return;
    const on = new HandOn(hand as 0 | 1, 'kick', b);
    on.spot.copy(spot); on.out.copy(out); on.kick = w.kick;
    this.kickHand = on;
    b.setJob(on.hand, this.place(on));
    this.restFor = between(BELLY_TOUCH.restLeast, BELLY_TOUCH.restMost);
    this.lookAt = w.look ? between(BELLY_TOUCH.lookAfterLeast, BELLY_TOUCH.lookAfterMost) : -1;
    this.lookT = -1;
    // BOTH HANDS: the other one, free too (no gun, nothing to do, not holding her belly up), opposite round her belly
    const other = (1 - hand) as 0 | 1;
    const both = w.both ?? Math.random() < BELLY_TOUCH.bothChance;
    if (!both || !b.free(other) || this.supportHand) return;
    const turn = Math.PI + (Math.random() * 2 - 1) * BELLY_TOUCH.oppositeSpread;
    const spot2 = new THREE.Vector3(), out2 = new THREE.Vector3();
    if (!b.opposite(on.spot, turn, spot2, out2)) return;
    b.ontoSkin(spot2, out2);
    if (this.pickHand(spot2, out2, hand) !== other) return;
    const pair = new HandOn(other, 'pair', b);
    pair.spot.copy(spot2); pair.out.copy(out2);
    this.pairHand = pair;
    b.setJob(pair.hand, this.place(pair));
  }

  // Hold her belly up: a free hand under it (if both are free, either), toward that hand's own side.
  private startSupport(): void {
    const b = this.body;
    const hands = ([0, 1] as const).filter((h) => b.free(h) && !this.holds(h));
    if (hands.length === 0) { this.supportRetry = BELLY_TOUCH.supportRetry; return; }
    const hand = hands.length === 2 ? (Math.random() < 0.5 ? 0 : 1) : hands[0];
    const on = new HandOn(hand, 'support', b);
    // AS FAR UNDER HER BELLY AS HER ARM REACHES: from well under it, a little round toward the hand's own side, up its
    // low curve and further round toward her side until the spot is within her reach (a big belly at full term reaches
    // further out than her arm does under it). Round: + is toward her left, and hand 0 is her left.
    const side = hand === 0 ? 1 : -1, reach = b.armLength(hand) + BELLY_TOUCH.handReach * 0.5;
    b.shoulder(hand, shoulderAt);
    let found = false;
    search: for (let up = BELLY_TOUCH.supportUp; up <= -0.2; up += 0.15) {
      for (let round = BELLY_TOUCH.supportRound; round <= 1.3; round += 0.15) {
        if (!b.onBelly(side * round, up, on.spot, on.out)) break search;
        b.ontoSkin(on.spot, on.out);
        if (b.restToWorld(on.spot, spotWorld).distanceTo(shoulderAt) <= reach) { found = true; break search; }
      }
    }
    if (!found) { this.supportRetry = BELLY_TOUCH.supportRetry; return; }
    this.supportHand = on;
    b.setJob(on.hand, this.place(on));
  }

  /** Let one hand go back to her own pose. */
  private release(on: HandOn): void {
    this.body.setJob(on.hand, null);
    this.body.setCurve(on.hand, null, 0, 0, null);
  }

  /** The kick's touch is over: both its hands back, a short rest. */
  private letGoKick(): void {
    if (this.kickHand) this.release(this.kickHand);
    if (this.pairHand) this.release(this.pairHand);
    this.kickHand = this.pairHand = null;
    this.endTouch();
  }

  private endTouch(): void {
    this.lookAt = -1; this.lookT = -1; this.stopping = -1; this.lookWeight = 0;
    this.rest = BELLY_TOUCH.restSeconds;
  }

  private letGoAll(): void {
    if (this.kickHand || this.pairHand) this.letGoKick();
    if (this.supportHand) { this.release(this.supportHand); this.supportHand = null; }
  }

  /** The free hand to send to a spot: the nearer one, or the far one if its way across her belly is clear. -1: none. */
  private pickHand(spot: THREE.Vector3, out: THREE.Vector3, not: number): number {
    const b = this.body;
    b.restToWorld(spot, spotWorld);
    b.restToWorld(out, outWorld, true).normalize();
    // (a hand comes to the spot from just in front of it, straight in: its way there is from her shoulder to that point)
    target.copy(spotWorld).addScaledVector(outWorld, BELLY_TOUCH.approach);
    // (the hand on the spot's own side: its shoulder the nearer of the two)
    const nearer = b.shoulder(0, shoulderAt).distanceTo(target) <= b.shoulder(1, otherShoulder).distanceTo(target) ? 0 : 1;
    const order = ([0, 1] as const).filter((h) => h !== not && b.free(h) && !this.holds(h))
      .sort((p, q) => (p === nearer ? -1 : 0) - (q === nearer ? -1 : 0));
    for (const hand of order) {
      b.shoulder(hand, shoulderAt);
      // (a spot it cannot reach without her leaning in: not this hand. The hand bone stops short of the palm's middle,
      //  so it need not reach the spot itself: a hand's length less)
      if (shoulderAt.distanceTo(spotWorld) > b.armLength(hand) + BELLY_TOUCH.handReach) continue;
      // (CROSSING OVER to her other side, the straight way from its shoulder to that point must stay out of her belly, or
      //  it would go through her; on its own side her elbow keeps her arm clear: armClear.ts)
      if (hand === nearer) return hand;
      let clear = true;
      for (let i = 1; i <= 12; i++) {
        step.copy(shoulderAt).lerp(target, i / 12);
        if (b.insideBelly(step, BELLY_TOUCH.crossClear)) { clear = false; break; }
      }
      if (clear) return hand;
    }
    return -1;
  }

  /** Where this hand's bone goes now: its palm flat on its spot, 2 mm off her skin. */
  private place(on: HandOn): THREE.Matrix4 {
    const b = this.body, hand = on.hand;
    b.restToWorld(on.spot, spotWorld);
    b.restToWorld(on.out, outWorld, true).normalize();
    palmTo.copy(outWorld).negate();
    // (her skin there now: the spot, pushed out by the kick's bump)
    spotWorld.addScaledVector(outWorld, on.push);
    b.left(leftWay);
    if (on.kind === 'support') {
      // HOLDING HER BELLY UP: her fingers forward and in toward her other side (her left hand's to her right), under her
      // belly, her forearm along its low curve
      b.forward(fingers).multiplyScalar(BELLY_TOUCH.supportForward).addScaledVector(leftWay, hand === 0 ? -1 : 1);
    } else {
      // HER FINGERS carry on the line of her forearm, from her shoulder to the spot, turned a little in toward her middle
      // (her left hand's to her right): her wrist hardly bends, wherever on her belly the spot is
      b.shoulder(hand, shoulderAt);
      fingers.copy(spotWorld).sub(shoulderAt).normalize().addScaledVector(leftWay, hand === 0 ? -0.35 : 0.35);
    }
    fingers.addScaledVector(outWorld, -fingers.dot(outWorld)).normalize();
    // (her skin's own patch there, measured once a touch as her hand sets off: the spot onto it, its real facing for her
    //  palm, its real curve; then all of it again from those)
    if (on.curve < 0) {
      on.patch = b.skinPatch(on.spot, on.out, fingers);
      if (on.patch) {
        on.spot.copy(on.patch.origin);
        on.patch.facing(on.out);
        on.curve = on.patch.curveAlong();
      } else on.curve = 0.2;
      return this.place(on);
    }
    const radius = on.curve;
    // (a ball stands for her belly in the hand's shape, but the fingers measure her skin itself: `surface`)
    b.setCurve(hand, centre.copy(spotWorld).addScaledVector(outWorld, -radius), radius, BELLY_TOUCH.gap, on.patch ? on.surface : null);
    spotWorld.addScaledVector(outWorld, BELLY_TOUCH.gap);
    return b.flatPose(hand, spotWorld, palmTo, fingers, on.pose);
  }
}
