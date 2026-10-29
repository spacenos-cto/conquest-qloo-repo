import { Ledger } from "../ledger/ledger.js";
import { QlooGateway, type Mode } from "../qloo/gateway.js";
import { resolve } from "../qloo/resolve.js";
import { fingerprint } from "../qloo/fingerprint.js";
import { samplePanel } from "../panel/sampler.js";
import { runPanel, type RespondentMode } from "../panel/respondent.js";
import { aiMode } from "../ai/llm.js";
import { aggregate, citySplit } from "../panel/aggregate.js";
import { checkClaims } from "../panel/claimcheck.js";
import { makeVerdicts } from "../panel/verdict.js";
import { pickStimulus, neutralStimulus } from "../panel/stimuli.js";
import { findPartners } from "../grow/partners.js";
import { buildTerritory, planMissions, projected, rivalPlans } from "../grow/campaign.js";
import { tribeStrip } from "../tribe/strip.js";
import { ablation } from "../proof/ablation.js";
import { runBacktest } from "../proof/backtest.js";
import { loadResult } from "../proof/youtube/run.js";
import { METHOD as YT_METHOD } from "../proof/youtube/backtest.js";
import { loadTrendsChecks } from "../proof/trends.js";
import type { Fingerprint } from "../qloo/types.js";
import { METROS } from "../conquest/geo.js";

/**
 * The service facade the HTTP API and the MCP server call. One gateway/ledger
 * for the process (cache shared across requests); each request gets its own
 * runId so receipts stay separate. Fingerprints + panels are memoised by name.
 */

const mode = (process.env.QLOO_MODE as Mode) || "mock";
// live when the AI layer is on (hosted), mock on localhost; the env var still forces either
const respModeOf = (): RespondentMode => (process.env.REHEARSAL_RESPONDENT_MODE as RespondentMode) || (aiMode() === "claude" ? "live" : "mock");
const ledger = new Ledger(process.env.REHEARSAL_DB || ":memory:");
const gateway = new QlooGateway(mode, ledger);

const PANEL_N = Number(process.env.REHEARSAL_PANEL_N || 1000);
const fpCache = new Map<string, { fp: Fingerprint; runId: string }>();

export function serverInfo() {
  return { qlooMode: mode, respondentMode: respModeOf(), panelN: PANEL_N };
}

/**
 * Who we're conquering for. A known performer resolves by name; a creator Qloo
 * doesn't know passes `ids`: one to three Qloo entities their audience is like,
 * and Qloo blends those audiences into one fingerprint. `text` is custom
 * material to battle-test instead of the demo bit.
 */
export interface Who {
  ids?: string;
  text?: string;
}

async function fingerprintFor(name: string, who: Who = {}) {
  const key = (name + "|" + (who.ids ?? "")).toLowerCase();
  const hit = fpCache.get(key);
  if (hit) return hit;
  const runId = "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  let entity;
  if (who.ids) entity = { id: who.ids, name, type: "urn:entity:person" };
  else {
    const r = await resolve(gateway, name, runId);
    if (r.candidates?.length) return { candidates: r.candidates, runId };
    if (!r.entity) return { empty: true, runId };
    entity = r.entity;
  }
  const fp = await fingerprint(gateway, entity, runId);
  const entry = { fp, runId };
  if (fp.coverage.ok) fpCache.set(key, entry); // a thin read may be a Qloo blip: try again next time
  return entry;
}

function stimulusFor(fp: Fingerprint, who: Who) {
  if (!who.text?.trim()) return pickStimulus(fp.audience);
  // custom material: it plays to whichever of the audience's tastes it names
  const text = who.text.trim();
  // real titles rarely name a tag verbatim, so match on word stems, against
  // the audience's tags and the artists, shows and brands it loves
  const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ing|ers|er|es|s)$/, "").slice(0, 6);
  const words = new Set(text.split(/\W+/).filter((w) => w.length >= 4).map(stem));
  const hits = (t: string) => { const toks = t.split(/\W+/).filter((w) => w.length >= 4).map(stem); return toks.length ? toks.filter((x) => words.has(x)).length / toks.length : 0; };
  const pool = [...fp.tags, ...Object.values(fp.domains ?? {}).flat().map((e) => e.name)];
  const appeals = [...new Set(pool)].map((t) => [t, hits(t)] as const).filter(([, s]) => s >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  return { ...neutralStimulus(text), label: "Your material", appeals };
}

/** "Who are you?" — real candidates from Qloo with photo, bio and social handles. */
// how alike two names are, 0..1 (edit distance, case-insensitive)
function nameSim(a: string, b: string): number {
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  const d = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= y.length; j++) { const t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = t; }
  }
  return 1 - d[y.length]! / Math.max(x.length, y.length);
}
const PERFORMER = /person|artist|podcast|tv_show|brand/;

/**
 * Who-are-you search. Qloo's search matches prefixes, not typos, so when no
 * result is close to what was typed we also search shorter forms of the
 * longest word ("calacanus" -> "calacan"). Results are ranked by how close
 * the name is, then popularity, preferring people, artists, shows and teams
 * over albums and places. The top pick comes back as didYouMean when it
 * isn't what was typed.
 */
export async function profileReport(name: string) {
  const runId = "profile_" + Date.now();
  const env = await gateway.call("profile", { name }, runId);
  if (env.status !== "ok") return { status: env.status, candidates: [] };
  const seen = new Map<string, any>();
  const add = (list: any[] = []) => { for (const c of list) if (c?.entity_id && !seen.has(c.entity_id)) seen.set(c.entity_id, c); };
  add(env.results as any[]);
  if (Math.max(0, ...[...seen.values()].map((c) => nameSim(name, c.name))) < 0.9) {
    const words = name.trim().split(/\s+/), i = words.reduce((b, w, k) => (w.length > words[b]!.length ? k : b), 0), w = words[i]!;
    const forms = w.length >= 5 ? [w.length - 2, w.length - 3].map((n) => words.map((x, k) => (k === i ? w.slice(0, n) : x)).join(" ")) : [];
    for (const f of forms) { const e = await gateway.call("profile", { name: f }, runId); if (e.status === "ok") add(e.results as any[]); }
  }
  const score = (c: any) => {
    const s = nameSim(name, c.name), perf = PERFORMER.test(String(c.type));
    return (perf || s >= 0.95 ? 0 : -1) + 0.55 * s + 0.25 * (Number(c.popularity) || 0) + (perf ? 0.15 : 0) + (c.socials?.length ? 0.05 : 0);
  };
  const ranked = [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 6);
  const top = ranked[0];
  return { status: "ok", candidates: ranked, didYouMean: top && top.name.toLowerCase() !== name.trim().toLowerCase() ? top.name : null };
}

function receiptsFor(runId: string) {
  return ledger.byRun(runId).map((r) => ({
    ref: r.ref,
    workflow: r.workflow,
    endpoint: r.endpoint,
    cached: r.cached,
    status: r.status,
  }));
}

/** Scene 1 + 2: fingerprint + the 1,000-persona panel. */
export async function audienceReport(name: string, who: Who = {}) {
  const res: any = await fingerprintFor(name, who);
  if (res.candidates) return { status: "needs_input", candidates: res.candidates };
  if (res.empty) return { status: "empty" };
  const { fp, runId } = res;

  const { personas, composition } = samplePanel(fp, PANEL_N, 42);
  return {
    status: "ok",
    audience: fp.audience,
    coverage: fp.coverage,
    calls: fp.calls,
    demographics: fp.demographics,
    tags: fp.tags,
    metros: fp.metros,
    domains: fp.domains,
    momentum: fp.momentum,
    refs: fp.refs,
    composition,
    stimulus: stimulusFor(fp, who),
    personas: personas.map((p) => ({
      id: p.id,
      metro: p.metro,
      age: p.age,
      gender: p.gender,
      tastes: p.tastes.slice(0, 4).map((t) => t.value),
    })),
    receipts: receiptsFor(runId),
  };
}

/** Scene 3 + verdicts + strip: run the panel against the stimulus. */
export async function rehearseReport(name: string, who: Who = {}) {
  const res: any = await fingerprintFor(name, who);
  if (res.candidates) return { status: "needs_input", candidates: res.candidates };
  if (res.empty) return { status: "empty" };
  const { fp, runId } = res;
  if (!fp.coverage.ok) return { status: "refused", coverage: fp.coverage };

  const stimulus = stimulusFor(fp, who);
  const { personas } = samplePanel(fp, PANEL_N, 42);
  const replies = await runPanel(personas, stimulus, respModeOf(), 7);
  const agg = aggregate(personas, replies);
  const split = citySplit(agg);
  const tribe = tribeStrip(stimulus);
  const verdicts = makeVerdicts(agg, tribe);

  const narrative =
    `The panel scored this ${agg.mean.toFixed(1)} out of 5, with ${agg.pct45}% rating it 4 or higher.` +
    (split
      ? ` ${split.top.metro} led at ${split.top.mean.toFixed(1)}, while ${split.bottom.metro} trailed at ${split.bottom.mean.toFixed(1)}.`
      : "") +
    ` The result is drawn from ${agg.n} synthetic respondents.`;
  const checked = checkClaims(narrative, agg.facts);

  return {
    status: "ok",
    audience: fp.audience,
    stimulus,
    aggregate: agg,
    split,
    tribe,
    verdicts,
    narrative: checked,
    respondentMode: respModeOf(),
    // per-person scores [personaId, score] so the map can light each dot up
    reactions: replies.map((r) => [r.personaId, r.score]),
    receipts: receiptsFor(runId),
  };
}

/** Scene 4: the Without-Qloo ablation. */
export async function ablationReport(name: string, who: Who = {}) {
  const res: any = await fingerprintFor(name, who);
  if (res.empty || res.candidates) return { status: "unavailable" };
  const { fp } = res;
  if (!fp.coverage.ok) return { status: "refused", coverage: fp.coverage };
  const stimulus = stimulusFor(fp, who);
  const ab = await ablation(fp, stimulus, PANEL_N, 42);
  return { status: "ok", ...ab };
}

/** Scene 5: the backtest. */
export function backtestReport() {
  return { status: "ok", ...runBacktest() };
}

/** Grow: partners to barter with for new reach (people / venues / brands). */
export async function partnerReport(name: string, kind = "people", location?: string, who: Who = {}) {
  const res: any = await fingerprintFor(name, who);
  if (res.candidates) return { status: "needs_input", candidates: res.candidates };
  if (res.empty) return { status: "empty" };
  const { fp, runId } = res;
  if (!fp.coverage.ok) return { status: "refused", coverage: fp.coverage };
  const partners = await findPartners(gateway, fp, runId, kind, location);
  return { status: "ok", audience: fp.audience, kind, location: location ?? null, partners, receipts: receiptsFor(runId) };
}

/**
 * The Director — a taste-grounded agent. Given a goal, it runs the tools in a
 * loop (read the audience → test the content → diagnose → find a growth lever),
 * decides from the real results (code owns the decisions), and returns a ranked
 * plan with receipts. The trace is the "agentic" part: every step names the
 * tool it called and what it observed.
 */
export async function directorReport(name: string, goal = "grow this audience's reach", who: Who = {}) {
  const reh: any = await rehearseReport(name, who);
  if (reh.status !== "ok") return { status: reh.status, coverage: reh.coverage };
  const part: any = await partnerReport(name, "people", undefined, who);

  const agg = reh.aggregate;
  const split = reh.split;
  const tribe = reh.tribe;
  const topMetro = agg.byMetro?.[0]?.metro ?? "—";
  const weakMetro = split?.bottom?.metro ?? "—";
  const deadZones = tribe.deadZones.length;
  const topPartner = part.status === "ok" ? part.partners[0] : null;

  const steps = [
    {
      n: 1,
      action: "Read the audience",
      tool: "fingerprint",
      observed: `${reh.audience.name}: strongest in ${topMetro}; ${agg.n.toLocaleString()} synthetic respondents.`,
    },
    {
      n: 2,
      action: "Test the content",
      tool: "rehearse",
      observed: `"${reh.stimulus.label}" scored ${agg.mean.toFixed(1)}/5 (${agg.pct45}% rated 4–5).`,
      decided: split ? `Reach is capped in ${weakMetro} (${split.bottom.mean.toFixed(1)}), the soft room.` : undefined,
    },
    {
      n: 3,
      action: "Diagnose",
      tool: "tribe + panel",
      observed:
        (deadZones ? `Brain response sags in ${deadZones} stretch(es) before the punch. ` : "Attention holds through. ") +
        (split ? `${weakMetro} trails ${split.top.metro} by ${(split.top.mean - split.bottom.mean).toFixed(1)}.` : ""),
      decided: "Two levers: tighten the weak segment, and bring a new crowd in.",
    },
    {
      n: 4,
      action: "Find a growth lever",
      tool: "find_partners",
      observed: topPartner
        ? `Top partner: ${topPartner.name} — ${Math.round(topPartner.netnew * 100)}% of their crowd is new to you, and they convert (${topPartner.convert}).`
        : "No strong partner cleared the bar.",
      decided: "Recommend an edit and a barter, ranked.",
    },
  ];

  const plan: { lever: "edit" | "grow"; title: string; detail: string; receipt: string }[] = [];
  if (deadZones) {
    plan.push({
      lever: "edit",
      title: "Tighten the setup",
      detail: `The brain disengages before the punch in ${deadZones} stretch(es). Cut the slow mid-section — it's costing you the room that's already with you.`,
      receipt: "TRIBE v2 perception strip",
    });
  }
  if (topPartner) {
    plan.push({
      lever: "grow",
      title: `Co-promote with ${topPartner.name}`,
      detail: `${topPartner.why} A swap brings a crowd you don't already have${weakMetro !== "—" ? `, useful where you're soft (${weakMetro})` : ""}.`,
      receipt: "Qloo recommend + tag overlap",
    });
  }
  if (split) {
    plan.push({
      lever: "grow",
      title: `Program for ${weakMetro}`,
      detail: `${weakMetro} is your softest room. Re-test a version tuned to its taste, or book the barter there first.`,
      receipt: "Qloo where_popular + panel split",
    });
  }

  return {
    status: "ok",
    audience: reh.audience,
    goal,
    baseline: { score: agg.mean, pct: agg.pct45, split },
    diagnosis: { topMetro, weakMetro, deadZones, topPartner },
    steps,
    plan,
  };
}

/** Scene 5: the real-world YouTube backtest, as last run from the CLI (the server never spends quota). */
export async function youtubeBacktestReport() {
  const r = await loadResult();
  if (!r) return { status: "not_run", method: YT_METHOD, run: "YOUTUBE_API_KEY=<free key> npm run backtest-youtube" };
  return { status: "ok", ...r };
}

/** Scene 5: Google Trends metro checks, one per audience, as last run from the CLI. */
export async function trendsCheckReport() {
  const all = await loadTrendsChecks();
  return Object.keys(all).length
    ? { status: "ok", checks: all }
    : { status: "not_run", run: 'npm run trends-check -- "<audience>" <geoMap.csv>' };
}

/**
 * Conquest — the campaign. The agent scouts the territory, battle-tests the
 * material, reads the battlefield (presence x reaction per city), recruits an
 * ally, finds a stage in the next city to take, and issues missions. Every
 * step names the tool it used; every mission cites its data.
 */
export async function campaignReport(name: string, who: Who = {}) {
  const reh: any = await rehearseReport(name, who);
  if (reh.status !== "ok") return { status: reh.status, coverage: reh.coverage };
  const { fp, runId }: any = await fingerprintFor(name, who);

  // your raw footprint per city (same call the fingerprint made, so it's cached)
  const footprint = async (id: string) => {
    const env = await gateway.call("where_popular", { entity: id, within: "United States" }, runId);
    return Object.fromEntries((env.results ?? []).map((r: any) => [r.name, Number(r.count ?? Math.round((r.affinity ?? 0) * 1000))]));
  };
  const you = await footprint(fp.audience.id);

  // people your fans also follow: the best barter partners are allies, the
  // closest taste overlaps are rivals fighting for the same fans
  const people = await findPartners(gateway, fp, runId, "people");
  const rivalPicks = [...people].sort((a, b) => b.overlap - a.overlap).slice(0, 3);
  const rivals = await Promise.all(rivalPicks.filter((r) => r.id).map(async (r) => ({ id: r.id!, name: r.name, counts: await footprint(r.id!) })));

  const terr = buildTerritory(fp, reh.aggregate, { you, rivals });
  const plans = rivalPlans(terr, rivalPicks.filter((r) => r.id));
  // never tell you to recruit the rival you were just told to fight
  const foes = new Set(plans.filter((p) => p.strategy === "compete").map((p) => p.name));
  const allies = people.filter((p) => !foes.has(p.name)).slice(0, 3);
  const venues = terr.target ? (await findPartners(gateway, fp, runId, "venues", terr.target.name)).slice(0, 3) : [];
  const missions = planMissions(terr, reh.tribe, allies, venues, plans);
  const names = (cs: { name: string }[]) => cs.slice(0, 3).map((c) => c.name).join(", ") || "none yet";

  const steps = [
    { n: 1, action: "Scout the territory", tool: "where_popular", observed: `Your fans are concentrated in ${names(terr.cities)}.` },
    { n: 2, action: "Battle-test the material", tool: "rehearse", observed: `"${reh.stimulus.label}" scored ${reh.aggregate.mean.toFixed(1)}/5 across ${reh.aggregate.n.toLocaleString()} people.` },
    { n: 3, action: "Spot the rivals", tool: "recommend + where_popular", observed: plans.length ? `${plans.map((p) => p.name).join(", ")} are fighting for your fans. They hold ${terr.rivalHeld.length} of your cities.` : "No rival is close enough to worry about." },
    {
      n: 4,
      action: "Read the battlefield",
      tool: "panel x footprints",
      observed: `You hold ${terr.conquest}% of your ground. Strongholds: ${names(terr.strongholds)}. Frontlines: ${names(terr.frontlines)}. Beachheads: ${names(terr.beachheads)}.`,
      decided: terr.target ? `Next conquest: ${terr.target.name}.` : "No city is ready to take yet.",
    },
    { n: 5, action: "Pick allies and enemies", tool: "find_partners", observed: plans.map((p) => `${p.name}: ${p.strategy === "ally" ? "ally" : "compete"}${p.city ? ` in ${p.city}` : ""}`).join(". ") || "No rival plans." },
    ...(terr.target ? [{ n: 6, action: "Find a stage", tool: "recommend · place", observed: venues[0] ? `Top stage in ${terr.target.name} for your crowd: ${venues[0].name}.` : `No stage in ${terr.target.name} cleared the bar.` }] : []),
    { n: 7, action: "Plan the campaign", tool: "general", observed: `${missions.length} missions. Complete them all and you could hold ${projected(terr, missions)}% of your ground.`, decided: "Missions ranked. Waiting for your orders." },
  ];

  return {
    status: "ok",
    audience: fp.audience,
    stimulus: reh.stimulus,
    // quotes let the game's fans speak in their own (simulated) words
    aggregate: { mean: reh.aggregate.mean, pct45: reh.aggregate.pct45, n: reh.aggregate.n, quotes: (reh.aggregate.quotes ?? []).slice(0, 12) },
    tribe: reh.tribe,
    split: reh.split,
    narrative: reh.narrative,
    territory: terr,
    allies,
    rivals: plans,
    venues,
    missions,
    projected: projected(terr, missions),
    steps,
    receipts: receiptsFor(runId),
  };
}

/**
 * One Qloo call per city for the Tour Planner and City Brief: the places in a
 * city whose crowd your fans over-index on (crowd fit = Qloo affinity), with
 * the receipt rows for that call. Cached like every other Qloo call.
 */
export async function venuesIn(name: string, who: Who, city: string) {
  const res: any = await fingerprintFor(name, who);
  if (res.candidates || res.empty) return { status: "unavailable", venues: [], receipts: [] };
  const runId = `venues_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  // real stages first: Qloo's comedy clubs, then music venues and theaters; any place only as a fallback
  const where = qlooPlace(city);
  const call = (tags?: string) => gateway.call("recommend", { entity: res.fp.audience.id, target_type: "place", take: tags ? 6 : 12, location: where, ...(tags ? { tags } : {}) }, runId);
  const [comedy, music] = await Promise.all([call(VENUE_TAGS.comedy), call(VENUE_TAGS.music)]);
  const tagged = [...(comedy.results ?? []).map((v: any) => ({ ...v, tags: ["Comedy club", ...(v.tags ?? [])] })), ...(music.results ?? []).map((v: any) => ({ ...v, tags: ["Music venue", ...(v.tags ?? [])] }))]
    .filter((v: any, i: number, all: any[]) => all.findIndex((x) => x.id === v.id) === i);
  const env = tagged.length ? { ...comedy, results: tagged } : await call();
  const venues = (env.results ?? []).filter((v: any) => v?.name && !String(v.id ?? "").startsWith("mock:"))
    .map((v: any) => ({ name: v.name, id: v.id, fit: Math.round(Math.max(0, Math.min(1, v.affinity ?? 0)) * 100), address: v.address ?? null, phone: v.phone ?? null, website: v.website ?? null, tags: v.tags ?? [] }))
    .filter((v: any) => !ADULT.test(v.name + " " + v.tags.join(" ")))
    .sort((a: any, b: any) => stageScore(b) - stageScore(a));
  return { status: env.status, venues, receipts: receiptsFor(runId) };
}

// Qloo reads "Washington" as the state: name the city and state
const qlooPlace = (city: string) => (city === "Washington" ? "Washington, DC" : METROS[city] ? `${city}, ${METROS[city]!.state}` : city);
// Qloo place-type tags for rooms that host shows
const VENUE_TAGS = { comedy: "urn:tag:genre:place:comedy_club", music: "urn:tag:genre:place:live_music_venue,urn:tag:genre:place:theater" };
// Qloo's places include restaurants, hotels and the odd adult club: never suggest the last,
// and rank rooms where a show can happen above places that only serve food.
const ADULT = /adult entertainment|strip club|gentlemen'?s club|topless|exotic danc|cabaret club|\b(club onyx|covergirls|fantasy island|pink slip|scores|spearmint rhino|d[eé]j[aà] vu|rick'?s cabaret|sapphire|penthouse club|hustler club|tootsie'?s|king of diamonds|magic city|platinum plus|pink pony|follies|cheetah|the gold club)\b/i;
const STAGE = /comedy|improv|club|lounge|\bbar\b|bar area|live music|music venue|theat(er|re)|hall|ballroom|event|nightclub|jazz|brewery|pub|tavern|stage/i;
const NOT_STAGE = /coffee|ice cream|bakery|salon|\bspa\b|nail|dental|hotel|motel|\binn\b|suites|pharmacy|grocery|market|gas station|car wash|school|church|admirals club|sky club|centurion|airport|terminal/i;
const FOOD = /cuisine|restaurant|grill\b|diner|deli\b|food|pizza|burger|sushi|taqueria|kitchen|bistro|cafe|café|peri-peri/i;
const stageScore = (v: any) => { const t = v.name + " " + (v.tags ?? []).join(" "); return v.fit + (/^Comedy club/.test((v.tags ?? [])[0] ?? "") ? 15 : 0) + (STAGE.test(t) ? 8 : 0) - (NOT_STAGE.test(t) ? 40 : 0) - (FOOD.test(v.name) && !STAGE.test(v.name) ? 12 : 0); };
/** can a show plausibly happen here? (Qloo lists every kind of place) */
export const isStage = (v: { name: string; tags?: string[] }) => { const t = v.name + " " + (v.tags ?? []).join(" "); return STAGE.test(t) && !NOT_STAGE.test(t); };

/** Brands / people / podcasts etc. your fans in a city love (one Qloo call), for the City Brief. */
export async function lovedIn(name: string, who: Who, city: string, target: string, take = 4) {
  const res: any = await fingerprintFor(name, who);
  if (res.candidates || res.empty) return { status: "unavailable", items: [], receipts: [] };
  const runId = `loved_${target}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const env = await gateway.call("recommend", { entity: res.fp.audience.id, target_type: target, take, location: qlooPlace(city) }, runId);
  const items = (env.results ?? []).filter((v: any) => v?.name && !String(v.id ?? "").startsWith("mock:")).map((v: any) => ({ name: v.name, affinity: Math.round((v.affinity ?? 0) * 100) }));
  return { status: env.status, items, receipts: receiptsFor(runId) };
}
