/**
 * Load-balancer tier (HAProxy-class). >=2 nodes for HA. See MODEL-SPEC §1.2 (1).
 */
import type { ComponentResult } from "../types.ts";

export function computeLb(
  g: (path: string) => number,
  rps: number,
  rmult: number,
): ComponentResult {
  const tput = g("haproxy_tput");
  const tu = g("target_util");
  const nodes = Math.max(2, Math.ceil(rps / (tput * tu)));
  const util = rps / (nodes * tput);
  const cost = nodes * g("haproxy_cost") * rmult;
  return { nodes, util, cost };
}
