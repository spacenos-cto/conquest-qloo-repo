// The cut. Times are output seconds within each segment. Rects are in the app's CSS
// pixels (1440×900), for both footage frames and the 2× stills.
const FULL = [0, 0, 1440, 900];
const T = "take3", C = "cmp";
const card = (k, h, s = "") => `<div class="k">${k}</div><div class="h">${h}</div>${s ? `<div class="s">${s}</div>` : ""}`;

export const SEGMENTS = [
  // 1 · THE PROBLEM
  { dur: 7, tag: "THE PROBLEM", src: { take: T, from: 0.6, to: 7.6 }, rect: FULL, caps: [
    [0.3, 3.6, "bc", "A comedian with 50,000 followers still picks the next city on <b>gut feel</b>…"],
    [3.6, 6.9, "bc", "…and a promoter who “owes you one.” The data exists. <i>Only headliners can afford someone to read it.</i>"],
  ] },
  { dur: 5, dip: true, card: card("THE PROBLEM", "Agencies pitch what a <i>city</i> likes.<br>Not what <i>your fans</i> like."), caps: [] },
  // 2 · THE TURN
  { dur: 6.5, dip: true, tag: "THE TURN", src: { take: T, from: 9.0, to: 16.4 }, rect: FULL, caps: [
    [0.2, 3.4, "bc", "<b>Conquest</b> turns your real audience into a map, and an army of agents."],
    [3.4, 6.4, "bc", "Built on <b>Qloo's taste graph</b>. One click, no sign-up: play as Cedric the Entertainer."],
  ] },
  { dur: 4.2, tag: "THE TURN", src: { take: T, from: 16.4, to: 24.6 }, rect: FULL, speed: "2×", caps: [
    [0.1, 4.1, "bc", "Qloo finds Cedric's audience: cities, tastes, rivals. Then <b>1,000 fans</b> are simulated from that data."],
  ] },
  { dur: 9.5, tag: "THE TURN", src: { take: T, from: 24.6, to: 34.1 }, rect: FULL, caps: [
    [0.2, 3.5, "bl", "<b>Purple</b>: cities where Qloo finds his fans. <b>Red</b>: his nemesis, the comic who shares the most fans."],
    [3.5, 6.4, "bl", "His goal: <b>book a 6-city tour in 8 weeks</b>. That's the quest bar up top."],
    [6.4, 9.4, "bl", "Five agents. Three orders a week. Every agent runs <b>live calls</b>."],
  ] },
  { dur: 15.5, tag: "THE TURN", src: { take: T, from: 34.1, to: 54.4 }, rect: FULL, caps: [
    [0.1, 4.6, "bl", "<b>Booker → Atlanta</b>: find a room whose crowd fits his (Qloo places + Open-Meteo)."],
    [4.6, 9.0, "bl", "<b>Scout → Memphis</b>: what do his fans there love that the city doesn't? (Qloo + Google Trends)"],
    [9.0, 15.4, "bl", "<b>Cedric himself → take St. Louis</b>. 75% odds, computed from real fan counts and momentum."],
  ] },
  { dur: 7.5, tag: "THE PROOF", src: { take: T, from: 54.4, to: 63.2 }, rect: FULL, caps: [
    [0.1, 3.0, "bl", "Nothing moves until he presses <b>END WEEK</b>."],
    [3.0, 7.4, "bc", "Then the army marches, and the live calls come back as <b>loot</b>."],
  ] },
  // 3 · THE PROOF (2× stills of the week's report)
  { dur: 6.5, tag: "THE PROOF", still: `${T}/still-report.png`, keys: [[0, FULL], [0.9, [655, 262, 770, 433]], [6.5, [665, 268, 750, 422]]], caps: [
    [0.9, 6.4, "bc", "A real room: <b>Cigar City Club, Fri Nov 13, 96% crowd fit</b>. The venue email is already drafted."],
  ] },
  { dur: 7.5, tag: "THE PROOF", still: `${T}/still-report.png`, keys: [[0, [665, 268, 750, 422]], [0.9, [655, 455, 770, 433]], [7.5, [670, 462, 740, 416]]], caps: [
    [0.8, 7.4, "bc", "Beats is #1 for his Memphis fans, and not in Memphis's top 20. <b>Without Qloo you'd have pitched the Grizzlies.</b>"],
  ] },
  { dur: 4.5, tag: "THE PROOF", still: `${T}/still-report.png`, keys: [[0, [670, 462, 740, 416]], [0.8, [660, 545, 680, 382]], [4.5, [668, 550, 664, 373]]], caps: [
    [0.6, 4.4, "bc", "Every card shows its receipts: <b>2 Qloo calls · 1 Google Trends · 1 Wikipedia · 0 claims removed</b>."],
  ] },
  { dur: 7.5, tag: "THE PROOF", still: `${T}/still-report.png`, keys: [[0, [668, 550, 664, 373]], [1.0, [10, 412, 710, 400]], [7.5, [22, 420, 690, 388]]], caps: [
    [0.9, 7.4, "bc", "The battle: five rounds from Qloo fan counts, the simulated fans, Wikipedia momentum and his groundwork. <b>Taken, 61%.</b>"],
  ] },
  { dur: 4.5, tag: "THE PROOF", still: `${T}/still-report.png`, keys: [[0, [22, 420, 690, 388]], [0.9, [180, 10, 1080, 608]], [4.5, [200, 20, 1040, 585]]], caps: [
    [0.8, 4.4, "bc", "Plus a headline, written from what actually happened."],
  ] },
  { dur: 7, tag: "THE PROOF", still: `${T}/still-report2.png`, keys: [[0, FULL], [0.9, [0, 430, 820, 461]], [7, [10, 436, 800, 450]]], caps: [
    [0.8, 3.8, "tc", "The rival answers, and you see his next move <b>a week ahead</b>."],
    [3.8, 6.9, "tc", "Every week ends in <b>three real moves</b> to make in real life."],
  ] },
  // 4 · THE PAYOFF
  { dur: 4.5, tag: "THE PAYOFF", still: `${T}/still-peek.png`, keys: [[0, FULL], [4.5, [60, 30, 1320, 742]]], caps: [
    [0.3, 4.4, "bc", "From week 1 you can peek at the prize: <b>the tour pack</b>."],
  ] },
  { dur: 20, dip: true, tag: "THE PAYOFF", src: { take: T, from: 98.0, to: 268.3 }, rect: FULL, speed: "8× SPEED", caps: [
    [0.3, 10, "bl", "Seven more weeks of real orders and live calls."],
    [10, 19.8, "bl", "Cities flip, rooms get booked, rivals attack, allies join."],
  ] },
  { dur: 5.5, tag: "THE PAYOFF", src: { take: T, from: 268.4, to: 273.9 }, rect: FULL, caps: [
    [0.6, 5.4, "bc", "Week 8. The win screen <i>is</i> the deliverable."],
  ] },
  { dur: 8.5, tag: "THE PAYOFF", still: `${T}/still-pack.png`, keys: [[0, FULL], [1.0, [600, 250, 840, 472]], [8.5, [610, 258, 820, 461]]], caps: [
    [0.9, 8.4, "bc", "Six cities, Nov 13–28: a room with its crowd fit, a dated night, openers, sponsors. <b>Every cell has a receipt.</b>"],
  ] },
  { dur: 7, tag: "THE PAYOFF", still: `${T}/still-pack2.png`, keys: [[0, FULL], [1.0, [0, 380, 920, 517]], [7, [0, 384, 900, 506]]], caps: [
    [0.9, 4.2, "tc", "A calendar file, 6 City Briefs, <b>6 venue emails, 11 sponsor pitches, 4 DMs</b>."],
    [4.2, 6.9, "tc", "<b>Conquest drafts. You send.</b> Nothing is posted or booked without you."],
  ] },
  // 5 · VS THE ALTERNATIVES
  { dur: 10, dip: true, tag: "VS THE ALTERNATIVES", clip: true, still: `${C}/still-compare.png`, keys: [[0, [150, 130, 1140, 495]], [10, [175, 150, 1090, 470]]], caps: [
    [0.4, 5.0, "bc", "Spreadsheets <b>guess</b>. Dashboards <b>look back</b>. Chatbots have <b>no data</b>."],
    [5.0, 9.9, "bc", "Conquest tells you where to go next, does the legwork, and <b>cites its sources</b>."],
  ] },
  // 6 · CLOSE
  { dur: 6, dip: true, card: `<div class="k">UNDER THE HOOD</div><div class="stats">
      <div class="st"><b>~100</b><span>Qloo calls per campaign, each with a receipt</span></div>
      <div class="st"><b>5</b><span>agents on live data: Qloo, Trends, Wikipedia, Open-Meteo</span></div>
      <div class="st"><b>1,000</b><span>fans simulated from Qloo data, and labelled as simulated</span></div>
      <div class="st"><b>$0</b><span>data cost beyond Qloo</span></div></div>`, caps: [] },
  { dur: 6.5, dip: true, card: `<div class="logo">CONQUEST</div><div class="s">Your fans are out there. <b>Go find them.</b></div><div class="url">Play as Cedric, Jason or the Dodgers · one click</div>`, caps: [] },
];
