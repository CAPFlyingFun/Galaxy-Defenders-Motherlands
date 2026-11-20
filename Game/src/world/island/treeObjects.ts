// ============================================================================
// treeObjects.ts -- LANDSCAPING MODES, THE 3D TREES' LAYER AND THE FADE
// (Joshua, 2026-11-20).
//
// Settings -> WORLD -> Landscaping:
//   IMAGES ONLY  the photo trees, as before (trees.ts), drawn to 900 m.
//   HYBRID       (default) "Real 3D trees close to her, with photo trees
//                beyond": within 60-80 m of the camera each photo tree turns
//                into its 3D model standing on the very same spot (one
//                dissolves out as the other dissolves in), photos beyond.
//   OBJECTS ONLY 3D trees only: the detailed models to 60-80 m, the light
//                ones beyond, all gone by 280 m (a phone cannot draw 3D trees
//                as far as photos).
//   OFF          no trees.
//
// THE FADE GOES TOP TO BOTTOM (Joshua, 2026-11-20: "have it fade top to
// bottom... if walking to it, you can see the trunk of it first before the
// tops show"): every tree's dissolve is a WIPE up its height, softened by a
// fine dither. Walking towards a tree its foot shows first and it fills in
// upwards; walking away its top goes first and its trunk last. Where a photo
// tree becomes its 3D model the two wipes are exact opposites: the 3D tree's
// trunk replaces the photo's lower part first and the photo's crown goes last,
// so there is never a gap nor a double tree.
//
// THE TRUNKS ARE SOLID in Hybrid and Objects only: `trunkBlocks` is asked by
// her walking (islandWorld.ts IslandWalls) and she walks round them (a fern or
// a bush is pushed through).
// ============================================================================
import * as THREE from 'three';
import { KINDS, TRUNK_SHARE, drawLeafPicture, drawPalmBark, makeKindModels, type Kind, type KindModels } from './treeModels';

export type Landscaping = 'images' | 'hybrid' | 'objects' | 'off';

/** Where a photo tree and its 3D model swap (metres from the camera, level). GAME TUNING. */
export const SWAP_M = { start: 60, end: 80 } as const;
/** Objects only: the light models are gone by this far (metres). GAME TUNING. */
export const OBJECTS_M = { start: 230, end: 280 } as const;

/**
 * A FADE'S FOUR NUMBERS (shared uniforms): a tree fades IN over inStart..inEnd metres from the camera (none when inEnd
 * is 0: it is whole from the start) and OUT over outStart..outEnd.
 */
export interface FadeRange {
  inStart: { value: number };
  inEnd: { value: number };
  outStart: { value: number };
  outEnd: { value: number };
}
export function fadeRange(inStart: number, inEnd: number, outStart: number, outEnd: number): FadeRange {
  return { inStart: { value: inStart }, inEnd: { value: inEnd }, outStart: { value: outStart }, outEnd: { value: outEnd } };
}
export function setFade(f: FadeRange, inStart: number, inEnd: number, outStart: number, outEnd: number): void {
  f.inStart.value = inStart; f.inEnd.value = inEnd; f.outStart.value = outStart; f.outEnd.value = outEnd;
}

/** The vertex program's piece: how far in and out (vOpIn, vOpOut) from the camera's level distance to the tree's foot. */
export const FADE_VERTEX_HEAD = `
  uniform float uInStart, uInEnd, uOutStart, uOutEnd;
  varying float vOpIn, vOpOut, vTreeH;
  void treeFade(float m, float h) {
    vOpIn = uInEnd <= 0.0 ? 1.0 : clamp((m - uInStart) / max(uInEnd - uInStart, 1.0), 0.0, 1.0);
    vOpOut = clamp((uOutEnd - m) / max(uOutEnd - uOutStart, 1.0), 0.0, 1.0);
    vTreeH = clamp(h, 0.0, 1.0);
  }`;
/** The fragment program's piece: THE WIPE. `t` climbs the tree (foot 0, top 1), roughened by a 4 x 4 dither. */
export const FADE_FRAGMENT_HEAD = `
  varying float vOpIn, vOpOut, vTreeH;
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }`;
/**
 * Kept below the fading-out line (the top goes first) and at or above the fading-in line taken from the other side
 * (the 3D tree's trunk comes in where the photo's lower part goes out).
 */
export const FADE_FRAGMENT_CUT = `
  float treeT = vTreeH * 0.8 + bayer4(gl_FragCoord.xy) * 0.2;
  if (treeT >= vOpOut || treeT < 1.0 - vOpIn) discard;`;

/** Give a fade's uniforms to a shader being compiled. */
export function fadeUniforms(shader: { uniforms: Record<string, { value: unknown }> }, f: FadeRange): void {
  shader.uniforms.uInStart = f.inStart;
  shader.uniforms.uInEnd = f.inEnd;
  shader.uniforms.uOutStart = f.outStart;
  shader.uniforms.uOutEnd = f.outEnd;
}

/**
 * A 3D TREE MATERIAL: lit (MeshStandardMaterial), swaying in the wind (its top most, a leaf more than wood), and wiped
 * in and out by distance as above.
 */
function treeMaterial(params: THREE.MeshStandardMaterialParameters, fade: FadeRange, time: { value: number }, sway: number, key: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(params);
  material.onBeforeCompile = (shader) => {
    fadeUniforms(shader, fade);
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uSway;
        ${FADE_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // THE WIND: the whole tree leans to and fro, more the higher up (its foot stays put); leaves flutter as well
        vec3 treeFoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float treePh = dot(treeFoot.xz, vec2(0.031, 0.017));
        float treeBend = position.y * position.y;
        float treeGust = sin(uTime * 1.1 + treePh) + 0.5 * sin(uTime * 2.3 + treePh * 1.7);
        transformed.x += treeGust * uSway * 0.02 * treeBend;
        transformed.z += treeGust * uSway * 0.012 * treeBend;
        transformed += normal * sin(uTime * 7.0 + dot(position, vec3(41.0, 23.0, 37.0))) * uSway * 0.004 * position.y;
        vec2 treeAway = cameraPosition.xz - treeFoot.xz;
        treeFade(length(treeAway), position.y);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${FADE_FRAGMENT_HEAD}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        ${FADE_FRAGMENT_CUT}`);
  };
  material.customProgramCacheKey = () => `island-3d-tree-${key}`;
  return material;
}

/** One kind's two drawn pieces in a layer (wood can be missing: a fern, a bush). */
interface KindDraw {
  wood: THREE.InstancedMesh | null;
  leaves: THREE.InstancedMesh;
}

/**
 * A LAYER OF 3D TREES: one instanced draw per kind per piece (wood, leaves), refilled when the camera has moved a
 * few metres. `near` has the detailed models, the other the light ones.
 */
class ModelLayer {
  private draws: KindDraw[] = [];
  private capacity: number[] = [];
  constructor(
    private readonly group: THREE.Group,
    private readonly models: Record<Kind, KindModels>,
    private readonly detail: 'near' | 'far',
    private readonly woodMaterials: Record<Kind, THREE.Material>,
    private readonly leafMaterials: Record<Kind, THREE.Material>,
  ) {
    KINDS.forEach((_, k) => { this.capacity[k] = 0; });
  }

  /** Put these trees in (one list of matrices per kind). */
  fill(lists: THREE.Matrix4[][]): void {
    KINDS.forEach((kind, k) => {
      const list = lists[k];
      // (grown in steps, so a few more trees do not remake the draw each time)
      if (list.length > this.capacity[k]) {
        this.drop(k);
        const cap = Math.ceil(list.length * 1.5 / 64) * 64;
        const m = this.models[kind][this.detail];
        const make = (geometry: THREE.BufferGeometry, material: THREE.Material, piece: string): THREE.InstancedMesh => {
          const im = new THREE.InstancedMesh(geometry, material, cap);
          im.frustumCulled = false;   // (they stand all round the camera; each tree is cut by its own fade)
          im.name = `island-3d-${kind}-${piece}-${this.detail}`;
          this.group.add(im);
          return im;
        };
        this.draws[k] = {
          wood: m.wood ? make(m.wood, this.woodMaterials[kind], 'wood') : null,
          leaves: make(m.leaves, this.leafMaterials[kind], 'leaves'),
        };
        this.capacity[k] = cap;
      }
      const d = this.draws[k];
      if (!d) return;
      for (const im of [d.wood, d.leaves]) {
        if (!im) continue;
        for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
        im.count = list.length;
        im.instanceMatrix.needsUpdate = true;
        im.visible = list.length > 0;
      }
    });
  }

  /** How many trees and draws (for the readout). */
  counts(): { trees: number; draws: number } {
    let trees = 0, draws = 0;
    for (const d of this.draws) {
      if (!d || !d.leaves.visible) continue;
      trees += d.leaves.count;
      draws += d.wood ? 2 : 1;
    }
    return { trees, draws };
  }

  private drop(k: number): void {
    const d = this.draws[k];
    if (!d) return;
    // (the models and materials are shared; only the instance lists are let go)
    for (const im of [d.wood, d.leaves]) if (im) { this.group.remove(im); im.dispose(); }
    this.draws[k] = undefined as unknown as KindDraw;
    this.capacity[k] = 0;
  }

  dispose(): void { KINDS.forEach((_, k) => this.drop(k)); }
}

/** One planted tree, as trees.ts keeps them per patch: where (island metres), how tall, turned how, which kind. */
export interface Planted { x: number; y: number; z: number; height: number; turn: number; kind: number }

/**
 * THE 3D FOREST: both layers, their pictures and materials, made the first time 3D trees are wanted (Images only never
 * makes any of it).
 */
export class TreeObjects {
  readonly group = new THREE.Group();
  readonly nearFade = fadeRange(0, 0, SWAP_M.start, SWAP_M.end);
  readonly farFade = fadeRange(SWAP_M.start, SWAP_M.end, OBJECTS_M.start, OBJECTS_M.end);
  private near: ModelLayer;
  private far: ModelLayer;
  private readonly pictures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly models: Record<Kind, KindModels>;
  private lastX = Infinity;
  private lastZ = Infinity;
  private lastMode: Landscaping | null = null;
  private lastCells = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(parent: THREE.Object3D, base: string, time: { value: number }) {
    this.group.name = 'island-3d-trees';
    parent.add(this.group);
    this.models = makeKindModels();
    // the pictures: one of leaves drawn in code, the palm's ringed bark drawn in code, and two of Thronemound's barks
    const leaf = drawLeafPicture();
    const palmBark = drawPalmBark();
    const loader = new THREE.TextureLoader();
    const bark = (name: string): { map: THREE.Texture; normalMap: THREE.Texture } => {
      const map = loader.load(`${base}bark/${name}.jpg`);
      map.colorSpace = THREE.SRGBColorSpace;
      const normalMap = loader.load(`${base}bark/${name}_normal.jpg`);
      for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
      this.pictures.push(map, normalMap);
      return { map, normalMap };
    };
    const grey = bark('bark-grey');
    const craggy = bark('bark-craggy');
    this.pictures.push(leaf, palmBark);
    // each kind's wood and leaf material, for each layer (each layer has its own fade)
    const sway: Record<Kind, number> = { bush: 0.4, palm: 1.2, cycad: 0.5, sago: 0.5, fern: 0.8, aspen: 1.0, conifer: 0.8 };
    const woodPicture = (kind: Kind) => (kind === 'palm' ? { map: palmBark } : kind === 'conifer' ? craggy : grey);
    const make = (fade: FadeRange, layer: string) => {
      const wood = {} as Record<Kind, THREE.Material>, leaves = {} as Record<Kind, THREE.Material>;
      for (const kind of KINDS) {
        wood[kind] = treeMaterial({ ...woodPicture(kind), roughness: 0.95, metalness: 0 }, fade, time, sway[kind] * 0.5, `wood-${layer}`);
        leaves[kind] = treeMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, metalness: 0 }, fade, time, sway[kind], `leaf-${layer}`);
        this.materials.push(wood[kind], leaves[kind]);
      }
      return { wood, leaves };
    };
    const nearMaterials = make(this.nearFade, 'near');
    const farMaterials = make(this.farFade, 'far');
    this.near = new ModelLayer(this.group, this.models, 'near', nearMaterials.wood, nearMaterials.leaves);
    this.far = new ModelLayer(this.group, this.models, 'far', farMaterials.wood, farMaterials.leaves);
  }

  /** The 3D trees drawn now (for the readout). */
  counts(): { trees: number; draws: number } {
    const a = this.near.counts(), b = this.far.counts();
    return { trees: a.trees + b.trees, draws: a.draws + b.draws };
  }

  /**
   * Refill the layers when the camera has moved 3 m, the mode changed or patches came or went. `plants` lists every
   * planted patch's trees; `camX`/`camZ` the camera in island metres.
   */
  update(mode: Landscaping, camX: number, camZ: number, cells: number, plants: () => Iterable<{ cx: number; cz: number; trees: Planted[] }>): void {
    this.group.visible = mode === 'hybrid' || mode === 'objects';
    if (!this.group.visible) { this.lastMode = mode; return; }
    if (mode === this.lastMode && cells === this.lastCells && (camX - this.lastX) ** 2 + (camZ - this.lastZ) ** 2 < 9) return;
    this.lastMode = mode; this.lastCells = cells; this.lastX = camX; this.lastZ = camZ;
    // how far each layer reaches (a little past its fade, so a tree is in its list before it shows)
    const nearM = SWAP_M.end + 6;
    const farM = mode === 'objects' ? OBJECTS_M.end + 6 : 0;
    const most = Math.max(nearM, farM);
    const nearLists: THREE.Matrix4[][] = KINDS.map(() => []);
    const farLists: THREE.Matrix4[][] = KINDS.map(() => []);
    for (const cell of plants()) {
      // (a whole patch further than the reach plus its half-diagonal is passed by)
      if ((cell.cx - camX) ** 2 + (cell.cz - camZ) ** 2 > (most + 213) ** 2) continue;
      for (const t of cell.trees) {
        const d2 = (t.x - camX) ** 2 + (t.z - camZ) ** 2;
        if (d2 > most * most) continue;
        this.q.setFromAxisAngle(this.up, t.turn);
        this.m.compose(this.p.set(t.x, t.y, t.z), this.q, this.s.setScalar(t.height));
        // (the near models out to the swap; the light ones from the swap on, both across it so their wipes meet)
        if (d2 <= nearM * nearM) nearLists[t.kind].push(this.m.clone());
        if (farM > 0 && d2 >= (SWAP_M.start - 6) ** 2 && d2 <= farM * farM) farLists[t.kind].push(this.m.clone());
      }
    }
    this.near.fill(nearLists);
    this.far.fill(farLists);
  }

  dispose(): void {
    this.near.dispose();
    this.far.dispose();
    for (const kind of KINDS) for (const lod of ['near', 'far'] as const) { this.models[kind][lod].wood?.dispose(); this.models[kind][lod].leaves.dispose(); }
    for (const m of this.materials) m.dispose();
    for (const p of this.pictures) p.dispose();
    this.group.removeFromParent();
  }
}

/** A tree's trunk radius at its foot (metres), or 0 for one you push through. */
export function trunkRadius(kind: number, height: number): number {
  return TRUNK_SHARE[KINDS[kind]] * height;
}
