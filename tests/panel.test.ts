import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint } from "../src/qloo/fingerprint.js";
import { samplePanel } from "../src/panel/sampler.js";
import { runPanel } from "../src/panel/respondent.js";
import { aggregate, citySplit } from "../src/panel/aggregate.js";
import { checkClaims } from "../src/panel/claimcheck.js";
import { DEMO_STIMULI } from "../src/panel/stimuli.js";
import type { Fingerprint } from "../src/qloo/types.js";

async function cedricFingerprint(): Promise<Fingerprint> {
  const gw = new QlooGateway("mock", new Ledger(":memory:"));
  const r = await resolve(gw, "Cedric the Entertainer", "f");
  return fingerprint(gw, r.entity!, "f");
}

test("sampler produces N personas, each with tastes and receipts", async () => {
  const fp = await cedricFingerprint();
  const { personas, composition } = samplePanel(fp, 1000, 42);
  assert.equal(personas.length, 1000);
  assert.equal(composition.reduce((a, c) => a + c.n, 0), 1000);
  for (const p of personas.slice(0, 50)) {
    assert.ok(p.tastes.length >= 6, "each persona carries several tastes");
    assert.ok(p.tastes.every((t) => /^E\d+$/.test(t.ref)), "every taste has a ledger receipt");
  }
});

test("sampler is deterministic for a fixed seed", async () => {
  const fp = await cedricFingerprint();
  const a = samplePanel(fp, 200, 99).personas.map((p) => `${p.metro}|${p.age}|${p.gender}`);
  const b = samplePanel(fp, 200, 99).personas.map((p) => `${p.metro}|${p.age}|${p.gender}`);
  assert.deepEqual(a, b);
});

test("no single metro dominates the whole panel", async () => {
  const fp = await cedricFingerprint();
  const { personas } = samplePanel(fp, 1000, 42);
  const counts = new Map<string, number>();
  for (const p of personas) counts.set(p.metro, (counts.get(p.metro) ?? 0) + 1);
  const top = Math.max(...counts.values());
  assert.ok(top <= 450, `top metro should not swamp the panel (was ${top})`);
  assert.ok(counts.size >= 8, "several metros represented");
});

test("the church bit splits by city, Atlanta on top", async () => {
  const fp = await cedricFingerprint();
  const { personas } = samplePanel(fp, 1000, 42);
  const replies = await runPanel(personas, DEMO_STIMULI.cedric!, "mock", 7);
  const agg = aggregate(personas, replies);
  const split = citySplit(agg); // best vs worst among well-sampled metros
  assert.ok(split, "a split exists");
  assert.equal(split!.top.metro, "Atlanta", "highest-affinity, highest-lift city tops the split");
  assert.ok(split!.top.mean > split!.bottom.mean, "there is a real spread");
});

test("narrative numbers are all backed; a tampered one is struck", async () => {
  const facts = { score: 3.8, pct45: 61, n: 1000 };
  const good = checkClaims("The panel scored this 3.8 out of 5, with 61% rating it 4 or higher.", facts);
  assert.equal(good.struck.length, 0);
  const bad = checkClaims("The panel scored this 4.9 out of 5.", facts);
  assert.equal(bad.struck.length, 1);
});
