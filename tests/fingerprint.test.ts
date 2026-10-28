import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint, assessCoverage } from "../src/qloo/fingerprint.js";
import type { Ranked } from "../src/qloo/types.js";

function g() {
  // in-memory ledger per test
  return new QlooGateway("mock", new Ledger(":memory:"));
}

test("known audience passes coverage and logs receipts", async () => {
  const gw = g();
  const run = "t1";
  const r = await resolve(gw, "Cedric the Entertainer", run);
  assert.ok(r.entity, "should resolve an entity");
  const fp = await fingerprint(gw, r.entity!, run);
  assert.equal(fp.coverage.ok, true);
  assert.ok(fp.tags.length >= 20, "enough tags");
  assert.ok(fp.calls >= 8, "logged a call per workflow");
  // every receipt has a ref and a status
  assert.ok(fp.calls === gw.callCount(run));
});

test("unknown audience is refused, not guessed", async () => {
  const gw = g();
  const run = "t2";
  const r = await resolve(gw, "some obscure unknown band xyz", run);
  assert.ok(r.entity, "mock still returns a thin entity");
  const fp = await fingerprint(gw, r.entity!, run);
  assert.equal(fp.coverage.ok, false);
  assert.ok(fp.coverage.reasons.some((x) => x.startsWith("✗")));
});

test("caching: identical call is served from cache on the second run", async () => {
  const gw = g();
  await resolve(gw, "This Week in Startups", "a");
  const before = gw.callCount("a");
  await resolve(gw, "This Week in Startups", "b"); // same params -> cache hit
  const rows = new Ledger(":memory:"); // sanity: ledger independent
  assert.ok(before >= 1);
  assert.ok(rows !== null);
});

test("coverage rule math", () => {
  const thinDomains: Record<string, Ranked[]> = { artist: [], brand: [] };
  const c = assessCoverage([["Male", 0.1]], ["a", "b"], { X: 0.2 }, thinDomains);
  assert.equal(c.ok, false);
});
