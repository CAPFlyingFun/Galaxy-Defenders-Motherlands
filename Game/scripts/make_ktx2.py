#!/usr/bin/env python3
# ============================================================================
# make_ktx2.py -- PACK A LOOK'S BIG PICTURES for the graphics chip (KTX2, Basis UASTC), and check they look the same.
#
# Joshua, 2026-11-21: "Do the compression of the textures first, as long as it looks the same." Each baked look's
# four pictures are kept as WebP (small to download) and unpacked by the phone to 4 bytes a pixel on its graphics chip:
#   albedo.webp      4096  her colour                 89 MB on the chip
#   skinHeight.webp  4096  her skin's depth (a bump)  89 MB
#   normal.webp      2048  her fine surface detail    22 MB
#   surface.webp     1024  her shine (roughness)      5.6 MB      about 206 MB a character
# Packed (UASTC, turned into ASTC on the iPhone, BC7 on a computer) they are a quarter of that: about 51 MB.
#
# For each look folder in public/heroines/ this writes, beside the WebP files (which stay: the bake scripts read them):
#   albedo.ktx2, skinHeight.ktx2, normal.ktx2, surface.ktx2   (scripts/ktx2_encode.mjs)
#   albedo-small.webp   her colour at 1024: the ONE thing the game reads on the CPU (beltGear.ts finds her waistband
#                       trim in it); a packed picture cannot be read back
# and adds to its look.json:  "packed": { the file names, "packedAt": when }  (bakedLook.ts loads them when it is there).
# Every packed picture is decoded back and compared with its original (PSNR); a look under MIN_PSNR is NOT marked
# packed (the game keeps its WebP pictures for it).
#
# Re-run for a look after re-baking it (bake_heroine.py) or remaking its skin height (make_skin_height.py):
#   python3 scripts/make_ktx2.py               every look
#   python3 scripts/make_ktx2.py blaze john    only these
# Needs Pillow and numpy (Python) and `npm install` in Game/ (ktx2-encoder; three's transcoder for the check).
# Two pictures are packed at a time; a 4096 picture takes about a minute.
# ============================================================================
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np
from PIL import Image

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROINES = os.path.join(GAME, 'public', 'heroines')
ENCODE = os.path.join(GAME, 'scripts', 'ktx2_encode.mjs')
DECODE = os.path.join(GAME, 'scripts', 'ktx2_decode.cjs')

# (name, holds colours, is a normal map)
PICTURES = [('albedo', True, False), ('skinHeight', False, False), ('normal', False, True), ('surface', False, False)]
# The least a packed picture may differ from its original and still count as "the same" (dB; about 40 is where a
# difference starts to be seen; Blaze's are 49-66)
MIN_PSNR = 45.0
# Her colour at this size for the CPU (beltGear.ts reads it at 1024)
SMALL = 1024


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = float(((a.astype(np.float64) - b.astype(np.float64)) ** 2).mean())
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def pack_one(folder: str, name: str, colour: bool, normal_map: bool, work: str) -> tuple[str, float, float]:
    """Pack one picture; decode it back and compare. Returns (name, megabytes, PSNR)."""
    source = os.path.join(folder, f'{name}.webp')
    image = Image.open(source).convert('RGBA')
    raw = os.path.join(work, f'{name}.rgba')
    with open(raw, 'wb') as f:
        f.write(image.tobytes())   # (4 bytes a pixel, R G B A, the top row first)
    out = os.path.join(folder, f'{name}.ktx2')
    subprocess.run(['node', ENCODE, raw, str(image.width), str(image.height), out, '1' if colour else '0', '1' if normal_map else '0'],
                   check=True, cwd=GAME)
    back = os.path.join(work, f'{name}.back.rgba')
    subprocess.run(['node', DECODE, out, back], check=True, cwd=GAME, stdout=subprocess.DEVNULL)
    original = np.frombuffer(image.tobytes(), np.uint8).reshape(image.height, image.width, 4)[:, :, :3]
    decoded = np.fromfile(back, np.uint8).reshape(image.height, image.width, 4)[:, :, :3]
    return name, os.path.getsize(out) / 1048576, psnr(original, decoded)


def pack_look(look: str) -> None:
    folder = os.path.join(HEROINES, look)
    manifest_path = os.path.join(folder, 'look.json')
    if not os.path.exists(manifest_path):
        return
    todo = [(n, c, m) for (n, c, m) in PICTURES if os.path.exists(os.path.join(folder, f'{n}.webp'))]
    print(f'{look}: packing {", ".join(n for n, _, _ in todo)}')
    with tempfile.TemporaryDirectory() as work, ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda p: pack_one(folder, p[0], p[1], p[2], work), todo))
    worst = min(r[2] for r in results)
    for name, mb, quality in results:
        print(f'  {name}: {mb:.2f} MB, {quality:.1f} dB')
    # her colour at 1024 for the CPU (the belt's waistband)
    Image.open(os.path.join(folder, 'albedo.webp')).convert('RGB').resize((SMALL, SMALL), Image.BILINEAR).save(
        os.path.join(folder, 'albedo-small.webp'), quality=92, method=6)
    with open(manifest_path) as f:
        manifest = json.load(f)
    if worst < MIN_PSNR:
        print(f'  NOT marked packed: {worst:.1f} dB is under {MIN_PSNR} (the game keeps the WebP pictures)')
        manifest.pop('packed', None)
    else:
        manifest['packed'] = {name: f'{name}.ktx2' for name, _, _ in results}
        manifest['packed']['albedoSmall'] = 'albedo-small.webp'
        manifest['packed']['packedAt'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    looks = sys.argv[1:] or sorted(d for d in os.listdir(HEROINES) if os.path.isdir(os.path.join(HEROINES, d)))
    for look in looks:
        pack_look(look)
