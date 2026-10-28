import { Ledger } from "./ledger/ledger.js";
import { QlooGateway } from "./qloo/gateway.js";

/**
 * Live shape probe. Once the Qloo key is set up, run:
 *   QLOO_MODE=live npm run probe "Cedric the Entertainer"
 * It makes one real call per workflow and prints the status, the keys of the
 * first result, and a sample — so we can confirm (or fix) the field mapping the
 * parser in resolve.ts / fingerprint.ts expects. Paste the output back.
 *
 * What the parser currently expects:
 *   describe              → results[0].entity_id (or .id), .name, .type
 *   audience_demographics → results[].label, .value
 *   entity_tags           → results[].name
 *   where_popular         → results[].name, .affinity
 *   recommend             → results[].name, .affinity
 *   trends                → result_count > 0 means "measured"
 */

const name = process.argv.slice(2).join(" ").trim() || "Cedric the Entertainer";
const ledger = new Ledger(":memory:");
const g = new QlooGateway("live", ledger); // force live regardless of QLOO_MODE
const runId = "probe";

function show(label: string, env: any) {
  const r0 = (env.results ?? [])[0];
  console.log(`\n=== ${label} ===`);
  console.log(`status=${env.status}  result_count=${env.result_count ?? env.results?.length ?? 0}`);
  if (env.error) console.log("error:", JSON.stringify(env.error));
  console.log("results[0] keys:", r0 ? Object.keys(r0).join(", ") : "(none)");
  console.log("results[0]:", JSON.stringify(r0)?.slice(0, 400) ?? "(none)");
}

async function main() {
  const d = await g.call("describe", { name }, runId);
  show("describe", d);
  const first: any = (d.results ?? [])[0] ?? {};
  const id = first.entity_id ?? first.id;
  if (!id) {
    console.log("\nNo entity id found on describe — fix resolve.toEntity() to the real field, then re-run.");
    return;
  }
  show("audience_demographics", await g.call("audience_demographics", { entity: id }, runId));
  show("entity_tags", await g.call("entity_tags", { entity: id }, runId));
  show("where_popular", await g.call("where_popular", { entity: id, within: "United States" }, runId));
  show("recommend(artist)", await g.call("recommend", { entity: id, target_type: "artist" }, runId));
  show("trends", await g.call("trends", { entity: id }, runId));
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
