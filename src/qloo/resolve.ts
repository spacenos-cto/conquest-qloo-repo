import type { QlooGateway } from "./gateway.js";
import type { Entity } from "./types.js";

export interface ResolveResult {
  entity?: Entity;
  /** Present when the name is ambiguous: show these and ask (confirm chips). */
  candidates?: Entity[];
  status: string;
}

/**
 * Turn a plain name into a Qloo entity. Qloo's search has no relevance score,
 * so on an ambiguous or needs_input result we return candidates for a human to
 * confirm rather than silently taking the first hit.
 */
export async function resolve(
  g: QlooGateway,
  name: string,
  runId: string,
): Promise<ResolveResult> {
  const env = await g.call("describe", { name }, runId);

  if (env.status === "needs_input") {
    const candidates = (env.results ?? []).map(toEntity);
    return { candidates, status: env.status };
  }
  if (env.status === "empty" || (env.results ?? []).length === 0) {
    return { status: "empty" };
  }

  const first = env.results[0];
  return { entity: toEntity(first), status: env.status };
}

function toEntity(r: any): Entity {
  return { id: r.entity_id ?? r.id, name: r.name, type: r.type ?? "unknown" };
}
