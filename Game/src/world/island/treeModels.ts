// ============================================================================
// treeModels.ts -- THE ISLAND'S PLANTS AS REAL 3D MODELS, made in code
// (Joshua, 2026-11-20: "real object trees... Real 3D trees close to her,
// with photo trees beyond"; "check TCS... full size trees and stuff... with
// realistic textures").
//
// One model for each kind the photo forest has (trees.ts SPECIES, in the same
// order), each ONE UNIT TALL standing on its foot at the origin, so a planted
// tree is the model stretched by its height and turned. Two pieces each:
//   WOOD     a tube along its trunk (and boughs), wrapped in a bark photo
//            (Thronemound's bark pictures, public/island/bark/) with its own
//            depth (normal map); a palm's trunk is ringed, drawn in code;
//   LEAVES   alpha-cut cards and fronds cut from ONE picture of leaves drawn
//            in code at load (a leafy clump, a conifer bough, a palm frond,
//            a fern frond), so no leaf pictures are downloaded.
// How it is built, following Thronemound's tree maker (its world/tree.ts):
// the trunk is a gently leaning, tapering tube that flares at its foot, boughs
// climb it on a golden-angle spiral and sweep up as they go out, and crowns
// are leaf clusters at the boughs' ends. Palms, ferns, cycads and sago palms
// are a rosette of curved, drooping fronds; a conifer is tiers of needle
// boughs narrowing to its tip; a bush is a ball of leaf cards.
//
// Two levels of detail per kind: NEAR (more sides, more leaves) and FAR (a
// light version for Objects only mode past 70 m).
// ============================================================================
import * as THREE from 'three';

/** The kinds, in trees.ts SPECIES order. */
export const KINDS = ['bush', 'palm', 'cycad', 'sago', 'fern', 'aspen', 'conifer'] as const;
export type Kind = (typeof KINDS)[number];

/**
 * THE TRUNKS, for walking into (GAME TUNING): each kind's trunk radius at its foot as a share of its height (none:
 * a fern or a bush is pushed through). A 13 m palm is 0.2 m round its foot; a 12 m broadleaf 0.3 m; a 14 m conifer 0.35 m.
 */
export const TRUNK_SHARE: Readonly<Record<Kind, number>> = { bush: 0, palm: 0.016, cycad: 0.03, sago: 0.025, fern: 0, aspen: 0.025, conifer: 0.025 };

/** A kind's two models: wood and leaves, near and far. */
export interface KindModels {
  near: { wood: THREE.BufferGeometry | null; leaves: THREE.BufferGeometry };
  far: { wood: THREE.BufferGeometry | null; leaves: THREE.BufferGeometry };
}

// ---- the leaf picture: four regions of one canvas ----------------------------------------------------------------
/** Where each leaf shape is in the leaf picture (u0, v0, u1, v1; v up). */
const ATLAS = {
  clump: [0, 0.5, 0.5, 1],       // top left: a leafy clump (broadleaf crowns, bushes)
  bough: [0.5, 0.5, 1, 1],       // top right: a conifer bough
  frond: [0, 0.25, 1, 0.5],      // a palm frond along the middle band
  fern: [0, 0, 1, 0.25],         // a fern frond along the bottom
} as const;

/** A steady random number generator (the same seed, the same plant). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * DRAW THE LEAF PICTURE (1024 x 1024, in code): leaves as small pointed ovals in several greens with a lighter
 * midrib, needles as fine strokes, fronds as a stem with leaflets either side. Alpha outside the leaves.
 */
export function drawLeafPicture(): THREE.DataTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const rand = rng(7);
  const greens = ['#2f5a1f', '#3b6b25', '#4a7a2c', '#2a4d1b', '#557f30', '#36632a'];
  const leaf = (x: number, y: number, len: number, wid: number, ang: number, colour: string): void => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
    g.strokeStyle = 'rgba(190,220,140,0.35)'; g.lineWidth = Math.max(1, wid * 0.12);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke();
    g.restore();
  };
  // (canvas y runs down; the texture's v runs up: region [u0,v0,u1,v1] is x u0..u1, y (1-v1)..(1-v0))
  const box = (r: readonly number[]) => ({ x: r[0] * size, y: (1 - r[3]) * size, w: (r[2] - r[0]) * size, h: (r[3] - r[1]) * size });
  // A LEAFY CLUMP: a few hundred leaves in a rough round, darker inside
  {
    const b = box(ATLAS.clump), cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = b.w * 0.46;
    for (let i = 0; i < 520; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * R;
      const shade = d / R;
      leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 26 + rand() * 18, 7 + rand() * 4, rand() * Math.PI * 2, greens[Math.min(greens.length - 1, Math.floor((shade * 0.7 + rand() * 0.3) * greens.length))]);
    }
  }
  // A CONIFER BOUGH: a stem down the middle, needles off both sides, shortening to the tip
  {
    const b = box(ATLAS.bough), x0 = b.x + b.w * 0.5;
    g.strokeStyle = '#4a3522'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x0, b.y + b.h); g.lineTo(x0, b.y + 8); g.stroke();
    for (let y = b.y + b.h - 6; y > b.y + 10; y -= 3) {
      const t = (b.y + b.h - y) / b.h, reach = (1 - t) * b.w * 0.46 + 12;
      for (const side of [-1, 1]) {
        g.strokeStyle = ['#1f4a2a', '#2a5a33', '#24502c', '#30633a'][Math.floor(rand() * 4)]; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + side * reach * (0.75 + rand() * 0.25), y - reach * 0.35); g.stroke();
      }
    }
  }
  // A FROND (palms, cycads, sago palms): a stem along it, long narrow leaflets angled forward, shortening at both ends
  const frond = (r: readonly number[], leaflet: number, gap: number, colours: string[]): void => {
    const b = box(r), y0 = b.y + b.h / 2;
    g.strokeStyle = '#6b6a2a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(b.x + 4, y0); g.lineTo(b.x + b.w - 6, y0); g.stroke();
    for (let x = b.x + 30; x < b.x + b.w - 10; x += gap) {
      const t = (x - b.x) / b.w, len = leaflet * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.85 + rand() * 0.3);
      // (each leaflet angled about 40 degrees forward of the stem, a little each way)
      for (const side of [-1, 1]) leaf(x, y0, len, 5, side * (0.7 + rand() * 0.15), colours[Math.floor(rand() * colours.length)]);
    }
  };
  frond(ATLAS.frond, 118, 9, ['#4c7a28', '#5a8a2e', '#46732a', '#62923a']);
  frond(ATLAS.fern, 112, 7, ['#3d6e26', '#4a7f2f', '#356322', '#558c35']);
  // NO BLACK EDGES: a canvas keeps nothing under a see-through pixel, so its colour reads black, and the smaller
  // copies the graphics chip makes for distance (mipmaps) blend that black into every leaf's edge (a near fern looked
  // nearly black). So the pixels are taken out, every see-through one given a leaf green, and handed over as they are
  // (flipped so the picture's top is up, as a canvas picture would be).
  const data = g.getImageData(0, 0, size, size).data;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = ((size - 1 - y) * size + x) * 4, to = (y * size + x) * 4;
      const seen = data[from + 3] > 0;
      pixels[to] = seen ? data[from] : 58;
      pixels[to + 1] = seen ? data[from + 1] : 96;
      pixels[to + 2] = seen ? data[from + 2] : 36;
      pixels[to + 3] = data[from + 3];
    }
  }
  const picture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.anisotropy = 4;
  picture.generateMipmaps = true;
  picture.minFilter = THREE.LinearMipmapLinearFilter;
  picture.magFilter = THREE.LinearFilter;
  picture.needsUpdate = true;
  return picture;
}

// ---- building blocks ---------------------------------------------------------------------------------------------
/** A growing model: positions, normals, uvs, colours, indices. */
class Mesher {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  get count(): number { return this.pos.length / 3; }
  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color): number {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const _a = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3();

/**
 * A TUBE along a line of points with a radius at each (a trunk or a bough), `sides` round, its bark tiled so one tile
 * covers `tile` units both ways (never stretched).
 */
function tube(m: Mesher, pts: THREE.Vector3[], radii: number[], sides: number, tile: number): void {
  const first = m.count;
  let run = 0;
  _u.set(1, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) run += pts[i].distanceTo(pts[i - 1]);
    // the ring stands square to the line here (between the sections either side)
    _t.copy(pts[Math.min(pts.length - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
    _u.addScaledVector(_t, -_u.dot(_t));
    if (_u.lengthSq() < 1e-8) _u.set(0, 0, 1).addScaledVector(_t, -_t.z);
    _u.normalize();
    _v.crossVectors(_t, _u);
    const around = Math.max(1, Math.round((2 * Math.PI * radii[0]) / tile));
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      _n.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_v, Math.sin(a));
      _a.copy(pts[i]).addScaledVector(_n, radii[i]);
      m.vertex(_a, _n, (s / sides) * around, run / tile, WHITE);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a0 = first + i * (sides + 1) + s, a1 = a0 + 1, b0 = a0 + sides + 1, b1 = b0 + 1;
      m.idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
}

/** A CARD: a flat quad of the leaf picture at `centre`, facing `normal`, `w` by `h`, from atlas region `r`. */
function card(m: Mesher, centre: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3, w: number, h: number, r: readonly number[], tint: THREE.Color): void {
  _u.crossVectors(up, normal).normalize();
  _v.crossVectors(normal, _u).normalize();
  const i0 = m.count;
  for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    _a.copy(centre).addScaledVector(_u, sx * w).addScaledVector(_v, sy * h);
    // (its normal leans out from the plant's middle, so a crown is lit as a round, not as flat cards)
    _n.copy(_a).setY(_a.y * 0.3).normalize().add(normal).normalize();
    m.vertex(_a, _n, sx < 0 ? r[0] : r[2], sy < 0 ? r[1] : r[3], tint);
  }
  m.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}

/**
 * A FROND: a ribbon from `base` out along `dir`, `len` long and `wid` wide, drooping as it goes (`droop`: how far its
 * tip falls, in lengths), cut from atlas region `r` (the frond lies along U).
 */
function frond(m: Mesher, base: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, droop: number, segs: number, r: readonly number[], tint: THREE.Color): void {
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const i0 = m.count;
  const along = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const rise = dir.y;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    // up and out, then over and down: a palm frond's arch
    const p = new THREE.Vector3().copy(base).addScaledVector(along, t * len * Math.sqrt(1 - rise * rise)).add(new THREE.Vector3(0, t * len * rise - droop * len * t * t, 0));
    // its leaflets tilt up a little at the sides (a shallow V), so it is never a flat strip
    const tip = new THREE.Vector3(along.x, rise - 2 * droop * t, along.z).normalize();
    _n.crossVectors(side, tip).normalize();
    if (_n.y < 0) _n.negate();
    const half = wid * 0.5 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95));
    for (const s of [-1, 1]) {
      _a.copy(p).addScaledVector(side, s * half).add(new THREE.Vector3(0, half * 0.25, 0));
      m.vertex(_a, _n, r[0] + (r[2] - r[0]) * t, s < 0 ? r[1] : r[3], tint);
    }
  }
  for (let k = 0; k < segs; k++) { const a = i0 + k * 2; m.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}

// ---- the kinds ---------------------------------------------------------------------------------------------------
/** A trunk's line: `rings` points up to `height`, leaning and gently wandering; radii tapering from `foot`, flared. */
function trunkLine(rand: () => number, height: number, foot: number, tip: number, rings: number, lean: number, curve = 0): { pts: THREE.Vector3[]; radii: number[] } {
  const pts: THREE.Vector3[] = [], radii: number[] = [];
  const lx = (rand() - 0.5) * lean, lz = (rand() - 0.5) * lean, ph = rand() * 6.28;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, bend = t * t;
    pts.push(new THREE.Vector3(lx * bend + curve * t * t * Math.cos(ph) + Math.sin(t * 3.1 + ph) * foot * 0.3, t * height, lz * bend + curve * t * t * Math.sin(ph) + Math.cos(t * 2.6 + ph) * foot * 0.3));
    radii.push(tip + (foot * (1 + 0.28 * Math.exp(-t * 18)) - tip) * (1 - t) ** 1.35);
  }
  return { pts, radii };
}

const tint = (hex: number, vary: number, rand: () => number): THREE.Color => {
  const c = new THREE.Color(hex);
  const k = 1 + (rand() - 0.5) * vary;
  return c.multiplyScalar(k);
};

/** A BROADLEAF (aspen): Thronemound's tree in small: a trunk, boughs on a golden spiral sweeping up, a leafy clump on each. */
function broadleaf(near: boolean): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rand = rng(11), wood = new Mesher(), leaves = new Mesher();
  const trunk = trunkLine(rand, 0.72, 0.025, 0.006, near ? 8 : 4, 0.04);
  tube(wood, trunk.pts, trunk.radii, near ? 8 : 5, 0.08);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5)), boughs = near ? 9 : 6;
  const crownAt: THREE.Vector3[] = [];
  for (let i = 0; i < boughs; i++) {
    const t = 0.38 + (i / (boughs - 1)) * 0.5;
    const at = trunk.pts[Math.floor(t * (trunk.pts.length - 1))];
    const spin = i * GOLDEN, dir = new THREE.Vector3(Math.cos(spin), 0.55 + rand() * 0.3, Math.sin(spin)).normalize();
    const len = 0.32 * (1.1 - t) * (0.8 + rand() * 0.4);
    const end = at.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, len * 0.25, 0));
    if (near) tube(wood, [at.clone(), at.clone().lerp(end, 0.5).add(new THREE.Vector3(0, len * 0.08, 0)), end], [0.008, 0.005, 0.003], 4, 0.08);
    crownAt.push(end);
  }
  crownAt.push(trunk.pts[trunk.pts.length - 1].clone().add(new THREE.Vector3(0, 0.05, 0)));
  // the crown: leafy cards round each bough's end, facing every way (crossed), a little apart
  const per = near ? 7 : 3;
  for (const c of crownAt) {
    for (let k = 0; k < per; k++) {
      const a = rand() * Math.PI * 2, e = (rand() - 0.3) * 1.2;
      const nrm = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      const at = c.clone().addScaledVector(nrm, 0.04 + rand() * 0.05);
      card(leaves, at, nrm, new THREE.Vector3(0, 1, 0).add(new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5)).normalize(), 0.2 + rand() * 0.08, 0.2 + rand() * 0.08, ATLAS.clump, tint(0xe6f0d8, 0.25, rand));
    }
  }
  return { wood: wood.build(), leaves: leaves.build() };
}

/** A CONIFER: a straight trunk to its tip and tiers of needle boughs, longest low, drooping, narrowing to the top. */
function conifer(near: boolean): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rand = rng(23), wood = new Mesher(), leaves = new Mesher();
  const trunk = trunkLine(rand, 1, 0.025, 0.004, near ? 8 : 4, 0.01);
  tube(wood, trunk.pts, trunk.radii, near ? 7 : 5, 0.06);
  const tiers = near ? 12 : 7, per = near ? 7 : 5;
  for (let i = 0; i < tiers; i++) {
    const t = 0.18 + (i / tiers) * 0.8, y = t, reach = 0.24 * (1 - t) + 0.03;
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2 + i * 0.7 + rand() * 0.4;
      const dir = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).normalize();
      // a bough card hangs out from the trunk, its stem along the bough (the picture's v)
      const centre = new THREE.Vector3(0, y, 0).addScaledVector(dir, reach * 0.5);
      const nrm = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -0.3).normalize();
      card(leaves, centre, nrm, dir, reach * 0.9, reach * 1.05, ATLAS.bough, tint(0xdfeee2, 0.2, rand));
    }
  }
  return { wood: wood.build(), leaves: leaves.build() };
}

/**
 * A PALM-LIKE PLANT: a trunk (or none) and a rosette of fronds at its top.
 *   trunkHeight  share of its height that is trunk (palm 0.85, cycad and sago a short stump, fern none)
 *   fronds       how many; frondLen their length (shares of its height); rise how steeply they set off; droop their fall
 */
function rosette(near: boolean, seed: number, o: { trunkHeight: number; foot: number; fronds: number; frondLen: number; rise: number; droop: number; region: readonly number[]; leafTint: number; curve: number }): { wood: THREE.BufferGeometry | null; leaves: THREE.BufferGeometry } {
  const rand = rng(seed), wood = new Mesher(), leaves = new Mesher();
  let top = new THREE.Vector3(0, 0.02, 0);
  if (o.trunkHeight > 0) {
    const trunk = trunkLine(rand, o.trunkHeight, o.foot, o.foot * 0.7, near ? 8 : 4, 0.02, o.curve);
    tube(wood, trunk.pts, trunk.radii, near ? 7 : 5, 0.05);
    top = trunk.pts[trunk.pts.length - 1].clone();
  }
  const n = near ? o.fronds : Math.ceil(o.fronds * 0.6);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.3, layer = k % 3;
    const rise = o.rise - layer * 0.18 + (rand() - 0.5) * 0.15;
    const dir = new THREE.Vector3(Math.cos(a), Math.max(-0.3, Math.min(0.95, rise)), Math.sin(a)).normalize();
    frond(leaves, top, dir, o.frondLen * (0.85 + rand() * 0.3), o.frondLen * 0.32, o.droop * (0.8 + rand() * 0.4), near ? 8 : 4, o.region, tint(o.leafTint, 0.2, rand));
  }
  return { wood: o.trunkHeight > 0 ? wood.build() : null, leaves: leaves.build() };
}

/** A BUSH: a low ball of leafy cards, no stem to speak of. */
function bush(near: boolean): { wood: THREE.BufferGeometry | null; leaves: THREE.BufferGeometry } {
  const rand = rng(31), leaves = new Mesher();
  const n = near ? 16 : 7;
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, e = rand() * 1.1;
    const nrm = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    const at = new THREE.Vector3(0, 0.42, 0).addScaledVector(nrm, 0.22).multiply(new THREE.Vector3(1.25, 1, 1.25));
    card(leaves, at, nrm, new THREE.Vector3(0, 1, 0), 0.6, 0.55, ATLAS.clump, tint(0xdbe8c8, 0.3, rand));
  }
  return { wood: null, leaves: leaves.build() };
}

/** Every kind's models (made once, when the 3D trees are first wanted). */
export function makeKindModels(): Record<Kind, KindModels> {
  const both = <T>(make: (near: boolean) => T) => ({ near: make(true), far: make(false) });
  return {
    bush: both(bush),
    palm: both((near) => rosette(near, 41, { trunkHeight: 0.85, foot: 0.016, fronds: 14, frondLen: 0.36, rise: 0.55, droop: 0.75, region: ATLAS.frond, leafTint: 0xdfeec8, curve: 0.12 })),
    cycad: both((near) => rosette(near, 43, { trunkHeight: 0.28, foot: 0.05, fronds: 18, frondLen: 0.62, rise: 0.75, droop: 0.45, region: ATLAS.frond, leafTint: 0xc8dcaa, curve: 0 })),
    sago: both((near) => rosette(near, 47, { trunkHeight: 0.22, foot: 0.045, fronds: 20, frondLen: 0.66, rise: 0.7, droop: 0.55, region: ATLAS.fern, leafTint: 0xd8e6bc, curve: 0 })),
    fern: both((near) => rosette(near, 53, { trunkHeight: 0, foot: 0, fronds: 16, frondLen: 0.72, rise: 0.8, droop: 0.6, region: ATLAS.fern, leafTint: 0xe8f4d0, curve: 0 })),
    aspen: both(broadleaf),
    conifer: both(conifer),
  } as Record<Kind, KindModels>;
}

/**
 * A PALM'S BARK, drawn in code (512 x 512): grey-brown rings, each a raised band with a dark seam under it, a little
 * grain, so it tiles both ways.
 */
export function drawPalmBark(): THREE.CanvasTexture {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const rand = rng(99);
  g.fillStyle = '#6f6455'; g.fillRect(0, 0, size, size);
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const y = (i / rings) * size, h = size / rings;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#4a4136'); grad.addColorStop(0.15, '#857867'); grad.addColorStop(0.7, '#766a59'); grad.addColorStop(1, '#3d352c');
    g.fillStyle = grad; g.fillRect(0, y, size, h);
  }
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '40,34,28' : '150,140,125'},${0.08 + rand() * 0.1})`; g.fillRect(rand() * size, rand() * size, 1 + rand() * 6, 1); }
  const picture = new THREE.CanvasTexture(canvas);
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.wrapS = picture.wrapT = THREE.RepeatWrapping;
  return picture;
}
