// ============================================================================
// skinMarks.ts -- FRECKLES AND ROSY CHEEKS, painted into her baked skin picture.
//
// (Joshua, 2026-11-22: Mary "Blaze" Fisher has "natural freckles across her nose and cheeks"; the Character Builder has
// no freckles. Its agent has the request; until then the GAME paints them, here, without touching the builder.)
//
// HOW. The bake draws her skin flat in her texture layout with her REAL material (skinnedUvBake.ts), and keeps the
// colour each point of her ends up with. This adds a few lines at the very end of that drawing, just before the colour
// is kept: where the point is on her FACE, its colour is darkened toward a freckle's, or warmed for her cheeks.
//
// WHERE ON HER FACE. The builder's face layer hands every point's place on her sculpt to the fragment stage, in its
// FACE coordinates (`vFaceF`: her rest metres less `FACE_ORIGIN`, a point between her eyes and her mouth; faceRig.ts).
// That place is her SCULPT's, not where the face sliders moved her skin: the builder paints her eyes, brows and lips
// the same way, so the freckles ride her skin exactly as they do, and keep clear of them at any slider setting.
// Every landmark below is the builder's own (faceRig.ts `FACE_EYES`, `FACE_MOUTH`, `FACE_BROWS`, `FACE_HEAD`), turned
// into face coordinates once, here.
//
// THE PATTERN. Where freckles may be is a smooth map (thickest over the bridge of her nose and across her upper
// cheeks, fewer on her forehead and lower cheeks, none on her eyes, brows or lips: GAME TUNING after the reference).
// The freckles themselves: her face is laid out like a map round her head (each point by how far round her head it is
// and how high), cut into 2.6 mm cells; each cell, by a hash of the cell and the seed, may hold one round freckle,
// 0.8-1.8 mm across, somewhere in it, more often where the map is thick. The same seed lays the same
// freckles at every bake. A freckle is her own skin colour multiplied toward the freckle colour, so it darkens with her
// skin rather than sitting on it as paint.
//
// COST: none in play. They are part of the picture she already wears.
// ============================================================================

import { FACE_BROWS, FACE_EYES, FACE_HEAD, FACE_MOUTH, FACE_ORIGIN } from '@charb/sarahlab/faceRig';
import type { SkinMarks } from '../heroine/heroineLook';

/** The builder's EVEN skin colour (skinChoices.ts `EVEN_SKIN_COLOUR`, MEASURED by its scripts/evenSkin.mjs): 228, 181, 165. */
const EVEN_SKIN_SRGB: readonly [number, number, number] = [228, 181, 165];

/** sRGB 0..255 to linear 0..1 (the shader works in linear colour). */
function linear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
/** '#rrggbb' to sRGB 0..255. */
function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`skinMarks: "${hex}" is not a #rrggbb colour`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** A number written for GLSL (always with a decimal point). */
const n = (x: number): string => (Number.isInteger(x) ? `${x}.0` : x.toFixed(6));
/** A rest-metre place in the face coordinates the shader has (`vFaceF`). */
const f = (x: number, y: number, z: number): [number, number, number] => [x - FACE_ORIGIN[0], y - FACE_ORIGIN[1], z - FACE_ORIGIN[2]];

// ---- her landmarks in face coordinates (the builder's MEASURED ones) -------------------------------------------------
const EYE = f((FACE_EYES.left.inner[0] + FACE_EYES.left.outer[0]) / 2, FACE_EYES.left.centre[1], FACE_EYES.left.centre[2]);
/** An eye's half-width and half-height, with room round them (lashes, lid shadow): no freckle inside. */
const EYE_KEEP_OUT = [(FACE_EYES.left.outer[0] - FACE_EYES.left.inner[0]) / 2 + 0.0045, FACE_EYES.upperLid + 0.0055] as const;
const MOUTH_Y = FACE_MOUTH.seamY - FACE_ORIGIN[1];
/** Her lips' half-width and half-height, with a little room: no freckle on her lips. */
const LIPS_KEEP_OUT = [FACE_MOUTH.cornerX + 0.006, (FACE_MOUTH.upperTop - FACE_MOUTH.lowerBottom) / 2 + 0.004] as const;
const BROW_Y = FACE_BROWS.arch[1] - FACE_ORIGIN[1];
const BROW_TAIL_X = FACE_BROWS.tail[0] + 0.006;
const NOSE = f(...FACE_HEAD.noseTip);

/**
 * THE MAP OF WHERE THEY ARE (GAME TUNING, judged against the reference portrait): each a soft patch, its middle and
 * its spread (face coordinates, metres), and how thick it is. `side` patches are laid on both cheeks.
 */
const PATCHES = [
  // over the bridge and down the back of her nose
  { x: 0, y: NOSE[1] + 0.016, sx: 0.011, sy: 0.017, weight: 1, side: false },
  // across her upper cheeks, under her eyes
  { x: EYE[0] + 0.004, y: EYE[1] - 0.026, sx: 0.016, sy: 0.012, weight: 0.95, side: true },
  // a lighter scatter wider over her cheeks
  { x: EYE[0], y: EYE[1] - 0.042, sx: 0.026, sy: 0.022, weight: 0.3, side: true },
  // a few on her forehead
  { x: 0, y: BROW_Y + 0.015, sx: 0.03, sy: 0.012, weight: 0.12, side: false },
] as const;

/** The cells the freckles are laid in (metres round her head and up it), and the freckles' size (diameter, metres). */
const CELL = 0.0026;
const SIZE = { least: 0.0008, most: 0.0018 } as const;
/** How often a cell where they are thickest holds a freckle (0..1). */
const FILL = 0.8;
/** Her head's middle, for laying her face out round it (face coordinates), and the radius it is laid out at. */
const ROUND = { z: -0.07, radius: 0.085 } as const;

/**
 * GLSL for the end of the albedo bake's fragment stage: freckles and rosy cheeks on `diffuseColor`, from `vFaceF`.
 * Empty when the look has no marks.
 */
export function skinMarksGlsl(marks: SkinMarks | undefined): string {
  if (!marks || (!marks.freckles && !marks.blush)) return '';
  const freckles = marks.freckles;
  // a freckle multiplies her skin toward its colour: the colour over her even skin, per channel (linear)
  const tint = freckles ? rgbOf(freckles.colour).map((c, i) => Math.min(1, linear(c) / linear(EVEN_SKIN_SRGB[i]))) : [1, 1, 1];
  const patch = (p: (typeof PATCHES)[number]): string =>
    `${n(p.weight)} * gdmPatch(vec2(${p.side ? 'abs(F.x)' : 'F.x'}, F.y), vec2(${n(p.x)}, ${n(p.y)}), vec2(${n(p.sx)}, ${n(p.sy)}))`;
  return `
  {
    // ---- skinMarks.ts: freckles and rosy cheeks (the game's bake) ----
    vec3 F = vFaceF;
    // only her face's front: within the builder's face box, in front of her ears
    float gdmFront = step(abs(F.x), 0.08) * step(-0.08, F.y) * step(F.y, 0.115) * smoothstep(-0.035, -0.012, F.z);
    // no marks on her eyes, her lips or along her brows
    vec2 gdmE = vec2((abs(F.x) - ${n(EYE[0])}) / ${n(EYE_KEEP_OUT[0])}, (F.y - ${n(EYE[1])}) / ${n(EYE_KEEP_OUT[1])});
    float gdmKeep = smoothstep(1.0, 1.5, dot(gdmE, gdmE));
    vec2 gdmL = vec2(F.x / ${n(LIPS_KEEP_OUT[0])}, (F.y - ${n(MOUTH_Y)}) / ${n(LIPS_KEEP_OUT[1])});
    gdmKeep *= smoothstep(1.0, 1.4, dot(gdmL, gdmL));
    gdmKeep *= 1.0 - 0.85 * step(abs(F.x), ${n(BROW_TAIL_X)}) * smoothstep(0.009, 0.004, abs(F.y - ${n(BROW_Y)}));
    float gdmHere = gdmFront * gdmKeep;
    ${marks.blush ? `
    // HER CHEEKS a little rosier (less green and blue), most on the apples of her cheeks
    float gdmBlush = ${n(marks.blush)} * gdmHere * gdmPatch(vec2(abs(F.x), F.y), vec2(${n(EYE[0] + 0.006)}, ${n(EYE[1] - 0.034)}), vec2(0.017, 0.015));
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.86, 0.84), gdmBlush);` : ''}
    ${freckles ? `
    // HOW THICK the freckles are here (0..1)
    float gdmThick = max(max(${patch(PATCHES[0])}, ${patch(PATCHES[1])}), max(${patch(PATCHES[2])}, ${patch(PATCHES[3])}));
    gdmThick *= gdmHere * ${n(Math.max(0, Math.min(1, freckles.amount)))};
    if (gdmThick > 0.002) {
      // her face laid out round her head: how far round (metres along the round) and how high
      vec2 gdmP = vec2(${n(ROUND.radius)} * atan(F.x, F.z - ${n(ROUND.z)}), F.y) / ${n(CELL)};
      vec2 gdmCell = floor(gdmP);
      float gdmDark = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = gdmCell + vec2(float(i), float(j));
        // is there a freckle in this cell? more often where they are thick
        if (gdmHash(c, 1.0) > gdmThick * ${n(FILL)}) continue;
        vec2 at = c + vec2(gdmHash(c, 2.0), gdmHash(c, 3.0));
        float radius = mix(${n(SIZE.least / 2 / CELL)}, ${n(SIZE.most / 2 / CELL)}, gdmHash(c, 4.0));
        float shade = mix(0.3, 1.0, gdmHash(c, 5.0));
        float d = length(gdmP - at);
        gdmDark = max(gdmDark, shade * (1.0 - smoothstep(radius * 0.45, radius, d)));
      }
      diffuseColor.rgb *= mix(vec3(1.0), vec3(${tint.map(n).join(', ')}), gdmDark * ${n(Math.max(0, Math.min(1, freckles.strength)))});
    }` : ''}
  }
`;
}

/**
 * The functions the marks use, for the fragment stage's top (outside main). `seed` makes each bake's freckles its own
 * pattern; the same seed, the same freckles.
 */
export function skinMarksFunctions(marks: SkinMarks | undefined): string {
  if (!marks || (!marks.freckles && !marks.blush)) return '';
  const seed = marks.freckles?.seed ?? 0;
  return `
  // skinMarks.ts: a hash of a cell (and which number of it), 0..1; and a soft round patch
  float gdmHash(vec2 c, float k) {
    vec3 p3 = fract(vec3(c.xyx + vec3(${n(seed * 17.13)}, k * 31.7, ${n(seed * 7.77)})) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float gdmPatch(vec2 p, vec2 middle, vec2 spread) {
    vec2 d = (p - middle) / spread;
    return exp(-0.5 * dot(d, d));
  }
`;
}
