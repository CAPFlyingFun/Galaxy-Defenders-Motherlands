// ============================================================================
// tileStreamer.ts -- keeps the island's height tiles round the heroine loaded,
// and only those.
//
// THE ISLAND (Joshua, 2026-11-19: "import the real island map from Beyond
// Extinction... true scale"): 56 km across, cut into 8 x 8 tiles of 7 km
// (columns A..H west to east, rows 1..8 north to south), each a 513 x 513
// height picture of the real ground (public/island/kauai/, copied from Beyond
// Extinction: see public/island/COPIED_FROM.md). Far too much to keep on a
// phone at once, so this keeps the 3 x 3 tiles round her (21 km square; she
// is always at least 3.5 km from its edge) and drops the rest. Walking onto a
// new tile, the row ahead is fetched (in a worker: tileWorker.ts) and the row
// behind let go. Past them the coarse far island stands in (farIsland.ts).
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
//   * No rivers carved in yet (Beyond Extinction cuts them into the heights;
//     they come back with the water, later).
// ============================================================================
import * as THREE from 'three';
import { FAR_TILE_SEG, SEG, renderedSurfaceHeight } from './terrainSampling';
import { makeGroundMaterial, type GroundPictures } from './groundPaint';

/** The island's list of tiles (public/island/kauai/manifest.json; only what is used here). */
export interface IslandManifest {
  tileSizeM: number;
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
 * edge), and with the half grid otherwise. With her near a corner up to four tiles are fine; usually one or two.
 * Phones: one fine tile is 74,000 triangles, a half one 18,000, so the 3 x 3 costs about 220,000 instead of 660,000.
 */
const FINE_WITHIN = 1500;

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
  /** 8 x 8, one byte a tile: 255 where the tile is drawn in full (the far island leaves those squares out). */
  readonly shown: THREE.DataTexture;
  private readonly S: number;
  private readonly P: number;
  private readonly byId = new Map<string, IslandManifest['tiles'][number]>();
  private readonly tiles = new Map<string, Tile>();
  private readonly material: THREE.MeshStandardMaterial;
  /** The skirts' copy, drawn from both sides (a wall's front can face either way, depending on the edge). */
  private readonly skirtMaterial: THREE.MeshStandardMaterial;
  private readonly shownBytes = new Uint8Array(64);
  private curCol = -99;
  /** Where she was last told to be (a tile that arrives is built for there). */
  private herX = 0;
  private herZ = 0;
  private curRow = -99;

  /**
   * @param base    where the island's files are (the game's address + "island/")
   * @param origin  the arrival point in the island's own metres: the game's (0, 0)
   */
  constructor(private readonly manifest: IslandManifest, pictures: GroundPictures, private readonly base: string, private readonly origin: THREE.Vector2) {
    this.S = manifest.tileSizeM;
    this.P = manifest.tilePixels;
    for (const t of manifest.tiles) this.byId.set(t.id, t);
    this.group.name = 'island-tiles';
    this.material = makeGroundMaterial(pictures);
    this.skirtMaterial = makeGroundMaterial(pictures);
    this.skirtMaterial.side = THREE.DoubleSide;
    this.shown = new THREE.DataTexture(this.shownBytes, 8, 8, THREE.RedFormat, THREE.UnsignedByteType);
    this.shown.magFilter = this.shown.minFilter = THREE.NearestFilter;
    this.shown.needsUpdate = true;
  }

  // ---- Where things are -----------------------------------------------------------------------------------------
  // The game's (x, z) is the island's (x + origin.x, z + origin.y). Tile (col, row) has its centre at
  // ((col - 3.5) * S, (row - 3.5) * S) in the island's metres.
  private colOf(gameX: number): number { return Math.round((gameX + this.origin.x) / this.S + 3.5); }
  private rowOf(gameZ: number): number { return Math.round((gameZ + this.origin.y) / this.S + 3.5); }
  private static key(col: number, row: number): string { return `${col},${row}`; }
  private static idOf(col: number, row: number): string { return String.fromCharCode(65 + col) + (row + 1); }

  /**
   * The height of the DRAWN ground at a place in the game's world, metres above the sea. NaN where no tile is
   * loaded (she is never let walk there: islandWalls.ts).
   */
  heightAt(gameX: number, gameZ: number): number {
    const t = this.tiles.get(TileStreamer.key(this.colOf(gameX), this.rowOf(gameZ)));
    if (!t?.heights) return NaN;
    return renderedSurfaceHeight(t.heights, this.P, this.S, gameX + this.origin.x - t.cx, gameZ + this.origin.y - t.cz, t.seg);
  }

  /** How many of the tiles that should be round (gameX, gameZ) are loaded, of how many (for the loading bar). */
  loadState(gameX: number, gameZ: number): { ready: number; total: number } {
    let ready = 0, total = 0;
    for (const [col, row] of this.ring(gameX, gameZ)) {
      total++;
      if (this.tiles.get(TileStreamer.key(col, row))?.heights) ready++;
    }
    return { ready, total };
  }

  /** Call every frame with where she is: when she has crossed onto another tile, the ring round her is redone. */
  update(gameX: number, gameZ: number): void {
    this.herX = gameX;
    this.herZ = gameZ;
    this.refine(gameX, gameZ);
    const col = Math.min(7, Math.max(0, this.colOf(gameX)));
    const row = Math.min(7, Math.max(0, this.rowOf(gameZ)));
    if (col === this.curCol && row === this.curRow) return;
    this.curCol = col;
    this.curRow = row;
    const want = new Set<string>();
    for (const [c, r] of this.ring(gameX, gameZ)) {
      const key = TileStreamer.key(c, r);
      want.add(key);
      const have = this.tiles.get(key);
      if (have) have.wanted = true;
      else void this.load(c, r, key);
    }
    for (const [key, t] of this.tiles) {
      if (want.has(key)) continue;
      t.wanted = false;
      if (t.mesh) this.drop(key, t); // (one still loading is dropped when it arrives)
    }
  }

  /** The grid a tile should have with her at (gameX, gameZ): fine if she is within FINE_WITHIN of it. */
  private segFor(t: Tile, gameX: number, gameZ: number): number {
    const half = this.S / 2;
    const dx = Math.max(0, Math.abs(gameX + this.origin.x - t.cx) - half);
    const dz = Math.max(0, Math.abs(gameZ + this.origin.y - t.cz) - half);
    return Math.hypot(dx, dz) <= FINE_WITHIN ? SEG : FAR_TILE_SEG;
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
    const col = Math.min(7, Math.max(0, this.colOf(gameX)));
    const row = Math.min(7, Math.max(0, this.rowOf(gameZ)));
    for (let dc = -RADIUS; dc <= RADIUS; dc++) {
      for (let dr = -RADIUS; dr <= RADIUS; dr++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || c > 7 || r < 0 || r > 7 || !this.byId.has(TileStreamer.idOf(c, r))) continue;
        yield [c, r];
      }
    }
  }

  private async load(col: number, row: number, key: string): Promise<void> {
    const id = TileStreamer.idOf(col, row);
    const entry = this.byId.get(id)!;
    const tile: Tile = { id, col, row, cx: (col - 3.5) * this.S, cz: (row - 3.5) * this.S, seg: FAR_TILE_SEG, wanted: true };
    this.tiles.set(key, tile);
    let heights: Float32Array;
    try {
      heights = await readTile(`${this.base}kauai/${entry.file}`, this.P);
    } catch (error) {
      console.warn(`Island tile ${id} did not load; it is tried again when she next crosses a tile.`, error);
      if (this.tiles.get(key) === tile) this.tiles.delete(key);
      this.curCol = -99; // (so the next frame redoes the ring and asks for it again)
      return;
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
    this.shownBytes[row * 8 + col] = on ? 255 : 0;
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
    const skirt = new THREE.Mesh(skirtGeometry(geometry, seg, SKIRT_DROP), this.skirtMaterial);
    mesh.add(skirt);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  /** Let go of everything (when the game restarts). */
  dispose(): void {
    for (const [key, t] of [...this.tiles]) this.drop(key, t);
    this.material.dispose();
    this.skirtMaterial.dispose();
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
    positions.push(...A, ...B, B[0], B[1] - drop, B[2], ...A, B[0], B[1] - drop, B[2], A[0], A[1] - drop, A[2]);
    normals.push(...An, ...Bn, ...Bn, ...An, ...Bn, ...An);
    heights.push(A[1], B[1], B[1], A[1], B[1], A[1]);
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
