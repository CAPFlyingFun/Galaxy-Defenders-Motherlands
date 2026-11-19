// ============================================================================
// tileWorker.ts -- reads one island height tile OFF the game's main thread.
//
// Turning a 513 x 513 picture into heights takes about a tenth of a second on
// a phone: done in the game's own thread, she would freeze for a moment every
// time she walked onto a new tile. Here it is done by a "worker" (a helper the
// browser runs alongside the game), and only the finished list of heights is
// handed back. (From Beyond Extinction's kauaiTile.worker.ts.)
//
// The game sends { id, url, P }; the worker answers { id, heights } (a
// Float32Array of P x P metres, rows north to south) or { id, error }.
// KEEP IN STEP with decodeElevation() in terrainSampling.ts (the same sum).
// ============================================================================
interface TileAsk {
  id: number;
  url: string;
  P: number;
}

self.onmessage = async (event: MessageEvent<TileAsk>) => {
  const { id, url, P } = event.data;
  try {
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    const picture = await createImageBitmap(await answer.blob());
    const canvas = new OffscreenCanvas(P, P);
    const pen = canvas.getContext('2d', { willReadFrequently: true });
    if (!pen) throw new Error('no 2d drawing in the worker');
    pen.drawImage(picture, 0, 0, P, P);
    picture.close();
    const colours = pen.getImageData(0, 0, P, P).data;
    const heights = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) {
      const j = i * 4;
      const e = colours[j] * 256 + colours[j + 1] + colours[j + 2] / 256 - 32768;
      heights[i] = e < -6000 ? -6000 : e;
    }
    // (the heights' memory is handed over, not copied)
    (self as unknown as Worker).postMessage({ id, heights }, [heights.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String((error as Error)?.message ?? error) });
  }
};
