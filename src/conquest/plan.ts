import { METROS } from "./geo.js";
import { buildPlan, bucketOf, type Candidate, type Plan, type Receipt, type TourInput } from "./tour.js";

/** What the planner needs from the rest of the app (the server passes the real ones; tests pass fakes). */
export type TourDeps = {
  campaign: (name: string, who: { ids?: string }) => Promise<any>;
  venuesIn: (name: string, who: { ids?: string }, city: string) => Promise<{ status: string; venues: any[]; receipts: any[] }>;
  trends: (geo: string) => Promise<any>;
  weather: (lat: number, lon: number, days?: number) => Promise<any>;
};
/** The live board from the browser: who holds each city right now. */
export type Board = { cities?: { name: string; side: string; owner?: string | null }[] } | null;

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

export async function gatherCandidates(d: TourDeps, name: string, who: { ids?: string }, board: Board): Promise<{ cands: Candidate[]; campaign: any }> {
  const camp = await d.campaign(name, who);
  if (camp?.status !== "ok") throw new Error(`no campaign for ${name} (${camp?.status ?? "error"})`);
  const at = new Date().toISOString();
  const qlooRef = (wf: string) => (camp.receipts ?? []).find((r: any) => r.workflow === wf)?.ref;
  const tags: string[] = (camp.stimulus?.appeals ?? []).concat((camp.audience?.tags ?? [])).slice(0, 8).map((t: any) => String(t?.name ?? t).toLowerCase());
  const nameRe = new RegExp(name.split(/\s+/).filter((w) => w.length > 3).map((w) => w.replace(/[^\w]/g, "")).join("|") || "^$", "i");
  const rivalName = (id: string | null) => (camp.rivals ?? []).find((r: any) => r.id === id)?.name ?? null;
  const live = new Map((board?.cities ?? []).map((c) => [c.name, c]));
  let cities = (camp.territory?.cities ?? []).filter((c: any) => METROS[c.name] && c.you > 0);
  // fewer than 10 cities with fans: widen to every metro the game knows
  if (cities.length < 10) cities = [...cities, ...Object.keys(METROS).filter((n) => !cities.some((c: any) => c.name === n)).map((n) => ({ name: n, you: 0, state: "open", owner: null }))];
  const trendByState = new Map<string, Promise<any>>();
  const cands = await pool(cities, 6, async (c: any): Promise<Candidate> => {
    const geo = METROS[c.name]!;
    const [v, tr, wx] = await Promise.all([
      d.venuesIn(name, who, c.name).catch(() => ({ status: "error", venues: [], receipts: [] })),
      (trendByState.get(geo.state) ?? trendByState.set(geo.state, d.trends(`US-${geo.state}`).catch(() => null)).get(geo.state))!,
      d.weather(geo.lat, geo.lon, 16).catch(() => null),
    ]);
    const items: { title: string }[] = tr?.status === "ok" ? tr.items ?? [] : [];
    const byName = items.find((x) => nameRe.test(x.title)), byTopic = items.find((x) => tags.some((t) => t.length > 3 && x.title.toLowerCase().includes(t)));
    const trend = byName ? 1 : byTopic ? 0.7 : items.length ? 0.2 : 0.5;
    const trendNote = tr?.status !== "ok" ? "unavailable" : byName ? `you're trending in ${geo.state}: “${byName.title}”` : byTopic ? `“${byTopic.title}” is trending in ${geo.state}` : `nothing of yours trending in ${geo.state}`;
    const side = live.get(c.name)?.side ?? (c.owner === "you" ? "you" : c.state === "rival" ? "rival" : c.state === "allied" ? "allied" : "open");
    const receipts: Receipt[] = [
      { source: "Qloo · where your fans are", ref: qlooRef("where_popular"), detail: `${c.you} fan signal`, at },
      ...v.receipts.map((r: any) => ({ source: `Qloo · ${r.workflow} (places in ${c.name})`, ref: r.ref, detail: r.cached ? "cached" : "live", at })),
      { source: "Google Trends daily RSS", detail: `US-${geo.state} · ${items.length} items`, at },
      { source: "Open-Meteo 16-day forecast", detail: wx?.status === "ok" ? `${geo.lat},${geo.lon}` : "unavailable", at },
    ];
    return {
      city: c.name, geo, fans: c.you ?? 0,
      venues: v.venues.map((x: any) => ({ name: x.name, fit: x.fit, bucket: bucketOf(x.name, x.tags), address: x.address, phone: x.phone, website: x.website })),
      trend, trendNote,
      wx: wx?.status === "ok" ? (wx.days ?? []).map((x: any) => ({ date: x.date, rain: x.rain ?? 0 })) : null,
      rival: side === "rival" ? "held_by_rival" : side === "allied" ? "ally" : side === "you" ? "yours" : "open",
      rivalName: rivalName(c.owner && c.owner !== "you" ? c.owner : null), receipts,
    };
  });
  return { cands, campaign: camp };
}

export async function planTour(d: TourDeps, name: string, who: { ids?: string }, input: TourInput, board: Board = null): Promise<Plan> {
  const { cands } = await gatherCandidates(d, name, who, board);
  const plan = buildPlan(input, cands) as Plan;
  plan.performer = name; plan.generatedAt = new Date().toISOString();
  return plan;
}
