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

  const stimulus = pickStimulus(fp.audience.id);
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
  const stimulus = pickStimulus(fp.audience.id);
  const ab = await ablation(fp, stimulus, PANEL_N, 42);
  return { status: "ok", ...ab };
}

/** Scene 5: the backtest. */
export function backtestReport() {
  return { status: "ok", ...runBacktest() };
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
