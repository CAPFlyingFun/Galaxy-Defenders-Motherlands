// ============================================================================
// city.ts -- the first theme: a night-time grid city under the dome.
//
// Every building is the SAME box, stretched to a different size. three.js can
// draw many copies of one shape in a single draw call (an "InstancedMesh"), so
// the whole city costs only a handful of draw calls. The windows are not
// textures: the shader paints them from each pixel's position on the wall.
//
// The city is cut into twelve wedges, one under each dome section, each its
// own InstancedMesh. That way the wedges behind the camera are skipped
// entirely ("nothing outside the camera's view is drawn").
//
// The twelve blocks nearest the plaza each carry a rooftop TURRET PAD, one per
// dome section, marked with a glowing "+".
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CITY_PITCH,
  DOME_RADIUS,
  DOME_SECTIONS,
  PALETTE,
  STREET_WIDTH,
  TURRET_ROOF_HEIGHT,
  azimuthOf,
  domeClearance,
  sectionIndexAt,
} from './config';

/** A rooftop place for a turret. */
export interface TurretPad {
  /** The middle of the pad, on the roof, in world space. */
  readonly position: THREE.Vector3;
  /** The dome section (0-11) this pad sits under and covers. */
  readonly section: number;
}

export interface City {
  /** Add this to the scene. */
  readonly group: THREE.Group;
  /** The twelve turret pads, ordered by section (pads[i].section === i). */
  readonly turretPads: readonly TurretPad[];
  /** How many buildings (boxes) were placed, for the debug readout. */
  readonly boxCount: number;
  dispose(): void;
}

/** One box of the city: where its middle is on the ground, its size, and how high its base is. */
interface Box {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  base: number;
}

const BLOCK = CITY_PITCH - STREET_WIDTH; // width of one block
const LOT_GAP = 0.7; // the alley between two buildings on one block
const HEADROOM = 2.5; // every roof stays at least this far under the glass
const MIN_HEIGHT = 4; // anything that would be lower is not built

/** A small repeatable random-number maker: the city is the same on every visit. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The farthest corner of a footprint from the plaza centre: the corner that meets the dome first. */
function farCorner(x: number, z: number, width: number, depth: number): number {
  return Math.hypot(Math.abs(x) + width / 2, Math.abs(z) + depth / 2);
}

/**
 * Lay out the city. Returns the boxes sorted into twelve lists (one per dome
 * section) and the twelve turret pads.
 */
function planCity(): { boxes: Box[][]; pads: TurretPad[] } {
  const random = makeRandom(1116);
  const boxes: Box[][] = [];
  for (let i = 0; i < DOME_SECTIONS; i++) boxes.push([]);
  const pads: TurretPad[] = [];

  const place = (box: Box) => boxes[sectionIndexAt(azimuthOf(box.x, box.z))].push(box);

  /** Try to put a building on a lot. It is made lower, or left out, if the dome is in the way. */
  const build = (x: number, z: number, width: number, depth: number) => {
    const distance = Math.hypot(x, z);
    const limit = domeClearance(farCorner(x, z, width, depth)) - HEADROOM;
    if (limit < MIN_HEIGHT) return;
    // Tallest near the plaza, lower toward the dome's edge, so the sky stays open.
    const wanted = (4 + 24 * Math.pow(1 - distance / DOME_RADIUS, 1.2)) * (0.55 + random() * 0.6);
    const height = Math.min(limit, Math.max(MIN_HEIGHT, wanted));
    place({ x, z, width, depth, height, base: 0 });

    // Taller buildings often get a narrower upper tier, which makes the skyline less boxy.
    if (height > 11 && random() < 0.6) {
      const tierWidth = width * (0.55 + random() * 0.2);
      const tierDepth = depth * (0.55 + random() * 0.2);
      const tierLimit = domeClearance(farCorner(x, z, tierWidth, tierDepth)) - HEADROOM - height;
      const tierHeight = Math.min(tierLimit, height * (0.2 + random() * 0.3));
      if (tierHeight > 2) place({ x, z, width: tierWidth, depth: tierDepth, height: tierHeight, base: height });
    }
  };

  const cells = Math.ceil(DOME_RADIUS / CITY_PITCH);
  for (let cx = -cells; cx < cells; cx++) {
    for (let cz = -cells; cz < cells; cz++) {
      // The middle of this block. Streets run along x = 0, 20, 40... so blocks sit at 10, 30, 50...
      const x = (cx + 0.5) * CITY_PITCH;
      const z = (cz + 0.5) * CITY_PITCH;
      const ring = Math.max(Math.abs(x), Math.abs(z)) / CITY_PITCH; // 0.5 = touching the plaza, 1.5 = next ring out

      // The four blocks around the origin are left empty: that is the open square with the plaza.
      if (ring < 1) continue;

      // The next ring out is exactly twelve blocks, and each lies under a different dome section.
      // Each gets one flat-roofed building with a turret pad on top.
      if (ring < 2) {
        place({ x, z, width: BLOCK, depth: BLOCK, height: TURRET_ROOF_HEIGHT, base: 0 });
        pads.push({ position: new THREE.Vector3(x, TURRET_ROOF_HEIGHT, z), section: sectionIndexAt(azimuthOf(x, z)) });
        continue;
      }

      // Every other block is split into one, two or four buildings.
      const split = random();
      const half = (BLOCK - LOT_GAP) / 2;
      const offset = (BLOCK + LOT_GAP) / 4;
      if (split < 0.3) {
        build(x, z, BLOCK, BLOCK);
      } else if (split < 0.55) {
        build(x - offset, z, half, BLOCK);
        build(x + offset, z, half, BLOCK);
      } else if (split < 0.8) {
        build(x, z - offset, BLOCK, half);
        build(x, z + offset, BLOCK, half);
      } else {
        build(x - offset, z - offset, half, half);
        build(x + offset, z - offset, half, half);
        build(x - offset, z + offset, half, half);
        build(x + offset, z + offset, half, half);
      }
    }
  }

  pads.sort((a, b) => a.section - b.section);
  return { boxes, pads };
}

const BUILDING_VERTEX = /* glsl */ `
  varying vec3 vLocal;    // position on the building in metres, measured from its middle
  flat varying vec3 vSize;     // the building's width, height and depth in metres
  varying vec3 vNormal;   // which way this wall faces
  // "flat" means: do not blend this between the corners, hand every pixel exactly the same number.
  // The window pattern is made from the seed, and even a tiny blend error would scramble it.
  flat varying float vSeed;    // one random number per building
  varying float vDepth;   // distance from the camera

  void main() {
    // The copy's matrix holds its size (the lengths of its first three columns) and its place (the fourth).
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vLocal = position * vSize;
    vNormal = normal;
    vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 view = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const BUILDING_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uNavy;
  uniform vec3 uNavyLight;
  uniform vec3 uTeal;
  uniform vec3 uGold;
  uniform vec3 uPink;
  uniform vec3 uPurple;
  uniform vec3 uBlue;
  varying vec3 vLocal;
  flat varying vec3 vSize;
  varying vec3 vNormal;
  flat varying float vSeed;
  varying float vDepth;

  const float FLOOR_HEIGHT = 3.0;   // metres per storey
  const float WINDOW_PITCH = 2.2;   // metres from one window to the next

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // One of the game's light colours, chosen by a number 0..1 (gold and teal are the most common).
  vec3 lightColor(float pick) {
    if (pick < 0.40) return uGold;
    if (pick < 0.70) return uTeal;
    if (pick < 0.83) return uBlue;
    if (pick < 0.93) return uPurple;
    return uPink;
  }

  void main() {
    // Every building has its own trim colour and its own favourite window colour.
    vec3 accent = lightColor(fract(vSeed * 7.13));
    vec3 wall = mix(uNavy, uNavyLight, vSeed * 0.6) * 0.75;
    vec3 color;

    if (abs(vNormal.y) > 0.5) {
      // --- Roof: dark, with a thin glowing trim around its edge ------------
      float toEdge = min(vSize.x * 0.5 - abs(vLocal.x), vSize.z * 0.5 - abs(vLocal.z));
      color = wall * 0.55 + accent * (1.0 - smoothstep(0.15, 0.3, toEdge)) * 0.5;
    } else {
      // --- A wall: rows of windows, some of them lit -----------------------
      bool facesX = abs(vNormal.x) > 0.5;
      float across = facesX ? vLocal.z : vLocal.x;          // metres along the wall
      float wallWidth = facesX ? vSize.z : vSize.x;
      float up = vLocal.y + vSize.y * 0.5;                  // metres above the building's base

      vec2 grid = vec2(across / WINDOW_PITCH, up / FLOOR_HEIGHT);
      vec2 id = floor(grid);        // which window
      vec2 inWindow = fract(grid);  // where inside that window's square
      vec2 soft = fwidth(grid) * 1.2;

      // The glass is a rectangle inside each square.
      float glass = smoothstep(0.18, 0.18 + soft.x, inWindow.x) * (1.0 - smoothstep(0.82 - soft.x, 0.82, inWindow.x))
                  * smoothstep(0.30, 0.30 + soft.y, inWindow.y) * (1.0 - smoothstep(0.80 - soft.y, 0.80, inWindow.y));
      // No windows right at the corners of the building, on the ground floor or in the top metre.
      glass *= step(0.7, wallWidth * 0.5 - abs(across)) * step(1.0, id.y) * step(1.0, vSize.y - up);

      // Is this window lit, and in which colour?
      float faceId = facesX ? 1.0 : 2.0;
      float chance = hash21(id + vSeed * 91.7 + faceId * 13.0);
      float litShare = 0.22 + 0.3 * fract(vSeed * 3.71);
      float lit = step(chance, litShare);
      float pick = hash21(id * 1.7 + vSeed * 31.0);
      vec3 glow = mix(accent, lightColor(pick), step(0.7, pick)) * (0.55 + 0.45 * fract(chance * 37.0));

      // Far away the windows are smaller than a pixel: blend toward their average so they do not flicker.
      float tooSmall = smoothstep(0.35, 0.9, max(soft.x, soft.y));
      vec3 windows = mix(mix(wall * 1.5, glow, lit) * glass, accent * litShare * 0.3, tooSmall);
      color = wall * (0.7 + 0.3 * up / max(vSize.y, 1.0)) + windows;

      // A glowing strip along the roof line.
      color += accent * smoothstep(vSize.y - 0.45, vSize.y - 0.3, up) * 0.55;
    }

    // Far buildings melt into the night.
    color = mix(color, uDeep * 1.4, 1.0 - exp(-vDepth * 0.0045));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * The shape of one turret pad, as ONE geometry coloured per corner:
 * a dark disc with a teal rim lying on the roof, a gold "+" painted on it, and
 * a small "+" floating above so the pad can be found from the street.
 */
function buildPadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (geometry: THREE.BufferGeometry, hex: string, brightness = 1) => {
    const color = new THREE.Color(hex).multiplyScalar(brightness);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Indexed and non-indexed shapes cannot be merged, so make them all the same kind.
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  };

  // On the roof: disc, rim and a flat "+".
  paint(new THREE.CylinderGeometry(4.2, 4.2, 0.12, 24).translate(0, 0.06, 0), PALETTE.navyLight, 0.9);
  paint(new THREE.TorusGeometry(4.2, 0.14, 6, 32).rotateX(Math.PI / 2).translate(0, 0.14, 0), PALETTE.teal);
  paint(new THREE.BoxGeometry(5.0, 0.1, 1.1).translate(0, 0.17, 0), PALETTE.gold);
  paint(new THREE.BoxGeometry(1.1, 0.1, 5.0).translate(0, 0.17, 0), PALETTE.gold);

  // Above the roof: a slim post with a "+" made of three crossed bars, readable from any side.
  paint(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6).translate(0, 1.6, 0), PALETTE.teal, 0.7);
  paint(new THREE.BoxGeometry(2.2, 0.5, 0.5).translate(0, 4.2, 0), PALETTE.gold);
  paint(new THREE.BoxGeometry(0.5, 2.2, 0.5).translate(0, 4.2, 0), PALETTE.gold);
  paint(new THREE.BoxGeometry(0.5, 0.5, 2.2).translate(0, 4.2, 0), PALETTE.gold);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

export function createCity(): City {
  const { boxes, pads } = planCity();
  const group = new THREE.Group();

  // --- Buildings: one box shape, one material, twelve InstancedMeshes -----
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingMaterial = new THREE.ShaderMaterial({
    vertexShader: BUILDING_VERTEX,
    fragmentShader: BUILDING_FRAGMENT,
    uniforms: {
      uDeep: { value: new THREE.Color(PALETTE.navyDeep) },
      uNavy: { value: new THREE.Color(PALETTE.navy) },
      uNavyLight: { value: new THREE.Color(PALETTE.navyLight) },
      uTeal: { value: new THREE.Color(PALETTE.teal) },
      uGold: { value: new THREE.Color(PALETTE.gold) },
      uPink: { value: new THREE.Color(PALETTE.pink) },
      uPurple: { value: new THREE.Color(PALETTE.purple) },
      uBlue: { value: new THREE.Color(PALETTE.blue) },
    },
  });

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const noTurn = new THREE.Quaternion();
  let boxCount = 0;
  for (const list of boxes) {
    if (list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(boxGeometry, buildingMaterial, list.length);
    list.forEach((box, i) => {
      // The unit box is centred on its own middle, so lift it by half its height.
      position.set(box.x, box.base + box.height / 2, box.z);
      scale.set(box.width, box.height, box.depth);
      mesh.setMatrixAt(i, matrix.compose(position, noTurn, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    // The sphere around this wedge's buildings: what lets three.js skip the wedge when it is out of view.
    mesh.computeBoundingSphere();
    group.add(mesh);
    boxCount += list.length;
  }

  // --- Turret pads: one shape, twelve copies, one draw call ----------------
  const padGeometry = buildPadGeometry();
  const padMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const padMesh = new THREE.InstancedMesh(padGeometry, padMaterial, pads.length);
  scale.set(1, 1, 1);
  pads.forEach((pad, i) => padMesh.setMatrixAt(i, matrix.compose(pad.position, noTurn, scale)));
  padMesh.instanceMatrix.needsUpdate = true;
  padMesh.computeBoundingSphere();
  group.add(padMesh);

  return {
    group,
    turretPads: pads,
    boxCount,
    dispose() {
      for (const child of group.children) (child as THREE.InstancedMesh).dispose();
      boxGeometry.dispose();
      buildingMaterial.dispose();
      padGeometry.dispose();
      padMaterial.dispose();
    },
  };
}
