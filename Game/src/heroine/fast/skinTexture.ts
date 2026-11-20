// ============================================================================
// skinTexture.ts -- AN EXPERIMENT: a fine texture of real skin over her bare skin.
//
// Joshua, 2026-11-19 (sending a height map from his Local Texture Lab,
// docs/tools/Local_Texture_Lab.html): "I'm curious how it works with her body
// texture... it might make her body look lumpy or something else, haha, but
// just wanted to experiment with it."
//
// His height map is laid on her from three sides (like the suit's knit, so it
// needs no seams on her skin's picture) and tilts the light pixel by pixel (a
// bump): the light catches the little ridges of the skin, nothing moves. Only
// where the skin's roughness picture says SKIN (not her suit, not its trim).
// Off unless chosen: Settings -> HEROINE -> Skin texture (experiment).
// ============================================================================
import * as THREE from 'three';

/** The experiment's picture and sizes. */
export const SKIN_TEXTURE = Object.freeze({
  file: 'fabrics/skin-test-height.png',
  /** How much of her the picture covers before it repeats, metres. */
  tileMetres: 0.04,
  /** How deep its ridges are, metres (0.15 mm). */
  depth: 0.00015,
});

/** Where the roughness picture reads as cloth (outfitMaterial.ts CLOTH_FROM): below this it is her skin. */
const SKIN_BELOW = 0.58;

/**
 * Add the skin texture to one of her skin materials. Chained after anything already patched in (her suit's knit and
 * shine), with its own cache key. `unitsPerMetre`: her model's own units in a metre.
 */
export function addSkinTexture(material: THREE.MeshStandardMaterial, heightMap: THREE.Texture, unitsPerMetre: number): void {
  const uniforms = {
    skinHeightMap: { value: heightMap },
    skinTile: { value: SKIN_TEXTURE.tileMetres * unitsPerMetre },
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
    // (where the point is on her before her bones move it, after her shapes: the texture stays put on her skin)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNormal;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvSkinPos = transformed;\nvSkinNormal = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNormal;\nuniform sampler2D skinHeightMap;\nuniform float skinTile;\nuniform float skinDepth;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // only on her skin: where the roughness picture reads below cloth
#ifdef USE_ROUGHNESSMAP
    float skinHere = 1.0 - smoothstep(${(SKIN_BELOW - 0.04).toFixed(3)}, ${SKIN_BELOW.toFixed(3)}, texture2D(roughnessMap, vRoughnessMapUv).g);
#else
    float skinHere = 1.0;
#endif
    // the height, from three sides, each weighted by how much her skin faces it
    vec3 skinSide = abs(normalize(vSkinNormal)); skinSide /= (skinSide.x + skinSide.y + skinSide.z);
    vec3 skinAt = vSkinPos / skinTile;
    float skinHeight = skinDepth * skinHere * (texture2D(skinHeightMap, skinAt.zy).r * skinSide.x
      + texture2D(skinHeightMap, skinAt.xz).r * skinSide.y + texture2D(skinHeightMap, vec2(skinAt.x, -skinAt.y)).r * skinSide.z);
    // the bump (Morten Mikkelsen's, as three.js's own), with each pixel step made 1 long so it never divides by nearly 0
    vec3 skinSX = dFdx(-vViewPosition), skinSY = dFdy(-vViewPosition);
    float skinLX = max(length(skinSX), 1e-7), skinLY = max(length(skinSY), 1e-7);
    vec3 skinR1 = cross(skinSY / skinLY, normal), skinR2 = cross(normal, skinSX / skinLX);
    float skinDet = dot(skinSX / skinLX, skinR1) * faceDirection;
    vec3 skinBumped = abs(skinDet) * normal - sign(skinDet) * (dFdx(skinHeight) / skinLX * skinR1 + dFdy(skinHeight) / skinLY * skinR2);
    if (abs(skinDet) > 0.02 && dot(skinBumped, skinBumped) > 1e-6) normal = normalize(skinBumped);
  }`);
  };
  material.customProgramCacheKey = function () { return `${cacheKey.call(this)}|gdm-skin-texture-v1`; };
  material.needsUpdate = true;
}

/** Load the experiment's height picture (repeating, read as plain numbers). */
export function loadSkinHeight(renderer: THREE.WebGLRenderer): THREE.Texture {
  const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + SKIN_TEXTURE.file, (loaded) => { loaded.needsUpdate = true; });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
