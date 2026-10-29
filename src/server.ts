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
  venuesIn,
  lovedIn,
} from "./service/engine.js";
import { googleTrends, weather, fame, cached } from "./conquest/signals.js";
import { aiStatus, AiOff } from "./ai/llm.js";
import { strategist, writeFor, adviseVideo, Board, WriteReq, type Deps } from "./ai/agents.js";
import { makeRoutes } from "./conquest/routes.js";

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
  ".jpg": "image/jpeg",
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
      case "/api/ytfind":
        return send(res, 200, JSON.stringify(await ytFind(name)));
      case "/api/xray":
        return send(res, 200, JSON.stringify(await xray(name, who, q.get("yt") ?? "")));
      case "/api/img":
        return void img(q.get("u") ?? "", res);
      case "/api/ai":
        return send(res, 200, JSON.stringify(aiStatus()));
      case "/api/trends-check":
        return send(res, 200, JSON.stringify(await trendsCheckReport()));
      default:
        return send(res, 404, JSON.stringify({ error: "not found" }));
    }
  } catch (e: any) {
    return send(res, 500, JSON.stringify({ error: String(e?.message ?? e) }));
  }
}

// Content X-ray: read a creator's latest real YouTube videos (public channel
// RSS, no key), play each one's title and description to the 1,000-fan panel
// and the brain model, and say what would happen. Then check the panel's
// ranking against the videos' real view counts, so the read earns its trust.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function channelId(yt: string): Promise<string | null> {
  const s = yt.trim();
  const direct = s.match(/(UC[A-Za-z0-9_-]{22})/); if (direct) return direct[1]!;
  const handle = (s.match(/@([A-Za-z0-9._-]{3,30})/) ?? s.match(/^([A-Za-z0-9._-]{3,30})$/))?.[1];
  if (!handle) return null;
  return cached(`ytid:${handle.toLowerCase()}`, 7 * 864e5, async () => {
    const html = await (await fetch(`https://www.youtube.com/@${handle}`, { headers: { "user-agent": UA, "accept-language": "en-US" }, signal: AbortSignal.timeout(10000) })).text();
    const id = html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ?? html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/)?.[1];
    return id ? { status: "ok", id } : { status: "not_found" };
  }).then((r: any) => r?.id ?? null);
}
// Find a creator's YouTube channel from their name (YouTube's public channel
// search). The best match is the one whose title carries the name; the rest
// come back as alternatives to pick from.
async function ytFind(name: string) {
  const q = name.trim(); if (!q) return { status: "error", error: "no name" };
  return cached(`ytfind:${q.toLowerCase()}`, 7 * 864e5, async () => {
    try {
      const html = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`, { headers: { "user-agent": UA, "accept-language": "en-US" }, signal: AbortSignal.timeout(10000) })).text();
      const re = /"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"\}[\s\S]{0,6000}?"canonicalBaseUrl":"\/@([^"]+)"/g;
      const channels: { id: string; title: string; handle: string }[] = [];
      for (let m; (m = re.exec(html)) && channels.length < 4; ) channels.push({ id: m[1]!, title: m[2]!.replace(/\\u0026/g, "&"), handle: "@" + m[3]! });
      if (!channels.length) return { status: "not_found" };
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const best = Math.max(0, channels.findIndex((c) => norm(c.title).includes(norm(q)) || norm(c.handle).includes(norm(q))));
      return { status: "ok", best, channels };
    } catch (e: any) {
      return { status: "unavailable", error: String(e?.message ?? e) };
    }
  });
}
function spearman(a: number[], b: number[]) {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r as number[]; };
  const n = a.length; if (n < 3) return null;
  const ra = rank(a), rb = rank(b); const d2 = ra.reduce((s, x, i) => s + (x - rb[i]!) ** 2, 0);
  return Math.round((1 - (6 * d2) / (n * (n * n - 1))) * 100) / 100;
}
async function xray(name: string, who: { ids?: string; text?: string }, yt: string) {
  const id = await channelId(yt).catch(() => null);
  if (!id) return { status: "not_found", error: "Couldn't find that YouTube channel. Try the @handle from the channel URL." };
  return cached(`xray:${name}|${who.ids ?? ""}|${id}`, 3600_000, async () => {
    const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { signal: AbortSignal.timeout(10000) })).text();
    const tag = (s: string, t: string) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) ?? [])[1]?.trim().replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"') ?? "";
    const channel = tag(xml, "title");
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 6).map(([, e = ""]) => ({
      videoId: tag(e, "yt:videoId"), title: tag(e, "title"), published: tag(e, "published"),
      views: Number(e.match(/<media:statistics views="(\d+)"/)?.[1] ?? 0), thumb: e.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? null,
      description: tag(e, "media:description").slice(0, 600),
    }));
    if (!entries.length) return { status: "empty", channel };
    const videos = [];
    for (const v of entries) {
      const r: any = await rehearseReport(name, { ids: who.ids, text: `${v.title}. ${v.description}` });
      if (r.status !== "ok") return { status: r.status, channel, coverage: r.coverage };
      const dz = r.tribe?.deadZones ?? [];
      // how the brain model and the panel reacted, compact enough to draw per video
      const lit = (a: number[] = []) => { const k = (x: number) => Math.max(0, Math.min(100, Math.round(((x - 22) / 70) * 100))); return a.length ? { avg: k(a.reduce((s, x) => s + x, 0) / a.length), peak: k(Math.max(...a)) } : { avg: 0, peak: 0 }; };
      const regions = Object.fromEntries(Object.entries(r.tribe?.regions ?? {}).map(([k, a]) => [k, lit(a as number[])]));
      const scores: number[] = (r.reactions ?? []).map((x: [string, number]) => x[1]);
      const hist = [1, 2, 3, 4, 5].map((s) => Math.round((scores.filter((x) => Math.round(x) === s).length / Math.max(1, scores.length)) * 100));
      const quote = r.aggregate.quotes?.[0] ?? null, why = (r.aggregate.reasons ?? []).filter((x: any) => x.element !== "overall").slice(0, 2);
      videos.push({ ...v, regions, hist, quote, why,mean: Math.round(r.aggregate.mean * 10) / 10, pct45: r.aggregate.pct45, top: r.split?.top ? { city: r.split.top.metro, mean: Math.round(r.split.top.mean * 10) / 10 } : null, bottom: r.split?.bottom ? { city: r.split.bottom.metro, mean: Math.round(r.split.bottom.mean * 10) / 10 } : null, appeals: r.stimulus?.appeals ?? [], deadZones: dz.length, firstDead: dz[0] ? Math.round((dz[0].start / Math.max(1, (r.tribe?.points?.length ?? 25) - 1)) * 100) : null, brain: r.tribe?.points ?? [] });
    }
    const avg = videos.reduce((s, v) => s + v.mean, 0) / videos.length;
    // compare against views per day, so a 2-day-old clip is not judged against a 2-week-old episode
    const perDay = (v: { views: number; published: string }) => v.views / Math.max(0.5, (Date.now() - Date.parse(v.published)) / 864e5);
    for (const v of videos) (v as any).perDay = Math.round(perDay(v));
    const rho = spearman(videos.map((v) => v.mean), videos.map(perDay));
    return { status: "ok", source: "YouTube channel RSS (public) + 1,000-fan panel + TRIBE stub", channel, channelId: id, avg: Math.round(avg * 100) / 100, rho, videos };
  });
}

// Same-origin copies of Qloo portraits, so the share card can draw them onto a
// canvas and still export it (Qloo's image CDN sends no CORS headers).
const imgCache = new Map<string, { type: string; body: Buffer }>();
async function img(u: string, res: any) {
  let url: URL;
  try { url = new URL(u); } catch { return send(res, 400, "bad url", "text/plain"); }
  if (url.protocol !== "https:" || url.hostname !== "images.qloo.com") return send(res, 403, "not allowed", "text/plain");
  let hit = imgCache.get(url.href);
  if (!hit) {
    try {
      const r = await fetch(url.href, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return send(res, 404, "not found", "text/plain");
      hit = { type: r.headers.get("content-type") ?? "image/jpeg", body: Buffer.from(await r.arrayBuffer()) };
      if (imgCache.size > 200) imgCache.clear();
      imgCache.set(url.href, hit);
    } catch { return send(res, 502, "fetch failed", "text/plain"); }
  }
  res.writeHead(200, { "content-type": hit.type, "cache-control": "public, max-age=86400" });
  res.end(hit.body);
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

// The thinking agents take the board as a JSON body. With the AI layer off they
// answer { status: "off" } and the browser keeps its templates.
const deps: Deps = { audience: audienceReport, rehearse: rehearseReport, trends: googleTrends, weather, fame };
async function agentApi(path: string, req: any, res: any) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) return send(res, 413, JSON.stringify({ error: "too large" })); }
  try {
    const body = JSON.parse(raw || "{}");
    if (path === "/api/agent/strategist") return send(res, 200, JSON.stringify(await strategist(Board.parse(body), deps)));
    if (path === "/api/agent/write") return send(res, 200, JSON.stringify(await writeFor(WriteReq.parse(body))));
    if (path === "/api/agent/xray") return send(res, 200, JSON.stringify(await adviseVideo(body)));
    return send(res, 404, JSON.stringify({ error: "not found" }));
  } catch (e: any) {
    // budget hit, refusal or a bad answer: the game falls back to templates
    return send(res, 200, JSON.stringify({ status: e instanceof AiOff ? "off" : "error", error: String(e?.message ?? e).slice(0, 200) }));
  }
}

// Tour Planner, City Briefs and the Monday email
const conquest = makeRoutes({ campaign: campaignReport, venuesIn, lovedIn, trends: googleTrends, weather, fame }, send);
setInterval(() => void conquest.tick(process.env.PUBLIC_URL || `http://localhost:${PORT}`), 60_000).unref();

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (await conquest.handle(req, res, url)) return;
  if (req.method === "POST" && url.pathname.startsWith("/api/agent/")) return void agentApi(url.pathname, req, res);
  if (url.pathname.startsWith("/api/")) return void api(url, res);
  return void serveStatic(url.pathname, res);
}).listen(PORT, () => {
  const info = serverInfo();
  console.log(`Conquest on http://localhost:${PORT}`);
  console.log(`  Qloo=${info.qlooMode}  respondents=${info.respondentMode}  panel=${info.panelN}  ai: ${aiStatus().note}`);
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
      // the jury tour X-rays Jason's All-In channel: have it ready
      if (n === "Jason Calacanis") { const x: any = await xray(n, {}, "@allin"); console.log(`  warmed X-ray @allin: ${x.status}`); }
    } catch (e: any) {
      console.log(`  warm ${n} failed: ${e?.message ?? e}`);
    }
  }
}
