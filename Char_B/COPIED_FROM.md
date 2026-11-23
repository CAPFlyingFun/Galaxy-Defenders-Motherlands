# Char_B: a copy of the Custom Character Builder System

Copied from `CAPFlyingFun/Custom-Character-Builder-System`, branch `main`, commit `941b8ea`
(2026-11-23, v0.9.73: a face's details for every character, made for GDM's Mary and John: freckles, a two-tone iris,
brow shape, an eyelid crease, deep-set eyes, smile lines, a philtrum, and a skin picture laid over the skin; and since
v0.9.72 his body wears his own skin, never hers). Before that: `a2bf91c`
(2026-11-21, v0.9.71: his face, eyes, facial hair and twelve hairstyles; in SQUAT and RECLINE her bump carried as she
stands and her thighs giving way to it, `bellyContact.ts`; seated, the side and back of her hips keep her own weights).
Before that: `e2ebcf8` (2026-11-21, v0.9.68: her body's fixes seated, her bump keeps its standing shape and her hips stay closed, no pinching
at her belly and pelvis; and HIS outfit pictures, the male body's clothes). Before that: `bae4157`
(2026-11-20, v0.9.60: a chest cutout, oval, diamond or keyhole, on the catsuit, leotard and swimsuit; the room lets its
head panel go on dispose; since v0.9.59 the catsuit's drawn edges and an adjustable neckline, low V/U up to a
turtleneck). Before that: `74ff232` (2026-11-19, v0.9.51: skin depth, a hybrid of each body's own skin
picture's depth and a pore and crease tile), `1344d7a` (2026-11-19, v0.9.49: "EXACT belly %, typed or picked from a list"; since v0.9.45 also the
hybrid pregnancy curve and baby kicks), `e1c226a` (2026-11-19, v0.9.45), `764f7c7` (2026-11-16, v0.9.40).

Since v0.9.40 the builder needs one more library, `fflate` (its export zip): the game installs it and points the
builder's `import 'fflate'` at its own copy, as it does three.js (`Game/vite.config.ts`, `Game/tsconfig.json`).

What was copied, unchanged: `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`,
`vite.config.ts`, `README.md`, `CLAUDE.md`. Not copied: `assets-archive/` (335 MB of source models the room never
loads), `docs/`, `scripts/`, `tests/`.

Rules:

- The builder repo is the source of truth. Nothing in this folder is edited by hand.
- The code and the models are copied TOGETHER, at the same commit, so they always match.
- To update: copy the same paths again from the builder's newest approved `main`, and change the commit, date and
  version on this page. Then run the game and check the heroine before anything goes to `main`.
- The game (`../Game`) reads this folder through its `@charb` alias (code) and serves its models from here.
