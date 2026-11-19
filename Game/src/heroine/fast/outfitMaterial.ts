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

export function makeSkinMaterials(fileMaterial: THREE.Material, look: BakedLook, renderer: THREE.WebGLRenderer, clothShine?: number): SkinMaterials {
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
    // A GLOSSY SUIT (a look's `clothShine`): after three.js reads the roughness picture, every spot that reads as cloth
    // takes the look's roughness instead, blended in over a short range so the suit's edge on her skin stays soft.
    // One line in the shader; her skin, face and hair keep their own.
    if (clothShine !== undefined) {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n' +
          `roughnessFactor = mix(roughnessFactor, ${clothShine.toFixed(3)}, smoothstep(${(CLOTH_FROM - 0.04).toFixed(3)}, ${CLOTH_FROM.toFixed(3)}, roughnessFactor));`);
      };
      // (three.js keeps one compiled shader per key: this one is its own)
      material.customProgramCacheKey = () => `cloth-shine-${clothShine}`;
    }
    return material;
  };
  const fine = make(true), plain = make(false);
  freeMaterial(fileMaterial);
  return { fine, plain, dispose(): void { fine.dispose(); plain.dispose(); } };
}
