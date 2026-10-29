import { test } from "node:test";
import assert from "node:assert/strict";
import { METROS, miles } from "../src/conquest/geo.js";
import { scoreCities, route, pathMiles, twoOpt, legs, assignNights, buildPlan, toCsv, toIcs, bucketOf, type Candidate } from "../src/conquest/tour.js";
import { planTour } from "../src/conquest/plan.js";

const cand = (city: string, fans: number, fit = 80, extra: Partial<Candidate> = {}): Candidate => ({
  city, geo: METROS[city]!, fans, venues: fit ? [{ name: `${city} Comedy Club`, fit, bucket: "50–150" }, { name: `${city} Theater`, fit: fit - 10, bucket: "150–400" }] : [],
  trend: 0.2, trendNote: "nothing trending", wx: null, rival: "open", receipts: [{ source: "Qloo", ref: "E1", at: "t" }], ...extra,
});

test("scoring: fans weigh most, a rival-held city scores lower, unknown weather counts as average", () => {
  const [big, small, rival] = scoreCities([cand("Chicago", 2000), cand("Denver", 50), cand("Dallas", 2000, 80, { rival: "held_by_rival" })], "2026-11-01", "2026-11-30");
  assert.ok(big!.score > small!.score);
  assert.ok(big!.score > rival!.score);
  assert.equal(big!.parts.weather, 7.5);
});

test("2-opt never makes the route longer, and fixes a crossed path", () => {
  const home = METROS["Austin"]!;
  const stops = ["Houston", "Atlanta", "Dallas", "Nashville"].map((c) => ({ geo: METROS[c]! }));
  const crossed = [1, 2, 3, 0], fixed = twoOpt(home, stops, crossed);
  assert.ok(pathMiles(home, stops, fixed) <= pathMiles(home, stops, crossed));
  const r = route(home, stops);
  assert.deepEqual([...r].sort(), [0, 1, 2, 3]);
});

test("drive cap: any leg over the cap is marked fly", () => {
  const home = { city: "Los Angeles", geo: METROS["Los Angeles"]! };
  const lg = legs(home, [{ city: "Las Vegas", geo: METROS["Las Vegas"]! }, { city: "Miami", geo: METROS["Miami"]! }], 5);
  assert.equal(lg[0]!.mode, "drive");
  assert.equal(lg[1]!.mode, "fly");
  for (const l of lg) assert.ok(l.mode === "fly" || l.hours <= 5);
});

test("nights land on Thu/Fri/Sat, in order, inside the window", () => {
  const stops = [{ wx: null }, { wx: null }, { wx: null }];
  const lg = [{ from: "a", to: "b", miles: 100, hours: 2, mode: "drive" as const }, { from: "b", to: "c", miles: 300, hours: 5.5, mode: "drive" as const }, { from: "c", to: "d", miles: 100, hours: 2, mode: "drive" as const }];
  const nights = assignNights(stops, lg, "2026-11-02", "2026-11-30"); // a Monday
  for (const n of nights) assert.ok([4, 5, 6].includes(new Date(n + "T12:00:00Z").getUTCDay()), `${n} is Thu-Sat`);
  assert.ok(nights[0]! < nights[1]! && nights[1]! < nights[2]!);
});

test("nights pick the driest Thu-Sat when the forecast says so", () => {
  const wx = [{ date: "2026-11-05", rain: 80 }, { date: "2026-11-06", rain: 70 }, { date: "2026-11-07", rain: 5 }];
  const [n] = assignNights([{ wx }], [{ from: "a", to: "b", miles: 50, hours: 1, mode: "drive" }], "2026-11-02", "2026-11-30");
  assert.equal(n, "2026-11-07");
});

test("room size guess and CSV / ICS output", () => {
  assert.equal(bucketOf("The Comedy Store"), "50–150");
  assert.equal(bucketOf("Fox Theatre"), "150–400");
  const plan = buildPlan({ home: "Chicago", start: "2026-11-02", end: "2026-11-30", maxCities: 3 }, [cand("Detroit", 900), cand("St. Louis", 700), cand("Minneapolis", 500), cand("Denver", 10)]) as any;
  plan.id = "t1";
  assert.equal(plan.stops.length, 3);
  const csv = toCsv(plan);
  assert.match(csv.split("\r\n")[0]!, /^#,City,State,Night,Venue,Backup,Fit %/);
  assert.equal(csv.trim().split("\r\n").length, 4);
  const ics = toIcs(plan);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;TZID=America\/(Chicago|Detroit|New_York):\d{8}T200000/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, plan.totals.nights);
});

test("planTour gathers data through its deps, with receipts on every stop", async () => {
  const deps = {
    campaign: async () => ({ status: "ok", receipts: [{ ref: "E4", workflow: "where_popular" }], territory: { cities: ["Chicago", "Detroit", "Atlanta", "Houston", "Dallas", "Denver"].map((n, i) => ({ name: n, you: 1000 - i * 100, state: "frontline", owner: "you" })) }, rivals: [] }),
    venuesIn: async (_: string, __: any, city: string) => ({ status: "ok", venues: [{ name: `${city} Improv`, fit: 77 }], receipts: [{ ref: "E1", workflow: "recommend", cached: true }] }),
    trends: async () => ({ status: "ok", items: [{ title: "Cedric live" }] }),
    weather: async () => ({ status: "ok", days: [] }),
  };
  const p = await planTour(deps, "Cedric the Entertainer", {}, { home: "Chicago", start: "2026-11-02", end: "2026-12-15", maxCities: 4 });
  assert.equal(p.stops.length, 4);
  for (const s of p.stops) { assert.ok(s.venue && s.night && s.fit != null); assert.ok(s.receipts.some((r) => r.ref === "E4")); assert.ok(s.receipts.some((r) => r.ref === "E1")); }
  assert.ok(miles(METROS["Chicago"]!, METROS["Detroit"]!) > 200);
});
