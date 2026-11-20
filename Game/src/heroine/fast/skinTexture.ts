// ============================================================================
// skinTexture.ts -- AN EXPERIMENT: her own skin picture turned into DEPTH.
//
// Joshua, 2026-11-19: he ran her skin picture through his Local Texture Lab
// (docs/tools/Local_Texture_Lab.html) at 512 to see "how it works with her
// body texture", then asked for a higher quality version from the picture in
// the repo. Her game body has its own picture layout, so each look gets a
// HEIGHT MAP made from its own baked skin picture, at 4096 x 4096 (as big as her colour picture), by the lab's
// own recipe (scripts/make_skin_height.py writes heroines/<look>/skinHeight.webp).
//
// It is read at the SAME picture position as her colour, so every crease and
// shade of her skin picture lines up with its depth, and it tilts the light
// pixel by pixel (a bump): the light catches what is raised. Nothing moves.
// Only where the roughness picture says SKIN (not her suit, not its trim).
// Off unless chosen: Settings -> HEROINE -> Skin texture (experiment).
// ============================================================================
import * as THREE from 'three';
import { bakedLookFolder } from './bakedLook';

/** The experiment's numbers. */
export const SKIN_TEXTURE = Object.freeze({
  /** How deep white is above black in the height map, metres (0.5 mm: 0.3 hardly showed, 0.8 speckled her suit's edges). */
  depth: 0.0005,
});

/** Where the roughness picture reads as cloth (outfitMaterial.ts CLOTH_FROM): below this it is her skin. */
const SKIN_BELOW = 0.58;

/** Load a look's skin height map (read as plain numbers; her picture's layout, not repeating). */
export function loadSkinHeight(look: string, renderer: THREE.WebGLRenderer): THREE.Texture {
  const t = new THREE.TextureLoader().load(bakedLookFolder(look) + 'skinHeight.webp', (loaded) => { loaded.needsUpdate = true; });
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;   // (as her baked pictures: bakedLook.ts reads them the glTF way round)
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

/**
 * Add the skin depth to one of her skin materials. Chained after anything already patched in (her suit's knit and
 * shine), with its own cache key.
 */
export function addSkinTexture(material: THREE.MeshStandardMaterial, heightMap: THREE.Texture): void {
  const uniforms = {
    skinHeightMap: { value: heightMap },
    skinDepth: { value: SKIN_TEXTURE.depth },
  };
  // (DEV only: test pages set the numbers by hand)
  if (import.meta.env.DEV) {
    const w = window as unknown as { __skin?: typeof uniforms[] };
    (w.__skin ??= []).push(uniforms);
  }
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D skinHeightMap;\nuniform float skinDepth;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef USE_MAP
  {
    // only on her skin: where the roughness picture reads below cloth
#ifdef USE_ROUGHNESSMAP
    float skinHere = 1.0 - smoothstep(${(SKIN_BELOW - 0.04).toFixed(3)}, ${SKIN_BELOW.toFixed(3)}, texture2D(roughnessMap, vRoughnessMapUv).g);
#else
    float skinHere = 1.0;
#endif
    // the height, at the same picture position as her colour, in metres
    float skinHeight = skinDepth * skinHere * texture2D(skinHeightMap, vMapUv).r;
    // the bump (Morten Mikkelsen's, as three.js's own), with each pixel step made 1 long so it never divides by nearly 0
    vec3 skinSX = dFdx(-vViewPosition), skinSY = dFdy(-vViewPosition);
    float skinLX = max(length(skinSX), 1e-7), skinLY = max(length(skinSY), 1e-7);
    vec3 skinR1 = cross(skinSY / skinLY, normal), skinR2 = cross(normal, skinSX / skinLX);
    float skinDet = dot(skinSX / skinLX, skinR1) * faceDirection;
    vec3 skinBumped = abs(skinDet) * normal - sign(skinDet) * (dFdx(skinHeight) / skinLX * skinR1 + dFdy(skinHeight) / skinLY * skinR2);
    if (abs(skinDet) > 0.02 && dot(skinBumped, skinBumped) > 1e-6) normal = normalize(skinBumped);
  }
#endif`);
  };
  material.customProgramCacheKey = function () { return `${cacheKey.call(this)}|gdm-skin-height-v2`; };
  material.needsUpdate = true;
}
