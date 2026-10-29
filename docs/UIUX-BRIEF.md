# Conquest — complete product brief for a UI/UX redesign

> **How to use this file:** paste all of it into Claude or Grok, then add the ask at the bottom ("What I want from you"). Everything below describes the product as it exists today (Oct 29, 2026), what every screen element is, where its data comes from, and the known UX problems.

---

## 1. The product in one breath

**Conquest is a growth agent for comedians, creators and performers, played as a real-time strategy game.**
Your audience is a map of US cities. AI agents scout where your fans live (Qloo's taste graph), battle-test your material on 1,000 simulated fans, track rivals who compete for the same fans, and hand you the next city to take. Every move in the game maps to a real-world growth action (book this venue, pitch this sponsor, guest on this podcast, co-headline with this performer), and at the end you copy a battle plan to do for real.

- **Buyer:** stand-up comedians, content creators, live performers, and their managers. Later: sports teams and brands (the LA Dodgers is a demo player).
- **Business model (mocked in the demo):** SaaS. Creator $19/mo, Headliner $49/mo, Manager $149/mo (10 performers, agents as MCP tools). Login and payments are mocked.
- **Context:** built for the **Qloo Agentic Hackathon** (deadline Oct 30 2026, 11:45pm ET). Finalists pitch live on Nov 5. Judges include **Jason Calacanis** (who personally invests $25K in his favourite entry), Cedric the Entertainer, Qloo's CTO, Todd Boehly (owns the Dodgers) and others. A judge can type their own name and play as themselves.
- **Feel we want:** Rise of Nations / Age of Empires war room meets a premium SaaS. Fun enough that a judge plays for 2 minutes and says "I didn't know a tool could do this", useful enough that a creator opens it every week.

---

## 2. The user journey (4 screens)

```
Landing page  →  "Who are you?" modal  →  Scan (cinematic loading)  →  War room (the game)  →  Victory screen
```

1. **Landing:** sells the product; big CONQUEST button; "Play as Jason Calacanis / Cedric / LA Dodgers" quick picks.
2. **Who are you?:** type a name → we search Qloo and show matching people with photo, bio, popularity and socials found (Instagram, X, IMDb…). Click "That's me". Not on Qloo? "Build your own": your name, your handles, "your audience is like…" (pick 1–3 acts), optional material to test.
3. **Scan (~1–30 s):** a 7-step checklist runs while the backend makes ~60–100 live API calls. A 3D constellation brain sits on the left.
4. **War room:** the game. 8 in-game weeks on a real-time world clock.
5. **Victory:** stats + "Copy battle plan" (the real-world to-do list), "Examine map", "Play again".

Shareable link: `/?play=Jason%20Calacanis` opens straight into the "Who are you?" step for that name.

---

## 3. Visual identity (current)

**Two worlds:**
- **Site world (landing, modal, scan):** pure black void, one violet action colour, amber labels, huge light-weight headlines, a 3D triangle-constellation brain (canvas) that forms beside sections and scatters into a starfield between them. Reference: dala.ai.
- **Game world (war room):** dark navy strategy map, neon faction territories, bronze-trimmed panels, Cinzel (serif, all caps) for titles and banners, glossy blue command buttons, monospace for numbers.

**Tokens**
| Token | Hex | Use |
|---|---|---|
| void | #000 | site background |
| iris | #8052ff | the one primary CTA (site) |
| saffron | #ffb829 | labels, and **your faction colour** |
| rival 1 / 2 / 3 | #ff4d6d / #9b6bff / #38d8ff | rival factions |
| allied | #2fd3a5 | allied factions and ground |
| open ground | #5d6b80 | unclaimed cities |
| uncharted (fog) | #323a46 | too little data |
| good | #3dff9a | gains, radar, "ripe to take" |
| bronze / bronze-hi | #b8893b / #f0c46a | game panel trim, panel titles |
| panel bg | #151d2b → #0d131e | war room panels |

**Fonts:** Inter Tight (UI, weight 200–700), Cinzel (game titles, 600–900), IBM Plex Mono (numbers, logs).
**Sound:** synthesized in WebAudio (no files): select, conquer fanfare, alliance chime, threat drone, city lost, age-up horn, victory, potion. Mute toggle in HUD.

---

## 4. Landing page — every section

| # | Section | What's there |
|---|---|---|
| 1 | Nav | Logo (flag), links: Your army · Rivals · Battle-test · Pricing, mock "Sign in", "Play Conquest" button |
| 2 | Hero | Left: label "The growth agent for comedians, creators and performers", H1 "Turn your audience into an empire.", lead, big **CONQUEST** button (breathing glow), "Play as" quick picks. Right: **live mini-game canvas**: real US state borders, your gold colour spreading state by state every ~2 s, a red rival dashed-arrow pushing on Atlanta, a green radar sweep from your capital, agent icons flying to the next state, "+X%" bursts. 3 floating chips: "+13% Memphis conquered", "Rival marching on Atlanta · Sun", "Booker: Classic Hitz · 89% crowd fit" |
| 3 | Live sources strip | Pulsing dots: Qloo taste graph, 1,000-fan simulation, Google Trends, Wikipedia fame, Open-Meteo, TRIBE brain model (grey = stub) |
| 4 | Your army | 12 agent cards (icon bobbing, name, job, data source + "live") |
| 5 | Rivals on the radar | Copy + bullet list; right side an animated circular radar with 3 blips (NEMESIS / RIVAL / ALLY?) closing in on "YOUR HQ" |
| 6 | Battle-test | Copy about the 1,000-fan panel and the brain; the 3D brain forms beside it |
| 7 | How a week plays | 4 steps: Scout · Execute · Defend · Level up |
| 8 | Why it matters | 3 stats: 50M+ people earn from an audience · Real data · A habit |
| 9 | Pricing | Creator / Headliner / Manager |
| 10 | End CTA | "Your audience is a map. Go conquer it." + CONQUEST; brain behind it |

---

## 5. War room — every element (desktop: 3 columns)

```
┌──────────────────────────── HUD (top bar) ─────────────────────────────┐
│ Logo │ Portrait+Level │ Age + XP bar │ ⚡Buzz ❤Hype 🪙Gold orbs │ 🏰 🤝 🤖 🏆 ★ │ 🔊 Exit │
├──────────────┬───────────────────────────────────────┬─────────────────┤
│ LEFT column  │ CENTER: battle map + agent ops log    │ RIGHT column    │
│ (scrolls)    │                                       │ (scrolls)       │
│ Threat radar │  clock (top-right of map)             │ War council     │
│ Crowd brain  │  event ticker (top-left of map)       │  + opportunities│
│ Factions     │  city report (bottom-left, on hover)  │  + simulate btn │
│ Agent HQ     │  legend (bottom-right)                │ Orders          │
│ Trend potions│  center banner (on big events)        │  (accordion)    │
│ Commander +  │ ───────────────────────────────────── │  + End week     │
│  intel       │ Agent ops · live calls (log)          │                 │
└──────────────┴───────────────────────────────────────┴─────────────────┘
```
Below 1180 px the left column hides; below 820 px everything stacks (map first).

### 5.1 HUD (top bar)
- **Portrait + level ring:** your photo (from Qloo) in a gold ring; a coin badge shows the **Age** as a Roman numeral.
- **Age + XP bar:** age name (Open Mic → Club Circuit → Theater Tour → Arena Headliner → Legend at 0/20/40/60/80% conquest), text "25% conquest · Theater Tour at 40%", a glowing gold XP bar = progress to the next age.
- **Three liquid orbs** (sloshing fill, pulse when they change):
  - **⚡ Buzz** (blue, "mana"): spent on orders. Max 12. Start 8. **+3 to +8 per week** = 3 + bonus from Hype + 1 per ally.
  - **❤ Hype** (red): how well your material lands = the 1,000-fan panel's mean rating out of 5. Raises Buzz income. Goes up when you sharpen material, use the Weather oracle, Herald, festivals.
  - **🪙 Gold** (amber): ticket sales (15 per city you hold per week) + sponsors. Spent on recruiting agents (40–250), fortifying (80) and co-headline offers (150).
- **Counters:** 🏰 cities held/scouted, 🤝 allies, 🤖 agents recruited, 🏆 achievements, ★ score.
- 🔊 sound toggle, Exit.

### 5.2 Center: the battle map (canvas)
- **Real US state borders** (us-atlas, Albers USA). Each state belongs to the faction of the scouted city inside it; states without a scouted city take the nearest city's colour, fainter. Glowing frontier lines around each faction's realm.
- **City tokens:** your capital shows your photo with a 👑; rival-held cities show the rival's photo; other cities show a ring in the owner's colour and your **fan signal** number (Qloo heatmap points, e.g. "1.9k"). City names in Cinzel caps.
- **Badges on tokens:** `!` frontline (fans there but material lands below average), `⚔` contested (a rival close behind), red number = siege countdown in weeks, `✓` prepared by your agents, green pulsing ring = beachhead "ripe to take", 🚩 = selected order's target.
- **Day/night:** night sweeps east→west by real longitude with the world clock; city lights glow amber after dark.
- **Radar sweep:** a green conic beam rotates around your capital; rival cities ping as it passes.
- **Rival armies on the march:** each week some rivals pick a target; their portrait travels along a dashed arc toward your city with "⚔ CHICAGO · SUN" (arrival Sunday midnight). If you fortified, it shows "🛡 walls up".
- **Arrows:** gold animated arrow from your nearest city to the selected order's target; rival-colour arrows for sieges.
- **Agent units:** when you deploy an agent, its icon marches from your capital to the city, bobs with "working…" while the real API call runs, then marches back.
- **Effects:** conquest = colour floods outward from the city + shockwave rings + 70 particles; floating "+8%", "+🪙45", "🛡 HELD", "✓ PREPARED".
- **Ghost preview:** selecting an order shows a dashed ring and a floating "+8%" over the target (what will happen).
- **Clock (top-right):** day dial, "WEEK 2 OF 8 · TUE 14:00 ET", pause ⏸, fast-forward ⏩ (12×). One game week ≈ 84 real seconds. At Sunday midnight the week ends on its own.
- **Event ticker (top-left):** last 5 events, colour-coded (gold = you, red = threat, green = good), fade after 9 s.
- **City report (bottom-left, hover/click a city):** owner and state, your fan signal, material rating there, simulated fans there, top rival's footprint, worth (% conquest), **local time**, plus any agent intel for that city, siege status.
- **Legend (bottom-right):** faction colours, open ground, uncharted, ripe to take.
- **Center banner:** red/gold ribbon for big moments ("MEMPHIS CONQUERED +13%", "THE THEATER TOUR AGE", "ATLANTA HAS FALLEN", "WEEK 2 ENDS").

### 5.3 Center bottom: Agent ops · live calls
A terminal-style log, newest first, stamped with game time. Every agent mission shows **which real API it called and what came back**, e.g.
`Tue 01:15 · 🎟️ Booker @ Memphis → Qloo · places × Memphis best stage: Classic Hitz (89% crowd fit), backup StarLight Event Center`
Also logs rival moves, income, orders, achievements. This is the "proof it's real" panel.

### 5.4 Left column
1. **Threat radar:** circular radar (canvas), your HQ in the centre, your cities as gold dots, rival cities as squares, **incoming armies as glowing blips** moving toward their target with "→ CHICAGO", sweep beam, "ETA SUN 00:00 · 3D". Under it, one **threat card per rival**: portrait, name, fame momentum (▲24%), threat level chip (HIGH / MED / LOW / ALLY), one-line situation, and **counter buttons**:
   - **🛡 Fortify · 🪙80**: walls up in the targeted city this week; the attack bounces.
   - **⚔ Strike · ⚡4**: battle them first in their nearest city.
   - **🕊 Parley**: open a partnership negotiation.
2. **Crowd brain · TRIBE:** the 3D constellation brain in a panel, regions lighting up in sync with the predicted brain response to your material; 4 region bars (Visual, Auditory, Language, Attention %); note "Attention sags in 3 stretches before the punchline. 'Sharpen the material' fixes it." After you sharpen, dead zones clear and the brain glows.
3. **Factions:** you + each rival: portrait, status chip (You / Nemesis / Ally? / Allied), cities held, a power bar = **real Wikipedia views in the last 30 days** with momentum ▲/▼, and their last action ("Besieging Chicago", "Dug in at Boston").
4. **Agent HQ:** 12 agents, each with Recruit (gold) → Deploy → "On mission" → "Back next week" (one deployment per week). Deploy goes to the city you clicked, else the selected order's city.
5. **Trend potions:** live Google Trends (US + the target city's state) as potions: click = "post a take on it this week", +3 Buzz. Locked slots: **X trends** and **TikTok trends** ("connect": they need paid/official APIs). Tragic news is filtered out.
6. **Commander + intel:** your photo, bio, verified socials; material name, panel score, best/worst city; list of live sources with status (live / stub / connect).

### 5.5 Right column
1. **War council:** "General Conquest" avatar; a typewriter briefing that reads the board and says the single most important thing now (siege alarm → incoming army → best-value order → out of buzz), with a source line. Below it, **Opportunities** (timed quests) and **▶ Simulate my whole plan** (fast-forwards every remaining order as map ghosts and shows the projected conquest %).
2. **Orders (accordion):** the agent's missions. Collapsed: icon, kind, title, "+13% conquest", odds for fights, cost chip ⚡. Expanded (tap):
   - the advisor's briefing (why, with the data source),
   - **WHAT HAPPENS:** a 3-step timeline (Mon → Thu → Sun) of how it plays out,
   - **If you wait:** the risk of skipping it,
   - a mini line chart: conquest with vs without this order through week 8,
   - buttons: **Execute · ⚡4** (or "⚔ To battle", "🕊 Open parley") and **▶ Preview**.
3. **End week ▸** + note "Sunday midnight: +⚡6 buzz, +🪙45 gold, then the rivals strike."

### 5.6 Modals
- **Battle:** "Battle for Miami" / "Strike first · Minneapolis" / "Break the siege · Chicago". Your portrait VS theirs, power numbers, a tug-of-war bar at your odds, odds % and modifiers ("+30% city prepared by your agents · their fame ▼6%"). **Charge · ⚡4** → 2 s tug animation → VICTORY / REPELLED → Claim it / Fall back. Retreat is free.
- **Parley:** "Parley with Regina King". Barter score, % of their crowd new to you, % who'd cross over. Three offers with acceptance odds and price: Shout-out swap (⚡1), Co-headline 50/50 door (🪙150), Open for them in <city> (⚡3). The **smallest offer that likely works** is highlighted. A one-page **pitch** you can copy and send for real. Pick → "Waiting for their reply…" → DEAL! / THEY PASSED.
- **Victory:** VICTORY / CAMPAIGN COMPLETE / DEFEAT with stats (weeks, conquest start→end, cities, agent missions, allies, sponsors, cities taken, attacks held / cities lost, achievements, age, score). Buttons: Copy battle plan, Examine map, Play again, Back to site.
- **Achievement toasts** (top centre, gold pill): First Blood, Diplomat, Warlord, Trend Surfer, Iron Wall, Paid Up, Rising Star, Giant Slayer, Seize the Day, Festival King. +250 score each.

---

## 6. Game rules (exact numbers)

| System | Rule |
|---|---|
| Campaign | 8 weeks. Week = Mon 09:00 → Sun 24:00 game time, ~84 s real time |
| Conquest % | Share of your scouted ground you hold as strongholds. Starts from real data (e.g. 21–36%) |
| City states | stronghold (yours + material lands), frontline (yours, lands below average), beachhead (few fans, they love it: take next), hard (few fans, cold), rival (a rival's relatively stronger ground), uncharted (<6 simulated fans there) |
| Rival ownership | A rival owns a city where it's clearly more their ground than yours, each footprint measured against that act's own best city (so a superstar doesn't own everything) |
| Order costs (⚡) | Sharpen 2 · Recruit ally 3 · Take city 4 · Hold city 3 · Alliance 3 · Rivalry 5 · Defend 2. A city prepared by an agent: −1 cost, +2% gain, +30% battle power |
| Battle odds | your fans there × (hype/4) × prep 1.3 × walls 1.3 × intel 1.1 vs their footprint × (1 + Wikipedia momentum), clamped 15–90% |
| Parley odds | from the Qloo barter score: shout-out 30%+, co-headline 55%+, open-for-them 72%+ |
| Rival AI | Each Monday a rival picks a target (where it's relatively strongest, else your city nearest its ground). Chance: nemesis 75%, others 25%, +15% if fame rising >10%. Sunday: unfortified targets go under a 2-week siege → a Defend order appears → lose the battle or ignore it and the city falls (−its % conquest, a "take back" order appears) |
| Income | Weekly: 🪙 15 per city + sponsors; ⚡ 3 + hype bonus + 1 per ally (max 8) |
| Opportunities | Every ~20–30 game hours, max 3 open, expire after 30 game hours: Trend wave (⚡3 + 🪙40), Fan meetup (⚡1 + hype, prepares city), Sponsored post (🪙90), Rival booking an opener (parley with +15 barter) |
| Score | conquest×100 + allies×500 + cities taken×750 + power + sieges held×400 + agent missions×150 + achievements×250 |

---

## 7. The agent army (12)

| Agent | Cost | What it does (real call) | Effect in game |
|---|---|---|---|
| 🔭 Scout | 🪙80 | Qloo: brands your fans in that city also love | Prepares the city, intel line |
| 🎟️ Booker | 🪙120 | Qloo: best venue in that city for your crowd + backup | Prepares the city |
| 🕊️ Diplomat | 🪙100 | Qloo taste overlap: best partner (barter score) | Opens a parley + drafts a pitch |
| 💼 Sponsor scout | 🪙120 | Qloo: brands your fans over-index on | Signs a sponsor: +🪙20–70 / week |
| 🎙️ Herald | 🪙90 | Qloo: podcasts your fans follow | Guest spot: +⚡2, +hype |
| 🎭 Room reader | 🪙70 | The 1,000-fan panel: real simulated fans in that city and their 1–5★ reaction | Prepares city, brain replays |
| 📈 Trend hunter | 🪙60 | Google Trends RSS for that state | New potions |
| 🌦️ Weather oracle | 🪙40 | Open-Meteo 7-day forecast | Best show night, +hype |
| 🕵️ Spy | 🪙100 | Wikipedia pageviews for you and every rival | Fame + momentum, predicts the next attack |
| ✍️ Copywriter | 🪙50 | Qloo taste tags + a live trend | Drafts a post (copied to clipboard), +⚡1 |
| 🎪 Showrunner | 🪙250 | Qloo artists, brands, podcasts, films | Plans a festival night in a city you hold: +🪙200, +3%, +hype |
| 👂 Listener | locked | Reddit (blocks anonymous apps) | "Connect your account" |

Several of these are whole products other teams submitted to the same hackathon (sponsor matching, opener booking, podcast guests, partnership pitches, room reading, concert-night planning). In Conquest they're units in one army.

---

## 8. Data and honesty rules (must survive any redesign)

- **Live:** Qloo (taste graph: audience, tags, heatmap footprints, venues, brands, podcasts, people), Google Trends daily RSS (US + state), Wikipedia pageviews, Open-Meteo.
- **Simulated (labelled):** the 1,000-fan panel (personas built from Qloo data, mock respondents), rival moves (simulated from real footprints and momentum), battle/parley dice, projected gains.
- **Stub (labelled):** TRIBE brain response (Meta's TRIBE v2 model, stubbed curves).
- **Not connected (shown honestly as "connect"):** X trends, TikTok trends, Reddit.
- Every recommendation shows its source ("Source: Qloo where_popular + panel + venues in Memphis"). Gains say "(projected)". We never show fake numbers for sources we don't have.

---

## 9. Tech constraints

- Vanilla JS + HTML/CSS, no framework, one page (`public/index.html`, `public/app.js`), canvas rendering (map, radar, brain, hero), d3-geo + topojson for the map.
- Node server with JSON endpoints: `/api/profile`, `/api/audience`, `/api/rehearse`, `/api/campaign`, `/api/partners`, `/api/trends`, `/api/weather`, `/api/fame`.
- First campaign for a new name takes ~30 s (≈100 live Qloo calls); demo players are pre-warmed and instant.
- Must work at 1440–2000 px wide (jury laptops/projector) and degrade to mobile.

---

## 10. Known UX problems (be brutal about these)

1. **Too dense, too many panels at once.** First-time players don't know where to look or what to do first. No onboarding / tutorial / first-turn guidance.
2. **Left and right columns are long scrolls.** Radar, brain, factions, 12 agents, potions and intel all stack; the important stuff hides below the fold.
3. **Three currencies + many systems** (buzz, hype, gold, orders, agents, potions, opportunities, sieges, battles, parleys, achievements): powerful but hard to learn in a 2-minute demo.
4. **The map is the hero but competes with panels.** Legend and city report overlap the map on smaller screens; city labels collide in the Northeast.
5. **Emoji icons everywhere**: fun but inconsistent; feels less premium than the site.
6. **Two visual worlds** (black dala-style site vs bronze RTS war room): the jump can feel disjointed.
7. **The clock runs while you read**, which can stress first-timers (there's pause, but it's small).
8. **The real-world value is buried:** the battle plan / to-do list only appears at the end. Creators need to see "what do I actually do this week" all the time.
9. **Mobile is an afterthought:** everything stacks into a very long page.
10. **Loading (scan) for a new name can take 30 s** with little to watch.

---

## 11. What I want from you (the ask)

Redesign the **UI/UX** of Conquest so that:
1. A **judge plays for 2 minutes and is wowed**: instantly understands it, has fun, sees it's real (live data, real agents).
2. A **creator would open it every week**: clear "this week's moves", real value, habit loop.
3. It feels like a **premium strategy game** (Rise of Nations, Civilization, Clash of Clans polish) **and** a credible SaaS an investor (Jason Calacanis) would back.

Please give me:
- A new **information architecture** for the war room (what's always visible, what's on demand, what goes in drawers/tabs/overlays), at 1440 px and mobile.
- A **first-run onboarding** (the first 60 seconds: guided first turn).
- How to **simplify the systems** without losing depth (which to merge, hide or cut).
- A **landing page** structure that converts and matches the game.
- **Visual direction**: one unified style for site + game, icon set instead of emoji, motion principles, key animations (radar, conquest flood, battles, agents marching).
- 3–5 **"wow" moments** to design around for the live pitch.
- Concrete specs I can hand to a developer: layouts with sizes, component list, states, and copy.

Keep: real US map with faction territories, the threat radar, the TRIBE brain, the agent army with visible live calls, battles and parleys, the world clock, honesty labels.
