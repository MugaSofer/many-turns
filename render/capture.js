// node capture.js stills <style,...> <scene,...> <outdir>
// node capture.js video <style> <t0> <t1> <fps> <out.mp4> [audio.wav]
const puppeteer = require('puppeteer-core'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const [mode, ...a] = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--allow-file-access-from-files', '--disable-gpu-sandbox', '--user-data-dir=' + path.join(process.env.TEMP, 'mv-chrome-' + process.pid)] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[page error]', e.message));
  // song timing (beats, groove, loudness, lyric lines), set before any page script runs
  // TIMING=path/to/timing.json overrides the default (Many Turns take 4)
  const tp = process.env.TIMING ? path.resolve(process.env.TIMING) : path.resolve(__dirname, '..', 'timing', 'take4-timing.json');
  if (fs.existsSync(tp)) await page.evaluateOnNewDocument(d => { window.TIMING = d; }, JSON.parse(fs.readFileSync(tp, 'utf8')));
  await page.goto(require('url').pathToFileURL(path.resolve(__dirname, process.env.PAGE || 'page.html')).href);
  await page.waitForFunction(() => !window.WAVE_IMG || (window.WAVE_IMG.complete && window.WAVE_IMG.naturalWidth > 0), { timeout: 10000 });
  if (mode === 'stills') {
    const [styles, scenes, out] = a; fs.mkdirSync(out, { recursive: true });
    for (const s of styles.split(',')) for (const sc of scenes.split(',')) {
      const t0 = Date.now();
      const url = await page.evaluate((s, sc) => window.still(s, sc), s, sc);
      fs.writeFileSync(path.join(out, `${s}-${sc.replace(/:/g, '-')}.png`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${s}-${sc} ${Date.now() - t0}ms`);
    }
  } else if (mode === 'probe') {
    // node capture.js probe <style> <t0> <t1> <fps> <out.json>: per frame, which lyric lines are drawn and how visibly
    const [style, t0s, t1s, fpss, out] = a, res = [];
    for (let t = +t0s; t < +t1s; t += 1 / +fpss) res.push([+t.toFixed(3), await page.evaluate((s, t) => { window.__INS = []; window.frame(s, t); return window.__INS; }, style, t)]);
    fs.writeFileSync(out, JSON.stringify(res));
  } else if (mode === 'video') {
    const [style, t0s, t1s, fpss, out, audio] = a, t0 = +t0s, t1 = +t1s, fps = +fpss;
    const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (audio) ffArgs.push('-ss', String(t0), '-t', String(t1 - t0), '-i', audio);
    ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium');
    if (audio) ffArgs.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
    ffArgs.push(out);
    const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round((t1 - t0) * fps), start = Date.now();
    for (let i = 0; i < n; i++) {
      const url = await page.evaluate((s, t) => window.frame(s, t), style, t0 + i / fps);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 100 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - start) / (i + 1)).toFixed(0)}ms/frame`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
