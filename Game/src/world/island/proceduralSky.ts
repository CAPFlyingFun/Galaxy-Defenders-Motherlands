// ============================================================================
// proceduralSky.ts -- the island's sky DRAWN BY CODE, with a time of day.
//
// Joshua, 2026-11-24: "let's create a procedural sky as it gives up more
// options and saves textures/memory. It can be as a separate option in
// settings"; his and ChatGPT's "Procedural Sky & Ocean" handoff (kept outside
// the repo) and his concept sheets: day (tropical blue, pale cyan horizon, soft
// white clouds), sunrise and sunset (amber horizon, coral and violet above),
// night (deep indigo, stars, a moon), a tropical storm (slate clouds, muted
// light, haze), and alien skies (cyan/green aurora, violet bands).
//
// Settings -> WORLD -> Sky: Procedural (this) or Picture (Beyond Extinction's
// daytime picture, as before). Time of day, Day cycle, Sky event and Clouds
// beside it, all live.
//
// TWO PARTS:
//  1. `environmentAt(hour, event)`: what the time of day and the event make of
//     the world: where the sun and moon are, the sky's colours, the sun's (or
//     moon's) light, the sky light, the haze, the sea's reflection, how much is
//     night (the glowing flora brighten with it). main.ts lights the world from
//     it; the island's sky, haze and sea take it (islandWorld.ts setEnvironment).
//  2. `createProceduralSky()`: the sky itself, one box round the camera (as the
//     sky picture is, skyPicture.ts) whose shader works out each pixel's colour
//     from the way it looks: the gradient from the horizon up, the sun's disc
//     and its glow, the moon, seeded stars, cheap moving clouds, the storm, the
//     aurora and the alien bands. Nothing downloaded; no picture in memory.
//
// THE SUN'S PATH: rises due east, highest in the south at 59 degrees at 12:00,
// sets due west, as a circle tilted toward the south. Chosen so that at 13:15
// (`SKY_TODAY_HOUR`) the sun is where the island's light has always come from
// (main.ts: from (-4, 10, 6); within a fifth of a degree), and at that hour
// every light is exactly as before: the ground's colours were measured in that
// light (groundPaint.ts DAYLIGHT_BALANCE).
// ============================================================================
import * as THREE from 'three';

/** What is happening in the sky (Settings -> WORLD -> Sky event). */
export type SkyEvent = 'clear' | 'storm' | 'aurora' | 'bands';

/** The hour at which the sun is exactly where the island's light has always come from (and every light as before). */
export const SKY_TODAY_HOUR = 13.25;
/** The sun's height at midday, degrees (worked out so that 13:15 lands on the old light's direction). */
const NOON_ELEVATION = 59.04 * Math.PI / 180;

/** Everything the time of day and the sky's event make of the world, for one moment. */
export interface Environment {
  hour: number;
  /** Toward the sun and toward the moon (unit vectors, the game's world: +x east, +z south, y up). */
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** 0 full day .. 1 full night (the glowing flora's strength, the stars). */
  night: number;
  /** The sky's own colours (linear light values). */
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** The glow round the sun and along the horizon at sunrise and sunset, and how strong. */
  glow: THREE.Color;
  glowAmount: number;
  sunColour: THREE.Color;
  stars: number;
  moon: number;
  /** Clouds: how much of the sky (0..1) and their lit and shaded colours. */
  cloudCover: number;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  storm: number;
  aurora: number;
  bands: number;
  /** A lightning flash now (0..1; storms only). */
  flash: number;
  /** THE WORLD'S LIGHT: the key light (the sun by day, the moon by night) and the sky light from above and below. */
  keyDir: THREE.Vector3;
  keyColour: THREE.Color;
  keyIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  /** The haze: its colour and where it starts and is full (metres). */
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** The sky colour the sea reflects. */
  seaSky: THREE.Color;
}

/** One stop on the way from night to day, by the sun's height (its direction's y: -1 straight down .. 1 straight up). */
interface Stop {
  sunY: number;
  zenith: number; horizon: number; glow: number; glowAmount: number; sun: number;
  keyColour: number; keyIntensity: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  fog: number; cloudLit: number; cloudShade: number; stars: number; seaSky: number;
}

/**
 * THE DAY, STOP BY STOP (the colours as a paint program shows them). The last stop, DAY, is the island's light as it
 * has always been (hemisphere 0xcfe0ff / 0x1a2740 x 1.7, sun white x 1.5, haze 0xbcc6cc, sea sky 0x9fc6df), so the
 * daytime world looks as before. Between stops everything is blended smoothly by the sun's height.
 * By night the key light is the MOON (its own direction), weaker and blue.
 */
const STOPS: readonly Stop[] = [
  { sunY: -0.3, zenith: 0x050a20, horizon: 0x16224a, glow: 0x000000, glowAmount: 0, sun: 0xffffff,
    keyColour: 0xa9b8ff, keyIntensity: 0.32, hemiSky: 0x3e4c88, hemiGround: 0x0a0e1c, hemiIntensity: 0.55,
    fog: 0x121a33, cloudLit: 0x3a4466, cloudShade: 0x151b30, stars: 1, seaSky: 0x1a2650 },
  { sunY: -0.08, zenith: 0x1c2260, horizon: 0x7a4a86, glow: 0xc06a8a, glowAmount: 0.5, sun: 0xff8a5a,
    keyColour: 0x9fb0ff, keyIntensity: 0.22, hemiSky: 0x6a6ab0, hemiGround: 0x120e22, hemiIntensity: 0.65,
    fog: 0x3a3060, cloudLit: 0x8a6a9a, cloudShade: 0x2a2440, stars: 0.45, seaSky: 0x4a3a70 },
  { sunY: 0.04, zenith: 0x4a4aa5, horizon: 0xff8a4c, glow: 0xff6a3a, glowAmount: 1, sun: 0xffa060,
    keyColour: 0xff9a5a, keyIntensity: 0.8, hemiSky: 0xe0a8b8, hemiGround: 0x2a1e30, hemiIntensity: 1.0,
    fog: 0xd9927a, cloudLit: 0xff9a6a, cloudShade: 0x6a4a7a, stars: 0, seaSky: 0xe09a8a },
  { sunY: 0.2, zenith: 0x2f5fb8, horizon: 0xf3c99a, glow: 0xffb070, glowAmount: 0.6, sun: 0xffe0b0,
    keyColour: 0xffd6a8, keyIntensity: 1.35, hemiSky: 0xd9d6f0, hemiGround: 0x1a2236, hemiIntensity: 1.5,
    fog: 0xd8c8b4, cloudLit: 0xffe2c2, cloudShade: 0xa8a4c0, stars: 0, seaSky: 0xc4c6d8 },
  { sunY: 0.45, zenith: 0x1e63c8, horizon: 0xa8d6ee, glow: 0xfff4d6, glowAmount: 0.25, sun: 0xfff8e8,
    keyColour: 0xffffff, keyIntensity: 1.5, hemiSky: 0xcfe0ff, hemiGround: 0x1a2740, hemiIntensity: 1.7,
    fog: 0xbcc6cc, cloudLit: 0xffffff, cloudShade: 0xb8c4d6, stars: 0, seaSky: 0x9fc6df },
];

/** A STORM's colours (blended in by how much storm there is). */
const STORM = { sky: 0x4a5568, horizon: 0x7d8796, hemi: 0x7d8aa0, fog: 0x6b7686, cloudLit: 0x9aa4b4, cloudShade: 0x3a4250 };
/** The haze's distances on a clear day (as islandWorld.ts has always had them) and in a storm. */
const FOG_CLEAR = { near: 3000, far: 16000 };
const FOG_STORM = { near: 500, far: 6000 };

/** Where the sun is at an hour of the day (0..24): a unit vector, below the horizon at night. */
export function sunDirectionAt(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  // round the day: 0 at 6:00 (east), half a turn at 18:00 (west); the top of the circle is south at 59 degrees up
  const turn = ((hour - 6) / 24) * Math.PI * 2;
  const east = Math.cos(turn), up = Math.sin(turn);
  return out.set(east, up * Math.sin(NOON_ELEVATION), up * Math.cos(NOON_ELEVATION)).normalize();
}

const scratch = { a: new THREE.Color(), b: new THREE.Color() };
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A new, empty Environment to fill again and again (no new objects each frame). */
export function makeEnvironment(): Environment {
  const c = () => new THREE.Color();
  return {
    hour: SKY_TODAY_HOUR, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), night: 0,
    zenith: c(), horizon: c(), glow: c(), glowAmount: 0, sunColour: c(), stars: 0, moon: 0,
    cloudCover: 0, cloudLit: c(), cloudShade: c(), storm: 0, aurora: 0, bands: 0, flash: 0,
    keyDir: new THREE.Vector3(), keyColour: c(), keyIntensity: 0, hemiSky: c(), hemiGround: c(), hemiIntensity: 0,
    fog: c(), fogNear: FOG_CLEAR.near, fogFar: FOG_CLEAR.far, seaSky: c(),
  };
}

/**
 * THE WORLD AT AN HOUR, with an event: fills `env` (made by makeEnvironment). `clouds` false: none at all (Settings
 * -> Clouds off), except in a storm. `flash` is the storm's lightning now (0..1), from the caller's clock.
 */
export function environmentAt(env: Environment, hour: number, event: SkyEvent, clouds: boolean, flash = 0): Environment {
  env.hour = hour;
  sunDirectionAt(hour, env.sunDir);
  // the moon: roughly opposite the sun, a little off so it is not straight overhead at midnight
  env.moonDir.set(-env.sunDir.x + 0.25, -env.sunDir.y + 0.15, -env.sunDir.z - 0.2).normalize();
  const y = env.sunDir.y;
  // which two stops the sun's height lies between, and how far along
  let i = 0;
  while (i < STOPS.length - 2 && y > STOPS[i + 1].sunY) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (y - a.sunY) / (b.sunY - a.sunY))));
  const col = (out: THREE.Color, from: number, to: number) => out.copy(scratch.a.set(from)).lerp(scratch.b.set(to), t);
  const num = (from: number, to: number) => from + (to - from) * t;
  col(env.zenith, a.zenith, b.zenith);
  col(env.horizon, a.horizon, b.horizon);
  col(env.glow, a.glow, b.glow);
  env.glowAmount = num(a.glowAmount, b.glowAmount);
  col(env.sunColour, a.sun, b.sun);
  col(env.hemiSky, a.hemiSky, b.hemiSky);
  col(env.hemiGround, a.hemiGround, b.hemiGround);
  env.hemiIntensity = num(a.hemiIntensity, b.hemiIntensity);
  col(env.fog, a.fog, b.fog);
  col(env.cloudLit, a.cloudLit, b.cloudLit);
  col(env.cloudShade, a.cloudShade, b.cloudShade);
  env.stars = num(a.stars, b.stars);
  col(env.seaSky, a.seaSky, b.seaSky);
  env.night = 1 - smooth(Math.min(1, Math.max(0, (y + 0.1) / 0.22)));
  env.moon = env.night;
  // THE KEY LIGHT: the sun while it is up, the moon once it is down; both faint where they hand over, so the shadows
  // never jump while it would show
  const sunPart = Math.max(0, num(a.keyIntensity, b.keyIntensity)) * smooth(Math.min(1, Math.max(0, (y + 0.02) / 0.06)));
  const moonPart = 0.3 * (1 - smooth(Math.min(1, Math.max(0, (y + 0.12) / 0.1))));
  if (sunPart >= moonPart) { env.keyDir.copy(env.sunDir); col(env.keyColour, a.keyColour, b.keyColour); env.keyIntensity = sunPart; }
  else { env.keyDir.copy(env.moonDir); env.keyColour.set(0xa9b8ff); env.keyIntensity = moonPart; }
  // (a key light from under the horizon would light the world from below: never lower than just above it)
  if (env.keyDir.y < 0.08) { env.keyDir.y = 0.08; env.keyDir.normalize(); }
  // CLOUDS: a few soft ones on a clear day
  env.cloudCover = clouds ? 0.35 : 0;
  env.fogNear = FOG_CLEAR.near; env.fogFar = FOG_CLEAR.far;
  env.storm = 0; env.aurora = 0; env.bands = 0; env.flash = 0;
  // THE EVENTS
  if (event === 'storm') {
    const s = 1;
    env.storm = s;
    env.cloudCover = 1;
    const dark = (c: THREE.Color, to: number, k: number) => c.lerp(scratch.a.set(to).multiplyScalar(0.25 + 0.75 * (1 - env.night)), k);
    dark(env.zenith, STORM.sky, 0.75 * s);
    dark(env.horizon, STORM.horizon, 0.75 * s);
    dark(env.hemiSky, STORM.hemi, 0.6 * s);
    dark(env.fog, STORM.fog, 0.6 * s);
    dark(env.cloudLit, STORM.cloudLit, 0.8 * s);
    dark(env.cloudShade, STORM.cloudShade, 0.8 * s);
    dark(env.seaSky, STORM.horizon, 0.6 * s);
    env.keyIntensity *= 1 - 0.65 * s;
    env.hemiIntensity *= 1 - 0.4 * s;
    env.glowAmount *= 1 - 0.8 * s;
    env.stars *= 0.1;
    env.moon *= 0.15;
    env.fogNear = FOG_STORM.near; env.fogFar = FOG_STORM.far;
    // lightning: the whole sky and the sky light leap for a moment
    env.flash = flash;
    env.hemiIntensity += flash * 2.5;
  } else if (event === 'aurora') {
    env.aurora = env.night; // (the curtains show only as it gets dark)
  } else if (event === 'bands') {
    env.bands = 0.35 + 0.65 * env.night; // (faint by day, bright by night)
  }
  return env;
}

// ---- the sky itself -------------------------------------------------------------------------------------------------
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
uniform vec3 uZenith, uHorizon, uGlow, uSun, uSunDir, uMoonDir, uCloudLit, uCloudShade;
uniform float uGlowAmount, uStars, uMoon, uCloud, uStorm, uAurora, uBands, uFlash, uTime;
varying vec3 vDirection;

// cheap noise made from numbers (no pictures)
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.02 + 13.1; a *= 0.5; } return s / 0.9375; }

void main() {
  vec3 d = normalize(vDirection);
  float y = d.y;
  // THE GRADIENT: pale at the horizon, deep overhead; under the horizon (mostly behind the sea) a little darker
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, y));
  // THE SUN'S GLOW round it, and along the horizon on its side (sunrise and sunset)
  float toSun = dot(d, uSunDir);
  float near = max(toSun, 0.0);
  col += uGlow * (pow(near, 5.0) * 0.5 + pow(near, 40.0) * 0.6) * uGlowAmount;
  vec2 flatD = normalize(d.xz + 1e-5), flatSun = normalize(uSunDir.xz + 1e-5);
  col += uGlow * pow(max(dot(flatD, flatSun), 0.0), 3.0) * exp(-max(y, 0.0) * 6.0) * smoothstep(-0.15, 0.0, y) * uGlowAmount * 0.55;
  // THE STORM darkens and flattens it
  col *= 1.0 - 0.25 * uStorm;
  // THE STARS (night): about one cell of the sky in forty holds one, each its own brightness, twinkling
  if (uStars > 0.01 && y > 0.0) {
    vec3 p = d * 260.0;
    vec3 cell = floor(p);
    float r = h3(cell);
    if (r > 0.975) {
      vec3 at = vec3(h3(cell + 1.7), h3(cell + 5.3), h3(cell + 9.1)) * 0.6 + 0.2;
      float dist = length(fract(p) - at);
      float twinkle = 0.65 + 0.35 * sin(uTime * (1.3 + r * 3.0) + r * 80.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.3, 0.0, dist) * (0.6 + 1.2 * (r - 0.975) / 0.025) * twinkle * uStars * smoothstep(0.0, 0.2, y);
    }
  }
  // THE ALIEN BANDS: a few glowing arcs across the sky
  if (uBands > 0.01 && y > -0.05) {
    vec3 tilt = normalize(vec3(0.35, 0.62, -0.7));
    float g = dot(d, tilt);
    float b = 0.0;
    for (int i = 0; i < 4; i++) {
      float off = -0.16 + float(i) * 0.055, w = 0.01 + 0.007 * float(i - (i / 2) * 2);
      b += exp(-pow((g - off) / w, 2.0)) * (0.55 + 0.45 * n2(vec2(d.x * 18.0 + float(i) * 7.0, uTime * 0.05)));
    }
    col += mix(vec3(0.85, 0.3, 1.0), vec3(0.45, 0.45, 1.0), smoothstep(-0.2, 0.0, g)) * b * uBands * 0.5 * smoothstep(-0.05, 0.25, y);
  }
  // THE AURORA (night): curtains low over the horizon, rippling along it
  if (uAurora > 0.01 && y > 0.04) {
    // (the noise is read round a CIRCLE, the way she looks on the compass: read along the compass angle it jumped where
    //  the angle goes from -180 to +180 degrees, a hard edge in the curtains due west)
    float baseY = 0.2 + 0.14 * n2(flatD * 2.5 + vec2(uTime * 0.04, uTime * 0.02));
    float rise = y - baseY;
    float curtain = smoothstep(0.0, 0.03, rise) * exp(-max(rise, 0.0) * 4.5);
    float rays = 0.55 + 0.45 * n2(flatD * 45.0 + vec2(0.0, uTime * 0.25));
    float patches = smoothstep(0.25, 0.75, n2(flatD * 1.6 + vec2(-uTime * 0.03, 4.2)));
    vec3 ac = mix(vec3(0.1, 1.0, 0.65), vec3(0.5, 0.35, 1.0), smoothstep(0.0, 0.3, rise));
    col += ac * curtain * rays * patches * uAurora * 0.95;
  }
  // THE MOON: a pale disc with darker seas, and a soft glow round it
  if (uMoon > 0.01) {
    float m = dot(d, uMoonDir);
    float disc = smoothstep(0.99955, 0.99968, m);
    vec3 side = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + 1e-5);
    vec3 upOn = cross(side, uMoonDir);
    vec2 onMoon = vec2(dot(d, side), dot(d, upOn)) * 2200.0;
    vec3 face = vec3(0.86, 0.88, 0.94) * (0.72 + 0.28 * n2(onMoon * 0.08 + 3.0));
    col = mix(col, face, disc * uMoon);
    col += vec3(0.45, 0.55, 0.85) * pow(max(m, 0.0), 600.0) * 0.22 * uMoon;
  }
  // THE SUN'S DISC
  float disc = smoothstep(0.99962, 0.99978, toSun);
  col = mix(col, uSun * 1.6, disc * smoothstep(-0.03, 0.02, uSunDir.y) * (1.0 - 0.85 * uStorm));
  // THE CLOUDS: noise laid on a ceiling above, drifting; lit toward the sun, darker in their thick middles
  if (uCloud > 0.01 && y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 0.9 + uTime * vec2(0.006, 0.002);
    float n = fbm(uv * 1.2);
    float edge = mix(0.66, 0.18, uCloud);
    float c = smoothstep(edge, edge + 0.22, n) * smoothstep(0.0, 0.1, y);
    float lit = clamp(0.5 + 0.5 * pow(near, 2.0) - (n - edge) * 0.9, 0.0, 1.0);
    col = mix(col, mix(uCloudShade, uCloudLit, lit), c * 0.92);
  }
  // LIGHTNING: the whole sky leaps for a moment
  col += vec3(0.55, 0.6, 0.75) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** The procedural sky. Add `mesh` to the scene; `update` each frame with the environment; `dispose` lets it go. */
export interface ProceduralSky {
  readonly mesh: THREE.Mesh;
  update(env: Environment, seconds: number): void;
  dispose(): void;
}

export function createProceduralSky(): ProceduralSky {
  const v3 = () => ({ value: new THREE.Vector3() });
  const col = () => ({ value: new THREE.Color() });
  const uniforms = {
    uZenith: col(), uHorizon: col(), uGlow: col(), uSun: col(), uCloudLit: col(), uCloudShade: col(),
    uSunDir: v3(), uMoonDir: v3(),
    uGlowAmount: { value: 0 }, uStars: { value: 0 }, uMoon: { value: 0 }, uCloud: { value: 0 }, uStorm: { value: 0 },
    uAurora: { value: 0 }, uBands: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'ProceduralSky',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide, // (seen from inside)
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false; // (round the camera, always in view)
  mesh.renderOrder = -1e9; // (drawn before everything else)
  mesh.matrixAutoUpdate = false;
  let time = 0;
  return {
    mesh,
    update(env, seconds) {
      time += seconds;
      const u = uniforms;
      u.uZenith.value.copy(env.zenith); u.uHorizon.value.copy(env.horizon); u.uGlow.value.copy(env.glow);
      u.uSun.value.copy(env.sunColour); u.uCloudLit.value.copy(env.cloudLit); u.uCloudShade.value.copy(env.cloudShade);
      u.uSunDir.value.copy(env.sunDir); u.uMoonDir.value.copy(env.moonDir);
      u.uGlowAmount.value = env.glowAmount; u.uStars.value = env.stars; u.uMoon.value = env.moon;
      u.uCloud.value = env.cloudCover; u.uStorm.value = env.storm; u.uAurora.value = env.aurora; u.uBands.value = env.bands;
      u.uFlash.value = env.flash; u.uTime.value = time;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
