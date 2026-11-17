#!/usr/bin/env python3
# ============================================================================
# bake_heroine.py -- bake a look into Game/public/heroines/<look>/ .
#
# A DEV SCRIPT. It opens the bake page (bake.html, src/bake/bakeLook.ts) in a
# browser, waits for the Character Builder to dress her and for the bake to
# finish, and saves the five files the page made.
#
#   1. in one terminal:   cd Game && npm run dev            (note the address it prints)
#   2. in another:        python3 scripts/bake_heroine.py blazeSuit
#
#   --url   the dev server's address          (default http://localhost:5173)
#   --cdp   use a Chrome that is already running with --remote-debugging-port (e.g. http://127.0.0.1:9334)
#   --chrome  the browser to start otherwise   (default /usr/bin/google-chrome; "" = Playwright's own)
#
# Needs Python's Playwright (pip install playwright). Without it, do step 2 by hand: open
# <address>/bake.html?look=blazeSuit, wait for "Baked", press the five download buttons and move the files.
# ============================================================================
import argparse, base64, os, sys
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("look")
parser.add_argument("--url", default="http://localhost:5173")
parser.add_argument("--cdp", default="")
parser.add_argument("--chrome", default="/usr/bin/google-chrome")
args = parser.parse_args()

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "heroines", args.look)

with sync_playwright() as p:
    if args.cdp:
        browser = p.chromium.connect_over_cdp(args.cdp)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
    else:
        # (software drawing is allowed, so this also works on a machine with no graphics card; it is only slower)
        browser = p.chromium.launch(executable_path=args.chrome or None, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page()
    page.set_default_timeout(600000)
    page.on("console", lambda m: print("  page:", m.text) if m.text.startswith("[bake]") else None)
    page.goto(f"{args.url}/bake.html?look={args.look}")
    page.wait_for_function("window.gdmBake || window.gdmBakeError")
    error = page.evaluate("window.gdmBakeError || ''")
    if error:
        sys.exit("The bake failed: " + error)
    files = page.evaluate("window.gdmBake.files")
    os.makedirs(out, exist_ok=True)
    for name, data in files.items():
        with open(os.path.join(out, name), "wb") as f:
            f.write(base64.b64decode(data))
        print(f"wrote {os.path.join(out, name)} ({os.path.getsize(os.path.join(out, name)) // 1024} KB)")
    if not args.cdp:
        browser.close()
