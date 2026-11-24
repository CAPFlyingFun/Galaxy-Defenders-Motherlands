// ============================================================================
// trees.ts -- THE ISLAND'S FOREST: Beyond Extinction's streamed photo trees
// (Joshua, 2026-11-20: "we were planning on landscaping next... I'd use what
// Beyond Extinction did which I think was flat images").
//
// Brought over from Beyond Extinction's `KauaiTrees.ts` (its web version,
// main at 70f3f97), the forest it grows on this same island at this same true
// scale. What it does, as it was there:
//
//   * EACH TREE IS ONE PHOTO on a single upright quad (two triangles) that
//     turns round its own trunk to face the camera, swayed by the wind, all in
//     the graphics chip's vertex program: the CPU does nothing per tree per
//     frame. Every tree of one kind in one patch of ground is ONE draw
//     (an InstancedMesh). A photo canopy reads better far off than a low-poly
//     model, at a tiny fraction of its cost.
//   * WHERE THEY GROW IS THE REAL ISLAND'S: the baked USGS/ESA rasters
//     (public/island/veg/, 146 m a pixel) say tree, shrub or open ground and
//     how thick the canopy is; the water masks, and the rivers and lakes
//     themselves (hydro.ts `waterNear`), keep them out of the water.
//   * WHICH KIND is by height above the sea, coast to summit: palms, cycads and
//     sago palms fringe the coast, ferns carpet the low jungle, broadleaf
//     (aspen) on the mid slopes, conifers near the top, and a low bush under
//     nearly all of it.
//   * STREAMED: the island is cut into 300 m patches; only those within
//     `BUILD_M` of her whose ground tile has loaded are planted (a couple a
//     frame, nearest first, so crossing a tile never hitches), and patches past
//     `KEEP_M` are let go, so memory stays the same however far she goes.
//     Each tree is solid to 75% of `DRAW_M` and dissolves (dithered) by it.
//
// CHANGED FOR THIS GAME: positions are the island's own metres inside a group
// moved by her arrival point (the game's 0, 0), as the rivers are
// (islandWorld.ts); pictures come from public/island/; the camera's position
// is turned into island metres for the distances.
//
// PHASE 2 (Joshua, 2026-11-20): LANDSCAPING MODES and REAL 3D TREES
// (treeObjects.ts, treeModels.ts). Every planted tree is also kept in its
// patch's list (`Cell.trees`), so in Hybrid the photo turns into a 3D model of
// the same kind on the very same spot near the camera, and in Objects only the
// 3D models stand in for all of them. Their trunks are solid (`trunkBlocks`).
// Every fade is a WIPE UP THE TREE ("trunk first, then the tops").
// ============================================================================
import * as THREE from 'three';
import { sizedPictureAsync } from '../../core/textureSizes';
import type { HydroGround, KauaiHydro } from './hydro';
import {
  FADE_FRAGMENT_CUT, FADE_FRAGMENT_HEAD, FADE_VERTEX_HEAD, SWAP_M, TreeObjects, fadeRange, fadeUniforms, setFade, trunkRadius,
  type FadeRange, type Landscaping, type Planted,
} from './treeObjects';

/**
 * THE FOREST'S NUMBERS (Beyond Extinction's, as it ships on phones):
 *   CHUNK          metres a side of one streamed patch
 *   STEP           metres between possible planting places (closer = fuller)
 *   DENSITY        how much the canopy's own cover is thickened
 *   BUILD_M        patches are planted within this distance of the camera
 *   KEEP_M         and let go past this one
 *   DRAW_M         a tree is drawn up to this far (solid to 75% of it, then dissolving)
 *   BUILD_PER_FRAME  patches planted in one frame at most
 *   WATER_MARGIN   metres kept clear of any river or lake's edge
 */
const CHUNK = 300;
const STEP = 8.2;
const DENSITY = 1.45;
const BUILD_M = 1050;
const KEEP_M = 2600;
const DRAW_M = 900;
const BUILD_PER_FRAME = 2;
const WATER_MARGIN = 2.5;

/** The vegetation rasters: 384 pixels over the island's 56 km square (veg/veg.json). */
const VEG_GRID = 384;
const MAP_M = 56000;

/** A kind of plant: its picture, height (metres), the heights above the sea it grows between, sway, how often picked. */
interface Species {
  readonly file: string;
  readonly height: number;
  readonly minH: number;
  readonly maxH: number;
  readonly sway: number;
  readonly weight: number;
}

/** Coast to summit, by the real island's heights (metres above the sea): Beyond Extinction's list. */
const SPECIES: readonly Species[] = [
  { file: 'billboards/billboard_bush_01.png', height: 2.6, minH: 0.5, maxH: 620, sway: 0.4, weight: 1.1 },
  { file: 'trees/palm.png', height: 13, minH: 0.5, maxH: 24, sway: 1.2, weight: 0.5 },
  { file: 'trees/cycad.png', height: 6, minH: 0.5, maxH: 30, sway: 0.5, weight: 0.7 },
  { file: 'trees/sago.png', height: 6.5, minH: 1, maxH: 45, sway: 0.5, weight: 0.7 },
  { file: 'trees/fern.png', height: 4.5, minH: 1, maxH: 260, sway: 0.8, weight: 1.0 },
  { file: 'trees/aspen.png', height: 12, minH: 60, maxH: 680, sway: 1.0, weight: 0.9 },
  { file: 'trees/conifer.png', height: 14, minH: 460, maxH: 1600, sway: 1.2, weight: 0.85 },
];

/** A steady number 0..1 for a grid place: the same place always grows the same plant. */
function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * THE TREE MATERIAL: the photo, unlit (it is already lit), its quad turned round to face the camera about the trunk
 * only, its crown swayed by the wind (more the higher up the picture), and dissolved by distance in a fine dither (no
 * see-through sorting needed). All in the vertex and fragment programs.
 */
function billboardMaterial(picture: THREE.Texture, sway: number, time: { value: number }, fade: FadeRange): THREE.Material {
  const material = new THREE.MeshBasicMaterial({ map: picture, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false, fog: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: sway };
    // (how far it fades in, where its 3D model takes over in Hybrid, and out: treeObjects.ts)
    fadeUniforms(shader, fade);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uSway;
        ${FADE_VERTEX_HEAD}`)
      .replace('#include <project_vertex>', `
        vec3 bbBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;   // the foot of the trunk
        float bbW = length(instanceMatrix[0].xyz);                                      // its width
        float bbH = length(instanceMatrix[1].xyz);                                      // its height
        vec3 bbToCam = cameraPosition - bbBase; bbToCam.y = 0.0;                        // facing the camera, level
        float bbLen = length(bbToCam);
        vec3 bbLook = bbLen > 1e-4 ? bbToCam / bbLen : vec3(0.0, 0.0, 1.0);
        vec3 bbRight = normalize(cross(vec3(0.0, 1.0, 0.0), bbLook));
        float bbPh = dot(bbBase.xz, vec2(0.031, 0.017));                                // each tree its own beat
        float bbBend = position.y * position.y;                                         // the crown sways, the foot not
        float bbSway = (sin(uTime * 1.1 + bbPh) + 0.5 * sin(uTime * 2.3 + bbPh * 1.7)) * uSway * bbBend;
        vec3 bbWorld = bbBase + bbRight * (position.x * bbW + bbSway) + vec3(0.0, position.y * bbH, 0.0);
        vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        treeFade(bbLen, position.y);   // (the wipe climbs the picture: foot 0, top 1)`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${FADE_FRAGMENT_HEAD}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        ${FADE_FRAGMENT_CUT}`);
  };
  material.customProgramCacheKey = () => 'island-billboard-tree';
  return material;
}

/** A vegetation raster: one byte a pixel. */
interface Raster { data: Uint8ClampedArray; w: number; h: number }

/** zlib-inflate bytes with the browser's own DecompressionStream. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * Read an 8-bit grey PNG (all four rasters are) into one byte a pixel, wholly on the CPU. (Beyond Extinction's way:
 * through a picture and a canvas, under a busy graphics chip, the browser sometimes handed back an empty picture and
 * nothing was planted.)
 */
async function loadRaster(url: string): Promise<Raster | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(buf.buffer);
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;   // (not a PNG)
    let w = 0, h = 0;
    const idat: Uint8Array[] = [];
    for (let i = 8; i < buf.length;) {
      const len = view.getUint32(i);
      const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
      const start = i + 8;
      if (type === 'IHDR') {
        w = view.getUint32(start); h = view.getUint32(start + 4);
        if (buf[start + 8] !== 8 || buf[start + 9] !== 0 || buf[start + 12] !== 0) return null;   // 8-bit grey, not interlaced
      } else if (type === 'IDAT') idat.push(buf.subarray(start, start + len));
      else if (type === 'IEND') break;
      i = start + len + 4;
    }
    if (!w || !h || !idat.length) return null;
    const packed = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of idat) { packed.set(c, off); off += c.length; }
    const raw = await inflate(packed);
    // undo each line's PNG filter (one byte a pixel)
    const out = new Uint8ClampedArray(w * h);
    let pos = 0;
    for (let y = 0; y < h; y++) {
      const filter = raw[pos++];
      for (let x = 0; x < w; x++) {
        const v0 = raw[pos + x];
        const a = x >= 1 ? out[y * w + x - 1] : 0, b = y >= 1 ? out[(y - 1) * w + x] : 0, c = x >= 1 && y >= 1 ? out[(y - 1) * w + x - 1] : 0;
        let v = v0;
        if (filter === 1) v = v0 + a;
        else if (filter === 2) v = v0 + b;
        else if (filter === 3) v = v0 + ((a + b) >> 1);
        else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = v0 + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        out[y * w + x] = v & 255;
      }
      pos += w;
    }
    return { data: out, w, h };
  } catch {
    return null;
  }
}

/** A raster's value at a place (island metres), nearest pixel; 0 without it. */
function sampleNearest(r: Raster | null, x: number, z: number): number {
  if (!r) return 0;
  const px = Math.round(((x / MAP_M + 0.5) * (VEG_GRID - 1)) | 0), py = Math.round(((z / MAP_M + 0.5) * (VEG_GRID - 1)) | 0);
  return px < 0 || py < 0 || px >= r.w || py >= r.h ? 0 : r.data[py * r.w + px];
}

/** A raster's value at a place, blended between its four pixels (for the smooth canopy). */
function sampleBilinear(r: Raster | null, x: number, z: number): number {
  if (!r) return 0;
  const fx = Math.min(r.w - 1, Math.max(0, (x / MAP_M + 0.5) * (VEG_GRID - 1))), fy = Math.min(r.h - 1, Math.max(0, (z / MAP_M + 0.5) * (VEG_GRID - 1)));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(r.w - 1, x0 + 1), y1 = Math.min(r.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0, d = r.data;
  return d[y0 * r.w + x0] * (1 - tx) * (1 - ty) + d[y0 * r.w + x1] * tx * (1 - ty) + d[y1 * r.w + x0] * (1 - tx) * ty + d[y1 * r.w + x1] * tx * ty;
}

/** One planted patch. */
/**
 * One planted patch: its photo draws, and every tree in it (for the 3D trees and the solid trunks; `trunks` only those
 * with a trunk to bump into).
 */
interface Cell { ci: number; cj: number; cx: number; cz: number; meshes: THREE.InstancedMesh[]; trees: Planted[]; trunks: Planted[] }
/** The rivers and lakes near a patch (hydro.ts). */
type WaterSet = ReturnType<KauaiHydro['waterNear']>;

/** Squared distance from a point to a line segment, across the ground. */
function distSqToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = Math.min(1, Math.max(0, len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0));
  const cx = ax + t * dx, cz = az + t * dz;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}
/** Is a point inside a closed ring of [x, z] points (even-odd)? */
function pointInRing(px: number, pz: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Does a point touch any river or lake of the set (their widths already grown by WATER_MARGIN)? */
function touchesWater(px: number, pz: number, water: WaterSet): boolean {
  for (const s of water.segs) if (distSqToSeg(px, pz, s.ax, s.az, s.bx, s.bz) <= s.half * s.half) return true;
  for (const l of water.lakes) if (pointInRing(px, pz, l.ring) && !l.holes.some((hole) => pointInRing(px, pz, hole))) return true;
  return false;
}

/**
 * THE FOREST. `parent` is the island's group moved by her arrival point (positions inside it are the island's own
 * metres); `base` is where the island's files are.
 */
export class IslandTrees {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  /** The photos' fade (in: only in Hybrid, where the 3D trees take over; out: by DRAW_M). */
  private readonly fade = fadeRange(0, 0, DRAW_M * 0.75, DRAW_M);
  /** Settings -> WORLD -> Landscaping (treeObjects.ts). */
  private mode: Landscaping;
  /** The 3D trees, made the first time Hybrid or Objects only is chosen. */
  private objects: TreeObjects | null = null;
  private readonly quad: THREE.PlaneGeometry;
  private materials: (THREE.Material | null)[] = [];
  private pictures: (THREE.Texture | null)[] = [];
  private widths: number[] = [];
  private canopy: Raster | null = null;
  private landcover: Raster | null = null;
  private water: Raster | null = null;
  private river: Raster | null = null;
  private ready = false;
  /** Whether its files have been asked for (not with Landscaping Off: `setMode` asks when it is turned on). */
  private started = false;
  /**
   * Whether the forest may start loading at all (v0.2.150, the island's gentle start: `begin`, called once she is
   * playing and the tiles round her are in, so its maps and photos never load with the start).
   */
  private allowed = false;
  private disposed = false;
  private readonly cells = new Map<string, Cell>();
  private readonly buildQueue: { ci: number; cj: number }[] = [];
  /** (scratch) */
  private readonly dummy = new THREE.Object3D();

  /** How many patches are planted now (for the readout). */
  get cellCount(): number { return this.cells.size; }
  /** How many trees are drawn now, and in how many draws (for the readout). */
  get counts(): { trees: number; draws: number } {
    let trees = 0, draws = 0;
    for (const cell of this.cells.values()) for (const m of cell.meshes) if (m.visible) { trees += m.count; draws++; }
    if (this.objects) { const o = this.objects.counts(); trees += o.trees; draws += o.draws; }
    return { trees, draws };
  }

  constructor(parent: THREE.Object3D, private readonly base: string, mode: Landscaping = 'hybrid') {
    this.group.name = 'island-trees';
    parent.add(this.group);
    this.mode = mode;
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.quad.translate(0, 0.5, 0);   // (its foot at the bottom, so each tree stands on its spot)
    this.setMode(mode);   // (starts loading its files, unless Landscaping is Off)
  }

  private async init(): Promise<void> {
    // (the rasters one at a time: Beyond Extinction found reading them all at once could come back empty)
    this.canopy = await loadRaster(`${this.base}veg/canopy.png`);
    if (this.disposed) return;
    this.landcover = await loadRaster(`${this.base}veg/landcover.png`);
    if (this.disposed) return;
    this.water = await loadRaster(`${this.base}veg/water.png`);
    if (this.disposed) return;
    this.river = await loadRaster(`${this.base}veg/river.png`);
    if (this.disposed) return;
    // (WORLD pictures by their size setting: core/textureSizes.ts, v0.2.148; a picture's shape, its width over its
    //  height, is the same at every size, so each tree's width below is too)
    //  ONE AT A TIME (v0.2.150, the island's gentle start), not all six together)
    this.pictures = [];
    for (const sp of SPECIES) {
      this.pictures.push(await sizedPictureAsync(`${this.base}${sp.file}`, 'world', (t) => { t.colorSpace = THREE.SRGBColorSpace; }).catch(() => null));
      if (this.disposed) break;
    }
    if (this.disposed) { for (const p of this.pictures) p?.dispose(); return; }
    this.materials = SPECIES.map((sp, s) => {
      const picture = this.pictures[s];
      if (!picture) return null;
      picture.colorSpace = THREE.SRGBColorSpace;
      picture.anisotropy = 4;
      const img = picture.image as { width: number; height: number } | undefined;
      this.widths[s] = sp.height * (img && img.height ? img.width / img.height : 0.6);
      return billboardMaterial(picture, sp.sway, this.time, this.fade);
    });
    this.ready = true;
  }

  /** Plant one patch: places on a jittered grid, kept to the real forest and off the water, stood on the ground. */
  private buildCell(ci: number, cj: number, ground: HydroGround, water: WaterSet | null): void {
    const key = `${ci},${cj}`;
    if (this.cells.has(key)) return;
    const x0 = ci * CHUNK, z0 = cj * CHUNK;
    const buckets: THREE.Matrix4[][] = SPECIES.map(() => []);
    const trees: Planted[] = [];
    const dummy = this.dummy;
    for (let gx = x0; gx < x0 + CHUNK; gx += STEP) {
      for (let gz = z0; gz < z0 + CHUNK; gz += STEP) {
        const i = Math.round(gx / STEP), j = Math.round(gz / STEP);
        const px = gx + (hash(i, j, 21) - 0.5) * STEP * 0.9, pz = gz + (hash(i, j, 22) - 0.5) * STEP * 0.9;
        // land only, off the water, where the real island has trees or shrubs
        if (sampleNearest(this.water, px, pz) > 0) continue;
        if (sampleNearest(this.river, px, pz) > 90) continue;
        const lc = sampleNearest(this.landcover, px, pz);
        const isTree = lc === 10, isShrub = lc === 20;
        if (!isTree && !isShrub) continue;
        // how likely a plant is here: the canopy's own cover, thinner on shrubland
        const canopy = sampleBilinear(this.canopy, px, pz) / 255;
        const chance = Math.min(1, canopy * DENSITY * (isTree ? 1 : 0.45));
        if (chance < 0.04 || hash(i, j, 23) > chance) continue;
        // on the ground as drawn, never at or under the sea's edge
        const h = ground.surfaceHeightAt(px, pz);
        if (h < 1) continue;
        // and off any river or lake (the rasters are too coarse for narrow channels)
        if (water && touchesWater(px, pz, water)) continue;
        // which kind: by height above the sea, picked by weight among those that grow here
        let total = 0;
        for (let s = 0; s < SPECIES.length; s++) if (h >= SPECIES[s].minH && h <= SPECIES[s].maxH && this.materials[s]) total += SPECIES[s].weight;
        if (total <= 0) continue;
        let r = hash(i, j, 24) * total, pick = -1;
        for (let s = 0; s < SPECIES.length; s++) {
          const sp = SPECIES[s];
          if (h < sp.minH || h > sp.maxH || !this.materials[s]) continue;
          r -= sp.weight;
          if (r <= 0) { pick = s; break; }
        }
        if (pick < 0) continue;
        const scale = 0.82 + hash(i, j, 28) * 0.42;
        dummy.position.set(px, h - 0.4, pz);   // (its foot a little in the ground)
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(this.widths[pick] * scale, SPECIES[pick].height * scale, 1);
        dummy.updateMatrix();
        buckets[pick].push(dummy.matrix.clone());
        // (and kept, for its 3D model: the same kind, as tall, on the same spot, turned its own way)
        trees.push({ x: px, y: h - 0.1, z: pz, height: SPECIES[pick].height * scale, turn: hash(i, j, 29) * Math.PI * 2, kind: pick });
      }
    }
    const meshes: THREE.InstancedMesh[] = [];
    SPECIES.forEach((sp, s) => {
      const list = buckets[s], material = this.materials[s];
      if (!list.length || !material) return;
      const im = new THREE.InstancedMesh(this.quad, material, list.length);
      list.forEach((m, k) => im.setMatrixAt(k, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += sp.height + sp.sway * 2;   // (the quads turn and sway)
      im.frustumCulled = true;
      im.castShadow = false;
      im.receiveShadow = false;
      im.name = `island-trees-${s}-${key}`;
      this.group.add(im);
      meshes.push(im);
    });
    const trunks = trees.filter((t) => trunkRadius(t.kind, t.height) > 0);
    this.cells.set(key, { ci, cj, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, meshes, trees, trunks });
  }

  private disposeCell(cell: Cell): void {
    // (the quad and materials are shared; each mesh's own instance list is let go)
    for (const m of cell.meshes) { this.group.remove(m); m.dispose(); }
    this.cells.delete(`${cell.ci},${cell.cj}`);
  }

  /**
   * Every frame. `camX`/`camZ`: the camera, in the island's own metres; `ground` the ground as drawn (island metres);
   * `hydro` the rivers and lakes, so a new patch keeps off them (null: Rivers & lakes off, no water anywhere).
   */
  update(dt: number, camX: number, camZ: number, ground: HydroGround, hydro: KauaiHydro | null): void {
    this.time.value += dt;
    if (!this.ready) return;
    // let go of patches that drifted past KEEP_M (memory stays bounded)
    for (const cell of [...this.cells.values()]) if ((cell.cx - camX) ** 2 + (cell.cz - camZ) ** 2 > KEEP_M * KEEP_M) this.disposeCell(cell);
    // queue the patches near enough whose ground is loaded
    const c0 = Math.floor((camX - BUILD_M) / CHUNK), c1 = Math.floor((camX + BUILD_M) / CHUNK);
    const r0 = Math.floor((camZ - BUILD_M) / CHUNK), r1 = Math.floor((camZ + BUILD_M) / CHUNK);
    for (let ci = c0; ci <= c1; ci++) {
      for (let cj = r0; cj <= r1; cj++) {
        if (this.cells.has(`${ci},${cj}`)) continue;
        const cx = ci * CHUNK + CHUNK / 2, cz = cj * CHUNK + CHUNK / 2;
        if ((cx - camX) ** 2 + (cz - camZ) ** 2 > BUILD_M * BUILD_M) continue;
        if (!ground.tileReadyAt(cx, cz)) continue;
        if (!this.buildQueue.some((q) => q.ci === ci && q.cj === cj)) this.buildQueue.push({ ci, cj });
      }
    }
    // a couple a frame, nearest first; not before the rivers and lakes are known (or trees could stand in a channel)
    this.buildQueue.sort((a, b) => ((a.ci * CHUNK - camX) ** 2 + (a.cj * CHUNK - camZ) ** 2) - ((b.ci * CHUNK - camX) ** 2 + (b.cj * CHUNK - camZ) ** 2));
    for (let n = 0; (!hydro || hydro.isLoaded) && n < BUILD_PER_FRAME && this.buildQueue.length; n++) {
      const { ci, cj } = this.buildQueue.shift()!;
      const x0 = ci * CHUNK, z0 = cj * CHUNK;
      const water = hydro ? hydro.waterNear(x0 - WATER_MARGIN, z0 - WATER_MARGIN, x0 + CHUNK + WATER_MARGIN, z0 + CHUNK + WATER_MARGIN, WATER_MARGIN) : null;
      this.buildCell(ci, cj, ground, water);
    }
    // a whole patch is hidden once it is past the fade (each tree fades by itself before that); no photos at all in
    // Objects only
    const most = DRAW_M + CHUNK;
    const photos = this.mode === 'images' || this.mode === 'hybrid';
    for (const cell of this.cells.values()) {
      const vis = photos && (cell.cx - camX) ** 2 + (cell.cz - camZ) ** 2 < most * most;
      for (const m of cell.meshes) m.visible = vis;
    }
    // the 3D trees near the camera (Hybrid, Objects only)
    if (this.mode === 'hybrid' || this.mode === 'objects') {
      if (!this.objects) this.objects = new TreeObjects(this.group, this.base, this.time);
      this.objects.update(this.mode, camX, camZ, this.cells.size, () => this.cells.values());
    } else this.objects?.update(this.mode, camX, camZ, this.cells.size, () => []);
  }

  /**
   * SETTINGS -> WORLD -> LANDSCAPING, live: Images only, Hybrid, Objects only or Off (treeObjects.ts). The photos fade
   * in from the swap in Hybrid (where the 3D trees fade out).
   */
  setMode(mode: Landscaping): void {
    this.mode = mode;
    this.group.visible = mode !== 'off';
    // NOTHING LOADED WHILE IT IS OFF (Joshua, 2026-11-21, ChatGPT's review: the six tree photos, about 4 MB, and the
    // forest's maps were fetched and sent to the graphics chip with Landscaping Off too): the first time it is on, all
    // of it is loaded, as before
    if (mode !== 'off' && !this.started && this.allowed) { this.started = true; void this.init(); }
    if (mode === 'hybrid') setFade(this.fade, SWAP_M.start, SWAP_M.end, DRAW_M * 0.75, DRAW_M);
    else setFade(this.fade, 0, 0, DRAW_M * 0.75, DRAW_M);
  }

  /**
   * THE FOREST MAY LOAD NOW (v0.2.150; Joshua, 2026-11-22: her tile first, "the rest actually in the game not before"):
   * the island calls this once she is playing and the ground round her is in. Until then nothing of the forest is
   * fetched (its maps, its six photos, the 3D trees' bark), and none is planted.
   */
  begin(): void {
    if (this.allowed) return;
    this.allowed = true;
    this.setMode(this.mode);
  }

  /**
   * IS THERE A TRUNK IN THE WAY? (island metres; `body` her own radius). Only with 3D trees (Hybrid, Objects only) and
   * only trunks that are drawn: those near the camera, as she always is.
   */
  trunkBlocks(x: number, z: number, body: number): boolean {
    if (this.mode !== 'hybrid' && this.mode !== 'objects') return false;
    const ci = Math.floor(x / CHUNK), cj = Math.floor(z / CHUNK);
    for (let a = ci - 1; a <= ci + 1; a++) {
      for (let b = cj - 1; b <= cj + 1; b++) {
        const cell = this.cells.get(`${a},${b}`);
        if (!cell) continue;
        // (a neighbouring patch only matters within a couple of metres of its edge)
        if (a !== ci && Math.abs(x - (a < ci ? ci * CHUNK : (ci + 1) * CHUNK)) > 3) continue;
        if (b !== cj && Math.abs(z - (b < cj ? cj * CHUNK : (cj + 1) * CHUNK)) > 3) continue;
        for (const t of cell.trunks) {
          const r = trunkRadius(t.kind, t.height) + body;
          if ((t.x - x) ** 2 + (t.z - z) ** 2 < r * r) return true;
        }
      }
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    for (const cell of [...this.cells.values()]) this.disposeCell(cell);
    this.buildQueue.length = 0;
    this.objects?.dispose();
    for (const m of this.materials) m?.dispose();
    for (const p of this.pictures) p?.dispose();
    this.quad.dispose();
    this.group.removeFromParent();
  }
}
