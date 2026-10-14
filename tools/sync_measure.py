import subprocess,numpy as np,json
T=json.load(open('C:/Users/IRL/Documents/Claude/music-video/audio/take4-timing.json'));raw=np.array(T['beats'])
W,H=160,90
r=subprocess.run(['ffmpeg','-loglevel','error','-i','E:/music-video/renders/draft6.mp4','-vf',f'scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True).stdout
fr=np.frombuffer(r,np.uint8).reshape(-1,H,W).astype(np.float32);d=np.abs(np.diff(fr,axis=0)).mean(axis=(1,2));t=(np.arange(len(d))+0.5)/30
P=np.median(np.diff(raw));phs=np.arange(-0.5,0.5,1/8)
for a,b,n in [(0,21,'intro'),(21,42,'v1'),(42,64,'ch1'),(64,101,'v2-3'),(101,142,'ch2+v4'),(142,193,'bridge+brk'),(193,231,'v5+ch3'),(231,268,'v6'),(268,305,'ch4+v7'),(305,352,'final'),(352,372,'outro')]:
  bb=raw[(raw>a+1)&(raw<b-1)];row=np.array([np.interp(bb+ph*P,t,d).mean() for ph in phs])
  print(f'{n:11s} peak@{phs[row.argmax()]:+.3f} beat  contrast {row.max()/row.min():.2f}')
