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
  let formed = 1, side = 0.71, mx = 0, my = 0, last = 0, mode = "site", blank = false;
  addEventListener("mousemove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  function target() {
    if (mode === "scan") return [1, 0.27];
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
  // site: forms beside data-brain sections; scan: centred-left and lit; off: in the war room
  return { frame, setMode: (m) => { mode = m; } };
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
const COL = { you: "#ffb829", allied: "#2fd3a5", open: "#5d6b80", fog: "#323a46" };
const RIVAL_COLS = ["#ff4d6d", "#9b6bff", "#38d8ff"];
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
    const bg = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.75); bg.addColorStop(0, "#0b1730"); bg.addColorStop(1, "#02040a");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    const rnd = mulberry(7);
    x.fillStyle = "rgba(91,140,255,0.05)"; for (let i = 0; i < 900; i++) x.fillRect(rnd() * W, rnd() * H, d, d); // sea haze
    x.save(); x.setTransform(T.s, 0, 0, T.s, T.ox, T.oy);
    const P = d3.geoPath(null, x);
    x.beginPath(); P(Atlas.nation); x.shadowColor = "#2d6bff"; x.shadowBlur = 30 * d; x.fillStyle = "#0d1627"; x.fill(); x.shadowBlur = 0;
    x.clip();
    // relief: the Rockies, the Sierra, the Appalachians, the plains
    for (const [cx, cy, r, a] of [[290, 260, 190, 0.11], [150, 230, 120, 0.07], [800, 300, 110, 0.06], [520, 330, 260, 0.03]]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(150,170,210,${a})`); g.addColorStop(1, "rgba(150,170,210,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
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
    x.beginPath(); P(Atlas.inner); x.strokeStyle = "rgba(190,210,255,0.16)"; x.lineWidth = (0.7 * d) / T.s; x.stroke();
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
  function badge(X, Y, txt, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 7.5 * d, 0, 6.283); ctx.fill(); ctx.fillStyle = "#000"; ctx.font = `700 ${10 * d}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, X, Y + 0.5 * d); }
  function token(ct, now, night) {
    const [X, Y] = toS(ct.p), key = sideOf(ct), col = colOf(key), r = (7 + ct.presence * 8) * d, t = now / 1000;
    const sel = G.orders[G.sel], isTarget = sel && !sel.done && sel.city === ct.name;
    const siege = G.sieges.find((s) => s.city === ct.name);
    // city lights after dark
    const lit = night(ct.p[0]); if (lit > 0.3 && key !== "fog") { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 3.2); g.addColorStop(0, `rgba(255,214,140,${0.45 * lit})`); g.addColorStop(1, "rgba(255,214,140,0)"); ctx.fillStyle = g; ctx.fillRect(X - r * 3.2, Y - r * 3.2, r * 6.4, r * 6.4); }
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
    ctx.font = `700 ${11 * d}px "Cinzel", serif`; ctx.fillStyle = key === "fog" ? "#6b7480" : "#e9eef7"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4 * d;
    ctx.fillText(ct.name.toUpperCase(), X, Y + rr + 10 * d); ctx.shadowBlur = 0;
    if (cap) { ctx.font = `${16 * d}px serif`; ctx.fillText("👑", X, Y - rr - 9 * d); }
    else if (ct.state === "frontline") badge(X + rr * 0.8, Y - rr * 0.8, "!", "#ff9f43");
    if (G.prep.has(ct.name)) badge(X + rr * 0.85, Y + rr * 0.75, "✓", "#7fd8ff");
    if (siege) badge(X - rr * 0.9, Y - rr * 0.8, String(siege.left), "#ff4d6d");
    else if (ct.contested && key === "you") badge(X - rr * 0.9, Y - rr * 0.8, "⚔", "#ff4d6d");
    if (isTarget) { ctx.font = `${16 * d}px serif`; ctx.fillText("🚩", X + rr + 6 * d, Y - rr - 4 * d); }
    // what-if ghost: the city in your colour, with the gain floating up
    const pv = G.preview; if (pv && pv.city === ct.name) {
      const k = (now - pv.t0) / 2600; if (k >= 0 && k < 1) {
        ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI); ctx.setLineDash([5 * d, 4 * d]); ctx.strokeStyle = pv.col; ctx.lineWidth = 3 * d;
        ctx.beginPath(); ctx.arc(X, Y, rr + 14 * d + 6 * d * Math.sin(t * 5), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = pv.col; ctx.font = `700 ${16 * d}px "Cinzel", serif`; ctx.shadowColor = "#000"; ctx.shadowBlur = 6 * d; ctx.fillText(pv.label, X, Y - rr - 22 * d - k * 26 * d); ctx.restore();
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
    if (o && !o.done && o.city) { const to = G.cities.find((c) => c.name === o.city); if (to) arrow(fromFor(to).p, to.p, o.kind === "alliance" ? COL.allied : o.kind === "defend" ? "#fff" : "#ffd27a", now, 3.4); }
    G.temp = G.temp.filter((tr) => now - tr.t0 <= 3500);
    for (const tr of G.temp) arrow(tr.from, tr.to, tr.col, now, 2.4);
    for (const ct of G.cities) token(ct, now, night);
    // your agents in the field
    for (const u of G.units) {
      const k = clamp01((now - u.t0) / u.dur), back = u.phase === "back";
      const a0 = toS(back ? u.to : u.from), b0 = toS(back ? u.from : u.to), c0 = bez(a0, b0), [X, Y] = at(a0, c0, b0, ease(k));
      ctx.save(); ctx.strokeStyle = "rgba(127,216,255,.5)"; ctx.setLineDash([3 * d, 5 * d]); ctx.lineWidth = 1.5 * d; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], b0[0], b0[1]); ctx.stroke(); ctx.restore();
      const bob = u.phase === "work" ? Math.sin(now / 150) * 3 * d : 0;
      const [UX, UY] = u.phase === "work" ? b0 : [X, Y];
      ctx.fillStyle = "#0a0f18"; ctx.strokeStyle = "#7fd8ff"; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(UX, UY - 18 * d + bob, 12 * d, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.font = `${13 * d}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(u.icon, UX, UY - 18 * d + bob);
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
    <p>${esc(text)}</p>${(G.intel.get(ct.name) ?? []).map((t) => `<p style="color:#7fd8ff">${esc(t)}</p>`).join("")}${sg ? `<p style="color:#ff8fa5">⚔ Under siege by ${esc(G.fac.get(sg.fid)?.name)}: falls in ${sg.left} week${sg.left > 1 ? "s" : ""} unless you defend.</p>` : ct.contested && key === "you" ? `<p style="color:#ff8fa5">⚔ ${esc(ct.contested)} is close behind you here.</p>` : ""}`;
  $("#cityp").hidden = false;
}

// ---------------------------------------------------------------- event ticker, banner, ops log
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
  while (box.children.length > 60) box.lastChild.remove();
}
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
    if (!paused && !G.busy && !G.simulating) {
      G.hour += dt * RATE * speed;
      if (G.hour >= 168) { G.hour = 168; speed = 1; $("#cfast").classList.remove("on"); endWeek(); }
    }
    const lab = fmt(Math.min(G.hour, 167.99));
    if (lab !== shown) { shown = lab; $("#ctime").textContent = lab.toUpperCase() + " ET"; $("#cday").textContent = `WEEK ${G.week} OF ${WEEKS}`; $("#cdial").style.setProperty("--k", `${((G.hour % 24) / 24) * 100}%`); }
  }
  return {
    tick, nightAt,
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
function council() {
  const open = G.orders.filter((o) => !o.done);
  const sg = G.sieges.slice().sort((a, b) => a.left - b.left)[0];
  const afford = open.filter((o) => costOf(o) <= G.buzz && o.gain);
  const best = afford.sort((a, b) => gainOf(b) / costOf(b) - gainOf(a) / costOf(a))[0];
  const left = WEEKS - G.week + 1, idle = AGENTS.filter((a) => G.crew.get(a.id)?.recruited && G.crew.get(a.id).week !== G.week).length;
  let msg;
  if (sg) msg = `Alarm! ${G.fac.get(sg.fid)?.name} is besieging ${sg.city}. It falls in ${sg.left} week${sg.left > 1 ? "s" : ""} and costs you ${pts(G.cities.find((c) => c.name === sg.city))}% conquest. Defend it for ⚡${COST.defend}.`;
  else if (!open.length) msg = "Every order is done. Let the clock run out or end the week to close the campaign.";
  else if (!afford.length) msg = `You're low on buzz (⚡${G.buzz}). Drink a trend potion, or let the week end to recharge ⚡${regen()}.${idle ? ` Meanwhile, ${idle} agent${idle > 1 ? "s are" : " is"} idle: deploy them.` : ""}`;
  else msg = `Best value now: “${best.title}”, +${gainOf(best)}% for ⚡${costOf(best)}.${G.prep.has(best.city) ? " Your agents already prepared that city." : best.city ? ` Send a Scout or Booker to ${best.city} first and it costs less and gains more.` : ""} ${left} week${left > 1 ? "s" : ""} left.`;
  typeInto($("#brief"), msg, `Week ${G.week} of ${WEEKS} · rival moves are simulated from their real Qloo footprints`);
}

// ---------------------------------------------------------------- HUD and panels
const held = () => G.cities.filter((c) => ["you", "allied"].includes(sideOf(c))).length;
const ground = () => G.cities.filter((c) => c.state !== "uncharted").length;
const fansOf = () => G.cities.filter((c) => sideOf(c) === "you").reduce((s, c) => s + c.you, 0);
const power = () => Math.round((fansOf() * G.morale) / 10);
const regen = () => Math.min(8, 3 + Math.max(0, Math.round((G.morale - 3.5) * 4)) + G.allies);
const score = () => Math.round(G.conquest * 100 + G.allies * 500 + G.taken * 750 + power() + G.saved * 400 + G.missions * 150);
function hud(delta) {
  const left = G.orders.filter((o) => !o.done).length;
  $("#res").innerHTML = [
    ["⚑", "Conquest", `${G.conquest}%`, delta ? (delta > 0 ? `+${delta}` : `${delta}`) : ""],
    ["🏰", "Cities", `${held()}/${ground()}`],
    ["⚡", "Buzz", `${G.buzz}/${BUZZ_MAX}`, "", `<span class="buzz"><i style="width:${(G.buzz / BUZZ_MAX) * 100}%"></i></span>`],
    ["💪", "Power", kfmt(power())],
    ["🔥", "Morale", G.morale.toFixed(1)],
    ["🤖", "Agents", [...G.crew.values()].filter((c) => c.recruited).length],
    ["🤝", "Allies", G.allies],
    ["📜", "Orders", left],
    ["★", "Score", score().toLocaleString()],
  ].map(([ic, k, v, up, extra]) => `<span class="r"><span class="ic">${ic}</span><span class="k">${k}</span><b>${v}</b>${extra || ""}${up ? `<span class="up" style="color:${up.startsWith("-") ? "var(--bad)" : "var(--good)"}">${up}</span>` : ""}</span>`).join("");
  const [, n, name] = ageOf(G.conquest); $("#age").innerHTML = `<small>AGE ${n}</small><b>${name}</b>`;
  $("#turn").textContent = `${G.week}/${WEEKS}`;
  $("#weeknote").textContent = `Week ends Sunday midnight: +⚡${regen()} buzz, then the rivals move.`;
  factions();
}
function factions() {
  const reach = (f) => G.cities.reduce((s, c) => s + (c.rivals.find((r) => r.id === f.id)?.count ?? 0), 0);
  const fm = (name) => G.fame.get(name);
  const row = (x) => { const f = fm(x.name); return { ...x, v: f?.views ?? null, mo: f?.momentum ?? null }; };
  const all = [row({ name: G.player.name, img: G.player.image, col: COL.you, st: `<span class="st you">You</span>`, n: G.cities.filter((c) => sideOf(c) === "you").length, last: G.last, r: fansOf() })]
    .concat([...G.fac.values()].map((f) => row({ name: f.name, img: f.img, col: f.allied ? COL.allied : f.col, st: f.allied ? `<span class="st allied">Allied</span>` : f.strategy === "ally" ? `<span class="st ally">Ally?</span>` : `<span class="st rival">Nemesis</span>`, n: G.cities.filter((c) => c.owner === f.id && c.state === "rival").length, last: f.last, title: f.plan.reason, r: reach(f) })));
  const useFame = all.some((x) => x.v), max = Math.max(1, ...all.map((x) => (useFame ? x.v ?? 0 : x.r)));
  $("#factions").innerHTML = all.map((x) => `<div class="fac" style="--c:${x.col}" ${x.title ? `title="${esc(x.title)}"` : ""}>${avatar(x.img, x.name, "fp")}<span>${esc(x.name)}</span>${x.st}<b>${x.n}</b><span class="pw"><i style="width:${((useFame ? x.v ?? 0 : x.r) / max) * 100}%"></i></span><span class="fl">${x.v != null ? `${kfmt(x.v)} views/30d${x.mo != null ? ` ${x.mo >= 0 ? "▲" : "▼"}${Math.abs(x.mo)}%` : ""} · ` : ""}${esc(x.last || "")}</span></div>`).join("")
    + `<div class="note" style="padding:4px 2px 0">Number = cities held. Bar = ${useFame ? "fame: Wikipedia views, last 30 days (live)" : "reach across your cities (Qloo)"}.</div>`;
}
function playerCard() {
  const p = G.player, socials = (p.socials || []).filter((s) => s.network !== "imdb");
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
  const box = $("#trends"); if (!box) return;
  const pot = G.potions.slice(0, 5).map((p, i) => `<button class="potion${p.used ? " used" : ""}" data-p="${i}" ${p.used ? "disabled" : ""}><span>🧪</span><span>${esc(p.title)}<small>Trending in ${esc(p.where)} · ${esc(p.traffic || "rising")} searches</small></span><span class="use">${p.used ? "used" : "+⚡3"}</span></button>`).join("");
  const lock = [["𝕏", "X trends", "X's trends need the paid X API. Connect your X account to unlock this slot."], ["♪", "TikTok trends", "TikTok trends need TikTok's Research API. Connect your TikTok to unlock this slot."]]
    .map(([ic, n, why]) => `<button class="potion lock" data-lock="${esc(why)}"><span>${ic}</span><span>${n}<small>Not connected</small></span><span class="use">connect</span></button>`).join("");
  box.innerHTML = (pot || `<div class="note">Loading live Google Trends…</div>`) + lock + `<div class="note">Potion = post a take on that trend this week (+3 buzz). Tragedies are filtered out.</div>`;
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => drink(+b.dataset.p)));
  $$("[data-lock]").forEach((b) => b.addEventListener("click", () => toast(b.dataset.lock)));
}
function drink(i) {
  const p = G.potions[i]; if (!p || p.used || G.over) return;
  p.used = true; G.buzz = Math.min(BUZZ_MAX, G.buzz + 3); G.last = `Rode the trend “${p.title}”`;
  Sound.play("potion"); event(`🧪 You rode the trend “${p.title}” (${p.where}). +3 buzz.`, "good");
  ops(`<span class="ag">🧪 you</span> posted a take on <b>${esc(p.title)}</b> <span class="ok">+3 ⚡</span>`);
  renderTrends(); hud(); renderOrders(); council();
}

// ---------------------------------------------------------------- the agent army
// Each agent is a real job done with a real, free data source. Recruit with
// buzz, deploy once a week to a city; its unit marches there on the map, makes
// the call, and comes back with intel that changes the game.
const AGENTS = [
  { id: "scout", icon: "🔭", name: "Scout", role: "What your fans love in a city", src: "Qloo", cost: 2 },
  { id: "booker", icon: "🎟️", name: "Booker", role: "Finds the right stage", src: "Qloo", cost: 3 },
  { id: "trend", icon: "📈", name: "Trend hunter", role: "What's trending in that state", src: "Google Trends", cost: 2 },
  { id: "oracle", icon: "🌦️", name: "Weather oracle", role: "Picks the best show night", src: "Open-Meteo", cost: 1 },
  { id: "spy", icon: "🕵️", name: "Spy", role: "Rivals' fame and next move", src: "Wikipedia", cost: 2 },
  { id: "scribe", icon: "✍️", name: "Copywriter", role: "Drafts your post for the city", src: "Qloo tags", cost: 1 },
  { id: "listener", icon: "👂", name: "Listener", role: "What Reddit says about you", src: "Reddit · connect", locked: true },
];
const deployCity = () => G.cities.find((c) => c.name === G.pinned) ?? G.cities.find((c) => c.name === G.orders[G.sel]?.city) ?? G.cities.find((c) => c.name === G.c.territory.target?.name) ?? G.cities.find((c) => c.name === G.capital);
function renderAgents() {
  const city = deployCity();
  $("#agents").innerHTML = AGENTS.map((a) => {
    const c = G.crew.get(a.id) ?? {};
    let btn;
    if (a.locked) btn = `<button data-lockag="1">Connect</button>`;
    else if (!c.recruited) btn = `<button data-rec="${a.id}" ${G.buzz >= a.cost && !G.over ? "" : "disabled"}>Recruit ⚡${a.cost}</button>`;
    else if (c.busy) btn = `<button disabled>On mission</button>`;
    else if (c.week === G.week) btn = `<button disabled>Back next week</button>`;
    else btn = `<button data-dep="${a.id}" ${G.over ? "disabled" : ""}>Deploy → ${esc(city?.name ?? "")}</button>`;
    return `<div class="agent${c.busy ? " busy" : ""}${a.locked ? " lock" : ""}"><span class="ai">${a.icon}</span><span>${a.name}<small>${a.role}</small><span class="src${a.locked ? " no" : ""}">${a.src}</span></span>${btn}</div>`;
  }).join("") + `<div class="note">Deploy goes to the city you clicked on the map, else your selected order's city.</div>`;
  $$("[data-rec]").forEach((b) => b.addEventListener("click", () => recruit(b.dataset.rec)));
  $$("[data-dep]").forEach((b) => b.addEventListener("click", () => deploy(b.dataset.dep)));
  $$("[data-lockag]").forEach((b) => b.addEventListener("click", () => toast("Reddit blocks anonymous apps. Connect a Reddit account to unlock the Listener.")));
}
function recruit(id) {
  const a = AGENTS.find((x) => x.id === id); if (!a || G.buzz < a.cost) return;
  G.buzz -= a.cost; G.crew.set(id, { recruited: true, week: 0, busy: false });
  Sound.play("alliance"); event(`🤖 ${a.name} agent recruited.`, "good"); ops(`<span class="ag">${a.icon} ${a.name}</span> joined your army · ready to deploy`);
  hud(); renderAgents(); renderOrders();
}
function prep(city, why) {
  if (!G.prep.has(city.name)) { G.prep.add(city.name); ops(`<span class="ok">✓ ${esc(city.name)} prepared</span>: its orders cost ⚡1 less and gain +2% (${esc(why)})`); }
  renderOrders();
}
async function deploy(id) {
  const a = AGENTS.find((x) => x.id === id), c = G.crew.get(id), city = deployCity(); if (!a || !c || c.busy || !city) return;
  c.busy = true; c.week = G.week; renderAgents();
  const home = G.cities.find((x) => x.name === G.capital) ?? city;
  const u = { icon: a.icon, from: home.p, to: city.p, t0: performance.now(), dur: 2200, phase: "go" }; G.units.push(u);
  Sound.play("select"); ops(`<span class="ag">${a.icon} ${a.name}</span> marching to <b>${esc(city.name)}</b>`);
  await sleep(2200); u.phase = "work";
  let out = null;
  try { out = await AGENT_JOBS[id](city); } catch (e) { out = { line: `<span class="rv">came back empty-handed (${esc(e?.message ?? e)})</span>` }; }
  u.phase = "back"; u.t0 = performance.now(); u.dur = 1800;
  ops(`<span class="ag">${a.icon} ${a.name}</span> @ ${esc(city.name)} → ${out.line}`);
  if (out.intel) { G.intel.set(city.name, [...(G.intel.get(city.name) ?? []).filter((x) => x[0] !== out.intel[0]), out.intel]); if (G.pinned === city.name) cityPanel(city); }
  Sound.play("potion"); G.missions++;
  setTimeout(() => { G.units = G.units.filter((x) => x !== u); }, 1800);
  c.busy = false; hud(); renderAgents(); renderOrders(); council();
}
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
    return { line: `<span class="api">Open-Meteo · ${esc(city.name)}</span> best show night <b>${nice(best)}</b> (${best.rain}% rain, ${Math.round(best.tmax)}°C)${worst.rain >= 50 ? `; avoid ${nice(worst)} (${worst.rain}% rain)` : ""} <span class="ok">morale +0.1</span>`, intel: `🌦️ Play ${nice(best)}: ${best.rain}% chance of rain.` };
  },
  async spy(city) {
    const names = [G.player.name, ...[...G.fac.values()].map((f) => f.name)];
    const r = await api(`/api/fame?names=${encodeURIComponent(names.join("|"))}`);
    if (r.status === "ok") for (const p of r.people) G.fame.set(p.name, p);
    const hot = [...G.fac.values()].filter((f) => !f.allied).map((f) => ({ f, m: G.fame.get(f.name)?.momentum ?? 0 })).sort((a, b) => b.m - a.m)[0];
    const prey = hot && preyOf(hot.f);
    if (prey) G.intel.set(prey.name, [...(G.intel.get(prey.name) ?? []), `🕵️ ${hot.f.name} is likely to hit here next. Prepare or defend.`]);
    factions();
    const fm = (n) => { const p = G.fame.get(n); return p?.views != null ? `${esc(n)} ${kfmt(p.views)}${p.momentum != null ? ` ${p.momentum >= 0 ? "▲" : "▼"}${Math.abs(p.momentum)}%` : ""}` : `${esc(n)} n/a`; };
    return { line: `<span class="api">Wikipedia · 30-day views</span> ${names.map(fm).join(" · ")}${prey ? ` → <span class="rv">expect ${esc(hot.f.name)} to move on ${esc(prey.name)}</span>` : ""}` };
  },
  async scribe(city) {
    const tags = (G.player.aud?.tags || []).filter((t) => !/protagonist|fiction|animated|minions|dinosaur|zoo/i.test(t)).slice(0, 2);
    const tr = G.potions.find((p) => !p.used && p.where === city.name) ?? G.potions.find((p) => !p.used);
    const post = `${city.name}! If you grew up on ${tags[0] || "great comedy"}${tags[1] ? ` and ${tags[1]}` : ""}, this one's for you. ${tr ? `Got thoughts on ${tr.title}. ` : ""}New set, one night only. 🎤`;
    G.buzz = Math.min(BUZZ_MAX, G.buzz + 1); G.drafts.push(post);
    try { await navigator.clipboard.writeText(post); } catch {}
    return { line: `<span class="api">Qloo tags${tr ? " + Trends" : ""}</span> draft: “${esc(post)}” <span class="ok">+1 ⚡ · copied</span>`, intel: `✍️ Post ready: “${post}”` };
  },
};
// the city a rival would move on next: your city where they're relatively strongest
function preyOf(f) {
  const mine = G.cities.filter((c) => sideOf(c) === "you" && !G.sieges.some((s) => s.city === c.name));
  const rel = (c) => (c.rivals.find((r) => r.id === f.id)?.count ?? 0) / Math.max(1, c.you);
  return mine.filter((c) => c.contested === f.name || rel(c) > 0.6).sort((a, b) => rel(b) - rel(a))[0];
}

// ---------------------------------------------------------------- orders, forecasts, previews
const FORECAST = {
  take: (o) => [["Mon", `Booker holds ${G.c.venues?.[0]?.name ?? "a room"} in ${o.city}`], ["Thu", `Show night in ${o.city}`], ["Sun", `${o.city} flips to you · +${gainOf(o)}%`]],
  hold: (o) => [["Tue", `Test a ${o.city}-tuned version on its fans`], ["Fri", "Play the new version"], ["Sun", `${o.city} secured · +${gainOf(o)}%`]],
  rivalry: (o) => [["Mon", `Book against ${o.rival} in ${o.city}`], ["Sat", "Head-to-head weekend"], ["Sun", `${o.city} is yours · ${o.rival} loses ground`]],
  alliance: (o) => [["Mon", `DM ${o.rival}: co-bill or collab`], ["Wed", "Collab post goes live"], ["Sun", `Their fans meet you · +${gainOf(o)}% · +1 ⚡/week`]],
  ally: (o) => [["Mon", `DM ${o.title.replace(/^Recruit /, "")}: guest spot or shout-out`], ["Wed", "Shout-out swap goes live"], ["Sun", `+${gainOf(o)}% · +1 ⚡ every week`]],
  edit: () => [["Mon", "Cut the slow stretches the brain model flagged"], ["Wed", "Re-test on 1,000 fans"], ["Fri", "Morale +0.3 · more buzz every week"]],
  defend: (o) => [["Tue", `Drop content aimed at ${o.city}`], ["Thu", "Play a short set there"], ["Sun", "Siege broken · city stays yours"]],
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
function renderOrders() {
  $("#orders").innerHTML = G.orders.map((o, i) => {
    const c = costOf(o), g = gainOf(o), can = !o.done && c <= G.buzz && !G.busy && !G.over, prepped = o.city && G.prep.has(o.city);
    return `<div class="order${o.done ? " done" : ""}${i === G.sel ? " sel" : ""}${o.kind === "defend" && !o.done ? " defend" : ""}">
      <button class="ohead" data-o="${i}"><span class="oi">${ICON[o.kind] ?? "•"}</span><span><span class="ok">${i + 1} · ${o.kind === "edit" ? "sharpen" : o.kind}${prepped ? ' · <span style="color:#7fd8ff">prepared ✓</span>' : ""}</span><h4>${esc(o.title)}</h4><span class="og">${g ? `+${g}% conquest` : "keeps your ground"}</span></span><span class="cost${c <= G.buzz ? "" : " no"}">⚡${c}</span></button>
      <div class="obody"><div class="gen">${GENERAL}<div>${esc(o.detail)}<span class="rc">Source: ${esc(o.receipt)}${g ? ` · +${g}% conquest (projected)` : ""}</span></div></div>
      ${o.done ? "" : `<div class="fc"><b>WHAT HAPPENS</b><ol>${(FORECAST[o.kind]?.(o) ?? []).map(([d, t]) => `<li><span>${d}</span>${esc(t)}</li>`).join("")}</ol><div class="skip">${esc(skipText(o))}</div>${sparkline(o)}</div>
      <div class="orow"><button class="go" data-x="${i}" ${can ? "" : "disabled"}>${can ? `Execute · ⚡${c}` : G.busy ? "…" : `Need ⚡${c}`}</button><button class="ghostbtn" data-pv="${i}">▶ Preview</button></div>`}</div></div>`;
  }).join("");
  $$("#orders [data-o]").forEach((b) => b.addEventListener("click", () => selectOrder(+b.dataset.o)));
  $$("#orders [data-x]").forEach((b) => b.addEventListener("click", () => execute(+b.dataset.x)));
  $$("#orders [data-pv]").forEach((b) => b.addEventListener("click", () => preview(G.orders[+b.dataset.pv])));
  $("#endturn").disabled = G.busy || G.over;
}
function preview(o) {
  if (!o) return;
  const city = o.city ?? G.capital, g = gainOf(o);
  G.preview = { city, t0: performance.now(), label: o.kind === "defend" ? "HOLDS" : g ? `+${g}%` : "+⚡", col: o.kind === "alliance" || o.kind === "ally" ? COL.allied : COL.you };
}
function selectOrder(i) {
  if (!G || G.busy) return; G.sel = G.sel === i ? -1 : i; Sound.play("select"); renderOrders(); renderAgents();
  if (G.sel === i) { preview(G.orders[i]); const el = $$("#orders .order")[i]; el?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
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
  ops(`<span class="ok">simulation</span> all orders → <b>${c}%</b> conquest, Age ${n} · ${name} (rivals not counted)`);
  G.simulating = false;
}

// ---------------------------------------------------------------- the game
async function startGame(c, player) {
  await Atlas.ready;
  const cities = c.territory.cities.filter((x) => METROS[x.name]).map((x) => ({ ...x, p: ALB(METROS[x.name]) })).filter((x) => x.p);
  const fac = new Map(c.rivals.map((r, i) => [r.id, { id: r.id, name: r.name, col: RIVAL_COLS[i % 3], strategy: r.strategy, allied: false, plan: r, img: qlooImg(r.id), last: r.holds.length ? `Holds ${r.holds.slice(0, 2).join(", ")}` : "Scouting your fans" }]));
  G = { c, player, cities, fac, week: 1, hour: 9, conquest: c.territory.conquest, start: c.territory.conquest, startHeld: 0, orders: c.missions.map((m) => ({ ...m, done: false })), sel: 0, allies: 0, taken: 0, saved: 0, lost: 0, missions: 0, buzz: 8, morale: c.aggregate.mean, sieges: [], potions: [], fx: [], temp: [], units: [], anim: null, busy: false, over: false, simulating: false, capital: c.territory.capital?.name, pinned: null, last: "Took the field", prep: new Set(), intel: new Map(), fame: new Map(), crew: new Map(), drafts: [], preview: null, rng: mulberry([...player.name].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7)) };
  assignStates(); G.startHeld = held(); G.layer = null;
  for (const f of fac.values()) portrait(f.img); portrait(player.image);

  $("#site").hidden = true; $("#scan").hidden = true; $("#game").hidden = false; Field.setMode("off"); scrollTo(0, 0);
  $("#legend").innerHTML = [["You", COL.you], ...[...fac.values()].map((f) => [f.name, f.col]), ["Allied", COL.allied], ["Open ground", COL.open], ["Uncharted", COL.fog]].map(([n, col]) => `<span><i style="background:${col}"></i>${esc(n)}</span>`).join("") + `<span style="color:#3dff9a">◯ ripe to take</span>`;
  $("#ops").innerHTML = ""; Clock.reset();
  playerCard(); renderTrends(); hud(); renderOrders(); renderAgents(); $("#cityp").hidden = true; $("#victory").hidden = true;
  const nem = c.rivals.find((r) => r.strategy === "compete");
  typeInto($("#brief"),
    `Commander ${player.name.split(" ")[0]}, you hold ${held()} of ${ground()} cities and ${G.conquest}% of your ground. ${nem ? `${nem.name} is your nemesis: same fans, same taste. ` : ""}The clock is running: ${WEEKS} weeks. Spend ⚡ buzz on orders, recruit agents to do the legwork, and watch for sieges. Tap an order to see what happens.`,
    `Source: Qloo taste graph + 1,000-fan panel · ${c.receipts?.length ?? 0} live calls logged`);
  ops(`<span class="api">Qloo</span> mapped ${cities.length} cities, ${c.rivals.length} rivals, ${c.missions.length} orders · ${c.receipts?.length ?? 0} live calls`);
  const ev = [[`Commander ${player.name} has taken the field.`, "you"], [`Your capital is ${G.capital ?? "not yet chosen"}.`, "info"], [`${c.rivals.length} rivals spotted fighting for your fans.`, "bad"], [`${c.territory.target ? `Scouts report ${c.territory.target.name} is ripe for conquest.` : "Scouts are still reading the map."}`, "good"]];
  ev.forEach(([t, k], i) => setTimeout(() => event(t, k), 400 + i * 900));
  Sound.play("ageup");
  loadTrends();
  api(`/api/fame?names=${encodeURIComponent([player.name, ...[...fac.values()].map((f) => f.name)].join("|"))}`).then((r) => {
    if (r?.status === "ok") for (const p of r.people) G.fame.set(p.name, p);
    const el = $("#wk-state"); if (el) el.textContent = [...G.fame.values()].some((p) => p.views) ? "live" : "not found";
    factions();
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
  const o = G?.orders[i]; if (!o || o.done || G.busy || G.over) return;
  const cost = costOf(o), gain = gainOf(o);
  if (cost > G.buzz) { Sound.play("nope"); toast(`Not enough buzz: this needs ⚡${cost}. Drink a trend potion or let the week end.`); return; }
  G.busy = true; o.done = true; G.buzz -= cost;
  const before = ageOf(G.conquest);
  const ct = o.city ? G.cities.find((c) => c.name === o.city) : null;
  let title = "", sub = gain ? `+${gain}% conquest (projected)` : "";
  if (o.kind === "defend") {
    G.sieges = G.sieges.filter((s) => s.city !== o.city); if (ct) ct.contested = null; G.saved++;
    title = `${o.city} holds!`; sub = "The siege is broken"; event(`🛡️ ${o.city} holds. The siege is broken.`, "you"); Sound.play("conquer");
  } else if (o.kind === "take" || o.kind === "hold" || o.kind === "rivalry") {
    if (ct) { if (ct.state === "rival") G.taken++; ct.state = "stronghold"; ct.owner = "you"; ct.contested = null; G.sieges = G.sieges.filter((s) => s.city !== ct.name); }
    title = o.kind === "rivalry" ? `${o.city} taken from ${o.rival}` : o.kind === "hold" ? `${o.city} secured` : `${o.city} conquered`;
    event(`🚩 ${title}!`, "you"); Sound.play("conquer");
  } else if (o.kind === "alliance" || o.kind === "ally") {
    const name = o.rival ?? o.title.replace(/^Recruit /, "");
    const f = facByName(name); if (f) { f.allied = true; f.last = "Fighting at your side"; G.sieges = G.sieges.filter((s) => s.fid !== f.id); }
    if (ct) { if (ct.state === "beachhead" || ct.state === "hard" || ct.state === "uncharted") ct.state = "allied"; ct.contested = null; }
    G.allies++; title = `${name} joins your cause`; sub += " · +1 buzz every week"; event(`🤝 Alliance formed with ${name}.`, "good"); Sound.play("alliance");
  } else {
    G.morale = Math.min(5, G.morale + 0.3);
    title = "Material sharpened"; sub += " · morale up, more buzz each week"; event("✍️ Material sharpened: every city hits harder.", "you"); Sound.play("conquer");
    for (const c of G.cities.filter((c) => sideOf(c) === "you")) G.fx.push({ p: c.p, ring: true, r: 60, col: COL.you, t0: performance.now() + Math.random() * 500, dur: 1100 });
  }
  G.last = title; ops(`<span class="ok">order</span> ${esc(o.title)} <span class="ok">${gain ? `+${gain}%` : "done"}</span> · ⚡${cost}`);
  const p = ct?.p ?? G.cities.find((c) => c.name === G.capital)?.p;
  MapView.flip(p); if (p) boom(p, o.kind === "alliance" || o.kind === "ally" ? COL.allied : COL.you);
  G.conquest = Math.min(100, G.conquest + gain);
  banner(title.toUpperCase(), sub);
  G.sel = -1; hud(gain); renderOrders();
  await sleep(1700);
  const after = ageOf(G.conquest);
  if (after !== before) { banner(`THE ${after[2].toUpperCase()} AGE`, `You advanced to Age ${after[1]}`); Sound.play("ageup"); event(`👑 You advanced to the ${after[2]} age.`, "you"); await sleep(1900); }
  G.busy = false;
  if (!G.orders.some((x) => !x.done && x.kind !== "defend")) { renderOrders(); setTimeout(victory, 700); return; }
  G.sel = G.orders.findIndex((x) => !x.done && costOf(x) <= G.buzz); renderOrders(); renderAgents(); council();
}

// end the week: sieges resolve, rivals move, buzz recharges
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
    G.conquest = Math.max(0, G.conquest - loss); MapView.flip(ct.p); boom(ct.p, f.col);
    f.last = `Took ${ct.name} from you`;
    G.orders.push({ id: `retake-${ct.name}`, kind: "rivalry", city: ct.name, rival: f.name, title: `Rivalry: take back ${ct.name}`, detail: `${f.name} took ${ct.name} while you were busy. Your fans are still there: book a room and win them back.`, receipt: "Qloo footprints + panel reaction", gain: loss, done: false });
    banner(`${ct.name.toUpperCase()} HAS FALLEN`, `${f.name} takes it · −${loss}% conquest`, false); Sound.play("lost"); event(`💀 ${ct.name} fell to ${f.name}. −${loss}% conquest.`, "bad");
    ops(`<span class="rv">💀 ${esc(f.name)} took ${esc(ct.name)} · −${loss}%</span>`);
    hud(-loss); await sleep(2000);
  }
  for (const f of G.fac.values()) {
    if (f.allied) { f.last = "Fighting at your side"; continue; }
    const prey = preyOf(f), theirs = G.cities.filter((c) => c.owner === f.id && c.state === "rival");
    const mo = G.fame.get(f.name)?.momentum ?? 0;
    const aggressive = (f.strategy === "compete" ? 0.7 : 0.25) + (mo > 10 ? 0.15 : 0); // rising fame makes rivals bolder
    if (prey && !G.sieges.some((s) => s.fid === f.id) && G.rng() < aggressive) {
      G.sieges.push({ city: prey.name, fid: f.id, left: 2 });
      G.orders.push({ id: `defend-${prey.name}-${G.week}`, kind: "defend", city: prey.name, title: `Defend ${prey.name}`, detail: `${f.name} is pulling your ${prey.name} fans their way. Play a show or drop content aimed at ${prey.name} within 2 weeks, or lose ${pts(prey)}% conquest.`, receipt: `Qloo footprints: ${f.name} vs you in ${prey.name}`, gain: 0, done: false });
      f.last = `Besieging ${prey.name}`;
      const from = nearest(theirs, prey); if (from) G.temp.push({ from: from.p, to: prey.p, col: f.col, t0: performance.now() });
      event(`⚔ ${f.name} lays siege to ${prey.name}! 2 weeks to defend it.`, "bad"); Sound.play("threat");
      ops(`<span class="rv">⚔ ${esc(f.name)}</span> besieges <b>${esc(prey.name)}</b>${mo > 10 ? ` (fame ▲${mo}%)` : ""}`);
    } else if (f.strategy === "ally" && G.rng() < 0.5) {
      const where = theirs[0]?.name ?? prey?.name ?? "their best city";
      f.last = `Open to a co-bill in ${where}`; event(`🕊️ ${f.name} would co-headline with you in ${where}.`, "good");
      ops(`<span class="ag">🕊️ ${esc(f.name)}</span> signals a co-bill in ${esc(where)}`);
    } else {
      const where = theirs[(G.week + f.name.length) % Math.max(1, theirs.length)]?.name;
      f.last = where ? `Dug in at ${where}` : "Building an audience";
      event(`🏴 ${f.name} ${where ? `is digging in at ${where}` : "is quietly building an audience"}.`, "info");
      ops(`<span class="rv">🏴 ${esc(f.name)}</span> ${where ? `fortifies ${esc(where)}` : "builds an audience"}`);
    }
    hud(); await sleep(700);
  }
  G.week++; G.hour = 9;
  const gain = regen(); G.buzz = Math.min(BUZZ_MAX, G.buzz + gain);
  G.busy = false;
  if (G.week > WEEKS) { G.week = WEEKS; hud(); renderOrders(); setTimeout(victory, 600); return; }
  event(`📅 Week ${G.week} begins. +${gain} buzz.`, "you"); ops(`<span class="ok">week ${G.week} begins</span> · +${gain} ⚡`);
  const urgent = G.orders.findIndex((o) => !o.done && o.kind === "defend");
  G.sel = urgent >= 0 ? urgent : G.orders.findIndex((o) => !o.done && costOf(o) <= G.buzz);
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
    ["Agent missions", G.missions],
    ["Allies recruited", G.allies],
    ["Cities taken from rivals", G.taken],
    ["Sieges broken / cities lost", `${G.saved} / ${G.lost}`],
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
    ...G.drafts.map((d) => `Draft post: ${d}`),
    G.potions.length ? `Trending now: ${G.potions.map((p) => `${p.title} (${p.where})`).join(", ")}` : ""].filter((x) => x !== undefined).join("\n");
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
addEventListener("keydown", (e) => {
  if (!G || $("#game").hidden || e.target.closest("input,textarea")) return;
  if (/^[1-9]$/.test(e.key) && G.orders[+e.key - 1]) selectOrder(+e.key - 1);
  if ((e.key === "Enter" || e.key === "e" || e.key === "E") && G.sel >= 0) { e.preventDefault(); execute(G.sel); }
  if (e.key === " ") { e.preventDefault(); Clock.toggle(); }
});
function toSite() { $("#game").hidden = true; $("#scan").hidden = true; $("#site").hidden = false; Field.setMode("site"); Neuro.reset(); if (G) G.over = true; }

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
(function loop(now) { Field.frame(now); if (G && !$("#game").hidden) MapView.frame(now); requestAnimationFrame(loop); })(performance.now());
// a shareable link: ?play=Name opens the game as that person
const autoplay = new URLSearchParams(location.search).get("play");
if (autoplay) openWho(autoplay);
