// ============================================================================
// tableUse.ts -- what she does at the weapon table: putting her guns down,
// taking them up, and RELOADING (Joshua, 2026-11-17).
//
// Each action is a list of STEPS. A step sends one or both hands to a pose
// (or back to her own pose), waits until they arrive, does something there
// (a gun or a clip changes hands), and may hold a moment. Before the steps,
// she walks to her spot at the table and turns to it.
//
// PUT DOWN / PICK UP: each gun to its stand, and it changes hands there.
//
// RELOAD (about 4 seconds a gun; Joshua: "she lays one down, pops the ammo
// clip off the bottom, grabs a new one that clips in, sets it down, and does
// the other"), for each gun that is not full, A, with her other hand B:
//   1. B's gun goes onto its stand (B's hand is free);
//   2. A holds its gun up in front of her chest, tipped so its grip faces B;
//   3. B takes the clip from under the grip, pulls it out, drops it in the tray;
//   4. B takes a full clip from the rack;
//   5. B pushes it up into the grip: the gun is full (20 rounds);
//   6. A sets the gun on its stand.
// Then both guns are taken up again.
//
// While an action runs the player's stick is not hers: the game asks `busy`.
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineBody, HeroineHands } from '../core/contracts';
import { TABLE, type WeaponTable } from './weaponTable';
import { CLIP } from '../heroine/guns';

/** GAME TUNING. */
export const TABLE_USE = Object.freeze({
  /** HER HEAD LEADS: she looks at the table this long before she starts walking, seconds. */
  lead: 0.7,
  /** Close enough to her spot, metres. */
  arrived: 0.04,
  /** Turned to the table within this, radians (about 8 degrees). */
  faced: 0.14,
  /** The longest she waits to be turned before she reaches anyway, seconds. */
  faceWaitMost: 1.5,
  /** A short pause holding the pose when a gun changes hands, seconds (so it can be seen). */
  holdSeconds: 0.15,
  /** After her hands arrive at the table, a moment more for her to finish leaning in (lowerBody.ts), seconds. */
  settleSeconds: 0.35,
  /** A gun's rounds. */
  rounds: 20,
  /** RELOAD: where she holds a gun up (from her middle, metres: forward, up, toward her other hand) and how tipped. */
  chestForward: 0.36,
  /** ...and at least this far in front of her belly's front, metres (room for her other hand under the clip). */
  chestPastBelly: 0.14,
  chestUp: 0.98,
  chestIn: 0.06,
  chestPitchUp: 0.45,
  chestRollIn: 0.5,
  /** How far below the gun's grip a clip is pulled out, metres, and how far her other hand sits below the clip it holds. */
  clipPull: 0.08,
  /** Her hand takes a clip from the rack this far below its middle; an old clip is let go this far above the tray. */
  clipHoldLow: 0.008,
  /** ...and out of a gun, by its base: this far below its middle (it is 6 cm long; the gun's grip covers its top). */
  clipHoldBase: 0.026,
  dropFrom: 0.1,
  /** How far out from her middle her shoulder is (where her forearm comes from, reaching under a clip), metres. */
  shoulderOut: 0.18,
  /** The most her wrist turns from its own relaxed pose through the reload, radians (50 degrees). */
  wristMost: 50 * Math.PI / 180,
  /** How long a gun or a clip takes to settle into its place once handed over, seconds. */
  settleHandOver: 0.2,
  /** Her fingers open on a clip over the tray this long before it drops, seconds. */
  openBeforeDrop: 0.18,
  /** ...and her hand points at least this far below level (a sine: -0.1 is about 6 degrees down), never to the sky. */
  tipsUpMost: -0.1,
  /** A hand waiting between steps of the reload: this far above its own gun stand, metres. */
  waitAbove: 0.07,
});

/** What she is doing. */
type Action = 'idle' | 'putDown' | 'pickUp' | 'reload';

/** One step: where each hand goes (a pose, or null: back to her own), what happens when they get there, a pause after. */
interface Step {
  readonly jobs: Partial<Record<Hand, THREE.Matrix4 | null>>;
  done?: () => void;
  readonly hold?: number;
  /** Wait for her to finish leaning in (the hands are low, at the table). */
  readonly settle?: boolean;
}

const other = (hand: Hand): Hand => (hand === 'left' ? 'right' : 'left');
const spot = new THREE.Vector3(), slotAt = new THREE.Matrix4(), scratch = new THREE.Matrix4(), toward = new THREE.Vector3();
const scratch2 = new THREE.Matrix4(), scratch3 = new THREE.Matrix4();
const facePoint = new THREE.Vector3(), faceOut = new THREE.Vector3();
const clipPlace = new THREE.Vector3(), clipTurn = new THREE.Quaternion(), clipSize = new THREE.Vector3();
const clipUp = new THREE.Vector3(), clipAcross = new THREE.Vector3(), palmWay = new THREE.Vector3(), wrapWay = new THREE.Vector3();
const gunWas = new THREE.Matrix4(), setA = new THREE.Vector3(), setB = new THREE.Vector3(), setSa = new THREE.Vector3(), setSb = new THREE.Vector3();
const setQa = new THREE.Quaternion(), setQb = new THREE.Quaternion();
const basisX = new THREE.Vector3(), basisY = new THREE.Vector3(), basisZ = new THREE.Vector3(), q = new THREE.Quaternion();

export class TableUse {
  action: Action = 'idle';
  /** Each gun's rounds left. */
  readonly rounds: Record<Hand, number> = { left: TABLE_USE.rounds, right: TABLE_USE.rounds };
  private phase: 'lead' | 'walk' | 'face' | 'steps' = 'lead';
  /** Where she looks on her way: between the gun stands. */
  private readonly lookPoint = new THREE.Vector3();
  private steps: Array<() => Step> = [];
  private current: Step | null = null;
  private timer = 0;
  private arrivedAt = -1;
  /** The guns lying on the table, by hand (to move them with their stands when the table's height changes). */
  private readonly lying = new Map<Hand, THREE.Object3D>();
  /** The clip in each gun now (a reload gives a gun a new one), and a clip a hand is holding. */
  private readonly clipIn: Record<Hand, THREE.Object3D | null>;
  private readonly clipHeld: Record<Hand, THREE.Object3D | null> = { left: null, right: null };
  /**
   * The clip each hand is closing its fingers onto (Joshua, 2026-11-18: "apply the same technique" as the pole): on its
   * way to take it, and while it carries it. Its fingers close round it, joint by joint, until they touch.
   */
  private readonly clipTouched: Record<Hand, THREE.Object3D | null> = { left: null, right: null };
  /** The hand poses that hold a gun (the fingertip rule is not for them). */
  private readonly gunPoses = new WeakSet<THREE.Matrix4>();
  /**
   * The hand poses that set a gun on its stand or take it off (no wrist limit: the gun must sit exactly; a wrist held
   * back left it to snap onto its stand, up to 18 cm and 57 degrees in a frame, as it was let go).
   */
  private readonly standPoses = new WeakSet<THREE.Matrix4>();
  /** Things settling into their new places (see `settle`). */
  private settling: { object: THREE.Object3D; from: THREE.Matrix4; to: THREE.Matrix4; t: number }[] = [];

  constructor(private readonly table: WeaponTable, private readonly heroine: HeroineBody) {
    const h = heroine.hands;
    this.clipIn = { left: h?.gunClip('left') ?? null, right: h?.gunClip('right') ?? null };
  }

  /** Whether an action is running (the player's stick does not move her meanwhile). */
  get busy(): boolean { return this.action !== 'idle'; }

  /** How far she is from her spot at the table, metres (the buttons show when she is near). */
  distance(x: number, z: number): number {
    this.table.standSpot(spot, this.heroine.hands?.bellyAhead() ?? 0);
    return Math.hypot(spot.x - x, spot.z - z);
  }

  /** Whether the buttons should show: she is near, has hands, and nothing is running. */
  canUse(x: number, z: number): boolean {
    return !!this.heroine.hands && !this.busy && this.distance(x, z) < TABLE.near;
  }

  /**
   * The main button's word: PICK UP when a gun lies on the table and none is in her hands; otherwise PUT DOWN (her guns
   * in her hands, or in her holsters: those are drawn first, src/main.ts).
   */
  label(): string {
    const h = this.heroine.hands;
    return h && !h.hasGun('left') && !h.hasGun('right') && this.lying.size > 0 ? 'PICK UP' : 'PUT DOWN';
  }

  /** Whether this hand's gun lies on the table. */
  lies(hand: Hand): boolean { return this.lying.has(hand); }

  /** Whether a reload would do anything (a gun is not full). */
  get needsReload(): boolean { return this.rounds.left < TABLE_USE.rounds || this.rounds.right < TABLE_USE.rounds; }

  /** Change the table's height (Settings); the guns lying on it go up or down with their stands. */
  setHeight(height: number): void {
    if (this.busy) return;
    this.table.setHeight(height);
    for (const [hand, gun] of this.lying) gun.matrix.copy(this.table.root.matrixWorld).invert().multiply(this.table.slot(hand, slotAt));
  }

  /**
   * Begin: 'both' (the main button), one hand (L or R), or 'reload'. Both: whichever guns she holds go down, or if she
   * holds none, both come up. One hand: that hand's gun goes down if she holds it, up if it lies on the table.
   */
  start(which: 'both' | Hand | 'reload'): void {
    const h = this.heroine.hands;
    if (!h || this.busy) return;
    this.steps = [];
    if (which === 'reload') {
      if (!this.needsReload) return;
      this.action = 'reload';
      this.planReload(h);
    } else {
      let hands: Hand[];
      let down: boolean;
      if (which === 'both') {
        const held = (['left', 'right'] as const).filter((hand) => h.hasGun(hand));
        down = held.length > 0;
        // (taken up: only the guns that lie here; one in a holster stays there)
        hands = down ? held : (['left', 'right'] as const).filter((hand) => this.lying.has(hand));
      } else {
        down = h.hasGun(which);
        hands = down || this.lying.has(which) ? [which] : [];
      }
      if (hands.length === 0) return;
      this.action = down ? 'putDown' : 'pickUp';
      this.planGuns(hands, down);
    }
    this.phase = 'lead';
    this.current = null;
    this.timer = 0;
    // her body keeps off the table's edge while she is at it (whatever her belly's size)
    h.keepOff(this.table.nearFace(facePoint, faceOut));
  }

  /** One frame. `at` is where she stands; this writes where she should walk and which way she should look. */
  update(dt: number, atX: number, atZ: number, out: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null }): void {
    out.walkTo = null;
    out.look = null;
    out.lookAt = null;
    this.table.update(dt);
    this.moveSettling(dt);
    if (this.action === 'idle') return;
    const h = this.heroine.hands!;
    this.timer += dt;
    const face = this.table.faceYaw;
    out.look = face;
    // HER HEAD LEADS (Joshua, 2026-11-18): first she looks at the gun stands, for TABLE_USE.lead seconds, standing; then
    // she walks there looking at them (looking down more as she comes close); there, she turns to the table
    this.table.slot('left', slotAt); this.lookPoint.setFromMatrixPosition(slotAt);
    this.table.slot('right', slotAt); this.lookPoint.add(toward.setFromMatrixPosition(slotAt)).multiplyScalar(0.5);
    out.lookAt = this.lookPoint;
    if (this.phase === 'lead') {
      out.look = Math.atan2(this.lookPoint.x - atX, this.lookPoint.z - atZ);
      if (this.timer < TABLE_USE.lead) return;
      this.phase = 'walk';
    }
    if (this.phase === 'walk') {
      this.table.standSpot(spot, h.bellyAhead());
      out.look = Math.atan2(this.lookPoint.x - atX, this.lookPoint.z - atZ);
      if (Math.hypot(spot.x - atX, spot.z - atZ) > TABLE_USE.arrived) { out.walkTo = spot; return; }
      out.look = face;
      this.phase = 'face'; this.timer = 0;
    }
    if (this.phase === 'face') {
      const off = Math.abs(Math.atan2(Math.sin(out.yaw - face), Math.cos(out.yaw - face)));
      if (off > TABLE_USE.faced && this.timer < TABLE_USE.faceWaitMost) return;
      this.phase = 'steps';
      this.current = null;
    }
    // THE STEPS: start the next when there is none; wait for its hands; do its thing; hold; move on
    if (!this.current) {
      const next = this.steps.shift();
      if (!next) { this.finish(h); return; }
      this.current = next();
      for (const [hand, pose] of Object.entries(this.current.jobs) as [Hand, THREE.Matrix4 | null][]) h.reach(hand, pose, pose && this.action === 'reload' && !this.standPoses.has(pose) ? this.wristLimit(hand, this.gunPoses.has(pose)) : undefined);
      this.timer = 0;
      this.arrivedAt = -1;
      return;
    }
    this.touchClips(h);
    const step = this.current;
    const arrived = (Object.entries(step.jobs) as [Hand, THREE.Matrix4 | null][])
      .every(([hand, pose]) => (pose ? h.reached(hand) >= 0.999 : h.reached(hand) <= 0));
    if (!arrived) { this.arrivedAt = -1; return; }
    if (this.arrivedAt < 0) this.arrivedAt = this.timer;
    if (step.settle && this.timer - this.arrivedAt < TABLE_USE.settleSeconds) return;
    if (step.done) { step.done(); step.done = undefined; this.arrivedAt = this.timer; }
    if (this.timer - this.arrivedAt < (step.hold ?? 0)) return;
    this.current = null;
  }

  // ---- The plans ---------------------------------------------------------------------------------------------------

  /** Put these hands' guns down on their stands, or take them up from them. */
  private planGuns(hands: Hand[], down: boolean): void {
    const h = this.heroine.hands!;
    this.steps.push(() => ({
      jobs: Object.fromEntries(hands.map((hand) => [hand, this.standPose(h, hand, this.table.slot(hand, slotAt), new THREE.Matrix4())])),
      settle: true,
      hold: TABLE_USE.holdSeconds,
      done: () => { for (const hand of hands) { if (down) this.gunDown(hand); else this.gunUp(hand); } },
    }));
    this.steps.push(() => ({ jobs: Object.fromEntries(hands.map((hand) => [hand, null])) }));
  }

  /** The reload (see the top of this file), then both guns taken up. */
  private planReload(h: HeroineHands): void {
    for (const a of ['left', 'right'] as const) {
      if (this.rounds[a] >= TABLE_USE.rounds) continue;
      const b = other(a);
      // 1. her other hand's gun onto its stand (if she holds it), and this gun taken up (if it lies there)
      this.steps.push(() => {
        const jobs: Partial<Record<Hand, THREE.Matrix4 | null>> = {};
        if (h.hasGun(b)) jobs[b] = this.standPose(h, b, this.table.slot(b, slotAt), new THREE.Matrix4());
        if (!h.hasGun(a)) jobs[a] = this.standPose(h, a, this.table.slot(a, slotAt), new THREE.Matrix4());
        if (!jobs.left && !jobs.right) return { jobs: {} };
        return { jobs, settle: true, done: () => { if (jobs[b]) this.gunDown(b); if (jobs[a]) this.gunUp(a); } };
      });
      // 2. the gun held up in front of her chest, tipped toward her other hand (which waits just over its own stand)
      const gunAt = new THREE.Matrix4();
      this.steps.push(() => {
        this.chestGun(a, gunAt);
        return { jobs: { [a]: this.gunPose(h, a, gunAt, new THREE.Matrix4()), [b]: this.waitOver(b) } };
      });
      // 3. her other hand under the grip, on the clip; pulled out; dropped in the tray. (The gun is read where it really
      //    is now, in her hand: her arm may have stopped a little short of where it was sent.)
      this.steps.push(() => {
        gunAt.copy(h.gun(a).matrixWorld);
        this.clipTouched[b] = this.clipIn[a];
        return { jobs: { [b]: this.handToClip(b, this.clipPose(gunAt, 0, scratch), 'below') }, done: () => this.takeClip(a, b) };
      });
      this.steps.push(() => ({ jobs: { [b]: this.handCarrying(b, this.clipPose(gunAt, TABLE_USE.clipPull, scratch)) } }));
      // (carried to just above the tray and let go: it drops in. Her hand stays above the tray, never in it.)
      this.steps.push(() => {
        this.table.trayPose(scratch);
        scratch.elements[13] += TABLE_USE.dropFrom;
        // (her fingers open first, THEN the clip drops: Joshua, 2026-11-18)
        return { jobs: { [b]: this.handCarrying(b, scratch) }, settle: true, done: () => this.letGoOfClip(b), hold: TABLE_USE.openBeforeDrop };
      });
      this.steps.push(() => ({ jobs: {}, done: () => this.dropClip(b) }));
      // 4. a full clip from the rack
      this.steps.push(() => {
        const slot = Math.max(0, this.table.fullSlot());
        this.clipTouched[b] = this.table.rackClip(slot);
        return { jobs: { [b]: this.handToClip(b, this.table.rackSlot(slot, scratch), 'side') }, settle: true, done: () => this.takeFromRack(slot, b) };
      });
      // 5. up under the grip, then pushed in: the gun is full
      this.steps.push(() => {
        gunAt.copy(h.gun(a).matrixWorld);
        return { jobs: { [b]: this.handCarrying(b, this.clipPose(gunAt, TABLE_USE.clipPull, scratch)) } };
      });
      this.steps.push(() => ({ jobs: { [b]: this.handCarrying(b, this.clipPose(gunAt, 0, scratch)) }, hold: TABLE_USE.holdSeconds, done: () => this.clipIntoGun(b, a) }));
      // 6. the gun set on its stand; her other hand waits just over its own stand, ready for what comes next
      //    (Joshua, 2026-11-18: sent back to her side between steps, it dropped and swung up again, nearly a metre in
      //    half a second: it read as a jump)
      this.steps.push(() => ({
        jobs: { [a]: this.standPose(h, a, this.table.slot(a, slotAt), new THREE.Matrix4()), [b]: this.waitOver(b) },
        settle: true,
        done: () => this.gunDown(a),
      }));
    }
    // both guns taken up again, and her hands back to her
    this.steps.push(() => {
      const hands = (['left', 'right'] as const).filter((hand) => !h.hasGun(hand));
      if (hands.length === 0) return { jobs: {} };
      return {
        jobs: Object.fromEntries(hands.map((hand) => [hand, this.standPose(h, hand, this.table.slot(hand, slotAt), new THREE.Matrix4())])),
        settle: true,
        hold: TABLE_USE.holdSeconds,
        done: () => { for (const hand of hands) this.gunUp(hand); },
      };
    });
    this.steps.push(() => ({ jobs: { left: null, right: null } }));
  }

  private finish(h: HeroineHands): void {
    if (h.lowering().weight > 0) return; // (stood up first)
    this.action = 'idle';
    h.keepOff(null);
  }

  // ---- Guns and clips changing hands -------------------------------------------------------------------------------

  private gunDown(hand: Hand): void {
    const h = this.heroine.hands!;
    const gun = h.releaseGun(hand, this.table.root);
    // (left where it is, then SETTLED onto its stand: her hand may be a little off it, and setting it there at once
    //  jumped it, up to 18 cm and 57 degrees in a frame)
    this.settle(gun, scratch2.copy(this.table.root.matrixWorld).invert().multiply(this.table.slot(hand, slotAt)));
    this.lying.set(hand, gun);
  }

  private gunUp(hand: Hand): void {
    const h = this.heroine.hands!, gun = h.gun(hand);
    gun.updateWorldMatrix(true, false);
    gunWas.copy(gun.matrixWorld);
    h.takeGun(hand);
    // (in her hand where it lay, then settled into her grip)
    const bone = h.handBone(hand);
    bone.updateWorldMatrix(true, false);
    const seat = h.gunSeat(hand, scratch3);
    gun.matrix.copy(bone.matrixWorld).invert().multiply(gunWas);
    this.settle(gun, seat);
    this.lying.delete(hand);
  }

  /**
   * SETTLING (Joshua, 2026-11-18: nothing jumps): an object just handed over (a gun to its stand or her hand, a clip
   * into a gun) starts exactly where it was and eases into its place in its new holder over settleHandOver seconds.
   */
  private settle(object: THREE.Object3D, place: THREE.Matrix4): void {
    this.settling = this.settling.filter((s) => s.object !== object);
    this.settling.push({ object, from: object.matrix.clone(), to: place.clone(), t: 0 });
  }

  private moveSettling(dt: number): void {
    for (const s of this.settling) {
      s.t = Math.min(1, s.t + dt / TABLE_USE.settleHandOver);
      const k = s.t * s.t * (3 - 2 * s.t);
      s.from.decompose(setA, setQa, setSa);
      s.to.decompose(setB, setQb, setSb);
      s.object.matrix.compose(setA.lerp(setB, k), setQa.slerp(setQb, k), setSa.lerp(setSb, k));
      s.object.matrixWorldNeedsUpdate = true;
    }
    this.settling = this.settling.filter((s) => s.t < 1);
  }

  /** Her hand `b` takes the clip out of gun `a` (it is kept where it is, now held). */
  private takeClip(a: Hand, b: Hand): void {
    const clip = this.clipIn[a];
    if (!clip) return;
    this.give(clip, this.heroine.hands!.handBone(b));
    this.clipIn[a] = null;
    this.clipHeld[b] = clip;
    this.heroine.hands!.setHolding(b, true);
  }

  private dropClip(b: Hand): void {
    this.letGoOfClip(b);
    const clip = this.clipHeld[b];
    if (clip) this.table.dropInTray(clip);
    this.clipHeld[b] = null;
    this.heroine.hands!.setHolding(b, false);
  }

  private takeFromRack(slot: number, b: Hand): void {
    const clip = this.table.takeFromRack(slot);
    if (!clip) return;
    this.give(clip, this.heroine.hands!.handBone(b));
    this.clipHeld[b] = clip;
    this.heroine.hands!.setHolding(b, true);
  }

  /** The clip in hand `b` clicked into gun `a`: seated exactly, and the gun is full. */
  private clipIntoGun(b: Hand, a: Hand): void {
    this.letGoOfClip(b);
    const clip = this.clipHeld[b];
    if (!clip) return;
    const h = this.heroine.hands!;
    // (in the gun where it is, then settled into its seat)
    this.give(clip, h.gun(a));
    this.settle(clip, h.clipSeat(scratch3));
    this.clipIn[a] = clip;
    this.clipHeld[b] = null;
    h.setHolding(b, false);
    this.rounds[a] = TABLE_USE.rounds;
  }

  /** Give an object to a new parent, keeping it exactly where it is. */
  private give(object: THREE.Object3D, parent: THREE.Object3D): void {
    object.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    object.matrixAutoUpdate = false;
    object.matrix.copy(parent.matrixWorld).invert().multiply(object.matrixWorld);
    parent.add(object);
  }

  // ---- Poses -------------------------------------------------------------------------------------------------------

  /** Gun `a` held up in front of her chest: barrel forward and tipped up, rolled so its grip faces her other hand. */
  private chestGun(a: Hand, out: THREE.Matrix4): THREE.Matrix4 {
    const root = this.heroine.root;
    root.updateWorldMatrix(true, false);
    const side = a === 'left' ? 1 : -1; // (her left is her root's +x)
    q.setFromRotationMatrix(root.matrixWorld);
    // forward, tipped up; its top rolled in toward her middle (its grip then points down and toward her other hand)
    basisZ.set(0, Math.sin(TABLE_USE.chestPitchUp), Math.cos(TABLE_USE.chestPitchUp)).applyQuaternion(q);
    basisY.set(-side * Math.sin(TABLE_USE.chestRollIn), Math.cos(TABLE_USE.chestRollIn), 0).applyQuaternion(q);
    basisY.addScaledVector(basisZ, -basisY.dot(basisZ)).normalize();
    basisX.crossVectors(basisY, basisZ).normalize();
    out.makeBasis(basisX, basisY, basisZ);
    // (past her middle toward her other hand, so that hand works on its own side and does not reach across her:
    //  Joshua, 2026-11-18. The sign was the wrong way round before: the gun sat on its own side.)
    // (and out past her belly, whatever its size: at 36 cm a big belly was right under the clip, and her other hand
    //  reached for it through her belly, Joshua, 2026-11-18)
    const ahead = Math.max(TABLE_USE.chestForward, this.heroine.hands!.bellyAhead() + TABLE_USE.chestPastBelly);
    toward.set(-side * TABLE_USE.chestIn, TABLE_USE.chestUp, ahead).applyMatrix4(root.matrixWorld);
    return out.setPosition(toward);
  }

  /** Where the clip of a gun at `gunAt` is, pulled `pull` metres out of the grip along its own length. */
  private clipPose(gunAt: THREE.Matrix4, pull: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.heroine.hands!.clipSeat(out);
    return out.premultiply(gunAt).multiply(scratch2.makeTranslation(0, -pull, 0));
  }

  /** Each frame: every hand that has a clip to close on gets its shape where the clip is now (it may be moving). */
  private touchClips(h: HeroineHands): void {
    for (const hand of ['left', 'right'] as const) {
      const clip = this.clipTouched[hand];
      if (!clip) continue;
      clip.updateWorldMatrix(true, false);
      clip.matrixWorld.decompose(clipPlace, clipTurn, clipSize);
      const axis = (x: number, y: number, z: number): [number, number, number] => { const v = new THREE.Vector3(x, y, z).applyQuaternion(clipTurn); return [v.x, v.y, v.z]; };
      h.hold(hand, {
        kind: 'box',
        centre: [clipPlace.x, clipPlace.y, clipPlace.z],
        axes: [axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)],
        half: [CLIP.width / 2 * clipSize.x, CLIP.height / 2 * clipSize.y, CLIP.depth / 2 * clipSize.z],
      }, this.clipHeld[hand] === clip);
    }
  }

  /** A hand lets go of the clip it was closing on (it is in the tray, or in a gun). */
  private letGoOfClip(hand: Hand): void {
    if (!this.clipTouched[hand]) return;
    this.clipTouched[hand] = null;
    this.heroine.hands!.hold(hand, null);
  }

  /**
   * HER WRIST WITHIN ITS LIMIT through the whole reload (Joshua, 2026-11-18: "less than +/-50 degrees"), turned about
   * the middle of her palm so it still lands where it reaches.
   */
  private wristLimit(hand: Hand, holdsGun: boolean): { most: number; pivot: THREE.Vector3; along: THREE.Vector3; tipsUpMost: number } {
    const h = this.heroine.hands!;
    // (the fingertip rule is for a hand handling clips: a hand holding a gun upright points a little up, as it must,
    //  and tipping it down laid the gun on its side)
    return { most: TABLE_USE.wristMost, pivot: h.palmPoint(hand, new THREE.Vector3()), along: h.fingersAlong(hand, new THREE.Vector3()), tipsUpMost: holdsGun ? 1 : TABLE_USE.tipsUpMost };
  }

  /** The pose for a hand putting a gun on its stand or taking it off (remembered: see `standPoses`). */
  private standPose(h: HeroineHands, hand: Hand, gunWorld: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4 {
    const pose = h.handPoseForGun(hand, gunWorld, out);
    this.standPoses.add(pose);
    return pose;
  }

  /** The pose for a hand holding a gun at `gunWorld` (remembered as a gun pose: see `wristLimit`). */
  private gunPose(h: HeroineHands, hand: Hand, gunWorld: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4 {
    const pose = h.handPoseForGun(hand, gunWorld, out);
    this.gunPoses.add(pose);
    return pose;
  }

  /** Where a hand waits between steps: as if about to take its gun, a little above its stand. */
  private waitOver(hand: Hand): THREE.Matrix4 {
    this.table.slot(hand, slotAt);
    slotAt.elements[13] += TABLE_USE.waitAbove;
    return this.heroine.hands!.handPoseForGun(hand, slotAt, new THREE.Matrix4());
  }

  /**
   * HER EMPTY HAND TAKING A CLIP that stands at `clipAt` (Joshua, 2026-11-18: no twisted wrists, no reaching across),
   * placed as she takes the pole (fingerTouch.ts `gripPose`):
   *   below  out of a gun: by its base, just below the grip
   *   side   out of the rack: a little below its middle
   * (Before, her hand copied a gun's grip under the clip: a right hand doing that under the left gun was twisted.)
   */
  private handToClip(b: Hand, clipAt: THREE.Matrix4, how: 'below' | 'side'): THREE.Matrix4 {
    const h = this.heroine.hands!, root = this.heroine.root;
    root.updateWorldMatrix(true, false);
    clipAt.decompose(clipPlace, clipTurn, clipSize);
    clipUp.set(0, 1, 0).applyQuaternion(clipTurn);     // along the clip, from its base up into the grip
    clipAcross.set(1, 0, 0).applyQuaternion(clipTurn); // across its narrow width
    wrapWay.set(0, 0, 1).transformDirection(root.matrixWorld); // (her front: the fingers go round the far side)
    // A HANDSHAKE ON THE CLIP, as she takes the pole (Joshua, 2026-11-18: palm-up under the clip, a hand coming across her
    // body was rolled right round at the forearm and looked turned backwards): thumb up, the palm facing the clip from
    // her hand's own side (from her shoulder toward the clip), the fingers round its front. Out of a gun she takes it
    // by its base, just below the grip (clear of the hand holding the gun); out of the rack, a little below its middle.
    // (exactly the pole's handshake: the palm faces SIDEWAYS, toward her middle, so the fingers can wrap round the
    //  front and the thumb is up. Facing the line from her shoulder to the clip, mostly forward, it came out thumb-down,
    //  141 degrees from her relaxed hand: Joshua, 2026-11-18)
    palmWay.set(b === 'left' ? -1 : 1, 0, 0).transformDirection(root.matrixWorld); // (her left is her root's +x)
    palmWay.addScaledVector(clipUp, -palmWay.dot(clipUp)).normalize();
    clipPlace.addScaledVector(clipUp, how === 'below' ? -TABLE_USE.clipHoldBase : -TABLE_USE.clipHoldLow);
    return h.gripPose(b, clipPlace, clipUp, palmWay, wrapWay, CLIP.width / 2, new THREE.Matrix4());
  }

  /** HER HAND CARRYING THE CLIP IT HOLDS so that the clip ends at `clipAt`: held just as she took it (nothing slides). */
  private handCarrying(b: Hand, clipAt: THREE.Matrix4): THREE.Matrix4 {
    const clip = this.clipHeld[b];
    if (!clip) return this.handToClip(b, clipAt, 'side');
    return new THREE.Matrix4().copy(clipAt).multiply(scratch3.copy(clip.matrix).invert());
  }

}
