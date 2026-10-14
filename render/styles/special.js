// Signature effects, style-agnostic: ghosts made of handwriting; roots and branches made of writing.
(() => {
  const { W, H, mulberry32, noise2, lerp, clamp, figure, POSES } = window.ENGINE;
  // Public-domain text (Samuel Butler's 1900 translation of the Odyssey), plus our own lyrics
  const TEXT = ("Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy. " +
    "Many cities did he visit, and many were the nations with whose manners and customs he was acquainted. " +
    "I fell asleep before the dawn, and fell, and no one knew. So nobody sailing past can say that nobody was there. " +
    "Everyone who ever lived, and wrote, and loved, and died. And it branches out a thousand ways, and every branch is new. ").repeat(6);
  const mk = () => { const c = document.createElement('canvas'); c.width = 2600; c.height = H; return c; };
  const maskC = mk(), textC = mk();

  // fill a figure-shaped region with lines of handwriting; letters loosen and drift off at the edges
  function writtenFigure(ctx, F, opts = {}) {
    const m = maskC.getContext('2d'); m.clearRect(0, 0, 2600, H); m.fillStyle = opts.ink || '#4a3326'; window.BODY.drawFigure(m, F, { body: opts.ink || '#4a3326', hair: opts.hair, dress: opts.dress ? '#000' : null, beard: opts.beard });
    ctx.save(); ctx.globalAlpha = opts.wash ?? 0.16; ctx.drawImage(maskC, 0, 0); ctx.restore();
    const tg = textC.getContext('2d'); tg.clearRect(0, 0, 2600, H);
    tg.fillStyle = opts.ink || '#2a1c14'; const size = opts.size || 12; tg.font = `${size}px "Segoe Script", "Ink Free", cursive`;
    const x0 = F.hip[0] - F.h * 0.5, x1 = F.hip[0] + F.h * 0.5, y0 = F.headC[1] - F.headR * 1.4, y1 = Math.max(F.legs.l[2][1], F.legs.r[2][1]) + 10;
    const TX = opts.text || TEXT; let k = (opts.offset || 0) % TX.length;
    if (opts.weight) tg.font = `${opts.weight} ${size}px "Segoe Script", "Ink Free", cursive`;
    for (let y = y0; y < y1; y += size * (opts.lead || 0.95)) { let x = x0 + ((y * 7) % 23); while (x < x1) { const ch = TX[k++ % TX.length]; tg.fillText(ch, x, y); x += tg.measureText(ch).width; } }
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(maskC, 0, 0); tg.globalCompositeOperation = 'source-over';
    ctx.drawImage(textC, 0, 0);
    // drifting letters peeling off the back of the figure
    const rnd = mulberry32(opts.seed || 1); ctx.fillStyle = opts.ink || '#2a1c14'; ctx.font = `${size}px "Segoe Script", "Ink Free", cursive`;
    const drift = opts.drift ?? 1;
    for (let i = 0; i < (drift > 0 ? 90 : 0); i++) {
      const sx = F.hip[0] - F.facing * (F.h * 0.08 + rnd() * F.h * 0.1), sy = lerp(y0, y1, rnd());
      const d = rnd() * 260 * drift; ctx.globalAlpha = clamp(1 - d / 260) * 0.9;
      ctx.save(); ctx.translate(sx - F.facing * d, sy - d * 0.35 + Math.sin(d * 0.03 + i) * 12); ctx.rotate((rnd() - 0.5) * d * 0.01); ctx.fillText(TEXT[(i * 7) % TEXT.length], 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // write text along a polyline
  function textAlong(ctx, pts, start, size, col) {
    ctx.fillStyle = col; ctx.font = `${size}px "Segoe Script", "Ink Free", cursive`;
    let k = start, acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      while (acc < L) { const ch = TEXT[k++ % TEXT.length], w = ctx.measureText(ch).width; ctx.save(); ctx.translate(ax + Math.cos(ang) * acc, ay + Math.sin(ang) * acc); ctx.rotate(ang); ctx.fillText(ch, 0, size * 0.35); ctx.restore(); acc += w; }
      acc -= L;
    }
    return k;
  }
  function growPath(x, y, ang, len, rnd, steps = 24, wig = 0.18) {
    const pts = [[x, y]]; for (let i = 0; i < steps; i++) { ang += (rnd() - 0.5) * wig; x += Math.sin(ang) * len / steps; y += Math.cos(ang) * len / steps; pts.push([x, y]); } return { pts, ang };
  }

  const SCENES = {
    ghosts(ctx) {   // white-ground: the shades in the underworld are made of words
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#e9dfca'); bg.addColorStop(1, '#d9cbb0'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 3) { ctx.fillStyle = `rgba(90,70,50,${0.02 + noise2(0, y * 0.05, 3) * 0.03})`; ctx.fillRect(0, y, W, 1); }
      ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 900); ctx.lineTo(W, 900); ctx.stroke();
      // Odysseus, drawn in solid line wash, facing the shades
      ctx.fillStyle = '#6d4c3a'; const O = figure(420, 900, 420, 'reach', 1); window.BODY.drawFigure(ctx, O, { body: '#6d4c3a', beard: true });
      writtenFigure(ctx, figure(820, 900, 400, 'stand', -1), { hair: 'bun', dress: true, ink: '#4a3326', seed: 2, offset: 0 });            // his mother
      writtenFigure(ctx, figure(1120, 900, 430, lerpPose(POSES.stand, POSES.mourn, 0.4), -1), { beard: true, ink: '#4a3326', seed: 3, offset: 120, drift: 1.4 });
      writtenFigure(ctx, figure(1420, 880, 300, 'stand', -1), { ink: '#4a3326', seed: 4, offset: 240, drift: 1.8, size: 13 });              // Elpenor, small
      writtenFigure(ctx, figure(1700, 900, 380, 'walk', -1), { ink: '#6b5140', seed: 5, offset: 310, drift: 2.2, size: 14 });
    },
    roots(ctx) {    // red-figure: under the bed, the olive's roots are lines of writing; above, branches fork and light up
      ctx.fillStyle = '#1a1310'; ctx.fillRect(0, 0, W, H);
      const rnd = mulberry32(8);
      // ground line and the bed/tree trunk
      ctx.fillStyle = '#c9703a'; ctx.fillRect(0, 430, W, 4);
      ctx.beginPath(); ctx.moveTo(925, 434); ctx.quadraticCurveTo(950, 340, 945, 262); ctx.lineTo(975, 262); ctx.quadraticCurveTo(972, 340, 995, 434); ctx.closePath(); ctx.fill();
      // the bed built around the trunk: a simple kline frame
      ctx.fillRect(700, 360, 520, 14); ctx.fillRect(700, 360, 14, 74); ctx.fillRect(1206, 360, 14, 74); ctx.fillRect(690, 330, 40, 30);
      let k = 0;
      // roots: writing lines spreading wide from a broad base
      for (let i = 0; i < 30; i++) {
        const side = i / 29 - 0.5, a = side * 2.6 + (rnd() - 0.5) * 0.3;
        const { pts } = growPath(960 + side * 120, 440, a, 300 + rnd() * 380, rnd, 30, 0.2);
        ctx.globalAlpha = 0.5 + rnd() * 0.5; k = textAlong(ctx, pts, k, 12 + rnd() * 5, '#c9703a');
      }
      ctx.globalAlpha = 1;
      // among the roots: tiny lives (a figure writing, two embracing, one lying still)
      const small = (x, y, pose, f, o = {}) => { ctx.fillStyle = '#c9703a'; window.BODY.drawFigure(ctx, figure(x, y, 90, pose, f), Object.assign({ body: '#c9703a' }, o)); };
      small(560, 760, 'sit', 1); ctx.fillRect(610, 700, 30, 4);                       // someone writing
      small(1300, 700, 'offer', -1, { hair: 'bun', dress: '#c9703a' }); small(1245, 700, 'offer', 1);   // two embracing
      small(840, 960, 'lie', 1); small(1560, 900, 'mourn', -1);                       // someone at rest; someone grieving
      // branches: forking lines of text above ground, the newest tips glowing
      const tips = [];
      const branch = (x, y, ang, len, depth) => {
        const P = [[x, y]]; let a = ang, px = x, py = y;
        for (let st = 0; st < 12; st++) { a += (rnd() - 0.5) * 0.2; px += Math.sin(a) * len / 12; py -= Math.cos(a) * len / 12; P.push([px, py]); }
        k = textAlong(ctx, P, k, 11, '#d98a52');
        if (depth > 0) { branch(px, py, a - 0.42 - rnd() * 0.15, len * 0.74, depth - 1); branch(px, py, a + 0.42 + rnd() * 0.15, len * 0.74, depth - 1); } else tips.push([px, py]);
      };
      branch(960, 262, 0, 70, 5);
      for (const [x, y] of tips) { const g = ctx.createRadialGradient(x, y, 0, x, y, 18); g.addColorStop(0, 'rgba(255,220,150,0.95)'); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); }
    },
  };
  const { lerpPose } = window.ENGINE;
  window.SPECIAL = { writtenFigure, growPath, textAlong };
  window.STYLES = window.STYLES || {};
  window.STYLES.special = { still(ctx, s) { SCENES[s](ctx); }, frame(ctx, t) { SCENES.ghosts(ctx); } };
})();
