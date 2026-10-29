import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief, NO_SIGNAL } from "../src/conquest/brief.js";
import { briefHtml } from "../src/conquest/pages.js";
import { changesFor, movesFor, renderMail, isMondayEight } from "../src/conquest/mail.js";

const camp = { status: "ok", receipts: [{ ref: "E4", workflow: "where_popular" }], territory: { cities: [{ name: "Denver", you: 1240, state: "rival", owner: "r1", rivals: [{ name: "Bert Kreischer" }] }] }, rivals: [{ id: "r1", name: "Bert Kreischer" }] };
const deps = {
  campaign: async () => camp,
  venuesIn: async () => ({ status: "ok", venues: [{ name: "Comedy Works", fit: 88, tags: ["Comedy club"], address: "1226 15th St, Denver", phone: "+13035955969", website: "https://comedyworks.com" }, { name: "Paramount Theatre", fit: 80 }], receipts: [] }),
  lovedIn: async (_n: string, _w: any, _c: string, t: string) => ({ status: "ok", items: t === "person" ? [{ name: "Local Comic", affinity: 70 }] : [{ name: `Top ${t}`, affinity: t === "brand" ? 91 : 80 }], receipts: [] }),
  trends: async () => ({ status: "ok", items: [{ title: "Broncos" }] }),
  weather: async () => ({ status: "ok", days: [{ date: "2026-11-06", rain: 30 }, { date: "2026-11-07", rain: 5 }] }),
  fame: async () => ({ status: "ok", people: [{ name: "Bert Kreischer", views: 90000, momentum: 12 }] }),
};

test("City Brief: every section filled from its source, in order, with sources in the footer", async () => {
  const b = await buildBrief(deps, { name: "Cedric the Entertainer", city: "Denver" });
  assert.equal(b.fans, 1240);
  assert.equal(b.rooms[0]!.name, "Comedy Works");
  assert.equal(b.rooms[0]!.bucket, "50–150");
  assert.equal(b.also.length, 5);
  assert.equal(b.allies.length, 2);
  assert.ok(b.sponsor?.subject.includes("Top brand"));
  assert.match(b.timing!, /Saturday, Nov 7: 5%/);
  assert.match(b.watch!, /Bert Kreischer holds Denver and is up 12%/);
  assert.equal(b.moves.length, 3);
  const html = briefHtml(b);
  const order = ["What they also love", "Rooms", "Allies", "Sponsor", "Timing", "Watch out", "Three moves", "Sources:"].map((h) => html.indexOf(h));
  assert.deepEqual([...order].sort((x, y) => x - y), order, "sections in the fixed order");
  assert.ok(!html.includes(NO_SIGNAL));
});

test("City Brief: an empty section says so, never fakes content", async () => {
  const empty = { ...deps, venuesIn: async () => ({ status: "ok", venues: [], receipts: [] }), lovedIn: async () => ({ status: "ok", items: [], receipts: [] }), weather: async () => null as any };
  const html = briefHtml(await buildBrief(empty, { name: "Cedric the Entertainer", city: "Denver" }));
  assert.ok((html.match(new RegExp(NO_SIGNAL.replace(/[.—]/g, "."), "g")) ?? []).length >= 4);
});

test("Monday email: what changed, three linked moves, unsubscribe, under 200 words", async () => {
  const snap = { name: "Cedric the Entertainer", week: 4, capital: "Chicago", tags: ["broncos"], conquest: 31,
    cities: [{ name: "Chicago", side: "you" }, { name: "Atlanta", side: "you" }], intents: [{ fid: "r1", city: "Denver" }], sieges: [], rivals: [{ id: "r1", name: "Bert Kreischer" }],
    orders: [{ id: "o1", title: "Win back Chicago", city: "Chicago", cost: 3, gain: 21, done: false }, { id: "o2", title: "Sharpen the material", cost: 2, gain: 2, done: false }], real: [] };
  const prev = { ...snap, conquest: 27, cities: [{ name: "Chicago", side: "you" }] };
  const tour = { id: "abc", totals: { nights: 6 }, stops: [{ city: "Dallas", night: "2099-11-02", venue: { name: "Hyena's" } }] };
  const changes = await changesFor(deps, snap, prev);
  assert.match(changes[0]!, /Bert Kreischer is moving on Denver/);
  assert.ok(changes.some((c) => /You won Atlanta/.test(c)));
  const moves = movesFor(snap, tour, "http://x", "cid1");
  assert.equal(moves.length, 3);
  assert.match(moves[0]!.href, /\/brief\/cid1\/Dallas#rooms$/);
  const m = renderMail({ firstName: "Cedric", snap, changes, moves, tour, base: "http://x", cid: "cid1", unsub: "http://x/mail/unsubscribe?t=tok" });
  assert.equal(m.subject, "Cedric, 3 moves for this week · 2 cities held");
  assert.match(m.text, /Unsubscribe: http:\/\/x\/mail\/unsubscribe\?t=tok/);
  assert.match(m.text, /Your tour: 6 nights, next stop Dallas/);
  assert.ok(m.text.split(/\s+/).length < 200, `${m.text.split(/\s+/).length} words`);
});

test("Monday email: a quiet week says so", () => {
  const m = renderMail({ firstName: "Cedric", snap: { week: 4, cities: [] }, changes: [], moves: [], tour: null, base: "http://x", cid: "c", unsub: "u" });
  assert.ok(m.quiet); assert.match(m.subject, /quiet week · tap to end week 4/);
});

test("Monday 8 am is checked in the subscriber's own time zone", () => {
  assert.equal(isMondayEight("America/Los_Angeles", new Date("2026-11-02T16:30:00Z")).yes, true); // 08:30 PST
  assert.equal(isMondayEight("America/New_York", new Date("2026-11-02T16:30:00Z")).yes, false); // 11:30 EST
});

// snapshots: the rendered brief and email for one fixture, with timestamps normalised.
// Delete tests/__snapshots__/*.snap to accept an intended change.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[:\d.]*Z?/g, "<ts>").replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/g, "<ts>").replace(/[A-Z][a-z]{2} \d{1,2}, \d{4}/g, "<date>");
function snapshot(name: string, value: string) {
  const dir = new URL("./__snapshots__/", import.meta.url), file = new URL(`${name}.snap`, dir);
  if (!existsSync(dir)) mkdirSync(dir);
  if (!existsSync(file)) { writeFileSync(file, norm(value)); return; }
  assert.equal(norm(value), readFileSync(file, "utf8"));
}
test("snapshot: Denver brief HTML", async () => snapshot("brief-denver", briefHtml(await buildBrief(deps, { name: "Cedric the Entertainer", city: "Denver" }))));
test("snapshot: Monday email", () => {
  const snap = { name: "Cedric", week: 4, cities: [{ name: "Chicago", side: "you" }] };
  snapshot("mail-week4", renderMail({ firstName: "Cedric", snap, changes: ["Bert Kreischer is moving on Denver, arriving Sunday"], moves: [{ text: "Win back Chicago", href: "http://x/brief/c/Chicago#moves" }], tour: null, base: "http://x", cid: "c", unsub: "http://x/mail/unsubscribe?t=t" }).html);
});
