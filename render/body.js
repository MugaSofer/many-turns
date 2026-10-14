// Figure silhouettes in the manner of Greek vase painting: broad shoulders, narrow waist, long muscular legs,
// profile head with a straight nose, expressive hands, draped garments that follow the pose.
// Works off the skeleton from ENGINE.figure(). Coordinates: F.facing = 1 faces right.
//
// drawFigure(ctx, F, opts) opts:
//   body        fill colour of the flesh (default ctx.fillStyle)
//   beard       bool;  hair: 'short'|'long'|'bun'|null;  hairColor; hairEdge (colour of a thin reserved line round the hair)
//   dress       colour: long chiton (women);  tunic: colour: short chiton to mid-thigh (men);  cloak: colour
//   slender     narrower build (default: true when dressed)
//   contour     colour of contour lines where near limbs/garments overlap the body (drawn 'source-atop': only use this
//               on a transparent layer holding just this figure). garmentContour overrides it for garments (null = none).
//   outline     colour: stroke every shape (outline drawing, e.g. white-ground). lw = line width for both.
//   hook(stage, info)  called after each stage so a style can paint details at the right depth:
//               'farLeg','farArm','nearLegUnder','body','nearLeg','dress','tunic','cloak','hair','nearArm'
// Returns the head mapper Hd ({map(x,y) in head-radius units, x towards the face}); Hd.info has the geometry.
(() => {
  const { lerp } = window.ENGINE;

  // smooth path through points (Catmull-Rom → Bezier)
  function smoothPath(ctx, pts, closed = true, begin = true) {
    const n = pts.length; if (n < 2) return;
    if (begin) ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (n === 2) { ctx.lineTo(pts[1][0], pts[1][1]); if (closed) ctx.closePath(); return; }
    const m = closed ? n : n - 1;
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < m; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
  }
  const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  const orient = pts => area(pts) < 0 ? pts.slice().reverse() : pts;     // same winding so subpaths union under nonzero
  // front normal of a limb segment: the side facing where the figure looks when the limb hangs down
  // (the shin's front, the thigh's top when sitting, the arm's inner side)
  const frontN = (a, b, f) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dy / L * f, -dx / L * f]; };

  // state for strokes, set per drawFigure call
  let S = { contour: null, outline: null, lw: 1.5 };
  function strokeUnder(ctx, pathFn, col, atop) {    // stroke drawn before the fill: only the outer half remains visible
    if (!col) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = S.lw * 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (atop) ctx.globalCompositeOperation = 'source-atop';
    pathFn(); ctx.stroke(); ctx.restore();
  }
  // fill a shape; near = draw a contour where it overlaps what is already there
  function shape(ctx, pathFn, near, contourCol) {
    if (S.outline) strokeUnder(ctx, pathFn, S.outline, false);
    else if (near) strokeUnder(ctx, pathFn, contourCol === undefined ? S.contour : contourCol, true);
    pathFn(); ctx.fill();
  }

  // limb from a to b; prof = [[t, frontWidth, backWidth], ...]; returns the two side polylines
  function limb(ctx, a, b, prof, facing, near = false) {
    const [nx, ny] = frontN(a, b, facing);
    const L1 = [], L2 = [];
    for (const [t, wf, wb] of prof) {
      const c = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
      L1.push([c[0] + nx * wf, c[1] + ny * wf]); L2.push([c[0] - nx * wb, c[1] - ny * wb]);
    }
    const all = L1.concat(L2.slice().reverse());
    if (S.outline || (near && S.contour)) {         // contour only along the sides, not across the joints
      ctx.save(); ctx.strokeStyle = S.outline || S.contour; ctx.lineWidth = S.lw * 2; ctx.lineCap = 'round';
      if (!S.outline) ctx.globalCompositeOperation = 'source-atop';
      smoothPath(ctx, L1.slice(1), false); ctx.stroke(); smoothPath(ctx, L2.slice(1), false); ctx.stroke(); ctx.restore();
    }
    smoothPath(ctx, all); ctx.fill();
    return [L1, L2];
  }

  // unit head profile facing +x, y down, in head radii; rotated to the neck direction
  const HEAD_M = [[-0.5, 0.95], [-0.9, 0.35], [-0.98, -0.2], [-0.78, -0.72], [-0.3, -1.0], [0.25, -0.98], [0.62, -0.72], [0.8, -0.42],
    [0.9, -0.2], [1.06, 0.03], [1.2, 0.22], [1.08, 0.3], [1.07, 0.38], [0.99, 0.45], [1.04, 0.53], [0.98, 0.68], [0.82, 0.8], [0.45, 0.82], [0.1, 0.92]];
  const HEAD_W = [[-0.45, 0.95], [-0.88, 0.35], [-0.97, -0.2], [-0.78, -0.72], [-0.3, -1.0], [0.25, -0.98], [0.62, -0.72], [0.8, -0.42],
    [0.88, -0.2], [1.03, 0.03], [1.15, 0.22], [1.04, 0.29], [1.03, 0.37], [0.96, 0.44], [1.0, 0.51], [0.93, 0.64], [0.78, 0.74], [0.45, 0.76], [0.1, 0.88]];
  const BEARD = [[0.6, 0.3], [0.94, 0.5], [1.03, 0.72], [1.0, 1.02], [0.9, 1.38], [0.8, 1.55], [0.58, 1.3], [0.3, 1.05], [-0.1, 0.8], [-0.3, 0.45], [-0.1, 0.15]];
  const HAIR = {
    short: [[0.62, -0.72], [0.3, -1.08], [-0.35, -1.1], [-0.9, -0.8], [-1.1, -0.2], [-1.06, 0.5], [-0.85, 1.12], [-0.5, 1.02], [-0.42, 0.55], [-0.38, 0.05], [-0.1, -0.22], [0.28, -0.42], [0.52, -0.5]],
    long: [[0.62, -0.72], [0.3, -1.1], [-0.35, -1.12], [-0.92, -0.82], [-1.13, -0.2], [-1.12, 0.6], [-1.08, 1.5], [-0.98, 2.35], [-0.62, 2.25], [-0.45, 1.5], [-0.4, 0.6], [-0.36, 0.05], [-0.1, -0.22], [0.28, -0.42], [0.52, -0.5]],
    bun: [[0.62, -0.72], [0.3, -1.08], [-0.35, -1.1], [-0.9, -0.8], [-1.08, -0.2], [-1.0, 0.45], [-0.62, 0.62], [-0.4, 0.35], [-0.34, 0.02], [-0.1, -0.22], [0.28, -0.42], [0.52, -0.5]],
  };
  function headMapper(F) {
    const r = F.headR, f = F.facing, c = F.headC, up = F.noseDir, ang = Math.atan2(up[0], -up[1]);
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const map = (x, y) => { x *= f; return [c[0] + (x * cs - y * sn) * r, c[1] + (x * sn + y * cs) * r]; };
    return { cs, sn, map, mapAll: P => P.map(([x, y]) => map(x, y)) };
  }
  function head(ctx, F, opts) {
    const Hd = headMapper(F);
    shape(ctx, () => smoothPath(ctx, Hd.mapAll(opts.slender ? HEAD_W : HEAD_M)), false);
    if (opts.beard) shape(ctx, () => smoothPath(ctx, Hd.mapAll(BEARD)), false);
    return Hd;
  }
  // foot at the ankle: sole along the shin direction, toes towards the shin's front
  function foot(ctx, knee, ankle, facing, h, slender, near) {
    let [ux, uy] = frontN(knee, ankle, facing);
    // keep the foot roughly level: clamp its angle to the ground
    let a = Math.atan2(uy, ux * facing); a = Math.max(-1.0, Math.min(0.45, a));
    ux = Math.cos(a) * facing; uy = Math.sin(a);
    const vx = -uy * facing, vy = ux * facing;          // sole side (down when standing)
    const k = slender ? 0.9 : 1;
    const P = [[-0.016, -0.03], [-0.03, 0.0], [-0.034, 0.02], [-0.024, 0.032], [0.02, 0.031], [0.07, 0.033], [0.108, 0.03], [0.12, 0.024],
               [0.113, 0.016], [0.08, 0.011], [0.045, -0.0], [0.016, -0.022]];
    const pts = P.map(([u, v]) => [ankle[0] + (ux * u * k + vx * v) * h, ankle[1] + (uy * u * k + vy * v) * h]);
    shape(ctx, () => smoothPath(ctx, pts), near);
    return { ankle, u: [ux, uy], v: [vx, vy] };
  }
  // hand: open palm with fingers together and the thumb apart, along the forearm
  function hand(ctx, wrist, elbow, facing, h, slender, near) {
    const dx = wrist[0] - elbow[0], dy = wrist[1] - elbow[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const [vx, vy] = frontN(elbow, wrist, facing);
    const k = slender ? 0.9 : 1;
    const P = [[-0.01, -0.013], [0.022, -0.018], [0.05, -0.018], [0.078, -0.01], [0.09, -0.002], [0.084, 0.006], [0.058, 0.012], [0.04, 0.014],
               [0.05, 0.03], [0.044, 0.036], [0.022, 0.024], [-0.01, 0.014]];
    const pts = P.map(([u, v]) => [wrist[0] + (ux * u + vx * v) * h * k, wrist[1] + (uy * u + vy * v) * h * k]);
    shape(ctx, () => smoothPath(ctx, pts), near);
    return { wrist, u: [ux, uy], v: [vx, vy], k };
  }

  // torso frame: up = along the spine, fw = towards the face
  function frame(F) {
    const f = F.facing, up = F.torsoDir, fw = [-up[1] * f, up[0] * f];
    const at = (base, a, b) => [base[0] + up[0] * a + fw[0] * b, base[1] + up[1] * a + fw[1] * b];
    return { up, fw, at };
  }
  function torsoPts(F, fr, sl) {
    const h = F.h, s = F.shoulder, p = F.hip, at = fr.at, k = sl ? 0.84 : 1, kb = sl ? 0.95 : 1;
    return [
      at(s, 0.035 * h, -0.03 * h * k), at(s, 0.012 * h, -0.075 * h * k), at(s, -0.015 * h, -0.102 * h * k), at(s, -0.06 * h, -0.098 * h * k),
      at(s, -0.13 * h, -0.07 * h * k), at(p, 0.11 * h, -0.05 * h * kb), at(p, 0.04 * h, -0.068 * h * kb), at(p, -0.02 * h, -0.084 * h * kb),
      at(p, -0.07 * h, -0.058 * h), at(p, -0.065 * h, 0.035 * h), at(p, 0.0, 0.06 * h * kb), at(p, 0.1 * h, 0.052 * h * kb),
      at(s, -0.14 * h, 0.074 * h * k), at(s, -0.08 * h, (sl ? 0.085 : 0.1) * h), at(s, -0.025 * h, 0.1 * h * k), at(s, 0.015 * h, 0.078 * h * k), at(s, 0.035 * h, 0.03 * h * k),
    ];
  }
  // points along a leg path (s in 0..2: hip→knee→ankle), with its front normal
  function legAt(L, s, f) {
    const i = s < 1 ? 0 : 1, t = s < 1 ? s : Math.min(1, s - 1);
    const a = L[i], b = L[i + 1];
    return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], n: frontN(a, b, f) };
  }
  const interp = (tab, s) => { for (let i = 0; i < tab.length - 1; i++) if (s <= tab[i + 1][0]) { const k = (s - tab[i][0]) / (tab[i + 1][0] - tab[i][0]); return lerp(tab[i][1], tab[i + 1][1], k); } return tab[tab.length - 1][1]; };
  // skirt of a garment down to sEnd along the legs: returns polygons (all same winding), edge paths and the hem
  function skirt(F, fr, sEnd, WF, WB) {
    const f = F.facing, h = F.h, SS = [0, 0.3, 0.6, 0.9, 1.1, 1.4, 1.7, 2].filter(s => s < sEnd - 0.05).concat([sEnd]);
    const legs = [F.legs.r, F.legs.l];
    // which leg is further back (along the facing direction)
    const endA = legAt(legs[0], sEnd, f).p, endB = legAt(legs[1], sEnd, f).p;
    const [back, front] = (endA[0] - endB[0]) * f < 0 ? [legs[0], legs[1]] : [legs[1], legs[0]];
    const edge = (L, side) => SS.map(s => { const { p, n } = legAt(L, s, f), w = side > 0 ? interp(WF, s) * h : -interp(WB, s) * h; return [p[0] + n[0] * w, p[1] + n[1] * w]; });
    const centre = L => SS.map(s => legAt(L, s, f).p);
    const polys = [];
    for (const L of legs) polys.push(orient(edge(L, 1).concat(edge(L, -1).reverse())));
    const backEdge = edge(back, -1), frontEdge = edge(front, 1);
    polys.push(orient(backEdge.concat(frontEdge.slice().reverse())));   // the cloth between the legs
    const bE = backEdge[backEdge.length - 1], fE = frontEdge[frontEdge.length - 1];
    const hem = [bE, centre(back).pop(), centre(front).pop(), fE];
    // direction from the hem back up the garment
    const d1 = legAt(back, sEnd, f), d2 = legAt(front, sEnd, f);
    const upv = L => { const s0 = legAt(L, Math.max(0, sEnd - 0.2), f).p, s1 = legAt(L, sEnd, f).p, dx = s0[0] - s1[0], dy = s0[1] - s1[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const uB = upv(back), uF = upv(front);
    return { polys, backEdge, frontEdge, hem, hemUp: [uB, uB, uF, uF], back, front, SS, d1, d2 };
  }
  // the cloth over the hips: the convex hull of the waist and the tops of both thighs, so a sitting or striding figure's
  // garment never parts between the bodice and the skirt
  function seat(F, fr, sk, sEnd) {
    const h = F.h, p = F.hip, at = fr.at, pts = [at(p, 0.02 * h, -0.092 * h), at(p, 0.02 * h, 0.07 * h), at(p, -0.078 * h, -0.066 * h), at(p, -0.075 * h, 0.042 * h)];   // (and the seat of the torso)
    const n = Math.max(2, sk.SS.findIndex(v => v >= Math.min(0.45, sEnd)) + 1);
    for (const L of [F.legs.r, F.legs.l]) for (const side of [1, -1]) for (let i = 0; i < n; i++) {
      const sv = sk.SS[i], a = legAt(L, sv, F.facing), w = (side > 0 ? 0.075 : -0.088) * h; pts.push([a.p[0] + a.n[0] * w, a.p[1] + a.n[1] * w]); }
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = []; for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return orient(lo.slice(0, -1).concat(hi.slice(0, -1)));
  }
  function polysPath(ctx, polys) { ctx.beginPath(); for (const P of polys) smoothPath(ctx, P, true, false); }

  function drawFigure(ctx, F, opts = {}) {
    const h = F.h, f = F.facing, body = opts.body || ctx.fillStyle;
    const sl = opts.slender ?? !!opts.dress, k = sl ? 0.86 : 1;
    const prevS = S;
    S = { contour: opts.contour || null, outline: opts.outline || null, lw: opts.lw || Math.max(0.6, 0.0028 * h) };
    const gContour = opts.garmentContour === undefined ? S.contour : opts.garmentContour;
    const hook = opts.hook || (() => {});
    const fr = frame(F), info = { F, h, f, fr, slender: sl, opts };
    ctx.fillStyle = body;
    const TH = [[0, 0.064 * h * k, 0.066 * h * k], [0.3, 0.062 * h * k, 0.056 * h * k], [0.62, 0.05 * h * k, 0.046 * h * k], [0.88, 0.036 * h * k, 0.036 * h * k], [1, 0.03 * h * k, 0.032 * h * k]];
    const SH = [[0, 0.029 * h * k, 0.031 * h * k], [0.12, 0.028 * h * k, 0.038 * h * k], [0.3, 0.024 * h * k, 0.047 * h * k], [0.55, 0.018 * h * k, 0.03 * h * k], [0.85, 0.013 * h * k, 0.015 * h * k], [1, 0.013 * h * k, 0.016 * h * k]];
    const UA = [[0, 0.044 * h * k, 0.044 * h * k], [0.2, 0.038 * h * k, 0.036 * h * k], [0.5, 0.032 * h * k, 0.029 * h * k], [0.85, 0.024 * h * k, 0.024 * h * k], [1, 0.022 * h * k, 0.022 * h * k]];
    const FA = [[0, 0.021 * h * k, 0.022 * h * k], [0.25, 0.025 * h * k, 0.025 * h * k], [0.7, 0.018 * h * k, 0.017 * h * k], [1, 0.0135 * h * k, 0.0135 * h * k]];
    // arms start from shoulders spread across the chest (the Greek convention); the hand stays where the skeleton put it
    const armFrom = (A, b) => {
      const root = fr.at(F.shoulder, -0.018 * h, b * h * k), off = [root[0] - A[0][0], root[1] - A[0][1]];
      return [root, [A[1][0] + off[0] * 0.5, A[1][1] + off[1] * 0.5], A[2]];
    };
    const farArm = armFrom(F.arms.r, -0.05), nearArm = armFrom(F.arms.l, 0.035);
    info.arms = { far: farArm, near: nearArm }; info.legs = { far: F.legs.r, near: F.legs.l };
    const drawLeg = (Lg, near) => {
      const th = limb(ctx, Lg[0], Lg[1], TH, f, near); ctx.beginPath(); ctx.arc(Lg[1][0], Lg[1][1], 0.03 * h * k, 0, 7); ctx.fill();   // (a rounded knee: no corner where thigh meets shin)
      const sh = limb(ctx, Lg[1], Lg[2], SH, f, near);
      return { th, sh, foot: foot(ctx, Lg[1], Lg[2], f, h, sl, near) };
    };
    const drawArm = (A, near) => {
      const ua = limb(ctx, A[0], A[1], UA, f, near); ctx.beginPath(); ctx.arc(A[1][0], A[1][1], 0.0215 * h * k, 0, 7); ctx.fill();   // (a rounded elbow)
      const fa = limb(ctx, A[1], A[2], FA, f, near);
      return { ua, fa, hand: hand(ctx, A[2], A[1], f, h, sl, near) };
    };
    const garment = opts.dress || opts.tunic;
    info.farLeg = drawLeg(F.legs.r, false); hook('farLeg', info);
    info.farArm = drawArm(farArm, false); hook('farArm', info);
    if (garment) { info.nearLeg = drawLeg(F.legs.l, true); hook('nearLegUnder', info); }
    // torso, neck, head
    const tp = torsoPts(F, fr, sl); info.torso = tp;
    shape(ctx, () => smoothPath(ctx, tp), false);
    limb(ctx, fr.at(F.shoulder, -0.02 * h, 0), F.neckTop, [[0, 0.036 * h * k, 0.03 * h * k], [0.5, 0.028 * h * k, 0.028 * h * k], [1, 0.028 * h * k, 0.03 * h * k]], f);
    const Hd = head(ctx, F, { beard: opts.beard, slender: sl });
    info.head = Hd; Hd.info = info;
    hook('body', info);
    if (!garment) { info.nearLeg = drawLeg(F.legs.l, true); hook('nearLeg', info); }
    // garments
    const bodice = (ext, len) => {
      const s = F.shoulder, p = F.hip, at = fr.at, kk = sl ? 0.86 : 1;
      return [at(s, 0.03 * h, -0.04 * h * kk), at(s, 0.005 * h, -0.085 * h * kk), at(s, -0.03 * h, -(0.105 + ext) * h * kk), at(s, -0.13 * h, -(0.08 + ext) * h * kk),
        at(p, 0.1 * h, -(0.064 + ext) * h), at(p, 0.0, -(0.092 + ext) * h), at(p, 0.0, (0.07 + ext) * h), at(p, 0.1 * h, (0.064 + ext) * h),
        at(s, -0.14 * h, (0.085 + ext) * h * kk), at(s, -0.07 * h, (sl ? 0.098 : 0.108) * h + ext * h), at(s, -0.02 * h, (0.1 + ext) * h * kk), at(s, 0.018 * h, 0.07 * h * kk), at(s, 0.025 * h, 0.035 * h * kk)];
    };
    if (opts.dress) {
      const sk = skirt(F, fr, 1.9, [[0, 0.08], [0.6, 0.07], [1, 0.062], [1.5, 0.068], [1.9, 0.086]], [[0, 0.092], [0.6, 0.08], [1, 0.07], [1.5, 0.078], [1.9, 0.096]]);
      const polys = [orient(bodice(0.008, 1)), seat(F, fr, sk, 1.9), ...sk.polys];
      ctx.fillStyle = opts.dress;
      shape(ctx, () => polysPath(ctx, polys), true, gContour);
      info.dress = Object.assign(sk, { polys, path: () => polysPath(ctx, polys) });
      hook('dress', info);
    } else if (opts.tunic) {
      const sk = skirt(F, fr, 0.52, [[0, 0.08], [0.52, 0.074]], [[0, 0.094], [0.52, 0.082]]);
      const polys = [orient(bodice(0.006, 1)), seat(F, fr, sk, 0.52), ...sk.polys];
      ctx.fillStyle = opts.tunic;
      shape(ctx, () => polysPath(ctx, polys), true, gContour);
      info.tunic = Object.assign(sk, { polys, path: () => polysPath(ctx, polys) });
      hook('tunic', info);
    }
    if (opts.cloak) {
      const s = F.shoulder, p = F.hip, at = fr.at, gy = Math.max(F.legs.l[2][1], F.legs.r[2][1]) + 0.02 * h;
      const low = Math.min(gy, Math.max(p[1], s[1]) + 0.38 * h);
      const pts = [at(s, 0.035 * h, 0.05 * h * k), at(s, 0.04 * h, -0.04 * h), at(s, 0.0, -0.115 * h * k), at(s, -0.12 * h, -0.105 * h * k),
        [p[0] - f * 0.12 * h, lerp(p[1], low, 0.5)], [p[0] - f * 0.13 * h, low], [p[0] - f * 0.01 * h, low - 0.01 * h], [p[0] + f * 0.07 * h, low - 0.06 * h],
        at(p, 0.02 * h, 0.085 * h), at(s, -0.12 * h, 0.095 * h * k), at(s, -0.03 * h, 0.1 * h * k)];
      ctx.fillStyle = opts.cloak;
      shape(ctx, () => smoothPath(ctx, pts), true, gContour);
      info.cloak = { pts, low, path: () => smoothPath(ctx, pts) };
      hook('cloak', info);
    }
    ctx.fillStyle = body;
    // hair over the head
    if (opts.hair && HAIR[opts.hair]) {
      const hp = Hd.mapAll(HAIR[opts.hair]);
      ctx.fillStyle = opts.hairColor || body;
      if (opts.hairEdge) strokeUnder(ctx, () => smoothPath(ctx, hp), opts.hairEdge, false);
      smoothPath(ctx, hp); ctx.fill();
      if (opts.hair === 'bun') {
        const bc = Hd.map(-1.0, -0.62), r = F.headR * 0.46;
        if (opts.hairEdge) strokeUnder(ctx, () => { ctx.beginPath(); ctx.ellipse(bc[0], bc[1], r * 1.1, r * 0.85, Math.atan2(Hd.sn, Hd.cs) - 0.5 * f, 0, 7); }, opts.hairEdge, false);
        ctx.beginPath(); ctx.ellipse(bc[0], bc[1], r * 1.1, r * 0.85, Math.atan2(Hd.sn, Hd.cs) - 0.5 * f, 0, 7); ctx.fill();
      }
      info.hairPts = hp; ctx.fillStyle = body;
      hook('hair', info);
    }
    // Odysseus's pilos: a conical felt traveller's cap (his usual attribute on vases), a band of curls beneath it
    if (opts.hat === 'pilos') {
      const cap = Hd.mapAll([[0.78, -0.5], [0.45, -1.05], [0.05, -1.55], [-0.35, -2.05], [-0.7, -1.6], [-1.05, -0.95], [-1.15, -0.45], [-0.2, -0.62]]);
      ctx.fillStyle = opts.hatColor || body; smoothPath(ctx, cap); ctx.fill();
      if (opts.hatEdge) { ctx.strokeStyle = opts.hatEdge; ctx.lineWidth = Math.max(1.2, F.headR * 0.08); smoothPath(ctx, cap); ctx.stroke(); }
      ctx.strokeStyle = body; ctx.lineWidth = Math.max(1.2, F.headR * 0.09); ctx.beginPath(); const b0 = Hd.map(0.8, -0.52), b1 = Hd.map(-1.15, -0.42); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      ctx.fillStyle = body; for (let k = 0; k < 4; k++) { const c = Hd.map(-1.05 + k * 0.05, -0.2 + k * 0.28); ctx.beginPath(); ctx.arc(c[0], c[1], F.headR * 0.17, 0, 7); ctx.fill(); }   // curls at the nape
      ctx.fillStyle = body;
    }
    info.nearArm = drawArm(nearArm, true);
    if (opts.dress && opts.sleeves !== false) {   // short sleeve of the chiton over the near upper arm
      ctx.fillStyle = opts.dress; const A = nearArm;
      limb(ctx, A[0], [lerp(A[0][0], A[1][0], 0.42), lerp(A[0][1], A[1][1], 0.42)], [[0, 0.05 * h * k, 0.05 * h * k], [0.6, 0.045 * h * k, 0.043 * h * k], [1, 0.042 * h * k, 0.04 * h * k]], f, !!gContour);
      ctx.fillStyle = body;
    }
    hook('nearArm', info);
    ctx.fillStyle = body;
    S = prevS;
    return Hd;
  }
  window.BODY = { drawFigure, smoothPath, limb, head, headMapper, frontN, legAt, polysPath };
})();
