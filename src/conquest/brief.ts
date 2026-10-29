import { METROS } from "./geo.js";
import { bucketOf } from "./tour.js";

/**
 * City Brief: one printed page per city a manager can forward. Every section
 * is built from a real call (Qloo, Open-Meteo, Google Trends, Wikipedia) and
 * keeps its source; a section with no data says so instead of inventing one.
 */
export type BriefDeps = {
  campaign: (name: string, who: { ids?: string }) => Promise<any>;
  venuesIn: (name: string, who: { ids?: string }, city: string) => Promise<{ status: string; venues: any[]; receipts: any[] }>;
  lovedIn: (name: string, who: { ids?: string }, city: string, target: string, take?: number) => Promise<{ status: string; items: { name: string; affinity: number }[]; receipts: any[] }>;
  trends: (geo: string) => Promise<any>;
  weather: (lat: number, lon: number, days?: number) => Promise<any>;
  fame: (names: string[]) => Promise<any>;
  write?: (kind: "pitch" | "sponsor", context: Record<string, unknown>) => Promise<string | null>; // AI writer, when on
};
export const NO_SIGNAL = "Not enough signal yet — send a Scout.";
const DOMAIN: Record<string, string> = { tv_show: "TV", artist: "Music", brand: "Brand", podcast: "Podcast", movie: "Film" };

export async function buildBrief(d: BriefDeps, o: { name: string; ids?: string; city: string; snapshot?: any }) {
  const who = { ids: o.ids }, at = new Date().toISOString(), geo = METROS[o.city];
  if (!geo) throw new Error(`unknown city: ${o.city}`);
  const camp = await d.campaign(o.name, who);
  const city = (camp?.territory?.cities ?? []).find((c: any) => c.name === o.city);
  const sources: { source: string; detail: string; at: string }[] = [];
  const src = (source: string, detail: string) => sources.push({ source, detail, at });

  const [venues, ...loved] = await Promise.all([
    d.venuesIn(o.name, who, o.city).catch(() => ({ status: "error", venues: [], receipts: [] })),
    ...["tv_show", "artist", "brand", "podcast", "movie"].map((t) => d.lovedIn(o.name, who, o.city, t, 3).catch(() => ({ status: "error", items: [], receipts: [] }))),
  ]);
  const [people, wx, tr] = await Promise.all([
    d.lovedIn(o.name, who, o.city, "person", 3).catch(() => ({ status: "error", items: [], receipts: [] })),
    d.weather(geo.lat, geo.lon, 16).catch(() => null),
    d.trends(`US-${geo.state}`).catch(() => null),
  ]);
  const types = ["tv_show", "artist", "brand", "podcast", "movie"];
  const also = loved.flatMap((l, i) => l.items.map((x) => ({ ...x, domain: DOMAIN[types[i]!]! }))).sort((a, b) => b.affinity - a.affinity).slice(0, 6);
  if (also.length) src("Qloo recommendations", `${also.length} cross-domain affinities for fans in ${o.city}`);
  const rooms = venues.venues.slice(0, 3).map((v: any) => ({ name: v.name, fit: v.fit, bucket: bucketOf(v.name, v.tags), address: v.address, phone: v.phone, website: v.website }));
  if (rooms.length) src("Qloo places", `${rooms.length} rooms in ${o.city}, crowd fit = Qloo affinity`);

  // allies: one local performer and one podcast whose fans overlap
  const podcast = loved[3]!.items[0], person = people.items.find((p) => p.name !== o.name);
  const first = o.name.split(" ")[0];
  const allyRows = await Promise.all([person && { kind: "Performer", ...person }, podcast && { kind: "Podcast", ...podcast }].filter(Boolean).map(async (a: any) => {
    const fallback = a.kind === "Podcast" ? `“Hi! ${a.affinity}% of my fans in ${o.city} listen to you. I'd love to come on when I'm in town.”` : `“Hey ${a.name.split(" ")[0]}, our crowds overlap in ${o.city}. Want to share a bill when I come through?”`;
    const ai = d.write ? await d.write("pitch", { name: o.name, partner: a.name, offer: a.kind === "Podcast" ? "a guest spot" : "a shared bill", city: o.city, netnew: 100 - a.affinity, convert: a.affinity }).catch(() => null) : null;
    return { ...a, pitch: ai ?? fallback, ai: !!ai };
  }));
  if (allyRows.length) src("Qloo recommendations", "local performers and podcasts your fans follow");

  const brand = loved[2]!.items[0];
  let sponsor: any = null;
  if (brand) {
    const fallback = `${o.name} × ${brand.name}: ${city?.you ? city.you.toLocaleString() + " " : ""}fans in ${o.city} love you both`;
    const ai = d.write ? await d.write("sponsor", { name: o.name, brand: brand.name, affinity: brand.affinity, audience: o.city }).catch(() => null) : null;
    sponsor = { name: brand.name, affinity: brand.affinity, subject: ai ? ai.split("\n")[0]!.replace(/^Subject:\s*/i, "") : fallback, ai: !!ai };
  }

  // timing: best Fri/Sat in the forecast, plus whatever is trending in the state
  const days: { date: string; rain: number }[] = wx?.status === "ok" ? (wx.days ?? []).map((x: any) => ({ date: x.date, rain: x.rain ?? 0 })) : [];
  const weekend = days.filter((x) => [5, 6].includes(new Date(x.date + "T12:00:00Z").getUTCDay())).sort((a, b) => a.rain - b.rain)[0];
  const trend = tr?.status === "ok" ? (tr.items ?? [])[0]?.title : null;
  if (days.length) src("Open-Meteo", `16-day forecast for ${o.city}`);
  if (tr?.status === "ok") src("Google Trends daily RSS", `US-${geo.state}`);
  const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const timing = weekend ? `${nice(weekend.date)}: ${weekend.rain}% chance of rain, the driest weekend night in the next 16 days.${trend ? ` Trending in ${geo.state} now: “${trend}”.` : ""}` : null;

  // watch out: a rival holding the city, with their momentum
  const liveSide = o.snapshot?.cities?.find((c: any) => c.name === o.city);
  const holderId = liveSide?.owner ?? (city?.state === "rival" ? city.owner : null);
  const holder = (camp?.rivals ?? []).find((r: any) => r.id === holderId || r.name === holderId);
  let watch: string | null = null;
  if (holder) {
    const f = await d.fame([holder.name]).catch(() => null), p = f?.people?.[0];
    if (p?.views != null) src("Wikipedia pageviews", holder.name);
    watch = `${holder.name} holds ${o.city}${p?.momentum != null ? ` and is ${p.momentum >= 0 ? "up" : "down"} ${Math.abs(p.momentum)}% in searches this month (Wikipedia)` : ""}.`;
  } else if (city?.rivals?.length) watch = `No one holds ${o.city} yet; ${city.rivals.slice(0, 2).map((r: any) => r.name).join(" and ")} share your fans here.`;

  // three moves: the performer's real missions here first, then the obvious next steps
  const real = (o.snapshot?.real ?? []).filter((m: any) => !m.done && (m.city === o.city || String(m.text).includes(o.city))).map((m: any) => m.text);
  const moves = [...real,
    rooms[0] && `Email ${rooms[0].name} about a date${weekend ? ` around ${nice(weekend.date)}` : ""}.`,
    also[0] && `Post a bit about ${also[0].name} to your ${o.city} fans.`,
    sponsor && `Send the ${sponsor.name} pitch.`,
    allyRows[0] && `Message ${allyRows[0].name}.`,
  ].filter(Boolean).slice(0, 3) as string[];

  return {
    city: o.city, state: geo.state, performer: o.name, generatedAt: at,
    fans: city?.you ?? null, fansRef: (camp?.receipts ?? []).find((r: any) => r.workflow === "where_popular")?.ref ?? null,
    also, rooms, allies: allyRows, sponsor, timing, watch, moves, sources,
  };
}
export type Brief = Awaited<ReturnType<typeof buildBrief>>;
