// ============================================================================
// fastHair.ts -- her hair on the fast body.
//
// Her hair is one of the Character Builder's own hairstyle files, loaded as it
// is and hung on her body's skeleton. Its colour and its lighting fix are the
// builder's own code (Char_B: hairMaterial.ts `patchHairMaterial` and
// `setHairColour`, hairStyles.ts for the files and the 'shorter' shape).
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts): hanging the hair file on
// the body's bones by NAME (`makePerson`: "Her hair is its own file on its own
// copy of her skeleton"), its material (`hairMaterialFor`), and using each
// style's LIGHT file (about a fifth of the triangles) when she is drawn light.
// Here the full file is worn at 25 % detail and over, the light one below.
// ============================================================================
import * as THREE from 'three';
import { HAIR_LENGTH_MORPH, hairStyle } from '@charb/sarahlab/hairStyles';
import { patchHairMaterial, setHairColour } from '@charb/sarahlab/hairMaterial';
import { loadHairFile } from './bodyFile';
import { addHairStrands } from './hairStrands';
import { fitTo, keepSized, textureCap } from '../../core/textureSizes';

/**
 * HER HAIR'S PICTURE AT THE CHARACTER TEXTURE SIZE (v0.2.148; Joshua, 2026-11-22: hair "1024 to match/sync with
 * character's texture size"; core/textureSizes.ts). The hair file's own picture (1024) is kept as it came, and the
 * texture drawn is that picture or a smaller copy made from it, again whenever the setting changes. (At 1024 and up
 * it is the file's own picture, as before.)
 */
function sizeHairPicture(map: THREE.Texture): void {
  const own = map.image as ImageBitmap | undefined;
  if (!own || typeof createImageBitmap !== 'function' || !('width' in own)) return;
  let made: ImageBitmap | null = null;
  const drawAt = async (cap: number): Promise<void> => {
    const size = fitTo(own.width, own.height, cap);
    const before = made;
    let picture: ImageBitmap = own;
    if (size.width !== own.width || size.height !== own.height) {
      try {
        picture = await createImageBitmap(own, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
      } catch { picture = own; }
    }
    if (picture === map.image) return;
    made = picture === own ? null : picture;
    map.dispose();
    map.image = picture;
    map.needsUpdate = true;
    before?.close();
  };
  keepSized(map, 'character', drawAt);
  void drawAt(textureCap('character'));
}

/** What the baked look says about her hair. */
export interface HairChoice { readonly style: string; readonly colour: string | null; readonly length: number }

export interface FastHair {
  /** The full hair and its light twin. Both are in the scene; one is shown at a time. */
  readonly full: THREE.SkinnedMesh;
  readonly light: THREE.SkinnedMesh | null;
  readonly megabytes: number;
  /** Show the hair that suits a detail level, or none (first person). */
  show(detail: number, visible: boolean): void;
  /** Triangles of the hair being drawn now. */
  triangles(): number;
  dispose(): void;
}

/**
 * THE LOOSE LOCKS BY HER FACE, eased off her cheeks (Joshua, 2026-11-19, of a thin dark lock lying down her cheek in
 * front of her ear: "is this one hair strand in the cheek? It's bothered me... Just offset that piece, don't remove
 * it"). A hair file is made of separate pieces (each lock a piece of joined triangles); these are the SMALL pieces
 * (under `FACE_LOCK_MOST_POINTS` points) lying wholly in front of her ears (their backmost point ahead of the file's
 * middle) and below her crown. Each lies along her cheek, and her cheek curves out under it, so its lower part went
 * INTO her skin (its tips showed as dark specks on her cheek). Its lower part is moved straight out from her head (away
 * from the line up through the middle of her head): not at all at its top, which stays in her hair as the builder has
 * it (Joshua, 2026-11-19: the top moved "out of the hair" looked wrong), more and more toward its tip
 * (`FACE_LOCK_OUT` of its own length there), so it comes out of her cheek and rests on it. The braid has two such locks
 * a side.
 */
function easeFaceLocks(mesh: THREE.SkinnedMesh): number {
  const geometry = mesh.geometry, P = geometry.getAttribute('position') as THREE.BufferAttribute, index = geometry.index;
  if (!index) return 0;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, top = box.max.y, middleZ = (box.min.z + box.max.z) / 2;
  const middleX = (box.min.x + box.max.x) / 2;
  // (the middle of her head, front to back: half way between the back of her hair and its front)
  const headZ = (box.min.z + box.max.z) / 2;
  // (which piece each point belongs to: points joined by a triangle are one piece -- "union-find")
  const parent = new Int32Array(P.count).map((_, i) => i);
  const root = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < index.count; t += 3) {
    const a = root(index.getX(t));
    parent[root(index.getX(t + 1))] = a;
    parent[root(index.getX(t + 2))] = a;
  }
  // each piece's size, how far back it reaches, and its top and bottom
  const count = new Map<number, number>(), backmost = new Map<number, number>();
  const highest = new Map<number, number>(), lowest = new Map<number, number>();
  for (let v = 0; v < P.count; v++) {
    const k = root(v), y = P.getY(v);
    count.set(k, (count.get(k) ?? 0) + 1);
    backmost.set(k, Math.min(backmost.get(k) ?? Infinity, P.getZ(v)));
    highest.set(k, Math.max(highest.get(k) ?? -Infinity, y));
    lowest.set(k, Math.min(lowest.get(k) ?? Infinity, y));
  }
  const height = top - box.min.y;
  const isFaceLock = (k: number): boolean => count.get(k)! < FACE_LOCK_MOST_POINTS && backmost.get(k)! > middleZ && highest.get(k)! < top - 0.04 * height;
  let moved = 0;
  for (let v = 0; v < P.count; v++) {
    const k = root(v);
    if (!isFaceLock(k)) continue;
    const length = Math.max(1e-6, highest.get(k)! - lowest.get(k)!);
    // 0 at the lock's top, 1 at its tip, eased so it bends away smoothly
    const along = (highest.get(k)! - P.getY(v)) / length;
    // (nothing at the top; growing with the square of the way down, so the lock bends out smoothly from her hair)
    const out = length * FACE_LOCK_OUT.tip * along * along;
    // straight out from her head, level (away from the line up through its middle)
    const dx = P.getX(v) - middleX, dz = P.getZ(v) - headZ, flat = Math.hypot(dx, dz) || 1;
    P.setX(v, P.getX(v) + (dx / flat) * out);
    P.setZ(v, P.getZ(v) + (dz / flat) * out);
    moved++;
  }
  if (moved) { P.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }
  return moved;
}
/** A face lock is a small piece: the braid's are 38 points (18 in its light file); a whole style is thousands. */
const FACE_LOCK_MOST_POINTS = 200;
/** How far a face lock's tip is moved out from her head, as a share of the lock's length (its top is not moved). */
const FACE_LOCK_OUT = Object.freeze({ tip: 0.45 });
/** The styles whose face locks lie on her cheek (the ponytail's long side locks already hang clear: left alone). */
const EASED_STYLES: ReadonlySet<string> = new Set(['braid']);

/** From this detail up she wears her full hair. */
const FULL_HAIR_FROM_DETAIL = 25;

/**
 * Hang a hair mesh on the body's skeleton. If the hair file's bones are the body's, one for one and bound the same
 * way, the two meshes SHARE one skeleton (worked out once a frame); otherwise the hair gets its own list of the
 * body's bones, matched by name.
 */
function hangOnBody(hair: THREE.SkinnedMesh, body: THREE.SkinnedMesh): void {
  const own = hair.skeleton, theirs = body.skeleton;
  const same = own.bones.length === theirs.bones.length && own.bones.every((bone, i) => {
    if (bone.name !== theirs.bones[i].name) return false;
    const a = own.boneInverses[i].elements, b = theirs.boneInverses[i].elements;
    for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-5) return false;
    return true;
  });
  if (same) {
    hair.bind(theirs, hair.bindMatrix);
  } else {
    const byName = new Map<string, THREE.Bone>();
    for (const bone of theirs.bones) byName.set(bone.name, bone);
    hair.bind(new THREE.Skeleton(own.bones.map((bone) => byName.get(bone.name) ?? bone), own.boneInverses), hair.bindMatrix);
  }
  own.dispose();
}

/**
 * Load her hairstyle (full and light), colour it, and hang it on her body.
 * @param strands    draw it as strands and locks with hair's own shine (hairStrands.ts; Settings -> HEROINE -> Hair strands)
 * @param faceLocks  leave the small loose locks by her face where the file has them (`easeFaceLocks`; Settings -> HEROINE -> Locks by her face)
 * @param male       a male body: HIS file of the style (the builder's men's cuts, and her six refit to his head)
 */
export async function loadFastHair(choice: HairChoice, body: THREE.SkinnedMesh, strands = true, faceLocks = false, male = false): Promise<FastHair> {
  // (`male`: HIS file of the style, made for his head and bound to his skeleton: the builder's `models/hair/male/`,
  //  since v0.9.71. John, 2026-11-21: his crew cut)
  const style = hairStyle(choice.style, male);
  if (!style) throw new Error(`[heroine] the Character Builder has no hairstyle called "${choice.style}"`);
  const [fullFile, lightFile] = await Promise.all([
    loadHairFile(style.file),
    // (if the light file is missing she simply keeps her full hair at every level)
    loadHairFile(style.lightFile).catch(() => null),
  ]);
  const prepare = (mesh: THREE.SkinnedMesh): THREE.SkinnedMesh => {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // the builder's two patches: each lock lit as one round thing from both sides; its strands drawn in her colour
    patchHairMaterial(material);
    setHairColour(material, choice.colour);
    const map = (material as THREE.MeshStandardMaterial).map;
    if (map) sizeHairPicture(map);
    // the game's own: strands, locks and hair's banded shine instead of a shiny hat (Joshua, 2026-11-19)
    if (strands) addHairStrands(material);
    if (!faceLocks && EASED_STYLES.has(choice.style)) easeFaceLocks(mesh);
    // her hair's own shape: how long it is (the file is modelled at its longest; weight 1 is its shortest)
    const at = mesh.morphTargetDictionary?.[HAIR_LENGTH_MORPH];
    if (at !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[at] = 1 - choice.length;
    mesh.removeFromParent();
    hangOnBody(mesh, body);
    body.parent?.add(mesh);
    return mesh;
  };
  const full = prepare(fullFile.mesh), light = lightFile ? prepare(lightFile.mesh) : null;
  if (light) light.visible = false;
  const count = (mesh: THREE.SkinnedMesh): number => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
  const free = (mesh: THREE.SkinnedMesh): void => {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const map = (material as THREE.MeshStandardMaterial).map;
      if (map) { (map.image as ImageBitmap | undefined)?.close?.(); map.dispose(); }
      material.dispose();
    }
    if (mesh.skeleton !== body.skeleton) mesh.skeleton.dispose();
  };
  return {
    full, light,
    megabytes: fullFile.megabytes + (lightFile?.megabytes ?? 0),
    show(detail: number, visible: boolean): void {
      const wearFull = !light || detail >= FULL_HAIR_FROM_DETAIL;
      full.visible = visible && wearFull;
      if (light) light.visible = visible && !wearFull;
    },
    triangles(): number { return (full.visible ? count(full) : 0) + (light?.visible ? count(light) : 0); },
    dispose(): void { free(full); if (light) free(light); },
  };
}
