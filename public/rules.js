"use strict";
// Conquest v2 rules: pure functions, no DOM, no network. app.js reads these as
// globals; tests/rules.test.ts loads this file in a vm and checks them.

// ---------------------------------------------------------------- levels (XP, not conquest %)
const LEVELS = [[0, "I", "Open Mic"], [300, "II", "Club Circuit"], [800, "III", "Theater Tour"], [1600, "IV", "Arena Headliner"], [3000, "V", "Legend"]];
function levelOf(xp) {
  let i = 0; for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k][0]) i = k;
  const [at, roman, name] = LEVELS[i], nx = LEVELS[i + 1] ?? null;
  return { n: i + 1, roman, name, at, next: nx ? { at: nx[0], roman: nx[1], name: nx[2] } : null, toNext: nx ? nx[0] - xp : 0, frac: nx ? (xp - at) / (nx[0] - at) : 1 };
}
// new campaigns start at Club Circuit, 380 XP short of Theater Tour, when the map is already a fifth yours
const startXp = (conquest) => (conquest >= 20 ? 420 : 0);

// ---------------------------------------------------------------- orders replace buzz
// 3 a week, +1 at Theater Tour, +1 with two allies, max 5; a claimed offer or a post adds one for one week
function ordersPerWeek(level, allies, bonus = 0) { return Math.min(5, 3 + (level >= 3 ? 1 : 0) + (allies >= 2 ? 1 : 0)) + Math.max(0, bonus); }

// ---------------------------------------------------------------- the four objectives
const OBJECTIVES = [
  { id: "tour", tag: "TOUR", col: "#f0c46a", title: "Book a tour", quest: "BOOK A TOUR", blurb: "6 nights in the cities where your fans already are, in a route you can drive.", get: "rooms, nights, calendar, venue emails",
    army: (x) => `Scout to find the cities, Booker to land the rooms, Weather oracle for the nights, Diplomat for an opener in each. Spy keeps ${x.nem ?? "your nemesis"} off your dates.`,
    win: "6 held cities each with a booked room by week 8. Lose a city to a rival and that stop goes with it.", rule: "each held city with a booked room = a stop" },
  { id: "sponsor", tag: "GOLD", col: "#3dff9a", title: "Land sponsors", quest: "LAND SPONSORS", blurb: "Brands your fans over-index on, with a pitch written for each.", get: "3 sponsor pitches + weekly gold",
    army: () => "Sponsor scout in every held city, Room reader to prove the audience, Copywriter for the sponsored post.",
    win: "3 sponsors signed (gold per week) and one sponsored post that your fans rated 4+.", rule: "3 sponsors signed + a 4+ fan rating" },
  { id: "city", tag: "NEW", col: "#38d8ff", title: "Break into a new city", quest: "BREAK INTO A NEW CITY", blurb: "Pick a city you've never played and make it yours.", get: "a room, a local ally, a podcast slot there",
    army: () => "Scout lifts the fog, Herald finds the podcast, Diplomat finds the local act, Booker lands the room, then the battle.",
    win: "The chosen city flips to your colour and has a booked room and an ally.", rule: "held + a room + an ally or guest spot + a night" },
  { id: "collab", tag: "ALLY", col: "#ff9d5c", title: "Fill my calendar", quest: "FILL MY CALENDAR", blurb: "Guest spots, collabs and co-headlines with acts whose fans would like you.", get: "5 DMs ready to send + a podcast list",
    army: () => "Diplomat and Herald do the work; Spy tells you who's rising so you ask at the right time.",
    win: "5 deals offered, 3 accepted, each a real DM you sent.", rule: "5 offered · 3 accepted" },
];
const objectiveOf = (id) => OBJECTIVES.find((o) => o.id === id) ?? OBJECTIVES[0];

// ---------------------------------------------------------------- missions: four per objective, one per two weeks
// x = { capital, scoutA, scoutB, rivalCity, held2, held3, objCity }: real city names from the board
function buildMissions(objective, x = {}) {
  const c = (k, d) => x[k] ?? d;
  const M = {
    tour: [["t1", "Hold your home ground", `Walls on ${c("capital", "your capital")}, Scout ${c("scoutA", "a new city")} and ${c("scoutB", "another")}.`, "3 cities held"],
      ["t2", "Land three rooms", "Send Booker to each held city.", "3 stops booked"],
      ["t3", `Take ${c("rivalCity", "a rival city")}`, "Room reader first (odds up), then strike.", "a rival city flips to you"],
      ["t4", "Close the route", "Fill stops 5 and 6, export the calendar.", "6 of 6 booked"]],
    sponsor: [["s1", "Find your first brand", `Sponsor scout to ${c("capital", "your capital")}.`, "1 sponsor paying"],
      ["s2", "Prove the crowd", "Room reader tests your sponsor read.", "a 4+ rating"],
      ["s3", "Stack two more", `Sponsor scout to ${c("held2", "a held city")}, ${c("held3", "another")}.`, "3 sponsors"],
      ["s4", "Post it", "Copywriter drafts, you post for real.", "ticked as done"]],
    city: [["c1", "Pick and scout it", `Scout to ${c("objCity", "the city")}; see what they love.`, "fog lifted"],
      ["c2", "Get a local voice", "Herald + Diplomat there.", "an ally or a guest spot"],
      ["c3", "Win the crowd", "Room reader, then strike.", "city is yours"],
      ["c4", "Book it", "Booker lands the room.", "a date on the calendar"]],
    collab: [["k1", "Map your allies", "Diplomat to 2 cities.", "2 partners found"],
      ["k2", "First deal", "Parley with the best fit.", "DEAL"],
      ["k3", "Podcast run", "Herald to 3 cities.", "3 guest spots"],
      ["k4", "Send them", "Tick each DM as sent for real.", "3 accepted"]],
  };
  const WK = [[1, 2], [3, 4], [5, 6], [7, 8]];
  return (M[objective] ?? M.tour).map(([id, title, how, done], i) => ({ id, wk: WK[i], title, how, done, complete: false, late: false }));
}
// f = the board as facts (questFacts() in app.js): every mission's "done when", in code
const MISSION_DONE = {
  t1: (f) => f.held.length >= 3, t2: (f) => bookedStops(f) >= 3, t3: (f) => f.taken >= 1, t4: (f) => bookedStops(f) >= 6,
  s1: (f) => f.sponsors >= 1, s2: (f) => !!f.proven, s3: (f) => f.sponsors >= 3, s4: (f) => !!f.sponsorPostDone,
  c1: (f) => !!f.objScouted, c2: (f) => f.allies + f.guestSpots >= 1, c3: (f) => f.objSide === "you", c4: (f) => !!f.objRoom,
  k1: (f) => f.offered >= 2, k2: (f) => f.allies >= 1, k3: (f) => f.guestSpots >= 3, k4: (f) => f.allies + f.guestSpots >= 3,
};
const missionDone = (id, f) => !!MISSION_DONE[id]?.(f);

// ---------------------------------------------------------------- the quest bar, derived every render
const bookedStops = (f) => f.held.slice(0, 6).filter((n) => f.rooms[n]?.venue).length;
function questState(f) {
  const o = objectiveOf(f.objective);
  if (o.id === "sponsor") {
    const slots = [0, 1, 2].map((i) => (f.sponsorList[i] ? { label: f.sponsorList[i].name, sub: `+${f.sponsorList[i].perWeek}/wk`, on: true } : { label: `Sponsor ${i + 1}`, on: false }));
    return { label: o.quest, have: Math.min(3, f.sponsors), need: 3, unit: "sponsors", rule: o.rule, slots, won: f.sponsors >= 3 && !!f.proven };
  }
  if (o.id === "city") {
    const n = f.objCity ?? "Pick a city", parts = [["Held", f.objSide === "you"], ["Room", !!f.objRoom], ["Ally / guest", f.allies + f.guestSpots >= 1], ["Night", !!f.objNight]];
    const slots = parts.map(([label, on]) => ({ label, sub: on ? n : "—", on }));
    const have = parts.filter((p) => p[1]).length;
    return { label: o.quest, have, need: 4, unit: `parts of ${n}`, rule: o.rule, slots, won: f.objSide === "you" && !!f.objRoom && f.allies + f.guestSpots >= 1 };
  }
  if (o.id === "collab") {
    const acc = f.allies + f.guestSpots;
    const slots = [0, 1, 2, 3, 4].map((i) => (f.dms[i] ? { label: f.dms[i].name, sub: f.dms[i].yes ? "accepted" : "DM drafted", on: !!f.dms[i].yes, held: !f.dms[i].yes } : { label: `DM ${i + 1}`, on: false }));
    return { label: o.quest, have: Math.min(3, acc), need: 3, unit: "accepted", rule: o.rule, slots, won: f.offered >= 5 && acc >= 3 };
  }
  const slots = [0, 1, 2, 3, 4, 5].map((i) => {
    const n = f.held[i]; if (!n) return { label: `Stop ${i + 1}`, on: false };
    const r = f.rooms[n]; return r?.venue ? { city: n, label: n, sub: `${r.venue}${r.day ? " · " + r.day : ""}`, on: true } : { city: n, label: n, sub: "held · send Booker", on: false, held: true };
  });
  const have = bookedStops(f);
  return { label: o.quest, have, need: 6, unit: "stops", rule: o.rule, slots, won: have >= 6 };
}

// ---------------------------------------------------------------- the weekly headline: first match wins, names are real
function headlineFor(r) {
  const y = r.you ?? "You", b = r.battle;
  if (b?.won && b.kind === "take") return `${y} takes ${b.city} as ${b.rival}'s crowd thins`;
  if (r.held) return `${y} holds ${r.held.city} as ${r.held.rival}'s raid fizzles${r.held.ripe ? `; ${r.held.ripe} now ripe` : ""}`;
  if (r.lost) return `${r.lost.rival} takes ${r.lost.city}; ${y}'s tour loses a stop`;
  if (r.stop) return `${r.stop.city} booked: ${y}'s tour hits ${r.stop.n} of ${r.stop.m} stops`;
  if (r.sponsor) return `${r.sponsor.brand} backs ${y} for ${r.sponsor.gold}/week`;
  if (r.levelUp) return `${y} graduates to ${r.levelUp}`;
  return `Quiet week: ${r.topFact ?? "your army held its posts"}`;
}

// ---------------------------------------------------------------- saves: v1 → v2
function migrateSave(s) {
  if (!s || (s.v !== 1 && s.v !== 2)) return null;
  if (s.v === 2) return s;
  const m = { ...s, v: 2, objective: "tour", objCity: null, runs: typeof s.missions === "number" ? s.missions : 0, missions: null, ordersLeft: 3, orderQueue: [], xp: Math.round((s.conquest ?? 0) * 10), unitXp: [], report: null, headline: "", venues: [] };
  delete m.hour; delete m.buzz;
  return m;
}
