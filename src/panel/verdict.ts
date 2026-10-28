import type { Aggregate } from "../qloo/types.js";
import type { TribeStrip } from "../tribe/strip.js";

/**
 * Verdict cards: the two receipts per segment side by side.
 *   brain  — TRIBE perception (did a generic brain respond here?)
 *   panel  — Qloo preference (does this audience like it?)
 * Agree → ship. Disagree → that's the finding.
 */
export interface Verdict {
  segment: string;
  brain: "up" | "flat";
  panel: "fit" | "misfit";
  call: "ship" | "finding";
  note: string;
}

export function makeVerdicts(agg: Aggregate, tribe: TribeStrip): Verdict[] {
  const rows: Verdict[] = [];
  const brainEndsUp = tribe.points[tribe.points.length - 1]! > tribe.mean;
  const overallPanel: "fit" | "misfit" = agg.mean >= 3.6 ? "fit" : "misfit";

  rows.push({
    segment: "Overall",
    brain: brainEndsUp ? "up" : "flat",
    panel: overallPanel,
    call: brainEndsUp && overallPanel === "fit" ? "ship" : "finding",
    note: `mean ${agg.mean.toFixed(1)}, ${agg.pct45}% rated 4–5`,
  });

  if (tribe.deadZones.length) {
    rows.push({
      segment: "Setup / mid-section",
      brain: "flat",
      panel: overallPanel,
      call: "finding",
      note: `brain response sags in ${tribe.deadZones.length} stretch(es) — tighten`,
    });
  }

  for (const s of agg.reasons.filter((r) => r.element !== "overall").slice(0, 2)) {
    rows.push({
      segment: s.element,
      brain: "up",
      panel: "fit",
      call: "ship",
      note: `${s.count} reactions cited this`,
    });
  }

  const worst = [...agg.byMetro].filter((m) => m.n >= 20).sort((a, b) => a.mean - b.mean)[0];
  if (worst) {
    rows.push({
      segment: `${worst.metro} reception`,
      brain: "flat",
      panel: worst.mean >= 3.6 ? "fit" : "misfit",
      call: "finding",
      note: `${worst.metro} scored ${worst.mean.toFixed(1)} — ${worst.mean < 3.6 ? "softest room" : "still with it"}`,
    });
  }

  return rows;
}
