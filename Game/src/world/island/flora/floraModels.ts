// ============================================================================
// floraModels.ts -- THE ISLAND'S SCI-FI FLORA, every species made in code
// (Joshua, 2026-11-24: "custom Sci-fi landscaping like giant mushrooms,
// plants, etc."; the world's direction: a tropical island with an alien
// side, giant glowing and plain fungi, original designs).
//
// Each model is ONE UNIT TALL standing on its foot at the origin (as the 3D
// trees are, treeModels.ts): a planted one is the model stretched by its
// height (floraSpecies.ts gives each species its sizes in metres) and turned.
// Its foot goes a little BELOW 0, so it sits into a slope instead of floating
// on it. Each comes in two levels of detail made from the SAME plan (the same
// lean, the same cap, the same places), so swapping one for the other never
// changes its outline:
//   NEAR  for close up (stems round, gills, spots, tendrils)
//   FAR   a light version for further off (a few hundred triangles at most)
//
// The species, and what each is made of (all from floraKit.ts):
//   LANTERN CAP / UMBER PARASOL   tall cap mushrooms: a leaning stem with a
//       flared, root-lobed foot and a skirt (ring) under a broad cap; gills
//       underneath (a ridged surface), spots or scales on top.
//   SKY PARASOL / RUST CROWN      the same family at giant size: a thick
//       fluted stem with buttress roots, shelf fungi up it, a broad cap with
//       a wavy rim (the Sky Parasol's hangs glowing threads; the Rust Crown's
//       rim turns up like a mature cap's).
//   GLOWBELL / BUTTON CLUSTER     several small caps of different heights from
//       one mound (bells that glow at night; plain domed buttons).
//   SHELF FUNGUS ON A BOULDER, SHELF TIERS   bracket fungi in tiers, zoned in
//       bands like tree rings, on a mossy basalt boulder or alone (to set
//       against a cliff, a trunk or a giant's stem).
//   SIPHON CORAL                  a clump of open tubes, glowing inside.
//   CRESCENT FERN                 broad sickle-curved fronds, teal on top and
//       violet beneath, with young fronds still coiled (fiddleheads).
//   SPORE PODS                    ribbed pods on stalks over strap leaves,
//       their seams and tips glowing.
// ============================================================================
import * as THREE from 'three';
import {
  Mesher, NO_GLOW, Patch, around, fbm, frameAt, frames, hex, lathe, mix, noise3, ring, rng, shade, smooth, sweep, wart,
  type Frame, type Glow,
} from './floraKit';

export type Detail = 'near' | 'far';
/** A species variant's two models (each one geometry, for THREE.InstancedMesh). */
export interface FloraModel { near: THREE.BufferGeometry; far: THREE.BufferGeometry }

const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;

// ---- the island's ground colours (Joshua's approved palette), for feet that sink into the soil ---------------------
export const GROUND = {
  sand: hex(0xd7d4c1), sandDark: hex(0xbdb49a),
  grass: hex(0x468d72), teal: hex(0x528c9f),
  forest: hex(0x234f43), forestLight: hex(0x2f6a55),
  soil: hex(0x8b6652), soilDark: hex(0x6e4f40),
  rock: hex(0x6b6661), basalt: hex(0x414952), basaltDark: hex(0x2b3138),
  violet: hex(0x76659c),
} as const;

// =====================================================================================================================
// STEMS
// =====================================================================================================================
/** How a stem is shaped (all in the model's units: the plant is 1 tall). */
interface StemSpec {
  base: number;          // where its foot starts (below the ground)
  top: number;           // where its tip ends (inside the cap)
  leanX: number;         // how far its tip leans off its foot
  leanZ: number;
  curve: number;         // a gentle S in it
  ph: number;            // (where the S starts)
  rMid: number;          // its radius up the middle
  rTop: number;          // its radius at the top, where it widens into the cap
  flare: number;         // how much wider its foot is (added to rMid)
  flareT: number;        // how high the flare reaches (share of the stem)
  lobes: number;         // root lobes round its foot (buttresses)
  lobeDepth: number;     // how far they stand out (share of the radius)
  lobeT: number;         // how high they reach
  lobePh: number;
  flutes: number;        // shallow ridges up it (0 none)
  fluteDepth: number;
  twist: number;         // how far the ridges turn round it going up (radians)
  rings: number;         // rings up it
  sides: number;         // points round it
  colour: (t: number, a: number, p: THREE.Vector3) => THREE.Color;
  glow?: (t: number, a: number) => Glow;
}

/** A stem's centre line at share `t` (0 foot .. 1 tip). */
function stemPoint(s: StemSpec, t: number): THREE.Vector3 {
  const lean = t ** 1.6;
  return V(
    s.leanX * lean + s.curve * Math.sin(t * 2.6 + s.ph) * t,
    s.base + (s.top - s.base) * t,
    s.leanZ * lean + s.curve * Math.cos(t * 2.1 + s.ph) * t,
  );
}

/** A stem's radius at share `t`, `a` radians round it. */
function stemRadius(s: StemSpec, t: number, a: number): number {
  const core = s.rMid + (s.rTop - s.rMid) * smooth(0.6, 1, t) ** 1.4 + s.flare * Math.exp(-t / s.flareT);
  const lobe = 1 + s.lobeDepth * Math.max(0, Math.cos(s.lobes * (a - s.lobePh))) ** 2 * Math.exp(-t / s.lobeT);
  const flute = s.flutes > 0 ? 1 + s.fluteDepth * Math.cos(s.flutes * a + s.twist * t) : 1;
  return core * lobe * flute;
}

/** BUILD A STEM: a tube up its leaning line, rings closer together near its foot (where its flare and roots are). */
function buildStem(m: Mesher, s: StemSpec): Frame[] {
  const ts: number[] = [];
  for (let i = 0; i <= s.rings; i++) ts.push((i / s.rings) ** 1.3);
  const fr = frames(ts.map((t) => stemPoint(s, t)));
  const p = V();
  sweep(m, fr, s.sides, (row, a) => {
    const t = ts[row];
    return { r: stemRadius(s, t, a), c: s.colour(t, a, around(fr[row], a, p)), g: s.glow?.(t, a) ?? NO_GLOW };
  });
  return fr;
}

/** The frame at share `t` up a stem (for a skirt or a shelf on it). */
function stemFrameAt(s: StemSpec, t: number): Frame {
  const p = stemPoint(s, t);
  const dir = stemPoint(s, Math.min(1, t + 0.02)).sub(stemPoint(s, Math.max(0, t - 0.02))).normalize();
  return frameAt(p, dir);
}

// =====================================================================================================================
// CAPS
// =====================================================================================================================
/** How a cap is shaped: its outline from its top's middle out to its rim, and its underside back in to the stem. */
interface CapSpec {
  radius: number;        // out to its rim
  dome: number;          // its top's height over where the stem meets its underside
  rimY: number;          // its rim's height (negative: below the stem's tip)
  k: number;             // its outline: height = rimY + (dome - rimY) * (1 - s^k)^e (s 0 middle .. 1 rim)
  e: number;
  boss: number;          // a bump at its middle (an umbo)
  upturn: number;        // its rim turned UP (a mature cap)
  wave: number;          // its rim's waves up and down
  waves: number;         // (how many round it)
  lobe: number;          // its rim's waves in and out
  ph: number;
  curl: number;          // how far its rim curls under (its thickness at the edge)
  curlRows: 0 | 2 | 3;   // rows for the curl (none: its underside meets its rim exactly)
  underPole?: boolean;   // its underside closes to a point inside the stem (the lightest caps)
  stemR: number;         // the stem's radius where it meets the underside
  gillDepth: number;     // how deep its gills hang (0: a smooth underside)
  topCols: number;       // points round its top (gilled, its underside has twice as many: two a gill)
  topRows: number;       // rings from its middle out to its rim
  underRows: number;     // rings from the curl in to the stem
  topColour: (s: number, a: number, p: THREE.Vector3) => THREE.Color;
  underColour: (q: number, a: number, ridge: boolean) => THREE.Color;
  topGlow?: (s: number, a: number) => Glow;
  underGlow?: (q: number, a: number, ridge: boolean) => Glow;
}

/** The cap's top surface at share `s` out (0 middle .. 1 rim) and `a` radians round: its distance out and height. */
function capTop(c: CapSpec, s: number, a: number): { r: number; y: number } {
  const wobble = Math.sin(c.waves * a + c.ph) + 0.4 * Math.sin((c.waves + 2) * a + c.ph * 2.3);
  const r = c.radius * s * (1 + c.lobe * wobble * s ** 3);
  const y = c.rimY + (c.dome - c.rimY) * Math.max(0, 1 - s ** c.k) ** c.e
    + c.boss * Math.exp(-((s / 0.17) ** 2))
    + c.upturn * smooth(0.55, 1, s) ** 2
    + c.wave * wobble * s ** 4;
  return { r, y };
}

/** A point on the cap's top (in the model) and the way its surface faces there (for spots, scales, threads). */
function capTopPoint(f: Frame, c: CapSpec, s: number, a: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const at = (ss: number, aa: number) => {
    const k = capTop(c, ss, aa);
    return f.p.clone().addScaledVector(around(f, aa), k.r).addScaledVector(f.t, k.y);
  };
  const p = at(s, a);
  const ds = at(Math.min(1, s + 0.01), a).sub(at(Math.max(0, s - 0.01), a));
  const da = at(s, a + 0.01).sub(at(s, a - 0.01));
  const n = new THREE.Vector3().crossVectors(ds, da).normalize();
  if (n.dot(f.t) < 0) n.negate();
  return { p, n };
}

/**
 * BUILD A CAP on frame `f` (at the stem's tip, its t along the stem), as ONE closed surface with no gap anywhere:
 *   its TOP in rings from the middle (a single point) out to the rim;
 *   the rim CURLING UNDER a little (a ring or two past s = 1);
 *   its UNDERSIDE in rings back in to the stem, its gills a ridged surface (two points a gill: the ridge hangs down,
 *   the groove between stays up), joined to the curl by a STITCH (the gills need twice the points round).
 * (First made as two surfaces, the underside's edge tucked inside the curl: a low look could slip between them.)
 */
function buildCap(m: Mesher, f: Frame, c: CapSpec): void {
  const patch = new Patch();
  // (out is away from a point inside the cap)
  const inside = f.p.clone().addScaledVector(f.t, c.dome * 0.3);
  const away = (v: number) => m.at(v, _away).sub(inside);
  const pt = V();
  // ---- the top, then the curl ----
  const top: number[][] = [];
  for (let row = 0; row < c.topRows; row++) {
    const s = row / (c.topRows - 1);
    top.push(ring(m, f, c.topCols, (a) => {
      const k = capTop(c, s, a);
      pt.copy(f.p).addScaledVector(around(f, a), k.r).addScaledVector(f.t, k.y);
      return { r: k.r, y: k.y, c: c.topColour(s, a, pt), g: c.topGlow?.(s, a) ?? NO_GLOW };
    }));
  }
  const curl = c.curl > 0 ? (c.curlRows === 3 ? CURL3 : c.curlRows === 2 ? CURL2 : []) : [];
  curl.forEach(([out, down], step) => {
    const q = 1 - step * 0.02;
    top.push(ring(m, f, c.topCols, (a) => {
      const edge = capTop(c, 1, a);
      return { r: edge.r * out, y: edge.y - c.curl * down, c: c.underColour(q, a, false), g: c.underGlow?.(q, a, false) ?? NO_GLOW };
    }));
  });
  m.grid(patch, top, true, (r, col) => away(top[r][col]));

  // ---- the underside, from just inside the curl (q = 1) in to the stem (q = 0) ----
  const gilled = c.gillDepth > 0;
  const cols = gilled ? c.topCols * 2 : c.topCols;
  const inner = c.stemR * 0.6;
  const under: number[][] = [];
  const qs = c.underRows === 2 ? [1, 0] : Array.from({ length: c.underRows }, (_, i) => 1 - i / (c.underRows - 1));
  for (const q of qs) {
    // (with the same points round as the top, its outer ring IS the last ring of the curl, or the rim)
    if (q === 1 && !gilled) { under.push(top[top.length - 1]); continue; }
    under.push(ring(m, f, cols, (a, col) => {
      const edge = capTop(c, 1, a);
      const outer = curl.length ? edge.r * 0.94 : edge.r;
      const edgeY = curl.length ? edge.y - c.curl : edge.y;
      if (q <= 0 && c.underPole) return { r: 0, y: 0, c: c.underColour(0, a, false), g: c.underGlow?.(0, a, false) ?? NO_GLOW };
      const r = inner + (outer - inner) * q;
      // (it rises from its outer edge to the stem's tip; a gill's ridge hangs below that, deepest midway, none at its
      //  ends, so the stitch to the curl is smooth)
      let y = edgeY * q ** 1.25;
      const ridge = gilled && col % 2 === 0;
      if (ridge) y -= c.gillDepth * Math.sin(Math.PI * Math.min(1, q * 1.08)) ** 0.7 * smooth(0, 0.15, q);
      return { r, y, c: c.underColour(q, a, ridge), g: c.underGlow?.(q, a, ridge) ?? NO_GLOW };
    }));
  }
  if (gilled) m.stitch(patch, top[top.length - 1], under[0], away);
  m.grid(patch, under, true, (r, col) => away(under[r][col]));
  m.close(patch);
}
/** The curl's rings: how far out (share of the rim's radius) and how far down (shares of the curl). */
const CURL3 = [[1.012, 0.45], [0.99, 0.85], [0.955, 1]] as const;
const CURL2 = [[1.012, 0.45], [0.955, 1]] as const;
const _away = new THREE.Vector3();

/** A SKIRT (the ring round a mushroom's stem): a thin frilly collar hanging from it, on frame `f` round the stem. */
function buildSkirt(m: Mesher, f: Frame, stemR: number, reach: number, hang: number, cols: number, colour: (row: number) => THREE.Color, glow: (row: number) => Glow, ph: number): void {
  // its outline, as one closed loop round its cross-section: in at the stem (above), out and down to its frilly lip,
  // and back in underneath (r measured from the stem's middle)
  const shape = [
    { r: stemR * 0.92, y: hang * 0.25 },
    { r: stemR + reach * 0.35, y: hang * 0.05 },
    { r: stemR + reach * 0.85, y: -hang * 0.55 },
    { r: stemR + reach, y: -hang },
    { r: stemR + reach * 0.9, y: -hang * 1.12 },
    { r: stemR + reach * 0.3, y: -hang * 0.35 },
    { r: stemR * 0.92, y: -hang * 0.05 },
  ];
  const frill = (row: number, a: number) => (row >= 2 && row <= 4 ? 1 : 0) * (Math.sin(7 * a + ph) * 0.5 + Math.sin(11 * a + ph * 1.7) * 0.25);
  lathe(m, f, shape.length, cols, (row, a) => ({
    r: shape[row].r + frill(row, a) * reach * 0.08,
    y: shape[row].y + frill(row, a) * hang * 0.25,
    c: colour(row), g: glow(row),
  }), () => ({ r: stemR + reach * 0.45, y: -hang * 0.45 }));
}

// =====================================================================================================================
// THE TALL CAP MUSHROOMS: LANTERN CAP (glowing) and UMBER PARASOL (plain), 8-15 m
// =====================================================================================================================
interface TallCapLook {
  seed: number;
  glow: boolean;
  capShape: { radius: number; dome: number; rimY: number; k: number; e: number; boss: number };
  stemColour: (t: number, a: number, p: THREE.Vector3) => THREE.Color;
  capColour: (s: number, a: number, p: THREE.Vector3) => THREE.Color;
  gill: THREE.Color; groove: THREE.Color;
  skirt: THREE.Color;
  spot: { count: number; size: [number, number]; height: number; foot: THREE.Color; top: THREE.Color; flat: boolean };
}

function tallCap(look: TallCapLook, detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  // THE PLAN: drawn first and in the same order for both details, so near and far share every proportion
  const plan = rng(look.seed);
  const leanA = plan() * TAU, leanBy = 0.05 + plan() * 0.05;
  const stemTop = 0.84 + plan() * 0.03;
  const stem: StemSpec = {
    base: -0.02, top: stemTop, leanX: Math.cos(leanA) * leanBy, leanZ: Math.sin(leanA) * leanBy,
    curve: 0.008 + plan() * 0.01, ph: plan() * TAU,
    rMid: 0.034 + plan() * 0.006, rTop: 0.042, flare: 0.028, flareT: 0.07,
    lobes: 5, lobeDepth: 0.35, lobeT: 0.045, lobePh: plan() * TAU,
    flutes: 0, fluteDepth: 0, twist: 0,
    rings: near ? 16 : 4, sides: near ? 16 : 8,
    colour: look.stemColour,
  };
  const capTilt = 0.06 + plan() * 0.06, capTiltA = leanA + (plan() - 0.5) * 1.2;
  const ph = plan() * TAU;
  const m = new Mesher();
  buildStem(m, stem);

  // THE CAP sits on the stem's tip, tipped a little further than the stem leans (caps turn to the light)
  const tip = stemFrameAt(stem, 1);
  const tilt = tip.t.clone().add(V(Math.cos(capTiltA) * capTilt, 0, Math.sin(capTiltA) * capTilt)).normalize();
  const capFrame = frameAt(stemPoint(stem, 1).addScaledVector(tip.t, -0.012), tilt);
  const glowing = look.glow;
  const cap: CapSpec = {
    ...look.capShape, upturn: 0, wave: 0.006, waves: 5, lobe: 0.03, ph, curl: 0.016, curlRows: near ? 3 : 2,
    stemR: stem.rTop, gillDepth: near ? 0.022 : 0,
    topCols: near ? 36 : 14, topRows: near ? 9 : 4, underRows: near ? 5 : 2,
    topColour: look.capColour,
    underColour: (q, _a, ridge) => mix(look.groove, look.gill, ridge ? 0.85 : 0.25 + 0.5 * q),
    // THE GILLS GLOW day and night (dim by day), brightest out toward the rim, their ridges more than their grooves
    underGlow: glowing ? (q, _a, ridge) => [(ridge ? 1 : 0.4) * (0.3 + 0.7 * smooth(0.05, 0.75, q)), 1, ridge ? 0.3 * q : 0] : undefined,
    // (and the rim's edge a little, only at night)
    topGlow: glowing ? (s) => [0.45 * smooth(0.9, 1, s), 0, 0.2] : undefined,
  };
  buildCap(m, capFrame, cap);

  // THE SKIRT, two thirds of the way up (near only: from afar it is a pixel or two)
  if (near) {
    const t = 0.74;
    const f = stemFrameAt(stem, t);
    const r = stemRadius(stem, t, 0);
    buildSkirt(m, f, r, 0.028, 0.03, 16, (row) => mix(look.skirt, shade(look.skirt, 0.7), row >= 4 ? 0.6 : 0.1),
      (row) => (glowing && row >= 2 && row <= 4 ? [0.5, 0, 0.3] : NO_GLOW), ph);
  }

  // SPOTS (or scales) on the cap: placed by their own random numbers, kept apart, thinning toward the rim
  if (near) {
    const sr = rng(look.seed + 101);
    const placed: THREE.Vector3[] = [];
    for (let tries = 0; tries < 400 && placed.length < look.spot.count; tries++) {
      const s = 0.14 + Math.sqrt(sr()) * 0.74, a = sr() * TAU;
      const size = look.spot.size[0] + (look.spot.size[1] - look.spot.size[0]) * sr() * (1.15 - s * 0.5);
      const { p, n } = capTopPoint(capFrame, cap, s, a);
      if (placed.some((q) => q.distanceTo(p) < size * 2.2)) continue;
      placed.push(p);
      const h = look.spot.flat ? size * 0.35 : size * look.spot.height;
      const g: Glow = glowing ? [0.75, 0, 0.35] : NO_GLOW, gTop: Glow = glowing ? [1, 0, 0.7] : NO_GLOW;
      wart(m, p, n, size, h, 6, look.spot.foot, look.spot.top, g, gTop);
    }
  }
  return m.build();
}

/** THE LANTERN CAP: an indigo cap with pale glowing spots over glowing gills, a pale lilac stem with a frilly skirt. */
function lanternCap(detail: Detail): THREE.BufferGeometry {
  const capMid = hex(0x2c2a4c), capRim = hex(0x4d5488), capDark = hex(0x1e1c36);
  const stemPale = hex(0xc4bdd2), stemTop = hex(0xdcd7e6), stemFoot = hex(0x6a5e72);
  return tallCap({
    seed: 1101, glow: true,
    capShape: { radius: 0.3, dome: 0.1, rimY: -0.03, k: 2.1, e: 0.72, boss: 0.008 },
    stemColour: (t, _a, p) => {
      const streak = fbm(p.x * 40, p.y * 6, p.z * 40, 5) - 0.5;
      const c = mix(mix(stemFoot, stemPale, smooth(0.0, 0.16, t)), stemTop, smooth(0.6, 1, t));
      return shade(mix(c, GROUND.soilDark, smooth(0.035, 0, t) * 0.8), 1 + streak * 0.22);
    },
    capColour: (s, _a, p) => {
      const blotch = fbm(p.x * 14, p.y * 14, p.z * 14, 9);
      const c = mix(capMid, capRim, smooth(0.35, 1, s));
      return mix(c, capDark, (blotch - 0.35) * 0.9 * (1 - s * 0.5));
    },
    gill: hex(0xdfe8e2), groove: hex(0x7f8f93),
    skirt: hex(0xd6d0e0),
    spot: { count: 22, size: [0.008, 0.017], height: 0.55, foot: hex(0xa9b2cc), top: hex(0xe4ebf6), flat: false },
  }, detail);
}

/** THE UMBER PARASOL: a broad flat cap, rust at its middle to ochre at its rim, with dark brown scales; cream gills. */
function umberParasol(detail: Detail): THREE.BufferGeometry {
  const rust = hex(0x8c4b2d), ochre = hex(0xbf9058), band = hex(0x9a6a44);
  const cream = hex(0xddd1b6), creamTop = hex(0xe8dfca), snake = hex(0x9b8160);
  return tallCap({
    seed: 2203, glow: false,
    capShape: { radius: 0.33, dome: 0.07, rimY: -0.025, k: 3.2, e: 0.45, boss: 0.016 },
    stemColour: (t, _a, p) => {
      // (snake-skin bands of brown up the cream stem, broken by noise)
      const bands = Math.max(0, Math.sin(t * 46 + noise3(p.x * 30, p.y * 8, p.z * 30, 3) * 4));
      const c = mix(cream, creamTop, smooth(0.6, 1, t));
      return mix(mix(c, snake, bands * 0.45 * smooth(0.15, 0.3, t) * smooth(0.72, 0.6, t)), GROUND.soilDark, smooth(0.04, 0, t) * 0.8);
    },
    capColour: (s, _a, p) => {
      const blotch = fbm(p.x * 12, p.y * 12, p.z * 12, 21);
      const ring = 0.5 + 0.5 * Math.sin(s * 22);
      return mix(mix(rust, ochre, smooth(0.15, 0.95, s)), band, ring * 0.25 * smooth(0.2, 0.5, s) + (blotch - 0.5) * 0.5);
    },
    gill: hex(0xe6dcc3), groove: hex(0xa8987a),
    skirt: hex(0xe1d7c0),
    spot: { count: 34, size: [0.006, 0.012], height: 0.3, foot: hex(0x5d3b26), top: hex(0x4a2d1c), flat: true },
  }, detail);
}

// =====================================================================================================================
// THE GIANTS: SKY PARASOL (glowing) and RUST CROWN (plain), 20-40 m
// =====================================================================================================================
/**
 * A SHELF (a bracket fungus) growing out of something at frame `f` (its t up, its u the way it sticks out): a thick
 * fan whose back is buried in its host. Its outline round it goes `from`..`to` radians (its length fading to nothing
 * at the ends, so they close inside the host); `r0` is where its back starts (inside), `len` how far it reaches.
 */
function buildShelf(m: Mesher, f: Frame, o: {
  r0: number; len: number; thick: number; rise: number; droop: number; half: number; cols: number; rows: 4 | 8;
  ph: number; top: (z: number) => THREE.Color; lip: THREE.Color; under: THREE.Color; lipGlow?: Glow; underGlow?: Glow;
}): void {
  // its outline, a closed loop round its cross-section (z: share of its reach out), from its back on top, out over
  // its top to its lip, and back in underneath
  const full = [
    { z: 0, y: 0.5 }, { z: 0.38, y: 0.62 }, { z: 0.74, y: 0.4 }, { z: 0.93, y: 0.16 }, { z: 1, y: -0.05 },
    { z: 0.9, y: -0.5 }, { z: 0.5, y: -0.55 }, { z: 0, y: -0.45 },
  ];
  const light = [{ z: 0, y: 0.5 }, { z: 0.6, y: 0.5 }, { z: 1, y: -0.05 }, { z: 0, y: -0.45 }];
  const shape = o.rows === 8 ? full : light;
  lathe(m, f, shape.length, o.cols, (row, a) => {
    const u = a / o.half;                                         // -1 .. 1 across it
    const env = Math.cos(Math.min(1, Math.abs(u)) * Math.PI / 2) ** 0.55;
    const reach = o.len * env * (1 + 0.07 * Math.sin(5 * a + o.ph));
    const k = shape[row];
    const sag = o.droop * k.z * k.z;                              // (its outer edge sags)
    // (its thickness, rise and sag shrink with its reach toward its ends, so each end closes to a point inside its
    //  host; full thickness to the very end folded the last sliver over on itself)
    const y = (k.y * o.thick * (1 - 0.6 * k.z) + o.rise * k.z * (1 - k.z) * 2 - sag) * Math.sqrt(env);
    // (the pale lip is its very edge only; its zoned top runs nearly out to it)
    const isLip = k.z > 0.99;
    const onTop = row < shape.length / 2;
    return {
      r: o.r0 + reach * k.z, y,
      c: isLip ? o.lip : onTop ? o.top(k.z) : o.under,
      g: isLip ? o.lipGlow ?? NO_GLOW : onTop ? NO_GLOW : o.underGlow ?? NO_GLOW,
    };
  }, (_row, a) => ({ r: o.r0 + o.len * 0.4 * Math.cos(Math.min(1, Math.abs(a / o.half)) * Math.PI / 2) ** 0.55, y: 0 }), { from: -o.half, to: o.half });
}

interface GiantLook {
  seed: number;
  glow: boolean;
  capShape: { radius: number; dome: number; rimY: number; k: number; e: number; boss: number; upturn: number; wave: number };
  stemColour: (t: number, a: number, p: THREE.Vector3) => THREE.Color;
  capColour: (s: number, a: number, p: THREE.Vector3) => THREE.Color;
  gill: THREE.Color; groove: THREE.Color;
  shelfTop: (z: number) => THREE.Color; shelfLip: THREE.Color; shelfUnder: THREE.Color;
  shelves: number;
  threads: number;
  scales: { count: number; foot: THREE.Color; top: THREE.Color } | null;
}

function giantCap(look: GiantLook, detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const plan = rng(look.seed);
  const leanA = plan() * TAU, leanBy = 0.03 + plan() * 0.03;
  const stem: StemSpec = {
    base: -0.015, top: 0.8 + plan() * 0.03, leanX: Math.cos(leanA) * leanBy, leanZ: Math.sin(leanA) * leanBy,
    curve: 0.012 + plan() * 0.008, ph: plan() * TAU,
    rMid: 0.056, rTop: 0.062, flare: 0.058, flareT: 0.09,
    lobes: 6, lobeDepth: 0.5, lobeT: 0.075, lobePh: plan() * TAU,
    flutes: near ? 5 : 0, fluteDepth: 0.045, twist: 2.4,
    rings: near ? 18 : 4, sides: near ? 20 : 10,
    colour: look.stemColour,
  };
  const ph = plan() * TAU, capTilt = 0.04 + plan() * 0.04, capTiltA = leanA + (plan() - 0.5);
  const m = new Mesher();
  buildStem(m, stem);

  const tip = stemFrameAt(stem, 1);
  const tilt = tip.t.clone().add(V(Math.cos(capTiltA) * capTilt, 0, Math.sin(capTiltA) * capTilt)).normalize();
  const capFrame = frameAt(stemPoint(stem, 1).addScaledVector(tip.t, -0.012), tilt);
  const glowing = look.glow;
  const cap: CapSpec = {
    ...look.capShape, waves: 6, lobe: 0.045, ph, curl: 0.02, curlRows: near ? 3 : 2,
    stemR: stem.rTop, gillDepth: near ? 0.026 : 0,
    topCols: near ? 36 : 14, topRows: near ? 9 : 4, underRows: near ? 5 : 2,
    topColour: look.capColour,
    underColour: (q, _a, ridge) => mix(look.groove, look.gill, ridge ? 0.85 : 0.2 + 0.5 * q),
    underGlow: glowing ? (q, _a, ridge) => [(ridge ? 1 : 0.4) * (0.3 + 0.7 * smooth(0.05, 0.7, q)), 1, ridge ? 0.35 * q : 0.05] : undefined,
    topGlow: glowing ? (s) => [0.45 * smooth(0.9, 1, s), 1, 0.2] : undefined,
  };
  buildCap(m, capFrame, cap);

  // SHELVES UP THE STEM: alternating sides, smaller higher up, their backs buried in the stem
  const sr = rng(look.seed + 7);
  const shelfCount = near ? look.shelves : Math.min(2, look.shelves);
  for (let i = 0; i < look.shelves; i++) {
    const t = 0.17 + i * (0.5 / look.shelves) + sr() * 0.04;
    const side = i * 2.4 + sr() * 0.6;
    const size = 0.12 * (1 - i * 0.12) * (0.85 + sr() * 0.3);
    const shelfPh = sr() * TAU;
    if (i >= shelfCount) continue;
    const at = stemFrameAt(stem, t);
    const out = around(at, side);
    const f = frameAt(at.p, UP, out);
    buildShelf(m, f, {
      r0: stemRadius(stem, t, side) * 0.8, len: size, thick: 0.02, rise: 0.014, droop: 0.014, half: 0.95,
      cols: near ? 7 : 4, rows: near ? 8 : 4, ph: shelfPh,
      top: look.shelfTop, lip: look.shelfLip, under: look.shelfUnder,
      lipGlow: glowing ? [1, 1, 0.4] : undefined, underGlow: glowing ? [0.55, 1, 0.1] : undefined,
    });
  }

  // GLOWING THREADS hanging from under the cap near its rim (they sway; near only)
  if (near && look.threads > 0) {
    const tr = rng(look.seed + 31);
    for (let i = 0; i < look.threads; i++) {
      const a = (i / look.threads) * TAU + tr() * 0.4;
      const edge = capTop(cap, 1, a);
      const from = capFrame.p.clone().addScaledVector(around(capFrame, a), edge.r * (0.72 + tr() * 0.18)).addScaledVector(capFrame.t, (edge.y - cap.curl * 1.06) * 0.75 + 0.008);
      const len = 0.06 + tr() * 0.14, swing = (tr() - 0.5) * 0.03;
      const line: THREE.Vector3[] = [];
      const segs = 4;
      for (let k = 0; k <= segs; k++) {
        const u = k / segs;
        line.push(from.clone().add(V(Math.cos(a) * swing * u * u, -len * u, Math.sin(a) * swing * u * u)));
      }
      const fr = frames(line);
      sweep(m, fr, 3, (row) => {
        const u = row / segs;
        return { r: 0.0035 * (1 - u * 0.75), c: mix(look.gill, hex(0xffffff), u * 0.4), g: [0.6 + 0.4 * u, 1, 0.2 + 0.6 * u], b: 0.3 + 0.7 * u };
      });
    }
  }

  // SCALES on the cap (the plain giant)
  if (near && look.scales) {
    const sr2 = rng(look.seed + 101);
    const placed: THREE.Vector3[] = [];
    for (let tries = 0; tries < 300 && placed.length < look.scales.count; tries++) {
      const s = 0.12 + Math.sqrt(sr2()) * 0.78, a = sr2() * TAU, size = 0.007 + sr2() * 0.008;
      const { p, n } = capTopPoint(capFrame, cap, s, a);
      if (placed.some((q) => q.distanceTo(p) < size * 2.4)) continue;
      placed.push(p);
      wart(m, p, n, size, size * 0.35, 5, look.scales.foot, look.scales.top);
    }
  }
  return m.build();
}

/** THE SKY PARASOL: a landmark. Deep teal-blue cap mottled violet, glowing gills, rim, shelves and hanging threads. */
function skyParasol(detail: Detail): THREE.BufferGeometry {
  const bone = hex(0xc9c6d4), boneTop = hex(0xe0dde9), boneFoot = hex(0x5b5470);
  const capDeep = hex(0x1f3d52), capViolet = hex(0x45386e), capRim = hex(0x3a6a86);
  return giantCap({
    seed: 3307, glow: true,
    capShape: { radius: 0.42, dome: 0.085, rimY: -0.035, k: 2.6, e: 0.55, boss: 0.018, upturn: 0, wave: 0.012 },
    stemColour: (t, _a, p) => {
      const streak = fbm(p.x * 30, p.y * 5, p.z * 30, 13) - 0.5;
      const c = mix(mix(boneFoot, bone, smooth(0, 0.2, t)), boneTop, smooth(0.65, 1, t));
      return shade(mix(c, GROUND.forest, smooth(0.03, 0, t) * 0.8), 1 + streak * 0.25);
    },
    capColour: (s, _a, p) => {
      const blotch = fbm(p.x * 9, p.y * 9, p.z * 9, 31);
      return mix(mix(capDeep, capRim, smooth(0.5, 1, s)), capViolet, smooth(0.45, 0.75, blotch) * 0.8);
    },
    gill: hex(0xd5e4ea), groove: hex(0x6f8590),
    shelfTop: (z) => mix(hex(0x3c3560), hex(0x8a86b0), z), shelfLip: hex(0xe6eef5), shelfUnder: hex(0xc8d6dd),
    shelves: 4, threads: 12, scales: null,
  }, detail);
}

/** THE RUST CROWN: the plain giant. A rust-red cap with pale scales, its rim turned up; ochre shelves; a bone stem. */
function rustCrown(detail: Detail): THREE.BufferGeometry {
  const bone = hex(0xd1c4ab), boneTop = hex(0xe4d9c4), rustStreak = hex(0x9a6448);
  const capRust = hex(0x8e3b26), capRed = hex(0xb0563a), capPale = hex(0xc98a5c);
  return giantCap({
    seed: 4409, glow: false,
    capShape: { radius: 0.4, dome: 0.06, rimY: -0.045, k: 2.4, e: 0.6, boss: 0.012, upturn: 0.075, wave: 0.016 },
    stemColour: (t, _a, p) => {
      const streak = fbm(p.x * 28, p.y * 4, p.z * 28, 41);
      const c = mix(bone, boneTop, smooth(0.6, 1, t));
      return mix(mix(c, rustStreak, smooth(0.55, 0.8, streak) * 0.55), GROUND.soilDark, smooth(0.035, 0, t) * 0.85);
    },
    capColour: (s, _a, p) => {
      const blotch = fbm(p.x * 10, p.y * 10, p.z * 10, 43);
      return mix(mix(capRust, capRed, smooth(0.2, 0.8, s) + (blotch - 0.5) * 0.6), capPale, smooth(0.9, 1, s) * 0.6);
    },
    gill: hex(0xe3d2b4), groove: hex(0x9c8061),
    shelfTop: (z) => mix(hex(0xb7652a), hex(0xe0a047), z * z), shelfLip: hex(0xf0d79a), shelfUnder: hex(0xe8d2a4),
    shelves: 5, threads: 0,
    scales: { count: 22, foot: hex(0xb5805c), top: hex(0xe6c9a4) },
  }, detail);
}

// =====================================================================================================================
// THE CLUSTERS: GLOWBELL (glowing at night) and BUTTON (plain), 0.1-5 m
// =====================================================================================================================
interface ClusterLook {
  seed: number;
  glow: boolean;
  count: number;          // mushrooms in it (the tallest is 1)
  buttons: number;        // tiny caps just breaking the ground (near only)
  // (five mushrooms: the first three, the tallest, drawn rounder than the two small ones)
  stemR: number;          // stem radius for the tallest (shares of its height)
  capR: number;           // cap radius for the tallest
  capShape: { dome: number; k: number; e: number; rimY: number };
  stem: (t: number) => THREE.Color;
  cap: (s: number, p: THREE.Vector3) => THREE.Color;
  under: THREE.Color;
  mound: THREE.Color;
  stripes: number;        // how dark the fine stripes out across the caps are (0 none)
}

function cluster(look: ClusterLook, detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const plan = rng(look.seed);
  const m = new Mesher();
  const glowing = look.glow;
  // THE MOUND they grow from: a low lump of their own flesh and soil
  if (near) {
    const moundR = 0.17;
    lathe(m, frameAt(V(0, -0.02, 0), UP), 3, 10, (row, a) => {
      const shape = [{ r: moundR, y: 0 }, { r: moundR * 0.6, y: 0.05 }, { r: 0, y: 0.07 }][row];
      const lump = 1 + 0.12 * Math.sin(3 * a + 1.3) * (row < 2 ? 1 : 0);
      return { r: shape.r * lump, y: shape.y, c: mix(GROUND.forest, look.mound, row / 2) };
    }, () => ({ r: 0, y: -0.2 }));
  }
  // THE MUSHROOMS: the first is the tallest; the rest shorter, round it, leaning out from the middle
  for (let i = 0; i < look.count; i++) {
    const big = i < 3;
    const h = i === 0 ? 1 : big ? 0.5 + plan() * 0.32 : 0.24 + plan() * 0.26;
    const a = i === 0 ? plan() * TAU : (i / look.count) * TAU + plan() * 0.8;
    const d = i === 0 ? 0.02 : 0.06 + plan() * 0.07;
    const out = 0.06 + plan() * 0.1;
    const ph = plan() * TAU;
    const sizeK = 0.65 + 0.35 * h;
    const capR = look.capR * sizeK * (0.85 + plan() * 0.3);
    const foot = V(Math.cos(a) * d, -0.02, Math.sin(a) * d);
    const stemTop = h - look.capShape.dome * capR / look.capR * 0.9;
    const stem: StemSpec = {
      base: -0.02, top: stemTop, leanX: Math.cos(a) * out * h, leanZ: Math.sin(a) * out * h,
      curve: 0.01 * h, ph, rMid: look.stemR * sizeK, rTop: look.stemR * sizeK * 1.05, flare: look.stemR * sizeK * 0.6, flareT: 0.1,
      lobes: 0, lobeDepth: 0, lobeT: 1, lobePh: 0, flutes: 0, fluteDepth: 0, twist: 0,
      rings: 1, sides: near ? (big ? 6 : 5) : 4,     // (its rings are `ts` below)
      colour: (t) => look.stem(t),
      glow: glowing ? (t) => [0.3 * smooth(0.6, 1, t), 0, 0] : undefined,
    };
    // (each stem's line starts at its own foot)
    const ts = !near ? [0, 1] : big ? [0, 0.3, 0.65, 0.88, 1] : [0, 0.4, 0.8, 1];
    const fr = frames(ts.map((t) => { const q = stemPoint(stem, t); q.x += foot.x; q.z += foot.z; return q; }));
    sweep(m, fr, stem.sides, (row, aa) => ({ r: stemRadius(stem, ts[row], aa), c: stem.colour(ts[row], aa, fr[row].p), g: stem.glow?.(ts[row], aa) ?? NO_GLOW }));
    const tipP = fr[fr.length - 1].p, tipT = fr[fr.length - 1].t;
    const capFrame = frameAt(tipP.clone().addScaledVector(tipT, -0.004), tipT.clone().add(V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.12)).normalize());
    const cols = !near ? 6 : big ? 10 : 8;
    const cap: CapSpec = {
      radius: capR, dome: look.capShape.dome * capR / look.capR, rimY: look.capShape.rimY * capR / look.capR,
      k: look.capShape.k, e: look.capShape.e, boss: 0, upturn: 0, wave: 0, waves: 5, lobe: 0.04, ph,
      curl: near ? 0.012 * capR / look.capR : 0, curlRows: 2, underPole: !near, stemR: stem.rTop, gillDepth: 0,
      topCols: cols, topRows: !near ? 2 : big ? 5 : 3, underRows: 2,
      // (fine stripes out from the middle, every other point round darker: a striate cap)
      topColour: (s, aa, p) => shade(look.cap(s, p), 1 - look.stripes * s * (0.5 + 0.5 * Math.cos((aa * cols) / 2))),
      underColour: () => look.under,
      // THE BELLS GLOW AT NIGHT, the whole cap, brightest underneath
      topGlow: glowing ? (s) => [0.45 + 0.35 * s, 0, 0.15 + 0.3 * (1 - s)] : undefined,
      underGlow: glowing ? () => [1, 0, 0.45] : undefined,
    };
    buildCap(m, capFrame, cap);
  }
  // TINY BUTTONS just breaking the ground round them
  if (near) {
    for (let i = 0; i < look.buttons; i++) {
      const a = plan() * TAU, d = 0.16 + plan() * 0.08, r = 0.03 + plan() * 0.02;
      lathe(m, frameAt(V(Math.cos(a) * d, -0.01, Math.sin(a) * d), UP), 3, 8, (row) => {
        const shape = [{ r, y: 0 }, { r: r * 0.8, y: r * 0.75 }, { r: 0, y: r * 1.05 }][row];
        return { ...shape, c: look.cap(row / 2, V()), g: glowing ? [0.5, 0, 0.2] : NO_GLOW };
      }, () => ({ r: 0, y: -1 }));
    }
  }
  return m.build();
}

/** THE GLOWBELL CLUSTER: slender pale stems under translucent-looking bell caps that light up at night. */
function glowbellCluster(detail: Detail): THREE.BufferGeometry {
  const pale = hex(0xd8e6e2), apex = hex(0x6f8b93), stemPale = hex(0xc9d6d2), stemFoot = hex(0x52645f);
  return cluster({
    seed: 5501, glow: true, count: 5, buttons: 1,
    stemR: 0.026, capR: 0.15, capShape: { dome: 0.17, k: 2.2, e: 1.6, rimY: -0.02 },
    stem: (t) => mix(stemFoot, stemPale, smooth(0, 0.35, t)),
    cap: (s, p) => mix(apex, pale, smooth(0, 0.55, s) + (noise3(p.x * 30, p.y * 30, p.z * 30, 3) - 0.5) * 0.2),
    under: hex(0xe8f2ee), mound: hex(0x4b5d58), stripes: 0.22,
  }, detail);
}

/** THE BUTTON CLUSTER: stout cream stems and round brown caps, the familiar woodland kind. */
function buttonCluster(detail: Detail): THREE.BufferGeometry {
  const brown = hex(0x8f6440), tan = hex(0xc49a68), stemCream = hex(0xe2d6bd);
  return cluster({
    seed: 6607, glow: false, count: 5, buttons: 1,
    stemR: 0.05, capR: 0.2, capShape: { dome: 0.17, k: 2, e: 0.9, rimY: -0.04 },
    stem: (t) => mix(GROUND.soil, stemCream, smooth(0, 0.25, t)),
    cap: (s, p) => mix(brown, tan, smooth(0.2, 1, s) + (fbm(p.x * 20, p.y * 20, p.z * 20, 7) - 0.5) * 0.4),
    under: hex(0xd9c9a8), mound: GROUND.soilDark, stripes: 0,
  }, detail);
}

// =====================================================================================================================
// BRACKET FUNGI: SHELF FUNGUS ON A BOULDER, and SHELF TIERS (alone, to set on cliffs, trunks or a giant's stem)
// =====================================================================================================================
/** The bands across a shelf's top (like a tree's rings), in the island's soil, sand, rock and violet. */
const SHELF_ZONES = [hex(0x5c4436), GROUND.soil, GROUND.sandDark, GROUND.violet, hex(0x8f7f74), GROUND.soilDark, hex(0xcfc5ad)];
function zoned(z: number, ph: number): THREE.Color {
  const x = z * 5.5 + ph;
  const i = Math.floor(x) % SHELF_ZONES.length;
  return mix(SHELF_ZONES[(i + SHELF_ZONES.length) % SHELF_ZONES.length], SHELF_ZONES[(i + 1) % SHELF_ZONES.length], smooth(0.75, 1, x - Math.floor(x)));
}

/** A boulder's surface at height share `u` (0 bottom .. 1 top) and `a` radians round it. */
function boulderPoint(u: number, a: number): THREE.Vector3 {
  const R = 0.42;
  const r = R * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.75;
  const y = -0.06 + 0.7 * (0.5 - 0.5 * Math.cos(Math.PI * u));
  const dir = V(Math.cos(a), 0, Math.sin(a));
  const lump = 0.78 + 0.44 * fbm(dir.x * 1.6 + 3, y * 2.4, dir.z * 1.6 + 3, 61, 3);
  return dir.multiplyScalar(r * lump * (1 - 0.18 * u)).setY(y * (0.92 + 0.16 * noise3(dir.x * 2, 0, dir.z * 2, 67)));
}

function bracketBoulder(detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const m = new Mesher();
  // THE BOULDER: basalt, mossy where it faces up, with flecks of the violet mineral
  const rows = near ? 9 : 5, cols = near ? 14 : 8;
  lathe(m, frameAt(V(), UP), rows, cols, (row, a) => {
    const u = row / (rows - 1);
    if (u <= 0 || u >= 1) {
      const p = boulderPoint(u, 0);
      return { r: 0, y: p.y, c: u <= 0 ? GROUND.basaltDark : GROUND.forestLight };
    }
    const p = boulderPoint(u, a);
    const tone = fbm(p.x * 6, p.y * 6, p.z * 6, 71);
    let c = mix(GROUND.basalt, GROUND.rock, 0.25 + tone * 0.6);
    c = mix(c, GROUND.basaltDark, smooth(0.42, 0.25, tone) * 0.7);
    const fleck = noise3(p.x * 18, p.y * 18, p.z * 18, 73);
    c = mix(c, GROUND.violet, smooth(0.74, 0.86, fleck) * 0.7);
    const moss = smooth(0.62, 0.82, u) * smooth(0.35, 0.6, fbm(p.x * 5, p.y * 5, p.z * 5, 79));
    c = mix(c, mix(GROUND.forestLight, GROUND.forest, tone), moss);
    return { r: Math.hypot(p.x, p.z), y: p.y, c };
  }, () => ({ r: 0, y: 0.25 }));
  // THE SHELVES: tiers on three sides (3, 3 and 2; far, the lowest two of each)
  const sr = rng(8803);
  const a0 = sr() * TAU;
  const columns = [{ a: a0, n: 3 }, { a: a0 + 2.1, n: 3 }, { a: a0 + 4.2, n: 2 }];
  for (const col of columns) {
    for (let i = 0; i < col.n; i++) {
      const u = 0.3 + i * 0.15;
      const a = col.a + (sr() - 0.5) * 0.35;
      const at = boulderPoint(u, a);
      const out = V(at.x, 0, at.z).normalize();
      // (its back buried in the rock: deeper in the far model, whose rougher boulder lies further in between its points)
      const deep = near ? 0.07 : 0.11;
      const f = frameAt(at.clone().addScaledVector(out, -deep), UP, out);
      // (far: the lowest two of each side; the random numbers above are drawn either way, so both are the same)
      const sizeAndPh = [sr(), sr()];
      if (!near && i >= 2) continue;
      const size = (col.n === 2 ? 0.26 : 0.24 - i * 0.03) * (0.85 + sizeAndPh[0] * 0.3);
      const ph = sizeAndPh[1] * 7;
      buildShelf(m, f, {
        r0: 0.06, len: size + deep - 0.07, thick: 0.05, rise: 0.03, droop: 0.016, half: 1.25, cols: near ? 10 : 4, rows: near ? 8 : 4, ph,
        top: (z) => zoned(z, ph), lip: hex(0xe2d6b2), under: hex(0xc9b994),
        lipGlow: [0.9, 0, 0.35], underGlow: [0.55, 0, 0.1],
      });
    }
  }
  return m.build();
}

function bracketTiers(detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const m = new Mesher();
  const sr = rng(9901);
  // (the host is the plane z = 0, the shelves stick out along +z; their backs buried behind it)
  const all = 9;
  for (let i = 0; i < all; i++) {
    const y = 0.06 + (i / (all - 1)) * 0.82 + (sr() - 0.5) * 0.04;
    const x = Math.sin(i * 1.9 + 0.4) * 0.12 + (sr() - 0.5) * 0.05;
    const size = (0.36 - i * 0.02) * (0.85 + sr() * 0.3);
    const turn = (sr() - 0.5) * 0.4;
    const ph = sr() * 7;
    // (near shows all nine; far the five biggest, the lower ones, spread over the same height)
    if (!near && i % 2 === 1) continue;
    const out = V(Math.sin(turn), 0, Math.cos(turn));
    const f = frameAt(V(x, y, -0.06), UP, out);
    buildShelf(m, f, {
      r0: 0.05, len: size, thick: 0.055, rise: 0.035, droop: 0.022, half: 1.25, cols: near ? 10 : 4, rows: near ? 8 : 4, ph,
      top: (z) => zoned(z, ph), lip: hex(0xe2d6b2), under: hex(0xc9b994),
      lipGlow: [0.9, 0, 0.35], underGlow: [0.55, 0, 0.1],
    });
  }
  return m.build();
}

// =====================================================================================================================
// SIPHON CORAL: a clump of open tubes, glowing inside (always), 0.5-3 m
// =====================================================================================================================
function siphonCoral(detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const plan = rng(7703);
  const m = new Mesher();
  const shell = hex(0xdcd4e8), band = hex(0xa596c4), deep = hex(0x4f4373), inside = hex(0xf2e6f7);
  // THE MOUND the tubes rise from
  lathe(m, frameAt(V(0, -0.03, 0), UP), near ? 4 : 2, near ? 12 : 6, (row, a) => {
    const shape = near ? [{ r: 0.2, y: 0 }, { r: 0.16, y: 0.05 }, { r: 0.08, y: 0.085 }, { r: 0, y: 0.095 }][row] : [{ r: 0.2, y: 0 }, { r: 0, y: 0.09 }][row];
    return { r: shape.r * (1 + 0.1 * Math.sin(4 * a)), y: shape.y, c: mix(GROUND.forest, deep, row / 3) };
  }, () => ({ r: 0, y: -0.3 }));
  const sides = near ? 8 : 4;
  const total = 9;
  for (let i = 0; i < total; i++) {
    const h = i === 0 ? 1 : 0.35 + plan() * 0.55;
    const a = (i / total) * TAU + plan() * 0.6, d = i === 0 ? 0.01 : 0.05 + plan() * 0.08;
    const splay = 0.08 + plan() * 0.12, bendPh = plan() * TAU;
    const r0 = (0.034 + plan() * 0.012) * (0.7 + 0.3 * h);
    // (far: the first five only)
    if (!near && i >= 5) continue;
    // ITS LINE: up from the mound, leaning out, gently bowed
    const n = near ? 5 : 2;
    const line: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      line.push(V(Math.cos(a) * (d + splay * h * t * t) + Math.sin(bendPh) * 0.02 * t, -0.03 + (h - 0.03) * t, Math.sin(a) * (d + splay * h * t * t) + Math.cos(bendPh) * 0.02 * t));
    }
    const fr = frames(line);
    // ITS RINGS, as ONE surface: up the OUTSIDE (widening, pale rings with violet bands, deep violet at its foot),
    // out over a flared LIP and its CREST, and down the INSIDE to a glowing floor. Each ring has a centre on its
    // axis and says whether out is away from it (outside) or toward it (inside), for facing the surface out.
    const outerR = (t: number) => r0 * (0.75 + 0.45 * t) * (1 + 0.25 * Math.exp(-t / 0.12));
    const R1 = outerR(1), top = fr[n];
    const rings: number[][] = [], centres: THREE.Vector3[] = [], inwards: boolean[] = [];
    const add = (f: Frame, inward: boolean, at: (a: number) => { r: number; c: THREE.Color; g: Glow; b: number }) => {
      rings.push(ring(m, f, sides, (aa) => at(aa)));
      centres.push(f.p.clone());
      inwards.push(inward);
    };
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      add(fr[k], false, () => {
        const ringed = 0.5 + 0.5 * Math.sin(t * h * 60);
        const c = mix(mix(deep, shell, smooth(0, 0.4, t)), band, ringed * 0.45 * smooth(0.2, 0.5, t));
        return { r: outerR(t), c, g: [0.3 * smooth(0.55, 1, t) * ringed, 1, 0], b: 0.5 * t * t };
      });
    }
    const along = (d: number) => ({ ...top, p: top.p.clone().addScaledVector(top.t, d) });
    const wob = (aa: number) => 1 + 0.06 * Math.sin(3 * aa + i);
    add(along(r0 * 0.15), false, (aa) => ({ r: R1 * 1.2 * wob(aa), c: mix(shell, inside, 0.4), g: [0.6, 1, 0.3], b: 0.5 }));
    if (near) add(along(r0 * 0.32), false, (aa) => ({ r: R1 * 1.06 * wob(aa), c: mix(shell, inside, 0.7), g: [0.8, 1, 0.4], b: 0.5 }));
    add(along(r0 * 0.12), true, () => ({ r: R1 * 0.8, c: inside, g: [0.9, 1, 0.4], b: 0.5 }));
    if (near) add(along(-0.12 * h), true, () => ({ r: R1 * 0.74, c: inside, g: [1, 1, 0.7], b: 0.5 }));
    add(along(-0.16 * h), true, () => ({ r: 0, c: hex(0xffffff), g: [1, 1, 1], b: 0.5 }));
    const patch = new Patch();
    const p = V();
    m.grid(patch, rings, true, (r, c) => {
      m.at(rings[r][c], p).sub(centres[r]);
      return inwards[r] ? p.negate() : p;
    });
    m.close(patch);
  }
  return m.build();
}

// =====================================================================================================================
// CRESCENT FERN: broad sickle-curved fronds and coiled young ones (glowing at night along their midribs), 0.8-3 m
// =====================================================================================================================
/**
 * A BLADE: a leaf with a little thickness, along a spine of points. At each point `side` is across it and `up` the
 * way its top faces; `half` its half width. Across it, five points (`across` 5) or three: its edges droop below its
 * midrib (`fold`). Its top and its underside are separate surfaces that meet at its edges, so it is lit right on
 * both sides and has no hole to see through.
 */
function buildBlade(m: Mesher, spine: { p: THREE.Vector3; side: THREE.Vector3; up: THREE.Vector3 }[], half: number[], o: {
  across: 3 | 5; fold: number; thick: number;
  top: (i: number, k: number) => THREE.Color; under: (i: number, k: number) => THREE.Color;
  topGlow?: (i: number, k: number) => Glow; underGlow?: (i: number, k: number) => Glow; bend: (i: number) => number;
}): void {
  const ks = o.across === 5 ? [-1, -0.45, 0, 0.45, 1] : [-1, 0, 1];
  const top: number[][] = [], under: number[][] = [];
  const p = V();
  const maxHalf = Math.max(...half);
  spine.forEach((sp, i) => {
    const rowT: number[] = [], rowU: number[] = [];
    // (as thick as it is wide, up to `thick`: at a pointed tip the two sides close to one point)
    const thick = o.thick * Math.min(1, half[i] / (maxHalf * 0.5));
    for (const k of ks) {
      p.copy(sp.p).addScaledVector(sp.side, k * half[i]).addScaledVector(sp.up, -o.fold * half[i] * k * k);
      const t = m.add(p, o.top(i, k), o.topGlow?.(i, k) ?? NO_GLOW, o.bend(i));
      rowT.push(t);
      if (Math.abs(k) === 1) { rowU.push(t); continue; }
      // (its underside: just below its top, thickest along its midrib)
      p.addScaledVector(sp.up, -thick * (1 - k * k));
      rowU.push(m.add(p, o.under(i, k), o.underGlow?.(i, k) ?? NO_GLOW, o.bend(i)));
    }
    top.push(rowT); under.push(rowU);
  });
  m.surface(top, false, (r) => spine[r].up);
  m.surface(under, false, (r) => spine[r].up.clone().negate());
}

function crescentFern(detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const plan = rng(1213);
  const m = new Mesher();
  const topTeal = hex(0x3e8a76), tipTeal = GROUND.teal, rib = hex(0xa9d8c2), edge = hex(0x2a5f55), under = hex(0x5e5086), underRib = hex(0x8d7fb4);
  // THE CROWN: a small dark knot they spring from
  lathe(m, frameAt(V(0, -0.03, 0), UP), 3, 8, (row) => [{ r: 0.07, y: 0, c: GROUND.forest }, { r: 0.05, y: 0.06, c: hex(0x3a3550) }, { r: 0, y: 0.08, c: hex(0x3a3550) }][row], () => ({ r: 0, y: -0.3 }));
  // THE FRONDS: up and out from the crown, arching over, each curved sideways like a sickle; tips curled a little
  const fronds = 6;
  const segs = near ? 11 : 4;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + plan() * 0.5;
    const len = 0.95 + plan() * 0.35, rise = 0.95 + plan() * 0.3, sickle = (plan() < 0.5 ? -1 : 1) * (0.25 + plan() * 0.2);
    const width = 0.15 + plan() * 0.04, lobes = 4 + Math.floor(plan() * 2);
    if (!near && i === fronds - 1) continue;
    const spine: { p: THREE.Vector3; side: THREE.Vector3; up: THREE.Vector3 }[] = [];
    const half: number[] = [];
    const out = V(Math.cos(a), 0, Math.sin(a)), sideH = V(-Math.sin(a), 0, Math.cos(a));
    const at = (t: number): THREE.Vector3 => {
      // (up steeply at first, then out and over; the sickle bends it sideways more toward its tip)
      const reach = len * 0.62 * Math.sin(t * Math.PI * 0.52);
      const height = rise * 0.62 * Math.sin(t * Math.PI * 0.78) * (1 - 0.35 * t * t) + 0.04;
      return V().addScaledVector(out, reach).addScaledVector(sideH, sickle * len * 0.2 * t * t).setY(height);
    };
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const p = at(t * 0.98 + 0.02);
      const ahead = at(Math.min(1, t + 0.02) * 0.98 + 0.02).sub(at(Math.max(0, t - 0.02) * 0.98 + 0.02)).normalize();
      // its top faces up and a little back toward the crown; its side is square to that and the way it goes
      // (ahead x up points to its right, the same way as sideH; steep near the crown it is short, so sideH is used)
      const side = new THREE.Vector3().crossVectors(ahead, UP);
      if (side.lengthSq() < 0.09) side.copy(sideH); else side.normalize();
      const upF = new THREE.Vector3().crossVectors(ahead, side).normalize();
      if (upF.y < 0) upF.negate();
      spine.push({ p, side, up: upF });
      // broad in its middle, narrowing to a point; its edge lobed (leaflets)
      // (a lobe a leaflet: its edge swells and narrows four or five times along it)
      const lobe = near ? 0.62 + 0.38 * Math.abs(Math.cos(t * lobes * Math.PI)) : 1;
      half.push(width * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * (0.35 + 0.65 * smooth(0, 0.25, t)) * lobe);
    }
    buildBlade(m, spine, half, {
      across: near ? 5 : 3, fold: 0.35, thick: 0.012,
      top: (k, x) => {
        const t = k / segs;
        const c = mix(topTeal, tipTeal, smooth(0.4, 1, t));
        return x === 0 ? mix(c, rib, 0.6) : Math.abs(x) === 1 ? mix(c, edge, 0.6) : c;
      },
      under: (_k, x) => (x === 0 ? underRib : under),
      // THE MIDRIB GLOWS AT NIGHT, brightest toward the tip
      topGlow: (k, x) => (x === 0 ? [0.4 + 0.5 * (k / segs), 0, 0.3] : NO_GLOW),
      underGlow: (k, x) => (x === 0 ? [0.3 + 0.4 * (k / segs), 0, 0.2] : NO_GLOW),
      bend: (k) => (k / segs) ** 1.5,
    });
  }
  // FIDDLEHEADS: young fronds still coiled, standing in the middle (near only), their coils' tips glowing at night
  if (near) {
    for (let i = 0; i < 2; i++) {
      const a = plan() * TAU, h = 0.42 + plan() * 0.2, rho0 = 0.07 + plan() * 0.02;
      const f = V(Math.cos(a), 0, Math.sin(a));
      const base = V(Math.cos(a + 1.6) * 0.03, 0, Math.sin(a + 1.6) * 0.03);
      const line: THREE.Vector3[] = [base.clone(), base.clone().setY(h * 0.35), base.clone().addScaledVector(f, 0.01).setY(h * 0.7)];
      const top = base.clone().addScaledVector(f, 0.012).setY(h);
      const centre = top.clone().addScaledVector(f, rho0);
      const turns = 9;
      for (let k = 0; k <= turns; k++) {
        const phi = (k / turns) * Math.PI * 2.4;
        const rho = rho0 * Math.exp(-0.28 * phi);
        line.push(centre.clone().addScaledVector(f, -Math.cos(phi) * rho).add(V(0, Math.sin(phi) * rho, 0)));
      }
      const fr = frames(line);
      const last = line.length - 1;
      sweep(m, fr, 5, (row) => {
        const u = row / last;
        return { r: (0.02 - 0.013 * u) * (row === last ? 0.2 : 1), c: mix(hex(0x3e7a66), hex(0xa6e0c4), u), g: [0.85 * smooth(0.55, 1, u), 0, 0.5 * u], b: 0.4 * u };
      });
    }
  }
  return m.build();
}

// =====================================================================================================================
// SPORE PODS: ribbed pods on stalks over strap leaves, seams glowing always, tips at night, 0.5-2.5 m
// =====================================================================================================================
function sporePods(detail: Detail): THREE.BufferGeometry {
  const near = detail === 'near';
  const plan = rng(1427);
  const m = new Mesher();
  const podPale = hex(0xe6cfae), podDeep = hex(0x9c6a52), rib = hex(0xf2e2c8), seam = hex(0x6c4a62), stalkC = hex(0x5d7a5c), stalkFoot = GROUND.forest;
  // STRAP LEAVES arching out over the ground (near only; their own random numbers, so the pods are the same in both)
  if (near) {
    const lr = rng(1427 + 5);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + lr() * 0.7, len = 0.45 + lr() * 0.15;
      const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
      const spine: { p: THREE.Vector3; side: THREE.Vector3; up: THREE.Vector3 }[] = [];
      const half: number[] = [];
      const segs = 4;
      const at = (t: number) => V().addScaledVector(out, len * t).setY(0.015 + 0.12 * Math.sin(Math.PI * t * 0.8) * (1 - t));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const p = at(t);
        const ahead = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
        const up = new THREE.Vector3().crossVectors(side, ahead).normalize();
        if (up.y < 0) up.negate();
        spine.push({ p, side: side.clone(), up });
        half.push(0.055 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.6);
      }
      buildBlade(m, spine, half, {
        across: 3, fold: 0.25, thick: 0.008,
        top: (_k, x) => (x === 0 ? hex(0x5d8f6e) : GROUND.forestLight),
        under: () => hex(0x3b5a4a),
        bend: (k) => 0.3 * (k / segs),
      });
    }
  }
  // THE PODS: up on curved stalks of different heights, each a ribbed onion shape closing to a pore at its tip
  const pods = near ? 5 : 4;
  for (let i = 0; i < 5; i++) {
    const h = i === 0 ? 1 : 0.45 + plan() * 0.45;
    const a = (i / 5) * TAU + plan() * 0.5, d = i === 0 ? 0 : 0.05 + plan() * 0.05, lean = 0.05 + plan() * 0.1;
    const podH = 0.26 * (0.7 + 0.3 * h), podR = 0.1 * (0.7 + 0.3 * h), ph = plan() * TAU;
    if (i >= pods) continue;
    const stalkTop = h - podH;
    const n = near ? 5 : 1;
    const line: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      line.push(V(Math.cos(a) * (d + lean * t * t), -0.02 + (stalkTop + 0.02 + podH * 0.08) * t, Math.sin(a) * (d + lean * t * t)));
    }
    const fr = frames(line);
    const stalkR = 0.018 * (0.8 + 0.2 * h);
    sweep(m, fr, near ? 6 : 4, (row) => {
      const t = row / n;
      return { r: stalkR * (1.3 - 0.3 * t), c: mix(stalkFoot, stalkC, smooth(0, 0.3, t)), b: 0.25 * t * t };
    });
    // THE POD on the stalk's tip, along the stalk's own way
    const tip = fr[n];
    const f = frameAt(tip.p, tip.t);
    const rows = near ? 9 : 4, cols = near ? 12 : 6;
    lathe(m, f, rows, cols, (row, aa) => {
      const u = row / (rows - 1);
      if (u >= 1) return { r: 0, y: podH, c: hex(0xffffff), g: [1, 0, 1], b: 0.3 };
      const body = Math.max(stalkR * 0.9, podR * Math.sin(Math.PI * u ** 0.8) ** 0.85);
      const ribs = near ? Math.cos(6 * aa + ph) : 1;
      const r = body * (1 + 0.07 * ribs);
      const isSeam = near && ribs < -0.5;
      let c = mix(podDeep, podPale, smooth(0.05, 0.5, u));
      c = isSeam ? mix(c, seam, 0.5) : ribs > 0.5 ? mix(c, rib, 0.35) : c;
      c = mix(c, hex(0xfff3e0), smooth(0.8, 1, u) * 0.6);
      // the SEAMS between its ribs glow always (faintly), its tip only at night
      const g: Glow = u > 0.82 ? [smooth(0.82, 0.97, u), 0, 0.6] : isSeam || !near ? [0.45 * smooth(0.15, 0.5, u), 1, 0.1] : NO_GLOW;
      return { r, y: podH * u - podH * 0.04, c, g, b: 0.3 };
    }, () => ({ r: 0, y: podH * 0.45 }));
  }
  return m.build();
}

// =====================================================================================================================
// EVERY VARIANT
// =====================================================================================================================
/** The builders, by variant id (floraSpecies.ts lists them with their names and sizes). */
export const FLORA_BUILDERS = {
  lanternCap, umberParasol,
  skyParasol, rustCrown,
  glowbellCluster, buttonCluster,
  bracketBoulder, bracketTiers,
  siphonCoral, crescentFern, sporePods,
} as const satisfies Record<string, (detail: Detail) => THREE.BufferGeometry>;
export type FloraId = keyof typeof FLORA_BUILDERS;
export const FLORA_IDS = Object.keys(FLORA_BUILDERS) as FloraId[];

/** One variant's two models (made when asked: a few milliseconds each). */
export function buildFlora(id: FloraId): FloraModel {
  const make = FLORA_BUILDERS[id];
  return { near: make('near'), far: make('far') };
}

/** Every variant's models at once. */
export function makeFloraModels(): Record<FloraId, FloraModel> {
  const out = {} as Record<FloraId, FloraModel>;
  for (const id of FLORA_IDS) out[id] = buildFlora(id);
  return out;
}

/** How many triangles a model has. */
export function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
