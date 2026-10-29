import { Ledger, hash, stable } from "../ledger/ledger.js";
import { mockCall } from "./mock.js";
import { liveCall } from "./live.js";
import { Envelope, type EnvelopeT } from "./types.js";

export type Mode = "mock" | "live";

/** Human-readable endpoint label per workflow, for the Receipts view. */
const ENDPOINT: Record<string, string> = {
  describe: "/search",
  profile: "/search",
  resolve: "/search",
  find_tags: "/v2/tags",
  entity_tags: "/v2/insights · urn:tag",
  audience_demographics: "/v2/insights · urn:demographics",
  where_popular: "/v2/insights · urn:heatmap",
  recommend: "/v2/insights · recommend",
  rank: "/v2/insights · filter.results.entities",
  compare_audiences: "/v2/analysis/compare",
  trends: "/v2/trending",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One gateway for every Qloo call. Caches by (workflow, params), retries only
 * when the envelope says the error is retryable, and logs one ledger row per
 * call (cached or fresh) so every number downstream has a receipt.
 */
export class QlooGateway {
  constructor(
    private mode: Mode,
    private ledger: Ledger,
    private maxRetries = 2,
  ) {}

  async call(
    workflow: string,
    params: Record<string, unknown>,
    runId: string,
  ): Promise<EnvelopeT> {
    const key = hash(workflow + "|" + stable(params));

    const cachedRaw = this.ledger.cacheGet(key);
    if (cachedRaw) {
      const env = JSON.parse(cachedRaw) as EnvelopeT;
      this.record(workflow, params, env, runId, true);
      return env;
    }

    let env: EnvelopeT | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const raw =
        this.mode === "mock"
          ? await mockCall(workflow, params as Record<string, any>)
          : await liveCall(workflow, params);
      env = Envelope.parse(raw);
      if (
        env.status === "error" &&
        env.error?.retryable &&
        attempt < this.maxRetries
      ) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      break;
    }

    // never cache a failure or an empty answer: Qloo has transient blips, and a
    // cached blank would poison every later run for that entity
    if (env!.status === "ok" && (env!.result_count ?? 1) > 0) this.ledger.cacheSet(key, JSON.stringify(env));
    this.record(workflow, params, env!, runId, false);
    return env!;
  }

  /** How many calls this run has logged — for the coverage/receipt count. */
  callCount(runId: string): number {
    return this.ledger.byRun(runId).length;
  }

  private record(
    workflow: string,
    params: Record<string, unknown>,
    env: EnvelopeT,
    runId: string,
    cached: boolean,
  ): void {
    this.ledger.log({
      ref: this.ledger.nextRef(runId),
      runId,
      workflow,
      endpoint: ENDPOINT[workflow] ?? workflow,
      paramsJson: JSON.stringify(params),
      responseHash: hash(JSON.stringify(env)),
      cached,
      status: env.status,
      ts: new Date().toISOString(),
    });
  }
}
