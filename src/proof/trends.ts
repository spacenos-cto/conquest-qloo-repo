import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Fingerprint } from "../qloo/types.js";
import { spearman, permutationP, round2, round3 } from "./stats.js";

/**
 * Google Trends metro check: does Qloo's "where they are" agree with where
 * people search for the audience? An outside check on the numbers that set
 * where the 1,000 personas live.
 *
 * Input is the CSV Google Trends exports by hand (Explore → term → United
 * States → "Interest by subregion" → Metro → download). No scraping, no key.
 * Method: Spearman rho between Qloo where_popular affinity and Trends
 * interest over the metros both name; refuse below 6 shared metros.
 */

export const TRENDS_FILE = "data/trends-check.json";
const MIN_SHARED = 6;

export interface TrendsRow {
  dma: string;
  metro: string;
  value: number;
}

export interface TrendsCheck {
  audience: string;
  term: string;
  window: string;
  checkedAt: string;
  shared: number;
  testable: boolean;
  reason?: string;
  rho?: number;
  p?: number;
  topQloo: string[];
  topTrends: string[];
  overlapTop5: number;
  biggestGaps: { metro: string; qlooRank: number; trendsRank: number }[];
  qlooOnly: string[];
}

/** "Dallas-Ft. Worth TX" → "Dallas"; "Washington DC (Hagerstown MD)" → "Washington". */
export function dmaToMetro(dma: string): string {
  let s = dma.replace(/\([^)]*\)/g, " ").trim();
  s = s.split("-")[0]!.trim();
  while (/\s[A-Z]{2}$/.test(s)) s = s.slice(0, -3).trim();
  return s;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/\bft\.?\s/g, "fort ").replace(/\bst\.?\s/g, "saint ").replace(/[^a-z]+/g, " ").trim();

/** Parse a Google Trends "Interest by metro" CSV export. "<1" counts as 0.5. */
export function parseTrendsCsv(csv: string): { term: string; window: string; rows: TrendsRow[] } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const split = (l: string) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  let term = "";
  let window = "";
  const rows: TrendsRow[] = [];
  for (const line of lines) {
    if (!line.includes(",")) continue;
    const f = split(line);
    const dma = f[0] ?? "";
    const raw = f[f.length - 1] ?? "";
    if (/^(<1|\d+)$/.test(raw) && dma) {
      rows.push({ dma, metro: dmaToMetro(dma), value: raw === "<1" ? 0.5 : Number(raw) });
    } else if (!rows.length && raw) {
      const m = /^(.*?):\s*\((.*)\)\s*$/.exec(f.slice(1).join(","));
      term = m ? m[1]!.trim() : raw;
      window = m ? m[2]!.trim() : "";
    }
  }
  return { term, window, rows };
}

export function compareMetros(fp: Fingerprint, csv: string, now = new Date()): TrendsCheck {
  const t = parseTrendsCsv(csv);
  const trendsBy = new Map(t.rows.map((r) => [norm(r.metro), r]));
  const qloo = Object.entries(fp.metros).filter(([, w]) => w > 0);
  const shared = qloo.filter(([m]) => trendsBy.has(norm(m)));

  const topQloo = [...qloo].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m);
  const topTrends = [...t.rows].sort((a, b) => b.value - a.value).slice(0, 5).map((r) => r.metro);
  const overlapTop5 = topQloo.filter((m) => topTrends.some((x) => norm(x) === norm(m))).length;
  const qlooOnly = qloo.filter(([m]) => !trendsBy.has(norm(m))).map(([m]) => m);

  const base = {
    audience: fp.audience.name,
    term: t.term,
    window: t.window,
    checkedAt: now.toISOString(),
    shared: shared.length,
    topQloo,
    topTrends,
    overlapTop5,
    qlooOnly,
  };
  if (shared.length < MIN_SHARED)
    return { ...base, testable: false, reason: `only ${shared.length} metros appear in both (need ${MIN_SHARED})`, biggestGaps: [] };

  const q = shared.map(([, w]) => w);
  const g = shared.map(([m]) => trendsBy.get(norm(m))!.value);
  const rankOf = (xs: number[]) => {
    const order = xs.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const rq = rankOf(q);
  const rg = rankOf(g);
  const biggestGaps = shared
    .map(([m], i) => ({ metro: m, qlooRank: rq[i]!, trendsRank: rg[i]! }))
    .filter((x) => x.qlooRank !== x.trendsRank)
    .sort((a, b) => Math.abs(b.qlooRank - b.trendsRank) - Math.abs(a.qlooRank - a.trendsRank))
    .slice(0, 3);

  return { ...base, testable: true, rho: round2(spearman(q, g)), p: round3(permutationP(q, g)), biggestGaps };
}

export async function saveTrendsCheck(slug: string, r: TrendsCheck, file = TRENDS_FILE) {
  const all = await loadTrendsChecks(file);
  all[slug] = r;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(all, null, 2));
}

export async function loadTrendsChecks(file = TRENDS_FILE): Promise<Record<string, TrendsCheck>> {
  const txt = await readFile(file, "utf8").catch(() => null);
  return txt ? JSON.parse(txt) : {};
}
