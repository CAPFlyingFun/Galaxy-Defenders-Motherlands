// ============================================================================
// shirtHem.ts -- WHICH OF HER PAINTED LAYERS IS A SHIRT WITH A HEM
//
// The builder hangs a level hem band from a painted shirt (Char_B tunicDrape.ts,
// fabricPanel.ts `dressDrape`): the top-most painted layer whose template has a
// LENGTH and that is worn in a fabric. The game draws that hem itself, as a band
// made the way her belt is (beltGear.ts `hem`; Joshua, 2026-11-23: "another belt
// that follows her bottom edging with matching color"); the bake finds the shirt
// by the builder's own rule, here, and measures where its paint ends.
// ============================================================================
import * as THREE from 'three';
import { SWATCH_HEX, fabricFamily, opacityOf, swatchRect, tileUnits, type FabricChoice, type FabricPick } from '@charb/sarahlab/fabricLibrary';
import { TINT_BASE_COLOUR, tintPixels } from '@charb/sarahlab/fabricTint';
import { setFabricLayer } from '@charb/sarahlab/fabricMaterial';

/** Her painted shirt: its paint layer (0 first), its fabric and its template's length. */
export interface ShirtWear {
  readonly layer: number;
  readonly choice: FabricChoice;
  readonly length: number;
}

/** A saved layer as a look's clothes hold it (only what is read here). */
interface SavedLayerLike {
  readonly choice?: FabricChoice | null;
  readonly template?: { readonly id: string; readonly params: { readonly length?: number | null } } | null;
}

/**
 * THE TOP-MOST PAINTED LAYER WITH A LENGTH AND A FABRIC, as the builder picks the layer its hem band is the shirt of
 * (from the last layer down, the first whose template has a length): its index, fabric and length; null when she wears
 * no painted shirt with a hem.
 */
export function shirtWearOf(clothes: unknown): ShirtWear | null {
  const layers = ((clothes as { layers?: readonly (SavedLayerLike | null)[] } | null)?.layers ?? []);
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const length = layer?.template?.params.length;
    if (!layer?.choice?.fabric || length === null || length === undefined) continue;
    return { layer: i, choice: layer.choice, length };
  }
  return null;
}

/**
 * THE SHIRT'S KNIT FOR ITS HEM BAND, as the bake writes it into look.json (`hem.knit`): the swatch (its family, its
 * colour's cell, a custom colour's tint), how matte it is and how see-through, and ONE REPEAT OF IT IN METRES ON HER, as
 * the builder's room lays it on her skin (its `tileUnits` in her mesh's units, over her units a metre), so the band's
 * knit is the size of the shirt's own.
 */
export interface HemKnit {
  readonly family: FabricPick['family'];
  readonly colour: number;
  readonly tint?: string;
  readonly tileM: number;
  readonly opacity: number;
  readonly roughness: number;
}

/**
 * The knit of her painted shirt, for the bake to write. `unitsPerCm`: the room's own say for her skin (its fabric panel's
 * hook: Char_B SarahLabScene.ts `unitsPerCm`); `unitsPerMetre`: her rest places' units a metre (her skeleton's bind
 * scale). Null for a picture of his own (none of the shirts has one) or no fabric.
 */
export function hemKnitOf(wear: ShirtWear, unitsPerCm: number, unitsPerMetre: number): HemKnit | null {
  const pick = wear.choice.fabric;
  if (!pick || pick.image) return null;
  const family = fabricFamily(pick.family);
  return {
    family: pick.family, colour: pick.colour, ...(pick.tint ? { tint: pick.tint } : {}),
    tileM: +(tileUnits(family, wear.choice.stitch, unitsPerCm) / unitsPerMetre).toFixed(5),
    opacity: opacityOf(wear.choice), roughness: family.roughness,
  };
}

/** A picture of the builder's (relative to its public folder), as the game serves them (vite.config.ts `charb()`). */
async function builderPicture(path: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}charb/${path}`);
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/**
 * THE SWATCH as a tiling texture, cut as the builder's fabric panel cuts it (fabricPanel.ts `swatchTexture`, its 'plain'
 * sheet): its colour's cell of the family's sheet, at the sheet's own resolution; a custom colour, the White swatch dyed
 * (fabricTint.ts); mirrored as it repeats. Null if the sheet cannot be had.
 */
export async function shirtSwatch(knit: Pick<HemKnit, 'family' | 'colour' | 'tint'>): Promise<THREE.Texture | null> {
  const sheet = await builderPicture(fabricFamily(knit.family).plain);
  if (!sheet) return null;
  const r = swatchRect('grid', knit.colour, sheet.width);
  const canvas = document.createElement('canvas');
  canvas.width = r.w; canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { sheet.close(); return null; }
  ctx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  sheet.close();
  if (knit.tint) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    tintPixels(pixels.data, knit.tint, SWATCH_HEX[knit.family][TINT_BASE_COLOUR]);
    ctx.putImageData(pixels, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * DRESS A HEM BAND IN THE SHIRT'S OWN KNIT. Seen in the first band's pictures (2026-11-23): in one plain colour it read
 * as a strip of its own under the shirt's knit. The shirt's swatch is laid on by the builder's own fabric shader
 * (fabricMaterial.ts `setFabricLayer`: three-sided, on where each point of the band was made), one repeat `tileM` metres
 * as on her skin. `unitsPerMetre`: the band mesh's units a metre (her skin's: it is bound as her skin is). The texture,
 * to be let go with the band; null if the swatch could not be had (the band keeps its plain colour).
 */
export async function dressInKnit(mesh: THREE.Mesh, material: THREE.Material, knit: HemKnit, unitsPerMetre: number): Promise<THREE.Texture | null> {
  const texture = await shirtSwatch(knit);
  if (!texture) return null;
  setFabricLayer(mesh, material, 0, { texture, tile: knit.tileM * unitsPerMetre, opacity: knit.opacity, roughness: knit.roughness }, { layers: 1, masked: false, rest: null });
  // (the knit is laid where three.js reads a material's picture, and a point's own colour is multiplied in AFTER it: the
  // band's plain colour, kept on its points for a band that is not dressed, made the knit 0.43 as bright -- MEASURED in
  // the first pictures, the band's middle 79 where its shirt over it is 119. So, dressed, its points' colours are off)
  if ((material as THREE.MeshStandardMaterial).vertexColors) {
    (material as THREE.MeshStandardMaterial).vertexColors = false;
    material.needsUpdate = true;
  }
  return texture;
}
