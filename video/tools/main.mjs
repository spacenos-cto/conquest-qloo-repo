// Main take: landing → Play as Cedric → three orders → END WEEK → the show → peek →
// weeks 2–8 played for real (sped up in the edit) → the finished tour pack.
import { open } from "./lib.mjs";
const URL = process.env.URL || "http://localhost:5181/";
const WHO = process.env.WHO || "Cedric the Entertainer";
const out = process.argv[2] || "take1";
const R = await open(out);
const { page: p } = R;
const chipsOf = (u) => p.evaluate((u) => [...document.querySelectorAll(`#army-list [data-chip]`)].map((b) => ({ i: +b.dataset.chip, t: b.innerText.trim(), allin: b.classList.contains("allin"), dis: b.disabled })), u);
const ordersLeft = () => p.evaluate(() => +document.querySelector("#orders-n")?.textContent || 0);
async function order(u, pick, ms = 650) {
  await R.clickSel(`#army-list [data-u="${u}"]`, { ms }); await R.wait(ms > 400 ? 900 : 350);
  const cs = (await chipsOf(u)).filter((c) => !c.dis);
  const c = pick(cs); if (!c) return null;
  await R.clickSel(`#army-list [data-chip="${c.i}"]`, { ms }); await R.wait(ms > 400 ? 900 : 300);
  return c.t;
}
async function waitShowDone() { await p.waitForSelector("#ws-go", { timeout: 90000 }); }

await p.goto(URL); await R.wait(400);
await R.start();
// the opening painting: "You" and "Your crowd"
await R.wait(4200); R.mark("intro-art");
await R.clickXY(720, 470, 500); await R.wait(700); await R.clickXY(720, 470, 200); await R.wait(1800);
R.mark("hero"); await R.wait(2500);
await R.clickSel(`[data-as="${WHO}"]`, { ms: 1100, pause: 500 }); R.mark("play-click");
await p.waitForSelector("#endweek:visible", { timeout: 90000 }); R.mark("map");
await R.wait(1200); await R.still("map"); await R.wait(1300);
await R.moveTo(560, 34, 900); R.mark("quest-bar"); await R.wait(2500);
await R.moveTo(640, 430, 900); await R.wait(1500);

R.mark("order-booker"); const ob = await order("booker", (cs) => cs.find((c) => /fills stop/.test(c.t)) ?? cs[0]);
R.mark("order-scout"); const os = await order("scout", (cs) => cs.find((c) => /uncharted/.test(c.t)) ?? cs[0]);
R.mark("order-you"); const oy = await order("you", (cs) => cs.find((c) => /Take .*%/.test(c.t) && !c.allin) ?? cs.find((c) => /^Take/.test(c.t)) ?? cs[0]);
console.log("orders:", ob, "|", os, "|", oy);
await R.moveTo(900, 500, 700); await R.wait(600); await R.still("queued"); await R.wait(900);
await R.clickSel("#endweek", { ms: 900, pause: 600 }); R.mark("endweek");
await waitShowDone(); R.mark("show-done");
const show = await p.evaluate(() => document.querySelector("#ws-go")?.closest("[id]")?.parentElement?.innerText ?? "");
const battle = /(TAKEN|HELD|REPELLED|LOST)\b/.exec(show)?.[1] ?? "none";
console.log("battle:", battle);
R.mark("battle", { result: battle });
await R.wait(1500); await R.still("report"); await R.wait(1500);
// read the report: scroll the cards slowly
await R.moveTo(1000, 600, 700);
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 160); await R.wait(700); }
R.mark("report-scrolled"); await R.wait(800); await R.still("report2"); await R.wait(1700);
for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 220); await R.wait(300); }
R.mark("report-bottom"); await R.wait(800); await R.still("report3"); await R.wait(2700);
await R.clickSel("#ws-peek", { ms: 900, pause: 500 }); R.mark("peek"); await R.wait(2000); await R.still("peek"); await R.wait(3500);
await R.clickSel("#vp-back", { ms: 700 }); await R.wait(600);
await R.clickSel("#ws-go", { ms: 700 }); R.mark("week2"); await R.wait(1200);

// weeks 2–8: real orders, played fast (the edit speeds this up)
const rot = ["sponsor", "diplomat", "reader"];
for (let w = 2; w <= 8; w++) {
  R.mark(`w${w}-orders`);
  await order("booker", (cs) => cs.find((c) => /fills stop/.test(c.t)), 300);
  if (await ordersLeft()) await order("you", (cs) => cs.find((c) => /^Take/.test(c.t) && !c.allin) ?? cs.find((c) => /Groundwork|Defend/.test(c.t)), 300);
  for (let k = 0; (await ordersLeft()) > 0 && k < 3; k++) await order(rot[(w + k) % 3], (cs) => cs[0], 300);
  await R.clickSel("#endweek", { ms: 350, pause: 150 }); R.mark(`w${w}-end`);
  await waitShowDone(); await R.wait(1800);
  const st = await p.evaluate(() => document.querySelector("#ws-go")?.textContent);
  console.log(`week ${w} done ->`, st);
  await R.clickSel("#ws-go", { ms: 400 }); await R.wait(900);
  if (/TOUR PACK/.test(st)) break;
}
await p.waitForSelector("#victory:not([hidden])", { timeout: 20000 });
R.mark("pack"); await R.wait(2500); await R.still("pack"); await R.wait(2000);
console.log("PACK:\n", (await p.evaluate(() => document.querySelector("#victory")?.innerText ?? "")).slice(0, 3000));
await R.moveTo(900, 450, 900); await R.wait(800);
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 140); await R.wait(500); }
R.mark("pack-scrolled"); await R.wait(800); await R.still("pack2"); await R.wait(1700);
const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await R.clickSel("#vp-ics", { ms: 900, pause: 400 }); R.mark("ics");
const d = await dl; if (d) { await d.saveAs(`${out}/conquest.ics`); console.log("ics saved"); }
await R.wait(3000);
R.mark("end");
await R.stop();
if (/LOST/.test(battle)) process.exit(3);
