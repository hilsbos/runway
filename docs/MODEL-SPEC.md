# MODEL-SPEC

The domain model for **Runway**.

> **Status: MODEL LOCKED (Phase 1 complete).** This document is the authoritative, unified, growth-aware, multi-cloud domain model. The body below specifies — with exact constants, formulas in order, and worked golden-value fixtures — the single request-path stack (load balancer → API → cache → datastore → **authorization**), multi-cloud price tables, growth-over-time simulation, candidate comparison, and the deterministic verdict generator. The **Design System** section and the **Appendices** (verified AWS constants + sources) are preserved verbatim as the cited basis. Engine code (Phase 2+) implements this spec exactly; a golden-test failure later is an engine bug, not a fixture bug.

---

## 0. Overview & invariants

Runway models **one request-serving stack** as five components composed along a single request path:

```
client → [LB] → [API] → [CACHE] → [DATASTORE]
                  └────→ [AUTHZ]  (every request carries an authorization check)
```

A **snapshot** (`computeStack`) sizes that stack at one load level and one instant, producing node counts, per-tier utilization, p50/p99 (plus a per-hop `latParts` breakdown summing to p50), the bottleneck tier, a per-component + total monthly cost, and an `ok`/`warn`/`bad` status with a plain-English message. **Growth** (`simulateGrowth`) sweeps the snapshot across a month-indexed load curve to produce trajectories and *dated* scaling events with the runway each buys. **Comparison** (`compareDesigns`) diffs 2–3 candidate designs over a shared horizon. **Verdict** (`generateVerdict`) turns those outputs into an honest recommendation.

Global invariants (carried from Appendix A and unchanged):

- Rates are **per second** unless noted; money is **USD/month**. `ceil`=`Math.ceil`, `max`=`Math.max`, `min`=`Math.min`.
- `target_util` (0.7) sizes every tier with headroom: provision for `load / (capacity × target_util)`, then **report utilization against raw capacity** (so a tier sized at target reads ~0.7, not 1.0).
- **Purity & determinism.** No I/O, no `Date.now()` in formula paths. Growth is over an explicit integer `month` axis (0 = today).
- **Provider is an input.** All node/egress costs are AWS-basis (Appendix A/B) scaled by a per-provider price table (§4).
- **Constant metadata** (§6) drives a *generated* Assumptions/Sources panel. The engine reads `.value`; `computeStack` takes a flattened numeric config so a test can override one value cleanly.

---

## 1. Unified stack — `computeStack`

### 1.1 Inputs

```ts
type Lang  = 'rust' | 'java';
type Proto = 'rest' | 'grpc';
type Db    = 'cassandra' | 'mongodb' | 'postgres';
type Cache = 'none' | 'local' | 'distributed';
type Provider = 'aws' | 'gcp' | 'azure' | 'onprem';

interface StackInputs {
  provider: Provider;          // price table selector (default 'aws')
  rps: number;                 // target requests/sec (1e3 .. 1e6+)
  readFrac: number;            // 0.5 .. 1.0 fraction of rps that are reads
  lang: Lang;
  proto: Proto;
  db: Db;
  cache: Cache;
  hitRatio: number;            // 0 .. 0.99 (ignored when cache==='none')
  cores: number;               // vCPU per API node (1 .. 64)
  ramGB: number;               // GB per API node (1 .. 128)
  managed: boolean;            // managed DB/cache premium
  reserved: boolean;           // reserved / committed-use pricing
  egress: boolean;             // count internet egress
  authz: AuthzConfig;          // authorization component (may be disabled)
}

interface AuthzConfig {
  enabled: boolean;            // when false, authz contributes 0 nodes/cost/latency
  alg: 'eddsa' | 'ecdsa' | 'rsa';
  ttl: number;                 // token TTL seconds (30 .. 3600)
  tokensPerReq: number;        // live (subject,audience) token pairs per rps (0.5 .. 4); default 1
  vcache: boolean;             // cache token verify (per-token) vs verify per request
  rev: 'expiry' | 'push';      // revocation model (drives staleness, not cost)
  regions: number;             // regional cells for SoT replication (1 .. 40)
  aclTuples: number;           // size of the relationship graph in the source of truth
}
```

`db` key map: `cassandra→cass`, `mongodb→mongo`, `postgres→pg` (Appendix A.1 `CAPACITY`). Authz draws on Appendix A.2 `AUTHZ` + `ALG`, with two new latency constants added in §6.

### 1.2 Formulas (in order)

All `CAPACITY.*` / `AUTHZ.*` / `ALG.*` refer to the `.value` of the Appendix constants. `C = PRICE[provider]` (§4).

```
// ---- derive traffic ----
reads  = rps * readFrac
writes = rps * (1 - readFrac)
h = (cache === 'none') ? 0 : hitRatio
if (cache === 'local') h *= local_hit_penalty        // effective hit ratio
dbReads   = reads * (1 - h)
cacheGets = reads * h
tu = target_util

// ---- price multipliers (provider-aware) ----
rmult = (reserved ? C.reserved : 1) * C.compute       // compute nodes (LB, API, authz)
smult = (reserved ? C.reserved : 1) * C.storage       // stateful nodes (DB, cache, SoT)
dmult = (managed ? managed_mult : 1) * smult          // managed premium on DB/cache

// ---- 1. LOAD BALANCER (>=2 for HA) ----
lbNodes = max(2, ceil(rps / (haproxy_tput * tu)))
lbUtil  = rps / (lbNodes * haproxy_tput)
lbCost  = lbNodes * haproxy_cost * rmult

// ---- 2. API (node tput scales with vCPU) ----
perCore    = core_<lang>_<proto>
apiT       = perCore * cores                           // per-node ceiling
apiNodes   = ceil(rps / (apiT * tu))
apiUtil    = rps / (apiNodes * apiT)
rpsPerNode = rps / apiNodes
apiNodeCostRaw = cores*api_cost_vcpu + ramGB*api_cost_gb   // AWS basis ≈ $209.6 @ 8/16
apiCost    = apiNodes * apiNodeCostRaw * rmult

// ---- 3. CACHE ----
if (cache === 'distributed') {
  ops        = cacheGets + writes                      // GETs + write-through SET/invalidate
  cacheNodes = max(redis_rf, ceil(ops / (redis_tput * tu)))
  cacheUtil  = ops / (cacheNodes * redis_tput)
  cacheCost  = cacheNodes * redis_cost * dmult
} else { cacheNodes = 0; cacheUtil = 0; cacheCost = 0 } // local cache: in-process, 0 extra nodes

// ---- 4. DATASTORE  (rPer,wPer,cPer,rf,writeScales from CAPACITY[dbkey]) ----
readNodes    = ceil(dbReads / (rPer * tu))
writeNodes   = writeScales ? ceil(writes / (wPer * tu)) : 1
writeCeiling = (!writeScales) && (writes > wPer)       // single-primary write ceiling (Postgres)
dbNodes      = max(rf, readNodes, writeNodes)
dbUtil       = max(dbReads / (dbNodes * rPer),
                   writes / ((writeScales ? dbNodes : 1) * wPer))
dbCost       = dbNodes * cPer * dmult

// ---- 5. AUTHORIZATION (component) ----
if (authz.enabled) {
  A = ALG[authz.alg]
  livePairs   = rps * authz.tokensPerReq               // live (subject,audience) pairs at peak
  issuanceQPS = livePairs / authz.ttl                  // token mint/refresh rate
  apiCore     = core_<lang>                            // request-handling core, same runtime as API
  issPerCore  = 1 / (1/apiCore + 1/A.sign)             // series: request handling + one signature
  issNodes    = max(2, ceil(issuanceQPS / (issPerCore * tu) / node_vcpu))
  verifyLoad  = authz.vcache ? issuanceQPS * 1.5 : rps // cached ≈ per-token refresh; else per request
  verCores    = verifyLoad / (A.verify * tu)
  verNodes    = max(2, ceil(verCores / node_vcpu))
  sotWrites   = authz.aclTuples * 0.001 / 86400 + 50   // ~0.1%/day churn + base policy edits, /s
  sotNodes    = max(sot_rf + 2, ceil(sotWrites / (sot_write_per_node * tu)))
  storageGB   = authz.aclTuples * tuple_bytes / 1e9 * sot_rf
  replGBmo    = sotWrites * tuple_bytes / 1e9 * SEC_PER_MONTH * authz.regions
  replCost    = replGBmo * C.xregion                   // cross-region delta replication only
  azNodeCostRaw = node_vcpu*api_cost_vcpu + node_gb*api_cost_gb   // ≈ $209.6
  issCost     = issNodes * azNodeCostRaw * rmult
  verCost     = verNodes * azNodeCostRaw * rmult
  sotCost     = sotNodes * sot_cost * smult
  authzCost   = issCost + verCost + sotCost + replCost
  authzUtil   = max(verCores / (verNodes * node_vcpu),
                    issuanceQPS / (issPerCore * issNodes * node_vcpu))
  verifyLatency = authz.vcache ? lat_verify_local : lat_verify_call
  staleness   = (authz.rev === 'push') ? min(authz.ttl, push_lag_s) : authz.ttl
} else {
  authzCost = 0; verifyLatency = 0; authzUtil = 0        // and all authz.* node counts = 0
}

// ---- LATENCY (p50 = sum of path contributions) ----
apiL = lat_api_<lang> * (proto === 'grpc' ? lat_grpc_factor : 1)
hitL = cache==='local' ? lat_local_hit : cache==='distributed' ? lat_dist_hit : 0
dbL  = lat_db[db]
p50  = lat_haproxy + verifyLatency + apiL + (h*hitL + (1-h)*dbL)
// per-hop breakdown emitted for the UI (sum === p50, by construction):
latParts = { lb: lat_haproxy, verify: verifyLatency, api: apiL, cacheHit: h*hitL, db: (1-h)*dbL }

utils = { lb: lbUtil, api: apiUtil, cache: cacheUtil, datastore: dbUtil }
if (authz.enabled) utils.authz = authzUtil
maxUtil = max(...values(utils))
p99 = p50 * (2.4 + maxUtil * 4.5)

// ---- API node memory (Little's law concurrency) ----
conc    = rpsPerNode * (p50 / 1000)
memUsed = mem_base_<lang> + conc*mem_conn_<lang> + (cache==='local' ? local_cache_mb : 0)   // MB
memUtil = memUsed / (ramGB * 1024)
memOver = memUtil > 1

// ---- COST roll-up ----
egressGB   = egress ? reads*payload_kb/1048576*SEC_PER_MONTH : 0   // 1 GiB = 1048576 KB
egressCost = egressGB * C.egress
total = lbCost + apiCost + cacheCost + dbCost + authzCost + egressCost

// ---- BOTTLENECK & STATUS ----
bottleneck = key of utils with the maximum value
              (tie-break by fixed order: lb < api < cache < datastore < authz, first-wins on >)
authzCostSink = authz.enabled && !authz.vcache && verCores > 4000   // per-call verify dominates
status / message (first match wins):
  writeCeiling   -> 'bad'  "Datastore write ceiling: writes exceed a single primary; needs sharding or a write-scaling engine."
  authzCostSink  -> 'bad'  "Authz per-call verification dominates cost; enable token-verify caching."
  memOver        -> 'warn' "API node RAM exceeded; raise RAM/node or move cache to distributed."
  maxUtil > 0.92 -> 'warn' "Running hot: {bottleneck} at {round(maxUtil*100)}% utilization."
  else           -> 'ok'   "Healthy: all tiers within target utilization."
```

> **Bottleneck tie-break:** iterate `utils` in the fixed order `lb, api, cache, datastore, authz`, keeping the current max only when a strictly greater value is seen — so ties resolve to the earlier tier. This makes the choice deterministic for golden tests.

### 1.3 Snapshot golden fixtures

All defaults unless the row overrides: `provider:'aws', readFrac:0.9, lang:'rust', proto:'rest', cores:8, ramGB:16, managed:false, reserved:true, egress:false`. Authz default config when `enabled`: `alg:'ecdsa', ttl:300, tokensPerReq:1, vcache:true, rev:'push', regions:12, aclTuples:2.5e9`. **Exact** on node counts, status, bottleneck; **±2%** on money; p99 ±0.1.

| # | Scenario | lb | api | cache | db | authz nodes (iss/ver/sot) | total ≈ | p50 | p99 | bottleneck | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **U1** | 100K rps, cassandra, distributed h.9, **authz off** | 2 | 2 | 2 | 3 | — | **$1,997** | 1.62 | 7.9 | api | ok |
| **U2** | U1 + authz on (ecdsa, vcache) | 2 | 2 | 2 | 3 | 2 / 2 / 5 | **$4,697** | 1.77 | 8.7 | api | ok |
| **U3** | U2 but **vcache=false** | 2 | 2 | 2 | 3 | 2 / 2 / 5 | **$4,697** | 2.82 | 17.6 | authz | ok* |
| **U4** | 200K rps, **postgres**, readFrac .7, cache none, authz off | 2 | 4 | 0 | 8 | — | **$3,627** | 3.10 | 77.2 | datastore | **bad** (write ceiling) |

\* U3 is `ok` because at 100K rps the per-call verify only needs `verCores≈14` (< 4000 cost-sink threshold) and authzUtil 0.85 < 0.92; it demonstrates the *latency* cost of per-call verify (p99 jumps 8.7→17.6) without yet tripping `bad`. The `authzCostSink → bad` path is exercised at scale (see Appendix A.2 `vcache=false` at 80M enforce, which the standalone authz math already pins).

Supporting equalities (must hold in code): `apiNodeCostRaw(8 vCPU,16 GB) = $209.6`; U4 `writes = 200000*0.3 = 60000 > pg.write(12000)` ⇒ `writeCeiling=true`, `dbUtil = 60000/12000 = 5.0`.

---

## 2. Authorization as a component (notes)

Authz is **not a separate engine** — it is one of the five tiers in §1, sized from the same `rps`. It models the three planes of a stateless, short-lived-token A2A backbone:

- **Issuance plane** — regional mint of audience-scoped signed tokens. Load = `livePairs/ttl`; a node both handles the request and performs one signature (series resistance `issPerCore`). **TTL is the master dial:** shorter TTL ⇒ more frequent refresh ⇒ higher `issuanceQPS` ⇒ more issuance nodes (see Appendix A.2 `ttl=60` vs `ttl=3600`).
- **Edge enforcement plane** — local verification, no network call. `vcache=true` verifies each token once per refresh (`issuanceQPS*1.5`); `vcache=false` verifies on **every** request (`rps`), which is the dominant cost/latency sink and trips `bad` at scale.
- **Source-of-truth plane** — globally replicated ACL/relationship graph (Zanzibar-class). Write-light (`~0.1%/day` churn); cost is node count + cross-region delta replication (`replCost`).
- **TTL ↔ revocation ↔ cost.** `rev='push'` clamps `staleness` to `push_lag_s` (3s) regardless of TTL but does not change cost in this model; `rev='expiry'` makes `staleness = ttl`. The trade-off the UI surfaces: short TTL = fast revocation + high issuance cost; long TTL = cheap + stale.

The authz golden values (standalone, full-scale) are pinned by **Appendix A.2** and remain valid; §1.3 U2/U3 pin authz *folded into the stack* at stack scale.

---

## 3. Growth over time — `simulateGrowth`

### 3.1 Inputs

```ts
type GrowthModel = 'linear' | 'exponential';

interface GrowthInputs {
  startRps: number;            // load at month 0
  model: GrowthModel;
  ratePerYear: number;         // fractional YoY growth, e.g. 0.6 = +60%/yr
  horizonMonths: number;       // sweep months 0..horizonMonths inclusive
}
```

### 3.2 Algorithm (in order)

```
monthlyExp = (1 + ratePerYear) ** (1/12)
for m in 0..horizonMonths:
  rps_m = round( model === 'exponential'
                 ? startRps * monthlyExp ** m
                 : startRps * (1 + ratePerYear * (m/12)) )
  snap  = computeStack({ ...base, rps: rps_m })            // base = StackInputs minus rps
  point = { month: m, rps: rps_m, total, p50, p99, maxUtil, bottleneck, status,
            costs, nodes:{lb,api,cache,db,authz:{iss,ver,sot}}, utils }
  // event detection on status transitions vs previous month
  if prev:
    prev.status !== 'bad'  && snap.status === 'bad'  -> push event{kind:'breaking', ...}
    prev.status === 'ok'   && snap.status === 'warn' -> push event{kind:'warning', ...}
  prev = snap
runwayMonths = month of the first 'breaking' event, else null  // null = healthy through horizon
```

Each `ScalingEvent` carries `{ month, rps, kind:'warning'|'breaking', tier, message, runwayMonths }` where `runwayMonths = month` (months of headroom the design buys from today before that wall). The headline is the *first* breaking event ("Postgres write ceiling at month N").

### 3.3 Growth golden fixture

Base = `{provider:'aws', readFrac:0.7, lang:'java', proto:'rest', db:'postgres', cache:'distributed', hitRatio:0.8, cores:8, ramGB:16, managed:false, reserved:true, egress:false, authz:{enabled:false,...}}`.
Growth = `{startRps:20000, model:'exponential', ratePerYear:0.6, horizonMonths:36}`.

Reasoning: pg write ceiling is `writes>12000` ⇒ `rps>40000` (readFrac .7). `20000·1.6^(m/12)>40000` ⇒ `m>12·log2/log1.6 = 17.7`.

| month | rps | status | bottleneck | maxUtil | note |
|---|---|---|---|---|---|
| 0 | 20,000 | ok | api | 0.571 | healthy start |
| 17 | 38,922 | **warn** | datastore | 0.973 | datastore running hot |
| 18 | 40,477 | **bad** | datastore | 1.012 | write ceiling crossed |

Expected: **2 events** — `warning` at m17, `breaking` at m18; **`runwayMonths = 18`**. (Exact on event months, kinds, tiers; ±2% money on `points[*].total`.)

---

## 4. Multi-cloud price tables — `PRICE`

Provider is a `StackInputs` field. Every node cost is computed in AWS basis (Appendix A/B) then scaled by `PRICE[provider]`. Each entry is a `Constant` (§6) — **editable in the UI**, with a source string. AWS = verified (Appendix B); GCP/Azure/on-prem = best-effort public-pricing estimates, each sourced and editable.

```ts
// multipliers relative to AWS basis; egress/xregion are absolute USD/GB
export const PRICE: Record<Provider, {
  compute: Constant; storage: Constant; reserved: Constant;
  egress: Constant;  xregion: Constant; label: string;
}> = {
  aws:   { compute:1.00, storage:1.00, reserved:0.62, egress:0.090, xregion:0.020, label:'AWS' },
  gcp:   { compute:0.97, storage:1.05, reserved:0.55, egress:0.120, xregion:0.010, label:'GCP' },
  azure: { compute:1.04, storage:1.08, reserved:0.60, egress:0.087, xregion:0.020, label:'Azure' },
  onprem:{ compute:0.45, storage:0.50, reserved:1.00, egress:0.010, xregion:0.005, label:'On-prem' },
};
```

- `compute` scales LB / API / authz nodes; `storage` scales DB / cache / SoT nodes; `reserved` replaces `reserved_mult` per provider (on-prem 1.00 = no cloud reservation concept).
- AWS row reproduces Appendix A exactly: `compute=1, storage=1, reserved=0.62, egress=$0.09, xregion=$0.02` ⇒ AWS golden values in §1.3 / §3.3 are unchanged.
- **Sources:** GCP — Compute Engine N2/T2A on-demand vs CUD (1–3yr ~40–55% off), internet egress $0.12/GB tier-1 (cloud.google.com/compute/all-pricing, /vpc/network-pricing), 2026. Azure — Dav5/Eav5 + 1yr reserved ~40% off, egress $0.087/GB (azure.microsoft.com/pricing/details/bandwidth), 2026. On-prem — amortized commodity Graviton-equivalent ~45% of AWS on-demand compute, ~50% storage, near-zero egress (internal-DC estimate; user-editable).

### 4.1 Multi-cloud golden fixture (U1 across providers)

`computeStack(U1)` total (§1.3) by provider — **±2%**, AWS exact:

| provider | total ≈ | Δ vs AWS |
|---|---|---|
| AWS | $1,997 | — |
| GCP | $1,832 | −8.3% |
| Azure | $2,072 | +3.8% |
| on-prem | $1,579 | −20.9% |

`perCloudDeltas(inputs)` returns this map: `{ provider → { total, deltaVsBaseUsd, deltaVsBasePct } }` against a chosen base provider (default AWS).

---

## 5. Comparison — `compareDesigns` & Verdict — `generateVerdict`

### 5.1 Comparison

`compareDesigns(designs: NamedDesign[], growth: GrowthInputs)` runs `simulateGrowth` for each of 2–3 designs over the **same** horizon and diffs:

- **runwayMonths** per design (when it first breaks; `null`=survives horizon) and the spread.
- **cumulative cost** = `Σ points[*].total` over the horizon, and **cost at horizon end**.
- **p99 at horizon end** and **p99 at the earliest shared breaking month**.
- **status at horizon end** and **bottleneck tier** per design.
- per-axis **winner** (lowest cumulative cost; longest runway; lowest end p99).

```ts
interface CompareResult {
  horizonMonths: number;
  perDesign: {
    id: string; name: string;
    runwayMonths: number | null;
    cumulativeCost: number; endCost: number;
    endP99: number; endStatus: Status; endBottleneck: TierKey;
    series: GrowthPoint[];          // for overlaid charts
    events: ScalingEvent[];
  }[];
  winners: { cost: string; runway: string; latency: string }; // design ids
}
```

### 5.2 Comparison golden fixture

Two designs, shared growth `{startRps:20000, exponential, 0.6/yr, 36mo}`, base as §3.3 except db/lang:
- **Design A** — `db:'postgres', lang:'java'`
- **Design B** — `db:'cassandra', lang:'rust'`

| design | runwayMonths | cumulative cost ≈ | end (m36) status | end p99 |
|---|---|---|---|---|
| A (Postgres) | **18** | $71,878 | bad | 46.7 |
| B (Cassandra)| **null** (survives) | $69,989 | ok | — |

`winners`: `runway → B`, `cost → B` (B is ~2.6% cheaper cumulatively), `latency → B`. (Exact on runway + winners; ±2% money.)

### 5.3 Verdict — deterministic algorithm

`generateVerdict` produces an honest, qualified plain-English recommendation. **Single design:**

```
if status@m0 === 'bad'                  -> tone:'bad',  "Underprovisioned today: {message} Fix before projecting growth."
else if runwayMonths === null           -> tone:'good', "Healthy across the full {H}-month horizon (to ~{endRps} rps) at ~${endCost}/mo. No wall in view."
else if runwayMonths >= H               -> tone:'good', "Healthy through the {H}-month horizon."
else                                    -> tone:'warn', "Hits a {tier} wall at month {runway} (~{rpsAtWall} rps): {message} Buys ~{runway} months of runway."
Always append the bottleneck + the single cheapest lever the model exposes (e.g. write-scaling DB if datastore-bound; enable vcache if authz-bound; more API cores if api-bound).
```

**Comparison** (pick a recommended design deterministically):

```
candidates ranked by, in order:
  1. longest runwayMonths (null treated as +Infinity)
  2. lowest cumulativeCost (tie-break within a runway tier of ±2 months)
  3. lowest endP99
winner = rank 1.
verdict string = "{winner} {is recommended}: " + the strongest TRUE clause(s):
  - runway delta:  "stays healthy {through the horizon | to month X} vs {loser} month Y"
  - cost delta:    "costs ~{pct}% {less|more}"  (only stated if |pct| >= 3%, else "at comparable cost")
  - latency delta: "with ~{pct}% lower p99" (only if >= 5% and winner not already worse elsewhere)
Honesty guards: never claim a cost win the numbers don't show; if winner is costlier but lasts longer, say so ("costs ~X% more but buys N more months"). No superlatives beyond what deltas support.
```

Example from §5.2: *"Design B is recommended: stays healthy through the 36-month horizon vs Design A's month 18, at comparable cost (~3% less)."*

---

## 6. Cross-cutting conventions

### 6.1 Constant metadata

```ts
export interface Constant<T = number> {
  value: T;
  unit: string;                // "rps/vCPU", "USD/mo", "USD/GB", "MB", "ms", "x" (multiplier), ...
  source: string;              // short provenance string (Appendix B / §4 sources)
  editable?: [number, number]; // slider [min,max] if user-tunable; omit if fixed
}
```

The engine reads `.value`; the UI generates the **Assumptions & Sources** panel from the metadata — never hand-written. `computeStack` accepts a **flattened numeric config** (`Record<string, number>` overrides merged over the constant `.value`s) so a test or the live UI can override exactly one constant without touching the rest.

### 6.2 New constants added by the redesign (everything else is Appendix A/B verbatim)

| constant | value | unit | source | editable |
|---|---|---|---|---|
| `AUTHZ.lat_verify_local` | 0.15 | ms | local in-process token verify (no network); est. from ECDSA verify ~10K/s/core | [0, 1] |
| `AUTHZ.lat_verify_call`  | 1.20 | ms | per-request verify incl. policy lookup round-trip; est. | [0, 5] |
| `PRICE.*` | see §4 | x / USD/GB | AWS verified (Appx B); GCP/Azure/on-prem sourced est. (§4) | per-entry |
| growth `ratePerYear` default | 0.60 | fraction/yr | user input, not a benchmark; typical SaaS preset | [0, 3] |
| growth `horizonMonths` default | 36 | months | user input | [6, 60] |

All other constants (`CAPACITY.*`, `AUTHZ.*` core/cost/sot/etc., `ALG.*`) ship at the Appendix A values with the Appendix B source strings.

### 6.3 Purity, units, golden tests

- No I/O, no wall-clock in formula paths; growth over integer `month`.
- Units explicit in names/comments (`rps`, `opsPerSec`, `MB`, `usdPerMonth`, `ms`, `seconds`, `month`).
- Golden tests pin **snapshots** (§1.3), the standalone authz fixtures (Appx A.2), **trajectories + events** (§3.3), **multi-cloud deltas** (§4.1), and **comparison + verdict** (§5.2). A golden failure is an engine bug, not a fixture edit.

---

## Design system (preserve this aesthetic)

Dark, instrument-panel / telemetry look. Tokens:

```css
--bg:#0b0f0e; --panel:#11161a; --panel2:#161d23; --line:#243038;
--ink:#cfe3da; --dim:#7d9088; --faint:#4d605a;
--green:#39d98a; --amber:#ffb547; --cyan:#34c3ff; --red:#ff5d5d; --violet:#b08cff;
--grid:#1a2329;
/* fonts */ Archivo (display, 800), "IBM Plex Sans" (body), "IBM Plex Mono" (all numbers/labels)
```
Accent convention: capacity/throughput leans **green/cyan/amber**; authorization leans **violet** (issuance), **red** (enforcement), **cyan** (tokens), **amber** (ACL). Utilization bars: green < 0.75, amber < 0.9, red ≥ 0.9. Subtle CRT scanline overlay + soft radial background glows. Custom range-slider thumbs and segmented-button toggles.

---

# Appendix A — Trusted source data (from the earlier drafts)

These are the **verified constants and formulas** from the previous two-planner design. They were checked against public sources (Appendix B) as of June 2026. **Reuse them where they fit the redesigned model**; they encode real capacity-planning judgment. They are starting points the user can edit at runtime, but defaults shipped in code should match these unless deliberately, sourcably changed.

Conventions: rates are per-second unless noted; money is USD/month. `ceil`=`Math.ceil`, `max`=`Math.max`. `target_util` < 1 sizes tiers with headroom (provision for `load / (capacity × target_util)`), then report utilization against *raw* capacity.

## A.1 — Capacity model (LB → API → cache → datastore)

### Inputs
```ts
interface CapacityInputs {
  rps: number;                 // target requests/sec (1e3 .. 1e6+)
  readFrac: number;            // 0.5 .. 1.0  (fraction of rps that are reads)
  lang: 'rust' | 'java';
  proto: 'rest' | 'grpc';
  db: 'cassandra' | 'mongodb' | 'postgres' | 'mysql' | 'aurora' | 'oracledb';
  cache: 'none' | 'local' | 'distributed';
  hitRatio: number;            // 0 .. 0.99 (ignored when cache==='none')
  cores: number;               // vCPU per API node (1 .. 64)
  ramGB: number;               // GB  per API node (1 .. 128)
  managed: boolean;            // managed DB/cache premium
  reserved: boolean;           // reserved/savings-plan pricing
  egress: boolean;             // count internet egress
}
```

### Constants
```ts
export const CAPACITY = {
  // API throughput, req/s per vCPU core (node tput = perCore × cores)
  core_rust_rest: 11250, core_rust_grpc: 15000, core_java_rest: 4375, core_java_grpc: 7500,
  // API node cost components, USD/mo (nodeCost = vCPU×vcpu + GB×gb); calibrated from c7g vs r7g
  api_cost_vcpu: 22, api_cost_gb: 2.1,
  // API node memory model, MB
  mem_base_rust: 64, mem_base_java: 700,     // runtime baseline (native vs JVM)
  mem_conn_rust: 0.03, mem_conn_java: 0.4,   // MB per concurrent in-flight request
  local_cache_mb: 2048,                      // local cache allocation per node
  // capacity planning
  target_util: 0.7,
  // load balancer
  haproxy_tput: 200000, haproxy_cost: 106,   // c7g.xlarge basis; HAProxy benches 1M+/8-core
  // datastores: read/node, write/node (ops/s), node cost USD/mo, replication factor
  cass:   { read: 50000, write: 50000, cost: 650,  rf: 3, writeScales: true  }, // i4i NVMe basis
  mongo:  { read: 50000, write: 25000, cost: 550,  rf: 3, writeScales: true  }, // r7g basis
  pg:     { read: 25000, write: 12000, cost: 600,  rf: 3, writeScales: false }, // writes pinned to one primary
  mysql:  { read: 28000, write: 14000, cost: 600,  rf: 3, writeScales: false }, // InnoDB single-primary; RDS r7g.2xlarge basis
  aurora: { read: 60000, write: 30000, cost: 1100, rf: 3, writeScales: false }, // single writer + read replicas; I/O-Optimized basis
  oracle: { read: 35000, write: 18000, cost: 3000, rf: 3, writeScales: false }, // single-primary; cost dominated by EE licensing
  // distributed cache (Redis-class)
  redis_tput: 150000, redis_cost: 320, redis_rf: 2,
  // multipliers
  local_hit_penalty: 0.85,   // local cache effective-hit factor (no cross-node sharing)
  managed_mult: 1.6,         // Atlas/Astra/Aurora/ElastiCache vs self-hosted
  reserved_mult: 0.62,       // 1–3yr reserved/savings plans
  // latency, ms
  lat_haproxy: 0.2, lat_api_rust: 0.4, lat_api_java: 0.9, lat_grpc_factor: 0.85,
  lat_local_hit: 0.2, lat_dist_hit: 0.8,
  lat_db: { cassandra: 3, mongodb: 4, postgres: 2.5, mysql: 2.5, aurora: 2, oracledb: 3 },
  // egress
  payload_kb: 1, egress_per_gb: 0.09,
  SEC_PER_MONTH: 2_592_000,
} as const;
```
`db` key maps: `cassandra→cass`, `mongodb→mongo`, `postgres→pg`, `mysql→mysql`, `aurora→aurora`, `oracledb→oracle`. The four single-primary engines (pg, mysql, aurora, oracle) hit a write ceiling at `write/(1−readFrac)` rps; only the scale-out stores (cass, mongo) add write capacity by adding nodes.

### Formulas (in order)
```
reads = rps * readFrac
writes = rps * (1 - readFrac)
h = (cache === 'none') ? 0 : hitRatio
if (cache === 'local') h *= local_hit_penalty           // effective hit ratio
dbReads = reads * (1 - h)
cacheGets = reads * h
tu = target_util

// HAProxy (>=2 for HA)
hapNodes = max(2, ceil(rps / (haproxy_tput * tu)))
hapUtil  = rps / (hapNodes * haproxy_tput)

// API — node throughput scales with vCPU
perCore  = core_<lang>_<proto>
apiT     = perCore * cores                               // per-node ceiling
apiNodes = ceil(rps / (apiT * tu))
apiUtil  = rps / (apiNodes * apiT)
rpsPerNode = rps / apiNodes

// Cache tier
if (cache === 'distributed') {
  ops        = cacheGets + writes                        // GETs + write-through SET/invalidate
  cacheNodes = max(redis_rf, ceil(ops / (redis_tput * tu)))
  cacheUtil  = ops / (cacheNodes * redis_tput)
} else { cacheNodes = 0; cacheUtil = 0 }                 // local: in-process, 0 extra nodes

// Datastore  (rPer,wPer,cPer,rf,writeScales from db config)
readNodes    = ceil(dbReads / (rPer * tu))
writeNodes   = writeScales ? ceil(writes / (wPer * tu)) : 1
writeCeiling = !writeScales && writes > wPer             // Postgres single-primary ceiling
dbNodes      = max(rf, readNodes, writeNodes)
dbUtil       = max(dbReads / (dbNodes * rPer),
                   writes / ((writeScales ? dbNodes : 1) * wPer))

// Latency
apiL = lat_api_<lang> * (proto === 'grpc' ? lat_grpc_factor : 1)
hitL = cache==='local' ? lat_local_hit : cache==='distributed' ? lat_dist_hit : 0
dbL  = lat_db[db]
p50  = lat_haproxy + apiL + (h*hitL + (1-h)*dbL)
maxUtil = max(hapUtil, apiUtil, cacheUtil, dbUtil)
p99  = p50 * (2.4 + maxUtil * 4.5)

// API node memory  (Little's law concurrency)
conc    = rpsPerNode * (p50 / 1000)
memUsed = mem_base_<lang> + conc*mem_conn_<lang> + (cache==='local' ? local_cache_mb : 0)   // MB
memProv = ramGB * 1024
memUtil = memUsed / memProv
memOver = memUtil > 1

// Costs
rmult = reserved ? reserved_mult : 1
dmult = (managed ? managed_mult : 1) * rmult
apiNodeCost = cores*api_cost_vcpu + ramGB*api_cost_gb
apiCost   = apiNodes  * apiNodeCost   * rmult
hapCost   = hapNodes  * haproxy_cost  * rmult
cacheCost = cacheNodes* redis_cost    * dmult
dbCost    = dbNodes   * cPer          * dmult
egressGB  = egress ? reads*payload_kb/1048576*SEC_PER_MONTH : 0     // 1 GiB = 1048576 KB
egressCost= egressGB * egress_per_gb
total     = hapCost + apiCost + cacheCost + dbCost + egressCost

// Bottleneck & status
bottleneck = tier with max util among {HAProxy, API, Cache, Datastore}
status =
  writeCeiling             -> 'bad'   // "Postgres writes exceed a single primary; needs sharding"
  memOver                  -> 'warn'  // "API node RAM exceeded; raise RAM or move cache distributed"
  maxUtil > 0.92           -> 'warn'  // "running hot"
  else                     -> 'ok'
```

### Golden values (reserved=true unless noted; cores=8, ramGB=16)
| Scenario | api | db | cache | total ≈ | p99 ≈ | status |
|---|---|---|---|---|---|---|
| 100K, rust/rest, cassandra, local, hit .9 | 2 | 3 | 0 | $1,600 | 7.1 | ok |
| 1M, rust/grpc, cassandra, distributed, hit .9 | 12 | 3 | 9 | $5,080 | 8.6 | ok |
| 1M, java/rest, postgres, none, readFrac .8 | 16 | 46 | 0 | $19,717 | 239.9 | bad |
| 100K, rust/rest, cassandra, local, **ramGB=1** | 2 | 3 | 0 | — | — | warn (memOver: ~2.1GB > 1GB) |

±2% on money, exact on node counts and status. `apiNodeCost(8 vCPU, 16 GB)` ≈ $209.6 (matches c7g.2xlarge ≈ $211.70).

## A.2 — Authorization component (A2A authz backbone)

Stateless, short-lived, audience-scoped signed tokens. Three planes: **source of truth** (global policy + ACL graph) → **issuance** (regional token mint) → **edge enforcement** (local verify, no network call). TTL is the master dial.

### Inputs
```ts
interface AuthzInputs {
  users: number;               // 1e6 .. 1e9
  agents: number;              // agents per user
  svc: number;                 // services each agent calls (fan-out)
  conc: number;                // peak concurrency fraction (0.01 .. 0.5)
  calls: number;               // calls per active agent per second
  ttl: number;                 // token TTL, seconds (30 .. 3600)
  alg: 'eddsa' | 'ecdsa' | 'rsa';
  lang: 'rust' | 'java';       // issuance/gateway runtime
  rev: 'expiry' | 'push';      // revocation model
  regions: number;             // regional cells (3 .. 40)
  vcache: boolean;             // cache token verify (per-token) vs per-call
  reserved: boolean;
}
```

### Constants
```ts
export const AUTHZ = {
  core_rust: 11250, core_java: 4375,        // request-handling rps/vCPU (TechEmpower R23 basis)
  api_cost_vcpu: 22, api_cost_gb: 2.1,
  node_vcpu: 8, node_gb: 16,                // standard compute node
  sot_write_per_node: 5000, sot_cost: 700, sot_rf: 3,  // global consensus store (Cockroach/Yugabyte-class)
  tuple_bytes: 200,
  target_util: 0.7, reserved_mult: 0.62,
  egress_xregion: 0.02,                     // AWS inter-region USD/GB
  push_lag_s: 3,                            // explicit-revocation propagation lag
  SEC_MO: 2_592_000,
} as const;

export const ALG = {
  eddsa: { sign: 30000, verify: 11000, name: 'EdDSA' },     // OpenSSL: ~30,775 sign/s, ~11,870 verify/s
  ecdsa: { sign: 33000, verify: 10500, name: 'ECDSA P-256' },// OpenSSL: ~32,866 sign/s, ~10,499 verify/s
  rsa:   { sign: 1500,  verify: 33000, name: 'RSA-2048' },   // slow sign, fast verify
} as const;
```

### Formulas (in order)
```
A = ALG[alg]
activeUsers  = users * conc
activeAgents = activeUsers * agents                 // active principals
livePairs    = activeAgents * svc                   // live (agent,service) token pairs at peak
issuanceQPS  = livePairs / ttl                      // refresh mint rate  ← CORE LOAD
enforceRPS   = activeAgents * calls                 // calls/sec = verifies/sec (if uncached)
aclTuples    = users * agents * svc                 // full relationship graph (SoT)
liveTokens   = livePairs
tu = target_util

// Issuance compute (request handling + one signature, combined as series resistance)
apiCore    = core_<lang>
issPerCore = 1 / (1/apiCore + 1/A.sign)
issCores   = issuanceQPS / (issPerCore * tu)
issNodes   = max(2, ceil(issCores / node_vcpu))

// Edge verification
verifyLoad = vcache ? issuanceQPS * 1.5 : enforceRPS   // cached ≈ per-token-per-region
verCores   = verifyLoad / (A.verify * tu)
verNodes   = ceil(verCores / node_vcpu)

// Source of truth (write-light, globally replicated)
sotWrites = aclTuples * 0.001 / 86400 + 50          // ~0.1%/day churn + base policy edits
sotNodes  = max(sot_rf + 2, ceil(sotWrites / (sot_write_per_node * tu)))
storageGB = aclTuples * tuple_bytes / 1e9 * sot_rf

// Cross-region replication (deltas only, NOT call traffic)
replGBmo = sotWrites * tuple_bytes / 1e9 * SEC_MO * regions
replCost = replGBmo * egress_xregion

// Costs
rm = reserved ? reserved_mult : 1
nodeCost = node_vcpu*api_cost_vcpu + node_gb*api_cost_gb     // ≈ $209.6 raw
issCost = issNodes*nodeCost*rm
verCost = verNodes*nodeCost*rm
sotCost = sotNodes*sot_cost*rm
total   = issCost + verCost + sotCost + replCost

staleness = rev === 'push' ? min(ttl, push_lag_s) : ttl
ratio     = issuanceQPS / enforceRPS

status =
  (!vcache && verCores > 4000) -> 'bad'   // per-call verify is the cost sink; enable caching
  (alg === 'rsa' && issNodes > 40) -> 'warn' // RSA signing throttles issuance
  else -> 'ok'
```

### Golden values (defaults: users 1e8, agents 5, svc 5, conc .08, calls 2, ttl 300, ecdsa, rust, push, regions 12, vcache true, reserved true)
| Scenario | enforceRPS | issuanceQPS | liveTokens | aclTuples | issN | verN | sotN | total ≈ | stale | status |
|---|---|---|---|---|---|---|---|---|---|---|
| base | 80M | 666,667 | 200M | 2.5B | 15 | 18 | 5 | $6,468 | 3s | ok |
| vcache=false | 80M | 666,667 | 200M | 2.5B | 15 | 1361 | 5 | $180,994 | 3s | bad |
| alg=rsa | 80M | 666,667 | 200M | 2.5B | 90 | 6 | 5 | $14,655 | 3s | warn |
| alg=rsa, vcache=false | 80M | 666,667 | — | — | 90 | 433 | 5 | $70,145 | 3s | warn |
| ttl=60 | 80M | 3,333,333 | 200M | 2.5B | 71 | 86 | 5 | $22,582 | 3s | ok |
| ttl=3600 | 80M | 55,556 | 200M | 2.5B | 2 | 2 | 5 | $2,700 | 3s | ok |
| users 1e9, agents 10, svc 10 | 1.6B | 26,666,667 | 8B | 100B | 568 | 681 | 5 | $164,630 | 3s | ok |

Exact on node counts and status; ±2% on money.

---

# Appendix B — Sources (June 2026, AWS basis)

- **EC2 on-demand, us-east-1 (Graviton):** c7g.2xlarge 8 vCPU/16 GB ≈ $211.70/mo; r7g.2xlarge 8/64 ≈ $312.73; i4i.2xlarge 8/64 NVMe ≈ $500.78. (aws.amazon.com, instances.vantage.sh, economize.cloud)
- **AWS data transfer:** internet egress $0.09/GB (first 10 TB); cross-AZ $0.01/GB; inter-region ~$0.02/GB.
- **API throughput:** TechEmpower Round 23 — Actix ~320K rps, Spring ~244K rps on a 56-thread box (Fortunes/Postgres). Per-core figures derate for lighter cache-hit reads; Java reflects tuned Spring (typical MVC is lower).
- **Redis:** ~100K+ ops/s/node baseline GET/SET; 500K–1M+ with IO-threads/pipelining (Redis docs).
- **HAProxy:** 1M+ rps on 8 cores, 2M+ on 64-core Graviton2 (HAProxy Technologies); we use 200K/node (4 vCPU) derated for TLS + real backends.
- **Datastores:** YCSB community benchmarks; Mongo ~90–270K aggregate (per-node kept conservative); Cassandra writes scale out (LSM); Postgres writes pinned to one primary, reads scale via replicas.
- **Crypto (OpenSSL speed):** ECDSA P-256 ~32,866 sign/s, ~10,499 verify/s; Ed25519 ~30,775 sign/s, ~11,870 verify/s; RSA-2048 slow sign (~1–2K/s) but fast verify (~33K/s). Hardware-dependent.
- **Reference architectures:** Google Zanzibar (global ACLs, consistency tokens), SPIFFE/SPIRE (cross-cloud workload identity), OPA / Cedar (edge policy decision).

All numbers are order-of-magnitude planning estimates; the app must let users override every value and regenerate the sources panel from constant metadata.

# Appendix C — To source in Phase 1 (new for the redesign)

- **GCP / Azure compute & egress** equivalents to Appendix B's AWS figures (Compute Engine / Azure VMs comparable to c7g/r7g/i4i; per-provider egress and committed-use/reserved discounts), so the multi-cloud price tables ship with cited defaults.
- **On-prem** baseline (if included): amortized $/vCPU·mo and $/GB·mo assumptions.
- **Growth model** defaults: typical YoY growth-rate presets and horizon, with a note that these are user inputs, not benchmarks.
