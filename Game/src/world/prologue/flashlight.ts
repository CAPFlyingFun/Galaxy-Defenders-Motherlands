// ============================================================================
// flashlight.ts -- JOHN'S FLASHLIGHT (the prologue's only real light).
//
// Joshua's opening demo, Draft 1, Scene 1: "Black screen. Water drips somewhere in the darkness. A radio crackles...
// A flashlight flickers on. Ancient passageways stretch ahead." The scene is built to "introduce movement,
// flashlight, and inspect/scan controls", so the player has a 🔦 LIGHT button to switch it off and on again.
//
// DONE THE WAY BEYOND EXTINCTION DOES SARAH'S FLASHLIGHT IN THE LAB'S POWER OUTAGE (Joshua, 2026-11-22: "Check Beyond
// Extinction to see how that agent did the flashing beam during the power outage in the lab"; its
// src/scenes/PrologueCafeteriaScene.ts, `buildFlashlight`, `grabFlashlight`, and the cone in `update`):
//
//   ONE SPOT LIGHT, made at the start and always "visible", only its strength 0 while it is off. (BE: a light hidden
//                 and then shown makes every material's shader be built again, "a multi-second hitch on mobile"; one
//                 counted from the start never does.)
//   NO SHADOWS from it. (My first try started the beam at his eyes AND cast shadows: his own head shadowed everything
//                 it lit, and the passage stayed black. BE's casts none, which is also one less picture to draw a frame.)
//   FROM THE LENS OF THE LIGHT IN HIS HAND (Joshua's handoff, 2026-11-23: "The actual spotlight should originate at the
//                 flashlight lens, not at the camera or character head. Aim it toward the camera/look target so
//                 first-person exploration remains intuitive"; flashlightProp.ts, FastHeroine `holdLight`): the beam
//                 starts at the lens and points at the spot HIS EYES LOOK AT (the rock where the line from his eyes
//                 meets it, at most AIM_AHEAD on), and his right arm points the lamp at that same spot. First person
//                 his eyes are the camera, so the spot under the crosshair is lit, as before; third person it is
//                 where he looks (not the camera: from the side views the camera looks across him).
//                 (v0.2.153-163: from the camera in first person and his head in third, Beyond Extinction's way.)
//   A LENS IN THE ROCK: his hand can reach into a wall; a light inside the rock lights nothing in the passage (no rock
//                 face faces it). So the beam starts no further out along the line from his eyes to the lens than the
//                 rock lets it, a few centimetres short of it.
//   BE'S BEAM:    a warm white (0xfff4de), a cone of pi/7 with a soft edge (penumbra 0.35), and a gentle fall-off
//                 (decay 1, not the physical 2), so it carries down the passage. And BE's tone mapping (ACES filmic,
//                 exposure 1.15: main.ts, the prologue only), which keeps a bright beam from going flat white.
//
// CLOSE TO THE ROCK IT DIMS (like an eye, or a camera's exposure, adjusting): with that gentle fall-off a wall a couple
// of metres away was still a white disc at any strength that lit the passage further on (pictured at 20, 30 and 45).
// So its strength follows how far the beam goes before it meets rock (tunnel.ts `rayLength`): full from NEAR_FULL
// metres away (looking down the passage, where its light falls along the walls), less and less nearer, in step with
// the distance, so rock it meets square on, near or far, is lit about as brightly as the walls down the passage;
// eased so it never jumps.
//
// THE SPILL: a faint warm light hanging over him, as the beam's light bouncing back off the rock (BE keeps a dim
// coloured wash in its lab for the same reason: the room is never pure black). It goes off with the beam.
//
// It can FLICKER (coming on at the start, or when the passage shakes): a pattern of on and off moments.
// ============================================================================

import * as THREE from 'three';

/** The beam: BE's colour, cone, soft edge and gentle fall-off; its strength for metres. GAME TUNING. */
const BEAM = { colour: 0xfff4de, strength: 30, reach: 30, cone: Math.PI / 7, softEdge: 0.35, falloff: 1 } as const;
/** From this far from the rock the beam is at full strength (metres); nearer, it dims in step, down to DIM_MOST. */
const NEAR_FULL = 25;
const DIM_MOST = 0.05;
/** How quickly it follows (seconds, about two thirds of the way). */
const DIM_SECONDS = 0.18;
/** How far ahead the beam is aimed at most (metres, along where he looks: BE's 16 units, in metres), and at least (so
 *  rock right in front of him does not swing his arm in to his chest). */
const AIM_AHEAD = 16;
const AIM_NEAREST = 1.5;
/** A lens inside the rock: the beam starts this far short of the rock, metres, on the line from his eyes to the lens. */
const LENS_CLEAR = 0.05;
/** The spill's strength, and how far it reaches (metres). It hangs behind him and above, toward the camera, so his
 *  back is not black in third person. */
const SPILL = 1.6;
const SPILL_REACH = 4.5;

export class Flashlight {
  /** On, as the player last set it (a flicker plays over this). */
  on = false;
  readonly beam: THREE.SpotLight;
  private readonly spill: THREE.PointLight;
  /** A flicker running: moments (seconds from its start) at which the light swaps between off and on. */
  private flickerAt: number[] = [];
  private flickerTime = 0;
  private flickerLit = false;
  private readonly dir = new THREE.Vector3();
  private readonly toLens = new THREE.Vector3();
  /** Where he looks (world): the spot the beam points at and his arm points the lamp at (`aimAt`). */
  readonly spot = new THREE.Vector3();
  /** How much of its strength it has now, for the rock's nearness (1 far, less close; eased). */
  private nearness = 1;

  constructor(parent: THREE.Object3D) {
    // (made "visible" with strength 0: BE's way, so turning it on never rebuilds a shader; and no shadows)
    this.beam = new THREE.SpotLight(BEAM.colour, 0, BEAM.reach, BEAM.cone, BEAM.softEdge, BEAM.falloff);
    this.beam.castShadow = false;
    this.beam.name = 'flashlight';
    parent.add(this.beam, this.beam.target);
    this.spill = new THREE.PointLight(0xffd9b0, 0, SPILL_REACH, 2);
    parent.add(this.spill);
  }

  /** Turn it on or off (the LIGHT button), with a click of a flicker when it comes on. */
  set(on: boolean): void {
    this.on = on;
    this.flickerAt = on ? [0.04, 0.09, 0.15] : [];
    this.flickerTime = 0;
    this.flickerLit = false;
    if (!on) this.show(false);
  }

  /**
   * A flicker (the start of the scene, the passage shaking): it starts lit or dark (`startLit`), and swaps at each of
   * the `moments` (seconds from now); after the last it is as the player set it.
   */
  flicker(moments: number[], startLit: boolean): void {
    this.flickerAt = moments.slice();
    this.flickerTime = 0;
    this.flickerLit = startLit;
  }

  /** Lit this moment (on, or lit in a flicker): the lens on the prop glows while it is. */
  get lit(): boolean { return this.beam.intensity > 0; }

  /**
   * THE SPOT HE LOOKS AT (`spot`): along `look` (the way his eyes look) from `eye`, where it meets the rock, between
   * AIM_NEAREST and AIM_AHEAD on. The game gives it to his arm (`lightAt`) before his body is posed, and to `update`.
   */
  aimAt(eye: THREE.Vector3, look: THREE.Vector3, rockAt: (from: THREE.Vector3, dir: THREE.Vector3, most: number) => number): THREE.Vector3 {
    this.dir.copy(look).normalize();
    const far = Math.max(AIM_NEAREST, Math.min(AIM_AHEAD, rockAt(eye, this.dir, AIM_AHEAD)));
    return this.spot.copy(eye).addScaledVector(this.dir, far);
  }

  /**
   * Once a frame, after the camera is placed and he is posed: the beam from the LENS (`lens`, world) toward the spot
   * he looks at (`aimAt`, worked out this frame from `eye` and `look`). `look` is the way his eyes look (the camera's
   * way in first person). `rockAt` says how far a line from a point goes before it meets rock (tunnel.ts `rayLength`).
   */
  update(dt: number, lens: THREE.Vector3, eye: THREE.Vector3, look: THREE.Vector3, rockAt: (from: THREE.Vector3, dir: THREE.Vector3, most: number) => number): void {
    // the flicker: each moment passed swaps it; when they are all past it is as the player set it
    if (this.flickerAt.length) {
      this.flickerTime += dt;
      while (this.flickerAt.length && this.flickerTime >= this.flickerAt[0]) { this.flickerAt.shift(); this.flickerLit = !this.flickerLit; }
      this.show(this.flickerAt.length ? this.flickerLit : this.on);
    } else this.show(this.on);
    this.aimAt(eye, look, rockAt);
    // (from the lens; or, with the lens in the rock, from just short of the rock on the line from his eyes to the lens)
    this.toLens.copy(lens).sub(eye);
    const reach = this.toLens.length();
    if (reach > 1e-4) {
      this.toLens.multiplyScalar(1 / reach);
      const free = rockAt(eye, this.toLens, reach);
      this.beam.position.copy(eye).addScaledVector(this.toLens, free < reach ? Math.max(0, free - LENS_CLEAR) : reach);
    } else this.beam.position.copy(eye);
    this.beam.target.position.copy(this.spot);
    this.beam.target.updateMatrixWorld();
    this.dir.copy(this.spot).sub(this.beam.position).normalize();
    // (dimmer close to the rock, eased)
    const want = Math.max(DIM_MOST, Math.min(1, rockAt(this.beam.position, this.dir, NEAR_FULL) / NEAR_FULL));
    this.nearness += (want - this.nearness) * (1 - Math.exp(-dt / DIM_SECONDS));
    this.spill.position.set(eye.x - look.x * 0.9, eye.y + 0.35, eye.z - look.z * 0.9);
  }

  private show(lit: boolean): void {
    this.beam.intensity = lit ? BEAM.strength * this.nearness : 0;
    this.spill.intensity = lit ? SPILL : 0;
  }

  dispose(): void {
    this.beam.removeFromParent();
    this.beam.target.removeFromParent();
    this.spill.removeFromParent();
    this.beam.dispose();
    this.spill.dispose();
  }
}
