// ============================================================================
// caveSounds.ts -- THE PASSAGE'S SOUNDS, made in code (no sound files to download).
//
// Joshua's opening demo, Draft 1, Scene 1: "Black screen. Water drips somewhere in the darkness. A radio crackles."
// Then a faint vibration through the stone, and later again, stronger. And the A.R.C.H. scanner. A BLOCKOUT's sounds:
// each made from the browser's own sound pieces (Web Audio oscillators, a buffer of noise, filters), through the
// game's master volume (audio/sound.ts). Real recordings can replace any of them later.
//
//   DRIPS      now and then, somewhere: a short high "plink" that falls in pitch, with an echo off the rock.
//   RADIO      a crackle of static as a radio line begins and ends, and a soft hiss under it while it is spoken.
//   RUMBLE     the stone vibrating: a deep, slow-rising roar under everything, and grit.
//   SCANNER    the A.R.C.H. scanner's chirps: a start, a sweep while it reads, and a done.
//   CLICK      the flashlight's switch.
//
// While the game is paused the whole sound context is paused with it (audio/sound.ts), so nothing here needs to know.
// ============================================================================

import type { Sound } from '../../audio/sound';

export class CaveSounds {
  private noise: AudioBuffer | null = null;
  /** The echo every drip goes through (a delay feeding back into itself, darkened). */
  private echo: { input: GainNode } | null = null;
  private dripIn = 1.5;
  private hiss: { gain: GainNode; source: AudioBufferSourceNode } | null = null;

  constructor(private readonly sound: Sound) {}

  /** The sound context and its master, once there is sound (null on a browser without Web Audio). */
  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.sound.start()) return null;
    const ctx = this.sound.context, out = this.sound.master;
    if (!ctx || !out) return null;
    if (!this.noise) {
      // two seconds of white noise, made once: every hiss, crackle and rumble is cut from it
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (!this.echo) {
      const input = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.19;
      const back = ctx.createGain();
      back.gain.value = 0.42;
      const dark = ctx.createBiquadFilter();
      dark.type = 'lowpass';
      dark.frequency.value = 2400;
      input.connect(delay);
      delay.connect(dark);
      dark.connect(back);
      back.connect(delay);
      dark.connect(out);
      this.echo = { input };
    }
    return { ctx, out };
  }

  /** A burst of noise through a filter, shaped by a quick rise and a fall (all the crackles and grit). */
  private noiseBurst(ctx: AudioContext, to: AudioNode, at: number, seconds: number, level: number, type: BiquadFilterType, frequency: number, q = 1): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + Math.min(0.02, seconds * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(filter).connect(gain).connect(to);
    source.start(at, Math.random() * 1.5);
    source.stop(at + seconds + 0.05);
  }

  /** Once a frame: the drips, now and then. */
  update(dt: number): void {
    this.dripIn -= dt;
    if (this.dripIn > 0) return;
    this.dripIn = 1.8 + Math.random() * 4.5;
    this.drip();
  }

  /** One drip: a little "plink" falling in pitch, quiet, into the echo. */
  drip(): void {
    const r = this.ready();
    if (!r || !this.echo) return;
    const { ctx } = r;
    const at = ctx.currentTime + 0.01;
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    const high = 1400 + Math.random() * 900;
    tone.frequency.setValueAtTime(high, at);
    tone.frequency.exponentialRampToValueAtTime(high * 0.45, at + 0.07);
    const gain = ctx.createGain();
    const level = 0.05 + Math.random() * 0.06;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    tone.connect(gain).connect(this.echo.input);
    tone.start(at);
    tone.stop(at + 0.13);
  }

  /** A radio line begins: a crackle, then a soft hiss under the voice until `radioOff`. */
  radioOn(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const at = ctx.currentTime + 0.01;
    this.noiseBurst(ctx, out, at, 0.16, 0.16, 'bandpass', 2600, 0.8);
    this.noiseBurst(ctx, out, at + 0.08, 0.07, 0.1, 'highpass', 4000);
    if (!this.hiss && this.noise) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3200;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.022, at + 0.15);
      source.connect(filter).connect(gain).connect(out);
      source.start(at);
      this.hiss = { gain, source };
    }
  }

  /** The radio line is over: the hiss stops with a short crackle. */
  radioOff(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const at = ctx.currentTime + 0.01;
    this.noiseBurst(ctx, out, at, 0.09, 0.1, 'bandpass', 2200, 0.8);
    if (this.hiss) {
      const { gain, source } = this.hiss;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(gain.gain.value, at);
      gain.gain.linearRampToValueAtTime(0, at + 0.08);
      source.stop(at + 0.1);
      this.hiss = null;
    }
  }

  /** The stone vibrating: a deep roar rising and falling over `seconds`, as loud as `strength` (0..1), with grit. */
  rumble(seconds: number, strength: number): void {
    const r = this.ready();
    if (!r || !this.noise) return;
    const { ctx, out } = r;
    const at = ctx.currentTime + 0.01;
    // the roar: low noise, and a very low hum under it
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 90;
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 34;
    const gain = ctx.createGain();
    const level = 0.55 * strength;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + seconds * 0.35);
    gain.gain.linearRampToValueAtTime(level * 0.7, at + seconds * 0.7);
    gain.gain.linearRampToValueAtTime(0, at + seconds);
    const humGain = ctx.createGain();
    humGain.gain.value = 0.6;
    source.connect(low).connect(gain);
    hum.connect(humGain).connect(gain);
    gain.connect(out);
    source.start(at, Math.random());
    hum.start(at);
    source.stop(at + seconds + 0.1);
    hum.stop(at + seconds + 0.1);
    // grit falling from the roof, here and there through it
    for (let k = 0; k < Math.round(3 + strength * 6); k++) {
      this.noiseBurst(ctx, out, at + Math.random() * seconds * 0.9, 0.06 + Math.random() * 0.12, 0.035 * strength, 'highpass', 2500 + Math.random() * 3000);
    }
  }

  /** The A.R.C.H. scanner: 'start' (two chirps up), 'sweep' (a soft rising tone over `seconds`), 'done' (a chime). */
  scanner(kind: 'start' | 'sweep' | 'done', seconds = 2): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const at = ctx.currentTime + 0.01;
    const blip = (when: number, from: number, to: number, long: number, level: number, type: OscillatorType = 'sine'): void => {
      const tone = ctx.createOscillator();
      tone.type = type;
      tone.frequency.setValueAtTime(from, when);
      tone.frequency.exponentialRampToValueAtTime(to, when + long);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + 0.01);
      gain.gain.setValueAtTime(level, when + long * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + long);
      tone.connect(gain).connect(out);
      tone.start(when);
      tone.stop(when + long + 0.02);
    };
    if (kind === 'start') { blip(at, 880, 1320, 0.07, 0.06); blip(at + 0.09, 1320, 1760, 0.07, 0.06); }
    else if (kind === 'sweep') blip(at, 320, 900, seconds, 0.025, 'triangle');
    else { blip(at, 1568, 1568, 0.12, 0.05); blip(at + 0.13, 2093, 2093, 0.22, 0.05); }
  }

  /** The flashlight's switch: a tiny click. */
  click(): void {
    const r = this.ready();
    if (!r) return;
    this.noiseBurst(r.ctx, r.out, r.ctx.currentTime + 0.005, 0.03, 0.12, 'highpass', 3000);
  }

  dispose(): void {
    if (this.hiss) { try { this.hiss.source.stop(); } catch { /* already stopped */ } this.hiss = null; }
  }
}
