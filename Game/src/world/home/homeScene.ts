// ============================================================================
// homeScene.ts -- THE FISHERS' HOME, DRAWN (phase 3 of the AI Brain & Home plan; Joshua, 2026-11-26: "1a – Separate
// Home map initially, then integrate it into the island later... 5a – Automatic futuristic sliding doors"; "I approve
// the proposed procedural house layout"; "Prioritize functionality over detailed decoration initially").
//
// EVERYTHING HERE IS MADE FROM THE LAYOUT (homeLayout.ts `generateHome`), the same plain data the minds and the
// headless household simulation live in: its rooms, its wall pieces, its doorways and its 33 things. Nothing is
// downloaded. A wider or narrower home, or another room list, is drawn the same way.
//
// WHAT IS DRAWN (a BLOCKOUT: plain shapes in a light, futuristic palette; art later):
//   THE FLOORS   one per room, in its room's material (wood in the bedrooms and the living room, white tile in the
//                bathrooms, grey tile in the kitchen, pale grey in the hall and the entry); they take her shadow.
//   THE WALLS    2.7 m high, the outer ones 20 cm thick and the inner ones 12; each piece cut where a WINDOW is (wall
//                under the sill and over the head, glass between) and closed over every sliding door by a lintel;
//                a dark skirting at the floor and a glowing cyan strip near the top, both sides.
//   THE CEILINGS one per room, seen ONLY FROM BELOW (a one-sided plane facing down): in first person and in a low
//                camera they close the room; a camera above the walls looks straight in, a dollhouse.
//                A light panel in each ceiling glows always.
//   THE DOORS    the SLIDING doors (Joshua's 5a): a frosted panel with a glowing edge that slides into the wall
//                beside it (the side with more wall) when anyone comes within `DOOR_NEAR`, and slides shut a second
//                after nobody is near. Shut (under half open) a door is solid.
//   THE THINGS   a simple model of each kind (a bed with its pillows and duvet, a toilet -- the pop-up toilet's own
//                model, standing --, a vanity and mirror, a shower of glass, a fridge, a stove, cabinets, a dining
//                table and chairs, a sofa and armchairs, a wall screen, a desk and chair, wardrobes, an exercise mat).
//   OUTSIDE      a lawn, a path to the front door and a patio by the back door, under the PROCEDURAL SKY with its
//                time of day (the game clock's); the haze hides the lawn's edge. At night a warm light fills the house.
//
// WHAT STOPS HER (`walls`, given to her movement, the same `Walls` the town and the island give): every wall piece,
// every thing on the floor but the mat (each a box turned the way it faces), and a shut door; she is a circle of
// `BODY_RADIUS` (a doorway is 0.9 m wide). WHAT STOPS THE CAMERA (`keepClear`): the walls and shut doors only, a
// little off them; the ceilings do not (above them it looks in).
//
// COST, for the phone: the walls, floors, ceilings and things are MERGED, one draw for each material (about 25),
// plus each door's panel and edge (two each) and the two toilets.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Walls } from '../../input/playerMotion';
import type { ActorId, SmartObject, Vec2 } from '../../mind/types';
import type { GroundPoint } from '../collision';
import { createProceduralSky, type Environment, type ProceduralSky } from '../island/proceduralSky';
import { PopUpToilet } from '../toilet';
import { FISHER_HOME, generateHome, type Doorway, type HomeLayout, type HomeSpec, type RoomKind, type WallPiece } from './homeLayout';
import { HomeNav } from './homeNav';
import { BODY_RADIUS, DUVET_FROM_HEAD, DUVET_TOP, HomeWalls, INNER_THICK, MATTRESS_TOP, OUTER_THICK, PILLOW_TOP, SEAT_TOP, doorBlock, objectBlock, wallBlock, type Block } from './homeBlocks';

/** How high the walls and ceilings are, metres. */
export const WALL_HEIGHT = 2.7;
/** The top of a doorway; a window's sill and head. */
const DOOR_TOP = 2.15, SILL = 0.9, WINDOW_HEAD = 2.15;
/** The beds' and seats' heights (homeBlocks.ts, where a body meets them: the headless simulation uses them too). */
export { DUVET_FROM_HEAD, DUVET_TOP, MATTRESS_TOP, PILLOW_TOP, SEAT_TOP };

/**
 * THE CHAIRS' SEATS AND THE SOFA'S AND ARMCHAIRS' CUSHIONS, their tops over the floor, metres (v0.2.180). Measured with
 * Mary seated by the prompt (her skin over each seat, front to back, every 5 cm): her body sits at its own seat height
 * (fastHeroine.ts `seatFor`), and at the chairs' 0.49 and the cushions' 0.505 her seat went 1.3-2.2 cm and her thighs
 * up to 4.1 cm into them. Now her seat and thighs are within 2 cm of the top (Mary at a 10 % belly 0.1-2.1 cm into it,
 * at 150 % up to 2.9 cm over it at the back of a dining chair, John 1.7 cm into it at most): a cushion gives that much.
 */
const CHAIR_TOP = 0.465, CUSHION_TOP = 0.48;
/** She is a circle this round, seen from above (homeBlocks.ts, where every wall and thing's box is made). */
export { BODY_RADIUS };
/** A sliding door opens when anyone comes this near its middle, and shuts this long after nobody is. GAME TUNING. */
const DOOR_NEAR = 1.8, DOOR_SHUT_AFTER = 1.0;
/** How long a door takes to slide fully open or shut, seconds. */
const DOOR_SECONDS = 0.45;
/** A door less open than this stops her. */
const DOOR_BLOCKS_UNDER = 0.55;
/** The camera keeps this far off a wall, metres. */
const CAMERA_OFF_WALL = 0.15;
/** The lawn reaches this far from the house's middle (she may walk homeBlocks.ts `WALK_OUT` out). */
const LAWN_HALF = 200;

/** Where a character starts, and which way they face. */
export interface HomeStart {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * ONE WALKER'S WALLS: the home's, but the thing they are using now (`ignore`: a seat they sit down on, the bed they get
 * into) is let through, as the walk grid lets them through it (homeNav.ts).
 */
export interface WalkerWalls extends Walls {
  ignore: string | null;
}

/** The drawn home: add `group` to the scene; `update` each frame; `setEnvironment` each frame with the sky's moment. */
export interface HomeScene {
  readonly group: THREE.Group;
  readonly layout: HomeLayout;
  /** what stops her (and anyone walking: her movement asks it where each step ends) */
  readonly walls: Walls;
  /** a walker's own walls (`ignore` set while they use a thing): one for each character */
  walkerWalls(): WalkerWalls;
  /** the walk grid, round the walls and furniture (homeNav.ts) */
  readonly nav: HomeNav;
  /** where each resident starts */
  readonly starts: Readonly<Record<ActorId, HomeStart>>;
  /** the camera kept off the walls: `to` is brought in toward `from` */
  keepClear(from: THREE.Vector3, to: THREE.Vector3): void;
  /** Once a frame: the doors open for whoever is near (`people`: everyone's place on the floor). */
  update(dt: number, people: readonly Vec2[]): void;
  /** The sky's moment (proceduralSky.ts): the sky, the haze, and the house's own light at night. */
  setEnvironment(env: Environment, seconds: number): void;
  /** How open each sliding door is now, 0..1 (for the readout and tests). */
  doorStates(): Record<string, number>;
}

// ---- THE PALETTE (a blockout's: light walls, graphite furniture, cyan accents) -----------------------------------------

function makeMaterials() {
  const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    wall: std(0xeceae6, 0.9),
    skirting: std(0x2b3240, 0.6),
    accent: new THREE.MeshBasicMaterial({ color: 0x4fd8ff }),
    // (a ceiling faces down, away from the sun and the sky: a little light of its own keeps it from reading dark grey)
    ceiling: std(0xf2f4f7, 0.95, 0, { emissive: new THREE.Color(0x6f7277), emissiveIntensity: 1 }),
    ceilingLight: new THREE.MeshBasicMaterial({ color: 0xfff6e6 }),
    glass: std(0xbfe6ff, 0.05, 0, { transparent: true, opacity: 0.22, depthWrite: false }),
    door: std(0xdfe8f1, 0.35, 0.1),
    doorEdge: new THREE.MeshBasicMaterial({ color: 0x4fd8ff }),
    floorWood: std(0xb98c5e, 0.75),
    floorWarm: std(0xc79f72, 0.75),
    floorTile: std(0xdde4ea, 0.4),
    floorKitchen: std(0x9ea7b1, 0.5),
    floorPale: std(0xcfd5dc, 0.7),
    lawn: std(0x4f7d3a, 1),
    concrete: std(0xb7bcc2, 0.95),
    plinth: std(0x3a3f47, 0.9),
    graphite: std(0x353c48, 0.6),
    mattress: std(0xe3e8ee, 0.9),
    pillow: std(0xf6f7f9, 0.9),
    duvetMain: std(0x5b7fa6, 0.85),
    duvetGuest: std(0x7d6aa6, 0.85),
    duvetGuest2: std(0x5f9c84, 0.85),
    sofa: std(0x4a5568, 0.85),
    cushion: std(0x5f6c82, 0.9),
    white: std(0xf1f3f5, 0.35),
    steel: std(0xb9c0c8, 0.3, 0.6),
    blackGlass: std(0x15181d, 0.15, 0.1),
    burner: std(0x3a1a14, 0.4, 0, { emissive: new THREE.Color(0x401008), emissiveIntensity: 0.6 }),
    stone: std(0xd7d4cf, 0.4),
    wood: std(0x8c6a48, 0.6),
    chair: std(0x2f3744, 0.6),
    screen: std(0x05070c, 0.2, 0, { emissive: new THREE.Color(0x0c1830), emissiveIntensity: 1 }),
    // (no reflections in the game to show in a true mirror: a pale, glossy blue-grey reads as glass)
    mirror: std(0xc8d4de, 0.08, 0.2),
    mat: std(0x2bb3a8, 0.9),
    display: new THREE.MeshBasicMaterial({ color: 0x6fe3ff }),
  };
}
type Materials = ReturnType<typeof makeMaterials>;
type MaterialName = keyof Materials;

/** Which floor each kind of room has. */
const FLOOR_OF: Record<RoomKind, MaterialName> = {
  mainBedroom: 'floorWood', bedroom: 'floorWood', living: 'floorWarm', ensuite: 'floorTile', bathroom: 'floorTile',
  kitchen: 'floorKitchen', hall: 'floorPale', entry: 'floorPale',
};

// ---- MERGING: every box of one material becomes one mesh (one draw) -------------------------------------------------

class Batch {
  private readonly parts = new Map<MaterialName, THREE.BufferGeometry[]>();
  private readonly turn = new THREE.Matrix4();
  constructor(private readonly materials: Materials) {}

  /** A box w x h x d, its middle at (x, y, z) in the frame `frame` (the world if none). */
  box(material: MaterialName, w: number, h: number, d: number, x: number, y: number, z: number, frame?: THREE.Matrix4): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    if (frame) g.applyMatrix4(frame);
    this.add(material, g);
  }

  /** A flat disc (a burner, a basin), radius r, h tall, its middle at (x, y, z) in `frame`, stretched `long` along z. */
  disc(material: MaterialName, r: number, h: number, x: number, y: number, z: number, frame?: THREE.Matrix4, long = 1): void {
    const g = new THREE.CylinderGeometry(r, r, h, 20);
    g.scale(1, 1, long);
    g.translate(x, y, z);
    if (frame) g.applyMatrix4(frame);
    this.add(material, g);
  }

  /** A flat rectangle at height y, w along x by d along z, its middle at (x, z), facing down (a ceiling) or up. */
  flat(material: MaterialName, w: number, d: number, x: number, y: number, z: number, down: boolean): void {
    const g = new THREE.PlaneGeometry(w, d);
    g.applyMatrix4(this.turn.makeRotationX(down ? Math.PI / 2 : -Math.PI / 2));
    g.translate(x, y, z);
    this.add(material, g);
  }

  add(material: MaterialName, g: THREE.BufferGeometry): void {
    const list = this.parts.get(material) ?? [];
    list.push(g);
    this.parts.set(material, list);
  }

  /** The merged meshes. `shadowsOn` names the materials whose meshes take shadows. */
  build(group: THREE.Group, shadowsOn: ReadonlySet<MaterialName>): void {
    for (const [name, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.materials[name]);
      mesh.name = `home ${name}`;
      mesh.receiveShadow = shadowsOn.has(name);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
}

// ---- WHAT STOPS HER: boxes turned the way they face ------------------------------------------------------------------
// (homeBlocks.ts: the boxes and a walker's walls are made there, from the layout alone, so the headless household
//  simulation walks into the same chairs and tables)

// ---- THE SLIDING DOORS -------------------------------------------------------------------------------------------------

interface SlidingDoor {
  readonly doorway: Doorway;
  readonly root: THREE.Group;
  readonly panel: THREE.Object3D;
  /** +1 or -1: the way along the wall it slides to open */
  readonly side: number;
  open: number;
  /** seconds since anyone was near */
  lonely: number;
}

// ---- BUILDING IT -------------------------------------------------------------------------------------------------------

/** Makes the home from its room list (the Fishers' by default), its house's south-west corner at `origin`. */
export function createHomeScene(spec: HomeSpec = FISHER_HOME, origin: Vec2 = { x: -8, z: -6 }): HomeScene {
  const layout = generateHome(spec, origin);
  const M = makeMaterials();
  const batch = new Batch(M);
  const group = new THREE.Group();
  group.name = 'home';
  const blocks: Block[] = [];
  const W = layout.size.w, D = layout.size.d;
  const middle: Vec2 = { x: origin.x + W / 2, z: origin.z + D / 2 };

  // ---- 1. OUTSIDE: the lawn, the plinth under the house, a path to the front door, a patio by the back door -------
  batch.flat('lawn', LAWN_HALF * 2, LAWN_HALF * 2, middle.x, -0.03, middle.z, false);
  batch.box('plinth', W + 0.6, 0.06, D + 0.6, middle.x, -0.03, middle.z);
  const frontDoor = layout.doors.find((d) => d.id === 'front-door');
  if (frontDoor) batch.box('concrete', 1.8, 0.04, 7, frontDoor.at.x, -0.01, frontDoor.at.z - 3.8);
  const backDoor = layout.doors.find((d) => d.id === 'back-door');
  if (backDoor) batch.box('concrete', 4, 0.04, 3.2, backDoor.at.x + 2.3, -0.01, backDoor.at.z);

  // ---- 2. FLOORS AND CEILINGS, one each a room (a ceiling light panel in each) ----------------------------------------
  for (const room of layout.rooms) {
    const r = room.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    batch.flat(FLOOR_OF[room.kind], w, d, cx, 0.002, cz, false);
    batch.flat('ceiling', w, d, cx, WALL_HEIGHT, cz, true);
    const lw = Math.min(1.2, w * 0.45), ld = Math.min(1.2, d * 0.45);
    batch.flat('ceilingLight', lw, ld, cx, WALL_HEIGHT - 0.01, cz, true);
  }

  // ---- 3. THE WALLS: each piece cut round its windows; a lintel over every sliding door ------------------------------
  const windows = layout.objects.filter((o) => o.type === 'window');
  const wallPiece = (p: WallPiece): void => {
    const thick = p.outer ? OUTER_THICK : INNER_THICK;
    const alongX = Math.abs(p.a.z - p.b.z) < 1e-6;
    const lo = alongX ? Math.min(p.a.x, p.b.x) : Math.min(p.a.z, p.b.z), hi = alongX ? Math.max(p.a.x, p.b.x) : Math.max(p.a.z, p.b.z);
    const line = alongX ? p.a.z : p.a.x;
    // (a box on this line from s0 to s1, from height y0 to y1, `t` thick)
    const piece = (mat: MaterialName, s0: number, s1: number, y0: number, y1: number, t: number): void => {
      const len = s1 - s0, mid = (s0 + s1) / 2;
      if (len <= 1e-4) return;
      if (alongX) batch.box(mat, len, y1 - y0, t, mid, (y0 + y1) / 2, line);
      else batch.box(mat, t, y1 - y0, len, line, (y0 + y1) / 2, mid);
    };
    // (the windows on this piece, along it)
    const spans = windows
      .filter((o) => (alongX ? Math.abs(o.at.z - line) < 0.2 && o.at.x > lo && o.at.x < hi : Math.abs(o.at.x - line) < 0.2 && o.at.z > lo && o.at.z < hi))
      .map((o) => { const c = alongX ? o.at.x : o.at.z; return [Math.max(lo, c - o.size.w / 2), Math.min(hi, c + o.size.w / 2)] as const; })
      .sort((a, b) => a[0] - b[0]);
    let from = lo;
    for (const [a, b] of spans) {
      piece('wall', from, a, 0, WALL_HEIGHT, thick);
      piece('skirting', from, a, 0, 0.08, thick + 0.012);
      piece('wall', a, b, 0, SILL, thick);
      piece('wall', a, b, WINDOW_HEAD, WALL_HEIGHT, thick);
      piece('glass', a, b, SILL, WINDOW_HEAD, 0.02);
      piece('skirting', a, b, 0, 0.08, thick + 0.012);
      from = b;
    }
    piece('wall', from, hi, 0, WALL_HEIGHT, thick);
    piece('skirting', from, hi, 0, 0.08, thick + 0.012);
    piece('accent', lo, hi, 2.47, 2.5, thick + 0.012);
    // (what stops her: the whole piece, windows and all, and the camera)
    blocks.push(wallBlock(p));
  };
  for (const p of layout.walls) wallPiece(p);

  // ---- 4. THE SLIDING DOORS (Joshua's 5a): a lintel over each, the panel sliding into the wall with more room -------
  const doors: SlidingDoor[] = [];
  /** How much straight wall runs on from (s) along this line in the direction `dir` (metres; stops at a gap). */
  const wallRun = (alongX: boolean, line: number, s: number, dir: number): number => {
    let at = s;
    for (let k = 0; k < 20; k++) {
      const next = layout.walls.find((w) => {
        const wx = Math.abs(w.a.z - w.b.z) < 1e-6;
        if (wx !== alongX || Math.abs((wx ? w.a.z : w.a.x) - line) > 1e-6) return false;
        const lo = wx ? Math.min(w.a.x, w.b.x) : Math.min(w.a.z, w.b.z), hi = wx ? Math.max(w.a.x, w.b.x) : Math.max(w.a.z, w.b.z);
        return dir > 0 ? Math.abs(lo - at) < 1e-3 : Math.abs(hi - at) < 1e-3;
      });
      if (!next) break;
      const wx = Math.abs(next.a.z - next.b.z) < 1e-6;
      at = dir > 0 ? (wx ? Math.max(next.a.x, next.b.x) : Math.max(next.a.z, next.b.z)) : (wx ? Math.min(next.a.x, next.b.x) : Math.min(next.a.z, next.b.z));
    }
    return Math.abs(at - s);
  };
  for (const dw of layout.doors.filter((d) => d.kind === 'sliding')) {
    const alongX = dw.along === 'x';
    const outer = dw.rooms.includes('outside');
    const thick = outer ? OUTER_THICK : INNER_THICK;
    const line = alongX ? dw.at.z : dw.at.x, c = alongX ? dw.at.x : dw.at.z;
    // (the lintel over it, and the glowing strip carried across it)
    if (alongX) {
      batch.box('wall', dw.width, WALL_HEIGHT - DOOR_TOP, thick, c, (DOOR_TOP + WALL_HEIGHT) / 2, line);
      batch.box('accent', dw.width, 0.03, thick + 0.012, c, 2.485, line);
    } else {
      batch.box('wall', thick, WALL_HEIGHT - DOOR_TOP, dw.width, line, (DOOR_TOP + WALL_HEIGHT) / 2, c);
      batch.box('accent', thick + 0.012, 0.03, dw.width, line, 2.485, c);
    }
    // (which way it slides: into the side with more wall beside it)
    const plus = wallRun(alongX, line, c + dw.width / 2, 1), minus = wallRun(alongX, line, c - dw.width / 2, -1);
    const side = plus >= minus ? 1 : -1;
    // (in the door's own frame: along a wall that runs along z its x runs toward -z, so the slide turns round)
    const localSide = alongX ? side : -side;
    const root = new THREE.Group();
    root.name = `door ${dw.id}`;
    root.position.set(dw.at.x, 0, dw.at.z);
    // (its own x along the wall: a wall along z turns it a quarter turn, its x then running toward -z)
    root.rotation.y = alongX ? 0 : Math.PI / 2;
    const panel = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(dw.width, DOOR_TOP - 0.01, 0.045), M.door);
    slab.position.y = (DOOR_TOP - 0.01) / 2;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.025, DOOR_TOP - 0.15, 0.05), M.doorEdge);
    // (the glowing edge on the side that leads as it shuts: away from the way it slides)
    edge.position.set(-localSide * (dw.width / 2 - 0.04), DOOR_TOP / 2, 0);
    panel.add(slab, edge);
    root.add(panel);
    group.add(root);
    // (shut at the start: as if nobody had been near for a long while)
    const door: SlidingDoor = { doorway: dw, root, panel, side: localSide, open: 0, lonely: 99 };
    doors.push(door);
    // (a shut door stops her, and the camera)
    blocks.push(doorBlock(dw, () => door.open < DOOR_BLOCKS_UNDER));
  }

  // ---- 5. THE THINGS, each in its own frame: +Z the way it faces, x across it, its middle on the floor --------------
  const toilets: PopUpToilet[] = [];
  let guestBeds = 0;
  for (const o of layout.objects) {
    const frame = new THREE.Matrix4().makeRotationY(o.facing).setPosition(o.at.x, 0, o.at.z);
    const w = o.size.w, d = o.size.d;
    let solid = true;
    switch (o.type) {
      case 'bed': {
        const double = o.tags?.includes('double') ?? false;
        const duvet: MaterialName = double ? 'duvetMain' : guestBeds++ % 2 === 0 ? 'duvetGuest' : 'duvetGuest2';
        batch.box('graphite', w, MATTRESS_TOP - 0.2, d, 0, (MATTRESS_TOP - 0.2) / 2, 0, frame);
        batch.box('mattress', w - 0.08, 0.2, d - 0.12, 0, MATTRESS_TOP - 0.1, 0.02, frame);
        batch.box(duvet, w - 0.02, 0.07, d - DUVET_FROM_HEAD - 0.04, 0, DUVET_TOP - 0.035, (DUVET_FROM_HEAD - 0.04) / 2, frame);
        for (const x of double ? [-w / 4, w / 4] : [0]) batch.box('pillow', double ? w / 2 - 0.16 : w - 0.25, 0.12, 0.36, x, PILLOW_TOP - 0.06, -d / 2 + 0.3, frame);
        batch.box('graphite', w + 0.04, 1.05, 0.08, 0, 0.525, -d / 2 - 0.02, frame);
        batch.box('accent', w - 0.1, 0.02, 0.01, 0, 0.98, -d / 2 + 0.025, frame);
        break;
      }
      case 'toilet': {
        // (the pop-up toilet's own model, standing: its frame's middle is the floor under the sitter's hips, 6 cm in
        //  front of the toilet's middle)
        const t = new PopUpToilet();
        t.show(o.at.x + Math.sin(o.facing) * 0.06, 0, o.at.z + Math.cos(o.facing) * 0.06, o.facing, SEAT_TOP);
        for (let k = 0; k < 4; k++) t.update(0.2);
        t.inUse = false;
        group.add(t.root);
        toilets.push(t);
        break;
      }
      case 'shower':
        batch.box('white', w, 0.06, d, 0, 0.03, 0, frame);
        batch.box('glass', w, 2.0, d, 0, 1.06, 0, frame);
        batch.disc('steel', 0.1, 0.03, 0, 2.05, -d / 2 + 0.25, frame);
        break;
      case 'sink': {
        const kitchen = o.room === 'kitchen';
        batch.box(kitchen ? 'graphite' : 'white', w, 0.82, d, 0, 0.41, 0, frame);
        batch.box('stone', w + 0.02, 0.04, d + 0.02, 0, 0.84, 0, frame);
        batch.disc(kitchen ? 'steel' : 'white', Math.min(w, d) * 0.32, 0.06, 0, 0.865, 0.02, frame, kitchen ? 1 : 1.25);
        batch.box('steel', 0.03, 0.2, 0.03, 0, 0.96, -d / 2 + 0.08, frame);
        if (!kitchen) batch.box('mirror', w * 0.95, 0.75, 0.02, 0, 1.55, -d / 2 + 0.05, frame);
        break;
      }
      case 'fridge':
        batch.box('steel', w, 1.85, d, 0, 0.925, 0, frame);
        batch.box('graphite', 0.03, 0.9, 0.04, w / 2 - 0.08, 1.15, d / 2 + 0.02, frame);
        batch.box('display', 0.14, 0.08, 0.01, -w / 4, 1.45, d / 2 + 0.006, frame);
        break;
      case 'stove':
        batch.box('white', w, 0.88, d, 0, 0.44, 0, frame);
        batch.box('blackGlass', w, 0.03, d, 0, 0.895, 0, frame);
        for (const [x, z] of [[-w / 4, -d / 4], [w / 4, -d / 4], [-w / 4, d / 4], [w / 4, d / 4]] as const) batch.disc('burner', 0.08, 0.006, x, 0.913, z, frame);
        break;
      case 'cabinet':
      case 'counter':
        batch.box(o.type === 'cabinet' ? 'graphite' : 'white', w, 0.86, d, 0, 0.43, 0, frame);
        batch.box('stone', w + 0.02, 0.04, d + 0.02, 0, 0.88, 0, frame);
        break;
      case 'diningTable':
        batch.box('wood', w, 0.04, d, 0, 0.74, 0, frame);
        for (const [x, z] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]] as const) {
          batch.box('graphite', 0.05, 0.72, 0.05, x, 0.36, z, frame);
        }
        break;
      case 'diningChair':
      case 'deskChair': {
        // (the seat's top at CHAIR_TOP, where her seat and thighs rest: measured, v0.2.180)
        const s = Math.min(w, d);
        batch.box('chair', s, 0.06, s, 0, CHAIR_TOP - 0.03, 0, frame);
        batch.box('chair', s, 0.48, 0.05, 0, 0.72, -s / 2 + 0.025, frame);
        for (const [x, z] of [[-s / 2 + 0.03, -s / 2 + 0.03], [s / 2 - 0.03, -s / 2 + 0.03], [-s / 2 + 0.03, s / 2 - 0.03], [s / 2 - 0.03, s / 2 - 0.03]] as const) {
          batch.box('graphite', 0.03, CHAIR_TOP - 0.06, 0.03, x, (CHAIR_TOP - 0.06) / 2, z, frame);
        }
        break;
      }
      case 'desk':
        batch.box('wood', w, 0.04, d, 0, 0.74, 0, frame);
        for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) batch.box('graphite', 0.04, 0.72, d - 0.04, x, 0.36, 0, frame);
        break;
      case 'wardrobe':
        batch.box('white', w, 2.1, d, 0, 1.05, 0, frame);
        batch.box('graphite', 0.015, 1.95, 0.01, 0, 1.05, d / 2 + 0.005, frame);
        for (const x of [-0.06, 0.06]) batch.box('steel', 0.02, 0.3, 0.03, x, 1.1, d / 2 + 0.015, frame);
        break;
      case 'screen':
        batch.box('graphite', w + 0.06, 1.2, 0.05, 0, 1.45, -d / 2 + 0.03, frame);
        batch.box('screen', w, 1.12, 0.012, 0, 1.45, -d / 2 + 0.06, frame);
        batch.box('accent', w * 0.7, 0.015, 0.02, 0, 0.82, -d / 2 + 0.05, frame);
        break;
      case 'sofa':
      case 'armchair': {
        const seats = o.type === 'sofa' ? 3 : 1, arm = 0.18;
        batch.box('sofa', w, 0.42, d, 0, 0.21, 0, frame);
        const sw = (w - 2 * arm) / seats;
        // (the cushions' tops at CUSHION_TOP, where a body's seat and thighs rest: measured, v0.2.180)
        for (let k = 0; k < seats; k++) batch.box('cushion', sw - 0.04, 0.12, d - 0.26, -w / 2 + arm + sw * (k + 0.5), CUSHION_TOP - 0.06, 0.1, frame);
        batch.box('sofa', w, 0.5, 0.22, 0, 0.67, -d / 2 + 0.11, frame);
        for (const x of [-w / 2 + arm / 2, w / 2 - arm / 2]) batch.box('sofa', arm, 0.62, d, x, 0.31, 0, frame);
        break;
      }
      case 'floorSpot':
        batch.box('mat', 0.7, 0.012, 1.7, 0, 0.006, 0, frame);
        solid = false;
        break;
      case 'window':
        // (drawn in its wall: glass between the sill and the head)
        solid = false;
        break;
    }
    if (solid) blocks.push(objectBlock(o));
  }

  batch.build(group, new Set<MaterialName>(['floorWood', 'floorWarm', 'floorTile', 'floorKitchen', 'floorPale', 'lawn', 'concrete', 'mattress', 'duvetMain', 'duvetGuest', 'duvetGuest2', 'cushion', 'wood', 'stone']));
  // (the glass after everything solid, so what is behind it is drawn first)
  for (const child of group.children) if ((child as THREE.Mesh).material === M.glass) child.renderOrder = 10;

  // ---- 6. THE SKY, THE HAZE, AND THE HOUSE'S OWN LIGHT AT NIGHT --------------------------------------------------------
  const sky: ProceduralSky = createProceduralSky();
  group.add(sky.mesh);
  const houseLight = new THREE.AmbientLight(0xfff1e0, 0.45);
  group.add(houseLight);

  // ---- 7. WHERE THEY START: each resident's spawn, facing west (the living room's screen) ------------------------------
  const starts: Record<ActorId, HomeStart> = {};
  for (const [who, p] of Object.entries(layout.spawns)) starts[who] = { x: p.x, z: p.z, yaw: -Math.PI / 2 };

  const walls = new HomeWalls(blocks, middle, layout.objects);
  const viewBlocks = blocks.filter((b) => b.view);
  // (the walk grid over the house and half a metre round it)
  const nav = new HomeNav(blocks, { x0: origin.x - 0.5, z0: origin.z - 0.5, x1: origin.x + W + 0.5, z1: origin.z + D + 0.5 }, BODY_RADIUS, layout.objects);
  return {
    group,
    layout,
    walls,
    nav,
    walkerWalls: () => new HomeWalls(blocks, middle, layout.objects),
    starts,
    keepClear(from, to) {
      // (a ray from the point the camera looks from to the camera, against each wall's box, grown by CAMERA_OFF_WALL
      //  and TALL WITHOUT END: the follow camera's pivot stands over her head, 3.3 m up, above the walls' tops, and a
      //  line from it passed over the wall and left the camera in the next room. The nearest hit brings the camera in
      //  to it. A box the ray starts inside is passed by.)
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      let near = 1;
      for (const b of viewBlocks) {
        if (b.solid && !b.solid()) continue;
        // (walls are never turned: an axis-aligned box)
        const hx = (b.cos > 0.5 ? b.hx : b.hz) + CAMERA_OFF_WALL, hz = (b.cos > 0.5 ? b.hz : b.hx) + CAMERA_OFF_WALL;
        if (Math.abs(from.x - b.cx) < hx && Math.abs(from.z - b.cz) < hz) continue;
        let t0 = 0, t1 = near;
        const slab = (o: number, dd: number, lo: number, hi: number): boolean => {
          if (Math.abs(dd) < 1e-9) return o >= lo && o <= hi;
          let a = (lo - o) / dd, c = (hi - o) / dd;
          if (a > c) { const s = a; a = c; c = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c);
          return t0 <= t1;
        };
        if (slab(from.x, dx, b.cx - hx, b.cx + hx) && slab(from.z, dz, b.cz - hz, b.cz + hz) && t0 < near) near = t0;
      }
      if (near < 1) to.set(from.x + dx * near, from.y + dy * near, from.z + dz * near);
    },
    update(dt, people) {
      for (const door of doors) {
        const near = people.some((p) => Math.hypot(p.x - door.doorway.at.x, p.z - door.doorway.at.z) < DOOR_NEAR);
        door.lonely = near ? 0 : door.lonely + dt;
        const want = near || door.lonely < DOOR_SHUT_AFTER ? 1 : 0;
        if (door.open !== want) {
          door.open = want > door.open ? Math.min(1, door.open + dt / DOOR_SECONDS) : Math.max(0, door.open - dt / DOOR_SECONDS);
          // (eased: quick at first, settling into the wall)
          const e = 1 - Math.pow(1 - door.open, 2);
          door.panel.position.x = door.side * e * (door.doorway.width - 0.06);
        }
      }
      for (const t of toilets) t.update(dt);
    },
    setEnvironment(env, seconds) {
      sky.update(env, seconds);
      // (a soft light indoors by day, the walls' faces away from the sun not left grey-blue; warmer and stronger at
      //  night, when the house's own lights are what lights it)
      houseLight.intensity = 0.45 + 0.7 * env.night;
    },
    doorStates() {
      const out: Record<string, number> = {};
      for (const d of doors) out[d.doorway.id] = +d.open.toFixed(2);
      return out;
    },
  };
}

/** (for tests: the furniture a layout lays out, by type) */
export function thingsByType(layout: HomeLayout): Record<string, SmartObject[]> {
  const out: Record<string, SmartObject[]> = {};
  for (const o of layout.objects) (out[o.type] ??= []).push(o);
  return out;
}
