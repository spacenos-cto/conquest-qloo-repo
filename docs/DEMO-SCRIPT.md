# Conquest — 2-minute jury demo

Two ways to run it:

- **Hands-free:** open `/?tour=1` (or press **Watch the 2-min tour** on the landing page). The game plays itself with captions in about 45 to 60 seconds, which leaves room to talk over it.
- **Live:** follow the beats below yourself. Same order, same lines.

Before you go on stage:

1. Start the server with the live cache: `REHEARSAL_DB=./conquest-live.sqlite npm run serve` (with `.env` loaded). The demo names (Jason Calacanis, Cedric the Entertainer, LA Dodgers) are prewarmed, so nothing waits on Qloo.
2. Open the page once and let it load the map, so fonts and state shapes are cached.
3. If you play live, clear the old save for the name you'll use (or click **New campaign** on the welcome-back screen).
4. Sound on: the game uses short synthesized cues.

## The beats (v2, about 60 seconds)

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing | "Creators guess where to grow. Conquest turns your audience into a map and an army of agents. It plays like a strategy game, and every move is a real one." |
| 0:08 | Type **Jason Calacanis**, then the scan | "Qloo finds you, then about a hundred live calls and a thousand simulated fans built from real taste data." |
| 0:15 | **What do you want in 8 weeks?** Book a tour, START WEEK 1 | "First you pick what you're playing for. A tour. That becomes the quest bar: six stops, each a real room on a real night." |
| 0:22 | Army rail: Booker, first chip; You, **Take <city>** | "Three orders a week. Every unit says what it does and what it brings back. The Booker finds a room; I march on the city that's ripe." |
| 0:30 | **END WEEK** | "Nothing moves until I press this." |
| 0:31 | The show: loot cards, the battle, the rival's move, the headline | "Live calls come back as loot: a real venue with its crowd fit and the email drafted, a fact with its receipt, and the map changes. The battle's odds come from real numbers. The rival answers. And a headline." |
| 0:45 | **Peek: what winning looks like** | "From week one you can see the prize: the tour pack. Route, nights, rooms, openers, sponsors, a calendar and every email." |
| 0:52 | **Share card** | "Share it, then go do the three real moves at the bottom of the week." |
| bonus | the menu, **Content X-ray** | "And it reads your real content: your last six videos, played to your fans and the brain model, with what to change." |

## If a judge asks

- **"Is the data real?"** Qloo (taste graph, venues, brands, podcasts, footprints), Google Trends, Wikipedia pageviews and Open-Meteo are live; every agent line in **Live calls** names its source. The 1,000 fans are simulated from Qloo data and labelled as such; the brain response is a stub of Meta's TRIBE model, also labelled.
- **"Who pays?"** Comedians, creators and their managers: $19 / $49 / $149 a month. A manager runs ten performers' campaigns at once.
- **"Why a game?"** Growth advice is easy to ignore. A weekly loop with a goal, an army, rivals and real moves turns it into a habit, and every END WEEK ends in a real action.
- **For Qloo's CTO:** each agent is one or two Qloo calls with a clear job; the whole campaign is about 100 calls and is cached in a ledger with receipts.
- **For Cedric:** play as yourself: the briefing shows your best city, your crowd's tastes and who you're really competing with for fans.

## Fallbacks

- If Qloo is slow, use a prewarmed name; they are instant from the cache.
- If a battle is lost live, say "the odds were real", then send the Room reader there (+30%) and strike again next week.
- If anything stalls, **Skip tour** and play it by hand from the same beat.
