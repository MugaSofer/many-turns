"""Measure lyric sync in a rendered video: correlate frame changes in the inscription band with the word times.
Usage: python lyric_sync_check.py video.mp4 [t0 t1]"""
import sys, json, subprocess, numpy as np
vid = sys.argv[1]; t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 20; t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 360
T = json.load(open('C:/Users/IRL/Documents/Claude/music-video/audio/take4-timing.json'))
W, H = 480, 45
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', str(t0), '-t', str(t1 - t0), '-i', vid, '-vf', f'crop=1920:180:0:120,scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
d = np.clip(np.diff(fr, axis=0), 0, None).mean(axis=(1, 2)) + np.clip(-np.diff(fr, axis=0), 0, None).mean(axis=(1, 2))
t = t0 + (np.arange(len(d)) + 1) / 30
words = np.array([w[1] for L in T['inscr'] for w in L['w'] if t0 + 1 < w[1] < t1 - 1])
lags = np.arange(-0.5, 0.51, 1 / 30)
sc = [np.interp(words + l + 0.06, t, d).mean() for l in lags]   # +0.06: text fades in over 0.16 s after the word time
base = np.median(d)
best = lags[int(np.argmax(sc))]
print(f'{len(words)} words; best lag {best*1000:+.0f} ms (0 = text appears when sung); peak/median {max(sc)/base:.2f}')
for l, v in zip(lags[::3], sc[::3]): print(f'  {l*1000:+5.0f} ms  {v/base:5.2f} ' + '#' * int(20 * v / max(sc)))
