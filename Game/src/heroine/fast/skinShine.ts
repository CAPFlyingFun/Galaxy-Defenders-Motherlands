// ============================================================================
// skinShine.ts -- HOW SHINY HER SKIN IS: dry, oily, or wet from the water.
//
// Joshua, 2026-11-19: "Can the skin shine be adjustable so like dry skin a
// little darker, more oily or wet skin could naturally have the shine? Could
// test it like stepping in the water would turn her skin more shiny for about
// 2 minutes and then fade over 30s... getting wet would be instant... dry
// longer".
//
// Two things, on her BARE skin only (where her roughness picture reads below
// cloth; her suit keeps its own shine):
//
//   * HER SKIN'S OWN SHINE, a setting (Settings -> HEROINE -> Skin shine,
//     0 dry .. 100 oily, 50 as she was): dry skin is matter (rougher) and a
//     little darker, oily skin smoother, so the light runs over it in a glossy
//     sheen. (Roughness is how blurred a surface's reflection is: 0 a mirror,
//     1 chalk.)
//   * WET SKIN, from the water: wet skin is a thin film of water over the
//     skin, so it is far smoother (a sharp, bright shine) and a little darker
//     (the water soaks up some light). Only as high as the water came up her
//     (the WATER LINE, in her own model's height), with a few centimetres of
//     splash above it. Getting wet is instant; she stays fully wet for
//     `WET.hold` seconds after leaving the water, then dries over `WET.fade`.
//
// A few lines in her skin's shader after its roughness is read; the timing is
// `SkinWetness`, stepped every frame by fastHeroine.ts.
// ============================================================================
import * as THREE from 'three';

/** The shine's numbers. */
export const SKIN_SHINE = Object.freeze({
  /** Roughness added at the DRY end (0), taken away at the OILY end (100): skin's own is about 0.5. */
  dryRougher: 0.18,
  oilySmoother: 0.25,
  /** How much darker dry skin is at 0 (5 %). */
  dryDarker: 0.05,
  /** Wet skin: its roughness (a film of water) and how much darker it is (12 %). */
  wetRoughness: 0.12,
  wetDarker: 0.12,
  /** How far above the water line the splash reaches, metres; and over how much its edge fades out. */
  splash: 0.05,
  edge: 0.06,
});

/** How long she stays wet (Joshua: "for about 2 minutes and then fade over 30s"). */
export const WET = Object.freeze({ hold: 120, fade: 30 });

/** Where the roughness picture reads as cloth (outfitMaterial.ts CLOTH_FROM): below this it is her skin. */
const SKIN_BELOW = 0.58;

/** The shine's numbers in her skin's shader, shared by both her skin materials (and changed live). */
export interface ShineUniforms {
  /** her skin's own shine, -1 dry .. 0 as she was .. +1 oily */
  skinOily: { value: number };
  /** how wet she is, 0 dry .. 1 soaked */
  skinWet: { value: number };
  /** the water line, in her model's own height (its units): wet below it */
  skinWetLine: { value: number };
  /** the splash above it and the line's soft edge, in her model's units */
  skinWetSplash: { value: number };
  skinWetEdge: { value: number };
}

export function shineUniforms(unitsPerMetre: number): ShineUniforms {
  return {
    skinOily: { value: 0 },
    skinWet: { value: 0 },
    skinWetLine: { value: -1e6 },
    skinWetSplash: { value: SKIN_SHINE.splash * unitsPerMetre },
    skinWetEdge: { value: SKIN_SHINE.edge * unitsPerMetre },
  };
}

/** Add the shine to one of her skin materials (chained after anything already patched in, with its own cache key). */
export function addSkinShine(material: THREE.MeshStandardMaterial, uniforms: ShineUniforms): void {
  const s = SKIN_SHINE;
  const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    // (how high each point of her is, in her model before her bones move it: the water line is in the same terms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vShineHeight;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvShineHeight = transformed.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vShineHeight;
uniform float skinOily, skinWet, skinWetLine, skinWetSplash, skinWetEdge;`)
      // (after the roughness AND metalness are read, so the suit's own shine lines, which read the roughness, are done)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
  {
    // only on her bare skin: where the roughness picture reads below cloth
    float shineBare = 1.0 - smoothstep(${(SKIN_BELOW - 0.04).toFixed(3)}, ${SKIN_BELOW.toFixed(3)}, texture2D(roughnessMap, vRoughnessMapUv).g);
    // her skin's own shine: rougher and a little darker when dry, smoother when oily
    float shineOwn = skinOily < 0.0 ? -skinOily * ${s.dryRougher.toFixed(3)} : -skinOily * ${s.oilySmoother.toFixed(3)};
    roughnessFactor = clamp(roughnessFactor + shineOwn * shineBare, 0.04, 1.0);
    diffuseColor.rgb *= 1.0 - max(0.0, -skinOily) * ${s.dryDarker.toFixed(3)} * shineBare;
    // wet below the water line (and its splash), fading out over a few centimetres above it
    float shineWet = skinWet * shineBare * (1.0 - smoothstep(skinWetLine + skinWetSplash, skinWetLine + skinWetSplash + skinWetEdge, vShineHeight));
    roughnessFactor = mix(roughnessFactor, ${s.wetRoughness.toFixed(3)}, shineWet);
    diffuseColor.rgb *= 1.0 - ${s.wetDarker.toFixed(3)} * shineWet;
  }
#endif`);
  };
  material.customProgramCacheKey = function () { return `${cacheKey.call(this)}|gdm-skin-shine-v1`; };
  material.needsUpdate = true;
}

/**
 * HOW WET SHE IS, over time. `step` every frame with how deep the water is at her feet (metres; 0 out of it): in water,
 * she is wet at once up to the deepest it has come this time; out of it, she stays wet `WET.hold` seconds, then dries
 * over `WET.fade` (and the water line is forgotten once she is dry). `soak` wets her all over (the test button).
 */
export class SkinWetness {
  /** 0 dry .. 1 soaked */
  amount = 0;
  /** how high up her the water came, metres above her feet */
  line = -1;
  private sinceOut = Infinity;

  step(seconds: number, waterDepth: number): void {
    if (waterDepth > 0) {
      this.line = Math.max(this.line, waterDepth);
      this.sinceOut = 0;
      this.amount = 1;
      return;
    }
    this.sinceOut += seconds;
    const drying = this.sinceOut - WET.hold;
    this.amount = drying <= 0 ? (this.line > 0 ? 1 : 0) : Math.max(0, 1 - drying / WET.fade);
    if (this.amount === 0) this.line = -1;
  }

  /** Wet all over at once, as if just out of deep water (Settings -> TEST TOOLS -> Get wet). */
  soak(): void { this.line = 3; this.sinceOut = 0; this.amount = 1; }
}
