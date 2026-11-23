// ============================================================================
// faceBeyond.ts -- a face slider past the builder's -1..+1, laid by the bake.
//
// (Joshua, 2026-11-22, of Mary's and John's faces measured against their references: "Can you not manually go smaller
// or bigger than the fixed in-game slider number by changing it in the code directly?", then "get it as close as
// possible with what's available, and let me decide after I see the new renders".)
//
// WHY THIS WORKS. Each of the builder's face sliders is a FIELD: for every point of her head, how far it moves at +1
// (Char_B/src/sarahlab/faceShapes.ts). The builder lays it by its number, a straight line through 0: the point moves
// `number x field` (bodyShapeView.ts `applyShapeFields`, `faceShapes.ts`: "faceShapeMove is LINEAR in every slider's
// number"). The builder's room only holds the number to -1..+1 when it reads a head (headLook.ts `normaliseHead`). So
// the room lays a look's face up to the end of each slider, and this lays the REST of the number -- what is past the
// end -- on the shape the bake captures: the same field, worked out by the builder's own `faceFieldOn` on the body
// file's own points (the room's are the same points in the same order: bakeLook.ts checks it), times the rest.
//
// WHAT IT CANNOT DO. The builder judged its fields only up to 1 (its preview sheets), so past 1 the skin can crowd:
// numbers are held to `FACE_BEYOND_MOST` (2) and every one past 1 is to be checked by eye. The Visual body (the
// builder's own room in the game) still stops at 1. The move is laid after her build's sizes (height, head), which
// scale her head by a few percent at most: the extra move is a few millimetres, so that is well under 0.1 mm.
// ============================================================================

import type * as THREE from 'three';
import { faceFieldOn, headPoints } from '@charb/sarahlab/faceShapeFields';
import { HER_FACE } from '@charb/sarahlab/faceRig';
import { MALE_FACE } from '@charb/sarahlab/maleFace';

/** The furthest a face slider may go here, either way. */
export const FACE_BEYOND_MOST = 2;

/** What was laid, for the bake's record. */
export interface FaceBeyondRecord {
  /** Each slider laid past its end, and how much past (its number less the room's). */
  readonly sliders: Readonly<Record<string, number>>;
  /** How many of her points moved, and the most any moved, millimetres. */
  readonly points: number;
  readonly mostMm: number;
}

/**
 * Lay the part of each face slider past -1..+1 onto a captured shape, in place.
 * @param face      the look's face sliders, as written (may run past 1)
 * @param fileSkin  the body FILE's own skin mesh (its points are the ones the room shaped)
 * @param male      the male body: his face frame (the builder's face fitted onto his head, maleFace.ts)
 * @param position  the captured points, three numbers each, in the file's units (changed here)
 * @param normal    the captured normals, three numbers each (changed here)
 */
export function layFaceBeyond(face: Readonly<Record<string, number>> | undefined, fileSkin: THREE.SkinnedMesh, male: boolean, position: Float32Array, normal: Float32Array | null): FaceBeyondRecord {
  const sliders: Record<string, number> = {};
  for (const [id, raw] of Object.entries(face ?? {})) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const wanted = Math.max(-FACE_BEYOND_MOST, Math.min(FACE_BEYOND_MOST, raw));
    // what the room laid: the number held to -1..+1, as its `normaliseHead` holds it
    const laid = Math.max(-1, Math.min(1, wanted));
    if (wanted !== laid) sliders[id] = wanted - laid;
  }
  if (Object.keys(sliders).length === 0) return { sliders, points: 0, mostMm: 0 };

  const frame = male ? MALE_FACE.frame : HER_FACE.frame;
  const geometry = fileSkin.geometry;
  // (read point by point: a file may store its points packed as whole numbers, which `getX` turns back into its units)
  const unpack = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array => {
    const out = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) { out[i * 3] = attribute.getX(i); out[i * 3 + 1] = attribute.getY(i); out[i * 3 + 2] = attribute.getZ(i); }
    return out;
  };
  const basePos = unpack(geometry.getAttribute('position'));
  const normalAttribute = geometry.getAttribute('normal');
  const baseNrm = normalAttribute ? unpack(normalAttribute) : null;
  // (the head's points are found once for every slider)
  const points = headPoints(basePos, frame);
  const moved = new Map<number, number>();
  const touched = new Set<number>();
  for (const [id, extra] of Object.entries(sliders)) {
    // the field at +1, in the file's own units (the builder's own function, as its room makes it)
    const field = faceFieldOn(id, basePos, baseNrm, points, frame);
    for (let k = 0; k < field.index.length; k++) {
      const v = field.index[k], i = v * 3;
      const dx = extra * field.pos[k * 3], dy = extra * field.pos[k * 3 + 1], dz = extra * field.pos[k * 3 + 2];
      position[i] += dx; position[i + 1] += dy; position[i + 2] += dz;
      moved.set(v, (moved.get(v) ?? 0) + Math.hypot(dx, dy, dz));
      if (normal && field.nrm) {
        normal[i] += extra * field.nrm[k * 3]; normal[i + 1] += extra * field.nrm[k * 3 + 1]; normal[i + 2] += extra * field.nrm[k * 3 + 2];
        touched.add(v);
      }
    }
  }
  // the turned normals back to length 1, as the builder does after laying its fields
  if (normal) for (const v of touched) {
    const i = v * 3, length = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    normal[i] /= length; normal[i + 1] /= length; normal[i + 2] /= length;
  }
  // (the file's units are not metres: its face frame's scale turns them into metres)
  let most = 0;
  for (const d of moved.values()) most = Math.max(most, d);
  return { sliders, points: moved.size, mostMm: most * frame.scale * 1000 };
}
