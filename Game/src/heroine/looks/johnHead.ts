// ============================================================================
// johnHead.ts -- JOHN "SPARKS" FISHER'S HEAD.
//
// (Joshua, 2026-11-22: "GDM: Mary & John Fisher Facial Appearance Integration", with ChatGPT's reference portraits and
// sheet, kept OUT of the repo. John is 32: bald with a natural scalp, blue-gray eyes, a defined jaw, strong brows,
// light stubble, realistic skin. Then: "tweak and adjust the eyes, nose, and ears by measuring", and "get it as close
// as possible with what's available, and let me decide after I see the new renders".)
//
// HOW THE FACE NUMBERS WERE FOUND (2026-11-22): as Mary's (maryHead.ts): the reference and his head in the game, both
// from the front, measured with OpenCV's 68 face landmarks as shares of the distance between his eyes' middles (about
// 62.5 mm on him); his profile and ears by hand on gridded, nearly flat renders. Each slider is changed FROM his export
// of 2026-11-22 02:11 UTC (the number in brackets):
//   eyes   his drawn eye opened 0.176 of that distance, the reference's 0.121 (7.6 mm): EYE SIZE -1.2 (+0.5), past the
//          slider's -1 (bake/faceBeyond.ts lays the rest). His outer corners rose 6.8 degrees, the reference's 3.6:
//          EYE TILT -1 (0).
//   brows  7 mm higher over his eyes than the reference's: BROW HEIGHT -1.4 (+0.3), 7.4 mm lower (then -2: ROUND 2).
//   nose   about 10% narrower than the reference's: NOSE WIDTH +1 (0), 2.7 mm wider; a straighter, stronger bridge:
//          NOSE BRIDGE +0.4 (-0.4); in profile his tip sat high and his nose's base a little high: NOSE TIP -0.2 (+0.4),
//          NOSE LENGTH +0.3 (0).
//   ears   about 7% shorter than the reference's in profile, standing out as far: EAR SIZE +0.6 (0) (then +1: ROUND 2).
// ROUND 2, measured again on the first bake, lined up eye to eye beside the reference: his corners still rose 7.3
// degrees, his brows sat 0.372 over his eyes (the reference's 0.29) and his ears read small beside the reference's:
// EYE TILT -1.4, BROW HEIGHT -2, EAR SIZE +1.
// His stubble at 0.75 drew a flat, hard-edged shadow over his lower face: 0.45; his brows darker.
// ROUND 3: at BROW HEIGHT -2 his brows' edges went wavy (the skin over his eyes crowded): -1.5 (6.6 mm lower than his
// export's). His eyes still read rounder than the reference's: EYE SIZE -1.4.
// ROUND 4 (Joshua, 2026-11-22: "Eyes a little warped"): as Mary's (maryHead.ts), his eyes narrowed by his upper lids
// lowered as he is baked (JOHN_UPPER_LIDS 0.2: the reference's eyes are a little hooded) with EYE SIZE -0.8 and EYE TILT
// -1, inside the builder's range; BROW HEIGHT -1.4 (at -1.5 one brow kept a small notch), 6.1 mm lower than his export's.
// His other sliders are his export's.
// ============================================================================

/** His upper lids as baked (heroineLook.ts `bakedFace`): the builder's blink held at 0.2 (about 1.6 mm). */
export const JOHN_UPPER_LIDS = 0.2;

/** His face's shape: the builder's face sliders (a slider not named is 0). Numbers past 1 are laid by the bake. */
export const JOHN_FACE: Readonly<Record<string, number>> = {
  // as his export had them
  cheekFullness: 0.7,
  jawCorner: -0.03,
  chinForward: 0.21,
  lipFullness: 0.6,
  cheekbones: -0.3,
  faceWidth: -1,
  jawWidth: -0.02,
  // MEASURED against the reference (above)
  eyeSize: -0.8,
  eyeTilt: -1,
  browHeight: -1.4,
  noseWidth: 1,
  noseBridge: 0.4,
  noseTip: -0.2,
  noseLength: 0.3,
  earSize: 1,
  // BUILDER v0.9.73's DEEP-SET EYES (its agent's John: 0.6): his eyes back and his brow ridge forward, with its shade
  eyeDepth: 0.6,
};

/**
 * JOHN'S HEAD in the builder's words (its `HeadLook`).
 *   hair   none: bald. His scalp is his skin as the builder draws it (pictured 2026-11-22: clean, no hairline). The
 *          colour still counts: it is what his brows and stubble would follow if they had none of their own.
 *   eyes   blue-gray (the reference's irises, by eye: their measured average is pulled dark by the pupil and rim),
 *          with a GREY ring round the pupil reaching 0.4 out (builder v0.9.73's two-tone iris; its agent's John
 *          #7d93a3 with a grey ring at 40 %: his blue-gray kept).
 *   brows  near-black brown and full (the portrait's MEASURED #4b3327 drew lighter on him: the builder lightens brows),
 *          in v0.9.73's BROW SHAPE heavy and straight: straight 0.8, thick +0.5, arch -0.2 (its agent's John).
 *   beard  the builder's STUBBLE, under half thickness, dark brown: the reference's light stubble. (Its agent pictured
 *          him at 0.7; at 0.75 it drew a flat, hard-edged shadow over his lower face in the game: 0.45 is kept.)
 *   detail v0.9.73's FACE DETAIL: an eyelid crease (0.5), smile lines (0.45) and a philtrum (0.4) (its agent's John).
 */
export const JOHN_HEAD = {
  hair: { style: 'none', length: 0, colour: '#2b211c' },
  eyes: { colour: '#7f97a6', inner: '#8c9092', innerSize: 0.4 },
  brows: { colour: '#1e140d', amount: 1, arch: -0.2, straight: 0.8, thick: 0.5 },
  lips: { colour: null, amount: 1 },
  lashes: 1,
  face: JOHN_FACE,
  beard: { style: 'stubble', colour: '#3b2a20', amount: 0.45 },
  detail: { crease: 0.5, smile: 0.45, philtrum: 0.4 },
} as const;
