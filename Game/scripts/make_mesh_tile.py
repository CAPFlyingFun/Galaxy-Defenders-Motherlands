"""
make_mesh_tile.py -- draws the CATSUIT'S PERFORATED MESH as a seamless tile (public/fabrics/perforated-mesh-tile.png).

Joshua, 2026-11-19, of Look 1's picture: "a multi-layer breathable mesh, but where no skin shows through the holes".
The picture is too small to cut the material from (each hole is about 2 pixels), so the pattern is drawn here:
small round holes on a DIAGONAL grid (as in the picture), a slightly raised lattice between them, and in each hole
the dark backing layer (the second layer, so no skin). The game lays it on her suit as its live knit
(src/heroine/fast/outfitMaterial.ts): it is read as how light each spot is, around its middle brightness.

Run: python3 scripts/make_mesh_tile.py   (prints the tile's middle brightness, which outfitMaterial needs)
"""
import numpy as np
from PIL import Image

SIZE = 512          # pixels; the tile repeats seamlessly
CELLS = 8           # holes along each side of the tile (on the diagonal grid there are twice as many in all)
HOLE = 0.30         # a hole's radius, as a share of the space between holes
LATTICE = 0.62      # the lattice's brightness (0 black, 1 white) before its rounding
BACKING = 0.16      # the dark backing seen through a hole

y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE * CELLS
# the diagonal grid: holes at the corners AND the middles of each square (a checkerboard of holes, at 45 degrees)
def nearest(u, v):
    du, dv = u - np.round(u), v - np.round(v)
    return np.hypot(du, dv)
d = np.minimum(nearest(x, y), nearest(x + 0.5, y + 0.5))   # distance to the nearest hole's middle (grid units)
spacing = np.sqrt(0.5)                                      # between neighbouring holes on that grid
r = d / spacing                                             # 0 at a hole's middle, about 0.5 half way to the next
# the lattice is rounded: brightest midway between holes, falling toward each hole's rim (light catches its top)
lattice = LATTICE * (0.75 + 0.25 * np.clip((r - HOLE) / (0.5 - HOLE), 0, 1) ** 0.6)
# each hole: a soft rim, then the backing
edge = np.clip((r - (HOLE - 0.06)) / 0.06, 0, 1)
light = BACKING + (lattice - BACKING) * edge
img = Image.fromarray((light * 255).clip(0, 255).astype('uint8'))
img.save('public/fabrics/perforated-mesh-tile.png')
print('middle brightness', round(float(light.mean() * 255), 1))
