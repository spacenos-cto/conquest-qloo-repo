import type { QlooGateway } from "../qloo/gateway.js";
import type { Fingerprint } from "../qloo/types.js";

/**
 * The "grow" action: who should this creator/brand barter with to gain NEW
 * followers? Not the usual max-overlap sponsor match — for a swap you want the
 * Goldilocks middle: enough shared taste that the other crowd will cross over,
 * enough difference that they're actually new to you.
 *
 *   convert = how much the anchor's audience over-indexes on the partner
 *             (they'll accept the shout-out)                      [Qloo recommend]
 *   overlap = audience taste overlap (shared tags)                [Qloo tags, Jaccard]
 *   netnew  = 1 - overlap  (the reach you'd actually gain)
 *   barter  = convert × netnew × bell(overlap)   — peaks at partial overlap
 */

export interface Partner {
  name: string;
  id?: string;
  kind: string;
  convert: number;
  overlap: number;
  netnew: number;
  barter: number; // 0..100
  why: string;
}

const KIND_TARGET: Record<string, string> = { people: "person", venues: "place", brands: "brand" };

export async function findPartners(
  g: QlooGateway,
  fp: Fingerprint,
  runId: string,
  kind = "people",
  location?: string,
): Promise<Partner[]> {
  const target = KIND_TARGET[kind] ?? "person";
  const anchorTags = new Set(fp.tags.map(norm));

  const rec = await g.call(
    "recommend",
    { entity: fp.audience.id, target_type: target, take: 12, ...(location ? { location } : {}) },
    runId,
  );
  const cands = (rec.results ?? []).filter((c: any) => c.name).slice(0, 10);

  const partners = await Promise.all(
    cands.map(async (c: any): Promise<Partner> => {
      let overlap = pseudoOverlap(c.name); // fallback (mock, or no id)
      if (c.id && !String(c.id).startsWith("mock:")) {
        try {
          const t = await g.call("entity_tags", { entity: c.id }, runId);
          const ctags = new Set((t.results ?? []).map((x: any) => norm(x.name)));
          if (ctags.size) overlap = jaccard(anchorTags, ctags);
        } catch {
          /* keep fallback */
        }
      }
      const convert = clamp01(c.affinity ?? 0);
      const netnew = 1 - overlap;
      const barter = Math.round(100 * convert * netnew * bell(overlap));
      return {
        name: c.name,
        id: c.id,
        kind,
        convert: round2(convert),
        overlap: round2(overlap),
        netnew: round2(netnew),
        barter,
        why: whyLine(kind, overlap, netnew),
      };
    }),
  );

  return partners.sort((a, b) => b.barter - a.barter);
}

function whyLine(kind: string, overlap: number, netnew: number): string {
  const noun = kind === "venues" ? "room" : kind === "brands" ? "brand's customers" : "crowd";
  const pct = Math.round(netnew * 100);
  if (overlap > 0.6) return `Nearly the same ${noun} — little new reach from a swap.`;
  if (overlap < 0.15) return `A very different ${noun} — huge potential reach, but a thin taste bridge.`;
  return `Shared taste to convert, and ~${pct}% of their ${noun} is new to you — a clean swap.`;
}

// --- helpers ---
const norm = (s: string) => s.toLowerCase().trim();
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// bell curve peaking at 0.4 overlap — the Goldilocks zone for growth-by-barter
function bell(o: number): number {
  return Math.exp(-((o - 0.4) ** 2) / (2 * 0.18 ** 2));
}

// deterministic stand-in overlap when we can't fetch a candidate's tags (mock)
function pseudoOverlap(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 0.2 + (h % 1000) / 1000 * 0.45; // 0.20 .. 0.65
}
