import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hash, stable } from "../../ledger/ledger.js";

/**
 * The only door to the YouTube Data API v3. Free tier: 10,000 quota units a
 * day; one backtest case costs about 115 (search 100, the rest 1 each).
 *
 * Raw responses are cached under data/youtube/raw/ (gitignored) so reruns
 * spend no quota. YouTube's terms ask that cached API data is refreshed or
 * deleted within 30 days — run with --fresh, or delete that folder.
 * The API key is read from YOUTUBE_API_KEY and never logged or written.
 */
export interface YouTubeApi {
  get(endpoint: string, params: Record<string, string>): Promise<any>;
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    public reason: string,
    public status: number,
  ) {
    super(message);
  }
}

const BASE = "https://www.googleapis.com/youtube/v3/";

export class YouTubeClient implements YouTubeApi {
  units = 0;
  constructor(
    private key: string,
    private cacheDir = "data/youtube/raw",
    private fresh = false,
  ) {}

  async get(endpoint: string, params: Record<string, string>): Promise<any> {
    const file = join(this.cacheDir, hash(endpoint + stable(params)) + ".json");
    if (!this.fresh) {
      const hit = await readFile(file, "utf8").catch(() => null);
      if (hit) return JSON.parse(hit);
    }
    const url = new URL(endpoint, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", this.key);
    this.units += endpoint === "search" ? 100 : 1;

    const res = await fetch(url);
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Never echo the URL: it carries the key.
      const reason = body?.error?.errors?.[0]?.reason ?? "unknown";
      throw new YouTubeError(
        `YouTube ${endpoint} failed (${res.status} ${reason}): ${body?.error?.message ?? ""}`,
        reason,
        res.status,
      );
    }
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(body));
    return body;
  }
}
