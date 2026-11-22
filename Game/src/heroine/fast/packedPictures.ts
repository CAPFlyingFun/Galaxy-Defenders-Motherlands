// ============================================================================
// packedPictures.ts -- HER BIG PICTURES KEPT PACKED ON THE GRAPHICS CHIP (KTX2, Basis UASTC).
//
// Joshua, 2026-11-21: "Do the compression of the textures first, as long as it looks the same." A WebP picture is
// small to download but the phone unpacks it to 4 bytes a pixel: her 4096 x 4096 colour picture is 89 MB on the
// graphics chip (with its smaller copies), and the decoded copy the page keeps is 64 MB more. Each look's four big
// pictures (colour, skin height, normal, shine) were about 206 MB on the chip a character, and they all went up in the
// first frame, near the end of loading, which is where his iPhone kept closing the game.
//
// Packed (scripts/make_ktx2.py), each is a KTX2 file in Basis Universal's UASTC form. Here it is turned, in a worker,
// into the packed form THIS device's chip reads directly: ASTC 4x4 on an iPhone, BC7 on most computers (or plain
// pixels where neither exists). 1 byte a pixel: a quarter of the memory, about 51 MB a character. UASTC turns into
// ASTC with no further loss, and it is near-lossless to begin with (make_ktx2.py checks every picture: Blaze's come
// back at 49-66 dB; about 40 is where a difference starts to be seen).
//
// Its smaller copies (mipmaps) come in the file, so nothing is worked out on the phone. One worker at a time, and it
// is let go 2 s after the last picture (its memory with it); the next look starts another.
// `?packed=off` loads the WebP pictures as before (to compare on the phone).
//
// NEVER STUCK (2026-11-21): a packed picture that fails, or is not ready in `PACKED_WAIT_S`, is given up on and the
// look's WebP picture is loaded instead (bakedLook.ts, skinTexture.ts): she is never left a stand-in for want of one
// picture. (On the development server the loader looked for its transcoder in the wrong folder and waited for ever, no
// error at all: there it is now told where three keeps it.)
// ============================================================================
import * as THREE from 'three';
import { keepSized, textureCap, type TextureKind } from '../../core/textureSizes';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Whether packed pictures are used: always, unless the page was opened with `?packed=off`. */
export const packedPicturesOn = (): boolean => {
  try { return new URLSearchParams(location.search).get('packed') !== 'off'; } catch { return true; }
};

/** Seconds the transcoder's worker is kept after the last picture, before it is let go. */
const KEEP_WORKER_S = 2;
/** Seconds a packed picture may take before it is given up on (and its WebP picture loaded instead). */
export const PACKED_WAIT_S = 45;

let loader: KTX2Loader | null = null;
let busy = 0;
let letGoTimer = 0;

/** The loader (made once, for this renderer: it asks the chip which packed forms it reads). */
function loaderFor(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (letGoTimer) { window.clearTimeout(letGoTimer); letGoTimer = 0; }
  // (one worker: pictures are turned one after another, so only one picture's working memory is ever held)
  if (!loader) {
    loader = new KTX2Loader().setWorkerLimit(1);
    // (the built game finds the transcoder by itself, in assets/; the development server moves three's loader and its
    //  own way to the transcoder breaks, so it is told the folder three keeps it in)
    if (import.meta.env.DEV) loader.setTranscoderPath(`${import.meta.env.BASE_URL}node_modules/three/examples/jsm/libs/basis/`);
    loader.detectSupport(renderer);
  }
  return loader;
}

/** Done with it for now: the worker is let go a little after the last picture. */
function doneWith(): void {
  busy = Math.max(0, busy - 1);
  if (busy > 0 || letGoTimer) return;
  letGoTimer = window.setTimeout(() => {
    letGoTimer = 0;
    if (busy === 0 && loader) { loader.dispose(); loader = null; }
  }, KEEP_WORKER_S * 1000);
}

/**
 * Turn a packed picture's bytes (a .ktx2 file) into a texture this device's graphics chip keeps packed, set up as the
 * game's other pictures are: rows as the bake wrote them (never flipped), repeating, smooth between its copies.
 * @param colour  true for colours (her albedo: read as sRGB), false for numbers (heights, normals, shine)
 */
/** What a packed picture's levels hold in the page once they are on the graphics chip (`packedTexture`). */
const NOTHING = new Uint8Array(0);

export async function packedTexture(bytes: ArrayBuffer, colour: boolean, renderer: THREE.WebGLRenderer, cap = Infinity): Promise<THREE.CompressedTexture> {
  const texture = await unpack(bytes, colour, renderer, cap);
  upload(texture, renderer);
  return texture;
}

/**
 * A PACKED PICTURE AT ITS KIND'S SIZE (v0.2.148, core/textureSizes.ts): fetched, unpacked no bigger than the setting
 * for `kind` (its larger levels are in the file, and simply not sent), up on the graphics chip, and kept so: when the
 * setting changes it is unpacked again from its file at the new size, into the SAME texture (so every material keeps
 * it). `fetched` is told the bytes each time the file is read.
 */
export async function loadPackedSized(url: string, colour: boolean, renderer: THREE.WebGLRenderer, kind: TextureKind, fetched?: (bytes: number) => void): Promise<THREE.CompressedTexture> {
  const read = async (): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} did not load (${response.status})`);
    const bytes = await response.arrayBuffer();
    fetched?.(bytes.byteLength);
    return bytes;
  };
  const texture = await packedTexture(await read(), colour, renderer, textureCap(kind));
  keepSized(texture, kind, async (cap) => {
    const fresh = await unpack(await read(), colour, renderer, cap);
    // (the same texture, its new levels: what was on the chip is let go first)
    texture.dispose();
    texture.mipmaps = fresh.mipmaps;
    texture.image = fresh.image;
    texture.format = fresh.format;
    texture.minFilter = fresh.minFilter;
    upload(texture, renderer);
  });
  return texture;
}

/** Unpack a .ktx2 file into a texture set up as the game's pictures are, no level larger than `cap` (not yet sent). */
async function unpack(bytes: ArrayBuffer, colour: boolean, renderer: THREE.WebGLRenderer, cap: number): Promise<THREE.CompressedTexture> {
  const l = loaderFor(renderer);
  busy++;
  try {
    const texture = await new Promise<THREE.CompressedTexture>((done, failed) => {
      // (given up on after PACKED_WAIT_S: the caller loads the WebP picture instead)
      const late = window.setTimeout(() => failed(new Error(`a packed picture took over ${PACKED_WAIT_S} s`)), PACKED_WAIT_S * 1000);
      l.parse(bytes, (t) => { window.clearTimeout(late); done(t as THREE.CompressedTexture); },
        (e) => { window.clearTimeout(late); failed(e instanceof Error ? e : new Error(String(e))); });
    });
    // NO LARGER THAN THE SETTING (v0.2.148, core/textureSizes.ts): the file holds the picture and each of its smaller
    // copies (its mipmaps); the copies larger than `cap` are left out, and the first one kept is the picture.
    // A quarter of the memory for every step down; nothing new to download.
    const levels = texture.mipmaps ?? [];
    let skip = 0;
    while (skip < levels.length - 1 && Math.max(levels[skip].width, levels[skip].height) > cap) skip++;
    if (skip > 0) {
      texture.mipmaps = levels.slice(skip);
      texture.image = { width: levels[skip].width, height: levels[skip].height } as typeof texture.image;
    }
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = false;   // (a packed picture cannot be flipped as it goes up: it is stored the way round the bake wrote it)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = texture.mipmaps && texture.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.generateMipmaps = false;   // (its smaller copies are in the file)
    // (as sharp at a slant as her other pictures: outfitMaterial.ts and skinTexture.ts ask for the same; set before it
    //  goes up, as a texture's settings are only read as it goes up)
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  } finally {
    doneWith();
  }
}

/**
 * UP TO THE GRAPHICS CHIP NOW, AND THE PAGE'S OWN COPY LET GO (v0.2.144; Joshua, 2026-11-22: the start log showed his
 * iPhone closing the game right after its FIRST FRAME of play, ~311 MB of graphics asked for). three.js keeps every
 * texture's data in the page after sending it to the chip, so each packed picture was held twice: on the chip AND in
 * the page's memory (about 49 MB a character: albedo and skin height 21 MB each, normal 5, surface 1), and all of them
 * went up together in the first frames. Now each goes up the moment it is unpacked, while she loads, and the page's
 * copy is dropped at once: the chip's is the only one. (A new texture size unpacks it again from its file:
 * `loadPackedSized`. If the phone ever loses its graphics, glTrouble.ts says so and a restart brings them back.)
 */
function upload(texture: THREE.CompressedTexture, renderer: THREE.WebGLRenderer): void {
  texture.needsUpdate = true;
  renderer.initTexture(texture);
  for (const level of texture.mipmaps ?? []) (level as { data: ArrayBufferView }).data = NOTHING;
}
