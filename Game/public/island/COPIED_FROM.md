# The island's files: copied from Beyond Extinction

Copied 2026-11-19 from Beyond Extinction's web version
(`capflyingfun/beyond-extinction`, `artifacts/beyond-extinction/public/assets/`, main at 70f3f97).
Not edited by hand. To refresh, copy the same files over these again and run
`python3 scripts/make_island_overview.py` (from `Game/`).

| here | from Beyond Extinction |
| --- | --- |
| `kauai/height/A..H/*.png`, `manifest.json`, `coast_mask.png`, `hydro.json`, `README.md` | `terrain/kauai/` |
| `textures/{sand,grass,jungle,cliff,mountain,snow,reef}.jpg`, `riverbed_{sand,cobble,silt,algae}.jpg`, `water_normal.png` | `textures/` |
| `sky/daysky_bg.jpg` | `hdri/daysky_bg.jpg` |

Made here (not copied): `kauai/overview.png`, the whole island at 513 x 513 for the coarse far island
(`scripts/make_island_overview.py`).

The code that uses them is `Game/src/world/island/`, brought over from Beyond Extinction's
`KauaiTileStreamer.ts`, `terrainSampling.ts`, `kauaiTile.worker.ts`, `KauaiCarve.ts`, `kauaiCarveCore.ts`, `KauaiHydro.ts`
and the ocean in `KauaiStreamScene.ts` (each file says what changed). Not brought over yet: trees and plants (`veg/`).
