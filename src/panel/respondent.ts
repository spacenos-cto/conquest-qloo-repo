import type { Persona, Stimulus, Reply } from "../qloo/types.js";
import { rng, gauss } from "../util/rng.js";
import { z } from "zod/v4";
import { ask } from "../ai/llm.js";

export type RespondentMode = "mock" | "live";

/**
 * Run the panel against a stimulus. One reply per persona.
 *
 *   mock — deterministic heuristic respondent. No API, no cost. Scores from
 *          taste overlap with the stimulus's appeals plus a per-metro regional
 *          effect and seeded noise. A stand-in for the real thing.
 *   live — Claude (the AI layer's model), 25 persona cards per call. Costs
 *          credits; only when the AI layer is on (CONQUEST_AI=claude + key), under
 *          its budget cap, with every answer cached.
 */
export async function runPanel(
  personas: Persona[],
  stimulus: Stimulus,
  mode: RespondentMode = "mock",
  seed = 7,
): Promise<Reply[]> {
  if (mode === "live") return runLive(personas, stimulus);
  return runMock(personas, stimulus, seed);
}

const LUKEWARM = [
  "didn't quite land for me",
  "fine, not memorable",
  "I've heard this kind of thing before",
  "not really my world",
  "took too long to get there",
];

/**
 * Ungrounded respondent — the "without Qloo" baseline. Ignores the stimulus's
 * appeals and regional effect and the persona's tastes entirely: everyone
 * reacts the same, from no cultural signal. Produces the collapse the ablation
 * shows (near-zero city variance, one bland reason).
 */
export function runFlat(personas: Persona[], seed = 7): Reply[] {
  const rand = rng(seed);
  return personas.map((p) => {
    const score = Math.max(1, Math.min(5, Math.round(3.4 + gauss(rand, 0, 0.4))));
    return {
      personaId: p.id,
      score,
      reason: LUKEWARM[Math.floor(rand() * LUKEWARM.length)]!,
      element: "overall",
    };
  });
}

function runMock(personas: Persona[], stimulus: Stimulus, seed: number): Reply[] {
  const rand = rng(seed);
  const appeals = new Set((stimulus.appeals ?? []).map((a) => a.toLowerCase()));
  const lift = stimulus.regionalLift ?? {};

  return personas.map((p) => {
    const matched = p.tastes.filter((t) => appeals.has(t.value.toLowerCase()));
    const base = 3.1;
    const appealBoost = Math.min(matched.length, 2) * 0.7;
    const regional = lift[p.metro] ?? 0;
    const noise = gauss(rand, 0, 0.5);
    let score = base + appealBoost + regional + noise;
    score = Math.max(1, Math.min(5, Math.round(score)));

    // element = which part drove it (for the "what drove it" clusters)
    let element = "overall";
    if (matched.length) element = matched[0]!.value;
    else if (regional < -0.4) element = "reference";

    // reason = what this person would actually say, by how much they liked it
    const v = stimulus.voices;
    let reason: string;
    if (v) {
      const bank = score >= 4 ? v.love : score === 3 ? v.meh : v.nope;
      reason = bank.length ? bank[(p.id * 7 + score) % bank.length]! : "no comment";
    } else {
      reason = LUKEWARM[Math.floor(rand() * LUKEWARM.length)]!;
    }
    return { personaId: p.id, score, reason, element };
  });
}

// --- live backend: Claude, through the AI layer (budget-capped, cached) ---

const ReplySchema = z.object({
  replies: z.array(z.object({
    id: z.number().describe("the persona id you were given"),
    score: z.number().describe("1 to 5: how much this person likes it"),
    reason: z.string().describe("what they'd say, in their own words, 15 words max"),
    element: z.string().describe("one of that person's listed tastes the reaction hinged on, or 'overall'"),
  })),
});
const BATCH = 25;

/**
 * Real reactions: 25 personas per call (each a card built from Qloo data),
 * so a 1,000-person panel is 40 small calls instead of 1,000. A batch that
 * fails (budget, refusal, parse) falls back to the mock respondent for those
 * people, so a panel always completes.
 */
async function runLive(personas: Persona[], stimulus: Stimulus): Promise<Reply[]> {
  const limit = Number(process.env.REHEARSAL_RESPONDENT_LIMIT ?? personas.length);
  const people = personas.slice(0, limit), batches: Persona[][] = [];
  for (let i = 0; i < people.length; i += BATCH) batches.push(people.slice(i, i + BATCH));
  const system =
    "You simulate audience members, one at a time, each from a card built from real taste data. " +
    "You are not an assistant. React only as each listed person would, from their city, age and tastes. " +
    "Different people disagree: be honest, including bored or negative reactions.";
  const out: Reply[] = [];
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const b = batches[next++]!;
      const cards = b.map((p) => `#${p.id} · ${p.metro} · ${p.age} · ${p.gender === "M" ? "man" : "woman"} · likes: ${p.tastes.map((t) => t.value).join(", ")}`).join("\n");
      try {
        const r = await ask("panel", { system, schema: ReplySchema, maxTokens: 6000, user: `What they're reacting to:\n\n${stimulus.text}\n\nThe people:\n${cards}\n\nOne reply per person, by id.` });
        const byId = new Map(r.replies.map((x) => [x.id, x]));
        for (const p of b) {
          const x = byId.get(p.id);
          if (!x) { out.push(...runMock([p], stimulus, p.id)); continue; }
          const tastes = new Set(p.tastes.map((t) => t.value));
          out.push({ personaId: p.id, score: Math.max(1, Math.min(5, Math.round(x.score))), reason: x.reason.slice(0, 160), element: tastes.has(x.element) ? x.element : "overall" });
        }
      } catch {
        out.push(...runMock(b, stimulus, b[0]!.id));
      }
    }
  }
  await Promise.all(Array.from({ length: Number(process.env.REHEARSAL_CONCURRENCY ?? 5) }, worker));
  return out.sort((a, b) => a.personaId - b.personaId);
}
