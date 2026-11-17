// ============================================================================
// builderRoom.ts -- the Character Builder's own room, run out of sight.
//
// WHY IT IS DONE THIS WAY. The builder's body is not a model file with clothes
// on it. Her shape, her painted garments, her cloth tee, her hair, her face,
// her breathing and her belly's and bust's springs are all put together, and
// kept moving every frame, by ONE very large piece of the builder's code: its
// Character Room scene (Char_B/src/sarahlab/SarahLabScene.ts, about 11,000
// lines). Copying parts of that into the game would mean re-making it, and the
// copy would fall behind every time the builder is refreshed.
//
// So the game runs the WHOLE room, unchanged, with nothing of it on screen:
//   * its buttons and sliders are built into a <div> that is never shown;
//   * its own floor, lights and treadmill are taken out;
//   * what is left -- her, dressed -- is handed to the game to draw.
// The game then works her through the room's own controls (WALK, STAND, the
// BELLY slider, "load a saved character"), found by the names the builder
// itself exports, so a renamed control is a compile error here, not a
// heroine that quietly stops answering.
//
// UNITS AND SPACE. The builder works in centimetres (100 units a metre), with
// her feet at its own origin, facing +Z, and its cloth, springs and some of
// its shaders depend on that. So her objects STAY in the room's own scene,
// which is never put inside the game's scene; roomDraw.ts draws that scene
// into the game's picture where the game wants her.
// ============================================================================
import * as THREE from 'three';
import { buildSarahLabScene, type SarahLabHooks } from '@charb/sarahlab/SarahLabScene';
import { OUTFITS, SARAH_DEFAULT_OUTFIT, SARAH_LAB_ACTION, SARAH_LAB_FIELD, outfitNamed } from '@charb/sarahlab/sarahLabTool';
import { CHARACTER_ACTION } from '@charb/sarahlab/characterPanel';
import { OUTFIT_ACTION } from '@charb/sarahlab/outfitPanel';
import { sanitizeBook, type CharacterBook } from '@charb/sarahlab/characterSaves';
import { UNITS_PER_METRE } from '@charb/sarahlab/units';
import type { AppScene, RoomRenderer } from '@charb/app/Scene';
import type { HeroineLook } from './heroineLook';
import { PAINT_ATTRIBUTE } from '@charb/sarahlab/bodyPaint';
import { findPaintedSkin, finishMask, maskText, measureSkin, type MaskPainter } from './paintMask';

/** The builder's units in one metre (it draws her in centimetres). */
export const ROOM_UNITS = UNITS_PER_METRE;

/** How the cloth tee is put on her by the room: weightless, arms eased out and back, then let hang (its DRESS timings end at 4.3 s). */
const TEE_DRESS_SECONDS = 6;
/** The step the room is run at while she is being dressed out of sight (seconds). */
const HIDDEN_STEP = 1 / 30;
/** Give up on loading after this long (milliseconds): a file that never arrives must not hang the game for ever. */
const LOAD_TIMEOUT_MS = 180_000;

export interface BuilderRoomOptions {
  /** The game's renderer. The room compiles her materials with it; nothing is drawn by the room itself. */
  readonly renderer: THREE.WebGLRenderer;
  /** What she looks like (heroineLook.ts). */
  readonly look: HeroineLook;
  /**
   * One of the builder's own built-in outfits, by its name in the builder's OUTFIT list (for example
   * 'painted long-sleeve tee + leggings'). Only used when the look has no clothes of its own. Left out: the builder's
   * default outfit.
   */
  readonly outfit?: string;
  /** Her light skin (the same body, about a third fewer triangles): what the builder itself wears on a phone. */
  readonly lightSkin: boolean;
  /**
   * Called once with the room's (still empty) scene, before any of her is loaded: the moment to put the game's
   * lights into it, so her materials are compiled for those lights the first time.
   */
  readonly prepareScene?: (roomScene: THREE.Scene) => void;
  /** Told what the room is doing while it loads ("body", "outfit", "tee"...), for a loading screen. */
  readonly onProgress?: (stage: string) => void;
}

export interface BuilderRoom {
  /** The room's own scene: her body, hair and cloth, in ROOM units, her feet at its origin, facing +Z. Never add it to the game's scene. */
  readonly scene: THREE.Scene;
  /** Her model inside the room (the skinned body and its bones live under it). In ROOM units. */
  readonly model: THREE.Object3D;
  /** True when the outfit she wears has a cloth-simulated tee. */
  readonly clothTee: boolean;
  /**
   * Advance the room by `dt` seconds: her pose, springs, breathing, cloth. Afterwards every bone's world matrix is
   * up to date (in the room's space).
   */
  step(dt: number): void;
  /** Press one of the room's own buttons by its exported action name. False if the room has no such button. */
  press(action: string): boolean;
  /**
   * Move one of the room's own sliders, by the field name the builder exports for it (`SARAH_LAB_FIELD.bump` is her
   * BELLY, 0-200 %). False if the room has no such slider.
   */
  setSlider(field: string, value: number): boolean;
  /**
   * Paint the look's code-painted layers again, on her skin as it is shaped NOW (call it after her belly has
   * changed). Does nothing for a look without such layers.
   *
   * Why: a code-painted shape is measured on her skin as she is shaped when it is painted (paintMask.ts), and a
   * different belly slides the skin of her hips and upper thighs, which would leave small teeth in an edge there.
   * NOTE: this one step is the game's own and is NOT part of the builder's saved-character format. Her layer first
   * goes on through a saved character, the builder's own way; this refresh writes the same numbers straight into the
   * builder's paint on her skin (its `fabricPaint` values), the way the builder's own brush does.
   */
  repaintMasks(): void;
  /** Free everything the room made (GPU memory included). */
  dispose(): void;
}

/** Wait for the next animation frame, or 100 ms if the tab is hidden (a hidden tab gets no animation frames). */
function nextFrame(): Promise<void> {
  return new Promise((done) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 100);
  });
}

/**
 * Open the builder's room out of sight, dress her in `look`, and come back when she is fully dressed and settled.
 * Until this promise resolves nothing of her should be drawn.
 */
export async function openBuilderRoom(options: BuilderRoomOptions): Promise<BuilderRoom> {
  const say = (stage: string) => options.onProgress?.(stage);

  // ---- 1. What the room is given to work with ------------------------------------------------------------------
  // Its controls go into a <div> that is never added to the page: built, usable from code, never seen.
  const ui = document.createElement('div');

  // The room listens on its canvas for "the graphics were lost / given back" (a phone short of memory does that) and
  // then re-reads her pictures. It must not listen for touches on the GAME's canvas, so it is handed a stand-in
  // canvas, and the two graphics events alone are passed on from the real one.
  const realCanvas = options.renderer.domElement;
  const standInCanvas = document.createElement('canvas');
  const passOn = (event: Event) => { standInCanvas.dispatchEvent(new Event(event.type)); };
  realCanvas.addEventListener('webglcontextlost', passOn);
  realCanvas.addEventListener('webglcontextrestored', passOn);
  // The room sees the game's real renderer in every respect but one: `domElement` is the stand-in canvas.
  const gl = new Proxy(options.renderer, {
    get(target, key) {
      if (key === 'domElement') return standInCanvas;
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  const roomRenderer: RoomRenderer = {
    gl,
    // The room only ever asks for a draw after taking a picture of her for a save card, which the game never does.
    render: () => {},
    // A phone held upright: the room lays its (unseen) controls out for it.
    size: () => ({ width: 390, height: 844 }),
  };

  // ---- 2. Her look, as a saved character in the room's own book ------------------------------------------------
  // (through the builder's own `sanitizeBook`: the same door a file from its IMPORT button comes in by)
  let book: CharacterBook = sanitizeBook({ version: 1, characters: [{ ...options.look, savedAt: new Date(0).toISOString() }], outfits: [] });
  const saved = book.characters.find((c) => c.name === options.look.name);
  if (!saved) throw new Error(`[heroine] the Character Builder could not read the look "${options.look.name}"`);
  // Which outfit she will wear, to know whether a cloth tee has to be put on her before she is shown.
  const clothes = saved.clothes && 'outfit' in saved.clothes ? saved.clothes : null;
  const builtIn = !clothes && options.outfit ? outfitNamed(options.outfit) : -1;
  if (!clothes && options.outfit && builtIn < 0) throw new Error(`[heroine] the Character Builder has no outfit called "${options.outfit}"`);
  const outfitIndex = clothes ? outfitNamed(clothes.outfit) : builtIn >= 0 ? builtIn : SARAH_DEFAULT_OUTFIT;
  const clothTee = !!OUTFITS[outfitIndex >= 0 ? outfitIndex : SARAH_DEFAULT_OUTFIT]?.procedural;

  // ---- 3. The room itself --------------------------------------------------------------------------------------
  let releaseLoad: () => void = () => {};
  const beforeLoad = new Promise<void>((done) => { releaseLoad = done; });
  let readyCount = 0;
  const hooks: SarahLabHooks = {
    onBack: () => {},
    lightBody: options.lightSkin,
    // The book is kept in memory only: the game's heroine is never written into the player's own saved characters.
    characters: { read: () => book, write: (next) => { book = next; } },
    // Her files are not asked for until her look has been chosen (step 4), so she is never built as someone else first.
    beforeLoad,
    // The room calls this each time everything it was loading is in, compiled and drawn twice.
    onReady: () => { readyCount++; },
  };
  const scene: AppScene = buildSarahLabScene({ renderer: roomRenderer, uiLayer: ui }, hooks);

  // The room's own furniture (floor, ring, treadmill strip, stool, its four lights, helper drawings): everything that
  // is in its scene before she is. It is all taken out and parked in a group that is never drawn; the room may go on
  // switching those things on and off as it likes, to no effect. The GAME lights her.
  const parked = new THREE.Group();
  for (const thing of [...scene.three.children]) parked.add(thing);
  // (its dark studio background is its scene's own property and is never used: only the top scene's background is drawn)

  options.prepareScene?.(scene.three);

  scene.resize(390, 844);
  await scene.enter();

  /** Find one of the room's controls by the name the builder gives it. */
  const control = (selector: string): HTMLElement | null => ui.querySelector<HTMLElement>(selector);
  const press = (action: string): boolean => {
    const button = control(`[data-action="${CSS.escape(action)}"]`);
    if (!button) return false;
    button.click();
    return true;
  };

  // ---- 4. Put her look on BEFORE her files are fetched ---------------------------------------------------------
  // Pressing her save card is the builder's own "load this character": it sets her belly, her proportions, her head
  // and her clothes. The room is written to take a choice made "before she is in" and open with it.
  if (!press(CHARACTER_ACTION.load(options.look.name))) throw new Error('[heroine] the Character Builder has no save card for the heroine (its LIBRARY panel changed?)');
  // A built-in outfit is chosen the same way: by pressing its card in the room's OUTFIT panel.
  if (builtIn >= 0 && !press(OUTFIT_ACTION.builtin(OUTFITS[builtIn].name))) throw new Error(`[heroine] the Character Builder offers no card for the outfit "${options.outfit}"`);
  releaseLoad();

  // ---- 5. Run the room until she is dressed --------------------------------------------------------------------
  let disposed = false;
  const step = (dt: number): void => {
    if (disposed) return;
    scene.update({ rawDt: dt, simDt: dt, elapsed: 0 });
    scene.three.updateMatrixWorld(true);
  };

  const started = performance.now();
  const status = () => control(`[data-field="${SARAH_LAB_FIELD.status}"]`)?.textContent ?? '';
  const waitFor = async (what: string, done: () => boolean): Promise<void> => {
    say(what);
    while (!done()) {
      if (performance.now() - started > LOAD_TIMEOUT_MS) throw new Error(`[heroine] the Character Builder body did not finish loading (${what}). The room says: "${status()}"`);
      step(HIDDEN_STEP);
      await nextFrame();
    }
  };
  /** Her model: the one thing the room adds to its scene that carries a skinned mesh. */
  const findModel = (): THREE.Object3D | null => {
    for (const child of scene.three.children) {
      let skinned = false;
      child.traverse((n) => { if ((n as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
      if (skinned) return child;
    }
    return null;
  };
  /** The cloth tee: a plain (not skinned) mesh the room adds beside her model once it has been tailored. */
  const findCloth = (): THREE.Mesh | null => {
    for (const child of scene.three.children) if ((child as THREE.Mesh).isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh && child.visible) return child as THREE.Mesh;
    return null;
  };

  try {
    // Her body, her skin's picture, her hair, her painted clothes' fabrics: the room's own test of "dressed".
    await waitFor('body and outfit', () => readyCount >= 1 && !!findModel()?.visible);
    if (clothTee) {
      // The cloth tee is cut to her as she stands (a few seconds of work), then eased on and let hang.
      await waitFor('tailoring the cloth tee', () => !!findCloth());
      say('putting the cloth tee on');
      const steps = Math.ceil(TEE_DRESS_SECONDS / HIDDEN_STEP);
      for (let k = 0; k < steps; k++) {
        step(HIDDEN_STEP);
        // (a breath for the page every few steps, so a loading screen can keep moving)
        if (k % 8 === 7) await nextFrame();
      }
    }
    // A last few frames for anything that landed late to be laid on her.
    for (let k = 0; k < 6; k++) { step(HIDDEN_STEP); await nextFrame(); }
  } catch (error) {
    disposed = true;
    scene.dispose();
    throw error;
  }

  const model = findModel();
  if (!model) throw new Error('[heroine] the Character Builder room has no model in it');

  // ---- 5b. Paint layers painted by code (paintMask.ts) ---------------------------------------------------------
  // A look may ask for a paint layer that is neither a template nor painted by hand, but painted by a function (for
  // example Blaze's curved leg panels). Such a mask is one number for every point of her skin, so it can only be made
  // now that the skin she wears is here. It is then written into her saved character as an ordinary hand-painted mask
  // and she is loaded again through the builder's own save card: the builder itself puts the layer on her.
  const painters = options.look.maskPainters ?? [];
  /** Her skin and the layers painted by code, kept for `repaintMasks`. */
  let codePainted: { readonly skin: THREE.SkinnedMesh; readonly layers: readonly { readonly layer: number; readonly painter: MaskPainter }[] } | null = null;
  if (painters.some((painter) => painter)) {
    say('painting her panels');
    try {
      const skin = findPaintedSkin(model);
      const lookClothes = options.look.clothes as { layers?: readonly unknown[] } | null;
      if (!skin || !lookClothes || !Array.isArray(lookClothes.layers)) throw new Error('the look has code-painted layers but no painted clothes for them to go on');
      const surface = measureSkin(skin);
      const layers = lookClothes.layers.map((layer, i) => {
        const painter = painters[i];
        if (!painter) return layer;
        if (!layer || typeof layer !== 'object') throw new Error(`paint layer ${i + 1} has a painter but no fabric written for it`);
        // (the layer keeps its fabric and detail from the look; a hand-painted layer has no template)
        return { ...(layer as object), template: null, mask: maskText(painter, surface) };
      });
      book = sanitizeBook({ version: 1, characters: [{ ...options.look, clothes: { ...lookClothes, layers }, savedAt: new Date(0).toISOString() }], outfits: [] });
      if (!press(CHARACTER_ACTION.load(options.look.name))) throw new Error('her save card could not be pressed a second time');
      // a few frames for the builder to lay the new layer on her
      for (let k = 0; k < 8; k++) { step(HIDDEN_STEP); await nextFrame(); }
      codePainted = { skin, layers: painters.flatMap((painter, layer) => (painter ? [{ layer, painter }] : [])) };
    } catch (error) {
      disposed = true;
      scene.dispose();
      throw new Error(`[heroine] her code-painted layers could not be made: ${String((error as Error)?.message ?? error)}`);
    }
  }
  say('ready');

  // ---- 6. The room's sliders -------------------------------------------------------------------------------------
  // The room marks each slider's LABEL with its field name and puts the slider itself straight after the label.
  const sliders = new Map<string, HTMLInputElement | null>();
  const sliderOf = (field: string): HTMLInputElement | null => {
    if (!sliders.has(field)) {
      const label = control(`[data-field="${field}"]`);
      const input = label?.nextElementSibling instanceof HTMLInputElement && label.nextElementSibling.type === 'range' ? label.nextElementSibling : null;
      if (!input) console.error(`[heroine] the Character Builder's "${field}" slider was not found: it can not be set`);
      sliders.set(field, input);
    }
    return sliders.get(field) ?? null;
  };

  return {
    scene: scene.three, model, clothTee, step, press,
    setSlider(field: string, value: number): boolean {
      const input = disposed ? null : sliderOf(field);
      if (!input) return false;
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Math.round(value))));
      // (the room listens for the same event a finger on the slider makes)
      input.dispatchEvent(new Event('input'));
      return true;
    },
    repaintMasks(): void {
      if (disposed || !codePainted) return;
      const paint = codePainted.skin.geometry.getAttribute(PAINT_ATTRIBUTE) as THREE.BufferAttribute | undefined;
      if (!paint) return;
      // her skin measured again as it is shaped now, and each layer's numbers worked out again on it
      const surface = measureSkin(codePainted.skin);
      for (const { layer, painter } of codePainted.layers) {
        const bytes = finishMask(painter(surface));
        // (through bytes, so the values are exactly what a saved mask would hold)
        for (let v = 0; v < bytes.length && v < paint.count; v++) paint.setComponent(v, layer, bytes[v] / 255);
      }
      // tell three.js to send the new numbers to the graphics card (the builder's own extra skin patch sees it too)
      paint.needsUpdate = true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      realCanvas.removeEventListener('webglcontextlost', passOn);
      realCanvas.removeEventListener('webglcontextrestored', passOn);
      // The room frees her meshes, materials and textures itself.
      scene.dispose();
      // Its furniture was parked outside its scene, so it is freed here.
      parked.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m?.dispose();
      });
      parked.clear();
    },
  };
}

export { SARAH_LAB_ACTION, SARAH_LAB_FIELD };
