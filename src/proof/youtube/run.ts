import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { QlooGateway } from "../../qloo/gateway.js";
import { resolve } from "../../qloo/resolve.js";
import { fingerprint } from "../../qloo/fingerprint.js";
import type { Fingerprint } from "../../qloo/types.js";
import type { RespondentMode } from "../../panel/respondent.js";
import type { YouTubeApi } from "./client.js";
import { runYouTubeCase, METHOD, METHOD_VERSION, RULES, type YtCase, type CaseResult } from "./backtest.js";

/**
 * The three judge audiences, each tested on its own YouTube channel. Channels
 * are found by search the first time; the CLI prints the channel it used so a
 * human can confirm it, then pin it here as "@handle" or a "UC…" id.
 */
export const YT_CASES: YtCase[] = [
  { slug: "cedric", audience: "Cedric the Entertainer", channelQuery: "Cedric the Entertainer", control: "dodgers" },
  { slug: "twist", audience: "This Week in Startups", channelQuery: "This Week in Startups", control: "cedric" },
  { slug: "dodgers", audience: "Los Angeles Dodgers", channelQuery: "Los Angeles Dodgers", control: "twist" },
];

export const RESULT_FILE = "data/backtest-youtube.json";
export const SEALED_DIR = "data/youtube/sealed";

export interface YouTubeBacktest {
  generatedAt: string;
  methodVersion: string;
  method: string;
  rules: typeof RULES;
  qlooMode: string;
  respondentMode: string;
  quotaUnits: number;
  cases: (CaseResult | { slug: string; audience: string; error: string })[];
}

async function fpFor(g: QlooGateway, name: string, runId: string): Promise<Fingerprint> {
  const r = await resolve(g, name, runId);
  if (!r.entity) throw new Error(`Qloo could not resolve "${name}"`);
  return fingerprint(g, r.entity, runId);
}

export async function runYouTubeBacktest(
  api: YouTubeApi & { units?: number },
  g: QlooGateway,
  opts: { qlooMode: string; respMode: RespondentMode; only?: string; channel?: string; log?: (s: string) => void },
): Promise<YouTubeBacktest> {
  const log = opts.log ?? (() => {});
  const runId = "yt_" + Date.now();
  const fps = new Map<string, Fingerprint>();
  for (const c of YT_CASES) fps.set(c.slug, await fpFor(g, c.audience, runId));

  const cases: YouTubeBacktest["cases"] = [];
  for (const base of YT_CASES) {
    if (opts.only && !base.audience.toLowerCase().includes(opts.only.toLowerCase())) continue;
    const c = opts.channel ? { ...base, channel: opts.channel } : base;
    const fp = fps.get(c.slug)!;
    if (!fp.coverage.ok) {
      cases.push({ slug: c.slug, audience: c.audience, error: "Qloo coverage too thin — Rehearsal won't guess" });
      continue;
    }
    try {
      const r = await runYouTubeCase(api, c, fp, fps.get(c.control)!, {
        respMode: opts.respMode,
        onSeal: async (s) => {
          const file = `${SEALED_DIR}/${s.slug}-${s.sealHash}.json`;
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, JSON.stringify({ methodVersion: METHOD_VERSION, ...s }, null, 2));
          log(`sealed ${s.predictions.length} predictions for ${c.audience} → ${file}`);
        },
      });
      log(`${c.audience}: channel "${r.channel.title}" (${r.channel.id}), ${r.videos.length} videos`);
      cases.push(r);
    } catch (e: any) {
      cases.push({ slug: c.slug, audience: c.audience, error: String(e?.message ?? e) });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    methodVersion: METHOD_VERSION,
    method: METHOD,
    rules: RULES,
    qlooMode: opts.qlooMode,
    respondentMode: opts.respMode,
    quotaUnits: api.units ?? 0,
    cases,
  };
}

export async function saveResult(r: YouTubeBacktest, file = RESULT_FILE) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(r, null, 2));
}

export async function loadResult(file = RESULT_FILE): Promise<YouTubeBacktest | null> {
  const txt = await readFile(file, "utf8").catch(() => null);
  return txt ? (JSON.parse(txt) as YouTubeBacktest) : null;
}
