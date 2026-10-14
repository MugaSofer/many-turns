// Style C: sumi-style ink and watercolour washes on parchment.
(() => {
  const { W, H, mulberry32, noise2, fbm, figure, taper, drawOar } = window.ENGINE;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const parch = mk(), inkC = mk(), mask = mk();
  (() => { // parchment, generated once
    const g = parch.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.003, y * 0.003, 1, 5), f = noise2(x * 0.6, y * 0.05, 2), stain = fbm(x * 0.001 + 5, y * 0.001, 3, 3);
      const k = 0.9 + (n - 0.5) * 0.16 + (f - 0.5) * 0.04 - Math.max(0, stain - 0.62) * 0.5;
      const e = Math.min(x, y, W - x, H - y), edge = Math.max(0, 1 - e / 160) * 0.18;
      const i = (y * W + x) * 4; d[i] = 238 * (k - edge); d[i + 1] = 224 * (k - edge * 1.1); d[i + 2] = 196 * (k - edge * 1.3); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // dry-brush mask: streaky noise used to erode ink fills
    const m = mask.getContext('2d'), mi = m.createImageData(W, H), md = mi.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = noise2(x * 0.02, y * 0.35, 7) * 0.6 + noise2(x * 0.3, y * 0.3, 8) * 0.4;
      const i = (y * W + x) * 4; md[i] = md[i + 1] = md[i + 2] = 0; md[i + 3] = s > 0.3 ? 255 : Math.max(0, (s - 0.18) / 0.12) * 255;
    }
    m.putImageData(mi, 0, 0);
  })();
  function wash(ctx, color, pts, blur = 18, alpha = 0.55) {   // watercolour: soft fill with a darker settled edge
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha; ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = color; window.BODY.smoothPath(ctx, pts); ctx.fill();
    ctx.filter = 'blur(2px)'; ctx.globalAlpha = alpha * 0.5; ctx.strokeStyle = color; ctx.lineWidth = 3; window.BODY.smoothPath(ctx, pts); ctx.stroke();
    ctx.restore();
  }
  function beginInk() { const g = inkC.getContext('2d'); g.clearRect(0, 0, W, H); g.fillStyle = '#1c140f'; g.strokeStyle = '#1c140f'; return g; }
  function endInk(ctx, alpha = 0.92) {
    const g = inkC.getContext('2d'); g.save(); g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1; g.drawImage(mask, 0, 0); g.restore();
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(inkC, 0, 0); ctx.restore();
  }
  function brushLine(g, pts, w) { // pressure-varying brush stroke
    for (let i = 0; i < pts.length - 1; i++) { const t = i / (pts.length - 1); taper(g, pts[i], pts[i + 1], w * (0.4 + Math.sin(t * Math.PI) * 0.8), w * (0.4 + Math.sin((i + 1) / (pts.length - 1) * Math.PI) * 0.8)); }
  }
  function person(g, x, y, h, pose, facing, o = {}) { const F = figure(x, y, h, pose, facing); window.BODY.drawFigure(g, F, { body: '#1c140f', beard: o.beard, hair: o.hair, dress: o.dress ? '#1c140f' : null }); return F; }
  function seal(ctx, x, y) { // red chop seal with a tiny meander
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#b03a2e'; ctx.globalAlpha = 0.85; ctx.fillRect(x, y, 70, 70);
    ctx.strokeStyle = '#f0e2c8'; ctx.lineWidth = 4; ctx.strokeRect(x + 8, y + 8, 54, 54); ctx.beginPath(); ctx.moveTo(x + 18, y + 52); ctx.lineTo(x + 18, y + 18); ctx.lineTo(x + 52, y + 18); ctx.lineTo(x + 52, y + 40); ctx.lineTo(x + 32, y + 40); ctx.lineTo(x + 32, y + 30); ctx.stroke(); ctx.restore();
  }
  const SCENES = {
    arrival(ctx) {
      ctx.drawImage(parch, 0, 0);
      wash(ctx, '#7fa7b8', [[0, 600], [700, 580], [1400, 610], [1920, 590], [1920, 700], [1100, 690], [0, 720]], 22, 0.55);       // sea
      wash(ctx, '#e7b77a', [[1300, 180], [1500, 150], [1560, 300], [1380, 340]], 30, 0.5);                                       // sun glow
      wash(ctx, '#b03a2e', [[860, 560], [940, 560], [930, 700], [850, 720], [820, 640]], 6, 0.75);                               // the cloak
      wash(ctx, '#6b7a44', [[380, 720], [560, 680], [640, 760], [520, 840], [360, 820]], 14, 0.6);                               // bush
      const g = beginInk(), rnd = mulberry32(7);
      brushLine(g, [[0, 730], [300, 722], [800, 735], [1300, 728], [1920, 736]], 7);                                          // shoreline
      for (let i = 0; i < 9; i++) { const x = 60 + i * 190; brushLine(g, [[x, 640], [x + 40, 628], [x + 90, 640]], 4); }       // wave marks
      person(g, 470, 800, 300, 'kneel', 1, { beard: true });
      for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 90; g.save(); g.translate(520 + Math.cos(a) * r * 1.3, 760 + Math.sin(a) * r * 0.6); g.rotate(rnd() * 3); g.beginPath(); g.ellipse(0, 0, 20, 5, 0, 0, 7); g.fill(); g.restore(); }
      person(g, 1000, 820, 330, 'offer', -1, { hair: 'bun', dress: true });
      person(g, 1300, 810, 320, 'reach', -1, { hair: 'bun', dress: true });
      person(g, 1530, 805, 310, 'walk', -1, { hair: 'bun', dress: true });
      g.lineWidth = 3; g.beginPath(); g.arc(1380, 380, 18, 0, 7); g.stroke();
      endInk(ctx);
      seal(ctx, 1760, 900);
    },
    elpenor(ctx) {
      ctx.drawImage(parch, 0, 0);
      wash(ctx, '#2f4a6b', [[0, 0], [1920, 0], [1920, 620], [0, 640]], 40, 0.7);                        // night wash
      wash(ctx, '#1f3552', [[0, 0], [1920, 0], [1920, 300], [0, 330]], 50, 0.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,245,220,0.6)'; ctx.beginPath(); ctx.arc(420, 200, 60, 0, 7); ctx.fill();
      const rnd = mulberry32(3); for (let i = 0; i < 70; i++) { ctx.globalAlpha = 0.3 + rnd() * 0.5; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * 560, 1 + rnd() * 2, 0, 7); ctx.fill(); } ctx.restore();
      wash(ctx, '#3d5d78', [[0, 640], [1920, 620], [1920, 720], [0, 740]], 16, 0.6);
      const g = beginInk();
      brushLine(g, [[0, 760], [500, 750], [960, 770], [1500, 755], [1920, 765]], 8);
      g.beginPath(); g.moveTo(720, 830); g.quadraticCurveTo(960, 600, 1200, 830); g.closePath(); g.fill();
      drawOar(g, [960, 720], [960, 310]);
      g.beginPath(); g.moveTo(1450, 690); g.lineTo(1760, 690); g.lineTo(1720, 720); g.lineTo(1490, 720); g.closePath(); g.fill(); g.fillRect(1600, 520, 6, 170);
      person(g, 430, 900, 320, 'mourn', 1, { beard: true });
      endInk(ctx);
      // the shade: only a faint wash, no ink
      ctx.save(); ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'screen'; const F = figure(1260, 650, 200, 'stand', -1); window.BODY.drawFigure(ctx, F, { body: '#dfe8f0' }); ctx.restore();
      seal(ctx, 1760, 900);
    },
    tree(ctx) {
      ctx.drawImage(parch, 0, 0);
      wash(ctx, '#e3b35a', [[0, 640], [1920, 610], [1920, 800], [0, 820]], 20, 0.55);                   // wheat
      wash(ctx, '#8ea05a', [[0, 800], [1920, 790], [1920, 1080], [0, 1080]], 25, 0.45);
      wash(ctx, '#6f8a4a', [[620, 220], [980, 120], [1340, 230], [1300, 470], [960, 520], [640, 440]], 26, 0.6); // canopy wash
      const g = beginInk(), rnd = mulberry32(5);
      taper(g, [960, 870], [960, 640], 22, 24); taper(g, [960, 645], [930, 540], 30, 24); taper(g, [930, 540], [985, 440], 24, 18);
      [[-1.2, 300], [-0.6, 240], [0.1, 200], [0.7, 250], [1.25, 300]].forEach(([a, l]) => brushLine(g, [[985, 440], [985 + Math.sin(a) * l * 0.5, 440 - Math.cos(a) * l * 0.35], [985 + Math.sin(a) * l, 440 - Math.cos(a) * l * 0.55]], 12));
      for (let i = 0; i < 260; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()); g.save(); g.translate(980 + Math.cos(a) * r * 330, 330 + Math.sin(a) * r * 150); g.rotate(rnd() * 3); g.beginPath(); g.ellipse(0, 0, 18, 4, 0, 0, 7); g.fill(); g.restore(); }
      for (let i = 0; i < 70; i++) { const x = rnd() * W; brushLine(g, [[x, 820], [x + 4, 740], [x + 8, 690]], 3); }
      person(g, 700, 900, 290, 'sit', 1, { beard: true }); person(g, 1250, 900, 290, 'sit', -1, { hair: 'bun', dress: true });
      person(g, 1420, 900, 220, 'sit', -1, {}); person(g, 540, 900, 270, 'sit', 1, {});
      endInk(ctx);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#c9a47a'; ctx.fillRect(954, 660, 12, 205); ctx.restore(); // the oar in the trunk
      seal(ctx, 1760, 900);
    },
  };
  window.STYLES = window.STYLES || {};
  window.STYLES.ink = { still(ctx, scene) { ctx.clearRect(0, 0, W, H); SCENES[scene](ctx); }, frame(ctx, t) { SCENES.arrival(ctx); } };
})();
