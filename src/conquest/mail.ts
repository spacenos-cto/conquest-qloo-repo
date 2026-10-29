import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { METROS } from "./geo.js";

/**
 * "Your 3 moves this week": the Monday 8 am email. Built from the campaign
 * snapshot the browser syncs, last week's snapshot (what changed), the latest
 * Tour Plan and live Google Trends. Sends through Resend when MAIL_API_KEY is
 * set; otherwise writes the email to out/mail/ so it works on localhost.
 */
export type MailDeps = { trends: (geo: string) => Promise<any> };
export type Mail = { subject: string; text: string; html: string; quiet: boolean };

const e = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** what changed since last week, biggest first */
export async function changesFor(d: MailDeps, snap: any, prev: any | null): Promise<string[]> {
  const out: { t: string; w: number }[] = [];
  const rival = (id: string) => snap.rivals?.find((r: any) => r.id === id)?.name ?? "A rival";
  for (const s of snap.sieges ?? []) out.push({ t: `${rival(s.fid)} is besieging ${s.city}: it falls in ${s.left} week${s.left > 1 ? "s" : ""}`, w: 10 });
  for (const i of snap.intents ?? []) out.push({ t: `${rival(i.fid)} is moving on ${i.city}, arriving Sunday`, w: 8 });
  if (prev) {
    const held = (x: any) => (x.cities ?? []).filter((c: any) => c.side === "you").map((c: any) => c.name);
    const now = new Set(held(snap)), before = new Set(held(prev));
    for (const c of now) if (!before.has(c)) out.push({ t: `You won ${c}`, w: 7 });
    for (const c of before) if (!now.has(c)) out.push({ t: `You lost ${c}`, w: 9 });
    if ((snap.conquest ?? 0) !== (prev.conquest ?? 0)) out.push({ t: `Your share of fans went from ${prev.conquest}% to ${snap.conquest}%`, w: 5 });
  }
  const home = METROS[snap.capital ?? ""];
  if (home) {
    const tr = await d.trends(`US-${home.state}`).catch(() => null);
    const tags: string[] = (snap.tags ?? []).map((t: string) => t.toLowerCase());
    const hit = (tr?.items ?? []).find((x: any) => tags.some((t) => t.length > 3 && x.title.toLowerCase().includes(t))) ?? (tr?.items ?? [])[0];
    if (hit) out.push({ t: `“${hit.title}” is trending in ${home.state} this week (Google Trends)`, w: 3 });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.t);
}

/** the strategist's top 3 (rules path), each linked to the asset that does it */
export function movesFor(snap: any, tour: any | null, base: string, cid: string): { text: string; href: string }[] {
  const brief = (city: string, anchor = "") => `${base}/brief/${encodeURIComponent(cid)}/${encodeURIComponent(city)}${anchor}`;
  const moves: { text: string; href: string; w: number }[] = [];
  for (const s of snap.sieges ?? []) moves.push({ text: `Defend ${s.city}: post to your fans there this week`, href: brief(s.city, "#moves"), w: 10 });
  const next = tour?.stops?.find((s: any) => s.night && s.night >= new Date().toISOString().slice(0, 10));
  if (next?.venue) moves.push({ text: `Email ${next.venue.name} about ${nice(next.night)}`, href: brief(next.city, "#rooms"), w: 9 });
  const open = (snap.orders ?? []).filter((o: any) => !o.done).sort((a: any, b: any) => b.gain / Math.max(1, b.cost) - a.gain / Math.max(1, a.cost));
  for (const o of open) moves.push({ text: o.title, href: o.city ? brief(o.city, "#moves") : `${base}/?resume=${encodeURIComponent(cid)}`, w: 5 + (o.gain ?? 0) / 20 });
  for (const m of (snap.real ?? []).filter((m: any) => !m.done)) moves.push({ text: m.text, href: m.city ? brief(m.city, "#moves") : `${base}/?resume=${encodeURIComponent(cid)}`, w: 4 });
  if (tour?.id && next) moves.push({ text: `Put the tour nights on your calendar`, href: `${base}/api/tour/${tour.id}.ics`, w: 3 });
  const seen = new Set<string>();
  return moves.sort((a, b) => b.w - a.w).filter((m) => !seen.has(m.text) && seen.add(m.text)).slice(0, 3).map(({ text, href }) => ({ text, href }));
}

export function renderMail(o: { firstName: string; snap: any; changes: string[]; moves: { text: string; href: string }[]; tour: any | null; base: string; cid: string; unsub: string }): Mail {
  const held = (o.snap.cities ?? []).filter((c: any) => c.side === "you").length, link = `${o.base}/?resume=${encodeURIComponent(o.cid)}`;
  const next = o.tour?.stops?.find((s: any) => s.night && s.night >= new Date().toISOString().slice(0, 10));
  const tourLine = o.tour && next ? `Your tour: ${o.tour.totals.nights} nights, next stop ${next.city} on ${nice(next.night)} → ${o.base}/tour/${o.tour.id}` : "";
  const quiet = !o.changes.length && !o.moves.length;
  const subject = quiet ? `${o.firstName}, quiet week · tap to end week ${o.snap.week}` : `${o.firstName}, 3 moves for this week · ${held} cities held`;
  const lines = quiet
    ? [`Hi ${o.firstName},`, "", `Quiet week: nothing changed and no moves are waiting. Tap to end week ${o.snap.week} and see what your rivals do.`, "", `Open your map → ${link}`]
    : [`Hi ${o.firstName},`, "", `Week ${o.snap.week} of your Conquest. Here's what changed and what to do.`, "",
      ...(o.changes.length ? ["WHAT CHANGED", ...o.changes.map((c) => `• ${c}`), ""] : []),
      "YOUR 3 MOVES", ...o.moves.map((m, i) => `${i + 1}. ${m.text} → ${m.href}`), "",
      ...(tourLine ? [tourLine, ""] : []), `Open your map → ${link}`];
  const text = [...lines, "", "— Conquest", `Unsubscribe: ${o.unsub}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2f7;font:15px/1.5 -apple-system,Segoe UI,Inter,Arial,sans-serif;color:#16131d">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:28px 30px">
<p style="margin:0 0 4px;font:700 11px Arial,sans-serif;letter-spacing:.14em;color:#7b2cff">CONQUEST · MONDAY WAR REPORT</p>
<p>Hi ${e(o.firstName)},</p>
${quiet ? `<p>Quiet week: nothing changed and no moves are waiting.</p><p><a href="${e(link)}" style="color:#7b2cff">Tap to end week ${o.snap.week}</a> and see what your rivals do.</p>`
    : `<p>Week ${o.snap.week} of your Conquest. Here's what changed and what to do.</p>
${o.changes.length ? `<p style="margin:18px 0 4px;font:700 11px Arial;letter-spacing:.12em;color:#5d5868">WHAT CHANGED</p><ul style="margin:0;padding-left:18px">${o.changes.map((c) => `<li>${e(c)}</li>`).join("")}</ul>` : ""}
<p style="margin:18px 0 4px;font:700 11px Arial;letter-spacing:.12em;color:#5d5868">YOUR 3 MOVES</p>
<ol style="margin:0;padding-left:20px">${o.moves.map((m) => `<li style="margin:4px 0">${e(m.text)} → <a href="${e(m.href)}" style="color:#7b2cff">do it</a></li>`).join("")}</ol>
${tourLine ? `<p style="margin-top:16px">Your tour: ${o.tour.totals.nights} nights, next stop ${e(next.city)} on ${e(nice(next.night))} → <a href="${e(`${o.base}/tour/${o.tour.id}`)}" style="color:#7b2cff">view plan</a></p>` : ""}`}
<p style="margin-top:20px"><a href="${e(link)}" style="display:inline-block;background:#7b2cff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open your map</a></p>
<p style="color:#5d5868">— Conquest</p>
<p style="font-size:12px;color:#8a8494"><a href="${e(o.unsub)}" style="color:#8a8494">Unsubscribe</a></p></div></body></html>`;
  return { subject, text, html, quiet };
}

/** Send through Resend if MAIL_API_KEY is set; otherwise write to out/mail/. */
export async function deliver(to: string, m: Mail, name: string): Promise<{ mode: "sent" | "file"; where: string }> {
  const key = process.env.MAIL_API_KEY;
  if (key && to) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "Conquest <onboarding@resend.dev>", to: [to], subject: m.subject, text: m.text, html: m.html }), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`mail provider ${r.status}`);
    return { mode: "sent", where: to };
  }
  const dir = join(process.cwd(), "out", "mail"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.html`); writeFileSync(file, m.html); writeFileSync(file.replace(/\.html$/, ".txt"), `Subject: ${m.subject}\n\n${m.text}`);
  return { mode: "file", where: file };
}

/** Is it Monday 08:xx in this time zone right now? */
export function isMondayEight(tz: string, at = new Date()): { yes: boolean; localDate: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((p) => [p.type, p.value]));
  return { yes: parts.weekday === "Mon" && Number(parts.hour) === 8, localDate: `${parts.year}-${parts.month}-${parts.day}` };
}
