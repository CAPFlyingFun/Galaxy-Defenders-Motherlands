// =====================================================================================================================
// THE SKY, DRAWN STRAIGHT FROM ITS PICTURE (v0.2.147; Joshua, 2026-11-22: "Yes, go ahead", step 1 of the memory plan
// taken from TRADDOMIUM: "same look, less memory").
//
// The island's sky is Beyond Extinction's daytime picture, 2048 x 1024, wrapped all the way round her (an
// "equirectangular" picture: left to right is the compass, bottom to top is straight down to straight up).
//
// BEFORE: it was handed to `scene.background`. three.js cannot draw that kind of picture as a background directly, so
// the first time it is drawn it is turned into a CUBE: six 1024 x 1024 pictures, one per face, each with its own
// depth buffer that is never used again. Measured on the graphics chip (v0.2.146): the cube 24 MB, its six depth
// buffers 24 MB, the picture itself 10.7 MB: about 59 MB for the sky, of the 317 MB the game had there when an iPhone
// closed it.
//
// NOW: a box round the camera draws the picture itself, working out for every pixel which way it looks and reading the
// picture there: exactly what three.js did to fill the cube, done at the moment of drawing instead of once into a
// cube. The picture is the only thing on the chip (10.7 MB with its smaller copies), about 48 MB less. It looks the
// same: the cube was made from this very picture, so reading the picture directly can only be as sharp or sharper.
//
// How it is drawn, as three.js draws its own background:
//   - the box turns with the camera but never moves with it (only the camera's TURN is used), so the sky is always
//     "infinitely far": she can walk 50 km and it does not come closer;
//   - it is drawn FIRST, never tested against or written into the depth buffer, so everything else covers it;
//   - no fog, no tone mapping (its colours are already the sky's), no shadows.
// The one detail three.js's cube did not have to worry about: where the picture's left and right edges meet (looking
// toward -x), the picture coordinate jumps from 1 back to 0, and the graphics chip would think that pixel needs its
// smallest, blurriest copy (a thin line across the sky). So the step from pixel to pixel is worked out from the
// picture coordinate turned half way round as well, and the smaller of the two is used: no line.
// =====================================================================================================================
import * as THREE from 'three';

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  // (the box's corners ARE directions: the camera's turn only, never its place, so the sky is always at infinity)
  vDirection = position;
  vec4 at = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = at.xyww; // (on the far plane: nothing can be behind the sky)
}`;

const FRAGMENT = /* glsl */ `
#include <common>
uniform sampler2D map;
varying vec3 vDirection;
void main() {
  vec3 look = normalize(vDirection);
  // where on the picture this way of looking is (three.js's own equirectUv: compass round, then up)
  vec2 uv = equirectUv(look);
  // the step to the next pixel, from the coordinate as it is and turned half way round; the smaller one has no jump
  vec2 turned = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dx = dFdx(uv), dy = dFdy(uv), dxT = dFdx(turned), dyT = dFdy(turned);
  if (abs(dxT.x) < abs(dx.x)) dx.x = dxT.x;
  if (abs(dyT.x) < abs(dy.x)) dy.x = dyT.x;
  gl_FragColor = textureGrad(map, uv, dx, dy);
  #include <colorspace_fragment>
}`;

/** A sky drawn from an all-round picture. Add `mesh` to the scene; `dispose` lets go of its shape and shader. */
export interface SkyPicture {
  readonly mesh: THREE.Mesh;
  dispose(): void;
}

/**
 * Make the sky from an all-round (equirectangular) picture. The picture is set up here (its colours, its wrap round
 * the compass); the caller still owns it and disposes of it.
 */
export function createSkyPicture(picture: THREE.Texture): SkyPicture {
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.wrapS = THREE.RepeatWrapping; // (round the compass: the right edge carries on into the left)
  picture.wrapT = THREE.ClampToEdgeWrapping; // (straight up and straight down are edges)
  picture.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    name: 'SkyPicture',
    uniforms: { map: { value: picture } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide, // (seen from inside)
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false, // (as three.js draws an sRGB background: the picture's colours as they are)
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false; // (it is round the camera, always in view)
  mesh.renderOrder = -1e9; // (drawn before everything else)
  mesh.matrixAutoUpdate = false;
  return {
    mesh,
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
