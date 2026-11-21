// ============================================================================
// bakeLook.ts -- THE BAKE PAGE (bake.html). A DEV TOOL, never part of play.
//
// WHAT IT IS FOR. The game's fast heroine (src/heroine/fast/) does not run the
// Character Builder. It draws the builder's body file with a "baked look": a
// picture of her finished skin and outfit, and a file of her finished shape
// (src/heroine/fast/bakedLook.ts). This page MAKES those files.
//
// HOW. It opens the builder's own room out of sight (the same way the game's
// "Visual" body does: src/heroine/builderRoom.ts), dresses her in the look, and
// then uses the builder's OWN story-bake machinery (Char_B/src/sarahlab/
// storyBake.ts, written for Joshua's story player) to read back what the
// builder's shaders worked out:
//   bakeSkinnedUV   her skin's colour, shine and surface detail, each as a picture in her texture layout
//                   (skinnedUvBake.ts: the builder's `bakeUV`, ported with one change explained there)
//   captureVertices where the builder finally put every point of her skin (the builder's own, called as it is)
// Nothing of the builder's rules is copied or re-made here: the graphics card
// runs her real materials and this page keeps the answer.
//
// TO RE-BAKE A LOOK (after changing it in src/heroine/looks/, or after Char_B is refreshed):
//   1. cd Game && npm run dev
//   2. either   python3 scripts/bake_heroine.py blazeSuit        (writes public/heroines/blazeSuit/ for you)
//      or       open http://localhost:5173/bake.html?look=blazeSuit in a desktop browser, wait for "Baked",
//               press each download button, and move the files into Game/public/heroines/blazeSuit/
//   3. look at her in /heroine-lab.html?heroine=fast&look=blazeSuit beside ?heroine=room
//
// For scripts: when the bake is done `window.gdmBake` holds `{ done: true, files: { name: base64 } }`, and
// `window.gdmBakeError` holds the message if it failed.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { captureVertices, restSkinMatrix, toBase64 } from '@charb/sarahlab/storyBake';
import { normaliseHead } from '@charb/sarahlab/headLook';
import { herWeek } from '@charb/sarahlab/baby';
import { readPregnancy } from '@charb/sarahlab/pregnancy';
import { HAIR_STYLE_NONE } from '@charb/sarahlab/hairStyles';
import { ROOM_UNITS, openBuilderRoom } from '../heroine/builderRoom';
import { findPaintedSkin } from '../heroine/paintMask';
import { LOOKS, lookKey } from '../heroine/looks';
import { bodyFileFor, findBodySkin } from '../heroine/fast/bodyFile';
import type { BakedLookManifest } from '../heroine/fast/bakedLook';
import { packShape } from '../heroine/fast/shapeFile';
import { bakeSkinnedUV } from './skinnedUvBake';
import { capturePieces } from './capturePieces';
import { repackUv } from './repackUv';
import { packPieces } from '../heroine/fast/piecesFile';
import { MOTION_SHAPES } from '../heroine/fast/shapedBody';

/** The pictures' sizes, in pixels a side. Her colour is what the eye reads; her shine needs far less. */
const ALBEDO_SIZE = 4096, NORMAL_SIZE = 2048, SURFACE_SIZE = 1024;
/** How hard each picture is squeezed (WebP quality, 0-1). The colour and detail pictures are kept nearly whole. */
/** The gap left round every island of the baked pictures' layout, in texels of the colour picture. */
const ISLAND_GAP_TEXELS = 10;
const ALBEDO_QUALITY = 0.95, NORMAL_QUALITY = 0.95, SURFACE_QUALITY = 0.9;

const status = document.getElementById('status')!;
const say = (text: string): void => { status.textContent = text; console.log(`[bake] ${text}`); };

/** RGBA bytes (row 0 first) as a WebP picture. */
async function toWebp(rgba: Uint8Array, size: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('this browser gave no 2D canvas to write a picture with');
  // (every texel is opaque: a see-through texel's colour would be thrown away by the picture format)
  const opaque = new Uint8ClampedArray(rgba);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  context.putImageData(new ImageData(opaque, size, size), 0, 0);
  return new Promise((done, fail) => canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error('the picture could not be written'))), 'image/webp', quality));
}

async function start(): Promise<void> {
  const asked = new URLSearchParams(location.search);
  const key = lookKey(asked.get('look'));
  const look = LOOKS[key];
  say(`Baking "${key}": opening the Character Builder's room…`);

  // A renderer of our own. Nothing is shown on its canvas; the builder compiles and draws her materials with it.
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(16, 16, false);
  document.getElementById('app')!.appendChild(renderer.domElement);

  // ---- 1. the builder's room, with her FULL skin (every point of the body file) ----------------------------------
  const room = await openBuilderRoom({
    renderer, look, lightSkin: false,
    onProgress: (stage) => say(`Baking "${key}": ${stage}…`),
  });
  // a second of standing, so her springs and anything that landed late have settled
  for (let k = 0; k < 30; k++) room.step(1 / 30);

  const skin = findPaintedSkin(room.model);
  if (!skin) throw new Error('the room has no painted skin to bake (does this look have painted clothes?)');
  room.scene.updateMatrixWorld(true);

  // Everything the room draws for her, written down so a person can see what a bake leaves out (sneakers, for one).
  const drawn: string[] = [];
  room.scene.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const g = mesh.geometry, triangles = Math.round((g.index ? Math.min(g.index.count, g.drawRange.count) : g.getAttribute('position').count) / 3);
    const std = material as THREE.MeshStandardMaterial;
    const how = `${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 'skinned' : `rigid under ${mesh.parent?.name || mesh.parent?.type}`}, ${g.getAttribute('position').count} points, attrs ${Object.keys(g.attributes).join('/')}, ${g.morphAttributes.position?.length ?? 0} shapes, map ${std.map ? 'yes' : 'no'}, vertexColors ${String(std.vertexColors)}, colour #${std.color?.getHexString?.()}, rough ${std.roughness}, side ${std.side}, patched ${material?.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile}`;
    drawn.push(`${mesh.name || '(no name)'} | ${material?.name || material?.type} | ${triangles} triangles${mesh === skin ? ' | HER SKIN' : ''} | ${how}`);
  });

  // ---- 1b. the body FILE itself: its triangles are the ones baked, and its points are checked against the room's (step 4) -------------------------------------------------
  // The fast heroine lays this shape over the file's own points, one for one. That only works while the room keeps
  // the file's points in the file's order, so it is checked here: the same count, and the same place in her texture
  // layout for every point. A bake that fails this check is refused.
  say(`Baking "${key}": checking against the body file…`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // (hers, or his for a look on the male body)
  const file = await loader.loadAsync(`${import.meta.env.BASE_URL}${bodyFileFor(look.body.model)}`);
  const fileSkin = findBodySkin(file.scene);
  if (!fileSkin) throw new Error('the body file has no skin mesh');
  const fileTriangles = fileSkin.geometry.index?.array;
  if (!fileTriangles) throw new Error('the body file has no triangle list');

  // ---- 2. her skin's colour, surface detail and shine, as pictures ---------------------------------------------------
  // The builder's materials are run "as seen from" this camera: in front of her, as the room's own camera stands.
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 2000);
  camera.position.set(0, 1.0 * ROOM_UNITS, 3.2 * ROOM_UNITS);
  camera.lookAt(0, 1.0 * ROOM_UNITS, 0);
  camera.updateMatrixWorld(true);

  // The baked pictures get a texture layout of their own: the file's islands moved apart, so far-away (blurred) reads
  // of the picture never mix one island's colour into the next (repackUv.ts explains what went wrong without it).
  const fileLayout = fileSkin.geometry.getAttribute('uv');
  const layout = repackUv(Float32Array.from({ length: fileLayout.count * 2 }, (_, k) => fileLayout.getComponent(k >> 1, k & 1)), fileTriangles, ISLAND_GAP_TEXELS / ALBEDO_SIZE);
  say(`Baking "${key}": her colour (${ALBEDO_SIZE} px)…`);
  const albedo = bakeSkinnedUV(renderer, skin, ALBEDO_SIZE, camera, 'albedo', fileTriangles, layout.uv);
  say(`Baking "${key}": her surface detail (${NORMAL_SIZE} px)…`);
  const normal = bakeSkinnedUV(renderer, skin, NORMAL_SIZE, camera, 'normal', fileTriangles, layout.uv);
  say(`Baking "${key}": her shine (${SURFACE_SIZE} px)…`);
  const surface = bakeSkinnedUV(renderer, skin, SURFACE_SIZE, camera, 'surface', fileTriangles, layout.uv);

  // ---- 3. her shape: every point of her skin where the builder finally put it -----------------------------------------
  say(`Baking "${key}": her shape…`);
  const rest = restSkinMatrix(skin);
  const capture = captureVertices(renderer, skin, camera, { matrix: rest.matrix });
  const count = capture.count;
  // which bones move each point, as the builder has them now (it corrects some of the file's own)
  const boneAttribute = skin.geometry.getAttribute('skinIndex'), weightAttribute = skin.geometry.getAttribute('skinWeight');
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = boneAttribute.getComponent(i, k); skinWeight[i * 4 + k] = weightAttribute.getComponent(i, k); }
  // how tall her bare body stands in the room: every point of her skin as her bones hold it now (three.js's own
  // `getVertexPosition`), in the room's centimetres
  let top = -Infinity, bottom = Infinity;
  const point = new THREE.Vector3();
  const skinWorld = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld).toArray(skinWorld, i * 3);
    if (point.y > top) top = point.y;
    if (point.y < bottom) bottom = point.y;
  }

  // ---- 3b. her extra pieces: what the room draws for this outfit that is not her skin (capturePieces.ts) --------------
  say(`Baking "${key}": her extra pieces…`);
  const fileDictionary = fileSkin.morphTargetDictionary ?? {};
  const fileMotion = MOTION_SHAPES.map((name) => {
    const moves = fileSkin.geometry.morphAttributes.position?.[fileDictionary[name]], out = new Float32Array(count * 3);
    if (moves) for (let i = 0; i < count; i++) { out[i * 3] = moves.getX(i); out[i * 3 + 1] = moves.getY(i); out[i * 3 + 2] = moves.getZ(i); }
    return out;
  });
  // (her hair comes from its own file; the two pieces between her legs are under her leggings and are never seen)
  // (a look may leave the fabric across her cleavage out: on a high-necked suit painted on her skin, graySuit.ts, the
  //  strip's edges came out in her skin's colour, and the suit's paint already runs into her cleavage)
  // (and a second copy of the body file's own mesh, 'Mesh_0', which the room keeps beside his skin on the MALE body: a
  //  plain copy of his 123,023 points that would have been baked as a 9 MB "piece" over him. John, 2026-11-21)
  // (and on the MALE body, two pieces the room lays for HER that it leaves standing on him: the strip across her cleavage,
  //  baked on him as a skin-coloured patch on his chest and a black spike down between his legs, and her tunic's drape,
  //  white flecks at his waist. John, 2026-11-21)
  const herPieceOnHim = (mesh: THREE.Mesh): boolean => look.body.model === 'male-base' && /^(cleavageBridge|tunicDrape)$/.test(mesh.name);
  const isExtraPiece = (mesh: THREE.Mesh): boolean => !/^sarah(Hair|Vulva|Vagina)$/.test(mesh.name) && mesh.name !== 'finger-fills' && mesh.name !== 'Mesh_0' && !herPieceOnHim(mesh)
    && !(look.noCleavageBridge && mesh.name === 'cleavageBridge') && !(look.onlyNamedPieces && !mesh.name);
  const extra = await capturePieces(renderer, camera, room.scene, skin, skinWorld, fileMotion, isExtraPiece);
  // the lowest point of anything she stands on (her sneakers' soles), over the room's floor
  let lowest = bottom;
  room.scene.traverseVisible((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/^sneaker/.test(mesh.name)) return;
    const points = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < points; i++) lowest = Math.min(lowest, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y);
  });

  // ---- 4. the room's points against the file's, to be sure the two line up -----------------------------------------
  const fileCount = fileSkin.geometry.getAttribute('position').count;
  if (fileCount !== count) throw new Error(`the room's skin has ${count} points but the body file has ${fileCount}: the shape cannot be laid over the file`);
  const roomUv = skin.geometry.getAttribute('uv'), fileUv = fileSkin.geometry.getAttribute('uv');
  let uvOff = 0;
  for (let i = 0; i < count; i++) uvOff = Math.max(uvOff, Math.abs(roomUv.getX(i) - fileUv.getX(i)), Math.abs(roomUv.getY(i) - fileUv.getY(i)));
  if (uvOff > 1e-4) throw new Error(`the room's skin and the body file disagree about her texture layout (by ${uvOff}): the points are not in the same order`);
  // (for the record: how far the builder moved her points from the file's own, and how many points' bones it changed)
  const filePosition = fileSkin.geometry.getAttribute('position');
  let moved = 0, movedMost = 0, weightsChanged = 0;
  const fileBones = fileSkin.geometry.getAttribute('skinIndex'), fileWeights = fileSkin.geometry.getAttribute('skinWeight');
  for (let i = 0; i < count; i++) {
    const d = Math.hypot(capture.position[i * 3] - filePosition.getX(i), capture.position[i * 3 + 1] - filePosition.getY(i), capture.position[i * 3 + 2] - filePosition.getZ(i));
    if (d > 1e-5) moved++;
    if (d > movedMost) movedMost = d;
    for (let k = 0; k < 4; k++) if (fileBones.getComponent(i, k) !== skinIndex[i * 4 + k] || Math.abs(fileWeights.getComponent(i, k) - skinWeight[i * 4 + k]) > 0.01) { weightsChanged++; break; }
  }

  // ---- 5. write the files ------------------------------------------------------------------------------------------------
  say(`Baking "${key}": writing the files…`);
  const head = normaliseHead(look.body.head);
  const male = look.body.model === 'male-base';
  // her NAVEL control's setting: one of the numbers in her look's body shape (the builder's own text)
  let navel = 0;
  let settings: Record<string, number> = {};
  try { settings = (JSON.parse(look.body.shape) as { shape?: Record<string, number> }).shape ?? {}; navel = Number(settings.navel ?? 0) || 0; } catch { /* no shape text: the defaults */ }
  const percent = (key: string): number => (Number.isFinite(settings[key]) ? Number(settings[key]) : 100);
  // the week her belly stands for, off her own chart (her look's pregnancy numbers), or 0 when she is not pregnant
  const pregnancy = readPregnancy((look.body as { pregnancy?: unknown }).pregnancy);
  const weeks = pregnancy.pregnant ? herWeek(look.body.bump, 1, pregnancy) : 0;
  const roomMaterial = (Array.isArray(skin.material) ? skin.material[0] : skin.material) as THREE.MeshStandardMaterial;
  const manifest: BakedLookManifest = {
    version: 1,
    look: key,
    bakedAt: new Date().toISOString(),
    builderVersion: __APP_VERSION__,
    belly: look.body.bump,
    vertexCount: count,
    barefootHeightMetres: (top - bottom) / ROOM_UNITS,
    navel,
    motion: { walkBob: percent('walkBob'), walkSway: percent('walkSway'), breastBounce: percent('breastBounce') },
    weeks,
    normalScale: [roomMaterial.normalScale?.x ?? 1, roomMaterial.normalScale?.y ?? 1],
    // (no hair on the male body: the builder draws none on him, and his export has no head, which would otherwise read
    //  as her default ponytail)
    hair: male || head.hair.style === HAIR_STYLE_NONE ? null : { style: head.hair.style, colour: head.hair.colour, length: head.hair.length },
    body: look.body.model,
    files: { albedo: 'albedo.webp', normal: 'normal.webp', surface: 'surface.webp', shape: 'shape.bin', pieces: extra.pieces.length ? 'pieces.bin' : null },
    facts: {
      drawnInTheRoom: drawn,
      extraPieces: extra.notes, lowestPointOverTheFloorMetres: lowest / ROOM_UNITS,
      solesOverTheFloorMetres: bottom / ROOM_UNITS, crownOverTheFloorMetres: top / ROOM_UNITS,
      pointsTheBuilderMoved: moved, movedMostGeometryUnits: movedMost, pointsWithChangedBones: weightsChanged,
      restSkinSpread: rest.spread, captureMissing: capture.missing,
      albedoCoveredTexels: albedo.coveredCount, textureIslands: layout.islands, islandsShrunkTo: layout.scale,
    },
  };
  const blobs: Record<string, Blob> = {
    'albedo.webp': await toWebp(albedo.rgba, ALBEDO_SIZE, ALBEDO_QUALITY),
    'normal.webp': await toWebp(normal.rgba, NORMAL_SIZE, NORMAL_QUALITY),
    'surface.webp': await toWebp(surface.rgba, SURFACE_SIZE, SURFACE_QUALITY),
    'shape.bin': new Blob([packShape({ count, position: capture.position, normal: capture.normal, uv: layout.uv, skinIndex, skinWeight }) as BlobPart], { type: 'application/octet-stream' }),
    'look.json': new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
  };
  if (extra.pieces.length) blobs['pieces.bin'] = new Blob([packPieces(extra.pieces) as BlobPart], { type: 'application/octet-stream' });
  Object.assign(blobs, extra.pictures);

  // download buttons for a person, small previews of the pictures, and base64 for a script
  const filesHost = document.getElementById('files')!, picturesHost = document.getElementById('pictures')!;
  const files: Record<string, string> = {};
  let total = 0;
  for (const [name, blob] of Object.entries(blobs)) {
    total += blob.size;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.textContent = `${name} (${(blob.size / 1024).toFixed(0)} KB)`;
    filesHost.appendChild(link);
    if (name.endsWith('.webp')) { const img = document.createElement('img'); img.src = url; img.title = name; picturesHost.appendChild(img); }
    files[name] = toBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  room.dispose();
  say(`Baked "${key}": ${Object.keys(blobs).length} files, ${(total / 1048576).toFixed(2)} MB. Put them in Game/public/heroines/${key}/\n`
    + `${count.toLocaleString()} points; the builder moved ${moved.toLocaleString()} of them (by up to ${movedMost.toFixed(4)} of the file's units) and changed the bones of ${weightsChanged.toLocaleString()}.\n`
    + `Drawn in the room:\n  ${drawn.join('\n  ')}`);
  (window as unknown as Record<string, unknown>).gdmBake = { done: true, look: key, manifest, files };
}

start().catch((error: unknown) => {
  const message = String((error as Error)?.stack ?? error);
  say(`The bake failed: ${message}`);
  (window as unknown as Record<string, unknown>).gdmBakeError = message;
});
