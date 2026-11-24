// ============================================================================
// tileStreamer.ts -- keeps the island's height tiles round the heroine loaded,
// and only those.
//
// THE ISLAND (Joshua, 2026-11-19: "import the real island map from Beyond
// Extinction... true scale"): 56 km across. Beyond Extinction cut it into 8 x 8
// tiles of 7 km (public/island/kauai/height/, copied from it: see
// public/island/COPIED_FROM.md); SINCE v0.2.150 the game reads them cut again
// into 16 x 16 tiles of 3.5 km (height16/, made by scripts/make_island_tiles16.py:
// columns A..P west to east, rows 1..16 north to south, each 257 x 257, every
// height the same as before). Joshua, 2026-11-22: "instead of a 8x8 grid, we
// turn it into a 16x16 grid with still the closest 9 smaller grids with the
// players grid always in the middle". So this keeps the 3 x 3 tiles round her
// (10.5 km square, a quarter of the 21 km it was; she is always at least
// 1.75 km from its edge) and drops the rest. Past them the coarse far island
// stands in (farIsland.ts). The grid's size is read from the manifest, so the
// same code would draw the 8 x 8.
//
// HER TILE FIRST, THEN THE REST ONE AT A TIME ONCE SHE IS PLAYING (v0.2.150;
// Joshua: "make the current location island tile load first and the rest
// actually in the game not before"). The island was the map that crashed his
// iPhone at the start, and all 9 tiles used to be asked for at the same moment
// (fetched, read, carved and built together, then sent to the graphics chip with
// the first picture). Now: before play, only the tile she stands on
// (`startStreaming` not yet called: the others wait); once she plays, one tile
// at a time, NEAREST FIRST, each started TILE_GAP ms after the last one was
// built, so no two arrive together. Walking onto a new tile, the new row is
// queued the same way (in a worker: tileWorker.ts) and the row behind let go.
//
// Brought over from Beyond Extinction's KauaiTileStreamer.ts (main at
// 70f3f97). What is different here:
//   * THE GAME'S CENTRE is where she arrives (the plaza rule: the game's
//     numbers stay small, so nothing shakes from rounding far from the centre),
//     so every tile is drawn shifted by `origin` (the arrival point in the
//     island's own metres, whose centre is the middle of the 8 x 8 grid).
//   * No fading in and out: the far island is under every tile, so a tile can
//     simply appear (and the far island leave that square out) on one frame.
//   * One ground material for all tiles, and they take her shadow.
//   * The rivers and lakes are cut into each tile's heights as it arrives
//     (carve.ts), as in Beyond Extinction.
// ============================================================================
import * as THREE from 'three';
import { FAR_TILE_SEG, SEG, renderedSurfaceHeight, tileIdOf } from './terrainSampling';
import type { GroundPaint } from './groundPaint';
import type { CarveData } from './carve';

/** The island's list of tiles (public/island/kauai/manifest16.json since v0.2.150; only what is used here). */
export interface IslandManifest {
  tileSizeM: number;
  /** The whole island's side, metres (56,000). */
  totalM?: number;
  tilePixels: number;
  tiles: { id: string; col: number; row: number; file: string }[];
  spawn?: { tile?: string; x?: number; z?: number };
}

/** How far each tile's edge hangs a wall down behind it, metres: hides any hairline gap between two tiles. */
const SKIRT_DROP = 6;
/** How many tiles away from hers stay loaded: 1 is the 3 x 3 round her. */
const RADIUS = 1;
/**
 * A tile is built with the fine grid (SEG) when she is within this many metres of it (standing on it, or near its
 * edge), and with the half grid otherwise. With 3.5 km tiles (v0.2.150) a phone's fine grid is 192 squares of 18 m and
 * the half grid 96 of 36 m (the old FINE grid's squares): her own tile, and a neighbour once she is within 500 m of it;
 * near a corner up to four. One fine tile is 74,000 triangles, a half one 18,000: usually about 220,000 for the 3 x 3.
 * (With the 7 km tiles this was 1,500 m: the half grid was then 73 m squares.)
 */
const FINE_WITHIN = 500;
/**
 * Milliseconds between one tile being built and the next being started, once she is playing (v0.2.150): each new
 * tile's mesh goes up to the graphics chip in a frame of its own, and the game breathes between them.
 */
const TILE_GAP = 400;

interface Tile {
  id: string;
  col: number;
  row: number;
  /** Its centre in the island's own metres. */
  cx: number;
  cz: number;
  heights?: Float32Array;
  mesh?: THREE.Mesh;
  /** The grid its mesh was built with (SEG near her, FAR_TILE_SEG further off): its heights are read with the same. */
  seg: number;
  /** Still wanted (false once she has walked away from it while it was loading). */
  wanted: boolean;
}

export class TileStreamer {
  /** Everything the tiles draw: add this to the scene. */
  readonly group = new THREE.Group();
  /** N x N, one byte a tile: 255 where the tile is drawn in full (the far island leaves those squares out). */
  readonly shown: THREE.DataTexture;
  /** How many tiles across the island (and down): 16 since v0.2.150 (8 before). */
  readonly across: number;
  /** One tile's side, metres (3,500 since v0.2.150). */
  readonly tileSize: number;
  private readonly S: number;
  private readonly P: number;
  /**
   * The grids this island's tiles are built with, near her and further off: SEG and FAR_TILE_SEG, but NEVER FINER THAN
   * THE TILE'S OWN HEIGHT PICTURE (v0.2.166): a 64 x 64 grid's tile has 64 squares of heights across, and 192 squares
   * there would only cut the same slopes into more triangles.
   */
  private readonly fineSeg: number;
  private readonly halfSeg: number;
  /** Half the grid in tiles less a half: tile (col, row)'s centre is ((col - mid) * S, (row - mid) * S). */
  private readonly mid: number;
  private readonly byId = new Map<string, IslandManifest['tiles'][number]>();
  private readonly tiles = new Map<string, Tile>();
  /** The ground's material, for the tiles and their skirts alike (v0.2.168: the skirts had a two-sided copy). */
  private readonly material: THREE.MeshStandardMaterial;
  private readonly shownBytes: Uint8Array;
  /** The tiles still to load round her, nearest first (v0.2.150: one at a time). */
  private queue: [number, number][] = [];
  /** A tile is being loaded now (only one at a time). */
  private busy = false;
  /** When the next one may start (performance.now(), ms): TILE_GAP after the last one was built. */
  private nextAt = 0;
  /** She is playing: tiles other than her own may load (`startStreaming`). */
  private streaming = false;
  private curCol = -99;
  /** Where she was last told to be (a tile that arrives is built for there). */
  private herX = 0;
  private herZ = 0;
  private curRow = -99;

  /**
   * @param base    where the island's files are (the game's address + "island/")
   * @param origin  the arrival point in the island's own metres: the game's (0, 0)
   * @param carve   the rivers and lakes, cut into each tile's heights as it arrives (null: none)
   */
  constructor(private readonly manifest: IslandManifest, paint: GroundPaint, private readonly base: string, private readonly origin: THREE.Vector2, private readonly carve: CarveData | null = null) {
    this.S = this.tileSize = manifest.tileSizeM;
    this.P = manifest.tilePixels;
    this.fineSeg = Math.min(SEG, this.P - 1);
    this.halfSeg = Math.min(FAR_TILE_SEG, this.P - 1);
    // (the island is 56 km across: 16 tiles of 3.5 km, or Beyond Extinction's 8 of 7 km; 32 or 64 by Settings)
    this.across = Math.round((manifest.totalM ?? manifest.tileSizeM * 8) / manifest.tileSizeM);
    this.mid = (this.across - 1) / 2;
    this.shownBytes = new Uint8Array(this.across * this.across);
    for (const t of manifest.tiles) this.byId.set(t.id, t);
    this.group.name = 'island-tiles';
    // (from the island's one ground paint: Solid colours or Textures, changed for every tile at once)
    this.material = paint.material();
    this.shown = new THREE.DataTexture(this.shownBytes, this.across, this.across, THREE.RedFormat, THREE.UnsignedByteType);
    this.shown.magFilter = this.shown.minFilter = THREE.NearestFilter;
    this.shown.needsUpdate = true;
  }

  // ---- Where things are -----------------------------------------------------------------------------------------
  // The game's (x, z) is the island's (x + origin.x, z + origin.y). Tile (col, row) has its centre at
  // ((col - mid) * S, (row - mid) * S) in the island's metres (mid 7.5 for 16 tiles across, 3.5 for 8).
  private colOf(gameX: number): number { return Math.round((gameX + this.origin.x) / this.S + this.mid); }
  private rowOf(gameZ: number): number { return Math.round((gameZ + this.origin.y) / this.S + this.mid); }
  private colAtIsland(ix: number): number { return Math.round(ix / this.S + this.mid); }
  private static key(col: number, row: number): string { return `${col},${row}`; }
  /** A tile's name: its column's letter (A west) and its row's number (1 north): "N9". */
  private static idOf(col: number, row: number): string { return tileIdOf(col, row); }
  /** Kept inside the grid. */
  private inGrid(n: number): number { return Math.min(this.across - 1, Math.max(0, n)); }

  /**
   * The height of the DRAWN ground at a place in the game's world, metres above the sea. NaN where no tile is
   * loaded (she is never let walk there: islandWalls.ts).
   */
  heightAt(gameX: number, gameZ: number): number {
    const t = this.tiles.get(TileStreamer.key(this.colOf(gameX), this.rowOf(gameZ)));
    if (!t?.heights) return NaN;
    return renderedSurfaceHeight(t.heights, this.P, this.S, gameX + this.origin.x - t.cx, gameZ + this.origin.y - t.cz, t.seg);
  }

  /**
   * FOR THE WATER (hydro.ts), in the ISLAND'S own metres: the ground's height on the FINE grid, whatever grid the tile
   * is drawn with for now (so the rivers are levelled once, to the ground she will walk on), and whether a tile is in.
   */
  fineHeightAtIsland(ix: number, iz: number): number {
    const t = this.tiles.get(TileStreamer.key(this.colAtIsland(ix), this.colAtIsland(iz)));
    if (!t?.heights) return 0;
    return renderedSurfaceHeight(t.heights, this.P, this.S, ix - t.cx, iz - t.cz, this.fineSeg);
  }
  tileReadyAtIsland(ix: number, iz: number): boolean {
    return !!this.tiles.get(TileStreamer.key(this.colAtIsland(ix), this.colAtIsland(iz)))?.heights;
  }

  /** Is the tile she stands on at (gameX, gameZ) loaded? (Before play the game waits for this one only.) */
  herTileReady(gameX: number, gameZ: number): boolean {
    return !!this.tiles.get(TileStreamer.key(this.inGrid(this.colOf(gameX)), this.inGrid(this.rowOf(gameZ))))?.heights;
  }

  /** How many of the tiles that should be round (gameX, gameZ) are loaded, of how many. */
  loadState(gameX: number, gameZ: number): { ready: number; total: number } {
    let ready = 0, total = 0;
    for (const [col, row] of this.ring(gameX, gameZ)) {
      total++;
      if (this.tiles.get(TileStreamer.key(col, row))?.heights) ready++;
    }
    return { ready, total };
  }

  /** She is playing: the tiles round her (not only her own) now load, one at a time (v0.2.150). */
  startStreaming(): void {
    this.streaming = true;
  }

  /** Call every frame with where she is: when she has crossed onto another tile, the ring round her is redone. */
  update(gameX: number, gameZ: number): void {
    this.herX = gameX;
    this.herZ = gameZ;
    this.refine(gameX, gameZ);
    const col = this.inGrid(this.colOf(gameX));
    const row = this.inGrid(this.rowOf(gameZ));
    if (col !== this.curCol || row !== this.curRow) {
      this.curCol = col;
      this.curRow = row;
      const want = new Set<string>();
      const missing: [number, number][] = [];
      for (const [c, r] of this.ring(gameX, gameZ)) {
        const key = TileStreamer.key(c, r);
        want.add(key);
        const have = this.tiles.get(key);
        if (have) have.wanted = true;
        else missing.push([c, r]);
      }
      // NEAREST FIRST: by how far she is from each tile's middle (her own tile first of all)
      const ix = gameX + this.origin.x, iz = gameZ + this.origin.y;
      const away = ([c, r]: [number, number]): number => Math.hypot((c - this.mid) * this.S - ix, (r - this.mid) * this.S - iz);
      this.queue = missing.sort((a, b) => away(a) - away(b));
      for (const [key, t] of this.tiles) {
        if (want.has(key)) continue;
        t.wanted = false;
        if (t.mesh) this.drop(key, t); // (one still loading is dropped when it arrives)
      }
    }
    this.pump();
  }

  /**
   * ONE TILE AT A TIME (v0.2.150): start the next tile in the queue if none is loading and TILE_GAP has passed since
   * the last was built. Before she plays (`startStreaming`), only the tile she stands on.
   */
  private pump(): void {
    if (this.busy || performance.now() < this.nextAt) return;
    while (this.queue.length) {
      const [c, r] = this.queue[0];
      const key = TileStreamer.key(c, r);
      if (this.tiles.has(key)) { this.queue.shift(); continue; } // (loaded or loading already)
      if (!this.streaming && (c !== this.curCol || r !== this.curRow)) return; // (before play: hers only)
      this.queue.shift();
      this.busy = true;
      void this.load(c, r, key).finally(() => {
        this.busy = false;
        this.nextAt = performance.now() + TILE_GAP;
      });
      return;
    }
  }

  /** The grid a tile should have with her at (gameX, gameZ): fine if she is within FINE_WITHIN of it. */
  private segFor(t: Tile, gameX: number, gameZ: number): number {
    const half = this.S / 2;
    const dx = Math.max(0, Math.abs(gameX + this.origin.x - t.cx) - half);
    const dz = Math.max(0, Math.abs(gameZ + this.origin.y - t.cz) - half);
    return Math.hypot(dx, dz) <= FINE_WITHIN ? this.fineSeg : this.halfSeg;
  }

  /** Rebuild (at most) one tile whose grid no longer suits where she is: a few hundredths of a second, now and then. */
  private refine(gameX: number, gameZ: number): void {
    for (const t of this.tiles.values()) {
      if (!t.mesh) continue;
      const seg = this.segFor(t, gameX, gameZ);
      if (seg === t.seg) continue;
      this.group.remove(t.mesh);
      disposeMesh(t.mesh);
      t.seg = seg;
      t.mesh = this.buildMesh(t);
      this.group.add(t.mesh);
      return;
    }
  }

  /** The tiles (col, row) that should be loaded round a place: those within RADIUS that the island has. */
  private *ring(gameX: number, gameZ: number): Generator<[number, number]> {
    const col = this.inGrid(this.colOf(gameX));
    const row = this.inGrid(this.rowOf(gameZ));
    const last = this.across - 1;
    for (let dc = -RADIUS; dc <= RADIUS; dc++) {
      for (let dr = -RADIUS; dr <= RADIUS; dr++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || c > last || r < 0 || r > last || !this.byId.has(TileStreamer.idOf(c, r))) continue;
        yield [c, r];
      }
    }
  }

  private async load(col: number, row: number, key: string): Promise<void> {
    const id = TileStreamer.idOf(col, row);
    const entry = this.byId.get(id)!;
    const tile: Tile = { id, col, row, cx: (col - this.mid) * this.S, cz: (row - this.mid) * this.S, seg: this.halfSeg, wanted: true };
    this.tiles.set(key, tile);
    let heights: Float32Array;
    try {
      heights = await readTile(`${this.base}kauai/${entry.file}`, this.P);
    } catch (error) {
      console.warn(`Island tile ${id} did not load; it is asked for again.`, error);
      if (this.tiles.get(key) === tile) this.tiles.delete(key);
      this.curCol = -99; // (so the next frame redoes the ring and asks for it again)
      return;
    }
    // the rivers' channels and the lakes' beds cut in before anything reads the heights (carve.ts)
    if (this.carve) {
      await this.carve.prefetch();
      this.carve.applyToTile(heights, this.P, this.S, col, row);
    }
    if (this.tiles.get(key) !== tile) return;
    if (!tile.wanted) { this.tiles.delete(key); return; }
    tile.heights = heights;
    tile.seg = this.segFor(tile, this.herX, this.herZ);
    tile.mesh = this.buildMesh(tile);
    this.group.add(tile.mesh);
    this.setShown(col, row, true);
  }

  /** Let go of a tile: its mesh, its heights, and its square of the far island comes back. */
  private drop(key: string, t: Tile): void {
    if (t.mesh) {
      this.group.remove(t.mesh);
      disposeMesh(t.mesh);
    }
    this.setShown(t.col, t.row, false);
    this.tiles.delete(key);
  }

  private setShown(col: number, row: number, on: boolean): void {
    this.shownBytes[row * this.across + col] = on ? 255 : 0;
    this.shown.needsUpdate = true;
  }

  /** A tile's mesh: a SEG x SEG grid at the picture's heights, with the hanging edge wall (its "skirt"). */
  private buildMesh(tile: Tile): THREE.Mesh {
    const P = this.P, S = this.S, h = tile.heights!, seg = tile.seg;
    const geometry = new THREE.PlaneGeometry(S, S, seg, seg);
    geometry.rotateX(-Math.PI / 2); // flat: +X east, +Z south
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      // where this corner is across the tile, 0..1, and the picture's height there (blended from its 4 points)
      const fx = Math.min(P - 1, Math.max(0, (position.getX(i) / S + 0.5) * (P - 1)));
      const fy = Math.min(P - 1, Math.max(0, (position.getZ(i) / S + 0.5) * (P - 1)));
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(P - 1, x0 + 1), y1 = Math.min(P - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      position.setY(i, h[y0 * P + x0] * (1 - tx) * (1 - ty) + h[y0 * P + x1] * tx * (1 - ty) + h[y1 * P + x0] * (1 - tx) * ty + h[y1 * P + x1] * tx * ty);
    }
    geometry.computeVertexNormals();
    const elevation = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) elevation[i] = position.getY(i);
    geometry.setAttribute('aElev', new THREE.BufferAttribute(elevation, 1));
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(tile.cx - this.origin.x, 0, tile.cz - this.origin.y);
    mesh.name = `island-${tile.id}`;
    mesh.receiveShadow = true; // (her real shadow falls on the ground itself)
    const skirt = new THREE.Mesh(skirtGeometry(geometry, seg, SKIRT_DROP), this.material);
    mesh.add(skirt);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  /** Let go of everything (when the game restarts). */
  dispose(): void {
    for (const [key, t] of [...this.tiles]) this.drop(key, t);
    this.material.dispose();
    this.shown.dispose();
  }
}

/** Let go of a tile's mesh and its skirt's (their material is shared and stays). */
function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  for (const child of mesh.children) (child as THREE.Mesh).geometry?.dispose();
}

// ---- Reading a tile -------------------------------------------------------------------------------------------------
// In a worker when the browser has them (no pause on the game's thread); otherwise here, the slower way.
let workers: Worker[] | null | undefined;
let asked = 0;
const waiting = new Map<number, { done: (h: Float32Array) => void; fail: (e: Error) => void }>();

function workerPool(): Worker[] | null {
  if (workers !== undefined) return workers;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('no workers here');
    workers = [0, 1].map(() => {
      const worker = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent) => {
        const w = waiting.get(event.data.id);
        if (!w) return;
        waiting.delete(event.data.id);
        if (event.data.error) w.fail(new Error(event.data.error)); else w.done(event.data.heights as Float32Array);
      };
      worker.onerror = () => {
        // a worker that breaks fails what it was doing (read again the slower way) and the workers are not used again
        for (const [, w] of waiting) w.fail(new Error('the tile worker stopped'));
        waiting.clear();
        workers = null;
      };
      return worker;
    });
  } catch {
    workers = null;
  }
  return workers;
}

async function readTile(url: string, P: number): Promise<Float32Array> {
  const pool = workerPool();
  if (pool) {
    try {
      const id = ++asked;
      const absolute = new URL(url, location.href).toString(); // (a worker reads addresses from where its own code is)
      return await new Promise<Float32Array>((done, fail) => {
        waiting.set(id, { done, fail });
        pool[id % pool.length].postMessage({ id, url: absolute, P });
        window.setTimeout(() => { if (waiting.delete(id)) fail(new Error('the tile worker took too long')); }, 20000);
      });
    } catch (error) {
      console.warn('Reading the tile in a worker failed; reading it here instead.', error);
    }
  }
  const picture = await new Promise<HTMLImageElement>((done, fail) => {
    const image = new Image();
    image.onload = () => done(image);
    image.onerror = () => fail(new Error(`tile ${url}`));
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = P;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  if (!pen) throw new Error('no 2d drawing');
  pen.drawImage(picture, 0, 0, P, P);
  const colours = pen.getImageData(0, 0, P, P).data;
  const heights = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) {
    const e = colours[i * 4] * 256 + colours[i * 4 + 1] + colours[i * 4 + 2] / 256 - 32768;
    heights[i] = e < -6000 ? -6000 : e;
  }
  return heights;
}

/**
 * The SKIRT: for every edge square of a tile, a wall hanging `drop` metres straight down from the edge, shaded as the
 * ground at the edge above (its normals and its colour height), so it reads as more of the same ground. It sits just
 * behind the join with the next tile and fills any hairline gap there, without ever sticking out sideways.
 */
function skirtGeometry(grid: THREE.PlaneGeometry, seg: number, drop: number): THREE.BufferGeometry {
  const p = grid.attributes.position as THREE.BufferAttribute;
  const n = grid.attributes.normal as THREE.BufferAttribute;
  const across = seg + 1;
  const at = (ix: number, iz: number): number => iz * across + ix;
  const positions: number[] = [], normals: number[] = [], heights: number[] = [];
  const wall = (ax: number, az: number, bx: number, bz: number): void => {
    const a = at(ax, az), b = at(bx, bz);
    const A = [p.getX(a), p.getY(a), p.getZ(a)], B = [p.getX(b), p.getY(b), p.getZ(b)];
    const An = [n.getX(a), n.getY(a), n.getZ(a)], Bn = [n.getX(b), n.getY(b), n.getZ(b)];
    const Bd = [B[0], B[1] - drop, B[2]], Ad = [A[0], A[1] - drop, A[2]];
    // EACH WALL TWICE, ONE COPY WOUND EACH WAY (v0.2.168; Joshua's "dark streak in the mountains"): a wall's face
    // can be toward the camera on either side, depending on the edge. It was one copy drawn from both sides, and
    // three.js turns a face's light round when its BACK is seen (as if the ground faced down): wherever a fine tile's
    // edge sits a little below its coarser neighbour's, that strip of wall showed nearly black, a dark dashed line
    // along the tile's edge on the hills. Now the copy facing the camera is drawn (its back is culled) and lit with
    // the ground's own facing above it, so it takes the ground's colour and light and does not show.
    positions.push(...A, ...B, ...Bd, ...A, ...Bd, ...Ad);   // one way round
    normals.push(...An, ...Bn, ...Bn, ...An, ...Bn, ...An);
    heights.push(A[1], B[1], B[1], A[1], B[1], A[1]);
    positions.push(...A, ...Bd, ...B, ...A, ...Ad, ...Bd);   // the other
    normals.push(...An, ...Bn, ...Bn, ...An, ...An, ...Bn);
    heights.push(A[1], B[1], B[1], A[1], A[1], B[1]);
  };
  for (let i = 0; i < seg; i++) {
    wall(i, 0, i + 1, 0);       // north edge
    wall(i, seg, i + 1, seg);   // south
    wall(0, i, 0, i + 1);       // west
    wall(seg, i, seg, i + 1);   // east
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aElev', new THREE.Float32BufferAttribute(heights, 1));
  return g;
}
