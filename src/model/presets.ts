/**
 * Runway — default inputs, reference-architecture templates, and per-cloud
 * cost deltas. Pure & deterministic.
 */
import type {
  AuthzConfig,
  NamedDesign,
  Provider,
  StackInputs,
} from "./types.ts";
import { computeStack } from "./stack.ts";

const AUTHZ_OFF: AuthzConfig = {
  enabled: false,
  alg: "ecdsa",
  ttl: 300,
  tokensPerReq: 1,
  vcache: true,
  rev: "push",
  regions: 12,
  aclTuples: 2.5e9,
};

/** A sane default snapshot, optionally for a chosen provider. */
export function defaultInputs(provider: Provider = "aws"): StackInputs {
  return {
    provider,
    rps: 100000,
    readFrac: 0.9,
    lang: "rust",
    proto: "rest",
    db: "cassandra",
    cache: "distributed",
    hitRatio: 0.9,
    cores: 8,
    ramGB: 16,
    managed: false,
    reserved: true,
    egress: false,
    authz: { ...AUTHZ_OFF },
  };
}

/* -------------------------------------------------------------------------- */
/* TEMPLATES — 4 named reference architectures (+ optional Mongo Balanced)     */
/* -------------------------------------------------------------------------- */

export const TEMPLATES: NamedDesign[] = [
  {
    id: "lean-read-api",
    name: "Lean Read API",
    inputs: {
      provider: "aws",
      readFrac: 0.95,
      lang: "rust",
      proto: "rest",
      db: "cassandra",
      cache: "distributed",
      hitRatio: 0.9,
      cores: 8,
      ramGB: 16,
      managed: false,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "postgres-monolith",
    name: "Postgres Monolith",
    inputs: {
      provider: "aws",
      readFrac: 0.7,
      lang: "java",
      proto: "rest",
      db: "postgres",
      cache: "distributed",
      hitRatio: 0.8,
      cores: 8,
      ramGB: 16,
      managed: true,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "global-grpc-authz",
    name: "Global gRPC",
    inputs: {
      provider: "aws",
      readFrac: 0.85,
      lang: "rust",
      proto: "grpc",
      db: "cassandra",
      cache: "distributed",
      hitRatio: 0.9,
      cores: 16,
      ramGB: 32,
      managed: false,
      reserved: true,
      egress: true,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "onprem-cassandra",
    name: "On-Prem Cassandra",
    inputs: {
      provider: "onprem",
      readFrac: 0.8,
      lang: "rust",
      proto: "rest",
      db: "cassandra",
      cache: "distributed",
      hitRatio: 0.85,
      cores: 8,
      ramGB: 16,
      managed: false,
      reserved: false,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "mongo-balanced",
    name: "Mongo Balanced",
    inputs: {
      provider: "aws",
      readFrac: 0.75,
      lang: "java",
      proto: "grpc",
      db: "mongodb",
      cache: "distributed",
      hitRatio: 0.85,
      cores: 8,
      ramGB: 16,
      managed: false,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "mysql-web",
    name: "MySQL Web App",
    inputs: {
      provider: "aws",
      readFrac: 0.85,
      lang: "java",
      proto: "rest",
      db: "mysql",
      cache: "distributed",
      hitRatio: 0.85,
      cores: 8,
      ramGB: 16,
      managed: true,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "aurora-serverless-api",
    name: "Aurora API",
    inputs: {
      provider: "aws",
      readFrac: 0.9,
      lang: "rust",
      proto: "rest",
      db: "aurora",
      cache: "distributed",
      hitRatio: 0.9,
      cores: 8,
      ramGB: 16,
      managed: true,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
  {
    id: "oracle-enterprise",
    name: "Oracle Enterprise",
    inputs: {
      provider: "aws",
      readFrac: 0.8,
      lang: "java",
      proto: "rest",
      db: "oracledb",
      cache: "distributed",
      hitRatio: 0.8,
      cores: 16,
      ramGB: 32,
      managed: true,
      reserved: true,
      egress: false,
      authz: { ...AUTHZ_OFF },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* per-cloud cost deltas                                                       */
/* -------------------------------------------------------------------------- */

const PROVIDERS: Provider[] = ["aws", "gcp", "azure", "onprem"];

/**
 * Cost of the same design across all providers, with Δ vs a base provider.
 */
export function perCloudDeltas(
  inputs: StackInputs,
  base: Provider = "aws",
  overrides?: Record<string, number>,
): Record<Provider, { total: number; deltaVsBaseUsd: number; deltaVsBasePct: number }> {
  const baseTotal = computeStack({ ...inputs, provider: base }, overrides).total;
  const out = {} as Record<
    Provider,
    { total: number; deltaVsBaseUsd: number; deltaVsBasePct: number }
  >;
  for (const p of PROVIDERS) {
    const total = computeStack({ ...inputs, provider: p }, overrides).total;
    const deltaVsBaseUsd = total - baseTotal;
    const deltaVsBasePct = baseTotal === 0 ? 0 : deltaVsBaseUsd / baseTotal;
    out[p] = { total, deltaVsBaseUsd, deltaVsBasePct };
  }
  return out;
}
