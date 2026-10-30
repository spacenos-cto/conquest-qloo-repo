import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// public/rules.js is a browser script (globals, no exports): run it in a sandbox and read its globals
const ctx: Record<string, any> = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../public/rules.js", import.meta.url), "utf8") + "\n;Object.assign(globalThis, { LEVELS, levelOf, startXp, ordersPerWeek, OBJECTIVES, objectiveOf, buildMissions, missionDone, questState, headlineFor, migrateSave });", ctx);
const R = ctx;
const plain = (x: unknown) => JSON.parse(JSON.stringify(x)); // sandbox arrays have another realm's prototype

// the board as facts, the shape questFacts() builds in app.js
const facts = (x: Record<string, any> = {}) => ({
  objective: "tour", objCity: null, held: [], rooms: {}, sponsors: 0, sponsorList: [], proven: false, allies: 0, guestSpots: 0, offered: 0, dms: [], taken: 0,
  objScouted: false, objSide: null, objRoom: false, objNight: false, sponsorPostDone: false, ...x,
});
const room = (venue: string) => ({ venue, day: "Fri, Nov 13", date: "2026-11-13", fit: 90 });

test("levels: XP thresholds, and new campaigns start 380 XP short of Theater Tour", () => {
  assert.equal(R.levelOf(0).name, "Open Mic");
  assert.equal(R.levelOf(299).roman, "I");
  assert.equal(R.levelOf(300).name, "Club Circuit");
  const start = R.levelOf(R.startXp(25));
  assert.equal(start.name, "Club Circuit");
  assert.equal(start.toNext, 380);
  assert.equal(start.next.name, "Theater Tour");
  assert.equal(R.startXp(10), 0);
  assert.equal(R.levelOf(5000).next, null);
});

test("orders per week: 3, +1 at Theater Tour, +1 with two allies, capped at 5 before bonuses", () => {
  assert.equal(R.ordersPerWeek(1, 0), 3);
  assert.equal(R.ordersPerWeek(3, 0), 4);
  assert.equal(R.ordersPerWeek(3, 2), 5);
  assert.equal(R.ordersPerWeek(5, 9), 5);
  assert.equal(R.ordersPerWeek(2, 0, 1), 4);
});

test("questState · tour: a stop is a held city with a booked room; six slots, padded", () => {
  const q = R.questState(facts({ held: ["Atlanta", "Memphis", "Nashville"], rooms: { Atlanta: room("The Punchline"), Memphis: room("Chuckles") } }));
  assert.equal(q.label, "BOOK A TOUR");
  assert.equal(q.have, 2);
  assert.equal(q.need, 6);
  assert.equal(q.slots.length, 6);
  assert.equal(q.slots[0].on, true);
  assert.equal(q.slots[2].held, true);
  assert.equal(q.slots[2].sub, "held · send Booker");
  assert.equal(q.slots[3].label, "Stop 4");
  assert.equal(q.won, false);
  const six = ["A", "B", "C", "D", "E", "F"];
  assert.equal(R.questState(facts({ held: six, rooms: Object.fromEntries(six.map((c) => [c, room(c + " Club")])) })).won, true);
});

test("questState · sponsor, city and collab objectives", () => {
  const sp = R.questState(facts({ objective: "sponsor", sponsors: 3, sponsorList: [{ name: "Cadillac", perWeek: 60 }, { name: "Audi", perWeek: 50 }, { name: "BMW", perWeek: 40 }] }));
  assert.equal(sp.have, 3);
  assert.equal(sp.won, false, "three sponsors are not enough without a 4+ rating");
  assert.equal(R.questState(facts({ objective: "sponsor", sponsors: 3, sponsorList: [{}, {}, {}], proven: true })).won, true);

  const city = R.questState(facts({ objective: "city", objCity: "Chicago", objSide: "you", objRoom: true, allies: 1 }));
  assert.equal(city.need, 4);
  assert.equal(city.have, 3);
  assert.equal(city.won, true);
  assert.equal(R.questState(facts({ objective: "city", objCity: "Chicago", objSide: "open", objRoom: true, allies: 1 })).won, false);

  const col = R.questState(facts({ objective: "collab", allies: 2, guestSpots: 1, offered: 5, dms: [{ name: "A", yes: true }, { name: "B", yes: false }] }));
  assert.equal(col.have, 3);
  assert.equal(col.slots.length, 5);
  assert.equal(col.won, true);
  assert.equal(R.questState(facts({ objective: "collab", allies: 3, offered: 4 })).won, false);
});

test("buildMissions: four per objective in two-week steps, named with real cities, each with a working done rule", () => {
  for (const o of R.OBJECTIVES) {
    const ms = R.buildMissions(o.id, { capital: "Atlanta", scoutA: "Memphis", scoutB: "Nashville", rivalCity: "Chicago", held2: "Dallas", held3: "Houston", objCity: "Denver" });
    assert.equal(ms.length, 4);
    assert.deepEqual(plain(ms.map((m: any) => m.wk)), [[1, 2], [3, 4], [5, 6], [7, 8]]);
    for (const m of ms) assert.equal(typeof R.missionDone(m.id, facts()), "boolean");
  }
  const tour = R.buildMissions("tour", { capital: "Atlanta", scoutA: "Memphis", scoutB: "Nashville", rivalCity: "Chicago" });
  assert.equal(tour[0].how, "Walls on Atlanta, Scout Memphis and Nashville.");
  assert.equal(tour[2].title, "Take Chicago");
});

test("tour missions complete in order as the board fills", () => {
  const [m1, m2, m3, m4] = R.buildMissions("tour", {}).map((m: any) => m.id);
  const f0 = facts({ held: ["A", "B"] });
  assert.equal(R.missionDone(m1, f0), false);
  const f1 = facts({ held: ["A", "B", "C"], rooms: { A: room("x"), B: room("y"), C: room("z") } });
  assert.equal(R.missionDone(m1, f1), true);
  assert.equal(R.missionDone(m2, f1), true);
  assert.equal(R.missionDone(m3, f1), false);
  assert.equal(R.missionDone(m3, facts({ taken: 1 })), true);
  assert.equal(R.missionDone(m4, f1), false);
});

test("headlineFor: the first matching template wins, names are real", () => {
  const all = { you: "Cedric", battle: { won: true, kind: "take", city: "Chicago", rival: "Anderson" }, held: { city: "Atlanta", rival: "Anderson", ripe: "Chicago" }, lost: { city: "Dallas", rival: "King" }, stop: { city: "Nashville", n: 3, m: 6 }, sponsor: { brand: "Cadillac", gold: 60 }, levelUp: "Theater Tour", topFact: "fans love Cadillac" };
  assert.equal(R.headlineFor(all), "Cedric takes Chicago as Anderson's crowd thins");
  assert.equal(R.headlineFor({ ...all, giant: true }), "Cedric, giant slayer, takes Chicago from Anderson");
  assert.equal(R.headlineFor({ ...all, battle: null }), "Cedric holds Atlanta as Anderson's raid fizzles; Chicago now ripe");
  assert.equal(R.headlineFor({ ...all, battle: null, held: null }), "King takes Dallas; Cedric's tour loses a stop");
  assert.equal(R.headlineFor({ you: "Cedric", stop: all.stop, sponsor: all.sponsor }), "Nashville booked: Cedric's tour hits 3 of 6 stops");
  assert.equal(R.headlineFor({ you: "Cedric", sponsor: all.sponsor, levelUp: "Theater Tour" }), "Cadillac backs Cedric for 60/week");
  assert.equal(R.headlineFor({ you: "Cedric", levelUp: "Theater Tour" }), "Cedric graduates to Theater Tour");
  assert.equal(R.headlineFor({ you: "Cedric", topFact: "your Chicago fans love Harold's" }), "Quiet week: your Chicago fans love Harold's");
  assert.equal(R.headlineFor({ you: "Cedric", battle: { won: false, kind: "take", city: "Chicago", rival: "Anderson" } }), "Quiet week: your army held its posts");
});

test("save migration: a v1 save comes back as v2 on the tour objective, XP from conquest, no clock", () => {
  const v1 = { v: 1, name: "Cedric", week: 3, hour: 101.5, buzz: 7, conquest: 34, missions: 5, real: [], cities: [] };
  const v2 = R.migrateSave(v1);
  assert.equal(v2.v, 2);
  assert.equal(v2.objective, "tour");
  assert.equal(v2.xp, 340);
  assert.equal(v2.ordersLeft, 3);
  assert.deepEqual(plain(v2.orderQueue), []);
  assert.equal(v2.runs, 5, "the old agent-run counter survives the rename");
  assert.equal(v2.missions, null);
  assert.equal("hour" in v2, false);
  assert.equal("buzz" in v2, false);
  assert.equal(v2.week, 3);
  const again = { ...v2 };
  assert.equal(R.migrateSave(again), again, "v2 saves pass through");
  assert.equal(R.migrateSave({ v: 9 }), null);
  assert.equal(R.migrateSave(null), null);
});

test("save migration: the twelve agents fold into five, keeping the best XP and one order per unit", () => {
  const v2 = { v: 2, week: 4, unitXp: [["scout", 40], ["spy", 130], ["oracle", 30], ["booker", 20], ["listener", 99]], crew: [["scout", { recruited: true }], ["spy", { recruited: true }], ["herald", { recruited: true }]],
    army: [{ id: "scout" }, { id: "spy" }, { id: "showrunner" }], orderQueue: [{ unitId: "spy", city: "Atlanta" }, { unitId: "scout", city: "Memphis" }, { unitId: "herald", city: "Chicago" }, { unitId: "you", city: "Dallas" }] };
  const m = R.migrateSave(v2);
  assert.deepEqual(plain(m.unitXp).sort(), [["booker", 30], ["scout", 130]]);
  assert.deepEqual(plain(m.crew.map(([id]: [string]) => id)), ["scout"]);
  assert.deepEqual(plain(m.army.map((u: any) => u.id)), ["scout"]);
  assert.deepEqual(plain(m.orderQueue.map((q: any) => `${q.unitId}:${q.city}`)), ["scout:Atlanta", "diplomat:Chicago", "you:Dallas"]);
  const v1 = R.migrateSave({ v: 1, conquest: 10, missions: 2, crew: [["trend", {}], ["scout", {}]], army: [{ id: "trend" }], real: [] });
  assert.deepEqual(plain(v1.crew.map(([id]: [string]) => id)), ["scout"], "v1 saves (no unit XP yet) drop the merged units too");
  assert.deepEqual(plain(v1.army), []);
});
