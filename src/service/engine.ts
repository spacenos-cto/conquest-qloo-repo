import { Ledger } from "../ledger/ledger.js";
import { QlooGateway, type Mode } from "../qloo/gateway.js";
import { resolve } from "../qloo/resolve.js";
import { fingerprint } from "../qloo/fingerprint.js";
import { samplePanel } from "../panel/sampler.js";
import { runPanel, type RespondentMode } from "../panel/respondent.js";
import { aggregate, citySplit } from "../panel/aggregate.js";
import { checkClaims } from "../panel/claimcheck.js";
import { makeVerdicts } from "../panel/verdict.js";
import { pickStimulus } from "../panel/stimuli.js";
import { findPartners } from "../grow/partners.js";
import { tribeStrip } from "../tribe/strip.js";
import { ablation } from "../proof/ablation.js";
import { runBacktest } from "../proof/backtest.js";
import { loadResult } from "../proof/youtube/run.js";
import { METHOD as YT_METHOD } from "../proof/youtube/backtest.js";
import { loadTrendsChecks } from "../proof/trends.js";
import type { Fingerprint } from "../qloo/types.js";

/**
 * The service facade the HTTP API and the MCP server call. One gateway/ledger
 * for the process (cache shared across requests); each request gets its own
 * runId so receipts stay separate. Fingerprints + panels are memoised by name.
 */

const mode = (process.env.QLOO_MODE as Mode) || "mock";
const respMode = (process.env.REHEARSAL_RESPONDENT_MODE as RespondentMode) || "mock";
const ledger = new Ledger(process.env.REHEARSAL_DB || ":memory:");
const gateway = new QlooGateway(mode, ledger);

const PANEL_N = Number(process.env.REHEARSAL_PANEL_N || 1000);
const fpCache = new Map<string, { fp: Fingerprint; runId: string }>();

export function serverInfo() {
  return { qlooMode: mode, respondentMode: respMode, panelN: PANEL_N };
}

async function fingerprintFor(name: string) {
  const hit = fpCache.get(name.toLowerCase());
  if (hit) return hit;
  const runId = "run_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const r = await resolve(gateway, name, runId);
  if (r.candidates?.length) return { candidates: r.candidates, runId };
  if (!r.entity) return { empty: true, runId };
  const fp = await fingerprint(gateway, r.entity, runId);
  const entry = { fp, runId };
  fpCache.set(name.toLowerCase(), entry);
  return entry;
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
export async function audienceReport(name: string) {
  const res: any = await fingerprintFor(name);
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
export async function rehearseReport(name: string) {
  const res: any = await fingerprintFor(name);
  if (res.candidates) return { status: "needs_input", candidates: res.candidates };
  if (res.empty) return { status: "empty" };
  const { fp, runId } = res;
  if (!fp.coverage.ok) return { status: "refused", coverage: fp.coverage };

  const stimulus = pickStimulus(fp.audience);
  const { personas } = samplePanel(fp, PANEL_N, 42);
  const replies = await runPanel(personas, stimulus, respMode, 7);
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
    respondentMode: respMode,
    receipts: receiptsFor(runId),
  };
}

/** Scene 4: the Without-Qloo ablation. */
export async function ablationReport(name: string) {
  const res: any = await fingerprintFor(name);
  if (res.empty || res.candidates) return { status: "unavailable" };
  const { fp } = res;
  if (!fp.coverage.ok) return { status: "refused", coverage: fp.coverage };
  const stimulus = pickStimulus(fp.audience);
  const ab = await ablation(fp, stimulus, PANEL_N, 42);
  return { status: "ok", ...ab };
}

/** Scene 5: the backtest. */
export function backtestReport() {
  return { status: "ok", ...runBacktest() };
}

/** Grow: partners to barter with for new reach (people / venues / brands). */
export async function partnerReport(name: string, kind = "people", location?: string) {
  const res: any = await fingerprintFor(name);
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
export async function directorReport(name: string, goal = "grow this audience's reach") {
  const reh: any = await rehearseReport(name);
  if (reh.status !== "ok") return { status: reh.status, coverage: reh.coverage };
  const part: any = await partnerReport(name, "people");

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
