"""Align lyric lines (with [section] tags) to a words.json transcript; add beat grid. Writes timing JSON."""
import json, re, sys, difflib, numpy as np, librosa
lyr_path, words_path, audio_path, out_path = sys.argv[1:5]
words=[w for seg in json.load(open(words_path)) for w in seg['words']]
wt=[re.sub(r"[^a-z']","",w['w'].lower()) for w in words]
lines=[]; section=None
for raw in open(lyr_path,encoding='utf-8').read().splitlines():
    l=raw.strip()
    if not l: continue
    if l.startswith('['):
        tag=l.strip('[]')
        if tag.split(':')[0].strip() in ('F','M','Female','Male','Female Vocal','Male Vocal','Male alone','Faster','Lead, quiet','Female voice','Male voice'):
            section=section  # voice tag, keep section
            continue
        section=tag; continue
    l=re.sub(r"\[[^\]]*\]","",l)
    lines.append({'section':section,'text':l,'toks':[re.sub(r"[^a-z']","",t.lower()) for t in l.split()]})
pos=0
for L in lines:
    n=len(L['toks']); best=(0,None)
    for s in range(pos, min(pos+400, len(wt)-1)):
        cand=wt[s:s+n]
        r=difflib.SequenceMatcher(None,L['toks'],cand).ratio()
        if r>best[0]: best=(r,s)
        if r>0.95: break
    r,s=best
    if s is not None and r>0.5:
        L['start']=words[s]['s']; L['end']=words[min(s+n-1,len(words)-1)]['e']; L['match']=round(r,2); pos=s+max(1,n-2)
    else:
        L['start']=L['end']=None; L['match']=round(r,2)
    del L['toks']
y,sr=librosa.load(audio_path,sr=22050,mono=True)
tempo,beats=librosa.beat.beat_track(y=y,sr=sr)
bt=librosa.frames_to_time(beats,sr=sr).tolist()
rms=librosa.feature.rms(y=y)[0]; rt=librosa.frames_to_time(np.arange(len(rms)),sr=sr)
# downsample loudness to 10 Hz for animation use
env=np.interp(np.arange(0,len(y)/sr,0.1),rt,rms); env=(env/env.max()).round(3).tolist()
json.dump({'duration':len(y)/sr,'tempo':float(np.atleast_1d(tempo)[0]),'beats':bt,'loudness_10hz':env,'lines':lines},open(out_path,'w'),indent=1)
secs={}
for L in lines:
    if L['start'] is None: continue
    s=secs.setdefault(L['section'],[L['start'],L['end']]); s[1]=L['end']
for k,(a,b) in sorted(secs.items(),key=lambda x:x[1][0]): print(f"{a:6.1f}-{b:6.1f}  {k}")
bad=[L for L in lines if L['start'] is None or L['match']<0.7]
print('weak matches:',[(L['text'][:40],L['match']) for L in bad])
