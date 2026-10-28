import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint } from "../src/qloo/fingerprint.js";
import { dmaToMetro, parseTrendsCsv, compareMetros } from "../src/proof/trends.js";

// Synthetic CSV in the Google Trends export layout — not real Trends data.
const CSV = `Category: All categories

DMA,Cedric the Entertainer: (10/29/25 - 10/29/26)
Atlanta GA,100
Chicago IL,93
Houston TX,85
Dallas-Ft. Worth TX,80
Memphis TN,82
Washington DC (Hagerstown MD),70
Detroit MI,71
Charlotte NC,60
Seattle-Tacoma WA,<1
Boise ID,
`;

async function cedric() {
  const gw = new QlooGateway("mock", new Ledger(":memory:"));
  return fingerprint(gw, (await resolve(gw, "Cedric the Entertainer", "t")).entity!, "t");
}

test("DMA names map to plain metro names", () => {
  assert.equal(dmaToMetro("Dallas-Ft. Worth TX"), "Dallas");
  assert.equal(dmaToMetro("Washington DC (Hagerstown MD)"), "Washington");
  assert.equal(dmaToMetro("Raleigh-Durham (Fayetteville) NC"), "Raleigh");
  assert.equal(dmaToMetro("St. Louis MO"), "St. Louis");
  assert.equal(dmaToMetro("Boston MA (Manchester NH)"), "Boston");
});

test("parses the export: term, window, <1 and blanks", () => {
  const t = parseTrendsCsv(CSV);
  assert.equal(t.term, "Cedric the Entertainer");
  assert.equal(t.window, "10/29/25 - 10/29/26");
  assert.equal(t.rows.length, 9, "blank value row is skipped");
  assert.equal(t.rows.find((r) => r.metro === "Seattle")!.value, 0.5);
});

test("agreeing metros score high; thin files are refused", async () => {
  const fp = await cedric();
  const c = compareMetros(fp, CSV);
  assert.equal(c.testable, true);
  assert.ok(c.rho! > 0.7, "this fixture follows Qloo's order closely");
  assert.equal(c.overlapTop5, 5);
  const thin = compareMetros(fp, "DMA,x: (a - b)\nAtlanta GA,100\nChicago IL,90\n");
  assert.equal(thin.testable, false);
});
