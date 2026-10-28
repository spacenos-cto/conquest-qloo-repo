import type { Persona, Stimulus, Reply } from "../qloo/types.js";
import { rng, gauss } from "../util/rng.js";

export type RespondentMode = "mock" | "live";

/**
 * Run the panel against a stimulus. One reply per persona.
 *
 *   mock — deterministic heuristic respondent. No API, no cost. Scores from
 *          taste overlap with the stimulus's appeals plus a per-metro regional
 *          effect and seeded noise. A stand-in for the real thing.
 *   live — Claude Haiku, one call per persona (persona card in, {score,reason,
 *          element} out). Costs Anthropic credits; gated behind ANTHROPIC_API_KEY
 *          and a concurrency limit. Not run until explicitly enabled.
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

// --- live backend (wired, not run until enabled) ---

async function runLive(personas: Persona[], stimulus: Stimulus): Promise<Reply[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Live respondent needs ANTHROPIC_API_KEY. This makes one Haiku call per persona " +
        "(1,000 by default) and costs credits — enable it deliberately.",
    );
  }
  const limit = Number(process.env.REHEARSAL_RESPONDENT_LIMIT ?? personas.length);
  const batch = personas.slice(0, limit);
  const concurrency = Number(process.env.REHEARSAL_CONCURRENCY ?? 8);

  const out: Reply[] = [];
  let i = 0;
  async function worker() {
    while (i < batch.length) {
      const p = batch[i++]!;
      out.push(await askHaiku(p, stimulus, key!));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

async function askHaiku(p: Persona, stimulus: Stimulus, key: string): Promise<Reply> {
  const card =
    `You are one audience member, not an assistant. ` +
    `You live in ${p.metro}, age band ${p.age}, ${p.gender === "M" ? "man" : "woman"}. ` +
    `You like: ${p.tastes.map((t) => t.value).join(", ")}. ` +
    `React ONLY as this person. Reply as JSON: ` +
    `{"score":1-5,"reason":"<=15 words","element":"which part drove it"}.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 120,
      temperature: 0.8,
      system: card,
      messages: [{ role: "user", content: `Here is what you're reacting to:\n\n${stimulus.text}` }],
    }),
  });
  const data: any = await res.json();
  const text = data?.content?.[0]?.text ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    /* fall through to defaults */
  }
  return {
    personaId: p.id,
    score: Math.max(1, Math.min(5, Math.round(Number(parsed.score) || 3))),
    reason: String(parsed.reason ?? "no reason given"),
    element: String(parsed.element ?? "overall"),
  };
}
