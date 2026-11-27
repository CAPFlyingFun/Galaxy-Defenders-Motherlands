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
| `veg/{canopy,landcover,water,river}.png`, `veg.json`, `README.md` (the real vegetation rasters) | `terrain/kauai/veg/` |
| `trees/{palm,cycad,sago,fern,aspen,conifer}.png` (photo trees) | `trees/` |
| `billboards/billboard_bush_01.png` | `billboards/` |

Made here (not copied): `kauai/overview.png`, the whole island at 513 x 513 for the coarse far island
(`scripts/make_island_overview.py`).

The code that uses them is `Game/src/world/island/`, brought over from Beyond Extinction's
`KauaiTileStreamer.ts`, `terrainSampling.ts`, `kauaiTile.worker.ts`, `KauaiCarve.ts`, `kauaiCarveCore.ts`, `KauaiHydro.ts`,
the ocean in `KauaiStreamScene.ts`, and (2026-11-20) the forest in `KauaiTrees.ts` -> `trees.ts` (each file says what
changed).

## The 1 m ground round Wailua: copied from Mow & Grow (v0.2.183)

Copied 2026-11-27 from Joshua's Mow & Grow: Family Lawn Co. (`CAPFlyingFun/Mow-Grow-Family-Lawn-Co`, `public/terrain/`,
main at f681fa2) by `python3 scripts/make_wailua_lidar.py <its checkout>` (from `Game/`), which also writes
`kauai/wailua-1m.json`. Not edited by hand; to refresh (a bigger or another square), run the script again.

| here | from Mow & Grow |
| --- | --- |
| `kauai/wailua-1m/c55_r30.png` ... `c58_r33.png` (16 tiles of 875 m, 876 x 876, Terrarium RGB) | `public/terrain/wailua-1m/` |
| `kauai/wailua-1m/coast-wailua.png` (the sea's shoreline there at 2 m, -8..+2 m as 0..255) | `public/terrain/coast-wailua.png` |

What they are: NOAA's 2013 USACE NCMP topobathy lidar DEM of Kaua'i (dataset 9335: 1 m, bare earth, metres above
local mean sea level, public data), fetched by Mow & Grow's lidar workflow for the square island x 20125..23625,
z -1750..1750 (65% of it has lidar: the coast and the homes behind it), and baked there (its
`tools/terrain/bake_layers.py`) with OUR island's own heights (`kauai/height/`) where the lidar has none, blended into
them over 40 m, so its edges meet this island's ground with no step. The islet off Wailua keeps the island's old
heights (the lidar sees open sea there). The code that draws it: `Game/src/world/island/lidarDetail.ts`.
