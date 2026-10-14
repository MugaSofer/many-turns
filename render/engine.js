// Shared helpers for all styles: randomness, noise, easing, and a posable figure.
// Everything is deterministic: same inputs, same pixels, so frames can be re-rendered.
const W = 1920, H = 1080;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f, s + i * 17); f *= 2; amp *= 0.5; }
  return v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const deg = d => d * Math.PI / 180;

// ---------- Figure ----------
// A pose gives joint angles in degrees (0 = pointing down, positive = rotate towards facing direction).
// Returns named segments so styles can draw them however they like.
const POSES = {
  stand:    { torso: 0,   neck: 0,   lArm: [8, 2],     rArm: [-6, 10],   lLeg: [3, 0],    rLeg: [-3, -2] },
  walk:     { torso: 3,   neck: 0,   lArm: [25, 45],   rArm: [-25, -15], lLeg: [22, 8],   rLeg: [-18, -35] },
  carryOar: { torso: 5,   neck: -3,  lArm: [140, 205], rArm: [-12, 8],   lLeg: [22, 8],   rLeg: [-18, -35] },
  reach:    { torso: -5,  neck: -15, lArm: [150, 170], rArm: [-20, 10],  lLeg: [12, 0],   rLeg: [-10, -18] },
  offer:    { torso: 8,   neck: 14,  lArm: [45, 95],   rArm: [30, 70],   lLeg: [15, 5],   rLeg: [-8, -5] },
  sit:      { torso: -6,  neck: 6,   lArm: [60, 115],  rArm: [45, 100],  lLeg: [128, 18], rLeg: [120, 8], hipH: 0.05 },
  kneel:    { torso: 10,  neck: 10,  lArm: [60, 60],   rArm: [40, 80],   lLeg: [82, 2],   rLeg: [-8, -94], hipH: 0.28 },
  mourn:    { torso: 14,  neck: 28,  lArm: [150, 262], rArm: [6, 18],   lLeg: [8, 0],    rLeg: [-5, -3] },
  lie:      { torso: 0,   neck: -5,  lArm: [15, 25],   rArm: [-10, 5],   lLeg: [4, 0],    rLeg: [-6, 8], rot: -86 },
  plant:    { torso: 28,  neck: 12,  lArm: [70, 40],   rArm: [60, 30],   lLeg: [32, 8],   rLeg: [-30, -12] },
};

// figure(x, y, h, pose, facing): x,y = feet/ground point; h = standing height in px; facing = 1 (right) or -1.
function figure(x, y, h, pose, facing = 1) {
  const P = typeof pose === 'string' ? POSES[pose] : pose;
  const L = { torso: 0.31 * h, neck: 0.035 * h, head: 0.065 * h, ua: 0.17 * h, fa: 0.16 * h, th: 0.245 * h, sh: 0.25 * h };
  const rot = deg(P.rot || 0) * facing;
  const f = facing;
  // direction vector for an angle measured from "down", positive towards facing
  // (the whole figure turns by rot as one rigid body: up-pointing parts by +rot, down-pointing limbs the same way, which
  // in this angle convention is -rot; before, limbs were mirrored and a lying figure folded in half)
  const dir = (a, up = false) => { const A = deg(a) * f; return up ? [Math.sin(A + rot), -Math.cos(A + rot)] : [Math.sin(A - rot), Math.cos(A - rot)]; };
  // hips: standing height of legs above feet
  const legH = L.th + L.sh;
  let hip = [x, y - legH];
  if (P.rot) { const k = Math.min(1, Math.abs(P.rot) / 86); hip = [x, y - (0.12 * k + 0.495 * (1 - k)) * h]; }   // lying: hips near ground (blends as he sits up)
  if (P.hipH) hip = [x, y - P.hipH * h];
  const tDir = dir(P.torso, true);
  const shoulder = [hip[0] + tDir[0] * L.torso, hip[1] + tDir[1] * L.torso];
  const nDir = dir(P.torso + P.neck, true);
  const neckTop = [shoulder[0] + nDir[0] * L.neck, shoulder[1] + nDir[1] * L.neck];
  const headC = [neckTop[0] + nDir[0] * L.head, neckTop[1] + nDir[1] * L.head];
  const limb = (start, [a1, a2], l1, l2, fromTorso) => {
    const base = fromTorso ? P.torso : 0;
    // a1 = upper segment angle, a2 = lower segment angle, both measured from "down" (plus torso lean for arms)
    const d1 = dir(base + a1), j = [start[0] + d1[0] * l1, start[1] + d1[1] * l1];
    const d2 = dir(base + a2), e = [j[0] + d2[0] * l2, j[1] + d2[1] * l2];
    return [start, j, e];
  };
  const arms = { l: limb(shoulder, P.lArm, L.ua, L.fa, true), r: limb(shoulder, P.rArm, L.ua, L.fa, true) };
  const legs = { l: limb(hip, P.lLeg, L.th, L.sh, false), r: limb(hip, P.rLeg, L.th, L.sh, false) };
  // never let feet or knees go through the ground: if the pose would put them below y, lift the whole figure
  // (only ever lifts; seated or dangling poses whose feet are above the ground are left alone)
  if (!P.noGround && Math.abs(P.rot || 0) < 30) {   // (noGround: the scene keeps the figure grounded itself)
    const low = Math.max(legs.l[1][1], legs.l[2][1], legs.r[1][1], legs.r[2][1]) - y;
    if (low > 0.5) { const up = pt => { pt[1] -= low; };
      [hip, shoulder, neckTop, headC].forEach(up); for (const A of [arms.l, arms.r, legs.l, legs.r]) { up(A[1]); up(A[2]); } }   // A[0] is the shoulder/hip itself
  }
  return { hip, shoulder, neckTop, headC, headR: L.head, arms, legs, h, facing: f, torsoDir: tDir, noseDir: nDir };
}

// Tapered limb polygon between two points with widths w0, w1 (round joints).
function taper(ctx, p0, p1, w0, w1) {
  // quad body plus round end caps drawn as separate sub-paths (all clockwise so nothing punches holes)
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(p0[0] + nx * w0 / 2, p0[1] + ny * w0 / 2);
  ctx.lineTo(p1[0] + nx * w1 / 2, p1[1] + ny * w1 / 2);
  ctx.lineTo(p1[0] - nx * w1 / 2, p1[1] - ny * w1 / 2);
  ctx.lineTo(p0[0] - nx * w0 / 2, p0[1] - ny * w0 / 2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(p0[0], p0[1], w0 / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p1[0], p1[1], w1 / 2, 0, Math.PI * 2); ctx.fill();
}

// Solid silhouette of a figure (used by black-figure and paper styles). opts: {chiton: bool, beard: bool, hair: 'long'|'short'}
function drawSilhouette(ctx, F, opts = {}) {
  const h = F.h, f = F.facing;
  const lw = 0.07 * h, aw = 0.05 * h;
  // back limbs slightly behind
  taper(ctx, F.legs.r[0], F.legs.r[1], lw * 1.1, lw * 0.8); taper(ctx, F.legs.r[1], F.legs.r[2], lw * 0.8, lw * 0.45);
  taper(ctx, F.arms.r[0], F.arms.r[1], aw, aw * 0.8); taper(ctx, F.arms.r[1], F.arms.r[2], aw * 0.8, aw * 0.5);
  // torso wedge: broad shoulders, narrow waist
  const td = F.torsoDir, tn = [-td[1], td[0]];
  const sw = 0.2 * h, ww = 0.1 * h;
  ctx.beginPath();
  ctx.moveTo(F.hip[0] + tn[0] * ww / 2, F.hip[1] + tn[1] * ww / 2);
  ctx.lineTo(F.shoulder[0] + tn[0] * sw / 2, F.shoulder[1] + tn[1] * sw / 2);
  ctx.quadraticCurveTo(F.neckTop[0], F.neckTop[1] - 0.01 * h, F.shoulder[0] - tn[0] * sw / 2, F.shoulder[1] - tn[1] * sw / 2);
  ctx.lineTo(F.hip[0] - tn[0] * ww / 2, F.hip[1] - tn[1] * ww / 2);
  ctx.closePath(); ctx.fill();
  if (opts.chiton) {   // long dress: trapezoid from waist to ankles
    const ankle = [(F.legs.l[2][0] + F.legs.r[2][0]) / 2, Math.max(F.legs.l[2][1], F.legs.r[2][1])];
    const spread = Math.abs(F.legs.l[2][0] - F.legs.r[2][0]) + 0.12 * h;
    ctx.beginPath();
    ctx.moveTo(F.hip[0] - 0.06 * h, F.hip[1] - 0.04 * h);
    ctx.lineTo(F.hip[0] + 0.06 * h, F.hip[1] - 0.04 * h);
    ctx.lineTo(ankle[0] + spread / 2, ankle[1] - 0.02 * h);
    ctx.lineTo(ankle[0] - spread / 2, ankle[1] - 0.02 * h);
    ctx.closePath(); ctx.fill();
  }
  // neck + head with a nose bump
  taper(ctx, F.shoulder, F.neckTop, 0.06 * h, 0.05 * h);
  ctx.beginPath(); ctx.arc(F.headC[0], F.headC[1], F.headR, 0, Math.PI * 2); ctx.fill();
  const nd = F.noseDir, fwd = [-nd[1] * -f, nd[0] * -f]; // perpendicular, towards facing
  const nose = [F.headC[0] + fwd[0] * F.headR * 1.35 + nd[0] * F.headR * 0.1, F.headC[1] + fwd[1] * F.headR * 1.35 + nd[1] * F.headR * 0.1];
  ctx.beginPath();
  ctx.moveTo(F.headC[0] + nd[0] * F.headR * 0.5 + fwd[0] * F.headR * 0.7, F.headC[1] + nd[1] * F.headR * 0.5 + fwd[1] * F.headR * 0.7);
  ctx.lineTo(nose[0], nose[1]);
  ctx.lineTo(F.headC[0] - nd[0] * F.headR * 0.3 + fwd[0] * F.headR * 0.8, F.headC[1] - nd[1] * F.headR * 0.3 + fwd[1] * F.headR * 0.8);
  ctx.closePath(); ctx.fill();
  if (opts.beard) {
    ctx.beginPath();
    ctx.moveTo(F.headC[0] + fwd[0] * F.headR * 0.6 - nd[0] * F.headR * 0.4, F.headC[1] + fwd[1] * F.headR * 0.6 - nd[1] * F.headR * 0.4);
    ctx.lineTo(F.headC[0] + fwd[0] * F.headR * 0.9 - nd[0] * F.headR * 1.5, F.headC[1] + fwd[1] * F.headR * 0.9 - nd[1] * F.headR * 1.5);
    ctx.lineTo(F.headC[0] - fwd[0] * F.headR * 0.3 - nd[0] * F.headR * 0.6, F.headC[1] - fwd[1] * F.headR * 0.3 - nd[1] * F.headR * 0.6);
    ctx.closePath(); ctx.fill();
  }
  if (opts.hair === 'long') {
    ctx.beginPath();
    ctx.ellipse(F.headC[0] - fwd[0] * F.headR * 0.6 - nd[0] * F.headR * 0.6, F.headC[1] - fwd[1] * F.headR * 0.6 - nd[1] * F.headR * 0.6 + F.headR * 0.6,
      F.headR * 0.5, F.headR * 1.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  // front limbs
  taper(ctx, F.legs.l[0], F.legs.l[1], lw * 1.1, lw * 0.8); taper(ctx, F.legs.l[1], F.legs.l[2], lw * 0.8, lw * 0.45);
  taper(ctx, F.arms.l[0], F.arms.l[1], aw, aw * 0.8); taper(ctx, F.arms.l[1], F.arms.l[2], aw * 0.8, aw * 0.5);
}

// An oar from grip g to blade tip b (width scales with length)
function drawOar(ctx, g, b) {
  const len = Math.hypot(b[0] - g[0], b[1] - g[1]);
  const t = 0.72, m = [lerp(g[0], b[0], t), lerp(g[1], b[1], t)];
  ctx.save(); ctx.lineCap = 'round';
  ctx.lineWidth = len * 0.022; ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(m[0], m[1]); ctx.stroke();
  const dx = (b[0] - g[0]) / len, dy = (b[1] - g[1]) / len, nx = -dy, ny = dx, bw = len * 0.055;
  ctx.beginPath();
  ctx.moveTo(m[0] + nx * len * 0.012, m[1] + ny * len * 0.012);
  ctx.quadraticCurveTo(m[0] + dx * len * 0.08 + nx * bw, m[1] + dy * len * 0.08 + ny * bw, b[0] + nx * bw * 0.7, b[1] + ny * bw * 0.7);
  ctx.quadraticCurveTo(b[0] + dx * len * 0.02, b[1] + dy * len * 0.02, b[0] - nx * bw * 0.7, b[1] - ny * bw * 0.7);
  ctx.quadraticCurveTo(m[0] + dx * len * 0.08 - nx * bw, m[1] + dy * len * 0.08 - ny * bw, m[0] - nx * len * 0.012, m[1] - ny * len * 0.012);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// blend two poses (angle-wise); used for gestures and walk cycles
function lerpPose(A, B, t) {
  const o = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    // a pose without hipH/rot means the default (standing hip height, upright), not "whatever the other pose has";
    // otherwise kneel->stand kept the kneeling hip height and the legs poked through the ground
    const dflt = P => k === 'hipH' ? (P.rot ? 0.12 : 0.495) : k === 'rot' ? 0 : undefined;
    const a = A[k] ?? dflt(A) ?? B[k], b = B[k] ?? dflt(B) ?? A[k];
    o[k] = Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : lerp(a, b, t);
  }
  return o;
}
function walkPose(phase, base = {}) {   // phase in cycles; one cycle = two steps
  const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
  return Object.assign({ torso: 3, neck: 0,
    lLeg: [22 * s, 22 * s - 18 * Math.max(0, -c)], rLeg: [-22 * s, -22 * s - 18 * Math.max(0, c)],
    lArm: [-20 * s, -20 * s + 20], rArm: [20 * s, 20 * s + 20] }, base);
}
// Song timing helpers. Beat times come from the beat tracker (TIMING.beats, injected by capture.js before any
// script runs); the real beat drifts slightly against any fixed grid, so everything follows the tracked beats.
// TIMING.groove (per beat) says how strongly the low drum pulse is actually present; beat-driven motion is gated by it,
// so the animation doesn't dance to a beat you can't hear yet (the intro, the quiet bridge).
const MV = (() => {
  const B0 = 0.464, P = 0.5805;
  // Muga's ear test (2026-09-27): the felt pulse is every OTHER beat (~52 bpm), so the main accents follow that
  // half-time pulse; walking and bar structure still use the raw beats.
  let beats = null, raw = null, groove = null, down = 0, drv = false;
  // beats come from beat_this (neural tracker); felt beats are beats 1 and 3 of each bar, counted from its downbeats
  const init = () => { if (beats) return; const T = window.TIMING || {}; raw = T.beats || []; const D = T.downbeats || [];
    const keep = []; let di = 0, k = 0;
    raw.forEach((x, i) => { while (di < D.length && D[di] <= x + 0.05) { if (Math.abs(D[di] - x) < 0.05) k = 0; di++; } if (k % 2 === 0) keep.push(i); k++; });
    beats = keep.map(i => raw[i]);
    const g = T.drive || T.groove || null; groove = g ? keep.map(i => Math.max(g[i], g[i + 1] ?? g[i])) : null; drv = !!T.drive; down = T.downbeat_offset || 0; };
  // per-instrument events from the Demucs stems (TIMING.stems): 'drums' land on every beat, 'gtr' plays the galloping
  // strum (beat, and, a), 'felt' is bass+guitar (mostly beats 1 and 3). hit() = strength of the latest event, decaying.
  const EV = {}; const EV_SHIFT = 0.02;   // onset detection reports attacks ~20ms late
  function evList(name) { if (EV[name]) return EV[name]; const T = window.TIMING || {}; const L = (T.stems && T.stems[name]) || []; EV[name] = { t: L.map(e => e[0] - EV_SHIFT), s: L.map(e => e[1]) }; return EV[name]; }
  function hit(name, t, decay = 0.18) {   // decay: seconds to fall to 1/e
    const E = evList(name), n = E.t.length; if (!n) return 0; t += LEAD;
    let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (E.t[m] <= t) lo = m + 1; else hi = m; }
    let v = 0; for (let i = lo - 1; i >= 0 && i >= lo - 3; i--) v = Math.max(v, E.s[i] * Math.exp(-(t - E.t[i]) / decay));
    return Math.min(1, v); }
  function lastHit(name, t) {   // latest event at or before t: index, seconds since, strength
    const E = evList(name), n = E.t.length; t += LEAD; let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (E.t[m] <= t) lo = m + 1; else hi = m; }
    const i = lo - 1; return i < 0 ? { i: -1, dt: 99, s: 0 } : { i, dt: t - E.t[i], s: E.s[i] }; }
  function env(name, t) { const T = window.TIMING || {}; const L = T.stems && T.stems[name]; if (!L) return 0; const x = Math.max(0, Math.min(L.length - 1, t * 30)), i = Math.floor(x); return L[i] + ((L[Math.min(L.length - 1, i + 1)]) - L[i]) * (x - i); }
  // how hard bass+guitar actually play on each felt beat (0..1), used to scale the big half-time motions
  let feltS = null;
  function feltStrength(t) { init(); if (!feltS) { const E = evList('felt'); feltS = beats.map(bt => { let m = 0; for (let i = 0; i < E.t.length; i++) { const d = E.t[i] - bt; if (d > 0.09) break; if (d > -0.09) m = Math.max(m, E.s[i]); } return m; });
      feltS = feltS.map((v, i) => Math.max(v, 0.6 * (feltS[i - 1] || 0), 0.6 * (feltS[i + 1] || 0))); }
    const x = Math.max(0, Math.min(feltS.length - 1, beatOf(t))), i = Math.floor(x); return feltS[i] ?? 0; }
  const LEAD = 0.03;   // visuals a frame ahead of the sound reads as 'on' the beat; behind reads as late
  function rawBeatOf(t) { t += LEAD; init(); const b = raw, n = b.length; if (n < 2) return (t - B0) / P;
    if (t <= b[0]) return (t - b[0]) / (b[1] - b[0]); if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / (b[n - 1] - b[n - 2]);
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; } return lo + (t - b[lo]) / (b[hi] - b[lo]); }
  function rawTimeOfBeat(x) { init(); const b = raw, n = b.length; if (n < 2) return B0 + x * P;
    if (x <= 0) return b[0] + x * (b[1] - b[0]) - LEAD; if (x >= n - 1) return b[n - 1] + (x - n + 1) * (b[n - 1] - b[n - 2]) - LEAD;
    const i = Math.floor(x); return b[i] + (x - i) * (b[i + 1] - b[i]) - LEAD; }
  function beatOf(t) {
    t += LEAD; init(); const b = beats, n = b.length; if (n < 2) return (t - B0) / (2 * P);
    if (t <= b[0]) return (t - b[0]) / (b[1] - b[0]);
    if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / (b[n - 1] - b[n - 2]);
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; }
    return lo + (t - b[lo]) / (b[hi] - b[lo]);
  }
  function timeOfBeat(x) {
    init(); const b = beats, n = b.length; if (n < 2) return B0 + x * 2 * P;
    if (x <= 0) return b[0] + x * (b[1] - b[0]) - LEAD; if (x >= n - 1) return b[n - 1] + (x - n + 1) * (b[n - 1] - b[n - 2]) - LEAD;
    const i = Math.floor(x); return b[i] + (x - i) * (b[i + 1] - b[i]) - LEAD;
  }
  function grooveAt(t) { init(); if (!groove) return 1; const x = Math.max(0, Math.min(groove.length - 1, beatOf(t))), i = Math.floor(x), f = x - i; return groove[i] + (groove[Math.min(groove.length - 1, i + 1)] - groove[i]) * f; }
  // drive (absolute on-beat drum onset) keeps a floor once the drums are in; groove (ratio) was too eager to switch off in dense choruses
  const gate = t => drv ? Math.max(0, Math.min(1, 0.55 + 0.45 * (grooveAt(t) - 0.25) / 0.45)) : Math.max(0, Math.min(1, (grooveAt(t) - 0.3) / 0.5));
  return {
    BEAT0: B0, BEAT: 2 * P, RAW_BEAT: P, beatOf, timeOfBeat, rawBeatOf, rawTimeOfBeat, gate,
    beatPhase: t => { const b = beatOf(t); return b - Math.floor(b); },
    pulseRaw: (t, sharp = 6) => { const b = beatOf(t); return Math.exp(-sharp * (b - Math.floor(b))); },
    pulse: (t, sharp = 6) => { const b = beatOf(t); return Math.exp(-sharp * (b - Math.floor(b))) * (window.TIMING && window.TIMING.stems ? Math.min(1, 0.25 + feltStrength(t)) : gate(t)); },
    hit, env, feltStrength, lastHit,
    drum: (t, decay = 0.12) => hit('drums', t, decay),
    gtr: (t, decay = 0.15) => hit('gtr', t, decay),
    bar: t => Math.floor((rawBeatOf(t) - down) / 4),
    barTime: n => rawTimeOfBeat(n * 4 + down),
    loud: t => { const L = window.TIMING && window.TIMING.loudness_10hz; if (!L) return 0.5; const i = Math.max(0, Math.min(L.length - 1, t * 10)); const a = Math.floor(i); return L[a] + (L[Math.min(L.length - 1, a + 1)] - L[a]) * (i - a); },
  };
})();
window.MV = MV;
window.ENGINE = { lerpPose, walkPose, W, H, mulberry32, hash2, noise2, fbm, lerp, clamp, ease, easeOut, deg, POSES, figure, taper, drawSilhouette, drawOar };
