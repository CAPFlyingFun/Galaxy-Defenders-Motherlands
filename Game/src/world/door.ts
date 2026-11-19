// ============================================================================
// door.ts -- A DOOR SHE OPENS BY ITS HANDLE (Joshua, 2026-11-18):
//
//   "the hand would naturally reach out and grab the door handle to twist and
//    then when you walk back it'll pull it and then you can release it
//    manually, but walking forward or backwards can open or close the door.
//    I will probably put like a slight spring in the elbow to give a little
//    play like in real life."
//   A handle on each side: a LEVER on the side it opens toward (she PULLS it
//   open from there) and a round KNOB on the other (she PUSHES it open).
//   Opened from the push side it swings shut behind her on its own; opened
//   from the pull side it stays where she leaves it.
//
// THE DOOR: a frame, and a panel on a hinge at the frame's -x side. In the
// door's own frame, x runs across the doorway, y up, and the panel opens
// toward +z (the PULL side; -z is the PUSH side), up to DOOR.mostOpen.
// Shut, it is LATCHED: only a twisted handle lets it go. Pushed shut again
// (and let go), it latches.
//
// OPENING IT (DoorUse): her head leads (she looks at the handle), she walks
// to the handle, faces the door, reaches, grips, and twists it (the lever
// goes down, the knob turns). She stands a little side-on (DOOR.sideOn), her
// handle hand's shoulder toward the door, so her belly is beside her reach,
// not in the way of it. Then the stick is hers again: she keeps facing
// the door whichever way she steps (bodyTurn.ts `hold`), at a walk, and the
// door goes with her hand:
//
//   THE ELBOW'S SPRING. Her hand stays on the handle. Within a few
//   centimetres of where it was when her hand closed on it (DOOR.springIn
//   nearer, DOOR.springOut further, never past her own arm's reach with the
//   elbow still bent: DOOR.armShare) her elbow simply bends or straightens and
//   the door stays put (the play). Step back past that and the door is pulled
//   after her hand; step in and it is pushed (only the way a hand can move a
//   door: a pull door is not pushed open). The door eases to where it must be (DOOR.follow), never snaps.
//   Further than the door can go (against its stop, or walking off sideways),
//   the handle PULLS HER: she is drawn round with it, her hand kept on it. She
//   lets go only when the player says (LET GO).
//
// THE DOOR IS SOLID (`keepOut`): its panel, wherever it has swung to, and its
// frame's posts keep her body out, so a shut door stops her and an open one
// lets her through the gap.
//
// One door, built as its own piece (its own frame and handles, placed with
// `place`), so later doors can go into buildings.
// ============================================================================
import * as THREE from 'three';
import type { GripShape } from '@charb/actor/handGrip';
import type { Hand, HeroineBody } from '../core/contracts';

/** GAME TUNING (metres, radians, seconds). */
export const DOOR = Object.freeze({
  /** The doorway: its width (the panel's), its height, the panel's thickness, the frame's posts. */
  width: 0.9,
  tall: 2.05,
  thick: 0.045,
  post: 0.07,
  /** The handles: how far from the hinge (across the panel), how high, how far out from the face. */
  handleAcross: 0.8,
  handleHigh: 1.0,
  handleOut: 0.055,
  /** The lever: its length (it points back toward the hinge), its thickness; the knob's radius. */
  leverLong: 0.12,
  leverRadius: 0.011,
  knobRadius: 0.028,
  /** How far the lever goes down, and the knob turns, when twisted (radians), and how long that takes. */
  leverDown: Math.PI / 4,
  /** How much of the lever's tip her hand turns with (the rest is her wrist bending, as a real hand does: a forearm
   * cannot roll a full 45 degrees with the bar, so with all of it her hand slid off the end). */
  leverHandTurn: 0.35,
  knobTurn: (70 * Math.PI) / 180,
  twistSeconds: 0.35,
  /** As far as it opens (the stop), radians: 100 degrees. */
  mostOpen: (100 * Math.PI) / 180,
  /** Shut within this (radians), let go: it latches. */
  latchWithin: (1.5 * Math.PI) / 180,
  /** Opened from the push side and let go, it swings shut on its own: this fast (a time constant, seconds). */
  swingShut: 0.45,
  /** How wide she is, for the door to keep her out (her middle to her side, metres; her belly, if further). */
  bodyRadius: 0.24,
  /** The same while she holds a handle, turned side-on: her shoulder leads, so the door can come nearer her middle
   * (and her hand can push it before her body would meet it). */
  sideOnRadius: 0.17,
  /** Pushed open, the panel is kept this much further from her body than it must be (metres), found in steps of
   * `pushStep` (radians). */
  pushRoom: 0.08,
  pushStep: 0.04,
  /** How quickly the door goes where her hand takes it (a time constant, seconds: the spring's give). */
  follow: 0.07,
  /** Where she stands to take the handle: this far from the door's face (or her belly plus `bellyGap`), and the
   *  handle this far to her hand's side of her middle. */
  standBack: 0.3,
  bellyGap: 0.06,
  standSide: 0.16,
  /** How close she must be to a handle's spot for the prompt to show. */
  near: 1.6,
  /** Her head leads: she looks at the handle this long before she walks, seconds. */
  lead: 0.7,
  /** Close enough to her spot; turned to the door within this; the longest she waits to turn. */
  arrived: 0.04,
  faced: 0.14,
  faceWaitMost: 1.5,
  /** The most of her arm's length (shoulder to wrist) the handle is kept within: short of straight, so her elbow keeps
   * a little bend to spring with. */
  armShare: 0.9,
  /** How far she turns side-on to the door to take its handle (radians, about 35 degrees). */
  sideOn: 0.6,
  /** Her elbow's spring round where her hand closed on the handle: how much nearer before she pushes the door, how
   * much further before she pulls it (metres). */
  springIn: 0.03,
  springOut: 0.06,
  /** Her shoulder, only if her arm bones cannot be found: this far out from her middle and this high. */
  shoulderOut: 0.18,
  shoulderUp: 1.35,
  /** How hard the stick may push her while she holds the door (a walk). */
  walkPush: 0.4,
});

export type DoorSide = 'pull' | 'push';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion();
const axisW = new THREE.Vector3(), palmW = new THREE.Vector3(), wrapW = new THREE.Vector3(), atW = new THREE.Vector3();

/** The door: its frame, its panel on the hinge, its two handles. */
export class Door {
  readonly root = new THREE.Group();
  /** The panel's hinge: turned by `angle` about its upright. */
  private readonly hinge = new THREE.Group();
  private readonly lever = new THREE.Group();
  private readonly knob = new THREE.Group();
  /** How far open, radians (0 = shut), and whether it is latched. */
  angle = 0;
  latched = true;
  /** How far the lever is down, the knob turned (0..1 of a full twist). */
  leverTwist = 0;
  knobTwist = 0;

  constructor() {
    this.root.name = 'door';
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b3142, metalness: 0.4, roughness: 0.55 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x46506a, metalness: 0.25, roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc3cad6, metalness: 0.85, roughness: 0.25 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x5ee8c8 });
    const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.castShadow = true; return b; };
    // the frame: two posts and a header round the doorway (its middle at x = 0)
    const half = DOOR.width / 2;
    for (const side of [-1, 1]) {
      const post = box(DOOR.post, DOOR.tall + DOOR.post, DOOR.thick + 0.06, frameMat);
      post.position.set(side * (half + DOOR.post / 2), (DOOR.tall + DOOR.post) / 2, 0);
      this.root.add(post);
    }
    const header = box(DOOR.width + DOOR.post * 2, DOOR.post, DOOR.thick + 0.06, frameMat);
    header.position.set(0, DOOR.tall + DOOR.post / 2, 0);
    // a glowing strip on the floor across the doorway
    const sill = box(DOOR.width, 0.01, 0.06, glow);
    sill.position.set(0, 0.005, 0);
    this.root.add(header, sill);
    // the panel, on the hinge at the doorway's -x edge
    this.hinge.position.set(-half, 0, 0);
    const panel = box(DOOR.width - 0.01, DOOR.tall - 0.01, DOOR.thick, panelMat);
    panel.position.set(DOOR.width / 2, DOOR.tall / 2, 0);
    // (a window strip, so it reads as a door from far off)
    const strip = box(DOOR.width * 0.6, 0.05, DOOR.thick + 0.004, glow);
    strip.position.set(DOOR.width / 2, 1.55, 0);
    this.hinge.add(panel, strip);
    // THE LEVER, on the pull side (+z): a rose on the face, a neck out, a bar back toward the hinge; it turns down
    // about the door's own through-axis at the end of its neck
    for (const sideZ of [1, -1]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), metal);
      rose.rotation.x = Math.PI / 2;
      rose.position.set(DOOR.handleAcross, DOOR.handleHigh, sideZ * (DOOR.thick / 2 + 0.005));
      this.hinge.add(rose);
    }
    this.lever.position.set(DOOR.handleAcross, DOOR.handleHigh, DOOR.thick / 2 + DOOR.handleOut);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(DOOR.leverRadius, DOOR.leverRadius, DOOR.handleOut, 14), metal);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = -DOOR.handleOut / 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(DOOR.leverRadius, DOOR.leverRadius, DOOR.leverLong, 14), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.x = -DOOR.leverLong / 2;
    this.lever.add(neck, bar);
    this.hinge.add(this.lever);
    // THE KNOB, on the push side (-z): a neck and a ball; it turns about the door's through-axis
    this.knob.position.set(DOOR.handleAcross, DOOR.handleHigh, -(DOOR.thick / 2 + DOOR.handleOut));
    const kneck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, DOOR.handleOut, 14), metal);
    kneck.rotation.x = Math.PI / 2;
    kneck.position.z = DOOR.handleOut / 2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(DOOR.knobRadius, 20, 14), metal);
    ball.scale.set(1, 1, 0.75);
    this.knob.add(kneck, ball);
    this.hinge.add(this.knob);
    this.root.add(this.hinge);
  }

  /** Put the door on the ground at (x, z), its pull side (+z) facing `yaw` (0 = +Z). */
  place(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, yaw, 0);
    this.pose();
  }

  /** Show the door as it is now (its angle, its handles). */
  pose(): void {
    // (opening toward +z: the panel's free edge, at +x from the hinge, swings round toward +z)
    this.hinge.rotation.y = -this.angle;
    this.lever.rotation.z = this.leverTwist * DOOR.leverDown;   // (+ turns its bar, pointing -x, downward)
    this.knob.rotation.z = -this.knobTwist * DOOR.knobTurn;
    this.root.updateMatrixWorld(true);
  }

  /** Which side of the door a point is on, and how far from its face (world point). */
  sideOf(x: number, z: number): { side: DoorSide; across: number; out: number } {
    v1.set(x, 0, z);
    this.root.worldToLocal(v1);
    return { side: v1.z >= 0 ? 'pull' : 'push', across: v1.x, out: Math.abs(v1.z) };
  }

  /**
   * KEEP HER OUT OF THE DOOR: her middle at (x, z), with her body's radius, moved out of the panel (where it has
   * swung to) and the posts. Writes the corrected place into `out` (x, z); returns whether she was moved.
   */
  keepOut(x: number, z: number, radius: number, out: { x: number; z: number }): boolean {
    this.root.updateMatrixWorld(true);
    v1.set(x, 0, z);
    this.root.worldToLocal(v1);
    let moved = false;
    // (a segment, as thick as `half`: her middle pushed out to `radius + half` from it)
    const awayFrom = (ax: number, az: number, bx: number, bz: number, half: number) => {
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? THREE.MathUtils.clamp(((v1.x - ax) * dx + (v1.z - az) * dz) / len2, 0, 1) : 0;
      const px = ax + dx * t, pz = az + dz * t;
      let ox = v1.x - px, oz = v1.z - pz;
      const d = Math.hypot(ox, oz), need = radius + half;
      if (d >= need) return;
      if (d < 1e-6) { ox = -dz; oz = dx; } // (exactly on it: out to one side)
      const n = Math.hypot(ox, oz) || 1;
      v1.x = px + (ox / n) * need;
      v1.z = pz + (oz / n) * need;
      moved = true;
    };
    // the panel: from the hinge to its free edge, swung round toward +z by its angle
    const hx = -DOOR.width / 2, ex = hx + Math.cos(this.angle) * DOOR.width, ez = Math.sin(this.angle) * DOOR.width;
    awayFrom(hx, 0, ex, ez, DOOR.thick / 2);
    // the posts
    for (const side of [-1, 1]) {
      const px = side * (DOOR.width / 2 + DOOR.post / 2);
      awayFrom(px, 0, px, 0, DOOR.post / 2 + 0.03);
    }
    if (!moved) return false;
    this.root.localToWorld(v1);
    out.x = v1.x;
    out.z = v1.z;
    return true;
  }

  /** The way she faces the door from a side (toward the door), a compass angle. */
  faceYaw(side: DoorSide, hand?: Hand): number {
    const square = this.root.rotation.y + (side === 'pull' ? Math.PI : 0);
    // (turned a little SIDE-ON, her handle hand's shoulder toward the door, as anyone reaching down to a handle stands:
    //  her belly then sits beside her reach, not in front of it; turning up the yaw brings her right shoulder forward)
    return hand ? square + (hand === 'right' ? 1 : -1) * DOOR.sideOn : square;
  }

  /** The hand that takes the handle from this side (the one opposite the handle's side of her). */
  handFor(side: DoorSide): Hand {
    // (Joshua, 2026-11-18: the hand OPPOSITE the handle's side, as he opens a door: a handle on her right is taken
    //  with her left hand, a handle on her left with her right. From the pull side she faces -z, so +x, where the
    //  handle is, is her right: her left hand. From the push side the handle is on her left: her right hand. She then
    //  stands to the handle's outer side, side-on with that hand's shoulder toward the door)
    return side === 'pull' ? 'left' : 'right';
  }

  /** Where she stands to take the handle from a side, with that hand (world, the door shut). */
  standSpot(side: DoorSide, hand: Hand, bellyAhead: number, out: THREE.Vector3): THREE.Vector3 {
    // (turned side-on, her belly reaches toward the door by less: its front is turned away)
    const back = Math.max(DOOR.standBack, bellyAhead * Math.cos(DOOR.sideOn) + DOOR.bellyGap);
    const z = side === 'pull' ? DOOR.thick / 2 + back : -(DOOR.thick / 2 + back);
    // (her middle a little toward her other hand's side of the handle; facing -z her right is +x, facing +z her left)
    const rightIsPlusX = side === 'pull';
    const towardHand = (hand === 'right') === rightIsPlusX ? 1 : -1;
    // (across the doorway: where her hand will hold, which on the lever is out along its bar, not at its rosette)
    const across = this.root.worldToLocal(this.handlePoint(side, out)).x;
    out.set(across - towardHand * DOOR.standSide * Math.cos(DOOR.sideOn), 0, z);
    return out.applyMatrix4(this.root.matrixWorld);
  }

  /** The handle's grip point on a side, in the world, as the door and handle are now. */
  handlePoint(side: DoorSide, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    if (side === 'pull') {
      // the middle of the lever's bar
      out.set(-DOOR.leverLong * 0.55, 0, 0);
      return this.lever.localToWorld(out);
    }
    return this.knob.localToWorld(out.set(0, 0, 0));
  }

  /** THE GRIP for a hand on a side's handle (a pose for her hand bone, world), and its shape (for her fingers). */
  grip(side: DoorSide, hand: Hand, heroine: HeroineBody, out: THREE.Matrix4): { pose: THREE.Matrix4; shape: GripShape } {
    this.root.updateMatrixWorld(true);
    const h = heroine.hands!;
    if (side === 'pull') {
      // THE LEVER, overhand: her palm down onto the bar (a little toward the door), her fingers over it and round its
      // door side; the bar's own line is its axis (it tips down as it is twisted)
      const m = this.lever.matrixWorld;
      // (her hand's frame is the bar's frame turned back by the part of the twist her wrist takes up)
      q1.setFromAxisAngle(v2.set(0, 0, 1), -this.leverTwist * DOOR.leverDown * (1 - DOOR.leverHandTurn));
      axisW.set(-1, 0, 0).applyQuaternion(q1).transformDirection(m);      // along the bar
      palmW.set(0, -1, 0).applyQuaternion(q1).transformDirection(m).addScaledVector(v2.set(0, 0, -1).transformDirection(m), 0.35).normalize();
      wrapW.set(0, 0, -1).transformDirection(m);                         // toward the door
      this.handlePoint('pull', atW);
      const a = v1.copy(atW).addScaledVector(axisW, DOOR.leverLong * 0.4).toArray() as [number, number, number];
      const b = v3.copy(atW).addScaledVector(axisW, -DOOR.leverLong * 0.4).toArray() as [number, number, number];
      h.gripPose(hand, atW, axisW, palmW, wrapW, DOOR.leverRadius, out);
      return { pose: out, shape: { kind: 'cylinder', a, b, radius: DOOR.leverRadius } };
    }
    // THE KNOB, cupped: her palm on its near side (facing the door), her fingers round it; as it turns, her hand turns
    // with it (the knob's own frame turns about the door's through-axis)
    const m = this.knob.matrixWorld;
    axisW.set(0, 1, 0).transformDirection(m);                            // (up the knob, turned with it)
    palmW.set(0, 0, 1).transformDirection(m);                            // toward the door
    wrapW.set(1, 0, 0).transformDirection(m);
    this.handlePoint('push', atW);
    const a = v1.copy(atW).addScaledVector(axisW, DOOR.knobRadius * 0.8).toArray() as [number, number, number];
    const b = v3.copy(atW).addScaledVector(axisW, -DOOR.knobRadius * 0.8).toArray() as [number, number, number];
    h.gripPose(hand, atW, axisW, palmW, wrapW, DOOR.knobRadius * 0.85, out);
    return { pose: out, shape: { kind: 'cylinder', a, b, radius: DOOR.knobRadius * 0.85 } };
  }
}

/**
 * How far her body reaches from her middle, for the door to keep her out (`keepOut`): her side or her belly's front,
 * whichever is further. Holding a handle she stands side-on, so her belly's front is turned partly away from the door.
 */
export function bodyRadius(bellyAhead: number, sideOn: boolean): number {
  return sideOn
    ? Math.max(DOOR.sideOnRadius, bellyAhead * Math.cos(DOOR.sideOn) - 0.04)
    : Math.max(DOOR.bodyRadius, bellyAhead - 0.02);
}

/** Opening, holding and letting go of the door. */
export class DoorUse {
  /** The side she took the door from, and the hand on it (while she is at it). */
  side: DoorSide = 'pull';
  hand: Hand = 'right';
  /** Which side the door was last opened from (opened from the push side and let go, it swings shut). */
  private openedFrom: DoorSide | null = null;
  private phase: 'idle' | 'lead' | 'walk' | 'face' | 'reach' | 'twist' | 'hold' | 'release' = 'idle';
  private timer = 0;
  private readonly spot = new THREE.Vector3();
  private readonly lookPoint = new THREE.Vector3();
  private readonly pose = new THREE.Matrix4();
  /** (where the door would put her: only asked whether it would) */
  private readonly blocked = { x: 0, z: 0 };
  /** How far the handle was from her shoulder when her hand closed on it (-1: not yet): her elbow's spring is set
   * round this, so the door answers as soon as she moves, wherever she stood. */
  private graspReach = -1;
  /** (how much further the handle was than her wrist when she took hold: her hand's length on the handle) */
  private handBeyondWrist = 0;
  /** For the tests: the handle's distance from her shoulder now, and her elbow's spring (metres). */
  readonly springInfo = { now: 0, least: 0, most: 0 };

  constructor(private readonly door: Door, private readonly heroine: HeroineBody) {}

  /** Busy getting to the door (walking, reaching, twisting) or letting go: the stick waits meanwhile. */
  get busy(): boolean { return this.phase !== 'idle' && this.phase !== 'hold'; }
  /** Holding the handle, the door unlatched: the stick moves her (at a walk), the door goes with her hand. */
  get holding(): boolean { return this.phase === 'hold'; }
  /** At the door in any way (the prompt then says LET GO, or nothing). */
  get active(): boolean { return this.phase !== 'idle'; }

  /** The side of the door she is near, if she is near a handle's spot (else null). */
  nearSide(x: number, z: number): DoorSide | null {
    const h = this.heroine.hands;
    if (!h) return null;
    const { side } = this.door.sideOf(x, z);
    this.door.standSpot(side, this.door.handFor(side), h.bellyAhead(), this.spot);
    return Math.hypot(this.spot.x - x, this.spot.z - z) < DOOR.near ? side : null;
  }

  /** The prompt: LET GO while she holds it; OPEN DOOR near a handle; null otherwise. */
  label(x: number, z: number): string | null {
    if (this.holding) return 'LET GO';
    if (this.phase !== 'idle') return null;
    return this.nearSide(x, z) ? 'OPEN DOOR' : null;
  }

  /** The hand she would use from where she stands (the handle's side), or the one picked. */
  handTo(x: number, z: number, which: 'both' | Hand): Hand {
    return which === 'both' ? this.door.handFor(this.door.sideOf(x, z).side) : which;
  }

  /** Begin: to the handle on her side, with `hand` (its gun must be away: the game holsters it first). */
  start(x: number, z: number, hand: Hand): void {
    if (this.phase !== 'idle' || !this.heroine.hands) return;
    this.side = this.door.sideOf(x, z).side;
    this.hand = hand;
    this.phase = 'lead';
    this.graspReach = -1;
    this.timer = 0;
  }

  /** Let go: her fingers open, her hand comes back; the handle springs back. */
  letGo(): void {
    const h = this.heroine.hands;
    if (!h || this.phase === 'idle') return;
    if (this.phase === 'lead' || this.phase === 'walk' || this.phase === 'face') { this.phase = 'idle'; return; }
    h.hold(this.hand, null);
    h.reach(this.hand, null);
    this.phase = 'release';
  }

  /** The way she keeps facing while she holds it (toward the door), or null. */
  faceYaw(): number | null { return this.holding ? this.door.faceYaw(this.side, this.hand) : null; }

  /**
   * One frame. `at` is where she stands; writes where she should walk and look (as the table's and the bars' do).
   * While she holds it, the door follows her hand (the elbow's spring): call after she has moved.
   */
  update(dt: number, atX: number, atZ: number, out: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number; lookAt: THREE.Vector3 | null; pull?: THREE.Vector3 | null }): void {
    if (out.pull) out.pull.set(0, 0, 0);
    out.walkTo = null;
    out.look = null;
    out.lookAt = null;
    const door = this.door, h = this.heroine.hands;
    this.timer += dt;
    // (her handles spring back when let go; a door opened from the push side and let go swings shut)
    const twisting = this.phase === 'twist' || this.phase === 'hold';
    const twistTo = twisting ? 1 : 0;
    const step = dt / DOOR.twistSeconds;
    const toward = (now: number, want: number) => (now < want ? Math.min(want, now + step) : Math.max(want, now - step));
    if (this.side === 'pull' || !twisting) door.leverTwist = toward(door.leverTwist, twisting && this.side === 'pull' ? twistTo : 0);
    if (this.side === 'push' || !twisting) door.knobTwist = toward(door.knobTwist, twisting && this.side === 'push' ? twistTo : 0);
    if (!this.holding && !door.latched) {
      if (this.openedFrom === 'push') {
        // (swinging shut, it stops against her if she is in its way, and goes on once she is clear)
        const was = door.angle;
        door.angle *= Math.exp(-dt / DOOR.swingShut);
        door.pose();
        const radius = bodyRadius(this.heroine.hands?.bellyAhead() ?? 0, false);
        if (door.angle > DOOR.latchWithin && door.keepOut(atX, atZ, radius, this.blocked)) door.angle = was;
      }
      if (door.angle < DOOR.latchWithin && this.phase !== 'twist') { door.angle = 0; door.latched = true; this.openedFrom = null; }
    }
    door.pose();
    if (this.phase === 'idle' || !h) return;

    door.handlePoint(this.side, this.lookPoint);
    const face = door.faceYaw(this.side, this.hand);
    out.look = face;
    if (this.phase === 'lead' || this.phase === 'walk' || this.phase === 'face') out.lookAt = this.lookPoint;
    if (this.phase === 'lead') {
      out.look = Math.atan2(this.lookPoint.x - atX, this.lookPoint.z - atZ);
      if (this.timer < DOOR.lead) return;
      this.phase = 'walk';
    }
    if (this.phase === 'walk') {
      door.standSpot(this.side, this.hand, h.bellyAhead(), this.spot);
      out.look = Math.atan2(this.lookPoint.x - atX, this.lookPoint.z - atZ);
      if (Math.hypot(this.spot.x - atX, this.spot.z - atZ) > DOOR.arrived) { out.walkTo = this.spot; return; }
      out.look = face;
      this.phase = 'face';
      this.timer = 0;
    }
    if (this.phase === 'face') {
      const off = Math.abs(Math.atan2(Math.sin(out.yaw - face), Math.cos(out.yaw - face)));
      if (off > DOOR.faced && this.timer < DOOR.faceWaitMost) return;
      const grip = door.grip(this.side, this.hand, this.heroine, this.pose);
      h.reach(this.hand, grip.pose.clone(), undefined, true);
      h.hold(this.hand, grip.shape, true);
      this.phase = 'reach';
      return;
    }
    // from here her hand is on (or going to) the handle: it follows the handle wherever it goes
    const grip = door.grip(this.side, this.hand, this.heroine, this.pose);
    if (this.phase !== 'release') {
      h.moveReach(this.hand, grip.pose);
      h.hold(this.hand, grip.shape, true);
    }
    if (this.phase === 'reach') {
      if (h.reached(this.hand) >= 0.999) { this.phase = 'twist'; this.timer = 0; }
      return;
    }
    if (this.phase === 'twist') {
      // (the handle goes down or round with her hand on it; done, the latch is free)
      if (this.timer < DOOR.twistSeconds) return;
      door.latched = false;
      this.openedFrom = this.side;
      this.phase = 'hold';
      return;
    }
    if (this.phase === 'hold') {
      out.look = face;
      this.follow(dt, out.pull ?? null);
      return;
    }
    if (this.phase === 'release') {
      if (h.reached(this.hand) <= 0) this.phase = 'idle';
    }
  }

  /**
   * THE ELBOW'S SPRING: the door goes only as far as it must for the handle to stay within her arm's play of her
   * shoulder; it eases there. Too far to keep hold of (against the stop, or walked off sideways): she lets go.
   */
  private follow(dt: number, pull: THREE.Vector3 | null): void {
    const door = this.door, root = this.heroine.root;
    root.updateMatrixWorld(true);
    // HER REAL SHOULDER AND ARM: the hand bone's forearm and upper arm (her own bones, so a bigger or smaller heroine
    // reaches as far as her own arm does); without them, a shoulder guessed from her root
    const wrist = this.heroine.hands?.handBone(this.hand), elbow = wrist?.parent, upper = elbow?.parent;
    let armMost = Infinity, wristReach = 0;
    const shoulder = v2;
    if (wrist && elbow && upper) {
      upper.updateWorldMatrix(true, true);
      shoulder.setFromMatrixPosition(upper.matrixWorld);
      v3.setFromMatrixPosition(elbow.matrixWorld);
      const upperLength = shoulder.distanceTo(v3);
      v1.setFromMatrixPosition(wrist.matrixWorld);
      armMost = (upperLength + v3.distanceTo(v1)) * DOOR.armShare;
      wristReach = shoulder.distanceTo(v1);
    } else shoulder.set(this.hand === 'left' ? DOOR.shoulderOut : -DOOR.shoulderOut, DOOR.shoulderUp, 0).applyMatrix4(root.matrixWorld);
    const was = door.angle;
    const reachAt = (angle: number): number => {
      door.angle = angle; door.pose();
      return door.handlePoint(this.side, v1).distanceTo(shoulder);
    };
    // HER ELBOW'S SPRING: the handle is held round where it was when her hand closed on it, a little nearer (she
    // pushes) or a little further (she pulls) and the door gives; never further than her arm reaches with its elbow
    // still a little bent (her wrist's reach, plus her hand from wrist to handle as it was when she took hold)
    if (this.graspReach < 0) {
      this.graspReach = reachAt(was);
      this.handBeyondWrist = wristReach > 0 ? this.graspReach - wristReach : 0;
    }
    const reachMost = Math.max(this.graspReach, Math.min(armMost + this.handBeyondWrist, this.graspReach + DOOR.springOut));
    const reachLeast = Math.max(0.2, this.graspReach - DOOR.springIn);
    const now = reachAt(was);
    this.springInfo.now = now; this.springInfo.least = reachLeast; this.springInfo.most = reachMost;
    let want = was;
    if (now > reachMost || now < reachLeast) {
      // HER HAND PUSHES OR PULLS THE HANDLE straight from (or toward) her shoulder, and the door turns the way that
      // moves its handle: a few steps of "how much does the reach change for a little turn" (so it never jumps the
      // wrong way round). Pushed toward the hinge the door cannot turn: then she is moved instead (below).
      const goal = now > reachMost ? reachMost : reachLeast;
      const tiny = 0.01;
      for (let k = 0; k < 4; k++) {
        const miss = reachAt(want) - goal;
        if (Math.abs(miss) < 0.002) break;
        const slope = (reachAt(want + tiny) - reachAt(want - tiny)) / (2 * tiny);
        if (Math.abs(slope) < 0.02) break;
        want = THREE.MathUtils.clamp(want - THREE.MathUtils.clamp(miss / slope, -0.3, 0.3), 0, DOOR.mostOpen);
      }
      // (a door only goes the way a hand can move it: from the pull side, pushing closes it and pulling opens it; from
      //  the push side the other way round. Otherwise a push on a shut pull door found it could "open" by swinging
      //  its handle away sideways)
      const opens = (this.side === 'pull') === (now > reachMost);
      want = opens ? Math.max(want, was) : Math.min(want, was);
    }
    // PUSHED OPEN, the door also stays a little AHEAD OF HER BODY (she leans into it as she goes): kept only by her
    // hand it opened just as far as her shoulder came, her body met the panel first, and she stuck in the doorway
    if (this.side === 'push') {
      const room = bodyRadius(this.heroine.hands?.bellyAhead() ?? 0, true) + DOOR.pushRoom;
      for (let k = 0; k < 12 && want < DOOR.mostOpen; k++) {
        door.angle = want; door.pose();
        if (!door.keepOut(root.position.x, root.position.z, room, this.blocked)) break;
        want = Math.min(DOOR.mostOpen, want + DOOR.pushStep);
      }
    }
    // the handle pulls (or pushes) HER where the door cannot go (against its stop, or pushed toward its hinge): her
    // shoulder kept within her arm's play of where the handle is GOING (not of where the eased door is still catching
    // up: that held her back to the door's easing, and she crawled)
    if (pull) {
      door.angle = want; door.pose();
      door.handlePoint(this.side, v1);
      const dx = shoulder.x - v1.x, dz = shoulder.z - v1.z, flat = Math.hypot(dx, dz);
      const dy = shoulder.y - v1.y, most = Math.sqrt(Math.max(0.01, reachMost * reachMost - dy * dy));
      const least = Math.sqrt(Math.max(0.0001, reachLeast * reachLeast - dy * dy));
      const keep = THREE.MathUtils.clamp(flat, least, most);
      if (flat > 1e-4 && keep !== flat) pull.set((dx / flat) * (keep - flat), 0, (dz / flat) * (keep - flat));
    }
    // the door eases where her hand takes it (the spring's give), within its stop
    door.angle = THREE.MathUtils.clamp(was + (want - was) * (1 - Math.exp(-dt / DOOR.follow)), 0, DOOR.mostOpen);
    door.pose();
    void q1;
  }
}
