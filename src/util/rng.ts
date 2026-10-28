/** Small seeded PRNG (mulberry32) so a panel is reproducible run to run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise via Box–Muller, driven by a seeded uniform. */
export function gauss(rand: () => number, mean = 0, sd = 1): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Draw one index from weights (need not be normalized). */
export function categorical(weights: number[], rand: () => number): number {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let r = rand() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Sample k items without replacement, weighted. Returns the chosen items.
 * Weights are recomputed from the provided weight fn by current rank.
 */
export function sampleWithoutReplacement<T>(
  items: T[],
  weightAt: (rank: number) => number,
  k: number,
  rand: () => number,
): T[] {
  const pool = items.map((item, rank) => ({ item, w: weightAt(rank) }));
  const out: T[] = [];
  while (out.length < k && pool.length) {
    const i = categorical(
      pool.map((p) => p.w),
      rand,
    );
    out.push(pool[i]!.item);
    pool.splice(i, 1);
  }
  return out;
}
