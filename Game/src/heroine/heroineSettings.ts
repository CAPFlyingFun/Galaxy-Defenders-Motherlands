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
   * TEMPORARY (Joshua, 2026-11-19: "a temporary texture stitch amount from 0.5-4x so I can adjust in the game in real
   * time to see, then I can share the number that looks the best"): the live knit's stitch size (KNIT_STITCH_RANGE).
   * Only an outfit with a live knit (looks/gear.ts) shows it. Changes her at once.
   */
  knitStitch: number;
}

/** The live knit's stitch, least and most (the builder's own range for a fabric's stitch is 0.5x to 4x). */
export const KNIT_STITCH_RANGE = Object.freeze({ least: 0.5, most: 4, start: 2 });

/** The heights the weapon table may be set to, metres, and its own (src/world/weaponTable.ts TABLE.height). */
export const TABLE_RANGE = Object.freeze({ least: 0.05, most: 1.1, start: 0.78 });

/** The field of view a player may choose, degrees, and each view's own to begin with (the game's view before). */
export const FOV_RANGE = Object.freeze({ least: 50, most: 120, third: 58, first: 58 });
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
  ['Plain black catsuit (Joshua\'s export)', 'blazeCatsuit'],
  ['Gray & red suit', 'graySuit'],
  ['All pink (Joshua\'s export)', 'blazePink'],
] as const);

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
  knitStitch: 'gdm.knitStitch',
  zoomThird: 'gdm.zoomThird',
  tableHeight: 'gdm.tableHeight',
  // (a new name for it, 2026-11-18: everyone starts in MANUAL once, whatever they had chosen: Joshua, "Start manual")
  autoFire: 'gdm.autoFire2',
  outfit: 'gdm.outfit',
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
    zoomThird: asNumber(read(SETTING_KEYS.zoomThird), -0.1, 1) ?? ZOOM_START_DEFAULT,
    tableHeight: asNumber(read(SETTING_KEYS.tableHeight), TABLE_RANGE.least, TABLE_RANGE.most) ?? TABLE_RANGE.start,
    // (MANUAL unless AUTO was chosen: Joshua, 2026-11-18, "add auto fire off by default for 1st and 3rd person")
    autoFire: read(SETTING_KEYS.autoFire) === 'on' ? 'on' : 'off',
    outfit: address.get('look') ?? read(SETTING_KEYS.outfit) ?? OUTFIT_CHOICES[0][1],
    knitStitch: asNumber(read(SETTING_KEYS.knitStitch), KNIT_STITCH_RANGE.least, KNIT_STITCH_RANGE.most) ?? KNIT_STITCH_RANGE.start,
  };
}
