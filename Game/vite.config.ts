// Galaxy Defenders: Motherlands -- the game's build.
//
// Two folders sit side by side in this repo:
//   Game/    everything we build (this project)
//   Char_B/  a copy of the Custom Character Builder System, never edited by hand
//
// The game reads the builder's code through the "@charb" alias (-> ../Char_B/src), and both use ONE copy of
// three.js (the game's), so a mesh made by the builder's code is the same kind of object the game draws.
//
// THE BUILDER'S MODELS AND PICTURES are not copied into Game/ by hand either. The `charb()` plugin below:
//   * in `npm run dev`, serves ../Char_B/public under the fixed address `charb/` (charb/models/..., charb/paint/...);
//   * in `npm run build`, copies ONLY the files named in `charb-files.json` (the ones the heroine really loads)
//     into dist/charb/, and not the builder's whole 104 MB public folder;
//   * points the builder's one asset loader (Char_B/src/assets/assets.ts) at `charb/` instead of the page's root.
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The builder's public folder (its models, textures and painted-garment pictures). */
const CHARB_PUBLIC = here('../Char_B/public');
/** The builder's source folder, as Vite names files in it (forward slashes). */
const CHARB_SRC = here('../Char_B/src').split(sep).join('/');
/** The address the builder's files are served under, next to the game's page. */
const CHARB_URL = 'charb/';

/**
 * THE FILES THE HEROINE LOADS, relative to Char_B/public (charb-files.json). Only these go into the built game.
 * If the builder is re-copied and starts asking for a file that is not listed, the dev server says so in its
 * terminal (see `configureServer`), and http://localhost:<port>/__charb-requested lists everything asked for so far.
 */
const CHARB_FILES: string[] = JSON.parse(readFileSync(here('./charb-files.json'), 'utf8')).files;

/** The content type a browser expects for each kind of file the builder serves. */
const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.json': 'application/json', '.wasm': 'application/wasm', '.js': 'text/javascript',
};
const typeOf = (file: string): string => TYPES[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';

/**
 * A short fingerprint of each listed file's contents, and its size. The builder's loader adds the fingerprint to
 * the file's address (`?r=1a2b3c4d`), so a phone that kept an old copy of a model fetches the new one after an
 * update, and keeps what did not change. Only worked out for a real build: the dev server always serves fresh files.
 */
function fingerprints(): { rev: Record<string, string>; size: Record<string, number> } {
  const rev: Record<string, string> = {}, size: Record<string, number> = {};
  for (const file of CHARB_FILES) {
    const full = join(CHARB_PUBLIC, file);
    if (!existsSync(full)) continue;
    rev[file] = createHash('sha1').update(readFileSync(full)).digest('hex').slice(0, 8);
    size[file] = statSync(full).size;
  }
  return { rev, size };
}

function charb(): Plugin {
  let outDir = here('./dist');
  let building = false;
  return {
    name: 'galaxy-defenders-charb',
    // (before Vite's own handling of `import.meta.env`, so the text we look for is still as the builder wrote it)
    enforce: 'pre',

    config(_config, env) {
      building = env.command === 'build';
      const { rev, size } = building ? fingerprints() : { rev: {}, size: {} };
      const version = (JSON.parse(readFileSync(here('../Char_B/package.json'), 'utf8')) as { version: string }).version;
      return {
        // The constants the builder's own build writes into its code (Char_B/src/env.d.ts says what each is).
        define: {
          __APP_VERSION__: JSON.stringify(version),
          __BUILD_COMMIT__: JSON.stringify('in-game'),
          __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
          __RELAY_URL__: JSON.stringify(''),
          __PUBLIC_REV__: JSON.stringify(rev),
          __PUBLIC_SIZE__: JSON.stringify(size),
        },
      };
    },

    configResolved(config) { outDir = normalize(join(config.root, config.build.outDir)); },

    /**
     * The builder's loader builds every address from the page's base (`import.meta.env.BASE_URL`), which in its own
     * site is where its public folder sits. Here its files sit one folder down, in `charb/`, so that one read is
     * changed as the file goes by (the file on disk is never touched). If a re-copied builder no longer reads the
     * base there, the build stops with a message, not with a heroine whose files are quietly missing.
     */
    transform(code, id) {
      const file = id.split('?')[0].split(sep).join('/');
      if (!file.startsWith(CHARB_SRC + '/')) return null;
      if (!code.includes('import.meta.env.BASE_URL')) {
        if (file.endsWith('/assets/assets.ts')) this.error('Char_B/src/assets/assets.ts no longer reads import.meta.env.BASE_URL: the charb() plugin in Game/vite.config.ts must be updated so the builder still finds its files under charb/.');
        return null;
      }
      return { code: code.replaceAll('import.meta.env.BASE_URL', `(import.meta.env.BASE_URL + ${JSON.stringify(CHARB_URL)})`), map: null };
    },

    /** `npm run dev`: charb/<file> is read straight out of ../Char_B/public. */
    configureServer(server) {
      const asked = new Set<string>();
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/__charb-requested') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: [...asked].sort(), notListed: [...asked].filter((f) => !CHARB_FILES.includes(f)).sort() }, null, 2));
          return;
        }
        if (!url.startsWith('/' + CHARB_URL)) { next(); return; }
        const file = decodeURIComponent(url.slice(CHARB_URL.length + 1));
        const full = normalize(join(CHARB_PUBLIC, file));
        // (never out of the builder's public folder, whatever the address says)
        if (!full.startsWith(CHARB_PUBLIC + sep) || !existsSync(full) || !statSync(full).isFile()) { res.statusCode = 404; res.end(`not in Char_B/public: ${file}`); return; }
        if (!asked.has(file)) {
          asked.add(file);
          if (!CHARB_FILES.includes(file)) server.config.logger.warn(`[charb] "${file}" was asked for but is not in Game/charb-files.json: add it, or the built game will not have it.`);
        }
        res.setHeader('Content-Type', typeOf(full));
        res.setHeader('Content-Length', String(statSync(full).size));
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(full).pipe(res);
      });
    },

    /** `npm run build`: the listed files are copied into dist/charb/, and a missing one stops the build. */
    closeBundle() {
      if (!building) return;
      let bytes = 0;
      for (const file of CHARB_FILES) {
        const from = join(CHARB_PUBLIC, file), to = join(outDir, CHARB_URL, file);
        if (!existsSync(from)) throw new Error(`[charb] Game/charb-files.json names "${file}", which is not in Char_B/public.`);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        bytes += statSync(from).size;
      }
      console.log(`[charb] copied ${CHARB_FILES.length} of the builder's files into dist/${CHARB_URL} (${(bytes / 1048576).toFixed(1)} MB)`);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// THE GAME AS AN APP (a PWA; Joshua, 2026-11-16: "save it as an app ... almost everything already held locally").
//
// After the build, this writes dist/sw.js: a small "service worker", a script the browser keeps running beside the
// page, which answers the page's requests for files from a store ON THE DEVICE instead of the network.
//
// Two stores:
//   gdm-app-<fingerprint>   the game's own pages, code and small files (about 4.4 MB). Fetched and kept as a new
//                           version installs. The page itself (index.html) is asked from the network first, so a new
//                           version shows the next time the app is opened online; with no signal the stored page is
//                           used and the game still starts.
//   gdm-files               the BIG files: her outfits (heroines/, fabrics/, thumbs/), the Character Builder's files
//                           (charb/: her body, skin, hair) and the island (island/). Kept the first time each is asked
//                           for, ONE ENTRY PER FILE AND ITS CONTENTS: the build writes a fingerprint of every one of
//                           them into sw.js (`HASHES`), and a stored copy is used only while its fingerprint is the
//                           current one. So a push that changes one outfit's pictures re-downloads only those pictures;
//                           every other file on the phone stays (Joshua, 2026-11-21: "when a new push goes out, I think
//                           it should probably only update the files that changed"). Before, the whole outfit store
//                           (or builder, or island store) was thrown away whenever any one of its files changed.
//                           OUTFITS: ONLY THE ONES WORN NOW ARE KEPT (v0.2.143; Joshua, 2026-11-22): the game tells the
//                           worker which outfit folders are worn ('gdm-keep-outfits': her outfit and John's, a few
//                           seconds into play and after every change of outfit), and every other outfit's files are
//                           let go; wearing one again fetches it again.
//
// A NEW VERSION'S INSTALL WAITS FOR THE GAME (Joshua, 2026-11-21: after v0.2.137 it crashed three times in a row near
// the end of loading, then ran). Safari itself checks for a new sw.js every time the app is opened, so a new version's
// install ALWAYS started while the game was loading. Now it WAITS until the page says the game is up ('gdm-up',
// main.ts; or 90 s at most), then, one file at a time:
//   - the game's own files: a file under assets/ whose name has not changed IS the same file (its name carries a
//     fingerprint of its contents): copied from the old store; only new names and the few files that keep their names
//     (the page, the icons, the dome model) are fetched, past the browser's own cache;
//   - the big files kept by an older version (the old gdm-looks-/gdm-charb-/gdm-island- stores, before v0.2.139): each
//     is checked against its fingerprint ONCE (SHA-256, in the worker) and kept in gdm-files if it is the same, so
//     nothing that did not change is downloaded again.
// Taking over, it deletes the old stores and any gdm-files entry whose contents are no longer the current ones.
// (The stores are on the phone's storage, not in its memory: an old and a new copy never add up in the game's memory.)
// ---------------------------------------------------------------------------------------------------------------------
function pwa(): Plugin {
  /** Every file under `dir`, as paths relative to it with forward slashes. */
  const walk = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
  return {
    name: 'gdm-pwa',
    apply: 'build',
    enforce: 'post', // after charb() has copied the builder's files into dist/charb/
    closeBundle() {
      const dist = here('./dist');
      if (!existsSync(dist)) return;
      const files = walk(dist).filter((f) => f !== 'sw.js');
      /** A fingerprint of one file's contents (the first 16 hex digits of its SHA-256: the worker works out the same). */
      const hashOf = (f: string) => createHash('sha256').update(readFileSync(join(dist, f))).digest('hex').slice(0, 16);
      const fingerprint = (list: string[]) => {
        const hash = createHash('sha256');
        for (const f of [...list].sort()) hash.update(f).update(readFileSync(join(dist, f)));
        return hash.digest('hex').slice(0, 12);
      };
      // (the test and bake pages are not kept at all)
      const LAB_PAGES = ['armor-lab.html', 'bake.html', 'flora-lab.html', 'heroine-lab.html', 'vitals-lab.html'];
      // THE BIG FILES, kept as they are first used, each by its own fingerprint: her outfits, fabrics and their pictures
      // in Settings (about 135 small ones), the builder's files, the island's tiles, the sounds (audio/: her breathing)
      const isBig = (f: string) => /^(heroines|fabrics|thumbs|charb|island|audio)\//.test(f);
      const app = files.filter((f) => !isBig(f) && !LAB_PAGES.includes(f));
      const big = files.filter(isBig);
      const hashes: Record<string, string> = {};
      // THE ISLAND'S HEIGHT TILES ARE FINGERPRINTED BY FOLDER (v0.2.166): with the 32 x 32 and 64 x 64 grids there are
      // about 5,600 of them, and a line each made sw.js about 360 KB, which the phone fetches on every open. They are
      // the real island's heights, cut up, and never change: one fingerprint for each folder's whole contents does.
      const tileFolder = (f: string) => /^island\/kauai\/height\d*\//.exec(f)?.[0];
      for (const f of big) if (!tileFolder(f)) hashes[f] = hashOf(f);
      for (const folder of new Set(big.map(tileFolder).filter((f): f is string => !!f))) hashes[folder] = fingerprint(big.filter((f) => f.startsWith(folder)));
      const sw = `// Written by the build (vite.config.ts, pwa()). Do not edit: it is replaced on every build.
const APP = 'gdm-app-${fingerprint(app)}';
const FILES = 'gdm-files';
const APP_FILES = ${JSON.stringify(['./', ...app.filter((f) => f !== 'index.html')])};
// Every big file and the fingerprint of its contents (the first 16 hex digits of its SHA-256)
const HASHES = ${JSON.stringify(hashes)};
// (where this game lives: the worker's own folder)
const SCOPE = new URL('./', self.location).pathname;
/** A big file's key in gdm-files: its path and the fingerprint of its contents. */
const keyOf = (path, hash) => SCOPE + path + '?h=' + hash;
/** A file's path in the game (from a full address): 'heroines/blaze/albedo.ktx2', or null if it is not the game's. */
const pathOf = (url) => (url.origin === self.location.origin && url.pathname.startsWith(SCOPE) ? decodeURIComponent(url.pathname.slice(SCOPE.length)) : null);
/** A big file's fingerprint: its own, or its folder's (the island's height tiles: one for each folder). */
const fingerprintFor = (path) => (path === null ? undefined : HASHES[path] || HASHES[(/^island\\/kauai\\/height\\d*\\//.exec(path) || [''])[0]]);
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// THE GAME IS UP: the page says so once it is playing (main.ts, 'gdm-up'); an install waits for it (or 90 s at most)
let gameIsUp;
const gameUp = new Promise((up) => { gameIsUp = up; });
self.addEventListener('message', (event) => {
  if (event.data === 'gdm-up') gameIsUp();
  // ONLY THE OUTFITS WORN NOW ARE KEPT (Joshua, 2026-11-22): the game says which outfit folders are worn (main.ts
  // \`keepWornOutfits\`); every other outfit's files are let go (fetched again if that outfit is worn again)
  else if (event.data && event.data.type === 'gdm-keep-outfits' && Array.isArray(event.data.folders)) {
    event.waitUntil(keepOnlyOutfits(new Set(event.data.folders)));
  }
});
const UP_WAIT_MS = 90000;
/** Let go of every kept outfit file (heroines/<folder>/...) whose folder is not in \`worn\`. */
async function keepOnlyOutfits(worn) {
  const files = await caches.open(FILES);
  let dropped = 0;
  for (const request of await files.keys()) {
    const path = pathOf(new URL(request.url));
    const folder = path && /^heroines\\/([^/]+)\\//.exec(path);
    if (folder && !worn.has(folder[1])) { await files.delete(request); dropped++; }
  }
  console.log('[sw] outfits kept: ' + [...worn].join(', ') + (dropped ? '; ' + dropped + ' files of others let go' : ''));
}

// Installing, once the game is up (one file at a time, gently):
self.addEventListener('install', (event) => {
  event.waitUntil(Promise.race([gameUp, new Promise((later) => setTimeout(later, UP_WAIT_MS))]).then(async () => {
    // 1. THE GAME'S OWN FILES: a file under assets/ with the same name as before is the same file: copied from the old
    //    store. Anything else is fetched past the browser's own cache.
    const cache = await caches.open(APP);
    const names = await caches.keys();
    const olderApp = names.filter((name) => name.startsWith('gdm-app-') && name !== APP);
    let copied = 0, fetched = 0;
    for (const file of APP_FILES) {
      if (await cache.match(file)) continue;   // (kept already: an install that was stopped and started again)
      let kept = null;
      if (file.startsWith('assets/')) {
        for (const name of olderApp) { kept = await (await caches.open(name)).match(file); if (kept) break; }
      }
      if (kept) { await cache.put(file, kept); copied++; continue; }
      const response = await fetch(file, { cache: 'no-cache' });
      if (!response.ok) throw new Error('could not fetch ' + file + ' (' + response.status + ')');   // (tried again next time)
      await cache.put(file, response);
      fetched++;
    }
    // 2. THE BIG FILES AN OLDER VERSION KEPT (its gdm-looks-, gdm-charb-, gdm-island- stores): each checked against its
    //    fingerprint once, and kept if it is the same
    const files = await caches.open(FILES);
    let kept = 0;
    for (const name of names.filter((n) => /^gdm-(looks|charb|island)-/.test(n))) {
      const old = await caches.open(name);
      for (const request of await old.keys()) {
        const path = pathOf(new URL(request.url));
        const hash = path && fingerprintFor(path);
        if (!hash || await files.match(keyOf(path, hash))) continue;
        const response = await old.match(request);
        if (!response || !response.ok) continue;
        const body = await response.arrayBuffer();
        if (hex(await crypto.subtle.digest('SHA-256', body)).slice(0, 16) !== hash) continue;   // (changed: fetched when asked)
        await files.put(keyOf(path, hash), new Response(body, { headers: response.headers }));
        kept++;
      }
    }
    console.log('[sw] new version kept: ' + fetched + ' files fetched, ' + copied + ' unchanged files copied, ' + kept + ' big files kept');
    await self.skipWaiting();
  }));
});

// Taking over: throw away older stores of THIS game (other sites' stores are left alone) and every big file whose
// contents are no longer the current ones.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => (n.startsWith('gdm-app-') && n !== APP) || /^gdm-(looks|charb|island)-/.test(n)).map((n) => caches.delete(n)));
    const files = await caches.open(FILES);
    for (const request of await files.keys()) {
      const url = new URL(request.url);
      // (kept only while its fingerprint is the current one for its path)
      if (fingerprintFor(pathOf(url)) !== url.searchParams.get('h')) await files.delete(request);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = pathOf(url);
  if (path === null) return;

  // A page: the network first (so a new version arrives), the stored page when there is no signal.
  // (ASKED PAST THE BROWSER'S OWN CACHE, 'no-store': GitHub Pages lets a browser keep a page 10 minutes, and Joshua's
  //  iPhone opened v0.2.127's loading screen, then an older page with v0.2.126's code: 2026-11-21. The code files have
  //  new names each build, so only the page itself must never be an old copy.)
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).then((response) => {
      const copy = response.clone();
      // (the worker is kept alive until the copy is stored; a full store is not a reason to fail the page)
      event.waitUntil(caches.open(APP).then((cache) => cache.put(request, copy)).catch(() => {}));
      return response;
    }).catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))));
    return;
  }

  // A BIG FILE: the stored copy of THESE contents if there is one; otherwise the network, kept under its fingerprint.
  const hash = fingerprintFor(path);
  if (hash) {
    const key = keyOf(path, hash);
    event.respondWith(caches.open(FILES).then((files) => files.match(key).then((hit) => hit || fetch(request).then((response) => {
      // (kept while the worker waits for it; a full store only means it is fetched again next time)
      if (response.ok && response.status === 200) event.waitUntil(files.put(key, response.clone()).catch(() => {}));
      return response;
    }))));
    return;
  }

  // Anything else of the game's: the stored copy if there is one; otherwise the network, and keep what comes back.
  event.respondWith(caches.open(APP).then((cache) => cache.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
    if (response.ok && response.status === 200) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    return response;
  }))));
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
      console.log(`[pwa] wrote dist/sw.js: ${app.length} app files kept at install; ${big.length} big files (outfits, builder, island) kept on first use, each by its own fingerprint (the island's height tiles by folder)`);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// THE VERSION shown in the game's Settings (src/ui/versionTag.ts), so Joshua can tell at a glance whether his phone has
// the newest build. Three parts, worked out once here as the game is built and written into the code as plain text:
//   the version number  from package.json ("version"); raised by hand with each update that is pushed
//   the build's commit  the short name of the exact saved state of the code it was built from
//   the build's time    when it was built, in US Central time (Joshua's)
// ---------------------------------------------------------------------------------------------------------------------
const appVersion = (JSON.parse(readFileSync(here('./package.json'), 'utf8')) as { version: string }).version;
let appCommit = 'local';
try { appCommit = execSync('git rev-parse --short HEAD', { cwd: here('.'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout: "local" */ }
const appBuilt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());

export default defineConfig({
  define: {
    __GDM_VERSION__: JSON.stringify(appVersion),
    __GDM_COMMIT__: JSON.stringify(appCommit),
    __GDM_BUILT__: JSON.stringify(appBuilt),
  },
  // Relative paths, so the same build works at capflyingfun.github.io/Galaxy-Defenders-Motherlands/ and locally.
  base: './',
  plugins: [charb(), pwa()],
  resolve: {
    alias: [
      { find: /^@charb\//, replacement: here('../Char_B/src') + '/' },
      // Char_B has no node_modules of its own: its `import 'three'` must land on the game's copy.
      { find: /^three$/, replacement: here('./node_modules/three/build/three.module.js') },
      { find: /^three\//, replacement: here('./node_modules/three') + '/' },
      // (the builder's export zip, v0.9.45: its `import 'fflate'` lands on the game's copy the same way)
      { find: /^fflate$/, replacement: here('./node_modules/fflate/esm/browser.js') },
    ],
    dedupe: ['three'],
  },
  server: { fs: { allow: [here('..')] } },
  // (the builder smooths her skin's creases in a web worker, which is its own small module bundle)
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      // Every .html page in Game/ is built: the game (index.html) and the dev test pages beside it
      // (heroine-lab.html: the body alone, with buttons). A new page needs no change here.
      input: Object.fromEntries(readdirSync(here('.')).filter((f) => f.endsWith('.html')).map((f) => [f === 'index.html' ? 'main' : f.replace(/\.html$/, ''), here('./' + f)])),
    },
  },
});
