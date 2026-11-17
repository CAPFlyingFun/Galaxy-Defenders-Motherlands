// ============================================================================
// sky.ts -- the night sky outside the dome: a faint nebula, a planet, stars.
//
// The nebula and planet are painted by a shader that is too heavy to run every
// frame on a phone, so it runs ONCE at start-up: the picture is photographed
// into a "cube map" (six square pictures around a point) and from then on the
// sky is just that picture, which costs almost nothing to draw.
//
// The stars are separate small dots (one draw call) so they stay sharp.
// ============================================================================
import * as THREE from 'three';
import { PALETTE } from './config';

/** Size in pixels of each of the six pictures of the baked sky. */
const CUBE_SIZE = 512;
const STAR_COUNT = 1500;
/** The stars sit on a sphere this far away (anything well outside the dome works). */
const STAR_DISTANCE = 700;

/** Where the planet hangs: ahead and a little to the right of the first view, above the rooftops. */
const PLANET_DIRECTION = new THREE.Vector3(-0.38, 0.62, 0.72).normalize();

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform vec3 uPurple;
  uniform vec3 uPink;
  uniform vec3 uTeal;
  uniform vec3 uGold;
  uniform vec3 uPlanetDirection;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  // Smooth 3D noise: random values at whole-number points, blended in between.
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // Several layers of noise on top of each other give cloudy shapes.
  float clouds(vec3 p) {
    float sum = 0.0;
    float strength = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += noise(p) * strength;
      p = p * 2.03 + 11.7;
      strength *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDirection);

    // Deep navy overhead, a little lighter toward the horizon.
    float up = clamp(dir.y, -0.2, 1.0);
    vec3 color = mix(uHorizon, uDeep, smoothstep(-0.1, 0.7, up));

    // Nebula: two cloudy bands in the game's purples, pinks and teal.
    float a = clouds(dir * 2.2 + vec3(3.1, 0.0, 1.7));
    float b = clouds(dir * 3.4 + vec3(-7.3, 4.2, 0.4));
    float band = smoothstep(0.50, 0.80, a);
    color += mix(uPurple, uPink, b) * band * 0.16;
    color += uTeal * smoothstep(0.58, 0.85, b) * (1.0 - band) * 0.06;

    // The planet: a disc lit from one side, with a soft glow around it.
    float angle = acos(clamp(dot(dir, uPlanetDirection), -1.0, 1.0));
    float radius = 0.13;
    float glow = exp(-max(angle - radius, 0.0) * 9.0);
    color += mix(uPurple, uTeal, 0.5) * glow * 0.20;
    if (angle < radius) {
      // Rebuild the point on the planet's surface we are looking at, to shade it like a ball.
      vec3 side = normalize(cross(uPlanetDirection, vec3(0.0, 1.0, 0.0)));
      vec3 upOnDisc = cross(side, uPlanetDirection);
      vec2 p = vec2(dot(dir, side), dot(dir, upOnDisc)) / sin(radius);
      float z = sqrt(max(0.0, 1.0 - dot(p, p)));
      vec3 normal = vec3(p, z);
      float light = clamp(dot(normal, normalize(vec3(-0.75, 0.45, 0.35))), 0.0, 1.0);
      float bands = noise(vec3(p.y * 9.0 + noise(vec3(p * 3.0, 1.0)) * 1.5, 2.0, 5.0));
      vec3 surface = mix(uPurple * 0.55, uGold * 0.8, bands);
      vec3 planet = surface * (0.03 + light * 0.75);
      float edge = smoothstep(radius, radius - 0.004, angle);
      color = mix(color, planet, edge);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    // A round dot that is brightest in the middle.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vColor * glow * glow, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface Sky {
  /** Give this to scene.background. */
  readonly background: THREE.CubeTexture;
  /** Add this to the scene. */
  readonly stars: THREE.Points;
  /** Call when the canvas changes pixel density, so stars keep their size. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** Photograph the nebula-and-planet shader into a cube map. */
function bakeBackground(renderer: THREE.WebGLRenderer): THREE.WebGLCubeRenderTarget {
  const target = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { generateMipmaps: false });
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(5, 48, 24);
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    uniforms: {
      uDeep: { value: new THREE.Color(PALETTE.navyDeep) },
      uHorizon: { value: new THREE.Color(PALETTE.navy) },
      uPurple: { value: new THREE.Color(PALETTE.purple) },
      uPink: { value: new THREE.Color(PALETTE.pink) },
      uTeal: { value: new THREE.Color(PALETTE.teal) },
      uGold: { value: new THREE.Color(PALETTE.gold) },
      uPlanetDirection: { value: PLANET_DIRECTION },
    },
  });
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.CubeCamera(0.1, 10, target);
  camera.update(renderer, scene);
  // The picture is taken; the things used to take it can go.
  geometry.dispose();
  material.dispose();
  return target;
}

/** Scatter stars over the sky (mostly above the horizon, where they can be seen). */
function buildStars(pixelRatio: number): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const tints = [PALETTE.white, PALETTE.white, PALETTE.blue, PALETTE.gold, PALETTE.purple].map((c) => new THREE.Color(c));
  const direction = new THREE.Vector3();

  // A small repeatable random-number maker, so the sky is the same every visit.
  let seed = 20261116;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < STAR_COUNT; i++) {
    // A random direction, kept if it is not far below the horizon.
    do {
      direction.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    } while (direction.lengthSq() > 1 || direction.lengthSq() < 0.01 || direction.y / direction.length() < -0.05);
    direction.normalize().multiplyScalar(STAR_DISTANCE);
    positions.set([direction.x, direction.y, direction.z], i * 3);

    const tint = tints[Math.floor(random() * tints.length)];
    const brightness = 0.35 + random() * 0.65;
    colors.set([tint.r * brightness, tint.g * brightness, tint.b * brightness], i * 3);
    // Most stars are tiny; a few are larger.
    sizes[i] = 1.2 + Math.pow(random(), 6) * 3.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uPixelRatio: { value: pixelRatio } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -5; // straight after the background, before everything else see-through
  return stars;
}

export function createSky(renderer: THREE.WebGLRenderer): Sky {
  const target = bakeBackground(renderer);
  const stars = buildStars(renderer.getPixelRatio());
  const starMaterial = stars.material as THREE.ShaderMaterial;
  return {
    background: target.texture,
    stars,
    setPixelRatio(ratio: number) {
      starMaterial.uniforms.uPixelRatio.value = ratio;
    },
    dispose() {
      target.dispose();
      stars.geometry.dispose();
      starMaterial.dispose();
    },
  };
}
