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
import { CLIP, createClip } from '../heroine/guns';

const inverse = new THREE.Matrix4();

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
  standIn: -0.19,
  standTall: 0.07,
  /** Where she stands to use it: this far back from the table's middle. */
  standBack: 0.62,
  /** How close she must be (from her standing spot) for the table's buttons to show, metres. */
  near: 2.2,
  /**
   * THE AMMO (Joshua, 2026-11-17): a rack of full clips standing in a row between the gun stands, and a tray for the
   * empties in front of it. Where they are (side to side, into the table), how many slots the rack has, how many
   * empties the tray keeps (the oldest goes), and how long an emptied rack slot takes to fill again, seconds.
   */
  rackIn: -0.2,
  rackSlots: [-0.04, 0, 0.04] as readonly number[],
  trayIn: -0.06,
  trayKeeps: 6,
  refillSeconds: 2,
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
  private readonly rackBase: THREE.Mesh;
  private readonly tray: THREE.Mesh;
  /** The clips: the full ones standing in the rack (null: that slot is waiting to fill), the empties in the tray. */
  private readonly rack: (THREE.Mesh | null)[] = [];
  private readonly refillIn: number[] = [];
  private readonly empties: THREE.Object3D[] = [];
  private readonly clipMaterials: THREE.Material[];

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
    this.rackBase = box(0.14, 0.015, 0.05, dark);
    this.tray = box(0.16, 0.02, 0.09, new THREE.MeshStandardMaterial({ color: 0x2c3442, metalness: 0.4, roughness: 0.6 }));
    // (the clips look like the guns' own: the same two colours)
    this.clipMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.45, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xff2fb0, emissive: 0xff2fb0, emissiveIntensity: 0.8, roughness: 0.4 }),
    ];
    this.setHeight(height);
    for (let i = 0; i < TABLE.rackSlots.length; i++) { this.rack.push(null); this.refillIn.push(0); this.fillSlot(i); }
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
    this.rackBase?.position.set(0, height + 0.0075, TABLE.rackIn);
    this.tray?.position.set(0, height + 0.01, TABLE.trayIn);
    this.root.updateMatrixWorld(true);
    // (the clips in the rack and the tray go up and down with it)
    this.rack?.forEach((clip, i) => { if (clip) this.rackSlot(i, clip.matrix).premultiply(inverse.copy(this.root.matrixWorld).invert()); });
    this.empties?.forEach((clip, n) => this.trayLocal(n, clip.matrix));
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

  // ---- THE AMMO ----------------------------------------------------------------------------------------------------

  /** A full clip standing in rack slot `i`, as a clip's world matrix (upright, its base down, like a gun's). */
  rackSlot(i: number, out: THREE.Matrix4): THREE.Matrix4 {
    out.makeTranslation(TABLE.rackSlots[i], this.heightNow + 0.015 + CLIP.height / 2 + 0.004, TABLE.rackIn);
    return out.premultiply(this.root.matrixWorld);
  }

  /** The first rack slot holding a clip, or -1 if all are waiting to fill. */
  fullSlot(): number { return this.rack.findIndex((clip) => clip !== null); }

  /** Take the clip out of rack slot `i` (it is handed over: the slot fills again after `refillSeconds`). */
  takeFromRack(i: number): THREE.Mesh | null {
    const clip = this.rack[i];
    this.rack[i] = null;
    this.refillIn[i] = TABLE.refillSeconds;
    return clip;
  }

  /** Where the next empty clip goes in the tray, as a clip's world matrix (lying on its side). */
  trayPose(out: THREE.Matrix4): THREE.Matrix4 {
    return this.trayLocal(this.empties.length % TABLE.trayKeeps, out).premultiply(this.root.matrixWorld);
  }

  /** The full clip standing in a rack slot (null: that slot is waiting to fill). */
  rackClip(i: number): THREE.Object3D | null { return this.rack[i] ?? null; }

  /** An empty clip put in the tray (the oldest goes once there are `trayKeeps`). */
  dropInTray(clip: THREE.Object3D): void {
    if (this.empties.length >= TABLE.trayKeeps) {
      const oldest = this.empties.shift()!;
      oldest.removeFromParent();
      (oldest as THREE.Mesh).geometry?.dispose();
      this.empties.forEach((c, n) => this.trayLocal(n, c.matrix));
    }
    this.root.add(clip);
    clip.matrixAutoUpdate = false;
    this.trayLocal(this.empties.length, clip.matrix);
    this.empties.push(clip);
  }

  /** Once a frame: emptied rack slots fill again. */
  update(dt: number): void {
    for (let i = 0; i < this.rack.length; i++) {
      if (this.rack[i] || (this.refillIn[i] -= dt) > 0) continue;
      this.fillSlot(i);
    }
  }

  private fillSlot(i: number): void {
    const clip = createClip(this.clipMaterials);
    this.root.add(clip);
    this.root.updateMatrixWorld(true);
    this.rackSlot(i, clip.matrix).premultiply(inverse.copy(this.root.matrixWorld).invert());
    // (its place in the world worked out NOW: a clip's matrix is set by hand, and three.js does not work out its world
    //  place again on its own. A refilled clip was drawn at the table's foot, on the floor, and a hand that took it
    //  carried it from there: her arm went up over her head with the reload's second clip. Joshua, 2026-11-18.)
    clip.updateMatrixWorld(true);
    this.rack[i] = clip;
  }

  /** The n-th place in the tray, in the table's own frame: clips lying on their sides, side by side. */
  private trayLocal(n: number, out: THREE.Matrix4): THREE.Matrix4 {
    return out.makeRotationZ(Math.PI / 2).setPosition(-0.06 + (n % TABLE.trayKeeps) * 0.024, this.heightNow + 0.02 + CLIP.width / 2, TABLE.trayIn);
  }

  /**
   * Where she stands to use the table (world, on the floor): `standBack` from its middle, or further if her belly
   * stands out more than that leaves room for (`bellyAhead`, metres in front of her middle; 2 cm to spare).
   */
  standSpot(out: THREE.Vector3, bellyAhead = 0): THREE.Vector3 {
    const back = Math.max(TABLE.standBack, TABLE.depth / 2 + bellyAhead + 0.02);
    return out.set(0, 0, -back).applyMatrix4(this.root.matrixWorld);
  }

  /** The face of its top nearest her, for her body to keep off: a point on it, its outward direction, its height. */
  nearFace(point: THREE.Vector3, outward: THREE.Vector3): { point: THREE.Vector3; outward: THREE.Vector3; top: number } {
    point.set(0, this.heightNow, -TABLE.depth / 2).applyMatrix4(this.root.matrixWorld);
    outward.set(0, 0, -1).transformDirection(this.root.matrixWorld);
    return { point, outward, top: this.heightNow };
  }

  /** The way she faces standing at it (radians, 0 = +Z). */
  get faceYaw(): number { return this.root.rotation.y; }
}
