import { Ledger } from "./ledger/ledger.js";
import { QlooGateway, type Mode } from "./qloo/gateway.js";
import { resolve } from "./qloo/resolve.js";
import { fingerprint } from "./qloo/fingerprint.js";
import type { Fingerprint } from "./qloo/types.js";

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
  printFingerprint(fp);
  printLedger(ledger, runId);
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
