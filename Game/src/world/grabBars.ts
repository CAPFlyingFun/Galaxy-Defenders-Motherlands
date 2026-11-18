// ============================================================================
// grabBars.ts -- things to take hold of (Joshua, 2026-11-17, next step #4:
// "gripping a pole, both vertical and horizontal"), and what she does there.
//
// Two test pieces beside the weapon table:
//   POLE  an upright pole, floor to above her head. She stands with it at her
//         right hand and takes it like a handshake: palm toward her middle,
//         thumb up, fingers round the front.
//   RAIL  a waist-high rail between two posts, across in front of her. She
//         takes it with both hands, overhand, shoulder width apart.
//
// Her hand is posed with its palm on the bar (fingerTouch.ts `gripPose`), and
// then every finger closes, joint by joint, until it touches. Nothing here
// says how far a finger bends: the bar's size decides.
//
// Taking hold, she walks to her spot, turns to the bar, reaches; then she
// holds on (the player's stick waits) until LET GO. A hand with a gun in it
// puts the gun on the weapon table first (the game does that: main.ts).
//
// Each bar is a cylinder the builder's grip code understands (`GripShape`);
// later a door's lever, a ladder's rung, a vehicle's handle are the same.
// ============================================================================
import * as THREE from 'three';
import type { GripShape } from '@charb/actor/handGrip';
import type { Hand, HeroineBody } from '../core/contracts';

/** GAME TUNING (metres). */
export const BARS = Object.freeze({
  /** Both bars' radius (a 4 cm bar, as on a bus or a balcony). */
  radius: 0.02,
  /** The pole's height. */
  poleTall: 2.3,
  /** Where she stands for the pole: the pole this far to her right and this far ahead of her middle. */
  poleSide: 0.22,
  poleAhead: 0.32,
  /** Her hand's height on the pole, as a share of her height. */
  poleHold: 0.65,
  /** The rail's height, its length, and its posts' radius. */
  railHigh: 1.0,
  railLong: 1.2,
  postRadius: 0.03,
  /** Where she stands for the rail: this far back from it (or her belly plus `railBellyGap`, if more). */
  railBack: 0.4,
  railBellyGap: 0.1,
  /** Her hands on the rail: each this far to the side of the middle. */
  railHands: 0.2,
  /** How close she must be to a bar's spot for its button to show. */
  near: 1.6,
  /** Close enough to her spot; turned to the bar within this (radians); the longest she waits to turn (seconds). */
  arrived: 0.04,
  faced: 0.14,
  faceWaitMost: 1.5,
});

export type BarName = 'pole' | 'rail';

const m = new THREE.Matrix4(), v = new THREE.Vector3(), at = new THREE.Vector3(), axis = new THREE.Vector3();
const palmTo = new THREE.Vector3(), wrapTo = new THREE.Vector3(), facePoint = new THREE.Vector3(), faceOut = new THREE.Vector3();

/** The two bars, in the world. Each has its own frame: she faces its +z when she stands at it, its x is her left. */
export class GrabBars {
  readonly pole = new THREE.Group();
  readonly rail = new THREE.Group();

  constructor() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a98aa, metalness: 0.75, roughness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x5ee8c8 });
    const tube = (radius: number, length: number, material: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material);
      mesh.castShadow = true;
      return mesh;
    };
    // THE POLE: floor to above her head, a glowing ring at its foot
    this.pole.name = 'grab pole';
    const pole = tube(BARS.radius, BARS.poleTall, metal);
    pole.position.y = BARS.poleTall / 2;
    const foot = tube(0.06, 0.03, glow);
    foot.position.y = 0.015;
    this.pole.add(pole, foot);
    // THE RAIL: across (along its x), on two posts
    this.rail.name = 'grab rail';
    const rail = tube(BARS.radius, BARS.railLong, metal);
    rail.rotation.z = Math.PI / 2;
    rail.position.y = BARS.railHigh;
    this.rail.add(rail);
    for (const side of [-1, 1]) {
      const post = tube(BARS.postRadius, BARS.railHigh, metal);
      post.position.set(side * BARS.railLong / 2, BARS.railHigh / 2, 0);
      const cap = tube(0.05, 0.03, glow);
      cap.position.set(side * BARS.railLong / 2, 0.015, 0);
      this.rail.add(post, cap);
    }
  }

  /** Put a bar on the ground at (x, z), turned so she faces `yaw` when she stands at it (0 = +Z). */
  place(bar: BarName, x: number, z: number, yaw: number): void {
    const group = this[bar];
    group.position.set(x, 0, z);
    group.rotation.set(0, yaw, 0);
    group.updateMatrixWorld(true);
  }

  /** The bar's own shape, in the world (for the fingers): a cylinder along its axis. */
  shape(bar: BarName): GripShape {
    const w = this[bar].matrixWorld;
    if (bar === 'pole') {
      const a = v.set(0, 0, 0).applyMatrix4(w).toArray() as [number, number, number];
      const b = v.set(0, BARS.poleTall, 0).applyMatrix4(w).toArray() as [number, number, number];
      return { kind: 'cylinder', a, b, radius: BARS.radius };
    }
    const a = v.set(-BARS.railLong / 2, BARS.railHigh, 0).applyMatrix4(w).toArray() as [number, number, number];
    const b = v.set(BARS.railLong / 2, BARS.railHigh, 0).applyMatrix4(w).toArray() as [number, number, number];
    return { kind: 'cylinder', a, b, radius: BARS.radius };
  }

  /** Where she stands to take hold (world). */
  standSpot(bar: BarName, out: THREE.Vector3, bellyAhead: number): THREE.Vector3 {
    if (bar === 'pole') out.set(BARS.poleSide, 0, -BARS.poleAhead); // (her right is the bar frame's -x: so the pole is at her right)
    else out.set(0, 0, -Math.max(BARS.railBack, bellyAhead + BARS.railBellyGap));
    return out.applyMatrix4(this[bar].matrixWorld);
  }

  /** The way she faces at it. */
  faceYaw(bar: BarName): number { return this[bar].rotation.y; }

  /** The hands a bar is held with. */
  hands(bar: BarName): Hand[] { return bar === 'pole' ? ['right'] : ['left', 'right']; }

  /** Where one hand must be to hold this bar (a pose for her hand bone, world). */
  handPose(bar: BarName, hand: Hand, heroine: HeroineBody, out: THREE.Matrix4): THREE.Matrix4 {
    const w = this[bar].matrixWorld;
    if (bar === 'pole') {
      // a handshake: the palm toward her middle (her left, the frame's +x), the fingers round the front (+z)
      at.set(0, heroine.height * BARS.poleHold, 0).applyMatrix4(w);
      axis.set(0, 1, 0).transformDirection(w);
      palmTo.set(1, 0, 0).transformDirection(w);
    } else {
      // overhand: the palm down onto the rail (and a little toward it), the fingers over its top and round the front
      at.set(hand === 'left' ? BARS.railHands : -BARS.railHands, BARS.railHigh, 0).applyMatrix4(w);
      axis.set(1, 0, 0).transformDirection(w);
      palmTo.set(0, -1, 0.35).normalize().transformDirection(w);
    }
    wrapTo.set(0, 0, 1).transformDirection(w);
    return heroine.hands!.gripPose(hand, at, axis, palmTo, wrapTo, BARS.radius, out);
  }

  /** The rail's near side, for her body to keep off it (as the table's edge): null for the pole. */
  nearFace(bar: BarName): { point: THREE.Vector3; outward: THREE.Vector3; top: number } | null {
    if (bar === 'pole') return null;
    const w = this.rail.matrixWorld;
    facePoint.set(0, BARS.railHigh, -BARS.radius).applyMatrix4(w);
    faceOut.set(0, 0, -1).transformDirection(w);
    return { point: facePoint, outward: faceOut, top: BARS.railHigh };
  }
}

/** Taking hold of a bar, holding on, letting go. */
export class GrabUse {
  /** The bar she is at (walking to, holding, letting go of), or null. */
  bar: BarName | null = null;
  private phase: 'idle' | 'walk' | 'face' | 'reach' | 'hold' | 'release' = 'idle';
  private timer = 0;
  private readonly spot = new THREE.Vector3();

  constructor(private readonly bars: GrabBars, private readonly heroine: HeroineBody) {}

  /** Whether she is busy with a bar (walking to it, holding it, letting go): the stick waits meanwhile. */
  get busy(): boolean { return this.phase !== 'idle'; }
  /** Whether she has hold of it now (the button says LET GO). */
  get holding(): boolean { return this.phase === 'reach' || this.phase === 'hold'; }

  /** The bar nearest her spot, and how far. */
  nearest(x: number, z: number): { bar: BarName; distance: number } {
    const ahead = this.heroine.hands?.bellyAhead() ?? 0;
    let best: BarName = 'pole', distance = Infinity;
    for (const bar of ['pole', 'rail'] as const) {
      this.bars.standSpot(bar, this.spot, ahead);
      const d = Math.hypot(this.spot.x - x, this.spot.z - z);
      if (d < distance) { distance = d; best = bar; }
    }
    return { bar: best, distance };
  }

  /** The button: LET GO while she holds on; GRAB POLE / GRAB RAIL when she is near one; null: no button. */
  label(x: number, z: number): string | null {
    if (!this.heroine.hands) return null;
    if (this.holding) return 'LET GO';
    if (this.busy) return null;
    const near = this.nearest(x, z);
    return near.distance < BARS.near ? (near.bar === 'pole' ? 'GRAB POLE' : 'GRAB RAIL') : null;
  }

  /** Begin taking hold of a bar (its hands must be empty: the game puts their guns down first). */
  start(bar: BarName): void {
    const h = this.heroine.hands;
    if (!h || this.busy) return;
    this.bar = bar;
    this.phase = 'walk';
    this.timer = 0;
    // her body keeps off the rail as off the table's edge (whatever her belly's size)
    h.keepOff(this.bars.nearFace(bar));
  }

  /** Let go: her hands come back to her, her fingers open off the bar. */
  letGo(): void {
    const h = this.heroine.hands;
    if (!h || !this.bar) return;
    if (this.phase === 'walk' || this.phase === 'face') { this.finish(); return; }
    for (const hand of this.bars.hands(this.bar)) { h.hold(hand, null); h.reach(hand, null); }
    this.phase = 'release';
  }

  /** One frame. `at` is where she stands; this writes where she should walk and which way she should look. */
  update(dt: number, atX: number, atZ: number, out: { walkTo: THREE.Vector3 | null; look: number | null; yaw: number }): void {
    out.walkTo = null;
    out.look = null;
    if (this.phase === 'idle' || !this.bar) return;
    const h = this.heroine.hands!, bar = this.bar;
    this.timer += dt;
    const face = this.bars.faceYaw(bar);
    out.look = face;
    if (this.phase === 'walk') {
      this.bars.standSpot(bar, this.spot, h.bellyAhead());
      if (Math.hypot(this.spot.x - atX, this.spot.z - atZ) > BARS.arrived) { out.walkTo = this.spot; return; }
      this.phase = 'face'; this.timer = 0;
    }
    if (this.phase === 'face') {
      const off = Math.abs(Math.atan2(Math.sin(out.yaw - face), Math.cos(out.yaw - face)));
      if (off > BARS.faced && this.timer < BARS.faceWaitMost) return;
      // REACH: each hand to its place on the bar, its fingers to close round it once there
      const shape = this.bars.shape(bar);
      for (const hand of this.bars.hands(bar)) {
        h.reach(hand, this.bars.handPose(bar, hand, this.heroine, m.clone()));
        h.hold(hand, shape);
      }
      this.phase = 'reach';
      return;
    }
    if (this.phase === 'reach') {
      if (this.bars.hands(bar).every((hand) => h.reached(hand) >= 0.999)) this.phase = 'hold';
      return;
    }
    if (this.phase === 'release') {
      if (this.bars.hands(bar).every((hand) => h.reached(hand) <= 0)) this.finish();
    }
  }

  private finish(): void {
    this.heroine.hands?.keepOff(null);
    this.phase = 'idle';
    this.bar = null;
  }
}
