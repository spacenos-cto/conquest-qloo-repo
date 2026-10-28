"use strict";
// Rehearsal UI — talks to the real engine over /api. All numbers come from the
// server (Qloo pipeline in mock mode until the key lands). No data is embedded.

const METROS = {
  Seattle:[-122.3,47.6],Portland:[-122.7,45.5],"San Francisco":[-122.4,37.8],"Los Angeles":[-118.2,34.1],
  "Las Vegas":[-115.1,36.2],Phoenix:[-112.1,33.4],"Salt Lake City":[-111.9,40.8],Denver:[-104.9,39.7],
  Dallas:[-96.8,32.8],Houston:[-95.4,29.8],"San Antonio":[-98.5,29.4],"Kansas City":[-94.6,39.1],
  Minneapolis:[-93.3,45],"St. Louis":[-90.2,38.6],Memphis:[-90,35.1],"New Orleans":[-90.1,30],
  Chicago:[-87.6,41.9],Detroit:[-83,42.3],Nashville:[-86.8,36.2],Atlanta:[-84.4,33.7],
  Charlotte:[-80.8,35.2],Raleigh:[-78.6,35.8],Miami:[-80.2,25.8],Orlando:[-81.4,28.5],
  Cleveland:[-81.7,41.5],Washington:[-77,38.9],Baltimore:[-76.6,39.3],Philadelphia:[-75.2,40],
  "New York":[-74,40.7],Boston:[-71.1,42.4]
};
const AGEC = {"18–29":"#6aa6ff","30–44":"#5ec48a","45–54":"#f2b544","55+":"#e86b6b"};
const $ = (s) => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const proj = (lon, lat) => [((lon + 125) / 58) * 1000, ((50 - lat) / 26) * 600];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let current = "Cedric the Entertainer";
const cache = {}; // name -> {audience, rehearse, ablation}

async function getJSON(path) { const r = await fetch(path); return r.json(); }

// animate a number from 0 → value (ease-out cubic), so results feel computed.
// Always lands the final value even if requestAnimationFrame is paused (a
// backgrounded tab) or motion is reduced — via a setTimeout fallback.
function countUp(el, to, dec=0, suffix=""){
  if(!el) return;
  const final=(dec?to.toFixed(dec):Math.round(to))+suffix;
  const t0=performance.now(), dur=750; let done=false;
  const land=()=>{ if(!done){ done=true; el.textContent=final; } };
  function f(t){
    if(done) return;
    const k=Math.min(1,(t-t0)/dur);
    el.textContent=(dec?(to*(1-Math.pow(1-k,3))).toFixed(dec):Math.round(to*(1-Math.pow(1-k,3))))+suffix;
    if(k<1) requestAnimationFrame(f); else land();
  }
  requestAnimationFrame(f);
  setTimeout(land, dur+150); // guarantee the number appears even with rAF paused
}

// ---------- navigation ----------
const SCENES = ["audience","panel","rehearse","without","proof","receipts"];
function go(s){
  if(!SCENES.includes(s)) s="audience";
  document.querySelectorAll(".scene").forEach(x=>x.classList.toggle("active",x.id==="s-"+s));
  document.querySelectorAll(".scene-btn").forEach(b=>b.toggleAttribute("aria-current",b.dataset.s===s));
  try{history.replaceState(null,"","#"+s)}catch(e){}
  window.scrollTo({top:0});
  if(s==="without") loadAblation();
  if(s==="proof") loadProof();
}
document.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>go(b.dataset.s));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));

// ---------- case selection ----------
document.querySelectorAll(".case").forEach(b=>b.onclick=()=>selectAudience(b.dataset.name,b));
$("#askform").onsubmit=(e)=>{e.preventDefault();const v=$("#aud").value.trim();if(v){document.querySelectorAll(".case").forEach(c=>c.setAttribute("aria-pressed","false"));selectAudience(v,null)}};

async function selectAudience(name, btn){
  current = name;
  document.querySelectorAll(".case").forEach(c=>c.setAttribute("aria-pressed", c===btn ? "true":"false"));
  cache[name] = cache[name] || {};
  $("#aud-body").className=""; $("#aud-body").innerHTML='<div class="loading">Fingerprinting '+esc(name)+'… asking Qloo.</div>';
  const data = await getJSON("/api/audience?name="+encodeURIComponent(name));
  cache[name].audience = data;
  renderAudience(data);
  renderPanel(data);
  renderReceipts(data.receipts||[]);
}

// ---------- scene 1 ----------
function bars(container, rows, signed){
  container.innerHTML="";
  rows.forEach(([k,v])=>{
    const d=el("div","bar");
    const w=signed?Math.abs(v)*100:v*100;
    const col=signed?(v>=0?"var(--good)":"var(--bad)"):"var(--accent)";
    const left=signed?(v>=0?"50%":(50-w/2)+"%"):"0";
    d.innerHTML=`<span>${esc(k)}</span><div class="track"><i style="left:${left};width:${signed?w/2:w}%;background:${col}"></i></div><span class="v">${signed?(v>0?"+":"")+v.toFixed(2):Math.round(v*100)+"%"}</span>`;
    container.appendChild(d);
  });
}
function renderAudience(d){
  const cov=$("#cov");
  if(d.status==="needs_input"){ $("#aud-body").innerHTML='<div class="card">Ambiguous. Did you mean: '+d.candidates.map(c=>esc(c.name)).join(", ")+"?</div>"; cov.className=""; return; }
  if(d.status==="empty"){ $("#aud-body").innerHTML='<div class="card">No Qloo entity found.</div>'; cov.className=""; return; }
  cov.className="cov "+(d.coverage.ok?"ok":"bad");
  cov.textContent=(d.coverage.ok?"● Coverage: strong · ":"● INSUFFICIENT · ")+d.calls+" Qloo calls";
  const body=$("#aud-body"); body.className=""; body.innerHTML="";
  const grid=el("div","grid g3");
  const metroTop=Object.entries(d.metros).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const card=(title,ref,fill)=>{const c=el("div","card");c.innerHTML=`<h3>${title} <span class="rcpt">${ref||""}</span></h3>`;fill(c);return c;};
  grid.append(
    card("Who they are",d.refs.demographics,c=>{const b=el("div","bars");c.append(b);bars(b,d.demographics,true);}),
    card("What they're into",d.refs.tags,c=>{const b=el("div","chips");b.innerHTML=d.tags.slice(0,14).map(t=>`<span class="chip">${esc(t)}</span>`).join("")+` <span class="chip faint">+${Math.max(0,d.tags.length-14)}</span>`;c.append(b);}),
    card("Where they are",d.refs.metros,c=>{const b=el("div","bars");c.append(b);bars(b,metroTop,false);})
  );
  for(const dom of ["artist","tv_show","brand"]){
    const items=(d.domains[dom]||[]).slice(0,5).map(x=>esc(x.name)).join(", ");
    grid.append(card(dom.replace("_"," "),d.refs[dom],c=>{const p=el("div");p.style.fontSize="13px";p.innerHTML=items+` <span class="faint">(${(d.domains[dom]||[]).length})</span>`;c.append(p);}));
  }
  body.append(grid);
}

// ---------- scene 2 ----------
function renderPanel(d){
  const svg=$("#map svg"); if(!svg||!d.personas) return;
  // designed backdrop: soft vignette + glow, no cheap grid
  svg.innerHTML=`<defs>
    <radialGradient id="vg" cx="48%" cy="42%" r="75%"><stop offset="0%" stop-color="#1b2234"/><stop offset="100%" stop-color="#11131b"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs><rect width="1000" height="600" fill="url(#vg)"/>`;
  // metro halos sized by weight (the "where the crowd is" glow)
  let halos="";
  Object.entries(d.metros).forEach(([m,w])=>{const co=METROS[m];if(!co)return;const[x,y]=proj(co[0],co[1]);halos+=`<circle cx="${x}" cy="${y}" r="${(12+w*34).toFixed(0)}" fill="var(--accent)" fill-opacity="${(0.03+w*0.05).toFixed(3)}"/>`;});
  svg.insertAdjacentHTML("beforeend",`<g>${halos}</g>`);
  // the 1,000 respondents
  let dots="";
  d.personas.forEach(p=>{const co=METROS[p.metro];if(!co)return;const[x,y]=proj(co[0],co[1]);const r=18*Math.sqrt(Math.random());const t=Math.random()*6.28;
    dots+=`<circle data-id="${p.id}" cx="${(x+r*Math.cos(t)).toFixed(1)}" cy="${(y+r*Math.sin(t)*0.8).toFixed(1)}" r="2.6" fill="${AGEC[p.age]||"#888"}" fill-opacity=".9"/>`;});
  svg.insertAdjacentHTML("beforeend",`<g id="dotg" filter="url(#glow)" style="opacity:0;transition:opacity .6s ease">${dots}</g>`);
  requestAnimationFrame(()=>{const g=svg.querySelector("#dotg");if(g)g.style.opacity="1";});
  Object.entries(d.metros).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([m])=>{const co=METROS[m];if(!co)return;const[x,y]=proj(co[0],co[1]);svg.insertAdjacentHTML("beforeend",`<circle cx="${x}" cy="${y}" r="2" fill="#fff" fill-opacity=".9"/><text x="${x+8}" y="${y+4}" font-family="IBM Plex Mono,monospace" font-size="12" fill="#cfd4e4">${esc(m)}</text>`);});
  const byId=Object.fromEntries(d.personas.map(p=>[p.id,p]));
  svg.onmousemove=(e)=>{const t=e.target;const card=$("#pcard");if(t.tagName!=="circle"||!t.dataset.id){card.style.display="none";return;}
    const p=byId[t.dataset.id];const r=$("#map").getBoundingClientRect();let px=e.clientX-r.left+14,py=e.clientY-r.top+14;if(px>r.width-260)px-=280;if(py>r.height-110)py-=130;
    card.style.display="block";card.style.left=px+"px";card.style.top=py+"px";
    card.innerHTML=`<b>#${p.id} · ${esc(p.metro)}</b> <span class="muted">· ${p.age} · ${p.gender}</span><div class="t">${p.tastes.map(x=>`<span>${esc(x)}</span>`).join("")}</div><div class="faint" style="margin-top:6px;font-family:var(--mono);font-size:10px">metro E… · age E… · tastes E…</div>`;};
  svg.onmouseleave=()=>{$("#pcard").style.display="none";};
  bars($("#comp"),d.composition.map(c=>[c.age,c.n/1000]),false);
}

// ---------- scene 3 ----------
$("#run").onclick=runRehearse;
async function runRehearse(){
  const name=current; $("#run").disabled=true; $("#run").textContent="Running…";
  $("#reh-results").hidden=true; $("#strip-card").hidden=true;
  let n=0; const iv=setInterval(()=>{n=Math.min(1000,n+Math.floor(30+Math.random()*50));$("#prog").style.width=(n/10)+"%";$("#prog-t").textContent=n.toLocaleString()+" of 1,000 responded";},60);
  const d=await getJSON("/api/rehearse?name="+encodeURIComponent(name));
  clearInterval(iv);$("#prog").style.width="100%";$("#prog-t").textContent="1,000 of 1,000 responded";
  $("#run").disabled=false;$("#run").textContent="Done";
  cache[name]=cache[name]||{}; cache[name].rehearse=d;
  renderRehearse(d);
}
function renderRehearse(d){
  if(d.status==="refused"){$("#reh-sub").textContent="Coverage insufficient — Rehearsal won't guess.";return;}
  $("#reh-sub").textContent='Testing against this audience, grounded in Qloo. Respondent: '+d.respondentMode+'.';
  $("#stim-h").textContent=d.stimulus.label;$("#stim-t").textContent='“'+d.stimulus.text+'”';
  const a=d.aggregate;
  $("#reh-results").hidden=false;
  countUp($("#score"),a.mean,1);countUp($("#pct"),a.pct45,0,"%");$("#reh-n").textContent=a.n+" replies";
  if(d.split){$("#splitbox").hidden=false;$("#cAn").textContent=d.split.top.metro;$("#cBn").textContent=d.split.bottom.metro;countUp($("#cA"),d.split.top.mean,1);countUp($("#cB"),d.split.bottom.mean,1);}
  $("#verdicts").innerHTML=d.verdicts.map(v=>`<div class="verdict"><span><b>${esc(v.segment)}</b><br><span class="muted" style="font-size:12px">${esc(v.note)}</span></span><span class="tag ${v.brain}">brain ${v.brain==="up"?"↑":"flat"}</span><span class="tag ${v.panel}">panel ${v.panel}</span><span class="tag ${v.call}">${v.call}</span></div>`).join("");
  // stream the quotes in, like reactions landing
  const qbox=$("#quotes");qbox.innerHTML="";
  a.quotes.forEach((q,i)=>setTimeout(()=>{const el=document.createElement("div");el.className="q";el.style.animation="fade .32s ease";el.innerHTML=`“${esc(q.text)}”<small>${esc(q.persona)}</small>`;qbox.appendChild(el);},140*i));
  $("#narrative").innerHTML=d.narrative.kept.map(s=>`<div>${esc(s)}</div>`).join("")+d.narrative.struck.map(s=>`<div style="color:var(--bad)">[struck] ${esc(s.text)}</div>`).join("")+`<div class="faint" style="font-size:11px">${d.narrative.kept.length} kept, ${d.narrative.struck.length} struck · every number traces to a computed fact</div>`;
  // strip
  $("#strip-card").hidden=false;$("#strip-h").textContent=d.tribe.label;$("#strip-m").textContent=d.tribe.deadZones.length?"sag":"";$("#strip-note").textContent=d.tribe.note+" — "+d.tribe.licence;
  drawStrip(d.tribe);
  if(d.receipts) renderReceipts(d.receipts);
}
function drawStrip(t){
  const svg=$("#strip");const W=600,H=140,N=t.points.length,step=W/(N-1);
  const y=(p)=>H-10-p*1.1;
  let grid="";for(let gy=20;gy<H;gy+=28)grid+=`<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--line)"/>`;
  const my=y(t.mean);
  const pts=t.points.map((p,i)=>`${(i*step).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  let zones="";t.deadZones.forEach(z=>{zones+=`<rect x="${z.start*step}" y="0" width="${(z.end-z.start)*step}" height="${H}" fill="var(--bad)" fill-opacity=".09"/><text x="${z.start*step+4}" y="13" font-family="IBM Plex Mono,monospace" font-size="10" fill="var(--bad)">dead zone</text>`;});
  svg.innerHTML=grid+zones+`<line x1="0" x2="${W}" y1="${my}" y2="${my}" stroke="var(--faint)" stroke-dasharray="4 4"/><polygon fill="var(--accent)" fill-opacity=".12" points="0,${H} ${pts} ${W},${H}"/><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts}"/>`;
}

// ---------- scene 4 ----------
async function loadAblation(){
  const d=await getJSON("/api/ablation?name="+encodeURIComponent(current));
  const body=$("#abl-body");body.className="";
  if(d.status!=="ok"){body.innerHTML='<div class="card">Ablation unavailable for this audience.</div>';return;}
  const hist=(arr,grey)=>arr.map(v=>`<div class="${grey?"g":""}" style="height:${v*2.4+2}px"><span>${v}%</span></div>`).join("");
  const side=(s,grey)=>`<div class="card"><h3>${esc(s.label)} <span class="tag ${grey?"flat":"ship"}">${grey?"ungrounded":"grounded"}</span></h3>
    <div class="hist">${hist(s.hist,grey)}</div><div class="hist-x"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
    <div class="list" style="margin-top:12px"><div><span>City variance</span><b class="mono">${s.metroVariance}</b></div><div><span>Distinct reasons</span><b class="mono">${s.distinctReasons}</b></div>${s.topSplit?`<div><span>City split</span><b class="mono">${s.topSplit.topMean.toFixed(1)} vs ${s.topSplit.bottomMean.toFixed(1)}</b></div>`:""}</div></div>`;
  body.innerHTML=`<div class="grid g2">${side(d.grounded,false)}${side(d.ungrounded,true)}</div>
    <div class="kill">Taste is where the disagreement lives — ${d.grounded.distinctReasons} reasons vs ${d.ungrounded.distinctReasons}, city variance ${d.grounded.metroVariance} vs ${d.ungrounded.metroVariance}.</div>`;
}

// ---------- scene 5 ----------
let proofLoaded=false;
async function loadProof(){
  if(proofLoaded) return; proofLoaded=true;
  const d=await getJSON("/api/backtest");const body=$("#proof-body");body.className="";
  body.innerHTML=`<div class="grid g3">
    <div class="card"><div class="eyebrow">Qloo-grounded vs reality</div><div class="big">r = ${d.rGrounded.toFixed(2)}</div><p class="muted" style="font-size:13px">${d.brands.length} brands · age×gender cells · MAE ${d.maeGrounded}</p></div>
    <div class="card"><div class="eyebrow">LLM-only vs reality</div><div class="big muted">r = ${d.rLLM.toFixed(2)}</div><p class="muted" style="font-size:13px">Same brands, no Qloo · MAE ${d.maeLLM}</p></div>
    <div class="card"><div class="eyebrow">Misses (&gt;10 pts)</div><div class="big" style="color:var(--warn)">${d.misses.length}/${d.brands.length*8}</div><p class="muted" style="font-size:13px">Listed below, not hidden.</p></div></div>
    ${d.isSample?'<div class="banner">⚠ SAMPLE data + stand-in grounded model. The harness and method are real and frozen; swap in real YouGov + live Qloo for the citable number.</div>':""}
    <div class="grid g2" style="margin-top:14px">
      <div class="card scroll"><h3>The misses</h3><table><thead><tr><th>Brand</th><th>Cell</th><th class="num">Panel</th><th class="num">Ref</th></tr></thead><tbody>${d.misses.slice(0,10).map(m=>`<tr><td>${esc(m.brand)}</td><td>${esc(m.cell)}</td><td class="num">${m.grounded}%</td><td class="num">${m.ref}%</td></tr>`).join("")}</tbody></table></div>
      <div class="card"><h3>What it does and doesn't establish</h3><ul style="margin:0;padding-left:18px;font-size:13px;display:grid;gap:6px">
        <li>Respondents are samples from <b>aggregate</b> Qloo affinities — not people, never an individual claim.</li>
        <li>Panel results are preference signals, not sales forecasts.</li>
        <li>TRIBE v2 is a generic brain model, CC BY-NC 4.0 — predicted response, not memorability.</li>
        <li>No names, emails or IDs are ever sent to Qloo.</li></ul></div></div>`;
  body.insertAdjacentHTML("beforeend", await realWorldHTML());
}

// Real-world checks: YouTube backtest + Google Trends metro check (run from the CLI, read here).
async function realWorldHTML(){
  const [yt,tr]=await Promise.all([getJSON("/api/backtest-youtube"),getJSON("/api/trends-check")]);
  let h=`<h2 style="margin:26px 0 4px">Real-world check · YouTube</h2>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Each audience's own channel. Panel predictions are sealed with a hash <b>before</b> any view, like or comment is fetched, then scored against what really happened.</p>`;
  if(yt.status!=="ok"){
    h+=`<div class="card"><div class="eyebrow">Not run yet</div><p style="font-size:13px">${esc(yt.method)}</p><pre>${esc(yt.run)}</pre></div>`;
  }else{
    if(yt.qlooMode==="mock"||yt.respondentMode==="mock")h+=`<div class="banner">Outcomes are real YouTube data. Predictions ran with Qloo=${esc(yt.qlooMode)}, respondents=${esc(yt.respondentMode)}.</div>`;
    h+=`<div class="grid g3">`+yt.cases.map(c=>{
      if(c.error)return `<div class="card"><div class="eyebrow">${esc(c.audience)}</div><p class="muted" style="font-size:13px">${esc(c.error)}</p></div>`;
      const t=c.rankTest,m=c.medianSplit,e=c.echoes;
      const head=t.testable
        ?`<div class="big">ρ = ${t.rho.toFixed(2)}</div><p class="muted" style="font-size:13px">panel score vs likes per 1k views · n=${t.n} · p=${t.p} · without Qloo ρ=${t.flatRho.toFixed(2)}</p>`
        :`<div class="big muted" style="font-size:26px">Not testable</div><p class="muted" style="font-size:13px">${esc(t.reason)}. Rehearsal won't guess.</p>`;
      return `<div class="card"><div class="eyebrow">${esc(c.audience)} · ${esc(c.channel.title)}</div>${head}
        <div class="list" style="margin-top:10px;font-size:13px">
          ${m?`<div><span>Likes/1k views, panel's top half vs rest</span><b class="mono">${m.higherMean} vs ${m.lowerMean}</b></div>`:""}
          <div><span>Comments naming a Qloo neighbour</span><b class="mono">${e.ownPer1k} vs ${e.controlPer1k} control /1k</b></div>
          <div><span>Comments read</span><b class="mono">${e.comments}</b></div>
          <div><span>Sealed</span><b class="mono" style="font-size:11px">${esc(c.sealHash)}</b></div></div>
        ${e.topOwn.length?`<p class="muted" style="font-size:12px;margin:8px 0 0">Most named: ${esc(e.topOwn.join(", "))}</p>`:""}
        ${c.misses.length?`<p class="muted" style="font-size:12px;margin:6px 0 0">Misses: ${c.misses.map(x=>`“${esc(x.title.slice(0,48))}” (${x.kind})`).join("; ")}</p>`:""}</div>`;
    }).join("")+`</div><p class="faint mono" style="font-size:11px">Method ${esc(yt.methodVersion)}, frozen: ${esc(yt.method)} · run ${esc(yt.generatedAt.slice(0,10))} · Data: YouTube Data API. Comment text is read, never stored.</p>`;
  }
  h+=`<h2 style="margin:26px 0 4px">Outside check · Google Trends</h2>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Do Qloo's top metros (where the personas live) match where people search for the audience?</p>`;
  if(tr.status!=="ok"){
    h+=`<div class="card"><div class="eyebrow">Not run yet</div><pre>${esc(tr.run)}</pre></div>`;
  }else{
    h+=`<div class="card scroll"><table><thead><tr><th>Audience</th><th class="num">Metros in both</th><th class="num">Rank agreement</th><th class="num">Top-5 overlap</th><th>Biggest gaps</th></tr></thead><tbody>`+
      Object.values(tr.checks).map(c=>`<tr><td>${esc(c.audience)}</td><td class="num">${c.shared}</td><td class="num">${c.testable?`ρ ${c.rho.toFixed(2)} · p ${c.p}`:"not testable"}</td><td class="num">${c.overlapTop5}/5</td><td style="font-size:12px">${c.biggestGaps.map(g=>`${esc(g.metro)} Qloo #${g.qlooRank} vs Trends #${g.trendsRank}`).join("; ")}</td></tr>`).join("")+
      `</tbody></table><p class="faint mono" style="font-size:11px;margin-top:8px">Source: Google Trends, interest by metro (CSV export).</p></div>`;
  }
  return h;
}

// ---------- receipts ----------
function renderReceipts(rows){
  $("#rtable").innerHTML=(rows||[]).map(r=>`<tr><td class="mono">${esc(r.ref)}</td><td>${esc(r.workflow)}</td><td class="mono" style="font-size:12px">${esc(r.endpoint)}</td><td><span class="tag ${r.cached?"flat":"fit"}">${r.cached?"cache":"live"}</span></td></tr>`).join("");
}

// ---------- boot ----------
(async function(){
  try{const h=await getJSON("/api/health");const note=$("#srvnote");note.textContent=`Taste graph: Qloo · ${h.panelN.toLocaleString()}-respondent panel`+(h.qlooMode==="mock"?" · demo dataset":" · live");note.title=`Qloo=${h.qlooMode} · respondents=${h.respondentMode}`;}catch(e){}
  await selectAudience("Cedric the Entertainer", document.querySelector(".case"));
  go((location.hash||"#audience").slice(1));
})();
