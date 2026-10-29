import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod/v4";

// a throwaway ledger, and no real key: nothing in this file can spend credits
process.env.CONQUEST_AI_DB = ":memory:";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CONQUEST_AI;

const { ask, write, agent, aiMode, aiStatus, setClient, spentUsd, costOf } = await import("../src/ai/llm.js");
const { strategist, writeFor } = await import("../src/ai/agents.js");

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

test("AI is off on localhost: agents answer 'off' and the game keeps its templates", async () => {
  setClient(null);
  assert.equal(aiMode(), "off");
  assert.match(aiStatus().note, /templates/);
  assert.deepEqual(await writeFor({ kind: "caption", context: { name: "X", city: "Atlanta" } }), { status: "off" });
});

test("ask: structured answer, priced into the ledger, cached on repeat", async () => {
  let calls = 0;
  setClient({ messages: { parse: async () => { calls++; return { usage, stop_reason: "end_turn", parsed_output: { ok: true } }; } } } as any);
  const S = z.object({ ok: z.boolean() });
  assert.deepEqual(await ask("t", { system: "s", user: "u", schema: S }), { ok: true });
  assert.deepEqual(await ask("t", { system: "s", user: "u", schema: S }), { ok: true });
  assert.equal(calls, 1, "second identical question comes from the cache");
  assert.ok(Math.abs(spentUsd() - costOf("claude-haiku-5-5", usage)) < 1e-9);
});

test("write: refusals throw so callers fall back", async () => {
  setClient({ messages: { create: async () => ({ usage, stop_reason: "refusal", content: [] }) } } as any);
  await assert.rejects(write("w", { system: "s", user: "refuse me" }));
});

test("agent: runs the tools Claude asks for, then returns its answer and a trace", async () => {
  let turn = 0;
  setClient({ messages: { create: async () => (++turn === 1
    ? { usage, stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "trending", input: { state: "GA" } }] }
    : { usage, stop_reason: "end_turn", content: [{ type: "text", text: '{"headline":"Play Atlanta","steps":[{"order_id":"o1","action":"Take Atlanta","why":"4.3/5 there","source":"the fan panel"}],"real_world":"Book a room in Atlanta"}' }] }) } } as any);
  let asked = "";
  const board = { name: "Cedric", week: 1, weeks: 8, conquest: 20, buzz: 8, gold: 300, hype: 3.8, cities: [], orders: [], rivals: [] };
  const r: any = await strategist(board, { audience: async () => ({}), rehearse: async () => ({}), weather: async () => ({}), fame: async () => ({}), trends: async (g) => { asked = g; return { status: "ok", items: [] }; } });
  assert.equal(r.status, "ok");
  assert.equal(asked, "US-GA");
  assert.deepEqual(r.tools, ["trending"]);
  assert.equal(r.plan.headline, "Play Atlanta");
  setClient(null);
});
