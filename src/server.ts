import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  audienceReport,
  rehearseReport,
  ablationReport,
  backtestReport,
  partnerReport,
  directorReport,
  campaignReport,
  profileReport,
  youtubeBacktestReport,
  trendsCheckReport,
  serverInfo,
} from "./service/engine.js";

/**
 * Rehearsal's HTTP server. Serves the single-page UI from public/ and a small
 * JSON API over the engine. No framework — node:http only. Deployable on any
 * Node host (Render, Railway, a VM); the browser never calls Qloo directly.
 */

const PORT = Number(process.env.PORT || 5173);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res: any, code: number, body: string | Buffer, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function api(url: URL, res: any) {
  const q = url.searchParams;
  const name = q.get("name") ?? "";
  // a creator Qloo doesn't know passes ids of who their audience is like;
  // text is custom material to battle-test
  const who = { ids: q.get("ids") || undefined, text: q.get("text") || undefined };
  try {
    switch (url.pathname) {
      case "/api/health":
        return send(res, 200, JSON.stringify({ ok: true, ...serverInfo() }));
      case "/api/profile":
        return send(res, 200, JSON.stringify(await profileReport(name)));
      case "/api/audience":
        return send(res, 200, JSON.stringify(await audienceReport(name, who)));
      case "/api/rehearse":
        return send(res, 200, JSON.stringify(await rehearseReport(name, who)));
      case "/api/ablation":
        return send(res, 200, JSON.stringify(await ablationReport(name, who)));
      case "/api/backtest":
        return send(res, 200, JSON.stringify(backtestReport()));
      case "/api/campaign":
        return send(res, 200, JSON.stringify(await campaignReport(name, who)));
      case "/api/director":
        return send(res, 200, JSON.stringify(await directorReport(name, q.get("goal") ?? undefined, who)));
      case "/api/partners":
        return send(res, 200, JSON.stringify(await partnerReport(name, q.get("kind") ?? "people", q.get("location") ?? undefined, who)));
      case "/api/backtest-youtube":
        return send(res, 200, JSON.stringify(await youtubeBacktestReport()));
      case "/api/trends":
        return send(res, 200, JSON.stringify(await googleTrends(q.get("geo") ?? "US")));
      case "/api/weather":
        return send(res, 200, JSON.stringify(await weather(Number(q.get("lat")), Number(q.get("lon")))));
      case "/api/fame":
        return send(res, 200, JSON.stringify(await fame((q.get("names") ?? "").split("|").filter(Boolean).slice(0, 6))));
      case "/api/trends-check":
        return send(res, 200, JSON.stringify(await trendsCheckReport()));
      default:
        return send(res, 404, JSON.stringify({ error: "not found" }));
    }
  } catch (e: any) {
    return send(res, 500, JSON.stringify({ error: String(e?.message ?? e) }));
  }
}

// Google Trends' public daily RSS (no key), country or state level. Cached for
// 30 minutes. Grim stories are dropped: no one should "ride" a tragedy.
const trendCache = new Map<string, { t: number; body: any }>();
const GRIM = /\b(dead|death|dies|died|killed|kill|shooting|shot|crash|missing|murder|funeral|obituary|stabbing|victim)\b/i;
async function googleTrends(geo: string) {
  if (!/^US(-[A-Z]{2})?$/.test(geo)) return { status: "error", error: "bad geo" };
  const hit = trendCache.get(geo);
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.body;
  try {
    const xml = await (await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { signal: AbortSignal.timeout(8000) })).text();
    const tag = (s: string, t: string) => (s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) ?? [])[1]?.trim().replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"') ?? "";
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map(([, it = ""]) => ({ title: tag(it, "title"), traffic: tag(it, "ht:approx_traffic"), news: tag(it, "ht:news_item_title") }))
      .filter((x) => x.title && !GRIM.test(x.title + " " + x.news))
      .slice(0, 6);
    const body = { status: "ok", source: "Google Trends daily RSS", geo, items };
    trendCache.set(geo, { t: Date.now(), body });
    return body;
  } catch (e: any) {
    return { status: "unavailable", error: String(e?.message ?? e) };
  }
}

// Free, keyless signals the agents use. Each is cached so a demo never hammers them.
const memo = new Map<string, { t: number; body: any }>();
async function cached(key: string, ttl: number, fn: () => Promise<any>) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.body;
  const body = await fn();
  if (body?.status === "ok") memo.set(key, { t: Date.now(), body });
  return body;
}

// Open-Meteo 7-day forecast: the weather agent picks the best show night.
async function weather(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { status: "error", error: "bad coords" };
  return cached(`wx:${lat.toFixed(1)},${lon.toFixed(1)}`, 3600_000, async () => {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=7`;
      const d: any = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
      const days = (d.daily?.time ?? []).map((date: string, i: number) => ({ date, code: d.daily.weathercode[i], tmax: d.daily.temperature_2m_max[i], rain: d.daily.precipitation_probability_max[i] }));
      return { status: "ok", source: "Open-Meteo", timezone: d.timezone, days };
    } catch (e: any) {
      return { status: "unavailable", error: String(e?.message ?? e) };
    }
  });
}

// Wikipedia pageviews, last 30 days vs the 30 before: a real fame meter and momentum.
async function fame(names: string[]) {
  return cached(`fame:${names.join("|")}`, 6 * 3600_000, async () => {
    const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const end = new Date(Date.now() - 86400_000), start = new Date(end.getTime() - 59 * 86400_000);
    const out = await Promise.all(names.map(async (name) => {
      try {
        // Qloo's names aren't always Wikipedia's ("David Oliver Sacks"): follow redirects first
        const q: any = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(name.trim())}`, { headers: { "user-agent": "Conquest/0.1 (hackathon demo)" }, signal: AbortSignal.timeout(8000) })).json().catch(() => ({}));
        const title = (Object.values(q?.query?.pages ?? {})[0] as any)?.title ?? name.trim();
        const t = encodeURIComponent(title.replace(/ /g, "_"));
        const r = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/daily/${day(start)}/${day(end)}`, { headers: { "user-agent": "Conquest/0.1 (hackathon demo)" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { name, views: null };
        const v = ((await r.json()) as any).items.map((x: any) => x.views as number);
        const last = v.slice(-30).reduce((a: number, b: number) => a + b, 0), prev = v.slice(0, -30).reduce((a: number, b: number) => a + b, 0);
        return { name, views: last, momentum: prev ? Math.round(((last - prev) / prev) * 100) : null, series: v.slice(-30) };
      } catch {
        return { name, views: null };
      }
    }));
    return { status: "ok", source: "Wikipedia pageviews", people: out };
  });
}

async function serveStatic(pathname: string, res: any) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "forbidden", "text/plain");
  try {
    const body = await readFile(file);
    send(res, 200, body, MIME[extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "not found", "text/plain");
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return void api(url, res);
  return void serveStatic(url.pathname, res);
}).listen(PORT, () => {
  const info = serverInfo();
  console.log(`Conquest on http://localhost:${PORT}`);
  console.log(`  Qloo=${info.qlooMode}  respondents=${info.respondentMode}  panel=${info.panelN}`);
  void prewarm();
});

// Warm the demo players' campaigns in the background so the first click is
// instant (a fresh live campaign makes ~100 Qloo calls). One at a time.
async function prewarm() {
  if (serverInfo().qlooMode !== "live" || process.env.PREWARM === "0") return;
  const names = (process.env.PREWARM_NAMES ?? "Cedric the Entertainer,Jason Calacanis,Los Angeles Dodgers").split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of names) {
    const t0 = Date.now();
    try {
      const c: any = await campaignReport(n);
      console.log(`  warmed ${n}: ${c.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (e: any) {
      console.log(`  warm ${n} failed: ${e?.message ?? e}`);
    }
  }
}
