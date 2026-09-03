/**
 * Runway — unified stack snapshot (`computeStack`). Composes the five tiers
 * (LB → API → cache → datastore → authz) at one load level and one instant.
 * See MODEL-SPEC §1.2. Pure & deterministic.
 */
import type {
  AuthzResult,
  StackInputs,
  StackResult,
  Status,
  TierKey,
} from "./types.ts";
import { DB_KEY, resolve } from "./constants.ts";
import { sanitizeInputs, sanitizeOverrides } from "./sanitize.ts";
import { computeLb } from "./components/lb.ts";
import { computeApi } from "./components/api.ts";
import { computeCache } from "./components/cache.ts";
import { computeDatastore } from "./components/datastore.ts";
import { computeAuthzCore, DISABLED_AUTHZ } from "./components/authz.ts";

const BOTTLENECK_ORDER: TierKey[] = ["lb", "api", "cache", "datastore", "authz"];

/**
 * "Running hot" warn threshold. MODEL-SPEC §1.2 prose says `> 0.92`, but the
 * §3.3 growth golden trajectory pins warn-onset at the datastore m17 point
 * (util .973) while m16 (util .936) is still ok — i.e. the binding golden
 * requires the threshold to sit in (0.936, 0.973]. We use 0.95 so the exact
 * event months (warning@17, breaking@18) reproduce. Documented deviation from
 * the literal 0.92 in the prose; the worked golden takes precedence per the
 * "golden mismatch is an engine bug" rule.
 */
const RUNNING_HOT_UTIL = 0.95;

export function computeStack(
  rawInputs: StackInputs,
  rawOverrides?: Record<string, number>,
): StackResult {
  // Boundary: clamp out-of-spec inputs/overrides so the engine never sees a
  // value it can't model (rps=0, cores=0, hitRatio>1, {target_util:0}, …).
  // Identity for in-spec inputs, so all goldens stay green (see sanitize.ts).
  const inputs = sanitizeInputs(rawInputs);
  const overrides = rawOverrides ? sanitizeOverrides(rawOverrides) : undefined;
  const g = resolve(overrides);
  const price = pricePaths(inputs.provider);

  // ---- derive traffic ----
  const reads = inputs.rps * inputs.readFrac;
  const writes = inputs.rps * (1 - inputs.readFrac);
  let h = inputs.cache === "none" ? 0 : inputs.hitRatio;
  if (inputs.cache === "local") h *= g("local_hit_penalty");
  const dbReads = reads * (1 - h);
  const cacheGets = reads * h;

  // ---- provider price multipliers ----
  const compute = g(price.compute);
  const storage = g(price.storage);
  const reservedMult = inputs.reserved ? g(price.reserved) : 1;
  const managedMult = inputs.managed ? g("managed_mult") : 1;
  const rmult = reservedMult * compute; // compute nodes (LB, API, authz)
  const smult = reservedMult * storage; // stateful nodes (DB, cache, SoT)
  const dmult = managedMult * smult; // managed premium on DB/cache

  // ---- 1. LB ----
  const lb = computeLb(g, inputs.rps, rmult);

  // ---- 2. API ----
  const api = computeApi(
    g,
    inputs.rps,
    inputs.lang,
    inputs.proto,
    inputs.cores,
    inputs.ramGB,
    rmult,
  );

  // ---- 3. CACHE ----
  const cache = computeCache(g, inputs.cache, cacheGets, writes, dmult);

  // ---- 4. DATASTORE ----
  const dbKey = DB_KEY[inputs.db];
  const writeScales =
    dbKey === "cass" || dbKey === "mongo"; // pg.writeScales = false
  const datastore = computeDatastore(
    g,
    inputs.db,
    dbReads,
    writes,
    dmult,
    writeScales,
  );

  // ---- 5. AUTHZ ----
  let authz: AuthzResult = DISABLED_AUTHZ;
  let verifyLatency = 0;
  if (inputs.authz.enabled) {
    const livePairs = inputs.rps * inputs.authz.tokensPerReq;
    const issuanceQPS = livePairs / inputs.authz.ttl;
    const verifyLoad = inputs.authz.vcache ? issuanceQPS * 1.5 : inputs.rps;
    const core = computeAuthzCore(g, {
      alg: inputs.authz.alg,
      lang: inputs.lang,
      ttl: inputs.authz.ttl,
      rev: inputs.authz.rev,
      regions: inputs.authz.regions,
      aclTuples: inputs.authz.aclTuples,
      vcache: inputs.authz.vcache,
      issuanceQPS,
      verifyLoad,
      rmult,
      smult,
      xregion: g(price.xregion),
    });
    authz = core;
    verifyLatency = core.verifyLatency;
  }

  // ---- LATENCY ----
  const apiL =
    (inputs.lang === "rust" ? g("lat_api_rust") : g("lat_api_java")) *
    (inputs.proto === "grpc" ? g("lat_grpc_factor") : 1);
  const hitL =
    inputs.cache === "local"
      ? g("lat_local_hit")
      : inputs.cache === "distributed"
        ? g("lat_dist_hit")
        : 0;
  const dbL = g(`lat_db.${inputs.db}`);
  const p50 = g("lat_haproxy") + verifyLatency + apiL + (h * hitL + (1 - h) * dbL);

  // ---- utils / maxUtil / bottleneck ----
  const utils: Partial<Record<TierKey, number>> = {
    lb: lb.util,
    api: api.util,
    cache: cache.util,
    datastore: datastore.util,
  };
  if (inputs.authz.enabled) utils.authz = authz.util;

  let bottleneck: TierKey = "lb";
  let maxUtil = -Infinity;
  for (const tier of BOTTLENECK_ORDER) {
    const v = utils[tier];
    if (v !== undefined && v > maxUtil) {
      maxUtil = v;
      bottleneck = tier;
    }
  }

  const p99 = p50 * (2.4 + maxUtil * 4.5);

  // ---- per-hop latency breakdown (additive; sum === p50) ----
  const latParts = {
    lb: g("lat_haproxy"),
    verify: verifyLatency,
    api: apiL,
    cacheHit: h * hitL,
    db: (1 - h) * dbL,
  };

  // ---- raw per-hop latencies (NOT weighted; do NOT sum to p50) ----
  // The actual latency a request incurs traversing each hop: cacheHit = the raw
  // cache-hit latency (hitL), db = the raw DB-read latency (dbL). Contrast with
  // latParts above, whose cacheHit/db are probability-weighted by the hit ratio.
  const latHops = {
    lb: g("lat_haproxy"),
    verify: verifyLatency,
    api: apiL,
    cacheHit: hitL,
    db: dbL,
  };

  // ---- API node memory (Little's law concurrency) ----
  const conc = api.rpsPerNode * (p50 / 1000);
  const memBase =
    inputs.lang === "rust" ? g("mem_base_rust") : g("mem_base_java");
  const memConn =
    inputs.lang === "rust" ? g("mem_conn_rust") : g("mem_conn_java");
  const memUsed =
    memBase +
    conc * memConn +
    (inputs.cache === "local" ? g("local_cache_mb") : 0);
  const memUtil = memUsed / (inputs.ramGB * 1024);
  const memOver = memUtil > 1;

  // ---- COST roll-up ----
  const egressGB = inputs.egress
    ? (reads * g("payload_kb")) / 1048576 * g("SEC_PER_MONTH")
    : 0;
  const egressCost = egressGB * g(price.egress);
  const total =
    lb.cost + api.cost + cache.cost + datastore.cost + authz.cost + egressCost;

  // ---- STATUS (first match wins) ----
  const authzCostSink =
    inputs.authz.enabled && !inputs.authz.vcache && authz.verCores > 4000;
  let status: Status;
  let message: string;
  if (datastore.writeCeiling) {
    status = "bad";
    message =
      "Datastore write ceiling: writes exceed a single primary; needs sharding or a write-scaling engine.";
  } else if (authzCostSink) {
    status = "bad";
    message =
      "Authz per-call verification dominates cost; enable token-verify caching.";
  } else if (memOver) {
    status = "warn";
    message =
      "API node RAM exceeded; raise RAM/node or move cache to distributed.";
  } else if (maxUtil > RUNNING_HOT_UTIL) {
    status = "warn";
    message = `Running hot: ${bottleneck} at ${Math.round(maxUtil * 100)}% utilization.`;
  } else {
    status = "ok";
    message = "Healthy: all tiers within target utilization.";
  }

  return {
    lb: { nodes: lb.nodes, util: lb.util, cost: lb.cost },
    api: { nodes: api.nodes, util: api.util, cost: api.cost },
    cache,
    datastore: {
      nodes: datastore.nodes,
      util: datastore.util,
      cost: datastore.cost,
    },
    authz,

    lbNodes: lb.nodes,
    apiNodes: api.nodes,
    cacheNodes: cache.nodes,
    dbNodes: datastore.nodes,

    utils,
    costs: {
      lb: lb.cost,
      api: api.cost,
      cache: cache.cost,
      datastore: datastore.cost,
      authz: authz.cost,
      egress: egressCost,
    },
    total,

    p50,
    p99,
    latParts,
    latHops,

    maxUtil,
    bottleneck,

    memUtil,
    memOver,
    writeCeiling: datastore.writeCeiling,

    status,
    message,
  };
}

/* dotted paths into PRICE[provider] */
function pricePaths(provider: string) {
  return {
    compute: `PRICE.${provider}.compute`,
    storage: `PRICE.${provider}.storage`,
    reserved: `PRICE.${provider}.reserved`,
    egress: `PRICE.${provider}.egress`,
    xregion: `PRICE.${provider}.xregion`,
  };
}
