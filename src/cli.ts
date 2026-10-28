import { Ledger } from "./ledger/ledger.js";
import { QlooGateway, type Mode } from "./qloo/gateway.js";
import { resolve } from "./qloo/resolve.js";
import { fingerprint } from "./qloo/fingerprint.js";
import { samplePanel } from "./panel/sampler.js";
import { runPanel, type RespondentMode } from "./panel/respondent.js";
import { aggregate, citySplit } from "./panel/aggregate.js";
import { checkClaims } from "./panel/claimcheck.js";
import { DEMO_STIMULI, neutralStimulus } from "./panel/stimuli.js";
import { ablation } from "./proof/ablation.js";
import { runBacktest } from "./proof/backtest.js";
import { YouTubeClient } from "./proof/youtube/client.js";
import { runYouTubeBacktest, saveResult, RESULT_FILE, type YouTubeBacktest } from "./proof/youtube/run.js";
import { compareMetros, saveTrendsCheck, TRENDS_FILE } from "./proof/trends.js";
import { readFile } from "node:fs/promises";
import type { Fingerprint, Aggregate, Stimulus } from "./qloo/types.js";

/**
 * Day-1 CLI: prove the Qloo pipeline end to end.
 *   npm run fingerprint "Cedric the Entertainer"
 *   npm run fingerprint "some unknown band"   # shows the coverage refusal
 */

const [cmd, ...args] = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const rest = args.filter((a) => !a.startsWith("--"));
const csvPath = rest.find((a) => a.toLowerCase().endsWith(".csv"));
const channelArg = rest.find((a) => a.startsWith("@") || /^UC[\w-]{20,}$/.test(a));
const name = rest.filter((a) => a !== csvPath && a !== channelArg).join(" ").trim();
const mode = (process.env.QLOO_MODE as Mode) || "mock";
const dbPath = process.env.REHEARSAL_DB || "./rehearsal.sqlite";

const NO_NAME = ["backtest", "backtest-youtube"];
if (!cmd || (!NO_NAME.includes(cmd) && !name) || (cmd === "trends-check" && !csvPath)) {
  console.error(
    'Usage: npm run <fingerprint|rehearse|ablation> "<audience>"  |  npm run backtest\n' +
      '       npm run backtest-youtube [-- "<audience>" [@handle]] [--fresh] [--live-respondents]\n' +
      '       npm run trends-check -- "<audience>" <geoMap.csv>',
  );
  process.exit(1);
}

const ledger = new Ledger(dbPath);
const gateway = new QlooGateway(mode, ledger);
const runId = "run_" + Date.now();

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  console.log(dim(`mode=${mode}  run=${runId}\n`));

  if (cmd === "backtest") {
    printBacktest();
    return;
  }
  if (cmd === "backtest-youtube") {
    await backtestYouTube();
    return;
  }

  const r = await resolve(gateway, name, runId);

  if (r.candidates?.length) {
    console.log(bold("Ambiguous — confirm which one:"));
    r.candidates.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}  (${c.type})  ${dim(c.id)}`));
    return;
  }
  if (!r.entity) {
    console.log(red(`No Qloo entity found for "${name}".`));
    return;
  }

  console.log(`${bold("Audience:")} ${r.entity.name}  ${dim(`${r.entity.type} · ${r.entity.id}`)}\n`);

  if (cmd === "resolve") return;

  const fp = await fingerprint(gateway, r.entity, runId);

  if (cmd === "fingerprint") {
    printFingerprint(fp);
    printLedger(ledger, runId);
    return;
  }

  if (cmd === "rehearse") {
    console.log(
      fp.coverage.ok
        ? green(`● Coverage: strong · ${fp.calls} Qloo calls`)
        : red(`● Coverage: INSUFFICIENT — Rehearsal won't guess`),
    );
    if (!fp.coverage.ok) {
      fp.coverage.reasons.forEach((l) => console.log("   " + l));
      console.log(red("\nRefusing to build a panel.\n"));
      printLedger(ledger, runId);
      return;
    }
    await rehearse(fp);
    printLedger(ledger, runId);
    return;
  }

  if (cmd === "ablation") {
    if (!fp.coverage.ok) {
      console.log(red("Coverage insufficient — Rehearsal won't guess.\n"));
      return;
    }
    const ab = await ablation(fp, getStimulus(fp));
    printAblation(ab);
    return;
  }

  if (cmd === "trends-check") {
    const check = compareMetros(fp, await readFile(csvPath!, "utf8"));
    console.log(bold("═══ Google Trends metro check ═══"));
    console.log(dim(`Trends term "${check.term}" · ${check.window || "window not in file"}`));
    console.log(`   Metros in both      ${bold(String(check.shared))}`);
    if (check.testable) {
      console.log(`   Rank agreement      ρ = ${bold(String(check.rho))}   p = ${check.p}`);
    } else console.log(red(`   Not testable: ${check.reason}`));
    console.log(`   Top-5 overlap       ${bold(check.overlapTop5 + "/5")}`);
    console.log(`   Qloo top 5          ${check.topQloo.join(", ")}`);
    console.log(`   Trends top 5        ${check.topTrends.join(", ")}`);
    check.biggestGaps.forEach((g) => console.log(dim(`   gap: ${g.metro} — Qloo #${g.qlooRank}, Trends #${g.trendsRank}`)));
    if (check.qlooOnly.length) console.log(dim(`   not in the Trends file: ${check.qlooOnly.join(", ")}`));
    await saveTrendsCheck(fp.audience.id.replace(/^mock:/, ""), check);
    console.log(dim(`\nSaved to ${TRENDS_FILE}`));
    return;
  }
}

async function backtestYouTube() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.log(red("YOUTUBE_API_KEY is not set."));
    console.log(
      "It's free: Google Cloud Console → new project → enable \"YouTube Data API v3\" → Credentials → API key.\n" +
        "Then set it for this terminal only (don't put it in a committed file):\n" +
        '   PowerShell:  $env:YOUTUBE_API_KEY = "<key>"\n' +
        "   bash:        export YOUTUBE_API_KEY=<key>\n" +
        "A full run uses about 350 of the 10,000 free daily units.",
    );
    process.exitCode = 1;
    return;
  }
  const respMode: RespondentMode = flags.includes("--live-respondents") ? "live" : "mock";
  if (respMode === "live")
    console.log(red("⚠ live respondents: one Claude call per persona per video — this costs Anthropic credits."));
  const api = new YouTubeClient(key, "data/youtube/raw", flags.includes("--fresh"));
  const result = await runYouTubeBacktest(api, gateway, {
    qlooMode: mode,
    respMode,
    only: name || undefined,
    channel: channelArg,
    log: (s) => console.log(dim(s)),
  });
  await saveResult(result);
  printYouTube(result);
  console.log(dim(`\nSaved to ${RESULT_FILE} · ${result.quotaUnits} YouTube quota units used (cache hits are free)`));
}

function printYouTube(r: YouTubeBacktest) {
  console.log(bold("\n═══ Real-world backtest — YouTube ═══"));
  console.log(dim(`method ${r.methodVersion} (frozen): ${r.method}`));
  if (r.qlooMode === "mock" || r.respondentMode === "mock")
    console.log(red(`⚠ Qloo=${r.qlooMode}, respondents=${r.respondentMode}. The outcomes are real YouTube data; the predictor is only as real as these modes.`));
  for (const c of r.cases) {
    console.log(bold(`\n${c.audience}`));
    if ("error" in c) {
      console.log(red(`   ${c.error}`));
      continue;
    }
    console.log(dim(`   channel "${c.channel.title}" (${c.channel.id}) · sealed ${c.sealHash} at ${c.sealedAt}`));
    const t = c.rankTest;
    if (t.testable)
      console.log(`   Panel score vs likes per 1k views   ρ = ${bold(String(t.rho))}  p = ${t.p}  n = ${t.n}   (without Qloo ρ = ${t.flatRho})`);
    else console.log(red(`   Not testable: ${t.reason}`));
    if (c.medianSplit)
      console.log(
        `   Panel's higher half ${bold(String(c.medianSplit.higherMean))} likes/1k views vs lower half ${c.medianSplit.lowerMean}`,
      );
    console.log(
      `   Taste echoes   ${bold(String(c.echoes.ownPer1k))} per 1k comments name a Qloo neighbour vs ${c.echoes.controlPer1k} for a control audience (${c.echoes.comments} comments)`,
    );
    if (c.echoes.topOwn.length) console.log(dim(`   most named: ${c.echoes.topOwn.join(", ")}`));
    c.misses.forEach((m) => console.log(dim(`   miss (${m.kind}): "${m.title.slice(0, 60)}" panel ${m.predicted} · ${m.likesPerK} likes/1k`)));
  }
}

function getStimulus(fp: Fingerprint): Stimulus {
  const slug = fp.audience.id.replace(/^mock:/, "");
  return (
    DEMO_STIMULI[slug] ??
    neutralStimulus("A short generic promo for this audience, no regional references.")
  );
}

async function rehearse(fp: Fingerprint) {
  const stimulus = getStimulus(fp);
  const respMode = (process.env.REHEARSAL_RESPONDENT_MODE as RespondentMode) || "mock";

  console.log(`\n${bold("Testing:")} ${stimulus.label}`);
  console.log(dim(`   "${stimulus.text.slice(0, 90)}${stimulus.text.length > 90 ? "…" : ""}"`));

  const { personas, composition } = samplePanel(fp, 1000, 42);
  console.log(
    dim(
      `\n1,000 personas sampled · ages ` +
        composition.map((c) => `${c.age}:${c.n}`).join("  "),
    ),
  );

  const replies = await runPanel(personas, stimulus, respMode, 7);
  const agg = aggregate(personas, replies);

  console.log(green(`\n${bold("Panel verdict")} (${respMode} respondent · ${agg.n} replies)`));
  console.log(`   Mean score   ${bold(agg.mean.toFixed(1))} / 5`);
  console.log(`   Rated 4–5    ${bold(agg.pct45 + "%")}`);

  const split = citySplit(agg);
  if (split) {
    console.log(
      `   City split   ${bold(split.top.metro)} ${split.top.mean.toFixed(1)} ` +
        `vs ${bold(split.bottom.metro)} ${split.bottom.mean.toFixed(1)}`,
    );
  }

  console.log(bold("\nBy age"));
  agg.byAge.forEach((a) => console.log(`   ${a.age.padEnd(8)} ${a.mean.toFixed(1)}  ${dim("n=" + a.n)}`));
  console.log(bold("By gender"));
  agg.byGender.forEach((x) => console.log(`   ${x.gender.padEnd(8)} ${x.mean.toFixed(1)}  ${dim("n=" + x.n)}`));

  console.log(bold("\nWhat drove it (reasons by element)"));
  agg.reasons.slice(0, 5).forEach((rr) => console.log(`   ${String(rr.count).padStart(4)}  ${rr.element}`));

  console.log(bold("\nWhat they said"));
  agg.quotes.forEach((q) => console.log(`   "${q.text}"\n      ${dim(q.persona)}`));

  // Narrative is written from facts only, then claim-checked.
  const narrative = narrate(agg, split);
  const checked = checkClaims(narrative, agg.facts);
  console.log(bold("\nNarrative (claim-checked)"));
  checked.kept.forEach((s) => console.log(`   ${s}`));
  checked.struck.forEach((s) => console.log(red(`   [STRUCK] ${s.text} — ${s.reason}`)));
  console.log(
    dim(`   ${checked.kept.length} kept, ${checked.struck.length} struck · every number traces to a computed fact`),
  );
}

function narrate(agg: Aggregate, split: ReturnType<typeof citySplit>): string {
  const parts = [
    `The panel scored this ${agg.mean.toFixed(1)} out of 5, with ${agg.pct45}% rating it 4 or higher.`,
  ];
  if (split) {
    parts.push(
      `${split.top.metro} led at ${split.top.mean.toFixed(1)}, while ${split.bottom.metro} trailed at ${split.bottom.mean.toFixed(1)}.`,
    );
  }
  parts.push(`The result is drawn from ${agg.n} synthetic respondents.`);
  return parts.join(" ");
}

function printFingerprint(fp: Fingerprint) {
  const c = fp.coverage;
  console.log(
    c.ok
      ? green(`● Coverage: strong · ${fp.calls} Qloo calls`)
      : red(`● Coverage: INSUFFICIENT — Rehearsal won't guess · ${fp.calls} Qloo calls`),
  );
  c.reasons.forEach((line) => console.log("   " + line));
  console.log();

  if (!c.ok) {
    console.log(red("Refusing to build a panel for this audience.\n"));
    return;
  }

  console.log(bold("Who they are"));
  fp.demographics.forEach(([k, v]) =>
    console.log(`   ${k.padEnd(8)} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`),
  );

  console.log(bold("\nTop tags"));
  console.log("   " + fp.tags.slice(0, 12).join(", ") + ` … (${fp.tags.length} total)`);

  console.log(bold("\nWhere they are (top metros)"));
  Object.entries(fp.metros)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([m, w]) => console.log(`   ${m.padEnd(16)} ${w.toFixed(2)}`));

  for (const [domain, items] of Object.entries(fp.domains)) {
    console.log(bold(`\n${domain}`));
    console.log("   " + items.slice(0, 5).map((i) => i.name).join(", ") + ` … (${items.length})`);
  }

  console.log(bold("\nMomentum"));
  console.log(`   ${fp.momentum.status} — ${fp.momentum.note}`);
}

function printAblation(ab: Awaited<ReturnType<typeof ablation>>) {
  const bar = (pct: number[]) => pct.map((p, i) => `${i + 1}:${String(p).padStart(2)}%`).join("  ");
  const side = (s: typeof ab.grounded, color: (x: string) => string) => {
    console.log(color(`\n${bold(s.label)}`));
    console.log(`   mean ${s.mean.toFixed(1)}   rated 4–5 ${s.pct45}%`);
    console.log(`   city variance ${bold(String(s.metroVariance))}   distinct reasons ${bold(String(s.distinctReasons))}`);
    if (s.topSplit)
      console.log(`   split ${s.topSplit.top} ${s.topSplit.topMean.toFixed(1)} vs ${s.topSplit.bottom} ${s.topSplit.bottomMean.toFixed(1)}`);
    console.log(`   ${dim(bar(s.hist))}`);
  };
  console.log(bold("\n═══ Without Qloo — the ablation ═══"));
  side(ab.grounded, green);
  side(ab.ungrounded, red);
  console.log(
    dim(
      `\nTaste is where the disagreement lives: grounded city-variance ${ab.grounded.metroVariance} ` +
        `vs ungrounded ${ab.ungrounded.metroVariance}; ` +
        `${ab.grounded.distinctReasons} reasons vs ${ab.ungrounded.distinctReasons}.`,
    ),
  );
}

function printBacktest() {
  const bt = runBacktest();
  console.log(bold("═══ Backtest — does it track reality? ═══"));
  console.log(dim(`method (frozen): ${bt.frozenMethod}`));
  if (bt.isSample) console.log(red("⚠ SAMPLE data + stand-in grounded model — replace with real YouGov + live Qloo to cite."));
  console.log(`\n   Qloo-grounded vs reference   r = ${bold(bt.rGrounded.toFixed(2))}   MAE ${bt.maeGrounded}`);
  console.log(`   LLM-only vs reference        r = ${bold(bt.rLLM.toFixed(2))}   MAE ${bt.maeLLM}`);
  console.log(`   Misses (>10 pts)             ${bt.misses.length} of ${bt.brands.length * 8}`);
  console.log(bold("\nSample of the misses"));
  bt.misses.slice(0, 6).forEach((m) =>
    console.log(`   ${m.brand.padEnd(12)} ${m.cell.padEnd(9)} panel ${String(m.grounded).padStart(3)}%  ref ${String(m.ref).padStart(3)}%`),
  );
}

function printLedger(ledger: Ledger, runId: string) {
  const rows = ledger.byRun(runId);
  console.log(bold(`\nReceipts (${rows.length} Qloo calls)`));
  rows.forEach((r) =>
    console.log(
      `   ${r.ref.padEnd(4)} ${r.workflow.padEnd(22)} ${r.endpoint.padEnd(34)} ` +
        `${(r.cached ? "cache" : "live").padEnd(5)} ${r.status}`,
    ),
  );
}

main().catch((e) => {
  console.error(red("Error:"), e);
  process.exit(1);
});
