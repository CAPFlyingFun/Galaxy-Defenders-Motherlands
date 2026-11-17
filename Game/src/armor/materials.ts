// ============================================================================
// materials.ts -- the ONE material every armor piece is drawn with.
//
// Why one: each different material on screen costs the phone a separate "draw
// call". With one shared material a whole helmet (paint, dark trim, glow
// strips AND visor glass) is a single call.
//
// How one material can look like four: every corner of every piece carries
// its paint colour and three extra numbers, `armorFx` (see geo.ts):
//     x = glow, y = roughness, z = visor glass.
// A few lines added to three.js's standard shader read them:
//   * roughness comes from the corner, so glossy paint, rubbery under-armor
//     and mirror-smooth glass can sit side by side;
//   * glow adds the corner's colour as light of its own (a light strip stays
//     bright in shadow);
//   * a soft RIM LIGHT brightens surfaces that curve away from the eye. On
//     paint it stands in for the clear-coat shine of a toy-like finish without
//     needing reflections of a room; on visor glass it is much stronger, which
//     is what makes a dark visor read as curved glass.
// All of it works under the simplest lighting (one sky light, one sun).
// ============================================================================
import * as THREE from 'three';

export interface ArmorMaterialOptions {
  /** How bright light strips are (1 = their own colour; more blooms brighter on screen). */
  readonly glowStrength?: number;
  /** How strong the clear-coat rim light on paint is (0 = off). */
  readonly rim?: number;
}

/**
 * Make the shared armor material. Make it ONCE and hand the same one to every piece
 * (`buildRigidArmor` does this for you); `dispose()` it when the heroine is removed for good.
 */
export function createArmorMaterial(opts: ArmorMaterialOptions = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.12, roughness: 0.4 });
  const uniforms = {
    uArmorGlow: { value: opts.glowStrength ?? 1.6 },
    uArmorRim: { value: opts.rim ?? 0.22 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // Vertex stage: pass each corner's three finish numbers on to the pixels between the corners.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 armorFx;\nvarying vec3 vArmorFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArmorFx = armorFx;');
    // Pixel stage.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArmorFx;\nuniform float uArmorGlow;\nuniform float uArmorRim;')
      // remember the paint colour, then darken glass and light strips so they are lit mostly by their own light below
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 armorPaint = diffuseColor.rgb;
        diffuseColor.rgb *= 1.0 - 0.6 * vArmorFx.z - 0.5 * vArmorFx.x;`)
      // roughness from the corner, not one value for the whole material
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vArmorFx.y, 0.04, 1.0);')
      // glow strips and the rim light, added as light of the surface's own
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 armorN = normalize(vNormal);
          #ifdef DOUBLE_SIDED
            armorN *= gl_FrontFacing ? 1.0 : -1.0;
          #endif
          // 0 where the surface faces the eye, 1 where it turns edge-on
          float armorEdge = pow(1.0 - clamp(dot(armorN, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += armorPaint * vArmorFx.x * uArmorGlow;
          totalEmissiveRadiance += armorPaint * armorEdge * uArmorRim * (1.0 - vArmorFx.z) * (1.0 - vArmorFx.x);
          totalEmissiveRadiance += (armorPaint * 1.6 + vec3(0.10, 0.12, 0.16)) * armorEdge * vArmorFx.z;
        }`);
  };
  // (tells three.js this material's shader differs from a plain standard material's, so the two are never mixed up)
  mat.customProgramCacheKey = () => 'galaxy-defenders-armor-v1';
  mat.userData.armorUniforms = uniforms;
  return mat;
}
