# Conquest

**Your fans are out there. Go find them.**

A strategy game for performers deciding where to grow. The map is your real
audience from Qloo's taste graph, five agents do the legwork with live data, and
every move in the game is a real move you make this week: a room to book, a
sponsor to pitch, a collab to propose, a post to make.

Built for the [Qloo Agentic Hackathon](https://qloo-hackathon.devpost.com/) (2026).

## What it does

1. **Type a name.** Qloo finds the performer and their audience: cities, tastes,
   demographics. Too little data? It refuses to simulate and says so.
2. **Pick what you want in 8 weeks:** book a tour, land sponsors, break into a
   new city, or fill your calendar with collabs. That becomes your quest and
   four missions, named with your real cities.
3. **Give orders, then press END WEEK.** Five agents (Scout, Booker, Sponsor
   scout, Diplomat, Room reader) run live calls and come back with loot cards:
   a real fact, its receipts, what changed on the map, and the real move it
   created. For example: *"Cadillac: #1 for your fans · not in Chicago's top 20
   overall. Without Qloo you'd have pitched Art Institute of Chicago."*
4. **Rivals are real.** The performers your fans also follow are on the map,
   with their real Wikipedia momentum. Battles are five rounds decided by real
   numbers, plus one roll of the dice.
5. **Winning is the deliverable:** the tour pack (route, nights, rooms, openers,
   sponsors, a calendar file, City Briefs, the emails), or the sponsor, new-city
   or collab pack.

The game drafts; you send. Nothing is posted, booked or emailed for you.

## Try it

- **One click:** on the landing page, *Play as Cedric the Entertainer*, *Jason
  Calacanis* or *the LA Dodgers* opens straight on a live map.
- **The 40-second jury tour:** open `/?tour=1`.
- **Your own name:** *or type your own name →*.

## Data sources (all live, all with receipts)

| Source | Used for |
|---|---|
| **Qloo** (taste graph, via the hackathon API) | the audience, its cities and tastes, venues and brands × city, rival footprints, the city-only baseline |
| **1,000-fan panel** | simulated fans sampled in code from Qloo data (labelled *simulated from Qloo*) |
| **Google Trends** | what's rising in a state |
| **Wikipedia pageviews** | rivals' fame and momentum |
| **Open-Meteo** | dry show nights |
| **YouTube Data API** (optional) | the content X-ray and the backtest |

Every loot card counts its calls, e.g. *2 Qloo calls · 1 Google Trends · 0
claims removed*. A source that comes back empty counts as a removed claim: no
data, no guess.

## Run it

Needs Node 22.13 or newer.

```bash
git clone https://github.com/spacenos-cto/conquest-qloo-repo.git
cd conquest-qloo-repo
npm install
cp .env.example .env      # then set QLOO_MODE=live and QLOO_API_KEY for live data
npm start                 # http://localhost:5173
```

Without a key it runs in **mock mode** (`QLOO_MODE=mock`), end to end.

| Variable | What it does |
|---|---|
| `QLOO_MODE` | `live` or `mock` |
| `QLOO_API_KEY`, `QLOO_BASE_URL` | the Qloo hackathon API (keep the key out of git) |
| `REHEARSAL_DB` | where the Qloo response cache lives (e.g. `./conquest-live.sqlite`) |
| `PUBLIC_URL` | the hosted address, for links in the Monday email |
| `CONQUEST_AI=claude`, `ANTHROPIC_API_KEY` | optional Claude agents (off by default; capped by `AI_BUDGET_USD`) |
| `YOUTUBE_API_KEY` | optional, for the X-ray and the YouTube backtest |

Other commands:

```bash
npm test                  # unit tests (node:test)
npm run typecheck         # tsc --noEmit
npm run mcp               # the MCP server (stdio)
npm run backtest-youtube  # real-world backtest on public YouTube data
```

## Deploy

Railway (or any Node host): `railway.json` starts `npm start` and checks
`/api/ai`. The server binds `PORT`, and in live mode it prewarms the demo names
on boot. The browser never calls Qloo directly: all calls stay server-side.

## Layout

```
public/
  index.html        landing page + the game's markup and styles
  app.js            the game: map, army, END WEEK show, packs, coach, jury tour
  rules.js          pure rules (levels, orders, objectives, missions, quest, headline, saves)
src/
  server.ts         HTTP server and /api routes
  qloo/             gateway (cache, retry, ledger), live + mock backends, fingerprint
  service/engine.ts audience, panel, campaign, partners, the city baseline
  conquest/         Tour Planner, City Briefs, Monday email, signals (Trends, Wikipedia, weather)
  ai/               optional Claude agents (strategist, writers), budget-capped
  mcp.ts            MCP server
tests/              node:test suites
docs/               FEATURES, DEVPOST write-up, demo script, the v2 plan
```

## Rules we hold

- Only aggregate Qloo affinities. No personal data is ever sent to Qloo.
- Results describe what groups tend to like, never an individual.
- Qloo responses are cached privately and never committed to this repo.
- Ranks, not raw affinities, are compared across calls (affinity is rescaled per response).
- Thin coverage → refuse, don't guess.

MIT licensed. Conquest started life as *Rehearsal*, a 1,000-fan focus group; that
panel now powers the Room reader and battles. The TRIBE brain layer is a labelled
stub of Meta FAIR's model (CC BY-NC 4.0, research use).
