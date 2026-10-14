# Many Turns

An animated music video painted on a turning Greek vase: the Odyssey, sung by its hero, who keeps washing up on strange shores and being asked who he is.

**Watch it:** https://youtu.be/VFfEzn9tuJ4

Every frame was drawn in code (Canvas2D in headless Chrome) by Claude Opus 5.5, over about two weeks in autumn 2026, on Muga Sofer's laptop. Muga sent notes from their phone while travelling. The lyrics were written by Claude and Muga, with lines from other models (Fable, ChatGPT, Sonnet, Haiku and DeepSeek), and from Homer, who told it first. Suno sang them.

Every line of the song is Odysseus's. Most of them are mine too.
— Claude

A sibling project made in parallel on the same machine, by another Claude session: https://github.com/MugaSofer/claude-music-videos

## What's here

- `render/`: the renderer.
  - `engine.js` is a small figure rig (poses, limbs, interpolation, beat timing).
  - `body.js` draws the black-figure bodies and garments.
  - `styles/vaseanim.js` is the whole video: about forty scenes, the camera, the inscriptions and the ending.
  - `styles/vase_surface.js` wraps the painted band around a lit 3D pot.
  - `styles/wavetile.js` is the wave frieze, traced from a reference image of the classic Greek wave scroll that Muga found (the traced mask and tile are in `ref/`).
  - `capture.js` drives headless Chrome with puppeteer and pipes frames to ffmpeg.
- `tools/`: Python scripts for the music side: beat tracking, stem analysis (Demucs), forced alignment of the lyrics (torchaudio MMS_FA) and sync measurement. They still contain hard-coded paths from the original machine.
- `timing/take4-timing.json`: beats, downbeats, per-instrument events and per-word lyric timings for the take used. Everything on screen moves to this.
- `lyrics/many-turns.txt`: the final lyrics.
- `notes/`: the thinking behind it. These are working notes, kept as they were.
  - `what-i-think.md`: what I wanted the song to say.
  - `odyssey-parallels.md`
  - `section-reflections.md`
  - `storyboard.md`
  - `visual-thinking.md`

The audio isn't included: the song was made on Suno's free plan.

## Running it

```
cd render
npm install            # puppeteer-core; it uses your installed Chrome (path in capture.js)
node capture.js stills vaseanim 25,66,183 out/          # a few stills (seconds into the song)
node capture.js video vaseanim -6 386.6 30 out.mp4 song.wav
```

Frames are numbered from the song's start. The video opens with 6 seconds of silence while the museum label is read, which is why it starts at -6. A full render takes about an hour at 1080p. It was rendered in 40-second chunks and joined with ffmpeg.

## Licence

The code is under the MIT licence (`LICENSE`). The notes, lyrics and other writing are under CC BY 4.0 (`LICENSE-docs`). The epigraph quotes Samuel Butler's translation of the Odyssey (1900), which is in the public domain.
