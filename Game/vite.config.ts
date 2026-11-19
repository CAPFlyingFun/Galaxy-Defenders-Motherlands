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
// Two stores, each named after a fingerprint of what it holds, so a store is replaced only when its files change:
//   gdm-app-<fingerprint>    the game's own pages, code and small files. Fetched and kept as the app installs.
//   gdm-charb-<fingerprint>  the Character Builder's files (her body, skin, hair: about 34 MB). Kept the first time
//                            each is asked for. A push that only changes game code leaves this store alone, so her
//                            big files are NOT downloaded again.
// The page itself (index.html) is asked from the network first, so a new version shows the next time the app is
// opened online; with no signal the stored page is used and the game still starts.
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
      const fingerprint = (list: string[]) => {
        const hash = createHash('sha256');
        for (const f of [...list].sort()) hash.update(f).update(readFileSync(join(dist, f)));
        return hash.digest('hex').slice(0, 12);
      };
      // (the island's 30 MB of ground tiles are kept as they are first used, like her big files: its own store)
      const app = files.filter((f) => !f.startsWith('charb/') && !f.startsWith('island/'));
      const charbFiles = files.filter((f) => f.startsWith('charb/'));
      const islandFiles = files.filter((f) => f.startsWith('island/'));
      const sw = `// Written by the build (vite.config.ts, pwa()). Do not edit: it is replaced on every build.
const APP = 'gdm-app-${fingerprint(app)}';
const CHARB = 'gdm-charb-${fingerprint(charbFiles)}';
const ISLAND = 'gdm-island-${fingerprint(islandFiles)}';
const APP_FILES = ${JSON.stringify(['./', ...app.filter((f) => f !== 'index.html')])};

// Installing: fetch the game's own files and keep them. (Her big files are kept later, as they are first used.)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

// Taking over: throw away the stores of older versions of THIS game (other sites' stores are left alone).
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((n) => (n.startsWith('gdm-app-') && n !== APP) || (n.startsWith('gdm-charb-') && n !== CHARB) || (n.startsWith('gdm-island-') && n !== ISLAND)).map((n) => caches.delete(n)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  // A page: the network first (so a new version arrives), the stored page when there is no signal.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(APP).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))));
    return;
  }

  // Everything else: the stored copy if there is one; otherwise the network, and keep what comes back.
  const store = url.pathname.includes('/charb/') ? CHARB : url.pathname.includes('/island/') ? ISLAND : APP;
  event.respondWith(caches.open(store).then((cache) => cache.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
    if (response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  }))));
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
      console.log(`[pwa] wrote dist/sw.js: ${app.length} app files kept at install, ${charbFiles.length} builder files and ${islandFiles.length} island files kept on first use`);
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
