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
// ============================================================================
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Whether packed pictures are used: always, unless the page was opened with `?packed=off`. */
export const packedPicturesOn = (): boolean => {
  try { return new URLSearchParams(location.search).get('packed') !== 'off'; } catch { return true; }
};

/** Seconds the transcoder's worker is kept after the last picture, before it is let go. */
const KEEP_WORKER_S = 2;

let loader: KTX2Loader | null = null;
let busy = 0;
let letGoTimer = 0;

/** The loader (made once, for this renderer: it asks the chip which packed forms it reads). */
function loaderFor(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (letGoTimer) { window.clearTimeout(letGoTimer); letGoTimer = 0; }
  // (one worker: pictures are turned one after another, so only one picture's working memory is ever held)
  if (!loader) loader = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
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
export async function packedTexture(bytes: ArrayBuffer, colour: boolean, renderer: THREE.WebGLRenderer): Promise<THREE.CompressedTexture> {
  const l = loaderFor(renderer);
  busy++;
  try {
    const texture = await new Promise<THREE.CompressedTexture>((done, failed) => {
      l.parse(bytes, (t) => done(t as THREE.CompressedTexture), (e) => failed(e instanceof Error ? e : new Error(String(e))));
    });
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = false;   // (a packed picture cannot be flipped as it goes up: it is stored the way round the bake wrote it)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = texture.mipmaps && texture.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.generateMipmaps = false;   // (its smaller copies are in the file)
    texture.needsUpdate = true;
    return texture;
  } finally {
    doneWith();
  }
}
