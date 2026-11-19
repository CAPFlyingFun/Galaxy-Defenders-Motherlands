// ============================================================================
// outfitMaterial.ts -- the fast heroine's skin material: ONE ordinary three.js
// material wearing her baked look.
//
// In the builder's room her skin's material is the file's material with a long
// chain of shader patches on it (paint layers, fabric swatches, her face, her
// breathing, softening under cloth...). All of that work was done once by the
// bake (src/bake/), so here her skin is the plainest material three.js has for
// a lit surface, reading three pictures:
//   map           her finished colour (skin, face and painted outfit)
//   normalMap     her fine surface detail as the builder lit it
//   roughnessMap  \  how shiny each spot is (one picture: green = roughness,
//   metalnessMap  /  blue = metalness)
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts `paintedMaterial`): only
// the idea of keeping TWO versions, "fine" with the surface-detail picture and
// "plain" without. On a much lighter body the detail picture no longer lines
// up with the big triangles and shows as dark blotches, so levels under 25 %
// wear the plain one. The DEV Room's own stand-in outfit (a tee and leggings
// coloured by height in the shader) is NOT used: her outfit is the builder's
// real one, from the bake.
// ============================================================================
import * as THREE from 'three';
import type { BakedLook } from './bakedLook';
import { freeMaterial } from './bodyFile';

export interface SkinMaterials {
  /** For levels of 25 % and over: with her fine surface detail. */
  readonly fine: THREE.MeshStandardMaterial;
  /** For lighter levels: the same without it. */
  readonly plain: THREE.MeshStandardMaterial;
  dispose(): void;
}

/** Below this detail her skin wears the plain material (the DEV Room's number). */
export const FINE_FROM_DETAIL = 25;

/**
 * Make her skin's two materials from the body file's own skin material (its settings are kept: which side is
 * drawn, how the detail picture is read) and a baked look. The file's own pictures are freed: nothing reads them.
 */
/** Roughness at and above this in her surface picture is cloth (the builder's knits are 0.72 to 0.97; her skin is under 0.6). */
const CLOTH_FROM = 0.62;
/**
 * ...and at and above this, the SMOOTH cloth: the builder's Flat family (0.92), which a look uses for glossy trim. (The
 * athletic knit is 0.72, well under it. Jersey, rib and sweater knits are up here too: a look that wants its trim to
 * shine does not use them.)
 */
const TRIM_FROM = 0.85;

/**
 * How shiny a look's cloth is: `cloth` the roughness its knits take, `trim` the roughness its smooth (Flat) cloth takes.
 * Either left out: that cloth keeps its own.
 */
export interface ClothShine {
  readonly cloth?: number;
  readonly trim?: number;
  /**
   * Darken the knit's GRAYS by this much (0.5 halves their light): the knit keeps its stitches, only darker (Joshua,
   * 2026-11-19: "manually darkening the image about 50%"). Coloured knit -- a red stripe -- and the smooth trim are
   * left as they are. Left out: no darkening.
   */
  readonly darken?: number;
}

export function makeSkinMaterials(fileMaterial: THREE.Material, look: BakedLook, renderer: THREE.WebGLRenderer, shine?: ClothShine): SkinMaterials {
  const from = fileMaterial as THREE.MeshStandardMaterial;
  // A sharper picture at a slant (the side of her leg seen along its length), at little cost.
  const sharpness = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const picture of [look.albedo, look.normal, look.surface]) picture.anisotropy = sharpness;

  const make = (withDetail: boolean): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      name: withDetail ? 'heroine-skin-fine' : 'heroine-skin-plain',
      // every number is in the pictures, so the material's own are the neutral ones
      color: 0xffffff, roughness: 1, metalness: 1,
      map: look.albedo,
      roughnessMap: look.surface, metalnessMap: look.surface,
      normalMap: withDetail ? look.normal : null,
      side: from.side,
    });
    // (the bake divided her lit direction by the builder's own setting, so reading it back with that setting gives the
    // direction the builder lit her with)
    if (withDetail) material.normalScale.set(look.manifest.normalScale[0], look.manifest.normalScale[1]);
    // A SHINIER SUIT (a look's `clothShine`): after three.js reads the roughness picture, every spot that reads as cloth
    // takes the look's roughness instead -- its knit one, or its smooth trim's -- each blended in over a short range so
    // the edges stay soft. A few lines in the shader; her skin, face and hair keep their own.
    if (shine && (shine.cloth !== undefined || shine.trim !== undefined || shine.darken !== undefined)) {
      const lines: string[] = ['float ownRoughness = roughnessFactor;'];
      const band = (from: number) => `smoothstep(${(from - 0.04).toFixed(3)}, ${from.toFixed(3)}, ownRoughness)`;
      if (shine.cloth !== undefined) lines.push(`roughnessFactor = mix(roughnessFactor, ${shine.cloth.toFixed(3)}, ${band(CLOTH_FROM)});`);
      if (shine.trim !== undefined) lines.push(`roughnessFactor = mix(roughnessFactor, ${shine.trim.toFixed(3)}, ${band(TRIM_FROM)});`);
      // THE DARKER KNIT: right after her colour is read, where the roughness picture says knit (not skin, not the smooth
      // trim) and the colour is a gray (its channels nearly equal: a red stripe is not), the colour is darkened
      const darken = shine.darken === undefined ? '' : [
        'float knitRoughness = texture2D(roughnessMap, vRoughnessMapUv).g;',
        `float knitHere = smoothstep(${(CLOTH_FROM - 0.04).toFixed(3)}, ${CLOTH_FROM.toFixed(3)}, knitRoughness) * (1.0 - smoothstep(${(TRIM_FROM - 0.04).toFixed(3)}, ${TRIM_FROM.toFixed(3)}, knitRoughness));`,
        'float knitColourful = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));',
        'float knitGray = 1.0 - smoothstep(0.02, 0.06, knitColourful);',
        `diffuseColor.rgb *= mix(1.0, ${(1 - shine.darken).toFixed(3)}, knitHere * knitGray);`,
      ].join('\n');
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_fragment>', '#include <map_fragment>\n' + darken)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + lines.join('\n'));
      };
      // (three.js keeps one compiled shader per key: this one is its own)
      material.customProgramCacheKey = () => `cloth-shine-${shine.cloth}-${shine.trim}-${shine.darken}`;
    }
    return material;
  };
  const fine = make(true), plain = make(false);
  freeMaterial(fileMaterial);
  return { fine, plain, dispose(): void { fine.dispose(); plain.dispose(); } };
}
