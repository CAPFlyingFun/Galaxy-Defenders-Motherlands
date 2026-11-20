"""
make_weave_tile.py -- turns Joshua's woven-mesh photo into a picture that TILES (repeats with no seam).

Joshua, 2026-11-19: "Are you able to apply this texture to her fabric? I am not sure if it tiles correctly, so might
have to do some blending like with the terrain texture." His photo is a close-up of a dark woven mesh (474 x 474).

What it does, in order:
  1. FLATTENS THE LIGHT. A photo is lit unevenly (brighter in one corner); repeated, that would show as a grid of
     bright and dark squares. Dividing each pixel by a heavy blur of the photo keeps the threads and drops the glow.
  2. BLENDS THE EDGES SO IT WRAPS. The last strip of the picture is cross-faded into the first, then cut off, so the
     right edge runs straight on into the left (and the bottom into the top). The strips are about two thread
     spacings wide (measured from the photo: a thread every ~11.3 px across, ~14 px down), so the blend lands thread
     on thread and no ghost doubling shows.
  3. SOFTENS THE GLINTS. In the photo the threads' glints are 7-8 times the cloth's middle brightness: in the game's
     knit (which lightens and darkens the suit by brightness / middle) that sparkled. A square root brings them to
     about 3 times while keeping every thread.
  4. Saves a 512 x 512 PNG and prints its middle brightness (put it in outfitMaterial.ts WOVEN_MESH.middle).

Run:  python3 scripts/make_weave_tile.py <photo.jpg> public/fabrics/woven-mesh-tile.png
"""
import sys

import numpy as np
from PIL import Image, ImageFilter


def wrap(picture: np.ndarray, blend: int, axis: int) -> np.ndarray:
    """Cross-fade the last `blend` rows (or columns) into the first ones and cut them off: the result wraps round."""
    a = np.moveaxis(picture, axis, 0)
    size = a.shape[0] - blend
    out = a[:size].copy()
    t = (np.arange(blend) / blend)[:, None]          # 0 at the very edge (all the far side) .. 1 (all its own)
    out[:blend] = t * a[:blend] + (1 - t) * a[size:size + blend]
    return np.moveaxis(out, 0, axis)


def main(source: str, target: str) -> None:
    photo = Image.open(source).convert('L')
    a = np.asarray(photo, float)
    # 1. the light flattened (a blur of 40 px is many threads wide, so it sees only the glow)
    glow = np.asarray(photo.filter(ImageFilter.GaussianBlur(40)), float)
    a = a / np.maximum(glow, 1) * a.mean()
    # 2. the edges blended: across (two threads of ~11.3 px), then down (two threads of ~14 px)
    a = wrap(a, 23, 1)
    a = wrap(a, 28, 0)
    # 3. the glints softened (square root, on 0..1)
    a = np.sqrt(np.clip(a, 0, 255) / 255) * 255
    tile = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)
    tile.save(target)
    print(f'{target}: middle brightness {np.asarray(tile, float).mean():.1f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
