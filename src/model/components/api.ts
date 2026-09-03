/**
 * API tier. Node throughput scales with vCPU. See MODEL-SPEC §1.2 (2).
 */
import type { ComponentResult, Lang, Proto } from "../types.ts";

export interface ApiResult extends ComponentResult {
  rpsPerNode: number;
  apiT: number; // per-node throughput ceiling
  nodeCostRaw: number;
}

export function computeApi(
  g: (path: string) => number,
  rps: number,
  lang: Lang,
  proto: Proto,
  cores: number,
  ramGB: number,
  rmult: number,
): ApiResult {
  const perCore = g(`core_${lang}_${proto}`);
  const apiT = perCore * cores;
  const tu = g("target_util");
  const nodes = Math.ceil(rps / (apiT * tu));
  const util = rps / (nodes * apiT);
  const rpsPerNode = rps / nodes;
  const nodeCostRaw = cores * g("api_cost_vcpu") + ramGB * g("api_cost_gb");
  const cost = nodes * nodeCostRaw * rmult;
  return { nodes, util, cost, rpsPerNode, apiT, nodeCostRaw };
}
