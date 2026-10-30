# Devpost copy: paste field by field

## Project name
Conquest

## Tagline
Your fans are out there. Go find them.

## Elevator pitch (≤200 characters)
A strategy game where the map is your real audience. Five AI agents scout cities, book rooms and find sponsors with live Qloo data. Every move in the game is a real move for your week.

---

## About the project

### Inspiration

I've built everything I've ever built alone. No mentor, no manager, no cousin at a label. Just me, a laptop, and a growth strategy best described as "post and pray."

Most creators I know are in the same boat. The data that says where your fans live and what they love already exists. The strategist who can read it costs more than your rent.

So I built the strategist myself, and made it a game, because I will open a game every Monday. I won't open a dashboard. **I'm user #1.** I'm running my own campaign on Conquest every week from now on, and I'll post the real numbers, good or embarrassing.

Also: I joined late. Very late. Conquest went from first commit to a working game in about a day and a night. The git log starts Oct 29 at 00:57, and it gets emotional around 3 a.m.

### What it does

Type your name. Qloo finds your real audience, and it becomes a map: your cities, your rivals' cities, and the fog you haven't explored yet.

1. **Pick a goal for the next 8 weeks:** book a tour, land sponsors, break into a new city, or fill your calendar with collabs.
2. **Give orders to five agents.** They have zero attitude and never ask for a raise:
   - **Scout:** what your fans in a city love that the city doesn't. ("Beats: #1 for your Memphis fans, not in Memphis's top 20. Without Qloo you'd have pitched the Grizzlies.")
   - **Booker:** the room whose crowd fits yours, on the driest Friday.
   - **Sponsor scout:** a brand your fans over-index on, plus the pitch email.
   - **Diplomat:** turns a rival into your co-headliner.
   - **Room reader:** plays your bit to 1,000 simulated fans in that city before you bomb in front of real ones.
3. **Press END WEEK.** Your army marches, comes back with loot cards (real data, real receipts), and your nemesis makes their move. Rivals are real performers your fans also follow, with real Wikipedia momentum and very fake trash talk.
4. **Win, and the prize is your actual plan:** a six-city route, rooms, nights, sponsors, a calendar file and the emails.

**It drafts. You send.** Nothing gets posted, booked or emailed without you. We're ambitious, not reckless.

### How I built it

- **Qloo** through the official harness, server-side: who your fans are, where they live, what else they love, which venues and brands fit. About 100 calls per campaign, and every one has a receipt you can click.
- **Free live data:** Google Trends, Wikipedia pageviews, Open-Meteo weather and YouTube's public feed. No paid APIs needed to play.
- **Code decides, AI writes.** Odds, routes and rankings are plain TypeScript. The optional Claude layer only writes the DMs and pitches, and it isn't allowed to add a city to your tour.
- TypeScript and Node, no framework, sqlite, 57 tests passing, deployed on Railway.

### Where I was wrong (on purpose, in public)

I replayed the judges' own YouTube channels: their last 6 videos, scored by 1,000 simulated fans before I looked at the views.

- **Jason Calacanis (All-In):** I got it exactly backwards. Not a little bit. ρ −0.94. The news roundup got 4× the views and his fans liked it least. Lesson: reach follows the news, love follows taste. Fix: put the news hook on the interviews.
- **LA Dodgers:** every title scored the same, because "#nlcs #dodgers" tells a fan nothing. The internet still picked the Shohei pun (3× average).

A tool that's never wrong is lying to you.

### Challenges

- Qloo tags audiences by race and religion too. My rival bot once taunted Cedric with one of those tags. That got fixed fast: rivals now insult your home city, like civilised people.
- Qloo rescales scores in every response, so I compare ranks, never raw numbers.
- Making a strategy game simple enough to understand in 10 seconds. I cut 12 agents down to 5 and it got better.

### What I learned

The data was never the hard part. The hard part is getting someone to act on it every week. Games already solved that.

### What's next (and what funding buys)

If Conquest wins or gets funded, step one is paying for Qloo. Step two is sleep. Then:

1. **Real proof:** my own campaign plus 10 working comedians, comparing the plan against real ticket sales.
2. **Every platform:** TikTok, Instagram, X and Reddit, so the map knows what you actually post.
3. **Booking for real:** a venue inbox, sponsor deal tracking and co-bill payouts, all inside the game.
4. **Multiplayer:** managers running ten performers at once, and real players forming real alliances.
5. **A phone app** that sends your Monday war report: three moves, five minutes, done.
6. **Beyond comedy:** podcasters, musicians and sports teams. Play as the LA Dodgers today to see it already works.

### Honest limits

- No paying users yet. It's a one-day-old game with big feelings.
- The 1,000 fans are simulated from aggregate Qloo tastes: not real people, not a ticket forecast.
- The brain chart is a stand-in model, and it's labelled low-confidence everywhere it appears.
- No personal data goes to Qloo, only names of performers, cities, venues and brands.

---

## Built with
qloo · qloo-mcp · typescript · node.js · sqlite · google-trends · wikipedia · open-meteo · youtube · claude · mcp · railway

## Try it out
- Live: **[paste the Railway URL]**. Click **Play as Cedric the Entertainer** for a campaign in one click.
- Code: **[paste the GitHub repo URL]**
- Jury tour: add `?tour=1` to the live URL (37 seconds).
