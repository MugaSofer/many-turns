// Style B: layered cut paper with soft shadows and grain.
(() => {
  const { W, H, mulberry32, noise2, fbm, lerp, figure, taper, drawOar } = window.ENGINE;
  const tex = document.createElement('canvas'); tex.width = W; tex.height = H;
  (() => { // paper grain overlay, generated once
    const g = tex.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = (noise2(x * 0.9, y * 0.9, 1) - 0.5) * 30 + (fbm(x * 0.01, y * 0.01, 2, 3) - 0.5) * 18;
      const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 128 + n; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  })();
  function shadowOn(ctx, depth = 1) { ctx.shadowColor = 'rgba(20,10,5,0.35)'; ctx.shadowBlur = 14 * depth; ctx.shadowOffsetX = 4 * depth; ctx.shadowOffsetY = 7 * depth; }
  function shadowOff(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0; }
  // a layer whose top edge is y = f(x), cut with a slightly torn edge
  function layer(ctx, color, f, seed, depth = 1, bottom = H + 50) {
    shadowOn(ctx, depth); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-20, bottom);
    for (let x = -20; x <= W + 20; x += 6) ctx.lineTo(x, f(x) + (noise2(x * 0.08, 0, seed) - 0.5) * 3);
    ctx.lineTo(W + 20, bottom); ctx.closePath(); ctx.fill(); shadowOff(ctx);
  }
  function blob(ctx, color, cx, cy, r, seed, depth = 1) {
    shadowOn(ctx, depth); ctx.fillStyle = color; ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) { const rr = r * (1 + (noise2(Math.cos(a) * 2, Math.sin(a) * 2, seed) - 0.5) * 0.12); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); shadowOff(ctx);
  }
  function person(ctx, x, y, h, pose, facing, o = {}) {
    const F = figure(x, y, h, pose, facing);
    shadowOn(ctx, 0.8);
    const Hd = window.BODY.drawFigure(ctx, F, { body: o.skin || '#8a5a3c', dress: o.dress, cloak: o.cloak, beard: o.beard, hair: o.hair, hairColor: o.hairColor || '#2b1d17' });
    shadowOff(ctx);
    const e = Hd.map(0.55, -0.2); ctx.fillStyle = '#1d1410'; ctx.beginPath(); ctx.arc(e[0], e[1], F.headR * 0.08, 0, 7); ctx.fill();
    return F;
  }
  function finish(ctx) {   // grain + vignette
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.55; ctx.drawImage(tex, 0, 0); ctx.restore();
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,8,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  function leaves(ctx, cx, cy, rx, ry, n, rnd, cols) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      ctx.save(); ctx.translate(cx + Math.cos(a) * r * rx, cy + Math.sin(a) * r * ry); ctx.rotate(rnd() * Math.PI);
      if (i % 9 === 0) shadowOn(ctx, 0.5);
      ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse(0, 0, 26, 8, 0, 0, 7); ctx.fill(); shadowOff(ctx); ctx.restore();
    }
  }
  const SCENES = {
    arrival(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#f3d9b8'); sky.addColorStop(1, '#f7e8cf');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      blob(ctx, '#f6c27a', 1500, 300, 110, 3, 0.4);                                            // morning sun
      layer(ctx, '#c9a67c', x => 520 + Math.sin(x * 0.004) * 40 - x * 0.05, 1, 0.6);          // far headland
      layer(ctx, '#2f6f86', x => 600 + Math.sin(x * 0.02) * 8, 2, 0.8);                        // sea
      layer(ctx, '#3f86a0', x => 640 + Math.sin(x * 0.03 + 1) * 10, 3, 0.9);
      layer(ctx, '#eadbc0', x => 700 + Math.sin(x * 0.006) * 30 + (x < 500 ? (500 - x) * 0.12 : 0), 4, 1.2);  // sand
      layer(ctx, '#e0cca9', x => 860 + Math.sin(x * 0.01) * 20, 5, 1.2);
      const rnd = mulberry32(4);
      // olive bush he hides behind
      leaves(ctx, 520, 790, 120, 70, 90, rnd, ['#56663a', '#6e7d45', '#44542e']);
      person(ctx, 470, 860, 330, 'kneel', 1, { beard: true, skin: '#7a4b31', hairColor: '#2b1d17' });
      leaves(ctx, 600, 830, 70, 60, 40, rnd, ['#56663a', '#6e7d45']);
      const N = person(ctx, 1020, 900, 360, 'offer', -1, { skin: '#d9a57f', dress: '#b8483b', hair: 'bun' });
      const a = N.arms.l[2], c = N.arms.r[2]; shadowOn(ctx, 1); ctx.fillStyle = '#e7c562';
      window.BODY.smoothPath(ctx, [[a[0] + 6, a[1] - 4], [c[0] - 4, c[1] - 6], [c[0] - 30, c[1] + 70], [c[0] - 20, c[1] + 170], [a[0] - 120, a[1] + 185], [a[0] - 150, a[1] + 110], [a[0] - 60, a[1] + 40]]);
      ctx.fill(); shadowOff(ctx);
      person(ctx, 1330, 880, 340, 'reach', -1, { skin: '#d9a57f', dress: '#e6e0cf', hair: 'bun' });
      person(ctx, 1560, 870, 330, 'walk', -1, { skin: '#c9906a', dress: '#4f7a8a', hair: 'bun' });
      blob(ctx, '#f2efe6', 1400, 420, 22, 7, 0.6);
    },
    elpenor(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0e1a33'); sky.addColorStop(1, '#233a5c');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const rnd = mulberry32(12);
      for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(250,240,210,${0.4 + rnd() * 0.6})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * 0.55, 1 + rnd() * 2.5, 0, 7); ctx.fill(); }
      blob(ctx, '#f1e6c8', 420, 200, 70, 1, 0.5);
      layer(ctx, '#1b3150', x => 640 + Math.sin(x * 0.015) * 10, 2, 0.8);
      layer(ctx, '#244469', x => 690 + Math.sin(x * 0.02 + 2) * 12, 3, 0.9);
      layer(ctx, '#2e2a33', x => 760 + Math.sin(x * 0.004) * 25, 4, 1.2);                          // dark shore
      // the mound and the oar standing against the sky
      shadowOn(ctx, 1.4); ctx.fillStyle = '#3a3440'; ctx.beginPath(); ctx.moveTo(700, 820); ctx.quadraticCurveTo(960, 560, 1220, 820); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9a47a'; ctx.strokeStyle = '#c9a47a'; drawOar(ctx, [960, 700], [960, 300]); shadowOff(ctx);
      // ship passing, a lantern lit
      shadowOn(ctx, 0.6); ctx.fillStyle = '#12213a'; ctx.beginPath(); ctx.moveTo(1450, 660); ctx.lineTo(1780, 660); ctx.lineTo(1740, 700); ctx.lineTo(1490, 700); ctx.closePath(); ctx.fill();
      ctx.fillRect(1612, 460, 8, 200); ctx.beginPath(); ctx.moveTo(1540, 480); ctx.lineTo(1690, 480); ctx.lineTo(1680, 630); ctx.lineTo(1550, 630); ctx.closePath(); ctx.fill(); shadowOff(ctx);
      ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.arc(1760, 650, 6, 0, 7); ctx.fill();
      layer(ctx, '#1c1a22', x => 900 + Math.sin(x * 0.006) * 20, 6, 1.4);
      person(ctx, 420, 940, 330, 'mourn', 1, { beard: true, skin: '#5a3b2c' });
      // Elpenor's shade: a translucent vellum cut-out
      ctx.globalAlpha = 0.55; person(ctx, 1260, 640, 200, 'stand', -1, { skin: '#e8eef5' }); ctx.globalAlpha = 1;
    },
    tree(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, '#f6d58e'); sky.addColorStop(1, '#f9ecc6');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      blob(ctx, '#f7b85a', 1620, 230, 90, 2, 0.4);
      layer(ctx, '#b9b27a', x => 560 + Math.sin(x * 0.003) * 50, 1, 0.6);
      layer(ctx, '#d4a94f', x => 650 + Math.sin(x * 0.005 + 1) * 30, 2, 0.9);                    // wheat field
      const rnd = mulberry32(22);
      for (let i = 0; i < 260; i++) { const x = rnd() * W, y = 650 + rnd() * 140; ctx.strokeStyle = rnd() < 0.5 ? '#c08f38' : '#e2bd62'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x + 3, y); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.ellipse(x + 3, y - 8, 4, 11, 0, 0, 7); ctx.fill(); }
      layer(ctx, '#8d9a55', x => 800 + Math.sin(x * 0.004) * 25, 3, 1.2);                        // meadow
      // the tree: oar shaft becoming trunk
      shadowOn(ctx, 1.2); ctx.fillStyle = '#6b4a33';
      taper(ctx, [960, 830], [960, 610], 30, 34);
      taper(ctx, [960, 615], [925, 520], 40, 34); taper(ctx, [925, 520], [985, 430], 34, 26);
      [[-1.2, 260], [-0.6, 230], [0.1, 200], [0.7, 240], [1.25, 270]].forEach(([a, l]) => { taper(ctx, [985, 430], [985 + Math.sin(a) * l, 430 - Math.cos(a) * l * 0.6], 20, 8); });
      shadowOff(ctx);
      ctx.fillStyle = '#c9a47a'; ctx.fillRect(952, 640, 16, 190);                                  // the oar still visible in the trunk
      leaves(ctx, 980, 330, 330, 150, 520, rnd, ['#5e6e3a', '#7c8a4a', '#48562c', '#9aa46a']);
      for (let i = 0; i < 30; i++) { ctx.fillStyle = '#3d2a44'; ctx.beginPath(); ctx.arc(700 + rnd() * 560, 250 + rnd() * 170, 7, 0, 7); ctx.fill(); }
      person(ctx, 700, 900, 300, 'sit', 1, { beard: true, skin: '#7a4b31' });
      person(ctx, 1250, 900, 300, 'sit', -1, { skin: '#d9a57f', dress: '#b8483b', hair: 'bun' });
      person(ctx, 1420, 900, 230, 'sit', -1, { skin: '#9a6a4a' });
      person(ctx, 540, 900, 280, 'sit', 1, { skin: '#8a5a3c' });
    },
  };
  window.STYLES = window.STYLES || {};
  window.STYLES.paper = {
    still(ctx, scene) { SCENES[scene](ctx); finish(ctx); },
    frame(ctx, t) { SCENES.arrival(ctx); finish(ctx); },
  };
})();
