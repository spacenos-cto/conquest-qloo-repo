import { z } from "zod/v4";
import { METROS } from "./geo.js";
import { planTour, type TourDeps } from "./plan.js";
import { toCsv, toIcs, toText, type Plan } from "./tour.js";
import { buildBrief, type BriefDeps } from "./brief.js";
import { briefHtml, briefIndexHtml, tourHtml } from "./pages.js";
import { changesFor, movesFor, renderMail, deliver, isMondayEight, type MailDeps } from "./mail.js";
import * as db from "./store.js";
import { ask, aiMode, AI_MODEL } from "../ai/llm.js";
import { writeFor } from "../ai/agents.js";

/**
 * HTTP routes for the Tour Planner, City Briefs and the Monday email. Mounted
 * by src/server.ts; everything works with the AI layer off.
 */
export type Deps = TourDeps & BriefDeps & MailDeps;
type Send = (res: any, code: number, body: string | Buffer, type?: string) => void;

const TourReq = z.object({
  campaignId: z.string().max(64).optional(), name: z.string().min(1).max(120), ids: z.string().max(200).optional(),
  home: z.string(), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxCities: z.number().int().min(1).max(12).optional(), maxDriveHours: z.number().min(1).max(16).optional(), flyingOk: z.boolean().optional(),
  roomSize: z.enum(["small", "mid", "large"]).optional(),
});
const Sync = z.object({ id: z.string().min(6).max(64), snap: z.record(z.string(), z.any()) });
const SubReq = z.object({ campaignId: z.string().min(6).max(64), email: z.string().email().max(200), firstName: z.string().max(60), tz: z.string().max(60).optional() });

const week = () => { const d = new Date(), j = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}w${Math.ceil(((+d - +j) / 864e5 + j.getUTCDay() + 1) / 7)}`; };
const baseOf = (req: any) => process.env.PUBLIC_URL || `http://${req.headers.host ?? "localhost:5173"}`;
async function body(req: any): Promise<any> { let raw = ""; for await (const c of req) { raw += c; if (raw.length > 200_000) throw new Error("too large"); } return JSON.parse(raw || "{}"); }

/** AI path: Claude may re-order the stops and write the "why"; it may not change the cities. */
const Reorder = z.object({ order: z.array(z.string()), why: z.array(z.object({ city: z.string(), line: z.string() })) });
async function aiTour(plan: Plan): Promise<Plan> {
  if (aiMode() !== "claude" || plan.stops.length < 2) return plan;
  try {
    const r = await ask("tour", { system: "You are the tour strategist inside Conquest. Given a performer's tour stops (already chosen from real data), return a better order for the route (start near the home city, avoid backtracking, prefer weekend nights) and one short 'why this leg' line per stop that cites only the numbers given. Never add or remove cities.",
      user: JSON.stringify({ home: plan.input.home, stops: plan.stops.map((s) => ({ city: s.city, fans: s.fans, venue: s.venue?.name, fit: s.fit, night: s.night, why: s.why })) }), schema: Reorder, maxTokens: 3000 });
    const cities = plan.stops.map((s) => s.city);
    if (r.order.length !== cities.length || [...r.order].sort().join() !== [...cities].sort().join()) return plan; // invented or dropped a city: ignore
    const by = new Map(plan.stops.map((s) => [s.city, s])), why = new Map(r.why.map((w) => [w.city, w.line]));
    // keep the rules' nights (they respect the window); only the order and copy change
    const nights = plan.stops.map((s) => s.night);
    plan.stops = r.order.map((c, i) => ({ ...by.get(c)!, n: i + 1, night: nights[i] ?? null, why: why.get(c) ?? by.get(c)!.why }));
    plan.ai = { model: AI_MODEL };
  } catch { /* keep the rules plan */ }
  return plan;
}

export function makeRoutes(d: Deps, send: Send) {
  const json = (res: any, code: number, o: unknown) => send(res, code, JSON.stringify(o));
  const html = (res: any, s: string) => send(res, 200, s, "text/html; charset=utf-8");
  const aiWrite = async (kind: "pitch" | "sponsor", context: Record<string, unknown>) => { const r: any = await writeFor({ kind, context }).catch(() => null); return r?.status === "ok" ? r.text : null; };

  async function brief(cid: string, city: string, req: any, fresh = false) {
    const snap = db.getCampaign(cid); if (!snap) throw new Error("unknown campaign: open it in the game once so it syncs");
    const key = `v2|${cid}|${city}|${snap.week ?? 1}|${week()}`; // bump v when the brief's sources change
    const hit = !fresh && db.getBrief(key); if (hit) return hit;
    const b = await buildBrief({ ...d, write: aiMode() === "claude" ? aiWrite : undefined }, { name: snap.name, ids: snap.q?.ids, city, snapshot: snap });
    db.saveBrief(key, cid, city, b);
    return b;
  }

  async function mailFor(cid: string, base: string) {
    const snap = db.getCampaign(cid); if (!snap) throw new Error("unknown campaign");
    const sub = db.getSub(cid), prev = db.campaignWeek(cid, (snap.week ?? 1) - 1), tour = db.latestTour(cid);
    const changes = await changesFor(d, snap, prev), moves = movesFor(snap, tour, base, cid);
    const unsub = sub ? `${base}/mail/unsubscribe?t=${sub.token}` : `${base}/mail/unsubscribe`;
    return { sub, mail: renderMail({ firstName: sub?.first_name || String(snap.name ?? "there").split(" ")[0]!, snap, changes, moves, tour, base, cid, unsub }) };
  }

  /** Monday 8 am in each subscriber's time zone; unsubscribed people are skipped */
  async function tick(base: string) {
    for (const s of db.activeSubs()) {
      const { yes, localDate } = isMondayEight(s.tz || "America/Los_Angeles");
      if (!yes || (s.last_sent ?? "").startsWith(localDate)) continue;
      try { const { mail } = await mailFor(s.campaign_id, base); const r = await deliver(s.email, mail, `${s.campaign_id}-${localDate}`); db.markSent(s.campaign_id, `${localDate}T08`); db.logMail(s.campaign_id, r.mode, mail.subject, "ok"); }
      catch (err) { db.logMail(s.campaign_id, "error", "", String(err)); }
    }
  }

  async function handle(req: any, res: any, url: URL): Promise<boolean> {
    const p = url.pathname, m = (re: RegExp) => p.match(re);
    try {
      // links in briefs and emails reopen the performer's campaign
      if (p === "/" && url.searchParams.get("resume")) {
        const snap = db.getCampaign(url.searchParams.get("resume")!);
        res.writeHead(302, { location: snap ? `/?play=${encodeURIComponent(snap.name)}` : "/" }); res.end(); return true;
      }
      if (req.method === "POST" && p === "/api/campaign/sync") { const b = Sync.parse(await body(req)); db.saveCampaign(b.id, b.snap); json(res, 200, { ok: true }); return true; }
      if (req.method === "POST" && p === "/api/tour/plan") {
        const b = TourReq.parse(await body(req));
        if (!METROS[b.home]) { json(res, 400, { status: "error", error: `Pick a home city we know: ${Object.keys(METROS).join(", ")}` }); return true; }
        if (b.end < b.start) { json(res, 400, { status: "error", error: "The end date is before the start date." }); return true; }
        const snap = b.campaignId ? db.getCampaign(b.campaignId) : null;
        let plan = await planTour(d, b.name, { ids: b.ids }, { home: b.home, start: b.start, end: b.end, maxCities: b.maxCities, maxDriveHours: b.flyingOk ? 99 : b.maxDriveHours, flyingOk: b.flyingOk, roomSize: b.roomSize }, snap);
        plan = await aiTour(plan);
        plan.id = db.newId(6); (plan as any).campaignId = b.campaignId ?? null; db.saveTour(plan.id, b.campaignId ?? null, plan);
        json(res, 200, { status: "ok", ...plan, links: { page: `/tour/${plan.id}`, ics: `/api/tour/${plan.id}.ics`, csv: `/api/tour/${plan.id}.csv`, txt: `/api/tour/${plan.id}.txt` } });
        return true;
      }
      let k;
      if ((k = m(/^\/api\/tour\/([a-f0-9]+)(\.ics|\.csv|\.txt)?$/))) {
        const t = db.getTour(k[1]!); if (!t) { json(res, 404, { error: "no such plan" }); return true; }
        if (k[2] === ".ics") send(res, 200, toIcs(t), "text/calendar; charset=utf-8");
        else if (k[2] === ".csv") send(res, 200, toCsv(t), "text/csv; charset=utf-8");
        else if (k[2] === ".txt") send(res, 200, toText(t), "text/plain; charset=utf-8");
        else json(res, 200, t);
        return true;
      }
      if ((k = m(/^\/tour\/([a-f0-9]+)$/))) {
        const t = db.getTour(k[1]!); if (!t) { send(res, 404, "No such tour plan", "text/plain"); return true; }
        const cid: string | undefined = t.campaignId;
        html(res, tourHtml(t, { ics: `/api/tour/${t.id}.ics`, csv: `/api/tour/${t.id}.csv`, txt: `/api/tour/${t.id}.txt`, briefs: cid ? t.stops.map((s: any) => `/brief/${encodeURIComponent(cid)}/${encodeURIComponent(s.city)}`) : undefined }));
        return true;
      }
      if (req.method === "POST" && p === "/api/brief") {
        const b = z.object({ campaignId: z.string(), city: z.string(), fresh: z.boolean().optional() }).parse(await body(req));
        const t0 = Date.now(), data = await brief(b.campaignId, b.city, req, b.fresh);
        json(res, 200, { status: "ok", ms: Date.now() - t0, href: `/brief/${encodeURIComponent(b.campaignId)}/${encodeURIComponent(b.city)}`, brief: data });
        return true;
      }
      if ((k = m(/^\/brief\/([^/]+)\/([^/]+)$/))) {
        const cid = decodeURIComponent(k[1]!), city = decodeURIComponent(k[2]!);
        if (!METROS[city]) { send(res, 404, "Unknown city", "text/plain"); return true; }
        html(res, briefHtml(await brief(cid, city, req), { index: `/briefs/${encodeURIComponent(cid)}`, game: `/?resume=${encodeURIComponent(cid)}` }));
        return true;
      }
      if ((k = m(/^\/briefs\/([^/]+)$/))) {
        const cid = decodeURIComponent(k[1]!), snap = db.getCampaign(cid);
        html(res, briefIndexHtml(snap?.name ?? "Unknown campaign", db.listBriefs(cid).filter((r, i, a) => a.findIndex((x) => x.city === r.city) === i).map((r) => ({ city: r.city, created: r.created, href: `/brief/${encodeURIComponent(cid)}/${encodeURIComponent(r.city)}` })), `/?resume=${encodeURIComponent(cid)}`));
        return true;
      }
      if (req.method === "POST" && p === "/api/mail/subscribe") { const b = SubReq.parse(await body(req)); const s = db.subscribe(b.campaignId, b.email, b.firstName, b.tz || "America/Los_Angeles"); json(res, 200, { ok: true, tz: s.tz }); return true; }
      if (p === "/mail/unsubscribe") { const ok = db.unsubscribe(url.searchParams.get("t") ?? ""); html(res, `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">${ok ? "You're unsubscribed from the Monday war report." : "That link has expired or was already used."}</body>`); return true; }
      // the same war report, for the in-game welcome-back screen (relative links)
      if (p === "/api/report") {
        const cid = url.searchParams.get("campaign") ?? "", snap = db.getCampaign(cid); if (!snap) { json(res, 404, { error: "unknown campaign" }); return true; }
        const tour = db.latestTour(cid), today = new Date().toISOString().slice(0, 10);
        const next = tour?.stops?.find((s: any) => s.night && s.night >= today);
        json(res, 200, { status: "ok", changes: await changesFor(d, snap, db.campaignWeek(cid, (snap.week ?? 1) - 1)), moves: movesFor(snap, tour, "", cid),
          tour: tour ? { id: tour.id, nights: tour.totals?.nights, next: next ? { city: next.city, night: next.night, venue: next.venue?.name ?? null } : null } : null, subscribed: !!db.getSub(cid) && !db.getSub(cid)!.unsub });
        return true;
      }
      if (p === "/api/mail/preview") {
        const cid = url.searchParams.get("campaign") ?? db.listCampaigns()[0]?.id; if (!cid) { json(res, 404, { error: "no campaigns yet" }); return true; }
        const { mail } = await mailFor(cid, baseOf(req));
        if (url.searchParams.get("format") === "json") json(res, 200, mail); else html(res, mail.html);
        return true;
      }
    } catch (err: any) {
      json(res, err instanceof z.ZodError ? 400 : 500, { status: "error", error: String(err?.message ?? err).slice(0, 300) });
      return true;
    }
    return false;
  }
  return { handle, tick, mailFor, brief };
}
