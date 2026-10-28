import type { Fingerprint, Stimulus, Persona, Reply } from "../qloo/types.js";
import { samplePanel } from "../panel/sampler.js";
import { runPanel, runFlat } from "../panel/respondent.js";
import { aggregate } from "../panel/aggregate.js";

/**
 * The "Without Qloo" ablation — the kill shot. The same stimulus runs through
 * two panels: one grounded in Qloo taste, one invented by an ungrounded model.
 * The grounded panel disagrees the way real cities do; the ungrounded one
 * collapses to a single bland opinion.
 */

export interface AblationSide {
  label: string;
  mean: number;
  pct45: number;
  metroVariance: number; // spread of per-metro means — the thing that collapses
  distinctReasons: number;
  hist: number[]; // % at each score 1..5
  topSplit: { top: string; topMean: number; bottom: string; bottomMean: number } | null;
}

export interface AblationResult {
  grounded: AblationSide;
  ungrounded: AblationSide;
}

export async function ablation(
  fp: Fingerprint,
  stimulus: Stimulus,
  n = 1000,
  seed = 42,
): Promise<AblationResult> {
  const { personas } = samplePanel(fp, n, seed);

  const groundedReplies = await runPanel(personas, stimulus, "mock", 7);
  const ungroundedReplies = runFlat(personas, 7);

  return {
    grounded: summarize("With Qloo", personas, groundedReplies),
    ungrounded: summarize("LLM only (no Qloo)", personas, ungroundedReplies),
  };
}

function summarize(label: string, personas: Persona[], replies: Reply[]): AblationSide {
  const agg = aggregate(personas, replies);
  const metroMeans = agg.byMetro.filter((m) => m.n >= 20).map((m) => m.mean);
  const sorted = agg.byMetro.filter((m) => m.n >= 20).sort((a, b) => b.mean - a.mean);
  const topSplit =
    sorted.length >= 2
      ? {
          top: sorted[0]!.metro,
          topMean: sorted[0]!.mean,
          bottom: sorted[sorted.length - 1]!.metro,
          bottomMean: sorted[sorted.length - 1]!.mean,
        }
      : null;

  const hist = [1, 2, 3, 4, 5].map(
    (s) => Math.round((replies.filter((r) => r.score === s).length / replies.length) * 100),
  );

  return {
    label,
    mean: agg.mean,
    pct45: agg.pct45,
    metroVariance: round3(variance(metroMeans)),
    distinctReasons: agg.reasons.length,
    hist,
    topSplit,
  };
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;
