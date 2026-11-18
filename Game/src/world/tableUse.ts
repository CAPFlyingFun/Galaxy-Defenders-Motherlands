// ============================================================================
// tableUse.ts -- putting her guns down on the weapon table and taking them up
// again (Joshua, 2026-11-17).
//
// One action, step by step:
//   1. WALK: she walks to the spot in front of the table (if she is not there);
//   2. FACE: she turns to the table;
//   3. REACH: each hand goes to its gun stand, and she gets down to it as low
//      as she needs (heroine: handReach.ts, lowerBody.ts);
//   4. HAND OVER: the moment a hand arrives, its gun passes from her hand to
//      the stand (or from the stand to her hand): the hand was brought exactly
//      to the pose that holds the gun as it lies, so nothing jumps;
//   5. BACK: her hands go back to her own pose and she stands up.
// While an action runs the player's stick is not hers: the game asks
// `moving` / `walkStick` (below) instead.
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineBody } from '../core/contracts';
import { TABLE, type WeaponTable } from './weaponTable';

/** GAME TUNING. */
export const TABLE_USE = Object.freeze({
  /** Her walking pace to the table, metres a second (a walk). */
  walkSpeed: 1.1,
  /** Close enough to her spot, metres. */
  arrived: 0.04,
  /** Turned to the table within this, radians (about 8 degrees). */
  faced: 0.14,
  /** The longest she waits to be turned before she reaches anyway, seconds. */
  faceWaitMost: 1.5,
  /** A short pause holding the pose when a gun changes hands, seconds (so it can be seen). */
  holdSeconds: 0.15,
  /** After her hands arrive, a moment more for her to finish leaning in (lowerBody.ts), seconds. */
  settleSeconds: 0.35,
});

type Step = 'idle' | 'walk' | 'face' | 'reach' | 'hold' | 'back';

const spot = new THREE.Vector3(), pose = new THREE.Matrix4(), slotAt = new THREE.Matrix4();
const facePoint = new THREE.Vector3(), faceOut = new THREE.Vector3();

export class TableUse {
  step: Step = 'idle';
  /** The hands this action moves, and whether it puts their guns DOWN (true) or takes them UP. */
  private hands: Hand[] = [];
  private puttingDown = true;
  private timer = 0;

  constructor(private readonly table: WeaponTable, private readonly heroine: HeroineBody) {}

  /** Whether an action is running (the player's stick does not move her meanwhile). */
  get busy(): boolean { return this.step !== 'idle'; }

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

  /**
   * Begin: `which` = 'both' (the main button) or one hand. Both: whichever guns she holds go down, or if she holds
   * none, both come up. One hand: that hand's gun goes down if she holds it, up if it lies on the table.
   */
  start(which: 'both' | Hand): void {
    const h = this.heroine.hands;
    if (!h || this.busy) return;
    if (which === 'both') {
      const held = (['left', 'right'] as const).filter((hand) => h.hasGun(hand));
      this.puttingDown = held.length > 0;
      this.hands = this.puttingDown ? held : ['left', 'right'];
    } else {
      this.puttingDown = h.hasGun(which);
      this.hands = [which];
    }
    this.step = 'walk';
    this.timer = 0;
    // her body keeps off the table's edge while she is at it (whatever her belly's size)
    h.keepOff(this.table.nearFace(facePoint, faceOut));
  }

  /**
   * One frame of the action. `at` is where she stands now; this writes where she should walk (`walkTo`, or null when
   * she should stand) and which way she should look (`look`, radians, or null for the game's own choice).
   */
  update(dt: number, atX: number, atZ: number, out: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number }): void {
    out.walkTo = null;
    out.look = null;
    if (this.step === 'idle') return;
    const h = this.heroine.hands!;
    this.timer += dt;
    const face = this.table.faceYaw;
    switch (this.step) {
      case 'walk': {
        this.table.standSpot(spot, h.bellyAhead());
        if (Math.hypot(spot.x - atX, spot.z - atZ) > TABLE_USE.arrived) { out.walkTo = spot; out.look = face; break; }
        this.step = 'face'; this.timer = 0;
        // falls through to facing
      }
      // eslint-disable-next-line no-fallthrough
      case 'face': {
        out.look = face;
        const off = Math.abs(Math.atan2(Math.sin(out.yaw - face), Math.cos(out.yaw - face)));
        if (off > TABLE_USE.faced && this.timer < TABLE_USE.faceWaitMost) break;
        // each hand sent to its stand: to the pose that holds its gun as it lies there
        for (const hand of this.hands) h.reach(hand, h.handPoseForGun(hand, this.table.slot(hand, slotAt), pose));
        this.step = 'reach'; this.timer = 0;
        break;
      }
      case 'reach': {
        out.look = face;
        if (!this.hands.every((hand) => h.reached(hand) >= 0.999)) { this.timer = 0; break; }
        if (this.timer < TABLE_USE.settleSeconds) break;
        // ARRIVED: each gun changes hands. Put down, it is set exactly on its stand (her hand is there to within a
        // centimetre or so: whatever is left is not worth a gun standing crooked on its stand).
        for (const hand of this.hands) {
          if (this.puttingDown) {
            const gun = h.releaseGun(hand, this.table.root);
            gun.matrix.copy(this.table.root.matrixWorld).invert().multiply(this.table.slot(hand, slotAt));
          } else h.takeGun(hand);
        }
        this.step = 'hold'; this.timer = 0;
        break;
      }
      case 'hold': {
        out.look = face;
        if (this.timer < TABLE_USE.holdSeconds) break;
        for (const hand of this.hands) h.reach(hand, null);
        this.step = 'back'; this.timer = 0;
        break;
      }
      case 'back': {
        out.look = face;
        if (this.hands.some((hand) => h.reached(hand) > 0) || h.lowering().weight > 0) break;
        this.step = 'idle';
        h.keepOff(null);
        break;
      }
    }
  }
}
