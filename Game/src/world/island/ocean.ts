// ============================================================================
// ocean.ts -- the sea round the island: a gentle rolling swell, ripples, sky
// glints, turquoise over the reef deepening to blue offshore, and surf at the
// beach. Brought over from Beyond Extinction (KauaiStreamScene.ts,
// makeOceanMaterial and buildOceanGrid, main at 70f3f97), tuned there in
// playtests on phones.
//
// THE MESH is a round grid centred on the camera (moved with it every frame):
// rings close together near the viewer, where the waves show, growing further
// apart out to 18 km, where the sea is just a flat sheet. Cheap on a phone.
//
// THE SHORELINE comes from a baked picture of the ground's height near sea
// level (public/island/kauai/coast_mask.png): where the ground is above the
// water the sea is left out, and its depth there colours it.
// ============================================================================
import * as THREE from 'three';

/** The sea's surface, metres (just under the 0 m line, which keeps the shoreline soft). */
export const WATER_Y = -0.4;

/** The swell: [direction x, direction z (one unit long), wavelength m, height m, speed rad/s]. Calm coast. */
const WAVES: readonly [number, number, number, number, number][] = [
  [1.0, 0.0, 118, 0.12, 0.82],
  [0.6, 0.8, 67, 0.07, 0.98],
  [-0.7593, 0.6508, 39, 0.04, 1.2],
];

/** The swell's height at a place and time, in the shader (written out from WAVES, so both always agree). */
function wavesGlsl(): string {
  let height = '', slope = '';
  for (const [dx, dz, length, amp, w] of WAVES) {
    const k = (2 * Math.PI) / length;
    const phase = `${k.toFixed(8)}*(${dx.toFixed(4)}*p.x+${dz.toFixed(4)}*p.y)-${w.toFixed(4)}*t`;
    height += `h+=${amp.toFixed(4)}*sin(${phase});`;
    slope += `g+=${(amp * k).toFixed(8)}*cos(${phase})*vec2(${dx.toFixed(4)},${dz.toFixed(4)});`;
  }
  return `float oceanH(vec2 p, float t){ float h=0.0; ${height} return h; }\nvec2 oceanGrad(vec2 p, float t){ vec2 g=vec2(0.0); ${slope} return g; }`;
}

/** The round grid: `rings` rings of `sectors` points, from r0 to rMax metres, each ring further out by the same ratio. */
function oceanGrid(rings: number, sectors: number, r0: number, rMax: number): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const ratio = Math.pow(rMax / r0, 1 / (rings - 1));
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(ratio, i);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < sectors; j++) index.push(0, 1 + ((j + 1) % sectors), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    const here = 1 + i * sectors, next = 1 + (i + 1) * sectors;
    for (let j = 0; j < sectors; j++) {
      const a = here + j, b = here + ((j + 1) % sectors), c = next + j, d = next + ((j + 1) % sectors);
      index.push(a, d, c, a, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export interface Ocean {
  readonly mesh: THREE.Mesh;
  /** Its two pictures are in (the coast mask, then the ripples: one after the other, v0.2.151); never fails. */
  readonly ready: Promise<void>;
  /** Every frame: the sea follows the camera, and its waves move on. */
  update(seconds: number, camera: THREE.Camera): void;
  /**
   * THE SKY COLOUR IT REFLECTS (v0.2.166, the procedural sky's time of day): as a paint program's colour, read as the
   * sea's own fixed one always was (0x9fc6df by day), so the daytime sea looks as before and the night sea goes dark.
   */
  setSky(colour: THREE.Color): void;
  /**
   * THE SHARP SHORELINE ROUND WAILUA (v0.2.183): where the 1 m ground is drawn (lidarDetail.ts), the sea meets ITS
   * beaches (its own shoreline picture, 2 m a pixel) and not the island's coarse one (27 m). Off: the coarse one there.
   */
  setDetailCoast(on: boolean): void;
  dispose(): void;
}

/**
 * @param base       where the island's files are (the game's address + "island/")
 * @param islandSize the island picture's width, metres (56 km)
 * @param origin     the arrival point in the island's own metres (the game's (0, 0))
 */
export function createOcean(base: string, islandSize: number, origin: THREE.Vector2,
                            detail: { file: string; x0: number; z0: number; size: number } | null = null): Ocean {
  const material = new THREE.MeshStandardMaterial({
    color: 0x1a6389,
    roughness: 0.18,
    metalness: 0.1,      // (low: a mirror would show the dark water under it, looking down into the deep)
    transparent: true,
    opacity: 0.58,       // clear in the shallows; made deeper with depth below
    side: THREE.DoubleSide,
    // the sea is pushed back a little in the depth test, so the flat wet sand at the waterline always wins over it
    // (no shimmer between sand and sea; the push grows with distance, where it matters most)
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 12,
  });
  const sky = new THREE.Color(0x9fc6df).convertSRGBToLinear();
  // the coast picture (a 1 x 1 "all deep sea" stand-in until it arrives) and the ripple picture (flat until then)
  const deep = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  deep.needsUpdate = true;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flat.needsUpdate = true;
  const uCoast = { value: deep as THREE.Texture };
  const uRipple = { value: flat as THREE.Texture };
  // (the 1 m ground's shoreline round Wailua, v0.2.183: its square in the island's metres (west, north, side) and on 0/1)
  const uCoastD = { value: deep as THREE.Texture };
  const uDetail = { value: new THREE.Vector4(detail?.x0 ?? 0, detail?.z0 ?? 0, detail?.size ?? 1, 0) };
  const uTime = { value: 0 };
  const uOrigin = { value: origin };
  const loader = new THREE.TextureLoader();
  // (ONE AFTER THE OTHER, and waited for by the island's own loading step, v0.2.151: nothing of the island is still
  //  loading behind the characters' heavy steps)
  const ready = loader.loadAsync(`${base}kauai/coast_mask.png`).then((picture) => {
    picture.colorSpace = THREE.NoColorSpace; // (heights, not colours)
    // ONE CHANNEL ON THE GRAPHICS CHIP (v0.2.147): the shader reads only its red (`.r` below), so only red is sent:
    // 2048 x 2048 as R8 is 5.3 MB with its smaller copies, as RGBA it was 21.3 MB. The values are the same bytes.
    picture.format = THREE.RedFormat;
    picture.wrapS = picture.wrapT = THREE.ClampToEdgeWrapping;
    picture.flipY = false; // (its first row is the north edge, as the shader reads it)
    picture.needsUpdate = true;
    uCoast.value = picture;
  }).catch(() => { /* the sea stays everywhere: the island still shows, only the shoreline is plainer */ })
    .then(() => loader.loadAsync(`${base}textures/water_normal.png`)).then((picture) => {
      picture.colorSpace = THREE.NoColorSpace;
      picture.wrapS = picture.wrapT = THREE.RepeatWrapping;
      picture.needsUpdate = true;
      uRipple.value = picture;
    }).catch(() => { /* no ripples */ })
    // (the 1 m ground's shoreline, read as the coast mask is: one channel, its first row the north edge)
    .then(() => (detail ? loader.loadAsync(`${base}kauai/${detail.file}`) : null)).then((picture) => {
      if (!picture) return;
      picture.colorSpace = THREE.NoColorSpace;
      picture.format = THREE.RedFormat;
      picture.wrapS = picture.wrapT = THREE.ClampToEdgeWrapping;
      picture.flipY = false;
      picture.needsUpdate = true;
      uCoastD.value = picture;
    }).catch(() => { /* the island's own shoreline there */ });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSky = { value: sky };
    shader.uniforms.uCoast = uCoast;
    shader.uniforms.uTime = uTime;
    shader.uniforms.uRipple = uRipple;
    shader.uniforms.uOrigin = uOrigin;
    shader.uniforms.uCoastD = uCoastD;
    shader.uniforms.uDetail = uDetail;
    // THE SWELL: each point raised by the sum of the waves, with its true slope for the light; faded out far away
    // (where the rings are too far apart to show it)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vOceanWpos;\nuniform float uTime;\n${wavesGlsl()}\nfloat wH;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 wWp = (modelMatrix * vec4(position, 1.0)).xyz;
        float wFade = 1.0 - smoothstep(180.0, 1400.0, length(wWp.xz - cameraPosition.xz));
        wH = oceanH(wWp.xz, uTime) * wFade;
        vec2 wG = oceanGrad(wWp.xz, uTime) * wFade;
        objectNormal = normalize(vec3(-wG.x, 1.0, -wG.y));`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n        transformed.y += wH;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n        vOceanWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uSky;
uniform sampler2D uCoast;
uniform sampler2D uRipple;
uniform float uTime;
uniform vec2 uOrigin;
uniform sampler2D uCoastD;
uniform vec4 uDetail;
varying vec3 vOceanWpos;
mat2 rrot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }`)
      // RIPPLES: the ripple picture at four sizes, each turned a different odd angle so they never line up in a grid;
      // the fine ones fade out far away (no sparkle noise) and the finest only shows close up
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vOceanWpos.xz;
          float camD = distance(vOceanWpos, cameraPosition);
          float farFade = 1.0 - smoothstep(300.0, 2600.0, camD);
          float nearAmp = 1.0 - smoothstep(3.0, 55.0, camD);
          vec3 rn = vec3(0.0);
          rn += (texture2D(uRipple, rrot(0.0) * wp / 17.3 + uTime * vec2(0.021, 0.013)).xyz - 0.5);
          rn += (texture2D(uRipple, rrot(2.1) * wp / 8.7 - uTime * vec2(0.017, 0.024)).xyz - 0.5) * (0.8 * farFade);
          rn += (texture2D(uRipple, rrot(4.3) * wp / 3.9 + uTime * vec2(0.032, -0.019)).xyz - 0.5) * (0.65 * farFade);
          rn += (texture2D(uRipple, rrot(1.2) * wp / 1.5 + uTime * vec2(-0.045, 0.05)).xyz - 0.5) * (0.7 * nearAmp);
          normal = normalize(normal + vec3(rn.x, 0.0, rn.y) * 0.55);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // THE SHORE: the coast picture holds the ground's height near the sea (-8..+2 m) over the whole island;
          // where the ground is above the water there is no sea. Close by the line is tight; far away it opens out
          // over the whole shallow shelf (which would otherwise flicker against the sea at a distance).
          float enc = texture2D(uCoast, (vOceanWpos.xz + uOrigin) / ${islandSize.toFixed(1)} + 0.5).r;
          // (round Wailua, where the 1 m ground is drawn: its own sharp shoreline, v0.2.183)
          vec2 dUv = (vOceanWpos.xz + uOrigin - uDetail.xy) / uDetail.z;
          if (uDetail.w > 0.5 && dUv.x > 0.0 && dUv.x < 1.0 && dUv.y > 0.0 && dUv.y < 1.0) enc = texture2D(uCoastD, dUv).r;
          float ground = -8.0 + enc * 10.0;
          float camDist = distance(vOceanWpos, cameraPosition);
          float f = clamp((camDist - 350.0) / 2650.0, 0.0, 1.0);
          // (NEAR HER it is full by half a metre deep, not 1.4 m: Joshua, 2026-11-20, of the lagoon behind the beach at
          //  the river's mouth, which is this same sea at its level: "that water is too transparent it stopped me before
          //  I thought I was in the water"; she stops wading at 0.6 m. The sea level is -0.4: it shows from 5 cm deep.)
          float hiddenG = mix(-0.45, -2.8, f);
          float visibleG = mix(-0.9, -5.5, f);
          float t = clamp((ground - hiddenG) / (visibleG - hiddenG), 0.0, 1.0);
          diffuseColor.a *= t * t * (3.0 - 2.0 * t);
          if (diffuseColor.a < 0.01) discard;
          // DEPTH: teal over the reef, deep blue offshore
          float depth = clamp(-0.4 - ground, 0.0, 8.0);
          float shallow = 1.0 - smoothstep(0.3, 4.5, depth);
          diffuseColor.rgb = mix(vec3(0.008, 0.10, 0.26), vec3(0.020, 0.34, 0.42), shallow * shallow);
          // SURF at the beach, and the odd whitecap out at sea
          float surf = smoothstep(1.6, 0.15, depth);
          float surfN = texture2D(uRipple, vOceanWpos.xz / 6.0 + uTime * vec2(0.05, 0.03)).r;
          float foam = surf * smoothstep(0.60, 0.86, surfN);
          vec3 cn = texture2D(uRipple, vOceanWpos.xz / 14.0 - uTime * vec2(0.02, 0.028)).xyz * 2.0 - 1.0;
          foam = clamp(foam + smoothstep(0.55, 0.95, length(cn.xy)) * 0.45, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.95, 0.97), foam);
          // clear in the shallows, more solid with depth (never quite hiding the bottom), foam almost solid
          diffuseColor.a *= mix(1.0, 1.55, smoothstep(0.4, 5.5, depth));
          diffuseColor.a = min(diffuseColor.a, 0.82);
          diffuseColor.a = mix(diffuseColor.a, 0.95, foam);
        }`)
      // the sky's sheen on the water, strongest looking across it
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uSky * min(fres, 0.85) * 0.5;
        }`);
  };
  material.customProgramCacheKey = () => 'gdm-island-ocean';

  const mesh = new THREE.Mesh(oceanGrid(56, 96, 3, 18000), material);
  mesh.name = 'island-ocean';
  mesh.frustumCulled = false; // (it is always round the camera)
  mesh.renderOrder = -1;
  return {
    ready,
    mesh,
    // (the same double reading of the colour as the fixed one above, `new Color(...).convertSRGBToLinear()`, so the
    //  daytime sea is exactly as it was)
    setSky(colour) { sky.copy(colour).convertSRGBToLinear(); },
    setDetailCoast(on) { uDetail.value.w = on && detail ? 1 : 0; },
    update(seconds, camera) {
      uTime.value += seconds;
      mesh.position.set(camera.position.x, WATER_Y, camera.position.z);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      if (uCoastD.value !== deep) uCoastD.value.dispose();
    },
  };
}
