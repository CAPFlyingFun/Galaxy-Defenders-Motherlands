// ============================================================================
// dome.ts -- the glass dome over the city, built from Joshua's Half_Sphere.obj.
//
// The model is a half sphere with 12 slices (like orange segments) and 4 rings.
// Each slice becomes one DOME SECTION with its own HP:
//   100 HP  clear glass with glowing frame lines
//   hurt    the glass tints red and cracks spread across it
//   0 HP    the glass shatters away and only a dim, broken frame is left
//
// How it is drawn: every section is its own small mesh (so a section behind the
// camera is skipped), but all twelve share ONE material. Each corner of the
// model carries the number of its section, and the shader looks that number up
// in three small lists (health, shatter progress, hit flash) to decide how the
// glass looks. Changing a section's HP therefore costs nothing: it is one
// number in a list.
// ============================================================================
import * as THREE from 'three';
import type { FrameInfo } from '../core/contracts';
import { DOME_OPACITY, DOME_RADIUS, DOME_SECTIONS, PALETTE, SECTION_MAX_HP, azimuthOf, sectionIndexAt } from './config';

/** Seconds the glass takes to break away once a section reaches 0 HP. */
const SHATTER_SECONDS = 1.1;
/** Seconds the glass takes to grow back after a repair. */
const REFORM_SECONDS = 0.8;
/** Seconds a hit flash lasts. */
const FLASH_SECONDS = 0.45;

/** One of the twelve slices of the dome. */
export class DomeSection {
  /** 0-11, counted the same way as config.sectionIndexAt(). */
  readonly index: number;
  /** The compass direction of the middle of this section, in radians (same convention as a heroine's yaw). */
  readonly centreAzimuth: number;

  private health = SECTION_MAX_HP;
  /** 0 = glass whole, 1 = glass gone. The dome animates this toward the right value. */
  shatterAmount = 0;
  /** 1 right after a hit, fading to 0. */
  flash = 0;

  constructor(index: number) {
    this.index = index;
    this.centreAzimuth = ((index + 0.5) / DOME_SECTIONS) * Math.PI * 2;
  }

  /** Health left, 0-100. */
  get hp(): number {
    return this.health;
  }

  /** True once the section has no health left: its glass is gone and enemies can pass. */
  get shattered(): boolean {
    return this.health <= 0;
  }

  /** Take `amount` HP off this section (never below 0). */
  damage(amount: number): void {
    if (amount <= 0 || this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 1;
  }

  /** Put the section back to full health; its glass grows back. */
  repair(): void {
    this.health = SECTION_MAX_HP;
  }
}

/** What the OBJ file holds once read: corner points and faces (lists of corner numbers). */
interface ObjData {
  points: THREE.Vector3[];
  faces: number[][];
}

/**
 * Read the few OBJ lines we need: "v x y z" (a corner) and "f a/.. b/.. c/.." (a face).
 * Joshua's file has no normals and its UVs are not needed, so those are skipped.
 */
function parseObj(text: string): ObjData {
  const points: THREE.Vector3[] = [];
  const faces: number[][] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') {
      points.push(new THREE.Vector3(Number(parts[1]), Number(parts[2]), Number(parts[3])));
    } else if (parts[0] === 'f') {
      // "13/5" means corner 13 with UV 5. OBJ counts from 1, arrays count from 0.
      faces.push(parts.slice(1).map((token) => parseInt(token, 10) - 1));
    }
  }
  return { points, faces };
}

/**
 * Turn the faces of the model into twelve geometries, one per section.
 *
 * Besides its position every corner gets:
 *   aRing    the height of the bottom and of the top edge of the panel it
 *            belongs to (the same two numbers on every corner of a panel), so
 *            the shader can tell how far up its panel a pixel is
 *   aSection the number of the section it belongs to
 */
function buildSectionGeometries(obj: ObjData): THREE.BufferGeometry[] {
  // Scale the model so its rim sits at DOME_RADIUS.
  let modelRadius = 0;
  for (const p of obj.points) modelRadius = Math.max(modelRadius, Math.hypot(p.x, p.z));
  const scale = DOME_RADIUS / modelRadius;

  const positions: number[][] = [];
  const rings: number[][] = [];
  for (let i = 0; i < DOME_SECTIONS; i++) {
    positions.push([]);
    rings.push([]);
  }

  const centre = new THREE.Vector3();
  for (const face of obj.faces) {
    // Which slice is this face in? Look at the compass direction of its middle.
    centre.set(0, 0, 0);
    for (const index of face) centre.add(obj.points[index]);
    centre.divideScalar(face.length);
    const section = sectionIndexAt(azimuthOf(centre.x, centre.z));

    const heights = face.map((index) => Math.max(0, obj.points[index].y * scale));
    const bottom = Math.min(...heights);
    const top = Math.max(...heights);

    // A four-sided panel is drawn as two triangles, (0,1,2) and (0,2,3); a three-sided one as it is.
    const order = face.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (const i of order) {
      const p = obj.points[face[i]];
      positions[section].push(p.x * scale, heights[i], p.z * scale);
      rings[section].push(bottom, top);
    }
  }

  return positions.map((list, section) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    geometry.setAttribute('aRing', new THREE.Float32BufferAttribute(rings[section], 2));
    geometry.setAttribute('aSection', new THREE.Float32BufferAttribute(new Array(list.length / 3).fill(section), 1));
    // The bounding sphere is what lets three.js skip a section the camera cannot see.
    geometry.computeBoundingSphere();
    return geometry;
  });
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aRing;
  attribute float aSection;
  varying vec3 vPosition;   // where this point of the glass is, in metres
  varying vec2 vRing;       // heights of the bottom and top edge of its panel
  varying float vSection;

  void main() {
    vPosition = position;
    vRing = aRing;
    vSection = aSection;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uHealth[${DOME_SECTIONS}];  // 1 = full health, 0 = none
  uniform float uShatter[${DOME_SECTIONS}]; // 0 = glass whole, 1 = glass gone
  uniform float uFlash[${DOME_SECTIONS}];   // 1 right after a hit, fading to 0
  uniform vec3 uGlass;      // tint of healthy glass
  uniform vec3 uFrame;      // glow of the healthy frame
  uniform vec3 uHurt;       // what both turn toward as the section loses health
  varying vec3 vPosition;
  varying vec2 vRing;
  varying float vSection;

  const float SLICE = ${((Math.PI * 2) / DOME_SECTIONS).toFixed(6)};   // the angle one section spans

  // Cheap repeatable "random" numbers from a 2D position.
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  vec2 hash22(vec2 p) {
    float n = hash21(p);
    return vec2(n, hash21(p + n + 17.1));
  }

  // A pattern of irregular cells, like broken glass.
  // Returns (distance to nearest cell centre, distance to second nearest, a random number for the nearest cell).
  // Where the two distances are almost equal we are on the border between two cells: a crack.
  vec3 shards(vec2 p) {
    vec2 cell = floor(p);
    vec2 inside = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 toCentre = offset + hash22(cell + offset) - inside;
        float d = dot(toCentre, toCentre);
        if (d < nearest) {
          second = nearest;
          nearest = d;
          id = hash21(cell + offset + 3.7);
        } else if (d < second) {
          second = d;
        }
      }
    }
    return vec3(sqrt(nearest), sqrt(second), id);
  }

  // 1 on a line of half-width "width" at distance 0, fading smoothly to 0; never thinner than about a pixel.
  float line(float distance, float width) {
    float pixel = fwidth(distance);
    float w = max(width, pixel);
    return 1.0 - smoothstep(w, w + pixel * 1.5, distance);
  }

  void main() {
    int section = int(vSection + 0.5);
    float health = uHealth[section];
    float gone = uShatter[section];
    float flash = uFlash[section];
    float hurt = 1.0 - health;

    // --- Where are we inside this panel? ---------------------------------
    // u: 0..1 across the section, from its compass direction. v: 0..1 up the panel, from its height.
    // Both are worked out from the pixel's own position, so the lines they draw are perfectly straight.
    float vHeight = vPosition.y / ${DOME_RADIUS.toFixed(1)};
    vec2 uv = vec2(fract(atan(vPosition.x, vPosition.z) / SLICE), (vPosition.y - vRing.x) / (vRing.y - vRing.x));
    float toMeridian = min(uv.x, 1.0 - uv.x);   // distance to the edges that run UP the dome (borders between sections)
    float toRing = min(uv.y, 1.0 - uv.y);       // distance to the edges that run AROUND the dome
    vec2 small = abs(fract(uv * vec2(3.0, 2.0)) - 0.5);
    float toSubPanel = 0.5 - max(small.x, small.y);   // distance to the nearest small-panel line
    vec2 glassPos = uv * vec2(5.0, 4.0) + vSection * 7.31 + vRing.x * 0.37;   // a 2D position on the glass for the crack pattern
    float along = uv.x + uv.y;   // runs along the frame; used to break the frame up when shattered

    // --- The frame: bright lines along panel edges with a soft glow -------
    float frameLine = max(line(toMeridian, 0.006), line(toRing, 0.008) * 0.8);
    float frameGlow = exp(-toMeridian * 70.0) * 0.22 + exp(-toRing * 60.0) * 0.14;
    float subLine = line(toSubPanel, 0.012) * 0.16;

    // --- The glass: almost clear, with a slow shield shimmer --------------
    float shimmer = 0.5 + 0.5 * sin(vHeight * 26.0 - uTime * 0.7 + vSection * 0.9);
    shimmer = pow(shimmer, 6.0) * 0.03;
    float haze = mix(1.5, 0.55, clamp(vHeight, 0.0, 1.0));   // a little denser near the horizon
    float glassAlpha = (0.02 + shimmer) * haze + hurt * 0.16 + flash * 0.22;

    // --- Damage: cracks spread from more and more cells as health drops ----
    float crack = 0.0;
    float glassHere = 1.0;   // 0 where a piece of glass has already fallen away
    float breaking = 0.0;    // bright edge on the pieces about to go
    if (hurt > 0.02) {
      vec3 s = shards(glassPos);
      float border = s.y - s.x;
      float crackLine = 1.0 - smoothstep(0.0, 0.035 + fwidth(border), border);
      crack = crackLine * step(s.z, hurt * 1.15) * 0.85;
      // Shattering removes whole cells, a few at a time, in random order.
      glassHere = step(gone * 1.05, s.z);
      breaking = (1.0 - smoothstep(0.0, 0.25, s.z - gone * 1.05)) * step(0.001, gone) * glassHere;
    }

    vec3 glassColor = mix(uGlass, uHurt, hurt);
    vec3 frameColor = mix(uFrame, uHurt, hurt * 0.85);

    // --- Shattered: no glass, and a dim frame with pieces missing ---------
    float whole = 1.0 - gone;
    float brokenFrame = step(0.3, hash21(vec2(floor(along * 18.0), vSection)));
    float frameStrength = mix(0.22 * brokenFrame, 1.0, whole);
    // A healthy section is drawn faintly (DOME_OPACITY) so space shows through; a hurt one brightens to full
    // strength by the time it has lost half its health, so the player always sees where the dome is in trouble.
    frameStrength *= mix(${DOME_OPACITY.toFixed(2)}, 1.0, clamp(hurt * 2.0, 0.0, 1.0));
    frameColor = mix(vec3(0.45, 0.16, 0.18), frameColor, whole);

    // --- Put it together (colour is already multiplied by alpha) ----------
    float glassPart = glassAlpha * glassHere;
    float cracksPart = (crack + breaking * 0.9) * glassHere;
    float linesPart = (frameLine + subLine * whole * glassHere) * frameStrength;

    vec3 color = glassColor * glassPart
               + mix(vec3(1.0), uHurt, 0.35) * cracksPart
               + frameColor * linesPart
               + frameColor * frameGlow * frameStrength * 0.6;
    float alpha = clamp(glassPart + cracksPart + linesPart, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

/** The dome: twelve sections of glass over the city. */
export class Dome {
  /** Add this to the scene. */
  readonly group = new THREE.Group();
  /** The twelve sections, in order of compass direction. */
  readonly sections: readonly DomeSection[];
  /** Radius at ground level, in metres. */
  readonly radius = DOME_RADIUS;

  private readonly material: THREE.ShaderMaterial;
  private readonly geometries: THREE.BufferGeometry[];
  // The three lists the shader reads, one number per section.
  private readonly healthList = new Float32Array(DOME_SECTIONS).fill(1);
  private readonly shatterList = new Float32Array(DOME_SECTIONS);
  private readonly flashList = new Float32Array(DOME_SECTIONS);

  private constructor(obj: ObjData) {
    const sections: DomeSection[] = [];
    for (let i = 0; i < DOME_SECTIONS; i++) sections.push(new DomeSection(i));
    this.sections = sections;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uHealth: { value: this.healthList },
        uShatter: { value: this.shatterList },
        uFlash: { value: this.flashList },
        uGlass: { value: new THREE.Color(PALETTE.blue) },
        uFrame: { value: new THREE.Color(PALETTE.teal) },
        uHurt: { value: new THREE.Color(PALETTE.red) },
      },
      // Glass: see-through, drawn on both faces (we stand inside it), and it
      // never hides what is behind it (depthWrite off).
      transparent: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.geometries = buildSectionGeometries(obj);
    for (const geometry of this.geometries) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.renderOrder = 10; // after the city, so the glass lies over it
      this.group.add(mesh);
    }
  }

  /** Download the dome model and build the dome from it. */
  static async load(url: string): Promise<Dome> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`could not load the dome model (${response.status}): ${url}`);
    return new Dome(parseObj(await response.text()));
  }

  /** The section in a compass direction (radians, same convention as a heroine's yaw). */
  sectionAt(azimuth: number): DomeSection {
    return this.sections[sectionIndexAt(azimuth)];
  }

  /** The section above or beyond a point in the world (only its X and Z matter). */
  sectionAtPoint(point: THREE.Vector3): DomeSection {
    return this.sectionAt(azimuthOf(point.x, point.z));
  }

  /** Bring every section back to full health. */
  repairAll(): void {
    for (const section of this.sections) section.repair();
  }

  /** Once per frame: move the shatter and flash animations along and hand the numbers to the shader. */
  update(frame: FrameInfo): void {
    this.material.uniforms.uTime.value = frame.elapsed;
    for (let i = 0; i < DOME_SECTIONS; i++) {
      const section = this.sections[i];
      if (section.shattered) {
        section.shatterAmount = Math.min(1, section.shatterAmount + frame.dt / SHATTER_SECONDS);
      } else {
        section.shatterAmount = Math.max(0, section.shatterAmount - frame.dt / REFORM_SECONDS);
      }
      section.flash = Math.max(0, section.flash - frame.dt / FLASH_SECONDS);

      this.healthList[i] = section.hp / SECTION_MAX_HP;
      this.shatterList[i] = section.shatterAmount;
      this.flashList[i] = section.flash;
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
  }
}
