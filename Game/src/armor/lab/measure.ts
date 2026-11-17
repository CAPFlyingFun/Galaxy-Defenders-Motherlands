// ============================================================================
// measure.ts -- measure the real body, so the armor is built to fit it.
//
// Run from the armor lab (armor-lab.html?measure=1). It produces the BodyFit
// that is saved as armor/bodyFitData.ts:
//
//  1. WHERE EACH PIECE'S FRAME SITS. Every piece is built in a simple frame of
//     its own (see each builder): its origin at a joint, +Y pointing back up
//     the limb (so the limb runs down -Y), +Z to her front, +X to the limb's
//     outer side. Here that frame is worked out for the real skeleton, in the
//     pose the file loads in (standing, arms a little out, feet flat), and
//     written down RELATIVE TO THE BONE, so it holds in every pose.
//
//  2. HOW BIG SHE IS THERE. She is stood up (the builder's standing pose,
//     feet pitched for heels) and every corner of her skin is looked at from
//     inside each slot's frame: how far out her skin reaches at each height
//     and direction round a limb, how big her head and feet are, and so on.
// ============================================================================
import * as THREE from 'three';
import type { ArmorSlot, BodyFit, Extent, FootSlice, LimbProfile, PolarMap, SlotFit } from '../bodyFit';
import type { ArmorBone, Mannequin } from './mannequin';

/** Heels: each foot pitched this far toes-down (radians; about 24 degrees: a 7-8 cm block heel on her foot). */
export const HEEL_PITCH = 0.42;
/** The boot's sole under the ball of her foot (metres). */
export const SOLE_LIFT = 0.014;

const UP = new THREE.Vector3(0, 1, 0), FRONT = new THREE.Vector3(0, 0, 1);
const round = (v: number, d = 4) => +v.toFixed(d);

/** How far the middle of the gun's grip sits from the wrist: along the hand, and into the palm (metres). */
const GRIP_ALONG = 0.085, GRIP_INTO_PALM = 0.034;

/**
 * Tidy a table of "furthest skin" readings so armor built from it is smooth and never inside her:
 * empty cells are filled from their neighbours, each cell takes the largest reading around it, and the result is
 * blurred a little. `wrap` joins the table's left and right edges (a table that goes all the way round a limb).
 */
function tidy(rows: number[][], wrap: boolean): number[][] {
  const R = rows.length, C = rows[0].length;
  const get = (t: number[][], r: number, c: number) => t[Math.min(R - 1, Math.max(0, r))][wrap ? ((c % C) + C) % C : Math.min(C - 1, Math.max(0, c))];
  let t = rows.map((row) => [...row]);
  for (let pass = 0; pass < 12; pass++) {
    let holes = 0;
    const next = t.map((row) => [...row]);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (t[r][c] > 0) continue;
      const near = Math.max(get(t, r, c - 1), get(t, r, c + 1), get(t, r - 1, c), get(t, r + 1, c));
      if (near > 0) next[r][c] = near; else holes++;
    }
    t = next;
    if (!holes) break;
  }
  const pass = (src: number[][], fn: (vals: number[]) => number) => src.map((row, r) => row.map((_x, c) => {
    const vals: number[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) vals.push(get(src, r + dr, c + dc));
    return fn(vals);
  }));
  t = pass(t, (v) => Math.max(...v));
  t = pass(t, (v) => v.reduce((a, b) => a + b, 0) / v.length);
  return t;
}

/** A frame from an origin, the direction its +Y points, and roughly where its +Z should point. */
function frame(origin: THREE.Vector3, y: THREE.Vector3, zHint: THREE.Vector3): THREE.Matrix4 {
  const Y = y.clone().normalize();
  const Z = zHint.clone().addScaledVector(Y, -zHint.dot(Y)).normalize(); // the hint, with any lean along Y taken out
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(origin);
}

export function measureBody(m: Mannequin): BodyFit {
  const B = m.bones, rest = (b: ArmorBone) => m.restWorld.get(B[b])!;
  const at = (b: ArmorBone) => new THREE.Vector3().setFromMatrixPosition(rest(b));
  const dir = (from: ArmorBone, to: ArmorBone) => at(from).sub(at(to)); // points back UP the limb

  // ---- 1. Each slot's frame in the rest pose, then relative to its bone ----
  const frames = {} as Record<ArmorSlot, { bone: ArmorBone; world: THREE.Matrix4 }>;
  frames.head = { bone: 'head', world: frame(at('head'), UP, FRONT) };
  for (const s of ['L', 'R'] as const) {
    const sh = `shoulder${s}` as const, el = `elbow${s}` as const, wr = `wrist${s}` as const;
    const hip = `hip${s}` as const, kn = `knee${s}` as const, an = `ankle${s}` as const, toe = `toe${s}` as const;
    frames[`shoulder${s}`] = { bone: sh, world: frame(at(sh), dir(sh, el), FRONT) };
    frames[`forearm${s}`] = { bone: el, world: frame(at(el), dir(el, wr), FRONT) };
    frames[`thigh${s}`] = { bone: hip, world: frame(at(hip), dir(hip, kn), FRONT) };
    frames[`knee${s}`] = { bone: kn, world: frame(at(kn), dir(kn, an), FRONT) };
    frames[`shin${s}`] = { bone: kn, world: frame(at(kn), dir(kn, an), FRONT) };
    frames[`hip${s}`] = { bone: 'pelvis', world: frame(at(hip), UP, FRONT) };
    // The boot: level with the floor once the foot is pitched for heels, its +Z along the foot. In the rest pose
    // (foot flat) that is the level frame tipped back by the heel pitch.
    const along = at(toe).sub(at(an)).setY(0).normalize();
    const level = frame(at(an), UP, along);
    const side = new THREE.Vector3().setFromMatrixColumn(level, 0);
    frames[`foot${s}`] = { bone: an, world: new THREE.Matrix4().makeRotationAxis(side, -HEEL_PITCH).multiply(level).setPosition(at(an)) };
    // The gun: +Z from the wrist along the hand, +Y toward the thumb (her front, in the rest pose).
    // (the hand's direction: from the wrist to the middle of where her fingers start)
    const fingers = new THREE.Vector3(), roots = B[wr].children.filter((c) => (c as THREE.Bone).isBone);
    for (const r of roots) fingers.add(new THREE.Vector3().setFromMatrixPosition(m.restWorld.get(r as THREE.Bone)!));
    fingers.multiplyScalar(1 / roots.length);
    const hand = fingers.clone().sub(at(wr)).normalize();
    const Z = hand, Y = FRONT.clone().addScaledVector(Z, -FRONT.dot(Z)).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
    // Its origin is the middle of the grip: a little way along the hand, and into her palm. With her arms at her
    // sides her palms face her thighs: that is -X of this frame for her left hand and +X for her right.
    const palmSide = X.clone().multiplyScalar(s === 'L' ? -1 : 1);
    const grip = at(wr).addScaledVector(Z, GRIP_ALONG).addScaledVector(palmSide, GRIP_INTO_PALM);
    frames[`gun${s}`] = { bone: wr, world: new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(grip) };
  }
  const local = {} as Record<ArmorSlot, THREE.Matrix4>;
  const slots = {} as Record<ArmorSlot, SlotFit>;
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (const [slot, f] of Object.entries(frames) as Array<[ArmorSlot, (typeof frames)[ArmorSlot]]>) {
    local[slot] = rest(f.bone).clone().invert().multiply(f.world);
    local[slot].decompose(p, q, sc);
    slots[slot] = { bone: B[f.bone].name, joint: f.bone, position: [round(p.x, 5), round(p.y, 5), round(p.z, 5)], quaternion: [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)], scale: round(sc.x, 5) };
  }

  // ---- 2. Stand her up in heels and look at her skin from inside each slot's frame ----
  m.setShape(0, 0);
  m.stand(HEEL_PITCH, SOLE_LIFT);
  const skin = m.skin, n = skin.geometry.attributes.position.count;
  const si = skin.geometry.attributes.skinIndex as THREE.BufferAttribute, sw = skin.geometry.attributes.skinWeight as THREE.BufferAttribute;
  const allBones = skin.skeleton.bones;
  /** How much of each skin corner belongs to a bone and everything hanging from it (0..1). */
  const share = (top: THREE.Bone): Float32Array => {
    const set = new Set<number>();
    top.traverse((o) => { const k = allBones.indexOf(o as THREE.Bone); if (k >= 0) set.add(k); });
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (set.has(si.getComponent(i, k))) out[i] += sw.getComponent(i, k);
    return out;
  };
  const armL = share(B.shoulderL), armR = share(B.shoulderR), legL = share(B.hipL), legR = share(B.hipR), headShare = share(B.neck), handL = share(B.wristL), handR = share(B.wristR);
  /** The world -> slot-frame matrix for the pose she is in now. */
  const toSlot = (slot: ArmorSlot) => new THREE.Matrix4().multiplyMatrices(B[frames[slot].bone].matrixWorld, local[slot]).invert();
  const v = new THREE.Vector3();
  const each = (world: Float32Array, slot: ArmorSlot, fn: (v: THREE.Vector3, i: number) => void) => {
    const inv = toSlot(slot);
    for (let i = 0; i < n; i++) { v.set(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]).applyMatrix4(inv); fn(v, i); }
  };
  /**
   * Her two sides are not perfect mirror images (she is a scan of a real person), but each right-side piece is the
   * left-side piece mirrored. So everything paired is measured on BOTH sides, her right side flipped over onto her
   * left, and the larger reading kept: one piece then fits either side. `fn` is told how much of each corner
   * belongs to that side's limb.
   */
  const bothSides = (world: Float32Array, base: 'shoulder' | 'forearm' | 'thigh' | 'shin' | 'foot' | 'gun' | 'hip', partL: Float32Array, partR: Float32Array, fn: (v: THREE.Vector3, part: number, i: number) => void) => {
    each(world, `${base}L`, (pt, i) => fn(pt, partL[i], i));
    each(world, `${base}R`, (pt, i) => { pt.x = -pt.x; fn(pt, partR[i], i); });
  };
  const world = m.skinPositions();

  const limb = (base: 'forearm' | 'thigh' | 'shin', partL: Float32Array, partR: Float32Array, y0: number, yEnd: number, dy = 0.015, cols = 24): LimbProfile => {
    const rowsN = Math.round((y0 - yEnd) / dy) + 1, rows: number[][] = [];
    for (let r = 0; r < rowsN; r++) rows.push(new Array<number>(cols).fill(0));
    bothSides(world, base, partL, partR, (pt, part) => {
      if (part < 0.5) return;
      const r = Math.round((y0 - pt.y) / dy);
      if (r < 0 || r >= rowsN) return;
      const a = Math.atan2(pt.x, pt.z), c = ((Math.round((a / (Math.PI * 2)) * cols) % cols) + cols) % cols, rad = Math.hypot(pt.x, pt.z);
      if (rad > rows[r][c]) rows[r][c] = rad;
    });
    return { y0, dy, rows: tidy(rows, true).map((row) => row.map((x) => round(x))) };
  };
  const forearm = limb('forearm', armL, armR, 0.03, -0.27);
  const shin = limb('shin', legL, legR, 0.09, -0.42);
  const thigh = limb('thigh', legL, legR, -0.06, -0.40);

  const boxOf = (slot: ArmorSlot, keep: (v: THREE.Vector3, i: number) => boolean): Extent => {
    const b = new THREE.Box3();
    each(world, slot, (pt, i) => { if (keep(pt, i)) b.expandByPoint(pt); });
    return { min: [round(b.min.x), round(b.min.y), round(b.min.z)], max: [round(b.max.x), round(b.max.y), round(b.max.z)] };
  };
  const boxBoth = (base: 'shoulder' | 'foot' | 'gun', partL: Float32Array, partR: Float32Array, keep: (v: THREE.Vector3, part: number) => boolean): Extent => {
    const b = new THREE.Box3();
    bothSides(world, base, partL, partR, (pt, part) => { if (keep(pt, part)) b.expandByPoint(pt); });
    return { min: [round(b.min.x), round(b.min.y), round(b.min.z)], max: [round(b.max.x), round(b.max.y), round(b.max.z)] };
  };
  // Her head: the chin is the lowest point of her face well in front of her neck.
  let chinY = Infinity;
  each(world, 'head', (pt, i) => { if (headShare[i] > 0.5 && pt.z > 0.055 && pt.y < chinY && pt.y > -0.2) chinY = pt.y; });
  const headBox = boxOf('head', (pt, i) => headShare[i] > 0.5 && pt.y > chinY - 0.005);
  // (her neck where the helmet ends: its radius about a point 3 cm behind the head joint, the widest in the 4 cm under her chin)
  let neckRadius = 0;
  each(world, 'head', (pt) => { if (pt.y < chinY - 0.012 && pt.y > chinY - 0.055 && pt.z < 0.05) neckRadius = Math.max(neckRadius, Math.hypot(pt.x, pt.z + 0.03)); });
  // Her shoulder: everything of her within reach of the pad, on the joint's outer side.
  const one = new Float32Array(n).fill(1);
  const shoulder = boxBoth('shoulder', one, one, (pt) => pt.length() < 0.15 && pt.x > -0.04 && pt.y > -0.13);

  // The same shoulder as a map of directions, from a point just under the joint (her head and her other arm left out).
  const mapCenter = new THREE.Vector3(-0.005, -0.025, 0), mapRows = 13, mapCols = 24;
  const sm: number[][] = [];
  for (let r = 0; r < mapRows; r++) sm.push(new Array<number>(mapCols).fill(0));
  // (for each shoulder, the OTHER arm is the one to leave out)
  const notOtherL = new Float32Array(n), notOtherR = new Float32Array(n);
  for (let i = 0; i < n; i++) { notOtherL[i] = headShare[i] > 0.5 || armR[i] > 0.5 ? 0 : 1; notOtherR[i] = headShare[i] > 0.5 || armL[i] > 0.5 ? 0 : 1; }
  bothSides(world, 'shoulder', notOtherL, notOtherR, (pt, keep) => {
    if (!keep) return;
    pt.sub(mapCenter);
    const len = pt.length();
    if (len > 0.2 || len < 1e-4) return;
    const r = Math.round(((Math.asin(pt.y / len) + Math.PI / 2) / Math.PI) * (mapRows - 1));
    const c = ((Math.round((Math.atan2(pt.x, pt.z) / (Math.PI * 2)) * mapCols) % mapCols) + mapCols) % mapCols;
    if (len > sm[r][c]) sm[r][c] = len;
  });
  const shoulderMap: PolarMap = { center: [mapCenter.x, mapCenter.y, mapCenter.z], rows: tidy(sm, true).map((row) => row.map((x) => round(x))) };

  // Her foot, slice by slice from behind the heel to the tips of her toes.
  const foot: FootSlice[] = [];
  const z0 = -0.09, dz = 0.01, slicesN = 31;
  for (let k = 0; k < slicesN; k++) foot.push({ z: round(z0 + k * dz), xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
  bothSides(world, 'foot', legL, legR, (pt, part) => {
    if (part < 0.5 || pt.y > 0.03) return;
    const k = Math.round((pt.z - z0) / dz);
    if (k < 0 || k >= slicesN) return;
    const s = foot[k] as { -readonly [K in keyof FootSlice]: FootSlice[K] };
    s.xMin = Math.min(s.xMin, pt.x); s.xMax = Math.max(s.xMax, pt.x); s.yMin = Math.min(s.yMin, pt.y); s.yMax = Math.max(s.yMax, pt.y);
  });
  const footOut = foot.filter((s) => s.xMin < s.xMax).map((s) => ({ z: s.z, xMin: round(s.xMin), xMax: round(s.xMax), yMin: round(s.yMin), yMax: round(s.yMax) }));
  const ankle = new THREE.Vector3().setFromMatrixPosition(B.ankleL.matrixWorld);
  const footCollar = boxBoth('foot', legL, legR, (pt, part) => part > 0.5 && pt.y > 0 && pt.y < 0.085);

  // Her hand.
  const handBox = boxBoth('gun', handL, handR, (_pt, part) => part > 0.6);
  const palm = new THREE.Vector3();
  let palmN = 0;
  each(world, 'gunL', (pt, i) => { if (handL[i] > 0.6 && pt.z > -0.03 && pt.z < 0.03) { palm.add(pt); palmN++; } });
  palm.multiplyScalar(1 / Math.max(1, palmN));

  // The side of her hip, at every belly size (a pouch there must clear the biggest).
  const y0 = 0.16, hz0 = -0.16, step = 0.02, hr = 22, hc = 17;
  const hip: number[][] = [];
  for (let r = 0; r < hr; r++) hip.push(new Array<number>(hc).fill(0));
  for (const belly of [0, 70, 150, 200]) {
    m.setShape(belly, 0);
    m.stand(HEEL_PITCH, SOLE_LIFT);
    const w = m.skinPositions();
    const noArms = new Float32Array(n);
    for (let i = 0; i < n; i++) noArms[i] = armL[i] > 0.3 || armR[i] > 0.3 ? 0 : 1;
    bothSides(w, 'hip', noArms, noArms, (pt, keep) => {
      if (!keep) return;
      const r = Math.round((y0 - pt.y) / step), c = Math.round((pt.z - hz0) / step);
      if (r < 0 || r >= hr || c < 0 || c >= hc) return;
      if (pt.x > hip[r][c]) hip[r][c] = pt.x;
    });
  }
  m.setShape(0, 0);
  m.stand(HEEL_PITCH, SOLE_LIFT);

  return {
    source: 'Char_B/public/models/sarah-v2-body-slim.glb',
    height: 1.7,
    heelPitch: HEEL_PITCH,
    soleLift: SOLE_LIFT,
    ankleHeight: round(ankle.y),
    slots,
    head: { box: headBox, chinY: round(chinY), neckRadius: round(neckRadius) },
    shoulder, shoulderMap, forearm, shin, thigh,
    foot: footOut,
    footCollar,
    hand: { box: handBox, palm: [round(palm.x), round(palm.y), round(palm.z)] },
    hipSide: { y0, z0: hz0, step, rows: tidy(hip, false).map((row) => row.map((x) => round(x))) },
  };
}
