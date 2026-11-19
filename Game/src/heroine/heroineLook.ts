// ============================================================================
// heroineLook.ts -- WHAT a heroine looks like, written the Character Builder's
// own way.
//
// The Character Builder saves a character as a small piece of JSON: her body
// (belly size, proportions, head and hair) and, if wanted, her clothes (the
// outfit's name, each painted layer, each fabric). Its LIBRARY tab's EXPORT
// button writes exactly this into "traddomium-characters.json".
//
// The game hands the builder a look in that same format and the builder's own
// "load a saved character" code puts it on her. So a heroine designed in the
// Character Room can be brought into the game by pasting her exported entry
// here -- nothing about her is re-made by hand.
// ============================================================================
import type { MaskPainter } from './paintMask';

/** One character as the Character Builder's EXPORT writes her (the parts the game uses). */
export interface HeroineLook {
  /** Her name on her save card. Any text; it is only used to find her card. */
  readonly name: string;
  /**
   * Her body. `bump` is her belly, 0-200 (%). `shape` is the builder's own text for her proportions
   * ('{"version":1,"shape":{}}' is the approved body untouched). `head` (hair style, colours, face) may be added
   * exactly as an export has it; left out, she has the builder's default head and ponytail.
   */
  readonly body: {
    readonly model: 'v2-body';
    readonly bump: number;
    readonly shape: string;
    readonly refine: boolean;
    readonly random: { readonly rules: Record<string, never>; readonly groups: readonly never[] };
    readonly head?: unknown;
    readonly pregnancy?: unknown;
  };
  /**
   * Her clothes, exactly as an export has them (outfit name, painted layers, fabrics), or null to wear the builder's
   * own default outfit: the red cloth-simulated raglan tee over painted charcoal leggings, with sneakers.
   * IMPORTANT: a clothes entry must be a COMPLETE export. The builder treats a missing painted layer as "take that
   * layer off", so a half-written entry would undress her.
   */
  readonly clothes: unknown | null;
  /**
   * PAINT LAYERS PAINTED BY CODE (paintMask.ts), one entry for each of the builder's three paint layers, bottom layer
   * first; null (or left out) for a layer the look's clothes describe themselves. Where a painter is given, the
   * clothes' layer at that place must be written as a HAND-PAINTED layer with its mask left empty
   * (`"template": null, "mask": ""`): once she is loaded the game works the mask out on the skin she is wearing and
   * fills it in (builderRoom.ts). This is the only part of a look that is not text from an export, because a mask
   * is a number for every point of her skin and her full and light skins have different points.
   */
  readonly maskPainters?: readonly (MaskPainter | null)[];
  /**
   * Leave out the strip of fabric the builder stretches across her cleavage (the bake does not keep it). For a suit
   * painted on her skin up to her neck (graySuit.ts), where the paint itself runs into her cleavage.
   */
  readonly noCleavageBridge?: boolean;
}

/** The belly the game's heroine starts with, percent (the builder's slider runs 0-200). */
export const DEFAULT_BELLY = 70;

/**
 * THE DEFAULT HEROINE: the builder's approved female body, pregnant at `belly` percent, in the builder's default
 * outfit, hair and face as the builder draws them. (The six named heroines' own looks are added later, each one
 * an export from the Character Room.)
 */
export function defaultHeroineLook(belly: number = DEFAULT_BELLY): HeroineLook {
  return {
    name: 'Heroine',
    body: {
      model: 'v2-body',
      bump: Math.max(0, Math.min(200, Math.round(belly))),
      shape: '{"version":1,"shape":{}}',
      refine: false,
      random: { rules: {}, groups: [] },
    },
    clothes: null,
  };
}
