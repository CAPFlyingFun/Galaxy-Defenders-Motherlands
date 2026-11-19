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
// see public/island/COPIED_FROM.md.
// ============================================================================
import * as THREE from 'three';
import type { GroundPoint } from '../collision';
import type { Walls } from '../../input/playerMotion';
import { loadGroundPictures } from './groundPaint';
import { TileStreamer, type IslandManifest } from './tileStreamer';
import { createFarIsland } from './farIsland';
import { createOcean, WATER_Y, type Ocean } from './ocean';

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

/** The haze: none up to here, the far coast fades into it by there (metres from the camera). */
const FOG_NEAR = 3000;
const FOG_FAR = 16000;
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
  /** Wait until the tiles round (x, z) are all loaded, telling `say` how far along it is. */
  ready(x: number, z: number, say: (done: number, of: number) => void): Promise<void>;
  /** Every frame: tiles follow her, the sea follows the camera. */
  update(seconds: number, herX: number, herZ: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** The ground she cannot walk onto: the sea past her knees, and steep slopes going up. */
class IslandWalls implements Walls {
  constructor(private readonly groundAt: (x: number, z: number) => number) {}

  /** Can she step from (ax, az) to (bx, bz)? */
  private allowed(ax: number, az: number, bx: number, bz: number): boolean {
    const to = this.groundAt(bx, bz);
    if (Number.isNaN(to)) return false;            // (no ground loaded there yet)
    if (to < WATER_Y - WADE_DEPTH) return false;   // too deep
    const from = this.groundAt(ax, az);
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
export async function createIslandWorld(base: string, scene: THREE.Scene): Promise<IslandWorld> {
  const origin = new THREE.Vector2(ARRIVAL.x, ARRIVAL.z);
  const [manifest, pictures] = await Promise.all([
    fetch(`${base}kauai/manifest.json`).then((r) => r.json() as Promise<IslandManifest>),
    loadGroundPictures(base),
  ]);
  const group = new THREE.Group();
  group.name = 'island';
  const tiles = new TileStreamer(manifest, pictures, base, origin);
  group.add(tiles.group);
  const far = await createFarIsland(base, manifest.tileSizeM * 8, pictures, tiles.shown, origin);
  group.add(far);
  const ocean: Ocean = createOcean(base, manifest.tileSizeM * 8, origin);
  group.add(ocean.mesh);

  // THE SKY: Beyond Extinction's daytime sky picture (no lighting from it: her look stays as tuned), and a light haze
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, FOG_NEAR, FOG_FAR);
  let skyPicture: THREE.Texture | null = null;
  void new THREE.TextureLoader().loadAsync(`${base}sky/daysky_bg.jpg`).then((picture) => {
    picture.mapping = THREE.EquirectangularReflectionMapping;
    picture.colorSpace = THREE.SRGBColorSpace;
    skyPicture = picture;
    scene.background = picture;
  }).catch(() => { /* the plain haze colour stays */ });

  const groundAt = (x: number, z: number): number => tiles.heightAt(x, z);
  return {
    group,
    walls: new IslandWalls(groundAt),
    arrivalFacing: ARRIVAL_FACING,
    groundAt,
    async ready(x, z, say) {
      tiles.update(x, z);
      for (;;) {
        const { ready, total } = tiles.loadState(x, z);
        say(ready, total);
        if (ready >= total) return;
        await new Promise((r) => window.setTimeout(r, 50));
        tiles.update(x, z); // (asks again for any that failed)
      }
    },
    update(seconds, herX, herZ, camera) {
      tiles.update(herX, herZ);
      ocean.update(seconds, camera);
    },
    dispose() {
      tiles.dispose();
      far.geometry.dispose();
      (far.material as THREE.Material).dispose();
      ocean.dispose();
      skyPicture?.dispose();
    },
  };
}
