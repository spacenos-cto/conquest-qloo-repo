import { createHash } from "node:crypto";
import type { Stimulus } from "../qloo/types.js";

/**
 * TRIBE v2 perception strip — the "brain" layer.
 *
 * ⚠ STUB. The real strip comes from Meta FAIR's TRIBE v2 (a trimodal brain
 * encoder) run on a GPU, and is CC BY-NC 4.0 (research use). Running it needs
 * the model weights + a GPU service (see docs/BUILD-SPEC.md §4). This stub
 * produces deterministic, plausibly-shaped response curves from the stimulus
 * text — one per cortical region — so the UI and verdict logic are real end to
 * end; swap in the GPU service to make the curves real. It shows predicted
 * attention/response, never liking, memorability or sales.
 */

export type Region = "visual" | "auditory" | "language" | "attention";

export interface TribeStrip {
  label: string;
  region: string;
  points: number[]; // 0..100 language-cortex response (kept for verdicts)
  regions: Record<Region, number[]>; // 0..100 per region, same time axis
  mean: number;
  deadZones: { start: number; end: number }[];
  note: string;
  licence: string;
  stub: boolean;
}

const N = 25;

/** One deterministic response curve: hash-seeded base, then a shape. */
function curve(text: string, salt: string, shape: (t: number) => number, lo = 40, span = 45): number[] {
  const h = createHash("sha256").update(salt + "|" + text).digest();
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const base = lo + (h[i % h.length]! / 255) * span;
    out.push(Math.round(Math.min(100, Math.max(0, base * shape(i / (N - 1))))));
  }
  return out;
}

export function tribeStrip(stim: Stimulus): TribeStrip {
  // language: long-setup sag in the middle third, lift toward the punch
  const language = curve(stim.text, "lang", (t) => (t > 0.3 && t < 0.62 ? 0.72 : t > 0.82 ? 1.25 : 1));
  // auditory: tracks delivery — steadier, small lift at the end
  const auditory = curve(stim.text, "aud", (t) => 0.85 + 0.25 * t, 45, 30);
  // visual: low for a spoken bit, a little higher at the open
  const visual = curve(stim.text, "vis", (t) => (t < 0.2 ? 1.0 : 0.7), 30, 30);
  // attention: dips with the sag, spikes at the payoff
  const attention = curve(stim.text, "att", (t) => (t > 0.34 && t < 0.6 ? 0.7 : t > 0.8 ? 1.3 : 0.95));

  const mean = language.reduce((a, b) => a + b, 0) / N;
  const deadZones: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const low = i < N && language[i]! < mean - 8;
    if (low && start < 0) start = i;
    if (!low && start >= 0) {
      if (i - start >= 2) deadZones.push({ start, end: i - 1 });
      start = -1;
    }
  }

  return {
    label: "TRIBE v2 · predicted cortical response",
    region: "language",
    points: language,
    regions: { visual, auditory, language, attention },
    mean: Math.round(mean),
    deadZones,
    note: "A generic brain, not this audience. Predicted attention/response only — not liking, memory or sales.",
    licence: "Meta FAIR TRIBE v2 — CC BY-NC 4.0, research use (stubbed here)",
    stub: true,
  };
}
