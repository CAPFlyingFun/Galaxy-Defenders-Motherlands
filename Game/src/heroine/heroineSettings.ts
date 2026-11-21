// ============================================================================
// heroineSettings.ts -- the player's choices about how the heroine is drawn,
// remembered on this device (the rows under "Body" in the Settings panel).
//
//   Body         Performance  the fast heroine (src/heroine/fast/): the default
//                Visual       the Character Builder's own room, hosted out of sight (builderHeroine.ts)
//   Detail       Auto, or a fixed 100 / 50 / 25 / 10 / 5 / 3 / 2 / 1 %   (Performance body)
//   Target FPS   30 / 45 / 60: the frame rate Auto detail holds          (Performance body)
//   Sharpness    2x / 1x: the most screen pixels drawn for each CSS pixel (both bodies)
//   Skin         Light / Full: the builder's light or full skin           (Visual body; the builder's own
//                             setting, Char_B/src/sarahlab/graphicsSettings.ts and skinChoice.ts)
//
// This is the "hybrid of both methods" Joshua asked for (2026-11-17): the DEV
// Room's way of drawing her and the Character Builder's own, one switch apart.
//
// WHERE THEY ARE KEPT: localStorage, one key each (below), like the game's
// other settings. THE ADDRESS WINS over what is remembered, for testing:
//   ?heroine=fast | room | standin     ?detail=auto | 100 ... 1     ?fps=30 | 45 | 60
//   ?sharp=1 | 2                       ?body=light | full           ?look=blazeSuit | blaze
// ============================================================================
import { wearsLightSkin } from '@charb/sarahlab/skinChoice';
import { TARGET_FPS, type TargetFps } from './fast/autoDetail';
import { nearestDetail, type Detail } from './fast/detailLevels';

export type BodyMode = 'performance' | 'visual';
export type DetailChoice = 'autoLive' | 'auto' | Detail;
export type Sharpness = 1 | 2;
export type SkinChoice = 'light' | 'full';
export type ShadowChoice = 'on' | 'off';
/** Which map she is on: the real island (the main game), or the domed town (kept to test in until its place is chosen). */
export type MapChoice = 'island' | 'town';

/** Settings -> WORLD -> Landscaping (src/world/island/treeObjects.ts). */
export type LandscapingChoice = 'images' | 'hybrid' | 'objects' | 'off';
export const LANDSCAPING_CHOICES: readonly (readonly [string, LandscapingChoice])[] = [
  ['Images only', 'images'], ['Hybrid', 'hybrid'], ['Objects only', 'objects'], ['Off', 'off'],
];
function asLandscaping(v: string | null): LandscapingChoice {
  return v === 'images' || v === 'objects' || v === 'off' ? v : 'hybrid';
}

export interface HeroineSettings {
  body: BodyMode;
  detail: DetailChoice;
  targetFps: TargetFps;
  sharpness: Sharpness;
  skin: SkinChoice;
  /** Real shadows: she casts her own shadow on the plaza (the DEV Room's "Shadows: on"). */
  shadows: ShadowChoice;
  /** The live body: her baby, womb, organs and the rest kept and run but not drawn (fast/liveBody.ts). */
  liveBody: ShadowChoice;
  /**
   * THE CAMERA (Joshua, 2026-11-17: "adjust the default zoom for 3rd person as well as FOV for both... 50-120°"):
   * each view's field of view, degrees (FOV_RANGE), and how far out the third-person camera starts, 0 (closest) to 1
   * (furthest). A pinch still zooms in play; this is where it starts.
   */
  fovThird: number;
  fovFirst: number;
  /**
   * THE FIRST-PERSON CAMERA'S OFFSET from her eyes, centimetres (Joshua, 2026-11-20: "add an offset forward/back...
   * slider and I can adjust in the game and then share the exact offset"; "Camera seems too low"): forward (+) or back
   * along her face (EYE_RANGE), and up (+) or down along her head's own up (EYE_HEIGHT_RANGE).
   */
  eyeForward: number;
  eyeHigher: number;
  /**
   * SENSITIVITY (Joshua, 2026-11-21: "lower the camera sensitivity (ahh, make movement and camera sensitivity adjustable
   * in settings)... then I can tweak both how I like it"), percent: CAMERA how far a drag or the camera stick turns the
   * view (SENSITIVITY_RANGE; 100 is the old speed, the start is lower, `SENSITIVITY_START`), MOVE how far the MOVE stick
   * has to be pushed: above 100 her rings (walk, jog, run, sprint) come with less of a push, below it with more.
   */
  lookSensitivity: number;
  moveSensitivity: number;
  zoomThird: number;
  /** The weapon table's height, metres (Joshua, 2026-11-17: "how can you adjust the table height"): TABLE_RANGE. */
  tableHeight: number;
  /** THIRD PERSON: she fires on her own at the target she is aimed at (Joshua, 2026-11-17). */
  autoFire: ShadowChoice;
  /**
   * HER OUTFIT, for testing (Joshua, 2026-11-19: "save the outfits as we make them accessible from settings to switch
   * for now for testing, and later in the game will be specific"): the name of one of the saved looks (heroine/looks).
   * The address's ?look= still wins. Changing it reloads the game.
   */
  outfit: string;
  /**
   * THE CATSUIT'S STYLE (Joshua, 2026-11-20: "Make sure all outfits have the same style per color"): every catsuit
   * colour comes in the same three, and this picks which: the keyhole, the low neck or the high neck (`outfitLook`).
   */
  catsuitNeck: CatsuitNeck;
  /**
   * THE MAP (Joshua, 2026-11-19): the real island from Beyond Extinction (src/world/island/), or the domed town, kept as
   * a test map until its place on the island is chosen. The address's ?map= still wins. Changing it reloads the game.
   */
  map: MapChoice;
  /**
   * LANDSCAPING (Joshua, 2026-11-20: "three modes under a new landscaping: Only Image Landscaping / Hybrid - Image +
   * Objects / Only Objects"; src/world/island/treeObjects.ts): Images only (Beyond Extinction's photo trees), Hybrid
   * (the default: real 3D trees near the camera, photos beyond), Objects only (3D trees to 280 m), or Off. Live.
   */
  landscaping: LandscapingChoice;
  /**
   * HER PREGNANCY, to test (Joshua, 2026-11-19: "a toggle pregnancy on/off as well as a full range belly slider from
   * 0-200%, but only 10-150% is the default range with unlock available... like the CCBS"; heroine/pregnancyPlan.ts).
   * `pregnant`: on or off (null: as her look says). `belly`: her belly, percent (null: her look's own). `bellyUnlocked`:
   * the slider shows its whole 0-200% range instead of 10-150%. All three take hold at once.
   */
  pregnant: ShadowChoice | null;
  belly: number | null;
  bellyUnlocked: boolean;
  /**
   * HER FACE, BUST AND BELLY KEPT SHARP at every detail level (Joshua, 2026-11-19; fast/detailLevels.ts sharpParts):
   * the rest of her is lightened, these never are. Changing it reloads the game.
   */
  sharpParts: ShadowChoice;
  /**
   * THE CATSUIT'S FABRIC (Joshua, 2026-11-19): 'weave' his woven mesh photo, 'mesh' the perforated mesh drawn by code
   * (fast/outfitMaterial.ts SUIT_KNITS). Only looks that wear a live knit (Look 1) show it. Changing it reloads.
   */
  suitKnit: 'weave' | 'mesh';
  /** HER HAIR AS STRANDS AND LOCKS (Joshua, 2026-11-19; fast/hairStrands.ts). Changing it reloads. */
  hairStrands: ShadowChoice;
  /** HER SKIN'S DEPTH, the builder's hybrid (Joshua, 2026-11-19; fast/skinTexture.ts). On unless turned off. Reloads. */
  skinTexture: ShadowChoice;
  /** The small loose locks by her face: 'off' eased off her cheeks (Joshua, 2026-11-19), 'on' as the file has them. Reloads. */
  faceLocks: ShadowChoice;
  /** HER SKIN'S SHINE, 0 dry .. 25 natural (Joshua's pick, the default) .. 100 oily (fast/skinShine.ts). Takes hold at once. */
  skinShine: number;
  /** HER BODY'S CLOCK: game hours per real hour for her stomach and gut (Joshua, 2026-11-19, to test). Takes hold at once. */
  bodyClock: number;
  /**
   * HER VITALS CARD'S LAYOUT (Joshua, 2026-11-21: "create two layouts to choose from"; "Layout B as default"): 'list' a
   * clean two-column list of icon, number and name; 'gauges' round and hexagon gauges (vitals/vitalsPanel.ts). Live.
   */
  vitalsStyle: 'list' | 'gauges';
  /** Units for her speed and temperature (Joshua: "Both, with imperial and metric units in settings"). Live. */
  units: 'imperial' | 'metric' | 'both';
}


/** The heights the weapon table may be set to, metres, and its own (src/world/weaponTable.ts TABLE.height). */
export const TABLE_RANGE = Object.freeze({ least: 0.05, most: 1.1, start: 0.78 });

/** The field of view a player may choose, degrees, and each view's own to begin with (the game's view before). */
export const FOV_RANGE = Object.freeze({ least: 50, most: 120, third: 58, first: 58 });
/** The first-person camera's offset from her eyes, centimetres: back (-) to forward (+), and down (-) to up (+). */
export const EYE_RANGE = Object.freeze({ least: -6, most: 12 });
export const EYE_HEIGHT_RANGE = Object.freeze({ least: -6, most: 20 });
/** The sensitivity sliders' range, percent, and where each starts (camera lowered: Joshua, "lower the camera sensitivity"). */
export const SENSITIVITY_RANGE = Object.freeze({ least: 20, most: 200 });
export const SENSITIVITY_START = Object.freeze({ look: 60, move: 100 });
/** Where the third-person zoom begins unless the player chose (the camera's own start before). */
export const ZOOM_START_DEFAULT = 0.17;

/** The keys the choices are remembered under on this device. */
/**
 * THE OUTFITS in Settings (what is shown, and the look's name in heroine/looks). Joshua, 2026-11-19: later the game
 * picks one for the place and the story (the field two-piece for hot weather and action outdoors, the formal suits for
 * the command centre); for now any can be chosen to test. The first is the game's own.
 */
export const OUTFIT_CHOICES: readonly (readonly [string, string])[] = Object.freeze([
  ['Pink & black two-piece', 'blazeSuit'],
  ['Shadow Operative catsuit', 'shadowSuit'],
  ['Anime Space Heroine', 'spaceHeroine'],
  // (the catsuits: each colour in the style chosen under Catsuit style)
  ['Bronze catsuit', 'bronzeSuit'],
  ['Gold catsuit', 'catsuitGold'],
  ['Black catsuit', 'catsuitBlack'],
  ['Silver catsuit', 'catsuitSilver'],
  ['Black & gold catsuit', 'catsuitBlackGold'],
  ['Gold & black catsuit', 'catsuitGoldBlack'],
  ['Black & silver catsuit', 'catsuitBlackSilver'],
  ['Plain black catsuit (Joshua\'s export)', 'blazeCatsuit'],
  ['Gray & red suit', 'graySuit'],
  ['All pink (Joshua\'s export)', 'blazePink'],
] as const);

/** THE CATSUIT STYLES (Settings -> HEROINE -> Catsuit style): what is shown, and the style's name. */
export type CatsuitNeck = 'keyhole' | 'low' | 'high';
export const CATSUIT_NECKS: readonly (readonly [string, CatsuitNeck])[] = Object.freeze([
  ['Keyhole & turtleneck', 'keyhole'], ['Low neck', 'low'], ['High neck', 'high'],
] as const);
const asCatsuitNeck = (text: string | null): CatsuitNeck => (text === 'low' || text === 'high' ? text : 'keyhole');
/** The catsuit outfits that come in the three styles (each a look of that name, the keyhole, plus `Low` and `High`). */
const CATSUIT_FAMILIES = ['bronzeSuit', 'catsuitGold', 'catsuitBlack', 'catsuitSilver', 'catsuitBlackGold', 'catsuitGoldBlack', 'catsuitBlackSilver'];
/**
 * THE LOOK TO WEAR for an outfit and the catsuit style: a catsuit's look in that style (bronzeSuit + low ->
 * bronzeSuitLow); any other outfit (or a catsuit already named in its style) as it is.
 */
export function outfitLook(outfit: string, neck: CatsuitNeck): string {
  if (!CATSUIT_FAMILIES.includes(outfit)) return outfit;
  return outfit + (neck === 'low' ? 'Low' : neck === 'high' ? 'High' : '');
}

/**
 * Where the Skin shine slider reads NATURAL, as she was (Joshua, 2026-11-19: "I would set 25 as normal"): below it drier,
 * above it oilier; it is where the slider starts.
 */
export const SKIN_SHINE_NATURAL = 25;
/** The slider (0..100) as her skin's shine for the shader: -1 dry .. 0 natural .. +1 oily. */
export const skinOilyOf = (v: number): number => (v < SKIN_SHINE_NATURAL ? (v - SKIN_SHINE_NATURAL) / SKIN_SHINE_NATURAL : (v - SKIN_SHINE_NATURAL) / (100 - SKIN_SHINE_NATURAL));

export const SETTING_KEYS = Object.freeze({
  body: 'gdm.body',
  detail: 'gdm.detail',
  targetFps: 'gdm.targetFps',
  sharpness: 'gdm.sharpness',
  skin: 'gdm.skin',
  shadows: 'gdm.shadows',
  liveBody: 'gdm.liveBody',
  fovThird: 'gdm.fovThird',
  fovFirst: 'gdm.fovFirst',
  eyeForward: 'gdm.eyeAhead',
  eyeHigher: 'gdm.eyeHigher',
  lookSensitivity: 'gdm.lookSensitivity',
  moveSensitivity: 'gdm.moveSensitivity',
  zoomThird: 'gdm.zoomThird',
  tableHeight: 'gdm.tableHeight',
  // (a new name for it, 2026-11-18: everyone starts in MANUAL once, whatever they had chosen: Joshua, "Start manual")
  autoFire: 'gdm.autoFire2',
  outfit: 'gdm.outfit',
  catsuitNeck: 'gdm.catsuitNeck',
  map: 'gdm.map',
  landscaping: 'gdm.landscaping',
  pregnant: 'gdm.pregnant',
  belly: 'gdm.belly',
  bellyUnlocked: 'gdm.bellyUnlocked',
  sharpParts: 'gdm.sharpParts',
  suitKnit: 'gdm.suitKnit',
  hairStrands: 'gdm.hairStrands',
  // (a new name: on for everyone once, now that it is the builder's hybrid and not an experiment)
  skinTexture: 'gdm.skinDepth',
  faceLocks: 'gdm.faceLocks',
  skinShine: 'gdm.skinShine',
  bodyClock: 'gdm.bodyClock',
  vitalsStyle: 'gdm.vitalsStyle',
  units: 'gdm.units',
});

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; } // (private browsing may refuse: the default is used)
}

/** Remember one choice. Not being able to is never worth stopping the game for. */
export function saveSetting<K extends keyof HeroineSettings>(key: K, value: HeroineSettings[K]): void {
  try { localStorage.setItem(SETTING_KEYS[key], String(value)); } catch { /* cannot remember it */ }
}

/** The skin the builder itself would choose for this device: light on a phone, a tablet or a small screen. */
function deviceSkin(): SkinChoice {
  const media = (query: string): boolean => { try { return matchMedia(query).matches; } catch { return false; } };
  return wearsLightSkin({
    asked: null, measuring: false,
    coarse: media('(pointer: coarse)'), fine: media('(any-pointer: fine)'),
    width: screen.width, height: screen.height, ratio: window.devicePixelRatio || 1,
  }) ? 'light' : 'full';
}

const asDetail = (text: string | null): DetailChoice | null => {
  if (text === null || text === '') return null;
  if (text === 'auto') return 'auto';
  if (text.toLowerCase() === 'autolive') return 'autoLive';
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? nearestDetail(n) : null;
};
const asFps = (text: string | null): TargetFps | null => {
  const n = Number(text);
  return (TARGET_FPS as readonly number[]).includes(n) ? (n as TargetFps) : null;
};
const asSharpness = (text: string | null): Sharpness | null => (text === '1' ? 1 : text === '2' ? 2 : null);
const asSkin = (text: string | null): SkinChoice | null => (text === 'light' || text === 'full' ? text : null);
/** A number within [least, most], or null. */
const asNumber = (text: string | null, least: number, most: number): number | null => {
  if (text === null || text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(least, Math.min(most, n)) : null;
};

/** The settings in force: what the address says, else what is remembered, else the defaults. */
export function loadHeroineSettings(address: URLSearchParams = new URLSearchParams(location.search)): HeroineSettings {
  const asked = address.get('heroine');
  const body: BodyMode = asked === 'fast' ? 'performance' : asked === 'room' ? 'visual' : read(SETTING_KEYS.body) === 'visual' ? 'visual' : 'performance';
  // (PERFORMANCE IS THE DEFAULT, on the DEV Room's own settings: Joshua's settings picture of 2026-11-17, "use these
  // same settings... but no fading". Visual, the builder's own room, is a choice in Settings.)
  return {
    body,
    detail: asDetail(address.get('detail')) ?? asDetail(read(SETTING_KEYS.detail)) ?? 'autoLive',   // (the DEV Room's own setting: Joshua's settings picture, 2026-11-17)
    targetFps: asFps(address.get('fps')) ?? asFps(read(SETTING_KEYS.targetFps)) ?? 30,
    sharpness: asSharpness(address.get('sharp')) ?? asSharpness(read(SETTING_KEYS.sharpness)) ?? 2,
    skin: asSkin(address.get('body')) ?? asSkin(read(SETTING_KEYS.skin)) ?? deviceSkin(),
    shadows: (address.get('shadows') ?? read(SETTING_KEYS.shadows)) === 'off' ? 'off' : 'on',
    liveBody: (address.get('live') ?? read(SETTING_KEYS.liveBody)) === 'off' ? 'off' : 'on',
    fovThird: asNumber(read(SETTING_KEYS.fovThird), FOV_RANGE.least, FOV_RANGE.most) ?? FOV_RANGE.third,
    fovFirst: asNumber(read(SETTING_KEYS.fovFirst), FOV_RANGE.least, FOV_RANGE.most) ?? FOV_RANGE.first,
    eyeForward: asNumber(address.get('eye') ?? read(SETTING_KEYS.eyeForward), EYE_RANGE.least, EYE_RANGE.most) ?? 0,
    eyeHigher: asNumber(address.get('eye_up') ?? read(SETTING_KEYS.eyeHigher), EYE_HEIGHT_RANGE.least, EYE_HEIGHT_RANGE.most) ?? 0,
    lookSensitivity: asNumber(read(SETTING_KEYS.lookSensitivity), SENSITIVITY_RANGE.least, SENSITIVITY_RANGE.most) ?? SENSITIVITY_START.look,
    moveSensitivity: asNumber(read(SETTING_KEYS.moveSensitivity), SENSITIVITY_RANGE.least, SENSITIVITY_RANGE.most) ?? SENSITIVITY_START.move,
    // (down to the closest zoom, 0.8 m since 2026-11-21: a saved zoom closer than -0.1 was thrown away for the start)
    zoomThird: asNumber(read(SETTING_KEYS.zoomThird), -0.2, 1) ?? ZOOM_START_DEFAULT,
    tableHeight: asNumber(read(SETTING_KEYS.tableHeight), TABLE_RANGE.least, TABLE_RANGE.most) ?? TABLE_RANGE.start,
    // (MANUAL unless AUTO was chosen: Joshua, 2026-11-18, "add auto fire off by default for 1st and 3rd person")
    autoFire: read(SETTING_KEYS.autoFire) === 'on' ? 'on' : 'off',
    outfit: address.get('look') ?? read(SETTING_KEYS.outfit) ?? OUTFIT_CHOICES[0][1],
    catsuitNeck: asCatsuitNeck(address.get('neck') ?? read(SETTING_KEYS.catsuitNeck)),
    // (the island unless the town was chosen)
    map: (address.get('map') ?? read(SETTING_KEYS.map)) === 'town' ? 'town' : 'island',
    // (Hybrid unless another was chosen; v0.2.93's Trees off is kept as Off)
    landscaping: asLandscaping(address.get('land') ?? read(SETTING_KEYS.landscaping) ?? (read('gdm.trees') === 'off' || address.get('trees') === 'off' ? 'off' : null)),
    pregnant: ((v) => (v === 'on' || v === 'off' ? v : null))(address.get('pregnant') ?? read(SETTING_KEYS.pregnant)),
    belly: asNumber(address.get('belly') ?? read(SETTING_KEYS.belly), 0, 200),
    bellyUnlocked: read(SETTING_KEYS.bellyUnlocked) === 'true',
    sharpParts: (address.get('sharp_parts') ?? read(SETTING_KEYS.sharpParts)) === 'off' ? 'off' : 'on',
    // (his woven photo unless the drawn mesh was chosen)
    suitKnit: (address.get('knit') ?? read(SETTING_KEYS.suitKnit)) === 'mesh' ? 'mesh' : 'weave',
    hairStrands: (address.get('strands') ?? read(SETTING_KEYS.hairStrands)) === 'off' ? 'off' : 'on',
    skinTexture: (address.get('skin_texture') ?? read(SETTING_KEYS.skinTexture)) === 'off' ? 'off' : 'on',
    faceLocks: (address.get('face_locks') ?? read(SETTING_KEYS.faceLocks)) === 'on' ? 'on' : 'off',
    skinShine: asNumber(address.get('shine') ?? read(SETTING_KEYS.skinShine), 0, 100) ?? SKIN_SHINE_NATURAL,
    // (15: what the game has run at; Joshua's real-life plan is 6)
    bodyClock: asNumber(address.get('clock') ?? read(SETTING_KEYS.bodyClock), 1, 60) ?? 15,
    // (the list unless the gauges were chosen; both units unless one was)
    vitalsStyle: (address.get('vitals') ?? read(SETTING_KEYS.vitalsStyle)) === 'gauges' ? 'gauges' : 'list',
    units: ((v) => (v === 'imperial' || v === 'metric' ? v : 'both'))(address.get('units') ?? read(SETTING_KEYS.units)),
  };
}
