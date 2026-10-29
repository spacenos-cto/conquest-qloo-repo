# Conquest — 2-minute jury demo

Two ways to run it:

- **Hands-free:** open `/?tour=1` (or press **Watch the 2-min tour** on the landing page). The game plays itself with captions in about 75 seconds, which leaves room to talk over it.
- **Live:** follow the beats below yourself. Same order, same lines.

Before you go on stage:

1. Start the server with the live cache: `REHEARSAL_DB=./conquest-live.sqlite npm run serve` (with `.env` loaded). The demo names (Jason Calacanis, Cedric the Entertainer, LA Dodgers) are prewarmed, so nothing waits on Qloo.
2. Open the page once and let it load the map, so fonts and state shapes are cached.
3. If you play live, clear the old save for the name you'll use (or click **New campaign** on the welcome-back screen).
4. Sound on: the game uses short synthesized cues.

## The beats

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing: twilight sky, Campaign Pass | "Creators guess where to grow. Conquest turns your audience into a map and gives you agents that do the legwork. It plays like a strategy game, and every move is a real one." |
| 0:10 | Click **Play as Jason Calacanis** | "Type any name. Qloo finds you with your photo and socials." *(Jason, this is you.)* |
| 0:18 | Scan checklist | "About a hundred live Qloo calls and a thousand simulated fans built from real taste data." |
| 0:25 | **Starting new campaign** | "Your powers come from your data: your best city starts prepared. Your rivals are who your fans also follow: here, David Sacks, Garry Tan, Justin Kan." |
| 0:35 | The map | "Violet is your ground. Rivals hold the rest. The clock is running: eight weeks." |
| 0:42 | Recruit the **Booker**, click it, click the target city | "Agents are units. The Booker marches on the clock, then calls Qloo for the right stage in that city." *(Point at the Live calls log: real venue, crowd fit %.)* |
| 0:58 | **Execute** the next move | "Take the city. It floods violet." |
| 1:03 | Open **Real moves** | "And it becomes a real mission for the week: book that venue. Tick it when you've done it and the game pays you. That's the point: the game is the to-do list." |
| 1:12 | Radar + rival portrait | "The radar sees a rival marching on your city days ahead. Fortify, strike first, or parley." |
| 1:20 | **Strike** → battle | "Odds come from real numbers: your fans and hype against their footprint and their Wikipedia momentum." |
| 1:30 | **Parley** with an ally | "Or turn the rival into a co-headliner. It finds the smallest offer that works and writes the pitch." |
| 1:40 | **End week** | "Sunday: income lands, rivals strike, next week's missions are waiting. Come back next week and the campaign remembers you." |
| 1:50 | **Share** card | "Share your campaign. Then go do the real missions." |
| bonus | **🎬 X-ray** (top bar, or click the crowd brain) | "And it reads your real content. Jason, these are All-In's last six videos: real views, how your fans' taste reacts, where attention sags in the brain, and what to change. It even tells you when taste fit isn't what's driving your views." *(Prefilled with @allin for Jason. Any channel @handle works.)* |

## If a judge asks

- **"Is the data real?"** Qloo (taste graph, venues, brands, podcasts, footprints), Google Trends, Wikipedia pageviews and Open-Meteo are live; every agent line in **Live calls** names its source. The 1,000 fans are simulated from Qloo data and labelled as such; the brain response is a stub of Meta's TRIBE model, also labelled.
- **"Who pays?"** Comedians, creators and their managers: $19 / $49 / $149 a month. A manager runs ten performers' campaigns at once.
- **"Why a game?"** Growth advice is easy to ignore. A weekly loop with rivals, a clock and real missions turns it into a habit, and every turn ends in a real action.
- **For Qloo's CTO:** each agent is one or two Qloo calls with a clear job; the whole campaign is about 100 calls and is cached in a ledger with receipts.
- **For Cedric:** play as yourself: the briefing shows your best city, your crowd's tastes and who you're really competing with for fans.

## Fallbacks

- If Qloo is slow, use a prewarmed name; they are instant from the cache.
- If a battle is lost live, say "the odds were real", then **Retreat** or prepare the city with an agent and try again.
- If anything stalls, **Skip tour** and play it by hand from the same beat.
