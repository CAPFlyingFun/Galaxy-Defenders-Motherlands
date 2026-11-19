// ============================================================================
// suitGear.ts -- THE SUIT'S 3D PIECES, made to fit HER: tall flat combat
// boots, wrist cuffs and shoulder plates (Joshua, 2026-11-18: his outfit design
// 2, the gray and red suit, docs/reference/outfits/02-catsuit-gray-red.png;
// "just make tall flat combat style boots").
//
// HOW A PIECE IS FITTED. Every piece rides ONE bone (her shin, her foot, her
// forearm, her upper arm) as a rigid shell, so it moves exactly as that part
// of her moves. It is shaped round HER OWN SKIN, measured when she is made:
//
//   1. Her skin's points are posed as she stands (the same sums the graphics
//      card does to bend her skin with her bones: "skinning"), and the points
//      that bone carries most are kept.
//   2. Round the bone's line, in slices along it and in angles round it, the
//      FURTHEST point out is found: her outline there.
//   3. The shell is built that far out plus a small gap, with a wall of its
//      own thickness, smoothed so it does not copy every bump.
//
// So the boots are her calves' and feet's shape and size, the cuffs her
// wrists', and they would fit another heroine's body just as well.
//
// A FOOT IS NOT ROUND, so the boot's foot is built differently: in slices from
// her heel to her toes, each slice a rounded box as wide as her foot there and
// as tall as her instep, down to a flat sole just under her own sole.
//
// What each piece looks like (colours, bands, glowing strips) comes from a
// `SuitGearStyle` (looks/gear.ts) so another outfit can reuse the fitting.
//
// Nothing here runs per frame: the pieces are children of her bones.
// ============================================================================
import * as THREE from 'three';
import type { Hand } from '../../core/contracts';

/** The colours and choices of one outfit's pieces (looks/gear.ts). */
export interface SuitGearStyle {
  /** The main plate colour, the darker trim, the accent (red), the sole, and the glowing strips. */
  readonly plate: string;
  readonly trim: string;
  readonly accent: string;
  readonly sole: string;
  /** The glowing strips' colour; empty: no glowing strips. */
  readonly glow: string;
  /** Which pieces: tall boots, wrist cuffs, shoulder plates. */
  readonly boots: boolean;
  readonly cuffs: boolean;
  readonly shoulders: boolean;
}

/** GAME TUNING: sizes of the pieces (metres) and where on each bone they sit (shares of the bone's length). */
export const SUIT_GEAR = Object.freeze({
  /** Slices along a piece and angles round it, when it is measured and built. */
  slices: 18,
  around: 28,
  /** Clear of her skin, and the wall's thickness, for the boot's shaft, the cuffs and the shoulder plates. */
  bootGap: 0.005, bootWall: 0.006,
  cuffGap: 0.004, cuffWall: 0.009,
  shoulderGap: 0.007, shoulderWall: 0.007,
  /** The boot's shaft: from this share of her shin down from her knee, to a little past her ankle. */
  bootTop: 0.24, bootBottom: 1.06,
  /** The red band at the top of the shaft, and the glowing ring under it (shares of her shin). */
  bootBand: 0.1, bootGlowAt: 0.36, glowHalf: 0.004, glowOut: 0.0015,
  /** The boot's foot: how far its collar rises over her ankle joint, its sole's thickness, its toe's length past her toes. */
  collarUp: 0.06, sole: 0.012, toePast: 0.012, footGap: 0.005, footWall: 0.005,
  /** The cuffs: from this share of her forearm to this (her wrist is 1). */
  cuffFrom: 0.7, cuffTo: 0.97,
  /** The shoulder plate: from this share of her upper arm (above her shoulder joint: minus) to this, and how far round. */
  shoulderFrom: -0.12, shoulderTo: 0.3, shoulderHalfAngle: 95,
});

/** What the pieces are fitted from. */
export interface SuitGearSource {
  readonly skin: THREE.SkinnedMesh;
  /** Her skin's points as shaped now (her mesh's own units), and which four bones move each one, and how much. */
  readonly points: Float32Array;
  readonly skinIndex: ArrayLike<number>;
  readonly skinWeight: ArrayLike<number>;
  /** Her root (facing +Z as she stands), and which side is her left (+1: +x). */
  readonly root: THREE.Object3D;
  readonly leftSign: number;
  /** Each side's bones: upper arm, forearm, hand; thigh, shin, foot. */
  readonly arm: Record<Hand, { readonly upper: THREE.Bone; readonly fore: THREE.Bone; readonly hand: THREE.Bone }>;
  readonly leg: Record<Hand, { readonly thigh: THREE.Bone; readonly shin: THREE.Bone; readonly foot: THREE.Bone }>;
}

export interface SuitGear {
  /** Every piece (already on her bones). */
  readonly meshes: readonly THREE.Object3D[];
  dispose(): void;
}

const v = new THREE.Vector3(), w = new THREE.Vector3();

/** One piece's surface colour at a place on it: `t` along it (0..1), `angle` round it (degrees, 0 her front). */
type Paint = (t: number, angle: number) => THREE.Color;

/**
 * Build an outfit's pieces on her. She must be standing (her bones in her stand pose) when this is called.
 */
export function buildSuitGear(src: SuitGearSource, style: SuitGearStyle): SuitGear {
  const { skin, points, skinIndex, skinWeight, root } = src;
  const bones = skin.skeleton.bones;
  root.updateMatrixWorld(true);
  skin.updateMatrixWorld(true);
  skin.skeleton.update();

  // ---- 1. her skin's points as she stands, in the world, each with the bone that carries it most ------------------
  const count = points.length / 3;
  const posed = new Float32Array(count * 3);
  const strongest = new Int32Array(count);
  {
    const boneMatrices = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skin.skeleton.boneInverses[k]));
    const bind = skin.bindMatrix, toWorld = new THREE.Matrix4().copy(skin.matrixWorld).multiply(skin.bindMatrixInverse);
    const p = new THREE.Vector3(), sum = new THREE.Vector3(), part = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.fromArray(points, i * 3).applyMatrix4(bind);
      sum.set(0, 0, 0);
      let best = -1, most = -1;
      for (let c = 0; c < 4; c++) {
        const wt = skinWeight[i * 4 + c];
        if (wt <= 0) continue;
        const k = skinIndex[i * 4 + c];
        sum.addScaledVector(part.copy(p).applyMatrix4(boneMatrices[k]), wt);
        if (wt > most) { most = wt; best = k; }
      }
      sum.applyMatrix4(toWorld);
      posed[i * 3] = sum.x; posed[i * 3 + 1] = sum.y; posed[i * 3 + 2] = sum.z;
      strongest[i] = best;
    }
  }
  /** The points carried most by one of these bones (or anything hanging from them, with `below`), in that bone's space. */
  const pointsOn = (bone: THREE.Bone, below: boolean): THREE.Vector3[] => {
    const set = new Set<number>([bones.indexOf(bone)]);
    if (below) bone.traverse((n) => { const k = bones.indexOf(n as THREE.Bone); if (k >= 0) set.add(k); });
    const toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) if (set.has(strongest[i])) out.push(new THREE.Vector3(posed[i * 3], posed[i * 3 + 1], posed[i * 3 + 2]).applyMatrix4(toBone));
    return out;
  };
  /** A direction in the world (her root's frame) as a direction in a bone's own space. */
  const dirIn = (bone: THREE.Bone, x: number, y: number, z: number): THREE.Vector3 => {
    const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    return new THREE.Vector3(x, y, z).transformDirection(root.matrixWorld).applyQuaternion(q).normalize();
  };
  /** Where a bone's child joint is, in the bone's own space (its line runs from 0 to here). */
  const childAt = (bone: THREE.Bone, child: THREE.Bone): THREE.Vector3 => bone.worldToLocal(child.getWorldPosition(new THREE.Vector3()));

  // ---- the materials: one for the plates (each point its own colour), one for the glowing strips ---------------------
  const plateMaterial = new THREE.MeshStandardMaterial({ name: 'suit-gear', vertexColors: true, roughness: 0.42, metalness: 0.25 });
  const glowColour = new THREE.Color(style.glow || '#000000');
  const glowMaterial = new THREE.MeshStandardMaterial({ name: 'suit-gear-glow', color: glowColour, emissive: glowColour, emissiveIntensity: 1.6, roughness: 0.4 });
  const C = { plate: new THREE.Color(style.plate), trim: new THREE.Color(style.trim), accent: new THREE.Color(style.accent), sole: new THREE.Color(style.sole) };
  const meshes: THREE.Object3D[] = [];
  const add = (bone: THREE.Bone, geometry: THREE.BufferGeometry, material: THREE.Material, name: string): void => {
    if (material === glowMaterial && !style.glow) { geometry.dispose(); return; }   // (an outfit with no glowing strips)
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;   // (it rides a bone that moves: its own box would be wrong)
    bone.add(mesh);
    meshes.push(mesh);
  };

  for (const hand of ['left', 'right'] as const) {
    const side = hand === 'left' ? src.leftSign : -src.leftSign;   // her left or right, as +x or -x of her root
    const arm = src.arm[hand], leg = src.leg[hand];

    // ---- THE BOOT'S SHAFT: round her shin, from under her knee to past her ankle --------------------------------
    if (style.boots) {
      const line = childAt(leg.shin, leg.foot);
      const front = dirIn(leg.shin, 0, 0, 1), outward = dirIn(leg.shin, side, 0, 0);
      const profile = measureRound(pointsOn(leg.shin, false), line, front, outward, SUIT_GEAR.bootTop, SUIT_GEAR.bootBottom);
      const paint: Paint = (t, angle) => {
        const share = SUIT_GEAR.bootTop + (SUIT_GEAR.bootBottom - SUIT_GEAR.bootTop) * t;
        if (share < SUIT_GEAR.bootTop + SUIT_GEAR.bootBand) return C.accent;                 // the red band at the top
        if (Math.abs(angle) < 16 && share < 0.78) return C.accent;                          // a red stripe down her shin's front
        if (Math.abs(Math.abs(angle) - 180) < 40) return C.trim;                            // the darker back
        return C.plate;
      };
      add(leg.shin, roundShell(profile, SUIT_GEAR.bootGap, SUIT_GEAR.bootWall, paint, 360), plateMaterial, `boot-shaft-${hand}`);
      // the glowing ring round the shaft under its red band
      const glowT = (SUIT_GEAR.bootGlowAt - SUIT_GEAR.bootTop) / (SUIT_GEAR.bootBottom - SUIT_GEAR.bootTop);
      add(leg.shin, glowRing(profile, glowT, SUIT_GEAR.bootGap + SUIT_GEAR.bootWall + SUIT_GEAR.glowOut, SUIT_GEAR.glowHalf / Math.max(1e-3, profile.length)), glowMaterial, `boot-glow-${hand}`);

      // ---- THE BOOT'S FOOT: her foot and toes, down to a flat sole, with a collar up round her ankle ----------
      add(leg.foot, footShell(pointsOn(leg.foot, true), dirIn(leg.foot, 0, 0, 1), dirIn(leg.foot, 0, 1, 0), dirIn(leg.foot, side, 0, 0), C), plateMaterial, `boot-foot-${hand}`);
    }

    // ---- THE WRIST CUFF: round her forearm, by her wrist ------------------------------------------------------------
    if (style.cuffs) {
      const line = childAt(arm.fore, arm.hand);
      const front = dirIn(arm.fore, 0, 0, 1), outward = dirIn(arm.fore, side, 0, 0);
      const profile = measureRound(pointsOn(arm.fore, false), line, front, outward, SUIT_GEAR.cuffFrom, SUIT_GEAR.cuffTo);
      const paint: Paint = (t) => (t < 0.12 || t > 0.88 ? C.plate : C.trim);
      add(arm.fore, roundShell(profile, SUIT_GEAR.cuffGap, SUIT_GEAR.cuffWall, paint, 360), plateMaterial, `cuff-${hand}`);
      // a glowing slot on its outer side
      add(arm.fore, glowPatch(profile, 0.5, 90, 0.3, 22, SUIT_GEAR.cuffGap + SUIT_GEAR.cuffWall + SUIT_GEAR.glowOut), glowMaterial, `cuff-glow-${hand}`);
    }

    // ---- THE SHOULDER PLATE: over the top and outside of her shoulder ---------------------------------------------
    if (style.shoulders) {
      const line = childAt(arm.upper, arm.fore);
      // (round her upper arm, "front" is straight UP: the plate is centred over the top of her shoulder, leaning out)
      const up = dirIn(arm.upper, side * 0.45, 1, 0), outward = dirIn(arm.upper, 0, 0, -1);
      const profile = measureRound(pointsOn(arm.upper, false), line, up, outward, SUIT_GEAR.shoulderFrom, SUIT_GEAR.shoulderTo, SUIT_GEAR.shoulderHalfAngle);
      const paint: Paint = (t, angle) => (Math.abs(angle) > SUIT_GEAR.shoulderHalfAngle - 16 || t > 0.86 ? C.accent : C.plate);
      add(arm.upper, roundShell(profile, SUIT_GEAR.shoulderGap, SUIT_GEAR.shoulderWall, paint, SUIT_GEAR.shoulderHalfAngle * 2), plateMaterial, `shoulder-${hand}`);
      add(arm.upper, glowPatch(profile, 0.5, 0, 0.55, 5, SUIT_GEAR.shoulderGap + SUIT_GEAR.shoulderWall + SUIT_GEAR.glowOut), glowMaterial, `shoulder-glow-${hand}`);
    }
  }

  return {
    meshes,
    dispose(): void {
      for (const m of meshes) { m.removeFromParent(); (m as THREE.Mesh).geometry.dispose(); }
      plateMaterial.dispose();
      glowMaterial.dispose();
    },
  };
}

// ------------------------------------------------------------------ measuring round a bone

/** Her outline round a bone: for each slice along it and each angle round it, how far out her skin reaches. */
interface RoundProfile {
  /** The bone's line in its own space (from 0), its length, and the two directions round it (angle 0, and +90). */
  readonly axis: THREE.Vector3;
  readonly length: number;
  readonly front: THREE.Vector3;
  readonly side: THREE.Vector3;
  /** Where the piece starts and ends along the line (shares of its length). */
  readonly from: number;
  readonly to: number;
  /** How far round it goes each way from angle 0 (degrees; 180: all the way round). */
  readonly halfAngle: number;
  /** radius[slice][angle] (metres), slices from `from` to `to`, angles from -halfAngle to +halfAngle. */
  readonly radius: Float32Array[];
  /**
   * True when (front, side, along) is a MIRRORED frame (her other side's piece is the mirror of this one): its faces
   * must be wound the other way round, or they face inward and only the inside of the piece is seen.
   */
  readonly mirrored: boolean;
}

function measureRound(pts: readonly THREE.Vector3[], line: THREE.Vector3, frontDir: THREE.Vector3, sideDir: THREE.Vector3, from: number, to: number, halfAngle = 180): RoundProfile {
  const S = SUIT_GEAR.slices, A = SUIT_GEAR.around, length = line.length();
  const axis = line.clone().normalize();
  // two directions square to the line: "front" (angle 0) and "side" (angle +90)
  const front = frontDir.clone().addScaledVector(axis, -frontDir.dot(axis)).normalize();
  const side = new THREE.Vector3().crossVectors(axis, front).normalize();
  if (side.dot(sideDir) < 0) side.negate();
  const full = halfAngle >= 180;
  const radius = Array.from({ length: S + 1 }, () => new Float32Array(A + (full ? 0 : 1)).fill(-1));
  const slab = (to - from) / S;
  for (const p of pts) {
    const along = p.dot(axis) / length;
    if (along < from - slab || along > to + slab) continue;
    v.copy(p).addScaledVector(axis, -along * length);
    const r = v.length();
    if (r > 0.25) continue;   // (nothing of a limb is that far from its bone)
    const angle = Math.atan2(v.dot(side), v.dot(front)) * (180 / Math.PI);
    if (!full && Math.abs(angle) > halfAngle + 20) continue;
    const s = Math.round(((along - from) / (to - from)) * S);
    const a = full
      ? ((Math.round(((angle + 360) % 360) / (360 / A)) % A) + A) % A
      : Math.round(((angle + halfAngle) / (2 * halfAngle)) * A);
    for (const ss of [s - 1, s, s + 1]) {
      if (ss < 0 || ss > S) continue;
      const aa = Math.min(radius[ss].length - 1, Math.max(0, a));
      if (r > radius[ss][aa]) radius[ss][aa] = r;
    }
  }
  // places with no point of her skin: their neighbours' (round, then along), and at worst the median of all
  const all: number[] = [];
  for (const row of radius) for (const r of row) if (r > 0) all.push(r);
  all.sort((x, y) => x - y);
  const median = all.length ? all[all.length >> 1] : 0.04;
  for (let pass = 0; pass < 6; pass++) {
    for (let s = 0; s <= S; s++) {
      const row = radius[s], n = row.length;
      for (let a = 0; a < n; a++) {
        if (row[a] > 0) continue;
        const near = [full ? row[(a + 1) % n] : row[Math.min(n - 1, a + 1)], full ? row[(a - 1 + n) % n] : row[Math.max(0, a - 1)], s > 0 ? radius[s - 1][a] : -1, s < S ? radius[s + 1][a] : -1].filter((r) => r > 0);
        if (near.length) row[a] = Math.max(...near);
      }
    }
  }
  for (const row of radius) for (let a = 0; a < row.length; a++) if (row[a] <= 0) row[a] = median;
  // smoothed (so the shell does not copy every bump), never inside her outline
  const smoothRows = radius.map((row, s) => row.map((r, a) => {
    const n = row.length;
    const at = (ss: number, aa: number): number => radius[Math.min(S, Math.max(0, ss))][full ? (aa + n) % n : Math.min(n - 1, Math.max(0, aa))];
    const mean = (at(s, a - 1) + at(s, a + 1) + at(s - 1, a) + at(s + 1, a) + 2 * r) / 6;
    return Math.max(r, mean);
  }));
  const mirrored = new THREE.Vector3().crossVectors(front, side).dot(axis) < 0;
  return { axis, length, front, side, from, to, halfAngle, radius: smoothRows.map((row) => Float32Array.from(row)), mirrored };
}

/** A point on a profile's surface: slice `s` (may be fractional), angle step `a`, `out` metres outside her outline. */
function profilePoint(p: RoundProfile, s: number, a: number, out: number, target: THREE.Vector3): THREE.Vector3 {
  const S = p.radius.length - 1, n = p.radius[0].length, full = p.halfAngle >= 180;
  const s0 = Math.min(S, Math.max(0, Math.floor(s))), s1 = Math.min(S, s0 + 1), fs = Math.min(1, Math.max(0, s - s0));
  const aa = full ? ((a % n) + n) % n : Math.min(n - 1, Math.max(0, a));
  const r = p.radius[s0][aa] * (1 - fs) + p.radius[s1][aa] * fs + out;
  const angle = full ? (aa / n) * 2 * Math.PI : ((aa / (n - 1)) * 2 - 1) * p.halfAngle * (Math.PI / 180);
  const along = (p.from + (p.to - p.from) * (s / S)) * p.length;
  return target.copy(p.axis).multiplyScalar(along)
    .addScaledVector(p.front, Math.cos(angle) * r)
    .addScaledVector(p.side, Math.sin(angle) * r);
}
/** The angle (degrees, 0 the front) of angle step `a` on a profile. */
const angleOf = (p: RoundProfile, a: number): number => {
  const n = p.radius[0].length;
  if (p.halfAngle >= 180) { const d = (a / n) * 360; return d > 180 ? d - 360 : d; }
  return ((a / (n - 1)) * 2 - 1) * p.halfAngle;
};

/** A geometry from lists of points, colours and triangles. */
function made(positions: number[], colours: number[], index: number[], mirrored = false): THREE.BufferGeometry {
  // (a mirrored frame: every triangle wound the other way, so it faces out)
  if (mirrored) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colours.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A SHELL round a profile: its outside `gap + wall` out from her outline, its inside `gap` out, its edges closed.
 * Each point coloured by `paint`. `spanDegrees` 360: a closed ring; less: a plate (its two sides closed too).
 */
function roundShell(p: RoundProfile, gap: number, wall: number, paint: Paint, spanDegrees: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length, full = spanDegrees >= 360;
  const cols = full ? n : n;   // (angle steps)
  const positions: number[] = [], colours: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  // outside surface (layer 0) then inside surface (layer 1)
  for (let layer = 0; layer < 2; layer++) {
    for (let s = 0; s <= S; s++) for (let a = 0; a < cols; a++) {
      profilePoint(p, s, a, gap + (layer === 0 ? wall : 0), at);
      positions.push(at.x, at.y, at.z);
      const c = paint(s / S, angleOf(p, a));
      colours.push(c.r, c.g, c.b);
    }
  }
  const id = (layer: number, s: number, a: number): number => layer * (S + 1) * cols + s * cols + (full ? ((a % cols) + cols) % cols : a);
  const quad = (a0: number, a1: number, b0: number, b1: number, flip: boolean): void => {
    if (flip) index.push(a0, b0, a1, a1, b0, b1); else index.push(a0, a1, b0, a1, b1, b0);
  };
  const steps = full ? cols : cols - 1;
  for (let s = 0; s < S; s++) for (let a = 0; a < steps; a++) {
    quad(id(0, s, a), id(0, s, a + 1), id(0, s + 1, a), id(0, s + 1, a + 1), false);   // outside, facing out
    quad(id(1, s, a), id(1, s, a + 1), id(1, s + 1, a), id(1, s + 1, a + 1), true);    // inside, facing in
  }
  // its two ends: outside to inside
  for (let a = 0; a < steps; a++) {
    quad(id(0, 0, a), id(0, 0, a + 1), id(1, 0, a), id(1, 0, a + 1), true);
    quad(id(0, S, a), id(0, S, a + 1), id(1, S, a), id(1, S, a + 1), false);
  }
  // a plate's two long sides
  if (!full) for (let s = 0; s < S; s++) {
    quad(id(0, s, 0), id(0, s + 1, 0), id(1, s, 0), id(1, s + 1, 0), false);
    quad(id(0, s, cols - 1), id(0, s + 1, cols - 1), id(1, s, cols - 1), id(1, s + 1, cols - 1), true);
  }
  return made(positions, colours, index, p.mirrored);
}

/** A thin GLOWING RING round a profile at `t` (0..1 along it), `half` of a share of its length wide each way. */
function glowRing(p: RoundProfile, t: number, out: number, half: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length;
  const positions: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  const rows = [Math.max(0, (t - half * (p.to - p.from) ** -1) * S), Math.min(S, (t + half * (p.to - p.from) ** -1) * S)];
  for (const s of rows) for (let a = 0; a < n; a++) { profilePoint(p, s, a, out, at); positions.push(at.x, at.y, at.z); }
  for (let a = 0; a < n; a++) { const b = (a + 1) % n; index.push(a, b, n + a, b, n + b, n + a); }
  return made(positions, [], index, p.mirrored);
}

/** A GLOWING PATCH on a profile: centred at `t` along it and `angle` round it, `tSpan` long (share) and `angleSpan` degrees wide. */
function glowPatch(p: RoundProfile, t: number, angle: number, tSpan: number, angleSpan: number, out: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length, full = p.halfAngle >= 180;
  // the angle as a (fractional) angle step
  const stepOf = (deg: number): number => (full ? (((deg + 360) % 360) / 360) * n : ((deg / p.halfAngle + 1) / 2) * (n - 1));
  const positions: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  const K = 6;
  for (let i = 0; i <= K; i++) for (let j = 0; j <= 1; j++) {
    const s = (t - tSpan / 2 + (tSpan * i) / K) * S;
    const a = stepOf(angle + (j - 0.5) * angleSpan);
    const a0 = Math.floor(a), fa = a - a0;
    const pa = profilePoint(p, s, a0, out, new THREE.Vector3()), pb = profilePoint(p, s, a0 + 1, out, at);
    pa.lerp(pb, fa);
    positions.push(pa.x, pa.y, pa.z);
  }
  for (let i = 0; i < K; i++) { const r = i * 2; index.push(r, r + 1, r + 2, r + 1, r + 3, r + 2); }
  return made(positions, [], index, p.mirrored);
}

// ------------------------------------------------------------------ the boot's foot

/**
 * THE BOOT'S FOOT round her foot's points (in her foot bone's space): slices from her heel to her toes, each a rounded
 * box as wide as her foot there and as tall as her instep, down to a flat sole just under her own sole; a collar rises
 * round her ankle so the shaft above overlaps it.
 */
function footShell(pts: readonly THREE.Vector3[], forward: THREE.Vector3, up: THREE.Vector3, outward: THREE.Vector3, C: { plate: THREE.Color; trim: THREE.Color; accent: THREE.Color; sole: THREE.Color }): THREE.BufferGeometry {
  const T = SUIT_GEAR;
  // a frame on the floor: forward (heel to toe), up, across
  const fwd = forward.clone().addScaledVector(up, -forward.dot(up)).normalize();
  const across = new THREE.Vector3().crossVectors(up, fwd).normalize();
  if (across.dot(outward) < 0) across.negate();
  // her foot's points in that frame
  let back = Infinity, toe = -Infinity, low = Infinity;
  const f = pts.map((p) => { const q = { z: p.dot(fwd), y: p.dot(up), x: p.dot(across) }; back = Math.min(back, q.z); toe = Math.max(toe, q.z); low = Math.min(low, q.y); return q; });
  const ankleTop = T.collarUp;   // (the bone's origin is her ankle joint: the collar rises this far over it)
  const S = 16;
  const length = toe - back;
  // for each slice: her foot's half widths (inner, outer) and its top
  const inner = new Float32Array(S + 1).fill(0), outer = new Float32Array(S + 1).fill(0), top = new Float32Array(S + 1).fill(low + 0.02);
  for (const q of f) {
    if (q.y > ankleTop + 0.02) continue;
    const s = Math.round(((q.z - back) / length) * S);
    if (s < 0 || s > S) continue;
    if (q.x > outer[s]) outer[s] = q.x;
    if (-q.x > inner[s]) inner[s] = -q.x;
    if (q.y > top[s]) top[s] = q.y;
  }
  for (let s = 0; s <= S; s++) {
    // (slices with too few points take their neighbours'; widths never under 2 cm a side)
    if (outer[s] < 0.02) outer[s] = s > 0 ? outer[s - 1] : 0.035;
    if (inner[s] < 0.02) inner[s] = s > 0 ? inner[s - 1] : 0.035;
  }
  const floor = low - T.sole + 0.006;   // (its sole's underside: a few millimetres under her own sole)
  const gap = T.footGap, wall = T.footWall;
  const R = 20;   // points round each slice
  const positions: number[] = [], colours: number[] = [], index: number[] = [];
  // each slice is a rounded box from the sole's top to her top there, from her inside to her outside
  const ring = (s: number, extraBack: number): void => {
    const share = s / S;
    const z = back - gap - wall - extraBack + share * (length + 2 * (gap + wall) + T.toePast + extraBack);
    // the toe tapers to a rounded front, the heel to a rounded back
    const tipTaper = Math.sin(Math.min(1, share * 6) * (Math.PI / 2)) * Math.sin(Math.min(1, (1 - share) * 5) * (Math.PI / 2));
    const ins = (inner[s] + gap + wall) * (0.55 + 0.45 * tipTaper), outs = (outer[s] + gap + wall) * (0.55 + 0.45 * tipTaper);
    // (the collar round her ankle eases down over her instep to her toes: no step)
    const collar = 1 - Math.min(1, Math.max(0, (share - 0.25) / 0.35));
    const ease = collar * collar * (3 - 2 * collar);
    const yTop = Math.max(top[s], top[s] + (ankleTop - top[s]) * ease) + gap + wall;
    const yLow = floor;
    for (let k = 0; k < R; k++) {
      // round the slice: a superellipse (a box with round corners)
      const a = (k / R) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const ex = Math.sign(cx) * Math.pow(Math.abs(cx), 0.55), ey = Math.sign(cy) * Math.pow(Math.abs(cy), 0.55);
      const x = ex > 0 ? ex * outs : ex * ins;
      const y = yLow + (ey + 1) * 0.5 * (yTop - yLow);
      const p = new THREE.Vector3().addScaledVector(across, x).addScaledVector(up, y).addScaledVector(fwd, z);
      positions.push(p.x, p.y, p.z);
      // colours: the sole (the lowest band), a darker toe cap, a red heel counter, the plate elsewhere
      const height = (y - yLow) / Math.max(1e-3, yTop - yLow);
      const c = height < 0.16 ? C.sole : share > 0.78 ? C.trim : share < 0.2 && height < 0.7 ? C.accent : C.plate;
      colours.push(c.r, c.g, c.b);
    }
  };
  for (let s = 0; s <= S; s++) ring(s, 0);
  for (let s = 0; s < S; s++) for (let k = 0; k < R; k++) {
    const a = s * R + k, b = s * R + ((k + 1) % R), c = (s + 1) * R + k, d = (s + 1) * R + ((k + 1) % R);
    index.push(a, c, b, b, c, d);
  }
  // closed ends: a fan at the heel and at the toe
  const capAt = (s: number, flip: boolean): void => {
    const centre = positions.length / 3;
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < R; k++) { x += positions[(s * R + k) * 3]; y += positions[(s * R + k) * 3 + 1]; z += positions[(s * R + k) * 3 + 2]; }
    positions.push(x / R, y / R, z / R);
    colours.push(C.trim.r, C.trim.g, C.trim.b);
    for (let k = 0; k < R; k++) { const a = s * R + k, b = s * R + ((k + 1) % R); if (flip) index.push(centre, b, a); else index.push(centre, a, b); }
  };
  capAt(0, false);
  capAt(S, true);
  // (her other foot's frame is the mirror of this one's: its faces wound the other way)
  return made(positions, colours, index, new THREE.Vector3().crossVectors(across, up).dot(fwd) > 0);
}

/** (kept for a later outfit's thinner pieces: a point between two) */
export const midway = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 => w.copy(a).lerp(b, 0.5);
