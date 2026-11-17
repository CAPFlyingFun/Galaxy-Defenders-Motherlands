// ============================================================================
// clearance.ts -- does her skin poke through any armor piece?
//
// For the lab's CHECK button. She is taken exactly as she stands (her pose,
// her belly and bust as the sliders have them), and every corner of her skin
// near a piece is tested: starting AT the skin and going a short way INTO her
// body, do we pass through the outside face of the piece? If so, that corner
// of skin is sticking out through the armor. The count of such corners and
// the deepest one are reported for each piece.
//
// (Skin that has armor outside it -- her foot inside its boot, her leg inside
// a collar -- cannot be seen and is not counted.)
// ============================================================================
import * as THREE from 'three';
import type { RigidArmor } from '../rigidArmor';
import type { Mannequin } from './mannequin';

export interface ClearanceReport {
  /** For each piece: how many corners of skin stick out through it, and how far the worst one sticks out (metres). */
  readonly pieces: Record<string, { poking: number; deepest: number; /** the box, in the piece's own frame, round the corners that poke out */ where?: number[]; /** a few of those corners: x, y, z in the piece's frame and how far each sticks out, in mm */ some?: number[][] }>;
  readonly total: number;
}

/** How far a corner of skin may stick out and still be found (metres). */
const REACH = 0.02;

export function checkClearance(m: Mannequin, armor: RigidArmor, skip: readonly string[] = ['gunL', 'gunR']): ClearanceReport {
  const world = m.skinPositions(), n = world.length / 3;
  // Which way her skin faces at each corner, as she stands now.
  const posed = new THREE.BufferGeometry();
  posed.setAttribute('position', new THREE.BufferAttribute(world, 3));
  posed.setIndex(m.skin.geometry.index);
  posed.computeVertexNormals();
  const normals = posed.attributes.normal.array as Float32Array;

  const pieces: ClearanceReport['pieces'] = {};
  let total = 0;
  const inv = new THREE.Matrix4(), p = new THREE.Vector3(), d = new THREE.Vector3(), rot = new THREE.Matrix3();
  for (const [slot, mesh] of Object.entries(armor.pieces)) {
    if (skip.includes(slot)) continue;
    mesh.updateWorldMatrix(true, false);
    inv.copy(mesh.matrixWorld).invert();
    rot.setFromMatrix4(inv);
    const g = mesh.geometry, pos = g.attributes.position.array as Float32Array, idx = g.index!.array;
    const box = g.boundingBox!.clone().expandByScalar(REACH);
    let poking = 0, deepest = 0;
    const where = new THREE.Box3(), some: number[][] = [];
    for (let i = 0; i < n; i++) {
      p.set(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]).applyMatrix4(inv);
      if (!box.containsPoint(p)) continue;
      d.set(-normals[i * 3], -normals[i * 3 + 1], -normals[i * 3 + 2]).applyMatrix3(rot).normalize(); // into her body
      // Along the line through this corner (a standard ray-against-triangle test, written out for speed) find:
      //   best    the nearest OUTSIDE face of the piece going INTO her body;
      //   covered whether any face of the piece lies OUTSIDE this corner, within 30 cm (then the corner is under or
      //           inside the piece, cannot be seen, and does not count: her foot inside its boot, her leg inside a collar).
      let best = Infinity, covered = false;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
        const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
        const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue; // (edge-on)
        const tx = p.x - pos[a], ty = p.y - pos[a + 1], tz = p.z - pos[a + 2];
        const u = (tx * px + ty * py + tz * pz) / det;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (d.x * qx + d.y * qy + d.z * qz) / det;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) / det;
        if (dist > 0.0003) { if (det > 0 && dist < best) best = dist; } // into her body, meeting the face from its outside
        else if (dist < -0.0003 && dist > -0.3) covered = true;
      }
      if (covered) continue;
      if (best <= REACH) { poking++; deepest = Math.max(deepest, best); where.expandByPoint(p); if (poking % 6 === 1 && some.length < 14) some.push([Math.round(p.x * 1000), Math.round(p.y * 1000), Math.round(p.z * 1000), +(best * 1000).toFixed(1)]); }
    }
    pieces[slot] = { poking, deepest: +deepest.toFixed(4), ...(poking ? { where: [...where.min.toArray(), ...where.max.toArray()].map((x) => +x.toFixed(3)), some } : {}) };
    total += poking;
  }
  posed.dispose();
  return { pieces, total };
}
