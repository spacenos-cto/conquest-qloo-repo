import type { Stimulus } from "../qloo/types.js";

/**
 * Demo stimuli per judge case. The mock respondent reads `appeals` (tags the
 * bit plays to) and `regionalLift` (the reference effect by metro). With the
 * live Haiku respondent these hints are ignored — the model reads the text.
 */
export const DEMO_STIMULI: Record<string, Stimulus> = {
  cedric: {
    id: "cedric-church",
    label: "Bit · the long church setup",
    text:
      "So my auntie's church has a parking ministry now. Forty minutes to tell you " +
      "about the parking ministry. Deacon with a whistle. And the punch, when it " +
      "finally lands, is about the collection plate.",
    appeals: ["Church humor", "Southern culture", "Soul food", "Family comedy"],
    regionalLift: {
      Atlanta: 0.9,
      Memphis: 0.7,
      Houston: 0.5,
      Charlotte: 0.5,
      Chicago: 0.3,
      Seattle: -1.1,
      Portland: -0.9,
      "San Francisco": -0.7,
    },
  },
  twist: {
    id: "twist-read-b",
    label: "Sponsor read B · 'founders'",
    text:
      "Founders: the first hire shouldn't mean a week of HR paperwork. Gusto does " +
      "payroll, benefits and onboarding so you can get back to building.",
    appeals: ["Entrepreneurs", "Startups", "SaaS", "Founder culture"],
    regionalLift: { "San Francisco": 0.6, "New York": 0.4, Seattle: 0.3, Boston: 0.3 },
  },
  dodgers: {
    id: "dodgers-poster-a",
    label: "Poster A · face-led, Hispanic Heritage Night",
    text:
      "Hispanic Heritage Night. A huge Peso Pluma headshot, Dodgers blue and gold, " +
      "event name small at the bottom.",
    appeals: ["Regional Mexican", "Mexican-American culture", "Latin pop", "Family"],
    regionalLift: { "Los Angeles": 0.8, "San Antonio": 0.5, Phoenix: 0.4, "Las Vegas": 0.3 },
  },
};

export function neutralStimulus(text: string): Stimulus {
  return { id: "custom", label: "Custom stimulus", text };
}
