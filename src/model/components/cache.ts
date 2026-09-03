/**
 * Cache tier. Distributed (Redis-class) adds nodes; local/none add none.
 * See MODEL-SPEC §1.2 (3).
 */
import type { Cache, ComponentResult } from "../types.ts";

export function computeCache(
  g: (path: string) => number,
  cache: Cache,
  cacheGets: number,
  writes: number,
  dmult: number,
): ComponentResult {
  if (cache !== "distributed") {
    return { nodes: 0, util: 0, cost: 0 };
  }
  const tput = g("redis_tput");
  const tu = g("target_util");
  const rf = g("redis_rf");
  const ops = cacheGets + writes; // GETs + write-through SET/invalidate
  const nodes = Math.max(rf, Math.ceil(ops / (tput * tu)));
  const util = ops / (nodes * tput);
  const cost = nodes * g("redis_cost") * dmult;
  return { nodes, util, cost };
}
