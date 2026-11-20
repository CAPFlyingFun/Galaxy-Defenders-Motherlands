"""
make_skin_height.py -- a HEIGHT MAP of her skin, made from her own baked skin picture, the way Joshua's Local Texture
Lab makes one (docs/tools/Local_Texture_Lab.html, "Convert Image", its default settings).

Joshua, 2026-11-19: he ran her skin picture through his lab at 512 (IMG_6313) and asked for "a higher quality version"
from the one in the repo. Her game body has its OWN picture layout (each look's baked `albedo.webp`, 4096 x 4096), not
the builder's skin file's, so the height is made from each look's own picture: it then lines up with her skin exactly
and the game reads it by the same picture position as her colour (fast/skinTexture.ts).

The lab's recipe, line for line (`generateFromImage` and `normalizeLevels`):
  1. brightness of each pixel (0..1)
  2. a box blur of it, radius = size / 128 (the "broad" shapes), wrapping round like the lab's
  3. height = mix(brightness, broad, Large Form 0.62 * 0.72) + (brightness - broad) * Fine Detail 0.35 * 1.3
  4. contrast 1.25 round the middle, then levels: 4% .. 96% stretched to 0..1
NOT done: the lab's "make edges tile" blend. Her picture is a layout of separate pieces of her, not a repeating
pattern, so blending its edges would only smear the pieces that touch them.

Run:  python3 scripts/make_skin_height.py public/heroines/<look>/albedo.webp public/heroines/<look>/skinHeight.webp [2048]
"""
import sys

import numpy as np
from PIL import Image

LARGE_FORM = 0.62     # the lab's "Large Form Weight" 62
FINE_DETAIL = 0.35    # "Fine Detail" 35
CONTRAST = 1.25       # "Height Contrast" 125
LEVEL_LOW, LEVEL_HIGH = 0.04, 0.96   # "Height Levels" 4 .. 96


def box_blur_wrapped(a: np.ndarray, r: int) -> np.ndarray:
    """The lab's box blur: (2r+1) wide, rows then columns, wrapping round at the edges (via running sums)."""
    def blur_rows(x: np.ndarray) -> np.ndarray:
        padded = np.concatenate([x[:, -r:], x, x[:, :r + 1]], axis=1)
        c = np.cumsum(padded, axis=1)
        return (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return blur_rows(blur_rows(a).T).T


def main(source: str, target: str, size: int) -> None:
    picture = Image.open(source).convert('RGB').resize((size, size), Image.LANCZOS)
    rgb = np.asarray(picture, np.float64) / 255
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    broad = box_blur_wrapped(lum, max(2, round(size / 128)))
    v = lum + (broad - lum) * LARGE_FORM * 0.72 + (lum - broad) * FINE_DETAIL * 1.3
    v = np.clip((v - 0.5) * CONTRAST + 0.5, 0, 1)
    v = np.clip((v - LEVEL_LOW) / (LEVEL_HIGH - LEVEL_LOW), 0, 1)
    Image.fromarray((v * 255).round().astype(np.uint8)).save(target, quality=90)
    print(f'{target}: {size} x {size}, middle {v.mean():.3f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2048)
