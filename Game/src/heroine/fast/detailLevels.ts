// ============================================================================
// detailLevels.ts -- DETAIL: drawing her with fewer triangles.
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts, `lodFor` inside
// `applyModelSettings`: "DETAIL" v0.29.3 and "SMART DETAIL" v0.33/v0.34).
//
// THE IDEA (Joshua's "smart LOD"). The model FILE is never changed. A detail
// level is only a LIGHTER TRIANGLE LIST over the very same points: at 25 % a
// quarter of her triangles are kept, each one bigger, and the points no
// triangle uses any more are simply left out of that level's copy. Because the
// points are the same ones, her skeleton, her shapes and her painted outfit
// (which is a picture laid over those points) all still fit.
//
// SMART DETAIL. The lightening is not even all over her. Every point has an
// IMPORTANCE: 1 on a back or a thigh, more on her face, her hands, her bust and
// her belly, most on her navel, so those keep more of their triangles for the
// same total. Her own body shapes say where those parts are (the points the
// 'breastGrow' shape moves ARE her bust). The lightening is also told where
// each point sits in her texture layout, so her outfit's picture is not
// dragged sideways.
//
// WHAT IS DIFFERENT HERE. The DEV Room worked a level out on the main thread
// when a setting changed (a pause nobody minds in a test room). In the game a
// level may be wanted in the middle of play, so the work is done in a web
// worker (detailWorker.ts) and the level is handed over when ready.
// ============================================================================
import * as THREE from 'three';
import { lighten, type DetailRequest, type DetailResult, type DetailSetup } from './detailWorker';

/**
 * The detail levels offered, percent of her triangles: the DEV Room's own list, with 30 and 15 added (Joshua,
 * 2026-11-17: Smart FPS turns her detail "from a max up to 30% details down to 1%"; Anthill Airways' own crowd
 * ladder starts at 30 and 15 too).
 */
export const DETAILS = [100, 50, 30, 25, 15, 10, 5, 3, 2, 1] as const;
export type Detail = (typeof DETAILS)[number];

/** The nearest offered level to any number (so `?detail=40` means 50). */
export function nearestDetail(value: number): Detail {
  let best: Detail = 100;
  for (const d of DETAILS) if (Math.abs(d - value) < Math.abs(best - value)) best = d;
  return best;
}

/** A named body shape's own numbers for every point (how far the shape moves each point), read from the file. */
export type ShapeMoves = (name: string) => THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;

/**
 * HOW IMPORTANT EACH POINT OF HER SKIN IS (the DEV Room's v0.34 rule, numbers unchanged).
 * `points` are her rest points, `box` their bounding box. Returns one number for each point, 1 or more.
 */
export function skinImportance(points: Float32Array, box: THREE.Box3, shape: ShapeMoves): Float32Array {
  const n = points.length / 3;
  const H = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  const ease = (k: number): number => { const u = Math.min(1, Math.max(0, k)); return u * u * (3 - 2 * u); };
  const weight = new Float32Array(n).fill(1);
  for (let v = 0; v < n; v++) {
    const xr = Math.abs(points[v * 3] - cx) / H, yr = (points[v * 3 + 1] - box.min.y) / H;
    const head = ease((yr - 0.84) / 0.04);                                                              // above her neck
    const hand = ease((xr - 0.125) / 0.015) * ease((0.57 - yr) / 0.02) * ease((yr - 0.38) / 0.02);     // out at her sides, below her wrists
    // (between her legs, where her thighs meet her hips: a tight fold that tears first when it is lightened)
    const groin = ease((0.075 - xr) / 0.02) * ease((yr - 0.43) / 0.02) * ease((0.53 - yr) / 0.02);
    weight[v] = 1 + 2 * Math.max(head, hand, groin);
  }
  // Her own shapes say where her belly, bust and navel are: full importance where a shape moves a point at least
  // `full` of the most it moves any point, fading smoothly to none.
  const mark = (names: readonly string[], extra: number, full: number): void => {
    for (const name of names) {
      const moves = shape(name);
      if (!moves) continue;
      let most = 0;
      const moved = new Float32Array(n);
      for (let v = 0; v < n; v++) { moved[v] = Math.hypot(moves.getX(v), moves.getY(v), moves.getZ(v)); if (moved[v] > most) most = moved[v]; }
      if (!(most > 0)) continue;
      for (let v = 0; v < n; v++) weight[v] = Math.max(weight[v], 1 + extra * ease(moved[v] / most / full));
    }
  };
  mark(['belly'], 1, 0.5);
  mark(['breastGrow'], 2, 0.3);
  mark(['navelIn', 'navelOut', 'navelFlat'], 5, 0.3);
  return weight;
}

/**
 * HER FACE, BUST AND BELLY KEPT SHARP (Joshua, 2026-11-19: "is it possible to exempt the belly, breast and head from the
 * details even when at 1%... at 1% her face and belly looks bad... a compromise of speed and quality"): the points of
 * her head above her neck, and those her belly, bust and navel shapes move by at least `share` of the most they move
 * any point. The lightening never takes these away (detailWorker.ts), at any level; the rest of her is lightened.
 * Settings -> HEROINE -> Sharp face, bust & belly turns it off.
 */
export function sharpParts(points: Float32Array, box: THREE.Box3, shape: ShapeMoves, share = 0.12): Uint8Array {
  const n = points.length / 3;
  const H = box.max.y - box.min.y;
  const lock = new Uint8Array(n);
  for (let v = 0; v < n; v++) if ((points[v * 3 + 1] - box.min.y) / H > 0.875) lock[v] = 1; // her head, above her neck
  for (const name of ['belly', 'breastGrow', 'navelIn', 'navelOut', 'navelFlat']) {
    const moves = shape(name);
    if (!moves) continue;
    let most = 0;
    for (let v = 0; v < n; v++) most = Math.max(most, Math.hypot(moves.getX(v), moves.getY(v), moves.getZ(v)));
    if (!(most > 0)) continue;
    for (let v = 0; v < n; v++) if (Math.hypot(moves.getX(v), moves.getY(v), moves.getZ(v)) >= share * most) lock[v] = 1;
  }
  return lock;
}

/** One mesh's lighter triangle lists: made when first asked for, kept, and never made twice. */
export class DetailLevels {
  private readonly ready = new Map<number, Uint32Array>();
  private readonly waiting = new Map<number, Promise<Uint32Array>>();
  /** Milliseconds each level took to work out (for the report and the debug readout). */
  readonly tookMs = new Map<number, number>();

  /**
   * @param maker   the shared worker (and its fallback) that does the lightening
   * @param mesh    this mesh's number with the maker
   * @param full    the mesh's own triangle list (100 %)
   */
  constructor(private readonly maker: DetailMaker, private readonly mesh: number, private readonly full: Uint32Array) {
    this.ready.set(100, full);
  }

  /** The list for a level if it has been made already, else null (and nothing is started). */
  peek(detail: number): Uint32Array | null { return this.ready.get(detail) ?? null; }

  /** The list for a level: at once if it is made, otherwise worked out in the background. */
  get(detail: number): Promise<Uint32Array> {
    const have = this.ready.get(detail);
    if (have) return Promise.resolve(have);
    let job = this.waiting.get(detail);
    if (!job) {
      const began = performance.now();
      job = this.maker.make(this.mesh, detail).then((index) => {
        this.ready.set(detail, index);
        this.waiting.delete(detail);
        this.tookMs.set(detail, performance.now() - began);
        return index;
      });
      this.waiting.set(detail, job);
    }
    return job;
  }
}

/**
 * The thing that does the lightening: a web worker where the browser gives one, the main thread where it does not
 * (the answer is the same; only who waits for it differs).
 */
export class DetailMaker {
  private worker: Worker | null = null;
  private nextTicket = 1;
  private readonly asked = new Map<number, { done: (index: Uint32Array) => void; fail: (error: Error) => void }>();
  /** What was sent to the worker, kept so the main thread can do the work itself if the worker dies. */
  private readonly bodies = new Map<number, { points: Float32Array; extras: Float32Array | null; extrasPerPoint: number; extraWeights: number[]; index: Uint32Array; lock: Uint8Array | null }>();
  /** True while levels are being made in a worker (false: on the main thread). */
  get inWorker(): boolean { return this.worker !== null; }

  constructor() {
    try {
      // (Vite turns this line into a separate small script file for the worker)
      this.worker = new Worker(new URL('./detailWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent) => {
        const result = event.data as DetailResult;
        const waiting = this.asked.get(result.ticket);
        if (!waiting) return;
        this.asked.delete(result.ticket);
        if (result.index) waiting.done(result.index); else waiting.fail(new Error(result.error ?? 'the detail worker gave no list'));
      };
      this.worker.onerror = () => {
        // The worker could not start or broke: everything still waiting is done on the main thread instead.
        console.warn('[heroine] the detail worker stopped; lighter detail levels will be made on the main thread');
        this.worker?.terminate();
        this.worker = null;
        const waiting = [...this.asked.values()];
        this.asked.clear();
        for (const w of waiting) w.fail(new Error('the detail worker stopped'));
      };
    } catch {
      this.worker = null;
    }
  }

  /**
   * Give the maker one mesh. `uv` (her texture layout) and `importance` are optional: her skin has both, her hair neither.
   * `box` is the mesh's bounding box in the points' own units.
   */
  setMesh(mesh: number, points: Float32Array, index: Uint32Array, box: THREE.Box3, uv: Float32Array | null, importance: Float32Array | null, lock: Uint8Array | null = null): void {
    const n = points.length / 3;
    let extras: Float32Array | null = null;
    let extraWeights: number[] = [];
    if (uv && importance) {
      // Five extra numbers a point (the DEV Room's own): where it sits on her skin's picture (2), and its place again
      // scaled by its extra importance (3). A mistake at an important point then counts several times over.
      const H = box.max.y - box.min.y;
      const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
      extras = new Float32Array(n * 5);
      for (let v = 0; v < n; v++) {
        extras[v * 5] = uv[v * 2];
        extras[v * 5 + 1] = uv[v * 2 + 1];
        const k = importance[v] - 1;
        extras[v * 5 + 2] = (points[v * 3] - cx) * k;
        extras[v * 5 + 3] = (points[v * 3 + 1] - cy) * k;
        extras[v * 5 + 4] = (points[v * 3 + 2] - cz) * k;
      }
      extraWeights = [H * 1.5, H * 1.5, 1, 1, 1];
    }
    const body = { points, extras, extrasPerPoint: 5, extraWeights, index, lock };
    this.bodies.set(mesh, body);
    // (the worker gets its own copies; the main thread keeps these for the fallback)
    this.worker?.postMessage({ kind: 'setup', mesh, points, extras, extrasPerPoint: 5, extraWeights, index, lock } satisfies DetailSetup);
  }

  /** Work out one level's triangle list. */
  make(mesh: number, detail: number): Promise<Uint32Array> {
    const onMainThread = (): Promise<Uint32Array> => {
      const body = this.bodies.get(mesh);
      return body ? lighten(body, detail) : Promise.reject(new Error('the detail maker was never given this mesh'));
    };
    if (!this.worker) return onMainThread();
    const worker = this.worker;
    return new Promise<Uint32Array>((done, fail) => {
      const ticket = this.nextTicket++;
      this.asked.set(ticket, { done, fail });
      worker.postMessage({ kind: 'level', mesh, detail, ticket } satisfies DetailRequest);
    }).catch(onMainThread);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.asked.clear();
    this.bodies.clear();
  }
}
