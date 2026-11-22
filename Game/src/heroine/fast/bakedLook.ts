// ============================================================================
// bakedLook.ts -- a BAKED LOOK: one heroine's outfit and shape, written down
// ahead of time so the fast heroine does not need the Character Builder's room.
//
// A baked look is a small folder under Game/public/heroines/<look>/ :
//   look.json     this file's `BakedLookManifest`: what was baked, from what, and the names of the files below
//   albedo.webp   her skin's final COLOUR as the builder draws it (her skin, face, and every painted garment),
//                 laid out in her own texture layout (the body file's UVs)
//   normal.webp   her fine surface detail as the builder lights it (pores on bare skin, laid flat under cloth)
//   surface.webp  how shiny each spot is (green = roughness, blue = metalness: the layout three.js reads)
//   shape.bin     where each point of her skin is for this look (shapeFile.ts)
//   pieces.bin    the outfit's few extra pieces that are not skin: the fabric across her cleavage, her sneakers
//                 (piecesFile.ts), with a small picture for the sneakers (sneaker.webp)
//
// They are made by the bake page (Game/bake.html, src/bake/bakeLook.ts), which opens the builder's own room
// once and reads back what the builder's own shaders worked out. To change a look: change it in the
// Character Room, paste the export into src/heroine/looks/, and bake again (the steps are in bakeLook.ts).
//
// WHAT A BAKE FREEZES. The painted edges are drawn for the belly she was baked at. `setBelly` still reshapes
// her skin (the builder's own belly shapes), and the picture stretches with it, but an edge the builder would
// have re-drawn for the new belly (the waistband under her bump) stays where it was baked.
// ============================================================================
import { BAKED_AS } from '../looks/bakedAs';
import * as THREE from 'three';
import { unpackShape, type BakedShape } from './shapeFile';
import { unpackPieces, type BakedPiece } from './piecesFile';
import { loadPackedSized, packedPicturesOn } from './packedPictures';
import { decodeSized, keepSized, textureCap } from '../../core/textureSizes';

export interface BakedLookManifest {
  readonly version: 1;
  /** The look's key (its folder name, and its name in `?look=`). */
  readonly look: string;
  /** When it was baked, and from which version of the Character Builder. */
  readonly bakedAt: string;
  readonly builderVersion: string;
  /** Her belly when she was baked, 0-200 %. */
  readonly belly: number;
  /** How many points her skin has (the body file's: 115,710). */
  readonly vertexCount: number;
  /** How tall her bare body stands in the builder's room, the soles of her feet to the top of her head, metres. */
  readonly barefootHeightMetres: number;
  /** Her NAVEL control's setting in the builder (-100 deepest innie .. +100 fullest outie): needed when her belly is changed. */
  readonly navel: number;
  /** The builder's setting for how strongly her surface-detail picture is read (x, y): the baked picture is read back with it. */
  readonly normalScale: readonly [number, number];
  /**
   * How much she moves as she walks, from her look's body settings (the builder's WALK Bob and Sway and her breasts'
   * Bounce, percent: 100 is the builder's own tuning). Left out of a look baked before 2026-11-17: 100 each.
   */
  readonly motion?: { readonly walkBob: number; readonly walkSway: number; readonly breastBounce: number };
  /** The week of pregnancy her belly stands for, off her own chart (the builder's `herWeek`); 0 if she is not pregnant. */
  readonly weeks?: number;
  /** Her hair: the builder's style id, its colour ('#rrggbb', or null for the file's own copper) and length (0 shortest - 1). Null: no hair. */
  readonly hair: { readonly style: string; readonly colour: string | null; readonly length: number } | null;
  /**
   * Which of the builder's bodies the look is on: 'v2-body' hers, 'male-base' his (John, 2026-11-21). Left out of a look
   * baked before then: hers.
   */
  readonly body?: 'v2-body' | 'male-base';
  /** File names, beside look.json. */
  readonly files: { readonly albedo: string; readonly normal: string; readonly surface: string; readonly shape: string; readonly pieces: string | null };
  /**
   * HER BIG PICTURES PACKED for the graphics chip (scripts/make_ktx2.py; packedPictures.ts), when the look has them:
   * the .ktx2 files, her colour at 1024 for the CPU (the belt's waistband), and when they were made (a mark on their
   * addresses, as `bakedAt` is on the others).
   */
  readonly packed?: {
    readonly albedo: string; readonly normal: string; readonly surface: string; readonly skinHeight?: string;
    readonly albedoSmall: string; readonly packedAt: string;
  };
  /** Anything the bake measured that a person may want to read later (never used by the game). */
  readonly facts?: Readonly<Record<string, unknown>>;
}

/** A baked look, loaded and ready to put on the fast body. */
export interface BakedLook {
  readonly manifest: BakedLookManifest;
  readonly albedo: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly surface: THREE.Texture;
  readonly shape: BakedShape;
  /** The outfit's extra pieces (empty when it has none), and their pictures by file name. */
  readonly pieces: readonly BakedPiece[];
  readonly piecePictures: ReadonlyMap<string, THREE.Texture>;
  /**
   * HER COLOUR AS PIXELS THE PAGE CAN READ (the belt finds her waistband's trim in it: beltGear.ts). With packed
   * pictures, her colour at 1024 (a packed picture cannot be read back); otherwise her colour picture itself.
   */
  readonly cpuPicture: CanvasImageSource | null;
  /** Whether her big pictures came packed (for the readout and the skin height: skinTexture.ts). */
  readonly isPacked: boolean;
  /** How many megabytes were downloaded for the look. */
  readonly megabytes: number;
  dispose(): void;
}

/** The looks that have a baked folder. `?look=` names one of these; anything else has no fast version yet. */
export const BAKED_LOOKS: readonly string[] = ['blazeSuit', 'blaze'];

/** The folder a look's baked files are in (beside the game's page). */
export const bakedLookFolder = (look: string): string => `${import.meta.env.BASE_URL}heroines/${BAKED_AS[look] ?? look}/`;

/** Megabytes fetched so far for the look being loaded (added up by `fetchOk`'s callers). */
let fetchedBytes = 0;

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} did not load (${response.status})`);
  return response;
}

/**
 * Load one picture as a texture, set up the way the body file's own textures are (not flipped, repeating), no larger
 * than the CHARACTER texture setting and kept so when it changes (core/textureSizes.ts, v0.2.148).
 */
async function loadPicture(url: string, colour: boolean): Promise<THREE.Texture> {
  // (decoded off the main thread; rows in the order the bake wrote them, her own colours, straight from her file)
  const decode = async (cap: number): Promise<ImageBitmap> => {
    const blob = await (await fetchOk(url)).blob();
    fetchedBytes += blob.size;
    return decodeSized(blob, cap, { flipY: false, colour: false });
  };
  const texture = new THREE.Texture(await decode(textureCap('character')));
  keepSized(texture, 'character', async (cap) => {
    const picture = await decode(cap), before = texture.image as ImageBitmap;
    texture.dispose();
    texture.image = picture;
    texture.needsUpdate = true;
    before.close?.();
  });
  texture.flipY = false;
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Load one PACKED picture (a .ktx2 file) as a texture the graphics chip keeps packed (packedPictures.ts), no larger
 * than the CHARACTER texture setting, and kept so when it changes (core/textureSizes.ts, v0.2.148).
 */
async function loadPackedPicture(url: string, colour: boolean, renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  return loadPackedSized(url, colour, renderer, 'character', (bytes) => { fetchedBytes += bytes; });
}

/** A small picture decoded for the page to read (not a texture). */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const blob = await (await fetchOk(url)).blob();
  fetchedBytes += blob.size;
  return createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/**
 * Fetch a baked look's files (all at once) and unpack them. With a `renderer`, a look whose big pictures are packed
 * (look.json `packed`) has them loaded packed (packedPictures.ts; `?packed=off` loads the WebP pictures instead).
 */
export async function loadBakedLook(look: string, renderer?: THREE.WebGLRenderer): Promise<BakedLook> {
  const folder = bakedLookFolder(look);
  fetchedBytes = 0;
  // NEVER AN OLD COPY (Joshua, 2026-11-21: the Shadow Operative suit, re-baked in v0.2.123, still showed its old specks on
  // his iPhone in v0.2.124). Every file is asked for with a mark of WHICH bake it is: look.json with the game's version,
  // the rest with the bake's own time. A re-baked look's files then have new addresses, so neither Safari's own cache
  // nor any other copy on the way can hand back the old picture. (The game's offline store ignores the mark: it keeps
  // each file by a fingerprint of its contents, so a re-baked file is a different entry: vite.config.ts `pwa`.)
  const manifest = (await (await fetchOk(`${folder}look.json?v=${encodeURIComponent(__APP_VERSION__)}`)).json()) as BakedLookManifest;
  const bake = `?bake=${encodeURIComponent(manifest.bakedAt)}`;
  if (manifest.version !== 1) throw new Error(`baked look "${look}" is version ${String(manifest.version)}, which this game does not read`);
  const bytesOf = (name: string): Promise<ArrayBuffer> => fetchOk(folder + name + bake).then((r) => r.arrayBuffer()).then((b) => { fetchedBytes += b.byteLength; return b; });
  // HER BIG PICTURES: packed when the look has them (a quarter of the graphics memory), else the WebP pictures
  const packed = renderer && manifest.packed && packedPicturesOn() ? manifest.packed : null;
  const packedMark = packed ? `?bake=${encodeURIComponent(packed.packedAt)}` : '';
  // (a packed picture that fails or is too slow falls back to its WebP one: packedPictures.ts, NEVER STUCK)
  let fellBack = false;
  const picture = (webp: string, ktx2: string | undefined, colour: boolean): Promise<THREE.Texture> =>
    packed && ktx2 && renderer
      ? loadPackedPicture(folder + ktx2 + packedMark, colour, renderer).catch((error: unknown) => {
        console.warn(`[packed pictures] ${look}'s ${ktx2} did not load packed (${String(error)}); its WebP picture is used`);
        fellBack = true;
        return loadPicture(folder + webp + bake, colour);
      })
      : loadPicture(folder + webp + bake, colour);
  const [albedo, normal, surface, shapeBytes, pieceBytes, small] = await Promise.all([
    picture(manifest.files.albedo, packed?.albedo, true),
    picture(manifest.files.normal, packed?.normal, false),
    picture(manifest.files.surface, packed?.surface, false),
    bytesOf(manifest.files.shape),
    manifest.files.pieces ? bytesOf(manifest.files.pieces) : Promise.resolve(null),
    // (her colour for the page to read: the small copy when the big one is packed)
    packed ? loadBitmap(folder + packed.albedoSmall + packedMark) : Promise.resolve(null),
  ]);
  const shape = unpackShape(shapeBytes);
  const pieces = pieceBytes ? unpackPieces(pieceBytes) : [];
  // the pieces' own pictures (her two sneakers share one)
  const piecePictures = new Map<string, THREE.Texture>();
  await Promise.all([...new Set(pieces.map((p) => p.map).filter((m): m is string => !!m))].map(async (name) => { piecePictures.set(name, await loadPicture(folder + name + bake, true)); }));
  return {
    manifest, albedo, normal, surface, shape, pieces, piecePictures,
    cpuPicture: small ?? ((albedo.image as CanvasImageSource | undefined) ?? null),
    isPacked: !!packed && !fellBack,
    megabytes: fetchedBytes / 1048576,
    dispose(): void {
      // (a packed texture's `image` is only its size: nothing to close)
      for (const t of [albedo, normal, surface, ...piecePictures.values()]) { (t.image as ImageBitmap | undefined)?.close?.(); t.dispose(); }
      small?.close();
    },
  };
}
