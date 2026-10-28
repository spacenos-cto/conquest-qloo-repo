import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

/** Short, stable hash for cache keys and response fingerprints. */
export const hash = (s: string): string =>
  createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Deterministic stringify so the same params always hash the same. */
export const stable = (o: unknown): string => {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      return Object.keys(v)
        .sort()
        .reduce((a, k) => ((a[k] = walk(v[k])), a), {} as Record<string, any>);
    }
    return v;
  };
  return JSON.stringify(walk(o));
};

export interface LedgerRow {
  ref: string;
  runId: string;
  workflow: string;
  endpoint: string;
  paramsJson: string;
  responseHash: string;
  cached: boolean;
  status: string;
  ts: string;
}

/**
 * The evidence ledger. One row per Qloo call, so the Receipts view and the
 * claim checker can trace every number back to the request that produced it.
 * Qloo responses are cached here privately and never committed (API terms).
 */
export class Ledger {
  private db: DatabaseSync;
  private counters = new Map<string, number>();

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS qloo_calls(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT, run_id TEXT, workflow TEXT, endpoint TEXT,
        params_json TEXT, response_hash TEXT, cached INTEGER,
        status TEXT, ts TEXT
      );
      CREATE TABLE IF NOT EXISTS qloo_cache(
        key TEXT PRIMARY KEY, response_json TEXT, created_at TEXT
      );
    `);
  }

  /** E1, E2, E3 ... per run, so receipts read in call order. */
  nextRef(runId: string): string {
    const n = (this.counters.get(runId) ?? 0) + 1;
    this.counters.set(runId, n);
    return "E" + n;
  }

  log(row: LedgerRow): void {
    this.db
      .prepare(
        `INSERT INTO qloo_calls
         (ref,run_id,workflow,endpoint,params_json,response_hash,cached,status,ts)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        row.ref,
        row.runId,
        row.workflow,
        row.endpoint,
        row.paramsJson,
        row.responseHash,
        row.cached ? 1 : 0,
        row.status,
        row.ts,
      );
  }

  byRun(runId: string): LedgerRow[] {
    const rows = this.db
      .prepare(
        `SELECT ref, run_id AS runId, workflow, endpoint,
                params_json AS paramsJson, response_hash AS responseHash,
                cached, status, ts
         FROM qloo_calls WHERE run_id = ? ORDER BY id`,
      )
      .all(runId) as any[];
    return rows.map((r) => ({ ...r, cached: !!r.cached }));
  }

  cacheGet(key: string): string | null {
    const r = this.db
      .prepare(`SELECT response_json AS j FROM qloo_cache WHERE key = ?`)
      .get(key) as { j: string } | undefined;
    return r ? r.j : null;
  }

  cacheSet(key: string, json: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO qloo_cache(key,response_json,created_at) VALUES(?,?,?)`,
      )
      .run(key, json, new Date().toISOString());
  }
}
