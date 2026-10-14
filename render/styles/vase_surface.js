// The vase as a physical object: maps the painted frieze band onto the cylinder, and everything around it
// (glaze, lighting, ornament registers above/below the frieze, environment, camera).
// API: VASE_SURFACE.wrap(ctx, P) where P = { band, SS, WIN, BH, R, z, fy, t, u0, pal }
//   band: canvas holding the frieze window (painted at scale SS; band-x = u - (u0 - WIN/2)), BH: band height (760)
//   R: vase radius (px), z: camera zoom (1 = default), fy: zoom focus y on screen, t: song time (s), u0: camera position
//   along the circumference (px; increases as the vase turns), pal: 'black' | 'white' | 'red' (current technique)
//   Optional: palBlend = [palFrom, palTo, w] (0..1) so the ornament registers crossfade exactly with the band.
//   Optional: blurPx = surface travel (px at SS=1) during the shutter; the unrolled strip is smeared by it (capped at 250).
// VASE_SURFACE.renderPot(ctx, P, k): the whole pot in its niche. k = 0 is exactly wrap(); k = 1 is the pot standing
//   small (~40% of frame height) in a dim, warm niche. Stateless, so it works in both directions (intro push-in, ending
//   pull-back). The pot is a neck-amphora whose belly is the close-up cylinder; neck, shoulder, foot and handles appear as
//   the camera recedes. The body is a WebGL mesh textured with the same unrolled strip and lit per pixel.
//   Band rows outside the painted window (|angle| > WIN/2R) are filled with plain clay + meander borders; pass a wider
//   band window (WIN >= pi*R + 200) at k > ~0.15 if the scene should wrap all the way round to the silhouette.
//
// How it works, per frame:
//  1. Compose a flat "unrolled" strip F in surface coordinates (u = band-x, v = band-y; v < 0 is the shoulder above the
//     frieze, v > BH the body below it): glaze, ornament registers (vector, drawn per frame so they stay sharp when
//     zoomed), the band itself, then surface wear fixed to the pot (firing variation, chips, scuffs, an old mend line).
//  2. Map F onto the cylinder column by column, with a little perspective (a camera ~4 radii away: lines above eye level
//     bow down at the edges, lines below bow up), under a slowly breathing camera.
//  3. Light it: a multiply map (key light from the left, museum spotlight falloff, vignette) and a screen map (a faint
//     cool glow as from a screen off to the left, a small warm lamp glint), both fixed to the cylinder's angle, cached per zoom.
//  4. Air: a faint beam of light and slow dust motes in front of the pot.
(() => {
  const { W, H, clamp, mulberry32, noise2, fbm, hash2, lerp, figure, drawSilhouette, taper, walkPose, lerpPose } = window.ENGINE;
  const TOPH = 290, BOTH = 290;                 // surface rows kept above / below the band (v units)
  const TOP0 = 170, BH0 = 740, EYE = 540, CAMD = 7000;   // band placement on screen at zoom 1; eye level; camera distance
  const PX = 44, PY = 56;                       // overscan (screen px) so camera breathing never shows an edge
  const SCHED = [[19.8, 22.6, 'red', 'black'], [119.0, 122.2, 'black', 'white'], [172.0, 175.0, 'white', 'black'], [228.8, 231.2, 'black', 'red'], [286.6, 288.8, 'red', 'black']];
  const sm = x => x * x * (3 - 2 * x);
  function palAt(t) { let cur = 'red'; for (const [a, b, f, to] of SCHED) { if (t < a) return [cur, cur, 0]; if (t < b) return [f, to, sm((t - a) / (b - a))]; cur = to; } return [cur, cur, 0]; }
  // colours per technique: gl = glaze around the registers, res = reserved (unpainted) lines, gr = register ground,
  // ink = ornament, acc = accent (added red / wash), line = draw ornament as fine line work (white-ground)
  const PALS = {
    black: { gl: '#17110e', res: '#c7672e', gr: '#c7672e', ink: '#17110e', acc: '#7e2618', skin: '#17110e', line: false },
    red:   { gl: '#1a1310', res: '#c9703a', gr: '#1a1310', ink: '#c9703a', acc: '#a4502a', skin: '#c9703a', line: false },
    white: { gl: '#17110e', res: '#ece2cc', gr: '#ece2cc', ink: '#4a3326', acc: '#b0664a', skin: '#4a3326', line: true },
  };
  // choruses: the dancers in the lower register step on the beat, and the whole line walks round the pot
  const CHORUS = [[42, 59], [101, 118], [212, 231], [268, 287], [305, 352]];
  const danceK = t => { let k = 0; for (const [a, b] of CHORUS) k = Math.max(k, sm(clamp((t - a + 0.6) / 1.2)) * sm(clamp((b + 0.6 - t) / 1.2))); return k; };
  const STEP = 22;                              // walk distance per beat (surface px)
  const MV = () => window.MV || { beatOf: t => (t - 0.464) / 0.5805 };
  function walked(t) {                          // total distance walked by the choros up to time t (deterministic integral)
    const beat = 0.5805, dt = 0.05; let d = 0;
    for (const [a, b] of CHORUS) {
      const t0 = a - 0.8, t1 = Math.min(t, b + 0.8); if (t1 <= t0) continue;
      for (let x = t0; x < t1; x += dt) d += danceK(Math.min(x + dt / 2, t1)) * Math.min(dt, t1 - x) / beat;
    }
    return d * STEP;
  }

  let S = null;
  function init(P) {
    const R = P.R, C = Math.round(2 * Math.PI * R), BH = P.BH, VH = TOPH + BH + BOTH;
    const st = { R, C, BH, VH };
    // flat composition canvas (max size: whole window at the finest paint scale)
    st.F = document.createElement('canvas'); st.F.width = Math.ceil(P.WIN * 2); st.F.height = VH * 2;
    // --- firing variation (soft-light, low-res, seamless around the pot) and glaze misfire (screen) ---
    const q = 8, fw = Math.ceil(C / q), fh = Math.ceil(VH / q);
    const seam = (fn, s, v) => fn(s, v) * (1 - s / C) + fn(s - C, v) * (s / C);   // wraps at s = C
    const fire = document.createElement('canvas'); fire.width = fw; fire.height = fh;
    const mis = document.createElement('canvas'); mis.width = fw; mis.height = fh;
    { const g = fire.getContext('2d'), id = g.createImageData(fw, fh), d = id.data;
      const g2 = mis.getContext('2d'), id2 = g2.createImageData(fw, fh), d2 = id2.data;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const s = i * q, v = j * q - TOPH, k = (j * fw + i) * 4;
        const lo = seam((a, b) => fbm(a * 0.0011, b * 0.0016, 41, 4), s, v) - 0.5;          // broad firing blotches
        const cl = seam((a, b) => fbm(a * 0.0004 + 3, b * 0.0009, 43, 3), s, v);             // rare firing clouds
        const cloud = clamp((0.36 - cl) * 5);
        const L = 128 + lo * 90 - cloud * 26;
        d[k] = clamp(L + 5 - cloud * 4, 0, 255); d[k + 1] = clamp(L - 2 - cloud * 8, 0, 255); d[k + 2] = clamp(L - 8 - cloud * 10, 0, 255); d[k + 3] = 255;
        const m = seam((a, b) => fbm(a * 0.0009 + 7, b * 0.0013, 47, 4), s, v);
        const red = clamp((m - 0.58) * 4);                                                     // brownish misfire patches in the black
        d2[k] = 150; d2[k + 1] = 70; d2[k + 2] = 34; d2[k + 3] = Math.round(red * 255 * 0.16 + lo * 0);
      }
      g.putImageData(id, 0, 0); g2.putImageData(id2, 0, 0); }
    st.fire = fire; st.mis = mis; st.q = q;
    // --- throwing rings: faint horizontal banding left by the potter's wheel (the same all the way round) ---
    const rings = document.createElement('canvas'); rings.width = 1; rings.height = VH;
    { const g = rings.getContext('2d'), id = g.createImageData(1, VH), d = id.data;
      for (let j = 0; j < VH; j++) { const n = (fbm(0.5, j * 0.045, 81, 3) - 0.5) * 20 + (noise2(1.5, j * 0.4, 83) - 0.5) * 6; d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = clamp(128 + n, 0, 255); d[j * 4 + 3] = 255; }
      g.putImageData(id, 0, 0); }
    st.rings = rings;
    // --- clay grain (soft-light pattern for the register grounds) ---
    const gr = document.createElement('canvas'); gr.width = gr.height = 256;
    { const g = gr.getContext('2d'), id = g.createImageData(256, 256), d = id.data, r = mulberry32(5150);
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
        const k = (j * 256 + i) * 4, n = (r() - 0.5) * 34 + (noise2(i * 0.09, j * 0.09, 61) - 0.5) * 40 + (r() < 0.004 ? -60 : 0);
        d[k] = d[k + 1] = d[k + 2] = clamp(128 + n, 0, 255); d[k + 3] = 255;
      }
      g.putImageData(id, 0, 0); }
    st.grain = gr;
    // --- wear fixed to the surface: chips (glaze flaked to clay), scuffs, one old mend line ---
    const r = mulberry32(90210);
    st.chips = [];
    for (let i = 0; i < 300; i++) {
      const s = r() * C;
      // more wear near the rims of the registers and the band edges, a little everywhere
      const zone = r(); let v;
      if (zone < 0.25) v = -TOPH + r() * 150; else if (zone < 0.4) v = (r() < 0.5 ? -8 : BH + 8) + (r() - 0.5) * 30; else v = -TOPH + r() * VH;
      const big = r() < 0.035, rad = big ? 4 + r() * 7 : 0.8 + Math.pow(r(), 2.5) * 3;
      const n = 6 + Math.floor(r() * 5), pts = [], el = 0.7 + r() * 0.9;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + r() * 0.5, rr = rad * (0.55 + 0.6 * r()); pts.push([Math.cos(a) * rr * el, Math.sin(a) * rr]); }
      st.chips.push({ s, v, pts, big });
    }
    st.scuffs = [];
    for (let i = 0; i < 150; i++) {
      const s = r() * C, v = -TOPH + r() * VH, len = 14 + r() * 70, ang = (r() - 0.5) * 0.5, bend = (r() - 0.5) * 10;
      st.scuffs.push({ s, v, len, ang, bend, w: 0.5 + r() * 0.9, a: 0.05 + r() * 0.09 });
    }
    st.mends = [];
    for (let m = 0; m < 1; m++) {
      let s = r() * C, v = -TOPH + 40 + r() * 120, a = 0.9 + r() * 0.6; const pts = [[s, v]];
      while (v < BH + BOTH && pts.length < 400) { a += (r() - 0.5) * 0.5; a = clamp(a, 0.5, 2.6); s += Math.cos(a) * 9; v += Math.sin(a) * 9; pts.push([s, v]); }
      st.mends.push(pts);
    }
    // --- dust motes ---
    st.motes = [];
    for (let i = 0; i < 44; i++) st.motes.push({ x: r(), y: r(), d: Math.pow(r(), 1.6), vx: 3 + r() * 9, vy: -(1.5 + r() * 6), ph: r() * 50, tw: 0.2 + r() * 0.5 });
    const mote = document.createElement('canvas'); mote.width = mote.height = 64;
    { const g = mote.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,238,210,1)'); rg.addColorStop(0.35, 'rgba(255,230,200,0.55)'); rg.addColorStop(1, 'rgba(255,220,190,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64); }
    st.mote = mote;
    st.light = { z: -1 };
    S = st;
  }

  // ---------- ornament registers (drawn in surface coords u,v on the flat canvas) ----------
  function tongues(f, p, uL, uR, uStart) {
    const { C } = S, n = Math.round(C / 46), PT = C / n, i0 = Math.floor((uL + uStart) / PT) - 1, i1 = Math.ceil((uR + uStart) / PT) + 1;
    const y0 = -113;
    for (let i = i0; i <= i1; i++) {
      const id = ((i % n) + n) % n, u = i * PT - uStart;
      const j1 = hash2(id, 1, 7) - 0.5, j2 = hash2(id, 2, 7) - 0.5, j3 = hash2(id, 3, 7) - 0.5;
      const w = PT * 0.8 * (1 + j1 * 0.06), x = u + j3 * 1.6, y1 = -23 + j2 * 3, rr = w / 2;
      f.beginPath(); f.moveTo(x - w / 2 + j2, y0); f.lineTo(x - w / 2, y1 - rr); f.arc(x, y1 - rr, rr, Math.PI, 0, true); f.lineTo(x + w / 2 + j1, y0); f.closePath();
      if (p.line) {
        if (id % 2) { f.fillStyle = p.acc; f.globalAlpha *= 0.35; f.fill(); f.globalAlpha /= 0.35; }
        f.strokeStyle = p.ink; f.lineWidth = 1.4; f.stroke();
      } else { f.fillStyle = id % 2 ? p.acc : p.ink; f.fill(); }
    }
  }
  function lyre(f, x, y, h, col) {            // a small kithara held in front of the leader
    f.save(); f.strokeStyle = col; f.fillStyle = col; f.lineCap = 'round'; f.lineWidth = h * 0.028;
    f.beginPath(); f.moveTo(x - h * 0.08, y); f.quadraticCurveTo(x - h * 0.13, y - h * 0.16, x - h * 0.07, y - h * 0.27); f.stroke();
    f.beginPath(); f.moveTo(x + h * 0.08, y); f.quadraticCurveTo(x + h * 0.13, y - h * 0.16, x + h * 0.07, y - h * 0.27); f.stroke();
    f.beginPath(); f.moveTo(x - h * 0.09, y - h * 0.23); f.lineTo(x + h * 0.09, y - h * 0.23); f.stroke();
    f.beginPath(); f.ellipse(x, y + h * 0.01, h * 0.1, h * 0.045, 0, 0, Math.PI * 2); f.fill();
    f.lineWidth = h * 0.008; for (let k = -1; k <= 1; k++) { f.beginPath(); f.moveTo(x + k * h * 0.03, y); f.lineTo(x + k * h * 0.03, y - h * 0.23); f.stroke(); }
    f.restore();
  }
  // a choros: groups of six dancers hand in hand, each group led by a lyre player; they step on the beat in the choruses
  function choros(f, p, uL, uR, uStart, t, ground) {
    const { C } = S, NG = Math.round(C / 430), PG = C / NG, h = 86, d = 46;
    const k = danceK(t), beat = (MV().rawBeatOf || MV().beatOf)(t), drift = walked(t);
    const phase = beat / 2 + 0.25;
    const stand = { torso: 0, neck: 0, lArm: [52, 62], rArm: [-52, -62], lLeg: [4, 0], rLeg: [-4, -2] };
    const sw = 16 * Math.sin(Math.PI * beat);   // joined hands swing up and down, one swing per beat
    const walk = walkPose(phase, { lArm: [54 + sw, 66 + sw * 1.3], rArm: [-50 - sw, -62 - sw * 1.3], torso: 4 });
    const pose = lerpPose(stand, walk, k), bob = k * 1.6 * Math.abs(Math.cos(phase * Math.PI * 2));
    const leadStand = { torso: 0, neck: -4, lArm: [38, 95], rArm: [20, 80], lLeg: [4, 0], rLeg: [-4, -2] };
    const leadPose = lerpPose(leadStand, walkPose(phase, { lArm: [38, 95], rArm: [20, 80], torso: 2, neck: -6 }), k);
    const s0 = uL + uStart - drift, g0 = Math.floor(s0 / PG) - 1, g1 = Math.ceil((uR + uStart - drift) / PG) + 1;
    f.save(); f.fillStyle = p.ink; f.strokeStyle = p.ink;
    for (let gi = g0; gi <= g1; gi++) {
      const gid = ((gi % NG) + NG) % NG, gx = gi * PG + drift - uStart;
      if (gx + PG < uL - 60 || gx > uR + 60) continue;
      const hands = [];
      for (let j = 0; j < 6; j++) {
        const x = gx + 40 + j * d, woman = (j + gid) % 2 === 0, hh = h * (woman ? 0.97 : 1) * (1 + (hash2(gid, j, 3) - 0.5) * 0.04);
        const F = figure(x, ground - bob, hh, pose, 1);
        if (p.line) { f.fillStyle = woman ? p.acc : p.ink; }
        else f.fillStyle = p.ink;
        drawSilhouette(f, F, { chiton: woman, hair: woman ? 'long' : 'short', beard: !woman && j % 3 === 1 });
        if (woman && !p.line) {                  // added red on the women's dresses (black-figure habit)
          f.save(); f.fillStyle = p.acc; f.globalAlpha *= 0.9;
          const ank = [(F.legs.l[2][0] + F.legs.r[2][0]) / 2, Math.max(F.legs.l[2][1], F.legs.r[2][1])], sp = Math.abs(F.legs.l[2][0] - F.legs.r[2][0]) + 0.1 * hh;
          f.beginPath(); f.moveTo(F.hip[0] - 0.045 * hh, F.hip[1] + 0.02 * hh); f.lineTo(F.hip[0] + 0.045 * hh, F.hip[1] + 0.02 * hh);
          f.lineTo(ank[0] + sp / 2 - 0.03 * hh, ank[1] - 0.05 * hh); f.lineTo(ank[0] - sp / 2 + 0.03 * hh, ank[1] - 0.05 * hh); f.closePath(); f.fill(); f.restore();
          f.fillStyle = p.ink;
        }
        hands.push(F);
      }
      f.fillStyle = p.ink;
      for (let j = 0; j < 5; j++) {              // joined hands: back hand of dancer j (front arm) meets dancer j+1's back arm
        const a = hands[j].arms.l[2], b = hands[j + 1].arms.r[2];
        taper(f, a, b, h * 0.035, h * 0.035);
      }
      // the leader with a lyre, a little ahead of the line
      const lx = gx + 40 + 5 * d + 54, LF = figure(lx, ground - bob, h * 1.02, leadPose, 1);
      drawSilhouette(f, LF, { beard: true, chiton: true });
      lyre(f, LF.arms.l[2][0] + 3, LF.arms.l[2][1] + 4, h, p.ink);
    }
    f.restore();
  }
  function registers(f, name, alpha, uL, uR, uStart, vT, vB, t) {
    const p = PALS[name], BH = S.BH;
    f.save(); f.globalAlpha = alpha;
    // shoulder (above the frieze)
    if (vT < 0) {
      f.fillStyle = p.gl; f.fillRect(uL, vT, uR - uL, -vT);
      f.fillStyle = p.res; f.fillRect(uL, -9, uR - uL, 4.5); f.fillRect(uL, -127, uR - uL, 4.5);
      f.fillStyle = p.gr; f.fillRect(uL, -117, uR - uL, 103);
      if (name === 'red') { f.fillStyle = p.ink; f.fillRect(uL, -117, uR - uL, 3.5); f.fillRect(uL, -17.5, uR - uL, 3.5); }
      if (p.line) { f.fillStyle = p.ink; f.fillRect(uL, -117, uR - uL, 1.6); f.fillRect(uL, -15.6, uR - uL, 1.6); }
      else if (name === 'black') { f.fillStyle = p.ink; f.fillRect(uL, -117, uR - uL, 4); }
      tongues(f, p, uL, uR, uStart);
    }
    // body (below the frieze)
    if (vB > BH) {
      f.fillStyle = p.gl; f.fillRect(uL, BH, uR - uL, vB - BH);
      f.fillStyle = p.res; f.fillRect(uL, BH + 5, uR - uL, 4.5); f.fillRect(uL, BH + 139, uR - uL, 4.5);
      f.fillStyle = p.gr; f.fillRect(uL, BH + 14, uR - uL, 118);
      const ground = BH + 118;
      f.fillStyle = p.ink; f.fillRect(uL, ground, uR - uL, p.line ? 1.8 : 3.5);
      if (name === 'red') { f.fillRect(uL, BH + 14, uR - uL, 3.5); f.fillRect(uL, BH + 128.5, uR - uL, 3.5); }
      if (p.line) { f.fillRect(uL, BH + 14, uR - uL, 1.6); f.fillRect(uL, BH + 130.4, uR - uL, 1.6); }
      f.save(); f.beginPath(); f.rect(uL, BH + 16, uR - uL, 114); f.clip(); choros(f, p, uL, uR, uStart, t, ground); f.restore();
    }
    f.restore();
  }

  // draw a low-res surface map (width C/q, wrapping) over the flat canvas region [uL,uR] x [vT,vB]
  function drawWrapped(f, img, q, uL, uR, uStart, vT, vB) {
    const { C } = S; let s = ((uL + uStart) % C + C) % C, u = uL;
    vT = Math.max(vT, -TOPH); vB = Math.min(vB, S.BH + BOTH); if (vB <= vT) return;   // stay inside the map (out-of-range sources are very slow)
    const sy = (vT + TOPH) / q, sh = (vB - vT) / q;
    while (u < uR) {
      const run = Math.min(uR - u, C - s);
      f.drawImage(img, s / q, sy, run / q, sh, u, vT, run, vB - vT);
      u += run; s = 0;
    }
  }
  // wrap a surface position s into window coords if visible
  const vis = (s, uStart, uL, uR, pad) => { const C = S.C; let du = ((s - uStart - uL + pad) % C + C) % C; return du < uR - uL + 2 * pad ? uL - pad + du : null; };

  function surfaceWear(f, uL, uR, uStart, vT, vB, SS) {
    const { C, chips, scuffs, mends } = S;
    // chips: glaze flaked back to clay (lighten: shows on black, barely touches the clay)
    f.save(); f.globalCompositeOperation = 'lighten';
    f.fillStyle = '#94603f'; f.beginPath();
    for (const c of chips) {
      if (c.v < vT - 20 || c.v > vB + 20) continue;
      const u = vis(c.s, uStart, uL, uR, 20); if (u === null) continue;
      c.pts.forEach((q, i) => i ? f.lineTo(u + q[0], c.v + q[1]) : f.moveTo(u + q[0], c.v + q[1])); f.closePath();
    }
    f.fill();
    // a darker core in the bigger chips (the break is deeper there)
    f.globalCompositeOperation = 'source-over'; f.globalAlpha = 0.18; f.fillStyle = '#6a3418'; f.beginPath();
    for (const c of chips) {
      if (!c.big || c.v < vT - 20 || c.v > vB + 20) continue;
      const u = vis(c.s, uStart, uL, uR, 20); if (u === null) continue;
      c.pts.forEach((q, i) => i ? f.lineTo(u + q[0] * 0.55 + 0.8, c.v + q[1] * 0.55 + 0.8) : f.moveTo(u + q[0] * 0.55 + 0.8, c.v + q[1] * 0.55 + 0.8)); f.closePath();
    }
    f.fill();
    // scuffs: fine pale abrasion
    f.globalCompositeOperation = 'screen'; f.lineCap = 'round';
    for (const c of scuffs) {
      if (c.v < vT - 10 || c.v > vB + 10) continue;
      const u = vis(c.s, uStart, uL, uR, 90); if (u === null) continue;
      const dx = Math.cos(c.ang) * c.len, dy = Math.sin(c.ang) * c.len;
      f.globalAlpha = c.a; f.strokeStyle = '#f0d2b0'; f.lineWidth = c.w;
      f.beginPath(); f.moveTo(u, c.v); f.quadraticCurveTo(u + dx / 2 - dy * 0.1, c.v + dy / 2 + c.bend, u + dx, c.v + dy); f.stroke();
    }
    // the old mend: a hairline where the pot was once broken and rejoined
    for (const pts of mends) {
      for (const k of [-1, 0, 1]) {
        const off = k * C - uStart; const a = pts[0][0] + off, b = pts[pts.length - 1][0] + off;
        if (Math.max(a, b) < uL - 50 || Math.min(a, b) > uR + 50) continue;
        f.globalCompositeOperation = 'multiply'; f.globalAlpha = 0.28; f.strokeStyle = '#6b4a38'; f.lineWidth = 0.9;
        f.beginPath(); pts.forEach((q, i) => i ? f.lineTo(q[0] + off, q[1]) : f.moveTo(q[0] + off, q[1])); f.stroke();
        f.globalCompositeOperation = 'screen'; f.globalAlpha = 0.08; f.strokeStyle = '#e8c8a8'; f.lineWidth = 0.8;
        f.beginPath(); pts.forEach((q, i) => i ? f.lineTo(q[0] + off + 1.1, q[1] + 0.6) : f.moveTo(q[0] + off + 1.1, q[1] + 0.6)); f.stroke();
      }
    }
    f.restore();
  }

  // ---------- lighting maps (fixed to the cylinder's angle; cached per zoom) ----------
  function lightMaps(z, R) {
    if (Math.abs(S.light.z - z) < 1e-4) return S.light;
    const cx = W / 2, lw = 480, lh = 272, sx = (W + 2 * PX) / lw, sy = (H + 2 * PY) / lh;
    const mk = () => { const c = document.createElement('canvas'); c.width = lw; c.height = lh; return c; };
    const L = S.light.mul || mk(), Sp = S.light.spec || mk();
    const gl = L.getContext('2d'), gs = Sp.getContext('2d'), dl = gl.createImageData(lw, lh), ds = gs.createImageData(lw, lh);
    const g = (x, s) => Math.exp(-x * x / (2 * s * s));
    const band = (x, a, b, e) => sm(clamp((x - a) / e + 0.5)) * sm(clamp((b - x) / e + 0.5));
    for (let i = 0; i < lw; i++) {
      const X = -PX + (i + 0.5) * sx, x1 = cx + (X - cx) / z, th = Math.asin(clamp((x1 - cx) / R, -0.99, 0.99));
      const diff = 0.42 + 0.58 * Math.pow(Math.max(0, Math.cos(th + 0.5)), 1.4);
      // window reflection: two tall panes split by a mullion (angles in radians on the cylinder)
      // reflections: the faint cool glow of a screen somewhere off to the left, a small warm lamp glint, a soft sheen
      const wc = -0.36, glow = band(th, wc - 0.045, wc + 0.045, 0.03);
      const halo = g(th - wc, 0.12), lamp = g(th - 0.47, 0.02), sheenR = g(th - 0.62, 0.08);
      for (let j = 0; j < lh; j++) {
        const Y = -PY + (j + 0.5) * sy, yn = (Y - 555) / 640, k = (j * lw + i) * 4;
        const pool = 1 - 0.42 * yn * yn - 0.1 * Math.pow(Math.abs((X - 880) / 1100), 2.2);
        const m = clamp(diff * pool, 0, 1);
        dl.data[k] = 255 * m; dl.data[k + 1] = 248 * m; dl.data[k + 2] = 236 * m; dl.data[k + 3] = 255;
        // window: bright towards the top, crossbars at two heights, fading at the sill
        const Yw = Y / z + 540 * (1 - 1 / z);
        const cool = 0.065 * glow * band(Yw, 230, 600, 110) + 0.016 * halo;
        const warm = 0.035 * lamp * g(Yw - 300, 90) + 0.03 * sheenR;
        ds.data[k] = clamp(cool * 0.78 + warm) * 255; ds.data[k + 1] = clamp(cool * 0.9 + warm * 0.93) * 255; ds.data[k + 2] = clamp(cool + warm * 0.8) * 255; ds.data[k + 3] = 255;
      }
    }
    gl.putImageData(dl, 0, 0); gs.putImageData(ds, 0, 0);
    S.light = { z, mul: L, spec: Sp };
    return S.light;
  }


  // ---------- shared pieces of the per-frame pipeline ----------
  // colours of the lead's band per technique (for painting band rows the band window doesn't cover)
  const BANDC = { black: ['#c7672e', '#17110e'], white: ['#ece2cc', '#8c6a52'], red: ['#1a1310', '#c9703a'] };
  function bandFallback(f, a, b, uStart, pal, BH) {
    if (b <= a) return;
    const V = window.VASE, [clay, glz] = BANDC[pal] || BANDC.black;
    f.save(); f.beginPath(); f.rect(a, 0, b - a, BH); f.clip();
    f.fillStyle = clay; f.fillRect(a, 0, b - a, BH);
    if (V && V.meander && V.setPalette) {
      V.setPalette(pal);
      for (let T = Math.floor((a + uStart) / 2600); T <= Math.floor((b + uStart) / 2600); T++) { const x = T * 2600 - uStart; V.meander(f, x, x + 2600, 0, 70); V.meander(f, x, x + 2600, BH - 70, 70); }
      V.setPalette('black');
    }
    f.fillStyle = glz; f.fillRect(a, 70, b - a, 6); f.fillRect(a, BH - 76, b - a, 6); f.fillRect(a, 640, b - a, 9);
    f.restore();
  }
  const aux = new Map();                        // a same-sized scratch canvas per flat canvas (crossfade, blur)
  function auxOf(c) { let a = aux.get(c); if (!a) { a = document.createElement('canvas'); a.width = c.width; a.height = c.height; aux.set(c, a); } return a; }

  // horizontal motion blur of the flat strip: a box of length L (canvas px) built from repeated half-offset averages
  function blurFlat(Fc, w, h, L) {
    if (L < 2.5) return;
    let A = Fc, B = auxOf(Fc);
    for (let d = L / 2; d >= 1.2; d /= 2) {
      const b = B.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'copy'; b.globalAlpha = 1; b.drawImage(A, 0, 0, w, h, -d / 2, 0, w, h);
      b.globalCompositeOperation = 'source-over'; b.globalAlpha = 0.5; b.drawImage(A, 0, 0, w, h, d / 2, 0, w, h);
      [A, B] = [B, A];
    }
    if (A !== Fc) { const f = Fc.getContext('2d'); f.save(); f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'copy'; f.globalAlpha = 1; f.drawImage(A, 0, 0, w, h, 0, 0, w, h); f.restore(); }
  }

  // compose the unrolled surface over [uL,uR] x [vT,vB] (band coords) into canvas Fc at scale fs
  function composeFlat(Fc, fs, uL, uR, vT, vB, P, pot) {
    const { band, SS, WIN, BH, t = 0, u0 = 0 } = P, uStart = u0 - WIN / 2;
    const [pa, pb, pw] = P.palBlend || palAt(t);
    const f = Fc.getContext('2d');
    const setT = g => g.setTransform(fs, 0, 0, fs, -uL * fs, -vT * fs);
    setT(f); f.globalAlpha = 1; f.globalCompositeOperation = 'source-over'; f.imageSmoothingEnabled = true;
    const paintTech = (g, name) => { registers(g, name, 1, uL, uR, uStart, vT, vB, t); if (pot) potZones(g, name, uL, uR, uStart, vT, vB); };
    paintTech(f, pa);
    const w = Math.ceil((uR - uL) * fs), h = Math.ceil((vB - vT) * fs);
    if (pw > 0.001 && pb !== pa) {          // crossfade the registers exactly: paint the second technique apart, then blend it in
      const F2 = auxOf(Fc), f2 = F2.getContext('2d'); f2.setTransform(1, 0, 0, 1, 0, 0); f2.clearRect(0, 0, w + 2, h + 2); setT(f2);
      paintTech(f2, pb);
      f.save(); f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = pw; f.drawImage(F2, 0, 0, w, h, 0, 0, w, h); f.restore();
    }
    // the band (and plain clay + borders where the painted window doesn't reach)
    const a = Math.max(uL, 0), b = Math.min(uR, WIN);
    if (b > a) f.drawImage(band, a * SS, 0, (b - a) * SS, BH * SS, a, 0, b - a, BH);
    const fbPal = pw > 0.5 ? pb : pa;
    bandFallback(f, uL, Math.min(uR, 0), uStart, fbPal, BH); bandFallback(f, Math.max(uL, WIN), uR, uStart, fbPal, BH);
    // clay grain on the register grounds, moving with the pot
    const pat = f.createPattern(S.grain, 'repeat'); pat.setTransform(new DOMMatrix().translate(-(((uStart % 256) + 256) % 256), 0));
    f.save(); f.globalCompositeOperation = 'soft-light'; f.globalAlpha = 0.55; f.fillStyle = pat;
    if (vT < -14) f.fillRect(uL, Math.max(vT, -118), uR - uL, -14 - Math.max(vT, -118));
    if (vB > BH + 14) f.fillRect(uL, BH + 14, uR - uL, Math.min(vB, BH + 132) - BH - 14);
    if (pot) for (const [z0, z1] of POT.grounds) if (z1 > vT && z0 < vB) f.fillRect(uL, Math.max(z0, vT), uR - uL, Math.min(z1, vB) - Math.max(z0, vT));
    // firing variation over everything, brownish misfire in the black, throwing rings
    f.globalAlpha = 0.85; drawWrapped(f, S.fire, S.q, uL, uR, uStart, vT, vB);
    f.globalCompositeOperation = 'screen'; f.globalAlpha = 1; drawWrapped(f, S.mis, S.q, uL, uR, uStart, vT, vB);
    f.globalCompositeOperation = 'soft-light'; f.globalAlpha = 0.8;
    { const ra = Math.max(vT, -TOPH), rb = Math.min(vB, BH + BOTH); if (rb > ra) f.drawImage(S.rings, 0, ra + TOPH, 1, rb - ra, uL, ra, uR - uL, rb - ra); }
    f.restore();
    surfaceWear(f, uL, uR, uStart, vT, vB, fs);
    // motion blur on fast turns (everything fixed to the pot smears; light and air stay sharp)
    blurFlat(Fc, Math.min(w, Fc.width), Math.min(h, Fc.height), Math.min(250, P.blurPx || 0) * fs);
  }
  const blurMargin = P => Math.min(250, P.blurPx || 0) / 2 + 4;

  function breath(t) {                          // breathing camera (slow, never quite repeating)
    const bx = 7 * Math.sin(t * 0.113 + 1.3) + 3 * Math.sin(t * 0.271 + 0.4), by = 4 * Math.sin(t * 0.089 + 2.1) + 1.5 * Math.sin(t * 0.197);
    const rot = 0.0013 * Math.sin(t * 0.061 + 0.7) + 0.0005 * Math.sin(t * 0.143), bsc = 1.009 + 0.004 * Math.sin(t * 0.047 + 2.0);
    return { bx, by, rot, bsc };
  }
  function screenBuf() {
    const scr = S.scr || (S.scr = Object.assign(document.createElement('canvas'), { width: W + 2 * PX, height: H + 2 * PY }));
    return [scr, S.scrCtx || (S.scrCtx = scr.getContext('2d'))];
  }
  function blitBreathing(ctx, scr, t) {         // one smooth resample of the whole buffer
    const { bx, by, rot, bsc } = breath(t), cx = W / 2;
    ctx.save();
    const cc = Math.cos(rot) * bsc, ss = Math.sin(rot) * bsc;
    ctx.setTransform(cc, ss, -ss, cc, cx + bx - cc * cx + ss * 540, 540 + by - ss * cx - cc * 540);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(scr, -PX, -PY);
    ctx.restore();
  }
  function air(ctx, t, fac = 1) {                        // a faint beam and dust motes (screen space; fade out as the camera pulls back at the end)
    const airA = (1 - sm(clamp((t - 358.6) / 1.6))) * fac;
    if (airA <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = airA;
    ctx.save(); ctx.translate(380, -60); ctx.rotate(-0.55);
    const bw = 520, bl = 1500, bm = ctx.createLinearGradient(-bw, 0, bw, 0);
    bm.addColorStop(0, 'rgba(255,236,205,0)'); bm.addColorStop(0.5, 'rgba(255,236,205,0.045)'); bm.addColorStop(1, 'rgba(255,236,205,0)');
    ctx.fillStyle = bm; ctx.fillRect(-bw, 0, bw * 2, bl);
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of S.motes) {
      const span = W + 300, spanY = H + 300;
      let x = ((m.x * span + t * m.vx * (0.5 + m.d)) % span + span) % span - 150;
      let y = ((m.y * spanY + t * m.vy * (0.5 + m.d)) % spanY + spanY) % spanY - 150;
      x += (noise2(t * 0.07, m.ph, 71) - 0.5) * 60; y += (noise2(m.ph, t * 0.06, 73) - 0.5) * 40;
      const dist = ((x - 380) * 0.85 - (y - 0) * 0.52), beam = Math.exp(-dist * dist / (2 * 330 * 330));
      const tw = 0.7 + 0.3 * Math.sin(t * m.tw + m.ph);
      const size = 2.2 + m.d * 20, alpha = (0.45 - m.d * 0.36) * beam * tw * airA;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha; ctx.drawImage(S.mote, x - size, y - size, size * 2, size * 2);
    }
    ctx.restore();
  }

  // ================= close-up: the belly as a cylinder =================
  function wrap(ctx, P) {
    if (!S || S.R !== P.R) init(P);
    const { SS, WIN, BH, R, z = 1, fy = 540, t = 0 } = P;
    const cx = W / 2, K = BH0 / BH;
    // per-column mapping (screen x in pre-breathing coords -> surface u, and a linear map v -> screen y)
    const X0 = -PX, X1 = W + PX, ncol = X1 - X0 + 1, cols = S.cols || (S.cols = new Float64Array(ncol * 5));
    let uL = 1e9, uR = -1e9, vT = 1e9, vB = -1e9;
    for (let c = 0; c < ncol; c++) {
      const X = X0 + c, x1 = cx + (X - cx) / z, th = Math.asin(clamp((x1 - cx) / R, -0.99, 0.99));
      const u = WIN / 2 + R * th, s = CAMD / (CAMD + R * (1 - Math.cos(th)));
      const b = K * s * z, a = fy + (EYE + (TOP0 - EYE) * s - fy) * z;
      const va = Math.max(-TOPH, (-PY - a) / b), vb = Math.min(BH + BOTH, (H + PY - a) / b);
      const o = c * 5; cols[o] = u; cols[o + 1] = a; cols[o + 2] = b; cols[o + 3] = va; cols[o + 4] = vb;
      uL = Math.min(uL, u); uR = Math.max(uR, u); vT = Math.min(vT, va); vB = Math.max(vB, vb);
    }
    const mg = blurMargin(P);
    uL = Math.floor(uL - 2 - mg); uR = Math.ceil(uR + 3 + mg); vT = Math.floor(vT); vB = Math.ceil(vB);
    const fs = (P.blurPx || 0) > 24 ? 1 : SS;   // while smeared, fine detail is invisible: compose at 1x (much cheaper)
    uR = Math.min(uR, uL + S.F.width / fs - 2);
    // ---- 1. flat composition in surface coords ----
    composeFlat(S.F, fs, uL, uR, vT, vB, P, false);
    // ---- 2. map onto the cylinder (into an unrotated screen buffer, so column sampling stays even) ----
    const [scr, g] = screenBuf();
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#0b0807'; g.fillRect(0, 0, scr.width, scr.height);
    g.setTransform(1, 0, 0, 1, PX, PY); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    const CW = 3, F = S.F;                      // strip width: the mapping is locally linear, so 3 px strips are exact enough
    for (let c = 0; c + CW < ncol; c += CW) {
      const o = c * 5, u = cols[o], a = cols[o + 1], b = cols[o + 2], va = cols[o + 3], vb = cols[o + 4], un = cols[o + 5 * CW];
      g.drawImage(F, (u - uL) * fs, (va - vT) * fs, (un - u) * fs, (vb - va) * fs, X0 + c, a + b * va, CW + 0.25, b * (vb - va));
    }
    // ---- 3. light (maps fixed to the cylinder's angle) ----
    const Lm = lightMaps(z, R);
    g.globalCompositeOperation = 'multiply'; g.drawImage(Lm.mul, -PX, -PY, W + 2 * PX, H + 2 * PY);
    g.globalCompositeOperation = 'screen'; g.drawImage(Lm.spec, -PX, -PY, W + 2 * PX, H + 2 * PY);
    g.globalCompositeOperation = 'source-over';
    blitBreathing(ctx, scr, t);
    air(ctx, t);
  }

  // ================= whole-pot mode (the ending pull-back) =================
  // Profile of a neck-amphora as (height y, radius r) in close-up screen units: y is where that height sits on screen at
  // zoom 1 (the frieze runs y = 170..910), r is the radius (belly = 1700 = the close-up cylinder).
  const PROF = [[-1900, 760], [-1860, 805], [-1790, 810], [-1745, 720], [-1690, 628], [-1400, 600], [-1100, 618], [-985, 650], [-955, 715], [-925, 700],
    [-860, 790], [-660, 1090], [-430, 1370], [-210, 1565], [0, 1668], [170, 1702], [540, 1716], [910, 1696], [1150, 1630], [1500, 1455],
    [1850, 1190], [2150, 930], [2390, 690], [2510, 565], [2575, 520], [2615, 560], [2655, 800], [2695, 875], [2775, 880], [2800, 852]];
  const POT_Y0 = -1900, POT_Y1 = 2800, SC1 = 0.092;   // SC1: final scale, so the pot is ~40% of screen height
  let POT = null;
  function buildPot(BH) {
    const K = BH0 / BH, n = POT_Y1 - POT_Y0 + 1, rY = new Float64Array(n), sY = new Float64Array(n);
    let seg = 0;
    for (let i = 0; i < n; i++) {                // Hermite spline through the profile points (tangents scaled for uneven spacing)
      const y = POT_Y0 + i;
      while (seg < PROF.length - 2 && y > PROF[seg + 1][0]) seg++;
      const p1 = PROF[seg], p2 = PROF[seg + 1], p0 = PROF[Math.max(0, seg - 1)], p3 = PROF[Math.min(PROF.length - 1, seg + 2)];
      const dy = p2[0] - p1[0], tt = clamp((y - p1[0]) / dy);
      const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * dy, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * dy;
      const t2 = tt * tt, t3 = t2 * tt;
      rY[i] = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + tt) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    }
    for (let i = 1; i < n; i++) sY[i] = sY[i - 1] + Math.hypot(1, rY[i] - rY[i - 1]);
    const s170 = sY[170 - POT_Y0], vOf = i => (sY[i] - s170) / K;
    const vMin = Math.ceil(vOf(0)), vMax = Math.floor(vOf(n - 1)), len = vMax - vMin + 1;
    const yV = new Float64Array(len), rV = new Float64Array(len), dV = new Float64Array(len);
    let i = 0;
    for (let j = 0; j < len; j++) {
      const v = vMin + j;
      while (i < n - 2 && vOf(i + 1) < v) i++;
      const fr = clamp((v - vOf(i)) / (vOf(i + 1) - vOf(i)));
      yV[j] = POT_Y0 + i + fr; rV[j] = lerp(rY[i], rY[i + 1], fr); dV[j] = rY[i + 1] - rY[i];
    }
    // mesh rows: denser where the profile turns
    const breaks = [vMin]; let last = vMin, ang0 = Math.atan(dV[0]);
    for (let j = 1; j < len; j++) {
      const a = Math.atan(dV[j]);
      if (Math.abs(a - ang0) > 0.04 || j + vMin - last >= 60) { breaks.push(vMin + j); last = vMin + j; ang0 = a; }
    }
    if (last !== vMax) breaks.push(vMax);
    const vY = y => { let lo = 0, hi = len - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (yV[md] < y) lo = md; else hi = md; } return vMin + lo; };
    // decorated zones (v ranges): neck panel, rays above the foot, reserved lines
    const Z = { lipLine: vY(-1765), neckT: vY(-1585), neckB: vY(-1105), ridge: vY(-955), raysT: vY(1640), raysB: vY(2400), foot: vY(2688),
      // reserved ornament zones added in whole-pot mode (kept outside the rows the close-up ever shows: v > -250 and v < BH + 240)
      tongT: vY(-915), palT: -640, eggT: -352, eggH: 84, keyT: BH + 252, keyH: 84, footT: vY(2702), footB: vY(2772) };
    Z.tongB = Z.tongT + 118;
    POT = { vMin, vMax, len, yV, rV, dV, breaks, Z, grounds: [[Z.neckT + 9, Z.neckB - 9], [Z.raysT + 9, Z.raysB], [Z.tongT, Z.tongB], [Z.palT, Z.eggT], [Z.eggT, Z.eggT + Z.eggH], [Z.keyT, Z.keyT + Z.keyH], [Z.footT, Z.footB]] };
  }
  const potGeo = (v, m, R) => {                 // radius, height, slope dr/dy at surface row v, morphed from the cylinder (m=0)
    const P = POT, x = clamp(v - P.vMin, 0, P.len - 1.001), j = Math.floor(x), f = x - j;
    const rA = lerp(P.rV[j], P.rV[j + 1], f) * R / 1700, yA = lerp(P.yV[j], P.yV[j + 1], f), dA = P.dV[j] * R / 1700;
    return [lerp(R, rA, m), lerp(TOP0 + v * BH0 / S.BH, yA, m), dA * m];
  };

  function palmette(f, h, p, name) {           // local coords: base at (0,0), growing up
    const fill = (c) => { if (p.line) { f.strokeStyle = p.ink; f.lineWidth = h * 0.012; f.stroke(); } else { f.fillStyle = c; f.fill(); } };
    for (let k = 0; k < 9; k++) {
      const a = (k - 4) / 4 * 1.2, L = h * (0.5 + 0.34 * Math.cos(a * 1.1)), w = h * 0.075;
      f.save(); f.translate(0, -h * 0.16); f.rotate(a);
      f.beginPath(); f.moveTo(0, -h * 0.06);
      f.bezierCurveTo(w, -h * 0.06 - L * 0.3, w * 0.9, -h * 0.06 - L * 0.92, 0, -h * 0.06 - L);
      f.bezierCurveTo(-w * 0.9, -h * 0.06 - L * 0.92, -w, -h * 0.06 - L * 0.3, 0, -h * 0.06);
      fill(k % 2 && name === 'black' ? p.acc : p.ink); f.restore();
    }
    f.beginPath(); f.arc(0, -h * 0.15, h * 0.085, Math.PI, 0); f.lineTo(h * 0.085, -h * 0.08); f.lineTo(-h * 0.085, -h * 0.08); f.closePath(); fill(p.ink);
    f.strokeStyle = p.ink; f.lineWidth = h * 0.028; f.lineCap = 'round';
    for (const s of [-1, 1]) { f.beginPath(); f.arc(s * h * 0.15, -h * 0.07, h * 0.065, s > 0 ? Math.PI * 0.9 : Math.PI * 0.1, s > 0 ? Math.PI * 2.4 : -Math.PI * 1.4, s < 0); f.stroke(); }
  }
  function lotus(f, h, p, name) {
    const fill = (c) => { if (p.line) { f.strokeStyle = p.ink; f.lineWidth = h * 0.012; f.stroke(); } else { f.fillStyle = c; f.fill(); } };
    f.beginPath(); f.moveTo(-h * 0.07, -h * 0.02); f.lineTo(h * 0.07, -h * 0.02); f.lineTo(h * 0.1, -h * 0.16); f.lineTo(-h * 0.1, -h * 0.16); f.closePath(); fill(p.ink);
    f.beginPath(); f.moveTo(0, -h * 0.16); f.bezierCurveTo(h * 0.11, -h * 0.4, h * 0.07, -h * 0.72, 0, -h * 0.84); f.bezierCurveTo(-h * 0.07, -h * 0.72, -h * 0.11, -h * 0.4, 0, -h * 0.16); fill(name === 'black' ? p.acc : p.ink);
    for (const s of [-1, 1]) {
      f.beginPath(); f.moveTo(s * h * 0.06, -h * 0.15);
      f.bezierCurveTo(s * h * 0.26, -h * 0.28, s * h * 0.32, -h * 0.52, s * h * 0.4, -h * 0.68);
      f.bezierCurveTo(s * h * 0.22, -h * 0.5, s * h * 0.14, -h * 0.32, s * h * 0.02, -h * 0.22); f.closePath(); fill(p.ink);
    }
  }
  // extra zones painted only in whole-pot mode: lip line, neck panel with a palmette-lotus chain, rays above the foot
  function potZones(f, name, uL, uR, uStart, vT, vB) {
    const p = PALS[name], Z = POT.Z, C = S.C, w = uR - uL;
    const line = (v, hgt, col) => { if (v + hgt > vT && v < vB) { f.fillStyle = col; f.fillRect(uL, v, w, hgt); } };
    line(Z.lipLine, 5, p.res); line(Z.ridge - 3, 5, p.res); line(Z.foot, 5, p.res);
    // neck panel
    if (Z.neckB > vT && Z.neckT < vB) {
      line(Z.neckT, 4.5, p.res); line(Z.neckB - 4.5, 4.5, p.res);
      f.fillStyle = p.gr; f.fillRect(uL, Z.neckT + 9, w, Z.neckB - Z.neckT - 18);
      if (name !== 'black') { line(Z.neckT + 9, p.line ? 1.6 : 3.5, p.ink); line(Z.neckB - 9 - (p.line ? 1.6 : 3.5), p.line ? 1.6 : 3.5, p.ink); }
      const sx = 1700 / 610, n = Math.round(C / (420 * sx)), PP = C / n, base = Z.neckB - 26, hh = (Z.neckB - Z.neckT) * 0.72;
      f.save(); f.beginPath(); f.rect(uL, Z.neckT + 9, w, Z.neckB - Z.neckT - 18); f.clip();
      for (let i = Math.floor((uL + uStart) / PP) - 1; i <= Math.ceil((uR + uStart) / PP) + 1; i++) {
        const x = i * PP - uStart;
        f.save(); f.translate(x, base); f.scale(sx, 1); palmette(f, hh, p, name); f.restore();
        f.save(); f.translate(x + PP / 2, base); f.scale(sx, 1); lotus(f, hh * 0.9, p, name); f.restore();
        // the linking tendrils: a garland dipping between each palmette and lotus
        f.save(); f.strokeStyle = p.ink; f.lineWidth = hh * 0.025; f.beginPath();
        f.moveTo(x + 0.15 * hh * sx, base - hh * 0.07); f.bezierCurveTo(x + PP * 0.2, base + hh * 0.06, x + PP * 0.3, base + hh * 0.06, x + PP / 2 - 0.08 * hh * sx, base - hh * 0.04);
        f.moveTo(x + PP / 2 + 0.08 * hh * sx, base - hh * 0.04); f.bezierCurveTo(x + PP * 0.7, base + hh * 0.06, x + PP * 0.8, base + hh * 0.06, x + PP - 0.15 * hh * sx, base - hh * 0.07);
        f.stroke(); f.restore();
      }
      f.restore();
    }
    // rays rising from the foot
    // (subsidiary ornament stays black-on-reserved-clay even on red-figure pots, so in both techniques these zones are clay)
    const orn = p.line ? p.ink : p.gl;
    if (Z.raysB > vT && Z.raysT < vB) {
      line(Z.raysT, 4.5, p.res);
      f.fillStyle = p.line ? p.gr : p.res; f.fillRect(uL, Z.raysT + 9, w, Z.raysB - Z.raysT - 9);
      if (p.line) line(Z.raysT + 9, 1.6, p.ink);
      const n = 40, PR = C / n;
      for (let i = Math.floor((uL + uStart) / PR) - 1; i <= Math.ceil((uR + uStart) / PR) + 1; i++) {
        const x = i * PR - uStart, id = ((i % n) + n) % n, j = (hash2(id, 5, 9) - 0.5);
        f.beginPath(); f.moveTo(x - PR * 0.36, Z.raysB); f.lineTo(x + j * 6, Z.raysT + 26 + j * 10); f.lineTo(x + PR * 0.36, Z.raysB); f.closePath();
        if (p.line) { f.strokeStyle = p.ink; f.lineWidth = 1.6; f.stroke(); } else { f.fillStyle = orn; f.fill(); }
      }
    }
    const reps = (PU) => [Math.floor((uL + uStart) / PU) - 1, Math.ceil((uR + uStart) / PU) + 1];
    // tongues hanging from the base of the neck onto the shoulder (black and added red on clay)
    if (Z.tongB > vT && Z.tongT < vB) {
      f.fillStyle = p.res; f.fillRect(uL, Z.tongT, w, Z.tongB - Z.tongT);
      f.fillStyle = orn; f.fillRect(uL, Z.tongT, w, 7);
      const n = 72, PT = C / n, [i0, i1] = reps(PT), tw = PT * 0.74, y0 = Z.tongT + 7, y1 = Z.tongB - 12;
      for (let i = i0; i <= i1; i++) {
        const id = ((i % n) + n) % n, x = i * PT - uStart + (hash2(id, 4, 7) - 0.5) * 3, rr = tw / 2;
        f.beginPath(); f.moveTo(x - rr, y0); f.lineTo(x - rr, y1 - rr * 0.9); f.ellipse(x, y1 - rr * 0.9, rr, rr * 0.9, 0, Math.PI, 0, true); f.lineTo(x + rr, y0); f.closePath();
        if (p.line) { f.strokeStyle = p.ink; f.lineWidth = 1.6; f.stroke(); } else { f.fillStyle = name === 'black' && id % 2 ? p.acc : orn; f.fill(); }
      }
    }
    // a palmette-lotus chain on the shoulder (black on clay, added red in black-figure), standing on the egg-and-dart
    if (Z.eggT > vT && Z.palT < vB) {
      const v0 = Z.palT, hz = Z.eggT - Z.palT, hh = hz * 0.66, base = Z.eggT - hz * 0.08, sx = 1700 / 1330;
      f.fillStyle = p.res; f.fillRect(uL, v0, w, hz);
      f.fillStyle = orn; f.fillRect(uL, v0, w, p.line ? 1.6 : 7);
      const q = { ink: orn, acc: name === 'black' ? p.acc : orn, line: p.line }, n = Math.round(C / (250 * sx)), PP = C / n, [i0, i1] = reps(PP);
      f.save(); f.beginPath(); f.rect(uL, v0 + 7, w, hz - 7); f.clip();
      for (let i = i0; i <= i1; i++) {
        const x = i * PP - uStart;
        f.save(); f.translate(x, base); f.scale(sx, 1); palmette(f, hh, q, 'black'); f.restore();
        f.save(); f.translate(x + PP / 2, base); f.scale(sx, 1); lotus(f, hh * 0.9, q, 'black'); f.restore();
        f.save(); f.strokeStyle = orn; f.lineWidth = hh * 0.03; f.beginPath();
        f.moveTo(x + 0.15 * hh * sx, base - hh * 0.07); f.bezierCurveTo(x + PP * 0.2, base + hh * 0.06, x + PP * 0.3, base + hh * 0.06, x + PP / 2 - 0.08 * hh * sx, base - hh * 0.04);
        f.moveTo(x + PP / 2 + 0.08 * hh * sx, base - hh * 0.04); f.bezierCurveTo(x + PP * 0.7, base + hh * 0.06, x + PP * 0.8, base + hh * 0.06, x + PP - 0.15 * hh * sx, base - hh * 0.07);
        f.stroke(); f.restore();
      }
      f.restore();
    }
    // egg-and-dart on the upper shoulder, a little above the frieze's own tongue register
    if (Z.eggT + Z.eggH > vT && Z.eggT < vB) {
      const v0 = Z.eggT, h = Z.eggH;
      f.fillStyle = p.res; f.fillRect(uL, v0, w, h);
      f.fillStyle = orn; f.fillRect(uL, v0, w, h * 0.1); f.fillRect(uL, v0 + h - h * 0.06, w, h * 0.06);
      const n = 140, PE = C / n, [i0, i1] = reps(PE), cy = v0 + h * 0.5, rx = PE * 0.27, ry = h * 0.34;
      f.strokeStyle = orn; f.fillStyle = orn; f.lineWidth = h * 0.075;
      for (let i = i0; i <= i1; i++) {
        const x = i * PE - uStart;
        f.beginPath(); f.moveTo(x - rx - h * 0.05, v0 + h * 0.1); f.ellipse(x, cy, rx + h * 0.05, ry + h * 0.08, 0, Math.PI, 0, true); f.lineTo(x + rx + h * 0.05, v0 + h * 0.1); f.stroke();   // the shell
        f.beginPath(); f.ellipse(x, cy + h * 0.03, rx * 0.66, ry * 0.8, 0, 0, Math.PI * 2); if (p.line) f.stroke(); else f.fill();          // the egg
        const xd = x + PE / 2;                                                                                                             // the dart
        f.beginPath(); f.moveTo(xd, v0 + h * 0.1); f.lineTo(xd, v0 + h * 0.72); f.stroke();
        f.beginPath(); f.moveTo(xd - h * 0.07, v0 + h * 0.66); f.lineTo(xd, v0 + h * 0.86); f.lineTo(xd + h * 0.07, v0 + h * 0.66); f.closePath(); f.fill();
      }
    }
    // a running key below the dancers (the same key as the frieze borders, black on clay)
    if (Z.keyT + Z.keyH > vT && Z.keyT < vB) {
      const v0 = Z.keyT, h = Z.keyH, m = h * 0.14;
      f.fillStyle = p.res; f.fillRect(uL, v0, w, h);
      const n = Math.round(C / (h * 0.8)), PU = C / n, [i0, i1] = reps(PU);
      f.strokeStyle = orn; f.lineWidth = h * (p.line ? 0.05 : 0.12); f.lineCap = 'butt'; f.lineJoin = 'miter';
      f.beginPath(); f.moveTo(uL, v0 + h * 0.03); f.lineTo(uR, v0 + h * 0.03); f.moveTo(uL, v0 + h - m); f.lineTo(uR, v0 + h - m); f.stroke();
      f.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = i * PU - uStart;
        f.moveTo(x, v0 + h - m); f.lineTo(x, v0 + m + h * 0.03); f.lineTo(x + PU * 0.8, v0 + m + h * 0.03); f.lineTo(x + PU * 0.8, v0 + h * 0.66);
        f.lineTo(x + PU * 0.35, v0 + h * 0.66); f.lineTo(x + PU * 0.35, v0 + h * 0.4);
      }
      f.stroke();
    }
    // the outer face of the foot left in clay
    if (Z.footB > vT && Z.footT < vB) { f.fillStyle = p.res; f.fillRect(uL, Z.footT, w, Z.footB - Z.footT); }
  }

  // WebGL for the whole-pot body: a fine textured mesh over (angle, surface row), lit per pixel with the same key light,
  // spotlight pool and reflections as the close-up maps, using the true surface normal (the shoulder catches the light,
  // the underside falls into shade)
  const VS = `attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aG; uniform vec2 uRes;
    varying vec2 vUV; varying vec4 vG;
    void main() { vUV = aUV; vG = aG; gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0); }`;
  const FS = `precision highp float;
    varying vec2 vUV; varying vec4 vG;   // vG = (angle th, height y, radius r, slope dr/dy)
    uniform sampler2D uTex; uniform float uKs, uSig, uYc, uXs;
    float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
    float bnd(float x, float a, float b, float e) { return sm((x - a) / e + 0.5) * sm((b - x) / e + 0.5); }
    float gs(float x, float s) { return exp(-x * x / (2.0 * s * s)); }
    void main() {
      vec3 c = texture2D(uTex, vUV).rgb;
      float th = vG.x, y = vG.y, r = vG.z, nr = inversesqrt(1.0 + vG.w * vG.w), ny = -vG.w * nr;
      float c5 = cos(th + 0.5), sn = sin(th);
      float dt = (0.94 * nr * c5 - 0.34 * ny) / 0.94;
      float diff = 0.42 + 0.58 * pow(max(0.0, dt), 1.4);
      float pool = max(0.3, 1.0 - 0.42 * pow((y - uYc) / uSig, 2.0) - 0.1 * pow(abs((r * sn + 80.0) / uXs), 2.2));
      // the black glaze is what shines; reserved clay is nearly matte (its sheen is a burnish, much weaker)
      float glz = 1.0 - sm((max(c.r, max(c.g, c.b)) - 0.16) / 0.22), gloss = mix(0.35, 1.0, glz);
      c *= clamp(diff * pool, 0.0, 1.0) * vec3(1.0, 0.9725, 0.9255);
      // reflections follow the whole body as the camera pulls back (at k=0 they match the close-up's maps exactly):
      // the screen's glow runs the full height of the pot, fading where the surface tilts away (shoulder, underside)
      float wc = -0.36, fl = gs(ny, mix(0.3, 0.5, uKs));
      float wT = mix(230.0, -1750.0, uKs), wB = mix(600.0, 2450.0, uKs), wE = mix(110.0, 420.0, uKs);
      float cool = (0.065 * bnd(th, wc - 0.045, wc + 0.045, 0.03) * bnd(y, wT, wB, wE) + 0.016 * gs(th - wc, 0.12)) * fl
        + 0.05 * pow(max(0.0, -sn), 10.0) * uKs;
      float warm = (0.035 * gs(th - 0.47, 0.02) * gs(y - mix(300.0, -260.0, uKs), mix(90.0, 260.0, uKs)) + 0.03 * gs(th - 0.62, 0.08)) * fl
        + 0.06 * pow(max(0.0, -ny), 1.5) * (0.5 + 0.5 * c5);
      vec3 sp = clamp((cool * vec3(0.78, 0.9, 1.0) + warm * vec3(1.0, 0.93, 0.8)) * gloss, 0.0, 1.0);
      gl_FragColor = vec4(1.0 - (1.0 - c) * (1.0 - sp), 1.0);
    }`;
  function potGL() {
    if (S.gl) return S.gl;
    const c = Object.assign(document.createElement('canvas'), { width: W + 2 * PX, height: H + 2 * PY });
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, premultipliedAlpha: true });
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const L = n => gl.getAttribLocation(pr, n), U = n => gl.getUniformLocation(pr, n);
    const vb = gl.createBuffer(), ib = gl.createBuffer(), tex = gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const st = 8 * 4;
    gl.enableVertexAttribArray(L('aPos')); gl.vertexAttribPointer(L('aPos'), 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(L('aUV')); gl.vertexAttribPointer(L('aUV'), 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(L('aG')); gl.vertexAttribPointer(L('aG'), 4, gl.FLOAT, false, st, 16);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(U('uTex'), 0); gl.viewport(0, 0, c.width, c.height);
    S.gl = { c, gl, U: { res: U('uRes'), ks: U('uKs'), sig: U('uSig'), yc: U('uYc'), xs: U('uXs') } };
    return S.gl;
  }

  // The camera pulls back from the close-up (k=0, identical to wrap) to the whole pot standing in a lit niche (k=1).
  function renderPot(ctx, P, k) {
    k = clamp(k);
    if (k < 1e-4) return wrap(ctx, P);
    if (!S || S.R !== P.R) init(P);
    const { WIN, BH, R, t = 0, u0 = 0 } = P;
    if (!POT) buildPot(BH);
    const cx = W / 2, ks = sm(k), m = sm(clamp(k / 0.3)), sc = Math.exp(Math.log(SC1) * k), el = 0.16 * ks, sel = Math.sin(el);
    const Pf = lerp(540, 450, ks), Ys = 540 + 20 * ks;
    const sPers = zc => lerp(CAMD / (CAMD + R - zc), 1, ks);
    const projY = (y, zc) => Ys + sc * (EYE + (y - EYE) * sPers(zc) + zc * sel - Pf);
    // visible ranges
    const thLim = Math.asin(clamp((W / 2 + PX) / (sc * R * 1.01), 0, 1)), thL = -thLim, thR = thLim;
    let vT = 1e9, vB = -1e9;
    for (let v = POT.vMin; v <= POT.vMax; v += 8) {
      const [r, y] = potGeo(v, m, R);
      const ya = projY(y, r), yb = projY(y, r * Math.cos(thLim));
      if (Math.max(ya, yb) > -PY - 30 && Math.min(ya, yb) < H + PY + 30) { vT = Math.min(vT, v - 8); vB = Math.max(vB, v + 8); }
    }
    vT = Math.max(POT.vMin, Math.floor(vT)); vB = Math.min(POT.vMax, Math.ceil(vB));
    const mg = blurMargin(P);
    const uL = Math.floor(WIN / 2 + R * thL - 3 - mg), uR = Math.ceil(WIN / 2 + R * thR + 3 + mg);
    const fs = Math.min(P.SS, sc * 1.3, 4000 / (uR - uL), 4000 / (vB - vT));
    const FP = S.FP || (S.FP = document.createElement('canvas'));   // sized to what's needed (rounded), so the texture upload stays small
    const fw = Math.ceil((uR - uL) * fs / 128) * 128 + 128, fh = Math.ceil((vB - vT) * fs / 128) * 128 + 128;
    if (FP.width < fw || FP.height < fh) { FP.width = Math.max(FP.width, fw); FP.height = Math.max(FP.height, fh); const fw2 = FP.width, fh2 = FP.height; const ax = aux.get(FP); if (ax) { ax.width = fw2; ax.height = fh2; } }
    // ---- flat strip for everything visible, lit ----
    composeFlat(FP, fs, uL, uR, vT, vB, P, true);
    // ---- screen buffer: niche, shadow, handles, body mesh, mouth ----
    const [scr, g] = screenBuf();
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#0b0807'; g.fillRect(0, 0, scr.width, scr.height);
    const s0 = sPers(0), potT = () => g.setTransform(sc, 0, 0, sc * s0, cx + PX, Ys + PY + sc * (EYE - EYE * s0 - Pf));
    const yBase = 2800;
    if (sc < 0.6) {
      potT();
      const yBack = yBase - 2600 * sel - 60, yFront = yBase + 2400 * sel + 120;
      // the niche: a round-headed recess, warmly lit from above left
      const ng = g.createRadialGradient(-300, -500, 200, 0, -300, 5200); ng.addColorStop(0, '#3a2a20'); ng.addColorStop(0.55, '#231811'); ng.addColorStop(1, '#120c09');
      g.fillStyle = ng; g.beginPath(); g.moveTo(-3500, yBack); g.lineTo(-3500, -1900); g.arc(0, -1900, 3500, Math.PI, 0); g.lineTo(3500, yBack); g.closePath(); g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 520; g.filter = 'none';
      g.beginPath(); g.moveTo(-3500, yBack); g.lineTo(-3500, -1900); g.arc(0, -1900, 3500, Math.PI, 0); g.lineTo(3500, yBack); g.stroke();
      g.lineWidth = 180; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke(); g.restore();
      // its floor, and the front edge of the ledge
      const fg = g.createLinearGradient(0, yBack, 0, yFront); fg.addColorStop(0, '#1f1510'); fg.addColorStop(0.6, '#34261d'); fg.addColorStop(1, '#2a1e17');
      g.fillStyle = fg; g.fillRect(-3500, yBack, 7000, yFront - yBack);
      g.fillStyle = 'rgba(255,215,170,0.10)'; g.fillRect(-3900, yFront - 18, 7800, 22);
      const eg = g.createLinearGradient(0, yFront, 0, yFront + 700); eg.addColorStop(0, '#1a120d'); eg.addColorStop(1, '#0b0807');
      g.fillStyle = eg; g.fillRect(-3900, yFront + 4, 7800, 700);
      // the pot's soft shadow on the floor (light from the left)
      g.save(); g.translate(260, yBase + 30); g.scale(1, Math.max(0.08, sel * 1.4));
      const sg = g.createRadialGradient(0, 0, 0, 0, 0, 1500); sg.addColorStop(0, 'rgba(0,0,0,0.75)'); sg.addColorStop(0.55, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 1500, 0, Math.PI * 2); g.fill(); g.restore();
      // warm pool of light on the back wall, and the faint cool spill of a screen somewhere off to the left
      g.globalCompositeOperation = 'screen';
      g.save(); g.beginPath(); g.rect(-3900, yBack, 7800, yFront - yBack + 60); g.moveTo(-3500, yBack); g.lineTo(-3500, -1900); g.lineTo(-3150, -1900); g.lineTo(-3150, yBack); g.clip();
      const cg = g.createRadialGradient(-3900, yBase, 0, -3900, yBase, 3000); cg.addColorStop(0, 'rgba(125,155,205,0.16)'); cg.addColorStop(1, 'rgba(125,155,205,0)');
      g.fillStyle = cg; g.fillRect(-7800, -6000, 7600, 11000); g.restore();
      const lg = g.createRadialGradient(-500, -700, 0, -500, -700, 3600); lg.addColorStop(0, 'rgba(255,190,140,0.13)'); lg.addColorStop(1, 'rgba(255,190,140,0)');
      g.fillStyle = lg; g.fillRect(-4000, -6000, 8000, 10000); g.globalCompositeOperation = 'source-over';
      // fade the room in as the pot stops filling the frame
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 - sm(clamp((0.6 - sc) / 0.25)); g.fillStyle = '#0b0807'; g.fillRect(0, 0, scr.width, scr.height); g.globalAlpha = 1;
    }
    // handles (behind the body; they sit at the sides, in the picture plane)
    if (m > 0.02) {
      for (const sd of [-1, 1]) {
        g.setTransform(sc * sd, 0, 0, sc * s0, cx + PX, Ys + PY + sc * (EYE - EYE * s0 - Pf));
        g.globalAlpha = m; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(1240, -470); g.bezierCurveTo(1560, -760, 1610, -1420, 1250, -1560); g.bezierCurveTo(1000, -1650, 760, -1560, 560, -1540);
        g.strokeStyle = '#17110e'; g.lineWidth = 125; g.stroke();
        g.strokeStyle = sd < 0 ? 'rgba(215,228,250,0.11)' : 'rgba(255,232,205,0.05)'; g.lineWidth = 34;
        g.save(); g.translate(sd < 0 ? 18 : -10, -22); g.stroke(); g.restore();
        g.globalAlpha = 1;
      }
    }
    // body: a fine mesh over (angle, surface row), textured with the strip and lit per pixel in WebGL
    const G = potGL(), gl = G.gl;
    const nS = Math.round(clamp(sc * R * (thR - thL) / 10, 16, 180));
    const rowsV = [];
    { let lastY = -1e9, lastA = 0; const cand = [vT, ...POT.breaks.filter(v => v > vT && v < vB), vB];
      for (let q = 0; q < cand.length; q++) {
        const v = cand[q], [r, y, d] = potGeo(v, m, R), Y = projY(y, r), a = Math.atan(d);
        if (q === 0 || q === cand.length - 1 || Math.abs(Y - lastY) >= 4 || Math.abs(a - lastA) > 0.05) { rowsV.push([v, r, y, d]); lastY = Y; lastA = a; }
      } }
    const nV = rowsV.length, NX = nS + 1, verts = new Float32Array(NX * nV * 8), idx = new Uint16Array(nS * (nV - 1) * 6);
    for (let j = 0; j < nV; j++) {
      const [v, r, y, d] = rowsV[j], tv = (v - vT) * fs / FP.height;
      for (let i = 0; i < NX; i++) {
        const th = thL + (thR - thL) * i / nS, o = (j * NX + i) * 8;
        verts[o] = cx + sc * r * Math.sin(th) + PX; verts[o + 1] = projY(y, r * Math.cos(th)) + PY;
        verts[o + 2] = (WIN / 2 + R * th - uL) * fs / FP.width; verts[o + 3] = tv;
        verts[o + 4] = th; verts[o + 5] = y; verts[o + 6] = r; verts[o + 7] = d;
      }
    }
    let nq = 0;
    for (let j = 0; j < nV - 1; j++) for (let i = 0; i < nS; i++) { const a = j * NX + i; idx[nq++] = a; idx[nq++] = a + 1; idx[nq++] = a + NX; idx[nq++] = a + 1; idx[nq++] = a + NX + 1; idx[nq++] = a + NX; }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, FP);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);
    gl.uniform2f(G.U.res, G.c.width, G.c.height); gl.uniform1f(G.U.ks, ks);
    gl.uniform1f(G.U.sig, lerp(640, 2700, ks)); gl.uniform1f(G.U.yc, lerp(555, 450, ks)); gl.uniform1f(G.U.xs, 1100 * lerp(1, 1.8, ks));
    gl.drawElements(gl.TRIANGLES, nq, gl.UNSIGNED_SHORT, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(G.c, 0, 0);
    // the mouth: the lip's top surface and the dark opening
    const rl = sc * 760 * R / 1700, ry = rl * sel * sPers(0);
    if (m > 0.5 && ry > 0.4) {
      const my = projY(-1900, 0);
      g.setTransform(1, 0, 0, 1, PX, PY);
      // the top of the rim is left in clay (lit from above left)
      const rg = g.createLinearGradient(cx - rl, 0, cx + rl, 0); rg.addColorStop(0, '#8a4a28'); rg.addColorStop(0.45, '#7a4022'); rg.addColorStop(1, '#3e2012');
      g.fillStyle = rg; g.beginPath(); g.ellipse(cx, my, rl * 1.0, ry, 0, 0, Math.PI * 2); g.fill();
      const mgd = g.createLinearGradient(0, my - ry, 0, my + ry); mgd.addColorStop(0, '#0a0706'); mgd.addColorStop(1, '#1a120e');
      g.fillStyle = mgd; g.beginPath(); g.ellipse(cx, my - ry * 0.04, rl * 0.84, ry * 0.8, 0, 0, Math.PI * 2); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    blitBreathing(ctx, scr, t);
    air(ctx, t, 1 - 0.6 * ks);
  }
  window.VASE_SURFACE = { wrap, renderPot };
})();
