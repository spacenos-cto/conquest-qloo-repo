import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

/**
 * Conquest's own records: the latest campaign snapshot the browser syncs (so
 * briefs, tours and the Monday email work server-side), saved tour plans,
 * cached city briefs, email subscriptions and a send log. Its own sqlite file.
 */
let db: DatabaseSync | null = null;
function store(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(process.env.CONQUEST_DATA_DB || "./conquest-data.sqlite");
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, name TEXT, week INTEGER, json TEXT, updated TEXT);
    CREATE TABLE IF NOT EXISTS campaign_weeks(id TEXT, week INTEGER, json TEXT, PRIMARY KEY(id, week));
    CREATE TABLE IF NOT EXISTS tours(id TEXT PRIMARY KEY, campaign_id TEXT, json TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS briefs(key TEXT PRIMARY KEY, campaign_id TEXT, city TEXT, json TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS subs(campaign_id TEXT PRIMARY KEY, email TEXT, first_name TEXT, tz TEXT, token TEXT, unsub INTEGER DEFAULT 0, last_sent TEXT);
    CREATE TABLE IF NOT EXISTS mail_log(id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT, ts TEXT, mode TEXT, subject TEXT, status TEXT);
  `);
  return db;
}
export const newId = (n = 8) => randomBytes(n).toString("hex");
const now = () => new Date().toISOString();

export function saveCampaign(id: string, snap: any) {
  store().prepare(`INSERT OR REPLACE INTO campaigns(id,name,week,json,updated) VALUES(?,?,?,?,?)`).run(id, snap.name ?? "", snap.week ?? 1, JSON.stringify(snap), now());
  store().prepare(`INSERT OR REPLACE INTO campaign_weeks(id,week,json) VALUES(?,?,?)`).run(id, snap.week ?? 1, JSON.stringify(snap));
}
export function getCampaign(id: string): any | null {
  const r = store().prepare(`SELECT json FROM campaigns WHERE id = ?`).get(id) as { json: string } | undefined;
  return r ? JSON.parse(r.json) : null;
}
/** the snapshot from an earlier week, for "what changed" */
export function campaignWeek(id: string, week: number): any | null {
  const r = store().prepare(`SELECT json FROM campaign_weeks WHERE id = ? AND week = ?`).get(id, week) as { json: string } | undefined;
  return r ? JSON.parse(r.json) : null;
}
export function listCampaigns(): { id: string; name: string; week: number }[] {
  return store().prepare(`SELECT id, name, week FROM campaigns ORDER BY updated DESC`).all() as any;
}

export function saveTour(id: string, campaignId: string | null, plan: unknown) { store().prepare(`INSERT OR REPLACE INTO tours(id,campaign_id,json,created) VALUES(?,?,?,?)`).run(id, campaignId ?? "", JSON.stringify(plan), now()); }
export function getTour(id: string): any | null { const r = store().prepare(`SELECT json FROM tours WHERE id = ?`).get(id) as { json: string } | undefined; return r ? JSON.parse(r.json) : null; }
export function latestTour(campaignId: string): any | null { const r = store().prepare(`SELECT json FROM tours WHERE campaign_id = ? ORDER BY created DESC LIMIT 1`).get(campaignId) as { json: string } | undefined; return r ? JSON.parse(r.json) : null; }

export function getBrief(key: string): any | null { const r = store().prepare(`SELECT json FROM briefs WHERE key = ?`).get(key) as { json: string } | undefined; return r ? JSON.parse(r.json) : null; }
export function saveBrief(key: string, campaignId: string, city: string, data: unknown) { store().prepare(`INSERT OR REPLACE INTO briefs(key,campaign_id,city,json,created) VALUES(?,?,?,?,?)`).run(key, campaignId, city, JSON.stringify(data), now()); }
export function listBriefs(campaignId: string): { city: string; created: string; key: string }[] { return store().prepare(`SELECT city, created, key FROM briefs WHERE campaign_id = ? ORDER BY created DESC`).all(campaignId) as any; }

export type Sub = { campaign_id: string; email: string; first_name: string; tz: string; token: string; unsub: number; last_sent: string | null };
export function subscribe(campaignId: string, email: string, firstName: string, tz: string): Sub {
  const old = getSub(campaignId), token = old?.token ?? newId(12);
  store().prepare(`INSERT OR REPLACE INTO subs(campaign_id,email,first_name,tz,token,unsub,last_sent) VALUES(?,?,?,?,?,0,?)`).run(campaignId, email, firstName, tz, token, old?.last_sent ?? null);
  return getSub(campaignId)!;
}
export function getSub(campaignId: string): Sub | null { return (store().prepare(`SELECT * FROM subs WHERE campaign_id = ?`).get(campaignId) as Sub | undefined) ?? null; }
export function unsubscribe(token: string): boolean { return store().prepare(`UPDATE subs SET unsub = 1 WHERE token = ?`).run(token).changes > 0; }
export function activeSubs(): Sub[] { return store().prepare(`SELECT * FROM subs WHERE unsub = 0`).all() as any; }
export function markSent(campaignId: string, at: string) { store().prepare(`UPDATE subs SET last_sent = ? WHERE campaign_id = ?`).run(at, campaignId); }
export function logMail(campaignId: string, mode: string, subject: string, status: string) { store().prepare(`INSERT INTO mail_log(campaign_id,ts,mode,subject,status) VALUES(?,?,?,?,?)`).run(campaignId, now(), mode, subject, status); }
export function mailCount(): number { return (store().prepare(`SELECT COUNT(*) AS n FROM mail_log`).get() as { n: number }).n; }
