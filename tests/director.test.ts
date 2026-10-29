import { test } from "node:test";
import assert from "node:assert/strict";
import { directorReport } from "../src/service/engine.js";

test("director runs the loop and returns a traced plan", async () => {
  const d: any = await directorReport("Cedric the Entertainer");
  assert.equal(d.status, "ok");
  // a visible agent trace: each step names the tool it called
  assert.ok(d.steps.length >= 4, "runs at least four steps");
  assert.ok(d.steps.every((s: any) => s.tool && s.observed), "each step names a tool and an observation");
  assert.ok(d.steps.some((s: any) => s.tool === "find_partners"), "acts by finding a growth lever");
  // a ranked plan with both levers
  assert.ok(d.plan.length >= 2, "returns a plan");
  assert.ok(d.plan.some((p: any) => p.lever === "grow"), "includes a growth move");
  assert.ok(d.plan.every((p: any) => p.receipt), "every recommendation cites a receipt");
});
