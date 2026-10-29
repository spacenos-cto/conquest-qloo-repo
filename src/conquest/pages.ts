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
:root{--ink:#16131d;--mute:#5d5868;--line:#e4e0ea;--lav:#7b2cff;--bg:#fff;--land:#f1edf7;--border:#d6cfe2;--card:#fff}
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
.embed a[href*="resume="],.embed .bar .pr{display:none}.embed .page{margin-top:12px}.embed .bar{margin-top:12px}
/* inside the game: the same page, in the game's dark theme */
.embed{--ink:#f2f3f5;--mute:#a3a7b0;--line:rgba(255,255,255,.12);--lav:#c27aff;--bg:#14121b;--land:#221f2c;--border:#3a3548;--card:#1b1824}
.embed,.embed body{background:#0b0a10}.embed .page{box-shadow:none;border:1px solid var(--line)}.embed a{color:var(--lav)}
.embed .bar a,.embed .bar button{background:var(--card);color:var(--ink);border-color:var(--line)}.embed .bar .p{background:#af50ff;border-color:#af50ff;color:#fff}
@media print{.embed{--ink:#16131d;--mute:#5d5868;--line:#e4e0ea;--lav:#7b2cff;--bg:#fff;--land:#f1edf7;--border:#d6cfe2;--card:#fff}.embed,.embed body{background:#fff}}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;border-radius:0;padding:0}.bar{display:none}@page{margin:12mm}}
`;
const shell = (title: string, body: string, extraHead = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<style>${BASE_CSS}</style><script>if(window.top!==window)document.documentElement.classList.add("embed")</script>${extraHead}</head><body>${body}</body></html>`;

export function briefHtml(b: Brief, links: { index?: string; game?: string } = {}): string {
  const none = `<p class="none">${e(NO_SIGNAL)}</p>`;
  const body = `<div class="bar"><button class="p pr" onclick="print()">Download PDF / print</button>${links.index ? `<a href="${e(links.index)}">All briefs</a>` : ""}${links.game ? `<a href="${e(links.game)}">Open the map</a>` : ""}</div>
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
  const t = p.totals, n = (x: number, one: string, many = one + "s") => `${x.toLocaleString()} ${x === 1 ? one : many}`;
  // the "why" minus what the chips already say (fans, venue fit): rain, trends, rivals
  const extra = (s: any) => String(s.why).split(" · ").filter((b) => !/fans \(Qloo\)$/.test(b) && !(s.venue && b.startsWith(s.venue.name + " fits"))).join(" · ");
  const stat = (v: string, k: string) => `<div class="st"><b>${v}</b><small>${k}</small></div>`;
  const leg = (s: any) => s.drive.mode === "fly" ? `✈ Fly from ${e(s.drive.from)} · ${s.drive.miles.toLocaleString()} mi` : `🚗 ${s.drive.hours} h from ${e(s.drive.from)} · ${s.drive.miles.toLocaleString()} mi${s.drive.hours > (p.input.maxDriveHours ?? 5) ? ` <b class="warn">over your ${p.input.maxDriveHours ?? 5} h limit</b>` : ""}`;
  const body = `<div class="bar"><a class="p" href="${e(links.ics)}">📅 Add to calendar</a><a href="${e(links.csv)}">CSV</a><a href="${e(links.txt)}">Plain text</a><button class="pr" onclick="print()">Print</button></div>
<div class="page">
  <div class="kick">Tour plan</div>
  <h1>${e(p.performer ?? "")}</h1>
  <div class="meta">From ${e(p.input.home)} · ${nice(p.input.start)} to ${nice(p.input.end)}</div>
  <div class="stats">${stat(String(t.nights), "nights")}${stat(t.fansReachable.toLocaleString(), "fans reachable (Qloo)")}${stat(t.miles.toLocaleString(), "miles")}${stat(t.driveHours + " h", "driving")}${stat(String(t.flights), t.flights === 1 ? "flight" : "flights")}</div>
  ${(p as any).note ? `<p class="tnote">${e((p as any).note)}</p>` : ""}
  <svg id="map" viewBox="0 0 975 610"></svg>
  <div class="lg"><span><i class="ld"></i>drive</span><span><i class="lf"></i>flight</span><span><i class="lh"></i>home</span></div>
  <div class="stops">${p.stops.map((s, i) => `<div class="stop">
    <div class="sh"><span class="sn">${s.n}</span><div><b>${e(s.city)}, ${e(s.state)}</b><small>${s.night ? new Date(s.night + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) : "No night left in your window"}</small></div>${links.briefs?.[i] ? `<a class="sb" href="${e(links.briefs[i]!)}">City Brief →</a>` : ""}</div>
    <div class="sv">🎤 <b>${e(s.venue?.name ?? "Send a Booker to find a room")}</b>${s.backup ? `<small>backup: ${e(s.backup.name)}</small>` : ""}</div>
    <div class="sc"><span>${s.fit != null ? s.fit + "% crowd fit" : "fit unknown"}</span><span>${n(s.fans, "fan")} here</span><span class="cf ${s.confidence.level}">${s.confidence.level} confidence</span></div>
    <div class="sl">${leg(s)}</div>
    ${extra(s) ? `<div class="sw">${e(extra(s))}</div>` : ""}</div>`).join("")}</div>
  <div class="foot">${e(p.method)}${p.ai ? ` Order and notes by ${e(p.ai.model)}; cities chosen by the rules.` : ""} Confidence counts how many of 4 signals we had (Qloo fans, Qloo venue fit, Google Trends, a forecast for the night). Generated ${p.generatedAt ? new Date(p.generatedAt).toISOString().slice(0, 16).replace("T", " ") : ""} UTC.</div>
</div>
<script src="/vendor/d3-array.min.js"></script><script src="/vendor/d3-geo.min.js"></script><script src="/vendor/topojson-client.min.js"></script>${mapScript(p)}`;
  return shell(`Tour plan · ${p.performer ?? ""}`, body, `<style>${TOUR_CSS}</style>`);
}
const TOUR_CSS = `
.kick{font:700 10.5px "Inter Tight",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--lav)}
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:14px 0 6px}
.st{border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:var(--card)}.st b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.st small{color:var(--mute);font-size:11px}
.tnote{margin:8px 0 0;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--mute)}
#map{width:100%;max-height:360px;margin:8px 0 4px;display:block}
#map .land{fill:var(--land);stroke:var(--border);stroke-width:.7}#map .leg{stroke:var(--lav);stroke-width:2.5;stroke-linecap:round;fill:none}
#map .dot{fill:var(--lav)}#map .home{fill:var(--ink)}#map .num{fill:#fff;font:700 13px "Inter Tight",sans-serif}
#map .lbl{fill:var(--ink);font:600 13px "Inter Tight",sans-serif;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.lg{display:flex;gap:16px;font-size:11.5px;color:var(--mute)}.lg span{display:inline-flex;align-items:center;gap:6px}
.lg i{display:inline-block;width:22px;height:0;border-top:2.5px solid var(--lav)}.lg .lf{border-top-style:dashed}.lg .lh{width:9px;height:9px;border:0;border-radius:50%;background:var(--ink)}
.stops{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.stop{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card);break-inside:avoid}
.sh{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center}.sh b{display:block;font-size:15px}.sh small{color:var(--mute)}
.sn{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--lav);color:#fff;font-weight:700}
.sb{font-size:12px;font-weight:600;text-decoration:none;color:var(--lav);white-space:nowrap}
.sv{margin-top:10px}.sv small{display:block;color:var(--mute);margin-left:22px}
.sc{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.sc span{font-size:11.5px;border:1px solid var(--line);border-radius:999px;padding:2px 9px}
.cf.high{color:#1f9d5c;border-color:rgba(31,157,92,.4)}.cf.medium{color:#b7791f;border-color:rgba(183,121,31,.4)}.cf.low{color:#c0392b;border-color:rgba(192,57,43,.4)}
.embed .cf.high{color:#3dff9a}.embed .cf.medium{color:#ffc857}.embed .cf.low{color:#ff8fa5}
.sl{margin-top:8px;font-size:12px;color:var(--mute)}.warn{color:#c0392b;font-weight:600}.embed .warn{color:#ff8fa5}
.sw{margin-top:6px;font-size:12px;color:var(--mute);line-height:1.4}
@media (max-width:640px){.stops{grid-template-columns:1fr}.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.page{padding:22px 18px}}
@media print{.stops{grid-template-columns:1fr 1fr}#map{max-height:300px}}
`;

function mapScript(p: Plan): string {
  const pts = [{ n: 0, city: p.input.home }, ...p.stops.map((s) => ({ n: s.n, city: s.city, fly: s.drive.mode === "fly" }))];
  return `<script>
const PTS=${JSON.stringify(pts)}, LL=${JSON.stringify(Object.fromEntries(pts.map((x) => [x.city, LL_OF(x.city)])))};
fetch("/vendor/states-albers-10m.json").then(r=>r.json()).then(t=>{
  const svg=document.getElementById("map"),ns="http://www.w3.org/2000/svg",path=d3.geoPath(),proj=d3.geoAlbersUsa().scale(1300).translate([487.5,305]);
  const add=(tag,a,txt)=>{const n=document.createElementNS(ns,tag);for(const k in a)n.setAttribute(k,a[k]);if(txt)n.textContent=txt;svg.appendChild(n);return n};
  add("path",{d:path(topojson.feature(t,t.objects.states)),class:"land"});
  const xy=PTS.map(p=>proj(LL[p.city])||[0,0]);
  // legs curve a little so a route that doubles back stays readable; flights are dashed
  for(let i=1;i<xy.length;i++){const[a,b]=[xy[i-1],xy[i]],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1],k=.12;add("path",{d:"M"+a+"Q"+(mx-dy*k)+","+(my+dx*k)+" "+b,class:"leg","stroke-dasharray":PTS[i].fly?"3 8":"0"})}
  // fit the view to the route, with room for labels
  const xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]),pad=70,x0=Math.max(0,Math.min(...xs)-pad),y0=Math.max(0,Math.min(...ys)-pad),w=Math.max(360,Math.max(...xs)-x0+pad+60),h=Math.max(220,Math.max(...ys)-y0+pad);
  svg.setAttribute("viewBox",[x0,y0,Math.min(975-x0,w),Math.min(610-y0,h)].join(" "));
  PTS.forEach((p,i)=>{add("circle",{cx:xy[i][0],cy:xy[i][1],r:i?12:7,class:i?"dot":"home"});if(i)add("text",{x:xy[i][0],y:xy[i][1]+4.5,"text-anchor":"middle",class:"num"},String(p.n));add("text",{x:xy[i][0]+15,y:xy[i][1]-9,class:"lbl"},i?p.city:"Home · "+p.city)});
});
</script>`;
}
function LL_OF(city: string): [number, number] { const m = METROS[city]; return m ? [m.lon, m.lat] : [0, 0]; }
