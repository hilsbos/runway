/**
 * Runway — model type definitions.
 *
 * Pure, framework-free. No React/DOM. These types are the contract between the
 * model engine and the UI; the UI imports from here, never the reverse.
 */

/* -------------------------------------------------------------------------- */
/* enums / unions                                                             */
/* -------------------------------------------------------------------------- */

export type Lang = "rust" | "java";
export type Proto = "rest" | "grpc";
export type Db =
  | "cassandra"
  | "mongodb"
  | "postgres"
  | "mysql"
  | "aurora"
  | "oracledb"
  | "yugabytedb";
export type Cache = "none" | "local" | "distributed";
export type Provider = "aws" | "gcp" | "azure" | "onprem";
export type Status = "ok" | "warn" | "bad";
export type TierKey = "lb" | "api" | "cache" | "datastore" | "authz";
export type GrowthModel = "linear" | "exponential";
export type Alg = "eddsa" | "ecdsa" | "rsa";
export type Rev = "expiry" | "push";

/* -------------------------------------------------------------------------- */
/* inputs                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuthzConfig {
  enabled: boolean;
  alg: Alg;
  ttl: number; // token TTL seconds
  tokensPerReq: number; // live (subject,audience) token pairs per rps
  vcache: boolean; // cache token verify vs verify per request
  rev: Rev; // revocation model (drives staleness, not cost)
  regions: number; // regional cells for SoT replication
  aclTuples: number; // size of the relationship graph in the source of truth
}

export interface StackInputs {
  provider: Provider;
  rps: number;
  readFrac: number;
  lang: Lang;
  proto: Proto;
  db: Db;
  cache: Cache;
  hitRatio: number;
  cores: number;
  ramGB: number;
  managed: boolean;
  reserved: boolean;
  egress: boolean;
  authz: AuthzConfig;
}

/** Base for growth = StackInputs WITHOUT rps. */
export type BaseStackInputs = Omit<StackInputs, "rps">;

/* -------------------------------------------------------------------------- */
/* component / stack results                                                  */
/* -------------------------------------------------------------------------- */

export interface ComponentResult {
  nodes: number;
  util: number;
  cost: number;
}

export interface AuthzResult {
  enabled: boolean;
  issuanceQPS: number;
  verifyLoad: number;
  verCores: number;
  issNodes: number;
  verNodes: number;
  sotNodes: number;
  storageGB: number;
  aclTuples: number;
  staleness: number;
  util: number;
  cost: number;
}

export interface StackResult {
  lb: ComponentResult;
  api: ComponentResult;
  cache: ComponentResult;
  datastore: ComponentResult;
  authz: AuthzResult;

  // convenience mirrors
  lbNodes: number;
  apiNodes: number;
  cacheNodes: number;
  dbNodes: number;

  utils: Partial<Record<TierKey, number>>; // authz key present only when enabled
  costs: Record<"lb" | "api" | "cache" | "datastore" | "authz" | "egress", number>;
  total: number;

  p50: number;
  p99: number;
  /**
   * Per-hop latency CONTRIBUTIONS (ms), probability-weighted; sum === p50.
   * cacheHit = h*hitL, db = (1-h)*dbL. Use for "where does the average request
   * spend its time" breakdowns. NOT the latency a single request incurs per hop.
   */
  latParts: { lb: number; verify: number; api: number; cacheHit: number; db: number };
  /**
   * RAW per-hop latencies (ms) — the ACTUAL time a request traversing that hop
   * incurs, NOT probability-weighted (unlike `latParts`). cacheHit = hitL (raw
   * cache-hit latency), db = dbL (raw DB-read latency). These do NOT sum to p50.
   */
  latHops: { lb: number; verify: number; api: number; cacheHit: number; db: number };

  maxUtil: number;
  bottleneck: TierKey;

  memUtil: number;
  memOver: boolean;
  writeCeiling: boolean;

  status: Status;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* growth                                                                     */
/* -------------------------------------------------------------------------- */

export interface GrowthInputs {
  startRps: number;
  model: GrowthModel;
  ratePerYear: number;
  horizonMonths: number;
}

export interface GrowthPoint {
  month: number;
  rps: number;
  total: number;
  p50: number;
  p99: number;
  maxUtil: number;
  bottleneck: TierKey;
  status: Status;
  costs: StackResult["costs"];
  nodes: {
    lb: number;
    api: number;
    cache: number;
    db: number;
    authz: { iss: number; ver: number; sot: number };
  };
  utils: Partial<Record<TierKey, number>>;
}

export interface ScalingEvent {
  month: number;
  rps: number;
  kind: "warning" | "breaking";
  tier: TierKey;
  message: string;
  runwayMonths: number;
}

export interface GrowthResult {
  points: GrowthPoint[];
  events: ScalingEvent[];
  runwayMonths: number | null; // first 'breaking' event month, else null
  horizonMonths: number;
}

/* -------------------------------------------------------------------------- */
/* compare                                                                    */
/* -------------------------------------------------------------------------- */

export interface NamedDesign {
  id: string;
  name: string;
  inputs: BaseStackInputs;
}

export interface CompareResult {
  horizonMonths: number;
  perDesign: {
    id: string;
    name: string;
    runwayMonths: number | null;
    cumulativeCost: number;
    endCost: number;
    endP99: number;
    endStatus: Status;
    endBottleneck: TierKey;
    series: GrowthPoint[];
    events: ScalingEvent[];
  }[];
  winners: { cost: string; runway: string; latency: string }; // design ids
}

/* -------------------------------------------------------------------------- */
/* verdict                                                                    */
/* -------------------------------------------------------------------------- */

export interface Verdict {
  tone: "good" | "warn" | "bad";
  headline: string;
  detail: string;
}

/* -------------------------------------------------------------------------- */
/* constants metadata                                                         */
/* -------------------------------------------------------------------------- */

export interface Constant<T = number> {
  value: T;
  unit: string;
  source: string;
  editable?: [number, number];
}

export interface ProviderPrice {
  compute: Constant;
  storage: Constant;
  reserved: Constant;
  egress: Constant;
  xregion: Constant;
  label: string;
}
