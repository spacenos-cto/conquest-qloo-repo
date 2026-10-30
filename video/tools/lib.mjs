// Shared recording helpers: a CDP screencast that saves every frame with its timestamp,
// a visible cursor (headless has none), smooth mouse moves and a beat log for the edit.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

export async function open(outDir, { dpr = 2 } = {}) {
  mkdirSync(`${outDir}/frames`, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, acceptDownloads: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("conquest-coached", "1"); } catch {}
    const mk = () => {
      if (document.getElementById("__cur")) return;
      const c = document.createElement("div"); c.id = "__cur";
      c.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
      c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));transition:none";
      const r = document.createElement("div"); r.id = "__ring";
      r.style.cssText = "position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #ffd76a;z-index:2147483646;pointer-events:none;opacity:0";
      document.documentElement.append(c, r);
      addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
      addEventListener("mousedown", (e) => {
        r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
        r.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.6)" }], { duration: 500, easing: "ease-out" });
      }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mk); else mk();
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const frames = []; let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `f${String(n++).padStart(6, "0")}.jpg`;
    writeFileSync(`${outDir}/frames/${file}`, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const marks = [];
  let mx = 720, my = 450;
  const api = {
    page, browser,
    async start() { await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 1, maxWidth: 1440 * dpr, maxHeight: 900 * dpr }); api.mark("start"); },
    mark(name, extra) { const m = { name, t: Date.now() / 1000, ...extra }; marks.push(m); console.log("mark", name); },
    async moveTo(x, y, ms = 600) {
      const steps = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
        await page.waitForTimeout(ms / steps);
      }
      mx = x; my = y;
    },
    async clickSel(sel, { ms = 650, pause = 250 } = {}) {
      const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox(); if (!b) throw new Error("no box " + sel);
      await api.moveTo(b.x + b.width / 2, b.y + b.height / 2, ms); await page.waitForTimeout(pause);
      await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
    },
    async clickXY(x, y, ms = 600) { await api.moveTo(x, y, ms); await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); },
    wait: (ms) => page.waitForTimeout(ms),
    async still(name) { await page.screenshot({ path: `${outDir}/still-${name}.png` }); api.mark("still-" + name); },
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await page.waitForTimeout(300);
      writeFileSync(`${outDir}/frames.json`, JSON.stringify(frames));
      writeFileSync(`${outDir}/marks.json`, JSON.stringify(marks, null, 1));
      await browser.close();
    },
  };
  return api;
}
