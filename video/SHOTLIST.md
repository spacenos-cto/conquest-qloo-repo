# Shot list

All footage is the real app at 1440×900, recorded headless with Playwright from `npm run serve` (`REHEARSAL_DB=./conquest-live.sqlite`, AI layer off, so nothing was spent). Zoom shots use 2× screenshots (2880×1800) taken at that moment in the same run, so text stays sharp. Output: 1920×1080, 30 fps, H.264, AAC.

Source times are seconds into **take 3** (the main run) or the **compare** take.

| # | Out | Len | Source | What's on screen | Move |
|---|---|---|---|---|---|
| 1 | 0:00.0 | 7.0 | take 3, 0.6–7.6 | Opening painting: "You" and "Your crowd" | 1× |
| 2 | 0:07.0 | 5.0 | text card | "Agencies pitch what a city likes. Not what your fans like." | dip from black |
| 3 | 0:12.0 | 6.5 | take 3, 9.0–16.4 | Landing hero; cursor clicks **Play as Cedric the Entertainer** | 1.1× |
| 4 | 0:18.5 | 4.2 | take 3, 16.4–24.6 | "Scouting your territory": seven live steps, the fan cloud | 2× |
| 5 | 0:22.7 | 9.5 | take 3, 24.6–34.1 | War map, legend, cursor to the quest bar | 1× |
| 6 | 0:32.2 | 15.5 | take 3, 34.1–54.4 | Orders: Booker → Atlanta, Scout → Memphis (uncharted), You → Take St. Louis · 75%; END WEEK shows "3 orders queued" | 1.3× |
| 7 | 0:47.7 | 7.5 | take 3, 54.4–63.2 | Cursor to **END WEEK**, click; the show: marches, loot cards, event, battle, rival, headline | 1.2× |
| 8 | 0:55.2 | 6.5 | still `report` | Zoom: Booker card (Cigar City Club, Fri Nov 13, 96% crowd fit, email drafted) | push in |
| 9 | 1:01.7 | 7.5 | still `report` | Zoom: Scout card (Beats #1, "Without Qloo you'd have pitched Memphis Grizzlies") | pan down |
| 10 | 1:09.2 | 4.5 | still `report` | Zoom: receipt line (2 Qloo calls · 1 Google Trends · 1 Wikipedia · 0 claims removed) | push in |
| 11 | 1:13.7 | 7.5 | still `report` | Zoom: Battle for St. Louis, five rounds, crowd meter 61%, **TAKEN** | pan left |
| 12 | 1:21.2 | 4.5 | still `report` | Zoom out to the headline "Cedric takes St. Louis as Anderson's crowd thins" | pull out |
| 13 | 1:25.7 | 7.0 | still `report2` | Zoom: Anthony Anderson · next week ("St. Louis laughs at my stuff now…"), "Do it for real this week" (3 real moves) | push in |
| 14 | 1:32.7 | 4.5 | still `peek` | **Peek: what winning looks like** in week 1 (1 of 6 stops) | slow push |
| 15 | 1:37.2 | 20.0 | take 3, 98.0–268.3 | Weeks 2–8 played for real: orders, END WEEK, shows; map fills | 8.5×, "8× SPEED" badge |
| 16 | 1:57.2 | 5.5 | take 3, 268.4–273.9 | **YOUR TOUR IS BOOKED** win screen appears | 1× |
| 17 | 2:02.7 | 8.5 | still `pack` | Zoom: the six stops (Atlanta, Memphis, St. Louis, Chicago, Detroit, Houston), rooms, fits, openers, sponsors | push in |
| 18 | 2:11.2 | 7.0 | still `pack2` | Zoom: route map + Calendar (.ics, 6 nights), 6 City Briefs, 6 venue emails · 11 sponsor pitches · 4 DMs | push in |
| 19 | 2:18.2 | 10.0 | compare still | "How we compare": spreadsheets + gut feel, social dashboards, generic AI chat, Conquest (named-product table cropped out) | slow push, clipped |
| 20 | 2:28.2 | 6.0 | text card | Under the hood: ~100 Qloo calls · 5 agents · 1,000 simulated fans · $0 beyond Qloo | dip from black |
| 21 | 2:34.2 | 6.5 | end card | CONQUEST · Your fans are out there. Go find them. · Play as Cedric, Jason or the Dodgers | dip from black |

Total 2:40.7.

## Labels on every shot

1. **Chapter tag** top left: THE PROBLEM, THE TURN, THE PROOF, THE PAYOFF, VS THE ALTERNATIVES.
2. **Speed badge** top right when footage is sped up (2×, 8× SPEED).
3. **Cursor**: a drawn pointer with a gold click ring, injected only while recording (headless Chrome has no cursor).

## Known on-screen quirks (left as they are; the footage is unedited)

1. The win screen's "Campaign: 0 cities taken" line undercounts cities taken (an app counter issue). Shot 18's caption sits over it.
2. The Booker's "driest night this week: Thu, Oct 29" comes from the cached weather call (recorded Oct 30).
3. The Google Trends terms in Memphis ("binance hacked", …) are whatever was trending when the cache was warmed.
