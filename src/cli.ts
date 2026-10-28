import { Ledger } from "./ledger/ledger.js";
import { QlooGateway, type Mode } from "./qloo/gateway.js";
import { resolve } from "./qloo/resolve.js";
import { fingerprint } from "./qloo/fingerprint.js";
import { samplePanel } from "./panel/sampler.js";
import { runPanel, type RespondentMode } from "./panel/respondent.js";
import { aggregate, citySplit } from "./panel/aggregate.js";
import { checkClaims } from "./panel/claimcheck.js";
import { DEMO_STIMULI, neutralStimulus } from "./panel/stimuli.js";
import type { Fingerprint, Aggregate } from "./qloo/types.js";

/**
 * Day-1 CLI: prove the Qloo pipeline end to end.
 *   npm run fingerprint "Cedric the Entertainer"
 *   npm run fingerprint "some unknown band"   # shows the coverage refusal
 */

const [cmd, ...rest] = process.argv.slice(2);
const name = rest.join(" ").trim();
const mode = (process.env.QLOO_MODE as Mode) || "mock";
const dbPath = process.env.REHEARSAL_DB || "./rehearsal.sqlite";

if (!cmd || !name) {
  console.error('Usage: npm run fingerprint "<audience name>"');
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
}

async function rehearse(fp: Fingerprint) {
  const slug = fp.audience.id.replace(/^mock:/, "");
  const stimulus =
    DEMO_STIMULI[slug] ??
    neutralStimulus("A short generic promo for this audience, no regional references.");
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
