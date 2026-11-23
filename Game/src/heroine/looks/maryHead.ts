// ============================================================================
// maryHead.ts -- MARY "BLAZE" FISHER'S HEAD: one head for every outfit she wears.
//
// (Joshua, 2026-11-22: "GDM: Mary & John Fisher Facial Appearance Integration", with ChatGPT's reference portraits
// and sheet -- kept OUT of the repo, as his heroine pictures are. Mary is 30: auburn hair loosely tied back with natural
// waves and a few strands by her face, hazel-green eyes, fair skin with freckles over her nose and cheeks, a soft oval
// face, natural lips. Then: "tweak and adjust the eyes, nose, and ears by measuring", and of going past the builder's
// slider limits: "get it as close as possible with what's available, and let me decide after I see the new renders".)
//
// WHAT IS HERE
//   * MARY_HEAD: her head in the builder's own words (hair, eyes, brows, lips, lashes, face sliders).
//   * MARY_SKIN_MARKS: the warmth in her cheeks, painted by the GAME's bake (bake/skinMarks.ts). Her FRECKLES were
//     painted there too until the builder had its own (v0.9.73, 2026-11-23): now they are the builder's (`marks`).
//   * asMary(look): any look on her body wears both. looks/index.ts puts every look of hers through it, so the
//     exports that carry a head of their own (the braid, blue eyes and red lips of the catsuits and Look 2, the dark
//     ponytail of the pink and black two-piece) all become Mary. Each export's own head is kept in its file as it was
//     saved; only what the game uses changes.
//
// HOW THE FACE NUMBERS WERE FOUND (2026-11-22). The reference front portraits and the game's heads (rendered in the
// heroine lab, the same distance and lens) were measured the same way, with OpenCV's 68-point face landmarks; the side
// views and ears by hand on gridded, zoomed renders taken almost flat (11 degree lens from 1.7 m). Every length is
// compared as a share of the distance between the eyes' middles (her eyes are 61 mm apart on the builder's sculpt),
// then turned into millimetres and into slider numbers by each slider's measured reach (the builder's faceShapes.ts).
//   eyes   her drawn eye opened 0.189 of that distance, Mary's 0.131 (8.0 mm): EYE SIZE -1 closes it to about 8.3 mm.
//          Her outer corners rose 10.5 degrees, Mary's 5.8: EYE TILT -1.5 (past the slider's -1: see below).
//   brows  4 mm higher over her eyes than Mary's: BROW HEIGHT -1 (4.2 mm at -1).
//   nose   as wide as Mary's (0.394 against 0.398); its tip lower in profile, Mary's turned up a little: NOSE TIP +0.7;
//          Mary's bridge stands out about 12% further: NOSE BRIDGE +0.3.
//   ears   the same size in profile (0.548 of her eye-to-chin against 0.556); from the front Mary's stand out about
//          6 mm further each side, and no slider turns an ear out: EAR SIZE +0.4 (a little bigger all round).
// ROUND 2, measured again on the first bake, the faces lined up eye to eye beside the reference: her eye opened 0.161
// (Mary 0.131), her corners rose 7.8 degrees (5.9), her brows sat 0.373 over her eyes (0.341), and the wings of her nose
// read narrower than Mary's side by side: EYE SIZE -1.3, EYE TILT -2, BROW HEIGHT -1.6, NOSE WIDTH +0.4.
// ROUND 3: at EYE TILT -2 the skin by her outer eye corners crowded (the lid drooped over her iris) and the nose came
// out wider than Mary's (0.441): EYE TILT back to -1.5, NOSE WIDTH +0.2.
// ROUND 4 (Joshua, 2026-11-22, of round 3: "Eyes a little warped. Any way to fix?"): squeezing the skin round her eyes
// past the slider's end (EYE SIZE -1.3, EYE TILT -1.5) bent her lids. Her eyes are now narrowed the way a real relaxed
// eye is: the builder's own upper lid lowered a little over them as she is baked (MARY_UPPER_LIDS: its blink at 0.15,
// about 1.4 mm), with EYE SIZE -0.6 and EYE TILT -1, inside the range the builder tuned. Her eyes are baked looking
// straight ahead (the room's eyes wander: a bake caught them looking aside).
//
// BUILDER v0.9.73 (2026-11-23; its agent made five things for Mary and John at Joshua's asking, and gave the settings
// it pictured her with, which are hers here): a TWO-TONE IRIS (green-hazel with a gold ring round the pupil), her
// BROWS' SHAPE (arched +0.4), the builder's own FRECKLES (85 % of them, small, on her nose, cheeks and shoulders, never
// over her paint) and her FACE'S DETAIL (an eyelid crease 0.6, smile lines 0.3, a philtrum 0.5). Her measured face
// sliders are kept as they were.
//
// PAST THE SLIDERS' ENDS. The builder holds a face slider to -1..+1, but each slider is a shape laid by its number, a
// straight line through 0: the game's bake lays the part past the end itself (bake/faceBeyond.ts), on the shape it
// captures. So a number here may run past 1 (never past 2: the builder judged its shapes only to 1). The Visual body
// (the builder's live room) still stops at 1.
// ============================================================================

import type { HeroineLook, SkinMarks } from '../heroineLook';

/** Her hair: auburn, a little darker than the reference's lit strands (the builder's hair shines it lighter). */
export const MARY_HAIR_COLOUR = '#4e2716';

/**
 * HER FACE'S SHAPE (the builder's face sliders; MEASURED as above). Every slider not named is 0 (the builder's own
 * sculpt).
 */
export const MARY_FACE: Readonly<Record<string, number>> = {
  // EYES & BROWS (the second pass: see ROUND 2 above)
  eyeSize: -0.6,
  eyeTilt: -1,
  browHeight: -1.6,
  // NOSE
  noseTip: 0.7,
  noseBridge: 0.3,
  noseWidth: 0.2,
  // EARS
  earSize: 0.4,
};

/**
 * MARY'S HEAD in the builder's words (its `HeadLook`, Char_B/src/sarahlab/headLook.ts).
 *   hair   the builder's WAVY LOW PONYTAIL (Lena's style): tied back low, natural waves, loose locks down the sides of
 *          her face -- the nearest of the builder's six to the reference (pictured 2026-11-22), at 0.6 of its length.
 *   eyes   green-hazel with a GOLD ring round the pupil (builder v0.9.73's two-tone iris: its agent's Mary, #6c7a42 and
 *          #bf8f45; before it, the builder's own single hazel).
 *   brows  a dark auburn-brown (the reference's brows are darker than her hair: MEASURED #5a382a in the portrait),
 *          arched a little higher (+0.4), as the reference's are.
 *   lips   her own tint at 0.55, as the pink and black two-piece had them: natural, no red.
 *   marks  the builder's FRECKLES: 85 % of them, small (0.3), its own warm light brown, on her nose, cheeks and
 *          shoulders (not her forehead); never over her paint.
 *   detail an eyelid crease (0.6), smile lines (0.3) and a philtrum (0.5), drawn as gentle shade.
 */
export const MARY_HEAD = {
  hair: { style: 'wavy-ponytail', length: 0.6, colour: MARY_HAIR_COLOUR },
  eyes: { colour: '#6c7a42', inner: '#bf8f45' },
  brows: { colour: '#4a2b1d', amount: 1, arch: 0.4 },
  lips: { colour: null, amount: 0.55 },
  lashes: 1,
  face: MARY_FACE,
  marks: { amount: 0.85, size: 0.3, colour: null, nose: true, cheeks: true, forehead: false, shoulders: true },
  detail: { crease: 0.6, smile: 0.3, philtrum: 0.5 },
} as const;

/**
 * HER ROSY CHEEKS (painted by the game's bake: bake/skinMarks.ts): a little rosier than her forehead, as the reference's
 * (MEASURED in the portrait: cheek #d3876a, forehead #e8a991). Her freckles are the builder's own now (MARY_HEAD
 * `marks`); the game's (`freckles`, bake/skinMarks.ts) are kept for a look that wants them.
 */
export const MARY_SKIN_MARKS: SkinMarks = {
  blush: 0.35,
};

/**
 * HER UPPER LIDS AS BAKED (heroineLook.ts `bakedFace`): the builder's blink held at 0.15, about 1.4 mm over the top of her
 * iris, as the reference's relaxed eyes have it (the builder draws her eyes wide open). Only her baked look: the Visual
 * body blinks as the builder does.
 */
export const MARY_UPPER_LIDS = 0.15;

/** A look of hers, worn by Mary: her head, her rosy cheeks and her eyes as baked. A look on another body is handed back as it is. */
export function asMary(look: HeroineLook): HeroineLook {
  if (look.body.model !== 'v2-body') return look;
  return { ...look, body: { ...look.body, head: MARY_HEAD }, skinMarks: MARY_SKIN_MARKS, bakedFace: { upperLids: MARY_UPPER_LIDS } };
}
