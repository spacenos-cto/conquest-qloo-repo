# Conquest: what it does, feature by feature

**One line:** Conquest is a growth agent for comedians, creators and performers, played as a Rise of Nations-style strategy game. Every move in the game is a real growth action (a city to tour, a venue to book, a post to make, a partner to pitch), backed by live taste data from Qloo.

**Who it's for:** working comedians, podcasters, musicians and creators who want to grow a real audience city by city. **Who pays:** the performer (Campaign Pass), and later managers, agencies and venues who run several acts.

---

## 1. Getting in

| Feature | What it does |
|---|---|
| **Landing page** | Explains the USP, who it's for, who pays, the value you get, and a comparison against the alternatives (spreadsheets, generic analytics, agencies). It opens with a light 👉👈 hook so the product starts on a fun note. |
| **Who are you?** | You type your stage name. Conquest finds you in Qloo, and auto-fills your YouTube and other handles. |
| **Scan** | A loading screen that reads your audience live: Qloo taste graph, demographics, cities where your fans are, and the performers your fans also follow. |
| **Campaign briefing** | A versus screen: you against your nemesis (the rival who shares the most fans with you), with the goal, the clock and what's at stake. |

## 2. The map (the board)

| Feature | What it does |
|---|---|
| **US map of your fans** | Each city shows your real fan signal (Qloo). Cities are yours, a rival's, unclaimed, or uncharted (fog). |
| **City report** | Hover or click a city: your fan signal, material rating, simulated fans there, top rival, what it's worth in conquest %, and local time. |
| **World clock** | A campaign is 8 weeks. Each week runs Mon to Sun on a live clock (pause and speed up). Sunday midnight is when income lands and attacks resolve. |
| **Conquest %** | Your score: the share of your potential fan territory you hold. |

## 3. Your army (12 AI agents)

Each agent is a unit you move on the map. Send it to a city (click it, then click a city, or **drag it onto a city**) and it marches there on the world clock, then does a real job with live data.

| Agent | Real job when it arrives |
|---|---|
| **Scout** | What your fans there also love (Qloo) · prepares the city |
| **Booker** | Finds the best real venue/stage there (Qloo places) |
| **Diplomat** | Finds a partner and writes the pitch |
| **Sponsor scout** | Finds a brand sponsor that pays you every week |
| **Herald** | Finds a podcast guest spot (+buzz) |
| **Room reader** | Real reactions, fan by fan |
| **Trend hunter** | What's trending in that city right now (Google Trends) |
| **Weather oracle** | The driest show night (Open-Meteo) |
| **Spy** | Rivals' fame and their next attack (Wikipedia momentum) |
| **Copywriter** | Drafts a ready-to-post caption for that city |
| **Showrunner** | Plans a whole festival night (+gold) |
| **Listener** | What Reddit says about you (locked until you connect) |

Agents cost gold to hire, each job runs once per week, and agents stationed in cities you hold earn a daily yield. Clicking an agent opens a **mission pop-up**: what it does, the 3 best places to send it and why, how long it takes and what you get.

## 4. Resources

- **⚡ Buzz**: spent on orders and battles.
- **Hype**: momentum that boosts your results.
- **🪙 Gold**: hires agents and builds walls; earned weekly from cities and sponsors. Caravans carry it home.

## 5. Your AI strategist

A panel that reads the board and picks your best move right now (for example, "Rivalry: take San Francisco from David"), with one button to do it, plus trend opportunities with deadlines and **Simulate my whole plan**.

## 6. Rivals

Rivals are **real performers your fans also follow** (from Qloo). Each week some pick one of your cities to attack, and you see them coming days ahead.

- **Rival strip and scoreboard:** their faces, threat level and conquest %.
- **Minimap radar:** click a blip to pick that rival; click anywhere else for the threat report.
- **Threat report:** one card per rival: what they're doing this week, what happens if you do nothing, and the buttons to answer (Defend, Build walls, Strike, Offer a deal).
- **Battles** have visible odds; **parleys** let you offer a partnership instead of fighting.

## 7. Content X-ray (your real content)

Reads your **real YouTube channel** (public feed, last 6 videos with real view counts), plays each video to your 1,000 simulated fans and the brain model, and tells you:

- **How the brain reacted:** visual, auditory, language and attention, plus where attention dips.
- **How 1,000 fans reacted:** the hate→love split, a quote from a fan, and what they reacted to.
- **What would happen:** whether it should outperform, and in which city.
- **What to change:** for example, tighten the stretch at 38%, then push it to New York first.
- **Honesty check:** compares predictions against real views per day, and says so when views follow news hooks rather than taste.
- **Test your next post:** paste a title or script and get a prediction before you publish.
- Instagram, TikTok and X are shown and need your account connected.

## 8. Real-world value (outside the game)

| Feature | What it does |
|---|---|
| **Real moves** | Every executed order becomes a real-life mission (book this venue, post this caption, pitch this partner). Tick them off. |
| **Calendar export** | Download your missions as an .ics file for Google or Apple Calendar. |
| **Weekly return loop** | The campaign autosaves. Come back next week, mark what you did in real life, and it carries over. |
| **Share card** | A 1200×630 image of your campaign (conquest %, map, this week's real move) to post. |

## 9. Demo and judging

- **Jury tour** (`?tour=1` or the landing button): a 2-minute, 12-beat auto-play of the full product, including a battle, a parley and the content X-ray, ending on the share card.
- **docs/DEMO-SCRIPT.md:** the live pitch beats, Q&A and fallbacks.

## 10. What's real and what's simulated

- **Real:** Qloo taste graph, fan cities, venues and rivals; YouTube titles and view counts; Google Trends; Wikipedia pageviews; Open-Meteo weather.
- **Simulated (and labelled):** the 1,000-fan panel (personas built from Qloo data) and the brain model (a stub shaped like Meta's TRIBE v2). Rival moves are simulated from their real footprints.
