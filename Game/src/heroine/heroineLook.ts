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
import type { LiveBand } from './liveBand';
import type { LiveWaist } from './liveWaist';

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
    /** Which of the builder's bodies: 'v2-body' hers (the Female Base Model), 'male-base' his (the Male Base Model). */
    readonly model: 'v2-body' | 'male-base';
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
   * A BAND THE GAME DRAWS LIVE on her trunk (liveBand.ts; Mary's side bands, 2026-11-23): left out of her baked picture
   * and drawn by her skin's shader, so it keeps its width over a growing belly and a sharp edge at any texture size. On
   * the builder's own body it is painted into its layer as usual.
   */
  readonly liveBand?: LiveBand;
  /**
   * LEGGINGS WHOSE TOP SLIDES DOWN UNDER HER BELLY as it grows (liveWaist.ts; Mary's casual M5 and M6, 2026-11-23): the
   * bake draws them at their lowest, and her skin's shader draws them up to the line for her belly now, blended from
   * their 0% line to their 200% one. On the builder's own body they are as their layer's numbers say (the 200% ones).
   */
  readonly liveWaist?: LiveWaist;
  /**
   * Leave out the strip of fabric the builder stretches across her cleavage (the bake does not keep it). For a suit
   * painted on her skin up to her neck (graySuit.ts), where the paint itself runs into her cleavage.
   */
  readonly noCleavageBridge?: boolean;
  /**
   * Leave out every piece the room lays that has NO NAME (the bake keeps only named ones). For the catsuit
   * (shadowSuit.ts): the room laid an unnamed sheet in her skin's colour over her crotch, which showed as a brown patch
   * above her buckle at a small belly (Joshua, 2026-11-19). Her suit, painted by code, covers that skin already.
   */
  readonly onlyNamedPieces?: boolean;
  /**
   * Leave out the builder's TUNIC DRAPE (tunicDrape.ts: the sheet a painted shirt hangs round her hips, a level hem
   * band). The builder builds it again on her whenever she moves; baked once and moved on her bones in the game's own
   * stance, it and her skin under it took turns in front and its bottom edge came out a saw-tooth (Mary's casual tops,
   * casualSets.ts, 2026-11-23: "It looks all ragged"). Her shirt's paint ends on the band's level line all the same
   * (bakeLook.ts `levelShirtHem`), and the game draws a band of its own there (`hemBand`).
   */
  readonly noTunicDrape?: boolean;
  /**
   * A PAINTED SHIRT'S HEM BAND drawn by the game (beltGear.ts `HEM`; Joshua, 2026-11-23: "another belt that follows her
   * bottom edging with matching color"): a band made the way her belt is, level at the shirt's hem, straight across her
   * hollows. The bake measures where the shirt's paint ends and its colour there (look.json `hem`), and leaves the
   * builder's own hem band out (`noTunicDrape`).
   */
  readonly hemBand?: boolean;
  /**
   * A PAINTED SHIRT'S HEM RUN LIVE (liveDrape.ts; Joshua, 2026-11-23: "Go live with it… the live band that works and looks
   * like CCBS"): the builder's own drape, fitted on her in the game as its room fits it, and her skin's shirt paint taken
   * off under it by its numbers (outfitMaterial.ts HEM_GLSL). The bake leaves the shirt's paint whole (`unhang`), writes
   * the shirt's cover at each of her points (drape.bin) and what is under it (look.json `drape`); set it with
   * `noTunicDrape` (the drape is the game's, not a baked piece).
   */
  readonly liveDrape?: boolean;
  /**
   * MARKS ON HER SKIN that the builder cannot draw, painted onto her baked skin picture by the game's bake
   * (bake/skinMarks.ts): freckles, and warmth in her cheeks. Mary's (looks/maryHead.ts). Costs nothing in play: they
   * are part of the picture she already wears.
   */
  readonly skinMarks?: SkinMarks;
  /**
   * HER FACE AS IT IS BAKED (skinnedUvBake.ts). The builder's face layer draws her eyes live (gaze, blinks); the bake
   * keeps one moment of it, which the fast heroine wears for good. Whatever this says, that moment has her eyes looking
   * straight ahead and her mouth closed. `upperLids` (0..1, the builder's own blink: 0 open, 1 shut) lowers her upper
   * lids that far over her eyes, a relaxed look in place of the builder's wide-open one (Mary's and John's, 2026-11-22:
   * an eye made smaller by the face sliders past their ends came out warped). Left out, 0.
   */
  readonly bakedFace?: { readonly upperLids: number };
}

/** Freckles and cheek colour for the bake (bake/skinMarks.ts). */
export interface SkinMarks {
  readonly freckles?: {
    /** 0..1: how many (1 the most the pattern holds where they are thickest). */
    readonly amount: number;
    /** '#rrggbb': the colour a freckle is at its darkest. */
    readonly colour: string;
    /** 0..1: how far a freckle's middle goes toward that colour. */
    readonly strength: number;
    /** Any whole number: the same seed lays the same freckles at every bake. */
    readonly seed: number;
  };
  /** 0..1: how much rosier her cheeks are than the rest of her face. */
  readonly blush?: number;
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
