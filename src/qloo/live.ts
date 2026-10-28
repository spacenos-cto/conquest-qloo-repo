import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvelopeT } from "./types.js";

const run = promisify(execFile);

/**
 * Live Qloo backend. Shells out to the public harness:
 *   qloo exec <workflow> --input-file <params.json>
 * The harness holds the event key (set via `qloo setup --qloo`) and points at
 * hackathon.api.qloo.com. We never pass the key on the command line.
 *
 * Only reached when QLOO_MODE=live. Until the key arrives, mock.ts is used.
 * When the key lands: run one workflow by hand, confirm the stdout JSON matches
 * the Envelope shape, and adjust here if the harness wraps results differently.
 */
export async function liveCall(
  workflow: string,
  params: Record<string, unknown>,
): Promise<EnvelopeT> {
  const dir = await mkdtemp(join(tmpdir(), "rehearsal-"));
  const file = join(dir, "request.json");
  try {
    await writeFile(file, JSON.stringify(params), "utf8");
    const { stdout } = await run(
      "qloo",
      ["exec", workflow, "--input-file", file],
      { shell: process.platform === "win32", maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as EnvelopeT;
  } catch (err: any) {
    return {
      status: "error",
      summary: "harness call failed",
      results: [],
      result_count: 0,
      error: {
        code: "HARNESS_EXEC",
        retryable: false,
        recovery:
          "Check: npm i -g @qloo/qloo-harness; qloo setup --qloo; qloo setup --status (expect 'Qloo data: ready'). " +
          String(err?.message ?? err),
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
