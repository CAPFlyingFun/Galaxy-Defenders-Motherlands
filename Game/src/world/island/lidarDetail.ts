// ============================================================================
// lidarDetail.ts -- THE 1 M GROUND ROUND WAILUA (v0.2.183).
//
// Joshua, 2026-11-27: "I am having another agent start a new game and it
// actually got better quality terrain data, so can you replace it in ours as
// well... maybe at least just do this GDM game with the updated terrain data
// which looks great". That game, Mow & Grow, fetched NOAA's 1 m lidar of
// Kaua'i for a 3.5 km square round Wailua (her arrival beach is in it) and
// baked it into 16 tiles of 875 m, filled with OUR island's heights where the
// lidar has none and blended into them over 40 m (public/island/COPIED_FROM.md,
// scripts/make_wailua_lidar.py). Everywhere else the island is as it was.
//
// HOW IT IS DRAWN, after Mow & Grow's own (its src/terrain/terrainView.ts):
// the square is cut into 16 x 16 CHUNKS of 218.75 m, each one mesh, built with
// more or fewer points by how far the camera is (LIDAR_LODS: "fine" puts a
// point every metre within 170 m of the camera, "medium" every 2 m within
// 120 m: Settings -> WORLD -> Wailua ground). A chunk is built again when the
// camera's distance calls for another detail, a few a frame (`update`, within
// a time budget, nearest first). Every chunk hangs a SKIRT (a strip down from
// its edges, facing out) so the joins between chunks of different detail never
// show a crack.
//
// The island's tiles leave a HOLE under the square (tileStreamer.ts `setDetail`)
// so the ground is not drawn twice; its edges fall exactly on their grids'
// corners. A chunk is drawn only where the tile under it is drawn (far from
// her the coarse far island stands in for both). The heights she, John, the
// table, the trees and the flora stand on come from here wherever it is drawn,
// measured on the very triangles drawn (`heightAtIsland`), as the tiles' are.
//
// Same material as the tiles (groundPaint.ts: the colours by height and slope),
// so the 1 m ground is painted the same way, only sharper.
//
// MEMORY: the 16 tiles' heights are kept as 16-bit numbers (a 256th of a metre,
// from 140 m under the sea: -140..+116 m; the square's own run -129..+42), 1.5 MB
// a tile, 24.6 MB in all, instead of 49 as floats.
//
// WHERE THINGS ARE: in the island's own metres (its grid's centre, +x east,
// +z south), as the manifest gives them; drawn shifted by her arrival point
// (`origin`), as the tiles are.
// ============================================================================
import * as THREE from 'three';
import { readTile, type GroundDetail } from './tileStreamer';

/** public/island/kauai/wailua-1m.json, as scripts/make_wailua_lidar.py writes it. */
export interface LidarManifest {
  source?: string;
  lidarPercent?: number;
  /** the square, island metres */
  box: { x0: number; z0: number; x1: number; z1: number };
  /** one tile's side, metres (875), and its picture's side (876: neighbouring tiles share their edge pixels) */
  tileM: number;
  tilePixels: number;
  tiles: { file: string; x0: number; z0: number }[];
  /** the sea's shoreline there at 2 m a pixel (ocean.ts), -8..+2 m as 0..255 */
  coast: { file: string; x0: number; z0: number; size: number; pixels: number };
}

/** Settings -> WORLD -> Wailua ground: how sharp near the camera, or the island's old ground there. */
export type LidarLevel = 'fine' | 'medium' | 'off';

/** How many squares along a chunk's side, by how far the camera is from it (metres); the last row has no limit. */
type LodTable = readonly { readonly within: number; readonly segs: number }[];

/**
 * GAME TUNING. FINE is Mow & Grow's own table (a point every metre within 170 m, its 218.75 m chunks at 220 squares;
 * every 2 m to 420 m, 4 m to 950, 8 m to 2.1 km, then 16 m). MEDIUM is half as fine near her and gives up the detail
 * sooner, for a phone (every 2 m within 120 m, then 4, 8 and 16 m, and 31 m past 1.6 km). Near the camera a fine
 * chunk is about 97,000 triangles, a medium one 24,000.
 */
export const LIDAR_LODS: Record<Exclude<LidarLevel, 'off'>, LodTable> = {
  fine: [{ within: 170, segs: 220 }, { within: 420, segs: 110 }, { within: 950, segs: 55 }, { within: 2100, segs: 28 }, { within: Infinity, segs: 14 }],
  medium: [{ within: 120, segs: 110 }, { within: 300, segs: 55 }, { within: 700, segs: 28 }, { within: 1600, segs: 14 }, { within: Infinity, segs: 7 }],
};

/** The square is cut into this many chunks each way (218.75 m each: the island tiles' grids have corners there too). */
const CHUNKS_ACROSS = 16;
/** How far each chunk's skirt hangs, metres. */
const SKIRT_DROP = 3;
/** The heights kept as 16-bit numbers: (metres + OFFSET) x SCALE. */
const OFFSET = 140, SCALE = 256;

interface Chunk {
  /** its north-west corner, island metres */
  x0: number;
  z0: number;
  size: number;
  /** the squares along its side it is built with now (0: not built) */
  segs: number;
  mesh: THREE.Mesh | null;
  /** its corners' heights as drawn, (segs + 1) squared, rows north to south: for `heightAtIsland` */
  h: Float32Array | null;
  /** to be built again even at the same detail (the level was changed) */
  dirty: boolean;
}

export class LidarDetail implements GroundDetail {
  /** Everything drawn: add it to the island's group. */
  readonly group = new THREE.Group();
  readonly box: LidarManifest['box'];
  /** Chunks built last frame, still waiting, and triangles drawn (for the readout). */
  built = 0;
  waiting = 0;
  triangles = 0;
  /** The slowest chunk built the last time any were, milliseconds (for the readout: the hitch a frame takes for one). */
  buildMs = 0;
  /** (the slowest so far in this round of building) */
  private slowest = 0;
  private readonly across: number;
  private readonly heights: (Uint16Array | null)[];
  /** Which of the manifest's tiles is tile (ti, tj) of the square, row by row (found once by its corner: its list's order is its own). */
  private readonly order: Int16Array;
  private readonly chunks: Chunk[] = [];
  private readonly chunkSize: number;
  private loadedCount = 0;
  private loading: Promise<boolean> | null = null;
  /** every chunk has been built at least once: it can be drawn, and the tiles' hole made */
  private complete = false;
  private gone = false;

  /**
   * @param base      where the island's files are (the game's address + "island/")
   * @param origin    her arrival point in the island's metres (the game's (0, 0))
   * @param material  the island's ground material (groundPaint.ts), as the tiles have
   * @param shownAt   is the island tile at a place (island metres) drawn now: a chunk is drawn only over one that is
   */
  constructor(private readonly manifest: LidarManifest, private readonly base: string, private readonly origin: THREE.Vector2,
              private readonly material: THREE.Material, private level: LidarLevel,
              private readonly shownAt: (ix: number, iz: number) => boolean) {
    this.box = manifest.box;
    this.across = Math.round((this.box.x1 - this.box.x0) / manifest.tileM);
    this.heights = manifest.tiles.map(() => null);
    this.order = new Int16Array(this.across * this.across).fill(-1);
    manifest.tiles.forEach((t, k) => {
      const ti = Math.round((t.x0 - this.box.x0) / manifest.tileM), tj = Math.round((t.z0 - this.box.z0) / manifest.tileM);
      if (ti >= 0 && tj >= 0 && ti < this.across && tj < this.across) this.order[tj * this.across + ti] = k;
    });
    this.chunkSize = (this.box.x1 - this.box.x0) / CHUNKS_ACROSS;
    for (let j = 0; j < CHUNKS_ACROSS; j++) {
      for (let i = 0; i < CHUNKS_ACROSS; i++) {
        this.chunks.push({ x0: this.box.x0 + i * this.chunkSize, z0: this.box.z0 + j * this.chunkSize, size: this.chunkSize, segs: 0, mesh: null, h: null, dirty: false });
      }
    }
    this.group.name = 'wailua-1m';
  }

  /** Its heights are in and every chunk is built, and it is not turned off: it is the ground there. */
  get ready(): boolean {
    return this.level !== 'off' && this.complete;
  }

  get loaded(): boolean {
    return this.loadedCount === this.manifest.tiles.length;
  }

  // ---- GroundDetail: where it is, and its heights (for the tiles: tileStreamer.ts) --------------------------------

  /** Is (ix, iz) (island metres) on the 1 m ground, drawn now? */
  covers(ix: number, iz: number): boolean {
    const b = this.box;
    return this.ready && ix > b.x0 && ix < b.x1 && iz > b.z0 && iz < b.z1;
  }

  /**
   * THE DRAWN GROUND'S HEIGHT at (ix, iz), island metres: read off the very triangle the chunk there is drawn with
   * (three.js's split of each square: corners 00, 10, 01 make one triangle, 11, 01, 10 the other), so whatever stands
   * here stands on what is seen. A chunk not built yet: the 1 m heights themselves.
   */
  heightAtIsland(ix: number, iz: number): number {
    const b = this.box, n = CHUNKS_ACROSS;
    const ci = Math.min(n - 1, Math.max(0, Math.floor((ix - b.x0) / this.chunkSize)));
    const cj = Math.min(n - 1, Math.max(0, Math.floor((iz - b.z0) / this.chunkSize)));
    const c = this.chunks[cj * n + ci];
    if (!c.h || c.segs === 0) return this.sample(ix, iz);
    const segs = c.segs, step = c.size / segs, w = segs + 1;
    const gu = Math.min(segs, Math.max(0, (ix - c.x0) / step)), gv = Math.min(segs, Math.max(0, (iz - c.z0) / step));
    const i0 = Math.min(segs - 1, Math.floor(gu)), j0 = Math.min(segs - 1, Math.floor(gv));
    const fx = gu - i0, fz = gv - j0, h = c.h;
    const h00 = h[j0 * w + i0], h10 = h[j0 * w + i0 + 1], h01 = h[(j0 + 1) * w + i0], h11 = h[(j0 + 1) * w + i0 + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** The 1 m heights at (ix, iz), island metres, blended from the four pixels round it; clamped to the square. */
  private sample(ix: number, iz: number): number {
    const b = this.box, T = this.manifest.tileM, P = this.manifest.tilePixels, mpp = T / (P - 1);
    const lx = Math.min(Math.max(ix - b.x0, 0), b.x1 - b.x0), lz = Math.min(Math.max(iz - b.z0, 0), b.z1 - b.z0);
    const ti = Math.min(this.across - 1, Math.floor(lx / T)), tj = Math.min(this.across - 1, Math.floor(lz / T));
    const which = this.order[tj * this.across + ti];
    const t = which >= 0 ? this.heights[which] : null;
    if (!t) return 0;
    const px = (lx - ti * T) / mpp, pz = (lz - tj * T) / mpp;
    const i0 = Math.min(P - 2, Math.floor(px)), j0 = Math.min(P - 2, Math.floor(pz));
    const u = px - i0, v = pz - j0, k = j0 * P + i0;
    const top = t[k] * (1 - u) + t[k + 1] * u;
    const bottom = t[k + P] * (1 - u) + t[k + P + 1] * u;
    return (top * (1 - v) + bottom * v) / SCALE - OFFSET;
  }

  // ---- Loading ------------------------------------------------------------------------------------------------------

  /**
   * Fetch and read all of its tiles, ONE AT A TIME (as the island's own files are since v0.2.151), each in the tiles'
   * worker; `say(done, of)` after each. True once all are in (false if one would not load: the old ground stays).
   */
  load(say?: (done: number, of: number) => void): Promise<boolean> {
    this.loading ??= (async () => {
      const list = this.manifest.tiles, P = this.manifest.tilePixels;
      say?.(0, list.length);
      for (let i = 0; i < list.length; i++) {
        if (this.gone) return false;
        if (!this.heights[i]) {
          let metres: Float32Array;
          try {
            metres = await readTile(`${this.base}kauai/${list[i].file}`, P);
          } catch (error) {
            console.warn(`The 1 m ground's tile ${list[i].file} did not load: the island's own ground stays there.`, error);
            this.loading = null; // (asked for again next time)
            return false;
          }
          const kept = new Uint16Array(P * P);
          for (let k = 0; k < kept.length; k++) kept[k] = Math.min(65535, Math.max(0, Math.round((metres[k] + OFFSET) * SCALE)));
          this.heights[i] = kept;
          this.loadedCount++;
        }
        say?.(i + 1, list.length);
      }
      return true;
    })();
    return this.loading;
  }

  // ---- Drawing ------------------------------------------------------------------------------------------------------

  /** Settings -> WORLD -> Wailua ground: another detail (every chunk built again, a few a frame) or off (hidden). */
  setLevel(level: LidarLevel): void {
    this.level = level;
    this.group.visible = level !== 'off';
    for (const c of this.chunks) c.dirty = true;
  }

  /** The detail a chunk should have with the camera at (cx, cy, cz) in the island's metres: 0 not drawn. */
  private want(c: Chunk, cx: number, cy: number, cz: number): number {
    if (this.level === 'off') return 0;
    if (!this.shownAt(c.x0 + c.size / 2, c.z0 + c.size / 2)) return 0;
    const dx = Math.max(c.x0 - cx, 0, cx - (c.x0 + c.size));
    const dz = Math.max(c.z0 - cz, 0, cz - (c.z0 + c.size));
    const d = Math.hypot(dx, dz, Math.max(0, cy));
    const lods = LIDAR_LODS[this.level];
    for (const l of lods) if (d < l.within) return l.segs;
    return lods[lods.length - 1].segs;
  }

  /**
   * EVERY CHUNK BUILT, now (before she plays, once its heights are in): at the detail the camera at (gameX, gameY,
   * gameZ) calls for, or the coarsest where its tile is not drawn yet, so wherever a tile leaves its hole the ground
   * is already there. A few tenths of a second.
   */
  buildAll(gameX: number, gameY: number, gameZ: number): void {
    if (!this.loaded || this.level === 'off') return;
    const cx = gameX + this.origin.x, cz = gameZ + this.origin.y;
    const lods = LIDAR_LODS[this.level];
    this.slowest = 0;
    for (const c of this.chunks) {
      const segs = this.want(c, cx, gameY, cz) || lods[lods.length - 1].segs;
      if (!c.mesh || c.segs !== segs || c.dirty) this.build(c, segs);
    }
    this.buildMs = this.slowest;
    this.complete = true;
    this.update(gameX, gameY, gameZ, 0);
  }

  /**
   * EACH FRAME: the chunks whose detail should change (the camera has moved) built again, NEAREST FIRST, for up to
   * `budgetMs` milliseconds (always at least one); a chunk whose tile is not drawn is hidden.
   */
  update(gameX: number, gameY: number, gameZ: number, budgetMs: number): void {
    if (!this.complete || this.level === 'off') { this.waiting = 0; return; }
    const cx = gameX + this.origin.x, cz = gameZ + this.origin.y;
    const jobs: { c: Chunk; segs: number; d: number }[] = [];
    let triangles = 0;
    for (const c of this.chunks) {
      const segs = this.want(c, cx, gameY, cz);
      if (segs === 0) { if (c.mesh) c.mesh.visible = false; continue; }
      if (c.mesh) { c.mesh.visible = true; triangles += 2 * c.segs * c.segs; }
      if (c.mesh && c.segs === segs && !c.dirty) continue;
      jobs.push({ c, segs, d: Math.hypot(c.x0 + c.size / 2 - cx, c.z0 + c.size / 2 - cz) });
    }
    this.triangles = triangles;
    jobs.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    this.built = 0;
    this.slowest = 0;
    for (const j of jobs) {
      if (this.built > 0 && performance.now() - t0 > budgetMs) break;
      this.build(j.c, j.segs);
      this.built++;
    }
    if (this.built > 0) this.buildMs = this.slowest;
    this.waiting = jobs.length - this.built;
  }

  /**
   * A CHUNK'S MESH at `segs` squares a side: its corners at the 1 m heights; each corner's facing from the heights
   * either side of it (a border of one point all round, so neighbouring chunks at the same detail meet with the same
   * light); `aElev`, the height above the sea, for the ground's colours; and its SKIRT, a copy of its edge hanging
   * SKIRT_DROP lower, facing out (its back is never drawn, so it cannot show dark), coloured as the edge above it.
   */
  private build(c: Chunk, segs: number): void {
    const began = performance.now();
    const n = segs + 1, step = c.size / segs, m = n + 2;
    const border = new Float32Array(m * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) border[j * m + i] = this.sample(c.x0 + (i - 1) * step, c.z0 + (j - 1) * step);
    const edge = 4 * segs, count = n * n + edge;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), elev = new Float32Array(count);
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i, y = border[(j + 1) * m + i + 1];
        h[k] = y;
        pos[k * 3] = i * step; pos[k * 3 + 1] = y; pos[k * 3 + 2] = j * step;
        // (the slope east-west and north-south, from the points either side)
        const gx = (border[(j + 1) * m + i + 2] - border[(j + 1) * m + i]) / (2 * step);
        const gz = (border[(j + 2) * m + i + 1] - border[j * m + i + 1]) / (2 * step);
        const len = Math.hypot(gx, 1, gz);
        nor[k * 3] = -gx / len; nor[k * 3 + 1] = 1 / len; nor[k * 3 + 2] = -gz / len;
        elev[k] = y;
      }
    }
    // THE SKIRT: each edge point again, lower, in order round the edge (north west to east, east north to south, south
    // east to west, west south to north)
    const ring: number[] = [];
    for (let i = 0; i < segs; i++) ring.push(i);
    for (let j = 0; j < segs; j++) ring.push(j * n + segs);
    for (let i = segs; i > 0; i--) ring.push(segs * n + i);
    for (let j = segs; j > 0; j--) ring.push(j * n);
    ring.forEach((top, r) => {
      const k = n * n + r;
      pos[k * 3] = pos[top * 3]; pos[k * 3 + 1] = pos[top * 3 + 1] - SKIRT_DROP; pos[k * 3 + 2] = pos[top * 3 + 2];
      for (let a = 0; a < 3; a++) nor[k * 3 + a] = nor[top * 3 + a];
      elev[k] = elev[top];
    });
    // (each square's two triangles as three.js's PlaneGeometry splits it, so `heightAtIsland` reads the same ones:
    //  corners 00, 01, 10 and 10, 01, 11, wound to face up)
    const index = new (count > 65535 ? Uint32Array : Uint16Array)(segs * segs * 6 + edge * 6);
    let q = 0;
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
        index[q++] = a; index[q++] = d; index[q++] = b;
        index[q++] = b; index[q++] = d; index[q++] = e;
      }
    }
    for (let r = 0; r < edge; r++) {
      const t0 = ring[r], t1 = ring[(r + 1) % edge], s0 = n * n + r, s1 = n * n + (r + 1) % edge;
      index[q++] = t0; index[q++] = t1; index[q++] = s0;
      index[q++] = t1; index[q++] = s1; index[q++] = s0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aElev', new THREE.BufferAttribute(elev, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    if (c.mesh) {
      c.mesh.geometry.dispose();
      c.mesh.geometry = g;
    } else {
      c.mesh = new THREE.Mesh(g, this.material);
      c.mesh.name = 'wailua-1m-chunk';
      c.mesh.position.set(c.x0 - this.origin.x, 0, c.z0 - this.origin.y);
      c.mesh.receiveShadow = true; // (her shadow falls on it, as on the tiles)
      c.mesh.matrixAutoUpdate = false;
      c.mesh.updateMatrix();
      this.group.add(c.mesh);
    }
    c.segs = segs;
    c.h = h;
    c.dirty = false;
    this.slowest = Math.max(this.slowest, performance.now() - began);
  }

  /** Let go of everything (when the game restarts). */
  dispose(): void {
    this.gone = true;
    for (const c of this.chunks) {
      c.mesh?.geometry.dispose();
      c.mesh?.removeFromParent();
      c.mesh = null;
      c.h = null;
    }
    this.heights.fill(null);
    this.material.dispose();
  }
}
