"use strict";
// Conquest. Talks to the real engine over /api. The only embedded data is
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
  const main = $("#field"); let cv = main, ctx = cv.getContext("2d");
  const small = innerWidth < 760;
  const rnd = mulberry(19);
  const PAL = [["#f7f9fa", 0.34], ["#e1bdff", 0.24], ["#af50ff", 0.2], ["#7b2cff", 0.12], ["#ff8fb0", 0.1]];
  const pick = () => { const r = rnd(); let a = 0; for (const [c, w] of PAL) { a += w; if (r < a) return c; } return "#ffffff"; };
  const RIM = "#e1bdff";
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
  let formed = 1, side = 0.71, mx = 0, my = 0, last = 0, mode = "site", blank = false;
  addEventListener("mousemove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  function target() {
    if (mode === "scan") return [1, 0.27];
    if (mode === "panel") return [1, 0.5];
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
    if (mode === "panel" && cv.offsetParent === null) return; // brain tab not showing
    if (mode === "off") { if (!blank) { ctx.clearRect(0, 0, cv.width, cv.height); blank = true; } return; }
    blank = false; fit(cv, 1.5);
    const W = cv.width, H = cv.height, d = cv._dpr || 1, t = REDUCED ? 0 : now / 1000;
    const [tb, ts] = target();
    // time-based easing: converges in about a second whatever the frame rate
    const dt = last ? Math.min(1, (now - last) / 1000) : 1; last = now;
    const kf = 1 - Math.exp(-dt * 4.5);
    formed += (ease(tb) - formed) * kf; side += (ts - side) * kf;
    ctx.clearRect(0, 0, W, H);

    const yaw = t * 0.16 + mx * 0.5, pitch = 0.12 + my * 0.22;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const mobile = mode !== "panel" && W / d < 760;
    // on phones the brain sits faintly behind the headline, clear of the controls
    const bcx = mobile ? W * 0.62 : W * side, bcy = mobile ? H * 0.27 : H * 0.5;
    const bsc = mode === "panel" ? Math.min(W * 0.3, H * 0.4) : mobile ? W * 0.4 : Math.min(W * 0.33, H * 0.47);
    const ssc = Math.max(W, H) * 0.32;
    const cx = W / 2 + (bcx - W / 2) * formed, cy = H / 2 + (bcy - H / 2) * formed, sc = ssc + (bsc - ssc) * formed;
    const F = 3.3, k = 1 - formed, alpha = (mobile ? 0.38 : 1) * (mode === "site" ? Math.min(1, formed * 1.6) : 1);
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
    if (mode !== "panel") for (const o of tets) {
      if (!REDUCED) { o.x = (o.x + o.dx + 1) % 1; o.y = (o.y + o.dy + 1) % 1; o.rx += o.vx * 0.016; o.ry += o.vy * 0.016; }
      const ca = Math.cos(o.rx), sa = Math.sin(o.rx), cb = Math.cos(o.ry), sb = Math.sin(o.ry);
      const V = TV.map(([a, b, c]) => { const y1 = b * ca - c * sa, z1 = b * sa + c * ca; return [o.x * W + (a * cb + z1 * sb) * o.s * d * 0.6, o.y * H + y1 * o.s * d * 0.6]; });
      ctx.globalAlpha = (0.12 + 0.5 * k) * alpha; ctx.strokeStyle = o.c; ctx.beginPath();
      for (const [i, j] of TE) { ctx.moveTo(V[i][0], V[i][1]); ctx.lineTo(V[j][0], V[j][1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // site: forms beside data-brain sections; scan: centred-left and lit; off: in the war room
  // panel: drawn small inside the war room, lit by the crowd's response
  return { frame, setMode: (m, canvas) => { if (cv === main) main.getContext("2d").clearRect(0, 0, main.width, main.height); mode = m; cv = m === "panel" && canvas ? canvas : main; ctx = cv.getContext("2d"); blank = false; } };
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

// ---------------------------------------------------------------- sound
// Synthesised in WebAudio: no files, no licences. Off with one click.
const Sound = (() => {
  let ac = null, on = true;
  const ctx = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());
  function tone(f, at, dur, type = "triangle", vol = 0.07) {
    const a = ctx(), t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  // percussion for the opener: a pitched-down sine is a drum, filtered noise is a cymbal
  function drum(f0, f1, at, dur, vol) {
    const a = ctx(), t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(at, dur, vol, type = "highpass", freq = 6000) {
    const a = ctx(), t = a.currentTime + at, n = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); src.buffer = buf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + dur + 0.05);
  }
  // a low pad that opens up, like a studio logo swelling in
  function swell(at, dur, vol) {
    const a = ctx(), t = a.currentTime + at, f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    f.connect(g).connect(a.destination);
    for (const fr of [110, 164.8, 220, 277.2]) { const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 14; o.connect(f); o.start(t); o.stop(t + dur + 0.3); }
  }
  const SONGS = {
    tadum: () => { drum(120, 42, 0, 0.55, 0.55); noise(0, 0.18, 0.12, "lowpass", 500); drum(96, 34, 0.3, 0.9, 0.6); noise(0.3, 0.25, 0.14, "lowpass", 420); },
    swell: () => swell(0, 3.1, 0.05),
    rimshot: () => { drum(210, 140, 0, 0.14, 0.4); noise(0, 0.05, 0.12, "bandpass", 2200); drum(150, 82, 0.17, 0.22, 0.45); noise(0.4, 0.9, 0.22, "highpass", 7000); noise(0.4, 0.05, 0.15, "bandpass", 3500); },
    tick: () => tone(1320, 0, 0.06, "sine", 0.04),
    select: () => { tone(660, 0, 0.08, "square", 0.025); tone(990, 0.05, 0.1, "square", 0.025); },
    conquer: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.08)); tone(131, 0, 0.7, "sawtooth", 0.03); },
    alliance: () => { tone(587, 0, 0.3); tone(740, 0.12, 0.3); tone(880, 0.24, 0.5); },
    potion: () => { [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, "sine", 0.06)); },
    threat: () => { tone(98, 0, 0.7, "sawtooth", 0.04); tone(104, 0.05, 0.7, "sawtooth", 0.035); },
    lost: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.4, "sawtooth", 0.04)); },
    week: () => { tone(330, 0, 0.18, "triangle", 0.05); tone(495, 0.14, 0.3, "triangle", 0.05); },
    nope: () => tone(160, 0, 0.18, "square", 0.04),
    ageup: () => { [[392, 494, 587], [523, 659, 784]].forEach((ch, i) => ch.forEach((f) => tone(f, i * 0.32, 0.6, "sawtooth", 0.028))); tone(1047, 0.64, 0.9, "triangle", 0.06); },
    victory: () => { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.32, "triangle", 0.08)); },
  };
  return { get on() { return on; }, toggle() { on = !on; return on; }, get live() { try { return ctx().state === "running"; } catch { return false; } }, unlock() { try { return ctx().resume(); } catch { return Promise.resolve(); } }, play(k) { if (!on) return; try { SONGS[k]?.(); } catch {} } };
})();

// ---------------------------------------------------------------- small UI helpers
let toastT = 0;
function toast(text) { const t = $("#toast"); t.textContent = text; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3400); }
const avatar = (img, name, cls = "ph") => img ? `<img src="${esc(img)}" alt="" onerror="this.outerHTML='<div class=&quot;${cls}&quot;>${esc((name || "?")[0])}</div>'">` : `<div class="${cls}">${esc((name || "?")[0])}</div>`;
const qlooImg = (id) => (id && /^[0-9A-F-]{36}$/i.test(id) ? `https://images.qloo.com/i/${id}-420x-auto.jpg` : null);
const GENERAL = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1a2333" stroke="#f0c46a" stroke-width="2"/><path d="M12 30 Q24 8 36 30 Z" fill="#8052ff"/><rect x="11" y="29" width="26" height="5" rx="2" fill="#f0c46a"/><circle cx="24" cy="16" r="3" fill="#ffb829"/></svg>`;

// portraits for the map, loaded once
const PORTRAIT = new Map();
function portrait(url) {
  if (!url) return null;
  if (!PORTRAIT.has(url)) { const im = new Image(); im.onerror = () => (im._bad = true); im.src = url; PORTRAIT.set(url, im); }
  const im = PORTRAIT.get(url); return im.complete && !im._bad && im.naturalWidth ? im : null;
}

// ---------------------------------------------------------------- rules
const COL = { you: "#af50ff", allied: "#e1bdff", open: "#4a4e58", fog: "#1d1f25" };
const RIVAL_COLS = ["#ff5c7a", "#f5b544", "#38d8ff"];
const AGES = [[0, "I", "Open Mic"], [20, "II", "Club Circuit"], [40, "III", "Theater Tour"], [60, "IV", "Arena Headliner"], [80, "V", "Legend"]];
const ageOf = (c) => { let a = AGES[0]; for (const x of AGES) if (c >= x[0]) a = x; return a; };
const ICON = { edit: "✍️", ally: "🤝", take: "🚩", hold: "🛡️", alliance: "🕊️", rivalry: "⚔️", defend: "🛡️" };
const COST = { edit: 2, ally: 3, take: 4, hold: 3, alliance: 3, rivalry: 5, defend: 2 };
const WEEKS = 8;
const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n)));
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const STATE_TEXT = {
  stronghold: "Your fans live here and the material lands. Hold it.",
  frontline: "Your fans are here, but the material lands below your average. Shore it up.",
  beachhead: "Few of your fans yet, but the ones here love the material. Ripe for conquest.",
  hard: "Few fans and a cold reaction. Not worth a siege yet.",
  uncharted: "Too few simulated fans here to read honestly.",
  allied: "Shared ground with your ally.",
};
// metro → state, for state-level Google Trends in the city you're about to take
const STATE = { Seattle: "WA", Portland: "OR", "San Francisco": "CA", "Los Angeles": "CA", "Las Vegas": "NV", Phoenix: "AZ", "Salt Lake City": "UT", Denver: "CO", Dallas: "TX", Houston: "TX", "San Antonio": "TX", "Kansas City": "MO", Minneapolis: "MN", "St. Louis": "MO", Memphis: "TN", "New Orleans": "LA", Chicago: "IL", Detroit: "MI", Nashville: "TN", Atlanta: "GA", Charlotte: "NC", Raleigh: "NC", Miami: "FL", Orlando: "FL", Cleveland: "OH", Washington: "DC", Baltimore: "MD", Philadelphia: "PA", "New York": "NY", Boston: "MA" };



// ---------------------------------------------------------------- icons
// One 24px line-icon set for the DOM and the map canvas (Path2D reads the same
// paths). Emoji in any text we render are swapped for these.
const PATHS = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  coin: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v10 M15 9.5c0-1.4-1.3-2-3-2s-3 .8-3 2 1.3 1.8 3 2.2 3 1 3 2.3-1.3 2-3 2-3-.8-3-2",
  heart: "M12 20s-7-4.4-9-9c-1.3-3 .7-6.5 4-6.5 2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.3 0 5.3 3.5 4 6.5-2 4.6-9 9-9 9z",
  shield: "M12 3l8 3v6c0 5-3.6 8.2-8 9.5C7.6 20.2 4 17 4 12V6z",
  swords: "M4 4l10 10 M4 4h4 M4 4v4 M20 4 10 14 M20 4h-4 M20 4v4 M7 15l2 2 M17 15l-2 2 M5 17l2 2-2 2-2-2z M19 17l-2 2 2 2 2-2z",
  dove: "M3 14c3 0 5-1 7-4 1.5-2.5 3-5 6-5 2 0 3 1.2 3.5 2.5L22 8l-2.3 1c-.3 4-3.7 8-8.7 8-3.2 0-6-1.2-8-3z M10 17l-2 4 M14 16.5l1 4",
  hands: "M2 11l4-4 3 1.5L12 7l3 1.5L18 7l4 4 M6 7v6l5 5 2-1 2 1 3-3 M9 12l3 3 M11 10l3 3",
  scout: "M10 12a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0 M21 12a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0 M10 12h4 M4 9l2-5h3l1 5 M20 9l-2-5h-3l-1 5",
  ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z M14 7v2 M14 11v2 M14 15v2",
  case: "M3 8h18v12H3z M8 8V5h8v3 M3 13h18 M11 13v2h2v-2",
  mic: "M9 3h6v9a3 3 0 0 1-6 0z M5 11a7 7 0 0 0 14 0 M12 18v3 M9 21h6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  trend: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  cloud: "M7 19h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 12a3.5 3.5 0 0 0 1 7z M9 3v2 M3.5 6.5 5 8",
  crosshair: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10 M12 1v5 M12 18v5 M1 12h5 M18 12h5",
  pen: "M4 20l4-1L19 8l-3-3L5 16z M14 7l3 3 M4 20h16",
  tent: "M3 20 12 4l9 16z M12 4v16 M9 20l3-6 3 6 M12 4l2-2",
  ear: "M7 9a5 5 0 1 1 10 0c0 3.5-3.5 4.5-3.5 8a3 3 0 0 1-5.5 1.5 M10 9a2 2 0 1 1 4 0c0 1.2-1 1.6-1.5 2.5",
  flask: "M9 3h6 M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3 M7.5 15h9",
  flag: "M5 21V4 M5 4h12l-3 4 3 4H5",
  castle: "M4 21V9h3V6h2v3h2V5h2v4h2V6h2v3h3v12z M10 21v-4a2 2 0 0 1 4 0v4",
  bot: "M5 9h14v10H5z M12 5v4 M12 3a1 1 0 1 0 0 2a1 1 0 1 0 0-2 M9 13v1 M15 13v1 M9 16.5h6 M3 13v2 M21 13v2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  crown: "M3 18h18 M4 15 3 7l5 4 4-7 4 7 5-4-1 8z",
  sound: "M4 9h4l5-4v14l-5-4H4z M16.5 9a4 4 0 0 1 0 6 M19 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6",
  exit: "M14 4h6v16h-6 M10 8l-4 4 4 4 M6 12h10",
  help: "M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18 M9.5 9.2a2.6 2.6 0 1 1 3.7 2.4c-.7.4-1.2 1-1.2 1.9 M12 17v.5",
  plan: "M8 3h8v3H8z M6 4.5H4V21h16V4.5h-2 M8 11h8 M8 15h5 M15.5 15l1.2 1.2L19 14",
  hourglass: "M6 3h12 M6 21h12 M7 3c0 6 10 6 10 9s-10 3-10 9 M17 3c0 6-10 6-10 9",
  radar: "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l7-7 M12 11a1 1 0 1 0 0 2",
  play: "M7 4l13 8-13 8z",
  check: "M4 12l5 5L20 6",
  flame: "M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.5 3 2.5 3-1-3 .5-6.5 3-8 0 3 2.5 5 3.5 7 .7 1.4 1.5 2.8 1.5 4.5 0 3.8-3 6.5-7 6.5z",
  skull: "M12 3c-4.4 0-8 3.1-8 7.5 0 2.6 1.3 4.4 3 5.5V20h10v-4c1.7-1.1 3-2.9 3-5.5C20 6.1 16.4 3 12 3z M9 11a1.5 1.5 0 1 0 0 3 M15 11a1.5 1.5 0 1 0 0 3 M10 20v-2 M14 20v-2",
  close: "M6 6l12 12 M18 6 6 18",
  film: "M3 5h18v14H3z M3 9h18 M7 5l2 4 M12 5l2 4 M17 5l2 4 M10 12.5v4l3.5-2z",
  chev: "M9 6l6 6-6 6",
  mag: "M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.5 15.5 21 21",
  masks: "M3 4h8v5a4 4 0 0 1-8 0z M13 9h8v5a4 4 0 0 1-8 0z M5.5 7h.5 M8 7h.5 M15.5 12h.5 M18 12h.5 M5.5 10.5c.8.6 2.2.6 3 0 M15.5 15.5c.8-.6 2.2-.6 3 0",
  route: "M5 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M19 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M7 17h7a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h7",
};
const P2D = {};
const pathOf = (k) => (P2D[k] ??= new Path2D(PATHS[k] ?? PATHS.star));
const I = (k, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[k] ?? PATHS.star}"/></svg>`;
function drawIcon(ctx, k, x, y, size, col, lw = 2) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(pathOf(k)); ctx.restore();
}
// emoji → icon key; anything else pictographic is dropped
const EMO = { "⚡": "bolt", "🪙": "coin", "🛡": "shield", "⚔": "swords", "🕊": "dove", "🤝": "hands", "🔭": "scout", "🎟": "ticket", "💼": "case", "🎙": "mic", "🎤": "mic", "🎭": "eye", "📈": "trend", "🌦": "cloud", "🕵": "crosshair", "✍": "pen", "🎪": "tent", "👂": "ear", "🧪": "flask", "🚩": "flag", "🏴": "flag", "🏰": "castle", "🤖": "bot", "🏆": "star", "⭐": "star", "🔥": "flame", "⏱": "hourglass", "⌛": "hourglass", "📅": "hourglass", "👑": "crown", "💀": "skull", "📡": "radar", "🩸": "swords", "🗡": "swords", "🧱": "shield", "💰": "coin", "🏄": "trend", "✦": "star", "❤": "heart", "🔊": "sound", "🔇": "mute", "📋": "plan", "🎬": "film" };
const EMO_RE = /(\p{Extended_Pictographic})️?/gu, EMO_ONE = /\p{Extended_Pictographic}/u;
const iconFor = (ch) => EMO[ch] ?? EMO[ch.replace(/️/g, "")];
// split text into a leading icon key and clean text (for the canvas); unmapped glyphs stay
function deEmoji(text) { let icon = null; const clean = String(text).replace(EMO_RE, (m, ch) => { const k = iconFor(ch); if (!k) return m; icon ??= k; return ""; }).replace(/\s{2,}/g, " ").trim(); return { icon, text: clean }; }
// swap mapped emoji in every text node under root for svg icons
function iconize(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (EMO_ONE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentNode?.closest?.("svg,script,style,textarea,input,canvas,.emo")) continue;
    const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
    s.replace(EMO_RE, (m, ch, off) => { const k = iconFor(ch); if (!k) return m; if (off > last) frag.append(s.slice(last, off)); const t = document.createElement("template"); t.innerHTML = I(k); frag.append(t.content); last = off + m.length; return m; });
    if (!last) continue;
    if (last < s.length) frag.append(s.slice(last));
    n.replaceWith(frag);
  }
}
new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") { if (m.target.parentNode) iconize(m.target.parentNode); } else for (const n of m.addedNodes) if (n.nodeType === 1) iconize(n); else if (n.nodeType === 3 && n.parentNode) iconize(n.parentNode); } })
  .observe(document.body, { childList: true, subtree: true, characterData: true });
iconize(document.body);

// ---------------------------------------------------------------- the war map
// Real US state borders (us-atlas, Albers USA). Each state belongs to the
// faction of the scouted city inside it; states with no scouted city fall
// under the nearest city's influence, fainter. Ownership comes from the
// campaign: yours, a rival's (relatively stronger footprint), open or uncharted.
const MW = 975, MH = 610;
const ALB = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR" };
const Atlas = { topo: null, states: [], nation: null };
Atlas.ready = fetch("vendor/states-albers-10m.json").then((r) => r.json()).then((t) => {
  Atlas.topo = t;
  const P = d3.geoPath();
  Atlas.states = topojson.feature(t, t.objects.states).features.map((f) => ({ f, id: f.id, code: FIPS[f.id], c: P.centroid(f) }));
  Atlas.nation = topojson.feature(t, t.objects.nation);
  Atlas.inner = topojson.mesh(t, t.objects.states, (a, b) => a !== b);
});

let G = null; // the game in play

function sideOf(ct) {
  if (ct.state === "stronghold" || ct.state === "frontline") return "you";
  if (ct.state === "allied") return "allied";
  if (ct.state === "rival") { const f = G.fac.get(ct.owner); return f?.allied ? "allied" : ct.owner; }
  if (ct.state === "uncharted") return "fog";
  return "open";
}
const colOf = (key) => COL[key] ?? G.fac.get(key)?.col ?? COL.open;
// Simple view paints three colours: you, the nemesis, open ground. Full view brings every rival's colour back.
const nemesis = () => { const p = G.nemId && G.fac.get(G.nemId); return p && !p.allied ? p : [...G.fac.values()].find((f) => f.strategy === "compete" && !f.allied) ?? [...G.fac.values()].find((f) => !f.allied); };
const paintOf = (key) => (G.fac.has(key) && document.body.classList.contains("simple") && key !== nemesis()?.id ? COL.open : colOf(key));
const facByName = (n) => [...G.fac.values()].find((f) => f.name === n);
const nearest = (list, to) => [...list].sort((a, b) => Math.hypot(a.p[0] - to.p[0], a.p[1] - to.p[1]) - Math.hypot(b.p[0] - to.p[0], b.p[1] - to.p[1]))[0];
const pts = (ct) => Math.max(1, Math.round((ct.presence / (G.c.territory.total || 1)) * 100));

// which city governs each state, and how firmly
function assignStates() {
  G.gov = new Map();
  for (const s of Atlas.states) {
    const inside = G.cities.filter((c) => STATE[c.name] === s.code).sort((a, b) => b.presence - a.presence)[0];
    if (inside) { G.gov.set(s.id, { city: inside, k: 1 }); continue; }
    if (s.code === "AK" || s.code === "HI" || s.code === "PR") continue;
    const n = nearest(G.cities, { p: s.c }), dist = n ? Math.hypot(n.p[0] - s.c[0], n.p[1] - s.c[1]) : 1e9;
    // every state belongs to its nearest city in play, fading with distance, so the whole map reads
    if (n) G.gov.set(s.id, { city: n, k: dist < 120 ? 0.6 : dist < 260 ? 0.45 : 0.32 });
  }
}

const MapView = (() => {
  const cv = $("#gmap"), ctx = cv.getContext("2d");
  let T = { s: 1, ox: 0, oy: 0 }, d = 1, mouse = null, base = null, baseKey = "";
  const toS = ([x, y]) => [T.ox + x * T.s, T.oy + y * T.s];

  // ocean, landmass, relief and the coastline glow: drawn once per size
  function drawBase(W, H) {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    const bg = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.75); bg.addColorStop(0, "#130c22"); bg.addColorStop(1, "#060508");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const rnd = mulberry(7);
    x.fillStyle = "rgba(91,140,255,0.05)"; for (let i = 0; i < 900; i++) x.fillRect(rnd() * W, rnd() * H, d, d); // sea haze
    x.save(); x.setTransform(T.s, 0, 0, T.s, T.ox, T.oy);
    const P = d3.geoPath(null, x);
    x.beginPath(); P(Atlas.nation); x.shadowColor = "rgba(175,80,255,.6)"; x.shadowBlur = 30 * d; x.fillStyle = "#121117"; x.fill(); x.shadowBlur = 0;
    x.clip();
    // relief: the Rockies, the Sierra, the Appalachians, the plains
    for (const [cx, cy, r, a] of [[290, 260, 190, 0.11], [150, 230, 120, 0.07], [800, 300, 110, 0.06], [520, 330, 260, 0.03]]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(200,180,255,${a * 0.8})`); g.addColorStop(1, "rgba(200,180,255,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    x.fillStyle = "rgba(200,215,255,0.05)"; for (let i = 0; i < 5000; i++) x.fillRect(rnd() * MW, rnd() * MH, 1.2 / T.s * d, 1.2 / T.s * d); // terrain grain
    x.restore();
    return c;
  }
  // faction provinces: drawn when ownership changes
  function drawLayer(W, H) {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    x.setTransform(T.s, 0, 0, T.s, T.ox, T.oy); const P = d3.geoPath(null, x);
    const keyOf = new Map(); for (const [id, g] of G.gov) keyOf.set(id, sideOf(g.city));
    const A = { you: 0.62, allied: 0.5, open: 0.34, fog: 0.22 };
    // uncharted ground gets a light hatch: "send a Scout here"
    const hc = document.createElement("canvas"); hc.width = hc.height = 10; const hx = hc.getContext("2d"); hx.strokeStyle = "rgba(225,189,255,.22)"; hx.lineWidth = 1.2; hx.beginPath(); hx.moveTo(0, 10); hx.lineTo(10, 0); hx.stroke();
    const hatch = x.createPattern(hc, "repeat");
    for (const s of Atlas.states) {
      const g = G.gov.get(s.id); if (!g) continue; const key = keyOf.get(s.id);
      x.beginPath(); P(s.f); x.globalAlpha = (A[key] ?? 0.56) * g.k; x.fillStyle = paintOf(key); x.fill();
      if (key === "fog" && hatch) { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.fillStyle = hatch; x.restore(); x.save(); x.globalAlpha = 0.9; x.fillStyle = hatch; x.fill(); x.restore(); }
    }
    x.globalAlpha = 1; x.lineJoin = "round";
    x.beginPath(); P(Atlas.inner); x.strokeStyle = "rgba(247,249,250,0.11)"; x.lineWidth = (0.7 * d) / T.s; x.stroke();
    // a glowing frontier around each faction's realm
    const geoms = Atlas.topo.objects.states.geometries;
    for (const key of new Set(keyOf.values())) {
      if (key === "fog" || key === "open") continue;
      const m = topojson.mesh(Atlas.topo, { type: "GeometryCollection", geometries: geoms }, (a, b) => (keyOf.get(a.id) === key) !== (keyOf.get(b.id) === key) || (a === b && keyOf.get(a.id) === key));
      x.beginPath(); P(m); x.strokeStyle = paintOf(key); x.lineWidth = (2.2 * d) / T.s; x.shadowColor = paintOf(key); x.shadowBlur = 10 * d; x.stroke(); x.shadowBlur = 0;
    }
    return c;
  }
  function relayer() { if (G && Atlas.topo) { G.layer = drawLayer(cv.width, cv.height); G.layerKey = cv.width + "x" + cv.height; } }

  function bez(a, b) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [mx - (dy / L) * L * 0.22, my + (dx / L) * L * 0.22 - L * 0.12]; }
  const at = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  function arrow(A, B, col, now, w = 3) {
    const a = toS(A), b = toS(B), c = bez(a, b), t = now / 1000;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w * d; ctx.setLineDash([10 * d, 8 * d]); ctx.lineDashOffset = -t * 40 * d;
    ctx.shadowColor = col; ctx.shadowBlur = 12 * d; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]); const tx = b[0] - c[0], ty = b[1] - c[1], L = Math.hypot(tx, ty) || 1, ux = tx / L, uy = ty / L, h = 14 * d;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(b[0] + ux * 4 * d, b[1] + uy * 4 * d); ctx.lineTo(b[0] - ux * h - uy * h * 0.6, b[1] - uy * h + ux * h * 0.6); ctx.lineTo(b[0] - ux * h + uy * h * 0.6, b[1] - uy * h - ux * h * 0.6); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) { const u = ((t * 0.35 + i / 3) % 1) * 0.92; const [X, Y] = at(a, c, b, u); ctx.beginPath(); ctx.arc(X, Y, 3.2 * d, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  function face(X, Y, r, url, col) {
    const im = portrait(url); if (!im) return false;
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16 * d; ctx.fillStyle = "#0a0f18"; ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(X, Y, r - 1.5 * d, 0, 6.283); ctx.clip();
    const s = Math.max((2 * r) / im.naturalWidth, (2 * r) / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.drawImage(im, X - w / 2, Y - h / 2.6, w, h); ctx.restore();
    ctx.lineWidth = 3 * d; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.stroke();
    return true;
  }
  function iconText(text, X, Y, col, px, font = "700") {
    const { icon, text: t } = deEmoji(text); ctx.font = font === "800" ? `italic 400 ${px * 1.3}px "Instrument Serif", serif` : `500 ${px * 0.85}px "IBM Plex Mono", monospace`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const w = ctx.measureText(t).width, iw = icon ? px * 1.15 : 0, x0 = X - (w + iw) / 2;
    if (icon) drawIcon(ctx, icon, x0 + px * 0.5, Y, px, col, 2.4);
    ctx.fillStyle = col; ctx.fillText(t, x0 + iw, Y); ctx.textAlign = "center";
  }
  function badge(X, Y, txt, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 7.5 * d, 0, 6.283); ctx.fill(); ctx.fillStyle = "#000"; ctx.font = `700 ${10 * d}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, X, Y + 0.5 * d); }
  function token(ct, now, night) {
    const [X, Y] = toS(ct.p), key = sideOf(ct), col = paintOf(key), r = (7 + ct.presence * 8) * d, t = now / 1000;
    const isTarget = G.orderQueue.some((o) => o.city === ct.name);
    const siege = G.sieges.find((s) => s.city === ct.name);
    // city lights after dark
    const lit = night(ct.p[0]); if (lit > 0.3 && key !== "fog") { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 3.2); g.addColorStop(0, `rgba(235,215,255,${0.45 * lit})`); g.addColorStop(1, "rgba(235,215,255,0)"); ctx.fillStyle = g; ctx.fillRect(X - r * 3.2, Y - r * 3.2, r * 6.4, r * 6.4); }
    if (ct.state === "beachhead" || (ct.state === "rival" && G.prep.has(ct.name))) { ctx.strokeStyle = "#3dff9a"; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 3); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, r + 6 * d + 3 * d * Math.sin(t * 3), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    if (siege) { ctx.strokeStyle = "#ff4d6d"; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(X, Y, r + 9 * d, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    if (isTarget) { const k = (t % 1.4) / 1.4; ctx.strokeStyle = "#fff"; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, r + k * 26 * d, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    const f = G.fac.get(ct.owner), cap = G.capital === ct.name && key === "you";
    let drew = false;
    if (cap) drew = face(X, Y, 20 * d, G.player.image, COL.you);
    else if (ct.state === "rival" && f) drew = face(X, Y, Math.max(r + 4 * d, 15 * d), f.img, f.allied ? COL.allied : paintOf(f.id));
    if (!drew) {
      ctx.shadowColor = col; ctx.shadowBlur = (key === "fog" ? 0 : 14) * d;
      ctx.fillStyle = "#0a0f18"; ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.fill();
      ctx.lineWidth = 2.4 * d; ctx.strokeStyle = col; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = key === "fog" ? "#7d8796" : "#fff"; ctx.font = `600 ${10.5 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(key === "fog" ? "?" : kfmt(ct.you), X, Y + 0.5 * d);
    }
    const rr = drew ? (cap ? 20 * d : Math.max(r + 4 * d, 15 * d)) : r;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `500 ${9 * d}px "IBM Plex Mono", monospace`; if ("letterSpacing" in ctx) ctx.letterSpacing = `${1.4 * d}px`; ctx.fillStyle = key === "fog" ? "#55575d" : "#d9dce0"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4 * d;
    ctx.fillText(ct.name.toUpperCase(), X, Y + rr + 10 * d); ctx.shadowBlur = 0; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    if (cap) drawIcon(ctx, "crown", X, Y - rr - 10 * d, 18 * d, "#ffcf5a", 2.2);
    else if (ct.state === "frontline") badge(X + rr * 0.8, Y - rr * 0.8, "!", "#ff9f43");
    if (G.prep.has(ct.name)) badge(X + rr * 0.85, Y + rr * 0.75, "✓", "#7fd8ff");
    if (siege) badge(X - rr * 0.9, Y - rr * 0.8, String(siege.left), "#ff4d6d");
    else if (ct.contested && key === "you") badge(X - rr * 0.9, Y - rr * 0.8, "⚔", "#ff4d6d");
    if (isTarget) drawIcon(ctx, "flag", X + rr + 6 * d, Y - rr - 6 * d, 18 * d, "#3dff9a", 2.2);
    if (roomOf(ct.name)) { ctx.fillStyle = "#0b0d14"; ctx.beginPath(); ctx.arc(X - rr - 2 * d, Y + rr * 0.6, 9 * d, 0, 6.283); ctx.fill(); drawIcon(ctx, "ticket", X - rr - 2 * d, Y + rr * 0.6, 13 * d, "#f0c46a", 2.2); }
    if (G.sponsors.some((sp) => sp.city === ct.name)) drawIcon(ctx, "case", X + rr + 4 * d, Y + rr * 0.6, 13 * d, "#3dff9a", 2.2);
    if (G.forts.has(ct.name)) { ctx.font = `600 ${10 * d}px "Inter Tight", sans-serif`; ctx.textAlign = "left"; const w = ctx.measureText("Walls up").width + 24 * d, bx = X + rr + 4 * d, by = Y - 8 * d; ctx.fillStyle = "rgba(11,13,20,.85)"; ctx.beginPath(); ctx.roundRect(bx, by - 9 * d, w, 18 * d, 6 * d); ctx.fill(); drawIcon(ctx, "shield", bx + 10 * d, by, 12 * d, "#f0c46a", 2.2); ctx.fillStyle = "#f0c46a"; ctx.textBaseline = "middle"; ctx.fillText("Walls up", bx + 19 * d, by + 0.5 * d); ctx.textAlign = "center"; }
    // what-if ghost: the city in your colour, with the gain floating up
    const pv = G.preview; if (pv && pv.city === ct.name) {
      const k = (now - pv.t0) / 2600; if (k >= 0 && k < 1) {
        ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI); ctx.setLineDash([5 * d, 4 * d]); ctx.strokeStyle = pv.col; ctx.lineWidth = 3 * d;
        ctx.beginPath(); ctx.arc(X, Y, rr + 14 * d + 6 * d * Math.sin(t * 5), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = pv.col; ctx.font = `italic 400 ${24 * d}px "Instrument Serif", serif`; ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * d; ctx.fillText(pv.label, X, Y - rr - 22 * d - k * 26 * d); ctx.restore();
      }
    }
  }

  function frame(now) {
    if (!G) return;
    if (!Atlas.topo) return;
    fit(cv, 2); d = cv._dpr || 1; const W = cv.width, H = cv.height;
    const s = Math.min(W / MW, H / MH) * 0.96; T = { s, ox: (W - MW * s) / 2, oy: (H - MH * s) / 2 + 6 * d };
    const key = W + "x" + H;
    if (baseKey !== key) { base = drawBase(W, H); baseKey = key; relayer(); }
    if (!G.layer || G.layerKey !== key) relayer();
    ctx.drawImage(base, 0, 0);
    const a = G.anim;
    if (a) {
      const k = clamp01((now - a.t0) / 1300);
      if (a.old.width === W) ctx.drawImage(a.old, 0, 0);
      const [X, Y] = toS(a.p); ctx.save(); ctx.beginPath(); ctx.arc(X, Y, ease(k) * 420 * s, 0, 6.283); ctx.clip(); ctx.drawImage(G.layer, 0, 0); ctx.restore();
      if (k >= 1) G.anim = null;
    } else ctx.drawImage(G.layer, 0, 0);
    // night falls from east to west with the world clock
    const night = Clock.nightAt;
    ctx.save(); ctx.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 40; i++) { const x0 = (i / 40) * MW, n = night(x0 + MW / 80); if (n <= 0.02) continue; const [X] = toS([x0, 0]); ctx.fillStyle = `rgba(2,4,18,${0.5 * n})`; ctx.fillRect(X, 0, (MW / 40) * s + 1, H); }
    ctx.restore();
    // sieges in rival colour, your selected order in gold, rival moves this week
    for (const sg of G.sieges) { const to = G.cities.find((c) => c.name === sg.city), f = G.fac.get(sg.fid); const from = f && nearest(G.cities.filter((c) => c.owner === f.id && c.state === "rival"), to); if (to && from) arrow(from.p, to.p, f.col, now, 2.8); }
    drawRoute(ctx, toS, d, now); fogLabel(ctx, toS, d);
    G.temp = G.temp.filter((tr) => now - tr.t0 <= 3500);
    for (const tr of G.temp) arrow(tr.from, tr.to, tr.col, now, 2.4);
    for (const ct of G.cities) token(ct, now, night);
    // rival armies on the march toward the city they mean to take this week
    for (const it of G.intents.slice(0, 2)) {
      const f = G.fac.get(it.fid), to = G.cities.find((c) => c.name === it.city); if (!f || !to || f.allied) continue;
      const a0 = toS(it.from), b0 = toS(to.p), c0 = bez(a0, b0), k = 0.38 + (G.showT ? 0.5 * clamp01((now - G.showT) / 4500) : 0), [X, Y] = at(a0, c0, b0, k);
      ctx.save(); ctx.strokeStyle = f.col; ctx.globalAlpha = 0.85; ctx.lineDashOffset = -now / 40; ctx.setLineDash([4 * d, 6 * d]); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], b0[0], b0[1]); ctx.stroke(); ctx.restore();
      const blocked = G.forts.has(to.name);
      if (!face(X, Y, 13 * d, f.img, f.col)) { ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(X, Y, 11 * d, 0, 6.283); ctx.fill(); }
      ctx.font = `700 ${10 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = blocked ? "#3dff9a" : "#ff8fa5"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4 * d;
      iconText(blocked ? "🛡 WALLS UP" : `⚔ HITS ${to.name.toUpperCase()} AT END WEEK`, X, Y - 22 * d, blocked ? "#3dff9a" : "#ff8fa5", 10.5 * d); ctx.shadowBlur = 0;
      if (blocked) { const [TX, TY] = b0; ctx.strokeStyle = "#3dff9a"; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(TX, TY, 24 * d, 0, 6.283); ctx.stroke(); }
    }
    // floating numbers
    G.floats = G.floats.filter((f) => now - f.t0 < 1900);
    for (const f of G.floats) {
      const k = (now - f.t0) / 1900, [X, Y] = toS(f.p);
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; ctx.fillStyle = f.col; ctx.font = `italic 400 ${22 * d}px "Instrument Serif", serif`; ctx.textAlign = "center";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * d; iconText(f.text, X + (f.dx ?? 0) * d, Y - 30 * d - k * 46 * d, f.col, 17 * d, "800"); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    drawArmy(ctx, toS, bez, at, d, s, now); drawDrag(ctx, toS, d);
    for (const f of G.fx) {
      const k = (now - f.t0) / f.dur; if (k > 1 || k < 0) continue; const [X, Y] = toS(f.p);
      if (f.ring) { ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 4 * d * (1 - k) + 1; ctx.beginPath(); ctx.arc(X, Y, ease(k) * f.r * s, 0, 6.283); ctx.stroke(); }
      else { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(X + f.vx * k * s, Y + f.vy * k * s + 40 * k * k * s, 2.6 * d, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1; G.fx = G.fx.filter((f) => now - f.t0 < f.dur);
    if (mouse) cv.style.cursor = G.drag ? "grabbing" : G.hoverUnit ? "grab" : hit(mouse) ? (G.selected?.type === "unit" ? "copy" : "pointer") : "default";
  }
  function hit([mx, my]) { let best = null, bd = 24 * d; for (const ct of G.cities) { const [X, Y] = toS(ct.p), q = Math.hypot(X - mx * d, Y - my * d); if (q < bd) { bd = q; best = ct; } } return best; }
  // Drag a unit onto a city to order it there (mouse, trackpad or touch). Click a unit to
  // select it; with a unit selected, click a city to order it there (same as its chip).
  let press = null, dragEndAt = 0;
  // pointer position in CSS px inside the canvas (offsetX is unreliable across browsers and zoom)
  const ex = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const endDrag = () => { if (G) G.drag = null; document.body.classList.remove("dragging-agent"); };
  cv.addEventListener("pointerdown", (e) => {
    if (!G || G.busy || e.button !== 0) return;
    const u = unitAt(ex(e)[0] * d, ex(e)[1] * d, d); if (!u) return;
    press = { id: u.id, x0: ex(e)[0], y0: ex(e)[1] }; try { cv.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!G) return; mouse = [ex(e)[0], ex(e)[1]];
    if (press && !G.drag && Math.hypot(ex(e)[0] - press.x0, ex(e)[1] - press.y0) > 6) { G.drag = { id: press.id, pt: null }; G.selected = { type: "unit", id: press.id }; document.body.classList.add("dragging-agent"); renderAgents(); }
    if (G.drag) G.drag.pt = [ex(e)[0] * d, ex(e)[1] * d];
    G.hoverUnit = G.drag ? null : unitAt(ex(e)[0] * d, ex(e)[1] * d, d);
    const h = hit(mouse); if (h !== G.hoverCity) { G.hoverCity = h; if (h) cityPanel(h); else if (!G.pinned) $("#cityp").hidden = true; } // only on a new city: hover stays cheap
  });
  cv.addEventListener("pointerup", () => {
    if (!press || !G) return; const p = press; press = null; dragEndAt = performance.now();
    if (G.drag) { const to = G.hoverCity; endDrag(); if (to) orderAt(p.id, to); else toast("Drop the unit on a city."); }
    else selectUnit(p.id, true);
  });
  cv.addEventListener("pointercancel", () => { press = null; endDrag(); });
  cv.addEventListener("pointerleave", () => { if (press) return; mouse = null; if (G) { G.hoverCity = null; G.hoverUnit = null; if (!G.pinned) $("#cityp").hidden = true; } });
  cv.addEventListener("click", (e) => {
    if (!G || G.busy || performance.now() - dragEndAt < 300) return; // a press on a unit was already handled
    const h = hit([ex(e)[0], ex(e)[1]]); if (!h) { G.pinned = null; $("#cityp").hidden = true; return; }
    if (G.selected?.type === "unit") { orderAt(G.selected.id, h); return; }
    G.pinned = h.name; cityPanel(h);
  });
  // for drags that start in the army rail: which city is under this viewport point?
  const pick = (cx, cy) => { const r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; if (!G || x < 0 || y < 0 || x > r.width || y > r.height) return null; return { city: hit([x, y]), pt: [x * d, y * d] }; };
  // ownership changed: snapshot the old layer for the flood animation, draw the new one
  function flip(p) { const old = G.layer; relayer(); if (old && p) G.anim = { old, p, t0: performance.now() }; }
  // for drags that start outside the map: which city is under this viewport point?
  return { frame, flip, relayer, pick, screen: (p) => { const [X, Y] = toS(p); return [X / d, Y / d]; }, css: ([X, Y]) => [X / d, Y / d] };
})();

// the city an order marches from: your nearest held city, else the capital
function fromFor(to) { return nearest(G.cities.filter((c) => sideOf(c) === "you" && c !== to), to) ?? G.cities.find((c) => c.name === G.capital) ?? to; }

function cityPanel(ct) {
  const key = sideOf(ct), f = G.fac.get(ct.owner), sg = G.sieges.find((s) => s.city === ct.name);
  const owner = key === "you" ? `Yours · ${ct.state}` : key === "allied" ? "Allied ground" : key === "fog" ? "Uncharted" : ct.state === "rival" ? `Held by ${f?.name ?? "a rival"}` : `Unclaimed · ${ct.state}`;
  const top = ct.rivals?.[0];
  const text = ct.state === "rival" ? `${f?.name ?? "A rival"}'s crowd is relatively stronger here. ${f?.strategy === "ally" ? "Your advisor says: team up." : "Your advisor says: out-play them."}` : STATE_TEXT[ct.state] ?? "";
  $("#cityp").innerHTML = `<div class="ptitle">City report</div><h4>${esc(ct.name)}</h4><div class="who" style="color:${colOf(key)}">${esc(owner)}</div>
    <dl><dt>Your fans (Qloo)</dt><dd>${ct.you.toLocaleString()}</dd><dt>Material rating</dt><dd>${ct.mean != null ? ct.mean + "/5" : "—"}</dd><dt>Simulated fans here</dt><dd>${ct.n}</dd>${top && top.count ? `<dt>${esc(top.name)}</dt><dd>${top.count.toLocaleString()}</dd>` : ""}${roomOf(ct.name) ? `<dt>Room</dt><dd>${esc(roomOf(ct.name).venue)}</dd>` : ""}</dl>
    <p>${esc(text)}</p>${G.intel.get(ct.name) ? `<p style="color:#7fd8ff">${esc(G.intel.get(ct.name))}</p>` : ""}${cityGets(ct)}${sg ? `<p style="color:#ff8fa5">⚔ Under siege by ${esc(G.fac.get(sg.fid)?.name)}: falls in ${sg.left} week${sg.left > 1 ? "s" : ""} unless you defend.</p>` : ct.contested && key === "you" ? `<p style="color:#ff8fa5">⚔ ${esc(ct.contested)} is close behind you here.</p>` : ""}`;
  if (G.cid && METROS[ct.name]) { $("#cityp").insertAdjacentHTML("beforeend", `<button class="ghostbtn cbrief">📄 City Brief</button>`); $("#cityp .cbrief").addEventListener("click", () => openDoc(briefHref(ct.name), `City Brief · ${ct.name}`)); }
  $("#cityp").hidden = false;
}

// ---------------------------------------------------------------- event ticker, banner, ops log, floats
function event(text, cls = "info") {
  const el = document.createElement("div"); el.className = "ev " + cls; el.textContent = text;
  const box = $("#events"); box.appendChild(el); while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.classList.add("fade"), 9000); setTimeout(() => el.remove(), 10500);
}
let bannerT = 0;
function banner(title, sub, good = true) {
  const b = $("#banner"); $("#banner-t").textContent = title; $("#banner-s").textContent = sub || "";
  b.classList.toggle("good", good); b.classList.add("on"); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove("on"), 2600);
}
// the live feed of what your agents (and rivals) are doing, stamped with world time
function ops(html) {
  const box = $("#ops"); const el = document.createElement("div");
  el.innerHTML = `<span class="t">${Clock.label()}</span> · ${html}`; box.prepend(el);
  if (G) { G.opsN = (G.opsN ?? 0) + 1; $("#ops-count").textContent = `· ${G.opsN}`; $("#ops-last").textContent = el.textContent; }
  while (box.children.length > 60) box.lastChild.remove();
}
function float(p, text, col = "#e1bdff", dx = 0) { if (p) G.floats.push({ p, text, col, dx, t0: performance.now() }); }
const capP = () => G.cities.find((c) => c.name === G.capital)?.p;
let briefTok = 0;
function typeInto(el, text, receipt) {
  const tok = ++briefTok; el.textContent = "";
  const span = document.createElement("span"); el.appendChild(span);
  const words = text.split(" "); let i = 0;
  const done = () => { if (receipt) { const r = document.createElement("span"); r.className = "rc"; r.textContent = receipt; el.appendChild(r); } };
  if (REDUCED) { span.textContent = text; return done(); }
  const step = () => { if (tok !== briefTok) return; i = Math.min(words.length, i + 3); span.textContent = words.slice(0, i).join(" "); i < words.length ? setTimeout(step, 26) : done(); };
  step();
}

// ---------------------------------------------------------------- achievements
const ACH = {
  blood: ["🩸", "First Blood", "Took your first city"], diplomat: ["🕊️", "Diplomat", "Formed your first alliance"], warlord: ["🤖", "Warlord", "Three agents in your army"],
  surfer: ["🏄", "Trend Surfer", "Rode a live trend"], wall: ["🧱", "Iron Wall", "Held a city against a rival"], paid: ["💰", "Paid Up", "Signed your first sponsor"],
  rising: ["⭐", "Rising Star", "Advanced an age"], giant: ["🗡️", "Giant Slayer", "Won a battle as the underdog"], seize: ["⏱️", "Seize the Day", "Claimed an opportunity in time"], fest: ["🎪", "Festival King", "Threw a festival night"], xray: ["🎬", "Know thyself", "X-rayed your real content"], real: ["🏆", "Made it real", "Did a mission in real life"],
};
function ach(id) {
  if (!G || G.ach.has(id) || !ACH[id]) return; G.ach.add(id); G.achPts += 250;
  const [ic, t, d] = ACH[id], el = document.createElement("div"); el.className = "achv";
  el.innerHTML = `<span>${ic}</span><span><b>Achievement: ${t}</b><br><small>${d} · +250 score</small></span>`;
  $("#achs").appendChild(el); setTimeout(() => el.remove(), 3800); Sound.play("potion"); ops(`<span class="ok">🏆 ${t}</span> · ${d}`);
}

// ---------------------------------------------------------------- the world clock (display only)
// v2 has no clock: nothing moves until END WEEK. Clock keeps the formatting and
// the map's day/night look: Wednesday noon while you give orders, Sunday 20:00 in the show.
const Clock = (() => {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (h) => `${DAYS[Math.floor(h / 24) % 7]} ${pad(Math.floor(h % 24))}:${pad(Math.floor(((h % 1) * 60) / 15) * 15)}`;
  const lonOfX = (x) => -125 + (x / MW) * 58;
  function nightAt(x) {
    if (!G) return 0;
    const local = (((G.hour % 24) + (lonOfX(x) + 75) / 15) % 24 + 24) % 24;
    if (local >= 7 && local <= 17.5) return 0;
    if (local >= 20 || local <= 5) return 1;
    return local > 17.5 ? (local - 17.5) / 2.5 : (7 - local) / 2;
  }
  return {
    nightAt, fmt,
    label: () => (G ? `Week ${G.week}` : ""),
    localLabel: (ct) => { const lon = METROS[ct.name]?.[0] ?? -75, h = (((G.hour % 24) + (lon + 75) / 15) % 24 + 24) % 24; return `${pad(Math.floor(h))}:${pad(Math.floor(((h % 1) * 60) / 15) * 15)}`; },
    reset() { if (G) G.hour = 60; },
  };
})();

// ---------------------------------------------------------------- costs, gains, the strategist
const costOf = (o) => Math.max(1, COST[o.kind] - (o.city && G.prep.has(o.city) ? 1 : 0));
const gainOf = (o) => (o.gain ? o.gain + (o.city && G.prep.has(o.city) ? 2 : 0) : 0);
const income = () => G.cities.filter((c) => sideOf(c) === "you").length * 15 + G.sponsors.reduce((s, x) => s + x.perWeek, 0);
const pts_ = (n) => pts(G.cities.find((c) => c.name === n));
// ---------------------------------------------------------------- the thinking agents (Claude, when the AI layer is on)
const post = async (p, body, ms = 25000) => { try { const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }); return await r.json(); } catch { return { status: "error" }; } };
async function aiCheck() { if (G.aiMode != null) return G.aiMode === "claude"; const r = await api("/api/ai").catch(() => null); G.aiMode = r?.mode ?? "off"; G.aiModel = r?.model; return G.aiMode === "claude"; }
function board() {
  const [, , aname] = ageOf(G.conquest), goal = AGES.find((x) => x[0] > G.conquest) ?? AGES.at(-1);
  return {
    name: G.player.name, ids: G.player.q?.ids, week: G.week, weeks: WEEKS, conquest: G.conquest, goal: `${goal[2]} (${goal[0]}%)`, buzz: G.ordersLeft, gold: G.gold, hype: Math.round(G.morale * 10) / 10, capital: G.capital,
    cities: G.cities.slice(0, 30).map((c) => ({ name: c.name, side: sideOf(c), you: c.you, mean: c.mean ?? null, worth: pts(c), state: c.state, lon: METROS[c.name]?.[0], lat: METROS[c.name]?.[1], prepared: G.prep.has(c.name), walls: G.forts.has(c.name) })),
    orders: G.orders.filter((o) => !o.done).slice(0, 12).map((o) => ({ id: String(o.id), title: o.title, kind: o.kind, city: o.city ?? null, cost: costOf(o), gain: gainOf(o) })),
    rivals: [...G.fac.values()].slice(0, 6).map((f) => ({ name: f.name, role: ROLE(f), momentum: G.fame.get(f.name)?.momentum ?? null, attacking: G.intents.find((i) => i.fid === f.id)?.city ?? null, besieging: G.sieges.find((i) => i.fid === f.id)?.city ?? null })),
    agents: [...G.crew.entries()].filter(([, c]) => c.recruited).map(([id]) => id),
  };
}
// once a week, the AI strategist reads the board and plans (cached per board, so replays are free)
async function aiPlan() {
  if (!G || G.tour || !(await aiCheck()) || G.aiPlan?.week === G.week) return;
  const week = G.week; ops(`<span class="ag">🧠 AI strategist</span> reading the board…`);
  const r = await post("/api/agent/strategist", board(), 60000);
  if (r?.status !== "ok" || !G || G.week !== week) { if (r?.status === "off") G.aiMode = "off"; return; }
  G.aiPlan = { week, ...r }; ops(`<span class="api">${esc(r.model)}</span> plan: ${esc(r.plan.headline)} · tools: ${esc((r.tools ?? []).join(", ") || "none")}`);
  renderAgents(); // the plan re-ranks the target chips
}
// agents that write: the AI's text when it's on, the template otherwise
async function aiWrite(kind, context, fallback) {
  if (!(await aiCheck())) return fallback;
  const r = await post("/api/agent/write", { kind, context }, 20000);
  return r?.status === "ok" && r.text ? r.text : fallback;
}
// ---------------------------------------------------------------- HUD and panels
const held = () => G.cities.filter((c) => ["you", "allied"].includes(sideOf(c))).length;
const ground = () => G.cities.filter((c) => c.state !== "uncharted").length;
const fansOf = () => G.cities.filter((c) => sideOf(c) === "you").reduce((s, c) => s + c.you, 0);
const power = () => Math.round((fansOf() * G.morale) / 10);
const score = () => Math.round(G.conquest * 100 + G.allies * 500 + G.taken * 750 + power() + G.saved * 400 + G.runs * 150 + G.achPts);
let saveT = 0;
// the top bar: who you are and your level, the quest, gold and orders
function hud() {
  if (!G) return;
  clearTimeout(saveT); saveT = setTimeout(saveGame, 800);
  const L = levelOf(G.xp);
  $("#lvl-n").textContent = L.roman; $("#age-name").textContent = `Lv ${L.roman} · ${L.name}`;
  $("#hero-name").textContent = G.player.name; $("#hero-week").textContent = `Week ${Math.min(G.week, WEEKS)} of ${WEEKS}`;
  $("#xp-fill").style.width = `${Math.round(L.frac * 100)}%`; $("#xp-text").textContent = L.next ? `${L.toNext} XP to ${L.next.name}` : "max level";
  $("#gold-n").textContent = G.gold; $("#gold-rate").textContent = `gold · +${income()}/wk`;
  $("#orders-n").textContent = G.ordersLeft; $("#orders-tile").classList.toggle("empty", G.ordersLeft <= 0);
  renderQuestBar(); factions(); renderThreats(); renderRivalStrip(); hudReal(); renderLegend(); renderFanStrip();
}
function factions() {
  const reach = (f) => G.cities.reduce((s, c) => s + (c.rivals.find((r) => r.id === f.id)?.count ?? 0), 0);
  const fm = (name) => G.fame.get(name);
  const row = (x) => { const f = fm(x.name); return { ...x, v: f?.views ?? null, mo: f?.momentum ?? null }; };
  const all = [row({ name: G.player.name, img: G.player.image, col: COL.you, st: `<span class="st you">You</span>`, n: G.cities.filter((c) => sideOf(c) === "you").length, last: G.last, r: fansOf() })]
    .concat([...G.fac.values()].map((f) => row({ name: f.name, img: f.img, col: f.allied ? COL.allied : f.col, st: f.allied ? `<span class="st allied">Allied</span>` : f.strategy === "ally" ? `<span class="st ally">Ally?</span>` : `<span class="st rival">Nemesis</span>`, n: G.cities.filter((c) => c.owner === f.id && c.state === "rival").length, last: f.last, title: f.plan.reason, r: reach(f) })));
  const useFame = all.some((x) => x.v), max = Math.max(1, ...all.map((x) => (useFame ? x.v ?? 0 : x.r)));
  if (!$("#factions")) return;
  $("#factions").innerHTML = all.map((x) => `<div class="fac" style="--c:${x.col}" ${x.title ? `title="${esc(x.title)}"` : ""}>${avatar(x.img, x.name, "fp")}<span>${esc(x.name)}</span>${x.st}<b>${x.n}</b><span class="pw"><i style="width:${((useFame ? x.v ?? 0 : x.r) / max) * 100}%"></i></span><span class="fl">${x.v != null ? `${kfmt(x.v)} views/30d${x.mo != null ? ` ${x.mo >= 0 ? "▲" : "▼"}${Math.abs(x.mo)}%` : ""} · ` : ""}${esc(x.last || "")}</span></div>`).join("")
    ;
}
function playerCard() {
  const p = G.player, socials = (p.socials || []).filter((s) => s.network !== "imdb");
  $("#hud-face").innerHTML = avatar(p.image, p.name);
  if (!$("#player")) return;
  $("#player").innerHTML = `${avatar(p.image, p.name)}<div><h3>${esc(p.name)}</h3><div class="meta">${esc(p.bio || (p.custom ? "Custom audience" : "On Qloo"))}</div><div class="socials">${socials.map((s) => `<a class="soc" href="${esc(s.url || "#")}" target="_blank" rel="noopener"><b>✓</b> ${esc(s.network)}</a>`).join("")}</div></div>`;
  const c = G.c;
  $("#intel").innerHTML = `
    <div>Material: <b>${esc(c.stimulus?.label || "Your material")}</b></div>
    <div>${c.aggregate.n.toLocaleString()} fans rated it <b>${c.aggregate.mean.toFixed(1)}/5</b>; ${c.aggregate.pct45}% gave it 4–5.</div>
    ${c.split ? `<div>Best in <b>${esc(c.split.top.metro)}</b> (${c.split.top.mean.toFixed(1)}), weakest in <b>${esc(c.split.bottom.metro)}</b> (${c.split.bottom.mean.toFixed(1)}).</div>` : ""}
    <div class="ptitle" style="padding:6px 0 0">Live sources</div>
    <div class="src"><span>Qloo taste graph</span><em style="color:var(--good)">live</em></div>
    <div class="src"><span>1,000 simulated fans</span><em style="color:var(--good)">from Qloo</em></div>
    <div class="src"><span>Google Trends</span><em style="color:var(--good)" id="gt-state">loading</em></div>
    <div class="src"><span>Wikipedia fame</span><em style="color:var(--good)" id="wk-state">loading</em></div>
    <div class="src"><span>Open-Meteo weather</span><em style="color:var(--good)">live</em></div>
    <div class="src"><span>TRIBE brain response</span><em>stub model</em></div>`;
}

// ---------------------------------------------------------------- the crowd brain
// The TRIBE constellation brain lives in the war room, lit by how the crowd's
// brain responds to your material. Sharpening the material visibly fixes it.
function brainNote() {
  const dz = Neuro.dead.length;
  $("#brain-note").textContent = dz ? `Attention sags in ${dz} stretch${dz > 1 ? "es" : ""} before the punchline. “Sharpen the material” fixes it.` : "No dead zones: the setup holds attention all the way to the punch.";
}
let regT = 0;
function brainTick(now) {
  if (now - regT < 200 || !Neuro.series) return; regT = now;
  const host = $("#brainsvg"); if (host && !host.firstChild) host.innerHTML = brainFig(null, "bfig live");
  if (host) for (const p of host.querySelectorAll("[data-r]")) p.setAttribute("opacity", brainOp(Neuro.I(p.dataset.r, now) * 100));
  $("#regions").innerHTML = Object.entries(REGIONS).map(([k, r]) => { const v = Math.round(Neuro.I(k, now) * 100); return `<div style="--c:${r.col}"><span>${r.name}</span><b style="font-family:var(--mono);font-weight:500">${v}%</b><i><u style="width:${v}%"></u></i></div>`; }).join("");
}
function sharpenBrain() {
  const t = G.c.tribe; if (!t?.regions) return;
  const boost = Object.fromEntries(Object.entries(t.regions).map(([k, arr]) => [k, arr.map((v) => Math.min(100, v * 1.12 + 8))]));
  Neuro.play({ regions: boost, deadZones: [] }); brainNote();
}

// ---------------------------------------------------------------- threat radar
// Each rival's position relative to your capital, a rotating sweep, and the
// armies on the move this week. Every threat comes with its counters.
const Radar = (() => {
  const cv = $("#radar"), ctx = cv.getContext("2d");
  function frame(now) {
    if (!G || cv.offsetParent === null) return;
    fit(cv, 2); const W = cv.width, H = cv.height, d = cv._dpr || 1, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8 * d;
    hits = []; hd = d;
    const cap = G.cities.find((c) => c.name === G.capital) ?? G.cities[0]; if (!cap) return;
    const RANGE = 560, pos = (p) => { const dx = p[0] - cap.p[0], dy = p[1] - cap.p[1], dd = Math.hypot(dx, dy), k = Math.min(1, dd / RANGE); return [cx + (dx / (dd || 1)) * k * R, cy + (dy / (dd || 1)) * k * R]; };
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); bg.addColorStop(0, "#1b0f2e"); bg.addColorStop(1, "#08060c");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(225,189,255,.22)"; ctx.lineWidth = 1 * d;
    for (const k of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, 6.283); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    const beam = REDUCED ? 0 : -(now / 1000) * 1.6;
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(beam, cx, cy); g.addColorStop(0, "rgba(225,189,255,.55)"); g.addColorStop(0.12, "rgba(225,189,255,.05)"); g.addColorStop(0.2, "rgba(225,189,255,0)"); g.addColorStop(1, "rgba(225,189,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = "rgba(240,225,255,.9)"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(beam) * R, cy + Math.sin(beam) * R); ctx.stroke();
    const lit = (X, Y) => { const ang = Math.atan2(Y - cy, X - cx), lag = (((ang - beam) % 6.283) + 6.283) % 6.283; return Math.max(0.25, 1 - lag / 3.2); };
    // your cities
    for (const c of G.cities) { if (sideOf(c) !== "you") continue; const [X, Y] = pos(c.p); ctx.fillStyle = COL.you; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(X, Y, 2.6 * d, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    // rivals: their ground, and armies moving in
    ctx.font = `600 ${9.5 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center";
    for (const f of G.fac.values()) {
      const col = f.allied ? COL.allied : f.col;
      for (const c of G.cities.filter((x) => x.owner === f.id && x.state === "rival")) { const [X, Y] = pos(c.p); hits.push({ fid: f.id, x: X, y: Y }); ctx.globalAlpha = lit(X, Y) * 0.8; ctx.fillStyle = col; ctx.fillRect(X - 3 * d, Y - 3 * d, 6 * d, 6 * d); }
      const it = G.intents.find((x) => x.fid === f.id); if (!it || f.allied) continue;
      const to = G.cities.find((c) => c.name === it.city); if (!to) continue;
      const k = 0.4, from = pos(it.from), dst = pos(to.p), X = from[0] + (dst[0] - from[0]) * k, Y = from[1] + (dst[1] - from[1]) * k;
      const a = lit(X, Y); ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.setLineDash([3 * d, 4 * d]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(dst[0], dst[1]); ctx.stroke(); ctx.setLineDash([]);
      hits.push({ fid: f.id, x: X, y: Y, army: true });
      ctx.globalAlpha = a; ctx.shadowColor = col; ctx.shadowBlur = 14 * d * a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 5.5 * d, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * d; ctx.arc(X, Y, (8 + ((now / 120) % 10)) * d, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = Math.min(1, a + 0.3); ctx.fillStyle = "#e9eef7"; ctx.fillText(f.name.split(" ").slice(-1)[0].toUpperCase(), X, Y - 10 * d);
      ctx.fillStyle = G.forts.has(to.name) ? "#3dff9a" : "#ff8fa5"; ctx.fillText(G.forts.has(to.name) ? "BLOCKED" : `→ ${to.name.toUpperCase()}`, X, Y + 16 * d);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.you; ctx.beginPath(); ctx.arc(cx, cy, 5 * d, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(225,189,255,.7)"; ctx.font = `600 ${9 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "left"; ctx.fillText(`HQ · ${G.capital?.toUpperCase() ?? ""}`, 8 * d, H - 8 * d);
    ctx.textAlign = "right"; ctx.fillText("HITS AT END WEEK", W - 8 * d, 14 * d);
  }
  // click a blip to pick that rival; click anywhere else for the full threat report
  let hits = [], hd = 1;
  const near = (e) => { const x = e.offsetX * hd, y = e.offsetY * hd; let best = null, bd = 16 * hd; for (const h of hits) { const q = Math.hypot(h.x - x, h.y - y); if (q < bd) { bd = q; best = h; } } return best; };
  cv.addEventListener("mousemove", (e) => { const h = G && near(e); cv.style.cursor = h ? "pointer" : "zoom-in"; cv.title = h ? `${G.fac.get(h.fid)?.name ?? ""}: click for counter-moves` : "Click for the full threat report"; });
  cv.addEventListener("click", (e) => { if (!G) return; const h = near(e); Sound.play("select"); if (h) select({ type: "rival", id: h.fid }); else Drawer.open("radar"); });
  return { frame };
})();
// every rival: what they hold, what they're doing this week, and what happens if you do nothing
const LV_LABEL = { SIEGE: "Under siege", HIGH: "Attacking", MED: "Attacking", LOW: "Calm", ALLY: "Ally" };
// ---------------------------------------------------------------- Tour Planner
// Five fields in, a routed tour out: cities scored on Qloo fans, venue fit,
// trends, weather and rivals; nights on Thu-Sat; rooms from Qloo places.
const isoDay = (d) => d.toISOString().slice(0, 10);
function tourDefaults() {
  const t = new Date(); t.setDate(t.getDate() + ((4 - t.getDay() + 7) % 7 || 7)); const e = new Date(t); e.setDate(e.getDate() + 27);
  return { home: METROS[G.capital] ? G.capital : "Chicago", start: isoDay(t), end: isoDay(e), maxCities: 6, maxDriveHours: 5, flyingOk: true, roomSize: "" };
}
function tourHtml() {
  const f = G.tourForm ?? tourDefaults(), p = G.tourPlan;
  const homes = [...new Set([...Object.keys(METROS), ...(G.tourHomes ?? [])])].sort();
  const form = `<form class="tform" id="tour-form">
    <label>Home city<select id="tf-home">${homes.map((n) => `<option${n === f.home ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <label>From<input type="date" id="tf-start" value="${f.start}"></label><label>To<input type="date" id="tf-end" value="${f.end}"></label>
    <label>Max cities<input type="number" id="tf-max" min="1" max="12" value="${f.maxCities}"></label>
    <label>Max drive per leg (h)<input type="number" id="tf-drive" min="1" max="16" value="${f.maxDriveHours}"></label>
    <label class="chk"><input type="checkbox" id="tf-fly" ${f.flyingOk ? "checked" : ""}> Flying is fine</label>
    <label>Room size<select id="tf-size"><option value="">Any</option><option value="small"${f.roomSize === "small" ? " selected" : ""}>50–150</option><option value="mid"${f.roomSize === "mid" ? " selected" : ""}>150–400</option><option value="large"${f.roomSize === "large" ? " selected" : ""}>400+</option></select></label>
    <button class="go" type="submit" id="tf-go">${G.tourBusy ? "Planning…" : p ? "Re-plan" : "Plan my tour"}</button></form>`;
  if (!p) return form + `<p class="note">Scores every city on your map: 40% fans (Qloo), 20% venue crowd fit (Qloo), 15% trends (Google), 15% dry evenings (Open-Meteo), 10% rivals. Then routes it and books Thu–Sat nights.</p>`;
  return form + `<div class="tsum"><b>${p.totals.nights} nights · ${p.totals.fansReachable.toLocaleString()} fans reachable</b><span>${p.totals.miles.toLocaleString()} miles · ${p.totals.driveHours} h driving${p.totals.flights ? ` · ${p.totals.flights} flight${p.totals.flights > 1 ? "s" : ""}` : ""}${p.ai ? ` · order by ${esc(p.ai.model)}` : ""}</span></div>
    <div class="tacts"><a class="go" href="${p.links.ics}">📅 Add to calendar</a><a class="ghostbtn" href="${p.links.csv}">CSV</a><button class="ghostbtn" id="t-copy">Copy as text</button><button class="ghostbtn" id="t-briefs">📄 Make City Briefs</button><button class="ghostbtn" id="t-share">⭐ Share</button><button class="ghostbtn" id="t-page">🗺 Plan page</button></div>
    <div class="tstops">${p.stops.map((st) => `<div class="tstop"><b class="tn">${st.n}</b><div><div class="tl"><b>${esc(st.city)}</b> · ${st.night ? new Date(st.night + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "<i>doesn't fit</i>"} · ${st.drive.mode === "fly" ? "✈ fly" : `🚗 ${st.drive.hours} h`}</div>
      <div class="tv">${esc(st.venue?.name ?? "send a Booker")}${st.backup ? ` <small>(backup: ${esc(st.backup.name)})</small>` : ""} · <b>${st.fit ?? "?"}% fit</b> · ${st.fans.toLocaleString()} fans</div>
      <div class="tw">${esc(st.why)}</div><div class="tc">confidence: ${st.confidence.level} · ${esc(st.confidence.reason)}${G.cid ? ` · <a href="#" data-tbrief="${esc(st.city)}">📄 brief</a>` : ""}</div></div></div>`).join("")}</div>
    <p class="note">${esc(p.method)}</p>`.replace(`<div class="tacts">`, `${p.note ? `<p class="note" style="color:#ffc857">${esc(p.note)}</p>` : ""}<div class="tacts">`);
}
function bindTour() {
  const f = $("#tour-form"); if (!f) return;
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); if (G.tourBusy) return;
    G.tourForm = { home: $("#tf-home").value, start: $("#tf-start").value, end: $("#tf-end").value, maxCities: +$("#tf-max").value || 6, maxDriveHours: +$("#tf-drive").value || 5, flyingOk: $("#tf-fly").checked, roomSize: $("#tf-size").value };
    G.tourBusy = true; Drawer.render(); ops(`<span class="ag">🗺 Tour Planner</span> scoring cities: Qloo fans + venues, Google Trends, Open-Meteo…`);
    const r = await post("/api/tour/plan", { campaignId: G.cid, name: G.player.name, ids: G.player.q?.ids, ...G.tourForm, roomSize: G.tourForm.roomSize || undefined }, 90000);
    G.tourBusy = false;
    if (r?.status !== "ok") { toast(r?.error ?? "Couldn't plan the tour. Try again."); Drawer.render(); return; }
    G.tourPlan = r; tourMissions(r);
    ops(`<span class="api">Qloo places · Trends · Open-Meteo</span> tour planned: ${r.totals.nights} nights, ${r.totals.fansReachable.toLocaleString()} fans reachable · ${r.stops.reduce((a, x) => a + x.receipts.length, 0)} receipts`);
    Drawer.render(); saveGame();
  });
  $("#t-copy")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(await (await fetch(G.tourPlan.links.txt)).text()); toast("Tour copied."); } catch { toast("Couldn't reach the clipboard."); } });
  $("#t-share")?.addEventListener("click", () => openShare({ tour: G.tourPlan }));
  $("#t-page")?.addEventListener("click", () => openDoc(G.tourPlan.links.page, `Tour plan · ${G.tourPlan.totals.nights} nights`));
  $$("[data-tbrief]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openDoc(briefHref(a.dataset.tbrief), `City Brief · ${a.dataset.tbrief}`); }));
  $("#t-briefs")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; let n = 0;
    for (const st of G.tourPlan.stops) { b.textContent = `📄 ${st.city}… (${++n}/${G.tourPlan.stops.length})`; await post("/api/brief", { campaignId: G.cid, city: st.city }, 60000); }
    b.textContent = "📄 Briefs ready"; b.disabled = false; openDoc(`/briefs/${encodeURIComponent(G.cid)}`, "City Briefs");
  });
}
// City Briefs and Tour Plans open inside the game, over the map; print from here
function openDoc(href, title) {
  const m = $("#docv"), f = $("#dv-frame"), was = G?.modal;
  $("#dv-title").textContent = title; $("#dv-tab").href = href; f.src = href;
  m.hidden = false; if (G) G.modal = true; Sound.play("select");
  const close = () => { m.hidden = true; f.src = "about:blank"; if (G) G.modal = was; $("#dv-x").onclick = m.onclick = null; };
  $("#dv-x").onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
  $("#dv-print").onclick = () => { try { f.contentWindow.print(); } catch { open(href, "_blank"); } };
}
const briefHref = (city) => `/brief/${encodeURIComponent(G.cid)}/${encodeURIComponent(city)}`;
// each night of the tour becomes a real move
function tourMissions(p) {
  G.real = G.real.filter((m) => m.src !== "Tour Planner");
  for (const st of p.stops.filter((x) => x.night)) G.real.push({ id: "t" + st.n + "-" + p.id, text: `Play ${st.city} on ${new Date(st.night + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${st.venue?.name ?? "a room your Booker picks"}`, src: "Tour Planner", city: st.city, week: G.week, done: false });
  hudReal();
}
function threatReport() {
  const RANK = { SIEGE: 0, HIGH: 1, MED: 2, LOW: 3, ALLY: 4 };
  const fs = [...G.fac.values()].sort((a, b) => RANK[threatLevel(a)] - RANK[threatLevel(b)]);
  const cards = fs.map((f) => {
    const lv = threatLevel(f), it = G.intents.find((x) => x.fid === f.id), sg = G.sieges.find((x) => x.fid === f.id);
    const held = G.cities.filter((c) => c.owner === f.id && c.state === "rival").map((c) => c.name);
    const mo = G.fame.get(f.name)?.momentum, at = strikeCity(f), cityOf = (n) => G.cities.find((c) => c.name === n);
    let now, risk, rc = "";
    if (f.allied) { now = "Allied: they fight at your side."; risk = "No risk."; }
    else if (sg) { now = `Besieging your ${sg.city}. It falls in ${sg.left} week${sg.left > 1 ? "s" : ""}.`; risk = `You lose ${sg.city} and ${pts(cityOf(sg.city))}% conquest.`; rc = "bad"; }
    else if (it && !G.forts.has(it.city)) { now = `Marching on your ${it.city}. Hits at END WEEK.`; risk = `A 2-week siege starts on ${it.city} and its tour stop.`; rc = "warn"; }
    else if (it) { now = `Marching on ${it.city}, but your walls are up.`; risk = "Their attack bounces off."; }
    else { now = "No attack planned this week."; risk = "Nothing, for now."; }
    const acts = [];
    if (sg) acts.push(`<button class="go" data-tdef="${esc(sg.city)}">🛡 Defend ${esc(sg.city)} · 1 order</button>`);
    if (it && !G.forts.has(it.city)) acts.push(`<button class="ghostbtn" data-fort="${esc(it.city)}" ${G.gold >= 80 ? "" : "disabled"}>🛡 Build walls in ${esc(it.city)} · 80 gold</button>`);
    if (!f.allied) {
      acts.push(`<button class="ghostbtn" data-strike="${esc(f.id)}" ${at ? "" : "disabled"}>⚔ ${at ? "Strike their " + esc(at.name) + " · 1 order" : "Strike (they hold no city yet)"}</button>`);
      acts.push(`<button class="ghostbtn" data-parley="${esc(f.id)}">🕊 Send the Diplomat · 1 order</button>`);
    }
    return `<div class="trc ${lv}" style="--c:${f.allied ? COL.allied : f.col}">
      <div class="trc-h">${avatar(f.img, f.name, "fp")}<div><b>${esc(f.name)}</b><small>${held.length ? "Holds " + esc(held.slice(0, 3).join(", ")) : "Holds no cities yet"}${mo != null ? ` · fame ${mo >= 0 ? "▲" : "▼"}${Math.abs(mo)}%` : ""}</small></div><span class="lv2">${LV_LABEL[lv]}</span></div>
      <dl><dt>This week</dt><dd>${esc(now)}</dd><dt>If you do nothing</dt><dd class="${rc}">${esc(risk)}</dd></dl>
      ${acts.length ? `<div class="trc-a">${acts.join("")}</div>` : ""}</div>`;
  }).join("");
  const hot = fs.filter((f) => ["SIEGE", "HIGH", "MED"].includes(threatLevel(f)));
  const head = hot.length ? `<div class="tr-sum bad"><b>${hot.length} rival${hot.length > 1 ? "s" : ""} coming for you</b><span>Act before you press END WEEK, when attacks land.</span></div>` : `<div class="tr-sum"><b>All quiet this week</b><span>No rival is attacking you. A good week to strike first.</span></div>`;
  return head + cards + `<p class="note" style="margin-top:12px">Rivals are real performers your fans also follow (from Qloo). Their moves are simulated from their real fan footprints and Wikipedia momentum.</p>`;
}
function bindThreats() {
  $$("#drawer-b [data-tdef]").forEach((b) => b.addEventListener("click", () => { defendOrder(b.dataset.tdef); Drawer.render(); }));
  $$("#drawer-b [data-fort]").forEach((b) => b.addEventListener("click", () => { fortify(b.dataset.fort); Drawer.render(); }));
  $$("#drawer-b [data-strike]").forEach((b) => b.addEventListener("click", () => { strike(b.dataset.strike); Drawer.render(); }));
  $$("#drawer-b [data-parley]").forEach((b) => b.addEventListener("click", () => { parleyOrder(b.dataset.parley); Drawer.render(); }));
}
function threatLevel(f) {
  if (f.allied) return "ALLY";
  if (G.sieges.some((x) => x.fid === f.id)) return "SIEGE";
  const it = G.intents.find((x) => x.fid === f.id);
  if (it && !G.forts.has(it.city)) return f.strategy === "compete" || (G.fame.get(f.name)?.momentum ?? 0) > 10 ? "HIGH" : "MED";
  return "LOW";
}
function renderThreats() {
  if (G && typeof Drawer !== "undefined" && Drawer.mode === "radar") { $("#drawer-b").innerHTML = threatReport(); bindThreats(); }
}
function strikeCity(f) { const cap = G.cities.find((c) => c.name === G.capital); const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival"); return cap ? nearest(theirs, cap) : theirs[0]; }
function fortify(city) {
  if (G.gold < 80 || G.forts.has(city)) return;
  G.gold -= 80; G.forts.add(city); Sound.play("alliance");
  const ct = G.cities.find((c) => c.name === city); float(ct?.p, "🛡 WALLS UP", "#3dff9a");
  event(`🛡 Walls go up in ${city}. The attack will bounce.`, "good"); ops(`<span class="ok">🛡 fortified ${esc(city)}</span> · 80 gold`);
  hud(); renderAgents();
}
// the rival card and the threat report give orders too: they queue the same chips the rail does
function strike(fid) { const f = G.fac.get(fid), ct = f && strikeCity(f); if (!ct) return; const c = chipsFor("you").find((x) => x.city === ct.name) ?? youChip(ct); queueOrder("you", c); selectUnit("you", true); }
function defendOrder(city) { const ct = G.cities.find((c) => c.name === city); if (!ct) return; const c = chipsFor("you").find((x) => x.city === city && x.kind === "defend"); if (c) { queueOrder("you", c); selectUnit("you", true); } }
function parleyOrder(fid) { const f = G.fac.get(fid); if (!f) return; queueOrder("diplomat", { city: f.plan.city ?? G.capital, label: f.name, get: "an ally + a DM", ally: f.name }); selectUnit("diplomat", true); }

// ---------------------------------------------------------------- battle
// Odds come from real numbers: your fans there and your material's rating vs
// their footprint there and their Wikipedia momentum, plus what your agents did.
function oddsFor(ct, f) {
  const theirs = Math.max(1, ct.rivals.find((r) => r.id === f.id)?.count ?? 0), mo = G.fame.get(f.name)?.momentum ?? 0;
  const mods = [];
  let me = ct.you * (G.morale / 4);
  if (G.prep.has(ct.name)) { me *= 1.3 + (G.readBonus?.get(ct.name) ?? 0); mods.push("+30% city prepared by your agents"); }
  if (G.forts.has(ct.name)) { me *= 1.3; mods.push("+30% walls up"); }
  if ((G.intel.get(ct.name) ?? []).length) { me *= 1.1; mods.push("+10% agent intel"); }
  if (G.morale >= 4.3) mods.push("hype is high");
  const them = theirs * (1 + Math.max(-0.4, Math.min(0.6, mo / 100)));
  if (mo) mods.push(`their fame ${mo >= 0 ? "▲" : "▼"}${Math.abs(mo)}%`);
  return { me: Math.round(me), them: Math.round(them), p: Math.max(0.15, Math.min(0.9, me / (me + them) + 0.08)), mods };
}
// A battle is a head-to-head night in that city, decided in five rounds.
// Four rounds come straight from data (Qloo fan counts, your panel rating
// there, Wikipedia momentum, your agents' groundwork); the last is the live
// crowd on the night, the only luck in it. The fans in the middle switch
// sides round by round, so you can see how you won (or why you didn't).
function battleRounds(city, f, o) {
  const theirs = Math.max(1, city.rivals?.find((r) => r.id === f.id)?.count ?? 0), mo = G.fame.get(f.name)?.momentum ?? 0, myMo = G.fame.get(G.player.name)?.momentum ?? 0;
  const c01 = (x) => Math.max(0.08, Math.min(0.92, x));
  const ratio = city.you / theirs, prep = G.prep.has(city.name), walls = G.forts.has(city.name), intel = (G.intel.get(city.name) ?? []).length > 0;
  const mean = city.mean ?? G.morale, first = f.name.split(" ").pop();
  return [
    { k: "Fan base", src: "Qloo", w: 0.35, s: c01(city.you / (city.you + theirs)),
      say: ratio >= 1.2 ? `Your ${kfmt(city.you)} fans in ${city.name} outnumber ${first}'s ${kfmt(theirs)}, ${ratio >= 2 ? Math.round(ratio) + " to 1" : "and it shows"}.` : ratio <= 0.8 ? `${first} brings ${kfmt(theirs)} fans to your ${kfmt(city.you)}. Outnumbered.` : `Dead even: ${kfmt(city.you)} fans against ${kfmt(theirs)}.` },
    { k: "The material", src: "1,000-fan panel", w: 0.25, s: c01(0.5 + (mean - 3.4) / 2.4),
      say: mean >= 3.8 ? `Your material rates ${(+mean).toFixed(1)}/5 here. The room is laughing.` : mean >= 3.3 ? `Your material rates ${(+mean).toFixed(1)}/5 here. Solid, not a knockout.` : `Only ${(+mean).toFixed(1)}/5 here. The jokes aren't landing in ${city.name}.` },
    { k: "Momentum", src: "Wikipedia", w: 0.15, s: c01(0.5 + (myMo - mo) / 200),
      say: mo < -10 ? `Searches for ${first} are down ${Math.abs(mo)}% this month. Their crowd is drifting.` : mo > 10 ? `${first} is up ${mo}% in searches. Their buzz is real.` : `Neither of you is trending this month.` },
    { k: "Groundwork", src: "Your agents", w: 0.25, s: c01(0.4 + (prep ? 0.18 : 0) + (walls ? 0.18 : 0) + (intel ? 0.1 : 0)),
      say: prep || walls || intel ? [prep && "your agents prepared the room", walls && "your walls held the line", intel && "your intel found the soft spots"].filter(Boolean).join(", ").replace(/^./, (x) => x.toUpperCase()) + "." : `You walked in cold: no agent prepared ${city.name}.` },
  ];
}
// One night in a city, resolved without a modal: END WEEK's show plays it from this result.
function fight(city, f) {
  const o = oddsFor(city, f), R = battleRounds(city, f, o);
  const win = G.tour || G.rng() < o.p;
  // the last round is the luck: it lands wherever it must for the night's result
  const base = R.reduce((t, r) => t + r.s * r.w, 0);
  const night = win ? Math.max(0.56, Math.min(0.92, base + 0.15)) : Math.min(0.44, Math.max(0.08, base - 0.15));
  const rounds = R.concat([{ k: "The night", src: "the only dice roll", s: night, say: win ? `The room goes your way. ${city.name} is chanting your name.` : `${f.name.split(" ").pop()} kills on the night. The room turns.` }]);
  const best = [...R].sort((x, y) => (win ? y.s - x.s : x.s - y.s))[0];
  if (win && o.p < 0.5) ach("giant");
  ops(`<span class="${win ? "ok" : "rv"}">⚔ ${win ? "won" : "lost"} the battle for ${esc(city.name)}</span> · odds were ${Math.round(o.p * 100)}%`);
  return { win, odds: o, rounds, best, f, city: city.name, share: win ? Math.max(0.56, base) : Math.min(0.44, base) };
}

// ---------------------------------------------------------------- parley (partnership negotiation)
// Three offers, odds from the Qloo barter score (how much of each crowd is new
// to the other, and how many would cross over). Shows the smallest offer
// that likely works, and a one-page pitch you can send for real.
// The Diplomat's parley, resolved at END WEEK: it picks the smallest offer that likely works and asks.
function parleySilent({ name, f, barter = 30, netnew = 0.6, convert = 0.8, city = null }) {
  const b = barter || 30, clampP = (p) => Math.max(0.1, Math.min(0.95, p));
  const offers = [
    { name: "Shout-out swap", gold: 0, p: clampP(0.3 + b / 250) },
    { name: `Co-headline${city ? ` in ${city}` : ""}, 50/50 door`, gold: 150, p: clampP(0.55 + b / 200) },
    { name: `Open for them${city ? ` in ${city}` : ""}`, gold: 0, p: clampP(0.72 + b / 300) },
  ].filter((x) => x.gold <= G.gold);
  const x = offers.filter((y) => y.p >= 0.7).sort((p, q) => p.gold - q.gold)[0] ?? offers.sort((p, q) => q.p - p.p)[0];
  G.gold -= x.gold;
  const yes = G.tour || G.rng() < x.p;
  const pitch = `${G.player.name} × ${name}: ${Math.round(netnew * 100)}% of your crowd would be new to me, and ${Math.round(convert * 100)}% of my fans already over-index on you (Qloo). Proposal: ${x.name.toLowerCase()}. Same taste, different rooms: we both grow.`;
  if (yes) { G.pitches.push(pitch); if (f) { f.allied = true; f.last = "Fighting at your side"; G.intents = G.intents.filter((it) => it.fid !== f.id); G.sieges = G.sieges.filter((s) => s.fid !== f.id); } G.allies++; ach("diplomat"); MapView.relayer(); }
  ops(`<span class="${yes ? "ok" : "rv"}">🕊 ${esc(name)} ${yes ? "accepted" : "passed on"} ${esc(x.name)}</span>`);
  return { yes, offer: x, pitch, name, barter: b };
}

// trend radar: live Google Trends become potions; X and TikTok are honest "connect" slots
async function addTrends(geo, where) {
  const r = await api(`/api/trends?geo=${geo}`).catch(() => null);
  if (r?.status !== "ok") return [];
  const got = [];
  for (const it of r.items.slice(0, 3)) if (!G.potions.some((p) => p.title === it.title)) { const p = { ...it, where, used: G.usedTrends?.has(it.title) ?? false }; G.potions.unshift(p); got.push(p); }
  return got;
}
async function loadTrends() {
  const target = G.c.territory.target?.name, st = target && STATE[target];
  await addTrends("US", "the US"); if (st) await addTrends(`US-${st}`, target);
  const el = $("#gt-state"); if (el) el.textContent = G.potions.length ? "live" : "unavailable";
}
// ---------------------------------------------------------------- the agent army
// Each agent is a real job done with real data. Recruit with gold, deploy once
// a week to a city; its unit marches there on the map, makes the call, and
// comes back with intel that changes the game. Several are features other
// teams built as whole products; here they're units in your army.
const AGENTS = [
  { id: "scout", icon: "🔭", name: "Scout", role: "What your fans love in a city", src: "Qloo", cost: 80 },
  { id: "booker", icon: "🎟️", name: "Booker", role: "Finds the right stage", src: "Qloo venues", cost: 120 },
  { id: "diplomat", icon: "🕊️", name: "Diplomat", role: "Finds a partner, writes the pitch", src: "Qloo overlap", cost: 100 },
  { id: "sponsor", icon: "💼", name: "Sponsor scout", role: "Brands your fans already love", src: "Qloo brands", cost: 120 },
  { id: "reader", icon: "🎭", name: "Room reader", role: "How a city's fans react, one by one", src: "1,000-fan panel", cost: 70 },
];
// ---------------------------------------------------------------- v2: the army you command
// Five agents, one per outcome a player can name: know a city, book a show,
// get paid, make a friend, test the material. Each runs several real calls and
// brings back one loot card. All five march from week 1; Lv III gives each a
// second power. You give orders all week; nothing moves until END WEEK.
const UNITS = [
  { id: "you", ic: "flag", does: "fight for a city with your material", brings: "the city (and its tour stop)" },
  { id: "scout", ic: "mag", xp: 40, does: "what your fans in a city love (Qloo brands) + what's trending there (Google Trends) + which rival is heading there (Wikipedia)", brings: "fog lifted, intel, the city costs 1 less to take, the attack before it lands", power: "Trend wave: +1 order next week if you post on the trend" },
  { id: "booker", ic: "ticket", xp: 60, does: "the room whose crowd fits yours (Qloo places) + the dry nights that week (Open-Meteo)", brings: "a booked venue = a tour stop, the venue email, a dated show night", power: "Festival night: a second room in a held city becomes a festival, +200 gold" },
  { id: "sponsor", ic: "case", xp: 50, does: "a brand your fans over-index on (Qloo brands)", brings: "gold every week + a pitch email", power: "Double deal: a second brand per city as a backup pitch" },
  { id: "diplomat", ic: "dove", xp: 50, does: "a performer whose fans would like you (Qloo overlap)", brings: "an ally (their cities count for your quest) + a DM", power: "Podcast tour: a podcast your fans listen to, a guest spot (Qloo podcasts)" },
  { id: "reader", ic: "masks", xp: 40, does: "1,000 simulated fans in that city react to your bit", brings: "battle odds up there, a fan quote", power: "Copywriter: writes the post for that city, +1 order next week" },
];
const BASE6 = ["scout", "booker", "sponsor", "diplomat", "reader"];
const HOTKEYS = "1234567";
const unitOf = (id) => UNITS.find((u) => u.id === id);
const unitName = (id) => (id === "you" ? "You" : agentOf(id)?.name ?? id);
const starsOf = (id) => { const x = G.unitXp.get(id) ?? 0; return x >= 250 ? 3 : x >= 100 ? 2 : 1; };
const lvl = () => levelOf(G.xp).n;
const unitReady = (id) => id === "you" || !!G.crew.get(id)?.recruited;
const cityOf = (n) => G.cities.find((c) => c.name === n);
const gap = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
const isHeld = (c) => !!c && ["you", "allied"].includes(sideOf(c));
const heldNames = () => G.cities.filter(isHeld).map((c) => c.name);
const lastName = (n) => String(n).split(" ").pop();
// "Cedric the Entertainer" → "Cedric"; teams and one-word names stay whole
const shortName = () => { const n = G.player.name, w = n.split(" "); return w.length > 1 && w.length <= 3 && !/^(the|los|las|new|san|st\.?)$/i.test(w[0]) ? w[0] : n; };
const shortDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
// show nights for the tour: Fri/Sat pairs from two weeks out, one pair a week
function nightFor(i) { const t = new Date(); t.setDate(t.getDate() + 14 + ((5 - t.getDay() + 7) % 7)); t.setDate(t.getDate() + Math.floor(i / 2) * 7 + (i % 2)); return isoDay(t); }
// the route: nearest neighbour from the capital, so it's one you can drive
function tourOrder(names) {
  const left = names.map(cityOf).filter(Boolean), out = [], cap = cityOf(G.capital);
  let at = cap && left.includes(cap) ? cap : [...left].sort((a, b) => b.you - a.you)[0];
  while (at) { out.push(at.name); left.splice(left.indexOf(at), 1); at = left.length ? nearest(left, at) : null; }
  return out;
}
function roomOf(name) { const n = [...(G?.nights ?? [])].reverse().find((x) => x.city === name && x.venue); return n ? { venue: n.venue, day: shortDay(n.date), date: n.date, fit: n.fit, backup: n.backup } : null; }

// ---------------------------------------------------------------- the quest, derived from the board every render
function questFacts() {
  // booked cities take the six stop slots first (in route order), then the rest you hold
  const all = tourOrder(heldNames()), rooms = {}; for (const n of all) { const r = roomOf(n); if (r) rooms[n] = r; }
  const held = [...tourOrder(all.filter((n) => rooms[n])), ...all.filter((n) => !rooms[n])];
  const oc = G.objCity && cityOf(G.objCity);
  return { objective: G.objective ?? "tour", objCity: G.objCity, held, rooms, sponsors: G.sponsors.length, sponsorList: G.sponsors, proven: !!G.proven, allies: G.allies, guestSpots: G.guestSpots.length, offered: G.dms.length, dms: G.dms, taken: G.taken,
    objScouted: !!oc && G.scouted.has(oc.name), objSide: oc ? sideOf(oc) : null, objRoom: !!(oc && roomOf(oc.name)), objNight: !!(oc && G.nights.some((n) => n.city === oc.name)), sponsorPostDone: G.real.some((m) => m.done && /Sponsor scout|Room reader|Copywriter/.test(m.src ?? "")) };
}
const quest = () => questState(questFacts());
function missionCtx() {
  const cap = cityOf(G.capital) ?? G.cities[0], mine = new Set(heldNames());
  const cand = G.cities.filter((c) => !mine.has(c.name) && c.state !== "rival").sort((a, b) => (a.state === "uncharted" ? 0 : 1) - (b.state === "uncharted" ? 0 : 1) || gap(a, cap) - gap(b, cap));
  const nem = nemesis(), rc = (nem && strikeCity(nem)) ?? cityOf(G.c.territory.target?.name);
  const byFans = G.cities.filter((c) => mine.has(c.name)).sort((a, b) => b.you - a.you);
  return { capital: G.capital, scoutA: cand[0]?.name, scoutB: cand[1]?.name, rivalCity: rc?.name, held2: byFans[1]?.name, held3: byFans[2]?.name, objCity: G.objCity };
}
// a new objective keeps your progress: missions already done stay done
function setObjective(id, city) {
  G.objective = id; G.objCity = id === "city" ? city ?? null : null;
  const done = new Set((G.missions ?? []).filter((m) => m.complete).map((m) => m.id));
  G.missions = buildMissions(id, missionCtx()).map((m) => ({ ...m, complete: done.has(m.id) }));
  checkMissions();
}
function checkMissions() {
  const f = questFacts(), got = [];
  for (const m of G.missions ?? []) { if (!m.complete && missionDone(m.id, f)) { m.complete = true; got.push(m); } m.late = !m.complete && G.week > m.wk[1]; }
  return got;
}

// ---------------------------------------------------------------- targets: where each unit could go, and what you'd get
const rivalIn = (ct) => (ct.rivals ?? []).filter((r) => r.count > 0).map((r) => G.fac.get(r.id)).find((f) => f && !f.allied) ?? null;
function youChip(ct) {
  const f = ct.state === "rival" ? G.fac.get(ct.owner) : null;
  if (f && !f.allied && !G.prep.has(ct.name)) return { city: ct.name, label: `Groundwork in ${ct.name}`, get: `prepares ${ct.name}: next week's strike +30% (an unprepared rival city takes 2 orders)`, kind: "groundwork", fid: f.id };
  const foe = f && !f.allied ? f : rivalIn(ct), p = foe ? Math.round(oddsFor(ct, foe).p * 100) : null;
  return { city: ct.name, label: `Take ${ct.name}${p != null ? ` · ${p}%` : ""}`, get: `the city${(G.objective ?? "tour") === "tour" ? " and its tour stop" : ""}${foe ? `, if your crowd beats ${foe.name}'s` : ""}`, kind: "take", fid: foe?.id ?? null };
}
function chipsFor(id, all = false) {
  const n = lvl() >= 2 ? 4 : 3, out = [], cap = cityOf(G.capital) ?? G.cities[0];
  const add = (c, label, get, extra = {}) => { if (c && !out.some((x) => x.city === c.name && (x.kind ?? "") === (extra.kind ?? "") && (x.ally ?? "") === (extra.ally ?? ""))) out.push({ city: c.name, label, get, ...extra }); };
  const mine = G.cities.filter(isHeld).sort((a, b) => b.you - a.you), q = quest(), stopOf = (name) => q.slots.findIndex((s) => s.city === name);
  const byCap = (list) => [...list].sort((a, b) => gap(a, cap) - gap(b, cap));
  const u = unitOf(id);
  if (id === "you") {
    for (const sg of G.sieges) { const c = cityOf(sg.city), f = G.fac.get(sg.fid); if (c && f) add(c, `Defend ${c.name} · ${Math.round(oddsFor(c, f).p * 100)}%`, `keeps ${c.name}${stopOf(c.name) >= 0 ? " and its tour stop" : ""}`, { kind: "defend", fid: f.id }); }
    const t = cityOf(G.c.territory.target?.name); if (t && !isHeld(t)) { const ch = youChip(t); add(t, ch.label, ch.get, ch); }
    if (G.objCity && !isHeld(cityOf(G.objCity))) { const c = cityOf(G.objCity), ch = youChip(c); add(c, ch.label, ch.get, ch); }
    for (const c of byCap(G.cities.filter((c) => c.state === "beachhead" && !isHeld(c)))) { const ch = youChip(c); add(c, ch.label, ch.get, ch); }
    const nem = nemesis(), weak = nem && G.cities.filter((c) => c.owner === nem.id && c.state === "rival").sort((a, b) => oddsFor(b, nem).p - oddsFor(a, nem).p)[0];
    if (weak) { const ch = youChip(weak); add(weak, ch.label, ch.get, ch); }
    for (const c of byCap(G.cities.filter((c) => !isHeld(c) && c.state !== "uncharted"))) { const ch = youChip(c); add(c, ch.label, ch.get, ch); }
  } else if (id === "scout") {
    for (const it of G.intents) { const c = cityOf(it.city), f = G.fac.get(it.fid); if (c && f && !f.allied) add(c, `${c.name} (${lastName(f.name)} is coming)`, `what ${lastName(f.name)} is up to (Wikipedia) and what your fans there love`); }
    for (const c of byCap(G.cities.filter((c) => c.state === "uncharted"))) add(c, `${c.name} (uncharted)`, "lifts the fog and shows what they love");
    if (G.objCity && !G.scouted.has(G.objCity)) add(cityOf(G.objCity), `${G.objCity} (your new city)`, "what your fans there love; lifts the fog");
    for (const c of G.cities.filter((c) => !G.scouted.has(c.name) && c.state !== "uncharted" && !isHeld(c)).sort((a, b) => b.you - a.you)) add(c, c.name, c.state === "rival" ? "+intel, and a strike there takes 1 order, not 2" : "+intel, the city costs 1 less to take");
    for (const c of mine.filter((c) => !G.scouted.has(c.name))) add(c, c.name, "+intel for your posts there");
  } else if (id === "booker") {
    for (const s of q.slots.filter((s) => s.city && !s.on)) { const c = cityOf(s.city); add(c, `${c.name} (fills stop ${stopOf(c.name) + 1})`, `a booked room = tour stop ${stopOf(c.name) + 1}, venue email drafted`); }
    for (const c of mine.filter((c) => !roomOf(c.name))) add(c, c.name, "a booked room, a stop while you hold it");
    if (G.objCity) add(cityOf(G.objCity), `${G.objCity} (your new city)`, "a room in the city you're breaking into");
    for (const c of mine.filter((c) => roomOf(c.name))) add(c, `${c.name} (backup room)`, "a better room in a city you hold");
    for (const c of G.cities.filter((c) => c.state === "beachhead" && !isHeld(c))) add(c, `${c.name} (book ahead)`, "a room on hold: take the city to make it a stop");
  } else if (id === "sponsor") {
    const have = new Set(G.sponsors.map((s) => s.city));
    for (const c of mine.filter((c) => !have.has(c.name))) add(c, c.name, "+20 to 70 gold a week and a pitch email");
    for (const c of mine) add(c, `${c.name} (second brand)`, "another brand, more gold a week");
  } else if (id === "diplomat") {
    const facs = [...G.fac.values()].filter((f) => !f.allied && !G.parleyed.has(f.name)).sort((a, b) => (b.strategy === "ally") - (a.strategy === "ally") || b.plan.barter - a.plan.barter);
    for (const f of facs) { const c = cityOf(f.plan.city) ?? cityOf(f.plan.holds?.[0]) ?? cap; add(c, `${f.name} (${c.name})`, `${f.strategy === "ally" ? "an ally" : "a truce with a rival"} + a DM ready to send`, { ally: f.name }); }
    for (const a of (G.c.allies || []).filter((a) => !G.parleyed.has(a.name) && !facByName(a.name))) add(cap, `${a.name} (${cap.name})`, "an ally + a DM ready to send", { ally: a.name });
  } else if (id === "reader") {
    for (const sg of G.sieges) add(cityOf(sg.city), `${sg.city} (before the fight)`, "+30% odds there, a fan quote");
    for (const o of G.orderQueue.filter((o) => o.unitId === "you")) add(cityOf(o.city), `${o.city} (before the fight)`, "+30% odds there, a fan quote");
    const t = cityOf(G.c.territory.target?.name); if (t && !isHeld(t)) add(t, `${t.name} (before the fight)`, "+30% odds there, a fan quote");
    const nem = nemesis(), sc = nem && strikeCity(nem); if (sc) add(sc, `${sc.name} (before the fight)`, "+30% odds there, a fan quote");
    for (const c of G.cities.filter((c) => c.n > 0 && !G.prep.has(c.name)).sort((a, b) => b.you - a.you)) add(c, c.name, "a fan quote, +30% odds there");
  } else if (id === "showrunner") {
    for (const c of mine.filter((c) => roomOf(c.name))) add(c, c.name, u.brings);
  } else for (const c of mine) add(c, c.name, u.brings);
  // the AI strategist's plan, when it's on, moves its pick to the front
  const steps = G.aiPlan?.week === G.week ? G.aiPlan.plan?.steps ?? [] : [], kw = id === "you" ? /take|defend|strike|battle|hold/i : new RegExp(unitName(id).split(" ")[0], "i");
  for (const st of steps.slice(0, 3)) { const t = String(st.action ?? ""); if (!kw.test(t)) continue; const i = out.findIndex((c) => t.includes(c.city) || (c.ally && t.includes(c.ally))); if (i >= 0) { const [c] = out.splice(i, 1); out.unshift({ ...c, ai: true }); break; } }
  if (all) return out;
  // a gamble rides next to the first chip that allows one: rival cities and sponsor pitches, never a defence
  const res = out.slice(0, n), gi = res.findIndex((c) => (id === "you" && c.fid && cityOf(c.city)?.state === "rival" && c.kind !== "defend") || id === "sponsor");
  if (gi >= 0 && G.week <= WEEKS) res.splice(gi + 1, 0, gambleChip(id, res[gi]));
  return res;
}
// All-in: 2 orders + 100 gold for a 30% shot (40% from Lv IV) at three times the prize, or nothing
const gambleP = () => (lvl() >= 4 ? 0.4 : 0.3);
function gambleChip(id, c) {
  const p = Math.round(gambleP() * 100);
  return id === "you" ? { city: c.city, label: `All-in on ${c.city} · ${p}%`, get: `2 orders + 100 gold. ${p}%: ${c.city} and the 2 nearest cities flip to you (+3 stops). Otherwise nothing.`, kind: "allin", fid: c.fid, cost: 2, gold: 100, allin: true }
    : { city: c.city, label: `All-in pitch · ${p}%`, get: `2 orders + 100 gold. ${p}%: three brands sign at once. Otherwise nothing.`, kind: "allin", cost: 2, gold: 100, allin: true };
}
// a city on the map was clicked with this unit selected: its chip there, or a plain order
function orderAt(id, ct) {
  const c = chipsFor(id, true).find((x) => x.city === ct.name);
  const n0 = G.orderQueue.length, was = G.orderQueue.find((o) => o.unitId === id)?.city;
  if (c) queueOrder(id, c);
  else if (id === "you") { if (isHeld(ct) && !G.sieges.some((s) => s.city === ct.name)) return toast(`${ct.name} is already yours. Send You to a city you want to take.`); queueOrder(id, youChip(ct)); }
  else if (id === "diplomat") { const any = chipsFor(id, true)[0]; if (!any) return toast("No one left for the Diplomat to talk to."); queueOrder(id, { ...any, city: ct.name, label: `${any.ally} (${ct.name})` }); }
  else queueOrder(id, { city: ct.name, label: ct.name, get: unitOf(id).brings });
  const now = G.orderQueue.find((o) => o.unitId === id);
  if (now && (G.orderQueue.length > n0 || now.city !== was)) toast(`${unitName(id)} → ${ct.name}. It marches at END WEEK.`);
}
function queueOrder(id, chip) {
  if (!G || G.busy || G.over || !chip) return;
  const i = G.orderQueue.findIndex((o) => o.unitId === id), same = i >= 0 && G.orderQueue[i].city === chip.city && G.orderQueue[i].label === chip.label;
  const u = G.army.get(id);
  const old = i >= 0 ? G.orderQueue[i] : null, cost = chip.cost ?? 1, gold = chip.gold ?? 0;
  if (same) { G.orderQueue.splice(i, 1); G.ordersLeft += old.cost ?? 1; G.gold += old.gold ?? 0; if (u) { u.state = u.at && isHeld(cityOf(u.at)) ? "stationed" : "idle"; u.order = null; } Sound.play("nope"); }
  else {
    const free = G.ordersLeft + (old?.cost ?? 0), cash = G.gold + (old?.gold ?? 0);
    if (free < cost) { const t = $("#orders-tile"); t.classList.remove("pulse"); void t.offsetWidth; t.classList.add("pulse"); Sound.play("nope"); toast(cost > 1 ? `This needs ${cost} orders. Free one up or press END WEEK.` : "No orders left. Press END WEEK."); return; }
    if (cash < gold) { Sound.play("nope"); toast(`This needs ${gold} gold.`); return; }
    const o = { unitId: id, city: chip.city, label: chip.label, kind: chip.kind ?? null, fid: chip.fid ?? null, ally: chip.ally ?? null, get: chip.get ?? "", offer: chip.offer ?? null, cost, gold, allin: !!chip.allin };
    G.ordersLeft = free - cost; G.gold = cash - gold;
    if (i >= 0) G.orderQueue[i] = o; else G.orderQueue.push(o);
    if (u) { u.state = "ordered"; u.order = { city: chip.city, label: chip.label }; }
    Sound.play("select"); ops(`<span class="ag">order</span> ${esc(unitName(id))} → <b>${esc(chip.label)}</b>`);
    Coach.ordered?.(id);
  }
  hud(); renderAgents();
}
function selectUnit(id, force) {
  if (!G) return; const on = G.selected?.type === "unit" && G.selected.id === id;
  G.selected = on && !force ? null : { type: "unit", id }; Sound.play("select"); renderAgents();
}
function recruit(id) {
  const a = AGENTS.find((x) => x.id === id); if (!a || G.crew.get(id)?.recruited) return;
  if (G.gold < a.cost) return toast(`You need ${a.cost} gold to hire the ${a.name}. Cities and sponsors pay every week.`);
  G.gold -= a.cost; G.crew.set(id, { recruited: true, week: 0, busy: false }); spawnUnit(id); G.selected = { type: "unit", id };
  Sound.play("alliance"); ops(`<span class="ag">${a.icon} ${a.name}</span> joined your army`);
  if ([...G.crew.values()].filter((c) => c.recruited).length >= 3) ach("warlord");
  hud(); renderAgents();
}
// ---------------------------------------------------------------- the army rail
function renderAgents() {
  if (!G || !$("#army-list")) return;
  const L = lvl(), sel = G.selected?.type === "unit" ? G.selected.id : null;
  const rows = UNITS.filter((u) => u.id === "you" || BASE6.includes(u.id) || (u.lv === 3 && L >= 3) || G.crew.get(u.id)?.recruited);
  let html = "";
  for (const u of rows) {
    const a = agentOf(u.id), hired = unitReady(u.id), o = G.orderQueue.find((x) => x.unitId === u.id), unit = G.army.get(u.id), on = sel === u.id;
    let st = "Idle · ready", cls = "";
    if (!hired) { st = `Hire · ${a.cost} gold`; cls = "vi"; }
    else if (o) { st = `Ordered → ${o.city}`; cls = "ok"; }
    else if (u.id === "you") st = G.sieges.length ? `${G.sieges[0].city} under siege` : "Ready";
    else if (unit?.state === "stationed" && YIELD[u.id]?.gold) { const sp = G.sponsors.find((s) => s.city === unit.at); st = `In ${unit.at} · ${sp ? `${sp.name} +${sp.perWeek}` : `+${YIELD[u.id].gold * 7}`}/wk`; cls = "sf"; }
    const tile = u.id === "you" ? `<span class="utile" style="--g1:#2a1a4a">${avatar(G.player.image, G.player.name)}</span>` : `<span class="utile${G.busy && o ? " busy" : ""}" style="--g1:${AG_COL[u.id]?.[0] ?? "#af50ff"}">${I(u.ic)}</span>`;
    const name = u.id === "you" ? `You <em>Lv ${levelOf(G.xp).roman}</em>` : `${esc(a.name)} <em>${"★".repeat(starsOf(u.id))}</em>`;
    html += `<button class="urow${on ? " sel" : ""}${hired ? "" : " dim"}" data-u="${u.id}" aria-pressed="${on}">${tile}<span class="ub"><span class="ub1"><b>${name}</b><span class="${cls}">${esc(st)}</span></span><span class="d"><i>Does:</i> ${esc(u.does)}</span><span class="g"><i>Brings back:</i> ${esc(u.brings)}</span>${u.power ? `<span class="pw${L >= 3 ? " on" : ""}"><i>${L >= 3 ? "Lv III power:" : "At Lv III:"}</i> ${esc(u.power)}</span>` : ""}</span></button>`;
    if (on && hired) html += orderBox(u.id);
  }
  html += offersBox();
  $("#army-list").innerHTML = html;
  $("#army-lock").textContent = L < 3 ? `Lv III · Theater Tour: every agent gets its second power (${levelOf(G.xp).toNext} XP to go)` : "Every agent has its Lv III power.";
  const n = G.orderQueue.length, eb = $("#endweek");
  eb.textContent = n ? `END WEEK · ${n} order${n > 1 ? "s" : ""} queued` : "END WEEK"; eb.disabled = G.busy || G.over;
  $$("#army-list [data-u]").forEach((b) => { b.addEventListener("click", () => { if (b._dragged) return; const id = b.dataset.u; if (!unitReady(id)) return recruit(id); selectUnit(id); }); railDrag(b); });
  $$("#army-list [data-chip]").forEach((b) => {
    const c = G._chips?.[+b.dataset.chip];
    b.addEventListener("click", () => queueOrder(G._chipsFor, c));
    b.addEventListener("mouseenter", () => { const g = $("#chip-get"); if (g && c) g.textContent = "You get: " + c.get; });
  });
  $$("#army-list [data-claim]").forEach((b) => b.addEventListener("click", () => claimOffer(b.dataset.claim)));
  renderPrimary();
}
// drag a unit's row from the rail onto a city on the map: a ghost follows the pointer
function railDrag(b) {
  b.addEventListener("pointerdown", (e) => {
    const id = b.dataset.u; if (e.button !== 0 || !G || G.busy || !unitReady(id)) return;
    const x0 = e.clientX, y0 = e.clientY; let ghost = null, target = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = document.createElement("div"); ghost.className = "dragghost";
        ghost.innerHTML = `<span class="face" style="--g1:${AG_COL[id]?.[0] ?? "#af50ff"};--g2:${AG_COL[id]?.[1] ?? "#4c1a91"}">${I(unitOf(id).ic)}</span><span><b>${esc(unitName(id))}</b><small>Drop it on a city</small></span>`;
        document.body.appendChild(ghost); document.body.classList.add("dragging-agent"); G.selected = { type: "unit", id };
      }
      ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 14}px)`;
      const pk = MapView.pick(ev.clientX, ev.clientY); target = pk?.city ?? null; G.hoverCity = target;
      G.drag = pk ? { id, pt: pk.pt } : null;
      ghost.querySelector("small").textContent = target ? `Send to ${target.name}` : pk ? "Drop it on a city" : "Drag onto the map";
      ghost.classList.toggle("ok", !!target);
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      if (!ghost) return;
      ghost.remove(); document.body.classList.remove("dragging-agent"); G.drag = null;
      b._dragged = true; setTimeout(() => (b._dragged = false), 80);
      if (target) orderAt(id, target); else renderAgents();
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  });
}
function orderBox(id) {
  const chips = chipsFor(id), o = G.orderQueue.find((x) => x.unitId === id);
  if (o && !chips.some((c) => c.city === o.city && c.label === o.label)) chips.unshift({ ...o });
  G._chips = chips; G._chipsFor = id;
  const last = G.army.get(id)?.lastLoot, freeO = G.ordersLeft + (o?.cost ?? 0), freeG = G.gold + (o?.gold ?? 0);
  const ok = (c) => (o && o.city === c.city && o.label === c.label) || (freeO >= (c.cost ?? 1) && freeG >= (c.gold ?? 0));
  const why = (c) => (freeO < (c.cost ?? 1) ? (c.cost > 1 ? `Needs ${c.cost} orders.` : "No orders left. Press END WEEK.") : `Needs ${c.gold} gold.`);
  return `<div class="obox"><div>Send <strong>${esc(unitName(id))}</strong> to:</div><div class="chips2">${chips.length ? chips.map((c, i) => `<button class="chip2${c.allin ? " allin" : ""}${o && o.city === c.city && o.label === c.label ? " on" : ""}" data-chip="${i}" title="${esc(ok(c) ? c.get : why(c))}" ${ok(c) ? "" : "disabled"}>${esc(c.label)}${c.ai ? " <small>strategist</small>" : ""}</button>`).join("") : `<span class="get">Nowhere useful this week.</span>`}</div>
    <div class="get" id="chip-get">${chips[0] ? "You get: " + esc(chips[0].get) : ""}</div>${last && !last.empty ? `<div class="rail-lock">Last report (${esc(last.city)}): ${esc(stripTags(last.fact))}</div>` : ""}</div>`;
}
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const stripTags = (h) => { const d = document.createElement("div"); d.innerHTML = h ?? ""; return d.textContent; };
// exactly one thing glows: the selected unit's first chip, the next idle unit, or END WEEK
function renderPrimary() {
  $$("#game .next").forEach((e) => e.classList.remove("next"));
  if (!G || G.busy || G.over) return;
  if (G.ordersLeft <= 0) return $("#endweek")?.classList.add("next");
  const sel = G.selected?.type === "unit" && G.selected.id;
  if (sel && !G.orderQueue.some((o) => o.unitId === sel)) { const c = $('.chip2[data-chip="0"]'); if (c) return c.classList.add("next"); }
  const idle = $$("#army-list .urow").find((b) => unitReady(b.dataset.u) && !G.orderQueue.some((o) => o.unitId === b.dataset.u));
  (idle ?? $("#endweek"))?.classList.add("next");
}
const renderSel = () => renderAgents();
function renderOrders() { renderAgents(); if (Drawer.mode === "missions") Drawer.render(); }
function prep(city, why) {
  if (!G.prep.has(city.name)) { G.prep.add(city.name); ops(`<span class="ok">✓ ${esc(city.name)} prepared</span>: battles there +30% (${esc(why)})`); float(city.p, "✓ PREPARED", "#7fd8ff"); }
}

// ---------------------------------------------------------------- offers: one week, one order each, no countdown
function buildOffers() {
  const pool = [], taken = new Set(G.offersSeen ?? []);
  const pot = G.potions.find((p) => !p.used && !taken.has("tw:" + p.title));
  if (pot) pool.push({ id: "tw:" + pot.title, kind: "trend", ref: pot.title, title: `Trend wave: “${pot.title}”`, text: `Trending in ${pot.where} (Google Trends). Post a take on it.`, reward: "+1 order next week" });
  const fans = G.cities.filter((c) => c.mean && sideOf(c) !== "fog" && !taken.has("fm:" + c.name)).sort((a, b) => b.mean - a.mean)[G.week % 3];
  if (fans) pool.push({ id: "fm:" + fans.name, kind: "meetup", ref: fans.name, city: fans.name, title: `Fan meetup in ${fans.name}`, text: `Fans there rated you ${fans.mean}/5 (simulated from Qloo).`, reward: "city prepared, +0.1 material" });
  const brand = (G.player.aud?.domains?.brand ?? []).find((x) => !G.sponsors.some((s) => s.name === x.name) && !taken.has("sp:" + x.name));
  if (brand) pool.push({ id: "sp:" + brand.name, kind: "post", ref: brand.name, title: `${brand.name} sponsored post`, text: `Your fans' taste neighbours love ${brand.name} (${Math.round(brand.affinity * 100)}% affinity, Qloo).`, reward: "+90 gold" });
  const pal = [...G.fac.values()].find((f) => !f.allied && f.strategy === "ally" && !G.parleyed.has(f.name) && !taken.has("op:" + f.name));
  if (pal) pool.push({ id: "op:" + pal.name, kind: "opener", ref: pal.name, city: pal.plan.city, title: `${pal.name} is booking an opener`, text: `${pal.plan.city ? `Show in ${pal.plan.city}. ` : ""}Shared taste, new crowd.`, reward: "parley at +15 barter" });
  const out = []; while (pool.length && out.length < 2) out.push(pool.splice(Math.floor(G.rng() * pool.length), 1)[0]);
  return out;
}
function offersBox() {
  if (!G.offers?.length) return "";
  return `<div class="woffers"><h3>Offers this week · 1 order each</h3>${G.offers.map((o) => { const on = G.orderQueue.some((q) => q.offer === o.id); return `<div class="offer2"><span><b>${esc(o.title)}</b> · <em>${esc(o.reward)}</em></span><button class="chip2${on ? " on" : ""}" data-claim="${esc(o.id)}" ${G.ordersLeft > 0 || on ? "" : "disabled title=\"No orders left. Press END WEEK.\""}>${on ? "Claimed · undo" : "Claim · 1 order"}</button></div>`; }).join("")}</div>`;
}
function claimOffer(id) {
  const o = G.offers.find((x) => x.id === id); if (!o) return;
  queueOrder("offer:" + o.id, { city: o.city ?? G.capital, label: o.title, get: o.reward, kind: "offer", offer: o.id });
  if ($("#weekshow").hidden === false) Show.offers(G.offers);
}
// claimed offers pay out at END WEEK, as loot with the same five lines
function applyOffer(o) {
  const x = G.offers.find((y) => y.id === o.offer); if (!x) return null;
  (G.offersSeen ??= []).push(x.id);
  const L = { unit: "offer", city: x.city ?? G.capital, title: x.title, receipts: [], xp: 20, mapChange: "nothing changed" };
  if (x.kind === "trend") { const p = G.potions.find((q) => q.title === x.ref); if (p) p.used = true; G.bonusNext++; ach("surfer"); Object.assign(L, { fact: `You posted a take on <b>${esc(x.ref)}</b> while it was trending.`, receipts: ["Google Trends"], questChange: "+1 order next week", realMove: { title: `Post on “${x.ref}”`, detail: x.text } }); }
  else if (x.kind === "meetup") { const c = cityOf(x.ref); G.morale = Math.min(5, G.morale + 0.1); if (c) prep(c, "fan meetup"); Object.assign(L, { fact: `A pop-up for your <b>${esc(x.ref)}</b> fans. Your material now reads ${G.morale.toFixed(1)} of 5.`, receipts: ["1,000-fan panel (simulated from Qloo)"], mapChange: `${x.ref} prepared · +30% in battle`, realMove: { title: `Host a fan meetup in ${x.ref}`, detail: x.text } }); }
  else if (x.kind === "post") { G.gold += 90; Object.assign(L, { fact: `<b>${esc(x.ref)}</b> paid for one sponsored post.`, receipts: ["Qloo brands your fans love"], gold: 90, realMove: { title: `Post the ${x.ref} spot`, detail: x.text } }); }
  else if (x.kind === "opener") { const f = facByName(x.ref); if (!f) return null; G.parleyed.add(f.name); const r = parleySilent({ name: f.name, f, barter: f.plan.barter + 15, netnew: f.plan.netnew, convert: f.plan.convert, city: f.plan.city }); G.dms.push({ name: f.name, yes: r.yes, text: r.pitch, city: f.plan.city }); Object.assign(L, { fact: r.yes ? `<b>${esc(f.name)}</b> said yes: you open for them${f.plan.city ? ` in ${esc(f.plan.city)}` : ""}.` : `<b>${esc(f.name)}</b> went with someone else this time.`, receipts: ["Qloo taste overlap", `barter ${r.barter}/100`], mapChange: r.yes ? `${f.name}'s cities count for your quest` : "nothing changed", realMove: { title: `DM ${f.name}`, detail: r.pitch } }); }
  if (L.realMove) addRealMove(L.realMove, "Offer", L.city);
  return L;
}

// ---------------------------------------------------------------- the jobs: real calls that come back with loot
// Every job fills the five lines of the outcome rule: the fact, its receipt, the
// map change, what it did for the quest (or XP), and the real move it created.
const pick = (arr, used) => (arr ?? []).find((x) => !used.has(x.name));
const emptyJob = (city, receipt) => ({ loot: { fact: "Qloo had nothing distinctive here. Nothing changed.", receipts: [receipt], mapChange: "nothing changed", xp: 0, empty: true } });
const objIs = (id) => (G.objective ?? "tour") === id;
// one source per old agent; the five agents below run several of these and merge them
const SRC = {
  async scout(city, st) {
    const [r, base] = await Promise.all([api(`/api/partners?${qs({ ...G.player.q, kind: "brands", location: city.name })}`), cityBaseline(city)]);
    const names = (r.partners || []).slice(0, st >= 2 ? 4 : 3).map((p) => p.name);
    if (!names.length) return emptyJob(city, `Qloo brands × ${city.name}`);
    const vs = vsCity(city, names[0], 1, `your ${city.name} fans`, base);
    const fog = city.state === "uncharted"; G.scouted.add(city.name);
    if (fog) city.state = (city.mean ?? 0) >= (G.c.aggregate?.mean ?? 3.5) ? "beachhead" : "hard";
    prep(city, "Scout intel"); assignStates(); MapView.relayer();
    return { intel: `🔭 Fans here also love ${names.join(", ")}. Mention them on stage.`, loot: {
      fact: `Your ${esc(city.name)} fans also love <b>${names.map(esc).join(", ")}</b>.${vs ? `<br>${vs}` : ""}`, receipts: [`Qloo brands × ${city.name}`, `${names.length} receipts`, ...(vs ? [`Qloo · ${city.name} overall, no artist signal`] : [])], xp: 40,
      mapChange: fog ? `fog lifted around ${city.name} · ${city.state === "beachhead" ? "ring = ripe" : "open ground"}` : city.state === "rival" ? `${city.name} prepared · a strike there now takes 1 order, not 2` : `${city.name} prepared · +30% in a fight there`,
      questChange: objIs("city") && city.name === G.objCity ? "fog lifted on your new city" : null,
      realMove: { title: `Mention ${names.slice(0, 2).join(", ")} in your next ${city.name} post`, detail: `From Qloo: your ${city.name} fans over-index on ${names.join(", ")}.` } } };
  },
  async booker(city, st) {
    const r = await api(`/api/partners?${qs({ ...G.player.q, kind: "venues", location: city.name })}`);
    const v = (r.partners || []).slice(0, st >= 2 ? 3 : 2);
    if (!v.length) return emptyJob(city, `Qloo places × ${city.name}`);
    prep(city, `${v[0].name} on hold`);
    const held = isHeld(city), fit = Math.round(v[0].convert * 100);
    // one Fri/Sat night per stop, in route order, never two rooms on the same night
    const order = tourOrder([...new Set([...heldNames(), city.name])]), used = new Set(G.nights.filter((n) => n.venue && n.city !== city.name).map((n) => n.date));
    let k = Math.max(0, order.indexOf(city.name)), date = nightFor(k); while (used.has(date)) date = nightFor(++k);
    G.nights = G.nights.filter((n) => !(n.city === city.name && n.venue));
    G.nights.push({ date, city: city.name, venue: v[0].name, fit, backup: v[1]?.name ?? null, why: `${fit}% crowd fit (Qloo places)` });
    // the calendar follows the drive: booked rooms take Fri/Sat nights in route order
    tourOrder(G.nights.filter((n) => n.venue).map((n) => n.city)).forEach((c, k) => { const n = G.nights.find((x) => x.venue && x.city === c); if (n) n.date = nightFor(k); });
    date = G.nights.find((n) => n.venue && n.city === city.name).date;
    const q = quest(), n = q.slots.findIndex((s) => s.city === city.name) + 1;
    const mail = `Hi ${v[0].name} team, I'm ${G.player.name}. Qloo puts your crowd at a ${fit}% fit with my fans in ${city.name}. I'd like to hold ${shortDay(date)} for a set. What's your availability and the usual split?`;
    G.venueMails = G.venueMails.filter((m) => m.city !== city.name).concat({ venue: v[0].name, city: city.name, text: mail });
    return { intel: `🎟️ Book ${v[0].name}${v[1] ? ` (backup: ${v[1].name})` : ""}.`, loot: {
      fact: `<b>${esc(v[0].name)}</b>, ${shortDay(date)}, ${fit}% crowd fit${v[1] ? `. Backup: ${esc(v.slice(1).map((x) => x.name).join(", "))}` : ""}. Venue email drafted.`, receipts: [`Qloo places × ${city.name}`], xp: 60,
      mapChange: `venue badge on ${city.name}${held ? " · route extends" : ""}`, stopN: held && n > 0 ? n : 0,
      questChange: objIs("tour") ? (held && n > 0 ? `tour stop ${n} of 6 complete` : `room on hold: take ${city.name} to make it a stop`) : objIs("city") && city.name === G.objCity ? "a room in your new city" : null,
      realMove: { title: `Email ${v[0].name} about ${shortDay(date)}`, detail: mail },
      action: objIs("tour") && q.have >= 4 ? { label: "Tour Planner ready: see the route", run: "tour" } : null } };
  },
  async sponsor(city, st) {
    const used = new Set(G.sponsors.map((s) => s.name)), b = pick(G.player.aud?.domains?.brand, used), base = b ? await cityBaseline(city) : null;
    const vs = b && vsCity(city, b.name, (G.player.aud?.domains?.brand ?? []).findIndex((x) => x.name === b.name) + 1, "your fans", base);
    if (!b) return emptyJob(city, "Qloo brands your fans love");
    const aff = Math.round(b.affinity * 100), perWeek = Math.round(20 + b.affinity * 50) + (st >= 2 ? 10 : 0);
    G.sponsors.push({ name: b.name, perWeek, city: city.name, aff }); ach("paid"); G.gold += perWeek;
    const pitch = { brand: b.name, city: city.name, text: `Hi ${b.name} team, I'm ${G.player.name}. ${aff}% of my fans over-index on you (Qloo). I'm playing ${city.name} soon: a sponsored post and a night with your name on it?` };
    G.sponsorPitches.push(pitch);
    aiWrite("sponsor", { name: G.player.name, brand: b.name, affinity: aff, audience: (G.player.aud?.tags ?? []).slice(0, 3).join(", ") }, null).then((mail) => { if (mail) { pitch.text = mail; ops(`<span class="api">AI · Sponsor scout</span> pitch to <b>${esc(b.name)}</b> rewritten`); } });
    return { intel: `💼 Sponsor: ${b.name} (+${perWeek} gold a week).`, loot: {
      fact: `<b>${esc(b.name)}</b> signs on: ${aff}% affinity with your fans. First payment in, pitch email drafted.${vs ? `<br>${vs}` : ""}`, receipts: ["Qloo brands your fans love", ...(vs ? [`Qloo · ${city.name} overall, no artist signal`] : [])], gold: perWeek, xp: 50, brand: b.name, brand: b.name,
      mapChange: `sponsor badge on ${city.name} · income +${perWeek}/wk`, questChange: objIs("sponsor") ? `sponsor ${G.sponsors.length} of 3` : null,
      realMove: { title: `Send the ${b.name} pitch`, detail: pitch.text } } };
  },
  async diplomat(city, st, order) {
    let f = order?.ally ? facByName(order.ally) : null, a = order?.ally && !f ? (G.c.allies || []).find((x) => x.name === order.ally) : null;
    if (!f && !a) { f = [...G.fac.values()].filter((x) => !x.allied && x.strategy === "ally" && !G.parleyed.has(x.name)).sort((p, q) => q.plan.barter - p.plan.barter)[0]; if (!f) a = (G.c.allies || []).find((x) => !G.parleyed.has(x.name)); }
    if (!f && !a) return emptyJob(city, "Qloo taste overlap");
    const ally = f ? { name: f.name, f, barter: f.plan.barter, netnew: f.plan.netnew, convert: f.plan.convert, city: f.plan.city ?? city.name } : { name: a.name, f: null, barter: a.barter, netnew: a.netnew, convert: a.convert, city: city.name };
    G.parleyed.add(ally.name);
    const r = parleySilent(ally), dm = { name: ally.name, yes: r.yes, text: r.pitch, city: ally.city }; G.dms.push(dm);
    aiWrite("pitch", { name: G.player.name, partner: ally.name, offer: r.offer.name, city: ally.city, netnew: Math.round(ally.netnew * 100), convert: Math.round(ally.convert * 100) }, null).then((t) => { if (t) dm.text = t; });
    return { loot: {
      fact: r.yes ? `<b>${esc(ally.name)}</b> said yes: ${esc(lowerFirst(r.offer.name))}.` : `<b>${esc(ally.name)}</b> passed on ${esc(lowerFirst(r.offer.name))} for now. The DM is still worth sending.`,
      receipts: ["Qloo taste overlap", `barter ${r.barter}/100`], xp: 50,
      mapChange: r.yes ? (f ? `${ally.name}'s cities count for your quest · no more attacks from them` : `${ally.name} is your ally`) : "nothing changed",
      questChange: objIs("collab") ? `DM ${G.dms.length} of 5 · ${G.allies + G.guestSpots.length} accepted` : r.yes ? "an opener for your tour" : null,
      realMove: { title: `DM ${ally.name}`, detail: r.pitch } } };
  },
  async reader(city, st) {
    const ppl = (G.player.aud?.personas ?? []).filter((p) => p.metro === city.name);
    const scored = ppl.map((p) => ({ ...p, s: G.reactions.get(p.id) })).filter((p) => p.s != null).sort((a, b) => b.s - a.s);
    if (!scored.length && city.mean == null) return emptyJob(city, "1,000-fan panel (simulated from Qloo)");
    prep(city, "room read"); if (st >= 2) G.readBonus.set(city.name, 0.05);
    const top = scored[0], qt = (G.c?.aggregate?.quotes ?? []).find((x) => x.persona?.includes(city.name)), rating = top ? top.s : city.mean;
    if (rating >= 4 && G.sponsors.length) G.proven = true;
    G.fanLine = { city: city.name, text: qt ? qt.text.replace(/\s*\(\d\/5\)\s*$/, "") : null, rating: city.mean ?? rating };
    Neuro.play(G.c.tribe); brainNote();
    return { intel: `🎭 ${scored.length || city.n} simulated fans here; best reaction from ${top?.tastes?.slice(-1)[0] ?? "your core"} fans.`, loot: {
      fact: top ? `<b>${scored.length} simulated fans</b> in ${esc(city.name)} rated your bit: the best a ${top.s} of 5 from ${esc(top.tastes?.slice(-1)[0] ?? "your core")} fans${city.mean != null ? `, ${city.mean} on average` : ""}.` : `Your material rates <b>${city.mean} of 5</b> with the fans in ${esc(city.name)}.`,
      receipts: ["1,000-fan panel (simulated from Qloo)"], xp: 40,
      mapChange: `${city.name} prepared · +${st >= 2 ? 35 : 30}% in battle · fan strip updated`, questChange: objIs("sponsor") && G.proven ? "crowd proven: a 4+ rating" : null,
      realMove: { title: `Open with ${G.c.stimulus?.label ?? "your best bit"} in ${city.name}`, detail: `The ${city.name} panel liked it most from ${top?.tastes?.slice(-1)[0] ?? "your core"} fans.` },
      action: st >= 2 ? { label: "X-ray your last 6 videos with these fans", run: "xray" } : null } };
  },
  async spy(city, st, order) {
    const names = [G.player.name, ...[...G.fac.values()].map((f) => f.name)];
    const r = await api(`/api/fame?names=${encodeURIComponent(names.join("|"))}`).catch(() => null);
    if (r?.status === "ok") for (const p of r.people) G.fame.set(p.name, p);
    // the scout's watch on this city: who's coming here (no walls: those cost gold now)
    const it = G.intents.find((x) => x.city === city.name && !G.fac.get(x.fid)?.allied), f = it && G.fac.get(it.fid), wall = null;
    const watch = f || (order?.fid && G.fac.get(order.fid)) || nemesis(), fm = watch && G.fame.get(watch.name);
    if (it) G.intel.set(it.city, [...(G.intel.get(it.city) ?? []), `🕵️ ${f?.name} attacks here at END WEEK.`]);
    // ★★: one week further out, where the nemesis is likely to go next
    const nem = nemesis(), after = st >= 2 && nem ? G.cities.filter((c) => sideOf(c) === "you" && c.name !== it?.city).sort((a, b) => (b.rivals.find((r) => r.id === nem.id)?.count ?? 0) / Math.max(1, b.you) - (a.rivals.find((r) => r.id === nem.id)?.count ?? 0) / Math.max(1, a.you))[0] : null;
    return { loot: {
      fact: `${watch ? `<b>${esc(watch.name)}</b> ${fm?.views != null ? `has ${kfmt(fm.views)} Wikipedia views in 30 days${fm.momentum != null ? `, ${fm.momentum >= 0 ? "up" : "down"} ${Math.abs(fm.momentum)}%` : ""}` : "has no Wikipedia page to read"}.` : "No rival to watch."}${it ? ` ${esc(f.name)} hits <b>${esc(it.city)}</b> at END WEEK.` : " Nobody is marching on it this week."}${after ? ` Next likely target: <b>${esc(after.name)}</b>.` : ""}`,
      receipts: ["Wikipedia · 30-day views"], xp: 30, mapChange: wall ? `walls up in ${wall}${it && wall === it.city ? ": the attack will bounce" : ""}` : "nothing changed", realMove: null } };
  },
  async herald(city) {
    G.heard ??= new Set(); const p = pick(G.player.aud?.domains?.podcast, G.heard);
    if (!p) return emptyJob(city, "Qloo podcasts your fans follow"); G.heard.add(p.name);
    G.guestSpots.push({ name: p.name, city: city.name, aff: Math.round(p.affinity * 100) }); G.morale = Math.min(5, G.morale + 0.1);
    return { intel: `🎙️ Pitch a guest spot on ${p.name}.`, loot: { fact: `A guest spot on <b>${esc(p.name)}</b>: ${Math.round(p.affinity * 100)}% of your fans' taste neighbours listen.`, receipts: ["Qloo podcasts your fans follow"], xp: 50, mapChange: `podcast badge on ${city.name}`, questChange: objIs("collab") ? `${G.allies + G.guestSpots.length} accepted` : objIs("city") && city.name === G.objCity ? "a local voice in your new city" : null, realMove: { title: `Pitch ${p.name}`, detail: `Hi! My fans in ${city.name} listen to you (Qloo). I'd love to come on when I'm in town.` } } };
  },
  async oracle(city) {
    const [lon, lat] = METROS[city.name]; const r = await api(`/api/weather?lat=${lat}&lon=${lon}`);
    if (r.status !== "ok" || !r.days?.length) return emptyJob(city, "Open-Meteo 7-day");
    const best = [...r.days].sort((a, b) => a.rain - b.rain || [5, 6, 4].indexOf(new Date(b.date).getDay()) - [5, 6, 4].indexOf(new Date(a.date).getDay()))[0];
    const room = G.nights.find((n) => n.city === city.name && n.venue);
    if (room) Object.assign(room, { date: best.date, why: `${room.why} · ${best.rain}% rain (Open-Meteo)` }); else G.nights.push({ date: best.date, city: city.name, why: `${best.rain}% rain, ${Math.round(best.tmax)}°C (Open-Meteo)` });
    prep(city, `dry show night ${shortDay(best.date)}`);
    return { intel: `🌦️ Play ${shortDay(best.date)}: ${best.rain}% chance of rain.`, loot: { fact: `Best show night in ${esc(city.name)}: <b>${shortDay(best.date)}</b>, ${best.rain}% rain, ${Math.round(best.tmax)}°C.`, receipts: ["Open-Meteo 7-day"], xp: 30, mapChange: `night pinned to ${city.name}${room ? ` (${room.venue})` : ""}`, questChange: objIs("city") && city.name === G.objCity ? "a night in your new city" : "goes in your calendar", realMove: null } };
  },
  async trend(city) {
    const stc = STATE[city.name]; const got = await addTrends(stc ? `US-${stc}` : "US", city.name);
    if (!got.length) return emptyJob(city, `Google Trends · ${stc ?? "US"}`);
    const p = got[0]; if (lvl() >= 3) G.offersNext.push({ id: "tw:" + p.title, kind: "trend", ref: p.title, title: `Trend wave: “${p.title}”`, text: `Trending in ${city.name} (Google Trends).`, reward: "+1 order next week" });
    return { intel: `📈 Trending around ${city.name}: ${got.map((x) => x.title).join(", ")}.`, loot: { fact: `Rising around ${esc(city.name)}: <b>${got.map((x) => esc(x.title)).join(", ")}</b>.`, receipts: [`Google Trends · ${stc ?? "US"}`], xp: 30, mapChange: `trend badge on ${city.name}`, questChange: "a Trend wave offer next week", realMove: { title: `Post on “${p.title}”`, detail: `Trending in ${city.name} right now.` } } };
  },
  async scribe(city) {
    const tags = (G.player.aud?.tags || []).filter((t) => !/protagonist|fiction|animated|minions|dinosaur|zoo|organic|academic/i.test(t)).slice(0, 2);
    const tr = G.potions.find((p) => !p.used && p.where === city.name) ?? G.potions.find((p) => !p.used);
    const draft = `${city.name}: if you grew up on ${tags[0] || "great comedy"}${tags[1] ? ` and ${tags[1]}` : ""}, this one's for you. ${tr ? `Got thoughts on ${tr.title}. ` : ""}New set, one night only.`;
    const text = await aiWrite("caption", { name: G.player.name, city: city.name, tastes: tags, trend: tr?.title }, draft);
    G.drafts.push(text); G.posts.add(city.name); G.bonusNext++;
    return { loot: { fact: `Post ready: “${esc(text)}”`, receipts: [`Qloo tags${tr ? " + Google Trends" : ""}`], xp: 30, mapChange: "nothing changed", questChange: "+1 order next week", realMove: { title: `Post it in ${city.name}`, detail: text } } };
  },
  async showrunner(city) {
    if (!isHeld(city)) return emptyJob(city, "Qloo artists, brands, podcasts, films");
    const d = G.player.aud?.domains ?? {}, venue = roomOf(city.name)?.venue ?? "the biggest room in town";
    const dj = d.artist?.[0]?.name, brand = G.sponsors[0]?.name ?? d.brand?.[0]?.name, host = d.podcast?.[0]?.name;
    const plan = `${venue} · DJ set in the spirit of ${dj ?? "your crowd's favourites"} · sponsored by ${brand ?? "a local brand"}${host ? ` · hosted with ${host}` : ""}`;
    G.gold += 200; G.morale = Math.min(5, G.morale + 0.2); boom(city.p, COL.you); ach("fest");
    return { loot: { fact: `Festival night in ${esc(city.name)}: <b>${esc(plan)}</b>.`, receipts: ["Qloo artists, brands, podcasts"], gold: 200, xp: 100, mapChange: `festival badge on ${city.name}`, questChange: null, realMove: { title: "Book the line-up", detail: plan } } };
  },
};
// What your fans like vs what the whole city likes: one more Qloo call with no performer
// signal, compared by rank only (affinity is rescaled per response). No baseline, no line.
const BASE = new Map();
function cityBaseline(city) {
  if (!BASE.has(city.name)) BASE.set(city.name, api(`/api/popular?kind=brands&location=${encodeURIComponent(city.name)}`).then((r) => (r?.status === "ok" && r.names?.length ? r.names : null)).catch(() => null));
  return BASE.get(city.name);
}
function vsCity(city, name, rank, whose, base) {
  if (!base?.length || !name || rank < 1) return null;
  const at = base.findIndex((n) => n.toLowerCase() === name.toLowerCase()), c = esc(city.name);
  if (at === 0) return `<b>${esc(name)}</b> is #1 for ${esc(whose)} and for ${c} overall: no hidden edge here.`;
  return `<b>${esc(name)}</b>: #${rank} for ${esc(whose)} · ${at > 0 ? `#${at + 1} in ${c} overall` : `not in ${c}'s top 20 overall`}. Without Qloo you'd have pitched <b>${esc(base[0])}</b>.`;
}
// fold several sources into one loot card: one fact line per source, every receipt, the primary's XP
function mergeLoot(city, parts) {
  const ok = parts.filter((p) => p?.loot && !p.loot.empty); if (!ok.length) return parts[0] ?? emptyJob(city, "Qloo");
  const L = { ...ok[0].loot }, all = ok.map((p) => p.loot), first = (k) => all.find((x) => x[k])?.[k] ?? null;
  L.fact = all.map((x) => x.fact).join("<br>"); L.receipts = [...new Set(all.flatMap((x) => x.receipts))];
  L.mapChange = all.map((x) => x.mapChange).filter((m) => m && m !== "nothing changed").join(" · ") || "nothing changed";
  L.questChange = all.map((x) => x.questChange).filter(Boolean).join(" · ") || null;
  L.gold = all.reduce((s, x) => s + (x.gold ?? 0), 0) || undefined;
  for (const k of ["realMove", "action", "stopN", "brand"]) L[k] = first(k);
  L.removed = parts.filter((p) => !p || p.loot?.empty).length; // sources that came back with nothing: their claims are dropped, not guessed
  return { intel: ok.map((p) => p.intel).filter(Boolean).join(" ") || undefined, loot: L };
}
const AGENT_JOBS = {
  // know a city: brands, trends, and who's coming
  async scout(city, st, order) { const [a, b, c] = await Promise.all([SRC.scout(city, st), SRC.trend(city).catch(() => null), SRC.spy(city, st, order).catch(() => null)]); return mergeLoot(city, [a, b, c]); },
  // book a show: the room, the weather that week, and at Lv III a festival when it's your second room there
  async booker(city, st, order) {
    const had = !!roomOf(city.name) && isHeld(city), [lon, lat] = METROS[city.name] ?? [];
    const [a, w] = await Promise.all([SRC.booker(city, st), lat != null ? api(`/api/weather?lat=${lat}&lon=${lon}`).catch(() => null) : null]);
    const parts = [a];
    if (w?.status === "ok" && w.days?.length) { const dry = [...w.days].sort((x, y) => x.rain - y.rain)[0]; parts.push({ loot: { fact: `Driest night there this week: ${shortDay(dry.date)}, ${dry.rain}% rain, ${Math.round(dry.tmax)}°C.`, receipts: ["Open-Meteo 7-day"], mapChange: "nothing changed" } }); }
    if (lvl() >= 3 && had && !a.loot.empty) parts.push(await SRC.showrunner(city));
    return mergeLoot(city, parts);
  },
  // get paid: one brand, and at Lv III a second as a backup pitch
  async sponsor(city, st, order) {
    const a = await SRC.sponsor(city, st); if (a.loot.empty || lvl() < 3) return a;
    const b = pick(G.player.aud?.domains?.brand, new Set([...G.sponsors.map((s) => s.name), ...G.sponsorPitches.map((p) => p.brand)]));
    if (b) { G.sponsorPitches.push({ brand: b.name, city: city.name, text: `Hi ${b.name} team, I'm ${G.player.name}. ${Math.round(b.affinity * 100)}% of my fans over-index on you (Qloo). A sponsored night in ${city.name}?` }); a.loot.fact += `<br>Backup pitch drafted: <b>${esc(b.name)}</b> (${Math.round(b.affinity * 100)}% affinity).`; }
    return a;
  },
  // make a friend: a parley, and at Lv III a podcast guest spot too
  async diplomat(city, st, order) { const a = await SRC.diplomat(city, st, order); return lvl() >= 3 ? mergeLoot(city, [a, await SRC.herald(city).catch(() => null)]) : a; },
  // test the material: the panel, and at Lv III the post for that city
  async reader(city, st) { const a = await SRC.reader(city, st); return lvl() >= 3 && !a.loot.empty ? mergeLoot(city, [a, await SRC.scribe(city).catch(() => null)]) : a; },
};
// the unit's real job: the call, the loot, its XP and stars
async function jobAt(id, city, order) {
  const a = agentOf(id), st = starsOf(id); let out;
  try { out = await AGENT_JOBS[id](city, st, order); } catch (e) { out = emptyJob(city, a.src); console.warn(`[${id}] job failed`, e); }
  const L = out.loot; L.unit = id; L.city = city.name; L.xp = L.xp ?? 0;
  if (L.xp) G.unitXp.set(id, (G.unitXp.get(id) ?? 0) + L.xp);
  const after = starsOf(id); if (after > st) L.starUp = `${a.name} ${"★".repeat(st)} → ${"★".repeat(after)}`;
  // ★★★: the job also runs, free, in the nearest other city you hold
  if (st >= 3 && !L.empty && ["scout", "booker", "reader"].includes(id)) {
    const adj = nearest(G.cities.filter((c) => isHeld(c) && c !== city && !G.orderQueue.some((o) => o.unitId === id && o.city === c.name)), city);
    if (adj) { try { const x = await AGENT_JOBS[id](adj, st, order); if (x?.loot && !x.loot.empty) { L.extras = [{ ...x.loot, unit: id, city: adj.name, xp: 0, title: `${a.name} ★★★ also worked ${adj.name} (free)` }]; if (x.intel) G.intel.set(adj.name, [...(G.intel.get(adj.name) ?? []), x.intel]); if (x.loot.realMove) addRealMove(x.loot.realMove, a.name, adj.name); } } catch {} }
  }
  if (out.intel) G.intel.set(city.name, [...(G.intel.get(city.name) ?? []).filter((x) => x[0] !== out.intel[0]), out.intel]);
  if (L.realMove) addRealMove(L.realMove, a.name, city.name);
  ops(`<span class="ag">${a.icon} ${a.name}</span> @ ${esc(city.name)} → <span class="api">${esc(L.receipts.join(" · "))}</span> ${L.fact}`); keepReport(id, city, { line: L.fact });
  const u = G.army.get(id); if (u) u.lastLoot = L;
  G.runs++;
  return L;
}

// ---------------------------------------------------------------- the army on the map
// Units wait where they are until END WEEK; then they march (1.2 s each,
// staggered) inside the show, work, and stay stationed where they finished.
const YIELD = { sponsor: { gold: 12 }, showrunner: { gold: 8 }, scout: { gold: 3 }, booker: { gold: 4 }, reader: { gold: 3 }, oracle: { gold: 3 }, spy: { gold: 2 }, diplomat: { gold: 2 } };
const absH = () => (G.week - 1) * 168 + 12;
const agentOf = (id) => AGENTS.find((a) => a.id === id);
// stationed units in cities you hold pay every week (their old daily yield × 7)
const stationedGold = () => [...G.army.values()].filter((u) => u.state === "stationed" && isHeld(cityOf(u.at))).reduce((s, u) => s + (YIELD[u.id]?.gold ?? 0) * 7, 0);
function spawnUnit(id) {
  const cap = cityOf(G.capital) ?? G.cities[0]; if (!cap) return;
  const i = G.army.size, p = [cap.p[0] + Math.cos(i * 1.3) * 26, cap.p[1] + Math.sin(i * 1.3) * 18];
  G.army.set(id, { id, p, state: "idle", at: G.capital, order: null });
}
function slotNear(city, id) { const n = [...G.army.values()].filter((u) => u.at === city.name && u.id !== id).length; return [city.p[0] + Math.cos(n * 1.7 + 0.6) * 20, city.p[1] + Math.sin(n * 1.7 + 0.6) * 14 - 14]; }
function marchUnit(u, city, delay = 0) {
  Object.assign(u, { from: [...u.p], to: slotNear(city, u.id), toCity: city.name, t0: performance.now() + delay, ms: REDUCED ? 1 : 1200, state: "moving" });
}
function arrive(u, city) { u.p = [...(u.to ?? u.p)]; u.at = city.name; u.toCity = null; u.order = null; u.state = isHeld(city) ? "stationed" : "idle"; }
// your tour route in your colour, through the stops in tour order; booked stops get a gold number
function drawRoute(ctx, toS, d, now) {
  if (!G) return;
  const q = quest(), names = q.slots.map((s) => s.city).filter(Boolean); if (names.length < 2 && !names.some((n) => roomOf(n))) return;
  const P = names.map((n) => cityOf(n)).filter(Boolean).map((c) => toS(c.p));
  ctx.save(); ctx.strokeStyle = COL.you; ctx.globalAlpha = 0.8; ctx.lineWidth = 3 * d; ctx.lineJoin = "round"; ctx.shadowColor = COL.you; ctx.shadowBlur = 8 * d;
  ctx.beginPath(); P.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.stroke(); ctx.restore();
  q.slots.forEach((s, i) => { const c = s.city && s.on && cityOf(s.city); if (!c) return; const [X, Y] = toS(c.p); ctx.fillStyle = "#f0c46a"; ctx.beginPath(); ctx.arc(X + 16 * d, Y - 16 * d, 9 * d, 0, 6.283); ctx.fill(); ctx.fillStyle = "#0b0d14"; ctx.font = `800 ${11 * d}px "Inter Tight", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), X + 16 * d, Y - 15.5 * d); });
}
// uncharted ground says what to do about it
function fogLabel(ctx, toS, d) {
  const fog = G.cities.filter((c) => c.state === "uncharted"); if (fog.length < 3) return;
  const [X, Y] = toS([fog.reduce((s, c) => s + c.p[0], 0) / fog.length, fog.reduce((s, c) => s + c.p[1], 0) / fog.length]);
  ctx.save(); ctx.font = `600 ${11 * d}px "Inter Tight", sans-serif`; if ("letterSpacing" in ctx) ctx.letterSpacing = `${1.1 * d}px`; ctx.textAlign = "center"; ctx.fillStyle = "#9a9db3"; ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * d; ctx.fillText("UNCHARTED · SEND A SCOUT", X, Y + 34 * d); ctx.restore();
}
function drawArmy(ctx, toS, bez, at, d, s, now) {
  const sel = G.selected?.type === "unit" ? G.army.get(G.selected.id) : null;
  // the plan before END WEEK: dashed green march lines to every ordered city
  for (const o of G.orderQueue) {
    const to = cityOf(o.city); if (!to || o.unitId.startsWith("offer")) continue;
    const u = G.army.get(o.unitId), a0 = u ? toS(u.p) : toS(fromFor(to).p), b0 = toS(to.p);
    ctx.save(); ctx.strokeStyle = "#3dff9a"; ctx.globalAlpha = 0.85; ctx.setLineDash([6 * d, 6 * d]); ctx.lineDashOffset = -now / 40; ctx.lineWidth = 2 * d;
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(b0[0], b0[1]); ctx.stroke(); ctx.restore();
  }
  for (const u of G.army.values()) {
    const ui = unitOf(u.id), isSel = u === sel;
    if (u.state === "moving") {
      const k = clamp01((now - u.t0) / u.ms), a0 = toS(u.from), b0 = toS(u.to), c0 = bez(a0, b0);
      u._s = at(a0, c0, b0, ease(k));
      ctx.save(); ctx.strokeStyle = "#3dff9a"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], b0[0], b0[1]); ctx.stroke(); ctx.restore();
    } else u._s = toS(u.p);
    const [X, Y] = u._s, r = 13 * d;
    if (isSel) { ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 * d; ctx.setLineDash([5 * d, 4 * d]); ctx.lineDashOffset = now / 40; ctx.beginPath(); ctx.arc(X, Y, r + 6 * d, 0, 6.283); ctx.stroke(); ctx.restore(); }
    const col = AG_COL[u.id]?.[0] ?? "#af50ff";
    ctx.fillStyle = "#0b0d14"; ctx.strokeStyle = u.state === "ordered" || u.state === "moving" ? "#3dff9a" : col; ctx.lineWidth = 2 * d;
    ctx.beginPath(); ctx.roundRect(X - r, Y - r, 2 * r, 2 * r, 7 * d); ctx.fill(); ctx.stroke();
    drawIcon(ctx, ui?.ic ?? "star", X, Y, 15 * d, col, 2.2);
    if (isSel || u === G.hoverUnit || u.state === "moving") {
      const label = u.state === "moving" ? `${agentOf(u.id).name} → ${u.toCity}` : u === G.hoverUnit && !G.drag ? `${agentOf(u.id).name} · drag to a city` : agentOf(u.id).name;
      ctx.font = `600 ${11 * d}px "Inter Tight", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; const w = ctx.measureText(label).width + 12 * d, ty = Y + r + 12 * d;
      ctx.fillStyle = "rgba(11,13,20,.88)"; ctx.beginPath(); ctx.roundRect(X - w / 2, ty - 9 * d, w, 18 * d, 6 * d); ctx.fill();
      ctx.fillStyle = u.state === "moving" ? "#3dff9a" : "#fff"; ctx.fillText(label, X, ty);
    }
  }
}
// while dragging: a line from the unit to the pointer, the unit's ghost, and where it would go
function drawDrag(ctx, toS, d) {
  const dr = G.drag; if (!dr?.pt) return;
  const u = G.army.get(dr.id), from = u?._s ?? (dr.id === "you" ? toS(cityOf(G.capital)?.p ?? [0, 0]) : null), [X, Y] = dr.pt, to = G.hoverCity;
  if (from) { ctx.save(); ctx.strokeStyle = to ? "#3dff9a" : "rgba(255,255,255,.7)"; ctx.setLineDash([6 * d, 5 * d]); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(X, Y); ctx.stroke(); ctx.restore(); }
  if (to) { const [TX, TY] = toS(to.p); ctx.strokeStyle = "#3dff9a"; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(TX, TY, 22 * d, 0, 6.283); ctx.stroke(); }
  const r = 13 * d, col = AG_COL[dr.id]?.[0] ?? "#af50ff";
  ctx.fillStyle = "#0b0d14"; ctx.strokeStyle = "#3dff9a"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.roundRect(X - r, Y - r, 2 * r, 2 * r, 7 * d); ctx.fill(); ctx.stroke();
  drawIcon(ctx, unitOf(dr.id)?.ic ?? "flag", X, Y, 15 * d, col, 2.2);
  const label = to ? `SEND ${unitName(dr.id).toUpperCase()} → ${to.name.toUpperCase()}` : "DROP ON A CITY";
  ctx.font = `600 ${11 * d}px "Inter Tight", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; const w = ctx.measureText(label).width + 14 * d;
  ctx.fillStyle = "rgba(11,13,20,.9)"; ctx.beginPath(); ctx.roundRect(X - w / 2, Y - r - 26 * d, w, 18 * d, 6 * d); ctx.fill();
  ctx.fillStyle = to ? "#3dff9a" : "#fff"; ctx.fillText(label, X, Y - r - 17 * d);
}
function unitAt(sx, sy, d) { let best = null, bd = 18 * d; for (const u of G.army.values()) { if (!u._s) continue; const q = Math.hypot(u._s[0] - sx, u._s[1] - sy); if (q < bd) { bd = q; best = u; } } return best; }

// ---------------------------------------------------------------- selection
function select(sel) {
  if (sel?.type === "rival") { const f = G.fac.get(sel.id); G.selected = sel; renderRivalStrip(); if (f) rivalCard(f); return; }
  G.selected = sel; renderAgents(); renderRivalStrip();
}
// rival portraits down the right edge of the map, and the scoreboard (Full view)
function renderRivalStrip() {
  if (!G) return;
  $("#rivalstrip").innerHTML = [...G.fac.values()].map((f) => { const lv = threatLevel(f), on = G.selected?.type === "rival" && G.selected.id === f.id; return `<button class="rv${on ? " on" : ""}${lv === "HIGH" || lv === "SIEGE" ? " hi" : ""}" data-rv="${esc(f.id)}" style="--c:${f.allied ? COL.allied : f.col}" title="${esc(f.name)}: ${LV_LABEL[lv]}">${avatar(f.img, f.name, "fp")}<span class="lv ${lv}">${LV_LABEL[lv]}</span></button>`; }).join("");
  $$("[data-rv]").forEach((b) => b.addEventListener("click", () => { if (cardFor === b.dataset.rv) { $("#say .say-x")?.click(); return; } select({ type: "rival", id: b.dataset.rv }); }));
  const rows = [{ name: G.player.name, col: COL.you, age: levelOf(G.xp).roman, pct: G.conquest, sc: score() }]
    .concat([...G.fac.values()].map((f) => { const n = G.cities.filter((c) => c.owner === f.id && c.state === "rival").length, pct = Math.round((n / Math.max(1, ground())) * 100), fm = G.fame.get(f.name); return { name: f.name, col: f.allied ? COL.allied : f.col, age: ageOf(pct)[1], pct, sc: Math.round(pct * 100 + (fm?.views ?? 0) / 20) }; }))
    .sort((a, b) => b.sc - a.sc);
  $("#scoreboard").innerHTML = rows.map((r) => `<div style="color:${r.col}"><span>${esc(r.name)}</span><i>▶</i><b>${r.age}</b><em>${r.pct}%</em><u>${r.sc.toLocaleString()}</u></div>`).join("");
}
// the always-on legend: you, the nemesis, open ground, your route (Full view: every rival)
function renderLegend() {
  const el = $("#maplegend"); if (!el || !G) return;
  const full = !document.body.classList.contains("simple"), nem = nemesis();
  const facs = full ? [...G.fac.values()].filter((f) => !f.allied) : nem ? [nem] : [];
  el.innerHTML = `<span><i style="background:${COL.you}"></i>Yours</span>${facs.map((f) => `<span><i style="background:${f.col}"></i>${esc(f.name)}</span>`).join("")}<span><i style="background:${COL.open}"></i>Open</span><span><i class="rt"></i>Your tour route</span>`;
}
// your simulated fans talk back along the bottom of the map
function renderFanStrip() {
  const el = $("#fanstrip"); if (!el || !G) return;
  let fl = G.fanLine;
  if (!fl?.text && G.week > 1) { const qs2 = G.c?.aggregate?.quotes ?? [], q = qs2.find((x) => x.persona?.includes(G.capital)) ?? qs2[0]; if (q) fl = { city: G.capital, text: q.text.replace(/\s*\(\d\/5\)\s*$/, ""), rating: cityOf(G.capital)?.mean }; }
  if (!fl?.text) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = `<span class="dots"><i></i><i></i><i></i></span><span><strong>Fans in ${esc(fl.city)}</strong> (simulated from Qloo): “${esc(fl.text)}”${fl.rating != null ? ` · ${fl.rating} of 5` : ""}</span>`;
}
// the quest bar: what you're playing for, the rule, and one slot per stop (or sponsor, DM, part of the city)
let questHave = null;
function renderQuestBar() {
  const el = $("#quest"); if (!el || !G) return;
  const q = quest(), grew = questHave != null && q.have > questHave; questHave = q.have;
  el.innerHTML = `<span class="qb-top"><b>QUEST: ${esc(q.label)}</b><span>${q.have} of ${q.need} ${esc(q.unit)} · ${esc(q.rule)}</span></span><span class="qb-slots" style="--n:${q.slots.length}">${q.slots.map((s, i) => `<span class="qs${s.on ? " on" : s.held ? " held" : ""}${grew && s.on && i === q.slots.filter((x) => x.on).length - 1 ? " fill" : ""}"><b>${esc(s.label)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</span>`).join("")}</span>`;
  el.setAttribute("aria-label", `Quest: ${q.label}, ${q.have} of ${q.need} ${q.unit}. Open the missions.`);
}
// what each unit would bring back from this city (the city hover card)
function cityGets(ct) {
  if (!G || G.busy) return "";
  const rows = UNITS.filter((u) => unitReady(u.id)).map((u) => [u, chipsFor(u.id, true).find((c) => c.city === ct.name)]).filter(([, c]) => c).slice(0, 3);
  return rows.length ? `<div class="ptitle" style="padding:8px 0 2px">What you'd get here</div>${rows.map(([u, c]) => `<p style="margin:2px 0"><b>${esc(unitName(u.id))}</b>: ${esc(c.get)}</p>`).join("")}` : "";
}

// ---------------------------------------------------------------- real-world moves
// Every loot card creates one real thing to do this week. Tick it when it's done for real.
function addRealMove(mv, src, city) {
  if (!mv?.title || G.real.some((m) => m.text === mv.title && !m.done)) return;
  G.real.push({ id: "m" + Date.now().toString(36) + G.real.length, text: mv.title, detail: mv.detail ?? "", src, city, week: G.week, done: false });
  hudReal();
}
function hudReal() { const done = G.real.filter((m) => m.done).length; $("#real-n").textContent = G.real.length ? `${done}/${G.real.length}` : ""; }
function markReal(id) {
  const m = G.real.find((x) => x.id === id); if (!m || m.done) return;
  m.done = true; G.realDone++; G.realTicks = (G.realTicks ?? 0) + 1; G.achPts += 200;
  Sound.play("victory"); toast(G.realTicks <= 2 ? "Done for real. +200 XP lands at END WEEK." : "Done for real. (Two a week count for XP; this one still counts for the win.)"); ach("real");
  hud(); hudReal(); Drawer.render();
}
// calendar file for the show nights the game found
function icsFile() {
  const pad = (n) => String(n).padStart(2, "0"), stamp = (dt) => `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
  const fri = () => { const t = new Date(); t.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7 || 7)); t.setHours(20, 0, 0, 0); return t; };
  const items = [...G.nights.map((n) => ({ when: new Date(n.date + "T20:00:00"), what: `Show night in ${n.city}`, note: n.why })), ...G.real.filter((m) => m.city).map((m) => ({ when: fri(), what: `Conquest: ${m.city}`, note: m.text }))];
  const ev = items.map((x, i) => ["BEGIN:VEVENT", `UID:conquest-${Date.now()}-${i}@conquest.agent`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(x.when)}`, `DTEND:${stamp(new Date(x.when.getTime() + 2 * 3600e3))}`, `SUMMARY:${x.what.replace(/[,;]/g, " ")}`, `DESCRIPTION:${(x.note ?? "").replace(/[,;\n]/g, " ")}`, "END:VEVENT"].join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Conquest//EN", ...ev, "END:VCALENDAR"].join("\r\n");
}
function downloadIcs() {
  if (!G.nights.length && !G.real.some((m) => m.city)) return toast("Nothing to schedule yet: send the Booker or the Weather oracle to a city.");
  const url = URL.createObjectURL(new Blob([icsFile()], { type: "text/calendar" })), a = document.createElement("a");
  a.href = url; a.download = "conquest-show-nights.ics"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- starting a new campaign (your powers, the other players)
function askMonday() {
  if (!G || G.tour || G.mailAsked) return; G.mailAsked = true;
  const box = $("#intro-body"); G.modal = true;
  box.innerHTML = `<div class="br wb"><div class="br-k">MONDAY WAR REPORT</div><h2 class="mr-h">Get your 3 moves every Monday?</h2><p class="mr-p">One short email at 8 am your time: what changed on your map, your three moves with links, and your tour. Unsubscribe any time.</p>
    <form id="mr-form" class="mr-f"><input id="mr-name" value="${esc(G.player.name.split(" ")[0])}" placeholder="First name" aria-label="First name"><input id="mr-email" type="email" required placeholder="you@email.com" aria-label="Email"><button class="go" type="submit">Yes, send it</button></form>
    <button class="ghostbtn" id="mr-no">Not now</button><p class="note">Time zone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p></div>`;
  $("#intro").hidden = false;
  const done = () => { $("#intro").hidden = true; G.modal = false; saveGame(); };
  $("#mr-no").onclick = done;
  $("#mr-form").onsubmit = async (e) => { e.preventDefault(); syncCampaign(); await new Promise((r) => setTimeout(r, 1400)); const r = await post("/api/mail/subscribe", { campaignId: G.cid, email: $("#mr-email").value.trim(), firstName: $("#mr-name").value.trim(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, 15000); toast(r?.ok ? "Done: your first war report lands Monday at 8 am." : "Couldn't save that email."); done(); };
}
// event answers that land next week: during the show they wait for the turn; after it, they apply now
function nextWeekOrder() { if (G.busy) G.bonusNext++; else { G.ordersLeft++; hud(); renderAgents(); } }
function wallsNext(city) { if (G.busy) G.wallsNext = city; else { G.forts.add(city); hud(); } }
function surge(fid) { G.surge = fid; if (!G.busy) applySurge(); }
// a rival whose fame spiked hits a second city
function applySurge() {
  const f = G.fac.get(G.surge); G.surge = null; if (!f || f.allied) return;
  const prey = G.cities.filter((c) => sideOf(c) === "you" && !G.intents.some((i) => i.city === c.name) && !G.sieges.some((s) => s.city === c.name)).sort((a, b) => b.you - a.you)[0]; if (!prey) return;
  const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
  G.intents.push({ fid: f.id, city: prey.name, from: nearest(theirs, prey)?.p ?? [prey.p[0] + 200, Math.max(20, prey.p[1] - 160)] });
}
// the rival draft: pick who you fight. A bigger name than the default is harder and worth more.
function pickNemesis(id, def) {
  const f = G.fac.get(id), prev = nemesis(); if (!f) return;
  if (prev && prev !== f) [f.col, prev.col] = [prev.col, f.col]; // the nemesis is always the red one
  for (const x of G.fac.values()) if (x !== f && x.strategy === "compete" && x.plan.strategy !== "compete") x.strategy = x.plan.strategy;
  f.strategy = "compete"; G.nemId = f.id;
  const size = (x) => (G.fame.get(x?.name)?.views ?? 0) + (x?.plan?.holds?.length ?? 0) * 1e6;
  G.giant = !!def && f !== def && size(f) > size(def);
  planIntents(); MapView.relayer();
}
// ---------------------------------------------------------------- screen 0: pick your objective
// Before week 1: what do you want in 8 weeks? It becomes the quest bar, the
// missions and the win screen. The missions sheet brings you back here later.
function intro(change = false) {
  return new Promise((resolve) => {
    const nem = nemesis(), fans = G.cities.reduce((s, c) => s + (c.you || 0), 0), box = $("#intro-body");
    let sel = G.objective ?? "tour", city = G.objCity;
    const picks = G.cities.filter((c) => !isHeld(c) && c.state !== "uncharted").sort((a, b) => b.you - a.you).slice(0, 5);
    let draft = false; const def = nem;
    const foeLine = () => { const n = nemesis(); if (!n) return "No rival is fighting you for these fans yet."; const ov = n.plan?.overlap ?? 0, ovp = ov > 1 ? Math.round(ov) : Math.round(ov * 100); return `${n.name} shares ${ovp}% of your fans${n.plan.holds?.length ? ` and holds ${n.plan.holds.slice(0, 2).join(" and ")}` : ""}. ${lastName(n.name)} will come for your cities${G.giant ? " two weeks out of three" : ""}.`; };
    const draw = () => {
      const o = objectiveOf(sel), ms = buildMissions(sel, { ...missionCtx(), objCity: city });
      box.innerHTML = `<div class="obj-h"><div class="k">${esc(G.player.name)} · ${fans.toLocaleString()} fans found in ${G.cities.length} US cities (Qloo) · ${change ? `week ${G.week} of ${WEEKS}` : "before week 1"}</div>
        <h1>What do you want in ${change ? `the next ${Math.max(1, WEEKS - G.week + 1)} weeks` : "8 weeks"}?</h1><p>Pick one. It becomes your quest on screen the whole game, your army gets missions for it, and the win screen hands you the real thing.</p></div>
        <div class="obj-cards">${OBJECTIVES.map((x) => `<button class="ocard${x.id === sel ? " on" : ""}" data-obj="${x.id}" style="--oc:${x.col}" aria-pressed="${x.id === sel}"><span class="t">${x.tag}</span><span class="n">${esc(x.title)}</span><span class="b">${esc(x.blurb)}</span><span class="g">You get: ${esc(x.get)}</span></button>`).join("")}</div>
        ${sel === "city" ? `<div class="obj-pick"><span>Which city? The biggest you don't hold yet:</span>${picks.map((c) => `<button class="chip2${c.name === city ? " on" : ""}" data-oc="${esc(c.name)}">${esc(c.name)} · ${kfmt(c.you)} fans</button>`).join("")}</div>` : ""}
        <section class="obj-mis" aria-label="Your missions"><div><div class="hd"><h2>YOUR MISSIONS · ${esc(o.title.toUpperCase())}</h2><span>one per 2 weeks, each unlocks the next</span></div>
          ${ms.map((m) => `<div class="mrow"><span class="wk">${m.wk.join("–")}</span><span><strong>${esc(m.title)}</strong><small>${esc(m.how)}</small><em>Done when: ${esc(m.done)}</em></span></div>`).join("")}</div>
          <div><h2>YOUR ARMY FOR THIS</h2><div class="tx">${esc(o.army({ nem: nemesis()?.name }))}</div><h2>HOW YOU WIN</h2><div class="tx">${esc(o.win)}</div><h2 class="foe">WHO'S IN YOUR WAY</h2><div class="tx">${esc(foeLine())}</div>
          ${!change && G.fac.size > 1 ? `<button class="lnk3" id="nem-open" aria-expanded="${draft}">${draft ? "Keep it as it is" : "Change nemesis"}</button>${draft ? `<div class="draft">${[...G.fac.values()].map((f) => { const ov = f.plan.overlap ?? 0, fm = G.fame.get(f.name); return `<button class="chip2${f === nemesis() ? " on" : ""}" data-nem="${esc(f.id)}">${esc(f.name)} · ${ov > 1 ? Math.round(ov) : Math.round(ov * 100)}% shared · ${fm?.views ? kfmt(fm.views) + " views/30d · " : ""}${f.plan.holds?.length ?? 0} cit${(f.plan.holds?.length ?? 0) === 1 ? "y" : "ies"}</button>`; }).join("")}<small>A bigger name attacks 2 weeks out of 3, but beating them in their cities is worth +50% XP: giant slayer.</small></div>` : ""}` : ""}</div></section>
        <div class="obj-f"><span>Change your objective any time from the quest bar. Your progress carries over.</span><button class="bigcta" id="intro-go" ${sel === "city" && !city ? "disabled title=\"Pick a city first\"" : ""}>${change ? "KEEP PLAYING" : "START WEEK 1"}</button></div>`;
      $$("[data-obj]").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.obj; if (sel === "city" && !city) city = picks[0]?.name ?? null; Sound.play("select"); draw(); }));
      $$("[data-oc]").forEach((b) => b.addEventListener("click", () => { city = b.dataset.oc; Sound.play("select"); draw(); }));
      $("#nem-open")?.addEventListener("click", () => { draft = !draft; draw(); });
      $$("[data-nem]").forEach((b) => b.addEventListener("click", () => { pickNemesis(b.dataset.nem, def); Sound.play("threat"); draw(); }));
      $("#intro-go").onclick = () => {
        setObjective(sel, city); box.classList.remove("obj"); $("#intro").hidden = true; G.modal = false; Sound.play("ageup");
        ops(`<span class="ok">objective</span> ${esc(objectiveOf(sel).title)}${G.objCity ? ` · ${esc(G.objCity)}` : ""}`);
        hud(); renderAgents(); MapView.relayer(); saveGame(); resolve();
      };
    };
    box.classList.add("obj"); draw(); $("#intro").hidden = false; G.modal = true;
  });
}

// the city a rival would move on next: your city where they're relatively strongest
function preyOf(f) {
  const mine = G.cities.filter((c) => sideOf(c) === "you" && !G.sieges.some((s) => s.city === c.name));
  const rel = (c) => (c.rivals.find((r) => r.id === f.id)?.count ?? 0) / Math.max(1, c.you);
  return mine.filter((c) => c.contested === f.name || rel(c) > 0.5).sort((a, b) => rel(b) - rel(a))[0];
}
// at the start of each week, rivals decide who they'll attack, and the radar shows it
// ---------------------------------------------------------------- rivals talk
// RPG-style dialog: a rival's portrait, name plate and a typed-out line, next
// to their face on the rival strip. Lines come from what they're really doing
// this week (intents, sieges, battles, fame momentum from Wikipedia).
const anyOf = (a) => a[Math.floor(Math.random() * a.length)];
function rivalLine(f, kind, x = {}) {
  const me = G.player.name.split(" ")[0], mo = G.fame.get(f.name)?.momentum, city = x.city ?? "";
  const it = G.intents.find((i) => i.fid === f.id), sg = G.sieges.find((i) => i.fid === f.id);
  const L = {
    intent: [`Your ${city} crowd? They're mine by Sunday.`, `See you in ${city}, ${me}. Bring better material.`, `${city} laughs at my stuff now. Sunday it's official.`],
    siege: [`${city} is falling. ${x.left ?? 2} weeks and it's mine.`, `Hear that? That's ${city} switching sides.`],
    bounced: [`Walls in ${city}? Cute. I'll be back.`, `Fine, ${city} held. This time.`],
    beaten: [`Okay, ${city} is yours. For now.`, `Lucky crowd. Rematch soon, ${me}.`],
    won: [`${city} chose me. Better luck next set.`, `Told you. ${city} is my room.`],
    ally: [`Same taste, different stage. Co-bill${f.plan?.city ? ` in ${f.plan.city}` : ""}?`, `Your fans would love my crowd, ${me}. Let's talk.`],
    allied: [`Partner! I'll warm up ${f.plan?.city ?? "the room"} for you.`, `Together we own this map.`],
    hot: [`My Wikipedia's up ${Math.abs(mo ?? 0)}% this month. Keep up.`, `Everyone's searching my name this month. Just saying.`],
    cold: [`Slow month for me. Don't get comfortable.`, `Quiet week. I'm writing.`],
    calm: [`Nice map, ${me}. Shame if someone took it.`, `Watching your ground. Always watching.`],
    retreat: [`Fine. Keep your ${(G.player.aud?.tags ?? []).find((t) => t.length < 18 && !/protagonist|fiction|animated/i.test(t)) ?? "home"} crowd. I'm bringing ${x.next ?? "a bigger set"} next time.`],
  };
  let k = kind;
  if (k === "ambient") k = f.allied ? "allied" : sg ? "siege" : it ? "intent" : f.strategy === "ally" ? "ally" : mo > 10 ? "hot" : mo < 0 ? "cold" : "calm";
  if (k === "siege" && !x.city && sg) { x.city = sg.city; x.left = sg.left; return rivalLine(f, "siege", x); }
  if (k === "intent" && !x.city && it) return rivalLine(f, "intent", { city: it.city });
  return anyOf(L[k] ?? L.calm);
}
const ROLE = (f) => f.role ? f.role : f.allied ? "Ally" : f.strategy === "compete" ? "Nemesis" : f.strategy === "ally" ? "Wants to team up" : "Rival";
// one plain line: what this rival is doing to you right now
function threatLine(f) {
  const it = G.intents.find((x) => x.fid === f.id), sg = G.sieges.find((x) => x.fid === f.id);
  if (sg) return `Besieging your ${sg.city}: defend it or lose it and its tour stop.`;
  if (it) return G.forts.has(it.city) ? `Marching on ${it.city}, but your walls are up: the attack will bounce.` : `Hits ${it.city} at END WEEK unless you build walls there (80 gold).`;
  return "Watching your ground. Strike first, or send the Diplomat to make peace.";
}
let sayQ = [], sayOn = false, sayT = 0, sayLast = 0, cardFor = null;
function say(f, text) { if (!G || !f || !text) return; if (sayQ.length > 2) sayQ.shift(); sayQ.push({ f, text }); if (!sayOn) sayNext(); }
function sayNext() {
  if (cardFor) return; // an open rival card owns the box; chatter waits
  const box = $("#say"); const n = sayQ.shift(); if (!n || !box) { sayOn = false; if (box) box.hidden = true; return; }
  sayOn = true; sayLast = performance.now();
  const { f, text } = n, col = f.col ?? (f.allied ? COL.allied : "#af50ff");
  box.style.setProperty("--c", col);
  box.classList.remove("card");
  box.innerHTML = `<div class="sp">${f.emoji ? `<div class="ph emo" style="font-size:40px">${f.emoji}</div>` : avatar(f.img, f.name)}</div><div><div class="sn"><b>${esc(f.name)}</b><small>${ROLE(f)}</small></div><p class="st"></p>${f.allied || f.role ? "" : f.strategy === "ally" ? `<p class="say-what">Team up → they stop attacking you, fight at your side, and you get a co-bill DM.</p><button class="say-more" data-team="${esc(f.id)}">🕊 Team up · 1 Diplomat order</button>` : `<p class="say-what">${esc(threatLine(f))}</p><button class="say-more" data-card="${esc(f.id)}">Respond: defend / strike / talk ›</button>`}</div>`;
  box.querySelector("[data-card]")?.addEventListener("click", (e) => { e.stopPropagation(); rivalCard(f); });
  box.querySelector("[data-team]")?.addEventListener("click", (e) => { e.stopPropagation(); parleyOrder(f.id); toast(`Diplomat ordered to ${f.name}. It happens at END WEEK.`); clearInterval(sayT); clearTimeout(sayT); sayNext(); });
  const btn = $(`[data-rv="${f.id}"]`), mw = $("#mapwrap");
  if (btn && mw) { const r = btn.getBoundingClientRect(), m = mw.getBoundingClientRect(); box.style.top = Math.max(14, r.top - m.top - 8) + "px"; box.style.setProperty("--ty", "26px"); }
  box.hidden = false; box.classList.add("typing"); Sound.play("select");
  const st = box.querySelector(".st"); let i = 0; clearInterval(sayT);
  sayT = setInterval(() => { i += 2; st.textContent = text.slice(0, i); if (i % 12 === 0) Sound.play("tick"); if (i >= text.length) { clearInterval(sayT); box.classList.remove("typing"); sayT = setTimeout(sayNext, 2600 + text.length * 35); } }, 28);
}
$("#say")?.addEventListener("click", (e) => { if (cardFor || e.target.closest("button")) return; clearInterval(sayT); clearTimeout(sayT); sayNext(); });
// The rival card: who they are, what they're doing this week, what happens if
// you do nothing, and your three answers. Opens from their face or the radar.
function placeSay(box, f) {
  const btn = $(`[data-rv="${f.id}"]`), mw = $("#mapwrap");
  if (btn && mw) { const r = btn.getBoundingClientRect(), m = mw.getBoundingClientRect(); box.style.top = Math.max(14, Math.min(m.height - box.offsetHeight - 14, r.top - m.top - 8)) + "px"; }
}
// your simulated fans speak too: real lines from the 1,000-fan panel, by city
function rivalCard(f) {
  const box = $("#say"); if (!box || !G || !f) return;
  clearInterval(sayT); clearTimeout(sayT); sayQ = []; cardFor = f.id; sayOn = true;
  const lv = threatLevel(f), it = G.intents.find((x) => x.fid === f.id), sg = G.sieges.find((x) => x.fid === f.id), fm = G.fame.get(f.name), sc = strikeCity(f);
  const held = G.cities.filter((c) => c.owner === f.id && c.state === "rival").map((c) => c.name), cityOf = (n) => G.cities.find((c) => c.name === n);
  const now = f.allied ? "Allied: fights at your side." : sg ? `Besieging your ${sg.city}: falls in ${sg.left} week${sg.left > 1 ? "s" : ""}.` : it ? `Marching on ${it.city}${G.forts.has(it.city) ? ", but your walls are up" : ": hits at END WEEK"}.` : "No attack planned this week.";
  const risk = sg ? `You lose ${sg.city} and its tour stop.` : it && !G.forts.has(it.city) ? `A 2-week siege starts on ${it.city}.` : "Nothing, for now.";
  const team = f.strategy === "ally" && !f.allied;
  const di = sg ? 1 : -1;
  box.style.setProperty("--c", f.allied ? COL.allied : f.col); box.classList.add("card");
  box.innerHTML = `<div class="sp">${avatar(f.img, f.name)}</div><div style="min-width:0">
    <div class="sn"><b>${esc(f.name)}</b><small>${ROLE(f)}</small><small class="lvx ${lv}">${LV_LABEL[lv]}</small><button class="say-x" title="Close">✕</button></div>
    <p class="st"></p>
    <div class="say-chips">${fm?.views ? `<span>${kfmt(fm.views)} views/30d ${fm.momentum >= 0 ? "▲" : "▼"}${Math.abs(fm.momentum)}%</span>` : ""}<span>${held.length ? "holds " + esc(held.slice(0, 2).join(", ")) : "no cities yet"}</span></div>
    <dl class="say-dl"><dt>This week</dt><dd>${esc(now)}</dd><dt>If you wait</dt><dd class="${sg ? "bad" : it && !G.forts.has(it.city) ? "warn" : ""}">${esc(risk)}</dd><dt>You get</dt><dd>${team ? "Team up: they stop attacking, fight at your side, and you get a co-bill DM." : [sg && "Defend keeps the city", it && !G.forts.has(it.city) && "Walls bounce the attack", sc && "Strike takes their nearest city", "Diplomat turns them into an ally"].filter(Boolean).join(" · ")}</dd></dl>
    ${f.allied ? "" : `<div class="say-act">${di >= 0 ? `<button class="go" data-sa="def">🛡 Defend · 1 order</button>` : ""}${it && !G.forts.has(it.city) ? `<button class="ghostbtn" data-sa="fort" ${G.gold >= 80 ? "" : "disabled"}>🛡 Walls · 80 gold</button>` : ""}<button class="${di >= 0 ? "ghostbtn" : "go"}" data-sa="strike" ${sc ? "" : "disabled"} title="${sc ? "Strike first in " + esc(sc.name) : "They hold no city to hit yet"}">⚔ Strike · 1 order</button><button class="${team && di < 0 ? "go" : "ghostbtn"}" data-sa="parley">🕊 ${team ? "Team up" : "Diplomat"} · 1 order</button></div>`}
  </div>`;
  box.hidden = false; placeSay(box, f); Sound.play("select");
  const close = () => { cardFor = null; sayOn = false; box.hidden = true; box.classList.remove("card"); if (G.selected?.type === "rival") { G.selected = null; renderRivalStrip(); } sayNext(); };
  box.querySelector(".say-x").onclick = (e) => { e.stopPropagation(); close(); };
  box.querySelector('[data-sa="def"]')?.addEventListener("click", () => { close(); defendOrder(sg.city); });
  box.querySelector('[data-sa="fort"]')?.addEventListener("click", () => { fortify(it.city); rivalCard(f); });
  box.querySelector('[data-sa="strike"]')?.addEventListener("click", () => { close(); strike(f.id); });
  box.querySelector('[data-sa="parley"]')?.addEventListener("click", () => { close(); parleyOrder(f.id); });
  const st = box.querySelector(".st"), text = rivalLine(f, "ambient"); let i = 0; box.classList.add("typing");
  sayT = setInterval(() => { i += 2; st.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(sayT); box.classList.remove("typing"); } }, 26);
}
// now and then, someone pipes up on their own
function sayTick(now) {
  if (!G || G.over || G.modal || sayOn || cardFor || now - sayLast < 75000 || !G.fac.size) return;
  const f = anyOf([...G.fac.values()]); say(f, rivalLine(f, "ambient"));
}
function planIntents() {
  planIntentsRaw();
  G.intents.sort((a, b) => (G.fac.get(a.fid)?.strategy === "compete" ? 0 : 1) - (G.fac.get(b.fid)?.strategy === "compete" ? 0 : 1));
  G.intents = G.intents.slice(0, 2);
  if (G.surge) applySurge();
  for (const it of G.intents) ops(`<span class="rv">📡 radar: ${esc(G.fac.get(it.fid)?.name)}</span> is massing toward <b>${esc(it.city)}</b> · hits at END WEEK`);
  const loud = G.intents[0] && G.fac.get(G.intents[0].fid), at = G.intents[0]?.city; if (loud && G.week > 1) setTimeout(() => say(loud, rivalLine(loud, "intent", { city: at })), 1800);
}
function planIntentsRaw() {
  G.intents = [];
  for (const f of G.fac.values()) {
    if (f.allied) continue;
    const prey = preyOf(f); if (!prey) continue;
    const mo = G.fame.get(f.name)?.momentum ?? 0, giant = G.giant && f === nemesis();
    const aggr = giant ? (G.week % 3 !== 0 ? 1 : 0) : (f.strategy === "compete" ? 0.75 : 0.25) + (mo > 10 ? 0.15 : 0) + (G.week > 1 ? 0.1 : -0.2);
    if (G.rng() >= aggr) continue;
    const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
    const from = nearest(theirs, prey)?.p ?? [Math.max(20, Math.min(MW - 20, prey.p[0] + (prey.p[0] > MW / 2 ? 260 : -260))), Math.max(20, prey.p[1] - 180)];
    G.intents.push({ fid: f.id, city: prey.name, from });
  }
}


// ---------------------------------------------------------------- the campaign remembers you
// Your campaign saves itself in this browser. Come back and the welcome screen
// asks about the real missions you committed to; ticking them pays out, a real
// week away lets the rivals move, and unfinished missions follow you into a
// new campaign.
const SAVE_KEY = (name) => "conquest:v1:" + String(name).toLowerCase();
let TOURING = false;
function snapshot() {
  return {
    v: 2, cid: G.cid, mailAsked: !!G.mailAsked, tourPlan: G.tourPlan ?? null, name: G.player.name, ts: Date.now(), over: G.over, week: G.week,
    conquest: G.conquest, start: G.start, startHeld: G.startHeld, gold: G.gold, morale: G.morale,
    allies: G.allies, taken: G.taken, saved: G.saved, lost: G.lost, runs: G.runs, achPts: G.achPts, realDone: G.realDone,
    cities: G.cities.map((c) => [c.name, c.state, c.owner, c.contested]),
    fac: [...G.fac.values()].map((f) => [f.id, f.allied, f.last]),
    orders: G.orders, doneLog: G.doneLog, crew: [...G.crew], sponsors: G.sponsors, intel: [...G.intel], prep: [...G.prep], forts: [...G.forts],
    reports: G.reports ?? {}, intents: G.intents, sieges: G.sieges, used: G.potions.filter((p) => p.used).map((p) => p.title), nights: G.nights, drafts: G.drafts, pitches: G.pitches,
    real: G.real, ach: [...G.ach], parleyed: [...G.parleyed],
    army: [...G.army.values()].map((u) => (u.state === "moving" ? { id: u.id, p: u.to, at: u.toCity, state: "stationed" } : { id: u.id, p: u.p, at: u.at, state: u.state === "working" ? "stationed" : u.state, order: u.order ?? null })),
    objective: G.objective, objCity: G.objCity, missions: (G.missions ?? []).map((m) => ({ id: m.id, complete: !!m.complete })), ordersLeft: G.ordersLeft, orderQueue: G.orderQueue,
    xp: G.xp, unitXp: [...G.unitXp], nemId: G.nemId ?? null, giant: !!G.giant, wallsNext: G.wallsNext ?? null, surge: G.surge ?? null, report: G.report, headline: G.headline, venues: G.venues,
    dms: G.dms, guestSpots: G.guestSpots, posts: [...G.posts], scouted: [...G.scouted], proven: !!G.proven, sponsorPitches: G.sponsorPitches, venueMails: G.venueMails,
    offers: G.offers, offersNext: G.offersNext, offersSeen: G.offersSeen ?? [], bonusNext: G.bonusNext, realTicks: G.realTicks ?? 0, fanLine: G.fanLine ?? null, readBonus: [...G.readBonus],
  };
}
function saveGame() { if (!G || G.tour || G.noSave) return; try { localStorage.setItem(SAVE_KEY(G.player.name), JSON.stringify(snapshot())); } catch {} syncCampaign(); }
// the server keeps a copy of the board, so City Briefs, Tour Plans and the Monday email work off it
let syncT = 0;
function syncCampaign() {
  if (!G?.cid || G.tour || G.noSave) return; clearTimeout(syncT);
  syncT = setTimeout(() => {
    const snap = { name: G.player.name, q: G.player.q, capital: G.capital, week: G.week, conquest: G.conquest, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, tags: (G.player.aud?.tags ?? []).slice(0, 8),
      cities: G.cities.map((c) => ({ name: c.name, side: sideOf(c), owner: c.owner && c.owner !== "you" ? (G.fac.get(c.owner)?.name ?? null) : null })),
      intents: G.intents, sieges: G.sieges, rivals: [...G.fac.values()].map((f) => ({ id: f.id, name: f.name })),
      orders: G.orders.map((o) => ({ id: String(o.id), title: o.title, city: o.city ?? null, cost: costOf(o), gain: gainOf(o), done: !!o.done })),
      objective: G.objective, objCity: G.objCity, xp: G.xp, level: levelOf(G.xp).name, headline: G.headline, report: G.report, quest: (({ label, have, need, unit }) => ({ label, have, need, unit }))(quest()),
      real: G.real.map((m) => ({ text: m.text, city: m.city ?? null, done: !!m.done })) };
    fetch("/api/campaign/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: G.cid, snap }) }).catch(() => {});
  }, 1200);
}
// v1 saves (the clock game) come back as v2: objective "tour", XP from conquest, a fresh week of orders
function loadSave(name) { try { return migrateSave(JSON.parse(localStorage.getItem(SAVE_KEY(name)) || "null")); } catch { return null; } }
function restore(s) {
  s = migrateSave(s);
  for (const [name, state, owner, contested] of s.cities) { const c = cityOf(name); if (c) Object.assign(c, { state, owner, contested }); }
  for (const [id, allied, last] of s.fac) { const f = G.fac.get(id); if (f) Object.assign(f, { allied, last }); }
  if (s.cid) G.cid = s.cid;
  G.mailAsked = !!s.mailAsked; G.tourPlan = s.tourPlan ?? null;
  Object.assign(G, { week: s.week, hour: 60, conquest: s.conquest, start: s.start, startHeld: s.startHeld, gold: s.gold, morale: s.morale, allies: s.allies, taken: s.taken, saved: s.saved, lost: s.lost, runs: s.runs ?? 0, achPts: s.achPts, realDone: s.realDone,
    orders: s.orders, doneLog: s.doneLog ?? [], crew: new Map(s.crew.map(([k, v]) => [k, { ...v, busy: false }])), sponsors: s.sponsors, intel: new Map(s.intel), prep: new Set(s.prep), forts: new Set(s.forts),
    reports: s.reports ?? {}, intents: s.intents, sieges: s.sieges, nights: s.nights, drafts: s.drafts, pitches: s.pitches, real: s.real, ach: new Set(s.ach), parleyed: new Set(s.parleyed), usedTrends: new Set(s.used),
    xp: s.xp ?? 0, unitXp: new Map(s.unitXp ?? []), ordersLeft: s.ordersLeft ?? 3, orderQueue: (s.orderQueue ?? []).filter((o) => o.unitId === "you" || o.unitId.startsWith("offer") || s.crew.some(([k]) => k === o.unitId)),
    report: s.report ?? null, headline: s.headline ?? "", venues: s.venues ?? [], dms: s.dms ?? [], guestSpots: s.guestSpots ?? [], posts: new Set(s.posts ?? []), scouted: new Set(s.scouted ?? []), proven: !!s.proven,
    sponsorPitches: s.sponsorPitches ?? [], venueMails: s.venueMails ?? [], offers: s.offers ?? [], offersNext: s.offersNext ?? [], offersSeen: s.offersSeen ?? [], bonusNext: s.bonusNext ?? 0, realTicks: s.realTicks ?? 0, fanLine: s.fanLine ?? null, readBonus: new Map(s.readBonus ?? []) });
  G.army = new Map(s.army.map((u) => [u.id, { ...u }]));
  for (const id of BASE6) if (!G.crew.get(id)?.recruited) { G.crew.set(id, { recruited: true, week: 0, busy: false }); if (!G.army.has(id)) spawnUnit(id); }
  for (const u of G.army.values()) if (u.state === "ordered" && !G.orderQueue.some((o) => o.unitId === u.id)) u.state = "idle";
  G.objective = s.objective ?? "tour"; G.objCity = s.objCity ?? null;
  Object.assign(G, { nemId: s.nemId ?? null, giant: !!s.giant, wallsNext: s.wallsNext ?? null, surge: s.surge ?? null }); if (G.nemId && G.fac.get(G.nemId)) G.fac.get(G.nemId).strategy = "compete";
  setObjective(G.objective, G.objCity);
  const done = new Set((s.missions ?? []).filter((m) => m.complete).map((m) => m.id)); for (const m of G.missions) if (done.has(m.id)) m.complete = true;
  assignStates(); G.layer = null;
}
// the welcome-back screen: what you committed to, and whether you did it
function welcomeBack(s) {
  return new Promise((resolve) => {
    const days = (Date.now() - s.ts) / 864e5, open = s.real.filter((m) => !m.done), ticked = new Set();
    const away = days < 1 / 24 ? "moments ago" : days < 1 ? `${Math.round(days * 24)} hours ago` : `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} ago`;
    const box = $("#intro-body"); G.modal = true;
    const LV = levelOf(s.xp ?? 0), an = LV.roman, aname = LV.name, goal = [LV.next?.at ?? LV.at, LV.next?.roman ?? LV.roman, LV.next?.name ?? LV.name];
    const held = (s.cities ?? []).filter(([, st]) => st === "stronghold" || st === "frontline").length, agents = (s.crew ?? []).filter(([, c]) => c?.recruited).length;
    const stat = (e, v, k) => `<div class="wb-stat"><span class="emo">${e}</span><b>${v}</b><small>${k}</small></div>`;
    const bonus = days >= 0.5 ? "+1 order this week for coming back" : "Come back tomorrow: +1 order";
    box.innerHTML = `<div class="br wb">
      <div class="br-k">${s.over ? "CAMPAIGN COMPLETE" : "CAMPAIGN SAVED"} · WEEK ${Math.min(s.week, WEEKS)} OF ${WEEKS} · LAST PLAYED ${away.toUpperCase()}</div>
      <div class="wb-hero">${avatar(G.player.image, G.player.name)}<div><small>Welcome back, Commander</small><b>${esc(G.player.name)}</b><span>Age ${an} · ${esc(aname)}${s.over ? ` · finished with ${s.xp ?? 0} XP` : ""}</span></div></div>
      <div class="br-goal"><div><small>${s.over ? "Campaign" : `Quest: ${esc(objectiveOf(s.objective).title)}`}</small><b>${s.over ? (s.headline ? esc(s.headline) : "Finished") : LV.next ? `${LV.toNext} XP to Lv ${LV.next.roman} · ${esc(LV.next.name)}` : "Max level"}</b></div><div class="xpbar"><i style="width:${Math.round(LV.frac * 100)}%"></i></div><span>Lv ${an} · ${s.xp ?? 0} XP</span></div>
      <div class="wb-stats">${stat("🏙️", held, "cities held")}${stat("⭐", s.xp ?? 0, "XP")}${stat("🪙", s.gold, "gold")}${stat("🤖", agents, "agents")}${stat("🏆", s.realDone ?? 0, "real moves")}</div>
      <div class="wb-rep"><div class="wb-k">📰 Your war report <span>week ${s.week} · live from Qloo, Google Trends and your map</span></div>
        <div class="wb-cols"><div class="wb-col"><h4>What changed</h4><ul id="wb-changes"><li class="none wb-load">Reading the map…</li></ul></div>
        <div class="wb-col"><h4>Your 3 moves</h4><div id="wb-moves" style="display:grid;gap:6px"><span class="wb-load">Asking your strategist…</span></div></div></div>
        <div class="wb-chips"><span class="wb-chip">${s.over ? "🏁 Finished: start a new one, your open missions come with you" : `⏳ Your agents held their posts${days >= 6 ? " · a real week passed, rivals moved" : ""}`}</span><span class="wb-chip${days >= 0.5 ? " good" : ""}">🎁 ${bonus}</span><span id="wb-tour"></span></div>
      </div>
      <div class="wb-real"><div class="wb-k">Did you do these for real? <em>each pays +200 XP</em></div>${open.length ? open.map((m) => `<div class="move real"><button class="tick" data-wb="${m.id}" title="I did this in real life"></button><span>${esc(m.text)}<small>committed week ${m.week}</small></span></div>`).join("") : `<p>No open missions yet. Execute orders in the game and each one becomes a real mission for your week.</p>`}</div>
      <div class="wb-act">${s.over ? "" : `<button class="go ibegin" id="wb-go">▶ Continue campaign</button>`}<button class="ghostbtn" id="wb-new">New campaign</button></div>
    </div>`;
    $("#intro").hidden = false;
    $$("[data-wb]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.wb; if (ticked.has(id)) { ticked.delete(id); b.textContent = ""; b.parentElement.classList.remove("done"); } else { ticked.add(id); b.textContent = "✓"; b.parentElement.classList.add("done"); Sound.play("potion"); } }));
    const done = (mode) => { $("#intro").hidden = true; G.modal = false; resolve({ mode, ticked: [...ticked], days }); };
    $("#wb-go")?.addEventListener("click", () => done("continue"));
    $("#wb-new").addEventListener("click", () => done("new"));
    warReport(s, () => done("continue"));
  });
}
// The Monday email, as a screen: what changed and the 3 moves, each opening the thing that does it
async function warReport(s, resume) {
  const rival = (id) => G.fac.get(id)?.name ?? "A rival";
  let rep = s.cid ? await fetch(`/api/report?campaign=${encodeURIComponent(s.cid)}`).then((r) => r.ok ? r.json() : null).catch(() => null) : null;
  if (!rep?.moves) {
    // offline or never synced: the same rules, from the save itself
    const changes = [...(s.sieges ?? []).map((x) => `${rival(x.fid)} is besieging ${x.city}: it falls in ${x.left} week${x.left > 1 ? "s" : ""}`), ...(s.intents ?? []).map((x) => `${rival(x.fid)} is moving on ${x.city}, arriving Sunday`)].slice(0, 3);
    const moves = [...(s.sieges ?? []).map((x) => ({ text: `Defend ${x.city}: post to your fans there this week`, href: "" })), ...(s.orders ?? []).filter((o) => !o.done).map((o) => ({ text: o.title, href: "" })), ...s.real.filter((m) => !m.done).map((m) => ({ text: m.text, href: "" }))].slice(0, 3);
    rep = { changes, moves, tour: null };
  }
  const ch = $("#wb-changes"), mv = $("#wb-moves"); if (!ch || !mv) return;
  ch.innerHTML = rep.changes.length ? rep.changes.map((c) => `<li>${esc(c)}</li>`).join("") : `<li class="none">Quiet week. Nothing moved against you.</li>`;
  const act = (h) => /\.ics$/.test(h) ? "📅 calendar" : /^\/brief\//.test(h) ? "📄 brief" : "▶ do it";
  mv.innerHTML = rep.moves.length ? rep.moves.map((m, i) => /\.ics$/.test(m.href)
    ? `<a class="wb-move" href="${esc(m.href)}" download><b>${i + 1}</b><span>${esc(m.text)}</span><i>${act(m.href)}</i></a>`
    : `<button class="wb-move" data-href="${esc(m.href)}"><b>${i + 1}</b><span>${esc(m.text)}</span><i>${act(m.href)}</i></button>`).join("")
    : `<span class="wb-load">No moves waiting. Continue and give your agents orders.</span>`;
  $$("#wb-moves button.wb-move").forEach((b) => b.addEventListener("click", () => {
    const h = b.dataset.href, city = decodeURIComponent((h.match(/^\/brief\/[^/]+\/([^/#]+)/) ?? [])[1] ?? "");
    if (city) openDoc(h, `City Brief · ${city}`); else resume();
  }));
  const t = rep.tour, tb = $("#wb-tour");
  if (t?.id && tb) {
    tb.outerHTML = `<button class="wb-chip" id="wb-tour">🗺 Tour: ${t.nights} nights${t.next ? ` · next ${esc(t.next.city)}, ${new Date(t.next.night + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}</button>`;
    $("#wb-tour").addEventListener("click", () => openDoc(`/tour/${t.id}`, `Tour plan · ${t.nights} nights`));
  }
}
function applyReturn(r, s) {
  if (r.mode === "continue") {
    restore(s);
    for (const id of r.ticked) markReal(id);
    if (r.days >= 0.5) { G.ordersLeft += 1; event("🔥 Returning bonus: +1 order this week.", "good"); }
    ops(`<span class="ok">campaign restored</span> · week ${G.week}, ${G.conquest}% · ${G.real.filter((m) => !m.done).length} real missions open`);
    if (r.days >= 6) setTimeout(() => { event("📅 A real week passed. Your rivals made their moves.", "bad"); endWeek(); }, 1500);
  } else {
    // a fresh campaign, but the missions you haven't done yet come with you
    const carry = s.real.filter((m) => !m.done && !r.ticked.includes(m.id)).map((m, i) => ({ ...m, id: "c" + i, week: "earlier" }));
    G.real = carry; if (r.ticked.length) { G.realDone += r.ticked.length; G.achPts += 200 * r.ticked.length; ach("real"); }
    if (carry.length) ops(`<span class="ok">carried over</span> ${carry.length} real mission${carry.length > 1 ? "s" : ""} from your last campaign`);
  }
  hud(); hudReal(); renderAgents(); renderRivalStrip(); MapView.relayer();
}
addEventListener("beforeunload", saveGame);
setInterval(() => { if (G && !$("#game").hidden) saveGame(); }, 12000);

// ---------------------------------------------------------------- the share card
// A 1200x630 card of your campaign: your map, your age, the climb, and the one
// real thing you're doing this week. Portraits come through our own origin so
// the canvas can be exported.
const proxied = (u) => (u && /^https:\/\/images\.qloo\.com\//.test(u) ? `/api/img?u=${encodeURIComponent(u)}` : null);
function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
async function shareCard(opts = {}) {
  const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d");
  await document.fonts?.ready;
  const bg = x.createRadialGradient(W * 0.72, H * 0.45, 0, W * 0.72, H * 0.45, W * 0.7); bg.addColorStop(0, "#2a1450"); bg.addColorStop(0.55, "#0f0a1a"); bg.addColorStop(1, "#090909");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(225,189,255,.25)"; x.lineWidth = 1; x.strokeRect(20.5, 20.5, W - 41, H - 41);
  x.fillStyle = "#af50ff"; for (const [px, py, dx, dy] of [[20, 20, 1, 1], [W - 20, 20, -1, 1], [20, H - 20, 1, -1], [W - 20, H - 20, -1, -1]]) { x.fillRect(px, py, 26 * dx, 3 * dy); x.fillRect(px, py, 3 * dx, 26 * dy); }
  // the map
  const mw = 600, mh = mw * (MH / MW), mx = W - mw - 50, my = 110, s = mw / MW;
  x.save(); x.setTransform(s, 0, 0, s, mx, my); const P = d3.geoPath(null, x);
  x.beginPath(); P(Atlas.nation); x.fillStyle = "#141219"; x.shadowColor = "rgba(175,80,255,.7)"; x.shadowBlur = 30; x.fill(); x.shadowBlur = 0;
  for (const st of Atlas.states) { const g = G.gov.get(st.id); if (!g) continue; const key = sideOf(g.city); x.beginPath(); P(st.f); x.globalAlpha = (key === "you" ? 0.75 : key === "allied" ? 0.55 : key === "open" || key === "fog" ? 0.18 : 0.5) * g.k; x.fillStyle = colOf(key); x.fill(); }
  x.globalAlpha = 1; x.beginPath(); P(Atlas.inner); x.strokeStyle = "rgba(247,249,250,.15)"; x.lineWidth = 0.8 / s; x.stroke(); x.restore();
  for (const c of G.cities) { if (sideOf(c) !== "you") continue; const X = mx + c.p[0] * s, Y = my + c.p[1] * s; x.fillStyle = "#fff"; x.beginPath(); x.arc(X, Y, c.name === G.capital ? 6 : 3.5, 0, 6.283); x.fill(); }
  // the commander
  const face = await loadImg(proxied(G.player.image));
  x.save(); x.beginPath(); x.arc(118, 168, 58, 0, 6.283); x.closePath(); x.fillStyle = "#151821"; x.fill(); if (face) { x.clip(); const k = Math.max(116 / face.naturalWidth, 116 / face.naturalHeight); x.drawImage(face, 118 - (face.naturalWidth * k) / 2, 168 - (face.naturalHeight * k) / 2.6, face.naturalWidth * k, face.naturalHeight * k); } x.restore();
  x.strokeStyle = "#af50ff"; x.lineWidth = 4; x.beginPath(); x.arc(118, 168, 58, 0, 6.283); x.stroke();
  x.fillStyle = "#f7f9fa"; x.font = '700 22px "Inter Tight", sans-serif'; x.fillText("CONQUEST", 60, 70); x.font = '300 22px "Inter Tight", sans-serif'; x.fillText(".AGENT", 180, 70);
  x.font = 'italic 400 52px "Instrument Serif", serif'; x.fillText(G.player.name.length > 22 ? G.player.name.slice(0, 21) + "…" : G.player.name, 196, 168);
  const [, an, aname] = ageOf(G.conquest);
  x.font = '500 15px "IBM Plex Mono", monospace'; x.fillStyle = "#e1bdff"; x.fillText(`AGE ${an} · ${aname.toUpperCase()} · WEEK ${G.week} OF ${WEEKS}`, 198, 200);
  const tp = opts.tour;
  if (tp) { // the route over the map, numbered
    const pts = [tp.input.home, ...tp.stops.map((st) => st.city)].map((n) => G.cities.find((c) => c.name === n)).filter(Boolean).map((c) => [mx + c.p[0] * s, my + c.p[1] * s]);
    x.strokeStyle = "#ffcf5a"; x.lineWidth = 3; x.setLineDash([9, 7]); x.beginPath(); pts.forEach(([X, Y], i) => (i ? x.lineTo(X, Y) : x.moveTo(X, Y))); x.stroke(); x.setLineDash([]);
    pts.slice(1).forEach(([X, Y], i) => { x.fillStyle = "#ffcf5a"; x.beginPath(); x.arc(X, Y, 11, 0, 6.283); x.fill(); x.fillStyle = "#1a1208"; x.font = '800 13px "Inter Tight", sans-serif'; x.textAlign = "center"; x.fillText(String(i + 1), X, Y + 4.5); x.textAlign = "left"; });
  }
  x.fillStyle = "#fff"; x.font = '700 108px "Inter Tight", sans-serif'; x.fillText(tp ? `${tp.totals.nights} nights` : `${G.start}→${G.conquest}%`, 56, 360);
  x.font = '300 22px "Inter Tight", sans-serif'; x.fillStyle = "#c9ccd1"; x.fillText(tp ? `on tour · ${tp.totals.fansReachable.toLocaleString()} fans reachable (Qloo)` : "of my audience map conquered", 60, 398);
  const stats = [["CITIES", `${held()}/${ground()}`], ["ALLIES", G.allies], ["AGENTS", [...G.crew.values()].filter((c) => c.recruited).length], ["REAL MOVES", `${G.real.filter((m) => m.done).length}/${G.real.length}`], ["SCORE", score().toLocaleString()]];
  stats.forEach(([k, v], i) => { const X = 60 + i * 108; x.fillStyle = "#828384"; x.font = '500 11px "IBM Plex Mono", monospace'; x.fillText(k, X, 450); x.fillStyle = "#f7f9fa"; x.font = '700 28px "Inter Tight", sans-serif'; x.fillText(String(v), X, 484); });
  const m = G.real.find((r) => !r.done) ?? G.real.at(-1);
  x.fillStyle = "#e1bdff"; x.font = '500 12px "IBM Plex Mono", monospace'; x.fillText(m ? (m.done ? "DONE FOR REAL" : "THIS WEEK, FOR REAL") : "PLAYED ON LIVE DATA", 60, 540);
  x.fillStyle = "#f7f9fa"; x.font = 'italic 400 26px "Instrument Serif", serif';
  const line = m ? m.text : "Qloo taste graph · 1,000 simulated fans · live trends";
  x.fillText(line.length > 64 ? line.slice(0, 63) + "…" : line, 60, 574);
  x.fillStyle = "#828384"; x.font = '400 14px "IBM Plex Mono", monospace'; x.textAlign = "right"; x.fillText("Play your audience → conquest.agent", W - 50, H - 46); x.textAlign = "left";
  return cv;
}
async function openShare(opts = {}) {
  if (!G) return;
  const cv = await shareCard(opts), url = cv.toDataURL("image/png"), [, , aname] = ageOf(G.conquest);
  const text = opts.tour ? `On tour: ${opts.tour.totals.nights} nights, ${opts.tour.stops.map((st) => st.city).join(" → ")}. Planned with Conquest.` : `I took my audience map from ${G.start}% to ${G.conquest}% in Conquest (${aname} age). My real move this week: ${(G.real.find((m) => !m.done) ?? G.real.at(-1))?.text ?? "play the next city"}`;
  $("#intro-body").innerHTML = `<div class="ibanner">Share your campaign</div><div style="padding:18px 22px 0"><img src="${url}" alt="Your Conquest campaign card" style="width:100%;border-radius:8px;border:1px solid var(--hair)"></div>
    <div class="orow" style="justify-content:center;gap:10px;padding:14px 22px 0"><button class="go" id="sh-dl" style="width:auto;margin:0">Download image</button>${navigator.share ? `<button class="ghostbtn" id="sh-share" style="margin:0">Share…</button>` : ""}<button class="ghostbtn" id="sh-copy" style="margin:0">Copy caption</button><button class="ghostbtn" id="sh-x" style="margin:0">Close</button></div>`;
  $("#intro").hidden = false; G.modal = true;
  const close = () => { $("#intro").hidden = true; G.modal = false; };
  $("#sh-x").onclick = close;
  $("#sh-dl").onclick = () => { const a = document.createElement("a"); a.href = url; a.download = `conquest-${G.player.name.toLowerCase().replace(/\W+/g, "-")}.png`; a.click(); };
  $("#sh-copy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Caption copied."); } catch {} };
  $("#sh-share")?.addEventListener("click", () => cv.toBlob(async (b) => { try { await navigator.share({ text, files: [new File([b], "conquest.png", { type: "image/png" })] }); } catch { try { await navigator.share({ text }); } catch {} } }));
}

// ---------------------------------------------------------------- the 2-minute jury tour
// Plays the whole loop by itself with captions: pick a name, scout, the briefing,
// move an agent, take a city, a real mission, the radar, a battle, a parley,
// the week ending, and the share card. The tour's dice always land.
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(150); } return false; };
function caption(step, n, text) {
  let bar = $("#tourbar");
  if (!bar) { bar = document.createElement("div"); bar.id = "tourbar"; bar.innerHTML = `<div class="tb-k" id="tb-k"></div><div class="tb-t" id="tb-t"></div><button id="tb-x">Skip tour</button>`; document.body.appendChild(bar); $("#tb-x").onclick = stopTour; }
  bar.hidden = false; bar.classList.toggle("ingame", !$("#game").hidden);
  $("#tb-k").textContent = `JURY TOUR · ${step}/${n} · ${Math.round((Date.now() - TOUR_T0) / 1000)}s`; $("#tb-t").textContent = text;
}
let TOUR_T0 = 0, tourSpot = null;
function spot(sel) { tourSpot?.classList.remove("spot"); tourSpot = sel ? $(sel) : null; tourSpot?.classList.add("spot"); }
function stopTour() { TOURING = false; spot(null); const b = $("#tourbar"); if (b) b.hidden = true; if (G) { G.tour = false; Clock.reset(); } }
async function runTour() {
  if (TOURING) return; TOURING = true; setView(false); TOUR_T0 = Date.now(); const N = 7, live = () => TOURING;
  try { localStorage.setItem("conquest-coached", "1"); } catch {}
  caption(1, N, "Conquest is the growth agent you play like a strategy game. Watch a full week in a minute.");
  await sleep(3500); if (!live()) return;
  openWho("Jason Calacanis");
  caption(2, N, "Type any name: Qloo finds you, with your photo and verified socials.");
  await until(() => $('[data-me="0"]')); await sleep(2000); if (!live()) return;
  $('[data-me="0"]').click();
  caption(2, N, "Agents scout your real audience: live Qloo calls and 1,000 simulated fans.");
  await until(() => G && !$("#game").hidden && G.objective && G.missions?.length, 90000); if (!live()) return;
  G.tour = true;
  caption(3, N, `The objective is set: ${objectiveOf(G.objective).title.toLowerCase()}. It's the quest bar up top, four missions, and the win screen. (Your own name gets to pick it.)`);
  spot("#quest"); await sleep(4500); spot(null); if (!live()) return;
  const lead = G.objective === "collab" ? "diplomat" : G.objective === "sponsor" ? "sponsor" : "booker";
  caption(4, N, `Three orders a week. Send the ${unitName(lead)}, and march on the city that's ripe.`);
  spot("#army-rail"); selectUnit(lead, true); await sleep(1800); if (!live()) return;
  const bc = chipsFor(lead).find((c) => !c.allin); if (bc) queueOrder(lead, bc); await sleep(1400);
  selectUnit("you", true); await sleep(1400);
  const yc = chipsFor("you").find((c) => c.kind === "take") ?? chipsFor("you")[0]; if (yc) queueOrder("you", yc); await sleep(1400); spot(null); if (!live()) return;
  caption(5, N, "Nothing moves until END WEEK. Then the army marches, makes the live calls and comes back with loot; the battle resolves; the rival answers.");
  spot("#endweek"); await sleep(1600); spot(null); endWeek();
  await until(() => $("#ws-go") || !live(), 60000); await sleep(4000); if (!live()) return;
  caption(6, N, "From week 1 you can see what winning looks like: the tour pack, with rooms, nights, emails and a calendar.");
  victory(true); await sleep(6000); $("#victory").hidden = true; Show.close(); if (!live()) return;
  caption(7, N, "Share it. That's Conquest: every move in the game is a real growth move. Your turn.");
  await openShare(); spot(null);
  $("#tb-x").textContent = "Play it yourself";
  G.tour = false; TOURING = false;
}


// ---------------------------------------------------------------- content x-ray
// Reads your real latest YouTube videos, plays each to the 1,000-fan panel and
// the brain model, and says what would happen and what to change. It checks
// itself against the videos' real view counts. Instagram, TikTok and X need
// your account connected, so they're honest "connect" slots.
const YT_DEFAULT = { "jason calacanis": "@allin", "los angeles dodgers": "@Dodgers" };
// find the creator's channel automatically (Qloo socials first, then a channel search by name)
async function ensureChannel() {
  if (G.xrayHandle || G.ytFound) return;
  const s = (G.player.socials || []).find((x) => x.network === "youtube"), dflt = YT_DEFAULT[G.player.name.toLowerCase()];
  if (s || dflt) { G.xrayHandle = s ? "@" + s.handle.replace(/^@/, "") : dflt; return; }
  const r = await api(`/api/ytfind?name=${encodeURIComponent(G.player.name)}`).catch(() => null);
  G.ytFound = r?.status === "ok" ? r : { status: "none" };
  if (r?.status === "ok") G.xrayHandle = r.channels[r.best].handle;
}
const handleOf = (net) => { const s = (G.player.socials || []).find((x) => x.network === net); return s ? "@" + String(s.handle).replace(/^@/, "") : null; };
function ytHandle() {
  const s = (G.player.socials || []).find((x) => x.network === "youtube");
  return G.xrayHandle ?? (s ? "@" + s.handle.replace(/^@/, "") : YT_DEFAULT[G.player.name.toLowerCase()] ?? "");
}
function brainSpark(points, dead) {
  if (!points?.length) return "";
  const W = 150, H = 34, max = Math.max(...points), min = Math.min(...points), n = points.length - 1;
  const P = points.map((v, i) => `${(i / n) * W},${H - 3 - ((v - min) / Math.max(1, max - min)) * (H - 8)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-label="Predicted brain response across the video">${(dead ?? []).map((z) => `<rect x="${(z.start / n) * W}" y="0" width="${Math.max(3, ((z.end - z.start) / n) * W)}" height="${H}" fill="rgba(255,92,122,.18)"/>`).join("")}<polyline points="${P}" fill="none" stroke="#e1bdff" stroke-width="1.6"/></svg>`;
}
// A left-side view of the brain (front on the left), drawn like an anatomy
// plate: real lobe boundaries (central, Sylvian and parieto-occipital
// fissures), the named primary sulci, a field of secondary folds, cerebellum
// with folia, and the brainstem. Each lobe lights up as strongly as the model
// predicts for its region: frontal = attention, temporal = auditory,
// occipital = visual, Broca's + Wernicke's areas = language.
const BRAIN = (() => {
  const L = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join("");
  const smooth = (pts) => { let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [nx, ny] = pts[i + 1]; d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`; } const e = pts[pts.length - 1]; return d + `L${e[0]} ${e[1]}`; };
  const central = [[121, 0], [118, 16], [117, 32], [112, 48], [106, 62], [101, 82]];
  const sylvian = [[57, 95], [78, 88], [101, 82], [124, 79], [140, 77], [152, 70], [158, 62]];
  const parocc = [[178, 0], [172, 24], [169, 42], [170, 58]];
  const preocc = [[158, 62], [166, 76], [172, 92], [178, 108], [184, 160]];
  const rev = (p) => [...p].reverse();
  const lobes = {
    frontal: L([[0, 0], ...central, ...rev(sylvian.slice(0, 3)), [50, 160], [0, 160]]) + "Z",
    parietal: L([[121, 0], [178, 0], ...parocc.slice(1), [158, 62], ...rev(sylvian).slice(1), ...rev(central).slice(1)]) + "Z",
    occipital: L([[178, 0], [220, 0], [220, 160], [184, 160], ...rev(preocc).slice(1), [170, 58], ...rev(parocc).slice(1)]) + "Z",
    temporal: L([...sylvian, ...preocc.slice(1), [50, 160]]) + "Z",
  };
  const out = "M24 78C20 52 40 26 72 18C100 10 136 10 162 22C186 34 200 56 198 80C197 94 190 104 178 108C168 112 156 112 148 110C136 116 120 122 104 120C88 124 70 122 60 112C54 106 52 98 58 94C50 96 38 96 30 90C26 86 24 82 24 78Z";
  const fissures = [central, sylvian, parocc, preocc.slice(0, 4)].map(smooth).join("");
  const primary = ["M38 50C58 40 80 35 104 33", "M34 70C54 63 76 59 103 54", "M107 17C103 31 101 44 95 61", "M134 15C130 31 128 46 122 66", "M132 46C146 40 158 42 168 49", "M66 104C90 98 118 92 150 86", "M76 116C102 110 128 104 160 98", "M186 48C181 64 183 80 189 92", "M150 30C154 38 152 48 146 56"];
  // secondary folds: short meanders scattered over the cortex (seeded, so every brain matches)
  const rnd = mulberry(1907), sec = [];
  for (let i = 0; i < 120; i++) {
    let x = 30 + rnd() * 165, y = 16 + rnd() * 100, ang = rnd() * 6.283; const pts = [[x, y]];
    for (let j = 0, n = 5 + Math.floor(rnd() * 4); j < n; j++) { ang += (rnd() - 0.5) * 2.6; x += Math.cos(ang) * (2.6 + rnd() * 2.4); y += Math.sin(ang) * (2.6 + rnd() * 2.4); pts.push([+x.toFixed(1), +y.toFixed(1)]); }
    sec.push(smooth(pts.map((p) => [+(+p[0]).toFixed(1), +(+p[1]).toFixed(1)])));
  }
  const cereb = "M146 112C160 104 186 104 196 116C202 128 190 142 170 142C154 142 142 134 142 124C142 118 143 115 146 112Z";
  const folia = Array.from({ length: 7 }, (_, i) => `M${140 + i} ${113 + i * 4.2}C${158} ${108 + i * 4.2} ${182} ${108 + i * 4.2} ${200 - i * 1.5} ${115 + i * 4.4}`).join("");
  const stem = "M108 112C122 114 132 118 130 128C128 136 126 142 126 150L110 150C110 142 108 134 104 126C100 120 102 114 108 112Z";
  return { out, lobes, fissures, primary: primary.join(""), sec: sec.join(""), cereb, folia, stem, broca: "M68 80c3-7 16-9 23-4 5 4 2 10-6 12-8 2-18-1-17-8z", wernicke: "M128 88c5-6 19-7 25-1 4 5-1 11-10 12-9 1-17-5-15-11z" };
})();
const LOBE_OF = { frontal: "attention", temporal: "auditory", occipital: "visual" };
const brainOp = (v) => (0.16 + 0.84 * clamp01(v / 100)).toFixed(2);
let brainN = 0;
function brainFig(rg, cls = "bfig") {
  const id = "bc" + ++brainN, op = (r) => brainOp(rg?.[r]?.avg ?? 0);
  const lobe = (n, d) => LOBE_OF[n] ? `<path data-r="${LOBE_OF[n]}" d="${d}" fill="${REGIONS[LOBE_OF[n]].col}" opacity="${op(LOBE_OF[n])}"/>` : `<path d="${d}" fill="#4a4058" opacity=".5"/>`;
  return `<svg viewBox="16 6 192 156" class="${cls}" role="img" aria-label="Predicted brain response by region"><defs>
    <clipPath id="${id}"><path d="${BRAIN.out}"/></clipPath><clipPath id="${id}c"><path d="${BRAIN.cereb}"/></clipPath>
    <radialGradient id="${id}g" cx="38%" cy="28%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#2a2333"/><stop offset=".5" stop-color="#4a3f57"/><stop offset="1" stop-color="#231d2b"/></linearGradient></defs>
    <path d="${BRAIN.stem}" fill="url(#${id}s)" stroke="rgba(0,0,0,.5)" stroke-width="1"/>
    <path d="${BRAIN.cereb}" fill="#3b3247"/><g clip-path="url(#${id}c)"><path d="${BRAIN.folia}" fill="none" stroke="rgba(8,5,12,.6)" stroke-width="1.3"/><path d="${BRAIN.cereb}" fill="url(#${id}g)"/></g><path d="${BRAIN.cereb}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.2"/>
    <path d="${BRAIN.out}" fill="#3a3045"/>
    <g clip-path="url(#${id})">${Object.entries(BRAIN.lobes).map(([n, d]) => lobe(n, d)).join("")}
      <path data-r="language" d="${BRAIN.broca}" fill="${REGIONS.language.col}" opacity="${op("language")}"/><path data-r="language" d="${BRAIN.wernicke}" fill="${REGIONS.language.col}" opacity="${op("language")}"/>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="${BRAIN.sec}" stroke="rgba(255,255,255,.12)" stroke-width=".9" transform="translate(-.7 -.7)"/><path d="${BRAIN.sec}" stroke="rgba(10,6,16,.5)" stroke-width="1.2"/>
        <path d="${BRAIN.primary}" stroke="rgba(255,255,255,.14)" stroke-width="1.3" transform="translate(-.9 -.9)"/><path d="${BRAIN.primary}" stroke="rgba(8,5,12,.7)" stroke-width="2"/>
        <path d="${BRAIN.fissures}" stroke="rgba(255,255,255,.12)" stroke-width="1.6" transform="translate(-1 -1)"/><path d="${BRAIN.fissures}" stroke="rgba(6,4,10,.85)" stroke-width="3"/></g>
      <path d="${BRAIN.out}" fill="url(#${id}g)"/><path d="${BRAIN.out}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="7"/></g>
    <path d="${BRAIN.out}" fill="none" stroke="rgba(225,189,255,.45)" stroke-width="1.3"/></svg>`;
}
function reactionHtml(v) {
  if (!v.regions) return "";
  const strongest = Object.entries(v.regions).sort((a, b) => b[1].avg - a[1].avg)[0];
  const WHERE = { visual: "back", auditory: "side", language: "2 spots", attention: "front" };
  const bars = Object.entries(REGIONS).map(([k, r]) => { const x = v.regions[k]?.avg ?? 0; return `<div class="rg" style="--c:${r.col}"><span>${r.name} <small>${WHERE[k]}</small></span><i><u style="width:${x}%"></u></i><b>${x}%</b></div>`; }).join("");
  const LBL = ["Hate", "Meh", "OK", "Like", "Love"], top = Math.max(1, ...(v.hist ?? [1]));
  const hist = (v.hist ?? []).map((p, i) => `<div class="hb"><i style="height:${Math.max(4, (p / top) * 100)}%;background:${["#ff5c7a", "#ff9f43", "#8a8d96", "#b27dff", "#2fd3a5"][i]}"></i><b>${p}%</b><span>${LBL[i]}</span></div>`).join("");
  return `<div class="react">
    <div class="rc"><div class="rc-t">🧠 How the brain reacted</div><div class="rc-b">${brainFig(v.regions)}<div class="rgs">${bars}</div></div><small>Lights up most: <b>${REGIONS[strongest[0]].name.toLowerCase()}</b>${v.deadZones ? `, with ${v.deadZones} attention dip${v.deadZones > 1 ? "s" : ""} (red in the curve)` : ", no attention dips"}.</small></div>
    <div class="rc"><div class="rc-t">👥 How 1,000 fans reacted</div><div class="hist">${hist}</div>${v.quote ? `<q>${esc(v.quote.text)}</q><small>— ${esc(v.quote.persona)}</small>` : ""}${v.why?.length ? `<small>What they reacted to: ${v.why.map((w) => esc(w.element)).join(", ")}</small>` : ""}</div>
  </div>`;
}
function verdictFor(v, avg) {
  const d = v.mean - avg;
  const what = d >= 0.05 ? `Above your average: expect it to outperform with your core fans, strongest in ${v.top?.city ?? "your best city"}.` : d <= -0.05 ? `Below your average: likely to underperform${v.bottom ? `; ${v.bottom.city} cools on it` : ""}.` : `In line with your average: a steady performer${v.top ? `, best in ${v.top.city}` : ""}.`;
  const fix = [];
  if (v.deadZones) fix.push(`attention sags ${v.deadZones}×${v.firstDead != null ? ` (first about ${v.firstDead}% in)` : ""}: tighten that stretch`);
  if (!v.appeals.length) { const t = (G.player.aud?.tags ?? [])[0]; if (t) fix.push(`name what your fans love: lead with ${t}`); }
  if (v.top) fix.push(`push it to ${v.top.city} first`);
  return { what, fix: fix.length ? fix.join("; ") : "keep the format: it fits your crowd" };
}
// how far to trust the simulated fans: who answered, and whether real numbers agree
function panelConfidence(r) {
  const live = /claude|live/i.test(r.source ?? ""), rho = r.rho, agree = rho != null && rho >= 0.4;
  const level = live && agree ? "high" : live || agree || (rho != null && rho > 0) ? "medium" : "low";
  const reason = [live ? "fans answered in their own words (AI)" : "rule-based fans built from Qloo tastes", rho == null ? "no real views to check against" : `ranking vs real views per day ρ ${rho}`].join("; ");
  return { level, reason };
}
function xrayHtml() {
  const r = G.xray, h = ytHandle();
  const ig = handleOf("instagram"), tt = handleOf("tiktok"), xh = handleOf("twitter");
  const alts = (G.ytFound?.channels ?? []).filter((c) => c.handle !== h).slice(0, 3);
  const plat = `<div class="xp-plat"><span class="on">▶ YouTube ${h ? esc(h) : ""} <b>live</b></span><span data-lock="Instagram's API needs your account connected (Meta login). Connect to X-ray your Reels.">Instagram ${ig ? esc(ig) + " " : ""}· connect</span><span data-lock="TikTok's API needs your account connected. Connect to X-ray your TikToks.">TikTok ${tt ? esc(tt) + " " : ""}· connect</span><span data-lock="X's API is paid. Connect your X account to X-ray your posts.">X ${xh ? esc(xh) + " " : ""}· connect</span></div>` + (alts.length ? `<div class="xp-alt">Not your channel? ${alts.map((c) => `<button data-alt="${esc(c.handle)}">${esc(c.title)} <small>${esc(c.handle)}</small></button>`).join("")}</div>` : "");
  const form = `<form class="xp-form" id="xp-form"><input id="xp-h" value="${esc(h)}" placeholder="YouTube @handle or channel URL" aria-label="YouTube channel"><button class="go" type="submit" style="width:auto;margin:0">X-ray my last 6 videos</button></form>`;
  const test = `<div class="dgroup">TEST YOUR NEXT POST BEFORE YOU PUBLISH</div><form class="xp-form col" id="xp-test"><textarea id="xp-t" rows="3" placeholder="Paste a title, caption or script"></textarea><button class="ghostbtn" type="submit" style="margin:0">Predict it</button></form><div id="xp-tr"></div>`;
  if (G.xrayBusy) return plat + form + `<p class="note" style="margin-top:12px">Reading your channel and playing each video to 1,000 simulated fans…</p>` + test;
  if (!r) return plat + form + `<p class="note" style="margin-top:12px">Conquest reads your public channel feed (titles, descriptions, real views), plays each video to your simulated fans and the brain model, then tells you what would happen and what to change.</p>` + test;
  if (r.status !== "ok") return plat + form + `<p class="note" style="color:#ff8fa5;margin-top:12px">${esc(r.error ?? "Couldn't read that channel.")}</p>` + test;
  const rho = r.rho, trust = rho == null ? "Not enough videos to check against real views yet." : rho >= 0.4 ? `Taste fit tracks your real views per day (ρ ${rho}): use it to pick what to make next.` : rho > 0 ? `Taste fit loosely tracks your real views per day (ρ ${rho}).` : `Your views follow news hooks and format more than taste fit (ρ ${rho}). Use taste fit to choose which clip to push in which city, not to predict raw views.`;
  const conf = panelConfidence(r);
  return plat + form + `<div class="xp-sum"><b>${esc(r.channel)}</b><span>${esc(trust)} Average taste fit ${r.avg}/5.</span><span class="conf">Fans: confidence ${conf.level} (${esc(conf.reason)}). Brain: confidence low (a stand-in model shaped like Meta's TRIBE v2, not a scan of real people).</span></div>` +
    r.videos.map((v, i) => { const vd = verdictFor(v, r.avg); return `<div class="xv">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : ""}<div class="xb"><a href="https://youtube.com/watch?v=${esc(v.videoId)}" target="_blank" rel="noopener">${esc(v.title)}</a>
      <div class="chips"><span>${v.views.toLocaleString()} real views${v.perDay ? ` · ${kfmt(v.perDay)}/day` : ""}</span><span class="g">${v.mean}/5 predicted</span><span>${v.pct45}% love it</span>${v.appeals.slice(0, 2).map((a) => `<span>${esc(a)}</span>`).join("")}</div>
      ${brainSpark(v.brain, v.deadZones ? [{ start: Math.round(((v.firstDead ?? 40) / 100) * (v.brain.length - 1)), end: Math.round(((v.firstDead ?? 40) / 100) * (v.brain.length - 1)) + 2 }] : [])}
      ${reactionHtml(v)}
      <p><b>What would happen:</b> ${esc(vd.what)}</p><p><b>Change:</b> ${esc(vd.fix)}.</p>
      <button class="ghostbtn" data-xm="${i}" style="margin:6px 0 0">📋 Make it a real mission</button></div></div>`; }).join("") + `<p class="note">${esc(r.source)}. Predictions are simulated; the view counts are real.</p>` + test;
}
async function runXray(handle) {
  G.xrayHandle = handle; G.xrayBusy = true; Drawer.render();
  ops(`<span class="ag">🎬 X-ray</span> reading <b>${esc(handle)}</b> on YouTube…`);
  const r = await api(`/api/xray?${qs({ ...G.player.q, yt: handle })}`).catch((e) => ({ status: "error", error: String(e) }));
  G.xray = r; G.xrayBusy = false;
  if (r.status === "ok") { ops(`<span class="api">YouTube RSS + panel</span> ${r.videos.length} videos x-rayed · ranking vs real views ρ ${r.rho ?? "n/a"} · best: “${esc([...r.videos].sort((a, b) => b.mean - a.mean)[0].title.slice(0, 60))}”`); ach("xray"); }
  Drawer.render();
}
async function testPost(text) {
  $("#xp-tr").innerHTML = `<p class="note">Playing it to 1,000 simulated fans…</p>`;
  const r = await api(`/api/rehearse?${qs({ ...G.player.q, text })}`).catch(() => null);
  if (r?.status !== "ok") { $("#xp-tr").innerHTML = `<p class="note" style="color:#ff8fa5">Couldn't test that.</p>`; return; }
  const v = { mean: Math.round(r.aggregate.mean * 10) / 10, pct45: r.aggregate.pct45, top: r.split?.top ? { city: r.split.top.metro } : null, bottom: r.split?.bottom ? { city: r.split.bottom.metro } : null, appeals: r.stimulus?.appeals ?? [], deadZones: r.tribe?.deadZones?.length ?? 0, firstDead: null, brain: r.tribe?.points ?? [] };
  const vd = verdictFor(v, G.xray?.avg ?? G.c.aggregate.mean);
  $("#xp-tr").innerHTML = `<div class="xv"><div class="xb"><div class="chips"><span class="g">${v.mean}/5 predicted</span><span>${v.pct45}% love it</span>${v.appeals.slice(0, 3).map((a) => `<span>${esc(a)}</span>`).join("")}</div>${brainSpark(v.brain, r.tribe?.deadZones)}<p><b>What would happen:</b> ${esc(vd.what)}</p><p><b>Change:</b> ${esc(vd.fix)}.</p></div></div>`;
  ops(`<span class="ag">🎬 X-ray</span> tested a new post · ${v.mean}/5 predicted`);
}
function bindXray() {
  $$("[data-alt]").forEach((b) => b.addEventListener("click", () => runXray(b.dataset.alt)));
  $("#xp-form")?.addEventListener("submit", (e) => { e.preventDefault(); const h = $("#xp-h").value.trim(); if (h) runXray(h); });
  $("#xp-test")?.addEventListener("submit", (e) => { e.preventDefault(); const t = $("#xp-t").value.trim(); if (t) testPost(t); });
  $$("#drawer-b [data-lock]").forEach((b) => b.addEventListener("click", () => toast(b.dataset.lock)));
  $$("[data-xm]").forEach((b) => b.addEventListener("click", () => {
    const v = G.xray.videos[+b.dataset.xm], vd = verdictFor(v, G.xray.avg);
    G.real.push({ id: "x" + G.real.length, text: `Re-cut “${v.title.slice(0, 60)}”: ${vd.fix}.`, src: "Content X-ray (YouTube + panel)", week: G.week, done: false });
    hudReal(); saveGame(); toast("Added to your real missions."); b.disabled = true; b.textContent = "✓ Added to Real moves";
  }));
}


// ---------------------------------------------------------------- agents as characters, and their mission pop-up
// Each agent gets a colour, like an app icon, and a full-colour emoji face.
// Clicking one opens a mission card on the map: what it does, where it could
// go (with why, how long, and what you get), or what it costs to hire.
const AG_COL = { scout: ["#1fb6a6", "#0b5c63"], booker: ["#ff8a3d", "#a3381a"], diplomat: ["#5aa8ff", "#1f4fa8"], sponsor: ["#f5c542", "#a36c12"], herald: ["#ff5fa8", "#9c1f63"], reader: ["#b27dff", "#5a2aa8"], trend: ["#3ddc84", "#13804a"], oracle: ["#7ad1ff", "#2a6fa8"], spy: ["#8a93a6", "#2c3240"], scribe: ["#ff7a6b", "#a3332a"], showrunner: ["#ff4d6d", "#8c1235"], listener: ["#ff6a2b", "#8c2c0a"] };
const agentGrad = (id) => { const [a, b] = AG_COL[id] ?? ["#af50ff", "#4c1a91"]; return `--g1:${a};--g2:${b}`; };
function keepReport(id, city, out) {
  const d = document.createElement("div"); d.innerHTML = out.intel ?? out.line ?? "";
  G.reports ??= {}; G.reports[id] = { city: city.name, text: d.textContent.trim().slice(0, 220), week: G.week };
}
// ---------------------------------------------------------------- the landing hook
// A lighter opener: you and the fans who would love you, both too shy to make the
// first move 👉👈. Then the fingertips touch, and Conquest makes it.
function playHook() {
  const el = $("#hook"); if (!el) return;
  // plays on every visit to the landing page; the jury tour and ?play= links skip it
  if (new URLSearchParams(location.search).has("tour") || new URLSearchParams(location.search).has("play")) { el.remove(); return; }
  el.hidden = false; document.body.classList.add("hooked");
  const cap = $("#hook-cap"), chip = $("#hook-snd");
  let t = [], touched = false, done = false;
  // sound, like a studio logo: ta-dum, a swell while they hesitate, ba-dum-tss on the touch
  function run() {
    t.forEach(clearTimeout); t = []; touched = false; el.classList.remove("you", "fans", "touch");
    const art = el.querySelector(".hk-art"); if (art) { art.style.animation = "none"; void art.offsetWidth; art.style.animation = ""; }
    // the picture speaks for itself; one line lands on the touch
    cap.classList.remove("in"); cap.textContent = "";
    t.push(setTimeout(() => { cap.textContent = "Let's conquer."; cap.classList.add("in"); }, 4300));
    t.push(setTimeout(() => el.classList.add("you"), 1200), setTimeout(() => el.classList.add("fans"), 2400), setTimeout(() => el.classList.add("touch"), 4300), setTimeout(end, 6900));
    const cue = (k, at) => t.push(setTimeout(() => { if (k === "rimshot") touched = true; if (Sound.live) Sound.play(k); }, at));
    cue("tadum", 300); cue("swell", 1200); cue("rimshot", 4300);
  }
  function end() { if (done) return; done = true; t.forEach(clearTimeout); el.classList.add("out"); document.body.classList.remove("hooked"); setTimeout(() => el.remove(), 900); }
  // Browsers keep every page silent until the visitor's first tap. So the first
  // tap turns the sound on and replays the opener with it; the next tap skips.
  Sound.unlock().catch(() => {}).finally(() => { if (!Sound.live && chip) chip.hidden = false; });
  el.addEventListener("click", (e) => {
    if (Sound.live) return end();
    e.stopPropagation(); Sound.unlock().then(() => { if (chip) chip.hidden = true; run(); });
  });
  run();
}

// the right-hand drawer: all orders, live trends, or this week's real-world moves
const Drawer = {
  mode: null,
  open(mode) { this.mode = mode; $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); this.render(); },
  close() { this.mode = null; $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); },
  render() {
    if (!G || !this.mode) return;
    const b = $("#drawer-b");
    if (this.mode === "missions") { $("#drawer-t").textContent = "Missions"; b.innerHTML = missionsHtml(); $("#m-change").onclick = () => { this.close(); intro(true); }; }
    else if (this.mode === "tour") { $("#drawer-t").textContent = "Tour Planner"; b.innerHTML = tourHtml(); bindTour(); }
    else if (this.mode === "radar") { $("#drawer-t").textContent = "Threat report"; b.innerHTML = threatReport(); bindThreats(); }
    else if (this.mode === "xray") { $("#drawer-t").textContent = "Content X-ray"; b.innerHTML = xrayHtml(); bindXray(); if (!G.xray && !G.xrayBusy && !G.xrayAuto) { G.xrayAuto = true; ensureChannel().then(() => { if (G.xrayHandle) runXray(G.xrayHandle); else this.render(); }); } }
    else if (this.mode === "intel") { $("#drawer-t").textContent = "Intel"; b.innerHTML = '<div class="player" id="player"></div><div class="dgroup">FACTIONS · FAME (WIKIPEDIA, 30 DAYS)</div><div class="factions" id="factions"></div><div class="dgroup">YOUR MATERIAL · SOURCES</div><div class="intel" id="intel"></div>'; playerCard(); factions(); }
    else if (this.mode === "moves") { $("#drawer-t").textContent = "Real moves"; b.innerHTML = movesHtml(); bindMoves(); }
  },
};
// the missions sheet: four missions, the win rule, and a way back to the objective screen
function missionsHtml() {
  const o = objectiveOf(G.objective), q = quest(), cur = (G.missions ?? []).find((m) => !m.complete);
  return `<div class="msheet"><div class="win"><b>QUEST: ${esc(q.label)}</b> · ${q.have} of ${q.need} ${esc(q.unit)}<br>How you win: ${esc(o.win)}</div>
    ${(G.missions ?? []).map((m) => `<div class="mrow${m.complete ? " done" : m.late ? " late" : ""}"><span class="wk">${m.complete ? "✓" : m.wk.join("–")}</span><span><span class="st">${m.complete ? "Done" : m === cur ? (m.late ? "Now · late, no penalty" : "Now") : "Next"} · weeks ${m.wk.join("–")}</span><strong>${esc(m.title)}</strong><small>${esc(m.how)}</small><em>Done when: ${esc(m.done)}</em></span></div>`).join("")}
    <button class="vbtn" id="m-change">Change objective (progress carries over)</button></div>`;
}
// the real-world to-do list and every asset the army wrote: emails, pitches, DMs, posts
function movesHtml() {
  const row = (t, src) => `<div class="move"><span>${esc(t)}${src ? `<small>${esc(src)}</small>` : ""}</span></div>`;
  const grp = (t, a) => (a.length ? `<div class="dgroup">${t}</div>${a.join("")}` : "");
  const reals = G.real.map((m) => `<div class="move real${m.done ? " done" : ""}"><button class="tick" data-real="${m.id}" ${m.done ? "disabled" : ""} title="I did this in real life">${m.done ? "✓" : ""}</button><span>${esc(m.text)}<small>${m.done ? "done for real" : `week ${m.week} · ${esc(m.src ?? "")}`}</small></span></div>`);
  const intel = [...G.intel.entries()].flatMap(([city, ts]) => ts.map((t) => row(`${city}: ${t.replace(/^\S+\s/, "")}`, "agent intel")));
  return `<div class="moves">${grp("Real moves · tick them when done", reals)}${G.real.length ? "" : `<p class="note">Send a unit at END WEEK and its report becomes a real move here.</p>`}
    ${grp("Venue emails", G.venueMails.map((m) => row(`${m.venue} (${m.city}): ${m.text}`, "Booker")))}${grp("Sponsor pitches", G.sponsorPitches.map((p) => row(`${p.brand}: ${p.text}`, "Sponsor scout")))}
    ${grp("DMs to send", G.dms.map((d) => row(`${d.name}${d.yes ? " (said yes)" : ""}: ${d.text}`, "Diplomat")))}${grp("Podcasts", G.guestSpots.map((g) => row(`Pitch ${g.name}`, `Herald · ${g.city}`)))}
    ${grp("Posts", G.drafts.map((x) => row(x, "Copywriter")))}${grp("Intel from your agents", intel)}</div>
    <div class="orow"><button class="go" id="moves-copy" style="margin-top:12px">Copy my battle plan</button><button class="ghostbtn" id="moves-ics" style="margin-top:12px">📅 Add show nights to calendar</button></div><p class="note">Every line came from live data or your simulated fans. Do them for real.</p>`;
}
function bindMoves(again) {
  $$("[data-real]").forEach((x) => x.addEventListener("click", () => { markReal(x.dataset.real); again?.(); }));
  const ics = $("#moves-ics"), cp = $("#moves-copy");
  if (ics) ics.onclick = downloadIcs;
  if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(battlePlan()); toast("Copied. Go make it real."); } catch { toast("Couldn't reach the clipboard."); } };
}
// the same list over the win screen
function openAssets() {
  const box = $("#intro-body"); box.classList.remove("obj");
  box.innerHTML = `<div class="ibanner">Your emails, pitches and DMs</div><div style="padding:14px 22px">${movesHtml()}<button class="ghostbtn" id="as-x" style="margin-top:10px">Close</button></div>`;
  $("#intro").hidden = false; bindMoves(openAssets); $("#as-x").onclick = () => { $("#intro").hidden = true; };
}
function openTourFromQuest() { const first = quest().slots.find((s) => s.city)?.city, d = tourDefaults(); G.tourForm = { ...d, home: METROS[first] ? first : d.home, maxCities: 6 }; Drawer.open("tour"); }

// ---------------------------------------------------------------- the game
// the demo names open finished: an objective that suits each one, no screen 0
const PRESET_OBJ = { "cedric the entertainer": "tour", "jason calacanis": "collab", "los angeles dodgers": "sponsor" };
async function startGame(c, player, opts = {}) {
  await Atlas.ready;
  const cities = c.territory.cities.filter((x) => METROS[x.name]).map((x) => ({ ...x, p: ALB(METROS[x.name]) })).filter((x) => x.p);
  const fac = new Map(c.rivals.map((r, i) => [r.id, { id: r.id, name: r.name, col: RIVAL_COLS[i % 3], strategy: r.strategy, allied: false, plan: r, img: qlooImg(r.id), last: r.holds.length ? `Holds ${r.holds.slice(0, 2).join(", ")}` : "Scouting your fans" }]));
  G = { c, player, cities, fac, week: 1, hour: 60, conquest: c.territory.conquest, start: c.territory.conquest, startHeld: 0, orders: c.missions.map((m) => ({ ...m, done: false })), allies: 0, taken: 0, saved: 0, lost: 0, runs: 0, gold: 300, morale: c.aggregate.mean, sieges: [], intents: [], forts: new Set(), potions: [], sponsors: [], fx: [], temp: [], floats: [], anim: null, busy: false, over: false, modal: false, capital: c.territory.capital?.name, pinned: null, last: "Took the field", prep: new Set(), intel: new Map(), fame: new Map(), crew: new Map(), parleyed: new Set(), reactions: new Map(), drafts: [], pitches: [], doneLog: [], army: new Map(), nights: [], real: [], realDone: 0, selected: null, hoverCity: null, hoverUnit: null, opsN: 0, coach: false, ach: new Set(), achPts: 0, rng: mulberry([...player.name].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7)),
    objective: null, objCity: null, missions: [], ordersLeft: 3, orderQueue: [], xp: opts.xp ?? startXp(c.territory.conquest), unitXp: new Map(), report: null, headline: "", events: [], venues: [],
    dms: [], guestSpots: [], posts: new Set(), scouted: new Set(), proven: false, sponsorPitches: [], venueMails: [], offers: [], offersNext: [], offersSeen: [], bonusNext: 0, realTicks: 0, fanLine: null, readBonus: new Map(), showT: 0, noSave: true }; // no autosave until the campaign is settled: the welcome-back screen must not overwrite your save
  assignStates(); G.startHeld = held(); G.layer = null;
  for (const id of BASE6) { G.crew.set(id, { recruited: true, week: 0, busy: false }); spawnUnit(id); } // the first six march from week 1
  G.ordersLeft = ordersPerWeek(lvl(), 0);
  for (const f of fac.values()) portrait(f.img); portrait(player.image);
  $("#site").hidden = true; $("#scan").hidden = true; $("#game").hidden = false; $("#weekshow").hidden = true; scrollTo(0, 0);
  Field.setMode("off"); Neuro.play(c.tribe); brainNote();
  $("#ops").innerHTML = ""; $("#ops-count").textContent = ""; Drawer.close();
  planIntents();
  playerCard(); setObjective("tour"); hud(); renderAgents(); $("#cityp").hidden = true; $("#victory").hidden = true;
  setTimeout(aiPlan, 1500);
  ops(`<span class="api">Qloo</span> mapped ${cities.length} cities, ${c.rivals.length} rivals · ${c.receipts?.length ?? 0} live calls`);
  Sound.play("ageup");
  loadTrends();
  renderRivalStrip();
  if (TOURING) { G.tour = true; G.noSave = true; } // a tour campaign is a demo: never saved
  const saved = TOURING || opts.fresh ? null : loadSave(player.name);
  G.cid = saved?.cid ?? (crypto.randomUUID?.() ?? String(Date.now())).replace(/-/g, "").slice(0, 16);
  let fresh = !saved;
  // the judge path: "Play as" a demo name (or the jury tour) opens on the live map with that name's objective set
  const preset = (player.quick || TOURING) && PRESET_OBJ[player.name.toLowerCase()];
  const begin = () => (preset ? (setObjective(preset), hud(), renderAgents(), MapView.relayer()) : intro());
  if (saved) { const r = await welcomeBack(saved); applyReturn(r, saved); if (r.mode === "new") { fresh = true; await begin(); } }
  else await begin();
  // new campaigns: offer the Monday war report once, before the tutorial (not on the judge path)
  if (fresh && !TOURING && !preset && !G.mailAsked) await new Promise((res) => { askMonday(); const iv = setInterval(() => { if ($("#intro").hidden) { clearInterval(iv); res(); } }, 300); });
  if (!G.offers.length) G.offers = buildOffers();
  if (!TOURING) G.noSave = false;
  hud(); renderAgents(); saveGame();
  let coached = false; try { coached = localStorage.getItem("conquest-coached") === "1"; } catch {}
  if (!coached && !TOURING && fresh) setTimeout(() => Coach.start(), 500);
  api(`/api/rehearse?${qs(player.q)}`).then((r) => { for (const [id, s] of r?.reactions ?? []) G.reactions.set(id, s); }).catch(() => {});
  api(`/api/fame?names=${encodeURIComponent([player.name, ...[...fac.values()].map((f) => f.name)].join("|"))}`).then((r) => {
    if (r?.status === "ok") for (const p of r.people) G.fame.set(p.name, p);
    const el = $("#wk-state"); if (el) el.textContent = [...G.fame.values()].some((p) => p.views) ? "live" : "not found";
    hud();
    const me = G.fame.get(player.name), top = [...G.fac.values()].map((f) => G.fame.get(f.name)).filter((p) => p?.views).sort((a, b) => b.momentum - a.momentum)[0];
    if (me?.views) ops(`<span class="api">Wikipedia</span> you: ${kfmt(me.views)} views/30d ${me.momentum >= 0 ? "▲" : "▼"}${Math.abs(me.momentum ?? 0)}%${top ? ` · fastest-rising rival: ${esc(top.name)} ${top.momentum >= 0 ? "▲" : "▼"}${Math.abs(top.momentum)}%` : ""}`);
  }).catch(() => {});
}

function boom(p, col) {
  const now = performance.now();
  G.fx.push({ p, ring: true, r: 160, col, t0: now, dur: 1400 }, { p, ring: true, r: 90, col: "#fff", t0: now + 150, dur: 900 });
  for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, v = 30 + Math.random() * 90; G.fx.push({ p, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, col: [col, "#fff", "#ff5ec4", "#8052ff"][i % 4], t0: now, dur: 1200 + Math.random() * 600 }); }
}

// ---------------------------------------------------------------- your own orders: take, defend, lay groundwork
const ripeName = () => G.cities.find((c) => !isHeld(c) && (c.state === "beachhead" || (c.state === "rival" && G.prep.has(c.name))))?.name ?? null;
function flipToYou(ct) {
  ct.state = "stronghold"; ct.owner = "you"; ct.contested = null; G.sieges = G.sieges.filter((s) => s.city !== ct.name);
  G.conquest = Math.min(100, G.conquest + pts(ct)); MapView.flip(ct.p); boom(ct.p, COL.you);
}
function fall(ct, f, R) {
  ct.state = "rival"; ct.owner = f.id; ct.contested = null; G.lost++; G.sieges = G.sieges.filter((s) => s.city !== ct.name);
  G.conquest = Math.max(0, G.conquest - pts(ct)); MapView.flip(ct.p); boom(ct.p, f.col); f.last = `Took ${ct.name} from you`;
  R.lost ??= { city: ct.name, rival: lastName(f.name) };
  ops(`<span class="rv">💀 ${esc(f.name)} took ${esc(ct.name)}</span>`);
}
function resolveYouOrder(o, R) {
  const ct = cityOf(o.city); if (!ct) return null;
  if (o.kind === "groundwork") {
    prep(ct, "groundwork");
    const L = { unit: "you", city: ct.name, title: `Groundwork laid in ${ct.name}`, fact: `Your crew worked the room in <b>${esc(ct.name)}</b>. Next week's strike starts at +30%.`, receipts: ["your agents' groundwork"], xp: 20, mapChange: `${ct.name} prepared · ripe ring`, questChange: "a strike there now takes 1 order", realMove: { title: `Post something aimed at your ${ct.name} fans`, detail: `Warm up ${ct.name} before you strike.` } };
    addRealMove(L.realMove, "You", ct.name); R.loot.push(L); return { loot: L };
  }
  if (o.kind === "allin") return allIn(ct, o, R);
  if (o.kind === "defend") {
    const sg = G.sieges.find((s) => s.city === ct.name), f = sg && G.fac.get(sg.fid); if (!f) return null;
    const res = fight(ct, f), other = G.cities.find((c) => sideOf(c) === "you" && c !== ct)?.name;
    // a lost defence doesn't hand the city over: the siege runs on, and you can defend again next week
    if (res.win) { G.sieges = G.sieges.filter((s) => s !== sg); ct.contested = null; G.saved++; ach("wall"); R.held ??= { city: ct.name, rival: lastName(f.name), ripe: ripeName() }; }
    const B = { res, title: `BATTLE FOR ${ct.name.toUpperCase()}`, stamp: res.win ? "REPELLED" : "LOST", good: res.win, xp: res.win ? 60 : 0, line: rivalLine(f, res.win ? "retreat" : "won", { city: ct.name, next: other }), note: res.win ? `${lastName(f.name)} retreats · +60 XP` : `The siege goes on: ${sg.left > 1 ? "falls after next END WEEK" : "falls tonight"} unless you win it back` };
    R.battles.push(B); R.battle ??= { won: res.win, city: ct.name, rival: lastName(f.name), kind: "defend" }; return B;
  }
  const f = o.fid ? G.fac.get(o.fid) : ct.state === "rival" ? G.fac.get(ct.owner) : rivalIn(ct);
  if (isHeld(ct)) return null;
  if (!f || f.allied) {
    flipToYou(ct); ach("blood");
    const L = { unit: "you", city: ct.name, title: `You took ${ct.name}`, fact: `Nobody held <b>${esc(ct.name)}</b>: your ${kfmt(ct.you)} fans there (Qloo) are your ground now.`, receipts: ["Qloo fan footprint"], xp: 60, mapChange: `${ct.name} flips to your colour`, questChange: objIs("tour") ? "a new city to book" : null, realMove: { title: `Post something for your ${ct.name} fans`, detail: `They're yours now. Say hello.` } };
    addRealMove(L.realMove, "You", ct.name); R.loot.push(L); R.battle ??= { won: true, city: ct.name, rival: "nobody", kind: "take" }; return { loot: L };
  }
  const res = fight(ct, f), wasRival = ct.state === "rival";
  if (res.win) { flipToYou(ct); if (wasRival) { G.taken++; f.last = `Lost ${ct.name} to you`; } G.intents = G.intents.filter((x) => !(x.fid === f.id && x.city === ct.name)); ach("blood"); addRealMove({ title: `Play ${ct.name} and post your best clip there`, detail: res.best.say }, "You", ct.name); }
  const B = { res, title: `BATTLE FOR ${ct.name.toUpperCase()}`, stamp: res.win ? "TAKEN" : "HELD", good: res.win, xp: res.win ? (G.giant && f === nemesis() ? 120 : 80) : 0, line: rivalLine(f, res.win ? "beaten" : "won", { city: ct.name }), note: res.win ? `${ct.name} is yours · +80 XP` : `${lastName(f.name)} held. Send the Room reader first next time (+30%).` };
  R.battles.push(B); if (!R.battle || res.win) R.battle = { won: res.win, city: ct.name, rival: lastName(f.name), kind: "take" }; return B;
}

// the all-in night: three rolls of the dice, the city and its two nearest neighbours, or nothing
function allIn(ct, o, R) {
  const f = (o.fid && G.fac.get(o.fid)) || G.fac.get(ct.owner) || nemesis(), p = gambleP(), win = G.tour || G.rng() < p;
  const rolls = win ? [0.62, 0.41, 0.78] : [0.58, 0.31, 0.24], last = lastName(f?.name ?? "the room");
  const rounds = rolls.map((s, i) => ({ k: "The night", src: `roll ${i + 1} of 3`, s, say: s >= 0.5 ? `Roll ${i + 1}: the room is yours.` : `Roll ${i + 1}: ${last} owns the room.` }));
  const won = [];
  if (win) {
    const near = G.cities.filter((c) => !isHeld(c) && c !== ct && c.state !== "uncharted").sort((a, b) => gap(a, ct) - gap(b, ct)).slice(0, 2);
    for (const c of [ct, ...near]) { if (c.state === "rival") G.taken++; flipToYou(c); won.push(c.name); }
    ach("giant");
  }
  const B = { res: { win, odds: { p }, rounds, f, city: ct.name, share: win ? 0.72 : 0.28, best: rounds[0] }, title: `ALL-IN ON ${ct.name.toUpperCase()}`, stamp: win ? "TAKEN" : "LOST", good: win, xp: win ? 150 : 0,
    line: f ? rivalLine(f, win ? "beaten" : "won", { city: ct.name }) : "", note: win ? `${won.join(", ")} are yours · +${won.length} stops to book` : "The night went their way. The 100 gold is gone." };
  R.battles.push(B); if (win) R.battle = { won: true, city: ct.name, rival: last, kind: "take" };
  return f ? B : { loot: { unit: "you", city: ct.name, title: B.title, fact: win ? `<b>${esc(won.join(", "))}</b> flip to you.` : "The gamble missed.", receipts: ["three rolls of the dice"], xp: B.xp, mapChange: win ? `${won.length} cities flip to your colour` : "nothing changed" } };
}
// the sponsor all-in: three pitches at once
async function allInPitch(o, c) {
  const p = gambleP(), win = G.tour || G.rng() < p;
  if (!win) return { unit: "sponsor", city: c.name, title: "All-in pitch missed", fact: "Three brands saw the pitch; none signed this week. The 100 gold went on the deck.", receipts: ["Qloo brands your fans love"], mapChange: "nothing changed", xp: 0, empty: true };
  const L = await jobAt("sponsor", c, o); L.title = "All-in pitch landed: three brands"; L.extras = [];
  for (const other of G.cities.filter((x) => isHeld(x) && x !== c && !G.sponsors.some((s) => s.city === x.name)).slice(0, 2)) { const x = await jobAt("sponsor", other, o); if (!x.empty) L.extras.push(x); }
  return L;
}
// ---------------------------------------------------------------- random events (40% a week, live data, two free answers)
async function randomEvent() {
  const pool = [];
  const pot = G.potions.find((p) => !p.used);
  if (pot) pool.push({ title: `A trend broke in ${pot.where}`, text: `“${pot.title}” is rising (Google Trends).`, a: ["Post on it now", "+1 order next week", () => { pot.used = true; nextWeekOrder(); }], b: ["Save it for a set", "+0.1 material", () => { pot.used = true; G.morale = Math.min(5, G.morale + 0.1); }] });
  const hot = [...G.fac.values()].filter((f) => !f.allied).map((f) => [f, G.fame.get(f.name)?.momentum]).filter(([, m]) => m > 10).sort((x, y) => y[1] - x[1])[0];
  if (hot) { const [f, m] = hot, big = G.cities.filter((c) => sideOf(c) === "you").sort((a, b) => b.you - a.you)[0];
    pool.push({ title: `${f.name}'s views spiked +${m}%`, text: "Wikipedia, last 30 days against the 30 before. Next week they hit two of your cities, not one.", fid: f.id, a: [`Walls on ${big?.name ?? "your capital"} next week`, "free walls", () => { wallsNext(big?.name ?? G.capital); surge(f.id); }], b: ["Let them come, sell tickets", "+60 gold", () => { G.gold += 60; surge(f.id); }] }); }
  const qs2 = G.c?.aggregate?.quotes ?? [], q = qs2[Math.floor(G.rng() * qs2.length)];
  if (q) { const city = G.cities.find((c) => q.persona?.includes(c.name))?.name ?? G.capital;
    pool.push({ title: "A fan started a thread about you", text: `“${q.text.replace(/\s*\(\d\/5\)\s*$/, "")}” (a simulated fan in ${city}, from Qloo)`, a: ["Reply in the thread", "+0.1 material", () => { G.morale = Math.min(5, G.morale + 0.1); }], b: ["Turn it into a meetup", `a fan meetup offer in ${city}`, () => { G.offersNext.push({ id: "fm:" + city + G.week, kind: "meetup", ref: city, city, title: `Fan meetup in ${city}`, text: "The thread wants a meetup.", reward: "city prepared, +0.1 material" }); }] }); }
  const booked = G.nights.find((n) => n.venue && isHeld(cityOf(n.city)));
  if (booked && METROS[booked.city]) {
    const [lon, lat] = METROS[booked.city], r = await api(`/api/weather?lat=${lat}&lon=${lon}`).catch(() => null);
    const wet = r?.status === "ok" ? r.days.filter((d) => [0, 6].includes(new Date(d.date + "T12:00:00").getDay()) && d.rain >= 50) : [];
    if (wet.length) pool.push({ title: `Rain all weekend in ${booked.city}`, text: `${wet.map((d) => `${shortDay(d.date)} ${d.rain}%`).join(", ")} chance of rain (Open-Meteo). Street promo there is off.`, a: ["Push online there instead", "+1 order next week", () => { nextWeekOrder(); }], b: ["Do an indoor pop-up", `${booked.city} prepared`, () => { const c = cityOf(booked.city); if (c) prep(c, "indoor pop-up"); }] });
  }
  return pool.length ? pool[Math.floor(G.rng() * pool.length)] : null;
}
// the receipt count under each loot card: how many live calls stand behind it, and what was dropped for lack of data
function receiptLine(L) {
  const SRCS = [["Qloo", /Qloo/], ["Google Trends", /Google Trends/], ["Wikipedia", /Wikipedia/], ["Open-Meteo", /Open-Meteo/], ["fan panel", /panel/]];
  const n = new Map(); for (const r of L.receipts ?? []) { const s = SRCS.find(([, re]) => re.test(r)); if (s) n.set(s[0], (n.get(s[0]) ?? 0) + 1); }
  if (!n.size) return "";
  const removed = L.empty ? 1 : L.removed ?? 0;
  return `<div class="rcount">${[...n].map(([k, v]) => (k === "Qloo" ? `${v} Qloo call${v > 1 ? "s" : ""}` : `${v} ${k}`)).join(" · ")} · ${removed} claim${removed === 1 ? "" : "s"} removed${removed ? " (no data, no guess)" : ""}</div>`;
}
// ---------------------------------------------------------------- END WEEK: the show
// About six seconds: marches, loot cards one at a time, the battle, the rival's
// move, the tally and the headline. Then it stays as the week's report until
// you press GIVE ORDERS. Click anywhere to jump to the end.
const Show = (() => {
  let fast = false;
  const wait = (ms) => (fast || REDUCED ? Promise.resolve() : sleep(ms));
  const lootCard = (L) => {
    const u = unitOf(L.unit), col = AG_COL[L.unit]?.[0] ?? (L.unit === "you" ? "#af50ff" : "#f0c46a");
    const right = L.unit === "sponsor" && L.gold ? `+${L.gold} gold${L.starUp ? " · " + L.starUp : ""}` : L.xp ? `+${L.xp} XP${L.starUp ? " · " + L.starUp : ""}` : L.gold ? `+${L.gold} gold` : "";
    const title = L.title ?? `${unitName(L.unit)} came back from ${L.city}`;
    return `<div class="lcard${L.empty ? " empty" : ""}" style="--lc:${L.empty ? "#3a4060" : col}"><span class="utile" style="--g1:${col}">${I(u?.ic ?? "star")}</span><div class="lb"><div class="l1"><strong>${esc(title)}</strong><span>${esc(right)}</span></div>
      <div class="fact">${L.fact} <span class="lrc" data-rc="${esc(L.unit)}|${esc(L.city)}" title="Show the live call">(${esc(L.receipts.join(" · "))})</span></div>
      ${receiptLine(L)}${L.mapChange ? `<div class="chg${L.mapChange === "nothing changed" ? " none" : ""}">Map: ${esc(L.mapChange)}</div>` : ""}${L.questChange ? `<div class="chg">Quest: ${esc(L.questChange)}</div>` : ""}${L.realMove ? `<div class="mv">Real move: ${esc(L.realMove.title)}</div>` : ""}${L.action ? `<button class="act" data-act="${L.action.run}">${esc(L.action.label)}</button>` : ""}</div></div>`;
  };
  function open(week) {
    fast = false;
    $("#ws-in").innerHTML = `<header class="ws-hd"><div class="k">Sunday night · Week ${week} of ${WEEKS}</div><h1 id="ws-h"></h1><div class="s">Your weekly headline, written from what actually happened.</div></header>
      <div class="ws-body"><section class="ws-left" id="ws-left"></section>
        <section class="ws-right"><div class="ws-sec"><h2>YOUR ARMY REPORTS BACK</h2><span>each one real data, each one changes the map</span></div><div id="ws-cards" style="display:flex;flex-direction:column;gap:12px"></div><div class="wstrip" id="ws-strip"></div><div class="woffers" id="ws-offers"></div></section></div>
      <footer class="ws-ft" id="ws-ft"><div class="ws-skip" style="flex:1">Click anywhere to skip ahead</div></footer>`;
    const w = $("#weekshow"); w.hidden = false; w.scrollTop = 0;
    w.onclick = (e) => { if (!e.target.closest("button,.rc")) fast = true; };
    // receipts open the live call behind them
    $("#ws-in").onclick = (e) => { const r = e.target.closest("[data-rc]"); if (!r) return; const [id, city] = r.dataset.rc.split("|"), a = agentOf(id); const line = [...$$("#ops > div")].find((x) => x.textContent.includes(city) && (!a || x.textContent.includes(a.name))); if (line && !r.nextElementSibling?.classList?.contains("opsline")) r.insertAdjacentHTML("afterend", `<div class="lrc opsline" style="display:block;text-decoration:none">${esc(line.textContent)}</div>`); };
  }
  function waiting(on) { const c = $("#ws-cards"), w = $("#ws-wait"); if (on && !w) c.insertAdjacentHTML("beforeend", `<div class="lwait" id="ws-wait">Your army is working: live calls to Qloo, Wikipedia, Open-Meteo and the fan panel…</div>`); else if (!on) w?.remove(); }
  function loot(L) { const html = lootCard(L), w = $("#ws-wait"); if (w) w.insertAdjacentHTML("beforebegin", html); else $("#ws-cards").insertAdjacentHTML("beforeend", html); }
  async function battle(B) {
    if (B.loot) { loot(B.loot); Sound.play("conquer"); await wait(400); return; }
    const r = B.res, f = r.f, host = $("#ws-left"), id = "bc" + host.children.length;
    host.insertAdjacentHTML("beforeend", `<section class="bcard" id="${id}"><div class="bh"><h2>${esc(B.title)}</h2><span class="wstamp ${B.good ? "good" : "bad"}">${esc(B.stamp)}</span></div>
      <div class="bvs"><div class="bface" style="--fc:#af50ff">${avatar(G.player.image, G.player.name)}</div><div class="bmeter"><div class="t"><span>The crowd · 1,000 fans in the room</span><b class="pc">50% yours</b></div><div class="bar"><i></i></div></div><div class="bface" style="--fc:${f.col}">${avatar(f.img, f.name)}</div></div>
      <ol class="brounds">${r.rounds.map((x, i) => `<li><span><i>Round ${i + 1} · ${esc(x.k)}</i> · ${esc(x.say)}</span><span class="${x.s >= 0.5 ? "w" : "l"}">${x.s >= 0.5 ? "you" : esc(lastName(f.name))} +${Math.max(1, Math.round(Math.abs(x.s - 0.5) * 40))}</span></li>`).join("")}</ol>
      <div class="rline"><div class="bface" style="--fc:${f.col}">${avatar(f.img, f.name)}</div><div class="bub">“${esc(B.line)}”<div>${esc(B.note ?? "")}</div></div></div></section>`);
    const el = $("#" + id), pct = Math.round(r.share * 100); Sound.play("threat");
    await wait(60); el.querySelector(".bar i").style.width = pct + "%"; el.querySelector(".pc").textContent = `${pct}% yours`;
    for (const li of el.querySelectorAll(".brounds li")) { li.classList.add("on"); Sound.play("tick"); await wait(200); }
    if (fast || REDUCED) el.querySelectorAll(".brounds li").forEach((li) => li.classList.add("on"));
    await wait(300); el.querySelector(".wstamp").classList.add("on"); Sound.play(B.good ? "conquer" : "lost"); await wait(400);
  }
  function lost(city, f, fought) { $("#ws-left").insertAdjacentHTML("beforeend", `<section class="bcard"><div class="bh"><h2>BATTLE FOR ${esc(city.toUpperCase())}</h2><span class="wstamp bad on">LOST</span></div><div class="rline"><div class="bface" style="--fc:${f.col}">${avatar(f.img, f.name)}</div><div class="bub">“${esc(rivalLine(f, "won", { city }))}”<div>${fought ? "You fought and lost, and the siege ran out." : "You sent nobody."} ${esc(f.name)} takes ${esc(city)} and its tour stop.</div></div></div></section>`); Sound.play("lost"); }
  function rival(f, line, status, title) { $("#ws-left").insertAdjacentHTML("beforeend", `<section class="rcard"><h2>${esc(title)}</h2><div class="rline"><div class="bface" style="--fc:${f.col}">${avatar(f.img, f.name)}</div><div class="bub">“${esc(line)}”<div>${esc(status)}</div></div></div></section>`); }
  function event(ev, R) {
    $("#ws-left").insertAdjacentHTML("beforeend", `<section class="rcard ecard"><h2 style="color:#f0c46a">EVENT · ${esc(ev.title.toUpperCase())}</h2><div class="tx">${esc(ev.text)}</div><div class="chips2">${[ev.a, ev.b].map((x, i) => `<button class="chip2" data-ev="${i}">${esc(x[0])} <small>${esc(x[1])}</small></button>`).join("")}</div><div class="evnote">Both answers are free. Pick one before you give orders.</div></section>`);
    const card = $("#ws-left .ecard:last-of-type"); Sound.play("threat");
    const choose = (i) => { if (card.dataset.done) return; card.dataset.done = "1"; pending = null; const x = i ? ev.b : ev.a; x[2](); R.event.choice = x[0]; if (G.report) G.report.event = R.event; card.querySelectorAll("[data-ev]").forEach((b) => { b.disabled = true; b.classList.toggle("on", +b.dataset.ev === i); }); card.querySelector(".evnote").textContent = `You chose: ${x[0]} (${x[1]}).`; ops(`<span class="ok">event</span> ${esc(ev.title)} → ${esc(x[0])}`); hud(); };
    card.querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => choose(+b.dataset.ev)));
    pending = () => choose(0);
  }
  let pending = null;
  function banner(html) { $("#ws-left").insertAdjacentHTML("beforeend", `<div class="lvup">${html}</div>`); Sound.play("ageup"); }
  function strip(R) {
    const L = levelOf(G.xp), q = quest(), ripe = G.cities.filter((c) => !isHeld(c) && (c.state === "beachhead" || (c.state === "rival" && G.prep.has(c.name)))).length;
    $("#ws-strip").innerHTML = `<div><b>+<span data-to="${R.income.gold}">0</span></b><small>gold</small></div><div><b>+<span data-to="${R.xp.gained}">0</span></b><small>XP${L.next ? ` · ${L.toNext} to Lv ${L.next.roman}` : ""}</small></div><div><b class="ok">${q.have} / ${q.need}</b><small>${esc(q.unit)}</small></div><div><b class="vi">${ripe}</b><small>cit${ripe === 1 ? "y" : "ies"} ripe to take</small></div>`;
    $$("#ws-strip [data-to]").forEach((b) => (REDUCED || fast ? (b.textContent = (+b.dataset.to).toLocaleString()) : countTo(b, +b.dataset.to)));
  }
  function offers(list) {
    const el = $("#ws-offers"); if (!el) return;
    el.innerHTML = list.length ? `<h3>Offers for next week · 1 order each, gone after a week</h3>${list.map((o) => { const on = G.orderQueue.some((q) => q.offer === o.id); return `<div class="offer2"><span><b>${esc(o.title)}</b> · ${esc(o.text)} <em>${esc(o.reward)}</em></span><button class="chip2${on ? " on" : ""}" data-wclaim="${esc(o.id)}">${on ? "Claimed" : "Claim · 1 order"}</button></div>`; }).join("")}` : "";
    $$("#ws-offers [data-wclaim]").forEach((b) => (b.onclick = () => claimOffer(b.dataset.wclaim)));
  }
  function footer() {
    const moves = G.real.filter((m) => !m.done).slice(-3), over = G.week > WEEKS;
    $("#ws-ft").innerHTML = `<div class="rm"><div>Do it for real this week (unlocks +200 XP when ticked)</div>${moves.length ? moves.map((m, i) => `<div class="rmv" data-rm="${m.id}"><button title="I did this for real" aria-label="Mark done"></button><span>${i + 1}. ${esc(m.text)}</span></div>`).join("") : `<div class="rmv"><span>Nothing new: send a unit and its report becomes a real move.</span></div>`}</div>
      <div class="bt"><button class="ghost2" id="ws-peek">Peek: what winning looks like</button><button class="bigcta" id="ws-go">${over ? "SEE YOUR TOUR PACK" : `WEEK ${G.week} · GIVE ORDERS`}</button></div>`;
    $$("#ws-ft [data-rm]").forEach((r) => (r.querySelector("button").onclick = () => { markReal(r.dataset.rm); r.classList.add("done"); r.querySelector("button").textContent = "✓"; }));
    $("#ws-peek").onclick = () => victory(true);
    $("#ws-go").onclick = () => { close(); if (over) victory(); };
    $$("#ws-in [data-act]").forEach((b) => (b.onclick = () => { const k = b.dataset.act; close(); if (k === "xray") Drawer.open("xray"); else if (k === "tour") openTourFromQuest(); }));
    Coach.loot?.(null);
  }
  function close() { if (pending) { pending(); pending = null; toast("Event: we picked the first answer for you."); } $("#weekshow").hidden = true; renderPrimary(); }
  return { open, wait, waiting, loot, battle, lost, rival, banner, event, strip, offers, footer, close, headline: (t) => typeInto($("#ws-h"), t) };
})();

// END WEEK: everything you ordered happens, in this order: marches → jobs →
// your battles → sieges → rival attacks → income → XP and level → missions →
// offers → the headline. Then the week turns over.
async function endWeek() {
  if (!G || G.busy || G.over) return;
  G.busy = true; G.selected = null; G.pinned = null; $("#cityp").hidden = true; renderAgents(); Sound.play("week");
  const wk = G.week, xp0 = G.xp, lv0 = levelOf(G.xp), have0 = quest().have, held0 = new Set(heldNames()), real0 = G.real.length;
  const R = { week: wk, loot: [], battles: [], battle: null, rival: null, income: {}, xp: {}, quest: {}, missions: { completed: [] }, realMoves: [], offers: [], mapDiff: [] };
  G.hour = 164; G.showT = performance.now(); Show.open(wk); Coach.ended?.();
  ops(`<span class="rv">— END WEEK ${wk} —</span>`);
  const queue = G.orderQueue.splice(0);
  await Show.wait(300);
  // marches, then the real calls in parallel, revealed one at a time as they land
  const unitQ = queue.filter((o) => G.army.has(o.unitId) && cityOf(o.city));
  unitQ.forEach((o, i) => marchUnit(G.army.get(o.unitId), cityOf(o.city), i * 250));
  if (unitQ.length) Show.waiting(true);
  let chain = Promise.resolve();
  await Promise.all(unitQ.map(async (o, i) => {
    const u = G.army.get(o.unitId), c = cityOf(o.city), job = o.allin && o.unitId === "sponsor" ? allInPitch(o, c) : jobAt(o.unitId, c, o); // the live call runs while the unit marches
    await Show.wait(1200 + i * 250); arrive(u, c); u.state = "working";
    const L = await job; u.state = isHeld(c) ? "stationed" : "idle";
    R.loot.push(L);
    chain = chain.then(async () => { Show.loot(L); for (const x of L.extras ?? []) { R.loot.push(x); Show.loot(x); } Sound.play(L.empty ? "nope" : "potion"); MapView.relayer(); hud(); Coach.loot?.(L); await Show.wait(400); });
  }));
  await chain; Show.waiting(false);
  // your own orders: battles, groundwork; then claimed offers
  // a random event, built from live data: a decision, not a notification
  if (!G.tour && G.week < WEEKS && G.rng() < 0.4) { const ev = await randomEvent(); if (ev) { R.event = { title: ev.title }; Show.event(ev, R); await Show.wait(500); } }
  for (const o of queue.filter((o) => o.unitId === "you")) { const B = resolveYouOrder(o, R); if (B) { await Show.battle(B); hud(); } }
  for (const o of queue.filter((o) => o.unitId.startsWith("offer"))) { const L = applyOffer(o); if (L) { R.loot.push(L); Show.loot(L); await Show.wait(300); } }
  // sieges you left alone
  for (const sg of [...G.sieges]) {
    sg.left--; if (sg.left > 0) continue;
    const ct = cityOf(sg.city), f = G.fac.get(sg.fid); G.sieges = G.sieges.filter((s) => s !== sg);
    if (!ct || !f || sideOf(ct) !== "you") continue;
    fall(ct, f, R); Show.lost(ct.name, f, R.battles.some((b) => b.res?.city === ct.name)); hud(); await Show.wait(600);
  }
  // the rivals' armies arrive
  for (const it of G.intents) {
    const f = G.fac.get(it.fid), prey = cityOf(it.city); if (!f || !prey || f.allied) continue;
    if (G.forts.has(prey.name)) {
      f.last = `Bounced off ${prey.name}`; G.saved++; ach("wall"); R.battles.push({ xp: 60 }); R.held ??= { city: prey.name, rival: lastName(f.name), ripe: ripeName() };
      Show.rival(f, rivalLine(f, "bounced", { city: prey.name }), `${f.name}'s attack bounced off your walls · +60 XP`, `ATTACK ON ${prey.name.toUpperCase()} · REPELLED`); Sound.play("conquer"); await Show.wait(600); continue;
    }
    if (sideOf(prey) !== "you" || G.sieges.some((s) => s.city === prey.name)) continue;
    G.sieges.push({ city: prey.name, fid: f.id, left: 2 }); f.last = `Besieging ${prey.name}`; G.temp.push({ from: it.from, to: prey.p, col: f.col, t0: performance.now() });
    Show.rival(f, rivalLine(f, "siege", { city: prey.name, left: 2 }), `${prey.name} is under siege · 2 weeks to break it: send You to defend it`, `${prey.name.toUpperCase()} UNDER SIEGE`); Sound.play("threat"); await Show.wait(600);
  }
  // the other rivals, quietly (Full view's live calls)
  for (const f of G.fac.values()) {
    if (f.allied || G.intents.some((x) => x.fid === f.id)) continue;
    const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
    if (f.strategy === "ally" && G.rng() < 0.5) { f.last = `Open to a co-bill${theirs[0] ? ` in ${theirs[0].name}` : ""}`; ops(`<span class="ag">🕊️ ${esc(f.name)}</span> signals a co-bill`); }
    else { const where = theirs[(G.week + f.name.length) % Math.max(1, theirs.length)]?.name; f.last = where ? `Dug in at ${where}` : "Building an audience"; ops(`<span class="rv">🏴 ${esc(f.name)}</span> ${where ? `fortifies ${esc(where)}` : "builds an audience"}`); }
  }
  // income, XP, level, missions
  const gold = income(); G.gold += gold; R.income = { gold };
  const ticks = Math.min(2, G.realTicks ?? 0); G.realTicks = 0;
  const got = checkMissions();
  G.xp += R.loot.reduce((s, L) => s + (L.xp ?? 0), 0) + R.battles.reduce((s, b) => s + (b.xp ?? 0), 0) + ticks * 200 + got.length * 150;
  const lv1 = levelOf(G.xp); R.xp = { gained: G.xp - xp0, total: G.xp, level: lv1.name, levelUp: lv1.n > lv0.n };
  for (const m of got) { Show.banner(`MISSION COMPLETE<small>${esc(m.title)} · +150 XP</small>`); await Show.wait(400); }
  R.missions.completed = got.map((m) => m.title);
  if (R.xp.levelUp) { Show.banner(`LEVEL UP · LV ${lv1.roman} · ${esc(lv1.name.toUpperCase())}<small>${lv1.n === 3 ? "Every agent gets its second power: trend waves, festival nights, double deals, podcast tours, captions. +1 order a week." : lv1.n === 2 ? "Every unit gets a 4th target." : "Bigger rooms, bigger rivals."}</small>`); ach("rising"); await Show.wait(600); }
  // the week turns over
  G.week++; G.forts.clear(); G.hour = 60; G.showT = 0;
  if (G.wallsNext) { G.forts.add(G.wallsNext); G.wallsNext = null; }
  G.ordersLeft = ordersPerWeek(levelOf(G.xp).n, G.allies, G.bonusNext); G.bonusNext = 0; R.income.orders = G.ordersLeft;
  const q1 = quest(); R.quest = { have: q1.have, need: q1.need, unit: q1.unit };
  R.mapDiff = G.cities.filter((c) => held0.has(c.name) !== isHeld(c)).map((c) => ({ city: c.name, from: held0.has(c.name) ? "you" : "other", to: isHeld(c) ? "you" : sideOf(c) }));
  R.realMoves = G.real.slice(real0).map((m) => ({ id: m.id, title: m.text, detail: m.detail, xp: 200 }));
  G.offers = [...G.offersNext, ...buildOffers()].filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i).slice(0, 2); G.offersNext = []; R.offers = G.offers;
  if (G.week <= WEEKS) planIntents();
  const nem = nemesis(), nit = nem && G.intents.find((i) => i.fid === nem.id);
  if (nem) {
    const line = nit ? rivalLine(nem, "intent", { city: nit.city }) : rivalLine(nem, "retreat", { next: G.cities.find((c) => sideOf(c) === "you")?.name });
    R.rival = { name: nem.name, line, next: nit ? { city: nit.city, when: "next END WEEK" } : null };
    Show.rival(nem, line, nit ? `Marching on ${nit.city} · hits next END WEEK` : `${lastName(nem.name)} retreats to ${strikeCity(nem)?.name ?? "home ground"}`, `${nem.name.toUpperCase()} · NEXT WEEK`);
  }
  const stopL = R.loot.filter((L) => L.stopN).at(-1), spL = R.loot.find((L) => L.unit === "sponsor" && L.brand);
  const top = stripTags(R.loot.find((L) => !L.empty)?.fact ?? "").replace(/\.$/, "");
  R.headline = headlineFor({ you: shortName(), giant: G.giant && R.battle?.won && R.battle.rival === lastName(nemesis()?.name ?? ""), battle: R.battle?.rival === "nobody" ? null : R.battle, held: R.held, lost: R.lost, stop: stopL && q1.have > have0 ? { city: stopL.city, n: q1.have, m: q1.need } : null, sponsor: spL ? { brand: spL.brand, gold: spL.gold } : null, levelUp: R.xp.levelUp ? lv1.name : null, topFact: top ? (top.length > 80 ? top.slice(0, 79) + "…" : top) : null });
  G.headline = R.headline;
  G.report = JSON.parse(JSON.stringify({ ...R, battles: R.battles.filter((b) => b.res).map((b) => ({ city: b.res.city, rival: b.res.f.name, stamp: b.stamp, odds: Math.round(b.res.odds.p * 100), xp: b.xp })) }));
  Show.strip(R); await Show.wait(300); Show.headline(R.headline); Show.offers(G.offers); Show.footer();
  aiHeadline(R.headline, R);
  G.busy = false; hud(); renderAgents(); saveGame();
  if (G.week <= WEEKS) aiPlan();
}

// With the AI on, the Herald may rewrite the headline: under 90 characters, every proper noun kept
function aiHeadline(h, R) {
  const nouns = (h.match(/\b[A-Z][\w'.-]+/g) ?? []).slice(1), facts = R.loot.slice(0, 4).map((L) => stripTags(L.fact)).join(" ");
  aiWrite("headline", { headline: h, facts }, null).then((t) => {
    t = t?.trim().replace(/^["“]|["”]$/g, "");
    if (!t || t.length > 90 || !nouns.every((n) => t.includes(n)) || !G || G.headline !== h) return;
    G.headline = t; if (G.report) G.report.headline = t;
    if (!$("#weekshow").hidden && $("#ws-h")) typeInto($("#ws-h"), t);
  });
}
// ---------------------------------------------------------------- the win screen is the deliverable: your tour pack
// Also opens mid-game as a preview ("Peek: what winning looks like") with the empty cells greyed.
function drawPackMap(cv, slots) {
  if (!cv || !Atlas.nation) return;
  fit(cv, 2); const W = cv.width, H = cv.height, x = cv.getContext("2d"), d = cv._dpr || 1;
  const s = Math.min(W / MW, H / MH) * 0.92, ox = (W - MW * s) / 2, oy = (H - MH * s) / 2 - 20 * d, S = (p) => [ox + p[0] * s, oy + p[1] * s];
  x.clearRect(0, 0, W, H); x.save(); x.setTransform(s, 0, 0, s, ox, oy); const P = d3.geoPath(null, x);
  x.beginPath(); P(Atlas.nation); x.fillStyle = "#141827"; x.fill();
  for (const st of Atlas.states) { const g = G.gov.get(st.id); if (!g || !isHeld(g.city)) continue; x.beginPath(); P(st.f); x.globalAlpha = 0.35 * g.k; x.fillStyle = COL.you; x.fill(); }
  x.globalAlpha = 1; x.beginPath(); P(Atlas.inner); x.strokeStyle = "rgba(247,249,250,.08)"; x.lineWidth = 0.8 / s; x.stroke(); x.restore();
  const pts = slots.map((sl, i) => ({ i, c: sl.city && cityOf(sl.city) })).filter((p) => p.c);
  if (G.objective && G.objective !== "tour") x.strokeStyle = "transparent"; else x.strokeStyle = "#f0c46a";
  x.lineWidth = 3 * d; x.lineJoin = "round"; x.beginPath(); pts.forEach((p, k) => { const [X, Y] = S(p.c.p); k ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke();
  for (const p of pts) {
    const [X, Y] = S(p.c.p), on = G.objective && G.objective !== "tour" ? true : !!roomOf(p.c.name);
    x.fillStyle = on ? "#f0c46a" : "#262c40"; x.beginPath(); x.arc(X, Y, 15 * d, 0, 6.283); x.fill();
    x.fillStyle = on ? "#0b0d14" : "#9a9db3"; x.font = `900 ${13 * d}px Cinzel, serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(p.i + 1), X, Y + 1);
    x.fillStyle = "#e9e7f2"; x.font = `500 ${10 * d}px "Inter Tight", sans-serif`; x.fillText(p.c.name.toUpperCase(), X, Y + 26 * d);
  }
}
// great-circle miles between two metros
function miles(a, b) { const [lo1, la1] = METROS[a] ?? [0, 0], [lo2, la2] = METROS[b] ?? [0, 0], r = Math.PI / 180, h = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2; return 3959 * 2 * Math.asin(Math.sqrt(h)); }
// The other three objectives' packs: the same screen, their own table (§12, P1)
function packFor(obj, preview, won) {
  const pl = (n, a, b = a + "s") => `${n} ${n === 1 ? a : b}`, dash = "—";
  const row = (n, on, cells) => `<div class="vp-row${on ? "" : " empty"}" style="grid-template-columns:36px repeat(${cells.length},minmax(0,1fr))"><span class="n">${n}</span>${cells.map((c) => `<span class="c">${c}</span>`).join("")}</div>`;
  const head = (cols) => `<div class="vp-row hd" style="grid-template-columns:36px repeat(${cols.length},minmax(0,1fr))"><span>#</span>${cols.map((c) => `<span>${c}</span>`).join("")}</div>`;
  if (obj.id === "sponsor") {
    const n = G.sponsors.length, gold = G.sponsors.reduce((s, x) => s + x.perWeek, 0);
    const rows = Array.from({ length: Math.max(3, n) }, (_, i) => i).map((i) => { const sp = G.sponsors[i], p = sp && G.sponsorPitches.find((x) => x.brand === sp.name); return sp ? row(i + 1, true, [`<strong>${esc(sp.name)}</strong><br><small>${sp.aff ? `${sp.aff}% affinity (Qloo)` : "Qloo brands your fans love"}</small>`, esc(sp.city ?? dash), `+${sp.perWeek} gold/wk`, p ? "pitch drafted" : dash, G.posts.has(sp.city) ? "post drafted" : dash]) : row(i + 1, false, [`<strong>Sponsor ${i + 1}</strong><br><small>send the Sponsor scout to a city you hold</small>`, dash, dash, dash, dash]); }).join("");
    return { title: preview ? "WHAT WINNING LOOKS LIKE" : won ? "YOUR SPONSORS ARE SIGNED" : `YOUR SPONSORS: ${Math.min(3, n)} OF 3`, table: head(["Brand", "City", "Pays", "Pitch (Sponsor scout)", "Post (Room reader)"]) + rows,
      summary: `${pl(n, "sponsor")} · +${gold} gold a week · ${G.proven ? "crowd proven: a 4+ rating" : "crowd not proven yet: send the Room reader"}`, cities: G.sponsors.map((s) => s.city).filter(Boolean), have: Math.min(3, n), need: 3 };
  }
  if (obj.id === "city") {
    const c = G.objCity, ct = cityOf(c), r = roomOf(c), night = G.nights.find((x) => x.city === c), dm = G.dms.find((d) => d.yes && d.city === c) ?? G.dms.find((d) => d.yes), gs = G.guestSpots.find((g) => g.city === c) ?? G.guestSpots[0];
    const parts = [["Held", ct && sideOf(ct) === "you", ct && sideOf(ct) === "you" ? `${esc(c)} is yours · ${kfmt(ct.you)} fans (Qloo)` : `take ${esc(c)}: Room reader, then You`],
      ["Room", !!r, r ? `${esc(r.venue)} · ${r.fit}% crowd fit` : "send the Booker"],
      ["Local voice", !!(dm || gs), dm ? `${esc(dm.name)} (said yes) · DM ready` : gs ? `${esc(gs.name)} guest spot · pitch ready` : "send the Diplomat or the Herald"],
      ["Night", !!night, night ? esc(shortDay(night.date)) : "book a room or send the Weather oracle"]];
    const have = parts.filter((p) => p[1]).length;
    return { title: preview ? "WHAT WINNING LOOKS LIKE" : won ? `${String(c).toUpperCase()} IS YOURS` : `${String(c ?? "YOUR CITY").toUpperCase()}: ${have} OF 4`, table: head(["Part", "What you have"]) + parts.map((p, i) => row(i + 1, p[1], [`<strong>${p[0]}</strong>`, p[2]])).join(""),
      summary: `${esc(c ?? "No city picked")}${ct ? ` · ${kfmt(ct.you)} fans · rated ${ct.mean ?? "?"}/5 by its simulated fans` : ""}`, cities: c ? [c] : [], have, need: 4, brief: c };
  }
  const acc = G.allies + G.guestSpots.length;
  const rows = [0, 1, 2, 3, 4].map((i) => { const d = G.dms[i]; return d ? row(i + 1, d.yes, [`<strong>${esc(d.name)}</strong><br><small>${esc(d.city ?? "")}</small>`, d.yes ? "accepted" : "DM drafted · send it", `<small>${esc(d.text.slice(0, 110))}${d.text.length > 110 ? "…" : ""}</small>`]) : row(i + 1, false, [`<strong>DM ${i + 1}</strong><br><small>send the Diplomat</small>`, dash, dash]); }).join("");
  const pods = G.guestSpots.map((g, i) => row(i + 1, true, [`<strong>${esc(g.name)}</strong><br><small>podcast · ${esc(g.city)}</small>`, "guest spot", `<small>${g.aff ? `${g.aff}% of your fans' taste neighbours listen (Qloo)` : "pitch ready"}</small>`])).join("");
  return { title: preview ? "WHAT WINNING LOOKS LIKE" : won ? "YOUR CALENDAR IS FULL" : `YOUR CALENDAR: ${Math.min(3, acc)} OF 3 ACCEPTED`, table: head(["Act", "Status", "The DM"]) + rows + (pods ? head(["Podcast", "Status", "Why"]) + pods : ""),
    summary: `${pl(G.dms.length, "DM")} offered · ${pl(acc, "yes", "yeses")} · ${pl(G.guestSpots.length, "podcast")}`, cities: G.dms.map((d) => d.city).filter(Boolean), have: Math.min(3, acc), need: 3 };
}
function victory(preview = false) {
  if (!G) return;
  if (!preview) { if (G.over) return; G.over = true; renderAgents(); }
  const f = questFacts(), tq = questState({ ...f, objective: "tour" }), q = quest(), obj = objectiveOf(G.objective), L = levelOf(G.xp), have = tq.have, won = !preview && q.won;
  const title = preview ? "WHAT WINNING LOOKS LIKE" : won ? (obj.id === "tour" ? "YOUR TOUR IS BOOKED" : `QUEST COMPLETE · ${obj.title.toUpperCase()}`) : G.realDone >= 5 ? "GROUNDWORK DONE" : `YOUR TOUR: ${have} OF 6 STOPS`;
  const sub = preview ? "Your pack so far. Every grey row is a stop your army can still fill." : "Every stop below came from an order you gave. This is the thing you played for: a plan your manager would have taken a month to make, with the emails already written.";
  const rows = tq.slots.map((s, i) => {
    if (!s.city) return `<div class="vp-row empty"><span class="n">${i + 1}</span><span><strong>Stop ${i + 1}</strong><br><small>take a city, then send the Booker</small></span><span>—</span><span>—</span><span>—</span><span>—</span></div>`;
    const r = roomOf(s.city), n = G.nights.find((x) => x.city === s.city && x.venue) ?? G.nights.find((x) => x.city === s.city);
    const opener = G.dms.find((dm) => dm.yes && dm.city === s.city)?.name ?? [...G.fac.values()].find((x) => x.allied && x.plan.city === s.city)?.name ?? null, sp = G.sponsors.find((x) => x.city === s.city);
    return `<div class="vp-row${r ? "" : " empty"}"><span class="n">${i + 1}</span><span title="${esc(n?.why ?? "")}"><strong>${esc(s.city)}</strong><br><small>${n ? esc(shortDay(n.date)) : "no night yet"}</small></span><span title="Qloo places × ${esc(s.city)}">${r ? `${esc(r.venue)}<br><span class="fit">${r.fit}% crowd fit</span>` : "— <small>send the Booker</small>"}</span><span class="c" title="Qloo taste overlap">${opener ? esc(opener) : "—"}</span><span class="c" title="Qloo brands your fans love">${sp ? `${esc(sp.name)} · +${sp.perWeek}/wk` : "—"}</span><span class="c" title="Room reader, Lv III (Qloo tags)">${G.posts.has(s.city) ? "drafted" : "—"}</span></div>`;
  }).join("");
  const stops = tq.slots.filter((s) => s.city && roomOf(s.city)).map((s) => s.city), legs = stops.slice(1).map((c, i) => miles(stops[i], c));
  const dates = stops.map((c) => roomOf(c).date).sort(), md = (iso) => shortDay(iso).replace(/^\w+,? /, "");
  const summary = stops.length ? `${dates.length ? `${md(dates[0])} – ${md(dates.at(-1))} · ` : ""}${Math.round(legs.reduce((a, b) => a + b, 0)).toLocaleString()} miles · ${legs.filter((m) => m > 500).length} fly leg${legs.filter((m) => m > 500).length === 1 ? "" : "s"} · ${stops.length} night${stops.length === 1 ? "" : "s"}` : "No stops booked yet";
  const allyNames = [...G.fac.values()].filter((x) => x.allied).map((x) => x.name), pl = (n, a, b = a + "s") => `${n} ${n === 1 ? a : b}`;
  const camp = `${pl(G.taken, "city", "cities")} taken · ${pl(G.saved, "attack")} held · ${pl(G.allies, "ally", "allies")}${allyNames.length ? ` (${allyNames.slice(0, 2).join(", ")})` : ""} · ${pl(G.sponsors.length, "sponsor")} · ${pl(G.realDone, "real move")} done`;
  const nIcs = G.nights.length;
  const pk = obj.id === "tour" ? null : packFor(obj, preview, won), bc = pk ? [...new Set(pk.cities)].filter((c) => METROS[c]).slice(0, 6) : stops;
  $("#vpack").innerHTML = `<header class="vp-hd"><div class="k">Week ${Math.min(G.week, WEEKS)} of ${WEEKS} · Lv ${L.roman} ${esc(L.name)} reached · ${pk ? `${pk.have} of ${pk.need} · ${esc(obj.title)}` : `${have} of 6 stops booked`}</div><h1>${esc(pk && !preview ? pk.title : title)}</h1><p>${esc(sub)}</p></header>
    <div class="vp-body"><section class="vp-map" aria-label="${pk ? "Your map" : "Tour route"}"><canvas id="vp-cv"></canvas><div class="sum">${pk ? pk.summary : esc(summary)}</div><div class="camp"><strong>Campaign:</strong> ${esc(camp)}</div></section>
      <section class="vp-stops" aria-label="Your pack">${pk ? pk.table : `<div class="vp-row hd"><span>#</span><span>City · night</span><span>Room (Booker)</span><span>Opener (Diplomat)</span><span>Sponsor (Sponsor scout)</span><span>Post (Room reader)</span></div>${rows}`}<div class="vp-note">Every cell has a receipt (hover it): Qloo places and brands, Open-Meteo, the fan panel. Fan counts and fits are real; opener and sponsor replies are up to you.</div></section></div>
    <footer class="vp-ft"><div><button class="vbtn" id="vp-ics" ${nIcs ? "" : "disabled title=\"Book a room or send the Weather oracle first\""}>Calendar (.ics, ${pl(nIcs, "night")})</button><button class="vbtn" id="vp-briefs" ${bc.length && G.cid ? "" : "disabled"}>${pl(bc.length, "City Brief")} (PDF)</button><button class="vbtn" id="vp-assets">${pl(G.venueMails.length, "venue email")} · ${pl(G.sponsorPitches.length, "sponsor pitch", "sponsor pitches")} · ${pl(G.dms.length, "DM")}</button>${have >= 4 ? `<button class="vbtn" id="vp-tour">Tour Planner: route it</button>` : ""}<button class="vbtn" id="vp-share">Share card</button></div>
      <div>${preview ? `<button class="bigcta" id="vp-back">BACK TO THE WEEK</button>` : `<button class="ghost2" id="vp-map">Examine the map</button><button class="bigcta gold" id="vp-new">NEW CAMPAIGN · LV ${L.roman}</button>`}</div></footer>`;
  $("#victory").hidden = false; $("#victory").scrollTop = 0; Sound.play(preview ? "select" : won ? "victory" : "week");
  requestAnimationFrame(() => drawPackMap($("#vp-cv"), pk ? pk.cities.map((c) => ({ city: c })) : tq.slots));
  $("#vp-ics").onclick = downloadIcs;
  $("#vp-briefs").onclick = async (e) => { const b = e.currentTarget; b.disabled = true; let n = 0; for (const c of bc) { b.textContent = `${c}… (${++n}/${bc.length})`; await post("/api/brief", { campaignId: G.cid, city: c }, 60000); } b.textContent = "Briefs ready"; b.disabled = false; openDoc(`/briefs/${encodeURIComponent(G.cid)}`, "City Briefs"); };
  $("#vp-assets").onclick = openAssets;
  $("#vp-tour")?.addEventListener("click", () => { $("#victory").hidden = true; Show.close(); openTourFromQuest(); });
  $("#vp-share").onclick = () => openShare();
  $("#vp-back")?.addEventListener("click", () => { $("#victory").hidden = true; });
  $("#vp-map")?.addEventListener("click", () => { $("#victory").hidden = true; });
  $("#vp-new")?.addEventListener("click", () => { const xp = G.xp; $("#victory").hidden = true; startGame(G.c, G.player, { fresh: true, xp }); });
  if (!preview) { ops(`<span class="ok">campaign complete</span> · ${have} of 6 stops · ${G.xp} XP`); saveGame(); }
}

function battlePlan() {
  const c = G.c;
  return [`Conquest battle plan for ${G.player.name}`, `Ground held at start: ${G.start}%. With every order: ${c.projected}% (projected).`, "",
    ...c.missions.map((o, i) => `${i + 1}. ${o.title}: ${o.detail} [${o.receipt}]`), "",
    ...[...G.intel.entries()].flatMap(([city, ts]) => ts.map((t) => `${city}: ${t}`)),
    ...G.sponsors.map((s) => `Sponsor to pitch: ${s.name}`),
    ...G.drafts.map((d) => `Draft post: ${d}`),
    G.potions.length ? `Trending now: ${G.potions.map((p) => `${p.title} (${p.where})`).join(", ")}` : ""].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- the war room's controls
$("#endweek").addEventListener("click", () => {
  if (!G || G.busy || G.over) return;
  const b = $("#endweek");
  if (!G.orderQueue.length && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Send nobody? Your rivals still move · End anyway"; setTimeout(() => { delete b.dataset.sure; renderAgents(); }, 4000); return; }
  delete b.dataset.sure; endWeek();
});
$("#quest").addEventListener("click", () => (Drawer.mode === "missions" ? Drawer.close() : Drawer.open("missions")));
$("#more-btn").addEventListener("click", (e) => { e.stopPropagation(); const m = $("#more-menu"); m.hidden = !m.hidden; $("#more-btn").setAttribute("aria-expanded", String(!m.hidden)); });
addEventListener("click", (e) => { if (!e.target.closest(".morew")) $("#more-menu").hidden = true; });
$("#more-menu").addEventListener("click", (e) => { if (e.target.closest("button")) $("#more-menu").hidden = true; });
$("#sound").addEventListener("click", () => { $("#sound").textContent = `Sound: ${Sound.toggle() ? "on" : "off"}`; });
$("#exit").addEventListener("click", toSite);
// Simple view is the default (three colours, the army rail); Full view adds the radar, the brain, live calls and every rival
function setView(full, remember) { document.body.classList.toggle("simple", !full); $("#view-btn").textContent = full ? "Simple view" : "Full view"; if (remember) try { localStorage.setItem("conquest-view3", full ? "full" : "simple"); } catch {} if (G) { hud(); renderAgents(); MapView.relayer?.(); } }
$("#view-btn").addEventListener("click", () => setView(document.body.classList.contains("simple"), true));
{ let v = "simple"; try { v = localStorage.getItem("conquest-view3") || "simple"; } catch {} setView(v === "full" && !new URLSearchParams(location.search).has("tour")); }
$("#share-btn").addEventListener("click", () => openShare());
$("#xray-btn").addEventListener("click", () => (Drawer.mode === "xray" ? Drawer.close() : Drawer.open("xray")));
$("#tour-btn").addEventListener("click", () => (Drawer.mode === "tour" ? Drawer.close() : Drawer.open("tour")));
$("#radar-btn").addEventListener("click", () => (Drawer.mode === "radar" ? Drawer.close() : Drawer.open("radar")));
// closed panels open on click; the brain opens the X-ray once it's open
$("#slot-brain").addEventListener("click", (e) => { const sec = $("#slot-brain"); if (!sec.classList.contains("open")) { sec.classList.add("open"); return; } if (e.target.closest(".stitle")) { sec.classList.remove("open"); return; } Drawer.open("xray"); });
$$("[data-tour]").forEach((b) => b.addEventListener("click", runTour));
$("#cmd-btn").addEventListener("click", () => (Drawer.mode === "intel" ? Drawer.close() : Drawer.open("intel")));
$("#plan-btn").addEventListener("click", () => (Drawer.mode === "moves" ? Drawer.close() : Drawer.open("moves")));
$("#drawer-x").addEventListener("click", () => Drawer.close());
$("#help").addEventListener("click", () => { try { localStorage.removeItem("conquest-coached"); } catch {} Coach.start(); });
$("#ops-toggle").addEventListener("click", () => { const p = $("#p-ops"); p.classList.toggle("collapsed"); $("#ops-toggle").setAttribute("aria-expanded", String(!p.classList.contains("collapsed"))); });
document.body.appendChild($("#coach")); // above the END WEEK show, for the coach's last step

// ---------------------------------------------------------------- the first 60 seconds
// Four beats: the quest bar, one Booker order, END WEEK, and the first loot card inside the show.
const Coach = (() => {
  let step = -1, dim = null, spotEl = null, waitLoot = false;
  const STEPS = [
    { spot: "#quest", go: "Continue", t: () => ((G.objective ?? "tour") === "tour" ? "This is what you're playing for: a 6-stop tour. Every slot you fill here is a real date." : `This is what you're playing for: ${objectiveOf(G.objective).title.toLowerCase()}. Every slot you fill here is real.`) },
    { spot: "#army-rail", go: "Continue", enter: () => selectUnit("booker", true), t: () => { const o = G.orderQueue.find((x) => x.unitId === "booker"), c = chipsFor("booker")[0]; return o ? `Your army does the work. The Booker is ordered to ${o.city}: a real venue with a real crowd fit. Every unit works the same way: click it, then a place (or drag it onto the map).` : `Your army does the work. The Booker finds a room${c ? ` in ${c.city}` : ""}: real venue, real crowd fit. Click its first chip, or drag the Booker onto a city.`; } },
    { spot: "#endweek", go: "Continue", t: () => "Nothing moves until you press END WEEK. Then your army marches, makes its live calls and comes back with loot. Press it now, or after your other orders." },
    { spot: null, go: "Play", t: (L) => (L === undefined ? "Each END WEEK brings back a report card per unit: a real fact, its receipt, and what it did for your quest. Three orders a week. Go." : L && !L.empty && L.questChange ? `That's real data, and it just did this for your quest: ${L.questChange}. Three orders a week. Go.` : "That's real data from your army. Three orders a week. Go.") },
  ];
  function clear() { spotEl?.classList.remove("spot"); spotEl = null; }
  function show(arg) {
    clear(); const s = STEPS[step]; s.enter?.();
    $("#coach-step").textContent = `Step ${step + 1} of ${STEPS.length}`; $("#coach-t").textContent = s.t(arg);
    $("#coach-go").hidden = !s.go; $("#coach-go").textContent = s.go ?? ""; $("#coach").hidden = false;
    spotEl = s.spot ? $(s.spot) : null; spotEl?.classList.add("spot");
    if (s.spot && !dim) { dim = document.createElement("div"); dim.className = "coachdim"; $("#game").appendChild(dim); }
    if (!s.spot) { dim?.remove(); dim = null; }
  }
  function end() { clear(); dim?.remove(); dim = null; $("#coach").hidden = true; step = -1; waitLoot = false; if (G) G.coach = false; try { localStorage.setItem("conquest-coached", "1"); } catch {} }
  function next(arg) { step++; if (step >= STEPS.length) return end(); show(arg); }
  $("#coach-go").addEventListener("click", () => next(undefined));
  $("#coach-skip").addEventListener("click", end);
  return {
    start() { if (!G || G.over) return; G.coach = true; step = -1; Drawer.close(); next(); },
    ordered(id) { if (step === 1 && id === "booker") next(); },
    // END WEEK pressed before the last beat: that beat waits for the first loot card, inside the show
    ended() { if (step < 0) return; if (step >= 3) return end(); clear(); dim?.remove(); dim = null; $("#coach").hidden = true; waitLoot = true; step = 2; },
    loot(L) { if (!waitLoot) return; waitLoot = false; next(L); },
  };
})();
addEventListener("keydown", (e) => {
  if (!G || $("#game").hidden || G.modal || !$("#weekshow").hidden || e.target.closest("input,textarea,select")) return;
  if (e.key === "Escape") { G.selected = null; renderAgents(); }
  const k = HOTKEYS.indexOf(e.key); if (k >= 0) $$("#army-list .urow")[k]?.click();
});
function toSite() { $("#game").hidden = true; $("#scan").hidden = true; $("#site").hidden = false; Field.setMode("site"); Neuro.reset(); if (G) G.over = true; }



// ---------------------------------------------------------------- the landing page
// Midnight-terminal story: a twilight sky with a campaign pass, three eras of
// growth on a flight line, the product in a frame, the army as stamped rows.
const AGENT_LONG = {
  scout: "Reads Qloo for the brands, shows and artists your fans in a city also love, so you can talk to that room.",
  booker: "Finds the stage in that city whose crowd fits yours best, with a backup, straight from Qloo's places.",
  diplomat: "Picks the performer whose crowd is new to you but already likes you, then writes the pitch and runs the parley.",
  sponsor: "Finds brands your fans over-index on and turns them into sponsors who pay you every week.",
  herald: "Finds the podcasts your fans already listen to, so your next guest spot lands with the right ears.",
  reader: "Shows how real simulated fans in a city react to your material, one by one, with the brain response.",
};
$("#armygrid").innerHTML = AGENTS.map((a) => `<div class="arow"><div><h3><span class="aface emo" style="${agentGrad(a.id)}">${a.icon}</span>${a.name}</h3><button class="go2" data-play><i>→</i> Deploy in the war room</button></div><div><p>${AGENT_LONG[a.id] ?? a.role}</p><span class="src">${a.src.toUpperCase()} · LIVE</span></div></div>`).join("");
$$("#armygrid [data-play]").forEach((b) => b.addEventListener("click", () => openWho()));

// twinkling stars in the upper sky
const Stars = (() => {
  const cv = $("#stars"), ctx = cv.getContext("2d"), rnd = mulberry(3);
  const pts = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.1, p: rnd() * 6.28 }));
  function frame(now) {
    if ($("#site").hidden || cv.getBoundingClientRect().bottom < 0) return;
    fit(cv, 2); const W = cv.width, H = cv.height, d = cv._dpr || 1; ctx.clearRect(0, 0, W, H);
    for (const s of pts) { ctx.globalAlpha = (0.35 + 0.65 * Math.abs(Math.sin(now / 1400 + s.p))) * (1 - s.y * 0.8); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * d, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  return { frame };
})();

// text set around a slowly turning circle
function ringText(el) {
  const t = el.dataset.text, n = t.length;
  el.innerHTML = [...t].map((ch, i) => `<span style="transform:rotate(${(i / n) * 360}deg)">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");
}
$$(".ring").forEach(ringText);
{ const g = $(".globe"); const r = document.createElement("div"); r.className = "ring sm"; r.dataset.text = "SCOUTING FANS · TESTING MATERIAL · TAKING CITIES · "; g.appendChild(r); ringText(r); }

// wireframe globe for Era 3
const Globe = (() => {
  const cv = $("#globe"), ctx = cv.getContext("2d");
  function frame(now) {
    const rc = cv.getBoundingClientRect(); if ($("#site").hidden || rc.bottom < 0 || rc.top > innerHeight) return;
    fit(cv, 2); const W = cv.width, H = cv.height, d = cv._dpr || 1, R = Math.min(W, H) * 0.36, cx = W / 2, cy = H / 2, rot = now / 6000, tilt = 0.35;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R); g.addColorStop(0, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(175,80,255,.06)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    const P = (lat, lon) => { const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot); const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt); return [cx + x * R, cy - y2 * R, z2]; };
    ctx.lineWidth = 1.1 * d;
    const line = (pts) => { for (let i = 1; i < pts.length; i++) { const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i]; ctx.strokeStyle = `rgba(247,249,250,${z0 > 0 && z1 > 0 ? 0.85 : 0.14})`; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); } };
    for (let la = -75; la <= 75; la += 15) line(Array.from({ length: 73 }, (_, i) => P((la * Math.PI) / 180, (i * 5 * Math.PI) / 180)));
    for (let lo = 0; lo < 360; lo += 20) line(Array.from({ length: 37 }, (_, i) => P(((i * 5 - 90) * Math.PI) / 180, (lo * Math.PI) / 180)));
    // a few cities lighting up violet
    for (const [la, lo] of [[33.7, -84.4], [41.9, -87.6], [40.7, -74], [34.1, -118.2], [35.1, -90]]) { const [x, y, z] = P((la * Math.PI) / 180, (lo * Math.PI) / 180); if (z <= 0) continue; ctx.fillStyle = "#c27aff"; ctx.shadowColor = "#af50ff"; ctx.shadowBlur = 14 * d; ctx.beginPath(); ctx.arc(x, y, 4 * d, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
  }
  return { frame };
})();

// the flight line advances as you scroll the story; the era markers follow
const Story = (() => {
  const story = $("#story"), eras = $$(".era"), nav = $(".eras"), marks = $$(".eras span");
  function frame() {
    if ($("#site").hidden) return;
    const r = story.getBoundingClientRect(), H = innerHeight, p = clamp01((H * 0.5 - r.top) / Math.max(1, r.height - H * 0.5));
    story.style.setProperty("--p", `${8 + p * 82}%`);
    nav.classList.toggle("show", r.top < H * 0.4 && r.bottom > H * 0.6);
    let cur = "1"; for (const e of eras) { const b = e.getBoundingClientRect(); if (b.top < H * 0.55) cur = e.dataset.era; }
    marks.forEach((m) => m.classList.toggle("on", m.dataset.era === cur));
  }
  return { frame };
})();

// the product frame's live-calls feed (sample lines in the shape the real feed takes)
const Feed = (() => {
  const LINES = [
    ["🎟️ Booker @ Memphis", "Classic Hitz · 89% crowd fit", "QLOO"], ["🕵️ Spy", "Regina King fame ▲18% this month", "WIKIPEDIA"], ["📈 Trend hunter @ TN", "3 rising searches → new potions", "TRENDS"],
    ["🌦️ Weather oracle @ Memphis", "Play Friday · 0% rain", "OPEN-METEO"], ["⚔ Anthony Anderson", "marching on Atlanta · Sun", "RADAR"], ["💼 Sponsor scout", "Cadillac signs on · +58 gold/wk", "QLOO"],
    ["🎭 Room reader @ Chicago", "F 45–54, into Faith Evans → ★★★★★", "PANEL"], ["🕊️ Diplomat", "Larenz Tate · barter 46/100 · pitch drafted", "QLOO"],
  ];
  let i = 0, t = 0, n = 62;
  function frame(now) {
    if ($("#site").hidden || now - t < 1800) return; t = now;
    const box = $("#pfeed"); if (!box || box.getBoundingClientRect().top > innerHeight) return;
    const [who, what, tag] = LINES[i++ % LINES.length], el = document.createElement("div");
    el.innerHTML = `<small>${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</small>${esc(who)}<span class="tg">${tag}</span><br><span style="color:#d9dce0">${esc(what)}</span>`;
    box.prepend(el); while (box.children.length > 6) box.lastChild.remove();
    $("#ps-n").textContent = ++n;
  }
  return { frame };
})();

// a real live trend in the corner, and live-looking coordinates in the footer
setTimeout(async () => {
  const r = await api("/api/trends?geo=US").catch(() => null), it = r?.items?.[0];
  if (!it || $("#site").hidden) return;
  $("#lt-text").textContent = `Live now: “${it.title}” is trending on Google in the US. Your Trend hunter turns that into buzz →`;
  $("#livetoast").hidden = false;
}, 2500);
$("#lt-x").addEventListener("click", (e) => { e.stopPropagation(); $("#livetoast").hidden = true; });
$("#livetoast").addEventListener("click", () => { $("#livetoast").hidden = true; openWho(); });
{
  const cities = Object.entries(METROS); let k = 0, base = cities[0][1], j = [0, 0];
  setInterval(() => {
    if ($("#site").hidden) return;
    if (Math.random() < 0.06) base = cities[(k = (k + 1) % cities.length)][1];
    j = [j[0] + (Math.random() - 0.5) * 0.004, j[1] + (Math.random() - 0.5) * 0.004];
    const lat = base[1] + j[1], lon = base[0] + j[0];
    $("#coords").textContent = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${lon.toFixed(4)}° ${lon < 0 ? "W" : "E"}`;
  }, 120);
}

const HeroMap = (() => {
  const cv = $("#heromap"), ctx = cv.getContext("2d");
  const FAC = { you: "#af50ff", r1: "#ff5c7a", r2: "#f5b544", r3: "#38d8ff" };
  const SEEDS = [["you", "Atlanta"], ["r1", "New York"], ["r2", "Los Angeles"], ["r3", "Minneapolis"], ["you", "Chicago"]];
  let st = null, own = new Map(), fx = [], units = [], nextT = 0, flips = 0, T = { s: 1, ox: 0, oy: 0 }, d = 1;
  const toS = ([x, y]) => [T.ox + x * T.s, T.oy + y * T.s];
  function reset() {
    own = new Map(); flips = 0;
    const seeds = SEEDS.map(([f, c]) => ({ f, p: ALB(METROS[c]) }));
    for (const s of st) {
      if (["AK", "HI", "PR"].includes(s.code)) continue;
      const n = seeds.map((x) => ({ ...x, d: Math.hypot(x.p[0] - s.c[0], x.p[1] - s.c[1]) })).sort((a, b) => a.d - b.d)[0];
      own.set(s.id, n.d < (n.f === "you" ? 120 : 170) ? n.f : null);
    }
  }
  function flip(now) {
    const mine = st.filter((s) => own.get(s.id) === "you");
    const cand = st.filter((s) => own.has(s.id) && own.get(s.id) !== "you").map((s) => ({ s, d: Math.min(...mine.map((m) => Math.hypot(m.c[0] - s.c[0], m.c[1] - s.c[1]))) })).filter((x) => x.d < 190).sort((a, b) => a.d - b.d);
    if (!cand.length || flips > 16) { reset(); return; }
    const pickS = cand[Math.floor(Math.random() * Math.min(3, cand.length))].s, from = mine.sort((a, b) => Math.hypot(a.c[0] - pickS.c[0], a.c[1] - pickS.c[1]) - Math.hypot(b.c[0] - pickS.c[0], b.c[1] - pickS.c[1]))[0];
    const wasRival = own.get(pickS.id);
    units.push({ from: from.c, to: pickS.c, t0: now, ik: ["ticket", "scout", "dove", "trend", "case"][flips % 5] });
    setTimeout(() => { own.set(pickS.id, "you"); fx.push({ p: pickS.c, t0: performance.now(), text: wasRival ? "taken" : `+${3 + Math.floor(Math.random() * 9)}%` }); const c = $("#ps-c"); if (c) c.textContent = `${Math.min(99, 36 + flips * 3)}%`; }, 1400);
    flips++;
  }
  function frame(now) {
    if (!Atlas.topo || $("#site").hidden) return;
    const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    if (!st) { st = Atlas.states; reset(); }
    fit(cv, 2); d = cv._dpr || 1; const W = cv.width, H = cv.height, s = Math.min(W / MW, H / MH) * 0.98; T = { s, ox: (W - MW * s) / 2, oy: (H - MH * s) / 2 };
    if (now > nextT) { nextT = now + 1900; flip(now); }
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.setTransform(s, 0, 0, s, T.ox, T.oy); const P = d3.geoPath(null, ctx);
    ctx.beginPath(); P(Atlas.nation); ctx.shadowColor = "rgba(175,80,255,.55)"; ctx.shadowBlur = 24 * d; ctx.fillStyle = "#121117"; ctx.fill(); ctx.shadowBlur = 0;
    for (const x of st) {
      const f = own.get(x.id); if (!f) continue;
      ctx.beginPath(); P(x.f); ctx.globalAlpha = f === "you" ? 0.62 : 0.32; ctx.fillStyle = FAC[f]; ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = FAC[f]; ctx.lineWidth = (1.1 * d) / s; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.beginPath(); P(Atlas.inner); ctx.strokeStyle = "rgba(247,249,250,.1)"; ctx.lineWidth = (0.6 * d) / s; ctx.stroke();
    ctx.restore();
    const [CX, CY] = toS(ALB(METROS.Atlanta)), beam = -(now / 1000) * 1.2;
    if (ctx.createConicGradient && !REDUCED) { const g = ctx.createConicGradient(beam, CX, CY); g.addColorStop(0, "rgba(225,189,255,.28)"); g.addColorStop(0.08, "rgba(225,189,255,.03)"); g.addColorStop(0.12, "rgba(225,189,255,0)"); g.addColorStop(1, "rgba(225,189,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 360 * s, 0, 6.283); ctx.fill(); }
    const ny = toS(ALB(METROS["New York"])), atl = [CX, CY], k = (now % 5000) / 5000, mx = (ny[0] + atl[0]) / 2 + 60 * d, my = (ny[1] + atl[1]) / 2;
    ctx.save(); ctx.strokeStyle = "#ff5c7a"; ctx.lineWidth = 2 * d; ctx.setLineDash([8 * d, 7 * d]); ctx.lineDashOffset = -now / 25;
    ctx.beginPath(); ctx.moveTo(ny[0], ny[1]); ctx.quadraticCurveTo(mx, my, atl[0], atl[1]); ctx.stroke(); ctx.restore();
    const ex = (1 - k) * (1 - k) * ny[0] + 2 * (1 - k) * k * mx + k * k * atl[0], ey = (1 - k) * (1 - k) * ny[1] + 2 * (1 - k) * k * my + k * k * atl[1];
    ctx.fillStyle = "#ff5c7a"; ctx.beginPath(); ctx.arc(ex, ey, 5 * d, 0, 6.283); ctx.fill();
    for (const [name, f] of [["Atlanta", "you"], ["Chicago", "you"], ["New York", "r1"], ["Los Angeles", "r2"], ["Minneapolis", "r3"], ["Memphis", null], ["Dallas", null], ["Miami", null], ["Denver", null], ["Seattle", null]]) {
      const [X, Y] = toS(ALB(METROS[name])), col = f ? FAC[f] : "#6b6d72";
      ctx.fillStyle = "#0b0a10"; ctx.strokeStyle = col; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, (name === "Atlanta" ? 9 : 5.5) * d, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9ccd1"; ctx.font = `500 ${8.5 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center"; if ("letterSpacing" in ctx) ctx.letterSpacing = `${1.2 * d}px`; ctx.fillText(name.toUpperCase(), X, Y + 18 * d); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      if (name === "Atlanta") drawIcon(ctx, "crown", X, Y - 17 * d, 15 * d, "#e1bdff", 2.2);
    }
    units = units.filter((u) => now - u.t0 < 1500);
    for (const u of units) { const q = ease(clamp01((now - u.t0) / 1400)), a = toS(u.from), b = toS(u.to), X = a[0] + (b[0] - a[0]) * q, Y = a[1] + (b[1] - a[1]) * q - Math.sin(q * Math.PI) * 30 * d; ctx.fillStyle = "#0b0a10"; ctx.strokeStyle = "#e1bdff"; ctx.lineWidth = 1.5 * d; ctx.beginPath(); ctx.arc(X, Y, 11 * d, 0, 6.283); ctx.fill(); ctx.stroke(); drawIcon(ctx, u.ik, X, Y, 13 * d, "#e1bdff", 2.2); }
    fx = fx.filter((f) => now - f.t0 < 1800);
    for (const f of fx) { const q = clamp01((now - f.t0) / 1800), [X, Y] = toS(f.p); ctx.strokeStyle = "#e1bdff"; ctx.globalAlpha = 1 - q; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, ease(q) * 70 * d, 0, 6.283); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.font = `italic 400 ${20 * d}px "Instrument Serif", serif`; ctx.textAlign = "center"; ctx.fillText(f.text, X, Y - 14 * d - q * 30 * d); ctx.globalAlpha = 1; }
  }
  return { frame };
})();

// the landing radar: a demo of rivals closing in
const HeroRadar = (() => {
  const cv = $("#heroradar"), ctx = cv.getContext("2d");
  const BLIPS = [{ n: "NEMESIS", a: -0.6, col: "#ff5c7a", sp: 1 }, { n: "RIVAL", a: 2.3, col: "#f5b544", sp: 0.6 }, { n: "ALLY?", a: 4.0, col: "#e1bdff", sp: 0.3 }];
  function frame(now) {
    const r = cv.getBoundingClientRect(); if ($("#site").hidden || r.bottom < 0 || r.top > innerHeight) return;
    fit(cv, 2); const W = cv.width, H = cv.height, d = cv._dpr || 1, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4 * d;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); bg.addColorStop(0, "#1b0f2e"); bg.addColorStop(1, "#08060c");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(225,189,255,.22)"; ctx.lineWidth = 1 * d; for (const k of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, 6.283); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    const beam = REDUCED ? 0 : -(now / 1000) * 1.4;
    if (ctx.createConicGradient) { const g = ctx.createConicGradient(beam, cx, cy); g.addColorStop(0, "rgba(175,80,255,.6)"); g.addColorStop(0.12, "rgba(175,80,255,.06)"); g.addColorStop(0.2, "rgba(175,80,255,0)"); g.addColorStop(1, "rgba(175,80,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill(); }
    ctx.font = `500 ${10.5 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center";
    for (const b of BLIPS) {
      const k = 0.92 - (((now / 1000) * 0.05 * b.sp) % 0.7), X = cx + Math.cos(b.a) * R * k, Y = cy + Math.sin(b.a) * R * k;
      const lag = (((b.a - beam) % 6.283) + 6.283) % 6.283, a = Math.max(0.3, 1 - lag / 3);
      ctx.globalAlpha = a; ctx.fillStyle = b.col; ctx.shadowColor = b.col; ctx.shadowBlur = 16 * d * a; ctx.beginPath(); ctx.arc(X, Y, 6 * d, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = b.col; ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.arc(X, Y, (10 + ((now / 100) % 12)) * d, 0, 6.283); ctx.stroke();
      ctx.fillStyle = "#f7f9fa"; ctx.fillText(b.n, X, Y - 16 * d); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#af50ff"; ctx.shadowColor = "#af50ff"; ctx.shadowBlur = 14 * d; ctx.beginPath(); ctx.arc(cx, cy, 6 * d, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#e1bdff"; ctx.fillText("YOUR HQ", cx, cy + 22 * d);
  }
  return { frame };
})();

// ---------------------------------------------------------------- who are you?
let player = null;
function openWho(name) {
  $("#who").hidden = false; $("#who-find").hidden = false; $("#who-custom").hidden = true;
  if (name) { $("#who-name").value = name; findMe(); } else setTimeout(() => $("#who-name").focus(), 50);
}
$$("[data-play]").forEach((b) => b.addEventListener("click", () => openWho()));
// "Play as" is one click: the top match is picked for you
let QUICK = null;
$$("[data-as]").forEach((b) => b.addEventListener("click", () => { QUICK = b.dataset.as; openWho(b.dataset.as); }));
$("#who-close").addEventListener("click", () => ($("#who").hidden = true));
$("#who").addEventListener("click", (e) => { if (e.target.id === "who") $("#who").hidden = true; });
addEventListener("keydown", (e) => { if (e.key === "Escape") $("#who").hidden = true; });

const TYPE = (t) => (t || "").replace("urn:entity:", "").replace("tv_show", "TV show");
function candHtml(c, i) {
  const socials = (c.socials || []).filter((s) => s.network !== "imdb");
  return `<div class="cand">${avatar(c.image, c.name)}
    <div><h3>${esc(c.name)}</h3><div class="meta">${esc(TYPE(c.type))}${c.bio ? " · " + esc(c.bio) : ""}${c.popularity ? ` · popularity ${Math.round(c.popularity * 100)}` : ""}</div>
    <div class="socials">${socials.length ? socials.map((s) => `<span class="soc"><b>✓</b> ${esc(s.network)} @${esc(s.handle)}</span>`).join("") : `<span class="soc">No socials found</span>`}</div></div>
    <button class="pill" data-me="${i}">That's me</button></div>`;
}
async function findMe(e) {
  e?.preventDefault();
  const q = $("#who-name").value.trim(); if (!q) return;
  const quick = QUICK && QUICK.toLowerCase() === q.toLowerCase(); QUICK = null;
  $("#cands").innerHTML = `<p class="muted">Searching Qloo and the web for “${esc(q)}”…</p>`;
  try {
    const r = await api(`/api/profile?name=${encodeURIComponent(q)}`);
    const list = (r.candidates || []).slice(0, 4);
    if (!list.length) { $("#cands").innerHTML = `<p class="muted">Not on Qloo yet. <button class="ghost" id="to-custom2">Build your own →</button></p>`; $("#to-custom2").onclick = toCustom; return; }
    $("#cands").innerHTML = (r.didYouMean ? `<p class="dym">Did you mean <b>${esc(r.didYouMean)}</b>?</p>` : "") + list.map(candHtml).join("");
    $$("[data-me]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.me, c = list[i];
      // the top hit is what the engine resolves by name (and what's prewarmed); others go by id
      // an exact name match goes by name (what the engine resolves and prewarms); everything else by id
      const exact = c.name.toLowerCase() === q.trim().toLowerCase() && i === 0;
      player = { name: c.name, image: c.image, bio: c.bio || TYPE(c.type), socials: c.socials, q: exact ? { name: c.name } : { name: c.name, ids: c.entity_id }, quick: quick && i === 0 };
      $("#who").hidden = true; scan();
    }));
    if (quick) $('[data-me="0"]')?.click();
  } catch { $("#cands").innerHTML = `<p class="muted">Search failed. Try again.</p>`; }
}
$("#who-form").addEventListener("submit", findMe);

// build your own
const picked = new Map();
function toCustom() { $("#who-find").hidden = true; $("#who-custom").hidden = false; $("#c-name").value ||= $("#who-name").value; setTimeout(() => $("#c-name").focus(), 50); }
$("#to-custom").addEventListener("click", toCustom);
$("#to-find").addEventListener("click", () => { $("#who-find").hidden = false; $("#who-custom").hidden = true; });
function renderPicked() { $("#like-picked").innerHTML = [...picked.values()].map((p) => `<button class="pick" aria-pressed="true" data-un="${esc(p.id)}">${esc(p.name)} ✕</button>`).join(""); $$("[data-un]").forEach((b) => b.addEventListener("click", () => { picked.delete(b.dataset.un); renderPicked(); })); }
$("#like-form").addEventListener("submit", async (e) => {
  e.preventDefault(); const q = $("#c-like").value.trim(); if (!q) return;
  $("#like-res").innerHTML = `<span class="muted">Searching…</span>`;
  const r = await api(`/api/profile?name=${encodeURIComponent(q)}`).catch(() => ({}));
  const list = (r.candidates || []).slice(0, 5);
  $("#like-res").innerHTML = list.map((c, i) => `<button class="pick" data-add="${i}">${esc(c.name)} · ${esc(TYPE(c.type))}</button>`).join("") || `<span class="muted">Nothing found.</span>`;
  $$("[data-add]").forEach((b) => b.addEventListener("click", () => { const c = list[+b.dataset.add]; if (picked.size < 3) picked.set(c.entity_id, { id: c.entity_id, name: c.name }); renderPicked(); }));
});
$("#custom-go").addEventListener("click", () => {
  const name = $("#c-name").value.trim();
  if (!name) return toast("Tell us your name first.");
  if (!picked.size) return toast("Pick at least one act your audience is like.");
  const socials = [["instagram", "#c-ig", "https://instagram.com/"], ["youtube", "#c-yt", "https://youtube.com/@"], ["tiktok", "#c-tt", "https://tiktok.com/@"]]
    .map(([network, sel, base]) => { const h = $(sel).value.trim().replace(/^@/, ""); return h && { network, handle: h, url: base + h }; }).filter(Boolean);
  const text = $("#c-text").value.trim();
  player = { name, image: null, custom: true, bio: `Audience like ${[...picked.values()].map((p) => p.name).join(", ")}`, socials, q: { name, ids: [...picked.keys()].join(","), ...(text ? { text } : {}) } };
  $("#who").hidden = true; scan();
});

// ---------------------------------------------------------------- the scan
const qs = (o) => new URLSearchParams(o).toString();
async function scan() {
  $("#site").hidden = true; $("#scan").hidden = false; Field.setMode("scan"); scrollTo(0, 0); Neuro.reset();
  $("#scan-who").innerHTML = `${avatar(player.image, player.name)}<div><div class="label">Commander</div><div style="font-size:22px">${esc(player.name)}</div></div>`;
  const socials = (player.socials || []).filter((s) => ["instagram", "twitter", "youtube", "tiktok"].includes(s.network));
  const S = [
    { t: "Found you", s: socials.length ? "Linked your channels." : player.custom ? "Built your audience from the acts you picked." : "Found you on Qloo.", src: [["Qloo", 1], ...socials.map((x) => [`${x.network} @${x.handle}`, 1])] },
    { t: "Reading your audience", s: "Who your fans are and what else they love." },
    { t: "Checking what's trending", s: "Live Google Trends for your next city. X and TikTok need your accounts connected.", src: [["Google Trends · live", 1], ["Wikipedia fame · live", 1], ["X · connect", 0], ["TikTok · connect", 0]] },
    { t: "Simulating 1,000 fans", s: "Built person by person from your Qloo audience." },
    { t: "Battle-testing your material", s: "Every fan reacts, city by city." },
    { t: "Spotting rivals and allies", s: "Who's fighting for the same fans." },
    { t: "Planning your campaign", s: "Ranking the orders that grow you fastest." },
  ];
  $("#ssteps").innerHTML = S.map((x, i) => `<div class="sstep" id="ss${i}"><i></i><div><b>${esc(x.t)}</b><span>${esc(x.s)}</span>${x.src ? `<div class="src">${x.src.map(([n, live]) => `<em class="${live ? "live" : ""}">${esc(n)}</em>`).join("")}</div>` : ""}</div></div>`).join("") + `<p class="note" style="margin-top:12px">A new name takes about 30 seconds: around 100 live Qloo calls.</p>`;
  const set = (i, cls, text) => { const el = $("#ss" + i); el.className = "sstep " + cls; if (cls === "done") el.querySelector("i").textContent = "✓"; if (cls === "wait") el.querySelector("i").textContent = "!"; if (text) el.querySelector("span").textContent = text; Sound.play("tick"); const pc = Math.round(($$(".sstep.done,.sstep.wait").length / S.length) * 100); $("#scanbar").style.width = pc + "%"; $("#scan-pct").textContent = pc + "%"; };
  const q = qs(player.q);
  const audP = api(`/api/audience?${q}`).catch(() => null);
  const campP = api(`/api/campaign?${q}`).catch((e) => ({ status: "error", error: String(e) }));
  const scanT0 = Date.now();
  set(0, "on"); await sleep(700); set(0, "done");
  set(1, "on");
  const aud = await audP; player.aud = aud;
  if (aud?.status === "ok") {
    const up = (aud.demographics || []).filter(([, v]) => v > 0.2).map(([k]) => k);
    set(1, "done", `${up.length ? `Over-indexes ${up.slice(0, 3).join(", ")}. ` : ""}Into ${(aud.tags || []).slice(0, 3).join(", ")}.`);
  } else set(1, "done");
  set(2, "on"); await sleep(800); set(2, "done");
  for (let i = 3; i < S.length; i++) set(i, "on");
  const c = await campP;
  if (c.status !== "ok") {
    $("#ssteps").insertAdjacentHTML("beforeend", `<p style="color:#ff8fa5;margin-top:14px">Qloo doesn't know enough about this audience yet${c.error ? ` (${esc(c.error)})` : ""}. Try “Build your own”.</p><button class="pill" id="scan-back">Back</button>`);
    $("#scan-back").onclick = () => { toSite(); openWho(); toCustom(); };
    return;
  }
  Neuro.play(c.tribe);
  const obs = Object.fromEntries(c.steps.map((s) => [s.n, s.observed]));
  set(3, "done", `${c.aggregate.n.toLocaleString()} fans across ${c.territory.cities.length} cities.`); await sleep(500);
  set(4, "done", obs[2]); await sleep(600);
  set(5, "done", c.rivals.map((r) => `${r.name}: ${r.strategy === "ally" ? "potential ally" : "nemesis"}`).join(" · ") || obs[3]); await sleep(600);
  set(6, "done", obs[7]); await sleep(1100);
  await sleep(Math.max(0, (TOURING ? 5000 : 8000) - (Date.now() - scanT0)));
  startGame(c, player);
}

// ---------------------------------------------------------------- run
// every renderer is isolated: one bad frame is logged once and never stops the loop
const failed = new Set();
function safe(name, fn, now) { try { fn(now); } catch (e) { if (!failed.has(name)) { failed.add(name); console.warn(`[${name}] frame error`, e); } } }
(function loop(now) {
  requestAnimationFrame(loop);
  safe("brain", Field.frame, now);
  safe("say", sayTick, now);
  // the map only draws when you can see it: not under the objective screen, a modal or the win screen
  if (G && !$("#game").hidden) { if ($("#intro").hidden && $("#victory").hidden && $("#docv").hidden) { safe("map", MapView.frame, now); safe("radar", Radar.frame, now); } safe("regions", brainTick, now); }
  else { safe("hero", HeroMap.frame, now); safe("heroradar", HeroRadar.frame, now); safe("stars", Stars.frame, now); safe("globe", Globe.frame, now); safe("story", Story.frame, now); safe("feed", Feed.frame, now); }
})(performance.now());
// a shareable link: ?play=Name opens the game as that person
playHook();
const autoplay = new URLSearchParams(location.search).get("play");
if (new URLSearchParams(location.search).has("tour")) setTimeout(runTour, 800);
else if (autoplay) { if (PRESET_OBJ[autoplay.toLowerCase()]) QUICK = autoplay; openWho(autoplay); }
