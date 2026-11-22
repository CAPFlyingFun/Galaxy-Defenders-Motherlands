// ============================================================================
// breathSound.ts -- her breathing, heard: one breath at a time, with her chest.
//
// Joshua, 2026-11-21: he made looping breathing sounds in ElevenLabs, one file
// per breathing rate, and asked that "between the numbers [it] speed up or slow
// down fading into the next one", with the files leveled to one loudness.
//
// THE FILES (public/audio/breathing/<voice>-<n>.mp3 and <voice>.json, made by
// scripts/make_breathing.py from docs/reference/audio/breathing/): each one
// leveled to the same loudness, with a list of its breaths: where each breath
// IN starts, where its breath OUT starts, where it ends. The rate each file
// REALLY has was measured (ElevenLabs did not keep to the numbers asked: its
// "20" is 24 a minute, its "35" 58), and that measured rate is what is used.
//
// HOW IT PLAYS. Not as a loop under her: breath by breath, from her own vitals.
//   * Her breath cycle (heroineVitals.ts `breathCycle`, the one her chest and
//     belly move by) starting again = she starts breathing IN: a breath in is
//     played now, over the time she spends breathing in (`breathInShare` of a
//     breath). Reaching the end of that share = she breathes OUT: that breath's
//     out is played over the rest.
//   * Each breath comes from the file whose measured rate is nearest hers (in
//     ratio), and that file's next breath in turn, so its natural variety is
//     heard. She keeps the file she is on until another is clearly nearer
//     (`keep`), and a change of file only ever happens between two breaths, in
//     the quiet: never two of her breathing at once.
//   * Between the files' rates each sound is sped up or slowed to fit her
//     (Web Audio's playback rate: a little higher or lower, as a real faster or
//     slower breath is), never past `slowest` .. `fastest`; a sound that is still
//     too long for its time fades out, one that is short leaves her a pause.
//   * How LOUD: by the air she moves a minute (breaths x their size), so calm
//     breathing is soft and hard breathing full (`quietest` .. 1 at
//     `fullAtLPerMin`); then by how far the camera is from her (full within
//     `near`, half at `near + halfFar`); then Settings -> SOUND.
// A preview of exactly these rules, as a file: scripts/preview_breathing.py.
// ============================================================================
import type { Sound } from './sound';

/** GAME TUNING (the preview script uses the same numbers). */
export const BREATH_SOUND = Object.freeze({
  /** she changes file only when another's rate is this much nearer hers (a ratio) */
  keep: 1.12,
  /** the slowest and fastest a sound is played (1 = as recorded) */
  slowest: 0.8,
  fastest: 1.25,
  /** seconds: each sound fades in over `fadeIn`; one cut short fades out over `fadeOut` */
  fadeIn: 0.012,
  fadeOut: 0.06,
  /** her breathing's loudness by the air she moves: `quietest` at rest, all of it from `fullAtLPerMin` litres a minute */
  quietest: 0.3,
  fullAtLPerMin: 80,
  /** metres from the camera: full within `near`, half at `near + halfFar`, silent past `farthest` */
  near: 1,
  halfFar: 3,
  farthest: 40,
});

/** One breathing file as the game holds it. */
interface Bank {
  readonly file: string;
  /** the breaths a minute MEASURED in it */
  readonly perMinute: number;
  /** its breaths: [in starts, out starts, ends], seconds after its pad */
  readonly cycles: readonly (readonly [number, number, number])[];
  readonly buffer: AudioBuffer;
  /** where its breaths start in the decoded sound (seconds): its pad, as this browser's decoder left it */
  readonly start: number;
}

/** What make_breathing.py writes beside the files (<voice>.json). */
interface BreathManifest {
  readonly pad: number;
  readonly markerAt: number;
  readonly banks: readonly { readonly file: string; readonly perMinute: number; readonly cycles: readonly (readonly [number, number, number])[] }[];
}

/** What it needs of her each frame (heroineVitals.ts `VitalsReading`). */
export interface BreathReading {
  readonly breathsPerMinute: number;
  /** a breath's size now, litres */
  readonly breathLitres: number;
  /** how far through this breath she is, 0 .. 1 (0 = she starts breathing in) */
  readonly breathCycle: number;
  /** the share of a breath spent breathing in */
  readonly breathInShare: number;
}

/** One voice's files, loaded once and shared by everyone with that voice. */
const voices = new Map<string, Promise<readonly Bank[]>>();

/**
 * Where the breaths really start in a decoded file. Its pad holds a short tick at `markerAt` and silence round it;
 * a browser's MP3 decoder may leave a few hundredths of a second of its own silence in front (they differ), so the
 * tick is FOUND: the first sample clearly above silence. Its distance from `markerAt` is that decoder's own delay.
 */
function breathsStart(buffer: AudioBuffer, manifest: BreathManifest): number {
  const data = buffer.getChannelData(0);
  const lookTo = Math.min(data.length, Math.round(buffer.sampleRate * (manifest.pad + 0.3)));
  for (let i = 0; i < lookTo; i++) {
    if (Math.abs(data[i]) > 0.05) return i / buffer.sampleRate - manifest.markerAt + manifest.pad;
  }
  return manifest.pad; // (no tick found: as written)
}

/** A voice's breathing files ('female'; 'male' once Joshua has made them), fetched and decoded once. */
export function loadBreathVoice(sound: Sound, voice: string, version: string): Promise<readonly Bank[]> {
  let banks = voices.get(voice);
  if (!banks) {
    banks = (async () => {
      const folder = `${import.meta.env.BASE_URL}audio/breathing/`;
      const response = await fetch(`${folder}${voice}.json?v=${encodeURIComponent(version)}`);
      if (!response.ok) throw new Error(`${voice}.json: ${response.status}`);
      const manifest = (await response.json()) as BreathManifest;
      const loaded = await Promise.all(manifest.banks.map(async (b) => {
        const buffer = await sound.loadBuffer(`${folder}${b.file}?v=${encodeURIComponent(version)}`);
        return buffer ? { file: b.file, perMinute: b.perMinute, cycles: b.cycles, buffer, start: breathsStart(buffer, manifest) } : null;
      }));
      return loaded.filter((b): b is Bank => b !== null && b.cycles.length > 0);
    })().catch((error) => { console.warn(`[breath] the ${voice} breathing could not be loaded`, error); return []; });
    voices.set(voice, banks);
  }
  return banks;
}

/** One character's breathing: give it their vitals every frame. */
export class BreathSound {
  /** this character's own volume (camera distance and the setting), before the master */
  private readonly out: GainNode | null;
  private banks: readonly Bank[] = [];
  /** the file she is breathing from, and the next breath to take from each file */
  private bank: Bank | null = null;
  private readonly next = new Map<Bank, number>();
  /** this breath's file and times, from its breath in to its breath out */
  private current: { bank: Bank; cycle: readonly [number, number, number] } | null = null;
  private lastCycle = -1;
  private readonly live = new Set<AudioBufferSourceNode>();
  private disposed = false;

  constructor(private readonly sound: Sound, voice: string, version: string) {
    const ctx = sound.context;
    this.out = ctx && sound.master ? ctx.createGain() : null;
    if (this.out && sound.master) { this.out.gain.value = 0; this.out.connect(sound.master); }
    void loadBreathVoice(sound, voice, version).then((banks) => { if (!this.disposed) this.banks = banks; });
  }

  /** Loaded and able to play. */
  get ready(): boolean { return this.banks.length > 0 && !!this.out; }
  /** How many breaths in and out it has played, and from which file now (for test pages: `gdm.breathing()`). */
  private played = { in: 0, out: 0 };
  stats(): { ready: boolean; file: string | null; files: readonly { file: string; perMinute: number; start: number }[]; breathsIn: number; breathsOut: number; volume: number; cycle: number } {
    return {
      ready: this.ready, file: this.bank?.file ?? null,
      files: this.banks.map((b) => ({ file: b.file, perMinute: b.perMinute, start: Math.round(b.start * 10000) / 10000 })),
      breathsIn: this.played.in, breathsOut: this.played.out, volume: this.out?.gain.value ?? 0, cycle: this.lastCycle,
    };
  }

  /**
   * Every frame: her vitals now, how far the camera is from her (metres; 0 = it is her own eyes) and the volume
   * chosen in Settings (0 .. 1, before the master).
   */
  update(reading: BreathReading, cameraMetres: number, volume: number): void {
    const ctx = this.sound.context;
    const c = reading.breathCycle, prev = this.lastCycle;
    this.lastCycle = c;
    if (!ctx || !this.out || !this.ready || !this.sound.running) return;
    // her volume here: by the camera's distance and the setting (eased, so a camera move never clicks)
    const B = BREATH_SOUND;
    const away = Math.max(0, cameraMetres - B.near);
    const distance = cameraMetres > B.farthest ? 0 : 1 / (1 + away / B.halfFar);
    this.out.gain.setTargetAtTime(distance * Math.max(0, Math.min(1, volume)), ctx.currentTime, 0.1);
    if (prev < 0 || distance <= 0) return;
    const share = reading.breathInShare;
    if (c < prev - 0.5) this.breatheIn(reading);                     // her cycle started again: she breathes in
    else if (prev < share && c >= share) this.breatheOut(reading);   // she has breathed in all she will: out
  }

  /** How loud a breath is by the air she moves a minute (`quietest` .. 1). */
  private airLoudness(reading: BreathReading): number {
    const B = BREATH_SOUND;
    const litresPerMinute = Math.max(0, reading.breathsPerMinute) * Math.max(0, reading.breathLitres);
    return Math.max(B.quietest, Math.min(1, Math.sqrt(litresPerMinute / B.fullAtLPerMin)));
  }

  private breatheIn(reading: BreathReading): void {
    const perMinute = Math.max(1, reading.breathsPerMinute);
    // the file for this breath: nearest in ratio; the one in use kept unless another is clearly nearer
    const far = (b: Bank) => Math.abs(Math.log(perMinute / b.perMinute));
    let best = this.banks[0];
    for (const b of this.banks) if (far(b) < far(best)) best = b;
    if (!this.bank || far(this.bank) > far(best) + Math.log(BREATH_SOUND.keep)) this.bank = best;
    const bank = this.bank;
    const n = this.next.get(bank) ?? Math.floor(Math.random() * bank.cycles.length);   // (each file starts at a random breath)
    this.next.set(bank, n + 1);
    const cycle = bank.cycles[n % bank.cycles.length];
    this.current = { bank, cycle };
    this.played.in++;
    this.play(bank, cycle[0], cycle[1], reading.breathInShare * 60 / perMinute, this.airLoudness(reading));
  }

  private breatheOut(reading: BreathReading): void {
    const now = this.current;
    this.current = null;
    if (!now) return; // (no breath in was heard for this breath: the sound started part-way through it)
    const perMinute = Math.max(1, reading.breathsPerMinute);
    this.played.out++;
    this.play(now.bank, now.cycle[1], now.cycle[2], (1 - reading.breathInShare) * 60 / perMinute, this.airLoudness(reading));
  }

  /** One sound of a file (`from` .. `to`, seconds after its pad), fitted into `span` seconds, at `loudness`. */
  private play(bank: Bank, from: number, to: number, span: number, loudness: number): void {
    const ctx = this.sound.context;
    if (!ctx || !this.out || span <= 0.02) return;
    const B = BREATH_SOUND;
    const natural = to - from;
    const speed = Math.max(B.slowest, Math.min(B.fastest, natural / span));
    const lasts = natural / speed;               // seconds it takes at that speed
    const heard = Math.min(lasts, span);         // seconds of it heard (a sound too long for its time is cut)
    const t0 = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = bank.buffer;
    source.playbackRate.value = speed;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(loudness, t0 + Math.min(B.fadeIn, heard / 2));
    if (lasts > span + 1e-3) {
      const fade = Math.min(B.fadeOut, heard / 2);
      gain.gain.setValueAtTime(loudness, t0 + heard - fade);
      gain.gain.linearRampToValueAtTime(0, t0 + heard);
    }
    source.connect(gain).connect(this.out);
    // (`start`'s third number is how much of the FILE to play: what is heard, times its speed)
    source.start(t0, bank.start + from, heard * speed);
    this.live.add(source);
    source.onended = () => { this.live.delete(source); source.disconnect(); gain.disconnect(); };
  }

  /** Silence her at once (a swap of outfit, the game closing). */
  dispose(): void {
    this.disposed = true;
    for (const source of this.live) { try { source.stop(); } catch { /* already ended */ } }
    this.live.clear();
    this.out?.disconnect();
  }
}
