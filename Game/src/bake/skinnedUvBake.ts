// ============================================================================
// skinnedUvBake.ts -- her skin's finished look, read back as PICTURES in her
// own texture layout.
//
// PORTED FROM the Character Builder's story bake (Char_B/src/sarahlab/
// storyBake.ts, `bakeUV` and its helpers `captureMaterial`, `sharedGeometry`,
// `drawAndRead`, `atEndOfMain`, the UV_TAIL lines and the mirrored-island
// fix). The idea and nearly every line are the builder's:
//
//   * make a throw-away copy of her skin's REAL material (all the builder's
//     shader patches included: its paint, fabrics, face, softening);
//   * draw her triangles with it, but at the end of the vertex shader send
//     every corner to its place in a TEXTURE LAYOUT instead of to the screen
//     (the baked pictures' own layout, with gaps between islands: repackUv.ts);
//   * so each texel of the picture is shaded by the builder's own code for the
//     point of her it belongs to, and the last line keeps the answer (her
//     colour, or her roughness and metalness, or the surface direction she is lit with).
//
// THE ONE CHANGE, and why this is a port and not a call. The builder's version
// draws the flattened triangles as a plain mesh, WITHOUT her skeleton. Its
// newer low-rise leggings (the 'leggingsUnder' template Blaze wears) decide
// where the garment is from her points AFTER her bones have moved them, so
// without the skeleton they were simply not there: the first bake had her bra,
// waistband and pink plates but bare legs (2026-11-17). Here the flattened
// triangles are drawn as a SKINNED mesh on her own skeleton, so every number
// the builder's shader reads is exactly what it reads when she is on screen.
//
// If the builder's `bakeUV` learns to do this itself, this file can go and
// bakeLook.ts can call the builder's.
// ============================================================================
import * as THREE from 'three';
import { dilate } from '@charb/sarahlab/storyBake';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** What to keep from her fragment shader: her colour; her roughness and metalness; or the direction she is lit with. */
export type UvChannel = 'albedo' | 'surface' | 'normal';

export interface UvPicture {
  readonly size: number;
  /** RGBA bytes, the first row being the top of her texture (v = 0), with the gaps between islands filled in. */
  readonly rgba: Uint8Array;
  /** How many texels a triangle really covered (before the gaps were filled). */
  readonly coveredCount: number;
}

// The last line of the fragment shader, for each channel (the builder's own lines).
const UV_TAIL: Record<UvChannel, string> = {
  // her colour, stored the way a colour picture is (sRGB)
  albedo: 'gl_FragColor = vec4(sRGBTransferOETF(vec4(clamp(diffuseColor.rgb, 0.0, 1.0), 1.0)).rgb, 1.0);',
  // the layout three.js reads a roughness/metalness picture in: green = roughness, blue = metalness
  surface: 'gl_FragColor = vec4(1.0, clamp(roughnessFactor, 0.0, 1.0), clamp(metalnessFactor, 0.0, 1.0), 1.0);',
  // the direction she is finally lit with, written as an ordinary "normal map"
  normal: `{
    vec3 bakeM = inverse(tbn) * normal;
    bakeM.xy /= mix(vec2(1.0), normalScale, step(vec2(1e-4), abs(normalScale)));
    bakeM = any(isnan(bakeM)) || any(isinf(bakeM)) || dot(bakeM, bakeM) < 1e-12 ? vec3(0.0, 0.0, 1.0) : normalize(bakeM);
    gl_FragColor = vec4(bakeM * 0.5 + 0.5, 1.0);
  }`,
};
// (three.js builds the frame a normal map is read in from how her position and texture place change across the
// screen. Drawn flat in her texture layout, an island whose texture runs mirrored comes out with that frame turned
// round; this puts it back, so the baked normal map reads correctly when she is drawn normally.)
const ORIENTED_FRAME = 'return mat3( T * scale, B * scale, N );';
const ORIENTED_FRAME_FIX = 'float bakeO = dot( cross( q0, q1 ), N ) < 0.0 ? - 1.0 : 1.0;\n\t\treturn mat3( T * scale * bakeO, B * scale * bakeO, N );';

/** Code put just before the closing brace of a shader's `main`. */
export function atEndOfMain(source: string, code: string): string {
  const end = source.lastIndexOf('}');
  if (end < 0) throw new Error('bake: the shader has no main() to add to');
  return `${source.slice(0, end)}\n${code}\n${source.slice(end)}`;
}

/** A copy of `original` that runs the builder's own patches and then `edit`s the result. */
export function bakeMaterial(original: THREE.Material, tag: string, edit: (shader: Shader) => void): THREE.Material {
  // (`clone` copies `userData` through JSON, and hers holds pictures: it is set aside while the copy is made)
  const own = original.userData;
  original.userData = {};
  let clone: THREE.Material;
  try { clone = original.clone(); } finally { original.userData = own; }
  clone.onBeforeCompile = (shader, renderer) => {
    // the builder's patches run on the ORIGINAL, so the copy draws with the very uniforms the room set this frame
    original.onBeforeCompile.call(original, shader, renderer);
    edit(shader);
  };
  clone.customProgramCacheKey = () => `${original.customProgramCacheKey()}|gdm-skinned-bake-${tag}-v1`;
  clone.alphaTest = 0;
  clone.transparent = false;
  clone.depthTest = false;
  clone.depthWrite = false;
  clone.blending = THREE.NoBlending;
  clone.colorWrite = true;
  clone.clippingPlanes = null;
  clone.premultipliedAlpha = false;
  // every texel is baked as the FRONT of her skin, whichever way its triangle runs in the texture layout
  clone.side = THREE.DoubleSide;
  clone.needsUpdate = true;
  return clone;
}

/**
 * Bake one channel of her skin into a square picture `size` pixels a side.
 * `skin` is her real skinned mesh in the builder's room, posed as she stands; nothing of it is changed.
 */
export function bakeSkinnedUV(renderer: THREE.WebGLRenderer, skin: THREE.SkinnedMesh, size: number, camera: THREE.Camera, channel: UvChannel, fileTriangles: ArrayLike<number>, layout: Float32Array): UvPicture {
  const original = Array.isArray(skin.material) ? skin.material[0] : skin.material;
  const source = skin.geometry;
  // WHERE each corner goes in the picture: the baked pictures' own layout (repackUv.ts: the file's islands, moved apart).
  // Her material goes on reading its own pictures with the file's layout (`uv`), untouched.
  const uv = new THREE.BufferAttribute(layout, 2);

  // WHICH TRIANGLES: the body FILE's own list, not the room's. The room draws a changed list (her fingers and the
  // skin between her legs are separate pieces there, cut out of her skin), but the fast heroine draws the file's
  // triangles, so every one of THOSE must get its colour. They are the same points, and the builder's paint is a
  // number on each point, so the file's triangles are painted exactly as the room would paint them.
  const triangles = Uint32Array.from(fileTriangles);
  // A triangle whose texture corners run clockwise would be drawn as a BACK face (and lit from behind): turn it round.
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const area = (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) - (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a));
    if (area < 0) { triangles[t + 1] = c; triangles[t + 2] = b; }
  }

  // A geometry that SHARES her attributes and shapes (nothing copied), with the turned triangle list.
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.morphAttributes = { ...source.morphAttributes };
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.setAttribute('bakeUv', uv);
  geometry.setIndex(new THREE.BufferAttribute(triangles, 1));

  const material = bakeMaterial(original, `uv-${channel}`, (shader) => {
    // the corner goes to its place in the texture layout (0..1 across the picture), not to the screen
    shader.vertexShader = atEndOfMain(`attribute vec2 bakeUv;\n${shader.vertexShader}`, 'gl_Position = vec4(bakeUv * 2.0 - 1.0, 0.0, 1.0);');
    const frame = THREE.ShaderChunk.normalmap_pars_fragment;
    if (!frame.includes(ORIENTED_FRAME)) throw new Error('bake: three.js builds its normal-map frame differently from the version this was written against');
    shader.fragmentShader = atEndOfMain(shader.fragmentShader.replace('#include <normalmap_pars_fragment>', () => frame.replace(ORIENTED_FRAME, ORIENTED_FRAME_FIX)), UV_TAIL[channel]);
  });

  // THE CHANGE FROM THE BUILDER'S VERSION: a skinned stand-in on her own skeleton, standing exactly where she does.
  const flat = new THREE.SkinnedMesh(geometry, material);
  flat.bind(skin.skeleton, skin.bindMatrix);
  flat.bindMode = skin.bindMode;
  flat.matrixAutoUpdate = false;
  flat.matrixWorldAutoUpdate = false;
  flat.matrix.copy(skin.matrixWorld);
  flat.matrixWorld.copy(skin.matrixWorld);
  flat.frustumCulled = false;
  if (skin.morphTargetInfluences) flat.morphTargetInfluences = skin.morphTargetInfluences.slice();
  if (skin.morphTargetDictionary) flat.morphTargetDictionary = { ...skin.morphTargetDictionary };

  const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  const scene = new THREE.Scene();
  scene.add(flat);
  const was = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear };
  const raw = new Uint8Array(size * size * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, raw);
  } finally {
    renderer.setRenderTarget(was.target);
    renderer.setClearColor(was.colour, was.alpha);
    renderer.autoClear = was.autoClear;
    scene.remove(flat);
    target.dispose();
    material.dispose();
    // (the stand-in's geometry is emptied of HER attributes first, so freeing it frees only its own triangle list)
    geometry.attributes = {};
    geometry.morphAttributes = {};
    geometry.dispose();
  }
  let coveredCount = 0;
  for (let i = 3; i < raw.length; i += 4) if (raw[i] > 0) coveredCount++;
  // Run the islands out over the gaps between them (the builder's own `dilate`), all the way: a far-away, blurred
  // read of the picture then never mixes in the empty black between islands.
  return { size, rgba: dilate(raw, size, size, size), coveredCount };
}
