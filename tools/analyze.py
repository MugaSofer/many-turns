"""Rough structural analysis of a song: tempo over time, loudness curve, section boundaries."""
import sys, numpy as np, librosa
path=sys.argv[1]
y,sr=librosa.load(path,sr=22050,mono=True)
dur=len(y)/sr
hop=512
rms=librosa.feature.rms(y=y,hop_length=hop)[0]
t=librosa.frames_to_time(np.arange(len(rms)),sr=sr,hop_length=hop)
tempo,beats=librosa.beat.beat_track(y=y,sr=sr,hop_length=hop)
bt=librosa.frames_to_time(beats,sr=sr,hop_length=hop)
ibi=np.diff(bt)
print(f"{path}: {dur:.1f}s, global tempo {float(np.atleast_1d(tempo)[0]):.1f} bpm, {len(bt)} beats")
# tempo & beat regularity per 30s window
for w0 in range(0,int(dur),30):
    m=(bt[1:]>=w0)&(bt[1:]<w0+30)
    if m.sum()>3:
        d=ibi[m]; print(f"  {w0:3d}-{w0+30:3d}s  bpm {60/np.median(d):6.1f}  beat jitter {np.std(d)/np.median(d)*100:5.1f}%  loud {20*np.log10(rms[(t>=w0)&(t<w0+30)].mean()+1e-9):6.1f} dB")
# sections: novelty on chroma+mfcc, pick ~14 boundaries
C=librosa.feature.chroma_cqt(y=y,sr=sr,hop_length=hop)
M=librosa.feature.mfcc(y=y,sr=sr,hop_length=hop,n_mfcc=13)
X=np.vstack([librosa.util.normalize(C,axis=0),librosa.util.normalize(M,axis=1)])
X=librosa.util.sync(X,beats,aggregate=np.median)
b=librosa.segment.agglomerative(X,16)
bt2=np.concatenate([[0],bt])
bounds=[bt2[min(i,len(bt2)-1)] for i in b]
print("  section starts (s):",", ".join(f"{x:.0f}" for x in bounds))
# quiet passages (bridge etc)
sm=np.convolve(rms,np.ones(200)/200,'same'); thr=np.percentile(sm,20)
q=t[sm<thr]
if len(q):
    runs=np.split(q,np.where(np.diff(q)>1)[0]+1)
    print("  quiet stretches:",", ".join(f"{r[0]:.0f}-{r[-1]:.0f}s" for r in runs if r[-1]-r[0]>4))
