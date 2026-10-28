import type { Fingerprint, Persona, Taste } from "../qloo/types.js";
import { rng, categorical, sampleWithoutReplacement } from "../util/rng.js";

/**
 * Build the panel: N synthetic respondents drawn, in code, from the audience
 * fingerprint. No model touches this step. Each persona's traits carry the
 * ledger ref of the Qloo call they were sampled from.
 */

// US adult population shares by band (ACS, rounded). Committed as a constant so
// the draw is auditable; Qloo's over-index tilts these, it doesn't replace them.
const AGE_BASE: Record<string, number> = {
  "18–29": 0.21,
  "30–44": 0.26,
  "45–54": 0.16,
  "55+": 0.37,
};

const METRO_GAMMA = 2.2; // concentrates the draw toward higher-affinity metros

// How many of each domain each persona carries.
const TASTE_PLAN: { domain: string; k: number }[] = [
  { domain: "tag", k: 3 },
  { domain: "artist", k: 2 },
  { domain: "tv_show", k: 1 },
  { domain: "podcast", k: 1 },
  { domain: "brand", k: 2 },
];

export interface PanelResult {
  personas: Persona[];
  composition: { age: string; n: number }[];
}

export function samplePanel(fp: Fingerprint, n = 1000, seed = 42): PanelResult {
  const rand = rng(seed);

  // --- metro distribution ---
  const metros = Object.entries(fp.metros).filter(([, w]) => w > 0);
  const metroWeights = metros.map(([, w]) => Math.pow(w, METRO_GAMMA));

  // --- age distribution: base share * (1 + over-index) ---
  const over = Object.fromEntries(fp.demographics);
  const ageBands = Object.keys(AGE_BASE);
  const ageWeights = ageBands.map(
    (b) => AGE_BASE[b]! * (1 + (over[b] ?? 0)),
  );

  // --- gender ---
  const pMale = 0.5 * (1 + (over["Male"] ?? 0));
  const pFemale = 0.5 * (1 + (over["Female"] ?? 0));

  // --- taste pools by domain ---
  const pools: Record<string, { names: string[]; ref: string }> = {
    tag: { names: fp.tags, ref: fp.refs.tags ?? "?" },
  };
  for (const d of ["artist", "tv_show", "brand", "podcast", "movie"]) {
    pools[d] = {
      names: (fp.domains[d] ?? []).map((x) => x.name),
      ref: fp.refs[d] ?? "?",
    };
  }

  const rankW = (rank: number) => 1 / (rank + 2); // rank-weighted draw

  const personas: Persona[] = [];
  const ageCount: Record<string, number> = {};

  for (let id = 1; id <= n; id++) {
    const metro = metros[categorical(metroWeights, rand)]![0];
    const age = ageBands[categorical(ageWeights, rand)]!;
    const gender: "M" | "F" = rand() * (pMale + pFemale) < pMale ? "M" : "F";

    const tastes: Taste[] = [];
    for (const { domain, k } of TASTE_PLAN) {
      const pool = pools[domain];
      if (!pool || pool.names.length === 0) continue;
      const picks = sampleWithoutReplacement(pool.names, rankW, k, rand);
      for (const value of picks) tastes.push({ value, domain, ref: pool.ref });
    }

    personas.push({ id, metro, age, gender, tastes });
    ageCount[age] = (ageCount[age] ?? 0) + 1;
  }

  const composition = ageBands.map((age) => ({ age, n: ageCount[age] ?? 0 }));
  return { personas, composition };
}
