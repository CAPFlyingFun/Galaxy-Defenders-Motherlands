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
import { findPaintedSkin, measureSkin } from '../heroine/paintMask';
import { LOOKS, lookKey } from '../heroine/looks';
import { bodyFileFor, findBodySkin } from '../heroine/fast/bodyFile';
import type { BakedLookManifest } from '../heroine/fast/bakedLook';
import { packShape } from '../heroine/fast/shapeFile';
import { bakeSkinnedUV } from './skinnedUvBake';
import { layFaceBeyond } from './faceBeyond';
import { DRAPE_NAME, capturePieces, shirtColourFrom } from './capturePieces';
import { repackUv } from './repackUv';
import { packPieces } from '../heroine/fast/piecesFile';
import { measureBand, packBand, type BandPoints } from '../heroine/liveBand';
import { bakedWaist, measureWaist, packWaist, trunkPoints, type WaistJoints, type WaistPoints } from '../heroine/liveWaist';
import { mapBody } from '@charb/sarahlab/bodyRegions';
import { hoopInside, limbSkin, lowFrame, lowSpec } from '@charb/sarahlab/bottomCut';
import { followedAt, wornParams, type CoverageParams } from '@charb/sarahlab/paintTemplates';
import { SARAH_LAB_FIELD } from '@charb/sarahlab/sarahLabTool';
import { HEM_PAINT_ROWS } from '@charb/sarahlab/tunicDrape';
import { AUX_ATTRIBUTE } from '@charb/sarahlab/fabricMaterial';
import { PAINT_LAYER_COUNT } from '@charb/sarahlab/bodyPaint';
import { hemKnitOf, shirtWearOf, type HemKnit } from '../heroine/shirtHem';
import { fabricFamily, pickHex, type FabricPick } from '@charb/sarahlab/fabricLibrary';
import { UNITS_PER_METRE as ROOM_UNITS_PER_METRE } from '@charb/sarahlab/units';
import { readBindJoints } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
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

/**
 * THE BUILDER'S HOOP FOR EACH OF HIS LINES (liveWaist.ts: under her belly a waistband is a tilted ring in the builder,
 * not a line along her skin). Made as the builder's own room makes it: her body map (SarahLabScene.ts `regions`), her
 * measures for a drawn bottom (fabricPanel.ts `lowFrameNow`), the leggings' numbers at each of his bellies as its room
 * lays them following her belly (paintTemplates.ts `followedAt`, v0.9.74), its spec (`lowSpec`: a hoop when it has a
 * hinge) and how far inside the hoop each point of her skin is (`hoopInside`), told on HER SHAPE AT THAT BELLY: the
 * room's belly slider set to it and her skin captured unposed, as for her shape as baked. The last line is the baked
 * one, at the baked numbers (`baked`: never following), on her shape as baked. Lists in trunk lengths, + inside (as
 * `measureWaist` writes them); null for a line that is no hoop. Her belly is put back as it was.
 */
async function builderHoops(
  room: Awaited<ReturnType<typeof openBuilderRoom>>, renderer: THREE.WebGLRenderer, camera: THREE.Camera, restMatrix: THREE.Matrix4,
  skin: THREE.SkinnedMesh, file: { scene: THREE.Object3D }, fileSkin: THREE.SkinnedMesh, triangles: ArrayLike<number>,
  restPoints: Float32Array, baked: ArrayLike<number>, template: { id: string; params: unknown } | null, bellies: readonly number[],
  bakedBelly: number, progress: (belly: number) => void,
): Promise<(Float32Array | null)[]> {
  if (!template) throw new Error('a live waistband on a layer with no template');
  // her body map, as the builder's room makes it: the room's own bones and weights for her (it corrects some of the
  // file's), on the body file's rest points and normals in its bind space
  const bind = readBindJoints(file.scene), named = measureHuman(bind).joints;
  const g = skin.geometry, n = g.getAttribute('position').count;
  const four = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => Float32Array.from({ length: n * 4 }, (_, i) => a.getComponent(Math.floor(i / 4), i % 4));
  const fileNormal = fileSkin.geometry.getAttribute('normal'), normalMatrix = new THREE.Matrix3().getNormalMatrix(fileSkin.bindMatrix), at = new THREE.Vector3();
  const restNormal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) at.fromBufferAttribute(fileNormal, i).applyMatrix3(normalMatrix).toArray(restNormal, i * 3);
  const jointAt = Object.fromEntries(Object.entries(named).map(([k, j]) => [k, [bind[j].x, bind[j].y, bind[j].z]])) as unknown as Parameters<typeof mapBody>[0]['jointAt'];
  const map = mapBody({ skinIndex: four(g.getAttribute('skinIndex')), skinWeight: four(g.getAttribute('skinWeight')), parents: bind.map((j) => j.parent), joints: named, restNormal, restPosition: restPoints, jointAt });
  const limb = limbSkin(map), J = map.joints ?? jointAt;
  // her units per metre: her skeleton's bind scale, as the room's rig reads it (HumanRig.ts `bindScale`)
  const scale = new THREE.Vector3();
  new THREE.Matrix4().copy(fileSkin.skeleton.boneInverses[0]).invert().decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const frame = lowFrame({
    unitsPerMetre: scale.x, facing: map.facing,
    joints: { pelvis: J.pelvis, spine: J.spine, chest: J.chest, neck: J.neck, hipL: J.hipL, kneeL: J.kneeL, ankleL: J.ankleL, hipR: J.hipR, kneeR: J.kneeR, ankleR: J.ankleR },
    skin: { rest: map.rest ?? restPoints, limb, index: triangles },
  });
  // (metres inside, as `hoopInside` tells it, in trunk lengths)
  const toTrunk = frame.unitsPerMetre / frame.trunk;
  const told = (params: CoverageParams, shaped: ArrayLike<number>): Float32Array | null => {
    const spec = lowSpec(params, frame);
    if (!spec.hinge) return null;
    const inside = hoopInside(frame, spec, limb, shaped);
    if (!inside) return null;
    for (let v = 0; v < inside.length; v++) inside[v] *= toTrunk;
    return inside;
  };
  const worn = wornParams(template.id, template.params as CoverageParams);
  const lists: (Float32Array | null)[] = [];
  for (const belly of bellies) {
    const params = followedAt({ ...worn, follow: { front: 0, back: 0 } }, belly);
    // (is it a hoop at all? his 0% is not: no need to reshape her for it)
    if (!lowSpec(params, frame).hinge) { lists.push(null); continue; }
    progress(belly);
    room.setSlider(SARAH_LAB_FIELD.bump, belly);
    for (let k = 0; k < 45; k++) room.step(1 / 30);
    lists.push(told(params, captureVertices(renderer, skin, camera, { matrix: restMatrix }).position));
  }
  // (her belly back as it was baked, and settled)
  room.setSlider(SARAH_LAB_FIELD.bump, bakedBelly);
  for (let k = 0; k < 45; k++) room.step(1 / 30);
  lists.push(told({ ...worn, follow: null }, baked));
  return lists;
}

/**
 * A PAINTED SHIRT'S PAINT ENDS ON ITS HEM BAND'S OWN LEVEL LINE (Joshua, 2026-11-23, of the casual tees and tops in the
 * game: "why does the bottom of the shirt look weird compared to mine... It looks all ragged"). The builder takes the
 * shirt's paint off her skin under its drape (tunicDrape.ts `hang`, her skin's `fabricAux` x, cut where it is over a
 * half): below the band's bottom edge, on a level line, AND wherever the drape hangs clear of her by more than 6 mm
 * (`HANG_FROM`) -- in patches round her groin and seat, which in its room the drape always covers, being built again
 * on her as she stands. The game's drape is baked once and moved on her bones in the game's own stance, and the patches
 * showed round its edge as black bites out of the shirt. So before her colour is baked her skin is given only the level
 * line: how far each point of her stands under the band's bottom row, over HEM_PAINT_ROWS of its rows either side,
 * as the builder lays it (0.5 on the line; rows measured on the drape itself as it stands in the room). Her shirt's paint
 * then ends there all round her, level, as the band does. Null when she wears no drape.
 */
const DRAPE_COLUMNS = 80;       // (tunicDrape.ts COLUMNS: its points round her in each row)
function levelShirtHem(scene: THREE.Object3D, skin: THREE.SkinnedMesh): { note: string; edge: number } | null {
  let drape: THREE.SkinnedMesh | null = null;
  scene.traverseVisible((node) => { if (!drape && node.name === DRAPE_NAME && (node as THREE.SkinnedMesh).isSkinnedMesh) drape = node as THREE.SkinnedMesh; });
  const aux = skin.geometry.getAttribute(AUX_ATTRIBUTE) as THREE.BufferAttribute | undefined;
  if (!drape || !aux) return null;
  const d = drape as THREE.SkinnedMesh, g = d.geometry, index = g.index;
  // its rows drawn: (rows - 1) strips of DRAPE_COLUMNS quads, two triangles each
  const drawn = Math.min(index ? index.count : 0, g.drawRange.count), rows = Math.round(drawn / (DRAPE_COLUMNS * 6)) + 1;
  if (rows < 2 || g.getAttribute('position').count < rows * DRAPE_COLUMNS) return null;
  d.skeleton.update(); skin.skeleton.update();
  const at = new THREE.Vector3(), heightOf = (i: number) => d.getVertexPosition(i, at).applyMatrix4(d.matrixWorld).y;
  const bottom: number[] = [], steps: number[] = [];
  for (let c = 0; c < DRAPE_COLUMNS; c++) {
    const low = heightOf((rows - 1) * DRAPE_COLUMNS + c), above = heightOf((rows - 2) * DRAPE_COLUMNS + c);
    bottom.push(low); steps.push(above - low);
  }
  const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  const edge = middle(bottom), step = middle(steps);
  if (!(step > 0)) return null;
  for (let v = 0; v < aux.count; v++) {
    const y = skin.getVertexPosition(v, at).applyMatrix4(skin.matrixWorld).y;
    aux.setX(v, Math.max(0, Math.min(1, 0.5 + (edge - y) / (2 * HEM_PAINT_ROWS * step))));
  }
  aux.needsUpdate = true;
  return { note: `${rows} rows, its bottom ${(Math.max(...bottom) - Math.min(...bottom)).toFixed(2)} room units from level`, edge };
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
    // (a live band is drawn by the game, not baked into her picture: liveBand.ts)
    leaveOutLiveBand: true,
    onProgress: (stage) => say(`Baking "${key}": ${stage}…`),
  });
  // a second of standing, so her springs and anything that landed late have settled
  for (let k = 0; k < 30; k++) room.step(1 / 30);

  const skin = findPaintedSkin(room.model);
  // (a painted shirt's hem: its paint on her skin ends on the drape's own level line, not in patches: `levelShirtHem`)
  // (only for a look whose shirt's hem the game draws as a band: every other keeps the builder's drape as it bakes)
  const levelled = skin && look.hemBand ? levelShirtHem(room.scene, skin) : null;
  if (levelled) say(`Baking "${key}": her shirt's paint ends level with its hem band (${levelled.note})…`);
  // (a hem run live, liveDrape.ts: her shirt's paint left WHOLE, none of it taken off by the drape as it stands in the
  //  room; the game takes it off by the drape's own numbers as it fits it on her, at any belly and stance)
  if (skin && look.liveDrape) {
    const aux = skin.geometry.getAttribute(AUX_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    if (aux) { for (let v = 0; v < aux.count; v++) aux.setX(v, 0); aux.needsUpdate = true; }
    say(`Baking "${key}": her shirt's paint left whole for its live hem…`);
  }
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
  // (with the look's freckles and rosy cheeks, if it has them: skinMarks.ts; Mary's, maryHead.ts)
  // (every picture with her eyes straight ahead and her upper lids as the look asks: heroineLook.ts `bakedFace`)
  const lids = look.bakedFace?.upperLids ?? 0;
  const albedo = bakeSkinnedUV(renderer, skin, ALBEDO_SIZE, camera, 'albedo', fileTriangles, layout.uv, look.skinMarks, lids);
  say(`Baking "${key}": her surface detail (${NORMAL_SIZE} px)…`);
  const normal = bakeSkinnedUV(renderer, skin, NORMAL_SIZE, camera, 'normal', fileTriangles, layout.uv, undefined, lids);
  say(`Baking "${key}": her shine (${SURFACE_SIZE} px)…`);
  const surface = bakeSkinnedUV(renderer, skin, SURFACE_SIZE, camera, 'surface', fileTriangles, layout.uv, undefined, lids);

  // ---- 3. her shape: every point of her skin where the builder finally put it -----------------------------------------
  say(`Baking "${key}": her shape…`);
  const rest = restSkinMatrix(skin);
  const capture = captureVertices(renderer, skin, camera, { matrix: rest.matrix });
  const count = capture.count;
  // A FACE SLIDER PAST THE BUILDER'S -1..+1 (faceBeyond.ts): the room laid each up to its end; the rest is laid here,
  // on the captured shape, by the builder's own field for that slider (Mary's and John's faces, 2026-11-22).
  const beyond = layFaceBeyond((look.body.head as { face?: Record<string, number> } | undefined)?.face, fileSkin, look.body.model === 'male-base', capture.position, capture.normal);
  if (beyond.points) say(`Baking "${key}": face sliders past their ends, ${Object.entries(beyond.sliders).map(([id, x]) => `${id} ${x > 0 ? '+' : ''}${x.toFixed(2)}`).join(', ')}: ${beyond.points.toLocaleString()} points, up to ${beyond.mostMm.toFixed(2)} mm…`);
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

  // ---- 3a. her LIVE BAND, if the look has one (liveBand.ts): where each point of her skin near it is from it -----------
  // (measured on the room's own skin, as the room measures its painted layers: the same points, in the same order)
  let band: BandPoints | null = null;
  if (look.liveBand) {
    say(`Baking "${key}": her live band…`);
    band = measureBand(look.liveBand, measureSkin(skin));
    if (band.count !== count) throw new Error(`the live band was measured on ${band.count} points, her shape has ${count}`);
  }

  // ---- 3a'. her LIVE WAISTBAND, if the look has one (liveWaist.ts): which of her points are her trunk, told now, on
  // her skin as baked (the rest of it is measured once everything else is baked: 3c)
  const waistTrunk = look.liveWaist ? trunkPoints(measureSkin(skin)) : null;

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
    && !(look.noCleavageBridge && mesh.name === 'cleavageBridge') && !(look.noTunicDrape && mesh.name === 'tunicDrape') && !(look.onlyNamedPieces && !mesh.name);
  // (a painted shirt's drape takes her shirt's own colour just above it, from her baked picture: capturePieces.ts;
  //  looked up on her UNPOSED shape, in its own units: her height in them over her height in metres)
  let lowUnposed = Infinity, highUnposed = -Infinity;
  for (let i = 0; i < count; i++) { const y = capture.position[i * 3 + 1]; if (y < lowUnposed) lowUnposed = y; if (y > highUnposed) highUnposed = y; }
  const unposedPerMetre = (highUnposed - lowUnposed) / ((top - bottom) / ROOM_UNITS);
  const extra = await capturePieces(renderer, camera, room.scene, skin, skinWorld, fileMotion, isExtraPiece, shirtColourFrom(capture.position, layout.uv, albedo, unposedPerMetre, undefined,
    // (a live side panel reaching her hem: the hem band takes its colour there)
    band && look.liveBand ? { ...band, colour: look.liveBand.colour } : null));

  // ---- 3c. her LIVE WAISTBAND (liveWaist.ts): how far under each of his lines (and the baked one) each point of her
  // trunk in the strip is -- up her trunk on her shape as baked, round her on her body file's rest points, her joints
  // as she was bound (the builder's own readers of them, as its rig reads her); then the leggings' own colour and shine
  // just under the baked line, which the game draws them in over the strip
  let waist: WaistPoints | null = null, waistLooks: { colour: string; roughness: number } | null = null;
  if (look.liveWaist && waistTrunk) {
    say(`Baking "${key}": her live waistband…`);
    const restAttr = fileSkin.geometry.getAttribute('position'), restPoint = new THREE.Vector3();
    const restPoints = new Float32Array(restAttr.count * 3);
    for (let i = 0; i < restAttr.count; i++) restPoint.fromBufferAttribute(restAttr, i).applyMatrix4(fileSkin.bindMatrix).toArray(restPoints, i * 3);
    const bind = readBindJoints(file.scene), named = measureHuman(bind).joints;
    const jointAt = (name: keyof WaistJoints) => { const j = bind[named[name]]; return [j.x, j.y, j.z] as const; };
    const joints: WaistJoints = { pelvis: jointAt('pelvis'), spine: jointAt('spine'), chest: jointAt('chest'), neck: jointAt('neck'), hipL: jointAt('hipL'), hipR: jointAt('hipR') };
    // UNDER HER BELLY, THE BUILDER'S HOOP (liveWaist.ts says why): for each of his lines that is one, and the baked one
    // if it is, how far inside it every point of her skin is, asked of the builder on her shape at that line's belly
    const live = look.liveWaist, lines = [...live.keys.map((k) => k.waist), bakedWaist(live)];
    const layers = (look.clothes as { layers: ({ template?: { id: string; params: unknown } | null } | null)[] }).layers;
    const told = await builderHoops(room, renderer, camera, rest.matrix, skin, file, fileSkin, fileTriangles, restPoints, capture.position,
      layers[live.layer]?.template ?? null, live.keys.map((k) => k.belly), look.body.bump, (b) => say(`Baking "${key}": her live waistband at ${b}%…`));
    // (the other lines up her trunk on her shape AS BAKED, round her on her rest points: liveWaist.ts says why; facing
    //  +1, her pregnant torso reaching further forward than back)
    waist = measureWaist(lines, told, waistTrunk, restPoints, capture.position, joints, 1);
    say(`Baking "${key}": her live waistband: ${told.map((t, k) => (t ? `${k < lines.length - 1 ? live.keys[k].belly + '%' : 'baked'} hoop` : null)).filter(Boolean).join(', ') || 'no hoops'}…`);
    // (the middle of what her pictures hold 0.5-6 cm under the baked line: the leggings and their edging, not a speck)
    const reds: number[] = [], greens: number[] = [], blues: number[] = [], rough: number[] = [];
    const at = (rgba: Uint8Array | Uint8ClampedArray, size: number, v: number, channel: number) =>
      rgba[(Math.min(size - 1, Math.floor(layout.uv[v * 2 + 1] * size)) * size + Math.min(size - 1, Math.floor(layout.uv[v * 2] * size))) * 4 + channel];
    const bakedUnder = waist.under[waist.under.length - 1];
    for (let k = 0; k < waist.index.length; k++) {
      if (bakedUnder[k] < 0.01 || bakedUnder[k] > 0.12) continue;
      const v = waist.index[k];
      reds.push(at(albedo.rgba, ALBEDO_SIZE, v, 0)); greens.push(at(albedo.rgba, ALBEDO_SIZE, v, 1)); blues.push(at(albedo.rgba, ALBEDO_SIZE, v, 2));
      rough.push(at(surface.rgba, SURFACE_SIZE, v, 1));
    }
    const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
    const hex = (x: number) => Math.round(x).toString(16).padStart(2, '0');
    waistLooks = { colour: `#${hex(middle(reds))}${hex(middle(greens))}${hex(middle(blues))}`, roughness: +(middle(rough) / 255).toFixed(3) };
  }
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

  // ---- 4b. A PAINTED SHIRT'S HEM BAND (heroineLook.ts `hemBand`, beltGear.ts `HEM`): the shirt, by the builder's rule
  // (shirtHem.ts); where its paint ends, metres over her hip joints (as she stands in the room), and its colour just
  // above there (the middle of her picture 1-5 cm over it, where the shirt's own paint is whole)
  const shirtWear = look.hemBand ? shirtWearOf(look.clothes) : null;
  let hemBand: { aboveHips: number; colour: string; knit?: HemKnit } | null = null;
  if (shirtWear && levelled) {
    const named = measureHuman(readBindJoints(file.scene)).joints, at = new THREE.Vector3();
    skin.skeleton.update();
    const hipY = Math.min(skin.skeleton.bones[named.hipL].getWorldPosition(at).y, skin.skeleton.bones[named.hipR].getWorldPosition(at).y);
    const reds: number[] = [], greens: number[] = [], blues: number[] = [], rough: number[] = [];
    for (let v = 0; v < count; v++) {
      const y = skinWorld[v * 3 + 1] - levelled.edge;
      if (y < 0.01 * ROOM_UNITS || y > 0.05 * ROOM_UNITS) continue;
      // (her trunk only, not her hands hanging beside it: the shirt's own paint covers it)
      if ((skin.geometry.userData.paintWeights as Float32Array)[v * PAINT_LAYER_COUNT + shirtWear.layer] < 0.9) continue;
      const px = Math.min(ALBEDO_SIZE - 1, Math.floor(layout.uv[v * 2] * ALBEDO_SIZE)), py = Math.min(ALBEDO_SIZE - 1, Math.floor(layout.uv[v * 2 + 1] * ALBEDO_SIZE)), o = (py * ALBEDO_SIZE + px) * 4;
      reds.push(albedo.rgba[o]); greens.push(albedo.rgba[o + 1]); blues.push(albedo.rgba[o + 2]);
      // (and how rough her shirt is baked there: her surface picture's green, as three.js reads it)
      const sx = Math.min(SURFACE_SIZE - 1, Math.floor(layout.uv[v * 2] * SURFACE_SIZE)), sy = Math.min(SURFACE_SIZE - 1, Math.floor(layout.uv[v * 2 + 1] * SURFACE_SIZE));
      rough.push(surface.rgba[(sy * SURFACE_SIZE + sx) * 4 + 1]);
    }
    const middle = (xs: number[]) => { const q = [...xs].sort((a, b) => a - b); return q.length ? q[q.length >> 1] : 128; };
    const hex = (x: number) => Math.round(x).toString(16).padStart(2, '0');
    // its knit, one repeat as long on her as the room lays the shirt's (the room's `unitsPerCm` for her skin: its node's
    // scale; over her rest places' units a metre: her skeleton's bind scale, the room's `unitsPerMetre`)
    const nodeScale = skin.getWorldScale(new THREE.Vector3()).x || 1, bindScale = new THREE.Vector3();
    new THREE.Matrix4().copy(skin.skeleton.boneInverses[0]).invert().decompose(new THREE.Vector3(), new THREE.Quaternion(), bindScale);
    // (as matte as her shirt is BAKED, not its fabric's own number: in the game her skin's shirt is lit by her surface
    //  picture, rougher than the fabric's 0.72, and a band at 0.72 caught more light -- lighter than M1's dark tee and
    //  M2's tank, MEASURED 2026-11-23; at what was baked, 0.92 there, the two read the same)
    const knitAsFabric = hemKnitOf(shirtWear, (ROOM_UNITS_PER_METRE / 100) / nodeScale, bindScale.x);
    const knit = knitAsFabric && rough.length ? { ...knitAsFabric, roughness: +(middle(rough) / 255).toFixed(3) } : knitAsFabric;
    hemBand = { aboveHips: +((levelled.edge - hipY) / ROOM_UNITS).toFixed(4), colour: `#${hex(middle(reds))}${hex(middle(greens))}${hex(middle(blues))}`, ...(knit ? { knit } : {}) };
  }

  // ---- 4c. A HEM RUN LIVE (liveDrape.ts): how much of her painted shirt covers each of her points, as the builder's own
  // paint has it (bodyPaint.ts: its weights, kept with her geometry), one byte a point (drape.bin), for the drape to stay
  // whole over wherever the shirt's paint ends and for her shader to take it off under the drape; and the shirt's
  // length, its knit, and what is under it there: the painted layer under the shirt (her leggings), its colour as its
  // swatch is (`pickHex`) and its fabric's roughness
  const drapeWear = look.liveDrape ? shirtWearOf(look.clothes) : null;
  let drapeCover: Uint8Array | null = null;
  let drapeAs: BakedLookManifest['drape'] | null = null;
  if (drapeWear && skin) {
    const weights = skin.geometry.userData.paintWeights as Float32Array | undefined;
    if (!weights || weights.length !== count * PAINT_LAYER_COUNT) throw new Error('a live hem, but her skin carries no paint weights to read the shirt\'s cover from');
    drapeCover = new Uint8Array(count);
    for (let v = 0; v < count; v++) drapeCover[v] = Math.round(Math.max(0, Math.min(1, weights[v * PAINT_LAYER_COUNT + drapeWear.layer])) * 255);
    const nodeScale = skin.getWorldScale(new THREE.Vector3()).x || 1, bindScale = new THREE.Vector3();
    new THREE.Matrix4().copy(skin.skeleton.boneInverses[0]).invert().decompose(new THREE.Vector3(), new THREE.Quaternion(), bindScale);
    const knit = hemKnitOf(drapeWear, (ROOM_UNITS_PER_METRE / 100) / nodeScale, bindScale.x);
    const layers = (look.clothes as { layers: ({ choice?: { fabric?: FabricPick | null } | null } | null)[] }).layers;
    let under: FabricPick | null = null;
    for (let i = drapeWear.layer - 1; i >= 0 && !under; i--) under = layers[i]?.choice?.fabric ?? null;
    if (!knit || !under) throw new Error('a live hem, but its shirt has no swatch or nothing is painted under it');
    drapeAs = { layer: drapeWear.layer, length: drapeWear.length, knit, under: pickHex(under), underRoughness: fabricFamily(under.family).roughness };
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
    // (HIS HAIR too, since builder v0.9.71 (his twelve hairstyles, John 2026-11-21): the game hangs HIS file of that
    //  style on him, fastHair.ts. A male look with no head of its own gets none: the default head is HER ponytail.)
    hair: head.hair.style === HAIR_STYLE_NONE || (male && !look.body.head) ? null : { style: head.hair.style, colour: head.hair.colour, length: head.hair.length },
    body: look.body.model,
    files: { albedo: 'albedo.webp', normal: 'normal.webp', surface: 'surface.webp', shape: 'shape.bin', pieces: extra.pieces.length ? 'pieces.bin' : null, ...(band ? { band: 'band.bin' } : {}), ...(waist ? { waist: 'waist.bin' } : {}), ...(drapeCover ? { drape: 'drape.bin' } : {}) },
    // (the live band's colour: the game draws it, liveBand.ts)
    ...(look.liveBand ? { band: { colour: look.liveBand.colour } } : {}),
    // (the live waistband: the leggings' colour and shine as baked, and the bellies his lines are for: liveWaist.ts)
    ...(look.liveWaist && waistLooks ? { waist: { ...waistLooks, bellies: look.liveWaist.keys.map((k) => k.belly) } } : {}),
    // (a painted shirt's hem band: where its paint ends over her hip joints and its colour, beltGear.ts `hem`)
    ...(hemBand ? { hem: hemBand } : {}),
    // (a hem run live: which layer the shirt is, its length and knit, and what is under it: liveDrape.ts)
    ...(drapeAs && drapeCover ? { drape: drapeAs } : {}),
    facts: {
      drawnInTheRoom: drawn,
      extraPieces: extra.notes, lowestPointOverTheFloorMetres: lowest / ROOM_UNITS,
      solesOverTheFloorMetres: bottom / ROOM_UNITS, crownOverTheFloorMetres: top / ROOM_UNITS,
      pointsTheBuilderMoved: moved, movedMostGeometryUnits: movedMost, pointsWithChangedBones: weightsChanged,
      restSkinSpread: rest.spread, captureMissing: capture.missing,
      faceSlidersPastTheirEnds: beyond, upperLidsAsBaked: lids,
      liveBandPoints: band?.index.length ?? 0,
      liveWaistPoints: waist?.index.length ?? 0,
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
  if (band) blobs['band.bin'] = new Blob([packBand(band) as BlobPart], { type: 'application/octet-stream' });
  if (waist) blobs['waist.bin'] = new Blob([packWaist(waist) as BlobPart], { type: 'application/octet-stream' });
  if (drapeCover) blobs['drape.bin'] = new Blob([drapeCover as BlobPart], { type: 'application/octet-stream' });
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
