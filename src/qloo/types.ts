import { z } from "zod";

/**
 * Qloo harness result envelope (from the kit's MCP/CLI contract).
 * Every qloo exec / qloo mcp call returns this shape with one of six statuses.
 */
export const Envelope = z.object({
  status: z.enum(["ok", "empty", "needs_input", "partial", "degraded", "error"]),
  summary: z.string().optional(),
  results: z.array(z.any()).default([]),
  result_count: z.number().optional(),
  error: z
    .object({
      code: z.string(),
      retryable: z.boolean().optional(),
      recovery: z.string().optional(),
    })
    .optional(),
});
export type EnvelopeT = z.infer<typeof Envelope>;

/** A resolved Qloo entity we build a panel around. */
export interface Entity {
  id: string;
  name: string;
  type: string;
}

/** One ranked item returned by a taste workflow. */
export interface Ranked {
  name: string;
  affinity: number;
}

/** The audience fingerprint that feeds persona sampling. */
export interface Fingerprint {
  audience: Entity;
  demographics: [string, number][]; // [label, signed over-index]
  tags: string[]; // ranked, highest affinity first
  metros: Record<string, number>; // metro -> weight
  domains: Record<string, Ranked[]>; // artist/tv_show/brand/podcast/movie
  momentum: { status: "measured" | "not_measured"; note: string };
  coverage: Coverage;
  calls: number;
  /** Ledger ref (E#) for the call that produced each part — the receipt. */
  refs: Record<string, string>;
}

/** One sampled taste on a persona, with the receipt it came from. */
export interface Taste {
  value: string;
  domain: string; // tag | artist | tv_show | brand | podcast | movie
  ref: string; // ledger E# that produced this list
}

/** A synthetic respondent, sampled in code from the fingerprint. */
export interface Persona {
  id: number;
  metro: string;
  age: string;
  gender: "M" | "F";
  tastes: Taste[];
}

/** Something to test in front of the panel. */
export interface Stimulus {
  id: string;
  label: string;
  text: string;
  /** Tags/tastes this plays to (mock respondent boosts personas who hold them). */
  appeals?: string[];
  /** Per-metro score deltas (the regional reference effect, mock only). */
  regionalLift?: Record<string, number>;
  /** Reaction lines people actually say, by how much they liked it (mock only). */
  voices?: { love: string[]; meh: string[]; nope: string[] };
}

/** One respondent's reaction. */
export interface Reply {
  personaId: number;
  score: number; // 1..5
  reason: string;
  element: string; // which part of the stimulus drove it
}

export interface MetroStat {
  metro: string;
  mean: number;
  n: number;
}

export interface Aggregate {
  n: number;
  mean: number;
  pct45: number; // % scoring 4 or 5
  byMetro: MetroStat[];
  byAge: { age: string; mean: number; n: number }[];
  byGender: { gender: string; mean: number; n: number }[];
  reasons: { element: string; count: number }[];
  quotes: { text: string; persona: string }[];
  facts: Record<string, number>; // every number, for the claim checker
}

export interface Coverage {
  ok: boolean;
  reasons: string[]; // why it passed or failed, each line is a checked rule
}
