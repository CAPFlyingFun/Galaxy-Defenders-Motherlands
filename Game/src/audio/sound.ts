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
// ============================================================================

/** The page's own events that count as the player's touch (any of them may wake the sound). */
const WAKE_EVENTS = ['pointerdown', 'touchend', 'keydown'] as const;

export class Sound {
  /** null where the browser has no Web Audio (then the game is simply silent). */
  readonly context: AudioContext | null;
  /** Everything heard goes through this: its gain is the MASTER volume. */
  readonly master: GainNode | null;
  private paused = false;
  private readonly wake = (): void => { if (!this.paused) void this.context?.resume().catch(() => undefined); };

  constructor() {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = Context ? new Context({ latencyHint: 'interactive' }) : null;
    this.master = this.context ? this.context.createGain() : null;
    if (this.context && this.master) this.master.connect(this.context.destination);
    // (kept listening: an iPhone can stop the sound again later, and the next touch starts it again)
    for (const name of WAKE_EVENTS) window.addEventListener(name, this.wake, { passive: true });
  }

  /** Is sound running now (woken by a touch, not paused)? */
  get running(): boolean { return this.context?.state === 'running'; }
  /** The sound's own clock, seconds (what Web Audio schedules by). */
  get now(): number { return this.context?.currentTime ?? 0; }

  /** MASTER volume, 0 .. 1 (eased over a few hundredths of a second so a slider never clicks). */
  setVolume(volume: number): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime, 0.03);
  }

  /** The game paused (or carrying on): the sound stops with it, and starts again where it was. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.context) return;
    void (paused ? this.context.suspend() : this.context.resume()).catch(() => undefined);
  }

  /** A sound file, decoded and ready to play (null if it could not be fetched or read). */
  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      return await this.context.decodeAudioData(bytes);
    } catch (error) {
      console.warn(`[sound] ${url} could not be loaded`, error);
      return null;
    }
  }

  dispose(): void {
    for (const name of WAKE_EVENTS) window.removeEventListener(name, this.wake);
    void this.context?.close().catch(() => undefined);
  }
}
