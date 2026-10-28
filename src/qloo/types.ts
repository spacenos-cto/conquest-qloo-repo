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
}

export interface Coverage {
  ok: boolean;
  reasons: string[]; // why it passed or failed, each line is a checked rule
}
