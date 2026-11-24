// ============================================================================
// floraPlanting.ts -- THE SCI-FI FLORA PLANTED ON THE ISLAND (Settings ->
// WORLD -> Landscaping -> "Sci-fi flora"; Joshua, 2026-11-24: "Good to push so
// I can test the landscaping in the game").
//
// The species are flora/floraModels.ts's (giant mushrooms, clusters, shelf
// fungi, alien plants), each drawn from its NEAR model close by and its FAR
// (light) model further off. This file decides WHERE they grow and draws them.
//
// WHERE: the island is cut into square patches, planted as the camera comes
// near (a few a frame, nearest first) and let go when it is far, so memory
// stays the same however far she goes. Three LAYERS, each with its own patch
// size and reach, because a giant is seen from much further than a fern:
//   SMALL   ground cover (clusters, ferns, pods, coral, shelf tiers on cliffs):
//           a place every 8 m tried, drawn to about 200 m;
//   MEDIUM  the tall caps and shelf boulders: every 20 m tried, the caps drawn
//           to about 470 m, the boulders to about 300 m;
//   GIANTS  the Sky Parasols and Rust Crowns, landmarks: one place a 400 m
//           square tried, drawn to about 1.5 km so they stand on the skyline.
// Every place is tried by a steady number made from where it is (the same
// island always grows the same plants), jittered off the grid, and grows only
// where the ground suits it, by height above the sea and slope, as the ground
// is coloured (groundPaint.ts): the BEACH (sand, under 3 m) a few spore pods
// and siphon coral; GRASS (3-9 m) clusters and ferns; the FOREST (9-700 m)
// the tall caps, clusters, ferns, shelf boulders and, sparsely, the giants;
// bare HILLSIDES fewer; HIGH ground (rock and basalt, over 700 m) shelf
// boulders; steep CLIFF faces shelf tiers growing out of the rock. Nothing in
// the sea (below 0.8 m), and a clear circle round her arrival point (the
// weapons table, bars and door stand there).
//
// DRAWN: ONE InstancedMesh for each species and detail level (at most 22
// draws), refilled from the planted patches whenever the camera has moved a
// few metres or turned a little: only the plants in front of the camera (a
// little wider than its view) and in reach go in, so what the phone draws is
// what can be seen. Each fades in and out with the 3D trees' dithered wipe
// (treeObjects.ts: the near model wipes away from its top as the far one
// wipes in from its foot), so nothing pops.
//
// AT NIGHT: `setNight(0..1)` turns up the glowing parts (floraMaterial.ts).
// THE STEMS ARE SOLID: `trunkBlocks` stops her at the tall caps', the giants'
// and the boulders' feet, as the 3D trees' trunks do.
// ============================================================================
import * as THREE from 'three';
import type { HydroGround, KauaiHydro } from '../hydro';
import { FADE_FRAGMENT_CUT, FADE_FRAGMENT_HEAD, FADE_VERTEX_HEAD, fadeRange, fadeUniforms, type FadeRange } from '../treeObjects';
import { noise3 } from './floraKit';
import { FLORA_HUES, FLORA_HUE_NAMES, floraUniforms, makeFloraMaterials, type FloraMaterials } from './floraMaterial';
import { FLORA_IDS, buildFlora, triangles, type FloraId, type FloraModel } from './floraModels';
import { floraSpecies } from './floraSpecies';

// ---- the three layers ----------------------------------------------------------------------------------------------
type LayerName = 'small' | 'medium' | 'giant';

/**
 * EACH PLANTING LAYER'S NUMBERS (GAME TUNING; metres):
 *   cell      a patch's side
 *   step      how far apart the places tried are (one a step each way, jittered)
 *   reach     patches are planted out to this far from the camera (the furthest any of its species is drawn)
 *   keep      patches further than this from the camera are let go
 *   clear     how far round her arrival point it keeps clear (plus the plant's own spread)
 */
const LAYERS: Record<LayerName, { cell: number; step: number; reach: number; keep: number; clear: number; salt: number }> = {
  small: { cell: 120, step: 8, reach: 205, keep: 360, clear: 25, salt: 11 },
  medium: { cell: 200, step: 20, reach: 470, keep: 700, clear: 30, salt: 23 },
  giant: { cell: 400, step: 400, reach: 1500, keep: 2100, clear: 80, salt: 37 },
};
/**
 * HOW FAR EACH IS DRAWN (GAME TUNING; metres from the camera to its foot), by how big it is:
 *   nearOut   the near model wipes away over [start, end], as the far one wipes in
 *   farOut    the far model wipes away over [start, end]
 * (Small things gone by about 200 m; the shelf boulders, 1-4 m, by 310; the tall caps by 470; the giants by 1.5 km.)
 */
type DrawClass = 'small' | 'boulder' | 'tall' | 'giant';
const DRAW: Record<DrawClass, { nearOut: [number, number]; farOut: [number, number] }> = {
  small: { nearOut: [48, 62], farOut: [165, 205] },
  boulder: { nearOut: [55, 70], farOut: [250, 310] },
  tall: { nearOut: [72, 90], farOut: [400, 470] },
  giant: { nearOut: [150, 180], farOut: [1350, 1500] },
};
const CLASS_OF: Record<FloraId, DrawClass> = {
  glowbellCluster: 'small', buttonCluster: 'small', crescentFern: 'small', sporePods: 'small', siphonCoral: 'small', bracketTiers: 'small',
  lanternCap: 'tall', umberParasol: 'tall', bracketBoulder: 'boulder',
  skyParasol: 'giant', rustCrown: 'giant',
};

/**
 * THE HEIGHTS THEY ARE PLANTED AT (metres; GAME TUNING), within each species' own range (floraSpecies.ts), and how
 * strongly small ones are favoured (the number a random share is raised to: 1 even, 2 mostly small). The clusters are
 * kept to 3 m: at 5 m their caps' facets show up close.
 */
const PLANT_SIZE: Record<FloraId, [number, number, number]> = {
  glowbellCluster: [0.3, 3, 2.2], buttonCluster: [0.25, 2.2, 2.2], crescentFern: [0.8, 2.8, 1.3], sporePods: [0.6, 2.2, 1.4],
  siphonCoral: [0.6, 2.6, 1.5], bracketTiers: [0.8, 2.6, 1.2],
  lanternCap: [8, 15, 1], umberParasol: [8, 14, 1], bracketBoulder: [1.2, 3.5, 1.4],
  skyParasol: [22, 40, 1], rustCrown: [20, 34, 1],
};

/**
 * HOW FAR EACH SPREADS round its foot (a share of its height): for the clear circle, the view test and, with `solid`,
 * what stops her walking (floraSpecies.ts `solid`; the giants' buttress roots wider than their stems).
 */
const SPREAD: Record<FloraId, number> = {
  glowbellCluster: 0.35, buttonCluster: 0.4, crescentFern: 0.65, sporePods: 0.5, siphonCoral: 0.3, bracketTiers: 0.3,
  lanternCap: 0.32, umberParasol: 0.34, bracketBoulder: 0.5, skyParasol: 0.43, rustCrown: 0.42,
};
const SOLID: Partial<Record<FloraId, number>> = { lanternCap: 0.045, umberParasol: 0.045, bracketBoulder: 0.36, skyParasol: 0.085, rustCrown: 0.085 };

// ---- what grows where ----------------------------------------------------------------------------------------------
/** The kinds of ground, as the ground is coloured (groundPaint.ts): by height above the sea and slope. */
type Ground = 'beach' | 'grass' | 'forest' | 'hill' | 'high' | 'cliff';

/** How the ground is told: `h` metres above the sea, `slope` 0 flat .. 1 a wall (1 minus its facing's up). */
function groundKind(h: number, slope: number): Ground | null {
  if (h < 0.8) return null;                  // the sea and the wet edge
  if (slope > 0.3) return 'cliff';           // steep faces are rock at any height
  if (h < 3) return 'beach';
  if (h < 9) return 'grass';
  if (h < 700) return slope > 0.14 ? 'hill' : 'forest';
  return 'high';
}

/**
 * WHAT EACH LAYER GROWS ON EACH GROUND (GAME TUNING): how likely a place tried is to grow anything, and the species
 * picked by weight. (A place left out is left bare: the ground itself shows.)
 */
const GROWS: Record<LayerName, Partial<Record<Ground, { chance: number; pick: [FloraId, number][] }>>> = {
  small: {
    beach: { chance: 0.07, pick: [['sporePods', 0.55], ['siphonCoral', 0.45]] },
    grass: { chance: 0.22, pick: [['glowbellCluster', 0.3], ['buttonCluster', 0.3], ['crescentFern', 0.45], ['sporePods', 0.12]] },
    forest: { chance: 0.3, pick: [['glowbellCluster', 0.28], ['buttonCluster', 0.24], ['crescentFern', 0.55], ['siphonCoral', 0.08], ['sporePods', 0.06]] },
    hill: { chance: 0.14, pick: [['crescentFern', 0.5], ['buttonCluster', 0.3], ['glowbellCluster', 0.2]] },
    high: { chance: 0.05, pick: [['glowbellCluster', 0.5], ['siphonCoral', 0.5]] },
    cliff: { chance: 0.06, pick: [['bracketTiers', 1]] },
  },
  medium: {
    grass: { chance: 0.04, pick: [['umberParasol', 0.6], ['lanternCap', 0.4]] },
    forest: { chance: 0.34, pick: [['lanternCap', 0.36], ['umberParasol', 0.34], ['bracketBoulder', 0.3]] },
    hill: { chance: 0.14, pick: [['bracketBoulder', 0.6], ['umberParasol', 0.2], ['lanternCap', 0.2]] },
    high: { chance: 0.08, pick: [['bracketBoulder', 1]] },
  },
  giant: {
    forest: { chance: 0.4, pick: [['skyParasol', 0.5], ['rustCrown', 0.5]] },
  },
};
/** Giants only on gentler ground well above the sea (GAME TUNING). */
const GIANT_HEIGHTS: [number, number] = [14, 650];

/** A steady number 0..1 for a grid place: the same place always gives the same number. */
function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- one planted plant ---------------------------------------------------------------------------------------------
interface Plant {
  id: FloraId;
  x: number; z: number;      // its foot, island metres
  height: number;            // metres
  reach: number;             // how far it spreads round its foot, metres
  solid: number;             // what stops her round its foot, metres (0: she walks through)
  matrix: THREE.Matrix4;     // where it stands, turned and scaled (island metres)
  hue: THREE.Color | null;   // its glow's colour (glowing species only)
}
interface Cell { layer: LayerName; ci: number; cj: number; cx: number; cz: number; plants: Plant[]; solids: Plant[] }

/** Each glowing plant's colour: the same over a stretch of ground (patches of colour), with now and then another. */
function hueAt(x: number, z: number, i: number, j: number, salt: number): THREE.Color {
  const n = noise3(x / 190, 0.5, z / 190, 7) * 0.7 + noise3(x / 60, 1.5, z / 60, 9) * 0.3;
  let k = Math.min(FLORA_HUE_NAMES.length - 1, Math.floor(n * FLORA_HUE_NAMES.length * 1.15 - 0.4));
  if (hash(i, j, salt + 91) < 0.22) k = Math.floor(hash(i, j, salt + 92) * FLORA_HUE_NAMES.length);
  return new THREE.Color(FLORA_HUES[FLORA_HUE_NAMES[Math.max(0, k)]]);
}

// ---- drawing -------------------------------------------------------------------------------------------------------
/** One species' draw at one detail level: an InstancedMesh refilled from the patches. */
interface Draw { id: FloraId; lod: 'near' | 'far'; mesh: THREE.InstancedMesh | null; capacity: number }

/** The wipe's numbers in the vertex program: the plant's foot's level distance to the camera, how far up it the point is. */
const FADE_CALL = `
  vec3 floraWipeFoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  treeFade(length(cameraPosition.xz - floraWipeFoot.xz), position.y);`;

export interface FloraCounts { trees: number; draws: number; triangles: number }

export class IslandFlora {
  readonly group = new THREE.Group();
  private readonly uniforms = floraUniforms();
  /** The materials for each draw class and detail (each with its own fade), made when first wanted. */
  private materials: Partial<Record<`${DrawClass}-${'near' | 'far'}`, FloraMaterials>> = {};
  private readonly fades: Record<`${DrawClass}-${'near' | 'far'}`, FadeRange>;
  private readonly models = new Map<FloraId, FloraModel>();
  private readonly modelQueue: FloraId[] = [...FLORA_IDS];
  private readonly draws: Draw[] = [];
  private readonly cells: Record<LayerName, Map<string, Cell>> = { small: new Map(), medium: new Map(), giant: new Map() };
  private readonly queues: Record<LayerName, { ci: number; cj: number; d2: number }[]> = { small: [], medium: [], giant: [] };
  private active: boolean;
  private allowed = false;
  private disposed = false;
  /** The camera as it was at the last refill (to know when to refill again). */
  private last = { x: Infinity, z: Infinity, yaw: 0, cells: -1, time: 0 };
  private clock = 0;
  private drawn: FloraCounts = { trees: 0, draws: 0, triangles: 0 };
  private readonly forward = new THREE.Vector3();

  /**
   * `parent` is the island's group moved by her arrival point (positions inside it are the island's own metres);
   * `active` whether Landscaping is "Sci-fi flora" now; `clear` places (island metres) kept clear of plants (each
   * layer's own `clear` metres round them: her arrival point, where the weapons table, bars and door stand).
   */
  constructor(parent: THREE.Object3D, active: boolean, private readonly clear: { x: number; z: number }[] = []) {
    this.group.name = 'island-flora';
    parent.add(this.group);
    this.active = active;
    this.group.visible = active;
    this.fades = {} as typeof this.fades;
    for (const c of Object.keys(DRAW) as DrawClass[]) {
      const D = DRAW[c];
      // (near: whole from the start, wiped away over nearOut; far: wiped in over nearOut, away over farOut)
      this.fades[`${c}-near`] = fadeRange(0, 0, D.nearOut[0], D.nearOut[1]);
      this.fades[`${c}-far`] = fadeRange(D.nearOut[0], D.nearOut[1], D.farOut[0], D.farOut[1]);
    }
    for (const id of FLORA_IDS) for (const lod of ['near', 'far'] as const) this.draws.push({ id, lod, mesh: null, capacity: 0 });
  }

  /** Landscaping chose (or left) "Sci-fi flora": shown and planted, or hidden (what is planted is kept). */
  setActive(on: boolean): void {
    this.active = on;
    this.group.visible = on;
    this.last.cells = -1; // (refill at once when shown again)
  }

  /** The island's ground round her is in and she is playing: the flora may start (as the forest's `begin`). */
  begin(): void { this.allowed = true; }

  /** NIGHT, 0 day .. 1 night: the glowing parts light up (floraMaterial.ts). The sky's time of day sets it. */
  setNight(n: number): void { this.uniforms.night.value = Math.min(1, Math.max(0, n)); }

  /** What is drawn now (for the readout: plants, draws, triangles). */
  get counts(): FloraCounts { return this.drawn; }

  /** A draw class's materials (lit and glow, with its fade at that detail), made the first time they are wanted. */
  private materialsFor(c: DrawClass, lod: 'near' | 'far'): FloraMaterials {
    const key = `${c}-${lod}` as const;
    let m = this.materials[key];
    if (!m) {
      const fade = this.fades[key];
      m = makeFloraMaterials(this.uniforms, {
        // (THE WIPE, as the 3D trees': treeObjects.ts; the same shader text for every layer, its own numbers)
        key: 'island',
        onCompile: (shader) => {
          fadeUniforms(shader, fade);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
              ${FADE_VERTEX_HEAD}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              ${FADE_CALL}`);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
              ${FADE_FRAGMENT_HEAD}`)
            .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
              ${FADE_FRAGMENT_CUT}`);
        },
      });
      this.materials[key] = m;
    }
    return m;
  }

  // ---- planting -------------------------------------------------------------------------------------------------
  /** Is the ground in at all four corners of a patch (so no place in it is planted on a tile still missing)? */
  private patchReady(layer: LayerName, ci: number, cj: number, ground: HydroGround): boolean {
    const s = LAYERS[layer].cell, x0 = ci * s, z0 = cj * s;
    return ground.tileReadyAt(x0, z0) && ground.tileReadyAt(x0 + s, z0) && ground.tileReadyAt(x0, z0 + s) && ground.tileReadyAt(x0 + s, z0 + s);
  }

  /** PLANT ONE PATCH of a layer: every place tried, kept where its ground suits a species, stood on the ground. */
  private buildCell(layer: LayerName, ci: number, cj: number, ground: HydroGround, hydro: KauaiHydro | null): void {
    const L = LAYERS[layer];
    const x0 = ci * L.cell, z0 = cj * L.cell;
    const plants: Plant[] = [];
    const q = new THREE.Quaternion(), tilt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (let gx = x0; gx < x0 + L.cell; gx += L.step) {
      for (let gz = z0; gz < z0 + L.cell; gz += L.step) {
        const i = Math.round(gx / L.step), j = Math.round(gz / L.step);
        const px = gx + L.step * (0.5 + (hash(i, j, L.salt) - 0.5) * 0.9), pz = gz + L.step * (0.5 + (hash(i, j, L.salt + 1) - 0.5) * 0.9);
        const h = ground.surfaceHeightAt(px, pz);
        if (!(h >= 0.8)) continue;
        // its slope, from the ground a few metres either side
        const d = layer === 'giant' ? 10 : layer === 'medium' ? 4 : 2;
        const sx = (ground.surfaceHeightAt(px + d, pz) - ground.surfaceHeightAt(px - d, pz)) / (2 * d);
        const sz = (ground.surfaceHeightAt(px, pz + d) - ground.surfaceHeightAt(px, pz - d)) / (2 * d);
        const slope = 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);
        const kind = groundKind(h, slope);
        if (!kind) continue;
        const grows = GROWS[layer][kind];
        if (!grows || hash(i, j, L.salt + 2) > grows.chance) continue;
        if (layer === 'giant' && (h < GIANT_HEIGHTS[0] || h > GIANT_HEIGHTS[1] || slope > 0.22)) continue;
        // which species (by weight), and how tall
        let total = 0;
        for (const [, w] of grows.pick) total += w;
        let r = hash(i, j, L.salt + 3) * total, id = grows.pick[0][0];
        for (const [sp, w] of grows.pick) { r -= w; if (r <= 0) { id = sp; break; } }
        // (shelf tiers only on faces steep enough to grow out of: over about 57 degrees)
        if (id === 'bracketTiers' && slope < 0.45) continue;
        const [lo, hi, bias] = PLANT_SIZE[id];
        const height = lo + (hi - lo) * hash(i, j, L.salt + 4) ** bias;
        const reach = height * SPREAD[id];
        // nothing round her arrival point
        if (this.clear.some((c) => (px - c.x) ** 2 + (pz - c.z) ** 2 < (L.clear + reach) ** 2)) continue;
        // nothing in a river or lake (only with Rivers & lakes on)
        if (hydro) { const w = hydro.waterLevelAt(px, pz); if (w !== null && w > h - 0.3) continue; }
        // ITS FOOT on the lowest ground under it (so on a slope it never floats), a little into the ground
        let y = h;
        const foot = Math.min(reach * 0.5, layer === 'giant' ? 6 : 3);
        if (foot > 0.3) {
          for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2 + 0.4;
            y = Math.min(y, ground.surfaceHeightAt(px + Math.cos(a) * foot, pz + Math.sin(a) * foot));
          }
        }
        y -= layer === 'giant' ? 0.8 : layer === 'medium' ? 0.25 + 0.01 * height : 0.04 + 0.02 * height;
        // turned at random; shelf tiers turned to face down the slope, their back leaning into it
        let turn = hash(i, j, L.salt + 5) * Math.PI * 2;
        q.setFromAxisAngle(up, turn);
        if (id === 'bracketTiers') {
          turn = Math.atan2(-sx, -sz);            // (their front, +z, down the slope)
          q.setFromAxisAngle(up, turn);
          // (the face's angle from level; the tiers' back is leant back by most of what the face lacks of upright)
          const face = Math.acos(Math.min(1, 1 - slope));
          tilt.setFromAxisAngle(side, -(Math.PI / 2 - face) * 0.85);
          q.multiply(tilt);
          y += 0.05 * height;
        }
        const matrix = new THREE.Matrix4().compose(pos.set(px, y, pz), q, scl.setScalar(height));
        const glows = floraSpecies(id).material === 'glow';
        plants.push({ id, x: px, z: pz, height, reach, solid: (SOLID[id] ?? 0) * height, matrix, hue: glows ? hueAt(px, pz, i, j, L.salt) : null });
      }
    }
    this.cells[layer].set(`${ci},${cj}`, { layer, ci, cj, cx: x0 + L.cell / 2, cz: z0 + L.cell / 2, plants, solids: plants.filter((p) => p.solid > 0) });
  }

  // ---- every frame ----------------------------------------------------------------------------------------------
  /**
   * Every frame. `camera` the game's camera; `camX`/`camZ` its place in the island's own metres; `ground` the ground as
   * drawn (island metres); `hydro` the rivers and lakes (null: Rivers & lakes off).
   */
  update(dt: number, camera: THREE.Camera, camX: number, camZ: number, ground: HydroGround, hydro: KauaiHydro | null): void {
    this.uniforms.time.value += dt;
    this.clock += dt;
    if (!this.active || !this.allowed || this.disposed) return;
    // THE MODELS, one species a frame (each a few milliseconds: never all at once, so starting it never hitches)
    if (this.modelQueue.length) {
      const id = this.modelQueue.shift()!;
      this.models.set(id, buildFlora(id));
      return;
    }
    // let go of patches that are far behind, and queue those coming into reach (whose ground is in)
    let changed = false;
    for (const layer of Object.keys(LAYERS) as LayerName[]) {
      const L = LAYERS[layer], cells = this.cells[layer], queue = this.queues[layer];
      for (const cell of [...cells.values()]) {
        if ((cell.cx - camX) ** 2 + (cell.cz - camZ) ** 2 > L.keep * L.keep) { cells.delete(`${cell.ci},${cell.cj}`); changed = true; }
      }
      const reach = L.reach + L.cell * 0.75;
      const c0 = Math.floor((camX - reach) / L.cell), c1 = Math.floor((camX + reach) / L.cell);
      const r0 = Math.floor((camZ - reach) / L.cell), r1 = Math.floor((camZ + reach) / L.cell);
      queue.length = 0;
      for (let ci = c0; ci <= c1; ci++) {
        for (let cj = r0; cj <= r1; cj++) {
          if (cells.has(`${ci},${cj}`)) continue;
          const d2 = ((ci + 0.5) * L.cell - camX) ** 2 + ((cj + 0.5) * L.cell - camZ) ** 2;
          if (d2 > reach * reach || !this.patchReady(layer, ci, cj, ground)) continue;
          queue.push({ ci, cj, d2 });
        }
      }
      queue.sort((a, b) => a.d2 - b.d2);
    }
    // PLANT a few patches, nearest first, the small layer first (it is what is right round her), within about 3 ms
    const start = performance.now();
    for (const layer of ['small', 'medium', 'giant'] as LayerName[]) {
      const queue = this.queues[layer];
      while (queue.length && performance.now() - start < 3) {
        const { ci, cj } = queue.shift()!;
        this.buildCell(layer, ci, cj, ground, hydro && hydro.isLoaded ? hydro : null);
        changed = true;
      }
    }
    // REFILL the draws when the camera has moved 3 m or turned 8 degrees, or patches came or went (at most 8 a second)
    camera.getWorldDirection(this.forward);
    const yaw = Math.atan2(this.forward.x, this.forward.z);
    let turned = Math.abs(yaw - this.last.yaw);
    if (turned > Math.PI) turned = Math.PI * 2 - turned;
    const moved = (camX - this.last.x) ** 2 + (camZ - this.last.z) ** 2 > 9;
    if ((changed || moved || turned > 0.14 || this.last.cells < 0) && this.clock - this.last.time > 0.12) {
      this.refill(camera, camX, camZ, yaw);
      this.last = { x: camX, z: camZ, yaw, cells: 1, time: this.clock };
    }
  }

  /**
   * FILL THE DRAWS: every planted plant in reach and in front of the camera (its view, widened a little and by the
   * plant's own spread) into its species' near or far draw, or both across the swap (their wipes meet there).
   */
  private refill(camera: THREE.Camera, camX: number, camZ: number, yaw: number): void {
    const persp = camera as THREE.PerspectiveCamera;
    const vfov = ((persp.fov ?? 60) * Math.PI) / 180;
    const half = Math.atan(Math.tan(vfov / 2) * (persp.aspect ?? 2)) + 0.3; // (half the view across, and about 17 degrees more)
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const lists = new Map<string, Plant[]>();
    for (const d of this.draws) lists.set(`${d.id}-${d.lod}`, []);
    for (const layer of Object.keys(LAYERS) as LayerName[]) {
      const L = LAYERS[layer];
      const most = L.reach + L.cell;
      for (const cell of this.cells[layer].values()) {
        if ((cell.cx - camX) ** 2 + (cell.cz - camZ) ** 2 > most * most) continue;
        for (const p of cell.plants) {
          const D = DRAW[CLASS_OF[p.id]];
          const dx = p.x - camX, dz = p.z - camZ, dist = Math.hypot(dx, dz);
          if (dist > D.farOut[1]) continue;
          // in front of the camera? (anything within its own spread plus 10 m always: it may be round her)
          if (dist > p.reach + 10) {
            const cos = (dx * fx + dz * fz) / dist;
            const off = Math.acos(Math.max(-1, Math.min(1, cos)));
            if (off > half + Math.asin(Math.min(1, p.reach / dist))) continue;
          }
          if (dist <= D.nearOut[1]) lists.get(`${p.id}-near`)!.push(p);
          if (dist >= D.nearOut[0]) lists.get(`${p.id}-far`)!.push(p);
        }
      }
    }
    let trees = 0, draws = 0, tris = 0;
    for (const d of this.draws) {
      const list = lists.get(`${d.id}-${d.lod}`)!;
      const model = this.models.get(d.id);
      if (!model) continue;
      if (list.length > d.capacity) {
        // (grown in steps, so a few more plants do not remake the draw each time)
        if (d.mesh) { this.group.remove(d.mesh); d.mesh.dispose(); }
        d.capacity = Math.ceil((list.length * 1.4) / 32) * 32;
        const sp = floraSpecies(d.id);
        const mats = this.materialsFor(CLASS_OF[d.id], d.lod);
        d.mesh = new THREE.InstancedMesh(model[d.lod], sp.material === 'glow' ? mats.glow : mats.lit, d.capacity);
        d.mesh.name = `island-flora-${d.id}-${d.lod}`;
        d.mesh.frustumCulled = false; // (culled above, plant by plant)
        this.group.add(d.mesh);
      }
      const mesh = d.mesh;
      if (!mesh) continue;
      const arr = mesh.instanceMatrix.array as Float32Array;
      list.forEach((p, k) => {
        arr.set(p.matrix.elements, k * 16);
        if (p.hue) mesh.setColorAt(k, p.hue);
      });
      mesh.count = list.length;
      mesh.visible = list.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (list.length) { trees += list.length; draws++; tris += list.length * triangles(model[d.lod]); }
    }
    this.drawn = { trees, draws, triangles: tris };
  }

  /**
   * IS A STEM IN THE WAY? (island metres; `body` her own radius). The tall caps', the giants' and the boulders' feet,
   * only while the flora is shown.
   */
  trunkBlocks(x: number, z: number, body: number): boolean {
    if (!this.active) return false;
    for (const layer of ['medium', 'giant'] as LayerName[]) {
      const s = LAYERS[layer].cell, ci = Math.floor(x / s), cj = Math.floor(z / s);
      for (let a = ci - 1; a <= ci + 1; a++) {
        for (let b = cj - 1; b <= cj + 1; b++) {
          const cell = this.cells[layer].get(`${a},${b}`);
          if (!cell) continue;
          for (const p of cell.solids) {
            const r = p.solid + body;
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
          }
        }
      }
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.draws) if (d.mesh) { this.group.remove(d.mesh); d.mesh.dispose(); }
    for (const m of this.models.values()) { m.near.dispose(); m.far.dispose(); }
    for (const m of Object.values(this.materials)) m?.dispose();
    for (const layer of Object.keys(LAYERS) as LayerName[]) this.cells[layer].clear();
    this.group.removeFromParent();
  }
}
