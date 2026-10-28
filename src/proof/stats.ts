import { rng } from "../util/rng.js";

/** Ranks with ties averaged (1 = smallest). */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
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
  return den === 0 ? 0 : num / den; // a flat predictor (zero variance) scores 0
}

/** Spearman's rho = Pearson on the ranks. */
export const spearman = (a: number[], b: number[]): number => pearson(ranks(a), ranks(b));

/**
 * One-sided permutation p-value for rho > 0: how often shuffling the outcomes
 * gives a rho at least as high as the observed one. Seeded, so reruns agree.
 */
export function permutationP(a: number[], b: number[], iters = 5000, seed = 11): number {
  const observed = spearman(a, b);
  const rand = rng(seed);
  const shuffled = [...b];
  let atLeast = 0;
  for (let t = 0; t < iters; t++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    if (spearman(a, shuffled) >= observed - 1e-12) atLeast++;
  }
  return (atLeast + 1) / (iters + 1);
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
export const round2 = (x: number) => Math.round(x * 100) / 100;
export const round3 = (x: number) => Math.round(x * 1000) / 1000;
