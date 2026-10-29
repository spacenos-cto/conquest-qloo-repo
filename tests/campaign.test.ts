import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTerritory, planMissions, projected } from "../src/grow/campaign.js";
import { campaignReport } from "../src/service/engine.js";
import type { Fingerprint, Aggregate } from "../src/qloo/types.js";

const fp = {
  metros: { Atlanta: 1, Chicago: 0.9, "Los Angeles": 0.7, Memphis: 0.3, Seattle: 0.2, Boston: 0.05 },
} as unknown as Fingerprint;
const agg = {
  mean: 3.8,
  byMetro: [
    { metro: "Atlanta", mean: 4.4, n: 200 },
    { metro: "Chicago", mean: 4.0, n: 180 },
    { metro: "Los Angeles", mean: 3.2, n: 120 },
    { metro: "Memphis", mean: 4.3, n: 30 },
    { metro: "Seattle", mean: 2.9, n: 12 },
    { metro: "Boston", mean: 4.9, n: 2 },
  ],
} as unknown as Aggregate;

test("cities get the right states", () => {
  const t = buildTerritory(fp, agg);
  const s = Object.fromEntries(t.cities.map((c) => [c.name, c.state]));
  assert.equal(s.Atlanta, "stronghold");
  assert.equal(s.Chicago, "stronghold");
  assert.equal(s["Los Angeles"], "frontline");
  assert.equal(s.Memphis, "beachhead");
  assert.equal(s.Seattle, "hard");
  assert.equal(s.Boston, "uncharted", "too few people to read honestly");
});

test("conquest % is the share of scouted ground held, and the target is the best beachhead", () => {
  const t = buildTerritory(fp, agg);
  // held = 1 + 0.9 ; scouted = 1 + 0.9 + 0.7 + 0.3 + 0.2
  assert.equal(t.conquest, Math.round((1.9 / 3.1) * 100));
  assert.equal(t.target?.name, "Memphis");
  assert.equal(t.capital?.name, "Atlanta");
});

test("missions cite data and projected conquest never passes 100", () => {
  const t = buildTerritory(fp, agg);
  const tribe = { deadZones: [{ start: 8, end: 12 }] } as any;
  const ally = { name: "Ally", convert: 0.9, netnew: 0.8 } as any;
  const venue = { name: "The Room" } as any;
  const ms = planMissions(t, tribe, [ally], [venue]);
  assert.deepEqual(ms.map((m) => m.id), ["sharpen", "ally", "take", "hold"]);
  assert.ok(ms.every((m) => m.receipt && m.gain > 0));
  assert.ok(ms.find((m) => m.id === "take")!.detail.includes("The Room"));
  assert.ok(projected(t, ms) <= 100 && projected(t, ms) > t.conquest);
});

test("a rival with a bigger footprint owns the city; a close one makes it contested", () => {
  const you = { Atlanta: 1000, Chicago: 900, "Los Angeles": 700, Memphis: 300, Seattle: 200, Boston: 50 };
  const rival = { id: "r1", name: "Rival", counts: { "Los Angeles": 900, Chicago: 800 } };
  const t = buildTerritory(fp, agg, { you, rivals: [rival] });
  const la = t.cities.find((c) => c.name === "Los Angeles")!;
  const chi = t.cities.find((c) => c.name === "Chicago")!;
  assert.equal(la.state, "rival");
  assert.equal(la.owner, "r1");
  assert.equal(chi.owner, "you");
  assert.equal(chi.contested, "Rival", "within 80% of your footprint");
  assert.ok(t.rivalHeld.some((c) => c.name === "Los Angeles"));
});

test("rivals get an ally-or-compete call and a mission", async () => {
  const { rivalPlans } = await import("../src/grow/campaign.js");
  const you = { Atlanta: 1000, Chicago: 900, "Los Angeles": 700 };
  const t = buildTerritory(fp, agg, { you, rivals: [{ id: "r1", name: "Friend", counts: { "Los Angeles": 900 } }, { id: "r2", name: "Foe", counts: { Chicago: 950 } }] });
  const plans = rivalPlans(t, [
    { id: "r1", name: "Friend", barter: 45, overlap: 0.2, netnew: 0.8, convert: 0.9 } as any,
    { id: "r2", name: "Foe", barter: 10, overlap: 0.7, netnew: 0.3, convert: 0.9 } as any,
  ]);
  assert.equal(plans[0]!.strategy, "ally");
  assert.equal(plans[0]!.city, "Los Angeles");
  assert.equal(plans[1]!.strategy, "compete");
  const ms = planMissions(t, { deadZones: [] } as any, [], [], plans);
  assert.ok(ms.some((m) => m.kind === "alliance" && m.city === "Los Angeles"));
  assert.ok(ms.some((m) => m.kind === "rivalry" && m.city === "Chicago"));
});

test("campaign report runs end to end in mock mode", async () => {
  const c: any = await campaignReport("Cedric the Entertainer");
  assert.equal(c.status, "ok");
  assert.ok(c.territory.cities.length > 0);
  assert.ok(c.missions.length >= 2);
  assert.ok(c.steps.every((s: any) => s.tool && s.observed));
});
