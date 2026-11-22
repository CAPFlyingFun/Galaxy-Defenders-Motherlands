# ============================================================================
# preview_breathing.py -- hear her breathing as the game will play it, as a file.
#
# Plays the files made by make_breathing.py the way src/audio/breathSound.ts
# does, one breath at a time, over a made-up run so the whole range is heard:
# calm, building up to her hardest, held, and calming back down. Writes an MP3
# to listen to on the phone, and prints which file each stretch came from.
#
# THE RULES (the same numbers as breathSound.ts `BREATH_SOUND`):
#   * A new breath starts when her breath cycle starts again (her chest begins to
#     rise). It takes the file whose MEASURED rate is nearest hers (in ratio: 24
#     is as far from 20 as 30 is from 24), keeping the one it has unless another
#     is clearly nearer (`keep`), and that file's next breath in turn.
#   * Her breath IN is played while her chest rises (`inShare` of the breath),
#     her breath OUT while it falls. Each is sped up or slowed to fit (at most
#     `fastest` / `slowest`: past that it would sound like another voice); a sound
#     still too long for its time fades out (`fadeOut`), one too short leaves a pause.
#   * How loud: by the air she moves a minute (breaths x their size), so calm
#     breathing is soft and hard breathing full.
#
# Usage: python3 scripts/preview_breathing.py [female] [out.mp3]   (out: the system's temp folder unless given)
# ============================================================================
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.normpath(os.path.join(HERE, '..', 'public', 'audio', 'breathing'))
RATE = 48000
SOUND = {'keep': 1.12, 'slowest': 0.8, 'fastest': 1.25, 'fadeIn': 0.012, 'fadeOut': 0.06,
         'quietest': 0.3, 'fullAtLPerMin': 80}


def decode(path):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(RATE), '-c:a', 'pcm_f32le', wav], check=True)
        _, x = wavfile.read(wav)
    return x.astype(np.float64)


def find_start(x, manifest):
    """Where the breaths start: the tick's first loud sample, plus the rest of the pad (as the game finds it)."""
    first = int(np.argmax(np.abs(x) > 0.05))
    return first / RATE - manifest['markerAt'] + manifest['pad']


def her_run(t):
    """A made-up run: breaths a minute at time t (s). Calm, building up, her hardest, calming down."""
    pts = [(0, 14), (14, 15), (20, 18), (35, 30), (50, 44), (58, 50), (72, 50), (82, 38), (100, 24), (118, 16), (130, 14)]
    ts, vs = zip(*pts)
    return float(np.interp(t, ts, vs))


def main(voice='female', out=None):
    manifest = json.load(open(os.path.join(AUDIO, f'{voice}.json')))
    banks = []
    for b in manifest['banks']:
        x = decode(os.path.join(AUDIO, b['file']))
        banks.append({**b, 'x': x, 'start': find_start(x, manifest), 'next': 0})
    total = 130.0
    mix = np.zeros(int((total + 3) * RATE))
    t, bank, log = 0.0, None, []
    while t < total:
        per_min = her_run(t)
        effort = np.clip((per_min - 14) / 36, 0, 1)
        in_share = 0.4 + 0.08 * effort                       # the builder's inRest .. inHard
        tidal = 0.5 + 1.2 * effort ** 0.8                    # litres a breath, about the builder's
        volume = np.clip(np.sqrt(per_min * tidal / SOUND['fullAtLPerMin']), SOUND['quietest'], 1)
        period = 60 / per_min
        # the file for this breath: nearest in ratio, the one in use kept unless another is clearly nearer
        dist = lambda b: abs(np.log(per_min / b['perMinute']))
        best = min(banks, key=dist)
        if bank is None or dist(bank) > dist(best) + np.log(SOUND['keep']):
            bank = best
        cyc = bank['cycles'][bank['next'] % len(bank['cycles'])]; bank['next'] += 1
        if not log or log[-1][1] != bank['file']:
            log.append((t, bank['file'], per_min))
        for (a, b), span, at in (((cyc[0], cyc[1]), in_share * period, t), ((cyc[1], cyc[2]), (1 - in_share) * period, t + in_share * period)):
            natural = b - a
            speed = np.clip(natural / span, SOUND['slowest'], SOUND['fastest'])
            played = min(natural / speed, span)
            n_out = int(played * RATE)
            src_pos = (bank['start'] + a) * RATE + np.arange(n_out) * speed   # playbackRate: faster and higher, as the game's
            seg = np.interp(src_pos, np.arange(len(bank['x'])), bank['x'])
            env = np.ones(n_out)
            fi = min(n_out, int(SOUND['fadeIn'] * RATE)); env[:fi] = np.linspace(0, 1, fi)
            if natural / speed > span + 1e-6:                  # cut short: fade it out
                fo = min(n_out, int(SOUND['fadeOut'] * RATE)); env[-fo:] *= np.linspace(1, 0, fo)
            i0 = int(at * RATE)
            mix[i0:i0 + n_out] += seg * env * volume
        t += period
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav'); wavfile.write(wav, RATE, np.clip(mix, -1, 1).astype(np.float32))
        out = out or os.path.join(tempfile.gettempdir(), f'preview-{voice}.mp3')   # (not in public/: it is not shipped)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', out], check=True)
    for at, f, pm in log:
        print(f'{at:6.1f} s  {pm:4.1f}/min  -> {f}')
    print('wrote', out)


if __name__ == '__main__':
    main(*(sys.argv[1:] or []))
