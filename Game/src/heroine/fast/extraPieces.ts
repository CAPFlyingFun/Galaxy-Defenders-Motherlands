// ============================================================================
// extraPieces.ts -- the outfit's EXTRA PIECES on the fast body: the strip of
// fabric across her cleavage, her sneakers.
//
// The bake wrote each one down as a small plain mesh that follows her bones
// (piecesFile.ts; how it is captured is in src/bake/capturePieces.ts). Here
// each becomes an ordinary skinned mesh on her skin's own skeleton (pieces drawn
// alike are joined into one mesh): one draw call a kind, nothing worked out per frame. (In the builder's room the
// cleavage strip is re-laid on the CPU every frame and the sneakers are built
// when she loads.)
//
// A big piece (a sneaker is 17,000 triangles) is lightened with her: at a
// detail level under 100 % it is drawn with the same share of its triangles,
// made by the same background worker as her skin's levels (detailLevels.ts).
// ============================================================================
import * as THREE from 'three';
import type { BakedLook } from './bakedLook';
import type { BakedPiece } from './piecesFile';
import { DetailLevels, type DetailMaker } from './detailLevels';
import { MOTION_SHAPES } from './shapedBody';

/** A piece with fewer triangles than this is always drawn whole. */
const LIGHTEN_FROM_TRIANGLES = 3000;
/** A piece is never drawn with less than this share of its triangles (a 1 % sneaker is a few shards). */
const LEAST_PIECE_DETAIL = 10;

/** A stored colour byte (sRGB) as the linear number three.js wants for a point's colour. */
const toLinear = (byte: number): number => { const c = byte / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

/**
 * Pieces that are drawn the same way (the same picture, shine and binding: her left and right sneakers' uppers, for
 * one) are joined into ONE mesh, so each kind costs one draw call however many pieces it came as.
 */
function mergeAlike(pieces: readonly BakedPiece[]): BakedPiece[] {
  const groups = new Map<string, BakedPiece[]>();
  for (const piece of pieces) {
    // (a shirt's hem band is never joined with another piece: it is drawn over her skin, the others not)
    const key = JSON.stringify([piece.map, piece.roughness, piece.metalness, piece.doubleSided, piece.cutOut, !!piece.motion, !!piece.uv, piece.bindMatrix, /^tunicDrape/.test(piece.name)]);
    const group = groups.get(key);
    if (group) group.push(piece); else groups.set(key, [piece]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const join = <T extends Float32Array | Uint8Array>(pick: (p: BakedPiece) => T | null): T | null => {
      const parts = group.map(pick);
      if (parts.some((part) => !part)) return null;
      const out = new (parts[0]!.constructor as new (n: number) => T)(parts.reduce((sum, part) => sum + part!.length, 0));
      let at = 0;
      for (const part of parts) { out.set(part!, at); at += part!.length; }
      return out;
    };
    // the triangle lists, each one's point numbers moved past the points before it
    const index = new Uint32Array(group.reduce((sum, p) => sum + p.index.length, 0));
    let at = 0, before = 0;
    for (const p of group) { for (let i = 0; i < p.index.length; i++) index[at + i] = p.index[i] + before; at += p.index.length; before += p.position.length / 3; }
    return {
      ...group[0],
      name: group.map((p) => p.name).join('+'),
      position: join((p) => p.position)!, normal: join((p) => p.normal)!, colour: join((p) => p.colour)!, uv: join((p) => p.uv),
      skinIndex: join((p) => p.skinIndex)!, skinWeight: join((p) => p.skinWeight)!, motion: join((p) => p.motion), index,
    };
  });
}

export interface ExtraPieces {
  readonly meshes: readonly THREE.SkinnedMesh[];
  /** Draw the pieces to suit a detail level (lighter lists are made in the background and swapped in when ready). */
  setDetail(detail: number): void;
  /** Triangles of the pieces as drawn now. */
  triangles(): number;
  dispose(): void;
}

/**
 * Build the look's extra pieces and hang them on her skin's skeleton.
 * @param influences  her skin's own motion-shape weights: a piece that rides her bust shares the very same array
 * @param firstMesh   the number the pieces start at with the detail maker (her skin is 0)
 */
export function buildExtraPieces(look: BakedLook, skin: THREE.SkinnedMesh, influences: number[], maker: DetailMaker, firstMesh: number): ExtraPieces {
  const made: { mesh: THREE.SkinnedMesh; levels: DetailLevels | null; full: THREE.BufferAttribute; lists: Map<number, THREE.BufferAttribute> }[] = [];
  const materials: THREE.Material[] = [];
  let wanted = 100;

  mergeAlike(look.pieces).forEach((piece, k) => {
    const points = piece.position.length / 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(piece.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(piece.normal, 3));
    // its points' own colours (white where its colour is all in its picture)
    const colour = new Float32Array(points * 4);
    for (let i = 0; i < points; i++) {
      colour[i * 4] = toLinear(piece.colour[i * 4]); colour[i * 4 + 1] = toLinear(piece.colour[i * 4 + 1]); colour[i * 4 + 2] = toLinear(piece.colour[i * 4 + 2]);
      colour[i * 4 + 3] = piece.colour[i * 4 + 3] / 255;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 4));
    if (piece.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(piece.uv, 2));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(piece.skinIndex), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(piece.skinWeight, (w) => w / 255), 4));
    const full = new THREE.BufferAttribute(piece.index, 1);
    geometry.setIndex(full);
    if (piece.motion) {
      // it rides her bust: the same four motion shapes as her skin, for its own points
      geometry.morphAttributes.position = MOTION_SHAPES.map((name, m) => {
        const own = new Float32Array(points * 3);
        for (let i = 0; i < points; i++) for (let c = 0; c < 3; c++) own[i * 3 + c] = piece.motion![i * 12 + m * 3 + c];
        const attribute = new THREE.BufferAttribute(own, 3);
        attribute.name = name;
        return attribute;
      });
      geometry.morphTargetsRelative = true;
    }

    const material = new THREE.MeshStandardMaterial({
      name: `heroine-${piece.name}`,
      vertexColors: true,
      map: piece.map ? look.piecePictures.get(piece.map) ?? null : null,
      roughness: piece.roughness, metalness: piece.metalness,
      side: piece.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      // (a cut-out piece is drawn only where its picture is more than half solid: that is its outline)
      alphaTest: piece.cutOut ? 0.5 : 0,
      // THE STRIP ACROSS HER CLEAVAGE GIVES WAY TO HER SKIN where the two lie together (Joshua, 2026-11-17: the
      // outfit "has issues with the look of it"). The strip's job is the gap BETWEEN her breasts; its ends lie on
      // her bra's cups and band, a hair above her skin. In the builder they sit exactly on it; here they stood a
      // little proud and showed as two black blocks over the pink band. Pushed back by a small depth offset, her
      // skin (which is painted with the very same bra there) is what shows wherever the two overlap.
      polygonOffset: piece.cutOut, polygonOffsetFactor: piece.cutOut ? 8 : 0, polygonOffsetUnits: piece.cutOut ? 600 : 0,
    });
    // A PAINTED SHIRT'S HEM BAND (its drape, capturePieces.ts) is the other way round: where it lies on her skin it is
    // drawn OVER it, as the builder draws it (tunicDrape.ts `feathered`, the same offset), so its smooth bottom edge is
    // what shows over the shirt's own painted hem.
    if (/^tunicDrape/.test(piece.name)) { material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -4; }
    materials.push(material);

    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = piece.name;
    // beside her skin, on her skin's own skeleton, bound the way the bake worked its points out for
    mesh.matrix.copy(skin.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    skin.parent?.add(mesh);
    mesh.bind(skin.skeleton, new THREE.Matrix4().fromArray(piece.bindMatrix));
    if (piece.motion) {
      mesh.morphTargetDictionary = Object.fromEntries(MOTION_SHAPES.map((name, i) => [name, i]));
      mesh.morphTargetInfluences = influences;
    }

    let levels: DetailLevels | null = null;
    if (piece.index.length / 3 >= LIGHTEN_FROM_TRIANGLES) {
      const box = new THREE.Box3().setFromArray(piece.position);
      maker.setMesh(firstMesh + k, piece.position, piece.index, box, null, null);
      levels = new DetailLevels(maker, firstMesh + k, piece.index);
    }
    made.push({ mesh, levels, full, lists: new Map([[100, full]]) });
  });

  return {
    meshes: made.map((m) => m.mesh),
    setDetail(detail: number): void {
      wanted = Math.max(LEAST_PIECE_DETAIL, detail);
      for (const piece of made) {
        if (!piece.levels) continue;
        const have = piece.lists.get(wanted);
        if (have) { piece.mesh.geometry.setIndex(have); continue; }
        const asked = wanted;
        piece.levels.get(asked).then((index) => {
          const list = piece.lists.get(asked) ?? new THREE.BufferAttribute(index, 1);
          piece.lists.set(asked, list);
          if (wanted === asked) piece.mesh.geometry.setIndex(list);
        }).catch(() => { /* it keeps the list it has */ });
      }
    },
    triangles(): number { return made.reduce((sum, piece) => sum + (piece.mesh.visible ? (piece.mesh.geometry.index?.count ?? 0) / 3 : 0), 0); },
    dispose(): void {
      for (const piece of made) { piece.mesh.removeFromParent(); piece.mesh.geometry.dispose(); }
      for (const material of materials) material.dispose();
    },
  };
}
