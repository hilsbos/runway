/**
 * Authorization tier — three planes of a stateless short-lived-token A2A
 * backbone: issuance (regional mint), edge enforcement (local verify), and a
 * globally-replicated source-of-truth ACL graph. See MODEL-SPEC §1.2 (5) and
 * the standalone Appendix A.2 math (which feeds livePairs/issuanceQPS directly).
 *
 * `computeAuthzCore` is the shared math. The folded stack path derives
 * livePairs/issuanceQPS/verifyLoad from `rps`; the standalone harness derives
 * them from active-user fan-out. Both call this with the same shape.
 */
import type { Alg, AuthzResult, Lang, Rev } from "../types.ts";

export interface AuthzCoreArgs {
  alg: Alg;
  lang: Lang;
  ttl: number;
  rev: Rev;
  regions: number;
  aclTuples: number;
  vcache: boolean;
  issuanceQPS: number; // token mint/refresh rate
  verifyLoad: number; // verifies/sec (per-token if cached, per-request if not)
  rmult: number; // compute multiplier (reserved × compute)
  smult: number; // storage multiplier (reserved × storage)
  xregion: number; // cross-region USD/GB
}

export interface AuthzCoreResult extends AuthzResult {
  issPerCore: number;
  verCores: number;
  verifyLatency: number;
  replCost: number;
}

export function computeAuthzCore(
  g: (path: string) => number,
  a: AuthzCoreArgs,
): AuthzCoreResult {
  const tu = g("target_util");
  const nodeVcpu = g("AUTHZ.node_vcpu");
  const nodeGb = g("AUTHZ.node_gb");

  const apiCore = a.lang === "rust" ? g("AUTHZ.core_rust") : g("AUTHZ.core_java");
  const sign = g(`ALG.${a.alg}.sign`);
  const verify = g(`ALG.${a.alg}.verify`);

  // ---- issuance plane (request handling + one signature, in series) ----
  const issPerCore = 1 / (1 / apiCore + 1 / sign);
  const issNodes = Math.max(
    2,
    Math.ceil(a.issuanceQPS / (issPerCore * tu) / nodeVcpu),
  );

  // ---- edge enforcement plane ----
  const verCores = a.verifyLoad / (verify * tu);
  const verNodes = Math.max(2, Math.ceil(verCores / nodeVcpu));

  // ---- source-of-truth plane ----
  const sotWritePerNode = g("AUTHZ.sot_write_per_node");
  const sotRf = g("AUTHZ.sot_rf");
  const tupleBytes = g("AUTHZ.tuple_bytes");
  const sotWrites = (a.aclTuples * 0.001) / 86400 + 50; // ~0.1%/day churn + base edits
  const sotNodes = Math.max(
    sotRf + 2,
    Math.ceil(sotWrites / (sotWritePerNode * tu)),
  );
  const storageGB = (a.aclTuples * tupleBytes) / 1e9 * sotRf;

  // ---- cross-region replication (deltas only) ----
  const secPerMonth = g("SEC_PER_MONTH");
  const replGBmo = (sotWrites * tupleBytes) / 1e9 * secPerMonth * a.regions;
  const replCost = replGBmo * a.xregion;

  // ---- costs ----
  const azNodeCostRaw = nodeVcpu * g("api_cost_vcpu") + nodeGb * g("api_cost_gb");
  const issCost = issNodes * azNodeCostRaw * a.rmult;
  const verCost = verNodes * azNodeCostRaw * a.rmult;
  const sotCost = sotNodes * g("AUTHZ.sot_cost") * a.smult;
  const cost = issCost + verCost + sotCost + replCost;

  const util = Math.max(
    verCores / (verNodes * nodeVcpu),
    a.issuanceQPS / (issPerCore * issNodes * nodeVcpu),
  );

  const verifyLatency = a.vcache
    ? g("AUTHZ.lat_verify_local")
    : g("AUTHZ.lat_verify_call");
  const staleness =
    a.rev === "push" ? Math.min(a.ttl, g("AUTHZ.push_lag_s")) : a.ttl;

  return {
    enabled: true,
    issuanceQPS: a.issuanceQPS,
    verifyLoad: a.verifyLoad,
    verCores,
    issNodes,
    verNodes,
    sotNodes,
    storageGB,
    aclTuples: a.aclTuples,
    staleness,
    util,
    cost,
    issPerCore,
    verifyLatency,
    replCost,
  };
}

export const DISABLED_AUTHZ: AuthzResult = {
  enabled: false,
  issuanceQPS: 0,
  verifyLoad: 0,
  verCores: 0,
  issNodes: 0,
  verNodes: 0,
  sotNodes: 0,
  storageGB: 0,
  aclTuples: 0,
  staleness: 0,
  util: 0,
  cost: 0,
};
