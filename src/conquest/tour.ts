import { METROS, miles, driveHours, type Metro } from "./geo.js";

/**
 * The Tour Planner. Pure functions first (scoring, routing, nights, exports),
 * so they test without any network; planTour() gathers the live data (Qloo
 * fans and venues, Google Trends, Open-Meteo) and every number keeps the
 * receipt it came from.
 */

export type TourInput = { home: string; start: string; end: string; maxCities?: number; maxDriveHours?: number; flyingOk?: boolean; roomSize?: "small" | "mid" | "large" };
export type Receipt = { source: string; ref?: string; detail?: string; at: string };
export type Venue = { name: string; fit: number; bucket: string; address?: string | null; phone?: string | null; website?: string | null };
export type Candidate = {
  city: string; geo: Metro; fans: number; venues: Venue[]; trend: number; trendNote: string;
  wx: { date: string; rain: number }[] | null; rival: "held_by_rival" | "ally" | "open" | "yours"; rivalName?: string | null; receipts: Receipt[];
};
export type Scored = Candidate & { score: number; parts: Record<string, number> };

export const WEIGHTS = { fans: 40, venue: 20, trend: 15, weather: 15, rival: 10 };

/** share of evenings in the window with < 40% rain; null when the window is beyond the forecast */
export function dryShare(wx: Candidate["wx"], start: string, end: string): number | null {
  const days = (wx ?? []).filter((d) => d.date >= start && d.date <= end);
  return days.length ? days.filter((d) => d.rain < 40).length / days.length : null;
}

export function scoreCities(cands: Candidate[], start: string, end: string): Scored[] {
  const maxFans = Math.max(1, ...cands.map((c) => c.fans));
  return cands.map((c) => {
    const fans = c.fans > 0 ? Math.log1p(c.fans) / Math.log1p(maxFans) : 0;
    const venue = (c.venues[0]?.fit ?? 0) / 100;
    const dry = dryShare(c.wx, start, end), weather = dry ?? 0.5; // unknown weather counts as average
    const rival = c.rival === "ally" || c.rival === "yours" ? 1 : c.rival === "held_by_rival" ? 0 : 0.5;
    const parts = { fans: fans * WEIGHTS.fans, venue: venue * WEIGHTS.venue, trend: c.trend * WEIGHTS.trend, weather: weather * WEIGHTS.weather, rival: rival * WEIGHTS.rival };
    const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
    return { ...c, score, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
  });
}

/** open path from home: greedy nearest neighbour, then 2-opt until no swap helps */
export function route(home: Metro, stops: { geo: Metro }[]): number[] {
  const left = stops.map((_, i) => i), order: number[] = [];
  let at = home;
  while (left.length) {
    let best = 0;
    for (let k = 1; k < left.length; k++) if (miles(at, stops[left[k]!]!.geo) < miles(at, stops[left[best]!]!.geo)) best = k;
    const i = left.splice(best, 1)[0]!; order.push(i); at = stops[i]!.geo;
  }
  return twoOpt(home, stops, order);
}
export function pathMiles(home: Metro, stops: { geo: Metro }[], order: number[]): number {
  let d = 0, at = home; for (const i of order) { d += miles(at, stops[i]!.geo); at = stops[i]!.geo; } return d;
}
export function twoOpt(home: Metro, stops: { geo: Metro }[], order: number[]): number[] {
  let best = order.slice(), bestD = pathMiles(home, stops, best), improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
      const next = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)], d = pathMiles(home, stops, next);
      if (d + 1e-9 < bestD) { best = next; bestD = d; improved = true; }
    }
  }
  return best;
}

export type Leg = { from: string; to: string; miles: number; hours: number; mode: "drive" | "fly" };
/** every leg over the drive cap is marked "fly" */
export function legs(home: { city: string; geo: Metro }, stops: { city: string; geo: Metro }[], maxDriveHours: number): Leg[] {
  let at = home; return stops.map((s) => { const h = driveHours(at.geo, s.geo), m = Math.round(miles(at.geo, s.geo)); const leg: Leg = { from: at.city, to: s.city, miles: m, hours: Math.round(h * 10) / 10, mode: h > maxDriveHours ? "fly" : "drive" }; at = s; return leg; });
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 Sun .. 6 Sat
export const SHOW_DAYS = [4, 5, 6]; // Thu, Fri, Sat

/**
 * One night per stop, in route order: the earliest Thu/Fri/Sat after the last
 * show (plus a travel day when the leg is over 4 hours), taking the driest of
 * that week's Thu-Sat when a forecast exists. Stops that don't fit the window
 * come back with night = null.
 */
export function assignNights(stops: { wx: Candidate["wx"] }[], lg: Leg[], start: string, end: string): (string | null)[] {
  let earliest = start; const out: (string | null)[] = [];
  stops.forEach((s, i) => {
    if (lg[i]!.mode === "drive" && lg[i]!.hours > 4) earliest = addDays(earliest, 1); // a travel day after a long drive
    let d = earliest; while (d <= end && !SHOW_DAYS.includes(dow(d))) d = addDays(d, 1);
    if (d > end) { d = earliest; } // no Thu-Sat left: take the earliest day
    if (d > end) { out.push(null); return; }
    // within this Thu-Sat run, prefer the driest night we have a forecast for
    const run = [d, addDays(d, 1), addDays(d, 2)].filter((x) => x <= end && SHOW_DAYS.includes(dow(x)));
    const rainOf = (x: string) => s.wx?.find((w) => w.date === x)?.rain;
    const dry = run.filter((x) => rainOf(x) != null).sort((a, b) => rainOf(a)! - rainOf(b)!)[0];
    const night = dry && rainOf(dry)! + 15 < (rainOf(d) ?? 0) ? dry : d;
    out.push(night); earliest = addDays(night, 1);
  });
  return out;
}

/** a room's size, guessed from its name (Qloo doesn't give capacity), stated as a guess */
export function bucketOf(name: string, tags: string[] = []): string {
  const t = (name + " " + tags.join(" ")).toLowerCase();
  if (/arena|stadium|amphithea|coliseum|pavilion|center\b|centre\b/.test(t)) return "400+";
  if (/theat(er|re)|hall|ballroom|auditorium|opera|palace|music venue/.test(t)) return "150–400";
  if (/comedy|improv|club|bar|lounge|cafe|café|tavern|pub|saloon|brewery|bistro|room/.test(t)) return "50–150";
  return "unknown";
}
const WANT = { small: "50–150", mid: "150–400", large: "400+" } as const;
export function pickRooms(venues: Venue[], size?: TourInput["roomSize"]): Venue[] {
  if (!size) return venues.slice(0, 2);
  const want = WANT[size], ok = venues.filter((v) => v.bucket === want || v.bucket === "unknown");
  return [...ok, ...venues.filter((v) => !ok.includes(v))].slice(0, 2);
}

export type Stop = {
  n: number; city: string; state: string; tz: string; night: string | null; venue: Venue | null; backup: Venue | null;
  fans: number; score: number; parts: Record<string, number>; fit: number | null; drive: Leg; why: string;
  confidence: { level: "high" | "medium" | "low"; reason: string }; receipts: Receipt[];
};
export function confidenceOf(c: Candidate, night: string | null): Stop["confidence"] {
  const signals = [c.fans > 0 && "Qloo fans", c.venues.length > 0 && "Qloo venue fit", c.trendNote !== "unavailable" && "Google Trends", c.wx?.some((w) => w.date === night) && "a forecast for the night"].filter(Boolean) as string[];
  const level = signals.length >= 4 ? "high" : signals.length >= 2 ? "medium" : "low";
  return { level, reason: `${signals.length} of 4 signals: ${signals.join(", ") || "none"}` };
}
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export function whyLine(c: Scored, night: string | null): string {
  const bits = [`${c.fans.toLocaleString()} fans (Qloo)`];
  if (c.venues[0]) bits.push(`${c.venues[0].name} fits ${c.venues[0].fit}%`);
  const rain = night ? c.wx?.find((w) => w.date === night)?.rain : undefined;
  if (rain != null) bits.push(`${rain}% rain ${nice(night!)}`);
  if (c.trend >= 0.7) bits.push(c.trendNote);
  if (c.rival === "held_by_rival" && c.rivalName) bits.push(`take it back from ${c.rivalName}`);
  if (c.rival === "ally" && c.rivalName) bits.push(`ally ${c.rivalName} is here`);
  return bits.join(" · ");
}

export function buildPlan(input: TourInput, cands: Candidate[]) {
  const home = METROS[input.home]; if (!home) throw new Error(`unknown home city: ${input.home}`);
  const maxCities = Math.max(1, Math.min(12, input.maxCities ?? 6)), cap = input.maxDriveHours ?? 5;
  const scored = scoreCities(cands.filter((c) => c.city !== input.home), input.start, input.end).sort((a, b) => b.score - a.score).slice(0, maxCities);
  const order = route(home, scored), stopsC = order.map((i) => scored[i]!);
  const lg = legs({ city: input.home, geo: home }, stopsC, cap), nights = assignNights(stopsC, lg, input.start, input.end);
  const stops: Stop[] = stopsC.map((c, i) => {
    const rooms = pickRooms(c.venues, input.roomSize);
    return { n: i + 1, city: c.city, state: c.geo.state, tz: c.geo.tz, night: nights[i] ?? null, venue: rooms[0] ?? null, backup: rooms[1] ?? null, fans: c.fans, score: c.score, parts: c.parts,
      fit: rooms[0]?.fit ?? null, drive: lg[i]!, why: whyLine(c, nights[i] ?? null), confidence: confidenceOf(c, nights[i] ?? null), receipts: c.receipts };
  });
  const booked = stops.filter((s) => s.night);
  return {
    input: { ...input, maxCities, maxDriveHours: cap },
    stops, legs: lg,
    totals: { nights: booked.length, fansReachable: booked.reduce((a, s) => a + s.fans, 0), miles: lg.reduce((a, l) => a + l.miles, 0), driveHours: Math.round(lg.filter((l) => l.mode === "drive").reduce((a, l) => a + l.hours, 0) * 10) / 10, flights: lg.filter((l) => l.mode === "fly").length },
    weights: WEIGHTS,
    method: "Score = 40% fans (log, Qloo) + 20% venue crowd fit (Qloo) + 15% trend lift (Google Trends) + 15% dry evenings (Open-Meteo, 16-day forecast; unknown counts as average) + 10% rival pressure. Route = nearest neighbour + 2-opt; drive time = straight-line miles / 55 mph.",
  };
}
export type Plan = ReturnType<typeof buildPlan> & { id?: string; performer?: string; generatedAt?: string; ai?: { model: string } | null };

// --- exports ---
const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(p: Plan): string {
  const head = ["#", "City", "State", "Night", "Venue", "Backup", "Fit %", "Fans", "Drive from previous", "Mode", "Score", "Confidence", "Why"];
  const rows = p.stops.map((s) => [s.n, s.city, s.state, s.night ?? "doesn't fit the window", s.venue?.name ?? "", s.backup?.name ?? "", s.fit ?? "", s.fans, `${s.drive.miles} mi / ${s.drive.hours} h`, s.drive.mode, s.score, s.confidence.level, s.why]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function toText(p: Plan): string {
  return [`Tour plan${p.performer ? ` · ${p.performer}` : ""} · ${p.input.start} to ${p.input.end} · from ${p.input.home}`, "",
    ...p.stops.map((s) => `${s.n}. ${s.night ? nice(s.night) : "(no night in window)"} · ${s.city}, ${s.state} · ${s.venue?.name ?? "venue: send a Booker"}${s.backup ? ` (backup: ${s.backup.name})` : ""} · fit ${s.fit ?? "?"}% · ${s.drive.mode === "fly" ? "fly" : `${s.drive.hours} h drive`}\n   ${s.why}`),
    "", `${p.totals.nights} nights · ${p.totals.fansReachable.toLocaleString()} fans reachable · ${p.totals.miles.toLocaleString()} miles`, "", `Method: ${p.method}`].join("\n");
}
/** one event per night at 8 pm local time in the stop's own time zone */
export function toIcs(p: Plan): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ev = p.stops.filter((s) => s.night).flatMap((s) => {
    const d = s.night!.replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:conquest-tour-${p.id ?? "plan"}-${s.n}@conquest.agent`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${s.tz}:${d}T200000`, `DTEND;TZID=${s.tz}:${d}T220000`,
      `SUMMARY:${esc(`Show: ${s.city}${s.venue ? ` · ${s.venue.name}` : ""}`)}`, `LOCATION:${esc(s.venue?.address ?? `${s.venue?.name ?? ""} ${s.city}, ${s.state}`.trim())}`, `DESCRIPTION:${esc(`${s.why}\nBackup: ${s.backup?.name ?? "none"}\nPlanned with Conquest`)}`, "END:VEVENT"];
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Conquest//Tour Planner//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
}
