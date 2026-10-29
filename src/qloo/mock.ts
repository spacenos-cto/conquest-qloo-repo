import type { EnvelopeT } from "./types.js";

/**
 * Mock Qloo backend. Returns the same envelope shape the real harness returns,
 * so resolve/fingerprint parse identically in mock and live. Lets the whole
 * pipeline run before the event API key arrives.
 *
 * NOTE: field mapping (name/affinity, label/value) matches the kit's documented
 * result shape at a high level. When the live key lands, confirm the exact JSON
 * from `qloo exec` and adjust parse points flagged in fingerprint.ts if needed.
 */

interface Case {
  type: string;
  demo: [string, number][];
  tags: string[];
  metros: [string, number][];
  artists: string[];
  shows: string[];
  brands: string[];
  podcasts: string[];
  films: string[];
  flatTrend: boolean;
}

const CASES: Record<string, Case> = {
  cedric: {
    type: "urn:entity:person",
    demo: [
      ["18–29", -0.22],
      ["30–44", 0.41],
      ["45–54", 0.33],
      ["55+", 0.06],
      ["Male", 0.31],
      ["Female", -0.31],
    ],
    tags: [
      "Stand-up comedy", "Sitcom", "R&B", "Neo soul", "Soul food", "Southern culture",
      "Family comedy", "Hip hop", "Barbershop culture", "Church humor", "HBCU",
      "Steppers", "Gospel", "Blues", "Comedy specials", "Sketch comedy", "Motown",
      "Cookout culture", "Sports talk", "Classic hip hop", "Funk", "Dramedy",
      "Variety shows",
    ],
    metros: [
      ["Atlanta", 0.96], ["Chicago", 0.91], ["Houston", 0.87], ["Dallas", 0.82],
      ["Memphis", 0.8], ["Washington", 0.78], ["Detroit", 0.76], ["Charlotte", 0.7],
      ["New Orleans", 0.68], ["Los Angeles", 0.64], ["New York", 0.6],
      ["Philadelphia", 0.58], ["St. Louis", 0.55], ["Baltimore", 0.52],
      ["Nashville", 0.45], ["Miami", 0.42], ["Raleigh", 0.4], ["Cleveland", 0.35],
    ],
    artists: ["Outkast", "Anita Baker", "Frankie Beverly & Maze", "Mary J. Blige",
      "Jill Scott", "Charlie Wilson", "Earth, Wind & Fire", "Kirk Franklin",
      "Erykah Badu", "The Isley Brothers"],
    shows: ["Martin", "The Neighborhood", "Barbershop", "Girls Trip", "Abbott Elementary",
      "The Steve Harvey Show", "Black-ish", "A Different World", "House Party", "Friday"],
    brands: ["Crown Royal", "Cadillac", "Waffle House", "McDonald's", "State Farm",
      "Walmart", "AT&T", "Popeyes", "Ford", "Wingstop"],
    podcasts: ["The Breakfast Club", "Club Shay Shay", "Drink Champs", "85 South Show",
      "The Pivot Podcast"],
    films: ["Coming to America", "Barbershop", "Friday", "The Original Kings of Comedy",
      "Soul Men"],
    flatTrend: true,
  },
  twist: {
    type: "urn:entity:podcast",
    demo: [
      ["18–29", -0.05],
      ["30–44", -0.2],
      ["45–54", 0.23],
      ["55+", -0.19],
      ["Male", 0.77],
      ["Female", -0.77],
    ],
    tags: [
      "Entrepreneurs", "Venture capital", "Technology", "Financial services",
      "Productivity", "Electronic", "Satire comedy", "Crypto", "Angel investing",
      "Podcasting", "SaaS", "Documentary", "Startups", "AI", "Fintech",
      "Investing", "Economics", "Business news", "Deep house", "Founder culture",
      "Product management", "Growth",
    ],
    metros: [
      ["San Francisco", 0.98], ["New York", 0.9], ["Los Angeles", 0.8],
      ["Seattle", 0.78], ["Boston", 0.76], ["Denver", 0.7], ["Chicago", 0.68],
      ["Washington", 0.64], ["Miami", 0.62], ["Salt Lake City", 0.6],
      ["Atlanta", 0.56], ["Dallas", 0.52], ["Portland", 0.5], ["Phoenix", 0.46],
      ["Minneapolis", 0.42], ["Raleigh", 0.42], ["Las Vegas", 0.4],
    ],
    artists: ["Lane 8", "Morgan Page", "3LAU", "Pierce Fulton", "Justin Jay",
      "ODESZA", "Rüfüs Du Sol", "Bonobo", "Tycho", "Kaskade"],
    shows: ["Axios on HBO", "The Social Dilemma", "Becoming Warren Buffett",
      "The Inventor", "Connected", "Shark Tank", "Silicon Valley", "Billions",
      "The Playbook", "StartUp"],
    brands: ["Medium", "Salesforce", "Square", "Notion", "Stripe", "Robinhood",
      "Coinbase", "Slack", "Airtable", "Tesla"],
    podcasts: ["All-In", "Acquired", "My First Million", "a16z Podcast",
      "Masters of Scale"],
    films: ["The Social Network", "Moneyball", "The Big Short", "Steve Jobs",
      "The Inventor"],
    flatTrend: false,
  },
  dodgers: {
    type: "urn:entity:brand",
    demo: [
      ["18–29", 0.12],
      ["30–44", 0.28],
      ["45–54", 0.1],
      ["55+", -0.2],
      ["Male", 0.4],
      ["Female", -0.4],
    ],
    tags: [
      "Baseball", "Los Angeles", "Mexican-American culture", "Regional Mexican",
      "Hip hop", "Sneakers", "Tacos", "Lowrider culture", "Family", "Streetwear",
      "Latin pop", "Sports talk", "West Coast", "Hype beast", "Reggaeton",
      "Basketball", "Boxing", "Barbecue", "Classic rock", "Car culture",
      "Fantasy sports", "Trading cards",
    ],
    metros: [
      ["Los Angeles", 1.0], ["San Francisco", 0.6], ["Las Vegas", 0.58],
      ["Phoenix", 0.55], ["San Antonio", 0.5], ["Houston", 0.48], ["Dallas", 0.46],
      ["New York", 0.44], ["Chicago", 0.42], ["Denver", 0.4],
      ["Salt Lake City", 0.36], ["Portland", 0.34], ["Seattle", 0.33],
      ["Miami", 0.3], ["Atlanta", 0.26], ["Washington", 0.24], ["Philadelphia", 0.22],
    ],
    artists: ["Bad Bunny", "Kendrick Lamar", "Peso Pluma", "Dr. Dre", "Becky G",
      "Snoop Dogg", "Ice Cube", "Eslabon Armado", "YG", "Banda MS"],
    shows: ["Entourage", "Narcos: Mexico", "Friday", "Moneyball", "Gentefied",
      "Vida", "On My Block", "All American", "Mayans M.C.", "The Last Dance"],
    brands: ["Nike", "Modelo", "Under Armour", "Jordan", "Corona", "Chevrolet",
      "Foot Locker", "In-N-Out", "New Era", "Hydro Flask"],
    podcasts: ["The Bill Simmons Podcast", "Fantasy Footballers", "Pardon My Take",
      "Baseball Tonight", "The Dan Patrick Show"],
    films: ["Friday", "Moneyball", "Training Day", "Blue Chips", "42"],
    flatTrend: false,
  },
};

const THIN: Case = {
  type: "urn:entity:artist",
  demo: [["30–44", 0.1], ["Male", 0.05]],
  tags: ["Indie", "Lo-fi", "Bedroom pop"],
  metros: [["Portland", 0.3], ["Austin", 0.25]],
  artists: ["Unknown A", "Unknown B"],
  shows: [],
  brands: [],
  podcasts: [],
  films: [],
  flatTrend: true,
};

/** Map many spellings of a name to a case slug. */
function slugFor(name: string): string | "thin" {
  const n = name.toLowerCase();
  if (n.includes("cedric")) return "cedric";
  if (n.includes("this week") || n.includes("twist") || n.includes("calacanis"))
    return "twist";
  if (n.includes("dodger")) return "dodgers";
  return "thin";
}

function caseFor(entityId: string): Case {
  const slug = entityId.replace(/^mock:/, "");
  return CASES[slug] ?? THIN;
}

/** Attach descending synthetic affinities to a name list. */
function aff(names: string[], top = 0.97, step = 0.03): { name: string; affinity: number }[] {
  return names.map((name, i) => ({
    name,
    affinity: Math.max(0.3, +(top - i * step).toFixed(2)),
  }));
}

const ok = (results: any[], summary = ""): EnvelopeT => ({
  status: "ok",
  summary,
  results,
  result_count: results.length,
});

export async function mockCall(
  workflow: string,
  params: Record<string, any>,
): Promise<EnvelopeT> {
  switch (workflow) {
    case "describe":
    case "resolve": {
      const slug = slugFor(String(params.name ?? ""));
      const c = slug === "thin" ? THIN : CASES[slug]!;
      return ok(
        [{ entity_id: `mock:${slug}`, name: params.name, type: c.type }],
        `resolved ${params.name}`,
      );
    }
    case "profile": {
      const slug = slugFor(String(params.name ?? ""));
      const c = slug === "thin" ? THIN : CASES[slug]!;
      return ok([
        { entity_id: `mock:${slug}`, name: params.name, type: c.type, popularity: slug === "thin" ? 0.1 : 0.9, image: null, bio: null, socials: [] },
      ]);
    }
    case "audience_demographics": {
      const c = caseFor(String(params.entity));
      return ok(c.demo.map(([label, value]) => ({ label, value })));
    }
    case "entity_tags": {
      const c = caseFor(String(params.entity));
      return ok(aff(c.tags, 0.99, 0.004));
    }
    case "where_popular": {
      const id = String(params.entity);
      if (id.startsWith("mock:cand:")) {
        // a rival in mock mode: a deterministic footprint over the same cities
        let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return ok(CASES.cedric!.metros.map(([name], i) => {
          const a = ((h >> (i % 13)) % 97) / 97;
          return { name, affinity: +a.toFixed(2), count: Math.round(a * 1400) };
        }));
      }
      const c = caseFor(id);
      return ok(c.metros.map(([name, affinity]) => ({ name, affinity, count: Math.round(affinity * 1500) })));
    }
    case "recommend": {
      const c = caseFor(String(params.entity));
      const t = String(params.target_type ?? "artist");
      const pick: Record<string, string[]> = {
        artist: c.artists,
        tv_show: c.shows,
        brand: c.brands,
        podcast: c.podcasts,
        movie: c.films,
        // partner pools for the "grow" action
        person: ["Anthony Anderson", "Nia Long", "Kym Whitley", "MC Lyte", "Regina King", "Larenz Tate"],
        place: ["Boogalou Lounge", "Krab Queenz", "Nouveau Bar & Grill", "Harold's Chicken", "The U Bar", "Suite Lounge"],
      };
      const list = pick[t] ?? [];
      return ok(aff(list).map((r, i) => ({ ...r, id: `mock:cand:${t}:${i}` })));
    }
    case "trends": {
      const c = caseFor(String(params.entity));
      return c.flatTrend
        ? { status: "ok", summary: "trend flat in the latest window", results: [], result_count: 0 }
        : ok([{ window: "24w", z: 0.51 }], "rising vs cohort");
    }
    default:
      return ok([], `mock: no fixture for ${workflow}`);
  }
}
