#!/usr/bin/env python3
# ============================================================================
# make_island_tiles_n.py -- the island cut into SMALLER tiles, for the island
# grid setting (v0.2.166; Joshua, 2026-11-24: "add the grid size if possible
# adjustable from the 8x8, 16x16, 32x32, 64x64").
#
#   python3 scripts/make_island_tiles_n.py 32    ->  height32/  + manifest32.json
#   python3 scripts/make_island_tiles_n.py 64    ->  height64/  + manifest64.json
#
# As make_island_tiles16.py does for 16 x 16: each of Beyond Extinction's
# 7 km tiles (height/X/X1.png, 513 x 513, never edited) is cut into k x k
# pieces (k = grid / 8: 4 for 32, 8 for 64). Neighbouring pieces SHARE their
# edge row and column, as the island's tiles always have, so the heights meet
# exactly at every seam. No new detail: the same heights, in smaller files.
#   32 x 32: 1.75 km tiles, 129 x 129 pixels
#   64 x 64: 875 m tiles,    65 x  65 pixels
#
# TILE NAMES: a column letter and a row number, A1 in the north-west, as
# before; past 26 columns the letters go on as a spreadsheet's do (Z, AA, AB,
# ... BL for the 64th), because the old one-letter names ran into symbols.
# (tileStreamer.ts `tileIdOf` names them the same way.)
#
# Every piece is read back and checked against its part of the source.
# ============================================================================
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
KAUAI = os.path.join(HERE, '..', 'public', 'island', 'kauai')


def column_letters(col: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA, 63 -> BL (as a spreadsheet's columns)."""
    letters = ''
    n = col + 1
    while n > 0:
        n, rest = divmod(n - 1, 26)
        letters = chr(65 + rest) + letters
    return letters


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ('32', '64'):
        sys.exit('usage: make_island_tiles_n.py 32|64')
    grid = int(sys.argv[1])
    with open(os.path.join(KAUAI, 'manifest.json')) as f:
        manifest = json.load(f)
    P = manifest['tilePixels']          # 513
    S = manifest['tileSizeM']           # 7000
    source_across = manifest['grid']['cols']  # 8
    k = grid // source_across           # pieces across one source tile
    if (P - 1) % k != 0:
        sys.exit(f'{P - 1} does not divide into {k} pieces')
    step = (P - 1) // k                 # 128 or 64 squares a piece
    Q = step + 1                        # pixels a side: the edge shared with the next piece
    folder = f'height{grid}'
    os.makedirs(os.path.join(KAUAI, folder), exist_ok=True)

    tiles = []
    total_bytes = 0
    for t in manifest['tiles']:
        source = Image.open(os.path.join(KAUAI, t['file']))
        if source.mode != 'RGB':
            source = source.convert('RGB')
        if source.size != (P, P):
            sys.exit(f"{t['file']} is {source.size}, not {P} x {P}")
        for dj in range(k):             # north to south (pictures run north to south)
            for di in range(k):         # west to east
                col, row = t['col'] * k + di, t['row'] * k + dj
                tile_id = column_letters(col) + str(row + 1)
                box = (di * step, dj * step, di * step + Q, dj * step + Q)
                part = source.crop(box)
                file = f'{folder}/{tile_id}.png'
                path = os.path.join(KAUAI, file)
                part.save(path, optimize=True)
                # (checked: read back, every pixel the same as the source's)
                back = Image.open(path).convert('RGB')
                if back.tobytes() != part.tobytes():
                    sys.exit(f'{file} did not read back the same')
                total_bytes += os.path.getsize(path)
                tiles.append({'id': tile_id, 'col': col, 'row': row, 'file': file, 'from': t['file']})

    tiles.sort(key=lambda x: (x['row'], x['col']))
    out = {
        'name': manifest.get('name', 'kauai'),
        'source': manifest.get('source', ''),
        'madeBy': f'scripts/make_island_tiles_n.py {grid}: each 7 km tile of manifest.json cut into {k} x {k} pieces',
        'grid': {'cols': grid, 'rows': grid, 'A1': 'north-west; columns A, B, ... Z, AA, AB ... west->east; rows 1->'
                 f'{grid} north->south'},
        'tileSizeM': S / k,
        'totalM': manifest.get('totalM', S * source_across),
        'tilePixels': Q,
        'encoding': manifest.get('encoding', ''),
        'tiles': tiles,
    }
    if 'spawn' in manifest:
        out['spawn'] = manifest['spawn']
    with open(os.path.join(KAUAI, f'manifest{grid}.json'), 'w') as f:
        json.dump(out, f, indent=1)
    print(f'{len(tiles)} tiles of {Q} x {Q} ({S / k:.0f} m) in {folder}/, {total_bytes / 1e6:.1f} MB; manifest{grid}.json')


if __name__ == '__main__':
    main()
