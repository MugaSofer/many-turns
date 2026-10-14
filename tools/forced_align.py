import json, torch, torchaudio, re, numpy as np
T=json.load(open('C:/Users/IRL/Documents/Claude/music-video/audio/take4-timing.json'))
bundle=torchaudio.pipelines.MMS_FA
model=bundle.get_model(with_star=False).eval(); tok=bundle.get_tokenizer(); aligner=bundle.get_aligner()
import soundfile as sf; a,sr=sf.read('E:/music-video/stems/htdemucs/many-turns-take4/vocals.wav',always_2d=True); wav=torch.tensor(a.mean(1),dtype=torch.float32)[None]
wav=torchaudio.functional.resample(wav,sr,bundle.sample_rate); SR=bundle.sample_rate
norm=lambda w: re.sub(r"[^a-z']","",w.lower()).replace("'","")
out=[]
for L in T['inscr_orig']:
    s=max(0,L['s']-0.6); e=L['e']+0.8
    seg=wav[:,int(s*SR):int(e*SR)]
    words=[norm(w) for w,_ in L['w']]; keep=[i for i,w in enumerate(words) if w]
    with torch.inference_mode():
        em,_=model(seg); 
        spans=aligner(em[0],tok([words[i] for i in keep]))
    ratio=seg.shape[1]/em.shape[1]/SR
    starts={keep[j]:s+sp[0].start*ratio for j,sp in enumerate(spans)}
    out.append([round(starts.get(i,L['w'][i][1]),3) for i in range(len(words))])
json.dump(out,open('E:/music-video/audio/fa_starts.json','w'))
d=np.array([a-b[1] for L,o in zip(T['inscr_orig'],out) for a,b in zip(o,L['w'])])
print('lines',len(out),'mean diff vs whisper %.0fms, median |d| %.0fms, >150ms: %d of %d'%(d.mean()*1000,np.median(np.abs(d))*1000,(np.abs(d)>0.15).sum(),len(d)))
