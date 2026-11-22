// ============================================================================
// sound.ts -- the game's sound: one Web Audio context for everything heard.
//
// Her breathing is the first sound in the game (Joshua, 2026-11-21: his
// ElevenLabs breathing loops). Everything that makes a sound goes through
// the one context made here, into one MASTER volume (Settings -> SOUND).
//
// PHONES. A browser keeps a page silent until the player touches it: the
// context starts "suspended" and is woken (`resume`) on the first touch, click
// or key; an iPhone can also put it to sleep when a call comes in or the app
// goes to the background, so every later touch wakes it again if it sleeps.
// While the game is PAUSED (the pause menu, the phone held upright) the
// context is suspended too: nothing plays and nothing is lost.
// NOTE: on an iPhone the ring/silent switch mutes web sound; with the switch
// on silent the game is quiet (as most web games are).
//
// NOTHING AT LOAD (v0.2.143; Joshua, 2026-11-22: v0.2.142 "keeps crashing on
// load"): the context is only made when the first sound is wanted (`start`,
// a little after play begins), never while the game is loading.
// ============================================================================

/** The page's own events that count as the player's touch (any of them may wake the sound). */
const WAKE_EVENTS = ['pointerdown', 'touchend', 'keydown'] as const;

export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private volume = 1;
  private paused = false;
  private readonly wake = (): void => { if (!this.paused) void this.ctx?.resume().catch(() => undefined); };

  constructor() {
    // (kept listening: an iPhone can stop the sound again later, and the next touch starts it again)
    for (const name of WAKE_EVENTS) window.addEventListener(name, this.wake, { passive: true });
  }

  /** The context: null until `start` (and where the browser has no Web Audio: then the game is simply silent). */
  get context(): AudioContext | null { return this.ctx; }
  /** Everything heard goes through this: its gain is the MASTER volume (null until `start`). */
  get master(): GainNode | null { return this.out; }

  /** Make the sound's context, if it is not made yet (the first sound wanted). True if there is sound. */
  start(): boolean {
    if (this.ctx) return true;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return false;
    this.ctx = new Context({ latencyHint: 'interactive' });
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    if (this.paused) void this.ctx.suspend().catch(() => undefined);
    return true;
  }

  /** Is sound running now (woken by a touch, not paused)? */
  get running(): boolean { return this.context?.state === 'running'; }
  /** The sound's own clock, seconds (what Web Audio schedules by). */
  get now(): number { return this.context?.currentTime ?? 0; }

  /** MASTER volume, 0 .. 1 (eased over a few hundredths of a second so a slider never clicks). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
  }

  /** The game paused (or carrying on): the sound stops with it, and starts again where it was. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume()).catch(() => undefined);
  }

  /** A sound file, decoded and ready to play (null if it could not be fetched or read). */
  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(bytes);
    } catch (error) {
      console.warn(`[sound] ${url} could not be loaded`, error);
      return null;
    }
  }

  dispose(): void {
    for (const name of WAKE_EVENTS) window.removeEventListener(name, this.wake);
    void this.ctx?.close().catch(() => undefined);
  }
}
