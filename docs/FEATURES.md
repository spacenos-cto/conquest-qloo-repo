# Conquest: every feature, as built (Oct 30, v2)

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
| **Nav** | Why us · Who it's for · Product · Value · Compare · Tour Planner · Contact us, plus **Get Enterprise** (mails venky@spacenos.com) and **Start your Conquest**. |
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

## 3. The game screen (v2: turn-based, no clock)

| Area | What it does |
|---|---|
| **Screen 0: objective** | Before week 1: **What do you want in 8 weeks?** Four cards: Book a tour · Land sponsors · Break into a new city (pick one of your 5 biggest cities you don't hold) · Fill my calendar. Each shows its four missions (one per two weeks, named with your real cities), your army for it, how you win, and who's in your way. **Change nemesis** lists the rivals Qloo found; a bigger name attacks 2 weeks out of 3 but is worth +50% XP ("giant slayer"). |
| **Top bar** | You, `Week N of 8`, your level (Open Mic → Club Circuit → Theater Tour → Arena Headliner → Legend) and XP to the next one · the **quest bar** (6 tour stops, 3 sponsors, 4 parts of the new city or 5 DMs; click it for the missions sheet and **Change objective**) · gold and income · **orders left** · help · Full view · a `···` menu (Real moves, Tour Planner, X-ray, Share, Threat report, sound, exit). |
| **Map** | Three colours in Simple view: yours, the nemesis (red), open. Your tour route in violet with gold numbers on booked stops, dashed green march lines for this week's orders, the rival's attack labelled "HITS <city> AT END WEEK", venue / sponsor / walls badges, "UNCHARTED · SEND A SCOUT", an always-on legend, and a fan strip with a real panel quote. Hover a city: what each unit would bring back from it. Click a city with a unit selected to order it there. |
| **Army rail** | **You** plus five agents from week 1 (Scout, Booker, Sponsor scout, Diplomat, Room reader); Lv III gives each a second power. Each row says **Does** and **Brings back**. Click a unit: 3 target chips (4 from Lv II), each with what you'd get; the AI strategist moves its pick first when it's on. **All-in** chips on rival cities and sponsor pitches: 2 orders + 100 gold for a 30% shot (40% at Lv IV) at three times the prize. Weekly **offers** (trend wave, fan meetup, sponsored post, an act booking an opener) cost one order each. |
| **END WEEK** | The only way time moves. About five seconds of show: units march, the live calls come back as **loot cards** (fact, receipt, map change, quest change or XP, the real move), a random event (40%, from live data, two free answers), battles with the crowd meter and five rounds, sieges, the rival's attack and next move, missions completed, level-ups, the tally and a **headline**. It stays as the week's report until **WEEK N+1 · GIVE ORDERS**. Click to skip ahead. |
| **Win screen** | The deliverable: the tour pack (route map, six stops with night, room, opener, sponsor and post, calendar, City Briefs, emails, share), or the sponsor, new-city or collab pack. Reachable mid-game as **Peek: what winning looks like**. |
| **Full / Simple view** | Simple is the default. Full view adds the radar, the crowd brain, live calls, the rival strip and scoreboard, and every rival's colour. |
| **Tutorial** | Four beats: the quest bar, one Booker order, END WEEK, and the first loot card inside the show. |

## 4. The army: five agents (each runs real calls)

One agent per outcome you can name: know a city, book a show, get paid, make a friend, test the material. The old twelve were merged by outcome, so no data call was lost: a merged agent runs its calls together and brings back one loot card, one fact line per source, every receipt listed. All five march from week 1. **Lv III gives every agent its second power** instead of new units.

| Agent | Does (the real calls) | Brings back | XP | Lv III power |
|---|---|---|---|---|
| You | Fights for a city with your material (odds from Qloo, the panel and Wikipedia) | The city and its tour stop. An unprepared rival city takes 2 orders: groundwork, then the strike | 80 / 60 | — |
| Scout | Qloo brands × city + Google Trends for that state + Wikipedia fame of whoever is marching there | Fog lifted, intel, the city costs 1 less to take, the attack before it lands | 40 | Trend wave: +1 order next week if you post on the trend |
| Booker | Qloo places × city + Open-Meteo for that week | A booked venue = a tour stop, a dated Fri/Sat night in route order, the venue email | 60 | Festival night: a second room in a held city becomes a festival, +200 gold |
| Sponsor scout | Qloo brands your fans over-index on | Gold every week + a pitch email | 50 | Double deal: a second brand per city as a backup pitch |
| Diplomat | Qloo taste overlap | A parley: an ally (their cities count for your quest) + a DM | 50 | Podcast tour: a podcast your fans listen to, a guest spot |
| Room reader | 1,000 simulated fans in that city | +30% odds there, a fan quote | 40 | Copywriter: the post for that city, +1 order next week |

Agents earn stars: ★★ at 100 XP (more results, +10 gold, +5% odds, the Scout sees the nemesis's next target), ★★★ at 250 (the job also runs free in your nearest other held city). A job that finds nothing says "Qloo had nothing distinctive here" and pays no XP. Walls cost 80 gold (the Spy is gone; the Scout tells you who's coming).

## 5. Rivals, battles and deals

1. **Rivals move at END WEEK.** The nemesis (and sometimes another rival) marches on one of your cities; you see the arrow all week. Walls (80 gold) bounce it; otherwise a 2-week siege starts. Defend it with **You**: win and they retreat; lose and the siege runs on.
2. **Battles are a night in five rounds:** fan base (Qloo), the material (panel), momentum (Wikipedia), groundwork (your units and walls), and the night (the only luck). The show plays them with a crowd meter and a stamp: TAKEN, HELD, REPELLED or LOST.
3. **Deals:** the Diplomat picks the smallest offer that likely works and asks; yes or no comes back as loot with the DM.
4. **Rivals talk** in a bubble that says what they're doing and what you can do: "Respond: defend / strike / talk ›", or for someone who wants to team up, "🕊 Team up · 1 Diplomat order".
5. **Random events** (P1): a trend breaking (Google Trends), a rival's views spiking (Wikipedia: they hit two cities next week), rain all weekend in a booked city (Open-Meteo), a fan thread (the panel). Each has two free answers.

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

## 11. Tour Planner (new)

**What it answers:** "I have these dates free and will drive 5 hours a day: where do I play, in what order, in which rooms?"

| Part | What it does |
|---|---|
| **Inputs** | Home city, date window, max cities (default 6), max drive hours per leg (default 5) or "flying is fine", room size (50–150 / 150–400 / 400+). In the game: the **🗺 Tour** button. |
| **Scoring (0–100)** | 40% fans (Qloo, log-scaled against your biggest city) · 20% venue crowd fit (Qloo places) · 15% trend lift (Google Trends in that state) · 15% dry evenings in the window (Open-Meteo 16-day; unknown counts as average) · 10% rival pressure (lower if a rival holds it, higher if an ally does). |
| **Route** | Nearest neighbour from home, then 2-opt. Drive time = straight-line miles / 55 mph; any leg over the cap is marked **fly**. |
| **Nights** | Thursday, Friday or Saturday; the driest of that run when a forecast exists; a travel day after drives over 4 hours. |
| **Rooms** | Qloo places filtered by place type: comedy clubs first, then music venues and theaters. Adult clubs are removed. Room size is guessed from the name. |
| **Trust** | Every stop carries its receipts (Qloo ledger refs plus the Trends and Open-Meteo calls) and a confidence line (e.g. "high · 4 of 4 signals"). |
| **Outputs** | A plan page (`/tour/:id`) with the route map and table; **.ics** (one event per night, 8 pm in each city's own time zone); **CSV**; plain text; **Make City Briefs**; **Share** (the share card with the route). Each night also becomes a real move. |
| **AI path** | With the AI on, Claude may re-order the stops and write the "why" lines. It can't add or drop cities (this is checked). |
| **API** | `POST /api/tour/plan`, `GET /api/tour/:id` (+ `.ics`, `.csv`, `.txt`). Plans are saved in sqlite. |
| **Speed** | About 5–10 seconds for a 6-stop plan with the AI off. |

## 12. City Brief (new)

**One printed page per city that a manager can forward.** It lives at `/brief/:campaignId/:city` and prints to one page on Letter.

1. **Header:** city, performer, date, "Fans here: N (Qloo E4)".
2. **What they also love:** the top 6 across TV, music, brands, podcasts and film (Qloo).
3. **Rooms:** 3 venues with a size guess, crowd fit, and address, phone and website when Qloo has them.
4. **Allies:** a local performer and a podcast whose fans overlap, each with a one-line pitch (Claude writes it when the AI is on).
5. **Sponsor:** one brand, with an email subject line.
6. **Timing:** the driest weekend night in the next 16 days, plus what's trending in the state.
7. **Watch out:** the rival holding the city, with their Wikipedia momentum.
8. **Three moves** as checkboxes, then the sources with timestamps.

**Where to find it:** a **📄 City Brief** button on every city report, **Make City Briefs** on a Tour Plan, and an index at `/briefs/:campaignId`.

**Rules:** a section with no data says "Not enough signal yet — send a Scout" and never invents content. Briefs are cached per campaign, city and week.

## 13. Monday war report (new)

1. **Opt-in:** after the campaign briefing, a new campaign asks once: "Get your 3 moves every Monday?". It stores the email, first name and time zone.
2. **When:** 8 am Monday in the performer's own time zone. The server checks every minute.
3. **Content (under 200 words):**
   - What changed: sieges, attacks, cities won or lost, a trend in the home state.
   - The 3 moves, each linked to its actual asset (a brief section or the calendar file).
   - The tour line, and a link to the map.
   - A "Quiet week — tap to end week N" version when nothing happened.
4. **Sending:**
   - It goes out through Resend when `MAIL_API_KEY` is set.
   - Otherwise it's written to `out/mail/`, so it works on localhost.
   - Every send is logged.
   - One-click unsubscribe, which the scheduler honours.
5. **Preview:** `npm run mail:preview --campaign=<id>` writes the email to `out/mail/` and opens it. It never sends.

## 14. Confidence lines

The X-ray now says how far to trust each part:
1. **Fans:** e.g. "confidence low (rule-based fans built from Qloo tastes; ranking vs real views ρ −0.89)".
2. **Brain:** always "confidence low (a stand-in model, not a scan of real people)".

---

## Ideas to test with Claude / Grok (not built yet)

1. **Live-AI quality:** compare the strategist's plan from Claude Haiku 5.5 with a bigger model on the same board; check that it cites real numbers and never invents any.
2. **The fans' own words:** do 1,000 AI fans disagree the way real crowds do? Compare the city splits with the rule-based fans and with real view counts.
3. **A voice for rivals:** AI-written, in-character lines from the rival's real public persona (careful with impersonation).
4. **Instagram / TikTok X-ray:** once accounts can be connected.
5. **Weekly email:** "your 3 moves this week" sent to the performer from their saved campaign.
6. **Team mode for managers:** one map per performer, compared side by side.
