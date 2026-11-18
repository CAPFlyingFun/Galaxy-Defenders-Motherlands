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

/** GAME TUNING. */
export const TABLE_USE = Object.freeze({
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
  chestUp: 1.08,
  chestIn: 0.04,
  chestPitchUp: 0.45,
  chestRollIn: 0.5,
  /** How far below the gun's grip a clip is pulled out, metres, and how far her other hand sits below the clip it holds. */
  clipPull: 0.08,
  clipHandBelow: 0.075,
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
const basisX = new THREE.Vector3(), basisY = new THREE.Vector3(), basisZ = new THREE.Vector3(), q = new THREE.Quaternion();

export class TableUse {
  action: Action = 'idle';
  /** Each gun's rounds left. */
  readonly rounds: Record<Hand, number> = { left: TABLE_USE.rounds, right: TABLE_USE.rounds };
  private phase: 'walk' | 'face' | 'steps' = 'walk';
  private steps: Array<() => Step> = [];
  private current: Step | null = null;
  private timer = 0;
  private arrivedAt = -1;
  /** The guns lying on the table, by hand (to move them with their stands when the table's height changes). */
  private readonly lying = new Map<Hand, THREE.Object3D>();
  /** The clip in each gun now (a reload gives a gun a new one), and a clip a hand is holding. */
  private readonly clipIn: Record<Hand, THREE.Object3D | null>;
  private readonly clipHeld: Record<Hand, THREE.Object3D | null> = { left: null, right: null };

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

  /** The main button's word: PUT DOWN while she holds any gun, PICK UP when both lie on the table. */
  label(): string {
    const h = this.heroine.hands;
    return h && (h.hasGun('left') || h.hasGun('right')) ? 'PUT DOWN' : 'PICK UP';
  }

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
        hands = down ? held : ['left', 'right'];
      } else {
        down = h.hasGun(which);
        hands = [which];
      }
      this.action = down ? 'putDown' : 'pickUp';
      this.planGuns(hands, down);
    }
    this.phase = 'walk';
    this.current = null;
    this.timer = 0;
    // her body keeps off the table's edge while she is at it (whatever her belly's size)
    h.keepOff(this.table.nearFace(facePoint, faceOut));
  }

  /** One frame. `at` is where she stands; this writes where she should walk and which way she should look. */
  update(dt: number, atX: number, atZ: number, out: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number }): void {
    out.walkTo = null;
    out.look = null;
    this.table.update(dt);
    if (this.action === 'idle') return;
    const h = this.heroine.hands!;
    this.timer += dt;
    const face = this.table.faceYaw;
    out.look = face;
    if (this.phase === 'walk') {
      this.table.standSpot(spot, h.bellyAhead());
      // (on her way she looks AT the table, not the way she will face once there: Joshua, 2026-11-18)
      out.look = Math.atan2(this.table.root.position.x - atX, this.table.root.position.z - atZ);
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
      for (const [hand, pose] of Object.entries(this.current.jobs) as [Hand, THREE.Matrix4 | null][]) h.reach(hand, pose);
      this.timer = 0;
      this.arrivedAt = -1;
      return;
    }
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
      jobs: Object.fromEntries(hands.map((hand) => [hand, h.handPoseForGun(hand, this.table.slot(hand, slotAt), new THREE.Matrix4())])),
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
        if (h.hasGun(b)) jobs[b] = h.handPoseForGun(b, this.table.slot(b, slotAt), new THREE.Matrix4());
        if (!h.hasGun(a)) jobs[a] = h.handPoseForGun(a, this.table.slot(a, slotAt), new THREE.Matrix4());
        if (!jobs.left && !jobs.right) return { jobs: {} };
        return { jobs, settle: true, done: () => { if (jobs[b]) this.gunDown(b); if (jobs[a]) this.gunUp(a); } };
      });
      // 2. the gun held up in front of her chest, tipped toward her other hand (which waits just over its own stand)
      const gunAt = new THREE.Matrix4();
      this.steps.push(() => {
        this.chestGun(a, gunAt);
        return { jobs: { [a]: h.handPoseForGun(a, gunAt, new THREE.Matrix4()), [b]: this.waitOver(b) } };
      });
      // 3. her other hand under the grip, on the clip; pulled out; dropped in the tray. (The gun is read where it really
      //    is now, in her hand: her arm may have stopped a little short of where it was sent.)
      this.steps.push(() => {
        gunAt.copy(h.gun(a).matrixWorld);
        return { jobs: { [b]: this.handOnClip(b, this.clipPose(gunAt, 0, scratch)) }, done: () => this.takeClip(a, b) };
      });
      this.steps.push(() => ({ jobs: { [b]: this.handOnClip(b, this.clipPose(gunAt, TABLE_USE.clipPull, scratch)) } }));
      this.steps.push(() => ({ jobs: { [b]: this.handOnClip(b, this.table.trayPose(scratch)) }, settle: true, done: () => this.dropClip(b) }));
      // 4. a full clip from the rack
      this.steps.push(() => {
        const slot = Math.max(0, this.table.fullSlot());
        return { jobs: { [b]: this.handOnClip(b, this.table.rackSlot(slot, scratch)) }, settle: true, done: () => this.takeFromRack(slot, b) };
      });
      // 5. up under the grip, then pushed in: the gun is full
      this.steps.push(() => {
        gunAt.copy(h.gun(a).matrixWorld);
        return { jobs: { [b]: this.handOnClip(b, this.clipPose(gunAt, TABLE_USE.clipPull, scratch)) } };
      });
      this.steps.push(() => ({ jobs: { [b]: this.handOnClip(b, this.clipPose(gunAt, 0, scratch)) }, hold: TABLE_USE.holdSeconds, done: () => this.clipIntoGun(b, a) }));
      // 6. the gun set on its stand; her other hand waits just over its own stand, ready for what comes next
      //    (Joshua, 2026-11-18: sent back to her side between steps, it dropped and swung up again, nearly a metre in
      //    half a second: it read as a jump)
      this.steps.push(() => ({
        jobs: { [a]: h.handPoseForGun(a, this.table.slot(a, slotAt), new THREE.Matrix4()), [b]: this.waitOver(b) },
        settle: true,
        done: () => this.gunDown(a),
      }));
    }
    // both guns taken up again, and her hands back to her
    this.steps.push(() => {
      const hands = (['left', 'right'] as const).filter((hand) => !h.hasGun(hand));
      if (hands.length === 0) return { jobs: {} };
      return {
        jobs: Object.fromEntries(hands.map((hand) => [hand, h.handPoseForGun(hand, this.table.slot(hand, slotAt), new THREE.Matrix4())])),
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
    // (set exactly on its stand: her hand is there to within a centimetre or so)
    gun.matrix.copy(this.table.root.matrixWorld).invert().multiply(this.table.slot(hand, slotAt));
    this.lying.set(hand, gun);
  }

  private gunUp(hand: Hand): void {
    this.heroine.hands!.takeGun(hand);
    this.lying.delete(hand);
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
    const clip = this.clipHeld[b];
    if (!clip) return;
    const h = this.heroine.hands!;
    h.gun(a).add(clip);
    h.clipSeat(clip.matrix);
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
    toward.set(side * TABLE_USE.chestIn, TABLE_USE.chestUp, TABLE_USE.chestForward).applyMatrix4(root.matrixWorld);
    return out.setPosition(toward);
  }

  /** Where the clip of a gun at `gunAt` is, pulled `pull` metres out of the grip along its own length. */
  private clipPose(gunAt: THREE.Matrix4, pull: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.heroine.hands!.clipSeat(out);
    return out.premultiply(gunAt).multiply(scratch2.makeTranslation(0, -pull, 0));
  }

  /** Where a hand waits between steps: as if about to take its gun, a little above its stand. */
  private waitOver(hand: Hand): THREE.Matrix4 {
    this.table.slot(hand, slotAt);
    slotAt.elements[13] += TABLE_USE.waitAbove;
    return this.heroine.hands!.handPoseForGun(hand, slotAt, new THREE.Matrix4());
  }

  /**
   * Her hand on a clip at `clipAt`: held as a gun's grip is, lifted by clipHandBelow along its length (her hand sits
   * under it). (Tried 2026-11-18: taking it from the side, as the pole is taken; it bent her wrist further, up to 87
   * degrees against this one's 70, so this stays.)
   */
  private handOnClip(b: Hand, clipAt: THREE.Matrix4): THREE.Matrix4 {
    const h = this.heroine.hands!;
    const clipInHand = h.gunSeat(b, new THREE.Matrix4()).multiply(h.clipSeat(scratch2)).multiply(scratch3.makeTranslation(0, TABLE_USE.clipHandBelow, 0));
    return new THREE.Matrix4().copy(clipAt).multiply(clipInHand.invert());
  }
}
