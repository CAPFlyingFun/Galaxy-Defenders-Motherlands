# Char_B: a copy of the Custom Character Builder System

Copied from `CAPFlyingFun/Custom-Character-Builder-System`, branch `main`, commit `0a8344d`
(2026-11-16, v0.9.39: "the painted swimsuit and leotard drawn, with the bikini bottom's leg openings").

What was copied, unchanged: `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`,
`vite.config.ts`, `README.md`, `CLAUDE.md`. Not copied: `assets-archive/` (335 MB of source models the room never
loads), `docs/`, `scripts/`, `tests/`.

Rules:

- The builder repo is the source of truth. Nothing in this folder is edited by hand.
- The code and the models are copied TOGETHER, at the same commit, so they always match.
- To update: copy the same paths again from the builder's newest approved `main`, and change the commit, date and
  version on this page. Then run the game and check the heroine before anything goes to `main`.
- The game (`../Game`) reads this folder through its `@charb` alias (code) and serves its models from here.
