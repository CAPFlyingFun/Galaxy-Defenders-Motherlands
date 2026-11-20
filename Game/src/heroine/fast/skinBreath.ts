// ============================================================================
// skinBreath.ts -- the fast heroine's SKIN BREATHES, and her belly stands out
// a little when her stomach is full.
//
// Joshua, 2026-11-17: "is the vitals linked up to her body yet so like a faster
// heart rate, you will see it looking down at the belly and chest?" and, of
// food and water, "it actually makes her stomach bigger which makes her belly
// a little bigger".
//
// THE BUILDER ALREADY DOES THIS, and this file uses its code as it is
// (Char_B/src/sarahlab/breathSkin.ts, through @charb; nothing copied):
//   - her CHEST moves forward, up and out at the sides as she breathes in, and
//     her BELLY moves forward, by exactly the AIR the breath takes: the room
//     her skin sweeps moving out is her chest's or her belly's share of it
//   - her FULL BELLY: what her stomach holds beyond the room she has for it
//     (450 mL) stands her belly out low and round, by exactly that much room
// The builder lays these moves over her skin in its vertex shader
// (`BREATH_GLSL`), by where each point is in her REST FRAME (metres; +y up,
// +z her front, +x her left; her soles on the floor). It needs nothing stored
// on her points, only a small table of how wide her trunk is at each height.
//
// What this file adds is the fitting to the fast body:
//   - the table and the moves' sizes worked out from the fast body's own
//     points (`lay`, again whenever her belly changes size)
//   - the same shader lines added to whichever material she wears (`patch`)
//   - each frame, the moves' sizes from her vitals (`set`): how much air is in
//     her now, and what is in her stomach
//
// How FAST and how DEEP she breathes is not decided here: it comes from the
// game's vitals (src/vitals/heroineVitals.ts), which run the builder's own
// model of her breath and heart.
// ============================================================================
import * as THREE from 'three';
import { BREATH_GLSL, breathVolumes, createBreathUniforms, layBreathTable, type BreathUniforms } from '@charb/sarahlab/breathSkin';
import { breathFlare, chestShare } from '@charb/actor/vitals';
import { stomachGiveMl } from '@charb/actor/abdominalOrgans';
import { KICKS } from '@charb/sarahlab/softBody';
import v2Pelvis from '@charb/data/pelvis/v2.json';
import v2Thorax from '@charb/data/thorax/v2.json';

/** The body file's two upper-arm bones: everything on them or under them is her arm, and does not breathe. */
const ARM_BONES: readonly string[] = ['Bone_021', 'Bone_026'];
/** Standing, gravity pulls straight down her rest frame (the builder shares a breath between chest and belly by how she lies). */
const STANDING_DOWN = { x: 0, y: -1, z: 0 };

/** What her skin needs from her vitals each frame. */
export interface BreathNow {
  /** her breath this instant: 0 all out .. 1 all in */
  readonly breath: number;
  /** how much air a whole breath takes now, litres */
  readonly breathLitres: number;
  /** what is in her stomach, millilitres (food and water together) */
  readonly stomachMl: number;
  /** how far her belly draws in with her stomach nearly empty, millilitres of room (heroineVitals.ts foodBar) */
  readonly bellyShrinkMl?: number;
}

export class SkinBreath {
  /** The builder's own uniforms: the moves now, her landmarks, her trunk's width at each height. */
  readonly uniforms: BreathUniforms = createBreathUniforms();
  /** Her mesh's units to her rest frame (metres), and directions back again. */
  private readonly toRest = { value: new THREE.Matrix4() };
  private readonly toUnits = { value: new THREE.Matrix3() };
  /**
   * HER BABY'S KICKS (liveBody.ts): up to three at once. Each: where on her skin (x, y, z in her rest frame) and how
   * far out (w, metres; 0 = no kick), and its way out (x, y, z) and how wide it is (w, metres). The builder's own
   * numbers, shown the builder's own way: a smooth bump round the point.
   */
  private readonly kickAt = { value: Array.from({ length: KICKS }, () => new THREE.Vector4()) };
  private readonly kickDir = { value: Array.from({ length: KICKS }, () => new THREE.Vector4(0, 0, 1, 0.03)) };
  /** How much room each move sweeps at 1 metre (square metres): her chest's, her belly's, her full belly's. */
  private swept = { chest: 0, belly: 0, full: 0 };
  /** Each point's share on her arms' bones (found once). */
  private armShare: Float32Array | null = null;
  private rest = new Float32Array(0);

  /**
   * @param meshToRest  her skin's own units to her rest frame: metres, her soles on the floor, facing +z
   * @param weeks       how many weeks pregnant she is (her lower ribs flare wider late in pregnancy)
   */
  constructor(meshToRest: THREE.Matrix4, weeks: number) {
    this.toRest.value.copy(meshToRest);
    this.toUnits.value.setFromMatrix4(meshToRest).invert();
    this.uniforms.breath.value.z = breathFlare(weeks);
  }

  /**
   * Measure her trunk for the moves: call once she is shaped, and again when her belly changes size.
   * `position` her skin's points as shaped (x, y, z each, her mesh's units), `index` her full triangle list,
   * `skin` for which bones hold each point.
   */
  lay(position: Float32Array, index: ArrayLike<number>, skin: THREE.SkinnedMesh, skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>): void {
    const count = position.length / 3;
    if (!this.armShare) {
      // which bones are her arms: the two upper arms and every bone under them
      const bones = skin.skeleton.bones, isArm = new Uint8Array(bones.length);
      bones.forEach((bone, k) => { for (let b: THREE.Object3D | null = bone; b; b = b.parent) if (ARM_BONES.includes(b.name)) { isArm[k] = 1; break; } });
      this.armShare = new Float32Array(count);
      for (let v = 0; v < count; v++) {
        let share = 0;
        for (let c = 0; c < 4; c++) if (isArm[skinIndex[v * 4 + c]]) share += skinWeight[v * 4 + c];
        this.armShare[v] = share;
      }
    }
    // her points in her rest frame
    if (this.rest.length !== position.length) this.rest = new Float32Array(position.length);
    const point = new THREE.Vector3(), rest = this.rest, m = this.toRest.value;
    for (let i = 0; i < position.length; i += 3) point.set(position[i], position[i + 1], position[i + 2]).applyMatrix4(m).toArray(rest, i);
    // the builder's own measuring: her trunk's width table (with its landmarks, from its own measured data), then
    // how much room each move sweeps
    layBreathTable(this.uniforms, rest, this.armShare, {
      pubisTop: v2Pelvis.landmarks.symphysisTop[1],
      xiphoid: v2Thorax.xiphoid[1],
      sternumTop: v2Thorax.sternumTop[1],
      midX: v2Pelvis.landmarks.symphysisTop[0],
      ribsLowest: v2Thorax.sections[0].y,
    });
    this.swept = breathVolumes(this.uniforms, rest, index);
  }

  /**
   * Add the breathing to a material's shader (after anything the material already adds). The move is made on her
   * points as shaped, before her bones pose them: the builder's own line.
   */
  patch(material: THREE.Material): void {
    const before = material.onBeforeCompile, key = material.customProgramCacheKey;
    const u = this.uniforms, toRest = this.toRest, toUnits = this.toUnits, kickAt = this.kickAt, kickDir = this.kickDir;
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      shader.uniforms.uBreath = u.breath;
      shader.uniforms.uBreathFull = u.breathFull;
      shader.uniforms.uBreathMarks = u.breathMarks;
      shader.uniforms.uBreathSlices = u.breathSlices;
      shader.uniforms.uBreathRest = toRest;
      shader.uniforms.uBreathUnits = toUnits;
      shader.uniforms.uKickAt = kickAt;
      shader.uniforms.uKickDir = kickDir;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform mat4 uBreathRest;\nuniform mat3 uBreathUnits;\nuniform vec4 uKickAt[${KICKS}];\nuniform vec4 uKickDir[${KICKS}];\n${BREATH_GLSL}`)
        // (after her body shapes are added, before her bones move her)
        .replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
{
  vec3 restPoint = (uBreathRest * vec4(transformed, 1.0)).xyz;
  vec3 restMove = breathMove(restPoint);
  // her baby's kicks: a smooth bump round each point (the builder's own sum, softBody.ts)
  for (int k = 0; k < ${KICKS}; k++) {
    if (uKickAt[k].w <= 0.0) continue;
    vec3 kd = restPoint - uKickAt[k].xyz;
    restMove += uKickDir[k].xyz * (uKickAt[k].w * exp(-dot(kd, kd) / (uKickDir[k].w * uKickDir[k].w)));
  }
  transformed += uBreathUnits * restMove;
}`);
    };
    material.customProgramCacheKey = function () { return `${key.call(this)}|breath`; };
    material.needsUpdate = true;
  }

  /** Each frame: the size of each move from her vitals (the builder's own sums, SarahLabScene `stepBreath`). */
  set(now: BreathNow): void {
    const B = this.uniforms.breath.value, s = this.swept;
    if (s.chest > 0 && s.belly > 0) {
      // the air in her now, in cubic metres, shared between her chest and her belly as a standing woman's is
      const air = (now.breathLitres * now.breath) / 1000;
      const share = chestShare(STANDING_DOWN, false);
      B.x = (share * air) / s.chest;
      B.y = ((1 - share) * air) / s.belly;
    } else { B.x = 0; B.y = 0; }
    // what her stomach holds beyond its room, as room her belly's skin gives for; less what it has drawn in, nearly empty
    // (the same move the other way: her belly low and round drawing in)
    const roomMl = stomachGiveMl(now.stomachMl) - (now.bellyShrinkMl ?? 0);
    this.uniforms.breathFull.value = s.full > 0 ? (roomMl * 1e-6) / s.full : 0;
  }

  /** This frame's kicks, from the hidden live body (liveBody.ts). */
  setKicks(at: readonly THREE.Vector4[], dir: readonly THREE.Vector4[]): void {
    for (let k = 0; k < KICKS; k++) { if (at[k]) this.kickAt.value[k].copy(at[k]); if (dir[k]) this.kickDir.value[k].copy(dir[k]); }
  }

  /** How far her belly stands out now for her stomach, where it stands out most, millimetres (for a readout). */
  get fullMillimetres(): number { return this.uniforms.breathFull.value * 1000; }
  /** Her chest's and her belly's move now where each moves most, millimetres (for a readout). */
  get moveMillimetres(): { chest: number; belly: number } {
    return { chest: this.uniforms.breath.value.x * 1000, belly: this.uniforms.breath.value.y * 1000 };
  }
}
