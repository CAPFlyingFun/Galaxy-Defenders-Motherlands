// ============================================================================
// ktx2_encode.mjs -- pack ONE picture into a KTX2 file the graphics chip keeps PACKED (called by make_ktx2.py).
//
// Joshua, 2026-11-21: "Do the compression of the textures first, as long as it looks the same." A plain picture
// (WebP, PNG) is small to download but is unpacked to 4 bytes a pixel on the graphics chip: one 4096 x 4096 picture
// with its smaller copies is 89 MB there. A KTX2 file in Basis Universal's UASTC form is turned, on the phone, into the
// chip's own packed form (ASTC on the iPhone, BC7 on a computer): 1 byte a pixel, 22 MB, read straight from its packed
// form by the chip, every frame.
//
// UASTC (not the smaller ETC1S) because it is near-lossless: Blaze's colour picture comes back at 53.7 dB PSNR (from
// about 40 dB a difference cannot be seen; her average pixel is off by 0.16 of 255). No RDO (it shrank the file only
// 9% for some loss of quality and three times the time). Zstandard on top for the download. Its smaller copies
// (mipmaps) are made here, so the phone has nothing to work out.
//
// Usage: node scripts/ktx2_encode.mjs <raw RGBA file> <width> <height> <out.ktx2> <colour 1|0> <normal map 1|0>
//   colour 1: the picture holds colours (her albedo): read as sRGB; 0: numbers (heights, normals, roughness)
//
// (ktx2-encoder is pinned at 0.5.4: its newer build refuses pictures over 12 megapixels, and hers are 16.7.)
// ============================================================================
import { encodeToKTX2 } from 'ktx2-encoder';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, width, height, output, colour, normalMap] = process.argv;
if (!input || !width || !height || !output) {
  console.error('usage: node scripts/ktx2_encode.mjs <raw RGBA> <width> <height> <out.ktx2> <colour 1|0> <normal map 1|0>');
  process.exit(2);
}
const pixels = readFileSync(input);
const started = Date.now();
const packed = await encodeToKTX2(new Uint8Array(1), {
  isUASTC: true,               // near-lossless (see above)
  uastcLDRQualityLevel: 2,     // the encoder's default balance of quality and time
  generateMipmap: true,        // its smaller copies, made here
  needSupercompression: true,  // Zstandard, for the download
  isPerceptual: colour === '1',
  isSetKTX2SRGBTransferFunc: colour === '1',
  isNormalMap: normalMap === '1',
  // (the pixels come already unpacked, by make_ktx2.py: 4 bytes each, R G B A, the top row first, as in the picture)
  imageDecoder: async () => ({ data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), width: Number(width), height: Number(height) }),
});
writeFileSync(output, packed);
console.log(`  ${output}: ${(packed.byteLength / 1048576).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
