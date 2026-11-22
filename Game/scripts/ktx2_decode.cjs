// ============================================================================
// ktx2_decode.cjs -- unpack a KTX2 picture's full-size level back to raw RGBA, with three.js's own Basis transcoder
// (the one the game uses on the phone), so make_ktx2.py can check the packed picture looks the same as its original.
// (UASTC is turned into the iPhone's ASTC without any further loss: what this unpacks is what the phone shows.)
// Usage: node scripts/ktx2_decode.cjs <in.ktx2> <out.rgba>
// ============================================================================
const fs = require('fs');
const path = require('path');
const lib = path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis') + path.sep;
// (the transcoder is written for a page or a worker; given Node's own `require` and folder it runs here too)
const BASIS = new Function('require', '__dirname', fs.readFileSync(lib + 'basis_transcoder.js', 'utf8') + '\nreturn BASIS;')(require, lib);
(async () => {
  const basis = await BASIS({ wasmBinary: fs.readFileSync(lib + 'basis_transcoder.wasm') });
  basis.initializeBasis();
  const [, , input, output] = process.argv;
  const file = new basis.KTX2File(new Uint8Array(fs.readFileSync(input)));
  if (!file.isValid() || !file.startTranscoding()) throw new Error(`${input} is not a KTX2 file the transcoder reads`);
  const RGBA32 = 13;   // (the transcoder's plain 4-bytes-a-pixel form)
  const out = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
  if (!file.transcodeImage(out, 0, 0, 0, RGBA32, 0, -1, -1)) throw new Error(`${input} did not unpack`);
  fs.writeFileSync(output, out);
  console.log(`${input}: ${file.getWidth()} x ${file.getHeight()}, ${file.getLevels()} levels`);
  file.close();
  file.delete();
})();
