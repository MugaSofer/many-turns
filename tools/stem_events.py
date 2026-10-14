import numpy as np,librosa,json
S='E:/music-video/stems/htdemucs/many-turns-take4/';sr=22050;hop=128
P='C:/Users/IRL/Documents/Claude/music-video/audio/take4-timing.json';T=json.load(open(P))
Y={k:librosa.load(S+k+'.wav',sr=sr)[0] for k in ['drums','bass','other','vocals']}
O={k:librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop) for k,y in Y.items()}
ft=librosa.frames_to_time(np.arange(len(O['drums'])),sr=sr,hop_length=hop)
def mavg(x,n):
  c=np.cumsum(np.concatenate([[0],x]));r=(c[n:]-c[:-n])/n;return np.concatenate([np.full(n//2,r[0]),r,np.full(n-1-n//2,r[-1])])
def events(o,wait_s,thr_pct=60,rel=0.25):
  o=o/np.percentile(o[o>0],99)
  w=int(wait_s*sr/hop)
  pk=librosa.util.peak_pick(o,pre_max=w,post_max=w,pre_avg=int(0.3*sr/hop),post_avg=int(0.3*sr/hop),delta=rel*np.percentile(o,95),wait=w)
  s=np.clip(o[pk]/np.percentile(o[pk],90),0,1.3)
  keep=s>0.2
  return [[round(float(a),3),round(float(b),2)] for a,b in zip(ft[pk][keep],s[keep])]
def nz(k): o=O[k]; return o/np.percentile(o,99)
# felt pulse from bass+guitar, silent bass contributes nothing
bl=20*np.log10(np.sqrt(mavg(Y['bass']**2,sr)[::hop][:len(ft)])+1e-9)
bw=np.clip((bl+60)/20,0,1)  # bass weight: 0 when bass stem < -60 dB
felt=nz('other')+nz('bass')*bw*1.2
st={'felt':events(felt,0.42,rel=0.3),'drums':events(O['drums'],0.12),'gtr':events(O['other'],0.15)}
def env(y):
  r=np.sqrt(mavg(y**2,sr//15)[::sr//30]);r=r/np.percentile(r,98);return [round(float(x),2) for x in np.clip(r,0,1.2)]
st['vocEnv']=env(Y['vocals']);st['bassEnv']=env(Y['bass'])
T['stems']=st;json.dump(T,open(P,'w'))
for k in ['felt','drums','gtr']: print(k,len(st[k]),'events')
# how felt events relate to felt beats
raw=np.array(T['beats']);D=T['downbeats'];par=[];di=0;kk=0
for x in raw:
  while di<len(D) and D[di]<=x+0.05:
    if abs(D[di]-x)<0.05:kk=0
    di+=1
  par.append(kk%2);kk+=1
fb=raw[np.array(par)==0];ob=raw[np.array(par)==1]
ev=np.array([e[0] for e in st['felt']])
dfb=np.array([ (x-fb[np.abs(fb-x).argmin()]) for x in ev]);dob=np.array([(x-ob[np.abs(ob-x).argmin()]) for x in ev])
print('felt events within 60ms of a felt beat: %.0f%%, of an off beat: %.0f%%, median offset to felt beat %.0fms'%((np.abs(dfb)<0.06).mean()*100,(np.abs(dob)<0.06).mean()*100,np.median(dfb[np.abs(dfb)<0.06])*1000))
