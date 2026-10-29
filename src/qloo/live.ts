import type { EnvelopeT } from "./types.js";

/**
 * Live Qloo backend — direct REST against the hackathon API (documented in the
 * developer guide: GET with the X-Api-Key header). No global CLI, so it deploys
 * anywhere Node runs. Each workflow is mapped to its real endpoint and
 * normalised into the same result shape the parser already expects
 * (name/affinity for lists, label/value for demographics).
 *
 * Reached only when QLOO_MODE=live. The key comes from QLOO_API_KEY (never the
 * query string, never committed).
 */

const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY || "";

// Metros we probe for the "where the fans are" footprint. The web map has
// coordinates for each of these.
const METROS = [
  "Atlanta", "Chicago", "Houston", "Dallas", "Memphis", "Washington", "Detroit",
  "Charlotte", "New Orleans", "Los Angeles", "New York", "Philadelphia",
  "Nashville", "Miami", "Phoenix", "Denver", "Seattle", "San Francisco",
  "Boston", "Minneapolis", "St. Louis", "Las Vegas",
];

async function qloo(path: string, params: Record<string, string | number>): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "X-Api-Key": KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`), { httpStatus: res.status });
  }
  return res.json();
}
const insights = (params: Record<string, string | number>) => qloo("/v2/insights", params);

const ok = (results: any[], summary = ""): EnvelopeT => ({ status: "ok", summary, results, result_count: results.length });
const empty = (summary: string): EnvelopeT => ({ status: "ok", summary, results: [], result_count: 0 });
const errEnv = (msg: string, retryable = false): EnvelopeT => ({
  status: "error",
  results: [],
  result_count: 0,
  error: { code: "QLOO_REST", retryable, recovery: msg },
});

const num = (x: unknown) => (typeof x === "number" ? x : 0);
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function liveCall(
  workflow: string,
  params: Record<string, any>,
): Promise<EnvelopeT> {
  if (!KEY) return errEnv("QLOO_API_KEY not set — export it or put it in .env (QLOO_MODE=live).");
  try {
    switch (workflow) {
      case "describe": {
        const d = await qloo("/search", { query: String(params.name) });
        return ok(
          (d.results ?? []).map((r: any) => ({
            entity_id: r.entity_id,
            name: r.name,
            type: (r.types ?? [])[0] ?? "urn:entity",
          })),
        );
      }

      case "audience_demographics": {
        const d = await insights({
          "filter.type": "urn:demographics",
          "signal.interests.entities": params.entity,
        });
        const q = ((d.results?.demographics ?? [])[0] ?? {}).query ?? {};
        const a = q.age ?? {};
        const g = q.gender ?? {};
        return ok([
          { label: "18–29", value: meanOf([a["24_and_younger"], a["25_to_29"]].filter((x) => typeof x === "number")) },
          { label: "30–44", value: meanOf([a["30_to_34"], a["35_to_44"]].filter((x) => typeof x === "number")) },
          { label: "45–54", value: num(a["45_to_54"]) },
          { label: "55+", value: num(a["55_and_older"]) },
          { label: "Male", value: num(g.male) },
          { label: "Female", value: num(g.female) },
        ]);
      }

      case "entity_tags": {
        const d = await insights({
          "filter.type": "urn:tag",
          "signal.interests.entities": params.entity,
          take: 50,
        });
        const tags = (d.results?.tags ?? []) as any[];
        // Drop place/restaurant genre tags ("American", "Shrimp Grits", "Three
        // Star") — persona tastes should read as culture, not a menu. Keep them
        // only if filtering leaves too few to meet coverage.
        const isPlace = (t: any) =>
          String(t.subtype ?? "").includes(":place") ||
          (t.types ?? []).includes("urn:entity:place") ||
          String(t.tag_id ?? "").includes(":place:");
        const cultural = tags.filter((t) => !isPlace(t));
        const chosen = cultural.length >= 20 ? cultural : [...cultural, ...tags.filter(isPlace)];
        // dedupe by name (case-insensitive) and title-case for display
        const seen = new Set<string>();
        const out: { name: string; affinity: number }[] = [];
        for (const t of chosen) {
          const key = String(t.name).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const name = String(t.name).replace(/\b\w/g, (c) => c.toUpperCase());
          out.push({ name, affinity: t.query?.affinity ?? t.popularity ?? 0 });
        }
        return ok(out);
      }

      case "where_popular": {
        // one heatmap call per metro; weight = audience footprint (point count),
        // normalised to 0..1. mean affinity is rank-normalised and doesn't
        // discriminate, but how many cells light up does.
        // run the per-metro heatmap calls concurrently (in bounded batches, to
        // stay friendly with rate limits) so the first load is seconds, not ~30s
        const counts: { name: string; n: number }[] = [];
        const BATCH = 8;
        for (let i = 0; i < METROS.length; i += BATCH) {
          const slice = METROS.slice(i, i + BATCH);
          const got = await Promise.all(
            slice.map(async (m) => {
              try {
                const d = await insights({
                  "filter.type": "urn:heatmap",
                  "filter.location.query": m,
                  "signal.interests.entities": params.entity,
                });
                return { name: m, n: (d.results?.heatmap ?? []).length };
              } catch {
                return { name: m, n: 0 };
              }
            }),
          );
          counts.push(...got);
        }
        const max = Math.max(1, ...counts.map((c) => c.n));
        return ok(counts.filter((c) => c.n > 0).map((c) => ({ name: c.name, affinity: c.n / max })));
      }

      case "recommend": {
        const q: Record<string, string | number> = {
          "filter.type": "urn:entity:" + String(params.target_type),
          "signal.interests.entities": params.entity,
          take: Number(params.take ?? 12),
        };
        if (params.location) q["filter.location.query"] = String(params.location);
        const d = await insights(q);
        return ok(
          (d.results?.entities ?? []).map((e: any) => ({
            name: e.name,
            affinity: e.query?.affinity ?? e.popularity ?? 0,
            id: e.entity_id,
          })),
        );
      }

      case "trends": {
        // Momentum is best-effort; a flat/absent series is reported as
        // "not measured", never guessed.
        return empty("not measured (live)");
      }

      default:
        return ok([], `no live mapping for ${workflow}`);
    }
  } catch (e: any) {
    const retryable = e?.httpStatus === 429 || e?.httpStatus >= 500;
    return errEnv(String(e?.message ?? e), retryable);
  }
}
