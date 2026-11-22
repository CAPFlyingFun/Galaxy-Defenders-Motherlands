// ============================================================================
// skinTexture.ts -- HER SKIN'S DEPTH: the Character Builder's "hybrid".
//
// Joshua, 2026-11-19: he ran her skin picture through his Local Texture Lab
// (docs/tools/Local_Texture_Lab.html) to see "how it works with her body
// texture"; the builder's own agent then made pores and creases with the same
// lab's maths, and Joshua asked for a hybrid of the two. As the builder has it
// (Char_B/CLAUDE.md "THE HYBRID, AS IT IS NOW"; Char_B/src/sarahlab/skinDetail.ts),
// two depths on her BARE skin only (none under her painted clothes), added
// together into one tilt of her surface's direction (a "bump"):
//
//   1. HER OWN SKIN PICTURE'S DEPTH, 0.5 mm: each look's own baked skin
//      picture turned into a 4096 height map by the lab's recipe (Convert mode,
//      its defaults, edge blending off: scripts/make_skin_height.py, the same
//      maths as the builder's scripts/skinHeight.mjs) -> heroines/<look>/
//      skinHeight.webp, read at the same picture position as her colour.
//   2. THE PORE AND CREASE TILE, 0.3 mm: the builder's own tile
//      (Char_B public/models/skins/skin-detail-1024.png, made by its
//      scripts/skinDetail.mjs), laid on from three sides by where her skin WAS
//      as baked (so it stays put on her and stretches with her), 6 cm a tile,
//      its pits 18 % darker.
//
// Nothing moves: only the light changes, so it costs almost nothing. Settings
// -> HEROINE -> Skin depth turns it off.
// ============================================================================
import * as THREE from 'three';
import { bakedLookFolder } from './bakedLook';
import { packedPicturesOn, packedTexture } from './packedPictures';

/** The builder's numbers (Char_B skinDetail.ts SKIN_DETAIL): kept as they are unless Joshua changes them. */
export const SKIN_TEXTURE = Object.freeze({
  /** metres one pore tile spans (its 40 x 40 pores 1.5 mm apart) */
  tileMetres: 0.06,
  /** the pore tile's depth, metres, highest to lowest */
  tileDepth: 0.0003,
  /** the depth of her own skin picture, metres, white above black */
  ownDepth: 0.0005,
  /** how much darker the tile's pits are (0 none) */
  cavity: 0.18,
});

/** The builder's pore and crease tile (served from its folder: Game/charb-files.json lists it). */
const PORE_TILE = 'charb/models/skins/skin-detail-1024.png';

/** Where the roughness picture reads as cloth (outfitMaterial.ts CLOTH_FROM): below this it is her skin. */
const SKIN_BELOW = 0.58;

/**
 * Her skin's two pictures for one look: her own skin's height (her picture's layout) and the pore tile (repeating).
 * `release()` when the body is done with them: her own height map is let go, and the shared pore tile once nobody uses it.
 */
export interface SkinPictures { readonly own: THREE.Texture; readonly tile: THREE.Texture; release(): void }

/**
 * THE PORE TILE IS SHARED (Joshua, 2026-11-21, ChatGPT's review): it is the same picture on every body, and each body
 * loaded its own copy, about 5 MB on the graphics chip each (1024 x 1024 with its smaller copies). Now one copy is
 * loaded the first time a body asks, and counted: each body gives it back as it goes (an outfit change, a reload), and
 * it is let go only when the last one has. (So an outfit change of Blaze's keeps it on the chip for John, and only a
 * body alone in the game loads it again after a change, as before.)
 */
let poreTile: THREE.Texture | null = null;
let poreTileUsers = 0;
function takePoreTile(sharp: number): THREE.Texture {
  if (!poreTile) {
    const tile = new THREE.TextureLoader().load(import.meta.env.BASE_URL + PORE_TILE, (t) => { t.needsUpdate = true; });
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
    tile.colorSpace = THREE.NoColorSpace;
    tile.anisotropy = sharp;
    poreTile = tile;
  }
  poreTileUsers++;
  return poreTile;
}
function giveBackPoreTile(): void {
  poreTileUsers = Math.max(0, poreTileUsers - 1);
  if (poreTileUsers === 0 && poreTile) { poreTile.dispose(); poreTile = null; }
}

/**
 * Load a look's skin height map and take the shared pore tile (both read as plain numbers, not colours).
 * `packed`: the look's packed skin height (look.json `packed.skinHeight` and `packedAt`, scripts/make_ktx2.py): loaded
 * PACKED for the graphics chip (packedPictures.ts; 22 MB there instead of 89), unless the page has `?packed=off`.
 */
export async function loadSkinPictures(look: string, renderer: THREE.WebGLRenderer, packed?: { file: string; at: string } | null): Promise<SkinPictures> {
  const sharp = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  let own: THREE.Texture | null = null;
  if (packed && packedPicturesOn()) {
    // (a packed skin height that fails or is too slow falls back to its WebP one: packedPictures.ts, NEVER STUCK)
    try {
      const response = await fetch(bakedLookFolder(look) + `${packed.file}?bake=${encodeURIComponent(packed.at)}`);
      if (!response.ok) throw new Error(`${look}'s packed skin height did not load (${response.status})`);
      own = await packedTexture(await response.arrayBuffer(), false, renderer);
    } catch (error) {
      console.warn(`[packed pictures] ${look}'s skin height did not load packed (${String(error)}); its WebP picture is used`);
    }
  }
  if (!own) {
    own = new THREE.TextureLoader().load(bakedLookFolder(look) + `skinHeight.webp?v=${encodeURIComponent(__APP_VERSION__)}`,  // (never an old copy: bakedLook.ts)
      (t) => { t.needsUpdate = true; });
    own.colorSpace = THREE.NoColorSpace;
    own.flipY = false;   // (as her baked pictures: bakedLook.ts reads them the glTF way round)
  }
  own.anisotropy = sharp;
  const tile = takePoreTile(sharp);
  let released = false;
  return {
    own,
    tile,
    // (once only: a body let go of twice must not give the tile back twice)
    release() { if (released) return; released = true; own.dispose(); giveBackPoreTile(); },
  };
}

/**
 * Add her skin's depth to one of her skin materials. Chained after anything already patched in (her suit's knit and
 * shine), with its own cache key. `unitsPerMetre`: her model's own units in a metre (the tile is laid on in those).
 */
export function addSkinTexture(material: THREE.MeshStandardMaterial, pictures: SkinPictures, unitsPerMetre: number): void {
  const uniforms = {
    skinOwnMap: { value: pictures.own },
    skinTileMap: { value: pictures.tile },
    skinTile: { value: SKIN_TEXTURE.tileMetres * unitsPerMetre },
    skinTileDepth: { value: SKIN_TEXTURE.tileDepth },
    skinOwnDepth: { value: SKIN_TEXTURE.ownDepth },
    skinCavity: { value: SKIN_TEXTURE.cavity },
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
    // WHERE HER SKIN WAS AS BAKED (shapedBody.ts `knitRest`, on every level of her) and its direction: the tile is laid
    // on by these. (The suit's knit may have declared the same point already: declared once only.)
    const restDeclared = shader.vertexShader.includes('attribute vec3 knitRest;');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${restDeclared ? '' : 'attribute vec3 knitRest;\n'}varying vec3 vSkinRest;\nvarying vec3 vSkinRestN;`)
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvSkinRest = knitRest;\nvSkinRestN = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSkinRest;
varying vec3 vSkinRestN;
uniform sampler2D skinOwnMap, skinTileMap;
uniform float skinTile, skinTileDepth, skinOwnDepth, skinCavity;
// the pore tile's height here (0..1), from three sides, each weighted by how squarely her skin faces it (sharpened, as
// the builder's, so the three blend over only a narrow band)
float skinTileHeight() {
  vec3 w = pow(abs(normalize(vSkinRestN)), vec3(4.0));
  w /= max(1e-5, w.x + w.y + w.z);
  vec3 p = vSkinRest / skinTile;
  return texture2D(skinTileMap, p.zy).r * w.x + texture2D(skinTileMap, p.xz).r * w.y + texture2D(skinTileMap, p.xy).r * w.z;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef USE_MAP
  {
    // only on her bare skin: where the roughness picture reads below cloth
#ifdef USE_ROUGHNESSMAP
    float skinBare = 1.0 - smoothstep(${(SKIN_BELOW - 0.04).toFixed(3)}, ${SKIN_BELOW.toFixed(3)}, texture2D(roughnessMap, vRoughnessMapUv).g);
#else
    float skinBare = 1.0;
#endif
    // the two depths, in metres: the pore tile, and her own skin picture where her colour is
    float skinPores = skinTileHeight();
    float skinHeight = skinBare * (skinTileDepth * skinPores + skinOwnDepth * texture2D(skinOwnMap, vMapUv).r);
    // the bump (Morten Mikkelsen's, as three.js's own), with each pixel step made 1 long so it never divides by nearly 0
    vec3 skinSX = dFdx(-vViewPosition), skinSY = dFdy(-vViewPosition);
    float skinLX = max(length(skinSX), 1e-7), skinLY = max(length(skinSY), 1e-7);
    vec3 skinR1 = cross(skinSY / skinLY, normal), skinR2 = cross(normal, skinSX / skinLX);
    float skinDet = dot(skinSX / skinLX, skinR1) * faceDirection;
    vec3 skinBumped = abs(skinDet) * normal - sign(skinDet) * (dFdx(skinHeight) / skinLX * skinR1 + dFdy(skinHeight) / skinLY * skinR2);
    if (abs(skinDet) > 0.02 && dot(skinBumped, skinBumped) > 1e-6) normal = normalize(skinBumped);
    // the pores' pits a little darker (only the pits: the skin's own colour stays as it was on average)
    diffuseColor.rgb *= 1.0 - skinCavity * skinBare * clamp((0.42 - skinPores) * 3.0, 0.0, 1.0);
  }
#endif`);
  };
  material.customProgramCacheKey = function () { return `${cacheKey.call(this)}|gdm-skin-hybrid-v1`; };
  material.needsUpdate = true;
}
