// ============================================================================
// devRoomLook.ts -- the fast heroine dressed THE DEV ROOM'S WAY: nothing baked
// ahead of time, no pictures made from the builder's paint.
//
// Joshua, 2026-11-17: "you didn't copy how Anthill Airways did it exactly...
// it didn't bake anything into the smaller visual representation of it. For
// the moment, use the same exact settings and approach for our game from the
// DEV room."
//
// HOW ANTHILL AIRWAYS' DEV ROOM DRAWS A WOMAN (its devRoom.ts, read at v0.81):
//   1. HER BODY is the builder's own file (sarah-v2-body-slim.glb), loaded once.
//   2. HER SHAPE is the file's body shapes at weights worked out from her
//      numbers (belly %, bust size, navel), by the builder's own rules. They
//      are either left live or added into her points once in the browser
//      ("Body shapes: baked"), with her four motion shapes kept live.
//   3. HER CLOTHES are not the builder's paint at all. Her skin keeps the
//      file's own skin material, and a few lines added to its shader colour a
//      TEE, LEGGINGS and SNEAKERS over it by WHERE each point of her is as she
//      stands at rest: its height up her body and its distance from her
//      middle. One compiled program for everybody; each person has her own
//      colours and hem heights.
//   4. Under 25 % detail her skin's fine-detail picture is switched off (the
//      "plain" material), because it no longer lines up with big triangles.
//
// This file is steps 2 and 3 for our heroine. Steps 1 and 4, her detail levels,
// AUTO detail, her walk and her hair are the files beside this one, ported
// earlier. Because nothing is baked, HER BELLY CAN CHANGE SIZE at any time and
// nothing is left behind: the tee and leggings are worked out from her rest
// position on the graphics chip every frame.
//
// WHAT THIS IS NOT. It is not Blaze's real suit (the builder's paint: her bare
// belly, the waistband that swings under her bump, the bra's cut, its edging,
// the pink plates). The DEV Room has no code for any of that; it only has a
// tee and leggings. Her real suit is the baked look (bakedLook.ts), kept for
// later.
//
// One thing of the DEV Room's is left out here: the levelling of the tips of
// her bust under her tee (its `bustSmoothing`, the BREAST DETAIL stand-in). She
// is drawn with her skin's full relief there, which is what the DEV Room does
// for a look with no `bustDetail` set (its PLAIN look).
// ============================================================================
import * as THREE from 'three';
import type { BakedShape } from './shapeFile';

/** A look the DEV Room's way: her numbers and her outfit's colours. (The DEV Room's own `Look`, the parts used here.) */
export interface PaintedLook {
  readonly name: string;
  /** Her belly, % (the builder's `bump`). */
  readonly bump: number;
  /** The builder's NAVEL control: -100 deepest innie .. +100 fullest outie. */
  readonly navel: number;
  /** Her tee's and her leggings' colours. */
  readonly top: number;
  readonly legs: number;
  /** How far down her leg her leggings go: 0.25 shorts, 0.78 capris, 1 to the ankle. */
  readonly legLength: number;
  /** A long-sleeved tee (to the wrist) or a short-sleeved one. */
  readonly longSleeves: boolean;
  /** Her hair: the builder's style, its colour ('#rrggbb', or null for the file's own copper) and its length 0-1. */
  readonly hair: { readonly style: string; readonly colour: string | null; readonly length: number } | null;
}

/** The colour of the sneakers the DEV Room paints on her feet (its SNEAKERS). */
const SNEAKERS = 0xf2f2f2;
/** How tall she stands barefoot in the builder's room, metres (measured there for Blaze's body at a 100 % belly). */
export const BAREFOOT_HEIGHT_METRES = 1.6984770343659108;

/**
 * BLAZE, the DEV Room's way: her body as in her saved look (belly 100 %, navel 20), her hair as in her suit, and
 * the DEV Room's tee and leggings in her own two colours: Joshua's pink for the tee, near-black for the leggings.
 */
export const BLAZE_PAINTED: PaintedLook = {
  name: 'Blaze',
  bump: 100,
  navel: 20,
  top: 0xff4bff,
  legs: 0x15151b,
  legLength: 1,
  longSleeves: false,
  hair: { style: 'ponytail', colour: '#1c120e', length: 1 },
};

type Numbers = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/**
 * HER SHAPE (step 2): the file's own points with her body shapes added in at `weights`, once.
 * This is the DEV Room's "Body shapes: baked": base + each shape x its weight, for her points and for the
 * directions her surface faces. `moves`/`turns` give a shape from the file by name (how far it moves each point,
 * how it turns each direction).
 */
export function shapeFromFile(
  geometry: THREE.BufferGeometry,
  weights: Readonly<Record<string, number>>,
  moves: (name: string) => Numbers | undefined,
  turns: (name: string) => Numbers | undefined,
): BakedShape {
  const base = geometry.getAttribute('position'), facing = geometry.getAttribute('normal');
  const count = base.count;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    position[v * 3] = base.getX(v); position[v * 3 + 1] = base.getY(v); position[v * 3 + 2] = base.getZ(v);
    normal[v * 3] = facing.getX(v); normal[v * 3 + 1] = facing.getY(v); normal[v * 3 + 2] = facing.getZ(v);
  }
  for (const [name, weight] of Object.entries(weights)) {
    if (!weight) continue;
    const move = moves(name), turn = turns(name);
    if (move) for (let v = 0; v < count; v++) { position[v * 3] += move.getX(v) * weight; position[v * 3 + 1] += move.getY(v) * weight; position[v * 3 + 2] += move.getZ(v) * weight; }
    if (turn) for (let v = 0; v < count; v++) { normal[v * 3] += turn.getX(v) * weight; normal[v * 3 + 1] += turn.getY(v) * weight; normal[v * 3 + 2] += turn.getZ(v) * weight; }
  }
  // (a direction is one unit long)
  for (let v = 0; v < count; v++) {
    const length = Math.hypot(normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]) || 1;
    normal[v * 3] /= length; normal[v * 3 + 1] /= length; normal[v * 3 + 2] /= length;
  }
  // (null: her texture layout and her bones' hold on each point are the file's own)
  return { count, position, normal, uv: null, skinIndex: null, skinWeight: null };
}

export interface PaintedMaterials {
  /** For levels of 25 % and over: with her skin's fine surface detail. */
  readonly fine: THREE.MeshStandardMaterial;
  /** For lighter levels: the same without it. */
  readonly plain: THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * HER CLOTHES (step 3): the DEV Room's `paintedMaterial`, line for line. The file's own skin material (its skin
 * picture and all), with a tee, leggings and sneakers mixed over it in the shader by where each point is in her
 * REST pose: `vRest.x` its distance from her middle and `vRest.y` its height, both as a share of her height.
 *
 *   leggings  from their hem (uLegEnd) up to her waist (0.57 of her height), within her hips' width
 *   tee       from her waist (0.55) to her collar (0.835), within her trunk's width, plus its sleeves
 *   sneakers  the lowest 4 % of her
 *
 * Cloth is smooth: where she is clothed her skin's fine detail is not drawn and her surface is matt (0.85).
 * `box` is her body's bounding box at rest (the heights are measured in it).
 */
export function makePaintedMaterials(fileMaterial: THREE.Material, box: THREE.Box3, look: PaintedLook): PaintedMaterials {
  const make = (fine: boolean): THREE.MeshStandardMaterial => {
    const material = fileMaterial.clone() as THREE.MeshStandardMaterial;
    material.name = fine ? 'heroine-painted-fine' : 'heroine-painted-plain';
    // (on a much lighter body the fine-detail picture no longer lines up with the big triangles: off below 25 %)
    if (!fine) material.normalMap = null;
    const uniforms = {
      uTop: { value: new THREE.Color(look.top) },
      uLegs: { value: new THREE.Color(look.legs) },
      uShoe: { value: new THREE.Color(SNEAKERS) },
      // where the leggings end (height up her body): the DEV Room's own rule for a leg length
      uLegEnd: { value: 0.57 - Math.min(1, Math.max(0.1, look.legLength)) * 0.53 },
      // where the sleeves end
      uSleeveEnd: { value: look.longSleeves ? 0.56 : 0.71 },
      uY0: { value: box.min.y },
      uH: { value: box.max.y - box.min.y },
    };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform float uY0;\nuniform float uH;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = vec2(abs(position.x) / uH, (position.y - uY0) / uH);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform vec3 uTop;\nuniform vec3 uLegs;\nuniform vec3 uShoe;\nuniform float uLegEnd;\nuniform float uSleeveEnd;\nfloat drCloth = 0.0;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // leggings: waist down to their hem. tee: waist to collar, with its sleeves. sneakers.
            float legs = step(uLegEnd, vRest.y) * step(vRest.y, 0.57) * step(vRest.x, 0.125); // (her hands hang further out than her hips)
            float torso = step(0.55, vRest.y) * step(vRest.y, 0.835) * step(vRest.x, 0.115);
            // (below her shoulder, only what is out at her arm is sleeve)
            float sleeve = step(uSleeveEnd, vRest.y) * step(vRest.y, 0.835) * step(vRest.x, 0.2) * max(step(0.71, vRest.y), step(0.115, vRest.x));
            float topMask = max(torso, sleeve);
            float shoe = step(vRest.y, 0.04);
            diffuseColor.rgb = mix(diffuseColor.rgb, uLegs, legs * (1.0 - topMask));
            diffuseColor.rgb = mix(diffuseColor.rgb, uTop, topMask);
            diffuseColor.rgb = mix(diffuseColor.rgb, uShoe, shoe);
            drCloth = max(max(legs, topMask), shoe);
          }`,
        )
        // (cloth is smooth: her skin's fine detail isn't drawn through it)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, drCloth));')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, drCloth);');
    };
    // (three.js keeps one compiled program for each key: the fine and the plain one differ)
    material.customProgramCacheKey = () => (fine ? 'heroine-painted' : 'heroine-painted-plain');
    return material;
  };
  const fine = make(true), plain = make(false);
  return {
    fine, plain,
    dispose(): void {
      // (her skin's own pictures are shared by the two, and are let go with the body file)
      fine.dispose(); plain.dispose();
    },
  };
}
