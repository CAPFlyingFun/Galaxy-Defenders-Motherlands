// ============================================================================
// liveBody.ts -- THE LIVE BODY: everything of her that is not her skin, kept
// and run, but never drawn.
//
// Joshua, 2026-11-17: "live body means everything still is there like the
// skeleton, baby, organs, but hidden visually and not drawn" and "I'd still
// have everything enabled but only the skin drawn, the baby, womb, organs,
// skeleton, and everything else there but not drawn. If it runs fine at max in
// the CCBS, having a lower details in the game should be fine. That's what I
// want to test."
//
// HOW. The Character Builder's own room IS "everything enabled": her baby and
// womb, her organs, her heart and lungs, her gut, her springs, all of it the
// builder's own code. So the room is opened out of sight (the same way the
// Visual body opens it: builderRoom.ts) and STEPPED every frame, but nothing
// of it is ever drawn. The fast heroine's skin is the only thing on screen.
//
// WHAT COMES BACK OUT OF IT. The room works out what her baby does to her
// skin and hands it to its own skin's shader as a few numbers. Those same
// numbers are read here each frame and shown on the fast heroine's skin:
//   - A KICK: where on her belly (rest metres), which way, how far out and
//     how wide (the builder's softBody.ts: up to three at once)
// The baby that kicks is never drawn: a kick is only a place and a push.
//
// IT OPENS BARE (Joshua, 2026-11-19: "if you saved the body as the lite
// version, it keeps the heavy version out so it doesn't load both"): the
// hidden copy is never drawn, so it gets none of what is only for looking at:
// no clothes, no fabrics, no hair, her light skin. What the kicks need -- her
// body, her baby and the springs -- is all still there. (Opened fully dressed,
// it held a second outfit's paint and fabrics and a second head of hair in the
// phone's memory, for nothing; on an iPhone that is enough for Safari to throw
// the game away and start it again.)
//
// SHE STANDS STILL IN THERE. The hidden copy is never told she walks. What
// made the Visual body stutter each time she started walking was the room
// laying its hidden parts again for the new pose; standing, it never does.
// Her real walking is the fast body's own.
//
// WHAT IT COSTS is not known until it runs on a phone (that is the test). The
// time each step takes is measured and shown in the debug readout
// ("live body: x ms"), so the cost can be read off the screen.
// ============================================================================
import * as THREE from 'three';
import { KICKS } from '@charb/sarahlab/softBody';
import { HAIR_STYLE_NONE } from '@charb/sarahlab/hairStyles';
import { openBuilderRoom, type BuilderRoom } from '../builderRoom';
import { findPaintedSkin } from '../paintMask';
import type { HeroineLook } from '../heroineLook';
import { SARAH_LAB_ACTION, SARAH_LAB_FIELD } from '@charb/sarahlab/sarahLabTool';
import { readPregnancy } from '@charb/sarahlab/pregnancy';
import { navelOffsetOf } from '@charb/sarahlab/navelSoft';

/**
 * WHEN THE HIDDEN BODY'S BELLY FOLLOWS HERS (Joshua, 2026-11-19: v0.2.70 passed on every whole percent at once, and
 * dragging the belly slider closed the game on his iPhone: each change has the builder refit her womb and baby, many
 * times a second while the slider moves). Now: once her belly has stayed put this long (seconds)...
 */
const LIVE_BELLY_SETTLE = 0.35;
/** ...or, while it keeps changing (the time lapse), at most this often: a few percent at a time late in the lapse. */
const LIVE_BELLY_EVERY = 1;
/**
 * HER SHAPE, AS THE BUILDER WEIGHS IT (Joshua, 2026-11-19: the time lapse made "a pointy belly... it needs to basically
 * rebake the look every second at the new size"; "you can see how CCBS does it as the belly slider updates in real
 * time"). The builder shapes her belly by its body shapes, each at a weight its own rules work out for her size (more
 * of them, and finer, than the few the drawn body worked out by itself). This long after the hidden body's belly (or
 * pregnancy) changed, those weights are read off its skin, so the drawn body can take the same ones
 * (shapedBody.ts `setBuilderWeights`). Seconds.
 *
 * (v0.2.68 read her whole skin back from the graphics chip instead; that made three.js copy all 43 of her body shapes for
 * 115,710 points, about 160 MB, at every reading and once while loading: more than an iPhone allows a page, so the game
 * was closed and loaded again. Reading the weights costs nothing.)
 */
const SHAPE_SETTLE = 0.2;

/** The hidden body's body-shape weights, by name: her belly when they were read, and each shape's weight. */
export interface LiveShape {
  readonly belly: number;
  readonly weights: Readonly<Record<string, number>>;
  /**
   * Her skin's own points as the builder has them (x, y, z each): besides the weights, the builder also moves a few of
   * her points itself as her belly changes (up to about 2 cm at 64% against 150%), so those are read too.
   */
  readonly points: Float32Array;
}

export interface LiveBody {
  /**
   * Run the hidden body on by `dt` seconds. Afterwards `kickAt` and `kickDir` hold this frame's kicks.
   * Returns how long the step took, milliseconds.
   */
  step(dt: number): number;
  /** Each kick now: where on her skin (x, y, z in her rest frame, metres) and how far out (w, metres; 0 = none). */
  readonly kickAt: readonly THREE.Vector4[];
  /** Each kick's way out (x, y, z) and how wide it is (w, metres). */
  readonly kickDir: readonly THREE.Vector4[];
  /** How many kicks are showing this frame. */
  kicking(): number;
  /**
   * HER BELLY AND HER PREGNANCY changed in the game (Settings, the time lapse; heroine/pregnancyPlan.ts): the hidden
   * body follows, by the room's own BELLY slider and PREGNANT button, so the baby's kicks come from a womb her size, and
   * none come while she is not pregnant. Her belly is passed on once it settles (or at most once a second while it keeps changing).
   */
  setBelly(percent: number): void;
  setPregnant(on: boolean): void;
  /** Her body-shape weights as the builder had them when it opened (her look's own belly). */
  readonly openShape: LiveShape;
  /**
   * Her body-shape weights read again after her belly or pregnancy last changed, once settled; each new reading once
   * (null until there is a new one). See SHAPE_SETTLE.
   */
  takeShape(): LiveShape | null;
  /**
   * Read her shape again soon, though nothing changed: a NEW OUTFIT on the same body (main.ts `changeOutfit`) starts at
   * its own baked belly, and takes the builder's shape from this reading as it would after a change of belly.
   */
  readAgain(): void;
  /** How long the hidden body took to open, seconds. */
  readonly openedIn: number;
  dispose(): void;
}

/**
 * Her look with nothing on that is only there to be seen (see "it opens bare" above): her body and face as they are,
 * no hair, her sneakers on (see below), and clothes that are a COMPLETE but empty export (the builder takes a missing layer as "take it off", and
 * an outfit name it does not know as "put the default tee on"), so no paint, fabric, garment or shoe is loaded.
 */
export function bareLook(look: HeroineLook): HeroineLook {
  const head = (look.body.head ?? {}) as Record<string, unknown>;
  const outfit = ((look.clothes ?? {}) as { outfit?: unknown }).outfit;
  return {
    name: look.name,
    body: { ...look.body, head: { ...head, hair: { ...((head.hair ?? {}) as object), style: HAIR_STYLE_NONE } } },
    clothes: {
      outfit: typeof outfit === 'string' ? outfit : 'painted swimsuit',
      shirtLength: 0,
      layers: [null, null, null],
      garments: {},
      detail: { nipple: null, navel: null },
      // IN HER SNEAKERS (never drawn): to the builder no sneakers means barefoot, and barefoot it fits her whole
      // skeleton inside her as she loads ("seconds of work on a phone"; it froze the iPhone, 2026-11-19, as it froze the
      // builder's own room on 2026-11-11). Shod, the skeleton waits until it is wanted (X-RAY), as in the builder.
      shoes: 'sneakers',
    },
  };
}

/** The uniforms three.js keeps for a compiled material (the very objects the builder's shader patch put there). */
type Uniforms = Record<string, { value: unknown } | undefined>;

/**
 * Open the builder's whole room for `look`, out of sight. Slow (it loads everything the builder has for her), so the
 * game calls this AFTER she is on screen and attaches the result when it is ready.
 */
export async function openLiveBody(renderer: THREE.WebGLRenderer, look: HeroineLook, onProgress?: (stage: string) => void): Promise<LiveBody> {
  const began = performance.now();
  // (her light skin: the hidden copy is never looked at, and its inner parts are the same either way)
  const room: BuilderRoom = await openBuilderRoom({ renderer, look: bareLook(look), lightSkin: true, onProgress });

  // Her skin in the room, and the numbers its shader is given: the kicks are among them.
  const skin = findPaintedSkin(room.model);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__live = { room, skin, renderer }; // (for test pages only)
  if (!skin) { room.dispose(); throw new Error('the hidden body has no skin to read the baby\'s kicks from'); }
  const material = Array.isArray(skin.material) ? skin.material[0] : skin.material;
  const uniforms = (renderer.properties.get(material) as { uniforms?: Uniforms }).uniforms;
  const at = uniforms?.uKickAt?.value as THREE.Vector4[] | undefined, dir = uniforms?.uKickDir?.value as THREE.Vector4[] | undefined;
  if (!at || !dir) { room.dispose(); throw new Error('the hidden body\'s skin does not carry the builder\'s kicks (has the builder changed its skin shader?)'); }

  // (our own copies, so the fast skin never reads a number half-written)
  const kickAt = Array.from({ length: KICKS }, () => new THREE.Vector4());
  const kickDir = Array.from({ length: KICKS }, () => new THREE.Vector4(0, 0, 1, 0.03));
  let disposed = false;
  // (her belly and pregnancy as the room has them, and the belly the game last asked for)
  let roomBelly = look.body.bump, wantBelly = roomBelly, bellyWait = 0, stillFor = 0;
  let pregnant = readPregnancy((look.body as { pregnancy?: unknown }).pregnancy).pregnant;
  // READING HER SHAPE (SHAPE_SETTLE): her skin's body-shape weights, by name
  const names = Object.entries(skin.morphTargetDictionary ?? {});
  let readings = 0, laterPoints: Float32Array | null = null;
  const readShape = (): LiveShape => {
    const weights: Record<string, number> = {}, influence = skin.morphTargetInfluences ?? [];
    for (const [name, index] of names) weights[name] = influence[index] ?? 0;
    const position = skin.geometry.getAttribute('position') as THREE.BufferAttribute;
    // (one array for every reading after the first: nothing new is made each time)
    const points = readings++ === 0 ? new Float32Array(position.count * 3) : (laterPoints ??= new Float32Array(position.count * 3));
    for (let i = 0; i < position.count; i++) { points[i * 3] = position.getX(i); points[i * 3 + 1] = position.getY(i); points[i * 3 + 2] = position.getZ(i); }
    // HER NAVEL PUSHED OUT (Joshua, 2026-11-19: "the bellybutton... not included in the update. In CCBS it does
    // automatically"): the builder lays her navel in, and its shader pushes it out every frame by how much her womb
    // presses on it (navelSoft.ts: an outie at a big belly). That push is added here as the builder's own CPU readers
    // add it (`navelOffsetOf`), so her navel comes out with her belly in the game too.
    const navel = navelOffsetOf(skin);
    if (navel && navel.out.value) {
      const k = navel.out.value, d = navel.delta, n = Math.min(position.count, Math.floor(d.length / 4));
      for (let v = 0; v < n; v++) { const o = v * 4; if (d[o] || d[o + 1] || d[o + 2]) { points[v * 3] += k * d[o]; points[v * 3 + 1] += k * d[o + 1]; points[v * 3 + 2] += k * d[o + 2]; } }
    }
    return { belly: roomBelly, weights, points };
  };
  const openShape = readShape();
  let readIn = Infinity, fresh: LiveShape | null = null;
  return {
    kickAt, kickDir, openShape,
    takeShape(): LiveShape | null { const s = fresh; fresh = null; return s; },
    readAgain(): void { readIn = Math.min(readIn, SHAPE_SETTLE); },
    openedIn: (performance.now() - began) / 1000,
    setBelly(percent: number): void { const b = Math.max(0, Math.min(200, Math.round(percent))); if (b !== wantBelly) { wantBelly = b; stillFor = 0; } },
    setPregnant(on: boolean): void {
      if (disposed || on === pregnant) return;
      pregnant = on;
      room.press(SARAH_LAB_ACTION.pregnant); // (the room's own button: on or off, nothing else)
      readIn = SHAPE_SETTLE;
    },
    step(dt: number): number {
      if (disposed) return 0;
      const before = performance.now();
      bellyWait -= dt;
      stillFor += dt;
      if (wantBelly !== roomBelly && (stillFor >= LIVE_BELLY_SETTLE || bellyWait <= 0)) {
        bellyWait = LIVE_BELLY_EVERY;
        roomBelly = wantBelly;
        room.setSlider(SARAH_LAB_FIELD.bump, roomBelly);
        readIn = SHAPE_SETTLE;
      }
      room.step(dt);
      // (her shape read back once it has settled after a change)
      readIn -= dt;
      if (readIn <= 0) { readIn = Infinity; fresh = readShape(); }
      for (let k = 0; k < KICKS; k++) { if (at[k]) kickAt[k].copy(at[k]); if (dir[k]) kickDir[k].copy(dir[k]); }
      return performance.now() - before;
    },
    kicking(): number { let n = 0; for (const kick of kickAt) if (kick.w > 0) n++; return n; },
    dispose(): void { if (!disposed) { disposed = true; room.dispose(); } },
  };
}
