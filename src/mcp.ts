import { createInterface } from "node:readline";
import {
  audienceReport,
  rehearseReport,
  ablationReport,
  backtestReport,
  partnerReport,
  youtubeBacktestReport,
  trendsCheckReport,
  serverInfo,
} from "./service/engine.js";

/**
 * Rehearsal MCP server — "your agent can rehearse too."
 *
 * A minimal, dependency-free MCP stdio server (newline-delimited JSON-RPC 2.0).
 * Exposes the same engine the web app uses as agent tools. stdout carries ONLY
 * protocol messages; anything else goes to stderr.
 *
 * Connect from any MCP client:
 *   { "mcpServers": { "rehearsal": { "command": "npm", "args": ["run","mcp"] } } }
 */

const PROTOCOL = "2024-11-05";

const TOOLS = [
  {
    name: "fingerprint_audience",
    description:
      "Build a Qloo taste fingerprint for an audience (a show, team, podcast or person): demographics, tags, metros and top entities, with coverage and receipts.",
    inputSchema: {
      type: "object",
      properties: { audience: { type: "string", description: "Audience name" } },
      required: ["audience"],
    },
  },
  {
    name: "rehearse",
    description:
      "Run a stimulus past a 1,000-persona panel grounded in Qloo. Returns the vote, city/age/gender splits, reasons, quotes, verdict cards and a claim-checked narrative.",
    inputSchema: {
      type: "object",
      properties: { audience: { type: "string", description: "Audience name" } },
      required: ["audience"],
    },
  },
  {
    name: "compare_without_qloo",
    description:
      "Ablation: run the same stimulus through a Qloo-grounded panel and an ungrounded one. Shows how grounding creates the city/opinion variance that LLM-only panels collapse.",
    inputSchema: {
      type: "object",
      properties: { audience: { type: "string", description: "Audience name" } },
      required: ["audience"],
    },
  },
  {
    name: "backtest",
    description:
      "Return the frozen-method backtest: how well Qloo-grounded vs flat LLM-only panels track reference demographic splits (Pearson r, MAE, misses).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "find_partners",
    description:
      "Grow by barter: for an audience, rank partners (people / venues / brands) to cross-promote with. Scores each on a Goldilocks overlap — enough shared taste to convert, enough difference to bring NEW followers.",
    inputSchema: {
      type: "object",
      properties: {
        audience: { type: "string", description: "Audience name" },
        kind: { type: "string", enum: ["people", "venues", "brands"], description: "Partner kind (default people)" },
        location: { type: "string", description: "Optional metro for venues" },
      },
      required: ["audience"],
    },
  },
  {
    name: "backtest_youtube",
    description:
      "Return the real-world backtest: panel predictions sealed before fetching YouTube engagement, then scored against real likes per 1,000 views (Spearman rho, permutation p) and taste echoes in real comments.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "trends_metro_check",
    description:
      "Return the Google Trends cross-check: rank agreement between Qloo's top metros for an audience and Google Trends search interest by metro.",
    inputSchema: { type: "object", properties: {} },
  },
];

function reply(id: unknown, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function fail(id: unknown, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}
const asText = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

async function callTool(name: string, args: any) {
  switch (name) {
    case "fingerprint_audience":
      return asText(await audienceReport(String(args?.audience ?? "")));
    case "rehearse":
      return asText(await rehearseReport(String(args?.audience ?? "")));
    case "compare_without_qloo":
      return asText(await ablationReport(String(args?.audience ?? "")));
    case "backtest":
      return asText(backtestReport());
    case "find_partners":
      return asText(await partnerReport(String(args?.audience ?? ""), String(args?.kind ?? "people"), args?.location ? String(args.location) : undefined));
    case "backtest_youtube":
      return asText(await youtubeBacktestReport());
    case "trends_metro_check":
      return asText(await trendsCheckReport());
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function handle(msg: any) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "rehearsal", version: "0.1.0", ...serverInfo() },
      });
    case "ping":
      return reply(id, {});
    case "notifications/initialized":
      return; // notification, no reply
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call":
      try {
        return reply(id, await callTool(params?.name, params?.arguments));
      } catch (e: any) {
        return reply(id, { content: [{ type: "text", text: `error: ${e?.message ?? e}` }], isError: true });
      }
    default:
      if (id !== undefined) return fail(id, -32601, `method not found: ${method}`);
  }
}

process.stderr.write(`[rehearsal mcp] ready (${JSON.stringify(serverInfo())})\n`);
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let msg: any;
  try {
    msg = JSON.parse(t);
  } catch {
    return;
  }
  void handle(msg);
});
