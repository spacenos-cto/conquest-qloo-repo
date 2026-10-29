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
  const SONGS = {
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
  return { get on() { return on; }, toggle() { on = !on; return on; }, play(k) { if (!on) return; try { SONGS[k]?.(); } catch {} } };
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
const WEEKS = 8, BUZZ_MAX = 12;
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
  chev: "M9 6l6 6-6 6",
};
const P2D = {};
const pathOf = (k) => (P2D[k] ??= new Path2D(PATHS[k] ?? PATHS.star));
const I = (k, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[k] ?? PATHS.star}"/></svg>`;
function drawIcon(ctx, k, x, y, size, col, lw = 2) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(pathOf(k)); ctx.restore();
}
// emoji → icon key; anything else pictographic is dropped
const EMO = { "⚡": "bolt", "🪙": "coin", "🛡": "shield", "⚔": "swords", "🕊": "dove", "🤝": "hands", "🔭": "scout", "🎟": "ticket", "💼": "case", "🎙": "mic", "🎤": "mic", "🎭": "eye", "📈": "trend", "🌦": "cloud", "🕵": "crosshair", "✍": "pen", "🎪": "tent", "👂": "ear", "🧪": "flask", "🚩": "flag", "🏴": "flag", "🏰": "castle", "🤖": "bot", "🏆": "star", "⭐": "star", "🔥": "flame", "⏱": "hourglass", "⌛": "hourglass", "📅": "hourglass", "👑": "crown", "💀": "skull", "📡": "radar", "🩸": "swords", "🗡": "swords", "🧱": "shield", "💰": "coin", "🏄": "trend", "✦": "star", "❤": "heart", "🔊": "sound", "🔇": "mute", "📋": "plan" };
const EMO_RE = /(\p{Extended_Pictographic})️?/gu, EMO_ONE = /\p{Extended_Pictographic}/u;
const iconFor = (ch) => EMO[ch] ?? EMO[ch.replace(/️/g, "")];
// split text into a leading icon key and clean text (for the canvas); unmapped glyphs stay
function deEmoji(text) { let icon = null; const clean = String(text).replace(EMO_RE, (m, ch) => { const k = iconFor(ch); if (!k) return m; icon ??= k; return ""; }).replace(/\s{2,}/g, " ").trim(); return { icon, text: clean }; }
// swap mapped emoji in every text node under root for svg icons
function iconize(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (EMO_ONE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentNode?.closest?.("svg,script,style,textarea,input,canvas")) continue;
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
    if (dist < 200) G.gov.set(s.id, { city: n, k: dist < 120 ? 0.6 : 0.35 });
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
    const A = { you: 0.62, allied: 0.5, open: 0.2, fog: 0.1 };
    for (const s of Atlas.states) {
      const g = G.gov.get(s.id); if (!g) continue; const key = keyOf.get(s.id);
      x.beginPath(); P(s.f); x.globalAlpha = (A[key] ?? 0.56) * g.k; x.fillStyle = colOf(key); x.fill();
    }
    x.globalAlpha = 1; x.lineJoin = "round";
    x.beginPath(); P(Atlas.inner); x.strokeStyle = "rgba(247,249,250,0.11)"; x.lineWidth = (0.7 * d) / T.s; x.stroke();
    // a glowing frontier around each faction's realm
    const geoms = Atlas.topo.objects.states.geometries;
    for (const key of new Set(keyOf.values())) {
      if (key === "fog" || key === "open") continue;
      const m = topojson.mesh(Atlas.topo, { type: "GeometryCollection", geometries: geoms }, (a, b) => (keyOf.get(a.id) === key) !== (keyOf.get(b.id) === key) || (a === b && keyOf.get(a.id) === key));
      x.beginPath(); P(m); x.strokeStyle = colOf(key); x.lineWidth = (2.2 * d) / T.s; x.shadowColor = colOf(key); x.shadowBlur = 10 * d; x.stroke(); x.shadowBlur = 0;
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
    const [X, Y] = toS(ct.p), key = sideOf(ct), col = colOf(key), r = (7 + ct.presence * 8) * d, t = now / 1000;
    const sel = G.orders[G.sel], isTarget = sel && !sel.done && sel.city === ct.name;
    const siege = G.sieges.find((s) => s.city === ct.name);
    // city lights after dark
    const lit = night(ct.p[0]); if (lit > 0.3 && key !== "fog") { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 3.2); g.addColorStop(0, `rgba(235,215,255,${0.45 * lit})`); g.addColorStop(1, "rgba(235,215,255,0)"); ctx.fillStyle = g; ctx.fillRect(X - r * 3.2, Y - r * 3.2, r * 6.4, r * 6.4); }
    if (ct.state === "beachhead") { ctx.strokeStyle = "#3dff9a"; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 3); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, r + 6 * d + 3 * d * Math.sin(t * 3), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    if (siege) { ctx.strokeStyle = "#ff4d6d"; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(X, Y, r + 9 * d, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    if (isTarget) { const k = (t % 1.4) / 1.4; ctx.strokeStyle = "#fff"; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(X, Y, r + k * 26 * d, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
    const f = G.fac.get(ct.owner), cap = G.capital === ct.name && key === "you";
    let drew = false;
    if (cap) drew = face(X, Y, 20 * d, G.player.image, COL.you);
    else if (ct.state === "rival" && f) drew = face(X, Y, Math.max(r + 4 * d, 15 * d), f.img, f.allied ? COL.allied : f.col);
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
    if (isTarget) drawIcon(ctx, "flag", X + rr + 6 * d, Y - rr - 6 * d, 18 * d, "#fff", 2.2);
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
    Clock.tick(now);
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
    const o = G.orders[G.sel];
    if (o && !o.done && o.city) { const to = G.cities.find((c) => c.name === o.city); if (to) arrow(fromFor(to).p, to.p, o.kind === "alliance" ? COL.allied : o.kind === "defend" ? "#fff" : "#e1bdff", now, 3.4); }
    G.temp = G.temp.filter((tr) => now - tr.t0 <= 3500);
    for (const tr of G.temp) arrow(tr.from, tr.to, tr.col, now, 2.4);
    // radar sweep from your capital: rival cities ping as the beam passes
    const cap = G.cities.find((c) => c.name === G.capital);
    if (cap && !REDUCED) {
      const [CX, CY] = toS(cap.p), R = 420 * s, beam = -(now / 1000) * 1.1;
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(beam, CX, CY);
        g.addColorStop(0, "rgba(225,189,255,0.22)"); g.addColorStop(0.07, "rgba(225,189,255,0.04)"); g.addColorStop(0.1, "rgba(225,189,255,0)"); g.addColorStop(1, "rgba(225,189,255,0)");
        ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, R, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(225,189,255,0.12)"; ctx.lineWidth = 1 * d; for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(CX, CY, R * k, 0, 6.283); ctx.stroke(); }
        ctx.restore();
      }
      for (const ct of G.cities) {
        if (ct.state !== "rival" || sideOf(ct) === "allied") continue;
        const [X, Y] = toS(ct.p), ang = Math.atan2(Y - CY, X - CX), lag = (((ang - beam) % 6.283) + 6.283) % 6.283;
        if (Math.hypot(X - CX, Y - CY) > R || lag > 1.4) continue;
        const k = lag / 1.4; ctx.strokeStyle = colOf(sideOf(ct)); ctx.globalAlpha = 1 - k; ctx.lineWidth = 2 * d;
        ctx.beginPath(); ctx.arc(X, Y, (14 + k * 26) * d, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    for (const ct of G.cities) token(ct, now, night);
    // rival armies on the march toward the city they mean to take this week
    for (const it of G.intents.slice(0, 2)) {
      const f = G.fac.get(it.fid), to = G.cities.find((c) => c.name === it.city); if (!f || !to || f.allied) continue;
      const a0 = toS(it.from), b0 = toS(to.p), c0 = bez(a0, b0), k = 0.1 + 0.78 * clamp01(G.hour / 168), [X, Y] = at(a0, c0, b0, k);
      ctx.save(); ctx.strokeStyle = f.col; ctx.globalAlpha = 0.55; ctx.setLineDash([4 * d, 6 * d]); ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], b0[0], b0[1]); ctx.stroke(); ctx.restore();
      const blocked = G.forts.has(to.name);
      if (!face(X, Y, 13 * d, f.img, f.col)) { ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(X, Y, 11 * d, 0, 6.283); ctx.fill(); }
      ctx.font = `700 ${10 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "center"; ctx.fillStyle = blocked ? "#3dff9a" : "#ff8fa5"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4 * d;
      iconText(blocked ? "🛡 WALLS UP" : `⚔ ${to.name.toUpperCase()} · SUN`, X, Y - 22 * d, blocked ? "#3dff9a" : "#ff8fa5", 10.5 * d); ctx.shadowBlur = 0;
      if (blocked) { const [TX, TY] = b0; ctx.strokeStyle = "#3dff9a"; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(TX, TY, 24 * d, 0, 6.283); ctx.stroke(); }
    }
    // floating numbers
    G.floats = G.floats.filter((f) => now - f.t0 < 1900);
    for (const f of G.floats) {
      const k = (now - f.t0) / 1900, [X, Y] = toS(f.p);
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; ctx.fillStyle = f.col; ctx.font = `italic 400 ${22 * d}px "Instrument Serif", serif`; ctx.textAlign = "center";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * d; iconText(f.text, X + (f.dx ?? 0) * d, Y - 30 * d - k * 46 * d, f.col, 17 * d, "800"); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    // your agents in the field
    for (const u of G.units) {
      const k = clamp01((now - u.t0) / u.dur), back = u.phase === "back";
      const a0 = toS(back ? u.to : u.from), b0 = toS(back ? u.from : u.to), c0 = bez(a0, b0), [X, Y] = at(a0, c0, b0, ease(k));
      ctx.save(); ctx.strokeStyle = "rgba(127,216,255,.5)"; ctx.setLineDash([3 * d, 5 * d]); ctx.lineWidth = 1.5 * d; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], b0[0], b0[1]); ctx.stroke(); ctx.restore();
      const bob = u.phase === "work" ? Math.sin(now / 150) * 3 * d : 0;
      const [UX, UY] = u.phase === "work" ? b0 : [X, Y];
      ctx.fillStyle = "#0a0f18"; ctx.strokeStyle = "#7fd8ff"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(UX, UY - 18 * d + bob, 12 * d, 0, 6.283); ctx.fill(); ctx.stroke();
      drawIcon(ctx, deEmoji(u.icon).icon ?? "bot", UX, UY - 18 * d + bob, 15 * d, "#7fd8ff", 2.2);
      if (u.phase === "work") { ctx.fillStyle = "#7fd8ff"; ctx.font = `600 ${9.5 * d}px "IBM Plex Mono", monospace`; ctx.fillText("working…", UX, UY - 36 * d); }
    }
    for (const f of G.fx) {
      const k = (now - f.t0) / f.dur; if (k > 1 || k < 0) continue; const [X, Y] = toS(f.p);
      if (f.ring) { ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 4 * d * (1 - k) + 1; ctx.beginPath(); ctx.arc(X, Y, ease(k) * f.r * s, 0, 6.283); ctx.stroke(); }
      else { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(X + f.vx * k * s, Y + f.vy * k * s + 40 * k * k * s, 2.6 * d, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1; G.fx = G.fx.filter((f) => now - f.t0 < f.dur);
    if (mouse) cv.style.cursor = hit(mouse) ? "pointer" : "crosshair";
  }
  function hit([mx, my]) { let best = null, bd = 24 * d; for (const ct of G.cities) { const [X, Y] = toS(ct.p), q = Math.hypot(X - mx * d, Y - my * d); if (q < bd) { bd = q; best = ct; } } return best; }
  cv.addEventListener("mousemove", (e) => { if (!G) return; mouse = [e.offsetX, e.offsetY]; const h = hit(mouse); if (h) cityPanel(h); else if (!G.pinned) $("#cityp").hidden = true; });
  cv.addEventListener("mouseleave", () => { mouse = null; if (G && !G.pinned) $("#cityp").hidden = true; });
  cv.addEventListener("click", (e) => {
    if (!G) return;
    const h = hit([e.offsetX, e.offsetY]); if (!h) { G.pinned = null; $("#cityp").hidden = true; return; }
    G.pinned = h.name; cityPanel(h); renderAgents();
    const i = G.orders.findIndex((o) => !o.done && o.city === h.name); if (i >= 0 && i !== G.sel) selectOrder(i);
  });
  // ownership changed: snapshot the old layer for the flood animation, draw the new one
  function flip(p) { const old = G.layer; relayer(); if (old && p) G.anim = { old, p, t0: performance.now() }; }
  return { frame, flip, relayer };
})();

// the city an order marches from: your nearest held city, else the capital
function fromFor(to) { return nearest(G.cities.filter((c) => sideOf(c) === "you" && c !== to), to) ?? G.cities.find((c) => c.name === G.capital) ?? to; }

function cityPanel(ct) {
  const key = sideOf(ct), f = G.fac.get(ct.owner), sg = G.sieges.find((s) => s.city === ct.name);
  const owner = key === "you" ? `Yours · ${ct.state}` : key === "allied" ? "Allied ground" : key === "fog" ? "Uncharted" : ct.state === "rival" ? `Held by ${f?.name ?? "a rival"}` : `Unclaimed · ${ct.state}`;
  const top = ct.rivals?.[0];
  const text = ct.state === "rival" ? `${f?.name ?? "A rival"}'s crowd is relatively stronger here. ${f?.strategy === "ally" ? "Your advisor says: team up." : "Your advisor says: out-play them."}` : STATE_TEXT[ct.state] ?? "";
  $("#cityp").innerHTML = `<div class="ptitle">City report</div><h4>${esc(ct.name)}</h4><div class="who" style="color:${colOf(key)}">${esc(owner)}</div>
    <dl><dt>Your fan signal</dt><dd>${ct.you.toLocaleString()}</dd><dt>Material rating</dt><dd>${ct.mean != null ? ct.mean + "/5" : "—"}</dd><dt>Simulated fans here</dt><dd>${ct.n}</dd>${top && top.count ? `<dt>${esc(top.name)}</dt><dd>${top.count.toLocaleString()}</dd>` : ""}<dt>Worth</dt><dd>${pts(ct)}% conquest</dd><dt>Local time</dt><dd>${Clock.localLabel(ct)}</dd></dl>
    <p>${esc(text)}</p>${G.intel.get(ct.name) ? `<p style="color:#7fd8ff">${esc(G.intel.get(ct.name))}</p>` : ""}${sg ? `<p style="color:#ff8fa5">⚔ Under siege by ${esc(G.fac.get(sg.fid)?.name)}: falls in ${sg.left} week${sg.left > 1 ? "s" : ""} unless you defend.</p>` : ct.contested && key === "you" ? `<p style="color:#ff8fa5">⚔ ${esc(ct.contested)} is close behind you here.</p>` : ""}`;
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
  rising: ["⭐", "Rising Star", "Advanced an age"], giant: ["🗡️", "Giant Slayer", "Won a battle as the underdog"], seize: ["⏱️", "Seize the Day", "Claimed an opportunity in time"], fest: ["🎪", "Festival King", "Threw a festival night"],
};
function ach(id) {
  if (!G || G.ach.has(id) || !ACH[id]) return; G.ach.add(id); G.achPts += 250;
  const [ic, t, d] = ACH[id], el = document.createElement("div"); el.className = "achv";
  el.innerHTML = `<span>${ic}</span><span><b>Achievement: ${t}</b><br><small>${d} · +250 score</small></span>`;
  $("#achs").appendChild(el); setTimeout(() => el.remove(), 3800); Sound.play("potion"); ops(`<span class="ok">🏆 ${t}</span> · ${d}`);
}

// ---------------------------------------------------------------- the world clock
// One game week runs in about 84 seconds. Night sweeps across the map from
// east to west by real longitude; at Sunday midnight the week ends on its own.
const Clock = (() => {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], RATE = 2; // game hours per real second
  let last = 0, speed = 1, paused = false, shown = "";
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
  function tick(now) {
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0; last = now;
    if (!G || G.over) return;
    if (!paused && !G.busy && !G.simulating && !G.modal && !G.coach) {
      G.hour += dt * RATE * speed;
      questTick();
      if (G.hour >= 168) { G.hour = 168; speed = 1; $("#cfast").textContent = "⏩"; endWeek(); }
    }
    const lab = fmt(Math.min(G.hour, 167.99));
    if (lab !== shown) { shown = lab; $("#ctime").textContent = lab.toUpperCase() + " ET"; $("#cday").textContent = `WEEK ${G.week} OF ${WEEKS}`; $("#cdial").style.setProperty("--k", `${((G.hour % 24) / 24) * 100}%`); if (lab.endsWith(":00")) renderQuests(); }
  }
  return {
    tick, nightAt, fmt,
    label: () => (G ? fmt(Math.min(G.hour, 167.99)) : ""),
    localLabel: (ct) => { const lon = METROS[ct.name]?.[0] ?? -75, h = (((G.hour % 24) + (lon + 75) / 15) % 24 + 24) % 24; return `${pad(Math.floor(h))}:${pad(Math.floor(((h % 1) * 60) / 15) * 15)}`; },
    toggle() { paused = !paused; $("#cpause").textContent = paused ? "▶" : "⏸"; return paused; },
    fast() { speed = speed > 1 ? 1 : 12; $("#cfast").textContent = speed > 1 ? "1×" : "⏩"; },
    finishWeek() { speed = 60; paused = false; $("#cpause").textContent = "⏸"; },
    reset() { speed = 1; paused = false; last = 0; shown = ""; $("#cpause").textContent = "⏸"; $("#cfast").textContent = "⏩"; },
  };
})();

// ---------------------------------------------------------------- costs, gains, the strategist
const costOf = (o) => Math.max(1, COST[o.kind] - (o.city && G.prep.has(o.city) ? 1 : 0));
const gainOf = (o) => (o.gain ? o.gain + (o.city && G.prep.has(o.city) ? 2 : 0) : 0);
const income = () => G.cities.filter((c) => sideOf(c) === "you").length * 15 + G.sponsors.reduce((s, x) => s + x.perWeek, 0);
function council() {
  const open = G.orders.filter((o) => !o.done);
  const sg = G.sieges.slice().sort((a, b) => a.left - b.left)[0];
  const inc = G.intents.find((it) => !G.forts.has(it.city) && !G.fac.get(it.fid)?.allied);
  const afford = open.filter((o) => costOf(o) <= G.buzz && o.gain);
  const best = afford.sort((a, b) => gainOf(b) / costOf(b) - gainOf(a) / costOf(a))[0];
  const left = WEEKS - G.week + 1;
  let msg;
  if (sg) msg = `Alarm! ${G.fac.get(sg.fid)?.name} is besieging ${sg.city}. It falls in ${sg.left} week${sg.left > 1 ? "s" : ""}. Defend it for ⚡${COST.defend}, and win the battle.`;
  else if (inc) msg = `Radar: ${G.fac.get(inc.fid)?.name} is marching on ${inc.city} and arrives Sunday. Fortify it (🪙80), strike them first, or parley. ${best ? `Then: “${best.title}”, +${gainOf(best)}%.` : ""}`;
  else if (!open.length) msg = "Every order is done. Let the clock run out or end the week to close the campaign.";
  else if (!afford.length) msg = `You're low on buzz (⚡${G.buzz}). Claim an opportunity, drink a trend potion, or end the week for +⚡${regen()}.`;
  else msg = `Best value now: “${best.title}”, +${gainOf(best)}% for ⚡${costOf(best)}.${G.prep.has(best.city) ? " Your agents already prepared that city." : best.city ? ` Send a Scout or Booker to ${best.city} first and it costs less and gains more.` : ""} ${left} week${left > 1 ? "s" : ""} left.`;
  typeInto($("#brief"), msg, `Week ${G.week} of ${WEEKS} · rival moves are simulated from their real Qloo footprints and Wikipedia momentum`);
}

// ---------------------------------------------------------------- HUD and panels
const held = () => G.cities.filter((c) => ["you", "allied"].includes(sideOf(c))).length;
const ground = () => G.cities.filter((c) => c.state !== "uncharted").length;
const fansOf = () => G.cities.filter((c) => sideOf(c) === "you").reduce((s, c) => s + c.you, 0);
const power = () => Math.round((fansOf() * G.morale) / 10);
const regen = () => Math.min(8, 3 + Math.max(0, Math.round((G.morale - 3.5) * 4)) + G.allies);
const score = () => Math.round(G.conquest * 100 + G.allies * 500 + G.taken * 750 + power() + G.saved * 400 + G.missions * 150 + G.achPts);
let lastOrb = {};
function orb(id, frac, label) {
  const el = $(id); el.style.setProperty("--f", `${Math.round(clamp01(frac) * 100)}%`); el.querySelector("b").textContent = label;
  if (lastOrb[id] != null && lastOrb[id] !== label) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
  lastOrb[id] = label;
}
function hud(delta) {
  const [a0, n, name] = ageOf(G.conquest), nx = AGES.find((x) => x[0] > G.conquest);
  $("#lvl-n").textContent = n; $("#age-name").textContent = name;
  $("#xp-fill").style.width = `${nx ? ((G.conquest - a0) / (nx[0] - a0)) * 100 : 100}%`;
  $("#xp-text").textContent = `${G.conquest}% conquest${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}${nx ? ` · ${nx[2]} at ${nx[0]}%` : " · max age"}`;
  orb("#orb-buzz", G.buzz / BUZZ_MAX, `⚡${G.buzz}`); $("#rate-buzz").textContent = `+${regen()}/wk`;
  orb("#orb-hype", (G.morale - 1) / 4, G.morale.toFixed(1));
  orb("#orb-gold", Math.min(1, G.gold / 800), `${G.gold}`); $("#rate-gold").textContent = `+${income()}/wk`;
  $("#mini").innerHTML = [["🏰", `${held()}/${ground()}`, "Cities held"], ["🤝", G.allies, "Allies"], ["🤖", [...G.crew.values()].filter((c) => c.recruited).length, "Agents"], ["⭐", score().toLocaleString(), "Score"]]
    .map(([i, v, t]) => `<span title="${t}"><i>${i}</i>${v}</span>`).join("");
  $("#weeknote").textContent = `Sunday midnight: +⚡${regen()} buzz, +🪙${income()} gold, then the rivals strike.`;
  factions(); renderThreats();
}
function factions() {
  const reach = (f) => G.cities.reduce((s, c) => s + (c.rivals.find((r) => r.id === f.id)?.count ?? 0), 0);
  const fm = (name) => G.fame.get(name);
  const row = (x) => { const f = fm(x.name); return { ...x, v: f?.views ?? null, mo: f?.momentum ?? null }; };
  const all = [row({ name: G.player.name, img: G.player.image, col: COL.you, st: `<span class="st you">You</span>`, n: G.cities.filter((c) => sideOf(c) === "you").length, last: G.last, r: fansOf() })]
    .concat([...G.fac.values()].map((f) => row({ name: f.name, img: f.img, col: f.allied ? COL.allied : f.col, st: f.allied ? `<span class="st allied">Allied</span>` : f.strategy === "ally" ? `<span class="st ally">Ally?</span>` : `<span class="st rival">Nemesis</span>`, n: G.cities.filter((c) => c.owner === f.id && c.state === "rival").length, last: f.last, title: f.plan.reason, r: reach(f) })));
  const useFame = all.some((x) => x.v), max = Math.max(1, ...all.map((x) => (useFame ? x.v ?? 0 : x.r)));
  $("#factions").innerHTML = all.map((x) => `<div class="fac" style="--c:${x.col}" ${x.title ? `title="${esc(x.title)}"` : ""}>${avatar(x.img, x.name, "fp")}<span>${esc(x.name)}</span>${x.st}<b>${x.n}</b><span class="pw"><i style="width:${((useFame ? x.v ?? 0 : x.r) / max) * 100}%"></i></span><span class="fl">${x.v != null ? `${kfmt(x.v)} views/30d${x.mo != null ? ` ${x.mo >= 0 ? "▲" : "▼"}${Math.abs(x.mo)}%` : ""} · ` : ""}${esc(x.last || "")}</span></div>`).join("")
    ;
}
function playerCard() {
  const p = G.player, socials = (p.socials || []).filter((s) => s.network !== "imdb");
  $("#hud-face").innerHTML = avatar(p.image, p.name);
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
    const cap = G.cities.find((c) => c.name === G.capital) ?? G.cities[0]; if (!cap) return;
    const RANGE = 620, pos = (p) => { const dx = p[0] - cap.p[0], dy = p[1] - cap.p[1], dd = Math.hypot(dx, dy), k = Math.min(1, dd / RANGE); return [cx + (dx / (dd || 1)) * k * R, cy + (dy / (dd || 1)) * k * R]; };
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
      for (const c of G.cities.filter((x) => x.owner === f.id && x.state === "rival")) { const [X, Y] = pos(c.p); ctx.globalAlpha = lit(X, Y) * 0.8; ctx.fillStyle = col; ctx.fillRect(X - 3 * d, Y - 3 * d, 6 * d, 6 * d); }
      const it = G.intents.find((x) => x.fid === f.id); if (!it || f.allied) continue;
      const to = G.cities.find((c) => c.name === it.city); if (!to) continue;
      const k = 0.1 + 0.78 * clamp01(G.hour / 168), from = pos(it.from), dst = pos(to.p), X = from[0] + (dst[0] - from[0]) * k, Y = from[1] + (dst[1] - from[1]) * k;
      const a = lit(X, Y); ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.setLineDash([3 * d, 4 * d]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(dst[0], dst[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = a; ctx.shadowColor = col; ctx.shadowBlur = 14 * d * a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 5.5 * d, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * d; ctx.arc(X, Y, (8 + ((now / 120) % 10)) * d, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = Math.min(1, a + 0.3); ctx.fillStyle = "#e9eef7"; ctx.fillText(f.name.split(" ").slice(-1)[0].toUpperCase(), X, Y - 10 * d);
      ctx.fillStyle = G.forts.has(to.name) ? "#3dff9a" : "#ff8fa5"; ctx.fillText(G.forts.has(to.name) ? "BLOCKED" : `→ ${to.name.toUpperCase()}`, X, Y + 16 * d);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.you; ctx.beginPath(); ctx.arc(cx, cy, 5 * d, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(225,189,255,.7)"; ctx.font = `600 ${9 * d}px "IBM Plex Mono", monospace`; ctx.textAlign = "left"; ctx.fillText(`HQ · ${G.capital?.toUpperCase() ?? ""}`, 8 * d, H - 8 * d);
    ctx.textAlign = "right"; ctx.fillText(`ETA SUN 00:00 · ${Math.max(0, Math.ceil((168 - G.hour) / 24))}D`, W - 8 * d, H - 8 * d);
  }
  return { frame };
})();
function threatLevel(f) {
  if (f.allied) return "ALLY";
  const it = G.intents.find((x) => x.fid === f.id);
  if (it && !G.forts.has(it.city)) return f.strategy === "compete" || (G.fame.get(f.name)?.momentum ?? 0) > 10 ? "HIGH" : "MED";
  return "LOW";
}
function renderThreats() {
  if (!G) return;
  const RANK = { HIGH: 0, MED: 1, LOW: 2, ALLY: 3 };
  $("#threats").innerHTML = [...G.fac.values()].sort((a, b) => RANK[threatLevel(a)] - RANK[threatLevel(b)]).slice(0, 2).map((f) => {
    const lv = threatLevel(f), it = G.intents.find((x) => x.fid === f.id), mo = G.fame.get(f.name)?.momentum;
    const strikeAt = strikeCity(f);
    const why = f.allied ? "Fighting at your side." : it ? (G.forts.has(it.city) ? `Marching on ${it.city}. Walls up.` : `Marching on ${it.city} · arrives Sunday.`) : f.strategy === "ally" ? "Same taste, new crowd. A good partner." : "Watching your ground.";
    const btns = f.allied ? "" : `<div class="cnt">
      ${it ? `<button data-fort="${esc(it.city)}" ${G.gold >= 80 && !G.forts.has(it.city) ? "" : "disabled"} title="Walls up in ${esc(it.city)} this week: their attack bounces">🛡 Fortify 🪙80</button>` : ""}
      <button data-strike="${esc(f.id)}" ${strikeAt && G.buzz >= 4 ? "" : "disabled"} title="${strikeAt ? `Hit them first in ${esc(strikeAt.name)}` : "They hold no city to hit"}">⚔ Strike ⚡4</button>
      <button data-parley="${esc(f.id)}" title="Offer a partnership instead of a fight">🕊 Parley</button></div>`;
    return `<div class="threat${lv === "HIGH" ? " hi" : ""}" style="--c:${f.allied ? COL.allied : f.col}"><div class="th">${avatar(f.img, f.name, "fp")}<span>${esc(f.name)}${mo != null ? ` <small style="color:var(--ash)">${mo >= 0 ? "▲" : "▼"}${Math.abs(mo)}%</small>` : ""}</span><span class="lv ${lv}">${lv}</span></div><p>${esc(why)}</p>${btns}</div>`;
  }).join("");
  $$("[data-fort]").forEach((b) => b.addEventListener("click", () => fortify(b.dataset.fort)));
  $$("[data-strike]").forEach((b) => b.addEventListener("click", () => strike(b.dataset.strike)));
  $$("[data-parley]").forEach((b) => b.addEventListener("click", () => { const f = G.fac.get(b.dataset.parley); if (f) parley({ name: f.name, f, barter: f.plan.barter, netnew: f.plan.netnew, convert: f.plan.convert, city: f.plan.city }); }));
}
function strikeCity(f) { const cap = G.cities.find((c) => c.name === G.capital); const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival"); return cap ? nearest(theirs, cap) : theirs[0]; }
function fortify(city) {
  if (G.gold < 80 || G.forts.has(city)) return;
  G.gold -= 80; G.forts.add(city); Sound.play("alliance");
  const ct = G.cities.find((c) => c.name === city); float(ct?.p, "🛡 WALLS UP", "#3dff9a");
  event(`🛡 Walls go up in ${city}. The attack will bounce.`, "good"); ops(`<span class="ok">🛡 fortified ${esc(city)}</span> · 🪙80`);
  hud(); council();
}
async function strike(fid) {
  const f = G.fac.get(fid), ct = f && strikeCity(f); if (!ct || G.buzz < 4 || G.busy) return;
  const r = await battle({ city: ct, f, cost: 4, title: `Strike first · ${ct.name}` });
  if (r !== "win") return;
  const loss = pts(ct); ct.state = "stronghold"; ct.owner = "you"; G.taken++;
  G.intents = G.intents.filter((x) => x.fid !== fid); f.last = `Lost ${ct.name} to you`;
  G.conquest = Math.min(100, G.conquest + loss); MapView.flip(ct.p); boom(ct.p, COL.you); float(ct.p, `+${loss}%`);
  banner(`${ct.name.toUpperCase()} TAKEN`, `${f.name}'s march is broken · +${loss}%`); ach("blood");
  hud(loss); renderOrders(); council();
}

// ---------------------------------------------------------------- battle
// Odds come from real numbers: your fans there and your material's rating vs
// their footprint there and their Wikipedia momentum, plus what your agents did.
function oddsFor(ct, f) {
  const theirs = Math.max(1, ct.rivals.find((r) => r.id === f.id)?.count ?? 0), mo = G.fame.get(f.name)?.momentum ?? 0;
  const mods = [];
  let me = ct.you * (G.morale / 4);
  if (G.prep.has(ct.name)) { me *= 1.3; mods.push("+30% city prepared by your agents"); }
  if (G.forts.has(ct.name)) { me *= 1.3; mods.push("+30% walls up"); }
  if ((G.intel.get(ct.name) ?? []).length) { me *= 1.1; mods.push("+10% agent intel"); }
  if (G.morale >= 4.3) mods.push("hype is high");
  const them = theirs * (1 + Math.max(-0.4, Math.min(0.6, mo / 100)));
  if (mo) mods.push(`their fame ${mo >= 0 ? "▲" : "▼"}${Math.abs(mo)}%`);
  return { me: Math.round(me), them: Math.round(them), p: Math.max(0.15, Math.min(0.9, me / (me + them) + 0.08)), mods };
}
function battle({ city, f, cost, title }) {
  return new Promise((resolve) => {
    const o = oddsFor(city, f), box = $("#battle-body"); G.modal = true;
    box.innerHTML = `<div class="ptitle">Battle</div><h2>${esc(title)}</h2><p class="sub2">Your crowd vs ${esc(f.name)}'s crowd in ${esc(city.name)}</p>
      <div class="vs"><div class="side" style="--c:${COL.you}">${avatar(G.player.image, G.player.name)}<b>${esc(G.player.name)}</b><span>power ${kfmt(o.me)}</span></div><div class="vsx">VS</div><div class="side" style="--c:${f.col}">${avatar(f.img, f.name)}<b>${esc(f.name)}</b><span>power ${kfmt(o.them)}</span></div></div>
      <div class="tug" style="--rc:${f.col}"><i id="tug" style="width:${o.p * 100}%"></i></div>
      <div class="odds">Odds of winning: <b>${Math.round(o.p * 100)}%</b>${o.mods.length ? ` · ${esc(o.mods.join(" · "))}` : ""}</div>
      <div class="verdict" id="verdict"></div>
      <div class="row2" id="brow"><button class="go" id="charge" ${G.buzz >= cost ? "" : "disabled"}>⚔ Charge · ⚡${cost}</button><button class="ghostbtn" id="retreat" style="margin-top:4px">Retreat</button></div>
      <p class="note" style="text-align:center;margin:10px 18px 0">Raise your odds first: send a Scout or Booker to ${esc(city.name)}, or fortify it.</p>`;
    $("#battle").hidden = false; Sound.play("threat");
    const close = (r) => { $("#battle").hidden = true; G.modal = false; resolve(r); };
    $("#retreat").onclick = () => close("cancel");
    $("#charge").onclick = async () => {
      G.buzz -= cost; hud(); $("#brow").innerHTML = ""; Sound.play("week");
      const win = Math.random() < o.p, t0 = performance.now(), tug = $("#tug");
      await new Promise((done) => { const step = (now) => { const k = (now - t0) / 2200; if (k >= 1) return done(); tug.style.width = `${Math.max(3, Math.min(97, o.p * 100 + Math.sin(k * 26) * 30 * (1 - k) + (win ? 1 : -1) * k * 40))}%`; requestAnimationFrame(step); }; requestAnimationFrame(step); });
      tug.style.width = win ? "100%" : "0%";
      const v = $("#verdict"); v.className = "verdict " + (win ? "win" : "lose"); v.textContent = win ? "VICTORY" : "REPELLED";
      Sound.play(win ? "conquer" : "lost");
      if (win && o.p < 0.5) ach("giant");
      if (!win) { event(`⚔ ${f.name} held ${city.name}. Prepare the city and try again.`, "bad"); ops(`<span class="rv">⚔ lost the battle for ${esc(city.name)}</span> · odds were ${Math.round(o.p * 100)}%`); }
      else ops(`<span class="ok">⚔ won the battle for ${esc(city.name)}</span> · odds were ${Math.round(o.p * 100)}%`);
      $("#brow").innerHTML = `<button class="go" id="bdone">${win ? "Claim it" : "Fall back"}</button>`;
      $("#bdone").onclick = () => close(win ? "win" : "lose");
    };
  });
}

// ---------------------------------------------------------------- parley (partnership negotiation)
// Three offers, odds from the Qloo barter score (how much of each crowd is new
// to the other, and how many would cross over). Shows the smallest offer
// that likely works, and a one-page pitch you can send for real.
function parley({ name, f, barter = 30, netnew = 0.6, convert = 0.8, city = null }) {
  return new Promise((resolve) => {
    if (G.modal) return resolve("cancel");
    G.modal = true; const box = $("#parley-body"), b = barter || 30, img = f?.img ?? null, col = f?.col ?? COL.allied;
    const clampP = (p) => Math.max(0.1, Math.min(0.95, p));
    const offers = [
      { id: "shout", name: "Shout-out swap", text: "You both post about each other this week.", buzz: 1, gold: 0, p: clampP(0.3 + b / 250) },
      { id: "cobill", name: "Co-headline, 50/50 door", text: `Split a night${city ? ` in ${city}` : ""}. Both crowds in one room.`, buzz: 0, gold: 150, p: clampP(0.55 + b / 200) },
      { id: "open", name: `Open for them${city ? ` in ${city}` : ""}`, text: "Take the smaller slot; they bring the crowd.", buzz: 3, gold: 0, p: clampP(0.72 + b / 300) },
    ];
    const best = offers.filter((x) => x.p >= 0.7).sort((x, y) => x.buzz * 40 + x.gold - (y.buzz * 40 + y.gold))[0];
    const pitch = `${G.player.name} × ${name}\n${Math.round(netnew * 100)}% of your crowd would be new to me, and ${Math.round(convert * 100)}% of my fans already over-index on you (Qloo).\nProposal: ${best ? best.name.toLowerCase() : "a co-bill"}${city ? ` in ${city}` : ""}. Same taste, different rooms: we both grow.`;
    box.innerHTML = `<div class="ptitle">Parley</div><h2>Parley with ${esc(name)}</h2><p class="sub2">Barter score ${b}/100 · ${Math.round(netnew * 100)}% of their crowd is new to you · ${Math.round(convert * 100)}% would cross over</p>
      <div class="vs"><div class="side" style="--c:${COL.you}">${avatar(G.player.image, G.player.name)}<b>You</b></div><div class="vsx" style="color:var(--good);text-shadow:0 0 18px rgba(225,189,255,.6)">🤝</div><div class="side" style="--c:${col}">${avatar(img, name)}<b>${esc(name)}</b></div></div>
      <div class="offers">${offers.map((x, i) => `<button class="offer${x === best ? " best" : ""}" data-of="${i}" ${(G.buzz >= x.buzz && G.gold >= x.gold) ? "" : "disabled"}><b>${esc(x.name)}${x === best ? " · smallest that likely works" : ""}</b><small>${esc(x.text)}</small><span class="pr"><em>${Math.round(x.p * 100)}%</em>${x.buzz ? `⚡${x.buzz}` : `🪙${x.gold}`}</span></button>`).join("")}</div>
      <div class="pitch">${esc(pitch)}</div>
      <div class="verdict" id="pverdict"></div>
      <div class="row2" id="prow"><button class="ghostbtn" id="pcopy" style="margin-top:4px">Copy the pitch</button><button class="ghostbtn" id="pclose" style="margin-top:4px">Walk away</button></div>`;
    $("#parley").hidden = false; Sound.play("alliance");
    const close = (r) => { $("#parley").hidden = true; G.modal = false; resolve(r); };
    $("#pclose").onclick = () => close("cancel");
    $("#pcopy").onclick = async () => { try { await navigator.clipboard.writeText(pitch); toast("Pitch copied. Send it for real."); } catch {} };
    $$("[data-of]").forEach((btn) => btn.addEventListener("click", async () => {
      const x = offers[+btn.dataset.of]; G.buzz -= x.buzz; G.gold -= x.gold; hud();
      $$("[data-of]").forEach((e) => (e.disabled = true)); const v = $("#pverdict"); v.className = "verdict"; v.textContent = "Waiting for their reply…";
      await sleep(1400);
      const yes = Math.random() < x.p;
      v.className = "verdict " + (yes ? "win" : "lose"); v.textContent = yes ? "DEAL!" : "THEY PASSED";
      Sound.play(yes ? "alliance" : "nope");
      if (yes) { G.pitches.push(pitch.replace(/\n/g, " ")); if (f) { f.allied = true; f.last = "Fighting at your side"; G.intents = G.intents.filter((it) => it.fid !== f.id); G.sieges = G.sieges.filter((s) => s.fid !== f.id); } G.allies++; ach("diplomat"); ops(`<span class="ok">🤝 ${esc(name)} accepted: ${esc(x.name)}</span>`); float(capP(), "🤝 ALLY", COL.allied); MapView.relayer(); }
      else ops(`<span class="rv">🕊 ${esc(name)} passed on ${esc(x.name)}</span>`);
      $("#prow").innerHTML = `<button class="go" id="pdone">${yes ? "Seal it" : "Close"}</button>`;
      $("#pdone").onclick = () => { hud(); close(yes ? "accept" : "reject"); };
    }));
  });
}

// ---------------------------------------------------------------- opportunities (timed quests)
// Built from live data: trends, your best-reacting cities, the brands your
// fans love, partners who are around. Claim before the world clock runs out.
function questTick() {
  if (G.hour < G.nextQuest) return;
  G.nextQuest = G.hour + 20 + G.rng() * 10;
  G.quests = G.quests.filter((q) => q.until > G.hour);
  if (G.quests.length >= 2) return;
  const pool = [];
  const pot = G.potions.find((p) => !p.used && !G.quests.some((q) => q.ref === p.title));
  if (pot) pool.push({ ref: pot.title, icon: "🔥", title: `Trend wave: “${pot.title}”`, text: `Trending in ${pot.where}. Post a take before it fades.`, reward: "+⚡3 +🪙40", claim: () => { pot.used = true; G.buzz = Math.min(BUZZ_MAX, G.buzz + 3); G.gold += 40; ach("surfer"); renderTrends(); } });
  const fans = G.cities.filter((c) => c.mean && sideOf(c) !== "fog" && !G.quests.some((q) => q.ref === c.name)).sort((a, b) => b.mean - a.mean)[(G.week + G.quests.length) % 3];
  if (fans) pool.push({ ref: fans.name, icon: "🎤", title: `Fan meetup in ${fans.name}`, text: `Fans there rated you ${fans.mean}/5. Host a pop-up before they cool off.`, reward: "+⚡1 +0.1 hype · city prepared", claim: () => { G.buzz = Math.min(BUZZ_MAX, G.buzz + 1); G.morale = Math.min(5, G.morale + 0.1); prep(fans, "fan meetup"); float(fans.p, "🎤 MEETUP", "#3dff9a"); } });
  const brand = (G.player.aud?.domains?.brand ?? []).find((x) => !G.sponsors.some((s) => s.name === x.name) && !G.quests.some((q) => q.ref === x.name));
  if (brand) pool.push({ ref: brand.name, icon: "💼", title: `${brand.name} wants a sponsored post`, text: `Your fans' taste neighbours love ${brand.name} (${Math.round(brand.affinity * 100)}% affinity, Qloo).`, reward: "+🪙90", claim: () => { G.gold += 90; float(capP(), "+🪙90"); } });
  const pal = [...G.fac.values()].find((f) => !f.allied && f.strategy === "ally" && !G.quests.some((q) => q.ref === f.name));
  if (pal) pool.push({ ref: pal.name, icon: "🕊️", title: `${pal.name} is booking an opener`, text: `${pal.plan.city ? `Show in ${pal.plan.city}. ` : ""}Shared taste, new crowd. Parley now.`, reward: "alliance chance", claim: () => parley({ name: pal.name, f: pal, barter: pal.plan.barter + 15, netnew: pal.plan.netnew, convert: pal.plan.convert, city: pal.plan.city }) });
  if (!pool.length) return;
  const q = pool[Math.floor(G.rng() * pool.length)]; q.id = "q" + Math.round(G.hour * 10); q.until = G.hour + 30;
  G.quests.push(q); Sound.play("tick"); event(`${q.icon} Opportunity: ${q.title}`, "good"); renderQuests();
}
function renderQuests() {
  if (!G) return;
  const before = G.quests.length; G.quests = G.quests.filter((q) => q.until > G.hour);
  if (G.quests.length < before) event("⌛ An opportunity expired.", "info");
  $("#quests").innerHTML = G.quests.map((q) => `<div class="quest"><span>${q.icon}</span><span><b>${esc(q.title)}</b><small>${esc(q.text)} <b style="color:#c9ffe4">${esc(q.reward)}</b></small><span class="tl">⏱ ${Math.max(0, Math.round(q.until - G.hour))}h left · until ${Clock.fmt(Math.min(167.9, q.until))}</span></span><button data-q="${q.id}">Claim</button></div>`).join("");
  $$("[data-q]").forEach((b) => b.addEventListener("click", () => { const q = G.quests.find((x) => x.id === b.dataset.q); if (!q) return; G.quests = G.quests.filter((x) => x !== q); q.claim(); ach("seize"); Sound.play("potion"); ops(`<span class="ok">${q.icon} claimed</span> ${esc(q.title)} · ${esc(q.reward)}`); hud(); renderQuests(); renderOrders(); }));
}

// trend radar: live Google Trends become potions; X and TikTok are honest "connect" slots
async function addTrends(geo, where) {
  const r = await api(`/api/trends?geo=${geo}`).catch(() => null);
  if (r?.status !== "ok") return [];
  const got = [];
  for (const it of r.items.slice(0, 3)) if (!G.potions.some((p) => p.title === it.title)) { const p = { ...it, where, used: false }; G.potions.unshift(p); got.push(p); }
  renderTrends(); return got;
}
async function loadTrends() {
  const target = G.c.territory.target?.name, st = target && STATE[target];
  await addTrends("US", "the US"); if (st) await addTrends(`US-${st}`, target);
  const el = $("#gt-state"); if (el) el.textContent = G.potions.length ? "live" : "unavailable";
}
function renderTrends() {
  $("#trends-n").textContent = G.potions.filter((p) => !p.used).length;
  if (Drawer.mode !== "trends") return;
  const box = $("#drawer-b");
  const pot = G.potions.slice(0, 5).map((p, i) => `<button class="potion${p.used ? " used" : ""}" data-p="${i}" ${p.used ? "disabled" : ""}><span>🧪</span><span>${esc(p.title)}<small>Trending in ${esc(p.where)} · ${esc(p.traffic || "rising")} searches</small></span><span class="use">${p.used ? "used" : "+⚡3"}</span></button>`).join("");
  const lock = [["𝕏", "X trends", "X's trends need the paid X API. Connect your X account to unlock this slot."], ["♪", "TikTok trends", "TikTok trends need TikTok's Research API. Connect your TikTok to unlock this slot."]]
    .map(([ic, n, why]) => `<button class="potion lock" data-lock="${esc(why)}"><span>${ic}</span><span>${n}<small>Not connected</small></span><span class="use">connect</span></button>`).join("");
  box.innerHTML = `<div class="trends">` + (pot || `<div class="note">Loading live Google Trends…</div>`) + lock + `</div>` + `<div class="note">Potion = post a take on that trend this week (+3 buzz). Tragedies are filtered out.</div>`;
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => drink(+b.dataset.p)));
  $$("[data-lock]").forEach((b) => b.addEventListener("click", () => toast(b.dataset.lock)));
}
function drink(i) {
  const p = G.potions[i]; if (!p || p.used || G.over) return;
  p.used = true; G.buzz = Math.min(BUZZ_MAX, G.buzz + 3); G.last = `Rode the trend “${p.title}”`;
  Sound.play("potion"); event(`🧪 You rode the trend “${p.title}” (${p.where}). +3 buzz.`, "good"); float(capP(), "+⚡3", "#7fd8ff");
  ops(`<span class="ag">🧪 you</span> posted a take on <b>${esc(p.title)}</b> <span class="ok">+3 ⚡</span>`); ach("surfer");
  renderTrends(); hud(); renderOrders(); council();
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
  { id: "herald", icon: "🎙️", name: "Herald", role: "Podcasts to guest on", src: "Qloo podcasts", cost: 90 },
  { id: "reader", icon: "🎭", name: "Room reader", role: "How a city's fans react, one by one", src: "1,000-fan panel", cost: 70 },
  { id: "trend", icon: "📈", name: "Trend hunter", role: "What's trending in that state", src: "Google Trends", cost: 60 },
  { id: "oracle", icon: "🌦️", name: "Weather oracle", role: "Picks the best show night", src: "Open-Meteo", cost: 40 },
  { id: "spy", icon: "🕵️", name: "Spy", role: "Rivals' fame and next move", src: "Wikipedia", cost: 100 },
  { id: "scribe", icon: "✍️", name: "Copywriter", role: "Drafts your post for the city", src: "Qloo tags", cost: 50 },
  { id: "showrunner", icon: "🎪", name: "Showrunner", role: "Plans a whole festival night", src: "Qloo all domains", cost: 250 },
  { id: "listener", icon: "👂", name: "Listener", role: "What Reddit says about you", src: "Reddit · connect", locked: true },
];
const deployCity = () => G.cities.find((c) => c.name === G.pinned) ?? G.cities.find((c) => c.name === G.orders[G.sel]?.city) ?? G.cities.find((c) => c.name === G.c.territory.target?.name) ?? G.cities.find((c) => c.name === G.capital);
function renderAgents() {
  const city = deployCity();
  const list = G.allAgents ? AGENTS : AGENTS.filter((a, i) => i < 6 || G.crew.get(a.id)?.recruited);
  $("#agents").innerHTML = list.map((a) => {
    const c = G.crew.get(a.id) ?? {};
    let btn;
    if (a.locked) btn = `<button data-lockag="1">Connect</button>`;
    else if (!c.recruited) btn = `<button data-rec="${a.id}" ${G.gold >= a.cost && !G.over ? "" : "disabled"}>Recruit 🪙${a.cost}</button>`;
    else if (c.busy) btn = `<button disabled>On mission</button>`;
    else if (c.week === G.week) btn = `<button disabled>Back next week</button>`;
    else btn = `<button data-dep="${a.id}" ${G.over ? "disabled" : ""}>Deploy → ${esc(city?.name ?? "")}</button>`;
    return `<div class="agent${c.busy ? " busy" : ""}${a.locked ? " lock" : ""}"><span class="ai">${a.icon}</span><span>${a.name}<small>${a.role}</small><span class="src${a.locked ? " no" : ""}">${a.src}</span></span>${btn}</div>`;
  }).join("") + (G.allAgents ? "" : `<button class="more" id="more-agents">+${AGENTS.length - list.length} more agents</button>`) + `<div class="note" style="margin-top:6px">Deploy goes to the city you clicked on the map, else your next move's city.</div>`;
  $("#more-agents")?.addEventListener("click", () => { G.allAgents = true; renderAgents(); });
  $$("[data-rec]").forEach((b) => b.addEventListener("click", () => recruit(b.dataset.rec)));
  $$("[data-dep]").forEach((b) => b.addEventListener("click", () => deploy(b.dataset.dep)));
  $$("[data-lockag]").forEach((b) => b.addEventListener("click", () => toast("Reddit blocks anonymous apps. Connect a Reddit account to unlock the Listener.")));
}
function recruit(id) {
  const a = AGENTS.find((x) => x.id === id); if (!a || G.gold < a.cost) return;
  G.gold -= a.cost; G.crew.set(id, { recruited: true, week: 0, busy: false });
  Sound.play("alliance"); event(`🤖 ${a.name} agent recruited.`, "good"); ops(`<span class="ag">${a.icon} ${a.name}</span> joined your army · ready to deploy`); float(capP(), `${a.icon} +1`, "#7fd8ff");
  if ([...G.crew.values()].filter((c) => c.recruited).length >= 3) ach("warlord");
  hud(); renderAgents(); renderOrders();
}
function prep(city, why) {
  if (!G.prep.has(city.name)) { G.prep.add(city.name); ops(`<span class="ok">✓ ${esc(city.name)} prepared</span>: its orders cost ⚡1 less, gain +2%, battles there +30% (${esc(why)})`); float(city.p, "✓ PREPARED", "#7fd8ff"); }
  renderOrders();
}
async function deploy(id) {
  const a = AGENTS.find((x) => x.id === id), c = G.crew.get(id), city = deployCity(); if (!a || !c || c.busy || !city) return;
  c.busy = true; c.week = G.week; renderAgents();
  await runAgent(a, city);
  c.busy = false; hud(); renderAgents(); renderOrders(); council();
}
async function runAgent(a, city) {
  const id = a.id;
  const home = G.cities.find((x) => x.name === G.capital) ?? city;
  const u = { icon: a.icon, from: home.p, to: city.p, t0: performance.now(), dur: 2200, phase: "go" }; G.units.push(u);
  Sound.play("select"); ops(`<span class="ag">${a.icon} ${a.name}</span> marching to <b>${esc(city.name)}</b>`);
  await sleep(2200); u.phase = "work";
  let out = null;
  try { out = await AGENT_JOBS[id](city); } catch (e) { out = { line: `<span class="rv">came back empty-handed (${esc(e?.message ?? e)})</span>` }; }
  u.phase = "back"; u.t0 = performance.now(); u.dur = 1800;
  ops(`<span class="ag">${a.icon} ${a.name}</span> @ ${esc(city.name)} → ${out.line}`);
  if (out.intel) { G.intel.set(city.name, [...(G.intel.get(city.name) ?? []).filter((x) => x[0] !== out.intel[0]), out.intel]); if (G.pinned === city.name) cityPanel(city); }
  if (out.float) float(city.p, out.float, "#7fd8ff");
  Sound.play("potion"); G.missions++;
  setTimeout(() => { G.units = G.units.filter((x) => x !== u); }, 1800);
}
const pick = (arr, used) => (arr ?? []).find((x) => !used.has(x.name));
const AGENT_JOBS = {
  async scout(city) {
    const r = await api(`/api/partners?${qs({ ...G.player.q, kind: "brands", location: city.name })}`);
    const names = (r.partners || []).slice(0, 3).map((p) => p.name);
    if (!names.length) return { line: "Qloo had nothing distinctive here." };
    prep(city, "Scout intel");
    return { line: `<span class="api">Qloo · brands × ${esc(city.name)}</span> your fans here also love <b>${names.map(esc).join(", ")}</b>`, intel: `🔭 Fans here also love ${names.join(", ")}. Mention them on stage.` };
  },
  async booker(city) {
    const r = await api(`/api/partners?${qs({ ...G.player.q, kind: "venues", location: city.name })}`);
    const v = (r.partners || []).slice(0, 2);
    if (!v.length) return { line: "no stage cleared the bar." };
    prep(city, `${v[0].name} on hold`);
    return { line: `<span class="api">Qloo · places × ${esc(city.name)}</span> best stage: <b>${esc(v[0].name)}</b> (${Math.round(v[0].convert * 100)}% crowd fit)${v[1] ? `, backup ${esc(v[1].name)}` : ""}`, intel: `🎟️ Book ${v[0].name}${v[1] ? ` (backup: ${v[1].name})` : ""}.` };
  },
  async diplomat(city) {
    const cand = [...G.fac.values()].filter((f) => !f.allied && f.strategy === "ally").sort((a, b) => b.plan.barter - a.plan.barter)[0];
    const ally = cand ? { name: cand.name, f: cand, barter: cand.plan.barter, netnew: cand.plan.netnew, convert: cand.plan.convert, city: cand.plan.city ?? city.name }
      : (G.c.allies || []).filter((a) => !G.parleyed.has(a.name)).map((a) => ({ name: a.name, f: null, barter: a.barter, netnew: a.netnew, convert: a.convert, city: city.name }))[0];
    if (!ally) return { line: "no partner left who isn't already with you." };
    G.parleyed.add(ally.name);
    setTimeout(() => parley(ally), 600);
    return { line: `<span class="api">Qloo · taste overlap</span> best partner: <b>${esc(ally.name)}</b> (barter ${ally.barter}/100, ${Math.round(ally.netnew * 100)}% new crowd) → parley opened, pitch drafted` };
  },
  async sponsor(city) {
    const used = new Set(G.sponsors.map((s) => s.name)), b = pick(G.player.aud?.domains?.brand, used);
    if (!b) return { line: "no new brand fits your crowd." };
    const perWeek = Math.round(20 + b.affinity * 50); G.sponsors.push({ name: b.name, perWeek }); ach("paid");
    return { line: `<span class="api">Qloo · brands your fans love</span> <b>${esc(b.name)}</b> (${Math.round(b.affinity * 100)}% affinity) signs on <span class="ok">+🪙${perWeek}/week</span>`, intel: `💼 Sponsor: ${b.name} (+${perWeek} gold a week).`, float: `💼 +🪙${perWeek}/wk` };
  },
  async herald(city) {
    G.heard ??= new Set(); const p = pick(G.player.aud?.domains?.podcast, G.heard);
    if (!p) return { line: "no new podcast fits." }; G.heard.add(p.name);
    G.morale = Math.min(5, G.morale + 0.15); G.buzz = Math.min(BUZZ_MAX, G.buzz + 2);
    return { line: `<span class="api">Qloo · podcasts your fans follow</span> guest spot on <b>${esc(p.name)}</b> (${Math.round(p.affinity * 100)}% fan affinity) <span class="ok">+⚡2 · hype +0.15</span>`, intel: `🎙️ Pitch a guest spot on ${p.name}.`, float: "🎙️ +⚡2" };
  },
  async reader(city) {
    const ppl = (G.player.aud?.personas ?? []).filter((p) => p.metro === city.name);
    if (!ppl.length) return { line: "no simulated fans live here." };
    const scored = ppl.map((p) => ({ ...p, s: G.reactions.get(p.id) })).filter((p) => p.s != null).sort((a, b) => b.s - a.s);
    const show = [scored[0], scored[Math.floor(scored.length / 2)], scored.at(-1)].filter((x, i, a) => x && a.indexOf(x) === i);
    Neuro.play(G.c.tribe); brainNote(); prep(city, "room read");
    const fmtP = (p) => `${p.gender} ${p.age}, into ${esc(p.tastes.slice(-1)[0] ?? "comedy")} → ${"★".repeat(p.s)}`;
    return { line: `<span class="api">panel · ${scored.length} fans in ${esc(city.name)}</span> ${show.map(fmtP).join(" · ")}`, intel: `🎭 ${scored.length} simulated fans here; best reaction from ${show[0]?.tastes.slice(-1)[0] ?? "your core"} fans.` };
  },
  async trend(city) {
    const st = STATE[city.name]; const got = await addTrends(st ? `US-${st}` : "US", city.name);
    if (!got.length) return { line: "nothing new trending there right now." };
    return { line: `<span class="api">Google Trends · ${st ?? "US"}</span> rising: <b>${got.map((p) => esc(p.title)).join(", ")}</b> → new potions`, intel: `📈 Trending around ${city.name}: ${got.map((p) => p.title).join(", ")}.` };
  },
  async oracle(city) {
    const [lon, lat] = METROS[city.name]; const r = await api(`/api/weather?lat=${lat}&lon=${lon}`);
    if (r.status !== "ok" || !r.days?.length) return { line: "the forecast is down." };
    const nice = (x) => new Date(x.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const best = [...r.days].sort((a, b) => a.rain - b.rain || [5, 6, 4].indexOf(new Date(b.date).getDay()) - [5, 6, 4].indexOf(new Date(a.date).getDay()))[0];
    const worst = [...r.days].sort((a, b) => b.rain - a.rain)[0];
    G.morale = Math.min(5, G.morale + 0.1); prep(city, `dry show night ${nice(best)}`);
    return { line: `<span class="api">Open-Meteo · ${esc(city.name)}</span> best show night <b>${nice(best)}</b> (${best.rain}% rain, ${Math.round(best.tmax)}°C)${worst.rain >= 50 ? `; avoid ${nice(worst)} (${worst.rain}% rain)` : ""} <span class="ok">hype +0.1</span>`, intel: `🌦️ Play ${nice(best)}: ${best.rain}% chance of rain.` };
  },
  async spy(city) {
    const names = [G.player.name, ...[...G.fac.values()].map((f) => f.name)];
    const r = await api(`/api/fame?names=${encodeURIComponent(names.join("|"))}`);
    if (r.status === "ok") for (const p of r.people) G.fame.set(p.name, p);
    const it = G.intents[0], f = it && G.fac.get(it.fid);
    factions(); renderThreats();
    const fm = (n) => { const p = G.fame.get(n); return p?.views != null ? `${esc(n)} ${kfmt(p.views)}${p.momentum != null ? ` ${p.momentum >= 0 ? "▲" : "▼"}${Math.abs(p.momentum)}%` : ""}` : `${esc(n)} n/a`; };
    if (it) G.intel.set(it.city, [...(G.intel.get(it.city) ?? []), `🕵️ ${f?.name} attacks here Sunday. Fortify or strike first.`]);
    return { line: `<span class="api">Wikipedia · 30-day views</span> ${names.map(fm).join(" · ")}${it ? ` → <span class="rv">${esc(f?.name)} hits ${esc(it.city)} Sunday</span>` : " → no attack planned this week"}` };
  },
  async scribe(city) {
    const tags = (G.player.aud?.tags || []).filter((t) => !/protagonist|fiction|animated|minions|dinosaur|zoo|organic|academic/i.test(t)).slice(0, 2);
    const tr = G.potions.find((p) => !p.used && p.where === city.name) ?? G.potions.find((p) => !p.used);
    const post = `${city.name}! If you grew up on ${tags[0] || "great comedy"}${tags[1] ? ` and ${tags[1]}` : ""}, this one's for you. ${tr ? `Got thoughts on ${tr.title}. ` : ""}New set, one night only. 🎤`;
    G.buzz = Math.min(BUZZ_MAX, G.buzz + 1); G.drafts.push(post);
    try { await navigator.clipboard.writeText(post); } catch {}
    return { line: `<span class="api">Qloo tags${tr ? " + Trends" : ""}</span> draft: “${esc(post)}” <span class="ok">+1 ⚡ · copied</span>`, intel: `✍️ Post ready: “${post}”`, float: "✍️ +⚡1" };
  },
  async showrunner(city) {
    if (sideOf(city) !== "you") return { line: `<span class="rv">a festival needs a city you hold; ${esc(city.name)} isn't yours yet.</span>` };
    const d = G.player.aud?.domains ?? {};
    const venue = (G.intel.get(city.name) ?? []).find((t) => t.startsWith("🎟️"))?.replace(/^🎟️ Book /, "").replace(/ \(.*$|\.$/g, "") ?? (city.name === G.c.territory.target?.name ? G.c.venues?.[0]?.name : null) ?? "the biggest room in town";
    const dj = d.artist?.[0]?.name, brand = G.sponsors[0]?.name ?? d.brand?.[0]?.name, host = d.podcast?.[0]?.name, film = d.movie?.[0]?.name;
    const plan = `${venue} · DJ set in the spirit of ${dj ?? "your crowd's favourites"} · sponsored by ${brand ?? "a local brand"}${host ? ` · hosted with ${host}` : ""}${film ? ` · ${film} watch-party after` : ""}`;
    G.gold += 200; G.conquest = Math.min(100, G.conquest + 3); G.morale = Math.min(5, G.morale + 0.2); boom(city.p, COL.you); ach("fest");
    return { line: `<span class="api">Qloo · artists, brands, podcasts, films</span> festival night in <b>${esc(city.name)}</b>: ${esc(plan)} <span class="ok">+🪙200 · +3% · hype +0.2</span>`, intel: `🎪 Festival: ${plan}.`, float: "🎪 +🪙200 +3%" };
  },
};
// the city a rival would move on next: your city where they're relatively strongest
function preyOf(f) {
  const mine = G.cities.filter((c) => sideOf(c) === "you" && !G.sieges.some((s) => s.city === c.name));
  const rel = (c) => (c.rivals.find((r) => r.id === f.id)?.count ?? 0) / Math.max(1, c.you);
  return mine.filter((c) => c.contested === f.name || rel(c) > 0.5).sort((a, b) => rel(b) - rel(a))[0];
}
// at the start of each week, rivals decide who they'll attack, and the radar shows it
function planIntents() {
  planIntentsRaw();
  G.intents.sort((a, b) => (G.fac.get(a.fid)?.strategy === "compete" ? 0 : 1) - (G.fac.get(b.fid)?.strategy === "compete" ? 0 : 1));
  G.intents = G.intents.slice(0, 2);
  for (const it of G.intents) ops(`<span class="rv">📡 radar: ${esc(G.fac.get(it.fid)?.name)}</span> is massing toward <b>${esc(it.city)}</b> · arrives Sunday`);
}
function planIntentsRaw() {
  G.intents = [];
  for (const f of G.fac.values()) {
    if (f.allied) continue;
    const prey = preyOf(f); if (!prey) continue;
    const mo = G.fame.get(f.name)?.momentum ?? 0, aggr = (f.strategy === "compete" ? 0.75 : 0.25) + (mo > 10 ? 0.15 : 0) + (G.week > 1 ? 0.1 : -0.2);
    if (G.rng() >= aggr) continue;
    const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
    const from = nearest(theirs, prey)?.p ?? [Math.max(20, Math.min(MW - 20, prey.p[0] + (prey.p[0] > MW / 2 ? 260 : -260))), Math.max(20, prey.p[1] - 180)];
    G.intents.push({ fid: f.id, city: prey.name, from });
  }
}

// ---------------------------------------------------------------- orders, forecasts, previews
const FORECAST = {
  take: (o) => [["Mon", `Booker holds ${G.c.venues?.[0]?.name ?? "a room"} in ${o.city}`], ["Thu", `Show night in ${o.city}`], ["Sun", `${o.city} flips to you · +${gainOf(o)}%`]],
  hold: (o) => [["Tue", `Test a ${o.city}-tuned version on its fans`], ["Fri", "Play the new version"], ["Sun", `${o.city} secured · +${gainOf(o)}%`]],
  rivalry: (o) => [["Mon", `Book against ${o.rival} in ${o.city}`], ["Sat", "Head-to-head: a battle with real odds"], ["Sun", `Win it: ${o.city} is yours, +${gainOf(o)}%`]],
  alliance: (o) => [["Mon", `Parley with ${o.rival}: pick an offer`], ["Wed", "Collab post goes live"], ["Sun", `Their fans meet you · +${gainOf(o)}% · +1 ⚡/week`]],
  ally: (o) => [["Mon", `Parley with ${o.title.replace(/^Recruit /, "")}: pick an offer`], ["Wed", "Shout-out swap goes live"], ["Sun", `+${gainOf(o)}% · +1 ⚡ every week`]],
  edit: () => [["Mon", "Cut the slow stretches the brain model flagged"], ["Wed", "Re-test on 1,000 fans"], ["Fri", "Hype +0.3 · the brain lights up · more buzz weekly"]],
  defend: (o) => [["Tue", `Drop content aimed at ${o.city}`], ["Thu", "Battle to break the siege"], ["Sun", "Win it: the city stays yours"]],
};
function skipText(o) {
  const nem = [...G.fac.values()].find((f) => f.strategy === "compete" && !f.allied);
  if (o.kind === "defend") { const sg = G.sieges.find((s) => s.city === o.city), ct = G.cities.find((c) => c.name === o.city); return `If you ignore it: ${o.city} falls in ${sg?.left ?? 1} week${(sg?.left ?? 1) > 1 ? "s" : ""}, −${ct ? pts(ct) : 0}% conquest.`; }
  if (o.kind === "take") return `If you wait: ${nem ? `${nem.name} may get there first` : "the crowd cools off"}.`;
  if (o.kind === "hold") return `If you wait: ${o.city} stays shaky, an easy siege for a rival.`;
  if (o.kind === "rivalry") return `If you wait: ${o.rival} digs in deeper.`;
  if (o.kind === "edit") return "If you skip it: weaker material means less buzz every week.";
  return "If you wait: they may pick a different co-headliner.";
}
function sparkline(o) {
  const W = 260, H = 44, wk = G.week, g = o.kind === "defend" ? 0 : gainOf(o), cur = G.conquest;
  const sg = G.sieges.find((s) => s.city === o.city), loss = o.kind === "defend" && sg ? pts(G.cities.find((c) => c.name === o.city)) : 0;
  const withP = [], without = [];
  for (let w = wk; w <= WEEKS; w++) { withP.push(cur + (w > wk ? g : 0)); without.push(cur - (loss && w >= wk + (sg?.left ?? 1) ? loss : 0)); }
  const lo = Math.min(...withP, ...without) - 2, hi = Math.max(...withP, ...without) + 2, n = Math.max(1, withP.length - 1);
  const P = (arr) => arr.map((v, i) => `${(i / n) * (W - 40) + 4},${H - 6 - ((v - lo) / (hi - lo)) * (H - 14)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" aria-label="Projected conquest with and without this order"><polyline points="${P(without)}" fill="none" stroke="#5f5f66" stroke-width="1.5" stroke-dasharray="4 3"/><polyline points="${P(withP)}" fill="none" stroke="#ffb829" stroke-width="2.2"/><text x="${W - 34}" y="12" fill="#ffb829" font-size="10" font-family="IBM Plex Mono">${withP.at(-1)}%</text><text x="${W - 34}" y="${H - 4}" fill="#8a8f99" font-size="10" font-family="IBM Plex Mono">${without.at(-1)}%</text></svg>`;
}
function recommended() {
  const open = G.orders.map((o, i) => [o, i]).filter(([o]) => !o.done);
  const d = open.find(([o]) => o.kind === "defend"); if (d) return d[1];
  const aff = open.filter(([o]) => costOf(o) <= G.buzz && o.gain).sort(([a], [b]) => gainOf(b) / costOf(b) - gainOf(a) / costOf(a));
  return (aff[0] ?? open[0])?.[1] ?? -1;
}
function actionLabel(o, c, can) {
  const ct = o.city && G.cities.find((x) => x.name === o.city), foe = (o.kind === "rivalry" || o.kind === "defend") && ct;
  return can ? (foe ? `⚔ To battle · ⚡${c}` : o.kind === "alliance" || o.kind === "ally" ? "🕊 Open parley" : `🚩 Execute · ⚡${c}`) : G.busy ? "…" : `Need ⚡${c}`;
}
function renderPrimary() {
  const rec = recommended(), i = G.sel >= 0 && G.orders[G.sel] && !G.orders[G.sel].done ? G.sel : rec, o = G.orders[i];
  G.primary = i;
  if (!o) { $("#primary").innerHTML = `<div class="pcard empty">Every order is done. Let the week run out, or end it.</div>`; $("#mbar").innerHTML = ""; return; }
  const c = costOf(o), g = gainOf(o), can = c <= G.buzz && !G.busy && !G.over, ct = o.city && G.cities.find((x) => x.name === o.city);
  const foe = (o.kind === "rivalry" || o.kind === "defend") && ct && (facByName(o.rival) ?? G.fac.get(G.sieges.find((s) => s.city === o.city)?.fid));
  $("#primary").innerHTML = `<div class="pcard"><div class="pk">${ICON[o.kind] ?? ""} ${o.kind === "edit" ? "sharpen" : o.kind}${i === rec ? ' · <span style="color:var(--good)">recommended</span>' : ""}${o.city && G.prep.has(o.city) ? ' · <span style="color:#7fd8ff">prepared ✓</span>' : ""}</div>
    <h3>${esc(o.title)}</h3>
    <div class="pg">${g ? `<b>+${g}% conquest</b>` : "<b>keeps your ground</b>"}<span>⚡${c}</span>${foe ? `<span>${Math.round(oddsFor(ct, foe).p * 100)}% odds</span>` : ""}</div>
    <div class="why">${esc(o.detail)}<span class="rc">Source: ${esc(o.receipt)}</span></div>
    <div class="fc"><b>WHAT HAPPENS</b><ol>${(FORECAST[o.kind]?.(o) ?? []).map(([d, t]) => `<li><span>${d}</span>${esc(t)}</li>`).join("")}</ol><div class="skip">${esc(skipText(o))}</div>${sparkline(o)}</div>
    <div class="orow"><button class="go" id="p-exec" ${can ? "" : "disabled"}>${actionLabel(o, c, can)}</button><button class="ghostbtn" id="p-prev">▶ Preview</button></div></div>`;
  $("#p-exec").onclick = () => execute(i); $("#p-prev").onclick = () => preview(o);
  $("#mbar").innerHTML = `<span>${esc(o.title)}${g ? ` · +${g}%` : ""}</span><button class="go" id="m-exec" ${can ? "" : "disabled"}>${actionLabel(o, c, can)}</button>`;
  $("#m-exec").onclick = () => execute(i);
}
function renderOrders() {
  renderPrimary();
  $("#ocount").textContent = `· ${G.orders.filter((o) => !o.done).length}`;
  $("#endturn").disabled = G.busy || G.over;
  if (Drawer.mode === "orders") Drawer.render();
}
function ordersHtml() {
  return `<div class="orders">` + G.orders.map((o, i) => {
    const c = costOf(o), g = gainOf(o), can = !o.done && c <= G.buzz && !G.busy && !G.over, prepped = o.city && G.prep.has(o.city);
    const ct = o.city && G.cities.find((x) => x.name === o.city), foe = (o.kind === "rivalry" || o.kind === "defend") && ct && (facByName(o.rival) ?? G.fac.get(G.sieges.find((s) => s.city === o.city)?.fid));
    const odds = foe ? ` · ${Math.round(oddsFor(ct, foe).p * 100)}% odds` : "";
    return `<div class="order${o.done ? " done" : ""}${i === G.sel ? " sel" : ""}${o.kind === "defend" && !o.done ? " defend" : ""}">
      <button class="ohead" data-o="${i}"><span class="oi">${ICON[o.kind] ?? "•"}</span><span><span class="ok">${i + 1} · ${o.kind === "edit" ? "sharpen" : o.kind}${prepped ? ' · <span style="color:#7fd8ff">prepared ✓</span>' : ""}</span><h4>${esc(o.title)}</h4><span class="og">${g ? `+${g}% conquest` : "keeps your ground"}${odds}</span></span><span class="cost${c <= G.buzz ? "" : " no"}">⚡${c}</span></button>
      <div class="obody"><div class="gen">${GENERAL}<div>${esc(o.detail)}<span class="rc">Source: ${esc(o.receipt)}${g ? ` · +${g}% conquest (projected)` : ""}</span></div></div>
      ${o.done ? "" : `<div class="fc"><b>WHAT HAPPENS</b><ol>${(FORECAST[o.kind]?.(o) ?? []).map(([d, t]) => `<li><span>${d}</span>${esc(t)}</li>`).join("")}</ol><div class="skip">${esc(skipText(o))}</div>${sparkline(o)}</div>
      <div class="orow"><button class="go" data-x="${i}" ${can ? "" : "disabled"}>${can ? (foe ? `⚔ To battle · ⚡${c}` : o.kind === "alliance" || o.kind === "ally" ? "🕊 Open parley" : `Execute · ⚡${c}`) : G.busy ? "…" : `Need ⚡${c}`}</button><button class="ghostbtn" data-pv="${i}">▶ Preview</button></div>`}</div></div>`;
  }).join("") + "</div>";
}
// the right-hand drawer: all orders, live trends, or this week's real-world moves
const Drawer = {
  mode: null,
  open(mode) { this.mode = mode; $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); this.render(); },
  close() { this.mode = null; $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); },
  render() {
    if (!G || !this.mode) return;
    const b = $("#drawer-b");
    if (this.mode === "orders") {
      $("#drawer-t").textContent = "All orders"; b.innerHTML = ordersHtml();
      $$("#drawer-b [data-o]").forEach((x) => x.addEventListener("click", () => { selectOrder(+x.dataset.o); this.close(); }));
      $$("#drawer-b [data-x]").forEach((x) => x.addEventListener("click", () => { this.close(); execute(+x.dataset.x); }));
      $$("#drawer-b [data-pv]").forEach((x) => x.addEventListener("click", () => preview(G.orders[+x.dataset.pv])));
    } else if (this.mode === "trends") { $("#drawer-t").textContent = "Trend potions"; renderTrends(); }
    else if (this.mode === "moves") { $("#drawer-t").textContent = "This week's moves"; b.innerHTML = movesHtml(); $("#moves-copy").onclick = async () => { try { await navigator.clipboard.writeText(battlePlan()); toast("Copied. Go make it real."); } catch { toast("Couldn't reach the clipboard."); } }; }
  },
};
// the real-world to-do list, built from everything the agents and orders found
function movesHtml() {
  const rec = G.orders[recommended()];
  const row = (ic, t, src) => `<div class="move">${ic}<span>${esc(t)}${src ? `<small>${esc(src)}</small>` : ""}</span></div>`;
  const doNow = rec ? [row("🚩", `${rec.title}: ${rec.detail}`, rec.receipt)] : [];
  const done = G.doneLog.map((o) => row("✓", `${o.title}: ${o.detail}`, o.receipt));
  const intel = [...G.intel.entries()].flatMap(([city, ts]) => ts.map((t) => row("📡", `${city}: ${t.replace(/^\S+\s/, "")}`, "agent intel")));
  const money = G.sponsors.map((x) => row("💼", `Pitch ${x.name} a sponsored post (+${x.perWeek} gold a week in-game).`, "Qloo brands your fans love"));
  const posts = G.drafts.map((x) => row("✍️", `Post: ${x}`, "Copywriter"));
  const deals = G.pitches.map((x) => row("🕊", x, "Parley pitch"));
  const trends = G.potions.filter((p) => p.used).map((p) => row("🧪", `Post a take on “${p.title}” (trending in ${p.where}).`, "Google Trends"));
  const grp = (t, a) => (a.length ? `<div class="dgroup">${t}</div>${a.join("")}` : "");
  return `<div class="moves">${grp("Do next", doNow)}${grp("You committed to", done)}${grp("Deals to send", deals)}${grp("Money", money)}${grp("Posts", [...posts, ...trends])}${grp("Intel from your agents", intel)}</div>
    <button class="go" id="moves-copy" style="margin-top:12px">Copy my battle plan</button><p class="note">Every line came from live data or your simulated fans. Do them for real.</p>`;
}
function preview(o) {
  if (!o) return;
  const city = o.city ?? G.capital, g = gainOf(o);
  G.preview = { city, t0: performance.now(), label: o.kind === "defend" ? "HOLDS" : g ? `+${g}%` : "+⚡", col: o.kind === "alliance" || o.kind === "ally" ? COL.allied : COL.you };
}
function selectOrder(i) {
  if (!G || G.busy || !G.orders[i]) return; G.sel = i; Sound.play("select"); renderOrders(); renderAgents(); preview(G.orders[i]);
}
// fast-forward the whole plan as ghosts on the map
async function simulatePlan() {
  if (!G || G.busy || G.simulating) return;
  const open = G.orders.filter((o) => !o.done); if (!open.length) return toast("No orders left to simulate.");
  G.simulating = true; let c = G.conquest;
  ops(`<span class="api">simulation</span> running your remaining ${open.length} orders…`);
  for (const o of open) { preview(o); c = Math.min(100, c + gainOf(o)); event(`▶ ${o.title}: conquest → ${c}%`, "you"); Sound.play("tick"); await sleep(1100); }
  const [, n, name] = ageOf(c);
  banner(`PROJECTED: ${c}%`, `Age ${n} · ${name}, if you execute every order`); Sound.play("ageup");
  ops(`<span class="ok">simulation</span> all orders → <b>${c}%</b> conquest, Age ${n} · ${name} (battles and rivals not counted)`);
  G.simulating = false;
}

// ---------------------------------------------------------------- the game
async function startGame(c, player) {
  await Atlas.ready;
  const cities = c.territory.cities.filter((x) => METROS[x.name]).map((x) => ({ ...x, p: ALB(METROS[x.name]) })).filter((x) => x.p);
  const fac = new Map(c.rivals.map((r, i) => [r.id, { id: r.id, name: r.name, col: RIVAL_COLS[i % 3], strategy: r.strategy, allied: false, plan: r, img: qlooImg(r.id), last: r.holds.length ? `Holds ${r.holds.slice(0, 2).join(", ")}` : "Scouting your fans" }]));
  G = { c, player, cities, fac, week: 1, hour: 9, conquest: c.territory.conquest, start: c.territory.conquest, startHeld: 0, orders: c.missions.map((m) => ({ ...m, done: false })), sel: 0, allies: 0, taken: 0, saved: 0, lost: 0, missions: 0, buzz: 8, gold: 300, morale: c.aggregate.mean, sieges: [], intents: [], forts: new Set(), quests: [], nextQuest: 14, potions: [], sponsors: [], fx: [], temp: [], units: [], floats: [], anim: null, busy: false, over: false, simulating: false, modal: false, capital: c.territory.capital?.name, pinned: null, last: "Took the field", prep: new Set(), intel: new Map(), fame: new Map(), crew: new Map(), parleyed: new Set(), reactions: new Map(), drafts: [], pitches: [], doneLog: [], opsN: 0, allAgents: false, coach: false, sheet: null, ach: new Set(), achPts: 0, preview: null, rng: mulberry([...player.name].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7)) };
  assignStates(); G.startHeld = held(); G.layer = null; lastOrb = {};
  for (const f of fac.values()) portrait(f.img); portrait(player.image);

  $("#site").hidden = true; $("#scan").hidden = true; $("#game").hidden = false; scrollTo(0, 0);
  Field.setMode("panel", $("#brainp")); Neuro.play(c.tribe); brainNote();
  $("#legend").innerHTML = [["You", COL.you], ...[...fac.values()].map((f) => [f.name, f.col]), ["Allied", COL.allied], ["Open ground", COL.open], ["Uncharted", COL.fog]].map(([n, col]) => `<span><i style="background:${col}"></i>${esc(n)}</span>`).join("") + `<span style="color:#3dff9a">◯ ripe to take</span>`;
  $("#ops").innerHTML = ""; $("#quests").innerHTML = ""; $("#ops-count").textContent = ""; Clock.reset(); Drawer.close(); tab("agents");
  $("#legend").classList.remove("hide"); setTimeout(() => $("#legend").classList.add("hide"), 4000);
  planIntents();
  playerCard(); renderTrends(); hud(); renderOrders(); renderAgents(); $("#cityp").hidden = true; $("#victory").hidden = true;
  const nem = c.rivals.find((r) => r.strategy === "compete");
  typeInto($("#brief"),
    `Commander ${player.name.split(" ")[0]}, you hold ${held()} of ${ground()} cities. ${nem ? `${nem.name} is your nemesis: same fans, same taste. ` : ""}The clock is running: ${WEEKS} weeks. Spend ⚡ on orders, 🪙 on agents, watch the radar for incoming rivals, and grab opportunities before they expire.`,
    `Source: Qloo taste graph + 1,000-fan panel · ${c.receipts?.length ?? 0} live calls logged`);
  ops(`<span class="api">Qloo</span> mapped ${cities.length} cities, ${c.rivals.length} rivals, ${c.missions.length} orders · ${c.receipts?.length ?? 0} live calls`);
  const ev = [[`Commander ${player.name} has taken the field.`, "you"], [`Your capital is ${G.capital ?? "not yet chosen"}.`, "info"], [`${c.rivals.length} rivals spotted fighting for your fans.`, "bad"], [`${c.territory.target ? `Scouts report ${c.territory.target.name} is ripe for conquest.` : "Scouts are still reading the map."}`, "good"]];
  ev.forEach(([t, k], i) => setTimeout(() => event(t, k), 400 + i * 900));
  Sound.play("ageup");
  loadTrends();
  let coached = false; try { coached = localStorage.getItem("conquest-coached") === "1"; } catch {}
  if (!coached) setTimeout(() => Coach.start(), 900);
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

async function execute(i) {
  const o = G?.orders[i]; if (!o || o.done || G.busy || G.over || G.modal) return;
  const cost = costOf(o), gain = gainOf(o);
  if (cost > G.buzz) { const ob = $("#orb-buzz"); ob.classList.remove("short"); void ob.offsetWidth; ob.classList.add("short"); Sound.play("nope"); toast(`Not enough buzz: this needs ⚡${cost}. Claim an opportunity, drink a potion or let the week end.`); return; }
  const ct = o.city ? G.cities.find((c) => c.name === o.city) : null;
  let paid = false;
  // fights are battles with real odds; partnerships are negotiations
  if (o.kind === "rivalry" || o.kind === "defend") {
    const foe = facByName(o.rival) ?? G.fac.get(G.sieges.find((s) => s.city === o.city)?.fid) ?? [...G.fac.values()][0];
    if (ct && foe) { const r = await battle({ city: ct, f: foe, cost, title: o.kind === "defend" ? `Break the siege · ${ct.name}` : `Battle for ${ct.name}` }); if (r !== "win") { hud(); renderOrders(); council(); return; } paid = true; }
  } else if (o.kind === "alliance" || o.kind === "ally") {
    const name = o.rival ?? o.title.replace(/^Recruit /, ""), f = facByName(name), a = (G.c.allies || []).find((x) => x.name === name);
    const r = await parley({ name, f, barter: f?.plan.barter ?? a?.barter, netnew: f?.plan.netnew ?? a?.netnew, convert: f?.plan.convert ?? a?.convert, city: o.city ?? f?.plan.city });
    if (r !== "accept") { hud(); renderOrders(); council(); return; }
    paid = true; G.allies--; // parley already counted the ally
  }
  G.busy = true; o.done = true; if (!paid) G.buzz -= cost;
  const before = ageOf(G.conquest);
  let title = "", sub = gain ? `+${gain}% conquest (projected)` : "";
  if (o.kind === "defend") {
    G.sieges = G.sieges.filter((s) => s.city !== o.city); if (ct) ct.contested = null; G.saved++; ach("wall");
    title = `${o.city} holds!`; sub = "The siege is broken"; event(`🛡️ ${o.city} holds. The siege is broken.`, "you"); Sound.play("conquer");
  } else if (o.kind === "take" || o.kind === "hold" || o.kind === "rivalry") {
    if (ct) { if (ct.state === "rival") G.taken++; ct.state = "stronghold"; ct.owner = "you"; ct.contested = null; G.sieges = G.sieges.filter((s) => s.city !== ct.name); }
    title = o.kind === "rivalry" ? `${o.city} taken from ${o.rival}` : o.kind === "hold" ? `${o.city} secured` : `${o.city} conquered`;
    event(`🚩 ${title}!`, "you"); Sound.play("conquer"); ach("blood");
  } else if (o.kind === "alliance" || o.kind === "ally") {
    const name = o.rival ?? o.title.replace(/^Recruit /, "");
    if (ct) { if (ct.state === "beachhead" || ct.state === "hard" || ct.state === "uncharted") ct.state = "allied"; ct.contested = null; }
    G.allies++; title = `${name} joins your cause`; sub += " · +1 buzz every week"; event(`🤝 Alliance formed with ${name}.`, "good");
  } else {
    G.morale = Math.min(5, G.morale + 0.3); sharpenBrain();
    title = "Material sharpened"; sub += " · the brain lights up, hype up"; event("✍️ Material sharpened: every city hits harder.", "you"); Sound.play("conquer");
    for (const c of G.cities.filter((c) => sideOf(c) === "you")) G.fx.push({ p: c.p, ring: true, r: 60, col: COL.you, t0: performance.now() + Math.random() * 500, dur: 1100 });
  }
  G.doneLog.push(o); G.last = title; ops(`<span class="ok">order</span> ${esc(o.title)} <span class="ok">${gain ? `+${gain}%` : "done"}</span>${paid ? "" : ` · ⚡${cost}`}`);
  const p = ct?.p ?? capP();
  MapView.flip(p); if (p) { boom(p, o.kind === "alliance" || o.kind === "ally" ? COL.allied : COL.you); if (gain) float(p, `+${gain}%`); }
  G.conquest = Math.min(100, G.conquest + gain);
  banner(title.toUpperCase(), sub);
  G.sel = -1; hud(gain); renderOrders();
  await sleep(1700);
  const after = ageOf(G.conquest);
  if (after !== before) { banner(`THE ${after[2].toUpperCase()} AGE`, `You advanced to Age ${after[1]}`); Sound.play("ageup"); event(`👑 You advanced to the ${after[2]} age.`, "you"); ach("rising"); await sleep(1900); }
  G.busy = false;
  Coach.executed(o, ct);
  if (!G.orders.some((x) => !x.done && x.kind !== "defend")) { renderOrders(); setTimeout(victory, 700); return; }
  G.sel = -1; renderOrders(); renderAgents(); council();
}

// end the week: armies arrive, sieges resolve, income lands, buzz recharges
async function endWeek() {
  if (!G || G.busy || G.over) return;
  G.busy = true; renderOrders(); Sound.play("week");
  banner(`WEEK ${G.week} ENDS`, "The rivals make their moves", false);
  ops(`<span class="rv">— week ${G.week} ends · rivals move —</span>`);
  await sleep(1200);
  for (const sg of [...G.sieges]) {
    sg.left--;
    if (sg.left > 0) continue;
    const ct = G.cities.find((c) => c.name === sg.city), f = G.fac.get(sg.fid);
    G.sieges = G.sieges.filter((s) => s !== sg);
    G.orders = G.orders.filter((o) => !(o.kind === "defend" && o.city === sg.city && !o.done));
    if (!ct || !f || sideOf(ct) !== "you") continue;
    const loss = pts(ct);
    ct.state = "rival"; ct.owner = f.id; ct.contested = null; G.lost++;
    G.conquest = Math.max(0, G.conquest - loss); MapView.flip(ct.p); boom(ct.p, f.col); float(ct.p, `−${loss}%`, "#ff4d6d");
    f.last = `Took ${ct.name} from you`;
    G.orders.push({ id: `retake-${ct.name}`, kind: "rivalry", city: ct.name, rival: f.name, title: `Rivalry: take back ${ct.name}`, detail: `${f.name} took ${ct.name} while you were busy. Your fans are still there: book a room and win them back.`, receipt: "Qloo footprints + panel reaction", gain: loss, done: false });
    banner(`${ct.name.toUpperCase()} HAS FALLEN`, `${f.name} takes it · −${loss}% conquest`, false); Sound.play("lost"); event(`💀 ${ct.name} fell to ${f.name}. −${loss}% conquest.`, "bad");
    ops(`<span class="rv">💀 ${esc(f.name)} took ${esc(ct.name)} · −${loss}%</span>`);
    hud(-loss); await sleep(2000);
  }
  // the armies on the radar arrive
  for (const it of G.intents) {
    const f = G.fac.get(it.fid), prey = G.cities.find((c) => c.name === it.city);
    if (!f || !prey) continue;
    if (f.allied) continue;
    if (G.forts.has(prey.name)) { f.last = `Bounced off ${prey.name}`; event(`🛡 ${f.name}'s attack on ${prey.name} bounced off your walls.`, "good"); ops(`<span class="ok">🛡 ${esc(prey.name)} held</span> against ${esc(f.name)}`); float(prey.p, "🛡 HELD", "#3dff9a"); G.saved++; ach("wall"); await sleep(700); continue; }
    if (sideOf(prey) !== "you" || G.sieges.some((s) => s.city === prey.name)) continue;
    G.sieges.push({ city: prey.name, fid: f.id, left: 2 });
    G.orders.push({ id: `defend-${prey.name}-${G.week}`, kind: "defend", city: prey.name, title: `Defend ${prey.name}`, detail: `${f.name} is pulling your ${prey.name} fans their way. Win a battle there within 2 weeks, or lose ${pts(prey)}% conquest.`, receipt: `Qloo footprints: ${f.name} vs you in ${prey.name}`, gain: 0, done: false });
    f.last = `Besieging ${prey.name}`; G.temp.push({ from: it.from, to: prey.p, col: f.col, t0: performance.now() });
    banner(`${prey.name.toUpperCase()} UNDER SIEGE`, `${f.name} attacks · 2 weeks to break it`, false);
    event(`⚔ ${f.name} lays siege to ${prey.name}! 2 weeks to break it.`, "bad"); Sound.play("threat");
    ops(`<span class="rv">⚔ ${esc(f.name)}</span> besieges <b>${esc(prey.name)}</b>`); hud(); await sleep(1500);
  }
  for (const f of G.fac.values()) {
    if (f.allied || G.intents.some((x) => x.fid === f.id)) continue;
    const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
    if (f.strategy === "ally" && G.rng() < 0.5) { f.last = `Open to a co-bill${theirs[0] ? ` in ${theirs[0].name}` : ""}`; ops(`<span class="ag">🕊️ ${esc(f.name)}</span> signals a co-bill`); }
    else { const where = theirs[(G.week + f.name.length) % Math.max(1, theirs.length)]?.name; f.last = where ? `Dug in at ${where}` : "Building an audience"; ops(`<span class="rv">🏴 ${esc(f.name)}</span> ${where ? `fortifies ${esc(where)}` : "builds an audience"}`); }
  }
  // income and recharge
  const gold = income(), gain = regen();
  G.gold += gold; G.buzz = Math.min(BUZZ_MAX, G.buzz + gain); float(capP(), `+🪙${gold}`, "#ffcf5a", -30); float(capP(), `+⚡${gain}`, "#7fd8ff", 40);
  ops(`<span class="ok">income</span> +🪙${gold} (${G.cities.filter((c) => sideOf(c) === "you").length} cities × 15${G.sponsors.length ? ` + ${G.sponsors.length} sponsor${G.sponsors.length > 1 ? "s" : ""}` : ""}) · +⚡${gain}`);
  G.week++; G.hour = 9; G.forts.clear();
  G.busy = false;
  if (G.week > WEEKS) { G.week = WEEKS; hud(); renderOrders(); setTimeout(victory, 600); return; }
  planIntents();
  event(`📅 Week ${G.week} begins. +⚡${gain} +🪙${gold}.`, "you");
  const urgent = G.orders.findIndex((o) => !o.done && o.kind === "defend");
  G.sel = urgent >= 0 ? urgent : -1;
  hud(); renderOrders(); renderAgents(); council();
}

function victory() {
  if (G.over) return;
  G.over = true; renderOrders(); renderAgents();
  const [, n, name] = ageOf(G.conquest), grew = G.conquest - G.start;
  $("#v-title").textContent = grew >= 20 ? "VICTORY" : grew > 0 ? "CAMPAIGN COMPLETE" : "DEFEAT";
  $("#v-stats").innerHTML = [
    ["Weeks played", G.week],
    ["Conquest", `${G.start}% → ${G.conquest}%`],
    ["Cities held", `${G.startHeld} → ${held()}`],
    ["Agent missions (real calls)", G.missions],
    ["Allies · sponsors", `${G.allies} · ${G.sponsors.length}`],
    ["Cities taken from rivals", G.taken],
    ["Attacks held / cities lost", `${G.saved} / ${G.lost}`],
    ["Achievements", `${G.ach.size} / ${Object.keys(ACH).length}`],
    ["Age reached", `${n} · ${name}`],
    ["Final score", score().toLocaleString()],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("#victory").hidden = false; Sound.play(grew > 0 ? "victory" : "lost");
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

$("#endturn").addEventListener("click", () => { if (G && !G.busy && !G.over) { Clock.finishWeek(); } });
$("#cpause").addEventListener("click", () => Clock.toggle());
$("#cfast").addEventListener("click", () => Clock.fast());
$("#sound").addEventListener("click", () => { $("#sound").textContent = Sound.toggle() ? "🔊" : "🔇"; });
$("#exit").addEventListener("click", toSite);
$("#v-map").addEventListener("click", () => ($("#victory").hidden = true));
$("#v-again").addEventListener("click", () => { $("#victory").hidden = true; startGame(G.c, G.player); });
$("#v-site").addEventListener("click", () => { $("#victory").hidden = true; toSite(); });
$("#v-copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(battlePlan()); toast("Battle plan copied. Go make it real."); } catch { toast("Couldn't reach the clipboard."); } });
$("#simulate").addEventListener("click", simulatePlan);
$("#all-orders").addEventListener("click", () => (Drawer.mode === "orders" ? Drawer.close() : Drawer.open("orders")));
$("#trends-btn").addEventListener("click", () => (Drawer.mode === "trends" ? Drawer.close() : Drawer.open("trends")));
$("#plan-btn").addEventListener("click", () => (Drawer.mode === "moves" ? Drawer.close() : Drawer.open("moves")));
$("#drawer-x").addEventListener("click", () => Drawer.close());
$("#help").addEventListener("click", () => { try { localStorage.removeItem("conquest-coached"); } catch {} Coach.start(); });
$("#ops-toggle").addEventListener("click", () => { const p = $("#p-ops"); p.classList.toggle("collapsed"); $("#ops-toggle").setAttribute("aria-expanded", String(!p.classList.contains("collapsed"))); });
$("#legend").addEventListener("mouseenter", () => $("#legend").classList.remove("hide"));
function tab(name) { $$(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name)); for (const t of ["agents", "brain", "intel"]) $(`#tab-${t}`).hidden = t !== name; }
$$(".seg button").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
// phones: rails become bottom sheets, picked from a tab bar
function sheet(name) {
  if (!G) return; G.sheet = G.sheet === name ? null : name;
  $("#rail-left").classList.remove("open"); $("#rail-right").classList.remove("open"); $("#p-ops").classList.remove("open");
  $$("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.sheet === G.sheet));
  const n = G.sheet; if (!n) return;
  if (n === "orders") $("#rail-right").classList.add("open");
  else if (n === "log") $("#p-ops").classList.add("open");
  else { $("#rail-left").classList.add("open"); if (n === "agents" || n === "brain") tab(n); ($(n === "threats" ? "#p-threats" : "#p-tabs")).scrollIntoView({ block: "start" }); }
}
$$("#tabbar button").forEach((b) => b.addEventListener("click", () => sheet(b.dataset.sheet)));

// ---------------------------------------------------------------- the guided first turn
// Five beats, clock paused: your ground, your first move (a real agent call
// follows it), a rival on the radar, the three resources, then the board is yours.
const Coach = (() => {
  let step = -1, dim = null, spotEl = null;
  const mobile = () => innerWidth < 1180;
  const STEPS = [
    { spot: () => "#mapwrap", go: "Continue", t: () => `This is your ground. Fans already live here. ${G.capital ?? "Your capital"} is your capital and you hold ${held()} cit${held() === 1 ? "y" : "ies"}.`, enter: () => { const p = capP(); if (p) { boom(p, COL.you); float(p, "👑 YOUR CAPITAL"); } } },
    { spot: () => (mobile() ? "#mbar" : "#p-primary"), go: null, t: () => { const o = G.orders[recommended()]; return o ? `Your first move: “${o.title}”. Cost ⚡${costOf(o)}${gainOf(o) ? `, projected +${gainOf(o)}% conquest` : ""}. Press the button.` : "Pick an order and press Execute."; }, enter: () => { const i = recommended(); if (i >= 0) { G.sel = i; renderOrders(); preview(G.orders[i]); } } },
    { spot: () => (mobile() ? null : "#p-threats"), go: "Continue", t: () => { const it = G.intents[0], f = it && G.fac.get(it.fid); return f ? `A rival is moving: ${f.name} is marching on ${it.city} and arrives Sunday. Fortify the city or strike first.` : "Rivals show up on the radar days before they strike. Fortify or strike first."; }, enter: () => { ensureThreat(); hud(); } },
    { spot: () => "#orbs", go: "Continue", t: () => "Three resources run your campaign. ⚡ Buzz = your actions this week. ❤ Hype = how hard your material hits. 🪙 Gold = money for agents and walls.", enter: () => ["#orb-buzz", "#orb-hype", "#orb-gold"].forEach((id, k) => setTimeout(() => { const e = $(id); e.classList.remove("pulse"); void e.offsetWidth; e.classList.add("pulse"); }, k * 450)) },
    { spot: () => null, go: "Play", t: () => "First city taken. Real venues. Real data. The board is yours: the clock starts now. Pause any time." },
  ];
  function clear() { spotEl?.classList.remove("spot"); spotEl = null; }
  function show() {
    clear(); const s = STEPS[step]; s.enter?.();
    $("#coach-step").textContent = `Step ${step + 1} of ${STEPS.length}`; $("#coach-t").textContent = s.t();
    $("#coach-go").hidden = !s.go; $("#coach-go").textContent = s.go ?? "";
    const sel = s.spot(); spotEl = sel ? $(sel) : null; spotEl?.classList.add("spot");
    if (!dim) { dim = document.createElement("div"); dim.className = "coachdim"; $("#game").appendChild(dim); }
  }
  function end() { clear(); dim?.remove(); dim = null; $("#coach").hidden = true; step = -1; if (G) { G.coach = false; council(); } try { localStorage.setItem("conquest-coached", "1"); } catch {} }
  function next() { step++; if (step >= STEPS.length) return end(); show(); }
  $("#coach-go").addEventListener("click", next);
  $("#coach-skip").addEventListener("click", end);
  return {
    start() { if (!G || G.over) return; G.coach = true; step = -1; $("#coach").hidden = false; Drawer.close(); next(); },
    // after the first order lands, a free Booker proves it's real data
    async executed(o, ct) {
      if (step !== 1 || !G.coach) return;
      $("#coach-t").textContent = "Watch: your Booker is calling Qloo for a real stage there…"; clear();
      const city = ct ?? G.cities.find((c) => c.name === G.c.territory.target?.name) ?? G.cities.find((c) => c.name === G.capital);
      if (city) await runAgent(AGENTS.find((a) => a.id === "booker"), city);
      toast("Real data. Real venues. This is what you'll do for real.");
      await sleep(1200); next();
    },
  };
})();
// make sure there's a rival on the radar for the tutorial to point at
function ensureThreat() {
  if (G.intents.length) return;
  const f = [...G.fac.values()].find((x) => !x.allied && x.strategy === "compete") ?? [...G.fac.values()].find((x) => !x.allied); if (!f) return;
  const prey = preyOf(f) ?? G.cities.find((c) => sideOf(c) === "you"); if (!prey) return;
  const theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
  G.intents.push({ fid: f.id, city: prey.name, from: nearest(theirs, prey)?.p ?? [Math.max(20, Math.min(MW - 20, prey.p[0] + (prey.p[0] > MW / 2 ? 260 : -260))), Math.max(20, prey.p[1] - 180)] });
}
addEventListener("keydown", (e) => {
  if (!G || $("#game").hidden || G.modal || e.target.closest("input,textarea")) return;
  if (/^[1-9]$/.test(e.key) && G.orders[+e.key - 1]) selectOrder(+e.key - 1);
  if ((e.key === "Enter" || e.key === "e" || e.key === "E") && G.primary >= 0) { e.preventDefault(); execute(G.primary); }
  if (e.key === " ") { e.preventDefault(); Clock.toggle(); }
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
$("#armygrid").innerHTML = AGENTS.slice(0, 6).map((a) => `<div class="arow"><div><h3>${a.icon} ${a.name}</h3><button class="go2" data-play><i>→</i> Deploy in the war room</button></div><div><p>${AGENT_LONG[a.id] ?? a.role}</p><span class="src">${a.src.toUpperCase()} · LIVE</span></div></div>`).join("")
  + `<div class="arow"><div><h3>🤖 +${AGENTS.length - 6} more</h3></div><div><p>${AGENTS.slice(6).map((a) => a.name).join(", ")}. Waiting for orders.</p></div></div>`;
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
$$("[data-as]").forEach((b) => b.addEventListener("click", () => openWho(b.dataset.as)));
$("#who-close").addEventListener("click", () => ($("#who").hidden = true));
$("#signin").addEventListener("click", () => toast("Sign-in is mocked in the demo. Press Conquest to jump in."));
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
  $("#cands").innerHTML = `<p class="muted">Searching Qloo and the web for “${esc(q)}”…</p>`;
  try {
    const r = await api(`/api/profile?name=${encodeURIComponent(q)}`);
    const list = (r.candidates || []).slice(0, 4);
    if (!list.length) { $("#cands").innerHTML = `<p class="muted">Not on Qloo yet. <button class="ghost" id="to-custom2">Build your own →</button></p>`; $("#to-custom2").onclick = toCustom; return; }
    $("#cands").innerHTML = list.map(candHtml).join("");
    $$("[data-me]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.me, c = list[i];
      // the top hit is what the engine resolves by name (and what's prewarmed); others go by id
      player = { name: c.name, image: c.image, bio: c.bio || TYPE(c.type), socials: c.socials, q: i === 0 ? { name: c.name } : { name: c.name, ids: c.entity_id } };
      $("#who").hidden = true; scan();
    }));
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
  const socials = (player.socials || []).filter((s) => s.network !== "imdb");
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
  const set = (i, cls, text) => { const el = $("#ss" + i); el.className = "sstep " + cls; if (cls === "done") el.querySelector("i").textContent = "✓"; if (cls === "wait") el.querySelector("i").textContent = "!"; if (text) el.querySelector("span").textContent = text; Sound.play("tick"); $("#scanbar").style.width = Math.round(($$(".sstep.done,.sstep.wait").length / S.length) * 100) + "%"; };
  const q = qs(player.q);
  const audP = api(`/api/audience?${q}`).catch(() => null);
  const campP = api(`/api/campaign?${q}`).catch((e) => ({ status: "error", error: String(e) }));
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
  startGame(c, player);
}

// ---------------------------------------------------------------- run
// every renderer is isolated: one bad frame is logged once and never stops the loop
const failed = new Set();
function safe(name, fn, now) { try { fn(now); } catch (e) { if (!failed.has(name)) { failed.add(name); console.warn(`[${name}] frame error`, e); } } }
(function loop(now) {
  requestAnimationFrame(loop);
  safe("brain", Field.frame, now);
  if (G && !$("#game").hidden) { safe("map", MapView.frame, now); safe("radar", Radar.frame, now); safe("regions", brainTick, now); }
  else { safe("hero", HeroMap.frame, now); safe("heroradar", HeroRadar.frame, now); safe("stars", Stars.frame, now); safe("globe", Globe.frame, now); safe("story", Story.frame, now); safe("feed", Feed.frame, now); }
})(performance.now());
// a shareable link: ?play=Name opens the game as that person
const autoplay = new URLSearchParams(location.search).get("play");
if (autoplay) openWho(autoplay);
