import numpy as np,librosa,json
S='E:/music-video/stems/htdemucs/many-turns-take4/';sr=22050
T=json.load(open('C:/Users/IRL/Documents/Claude/music-video/audio/take4-timing.json'));raw=np.array(T['beats']);D=T['downbeats']
par=[];di=0;k=0
for x in raw:
  while di<len(D) and D[di]<=x+0.05:
    if abs(D[di]-x)<0.05:k=0
    di+=1
  par.append(k%4);k+=1
par=np.array(par)
secs=[(0,21.4,'intro'),(21.4,42.2,'v1'),(42.2,64.2,'ch1'),(64.2,101.2,'v2-3'),(101.2,122.6,'ch2'),(122.6,142.1,'v4'),(142.1,171.2,'bridge'),(171.2,193.2,'break'),(193.2,231.3,'v5ch3'),(231.3,268.6,'v6'),(268.6,287.3,'ch4'),(287.3,305.6,'v7'),(305.6,352.5,'final'),(352.5,379.6,'outro')]
hop=128;out={}
for st in ['drums','bass','other','vocals']:
  y=librosa.load(S+st+'.wav',sr=sr)[0];o=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop);ft=librosa.frames_to_time(np.arange(len(o)),sr=sr,hop_length=hop)
  v=np.array([o[(ft>x-0.04)&(ft<x+0.04)].max() for x in raw]);out[st]=v
print('mean onset at beat position in bar 1/2/3/4 (normalized to max), per stem')
for a,c,n in secs:
  m=(raw>=a)&(raw<c);line=f'{n:6s}'
  for st,v in out.items():
    r=np.array([v[m&(par==p)].mean() if (m&(par==p)).any() else 0 for p in range(4)]);r=r/(r.max()+1e-9)
    line+=f' | {st[:4]} '+' '.join(f'{x:.2f}' for x in r)
  print(line)
