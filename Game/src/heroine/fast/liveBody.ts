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
  /** How long the hidden body took to open, seconds. */
  readonly openedIn: number;
  dispose(): void;
}

/**
 * Her look with nothing on that is only there to be seen (see "it opens bare" above): her body and face as they are,
 * no hair, and clothes that are a COMPLETE but empty export (the builder takes a missing layer as "take it off", and
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
      shoes: 'none',
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
  if (!skin) { room.dispose(); throw new Error('the hidden body has no skin to read the baby\'s kicks from'); }
  const material = Array.isArray(skin.material) ? skin.material[0] : skin.material;
  const uniforms = (renderer.properties.get(material) as { uniforms?: Uniforms }).uniforms;
  const at = uniforms?.uKickAt?.value as THREE.Vector4[] | undefined, dir = uniforms?.uKickDir?.value as THREE.Vector4[] | undefined;
  if (!at || !dir) { room.dispose(); throw new Error('the hidden body\'s skin does not carry the builder\'s kicks (has the builder changed its skin shader?)'); }

  // (our own copies, so the fast skin never reads a number half-written)
  const kickAt = Array.from({ length: KICKS }, () => new THREE.Vector4());
  const kickDir = Array.from({ length: KICKS }, () => new THREE.Vector4(0, 0, 1, 0.03));
  let disposed = false;
  return {
    kickAt, kickDir,
    openedIn: (performance.now() - began) / 1000,
    step(dt: number): number {
      if (disposed) return 0;
      const before = performance.now();
      room.step(dt);
      for (let k = 0; k < KICKS; k++) { if (at[k]) kickAt[k].copy(at[k]); if (dir[k]) kickDir[k].copy(dir[k]); }
      return performance.now() - before;
    },
    kicking(): number { let n = 0; for (const kick of kickAt) if (kick.w > 0) n++; return n; },
    dispose(): void { if (!disposed) { disposed = true; room.dispose(); } },
  };
}
