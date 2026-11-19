// ============================================================================
// paintMask.ts -- a HAND-PAINTED paint layer, painted by code instead of by hand.
//
// WHAT THE BUILDER GIVES US. A saved character has three paint layers. Each is
// either a TEMPLATE (leggings, a sports bra...: its edges are drawn by the
// builder, razor sharp) or a hand-painted MASK. A mask is very simple: ONE
// NUMBER FOR EVERY POINT (vertex) OF HER SKIN, 0 = bare, 255 = fully painted,
// all of them in a row and written as base64 text (Char_B: `bodyPaint.ts`
// `packLayer`, `fabricLibrary.ts` `bytesToBase64`, read back in
// `fabricPanel.ts` `putOnClothes`).
//
// HOW THE EDGE IS DRAWN. Between her skin's points the number is blended
// smoothly, and the builder's shader draws the paint's edge exactly where the
// blended number crosses one half (`fabricMaterial.ts` `fabricEdge`), sharpened
// to one pixel. So a mask of plain 0s and 255s gives a sawtooth edge along her
// triangles, but a mask that RAMPS -- 128 on the wanted line, rising gently
// inside it and falling gently outside -- gives a clean line that cuts straight
// THROUGH her triangles. That is what this file makes: for each point of her
// skin we work out HOW FAR INSIDE a shape it is (a "signed distance": plus
// inside, minus outside) and turn that distance into the ramp.
//
// WHY IT IS MADE WHEN SHE LOADS, not stored as text in her look. The mask is a
// number per point of her skin, and her full skin and her light (phone) skin
// have different points. So the game makes the mask for whichever skin she is
// wearing, straight after the builder has loaded her (builderRoom.ts), and
// hands it to the builder as an ordinary saved character with a mask in it.
//
// WHAT A SHAPE IS MEASURED ON. Paint is on her legs here, so each point is
// given a place on its own leg (`LegPlace`): how far down the leg, which way
// round the leg, and how far from the leg's bone. A shape written with those
// numbers follows her leg whatever her proportions are.
// ============================================================================
import * as THREE from 'three';
import { readBindJoints } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
import { PAINT_ATTRIBUTE } from '@charb/sarahlab/bodyPaint';
import { bytesToBase64 } from '@charb/sarahlab/fabricLibrary';

/** Where one point of her skin is on its own leg. Lengths are in LEG LENGTHS (hip joint to ankle = 1, about 78 cm). */
export interface LegPlace {
  /** How far down her leg, on the straight line from hip joint to ankle: 0 at the hip joint, `knee` at the knee, 1 at the ankle. Below 0: above her hip joint. */
  along: number;
  /** Which way round her leg, in degrees: 0 the front, +90 the OUTER side, 180 or -180 the back, -90 the inner side. */
  turn: number;
  /** How far the point is from the leg's bone (leg lengths). Turns an angle into a distance along her skin. */
  radius: number;
}

/** Her skin as a mask painter sees it. */
export interface PaintSurface {
  /** How many points her skin has (the mask has one number for each). */
  readonly count: number;
  /** Where her knee is along her leg (about 0.47). */
  readonly knee: number;
  /**
   * Fill `out` with point `v`'s place on its leg. False when the point is not paintable leg or hip skin (her arms and
   * hands, and everything above her waist): `trunkPlace` and `armPlace` cover those.
   */
  legPlace(v: number, out: LegPlace): boolean;
  /**
   * Fill `out` with point `v`'s place on her TRUNK (her hips, belly, chest, back and shoulders up to the base of her
   * neck). Here `along` is how far UP her trunk: 0 at her hip joints, 1 at the base of her neck; `turn` is degrees
   * round a line straight up through the middle of her hips (0 her front, +90 her side, 180 her back; the same on both
   * sides, mirrored, as on her legs); `radius` how far the point is from that line (leg lengths: her belly's front is
   * far out). False for her arms, her head and neck, and her legs below her hip joints.
   */
  trunkPlace(v: number, out: LegPlace): boolean;
  /**
   * Fill `out` with point `v`'s place on its ARM: `along` 0 at her shoulder joint, 1 at her wrist (her elbow about
   * half way), on past 1 over her hand to her fingertips (about 1.4); `turn` degrees round her arm (0 its front, +90
   * its OUTER side, away from her body, 180 its back); `radius` how far from the arm's bone (leg lengths). False for
   * anything that is not an arm or a hand.
   */
  armPlace(v: number, out: LegPlace): boolean;
  /**
   * Fill `out` with point `v`'s place on her NECK and head (Joshua, 2026-11-19: the catsuit's collar "going up to her
   * neck"): `along` 0 at the base of her neck, 1 at the very top of her head (her collar's top is about a quarter of
   * the way); `turn` degrees round the line from the one to the other (0 her front, +90 her side, 180 her back);
   * `radius` how far from that line (leg lengths). False below the base of her neck and for her arms.
   */
  neckPlace(v: number, out: LegPlace): boolean;
}

/**
 * A mask painter: given her skin, return for every point HOW FAR INSIDE the painted shapes it is, in leg lengths
 * (plus inside, minus outside, 0 exactly on the edge). `finishMask` turns that into the mask.
 */
export type MaskPainter = (surface: PaintSurface) => Float32Array;

/**
 * How wide the ramp is on each side of an edge, in leg lengths (0.06 is about 4.7 cm). It has to be wider than her
 * skin's triangles, or the edge falls back to following them; wider than needed only costs very thin shapes.
 */
const RAMP = 0.06;

/** No leg or hip skin is further than this from its leg's bone (leg lengths; her thigh's is about 0.14 at its thickest). */
const MAX_LEG_RADIUS = 0.24;

/** How far past her wrist an arm's place still counts (shares of shoulder-to-wrist): her whole hand, to her fingertips. */
const HAND_MOST = 1.6;

/** Low on her trunk, a point nearer than this to the line up her middle (leg lengths) is between her legs: not painted. */
const TRUNK_NEAR_AXIS = 0.09;

/** Signed distances (leg lengths) to the mask's bytes: 128 on the edge, 255 a ramp's width inside, 0 a ramp's width outside. */
export function finishMask(distance: Float32Array): Uint8Array {
  const bytes = new Uint8Array(distance.length);
  for (let v = 0; v < distance.length; v++) {
    const weight = 0.5 + distance[v] / (2 * RAMP);
    bytes[v] = Math.round(Math.min(1, Math.max(0, Number.isFinite(weight) ? weight : 0)) * 255);
  }
  return bytes;
}

/** The mask as the builder's saved character keeps it: base64 text, one byte a point. */
export function maskText(painter: MaskPainter, surface: PaintSurface): string {
  return bytesToBase64(finishMask(painter(surface)));
}

// ------------------------------------------------------------------ shapes (signed distances)

const RADIANS = Math.PI / 180;
/** The smallest turn from angle `b` to angle `a`, degrees, between -180 and 180. */
export const turnBetween = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

/**
 * A PLATE: a panel on her leg with rounded corners, like a piece of armor laid on it.
 * It runs down her leg from `from` to `to` (leg lengths), is centred `centre` degrees round her leg, and is
 * `widthTop` degrees wide (to each side of its centre) at its top and `widthBottom` at its bottom. `corner` is how
 * round its corners are (leg lengths). Returns how far inside the plate the place is (minus: outside).
 */
export function plate(place: LegPlace, shape: { from: number; to: number; centre: number; widthTop: number; widthBottom: number; corner: number }): number {
  const middle = (shape.from + shape.to) / 2, halfLength = (shape.to - shape.from) / 2;
  // how far down the plate we are, 0 at its top and 1 at its bottom, and so how wide the plate is here
  const share = Math.min(1, Math.max(0, (place.along - shape.from) / Math.max(1e-6, shape.to - shape.from)));
  const halfWidth = (shape.widthTop + (shape.widthBottom - shape.widthTop) * share) * RADIANS * place.radius;
  // the place measured from the plate's middle: across her skin (an angle times the radius) and down her leg
  const across = Math.abs(turnBetween(place.turn, shape.centre)) * RADIANS * place.radius;
  const down = Math.abs(place.along - middle);
  // the usual "rounded box" distance: a box smaller by the corner's radius, grown back out by that radius
  const corner = Math.min(shape.corner, halfWidth, halfLength);
  const qx = across - (halfWidth - corner), qy = down - (halfLength - corner);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)), inside = Math.min(Math.max(qx, qy), 0);
  return corner - (outside + inside);
}

/**
 * A STRIPE: a band of one width that sweeps round her leg as it goes down it.
 * `path(along)` says where its middle is (degrees round her leg) at each height; `half` is half its width (leg
 * lengths); it runs from `from` to `to` down her leg and its two ends are rounded.
 */
export function stripe(place: LegPlace, shape: { from: number; to: number; half: number; path: (along: number) => number }): number {
  const along = Math.min(shape.to, Math.max(shape.from, place.along));
  // how steeply the stripe sweeps here: a stripe that slants is measured square to itself, not straight across
  const step = 0.004, slope = ((shape.path(along + step) - shape.path(along - step)) / (2 * step)) * RADIANS * place.radius;
  const across = (turnBetween(place.turn, shape.path(along)) * RADIANS * place.radius) / Math.sqrt(1 + slope * slope);
  const past = Math.abs(place.along - along);
  return shape.half - Math.hypot(across, past);
}

// ------------------------------------------------------------------ her skin, measured

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The point a share `t` of the way from `a` to `b`. */
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Her body's skin inside the builder's room: the one mesh that carries the builder's paint. Null before she is painted. */
export function findPaintedSkin(model: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  model.traverse((n) => {
    const mesh = n as THREE.SkinnedMesh;
    if (!found && mesh.isSkinnedMesh && mesh.geometry.getAttribute(PAINT_ATTRIBUTE)) found = mesh;
  });
  return found;
}

/**
 * Measure her skin for a mask painter: her leg joints from her skeleton (the builder's own measuring code names them),
 * her skin's points, and which points are her arms' (never painted).
 *
 * WHICH COPY OF HER POINTS. Her points are read AS SHE IS SHAPED NOW (the geometry's `position`: her body with her
 * belly and proportions laid in by the builder, before any pose), not from the builder's untouched rest copy
 * (`fabricRest`). The reason was MEASURED (2026-11-16, Blaze at 100%): shaping her slides the skin of her hips and
 * upper thighs along her body by up to 2 cm, each point by its own amount. A line that is smooth on the rest copy
 * came out as a row of 1 cm teeth across the top of her thigh; the same line worked out on her shaped skin is
 * smooth. The price: the mask is exact for the belly she is LOADED with. From her knee up to about a third of the
 * way to her hip (below `along` 0.30) her skin does not slide at any belly size, so edges there stay clean always;
 * higher up, an edge can pick up small teeth as her belly moves far from the size she was loaded with.
 */
export function measureSkin(skin: THREE.SkinnedMesh): PaintSurface {
  const geometry = skin.geometry;
  const points = geometry.getAttribute('position') as THREE.BufferAttribute;   // (her shaped skin: see above)
  const count = points.count;

  // ---- her joints, in the space her rest points are in -------------------------------------------------------
  const bind = readBindJoints(skin), joints = measureHuman(bind).joints;
  const at = (j: number): V3 => [bind[j].x, bind[j].y, bind[j].z];
  const legs = [
    { hip: at(joints.hipL), knee: at(joints.kneeL), ankle: at(joints.ankleL) },
    { hip: at(joints.hipR), knee: at(joints.kneeR), ankle: at(joints.ankleR) },
  ].map((leg) => {
    // the straight line from hip joint to ankle, and where along it her knee is (0 hip, 1 ankle: about 0.47)
    const line = sub(leg.ankle, leg.hip), lineSquared = dot(line, line);
    return { ...leg, line, lineSquared, kneeAt: dot(sub(leg.knee, leg.hip), line) / lineSquared };
  });
  const legLength = (Math.sqrt(legs[0].lineSquared) + Math.sqrt(legs[1].lineSquared)) / 2;
  const middleX = (legs[0].hip[0] + legs[1].hip[0]) / 2;
  const hipHeight = (legs[0].hip[1] + legs[1].hip[1]) / 2;

  // ---- which bones are an arm's: a shoulder joint and everything hanging from it (elbow, wrist, fingers) -------
  const armBone = new Uint8Array(bind.length);
  for (let b = 0; b < bind.length; b++) {
    for (let up = b, guard = 0; up >= 0 && guard < bind.length; up = bind[up].parent, guard++) {
      if (up === joints.shoulderL || up === joints.shoulderR) { armBone[b] = 1; break; }
    }
  }
  const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
  /** True when the bone that pulls hardest on point `v` is an arm's. */
  const isArm = (v: number): boolean => {
    if (!skinIndex || !skinWeight) return false;
    let best = 0, most = -1;
    for (let k = 0; k < 4; k++) { const w = skinWeight.getComponent(v, k); if (w > most) { most = w; best = skinIndex.getComponent(v, k); } }
    return armBone[best] === 1;
  };

  // ---- which way she faces along Z: her knees are in front of the line from hip to ankle... -------------------
  // (...only by a hair, so her belly is asked instead: of her skin near her hips' height, far more reaches forward)
  let front = 0, back = 0;
  const hipZ = (legs[0].hip[2] + legs[1].hip[2]) / 2;
  for (let v = 0; v < count; v += 7) {
    if (Math.abs(points.getY(v) - (hipHeight + 0.2 * legLength)) > 0.1 * legLength) continue;
    const z = points.getZ(v) - hipZ;
    if (z > front) front = z;
    if (-z > back) back = -z;
  }
  const facing = front >= back ? 1 : -1;

  const arm = new Int8Array(count).fill(-1);   // -1 not asked yet, 0 no, 1 yes (worked out only for points low enough to matter)

  // ---- her trunk and her arms (Joshua, 2026-11-18: the gray and red suit's panels run over all of her) -----------
  const neckBase = at(joints.neck), neckHeight = neckBase[1];
  // her neck's own line: from its base up to the top of her head (it leans forward a little)
  const crown = at(joints.head), neckLine = sub(crown, neckBase), neckLineSquared = Math.max(1e-9, dot(neckLine, neckLine));
  const trunkAxisZ = hipZ;
  const arms = [
    { shoulder: at(joints.shoulderL), elbow: at(joints.elbowL), wrist: at(joints.wristL) },
    { shoulder: at(joints.shoulderR), elbow: at(joints.elbowR), wrist: at(joints.wristR) },
  ].map((a) => {
    const line = sub(a.wrist, a.shoulder), lineSquared = dot(line, line);
    return { ...a, line, lineSquared, elbowAt: dot(sub(a.elbow, a.shoulder), line) / lineSquared };
  });
  const armMiddleX = (arms[0].shoulder[0] + arms[1].shoulder[0]) / 2;

  return {
    count,
    knee: (legs[0].kneeAt + legs[1].kneeAt) / 2,
    legPlace(v: number, out: LegPlace): boolean {
      const p: V3 = [points.getX(v), points.getY(v), points.getZ(v)];
      // nothing above a hand over her hip joints is leg or hip skin
      if (p[1] > hipHeight + 0.35 * legLength) return false;
      if (arm[v] < 0) arm[v] = isArm(v) ? 1 : 0;
      if (arm[v] === 1) return false;
      // her own leg: the one on the point's side of her middle
      const leg = (p[0] - middleX) * (legs[0].hip[0] - middleX) >= 0 ? legs[0] : legs[1];
      const outward = Math.sign(leg.hip[0] - middleX) || 1;
      // HOW FAR DOWN HER LEG: measured on the straight line from her hip joint to her ankle (the builder's own body
      // map counts a leg the same way). One line for the whole leg, so the number has no jump in it at her knee.
      const along = dot(sub(p, leg.hip), leg.line) / leg.lineSquared;
      // THE BONE BESIDE THE POINT: on her thigh's bone above her knee and on her shin's below it. The two bones meet
      // at her knee, so this too moves smoothly past it.
      const kneeAt = leg.kneeAt;
      const axis: V3 = along <= kneeAt
        ? mix(leg.hip, leg.knee, along / kneeAt)
        : mix(leg.knee, leg.ankle, (along - kneeAt) / (1 - kneeAt));
      // from the bone out to the point: how far, and which way round (0 the front, +90 the outer side)
      const dx = (p[0] - axis[0]) * outward, dz = (p[2] - axis[2]) * facing;
      out.along = along;
      out.turn = Math.atan2(dx, dz) / RADIANS;
      out.radius = Math.hypot(dx, dz) / legLength;
      // further from the bone than any thigh or hip is: the underside of a big belly hanging in front of her legs
      if (out.radius > MAX_LEG_RADIUS) return false;
      return true;
    },
    trunkPlace(v: number, out: LegPlace): boolean {
      const p: V3 = [points.getX(v), points.getY(v), points.getZ(v)];
      // her trunk is between a little under her hip joints and the base of her neck
      if (p[1] < hipHeight - 0.12 * legLength || p[1] > neckHeight) return false;
      if (arm[v] < 0) arm[v] = isArm(v) ? 1 : 0;
      if (arm[v] === 1) return false;
      // round a line straight up through the middle of her hips; each side measured outward from her front
      const dx = Math.abs(p[0] - middleX), dz = (p[2] - trunkAxisZ) * facing;
      out.along = (p[1] - hipHeight) / Math.max(1e-6, neckHeight - hipHeight);
      out.turn = Math.atan2(dx, dz) / RADIANS;
      out.radius = Math.hypot(dx, dz) / legLength;
      // (between her legs, right by the line her turn is measured round, which way round a point is means nothing)
      if (out.along < 0.05 && out.radius < TRUNK_NEAR_AXIS) return false;
      return true;
    },
    neckPlace(v: number, out: LegPlace): boolean {
      const p: V3 = [points.getX(v), points.getY(v), points.getZ(v)];
      // a little under the base of her neck too, so a collar's lower edge meets the suit's painted top
      if (p[1] < neckHeight - 0.03 * legLength) return false;
      if (arm[v] < 0) arm[v] = isArm(v) ? 1 : 0;
      if (arm[v] === 1) return false;
      const off = sub(p, neckBase), along = dot(off, neckLine) / neckLineSquared;
      // from her neck's line out to the point: which way round (her front is +z, her sides either x, mirrored)
      const axis = mix(neckBase, crown, along);
      const dx = Math.abs(p[0] - axis[0]), dz = (p[2] - axis[2]) * facing;
      out.along = along;
      out.turn = Math.atan2(dx, dz) / RADIANS;
      out.radius = Math.hypot(dx, dz) / legLength;
      return true;
    },
    armPlace(v: number, out: LegPlace): boolean {
      if (arm[v] < 0) arm[v] = isArm(v) ? 1 : 0;
      if (arm[v] !== 1) return false;
      const p: V3 = [points.getX(v), points.getY(v), points.getZ(v)];
      // its own arm: the one on the point's side of her middle
      const a = (p[0] - armMiddleX) * (arms[0].shoulder[0] - armMiddleX) >= 0 ? arms[0] : arms[1];
      const outward = Math.sign(a.shoulder[0] - armMiddleX) || 1;
      const along = dot(sub(p, a.shoulder), a.line) / a.lineSquared;
      // (past her wrist, 1, is her HAND: `along` goes on up to her fingertips, about 1.4; round it measured as her
      //  forearm's way round, so a glove can be painted on her hand: the fingerless gloves of graySuit's sister looks)
      if (along > HAND_MOST) return false;
      // the bone beside the point: her upper arm's above her elbow, her forearm's below
      const axis: V3 = along <= a.elbowAt
        ? mix(a.shoulder, a.elbow, Math.max(0, along) / a.elbowAt)
        : mix(a.elbow, a.wrist, Math.min(1, (along - a.elbowAt) / (1 - a.elbowAt)));
      // round the arm: its front is her front (z), its outer side away from her middle (x), whichever way it hangs
      const dir = sub(a.elbow, a.shoulder), dirLength = Math.sqrt(dot(dir, dir)) || 1;
      const unit: V3 = [dir[0] / dirLength, dir[1] / dirLength, dir[2] / dirLength];
      const off = sub(p, axis), along3 = dot(off, unit);
      const flat: V3 = [off[0] - unit[0] * along3, off[1] - unit[1] * along3, off[2] - unit[2] * along3];
      out.along = along;
      out.turn = Math.atan2(flat[0] * outward, flat[2] * facing) / RADIANS;
      out.radius = Math.sqrt(dot(flat, flat)) / legLength;
      return true;
    },
  };
}
