# Conquest: every feature, as built (Oct 29)

**Conquest is a growth agent for comedians, creators and performers, played like a Rise of Nations strategy game.** Your real audience (from Qloo's taste graph) is the map, and every move in the game is a real growth move: a city to play, a venue to book, a sponsor to pitch, a collab to propose, a post to make.

- **Built for:** working comedians, podcasters, musicians and creators. Also managers, agencies, venues and teams.
- **Business model:** contact-us / enterprise (mail venky@spacenos.com). Public prices were removed.
- **Run it:** `npm run serve`, then open http://localhost:5173. It loads `.env` automatically, so Qloo runs live.

---

## 1. Landing page

| Feature | What it does |
|---|---|
| **Opening scene** | A Creation-of-Adam style painting: a comedian with a mic and a crowd with phones, fingertips about to touch. Four beats: "Your fans are already out there." → "City by city, waiting to be won." → "Go conquer them." → **CONQUEST**. Gentle zoom, "You 🎤" and "Your crowd 👑" stickers, a spark and flash on the touch. Plays on every visit. |
| **Opening sound** | Made in the browser: a "ta-dum", a swell, then a "ba-dum-tss" rimshot on the touch. Browsers mute pages until the first tap, so the first tap turns sound on and replays the scene; the second tap skips it. |
| **Hero** | "Your audience is a map. Go conquer it." Free instant campaign card with **Play as** Jason Calacanis / Cedric the Entertainer / the LA Dodgers, "type your own name", and **watch the jury tour**. |
| **Sections** | The problem, the USP, who it's for, who pays (no prices), the product, your army (agent faces), what you get each week, know-what-lands-before-you-post, rivals, comparison against alternatives, Contact us, the end call-to-action ("Start your Conquest"). |
| **Nav** | Why us · Who it's for · Product · Value · Compare · Contact us, plus **Get Enterprise** (mails venky@spacenos.com) and **Start your Conquest**. |
| **Live touches** | A starfield, a 3D point-cloud brain behind sections, a live "trending now" toast from Google Trends, coordinates in the footer. |

## 2. Getting in

1. **Who are you?**
   - Type a name; Qloo finds the person, artist, podcast, show or team, with photo and verified socials.
   - It handles typos: "tailor swift" gives **Did you mean Taylor Swift?**
   - Not on Qloo? **Build your own**: pick acts your audience is like.
2. **Scan ("Scouting your territory"):**
   - Seven live steps: found you · reading your audience · checking what's trending · simulating 1,000 fans · battle-testing your material · spotting rivals and allies · planning your campaign.
   - Stays up at least 8 seconds so people can read it.
3. **Campaign briefing:** a versus screen with you vs your nemesis (the rival who shares the most fans), possible allies, the goal with a progress bar, your home city, what your crowd loves and your treasury.
4. **Welcome back:**
   - Shown when you return: next-goal bar, tiles (cities, buzz, gold, agents, real moves) and a returning bonus.
   - Lists your real missions to tick off ("Did you do these for real?").
   - Continue or start a new campaign.

## 3. The game screen

| Area | What it does |
|---|---|
| **Map** | The US by state. Each city shows your real fan count (Qloo). Every state is shaded by its nearest city in play: yours, a rival's, an ally's or open. Uncharted states are striped ("send a Scout"). |
| **Goal bar** | One slim line: "Goal: win 40% of your fans by week 8", with a progress bar. Click it for where you stand and what a week means. |
| **World clock** | 8 weeks per campaign, about 90 seconds per week, stepping by the hour. Pause and fast-forward use line icons. At Sunday midnight gold comes in and rivals attack. |
| **AI strategist** | Closed by default: a single best-move button. Open it for **Now / Do / Why**, timed opportunities and **Simulate my whole plan**. With the AI on, Claude's plan replaces the rules-based one (section 6). |
| **Opportunities** | Timed offers built from live data, about 3 real minutes each: a trend wave (Google Trends), a fan meetup in your best city, a brand that wants a sponsored post (Qloo), a performer booking an opener. |
| **Top bar** | Buzz ⚡ (moves per week), Hype (how hard your material hits), Gold 🪙 (agents and walls). One **⭐ Stats** button (cities held, allies, agents, score). Real moves · X-ray · Share · Simple/Full view · help · sound · exit. |
| **Right column** | The world clock, the **Radar** minimap (incoming rivals; click a blip for that rival, anywhere else for the threat report), **Crowd brain** (click to open) and **Live calls** (every API call the agents make, with sources). |
| **Rival faces** | Real performers your fans also follow. The badge says Calm / Attacking / Under siege. Click a face for the **rival card**: their line, fame, cities they hold, this week, if-you-wait, and Defend / Walls / Strike / Deal. |
| **Full / Simple view** | Opens in Full view. Simple view hides the brain, live calls, scoreboard and legend, and shows only your hired agents plus a few to hire. The choice is remembered once you switch. |
| **Bottom bar** | Agent army · next move (or the selected unit or city) · End week. |
| **Tutorial** | Six steps for first-timers: your ground, your first move, a rival moving, the three resources, agents, real moves. |

## 4. The 12 agents (each calls real data)

Send an agent to a city (click it then a city, or drag it onto the map). It marches on the clock, does its job on arrival (once per week), and earns while stationed in a city you hold. Its card says what it does, **what you get**, **what it does in the game** and its **last report**.

| Agent | Real job | You get |
|---|---|---|
| Scout | What your fans in a city also love (Qloo) | Things to mention there |
| Booker | The venue whose crowd fits yours (Qloo places) | A room to book, plus a backup |
| Diplomat | A performer whose fans would like you (Qloo overlap) | A partner, and a deal screen with a DM |
| Sponsor scout | A brand your fans love (Qloo) | A sponsor paying gold weekly, and a pitch email |
| Herald | A podcast your fans listen to (Qloo) | A guest spot |
| Room reader | Simulated fans in that city react, fan by fan | Who loved it and who didn't |
| Trend hunter | What's trending in that state (Google Trends) | A topic to post on |
| Weather oracle | 7-day forecast (Open-Meteo) | The best dry show night (and a calendar entry) |
| Spy | Rivals' fame and momentum (Wikipedia pageviews) | Who attacks next |
| Copywriter | Writes a post for that city | A ready-to-post caption |
| Showrunner | Plans a whole show night in a city you hold | A night plan, +gold |
| Listener | Reddit (locked until connected) | What fans say about you |

## 5. Rivals, battles and deals

1. **Rivals move every week:** they pick one of your cities to attack, and you see them coming days ahead (radar, threat report, rival card). If you do nothing, a 2-week siege starts.
2. **Battles are a night in five rounds:**
   - Fan base (Qloo counts)
   - The material (your fan panel's rating there)
   - Momentum (Wikipedia)
   - Groundwork (your agents, walls and intel)
   - The night (the only luck)
   48 fans in the middle switch sides round by round. The result says **why you won** (or why they held) and the real move to make.
3. **Deals:** three offers (shout-out swap, co-headline, open for them) with odds, plus a pitch you can copy. With the AI on, Claude writes the DM.
4. **Rivals talk:** speech boxes with their portrait and lines tied to real events: attacking, sieges, walls, battle results, Wikipedia momentum. Your simulated fans also speak a real panel quote when you win their city.

## 6. Content X-ray (your real content)

1. **Reads your real YouTube channel:** the public feed, your last 6 videos, real view counts. It auto-finds your channel.
2. **Plays each video to your 1,000 fans and the brain model:**
   - **How the brain reacted:** an anatomical brain lit by region (visual, auditory, language, attention), plus dips in attention.
   - **How 1,000 fans reacted:** a hate-to-love split, a fan quote, and what they reacted to.
   - **What would happen**, and **what to change**.
3. **Honesty check:** compares predictions with real views per day, and says when views follow news hooks rather than taste.
4. **Test your next post:** paste a title or script and get a prediction.
5. **Other platforms:** Instagram, TikTok and X are shown and need a connected account.

## 7. Real-world value

1. **Real moves:** every executed order becomes a real mission. Tick it off and the game pays you.
2. **Calendar export:** show nights go into an .ics file for Google or Apple Calendar.
3. **Copy my battle plan:** the whole plan as text.
4. **Share card:** a 1200×630 image of your campaign.
5. **Weekly return:** autosave, and missions carry over when you come back.

## 8. AI layer (built; on only when hosted)

| Piece | What it does |
|---|---|
| **Switch** | `CONQUEST_AI=claude` + `ANTHROPIC_API_KEY` turns it on. Off on localhost, where templates run and nothing is spent. |
| **Model and spending cap** | `claude-haiku-5-5` by default. Every answer is cached in sqlite. Every call is priced into a spend ledger, and at `AI_BUDGET_USD` (default $15) it switches itself off. |
| **1,000 fans** | 25 persona cards per call (built from Qloo), answering in their own words; falls back to rules per batch. |
| **AI strategist** | A real tool-use agent with tools for Qloo audience taste, Google Trends, Open-Meteo, Wikipedia fame and "test a line on the fans". It returns a plan with sources, and the strategist's button follows its first step. |
| **Writer agents** | Copywriter post, Diplomat DM, Sponsor pitch email. |
| **X-ray advice** | One concrete change per video. |
| **API** | `POST /api/agent/strategist`, `/api/agent/write`, `/api/agent/xray`; `GET /api/ai` (mode, model, spend, cap). |
| **Tests** | Run against a fake model, so they never spend credits. |

## 9. Data and trust

1. **Qloo:** about 100 calls per campaign, each logged with receipts in the ledger.
   - It refuses to simulate an audience Qloo can't see (e.g. Todd Boehly himself).
   - Sample answers can no longer leak into the live cache.
2. **Other live sources:** Google Trends RSS, Wikipedia pageviews, Open-Meteo and YouTube RSS. All are free and keyless.
3. **Labelled as simulated:** the 1,000-fan panel (rules locally, Claude when hosted), the brain model (a stand-in shaped like Meta's TRIBE v2) and rival moves (simulated from their real data).

## 10. Demo and pitch

1. **Jury tour:** `?tour=1` or the landing button. 12 beats in about 75 seconds: the briefing, moving an agent, a real move, the radar, a battle, a deal, the X-ray, the week's end and the share card.
2. **Pitch tests on the judges' audiences:** [docs/JURY-REHEARSAL.md](JURY-REHEARSAL.md).
   - Jason: 26% → 58% with "every creator is a startup".
   - The Dodgers' crowd (for Boehly): 26% → 49%.
   - J.J. Abrams: 23% → 54%.
   - Cedric: 28% → 36%.
3. **Demo script:** [docs/DEMO-SCRIPT.md](DEMO-SCRIPT.md).

---

## Ideas to test with Claude / Grok (not built yet)

1. **Live-AI quality:** compare the strategist's plan from Claude Haiku 5.5 with a bigger model on the same board; check that it cites real numbers and never invents any.
2. **The fans' own words:** do 1,000 AI fans disagree the way real crowds do? Compare the city splits with the rule-based fans and with real view counts.
3. **A voice for rivals:** AI-written, in-character lines from the rival's real public persona (careful with impersonation).
4. **Instagram / TikTok X-ray:** once accounts can be connected.
5. **Weekly email:** "your 3 moves this week" sent to the performer from their saved campaign.
6. **Team mode for managers:** one map per performer, compared side by side.
