import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DatabaseSync } from "node:sqlite";
import type { z } from "zod/v4";
import { hash, stable } from "../ledger/ledger.js";

/**
 * The AI layer. One switch decides whether Conquest's agents think with Claude
 * or fall back to the deterministic templates the game has always had:
 *
 *   CONQUEST_AI=claude + ANTHROPIC_API_KEY  -> Claude (hosted builds)
 *   anything else                           -> off: templates, no cost (localhost)
 *
 * Every answer is cached in sqlite (same question, same answer, no second
 * charge) and every call's tokens are priced into a spend ledger. Once the
 * ledger reaches AI_BUDGET_USD the layer switches itself off and callers fall
 * back to templates, so a $20 credit can't be overrun by a busy demo day.
 */

export const AI_MODEL = process.env.CONQUEST_AI_MODEL || "claude-haiku-5-5";
export const AI_BUDGET_USD = Number(process.env.AI_BUDGET_USD ?? 15);

// $ per million tokens (Anthropic first-party list prices)
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export class AiOff extends Error {}

type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

let db: DatabaseSync | null = null;
function store(): DatabaseSync {
  if (db) return db;
  // its own file, so the spend ledger survives restarts even when the Qloo cache is in memory
  db = new DatabaseSync(process.env.CONQUEST_AI_DB || "./conquest-ai.sqlite");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_cache(key TEXT PRIMARY KEY, json TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS ai_spend(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, model TEXT,
      input INTEGER, output INTEGER, cache_read INTEGER, usd REAL);
  `);
  return db;
}

export function spentUsd(): number {
  const r = store().prepare(`SELECT COALESCE(SUM(usd),0) AS s FROM ai_spend`).get() as { s: number };
  return r.s;
}

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  return ((u.input_tokens ?? 0) * p.in + (u.output_tokens ?? 0) * p.out + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

function record(kind: string, model: string, u: Usage) {
  store().prepare(`INSERT INTO ai_spend(ts,kind,model,input,output,cache_read,usd) VALUES(?,?,?,?,?,?,?)`)
    .run(new Date().toISOString(), kind, model, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, costOf(model, u));
}

/** Tests swap in a fake client; real runs build one from the environment. */
let client: Anthropic | null = null;
export function setClient(c: Anthropic | null) { client = c; }
function api(): Anthropic { return client ?? (client = new Anthropic()); }

export function aiMode(): "claude" | "off" {
  if (client) return "claude"; // a test client is installed
  if (process.env.CONQUEST_AI !== "claude" || !process.env.ANTHROPIC_API_KEY) return "off";
  return spentUsd() >= AI_BUDGET_USD ? "off" : "claude";
}

export function aiStatus() {
  const mode = aiMode();
  return { mode, model: mode === "claude" ? AI_MODEL : null, spentUsd: Math.round(spentUsd() * 10000) / 10000, capUsd: AI_BUDGET_USD,
    note: mode === "claude" ? `Agents think with ${AI_MODEL}` : process.env.CONQUEST_AI === "claude" && process.env.ANTHROPIC_API_KEY ? "Budget reached: agents use templates" : "AI off (local): agents use templates" };
}

function guard() { if (aiMode() !== "claude") throw new AiOff("AI is off"); }

function cached<T>(key: string): T | null {
  const r = store().prepare(`SELECT json FROM ai_cache WHERE key = ?`).get(key) as { json: string } | undefined;
  return r ? (JSON.parse(r.json) as T) : null;
}
function remember(key: string, v: unknown) {
  store().prepare(`INSERT OR REPLACE INTO ai_cache(key,json,created_at) VALUES(?,?,?)`).run(key, JSON.stringify(v), new Date().toISOString());
}

/**
 * One structured answer. The schema both shapes the output (structured
 * outputs) and validates it; a refusal or a parse miss throws, and callers
 * fall back to their template.
 */
export async function ask<S extends z.ZodType>(kind: string, o: { system: string; user: string; schema: S; maxTokens?: number; effort?: "low" | "medium" | "high" }): Promise<z.infer<S>> {
  const key = "ask:" + hash(stable({ kind, model: AI_MODEL, system: o.system, user: o.user }));
  const hit = cached<z.infer<S>>(key); if (hit) return hit;
  guard();
  const res = await api().messages.parse({
    model: AI_MODEL,
    max_tokens: o.maxTokens ?? 4000,
    system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: o.user }],
    output_config: { effort: o.effort ?? "low", format: zodOutputFormat(o.schema) },
  });
  record(kind, AI_MODEL, res.usage);
  if (res.stop_reason === "refusal" || res.parsed_output == null) throw new Error(`no answer (${res.stop_reason})`);
  remember(key, res.parsed_output);
  return res.parsed_output as z.infer<S>;
}

/** Plain text (a caption, a DM, a pitch). */
export async function write(kind: string, o: { system: string; user: string; maxTokens?: number }): Promise<string> {
  const key = "write:" + hash(stable({ kind, model: AI_MODEL, system: o.system, user: o.user }));
  const hit = cached<string>(key); if (hit) return hit;
  guard();
  const res = await api().messages.create({
    model: AI_MODEL,
    max_tokens: o.maxTokens ?? 2000,
    system: o.system,
    messages: [{ role: "user", content: o.user }],
    output_config: { effort: "low" },
  });
  record(kind, AI_MODEL, res.usage);
  if (res.stop_reason === "refusal") throw new Error("refused");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!text) throw new Error("empty");
  remember(key, text);
  return text;
}

export type ToolDef = { name: string; description: string; input_schema: Anthropic.Tool["input_schema"]; run: (input: any) => Promise<unknown> };

/**
 * A real agent loop: Claude decides which tools to call (Qloo, trends,
 * weather, the fan panel), reads the results, and keeps going until it can
 * answer. Returns the final text plus a trace of every tool it used.
 */
export async function agent(kind: string, o: { system: string; user: string; tools: ToolDef[]; maxTurns?: number; cacheKey?: unknown }) {
  const key = "agent:" + hash(stable({ kind, model: AI_MODEL, system: o.system, user: o.user, k: o.cacheKey ?? null }));
  const hit = cached<{ text: string; trace: { tool: string; input: unknown }[] }>(key); if (hit) return { ...hit, cached: true };
  guard();
  const tools: Anthropic.Tool[] = o.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: o.user }];
  const trace: { tool: string; input: unknown }[] = [];
  for (let turn = 0; turn < (o.maxTurns ?? 6); turn++) {
    guard(); // re-check the budget every turn
    const res = await api().messages.create({
      model: AI_MODEL, max_tokens: 6000, system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      tools, messages, output_config: { effort: "low" },
    });
    record(kind, AI_MODEL, res.usage);
    if (res.stop_reason === "refusal") throw new Error("refused");
    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) {
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      const out = { text, trace };
      remember(key, out);
      return { ...out, cached: false };
    }
    // run every call from this turn, send all results back in one message
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(calls.map(async (c) => {
      trace.push({ tool: c.name, input: c.input });
      const t = o.tools.find((x) => x.name === c.name);
      try { return { type: "tool_result" as const, tool_use_id: c.id, content: JSON.stringify(t ? await t.run(c.input) : { error: "unknown tool" }).slice(0, 6000) }; }
      catch (e) { return { type: "tool_result" as const, tool_use_id: c.id, content: String(e), is_error: true }; }
    }));
    messages.push({ role: "user", content: results });
  }
  throw new Error("agent ran out of turns");
}
