# ============================================================================
# make_breathing.py -- her breathing sounds, made ready for the game.
#
# Joshua made looping breathing sounds in ElevenLabs (2026-11-21), one file per
# breathing rate he asked for: docs/reference/audio/breathing/female-15.mp3 ..
# female-45.mp3 ("15" = 15 breaths a minute asked for). He asked for three
# things: CHECK THE RATES, LEVEL THEM (they were made at different loudness),
# and play them so her breathing speeds up and slows down between the files.
#
# What this script does to each file:
#   1. MEASURES ITS REAL RATE. Every in-breath and every out-breath is one SOUND
#      with a dip of quiet between them; the sounds are found by those dips, round
#      the loop (the file's end runs on into its start). Breaths a minute =
#      sounds / 2 per minute of file. (MEASURED 2026-11-21: they alternate in/out
#      in all seven: each sound's loudness and brightness swap every other one.)
#   2. TELLS IN FROM OUT. At rest a breath in takes 40% of a breath (the builder's
#      `BREATHING.inRest`), so the SHORTER of each pair is the breath in; where the
#      two are nearly the same length (fast breathing), the BRIGHTER one is.
#      A loop with an odd number of sounds has one place where two of the same
#      kind meet: the whole loop's best fit is chosen, and that sound left out.
#   3. LISTS ITS BREATHS ("cycles": breath in starts, breath out starts, breath
#      ends; seconds), so the game can play ONE BREATH AT A TIME in step with her
#      chest (src/audio/breathSound.ts), sped up or slowed to her rate.
#   4. TURNS THE LOOP to start at the quiet before a breath in, and SMOOTHS THE
#      OLD LOOP POINT (the 45 and 40 files jumped there: a tiny click).
#   5. LEVELS IT: every file to the same loudness (TARGET_LUFS, EBU R128, the
#      way broadcast levels sound). A few files have sharp little peaks (a click
#      of the lips) far above their breath: those few peaks alone are held under
#      PEAK_CEILING by a quick limiter, so no file has to be left quieter.
#   6. ONE CHANNEL: left and right were nearly the same (MEASURED: 0.93-0.99 alike).
#   7. A MARKER BEFORE THE SOUND. An MP3 decoder may or may not leave a few
#      hundredths of a second of its own silence at the start (browsers differ).
#      Each file starts with PAD seconds the game never plays: silence, a 5 ms
#      tick at MARKER_AT, silence. The game finds the tick and so knows exactly
#      where the breaths are, whatever the decoder did.
#
# Usage:  python3 scripts/make_breathing.py [female]
# Writes: public/audio/breathing/<voice>-<rate>.mp3 and <voice>.json (the list).
# Needs ffmpeg (with libmp3lame), numpy, scipy.
# ============================================================================
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, find_peaks

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
SOURCES = os.path.join(REPO, 'docs', 'reference', 'audio', 'breathing')
OUT = os.path.join(REPO, 'Game', 'public', 'audio', 'breathing')

RATE = 48000            # samples a second, as ElevenLabs made them
TARGET_LUFS = -23.0     # every file this loud (integrated, gated: EBU R128's own level); the game scales it by how hard she breathes
PEAK_CEILING = -1.5     # dBFS: no sample past this (the limiter holds the few that would be)
LIMIT_AHEAD = 0.005     # s: the limiter sees a peak this far ahead and is already down for it
LIMIT_RELEASE = 0.06    # s: and comes back up over this
PAD = 0.1               # seconds before the breaths start (never played)
MARKER_AT = 0.02        # the tick's start in the pad (seconds)
MARKER_S = 0.005        # the tick's length
MARKER_LEVEL = 0.25     # the tick's height (the breaths before it are silence, so it is found by its first loud sample)
DIP_PROMINENCE = 6.0    # dB: how far the quiet between two sounds dips below the sounds round it
MIN_SOUND_S = 0.18      # no sound is shorter than this
BITRATE = '80k'         # MP3, one channel
# Files that MEASURE faster than this are left out of the game: she never breathes that fast (the builder's hardest
# is 50 a minute, about 70 with fear, pain and adrenaline on top), and each file costs about 190 KB of memory a second
# once decoded. (MEASURED 2026-11-21: the "45" file is 116 a minute, panting.)
FASTEST_USED = 90


def decode(path: str) -> np.ndarray:
    """The file as one channel of floats at RATE."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(RATE), '-c:a', 'pcm_f32le', wav], check=True)
        _, x = wavfile.read(wav)
    return x.astype(np.float64)


def loop_filter(x: np.ndarray, low: float, high: float) -> np.ndarray:
    """Band-pass round the loop (three copies end to end, the middle kept), so its ends filter as one."""
    n = len(x)
    sos = butter(4, [low, high], 'bandpass', fs=RATE, output='sos')
    return sosfiltfilt(sos, np.concatenate([x, x, x]))[n:2 * n]


def envelope_db(y: np.ndarray, hop: int, win: int) -> np.ndarray:
    """Loudness (dB) every `hop` samples over `win`-sample windows, round the loop."""
    n = len(y)
    yy = np.concatenate([y[-win:], y, y[:win]]) ** 2
    c = np.cumsum(yy)
    e = np.sqrt((c[2 * win:] - c[:-2 * win]) / (2 * win))[::hop][: n // hop]
    return 20 * np.log10(e + 1e-9)


def find_sounds(x: np.ndarray) -> np.ndarray:
    """Where each sound starts (samples): the quiet dips between breaths, round the loop."""
    hop, win = RATE // 200, int(0.02 * RATE)               # 5 ms steps, 20 ms windows
    edb = envelope_db(loop_filter(x, 150, 10000), hop, win)
    k = 8                                                   # 40 ms smoothing, round the loop
    s = np.convolve(np.concatenate([edb[-k:], edb, edb[:k]]), np.ones(k) / k, 'same')[k:-k]
    m = len(s)
    dips, _ = find_peaks(-np.concatenate([s, s[: m // 2]]), prominence=DIP_PROMINENCE, distance=int(MIN_SOUND_S * 200))
    dips = np.unique(dips % m)
    # each dip moved to the quietest 5 ms within 40 ms of it (on the unsmoothed loudness)
    fine = [(d + np.argmin(np.take(edb, range(d - 8, d + 9), mode='wrap')) - 8) % m for d in dips]
    return np.array(sorted(set(fine))) * hop


def describe(x: np.ndarray, starts: np.ndarray) -> list:
    """Each sound's length (s), loudness (dB) and brightness (Hz: the middle of its spectrum)."""
    n = len(x)
    out = []
    for a, b in zip(starts, list(starts[1:]) + [starts[0] + n]):
        seg = np.take(x, range(a, b), mode='wrap')
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
        f = np.fft.rfftfreq(len(seg), 1 / RATE)
        m = (f > 150) & (f < 10000)
        out.append({'start': int(a), 'length': (b - a) / RATE, 'loud': 10 * np.log10(np.mean(seg ** 2) + 1e-15),
                    'bright': float(np.sum(f[m] * spec[m]) / np.sum(spec[m]))})
    return out


def label_in_out(sounds: list) -> list:
    """'in' or 'out' for each sound: alternating, the shorter (or, nearly equal, the brighter) of each pair 'in'.
    An odd count has one place where two of a kind meet; every place is tried and the best fit kept."""
    n = len(sounds)
    L = np.array([s['length'] for s in sounds]); B = np.array([s['bright'] for s in sounds])
    zl = (L - L.mean()) / (L.std() + 1e-9); zb = (B - B.mean()) / (B.std() + 1e-9)
    # how much each sound looks like a breath IN: short, and a little for bright
    looks_in = -zl + 0.35 * zb
    best, best_score = None, -1e18
    starts = range(n) if n % 2 else [None]
    for first in ('in', 'out'):
        for double in starts:                               # where two of a kind meet (odd counts only)
            labels, kind = [], first
            for i in range(n):
                labels.append(kind)
                if double is None or i != double:
                    kind = 'out' if kind == 'in' else 'in'
            if n % 2 == 0 and labels[-1] == labels[0]:
                continue
            score = sum(v if k == 'in' else -v for v, k in zip(looks_in, labels))
            if score > best_score:
                best, best_score = labels, score
    return best


def smooth_step(y: np.ndarray, j: int, w: int) -> None:
    """Take out a jump between y[j-1] and y[j] (the old loop point) with a 2*w-sample ramp either side, in place."""
    n = len(y)
    jump = y[j % n] - y[(j - 1) % n] - (y[(j - 1) % n] - y[(j - 2) % n])   # the step, less the slope that was there
    for i in range(w):
        g = (i + 1) / w / 2
        y[(j - w + i) % n] += jump * g
        y[(j + w - 1 - i) % n] -= jump * g


def limit(y: np.ndarray, ceiling_db: float) -> tuple:
    """Hold every sample under `ceiling_db` (dBFS): the gain a peak needs is taken LIMIT_AHEAD early and let back up
    over LIMIT_RELEASE, so the peaks are pressed down smoothly and the rest of the breath is left as it is.
    Round the loop. Returns the limited sound and the most it pressed down (dB)."""
    n = len(y)
    ceiling = 10 ** (ceiling_db / 20)
    need = np.minimum(1.0, ceiling / (np.abs(y) + 1e-12))          # the gain each sample needs
    ahead = int(LIMIT_AHEAD * RATE)
    # the least gain needed over the next `ahead` samples (a moving minimum, round the loop)
    padded = np.concatenate([need, need[:ahead]])
    from numpy.lib.stride_tricks import sliding_window_view
    least = sliding_window_view(padded, ahead + 1).min(axis=1)[:n]
    # down at once, back up slowly (one pole), twice round the loop so its start is settled too
    back = np.exp(-1 / (LIMIT_RELEASE * RATE))
    g = np.empty(n); level = 1.0
    for _ in range(2):
        for i in range(n):
            level = least[i] if least[i] < level else least[i] + (level - least[i]) * back
            g[i] = level
    return y * g, float(-20 * np.log10(g.min()))


def loudness(path_or_x) -> tuple:
    """Integrated loudness (LUFS) and true peak (dBFS) by ffmpeg's EBU R128 meter."""
    with tempfile.TemporaryDirectory() as tmp:
        if isinstance(path_or_x, np.ndarray):
            p = os.path.join(tmp, 'a.wav'); wavfile.write(p, RATE, path_or_x.astype(np.float32))
        else:
            p = path_or_x
        r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    lufs = float(r.split('Integrated loudness:')[1].split('I:')[1].split('LUFS')[0])
    peak = float(r.split('True peak:')[1].split('Peak:')[1].split('dBFS')[0])
    return lufs, peak


def make(voice: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    names = sorted((f for f in os.listdir(SOURCES) if f.startswith(voice + '-') and f.endswith('.mp3')),
                   key=lambda f: int(f.split('-')[1].split('.')[0]))
    banks = []
    for name in names:
        asked = int(name.split('-')[1].split('.')[0])
        x = decode(os.path.join(SOURCES, name))
        n = len(x)
        starts = find_sounds(x)
        sounds = describe(x, starts)
        labels = label_in_out(sounds)
        per_minute = len(sounds) / 2 / (n / RATE) * 60
        if per_minute > FASTEST_USED:
            print(f'{name}: asked {asked}/min, MEASURED {per_minute:.1f}/min: faster than she ever breathes, left out')
            stale = os.path.join(OUT, f'{voice}-{asked}.mp3')
            if os.path.exists(stale):
                os.remove(stale)
            continue
        # turn the loop to start at the first breath in, and smooth where it used to start
        first_in = next(i for i, k in enumerate(labels) if k == 'in')
        turn = sounds[first_in]['start']
        y = np.roll(x, -turn)
        smooth_step(y, (n - turn) % n, int(0.0025 * RATE))
        order = [(sounds[(first_in + i) % len(sounds)], labels[(first_in + i) % len(sounds)]) for i in range(len(sounds))]
        at = lambda s: ((s['start'] - turn) % n) / RATE
        # the breaths: an 'in' followed by an 'out' (a lone sound where two of a kind meet is left out)
        cycles = []
        for i, (s, k) in enumerate(order):
            if k != 'in' or i + 1 >= len(order) or order[i + 1][1] != 'out':
                continue
            out = order[i + 1][0]
            end = at(order[i + 2][0]) if i + 2 < len(order) else n / RATE
            cycles.append([round(at(s), 4), round(at(out), 4), round(end, 4)])
        # level it, then hold its few sharp peaks under the ceiling (measured again after, and the gain set again once,
        # as pressing the peaks down takes a little off its loudness)
        lufs, _ = loudness(y)
        level = y * 10 ** ((TARGET_LUFS - lufs) / 20)
        level, pressed = limit(level, PEAK_CEILING)
        again, _ = loudness(level)
        y = y * 10 ** ((TARGET_LUFS - lufs + TARGET_LUFS - again) / 20)
        y, pressed = limit(y, PEAK_CEILING)
        # the pad: silence, the tick, silence
        pad = np.zeros(int(PAD * RATE))
        a = int(MARKER_AT * RATE); m = int(MARKER_S * RATE)
        pad[a:a + m] = MARKER_LEVEL * np.sin(2 * np.pi * 1000 * np.arange(m) / RATE) * np.hanning(m)
        full = np.concatenate([pad, y])
        # (where the game will FIND the tick: its first sample over the game's threshold, 0.05; written down exactly so
        #  the game's start of the breaths is exact whatever the tick's shape)
        found_at = int(np.argmax(np.abs(pad) > 0.05)) / RATE
        out_name = f'{voice}-{asked}.mp3'
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, 'a.wav'); wavfile.write(wav, RATE, full.astype(np.float32))
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE,
                            os.path.join(OUT, out_name)], check=True)
        after, after_peak = loudness(y)
        ins = [c[1] - c[0] for c in cycles]; outs = [c[2] - c[1] for c in cycles]
        print(f'{name}: asked {asked}/min, MEASURED {per_minute:.1f}/min ({len(sounds)} sounds, {len(cycles)} whole breaths), '
              f'in {np.mean(ins):.2f} s / out {np.mean(outs):.2f} s, loudness {lufs:.1f} -> {after:.1f} LUFS (peak {after_peak:.1f} dBFS, '
              f'peaks pressed {pressed:.1f} dB), '
              f'{os.path.getsize(os.path.join(OUT, out_name)) // 1024} KB')
        tick = found_at
        banks.append({'file': out_name, 'asked': asked, 'perMinute': round(per_minute, 2), 'seconds': round(n / RATE, 4),
                      'cycles': cycles})
    manifest = {
        'about': ('Her breathing, one breath at a time (scripts/make_breathing.py; played by src/audio/breathSound.ts). '
                  'Each file: `pad` seconds first (never played) with a short tick, first over 0.05 at `markerAt`; the breaths '
                  'start after the pad. `cycles`: [breath in starts, breath out starts, breath ends], seconds after the pad. '
                  '`perMinute`: the rate MEASURED in the file; `asked`: what it was made as.'),
        'voice': voice, 'pad': PAD, 'markerAt': round(tick, 6), 'loudnessLufs': TARGET_LUFS,
        'banks': banks,
    }
    with open(os.path.join(OUT, f'{voice}.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print('wrote', os.path.join(OUT, f'{voice}.json'))


if __name__ == '__main__':
    for v in (sys.argv[1:] or ['female']):
        make(v)
