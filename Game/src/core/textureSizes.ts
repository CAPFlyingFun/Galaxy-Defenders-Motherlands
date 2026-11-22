// =====================================================================================================================
// TEXTURE SIZES: how big the game's pictures may be on the graphics chip, in two settings (v0.2.148).
//
// Joshua, 2026-11-22, after TRADDOMIUM's ladder (its assets/textureQuality.ts: "texture size is GPU MEMORY and is a
// cliff: the tab is killed, not slowed"; its detail is a separate setting): "I would have 256/512/1024/2048 with 512
// the starting default for mobile for everything except for the playable characters which for mobile, lower to
// 1024"; "leave all characters first or third person at 1024 for default but can modify for settings"; "computers can
// up past the 2K limit to 4K"; "Keep skin depth the same as the texture"; hair "1024 to match/sync with character's
// texture size"; the sky, the coast mask and the shadow map as he confirmed them (below and in main.ts).
//
// TWO SETTINGS, each the LARGEST SIDE a picture may have on the chip:
//   CHARACTER  her (and John's) baked outfit pictures (colour, skin depth, normal, surface), their pieces' pictures
//              and their hair. Phone 1024, computer 4096 (as they were baked).
//   WORLD      the island's ground, river, tree and bark pictures, the water's ripples, her suit's fabric tiles and the
//              skin's pore tile. Phone 512, computer 2048 (as they were made).
// Each step is a quarter of the memory of the one above (a picture's memory goes with the square of its side).
// 4096 is offered on a computer only (TRADDOMIUM's rule: a setting that would close a phone's game is not a choice).
// Not here, fixed as Joshua confirmed: the sky (2048 x 1024, world/island/skyPicture.ts) and the coast mask (2048,
// one channel, world/island/ocean.ts). The shadow map follows WORLD in main.ts (1024 at 256 and 512, else 2048).
//
// HOW A PICTURE IS MADE SMALLER: a picture file is decoded straight to its new size (createImageBitmap's resize: the
// full-size copy is never kept), and a PACKED picture (her .ktx2 files) already holds every smaller size inside: its
// top levels are simply not sent (heroine/fast/packedPictures.ts). A setting changed while playing re-makes every
// picture of that kind, one at a time, from its file (the phone's offline copy, so nothing new is downloaded).
// =====================================================================================================================
import * as THREE from 'three';

export type TextureKind = 'character' | 'world';
/** The sizes on offer, largest side in pixels. */
export const TEXTURE_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type TextureSize = (typeof TEXTURE_SIZES)[number];
/** The largest a phone is offered. */
export const PHONE_LARGEST: TextureSize = 2048;

/** A phone (or tablet): a touch screen as the main pointer, the same test the rest of the game uses for "phone". */
export function onPhone(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

/** The sizes this device is offered (a phone: up to 2048). */
export function textureSizesOffered(): readonly TextureSize[] {
  return onPhone() ? TEXTURE_SIZES.filter((s) => s <= PHONE_LARGEST) : TEXTURE_SIZES;
}

/** Where the settings start (Joshua's numbers): phone characters 1024, world 512; a computer as the pictures were made. */
export function textureDefaults(): { character: TextureSize; world: TextureSize } {
  return onPhone() ? { character: 1024, world: 512 } : { character: 4096, world: 2048 };
}

/** A saved or typed size, if it is one of the sizes offered here (a phone never takes 4096, whatever was saved). */
export function asTextureSize(text: string | null): TextureSize | null {
  const n = Number(text);
  return (textureSizesOffered() as readonly number[]).includes(n) ? (n as TextureSize) : null;
}

// ---- The sizes in force, and every picture made to them ------------------------------------------------------------

const caps: Record<TextureKind, number> = { character: textureDefaults().character, world: textureDefaults().world };

/** The largest side a picture of this kind may have now. */
export function textureCap(kind: TextureKind): number { return caps[kind]; }

/** How to make one picture again at a new size (from its file), and what it is. */
interface Sized { kind: TextureKind; remake: (cap: number) => Promise<void>; remaking: boolean }
const sized = new Map<THREE.Texture, Sized>();

/**
 * Keep `texture` to its kind's size from now on: when the setting changes, `remake` is called with the new largest
 * side and must put the picture back at that size (the texture object stays the same one, so every material keeps
 * it). Forgotten when its owner disposes of it.
 */
export function keepSized(texture: THREE.Texture, kind: TextureKind, remake: (cap: number) => Promise<void>): void {
  const entry: Sized = { kind, remake, remaking: false };
  sized.set(texture, entry);
  // (a texture its owner lets go of is forgotten; the dispose a remake does itself is not that)
  const forget = (): void => { if (!entry.remaking) { sized.delete(texture); texture.removeEventListener('dispose', forget); } };
  texture.addEventListener('dispose', forget);
}

/**
 * The settings changed (or the game starts): from now on pictures are made to these sizes, and every picture already
 * made of a kind whose size changed is made again, ONE AT A TIME (never two big pictures being decoded at once).
 */
export async function setTextureCaps(next: { character: number; world: number }): Promise<void> {
  const changed = (Object.keys(caps) as TextureKind[]).filter((k) => caps[k] !== next[k]);
  caps.character = next.character;
  caps.world = next.world;
  if (changed.length === 0) return;
  const began = performance.now();
  let made = 0;
  for (const [texture, entry] of [...sized]) {
    if (!changed.includes(entry.kind) || !sized.has(texture)) continue;
    entry.remaking = true;
    try { await entry.remake(caps[entry.kind]); made++; } catch (error) { console.warn('[textures] a picture could not be made at its new size', error); } finally { entry.remaking = false; }
  }
  console.info(`[textures] characters ${caps.character}, world ${caps.world}: ${made} pictures made again in ${((performance.now() - began) / 1000).toFixed(1)} s`);
}

/** How many pictures are kept to a size now, of each kind (the full readout, test pages). */
export function sizedCount(): Record<TextureKind, number> {
  const count: Record<TextureKind, number> = { character: 0, world: 0 };
  for (const entry of sized.values()) count[entry.kind]++;
  return count;
}

/** The size a picture of `width` x `height` is drawn at under `cap`: its largest side no more than `cap`, its shape kept. */
export function fitTo(width: number, height: number, cap: number): { width: number; height: number } {
  const scale = Math.min(1, cap / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Decode a picture file to no more than `cap` on its largest side, rows the right way up for a texture. Read as the
 * game's TextureLoader pictures were: their own colours (`colourSpace` false: numbers, as a normal or height map)
 * and never with see-through edges darkened (premultiplyAlpha 'none'). The full-size picture is decoded only for the
 * moment it takes to shrink it. If this browser ignores the asked-for size, the picture is simply kept at its own.
 */
export async function decodeSized(blob: Blob, cap: number, options: { flipY: boolean; colour: boolean }): Promise<ImageBitmap> {
  const read: ImageBitmapOptions = {
    imageOrientation: options.flipY ? 'flipY' : 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: options.colour ? 'default' : 'none',
  };
  const full = await createImageBitmap(blob, read);
  const size = fitTo(full.width, full.height, cap);
  if (size.width === full.width && size.height === full.height) return full;
  try {
    // (from the decoded picture: its rows are already the right way round, so not turned again)
    const small = await createImageBitmap(full, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
    full.close();
    return small;
  } catch {
    return full;   // (a browser that cannot resize here: the picture at its own size, as before)
  }
}

/**
 * A PICTURE FILE AS A TEXTURE, no bigger than its kind's setting and kept so (the setting can change while playing).
 * Returned at once (empty until its picture arrives, as three.js's TextureLoader.load does); `setup` gives it its
 * wrapping, filtering and colour space BEFORE anything is decoded (colour: `texture.colorSpace` other than
 * NoColorSpace). `flipY` as three.js's loaders do by default (true): the picture's first row at the top.
 * `onLoad` is called each time its picture is (re)made.
 */
export function sizedPicture(url: string, kind: TextureKind, setup?: (texture: THREE.Texture) => void, options: { flipY?: boolean; onLoad?: (texture: THREE.Texture) => void } = {}): THREE.Texture {
  const { texture, first } = makeSized(url, kind, setup, options);
  void first.catch((error: unknown) => console.warn(`[textures] ${url} could not be loaded`, error));
  return texture;
}

/** `sizedPicture`, waited for: resolves once its picture has arrived (rejects if it never does, as loadAsync would). */
export async function sizedPictureAsync(url: string, kind: TextureKind, setup?: (texture: THREE.Texture) => void, options: { flipY?: boolean } = {}): Promise<THREE.Texture> {
  const { texture, first } = makeSized(url, kind, setup, options);
  try { await first; } catch (error) { texture.dispose(); throw error; }
  return texture;
}

/** The texture, and its first making (from its file, at the size in force now). */
function makeSized(url: string, kind: TextureKind, setup: ((texture: THREE.Texture) => void) | undefined, options: { flipY?: boolean; onLoad?: (texture: THREE.Texture) => void }): { texture: THREE.Texture; first: Promise<void> } {
  const texture = new THREE.Texture();
  setup?.(texture);
  const flipY = options.flipY ?? true;
  // (an ImageBitmap is turned as it is decoded, so three.js must not turn it again)
  texture.flipY = false;
  const make = async (cap: number): Promise<void> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} did not load (${response.status})`);
    const picture = await decodeSized(await response.blob(), cap, { flipY, colour: texture.colorSpace !== THREE.NoColorSpace });
    const before = texture.image as ImageBitmap | undefined;
    // (a new size needs a new texture on the chip: the old one is let go first; the texture object stays the same)
    if (before) texture.dispose();
    texture.image = picture;
    texture.needsUpdate = true;
    if (before && typeof before.close === 'function') before.close();
    options.onLoad?.(texture);
  };
  keepSized(texture, kind, make);
  return { texture, first: make(textureCap(kind)) };
}
