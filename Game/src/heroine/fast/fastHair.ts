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
 * @param strands  draw it as strands and locks with hair's own shine (hairStrands.ts; Settings -> HEROINE -> Hair strands)
 */
export async function loadFastHair(choice: HairChoice, body: THREE.SkinnedMesh, strands = true): Promise<FastHair> {
  const style = hairStyle(choice.style);
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
    // the game's own: strands, locks and hair's banded shine instead of a shiny hat (Joshua, 2026-11-19)
    if (strands) addHairStrands(material);
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
