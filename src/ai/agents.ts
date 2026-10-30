import { z } from "zod/v4";
import { agent, ask, write, aiMode, AI_MODEL, type ToolDef } from "./llm.js";

/**
 * Conquest's thinking agents. Each one reads real data (Qloo through the
 * engine, Google Trends, Open-Meteo, Wikipedia, the fan panel) and decides or
 * writes something a performer can act on today. With the AI layer off they
 * return { status: "off" } and the game keeps its deterministic templates.
 */

export type Deps = {
  audience: (name: string, who: { ids?: string }) => Promise<any>;
  rehearse: (name: string, who: { ids?: string; text?: string }) => Promise<any>;
  trends: (geo: string) => Promise<any>;
  weather: (lat: number, lon: number) => Promise<any>;
  fame: (names: string[]) => Promise<any>;
};

// The board as the browser sees it; kept small so every turn stays cheap.
const City = z.object({ name: z.string(), side: z.string(), you: z.number().optional(), mean: z.number().nullable().optional(), worth: z.number().optional(), state: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(), prepared: z.boolean().optional(), walls: z.boolean().optional() });
export const Board = z.object({
  name: z.string(), ids: z.string().optional(),
  week: z.number(), weeks: z.number(), conquest: z.number(), goal: z.string().optional(), buzz: z.number(), gold: z.number(), hype: z.number(),
  capital: z.string().optional(),
  cities: z.array(City).max(30),
  orders: z.array(z.object({ id: z.string(), title: z.string(), kind: z.string(), city: z.string().nullable().optional(), cost: z.number(), gain: z.number() })).max(12),
  rivals: z.array(z.object({ name: z.string(), role: z.string(), momentum: z.number().nullable().optional(), attacking: z.string().nullable().optional(), besieging: z.string().nullable().optional() })).max(6),
  agents: z.array(z.string()).max(12).optional(),
});
export type Board = z.infer<typeof Board>;

const Plan = z.object({
  headline: z.string().describe("the best move this week, one sentence, under 140 characters, addressed to the performer"),
  steps: z.array(z.object({
    order_id: z.string().describe("id of the matching order from the board, or empty if none"),
    action: z.string().describe("what to do, imperative, under 70 characters"),
    why: z.string().describe("the data behind it, under 120 characters, citing the numbers you saw"),
    source: z.string().describe("where the data came from: Qloo, Google Trends, Open-Meteo, Wikipedia, or the fan panel"),
  })).describe("2 or 3 steps, best first"),
  real_world: z.string().describe("the one thing to do outside the game this week, under 140 characters"),
});

const SYSTEM = `You are the AI strategist inside Conquest, a strategy game whose every move is a real growth move for a performer (comedian, creator, musician). The map is the performer's real audience by US city, from Qloo's taste graph. Rivals are real performers the same fans follow.

Read the board, use your tools to check what you need (taste data, trends, weather, rivals' fame, how fans react to a line), then pick the best plan for this week. Prefer moves the board can execute (orders by id) and cite real numbers from tools. Be concrete and brief. Never invent data you did not see.

When you are done, reply with only a JSON object: {"headline": string, "steps": [{"order_id": string, "action": string, "why": string, "source": string}], "real_world": string}.`;

export async function strategist(board: Board, d: Deps) {
  if (aiMode() !== "claude") return { status: "off" };
  const who = { ids: board.ids };
  const cityOf = (n: string) => board.cities.find((c) => c.name.toLowerCase() === n.toLowerCase());
  let tested = 0;
  const tools: ToolDef[] = [
    { name: "audience_taste", description: "Qloo: who the performer's fans are (age, gender over-index), their top taste tags, top cities, and the brands, podcasts and artists they love.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => { const a = await d.audience(board.name, who); return a?.status === "ok" ? { demographics: a.demographics, tags: (a.tags ?? []).slice(0, 12), cities: (a.metros ?? a.cities ?? []).slice?.(0, 10), domains: Object.fromEntries(Object.entries(a.domains ?? {}).map(([k, v]: any) => [k, (v ?? []).slice(0, 5).map((x: any) => ({ name: x.name, affinity: x.affinity }))])) } : { status: a?.status ?? "unavailable" }; } },
    { name: "trending", description: "Google Trends: what is trending right now in a US state (two-letter code) or nationally ('US').",
      input_schema: { type: "object", properties: { state: { type: "string", description: "two-letter state code, or US" } }, required: ["state"], additionalProperties: false },
      run: async ({ state }) => d.trends(state && state !== "US" ? `US-${String(state).toUpperCase()}` : "US") },
    { name: "show_weather", description: "Open-Meteo: the 7-day forecast for a city on the board (to pick a dry show night).",
      input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
      run: async ({ city }) => { const c = cityOf(city); return c?.lat != null && c?.lon != null ? d.weather(c.lat, c.lon) : { error: "city not on the board" }; } },
    { name: "rival_fame", description: "Wikipedia pageviews over 30 days and momentum vs the 30 before, for the performer and named rivals.",
      input_schema: { type: "object", properties: { names: { type: "array", items: { type: "string" }, maxItems: 5 } }, required: ["names"], additionalProperties: false },
      run: async ({ names }) => d.fame([board.name, ...(names ?? [])].slice(0, 6)) },
    { name: "test_line", description: "Play a short line or post to the performer's 1,000 simulated fans (built from Qloo). Returns the mean score out of 5, % who love it, and the best and worst city. At most twice per plan.",
      input_schema: { type: "object", properties: { text: { type: "string", maxLength: 400 } }, required: ["text"], additionalProperties: false },
      run: async ({ text }) => { if (++tested > 2) return { error: "test limit reached" }; const r = await d.rehearse(board.name, { ...who, text }); return r?.status === "ok" ? { mean: r.aggregate.mean, love: r.aggregate.pct45, best: r.split?.top, worst: r.split?.bottom } : { status: r?.status }; } },
  ];
  const r = await agent("strategist", { system: SYSTEM, user: `The board:\n${JSON.stringify(board)}`, tools, maxTurns: 6, cacheKey: board });
  let plan: z.infer<typeof Plan> | null = null;
  try { plan = Plan.parse(JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1))); } catch { /* fall back to plain text */ }
  if (!plan) plan = { headline: r.text.slice(0, 200), steps: [], real_world: "" };
  return { status: "ok", model: AI_MODEL, cached: r.cached, tools: r.trace.map((t) => t.tool), plan };
}

// --- writers: the agents that produce something you can send today ---
const VOICE = "Write as the performer, in first person, warm and specific, no hashtags spam, no emojis beyond one. Never invent facts beyond what you are given.";
const WRITERS: Record<string, { system: string; build: (c: any) => string; max: number }> = {
  caption: { max: 600, system: `You are the Copywriter agent in Conquest. ${VOICE} Write one social post (under 260 characters) aimed at fans in one city.`,
    build: (c) => `Performer: ${c.name}\nCity: ${c.city}\nWhat these fans love (Qloo): ${(c.tastes ?? []).join(", ")}\n${c.trend ? `Trending there now (Google Trends): ${c.trend}\n` : ""}${c.night ? `Show night: ${c.night}\n` : ""}Return only the post.` },
  pitch: { max: 900, system: `You are the Diplomat agent in Conquest. ${VOICE} Write a short DM (under 600 characters) proposing a collaboration to another performer.`,
    build: (c) => `From: ${c.name}\nTo: ${c.partner}\nOffer: ${c.offer}${c.city ? ` in ${c.city}` : ""}\nData (Qloo taste overlap): ${c.netnew}% of their crowd would be new to me; ${c.convert}% of my fans already over-index on them.\nReturn only the DM.` },
  sponsor: { max: 1000, system: `You are the Sponsor scout agent in Conquest. ${VOICE} Write a short sponsorship pitch email (subject line, then under 700 characters of body) to a brand.`,
    build: (c) => `Performer: ${c.name}\nBrand: ${c.brand}\nData (Qloo): my fans' taste neighbours show ${c.affinity}% affinity for ${c.brand}. Audience: ${c.audience}.\nReturn "Subject: ..." on the first line, then the body.` },
  headline: { max: 120, system: "You are the Herald in Conquest. Rewrite one weekly headline for a strategy game played on a performer's real audience. Keep every proper noun exactly as given. Under 90 characters, newspaper style, no quotes, no emoji. Never invent facts.",
    build: (c) => `Headline: ${c.headline}
What happened this week: ${c.facts}
Return only the new headline.` },
};
export const WriteReq = z.object({ kind: z.enum(["caption", "pitch", "sponsor", "headline"]), context: z.record(z.string(), z.any()) });

export async function writeFor(req: z.infer<typeof WriteReq>) {
  if (aiMode() !== "claude") return { status: "off" };
  const w = WRITERS[req.kind]!;
  const text = await write(req.kind, { system: w.system, user: w.build(req.context), maxTokens: w.max * 2 });
  return { status: "ok", model: AI_MODEL, text };
}

// X-ray advice: the panel's numbers in, one concrete change out
const Advice = z.object({ change: z.string().describe("the single most useful change, under 160 characters"), why: z.string().describe("the evidence, under 140 characters") });
export async function adviseVideo(v: { channel: string; title: string; description?: string; mean: number; avg: number; love: number; top?: string | null; bottom?: string | null; dips: number }) {
  if (aiMode() !== "claude") return { status: "off" };
  const r = await ask("xray", { system: "You are the Content X-ray agent in Conquest. Given how a performer's simulated fans (built from Qloo data) reacted to one of their real videos, give one concrete, specific change for the next video like it. Use only the numbers given.", user: JSON.stringify(v), schema: Advice, maxTokens: 1500 });
  return { status: "ok", model: AI_MODEL, ...r };
}
