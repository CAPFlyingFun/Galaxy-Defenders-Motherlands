// ============================================================================
// groundPaint.ts -- how the island's ground is coloured: sand at the water,
// grass, jungle, then rock, mountain and snow going up, and bare cliff rock on
// any steep face. Brought over from Beyond Extinction (KauaiTileStreamer.ts,
// makeBiomeMaterial, main at 70f3f97), whose numbers were tuned in playtests.
//
// It is three.js's ordinary lit material (so the sun, her shadow and the fog
// all work on it) with the colouring added to its shader. Every tile, and the
// coarse far island, share these seven pictures.
//
// Where the picture is laid: by the ground's place in the world, seen from
// above (so the sand does not stretch with the hills), and on steep faces from
// the side as well ("triplanar"), so a cliff shows rock and not long streaks.
// ============================================================================
import * as THREE from 'three';
import { sizedPictureAsync } from '../../core/textureSizes';

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

/** Load the seven pictures once. One that fails becomes plain grey, so the island still draws. */
export async function loadGroundPictures(base: string): Promise<GroundPictures> {
  const out = {} as GroundPictures;
  await Promise.all((Object.keys(PICTURE_FILES) as (keyof GroundPictures)[]).map(async (name) => {
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
  }));
  return out;
}

/**
 * For the coarse FAR island only: the 8 x 8 grid saying which tiles are drawn in full right now (1) and so must not
 * be drawn by the far island as well, and where the island's own centre is in the game's world.
 */
export interface FarCutout {
  /** 8 x 8, one byte a tile (row 1 first, column A first): 255 where the full tile is drawn. */
  shown: THREE.DataTexture;
  /** The island's centre in the game's world is at minus this (the game's centre is where she arrives). */
  origin: THREE.Vector2;
}

/**
 * The ground's material. Each mesh using it needs an `aElev` attribute: the ground's height above the sea at each
 * corner, in metres (the tiles' skirts give their dropped walls the height of the edge above, so they colour like
 * it). `far` makes the coarse far island's version, which leaves out the tiles drawn in full.
 */
export function makeGroundMaterial(pictures: GroundPictures, far?: FarCutout): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tSand = { value: pictures.sand };
    shader.uniforms.tGrass = { value: pictures.grass };
    shader.uniforms.tJungle = { value: pictures.jungle };
    shader.uniforms.tRock = { value: pictures.rock };
    shader.uniforms.tMtn = { value: pictures.mountain };
    shader.uniforms.tSnow = { value: pictures.snow };
    shader.uniforms.tReef = { value: pictures.reef };
    if (far) {
      shader.uniforms.uShown = { value: far.shown };
      shader.uniforms.uOrigin = { value: far.origin };
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
uniform sampler2D tSand, tGrass, tJungle, tRock, tMtn, tSnow, tReef;
${far ? 'uniform sampler2D uShown;\nuniform vec2 uOrigin;' : ''}
float gWet = 0.0; // how wet the sand is at the water's edge (set below, used for its shine)
// A cheap smooth noise from the place itself (no picture needed): wobbles where one kind of ground gives way to the
// next, and the brightness, so the edges are patchy like real ground and not neat contour lines.
float bhash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bhash(i), bhash(i + vec2(1.0, 0.0)), f.x), mix(bhash(i + vec2(0.0, 1.0)), bhash(i + vec2(1.0, 1.0)), f.x), f.y);
}
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
}`)
      .replace('#include <map_fragment>', /* glsl */ `{
${far ? `  // THE FAR ISLAND leaves out every tile that is drawn in full (the 8 x 8 grid of uShown)
  vec2 cell = floor((vBiomeW.xz + uOrigin) / 7000.0 + 4.0);
  if (cell.x >= 0.0 && cell.y >= 0.0 && cell.x < 8.0 && cell.y < 8.0 && texture2D(uShown, (cell + 0.5) / 8.0).r > 0.5) discard;` : ''}
  float e = vElev;                               // height above the sea, metres
  vec3 nrm = normalize(vBiomeN);
  float slope = 1.0 - clamp(nrm.y, 0.0, 1.0);    // 0 flat .. 1 a wall
  vec2 uv = vBiomeW.xz;
  // the height each kind of ground starts at, wobbled by up to about 45 m (but not at the beach)
  float jit = bnoise(uv * 0.011) * 0.65 + bnoise(uv * 0.047) * 0.35 - 0.5;
  float ej = e + jit * 90.0 * min(1.0, max(e, 0.0) / 60.0);
  vec3 sand = tile2(tSand, uv, 4.5);
  vec3 grass = tile2(tGrass, uv, 5.5);
  vec3 jung = tile2(tJungle, uv, 6.5);
  vec3 rock = triplanar(tRock, vBiomeW, nrm, 9.0);
  vec3 mtn = triplanar(tMtn, vBiomeW, nrm, 11.0);
  vec3 snow = tile2(tSnow, uv, 3.0);
  // Beyond Extinction's bands, from its data: sand under 3 m, grass 3 to 9 m, jungle above, rock from about 700 m,
  // mountain from about 1 km, snow on the very top
  vec3 c = sand;
  c = mix(c, grass, smoothstep(3.0, 5.0, ej));
  c = mix(c, jung, smoothstep(9.0, 13.0, ej));
  c = mix(c, rock, smoothstep(680.0, 980.0, ej));
  c = mix(c, mtn, smoothstep(1020.0, 1220.0, ej));
  c = mix(c, snow, smoothstep(1300.0, 1540.0, ej));
  c = mix(c, rock, smoothstep(0.30, 0.55, slope)); // steep faces are rock at any height
  c *= 0.90 + 0.20 * (bnoise(uv * 0.0016) * 0.6 + bnoise(uv * 0.0085) * 0.4); // broad light and dark patches
  // the water's edge: a band of wet, darker, shinier sand, then the reef fading in under the water and darkening
  // with depth (the sea itself sits at -0.4 m: ocean.ts)
  gWet = 0.7 * smoothstep(0.3, -0.9, e) * smoothstep(-4.0, -0.9, e);
  c = mix(c, c * 0.8, smoothstep(0.25, -0.45, e));
  {
    float d = clamp(-e / 55.0, 0.0, 1.0);
    vec3 reef = texture2D(tReef, uv / 5.0).rgb;
    c = mix(c, mix(reef, vec3(0.015, 0.06, 0.10), d * d), smoothstep(-0.5, -3.6, e));
  }
  diffuseColor.rgb *= c;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.25, gWet);')
      // dry ground has (almost) no shine, so the sun does not lay a bright sheen across the sand; wet sand keeps it
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= mix(0.06, 1.0, gWet);\n  reflectedLight.indirectSpecular *= mix(0.06, 1.0, gWet);');
  };
  // (all tiles share ONE compiled shader; the far island has its own)
  material.customProgramCacheKey = () => (far ? 'gdm-island-ground-far' : 'gdm-island-ground');
  return material;
}
