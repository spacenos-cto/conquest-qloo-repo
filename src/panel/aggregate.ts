import type { Persona, Reply, Aggregate, MetroStat } from "../qloo/types.js";

/** Turn 1,000 replies into the numbers the report shows. All in code. */
export function aggregate(personas: Persona[], replies: Reply[]): Aggregate {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const n = replies.length;
  const mean = avg(replies.map((r) => r.score));
  const pct45 = (replies.filter((r) => r.score >= 4).length / n) * 100;

  const byMetro = group(replies, (r) => byId.get(r.personaId)?.metro ?? "?")
    .map(([metro, rs]) => ({ metro, mean: avg(rs.map((r) => r.score)), n: rs.length }))
    .sort((a, b) => b.n - a.n);

  const byAge = group(replies, (r) => byId.get(r.personaId)?.age ?? "?")
    .map(([age, rs]) => ({ age, mean: avg(rs.map((r) => r.score)), n: rs.length }))
    .sort((a, b) => b.n - a.n);

  const byGender = group(replies, (r) => byId.get(r.personaId)?.gender ?? "?")
    .map(([gender, rs]) => ({ gender, mean: avg(rs.map((r) => r.score)), n: rs.length }));

  const reasons = group(replies, (r) => r.element)
    .map(([element, rs]) => ({ element, count: rs.length }))
    .sort((a, b) => b.count - a.count);

  const quotes = pickQuotes(personas, replies, byId);

  // Facts: every number the narrative is allowed to cite, for the claim checker.
  const facts: Record<string, number> = {
    score: round1(mean),
    pct45: Math.round(pct45),
    n,
  };
  for (const m of byMetro.filter((m) => m.n >= 20)) facts[key(m.metro)] = round1(m.mean);

  return { n, mean: round1(mean), pct45: Math.round(pct45), byMetro, byAge, byGender, reasons, quotes, facts };
}

/** The spread between the best and worst well-sampled metros — the city split. */
export function citySplit(agg: Aggregate, minN = 20): { top: MetroStat; bottom: MetroStat } | null {
  const eligible = agg.byMetro.filter((m) => m.n >= minN);
  if (eligible.length < 2) return null;
  const sorted = [...eligible].sort((a, b) => b.mean - a.mean);
  return { top: sorted[0]!, bottom: sorted[sorted.length - 1]! };
}

function pickQuotes(
  personas: Persona[],
  replies: Reply[],
  byId: Map<number, Persona>,
): { text: string; persona: string }[] {
  const sorted = [...replies].sort((a, b) => b.score - a.score);
  const picks = [
    ...sorted.slice(0, 3), // loudest fans
    ...sorted.slice(-3), // harshest
  ];
  const seenMetro = new Set<string>();
  const out: { text: string; persona: string }[] = [];
  for (const r of picks) {
    const p = byId.get(r.personaId)!;
    const tag = `#${p.id} · ${p.metro} · ${p.age} · ${p.tastes.slice(0, 2).map((t) => t.value).join(", ")}`;
    out.push({ text: `${capital(r.reason)} (${r.score}/5)`, persona: tag });
    seenMetro.add(p.metro);
  }
  return out.slice(0, 6);
}

// --- helpers ---
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function group<T>(items: T[], by: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = by(it);
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return [...m.entries()];
}
