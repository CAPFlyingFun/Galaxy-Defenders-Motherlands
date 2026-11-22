// ============================================================================
// carve.ts -- the island's rivers and lakes (public/island/kauai/hydro.json:
// the real USGS waterways, baked by Beyond Extinction), fetched ONCE, and
// pressed into each height tile as it arrives.
//
// Brought over from Beyond Extinction's src/engine/KauaiCarve.ts (main at
// 70f3f97). The channels are cut into the tile's HEIGHTS (not just its mesh)
// before anything reads them, so the ground drawn, the ground she stands on and
// the water's level (hydro.ts) all agree. Here it is a plain object made with
// the island's address, instead of Beyond Extinction's single shared one.
// All places are in the ISLAND'S own metres.
// ============================================================================
import { HALF_WORLD, carveTileHeights, riverCarveDepth, riverCarveRadius, type CarveLakeSpec, type CarveSeg } from './carveCore';

/** One river run as baked: the tile it was split into, and its points [x, y, z, width]. */
export interface HydroRiver {
  name: string | null;
  toOcean: boolean;
  order: number;
  tile: string;
  pts: [number, number, number, number][];
}
/** One lake: its waterline (metres above the sea), its shore, and any islands in it. */
export interface HydroLake {
  name: string | null;
  tile: string;
  y: number;
  ring: [number, number][];
  holes: [number, number][][];
}
export interface HydroDoc {
  version: number;
  rivers: HydroRiver[];
  lakes: HydroLake[];
}

export class CarveData {
  private segs: CarveSeg[] = [];
  private lakes: CarveLakeSpec[] = [];
  private loaded = false;
  private doc?: Promise<HydroDoc | null>;

  /** @param base where the island's files are (the game's address + "island/") */
  constructor(private readonly base: string) {}

  /**
   * Fetch hydro.json (once; later calls share it). Null if it fails: the tiles are then simply not carved, and
   * there is no water inland, but the island still works.
   */
  prefetch(): Promise<HydroDoc | null> {
    this.doc ??= (async () => {
      try {
        const answer = await fetch(`${this.base}kauai/hydro.json`);
        if (!answer.ok) throw new Error(`hydro.json ${answer.status}`);
        const doc = (await answer.json()) as HydroDoc;
        this.build(doc);
        return doc;
      } catch (error) {
        console.error('The island\'s rivers did not load: the ground stays uncarved.', error);
        return null;
      }
    })();
    return this.doc;
  }

  /** Each river as straight pieces (with how wide and deep its channel is cut), each lake with its bounds. */
  private build(doc: HydroDoc): void {
    for (const r of doc.rivers) {
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1], b = r.pts[i];
        const w = (a[3] + b[3]) / 2;
        this.segs.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], ay: a[1], by: b[1], r: riverCarveRadius(w), depth: riverCarveDepth(w) });
      }
    }
    for (const l of doc.lakes) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of l.ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      this.lakes.push({ y: l.y, ring: l.ring, holes: l.holes, minX, maxX, minZ, maxZ });
    }
    this.loaded = true;
  }

  /**
   * Cut the channels and lake beds into one tile's heights, in place (call after `prefetch` has finished). Only the
   * rivers and lakes that reach into the tile are looked at.
   */
  applyToTile(h: Float32Array, P: number, S: number, col: number, row: number): void {
    if (!this.loaded) return;
    // (the tile's west and north edges in the island's metres: its column's place from the island's west edge; any grid
    //  size, the 3.5 km tiles since v0.2.150 as Beyond Extinction's 7 km ones)
    const x0 = col * S - HALF_WORLD, x1 = x0 + S, z0 = row * S - HALF_WORLD, z1 = z0 + S;
    const segs = this.segs.filter((s) => Math.min(s.ax, s.bx) - s.r < x1 && Math.max(s.ax, s.bx) + s.r > x0 && Math.min(s.az, s.bz) - s.r < z1 && Math.max(s.az, s.bz) + s.r > z0);
    const lakes = this.lakes.filter((l) => l.minX < x1 && l.maxX > x0 && l.minZ < z1 && l.maxZ > z0);
    if (segs.length === 0 && lakes.length === 0) return;
    carveTileHeights(h, P, S, col, row, segs, lakes);
  }
}
