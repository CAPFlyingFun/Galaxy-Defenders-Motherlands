// ============================================================================
// floraMaterial.ts -- THE TWO MATERIALS EVERY PLANT IN flora/ IS DRAWN WITH,
// and the GLOW the game turns up at night.
//
// No pictures at all: every plant is coloured point by point (its vertex
// colours, floraKit.ts), so every species shares these two materials:
//
//   LIT   an ordinary lit surface (three.js's MeshStandardMaterial, as the 3D
//         trees use), for the plants that never glow;
//   GLOW  the same, plus a GLOW each point carries (its `glow` attribute:
//         strength, whether it glows by day too, how white its core is). It
//         is EMISSIVE: the surface gives out its own light colour, drawn
//         bright whatever lights the scene. It is NOT a light: it lights
//         nothing round it, so a thousand glowing mushrooms cost no more than
//         a thousand plain ones.
//
// THE GLOW'S COLOUR comes from each PLANT (InstancedMesh.setColorAt, one per
// planted one: cyan, violet, emerald, amber, magenta or crimson, FLORA_HUES),
// so one model and one draw can hold mushrooms of every colour. A mesh with
// no colours of its own glows in the material's `hue` (FloraUniforms.hue).
//
// DAY AND NIGHT (FloraUniforms.night, 0 day .. 1 night; the game raises it at
// dusk): points marked "always" glow by day too, dimmer (`dayGlow`), and full
// at night; the rest light up only as night comes. Every glow breathes very
// slowly (a few percent), each plant in its own time.
//
// THE WIND: each point's `bend` (0 rigid .. 1 the most) says how far the wind
// moves it: a frond's tip sways, a mushroom's stem does not. Each plant sways
// in its own time too (worked out from where it stands).
//
// Both materials can be given more shader work by the game (`onCompile`: the
// island's distance fades, treeObjects.ts), run after this file's own.
// ============================================================================
import * as THREE from 'three';

/** THE GLOW COLOURS (Joshua's list, sRGB). One is given to each glowing plant as it is planted. */
export const FLORA_HUES = {
  cyan: 0x2ee6ff,
  violet: 0x9a5cff,
  emerald: 0x27f08a,
  amber: 0xffa62b,
  magenta: 0xff3ad2,
  crimson: 0xff2a44,
} as const;
export type FloraHue = keyof typeof FLORA_HUES;
export const FLORA_HUE_NAMES = Object.keys(FLORA_HUES) as FloraHue[];

/** The numbers shared by both materials (the game changes their `value`s; every plant follows at once). */
export interface FloraUniforms {
  /** Seconds, for the wind and the glow's slow breathing. */
  time: { value: number };
  /** 0 day .. 1 night: night-only glow follows it, "always" glow goes from `dayGlow` to full. */
  night: { value: number };
  /** How bright the "always" glow is by day (0..1). GAME TUNING. */
  dayGlow: { value: number };
  /** All glow at once (1 as designed; 0 none). */
  glowStrength: { value: number };
  /** All sway at once (1 as designed; 0 still). */
  wind: { value: number };
  /** The glow's colour on a mesh that gives none per plant (linear). */
  hue: { value: THREE.Color };
}

export function floraUniforms(): FloraUniforms {
  return {
    time: { value: 0 },
    night: { value: 0 },
    dayGlow: { value: 0.2 },
    glowStrength: { value: 1 },
    wind: { value: 1 },
    hue: { value: new THREE.Color(FLORA_HUES.cyan) },
  };
}

export interface FloraMaterials {
  lit: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  uniforms: FloraUniforms;
  dispose(): void;
}

/** Shader text shared by both: a plant's own number (from where it stands), and the wind. */
const VERTEX_COMMON = `
  attribute float bend;
  uniform float uFloraTime, uFloraWind;
  // where this plant stands (its instance's origin), or the model's own origin when it is not instanced
  vec3 floraFoot() {
    #ifdef USE_INSTANCING
      return (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #else
      return vec3(0.0);
    #endif
  }
  // a steady number 0..1 for each plant (so each sways and breathes in its own time, and is a touch lighter or darker)
  float floraHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`;

/** The wind: the plant's bendy parts lean to and fro (more at the tips), and flutter a little. */
const VERTEX_WIND = `
  vec3 floraAt = floraFoot();
  float floraPh = floraHash(floraAt) * 6.2832;
  float floraGust = sin(uFloraTime * 1.3 + floraPh) + 0.5 * sin(uFloraTime * 2.9 + floraPh * 1.7);
  transformed.x += floraGust * bend * uFloraWind * 0.03;
  transformed.z += floraGust * bend * uFloraWind * 0.018;
  transformed += objectNormal * sin(uFloraTime * 6.0 + dot(position, vec3(41.0, 23.0, 37.0))) * bend * uFloraWind * 0.004;`;

/** Each plant a little lighter or darker than the next (free variety: no two side by side alike). */
const VERTEX_VARIETY = `
  #ifdef USE_COLOR
    vColor.rgb *= 0.9 + 0.2 * floraHash(floraFoot() + vec3(1.7, 0.0, 3.1));
  #endif`;

/**
 * THE TWO MATERIALS. `onCompile` (optional) is given each shader after this file's own changes, with which of the two
 * it is, so the game can add its own (a distance fade); `key` keeps two sets apart in three.js's shader cache.
 */
export function makeFloraMaterials(uniforms = floraUniforms(), options: { onCompile?: (shader: THREE.WebGLProgramParametersWithUniforms, which: 'lit' | 'glow') => void; key?: string } = {}): FloraMaterials {
  const key = options.key ?? 'base';
  // (slightly satiny, as a mushroom's cap is; no metal)
  const params: THREE.MeshStandardMaterialParameters = { vertexColors: true, roughness: 0.72, metalness: 0 };

  // ---- LIT: the wind and the variety ----
  const lit = new THREE.MeshStandardMaterial(params);
  lit.name = 'flora-lit';
  lit.onBeforeCompile = (shader) => {
    shader.uniforms.uFloraTime = uniforms.time;
    shader.uniforms.uFloraWind = uniforms.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${VERTEX_COMMON}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        ${VERTEX_VARIETY}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${VERTEX_WIND}`);
    options.onCompile?.(shader, 'lit');
  };
  lit.customProgramCacheKey = () => `flora-lit-${key}`;

  // ---- GLOW: the same, plus each point's glow in the plant's own colour ----
  const glow = new THREE.MeshStandardMaterial(params);
  glow.name = 'flora-glow';
  glow.onBeforeCompile = (shader) => {
    shader.uniforms.uFloraTime = uniforms.time;
    shader.uniforms.uFloraWind = uniforms.wind;
    shader.uniforms.uFloraNight = uniforms.night;
    shader.uniforms.uFloraDayGlow = uniforms.dayGlow;
    shader.uniforms.uFloraGlowStrength = uniforms.glowStrength;
    shader.uniforms.uFloraHue = uniforms.hue;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${VERTEX_COMMON}
        attribute vec3 glow;
        uniform float uFloraNight, uFloraDayGlow, uFloraGlowStrength;
        uniform vec3 uFloraHue;
        varying vec3 vFloraGlow;`)
      // (the plant's own colour is its GLOW's colour here, not a tint over the whole plant as three.js would make it)
      .replace('#include <color_vertex>', `
        #ifdef USE_COLOR
          vColor = vec4(1.0);
          vColor.rgb *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vec3 floraHue = instanceColor.rgb;
        #else
          vec3 floraHue = uFloraHue;
        #endif
        ${VERTEX_VARIETY}
        {
          // how bright now: night-only parts follow the night; "always" parts go from the day's share to full
          float floraOn = mix(uFloraNight, mix(uFloraDayGlow, 1.0, uFloraNight), glow.y);
          // a slow breath, each plant in its own time, running up it
          float breath = 1.0 + 0.1 * sin(uFloraTime * 0.7 + floraHash(floraFoot()) * 6.2832 - position.y * 4.0);
          float amount = glow.x * floraOn * breath * uFloraGlowStrength;
          // its hot middle toward white (a light's core reads whiter than its edge)
          vFloraGlow = mix(floraHue, vec3(1.0), glow.z * 0.6) * amount;
          // by day a glowing part is tinged with its colour too, so its colour is seen in sunlight
          #ifdef USE_COLOR
            vColor.rgb = mix(vColor.rgb, vColor.rgb * 0.6 + floraHue * 0.4, glow.x * 0.22);
          #endif
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${VERTEX_WIND}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFloraGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // (a little over 1 at full strength, so the brightest parts are near white-hot, the rest keep their shading)
        totalEmissiveRadiance += vFloraGlow * 1.15;`);
    options.onCompile?.(shader, 'glow');
  };
  glow.customProgramCacheKey = () => `flora-glow-${key}`;

  return {
    lit, glow, uniforms,
    dispose() { lit.dispose(); glow.dispose(); },
  };
}

/** Give a glowing plant its colour (an InstancedMesh drawn with the GLOW material). */
export function setGlowHue(mesh: THREE.InstancedMesh, index: number, hue: FloraHue | THREE.Color): void {
  mesh.setColorAt(index, hue instanceof THREE.Color ? hue : new THREE.Color(FLORA_HUES[hue]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
