// The comparison beat: the landing page's "How we compare" cards, plus a hero still.
import { open } from "./lib.mjs";
const R = await open(process.argv[2] || "cmp"); const { page: p } = R;
await p.goto(process.env.URL || "http://localhost:5181/"); await R.wait(1500);
await p.mouse.click(720, 470); await R.wait(600); await p.mouse.click(720, 470); await R.wait(2500);
await R.still("hero");
await R.start();
await R.moveTo(1100, 600, 400);
const y = await p.evaluate(() => document.querySelector("#compare").getBoundingClientRect().top + scrollY);
console.log("compare at", y);
await p.evaluate((y) => window.scrollTo({ top: y - 40, behavior: "smooth" }), y); await R.wait(2500);
R.mark("compare"); await R.wait(800); await R.still("compare");
for (const i of [0, 1, 2, 3]) { const b = await p.locator("#compare .cc").nth(i).boundingBox().catch(() => null); if (b) { await R.moveTo(b.x + b.width / 2, b.y + b.height / 2, 700); await R.wait(1400); } }
R.mark("cards-done"); await R.wait(800);
await p.mouse.wheel(0, 450); await R.wait(1500); await R.still("compare2"); R.mark("table"); await R.wait(2000);
await R.stop();
