# OUTFIT THUMBNAILS for Settings (Joshua, 2026-11-20): every look at five belly sizes, a small three-quarter picture
# each, written to Game/public/thumbs/<look>-<belly>.webp. Usage: python3 thumbs.py [look ...]
import sys, base64, io, os, time
# Needs the built game served on 5199 (npx vite preview --port 5199) and Chrome with Playwright. Re-run for a look after
# re-baking it (or a new look: add it to LOOKS below and to heroineSettings.ts OUTFIT_CHOICES).
from playwright.sync_api import sync_playwright
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'thumbs')
BELLIES = (10, 50, 80, 120, 150)
FAMILIES = ['bronzeSuit', 'catsuitGold', 'catsuitBlack', 'catsuitSilver', 'catsuitBlackGold', 'catsuitGoldBlack', 'catsuitBlackSilver']
LOOKS = sys.argv[1:] or (['blazeSuit', 'shadowSuit', 'spaceHeroine', 'blazeCatsuit', 'graySuit', 'blazePink'] + [f + s for f in FAMILIES for s in ('', 'Low', 'High')])
SHOT = r"""(belly) => { const L = window.heroineLab; L.hold(true); L.orbit.enabled = false; L.speed = 0; L.state.aim = false; L.heroine.aimAt(null); L.heroine.setFacing(null);
  L.heroine.setPregnant && L.heroine.setPregnant(true); L.heroine.setBelly(belly); L.step(150, 1/30);
  const R = L.heroine.root, a = R.rotation.y + 0.45, r = 2.75;
  L.camera.position.set(R.position.x + Math.sin(a) * r, 1.05, R.position.z + Math.cos(a) * r); L.camera.lookAt(R.position.x, 0.86, R.position.z);
  return L.picture(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for look in LOOKS:
        t = time.time()
        pg = b.new_page(viewport={'width': 240, 'height': 400}); pg.set_default_timeout(580000)
        pg.goto(f'http://localhost:5199/heroine-lab.html?heroine=fast&look={look}&detail=100'); pg.wait_for_function('window.heroineLab || window.heroineLabError'); pg.wait_for_timeout(3000)
        for belly in BELLIES:
            img = Image.open(io.BytesIO(base64.b64decode(pg.evaluate(SHOT, belly).split(',')[1]))).convert('RGB').resize((120, 200), Image.LANCZOS)
            img.save(os.path.join(OUT, f'{look}-{belly}.webp'), 'WEBP', quality=80)
        pg.close()
        print(look, round(time.time() - t), 's', flush=True)
    b.close()
print('THUMBS DONE')
