import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint } from "../src/qloo/fingerprint.js";
import { findPartners } from "../src/grow/partners.js";

async function fpFor(name: string) {
  const g = new QlooGateway("mock", new Ledger(":memory:"));
  const r = await resolve(g, name, "p");
  return { g, fp: await fingerprint(g, r.entity!, "p") };
}

test("partners are ranked, scored, and self-consistent", async () => {
  const { g, fp } = await fpFor("Cedric the Entertainer");
  const partners = await findPartners(g, fp, "p", "people");
  assert.ok(partners.length >= 3, "returns several partners");
  for (const p of partners) {
    assert.ok(p.barter >= 0 && p.barter <= 100, "barter in range");
    assert.ok(Math.abs(p.netnew - (1 - p.overlap)) < 0.011, "netnew = 1 - overlap");
    assert.ok(p.convert >= 0 && p.convert <= 1);
  }
  // sorted by barter, descending
  for (let i = 1; i < partners.length; i++) {
    assert.ok(partners[i - 1]!.barter >= partners[i]!.barter, "sorted by barter");
  }
});

test("venues kind is supported", async () => {
  const { g, fp } = await fpFor("Cedric the Entertainer");
  const venues = await findPartners(g, fp, "p", "venues");
  assert.ok(venues.length >= 1);
  assert.equal(venues[0]!.kind, "venues");
});
