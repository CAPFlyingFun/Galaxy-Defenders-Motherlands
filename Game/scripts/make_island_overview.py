#!/usr/bin/env python3
# ============================================================================
# make_island_overview.py -- one small height picture of the WHOLE island.
#
# The island is 64 height tiles of 7 km (public/island/kauai/height/A..H), and
# the game keeps only the 3 x 3 tiles round the heroine (21 km square). Past
# them, so the far mountains and coast are still there to see, the game draws
# ONE coarse mesh of the whole island (src/world/island/farIsland.ts). This
# script makes the picture that mesh is shaped from:
#
#   public/island/kauai/overview.png   513 x 513, ~109 m a pixel, same encoding
#                                      as the tiles (terrarium RGB:
#                                      metres = R*256 + G + B/256 - 32768)
#
# How the tiles fit together: each tile is 513 px and shares its last row and
# column with its neighbour, so the whole island is one 4097 x 4097 picture
# with tile (col, row) at [512*row .. 512*row+512][512*col .. 512*col+512].
# This takes every 8th point of that picture (4096 / 8 = 512, plus the edge),
# so where the overview and a tile meet they agree exactly at those points.
#
# Run from Game/:  python3 scripts/make_island_overview.py
# (only needed again if the tiles are ever re-copied from Beyond Extinction)
# ============================================================================
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
KAUAI = os.path.join(HERE, '..', 'public', 'island', 'kauai')
STEP = 8          # every 8th point of the whole-island picture
TILE = 512        # a tile's width in points, not counting the shared edge


def decode(rgb: np.ndarray) -> np.ndarray:
    """Terrarium colours to metres (the same sum the game's tile reader does)."""
    r, g, b = (rgb[..., i].astype(np.float64) for i in range(3))
    return r * 256 + g + b / 256 - 32768


def encode(metres: np.ndarray) -> np.ndarray:
    """Metres back to terrarium colours (rounded to 1/256 m)."""
    v = np.clip(metres + 32768, 0, 65535.99)
    r = np.floor(v / 256)
    g = np.floor(v - r * 256)
    b = np.round((v - r * 256 - g) * 256).clip(0, 255)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)


def main() -> None:
    manifest = json.load(open(os.path.join(KAUAI, 'manifest.json')))
    size = 8 * TILE // STEP + 1                     # 513
    # Ocean everywhere a tile is missing (the manifest leaves out tiles that are all sea): the deep floor.
    out = np.full((size, size), -1000.0)
    have = {t['id']: t for t in manifest['tiles']}
    for t in have.values():
        col, row = t['col'], t['row']
        h = decode(np.asarray(Image.open(os.path.join(KAUAI, t['file'])).convert('RGB')))
        # this tile's points that land on the overview's grid (every 8th, edge included)
        part = h[::STEP, ::STEP]                    # 65 x 65
        y0, x0 = row * TILE // STEP, col * TILE // STEP
        out[y0:y0 + part.shape[0], x0:x0 + part.shape[1]] = part
    out = np.maximum(out, -6000)                    # (the same floor the game puts under nonsense depths)
    Image.fromarray(encode(out), 'RGB').save(os.path.join(KAUAI, 'overview.png'), optimize=True)
    print(f'overview.png: {size} x {size}, {out.min():.0f} .. {out.max():.0f} m')


if __name__ == '__main__':
    main()
