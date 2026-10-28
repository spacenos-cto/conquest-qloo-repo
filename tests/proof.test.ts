import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint } from "../src/qloo/fingerprint.js";
import { ablation } from "../src/proof/ablation.js";
import { runBacktest } from "../src/proof/backtest.js";
import { DEMO_STIMULI } from "../src/panel/stimuli.js";

test("ablation: grounded disagrees, ungrounded collapses", async () => {
  const gw = new QlooGateway("mock", new Ledger(":memory:"));
  const r = await resolve(gw, "Cedric the Entertainer", "a");
  const fp = await fingerprint(gw, r.entity!, "a");
  const ab = await ablation(fp, DEMO_STIMULI.cedric!);
  assert.ok(
    ab.grounded.metroVariance > ab.ungrounded.metroVariance * 3,
    "grounded panel varies across cities far more than ungrounded",
  );
  assert.ok(ab.grounded.distinctReasons > ab.ungrounded.distinctReasons);
});

test("backtest: grounded tracks reality better than flat LLM-only", () => {
  const bt = runBacktest();
  assert.ok(bt.isSample, "flagged as sample, not real YouGov");
  assert.ok(bt.rGrounded > bt.rLLM, "grounded correlation beats flat");
  assert.ok(bt.maeGrounded < bt.maeLLM, "grounded error is lower");
  assert.ok(bt.misses.length > 0, "misses are reported, not hidden");
});

test("backtest is deterministic for a fixed seed", () => {
  assert.equal(runBacktest(2026).rGrounded, runBacktest(2026).rGrounded);
});
