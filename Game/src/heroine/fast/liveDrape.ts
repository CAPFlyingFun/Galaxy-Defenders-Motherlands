// ============================================================================
// liveDrape.ts -- A PAINTED SHIRT'S HEM, RUN LIVE, AS THE BUILDER RUNS IT
// (Joshua, 2026-11-23, of Mary's casual tops: "Make it exactly like CCBS and have
// it run live like the stripes and live body"; then, after a band made as her
// belt is: "Go live with it… let's get 3 done first with the live band that
// works and looks like CCBS").
//
// What it is. Paint lies on her skin, so a painted shirt follows her into every
// hollow: between her thighs, into the creases of her groin, under her seat. The
// builder spans them with a sheet in the shirt's fabric, its TUNIC DRAPE
// (Char_B tunicDrape.ts `TunicDrape`): level slices round her from her waist to
// the hem, each the outline a band pulled round her would take, of which a
// painted shirt shows only its HEM BAND (fabricPanel.ts `PAINTED_SHIRT_DRAPE`
// 'band'): a smooth, level bottom edge all round her that spans her groin and
// seat. It is fitted to her as she stands, then carried back to her bind pose
// through its own bones, so it rides her skeleton like her own skin.
//
// THE TWO HALVES OF IT, AS IN THE BUILDER'S ROOM. (1) The drape itself, drawn.
// (2) Her skin's shirt paint TAKEN OFF under it: below its hem as she stands now,
// and wherever it hangs clear of her (`TunicDrape.hang`, one number a point of
// her, cut where it is over a half: fabricMaterial.ts `fabricEdge`). The bake
// leaves the shirt's paint whole (bakeLook.ts `unhang`), and the game cuts it
// live by the drape's own numbers (`onHang` -> shapedBody.ts `setHemHang` ->
// outfitMaterial.ts HEM_GLSL), showing the leggings' colour where it is cut. A
// first try (2026-11-23, kept on branch live-hem-drape-wip) baked the cut once,
// at her baked belly: at any other belly or stance her paint's end and the
// drape's no longer agreed, and the drape's top fade showed it.
//
// Why live. Baked once in the builder's room and moved on her bones in the
// game's own stance, the drape and her skin under it (a few millimetres apart)
// took turns in front: a saw-tooth along its edge. So the game runs the
// BUILDER'S OWN CODE on her, here: `TunicDrape`, fitted on HER in the game's
// stance, built again whenever her shape changes (her belly) and whenever she
// comes to rest in a stance different from the one it was fitted to; between
// those it rides her bones, as it does in the builder's room.
//
// What it is built on. The builder's drape reads a body mesh by its points (the
// body file's, all of them, in their order): her visible skin is a detail level
// of only some of them, renumbered (shapedBody.ts). So the drape is given a
// STAND-IN of her: all her points as she is shaped now (`ShapedBody.points`),
// her bones and weights, her belly's motion shapes, her rest points (for the
// fabric's pattern), on her own skeleton, never drawn itself (its material is
// invisible; the drape, its child, is drawn). Her body's regions are the
// builder's own map of her (bodyRegions.ts `mapBody`), made once as she loads,
// and which of her skin the shirt covers is read from the bake (drape.bin: the
// shirt layer's paint at each of her points), so the band stays whole over
// wherever the shirt's paint ends, between her legs too.
//
// Its fabric is the builder's: the shirt's own swatch, cut from the fabric
// family's sheet and dyed as the builder's fabric panel does (shirtHem.ts
// `shirtSwatch`), one repeat as long as the room lays it on her (the bake's
// `knit.tileM`), laid on by the builder's own fabric shader (fabricMaterial.ts
// `setFabricLayer`), then made to blend and drawn a hair over her skin as the
// builder does (`feathered`: its fade, its cut, its 2 mm lead toward the eye).
// ============================================================================
import * as THREE from 'three';
import { TunicDrape, HEM_LIFT_FLAT, HEM_LIFT_RIBBED } from '@charb/sarahlab/tunicDrape';
import { mapBody } from '@charb/sarahlab/bodyRegions';
import { shirtHem } from '@charb/sarahlab/paintTemplates';
import { fabricFamily } from '@charb/sarahlab/fabricLibrary';
import { setFabricLayer } from '@charb/sarahlab/fabricMaterial';
import { readBindJoints } from '@charb/view/HumanRig';
import { measureHuman } from '@charb/actor/humanSkeleton';
import { MOTION_SHAPES } from './shapedBody';
import { shirtSwatch, type HemKnit } from '../shirtHem';

/** How long she must stand still before her drape is fitted again to the stance she is in (seconds). */
const STILL_BEFORE_REFIT = 0.4;
/**
 * How far a joint of her legs and hips may have moved (her model's own units per metre times this, so metres) from where
 * it was when the drape was last fitted before it is fitted again once she stands still: 1 cm.
 */
const REFIT_MOVED = 0.01;
/** The joints whose places tell her stance, for `REFIT_MOVED`. */
const STANCE_JOINTS = ['pelvis', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;

export interface LiveDrapeOptions {
  /** Her visible skin: its parent, its place, its skeleton and bind are the stand-in's. */
  readonly skin: THREE.SkinnedMesh;
  /** Her body file's scene (her bind joints are read from it). */
  readonly fileScene: THREE.Object3D;
  /** Her body file's rest points and directions (x, y, z each), as the file has them: her map and the fabric's pattern. */
  readonly rest: Float32Array;
  readonly restNormal: Float32Array;
  /** Which bones move each point and how much (the builder's own, from the bake). */
  readonly skinIndex: Uint16Array;
  readonly skinWeight: Float32Array;
  /** Her points as she is shaped NOW (`ShapedBody.points`: read again on `reshape`). */
  readonly points: () => Float32Array;
  /** Her four motion shapes' moves for every point, in MOTION_SHAPES' order (`ShapedBody.motionMoves`). */
  readonly motion: readonly Float32Array[];
  /** How much of the shirt's paint covers each of her points, 0-255 (the bake's drape.bin). */
  readonly cover: Uint8Array;
  /** The shirt template's length (its hem, as the builder's `shirtHem` reads it). */
  readonly length: number;
  /** The shirt's knit (the bake's `drape.knit`). */
  readonly knit: HemKnit;
  /** Each time it is fitted: how far each of her points is under it (`TunicDrape.hang`; cut where over a half). */
  readonly onHang: (hang: Float32Array) => void;
}

export interface LiveDrape {
  /** The drape itself (drawn), for counting. */
  readonly mesh: THREE.SkinnedMesh;
  /** How many times it has been fitted on her, and how long the last fitting took (milliseconds): for the readout. */
  readonly fits: number;
  readonly lastFitMs: number;
  /** Her shape has changed (her belly): fit it again (at its next update, at most every 200 ms, as the builder). */
  reshape(): void;
  /**
   * Once a frame, after her pose is finished: her belly's motion carried over to it, and, when she has stood still a
   * moment in a stance other than the one it was fitted to (`moving` false), fitted again.
   */
  update(dt: number, moving: boolean): void;
  dispose(): void;
}

/** A copy of an array of numbers as a three.js attribute's array would hold them. */
const asFloats = (from: ArrayLike<number>): Float32Array => Float32Array.from(from);

/**
 * Make her live drape: her map, the stand-in, the builder's drape on it, its fabric. Null if the shirt's swatch could not
 * be had, or her numbers do not agree (then she has no drape, and her shirt's paint is not cut).
 */
export async function makeLiveDrape(o: LiveDrapeOptions): Promise<LiveDrape | null> {
  const skin = o.skin, count = o.rest.length / 3;
  if (o.points().length !== count * 3 || o.cover.length !== count || o.skinIndex.length !== count * 4) {
    console.warn('[drape] her points, the shirt\'s cover and her bones do not agree: no live drape');
    return null;
  }

  // ---- her map, the builder's way (SarahLabScene.ts `regions`): her bones and weights, her rest points in bind space
  const bind = readBindJoints(o.fileScene), named = measureHuman(bind).joints;
  const restBind = new Float32Array(count * 3), normalBind = new Float32Array(count * 3);
  {
    const at = new THREE.Vector3(), turn = new THREE.Matrix3().getNormalMatrix(skin.bindMatrix);
    for (let v = 0; v < count; v++) {
      at.fromArray(o.rest, v * 3).applyMatrix4(skin.bindMatrix).toArray(restBind, v * 3);
      at.fromArray(o.restNormal, v * 3).applyMatrix3(turn).toArray(normalBind, v * 3);
    }
  }
  const jointAt = Object.fromEntries(Object.entries(named).map(([k, j]) => [k, [bind[j].x, bind[j].y, bind[j].z]])) as unknown as Parameters<typeof mapBody>[0]['jointAt'];
  const map = mapBody({
    skinIndex: Float32Array.from(o.skinIndex), skinWeight: o.skinWeight, parents: bind.map((j) => j.parent), joints: named,
    restNormal: normalBind, restPosition: restBind, jointAt,
  });

  // ---- the stand-in: all of her points as she is shaped now, on her own skeleton, never drawn itself
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(asFloats(o.points()), 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', new THREE.BufferAttribute(asFloats(o.restNormal), 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(o.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(o.skinWeight, 4));
  // (her rest place and direction, for the fabric's pattern: the builder's skin carries them as these)
  geometry.setAttribute('fabricRest', new THREE.BufferAttribute(o.rest, 3));
  geometry.setAttribute('fabricRestNormal', new THREE.BufferAttribute(o.restNormal, 3));
  geometry.morphAttributes.position = o.motion.map((moves, m) => {
    const attribute = new THREE.BufferAttribute(moves, 3);
    attribute.name = MOTION_SHAPES[m];
    return attribute;
  });
  geometry.morphTargetsRelative = true;
  // (no triangles of its own are ever drawn: one, so three.js has an index to keep)
  geometry.setIndex([0, 0, 0]);
  const standIn = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  standIn.name = 'heroine-drape-stand-in';
  standIn.morphTargetDictionary = Object.fromEntries(MOTION_SHAPES.map((name, i) => [name, i]));
  standIn.morphTargetInfluences = MOTION_SHAPES.map(() => 0);
  standIn.frustumCulled = false;
  standIn.castShadow = false;
  // where her skin is, on her skeleton
  standIn.position.copy(skin.position); standIn.quaternion.copy(skin.quaternion); standIn.scale.copy(skin.scale);
  skin.parent?.add(standIn);
  standIn.bindMode = skin.bindMode;
  standIn.bind(skin.skeleton, skin.bindMatrix);

  // ---- the builder's drape on her, in the shirt's fabric (fabricPanel.ts `dressDrape`, line for line)
  const texture = await shirtSwatch(o.knit);
  if (!texture) {
    console.warn('[drape] the shirt\'s swatch could not be had: no live drape');
    standIn.removeFromParent(); geometry.dispose();
    return null;
  }
  const family = fabricFamily(o.knit.family);
  const drape = new TunicDrape(standIn, map, shirtHem(map, 1));
  drape.wear(shirtHem(map, o.length), family.id === 'sweater' ? HEM_LIFT_RIBBED : HEM_LIFT_FLAT, (v) => o.cover[v] / 255, true, family.stretch);
  // (her units per metre: her skeleton's bind scale, as the builder's rig reads it, HumanRig.ts `bindScale`)
  const scale = new THREE.Vector3();
  new THREE.Matrix4().copy(skin.skeleton.boneInverses[0]).invert().decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const unitsPerMetre = scale.x;
  const material = drape.mesh.material as THREE.MeshStandardMaterial;
  setFabricLayer(drape.mesh, material, 0, { texture, tile: o.knit.tileM * unitsPerMetre, opacity: o.knit.opacity, roughness: o.knit.roughness }, { layers: 1, masked: false, rest: null });
  drape.feathered();
  drape.mesh.castShadow = false;

  // ---- her stance, as the drape was last fitted to it
  const stanceBones = STANCE_JOINTS.map((name) => skin.skeleton.bones[named[name]]).filter((b): b is THREE.Bone => !!b);
  const fittedAt = new Float32Array(stanceBones.length * 3), nowAt = new Float32Array(stanceBones.length * 3);
  const stance = (out: Float32Array): void => {
    const at = new THREE.Vector3(), inverse = new THREE.Matrix4().copy(standIn.matrixWorld).invert();
    stanceBones.forEach((bone, i) => bone.getWorldPosition(at).applyMatrix4(inverse).toArray(out, i * 3));
  };
  let stillFor = 0, refitWanted = true, fits = 0, lastFitMs = 0;

  return {
    mesh: drape.mesh,
    get fits(): number { return fits; },
    get lastFitMs(): number { return lastFitMs; },
    reshape(): void {
      position.array.set(o.points());
      position.needsUpdate = true;
      refitWanted = true;
      drape.reshape();
    },
    update(dt: number, moving: boolean): void {
      // her belly's motion shapes, as her skin has them now (by name: a live level of her skin carries more shapes)
      const from = skin.morphTargetInfluences, names = skin.morphTargetDictionary, to = standIn.morphTargetInfluences!;
      if (from && names) MOTION_SHAPES.forEach((name, i) => { const at = names[name]; to[i] = at === undefined ? 0 : from[at] ?? 0; });
      // standing still in a stance other than the one it was fitted to: fitted again
      stillFor = moving ? 0 : stillFor + dt;
      if (!refitWanted && stillFor >= STILL_BEFORE_REFIT) {
        stance(nowAt);
        let most = 0;
        for (let k = 0; k < nowAt.length; k += 3) most = Math.max(most, Math.hypot(nowAt[k] - fittedAt[k], nowAt[k + 1] - fittedAt[k + 1], nowAt[k + 2] - fittedAt[k + 2]));
        if (most > REFIT_MOVED * unitsPerMetre) { refitWanted = true; drape.reshape(); }
      }
      // (`update` builds at most every 200 ms; each build moves its `hangVersion` on: once it has built, the stance it
      //  was fitted to is hers now, and her skin's shirt paint is cut by its numbers)
      const built = drape.hangVersion, began = performance.now();
      drape.update();
      if (drape.hangVersion !== built) {
        stance(fittedAt); refitWanted = false; fits++;
        lastFitMs = performance.now() - began;
        o.onHang(drape.hang);
        if (fits <= 3) console.info(`[drape] fitted on her in ${lastFitMs.toFixed(1)} ms`);
      }
    },
    dispose(): void {
      drape.dispose();
      texture.dispose();
      material.dispose();
      standIn.removeFromParent();
      (standIn.material as THREE.Material).dispose();
      geometry.dispose();
    },
  };
}
