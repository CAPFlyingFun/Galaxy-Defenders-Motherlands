// ============================================================================
// islandWorld.ts -- the island map, put together: its tiles round her, the
// coarse far island, the sea and the daytime sky, and what stops her.
//
// Joshua, 2026-11-19: "import the real island map from either Beyond
// Extinction, or the TRADDOMIUM, and get it set up and working"; "true scale
// just like Beyond Extinction"; spawn "near the beach like Beyond Extinction";
// the domed town is kept as its own test map until its place on the island is
// chosen. The map is chosen in Settings -> WORLD -> Map (or ?map=island|town).
//
// THE GAME'S CENTRE (0, 0) is her arrival point, Beyond Extinction's: the
// Wailua beach on the east coast, about 65 m in from the water, facing inland
// (west), the sea behind her. Heights are metres above the sea, so she stands
// at about 1.2 m there.
//
// The files (public/island/) were copied from Beyond Extinction's web version;
// see public/island/COPIED_FROM.md. Since v0.2.150 the ground is read from its
// tiles cut into 16 x 16 of 3.5 km (kauai/height16/, manifest16.json: made by
// scripts/make_island_tiles16.py, every height unchanged).
//
// THE GENTLE START (v0.2.150; Joshua, 2026-11-22: "make the current location
// island tile load first and the rest actually in the game not before"): before
// play only the tile she stands on is loaded (`ready`); once she is playing
// (`startStreaming`, from main.ts as play begins) the tiles round her come in one
// at a time, nearest first (tileStreamer.ts), the river and lake water is built
// a chunk a frame as its ground comes in (hydro.ts), and the forest starts
// loading only once all the tiles round her are in (trees.ts `begin`).
//
// SETTINGS -> WORLD, v0.2.166 (Joshua, 2026-11-24, the island plan):
//  - GROUND: Solid colours (the default: his approved palette, no pictures)
//    or Textures (Beyond Extinction's pictures, as before). Live: groundPaint.ts.
//  - ISLAND GRID: 8 x 8, 16 x 16 (the default), 32 x 32 or 64 x 64 tiles, the
//    same heights cut smaller (kauai/height32/, height64/:
//    scripts/make_island_tiles_n.py), to compare. Changing it restarts.
//  - RIVERS & LAKES: off by default ("Don't draw for now as the island
//    waterways are still messed up"): no water and no channels cut into the
//    ground, the real valleys left as the land has them. The code stays, for
//    the island's own lakes later. Changing it restarts.
// ============================================================================
import * as THREE from 'three';
import type { GroundPoint } from '../collision';
import type { Walls } from '../../input/playerMotion';
import { createGroundPaint, type GroundKind, type GroundMode } from './groundPaint';
import { TileStreamer, type IslandManifest } from './tileStreamer';
import { createFarIsland } from './farIsland';
import { createOcean, WATER_Y, type Ocean } from './ocean';
import { CarveData } from './carve';
import { KauaiHydro } from './hydro';
import { IslandTrees } from './trees';
import { createSkyPicture, type SkyPicture } from './skyPicture';
import type { Landscaping } from './treeObjects';

/** The arrival point in the island's own metres (Beyond Extinction's spawn, from its manifest). */
const ARRIVAL = { x: 21290, z: 1288 };
/** She faces inland at the start: west (radians about Y, 0 = +Z, so -X is -PI/2). */
export const ARRIVAL_FACING = -Math.PI / 2;

/**
 * WHAT STOPS HER on the island (GAME TUNING):
 *   the sea past wading depth: she wades in up to her knees, no further (no swimming yet);
 *   ground too steep to walk up: a slope of more than this many metres up for each metre across (about 50 degrees).
 * Going DOWN anything is allowed (she is never trapped at the top of a slope).
 */
const WADE_DEPTH = 0.6;
const STEEPEST_UP = 1.2;
/** A step is checked in pieces no longer than this, metres, so she cannot skip over a cliff edge. */
const PIECE = 0.5;
/**
 * IN A RIVER OR LAKE deeper than this (metres), she does not walk along the bottom: she stands this far down in the
 * water, her head and shoulders out, as if treading water (no swimming yet: Joshua, 2026-11-19, the waterways first).
 * The sea is different: past her knees it stops her (WADE_DEPTH), so she cannot set off from the island.
 */
const STAND_IN_WATER = 1.25;

/** The haze: none up to here, the far coast fades into it by there (metres from the camera). */
const FOG_NEAR = 3000;
const FOG_FAR = 16000;
/** Her body's radius for bumping into a tree's trunk, metres (GAME TUNING). */
const BODY_RADIUS = 0.25;

/** The haze's colour, and the sky's colour behind the picture until it arrives. */
const HAZE = 0xbcc6cc;

export interface IslandWorld {
  /** Everything the island draws: add this to the scene (the sky and haze are set on the scene itself). */
  readonly group: THREE.Group;
  /** What stops her (the sea past her knees, slopes too steep): hand this to her motion. */
  readonly walls: Walls;
  /** The way she faces when she arrives (inland, the sea behind her), radians about Y. */
  readonly arrivalFacing: number;
  /** The height of the ground at a place, metres (NaN if that tile is not loaded). */
  groundAt(x: number, z: number): number;
  /**
   * Where her feet are at a place: the ground, or in a river or lake deeper than STAND_IN_WATER, that far under its
   * surface (she is in the water to her shoulders). NaN if that tile is not loaded.
   */
  standAt(x: number, z: number): number;
  /** The surface of a river or lake at a place, metres (null where there is none). */
  waterAt(x: number, z: number): number | null;
  /** The sea's surface, metres (the game's height, as the ground's). */
  readonly seaLevel: number;
  /** Wait until the tile she stands on at (x, z) is loaded (v0.2.150: that tile only), telling `say` when it is. */
  ready(x: number, z: number, say: (done: number, of: number) => void): Promise<void>;
  /** She is playing: the rest of the tiles round her, the water and the forest may come in now (v0.2.150). */
  startStreaming(): void;
  /** The forest, for the readout: trees drawn and in how many draws. */
  treeCounts(): { trees: number; draws: number } | null;
  /** Settings -> WORLD -> Landscaping, live (treeObjects.ts). */
  setLandscaping(mode: Landscaping): void;
  /** Settings -> WORLD -> Ground, live: Solid colours or Textures (groundPaint.ts). */
  setGround(mode: GroundMode): void;
  /** TEST TOOLS -> Ground colours: a kind's base (0) or accent (1) colour, live on every tile. */
  setGroundColour(kind: GroundKind, which: 0 | 1, hex: string): void;
  /** The grid the island was opened with (tiles across), for the readout. */
  readonly grid: number;
  /** Every frame: tiles follow her, the sea follows the camera. */
  update(seconds: number, herX: number, herZ: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** The ground she cannot walk onto: the sea past her knees, and steep slopes going up. */
class IslandWalls implements Walls {
  /**
   * @param groundAt  the ground itself (for the sea's depth)
   * @param standAt   where her feet go (the ground, or held up in a deep river or lake): for slopes
   */
  /**
   * @param trunkAt   is a tree's trunk in the way of her body here (the 3D trees' solid trunks: treeObjects.ts)
   */
  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly standAt: (x: number, z: number) => number,
    private readonly trunkAt: (x: number, z: number) => boolean = () => false,
  ) {}

  /** Can she step from (ax, az) to (bx, bz)? */
  private allowed(ax: number, az: number, bx: number, bz: number): boolean {
    const ground = this.groundAt(bx, bz);
    if (Number.isNaN(ground)) return false;         // (no ground loaded there yet)
    if (ground < WATER_Y - WADE_DEPTH) return false; // the sea, too deep
    // a tree's trunk (she slides round it, as along the water's edge); never stuck in one she is already inside
    if (this.trunkAt(bx, bz) && !this.trunkAt(ax, az)) return false;
    const to = this.standAt(bx, bz);
    const from = this.standAt(ax, az);
    const across = Math.hypot(bx - ax, bz - az);
    return Number.isNaN(from) || across < 1e-6 || (to - from) / across <= STEEPEST_UP;
  }

  move(x: number, z: number, stepX: number, stepZ: number, out: GroundPoint): GroundPoint {
    out.x = x;
    out.z = z;
    const pieces = Math.max(1, Math.ceil(Math.hypot(stepX, stepZ) / PIECE));
    const px = stepX / pieces, pz = stepZ / pieces;
    for (let i = 0; i < pieces; i++) {
      // the whole piece if she can; otherwise only its east-west or north-south part (she slides along the
      // water's edge or a cliff foot instead of sticking to it); otherwise she stops there
      if (this.allowed(out.x, out.z, out.x + px, out.z + pz)) { out.x += px; out.z += pz; }
      else if (Math.abs(px) > 1e-9 && this.allowed(out.x, out.z, out.x + px, out.z)) out.x += px;
      else if (Math.abs(pz) > 1e-9 && this.allowed(out.x, out.z, out.x, out.z + pz)) out.z += pz;
      else break;
    }
    return out;
  }
}

/**
 * Open the island. `base` is where its files are (the game's address + "island/"); `scene` gets the daytime sky
 * picture and the haze. Waits for the list of tiles and the far island; the tiles round her load after (`ready`).
 */
/** What Settings -> WORLD says about the island (see the top of this file). */
export interface IslandOptions {
  landscaping?: Landscaping;
  ground?: GroundMode;
  /** Tiles across: 8, 16, 32 or 64 (16 by default). */
  grid?: number;
  rivers?: boolean;
}

/** The list of tiles for each grid (8 x 8 is Beyond Extinction's own manifest). */
const MANIFEST_OF: Record<number, string> = { 8: 'manifest.json', 16: 'manifest16.json', 32: 'manifest32.json', 64: 'manifest64.json' };

export async function createIslandWorld(base: string, scene: THREE.Scene, options: IslandOptions = {}): Promise<IslandWorld> {
  const origin = new THREE.Vector2(ARRIVAL.x, ARRIVAL.z);
  const grid = MANIFEST_OF[options.grid ?? 16] ? options.grid ?? 16 : 16;
  // (the list of tiles first, then the ground's paint: Textures fetches its pictures one at a time, Solid colours none)
  const manifest = await fetch(`${base}kauai/${MANIFEST_OF[grid]}`).then((r) => r.json() as Promise<IslandManifest>);
  const paint = await createGroundPaint(base, options.ground ?? 'colours');
  const group = new THREE.Group();
  group.name = 'island';
  // the rivers and lakes (when on): fetched at once (the tiles wait for them, to cut their channels in: carve.ts)
  const rivers = options.rivers === true;
  const carve = rivers ? new CarveData(base) : null;
  if (carve) void carve.prefetch();
  const tiles = new TileStreamer(manifest, paint, base, origin, carve);
  group.add(tiles.group);
  const islandSize = manifest.totalM ?? manifest.tileSizeM * tiles.across;
  const far = await createFarIsland(base, islandSize, paint, { shown: tiles.shown, origin, across: tiles.across, tileSize: tiles.tileSize });
  group.add(far);
  const ocean: Ocean = createOcean(base, islandSize, origin);
  group.add(ocean.mesh);
  // (the sea's two pictures in before anything else: v0.2.151, nothing of the island left loading behind her)
  await ocean.ready;
  // THE WATERWAYS (hydro.ts): made in the island's own metres, so their group is shifted by the arrival point
  const waterGroup = new THREE.Group();
  waterGroup.position.set(-origin.x, 0, -origin.y);
  group.add(waterGroup);
  // (none with Rivers & lakes off: nothing of theirs is fetched or built)
  const hydro = carve ? new KauaiHydro(waterGroup, base, carve, { across: tiles.across, tileSize: tiles.tileSize }) : null;
  const hydroGround = {
    surfaceHeightAt: (ix: number, iz: number) => tiles.fineHeightAtIsland(ix, iz),
    tileReadyAt: (ix: number, iz: number) => tiles.tileReadyAtIsland(ix, iz),
  };
  // THE FOREST (trees.ts, Beyond Extinction's photo trees on the real vegetation maps), in the island's own metres as
  // the rivers are; Settings -> WORLD -> Landscaping picks photos, 3D trees near her, 3D only, or none (live)
  const trees = new IslandTrees(waterGroup, base, options.landscaping ?? 'off');
  /** She is playing (`startStreaming`), and whether the forest has been let start (once the tiles round her are in). */
  let playing = false, forestBegun = false;

  // THE SKY: Beyond Extinction's daytime sky picture (no lighting from it: her look stays as tuned), and a light haze.
  // Drawn straight from the picture (skyPicture.ts, v0.2.147): as `scene.background` three.js turned it into a
  // 1024 cube with six depth buffers, about 48 MB more on the graphics chip for the same sky.
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, FOG_NEAR, FOG_FAR);
  let skyPicture: THREE.Texture | null = null;
  let sky: SkyPicture | null = null;
  let gone = false; // (the island let go before the picture arrived: it is not put up)
  // (WAITED FOR, v0.2.151: in with the island's own step, not loading behind the characters')
  await new THREE.TextureLoader().loadAsync(`${base}sky/daysky_bg.jpg`).then((picture) => {
    if (gone) { picture.dispose(); return; }
    skyPicture = picture;
    sky = createSkyPicture(picture);
    scene.add(sky.mesh); // (the haze colour stays as the background, under it: seen only if the picture never comes)
  }).catch(() => { /* the plain haze colour stays */ });

  const groundAt = (x: number, z: number): number => tiles.heightAt(x, z);
  const waterAt = (x: number, z: number): number | null => hydro?.waterLevelAt(x + origin.x, z + origin.y) ?? null;
  const standAt = (x: number, z: number): number => {
    const ground = groundAt(x, z);
    const level = waterAt(x, z);
    return level !== null && level - ground > STAND_IN_WATER ? level - STAND_IN_WATER : ground;
  };
  return {
    group,
    // (her body is about 0.25 m round: a trunk stops her that far from its bark)
    walls: new IslandWalls(groundAt, standAt, (x, z) => trees.trunkBlocks(x + origin.x, z + origin.y, BODY_RADIUS)),
    setLandscaping: (mode) => trees.setMode(mode),
    setGround: (mode) => { void paint.setMode(mode); },
    setGroundColour: (kind, which, hex) => paint.setColour(kind, which, hex),
    grid,
    standAt,
    waterAt,
    seaLevel: WATER_Y,
    arrivalFacing: ARRIVAL_FACING,
    groundAt,
    treeCounts: () => trees.counts,
    async ready(x, z, say) {
      // (HER TILE ONLY, v0.2.150: the streamer loads nothing else until `startStreaming`)
      tiles.update(x, z);
      for (;;) {
        const done = tiles.herTileReady(x, z);
        say(done ? 1 : 0, 1);
        if (done) return;
        await new Promise((r) => window.setTimeout(r, 50));
        tiles.update(x, z); // (asks again if it failed)
      }
    },
    startStreaming() {
      playing = true;
      tiles.startStreaming();
    },
    update(seconds, herX, herZ, camera) {
      tiles.update(herX, herZ);
      // (nothing of the water is built, nor the forest started, before she is playing)
      if (!playing) { ocean.update(seconds, camera); return; }
      hydro?.update(seconds, hydroGround);
      // THE FOREST once every tile round her is in (the first time; after that it streams with the camera as before)
      if (!forestBegun) {
        const { ready, total } = tiles.loadState(herX, herZ);
        if (ready >= total) { forestBegun = true; trees.begin(); }
      }
      // (the forest by the CAMERA, in the island's metres: what is near the view is what is drawn)
      trees.update(seconds, camera.position.x + origin.x, camera.position.z + origin.y, hydroGround, hydro);
      ocean.update(seconds, camera);
    },
    dispose() {
      tiles.dispose();
      hydro?.dispose();
      paint.dispose();
      trees.dispose();
      far.geometry.dispose();
      (far.material as THREE.Material).dispose();
      ocean.dispose();
      gone = true;
      sky?.dispose();
      skyPicture?.dispose();
    },
  };
}
