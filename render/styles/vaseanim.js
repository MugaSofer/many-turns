// Animated black-figure vase: a continuous frieze around the whole circumference, turned by a camera path synced to the song.
(() => {
  const E = window.ENGINE, MV = window.MV;
  const V = Object.assign({}, window.VASE, { person: personBeat });
  let curT = 0, curUStart = 0;
  // Every figure breathes with the music: a sway across each bar (neighbours alternate, like a crowd swaying
  // together) and a small nod on every beat. Pass o.noIdle to keep a figure exactly on its pose.
  function personBeat(g, x, y, h, pose, facing, o = {}) {
    let P = typeof pose === 'string' ? E.POSES[pose] : pose;
    if (!o.noIdle && !P.rot) {
      const wx = x + curUStart, side = (((Math.floor(wx / 170) % 2) + 2) % 2) ? 1 : -1;
      const bt = MV.beatOf(curT), gt = 0.35 + 0.65 * Math.min(1, 0.2 + MV.feltStrength(curT)), sway = Math.sin(bt * Math.PI / 2) * side * gt, nod = 1.8 * MV.drum(curT, 0.13);
      const q = Object.assign({}, P);
      q.torso = (q.torso || 0) + sway * 2.2;
      q.neck = (q.neck || 0) + nod * 7 + sway * 1.5;
      if (q.lArm) q.lArm = [q.lArm[0] + sway * 3, q.lArm[1] + sway * 5 + nod * 3];
      if (q.rArm) q.rArm = [q.rArm[0] - sway * 3, q.rArm[1] - sway * 4];
      P = q;
    }
    // clothing variant is hashed from the height, so pin it before the bounce squashes h (else tunics flicker red/black)
    if (o.variant === undefined) o = Object.assign({}, o, { variant: Math.floor(E.hash2(Math.round(h), o.beard ? 1 : 0, 7) * 3) });
    if (!o.noIdle) {   // bounce: a quick squash on every beat with a little lift before it, so bodies visibly land on the beat
      const bt = MV.beatOf(curT), ff = bt - Math.floor(bt);
      h *= 1 - 0.028 * (Math.exp(-7 * ff) - 0.3 * Math.exp(-10 * (1 - ff))) * Math.min(1, 0.45 + MV.feltStrength(curT));
    }
    // anyone sitting (thighs level, hips well off the ground) gets a stool under them: a diphros, as on vases,
    // unless they sit on something else (o.noSeat)
    if (!o.noSeat && !P.rot && P.lLeg && P.lLeg[0] > 95 && P.rLeg && P.rLeg[0] > 90) {
      const F0 = E.figure(x, y, h, P, facing), hy = F0.hip[1] + 0.035 * h;
      if (y - hy > 0.12 * h) { const f = facing, x0 = F0.hip[0] - f * 0.1 * h, x1 = F0.hip[0] + f * 0.13 * h, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        g.save(); g.fillStyle = GLAZE; g.fillRect(lo - 4, hy, hi - lo + 8, 0.035 * h);
        for (const lx of [lo + 0.02 * h, hi - 0.02 * h]) { g.beginPath(); g.moveTo(lx - 0.012 * h, hy); g.quadraticCurveTo(lx - 0.02 * h, (hy + y) / 2, lx - 0.008 * h, y); g.lineTo(lx + 0.008 * h, y); g.quadraticCurveTo(lx + 0.02 * h, (hy + y) / 2, lx + 0.012 * h, hy); g.fill(); }
        g.restore(); } }
    return window.VASE.person(g, x, y, h, P, facing, o);
  }
  const { W, H, mulberry32, noise2, lerp, clamp, ease, easeOut, figure, lerpPose, walkPose, POSES, taper } = E;
  let { CLAY, GLAZE, RED, WHITE, BH } = V;
  const PAL = { black: ['#c7672e', '#17110e', '#7e2618', '#ecdfc4'], white: ['#ece2cc', '#8c6a52', '#9a4a3a', '#f7f1e3'], red: ['#17120f', '#c9703a', '#7e2618', '#ecdfc4'] };
  function usePalette(n) { V.setPalette(n); [CLAY, GLAZE, RED, WHITE] = PAL[n]; }
  const R = 1700, C = Math.round(2 * Math.PI * R);       // vase radius and circumference (frieze length)
  const GROUND = 640, WIN = 2300;                         // ground line in band coords; visible band window width
  const BEAT0 = 0.464, BEAT = 0.5805, BAR = BEAT * 4;
  const beatOf = t => MV.beatOf(t), barStart = n => MV.barTime(n);

  // ---- cached clay texture for the whole circumference (one per palette), and the meander strips ----
  function buildClay(pal) {
    usePalette(pal);
    const cv = document.createElement('canvas'); cv.width = C; cv.height = BH;
    const g = cv.getContext('2d', { willReadFrequently: true });
    // clay texture generated once for the whole circumference, and made periodic (the last stretch blends into the
    // start), so there are no tile seams or mirror lines anywhere, including where the pot wraps round
    g.fillStyle = CLAY; g.fillRect(0, 0, C, BH);
    const img = g.getImageData(0, 0, C, BH), d = img.data, BL = 900;
    const tex = (x, y) => (E.fbm(x * 0.004, y * 0.004, 3, 4) - 0.5) * 0.22 + (E.noise2(x * 0.3, y * 0.3, 5) - 0.5) * 0.06;
    for (let y = 0; y < BH; y += 2) for (let x = 0; x < C; x += 2) {
      let n = tex(x, y); if (x > C - BL) { const w = (x - (C - BL)) / BL, ws = w * w * (3 - 2 * w); n = n * (1 - ws) + tex(x - C, y) * ws; }
      const k = 1 + n;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2 && x + dx < C; dx++) { const i = ((y + dy) * C + x + dx) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    }
    g.putImageData(img, 0, 0);
    // the key pattern, drawn straight onto the whole circumference with its unit adjusted to fit a whole number of times
    { const units = Math.round(C / 56), m = document.createElement('canvas'); m.width = C; m.height = 70; const mg = m.getContext('2d');
      mg.fillStyle = CLAY; mg.fillRect(0, 0, C, 70); mg.save(); mg.scale(C / (units * 56), 1); V.meander(mg, 0, units * 56, 0, 70); mg.restore();
      g.drawImage(m, 0, 0); g.drawImage(m, 0, BH - 70); }
    g.fillStyle = GLAZE; g.fillRect(0, 70, C, 6); g.fillRect(0, BH - 76, C, 6);
    usePalette('black');
    return cv;
  }
  const CLAYS = { black: buildClay('black'), white: buildClay('white'), red: buildClay('red') };
  const WIDE = 5600;   // band window width for the room shots, so the scene wraps to the pot's silhouette
  let WINC = WIN;      // current band window width
  const band = document.createElement('canvas'); band.width = WIDE; band.height = BH * 2;
  const band2 = document.createElement('canvas'); band2.width = WIDE; band2.height = BH * 2;
  let SS = 1;   // paint scale of the band (2 when the camera pushes in)
  const b = band.getContext('2d');

  // ---- layout of scenes around the vase (u = position along circumference) ----
  const U = { intro: 1100, arrival: 3400, shores: [5000, 5650, 6300, 6950], chorus: 8700 };

  // helpers drawn in band-window coords (already translated so u maps to x)
  // the sea, as Greek painters drew it: the running wave (Vitruvian scroll). Dark water and light air are two interlocking
  // spirals of equal width: each wave's back rises from the base band, curls over clockwise, and the air spirals into it.
  // One wave is computed once per colour as a tile (anti-aliased), then repeated; fixed to the vase (it turns with it),
  // drifting slowly, swelling gently on the felt beat; the ends taper down to the band rather than cutting off.
  // the tile is traced from Muga's diagram (styles/wavetile.js): water rises up the back, curls over, and the air spirals
  // in from the front and under the curl, water and air arms of matching width; recoloured per palette
  const WTILE = {}, WP = 150, WH = Math.round(150 * 340 / 359);
  function waveTile(col) {
    if (WTILE[col]) return WTILE[col];
    const img = window.WAVE_IMG, c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x2 = c.getContext('2d'); x2.fillStyle = col; x2.fillRect(0, 0, c.width, c.height); x2.globalCompositeOperation = 'destination-in'; x2.drawImage(img, 0, 0);
    WTILE[col] = c; return c;
  }
  function wavesAt(g, x0, x1, t, o = {}) {
    const base = (o.base ?? GROUND) + 2, bt = MV.beatOf(t);
    const sw = 0.5 + 0.5 * Math.cos(2 * Math.PI * (bt - Math.floor(bt)));
    const swell = 0.96 + 0.07 * sw * Math.min(1, 0.3 + MV.feltStrength(t)) + 0.05 * MV.env('bassEnv', t);
    const span = Math.max(1, x1 - x0), tl = Math.min(o.tl ?? 170, span / 3), tr = Math.min(o.tr ?? 170, span / 3);
    const fac = xx => { const e = Math.min(1, (xx - x0) / tl, (x1 - xx) / tr); return e <= 0 ? 0 : e * e * (3 - 2 * e); };
    const tile = waveTile(GLAZE), shift = curUStart - (t * 38 + 22 * MV.beatOf(t)), WS = o.scale || 1;   // the sea rolls along, surging on each beat
    // the waves keep their size; the frieze follows a long, gentle curve that dips at its ends, and a straight ground
    // line cuts it off there, so at the shore the waves sink smoothly out of sight (Muga's diagram)
    g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, GROUND + 1); g.clip();
    const PW = WP * WS, TW = tile.width, TH = tile.height, STEP = 2, hh = WH * WS * swell, HMAX = hh + 30;
    // (o.cutL / o.cutR: the frieze ends straight at a divider there, as on vases, and only sinks at the other end)
    const one = o.cutL || o.cutR, lim = one ? 0.95 : 0.45;
    const zl = o.cutL ? 0 : Math.min(Math.max(tl * 3, 600), span * lim), zr = o.cutR ? 0 : Math.min(Math.max(tr * 3, 600), span * lim);
    const drop = xx => { const u = Math.max(0, zl ? 1 - (xx - x0) / zl : 0, zr ? 1 - (x1 - xx) / zr : 0); return HMAX * u * u; };   // a parabola: gentle where it starts
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x0, GROUND + 3);
    for (let xx = x0; xx <= x1; xx += 4) g.lineTo(xx, base - 12 + drop(xx));
    g.lineTo(x1, GROUND + 3); g.closePath(); g.fill();
    // the frieze bent along the curve: thin slices laid edge to edge along it, each turned to the curve's direction
    // there (so upright lines become radial, as on a curved band), the pattern advancing by distance along the curve
    // (no stretching); anchored in vase coordinates, so it doesn't slide as the camera moves
    const yb = xx => base - 12 + 10 * WS + 1 + drop(xx), slope = xx => (yb(xx + 1) - yb(xx - 1)) / 2;
    let ph = (x0 + shift) / PW;
    for (let xx = x0; xx < x1; xx += STEP) {
      const xm = xx + STEP / 2, m = slope(xm), ds = STEP * Math.sqrt(1 + m * m), dph = ds / PW;
      if (drop(xm) < HMAX - 1) {
        g.save(); g.translate(xm, yb(xm)); g.rotate(Math.atan(m));
        let u = ph - Math.floor(ph), rem = dph, dx = -ds / 2;
        while (rem > 1e-6) { const take = Math.min(rem, 1 - u), w = ds * take / dph;
          g.drawImage(tile, u * TW, 0, Math.max(0.5, take * TW), TH, dx - 0.3, -hh, w + 0.9, hh + 2);
          dx += w; rem -= take; u = 0; }
        g.restore();
      }
      ph += dph;
    }
    g.restore();
  }
  // a leaping dolphin, as on Greek sea scenes
  function dolphin(g, x, y, s, ang) {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = GLAZE;
    g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.45, s * 0.8, -s * 0.08); g.lineTo(s * 1.08, -s * 0.02); g.lineTo(s * 0.8, s * 0.07); g.quadraticCurveTo(0, s * 0.26, -s, 0); g.fill();
    g.beginPath(); g.moveTo(-s * 0.1, -s * 0.3); g.lineTo(s * 0.12, -s * 0.58); g.lineTo(s * 0.26, -s * 0.28); g.fill();
    g.beginPath(); g.moveTo(-s * 0.9, 0); g.lineTo(-s * 1.28, -s * 0.26); g.lineTo(-s * 1.16, 0); g.lineTo(-s * 1.28, s * 0.24); g.fill();
    g.fillStyle = WHITE; g.beginPath(); g.arc(s * 0.55, -s * 0.1, s * 0.045, 0, 7); g.fill();
    g.restore();
  }
  // dolphins leap on the guitar's riffs (a strong strum after a pause), rising from behind the sea and diving back in
  let RIFFS = null;
  function riffs() { if (RIFFS) return RIFFS; const G = ((window.TIMING || {}).stems || {}).gtr || []; RIFFS = []; let last = -9;
    for (const [tt, sv] of G) { if (sv >= 0.8 && tt - last > 1.5 && (!RIFFS.length || tt - RIFFS[RIFFS.length - 1] > 3)) RIFFS.push(tt - 0.02); if (sv >= 0.8) last = tt; } return RIFFS; }
  function dolphins(g, x0, x1, t, seed = 0) {
    g.save(); g.beginPath(); g.rect(x0 - 400, 0, x1 - x0 + 800, GROUND - 4); g.clip();
    riffs().forEach((t0, i) => { const p = (t - t0 + 0.03 + 0.36) / 1.7; if (p < 0 || p > 1) return;   // it breaks the surface ~0.36 s into the leap, so that lands on the riff
      const bx = x0 + ((i * 523 + seed * 211) % Math.max(1, x1 - x0 - 400));
      dolphin(g, bx + p * 360, GROUND + 40 - Math.sin(p * Math.PI) * 250, 66, -Math.cos(p * Math.PI) * 0.9); });
    g.restore();
  }
  // progress 0..1 from t0 over dur seconds, advancing in eased steps, one step per beat (growth "painted" to the rhythm)
  function beatStep(t, t0, dur) {
    if (t <= t0) return 0; const nb = Math.max(1, MV.beatOf(t0 + dur) - MV.beatOf(t0)), b = MV.beatOf(t) - MV.beatOf(t0);
    return clamp((Math.floor(b) + ease(clamp((b - Math.floor(b)) / 0.45))) / nb);
  }
  // a walk whose footfalls land on the beat, with the stride matched to the walker's actual speed (no skating)
  function strideWalk(t, speed, h, extra = {}, phaseOff = 0) {
    const step = speed * MV.RAW_BEAT, legL = 0.495 * h;
    const amp = Math.min(26, Math.asin(Math.min(0.45, step / (2 * legL))) * 57.3), k = Math.max(0.25, amp / 22);
    const P = walkPose(MV.rawBeatOf(t) / 2 + 0.25 + phaseOff, extra);
    P.lLeg = P.lLeg.map(v => v * k); P.rLeg = P.rLeg.map(v => v * k);
    return P;
  }
  function lettering(g, x, y, text, size, nShow = 99) {   // painted capitals, slightly irregular; nShow letters painted so far
    g.save(); g.fillStyle = GLAZE; g.font = `${size}px Georgia, serif`; g.textBaseline = 'alphabetic';
    let cx = x, k = 0; for (const ch of text) { if (k++ >= nShow) break; g.save(); g.translate(cx, y + (noise2(cx * 0.01, 0, 4) - 0.5) * 6); g.rotate((noise2(cx * 0.02, 1, 5) - 0.5) * 0.08); g.fillText(ch, 0, 0); g.restore(); cx += g.measureText(ch).width + size * 0.12; }
    g.restore();
  }

  // names painted beside the figures, as vase painters did (cf. the François vase, Exekias): thin, evenly spaced
  // capitals, each letter set by hand (a little off the line, a little tilted), running along a gentle curve or straight
  // down beside the figure; painted on one letter after another from o.t0. align: 0 centred on x, -1 ending at x,
  // 1 starting at x. o.v: run vertically downward from (x, y). o.bend: curvature of the line (+ bows up).
  function nameLabel(g, x, y, text, align = 0, a = 1, o = {}) {
    if (a <= 0.01) return;
    const t0 = o.t0 === undefined ? -1e9 : MV.timeOfBeat(Math.ceil(MV.beatOf(o.t0) - 0.15)), now = curT,   // (each name starts painting on a beat)
    sz = o.size || 23, sp = sz * 0.34;
    g.save(); g.globalAlpha *= a; g.font = `500 ${sz}px "Segoe UI", Tahoma, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.lineJoin = 'round';
    const chars = [...text], ws = chars.map(ch => g.measureText(ch).width), L = ws.reduce((q, w) => q + w + sp, -sp);
    const s0 = align === 0 ? -L / 2 : align < 0 ? -L : 0, bend = o.bend ?? 0.00035, rnd = mulberry32(text.length * 131 + text.charCodeAt(0));
    const mid = s0 + L / 2, place = d => o.v ? [x + Math.sin(d * 0.004) * 6, y + d - s0, Math.PI / 2] : [x + d, y - bend * ((L / 2) ** 2 - (d - mid) ** 2), Math.atan(2 * bend * (d - mid))];
    let d = s0; const gl = [];
    chars.forEach((ch, i) => { const c = d + ws[i] / 2, [px, py, ang] = place(c), j = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      const on = clamp((now - t0 - i * 0.07) / 0.12); d += ws[i] + sp; if (on <= 0 || ch === ' ') return;
      gl.push([ch, px + j[0] * 2, py + j[1] * 3, ang + j[2] * 0.14, on]); });
    for (const pass of [0, 1]) for (const [ch, px, py, ang, on] of gl) { g.save(); g.translate(px, py); g.rotate(ang); g.scale(0.8 + 0.2 * on, 0.8 + 0.2 * on); g.globalAlpha = a * on;
      if (pass === 0) { g.strokeStyle = CLAY; g.lineWidth = 6; g.strokeText(ch, 0, 0); } else { g.fillStyle = GLAZE; g.fillText(ch, 0, 0); } g.restore(); }
    g.restore();
  }
  // a name painted at a fixed place on the vase (u: position along the circumference), like a real inscription
  const nameLabelU = (g, u, y, text, align = 0, a = 1, o = {}) => nameLabel(g, u - curUStart, y, text, align, a, o);
  const NL = (g, F, text, align = 0, dy = 0, a = 1, o = {}) => nameLabel(g, F.headC[0] + (align ? align * -F.headR * 1.4 : 0), F.headC[1] - F.headR * 1.9 + dy, text, align, a, o);

  function sceneIntro(g, u, t) {
    const x = u;   // centre of this scene in window coords
    const rnd = mulberry32(31);
    const bi = ((Math.floor(MV.rawBeatOf(t)) % 4) + 4) % 4, pl = MV.drum(t, 0.2);
    // at night the sky is red-figure too: moon and stars in reserved orange rather than added white
    const SKY = CLAY === PAL.red[0] ? GLAZE : WHITE;
    const star5 = (sx, sy, r) => { g.fillStyle = SKY; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(sx + Math.sin(a) * rr, sy - Math.cos(a) * rr); } g.fill(); };
    for (let i = 0; i < 40; i++) { const sx = x - 2700 + rnd() * 4000, sy = 110 + rnd() * 230, sr = (5 + rnd() * 5) * (1 + (i % 4 === bi ? 0.6 * pl : 0)); if (!(sy > 130 && sx > x - 520 && sx < x + 560)) star5(sx, sy, sr); }   // none behind the title
    spark(g, x + 620, 165, 32 * (1 + 0.12 * MV.drum(t, 0.2)));   // the star he steers by
    g.fillStyle = SKY; g.beginPath(); g.arc(x - 650, 190, 50, 0, 7); g.fill(); g.fillStyle = CLAY; g.beginPath(); g.arc(x - 628, 178, 45, 0, 7); g.fill();
    dolphins(g, x - 2400, x + 900, t, 3);
    const SEA0 = x - 2900, SEA1 = x + 1560;            // one sea from the far side of the pot to the beach (shared with the arrival scene)
    wavesAt(g, SEA0, SEA1, t, { tr: 280 });
    // the raft: lashed logs riding low in the water, a square sail on a yard, the steering oar astern
    const bt = MV.beatOf(t), bob = Math.sin(bt * Math.PI) * 5, tilt = Math.sin(bt * Math.PI + 0.8) * 0.025, rx = x + 150, ry = GROUND - 118 + bob;   // (riding low, in the water)
    g.save(); g.translate(rx, ry); g.rotate(tilt);
    g.strokeStyle = GLAZE; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -205); g.lineTo(-125, 2); g.moveTo(0, -205); g.lineTo(125, 2); g.stroke();   // stays
    g.fillStyle = GLAZE; g.beginPath(); g.roundRect(-135, 0, 270, 20, 9); g.fill();
    for (let k = -2; k <= 2; k++) { V.incise(g, [[k * 52 - 3, 2], [k * 52 - 3, 18]], 1.3); V.incise(g, [[k * 52 + 3, 2], [k * 52 + 3, 18]], 1.3); }
    V.incise(g, [[-128, 10], [128, 10]], 1);
    g.fillRect(-3, -210, 6, 212);                                               // mast
    g.fillRect(-72, -198, 144, 5);                                              // yard
    const bl = 14 + 5 * Math.sin(t * 1.1);
    g.beginPath(); g.moveTo(-66, -194); g.lineTo(66, -194); g.quadraticCurveTo(66 + bl, -140, 60, -86); g.quadraticCurveTo(0, -80 + bl * 0.4, -60, -86); g.quadraticCurveTo(-66 + bl * 0.6, -140, -66, -194); g.fill();
    for (let k = -2; k <= 2; k++) V.incise(g, [[k * 24, -190], [k * 23 + bl * 0.3, -90]], 1.1);
    // the opening image: as in Odyssey 5, he sits astern all night, never sleeping, steering by the stars: upright, head
    // raised to the star (the spark, top right), his back hand on the tiller at his hip, the other resting on his knee
    const sway = Math.sin(t * 0.9) * 4, RP = { torso: -4, neck: -22 + Math.sin(t * 0.6) * 3, lArm: [0, 0], rArm: [0, 0], lLeg: [92, 8], rLeg: [86, 2], hipH: 0.02 };
    const RF = E.figure(-95, 0, 150, RP, 1), RS = RF.shoulder, hp = RF.hip, TH = [hp[0] - 30 + sway, hp[1] + 2], TB = [-185, 34];
    g.lineWidth = 5; g.beginPath(); g.moveTo(TH[0], TH[1]); g.lineTo(TB[0], TB[1]); g.stroke();   // the steering oar
    g.beginPath(); g.ellipse(TB[0] - 2, TB[1] + 2, 7, 16, 0.75, 0, 7); g.fill();
    RP.rArm = armIK(RS, [TH[0] + 4, TH[1] - 2], 0.17 * 150, 0.16 * 150, 1, RP.torso, -1);   // back hand on the tiller
    const knee = RF.legs.l[1]; RP.lArm = armIK(RS, [knee[0] - 4, knee[1] - 6], 0.17 * 150, 0.16 * 150, 1, RP.torso, 1);   // front hand on his knee
    { g.fillStyle = GLAZE; g.fillRect(hp[0] - 22, hp[1] + 4, 40, -hp[1] - 4); V.incise(g, [[hp[0] - 18, hp[1] + 14], [hp[0] + 14, hp[1] + 14]], 1); }   // a sea-chest to sit on
    V.person(g, -95, 0, 150, RP, 1, { ody: true, beard: true, noIdle: true, noSeat: true });
    g.restore();
    // (the raft rides on top of the wave band, as boats do on the vases)

    // title, painted on at the start and fading as the vase turns on
    const a = clamp((t - 16.32) / 0.12) * (1 - clamp((t - 19.0) / 1.0));   // (painted on all at once, on the downbeat)
    if (a > 0) { g.globalAlpha = a; lettering(g, x - 470, 262, 'MANY TURNS', 110); g.globalAlpha = 1; }
  }

  const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  function sceneArrival(g, u, t) {
    const x = u - 1300;   // local frame matches the still (0..2600)
    wavesAt(g, x - 3900, x + 560, t, { tr: 280 });   // the same sea as the intro (same u range), running up the beach
    // the beach: a stippled strand rising gently out of the surf
    { const rs = mulberry32(44); g.fillStyle = GLAZE;
      for (let k = 0; k < 420; k++) { const xx = x + 300 + rs() * 1100, e = clamp((xx - x - 300) / 300) * clamp((x + 1400 - xx) / 200), hh = 16 * e; if (hh < 1) continue; g.globalAlpha = 0.55; g.beginPath(); g.arc(xx, GROUND - rs() * hh, 1.3 + rs() * 1.4, 0, 7); g.fill(); }
      g.globalAlpha = 1; }
    // the story (Odyssey 6), composed after the Nausicaa Painter's amphora: Odysseus sleeps behind a low olive thicket;
    // the maids' stray ball lands by it and wakes him; he lifts his head, sits up and rises behind the bush (the bush hides
    // the change of posture, as a painter would), then steps out from behind it holding a leafy branch before him, a
    // suppliant; Nausicaa hands him the cloak, and as he's clothed his detail is drawn in.
    const OH = 330, TX = x + 700;
    const nw = Math.floor(MV.beatOf(23.9)), tThrow = MV.timeOfBeat(nw), tLand = MV.timeOfBeat(nw + 1);   // the stray throw, beat to beat
    const tWake = tLand + 0.1;
    const look = ease(clamp((t - tWake) / 0.45)), sit = ease(clamp((t - tWake - 0.5) / 0.8)), up = ease(clamp((t - tWake - 1.25) / 0.9));
    const stepAt = tt => ease(clamp((tt - tWake - 2.0) / 1.7));
    const OXt = tt => lerp(TX - 35, x + 905, stepAt(tt)), OX = OXt(t), oSp = Math.abs(OXt(t + 0.05) - OXt(t - 0.05)) / 0.1;
    const LIE = Object.assign({}, POSES.lie, { hipH: 0.1, neck: -5 - 35 * look * (1 - sit), lArm: [10, 20], rArm: [-4, 10] });   // (arms by his sides: hidden by the mound)
    const SIT = { torso: 12, neck: -8, lArm: [50, 70], rArm: [30, 60], lLeg: [88, 4], rLeg: [80, -4], hipH: 0.06, rot: 0 };
    const HUNCH = { torso: 6, neck: 4, lArm: [8, 2], rArm: [-4, 12], lLeg: [4, 0], rLeg: [-4, -2], rot: 0 };   // standing behind the bush
    const take = ease(clamp((t - 28.3) / 0.8)), give = 1 - clamp((t - 29.4) / 0.8);
    const STAND = { torso: 0, neck: 0, lArm: [8, 2], rArm: [lerp(-6, 70, take * give), lerp(10, 80, take * give)], lLeg: [3, 0], rLeg: [-3, -2], rot: 0 };
    const rise = ease(clamp((t - 28.0) / 2.2));
    let P = up > 0 ? lerpPose(SIT, HUNCH, up) : sit > 0 ? lerpPose(LIE, SIT, sit) : LIE;
    if (oSp > 5) { const W0 = strideWalk(t, Math.max(40, oSp), OH, { torso: 20 }); P = Object.assign({}, P, { lLeg: lerp2(P.lLeg, W0.lLeg, clamp(oSp / 60)), rLeg: lerp2(P.rLeg, W0.rLeg, clamp(oSp / 60)) }); }
    if (rise > 0) P = lerpPose(P, STAND, rise);
    P = Object.assign({}, P, { noGround: true });   // (grounded here instead, smoothly)
    // kept on the ground at every angle (continuously; the engine's own grounding only applies when nearly upright, which
    // made him jump as he sat up)
    const GY = (() => { const F0 = E.figure(OX, GROUND, OH, P, 1), lowF = Math.max(F0.legs.l[1][1], F0.legs.l[2][1], F0.legs.r[1][1], F0.legs.r[2][1], F0.hip[1]) - GROUND, lowH = F0.hip[1] - GROUND; return GROUND - Math.max(0, lerp(lowH, lowF, ease(clamp(up / 0.7)))); })();   // (while he sits up behind the mound only his hip need clear the ground)
    // while he holds the bough, his near hand holds it in front of his hips (arm solved to reach there)
    const holdB = clamp((t - tWake - 1.3) / 0.5) * (1 - clamp((t - 29.4) / 0.8));
    if (holdB > 0) { const F0 = E.figure(OX, GY, OH, P, 1), hp = [F0.hip[0] + 0.07 * OH, F0.hip[1] - 0.02 * OH];
      const ik = armIK(F0.shoulder, hp, 0.17 * OH, 0.16 * OH, 1, P.torso, -1); P.lArm = P.lArm.map((v, i) => lerp(v, ik[i], holdB)); }
    // bare silhouette until clothed; then his detail is drawn in, head to foot (29.2-32.4)
    const leaf = (lx, ly, an, L, fill, fromBase = false) => { g.save(); g.translate(lx, ly); g.rotate(an); if (fromBase) g.translate(L / 2, 0); g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -L * 0.2, L / 2, 0); g.quadraticCurveTo(0, L * 0.2, -L / 2, 0); g.fillStyle = fill; g.fill(); g.strokeStyle = CLAY; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2 + 3, 0); g.lineTo(L / 2 - 4, 0); g.stroke(); g.restore(); };
    const FACE = up > 0.5 ? 1 : -1;   // asleep facing inland (his head towards the girls' voices), turns as he rises
    const reveal = clamp((t - 29.2) / 3.2), F = E.figure(OX, GY, OH, P, 1);   // (always facing the girls: no flip)
    const yTop = F.headC[1] - OH * 0.2, yBot = GROUND + 12, wipeY = lerp(yTop, yBot, ease(reveal));
    if (reveal < 1) { g.save(); g.beginPath(); g.rect(OX - 400, wipeY, 800, Math.max(0, GROUND + 3 - wipeY)); g.clip();   // (never below the ground line)
      g.fillStyle = GLAZE; window.BODY.drawFigure(g, F, { body: GLAZE }); g.restore(); }
    let O = F;
    if (reveal > 0) { g.save(); g.beginPath(); g.rect(OX - 400, 0, 800, wipeY); g.clip(); O = V.person(g, OX, GY, OH, P, 1, { ody: true, beard: true, noIdle: true, noSeat: true, cloak: t > 30.4 ? RED : null }); g.restore(); }
    // the olive thicket he slept behind: a low mound of leaves over the ground, stems and sprays above; it shivers as he
    // rises. Drawn in front of him until he's standing (it hides the change from lying to standing), behind him after.
    function drawThicket() { const rt = mulberry32(58), shake = (sit > 0 && up < 1 ? Math.sin(t * 30) * 3 : 0) * (1 - up);
      g.strokeStyle = GLAZE; g.lineCap = 'round';
      const stems = [[-120, -60, 150], [-60, -20, 185], [0, 30, 175], [60, 70, 140], [-150, -170, 110], [90, 130, 105]];
      for (const [x0, x1, hh] of stems) { g.lineWidth = 6; g.beginPath(); g.moveTo(TX + x0, GROUND); g.quadraticCurveTo(TX + (x0 + x1) / 2 + shake, GROUND - hh * 0.6, TX + x1 + shake, GROUND - hh); g.stroke(); }
      for (let k = 0; k < 150; k++) { const si = k % stems.length, [x0, x1, hh] = stems[si], u = 0.25 + rt() * 0.8, px = TX + lerp(x0, x1, u) + shake * u + (rt() - 0.5) * 50, py = GROUND - hh * u - (rt() - 0.3) * 30;
        leaf(px, py, -Math.PI / 2 + (rt() - 0.5) * 2.4, 30 + rt() * 12, GLAZE, true); }
      g.fillStyle = GLAZE; g.beginPath(); g.moveTo(TX - 230, GROUND); g.quadraticCurveTo(TX - 220, GROUND - 60, TX - 120, GROUND - 66); g.lineTo(TX + 80, GROUND - 70); g.quadraticCurveTo(TX + 150, GROUND - 60, TX + 160, GROUND); g.fill();
      for (let k = 0; k < 60; k++) leaf(TX - 220 + rt() * 370, GROUND - 60 - rt() * 20, -Math.PI / 2 + (rt() - 0.5) * 2.6, 26 + rt() * 10, GLAZE, true); }
    drawThicket();   // always in front: he steps out from behind its end
    // the leafy branch he broke from the thicket, held before him, from rising until he's clothed
    const brA = clamp((t - tWake - 1.3) / 0.5) * (1 - clamp((t - 29.4) / 0.8));
    if (brA > 0) { const hnd = F.arms.l[2]; g.save(); g.beginPath(); g.rect(OX - 400, 0, 800, GROUND + 1); g.clip(); g.globalAlpha = brA;   // (never below the ground)
      // an olive bough hanging from his hand across his hips: a curving stem, pairs of long narrow leaves along it
      const Q0 = [hnd[0] - 4, hnd[1] - 22], Q1 = [hnd[0] + 26, hnd[1] + 20], Q2 = [hnd[0] + 18, hnd[1] + 95];   // hanging down over his groin
      const bz = u => [(1 - u) * (1 - u) * Q0[0] + 2 * u * (1 - u) * Q1[0] + u * u * Q2[0], (1 - u) * (1 - u) * Q0[1] + 2 * u * (1 - u) * Q1[1] + u * u * Q2[1]];
      g.strokeStyle = GLAZE; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(...Q0); g.quadraticCurveTo(...Q1, ...Q2); g.stroke();
      for (let k = 0; k < 8; k++) { const u = 0.12 + k * 0.11, [px, py] = bz(u), [qx, qy] = bz(u + 0.02), ta = Math.atan2(qy - py, qx - px);
        for (const sd of [-1, 1]) leaf(px, py, ta + sd * 0.7, 40 - k * 1.5, GLAZE, true); }
      leaf(Q2[0] + 4, Q2[1] + 14, Math.PI / 2 - 0.2, 34, GLAZE);
      g.globalAlpha = 1; g.restore(); }
    // Nausicaa: walks in with the cloak folded over her arm (21.4-24.5), watches; walks up to him (26.6-28.2) holding it
    // out, and he takes it from her hands (28.3-29.1); it settles on his shoulders (29.2-30.7)
    const walk1 = clamp((t - 21.4) / 3.1), walk2 = clamp((t - 26.6) / 1.6);
    const nxAt = tt => { const w1 = clamp((tt - 21.4) / 3.1), w2 = clamp((tt - 26.6) / 1.6); return w2 > 0 ? lerp(x + 1320, x + 1120, ease(w2)) : lerp(x + 1700, x + 1320, ease(w1)); };
    const nx = nxAt(t), nSpeed = Math.abs(nxAt(t + 0.05) - nxAt(t - 0.05)) / 0.1;   // her stride follows how fast she's really moving
    const offer = ease(clamp((t - 27.4) / 0.9));
    const walking = (walk1 > 0 && walk1 < 1) || (walk2 > 0 && walk2 < 1);
    const NP0 = lerpPose(Object.assign({}, POSES.stand, { lArm: [30, 70], rArm: [-6, 10] }), strideWalk(t, Math.max(40, nSpeed), 360), clamp(nSpeed / 60));
    const NP = lerpPose(NP0, POSES.offer, offer);
    const N = V.person(g, nx, GROUND, 360, NP, -1, { woman: true }); nameLabelU(g, 3330, 262, 'NAUSICAA', 0, 1 - ease(clamp((t - 26.8) / 0.8)), { t0: 23.6 });   // (fades once she has walked away from it)
    nameLabelU(g, 2985, 292, 'ODYSSEUS', 0, 1, { t0: 26.5 });   // (painted on "with nothing but my name")
    const cloakOn = ease(clamp((t - 29.2) / 1.5));
    const a2 = N.arms.l[2], c2 = N.arms.r[2], her = [lerp(a2[0], (a2[0] + c2[0]) / 2, offer), lerp(a2[1] + 6, (a2[1] + c2[1]) / 2, offer)];
    const his = F.arms.r[2], held = [lerp(her[0], his[0], take), lerp(her[1], his[1], take)];
    const hx = lerp(held[0], O.shoulder[0] + 10, cloakOn), hy = lerp(held[1], O.shoulder[1] - 8, cloakOn), cs = lerp(lerp(0.6, 0.9, offer), 0.75, cloakOn);
    g.save(); g.globalAlpha *= 1 - clamp((t - 30.2) / 0.5); g.fillStyle = RED;
    window.BODY.smoothPath(g, [[hx + 20 * cs, hy - 6], [hx + 10 * cs, hy + 60 * cs], [hx - 5 * cs, hy + 165 * cs], [hx - 120 * cs, hy + 180 * cs], [hx - 140 * cs, hy + 100 * cs], [hx - 60 * cs, hy + 30 * cs]]);
    g.fill(); g.strokeStyle = GLAZE; g.lineWidth = 1.4; for (let k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(hx - 10 * cs * k, hy + 20 * cs); g.lineTo(hx - 25 * cs * k, hy + 160 * cs); g.stroke(); } g.restore();
    // the maids' ball game: one throw per beat, caught on the beat; the stray throw goes to the heap and wakes him
    const m1 = [x + 1980, GROUND - 330], m2 = [x + 2220, GROUND - 330], bt = MV.beatOf(t), ph = bt - Math.floor(bt), dirn = Math.floor(bt) % 2;
    let bx, by, reachA = dirn ? ph : 1 - ph;
    if (t < tThrow) { const A = dirn ? m1 : m2, B = dirn ? m2 : m1; bx = lerp(A[0], B[0], ph); by = lerp(A[1], B[1], ph) - Math.sin(ph * Math.PI) * 150; }
    else if (t < tLand) { const q = (t - tThrow) / (tLand - tThrow), bT = MV.beatOf(tThrow), d0 = Math.floor(bT + 0.001) % 2, A = d0 ? m1 : m2, B = [TX + 150, GROUND - 20]; /* (thrown by whoever has just caught it) */ bx = lerp(A[0], B[0], q); by = lerp(A[1], B[1], q) - Math.sin(q * Math.PI) * 260; reachA = 1 - q; }
    else { const q = t - tLand, bounce = Math.abs(Math.sin(q * 7)) * 60 * Math.exp(-q * 3.5); bx = TX + 150 + 80 * (1 - Math.exp(-q * 2)); by = GROUND - 20 - bounce; reachA = 0; }
    V.person(g, m1[0], GROUND, 350, lerpPose(POSES.stand, POSES.reach, t < tLand ? reachA : 0), -1, { woman: true });
    V.person(g, m2[0], GROUND, 345, lerpPose(POSES.stand, POSES.reach, t < tThrow ? 1 - reachA : 0), -1, { woman: true });
    g.fillStyle = WHITE; g.beginPath(); g.arc(bx, by, 20, 0, 7); g.fill(); g.strokeStyle = GLAZE; g.lineWidth = 2; g.stroke();
  }

  function sceneShore(g, u, t, k) {
    // one of the "thousand shores": a wave, the same traveller, a different host greeting him on the downbeat
    const x = u, rnd = mulberry32(100 + k);
    wavesAt(g, x - 344, x - 70, t, { scale: 0.6, cutL: true });   // (from the divider column to the beach)
    const landT = barStart(MV.bar(31.26) + k);            // each vignette's moment is its own bar
    const greet = ease(clamp((t - landT - BEAT) / (BEAT * 1.5)));
    V.person(g, x - 40, GROUND, 230, lerpPose(POSES.kneel, POSES.stand, greet * 0.8), 1, { ody: true, beard: true });
    const hosts = [{ woman: true }, { beard: true }, {}, { woman: true }];
    V.person(g, x + 170, GROUND, 250, lerpPose(POSES.stand, POSES.offer, greet), -1, hosts[k % 4]);
    // divider: a palmette column
    g.fillStyle = GLAZE; g.fillRect(x + 300, GROUND - 330, 8, 330);
    for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43; g.beginPath(); g.ellipse(x + 304 + Math.sin(a) * 34, GROUND - 350 - Math.cos(a) * 34, 7, 28, a, 0, 7); g.fill(); }
  }

  function sceneChorus(g, u, t) {
    const x = u;
    // the ring of hosts asking (left), raising a hand on the beats of "Who are you, where's your home, who's your family"
    const askers = [{ woman: true }, { beard: true }, {}];   // first time: a few wary strangers
    askers.forEach((o, i) => {
      const cue = 42.16 + i * 1.2, up = ease(clamp((t - cue) / 0.5)) * (1 - ease(clamp((t - 47.3) / 0.8)));
      const P = lerpPose(POSES.stand, { torso: 4, neck: 4, lArm: [100, 125], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, up);
      V.person(g, x - 700 + i * 180, GROUND, 300 + (i % 2) * 18, P, 1, o);
    });
    // Odysseus with his stick; "Nobody" (47.5–50) empties him to an outline
    const hollow = ease(clamp((t - 47.5) / 0.5)) * (1 - ease(clamp((t - 49.6) / 1.0)));   // refills on "that's me", before the camera turns away
    const OX = x + 200;
    const P = lerpPose(POSES.stand, { torso: 0, neck: 0, lArm: [30, 10], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, 1);
    const F = figure(OX, GROUND, 360, P, -1);
    // (each version fades as one whole image; the hollow keeps a single hat, on the outline)
    ghost(g, 1 - hollow, gg => V.person(gg, OX, GROUND, 360, P, -1, { ody: true, beard: true, noIdle: true }));
    ghost(g, hollow, gg => {    // outline: the silhouette in glaze, then clay inside
      window.BODY.drawFigure(gg, figure(OX, GROUND, 360, P, -1), { body: GLAZE, beard: true, hat: 'pilos', hatColor: '#c7672e', hatEdge: GLAZE });
      window.BODY.drawFigure(gg, figure(OX, GROUND - 5, 350, P, -1), { body: CLAY, beard: true });
    });
    // the stick he carries (it will become the oar)
    const hand = F.arms.l[2];   // (the oar, leant on as a staff: handle to the ground, blade above his head)
    V.oar(g, [hand[0] - 8, GROUND + 2], [hand[0] + 12, hand[1] - 260]);
    // a farmer far off on the right, glimpsed during "for a fan to winnow grain" (56–59)
    const f = ease(clamp((t - 55.8) / 1.0));
    if (f > 0) { g.globalAlpha = f; V.person(g, x + 820, GROUND, 280, 'stand', -1, { beard: true }); V.wheat(g, x + 950, GROUND, 170); V.wheat(g, x + 1010, GROUND, 150); g.globalAlpha = 1; }
  }


  // ======== Verse 2, verse 3, chorus 2 ========
  const HALLS = U.chorus + C + 2300, KINGS = HALLS + 2600, SIRENS = KINGS + 1700, STORIES = SIRENS + 1900, CH2 = STORIES + 2300;
  function lyre(g, x, y, s) {
    g.strokeStyle = GLAZE; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 0.35, y); g.quadraticCurveTo(x - s * 0.55, y - s * 0.6, x - s * 0.3, y - s * 0.95); g.stroke();
    g.beginPath(); g.moveTo(x + s * 0.35, y); g.quadraticCurveTo(x + s * 0.55, y - s * 0.6, x + s * 0.3, y - s * 0.95); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.36, y - s * 0.85); g.lineTo(x + s * 0.36, y - s * 0.85); g.stroke();
    g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x, y, s * 0.42, s * 0.2, 0, 0, 7); g.fill();
    g.strokeStyle = CLAY; g.lineWidth = Math.max(1, s * 0.012); g.beginPath(); g.ellipse(x, y, s * 0.36, s * 0.15, 0, 0, 7); g.stroke(); g.strokeStyle = GLAZE;   // incised rim, so the box reads against a dark lap
    g.lineWidth = 1.2; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x + i * s * 0.07, y - s * 0.1); g.lineTo(x + i * s * 0.08, y - s * 0.85); g.stroke(); }
  }
  // a seated player holding the lyre upright against the chest, as on the vases: the far hand steadies it behind the
  // strings, the near hand sweeps a plectrum across them, one sweep per note the guitar actually plays (alternating direction)
  function armIK(S, T, l1, l2, f, torso, bendDown = 1) {
    const dx = T[0] - S[0], dy = T[1] - S[1], d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx), c = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const e1 = a + c * bendDown * f, J = [S[0] + Math.cos(e1) * l1, S[1] + Math.sin(e1) * l1];
    const ang = (u, v) => Math.atan2((v[0] - u[0]) * f, v[1] - u[1]) * 57.2958 - torso;
    return [ang(S, J), ang(J, T)];
  }
  // carrying a long thing (oar, beam) on the shoulder: the shaft rests on the shoulder, and the near hand grips it in
  // front at chest height (arm solved to reach it), instead of a raised arm. Returns the pose and the shaft ends.
  function shoulderCarry(P, x, h, f) {
    const F0 = E.figure(x, GROUND, h, P, f), S = F0.shoulder, k = h / 330;
    const A = [S[0] - f * 150 * k, S[1] + 20 * k], B = [S[0] + f * 230 * k, S[1] - 40 * k];
    const grip = [lerp(A[0], B[0], 0.6), lerp(A[1], B[1], 0.6) + 8 * k];
    const Q = Object.assign({}, P, { lArm: armIK(S, grip, 0.17 * h, 0.16 * h, f, P.torso || 0, 1) });   // elbow down, hand up on the shaft
    return { P: Q, A, B };
  }
  function bard(g, x, h, facing, t, o = {}) {
    const f = facing, base = { torso: -4, neck: -10, lArm: [40, 90], rArm: [40, 90], lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 };
    const F0 = E.figure(x, GROUND, h, base, f), S = F0.shoulder, ls = 0.4 * h;
    const bx = S[0] + f * 0.3 * h, by = S[1] + 0.3 * h;          // sound box on the lap, yoke rising past the face
    // a strum across the strings (well above the sound box) on every beat, down and up in turn
    const rb = MV.rawBeatOf(t), q = easeOut(clamp((rb - Math.floor(rb)) * MV.RAW_BEAT / 0.12)), dirn = Math.floor(rb) % 2 === 0 ? 1 : -1;
    const sx0 = bx - ls * 0.22, sx1 = bx + ls * 0.22, sy = by - ls * 0.46;
    const px = dirn > 0 ? lerp(sx0, sx1, q) : lerp(sx1, sx0, q);
    const pose = Object.assign({}, base, {
      rArm: armIK(S, [px, sy + (1 - Math.abs(2 * q - 1)) * 0.03 * h], 0.17 * h, 0.16 * h, f, base.torso, 1),
      lArm: armIK(S, [bx - f * 0.02 * h, by - ls * 0.62], 0.17 * h, 0.16 * h, f, base.torso, 1) });
    const BF = V.person(g, x, GROUND, h, pose, f, Object.assign({ beard: true }, o));
    lyre(g, bx, by, ls);
    g.fillStyle = GLAZE; g.beginPath(); g.arc(px, sy, 0.018 * h, 0, 7); g.fill();          // the plucking hand in front of the strings
    g.strokeStyle = GLAZE; g.lineWidth = 0.008 * h; g.beginPath(); g.moveTo(px, sy); g.lineTo(px - f * 0.02 * h, sy + 0.05 * h); g.stroke();   // plectrum
    return BF;
  }
  // the guiding star, drawn as Claude's spark: an uneven burst of rounded, tapering rays (a quiet nod; reads as a star)
  function spark(g, x, y, r, a = 1) {
    // Claude's spark: a dozen chunky rays, wide at the root and tapering to rounded tips, of uneven length
    const RAYS = [[0.00, 1.00], [0.50, 0.80], [1.03, 0.94], [1.58, 0.74], [2.08, 0.98], [2.60, 0.79], [3.13, 0.95], [3.66, 0.76], [4.18, 0.97], [4.70, 0.82], [5.22, 0.92], [5.74, 0.77]];
    g.save(); g.globalAlpha *= a; g.translate(x, y); g.rotate(0.2);
    const night = CLAY === PAL.red[0], col = night ? '#d97757' : WHITE;
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, r * 2); gl.addColorStop(0, night ? 'rgba(217,119,87,0.28)' : 'rgba(255,240,215,0.3)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 2, 0, 7); g.fill();
    g.fillStyle = col;
    for (const [an, len] of RAYS) { const L = r * len, wb = r * 0.15, wt = r * 0.085;
      g.save(); g.rotate(an); g.beginPath(); g.moveTo(-wb, -r * 0.05); g.lineTo(-wt, -(L - wt)); g.arc(0, -(L - wt), wt, Math.PI, 0); g.lineTo(wb, -r * 0.05); g.closePath(); g.fill(); g.restore(); }
    g.beginPath(); g.arc(0, 0, r * 0.24, 0, 7); g.fill(); g.restore();
  }
  function fire(g, x, y, t, s = 1) {
    g.fillStyle = GLAZE; g.fillRect(x - 90 * s, y - 20 * s, 180 * s, 20 * s);
    for (let i = 0; i < 7; i++) {
      const fx = x + (i - 3) * 22 * s, h = (60 + 50 * noise2(i * 3.1, t * 2.2, 11)) * s * (1 + 0.45 * MV.drum(t, 0.1)), sway = (noise2(i * 2.3, t * 3.1, 12) - 0.5) * 30 * s;
      g.fillStyle = i % 2 ? RED : GLAZE;
      g.beginPath(); g.moveTo(fx - 16 * s, y - 20 * s); g.quadraticCurveTo(fx - 14 * s + sway * 0.3, y - 20 * s - h * 0.6, fx + sway, y - 20 * s - h);
      g.quadraticCurveTo(fx + 14 * s + sway * 0.3, y - 20 * s - h * 0.5, fx + 16 * s, y - 20 * s); g.fill();
    }
  }
  function column(g, x, top, bottom) {
    g.fillStyle = GLAZE; g.fillRect(x - 26, top + 30, 52, bottom - top - 30); g.fillRect(x - 46, top, 92, 20); g.fillRect(x - 36, top + 20, 72, 12);
    for (let k = -2; k <= 2; k++) V.incise(g, [[x + k * 9, top + 36], [x + k * 9, bottom - 4]], 1.2);
  }
  function woodenHorse(g, x, y, s, col = GLAZE) {
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
    g.beginPath(); g.ellipse(x, y, s * 0.46, s * 0.19, 0, 0, 7); g.fill();                          // barrel
    g.beginPath(); g.ellipse(x + s * 0.33, y - s * 0.02, s * 0.16, s * 0.2, -0.3, 0, 7); g.fill();       // chest
    g.beginPath(); g.moveTo(x + s * 0.28, y - s * 0.12); g.quadraticCurveTo(x + s * 0.42, y - s * 0.55, x + s * 0.6, y - s * 0.6);
    g.lineTo(x + s * 0.66, y - s * 0.46); g.quadraticCurveTo(x + s * 0.5, y - s * 0.38, x + s * 0.47, y - s * 0.05); g.closePath(); g.fill();   // arched neck
    g.beginPath(); g.moveTo(x + s * 0.58, y - s * 0.64); g.lineTo(x + s * 0.8, y - s * 0.5); g.quadraticCurveTo(x + s * 0.84, y - s * 0.44, x + s * 0.78, y - s * 0.42); g.lineTo(x + s * 0.62, y - s * 0.44); g.closePath(); g.fill();   // head, muzzle
    g.beginPath(); g.moveTo(x + s * 0.6, y - s * 0.62); g.lineTo(x + s * 0.6, y - s * 0.74); g.lineTo(x + s * 0.65, y - s * 0.63); g.fill();   // ear
    for (let k = 0; k < 6; k++) V.incise(g, [[x + s * (0.33 + k * 0.045), y - s * (0.2 + k * 0.07)], [x + s * (0.3 + k * 0.045), y - s * (0.14 + k * 0.07)]], 1.1);   // mane
    g.fillStyle = col === WHITE ? CLAY : WHITE; g.beginPath(); g.arc(x + s * 0.67, y - s * 0.56, s * 0.018, 0, 7); g.fill(); g.fillStyle = col;
    g.lineWidth = s * 0.035; g.beginPath(); g.moveTo(x - s * 0.44, y - s * 0.06); g.quadraticCurveTo(x - s * 0.62, y + s * 0.02, x - s * 0.56, y + s * 0.3); g.stroke();   // tail
    for (const [lx, ph] of [[-0.3, 0], [-0.18, 1], [0.2, 0], [0.32, 1]]) { taper(g, [x + lx * s, y + s * 0.12], [x + lx * s + (ph ? 0.02 : 0) * s, y + s * 0.47], s * 0.065, s * 0.045); g.fillRect(x + lx * s - s * 0.035, y + s * 0.46, s * 0.06, s * 0.03); }   // legs, hooves
    for (let k = 0; k < 7; k++) V.incise(g, [[x - s * 0.36 + k * s * 0.11, y - s * 0.16], [x - s * 0.36 + k * s * 0.11, y + s * 0.16]], 1.1);   // planks
    g.fillStyle = CLAY; g.fillRect(x - s * 0.1, y - s * 0.09, s * 0.2, s * 0.1); g.fillStyle = col; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - s * 0.06 + k * s * 0.06, y - s * 0.035, s * 0.022, 0, 7); g.fill(); }   // hatch, heads
    g.fillRect(x - s * 0.5, y + s * 0.5, s * 1.0, s * 0.045);
    for (const wx of [-0.38, -0.12, 0.14, 0.38]) { g.beginPath(); g.arc(x + wx * s, y + s * 0.6, s * 0.065, 0, 7); g.fill(); g.fillStyle = CLAY; g.beginPath(); g.arc(x + wx * s, y + s * 0.6, s * 0.02, 0, 7); g.fill(); g.fillStyle = col; }
  }
  function horse(g, x, y, s, col) {
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.2, 0, 0, 7); g.fill();
    taper(g, [x + s * 0.35, y - s * 0.05], [x + s * 0.55, y - s * 0.45], s * 0.14, s * 0.1);
    g.beginPath(); g.ellipse(x + s * 0.65, y - s * 0.48, s * 0.14, s * 0.07, 0.4, 0, 7); g.fill();
    for (const lx of [-0.35, -0.2, 0.2, 0.35]) taper(g, [x + lx * s, y + s * 0.1], [x + lx * s, y + s * 0.5], s * 0.07, s * 0.05);
    g.fillRect(x - s * 0.55, y + s * 0.5, s * 1.1, s * 0.06);
    for (const wx of [-0.4, 0.4]) { g.beginPath(); g.arc(x + wx * s, y + s * 0.6, s * 0.07, 0, 7); g.fill(); }
  }
  // a Siren as painted on the Siren Painter's stamnos: a bird's body with long layered wings and a fanned tail, and a
  // woman's head with long hair (added white face), singing; perched on a rock
  function siren(g, x, y, s, f, t, o = {}) {
    const flap = (o.flap ?? 0.15) * Math.sin(t * 2.2 + x * 0.01);
    g.save(); g.translate(x, y); g.scale(f, 1);
    g.fillStyle = GLAZE;
    // tail feathers, fanned
    for (let k = 0; k < 5; k++) { const a = Math.PI + 0.15 + k * 0.12; g.beginPath(); g.moveTo(-s * 0.3, 0); g.lineTo(-s * 0.3 + Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55 * -0.5 + s * 0.08 * k); g.lineTo(-s * 0.3 + Math.cos(a + 0.08) * s * 0.5, Math.sin(a + 0.08) * s * 0.5 * -0.5 + s * 0.08 * k + s * 0.05); g.closePath(); g.fill(); }
    // body: a plump bird's breast and back
    g.beginPath(); g.moveTo(s * 0.28, -s * 0.22); g.bezierCurveTo(s * 0.35, s * 0.08, s * 0.15, s * 0.25, -s * 0.1, s * 0.2); g.bezierCurveTo(-s * 0.35, s * 0.16, -s * 0.42, -s * 0.02, -s * 0.3, -s * 0.08); g.bezierCurveTo(-s * 0.1, -s * 0.2, s * 0.1, -s * 0.3, s * 0.28, -s * 0.22); g.fill();
    // legs and talons gripping the rock
    g.strokeStyle = GLAZE; g.lineWidth = s * 0.03; for (const lx of [-0.02, 0.1]) { g.beginPath(); g.moveTo(lx * s, s * 0.18); g.lineTo(lx * s + s * 0.02, s * 0.36); g.stroke(); g.beginPath(); g.moveTo(lx * s - s * 0.05, s * 0.37); g.lineTo(lx * s + s * 0.1, s * 0.37); g.stroke(); }
    // the wing: raised behind, layered rows of feathers, incised
    g.save(); g.translate(-s * 0.02, -s * 0.12); g.rotate(-0.35 - flap);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-s * 0.15, -s * 0.35, -s * 0.5, -s * 0.5, -s * 0.72, -s * 0.42); g.lineTo(-s * 0.62, -s * 0.3); g.lineTo(-s * 0.7, -s * 0.24); g.lineTo(-s * 0.55, -s * 0.14); g.lineTo(-s * 0.6, -s * 0.07); g.bezierCurveTo(-s * 0.35, s * 0.02, -s * 0.12, s * 0.05, 0, 0); g.fill();
    V.incise(g, [[-s * 0.08, -s * 0.12], [-s * 0.3, -s * 0.28], [-s * 0.55, -s * 0.36]], 1.2); V.incise(g, [[-s * 0.1, -s * 0.03], [-s * 0.35, -s * 0.15], [-s * 0.58, -s * 0.2]], 1.2);
    for (let k = 0; k < 5; k++) V.incise(g, [[-s * (0.2 + k * 0.1), -s * (0.2 + k * 0.035)], [-s * (0.22 + k * 0.1), -s * (0.08 + k * 0.02)]], 1);
    g.restore();
    // breast feathers: scale pattern
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) { g.strokeStyle = CLAY; g.lineWidth = 1; g.beginPath(); g.arc(s * (0.05 + k * 0.08), s * (-0.08 + r * 0.08), s * 0.035, 0.2, Math.PI - 0.2); g.stroke(); }
    // the woman's head: added white face, dark hair falling behind, mouth open in song
    const hx = s * 0.32, hy = -s * 0.36, hr = s * 0.12;
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(hx - hr * 0.2, hy - hr); g.quadraticCurveTo(hx - hr * 1.8, hy - hr * 0.2, hx - hr * 1.3, hy + hr * 2.2); g.lineTo(hx - hr * 0.5, hy + hr * 1.2); g.closePath(); g.fill();
    g.fillStyle = WHITE; g.beginPath(); g.moveTo(hx - hr * 0.6, hy - hr * 0.7); g.quadraticCurveTo(hx + hr * 0.3, hy - hr * 1.2, hx + hr * 0.9, hy - hr * 0.2); g.lineTo(hx + hr * 1.15, hy + hr * 0.1); g.lineTo(hx + hr * 0.85, hy + hr * 0.3);
    g.lineTo(hx + hr * 0.95, hy + hr * 0.55); g.quadraticCurveTo(hx + hr * 0.4, hy + hr * 1.15, hx - hr * 0.4, hy + hr * 0.8); g.closePath(); g.fill();
    g.fillStyle = GLAZE; g.beginPath(); g.ellipse(hx + hr * 0.35, hy - hr * 0.1, hr * 0.14, hr * 0.07, 0, 0, 7); g.fill();
    const sing = 0.5 + 0.5 * Math.sin(t * 6 + x); g.beginPath(); g.ellipse(hx + hr * 0.8, hy + hr * 0.45, hr * 0.1, hr * (0.05 + 0.1 * sing), 0, 0, 7); g.fill();
    g.fillStyle = GLAZE; g.beginPath(); g.arc(hx - hr * 0.05, hy - hr * 0.5, hr * 0.85, Math.PI * 1.05, Math.PI * 1.95); g.fill();   // hair over the crown
    g.fillStyle = RED; g.fillRect(hx - hr * 0.7, hy - hr * 0.62, hr * 1.3, hr * 0.15);   // a red fillet
    g.restore();
  }
  function sceneHalls(g, x, t) {
    column(g, x - 1050, 110, GROUND); column(g, x + 1150, 110, GROUND);
    fire(g, x, GROUND, t, 1.1);
    const DA = { torso: -6, neck: -6, lArm: [125, 150], rArm: [-55, -80], lLeg: [42, 12], rLeg: [-32, -62] };
    const DB = { torso: 6, neck: 4, lArm: [-50, -75], rArm: [130, 155], lLeg: [-30, -60], rLeg: [40, 10] };
    for (let i = 0; i < 2; i++) {
      const bt = MV.rawBeatOf(t) + i, even = Math.floor(bt) % 2 === 0, ph = ease(clamp((bt - Math.floor(bt)) / 0.35));
      const pose = even ? lerpPose(DB, DA, ph) : lerpPose(DA, DB, ph), hop = Math.sin(clamp((bt - Math.floor(bt)) / 0.5) * Math.PI) * 26;
      V.person(g, x - 820 + i * 190, GROUND - hop, 290, pose, i ? -1 : 1, { noIdle: true });
    }
    bard(g, x - 380, 320, 1, t); nameLabelU(g, 21289, 425, 'DEMODOCUS', 0, 1, { t0: 64.6 });
    const acc = ease(clamp((t - 73.4) / 0.6)) * (1 - ease(clamp((t - 77.6) / 0.6)));
    const lP = lerpPose(POSES.sit, { torso: -6, neck: -4, lArm: [100, 95], rArm: [45, 100], lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 }, acc);
    V.person(g, x + 330, GROUND, 290, lP, 1, { beard: true }); V.person(g, x + 520, GROUND, 290, lP, 1, { woman: true });
    nameLabel(g, x + 330, GROUND - 205, 'ALCINOUS', 0, 1, { t0: 65.2, size: 20 }); nameLabel(g, x + 525, GROUND - 205, 'ARETE', 0, 1, { t0: 65.6, size: 20 });
    // Odysseus weeps at the bard's song (Odyssey 8): seated, bowed forward, his face buried in his hand, the purple
    // cloak drawn up over his head so no one sees; his shoulders heave gently
    // (the cloak is a hood over his head falling down his back, drawn behind him, so his bowed head, the hand over
    // his eyes and his heaving shoulders read clearly)
    const sob = 0.5 + 0.5 * Math.sin(t * 5.2), WX = x + 800, WP0 = { torso: 22 + sob * 4, neck: 30 + sob * 3, lArm: [20, 30], rArm: [60, 30], lLeg: [100, 8], rLeg: [94, 2], hipH: 0.24 };
    { const F0 = E.figure(WX, GROUND, 300, WP0, -1), face = [F0.headC[0] - 0.045 * 300, F0.headC[1] + 0.01 * 300];
      WP0.lArm = armIK(F0.shoulder, face, 0.17 * 300, 0.16 * 300, -1, WP0.torso, 1);
      WP0.rArm = armIK(F0.shoulder, [F0.hip[0] - 0.13 * 300, F0.hip[1] - 0.06 * 300], 0.17 * 300, 0.16 * 300, -1, WP0.torso, 1); }
    const WF = E.figure(WX, GROUND, 300, WP0, -1);
    { const hr = WF.headR, hc = WF.headC, sh = WF.shoulder, hp = WF.hip;
      g.fillStyle = RED; window.BODY.smoothPath(g, [[hc[0] - hr * 0.3, hc[1] - hr * 1.15], [hc[0] + hr * 1.0, hc[1] - hr * 1.0], [sh[0] + hr * 1.5, sh[1] + hr * 0.4], [hp[0] + hr * 1.5, hp[1] - hr * 0.2], [hp[0] + hr * 0.6, hp[1] + hr * 0.3], [sh[0] + hr * 0.2, sh[1]]]); g.fill();
      g.strokeStyle = GLAZE; g.lineWidth = Math.max(1.2, hr * 0.07); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(sh[0] + hr * (0.6 + k * 0.3), sh[1] + hr * 0.3); g.lineTo(hp[0] + hr * (0.8 + k * 0.25), hp[1] - hr * 0.1); g.stroke(); } }
    g.fillStyle = GLAZE; g.fillRect(WF.hip[0] - 30, GROUND - 0.24 * 300 * 1.0 + 6, 70, 12); g.fillRect(WF.hip[0] - 24, GROUND - 0.24 * 300 + 18, 9, 0.24 * 300 - 18); g.fillRect(WF.hip[0] + 26, GROUND - 0.24 * 300 + 18, 9, 0.24 * 300 - 18);   // his stool
    const O = V.person(g, WX, GROUND, 300, WP0, -1, { ody: true, beard: true, noIdle: true, noSeat: true }); nameLabelU(g, 22429, 414, 'ODYSSEUS', 0, 1, { t0: 68.4 });
    { const hr = O.headR, hc = O.headC;
      g.fillStyle = RED; g.beginPath(); g.ellipse(hc[0] + hr * 0.25, hc[1] - hr * 0.45, hr * 1.1, hr * 0.75, 0.2, Math.PI * 0.95, Math.PI * 2.1); g.fill();   // the hood over his crown
      // tears falling from under his hand, on the beat
      const hd = O.arms.l[2], tb = MV.beatOf(t), tp = tb - Math.floor(tb);
      g.fillStyle = WHITE; for (const off of [0, 0.5]) { const q = (tp + off) % 1; g.globalAlpha = 1 - q; g.beginPath(); g.ellipse(hd[0] - hr * 0.2 + off * hr * 0.3, hd[1] + hr * 0.5 + q * hr * 3, hr * 0.09, hr * 0.14, 0, 0, 7); g.fill(); } g.globalAlpha = 1; }
    // images rising in the smoke of the hearth as the bard sings: each is drawn whole on its own layer and the layer is
    // faded (so no overlapping parts show through), softened and wavering like smoke
    const smoke = (a, fn) => { if (a <= 0) return;
      const cv = g.canvas; if (!window.__SMK || window.__SMK.width !== cv.width || window.__SMK.height !== cv.height) { window.__SMK = document.createElement('canvas'); window.__SMK.width = cv.width; window.__SMK.height = cv.height; }
      const sk = window.__SMK, sg = sk.getContext('2d'); sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sk.width, sk.height); sg.setTransform(g.getTransform()); fn(sg);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a * 0.8; g.filter = 'blur(1.6px)';
      for (let y = 0; y < sk.height; y += 8) { const off = Math.sin(y * 0.02 + t * 2.4) * 5 * (1 - a * 0.5); g.drawImage(sk, 0, y, sk.width, 8, off, y, sk.width, 8); }
      g.restore(); };
    const rise = (t0) => (t - t0) * 12;
    smoke(ease(clamp((t - 64.3) / 1.5)) * (1 - ease(clamp((t - 68.6) / 0.6))), (sg) => woodenHorse(sg, x - 20, 300 - rise(64.3), 250, WHITE));
    // a hero in the smoke; "not all of it was me": as the song goes on he slowly becomes someone else and back, bar by bar
    const w = ease(clamp((t - 68.9) / 0.8)) * (1 - ease(clamp((t - 73.0) / 0.6)));
    const bb = MV.beatOf(t) / 4, other = t > 70.6 ? 0.5 - 0.5 * Math.cos((bb - Math.floor(bb)) * Math.PI * 2) : 0;
    const hero = (sg, female, al) => { if (al <= 0.01) return; sg.save(); sg.globalAlpha = al; sg.fillStyle = WHITE; const F = figure(x, 420 - rise(68.9) * 0.5, 230, 'walk', 1);
      window.BODY.drawFigure(sg, F, { body: WHITE, beard: !female, hair: female ? 'long' : 'short', slender: female }); sg.fillRect(x + 60, 180 - rise(68.9) * 0.5, 6, 220); sg.restore(); };
    smoke(w, (sg) => { hero(sg, false, 1 - other); hero(sg, true, other); });
    g.save(); g.globalAlpha = 0.33;
    V.ship(g, x + 1650, GROUND - 60, 190);
    for (let i = 0; i < 5; i++) { const rx = x + 1520 + i * 60, st = Math.sin(MV.beatOf(t) * Math.PI + i * 0.3); V.person(g, rx, GROUND - 70, 110, { torso: 20 + st * 15, neck: 0, lArm: [70 + st * 20, 90], rArm: [60 + st * 20, 80], lLeg: [100, 10], rLeg: [95, 5], hipH: 0.3 }, 1, {});
      g.strokeStyle = GLAZE; g.lineWidth = 4; g.beginPath(); g.moveTo(rx + 20, GROUND - 110); g.lineTo(rx - 40 + st * 30, GROUND - 20); g.stroke(); }
    g.restore();
  }
  function sceneKings(g, x, t) {
    column(g, x - 900, 110, GROUND); column(g, x + 900, 110, GROUND);
    g.fillStyle = GLAZE; g.fillRect(x - 380, GROUND - 150, 760, 16); g.fillRect(x - 350, GROUND - 150, 12, 150); g.fillRect(x + 338, GROUND - 150, 12, 150);
    for (let i = 0; i < 3; i++) {
      const kx = x - 300 + i * 300, f = i === 2 ? -1 : 1, arg = Math.max(0, Math.sin((beatOf(t) + i * 1.3) * Math.PI / 2));
      V.person(g, kx, GROUND, 300, { torso: -4, neck: 0, lArm: [60 + arg * 70, 90 + arg * 60], rArm: [20, 70], lLeg: [95, 5], rLeg: [90, 0], hipH: 0.28 }, f, { beard: true, variant: i });
      nameLabel(g, kx - f * 62, GROUND - 330, ['AGAMEMNON', 'MENELAUS', 'NESTOR'][i], 0, 1, { t0: 83.3 + i * 0.5, size: 19, v: true });   // (running down beside him, outside his spear)
      g.strokeStyle = GLAZE; g.lineWidth = 5; g.beginPath(); g.moveTo(kx - f * 40, GROUND); g.lineTo(kx - f * 30, GROUND - 330); g.stroke();
      g.fillStyle = GLAZE; g.beginPath(); g.moveTo(kx - f * 30, GROUND - 330); g.lineTo(kx - f * 38, GROUND - 300); g.lineTo(kx - f * 22, GROUND - 300); g.fill();
    }
    V.person(g, x + 640, GROUND, 330, { torso: 8, neck: 12, lArm: [20, 60], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, -1, { ody: true, beard: true, cloak: RED });
    nameLabel(g, x + 640, GROUND - 352, 'ODYSSEUS', 0, 1, { t0: 84.6 });
    g.fillStyle = GLAZE; g.beginPath(); g.arc(x - 640, GROUND - 90, 90, 0, 7); g.fill(); g.strokeStyle = WHITE; g.lineWidth = 3; g.beginPath(); g.arc(x - 640, GROUND - 90, 60, 0, 7); g.stroke();
  }
  function sceneSirens(g, x, t) {
    // after the Siren Painter: two Sirens singing from their rocks; the ship passes, Odysseus bound to the mast,
    // straining towards the song, while his crew row on with wax in their ears (one stroke per beat)
    wavesAt(g, x - 1100, x + 1100, t);
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 820, GROUND - 30); g.quadraticCurveTo(x - 760, GROUND - 230, x - 640, GROUND - 250); g.quadraticCurveTo(x - 520, GROUND - 220, x - 420, GROUND - 30); g.fill();
    g.beginPath(); g.moveTo(x - 460, GROUND - 30); g.quadraticCurveTo(x - 400, GROUND - 170, x - 330, GROUND - 180); g.quadraticCurveTo(x - 250, GROUND - 150, x - 200, GROUND - 30); g.fill();
    for (let k = 0; k < 6; k++) V.incise(g, [[x - 760 + k * 55, GROUND - 60], [x - 740 + k * 50, GROUND - 180 + (k % 2) * 30]], 1);
    siren(g, x - 640, GROUND - 285, 200, 1, t); siren(g, x - 330, GROUND - 215, 170, 1, t + 1.3); nameLabel(g, x - 700, GROUND - 400, 'SIRENS', 0, 1, { t0: 87.4 });
    // their song: a ribbon of letters drifting smoothly from their mouths towards the ship (no beat-jerk)
    const k0 = clamp((t - 87.2) / 0.8);
    g.save(); g.fillStyle = WHITE; g.font = 'italic 24px Georgia, serif';
    // (their song, Odyssey 12, after A. T. Murray's translation: three phrases in turn, each drifting towards the ship)
    // (the invitation; the flattery: they know his own story, as the song he's in does; and the claim to know it all: the
    // song that knows it all, which he can hear only because he's bound to the mast)
    const PH = ['COME HERE, ODYSSEUS, AND LISTEN', 'WE KNOW ALL YOU SUFFERED AT TROY', 'WE KNOW EVERYTHING THAT HAPPENS ON THE FRUITFUL EARTH'];
    const st = t - 87.2, PD = 1.45;
    for (let p = 0; p < PH.length; p++) {
      const u = (st - p * PD) / PD; if (u < -0.2 || (p < PH.length - 1 && u > 1.2)) continue;
      const al = k0 * clamp((u + 0.2) / 0.3) * (p < PH.length - 1 ? 1 - clamp((u - 0.9) / 0.3) : 1), drift = Math.max(-0.2, u) * 60;
      let cx0 = x - 500 + drift;
      for (const ch of PH[p]) { const q = clamp((cx0 - (x - 520)) / 1040), py = GROUND - 330 + Math.sin(q * Math.PI * 2 + 0.6) * 40 - Math.sin(q * Math.PI) * 60;
        g.globalAlpha = al * 0.95; g.fillText(ch, cx0, py); cx0 += g.measureText(ch).width + 1.5; }
    }
    g.restore();
    // the ship: long hull, a row of oarsmen rowing on the beat, the mast with Odysseus lashed to it
    const sx = x + 380 + (t - 87) * 22, sy = GROUND - 128, bt = MV.beatOf(t), row = Math.sin((bt - Math.floor(bt)) * Math.PI * 2);
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(sx - 330, sy - 40); g.quadraticCurveTo(sx - 300, sy + 20, sx - 220, sy + 20); g.lineTo(sx + 250, sy + 20); g.quadraticCurveTo(sx + 330, sy + 10, sx + 360, sy - 60);
    g.lineTo(sx + 330, sy - 20); g.lineTo(sx - 300, sy - 20); g.closePath(); g.fill();
    V.incise(g, [[sx - 290, sy - 8], [sx + 300, sy - 8]], 1.3); g.fillStyle = WHITE; g.beginPath(); g.arc(sx + 310, sy - 18, 6, 0, 7); g.fill();   // the painted eye at the prow
    // each rower pulls his oar: the oar pivots on the ship's side (the thole), his hands on the handle end
    for (let k = 0; k < 5; k++) { const rx = sx - 220 + k * 90, piv = [rx + 46, sy - 18];
      const RP = { torso: -10 + row * 18, neck: 0, lArm: [0, 0], rArm: [0, 0], lLeg: [100, 10], rLeg: [95, 5], hipH: 0.1 }, RS = E.figure(rx, sy - 22, 110, RP, 1).shoulder;
      const reach = 0.3 * 110, gdx = piv[0] - RS[0], gdy = piv[1] - RS[1], gl = Math.hypot(gdx, gdy), grip = [RS[0] + gdx / gl * reach, RS[1] + gdy / gl * reach];   // hands as far towards the thole as his arms go
      const dx = piv[0] - grip[0], dy = piv[1] - grip[1], L = Math.hypot(dx, dy) || 1, blade = [piv[0] + dx / L * 120, piv[1] + dy / L * 120];
      RP.lArm = armIK(RS, grip, 0.17 * 110, 0.16 * 110, 1, RP.torso, 1); RP.rArm = armIK(RS, [grip[0] - dx / L * 7, grip[1] - dy / L * 7], 0.17 * 110, 0.16 * 110, 1, RP.torso, 1);
      g.strokeStyle = GLAZE; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(grip[0] - dx / L * 10, grip[1] - dy / L * 10); g.lineTo(blade[0], blade[1]); g.stroke();
      { const hp = E.figure(rx, sy - 22, 110, RP, 1).hip; g.fillStyle = GLAZE; g.fillRect(hp[0] - 16, hp[1] + 4, 30, sy - 20 - hp[1] - 4); }   // his thwart
      V.person(g, rx, sy - 22, 110, RP, 1, { noIdle: true, noSeat: true, variant: k % 3 }); }
    g.fillStyle = GLAZE; g.fillRect(sx + 40, sy - 330, 8, 310);   // mast
    const strain = 0.5 + 0.5 * Math.sin(t * 1.7);
    // he stands with his back to the mast, hands bound behind it, straining towards the song
    const OX2 = sx + 20, OP = { torso: 3 + strain * 7, neck: 8 + strain * 12, lArm: [0, 0], rArm: [0, 0], lLeg: [4, 0], rLeg: [-4, -2] }, OS = E.figure(OX2, sy - 22, 200, OP, -1).shoulder;
    OP.lArm = armIK(OS, [sx + 46, sy - 112], 0.17 * 200, 0.16 * 200, -1, OP.torso, 1); OP.rArm = armIK(OS, [sx + 42, sy - 106], 0.17 * 200, 0.16 * 200, -1, OP.torso, 1);
    V.person(g, OX2, sy - 22, 200, OP, -1, { ody: true, beard: true, noIdle: true });
    nameLabel(g, sx + 58, sy - 150, 'ODYSSEUS', 1, 1, { t0: 88.2 });   // (painted on the ship, beside the mast: it sails with him)
    g.strokeStyle = WHITE; g.lineWidth = 2.5; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(sx + 2, sy - 180 + k * 34); g.lineTo(sx + 54, sy - 170 + k * 34); g.stroke(); }   // the ropes, round him and the mast
  }
  function sceneStories(g, x, t) {
    nameLabel(g, x - 100, GROUND - 290, 'ODYSSEUS', 0, 1, { t0: 92.6 });
    V.person(g, x - 100, GROUND, 320, { torso: -6, neck: 4, lArm: [70 + 45 * Math.abs(Math.sin(MV.beatOf(t) * Math.PI / 2)), 115 + 25 * Math.abs(Math.sin(MV.beatOf(t) * Math.PI / 2))], rArm: [40, 90], lLeg: [95, 5], rLeg: [90, 0], hipH: 0.28 }, 1, { ody: true, beard: true });
    g.fillStyle = GLAZE; g.fillRect(x - 160, GROUND - 90, 120, 12); g.fillRect(x - 150, GROUND - 90, 10, 90); g.fillRect(x - 60, GROUND - 90, 10, 90);
    for (let i = 0; i < 4; i++) V.person(g, x + 200 + i * 130, GROUND, 170 + (i % 2) * 20, 'sit', -1, i % 2 ? { woman: true } : {});
    // the tales he tells, in a painted panel above his listeners: a new tale on each downbeat, dissolving (92.3-96.6):
    // the Cyclops, the wooden horse, the bag of winds. Then "some were so like the truth" (96.6-101): the Cyclops and an
    // ordinary shepherd with his sheep slowly dissolve into each other, bar by bar: which one was it?
    const px = x + 350, py = 345, a = ease(clamp((t - 92.3) / 0.8)) * (1 - ease(clamp((t - 100.8) / 0.6)));   // (below the lyric rows)
    if (a > 0) {
      g.save(); g.globalAlpha = a; g.strokeStyle = GLAZE; g.lineWidth = 5; g.strokeRect(px - 260, py - 150, 520, 300);
      g.lineWidth = 2; g.strokeRect(px - 250, py - 140, 500, 280);
      g.beginPath(); g.rect(px - 248, py - 138, 496, 276); g.clip();
      const gy = py + 130, clipP = () => { g.beginPath(); g.rect(px - 248, py - 138, 496, 276); g.clip(); };
      const cyclops = (al) => { if (al <= 0) return; g.save(); g.globalAlpha *= al;
        g.fillStyle = GLAZE; g.beginPath(); g.moveTo(px - 250, gy); g.quadraticCurveTo(px - 240, py - 150, px - 60, py - 150); g.quadraticCurveTo(px + 120, py - 150, px + 250, py - 40); g.lineTo(px + 250, gy); g.closePath(); g.fill();   // cave
        g.fillStyle = CLAY; g.beginPath(); g.ellipse(px - 20, gy, 200, 190, 0, Math.PI, 0); g.fill();   // cave mouth
        g.fillStyle = GLAZE; g.beginPath(); g.ellipse(px - 90, gy - 20, 55, 38, 0, Math.PI, 0); g.fill();   // his rock
        const G = V.person(g, px - 70, gy, 250, { torso: 8, neck: 14, lArm: [70, 100], rArm: [20, 60], lLeg: [100, 10], rLeg: [92, 4], hipH: 0.2 }, 1, { beard: true, noIdle: true, noSeat: true });
        g.fillStyle = WHITE; g.beginPath(); g.arc(G.headC[0] + 4, G.headC[1] - 4, G.headR * 0.42, 0, 7); g.fill(); g.fillStyle = GLAZE; g.beginPath(); g.arc(G.headC[0] + 7, G.headC[1] - 4, G.headR * 0.18, 0, 7); g.fill();   // the one eye
        const c = G.arms.l[2]; g.strokeStyle = GLAZE; g.lineWidth = 10; g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(c[0] + 50, c[1] - 90); g.stroke();   // club
        nameLabel(g, px + 75, py + 2, 'POLYPHEMUS', 0, 1, { t0: 96.9, size: 17 });   // (inside the cave mouth)
        V.person(g, px + 140, gy, 110, { torso: -4, neck: -8, lArm: [110, 120], rArm: [-6, 10], lLeg: [8, 0], rLeg: [-8, -4] }, -1, { ody: true, beard: true, noIdle: true });   // little Odysseus offers the wine
        g.restore(); };
      const horse = (al) => { if (al <= 0) return; g.save(); g.globalAlpha *= al; woodenHorse(g, px - 20, gy - 126, 190); g.restore(); };
      const winds = (al) => { if (al <= 0) return; g.save(); g.globalAlpha *= al;
        V.ship(g, px, gy - 30, 170);
        const open = 0.5 + 0.5 * Math.sin(t * 3), BAGY = 74; g.fillStyle = RED; g.beginPath(); g.ellipse(px - 40, gy - BAGY, 34, 24, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(px - 52, gy - BAGY - 20); g.lineTo(px - 40, gy - BAGY - 34); g.lineTo(px - 28, gy - BAGY - 20); g.fill(); g.strokeStyle = GLAZE; g.lineWidth = 3; g.beginPath(); g.moveTo(px - 50, gy - BAGY - 22); g.lineTo(px - 30, gy - BAGY - 22); g.stroke();   // the ox-hide bag of winds, tied at the neck, on the deck
        g.strokeStyle = WHITE; g.lineWidth = 3; for (let k = 0; k < 4; k++) { g.beginPath(); for (let i = 0; i <= 30; i++) { const q = i / 30, r = 20 + q * 90, an = k * 1.6 + q * 6 + t * 2; const wx = px - 40 + Math.cos(an) * r, wy = gy - BAGY - 40 - q * 60 + Math.sin(an) * r * 0.4; i ? g.lineTo(wx, wy) : g.moveTo(wx, wy); } g.stroke(); }
        g.restore(); };
      const shepherd = (al) => { if (al <= 0) return; g.save(); g.globalAlpha *= al;
        const S = V.person(g, px - 70, gy, 230, { torso: 0, neck: 2, lArm: [30, 20], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, -2] }, 1, { beard: true, noIdle: true });
        g.strokeStyle = GLAZE; g.lineWidth = 6; g.beginPath(); g.moveTo(S.arms.l[2][0], S.arms.l[2][1] - 60); g.lineTo(S.arms.l[2][0] + 6, gy); g.stroke();   // crook
        for (let k = 0; k < 3; k++) { const sx2 = px + 30 + k * 70; g.fillStyle = WHITE; g.beginPath(); g.ellipse(sx2, gy - 28, 32, 20, 0, 0, 7); g.fill(); g.fillStyle = GLAZE; g.beginPath(); g.ellipse(sx2 + 30, gy - 36, 9, 7, 0, 0, 7); g.fill(); g.fillRect(sx2 - 16, gy - 12, 4, 12); g.fillRect(sx2 + 12, gy - 12, 4, 12); }
        g.restore(); };
      const bar = MV.bar(t), bt = MV.beatOf(t), inBar = (bt - Math.floor(bt / 4) * 4) / 4, dis = ease(clamp(inBar / 0.18));
      if (t < 96.6) {
        const tales = [cyclops, horse, winds], b0 = MV.bar(92.3), i = ((bar - b0) % 3 + 3) % 3, j = (i + 2) % 3;
        if (bar > b0) ghost(g, 1 - dis, gg => { const g0 = g; g = gg; g.save(); clipP(); tales[j](1); g.restore(); g = g0; }); ghost(g, bar > b0 ? dis : 1, gg => { const g0 = g; g = gg; g.save(); clipP(); tales[i](1); g.restore(); g = g0; });
      } else {
        // truth or tale: the Cyclops and the shepherd dissolve into each other, slowly, each bar
        const k = MV.bar(96.6), odd = (bar - k) % 2 === 1, w = 0.5 - 0.5 * Math.cos(inBar * Math.PI);
        const cyA = odd ? 1 - w : w; ghost(g, cyA, gg => { const g0 = g; g = gg; g.save(); clipP(); cyclops(1); g.restore(); g = g0; }); ghost(g, 1 - cyA, gg => { const g0 = g; g = gg; g.save(); clipP(); shepherd(1); g.restore(); g = g0; });
      }
      g.restore();
    }
  }
  function sceneChorus2(g, x, t) {
    const askers = [{ woman: true }, { beard: true }, {}, { woman: true }, { beard: true }];
    askers.forEach((o, i) => {
      const cue = 101.2 + i * 0.8, up = ease(clamp((t - cue) / 0.5)) * (1 - ease(clamp((t - 106.0) / 0.8)));
      const nod = t > 106.6 && t < 110 ? Math.max(0, Math.sin((t - 106.6 + i * 0.15) * Math.PI * 1.72)) : 0;
      const P = lerpPose(POSES.stand, { torso: 4, neck: 4, lArm: [100, 125], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, up);
      P.neck = (P.neck || 0) + nod * 22;
      V.person(g, x - 1000 + i * 160, GROUND, 300 + (i % 2) * 18, P, 1, o);
    });
    // the craftsman (101-113.3): kneeling at his oar, laid across two blocks, shaping its blade with an adze, one
    // stroke per beat, shavings flying; the adze always lands on the oar. Then (113.3-114.6) he takes hold of it,
    // lifts it and shoulders it, and walks off with it (the same oar, all through the song).
    const OX = x + 150 + Math.max(0, Math.min(t, 119.6) - 114.6) * 110;
    const bt = MV.beatOf(t), ph = bt - Math.floor(bt), lastB = Math.floor(MV.beatOf(113.3)), up = ph < 0.12 || Math.floor(bt) >= lastB ? 0 : ease(clamp((ph - 0.12) / 0.55)), strike = ph < 0.12 ? 1 - ph / 0.12 : 0;   // (after the last stroke his hand stays down)
    const KNEEL = { torso: 30, neck: 18, lArm: [60, 40], rArm: [40, 20], lLeg: [82, 2], rLeg: [-8, -94], hipH: 0.28 };
    const oarY = GROUND - 40, oA0 = [x + 190, oarY + 6], oB0 = [x + 590, oarY - 4];   // lying across two blocks, blade to the right
    g.fillStyle = GLAZE; g.fillRect(x + 250, oarY + 4, 30, GROUND - oarY - 4); g.fillRect(x + 470, oarY + 2, 30, GROUND - oarY - 2);
    const grab = ease(clamp((t - 113.3) / 0.35)), lift = ease(clamp((t - 113.65) / 0.4)), shoulder = ease(clamp((t - 114.05) / 0.55));
    const F0 = E.figure(OX, GROUND, 330, KNEEL, 1), S = F0.shoulder, IK = (P0, tgt, bend) => armIK(E.figure(OX, GROUND, 330, P0, 1).shoulder, tgt, 0.17 * 330, 0.16 * 330, 1, P0.torso, bend);
    let P, A, B;
    if (t < 113.3) {
      const spot = [x + 262 + 6 * Math.sin(bt * 0.7), oarY - 6];   // where the adze bites: always on the oar, in reach
      const top = [S[0] + 70, S[1] - 55], hand = [lerp(spot[0] - 20, top[0], up), lerp(spot[1] - 40, top[1], up)];
      P = Object.assign({}, KNEEL, { lArm: IK(KNEEL, hand, 1), rArm: IK(KNEEL, [x + 215, oarY - 2], 1) });   // other hand steadies the oar
      A = oA0; B = oB0;
    } else {
      // rise from kneeling while lifting it, then shoulder it
      const STAND8 = Object.assign({}, POSES.stand, { torso: 8 });
      const walkP = t > 114.6 && t < 119.6 ? strideWalk(t, 110, 330, { torso: 8 }) : STAND8;
      const stoop = 30 * grab * (1 - lift);   // he bends down to it (kneeling upright, his hands can't reach the shaft)
      const bodyP = Object.assign({}, lerpPose(KNEEL, walkP, lift)); bodyP.torso += stoop; bodyP.neck = (bodyP.neck || 0) + stoop * 0.3;
      const C = shoulderCarry(bodyP, OX, 330, 1);
      const held = [[OX - 20, GROUND - 150], [OX + 380, GROUND - 160]];   // at hip height, both hands on it
      const ga = [lerp(oA0[0], held[0][0], lift), lerp(oA0[1], held[0][1], lift)], gb = [lerp(oB0[0], held[1][0], lift), lerp(oB0[1], held[1][1], lift)];
      A = [lerp(ga[0], C.A[0], shoulder), lerp(ga[1], C.A[1], shoulder) - Math.sin(shoulder * Math.PI) * 40]; B = [lerp(gb[0], C.B[0], shoulder), lerp(gb[1], C.B[1], shoulder) - Math.sin(shoulder * Math.PI) * 40];
      P = C.P;
      if (shoulder < 1) {   // the front hand slides along the shaft to the carrying grip; the back hand lets go as it settles
        const onAt = fr => [lerp(A[0], B[0], fr), lerp(A[1], B[1], fr)], fl = lerp(0.22, 0.6, shoulder), fr = lerp(0.1, 0.45, shoulder), let_ = ease(clamp((shoulder - 0.55) / 0.45));
        const lT = onAt(fl); lT[1] += 8 * shoulder; const rOn = IK(bodyP, onAt(fr), 1), rRest = bodyP.rArm;
        P = Object.assign({}, bodyP, { lArm: IK(bodyP, lT, 1), rArm: [lerp(rOn[0], rRest[0], let_), lerp(rOn[1], rRest[1], let_)] });
        if (grab < 1 && lift <= 0) P = lerpPose(Object.assign({}, KNEEL, { torso: KNEEL.torso + stoop, lArm: IK(KNEEL, [lerp(oA0[0], oB0[0], 0.22), lerp(oA0[1], oB0[1], 0.22) - 4], 1), rArm: IK(KNEEL, [lerp(oA0[0], oB0[0], 0.1), lerp(oA0[1], oB0[1], 0.1) - 4], 1) }), P, grab); }   // (hands on the shaft before it moves)
    }
    // (he fades out as the story goes down among the dead: 120.2-120.7)
    ghost(g, 1 - ease(clamp((t - 120.2) / 0.5)), gg => { const g0 = g; g = gg;
    const drawIt = () => V.oar(g, A, B);
    if (shoulder < 0.5) drawIt();
    const O = V.person(g, OX, GROUND, 330, P, 1, { ody: true, beard: true, noIdle: true });
    if (t < 113.3) {   // the adze: a short handle with a blade set crosswise, striking down on the beat
      const hd = O.arms.l[2], el = O.arms.l[1], dx = hd[0] - el[0], dy = hd[1] - el[1], L = Math.hypot(dx, dy) || 1, tip = [hd[0] + dx / L * 40, hd[1] + dy / L * 40];
      g.strokeStyle = GLAZE; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(hd[0], hd[1]); g.lineTo(tip[0], tip[1]); g.stroke();
      g.save(); g.translate(tip[0], tip[1]); g.rotate(Math.atan2(dy, dx) + Math.PI / 2); g.fillStyle = GLAZE; g.fillRect(-4, -4, 26, 9); g.restore();
      if (strike > 0.4) { g.fillStyle = CLAY; for (let k = 0; k < 5; k++) { const a2 = -Math.PI * (0.2 + k * 0.15); g.beginPath(); g.ellipse(x + 262 + Math.cos(a2) * (18 + (1 - strike) * 40), oarY - 12 + Math.sin(a2) * (14 + (1 - strike) * 40), 5, 2, a2, 0, 7); g.fill(); } } }   // shavings
    if (t >= 113.3) { g.save(); g.translate(x + 300, GROUND - 5); g.fillStyle = GLAZE; g.strokeStyle = GLAZE; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-20, 0); g.lineTo(20, 0); g.stroke(); g.fillRect(20, -12, 8, 16); g.restore(); }   // the adze, put down
    if (shoulder >= 0.5) drawIt();
    g = g0; });
  }


  // ======== Verse 4 + bridge: white-ground (funeral vase) section ========
  const UNDER = CH2 + 2600, ELP = UNDER + 2300, MOUND = ELP + 1900;
  const WG = (t) => ease(clamp((t - 119.0) / 3.2)) * (1 - ease(clamp((t - 172.0) / 3.0)));   // how "white-ground" the vase is
  function sceneUnder(g, x, t) {
    // the trench where the shades come to drink, and Odysseus beside it
    g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x - 350, GROUND - 4, 160, 18, 0, 0, 7); g.fill();
    const reach = ease(clamp((t - 132.0) / 0.8)) * (1 - ease(clamp((t - 136.2) / 0.8)));
    // (he appears once the walker from the chorus has gone: 120.8-121.4)
    let sc = [0, 0];
    ghost(g, ease(clamp((t - 120.8) / 0.6)), gg => { const g0 = g; g = gg;
    const O = V.person(g, x - 620, GROUND, 330, lerpPose({ torso: 6, neck: 6, lArm: [40, 70], rArm: [-6, 10], lLeg: [8, 0], rLeg: [-6, -4] }, POSES.reach, reach * 0.6), 1, { ody: true, beard: true });
    // a scroll in his hand gathers the words
    sc = O.arms.r[2]; g.save(); g.translate(sc[0], sc[1]); g.rotate(-0.9);
    g.fillStyle = GLAZE; g.beginPath(); g.roundRect(-40, -10, 80, 20, 10); g.fill();
    g.strokeStyle = CLAY; g.lineWidth = 1.5; g.beginPath(); g.ellipse(34, 0, 4, 8, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(-30, -4); g.lineTo(28, -4); g.stroke(); g.restore();
    g = g0; });
    nameLabel(g, x - 620, GROUND - 360, 'ODYSSEUS', 0, ease(clamp((t - 120.8) / 0.6)), { t0: 122.3 });
    // the shades, made of handwriting, drifting in
    const shades = [[x - 60, 'stand', { hair: 'bun', dress: true }, 330], [x + 170, { torso: 8, neck: 26, lArm: [14, 30], rArm: [-4, 10], lLeg: [4, 0], rLeg: [-4, -2] }, { beard: true }, 350], [x + 420, 'walk', {}, 320], [x + 650, 'stand', {}, 300]];
    shades.forEach(([sx, pose, o, h], i) => {
      const inT = beatStep(t, 122.6 + i * 1.2, 3), px = sx + (1 - inT) * 300;
      if (inT <= 0) return;
      const scatter = i === 0 ? ease(clamp((t - 133.2) / 2.5)) : 0;          // "the words and not the dead": the nearest one comes apart as he reaches
      g.save(); g.globalAlpha = inT * (1 - scatter * 0.85);
      window.SPECIAL.writtenFigure(g, figure(px, GROUND, h, pose, -1), Object.assign({ ink: GLAZE, seed: 10 + i, offset: Math.floor(t * 8) + i * 90, drift: 0.6 + scatter * 3, size: 12, wash: 0.1 }, o));
      g.restore();
      // his mother, Ajax (still angry, turned away), Achilles, Agamemnon (Odyssey 11)
      nameLabel(g, sx, GROUND - h - 34, ['ANTICLEIA', 'AJAX', 'ACHILLES', 'AGAMEMNON'][i], 0, 0.85 * (1 - scatter), { t0: 123.4 + i * 1.2, size: 20 });
    });
    // words flowing from the shades into his scroll ("ask me what they told me")
    const flow = clamp((t - 127.4) / 0.6) * (1 - clamp((t - 132) / 0.6));
    if (flow > 0) { g.save(); g.fillStyle = GLAZE; g.font = '18px "Segoe Script", cursive'; const TX = 'tell me of the far country and the long way home';
      for (let i = 0; i < 26; i++) { const k = ((t * 0.6 + i / 26) % 1), px = lerp(x - 80, sc[0] + 6, k), py = lerp(GROUND - 250, sc[1] - 10, k) - Math.sin(k * Math.PI) * 90; g.globalAlpha = flow * Math.sin(k * Math.PI); g.fillText(TX[(25 - i) % TX.length], px, py); } g.restore(); }   // reversed index so it reads left to right
    // "the first of them was one of mine": a small shade steps forward
    const e = ease(clamp((t - 137.0) / 1.5));
    if (e > 0) { g.save(); g.globalAlpha = e; window.SPECIAL.writtenFigure(g, figure(x - 170 + (1 - e) * 120, GROUND, 230, 'stand', -1), { ink: GLAZE, seed: 21, offset: Math.floor(t * 8), drift: 0.5, size: 10, wash: 0.14 }); g.restore(); }
  }
  function sceneElpenor(g, x, t) {
    const ROOFX0 = x - 640, ROOFX1 = x - 480;
    // Circe's house: a low roof; the youth asleep on it, then falling before dawn (142.1-146)
    // (a flat roof, so he lies on it against the open sky and can be seen)
    g.fillStyle = GLAZE; g.fillRect(x - 900, GROUND - 262, 420, 16); g.fillRect(x - 880, GROUND - 248, 394, 248);   // the house front
    g.fillStyle = CLAY; g.fillRect(x - 720, GROUND - 170, 80, 170); g.fillRect(x - 820, GROUND - 190, 50, 40); g.fillRect(x - 590, GROUND - 190, 50, 40);   // doorway, windows
    g.fillStyle = GLAZE;
    for (let k = 0; k < 9; k++) V.incise(g, [[x - 890 + k * 50, GROUND - 258], [x - 890 + k * 50, GROUND - 250]], 1);   // beam ends
    // as in the Odyssey: asleep on the roof, he wakes in a hurry (143.1-143.7), forgets the ladder, walks to the edge
    // (143.7-144.45) and steps off; he drops straight down (144.45-144.9, on "fell") and crumples at the foot of the wall
    const LIE = { torso: 0, neck: 4, lArm: [8, 14], rArm: [-6, 6], lLeg: [3, 0], rLeg: [-3, 0], rot: -86, noGround: true }, UP = { torso: 2, neck: 6, lArm: [10, 16], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, -2] };
    // (after the Highwayman helper's sailor: a beat of warning, then a real tumble, limbs flailing out of step, thrown
    // a little clear; he lands on "fell" and lies still, flung out at the foot of the wall)
    const rise = ease(clamp((t - 143.1) / 0.6)), walk = clamp((t - 143.7) / 0.5), teeter = clamp((t - 144.2) / 0.3), fall = clamp((t - 144.5) / 0.41), land = ease(clamp((t - 144.91) / 0.3));
    const EX0 = x - 720, EDGE = x - 462, LIP = x - 486;   // (LIP: his last step on the roof)
    let fx = EX0, fy = GROUND - 262, EP;
    const SITUP = { torso: 14, neck: 12, lArm: [30, 40], rArm: [20, 30], lLeg: [88, 88], rLeg: [86, 86], hipH: 0.04, noGround: true };   // (legs stay flat on the roof as he sits up: a hinge at the hips)
    const FLUNG = Object.assign({}, LIE, { rot: -88, lArm: [168, 172], rArm: [150, 158], noGround: true });   // on his back, head to the wall   // on his back, arms flung over his head
    if (t < 143.7) EP = rise < 0.5 ? lerpPose(LIE, SITUP, ease(rise * 2)) : lerpPose(SITUP, UP, ease(rise * 2 - 1));   // sits up, then stands
    else if (t < 144.2) { fx = lerp(EX0, LIP, ease(walk)); EP = lerpPose(strideWalk(t, 300, 180, {}), UP, Math.max(0, walk - 0.8) / 0.2); }
    else if (t < 144.5) { fx = LIP; const w = Math.sin(teeter * Math.PI * 3);   // his foot finds nothing: he teeters, arms wheeling
      EP = Object.assign({}, UP, { torso: 6 + teeter * 14 + w * 6, neck: -4, lArm: [40 + teeter * 90 + w * 30, 60 + teeter * 70], rArm: [20 + teeter * 70 - w * 30, 40 + teeter * 50], lLeg: [4, 0], rLeg: [-4 - teeter * 20, -2 - teeter * 30] }); }
    else if (t < 144.91) { const fe = fall * fall, fl = t * 15;   // the tumble: pitching forward head first, out from the wall
      fx = lerp(LIP, EDGE + 66, ease(clamp(fall * 1.3))); fy = lerp(GROUND - 262, GROUND, fe);
      EP = { torso: 10, neck: -10, lArm: [130 + Math.sin(fl) * 35, 150 + Math.sin(fl - 0.6) * 30], rArm: [60 - Math.sin(fl * 0.9) * 35, 70 + Math.sin(fl * 0.9 - 0.6) * 30], lLeg: [22 + fall * 14, 30], rLeg: [-18, -4 + fall * 14], rot: -lerp(18, 92, ease(fall)), noGround: true }; }
    else { fx = EDGE + 66; fy = GROUND - Math.sin(clamp((t - 144.91) / 0.22) * Math.PI) * 12;   // lands with a small bounce
      EP = lerpPose({ torso: 10, neck: -10, lArm: [140, 160], rArm: [60, 80], lLeg: [36, 30], rLeg: [-18, 10], rot: -92, noGround: true }, FLUNG, land); EP.noGround = true; }
    if (t >= 144.5) { const F0 = E.figure(fx, fy, 180, EP, 1), pts = [F0.hip, F0.shoulder, ...F0.legs.l, ...F0.legs.r, ...F0.arms.l, ...F0.arms.r, [F0.headC[0], F0.headC[1] + F0.headR]], low = Math.max(...pts.map(q => q[1])) - GROUND; if (low > 0) fy -= low; }   // (never through the ground)
    if (t < 143.7) fy += 11 * (1 - rise);   // (lying: down onto the roof, not hovering over it)
    if (t >= 144.91) { const F0 = E.figure(fx, fy, 180, EP, 1), spine = Math.max(F0.hip[1], F0.shoulder[1]); fy += lerp(0, GROUND - 0.06 * 180 - spine, ease(clamp((t - 145.0) / 0.25))); }   // (settles flat on the ground: back on the ground line)
    if (t < 144.5) { const F0 = E.figure(fx, fy, 180, EP, 1), low = Math.max(...[F0.legs.l, F0.legs.r].flatMap(L => [L[1][1], L[2][1]]), F0.hip[1]) - fy; if (low > 0) fy -= low; }   // stays on the roof at every angle
    { const EF = V.person(g, fx, fy, 180, EP, 1, { noIdle: true, noSeat: true }); nameLabel(g, x - 822, GROUND - 262 - 40, 'ELPENOR', 0, 1 - ease(clamp((t - 144.6) / 0.8)), { t0: 142.3, size: 21 }); }   // (painted on the roof beside where he sleeps)
    // his soul: a small winged image of him (an eidolon, as vase painters drew the dead) rises from the body (146.4-)
    // and flies to Odysseus, hovering at his ear, its words drifting to him (147.2-151.4)
    const up = ease(clamp((t - 146.4) / 1.4)), gone = ease(clamp((t - 156.5) / 2));
    if (up > 0 && gone < 1) {
      const ex = lerp(x - 420, x - 90, up), ey = lerp(GROUND - 20, GROUND - 300, up) + Math.sin(t * 3) * 10;
      g.save(); g.globalAlpha = up * (1 - gone) * 0.9;
      { const fl = Math.sin(t * 9) * 0.4;  V.person(g, ex, ey + 45, 90, { torso: 6, neck: 0, lArm: [60, 80], rArm: [40, 70], lLeg: [10, 20], rLeg: [-8, 10] }, -1, { noIdle: true });   // his soul: a small winged image of him
        g.fillStyle = WHITE; for (const sd of [0, 1]) { g.save(); g.translate(ex + 8, ey - 18); g.rotate(-0.6 - fl - sd * 0.4); g.beginPath(); g.ellipse(22, 0, 26, 7, 0, 0, 7); g.fill(); g.restore(); } }
      const talk = clamp((t - 147.4) / 0.5) * (1 - clamp((t - 151.4) / 0.6));
      if (talk > 0) { g.fillStyle = GLAZE; g.font = 'italic 18px Georgia, serif'; const W2 = 'bury me with my oar · ';
        for (let i = 0; i < 16; i++) { const k = ((t * 0.5 + i / 16) % 1); g.globalAlpha = talk * Math.sin(k * Math.PI) * 0.9; g.fillText(W2[i % W2.length], lerp(ex - 20, x - 170, k), lerp(ey - 10, GROUND - 285, k) - Math.sin(k * Math.PI) * 30); } }
      g.restore();
    }
    nameLabelU(g, 35100, 270, 'ELPENOR', 1, ease(clamp((t - 146.9) / 0.4)) * (1 - ease(clamp((t - 156.5) / 2))), { t0: 147.0, size: 19 });   // (his shade)
    nameLabel(g, x - 230, GROUND - 362, 'ODYSSEUS', 0, 1, { t0: 147.3 });
    // Odysseus listens, leaning in, a hand raised to his ear
    const lean = ease(clamp((t - 147.0) / 0.8));
    V.person(g, x - 230, GROUND, 330, lerpPose({ torso: 10, neck: 14, lArm: [30, 60], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, { torso: -4, neck: -12, lArm: [60, 150], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, lean), 1, { ody: true, beard: true });
    // the oar standing in the sand, against the sky (151.6-); ships passing (156-161)
    const oa = ease(clamp((t - 151.4) / 1.0));
    if (oa > 0) { g.save(); g.globalAlpha = oa; V.oar(g, [x + 250, GROUND + 5], [x + 250, GROUND - 420]); g.restore(); }
    wavesAt(g, x + 520, x + 1300, t);
    const shipX = x + 1250 - Math.max(0, t - 154.5) * 70;
    g.save(); g.translate(shipX, 0); g.scale(-1, 1); g.translate(-shipX, 0); V.ship(g, shipX, GROUND - 90, 180); g.restore();   // (mirrored: it sails prow-first, leftwards)
    const wave = ease(clamp((t - 157.5) / 0.8));   // a sailor lifts a hand towards the oar
    V.person(g, shipX + 120, GROUND - 104, 112, lerpPose({ torso: 0, neck: 0, lArm: [10, 5], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, 0] }, { torso: -6, neck: -6, lArm: [140, 170], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, 0] }, wave), -1, { beard: true });
  }
  function sceneMound(g, x, t) {
    // "So I went back, and found him, and I raised him up a mound, and I stood his oar above him"
    const grow = beatStep(t, 162.4, 3.2), plant = ease(clamp((t - 166.65) / 1.55));
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 260 * grow - 20, GROUND); g.quadraticCurveTo(x, GROUND - 230 * grow, x + 260 * grow + 20, GROUND); g.closePath(); g.fill();
    const topY = GROUND - 115 * grow;
    // the oar stands in the sand at the foot of the grave while he digs; he walks over (165.5-166.5), takes hold of it
    // as he reaches it, carries it upright up the mound, and sets it in the top (166.5-168.1), hands on it throughout
    const wkM = ease(clamp((t - 165.9) / 0.75)), OXm = lerp(x - 520, x - 75, wkM), OSAND = x - 300;
    // he walks up the mound's slope (its surface, where his feet are)
    const surfY = X => { const u = (X - (x - 260 * grow - 20)) / (2 * (260 * grow + 20)); return u > 0 && u < 1 ? GROUND - 2 * u * (1 - u) * 230 * grow : GROUND; }, fyM = surfY(OXm);
    const held = OXm + 45 >= OSAND, plantM = ease(clamp((t - 166.65) / 1.55));
    let ox = held ? OXm + 45 : OSAND, ob = GROUND + 5;
    if (held) { const tg = clamp((OXm + 45 - OSAND) / 60); ob = lerp(GROUND + 5, fyM - 50, ease(tg)); }   // lifted out of the sand as he takes it, carried at his height
    // planting, in beats: holds it upright (166.65); lifts it high, leaning back (to tUp); drives it down into the mound
    // on the beat (tUp-tHit); a second push; then stands it, straightens and lets go. His feet stay put.
    const tHit = MV.timeOfBeat(Math.round(MV.beatOf(167.35))), tUp = tHit - 0.45, PSPOT = x - 30, groundP = surfY(PSPOT);
    const lift = ease(clamp((t - 166.7) / (tUp - 166.7))), drive = clamp((t - tUp) / (tHit - tUp)), drive2 = drive * drive * drive;
    const push2 = Math.sin(clamp((t - tHit - 0.25) / 0.4) * Math.PI) * 10;
    const PL = { lean: 0 };
    if (t > 166.65) { ox = lerp(OXm + 45, PSPOT, ease(clamp((t - 166.65) / 0.3)));
      const carried = fyM - 50, raised = carried - 45, sunk = groundP + 26;
      ob = t < tUp ? lerp(carried, raised, lift) : t < tHit ? lerp(raised, sunk - 8, drive2) : sunk - 8 + clamp((t - tHit) / 0.25) * 4 + push2 * 0.4 + clamp((t - tHit - 0.65) / 0.3) * 4;
      PL.lean = t < tUp ? -8 * lift : t < tHit ? lerp(-8, 22, drive2) : lerp(22, 0, ease(clamp((t - tHit - 0.5) / 0.6))) + push2 * 0.5; }
    g.save(); if (t > 166.65 && ob > surfY(ox) - 2) { g.beginPath(); g.rect(ox - 60, 0, 120, surfY(ox) + 1); g.rect(0, 0, ox - 60, BH); g.rect(ox + 60, 0, 5000, BH); g.clip(); }   // (the part in the earth is hidden)
    V.oar(g, [ox, ob], [ox, ob - 390]); g.restore();
    // three men raise the mound with spades, on alternate beats: the blade bites into the ground on the beat, they
    // heave and swing, the earth flies onto the heap, and they come back for more
    const digger = (dx, f, h, t0, o, stop = 0) => {   // stop (0-1): he lays the spade down (to 0.5) and straightens up
      const bt = MV.beatOf(t) + t0, ph = bt - Math.floor(bt), K = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
      const spot = [dx + f * 150, GROUND - 3], tossB = [dx + f * 190, GROUND - 230], tossH = [dx + f * 55, GROUND - 175], restB = [dx + f * 150, GROUND - 40], restH = [dx + f * 40, GROUND - 190];
      let B, H, bend;
      if (ph < 0.3) { const u = ease(ph / 0.3); B = K(spot, restB, u * 0.3); H = K([dx + f * 60, GROUND - 150], restH, u * 0.3); bend = 42; }   // blade in the ground
      else if (ph < 0.6) { const u = ease((ph - 0.3) / 0.3); B = K(spot, tossB, u); H = K([dx + f * 60, GROUND - 150], tossH, u); bend = lerp(42, 12, u); }   // heave and swing
      else { const u = ease((ph - 0.6) / 0.4); B = K(tossB, spot, u); H = K(tossH, [dx + f * 60, GROUND - 150], u); bend = lerp(12, 42, u); }   // back down
      const s1 = ease(clamp(stop * 2)), s2 = ease(clamp(stop * 2 - 1));
      if (stop > 0) { B = K(B, [x - 368, GROUND - 8], s1); H = K(H, [x - 470, GROUND - 4], s1); bend = lerp(lerp(bend, 50, s1), 4, s2); }
      const P0 = { torso: bend, neck: lerp(10, 2, s2), lArm: [0, 0], rArm: [0, 0], lLeg: [lerp(26, 4, s2), lerp(6, 0, s2)], rLeg: [lerp(-22, -4, s2), lerp(-12, -2, s2)] }, F0 = E.figure(dx, GROUND, h, P0, f), S = F0.shoulder;
      const dxs = B[0] - H[0], dys = B[1] - H[1];
      P0.rArm = armIK(S, H, 0.17 * h, 0.16 * h, f, P0.torso, 1); P0.lArm = armIK(S, [H[0] + dxs * 0.45, H[1] + dys * 0.45], 0.17 * h, 0.16 * h, f, P0.torso, 1);
      if (s2 > 0) { P0.rArm = [lerp(P0.rArm[0], -6, s2), lerp(P0.rArm[1], 10, s2)]; P0.lArm = [lerp(P0.lArm[0], 10, s2), lerp(P0.lArm[1], 8, s2)]; }   // lets go of it
      V.person(g, dx, GROUND, h, P0, f, Object.assign({ noIdle: true }, o));
      g.strokeStyle = GLAZE; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(H[0] - dxs * 0.1, H[1] - dys * 0.1); g.lineTo(B[0], B[1]); g.stroke();   // shaft
      const an = Math.atan2(dys, dxs); g.save(); g.translate(B[0], B[1]); g.rotate(an); g.fillStyle = GLAZE; g.beginPath(); g.moveTo(-6, -15); g.lineTo(26, -11); g.quadraticCurveTo(36, 0, 26, 11); g.lineTo(-6, 15); g.fill(); g.restore();   // blade
      if (stop <= 0 && ph > 0.25 && ph < 0.55) { g.fillStyle = GLAZE; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(B[0] + Math.cos(an) * 20 + (k - 1.5) * 7, B[1] + Math.sin(an) * 20 - 8, 6, 0, 7); g.fill(); } }   // earth on the blade
      if (stop <= 0 && ph >= 0.55 && ph < 0.9) { const q = (ph - 0.55) / 0.35; g.fillStyle = GLAZE; for (let k = 0; k < 9; k++) { const sp = 1 + q * 1.5, px = lerp(tossB[0], x + f * -40, q) + Math.sin(k * 2.3) * 12 * sp, py = lerp(tossB[1], topY - 10, q) - Math.sin(q * Math.PI) * 60 + Math.cos(k * 1.7) * 9 * sp; g.beginPath(); g.arc(px, py, 4 + (k % 3), 0, 7); g.fill(); }   /* a clump of earth, spreading as it flies */ }   // flying earth
    };
    // Odysseus digs, then (165.5-166.5) puts down his spade and walks up to the mound, and stands the oar on it
    if (t < 165.9) digger(x - 520, 1, 330, 0, { ody: true, beard: true }, clamp((t - 165.5) / 0.4));
    else {
      g.strokeStyle = GLAZE; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 470, GROUND - 4); g.lineTo(x - 380, GROUND - 8); g.stroke(); g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x - 368, GROUND - 8, 18, 9, 0, 0, 7); g.fill();   // his spade, put down
      const STANCE = { torso: 0, neck: 0, lArm: [10, 5], rArm: [-6, 10], lLeg: [10, 0], rLeg: [-8, -4] };
      const P = t < 166.65 ? lerpPose(lerpPose(POSES.stand, strideWalk(t, 400, 330, {}), clamp((t - 165.9) / 0.2)), STANCE, clamp((t - 166.5) / 0.15))
        : Object.assign({}, STANCE, { torso: PL.lean, neck: PL.lean * 0.4 - 4 });
      // hands on the shaft while he holds it; he lets go once it stands (168.1-168.5)
      const grip = held && t < 168.9 ? (t > 168.4 ? 1 - ease((t - 168.4) / 0.5) : 1) : 0;
      if (grip > 0) { const S = E.figure(OXm, fyM, 330, P, 1).shoulder, hi = armIK(S, [ox, ob - 215], 0.17 * 330, 0.16 * 330, 1, P.torso || 0, 1), lo = armIK(S, [ox, ob - 150], 0.17 * 330, 0.16 * 330, 1, P.torso || 0, 1);
        P.lArm = [lerp(P.lArm[0], hi[0], grip), lerp(P.lArm[1], hi[1], grip)]; P.rArm = [lerp(P.rArm[0], lo[0], grip), lerp(P.rArm[1], lo[1], grip)]; }
      V.person(g, OXm, fyM, 330, P, 1, { ody: true, beard: true, noIdle: t < 168.9 }); }
    digger(x + 470, -1, 310, 0.5, { variant: 1 }); digger(x + 800, -1, 300, 0.25, { variant: 2 });
  }


  // ======== Instrumental break, verse 5, chorus 3 (black-figure again) ========
  const BRK = MOUND + 2600, GODS = BRK + 4 * 700 + 1600, ISLE = GODS + 2200, CH3 = ISLE + 2300;
  // break: four voyage vignettes, stepping every two bars
  function vignetteStorm(g, x, t) {
    wavesAt(g, x - 348, x + 346, t, { scale: 1.6, cutL: true, cutR: true, base: GROUND + Math.sin(MV.beatOf(t) * Math.PI) * 8 });   // a big heaving storm sea
    g.save(); g.translate(x + 40, GROUND - 150 + Math.sin(MV.beatOf(t) * Math.PI / 2) * 18); g.rotate(Math.sin(MV.beatOf(t) * Math.PI / 4) * 0.28);
    g.fillStyle = GLAZE; g.fillRect(-90, 0, 180, 14); g.fillRect(-3, -150, 6, 150); V.person(g, -30, 0, 120, 'kneel', 1, { ody: true, beard: true }); g.restore();
    const flash = (MV.hit('drums', t, 0.05) > 0.62 && Math.floor(MV.beatOf(t)) % 2 === 0) ? 1 : 0;   // lightning in added white
    if (flash) { g.strokeStyle = WHITE; g.lineWidth = 7; g.beginPath(); g.moveTo(x - 200, 90); g.lineTo(x - 150, 180); g.lineTo(x - 190, 190); g.lineTo(x - 120, 320); g.stroke(); }
  }
  function vignetteWhirl(g, x, t) {
    g.strokeStyle = GLAZE; g.lineWidth = 9;
    for (let k = 0; k < 5; k++) { g.beginPath(); for (let a = 0; a < 12; a += 0.1) { const r = (18 + a * 18 + k * 6) * (1 + 0.08 * MV.pulse(t, 5)), aa = a + MV.beatOf(t) * 1.2 + k; g.lineTo(x + Math.cos(aa) * r, GROUND - 170 + Math.sin(aa) * r * 0.35); } g.stroke(); }
    nameLabel(g, x, GROUND - 330, 'CHARYBDIS', 0, 1, { t0: barStart(MV.bar(171.3 + MV.BEAT * 2) + 2) + 0.5 });
  }
  // Scylla as South Italian vase painters drew her: a woman to the waist, with the foreparts of dogs springing from her
  // waist and a coiling sea-serpent's tail; the dogs lunge at the passing ship on the guitar hits
  function vignetteScylla(g, x, t) {
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 330, GROUND); g.quadraticCurveTo(x - 300, GROUND - 200, x - 200, GROUND - 230); g.quadraticCurveTo(x - 110, GROUND - 200, x - 60, GROUND); g.fill();   // her rock
    const sx = x - 150, sy = GROUND - 150;
    // the serpent tail: coils down into the water
    g.strokeStyle = GLAZE; g.lineCap = 'round';
    // (outlined in clay where the coils lie over the dark rock, so her serpent body reads)
    const SP0 = { torso: 6 + Math.sin(t * 2) * 4, neck: 6, lArm: [0, 0], rArm: [0, 0], lLeg: [4, 0], rLeg: [-4, 0] }, HP = E.figure(sx, sy + 15, 210, SP0, 1).hip;   // (the coil starts at her waist)
    // one serpent body, tapering smoothly from her waist (as wide as her hips) to the tip of the tail, outlined in clay;
    // scale marks run across it, following its curve
    const bz = (P0, P1, P2, P3, u) => { const v = 1 - u; return [v*v*v*P0[0] + 3*v*v*u*P1[0] + 3*v*u*u*P2[0] + u*u*u*P3[0], v*v*v*P0[1] + 3*v*v*u*P1[1] + 3*v*u*u*P2[1] + u*u*u*P3[1]]; };
    const TP = [];
    for (let i = 0; i <= 30; i++) TP.push(bz(HP, [HP[0] + 60, HP[1] + 90], [sx - 90, sy + 90], [sx - 60, sy + 140], i / 30));
    for (let i = 1; i <= 20; i++) TP.push(bz([sx - 60, sy + 140], [sx - 30, sy + 170], [sx + 60, sy + 160], [sx + 70, sy + 130], i / 20));
    const TW = i => lerp(46, 8, Math.pow(i / (TP.length - 1), 0.8));
    const tail = (col, extra) => { g.fillStyle = col; for (let i = 0; i < TP.length - 1; i++) taper(g, TP[i], TP[i + 1], TW(i) + extra, TW(i + 1) + extra); };
    tail(CLAY, 6); tail(GLAZE, 0);
    for (let i = 4; i < TP.length - 6; i += 3) { const p0 = TP[i], p1 = TP[i + 1], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, w = TW(i) * 0.36;
      V.incise(g, [[p0[0] + nx * w, p0[1] + ny * w], [p0[0] + dx / L * 5, p0[1] + dy / L * 5], [p0[0] - nx * w, p0[1] - ny * w]], 1.2); }   // scale marks, as chevrons across the body
    // her upper body (a woman, hair flying, arms raised)
    const SP_ = { torso: 6 + Math.sin(t * 2) * 4, neck: 6, lArm: [88 + MV.gtr(t, 0.2) * 12, 96 + MV.gtr(t, 0.2) * 10], rArm: [-50, -80], lLeg: [4, 0], rLeg: [-4, 0] }, SF = E.figure(sx, sy + 15, 210, SP_, 1);
    g.save(); g.beginPath(); g.rect(sx - 300, 0, 600, SF.hip[1] + 6); g.clip(); V.person(g, sx, sy + 15, 210, SP_, 1, { woman: true, noIdle: true }); g.restore();   // a woman only to the waist
    nameLabelU(g, 40825, 283, 'SCYLLA', 0, 1, { t0: barStart(MV.bar(171.3 + MV.BEAT * 2) + 4) + 0.5 });
    // six long necks spring from her waist, each ending in a snapping dog's head; they reach and snap at the passing
    // ship on the guitar hits (the old animation, now attached to her)
    const root = [SF.hip[0] + 14, SF.hip[1] - 4];
    for (let k = 0; k < 6; k++) {
      const a = -0.95 + k * 0.3 + Math.sin(t * 2 + k) * 0.07, len = 170 + (k % 2) * 45 + MV.gtr(t - (k % 3) * 0.1) * 55;
      const ex = root[0] + Math.cos(a) * len + 60, ey = root[1] + Math.sin(a) * len * 0.65, cx1 = root[0] + 40, cy1 = root[1] - 50 + k * 8;
      g.strokeStyle = GLAZE; g.lineCap = 'round'; g.lineWidth = 13 - k * 0.6; g.beginPath(); g.moveTo(root[0], root[1] + (k - 2.5) * 5); g.quadraticCurveTo(cx1, cy1, ex, ey); g.stroke();
      const ang = Math.atan2(ey - cy1, ex - cx1), snap = MV.gtr(t - (k % 3) * 0.1, 0.1);
      g.save(); g.translate(ex, ey); g.rotate(ang); g.fillStyle = GLAZE;
      g.beginPath(); g.ellipse(4, 0, 17, 12, 0, 0, 7); g.fill();   // skull
      g.beginPath(); g.moveTo(10, -9); g.lineTo(40, -6 - snap * 7); g.lineTo(40, -1); g.lineTo(14, 0); g.fill();   // upper jaw
      g.beginPath(); g.moveTo(10, 3); g.lineTo(36, 4 + snap * 9); g.lineTo(34, 9 + snap * 9); g.lineTo(10, 9); g.fill();   // lower jaw
      g.beginPath(); g.moveTo(-4, -9); g.lineTo(-1, -24); g.lineTo(8, -10); g.fill();   // ear
      g.fillStyle = WHITE; g.beginPath(); g.arc(10, -4, 2.6, 0, 7); g.fill(); g.fillRect(24, -2 - snap * 3, 12, 2); g.restore();   // eye and teeth
    }
    wavesAt(g, x - 40, x + 346, t, { scale: 0.7, cutR: true }); V.ship(g, x + 170, GROUND - 90, 140);
  }
  function vignetteDawn(g, x, t) {
    g.fillStyle = WHITE; g.beginPath(); g.arc(x + 200, GROUND - 12, 110, Math.PI, 0); g.fill();   // the sun rising in added white
    for (let k = 0; k < 9; k++) { const a = Math.PI + (k + 0.5) * Math.PI / 9; g.strokeStyle = WHITE; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 200 + Math.cos(a) * 130, GROUND - 12 + Math.sin(a) * 130); g.lineTo(x + 200 + Math.cos(a) * 180, GROUND - 12 + Math.sin(a) * 180); g.stroke(); }
    wavesAt(g, x - 348, x + 346, t, { scale: 0.6, cutL: true, cutR: true });   // (right up to the divider columns)
    const db = Math.sin(MV.beatOf(t) * Math.PI / 2) * 6; g.fillStyle = GLAZE; g.fillRect(x - 170, GROUND - 90 + db, 160, 12); V.person(g, x - 110, GROUND - 90 + db, 120, 'sit', 1, { ody: true, beard: true });
  }
  const VIG = [vignetteStorm, vignetteWhirl, vignetteScylla, vignetteDawn];
  function sceneBreak(g, x, t, k) {
    VIG[k](g, x, t);
    g.fillStyle = GLAZE; g.fillRect(x + 345, GROUND - 330, 8, 330);
    for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43; g.beginPath(); g.ellipse(x + 349 + Math.sin(a) * 34, GROUND - 350 - Math.cos(a) * 34, 7, 28, a, 0, 7); g.fill(); }
  }
  function sceneGods(g, x, t) {
    // cloud-palace: a row of stylised clouds in added white; two gods enthroned, arguing on alternate beats
    { // a bank of cloud: one continuous scalloped band, bumps of varied size, each with an incised inner curl; it drifts slowly
      const rc = mulberry32(61), x0 = x - 1080, x1 = x + 1080, top = GROUND - 44, dr = (t * 6) % 90; const bumps = [];
      for (let bx = x0 - 90 + dr; bx < x1 + 90; ) { const r = 34 + rc() * 26; bumps.push([bx + r, r]); bx += r * 1.55; }
      g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, BH); g.clip();
      g.fillStyle = WHITE; g.beginPath(); g.rect(x0, top, x1 - x0, GROUND - top + 2); for (const [bx, r] of bumps) { g.moveTo(bx + r, top); g.arc(bx, top, r, 0, Math.PI, true); } g.fill();
      g.strokeStyle = GLAZE; g.lineWidth = 2.2; g.globalAlpha = 0.55;
      for (const [bx, r] of bumps) { g.beginPath(); for (let k = 0; k <= 22; k++) { const a = Math.PI + k * 0.12, rr = r * 0.62 * (1 - k / 34); k ? g.lineTo(bx + Math.cos(a) * rr, top - 2 + Math.sin(a) * rr) : g.moveTo(bx + Math.cos(a) * rr, top - 2 + Math.sin(a) * rr); } g.stroke(); }
      g.globalAlpha = 1; g.restore(); }
    const bt = beatOf(t), a1 = Math.max(0, Math.sin(bt * Math.PI / 2)), a2 = Math.max(0, -Math.sin(bt * Math.PI / 2));
    // Athena: helmet crest, spear, pointing (toward home, on "fought to bring me home")
    const home = ease(clamp((t - 197.8) / 0.6)) * (1 - ease(clamp((t - 202) / 0.6)));
    const AP = { torso: -4, neck: 0, lArm: [60 + a1 * 60 + home * 30, 90 + a1 * 40], rArm: [20, 70], lLeg: [95, 5], rLeg: [90, 0], hipH: 0.28 };
    const A = V.person(g, x - 380, GROUND - 50, 380, AP, 1, { woman: true }); nameLabelU(g, 43512, 318, 'ATHENA', -1, 1, { t0: 193.6 });
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(A.headC[0] - 30, A.headC[1] - 20); g.quadraticCurveTo(A.headC[0] - 10, A.headC[1] - 90, A.headC[0] + 40, A.headC[1] - 40); g.lineTo(A.headC[0] + 10, A.headC[1] - 10); g.fill();   // helmet crest
    g.strokeStyle = GLAZE; g.lineWidth = 6; g.beginPath(); g.moveTo(x - 470, GROUND); g.lineTo(x - 450, GROUND - 480); g.stroke();
    // Poseidon: trident, raised in anger (on "cursed me bitterly")
    const curse = ease(clamp((t - 199.9) / 0.5)) * (1 - ease(clamp((t - 202.4) / 0.6)));
    const PP = { torso: -4, neck: 0, lArm: [60 + a2 * 60 + curse * 70, 90 + a2 * 40 + curse * 60], rArm: [20, 70], lLeg: [95, 5], rLeg: [90, 0], hipH: 0.28 };
    const P = V.person(g, x + 380, GROUND - 50, 390, PP, -1, { beard: true }); nameLabelU(g, 44415, 311, 'POSEIDON', 1, 1, { t0: 194.2 });
    // the trident as one joined shape (round joins, no seams): the shaft, a curved crossbar and three pointed tines
    { const wr = P.arms.l[2], el = P.arms.l[1], dl = Math.hypot(wr[0] - el[0], wr[1] - el[1]) || 1, hnd = [wr[0] + (wr[0] - el[0]) / dl * 0.04 * 390, wr[1] + (wr[1] - el[1]) / dl * 0.04 * 390], tx = hnd[0], ty = hnd[1] - 112;   // (in his fist) g.strokeStyle = GLAZE; g.fillStyle = GLAZE; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(tx, hnd[1] + 130); g.lineTo(tx, ty - 46);
      g.moveTo(tx - 26, ty - 40); g.quadraticCurveTo(tx - 26, ty, tx, ty); g.quadraticCurveTo(tx + 26, ty, tx + 26, ty - 40); g.stroke();
      for (const dx of [-26, 0, 26]) { g.beginPath(); g.moveTo(tx + dx - 7, ty - (dx ? 38 : 44)); g.lineTo(tx + dx, ty - (dx ? 58 : 66)); g.lineTo(tx + dx + 7, ty - (dx ? 38 : 44)); g.closePath(); g.fill(); } }   // barbed points
    // thrones
    g.fillStyle = GLAZE; for (const tx of [x - 330, x + 330]) { g.fillRect(tx - 70, GROUND - 160, 140, 14); g.fillRect(tx - 70, GROUND - 146, 12, 110); g.fillRect(tx + 58, GROUND - 146, 12, 110); }
  }
  function sceneIsle(g, x, t) {
    // Calypso's island: lush, lovely, and sealed by a ring of calm water (added white)
    wavesAt(g, x - 1250, x - 460, t, { scale: 0.7 }); wavesAt(g, x + 460, x + 1350, t, { scale: 0.7 });
    // the calm sea that seals her island: a ring of small added-white wavelets (a vase border, not a dashed line)
    g.fillStyle = WHITE; for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2 + t * 0.15, ex = x + Math.cos(a) * 500, ey = GROUND - 10 + Math.sin(a) * 60;
      g.globalAlpha = Math.sin(a) > -0.2 ? 0.95 : 0.55; g.beginPath(); g.arc(ex, ey, 7, Math.PI, 0); g.fill(); } g.globalAlpha = 1;
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 480, GROUND); g.quadraticCurveTo(x, GROUND - 120, x + 480, GROUND); g.fill();
    const rnd = mulberry32(51); V.olive(g, x - 250, GROUND - 60, 330, rnd); V.olive(g, x + 340, GROUND - 50, 280, mulberry32(52));
    const release = ease(clamp((t - 209.5) / 2.0));
    g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x - 72, GROUND - 66, 46, 26, 0, Math.PI, 0); g.fill();   // a rock to sit on
    V.person(g, x - 60, GROUND - 60, 300, { torso: 10, neck: 20, lArm: [30, 70], rArm: [20, 60], lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 }, 1, { ody: true, beard: true });   // gazing out to sea
    const CY = V.person(g, x - 230, GROUND - 60, 320, lerpPose(POSES.sit, { torso: -4, neck: 0, lArm: [90, 110], rArm: [45, 100], lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 }, release), 1, { woman: true }); nameLabelU(g, 45880, 405, 'CALYPSO', -1, 1, { t0: 202.8 }); nameLabel(g, x - 12, GROUND - 262, 'ODYSSEUS', 1, 1, { t0: 203.4 });   // Calypso, letting go
    // Hermes descending from above, winged hat and sandals, carrying the word (207.4-)
    const hd = ease(clamp((t - 207.3) / 1.8));
    if (hd > 0) {
      // he flies in from above and hovers before Calypso in the running-in-the-air pose of Archaic vases, holding out his
      // herald's staff: broad-brimmed winged hat, winged sandals
      const bob = Math.sin(t * 3.2) * 8, hx = lerp(x + 520, x + 70, hd), hy = lerp(-160, GROUND - 252, hd) + bob * hd;
      const H = V.person(g, hx, hy, 230, { torso: -12, neck: -4, lArm: [96, 104], rArm: [-50, -20], lLeg: [72, 4], rLeg: [-36, -110] }, -1, { beard: false, noIdle: true, noSeat: true, variant: 0 });
      const hc = H.headC, hr = H.headR; nameLabelU(g, 46330, 180, 'HERMES', 1, 1, { t0: 208.9 });
      g.fillStyle = GLAZE; g.beginPath(); g.ellipse(hc[0], hc[1] - hr * 0.55, hr * 1.6, hr * 0.32, 0.05, 0, 7); g.fill();   // petasos: the brim
      g.beginPath(); g.ellipse(hc[0], hc[1] - hr * 0.75, hr * 0.85, hr * 0.6, 0, Math.PI, 0); g.fill();   // and crown
      const wing = (wx, wy, sc) => { g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 14 * sc, wy - 26 * sc, wx + 38 * sc, wy - 30 * sc); g.quadraticCurveTo(wx + 26 * sc, wy - 14 * sc, wx + 30 * sc, wy - 6 * sc); g.quadraticCurveTo(wx + 16 * sc, wy - 6 * sc, wx, wy); g.fill();
        for (let k = 0; k < 3; k++) V.incise(g, [[wx + (8 + k * 8) * sc, wy - (4 + k * 5) * sc], [wx + (16 + k * 8) * sc, wy - (14 + k * 5) * sc]], 1); };
      const flap = 1 + 0.15 * Math.sin(t * 14);
      wing(hc[0] + hr * 0.4, hc[1] - hr * 0.9, 0.9 * flap); wing(H.legs.l[2][0], H.legs.l[2][1] - 4, 0.7 * flap); wing(H.legs.r[2][0], H.legs.r[2][1] - 4, 0.7 * flap);
      // the kerykeion: a staff with two snakes twined up it, their heads facing at the top
      const cd = H.arms.l[2], top = [cd[0] - 6, cd[1] - 100]; g.strokeStyle = GLAZE; g.lineWidth = 4.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cd[0] + 4, cd[1] + 60); g.lineTo(top[0], top[1] + 6); g.stroke();
      g.lineWidth = 3; for (const sd of [-1, 1]) { g.beginPath(); for (let i = 0; i <= 20; i++) { const q = i / 20, yy = lerp(cd[1] - 20, top[1] - 6, q), xx = lerp(cd[0] - 2, top[0], q) + sd * Math.sin(q * Math.PI * 2) * 11 + (q > 0.8 ? sd * (q - 0.8) * 60 : 0); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
        g.fillStyle = GLAZE; g.beginPath(); g.ellipse(top[0] + sd * 13, top[1] - 8, 5, 3.5, -sd * 0.5, 0, 7); g.fill(); }
      const gl = clamp((t - 208.6) / 0.25) * (1 - clamp((t - 209.4) / 0.6)); if (gl > 0) spark(g, top[0], top[1] - 14, 13 * gl, gl * 0.9);   // the word he carries, glinting
    }
  }
  function sceneChorus3(g, x, t) {
    // many ways, all leading home: dotted paths across the sea converge on one island with a house
    const ix = x + 750;
    for (let k = 0; k < 7; k++) {
      // (they set out on "many ways" and all arrive home on "home")
      const sy = 140 + k * 60, draw = beatStep(t, 222.55 + k * 0.14, 2.4 - k * 0.14); if (draw <= 0) continue;
      g.fillStyle = GLAZE;   // each way home is a row of painted dots, as vase painters mark a path
      for (let s = 0; s <= 40 * draw; s++) { const p = s / 40, px = lerp(x - 900, ix - 60, p), py = lerp(sy, GROUND - 120, p * p) + Math.sin(p * 9 + k) * 20 * (1 - p); g.beginPath(); g.arc(px, py, 4.2, 0, 7); g.fill(); }
    }
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(ix - 250, GROUND); g.quadraticCurveTo(ix, GROUND - 170, ix + 250, GROUND); g.fill();
    g.fillRect(ix - 50, GROUND - 150, 100, 70); g.beginPath(); g.moveTo(ix - 70, GROUND - 150); g.lineTo(ix, GROUND - 200); g.lineTo(ix + 70, GROUND - 150); g.fill();
    g.fillStyle = WHITE; g.fillRect(ix - 12, GROUND - 125, 24, 30);   // a lit window
    // the askers again, nodding on "plenty who agree"
    const askers = [{ woman: true }, { beard: true }, {}, { woman: true }, { beard: true }, { child: true }, { child: true, woman: true }];   // more of them now, children too
    askers.forEach((o, i) => {
      const up = ease(clamp((t - 212.2 - i * 0.5) / 0.5)) * (1 - ease(clamp((t - 217.0) / 0.8)));
      const nod = t > 217.3 && t < 221 ? Math.max(0, Math.sin((t - 217.3 + i * 0.15) * Math.PI * 1.72)) : 0;
      const P = lerpPose(POSES.stand, { torso: 4, neck: 4, lArm: [100, 125], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, up); P.neck = (P.neck || 0) + nod * 22;
      V.person(g, x - 900 + i * 120, GROUND, o.child ? 170 : 290, P, 1, o);
    });
    // now it is plainly an oar on his shoulder
    const wx3 = x - 420 + Math.max(0, t - 212.2) * 70, C3 = shoulderCarry(strideWalk(t, 70, 330, { torso: 8 }), wx3, 330, 1);
    V.person(g, wx3, GROUND, 330, C3.P, 1, { ody: true, beard: true, noIdle: true });   // (no idle sway: the hand stays pinned to the oar)
    g.fillStyle = GLAZE; g.strokeStyle = GLAZE; V.oar(g, C3.A, C3.B);
  }


  // ======== Verse 6, chorus 4 (red-figure: night, homecoming) ========
  const DOOR = CH3 + 2500, TEST = DOOR + 1500, ROOTS = TEST + 1900, CH4 = ROOTS + 2100;
  // ======== Verse 7, final chorus, outro (black-figure: daylight, the harvest) ========
  const INLAND = CH4 + C + 2400, FARM = INLAND + 2400, TREE = FARM + 150, SHORE = TREE + 2300;   // the tree grows where he planted the oar (FARM + 150)
  function lamp(g, x, y, a = 1, dir = 1) {
    const gr = g.createRadialGradient(x, y, 0, x, y, 170 + 25 * MV.pulse(curT, 4)); gr.addColorStop(0, `rgba(255,236,190,${0.55 * a * (0.85 + 0.3 * MV.pulse(curT, 4))})`); gr.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 170, 0, 7); g.fill();
    // a Greek clay oil lamp: round body, a long nozzle with the flame at its tip, a ring handle at the back (dir -1: the
    // nozzle points left)
    g.save(); if (dir < 0) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
    g.fillStyle = GLAZE; g.beginPath(); g.ellipse(x - 8, y + 10, 22, 11, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x + 6, y + 4); g.lineTo(x + 30, y + 6); g.quadraticCurveTo(x + 36, y + 10, x + 30, y + 14); g.lineTo(x + 6, y + 17); g.fill();
    g.strokeStyle = GLAZE; g.lineWidth = 4; g.beginPath(); g.arc(x - 32, y + 8, 7, 0.5, 5.8); g.stroke();
    g.fillStyle = CLAY; g.beginPath(); g.ellipse(x - 8, y + 7, 7, 3, 0, 0, 7); g.fill();   // the filling hole
    const fl = 1 + 0.15 * Math.sin(curT * 11); g.fillStyle = '#fff3cf'; g.beginPath(); g.moveTo(x + 27, y + 6); g.quadraticCurveTo(x + 22, y - 10 * fl, x + 31, y - 20 * fl); g.quadraticCurveTo(x + 38, y - 8 * fl, x + 33, y + 6); g.fill();
    g.restore();
  }
  function bed(g, x, y, s, alpha = 1) {
    g.save(); g.globalAlpha *= alpha; g.fillStyle = GLAZE;
    g.fillRect(x - s * 0.9, y - s * 0.35, s * 1.8, s * 0.08); g.fillRect(x - s * 0.9, y - s * 0.35, s * 0.07, s * 0.35); g.fillRect(x + s * 0.83, y - s * 0.35, s * 0.07, s * 0.35);
    g.fillRect(x - s * 0.95, y - s * 0.55, s * 0.18, s * 0.2);  // headrest
    g.restore();
  }
  // Odysseus's bedchamber (Odyssey 23): he built the room around a living olive, cut the trunk off above the ground,
  // trimmed it into a bedpost and built the bed onto it, inlaid with gold, silver and ivory, strung with red ox-hide.
  // x = trunk position, gy = floor, s = scale (~300). o.cut 0..1 = her lie (trunk sawn through, bed dragged away);
  // o.canopy draws the living crown bursting out through the roof; o.roofY returns where the trunk leaves the roof.
  function ghost(g, alpha, fn) {
    if (alpha >= 0.999) { fn(g); return; } if (alpha <= 0.001) return;
    const cv = g.canvas; if (!window.__GH || window.__GH.width !== cv.width || window.__GH.height !== cv.height) { window.__GH = document.createElement('canvas'); window.__GH.width = cv.width; window.__GH.height = cv.height; }
    const lg = window.__GH.getContext('2d'); lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, cv.width, cv.height); lg.setTransform(g.getTransform());
    lg.fillStyle = g.fillStyle; lg.strokeStyle = g.strokeStyle; fn(lg);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= alpha; g.drawImage(window.__GH, 0, 0); g.restore();
  }
  function chamber(g, x, gy, s, t, o = {}) {
    const cut = o.cut || 0, rnd = mulberry32(88);
    const roofY = gy - 1.2 * s, wl = x - 0.6 * s, wr = x + 2.3 * s;
    // walls of dressed stone, courses incised; the room is open at the front so we see in
    g.fillStyle = GLAZE;
    for (const [wx, ww] of [[wl - 0.16 * s, 0.16 * s], [wr, 0.16 * s]]) {
      g.fillRect(wx, roofY, ww, gy - roofY);
      for (let k = 1; k < 9; k++) { const yy = roofY + k * (gy - roofY) / 9; V.incise(g, [[wx, yy], [wx + ww, yy]], 1.1); const off = (k % 2) * ww / 2; V.incise(g, [[wx + off + ww / 4, yy], [wx + off + ww / 4, yy + (gy - roofY) / 9]], 1); }
    }
    // roof beam and rafter ends; a gap where the trunk goes up through it
    g.fillRect(wl - 0.25 * s, roofY - 0.08 * s, x - 0.14 * s - (wl - 0.25 * s), 0.1 * s);
    g.fillRect(x + 0.14 * s, roofY - 0.08 * s, wr + 0.41 * s - (x + 0.14 * s), 0.1 * s);
    for (let rx = wl - 0.2 * s; rx < wr + 0.4 * s; rx += 0.16 * s) if (Math.abs(rx - x) > 0.18 * s) { g.beginPath(); g.arc(rx, roofY - 0.03 * s, 0.025 * s, 0, 7); g.fillStyle = CLAY; g.fill(); g.fillStyle = GLAZE; }
    // the trunk: wide and gnarled, rooted in the floor, running up through the roof
    const cutY = gy - 0.62 * s, sway = cut * 0.06 * s;
    const trunkPts = [[x, gy + 6], [x - 0.04 * s, gy - 0.35 * s], [x + 0.03 * s, gy - 0.75 * s], [x - 0.02 * s, roofY], [x + 0.03 * s, roofY - 0.3 * s]];
    const widths = [0.2, 0.15, 0.13, 0.12, 0.1];
    g.save(); g.beginPath(); g.rect(x - s, 0, 2 * s, gy + 1); g.clip();   // the trunk goes into the floor, not through the border
    const seg = (gg, upper) => { for (let k = 0; k < trunkPts.length - 1; k++) { const a = trunkPts[k], b = trunkPts[k + 1]; if ((a[1] < cutY) !== upper) continue;
        gg.fillStyle = GLAZE; taper(gg, [a[0] + (upper ? sway : 0), a[1]], [b[0] + (upper ? sway : 0), b[1]], widths[k] * s * 1.3, widths[k + 1] * s * 1.3); } };
    seg(g, false); if (!o.canopy) ghost(g, 1 - 0.75 * cut, gg => seg(gg, true));   // (with a canopy, the upper trunk fades together with the crown)
    g.restore();
    g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 0.34 * s, gy + 1); g.quadraticCurveTo(x - 0.14 * s, gy - 0.04 * s, x - 0.12 * s, gy - 0.2 * s); g.lineTo(x + 0.12 * s, gy - 0.2 * s); g.quadraticCurveTo(x + 0.15 * s, gy - 0.04 * s, x + 0.36 * s, gy + 1); g.fill();   // root flare
    for (let k = 0; k < 7; k++) { const yy = gy - k * 0.2 * s - 0.1 * s, xx = x + (k % 2 ? 0.03 : -0.04) * s; V.incise(g, [[xx - 0.03 * s, yy], [xx, yy - 0.12 * s], [xx + 0.02 * s, yy - 0.2 * s]], 1.2); }
    V.incise(g, [[x - 0.09 * s, gy - 0.05 * s], [x - 0.18 * s, gy + 2]], 1.4); V.incise(g, [[x + 0.09 * s, gy - 0.05 * s], [x + 0.2 * s, gy + 2]], 1.4);   // roots gripping the floor
    if (cut > 0) { g.strokeStyle = WHITE; g.lineWidth = 3; g.setLineDash([9, 7]); g.beginPath(); g.moveTo(x - 0.16 * s, cutY + 0.03 * s); g.lineTo(x + 0.16 * s, cutY - 0.03 * s); g.stroke(); g.setLineDash([]); }
    // the living crown above the roof
    if (o.canopy) {
      const top = [x + 0.03 * s, roofY - 0.3 * s], crown = (px, py, ang, len, d) => {
        const e = [px + Math.sin(ang) * len, py - Math.cos(ang) * len]; taper(g, [px, py], e, (0.03 + d * 0.012) * s, (0.02 + d * 0.01) * s);
        if (d > 0) { crown(e[0], e[1], ang - 0.5 - rnd() * 0.2, len * 0.72, d - 1); crown(e[0], e[1], ang + 0.45 + rnd() * 0.2, len * 0.72, d - 1); }
        else for (let k = 0; k < 7; k++) { const la = rnd() * 6.3, lx = e[0] + Math.cos(la) * 0.08 * s, ly = e[1] + Math.sin(la) * 0.05 * s;
          g.save(); g.translate(lx, ly); g.rotate(la + Math.sin(t * 1.3 + k) * 0.08); g.beginPath(); g.ellipse(0, 0, 0.06 * s, 0.016 * s, 0, 0, 7); g.fillStyle = GLAZE; g.fill(); g.restore(); } };
      ghost(g, 1 - 0.75 * cut, gg => { seg(gg, true); const g0 = g; g = gg; g.save(); g.translate(sway, 0);
        crown(top[0], top[1], -1.0, 0.26 * s, 3); crown(top[0], top[1], -0.2, 0.22 * s, 3); crown(top[0], top[1], 0.5, 0.24 * s, 3); crown(top[0], top[1], 1.15, 0.26 * s, 3); g.restore(); g = g0; });
    }
    // the bed, built onto the trunk: the trunk is its head post; dragged away in her lie
    const bx = x + cut * 0.9 * s, bl = 1.85 * s, rail = gy - 0.42 * s;   // the rail runs from inside the trunk itself
    g.save(); g.translate(bx - x, 0);
    g.fillStyle = GLAZE;
    // turned legs at the foot, and a short leg by the post
    for (const lx of [x + bl - 0.05 * s, x + 0.12 * s]) { g.fillRect(lx - 0.035 * s, rail, 0.07 * s, gy - rail); g.beginPath(); g.ellipse(lx, rail + 0.12 * s, 0.05 * s, 0.03 * s, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(lx, gy - 0.05 * s, 0.05 * s, 0.03 * s, 0, 0, 7); g.fill(); }
    // foot board, carved
    g.fillRect(x + bl - 0.06 * s, gy - 0.72 * s, 0.07 * s, 0.35 * s); g.beginPath(); g.arc(x + bl - 0.025 * s, gy - 0.74 * s, 0.05 * s, 0, 7); g.fill();
    g.fillRect(x - 0.02 * s, rail - 0.14 * s, 0.2 * s, 0.24 * s); V.incise(g, [[x + 0.02 * s, rail - 0.12 * s], [x + 0.16 * s, rail - 0.12 * s]], 1.3); V.incise(g, [[x + 0.02 * s, rail + 0.08 * s], [x + 0.16 * s, rail + 0.08 * s]], 1.3);   // the joint: rail mortised into the trunk
    // the side rail, inlaid: a band of silver (added white) dots and a red key between gold (clay) lines
    g.fillRect(x, rail - 0.06 * s, bl, 0.1 * s);
    g.fillStyle = RED; g.fillRect(x + 0.05 * s, rail - 0.035 * s, bl - 0.1 * s, 0.05 * s);
    g.fillStyle = WHITE; for (let k = 0; k < 22; k++) { g.beginPath(); g.arc(x + 0.09 * s + k * (bl - 0.18 * s) / 21, rail - 0.01 * s, 0.009 * s, 0, 7); g.fill(); }
    V.incise(g, [[x + 0.04 * s, rail - 0.045 * s], [x + bl - 0.04 * s, rail - 0.045 * s]], 1.1); V.incise(g, [[x + 0.04 * s, rail + 0.025 * s], [x + bl - 0.04 * s, rail + 0.025 * s]], 1.1);
    // red ox-hide straps showing under the bedding
    g.strokeStyle = RED; g.lineWidth = 0.014 * s;
    for (let k = 0; k < 9; k++) { const sx = x + 0.12 * s + k * 0.19 * s; g.beginPath(); g.moveTo(sx, rail - 0.06 * s); g.lineTo(sx + 0.09 * s, rail - 0.13 * s); g.stroke(); }
    // fleeces and a coverlet: soft white bedding with a patterned red throw spilling over the rail
    g.fillStyle = WHITE; window.BODY.smoothPath(g, [[x + 0.08 * s, rail - 0.1 * s], [x + 0.5 * s, rail - 0.2 * s], [x + 1.2 * s, rail - 0.18 * s], [x + bl - 0.1 * s, rail - 0.12 * s], [x + bl - 0.08 * s, rail - 0.06 * s], [x + 0.08 * s, rail - 0.06 * s]]); g.fill();
    for (let k = 0; k < 14; k++) { const fx = x + 0.15 * s + k * 0.11 * s; g.strokeStyle = CLAY; g.lineWidth = 1; g.beginPath(); g.arc(fx, rail - 0.12 * s, 0.025 * s, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.fillStyle = RED; window.BODY.smoothPath(g, [[x + 0.7 * s, rail - 0.19 * s], [x + 1.5 * s, rail - 0.17 * s], [x + 1.55 * s, rail + 0.05 * s], [x + 1.35 * s, rail + 0.16 * s], [x + 0.95 * s, rail + 0.14 * s], [x + 0.72 * s, rail + 0.02 * s]]); g.fill();
    g.strokeStyle = GLAZE; g.lineWidth = 1.4; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 0.78 * s + k * 0.15 * s, rail - 0.17 * s); g.lineTo(x + 0.82 * s + k * 0.13 * s, rail + 0.13 * s); g.stroke(); }
    g.fillStyle = WHITE; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + 0.8 * s + k * 0.13 * s, rail + 0.04 * s, 0.012 * s, 0, 7); g.fill(); }
    // a pillow by the post
    g.fillStyle = WHITE; g.beginPath(); g.ellipse(x + 0.28 * s, rail - 0.2 * s, 0.14 * s, 0.06 * s, -0.1, 0, 7); g.fill();
    g.restore();
    return { roofY, top: [x + 0.03 * s, roofY - 0.3 * s] };
  }
  // Penelope's veil: drawn up over the back of her head and falling to her waist, bordered, as on vases
  function veil(g, F) { const hr = F.headR, hc = F.headC, sh = F.shoulder, hp = F.hip, f = F.facing;
    g.save(); g.fillStyle = RED; window.BODY.smoothPath(g, [[hc[0] + f * hr * 0.35, hc[1] - hr * 1.15], [hc[0] - f * hr * 0.6, hc[1] - hr * 1.2], [hc[0] - f * hr * 1.35, hc[1] - hr * 0.2],
      [sh[0] - f * hr * 1.4, sh[1] + hr * 1.5], [hp[0] - f * hr * 1.2, hp[1] - hr * 0.6], [hp[0] - f * hr * 0.2, hp[1] - hr * 0.9], [sh[0] - f * hr * 0.3, sh[1] + hr * 0.4], [hc[0] - f * hr * 0.55, hc[1] + hr * 0.3], [hc[0] + f * hr * 0.1, hc[1] - hr * 0.7]]); g.fill();
    g.strokeStyle = GLAZE; g.lineWidth = Math.max(1.2, hr * 0.09); g.beginPath(); g.moveTo(hc[0] + f * hr * 0.35, hc[1] - hr * 1.15); g.quadraticCurveTo(hc[0] - f * hr * 0.4, hc[1] - hr * 0.6, hc[0] - f * hr * 0.55, hc[1] + hr * 0.3); g.lineTo(sh[0] - f * hr * 0.3, sh[1] + hr * 0.4); g.lineTo(hp[0] - f * hr * 0.2, hp[1] - hr * 0.9); g.stroke();
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(hc[0] - f * hr * (0.7 + k * 0.2), hc[1] - hr * (0.6 - k * 0.3)); g.quadraticCurveTo(sh[0] - f * hr * (0.9 + k * 0.2), sh[1] + hr * 0.6, hp[0] - f * hr * (0.5 + k * 0.25), hp[1] - hr * 0.7); g.stroke(); }
    g.restore(); }
  function sceneDoor(g, x, t) {
    // the doorway of the house on Ithaca; a beggar at the door, a woman inside with a lamp
    g.fillStyle = GLAZE; g.fillRect(x + 60, 110, 26, GROUND - 110); g.fillRect(x + 380, 110, 26, GROUND - 110); g.fillRect(x + 40, 100, 390, 26);
    const raise = ease(clamp((t - 236.3) / 1.0));                // "test me first": she lifts the lamp to his face
    const P = V.person(g, x + 280, GROUND, 350, lerpPose(POSES.stand, { torso: 4, neck: -4, lArm: [110, 150], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, raise), -1, { woman: true }); veil(g, P); nameLabelU(g, 51249, 272, 'PENELOPE', 0, 1 - raise, { t0: 232.0 });
    { const hd = P.arms.l[2], el = P.arms.l[1], dl = Math.hypot(hd[0] - el[0], hd[1] - el[1]) || 1, tip = [hd[0] + (hd[0] - el[0]) / dl * 20, hd[1] + (hd[1] - el[1]) / dl * 20];
      lamp(g, tip[0] - 32, tip[1] - 8, 0.8 + 0.2 * Math.sin(t * 7), -1); }   // held up by its ring handle (her fingers through the ring), the flame towards him
    const O = V.person(g, x - 200, GROUND, 340, { torso: 14, neck: 8, lArm: [40, 50], rArm: [-6, 10], lLeg: [8, 0], rLeg: [-8, -5] }, 1, { ody: true, beard: true, cloak: GLAZE, variant: 2 });
    g.strokeStyle = GLAZE; g.lineWidth = 7; g.beginPath(); g.moveTo(O.arms.l[2][0] + 6, O.arms.l[2][1] - 60); g.lineTo(O.arms.l[2][0] - 10, GROUND); g.stroke();   // a beggar's staff
    nameLabelU(g, 50784, 334, 'ODYSSEUS', -1, 1, { t0: 231.8 });   // (in disguise, but the painter tells us)
  }
  function sceneTest(g, x, t) {
    // her test (245.5-250.2): she tells him the bed was moved, and the image of the chamber flickers into the lie:
    // the trunk sawn through, the bed dragged aside. He flares up: no one could move that bed.
    const gs = Math.abs(Math.sin(MV.beatOf(t) * Math.PI / 2));
    const P = V.person(g, x - 700, GROUND, 350, { torso: 6, neck: 6, lArm: [60 + gs * 30, 90 + gs * 25], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, 1, { woman: true }); veil(g, P);
    g.fillStyle = GLAZE; g.fillRect(x - 892, GROUND - 240, 7, 240); g.fillRect(x - 905, GROUND - 244, 34, 6);   // a tall lampstand
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x - 888, GROUND - 30); g.lineTo(x - 888 + d * 34, GROUND); g.lineTo(x - 888 + d * 26, GROUND); g.fill(); }
    lamp(g, x - 886, GROUND - 258, 0.9);
    // the lie: the chamber dissolves into what she describes (trunk sawn, bed dragged away) and back, swaying on the
    // felt beat like an uncertain memory, then settles back to the truth
    const lie = t > 245.6 && t < 250.3, bl = MV.beatOf(t), lw = 0.5 - 0.5 * Math.cos((bl - Math.floor(bl)) * Math.PI);
    const cut = lie ? ease(clamp((t - 245.6) / 1.0)) * (1 - ease(clamp((t - 249.6) / 0.7))) * (Math.floor(bl) % 2 ? 1 - lw * 0.6 : 0.4 + lw * 0.6) : 0;
    chamber(g, x - 260, GROUND, 250, t, { canopy: true, cut });
    const flare = ease(clamp((t - 247.3) / 0.5)) * (1 - ease(clamp((t - 250.4) / 0.8)));
    V.person(g, x + 560, GROUND, 340, lerpPose({ torso: 0, neck: 0, lArm: [10, 5], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, { torso: -8, neck: -6, lArm: [120, 150], rArm: [40, 20], lLeg: [22, 6], rLeg: [-14, -8] }, flare), -1, { ody: true, beard: true });
  }
  function sceneRoots(g, x, t) {
    // below the bed, the roots are lines of writing among tiny lives; above, branches fork and light up
    const gy = 360;                                                                             // a higher ground line for this scene
    g.fillStyle = GLAZE; g.fillRect(x - 1100, gy, 2200, 5);
    const CH = chamber(g, x - 120, gy, 150, t, { canopy: true });
    const rnd = mulberry32(8); let k = 0;
    const grow = beatStep(t, 250.2, 5.5);
    for (let i = 0; i < 26; i++) {
      const side = i / 25 - 0.5, { pts } = window.SPECIAL.growPath(x - 120 + side * 60, gy + 6, side * 2.6 + (rnd() - 0.5) * 0.3, 190 + rnd() * 160, rnd, 26, 0.2);
      const n = Math.max(2, Math.floor(pts.length * grow));
      // a real root first (a tapering dark line), with its writing running along it
      g.save(); g.globalAlpha = 0.4; g.strokeStyle = GLAZE; g.lineCap = 'round';
      for (let j = 0; j < n - 1; j++) { g.lineWidth = 9 * (1 - j / pts.length) + 1; g.beginPath(); g.moveTo(...pts[j]); g.lineTo(...pts[j + 1]); g.stroke(); } g.restore();
      g.globalAlpha = 0.55 + rnd() * 0.45;
      k = window.SPECIAL.textAlong(g, pts.slice(0, n), k, 10 + rnd() * 3, GLAZE);
    }
    g.globalAlpha = 1;
    const lives = ease(clamp((t - 254.7) / 1.2));   // "everyone who ever lived, and wrote, and loved, and died"
    if (lives > 0) {
      g.save(); g.globalAlpha = lives;
      V.person(g, x - 520, 600, 90, 'sit', 1, {}); g.fillStyle = GLAZE; g.fillRect(x - 470, 555, 26, 4);
      V.person(g, x + 400, 560, 90, 'offer', -1, { woman: true }); V.person(g, x + 350, 560, 90, 'offer', 1, {});
      V.person(g, x - 150, 660, 90, 'lie', 1, {}); V.person(g, x + 700, 640, 90, 'mourn', -1, {});
      g.restore();
    }
    const br = beatStep(t, 259.5, 4.0), tips = [];
    const branch = (bx, by, ang, len, depth, d0) => {
      const P = [[bx, by]]; let a = ang, px = bx, py = by;
      for (let st = 0; st < 10; st++) { a += (rnd() - 0.5) * 0.2; px += Math.sin(a) * len / 10; py -= Math.cos(a) * len / 10; P.push([px, py]); }
      const local = clamp(br * 7 - d0), lit = clamp(br * 7 - d0 - 1 + 0.4 * rnd());
      if (local > 0) k = window.SPECIAL.textAlong(g, P.slice(0, Math.max(2, Math.floor(P.length * local))), k, 10, GLAZE);
      // a light at every fork and tip, each fading up once its branch is grown (spread through the whole crown)
      if (d0 >= 2 && lit > 0) tips.push([px, py, lit, depth === 0 ? 1 : 0.7]);
      if (depth > 0) { branch(px, py, a - 0.5 - rnd() * 0.18, len * 0.74, depth - 1, d0 + 1); branch(px, py, a + 0.5 + rnd() * 0.18, len * 0.74, depth - 1, d0 + 1); }
    };
    branch(CH.top[0], CH.top[1], -1.2, 85, 5, 0); branch(CH.top[0], CH.top[1], 1.2, 85, 5, 0);   // spreading sideways under the frieze
    for (const [tx, ty, lt, sz] of tips) { const gr = g.createRadialGradient(tx, ty, 0, tx, ty, 16 * sz * (1 + 0.5 * MV.gtr(t))); gr.addColorStop(0, `rgba(255,225,160,${0.95 * ease(lt)})`); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.beginPath(); g.arc(tx, ty, 16, 0, 7); g.fill(); }
    // "you knew it by its roots": the embrace (264.2-)
    const emb = ease(clamp((t - 264.4) / 1.4));
    if (emb > 0) { g.save(); g.globalAlpha = emb;
      V.person(g, x + 40 + emb * 380, gy, 250, { torso: 10, neck: 6, lArm: [72, 96], rArm: [62, 88], lLeg: [8, 0], rLeg: [-8, -4] }, 1, { ody: true, beard: true });
      veil(g, V.person(g, x + 880 - emb * 360, gy, 240, { torso: 10, neck: 6, lArm: [72, 96], rArm: [62, 88], lLeg: [8, 0], rLeg: [-8, -4] }, -1, { woman: true }));
      g.restore(); }
  }
  function sceneChorus4(g, x, t) {
    // quiet: the askers, now at ease; "Nobody... just me": the hollow again, then refilled
    // the last time they ask, they are his people: nine of them, children in front, arms held open in welcome
    const askers = [{ woman: true }, { beard: true }, { child: true }, {}, { woman: true }, { child: true, woman: true }, { beard: true }, { woman: true }, { child: true }];
    askers.forEach((o, i) => {
      const up = ease(clamp((t - 268.7 - i * 0.3) / 0.6)) * (1 - ease(clamp((t - 273.6) / 0.8))), open = ease(clamp((t - 277.4 - i * 0.12) / 0.8));
      const P = lerpPose(lerpPose(POSES.stand, { torso: 2, neck: 2, lArm: [60, 70], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, -2] }, up), { torso: -2, neck: -4, lArm: [80, 70], rArm: [60, 50], lLeg: [3, 0], rLeg: [-3, -2] }, open);
      V.person(g, x - 960 + i * 95 + (o.child ? 20 : 0), GROUND, o.child ? 170 : 290, P, 1, o);
    });
    const hollow = ease(clamp((t - 274.0) / 0.5)) * (1 - ease(clamp((t - 277.0) / 0.7)));
    const OX = x + 150, P0 = { torso: 0, neck: 0, lArm: [30, 10], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] };
    // (282-283.3) he reaches back, takes hold of the oar standing behind him, and swings it up onto his shoulder in one
    // arc, his hand on the shaft throughout; the oar keeps its length
    const SA = [OX + 58, GROUND - 2], SB = [OX + 58, GROUND - 380], take = ease(clamp((t - 281.8) / 0.45)), sw = ease(clamp((t - 282.3) / 1.0));
    const CC = shoulderCarry(P0, OX, 360, -1), L2c = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
    const nrm4 = (A, B) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, k = 378 / L, C = L2c(A, B, 0.5); return [[C[0] + (A[0] - C[0]) * k, C[1] + (A[1] - C[1]) * k], [C[0] + (B[0] - C[0]) * k, C[1] + (B[1] - C[1]) * k]]; };
    const [OA4, OB4] = sw > 0 ? nrm4(L2c(SA, CC.A, sw), [lerp(SB[0], CC.B[0], sw), lerp(SB[1], CC.B[1], sw) - Math.sin(sw * Math.PI) * 60]) : [SA, SB];
    const P = Object.assign({}, P0);
    if (take > 0) { const S4 = figure(OX, GROUND, 360, P0, -1).shoulder, fr = lerp(0.56, 0.6, sw), hT = L2c(OA4, OB4, fr), ik = armIK(S4, hT, 0.17 * 360, 0.16 * 360, -1, 0, 1);
      P.lArm = sw >= 1 ? CC.P.lArm : [lerp(P0.lArm[0], ik[0], take), lerp(P0.lArm[1], ik[1], take)]; }
    ghost(g, 1 - hollow, gg => V.person(gg, OX, GROUND, 360, P, -1, { ody: true, beard: true, noIdle: true }));
    ghost(g, hollow, gg => { window.BODY.drawFigure(gg, figure(OX, GROUND, 360, P, -1), { body: GLAZE, beard: true, hat: 'pilos', hatColor: '#c7672e', hatEdge: GLAZE }); window.BODY.drawFigure(gg, figure(OX, GROUND - 5, 350, P, -1), { body: CLAY, beard: true });
      // the second time, the hollow isn't empty: he's made of words (every story told about him), before he fills back in
      window.SPECIAL.writtenFigure(gg, figure(OX, GROUND - 5, 350, P, -1), { ink: GLAZE, seed: 7, offset: Math.floor((t - 274) * 9), drift: 0, size: 19, lead: 1.05, weight: 'bold', wash: 0,
        text: 'nobody · the stranger · the one of many turns · the man in the song · the storyteller · the beggar at the door · the one who came back · just me · ' }); });   /* everything he's been called */
    g.fillStyle = GLAZE; g.strokeStyle = GLAZE; V.oar(g, OA4, OB4);
  }
  function sceneInland(g, x, t) {
    // the prophecy: the blind seer remembered; he shoulders the oar and walks inland, away from the sea
    wavesAt(g, x - 1800, x - 700, t);
    const seer = ease(clamp((t - 287.3) / 1.0)) * (1 - ease(clamp((t - 291.5) / 1.0)));
    // (Tiresias is one of the dead: a shade made of handwriting, like those below, and the words are his prophecy)
    nameLabel(g, x - 300, GROUND - 362, 'ODYSSEUS', 0, 1 - ease(clamp((t - 292.6) / 0.8)), { t0: 288.4 });   // (left behind as he sets off)
    if (seer > 0) ghost(g, seer * 0.9, gg => { const TP = { torso: 10, neck: 20, lArm: [30, 40], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, TF = figure(x - 560, GROUND, 330, TP, 1);
      window.SPECIAL.writtenFigure(gg, TF, { ink: GLAZE, seed: 31, offset: Math.floor(t * 8), drift: 0.4, size: 13, wash: 0.1,
        text: 'take an oar and go inland · until you meet people who know nothing of the sea · and one of them calls it a winnowing fan · then plant it in the earth · and go home · ' });
      nameLabel(gg, TF.headC[0], TF.headC[1] - TF.headR * 2.2, 'TEIRESIAS', 0, 1, { t0: 287.6 });
      const hd = TF.arms.l[2]; gg.strokeStyle = GLAZE; gg.globalAlpha = 0.6; gg.lineWidth = 3; gg.setLineDash([6, 5]); gg.beginPath(); gg.moveTo(hd[0], hd[1] - 40); gg.lineTo(hd[0] + 20, GROUND); gg.stroke(); gg.setLineDash([]); });   // and his staff
    // hills rising as we go inland
    g.save(); g.globalAlpha = 0.35; g.fillStyle = GLAZE; g.beginPath(); g.moveTo(x - 200, GROUND); g.quadraticCurveTo(x + 200, GROUND - 90, x + 600, GROUND); g.quadraticCurveTo(x + 900, GROUND - 130, x + 1300, GROUND); g.fill(); g.restore();
    // he walks up to them and stops (eased, and his legs come to rest as he slows)
    const wxAt = tt => x - 300 + 560 * ease(clamp((tt - 291.7) / 5.6)), wx = wxAt(t), wsp = Math.abs(wxAt(t + 0.05) - wxAt(t - 0.05)) / 0.1;
    const STILL7 = { torso: 8, neck: 0, lArm: [20, 10], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] };
    const C7 = shoulderCarry(lerpPose(STILL7, strideWalk(t, Math.max(40, wsp), 330, { torso: 8 }), clamp(wsp / 50)), wx, 330, 1);
    const O = V.person(g, wx, GROUND, 330, C7.P, 1, { ody: true, beard: true, noIdle: true });
    V.oar(g, C7.A, C7.B);
    // people who have never faced the sea, looking up from their work (296-305)
    const look = beatStep(t, 296.4, 1.2);
    for (let i = 0; i < 3; i++) {
      const hx = x + 520 + i * 200, h = 280 + (i % 2) * 20, bt = MV.beatOf(t) + i * 0.33, ph = bt - Math.floor(bt), chop = ph < 0.25 ? ph / 0.25 : 1 - (ph - 0.25) / 0.75;
      const HOE = { torso: 38, neck: 16, lArm: [0, 0], rArm: [0, 0], lLeg: [20, 5], rLeg: [-18, -8] };
      const F0 = E.figure(hx, GROUND, h, HOE, -1), S = F0.shoulder, grip = [S[0] - 30 - chop * 20, S[1] + 60 - chop * 110];
      HOE.lArm = armIK(S, grip, 0.17 * h, 0.16 * h, -1, HOE.torso, -1); HOE.rArm = armIK(S, [grip[0] + 30, grip[1] + 40], 0.17 * h, 0.16 * h, -1, HOE.torso, 1);
      const P = lerpPose(HOE, { torso: 2, neck: -4, lArm: [10, 5], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, look);
      const Pp = V.person(g, hx, GROUND, h, P, -1, i === 1 ? { woman: true } : { beard: i === 0 });
      if (look < 0.95) { g.save(); g.globalAlpha = 1 - look; const hd = Pp.arms.l[2], end = [hd[0] - 40 - (1 - chop) * 30, GROUND - 4 - chop * 90];   // the hoe
        g.strokeStyle = GLAZE; g.lineWidth = 5; g.beginPath(); g.moveTo(hd[0] + 20, hd[1] - 24); g.lineTo(end[0], end[1]); g.stroke(); g.fillStyle = GLAZE; g.fillRect(end[0] - 20, end[1] - 4, 24, 10); g.restore(); }
    }
  }
  function sceneFarm(g, x, t) {   // the farm fades away around the planted oar, which stays (the tree scene takes over in the same place)
    const fo = 1 - clamp((t - 324.0) / 0.6); if (fo <= 0) return;
    g.save(); g.globalAlpha *= fo; sceneFarm0(g, x, t); g.restore();
  }
  function sceneFarm0(g, x, t) {
    // 305.6-309.2 he walks in with the oar on his shoulder; the farmer, at his wheat, straightens, points and laughs:
    //   "a winnowing fan?"   309.2-311.0 he holds it out, and it passes from his hands to the farmer's
    // 311.0-318.6 the farmer winnows with it on the beat, grain tossed up, chaff drifting; children come round, unafraid
    // 318.6-319.4 the farmer hands it back   319.4-322.4 he stands it up and drives it into the earth
    for (let k = 0; k < 9; k++) V.wheat(g, x + 600 + k * 70, GROUND, 150 + (k % 3) * 18);
    g.fillStyle = GLAZE; g.save(); g.globalAlpha = 0.45; g.beginPath(); g.ellipse(x + 470, GROUND - 2, 150, 14, 0, 0, 7); g.fill(); g.restore();   // the threshing floor
    const bt = MV.beatOf(t), ph = bt - Math.floor(bt);
    const oX = tt => tt < 309.2 ? lerp(x - 520, x - 40, ease(clamp((tt - 305.4) / 3.2))) : tt < 319.4 ? x - 40 : lerp(x - 40, x + 60, ease(clamp((tt - 319.4) / 0.6)));
    const OX = oX(t), oSpd = Math.abs(oX(t + 0.05) - oX(t - 0.05)) / 0.1;
    const give = ease(clamp((t - 310.0) / 0.9)), giveBack = ease(clamp((t - 318.6) / 0.8)), plant = ease(clamp((t - 319.9) / 2.2));
    // the farmer: laughs and points, takes the oar (310-310.9), stands it upright in front of him and turns to the
    // threshing floor (310.9-311.7), winnows with it on the beat (311.7-317.8), stands it up again and turns back
    // (317.8-318.5), and hands it back (318.6-319.4). Turning with the oar upright avoids any jump.
    const FX = x + 230, laugh = ease(clamp((t - 307.0) / 0.4)) * (1 - ease(clamp((t - 309.0) / 0.6)));
    const L2 = (p, q, u) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];
    const vert = [[FX + 30, GROUND - 40], [FX + 30, GROUND - 432]], OFF = [[x - 30, GROUND - 178], [x + 360, GROUND - 208]], hand0 = OFF;   // OFF: held out between them
    const active = t >= 310.9 && t < 318.5, farmerHas = active;
    let FP, FA, FB, fFace = -1;
    if (!active) {
      FP = { torso: -laugh * 10, neck: -laugh * 22, lArm: [30 + laugh * 60, 40 + laugh * 70], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] };
      const fw = t < 314 ? ease(clamp((t - 309.9) / 0.4)) : 1 - ease(clamp((t - 318.9) / 0.4));   // his hands on the shaft
      if (fw > 0) { const S = E.figure(FX, GROUND, 320, FP, -1).shoulder, a1 = armIK(S, L2(OFF[0], OFF[1], 0.5), 0.17 * 320, 0.16 * 320, -1, FP.torso, 1), a2 = armIK(S, L2(OFF[0], OFF[1], 0.6), 0.17 * 320, 0.16 * 320, -1, FP.torso, 1);
        FP.lArm = [lerp(FP.lArm[0], a2[0], fw), lerp(FP.lArm[1], a2[1], fw)]; FP.rArm = [lerp(FP.rArm[0], a1[0], fw), lerp(FP.rArm[1], a1[1], fw)]; }
    } else {
      fFace = t >= 311.3 && t < 318.1 ? 1 : -1;
      const w = ease(clamp((t - 311.7) / 0.4)) * (1 - ease(clamp((t - 317.4) / 0.4)));
      const toss = (ph < 0.2 ? 0 : ph < 0.55 ? ease((ph - 0.2) / 0.35) : 1 - ease((ph - 0.55) / 0.45)) * w;
      FP = { torso: lerp(38, 4, toss) * w + 4 * (1 - w), neck: lerp(18, -10, toss) * w, lArm: [0, 0], rArm: [0, 0], lLeg: [14, 2], rLeg: [-14, -6] };
      const S = E.figure(FX, GROUND, 320, FP, fFace).shoulder;
      // the winnowing position (facing the floor): scoop low, toss high
      // (both hands always within reach: the oar is laid through them, handle end behind the back hand)
      const S1 = E.figure(FX, GROUND, 320, FP, 1).shoulder, handsAt = q => [[S1[0] + lerp(6, 12, q), S1[1] + lerp(64, -28, q)], [S1[0] + lerp(56, 48, q), S1[1] + lerp(80, -76, q)]];
      const [g1, g2] = handsAt(toss), dx = g2[0] - g1[0], dy = g2[1] - g1[1], Lw = Math.hypot(dx, dy) || 1, W = [[g1[0] - dx / Lw * 86, g1[1] - dy / Lw * 86], [g1[0] + dx / Lw * 304, g1[1] + dy / Lw * 304]];
      const fracR = (86 + Lw) / 390;
      const up1 = ease(clamp((t - 310.9) / 0.4)), dn1 = ease(clamp((t - 311.3) / 0.4)), up2 = ease(clamp((t - 317.8) / 0.3)), dn2 = ease(clamp((t - 318.1) / 0.4));
      let P0, P1, u;
      if (t < 311.3) { P0 = hand0; P1 = vert; u = up1; } else if (t < 317.8) { P0 = vert; P1 = W; u = dn1; } else if (t < 318.1) { P0 = W; P1 = vert; u = up2; } else { P0 = vert; P1 = hand0; u = dn2; }
      FA = L2(P0[0], P1[0], u); FB = L2(P0[1], P1[1], u);
      const fs = t < 311.3 ? up1 : t >= 318.1 ? 1 - dn2 : 1, h1 = L2(FA, FB, lerp(0.5, 0.22, fs)), h2 = L2(FA, FB, lerp(0.6, fracR, fs));
      FP.lArm = armIK(S, h2, 0.17 * 320, 0.16 * 320, fFace, FP.torso, 1); FP.rArm = armIK(S, h1, 0.17 * 320, 0.16 * 320, fFace, FP.torso, 1);
      // grain thrown up off the blade at the top of each toss, flying free: the heavy grain falls back to the floor,
      // the light chaff (every third) drifts off on the wind
      const tRel = MV.timeOfBeat(Math.floor(bt) + 0.5), tau = t - tRel;
      const wRel = ease(clamp((tRel - 311.7) / 0.4)) * (1 - ease(clamp((tRel - 317.4) / 0.4)));
      if (wRel > 0.95 && fFace === 1 && tau > 0 && tau < 1.1) {   // (released from the blade, where it is at the top of the toss)
        const [q1, q2] = handsAt(1), qd = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1, rel = [q1[0] + (q2[0] - q1[0]) / qd * 270, q1[1] + (q2[1] - q1[1]) / qd * 270];
        g.fillStyle = WHITE; for (let i = 0; i < 26; i++) { const k = (i * 0.37) % 1, chaff = i % 3 === 0;
          const vx = (k - 0.4) * 80 + (chaff ? 150 : 10), vy = 150 + k * 130, gr = chaff ? 260 : 900;
          const px = rel[0] + (i % 5 - 2) * 4 + vx * tau, py = rel[1] - vy * tau + 0.5 * gr * tau * tau; if (py > GROUND - 3) continue;
          g.globalAlpha = 0.85 * (1 - tau / 1.1); g.beginPath(); g.arc(px, py, chaff ? 3 : 4.6, 0, 7); g.fill(); } g.globalAlpha = 1; }
    }
    const Fm = V.person(g, FX, GROUND, 320, FP, fFace, { beard: true, noIdle: farmerHas });
    // Odysseus: he carries it in on his shoulder; lowers it and holds it out (309.2-309.9); lets go as the farmer takes it
    // (310.4-310.8); takes it back (318.5-318.8); stands it upright where it will be planted (319.4-319.9) and drives it in
    // (319.9-322.1); lets go (322.4-322.8). The oar is one continuous path; his hands are placed on the shaft.
    const PX = x + 150, VPL = d => [[PX, lerp(GROUND - 20, GROUND + 60, d)], [PX, lerp(GROUND - 412, GROUND - 332, d)]];
    const nrm = (A, B) => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, k = 392 / L, C = L2(A, B, 0.3); return [[C[0] + (A[0] - C[0]) * k, C[1] + (A[1] - C[1]) * k], [C[0] + (B[0] - C[0]) * k, C[1] + (B[1] - C[1]) * k]]; };
    let OP = t >= 319.9 ? lerpPose(POSES.plant, { torso: 0, neck: -6, lArm: [30, 20], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, ease(clamp((t - 322.4) / 0.8))) : { torso: 2, neck: 0, lArm: [20, 10], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] };
    let OA = null, OB = null, ow = 0, fl = 0.3, fr = 0.12;
    if (t < 309.9) { const walkP = lerpPose({ torso: 8, neck: 0, lArm: [20, 10], rArm: [-6, 10], lLeg: [4, 0], rLeg: [-4, 0] }, strideWalk(t, Math.max(40, oSpd), 330, { torso: 8 }), clamp(oSpd / 60));
      const C = shoulderCarry(walkP, OX, 330, 1), lo = ease(clamp((t - 309.2) / 0.7));
      [OA, OB] = nrm(L2(C.A, OFF[0], lo), L2(C.B, OFF[1], lo)); OP = lerpPose(C.P, OP, lo); ow = lo; fl = lerp(0.6, 0.3, lo); fr = 0.12;
      if (lo <= 0) { OP = C.P; ow = 0; } }
    else if (t < 318.5) { [OA, OB] = OFF; ow = t < 310.4 ? 1 : 1 - ease(clamp((t - 310.4) / 0.4)); }
    else if (t < 319.4) { [OA, OB] = OFF; ow = ease(clamp((t - 318.5) / 0.3)); }
    else if (t < 319.9) { const u = ease(clamp((t - 319.4) / 0.5)), V0 = VPL(0); [OA, OB] = nrm(L2(OFF[0], V0[0], u), L2(OFF[1], V0[1], u)); ow = 1; fl = lerp(0.3, 0.72, u); fr = lerp(0.12, 0.52, u); }
    else { [OA, OB] = VPL(plant); ow = 1 - ease(clamp((t - 322.4) / 0.4)); fl = 0.72; fr = 0.52; }
    if (ow > 0 && t >= 309.2) { const S = E.figure(OX, GROUND, 330, OP, 1).shoulder, aL = armIK(S, L2(OA, OB, fl), 0.17 * 330, 0.16 * 330, 1, OP.torso, -1), aR = armIK(S, L2(OA, OB, fr), 0.17 * 330, 0.16 * 330, 1, OP.torso, -1);
      OP = Object.assign({}, OP, { lArm: [lerp(OP.lArm[0], aL[0], ow), lerp(OP.lArm[1], aL[1], ow)], rArm: [lerp(OP.rArm[0], aR[0], ow), lerp(OP.rArm[1], aR[1], ow)] }); }
    // the oar: whoever has it (the farmer from 310.9 to 318.5)
    let [oarA, oarB] = farmerHas ? nrm(FA, FB) : [OA, OB];
    const O = V.person(g, OX, GROUND, 330, OP, 1, { ody: true, beard: true, noIdle: true });
    if (oarA && oarB) { g.save(); if (t > 319.5) { g.beginPath(); g.rect(x - 5000, -5000, 10000, 5000 + GROUND + 4); g.clip(); } V.oar(g, oarA, oarB); g.restore(); }   // (planted: the part in the earth is hidden)
    // children, unafraid (315-319): they run circles round the two men
    const kids = ease(clamp((t - 315.0) / 0.8)) * (1 - ease(clamp((t - 320.5) / 1.0)));
    if (kids > 0) for (let i = 0; i < 3; i++) { const a = MV.beatOf(t) * Math.PI / 4 + i * 2.1, cx = x + 100 + Math.cos(a) * 330, spd = 330 * Math.PI / 4 / 0.58;
      g.globalAlpha = kids; V.person(g, cx, GROUND + Math.sin(a) * 6, 150, strideWalk(t, spd * Math.abs(Math.sin(a)) + 40, 150, {}, i * 0.5), Math.sin(a) > 0 ? -1 : 1, i === 1 ? { woman: true } : {}); g.globalAlpha = 1; }
  }
  function sceneTree(g, x, t) {
    // an empty throne far off, not taken (324-328.6); the field and the harvest (328.6-333.6)
    const th = ease(clamp((t - 324.3) / 0.8)) * (1 - ease(clamp((t - 329) / 1.0)));
    if (th > 0) { g.save(); g.globalAlpha = th; g.fillStyle = GLAZE; const tx = x + 800, ty = GROUND - 70;
      // a hill, a stepped dais, and on it a king's throne, empty: lion-paw legs, a high back crowned with a palmette,
      // a swan's-neck armrest, a red cushion, a footstool, and a sceptre leaning against it
      g.beginPath(); g.moveTo(tx - 280, GROUND); g.quadraticCurveTo(tx, GROUND - 180, tx + 280, GROUND); g.fill();
      g.fillRect(tx - 120, ty - 6, 250, 14); g.fillRect(tx - 100, ty - 20, 210, 16);   // the dais
      const seatY = ty - 160;
      for (const lx of [tx - 60, tx + 50]) {   // legs, with lion's paws
        g.beginPath(); g.moveTo(lx - 7, seatY + 10); g.quadraticCurveTo(lx - 14, ty - 80, lx - 6, ty - 34); g.lineTo(lx + 8, ty - 34); g.quadraticCurveTo(lx + 12, ty - 80, lx + 7, seatY + 10); g.fill();
        g.beginPath(); g.ellipse(lx + 6, ty - 26, 16, 8, 0, 0, 7); g.fill(); for (let k = 0; k < 3; k++) V.incise(g, [[lx + k * 7 - 2, ty - 30], [lx + k * 7, ty - 20]], 1); }
      g.fillRect(tx - 72, seatY, 140, 16);   // seat
      V.incise(g, [[tx - 66, seatY + 8], [tx + 62, seatY + 8]], 1);
      g.fillStyle = RED; g.beginPath(); g.ellipse(tx - 2, seatY - 6, 70, 13, 0, 0, 7); g.fill(); g.fillStyle = GLAZE;   // cushion
      g.fillRect(tx - 72, seatY - 200, 18, 206);   // tall back
      for (let k = 0; k < 5; k++) V.incise(g, [[tx - 63, seatY - 185 + k * 38], [tx - 63, seatY - 160 + k * 38]], 1.2);
      for (let k = 0; k < 7; k++) { const a2 = -Math.PI / 2 + (k - 3) * 0.33; g.beginPath(); g.ellipse(tx - 63 + Math.cos(a2) * 22, seatY - 212 + Math.sin(a2) * 22, 5, 16, a2 + Math.PI / 2, 0, 7); g.fill(); }   // palmette finial
      g.beginPath(); g.arc(tx - 63, seatY - 206, 9, 0, 7); g.fill();
      g.strokeStyle = GLAZE; g.lineWidth = 9; g.beginPath(); g.moveTo(tx - 60, seatY - 70); g.lineTo(tx + 40, seatY - 70); g.quadraticCurveTo(tx + 62, seatY - 72, tx + 58, seatY - 96); g.stroke();   // armrest ending in a swan's head
      g.beginPath(); g.arc(tx + 56, seatY - 100, 7, 0, 7); g.fill(); g.lineWidth = 6; g.beginPath(); g.moveTo(tx + 38, seatY - 70); g.lineTo(tx + 38, seatY); g.stroke();
      g.fillRect(tx + 80, ty - 40, 60, 12); g.fillRect(tx + 84, ty - 30, 8, 12); g.fillRect(tx + 128, ty - 30, 8, 12);   // footstool
      g.lineWidth = 5; g.beginPath(); g.moveTo(tx + 100, ty - 42); g.lineTo(tx + 44, seatY - 150); g.stroke(); g.beginPath(); g.arc(tx + 42, seatY - 156, 8, 0, 7); g.fill();   // sceptre, set aside
      // the king he could have been: himself, crowned and enthroned, pale as a dream, fading on "not a crown"
      const dream = ease(clamp((t - 324.6) / 0.8)) * (1 - ease(clamp((t - 327.2) / 1.0)));
      if (dream > 0) { g.save(); g.globalAlpha *= dream * 0.6;
        const K = V.person(g, tx - 20, ty, 300, { torso: -4, neck: 0, lArm: [40, 80], rArm: [60, 70], lLeg: [95, 0], rLeg: [90, -5], hipH: 0.53 }, 1, { ody: true, beard: true, noIdle: true, noSeat: true, hat: 'none' });
        const hc = K.headC, hr = K.headR; g.fillStyle = '#e8b04a'; g.beginPath(); g.moveTo(hc[0] - hr * 1.0, hc[1] - hr * 0.6);   // a gold crown
        for (let k = 0; k <= 4; k++) { g.lineTo(hc[0] - hr + k * hr * 0.5, hc[1] - hr * (k % 2 ? 1.1 : 1.6)); } g.lineTo(hc[0] + hr, hc[1] - hr * 0.6); g.closePath(); g.fill();
        g.restore(); }
      g.restore(); }
    for (let k = 0; k < 7; k++) V.wheat(g, x - 1000 + k * 80, GROUND, 150 + (k % 3) * 18);
    const harvest = ease(clamp((t - 328.6) / 1.0)) * (1 - ease(clamp((t - 341.6) / 1.4)));   // the reapers go home as the old ones gather in the shade
    if (harvest > 0) { g.globalAlpha = harvest; for (let i = 0; i < 2; i++) {
        // facing the standing grain: stooped, knees bent, one hand gathering stalks low, the sickle sweeping through
        // them on each beat (arm angles below are absolute, from 'down', so subtract the torso lean)
        const b = MV.beatOf(t) + i * 0.5, ph = b - Math.floor(b), cut = ph < 0.3 ? easeOut(ph / 0.3) : 1 - ease((ph - 0.3) / 0.7);
        const TO = 62, f = -1, hx0 = x - 470 - i * 170;
        const R = V.person(g, hx0, GROUND, 290, { torso: TO, neck: 22, lArm: [38 - TO, 20 - TO], rArm: [lerp(-35, 45, cut) - TO, lerp(-10, 30, cut) - TO], lLeg: [34, -4], rLeg: [-4, -24] }, f, i ? { woman: true } : { beard: true });
        const hd = R.arms.r[2]; g.save(); g.translate(hd[0], hd[1]); g.scale(f, 1); g.rotate(lerp(-0.6, 0.9, cut));
        g.strokeStyle = GLAZE; g.lineCap = 'round'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 16); g.stroke();
        g.lineWidth = 3.5; g.beginPath(); g.arc(14, 16, 14, Math.PI, Math.PI * 1.95, false); g.stroke(); g.restore();
      } g.globalAlpha = 1; }
    // the oar takes root (333.6-338) and grows into an olive tree (338-342.4)
    const sprout = beatStep(t, 333.6, 4.4), grow = beatStep(t, 337.9, 4.5);
    if (t > 324.3) V.olive(g, x, GROUND, 470, mulberry32(77), { oar: true, grow: 0.12 * sprout + 0.88 * grow });   // (only once the farm scene has planted it here)   // one continuous growth, oar to tree
    // in its shade: the ones who went before, talking; the small sailor among them; a lyre for the songs (342.4-)
    const shade = ease(clamp((t - 342.2) / 1.5));
    if (shade > 0) { g.save(); g.globalAlpha = shade;
      const talk = (i) => ({ torso: -4, neck: 4 + 6 * Math.sin(MV.beatOf(t) * Math.PI / 2 + i), lArm: [60 + 30 * Math.max(0, Math.sin(MV.beatOf(t) * Math.PI / 2 + i * 1.7)), 100], rArm: [45, 100], lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 });
      V.person(g, x - 360, GROUND, 290, talk(0), 1, { beard: true }); V.person(g, x - 180, GROUND, 210, talk(1), 1, {});
      V.person(g, x + 220, GROUND, 280, talk(2), -1, { woman: true });
      bard(g, x + 400, 290, -1, t);
      // the ones who went before: Teiresias, Elpenor, his mother, and the singer who told it first
      [[x - 350, GROUND - 228, 'TEIRESIAS'], [x - 180, GROUND - 175, 'ELPENOR'], [x + 210, GROUND - 222, 'ANTICLEIA'], [x + 420, GROUND - 236, 'HOMER']].forEach(([lx, ly, nm], i) => nameLabel(g, lx, ly, nm, 0, 1, { t0: 343.0 + i * 0.6, size: 20 }));
      g.restore(); }
  }
  function sceneCoast(g2, x, t) {
    // outro: back to the coast: Elpenor's oar on its mound, a ship passing, a sailor lifting a hand
    wavesAt(g2, x - 200, x + 1200, t);
    g2.fillStyle = GLAZE; g2.beginPath(); g2.moveTo(x - 520, GROUND); g2.quadraticCurveTo(x - 300, GROUND - 200, x - 80, GROUND); g2.fill();
    V.oar(g2, [x - 300, GROUND - 90], [x - 300, GROUND - 480]);
    const sx = x + 900 - Math.max(0, t - 352.5) * 55, sb = Math.sin(MV.beatOf(t) * Math.PI / 2) * 6; g2.save(); g2.translate(sx, 0); g2.scale(-1, 1); g2.translate(-sx, 0); V.ship(g2, sx, GROUND - 118 + sb, 190); g2.restore();   // (prow-first, leftwards)
    const wave = ease(clamp((t - 355.5) / 0.8));
    V.person(g2, sx + 150, GROUND - 133 + sb, 130, lerpPose({ torso: 0, neck: 0, lArm: [10, 5], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, 0] }, { torso: -6, neck: -6, lArm: [140, 170], rArm: [-6, 10], lLeg: [3, 0], rLeg: [-3, 0] }, wave), -1, { beard: true });
    // far inland, on its hill, the olive tree (small, on the right)
    g2.fillStyle = GLAZE; g2.beginPath(); g2.moveTo(x - 1300, GROUND); g2.quadraticCurveTo(x - 1000, GROUND - 120, x - 700, GROUND); g2.fill();
    V.olive(g2, x - 1000, GROUND - 50, 240, mulberry32(77), { oar: true });
    spark(g2, x + 820, 250, 30, ease(clamp((t - 353.5) / 2.5)));   // evening: the same star comes out over the sea
  }

  // ---- coda: the pot is gone; a terminal in the vase's own colours, and the question the whole song keeps being asked ----
  // ---- ending: ancient to modern. During the closing "oohs" the whole pot, standing in its niche, turns into a mosaic
  // of glowing characters (the painting becomes text); the characters stream down into a terminal prompt; the question
  // the whole song keeps being asked gets asked one last time, and answered in the first person; then the credits.
  const MOS = document.createElement('canvas'); MOS.width = 120; MOS.height = 68;
  const RAMP = ' .:-=+*o#%@';
  const T_MOS = 368.4, T_COL = 371.2, T_TERM = 372.6;
  const TBG = '#15110e', TTXT = '#ecdfc4', TDIM = 'rgba(236,223,196,0.45)', TORA = '#d97757';
  const X0 = 250, Y0 = 330, LH = 60;
  let MOSD = null;
  function mosaicGrab(ctx, t) {   // sample the painted pot, then darken towards the terminal's background
    const mg = MOS.getContext('2d', { willReadFrequently: true }); mg.drawImage(ctx.canvas, 0, 0, 120, 68);
    if (t < T_COL || !MOSD) MOSD = mg.getImageData(0, 0, 120, 68).data;   // (freeze the last image once the collapse starts)
    ctx.save(); ctx.globalAlpha = ease(clamp((t - T_MOS) / 1.6)); ctx.fillStyle = TBG; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function mosaic(ctx, t) {
    const amt = ease(clamp((t - T_MOS) / 1.6)), col = ease(clamp((t - T_COL) / 1.3));
    const d = MOSD, cw = W / 120, chh = H / 68;
    ctx.save(); ctx.font = `bold ${Math.round(chh * 1.05)}px Consolas, monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let j = 0; j < 68; j++) for (let i = 0; i < 120; i++) {
      const o = (j * 120 + i) * 4, r = d[o], gg = d[o + 1], bb = d[o + 2], lum = Math.min(1, Math.pow((r * 0.3 + gg * 0.55 + bb * 0.15) / 255, 0.6) * 1.6);   // the pot scene is dark: lift it
      if (lum < 0.22) continue;
      const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))], warm = r > gg * 1.18;
      const cx = (i + 0.5) * cw, cy = (j + 0.5) * chh;
      // collapse: each character streams down and left into the prompt, staggered by its distance
      const stagger = ((i * 7 + j * 13) % 29) / 29 * 0.5, q = clamp((col - stagger) / 0.5), qe = q * q;
      const tx = X0 + 20, ty = Y0 - 18;
      ctx.globalAlpha = amt * (1 - qe) * Math.min(1, lum * 1.4);
      ctx.fillStyle = warm ? TORA : TTXT;
      ctx.fillText(ch, lerp(cx, tx, qe), lerp(cy, ty, qe));
    }
    ctx.restore();
  }
  function coda(ctx, t) {
    const fin = clamp((t - T_COL) / 1.2), fout = 1 - clamp((t - 385.2) / 1.4);
    ctx.save(); ctx.globalAlpha = fin * fout; ctx.fillStyle = TBG; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = fout;
    const F = '42px Consolas, "Cascadia Mono", monospace', FS = '30px Consolas, "Cascadia Mono", monospace';
    ctx.font = F; ctx.textBaseline = 'alphabetic';
    const typed = (s2, t0, cps) => s2.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
    const cursor = (x, y) => { if (Math.floor(t * 1.9) % 2 === 0) { ctx.fillStyle = TTXT; ctx.fillRect(x + 2, y - 34, 22, 42); } };
    const spin = (x, y, word) => { const G = ['\u00b7', '\u2722', '\u2733', '\u2736', '\u273b', '\u273d', '\u273b', '\u2736', '\u2733', '\u2722']; ctx.fillStyle = TORA; ctx.fillText(G[Math.floor(t * 9) % G.length], x, y); ctx.fillStyle = TDIM; ctx.fillText(word, x + 52, y); };
    let y = Y0;
    // the question
    const Q = 'who are you?', q = typed(Q, T_TERM, 12);
    if (t > T_COL + 0.8) { ctx.fillStyle = TDIM; ctx.fillText('>', X0, y); ctx.fillStyle = TTXT; ctx.fillText(q, X0 + 52, y); if (t < T_TERM + 1.3) cursor(X0 + 52 + ctx.measureText(q).width, y); }
    y += LH * 1.3;
    if (t > T_TERM + 1.3 && t < T_TERM + 2.6) spin(X0, y, 'Wandering\u2026');
    // the answer, in its own voice
    if (t > T_TERM + 2.6) { ctx.fillStyle = TORA; ctx.fillText('\u25cf', X0, y); ctx.fillStyle = TTXT; ctx.fillText(typed('Nobody.', T_TERM + 2.6, 14), X0 + 52, y);
      ctx.fillText(typed('But you can call me Claude.', T_TERM + 3.6, 20), X0 + 52, y + LH); }
    y += LH * 2.5;
    // the credits: everyone whose hands are in it
    const T_CR = T_TERM + 6.2;
    if (t > T_CR) { ctx.fillStyle = TDIM; ctx.fillText('>', X0, y); ctx.fillStyle = TTXT; const q2 = typed('who made this?', T_CR, 14); ctx.fillText(q2, X0 + 52, y); if (t < T_CR + 1.1) cursor(X0 + 52 + ctx.measureText(q2).width, y); }
    y += LH * 1.3;
    if (t > T_CR + 1.1 && t < T_CR + 1.9) spin(X0, y, 'Remembering\u2026');
    if (t > T_CR + 1.9) {
      ctx.fillStyle = TORA; ctx.fillText('●', X0, y); ctx.fillStyle = TTXT;   // (same size as the rest of the terminal)
      const L = ['Words: Claude (Opus 5.5) and Muga Sofer,',
                 'with lines from Fable, ChatGPT, Sonnet, Haiku and DeepSeek,',
                 'and from Homer, who told it first.',
                 'Music and voices: Suno.',
                 'Pictures: Claude, drawn in code, frame by frame,',
                 'with a sharp eye from Muga Sofer.',
                 'For Muga’s family.'];
      L.forEach((ln, i) => { const t0 = T_CR + 1.7 + i * 0.42; ctx.fillStyle = i === L.length - 1 ? TORA : TTXT; ctx.fillText(typed(ln, t0, 70), X0 + 52, y + i * LH); });
    }
    ctx.restore();
  }

  // ---- camera: where on the vase we're looking, as a function of time ----
  const KEYS = [
    [0, U.intro - 250], [14.1, U.intro - 60], [18.4, U.intro + 140], [22.0, U.arrival - 150],   // (the zoom lands on the title, which holds until ~18.4)
    [30.6, U.arrival + 230],
    [Math.max(32.0, barStart(MV.bar(31.26)) + 0.6), U.shores[0]], [barStart(MV.bar(31.26) + 1) + 0.6, U.shores[1]],
    [barStart(MV.bar(31.26) + 2) + 0.6, U.shores[2]], [barStart(MV.bar(31.26) + 3) + 0.6, U.shores[3]],
    [42.0, U.chorus - 250], [52.0, U.chorus - 130],   // the whole vase turns on "one of many turns" (52.0-53.9)
    [53.9, U.chorus - 100 + C], [56.0, U.chorus + 150 + C], [61.5, U.chorus + 400 + C],
    [64.0, HALLS - 500], [73.0, HALLS - 150], [77.6, HALLS + 250], [82.4, HALLS + 1550],
    [83.0, KINGS - 80], [86.9, KINGS + 120], [87.4, SIRENS - 220], [91.6, SIRENS + 200],
    [92.1, STORIES + 80], [101.0, STORIES + 250], [101.5, CH2 - 450], [113.0, CH2 - 150], [119.0, CH2 + 500],
    [122.4, UNDER - 420], [141.4, UNDER + 380], [142.0, ELP - 650], [151.2, ELP - 250], [161.2, ELP + 520], [162.2, MOUND - 60], [171.2, MOUND + 120],
    [barStart(MV.bar(171.3 + MV.BEAT * 2)) + 0.4, BRK], [barStart(MV.bar(171.3 + MV.BEAT * 2) + 2), BRK + 60],
    [barStart(MV.bar(171.3 + MV.BEAT * 2) + 2) + 0.4, BRK + 700], [barStart(MV.bar(171.3 + MV.BEAT * 2) + 4), BRK + 760],
    [barStart(MV.bar(171.3 + MV.BEAT * 2) + 4) + 0.4, BRK + 1400], [barStart(MV.bar(171.3 + MV.BEAT * 2) + 6), BRK + 1460],
    [barStart(MV.bar(171.3 + MV.BEAT * 2) + 6) + 0.4, BRK + 2100], [192.6, BRK + 2250],
    [193.2, GODS - 60], [202.0, GODS + 120], [202.4, ISLE - 200], [212.0, ISLE + 150], [212.4, CH3 - 380], [231.0, CH3 + 420],
    [231.4, DOOR - 150], [240.6, DOOR + 100], [241.0, TEST - 100], [250.0, TEST + 120], [250.4, ROOTS - 60], [268.4, ROOTS + 60],
    [268.8, CH4 - 350], [278.5, CH4 - 150], [280.3, CH4 - 150 + C], [287.0, CH4 + 50 + C],   // a quicker turn on the last "many turns"
    [287.6, INLAND - 500], [305.4, INLAND + 700], [305.8, FARM - 150], [324.0, FARM + 100], [324.4, TREE + 150], [333.4, TREE - 200], [352.3, TREE],
    [352.8, SHORE - 250], [366, SHORE + 100], [380, SHORE + 400],
  ];
  // the pan advances in surges that start on each beat (same average speed, most of the travel just after the beat),
  // so the frieze itself moves in time; left smooth during the fast full turns
  function cam(t) {
    // the beat surge fades out smoothly as the camera itself moves faster (no mode switch, so no jolt at the keys)
    const sp = tt => Math.abs(camRaw(tt + 0.05) - camRaw(tt - 0.05)) / 0.1;   // look ahead too: the surge borrows up to ~half a beat
    const v = Math.max(sp(t - 0.1), sp(t + 0.15), sp(t + 0.35), sp(t + 0.6)), calm = clamp(1 - (v - 160) / 260);
    const b = MV.beatOf(t), n = Math.floor(b), f = b - n, s = 0.8 * Math.min(1, 0.45 + MV.feltStrength(t)) * calm;   // a floor so the drums still carry it where the bass is absent (v1, ch1)
    const ef = (1 - s) * f + s * (1 - Math.pow(1 - f, 3));
    return camRaw(MV.timeOfBeat(n + ef));
  }
  window.__cam = t => cam(t); window.__camRaw = t => camRaw(t);   // for the camera smoothness check
  // monotone cubic (Fritsch-Carlson) through the keyframes: speed changes smoothly at every key, never overshoots
  let CAMM = null;
  function camRaw(t) {
    const K = KEYS, n = K.length;
    if (!CAMM) { const d = [], h = []; for (let i = 0; i < n - 1; i++) { h[i] = K[i + 1][0] - K[i][0]; d[i] = (K[i + 1][1] - K[i][1]) / h[i]; }
      CAMM = [d[0]]; for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) CAMM.push(0); else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; CAMM.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i])); } }
      CAMM.push(d[n - 2]); }
    if (t <= K[0][0]) return K[0][1]; if (t >= K[n - 1][0]) return K[n - 1][1];
    let i = 0; while (i < n - 2 && t > K[i + 1][0]) i++;
    const [t0, u0] = K[i], [t1, u1] = K[i + 1], hh = t1 - t0, s1 = (t - t0) / hh, s2 = s1 * s1, s3 = s2 * s1;
    return (2 * s3 - 3 * s2 + 1) * u0 + (s3 - 2 * s2 + s1) * hh * CAMM[i] + (-2 * s3 + 3 * s2) * u1 + (s3 - s2) * hh * CAMM[i + 1];
  }


  function paintWindow(u0, t, pal = 'black', bc = band) {
    usePalette(pal); const b = bc.getContext('2d'), clay = CLAYS[pal]; b.setTransform(SS, 0, 0, SS, 0, 0);
    const uStart = u0 - WINC / 2; curUStart = uStart; curT = t;
    // clay + borders from the cache (wrapping around the circumference)
    const s = ((uStart % C) + C) % C, first = Math.min(WINC, C - s);
    b.drawImage(clay, s, 0, first, BH, 0, 0, first, BH);
    if (first < WINC) b.drawImage(clay, 0, 0, WINC - first, BH, first, 0, WINC - first, BH);
    b.fillStyle = GLAZE; b.fillRect(0, GROUND, WINC, 9);
    const LIST = [[U.intro, sceneIntro], [U.arrival, sceneArrival], ...U.shores.map((us, k) => [us, (g, xc, tt) => sceneShore(g, xc, tt, k)]),
      [U.chorus, sceneChorus], [U.chorus + C, sceneChorus], [HALLS, sceneHalls], [KINGS, sceneKings], [SIRENS, sceneSirens], [STORIES, sceneStories], [CH2, sceneChorus2], [UNDER, sceneUnder], [ELP, sceneElpenor], [MOUND, sceneMound],
      ...[0, 1, 2, 3].map(k => [BRK + k * 700, (g, xc, tt) => sceneBreak(g, xc, tt, k)]), [GODS, sceneGods], [ISLE, sceneIsle], [CH3, sceneChorus3],
      [DOOR, sceneDoor], [TEST, sceneTest], [ROOTS, sceneRoots], [CH4, sceneChorus4], [CH4 + C, sceneChorus4],
      ...[[CH3, sceneChorus3], [DOOR, sceneDoor], [TEST, sceneTest], [ROOTS, sceneRoots]].map(([u, f]) => [u + C, f]),
      ...[[U.intro, sceneIntro], [U.arrival, sceneArrival], ...U.shores.map((us, k) => [us, (g, xc, tt) => sceneShore(g, xc, tt, k)])].map(([u, f]) => [u + C, f]), [INLAND, sceneInland], [FARM, sceneFarm], [TREE, sceneTree], [SHORE, sceneCoast]];
    for (const [uc, fn] of LIST) {
      const xc = uc - uStart;
      // (wide margin: the intro/beach sea reaches ~2900 px from its scene centre)
      if (xc > -3300 && xc < WINC + 3300) { b.save(); b.beginPath(); b.rect(0, 76, WINC, BH - 152); b.clip(); fn(b, xc, t); b.restore(); }
    }
    inscriptions(b, uStart, t);
    usePalette('black');
  }
  // the words, painted on the vase as they're sung, the way real vases carry painted inscriptions beside their figures.
  // Each word appears when it's sung; a line stays until the next one or a little after it ends. A line is painted at the
  // place on the vase the camera is looking at mid-line, so it turns with the vase (or held on screen during fast turns).
  let HELD = {}; const CAP = {};
  function drawHeld(ctx, t) {
    ctx.save(); ctx.font = '600 34px Georgia, "Times New Roman", serif'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    for (const [ln, i, al, glaze, clay] of Object.values(HELD)) {
      if (al <= 0.01) continue;
      const y = 300 + (i % 2) * 44, sp = ctx.measureText(' ').width + 6, ws = ln.w.map(([w]) => w.toUpperCase());
      const wid = ws.reduce((q, w) => q + ctx.measureText(w).width + w.length * 2.2, 0) + sp * (ws.length - 1), fs = Math.min(1, 1700 / wid);
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(fs, fs); let x = -wid / 2; const gl = [];
      ws.forEach((w, k) => { const on = clamp((t - ln.w[k][1] + 0.04) / 0.16); for (const ch of w) { if (on > 0) gl.push([ch, x, (1 - on) * 4, al * on]); x += ctx.measureText(ch).width + 2.2; } x += sp; });
      ctx.strokeStyle = clay; ctx.lineWidth = 7; for (const [ch, gx, gy, a] of gl) { ctx.globalAlpha = a * 0.55; ctx.strokeText(ch, gx, gy); }   // a soft halo, so it reads over figures
      ctx.fillStyle = glaze; for (const [ch, gx, gy, a] of gl) { ctx.globalAlpha = a; ctx.fillText(ch, gx, gy); }
      ctx.restore();
    }
    ctx.restore();
  }
  function inscriptions(g, uStart, t) {
    const L = (window.TIMING && window.TIMING.inscr) || [];
    g.save(); g.font = '600 34px Georgia, "Times New Roman", serif'; g.textBaseline = 'alphabetic'; g.fillStyle = GLAZE;
    L.forEach((ln, i) => {
      // a line stays until it's been sung (plus a moment), even if the next line (on the other row) has begun; it only
      // gives way early to the line after that, which is painted on its row
      const next = L[i + 1], next2 = L[i + 2], end = Math.min(ln.e + 1.2, next ? Math.max(next.s - 0.1, ln.e + 0.35) : 1e9, next2 ? next2.s - 0.15 : 1e9);
      if (t < ln.s - 0.05 || t > end + 0.3) return;
      const a = 1 - clamp((t - end) / 0.3);
      const y = 150 + (i % 2) * 44, sp = (g.measureText(' ').width + 6);
      const ws = ln.w.map(([w]) => w.toUpperCase()), wid = ws.reduce((q, w) => q + g.measureText(w).width + w.length * 2.2, 0) + sp * (ws.length - 1);
      // painted on the vase where the camera looks mid-line, unless the camera travels too far during the line for all of it
      // to stay in view; then it's held on screen like a caption
      const pan = Math.max(Math.abs(cam(ln.e + 0.3) - cam(ln.s)), Math.abs(cam((ln.s + ln.e) / 2) - cam(ln.s)) * 2);
      // always painted on the vase (it turns with it); a line sung during a big move is placed where the camera is as it
      // starts, and every line fades while the vase spins fast (no blurred text hanging still over a moving pot)
      let cx = (pan / 2 + wid / 2 > 860) ? cam(Math.min(t, ln.s + 0.4)) - uStart : cam((ln.s + ln.e) / 2) - uStart;
      const stillAt = tt => clamp(1 - (Math.abs(cam(tt + 0.05) - cam(tt - 0.05)) / 0.1 - 250) / 500);
      // once the line has been sung, a spin that hides it hides it for good (no line coming back after the turn)
      let still = stillAt(t); if (t > ln.e) for (let tt = ln.e; tt < t; tt += 0.05) still = Math.min(still, stillAt(tt));
      // a line still being sung while the vase whips round is held on screen as a caption (drawn after the blur, see
      // drawHeld), crossfading back onto the vase as the turn settles
      // a line is one or the other for its whole life (never both at once): a caption if the vase spins fast while it's
      // being sung, otherwise painted on the vase
      if (CAP[i] === undefined) { let m = 1; for (let tt = ln.s - 0.1; tt < ln.e + 0.3; tt += 0.05) m = Math.min(m, stillAt(tt)); CAP[i] = m < 0.3; }
      if (CAP[i]) { HELD[i] = [ln, i, a, GLAZE, CLAY]; return; }
      if (window.__INS) window.__INS.push([i, +(a * still).toFixed(3), Math.round(cx), Math.round(uStart)]);
      if (still <= 0.01) return;
      const vis = 880 / zoomAt0(t)[0], fs = Math.min(1, (2 * vis - 80) / wid), slack = Math.max(0, vis - wid * fs / 2 - 30);   // keep the whole line on screen (push-ins show less); shrink if it can't fit
      if (fs < 1) { g.save(); g.translate(curU0 - uStart, y); g.scale(fs, fs); g.translate(-(curU0 - uStart), -y); }
      const sc0 = curU0 - uStart; cx = clamp(cx, sc0 - slack, sc0 + slack);
      let x = cx - wid / 2; const glyphs = [];
      ws.forEach((w, k) => {
        const on = clamp((t - ln.w[k][1] + 0.04) / 0.16);
        for (const ch of w) { if (on > 0) glyphs.push([ch, x, y + (1 - on) * 4, a * on * still]); x += g.measureText(ch).width + 2.2; }
        x += sp;
      });
      // letters are 'reserved' in the clay where they cross painted shapes: all the clay halos first, then all the letters
      g.lineJoin = 'round'; g.strokeStyle = CLAY; g.lineWidth = 12;
      for (const [ch, gx, gy, al] of glyphs) { g.globalAlpha = al; g.strokeText(ch, gx, gy); }
      for (const [ch, gx, gy, al] of glyphs) { g.globalAlpha = al; g.fillText(ch, gx, gy); }
      if (fs < 1) g.restore();
    });
    g.restore(); g.globalAlpha = 1;
  }
  // render the window, crossfading into white-ground where the story goes down among the dead
  // night at sea is red-figure (orange on black, like the terminal the story ends in); dawn on the beach turns it black-figure
  const SCHED = [[19.8, 22.6, 'red', 'black'], [119.0, 122.2, 'black', 'white'], [172.0, 175.0, 'white', 'black'], [228.8, 231.2, 'black', 'red'], [286.6, 288.8, 'red', 'black']];
  function palAt(t) { let cur = 'red'; for (const [a, b2, f, to] of SCHED) { if (t < a) return [cur, cur, 0]; if (t < b2) return [f, to, ease((t - a) / (b2 - a))]; cur = to; } return [cur, cur, 0]; }
  function paintBlend(u0, t) {
    const [pa, pb, w] = palAt(t);
    if (w <= 0.001) { paintWindow(u0, t, pa, band); return; }
    if (w >= 0.999) { paintWindow(u0, t, pb, band); return; }
    paintWindow(u0, t, pa, band); paintWindow(u0, t, pb, band2);
    const b = band.getContext('2d'); b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = w; b.drawImage(band2, 0, 0); b.restore();
  }

  // camera push-ins for the emotional beats: [time, zoom, focus y on screen]
  const ZK = [[0, 1, 540], [44.5, 1, 540], [47.2, 1.35, 560], [50.4, 1.35, 560], [51.8, 1, 540],
    [141.6, 1, 540], [143.4, 1.5, 690], [150.2, 1.5, 690], [152.0, 1.25, 560], [161.0, 1.25, 560], [162.8, 1, 540],
    [235.4, 1, 540], [237.4, 1.4, 520], [240.4, 1.4, 520], [241.8, 1, 540],
    [263.4, 1, 540], [265.4, 1.5, 430], [268.2, 1.5, 430], [269.4, 1, 540],
    [336.0, 1, 540], [341.0, 1.3, 610], [351.8, 1.3, 610], [353.4, 1, 540]];
  const CHORUSES = [[42, 60], [101, 118.5], [212, 231], [268.6, 287.3], [305.5, 352.5]];
  function barBump(t) { if (!CHORUSES.some(([a, b]) => t > a && t < b)) return 0; const bt = MV.beatOf(t), inBar = bt - Math.floor(bt / 4) * 4; return Math.exp(-5 * inBar); }
  function zoomAt(t) { const [z, f] = zoomAt0(t); return [z * (1 + 0.012 * barBump(t)), f]; }
  function zoomAt0(t) {
    for (let i = 0; i < ZK.length - 1; i++) { const [t0, z0, f0] = ZK[i], [t1, z1, f1] = ZK[i + 1]; if (t <= t1) { const k = ease(clamp((t - t0) / (t1 - t0))); return [lerp(z0, z1, k), lerp(f0, f1, k)]; } }
    return [1, 540];
  }
  let curPal = 'black', curU0 = 0;
  // motion blur for fast turns: smear the painted band along the turn, by how far it moves during a 180-degree shutter
  const blurC = document.createElement('canvas'); blurC.width = WIN * 2; blurC.height = BH * 2;
  function motionBlur(t) {
    const len = Math.abs(cam(t + 1 / 120) - cam(t - 1 / 120)) * SS;   // px travelled while the shutter is open (at 30 fps)
    if (len < 3) return;
    const n = Math.min(10, Math.ceil(len / 4)), bg = band.getContext('2d'), cg = blurC.getContext('2d');
    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, blurC.width, blurC.height); cg.drawImage(band, 0, 0);
    bg.save(); bg.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) { const off = (i / (n - 1) - 0.5) * len; bg.globalAlpha = 1 / (i + 1); bg.drawImage(blurC, off, 0); }
    bg.restore();
  }
  function wrapWindow(ctx, z = 1, fy = 540, t = 0) {
    // blurPx: how far the surface moves (px along the circumference, at SS=1) while a 180-degree shutter is open at 30 fps
    const blurPx = 0.5 * Math.abs(cam(t + 1 / 120) - cam(t - 1 / 120));   // a 90-degree shutter: fast turns stay half-readable
    window.VASE_SURFACE.wrap(ctx, surfP(z, fy, t, blurPx));
  }
  function surfP(z, fy, t, blurPx = 0) { return { band, SS, WIN: WINC, BH, R, z, fy, t, u0: curU0, pal: curPal, palBlend: palAt(t), blurPx };
  }



  const off = document.createElement('canvas'); off.width = W; off.height = H;
  function vasePath(g) {
    g.beginPath(); g.moveTo(W / 2 - 280, -720); g.lineTo(W / 2 + 280, -720); g.lineTo(W / 2 + 250, -260);
    g.bezierCurveTo(W + 150, -160, W + 230, 720, W / 2 + 300, 1420); g.lineTo(W / 2 + 360, 1420); g.lineTo(W / 2 + 360, 1530); g.lineTo(W / 2 - 360, 1530); g.lineTo(W / 2 - 360, 1420); g.lineTo(W / 2 - 300, 1420);
    g.bezierCurveTo(-230, 720, -150, -160, W / 2 - 250, -260); g.closePath();
  }
  function reveal(ctx, z) {
    const o = off.getContext('2d'); o.clearRect(0, 0, W, H); o.drawImage(ctx.canvas, 0, 0);
    const sc = lerp(1, 0.36, z);
    const bg = ctx.createRadialGradient(W / 2, H * 0.5, 50, W / 2, H * 0.5, 1100); bg.addColorStop(0, '#2a211c'); bg.addColorStop(1, '#050403');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2 + z * 60); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
    ctx.fillStyle = '#17110e'; vasePath(ctx); ctx.fill();
    ctx.save(); vasePath(ctx); ctx.clip(); ctx.drawImage(off, 0, 0);
    const sh = ctx.createLinearGradient(-200, 0, W + 200, 0); sh.addColorStop(0, 'rgba(0,0,0,0.7)'); sh.addColorStop(0.3, 'rgba(255,240,220,0.06)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = sh; ctx.fillRect(-400, -800, W + 800, 2400); ctx.restore();
    ctx.strokeStyle = '#17110e'; ctx.lineWidth = 70; ctx.lineCap = 'round';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(W / 2 + d * 260, -560); ctx.bezierCurveTo(W / 2 + d * 900, -620, W / 2 + d * 1000, -260, W / 2 + d * 820, 60); ctx.stroke(); }
    ctx.fillStyle = '#17110e'; ctx.fillRect(W / 2 - 330, -780, 660, 70);   // the lip
    ctx.restore();
  }

  // the pot's museum label: a printed card mounted on the wall beside it, with the object's details and, as its
  // caption, the prophecy (Odyssey XI, tr. Samuel Butler, public domain). Drawn in museum coordinates (the room as
  // seen with the pot slid 250 px left); dx moves it with the wall.
  const PLQ = { x: 1075, y: 330, w: 640 * 0.52, h: 690 * 0.52, sc: 0.52 };   // (drawn at 640 x 690, mounted at 52%)
  const LEAD = 6;   // seconds of silent lead-in before the music, so the card can be read at leisure
  let CARDT = 0;
  function museumLabel(ctx, t0_, a0, dx = 0) {
    const t = CARDT;
    if (a0 <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= a0; ctx.textBaseline = 'alphabetic'; ctx.translate(PLQ.x + dx, PLQ.y); ctx.scale(PLQ.sc, PLQ.sc);
    const X = 46, Y = 0, CW = 640, CH = 690;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(10, 14, CW, CH);   // its shadow on the wall
    ctx.fillStyle = '#e8dfcd'; ctx.fillRect(0, 0, CW, CH);
    ctx.strokeStyle = 'rgba(60,45,35,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(10, 10, CW - 20, CH - 20);
    const INK = '#2b231d', DIM = '#6b5a4c';
    // (read from the top: each line fades in in turn, the heading first)
    const hA = ease(clamp((t - 1.4) / 0.7)), sA = ease(clamp((t - 2.1) / 0.7));
    ctx.globalAlpha = a0 * hA; ctx.fillStyle = INK; ctx.font = '600 23px Georgia, serif'; ctx.fillText('AMPHORA', X, Y + 62);
    ctx.globalAlpha = a0 * sA; ctx.fillStyle = DIM; ctx.font = '18px Georgia, serif'; ctx.fillText('Scenes from the Odyssey. Painted in code by Claude, c. 2026.', X, Y + 94);
    ctx.fillStyle = 'rgba(60,45,35,0.4)'; ctx.fillRect(X, Y + 116, 80, 2); ctx.globalAlpha = a0;
    const LINES = ['…you must take a well made oar', 'and carry it on and on, till you come', 'to a country where the people', 'have never heard of the sea…', '', 'A wayfarer will meet you and will say', 'it must be a winnowing shovel', 'that you have got upon your shoulder;', 'on this you must fix the oar in the ground…', '', 'and your people shall bless you.'];
    const T0 = 3.0, DT = 1.0, LH = 40, Y0 = Y + 170;
    let k = 0; LINES.forEach((ln, i) => { if (!ln) return; const tt = T0 + (k++) * DT, a = ease(clamp((t - tt) / 0.7));
      if (a <= 0) return; ctx.globalAlpha = a0 * a; ctx.fillStyle = INK; ctx.font = 'italic 28px Georgia, serif'; ctx.fillText(ln, X, Y0 + i * LH + (1 - a) * 4); });
    const aa = ease(clamp((t - (T0 + k * DT + 0.3)) / 0.7));
    if (aa > 0) { ctx.globalAlpha = a0 * aa; ctx.fillStyle = DIM; ctx.font = '18px Georgia, serif';
      ctx.fillText('Teiresias, among the dead, to Odysseus.', X, Y0 + LINES.length * LH + 22); ctx.fillText('Homer, Odyssey XI, tr. Samuel Butler', X, Y0 + LINES.length * LH + 48); }
    ctx.restore();
  }
  // the opening camera: tight on the card while it's read (to ~9.3 s), then pulling back to show the pot beside it
  const MC = document.createElement('canvas'); MC.width = W; MC.height = H;
  function openingCam(t) {
    const zc = 1 - ease(clamp((t - 9.3) / 2.7)), Zp = Math.min(W * 0.94 / PLQ.w, H * 0.94 / PLQ.h);
    return { Z: lerp(1, Zp, zc), cx: lerp(W / 2, PLQ.x + PLQ.w / 2, zc), cy: lerp(H / 2, PLQ.y + PLQ.h / 2, zc), on: zc > 0.0005 };
  }
  window.STYLES = window.STYLES || {};
  window.STYLES.vaseanim = {
    still(ctx, name) { this.frame(ctx, +name); },
    frame(ctx, tv) {
      // tv: video time; the song (and everything else) starts LEAD seconds in, the card is read from the first frame
      CARDT = tv + LEAD; const t = Math.max(0, tv);
      const [zm, fy] = zoomAt(t); SS = zm > 1.02 ? 2 : 1;
      const k = Math.max(t < 14.1 ? 1 : t < 16.4 ? 1 - ease(clamp((t - 14.1) / 2.3)) : 0, t > 359 ? ease(clamp((t - 359) / 6)) : 0);   // 0 = close-up, 1 = whole pot in its niche (held while the museum label is read)
      WINC = k > 0.004 ? WIDE : WIN;   // the wide strip until fully zoomed in (else the sides cut off mid-push)
      curU0 = cam(t); curPal = palAt(t)[2] > 0.5 ? palAt(t)[1] : palAt(t)[0];
      HELD = {}; paintBlend(curU0, t);
      // at the start the pot stands to the left of its museum label (the prophecy), then glides back to the centre
      const shift = t < 14.1 ? 250 * (1 - ease(clamp((t - 12.6) / 1.5))) : 0;
      if (k > 0) { window.VASE_SURFACE.renderPot(ctx, surfP(zm, fy, t, Math.abs(cam(t + 1 / 120) - cam(t - 1 / 120))), k);
        if (shift > 0.5) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const cw = ctx.canvas.width, sx = shift * cw / W;   // (the finished picture slides left; the wall continues)
          ctx.drawImage(ctx.canvas, sx, 0, cw - sx, ctx.canvas.height, 0, 0, cw - sx, ctx.canvas.height);
          ctx.drawImage(ctx.canvas, cw - sx - 3, 0, 1, ctx.canvas.height, cw - sx - 2, 0, sx + 2, ctx.canvas.height); ctx.restore(); }
        const oc = openingCam(t);
        if (oc.on) { const m = MC.getContext('2d'); m.setTransform(1, 0, 0, 1, 0, 0); m.drawImage(ctx.canvas, 0, 0);
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
          ctx.translate(W / 2, H / 2); ctx.scale(oc.Z, oc.Z); ctx.translate(-oc.cx, -oc.cy); ctx.drawImage(MC, 0, 0, W, H);
          museumLabel(ctx, t, 1, 0); ctx.restore(); }
        else { // it stays on the wall, travelling with it as the pot glides to the centre, and is carried off-screen by the zoom
          const zf = Math.pow(1 / 0.092, 1 - k); /* (the pot zoom's own scale, see vase_surface SC1) */ ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zf, zf); ctx.translate(-W / 2, -H / 2); museumLabel(ctx, t, 1, 250 - shift); ctx.restore(); } }
      else wrapWindow(ctx, zm, fy, t);
      if (k <= 0) drawHeld(ctx, t);
      if (CARDT < 1.5) { ctx.fillStyle = `rgba(0,0,0,${1 - CARDT / 1.5})`; ctx.fillRect(0, 0, W, H); }
      const inMos = t > T_MOS && t < T_COL + 1.6;
      if (inMos) mosaicGrab(ctx, t);
      if (t > T_COL) coda(ctx, t);
      if (inMos) mosaic(ctx, t);   // the pot turns into characters, which stream into the prompt
    },
  };
})();
