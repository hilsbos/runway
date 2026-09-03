/**
 * Runway — standalone authorization sizing (Appendix A.2 verification
 * harness). This reproduces the full-scale A2A authz numbers (80M+ enforce)
 * using active-user fan-out inputs, distinct from the §1 stack folding. It
 * shares the exact same core math (`computeAuthzCore`) and constants, so it
 * pins the ALG/AUTHZ values that the folded stack path also relies on.
 *
 * Pure & deterministic. Not part of the primary UI surface; exported for tests
 * and any advanced "authz at scale" exploration.
 */
import type { Alg, AuthzResult, Lang, Rev, Status } from "./types.ts";
import { resolve } from "./constants.ts";
import { computeAuthzCore } from "./components/authz.ts";

export interface AuthzStandaloneInputs {
  users: number;
  agents: number;
  svc: number;
  conc: number;
  calls: number;
  ttl: number;
  alg: Alg;
  lang: Lang;
  rev: Rev;
  regions: number;
  vcache: boolean;
  reserved: boolean;
}

export interface AuthzStandaloneResult extends AuthzResult {
  enforceRPS: number;
  liveTokens: number;
  status: Status;
}

export function computeAuthzStandalone(
  inputs: AuthzStandaloneInputs,
  overrides?: Record<string, number>,
): AuthzStandaloneResult {
  const g = resolve(overrides);

  const activeUsers = inputs.users * inputs.conc;
  const activeAgents = activeUsers * inputs.agents;
  const livePairs = activeAgents * inputs.svc;
  const issuanceQPS = livePairs / inputs.ttl;
  const enforceRPS = activeAgents * inputs.calls;
  const aclTuples = inputs.users * inputs.agents * inputs.svc;

  const verifyLoad = inputs.vcache ? issuanceQPS * 1.5 : enforceRPS;

  // AWS-basis multipliers (Appendix A.2 uses AWS reserved_mult, xregion).
  const reservedMult = inputs.reserved ? g("PRICE.aws.reserved") : 1;
  const rmult = reservedMult * g("PRICE.aws.compute");
  const smult = reservedMult * g("PRICE.aws.storage");

  const core = computeAuthzCore(g, {
    alg: inputs.alg,
    lang: inputs.lang,
    ttl: inputs.ttl,
    rev: inputs.rev,
    regions: inputs.regions,
    aclTuples,
    vcache: inputs.vcache,
    issuanceQPS,
    verifyLoad,
    rmult,
    smult,
    xregion: g("PRICE.aws.xregion"),
  });

  // A.2 status: per-call verify cost sink, RSA issuance throttle.
  let status: Status;
  if (!inputs.vcache && core.verCores > 4000) {
    status = "bad";
  } else if (inputs.alg === "rsa" && core.issNodes > 40) {
    status = "warn";
  } else {
    status = "ok";
  }

  return {
    ...core,
    enforceRPS,
    liveTokens: livePairs,
    status,
  };
}
