import type { QlooGateway } from "./gateway.js";
import type { Entity, Fingerprint, Coverage, Ranked } from "./types.js";

/** Domains we pull for the taste fingerprint (Qloo filter.type entity kinds). */
const DOMAINS = ["artist", "tv_show", "brand", "podcast", "movie"] as const;

/**
 * Coverage rule (from the build spec). We refuse to build a panel when Qloo
 * can't see the audience well enough, rather than guessing.
 */
const MIN = {
  tags: 20,
  domainEntities: 10, // an entity domain "counts" at this many results
  domainsCounted: 3, // need at least this many domains that count
  metros: 10, // metros with a usable signal
};

export async function fingerprint(
  g: QlooGateway,
  entity: Entity,
  runId: string,
): Promise<Fingerprint> {
  // --- the calls, all logged to the ledger via the gateway. After each call
  // we capture the ledger ref it produced, so every trait has a receipt. ---
  const refs: Record<string, string> = {};
  const ref = () => "E" + g.callCount(runId);

  const demoEnv = await g.call("audience_demographics", { entity: entity.id }, runId);
  refs.demographics = ref();
  const tagEnv = await g.call("entity_tags", { entity: entity.id }, runId);
  refs.tags = ref();
  const metroEnv = await g.call(
    "where_popular",
    { entity: entity.id, within: "United States" },
    runId,
  );
  refs.metros = ref();

  const domains: Record<string, Ranked[]> = {};
  for (const d of DOMAINS) {
    const e = await g.call("recommend", { entity: entity.id, target_type: d }, runId);
    refs[d] = ref();
    domains[d] = asRanked(e.results);
  }

  const trendEnv = await g.call("trends", { entity: entity.id }, runId);
  refs.trends = ref();

  // --- parse (field names match the kit result shape; see mock.ts note) ---
  const demographics = (demoEnv.results ?? []).map(
    (r: any) => [String(r.label), Number(r.value)] as [string, number],
  );
  const tags = (tagEnv.results ?? []).map((r: any) => String(r.name));
  const metros = Object.fromEntries(
    (metroEnv.results ?? []).map((r: any) => [String(r.name), Number(r.affinity)]),
  );
  const momentum =
    (trendEnv.result_count ?? 0) > 0
      ? { status: "measured" as const, note: trendEnv.summary ?? "rising" }
      : { status: "not_measured" as const, note: "flat window — reported, not guessed" };

  const coverage = assessCoverage(demographics, tags, metros, domains);
  const calls = g.callCount(runId);

  return { audience: entity, demographics, tags, metros, domains, momentum, coverage, calls, refs };
}

function asRanked(results: any[] = []): Ranked[] {
  return results.map((r) => ({ name: String(r.name), affinity: Number(r.affinity ?? 0) }));
}

export function assessCoverage(
  demographics: [string, number][],
  tags: string[],
  metros: Record<string, number>,
  domains: Record<string, Ranked[]>,
): Coverage {
  const reasons: string[] = [];
  let ok = true;

  const hasDemo = demographics.length > 0;
  reasons.push(`${pass(hasDemo)} demographics present (${demographics.length} bands)`);
  ok &&= hasDemo;

  const enoughTags = tags.length >= MIN.tags;
  reasons.push(`${pass(enoughTags)} tags ≥ ${MIN.tags} (have ${tags.length})`);
  ok &&= enoughTags;

  const counted = Object.entries(domains).filter(
    ([, v]) => v.length >= MIN.domainEntities,
  );
  const enoughDomains = counted.length >= MIN.domainsCounted;
  reasons.push(
    `${pass(enoughDomains)} ≥ ${MIN.domainsCounted} domains with ≥ ${MIN.domainEntities} entities ` +
      `(have ${counted.length}: ${counted.map(([k]) => k).join(", ") || "none"})`,
  );
  ok &&= enoughDomains;

  const metroCount = Object.values(metros).filter((v) => v > 0).length;
  const enoughMetros = metroCount >= MIN.metros;
  reasons.push(`${pass(enoughMetros)} metros with signal ≥ ${MIN.metros} (have ${metroCount})`);
  ok &&= enoughMetros;

  return { ok, reasons };
}

const pass = (b: boolean) => (b ? "✓" : "✗");
