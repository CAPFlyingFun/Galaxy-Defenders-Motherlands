// ============================================================================
// detailWorker.ts -- works out her lighter triangle lists OFF the main thread.
//
// A "web worker" is a second script the browser runs beside the page. Making a
// lighter triangle list for a 200,000-triangle body takes a noticeable fraction
// of a second; done here, the game goes on drawing smoothly meanwhile and is
// simply handed the list when it is ready (detailLevels.ts asks and listens).
//
// The lightening itself is the "meshoptimizer" library's simplifier, used the
// way Anthill Airways' DEV Room uses it (see detailLevels.ts for what it is told).
// ============================================================================
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

/** "Here is the body": sent once. The arrays are copies, kept by the worker for every later level. */
export interface DetailSetup {
  readonly kind: 'setup';
  /** A number for each of her meshes the worker is given (0 her skin, 1 her hair...). */
  readonly mesh: number;
  /** x, y, z for each point. */
  readonly points: Float32Array;
  /** Extra numbers for each point that the lightening must also keep in place (her texture layout, her important parts). */
  readonly extras: Float32Array | null;
  readonly extrasPerPoint: number;
  /** How much a mistake in each extra counts. */
  readonly extraWeights: readonly number[];
  /** Her full triangle list. */
  readonly index: Uint32Array;
}
/** "Make this level": answered with a `DetailResult`. */
export interface DetailRequest {
  readonly kind: 'level';
  readonly mesh: number;
  /** How many of her triangles to keep, in percent. */
  readonly detail: number;
  /** Sent back with the answer, so the asker knows which question it belongs to. */
  readonly ticket: number;
}
export interface DetailResult {
  readonly ticket: number;
  /** The lighter triangle list (over the SAME points), or null if it could not be made. */
  readonly index: Uint32Array | null;
  readonly error?: string;
  /** How long the lightening took in the worker, milliseconds. */
  readonly ms: number;
}

interface Kept { points: Float32Array; extras: Float32Array | null; extrasPerPoint: number; extraWeights: number[]; index: Uint32Array }
const kept = new Map<number, Kept>();

/** The lightening itself. Shared with the main thread, which uses it directly where a worker cannot be started. */
export async function lighten(body: Kept, detail: number): Promise<Uint32Array> {
  await MeshoptSimplifier.ready;
  // (a whole number of triangles: three numbers each)
  const target = Math.max(3, Math.floor((body.index.length * detail) / 100 / 3) * 3);
  // The last number is how far the surface may move, as a share of her size: 1 lets the triangle count decide.
  const [lighter] = body.extras
    ? MeshoptSimplifier.simplifyWithAttributes(body.index, body.points, 3, body.extras, body.extrasPerPoint, body.extraWeights, null, target, 1)
    : MeshoptSimplifier.simplify(body.index, body.points, 3, target, 1);
  return lighter;
}

// Only when this file is running AS a worker (the main thread also imports it, for `lighten`).
const scope = self as unknown as { document?: unknown; onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };
if (typeof scope.document === 'undefined') {
  scope.onmessage = (event: MessageEvent): void => {
    const message = event.data as DetailSetup | DetailRequest;
    if (message.kind === 'setup') {
      kept.set(message.mesh, { points: message.points, extras: message.extras, extrasPerPoint: message.extrasPerPoint, extraWeights: [...message.extraWeights], index: message.index });
      return;
    }
    const began = performance.now();
    const body = kept.get(message.mesh);
    if (!body) { scope.postMessage({ ticket: message.ticket, index: null, error: 'the body was never sent', ms: 0 } satisfies DetailResult); return; }
    lighten(body, message.detail).then(
      (index) => scope.postMessage({ ticket: message.ticket, index, ms: performance.now() - began } satisfies DetailResult, [index.buffer as ArrayBuffer]),
      (error: unknown) => scope.postMessage({ ticket: message.ticket, index: null, error: String(error), ms: performance.now() - began } satisfies DetailResult),
    );
  };
}
