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
  /** Points never taken away (1) whatever the level: her face, bust and belly (detailLevels.ts `sharpParts`). */
  readonly lock: Uint8Array | null;
  /** PARTS KEPT AT THEIR OWN DETAIL (Joshua, 2026-11-21: John at 1 % with "only his face details to 30%"): each part's
   *  points (1) and the percent it is kept at. A level lighter than a part's percent lightens the rest of the body to
   *  the level and that part only to its own percent (`lighten`). Empty: one detail for the whole body, as before. */
  readonly parts: readonly KeptPart[];
}
/** One part of a body kept at its own detail: which points are in it (1), and its percent. */
export interface KeptPart { readonly points: Uint8Array; readonly detail: number }
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

export interface Kept { points: Float32Array; extras: Float32Array | null; extrasPerPoint: number; extraWeights: number[]; index: Uint32Array; lock: Uint8Array | null; parts: readonly KeptPart[] }
const kept = new Map<number, Kept>();

/** How many of a list's triangles have all three points in `inside` (1). */
function trianglesIn(index: Uint32Array, inside: Uint8Array): number {
  let count = 0;
  for (let t = 0; t < index.length; t += 3) if (inside[index[t]] && inside[index[t + 1]] && inside[index[t + 2]]) count++;
  return count;
}

/** One pass of the simplifier over `index`, toward `triangles` triangles, never taking away a point locked (1) in `lock`. */
function lightenOnce(body: Kept, index: Uint32Array, lock: Uint8Array | null, triangles: number): Uint32Array {
  // (a whole number of triangles: three numbers each)
  const target = Math.max(3, Math.floor(triangles) * 3);
  // The last number is how far the surface may move, as a share of her size: 1 lets the triangle count decide.
  // (LOCKED points are never taken away: her face, bust and belly stay as fine as at 100%, and the rest of her is
  //  lightened as far as it can go toward the count; so a light level has more triangles than its percent says)
  const [lighter] = body.extras
    ? MeshoptSimplifier.simplifyWithAttributes(index, body.points, 3, body.extras, body.extrasPerPoint, body.extraWeights, lock, target, 1)
    : MeshoptSimplifier.simplify(index, body.points, 3, target, 1);
  return lighter;
}

/** The lightening itself. Shared with the main thread, which uses it directly where a worker cannot be started. */
export async function lighten(body: Kept, detail: number): Promise<Uint32Array> {
  await MeshoptSimplifier.ready;
  // (the parts kept FINER than this level; a part at or under it is simply lightened with the rest)
  const parts = body.extras ? body.parts.filter((p) => p.detail > detail) : [];
  if (parts.length === 0) return lightenOnce(body, body.index, body.lock, (body.index.length / 3) * detail / 100);

  // PARTS AT THEIR OWN DETAIL, in passes (the simplifier itself only knows "locked", kept at 100 %, or "free"):
  // 1. every part held still, the rest of the body lightened to the level;
  const n = body.points.length / 3;
  const anyPart = new Uint8Array(n);
  for (const p of parts) for (let v = 0; v < n; v++) if (p.points[v]) anyPart[v] = 1;
  const held = new Uint8Array(n);
  for (let v = 0; v < n; v++) held[v] = anyPart[v] || (body.lock ? body.lock[v] : 0);
  const inParts = trianglesIn(body.index, anyPart);
  let index = lightenOnce(body, body.index, held, (body.index.length / 3 - inParts) * detail / 100 + inParts);
  // 2. then each part in turn, everything else held still, lightened to its own percent (its triangles as they were at
  //    100 %, the first pass held them all). A point in the body's own lock stays held throughout.
  for (const p of parts) {
    if (p.detail >= 100) continue;   // (a part at 100 % is kept as the first pass left it: whole)
    const others = new Uint8Array(n);
    for (let v = 0; v < n; v++) others[v] = p.points[v] ? (body.lock ? body.lock[v] : 0) : 1;
    const inside = trianglesIn(index, p.points);
    index = lightenOnce(body, index, others, index.length / 3 - inside + inside * p.detail / 100);
  }
  return index;
}

// Only when this file is running AS a worker (the main thread also imports it, for `lighten`).
const scope = self as unknown as { document?: unknown; onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };
if (typeof scope.document === 'undefined') {
  scope.onmessage = (event: MessageEvent): void => {
    const message = event.data as DetailSetup | DetailRequest;
    if (message.kind === 'setup') {
      kept.set(message.mesh, { points: message.points, extras: message.extras, extrasPerPoint: message.extrasPerPoint, extraWeights: [...message.extraWeights], index: message.index, lock: message.lock, parts: message.parts ?? [] });
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
