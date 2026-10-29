import type { Brief } from "./brief.js";
import type { Plan } from "./tour.js";
import { NO_SIGNAL } from "./brief.js";
import { METROS } from "./geo.js";

/**
 * Server-rendered documents: City Brief, the brief index and the Tour Plan.
 * Plain and professional (a manager forwards these), one printed page for a
 * brief at Letter and A4.
 */
const e = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const BASE_CSS = `
:root{--ink:#16131d;--mute:#5d5868;--line:#e4e0ea;--lav:#7b2cff;--bg:#fff}
*{box-sizing:border-box}html,body{margin:0;background:#f4f2f7;color:var(--ink);font:13px/1.45 "Inter Tight",Inter,system-ui,sans-serif}
.page{max-width:820px;margin:24px auto;background:var(--bg);padding:34px 40px;border-radius:12px;box-shadow:0 8px 30px rgba(40,20,80,.08)}
h1{font:italic 400 34px/1.05 "Instrument Serif",Georgia,serif;margin:0}h2{font:700 10.5px/1 "Inter Tight",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--lav);margin:16px 0 6px}
.meta{color:var(--mute);margin-top:4px}.big{font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:12px}.chip small{color:var(--mute)}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.none{color:var(--mute);font-style:italic}.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
ul.moves{list-style:none;padding:0;margin:0}ul.moves li{padding:3px 0}ul.moves li::before{content:"☐ ";color:var(--lav)}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid var(--line);color:var(--mute);font-size:10.5px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin:0 auto 10px;max-width:820px}.bar a,.bar button{font:600 12.5px "Inter Tight",sans-serif;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;cursor:pointer}.bar .p{background:var(--lav);color:#fff;border-color:var(--lav)}
.conf{font-size:11px;color:var(--mute)}
.embed a[href*="resume="]{display:none}.embed .page{margin-top:12px}.embed .bar{margin-top:12px}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;border-radius:0;padding:0}.bar{display:none}@page{margin:12mm}}
`;
const shell = (title: string, body: string, extraHead = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<style>${BASE_CSS}</style><script>if(window.top!==window)document.documentElement.classList.add("embed")</script>${extraHead}</head><body>${body}</body></html>`;

export function briefHtml(b: Brief, links: { index?: string; game?: string } = {}): string {
  const none = `<p class="none">${e(NO_SIGNAL)}</p>`;
  const body = `<div class="bar"><button class="p" onclick="print()">Download PDF / print</button>${links.index ? `<a href="${e(links.index)}">All briefs</a>` : ""}${links.game ? `<a href="${e(links.game)}">Open the map</a>` : ""}</div>
<div class="page">
  <h1>${e(b.city)}, ${e(b.state)}</h1>
  <div class="meta">${e(b.performer)} · City Brief · ${day(b.generatedAt)} · <span class="big">Fans here: ${b.fans != null ? b.fans.toLocaleString() : "unknown"} (Qloo${b.fansRef ? ` ${e(b.fansRef)}` : ""})</span></div>
  <h2 id="loves">What they also love</h2>
  ${b.also.length ? `<div class="chips">${b.also.map((x) => `<span class="chip">${e(x.name)} <small>${e(x.domain)} · ${x.affinity}%</small></span>`).join("")}</div>` : none}
  <h2 id="rooms">Rooms</h2>
  ${b.rooms.length ? `<table><tr><th>Venue</th><th>Size (guess)</th><th>Crowd fit</th><th>Contact</th></tr>${b.rooms.map((r: any) => `<tr><td>${e(r.name)}${r.stage === false ? " <small>(no stage listed: confirm it hosts shows)</small>" : ""}${r.address ? `<br><small>${e(r.address)}</small>` : ""}</td><td>${e(r.bucket)}</td><td>${r.fit}%</td><td>${[r.phone && e(r.phone), r.website && `<a href="${e(r.website)}">website</a>`].filter(Boolean).join("<br>") || "<small>not listed</small>"}</td></tr>`).join("")}</table>` : none}
  <div class="cols">
    <div><h2 id="allies">Allies</h2>${b.allies.length ? b.allies.map((a: any) => `<p><b>${e(a.name)}</b> <small>· ${e(a.kind)} · ${a.affinity}% of your fans here</small><br>${e(a.pitch)}</p>`).join("") : none}</div>
    <div><h2 id="sponsor">Sponsor</h2>${b.sponsor ? `<p><b>${e(b.sponsor.name)}</b> <small>· ${b.sponsor.affinity}% affinity (Qloo)</small><br>Subject: <i>${e(b.sponsor.subject)}</i></p>` : none}
      <h2 id="timing">Timing</h2>${b.timing ? `<p>${e(b.timing)}</p>` : none}</div>
  </div>
  <h2 id="watch">Watch out</h2>${b.watch ? `<p>${e(b.watch)}</p>` : `<p class="none">No rival holds ${e(b.city)} right now.</p>`}
  <h2 id="moves">Three moves</h2>${b.moves.length ? `<ul class="moves">${b.moves.map((m) => `<li>${e(m)}</li>`).join("")}</ul>` : none}
  <div class="foot">Sources: ${b.sources.length ? b.sources.map((s) => `${e(s.source)} (${e(s.detail)}, ${new Date(s.at).toISOString().slice(0, 16).replace("T", " ")} UTC)`).join(" · ") : "none"}. Fan counts and affinities are Qloo's; room sizes are guessed from the venue name.</div>
</div>`;
  return shell(`${b.city} brief · ${b.performer}`, body);
}

export function briefIndexHtml(performer: string, rows: { city: string; created: string; href: string }[], game?: string): string {
  return shell(`City briefs · ${performer}`, `<div class="page"><h1>City briefs</h1><div class="meta">${e(performer)}${game ? ` · <a href="${e(game)}">open the map</a>` : ""}</div>
  ${rows.length ? `<table><tr><th>City</th><th>Made</th></tr>${rows.map((r) => `<tr><td><a href="${e(r.href)}">${e(r.city)}</a></td><td>${day(r.created)}</td></tr>`).join("")}</table>` : `<p class="none">No briefs yet. Open a city on the map and press Brief, or make them from a Tour Plan.</p>`}</div>`);
}

export function tourHtml(p: Plan, links: { ics: string; csv: string; txt: string; briefs?: string[] }): string {
  const body = `<div class="bar"><a class="p" href="${e(links.ics)}">Add to calendar (.ics)</a><a href="${e(links.csv)}">Download CSV</a><a href="${e(links.txt)}">Plain text</a><button onclick="print()">Print</button></div>
<div class="page">
  <h1>Tour plan · ${e(p.performer ?? "")}</h1>
  <div class="meta">${e(p.input.home)} · ${nice(p.input.start)} to ${nice(p.input.end)} · ${p.totals.nights} nights · ${p.totals.fansReachable.toLocaleString()} fans reachable (Qloo) · ${p.totals.miles.toLocaleString()} miles${p.totals.flights ? ` · ${p.totals.flights} flight${p.totals.flights > 1 ? "s" : ""}` : ""}</div>
  <svg id="map" viewBox="0 0 975 610" style="width:100%;height:auto;margin:10px 0"></svg>
  <table><tr><th>#</th><th>City</th><th>Night</th><th>Venue (backup)</th><th>Fit</th><th>Fans</th><th>From previous</th><th>Why</th></tr>
  ${p.stops.map((s, i) => `<tr><td>${s.n}</td><td><b>${e(s.city)}</b>, ${e(s.state)}${links.briefs?.[i] ? `<br><a href="${e(links.briefs[i]!)}">City Brief</a>` : ""}</td><td>${s.night ? nice(s.night) : "<i>doesn't fit</i>"}</td><td>${e(s.venue?.name ?? "send a Booker")}${s.backup ? `<br><small>${e(s.backup.name)}</small>` : ""}</td><td>${s.fit != null ? s.fit + "%" : "?"}</td><td>${s.fans.toLocaleString()}</td><td>${s.drive.mode === "fly" ? "✈ fly" : `${s.drive.hours} h drive`}<br><small>${s.drive.miles} mi</small></td><td>${e(s.why)}<br><span class="conf">confidence: ${s.confidence.level} (${e(s.confidence.reason)})</span></td></tr>`).join("")}</table>
  <div class="foot">${e(p.method)}${p.ai ? ` Order and notes by ${e(p.ai.model)}; cities chosen by the rules.` : ""} Generated ${p.generatedAt ? new Date(p.generatedAt).toISOString().slice(0, 16).replace("T", " ") : ""} UTC.</div>
</div>
<script src="/vendor/d3-array.min.js"></script><script src="/vendor/d3-geo.min.js"></script><script src="/vendor/topojson-client.min.js"></script>${mapScript(p)}`;
  return shell(`Tour plan · ${p.performer ?? ""}`, body);
}

function mapScript(p: Plan): string {
  const pts = [{ n: 0, city: p.input.home }, ...p.stops.map((s) => ({ n: s.n, city: s.city, fly: s.drive.mode === "fly" }))];
  return `<script>
const PTS=${JSON.stringify(pts)}, LL=${JSON.stringify(Object.fromEntries(pts.map((x) => [x.city, LL_OF(x.city)])))};
fetch("/vendor/states-albers-10m.json").then(r=>r.json()).then(t=>{
  const svg=document.getElementById("map"),ns="http://www.w3.org/2000/svg",path=d3.geoPath(),proj=d3.geoAlbersUsa().scale(1300).translate([487.5,305]);
  const add=(tag,a,txt)=>{const n=document.createElementNS(ns,tag);for(const k in a)n.setAttribute(k,a[k]);if(txt)n.textContent=txt;svg.appendChild(n);return n};
  add("path",{d:path(topojson.feature(t,t.objects.states)),fill:"#f1edf7",stroke:"#d6cfe2","stroke-width":.7});
  const xy=PTS.map(p=>proj(LL[p.city])||[0,0]);
  for(let i=1;i<xy.length;i++)add("line",{x1:xy[i-1][0],y1:xy[i-1][1],x2:xy[i][0],y2:xy[i][1],stroke:"#7b2cff","stroke-width":2.5,"stroke-dasharray":PTS[i].fly?"2 7":"0","stroke-linecap":"round"});
  PTS.forEach((p,i)=>{add("circle",{cx:xy[i][0],cy:xy[i][1],r:i?13:9,fill:i?"#7b2cff":"#16131d"});if(i)add("text",{x:xy[i][0],y:xy[i][1]+4.5,"text-anchor":"middle","font-size":13,"font-weight":700,fill:"#fff","font-family":"Inter Tight,sans-serif"},String(p.n));add("text",{x:xy[i][0]+16,y:xy[i][1]-10,"font-size":13,fill:"#16131d","font-family":"Inter Tight,sans-serif"},p.city)});
});
</script>`;
}
function LL_OF(city: string): [number, number] { const m = METROS[city]; return m ? [m.lon, m.lat] : [0, 0]; }
