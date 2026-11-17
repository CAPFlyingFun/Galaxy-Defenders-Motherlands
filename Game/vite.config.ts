// Galaxy Defenders: Motherlands -- the game's build.
//
// Two folders sit side by side in this repo:
//   Game/    everything we build (this project)
//   Char_B/  a copy of the Custom Character Builder System, never edited by hand
//
// The game reads the builder's code through the "@charb" alias (-> ../Char_B/src), and both use ONE copy of
// three.js (the game's), so a mesh made by the builder's code is the same kind of object the game draws.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative paths, so the same build works at capflyingfun.github.io/Galaxy-Defenders-Motherlands/ and locally.
  base: './',
  resolve: {
    alias: [
      { find: /^@charb\//, replacement: here('../Char_B/src') + '/' },
      // Char_B has no node_modules of its own: its `import 'three'` must land on the game's copy.
      { find: /^three$/, replacement: here('./node_modules/three/build/three.module.js') },
      { find: /^three\//, replacement: here('./node_modules/three') + '/' },
    ],
    dedupe: ['three'],
  },
  server: { fs: { allow: [here('..')] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
