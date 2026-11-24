// ============================================================================
// flashlightProp.ts -- THE FLASHLIGHT HE HOLDS (the prologue: John's light).
//
// Joshua's handoff, 2026-11-23: "Attach a visible flashlight prop to the character's right hand using the appropriate
// rig/bone; maintain sensible grip and wrist orientation. The actual spotlight should originate at the flashlight lens,
// not at the camera or character head."
//
// WHY A PISTOL GRIP. His hand closes round things the way it closes round a gun's grip: the game's one measured hold
// (heroine/guns.ts `seatGunInHand`: the grip in his palm, his fingers curled round it, the barrel along his hand). A
// plain tube held in that fist would run straight through his fingers (a fist wraps ACROSS the palm, so a tube in it
// points out of the thumb's side, sideways or up, not ahead). So this is a handheld lamp with a pistol grip, as
// expedition and rescue lights often are: his fingers round the grip exactly where a gun's would be, the lamp's body
// above his hand, its lens ahead. Nothing about his hand changes from how it holds a gun.
//
// ITS OWN SPACE IS A GUN'S (so it sits in the same seat): its origin where his palm holds the grip, +Z the way the
// lens points, +Y its top. Metres.
//
// Four materials in one mesh (four draws): an expedition YELLOW body (a dark one was lost against the passage's rock,
// pictured), a black rubber grip, a steel bezel round the lens, and the lens itself, which glows warm while the light
// is on (the beam's own colour) and is dark glass while it is off.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Its sizes, metres. GAME TUNING (a hand-sized lamp: about 19 cm from tail to lens, its grip a gun's). */
const SIZE = {
  /** The lamp's body: a tube above his hand, from its tail to the head. */
  bodyRadius: 0.019,
  bodyFrom: -0.06,
  bodyTo: 0.09,
  /** Its height over the grip's origin (his palm): just clear of his fingers, as a gun's slide is. */
  bodyHeight: 0.052,
  /** The head flares out to the bezel, and the lens sits just inside it. */
  headRadius: 0.03,
  headTo: 0.13,
  bezelDepth: 0.012,
  /** The grip, angled back a little, as a gun's is (guns.ts). */
  grip: { width: 0.028, height: 0.1, depth: 0.04, y: -0.015, z: -0.005, tilt: -0.2 },
} as const;

/** The lens's glow while the light is on, and its dark glass while it is off. */
const LENS_LIT = 0xfff4de;
const LENS_OFF = 0x2c3038;

export interface FlashlightProp {
  /** Add this to his hand (FastHeroine `holdLight`): its matrix is set there, as a gun's is. */
  readonly object: THREE.Mesh;
  /** The middle of the lens, in its own space: where the beam starts. */
  readonly lens: THREE.Vector3;
  /** Light the lens (on) or show it as dark glass (off). */
  setLit(on: boolean): void;
  dispose(): void;
}

export function createFlashlightProp(): FlashlightProp {
  const s = SIZE, g = s.grip;
  // (a tube along +Z: three's cylinders stand along Y, so each is turned onto its side)
  const along = (rTail: number, rFront: number, from: number, to: number, sides = 18) =>
    new THREE.CylinderGeometry(rFront, rTail, to - from, sides).rotateX(Math.PI / 2).translate(0, s.bodyHeight, (from + to) / 2);
  // The body and its tail cap, the head flaring out to the bezel, the switch on top, and the grip under it all.
  const body = along(s.bodyRadius, s.bodyRadius, s.bodyFrom, s.bodyTo);
  const tail = along(s.bodyRadius * 1.08, s.bodyRadius * 1.08, s.bodyFrom - 0.008, s.bodyFrom + 0.006);
  const head = along(s.bodyRadius, s.headRadius, s.bodyTo, s.headTo - s.bezelDepth);
  const button = new THREE.BoxGeometry(0.012, 0.008, 0.02).translate(0, s.bodyHeight + s.bodyRadius + 0.003, 0.01);
  const grip = new THREE.BoxGeometry(g.width, g.height, g.depth).translate(0, g.y, g.z).rotateX(g.tilt);
  const shell = mergeGeometries([body, head]);
  const rubber = mergeGeometries([tail, button, grip]);
  // The bezel: a short steel ring at the front of the head.
  const bezel = along(s.headRadius, s.headRadius * 1.04, s.headTo - s.bezelDepth, s.headTo);
  // The lens: a disc just inside the bezel, facing ahead.
  const lensAt = s.headTo - 0.002;
  const lensDisc = new THREE.CircleGeometry(s.headRadius * 0.86, 24).translate(0, s.bodyHeight, lensAt);
  const geometry = mergeGeometries([shell, rubber, bezel, lensDisc], true);
  for (const part of [body, tail, head, button, grip, shell, rubber, bezel, lensDisc]) part.dispose();

  const materials = [
    new THREE.MeshStandardMaterial({ color: 0xe0a21c, roughness: 0.5, metalness: 0.1 }),
    new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.8, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: 0xa7adb6, roughness: 0.3, metalness: 0.85 }),
    // (a plain colour, unlit by the scene: it IS the light)
    new THREE.MeshBasicMaterial({ color: LENS_OFF }),
  ];
  const object = new THREE.Mesh(geometry, materials);
  object.name = 'flashlight-prop';
  object.matrixAutoUpdate = false;
  // (his hand moves it every frame and it is small: testing it against the camera's view costs more than drawing it)
  object.frustumCulled = false;
  // (no shadow of its own: the prologue's only shadows are the passage's, and a lamp this small would only flicker)
  object.castShadow = false;
  const lensMaterial = materials[3] as THREE.MeshBasicMaterial;
  let lit = false;

  return {
    object,
    lens: new THREE.Vector3(0, s.bodyHeight, lensAt + 0.004),
    setLit(on: boolean): void {
      if (on === lit) return;
      lit = on;
      lensMaterial.color.setHex(on ? LENS_LIT : LENS_OFF);
    },
    dispose(): void {
      object.removeFromParent();
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
