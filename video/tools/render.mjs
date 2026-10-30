// Renders the EDL to JPEG frames (30 fps) through stage.html, one screenshot per frame.
// node render.mjs out            → every frame into out/frames, then encode with ffmpeg
// node render.mjs out --preview  → three frames per segment into out/preview
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { SEGMENTS } from "./edl.mjs";

const FPS = 30, out = process.argv[2] || "render", preview = process.argv.includes("--preview");
const here = resolve(".");
const url = (p) => pathToFileURL(resolve(here, p)).href;
const takes = {};
const take = (t) => (takes[t] ??= (() => {
  const f = JSON.parse(readFileSync(`${t}/frames.json`)), t0 = JSON.parse(readFileSync(`${t}/marks.json`))[0].t;
  return f.map((x) => ({ file: `${t}/frames/${x.file}`, s: x.t - t0 }));
})());
function frameAt(t, s) { const f = take(t); let lo = 0, hi = f.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (f[m].s <= s) lo = m; else hi = m - 1; } return f[lo].file; }
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function rectAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [ta, a] = keys[i - 1], [tb, b] = keys[i], k = ease((t - ta) / (tb - ta));
    return a.map((v, j) => v + (b[j] - v) * k);
  }
  return keys.at(-1)[1];
}
const fade = (t, a, b, f = 0.25) => Math.max(0, Math.min(1, (t - a) / f, (b - t) / f));

function state(seg, t) {
  const s = { tag: seg.tag, tagOp: 1, speed: seg.speed, caps: [] };
  if (seg.src) { s.src = url(frameAt(seg.src.take, seg.src.from + (t / seg.dur) * (seg.src.to - seg.src.from))); s.rect = seg.rect; }
  if (seg.still) { s.src = url(seg.still); s.rect = rectAt(seg.keys, t); s.clip = seg.clip; }
  if (seg.card) { s.card = seg.card; s.cardOp = fade(t, 0, seg.dur, 0.35); }
  s.caps = seg.caps.map(([a, b, pos, html]) => ({ pos, html, op: fade(t, a, b) })).filter((c) => c.op > 0);
  if (seg.dip) s.dip = Math.max(0, 1 - t / 0.3);
  return s;
}

const total = SEGMENTS.reduce((a, s) => a + s.dur, 0);
console.log(`segments ${SEGMENTS.length}, total ${total.toFixed(1)} s`);
const dir = `${out}/${preview ? "preview" : "frames"}`; mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await p.goto(url("stage.html")); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
let n = 0, t0 = 0; const started = Date.now();
for (const [i, seg] of SEGMENTS.entries()) {
  const times = preview ? [seg.dur * 0.15, seg.dur * 0.5, seg.dur * 0.9] : Array.from({ length: Math.round(seg.dur * FPS) }, (_, k) => k / FPS);
  for (const [j, t] of times.entries()) {
    await p.evaluate((s) => window.setFrame(s), state(seg, t));
    const name = preview ? `s${String(i).padStart(2, "0")}-${j}.jpg` : `o${String(n++).padStart(5, "0")}.jpg`;
    await p.screenshot({ path: `${dir}/${name}`, type: "jpeg", quality: 94 });
  }
  t0 += seg.dur;
  if (!preview) console.log(`seg ${i} done · ${t0.toFixed(1)}/${total.toFixed(1)} s · ${((Date.now() - started) / 1000).toFixed(0)} s elapsed`);
}
await b.close();
