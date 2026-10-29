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
    // appeals cover both the mock tags and the real Qloo tags for Cedric
    appeals: [
      "Church humor", "Southern culture", "Soul food", "Family comedy",
      "African American", "Stand Up Comedian", "Family Relationships",
      "Child-Oriented", "Uncensored", "Sitcom",
    ],
    // the reference lands in Black South/Midwest metros, less on the coasts —
    // covers whichever metros the live footprint populates
    regionalLift: {
      Atlanta: 0.9, Memphis: 0.9, "New Orleans": 0.8, Houston: 0.6, Charlotte: 0.6,
      Chicago: 0.6, Detroit: 0.6, Philadelphia: 0.5, Washington: 0.5, Dallas: 0.4,
      Baltimore: 0.5, Nashville: 0.3, "St. Louis": 0.4,
      Seattle: -1.1, Portland: -1.0, "Salt Lake City": -1.0, "San Francisco": -0.8,
      Denver: -0.5, Boston: -0.4, Minneapolis: -0.4,
    },
    voices: {
      love: [
        "That deacon with the whistle is my uncle. Forty minutes is right.",
        "Church parking IS a ministry. He's not even exaggerating.",
        "The collection-plate punchline got me — we've all sat through that.",
        "My auntie's church has this exact energy. I was crying.",
        "He earned that long setup. The payoff was worth it.",
        "This is Sunday after service, bottled. Perfect.",
      ],
      meh: [
        "Funny, but I saw the punchline coming.",
        "Solid. Not his hardest bit.",
        "Chuckled, didn't howl.",
        "Good, a little long in the middle.",
      ],
      nope: [
        "I was waiting for the joke, then I kept waiting.",
        "The setup ran way too long for me.",
        "Didn't grow up with this, so it sailed past me.",
        "Church humor just isn't my lane.",
      ],
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
    voices: {
      love: [
        "'Founders' is who we are. 'Entrepreneurs' is a LinkedIn word.",
        "The 'first hire shouldn't be a week of paperwork' line is exactly my pain.",
        "Sounds like a person, not an ad. I'd actually try Gusto.",
        "Payroll on day one is a real fear. This hits it dead on.",
        "Short, specific, no fluff. Good read.",
      ],
      meh: [
        "Fine. Say the price next time.",
        "Heard a dozen payroll ads — this one's okay.",
        "Clear enough, not memorable.",
        "Would skip, but wouldn't be annoyed.",
      ],
      nope: [
        "'This is your sign' — every ad opens that way now.",
        "Too salesy for my feed.",
        "I already have a payroll tool, so… meh.",
        "Didn't tell me anything new.",
      ],
    },
  },
  dodgers: {
    id: "dodgers-poster-a",
    label: "Poster A · face-led, Hispanic Heritage Night",
    text:
      "Hispanic Heritage Night. A huge Peso Pluma headshot, Dodgers blue and gold, " +
      "event name small at the bottom.",
    appeals: ["Regional Mexican", "Mexican-American culture", "Latin pop", "Family"],
    regionalLift: { "Los Angeles": 0.8, "San Antonio": 0.5, Phoenix: 0.4, "Las Vegas": 0.3 },
    voices: {
      love: [
        "That's Peso. I'm already buying tickets.",
        "Face-led, blue and gold — that's an event, not a flyer.",
        "Hispanic Heritage Night with Peso Pluma? Say less.",
        "My whole group chat would show up for this.",
        "Finally a poster that looks like it's for us.",
      ],
      meh: [
        "Cool, but where's the date? Had to look twice.",
        "Nice poster. I'd go anyway, honestly.",
        "Good, needs the lineup bigger.",
      ],
      nope: [
        "Reads like a flyer, not a headliner.",
        "Needs a lowrider in it, come on.",
        "Not my music — my cousins would love it though.",
        "The event name's too small to notice.",
      ],
    },
  },
};

export function neutralStimulus(text: string): Stimulus {
  return {
    id: "custom",
    label: "Custom stimulus",
    text,
    voices: {
      love: [
        "Yeah, this is for me.",
        "I'd actually share this.",
        "Lands. Feels made for my taste.",
        "Pleasantly surprised — would come back.",
      ],
      meh: ["It's fine.", "Seen better, seen worse.", "Wouldn't skip, wouldn't rave."],
      nope: ["Not really my thing.", "Didn't land for me.", "Feels generic.", "Wrong crowd for this."],
    },
  };
}

/** Pick the demo stimulus for an audience by name (works for mock ids and live
 *  UUIDs alike), or a neutral one. */
export function pickStimulus(audience: string | { name: string }): Stimulus {
  const name = (typeof audience === "string" ? audience : audience.name).toLowerCase();
  const slug =
    name.includes("cedric") ? "cedric"
    : name.includes("week in startups") || name.includes("twist") || name.includes("calacanis") ? "twist"
    : name.includes("dodger") ? "dodgers"
    : null;
  return (
    (slug && DEMO_STIMULI[slug]) ||
    neutralStimulus("A short, friendly promo for this audience, with no regional references.")
  );
}
