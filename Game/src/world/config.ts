// ============================================================================
// config.ts -- the sizes and colours the whole world agrees on.
//
// Everything is in metres (see core/contracts.ts): Y is up and the centre of
// the plaza is the origin. Change a number here and the dome, the city, the
// ground paint and the cameras all follow.
// ============================================================================

/** Radius of the dome at ground level, in metres. Joshua's model is scaled up to this. */
export const DOME_RADIUS = 125;

/** The dome model has 12 slices; each one is a "dome section" with its own HP. */
export const DOME_SECTIONS = 12;

/** Full health of one dome section. */
export const SECTION_MAX_HP = 100;

/**
 * How strongly a HEALTHY dome section's frame lines and glow are drawn, 0-1 (Joshua, 2026-11-16: "about 20%
 * opacity to see more from outer space"). The glass itself is already almost clear. A section that is hurt
 * comes back up to full strength as it loses health, so damage always stands out.
 */
export const DOME_OPACITY = 0.2;

/** The round plaza the heroine defends from. */
export const PLAZA_RADIUS = 14;

/**
 * The ring painted on the plaza: how far out from the middle it lies. She used to run round it on a fixed track;
 * since 2026-11-17 she walks anywhere (Joshua: "Remove the fixed moving ring, and let it be free movement"), and
 * the ring is only paint on the ground.
 */
export const RING_RADIUS = 9;

/** Width of the painted ring. */
export const RING_WIDTH = 1.8;

/** The city grid: one block plus one street is CITY_PITCH wide. */
export const CITY_PITCH = 20;

/** Width of a street. A block is CITY_PITCH - STREET_WIDTH wide. */
export const STREET_WIDTH = 6;

/** Height of the twelve rooftops that carry a turret pad. */
export const TURRET_ROOF_HEIGHT = 12;

/**
 * The colours of the original HTML game (Galaxy Defenders: Mother Overlord),
 * so the 3D world feels like the same game.
 */
export const PALETTE = {
  navyDeep: '#04060d',
  navy: '#101a2e',
  navyLight: '#1a2740',
  steel: '#2c4a72',
  teal: '#5ee8c8',
  gold: '#ffd56b',
  pink: '#ff5fa2',
  purple: '#c79bff',
  blue: '#7cc8ff',
  red: '#ff4a5e',
  white: '#eaf2ff',
} as const;

const TWO_PI = Math.PI * 2;

/**
 * The compass angle of a ground point, in radians, 0 to 2*PI.
 * It uses the SAME convention as a heroine's yaw (0 = +Z, growing toward +X),
 * so a heroine whose yaw equals a section's azimuth is facing that section.
 */
export function azimuthOf(x: number, z: number): number {
  const a = Math.atan2(x, z);
  return a < 0 ? a + TWO_PI : a;
}

/** Which dome section (0-11) lies in a compass direction. */
export function sectionIndexAt(azimuth: number): number {
  const wrapped = ((azimuth % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.min(DOME_SECTIONS - 1, Math.floor((wrapped / TWO_PI) * DOME_SECTIONS));
}

/**
 * How high the dome is above a ground point that is `distance` metres from the
 * plaza centre. The dome is made of flat panels, which sit a little INSIDE a
 * perfect sphere, so this answers with a slightly smaller sphere (93%) to be
 * safe. Buildings use it to stay under the glass.
 */
export function domeClearance(distance: number): number {
  const r = DOME_RADIUS * 0.93;
  return distance >= r ? 0 : Math.sqrt(r * r - distance * distance);
}
