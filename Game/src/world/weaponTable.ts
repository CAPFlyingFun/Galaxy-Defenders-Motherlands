// ============================================================================
// weaponTable.ts -- the weapon table (Joshua, 2026-11-17: "maybe a table you
// can actually grab to pick up and drop your guns/weapons"; later the loadout
// station, where each hand's slot is filled).
//
// A plain sci-fi table: a dark top with a glowing edge, four legs, and on it
// two small GUN STANDS, one for each hand. A gun rests on its stand UPRIGHT,
// barrel pointing away across the table, just as it sits in her hand when she
// aims straight ahead. So taking it is a natural reach (her hand comes to it
// from behind, as if she were about to aim), and nothing about her wrist has
// to twist.
//
// Its own frame: x her left (as she stands at it), y up, z away from her
// across the table. Placed by `place(x, z, yaw)`: yaw is the way she faces
// when she stands at it (0 = +Z).
//
// It is cheap: seven boxes, made once. Its height can be changed (for the
// tests: each of her four ways of getting down to it).
// ============================================================================
import * as THREE from 'three';
import type { Hand } from '../core/contracts';

/** GAME TUNING (metres). */
export const TABLE = Object.freeze({
  /** The top's height above the floor (about a kitchen table's), its width (side to side) and depth. */
  height: 0.78,
  width: 1.0,
  depth: 0.55,
  /** The top's thickness and the legs' thickness. */
  thick: 0.04,
  leg: 0.05,
  /** Each gun stand: how far from the middle to the side, how far into the table, and how tall. */
  standSide: 0.17,
  standIn: -0.15,
  standTall: 0.07,
  /** Where she stands to use it: this far back from the table's middle. */
  standBack: 0.62,
  /** How close she must be (from her standing spot) for the table's buttons to show, metres. */
  near: 2.2,
});

/** Where a gun's own origin sits above the top of its stand (the bottom of its grip is about 8 cm below it). */
const GUN_ABOVE_STAND = 0.085;

export class WeaponTable {
  readonly root = new THREE.Group();
  private readonly top: THREE.Mesh;
  private readonly edge: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];
  private readonly stands: THREE.Mesh[] = [];
  private heightNow: number = TABLE.height;

  constructor(height: number = TABLE.height) {
    this.root.name = 'weapon table';
    const dark = new THREE.MeshStandardMaterial({ color: 0x20262f, metalness: 0.6, roughness: 0.45 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x5ee8c8 });
    const box = (x: number, y: number, z: number, material: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    this.top = box(TABLE.width, TABLE.thick, TABLE.depth, dark);
    // (a thin glowing strip along the edge nearest her, so the table reads at a glance from far off)
    this.edge = box(TABLE.width, 0.012, 0.012, glow);
    for (let i = 0; i < 4; i++) this.legs.push(box(TABLE.leg, 1, TABLE.leg, dark));
    for (let i = 0; i < 2; i++) this.stands.push(box(0.035, TABLE.standTall, 0.05, dark));
    this.setHeight(height);
  }

  /** The table's height above the floor, metres (its legs are stretched to it). */
  get height(): number { return this.heightNow; }

  setHeight(height: number): void {
    this.heightNow = height;
    const topY = height - TABLE.thick / 2;
    this.top.position.set(0, topY, 0);
    this.edge.position.set(0, topY, -TABLE.depth / 2);
    const legTall = Math.max(0.01, height - TABLE.thick);
    this.legs.forEach((leg, i) => {
      leg.scale.y = legTall;
      leg.position.set((i % 2 ? 1 : -1) * (TABLE.width / 2 - 0.06), legTall / 2, (i < 2 ? 1 : -1) * (TABLE.depth / 2 - 0.06));
    });
    this.stands.forEach((stand, i) => stand.position.set((i === 0 ? 1 : -1) * TABLE.standSide, height + TABLE.standTall / 2, TABLE.standIn));
    this.root.updateMatrixWorld(true);
  }

  /** Put the table on the floor at (x, z), turned so that standing at it she faces `yaw` (0 = +Z). */
  place(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Where a gun lies on its stand, as the gun's own world matrix (upright, barrel pointing away across the table).
   * The left hand's stand is on her left as she stands at the table.
   */
  slot(hand: Hand, out: THREE.Matrix4): THREE.Matrix4 {
    const side = hand === 'left' ? 1 : -1;
    out.makeTranslation(side * TABLE.standSide, this.heightNow + TABLE.standTall + GUN_ABOVE_STAND, TABLE.standIn);
    return out.premultiply(this.root.matrixWorld);
  }

  /** Where she stands to use the table (world, on the floor). */
  standSpot(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -TABLE.standBack).applyMatrix4(this.root.matrixWorld);
  }

  /** The way she faces standing at it (radians, 0 = +Z). */
  get faceYaw(): number { return this.root.rotation.y; }
}
