#!/usr/bin/env python3
# =============================================================================
# make_wailua_lidar.py -- brings Mow & Grow's 1 m ground round Wailua into the game (v0.2.183).
#
# Joshua, 2026-11-27: "another agent [is] start[ing] a new game and it actually got better quality terrain data, so
# can you replace it in ours as well". That game (CAPFlyingFun/Mow-Grow-Family-Lawn-Co) fetched NOAA's 2013 USACE
# topobathy lidar of Kaua'i (1 m, bare earth, metres above local mean sea level) for a 3.5 km square round Wailua and
# baked it (its tools/terrain/bake_layers.py) into 16 tiles of 875 m on the island's own 64 x 64 grid, filled with
# OUR island's heights where the lidar has none (inland and in the river mouth) and blended into them over 40 m, so
# its edges meet our ground with no step. It also made the sea's shoreline there at 2 m (coast-wailua.png).
#
# Its world is ours: the island's metres from the grid's centre, +x east, +z south (we draw it shifted by her arrival
# point, as the tiles are). This copies its baked files as they are (never edited by hand) and writes the list the
# game reads, public/island/kauai/wailua-1m.json:
#   box       the square, island metres (x0, z0, x1, z1)
#   tileM     875 (each tile picture is 876 x 876: neighbouring tiles share their edge pixels)
#   tiles     [{ file, x0, z0 }]  (Terrarium RGB: height = R*256 + G + B/256 - 32768)
#   coast     the 2 m shoreline picture and its square (-8..+2 m as 0..255, as coast_mask.png is)
#
# Run from Game/:  python3 scripts/make_wailua_lidar.py <a Mow & Grow checkout>
# Needs Pillow (only to check every picture opens and is the size it says).
# =============================================================================
import json, os, shutil, subprocess, sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else '../../capflyingfun/mow-grow-family-lawn-co'
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(here, 'public/island/kauai')
info = json.load(open(os.path.join(src, 'public/terrain/terrain.json')))
d, c = info['layers']['detail'], info['layers']['coast']
try:
    commit = subprocess.run(['git', '-C', src, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
except Exception:
    commit = '?'

os.makedirs(os.path.join(out, 'wailua-1m'), exist_ok=True)
tiles = []
for t in d['tiles']:
    name = os.path.basename(t['file'])
    shutil.copy(os.path.join(src, 'public/terrain', t['file']), os.path.join(out, 'wailua-1m', name))
    with Image.open(os.path.join(out, 'wailua-1m', name)) as im:
        assert im.size == (d['tile_pixels'], d['tile_pixels']), (name, im.size)
    tiles.append({'file': f'wailua-1m/{name}', 'x0': t['x0'], 'z0': t['z0']})
shutil.copy(os.path.join(src, 'public/terrain', c['detail']), os.path.join(out, 'wailua-1m', 'coast-wailua.png'))
cx0, cz0, csize = c['detail_box']
with Image.open(os.path.join(out, 'wailua-1m', 'coast-wailua.png')) as im:
    coast_px = im.size[0]

manifest = {
    '_what': 'The 1 m ground round Wailua (v0.2.183), copied from Mow & Grow by scripts/make_wailua_lidar.py: see COPIED_FROM.md',
    'source': f"Mow & Grow: Family Lawn Co. (CAPFlyingFun/Mow-Grow-Family-Lawn-Co, {commit}), public/terrain/: {d['source']}",
    'lidarPercent': d['lidar_percent'],
    'box': {'x0': d['x0'], 'z0': d['z0'], 'x1': d['x0'] + d['size_m'], 'z1': d['z0'] + d['size_m']},
    'tileM': d['tile_m'],
    'tilePixels': d['tile_pixels'],
    'tiles': tiles,
    'coast': {'file': 'wailua-1m/coast-wailua.png', 'x0': cx0, 'z0': cz0, 'size': csize, 'pixels': coast_px,
              'encoding': 'ground metres = -8 + value / 255 * 10'},
}
json.dump(manifest, open(os.path.join(out, 'wailua-1m.json'), 'w'), indent=1)
size = sum(os.path.getsize(os.path.join(out, 'wailua-1m', f)) for f in os.listdir(os.path.join(out, 'wailua-1m')))
print(f'copied {len(tiles)} tiles and the shoreline ({size / 1e6:.1f} MB) from Mow & Grow {commit}')
