// ============================================================================
// toilet.ts -- THE POP-UP TOILET (Joshua, 2026-11-22: "can you create a procedural toilet 🚽 that pops up just behind
// where either one are standing, and then can test the sitting pose and make sure that's good? ... later can place
// them in real locations that their AI/NPC brain and go to or the player").
//
// A plain white toilet, made in code (nothing downloaded): a round-fronted bowl with water in it, the deck behind it,
// the tank on the deck with its lid and a chrome flush lever, a seat ring and the lid up against the tank. When the 🚽
// is pressed it GROWS IN just behind whoever is going (0.3 s), the middle of its seat under where their hips will come
// to rest, its top at THEIR seat height (heroine/fast/sitPose.ts measures it from their own bones: a taller body's
// toilet is a little taller); they sit on it (sitPose.ts), and once they are up again it SHRINKS AWAY (0.25 s).
//
// Its own frame: the floor right under the sitter's hip joints is (0, 0, 0), +Z the way they face, +X their left, Y up.
// Its sizes are a real toilet's (an elongated bowl about 37 cm wide and 48 cm front to back, its seat about 43 cm up,
// the tank 42 cm wide to about 76 cm up), the whole of it stretched up or down a little to the sitter's seat height.
// Each of the two characters has one of their own (main.ts, their kit), so both can go at once.
// ============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A real toilet's seat top over the floor, metres: the shape below is drawn for this, and stretched to the sitter's. */
const DRAWN_TOP = 0.43;
/** How far it reaches round the point under the sitter's hips, metres (for the room it needs: main.ts `toiletFits`). */
export const TOILET_SIZE = Object.freeze({ behind: 0.42, ahead: 0.3, halfWidth: 0.23 });
/** Growing in and shrinking away, seconds. */
const GROW_SECONDS = 0.3, SHRINK_SECONDS = 0.25;
/** The bowl is round (a lathe) and stretched front to back by this much to its elongated shape. */
const LONG = 1.35;
/** The middle of the bowl and the seat's opening, this far in front of the point under the sitter's hips, metres. */
const BOWL_AHEAD = 0.03;

export class PopUpToilet {
  /** Put this in the scene once; it shows itself only while in use or growing or shrinking. */
  readonly root = new THREE.Group();
  /** The way it faces (the sitter's facing as they sat: main.ts holds their body to it while they sit). */
  yaw = 0;
  /** Someone is using it (from `show` until `hide`). */
  inUse = false;
  /** Its shape, stretched up or down to the sitter's seat height. */
  private readonly fit = new THREE.Group();
  /** Growing in (+1), shrinking away (-1), or still (0); and how far it has grown, 0..1. */
  private growing = 0;
  private grown = 0;
  private readonly made: { dispose(): void }[] = [];

  constructor() {
    this.root.name = 'pop-up toilet';
    this.root.visible = false;
    this.root.add(this.fit);
    this.build();
  }

  /** Grow in at (x, y, z), y its floor, facing `yaw`, its seat top `top` metres over the floor. */
  show(x: number, y: number, z: number, yaw: number, top: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
    this.yaw = yaw;
    this.fit.scale.set(1, Math.max(0.6, Math.min(1.5, top / DRAWN_TOP)), 1);
    this.inUse = true;
    this.growing = 1;
    this.root.visible = true;
  }

  /** Shrink away (they are up again). */
  hide(): void {
    if (!this.inUse && this.growing <= 0) return;
    this.inUse = false;
    this.growing = -1;
  }

  /** Once a frame: its growing in or shrinking away. */
  update(dt: number): void {
    if (this.growing === 0) return;
    this.grown = Math.max(0, Math.min(1, this.grown + this.growing * dt / (this.growing > 0 ? GROW_SECONDS : SHRINK_SECONDS)));
    // (growing in: a little past full size and back, as a thing popping up does; shrinking away: eased in)
    const t = this.grown;
    const size = this.growing > 0 ? 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2) : t * t;
    this.root.scale.setScalar(Math.max(0.001, size));
    if (this.growing > 0 && t >= 1) { this.growing = 0; this.root.scale.setScalar(1); }
    if (this.growing < 0 && t <= 0) { this.growing = 0; this.root.visible = false; }
  }

  dispose(): void {
    for (const thing of this.made) thing.dispose();
    this.root.removeFromParent();
  }

  // ---- its shape -------------------------------------------------------------------------------------------------
  private build(): void {
    const keep = <T extends { dispose(): void }>(thing: T): T => { this.made.push(thing); return thing; };
    // (glazed porcelain; the seat a softer white plastic; the lever chrome; the water clear and a little blue)
    const porcelain = keep(new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.16, metalness: 0, side: THREE.DoubleSide }));
    const plastic = keep(new THREE.MeshStandardMaterial({ color: 0xf6f5f1, roughness: 0.38, metalness: 0 }));
    const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.15, metalness: 1 }));
    const water = keep(new THREE.MeshStandardMaterial({ color: 0x7fa9c4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.85 }));
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.fit.add(mesh);
      return mesh;
    };
    const rim = DRAWN_TOP - 0.025;   // (the bowl's rim, under the seat)

    // THE BOWL: its outside from the floor up (the narrow foot, flaring to the rim), over the rim, and its inside down
    // to the bottom of the bowl; turned round its middle and stretched front to back
    const profile = [
      [0.118, 0], [0.122, 0.015], [0.108, 0.09], [0.11, 0.17], [0.138, 0.25], [0.168, 0.32], [0.181, rim - 0.03],
      [0.185, rim - 0.012], [0.178, rim], [0.162, rim], [0.152, rim - 0.018], [0.128, rim - 0.075], [0.092, rim - 0.135],
      [0.058, rim - 0.18], [0.02, rim - 0.2], [0, rim - 0.205],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bowl = add(new THREE.LatheGeometry(profile, 40), porcelain, 0, 0, BOWL_AHEAD);
    bowl.scale.set(1, 1, LONG);
    // (the water in it)
    const pool = add(new THREE.CircleGeometry(0.078, 32), water, 0, rim - 0.155, BOWL_AHEAD);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(1, LONG, 1);
    pool.castShadow = false;
    // THE DECK behind the bowl, up to the rim, that the tank stands on
    add(new RoundedBoxGeometry(0.27, rim, 0.17, 3, 0.03), porcelain, 0, rim / 2, -0.24);
    // THE TANK, its lid, and the flush lever (on the sitter's right; seen facing the toilet, its left)
    const tankBottom = rim, tankHeight = 0.33, tankDepth = 0.18, tankZ = -0.22 - tankDepth / 2;
    add(new RoundedBoxGeometry(0.42, tankHeight, tankDepth, 3, 0.025), porcelain, 0, tankBottom + tankHeight / 2, tankZ);
    add(new RoundedBoxGeometry(0.45, 0.03, tankDepth + 0.025, 3, 0.012), porcelain, 0, tankBottom + tankHeight + 0.015, tankZ);
    // (on the tank's side, its front corner, pointing forward: the lid stands over the middle of the tank's front)
    const leverY = tankBottom + tankHeight - 0.05;
    const plate = add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 20), chrome, -0.213, leverY, -0.255);
    plate.rotation.z = Math.PI / 2;
    const lever = add(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 12), chrome, -0.222, leverY, -0.23);
    lever.rotation.x = Math.PI / 2;

    // THE SEAT RING: an elongated ring with its opening, its edges rounded, lying on the rim
    const ring = new THREE.Shape();
    ring.absellipse(0, BOWL_AHEAD, 0.185, 0.235, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, BOWL_AHEAD + 0.02, 0.11, 0.152, 0, Math.PI * 2, true, 0);
    ring.holes.push(hole);
    const flat = { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.007, bevelSegments: 2, curveSegments: 40 };
    // (drawn flat in x and y, y forward: turned to lie down, its thickness going down from its top)
    const seat = add(new THREE.ExtrudeGeometry(ring, flat), plastic, 0, DRAWN_TOP - 0.005, 0);
    seat.rotation.x = Math.PI / 2;
    // THE LID, up: standing on its hinge at the back of the seat, against the front of the tank
    const lidShape = new THREE.Shape();
    lidShape.absellipse(0, 0.215, 0.18, 0.215, 0, Math.PI * 2, false, 0);
    add(new THREE.ExtrudeGeometry(lidShape, { ...flat, depth: 0.012 }), plastic, 0, DRAWN_TOP + 0.005, -0.222 + 0.003);
    // (two small hinges where the seat and lid meet the deck)
    for (const side of [-1, 1]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.035, 12), plastic, side * 0.075, DRAWN_TOP - 0.004, -0.205).rotation.z = Math.PI / 2;
  }
}
