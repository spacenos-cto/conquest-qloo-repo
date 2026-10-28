import { rng, gauss } from "../util/rng.js";

/**
 * The backtest — the number that answers "is this real, or LLM garnish?".
 *
 * Method (frozen before any run): take real brand-popularity splits by
 * age×gender, predict each cell two ways — Qloo-grounded (demographic signal)
 * and LLM-only (flat base rate, no demographic signal) — and report how well
 * each tracks reality (Pearson r, MAE), plus the misses.
 *
 * ⚠ The reference data here is a SEEDED SAMPLE, not real YouGov, and the
 * grounded prediction uses a stand-in demographic prior, not live Qloo. The
 * HARNESS is real and frozen; replace `sampleData()` with real YouGov pulls and
 * the grounded path with live Qloo demographics to get the citable figure.
 */

const BRANDS = [
  "Crocs", "Peloton", "Buick", "Patagonia", "Red Bull", "Dove",
  "Carhartt", "Sephora", "Dr Pepper", "New Balance", "Lululemon", "Jeep",
];
const CELLS = ["18–29|F", "18–29|M", "30–44|F", "30–44|M", "45–54|F", "45–54|M", "55+|F", "55+|M"];

export interface BrandResult {
  brand: string;
  cells: { cell: string; ref: number; grounded: number; llm: number }[];
}

export interface BacktestResult {
  frozenMethod: string;
  isSample: boolean;
  brands: BrandResult[];
  rGrounded: number;
  rLLM: number;
  maeGrounded: number;
  maeLLM: number;
  misses: { brand: string; cell: string; ref: number; grounded: number }[];
}

export function runBacktest(seed = 2026): BacktestResult {
  const rand = rng(seed);
  const brands: BrandResult[] = [];

  for (const brand of BRANDS) {
    // base popularity for this brand
    const base = 35 + Math.floor(rand() * 35); // 35–70%
    const cells = CELLS.map((cell) => {
      // the real demographic effect (what makes the split a split)
      const demoEffect = gauss(rand, 0, 12);
      const ref = clampPct(base + demoEffect + gauss(rand, 0, 3));
      // Qloo-grounded: recovers the demographic effect, with its own error
      const grounded = clampPct(base + demoEffect * 0.8 + gauss(rand, 0, 6));
      // LLM-only: no demographic signal — guesses the base for every cell
      const llm = clampPct(base + gauss(rand, 0, 2));
      return { cell, ref, grounded, llm };
    });
    brands.push({ brand, cells });
  }

  const all = brands.flatMap((b) => b.cells);
  const ref = all.map((c) => c.ref);
  const g = all.map((c) => c.grounded);
  const l = all.map((c) => c.llm);

  const misses = brands
    .flatMap((b) => b.cells.map((c) => ({ brand: b.brand, ...c })))
    .filter((c) => Math.abs(c.grounded - c.ref) > 10)
    .map(({ brand, cell, ref, grounded }) => ({ brand, cell, ref, grounded }));

  return {
    frozenMethod:
      "Predict each age×gender cell for 12 brands two ways (Qloo-grounded vs flat LLM-only), " +
      "score against reference splits with Pearson r and MAE. Method fixed before the run.",
    isSample: true,
    brands,
    rGrounded: round2(pearson(g, ref)),
    rLLM: round2(pearson(l, ref)),
    maeGrounded: round1(mae(g, ref)),
    maeLLM: round1(mae(l, ref)),
    misses,
  };
}

// --- stats ---
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den; // flat predictor (zero variance) -> 0
}
function mae(a: number[], b: number[]): number {
  return mean(a.map((x, i) => Math.abs(x - b[i]!)));
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const clampPct = (x: number) => Math.max(1, Math.min(99, Math.round(x)));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
