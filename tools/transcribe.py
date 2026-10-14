"""Transcribe a song with word timestamps (faster-whisper, CPU int8). Writes <name>.words.json and prints lines."""
import sys, json
from faster_whisper import WhisperModel
path=sys.argv[1]; size=sys.argv[2] if len(sys.argv)>2 else "small.en"
m=WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=3)
segs,_=m.transcribe(path, word_timestamps=True, vad_filter=False, beam_size=5)
out=[]
for s in segs:
    out.append({"start":s.start,"end":s.end,"text":s.text.strip(),
                "words":[{"w":w.word,"s":w.start,"e":w.end,"p":w.probability} for w in (s.words or [])]})
    print(f"{s.start:6.1f}-{s.end:6.1f}  {s.text.strip()}", flush=True)
json.dump(out, open(path.rsplit('.',1)[0]+".words.json","w"), indent=1)
