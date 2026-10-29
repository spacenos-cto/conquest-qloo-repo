import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  audienceReport,
  rehearseReport,
  ablationReport,
  backtestReport,
  partnerReport,
  directorReport,
  youtubeBacktestReport,
  trendsCheckReport,
  serverInfo,
} from "./service/engine.js";

/**
 * Rehearsal's HTTP server. Serves the single-page UI from public/ and a small
 * JSON API over the engine. No framework — node:http only. Deployable on any
 * Node host (Render, Railway, a VM); the browser never calls Qloo directly.
 */

const PORT = Number(process.env.PORT || 5173);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res: any, code: number, body: string | Buffer, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function api(url: URL, res: any) {
  const name = url.searchParams.get("name") ?? "";
  try {
    switch (url.pathname) {
      case "/api/health":
        return send(res, 200, JSON.stringify({ ok: true, ...serverInfo() }));
      case "/api/audience":
        return send(res, 200, JSON.stringify(await audienceReport(name)));
      case "/api/rehearse":
        return send(res, 200, JSON.stringify(await rehearseReport(name)));
      case "/api/ablation":
        return send(res, 200, JSON.stringify(await ablationReport(name)));
      case "/api/backtest":
        return send(res, 200, JSON.stringify(backtestReport()));
      case "/api/director":
        return send(res, 200, JSON.stringify(await directorReport(name, url.searchParams.get("goal") ?? undefined)));
      case "/api/partners":
        return send(
          res,
          200,
          JSON.stringify(
            await partnerReport(
              name,
              url.searchParams.get("kind") ?? "people",
              url.searchParams.get("location") ?? undefined,
            ),
          ),
        );
      case "/api/backtest-youtube":
        return send(res, 200, JSON.stringify(await youtubeBacktestReport()));
      case "/api/trends-check":
        return send(res, 200, JSON.stringify(await trendsCheckReport()));
      default:
        return send(res, 404, JSON.stringify({ error: "not found" }));
    }
  } catch (e: any) {
    return send(res, 500, JSON.stringify({ error: String(e?.message ?? e) }));
  }
}

async function serveStatic(pathname: string, res: any) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "forbidden", "text/plain");
  try {
    const body = await readFile(file);
    send(res, 200, body, MIME[extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "not found", "text/plain");
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return void api(url, res);
  return void serveStatic(url.pathname, res);
}).listen(PORT, () => {
  const info = serverInfo();
  console.log(`Rehearsal on http://localhost:${PORT}`);
  console.log(`  Qloo=${info.qlooMode}  respondents=${info.respondentMode}  panel=${info.panelN}`);
});
