// ============================================================================
// hairStrands.ts -- her hair drawn as STRANDS AND LOCKS, not as a shiny hat.
//
// Joshua, 2026-11-19: "Can we improve the hair texture... add lines in it, add
// depth to look better than a shiny hat, haha". Her hair is the builder's
// "cards": strips of strands with see-through gaps, each lit with the normal of
// the whole lock it belongs to (Char_B hairMaterial.ts). That makes every lock
// one smooth round thing, so the light made one round shiny patch on it, like a
// helmet. Real hair shines in BANDS ACROSS the strands, and is grooved between
// its locks. Three things, added to the builder's material in the game only:
//
//   1. LOCKS AND GROOVES. Across the strands (the picture's U: the strands run
//      down its V, as the hair picture shows) a soft pattern of locks a few mm
//      wide: darker in the grooves between them ("lines in it").
//   2. DEPTH. That pattern and each strand's own light and dark in the picture
//      are read as a HEIGHT, and tilt the light pixel by pixel (a bump, the same
//      way as the woven suit's threads: outfitMaterial.ts). Nothing moves.
//   3. HAIR'S OWN SHINE (Kajiya and Kay's model, used for hair in games): the
//      shine is worked out from the STRAND'S DIRECTION, not from its surface, so
//      it lies in a band across the hair; two bands, a sharp white one and a
//      softer one in the hair's colour, shifted lock by lock so the bands break
//      up as real hair's do. The round, plastic shine is turned down (rougher).
//
// All of it is a few lines of shader: no more triangles, no new pictures.
// ============================================================================
import * as THREE from 'three';

/** The strand look's numbers (the DEV test pages change them live through `window.__hair`). */
export const HAIR_STRANDS = Object.freeze({
  /** How many locks to one unit of the picture's U (one unit is about 7 cm of hair across): ~4 mm locks. */
  locksPerUnit: 18,
  /** How deep the grooves between locks are, metres, and how much each strand's own light/dark adds. */
  depth: 0.0008,
  /** How dark a groove goes (0 none, 1 black). */
  grooveDark: 0.45,
  /** The two bands of shine: how bright, and how tight (bigger: a thinner band). */
  shine1: 0.2, tight1: 110,
  shine2: 0.08, tight2: 24,
  /** Her hair's own roughness (the builder's 0.62 gives the round, plastic shine). */
  roughness: 0.9,
});

const patched = new WeakSet<THREE.Material>();

/**
 * Add the strands to a hair material. Chained after the builder's own patches (it keeps them: the lock's normal, her
 * hair colour), with its own cache key, applied once per material.
 */
export function addHairStrands(material: THREE.Material): void {
  if (patched.has(material)) return;
  patched.add(material);
  const standard = material as THREE.MeshStandardMaterial;
  standard.roughness = HAIR_STRANDS.roughness;
  const uniforms = {
    hairLocks: { value: HAIR_STRANDS.locksPerUnit },
    hairDepth: { value: HAIR_STRANDS.depth },
    hairGroove: { value: HAIR_STRANDS.grooveDark },
    hairShine: { value: new THREE.Vector4(HAIR_STRANDS.shine1, HAIR_STRANDS.tight1, HAIR_STRANDS.shine2, HAIR_STRANDS.tight2) },
  };
  // (DEV only: test pages set the numbers by hand)
  if (import.meta.env.DEV) {
    const w = window as unknown as { __hair?: typeof uniforms[] };
    (w.__hair ??= []).push(uniforms);
  }
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => `#include <common>
uniform float hairLocks;
uniform float hairDepth;
uniform float hairGroove;
uniform vec4 hairShine;
// a smooth random value along one line, repeating every 'period' (so the picture's own repeat stays seamless)
float hairHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hairNoise(float x) { float i = floor(x), f = fract(x); return mix(hairHash(i), hairHash(i + 1.0), f * f * (3.0 - 2.0 * f)); }`)
      // 1. THE LOCKS: across the strands (U), two sizes of lock mixed, so they do not look like stripes
      .replace('#include <map_fragment>', () => `#include <map_fragment>
#ifdef USE_MAP
  float hairU = vMapUv.x * hairLocks;
  float hairLock = 0.65 * hairNoise(hairU) + 0.35 * hairNoise(hairU * 2.7 + 17.0);
  // each strand's own light and dark in the picture
  float hairStrand = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  // (how much of a lock one pixel covers: where locks are smaller than a pixel or two, far off or seen edge-on, the
  //  pattern would only sparkle, so its depth and its shifting shine fade out there and the hair is drawn smooth)
  float hairFine = 1.0 - smoothstep(0.25, 0.8, fwidth(hairU));
#else
  float hairU = 0.0; float hairLock = 0.5; float hairStrand = 0.5; float hairFine = 0.0;
#endif`)
      // (the grooves darkened AFTER her colour is set: the builder's colour line replaces the colour after the picture)
      .replace('#include <color_fragment>', () => `#include <color_fragment>
  diffuseColor.rgb *= mix(1.0 - hairGroove * hairFine, 1.0, smoothstep(0.15, 0.75, hairLock));
  // HOW SQUARELY THIS CARD FACES US (its own flat face, not the lock's rounded normal): a card seen edge-on is a hard
  // line of hair, as along her parting. Joshua, 2026-11-19: "try fading at the top hair split into the main hair":
  // seen edge-on its strands thin out (their see-through cut does the rest) and the hair behind shows through.
  vec3 hairFlat = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float hairFacing = abs(dot(hairFlat, normalize(vViewPosition)));
  diffuseColor.a *= mix(0.35, 1.0, smoothstep(0.06, 0.4, hairFacing));`)
      // 2. THE DEPTH: the locks and strands as a height, in metres, tilting the light (Morten Mikkelsen's bump, as
      //    three.js's own bump maps; screen-space, so it needs no tangents). Then the STRAND'S DIRECTION: the way the
      //    picture's V runs over her, from how V and the surface change from pixel to pixel.
      .replace('#include <normal_fragment_maps>', () => `#include <normal_fragment_maps>
  float hairHeight = hairDepth * hairFine * (0.8 * hairLock + 0.2 * hairStrand);
  vec3 hairSX = dFdx(-vViewPosition), hairSY = dFdy(-vViewPosition);
  // (the same sum with each pixel step made 1 long and the height's change divided by the step's length: it gives the
  //  same answer but never a vector of length nearly 0, which on a card seen edge-on became "no direction at all" and
  //  lit it a flat gray)
  float hairLX = max(length(hairSX), 1e-7), hairLY = max(length(hairSY), 1e-7);
  vec3 hairNX = hairSX / hairLX, hairNY = hairSY / hairLY;
  vec3 hairR1 = cross(hairNY, normal), hairR2 = cross(normal, hairNX);
  float hairDet = dot(hairNX, hairR1) * faceDirection;
  vec3 hairBumped = abs(hairDet) * normal - sign(hairDet) * (dFdx(hairHeight) / hairLX * hairR1 + dFdy(hairHeight) / hairLY * hairR2);
  if (abs(hairDet) > 0.02 && dot(hairBumped, hairBumped) > 1e-6) normal = normalize(hairBumped);
#ifdef USE_MAP
  vec2 hairUX = dFdx(vMapUv), hairUY = dFdy(vMapUv);
  vec3 hairAlong = hairSY * hairUX.x - hairSX * hairUY.x;   // the way V grows (U held still): along the strands
#else
  vec3 hairAlong = vec3(0.0, 1.0, 0.0);
#endif
  // (laid flat on the lock's surface. Where the strands stand up OUT of the lock's surface -- the locks rising from her
  //  parting -- little is left of the direction once it is laid flat: it cannot be trusted there, and its shine lit a
  //  flat gray patch along the parting, so the shine fades out with it)
  float hairRaw = length(hairAlong);
  hairAlong = hairAlong - normal * dot(hairAlong, normal);
  float hairTrust = hairRaw > 1e-12 ? smoothstep(0.55, 0.85, length(hairAlong) / hairRaw) : 0.0;
  hairAlong = length(hairAlong) > 1e-12 ? normalize(hairAlong) : vec3(0.0, 1.0, 0.0);`)
      // 3. HAIR'S OWN SHINE from the sun (the first directional light): two bands across the strands, each shifted
      //    lock by lock along the hair (tilting the strand toward or away from its surface)
      .replace('#include <lights_fragment_end>', () => `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
  {
    vec3 hairL = directionalLights[0].direction;
    vec3 hairH = normalize(hairL + normalize(vViewPosition));
    float hairShift = (hairLock - 0.5) * 0.5 * hairFine;
    // (the shine caught strand by strand: fine streaks, so a sheet of hair combed one way -- the lock over her parting --
    //  shines in streaks, not as one flat bright patch with a hard edge)
    float hairStreak = mix(0.1, 1.0, smoothstep(0.35, 0.9, hairNoise(hairU * 6.3 + 31.0))) * (0.5 + hairStrand);
    vec3 hairT1 = normalize(hairAlong + normal * (hairShift + 0.08));
    vec3 hairT2 = normalize(hairAlong + normal * (hairShift - 0.18));
    float hairTH1 = dot(hairT1, hairH), hairTH2 = dot(hairT2, hairH);
    float hairBand1 = pow(sqrt(max(0.0, 1.0 - hairTH1 * hairTH1)), hairShine.y);
    float hairBand2 = pow(sqrt(max(0.0, 1.0 - hairTH2 * hairTH2)), hairShine.w);
    // (lit side only, softly; the sharp band sparkles strand by strand)
    // (and none on a card seen edge-on: there the strand's direction cannot be told, and it lit a flat gray patch)
    float hairLit = smoothstep(-0.1, 0.4, dot(normal, hairL)) * smoothstep(0.15, 0.45, hairFacing) * hairTrust;
    vec3 hairTint = diffuseColor.rgb / max(0.04, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
    reflectedLight.directSpecular += directionalLights[0].color * hairLit
      * (hairShine.x * hairBand1 * hairStreak + hairShine.z * hairBand2 * hairTint * (0.4 + 0.6 * hairStreak));
  }
#endif`);
  };
  material.customProgramCacheKey = function () { return `${cacheKey.call(this)}|gdm-hair-strands-v1`; };
  material.needsUpdate = true;
}
