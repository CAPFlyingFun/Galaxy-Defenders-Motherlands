// ============================================================================
// looks.ts -- what each heroine wears, as DATA.
//
// One typed object per heroine says everything about her outfit:
//   * her PALETTE (a handful of named colours);
//   * her RIGID pieces: which style of helmet, shoulder pads, guards, boots,
//     hip gear and guns she has, and which palette colours paint each one
//     (left and right can differ: Coral wears one shoulder pad);
//   * her SKIN-FOLLOWING plates: which parts of her body are plated (chest,
//     hips, thighs, belly shell), described as regions of her skin;
//   * her painted UNDER-SUIT: colours only.
// Adding a seventh heroine is one more object in HEROINE_LOOKS.
//
// Colours are written from Joshua's reference pictures (which stay out of the
// repo). A piece's `paint` says which palette colour goes where on it; any
// part not mentioned takes the usual one (main = primary, second = secondary,
// accent = accent, dark, glow and visor = the palette's own).
// ============================================================================
import type { PieceColors } from './kit';
import type { HelmetOptions } from './pieces/helmet';
import type { ShoulderOptions } from './pieces/shoulder';
import type { ForearmOptions, HolsterOptions, KneeOptions, ShinOptions } from './pieces/limbs';
import type { BootOptions } from './pieces/boot';
import type { HipOptions } from './pieces/hip';
import type { GunOptions } from './pieces/guns';

/** A heroine's colours, as hex numbers. */
export interface Palette {
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
  /** Dark under-armor: linings, straps, joints, soles. */
  readonly dark: number;
  /** Light strips. */
  readonly glow: number;
  /** Visor glass. */
  readonly visor: number;
  /** The painted under-suit and its trim. */
  readonly underSuit: number;
  readonly underSuitTrim: number;
}

/** A colour: one of the palette's names, or a hex number of its own. */
export type ColourRef = keyof Palette | number;
/** Which colour paints which part of a piece (the parts are named in each builder). */
export type PiecePaint = Partial<Record<keyof PieceColors, ColourRef>>;
/** A piece's options plus its paint. */
export type Painted<T> = T & { readonly paint?: PiecePaint };

/** KIND 1: her rigid pieces. `null` = she does not wear one there. */
export interface RigidLook {
  readonly helmet: Painted<HelmetOptions>;
  readonly shoulderL: Painted<ShoulderOptions> | null;
  readonly shoulderR: Painted<ShoulderOptions> | null;
  readonly forearmL: Painted<ForearmOptions> | null;
  readonly forearmR: Painted<ForearmOptions> | null;
  readonly kneeL: Painted<KneeOptions> | null;
  readonly kneeR: Painted<KneeOptions> | null;
  readonly shinL: Painted<ShinOptions> | null;
  readonly shinR: Painted<ShinOptions> | null;
  readonly bootL: Painted<BootOptions> | null;
  readonly bootR: Painted<BootOptions> | null;
  /** On her pelvis, at each hip. */
  readonly hipL: Painted<HipOptions> | null;
  readonly hipR: Painted<HipOptions> | null;
  /** A holster on a thigh. */
  readonly thighL: Painted<HolsterOptions> | null;
  readonly thighR: Painted<HolsterOptions> | null;
  readonly gunL: Painted<GunOptions> | null;
  readonly gunR: Painted<GunOptions> | null;
}

/**
 * A REGION OF HER SKIN, for a plate that follows it. Written against her body as the file has it (standing, arms a
 * little away from her sides, feet flat, 1.70 m tall, belly at 100 %, soles at height 0, facing +Z, her left
 * toward +X), so it means the same skin whatever pose or belly she has later. On that body her crotch is at
 * 0.80 m, her hip joints at 0.89, her belly's furthest point at 1.02, the fold under her bust at 1.22, her bust's
 * furthest point at 1.28 and her shoulder joints at 1.37.
 *   'oval'  what an oval covers when she is seen from the front (or the back): belly shells, chest plates.
 *   'band'  a band round her torso between two heights, optionally only part of the way round.
 *   'limb'  a stretch of an arm or leg, optionally only part of the way round it.
 * Angles are degrees round the upright (or the limb): 0 = her front, 90 = the outer side (for the torso: her left),
 * 180 = the back, 270 = the inner side (her right). `from` to `to` runs through increasing angles.
 */
export type SkinRegion =
  | { readonly shape: 'oval'; readonly face: 'front' | 'back'; readonly centre: readonly [number, number]; readonly radii: readonly [number, number]; /** how much squarer than an oval: 2 = an oval, more = a rounded box */ readonly square?: number }
  | { readonly shape: 'band'; readonly y: readonly [number, number]; readonly arc?: readonly [number, number] }
  | { readonly shape: 'limb'; readonly limb: 'upperArmL' | 'upperArmR' | 'forearmL' | 'forearmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'; /** how far along it, 0 = its upper joint, 1 = its lower joint */ readonly along: readonly [number, number]; readonly arc?: readonly [number, number] };

/** KIND 2: one plate that follows her skin (built from her own skin surface pushed outward: skinPlates.ts). */
export interface SkinPlateLook {
  /** A name for it ('bellyShell', 'chest', 'thighL'...). */
  readonly id: string;
  /** The skin it covers. Several regions are joined into one plate. */
  readonly regions: readonly SkinRegion[];
  /** Skin to leave out of it again (a neckline cut into a chest plate, the navel window of a shell...). */
  readonly cut?: readonly SkinRegion[];
  /** How far it stands off her skin, metres (6-12 mm). */
  readonly thickness: number;
  readonly colour: ColourRef;
  /** Its edge. */
  readonly rim?: ColourRef;
  /** In words: what it is on the reference picture. */
  readonly note: string;
}

/** KIND 3: the painted under-suit: colours only. */
export interface UnderSuitLook {
  /** The suit's colour wherever nothing else is said. */
  readonly base: ColourRef;
  /** Areas painted another colour. `area` is in words the painter understands; `region` pins it down where it matters. */
  readonly areas: ReadonlyArray<{ readonly area: string; readonly colour: ColourRef; readonly region?: SkinRegion; readonly note?: string }>;
  /** Where the reference picture shows bare skin, not suit. (CLAUDE.md says no bare skin where plates meet: Joshua to confirm each.) */
  readonly bareSkin: ReadonlyArray<'belly' | 'cleavage' | 'thighs' | 'lowerFace'>;
}

export interface HeroineLook {
  readonly id: string;
  readonly name: string;
  /** Her picture in a sentence. */
  readonly summary: string;
  readonly palette: Palette;
  readonly rigid: RigidLook;
  readonly skinPlates: readonly SkinPlateLook[];
  readonly underSuit: UnderSuitLook;
}

// ----------------------------------------------------------------------------
// Regions several heroines share (heights in metres on the 1.70 m rest body)
// ----------------------------------------------------------------------------

// (Plates must not OVERLAP: two sheets of her skin a few millimetres apart would show through each other. These
// regions are laid out to meet edge to edge: hips up to 0.862, belly 0.868-1.212, chest from 1.217, thighs from 0.79 down.)
/** The dome of her belly, from under her bust to her lap. */
const BELLY: SkinRegion = { shape: 'oval', face: 'front', centre: [0, 1.04], radii: [0.185, 0.172] };
/** Her chest: a broad plate over her bust. */
const CHEST: SkinRegion = { shape: 'oval', face: 'front', centre: [0, 1.305], radii: [0.19, 0.088], square: 3 };
/** A belt round her hips, under the belly. */
const HIP_BELT: SkinRegion = { shape: 'band', y: [0.795, 0.862] };
const thigh = (side: 'L' | 'R', along: readonly [number, number], arc?: readonly [number, number]): SkinRegion => ({ shape: 'limb', limb: `thigh${side}`, along, arc });
const upperArm = (side: 'L' | 'R', along: readonly [number, number], arc?: readonly [number, number]): SkinRegion => ({ shape: 'limb', limb: `upperArm${side}`, along, arc });

// ----------------------------------------------------------------------------
// The six heroines
// ----------------------------------------------------------------------------

const BLAZE: HeroineLook = {
  id: 'blaze', name: 'Blaze',
  summary: 'Magenta and silver. Blue wrap-round visor, big rounded shoulder pads, a holster on her right thigh, two long black blasters.',
  palette: { primary: 0xe0187a, secondary: 0xcfc9d2, accent: 0xff6fb4, dark: 0x17161c, glow: 0x7c4dff, visor: 0x2438d8, underSuit: 0x141318, underSuitTrim: 0xe0187a },
  rigid: {
    helmet: { visor: 'band', crest: 'twin', ears: 'disc', cheeks: true, paint: { accent: 'secondary' } },
    shoulderL: { style: 'round', size: 1.22, paint: { second: 'accent' } },
    shoulderR: { style: 'round', size: 1.22, paint: { second: 'accent' } },
    forearmL: { style: 'gauntlet', paint: { accent: 'secondary' } },
    forearmR: { style: 'gauntlet', paint: { accent: 'secondary' } },
    kneeL: { style: 'shield' }, kneeR: { style: 'shield' },
    shinL: { style: 'smooth', paint: { main: 'secondary', second: 'primary' } },
    shinR: { style: 'smooth', paint: { main: 'secondary', second: 'primary' } },
    bootL: { style: 'block', strap: true, paint: { second: 0xb81264, accent: 'primary' } },
    bootR: { style: 'block', strap: true, paint: { second: 0xb81264, accent: 'primary' } },
    hipL: null, hipR: null,
    thighL: null, thighR: { light: true, paint: { main: 0x1c1b22, accent: 0x34323c } },
    gunL: { design: 'longBlaster', paint: { main: 0x1b1b22, second: 0x2a2933, accent: 'primary' } },
    gunR: { design: 'longBlaster', paint: { main: 0x1b1b22, second: 0x2a2933, accent: 'primary' } },
  },
  skinPlates: [
    { id: 'chest', regions: [{ shape: 'oval', face: 'front', centre: [0, 1.285], radii: [0.18, 0.066], square: 3 }], thickness: 0.008, colour: 'dark', rim: 'primary', note: 'A black bra-shaped chest plate edged in magenta, straps up to a collar.' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.008, colour: 'dark', rim: 'secondary', note: 'Black briefs with silver hip plates, slung under the belly.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.9], [-50, 160])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'Magenta and silver thigh armor, front and outer side.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.9], [-50, 160])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'The same on her right thigh.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'upper arms and hands', colour: 'underSuit', note: 'ribbed black sleeves and gloves' }, { area: 'inner thighs and backs of knees', colour: 'underSuit' }], bareSkin: ['belly', 'cleavage', 'lowerFace'] },
};

const CORAL: HeroineLook = {
  id: 'coral', name: 'Coral',
  summary: 'Pink and dark teal. Smooth pink full-face helmet, ONE shoulder pad (her left), slim arm guards, teal leg armor, two blocky red blasters.',
  palette: { primary: 0xf0508e, secondary: 0x1d474c, accent: 0xf3aebe, dark: 0x10191b, glow: 0xffd23a, visor: 0x8a1c34, underSuit: 0xe9b3be, underSuitTrim: 0x1d474c },
  rigid: {
    helmet: { visor: 'full', crest: 'none', ears: 'ring', cheeks: false, paint: { accent: 0x2a3033 } },
    shoulderL: { style: 'angular', size: 1.0, paint: { second: 'accent' } },
    shoulderR: null,
    forearmL: { style: 'sleek', paint: { main: 'accent', second: 'secondary' } },
    forearmR: { style: 'sleek', paint: { main: 'accent', second: 'secondary' } },
    kneeL: { style: 'shield', paint: { main: 'secondary', second: 0xa9b0ad } },
    kneeR: { style: 'shield', paint: { main: 'secondary', second: 0xa9b0ad } },
    shinL: { style: 'faceted', paint: { main: 'secondary', second: 0x2a5d63 } },
    shinR: { style: 'faceted', paint: { main: 'secondary', second: 0x2a5d63 } },
    bootL: { style: 'block', strap: true, paint: { main: 'secondary', second: 0x163a3e, accent: 0x163a3e } },
    bootR: { style: 'block', strap: true, paint: { main: 'secondary', second: 0x163a3e, accent: 0x163a3e } },
    hipL: { style: 'pouches', paint: { main: 'secondary', second: 0xa9b0ad, accent: 'glow' } },
    hipR: { style: 'pouches', paint: { main: 'secondary', second: 0xa9b0ad, accent: 'glow' } },
    thighL: null, thighR: null,
    gunL: { design: 'blockBlaster', paint: { main: 0xf0203f, accent: 0xf0203f } },
    gunR: { design: 'blockBlaster', paint: { main: 0xf0203f, accent: 0xf0203f } },
  },
  skinPlates: [
    { id: 'chest', regions: [CHEST, { shape: 'band', y: [1.19, 1.25] }], thickness: 0.009, colour: 'secondary', rim: 'primary', note: 'A dark teal chest piece with pink flashes and yellow studs, wrapping to her sides.' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.008, colour: 'secondary', rim: 'accent', note: 'A dark belt and briefs under the belly.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.95], [40, 200])], thickness: 0.007, colour: 'secondary', rim: 'primary', note: 'A teal panel down the outer thigh edged with a red-pink line.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.95], [40, 200])], thickness: 0.007, colour: 'secondary', rim: 'primary', note: 'The same on her right thigh.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'belly', colour: 'underSuit', region: BELLY, note: 'the pale pink suit covers her belly' }, { area: 'hands', colour: 'primary' }, { area: 'inner legs', colour: 'underSuit' }], bareSkin: [] },
};

const VELA: HeroineLook = {
  id: 'vela', name: 'Vela',
  summary: 'Red and black. Angular black visor under a silver brow, red wrist cuffs, big red knee blocks with glowing panels, tall black boots with red heels, slim black pistols.',
  palette: { primary: 0xe8222c, secondary: 0x2b2d34, accent: 0x9aa1a9, dark: 0x101114, glow: 0xc4f7ff, visor: 0x15161c, underSuit: 0x18191d, underSuitTrim: 0xe8222c },
  rigid: {
    helmet: { visor: 'vee', crest: 'stripe', ears: 'ring', cheeks: false, paint: { accent: 'accent' } },
    shoulderL: { style: 'angular', size: 0.85, paint: { second: 'accent' } },
    shoulderR: { style: 'angular', size: 0.85, paint: { second: 'accent' } },
    forearmL: { style: 'cuff' }, forearmR: { style: 'cuff' },
    kneeL: { style: 'block', light: 'panel', paint: { second: 0xb5151e } },
    kneeR: { style: 'block', light: 'panel', paint: { second: 0xb5151e } },
    shinL: { style: 'smooth', disc: true, paint: { main: 'secondary', second: 0x1a1b20, accent: 'primary' } },
    shinR: { style: 'smooth', disc: true, paint: { main: 'secondary', second: 0x1a1b20, accent: 'primary' } },
    bootL: { style: 'block', disc: true, paint: { main: 0x1a1b20, second: 'primary', accent: 'primary' } },
    bootR: { style: 'block', disc: true, paint: { main: 0x1a1b20, second: 'primary', accent: 'primary' } },
    hipL: null,
    hipR: { style: 'disc', strap: true, paint: { main: 'secondary', second: 0x1a1b20, accent: 'primary' } },
    thighL: null, thighR: null,
    gunL: { design: 'slimPistol', paint: { main: 0x17181c, accent: 'primary' } },
    gunR: { design: 'slimPistol', paint: { main: 0x17181c, accent: 'primary' } },
  },
  skinPlates: [
    { id: 'chest', regions: [CHEST], thickness: 0.009, colour: 'secondary', rim: 'primary', note: 'A glossy charcoal breastplate with red shoulder flashes.' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.008, colour: 'secondary', rim: 'primary', note: 'Black briefs edged with a red line that runs under the belly.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.92], [45, 150])], thickness: 0.009, colour: 'primary', rim: 'dark', note: 'A long red plate down the outer thigh.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.92], [45, 150])], thickness: 0.009, colour: 'primary', rim: 'dark', note: 'The same on her right thigh.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'arms and hands', colour: 'underSuit', note: 'long black sleeves and gloves' }, { area: 'legs', colour: 'underSuit' }], bareSkin: ['belly', 'thighs', 'lowerFace'] },
};

const NOVA: HeroineLook = {
  id: 'nova', name: 'Nova',
  summary: 'Hot pink and white. White-faced helmet with pink sides and big pink ear discs, a dark belt with yellow light stripes, pink and white leg armor, two heavy black cannons.',
  palette: { primary: 0xf02e8e, secondary: 0xf1eff2, accent: 0xffe04a, dark: 0x17171b, glow: 0xffd21e, visor: 0x1f5c36, underSuit: 0x1b1a1f, underSuitTrim: 0xf02e8e },
  rigid: {
    helmet: { visor: 'full', crest: 'none', ears: 'disc', cheeks: true, paint: { main: 'secondary', second: 'primary', accent: 'primary' } },
    shoulderL: { style: 'angular', size: 0.95 }, shoulderR: { style: 'angular', size: 0.95 },
    forearmL: { style: 'gauntlet', paint: { accent: 'secondary' } },
    forearmR: { style: 'gauntlet', paint: { accent: 'secondary' } },
    kneeL: { style: 'block', light: 'none' }, kneeR: { style: 'block', light: 'none' },
    shinL: { style: 'faceted', light: true, paint: { glow: 0xff9a1e } },
    shinR: { style: 'faceted', light: true, paint: { glow: 0xff9a1e } },
    bootL: { style: 'block', paint: { second: 'primary', accent: 'primary' } },
    bootR: { style: 'block', paint: { second: 'primary', accent: 'primary' } },
    hipL: { style: 'beltBox', paint: { main: 0x202024, accent: 'primary' } },
    hipR: { style: 'beltBox', paint: { main: 0x202024, accent: 'primary' } },
    thighL: null, thighR: null,
    gunL: { design: 'cannon', paint: { main: 0x1a1a1f, second: 0x26262c, accent: 'primary', glow: 'primary' } },
    gunR: { design: 'cannon', paint: { main: 0x1a1a1f, second: 0x26262c, accent: 'primary', glow: 'primary' } },
  },
  skinPlates: [
    { id: 'chest', regions: [{ shape: 'oval', face: 'front', centre: [0, 1.285], radii: [0.18, 0.066], square: 3 }], thickness: 0.008, colour: 'dark', rim: 'primary', note: 'A black bra-shaped plate under a pink and white collar yoke (the black band beneath it is left to the under-suit).' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.009, colour: 'dark', rim: 'accent', note: 'The dark belt with yellow stripes, and a pink and white lap plate.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.92], [-60, 170])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'Pink and white thigh armor, front and outer side.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.92], [-60, 170])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'The same on her right thigh.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'hands', colour: 'primary' }, { area: 'upper arms', colour: 'underSuit' }, { area: 'inner thighs', colour: 'underSuit' }], bareSkin: ['belly', 'cleavage'] },
};

const TESSA: HeroineLook = {
  id: 'tessa', name: 'Tessa',
  summary: 'Yellow, pink and white. White helmet with a yellow crest, layered shoulders (a big one on her right), a PINK BELLY SHELL, salmon leg armor, a hose gun fed from a reel on her right hip.',
  palette: { primary: 0xf6c41c, secondary: 0xf0457a, accent: 0xf2f0ea, dark: 0x17171b, glow: 0x3cf0c8, visor: 0x1c50b4, underSuit: 0x19191d, underSuitTrim: 0xf6c41c },
  rigid: {
    helmet: { visor: 'full', crest: 'stripe', ears: 'disc', cheeks: false, paint: { main: 'accent', second: 'secondary', accent: 'primary' } },
    shoulderL: { style: 'layered', size: 0.85, paint: { main: 'primary', second: 'secondary', accent: 'accent' } },
    shoulderR: { style: 'layered', size: 1.3, paint: { main: 'primary', second: 'secondary', accent: 'accent' } },
    forearmL: { style: 'sleek', paint: { second: 'accent' } },
    forearmR: { style: 'sleek', paint: { second: 'accent' } },
    kneeL: { style: 'block', light: 'none', paint: { main: 0xf58a8c, second: 'secondary' } },
    kneeR: { style: 'block', light: 'none', paint: { main: 0xf58a8c, second: 'secondary' } },
    shinL: { style: 'smooth', paint: { main: 0xf58a8c, second: 0xf7a29c } },
    shinR: { style: 'smooth', paint: { main: 0xf58a8c, second: 0xf7a29c } },
    bootL: { style: 'slim', strap: true, paint: { main: 'secondary', second: 0x8d9198, accent: 0x202024 } },
    bootR: { style: 'slim', strap: true, paint: { main: 'secondary', second: 0x8d9198, accent: 0x202024 } },
    hipL: null,
    hipR: { style: 'reel', paint: { main: 0x2a2a30, accent: 'secondary' } },
    thighL: null, thighR: null,
    gunL: { design: 'smg', paint: { main: 0x1b1b20, second: 0x27272d, accent: 'secondary', glow: 0xff9a1e } },
    gunR: { design: 'hoseGun', paint: { main: 0x1b1b20, second: 0x27272d, accent: 'secondary' } },
  },
  skinPlates: [
    { id: 'bellyShell', regions: [BELLY], thickness: 0.012, colour: 'secondary', rim: 'primary', note: 'The glossy pink shell over her whole belly; it grows with her.' },
    { id: 'chest', regions: [CHEST], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'A yellow breastplate edged in pink.' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.008, colour: 'dark', rim: 'secondary', note: 'A black hip section with a pale lap plate under the shell.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.92], [-70, 180])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'Yellow thigh armor with a pink outer panel.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.92], [-70, 180])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'The same on her right thigh.' },
    { id: 'upperArmL', regions: [upperArm('L', [0.3, 0.9], [20, 160])], thickness: 0.007, colour: 'accent', note: 'White upper-arm plates.' },
    { id: 'upperArmR', regions: [upperArm('R', [0.3, 0.9], [20, 160])], thickness: 0.007, colour: 'accent', note: 'The same on her right arm.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'hands', colour: 'secondary', note: 'pink gloves with black backs' }, { area: 'waist and inner thighs', colour: 'underSuit' }], bareSkin: [] },
};

const AURORA: HeroineLook = {
  id: 'aurora', name: 'Aurora',
  summary: 'Orange and pink. Orange helmet with a face mask and a square brow panel, round orange shoulders, a PALE GREEN BELLY DOME, dark knee blocks with green lights, slim-heeled boots, black guns with green light strips.',
  palette: { primary: 0xf26f28, secondary: 0xf02a78, accent: 0xcfe9dd, dark: 0x1a1b1f, glow: 0x5cf03c, visor: 0x157c3e, underSuit: 0x1c1d21, underSuitTrim: 0xf02a78 },
  rigid: {
    helmet: { visor: 'mask', crest: 'block', ears: 'lens', cheeks: false, paint: { accent: 0xe8322c } },
    shoulderL: { style: 'round', size: 1.0, paint: { second: 0xf58a4a } },
    shoulderR: { style: 'round', size: 1.0, paint: { second: 0xf58a4a } },
    forearmL: { style: 'sleek', glowTip: true, paint: { second: 0xf58a4a } },
    forearmR: { style: 'sleek', glowTip: true, paint: { second: 0xf58a4a } },
    kneeL: { style: 'block', light: 'bars', paint: { main: 0x24262b, second: 'primary' } },
    kneeR: { style: 'block', light: 'bars', paint: { main: 0x24262b, second: 'primary' } },
    shinL: { style: 'smooth', disc: true, paint: { second: 0xf58a4a, accent: 'primary' } },
    shinR: { style: 'smooth', disc: true, paint: { second: 0xf58a4a, accent: 'primary' } },
    bootL: { style: 'slim', paint: { second: 'secondary', accent: 0x202226 } },
    bootR: { style: 'slim', paint: { second: 'secondary', accent: 0x202226 } },
    hipL: { style: 'pod', paint: { main: 'secondary', second: 'accent' } },
    hipR: null,
    thighL: null, thighR: null,
    gunL: { design: 'smg', paint: { main: 0x1b1c20, second: 0x28292e, accent: 'secondary' } },
    gunR: { design: 'smg', paint: { main: 0x1b1c20, second: 0x28292e, accent: 'secondary' } },
  },
  skinPlates: [
    { id: 'bellyShell', regions: [BELLY], thickness: 0.012, colour: 'accent', rim: 'primary', note: 'The pale green dome over her belly, in an orange frame; it grows with her.' },
    { id: 'chest', regions: [CHEST], thickness: 0.01, colour: 'primary', rim: 'secondary', note: 'An angular orange breastplate with a green chest light and a pink collar.' },
    { id: 'hips', regions: [HIP_BELT], thickness: 0.008, colour: 'dark', rim: 'primary', note: 'A dark belt with an orange and green lap plate.' },
    { id: 'thighL', regions: [thigh('L', [0.28, 0.92], [-40, 170])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'Orange thigh armor with a pink stripe on its front edge.' },
    { id: 'thighR', regions: [thigh('R', [0.28, 0.92], [-40, 170])], thickness: 0.009, colour: 'primary', rim: 'secondary', note: 'The same on her right thigh.' },
  ],
  underSuit: { base: 'underSuit', areas: [{ area: 'hands', colour: 'primary', note: 'orange fingers, black backs' }, { area: 'upper arms and waist', colour: 'underSuit' }], bareSkin: [] },
};

/** Every heroine's look, by id. */
export const HEROINE_LOOKS = { blaze: BLAZE, coral: CORAL, vela: VELA, nova: NOVA, tessa: TESSA, aurora: AURORA } as const satisfies Record<string, HeroineLook>;
export type HeroineId = keyof typeof HEROINE_LOOKS;
export const HEROINE_IDS = Object.keys(HEROINE_LOOKS) as HeroineId[];

/** Turn a colour reference into a hex number. */
export function colourOf(palette: Palette, ref: ColourRef): number {
  return typeof ref === 'number' ? ref : palette[ref];
}

/** The six colours a piece is built with: the palette's usual ones, with the piece's own `paint` laid over them. */
export function pieceColours(palette: Palette, paint?: PiecePaint): PieceColors {
  const pick = (part: keyof PieceColors, usual: keyof Palette) => colourOf(palette, paint?.[part] ?? usual);
  return { main: pick('main', 'primary'), second: pick('second', 'secondary'), accent: pick('accent', 'accent'), dark: pick('dark', 'dark'), glow: pick('glow', 'glow'), visor: pick('visor', 'visor') };
}
