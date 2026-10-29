/**
 * Free, keyless outside signals the agents use: Google Trends daily RSS,
 * Open-Meteo forecasts and Wikipedia pageviews. Shared by the server, the
 * Tour Planner, City Briefs and the Monday email. Each is cached in memory.
 */
// Google Trends' public daily RSS (no key), country or state level. Cached for
// 30 minutes. Grim stories are dropped: no one should "ride" a tragedy.
const trendCache = new Map<string, { t: number; body: any }>();
const GRIM = /\b(dead|death|dies|died|killed|kill|shooting|shot|crash|missing|murder|funeral|obituary|stabbing|victim)\b/i;
export async function googleTrends(geo: string) {
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
export async function cached(key: string, ttl: number, fn: () => Promise<any>) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.body;
  const body = await fn();
  if (body?.status === "ok") memo.set(key, { t: Date.now(), body });
  return body;
}

// Open-Meteo 7-day forecast: the weather agent picks the best show night.
export async function weather(lat: number, lon: number, days = 7) {
  days = Math.max(1, Math.min(16, Math.round(days)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { status: "error", error: "bad coords" };
  return cached(`wx:${lat.toFixed(1)},${lon.toFixed(1)}:${days}`, 3600_000, async () => {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=${days}`;
      const d: any = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
      const out = (d.daily?.time ?? []).map((date: string, i: number) => ({ date, code: d.daily.weathercode[i], tmax: d.daily.temperature_2m_max[i], rain: d.daily.precipitation_probability_max[i] }));
      return { status: "ok", source: "Open-Meteo", timezone: d.timezone, days: out };
    } catch (e: any) {
      return { status: "unavailable", error: String(e?.message ?? e) };
    }
  });
}

// Wikipedia pageviews, last 30 days vs the 30 before: a real fame meter and momentum.
export async function fame(names: string[]) {
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

