// ============================================================================
// beltReload.ts -- RELOADING ON THE GO, FROM THE CLIPS ON HER BELT
// (Joshua, 2026-11-18: "she reloads one gun at a time on the go since there
// is no table to set the other one down on, if she has a clip available";
// the empty "back into the pouch the fresh one came from"; the table swaps
// empties for full ones).
//
// She keeps walking. For each gun A that is not full, with her other hand B
// (B takes clips from the pouches on ITS side of her: A's clips are on the
// other hip, so a hand never reaches round behind her):
//
//   1. B's gun goes into its holster (her B hand is free), and only then is
//      A's gun drawn, if it was holstered: she never holds both;
//   2. A holds its gun up in front of her chest, tipped toward B (as at the
//      table); B takes the fresh clip out of a pouch (front pouch first);
//   3. B brings it under the gun's grip, takes the empty clip out of the gun
//      too and holds both (the empty beside the fresh one, between her
//      fingers: a "tactical reload");
//   4. B pushes the fresh clip up into the grip: the gun is full;
//   5. A's gun goes back to her aim; B tucks the empty, upright, into the pouch
//      the fresh one came from (its dark top shows: an empty);
//   6. B's gun is drawn again.
//
// Every place her hands go to moves with her (her chest, her hips): each is
// worked out again every frame and her hands follow it (`moveReach`).
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineBody, HeroineHands } from '../core/contracts';
import type { BeltGear } from '../heroine/fast/beltGear';
import { CLIP } from '../heroine/guns';
import { clipGrip } from './clipGrip';
import type { HolsterUse } from './holsterUse';
import { TABLE_USE, type TableUse } from './tableUse';

/** GAME TUNING (metres, seconds). */
export const BELT_RELOAD = Object.freeze({
  /** Her head leads: she looks at her gun this long before her hands start. */
  lead: 0.7,
  /** Where the fresh clip waits under the gun's grip before the empty comes out: this far down from its seat. */
  below: 0.085,
  /** ...and just before it is pushed in. */
  ready: 0.03,
  /** The empty, held beside the fresh one: this far to the side (a clip's width and a finger's gap). */
  beside: CLIP.width + 0.012,
  /** An empty is brought this far above its pouch, then lowered in. */
  abovePouch: 0.07,
  /** Her hand takes a pouch clip by its top: this far from the clip's middle (the clip stands 1.6 cm out of the pouch). */
  holdFromMiddle: CLIP.height / 2 - 0.012,
  /** A short moment at each hand-over (so it can be seen). */
  hold: 0.12,
  /** How long a clip takes to settle into its new place once handed over. */
  settle: 0.25,
});

/** One step: each hand's pose this frame (or null: back to her own), what happens on arrival, a pause after. */
interface Step {
  readonly jobs: Partial<Record<Hand, (() => THREE.Matrix4) | null>>;
  /** Which kind of pose each hand is on (for its wrist limit): a hand holding a gun, or a hand handling a clip. */
  readonly kinds?: Partial<Record<Hand, 'gun' | 'clip'>>;
  done?: () => void;
  readonly hold?: number;
  /** Instead of hands: wait while this is true (her holster at work). */
  readonly waitWhile?: () => boolean;
  readonly begin?: () => void;
}

const other = (hand: Hand): Hand => (hand === 'left' ? 'right' : 'left');
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), flip = new THREE.Matrix4().makeRotationX(Math.PI);
const place = new THREE.Vector3(), turnQ = new THREE.Quaternion(), size = new THREE.Vector3();
const setA = new THREE.Vector3(), setB = new THREE.Vector3(), setSa = new THREE.Vector3(), setSb = new THREE.Vector3();
const setQa = new THREE.Quaternion(), setQb = new THREE.Quaternion();

export class BeltReload {
  private steps: Array<() => Step> = [];
  private current: Step | null = null;
  private poses: Partial<Record<Hand, THREE.Matrix4>> = {};
  private phase: 'idle' | 'lead' | 'steps' = 'idle';
  private timer = 0;
  private arrivedAt = -1;
  /** The gun being reloaded now (where she looks). */
  private gunHand: Hand = 'right';
  /** The clips her clip hand holds: the one it grips (its fingers close on it), and an empty held beside it. */
  private gripped: THREE.Object3D | null = null;
  private besideClip: THREE.Object3D | null = null;
  /** The pouch the fresh clip came from (the empty goes back into it). */
  private pouch = -1;
  private readonly lookPoint = new THREE.Vector3();
  private settling: { object: THREE.Object3D; from: THREE.Matrix4; to: THREE.Matrix4; t: number }[] = [];

  /**
   * Her belt gear is asked for each time (`gearOf`), not kept: a NEW OUTFIT (main.ts `changeOutfit`) brings a new belt.
   */
  constructor(
    private readonly heroine: HeroineBody,
    private readonly gearOf: () => BeltGear | null,
    private readonly table: TableUse,
    private readonly holsters: HolsterUse,
  ) {}

  /** Her belt gear now (null: a body without one). */
  private get gear(): BeltGear | null { return this.gearOf(); }

  /** Whether a reload runs (she still walks). */
  get busy(): boolean { return this.phase !== 'idle'; }
  /** Both her hands are busy while it runs: neither fires. */
  handBusy(_hand: Hand): boolean { return this.busy; }

  /** A full clip in a pouch on the side of her other hand (the hand that changes this gun's clip). */
  private pouchFor(gun: Hand): number {
    if (!this.gear) return -1;
    return this.gear.side(other(gun)).find((i) => this.gear!.pouchState(i) === 'full') ?? -1;
  }

  /** Whether this gun can be reloaded from her belt now: not full, in her hand or holster, a clip on the other side. */
  canReload(gun: Hand): boolean {
    const h = this.heroine.hands;
    if (!h || !this.gear || this.table.rounds[gun] >= TABLE_USE.rounds) return false;
    if (!h.hasGun(gun) && !this.holsters.holstered[gun]) return false;
    return this.pouchFor(gun) >= 0;
  }
  get canStart(): boolean { return !this.busy && (this.canReload('left') || this.canReload('right')); }

  /** Begin: every gun that can be, one at a time (the emptier first). */
  start(): void {
    const h = this.heroine.hands;
    if (!h || !this.canStart) return;
    const guns = (['left', 'right'] as const).filter((g) => this.canReload(g)).sort((a, b) => this.table.rounds[a] - this.table.rounds[b]);
    // (which hands held their guns when she began: those are drawn again at the end)
    const held = { left: h.hasGun('left'), right: h.hasGun('right') };
    this.steps = [];
    for (const a of guns) this.plan(h, a);
    // her guns back in her hands as they were
    this.steps.push(() => {
      const draw = (['left', 'right'] as const).filter((g) => held[g] && !h.hasGun(g) && this.holsters.holstered[g]);
      if (draw.length > 0) this.holsters.start(draw.length === 2 ? 'both' : draw[0], 0);
      return { jobs: {}, waitWhile: () => this.holsters.busy };
    });
    this.gunHand = guns[0];
    this.phase = 'lead';
    this.timer = 0;
    this.current = null;
  }

  /** The steps for gun `a`, its clip changed by her other hand `b`. */
  private plan(h: HeroineHands, a: Hand): void {
    const b = other(a);
    const gunAt = (out: THREE.Matrix4) => this.table.chestGun(a, out);
    // 0. her gun B into its holster FIRST, then her gun A in her hand (drawn, if it was holstered): she never holds
    //    both while reloading (Joshua, 2026-11-19: "she shouldn't have both guns drawn if she's reloading one... she
    //    needs a free hand". Drawn first, the second gun came out while the first was still in her other hand.)
    this.steps.push(() => {
      this.gunHand = a;
      if (h.hasGun(b)) this.holsters.start(b, 0);
      return { jobs: {}, waitWhile: () => this.holsters.busy };
    });
    this.steps.push(() => {
      if (!h.hasGun(a) && this.holsters.holstered[a]) this.holsters.start(a, 0);
      return { jobs: {}, waitWhile: () => this.holsters.busy };
    });
    // 1. gun A up in front of her chest; hand B to the front-most full pouch on its side, by the clip's top
    this.steps.push(() => {
      this.pouch = this.pouchFor(a);
      const i = this.pouch;
      return {
        jobs: {
          [a]: () => h.handPoseForGun(a, gunAt(m1), this.pose(a)),
          [b]: () => clipGrip(h, this.heroine.root, b, this.gear!.pouchClip(i, m2), -1, BELT_RELOAD.holdFromMiddle, this.pose(b)),
        },
        kinds: { [a]: 'gun', [b]: 'clip' },
        begin: () => this.touch(h, b, () => this.gear!.pouchClip(i, m2), false),
        done: () => {
          const fresh = this.gear!.takeFull(i);
          if (!fresh) return;
          this.give(fresh, h.handBone(b));
          this.gripped = fresh;
          h.setHolding(b, true);
          this.touch(h, b, () => fresh.matrixWorld, true);
        },
      };
    });
    // 2. the fresh clip under the gun's grip; the empty comes out of the gun and is held beside it
    this.steps.push(() => ({
      jobs: { [a]: () => h.handPoseForGun(a, gunAt(m1), this.pose(a)), [b]: () => this.carry(this.gripped, this.table.clipPose(h.gun(a).matrixWorld, BELT_RELOAD.below, m2), b) },
      kinds: { [a]: 'gun', [b]: 'clip' },
      hold: BELT_RELOAD.hold,
      done: () => {
        const empty = this.table.clipIn[a];
        if (!empty || !this.gripped) return;
        this.give(empty, h.handBone(b));
        this.table.clipIn[a] = null;
        this.besideClip = empty;
        // (beside the fresh one, across its narrow side: settled there, as if pulled down and out of the grip)
        this.settle(empty, new THREE.Matrix4().copy(this.gripped.matrix).multiply(m1.makeTranslation(BELT_RELOAD.beside, 0, 0)));
      },
    }));
    // 3. up under the grip, then pushed in: the gun is full
    this.steps.push(() => ({
      jobs: { [a]: () => h.handPoseForGun(a, gunAt(m1), this.pose(a)), [b]: () => this.carry(this.gripped, this.table.clipPose(h.gun(a).matrixWorld, BELT_RELOAD.ready, m2), b) },
      kinds: { [a]: 'gun', [b]: 'clip' },
    }));
    this.steps.push(() => ({
      jobs: { [a]: () => h.handPoseForGun(a, gunAt(m1), this.pose(a)), [b]: () => this.carry(this.gripped, this.table.clipPose(h.gun(a).matrixWorld, 0, m2), b) },
      kinds: { [a]: 'gun', [b]: 'clip' },
      hold: BELT_RELOAD.hold,
      done: () => {
        const fresh = this.gripped;
        if (!fresh) return;
        this.give(fresh, h.gun(a));
        this.settle(fresh, h.clipSeat(new THREE.Matrix4()));
        this.table.clipIn[a] = fresh;
        this.table.rounds[a] = TABLE_USE.rounds;
        // (her fingers now on the empty)
        this.gripped = this.besideClip;
        this.besideClip = null;
        const empty = this.gripped;
        if (empty) this.touch(h, b, () => empty.matrixWorld, true);
      },
    }));
    // 4. gun A back to her aim; the empty, upright, over the pouch the fresh clip came from...
    this.steps.push(() => ({
      jobs: { [a]: null, [b]: () => this.carry(this.gripped, this.pouchUpright(this.pouch, BELT_RELOAD.abovePouch, m2), b) },
      kinds: { [b]: 'clip' },
    }));
    // 5. ...and down into it
    this.steps.push(() => ({
      jobs: { [b]: () => this.carry(this.gripped, this.pouchUpright(this.pouch, 0, m2), b) },
      kinds: { [b]: 'clip' },
      hold: BELT_RELOAD.hold,
      done: () => {
        const empty = this.gripped;
        this.touch(h, b, null, false);
        h.setHolding(b, false);
        this.gripped = null;
        if (!empty || !this.gear) return;
        this.gear.stowEmpty(this.pouch, empty);
        this.settle(empty, this.gear.pouchSeat(this.pouch, new THREE.Matrix4()).multiply(flip));
      },
    }));
    this.steps.push(() => ({ jobs: { [b]: null } }));
  }

  /** One frame. Writes where she looks (`lookAt`: the gun she reloads) while it runs, else null. */
  update(dt: number, out: { lookAt: THREE.Vector3 | null }): void {
    this.moveSettling(dt);
    out.lookAt = null;
    if (this.phase === 'idle') return;
    const h = this.heroine.hands!;
    this.timer += dt;
    // (she looks at the gun she is reloading, in front of her chest)
    this.table.chestGun(this.gunHand, m1);
    out.lookAt = this.lookPoint.setFromMatrixPosition(m1);
    if (this.phase === 'lead') {
      if (this.timer < BELT_RELOAD.lead) return;
      this.phase = 'steps';
    }
    if (!this.current) {
      const next = this.steps.shift();
      if (!next) { this.phase = 'idle'; out.lookAt = null; return; }
      this.current = next();
      this.current.begin?.();
      for (const [hand, pose] of Object.entries(this.current.jobs) as [Hand, (() => THREE.Matrix4) | null][]) {
        const kind = this.current.kinds?.[hand];
        h.reach(hand, pose ? pose() : null, kind ? this.wristLimit(h, hand, kind) : undefined, true);
      }
      this.timer = 0;
      this.arrivedAt = -1;
      return;
    }
    const step = this.current;
    if (step.waitWhile) { if (!step.waitWhile()) this.current = null; return; }
    // (every place moves with her: her hands follow)
    for (const [hand, pose] of Object.entries(step.jobs) as [Hand, (() => THREE.Matrix4) | null][]) if (pose) h.moveReach(hand, pose());
    const arrived = (Object.entries(step.jobs) as [Hand, (() => THREE.Matrix4) | null][]).every(([hand, pose]) => (pose ? h.reached(hand) >= 0.999 : h.reached(hand) <= 0));
    if (!arrived) { this.arrivedAt = -1; return; }
    if (this.arrivedAt < 0) this.arrivedAt = this.timer;
    if (step.done) { step.done(); step.done = undefined; this.arrivedAt = this.timer; }
    if (this.timer - this.arrivedAt < (step.hold ?? 0)) return;
    this.current = null;
  }

  // ---- helpers ------------------------------------------------------------------------------------------------------

  /** One matrix per hand for its pose (rewritten each frame). */
  private pose(hand: Hand): THREE.Matrix4 { return (this.poses[hand] ??= new THREE.Matrix4()); }

  /** Her hand B so that the clip it holds (`clip`) ends at `clipAt` (held just as it was taken: nothing slides). */
  private carry(clip: THREE.Object3D | null, clipAt: THREE.Matrix4, hand: Hand): THREE.Matrix4 {
    if (!clip) return this.pose(hand).copy(clipAt);
    return this.pose(hand).copy(clipAt).multiply(m1.copy(clip.matrix).invert());
  }

  /** An upright clip's place in pouch `i` (an empty goes in base down: only its dark top shows), raised `above` metres. */
  private pouchUpright(i: number, above: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.gear!.pouchClip(i, out).multiply(flip);
    out.decompose(place, turnQ, size);
    place.y += above;
    return out.compose(place, turnQ, size);
  }

  /** Her fingers close on a clip (a box where `at` says, every frame), or let go (null). */
  private touchAt: { hand: Hand; at: () => THREE.Matrix4; firm: boolean } | null = null;
  private touch(h: HeroineHands, hand: Hand, at: (() => THREE.Matrix4) | null, firm: boolean): void {
    this.touchAt = at ? { hand, at, firm } : null;
    if (!at) h.hold(hand, null);
    else this.shapeTouch(h);
  }
  private shapeTouch(h: HeroineHands): void {
    const t = this.touchAt;
    if (!t) return;
    t.at().decompose(place, turnQ, size);
    const axis = (x: number, y: number, z: number): [number, number, number] => { const v = new THREE.Vector3(x, y, z).applyQuaternion(turnQ); return [v.x, v.y, v.z]; };
    h.hold(t.hand, {
      kind: 'box',
      centre: [place.x, place.y, place.z],
      axes: [axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)],
      half: [CLIP.width / 2 * size.x, CLIP.height / 2 * size.y, CLIP.depth / 2 * size.z],
    }, t.firm);
  }

  /** Each hand's wrist within the reload's limit (as at the table): a clip hand's fingertips never to the sky. */
  private wristLimit(h: HeroineHands, hand: Hand, kind: 'gun' | 'clip'): { most: number; pivot: THREE.Vector3; along: THREE.Vector3; tipsUpMost: number } {
    return { most: TABLE_USE.wristMost, pivot: h.palmPoint(hand, new THREE.Vector3()), along: h.fingersAlong(hand, new THREE.Vector3()), tipsUpMost: kind === 'gun' ? 1 : TABLE_USE.tipsUpMost };
  }

  /** Give an object to a new parent, keeping it exactly where it is. */
  private give(object: THREE.Object3D, parent: THREE.Object3D): void {
    object.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    object.matrixAutoUpdate = false;
    object.matrix.copy(parent.matrixWorld).invert().multiply(object.matrixWorld);
    parent.add(object);
  }

  private settle(object: THREE.Object3D, place_: THREE.Matrix4): void {
    this.settling = this.settling.filter((s) => s.object !== object);
    this.settling.push({ object, from: object.matrix.clone(), to: place_.clone(), t: 0 });
  }

  private moveSettling(dt: number): void {
    // (her fingers' shape follows the clip they are on, wherever it has gone)
    if (this.touchAt && this.heroine.hands) this.shapeTouch(this.heroine.hands);
    for (const s of this.settling) {
      s.t = Math.min(1, s.t + dt / BELT_RELOAD.settle);
      const k = s.t * s.t * (3 - 2 * s.t);
      s.from.decompose(setA, setQa, setSa);
      s.to.decompose(setB, setQb, setSb);
      s.object.matrix.compose(setA.lerp(setB, k), setQa.slerp(setQb, k), setSa.lerp(setSb, k));
      s.object.matrixWorldNeedsUpdate = true;
    }
    this.settling = this.settling.filter((s) => s.t < 1);
  }
}
