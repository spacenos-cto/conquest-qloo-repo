import type { Fingerprint, Aggregate } from "../qloo/types.js";
import type { TribeStrip } from "../tribe/strip.js";
import type { Partner } from "./partners.js";

/**
 * Conquest: the audience as a map to win.
 *
 * Every city Qloo places this audience in gets two real numbers:
 *   presence — how much of the audience lives there (Qloo where_popular, 0..1)
 *   reaction — how the material landed with the simulated people there (panel mean)
 * Rivals (performers fighting for the same fans) bring their own Qloo footprint;
 * a rival owns a city where it is clearly more of their ground than yours (each
 * footprint measured against that act's own best city). Each city is then:
 *   stronghold  yours, and the material lands
 *   frontline   yours, but the material isn't landing
 *   beachhead   few of your fans yet, but it lands: take it next
 *   hard        few fans and it doesn't land
 *   rival       a rival's footprint there is bigger than yours
 *   uncharted   too few simulated people there to read honestly
 * Conquest % = share of the contested ground (presence) you hold as strongholds.
 */

export type CityState = "stronghold" | "frontline" | "beachhead" | "hard" | "rival" | "uncharted";

export interface City {
  name: string;
  presence: number;
  mean: number | null;
  n: number;
  state: CityState;
  you: number; // your raw footprint there
  owner: string; // "you" or a rival id
  contested: string | null; // a rival close behind you, if any
  rivals: { id: string; name: string; count: number }[];
}

export interface Faction {
  id: string;
  name: string;
  counts: Record<string, number>;
}

export interface Territory {
  cities: City[];
  conquest: number;
  threshold: number;
  capital: City | null;
  target: City | null;
  strongholds: City[];
  frontlines: City[];
  beachheads: City[];
  rivalHeld: City[];
  total: number;
}

export interface RivalPlan {
  id: string;
  name: string;
  overlap: number;
  netnew: number;
  convert: number;
  barter: number;
  holds: string[];
  strategy: "ally" | "compete";
  city: string | null;
  reason: string;
}

export interface Mission {
  id: string;
  kind: "edit" | "ally" | "take" | "hold" | "alliance" | "rivalry";
  title: string;
  detail: string;
  city?: string;
  rival?: string;
  receipt: string;
  gain: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildTerritory(
  fp: Fingerprint,
  agg: Aggregate,
  opts: { you?: Record<string, number>; rivals?: Faction[] } = {},
  minN = 6,
): Territory {
  const max = Math.max(1e-9, ...Object.values(fp.metros));
  const byMetro = new Map(agg.byMetro.map((m) => [m.metro, m]));
  const M = agg.mean;

  // Footprints are compared relative to each act's own best city: a famous
  // actress out-counts a comedian everywhere, but a city is a rival's ground
  // only where it matters more to them than to you.
  const yMax = Math.max(1e-9, ...Object.values(opts.you ?? {}));
  const rMax = new Map((opts.rivals ?? []).map((r) => [r.id, Math.max(1e-9, ...Object.values(r.counts))]));
  const cities: City[] = Object.entries(fp.metros)
    .map(([name, w]) => {
      const presence = w / max;
      const m = byMetro.get(name);
      const n = m?.n ?? 0;
      const you = opts.you?.[name] ?? Math.round(presence * 1000);
      const mine = opts.you ? you / yMax : presence;
      const rivals = (opts.rivals ?? [])
        .map((r) => ({ id: r.id, name: r.name, count: r.counts[name] ?? 0, rel: (r.counts[name] ?? 0) / rMax.get(r.id)! }))
        .sort((a, b) => b.rel - a.rel);
      const top = rivals[0];
      const owner = top && top.rel > mine * 1.15 ? top.id : "you";
      let state: CityState = "uncharted";
      if (owner !== "you") state = "rival";
      else if (m && n >= minN) state = presence >= 0.5 ? (m.mean >= M ? "stronghold" : "frontline") : m.mean >= M ? "beachhead" : "hard";
      const contested = owner === "you" && top && top.rel >= mine * 0.85 ? top.name : null;
      return { name, presence: r2(presence), mean: m ? r1(m.mean) : null, n, state, you, owner, contested, rivals: rivals.map(({ id, name, count }) => ({ id, name, count })) };
    })
    .sort((a, b) => b.presence - a.presence);

  const ground = cities.filter((c) => c.state !== "uncharted");
  const total = ground.reduce((s, c) => s + c.presence, 0) || 1;
  const strongholds = cities.filter((c) => c.state === "stronghold").sort((a, b) => b.mean! - a.mean!);
  const held = strongholds.reduce((s, c) => s + c.presence, 0);
  const frontlines = cities.filter((c) => c.state === "frontline").sort((a, b) => a.mean! - b.mean!);
  const beachheads = cities.filter((c) => c.state === "beachhead").sort((a, b) => b.mean! - a.mean! || b.presence - a.presence);
  const rivalHeld = cities.filter((c) => c.state === "rival").sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));

  return {
    cities,
    conquest: Math.round((held / total) * 100),
    threshold: r1(M),
    capital: strongholds[0] ?? ground.find((c) => c.owner === "you") ?? null,
    target: beachheads[0] ?? frontlines[0] ?? null,
    strongholds,
    frontlines,
    beachheads,
    rivalHeld,
    total,
  };
}

/** For each rival: what they hold, and whether to ally or compete. */
export function rivalPlans(t: Territory, rivals: Partner[]): RivalPlan[] {
  // the rival closest to your taste is your nemesis: always one to fight
  const nemesis = rivals.reduce<Partner | null>((best, r) => (!best || r.overlap > best.overlap ? r : best), null);
  return rivals.map((r) => {
    const holds = t.cities.filter((c) => c.owner === r.id).map((c) => c.name);
    const near = t.cities.find((c) => c.contested === r.name)?.name ?? null;
    const city = holds[0] ?? near;
    const ally = r !== nemesis && r.barter >= 30;
    const where = city ?? "their best city";
    const reason = ally
      ? `${pct(r.netnew)} of their crowd is new to you and ${pct(r.convert)} would cross over. Conquer ${where} together: co-headline, collab, swap shout-outs.`
      : `You share ${pct(r.overlap)} of your taste, so you're fighting for the same fans. Take ${where} by out-playing them there.`;
    return { id: r.id ?? r.name, name: r.name, overlap: r.overlap, netnew: r.netnew, convert: r.convert, barter: r.barter, holds, strategy: ally ? "ally" : "compete", city, reason };
  });
}

export function planMissions(t: Territory, tribe: TribeStrip, allies: Partner[], venues: Partner[], rivals: RivalPlan[] = []): Mission[] {
  const missions: Mission[] = [];
  const pts = (presence: number) => Math.max(1, Math.round((presence / t.total) * 100));
  // recruit someone who isn't already getting their own alliance order
  const ally = allies.find((a) => !rivals.some((r) => r.name === a.name && r.city));
  const venue = venues[0];
  const target = t.target;
  const front = t.frontlines.find((c) => c.name !== target?.name);

  if (tribe.deadZones.length) {
    const fronts = t.frontlines.slice(0, 2).map((c) => c.name);
    missions.push({
      id: "sharpen",
      kind: "edit",
      title: "Sharpen the material",
      detail:
        `Attention drops in ${tribe.deadZones.length} stretch${tribe.deadZones.length > 1 ? "es" : ""} before the punchline. ` +
        `Tighten the setup and it lands harder everywhere${fronts.length ? `, starting with ${fronts.join(" and ")}` : ""}.`,
      receipt: "Brain response (TRIBE) + panel reaction",
      gain: t.frontlines.length ? pts(t.frontlines.reduce((s, c) => s + c.presence, 0) * 0.3) : 2,
    });
  }
  if (ally) {
    missions.push({
      id: "ally",
      kind: "ally",
      title: `Recruit ${ally.name}`,
      detail: `Their fans already over-index on you (${pct(ally.convert)} would cross over), and ${pct(ally.netnew)} of their crowd is new to you. Trade a shout-out, a guest spot or a co-bill.`,
      receipt: "Qloo recommend + taste overlap",
      gain: 3,
    });
  }
  if (target) {
    missions.push({
      id: "take",
      kind: "take",
      city: target.name,
      title: `Take ${target.name}`,
      detail:
        `${target.name} rated the material ${target.mean}/5, above your ${t.threshold} average, but only a small share of your fans live there yet.` +
        (venue ? ` Book ${venue.name}` : " Book a room there") +
        (ally ? ` and co-bill with ${ally.name}` : "") +
        " to plant the flag.",
      receipt: `Qloo where_popular + panel + venues in ${target.name}`,
      gain: pts(Math.max(0.15, 0.5 - target.presence) + target.presence),
    });
  }
  if (front) {
    missions.push({
      id: "hold",
      kind: "hold",
      city: front.name,
      title: `Win back ${front.name}`,
      detail: `Your fans are in ${front.name}, but the material scored ${front.mean}/5 there, under your ${t.threshold} average. Test a version built for its taste before you play it.`,
      receipt: "Qloo where_popular + panel split by city",
      gain: pts(front.presence),
    });
  }
  for (const r of rivals.slice(0, 3)) {
    if (!r.city) continue;
    const c = t.cities.find((x) => x.name === r.city);
    const gain = c ? pts(c.presence) : 2;
    missions.push(
      r.strategy === "ally"
        ? { id: `alliance-${r.id}`, kind: "alliance", city: r.city, rival: r.name, title: `Alliance: ${r.name} in ${r.city}`, detail: r.reason, receipt: "Qloo footprints + taste overlap", gain }
        : { id: `rivalry-${r.id}`, kind: "rivalry", city: r.city, rival: r.name, title: `Rivalry: take ${r.city} from ${r.name}`, detail: r.reason, receipt: "Qloo footprints + panel reaction", gain },
    );
  }
  return missions;
}

export function projected(t: Territory, missions: Mission[]): number {
  return Math.min(100, t.conquest + missions.reduce((s, m) => s + m.gain, 0));
}
