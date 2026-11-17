// ============================================================================
// ground.ts -- the ground: plaza, painted ring, street grid and the land outside.
//
// It is ONE flat disc. Everything painted on it (the plaza, its glowing ring,
// kerbs, dashed street lines, the line at the foot of the dome) is worked out by the
// shader from each pixel's position in the world, so there are no textures to
// download and the whole ground is a single draw call.
//
// The heroine's soft shadow is painted here too: the game tells the shader
// where she stands and it darkens the ground under her. Because the whole
// ground is this one disc, that works wherever on the map she is.
// ============================================================================
import * as THREE from 'three';
import { DOME_WALL_DISTANCE } from './collision';
import { CITY_PITCH, DOME_SECTIONS, PALETTE, PLAZA_RADIUS, RING_RADIUS, RING_WIDTH, STREET_WIDTH } from './config';

/** The ground reaches well past the dome so the horizon is never empty. */
const GROUND_RADIUS = 600;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vGround;   // this point's X and Z in the world, in metres
  varying float vDepth;   // how far it is from the camera
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vGround = world.xz;
    vec4 view = viewMatrix * world;
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec2 uHeroine;   // where she stands (X, Z)
  uniform vec3 uDeep;
  uniform vec3 uNavy;
  uniform vec3 uNavyLight;
  uniform vec3 uTeal;
  uniform vec3 uGold;
  uniform vec3 uPink;
  varying vec2 vGround;
  varying float vDepth;

  const float PITCH = ${CITY_PITCH.toFixed(1)};
  const float STREET = ${STREET_WIDTH.toFixed(1)};
  const float PLAZA = ${PLAZA_RADIUS.toFixed(1)};
  const float RING = ${RING_RADIUS.toFixed(1)};
  const float RING_HALF = ${(RING_WIDTH / 2).toFixed(2)};
  const float DOME_SIDE = ${DOME_WALL_DISTANCE.toFixed(3)};                       // from the centre to the middle of one of the dome's flat sides
  const float DOME_SLICE = ${((Math.PI * 2) / DOME_SECTIONS).toFixed(6)};   // the angle one dome section spans
  const float PI = 3.14159265;

  // 1 on a line of half-width "width" around distance 0, smooth at the edges.
  float line(float distance, float width) {
    float pixel = fwidth(distance);
    return 1.0 - smoothstep(width - pixel, width + pixel, abs(distance));
  }

  // How far a point of the ground is OUTSIDE the dome's glass, in metres (negative = inside).
  // The glass is twelve flat panels between corner posts, so seen from above the dome is a twelve-sided shape and
  // not a circle: in the middle of a panel the glass is four metres nearer the centre than at the posts. This
  // measures to the panel the point is in front of, so the paint on the ground meets the glass exactly, which is
  // also exactly where the heroine is stopped (src/world/collision.ts).
  float pastDome(vec2 p) {
    float fromPanelMiddle = mod(atan(p.x, p.y), DOME_SLICE) - DOME_SLICE * 0.5;   // the point's compass direction, measured from the middle of that panel
    return length(p) * cos(fromPanelMiddle) - DOME_SIDE;
  }

  void main() {
    vec2 p = vGround;
    float r = length(p);
    // (in the plaza nothing is anywhere near the dome, and the very centre has no compass direction to measure from)
    float outside = r > PLAZA ? pastDome(p) : r - DOME_SIDE;
    // Fine patterns fade out far away, where they would only flicker.
    float detail = 1.0 - smoothstep(60.0, 160.0, vDepth);
    vec3 color;

    if (outside > 0.0) {
      // --- Outside the dome: dark, empty land -----------------------------
      color = uDeep * 0.8;
    } else if (r < PLAZA) {
      // --- The plaza ------------------------------------------------------
      color = mix(uNavy, uNavyLight, 0.25);
      // Paving: rings and spokes.
      float angle = atan(p.x, p.y);
      float paving = max(line(fract(r / 2.0) - 0.5, 0.012), line(fract(angle / PI * 12.0) - 0.5, 0.02 / max(r, 1.0)));
      color += uNavyLight * paving * 0.5 * step(2.6, r);

      // The painted ring (once the track she ran round; she walks anywhere now): a lighter band with glowing
      // edges and a dashed middle line.
      float fromRing = r - RING;
      float band = 1.0 - smoothstep(RING_HALF - 0.05, RING_HALF + 0.05, abs(fromRing));
      color = mix(color, uNavyLight * 1.25, band * 0.8);
      float edges = line(abs(fromRing) - RING_HALF, 0.07);
      float dashes = line(fromRing, 0.05) * step(0.5, fract(angle / PI * 24.0));
      color += uTeal * (edges * 0.9 + dashes * 0.45);
      color += uTeal * exp(-abs(abs(fromRing) - RING_HALF) * 5.0) * 0.10;

      // Twelve gold marks near the rim, one at each border between dome sections.
      float mark = line(fract(angle / PI * 6.0 + 0.5) - 0.5, 0.05 / r) * step(11.4, r) * step(r, 13.2);
      color += uGold * mark * 0.8;

      // The middle: a small pink emblem ring.
      color += uPink * line(r - 2.4, 0.08) * 0.8;
      color += uPink * exp(-r * r * 0.4) * 0.12;
    } else {
      // --- The city: blocks and streets on a square grid ------------------
      // Streets run along the lines x = 0, 20, 40... and z = 0, 20, 40...; a block fills each square between.
      vec2 inCell = (fract(p / PITCH) - 0.5) * PITCH;            // metres from the middle of this block
      vec2 fromBlock = abs(inCell) - (PITCH - STREET) * 0.5;      // > 0 means we are on a street
      float onStreet = max(fromBlock.x, fromBlock.y);

      // The four squares around the plaza have no buildings: they are an open paved square.
      bool openSquare = max(abs(p.x), abs(p.y)) < PITCH;

      if (onStreet > 0.0 && !openSquare) {
        // Asphalt, a kerb line, and a dashed glowing line down the middle of each street.
        color = uDeep * 1.6;
        color += uNavyLight * line(onStreet, 0.12) * 0.9;
        vec2 fromCentreLine = PITCH * 0.5 - abs(inCell);
        float dashX = line(fromCentreLine.x, 0.10) * step(0.5, fract(p.y / 5.0)) * step(fromBlock.y, 0.0);
        float dashZ = line(fromCentreLine.y, 0.10) * step(0.5, fract(p.x / 5.0)) * step(fromBlock.x, 0.0);
        color += uTeal * (dashX + dashZ) * 0.5 * detail;
      } else if (openSquare) {
        // Paving slabs around the plaza.
        color = uNavy * 0.85;
        vec2 slab = abs(fract(p / 2.5) - 0.5);
        color += uNavyLight * line(0.5 - max(slab.x, slab.y), 0.02) * 0.35 * detail;
      } else {
        // The pavement a block's buildings stand on.
        color = uNavy * 0.6;
      }

      // The gold rim of the plaza, and a teal line where the dome meets the ground: just inside the glass,
      // straight along each of its twelve sides.
      color += uGold * (line(r - PLAZA, 0.12) + exp(-abs(r - PLAZA) * 3.0) * 0.15);
      color += uTeal * (line(outside + 0.6, 0.5) + exp(-abs(outside) * 0.35) * 0.25);
    }

    // Her soft shadow.
    vec2 toHeroine = p - uHeroine;
    color *= 1.0 - 0.6 * exp(-dot(toHeroine, toHeroine) / 0.22);

    // Far ground melts into the dark.
    color = mix(color, uDeep * 0.9, 1.0 - exp(-vDepth * 0.0035));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface Ground {
  /** Add this to the scene. */
  readonly mesh: THREE.Mesh;
  /** Tell the ground where the heroine stands, for her shadow. */
  setHeroine(x: number, z: number): void;
  dispose(): void;
}

export function createGround(): Ground {
  const geometry = new THREE.CircleGeometry(GROUND_RADIUS, 64);
  geometry.rotateX(-Math.PI / 2); // lay the disc flat
  const heroine = new THREE.Vector2();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uHeroine: { value: heroine },
      uDeep: { value: new THREE.Color(PALETTE.navyDeep) },
      uNavy: { value: new THREE.Color(PALETTE.navy) },
      uNavyLight: { value: new THREE.Color(PALETTE.navyLight) },
      uTeal: { value: new THREE.Color(PALETTE.teal) },
      uGold: { value: new THREE.Color(PALETTE.gold) },
      uPink: { value: new THREE.Color(PALETTE.pink) },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    mesh,
    setHeroine(x: number, z: number) {
      heroine.set(x, z);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
