# Conquest: your fans are out there. Go find them.

**A strategy game for a stand-up comedian deciding which city to play next. The
map is your real audience from Qloo's taste graph, five agents do the legwork
with live data, and every move in the game is a real move you make this week.**

## In numbers

| | |
|---|---|
| **1 click** | from the landing page to a live campaign ("Play as Cedric / Jason / the Dodgers"), no sign-up |
| **~100 Qloo calls** | per campaign, each one logged with a receipt you can open |
| **1,000 fans** | simulated per audience, sampled in code from Qloo's demographics, tastes and cities |
| **5 agents** | Scout, Booker, Sponsor scout, Diplomat, Room reader: each runs live calls (Qloo, Google Trends, Wikipedia, Open-Meteo, YouTube) |
| **$0** | data cost beyond Qloo: every other source is free and keyless, and the AI layer stays off unless hosted |
| **57 / 57** | tests passing; the jury tour plays 7 beats in 37 seconds |
| **ρ −0.94** | how wrong we were on Jason Calacanis's last 6 videos. We publish it (see "Where we were wrong") |

## Inspiration

> **[YOUR TRUE STORY: 3 lines. Who you saw struggle to find their audience (you, a
> friend, a comic you know), the moment it hurt, and why a game and not a
> dashboard. Real names and places beat a composite. Delete this box when done.]**

A comedian with 50,000 followers still picks the next city the way it was done
twenty years ago: gut feel, a promoter who "owes you one," and hope. The data
that would answer it exists (where your fans live, what else they love, which
room fits them), but nobody below headliner level can afford the strategist who
reads it. So we made the strategist a game you already know how to play.

## What it does

Built for one person first: **a working stand-up comedian with a regional
following who wants to book a six-city run and not play to empty rooms.**

1. **Type your name.** Qloo finds you, your audience's cities, tastes and
   demographics. Not enough data on you? It refuses to simulate and says so.
2. **Pick what you want in 8 weeks:** book a tour, land sponsors, break into a
   new city, or fill your calendar with collabs. Each gives four missions, one
   every two weeks, named with your real cities.
3. **Give orders, then press END WEEK.** Send the Scout to Chicago and it comes
   back with what your Chicago fans love that the city overall doesn't ("#1 for
   your fans · not in the city's top 20. Without Qloo you'd have pitched X").
   The Booker returns a room whose crowd fits yours and the driest Friday. The
   Room reader plays your bit to that city's 1,000 fans before you're on stage.
4. **Rivals are real.** The performers your fans also follow are on the map with
   their real Wikipedia momentum. When one marches on your city you see it a
   week ahead: build walls, strike first, or send the Diplomat and turn them
   into your co-headliner.
5. **Winning is the deliverable:** the tour pack (route, six nights, rooms,
   openers, sponsors, calendar file, a one-page City Brief per city, the emails).

**Every loot card shows its receipts**, e.g. "2 Qloo calls · 1 Google Trends ·
0 claims removed". A source that comes back empty counts as a removed claim:
no data, no guess.

## You stay in charge

Conquest **drafts, you send.** Agents write the venue email, the sponsor pitch
and the collab DM; nothing is posted, sent or booked without you. A real move
only counts once you tick it off yourself, and the game pays you XP for doing it
in real life, not for clicking.

## How we built it

- **Qloo through the official harness** (`qloo exec` / `qloo mcp`), server-side
  only. `describe` resolves you; `audience_demographics`, `entity_tags`,
  `where_popular` and `recommend` build the audience the 1,000 fans are sampled
  from; Qloo places and brands × city drive the Booker and Sponsor scout; a
  second, city-only call gives the "what the city likes" baseline. Ranks are
  compared, never raw affinities, because Qloo rescales affinity per response.
- **Other live sources, all free:** Google Trends (what's breaking in a state),
  Wikipedia pageviews (rival momentum), Open-Meteo (dry show nights), YouTube's
  public feed (your real videos for the X-ray).
- **Code decides, models write.** Odds, routes, ranks and scores are computed in
  TypeScript; the optional Claude layer (`claude-haiku-5-5`, hard spend cap,
  every answer cached) only writes DMs, pitches and fan quotes, and it can't add
  or drop a city from a plan (checked in code).
- TypeScript + Node, no framework; sqlite for the evidence ledger and caches;
  an MCP server so other agents can call the same tools.

## Where we were wrong (and what it taught us)

We replayed the judges' own past: their last 6 real YouTube videos, scored by
their 1,000 simulated fans **before** we looked at the views.

- **Jason Calacanis (All-In):** we got it backwards (ρ −0.94). The news roundup
  drew 4× the views per day of any interview, and his fans scored it lowest.
  The lesson isn't hidden: reach follows the news, love follows taste. The
  game's next move for him is to put the news hook on the interviews.
- **LA Dodgers:** every title scored the same, 3.1 of 5, because hashtag titles
  name nothing Dodgers fans love. The internet still picked the Shohei pun (3×
  the average).
- **Cedric the Entertainer:** YouTube's feed for his channels was down when we
  ran it, so there's no replay. We didn't fill the gap.

## Honest limits

- **No paying users yet.** This is a hackathon build; we make no revenue claim.
- **The 1,000 fans are simulated** from aggregate Qloo tastes: not people, not a
  ticket forecast, never a claim about an individual. On localhost they're
  rule-based (taste overlap); hosted, Claude voices them.
- **The "brain" strip is a stand-in** shaped like Meta's TRIBE v2, labelled
  low-confidence everywhere it appears.
- **Rival moves are simulated** from the rivals' real data.
- **No personal data goes to Qloo**, only names of performers, cities, venues
  and brands.

## What's next

1. A real comedian's real run: plan it in Conquest, then compare booked rooms
   and sell-through with the plan.
2. The Room reader's "this line misses in Seattle, swap it for this" rewrite.
3. A public proof page from the YouTube backtest harness, losses included.

## Try it

Landing page → **Play as Cedric the Entertainer** (or Jason Calacanis, or the
LA Dodgers). Or `?tour=1` for the 37-second jury tour.
Code: this repo (MIT). `npm install && npm run serve` → http://localhost:5173.
