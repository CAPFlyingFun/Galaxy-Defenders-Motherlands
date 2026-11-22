#!/usr/bin/env python3
# =====================================================================================================================
# make_island_tiles16.py -- cuts the island's 8 x 8 height tiles (7 km each) into 16 x 16 tiles of 3.5 km.
#
# Joshua, 2026-11-22 (v0.2.150): "instead of a 8x8 grid, we turn it into a 16x16 grid with still the closest 9
# smaller grids with the players grid always in the middle". The game keeps the 3 x 3 tiles round her loaded
# (world/island/tileStreamer.ts): with 7 km tiles that was 21 x 21 km of ground, with 3.5 km tiles 10.5 x 10.5 km, a
# quarter. Nothing new is downloaded from anywhere: each 513 x 513 picture of Beyond Extinction's (public/island/kauai/
# height/, copied from Beyond Extinction and never edited) is cut into its four quarters, 257 x 257 each.
#
# WHY 257 AND NOT 256: a tile's picture holds its edges on both sides (513 = 512 squares + 1), so the middle row and
# column (number 256) belong to both halves, exactly as neighbouring 7 km tiles already share their edge rows. Every
# height in the new pictures is a height of the old ones, untouched: the colours are copied pixel for pixel (a PNG
# keeps them exactly; the heights are coded in the colours: Terrarium, metres = R*256 + G + B/256 - 32768).
#
# OUT: public/island/kauai/height16/<column letter A..P><row 1..16>.png and public/island/kauai/manifest16.json, the
# same shape as manifest.json (tileSizeM 3500, tilePixels 257). The script checks every cut against its source.
#
# Run from Game/:   python3 scripts/make_island_tiles16.py
# =====================================================================================================================
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
KAUAI = os.path.join(HERE, '..', 'public', 'island', 'kauai')
OUT_DIR = os.path.join(KAUAI, 'height16')


def main() -> None:
    with open(os.path.join(KAUAI, 'manifest.json')) as f:
        manifest = json.load(f)
    P = manifest['tilePixels']          # 513
    S = manifest['tileSizeM']           # 7000
    if P % 2 != 1:
        sys.exit(f'tilePixels {P} is not odd: the halves could not share their middle row')
    half = (P - 1) // 2                 # 256: the middle row and column, shared by both halves
    Q = half + 1                        # 257 pixels a side in the new tiles
    os.makedirs(OUT_DIR, exist_ok=True)

    tiles = []
    for t in manifest['tiles']:
        source = Image.open(os.path.join(KAUAI, t['file']))
        if source.mode != 'RGB':
            source = source.convert('RGB')
        if source.size != (P, P):
            sys.exit(f"{t['file']} is {source.size}, not {P} x {P}")
        for dj in (0, 1):               # 0 the north half, 1 the south half (pictures run north to south)
            for di in (0, 1):           # 0 the west half, 1 the east half
                col, row = t['col'] * 2 + di, t['row'] * 2 + dj
                tile_id = chr(65 + col) + str(row + 1)
                box = (di * half, dj * half, di * half + Q, dj * half + Q)
                part = source.crop(box)
                file = f'height16/{tile_id}.png'
                part.save(os.path.join(KAUAI, file), optimize=True)
                # (checked: read back, every pixel the same as the source's)
                back = Image.open(os.path.join(KAUAI, file)).convert('RGB')
                if back.tobytes() != part.tobytes():
                    sys.exit(f'{file} did not read back the same')
                tiles.append({'id': tile_id, 'col': col, 'row': row, 'file': file, 'from': t['file']})

    tiles.sort(key=lambda x: (x['row'], x['col']))
    out = {
        'name': manifest.get('name', 'kauai'),
        'source': manifest.get('source', ''),
        'madeBy': 'scripts/make_island_tiles16.py: each 7 km tile of manifest.json cut into its four 3.5 km quarters',
        'grid': {'cols': 16, 'rows': 16, 'A1': 'north-west; col A->P = west->east; row 1->16 = north->south'},
        'tileSizeM': S / 2,
        'totalM': manifest.get('totalM', S * 8),
        'tilePixels': Q,
        'encoding': manifest.get('encoding', ''),
        'tiles': tiles,
    }
    if 'spawn' in manifest:
        out['spawn'] = manifest['spawn']
    with open(os.path.join(KAUAI, 'manifest16.json'), 'w') as f:
        json.dump(out, f, indent=1)
    sizes = [os.path.getsize(os.path.join(KAUAI, x['file'])) for x in tiles]
    print(f'{len(tiles)} tiles of {Q} x {Q} ({S / 2:.0f} m), {sum(sizes) / 1048576:.1f} MB in all, '
          f'{sum(sizes) / len(sizes) / 1024:.0f} KB each on average, the largest {max(sizes) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
