# Conquest v2: the build plan (turn-based, army-first, outcome-first)

> **For the implementing agent (Opus 5.5).** Read this whole file before touching code. It replaces the game loop in `public/app.js` + `public/index.html` with a turn-based, Rise-of-Nations style loop where the player picks an objective, commands an army of agents, and wins a real deliverable (a booked tour, signed sponsors, a new city, or a full collab calendar). Everything that is *data* (Qloo, Trends, Wikipedia, Open-Meteo, the 1,000-fan panel, the server routes, Tour Planner, City Brief, Monday mail) stays exactly as it is. What changes is **how the player experiences it**.
>
> **Mockup (source of truth for layout and copy):** https://claude.ai/artifact/967idERDJApP6KW7Ruf8qS — four artboards: `0 Objective`, `1 War room`, `2 End week`, `3 Tour pack`. Open it with the Artifact tool (`action: "read"`), not a web fetch. Its `.dc.html` files hold the exact copy, sizes and colours.
>
> **Deadline:** Qloo Agentic Hackathon, Oct 30 2026, 11:45 pm ET. Phase P0 below is what must ship. P1 and P2 are for the finalist pitch (Nov 5) and after.

---

## 0. Ground rules (do not break)

1. **No new dependencies.** Vanilla JS, one page, canvas map (d3-geo + topojson already vendored).
2. **No server changes in P0** except where this plan names a route. All agent jobs keep calling the same `/api/*` endpoints.
3. **Honesty labels stay.** Simulated things stay labelled "(simulated from Qloo)"; receipts stay on every number. Never show a number for a source we don't have.
4. **No emoji in the game UI.** Use the existing `PATHS` / `I(k)` inline-SVG icon system in `app.js` (`iconize()` already de-emojis). Any new icon goes into `PATHS`.
5. **Keep working:** the landing page, Who-are-you, Scan, X-ray, Tour Planner (`#tour-btn`), City Brief, Share card, Monday mail opt-in, the jury tour (`?tour=1`), autosave + welcome-back, MCP server.
6. **Save format bumps to `v: 2`.** `loadSave()` must accept v1 saves and migrate (section 3.4) so returning demo players don't lose campaigns.
7. **Everything the player can do must say what they get.** No button without an outcome line under or beside it.

---

## 1. The loop in one paragraph

Before week 1 the player **picks an objective** (tour / sponsors / new city / collabs). The game turns it into a **quest bar** with 4 missions (one per 2 weeks) and a **win rule**. Each week the player has **3 orders**: pick a unit, pick where it goes (the game suggests 3 targets per unit, each with "what you'll get"). Nothing moves until they press **END WEEK**. Then a **6-second show** plays: units march, do their real job, come back with **loot** (a fact with a receipt, gold, XP, a map change, a real-world move); rivals attack or retreat with dialogue; a battle resolves if one was due; a **headline** sums up the week. Loot fills the quest (e.g. a booked room = a tour stop). After 8 weeks the **win screen is the deliverable** (tour pack / sponsor pack / city pack / collab pack) with calendar, briefs, emails and DMs. The player levels up (Open Mic → Club Circuit → Theater Tour → Arena → Legend) and higher levels unlock more units. **There is no clock.**

---

## 2. Phases and priority

| Phase | Ships by | Contains |
|---|---|---|
| **P0 · playable + demoable** | Oct 30, before recording the video | §3 data model · §4 objective screen (tour objective fully wired, other three with missions but tour-only win pack) · §5 war room layout · §6 army orders (6 units) · §7 end-week show · §8 quest engine (tour) · §9 economy/XP · §11 agent outcome rule · §12 tour pack win screen · §14 onboarding · §15 copy · §16 tests |
| **P1 · pitch polish** | Nov 4 | §4 all four objectives' win packs · §10 fun systems 1–3 (gambles, random events, rival draft) · §13 full polish pass · mobile |
| **P2 · retention** | after | §10 systems 4–5 (venue collection, leaderboard) · live campaign mode (1 game week = 1 real week, Monday mail drives it) · team mode |

Order of work inside P0 is in §17. If time runs out, cut from the **bottom of §17**, never the top.

---

## 3. Data model (`G`, saves)

### 3.1 New fields on `G` (set in `startGame`)

```js
objective: "tour" | "sponsor" | "city" | "collab",   // §4
objCity: string|null,                                // "city" objective: the chosen city
missions: [{ id, wk: [1,2], title, how, done: bool, doneWhen: fn(G)->bool }],   // §8, replaces c.missions usage in the quest bar (c.missions still feed suggested targets)
quest: { label, need, have, slots: [...] },           // derived every render by questState() §8
ordersLeft: 3,                                        // replaces buzz as the action currency §9
orderQueue: [{ unitId, city, label, kind }],          // orders given this week, executed at END WEEK §6.4
xp: 0, level: 1,                                      // §9.3 (level derived from xp, not conquest)
unitXp: Map(unitId -> xp),                            // §6.5 stars
report: null,                                        // last end-week report object §7.6 (rendered on screen 2, kept for Monday mail)
headline: "",                                        // §7.5
events: [],                                          // random events pending §10.3 (P1)
venues: [],                                          // collected venues §10.4 (P2)
```

### 3.2 Fields that go away (or become derived)

- `G.hour`, `Clock.*` ticking, `questTick(dt)`, `G.nextQuest`, quest `left` countdown in real seconds. **Opportunities become per-week offers** (§7.4), not timers.
- `G.buzz`, `BUZZ_MAX`, `regen()`: replaced by `ordersLeft` (§9.1). Keep the word "buzz" out of the UI.
- `G.morale` stays internally (battle odds use it) but is never shown as "Hype". Shown as **"Your material: 4.3 / 5 with your fans"** inside the player card only.
- `G.potions`: Trend hunter now returns a **"Trend wave" offer** (§7.4) instead of potions.

### 3.3 Unit records (`G.army`), extended

```js
{ id, p, at, state: "idle"|"ordered"|"moving"|"working"|"stationed", order: null|{city,label}, stars: 1..3, lastLoot: {...} }
```

`state: "ordered"` is new: the unit has an order this week but hasn't marched (it marches at END WEEK).

### 3.4 Save v2

`snapshot()` adds: `v: 2, objective, objCity, missions (id+done only), ordersLeft, orderQueue, xp, unitXp, report, headline, venues`. `restore()` on a v1 save: set `objective: "tour"`, build missions from §8.2, `xp = conquest * 10`, `ordersLeft = 3`, `orderQueue = []`, drop `hour`. Welcome-back screen (`welcomeBack`) keeps working; its "returning bonus" becomes `+1 order this week`.

---

## 4. Screen 0: pick your objective (replaces the current `intro()` briefing)

**When:** after Scan, before week 1, for new campaigns only (saved campaigns skip to welcome-back). Also reachable later from the quest bar ("Change objective"), which keeps progress and rebuilds missions.

**Layout** (mockup artboard `Objective.dc.html`): header line with name + fans found (`cities.length` cities, Σ `c.you` fans) → H1 "What do you want in 8 weeks?" → 4 objective cards in a row → missions panel (left: 4 missions; right: "Your army for this", "How you win", "Who's in your way") → footer "START WEEK 1".

**The four objectives** (data lives in a new `OBJECTIVES` const in `app.js`):

| id | title | blurb | you get (win pack) | army text | win rule (`winWhen(G)`) |
|---|---|---|---|---|---|
| `tour` | Book a tour | 6 nights in the cities where your fans already are, in a route you can drive. | rooms, nights, calendar, venue emails | Scout → cities (and keeps the nemesis off your dates), Booker → rooms and dry nights, Diplomat → an opener each. | 6 held cities each with a booked room (`G.nights` entry with `venue`) |
| `sponsor` | Land sponsors | Brands your fans over-index on, with a pitch written for each. | 3 sponsor pitches + weekly gold | Sponsor scout in every held city, Room reader to prove the audience, Copywriter for the post. | `G.sponsors.length >= 3` and one `G.reactions` ≥ 4 on a sponsored post |
| `city` | Break into a new city | Pick a city you've never played and make it yours. | a room, a local ally, a podcast slot there | Scout lifts fog, Herald finds the podcast, Diplomat the local act, Booker the room, then the battle. | `objCity` is `sideOf === "you"` and has a night and (ally or guest spot) |
| `collab` | Fill my calendar | Guest spots, collabs and co-headlines with acts whose fans would like you. | 5 DMs ready to send + a podcast list | Diplomat and Herald do the work; Spy tells you who's rising. | 5 parleys offered, 3 accepted (`G.allies + guestSpots >= 3`) |

**Missions per objective** are in the mockup's `Objective.dc.html` script (`base[].missions`): copy them verbatim: `[weeks, title, how, doneWhen-text]`. Implement `doneWhen` as functions (§8.2).

**"Who's in your way"** is computed: the nemesis (`strategy === "compete"`), shared-fan % (`nem.plan.netnew` inverse or `c.rivals[i].overlap` if present), cities they hold (`c.rivals[i].holds`).

**For the `city` objective** the card expands with a city picker: the 5 biggest open/rival cities by `c.you` that are not held; picking one sets `G.objCity`.

**Hook:** replace the body of `intro()` with this screen; keep the Promise contract (`await intro()`), resolve on START WEEK 1 with `G.objective` set, then call `buildMissions()` (§8.2). `askMonday()` still runs after it, unchanged.

---

## 5. Screen 1: the war room (replaces the current HUD/clock/orbs/council layout)

Mockup artboard `Main.dc.html`. Desktop (≥1180 px) = top bar + map (left, fluid) + army rail (right, 400–460 px). Below 1180 px the rail stacks under the map and the map gets `min-height: 60vh`.

### 5.1 Top bar (`#top`), left → right

1. **Hero card:** portrait (existing `#hud-face`), name, `Week N of 8`, a level pill `Lv II · Club Circuit` (Cinzel), XP bar (reuse `#xp-fill` / `#xp-text`): "380 XP to Theater Tour".
2. **Quest bar** (replaces `#goalbar`): label `QUEST: <objective title>` in saffron; right side `3 of 6 stops · <one-line rule>`; under it the **slot row**: 6 slots for tour (city + room·night, dashed when held-but-unbooked, grey "Stop N" when empty); for the other objectives the slot row shows 3 sponsor slots / 1 city with 4 sub-slots / 5 DM slots. Clicking the quest bar opens the missions sheet (§8.3).
3. **Gold tile:** `891` + `gold · +75/wk` (income = cities×15 + sponsors; unchanged).
4. **Orders tile:** `{ordersLeft}` + `orders left` in green. Pulses red when 0 and the player clicks a unit.
5. **Help (?)**, **Full view** (keeps the existing Full/Simple toggle: Full shows brain, live calls, scoreboard; Simple is now the default and is what the mockup shows).

**Removed from the top bar:** the three orbs (`#orbs`), the Stats button (moves into Full view), Tour/X-ray/Share (move into a `…` overflow menu on the right; Tour and X-ray also appear as units' outcomes, §6.6).

### 5.2 The map (`#mapwrap`, `MapView`)

Keep the canvas renderer; change what it draws:

1. **Three colours only** by default: you (`COL.you`), the **nemesis** (`RIVAL_COLS[0]`), open (`COL.open`). Other rivals' cities draw as open ground with their small portrait badge; Full view restores every rival's colour. Allied = your colour at 60% with a handshake badge.
2. **Fog** (`c.state === "uncharted"`): hatched (`repeating-linear-gradient` equivalent in canvas: 45° lines, 6 px on / 8 px off, 5% white) with a centred label "UNCHARTED · send a Scout" when ≥3 fog cities are adjacent. Lifted when a Scout's job completes there (§6.2).
3. **Tour route**: a 3 px line in your colour joining held cities **in tour order** (from `G.quest.slots` when objective is tour; otherwise nearest-neighbour from the capital). Extends with an animated draw (600 ms) when a stop is added. (`drawTour` exists: repurpose.)
4. **March lines**: dashed green from a unit's current city to its ordered city while `state === "ordered"` (so the player sees the plan before pressing END WEEK), solid green while moving.
5. **Attack arrow**: dashed nemesis-coloured arrow from their nearest city to the target (`G.intents`), label "hits at END WEEK".
6. **City token**: circle sized 30/36 px, fan count inside (`kfmt(c.you)`), name below in 11 px uppercase tracking 0.08em. **Ripe ring** (green, 4 px) on `c.state === "beachhead"` or a prepared rival city. **Walls badge** (shield icon + "Walls up") on `G.forts`. Crown on the capital.
7. **Rival speech bubble** anchored near the nemesis's nearest city (existing `say()` / `placeSay`): portrait + name + line + a status line ("Marching on Atlanta · hits at END WEEK"). Max one visible.
8. **Fan strip** at the bottom of the map: the last `fanSay()` quote with "(simulated from Qloo)" and the city's rating. Always present after week 1.
9. **Hover a city**: tooltip with fans, holder, what they love (from `G.intel`), "what you'd get here" (§6.3 targets). **Click a city** with a unit selected = give that unit the order there (same as clicking a target chip).

**Legend** (top-left of map, always on, not auto-hiding): Yours · <nemesis name> · Open · Your tour route.

### 5.3 The army rail (`#slot-army` → `#army`)

Header `YOUR ARMY` (Cinzel, saffron) + hint `Click a unit, then where to send it · 3 orders a week`.

**Unit row** (a `<button>`, full width): 40 px icon tile (SVG from `PATHS`, tinted per unit `AG_COL`), name + stars, status (right, coloured), then two lines: `Does: …` and `Brings back: …` (copy in §6.1). Selected row = violet border + `#1e1535` bg. Row states: Idle · ready / Ordered → City (green) / Marching → City (green) / In City · +N gold/wk (saffron) / Back next week (grey) / Hire · 80 gold (dim, violet price).

**Order box** appears under the selected unit: `Send <Unit> to:` + 3 target chips (§6.3). Chip click = order (toggles). When `ordersLeft === 0` chips are disabled with the tooltip "No orders left — press END WEEK".

**Locked line:** `Lv III · Theater Tour: every agent gets its second power` (no locked units).

**END WEEK** button (violet, Cinzel, 60 px, glow) pinned at the rail's bottom with the line under it: `No clock. Nothing moves until you press this. Then your army marches, reports back, and the rival makes his move.` Button label changes to `END WEEK · {n} orders queued`. If `orderQueue` is empty, a confirm toast: "Send nobody? Your rivals still move." with `End anyway`.

### 5.4 What leaves the war room

Delete from the default view (keep code behind Full view where it still works): `#clock` and `Clock` ticking (§9.2), `#orbs`, `#council` (the AI strategist's plan now feeds **target suggestions** and the end-week headline instead of its own panel), `#quests` timers (→ §7.4 offers), `#rivalstrip` (→ the one nemesis bubble + Full view), `#radar` (keep in Full view; the attack arrow on the map replaces it), `#scoreboard`, `#legend` auto-hide, the bottom "Selected unit / All orders" bar (`#slot-next` becomes the order box in the rail), the `#endturn` bottom-right orb (→ the rail button).

---

## 6. The army

### 6.1 Units: five agents (merged from twelve, Oct 30)

The army is **five agents**, one per outcome a player can name: *know a city, book a show, get paid, make a friend, test the material*. The old twelve were merged by outcome, so no real data call is lost: each merged agent runs its old jobs together and returns one loot card. All five are **pre-hired** at the start, so there's no shop. **Lv III adds no new units. It gives every agent its second power** (the column on the right). Progression still feels like unlocking, and the rail stays at five rows plus **You** (§6.7).

| id | name | Does (real calls) | Brings back | Map change on arrival | XP | Real move created | Lv III power (was) |
|---|---|---|---|---|---|---|---|
| `scout` | Scout | what your fans in a city love (Qloo brands × city) + what's trending in that state (Google Trends) + which rival is heading there (Wikipedia fame) | fog lifted, intel, the city costs 1 less to take, attack arrows on that city 2 weeks ahead | `uncharted → open/beachhead`; intel pinned; rival arrow if any | 40 | "Mention <brand> in your next <city> post" | **Trend wave**: +1 order next week if you post on the trend (was Trend hunter). Spy is folded in from Lv I |
| `booker` | Booker | the room whose crowd fits yours (Qloo places × city) + the best dry night that week (Open-Meteo) | a booked venue = a tour stop, a venue email, a dated show night (.ics) | venue badge; tour route extends; quest slot fills | 60 | "Email <venue> about <night>" (+ .ics) | **Festival night**: in a held city with a venue, +200 gold and +1 tour stop with a line-up (was Showrunner). Weather is folded in from Lv I |
| `sponsor` | Sponsor scout | a brand your fans over-index on (Qloo brands) | gold every week + a pitch email | sponsor badge; income +20–70/wk | 50 | "Send the <brand> pitch" | **Double deal**: 2 brands per city, the second as a backup pitch |
| `diplomat` | Diplomat | a performer whose fans would like you (Qloo overlap) | an ally (their cities count for your quest) + a DM | parley overlay (existing) | 50 | "DM <name>" | **Podcast tour**: a podcast your fans listen to (Qloo podcasts) → guest spot = a collab slot (was Herald) |
| `reader` | Room reader | 1,000 simulated fans in that city react to your bit | battle odds up there, a fan quote | city prepared (+30% in battle) | 40 | "Open with the <bit> in <city>" | **Copywriter**: also writes the post for that city (Qloo tags + trend), ready caption, +1 order (was Copywriter) |

**Removed:** `spy` (into Scout), `trend` (Scout Lv III), `oracle` (into Booker), `showrunner` (Booker Lv III), `herald` (Diplomat Lv III), `scribe` (Reader Lv III), `listener` (Reddit stub; deleted, and the "connect Reddit" chip stays on the landing page's live-sources strip only).

Code: `AGENTS` has 5 entries; each merged unit's `AGENT_JOBS` entry calls the old jobs and merges their `loot` into one card (one `fact` line per data source, all `receipts` listed). Lv III power = `G.level >= 3` check inside the job. Saves: `migrateSave()` maps old unit ids to their new owner (`spy→scout`, `trend→scout`, `oracle→booker`, `showrunner→booker`, `herald→diplomat`, `scribe→reader`, `listener→drop`) and keeps the higher `unitXp`. All "12 agents" copy becomes "5 agents" (landing, FEATURES.md, Devpost). `simpleView()`'s "three cheapest" logic goes.

### 6.2 Jobs (`AGENT_JOBS`) stay; their return shape grows

Each job returns `{ line, intel, float, night, loot }` where the new **`loot`** is:

```js
loot: { fact: "Your Chicago fans also love Cadillac, The Breakfast Club, Harold's Chicken", receipts: ["Qloo brands × Chicago"], gold: 0, xp: 40,
        mapChange: "fog lifted · Chicago costs 3 orders, not 4", questChange: null | "tour stop 3 of 6 complete", realMove: { title, detail } }
```

`jobAt()` stores it on the unit (`u.lastLoot`) and pushes it to `G.report.loot[]` (§7.6). Every job **must** fill `fact`, `receipts` and at least one of `mapChange` / `questChange` / `gold`. A job that comes back empty returns `fact: "Qloo had nothing distinctive here"` with `mapChange: "nothing changed"` and **no XP** — honesty over reward.

### 6.3 Targets: 3 suggestions per unit (`missionTargets(id)` exists; extend)

For the selected unit, rank cities and return 3 chips `{ city, label, get }`:

- **scout:** fog cities nearest the capital → `"Seattle (uncharted)"`; then the biggest open cities.
- **booker:** held cities without a venue first → `"Nashville (fills stop 3)"`; then held cities with a venue (backup room).
- **sponsor:** held cities without a sponsor, biggest fans first.
- **diplomat:** candidate allies (existing `strategy === "ally"` factions and `c.allies`) → label is the **person**, not the city: `"Regina King (Atlanta)"`.
- **reader:** the next battle target (`c.territory.target`, any `defend` order's city, the ripe city) → `"Chicago (before the fight)"`.
- Scout chips flag a rival heading to that city: `"Atlanta (Anderson is coming)"`.
- Lv III powers reuse the same chips: Booker's festival night only on held cities with a venue; Diplomat's podcast chips are podcast names.

Each chip also shows `get` on hover (the Brings-back line specialised: "fills stop 3", "+60 gold/wk").

When the AI layer is on (`aiCheck()`), `aiPlan()`'s first three steps **re-rank** the chips (the AI's recommended unit+city moves to position 1 with a small "strategist" tag). The AI never adds cities that aren't on the map.

### 6.4 Orders → END WEEK execution

1. Click unit → click chip (or map city) → `orderQueue.push({unitId, city, label})`, `ordersLeft--`, unit `state: "ordered"`, dashed march line drawn. Clicking the same chip again cancels (refund).
2. **Battles and parleys are orders too:** a `defend` order on a besieged city, a `take` order on a ripe/rival city (shown as a 7th "unit": **You** — "Take Chicago · 64%"; see §6.7), and the Diplomat's parley.
3. **END WEEK** runs `endWeek()` (§7): for each queued order in this sequence: moves → jobs (await, in parallel with `Promise.all` but **revealed one at a time** in the show) → battles → rival moves → income → headline → report screen.
4. Marching takes **0 real seconds of waiting**: the march animation plays inside the show (1.2 s per unit, overlapping). `SPEED`/`dur` are only used to animate.

### 6.5 Unit progression (stars)

`unitXp` per unit: ★ at 0, ★★ at 100, ★★★ at 250. Effects: ★★ = +10% on the unit's numbers (scout: 4 brands instead of 3; booker: 3 rooms; sponsor: +10 gold/wk; reader: +5% odds; scout: sees rivals 3 weeks ahead), ★★★ = the job also runs in the **adjacent** held city for free. Star-up is announced in the show as loot ("Scout ★★ → ★★★").

### 6.6 Tour Planner and X-ray become outcomes, not buttons

- When the tour quest reaches 4+ booked stops, the Booker's loot adds `"Tour Planner ready: see the route"` → opens the existing `/tour/:id` plan (`tourHtml()`), pre-filled from the quest slots.
- The Room reader's ★★ loot offers "X-ray your last 6 videos with these fans" → opens the existing X-ray sheet.

### 6.7 "You" as a unit (take / defend)

A pinned first row in the rail: portrait, `You · Lv II`, `Does: fight for a city with your material`, `Brings back: the city (and its tour stop)`. Targets: the ripe city, any besieged city (`Defend <city>`), the nemesis's weakest city. Chip shows odds from `oddsFor()`. The battle itself resolves inside the show (§7.2) with the existing 5-round `battleRounds()`.

---

## 7. Screen 2: END WEEK, "the show" (replaces the current `endWeek()` banners)

Mockup artboard `WeekResult.dc.html`. A full-screen overlay `#weekshow` (new) that plays in **6 seconds** then stays as a report until `WEEK N+1 · GIVE ORDERS` is pressed. Every beat has a sound (reuse `Sound`: `select`, `potion`, `conquer`, `threat`, `lost`, `ageup`, `victory`, `week`).

### 7.1 Sequence and timings

| t | beat | what happens on screen |
|---|---|---|
| 0.0 s | curtain | overlay fades in (300 ms), header `Sunday night · Week N of 8`, headline area empty, map stays visible dimmed behind |
| 0.3 s | marches | units' march lines animate to their cities (1.2 s, staggered 250 ms); tokens slide |
| 1.5 s | loot cards | one card per completed job slides in from the right, 400 ms apart, each with its **unit tile, fact, receipts, map change / quest change, XP, gold**; the map behind updates live (fog lifts, badge appears, route extends) |
| 3.5 s | battle (if any) | the battle card: portraits, **crowd meter** (tug bar animating to the odds result over 1.5 s), 5 round rows ticking in 200 ms apart, result stamp `REPELLED` / `TAKEN` / `LOST`, rival line |
| 5.0 s | rival move | if no battle: the nemesis's speech bubble + "Marching on <city> · hits next END WEEK" or "Retreats to <city>"; attack arrow drawn |
| 5.5 s | loot strip + headline | `+gold · +XP · quest N/M · cities ripe` tiles count up (`countTo`); the headline types in (`typeInto`) |
| 6.0 s | done | footer appears: "Do it for real this week" (3 real moves, ticking gives XP) · `Peek: what winning looks like` (opens the win pack preview, §12) · `WEEK N+1 · GIVE ORDERS` |

Skippable: clicking anywhere jumps to 6.0 s. Reduced motion (`REDUCED`): no animation, everything rendered at once.

### 7.2 What `endWeek()` computes (order matters)

1. `G.busy = true`; snapshot `before` (held cities, fog cities, quest state, income) for the diff.
2. Resolve `orderQueue`: for units → `sendUnit` + `arrive` + `jobAt` (await all); for "You" orders → `battle()`/`parley()` **without their own modals** (new `silent: true` flag on both; they return the result object and the show renders it).
3. Sieges tick (existing) → cities fall if ignored (show a `LOST` battle card with "you sent nobody").
4. Rival intents arrive (existing): bounced off walls / siege starts / retreat. One nemesis line via `rivalLine()`.
5. Other rivals act (existing, silent; only in Full view's live calls).
6. Income: `gold += income()`; `ordersLeft = ordersPerWeek()` (§9.1).
7. XP: sum of loot XP + battle XP (win 80 / hold 60) + real moves ticked since last week (200 each, capped 2/wk). Level check (§9.3) → "LEVEL UP" beat inserted before the headline.
8. Quest: `questState()` re-derived; missions `doneWhen` checked → "Mission complete" beat (saffron stamp).
9. Offers for next week (§7.4), at most 2.
10. Headline (§7.5). `G.report = {...}` (§7.6). `G.week++`. Save. If `week > 8` → win/lose screen (§12) instead of the report footer.

### 7.3 Loot card anatomy (one per job; copy from the mockup)

```
[unit tile]  <Unit> came back from <City>                              +40 XP · Scout ★★ → ★★★
             <fact, with the key names in bold>   (<receipts>, N receipts)
             Map: <mapChange>        Quest: <questChange>
```
A card with `gold` shows `+60 gold` in the top-right instead of XP when gold is the main thing. Cards are also written to the ops log (`ops()`) so Full view's "Live calls" still shows the API lines.

### 7.4 Offers (replace timed opportunities)

At the end of the show, up to 2 **offers for next week** appear as small cards under the loot strip, each costing **1 order** and lasting **one week** (no countdown): Trend wave (post on <topic> → +1 order next week), Fan meetup in <city> (city prepared, +0.1 material), <Brand> sponsored post (+90 gold), <Act> is booking an opener (parley at +15 barter). They are queued like orders ("Claim" = an order). Source data: the existing `questTick` pool builder, called once per week with no timers.

### 7.5 Headline generator (`headlineFor(report)`)

Template order, first match wins; names are real:
1. battle won + city taken: `"<You> takes <City> as <Rival>'s crowd thins"`
2. attack held: `"<You> holds <City> as <Rival>'s raid fizzles; <RipeCity> now ripe"`
3. city lost: `"<Rival> takes <City>; <You>'s tour loses a stop"`
4. quest slot filled: `"<City> booked: <You>'s tour hits <n> of <m> stops"`
5. sponsor signed: `"<Brand> backs <You> for <gold>/week"`
6. level up: `"<You> graduates to <Level>"`
7. default: `"Quiet week: <top loot fact>"`.
With the AI on, `/api/agent/write` kind `headline` may rewrite it (≤ 90 chars, must keep every proper noun).

### 7.6 The report object (also the Monday mail source)

```js
G.report = { week, headline, loot: [...], battle: {...}|null, rival: { name, line, next: {city, when} }, income: { gold, orders }, xp: { gained, total, level, levelUp: bool },
             quest: { have, need, changed: [...] }, missions: { completed: [...] }, realMoves: [{ id, title, detail, xp: 200 }], offers: [...] , mapDiff: [{ city, from, to }] }
```
`src/conquest/mail.ts` already builds "what changed / 3 moves"; in P1 make it read `report` from the synced snapshot so the email and the show say the same thing.

---

## 8. Quest engine

### 8.1 `questState()` (derived, never stored)

- **tour:** `slots = tourOrder(heldCities).slice(0,6)` each `{ city, venue?, night?, opener?, sponsor?, post? }`, filled from `G.nights`, `G.sponsors`, `G.drafts`, allies' cities; `have = slots.filter(s => s.venue).length`, `need = 6`.
- **sponsor:** `have = G.sponsors.length`, `need = 3`, plus `proven = any reaction ≥ 4 on a sponsored post`.
- **city:** 4 sub-slots on `objCity`: held, room, ally-or-guest, night.
- **collab:** `have = accepted parleys + guest spots`, `need = 3`, offered ≥ 5.

### 8.2 Missions (`buildMissions(objective)`)

Four per objective, weeks `[1,2] [3,4] [5,6] [7,8]`; copy from the mockup's `missions` arrays. Each has `doneWhen(G)`: e.g. tour: `held() >= 3` → `bookedStops() >= 3` → `G.taken >= 1` → `bookedStops() >= 6`. A mission can complete early; the next unlocks immediately. A missed mission (week passes) stays open with a "late" tag, no penalty, so the player is never stuck.

### 8.3 Missions sheet

Click the quest bar → the existing `sheet()` drawer shows the 4 missions (number tile, title, how, "Done when", state), the win rule, "Change objective" (returns to screen 0 with progress kept).

### 8.4 Win / lose

At `week > 8`: win if `winWhen(G)`; otherwise "CAMPAIGN COMPLETE" with the pack **partially filled** (never "DEFEAT" for a creator who did the real moves: if `G.realDone >= 5`, the title is "GROUNDWORK DONE"). Score stays for the leaderboard (§10.5) but is **not** on the win screen's first fold.

---

## 9. Economy and progression

### 9.1 Orders replace buzz

`ordersPerWeek() = 3 + (level >= 3 ? 1 : 0) + (allies >= 2 ? 1 : 0)`, max 5. Offers can add +1 for one week. Every action costs exactly 1 order (battles included; the old ⚡ costs go). `COST` and `costOf()` are only used for the **"prepared city costs 1 less"** rule, re-expressed as: an unprepared rival city needs **2 orders** (two consecutive weeks: "lay the groundwork" then "strike"), a prepared one needs 1.

### 9.2 Clock removal

`Clock` keeps only `fmt`/`nightAt` (the map's day/night shading uses a fixed "Sunday 20:00" look inside the show and "Wednesday noon" otherwise). Delete `tick()`'s hour advance, the pause/fast buttons, `#clock` from the default view, `questTick(dt)`. `absH()` returns `(week-1)*168 + 12` so existing ETA maths doesn't break.

### 9.3 Levels (XP, not conquest %)

| Lv | name | XP | unlocks |
|---|---|---|---|
| I | Open Mic | 0 | the six base units |
| II | Club Circuit | 300 | +1 target chip per unit (4), rival trash talk |
| III | Theater Tour | 800 | every agent's second power (§6.1); +1 order/week |
| IV | Arena Headliner | 1600 | 2 campaigns side by side (P2), gambles at better odds |
| V | Legend | 3000 | leaderboard crown |

New campaigns start at **Lv II with 0 XP shown as "380 XP to Theater Tour"** if `conquest ≥ 20` (so demo players feel progress fast), else Lv I. XP sources: loot (§6.1), battles, real moves ticked (200, max 2/wk), missions (150), achievements (keep `ACH`, 250). Conquest % stays as a hidden stat and feeds the share card only.

### 9.4 Gold

Unchanged sources (15/city/week + sponsors + stationed yields now **per week**, not per day: multiply `YIELD` by 7 and apply at END WEEK). Spent on: walls (80), gambles (§10.1).

---

## 10. Fun systems (five)

### 10.1 Gambles (P1)
Some target chips carry a second, riskier option: `Safe · 1 order · +1 stop` vs `All-in · 2 orders + 100 gold · 30%: +3 stops, 70%: nothing`. Only on rival cities and sponsor pitches. Shown as a split chip; the all-in branch plays as a battle card with a 3-round "the night" roll. Lv IV improves odds by 10 points. Never on `defend`.

### 10.2 Rival draft (P1)
On screen 0, under "Who's in your way", a **"Change nemesis"** link lists the 3 rivals Qloo found with overlap %, fame and cities. Picking a bigger name = harder (attacks 2 of 3 weeks) but their cities are worth +50% XP and the headline says "giant slayer". Data exists in `c.rivals`.

### 10.3 Random events (P1)
Once a week, 40% chance, injected into the show between loot and battle, built from live data so they're never fake: **"A trend broke in <state>"** (Trends; +1 free order if you send the Scout there), **"<Rival>'s views spiked +N%"** (Wikipedia; their next attack is 2 cities instead of 1), **"Rain all weekend in <city>"** (Open-Meteo; that stop's night moves), **"A fan started a thread about you"** (panel quote; +0.1 material), **"<Brand> dropped a competitor"** (Qloo; sponsor pitch at +20 odds). Each is a card with a choice of 2 responses (both free), so events are decisions, not notifications.

### 10.4 Venue collection (P2)
Every booked room becomes a **venue card** (name, city, size, fit %, the night you played, the fan quote). A "Rooms" sheet shows the collection; 10 rooms = "Circuit" badge, 25 = "Theater" badge. The share card shows your 3 best rooms.

### 10.5 Leaderboard of real performers (P2)
`/api/leaderboard` (new, server): the top 20 campaigns by XP across saved campaigns (`db.saveCampaign` already syncs snapshots), shown by performer name + level + stops booked. Demo players (Jason / Cedric / Dodgers) seed it. The judge sees "you're #4 behind Cedric" on the win screen.

---

## 11. The agent outcome rule (applies to every unit, every report, every button)

Every outcome surface shows the same five things, in this order, and nothing else:
1. **The fact** (real, with the key names bold).
2. **The receipt** (`Qloo places × Nashville`, `Open-Meteo 16-day`, `Wikipedia 30d`), clickable to the Live calls log.
3. **What changed on the map** (or "nothing changed").
4. **What it did for your quest** (slot filled / odds up / gold per week) **or XP**.
5. **The real move** it created (one line, added to Real moves with its asset: email, .ics, DM).

If a unit cannot produce 1–2 it says so ("Qloo had nothing distinctive here") and awards nothing. The unit card's `last report` section (existing `AGENT_EXPLAIN`/`keepReport`) renders the same five lines.

---

## 12. Screen 3: the win screen is the deliverable

Mockup artboard `TourPack.dc.html`. Replaces `#victory`'s stats list (stats move to a "Campaign" line and the share card).

**Tour pack (P0):** H1 `YOUR TOUR IS BOOKED` (or `YOUR TOUR: 4 OF 6 STOPS` if unfinished) → left: route map (reuse the canvas with only your cities + the route, numbered gold tokens) + `Nov 13 – Dec 5 · 1,480 miles · 2 fly legs · 6 nights` (from `/api/tour/plan` when 4+ stops) + campaign line → right: the 6-row table `# · City/night · Room (Booker) · Opener (Diplomat) · Sponsor (Sponsor scout) · Post (Copywriter)` with "—" for empty cells and a receipt tooltip per cell → footer buttons: `Calendar (.ics, N nights)` (`downloadIcs()`), `N City Briefs (PDF)` (`/briefs/:cid`), `N venue emails · N sponsor pitches · N DMs` (opens the Real moves sheet filtered to assets), `Share card` (`openShare()`), `NEW CAMPAIGN · LV III` (keeps XP, resets the board).

**Other packs (P1):** sponsor pack (3 pitches + the sponsored post + expected gold/week), city pack (the brief for `objCity` + room + ally DM + podcast pitch), collab pack (5 DMs + podcast list + the co-headline offer).

Also reachable mid-game as a **preview** ("Peek: what winning looks like" in the show footer) with empty cells greyed, so the outcome is visible from week 1.

---

## 13. UI polish rules (apply everywhere in the game screens)

1. **Type:** Inter Tight for UI (13/14/15/17 px), Cinzel only for: level names, section headers (15–16 px, tracking 0.1em), END WEEK, headlines, stamps. IBM Plex Mono for every number that changes (gold, orders, fans, XP, odds).
2. **Colour tokens** (already in the mockup): bg `#0b0d14`, panel `#141827`, panel-2 `#0f1220`, border `#262c40`, text `#e9e7f2`, muted `#9a9db3` (never lighter than this on panels: 4.5:1), you `#af50ff`, nemesis `#ff5c7a`, saffron `#f0c46a`, good `#3dff9a`, open `#4a4e58`. One violet CTA per screen.
3. **Icons:** inline SVG from `PATHS`, 2 px stroke, never emoji. Add missing keys: `scout` (magnifier), `booker` (ticket), `sponsor` (briefcase), `diplomat` (dove), `reader` (masks), `walls` (shield), `route` (path), `crown`, `xp` (star).
4. **Spacing:** 8-px grid; cards 12–14 px radius, 14–16 px padding; rail gap 10 px; top bar 12 px vertical.
5. **States for every control:** default / hover (+6% lightness) / selected (violet border + `#1e1535`) / disabled (40% opacity + tooltip saying why) / busy (shimmer on the icon tile, never a spinner over text).
6. **Motion:** 200 ms ease-out for state changes, 400 ms for cards entering, 600 ms for map changes (fog lift, route draw), 1.5 s for the crowd meter. Nothing loops except the END WEEK glow (3 s breathe) and the march lines' dash offset. Respect `REDUCED`.
7. **Copy voice:** second person, present tense, concrete nouns, no exclamation marks except in rival dialogue, no "Great!". Every button says what happens (`Send Booker to Nashville`, never `Confirm`).
8. **Numbers have units and sources:** `1.9k fans (Qloo)`, `89% crowd fit`, `+60 gold/wk`.
9. **One thing glows:** at any moment exactly one element is the suggested next click (selected unit's chip #1, or END WEEK when orders are 0). Implement as a `.next` class moved by `renderPrimary()`.
10. **Mobile (<768):** top bar wraps to 2 rows (hero + gold/orders, then quest slots scroll horizontally), map 60vh, rail below, END WEEK sticky at the bottom; the show is a vertical scroll of the same cards.

---

## 14. Onboarding: the first 60 seconds (replaces `Coach` steps)

After START WEEK 1, a 4-step coach (same `#coach` UI, dim + spotlight):
1. Spot the quest bar: `This is what you're playing for: a 6-stop tour. Every slot you fill here is a real date.` (Continue)
2. Spot the army rail, pre-select the Booker, highlight chip 1: `Your army does the work. The Booker finds a room in Nashville — real venue, real crowd fit. Click the chip.` (advances on the click)
3. Spot END WEEK with 1 order queued: `Nothing moves until you press this. Press it and watch the week play out.` (advances on the click)
4. Inside the show, at the loot card: `That's real data, and it just filled a tour stop. Three orders a week. Go.` (Play)
`conquest-coached` flag as today. The jury tour (`runTour`) is re-cut to: objective → 2 orders → END WEEK show → battle → win-pack peek → share card (≈ 60 s).

---

## 15. Copy bank (final strings)

- Quest bar: `QUEST: BOOK A TOUR` · `3 of 6 stops · each held city with a booked room = a stop`
- Orders tile: `orders left` · empty state tooltip: `No orders left. Press END WEEK.`
- Rail hint: `Click a unit, then where to send it · 3 orders a week`
- Under END WEEK: `No clock. Nothing moves until you press this. Then your army marches, reports back, and the rival makes his move.`
- Show header: `Sunday night · Week N of 8`
- Battle stamps: `REPELLED` / `TAKEN` / `LOST` / `HELD`
- Footer: `Do it for real this week (unlocks +200 XP when ticked)`
- Win: `YOUR TOUR IS BOOKED` / `YOUR TOUR: N OF 6 STOPS` / `GROUNDWORK DONE`
- Empty job: `Qloo had nothing distinctive here. Nothing changed.`
- Rival lines: keep `rivalLine()`'s pool; add `retreat` kind: `"Fine. Keep your <tag> crowd. I'm bringing <city> next time."`

---

## 16. Tests and acceptance

**Unit tests (`tests/`, node test runner, fake data):** `questState()` for each objective; `buildMissions()` doneWhen progression; `headlineFor()` template order; `ordersPerWeek()`; save v1 → v2 migration; `endWeek()` with a stubbed `AGENT_JOBS` resolves all queued orders and produces a report with one loot card per order.

**Browser check (preview on :5173):** new campaign as Cedric → objective screen shows 4 cards and tour missions → START WEEK 1 → coach step 2 queues a Booker order → END WEEK → show plays ≤ 7 s, one loot card, quest bar `1 of 6` → week 2 has 3 orders → send You to the ripe city → battle card resolves → week 8 → win screen has a route, table, .ics button works → reload → welcome-back resumes at the right week.

**The cold test (the real acceptance):** someone who has never seen it plays 2 minutes without help. Pass = by 30 s they can say what they're trying to do, by 60 s they've pressed END WEEK on purpose, by 120 s they can name one real thing they'd do this week. Run it on 2 people before recording the video.

---

## 17. Implementation order (P0), with file map

| # | step | files | ~h |
|---|---|---|---|
| 1 | Data model + save v2 + clock removal (`Clock.tick` no longer advances; `absH` fixed; `questTick` disabled; orbs hidden) | `app.js` §3, §9.2 | 1.5 |
| 2 | Objective screen (`OBJECTIVES`, `intro()` rewrite, `buildMissions`) | `app.js`, `index.html` (`#intro-body` markup → the 4-card layout; CSS) | 2 |
| 3 | Quest bar + `questState()` + missions sheet | `app.js`, `index.html` (`#goalbar` → `#quest`) | 1.5 |
| 4 | Army rail: unit rows with Does/Brings back, selection, 3 target chips, order queue, orders tile, END WEEK button; pre-hire six | `app.js` (`renderAgents`, `missionTargets`, new `renderOrderBox`, `queueOrder`), `index.html` (`#army`, remove `#slot-next` bar), CSS | 3 |
| 5 | Map changes: 3 colours, fog hatch, route, march/attack lines, badges, hover, always-on legend | `app.js` `MapView.drawLayer/frame`, `drawTour`, `drawArmy` | 2.5 |
| 6 | Jobs return `loot`; `jobAt` stores it; XP + stars | `app.js` `AGENT_JOBS`, `jobAt`, `unitXp` | 1.5 |
| 7 | `endWeek()` rewrite + the show overlay (`#weekshow`) with the 7 beats, offers, headline, report | `app.js`, `index.html`, CSS | 4 |
| 8 | Battle/parley `silent` mode rendering inside the show; "You" row | `app.js` `battle`, `parley`, `execute` → `resolveYouOrder` | 1.5 |
| 9 | Win screen = tour pack (+ preview) | `app.js` `victory`, `index.html` `#victory` | 2 |
| 10 | Coach rewrite + jury tour re-cut | `app.js` `Coach`, `runTour` | 1 |
| 11 | Icons for units, polish pass per §13, mobile stack | `app.js` `PATHS`, CSS | 1.5 |
| 12 | Tests + the browser check + cold test | `tests/` | 1.5 |

Total ≈ 23 h. Cut from the bottom if needed (11 → 10 → 9's preview → 8's "You" row becomes the old `execute()` modal).

**Delete when done:** `Clock.toggle/fast/finishWeek`, `#clock` buttons, `#orbs` and `orb()`, `questTick`/`questLeft`/`questClock`, `BUZZ_MAX`/`regen()`, `council()`'s own panel (keep `aiPlan()` for target re-ranking and the headline), `simpleView()`'s cheapest-three logic, `tutorialPick()`.

**Docs to update after:** `docs/FEATURES.md` §3–5 (the loop), `docs/DEMO-SCRIPT.md` (new 60-s script), `README.md` "Run it" unchanged.
