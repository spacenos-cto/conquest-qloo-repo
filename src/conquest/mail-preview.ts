import { spawn } from "node:child_process";
import { googleTrends } from "./signals.js";
import { changesFor, movesFor, renderMail, deliver } from "./mail.js";
import * as db from "./store.js";

/**
 * npm run mail:preview --campaign=<id>
 * Builds next Monday's email for one campaign, writes it to out/mail/ and
 * opens it. Never sends. Without --campaign it uses the most recent campaign.
 */
const cid = process.env.npm_config_campaign || process.argv[2] || db.listCampaigns()[0]?.id;
if (!cid) { console.error("No campaigns yet: play one in the game first (it syncs to the server)."); process.exit(1); }
const snap = db.getCampaign(cid);
if (!snap) { console.error(`No campaign ${cid}. Known: ${db.listCampaigns().map((c) => `${c.id} (${c.name})`).join(", ") || "none"}`); process.exit(1); }
const base = process.env.PUBLIC_URL || "http://localhost:5173";
const sub = db.getSub(cid), tour = db.latestTour(cid);
const changes = await changesFor({ trends: googleTrends }, snap, db.campaignWeek(cid, (snap.week ?? 1) - 1));
const mail = renderMail({ firstName: sub?.first_name || String(snap.name).split(" ")[0]!, snap, changes, moves: movesFor(snap, tour, base, cid), tour, base, cid, unsub: sub ? `${base}/mail/unsubscribe?t=${sub.token}` : `${base}/mail/unsubscribe` });
const saved = process.env.MAIL_API_KEY;
delete process.env.MAIL_API_KEY; // a preview never sends
const { where } = await deliver("", mail, `preview-${cid}`);
if (saved) process.env.MAIL_API_KEY = saved;
console.log(`Subject: ${mail.subject}\nWrote ${where}`);
const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", where]] : process.platform === "darwin" ? ["open", [where]] : ["xdg-open", [where]];
spawn(opener[0] as string, opener[1] as string[], { detached: true, stdio: "ignore" }).unref();
