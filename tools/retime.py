import numpy as np, soundfile as sf, librosa
y, sr = sf.read('E:/music-video/audio/many-turns-take4.wav', always_2d=True)
v, sr2 = sf.read('E:/music-video/stems/htdemucs/many-turns-take4/vocals.wav', always_2d=True)
v = np.stack([librosa.resample(v[:, c].astype(np.float32), orig_sr=sr2, target_sr=sr) for c in range(v.shape[1])], 1) if sr2 != sr else v
n = min(len(y), len(v)); y = y[:n]; v = v[:n]
a, b, gap_end = 21.36, 23.40, 23.40          # "I washed up" = [a, b); "on" starts at b
rate = (b - a) / (b - a - 0.26)               # finish 0.26 s early, leaving a breath before "on"
ia, ib = int(a * sr), int(b * sr)
seg = v[ia:ib]
st = np.stack([librosa.effects.time_stretch(seg[:, c].astype(np.float32), rate=rate) for c in range(seg.shape[1])], 1)
newv = np.zeros_like(seg); L = min(len(st), len(seg)); newv[:L] = st[:L]
# fade the tail of the stretched phrase so the breath is clean
f = int(0.03 * sr); newv[L - f:L] *= np.linspace(1, 0, f)[:, None]
# crossfade the edit in and out on the vocal difference
diff = newv - seg
w = np.ones(len(seg)); fi = int(0.02 * sr); w[:fi] = np.linspace(0, 1, fi); w[-fi:] = np.linspace(1, 0, fi)
out = y.copy(); out[ia:ib] += diff * w[:, None]
out = np.clip(out, -1, 1)
sf.write('E:/music-video/audio/many-turns-take4-retimed.wav', out, sr, subtype='PCM_16')
print('rate', round(rate, 3), 'sr', sr)
