"use strict";
// Rehearsal. Talks to the real engine over /api. The only embedded data is
// geometry: city coordinates, a coarse US outline, and the brain's shape.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const api = async (p) => (await fetch(p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// size a canvas to its box at device resolution
function fit(cv, maxDpr = 2) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  cv._dpr = dpr;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
  return false;
}
// count a number up; always lands the final value, even when the tab is in the background
function countTo(el, to, dec = 0, suffix = "") {
  if (!el) return;
  const final = (dec ? Number(to).toFixed(dec) : Math.round(to).toLocaleString()) + suffix;
  const t0 = performance.now(), dur = 1200; let done = false;
  const land = () => { if (!done) { done = true; el.textContent = final; } };
  const f = (t) => { if (done) return; const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suffix; k < 1 ? requestAnimationFrame(f) : land(); };
  requestAnimationFrame(f); setTimeout(land, dur + 200);
}
function tri(p, X, Y, s, a) {
  p.moveTo(X + Math.cos(a) * s, Y + Math.sin(a) * s);
  p.lineTo(X + Math.cos(a + 2.094) * s, Y + Math.sin(a + 2.094) * s);
  p.lineTo(X + Math.cos(a + 4.189) * s, Y + Math.sin(a + 4.189) * s);
  p.closePath();
}

// ---------------------------------------------------------------- shared brain signal
// The TRIBE response curves, played on a loop once a rehearsal runs. Both the
// constellation brain and the waveform read from here so they stay in sync.
const REGIONS = { visual: { name: "Visual", col: "#5b8cff" }, auditory: { name: "Auditory", col: "#ff5ec4" }, language: { name: "Language", col: "#ffb829" }, attention: { name: "Attention", col: "#2fd3a5" } };
const Neuro = {
  series: null, dead: [], play0: 0, dur: 7000,
  play(tribe) { this.series = tribe && tribe.regions; this.dead = (tribe && tribe.deadZones) || []; this.play0 = performance.now(); },
  reset() { this.series = null; this.dead = []; },
  p(now) { return this.series ? ((now - this.play0) / this.dur) % 1 : 0; },
  I(r, now) {
    const arr = this.series && this.series[r]; if (!arr || !arr.length) return 0;
    const N = arr.length, idx = this.p(now) * (N - 1), i = Math.floor(idx), f = idx - i;
    return clamp01(((arr[i] ?? 0) * (1 - f) + (arr[Math.min(N - 1, i + 1)] ?? 0) * f - 22) / 70);
  },
};

// ---------------------------------------------------------------- the constellation brain
// A fixed canvas behind the page. Thousands of outlined triangles sit on the
// surface of a 3D brain; the brain forms beside sections marked data-brain and
// bursts into a starfield between them. During a run, cortex regions light up
// with the TRIBE signal.
const Field = (() => {
  const cv = $("#field"), ctx = cv.getContext("2d");
  const small = innerWidth < 760;
  const rnd = mulberry(19);
  const PAL = [["#ffffff", 0.2], ["#b394ff", 0.15], ["#8052ff", 0.13], ["#ffb829", 0.13], ["#2fd3a5", 0.13], ["#ff5ec4", 0.1], ["#5b8cff", 0.16]];
  const pick = () => { const r = rnd(); let a = 0; for (const [c, w] of PAL) { a += w; if (r < a) return c; } return "#ffffff"; };
  const RIM = "#ffc93c";
  const surf = (cx, cy, cz, rx, ry, rz, fold) => {
    const u = rnd() * 2 - 1, th = rnd() * 6.2832, s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    const f = 1 + fold * Math.sin(dx * 9 + dz * 7) * Math.sin(dy * 8 + dz * 5); // gyri
    const k = rnd() < 0.1 ? 0.55 + rnd() * 0.35 : 1; // a little inner volume
    return [cx + dx * rx * f * k, cy + dy * ry * f * k, cz + dz * rz * f * k, dx, dy, dz];
  };
  const pts = [];
  for (let i = 0, N = small ? 1600 : 3600; i < N; i++) {
    const r = rnd(); let p, motor = false;
    if (r < 0.86) { // two hemispheres with a fissure and a flatter base
      const side = rnd() < 0.5 ? -1 : 1;
      p = surf(side * 0.31, 0.08, 0, 0.37, 0.5, 0.8, 0.08);
      if (p[1] < -0.27) p[1] = -0.27 + (p[1] + 0.27) * 0.4;
      if (side * p[0] < 0.035) p[0] = side * 0.035;
    } else if (r < 0.96) { p = surf(0, -0.42, -0.5, 0.48, 0.19, 0.27, 0.05); motor = true; } // cerebellum
    else { const t = rnd(); p = [(rnd() - 0.5) * 0.14, -0.5 - t * 0.62, -0.27 + (rnd() - 0.5) * 0.1, 0, 0, 1]; motor = true; } // stem
    const [x, y, z, nx, ny, nz] = p;
    const region = motor ? null : z > 0.36 ? "language" : z < -0.34 && y > -0.25 ? "visual" : y > 0.3 ? "attention" : "auditory";
    const u = rnd() * 2 - 1, th = rnd() * 6.2832, s = Math.sqrt(1 - u * u), R = 1.3 + Math.pow(rnd(), 0.6) * 2.8;
    pts.push({ x, y, z, nx, ny, nz, tx: s * Math.cos(th) * R * 1.7, ty: u * R, tz: s * Math.sin(th) * R, c: pick(), region, a: rnd() * 6.283, va: (rnd() - 0.5) * 1.2, k: 0.7 + rnd() * 0.8 });
  }
  const TV = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], TE = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const tets = Array.from({ length: small ? 5 : 9 }, () => ({ x: rnd(), y: rnd(), s: 14 + rnd() * 46, c: ["#8052ff", "#2fd3a5", "#ffb829", "#5b8cff", "#ff5ec4", "#b394ff"][(rnd() * 6) | 0], rx: rnd() * 6, ry: rnd() * 6, vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5, dx: (rnd() - 0.5) * 0.00025, dy: (rnd() - 0.5) * 0.0002 }));
  const anchors = $$("[data-brain]");
  let formed = 1, side = 0.71, mx = 0, my = 0, last = 0;
  addEventListener("mousemove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  function target() {
    const H = innerHeight; let best = 0, sd = side;
    for (const el of anchors) {
      const r = el.getBoundingClientRect(), mid = r.top + Math.min(r.height, H) / 2;
      let w = clamp01(1 - Math.abs(mid - H / 2) / H / 0.5);
      if (el.dataset.brain === "center") w *= 0.55; // a partial brain behind the closing line
      if (w > best) { best = w; sd = el.dataset.brain === "left" ? 0.3 : el.dataset.brain === "center" ? 0.5 : 0.71; }
    }
    return [best, sd];
  }

  function frame(now) {
    fit(cv, 1.5);
    const W = cv.width, H = cv.height, d = cv._dpr || 1, t = REDUCED ? 0 : now / 1000;
    const [tb, ts] = target();
    // time-based easing: converges in about a second whatever the frame rate
    const dt = last ? Math.min(1, (now - last) / 1000) : 1; last = now;
    const kf = 1 - Math.exp(-dt * 4.5);
    formed += (ease(tb) - formed) * kf; side += (ts - side) * kf;
    ctx.clearRect(0, 0, W, H);

    const yaw = t * 0.16 + mx * 0.5, pitch = 0.12 + my * 0.22;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const mobile = W / d < 760;
    // on phones the brain sits faintly behind the headline, clear of the controls
    const bcx = mobile ? W * 0.62 : W * side, bcy = mobile ? H * 0.27 : H * 0.5;
    const bsc = mobile ? W * 0.4 : Math.min(W * 0.33, H * 0.47);
    const ssc = Math.max(W, H) * 0.32;
    const cx = W / 2 + (bcx - W / 2) * formed, cy = H / 2 + (bcy - H / 2) * formed, sc = ssc + (bsc - ssc) * formed;
    const F = 3.3, k = 1 - formed, alpha = mobile ? 0.38 : 1;
    const lit = Neuro.series ? { visual: Neuro.I("visual", now), auditory: Neuro.I("auditory", now), language: Neuro.I("language", now), attention: Neuro.I("attention", now) } : null;

    const paths = new Map();
    const P = (key) => { let p = paths.get(key); if (!p) { p = new Path2D(); paths.set(key, p); } return p; };
    for (const q of pts) {
      const x = q.x + (q.tx - q.x) * k, y = q.y + (q.ty - q.y) * k, z = q.z + (q.tz - q.z) * k;
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const per = F / (F - z2); if (per <= 0) continue;
      const X = cx + x1 * sc * per, Y = cy - y2 * sc * per;
      if (X < -30 || X > W + 30 || Y < -30 || Y > H + 30) continue;
      let col = q.c, boost = 1;
      if (formed > 0.4) { const zn = q.ny * sp + (-q.nx * syw + q.nz * cyw) * cp; if (Math.abs(zn) < 0.34) col = RIM; } // amber rim
      if (lit && q.region) { const I = lit[q.region]; if (I > 0.5) { col = REGIONS[q.region].col; boost = 1 + I; } }
      const depth = z2 < -0.4 ? 0 : z2 < 0.25 ? 1 : 2;
      tri(P(col + "|" + depth), X, Y, 3.6 * d * q.k * per * boost, q.a + t * q.va);
    }
    ctx.lineWidth = 1.15 * d; ctx.lineJoin = "round";
    const DA = [0.42, 0.72, 1];
    for (const [key, p] of paths) { const i = key.lastIndexOf("|"); ctx.globalAlpha = DA[+key.slice(i + 1)] * alpha; ctx.strokeStyle = key.slice(0, i); ctx.stroke(p); }

    // big wireframe tetrahedra, more visible as the brain scatters
    ctx.lineWidth = 1.6 * d;
    for (const o of tets) {
      if (!REDUCED) { o.x = (o.x + o.dx + 1) % 1; o.y = (o.y + o.dy + 1) % 1; o.rx += o.vx * 0.016; o.ry += o.vy * 0.016; }
      const ca = Math.cos(o.rx), sa = Math.sin(o.rx), cb = Math.cos(o.ry), sb = Math.sin(o.ry);
      const V = TV.map(([a, b, c]) => { const y1 = b * ca - c * sa, z1 = b * sa + c * ca; return [o.x * W + (a * cb + z1 * sb) * o.s * d * 0.6, o.y * H + y1 * o.s * d * 0.6]; });
      ctx.globalAlpha = (0.12 + 0.5 * k) * alpha; ctx.strokeStyle = o.c; ctx.beginPath();
      for (const [i, j] of TE) { ctx.moveTo(V[i][0], V[i][1]); ctx.lineTo(V[j][0], V[j][1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return { frame };
})();

// ---------------------------------------------------------------- the constellation map
const METROS = {
  Seattle:[-122.3,47.6],Portland:[-122.7,45.5],"San Francisco":[-122.4,37.8],"Los Angeles":[-118.2,34.1],
  "Las Vegas":[-115.1,36.2],Phoenix:[-112.1,33.4],"Salt Lake City":[-111.9,40.8],Denver:[-104.9,39.7],
  Dallas:[-96.8,32.8],Houston:[-95.4,29.8],"San Antonio":[-98.5,29.4],"Kansas City":[-94.6,39.1],
  Minneapolis:[-93.3,45],"St. Louis":[-90.2,38.6],Memphis:[-90,35.1],"New Orleans":[-90.1,30],
  Chicago:[-87.6,41.9],Detroit:[-83,42.3],Nashville:[-86.8,36.2],Atlanta:[-84.4,33.7],
  Charlotte:[-80.8,35.2],Raleigh:[-78.6,35.8],Miami:[-80.2,25.8],Orlando:[-81.4,28.5],
  Cleveland:[-81.7,41.5],Washington:[-77,38.9],Baltimore:[-76.6,39.3],Philadelphia:[-75.2,40],
  "New York":[-74,40.7],Boston:[-71.1,42.4]
};
const US = [[-124.7,48.4],[-123.2,48.2],[-122.8,49],[-95.2,49],[-95.2,49.4],[-94.8,48.7],[-91.5,48.1],[-89.6,48],[-84.8,46.5],[-82.5,45.3],[-82.4,43],[-83.1,42],[-80.5,42],[-79,42.8],[-79,43.3],[-76.5,43.6],[-76.2,44.3],[-74.9,45],[-71.5,45],[-70.6,45.5],[-70.2,46.4],[-69.2,47.4],[-67.8,47.1],[-67.8,45.7],[-67,44.8],[-68.8,44.3],[-70.2,43.6],[-70.7,42.9],[-70,41.7],[-71.9,41.3],[-73.9,40.6],[-74,39.7],[-75,38.8],[-75.9,37.2],[-76.3,36.9],[-75.5,35.2],[-76.5,34.7],[-77.9,33.9],[-79.2,33.2],[-80.4,32.4],[-81.1,31.8],[-81.4,30.4],[-81,29.2],[-80.4,27.6],[-80,26.6],[-80.4,25.2],[-81,25.1],[-81.8,26.1],[-82.7,27.5],[-82.6,28.8],[-83.6,29.9],[-84.4,30],[-85.4,29.7],[-86.4,30.4],[-88,30.4],[-89.4,30.3],[-89.4,29.2],[-90.2,29.1],[-91.6,29.6],[-93.2,29.8],[-94.7,29.4],[-96,28.6],[-97.2,27.6],[-97.4,25.9],[-98.4,26.2],[-99.3,26.9],[-100.1,28.2],[-101.4,29.8],[-102.6,29.8],[-103.2,29],[-104.5,29.7],[-105,30.7],[-106.5,31.8],[-108.2,31.8],[-108.2,31.3],[-111.1,31.3],[-114.8,32.5],[-117.1,32.5],[-117.3,33.1],[-118.5,34],[-119.6,34.4],[-120.6,34.6],[-121,35.6],[-121.9,36.6],[-122.4,37.2],[-122.5,37.8],[-123,38],[-123.7,39],[-123.8,40],[-124.4,40.4],[-124.2,41.8],[-124.5,42.8],[-124.1,43.8],[-123.9,45.5],[-124,46.3],[-124.1,47.3],[-124.7,48.4]];
const proj = (lon, lat) => [((lon + 125) / 58) * 1000, ((50 - lat) / 26) * 600];
const AGE_COL = { "18–29": "#5b8cff", "30–44": "#b394ff", "45–54": "#ffb829", "55+": "#ff5ec4" };
const SCORE_COL = { 1: "#ff3d71", 2: "#ff8a5c", 3: "#bdbdbd", 4: "#7ff0c8", 5: "#2ee6a6" };

const MapViz = (() => {
  const cv = $("#map"), ctx = cv.getContext("2d");
  const POLY = US.map(([lo, la]) => proj(lo, la));
  const inside = (x, y) => { let c = false; for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) { const [xi, yi] = POLY[i], [xj, yj] = POLY[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const GRID = []; for (let y = 6; y < 600; y += 12) for (let x = 6; x < 1000; x += 12) if (inside(x, y)) GRID.push([x, y]);
  const GCOL = ["#5b8cff", "#8052ff", "#2fd3a5", "#ffffff", "#b394ff"];
  let s = 1, ox = 0, oy = 0, d = 1, base = null;
  let metros = [], parts = [], byId = new Map(), scored = false, scoreT0 = 0, top = null, split = null;

  function layout() {
    d = cv._dpr || 1;
    s = Math.min(cv.width / 1000, cv.height / 600) * 0.96; ox = (cv.width - 1000 * s) / 2; oy = (cv.height - 600 * s) / 2;
    base = document.createElement("canvas"); base.width = cv.width; base.height = cv.height;
    const b = base.getContext("2d"); b.lineWidth = 0.9 * d;
    GCOL.forEach((c, ci) => { const p = new Path2D(); GRID.forEach(([x, y], i) => { if (i % GCOL.length === ci) tri(p, ox + x * s, oy + y * s, 1.7 * s, (i * 1.7) % 6.28); }); b.globalAlpha = 0.28; b.strokeStyle = c; b.stroke(p); });
  }
  function setAudience(aud) {
    scored = false; split = null;
    metros = Object.entries(aud.metros || {}).filter(([m]) => METROS[m]).map(([m, w]) => { const [x, y] = proj(...METROS[m]); return { name: m, x, y, w }; }).sort((a, b) => b.w - a.w);
    const now = performance.now();
    parts = (aud.personas || []).filter((p) => METROS[p.metro]).map((p, i) => {
      const [mx, my] = proj(...METROS[p.metro]);
      const rr = 3 + Math.sqrt(Math.random()) * (12 + Math.sqrt(aud.metros[p.metro] || 0.3) * 22), a = Math.random() * 6.283;
      const tx = mx + Math.cos(a) * rr, ty = my + Math.sin(a) * rr * 0.8;
      const ang = Math.random() * 6.283, R = 700 + Math.random() * 400;
      return { p, id: p.id, tx, ty, sx: REDUCED ? tx : 500 + Math.cos(ang) * R, sy: REDUCED ? ty : 300 + Math.sin(ang) * R, t0: now + i * 1.4, score: 0, sd: 0, a: Math.random() * 6.28 };
    });
    byId = new Map(parts.map((q) => [q.id, q])); top = metros[0] || null;
  }
  function clear() { metros = []; parts = []; scored = false; split = null; }
  function setReactions(reactions, topName) {
    const t = metros.find((m) => m.name === topName) || metros[0]; top = t || top;
    for (const [id, sc] of reactions || []) { const q = byId.get(id); if (!q) continue; q.score = sc; q.sd = t ? Math.hypot(q.tx - t.x, q.ty - t.y) * 2.6 : 0; }
    scored = true; scoreT0 = performance.now();
  }
  function setSplit(sp) {
    const a = sp && METROS[sp.top.metro], b = sp && METROS[sp.bottom.metro];
    split = a && b ? { top: { name: sp.top.metro, mean: sp.top.mean, xy: proj(...a) }, bot: { name: sp.bottom.metro, mean: sp.bottom.mean, xy: proj(...b) } } : null;
  }
  function label(text, X, Y, col, align = "center") {
    ctx.font = `400 ${14 * d}px "Inter Tight", sans-serif`; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 8 * d; ctx.fillStyle = col; ctx.fillText(text, X, Y); ctx.shadowBlur = 0;
  }
  function frame(now) {
    const r = cv.getBoundingClientRect();
    if (r.bottom < -50 || r.top > innerHeight + 50) return; // off screen: skip
    if (fit(cv) || !base) layout();
    const W = cv.width, H = cv.height, t = REDUCED ? 0 : now;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);
    const P = (x, y) => [ox + x * s, oy + y * s];

    for (const m of metros) { // violet glow where the audience lives
      const [X, Y] = P(m.x, m.y), R = (14 + m.w * 46) * s;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
      g.addColorStop(0, `rgba(128,82,255,${0.12 + m.w * 0.3})`); g.addColorStop(1, "rgba(128,82,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.283); ctx.fill();
    }

    const paths = new Map(); const Pp = (c) => { let p = paths.get(c); if (!p) { p = new Path2D(); paths.set(c, p); } return p; };
    for (const q of parts) {
      const k = REDUCED ? 1 : clamp01((now - q.t0) / 1400), e = ease(k);
      q.x = q.sx + (q.tx - q.sx) * e; q.y = q.sy + (q.ty - q.sy) * e;
      const [X, Y] = P(q.x, q.y);
      const lit = scored && now - scoreT0 > q.sd;
      tri(Pp(lit ? SCORE_COL[q.score] : AGE_COL[q.p.age] || "#ffffff"), X, Y, (lit && q.score >= 4 ? 3.6 : 3) * s, q.a + t / 900);
    }
    // normal blending so each person keeps their colour (additive washes dense cities to white)
    ctx.lineWidth = 1.2 * d; ctx.globalAlpha = 0.9;
    for (const [c, p] of paths) { ctx.strokeStyle = c; ctx.stroke(p); }
    ctx.globalAlpha = 1;

    if (scored && top && !REDUCED) { // the reaction rolling out from the strongest city
      const rad = (now - scoreT0) / 2.6;
      if (rad < 1300) { const [X, Y] = P(top.x, top.y); ctx.strokeStyle = `rgba(46,230,166,${0.6 * (1 - rad / 1300)})`; ctx.lineWidth = 1.5 * d; ctx.beginPath(); ctx.arc(X, Y, rad * s, 0, 6.283); ctx.stroke(); }
    }
    metros.slice(0, 7).forEach((m) => { const [X, Y] = P(m.x, m.y); label(m.name.toUpperCase(), X + 10 * d, Y - 12 * d, "rgba(255,255,255,0.7)", "left"); });

    if (split && scored && now - scoreT0 > 1400) {
      const [ax, ay] = P(...split.top.xy), [bx, by] = P(...split.bot.xy);
      ctx.save(); ctx.setLineDash([5 * d, 7 * d]); ctx.lineDashOffset = -t / 45; ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.2 * d;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 130 * s, bx, by); ctx.stroke(); ctx.restore();
      label(`▲ ${split.top.mean.toFixed(1)}  ${split.top.name}`, ax, ay + 26 * d, "#2ee6a6");
      label(`▼ ${split.bot.mean.toFixed(1)}  ${split.bot.name}`, bx, by + 26 * d, "#ff3d71");
    }
  }
  const tip = $("#ptip");
  cv.addEventListener("mousemove", (ev) => {
    const r = cv.getBoundingClientRect(), mx = (ev.clientX - r.left) * d, my = (ev.clientY - r.top) * d;
    let best = null, bd = (10 * d) ** 2;
    for (const q of parts) { if (q.x == null) continue; const X = ox + q.x * s, Y = oy + q.y * s, dd = (X - mx) ** 2 + (Y - my) ** 2; if (dd < bd) { bd = dd; best = q; } }
    if (!best) { tip.style.display = "none"; return; }
    const p = best.p;
    tip.innerHTML = `<b>Person ${p.id}</b> · ${esc(p.metro)} · ${esc(p.age)}${best.score && scored ? ` · <b style="color:${SCORE_COL[best.score]}">${best.score}/5</b>` : ""}<div class="t">Loves ${p.tastes.map(esc).join(", ")}</div>`;
    let x = ev.clientX - r.left + 16, y = ev.clientY - r.top + 16;
    if (x > r.width - 260) x -= 280; if (y > r.height - 90) y -= 110;
    tip.style.left = x + "px"; tip.style.top = y + "px"; tip.style.display = "block";
  });
  cv.addEventListener("mouseleave", () => (tip.style.display = "none"));
  return { frame, setAudience, setReactions, setSplit, clear };
})();

// ---------------------------------------------------------------- the waveform
const Wave = (() => {
  const cv = $("#wave"), ctx = cv.getContext("2d");
  const legend = $("#regions"); let lastL = 0;
  legend.innerHTML = Object.entries(REGIONS).map(([k, r]) => `<span style="--c:${r.col}">${r.name}<b id="rv-${k}">—</b></span>`).join("");
  function frame(now) {
    const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    fit(cv); const W = cv.width, H = cv.height, d = cv._dpr || 1, padB = 20 * d, plotH = H - padB;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1 * d; ctx.beginPath(); ctx.moveTo(0, plotH); ctx.lineTo(W, plotH); ctx.stroke();
    ctx.font = `400 ${11 * d}px "Inter Tight", sans-serif`; ctx.textBaseline = "alphabetic";
    if (!Neuro.series) {
      ctx.strokeStyle = "rgba(128,82,255,0.45)"; ctx.lineWidth = 1.2 * d; ctx.beginPath();
      for (let x = 0; x <= W; x += 3 * d) { const y = plotH / 2 + Math.sin(x / (16 * d) + (REDUCED ? 0 : now / 500)) * 7 * d; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.fillStyle = "#5f5f66"; ctx.fillText("Brain response appears here during a rehearsal", 0, H - 4 * d);
      return;
    }
    const N = (Neuro.series.language || []).length || 25, step = W / (N - 1);
    for (const z of Neuro.dead) { ctx.fillStyle = "rgba(255,94,196,0.12)"; ctx.fillRect(z.start * step, 0, Math.max(2, (z.end - z.start) * step), plotH); ctx.fillStyle = "#ff5ec4"; ctx.fillText("attention drops", z.start * step + 4 * d, 13 * d); }
    for (const [k, rg] of Object.entries(REGIONS)) {
      const arr = Neuro.series[k] || []; ctx.strokeStyle = rg.col; ctx.globalAlpha = k === "language" ? 1 : 0.65; ctx.lineWidth = (k === "language" ? 2 : 1.2) * d;
      ctx.beginPath(); arr.forEach((v, i) => { const x = i * step, y = plotH - (v / 100) * (plotH - 8 * d); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const px = Neuro.p(now) * W;
    ctx.strokeStyle = "#8052ff"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, plotH); ctx.stroke();
    ctx.fillStyle = "#9a9a9a"; ctx.textAlign = "left"; ctx.fillText("Start", 0, H - 4 * d); ctx.textAlign = "right"; ctx.fillText("Punchline", W, H - 4 * d); ctx.textAlign = "left";
    if (now - lastL > 180) { lastL = now; for (const k of Object.keys(REGIONS)) { const el = $("#rv-" + k); if (el) el.textContent = Math.round(Neuro.I(k, now) * 100) + "%"; } }
  }
  return { frame, clear: () => { for (const k of Object.keys(REGIONS)) { const el = $("#rv-" + k); if (el) el.textContent = "—"; } } };
})();

(function loop(now) { Field.frame(now); MapViz.frame(now); Wave.frame(now); requestAnimationFrame(loop); })(performance.now());

// ---------------------------------------------------------------- page state
const state = { name: "Cedric the Entertainer", aud: null, tok: 0, busy: false, kind: "people", proof: false };
const runBtns = () => [$("#launch"), $("#navrun"), $("#endrun")];
function setRun(enabled, text = "Run rehearsal") { runBtns().forEach((b) => { b.disabled = !enabled; b.textContent = text; }); $("#launch").classList.toggle("breathe", enabled && text === "Run rehearsal"); }
const status = (html) => ($("#status").innerHTML = html);
function toast(on, text, frac) { const t = $("#toast"); t.classList.toggle("on", !!on); if (text) $("#toast-t").textContent = text; if (frac != null) $("#toast-b").style.width = Math.round(frac * 100) + "%"; }
function legendAges() { $("#maplegend").innerHTML = Object.entries(AGE_COL).map(([k, c]) => `<span><i style="color:${c}"></i>${k}</span>`).join("") + `<span>One triangle is one person, coloured by age.</span>`; }
function legendScores() { $("#maplegend").innerHTML = [1, 2, 3, 4, 5].map((s) => `<span><i style="color:${SCORE_COL[s]}"></i>${s === 1 ? "1 · hated it" : s === 5 ? "5 · loved it" : s}</span>`).join("") + `<span>Coloured by how each person reacted.</span>`; }
function mapState(text, bad) { const el = $("#mapstate"); el.textContent = text || ""; el.classList.toggle("bad", !!bad); }

// mission log
const logEl = $("#log"); let runT0 = performance.now();
const fmtT = (ms) => { const s = ms / 1000; return "T+" + String(Math.floor(s / 60)).padStart(2, "0") + ":" + (s % 60).toFixed(1).padStart(4, "0"); };
function logReset(msg) { logEl.innerHTML = '<span class="caret"></span>'; if (msg) log("sys", msg); }
function log(tag, text, dec) {
  const el = document.createElement("div"); el.className = "ln";
  el.innerHTML = `<span class="ts">${fmtT(performance.now() - runT0)}</span><span><span class="tg ${tag}">${tag.toUpperCase()}</span><span class="tx${dec ? " dec" : ""}"></span></span>`;
  logEl.insertBefore(el, logEl.querySelector(".caret"));
  const node = el.querySelector(".tx"); let i = 0; const stp = Math.max(1, Math.ceil(text.length / 50));
  const iv = setInterval(() => { i += stp; node.textContent = text.slice(0, i); if (i >= text.length) clearInterval(iv); }, 16);
  setTimeout(() => { clearInterval(iv); node.textContent = text; }, 1400);
}

// ---------------------------------------------------------------- lock on to an audience
function renderCrowd(aud) {
  const people = (aud.personas || []).length, cities = Object.keys(aud.metros || {}).length;
  const topCity = Object.entries(aud.metros || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  countTo($("#st-people"), people); countTo($("#st-cities"), cities); countTo($("#st-calls"), aud.calls);
  $("#st-top").textContent = topCity;
  const demo = aud.demographics || [];
  const age = demo.filter(([k]) => !/male/i.test(k)).sort((a, b) => b[1] - a[1])[0];
  const sex = demo.filter(([k]) => /male/i.test(k)).sort((a, b) => b[1] - a[1])[0];
  const D = aud.domains || {};
  const loves = [...(D.artist || []).slice(0, 3), ...(D.tv_show || []).slice(0, 2), ...(D.podcast || []).slice(0, 1), ...(D.movie || []).slice(0, 2)].map((x) => x.name);
  $("#lean").innerHTML = (age ? `Leans <b>${esc(age[0])}</b> (${age[1] > 0 ? "+" : ""}${age[1].toFixed(2)})` : "") + (sex ? ` and <b>${esc(sex[0].toLowerCase())}</b> (${sex[1] > 0 ? "+" : ""}${sex[1].toFixed(2)})` : "") + (loves.length ? `. Loves <b>${loves.map(esc).join(", ")}</b>.` : ".");
  $("#payload").innerHTML = aud.stimulus ? `<em>${esc(aud.stimulus.label)}</em> — “${esc(aud.stimulus.text)}”` : "—";
}
function resetVerdict() {
  $("#v-score").textContent = "?"; $("#v-score").style.color = "var(--dim)"; $("#v-love").innerHTML = '<span class="muted">Run a rehearsal to see the crowd\'s verdict.</span>'; $("#v-split").innerHTML = ""; $("#quotes").innerHTML = "";
  $("#moves").innerHTML = '<div class="empty">The agent\'s plan appears here after a run.</div>';
  Neuro.reset(); Wave.clear();
}

async function lockOn(name) {
  const tok = ++state.tok; state.name = name; state.aud = null; state.busy = false;
  $$(".presets .ghost").forEach((b) => b.setAttribute("aria-pressed", b.dataset.name === name ? "true" : "false"));
  setRun(false); status(`Reading Qloo for <b>${esc(name)}</b>…`); toast(false);
  resetVerdict(); MapViz.clear(); legendAges(); mapState("Asking Qloo where this audience lives…");
  ["#st-people", "#st-cities", "#st-top", "#st-calls"].forEach((s) => ($(s).textContent = "—")); $("#lean").textContent = ""; $("#payload").textContent = "—";
  $("#partners").innerHTML = '<div class="empty">Loading partners…</div>'; $("#hists").innerHTML = '<div class="empty">Loading the comparison…</div>';
  runT0 = performance.now(); logReset(`Locking on to ${name}…`);

  const aud = await api("/api/audience?name=" + encodeURIComponent(name));
  if (tok !== state.tok) return;
  if (aud.status === "needs_input") { mapState("That name matches several things. Be more specific.", true); status("Qloo found several matches: " + aud.candidates.map((c) => esc(c.name)).join(", ")); return; }
  if (aud.status !== "ok") { mapState("Qloo doesn't know this one.", true); status("No match in Qloo. Try another name."); return; }
  state.aud = aud;
  renderCrowd(aud); MapViz.setAudience(aud); renderReceipts(aud.receipts);
  if (!aud.coverage.ok) { mapState("Not enough signal. Rehearsal won't guess.", true); status("Qloo can't see this audience well enough. <b>Rehearsal won't guess.</b>"); return; }
  mapState("");
  const cities = Object.keys(aud.metros).length;
  status(`Ready. <b>${aud.personas.length.toLocaleString()} people</b> placed across <b>${cities} cities</b>.`);
  log("qloo", `Locked on: ${aud.audience.name}. ${aud.personas.length} people across ${cities} cities.`);
  setRun(true);
  loadPartners(true); loadWithout(); loadProof();
}

// ---------------------------------------------------------------- the run
let userScrolled = false;
["wheel", "touchmove", "keydown"].forEach((ev) => addEventListener(ev, (e) => { if (state.busy && (ev !== "keydown" || ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key))) userScrolled = true; }, { passive: true }));
// our own eased scroll: native smooth scrolls cancel each other while the page
// grows, so this animates explicitly and always lands on the target
let scrollAnim = 0;
function goTo(sel, center) {
  if (userScrolled) return;
  const r = $(sel).getBoundingClientRect();
  const y = Math.max(0, Math.round(r.top + scrollY - (center ? (innerHeight - r.height) / 2 + 30 : 0))), y0 = scrollY, t0 = performance.now(), dur = REDUCED ? 0 : 1200, id = ++scrollAnim;
  const step = (t) => { if (id !== scrollAnim || userScrolled) return; const k = Math.min(1, (t - t0) / dur); window.scrollTo({ top: y0 + (y - y0) * ease(k), behavior: "instant" }); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { if (id === scrollAnim && !userScrolled) window.scrollTo({ top: y, behavior: "instant" }); }, dur + 150);
}

function setVerdict(reh) {
  const a = reh.aggregate;
  $("#v-score").style.color = ""; countTo($("#v-score"), a.mean, 1);
  $("#v-love").innerHTML = `<b class="num" id="v-pct">0%</b> of the crowd loved it.`; countTo($("#v-pct"), a.pct45, 0, "%");
  $("#v-split").innerHTML = reh.split ? `Strongest in <span class="up">${esc(reh.split.top.metro)} ${reh.split.top.mean.toFixed(1)}</span>, softest in <span class="dn">${esc(reh.split.bottom.metro)} ${reh.split.bottom.mean.toFixed(1)}</span>.` : "";
  $("#quotes").innerHTML = a.quotes.map((q, i) => {
    const m = /\((\d)\/5\)/.exec(q.text), sc = m ? +m[1] : 3;
    return `<div class="q" style="animation-delay:${0.4 + i * 0.18}s">“${esc(q.text.replace(/\s*\(\d\/5\)/, ""))}”<span class="s" style="color:${SCORE_COL[sc]}">${sc}/5</span><small>${esc(q.persona)}</small></div>`;
  }).join("");
}
function renderMoves(plan) {
  $("#moves").innerHTML = (plan || []).map((p, i) => `<div class="move" style="animation-delay:${i * 0.2}s"><div class="n ${p.lever}">0${i + 1} · ${p.lever === "edit" ? "Edit" : "Grow"}</div><h3>${esc(p.title)}</h3><p>${esc(p.detail)}</p><div class="rc">Based on ${esc(p.receipt)}</div></div>`).join("") || '<div class="empty">No move cleared the bar.</div>';
}

async function launch() {
  if (state.busy || !state.aud) return;
  state.busy = true; userScrolled = false;
  const tok = state.tok, name = state.name, aud = state.aud;
  setRun(false, "Running…"); runT0 = performance.now(); logReset(`Rehearsal started for ${name}.`);
  toast(true, "Reading the audience", 0.08);
  const topCity = Object.entries(aud.metros).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  log("qloo", `Fingerprint locked: ${aud.calls} Qloo calls. Strongest in ${topCity}.`);
  await sleep(600);

  toast(true, "Simulating 1,000 people", 0.3); goTo("#mapbox", true); log("panel", "Simulating 1,000 people from the taste graph…");
  const reh = await api("/api/rehearse?name=" + encodeURIComponent(name));
  if (tok !== state.tok) return;
  if (reh.status !== "ok") { toast(true, "Not enough signal — Rehearsal won't guess", 1); log("sys", "Signal too weak. Refusing to guess."); state.busy = false; setRun(true); return; }
  await sleep(900);
  MapViz.setReactions(reh.reactions, reh.split?.top.metro); MapViz.setSplit(reh.split); legendScores();
  log("panel", `${reh.aggregate.n.toLocaleString()} reactions in: ${reh.aggregate.mean.toFixed(1)}/5, ${reh.aggregate.pct45}% loved it.`);
  if (reh.split) log("panel", `${reh.split.top.metro} leads at ${reh.split.top.mean.toFixed(1)}; ${reh.split.bottom.metro} trails at ${reh.split.bottom.mean.toFixed(1)}.`);
  renderReceipts(reh.receipts);
  await sleep(3200);

  toast(true, "Measuring the reaction", 0.6); goTo("#verdict");
  Neuro.play(reh.tribe); setVerdict(reh);
  log("tribe", reh.tribe.deadZones.length ? `Attention drops in ${reh.tribe.deadZones.length} stretch(es) before the punchline.` : "Attention holds all the way through.");
  await sleep(4200);

  toast(true, "Planning the next move", 0.82); goTo("#agent"); log("agent", "The Director is planning the next move…");
  const dir = await api("/api/director?name=" + encodeURIComponent(name));
  if (tok !== state.tok) return;
  if (dir.status === "ok") {
    for (const st of dir.steps.slice(2)) { await sleep(450); log("agent", `${st.action}: ${st.observed}`); if (st.decided) { await sleep(350); log("agent", st.decided, true); } }
    await sleep(300); renderMoves(dir.plan); log("sys", "Done. The plan is ranked on the right.");
  } else log("sys", "The agent couldn't plan for this audience.");
  toast(true, "Rehearsal complete", 1); setTimeout(() => toast(false), 2400);
  state.busy = false; setRun(true, "Run again");
}
runBtns().forEach((b) => b.addEventListener("click", launch));

// ---------------------------------------------------------------- grow, without, proof, receipts
async function loadPartners(force) {
  if (!state.aud) return;
  const loc = $("#grow-loc").value.trim(), sig = state.name + "|" + state.kind + "|" + loc;
  if (!force && state.partnersSig === sig) return; state.partnersSig = sig; const tok = state.tok;
  $("#partners").innerHTML = `<div class="empty">Searching Qloo for ${esc(state.kind)} to partner with…</div>`;
  const d = await api(`/api/partners?name=${encodeURIComponent(state.name)}&kind=${state.kind}${loc ? "&location=" + encodeURIComponent(loc) : ""}`);
  if (tok !== state.tok) return;
  if (d.status !== "ok" || !d.partners.length) { $("#partners").innerHTML = '<div class="empty">No partner cleared the bar for this audience.</div>'; return; }
  const meter = (k, v, c) => `<div class="meter"><span>${k}</span><span class="t"><i style="width:${Math.round(v * 100)}%;background:${c}"></i></span><span>${Math.round(v * 100)}%</span></div>`;
  $("#partners").innerHTML = d.partners.slice(0, 8).map((p, i) => `<div class="prow" style="animation-delay:${i * 0.06}s"><div class="b num" style="color:${p.barter >= 40 ? "var(--good)" : p.barter >= 25 ? "var(--saffron)" : "var(--ash)"}">${p.barter}<small>Partner fit</small></div><div><h3>${esc(p.name)}</h3><div class="meters">${meter("Would cross over", p.convert, "#5b8cff")}${meter("Shared taste", p.overlap, "#ffb829")}${meter("New to you", p.netnew, "#2ee6a6")}</div></div><div class="why">${esc(p.why)}</div></div>`).join("");
}
$$(".kind").forEach((b) => b.addEventListener("click", () => { state.kind = b.dataset.kind; $$(".kind").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false")); loadPartners(true); }));
$("#grow-loc").addEventListener("change", () => loadPartners(true));

async function loadWithout() {
  const tok = state.tok, d = await api("/api/ablation?name=" + encodeURIComponent(state.name));
  if (tok !== state.tok) return;
  if (d.status !== "ok") { $("#hists").innerHTML = '<div class="empty">Comparison unavailable for this audience.</div>'; return; }
  const side = (s, col, title) => `<div><h3>${title}</h3><div class="hist">${s.hist.map((v) => `<div data-h="${4 + v * 2.6}" style="background:${col}"><span>${v}%</span></div>`).join("")}</div><div class="histx"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div><div class="facts"><span>Cities disagree by <b>${s.metroVariance}</b></span><span><b>${s.distinctReasons}</b> different reasons given</span>${s.topSplit ? `<span>Best vs worst city <b>${s.topSplit.topMean.toFixed(1)} vs ${s.topSplit.bottomMean.toFixed(1)}</b></span>` : ""}</div></div>`;
  $("#hists").innerHTML = side(d.grounded, "#8052ff", "With Qloo") + side(d.ungrounded, "#3a3a40", "Without Qloo") + `<p class="body" style="grid-column:1/-1;margin:0">Without taste data, every city becomes the same bland person. With Qloo, cities disagree the way real crowds do.</p>`;
  const grow = () => $$("#hists .hist div").forEach((el) => (el.style.height = el.dataset.h + "px"));
  requestAnimationFrame(() => requestAnimationFrame(grow)); setTimeout(grow, 300);
}

async function loadProof() {
  if (state.proof) return; state.proof = true;
  const [bt, yt, tr] = await Promise.all([api("/api/backtest"), api("/api/backtest-youtube"), api("/api/trends-check")]);
  const ytP = yt.status === "ok"
    ? (yt.cases || []).map((c) => (c.error ? `${esc(c.audience)}: ${esc(c.error)}` : `${esc(c.audience)}: ${c.rankTest.testable ? `ρ ${c.rankTest.rho.toFixed(2)}, p ${c.rankTest.p}` : esc(c.rankTest.reason)}`)).join("<br>")
    : `Predictions are sealed before any real views or likes are fetched, then scored against what happened. Not run yet: <code>${esc(yt.run || "")}</code>`;
  const trP = tr.status === "ok"
    ? Object.values(tr.checks).map((c) => `${esc(c.audience)}: ${c.testable ? `ρ ${c.rho}, top-5 overlap ${c.overlapTop5}/5` : esc(c.reason)}`).join("<br>")
    : `Does Qloo's map of where they live agree with where people search for them? Not run yet: <code>${esc(tr.run || "")}</code>`;
  $("#proofbody").innerHTML = `<div class="rs">
      <div><div class="v num" style="color:var(--saffron)">r ${bt.rGrounded.toFixed(2)}</div><div class="k">With Qloo · off by ${bt.maeGrounded} pts on average</div></div>
      <div><div class="v num" style="color:var(--ash)">r ${bt.rLLM.toFixed(2)}</div><div class="k">Without Qloo · off by ${bt.maeLLM} pts</div></div>
      <div><div class="v num">${bt.misses.length}</div><div class="k">misses, published</div></div></div>
    ${bt.isSample ? '<p class="note">This backtest runs on sample reference data with a stand-in model. The method is real and frozen; swap in real YouGov data and live Qloo to cite the number.</p>' : ""}
    <div class="checks"><div class="check"><h3>YouTube backtest</h3><p>${ytP}</p></div><div class="check"><h3>Google Trends check</h3><p>${trP}</p></div>
    <div class="check"><h3>What it never claims</h3><p>The 1,000 people are samples of aggregate Qloo taste, never a real person. No personal data is sent to Qloo.</p></div></div>`;
}

function renderReceipts(rows) {
  $("#rtable").innerHTML = (rows || []).map((r) => `<div class="rrow"><span class="ref">${esc(r.ref)}</span><span>${esc(r.workflow)}</span><span class="ep">${esc(r.endpoint)}</span><span class="rt">${r.cached ? "cache" : "live"}</span></div>`).join("");
}

// ---------------------------------------------------------------- nav + picker
$$(".presets .ghost").forEach((b) => b.addEventListener("click", () => lockOn(b.dataset.name)));
$("#cmd").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#aud").value.trim(); if (v) lockOn(v); });
const links = $$(".links a");
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
$$("main section").forEach((s) => io.observe(s));

legendAges();
lockOn(state.name);
