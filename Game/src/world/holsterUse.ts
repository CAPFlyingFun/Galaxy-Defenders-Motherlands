// ============================================================================
// holsterUse.ts -- PUTTING HER GUNS AWAY IN HER THIGH HOLSTERS, AND DRAWING
// THEM AGAIN, ON THE GO (Joshua, 2026-11-18: "holders on her waist/belt to put
// them away so her hands are free on the go without having to go all the way
// to the table"; "where you can put one or both guns away. Like how we have
// now at the table").
//
// Unlike the table, nothing stops: she keeps walking where the player steers.
// One action is a few phases:
//
//   lead   her head goes first (Joshua: "lead in with the head"): she glances
//          down at the holster(s) for HOLSTER_USE.lead seconds;
//   reach  each hand goes to its holster. The holster swings with her thigh
//          as she walks, so the hand's target is moved with it every frame
//          (`moveReach`: the hand keeps gliding, it is not started again);
//   swap   at the holster the gun changes hands: into the holster (her hand
//          opens and is free), or out of it into her grip. Either way the gun
//          SETTLES into its new place over a fifth of a second (nothing jumps);
//   back   her hands go back to her own pose (with a drawn gun: back to aiming).
//
// The holsters themselves (where each sits, the bone it rides) are her belt
// gear's: src/heroine/fast/beltGear.ts.
// ============================================================================
import * as THREE from 'three';
import type { Hand, HeroineBody, HeroineHands } from '../core/contracts';

/** GAME TUNING (seconds). */
export const HOLSTER_USE = Object.freeze({
  /** Her head leads: she glances at the holster this long before her hand goes. */
  lead: 0.7,
  /** A short moment with her hand on the gun at the holster as it changes hands (so it can be seen). */
  hold: 0.12,
  /** How long a gun takes to settle into the holster or her grip once handed over. */
  settle: 0.2,
});

type Phase = 'idle' | 'lead' | 'reach' | 'hold' | 'back';

const gunAt = new THREE.Matrix4(), gunWas = new THREE.Matrix4(), point = new THREE.Vector3();
const setA = new THREE.Vector3(), setB = new THREE.Vector3(), setSa = new THREE.Vector3(), setSb = new THREE.Vector3();
const setQa = new THREE.Quaternion(), setQb = new THREE.Quaternion();

export class HolsterUse {
  /** Each gun in its holster? */
  readonly holstered: Record<Hand, boolean> = { left: false, right: false };
  /** Putting away ('holster') or taking out ('draw'), and the hands doing it. */
  private action: 'holster' | 'draw' = 'holster';
  private hands: Hand[] = [];
  private phase: Phase = 'idle';
  /** How long her head leads this time (a reload that holsters a gun on the way has led already). */
  private leadFor: number = HOLSTER_USE.lead;
  private timer = 0;
  /** Each hand's target pose (one matrix each, rewritten every frame as the holster moves). */
  private readonly pose: Record<Hand, THREE.Matrix4> = { left: new THREE.Matrix4(), right: new THREE.Matrix4() };
  /** Where she looks: the middle of the holsters in use. */
  private readonly lookPoint = new THREE.Vector3();
  /** Guns settling into a new place: from where they were (in the new parent's space) to their seat. */
  private settling: { object: THREE.Object3D; from: THREE.Matrix4; to: THREE.Matrix4; t: number }[] = [];

  constructor(private readonly heroine: HeroineBody) {}

  /** Whether an action is running. (She still walks: only her hands are busy.) */
  get busy(): boolean { return this.phase !== 'idle'; }

  /** Whether this hand is on its way to a holster or back (it does not fire meanwhile). */
  handBusy(hand: Hand): boolean { return this.busy && this.hands.includes(hand); }

  /** Whether she has holsters at all (a body without the belt gear has none). */
  get hasHolsters(): boolean { return !!this.heroine.hands?.holster('left'); }

  /**
   * The main button's word: HOLSTER while she holds a gun, DRAW when none is in her hands but one is holstered; null
   * when there is nothing to do here (both guns lie on the table).
   */
  label(): string | null {
    const h = this.heroine.hands;
    if (!h || !this.hasHolsters) return null;
    if (h.hasGun('left') || h.hasGun('right')) return 'HOLSTER';
    return this.holstered.left || this.holstered.right ? 'DRAW' : null;
  }

  /**
   * Begin: 'both' (the main button) puts away whichever guns she holds, or if she holds none draws whichever are
   * holstered; one hand (L or R) puts that gun away if she holds it, or draws it if it is holstered. `lead`: how long her
   * head leads first, seconds.
   */
  start(which: 'both' | Hand, lead: number = HOLSTER_USE.lead): void {
    const h = this.heroine.hands;
    if (!h || this.busy || !this.hasHolsters) return;
    let hands: Hand[];
    let away: boolean;
    if (which === 'both') {
      const held = (['left', 'right'] as const).filter((hand) => h.hasGun(hand));
      away = held.length > 0;
      hands = away ? held : (['left', 'right'] as const).filter((hand) => this.holstered[hand]);
    } else {
      away = h.hasGun(which);
      hands = away || this.holstered[which] ? [which] : [];
    }
    if (hands.length === 0) return;
    this.action = away ? 'holster' : 'draw';
    this.hands = hands;
    this.phase = 'lead';
    this.leadFor = lead;
    this.timer = 0;
  }

  /** Draw every holstered gun (before the table or a reload needs them in her hands). Returns whether any is drawn. */
  drawAll(): boolean {
    const hands = (['left', 'right'] as const).filter((hand) => this.holstered[hand]);
    if (hands.length === 0 || this.busy) return false;
    this.start(hands.length === 2 ? 'both' : hands[0]);
    return this.busy;
  }

  /** Put away every gun she holds (her hands must be free: a bar). Returns whether any is being put away. */
  holsterAll(): boolean {
    const h = this.heroine.hands;
    if (!h || this.busy || !this.hasHolsters) return false;
    if (!h.hasGun('left') && !h.hasGun('right')) return false;
    this.start('both');
    return this.busy;
  }

  /**
   * AT THE START HER GUNS ARE IN THEIR HOLSTERS (Joshua, 2026-11-20: "Keep guns in holsters at start up and you can
   * remove them": DRAW takes them out). A side with no holster keeps its gun in her hand.
   */
  startHolstered(): void {
    const h = this.heroine.hands;
    if (!h) return;
    for (const hand of ['left', 'right'] as const) if (h.hasGun(hand) && h.holster(hand)) this.holstered[hand] = true;
    this.reseat();
  }

  /**
   * A NEW OUTFIT (main.ts `changeOutfit`): she is a new body with her guns back in her hands, so every gun that was
   * holstered is put straight into the new body's holster, in its seat (no reach: the change happens behind a cover).
   * A body with no holster on that side keeps that gun in her hand.
   */
  reseat(): void {
    const h = this.heroine.hands;
    this.settling = [];
    this.phase = 'idle';
    this.hands = [];
    for (const hand of ['left', 'right'] as const) {
      if (!this.holstered[hand]) continue;
      const holster = h?.holster(hand);
      if (!h || !holster) { this.holstered[hand] = false; continue; }
      const gun = h.releaseGun(hand, holster.bone);
      gun.matrix.copy(holster.seat);
      gun.matrixWorldNeedsUpdate = true;
    }
  }

  /** One frame. Writes where she looks (`lookAt`: the holster) while an action runs, else null. */
  update(dt: number, out: { lookAt: THREE.Vector3 | null }): void {
    this.moveSettling(dt);
    out.lookAt = null;
    if (this.phase === 'idle') return;
    const h = this.heroine.hands!;
    this.timer += dt;
    // where each hand must be to hold its gun in its holster, this frame (her thigh has moved)
    this.lookPoint.set(0, 0, 0);
    for (const hand of this.hands) {
      this.holsterGun(h, hand, gunAt);
      h.handPoseForGun(hand, gunAt, this.pose[hand]);
      this.lookPoint.add(point.setFromMatrixPosition(gunAt));
    }
    this.lookPoint.multiplyScalar(1 / this.hands.length);
    out.lookAt = this.lookPoint;

    switch (this.phase) {
      case 'lead':
        if (this.timer < this.leadFor) return;
        // (her fingers open on the way to a holstered gun; a hand carrying its gun keeps it gripped)
        for (const hand of this.hands) h.reach(hand, this.pose[hand], undefined, true);
        this.phase = 'reach';
        return;
      case 'reach':
        for (const hand of this.hands) h.moveReach(hand, this.pose[hand]);
        if (!this.hands.every((hand) => h.reached(hand) >= 0.999)) return;
        for (const hand of this.hands) { if (this.action === 'holster') this.putAway(h, hand); else this.takeOut(h, hand); }
        this.phase = 'hold';
        this.timer = 0;
        return;
      case 'hold':
        for (const hand of this.hands) h.moveReach(hand, this.pose[hand]);
        if (this.timer < HOLSTER_USE.hold) return;
        for (const hand of this.hands) h.reach(hand, null);
        this.phase = 'back';
        return;
      case 'back':
        out.lookAt = null;
        if (this.hands.every((hand) => h.reached(hand) <= 0)) { this.phase = 'idle'; this.hands = []; }
        return;
    }
  }

  /** Where hand `hand`'s gun sits when it is holstered, in the world now. */
  private holsterGun(h: HeroineHands, hand: Hand, out: THREE.Matrix4): THREE.Matrix4 {
    const holster = h.holster(hand)!;
    holster.bone.updateWorldMatrix(true, false);
    return out.copy(holster.bone.matrixWorld).multiply(holster.seat);
  }

  /** The gun goes into its holster: given to the thigh bone where it is, then settled into its seat. */
  private putAway(h: HeroineHands, hand: Hand): void {
    const holster = h.holster(hand)!;
    const gun = h.releaseGun(hand, holster.bone);
    this.settle(gun, holster.seat);
    this.holstered[hand] = true;
  }

  /** The gun comes out of its holster into her hand: where it is, then settled into her grip. */
  private takeOut(h: HeroineHands, hand: Hand): void {
    const gun = h.gun(hand);
    gun.updateWorldMatrix(true, false);
    gunWas.copy(gun.matrixWorld);
    h.takeGun(hand);
    const bone = h.handBone(hand);
    bone.updateWorldMatrix(true, false);
    gun.matrix.copy(bone.matrixWorld).invert().multiply(gunWas);
    this.settle(gun, h.gunSeat(hand, new THREE.Matrix4()));
    this.holstered[hand] = false;
  }

  /** SETTLING (as at the table): an object just handed over eases from where it was into its place over HOLSTER_USE.settle. */
  private settle(object: THREE.Object3D, place: THREE.Matrix4): void {
    this.settling = this.settling.filter((s) => s.object !== object);
    this.settling.push({ object, from: object.matrix.clone(), to: place.clone(), t: 0 });
  }

  private moveSettling(dt: number): void {
    for (const s of this.settling) {
      s.t = Math.min(1, s.t + dt / HOLSTER_USE.settle);
      const k = s.t * s.t * (3 - 2 * s.t);
      s.from.decompose(setA, setQa, setSa);
      s.to.decompose(setB, setQb, setSb);
      s.object.matrix.compose(setA.lerp(setB, k), setQa.slerp(setQb, k), setSa.lerp(setSb, k));
      s.object.matrixWorldNeedsUpdate = true;
    }
    this.settling = this.settling.filter((s) => s.t < 1);
  }
}
