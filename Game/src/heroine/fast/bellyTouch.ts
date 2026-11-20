// ============================================================================
// bellyTouch.ts -- HER HAND TO HER BELLY WHEN THE BABY KICKS (Joshua,
// 2026-11-20: "a smart/auto hand on the belly that holds for 3s when like the
// baby kicks... it would mark the center location of the point of it and then
// her palm will sit briefly on her stomach at the location before returning to
// whatever she is doing... only if one hand is free. It can cross over to the
// other side providing her arms don't collide with her belly before her hand
// can touch").
//
// The kicks are the builder's own (her hidden live body, liveBody.ts): each is
// a place on her skin as she stood, a way out and a push. When a NEW kick
// starts:
//   1. which hands are free (nothing in them, no job of their own, the game not
//      using them: `free`);
//   2. of those, the one nearer the kick goes; the far hand may only CROSS her
//      belly if the straight way from its shoulder to the spot stays out of her
//      belly (`crossClear`), or it would have to go through her to get there;
//   3. its palm is laid flat on the spot (fingerTouch.ts `flatPose`), fingers
//      pointing across her belly and a little down, the spot carried with her
//      as she walks and breathes; it stays 3 s once there (`holdSeconds`) and
//      goes back to her own pose (handReach.ts eases both ways);
//   4. then a short rest (`restSeconds`) before another kick can call a hand.
// Nothing if both hands are busy, her body is down on the ground, or the game
// gives that hand a job meanwhile (it is let go at once: `cancel`).
// ============================================================================
import * as THREE from 'three';

/** GAME TUNING. */
export const BELLY_TOUCH = {
  /** How long her palm rests on the spot once it is there, seconds. */
  holdSeconds: 3,
  /** At most this long on the way before it gives up (an arm that cannot get there), seconds. */
  reachSeconds: 1.6,
  /** After a touch, this long before another kick can call a hand, seconds. */
  restSeconds: 1.5,
  /** Her arm's way to the spot must stay this far out of her belly, metres (else that hand does not cross over). */
  crossClear: 0.02,
  /** Her hand comes in to the spot from this far in front of it, metres. */
  approach: 0.12,
  /**
   * HOW FAR OFF HER SKIN HER HAND RESTS (Joshua, 2026-11-20: "lock in around 2mm of the belly's live skin"), metres:
   * her palm and every finger, her fingers curling round her belly's curve to keep it (they close smoothly as her hand
   * arrives, fingerTouch.ts), her palm over the kick's bump while it lasts.
   */
  gap: 0.002,
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
  /** Whether a hand is free now (no gun, no job, nothing the game is doing with it). */
  free(hand: 0 | 1): boolean;
  /** Her left, world (across her forward), and her up. */
  left(out: THREE.Vector3): THREE.Vector3;
  /** The pose her hand bone needs for its palm to lie flat on `at`, facing `palmTo`, fingers along `fingers`. */
  flatPose(hand: 0 | 1, at: THREE.Vector3, palmTo: THREE.Vector3, fingers: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * Her belly's curve under the hand, for its fingers to curl round (a ball touching her skin at the spot, as round as
   * her belly is there), kept `gap` off; null: no curve (the hand goes back to her own pose).
   */
  setCurve(hand: 0 | 1, centre: THREE.Vector3 | null, radius: number, gap: number): void;
  /**
   * HER OWN SKIN AT A SPOT (as she stood): the spot moved along `out` onto her skin's outermost points there, so her palm
   * rests 2 mm off HER skin (the builder's kicks are on the builder's skin, a test kick on her belly's egg).
   */
  ontoSkin(spot: THREE.Vector3, out: THREE.Vector3): void;
  /**
   * HER SKIN AT A SPOT, ITSELF (as she stood): from the spot, its first-guess facing `out` and the way her fingers lie
   * (world, now): the spot moved onto her skin's own patch there, the way that patch really faces (into `normalOut`),
   * and how round it is along her fingers (returned: the curve's radius, metres).
   */
  skinFrame(spot: THREE.Vector3, out: THREE.Vector3, worldWay: THREE.Vector3, normalOut: THREE.Vector3): number;
  /** Give a hand this pose to reach (null: back to her own pose), or move the pose it is reaching for. */
  setJob(hand: 0 | 1, pose: THREE.Matrix4 | null): void;
  moveJob(hand: 0 | 1, pose: THREE.Matrix4): void;
  /** How far a hand is on its way, 0..1 (1: there). */
  progress(hand: 0 | 1): number;
}

const spotWorld = new THREE.Vector3(), outWorld = new THREE.Vector3(), shoulderAt = new THREE.Vector3();
const leftWay = new THREE.Vector3(), fingers = new THREE.Vector3(), palmTo = new THREE.Vector3(), step = new THREE.Vector3();
const centre = new THREE.Vector3();

export class BellyTouch {
  /** The hand on her belly now (or on its way), or -1. */
  hand: -1 | 0 | 1 = -1;
  /** The kick's spot and its way out, as she stood (her rest frame). */
  private readonly spot = new THREE.Vector3();
  private readonly out = new THREE.Vector3(0, 0, 1);
  private timer = 0;
  private there = 0;
  private rest = 0;
  private readonly pose = new THREE.Matrix4();
  /** Each kick's push last frame (a kick starts when its push rises from nothing). */
  private readonly before: number[] = [];
  /** Which of the builder's kicks the hand is for (-1: one asked for by hand), and how far its bump stands out now. */
  private kick = -1;
  private push = 0;
  /** Her skin's curve under this hand, metres (measured once a touch; -1 not yet). */
  private curve = -1;

  constructor(private readonly body: BellyTouchBody) {}

  /** A kick asked for by hand (test pages, which have no live body to kick): at `spot`, pushing out along `out` (rest frame). */
  private poked: { spot: THREE.Vector3; out: THREE.Vector3 } | null = null;
  poke(spot: THREE.Vector3, out: THREE.Vector3): void { this.poked = { spot: spot.clone(), out: out.clone() }; }

  /** The game gave this hand something to do: let go of the belly at once (its own job has replaced ours). */
  cancel(hand: 0 | 1): void {
    if (this.hand === hand) { this.hand = -1; this.rest = BELLY_TOUCH.restSeconds; }
  }

  /**
   * One frame, after her pose (her bones' world matrices up to date), before her hands are laid on their jobs.
   * `kickAt`/`kickDir`: the builder's kicks now (xyz her rest frame; `kickAt.w` the push, 0 = none; `kickDir.xyz` the
   * way out). `allowed`: false while her body cannot (down on the ground): any touch is let go.
   */
  update(dt: number, kickAt: readonly THREE.Vector4[] | null, kickDir: readonly THREE.Vector4[] | null, allowed: boolean): void {
    this.rest = Math.max(0, this.rest - dt);
    // ---- a NEW kick: is there a hand to send? ----
    let started = -1;
    if (kickAt) {
      for (let k = 0; k < kickAt.length; k++) {
        const was = this.before[k] ?? 0, now = kickAt[k].w;
        if (was <= 0 && now > 0 && started < 0) started = k;
        this.before[k] = now;
      }
    }
    if (this.hand < 0 && (started >= 0 && kickDir || this.poked) && allowed && this.rest <= 0) {
      if (this.poked) { this.spot.copy(this.poked.spot); this.out.copy(this.poked.out).normalize(); this.poked = null; this.kick = -1; }
      else {
        this.kick = started;
        this.spot.set(kickAt![started].x, kickAt![started].y, kickAt![started].z);
        this.out.set(kickDir![started].x, kickDir![started].y, kickDir![started].z).normalize();
      }
      this.body.ontoSkin(this.spot, this.out);
      const hand = this.pickHand();
      if (hand >= 0) { this.hand = hand as 0 | 1; this.timer = 0; this.there = 0; this.push = 0; this.curve = -1; this.body.setJob(this.hand, this.place(this.hand)); }
    }
    if (this.hand < 0) return;
    const hand = this.hand as 0 | 1;
    // ---- a hand on its way, or resting there: its spot carried with her; let go after its time, or if she cannot ----
    if (!allowed || !this.body.free(hand)) { this.letGo(); return; }
    this.timer += dt;
    // (the kick's bump under her palm, eased: her hand rides out on it and back as it goes down)
    const bump = this.kick >= 0 && kickAt && kickAt[this.kick] ? Math.max(0, kickAt[this.kick].w) : 0;
    this.push += (bump - this.push) * (1 - Math.exp(-dt / 0.15));
    this.body.moveJob(hand, this.place(hand));
    if (this.body.progress(hand) >= 0.95) this.there += dt;
    if (this.there >= BELLY_TOUCH.holdSeconds || (this.there === 0 && this.timer >= BELLY_TOUCH.reachSeconds)) this.letGo();
  }

  /** Back to her own pose, and a short rest. */
  private letGo(): void {
    if (this.hand >= 0) { this.body.setJob(this.hand as 0 | 1, null); this.body.setCurve(this.hand as 0 | 1, null, 0, 0); }
    this.hand = -1;
    this.rest = BELLY_TOUCH.restSeconds;
  }

  /** The free hand to send: the nearer one, or the far one if its way across her belly is clear. -1: none. */
  private pickHand(): number {
    const b = this.body;
    b.restToWorld(this.spot, spotWorld);
    b.restToWorld(this.out, outWorld, true);
    // (a hand comes to the spot from just in front of it, straight in: its way there is from her shoulder to that point)
    const target = spotWorld.clone().addScaledVector(outWorld, BELLY_TOUCH.approach);
    const order = ([0, 1] as const).filter((h) => b.free(h))
      .sort((p, q) => b.shoulder(p, shoulderAt).distanceTo(target) - b.shoulder(q, new THREE.Vector3()).distanceTo(target));
    for (const hand of order) {
      // (the straight way from its shoulder to that point must stay out of her belly: crossing over to her other side,
      //  it would otherwise go through her)
      b.shoulder(hand, shoulderAt);
      // (a spot it cannot reach without her leaning in: not this hand. The hand bone stops short of the palm's middle,
      //  so it need not reach the spot itself: a hand's length less)
      if (shoulderAt.distanceTo(spotWorld) > b.armLength(hand) + 0.06) continue;
      let clear = true;
      for (let i = 1; i <= 12; i++) {
        step.copy(shoulderAt).lerp(target, i / 12);
        if (b.insideBelly(step, BELLY_TOUCH.crossClear)) { clear = false; break; }
      }
      if (clear) return hand;
    }
    return -1;
  }

  /** Where this hand's bone goes now: its palm flat on the spot, fingers across her belly and a little down. */
  private place(hand: 0 | 1): THREE.Matrix4 {
    const b = this.body;
    b.restToWorld(this.spot, spotWorld);
    b.restToWorld(this.out, outWorld, true).normalize();
    palmTo.copy(outWorld).negate();
    // (her skin there now: the spot, pushed out by the kick's bump; her palm rests `gap` off it)
    spotWorld.addScaledVector(outWorld, this.push);
    // (her fingers curl round a ball as round as her belly is there along her fingers, touching her skin at the spot)
    b.left(leftWay);
    b.shoulder(hand, shoulderAt);
    fingers.copy(spotWorld).sub(shoulderAt).normalize().addScaledVector(leftWay, hand === 0 ? -0.35 : 0.35);
    fingers.addScaledVector(outWorld, -fingers.dot(outWorld)).normalize();
    // (her skin's own patch there, measured once a touch as her hand sets off (it reads all her skin's points): the
    //  spot onto it, its real facing for her palm, its real curve for her fingers; then all of it again from those)
    if (this.curve < 0) {
      this.curve = Math.max(0.05, Math.min(0.6, b.skinFrame(this.spot, this.out, fingers, this.out)));
      return this.place(hand);
    }
    const radius = this.curve;
    b.setCurve(hand, centre.copy(spotWorld).addScaledVector(outWorld, -radius), radius, BELLY_TOUCH.gap);
    spotWorld.addScaledVector(outWorld, BELLY_TOUCH.gap);
    // HER FINGERS (worked out above) carry on the line of her forearm, from her shoulder to the spot, turned a little in
    // toward her middle (her left hand's to her right): her wrist hardly bends, wherever on her belly the spot is (a
    // hand turned across her belly on her side asked more than her wrist turns, and her palm stood off her skin)
    return b.flatPose(hand, spotWorld, palmTo, fingers, this.pose);
  }
}
