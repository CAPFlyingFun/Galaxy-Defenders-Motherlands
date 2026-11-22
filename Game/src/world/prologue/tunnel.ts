// ============================================================================
// tunnel.ts -- SCENE 1 OF THE PROLOGUE: THE PASSAGE BENEATH THE ISLAND (a BLOCKOUT).
//
// Joshua's opening demo, Draft 1 (2026-11-22), Scene 1, "Beneath the Island": "A flashlight flickers on. Ancient
// passageways stretch ahead. Roots hang from overhead cracks, and geometric markings cover the stone walls." John
// walks it to rejoin the expedition, scanning markings on the way; at its far end is the chamber (Scene 2, the next
// version).
//
// A BLOCKOUT, as agreed (Joshua, 2026-11-22: plain shapes and real light first, the art once the flow plays well):
// everything here is made in code, with no files to download.
//
//   THE PATH      a winding line on the ground (PATH below), about 100 m, its width and height changing along it.
//                 Smoothed into a curve and cut into "rings" every half metre.
//   THE WALLS     each ring an ARCH: a flat floor and walls that rise nearly straight and round over at the top (a
//                 "superellipse", fatter than a half circle, so a man fits along it standing). Rough rock: each point
//                 pushed OUTWARD by a little noise, never in, so the arch's smooth shape is the nearest the rock ever
//                 comes, and what stops him (`TunnelWalls`) can trust it. Faceted (flat shading), in strata of brown
//                 and grey stone.
//   THE ENDS      a rock face behind where he starts (the rock he has been "staring at for twenty minutes"), and at
//                 the far end a face with a narrow, glowing blue gap in it: the way into the chamber.
//   ROOTS         hanging from cracks in the roof, in clumps.
//   MARKINGS      panels of carved symbols set into the walls (story/glyphs.ts). Three can be SCANNED (the story's
//                 own); the rest are only seen. A scannable one glows faintly in A.R.C.H. teal when he is near
//                 enough to scan it, more while it is being scanned.
//
// What else the game asks of it: where he can stand (`walls`, given to his movement), how far along the passage he
// is (`progressAt`, the story's triggers), where the camera may go (`keepClear`: never into the rock), and how near the
// rock the flashlight points (`rayLength`).
//
// Units are metres; Y up; the floor is flat at y = 0 (his feet need no ground-height lookups here).
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Walls } from '../../input/playerMotion';
import type { GroundPoint } from '../collision';
import { HEROINE_RADIUS } from '../collision';
import { inscriptionCanvas, inscriptionGlowCanvas, type Inscription } from '../../story/glyphs';

/** A point the passage goes through: where (x, z), its half width and its height (metres). */
interface PathPoint { readonly x: number; readonly z: number; readonly hw: number; readonly h: number }

/**
 * THE PASSAGE, start to end. It starts at a dead end (behind where John stands), narrows and widens, squeezes under
 * roots in the middle, and opens out toward the chamber's gap at the end. GAME TUNING (the layout is a blockout).
 */
const PATH: readonly PathPoint[] = [
  { x: 0, z: -3, hw: 1.9, h: 3.0 },
  { x: 0, z: 8, hw: 1.7, h: 2.9 },
  { x: 2.5, z: 20, hw: 1.6, h: 2.8 },
  { x: 9, z: 31, hw: 2.2, h: 3.4 },
  { x: 12, z: 44, hw: 1.45, h: 2.6 },
  { x: 7, z: 56, hw: 1.6, h: 2.8 },
  { x: 4, z: 69, hw: 2.3, h: 3.5 },
  { x: 9, z: 82, hw: 2.7, h: 3.9 },
  { x: 13, z: 91, hw: 3.0, h: 4.3 },
];

/** How far apart the rings are along the passage (metres). */
const RING_STEP = 0.5;
/** Points round each arch, floor to floor. */
const ARCH_POINTS = 18;
/** The arch's shape: 2 is a half ellipse; higher, its walls stand straighter and its roof is flatter. */
const ARCH_POWER = 3;
/** How far the rock may stand OUT past the smooth arch (metres): its roughness. */
const ROCK_OUT = 0.32;
/** How far short of the smooth arch his middle stops (beyond his own size), so he never brushes the rock. */
const WALL_ROOM = 0.12;
/** The camera keeps this far inside the rock (metres). */
const CAMERA_ROOM = 0.22;

/** One marking panel, as the story knows it. */
export interface Marking {
  /** Its name in the story (`markingA`...). */
  readonly id: string;
  /** Can it be scanned (the story's own), or is it only seen? */
  readonly scannable: boolean;
  /** Where its middle is, and the way its face looks (into the passage). */
  readonly at: THREE.Vector3;
  readonly facing: THREE.Vector3;
  /** How far along the passage it is (metres from the start). */
  readonly s: number;
  readonly inscription: Inscription;
  /** Set how much it glows, 0 (not at all) .. 1 (being scanned). */
  setGlow(amount: number): void;
}

/** The passage's markings: where they are along it (metres), which wall (+1 left, -1 right), size, and what is carved. */
const MARKINGS: readonly { id: string; s: number; side: 1 | -1; y: number; w: number; h: number; scannable: boolean; worn: number; ins: Inscription }[] = [
  // (the one the story needs: John's "These markings weren't in the original survey")
  {
    id: 'markingA', s: 23, side: 1, y: 1.4, w: 1.7, h: 0.95, scannable: true, worn: 0.25,
    ins: { rows: [[101, 205, 312, 101, 418, 523], [205, 330, 101, 612, 205, 341], [418, 101, 223, 507, 101, 312]], known: new Set([101, 205, 312, 418]), reconstructed: 0.58 },
  },
  // (two more, to find: some of the same symbols, some not quite the same)
  {
    id: 'markingB', s: 40, side: -1, y: 1.3, w: 1.4, h: 0.8, scannable: true, worn: 0.45,
    ins: { rows: [[205, 101, 344, 418, 109], [312, 205, 101, 433, 205]], known: new Set([101, 205, 312, 418]), reconstructed: 0.41 },
  },
  {
    id: 'markingC', s: 63, side: 1, y: 1.5, w: 1.3, h: 1.0, scannable: true, worn: 0.6,
    ins: { rows: [[101, 650, 655, 101], [618, 101, 640, 612], [101, 601, 101, 677]], known: new Set([101]), reconstructed: 0.33 },
  },
  // (only seen: the walls are covered in them)
  { id: 'decor1', s: 7, side: -1, y: 1.6, w: 0.9, h: 0.55, scannable: false, worn: 0.7, ins: { rows: [[101, 220, 335], [440, 101, 205]], known: new Set(), reconstructed: 0 } },
  { id: 'decor2', s: 15, side: 1, y: 0.9, w: 0.8, h: 0.5, scannable: false, worn: 0.8, ins: { rows: [[312, 418, 101]], known: new Set(), reconstructed: 0 } },
  { id: 'decor3', s: 31, side: -1, y: 1.8, w: 1.0, h: 0.6, scannable: false, worn: 0.65, ins: { rows: [[523, 101, 205, 312], [101, 344, 101, 205]], known: new Set(), reconstructed: 0 } },
  { id: 'decor4', s: 51, side: 1, y: 1.1, w: 0.9, h: 0.5, scannable: false, worn: 0.75, ins: { rows: [[205, 612, 101]], known: new Set(), reconstructed: 0 } },
  { id: 'decor5', s: 74, side: -1, y: 1.7, w: 1.1, h: 0.65, scannable: false, worn: 0.5, ins: { rows: [[101, 205, 312, 418], [523, 101, 640, 101]], known: new Set(), reconstructed: 0 } },
  { id: 'decor6', s: 85, side: 1, y: 1.4, w: 1.2, h: 0.7, scannable: false, worn: 0.4, ins: { rows: [[101, 101, 205, 101], [312, 101, 418, 101]], known: new Set(), reconstructed: 0 } },
];

// ---- A little noise (rock roughness) ---------------------------------------------------------------------------------

/** A repeatable 0..1 number for a whole-numbered spot in space. */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth "value noise", 0..1: the hashed numbers at the corners round (x, y, z), blended smoothly. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
/** Three layers of it, big lumps to small (0..1). */
function rock(x: number, y: number, z: number): number {
  return 0.55 * noise3(x * 0.7, y * 0.7, z * 0.7) + 0.3 * noise3(x * 1.9, y * 1.9, z * 1.9) + 0.15 * noise3(x * 4.3, y * 4.3, z * 4.3);
}

/** The arch's smooth wall at height `y` (0 at the floor): how far out from the middle it is. */
function wallOut(hw: number, h: number, y: number): number {
  const k = Math.min(1, Math.max(0, y / h));
  return hw * Math.pow(1 - Math.pow(k, ARCH_POWER), 1 / ARCH_POWER);
}

export class Tunnel {
  /** Everything to draw: walls, floor, ends, roots, markings, the glow. */
  readonly group = new THREE.Group();
  /** What stops him (given to his movement, input/playerMotion.ts). */
  readonly walls: Walls;
  /** Where he starts: a little way from the dead end, facing along the passage. */
  readonly start: { x: number; z: number; yaw: number };
  /** How long the passage is (metres). */
  readonly length: number;
  readonly markings: readonly Marking[];
  /** The way into the chamber: where its gap is (the story's end of Scene 1). */
  readonly gapAt = new THREE.Vector3();

  // The rings (one per RING_STEP along the passage): middle, direction along, half width, height, distance along.
  private readonly px: number[] = [];
  private readonly pz: number[] = [];
  private readonly tx: number[] = [];
  private readonly tz: number[] = [];
  private readonly hw: number[] = [];
  private readonly ht: number[] = [];
  private readonly sAt: number[] = [];
  /** The ring nearest him last frame: every search starts near it. */
  private hint = 0;
  private readonly glowLight: THREE.PointLight;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private time = 0;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    // 1. THE PATH, smoothed and cut into rings
    const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
    const total = curve.getLength();
    const rings = Math.max(2, Math.round(total / RING_STEP));
    const point = new THREE.Vector3(), along = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      const t = curve.getUtoTmapping(u, 0);
      curve.getPoint(t, point);
      curve.getTangent(t, along);
      // (the width and height between the path's own points, by how far between them this ring is)
      const f = t * (PATH.length - 1), k = Math.min(PATH.length - 2, Math.floor(f)), m = f - k;
      const smooth = m * m * (3 - 2 * m);
      this.px.push(point.x); this.pz.push(point.z);
      const flat = Math.hypot(along.x, along.z) || 1;
      this.tx.push(along.x / flat); this.tz.push(along.z / flat);
      this.hw.push(PATH[k].hw + (PATH[k + 1].hw - PATH[k].hw) * smooth);
      this.ht.push(PATH[k].h + (PATH[k + 1].h - PATH[k].h) * smooth);
      this.sAt.push(u * total);
    }
    this.length = total;
    const startRing = Math.round(2.5 / RING_STEP);
    this.start = { x: this.px[startRing], z: this.pz[startRing], yaw: Math.atan2(this.tx[startRing], this.tz[startRing]) };

    // 2. THE STONE (one material for walls, floor and ends: lit, rough, faceted, coloured per point)
    const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true });
    this.disposables.push(stone);
    const walls = this.buildWalls();
    const floor = this.buildFloor();
    const ends = this.buildEnds();
    const solid = new THREE.Mesh(mergeGeometries([walls, floor, ends]), stone);
    walls.dispose(); floor.dispose(); ends.dispose();
    solid.receiveShadow = true;
    solid.castShadow = false;
    solid.name = 'tunnel rock';
    this.group.add(solid);
    this.disposables.push(solid.geometry);

    // 3. ROOTS, in clumps from cracks in the roof
    const roots = this.buildRoots();
    const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.85, flatShading: true });
    const rootMesh = new THREE.Mesh(roots, rootMaterial);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    rootMesh.name = 'tunnel roots';
    this.group.add(rootMesh);
    this.disposables.push(roots, rootMaterial);

    // 4. THE MARKINGS
    this.markings = MARKINGS.map((m) => this.buildMarking(m));

    // 5. THE WAY ON: the far end's narrow gap, glowing a faint, moving blue (the chamber's light behind it)
    const end = this.ringCount - 1;
    const ex = this.px[end], ez = this.pz[end], etx = this.tx[end], etz = this.tz[end];
    const shape = new THREE.Shape();
    // (a jagged slit, narrower at the top, as if the rock had split)
    const slit = [[-0.42, 0], [-0.5, 0.6], [-0.36, 1.2], [-0.44, 1.8], [-0.26, 2.4], [-0.12, 2.9], [0.05, 3.1], [0.16, 2.6], [0.34, 2.0], [0.3, 1.4], [0.46, 0.8], [0.38, 0]];
    shape.moveTo(slit[0][0], slit[0][1]);
    for (const [x, y] of slit.slice(1)) shape.lineTo(x, y);
    const gapGeometry = new THREE.ShapeGeometry(shape);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0x3f9dff, fog: false });
    const gap = new THREE.Mesh(gapGeometry, this.glowMaterial);
    // (in front of the end face's bulge, facing back down the passage)
    gap.position.set(ex - etx * 0.72, 0, ez - etz * 0.72);
    gap.rotation.y = Math.atan2(-etx, -etz);
    gap.name = 'chamber gap';
    this.group.add(gap);
    this.disposables.push(gapGeometry, this.glowMaterial);
    this.gapAt.set(ex - etx * 0.75, 1.4, ez - etz * 0.75);
    this.glowLight = new THREE.PointLight(0x4fa6ff, 6, 14, 2);
    this.glowLight.position.set(ex - etx * 1.8, 1.6, ez - etz * 1.8);
    this.group.add(this.glowLight);

    this.walls = { move: (x, z, sx, sz, out) => this.move(x, z, sx, sz, out) };
  }

  private get ringCount(): number { return this.px.length; }

  // ---- Building -----------------------------------------------------------------------------------------------------

  /** How much the rock is smoothed near a scannable marking (so the panel lies on the wall): 0 flat .. 1 rough. */
  private roughnessNear(s: number, side: number, y: number): number {
    let rough = 1;
    for (const m of MARKINGS) {
      if (m.side !== side) continue;
      const along = Math.abs(s - m.s) - m.w / 2, up = Math.abs(y - m.y) - m.h / 2;
      const away = Math.max(along, up);
      // (flat over the panel, rough again within half a metre of its edge)
      rough = Math.min(rough, Math.max(0.05, Math.min(1, away / 0.5)));
    }
    return rough;
  }

  /** The stone's colour at a point: strata of brown and grey, darker near the floor. */
  private stoneColour(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
    const n = rock(x * 0.8 + 11, y * 0.8, z * 0.8);
    const band = 0.5 + 0.5 * Math.sin(y * 6.5 + n * 5);
    const light = 0.24 + 0.16 * band + 0.1 * (n - 0.5);
    const floorDark = y < 0.35 ? 0.8 + y * 0.57 : 1;
    // (a brown-grey, a little warmer in the lighter bands; kept fairly grey, as the flashlight is warm already)
    out.setRGB(light * 1.07 * floorDark, light * 1.0 * floorDark, light * 0.9 * floorDark);
    return out;
  }

  private buildWalls(): THREE.BufferGeometry {
    const positions: number[] = [], colours: number[] = [], index: number[] = [];
    const colour = new THREE.Color();
    const across = ARCH_POINTS + 1;
    for (let i = 0; i < this.ringCount; i++) {
      const cx = this.px[i], cz = this.pz[i], lx = this.tz[i], lz = -this.tx[i];   // (left is the tangent turned a quarter)
      const hw = this.hw[i], h = this.ht[i], s = this.sAt[i];
      for (let j = 0; j <= ARCH_POINTS; j++) {
        // round the arch from the RIGHT floor (theta 0) over the roof to the LEFT floor (theta pi), a little below the
        // floor at each end so no crack shows where wall meets floor
        const theta = -0.06 + (Math.PI + 0.12) * (j / ARCH_POINTS);
        const c = Math.cos(theta), sn = Math.sin(theta);
        const side = Math.sign(c) || 1;
        // (the superellipse: its walls stand straighter than a half ellipse's)
        const lat = -side * hw * Math.pow(Math.abs(c), 2 / ARCH_POWER);   // (theta 0 is the right: minus "left")
        const y = (sn >= 0 ? 1 : -1) * h * Math.pow(Math.abs(sn), 2 / ARCH_POWER);
        // OUT by the rock's roughness, along the way out from the arch's middle (never in)
        const ox = lat / hw, oy = (y - h * 0.35) / h;
        const ol = Math.hypot(ox, oy) || 1;
        const wx = cx + lx * lat, wz = cz + lz * lat;
        const out = ROCK_OUT * rock(wx, y, wz) * this.roughnessNear(s, lat > 0 ? 1 : -1, y);
        const px = wx + lx * (ox / ol) * out, pz = wz + lz * (ox / ol) * out, py = y + (oy / ol) * out;
        positions.push(px, py, pz);
        this.stoneColour(px, py, pz, colour);
        colours.push(colour.r, colour.g, colour.b);
      }
    }
    for (let i = 0; i < this.ringCount - 1; i++) {
      for (let j = 0; j < ARCH_POINTS; j++) {
        const a = i * across + j, b = a + 1, c = a + across, d = c + 1;
        // (wound to face INTO the passage: it is seen from inside; up the arch x along the passage points in)
        index.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  private buildFloor(): THREE.BufferGeometry {
    // A strip along the passage, flat at y = 0, a little wider than the walls (they stand out past it, over it)
    const positions: number[] = [], colours: number[] = [], index: number[] = [];
    const colour = new THREE.Color();
    const ACROSS = 6;
    for (let i = 0; i < this.ringCount; i++) {
      const cx = this.px[i], cz = this.pz[i], lx = this.tz[i], lz = -this.tx[i];
      const half = this.hw[i] + ROCK_OUT + 0.05;
      for (let k = 0; k <= ACROSS; k++) {
        const lat = -half + (2 * half * k) / ACROSS;
        const x = cx + lx * lat, z = cz + lz * lat;
        positions.push(x, 0, z);
        // (darker, packed earth and grit)
        const n = rock(x * 1.3, 0, z * 1.3);
        const v = 0.15 + 0.1 * n;
        colour.setRGB(v * 1.07, v, v * 0.9);
        colours.push(colour.r, colour.g, colour.b);
      }
    }
    for (let i = 0; i < this.ringCount - 1; i++) {
      for (let k = 0; k < ACROSS; k++) {
        const a = i * (ACROSS + 1) + k, b = a + 1, c = a + ACROSS + 1, d = c + 1;
        // (facing up: along the passage x across to the left points up)
        index.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  /** The two rock faces closing the ends: a lumpy fan across the arch, bulging a little into the passage. */
  private buildEnds(): THREE.BufferGeometry {
    const positions: number[] = [], colours: number[] = [], index: number[] = [];
    const colour = new THREE.Color();
    const face = (ring: number, inward: number): void => {
      const cx = this.px[ring], cz = this.pz[ring], lx = this.tz[ring], lz = -this.tx[ring];
      const tx = this.tx[ring] * inward, tz = this.tz[ring] * inward;
      const hw = this.hw[ring] + ROCK_OUT, h = this.ht[ring] + ROCK_OUT;
      const base = positions.length / 3;
      const RINGS = 5;
      // (the middle first, then rings of points out to the arch's edge)
      positions.push(cx + tx * 0.35, h * 0.4, cz + tz * 0.35);
      this.stoneColour(cx, h * 0.4, cz, colour); colours.push(colour.r, colour.g, colour.b);
      for (let r = 1; r <= RINGS; r++) {
        const k = r / RINGS;
        for (let j = 0; j <= ARCH_POINTS; j++) {
          const theta = -0.06 + (Math.PI + 0.12) * (j / ARCH_POINTS);
          const c = Math.cos(theta), sn = Math.sin(theta);
          const lat = -(Math.sign(c) || 1) * hw * Math.pow(Math.abs(c), 2 / ARCH_POWER) * k;
          const y = h * 0.4 + ((sn >= 0 ? 1 : -1) * h * Math.pow(Math.abs(sn), 2 / ARCH_POWER) - h * 0.4) * k;
          const x0 = cx + lx * lat, z0 = cz + lz * lat;
          // (bulging in toward the middle, lumpy)
          const bulge = (1 - k * k) * 0.35 + (rock(x0, y, z0) - 0.5) * 0.4 * (1 - k * 0.6);
          const x = x0 + tx * bulge, z = z0 + tz * bulge;
          positions.push(x, Math.max(-0.05, y), z);
          this.stoneColour(x, y, z, colour); colours.push(colour.r, colour.g, colour.b);
        }
      }
      const across = ARCH_POINTS + 1;
      for (let j = 0; j < ARCH_POINTS; j++) {
        const a = base + 1 + j, b = a + 1;
        if (inward > 0) index.push(base, b, a); else index.push(base, a, b);
      }
      for (let r = 1; r < RINGS; r++) {
        for (let j = 0; j < ARCH_POINTS; j++) {
          const a = base + 1 + (r - 1) * across + j, b = a + 1, c = a + across, d = c + 1;
          if (inward > 0) index.push(a, b, c, b, d, c); else index.push(a, c, b, b, c, d);
        }
      }
    };
    face(0, 1);
    face(this.ringCount - 1, -1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  /** Clumps of roots from the roof: each a thin, tapering, slightly bent tube, longest where the roof is low. */
  private buildRoots(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const random = (n: number): number => hash3(n, 17, 3);
    let n = 0;
    // (a clump every few metres, more of them in the low middle stretch)
    for (let s = 4; s < this.length - 4; s += 3 + random(n++) * 4) {
      const ring = Math.min(this.ringCount - 1, Math.round(s / RING_STEP));
      const cx = this.px[ring], cz = this.pz[ring], lx = this.tz[ring], lz = -this.tx[ring];
      const hw = this.hw[ring], h = this.ht[ring];
      const many = 2 + Math.floor(random(n++) * (h < 3 ? 5 : 3));
      const crackLat = (random(n++) - 0.5) * hw * 0.9;
      for (let r = 0; r < many; r++) {
        const lat = crackLat + (random(n++) - 0.5) * 0.6;
        const top = wallOut(hw, h, 0) > Math.abs(lat) ? h * Math.pow(1 - Math.pow(Math.abs(lat) / hw, ARCH_POWER), 1 / ARCH_POWER) : h * 0.6;
        const x = cx + lx * lat + this.tx[ring] * (random(n++) - 0.5) * 0.8;
        const z = cz + lz * lat + this.tz[ring] * (random(n++) - 0.5) * 0.8;
        // (never so long that his head walks into it: a root ends at least 2.1 m up, or in a low roof at 0.4 m long)
        const long = Math.max(0.25, Math.min(0.4 + random(n++) * 1.3, top - 2.1));
        const bend = new THREE.Vector3((random(n++) - 0.5) * 0.25, 0, (random(n++) - 0.5) * 0.25);
        const points = [0, 0.33, 0.66, 1].map((k) => new THREE.Vector3(x + bend.x * k * k, top + 0.15 - long * k, z + bend.z * k * k));
        const path = new THREE.CatmullRomCurve3(points);
        const tube = new THREE.TubeGeometry(path, 5, 0.03 + random(n++) * 0.025, 5, false);
        // (tapering: each ring of the tube drawn in toward its line, more toward the tip)
        const pos = tube.attributes.position as THREE.BufferAttribute;
        const centre = new THREE.Vector3();
        for (let v = 0; v < pos.count; v++) {
          const ringOf = Math.floor(v / 6);
          const k = ringOf / 5;
          path.getPointAt(Math.min(1, k), centre);
          const taper = 1 - k * 0.85;
          pos.setXYZ(v, centre.x + (pos.getX(v) - centre.x) * taper, centre.y + (pos.getY(v) - centre.y) * taper, centre.z + (pos.getZ(v) - centre.z) * taper);
        }
        tube.deleteAttribute('uv');
        tube.computeVertexNormals();
        parts.push(tube);
      }
    }
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return merged;
  }

  private buildMarking(m: (typeof MARKINGS)[number]): Marking {
    const ring = Math.min(this.ringCount - 1, Math.round(m.s / RING_STEP));
    const cx = this.px[ring], cz = this.pz[ring], lx = this.tz[ring], lz = -this.tx[ring];
    // (on the smooth wall at its height, a couple of centimetres proud of it; the rock is smoothed there)
    const lat = m.side * (wallOut(this.hw[ring], this.ht[ring], m.y) - 0.02);
    const at = new THREE.Vector3(cx + lx * lat, m.y, cz + lz * lat);
    const facing = new THREE.Vector3(-lx * m.side, 0, -lz * m.side);
    // THE CARVING (story/glyphs.ts), and, for one that can be scanned, the same symbols in white to glow with
    const pixels = 256;
    const carved = new THREE.CanvasTexture(inscriptionCanvas(m.ins, Math.round(pixels * m.w / m.h), pixels, m.worn, m.s * 31));
    carved.colorSpace = THREE.SRGBColorSpace;
    carved.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: carved, transparent: true, roughness: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.disposables.push(carved, material);
    if (m.scannable) {
      // (the same symbols, worn the same, in white on black: only they glow)
      const source = carved.image as HTMLCanvasElement;
      const glow = new THREE.CanvasTexture(inscriptionGlowCanvas(m.ins, source.width, source.height, m.worn, m.s * 31));
      glow.colorSpace = THREE.SRGBColorSpace;
      material.emissiveMap = glow;
      material.emissive = new THREE.Color(0x5ee8c8);
      material.emissiveIntensity = 0;
      this.disposables.push(glow);
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), material);
    panel.position.copy(at);
    panel.lookAt(at.x + facing.x, at.y, at.z + facing.z);
    panel.receiveShadow = true;
    panel.name = `marking ${m.id}`;
    this.group.add(panel);
    this.disposables.push(panel.geometry);
    return {
      id: m.id, scannable: m.scannable, at, facing, s: m.s, inscription: m.ins,
      setGlow: (amount: number) => { material.emissiveIntensity = Math.max(0, Math.min(1.6, amount * 1.6)); },
    };
  }

  // ---- Where he is, and where he can go -------------------------------------------------------------------------------

  /**
   * The ring segment nearest (x, z), looked for round `from` (or everywhere): its first ring, how far along it (0..1,
   * or past either end of the passage), the distance across from the passage's middle line (left +), and the
   * passage's half width and height there.
   */
  private nearest(x: number, z: number, from: number | null): { i: number; t: number; lat: number; along: number; hw: number; h: number; d: number } {
    const last = this.ringCount - 2;
    const lo = from === null ? 0 : Math.max(0, from - 24), hi = from === null ? last : Math.min(last, from + 24);
    let best = { i: lo, t: 0, lat: 0, along: 0, hw: this.hw[lo], h: this.ht[lo], d: Infinity };
    for (let i = lo; i <= hi; i++) {
      const ax = this.px[i], az = this.pz[i], bx = this.px[i + 1], bz = this.pz[i + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const raw = ((x - ax) * dx + (z - az) * dz) / len2;
      const t = Math.min(1, Math.max(0, raw));
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < best.d) {
        const lx = this.tz[i], lz = -this.tx[i];
        best = {
          i, t: i === 0 && raw < 0 ? raw : i === last && raw > 1 ? raw : t,
          lat: (x - qx) * lx + (z - qz) * lz, along: 0,
          hw: this.hw[i] + (this.hw[i + 1] - this.hw[i]) * t, h: this.ht[i] + (this.ht[i + 1] - this.ht[i]) * t, d,
        };
        // (past the start or the end: how far past, along the passage)
        best.along = best.t < 0 ? best.t * Math.sqrt(len2) : best.t > 1 ? (best.t - 1) * Math.sqrt(len2) : 0;
      }
    }
    return best;
  }

  /** How far along the passage (x, z) is, metres from its start (the story's triggers). Also follows him for searches. */
  progressAt(x: number, z: number): number {
    const n = this.nearest(x, z, this.hint);
    this.hint = n.i;
    return this.sAt[n.i] + RING_STEP * Math.min(1, Math.max(0, n.t));
  }

  /** His step from (x, z): where it really ends, kept inside the passage (sliding along a wall). */
  private move(x: number, z: number, stepX: number, stepZ: number, out: GroundPoint): GroundPoint {
    let nx = x + stepX, nz = z + stepZ;
    const n = this.nearest(nx, nz, this.hint);
    const i = n.i, lx = this.tz[i], lz = -this.tx[i];
    const room = Math.max(0.2, n.hw - HEROINE_RADIUS - WALL_ROOM);
    const endRoom = HEROINE_RADIUS + 0.35;
    // the middle line's point he is beside
    const qx = nx - lx * n.lat, qz = nz - lz * n.lat;
    let lat = Math.max(-room, Math.min(room, n.lat));
    let bx = qx, bz = qz;
    // (at either end of the passage: no further than the end face, less his own size)
    const startGap = this.sAt[i] + RING_STEP * n.t;
    if (startGap < endRoom) {
      const back = endRoom - startGap;
      bx += this.tx[i] * back; bz += this.tz[i] * back;
    } else if (startGap > this.length - endRoom) {
      const back = startGap - (this.length - endRoom);
      bx -= this.tx[i] * back; bz -= this.tz[i] * back;
    }
    nx = bx + lx * lat; nz = bz + lz * lat;
    out.x = nx; out.z = nz;
    return out;
  }

  /** Is the point (x, y, z) inside the passage, at least `room` metres from the rock? (and the ring it was found by) */
  private inside(x: number, y: number, z: number, room: number, from: number): { ok: boolean; i: number } {
    const n = this.nearest(x, z, from);
    if (y < room) return { ok: false, i: n.i };
    const s = this.sAt[n.i] + RING_STEP * n.t;
    if (s < room + 0.4 || s > this.length - room - 0.4) return { ok: false, i: n.i };
    const hw = n.hw - room, h = n.h - room;
    if (hw <= 0 || h <= 0) return { ok: false, i: n.i };
    const k = Math.pow(Math.abs(n.lat) / hw, ARCH_POWER) + Math.pow(Math.max(0, y) / h, ARCH_POWER);
    return { ok: k <= 1, i: n.i };
  }

  /**
   * THE CAMERA KEPT IN THE PASSAGE (cameraRig.ts `keepClear`): looking from `from` (by her, inside) to where the camera
   * wants to be (`to`), the camera comes in along that line to just short of the first rock in the way.
   */
  keepClear(from: THREE.Vector3, to: THREE.Vector3): void {
    const STEPS = 10;
    let lastIn = 0, ring = this.hint;
    // (the point it looks from must itself be in the passage: under a low roof the camera's pivot, above her head,
    //  can be in the rock; it comes down until it is not)
    for (let k = 0; k < 24 && !this.inside(from.x, from.y, from.z, CAMERA_ROOM, ring).ok && from.y > CAMERA_ROOM + 0.1; k++) from.y -= 0.1;
    const probe = (k: number): boolean => {
      const r = this.inside(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k, CAMERA_ROOM, ring);
      ring = r.i;
      return r.ok;
    };
    for (let s = 1; s <= STEPS; s++) {
      if (probe(s / STEPS)) { lastIn = s / STEPS; continue; }
      // (between the last point inside and this one: halve the gap a few times to find the rock's edge)
      let a = lastIn, b = s / STEPS;
      for (let h = 0; h < 6; h++) { const m = (a + b) / 2; if (probe(m)) a = m; else b = m; }
      to.set(from.x + (to.x - from.x) * a, from.y + (to.y - from.y) * a, from.z + (to.z - from.z) * a);
      return;
    }
  }

  /**
   * How far a line from `origin` along `dir` (one unit long) goes before it meets rock (metres, at most `most`): how
   * near the wall the flashlight is pointed (flashlight.ts dims itself close to rock).
   */
  rayLength(origin: THREE.Vector3, dir: THREE.Vector3, most: number): number {
    const STEP = 0.4;
    let ring = this.hint;
    for (let d = STEP; d <= most; d += STEP) {
      const r = this.inside(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d, 0, ring);
      ring = r.i;
      if (!r.ok) return d;
    }
    return most;
  }

  /** Once a frame: the chamber's light behind the gap moves a little (it is alive). */
  update(dt: number): void {
    this.time += dt;
    const flicker = 0.75 + 0.15 * Math.sin(this.time * 1.7) + 0.1 * Math.sin(this.time * 4.3 + 1);
    this.glowLight.intensity = 6 * flicker;
    this.glowMaterial.color.setRGB(0.25 * flicker, 0.62 * flicker, 1.0 * flicker);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.glowLight.dispose();
  }
}
