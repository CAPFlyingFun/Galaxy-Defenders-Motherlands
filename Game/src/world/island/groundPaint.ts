// ============================================================================
// groundPaint.ts -- how the island's ground is coloured: sand at the water,
// grass, forest, then rock and the heights going up, and bare cliff rock on any
// steep face. Two ways, chosen in Settings -> WORLD -> Ground (live):
//
// SOLID COLOURS, THE DEFAULT (Joshua, 2026-11-24: "for the ground textures,
// instead of using images, just use solid colors as landscaping, building, etc
// will go over it... or procedural textures"; his palette approved the same
// day, "a nice sci-fi feel, but still somewhat familiar"): no pictures at all.
// Each kind of ground is a BASE and an ACCENT colour, mixed by noise made from
// the place itself (blotches, streaks, cracks, grain). Near the camera the
// noise draws the fine pattern; it fades with distance to each kind's plain
// blended colour, because detail too small to see would only shimmer on a
// phone. The peaks are basalt and violet crystal, not snow (his call). Kinds:
//   reef (under the shallow sea), sand (the beach), grass, forest floor,
//   soil (bare hillsides), rock (high ground and every cliff), basalt, crystal.
//
// TEXTURES: Beyond Extinction's seven ground pictures (KauaiTileStreamer.ts,
// makeBiomeMaterial, main at 70f3f97), exactly as the island had them before,
// snow and all. Downloaded only when chosen, and let go again when not.
//
// It is three.js's ordinary lit material (so the sun, her shadow and the fog
// all work on it) with the colouring added to its shader. Every tile, and the
// coarse far island, share one GroundPaint: the same uniforms, so a colour
// changed (TEST TOOLS -> Ground colours) reaches every tile at once.
//
// Where a pattern is laid: by the ground's place in the world, seen from above
// on flat ground and from the side on steep faces, so neither the hills nor the
// cliffs stretch it.
// ============================================================================
import * as THREE from 'three';
import { sizedPictureAsync } from '../../core/textureSizes';

/** How the ground is coloured (Settings -> WORLD -> Ground). */
export type GroundMode = 'colours' | 'textures';

/** The ground pictures, under public/island/textures/ (copied from Beyond Extinction). */
export interface GroundPictures {
  sand: THREE.Texture;
  grass: THREE.Texture;
  jungle: THREE.Texture;
  rock: THREE.Texture;
  mountain: THREE.Texture;
  snow: THREE.Texture;
  reef: THREE.Texture;
}

const PICTURE_FILES: Record<keyof GroundPictures, string> = {
  sand: 'sand', grass: 'grass', jungle: 'jungle', rock: 'cliff', mountain: 'mountain', snow: 'snow', reef: 'reef',
};

/**
 * THE APPROVED PALETTE (Joshua, 2026-11-24), as he approved it: each kind's BASE and ACCENT colour (sRGB hex, as any
 * paint program shows them). Most are ChatGPT's palette; rock, basalt's cracks and soil as its own band are mine.
 */
export const GROUND_COLOURS = {
  reef: ['#9CC7B4', '#5E9C8C'],
  sand: ['#D7D4C1', '#BDB49A'],
  grass: ['#468D72', '#528C9F'],
  forest: ['#234F43', '#2F6A55'],
  soil: ['#8B6652', '#6E4F40'],
  rock: ['#6B6661', '#8B6652'],
  basalt: ['#414952', '#2B3138'],
  crystal: ['#414952', '#76659C'],
} as const satisfies Record<string, readonly [string, string]>;
export type GroundKind = keyof typeof GROUND_COLOURS;
export const GROUND_KINDS = Object.keys(GROUND_COLOURS) as GroundKind[];
/** The crystal peaks' small light flecks (the bits that could glow at night later). */
const GLINT = '#C8B8FF';
/**
 * THE DAYLIGHT'S WHITE BALANCE (v0.2.166): the island's daylight (main.ts: a blue sky light, 0xcfe0ff x 1.7, and a
 * white sun, x 1.5; no tone mapping) shows flat ground at only 52% of its red, 59% of its green and 73% of its blue
 * (MEASURED: the sand painted plain #808080 came out (94, 100, 110) on screen, looking down at it). So the approved
 * colours came out pale and grey-blue, the beach nearly white; Beyond Extinction's pictures had been made warm to make
 * up for it. The solid colours are multiplied by the inverse, so FLAT GROUND IN DAYLIGHT SHOWS EXACTLY THE SWATCHES HE
 * APPROVED (slopes away from the sun darker, as they should be). Measure again if the island's lights change; night
 * (later) dims the lights, not this.
 */
const DAYLIGHT_BALANCE = new THREE.Vector3(1.938, 1.7, 1.379);
/** Where a colour changed in TEST TOOLS is remembered: { "grass": ["#...", "#..."], ... } (only the changed kinds). */
export const GROUND_COLOURS_KEY = 'gdm.groundColours';

/** The uniform's name for a kind's base (0) or accent (1) colour: uSandA, uSandB, ... */
const uniformName = (kind: GroundKind, which: 0 | 1): string => `u${kind[0].toUpperCase()}${kind.slice(1)}${which === 0 ? 'A' : 'B'}`;

/** The colours as they stand: the approved ones, with any changed in TEST TOOLS on top. */
export function groundColoursNow(): Record<GroundKind, [string, string]> {
  const out = {} as Record<GroundKind, [string, string]>;
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(GROUND_COLOURS_KEY) ?? '{}') as Record<string, unknown>; } catch { /* none kept */ }
  const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  for (const kind of GROUND_KINDS) {
    const s = saved[kind];
    const pair = Array.isArray(s) && isHex(s[0]) && isHex(s[1]) ? [s[0], s[1]] as [string, string] : [...GROUND_COLOURS[kind]] as [string, string];
    out[kind] = pair;
  }
  return out;
}

/**
 * Load the seven pictures once. One that fails becomes plain grey, so the island still draws.
 * ONE AT A TIME (v0.2.150, the island's gentle start): each is decoded and sized before the next is fetched, so the
 * phone never holds seven decoding pictures at once.
 */
export async function loadGroundPictures(base: string): Promise<GroundPictures> {
  const out = {} as GroundPictures;
  for (const name of Object.keys(PICTURE_FILES) as (keyof GroundPictures)[]) {
    let picture: THREE.Texture;
    try {
      // (a WORLD picture by its size setting: core/textureSizes.ts, v0.2.148)
      picture = await sizedPictureAsync(`${base}textures/${PICTURE_FILES[name]}.jpg`, 'world', (t) => {
        t.colorSpace = THREE.SRGBColorSpace; // (a colour picture: the shader then reads it as true light values)
      });
    } catch {
      picture = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    }
    picture.wrapS = picture.wrapT = THREE.RepeatWrapping; // (laid again and again across the ground)
    picture.anisotropy = 8; // (keeps it sharp seen at a low angle, instead of blurring into stripes)
    picture.needsUpdate = true;
    out[name] = picture;
  }
  return out;
}

/**
 * For the coarse FAR island only: the grid saying which tiles are drawn in full right now (1) and so must not be drawn
 * by the far island as well, and where the island's own centre is in the game's world.
 */
export interface FarCutout {
  /** across x across, one byte a tile (row 1 first, column A first): 255 where the full tile is drawn. */
  shown: THREE.DataTexture;
  /** The island's centre in the game's world is at minus this (the game's centre is where she arrives). */
  origin: THREE.Vector2;
  /** Tiles across the island (16 since v0.2.150; 8 before), and one tile's side in metres (3,500; 7,000 before). */
  across: number;
  tileSize: number;
}

/** A plain grey stand-in for a ground picture not loaded (its sampler must still have something to read). */
function greyPicture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/**
 * THE ISLAND'S GROUND PAINT: how every ground material on the island is coloured, the mode they are in, and the
 * pictures when the mode needs them. Make one with `createGroundPaint`, ask it for each material.
 */
export class GroundPaint {
  /** The mode in force now. */
  mode: GroundMode;
  /** The uniforms every ground material shares (the SAME objects in each: a change reaches every tile). */
  private readonly uniforms: Record<string, { value: unknown }> = {};
  private readonly grey = greyPicture();
  private pictures: GroundPictures | null = null;
  private loading: Promise<void> | null = null;
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  /** Each `setMode` is numbered: one overtaken by a later one while its pictures loaded does nothing. */
  private asked = 0;
  private disposed = false;

  constructor(private readonly base: string, mode: GroundMode) {
    this.mode = mode;
    for (const name of ['tSand', 'tGrass', 'tJungle', 'tRock', 'tMtn', 'tSnow', 'tReef']) this.uniforms[name] = { value: this.grey };
    const colours = groundColoursNow();
    for (const kind of GROUND_KINDS) {
      // (THREE.Color turns the hex, which is sRGB, into the linear light values the shader works in, as a picture is)
      this.uniforms[uniformName(kind, 0)] = { value: new THREE.Color(colours[kind][0]) };
      this.uniforms[uniformName(kind, 1)] = { value: new THREE.Color(colours[kind][1]) };
    }
    this.uniforms.uGlint = { value: new THREE.Color(GLINT) };
    this.uniforms.uDaylight = { value: DAYLIGHT_BALANCE };
  }

  /** The pictures in (once), for Textures. */
  private loadPictures(): Promise<void> {
    if (this.pictures) return Promise.resolve();
    this.loading ??= loadGroundPictures(this.base).then((pictures) => {
      this.loading = null;
      if (this.disposed) { for (const p of Object.values(pictures)) p.dispose(); return; }
      this.pictures = pictures;
      const u = this.uniforms;
      u.tSand.value = pictures.sand; u.tGrass.value = pictures.grass; u.tJungle.value = pictures.jungle;
      u.tRock.value = pictures.rock; u.tMtn.value = pictures.mountain; u.tSnow.value = pictures.snow; u.tReef.value = pictures.reef;
    });
    return this.loading;
  }

  /** The pictures let go (Solid colours needs none): their memory on the graphics chip and in the page given back. */
  private releasePictures(): void {
    if (!this.pictures) return;
    for (const name of ['tSand', 'tGrass', 'tJungle', 'tRock', 'tMtn', 'tSnow', 'tReef']) this.uniforms[name].value = this.grey;
    for (const p of Object.values(this.pictures)) {
      const image = p.image as { close?: () => void } | undefined;
      p.dispose();
      image?.close?.(); // (an ImageBitmap's pixels are freed at once, not whenever the page gets round to it)
    }
    this.pictures = null;
  }

  /** The mode the island opens in: Textures waits for its pictures, so the first picture is right. */
  async ready(): Promise<void> {
    if (this.mode === 'textures') await this.loadPictures();
  }

  /**
   * CHANGE HOW THE GROUND IS COLOURED, while she plays. Textures: its pictures are fetched first (the ground stays as
   * it was until they are in), then every ground shader is made again with them. Solid colours: at once, and the
   * pictures are let go.
   */
  async setMode(mode: GroundMode): Promise<void> {
    const ask = ++this.asked;
    if (mode === 'textures') await this.loadPictures();
    if (ask !== this.asked || this.disposed) return; // (asked again while loading: the later ask decides)
    this.mode = mode;
    for (const m of this.materials) this.applyMode(m);
    if (mode === 'colours') this.releasePictures();
  }

  /** A kind's base (0) or accent (1) colour, changed at once on every tile (TEST TOOLS -> Ground colours). */
  setColour(kind: GroundKind, which: 0 | 1, hex: string): void {
    (this.uniforms[uniformName(kind, which)].value as THREE.Color).set(hex);
  }

  private applyMode(material: THREE.MeshStandardMaterial): void {
    material.defines = this.mode === 'textures' ? { GROUND_TEXTURES: '' } : {};
    material.needsUpdate = true; // (the shader is made again, with or without the pictures' part)
  }

  /**
   * A ground material. Each mesh using it needs an `aElev` attribute: the ground's height above the sea at each corner,
   * in metres (the tiles' skirts give their dropped walls the height of the edge above, so they colour like it).
   * `far` makes the coarse far island's version, which leaves out the tiles drawn in full.
   */
  material(far?: FarCutout): THREE.MeshStandardMaterial {
    const material = makeGroundMaterial(this.uniforms, far, () => this.mode);
    this.applyMode(material);
    this.materials.add(material);
    material.addEventListener('dispose', () => this.materials.delete(material));
    return material;
  }

  dispose(): void {
    this.disposed = true;
    this.releasePictures();
    this.grey.dispose();
  }
}

/** The island's ground paint, in the mode chosen (its pictures already in, if that is Textures). */
export async function createGroundPaint(base: string, mode: GroundMode): Promise<GroundPaint> {
  const paint = new GroundPaint(base, mode);
  await paint.ready();
  return paint;
}

/** The material itself (see GroundPaint.material). */
function makeGroundMaterial(shared: Record<string, { value: unknown }>, far: FarCutout | undefined, mode: () => GroundMode): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    // (the SAME uniform objects as every other ground material: GroundPaint changes them in one place)
    Object.assign(shader.uniforms, shared);
    if (far) {
      shader.uniforms.uShown = { value: far.shown };
      shader.uniforms.uOrigin = { value: far.origin };
      shader.uniforms.uTiles = { value: far.across };
      shader.uniforms.uTileM = { value: far.tileSize };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aElev;\nvarying float vElev;\nvarying vec3 vBiomeW;\nvarying vec3 vBiomeN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vBiomeN = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBiomeW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vElev = aElev;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying float vElev;
varying vec3 vBiomeW;
varying vec3 vBiomeN;
#ifdef GROUND_TEXTURES
uniform sampler2D tSand, tGrass, tJungle, tRock, tMtn, tSnow, tReef;
#else
uniform vec3 uReefA, uReefB, uSandA, uSandB, uGrassA, uGrassB, uForestA, uForestB;
uniform vec3 uSoilA, uSoilB, uRockA, uRockB, uBasaltA, uBasaltB, uCrystalA, uCrystalB, uGlint;
uniform vec3 uDaylight; // the daylight's white balance (DAYLIGHT_BALANCE): flat ground in daylight shows the swatches
#endif
${far ? 'uniform sampler2D uShown;\nuniform vec2 uOrigin;\nuniform float uTiles, uTileM;' : ''}
float gWet = 0.0; // how wet the sand is at the water's edge (set below, used for its shine)
// A cheap smooth noise from the place itself (no picture needed): wobbles where one kind of ground gives way to the
// next, and the brightness, so the edges are patchy like real ground and not neat contour lines.
float bhash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bhash(i), bhash(i + vec2(1.0, 0.0)), f.x), mix(bhash(i + vec2(0.0, 1.0)), bhash(i + vec2(1.0, 1.0)), f.x), f.y);
}
#ifdef GROUND_TEXTURES
// The same picture at two sizes, mixed, so its repeats do not line up into a visible checkerboard.
vec3 tile2(sampler2D tex, vec2 uv, float scale) {
  vec3 a = texture2D(tex, uv / scale).rgb;
  vec3 b = texture2D(tex, uv / (scale * 4.3) + vec2(0.37, 0.71)).rgb;
  return mix(a, b, 0.45);
}
// Laid from above AND from the sides, weighted by which way the ground faces (for cliffs).
vec3 triplanar(sampler2D tex, vec3 wp, vec3 n, float scale) {
  vec3 bw = abs(n); bw = pow(bw, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  return texture2D(tex, wp.zy / scale).rgb * bw.x + texture2D(tex, wp.xz / scale).rgb * bw.y + texture2D(tex, wp.xy / scale).rgb * bw.z;
}
#else
// The fine noise of the solid colours. Its cells REPEAT EVERY 1,024 so the hash stays exact 40 km from the island's
// middle (a 'float' holds only so many digits: past a few thousand the plain bnoise above turns blocky up close).
// 1,024 cells is hundreds of metres, and the fine pattern is only seen within 35 m, so the repeat is never seen.
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, 1024.0), b = mod(i + 1.0, 1024.0);
  return mix(mix(bhash(a), bhash(vec2(b.x, a.y)), f.x), mix(bhash(vec2(a.x, b.y)), bhash(b), f.x), f.y);
}
// Three of them at doubling sizes: blotches with smaller blotches in them.
float gfbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s / 0.875;
}
// A kind of ground: its base colour, moved toward its accent by its pattern near the camera; far off, a steady blend
// of the two (35% accent), which is what the pattern averages to.
vec3 kindColour(vec3 base, vec3 accent, float pattern, float near) {
  return mix(base, accent, mix(0.35, clamp(pattern, 0.0, 1.0), near));
}
#endif`)
      .replace('#include <map_fragment>', /* glsl */ `{
${far ? `  // THE FAR ISLAND leaves out every tile that is drawn in full (the grid of uShown: uTiles across, uTileM each)
  vec2 cell = floor((vBiomeW.xz + uOrigin) / uTileM + uTiles * 0.5);
  if (cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uTiles && cell.y < uTiles && texture2D(uShown, (cell + 0.5) / uTiles).r > 0.5) discard;` : ''}
  float e = vElev;                               // height above the sea, metres
  vec3 nrm = normalize(vBiomeN);
  float slope = 1.0 - clamp(nrm.y, 0.0, 1.0);    // 0 flat .. 1 a wall
  vec2 uv = vBiomeW.xz;
  // the height each kind of ground starts at, wobbled by up to about 45 m (but not at the beach)
  float jit = bnoise(uv * 0.011) * 0.65 + bnoise(uv * 0.047) * 0.35 - 0.5;
  float ej = e + jit * 90.0 * min(1.0, max(e, 0.0) / 60.0);
  vec3 c, reefC;
#ifdef GROUND_TEXTURES
  vec3 sand = tile2(tSand, uv, 4.5);
  vec3 grass = tile2(tGrass, uv, 5.5);
  vec3 jung = tile2(tJungle, uv, 6.5);
  vec3 rock = triplanar(tRock, vBiomeW, nrm, 9.0);
  vec3 mtn = triplanar(tMtn, vBiomeW, nrm, 11.0);
  vec3 snow = tile2(tSnow, uv, 3.0);
  // Beyond Extinction's bands, from its data: sand under 3 m, grass 3 to 9 m, jungle above, rock from about 700 m,
  // mountain from about 1 km, snow on the very top
  c = sand;
  c = mix(c, grass, smoothstep(3.0, 5.0, ej));
  c = mix(c, jung, smoothstep(9.0, 13.0, ej));
  c = mix(c, rock, smoothstep(680.0, 980.0, ej));
  c = mix(c, mtn, smoothstep(1020.0, 1220.0, ej));
  c = mix(c, snow, smoothstep(1300.0, 1540.0, ej));
  c = mix(c, rock, smoothstep(0.30, 0.55, slope)); // steep faces are rock at any height
  reefC = texture2D(tReef, uv / 5.0).rgb;
#else
  // HOW NEAR the camera this bit of ground is: the patterns (blotches, streaks, cracks) are drawn within about 35 m,
  // the grain and flecks within about 8 m; past that each kind is its plain blended colour
  float dist = distance(vBiomeW, cameraPosition);
  float near = 1.0 - smoothstep(10.0, 35.0, dist);
  float fine = 1.0 - smoothstep(2.0, 8.0, dist);
  // the place the patterns are laid by: from above on flat ground, from the side on a steep face (whichever way it
  // faces most), so a cliff's pattern is not stretched down it
  vec3 an = abs(nrm);
  vec2 q = an.y >= max(an.x, an.z) ? vBiomeW.xz : (an.x > an.z ? vBiomeW.zy : vBiomeW.xy);
  float n = 0.5, streak = 0.5, fleck = 0.5, blade = 0.5, grain = 0.0;
  if (near > 0.0) {
    n = gfbm(q * 1.6);                                          // blotches, about 60 cm across
    streak = gfbm(vec2(q.x * 0.8, q.y * 3.7) + 41.0);          // rock's layers, long one way
    fleck = gnoise(q * 4.0 + 17.0);                             // small spots (soil showing in the forest)
    blade = gnoise(vec2(q.x * 13.0, q.y * 2.3) + 5.0);          // grass's long strokes
    grain = bhash(mod(floor(q * 20.0), 1024.0)) * fine;         // 5 cm grain, only close up
  }
  float crack = (1.0 - smoothstep(0.0, 0.035, abs(n - 0.5))) * near; // thin lines along the blotches' edges
  // each kind of ground (base, accent, and what moves one to the other)
  vec3 cSand = kindColour(uSandA, uSandB, smoothstep(0.55, 0.75, n) * 0.5 + grain * 0.3, near);
  reefC = kindColour(uReefA, uReefB, smoothstep(0.45, 0.6, n) + grain * 0.15, near);
  vec3 cGrass = kindColour(uGrassA, uGrassB, smoothstep(0.5, 0.65, n) * 0.8 + blade * 0.25 * near, near);
  vec3 cForest = kindColour(uForestA, uForestB, smoothstep(0.5, 0.7, n), near);
  cForest = mix(cForest, uSoilA, smoothstep(0.68, 0.8, fleck) * 0.6 * near);
  vec3 cSoil = kindColour(uSoilA, uSoilB, smoothstep(0.4, 0.7, n), near);
  cSoil = mix(cSoil, vec3(0.51, 0.41, 0.30), step(0.975, grain) * 0.5); // a few pale pebbles
  vec3 cRock = kindColour(uRockA, uRockB, smoothstep(0.45, 0.65, streak) * 0.8, near);
  vec3 cBasalt = kindColour(uBasaltA, uBasaltB, crack, near);
  vec3 cCrystal = kindColour(uCrystalA, uCrystalB, smoothstep(0.6, 0.75, n), near);
  cCrystal = mix(cCrystal, uBasaltB, (1.0 - smoothstep(0.0, 0.03, abs(streak - 0.5))) * 0.7 * near);
  cCrystal = mix(cCrystal, uGlint, step(0.988, grain) * step(0.2, smoothstep(0.6, 0.75, n)));
  // the bands, as the pictures' were: sand under 3 m, grass to 9 m, forest above, rock from about 700 m, basalt from
  // about 1 km, crystal on the very top (where the snow was); bare soil on hillsides below the rock, and steep faces
  // rock (basalt up high) at any height
  c = cSand;
  c = mix(c, cGrass, smoothstep(3.0, 5.0, ej));
  c = mix(c, cForest, smoothstep(9.0, 13.0, ej));
  c = mix(c, cSoil, smoothstep(0.14, 0.26, slope) * smoothstep(3.0, 6.0, ej) * (1.0 - smoothstep(680.0, 980.0, ej)));
  c = mix(c, cRock, smoothstep(680.0, 980.0, ej));
  c = mix(c, cBasalt, smoothstep(1020.0, 1220.0, ej));
  c = mix(c, cCrystal, smoothstep(1300.0, 1540.0, ej));
  c = mix(c, mix(cRock, cBasalt, smoothstep(1020.0, 1220.0, ej)), smoothstep(0.30, 0.55, slope));
  c *= uDaylight;
  reefC *= uDaylight;
#endif
  c *= 0.90 + 0.20 * (bnoise(uv * 0.0016) * 0.6 + bnoise(uv * 0.0085) * 0.4); // broad light and dark patches
  // the water's edge: a band of wet, darker, shinier sand, then the reef fading in under the water and darkening
  // with depth (the sea itself sits at -0.4 m: ocean.ts)
  gWet = 0.7 * smoothstep(0.3, -0.9, e) * smoothstep(-4.0, -0.9, e);
  c = mix(c, c * 0.8, smoothstep(0.25, -0.45, e));
  {
    float d = clamp(-e / 55.0, 0.0, 1.0);
    c = mix(c, mix(reefC, vec3(0.015, 0.06, 0.10), d * d), smoothstep(-0.5, -3.6, e));
  }
  diffuseColor.rgb *= c;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.25, gWet);')
      // dry ground has (almost) no shine, so the sun does not lay a bright sheen across the sand; wet sand keeps it
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= mix(0.06, 1.0, gWet);\n  reflectedLight.indirectSpecular *= mix(0.06, 1.0, gWet);');
  };
  // (all tiles share ONE compiled shader per mode; the far island has its own)
  material.customProgramCacheKey = () => `gdm-island-ground${far ? '-far' : ''}-${mode()}`;
  return material;
}
