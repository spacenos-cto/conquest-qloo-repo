/**
 * Claim checker. Every number in a narrative must match a computed fact (within
 * tolerance). A sentence whose number has no backing fact is struck before it
 * ships — the Somm/Simpatico discipline: the model writes prose, code owns the
 * numbers.
 */

export interface CheckResult {
  kept: string[];
  struck: { text: string; reason: string }[];
}

export function checkClaims(
  narrative: string,
  facts: Record<string, number>,
  tol = 0.15,
): CheckResult {
  const values = Object.values(facts);
  const sentences = narrative
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const kept: string[] = [];
  const struck: { text: string; reason: string }[] = [];

  for (const s of sentences) {
    const nums = extractNumbers(s);
    if (nums.length === 0) {
      kept.push(s);
      continue;
    }
    const unbacked = nums.filter((n) => !values.some((v) => close(n, v, tol)));
    if (unbacked.length === 0) {
      kept.push(s);
    } else {
      struck.push({
        text: s,
        reason: `number${unbacked.length > 1 ? "s" : ""} ${unbacked.join(", ")} not backed by a computed fact`,
      });
    }
  }
  return { kept, struck };
}

/**
 * Only decimals (3.8) and percentages (63%) are treated as claims — these are
 * the figures our narratives assert. Bare small integers used as scale ("out of
 * 5", "4 or higher", "top 3") are not claims. Integer-rank claims (ranks #1 of
 * 10) are a later extension.
 */
function extractNumbers(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/(\d+)\s*%/g)) out.push(Number(m[1])); // percentages
  for (const m of s.matchAll(/\d+\.\d+/g)) out.push(Number(m[0])); // decimals
  return out;
}

/** A number backs a fact if it's within tol absolute, or 2% relative. */
function close(n: number, v: number, tol: number): boolean {
  return Math.abs(n - v) <= tol || Math.abs(n - v) <= Math.abs(v) * 0.02;
}
