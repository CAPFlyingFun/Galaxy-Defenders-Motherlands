# Char_B: a copy of the Custom Character Builder System

Copied from `CAPFlyingFun/Custom-Character-Builder-System`, branch `main`, commit `1344d7a`
(2026-11-19, v0.9.49: "EXACT belly %, typed or picked from a list"; since v0.9.45 also the hybrid pregnancy curve and
baby kicks). Before that: `e1c226a` (2026-11-19, v0.9.45), `764f7c7` (2026-11-16, v0.9.40).

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
