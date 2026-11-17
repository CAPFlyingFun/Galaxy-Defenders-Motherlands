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
export type DetailChoice = 'auto' | Detail;
export type Sharpness = 1 | 2;
export type SkinChoice = 'light' | 'full';

export interface HeroineSettings {
  body: BodyMode;
  detail: DetailChoice;
  targetFps: TargetFps;
  sharpness: Sharpness;
  skin: SkinChoice;
}

/** The keys the choices are remembered under on this device. */
export const SETTING_KEYS = Object.freeze({
  body: 'gdm.body',
  detail: 'gdm.detail',
  targetFps: 'gdm.targetFps',
  sharpness: 'gdm.sharpness',
  skin: 'gdm.skin',
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
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? nearestDetail(n) : null;
};
const asFps = (text: string | null): TargetFps | null => {
  const n = Number(text);
  return (TARGET_FPS as readonly number[]).includes(n) ? (n as TargetFps) : null;
};
const asSharpness = (text: string | null): Sharpness | null => (text === '1' ? 1 : text === '2' ? 2 : null);
const asSkin = (text: string | null): SkinChoice | null => (text === 'light' || text === 'full' ? text : null);

/** The settings in force: what the address says, else what is remembered, else the defaults. */
export function loadHeroineSettings(address: URLSearchParams = new URLSearchParams(location.search)): HeroineSettings {
  const asked = address.get('heroine');
  const body: BodyMode = asked === 'fast' ? 'performance' : asked === 'room' ? 'visual' : read(SETTING_KEYS.body) === 'visual' ? 'visual' : 'performance';
  return {
    body,
    detail: asDetail(address.get('detail')) ?? asDetail(read(SETTING_KEYS.detail)) ?? 100,   // (100 %: as Joshua ran the DEV Room with one person; Auto is still in Settings)
    targetFps: asFps(address.get('fps')) ?? asFps(read(SETTING_KEYS.targetFps)) ?? 30,
    sharpness: asSharpness(address.get('sharp')) ?? asSharpness(read(SETTING_KEYS.sharpness)) ?? 2,
    skin: asSkin(address.get('body')) ?? asSkin(read(SETTING_KEYS.skin)) ?? deviceSkin(),
  };
}
