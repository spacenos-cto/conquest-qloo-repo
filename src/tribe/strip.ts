import { createHash } from "node:crypto";
import type { Stimulus } from "../qloo/types.js";

/**
 * TRIBE v2 perception strip — the "brain" layer.
 *
 * ⚠ STUB. The real strip comes from Meta FAIR's TRIBE v2 (a trimodal brain
 * encoder) run on a GPU, and is CC BY-NC 4.0 (research use). Running it needs
 * the model weights + a GPU service (see docs/BUILD-SPEC.md §4). This stub
 * produces a deterministic, plausibly-shaped response curve from the stimulus
 * text so the UI and verdict logic are real end to end; swap in the GPU service
 * to make the curve real. It shows predicted attention/response, never liking,
 * memorability or sales.
 */

export interface TribeStrip {
  label: string;
  region: string;
  points: number[]; // 0..100 predicted response over time/segments
  mean: number;
  deadZones: { start: number; end: number }[];
  note: string;
  licence: string;
  stub: boolean;
}

export function tribeStrip(stim: Stimulus): TribeStrip {
  const h = createHash("sha256").update(stim.text).digest();
  const N = 25;
  const points: number[] = [];
  for (let i = 0; i < N; i++) {
    const base = 40 + (h[i % h.length]! / 255) * 45;
    const t = i / (N - 1);
    // long-setup sag in the middle third, lift toward the end (the "punch")
    const shape = t > 0.3 && t < 0.62 ? 0.72 : t > 0.82 ? 1.25 : 1;
    points.push(Math.round(Math.min(100, base * shape)));
  }
  const mean = points.reduce((a, b) => a + b, 0) / N;

  const deadZones: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i <= N; i++) {
    const low = i < N && points[i]! < mean - 8;
    if (low && start < 0) start = i;
    if (!low && start >= 0) {
      if (i - start >= 2) deadZones.push({ start, end: i - 1 });
      start = -1;
    }
  }

  return {
    label: "TRIBE v2 · language cortex, predicted response",
    region: "language",
    points,
    mean: Math.round(mean),
    deadZones,
    note: "A generic brain, not this audience. Predicted attention/response only — not liking, memory or sales.",
    licence: "Meta FAIR TRIBE v2 — CC BY-NC 4.0, research use (stubbed here)",
    stub: true,
  };
}
