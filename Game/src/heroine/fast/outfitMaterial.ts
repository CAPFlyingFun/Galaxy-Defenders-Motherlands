// ============================================================================
// outfitMaterial.ts -- the fast heroine's skin material: ONE ordinary three.js
// material wearing her baked look.
//
// In the builder's room her skin's material is the file's material with a long
// chain of shader patches on it (paint layers, fabric swatches, her face, her
// breathing, softening under cloth...). All of that work was done once by the
// bake (src/bake/), so here her skin is the plainest material three.js has for
// a lit surface, reading three pictures:
//   map           her finished colour (skin, face and painted outfit)
//   normalMap     her fine surface detail as the builder lit it
//   roughnessMap  \  how shiny each spot is (one picture: green = roughness,
//   metalnessMap  /  blue = metalness)
//
// PORTED FROM Anthill Airways' DEV Room (devRoom.ts `paintedMaterial`): only
// the idea of keeping TWO versions, "fine" with the surface-detail picture and
// "plain" without. On a much lighter body the detail picture no longer lines
// up with the big triangles and shows as dark blotches, so levels under 25 %
// wear the plain one. The DEV Room's own stand-in outfit (a tee and leggings
// coloured by height in the shader) is NOT used: her outfit is the builder's
// real one, from the bake.
// ============================================================================
import * as THREE from 'three';
import type { BakedLook } from './bakedLook';
import { freeMaterial } from './bodyFile';

export interface SkinMaterials {
  /** For levels of 25 % and over: with her fine surface detail. */
  readonly fine: THREE.MeshStandardMaterial;
  /** For lighter levels: the same without it. */
  readonly plain: THREE.MeshStandardMaterial;
  /** The live knit's stitch size (see ClothShine `knit`); nothing when the look has no live knit. */
  setKnitStitch(stitch: number): void;
  dispose(): void;
}

/** Below this detail her skin wears the plain material (the DEV Room's number). */
export const FINE_FROM_DETAIL = 25;

/**
 * Make her skin's two materials from the body file's own skin material (its settings are kept: which side is
 * drawn, how the detail picture is read) and a baked look. The file's own pictures are freed: nothing reads them.
 */
/** Roughness at and above this in her surface picture is cloth (the builder's knits are 0.72 to 0.97; her skin is under 0.6). */
const CLOTH_FROM = 0.62;
/**
 * ...and at and above this, the SMOOTH cloth: the builder's Flat family (0.92), which a look uses for glossy trim. (The
 * athletic knit is 0.72, well under it. Jersey, rib and sweater knits are up here too: a look that wants its trim to
 * shine does not use them.)
 */
const TRIM_FROM = 0.85;

/**
 * How shiny a look's cloth is: `cloth` the roughness its knits take, `trim` the roughness its smooth (Flat) cloth takes.
 * Either left out: that cloth keeps its own.
 */
export interface ClothShine {
  readonly cloth?: number;
  readonly trim?: number;
  /**
   * Darken the knit's GRAYS by this much (0.5 halves their light): the knit keeps its stitches, only darker (Joshua,
   * 2026-11-19: "manually darkening the image about 50%"). Coloured knit -- a red stripe -- and the smooth trim are
   * left as they are. Left out: no darkening.
   */
  readonly darken?: number;
  /**
   * A LIVE KNIT drawn over the suit's grays by the game (Joshua, 2026-11-19: "a temporary texture stitch amount from
   * 0.5-4x so I can adjust in the game in real time"): the athletic knit's Dark gray swatch from his fabric pack
   * (public/fabrics/athletic-darkgray-tile.jpg), laid on her from three sides, so it needs no seams on her skin's
   * picture and its size can change while she moves (`SkinMaterials.setKnitStitch`). Its stitch is the builder's:
   * 1 is the knit at its own size, a 5 cm repeat. Left out: none (the knit is only what the bake painted).
   */
  readonly knit?: KnitTile & { readonly stitch: number; readonly strength: number };
  /**
   * WHICH CLOTH THE LIVE KNIT COVERS: left out, the suit's grays (the catsuit); a colour (as '#rrggbb'), only the cloth
   * baked in that colour, which it REPLACES with the knit picture's own colours (Joshua, 2026-11-20, Look 2: "add this
   * for the navy blue texture" -- his navy picture on her navy, the white and gold left smooth).
   */
  readonly knitOn?: string;
  /**
   * PICTURES LAID ON ONE COLOUR EACH, in their own colours (Joshua, 2026-11-20, Look 2: his navy picture, then "Here is a
   * texture for the gold"): wherever her cloth was baked in `on`, the picture `file` (in public/) shows instead,
   * repeating every `metres`, laid on from three sides (with `depth`, metres, its light parts stand out that far: Joshua,
   * 2026-11-20, "add some depth to the blue and gold textures") as the live knit is, so it stretches with her. Up to three
   * (his navy, gold and white: "We could do this for the white... looks kind of sci-fi techy").
   */
  readonly prints?: readonly { readonly file: string; readonly on: string; readonly metres: number; readonly depth?: number }[];
}

/**
 * A live knit's picture: its file (in public/), its middle brightness (0-255, as measured from the file), and, if it
 * has one, its HEIGHT picture (white raised, black low, the same size and lined up thread for thread) with the real
 * depth of its threads in metres: the light then catches each thread as if it stood out that far.
 */
export interface KnitTile { readonly file: string; readonly middle: number; readonly bump?: { readonly file: string; readonly depth: number } }
/** The athletic knit's Dark gray swatch, from Joshua's fabric pack. */
export const ATHLETIC_KNIT: KnitTile = Object.freeze({ file: 'fabrics/athletic-darkgray-tile.jpg', middle: 46.2 });
/**
 * THE PERFORATED MESH of Look 1's picture (Joshua, 2026-11-19: "a multi-layer breathable mesh, but where no skin
 * shows through the holes"), drawn by scripts/make_mesh_tile.py (which prints its middle brightness).
 */
export const PERFORATED_MESH: KnitTile = Object.freeze({ file: 'fabrics/perforated-mesh-tile.png', middle: 122.3 });
/**
 * JOSHUA'S WOVEN MESH PHOTO (2026-11-19: "Are you able to apply this texture to her fabric?"), made to tile by
 * scripts/make_weave_tile.py (light flattened, edges cross-faded thread on thread, glints softened; it prints the
 * middle brightness). About 40 threads to the picture.
 */
/**
 * JOSHUA'S NAVY PICTURE for Look 2 (2026-11-20: "Can you add this for the navy blue texture?"): a deep royal blue
 * knit with fine ribs and a few glints, cross-faded at its edges so it repeats (public/fabrics/navy-sparkle-tile.png).
 * Laid on in its own colours over the navy (ClothShine `knitOn`).
 */
export const NAVY_SPARKLE = Object.freeze({ file: 'fabrics/navy-sparkle-tile.png' });
/** JOSHUA'S GOLD GLITTER picture for Look 2's gold (2026-11-20: "Here is a texture for the gold"), made to repeat the same way. */
export const GOLD_GLITTER = Object.freeze({ file: 'fabrics/gold-glitter-tile.png' });
/**
 * JOSHUA'S PEBBLE PICTURE for the bronze catsuit (2026-11-20: "found this texture but looks more muddy then bronze"):
 * only its GRAIN is kept, as a gentle shading (12%) of the suit's own bronze and as depth, so it reads as a pebbled
 * metallic leather, not brown mud (public/fabrics/bronze-pebble-tile.png).
 */
export const BRONZE_PEBBLE = Object.freeze({ file: 'fabrics/bronze-pebble-tile.png' });
/** JOSHUA'S WHITE TECH picture for Look 2's white (2026-11-20: "looks kind of sci-fi techy"), made to repeat, its middle the suit's white. */
export const WHITE_TECH = Object.freeze({ file: 'fabrics/white-tech-tile.png' });
export const WOVEN_MESH: KnitTile = Object.freeze({
  file: 'fabrics/woven-mesh-tile.png', middle: 68.7,
  // (its HEIGHT, made by Joshua in his Local Texture Lab, docs/tools/Local_Texture_Lab.html, from the tile above: the
  //  lab's own seam pass touched the tile's outer edge, so the tile is the lab's Base Color, lined up with the height.
  //  Joshua, 2026-11-19: "some real 3D depth even if only like 0.5mm")
  bump: { file: 'fabrics/woven-mesh-height.png', depth: 0.0005 },
});
/** Which knit the catsuit wears (Settings -> HEROINE -> Suit fabric): the picture and the size it is drawn at. */
export const SUIT_KNITS = Object.freeze({
  // (his photo: a picture repeat of 12 cm, so a thread about every 3 mm. Joshua, 2026-11-19: finer than the 3x it was
  //  first, which read "a bit coarse" in first person; under 2.4 it blurred to plain black from the usual camera)
  weave: { ...WOVEN_MESH, stitch: 2.4, strength: 1 },
  // (the perforated mesh drawn by code, at Joshua's 1.5x)
  mesh: { ...PERFORATED_MESH, stitch: 1.5, strength: 1 },
});

/** A live knit's repeat at stitch 1, metres (the builder's athletic knit: 5 cm). */
const KNIT = Object.freeze({ tileMetres: 0.05 });

/**
 * @param unitsPerMetre  how many of her skin model's own units make a metre (the live knit's size is in metres)
 */
export function makeSkinMaterials(fileMaterial: THREE.Material, look: BakedLook, renderer: THREE.WebGLRenderer, shine?: ClothShine, unitsPerMetre = 1): SkinMaterials {
  // THE LIVE KNIT's swatch and its numbers, shared by both materials (so the slider moves them together)
  const knitColour = shine?.knitOn ? new THREE.Color(shine.knitOn) : null;   // (in the working colours: as her colour is read)
  const knitUniforms = shine?.knit ? {
    knitMap: { value: new THREE.TextureLoader().load(import.meta.env.BASE_URL + shine.knit.file, (t) => { t.needsUpdate = true; }) },
    knitTile: { value: KNIT.tileMetres * shine.knit.stitch * unitsPerMetre },
    knitStrength: { value: shine.knit.strength },
    knitMiddle: { value: shine.knit.middle / 255 },
    // (its height picture, if it has one; a 1 x 1 flat picture otherwise, so the shader is the same either way)
    knitHeightMap: { value: shine.knit.bump
      ? new THREE.TextureLoader().load(import.meta.env.BASE_URL + shine.knit.bump.file, (t) => { t.needsUpdate = true; })
      : new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
    // (the threads' real depth, metres: the same whatever size the stitch is drawn at)
    knitDepth: { value: shine.knit.bump?.depth ?? 0 },
  } : null;
  if (knitUniforms) {
    const t = knitUniforms.knitMap.value;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // (read as plain numbers, how light each part of a stitch is; or, laid on in its own colours, as the colours it shows)
    t.colorSpace = knitColour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const h = knitUniforms.knitHeightMap.value;
    h.wrapS = h.wrapT = THREE.RepeatWrapping;
    h.colorSpace = THREE.NoColorSpace;
    h.anisotropy = t.anisotropy;
  }
  // THE PRINTS (ClothShine `prints`): each picture, its repeat and the colour it covers
  const prints = (shine?.prints ?? []).slice(0, 3).map((p) => {
    const map = new THREE.TextureLoader().load(import.meta.env.BASE_URL + p.file, (t) => { t.needsUpdate = true; });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return { map, tile: p.metres * unitsPerMetre, on: new THREE.Color(p.on), depth: p.depth ?? 0 };
  });
  const printUniforms: Record<string, { value: unknown }> = {};
  prints.forEach((p, i) => { printUniforms[`printMap${i}`] = { value: p.map }; printUniforms[`printTile${i}`] = { value: p.tile }; });
  /** Where her skin was as baked, and which way it faced: the knit and the prints are laid on by these. */
  const laidOn = !!knitUniforms || prints.length > 0;
  // (DEV only: test pages set the knit's numbers by hand)
  if (import.meta.env.DEV && knitUniforms) (window as unknown as { __knit?: unknown }).__knit = knitUniforms;
  const from = fileMaterial as THREE.MeshStandardMaterial;
  // A sharper picture at a slant (the side of her leg seen along its length), at little cost.
  const sharpness = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const picture of [look.albedo, look.normal, look.surface]) picture.anisotropy = sharpness;

  const make = (withDetail: boolean): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      name: withDetail ? 'heroine-skin-fine' : 'heroine-skin-plain',
      // every number is in the pictures, so the material's own are the neutral ones
      color: 0xffffff, roughness: 1, metalness: 1,
      map: look.albedo,
      roughnessMap: look.surface, metalnessMap: look.surface,
      normalMap: withDetail ? look.normal : null,
      side: from.side,
    });
    // (the bake divided her lit direction by the builder's own setting, so reading it back with that setting gives the
    // direction the builder lit her with)
    if (withDetail) material.normalScale.set(look.manifest.normalScale[0], look.manifest.normalScale[1]);
    // A SHINIER SUIT (a look's `clothShine`): after three.js reads the roughness picture, every spot that reads as cloth
    // takes the look's roughness instead -- its knit one, or its smooth trim's -- each blended in over a short range so
    // the edges stay soft. A few lines in the shader; her skin, face and hair keep their own.
    if (shine && (shine.cloth !== undefined || shine.trim !== undefined || shine.darken !== undefined || shine.knit || prints.length)) {
      const lines: string[] = ['float ownRoughness = roughnessFactor;'];
      const band = (from: number) => `smoothstep(${(from - 0.04).toFixed(3)}, ${from.toFixed(3)}, ownRoughness)`;
      if (shine.cloth !== undefined) lines.push(`roughnessFactor = mix(roughnessFactor, ${shine.cloth.toFixed(3)}, ${band(CLOTH_FROM)});`);
      if (shine.trim !== undefined) lines.push(`roughnessFactor = mix(roughnessFactor, ${shine.trim.toFixed(3)}, ${band(TRIM_FROM)});`);
      // THE DARKER KNIT: right after her colour is read, where the roughness picture says knit (not skin, not the smooth
      // trim) and the colour is a gray (its channels nearly equal: a red stripe is not), the colour is darkened
      const knitSuit = [
        // where the roughness picture says knit (not skin, not the smooth trim), and the colour there is a gray
        'float knitRoughness = texture2D(roughnessMap, vRoughnessMapUv).g;',
        `float knitHere = smoothstep(${(CLOTH_FROM - 0.04).toFixed(3)}, ${CLOTH_FROM.toFixed(3)}, knitRoughness) * (1.0 - smoothstep(${(TRIM_FROM - 0.04).toFixed(3)}, ${TRIM_FROM.toFixed(3)}, knitRoughness));`,
        'float knitColourful = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));',
        knitColour
          // (a look's own colour instead: wherever her cloth, knit or smooth, was baked in that colour)
          ? `float knitGray = (1.0 - smoothstep(0.012, 0.03, distance(diffuseColor.rgb, vec3(${knitColour.r.toFixed(5)}, ${knitColour.g.toFixed(5)}, ${knitColour.b.toFixed(5)})))) * smoothstep(${(CLOTH_FROM - 0.04).toFixed(3)}, ${CLOTH_FROM.toFixed(3)}, knitRoughness);`
          : 'float knitGray = (1.0 - smoothstep(0.02, 0.06, knitColourful)) * knitHere;',
      ];
      if (shine.darken !== undefined) knitSuit.push(`diffuseColor.rgb *= mix(1.0, ${(1 - shine.darken).toFixed(3)}, knitGray);`);
      if (knitUniforms) knitSuit.push(
        // THE LIVE KNIT, from three sides (each side's picture weighted by how much her skin faces it), as lighter and
        // darker than its middle: the suit's own colour goes lighter where a stitch stands and darker in its holes
        'vec3 knitSide = abs(normalize(vKnitNormal)); knitSide /= (knitSide.x + knitSide.y + knitSide.z);',
        // HOW STRETCHED her suit is here (Joshua, 2026-11-19: "real stretch fabric pulls thinner and more open over the
        // fullest part of her belly"): how much bigger a patch of her skin is now than as baked, from how both change
        // from this pixel to the next; 1 unstretched. The knit is laid on by where her skin WAS (vKnitRest), so it
        // grows with her: its threads draw apart, and from about 4 % more the holes open (darker gaps, the threads a
        // touch brighter and flatter), fully from 40 % more.
        'vec3 knitRX = dFdx(vKnitRest), knitRY = dFdy(vKnitRest);',
        'float knitRestArea = length(cross(knitRX, knitRY));',
        'float knitStretch = knitRestArea > 1e-14 ? sqrt(length(cross(dFdx(vKnitPos), dFdy(vKnitPos))) / knitRestArea) : 1.0;',
        'float knitOpen = smoothstep(1.04, 1.4, knitStretch);',
        'vec3 knitAt = vKnitRest / knitTile;',
        // HOW FINE the threads are on screen: past about one thread to two pixels (far off, or where the cloth curves
        // away), their depth fades out, as on her hair; the picture's own smaller copies keep its colour calm there
        'float knitFine = 1.0 - smoothstep(0.012, 0.03, length(fwidth(knitAt)));',
        'float knitLight = texture2D(knitMap, knitAt.zy).r * knitSide.x + texture2D(knitMap, knitAt.xz).r * knitSide.y + texture2D(knitMap, vec2(knitAt.x, -knitAt.y)).r * knitSide.z;',
        ...(knitColour
          // (its own colours, the three sides blended, in place of the baked colour)
          ? ['vec3 knitShown = texture2D(knitMap, knitAt.zy).rgb * knitSide.x + texture2D(knitMap, knitAt.xz).rgb * knitSide.y + texture2D(knitMap, vec2(knitAt.x, -knitAt.y)).rgb * knitSide.z;',
             'diffuseColor.rgb = mix(diffuseColor.rgb, knitShown, knitGray * knitStrength);']
          : ['float knitRatio = pow(max(knitLight / knitMiddle, 0.0), 1.0 + 0.7 * knitOpen);',
             'diffuseColor.rgb *= mix(1.0, knitRatio, knitGray * knitStrength);']),
        // ITS HEIGHT, the same three ways, in metres (its depth times how raised each spot is): read again below,
        // where the light's directions are worked out
        'float knitHeight = knitDepth * knitGray * knitFine * (1.0 - 0.3 * knitOpen) * (texture2D(knitHeightMap, knitAt.zy).r * knitSide.x + texture2D(knitHeightMap, knitAt.xz).r * knitSide.y + texture2D(knitHeightMap, vec2(knitAt.x, -knitAt.y)).r * knitSide.z);',
      );
      // THE PRINTS: each in its own colours where her cloth was baked in its colour (`prints`)
      if (prints.length) {
        knitSuit.push('float printCloth = smoothstep(' + (CLOTH_FROM - 0.04).toFixed(3) + ', ' + CLOTH_FROM.toFixed(3) + ', texture2D(roughnessMap, vRoughnessMapUv).g);',
          'vec3 printSide = abs(normalize(vKnitNormal)); printSide /= (printSide.x + printSide.y + printSide.z);');
        prints.forEach((p, i) => knitSuit.push(
          `float printHere${i} = (1.0 - smoothstep(0.03, 0.07, distance(diffuseColor.rgb, vec3(${p.on.r.toFixed(5)}, ${p.on.g.toFixed(5)}, ${p.on.b.toFixed(5)})))) * printCloth;`,
          `vec3 printAt${i} = vKnitRest / printTile${i};`,
          `vec3 printShown${i} = texture2D(printMap${i}, printAt${i}.zy).rgb * printSide.x + texture2D(printMap${i}, printAt${i}.xz).rgb * printSide.y + texture2D(printMap${i}, vec2(printAt${i}.x, -printAt${i}.y)).rgb * printSide.z;`,
          `diffuseColor.rgb = mix(diffuseColor.rgb, printShown${i}, printHere${i});`));
        // (their depth: each picture's lightness as a height, where it is shown, faded out where its grains are finer
        //  than a pixel, as the knit's is)
        knitSuit.push('float printHeight = 0.0;');
        prints.forEach((p, i) => { if (p.depth > 0) knitSuit.push(
          `printHeight += ${p.depth.toFixed(6)} * printHere${i} * (1.0 - smoothstep(0.012, 0.03, length(fwidth(printAt${i})))) * dot(printShown${i}, vec3(0.3, 0.59, 0.11));`); });
      }
      // (the prints' depth, as the knit's below)
      const printBump = prints.some((p) => p.depth > 0) ? [
        'vec3 printSigmaX = dFdx(-vViewPosition), printSigmaY = dFdy(-vViewPosition);',
        'float printLX = max(length(printSigmaX), 1e-7), printLY = max(length(printSigmaY), 1e-7);',
        'vec3 printR1 = cross(printSigmaY / printLY, normal), printR2 = cross(normal, printSigmaX / printLX);',
        'float printDet = dot(printSigmaX / printLX, printR1) * faceDirection;',
        'vec3 printBumped = abs(printDet) * normal - sign(printDet) * (dFdx(printHeight) / printLX * printR1 + dFdy(printHeight) / printLY * printR2);',
        'if (abs(printDet) > 0.02 && dot(printBumped, printBumped) > 1e-6) normal = normalize(printBumped);',
      ] : [];
      // THE THREADS' DEPTH (a "bump"): how fast the height changes from this pixel to the next, across and down the
      // screen, tilts her surface's direction the way a real raised thread would (Morten Mikkelsen's method, which
      // three.js's own bump maps use). Nothing is moved: only the light changes, so it costs almost nothing.
      const knitBump = knitUniforms ? [
        // (each pixel step made 1 long and the height's change divided by its length: the same answer, but never a
        //  vector of length nearly 0, which on cloth seen edge-on would light it a flat gray, as it did her hair)
        'vec3 knitSigmaX = dFdx(-vViewPosition), knitSigmaY = dFdy(-vViewPosition);',
        'float knitLX = max(length(knitSigmaX), 1e-7), knitLY = max(length(knitSigmaY), 1e-7);',
        'vec3 knitR1 = cross(knitSigmaY / knitLY, normal), knitR2 = cross(normal, knitSigmaX / knitLX);',
        'float knitDet = dot(knitSigmaX / knitLX, knitR1) * faceDirection;',
        'vec3 knitBumped = abs(knitDet) * normal - sign(knitDet) * (dFdx(knitHeight) / knitLX * knitR1 + dFdy(knitHeight) / knitLY * knitR2);',
        'if (abs(knitDet) > 0.02 && dot(knitBumped, knitBumped) > 1e-6) normal = normalize(knitBumped);',
      ] : [];
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, printUniforms);
        if (laidOn) {
          if (knitUniforms) Object.assign(shader.uniforms, knitUniforms);
          // (where the point is on her, before her bones move it: the knit stays put on her as she moves. After her
          //  shape's morphs, so it stretches round her belly as cloth would)
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 knitRest;\nvarying vec3 vKnitPos;\nvarying vec3 vKnitRest;\nvarying vec3 vKnitNormal;')
            .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvKnitPos = transformed;\nvKnitRest = knitRest;\nvKnitNormal = objectNormal;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
            '#include <common>\nvarying vec3 vKnitPos;\nvarying vec3 vKnitRest;\nvarying vec3 vKnitNormal;' +
            (knitUniforms ? '\nuniform sampler2D knitMap;\nuniform float knitTile;\nuniform float knitStrength;\nuniform float knitMiddle;\nuniform sampler2D knitHeightMap;\nuniform float knitDepth;' : '') +
            prints.map((_, i) => `\nuniform sampler2D printMap${i};\nuniform float printTile${i};`).join(''));
        }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_fragment>', '#include <map_fragment>\n' + knitSuit.join('\n'))
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + knitBump.join('\n') + '\n' + printBump.join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + lines.join('\n'));
      };
      // (three.js keeps one compiled shader per key: this one is its own)
      material.customProgramCacheKey = () => `cloth-shine-${shine.cloth}-${shine.trim}-${shine.darken}-${!!knitUniforms}-${shine.knitOn ?? ''}-${(shine.prints ?? []).map((p) => p.on + p.file + (p.depth ?? 0)).join('|')}-v5`;
    }
    return material;
  };
  const fine = make(true), plain = make(false);
  freeMaterial(fileMaterial);
  return {
    fine, plain,
    setKnitStitch(stitch: number): void {
      if (!knitUniforms) return;
      knitUniforms.knitTile.value = KNIT.tileMetres * stitch * unitsPerMetre;
    },
    dispose(): void {
      fine.dispose(); plain.dispose();
      knitUniforms?.knitMap.value.dispose(); knitUniforms?.knitHeightMap.value.dispose();
      // (the prints' pictures too: they live only in the shader's uniforms, so nothing else would find them. Found
      //  changing outfits in the game, 2026-11-20: each change left its prints on the graphics chip)
      for (const p of prints) p.map.dispose();
    },
  };
}
