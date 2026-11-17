// ============================================================================
// capturePieces.ts -- the bake's second job: her EXTRA PIECES.
//
// The builder's room draws a few things that are not her skin and not in the
// body file: the strip of fabric a top stretches across her cleavage (the
// builder re-lays it between her breasts every frame), and her sneakers (the
// builder builds them round her feet when she loads). The fast heroine cannot
// run that code, so each piece is written down ONCE here as a small ordinary
// mesh that hangs on her skeleton (src/heroine/fast/piecesFile.ts).
//
// HOW A PIECE IS MADE TO FOLLOW HER BONES. Whatever the room does to place a
// piece, at the moment of the bake every point of it is somewhere in the room.
// Each point is given four bones to follow (the sneakers' own; for the cleavage
// strip, those of the nearest point of her skin), and its place is then worked
// BACKWARDS through those bones to where it would have to be in her skin's own
// unposed space to land exactly where it is now. Drawn on her skeleton it
// therefore starts exactly where the room had it, and moves with her from there.
//
// Colour: the sneakers keep their own point colours and picture. The cleavage
// strip has neither: the builder's shader works its colour out pixel by pixel
// (each pixel looks itself up in the top's drawing, and pixels above the
// neckline are cut away). So the strip is given a simple texture layout of its
// own (it is a sheet facing forward: its points seen from the front) and its
// shader is baked into a small picture, cut-away parts see-through, the same
// way her skin's is (skinnedUvBake.ts).
// ============================================================================
import * as THREE from 'three';
import { FABRIC_VERTEX_LEVEL, captureVertices } from '@charb/sarahlab/storyBake';
import { fabricOn } from '@charb/sarahlab/fabricMaterial';
import { dilate } from '@charb/sarahlab/storyBake';
import type { BakedPiece } from '../heroine/fast/piecesFile';
import { atEndOfMain, bakeMaterial } from './skinnedUvBake';

/** The size of a sheet piece's baked picture, pixels a side (the cleavage strip is about a hand across). */
const SHEET_SIZE = 512;

/** A linear colour value (0-1) as the byte a colour picture stores (sRGB). */
const toByte = (linear: number): number => {
  const c = Math.max(0, Math.min(1, linear));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
};

/**
 * The one matrix three.js's skinning amounts to for a point with these four bones and weights on `mesh`:
 * world  =  mesh.matrixWorld x bindMatrixInverse x (sum of weight x bone matrix) x bindMatrix  x  point.
 * (`skeleton.update()` must have been called so the bone matrices are this frame's.)
 */
function skinningMatrix(mesh: THREE.SkinnedMesh, bones: ArrayLike<number>, weights: ArrayLike<number>, out: THREE.Matrix4): THREE.Matrix4 {
  const all = mesh.skeleton.boneMatrices as Float32Array, e = out.elements;
  e.fill(0);
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const w = weights[k];
    if (!(w > 0)) continue;
    total += w;
    for (let i = 0; i < 16; i++) e[i] += all[bones[k] * 16 + i] * w;
  }
  if (total > 0) for (let i = 0; i < 16; i++) e[i] /= total; else out.identity();
  return out.multiply(mesh.bindMatrix).premultiply(mesh.bindMatrixInverse).premultiply(mesh.matrixWorld);
}

export interface PieceCapture { readonly pieces: BakedPiece[]; readonly pictures: Record<string, Blob>; readonly notes: string[] }

/**
 * Capture every extra piece the room is drawing for her.
 * @param skin        her skin in the room (posed as she stands)
 * @param skinWorld   every point of her skin where it is now in the room (x, y, z each)
 * @param fileMotion  her four motion shapes' moves for every point of her skin, from the body file (4 arrays of x, y, z)
 * @param skip        meshes that are not extra pieces (her skin, her hair, parts under her clothes)
 */
export async function capturePieces(
  renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, skin: THREE.SkinnedMesh, skinWorld: Float32Array,
  fileMotion: readonly Float32Array[], wanted: (mesh: THREE.Mesh) => boolean,
): Promise<PieceCapture> {
  const pieces: BakedPiece[] = [], pictures: Record<string, Blob> = {}, notes: string[] = [];
  const pictureOf = new Map<string, string>();
  skin.skeleton.update();
  const skinBones = skin.geometry.getAttribute('skinIndex'), skinWeights = skin.geometry.getAttribute('skinWeight');
  const boneNumber = new Map<string, number>();
  skin.skeleton.bones.forEach((bone, i) => boneNumber.set(bone.name, i));
  const count = skinWorld.length / 3;

  const found: THREE.Mesh[] = [];
  scene.traverseVisible((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh && mesh !== skin && wanted(mesh)) found.push(mesh); });

  const own = new THREE.Matrix4(), target = new THREE.Matrix4(), back = new THREE.Matrix4(), turn = new THREE.Matrix3(), turnBack = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const mesh of found) {
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const g = mesh.geometry, points = g.getAttribute('position').count;
    const fullIndex = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: points }, (_, k) => k);
    // the runs of triangles and the material each is drawn with (one run of everything for a one-material mesh)
    const parts: { start: number; count: number; material: THREE.MeshStandardMaterial }[] = Array.isArray(mesh.material) && g.groups.length
      ? g.groups.map((group) => ({ start: group.start, count: Math.min(group.count, fullIndex.length - group.start), material: (mesh.material as THREE.Material[])[group.materialIndex ?? 0] as THREE.MeshStandardMaterial }))
      : [{ start: 0, count: fullIndex.length, material }];
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    skinned?.skeleton.update();
    const ownBones = g.getAttribute('skinIndex'), ownWeights = g.getAttribute('skinWeight');

    // Where the piece's points are in its own space, and their colours.
    let local: Float32Array, facing: Float32Array;
    let sheetUv: Float32Array | null = null, sheetPicture: Blob | null = null;
    const colour = new Uint8Array(points * 4).fill(255);
    if (skinned) {
      // a skinned piece (a sneaker): its geometry's own points, point colours and picture
      local = new Float32Array(points * 3); facing = new Float32Array(points * 3);
      const P = g.getAttribute('position'), N = g.getAttribute('normal'), C = g.getAttribute('color');
      for (let i = 0; i < points; i++) {
        local[i * 3] = P.getX(i); local[i * 3 + 1] = P.getY(i); local[i * 3 + 2] = P.getZ(i);
        facing[i * 3] = N.getX(i); facing[i * 3 + 1] = N.getY(i); facing[i * 3 + 2] = N.getZ(i);
      }
      // Its colour: each point's own colour times the colour of the material its triangles are drawn with. (A sneaker
      // is one mesh of several materials -- upper, midsole, laces... -- each over its own run of triangles.)
      for (const part of parts) {
        const m = part.material;
        for (let t = part.start; t < part.start + part.count; t++) {
          const i = fullIndex[t];
          const r = C && m.vertexColors ? C.getX(i) : 1, gg = C && m.vertexColors ? C.getY(i) : 1, bb = C && m.vertexColors ? C.getZ(i) : 1;
          colour[i * 4] = toByte(r * m.color.r); colour[i * 4 + 1] = toByte(gg * m.color.g); colour[i * 4 + 2] = toByte(bb * m.color.b);
        }
      }
    } else {
      // a piece the room lays by hand each frame (the cleavage strip): its points as its own shader places them
      const capture = captureVertices(renderer, mesh, camera, { matrix: mesh.matrixWorld });
      local = capture.position; facing = capture.normal;
      // A texture layout of its own: the sheet seen from the front, fitted into the picture with a small margin.
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < points; i++) { x0 = Math.min(x0, local[i * 3]); x1 = Math.max(x1, local[i * 3]); y0 = Math.min(y0, local[i * 3 + 1]); y1 = Math.max(y1, local[i * 3 + 1]); }
      sheetUv = new Float32Array(points * 2);
      for (let i = 0; i < points; i++) { sheetUv[i * 2] = 0.04 + 0.92 * (local[i * 3] - x0) / Math.max(1e-9, x1 - x0); sheetUv[i * 2 + 1] = 0.04 + 0.92 * (local[i * 3 + 1] - y0) / Math.max(1e-9, y1 - y0); }
      // ...and its shader baked into a picture in that layout (a pixel the shader cuts away stays see-through)
      const flatGeometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(g.attributes)) flatGeometry.setAttribute(name, attribute);
      flatGeometry.setAttribute('bakeUv', new THREE.BufferAttribute(sheetUv, 2));
      if (g.index) flatGeometry.setIndex(g.index);
      const flatMaterial = bakeMaterial(material, 'sheet', (shader) => {
        shader.vertexShader = atEndOfMain(`attribute vec2 bakeUv;\n${shader.vertexShader}`, 'gl_Position = vec4(bakeUv * 2.0 - 1.0, 0.0, 1.0);');
        shader.fragmentShader = atEndOfMain(shader.fragmentShader, 'gl_FragColor = vec4(sRGBTransferOETF(vec4(clamp(diffuseColor.rgb, 0.0, 1.0), 1.0)).rgb, 1.0);');
      });
      const flat = new THREE.Mesh(flatGeometry, flatMaterial);
      flat.matrixAutoUpdate = false; flat.matrixWorldAutoUpdate = false;
      flat.matrix.copy(mesh.matrixWorld); flat.matrixWorld.copy(mesh.matrixWorld);
      flat.frustumCulled = false;
      const targetBuffer = new THREE.WebGLRenderTarget(SHEET_SIZE, SHEET_SIZE, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      const flatScene = new THREE.Scene();
      flatScene.add(flat);
      const raw = new Uint8Array(SHEET_SIZE * SHEET_SIZE * 4);
      const was = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear };
      try {
        renderer.setRenderTarget(targetBuffer);
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;
        renderer.clear(true, true, true);
        renderer.render(flatScene, camera);
        renderer.readRenderTargetPixels(targetBuffer, 0, 0, SHEET_SIZE, SHEET_SIZE, raw);
      } finally {
        renderer.setRenderTarget(was.target); renderer.setClearColor(was.colour, was.alpha); renderer.autoClear = was.autoClear;
        targetBuffer.dispose(); flatMaterial.dispose();
        flatGeometry.attributes = {}; flatGeometry.index = null; flatGeometry.dispose();
      }
      // the colour is run out past the cut edge (so the edge is not fringed with black), the cut itself is kept
      const spread = dilate(raw, SHEET_SIZE, SHEET_SIZE, 12);
      for (let i = 3; i < raw.length; i += 4) spread[i] = raw[i];
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SHEET_SIZE;
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(spread), SHEET_SIZE, SHEET_SIZE), 0, 0);
      sheetPicture = await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('a piece\'s picture could not be written'))), 'image/webp', 0.95));
    }

    const position = new Float32Array(points * 3), normal = new Float32Array(points * 3);
    const bones = new Uint8Array(points * 4), weights = new Uint8Array(points * 4);
    const motion = skinned ? null : new Float32Array(points * 12);
    const four = [0, 0, 0, 0], fourW = [0, 0, 0, 0];
    for (let i = 0; i < points; i++) {
      // where the point is in the room now
      if (skinned) {
        for (let k = 0; k < 4; k++) { four[k] = ownBones.getComponent(i, k); fourW[k] = ownWeights.getComponent(i, k); }
        skinningMatrix(skinned, four, fourW, own);
        // (its bones by NAME in her skin's skeleton, in case the piece numbers them differently)
        for (let k = 0; k < 4; k++) four[k] = boneNumber.get(skinned.skeleton.bones[four[k]]?.name ?? '') ?? 0;
      } else own.copy(mesh.matrixWorld);
      p.fromArray(local, i * 3).applyMatrix4(own);
      n.fromArray(facing, i * 3).applyMatrix3(turn.setFromMatrix4(own)).normalize();
      if (!skinned) {
        // the nearest point of her skin lends its bones (and its share of her belly's and bust's motion)
        let best = 0, bestD = Infinity;
        for (let v = 0; v < count; v++) {
          const dx = skinWorld[v * 3] - p.x, dy = skinWorld[v * 3 + 1] - p.y, dz = skinWorld[v * 3 + 2] - p.z, d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) { bestD = d; best = v; }
        }
        for (let k = 0; k < 4; k++) { four[k] = skinBones.getComponent(best, k); fourW[k] = skinWeights.getComponent(best, k); }
        for (let m = 0; m < 4; m++) for (let c = 0; c < 3; c++) motion![i * 12 + m * 3 + c] = fileMotion[m][best * 3 + c];
      }
      // ...and where it must be in her skin's unposed space to land there
      skinningMatrix(skin, four, fourW, target);
      back.copy(target).invert();
      p.applyMatrix4(back).toArray(position, i * 3);
      n.applyMatrix3(turnBack.setFromMatrix4(back)).normalize().toArray(normal, i * 3);
      const sum = fourW[0] + fourW[1] + fourW[2] + fourW[3] || 1;
      for (let k = 0; k < 4; k++) { bones[i * 4 + k] = four[k]; weights[i * 4 + k] = Math.round((fourW[k] / sum) * 255); }
    }

    // ---- written down: one piece for the triangles that wear a picture, one for those that do not ----------------
    const writePicture = async (texture: THREE.Texture, name: string): Promise<string> => {
      const known = pictureOf.get(texture.uuid);
      if (known) return known; // (two sneakers share their picture: written once)
      const image = texture.image as CanvasImageSource & { width: number; height: number };
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      // (written so that it is read back NOT flipped, whatever way the room read it)
      if (texture.flipY) { context.translate(0, canvas.height); context.scale(1, -1); }
      context.drawImage(image, 0, 0);
      pictures[name] = await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('a piece\'s picture could not be written'))), 'image/webp', 0.9));
      pictureOf.set(texture.uuid, name);
      return name;
    };
    const uvAttribute = g.getAttribute('uv');
    const buckets = new Map<string, { map: THREE.Texture | null; triangles: number[]; material: THREE.MeshStandardMaterial }>();
    for (const part of parts) {
      const map = sheetPicture ? null : part.material.map ?? null, key = map ? map.uuid : 'plain';
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = { map, triangles: [], material: part.material }));
      for (let t = part.start; t < part.start + part.count; t++) bucket.triangles.push(fullIndex[t]);
    }
    for (const bucket of buckets.values()) {
      // (a sneaker's little label is two triangles with a picture of its own: not worth a draw call of its own)
      if (bucket.triangles.length < 8 * 3 && buckets.size > 1) continue;
      // only the points this piece's triangles use, renumbered
      const renumber = new Int32Array(points).fill(-1), order: number[] = [];
      const index = Uint32Array.from(bucket.triangles, (v) => { if (renumber[v] < 0) { renumber[v] = order.length; order.push(v); } return renumber[v]; });
      const take = <T extends Float32Array | Uint8Array>(from: T, size: number): T => {
        const out = new (from.constructor as new (n: number) => T)(order.length * size);
        order.forEach((v, k) => { for (let c = 0; c < size; c++) out[k * size + c] = from[v * size + c]; });
        return out;
      };
      let map: string | null = null, uv: Float32Array | null = null;
      if (sheetPicture && sheetUv) { map = `${mesh.name}.webp`; pictures[map] = sheetPicture; uv = take(sheetUv, 2); }
      else if (bucket.map && uvAttribute) {
        map = await writePicture(bucket.map, `${mesh.name.replace(/[LR]$/, '') || 'piece'}${buckets.size > 1 && pictureOf.size > 0 && !pictureOf.has(bucket.map.uuid) ? pictureOf.size + 1 : ''}.webp`);
        uv = take(Float32Array.from({ length: points * 2 }, (_, k) => uvAttribute.getComponent(k >> 1, k & 1)), 2);
      }
      const name = buckets.size > 1 ? `${mesh.name}-${map ? 'pictured' : 'plain'}` : mesh.name;
      pieces.push({
        name, position: take(position, 3), normal: take(normal, 3), colour: take(colour, 4), uv,
        skinIndex: take(bones, 4), skinWeight: take(weights, 4), motion: motion ? take(motion, 12) : null, index,
        bindMatrix: skin.bindMatrix.toArray(), roughness: bucket.material.roughness, metalness: bucket.material.metalness,
        doubleSided: bucket.material.side === THREE.DoubleSide, map, cutOut: sheetPicture !== null,
      });
      notes.push(`${name}: ${order.length} points, ${index.length / 3} triangles${map ? `, picture ${map}` : ''}`);
    }
  }
  return { pieces, pictures, notes };
}
