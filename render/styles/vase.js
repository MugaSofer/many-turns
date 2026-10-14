// Style A: black-figure Greek vase. Scenes are painted onto a flat frieze, then wrapped onto a turning cylinder.
(() => {
  const { W, H, mulberry32, noise2, fbm, lerp, clamp, figure, drawSilhouette, drawOar, taper } = window.ENGINE;
  let CLAY = '#c7672e', CLAY_D = '#a9521f', GLAZE = '#17110e', RED = '#7e2618', WHITE = '#ecdfc4', INC = '#d98a52';
  const PALETTES = {
    black: ['#c7672e', '#17110e', '#7e2618', '#ecdfc4', '#d98a52'],
    red:   ['#17120f', '#c9703a', '#7e2618', '#ecdfc4', '#17120f'],
    white: ['#ece2cc', '#8c6a52', '#9a4a3a', '#f7f1e3', '#3b2a20'],
  };
  let PALN = 'black';
  function setPalette(n) { PALN = n; [CLAY, GLAZE, RED, WHITE, INC] = PALETTES[n]; }
  const BH = 760, BW = 2600;                       // frieze band size (px)
  const band = document.createElement('canvas'); band.width = BW; band.height = BH;
  const b = band.getContext('2d');
  const GROUND = 640;

  // hand-painted wobble for strokes
  function wob(x, y, s, a = 3) { return [x + (noise2(x * 0.02, y * 0.02, s) - 0.5) * a, y + (noise2(x * 0.02 + 9, y * 0.02, s) - 0.5) * a]; }

  function clayBackground(g) {
    g.fillStyle = CLAY; g.fillRect(0, 0, BW, BH);
    const img = g.getImageData(0, 0, BW, BH), d = img.data;
    for (let y = 0; y < BH; y += 2) for (let x = 0; x < BW; x += 2) {
      const n = fbm(x * 0.004, y * 0.004, 3, 4) - 0.5, m = (noise2(x * 0.3, y * 0.3, 5) - 0.5) * 0.06;
      const k = 1 + n * 0.22 + m;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((y + dy) * BW + x + dx) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    }
    g.putImageData(img, 0, 0);
  }
  // incised line: scratched through glaze back to clay
  function incise(g, pts, w = 2.2) {
    g.save(); g.strokeStyle = INC; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, i) => { const q = wob(p[0], p[1], 7, 1.5); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.restore();
  }
  // ---------- figures: a skilled painter's detail (incision, added red and white, relief lines) ----------
  // Each figure is painted on its own transparent layer, so incisions never stray onto the clay, overlaps get
  // contour lines, and a fading figure (globalAlpha < 1) fades as one piece.
  // (a CPU-backed canvas: small paths rasterise faster there than on the GPU, and only the figure's box is uploaded)
  const LAY = document.createElement('canvas'), lg = LAY.getContext('2d', { willReadFrequently: true });
  function figBox(F) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of [F.hip, F.shoulder, F.headC, ...F.arms.l, ...F.arms.r, ...F.legs.l, ...F.legs.r]) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    const m = 0.2 * F.h; return [x0 - m, y0 - m, x1 + m, y1 + m];
  }
  // set up the layer for a figure; returns null if the figure is entirely off the canvas
  function beginLayer(g, F) {
    const m = g.getTransform(), [x0, y0, x1, y1] = figBox(F);
    let dx0 = Infinity, dy0 = Infinity, dx1 = -Infinity, dy1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
      dx0 = Math.min(dx0, X); dx1 = Math.max(dx1, X); dy0 = Math.min(dy0, Y); dy1 = Math.max(dy1, Y);
    }
    dx0 = Math.max(0, Math.floor(dx0)); dy0 = Math.max(0, Math.floor(dy0));
    dx1 = Math.min(g.canvas.width, Math.ceil(dx1)); dy1 = Math.min(g.canvas.height, Math.ceil(dy1));
    const w = dx1 - dx0, hh = dy1 - dy0; if (w <= 0 || hh <= 0) return null;
    const cw = Math.ceil(w / 32) * 32, ch = Math.ceil(hh / 32) * 32;
    if (LAY.width !== cw || LAY.height !== ch) { LAY.width = cw; LAY.height = ch; }
    else { lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, w, hh); }
    lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
    lg.setTransform(m.a, m.b, m.c, m.d, m.e - dx0, m.f - dy0);
    return { L: lg, dx0, dy0, w, hh };
  }
  function endLayer(g, box) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(LAY, 0, 0, box.w, box.hh, box.dx0, box.dy0, box.w, box.hh); g.restore();
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  function ln(L, pts, w, col, smooth = true) {
    L.strokeStyle = col; L.lineWidth = w; L.lineCap = 'round'; L.lineJoin = 'round';
    if (smooth && pts.length > 2) window.BODY.smoothPath(L, pts, false);
    else { L.beginPath(); pts.forEach((p, i) => i ? L.lineTo(p[0], p[1]) : L.moveTo(p[0], p[1])); }
    L.stroke();
  }
  function dot(L, p, r, col) { L.fillStyle = col; L.beginPath(); L.arc(p[0], p[1], r, 0, 7); L.fill(); }
  function xmark(L, p, s, w, col) { ln(L, [[p[0] - s, p[1] - s], [p[0] + s, p[1] + s]], w, col, false); ln(L, [[p[0] - s, p[1] + s], [p[0] + s, p[1] - s]], w, col, false); }
  // points along a polyline at even spacing: [[point, unit direction], ...]
  function along(pts, step) {
    const out = []; let carry = step * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = carry;
      if (L < 1e-6) continue;
      while (d < L) { out.push([lerp2(a, b, d / L), [(b[0] - a[0]) / L, (b[1] - a[1]) / L]]); d += step; }
      carry = d - L;
    }
    return out;
  }
  let K = null;    // per-figure drawing state for the decoration hooks
  const atop = (L, fn) => { L.save(); L.globalCompositeOperation = 'source-atop'; fn(); L.restore(); };
  const clipTo = (L, pathFn, fn) => { L.save(); pathFn(); L.clip(); fn(); L.restore(); };

  function faceDetail(L, info) {
    const F = info.F, Hd = info.head, r = F.headR, h = F.h, M = Hd.map, col = K.onSkin, w = K.lw;
    if (h < 125) { dot(L, M(0.6, -0.2), Math.max(0.8, r * 0.11), col); return; }
    if (K.woman) {             // almond eye, painted
      ln(L, [M(0.38, -0.19), M(0.56, -0.29), M(0.76, -0.21)], w, col); ln(L, [M(0.38, -0.19), M(0.58, -0.13), M(0.76, -0.21)], w * 0.8, col);
      dot(L, M(0.62, -0.21), r * 0.07, col);
      if (K.fine) ln(L, [M(0.34, -0.39), M(0.56, -0.47), M(0.78, -0.4)], w * 0.8, col);
    } else {                   // the archaic man's eye: almond, iris and pupil, a strong brow
      ln(L, [M(0.34, -0.2), M(0.54, -0.33), M(0.78, -0.21)], w, col); ln(L, [M(0.34, -0.2), M(0.56, -0.1), M(0.78, -0.21)], w, col);
      if (K.fine) { L.strokeStyle = col; L.lineWidth = w * 0.8; const c = M(0.57, -0.21); L.beginPath(); L.arc(c[0], c[1], r * 0.1, 0, 7); L.stroke(); }
      dot(L, M(0.57, -0.21), r * 0.05, col);
      ln(L, [M(0.3, -0.4), M(0.56, -0.5), M(0.84, -0.38)], w, col);
    }
    if (!K.fine) return;
    // ear
    ln(L, [M(-0.02, -0.04), M(-0.18, -0.08), M(-0.27, 0.08), M(-0.2, 0.26), M(-0.06, 0.28)], w * 0.9, col);
    ln(L, [M(-0.08, 0.04), M(-0.16, 0.08), M(-0.14, 0.17)], w * 0.7, col);
    if (K.woman) dot(L, M(-0.12, 0.42), r * 0.09, RED);
    if (K.big) { ln(L, [M(1.0, 0.16), M(1.05, 0.23)], w * 0.7, col); ln(L, [M(0.9, 0.46), M(1.0, 0.45)], w * 0.7, col); }
    if (info.opts.beard) {     // the beard's edge along the cheek, then strands
      ln(L, [M(-0.25, 0.2), M(0.1, 0.38), M(0.5, 0.36), M(0.9, 0.46)], w, col);
      ln(L, [M(1.02, 0.36), M(0.84, 0.42), M(0.66, 0.34)], w * 0.9, col);
      const n = K.big ? 6 : 4;
      for (let k = 0; k < n; k++) { const t = k / (n - 1); ln(L, [M(-0.15 + t * 0.95, 0.5 + t * 0.02), M(0.05 + t * 0.8, 0.9 + t * 0.1), M(0.4 + t * 0.4, 1.28 + t * 0.12)], w * 0.8, col); }
    }
  }
  function hairDetail(L, info) {
    const F = info.F, Hd = info.head, r = F.headR, M = Hd.map, w = K.lw, hair = info.opts.hair, col = K.red ? GLAZE : INC;
    // fillet (headband) in added red
    if (F.h >= 100) ln(L, [M(0.55, -0.6), M(0.15, -0.9), M(-0.45, -0.88), M(-0.98, -0.45)], Math.max(1.1, r * 0.13), RED);
    if (!K.fine) return;
    if (!K.red) {
      // hairline where hair meets face (incised on men; the painted edge shows on women anyway)
      if (!K.woman) ln(L, [M(0.52, -0.5), M(0.28, -0.42), M(-0.1, -0.22), M(-0.36, 0.05), M(-0.42, 0.55), M(-0.5, 1.0)], w, col);
      // archaic banded locks: wavy rows across the back of the hair
      const rows = hair === 'long' ? [-0.4, 0.05, 0.5, 0.95, 1.4, 1.85] : hair === 'bun' ? [-0.35, 0.1] : [-0.4, 0.0, 0.4];
      for (const y of rows) {
        const x0 = -1.1, x1 = y < 0 ? -0.25 + y * 0.3 : -0.45, pts = [];
        for (let k = 0; k <= 5; k++) { const x = lerp(x0, x1, k / 5); pts.push(M(x, y + (k % 2 ? 0.05 : -0.02))); }
        ln(L, pts, w * 0.75, col, false);
      }
      if (hair === 'long') ln(L, [M(-1.12, 1.15), M(-0.4, 1.15)], Math.max(1, r * 0.12), RED);   // the tie at the nape
    } else {
      // red-figure: a row of relief curls along the forehead
      for (let k = 0; k < 4; k++) { const c = M(0.45 - k * 0.2, -0.62 + k * 0.1); L.strokeStyle = GLAZE; L.lineWidth = w * 0.8; L.beginPath(); L.arc(c[0], c[1], r * 0.06, 0, 5); L.stroke(); }
    }
    if (hair === 'bun') { const c = M(-1.0, -0.62); L.strokeStyle = col; L.lineWidth = w * 0.8; L.beginPath(); L.arc(c[0], c[1], r * 0.22, 0.5, 5.8); L.stroke(); }
  }
  function torsoDetail(L, info) {
    const F = info.F, h = F.h, at = info.fr.at, s = F.shoulder, p = F.hip, w = K.lw, c1 = K.anat, c2 = K.dil;
    ln(L, [at(s, 0.022 * h, 0.03 * h), at(s, 0.004 * h, 0.06 * h), at(s, -0.004 * h, 0.088 * h)], w, c1);                  // collarbone
    ln(L, [at(s, -0.035 * h, 0.1 * h), at(s, -0.08 * h, 0.092 * h), at(s, -0.097 * h, 0.05 * h), at(s, -0.09 * h, 0.03 * h)], w, c1); // chest
    ln(L, [at(p, 0.1 * h, -0.042 * h), at(p, 0.05 * h, -0.02 * h), at(p, -0.005 * h, 0.012 * h), at(p, -0.05 * h, 0.03 * h)], w, c1);  // flank to groin
    if (!K.big) return;
    ln(L, [at(s, -0.11 * h, 0.035 * h), at(s, -0.14 * h, 0.05 * h), at(s, -0.155 * h, 0.07 * h)], w * 0.8, c2);           // ribcage
    for (const a of [0.14, 0.09]) ln(L, [at(p, a * h, 0.018 * h), at(p, (a - 0.004) * h, 0.036 * h), at(p, a * h, 0.05 * h)], w * 0.8, c2);  // abdomen
    ln(L, [at(s, -0.03 * h, -0.05 * h), at(s, -0.07 * h, -0.058 * h), at(s, -0.1 * h, -0.045 * h)], w * 0.8, c2);          // shoulder blade
  }
  function legDetail(L, Lg, info) {
    const F = info.F, h = F.h, f = F.facing, w = K.lw, c1 = K.anat, c2 = K.dil;
    const [hip, kn, an] = Lg, n = window.BODY.frontN(kn, an, f), dl = Math.hypot(an[0] - kn[0], an[1] - kn[1]) || 1, d = [(an[0] - kn[0]) / dl, (an[1] - kn[1]) / dl];
    // knee cap
    ln(L, [add(add(kn, n, 0.028 * h), d, -0.02 * h), add(add(kn, n, 0.012 * h), d, 0.0), add(add(kn, n, 0.024 * h), d, 0.022 * h)], w, c1);
    if (!K.big) return;
    ln(L, [add(add(kn, n, -0.01 * h), d, 0.04 * h), add(add(kn, n, -0.018 * h), d, 0.08 * h), add(add(kn, n, -0.008 * h), d, 0.13 * h)], w * 0.8, c2);  // calf
    const tn = window.BODY.frontN(hip, kn, f), tl = Math.hypot(kn[0] - hip[0], kn[1] - hip[1]) || 1, td = [(kn[0] - hip[0]) / tl, (kn[1] - hip[1]) / tl];
    ln(L, [add(add(hip, tn, 0.03 * h), td, 0.14 * h), add(add(hip, tn, 0.022 * h), td, 0.19 * h), add(add(hip, tn, 0.024 * h), td, 0.225 * h)], w * 0.8, c2); // thigh
    L.strokeStyle = c1; L.lineWidth = w * 0.8; const ak = add(an, d, -0.01 * h); L.beginPath(); L.arc(ak[0], ak[1], 0.006 * h, 0, 7); L.stroke();          // ankle bone
  }
  function armDetail(L, A, hd, info) {
    const F = info.F, h = F.h, f = F.facing, w = K.lw, col = K.woman ? K.onSkin : K.anat;
    const [sh, el, wr] = A, n = window.BODY.frontN(el, wr, f), ul = Math.hypot(el[0] - sh[0], el[1] - sh[1]) || 1, u = [(el[0] - sh[0]) / ul, (el[1] - sh[1]) / ul];
    if (!K.woman) {
      const un = window.BODY.frontN(sh, el, f);   // deltoid
      ln(L, [add(add(sh, un, 0.035 * h), u, 0.05 * h), add(sh, u, 0.075 * h), add(add(sh, un, -0.035 * h), u, 0.06 * h)], w, col);
      ln(L, [add(add(el, n, -0.02 * h), u, -0.012 * h), add(add(el, n, -0.012 * h), u, 0.006 * h)], w, col);      // elbow
    } else if (!K.red) {         // bracelet
      const wn = window.BODY.frontN(el, wr, f);
      ln(L, [add(wr, wn, 0.016 * h), add(wr, wn, -0.016 * h)], Math.max(1, 0.007 * h), RED, false);
    }
    if (K.big && hd) {           // fingers
      const P = (a, b) => [hd.wrist[0] + (hd.u[0] * a + hd.v[0] * b) * h * hd.k, hd.wrist[1] + (hd.u[1] * a + hd.v[1] * b) * h * hd.k];
      ln(L, [P(0.05, -0.004), P(0.082, -0.003)], w * 0.7, col); ln(L, [P(0.05, 0.004), P(0.075, 0.005)], w * 0.7, col);
      ln(L, [P(0.032, 0.012), P(0.045, 0.02)], w * 0.7, col);
    }
  }
  // decorated garment: folds that follow the legs, a patterned hem, a belt, scattered ornaments
  function garmentDetail(L, info, G, kind) {
    const F = info.F, h = F.h, at = info.fr.at, s = F.shoulder, p = F.hip, w = K.lw;
    const base = kind === 'dress' ? info.opts.dress : info.opts.tunic, isRed = base === RED;
    const line = isRed && !K.red ? GLAZE : INC;              // incised through red shows as a dark line
    const nF = kind === 'dress' ? (K.red ? (K.fine ? 11 : 5) : (K.fine ? 6 : 3)) : (K.red ? 5 : 3);
    const bh = (kind === 'dress' ? 0.034 : 0.026) * h;
    const iStart = G.SS.findIndex(x => x >= (kind === 'dress' ? 0.45 : 0.1));
    clipTo(L, G.path, () => {
      // folds
      for (let j = 1; j <= nF; j++) {
        const fr = j / (nF + 1), pts = [];
        for (let i = Math.max(0, iStart); i < G.SS.length; i++) pts.push(lerp2(G.backEdge[i], G.frontEdge[i], fr + (K.red ? Math.sin(j * 2.1 + i) * 0.012 : 0)));
        if (pts.length > 1) { const e = pts[pts.length - 1], up = G.hemUp[fr < 0.5 ? 0 : 3]; pts[pts.length - 1] = add(e, up, bh * 1.1); ln(L, pts, w * (K.red ? 0.7 : 0.85), line); }
      }
      // hem band
      const hem = G.hem, bandCol = K.red ? INC : (isRed ? GLAZE : RED);
      if (!K.fine) { ln(L, hem, bh * 1.6, bandCol); return; }
      ln(L, hem, bh * 2, bandCol);
      ln(L, hem.map((q, i) => add(q, G.hemUp[i], bh)), w, line); ln(L, hem.map((q, i) => add(q, G.hemUp[i], bh * 1.35)), w * 0.8, line);
      const mid = hem.map((q, i) => add(q, G.hemUp[i], bh * 0.5));
      const orn = K.red ? GLAZE : WHITE;
      for (const [q] of along(mid, bh * 0.9)) (K.v === 2 && !K.red) ? xmark(L, q, bh * 0.22, w * 0.8, INC) : dot(L, q, bh * 0.17, orn);
      // central panel (paryphe) down the front of a woman's chiton
      if (kind === 'dress') {
        const cp = []; for (let i = Math.max(0, iStart - 1); i < G.SS.length; i++) cp.push(lerp2(G.backEdge[i], G.frontEdge[i], 0.62));
        cp[cp.length - 1] = add(cp[cp.length - 1], G.hemUp[3], bh);
        const pw = 0.03 * h;
        ln(L, cp, pw, K.red ? INC : RED);
        for (const [q] of along(cp, pw * 1.1)) K.red ? dot(L, q, pw * 0.14, GLAZE) : xmark(L, q, pw * 0.2, w * 0.8, line);
      }
      // scattered ornaments over the cloth
      if (K.big && !K.red) {
        const rows = kind === 'dress' ? [0.35, 0.55, 0.75] : [0.25, 0.7];
        for (let i = Math.max(1, iStart); i < G.SS.length - 1; i++) for (const fr of rows) {
          if (Math.abs(fr - 0.62) < 0.1 && kind === 'dress') continue;
          const q = lerp2(G.backEdge[i], G.frontEdge[i], fr);
          if (K.v === 1) { for (let a = 0; a < 4; a++) dot(L, [q[0] + Math.cos(a * 1.571) * 0.008 * h, q[1] + Math.sin(a * 1.571) * 0.008 * h], 0.0035 * h, WHITE); }
          else xmark(L, q, 0.007 * h, w * 0.8, line);
        }
      }
    });
    // belt, overfold, neckline
    const bl = K.red ? INC : (isRed ? GLAZE : RED);
    clipTo(L, G.path, () => {
      ln(L, [at(p, 0.115 * h, -0.1 * h), at(p, 0.11 * h, 0), at(p, 0.115 * h, 0.1 * h)], Math.max(1.2, 0.011 * h), bl);
      if (kind === 'dress' && K.fine) {
        const of = [at(p, -0.01 * h, -0.1 * h), at(p, 0.0, 0), at(p, 0.02 * h, 0.1 * h)];
        ln(L, of, w, line); for (const [q] of along(of, 0.018 * h)) dot(L, add(q, info.fr.up, 0.01 * h), 0.004 * h, K.red ? INC : WHITE);
        ln(L, [at(s, 0.03 * h, -0.03 * h), at(s, 0.0, 0.0), at(s, 0.018 * h, 0.05 * h)], w, line);
        if (K.big && !K.red) for (const b of [-0.05, 0.0, 0.05]) xmark(L, at(s, -0.07 * h, b * h), 0.006 * h, w * 0.8, line);
        if (K.red) for (let j = 0; j < 6; j++) ln(L, [at(s, -0.02 * h, (-0.06 + j * 0.026) * h), at(p, 0.13 * h, (-0.07 + j * 0.03) * h)], w * 0.6, INC);
      } else if (K.fine) ln(L, [at(s, 0.03 * h, -0.03 * h), at(s, 0.0, 0.0), at(s, 0.018 * h, 0.05 * h)], w, line);
    });
  }
  function cloakDetail(L, info) {
    const C = info.cloak, h = info.F.h, w = K.lw, col = info.opts.cloak, isRed = col === RED;
    const line = isRed && !K.red ? GLAZE : INC, P = C.pts;
    clipTo(L, C.path, () => {
      const border = [P[5], P[6], P[7], P[8], P[9], P[10], P[0]];
      const bcol = K.red ? INC : (isRed ? GLAZE : RED), bw = 0.024 * h;
      ln(L, border, bw * 2, bcol);
      // folds: from the shoulder down to the hem
      const n = K.fine ? 5 : 3;
      for (let j = 1; j <= n; j++) { const t = j / (n + 1); ln(L, [lerp2(P[1], P[0], t * 0.8), lerp2(P[3], P[9], t), lerp2(P[5], P[7], t)], w * 0.85, line); }
      if (K.fine) {
        const cx = (P[2][0] + P[6][0]) / 2, cy = (P[2][1] + P[6][1]) / 2;
        for (const [q] of along(border, bw * 1.1)) { const dx = cx - q[0], dy = cy - q[1], l = Math.hypot(dx, dy) || 1; dot(L, [q[0] + dx / l * bw * 0.5, q[1] + dy / l * bw * 0.5], bw * 0.18, K.red ? GLAZE : WHITE); }
      }
    });
  }
  const DECOR = {
    farLeg: (L, info) => { if (K.nude && K.fine) atop(L, () => legDetail(L, info.legs.far, info)); },
    farArm: (L, info) => { if (K.fine) atop(L, () => armDetail(L, info.arms.far, info.farArm.hand, info)); },
    nearLegUnder: (L, info) => { if (K.fine && !K.woman) atop(L, () => legDetail(L, info.legs.near, info)); },
    body: (L, info) => atop(L, () => { if (K.nude && K.fine) torsoDetail(L, info); faceDetail(L, info); }),
    nearLeg: (L, info) => { if (K.fine) atop(L, () => legDetail(L, info.legs.near, info)); },
    dress: (L, info) => garmentDetail(L, info, info.dress, 'dress'),
    tunic: (L, info) => garmentDetail(L, info, info.tunic, 'tunic'),
    cloak: (L, info) => cloakDetail(L, info),
    hair: (L, info) => clipTo(L, () => window.BODY.smoothPath(L, info.hairPts), () => hairDetail(L, info)),
    nearArm: (L, info) => { if (K.fine) atop(L, () => armDetail(L, info.arms.near, info.nearArm.hand, info)); },
  };
  // A figure: men in black glaze, women with added-white skin (black-figure); all in reserved clay (red-figure);
  // outlined (white-ground). Options: woman, beard, cloak (colour), dress (colour), tunic (false | true | 'red' | 'black' | colour),
  // nude (no tunic), hair ('short'|'long'|'bun'), variant (0-2: pattern family). Returns the skeleton F.
  function person(g, x, y, h, pose, facing, o = {}) {
    if (window.__pms !== undefined) { const t0 = performance.now(), F = person_(g, x, y, h, pose, facing, o); window.__pms += performance.now() - t0; window.__pn++; return F; }
    return person_(g, x, y, h, pose, facing, o);
  }
  function person_(g, x, y, h, pose, facing, o) {
    const F = figure(x, y, h, pose, facing);
    const red = PALN === 'red', wg = PALN === 'white', woman = !!o.woman;
    const skin = woman && !red ? WHITE : GLAZE;
    const box = beginLayer(g, F);
    if (!box) { g.fillStyle = skin; return F; }
    const L = box.L;
    const v = o.ody ? 1 : (o.variant ?? Math.floor(window.ENGINE.hash2(Math.round(h), o.beard ? 1 : 0, 7) * 3));   // Odysseus always wears the same (red) tunic
    let tunic = null;
    if (!woman && o.tunic !== false && !o.nude) {
      tunic = typeof o.tunic === 'string' ? (o.tunic === 'red' ? RED : o.tunic === 'black' ? GLAZE : o.tunic) : (o.ody ? RED : (!red && v === 1 ? RED : GLAZE));
    }
    const onSkin = woman && !red ? (wg ? INC : GLAZE) : INC;
    K = { woman, red, wg, v, fine: h >= 150, big: h >= 235, lw: Math.max(0.75, 0.0036 * h), nude: !tunic && !woman,
      onSkin, anat: INC, dil: red ? 'rgba(60,24,8,0.5)' : INC };
    window.BODY.drawFigure(L, F, {
      body: skin, beard: o.beard, slender: woman,
      hair: o.hair || (woman ? (red ? 'bun' : 'long') : 'short'),
      hat: o.hat || (o.ody ? 'pilos' : null), hatColor: (GLAZE === '#c9703a' ? GLAZE : CLAY === '#c7672e' ? CLAY : '#c7672e'), hatEdge: GLAZE,   // (the vase's own orange: the background in black-figure, the figures' colour at night)
      hairColor: red ? INC : GLAZE, hairEdge: red ? GLAZE : null,
      dress: woman ? (typeof o.dress === 'string' ? o.dress : GLAZE) : null, tunic, cloak: o.cloak || null,
      contour: h >= 100 ? onSkin : null, garmentContour: woman && !red && !wg ? null : INC,
      outline: wg ? INC : null, lw: Math.max(0.6, 0.0028 * h),
      hook: (stage, info) => { const d = DECOR[stage]; if (d) d(L, info); },
    });
    endLayer(g, box);
    g.fillStyle = skin;
    return F;
  }
  // classic Greek "running wave" pattern along a line
  function waves(g, x0, x1, y, amp, col = GLAZE) {
    g.fillStyle = col;
    for (let x = x0; x < x1; x += amp * 2.2) {
      g.beginPath(); g.moveTo(x, y + amp);
      g.bezierCurveTo(x + amp * 0.2, y - amp * 0.2, x + amp * 1.3, y - amp * 0.9, x + amp * 1.5, y - amp * 0.1);
      g.bezierCurveTo(x + amp * 1.6, y + amp * 0.4, x + amp * 1.0, y + amp * 0.5, x + amp * 0.9, y + amp * 0.1);
      g.bezierCurveTo(x + amp * 1.1, y + amp * 0.9, x + amp * 2.2, y + amp * 0.6, x + amp * 2.2, y + amp);
      g.closePath(); g.fill();
    }
    g.fillRect(x0, y + amp - 1, x1 - x0, amp * 0.9);
  }
  function groundLine(g, y) { g.fillStyle = GLAZE; g.fillRect(0, y, BW, 9); }
  function star(g, x, y, r) { g.fillStyle = WHITE; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr); } g.fill(); }
  function ship(g, x, y, s) {
    g.fillStyle = GLAZE;
    g.beginPath(); g.moveTo(x - 1.1 * s, y - 0.25 * s); g.quadraticCurveTo(x - 0.9 * s, y + 0.12 * s, x - 0.4 * s, y + 0.1 * s);
    g.lineTo(x + 0.7 * s, y + 0.1 * s); g.quadraticCurveTo(x + 1.0 * s, y + 0.05 * s, x + 1.15 * s, y - 0.3 * s);
    g.lineTo(x + 1.0 * s, y - 0.08 * s); g.lineTo(x - 0.95 * s, y - 0.08 * s); g.closePath(); g.fill();
    g.fillRect(x - 0.02 * s, y - 1.0 * s, 0.04 * s, 0.95 * s);                         // mast
    g.beginPath(); g.moveTo(x - 0.55 * s, y - 0.92 * s); g.lineTo(x + 0.55 * s, y - 0.92 * s); g.lineTo(x + 0.5 * s, y - 0.35 * s); g.lineTo(x - 0.5 * s, y - 0.35 * s); g.closePath(); g.fill();
    for (let i = -4; i <= 4; i++) incise(g, [[x + i * 0.11 * s, y - 0.9 * s], [x + i * 0.1 * s, y - 0.37 * s]], 1.4);
    g.save(); g.strokeStyle = WHITE; g.lineWidth = 2.5; g.beginPath(); g.arc(x + 0.85 * s, y - 0.05 * s, 0.05 * s, 0, 7); g.stroke(); g.restore(); // the ship's eye
  }
  function mound(g, x, y, w, hgt) { g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y - hgt * 2, x + w / 2, y); g.closePath(); g.fill(); for (let i = 1; i < 4; i++) incise(g, [[x - w * 0.35 * i / 3, y - hgt * 0.25 * i], [x + w * 0.35 * i / 3, y - hgt * 0.25 * i]], 1.5); }
  // his oar, the same one all the way through the song; a small spark is incised on its blade (the star he steered by)
  function oar(g, grip, blade) { g.fillStyle = GLAZE; g.strokeStyle = GLAZE; drawOar(g, grip, blade);
    const len = Math.hypot(blade[0] - grip[0], blade[1] - grip[1]); if (len < 120) return;
    const c = [lerp(grip[0], blade[0], 0.86), lerp(grip[1], blade[1], 0.86)], r = len * 0.026, a0 = Math.atan2(blade[1] - grip[1], blade[0] - grip[0]);
    g.save(); g.strokeStyle = INC; g.lineWidth = Math.max(1, len * 0.0035); g.lineCap = 'round';
    for (let k = 0; k < 8; k++) { const a = a0 + k * Math.PI / 4, rr = r * (k % 2 ? 0.65 : 1); g.beginPath(); g.moveTo(c[0] + Math.cos(a) * r * 0.2, c[1] + Math.sin(a) * r * 0.2); g.lineTo(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr); g.stroke(); }
    g.restore(); }
  // an olive tree. o.oar: it grows out of a planted oar (the shaft's straight grain shows low down, fading as bark
  // takes over; the blade at the top gives way to the trunk). o.grow 0..1 grows it continuously, from a bare oar with
  // a few sprouting leaves to the full tree (the random stream is always consumed identically, so nothing jumps).
  function olive(g, x, y, s, rnd, o = {}) {
    const grow = o.grow ?? 1, isOar = o.oar ?? false, cl = v => Math.max(0, Math.min(1, v));
    const gTrunk = cl(grow / 0.35), gBranch = cl((grow - 0.12) / 0.6), gLeaf = cl((grow - 0.05) / 0.7);
    g.fillStyle = GLAZE; g.strokeStyle = GLAZE;
    const top = [x, y - 0.42 * s];
    if (isOar) {
      taper(g, [x, y + 4], top, lerp(0.045, 0.07, gTrunk) * s, lerp(0.05, 0.075, gTrunk) * s);   // the shaft, thickening into a trunk
      const grain = 1 - cl((grow - 0.4) / 0.4);
      if (grain > 0) { g.save(); g.globalAlpha *= grain; for (let k = 0; k < 3; k++) incise(g, [[x - 0.01 * s + k * 0.01 * s, y - 0.03 * s], [x - 0.01 * s + k * 0.01 * s, y - 0.38 * s]], 1.1); g.restore(); }
      const blade = 1 - cl(grow / 0.3);
      if (blade > 0) { g.save(); g.globalAlpha *= blade; oar(g, [x, y + 4], [x, top[1] - 0.26 * s]); g.restore(); }
    } else {
      taper(g, [x, y + 4], top, 0.07 * s, 0.075 * s);
    }
    // bark: curving incisions that twist round the trunk (not the oar's straight grain)
    if (!isOar || grow > 0.3) { g.save(); g.globalAlpha *= isOar ? cl((grow - 0.3) / 0.4) : 1;
      for (let k = 0; k < 5; k++) { const yy = y - (0.06 + k * 0.075) * s; incise(g, [[x - 0.025 * s, yy], [x - 0.005 * s, yy - 0.03 * s], [x + 0.02 * s, yy - 0.045 * s]], 1.1); }
      g.restore(); }
    // above: it swells and splits into a gnarled trunk
    const P0 = [[x, y - 0.42 * s], [x - 0.05 * s, y - 0.55 * s], [x + 0.03 * s, y - 0.68 * s], [x - 0.02 * s, y - 0.78 * s]];
    const pts = P0.map(([px, py]) => [x + (px - x) * gTrunk, top[1] + (py - top[1]) * gTrunk]);
    if (gTrunk > 0.02) for (let k = 0; k < pts.length - 1; k++) taper(g, pts[k], pts[k + 1], (0.075 - k * 0.012) * s * gTrunk, (0.063 - k * 0.012) * s * gTrunk);
    const tips = [];
    const branch = (p, ang, len, w, depth) => {
      const r1 = rnd(), r2 = rnd(), rA = rnd(), rB = rnd();
      const L = len * gBranch, e = [p[0] + Math.sin(ang) * L, p[1] - Math.cos(ang) * L];
      const mid = [(p[0] + e[0]) / 2 + (r1 - 0.5) * L * 0.3, (p[1] + e[1]) / 2 + (r2 - 0.5) * L * 0.2];
      if (L > 1) { taper(g, p, mid, w * gBranch, w * 0.8 * gBranch); taper(g, mid, e, w * 0.8 * gBranch, w * 0.55 * gBranch); }
      if (depth > 0) { branch(e, ang - 0.35 - rA * 0.3, len * 0.72, w * 0.6, depth - 1); branch(e, ang + 0.3 + rB * 0.3, len * 0.7, w * 0.6, depth - 1); }
      else tips.push(e);
    };
    const base = pts[pts.length - 1];
    [-1.35, -0.75, -0.1, 0.6, 1.3].forEach((a, k) => { const ja = rnd(); branch(base, a + (ja - 0.5) * 0.2, 0.26 * s * (k % 2 ? 1.1 : 0.95), 0.032 * s, 2); });
    // leaf sprays at the tips (a few leaves sprout early, the rest fill in as it grows)
    for (const t of tips) for (let k = 0; k < 16; k++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.07 * s, rr = rnd();
      if (k / 16 >= gLeaf) continue;
      const ls = Math.min(1, gLeaf * 1.5);
      g.save(); g.translate(t[0] + Math.cos(a) * r * gBranch, t[1] + Math.sin(a) * r * 0.7 * gBranch); g.rotate(a + (rr - 0.5));
      g.fillStyle = GLAZE; g.beginPath(); g.ellipse(0.02 * s * ls, 0, 0.034 * s * ls, 0.009 * s * ls, 0, 0, 7); g.fill();
      g.strokeStyle = INC; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-0.005 * s * ls, 0); g.lineTo(0.045 * s * ls, 0); g.stroke(); g.restore();
    }
  }

  // soul of the dead (eidolon): a small winged figure, as on Greek funeral vases
  function eidolon(g, x, y, h, facing) {
    const F = person(g, x, y, h, 'stand', facing, {});
    g.fillStyle = GLAZE;
    const s = F.shoulder;
    for (const d of [-1, 1]) {
      g.beginPath(); g.moveTo(s[0] - facing * 0.03 * h, s[1] + 0.02 * h);
      g.quadraticCurveTo(s[0] - facing * 0.25 * h, s[1] - 0.25 * h * (d > 0 ? 1 : 0.7), s[0] - facing * 0.4 * h, s[1] - 0.1 * h * d);
      g.quadraticCurveTo(s[0] - facing * 0.25 * h, s[1] + 0.05 * h, s[0] - facing * 0.02 * h, s[1] + 0.12 * h); g.fill();
    }
    for (let k = 0; k < 4; k++) incise(g, [[s[0] - facing * (0.1 + k * 0.07) * h, s[1] - 0.02 * h], [s[0] - facing * (0.14 + k * 0.07) * h, s[1] - 0.12 * h]], 1.2);
  }
  function wheat(g, x, y, s) { g.strokeStyle = GLAZE; g.lineWidth = 2.5; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + i * 3, y - s * 0.6, x + i * 9, y - s); g.stroke(); g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x + i * 9, y - s - 10, 5, 14, i * 0.1, 0, 7); g.fill(); } }

  // ---------- scenes painted on the frieze ----------
  const SCENES = {
    arrival(g) {
      clayBackground(g); groundLine(g, GROUND);
      waves(g, 0, 560, GROUND - 40, 34);
      // Odysseus crouching in the brush, covering himself with a leafy olive branch (Odyssey 6)
      const O = person(g, 760, GROUND, 330, 'kneel', 1, { beard: true });
      const hnd = O.arms.l[2], rb = mulberry32(9);
      g.fillStyle = GLAZE; g.strokeStyle = GLAZE; g.lineWidth = 5; g.beginPath(); g.moveTo(hnd[0], hnd[1]); g.quadraticCurveTo(hnd[0] + 40, hnd[1] + 60, hnd[0] + 20, hnd[1] + 150); g.stroke();
      for (let k = 0; k < 26; k++) { const tt = rb(), px = hnd[0] + 20 + (rb() - 0.5) * 70 + tt * 10, py = hnd[1] + 20 + tt * 140;
        g.save(); g.translate(px, py); g.rotate(rb() * 6); g.beginPath(); g.ellipse(0, 0, 22, 6, 0, 0, 7); g.fill(); g.restore(); }
      const N = person(g, 1320, GROUND, 360, 'offer', -1, { woman: true });      // Nausicaa, holding out a cloak
      const a = N.arms.l[2], c = N.arms.r[2];
      g.fillStyle = RED;
      window.BODY.smoothPath(g, [[a[0] + 6, a[1] - 4], [c[0] - 4, c[1] - 6], [c[0] - 30, c[1] + 70], [c[0] - 20, c[1] + 170], [a[0] - 120, a[1] + 185],
        [a[0] - 150, a[1] + 110], [a[0] - 60, a[1] + 40]]);
      g.fill();
      for (let k = 0; k < 5; k++) incise(g, [[a[0] - 10 - k * 24, a[1] + 15], [a[0] - 20 - k * 26, a[1] + 150 + (k % 2) * 15]], 1.3);
      person(g, 1620, GROUND, 350, 'reach', -1, { woman: true });
      person(g, 1850, GROUND, 345, 'walk', -1, { woman: true });
      g.fillStyle = WHITE; g.beginPath(); g.arc(1700, 190, 20, 0, 7); g.fill(); g.strokeStyle = GLAZE; g.lineWidth = 2; g.stroke();
      const rnd = mulberry32(5); olive(g, 2250, GROUND, 420, rnd);
    },
    elpenor(g) {
      clayBackground(g); groundLine(g, GROUND);
      // night: added-white moon and stars on the clay
      g.fillStyle = WHITE; g.beginPath(); g.arc(520, 150, 55, 0, 7); g.fill(); g.fillStyle = CLAY; g.beginPath(); g.arc(545, 138, 50, 0, 7); g.fill();
      const rnd = mulberry32(11); for (let i = 0; i < 26; i++) star(g, 150 + rnd() * 2300, 60 + rnd() * 250, 6 + rnd() * 6);
      waves(g, 1500, BW, GROUND - 40, 30);
      ship(g, 1950, GROUND - 90, 170);
      mound(g, 1000, GROUND, 520, 120);
      oar(g, [1000, GROUND - 120 + 10], [1000, GROUND - 120 - 330]);       // the oar stood up above him
      person(g, 640, GROUND, 360, 'mourn', 1, { beard: true });             // Odysseus
      person(g, 440, GROUND, 330, 'mourn', 1, {});                          // a companion
      // the small shade of Elpenor, in added white, hovering
      eidolon(g, 1330, GROUND - 190, 190, -1);
    },
    tree(g) {
      clayBackground(g); groundLine(g, GROUND);
      const rnd = mulberry32(21);
      olive(g, 1250, GROUND, 470, rnd);
      person(g, 1000, GROUND, 330, 'sit', 1, { beard: true });              // Odysseus, old, at ease
      person(g, 1480, GROUND, 330, 'sit', -1, { woman: true });
      person(g, 1650, GROUND, 250, 'sit', -1, {});                          // Elpenor, the small sailor, among them
      person(g, 820, GROUND, 300, 'sit', 1, {});
      for (let x = 60; x < 620; x += 70) wheat(g, x, GROUND, 150 + (x % 3) * 20);
      for (let x = 1900; x < 2550; x += 70) wheat(g, x, GROUND, 150 + (x % 5) * 12);
      g.fillStyle = WHITE; g.beginPath(); g.arc(2250, 150, 60, 0, 7); g.fill();  // sun
    },
  };

  // meander (Greek key) border in glaze on clay
  function meander(g, x0, x1, y, h) {
    g.fillStyle = CLAY; g.fillRect(x0, y, x1 - x0, h);
    g.strokeStyle = GLAZE; g.lineWidth = h * 0.12; g.lineCap = 'square';
    const u = h * 0.8, m = h * 0.1;
    for (let x = x0; x < x1; x += u) {
      g.beginPath();
      g.moveTo(x, y + h - m); g.lineTo(x, y + m); g.lineTo(x + u * 0.8, y + m); g.lineTo(x + u * 0.8, y + h * 0.65);
      g.lineTo(x + u * 0.35, y + h * 0.65); g.lineTo(x + u * 0.35, y + h * 0.38); g.stroke();
      g.beginPath(); g.moveTo(x - u * 0.1, y + h - m); g.lineTo(x + u * 0.9, y + h - m); g.stroke();
    }
  }

  // Wrap the frieze onto a cylinder seen close-up. u0 = frieze x at screen centre.
  function wrap(ctx, u0) {
    const R = 1700, cx = W / 2, top = 170, bh = 740;
    // background: museum dark with soft light
    const bg = ctx.createRadialGradient(cx, H * 0.45, 100, cx, H * 0.5, 1300); bg.addColorStop(0, '#2a211c'); bg.addColorStop(1, '#080605');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const halfW = R * 0.93;
    for (let x = Math.floor(cx - Math.min(halfW, W / 2)); x < cx + Math.min(halfW, W / 2); x++) {
      const s = (x - cx) / R, th = Math.asin(clamp(s, -1, 1)), c = Math.cos(th);
      const u = ((u0 + R * th) % BW + BW) % BW;
      const sag = (1 - c) * 60;                                    // camera slightly above: band edges curve
      ctx.drawImage(band, u, 0, 1, BH, x, top + sag, 1.2, bh);
      // black glaze above and below the band
      ctx.fillStyle = GLAZE; ctx.fillRect(x, 0, 1.2, top + sag); ctx.fillRect(x, top + sag + bh, 1.2, H);
      // shading: light from upper left; darker to the sides
      const lit = clamp(0.35 + 0.65 * Math.cos(th + 0.35), 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${(1 - lit) * 0.75})`; ctx.fillRect(x, 0, 1.2, H);
      const spec = Math.exp(-Math.pow((th + 0.28) / 0.05, 2)) * 0.22;
      if (spec > 0.01) { ctx.fillStyle = `rgba(255,240,220,${spec})`; ctx.fillRect(x, 0, 1.2, H); }
    }
    // glaze sheen bands
    const sh = ctx.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(255,255,255,0.04)'); sh.addColorStop(0.15, 'rgba(255,255,255,0)'); sh.addColorStop(0.95, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
  }

  function paintBand(scene) {
    b.save(); b.clearRect(0, 0, BW, BH);
    SCENES[scene](b);
    meander(b, 0, BW, 0, 70); meander(b, 0, BW, BH - 70, 70);
    b.fillStyle = GLAZE; b.fillRect(0, 70, BW, 6); b.fillRect(0, BH - 76, BW, 6);
    b.restore();
  }

  const CENTER = { arrival: 1300, elpenor: 1000, tree: 1250 };
  window.STYLES = window.STYLES || {};
  window.STYLES.vase = {
    still(ctx, scene) { const [sc, pal] = scene.split(':'); setPalette(pal || 'black'); paintBand(sc); wrap(ctx, CENTER[sc]); setPalette('black'); },
    frame(ctx, t) { paintBand('arrival'); wrap(ctx, 600 + t * 40); },
    SCENES, paintBand, wrap,
  };
  window.VASE = { setPalette, person, waves, ship, mound, oar, olive, eidolon, incise, meander, clayBackground, groundLine, star, wheat, CLAY, GLAZE, RED, WHITE, GROUND, BH };
})();
