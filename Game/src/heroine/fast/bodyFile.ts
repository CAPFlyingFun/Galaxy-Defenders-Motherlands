// ============================================================================
// bodyFile.ts -- reading the Character Builder's body file, ONCE.
//
// The fast heroine draws the very same file the builder's room does
// (Char_B/public/models/sarah-v2-body-slim.glb, served as charb/models/...),
// the way Anthill Airways' DEV Room does: load it once with three.js's own
// loader and the "meshopt" decoder (the file is stored squeezed), then keep
// only what is needed.
//
// WHAT IS IN THE FILE (measured):
//   her SKIN          one mesh, material "Material_0": 115,710 points, 208,592 triangles, 43 body shapes
//   underwear pieces  ten meshes, material "bikini": about 80,000 triangles together
//   her skeleton      68 bones
//
// PORTED FROM the DEV Room (anthill-airways/src/devRoom.ts, `load` and
// `makePerson`): loading with GLTFLoader + MeshoptDecoder, and "Hidden pieces:
// skipped" -- the underwear is under her painted outfit and can never be seen,
// so it is thrown away here and never reaches the graphics card (the DEV Room
// set it invisible; here there is only ever one of her, so it is simply freed).
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** The body file, relative to the game's page. It must be listed in Game/charb-files.json or the built game will not have it. */
export const BODY_FILE = 'charb/models/sarah-v2-body-slim.glb';
/** HIS body file: the builder's Male Base Model (Char_B/public/models/male-base.glb; John, 2026-11-21). */
export const MALE_BODY_FILE = 'charb/models/male-base.glb';
/** The body file for a look's `body.model`: hers, or his for 'male-base'. */
export const bodyFileFor = (model: string): string => (model === 'male-base' ? MALE_BODY_FILE : BODY_FILE);
/** A hairstyle's file, from the path the builder's own list gives it (hairStyles.ts: 'models/hair/ponytail.glb'). */
export const hairFile = (builderPath: string): string => `charb/${builderPath}`;

/** The name the body file gives her skin's material, and her underwear's (as the DEV Room tells them apart). */
const SKIN_MATERIAL = 'Material_0', UNDERWEAR_MATERIAL = 'bikini';
/** The name every hairstyle file gives its material. */
export const HAIR_MATERIAL = 'sarahHair';

const firstMaterial = (mesh: THREE.Mesh): THREE.Material | undefined => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);

/** Her skin inside a loaded body file: the skinned mesh that wears the skin material. */
export function findBodySkin(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!found && mesh.isSkinnedMesh && firstMaterial(mesh)?.name === SKIN_MATERIAL) found = mesh;
  });
  return found;
}

function newLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/** Free a mesh's geometry, materials and their pictures (things of the file the fast heroine never draws). */
function freeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) freeMaterial(material);
}
/** Free a material and every picture it holds. */
export function freeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    const texture = value as THREE.Texture | null;
    if (texture && texture.isTexture) { (texture.image as ImageBitmap | undefined)?.close?.(); texture.dispose(); }
  }
  material.dispose();
}

export interface BodyFile {
  /** The file's scene: her skeleton's bones live under it, and her skin mesh. Add it under the heroine's root. */
  readonly scene: THREE.Group;
  /** Her skin, exactly as the file has it (all 43 shapes still on it). */
  readonly skin: THREE.SkinnedMesh;
  /** How many megabytes were downloaded for it. */
  readonly megabytes: number;
}

/** Load the body file and throw away her underwear pieces. */
export async function loadBodyFile(onProgress?: (stage: string) => void, bodyFile: string = BODY_FILE): Promise<BodyFile> {
  onProgress?.('body');
  // (hers, or his: `bodyFileFor` a look's body.model)
  const response = await fetch(`${import.meta.env.BASE_URL}${bodyFile}`);
  if (!response.ok) throw new Error(`[heroine] the body file did not load (${response.status}): ${bodyFile}`);
  const bytes = await response.arrayBuffer();
  onProgress?.('unpacking her body');
  const gltf = await newLoader().parseAsync(bytes, '');
  const scene = gltf.scene;
  const skin = findBodySkin(scene);
  if (!skin) throw new Error('[heroine] the body file has no skin mesh');

  // "Hidden pieces: skipped": the underwear never reaches the graphics card.
  const hidden: THREE.Mesh[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh !== skin && firstMaterial(mesh)?.name === UNDERWEAR_MATERIAL) hidden.push(mesh);
  });
  for (const mesh of hidden) { mesh.removeFromParent(); freeMesh(mesh); }

  return { scene, skin, megabytes: bytes.byteLength / 1048576 };
}

export interface HairFile {
  /** Her hair's mesh (not yet hung on her skeleton). */
  readonly mesh: THREE.SkinnedMesh;
  readonly megabytes: number;
}

/** Load one hairstyle file (the builder's own; for example charb/models/hair/ponytail.glb). */
export async function loadHairFile(builderPath: string): Promise<HairFile> {
  const url = `${import.meta.env.BASE_URL}${hairFile(builderPath)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`[heroine] her hair did not load (${response.status}): ${url}`);
  const bytes = await response.arrayBuffer();
  const gltf = await newLoader().parseAsync(bytes, '');
  let mesh: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((node) => {
    const m = node as THREE.SkinnedMesh;
    if (!mesh && m.isSkinnedMesh && firstMaterial(m)?.name === HAIR_MATERIAL) mesh = m;
  });
  if (!mesh) throw new Error(`[heroine] no hair mesh in ${url}`);
  return { mesh, megabytes: bytes.byteLength / 1048576 };
}
