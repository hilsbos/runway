import { describe, it, expect } from "vitest";
import { computeStack } from "../stack.ts";
import { defaultInputs } from "../presets.ts";
import type { StackInputs } from "../types.ts";

/* ===========================================================================
 * MongoDB golden-value fixture (finding 6: MongoDB had its own CAPACITY
 * constants but no golden test).
 *
 * MODEL-SPEC has no MongoDB row in §1.3; this fixture is an INDEPENDENT
 * hand-derivation from the §1.2 formulas and the Appendix A.1 constants. It
 * mirrors the structure + tolerances of the U1–U4 fixtures in stack.test.ts:
 * EXACT on node counts / bottleneck / status, ±2% on money, p50/p99 ±0.1.
 *
 * Scenario M1 — 150K rps, mongodb, readFrac 0.8, cache distributed h.9,
 * rust/rest, cores 8, ramGB 16, managed false, reserved true, egress false,
 * authz off. Chosen so writes (30K) push the datastore through MongoDB's
 * writeScales=true path: writeNodes = ceil(30000/(25000·0.7)) = 2, and writes
 * (not reads) drive dbUtil — exercising the wPer constant (25000) that no
 * other golden touches.
 *
 * --- Constants (Appendix A.1) -----------------------------------------------
 *   mongo: read 50000, write 25000, cost 550, rf 3, writeScales true
 *   target_util 0.7
 *   haproxy_tput 200000, haproxy_cost 106
 *   core_rust_rest 11250 ; api_cost_vcpu 22, api_cost_gb 2.1
 *   redis_tput 150000, redis_cost 320, redis_rf 2
 *   PRICE.aws: compute 1, storage 1, reserved 0.62  (managed_mult unused)
 *   lat_haproxy 0.2, lat_api_rust 0.4, lat_dist_hit 0.8, lat_db.mongodb 4
 *
 * --- Derivation (§1.2, in order) --------------------------------------------
 *   reads  = 150000·0.8 = 120000      writes = 150000·0.2 = 30000
 *   h      = 0.9 (distributed)
 *   dbReads   = 120000·(1−0.9) = 12000     cacheGets = 120000·0.9 = 108000
 *   rmult = 0.62·1 = 0.62   smult = 0.62   dmult = 1·0.62 = 0.62 (managed off)
 *
 *   LB:  lbNodes = max(2, ceil(150000/(200000·0.7)))
 *               = max(2, ceil(1.0714)) = 2
 *        lbUtil  = 150000/(2·200000) = 0.375
 *        lbCost  = 2·106·0.62 = 131.44
 *
 *   API: apiT     = 11250·8 = 90000
 *        apiNodes = ceil(150000/(90000·0.7)) = ceil(2.381) = 3
 *        apiUtil  = 150000/(3·90000) = 0.55556
 *        rpsPerNode = 50000
 *        apiNodeCostRaw = 8·22 + 16·2.1 = 209.6
 *        apiCost  = 3·209.6·0.62 = 389.856
 *
 *   CACHE (distributed):
 *        ops        = cacheGets + writes = 108000 + 30000 = 138000
 *        cacheNodes = max(2, ceil(138000/(150000·0.7)))
 *                   = max(2, ceil(1.3143)) = 2
 *        cacheUtil  = 138000/(2·150000) = 0.46
 *        cacheCost  = 2·320·0.62 = 396.8
 *
 *   DATASTORE (mongo, writeScales true):
 *        readNodes  = ceil(12000/(50000·0.7)) = ceil(0.343) = 1
 *        writeNodes = ceil(30000/(25000·0.7)) = ceil(1.714) = 2   ← wPer path
 *        writeCeiling = false (writeScales true)
 *        dbNodes    = max(rf 3, 1, 2) = 3
 *        dbUtil     = max(12000/(3·50000), 30000/(3·25000))
 *                   = max(0.08, 0.4) = 0.4   ← writes dominate
 *        dbCost     = 3·550·0.62 = 1023.0
 *
 *   LATENCY:
 *        apiL = 0.4 (rust/rest, no grpc factor)
 *        hitL = 0.8 (distributed)   dbL = 4 (mongodb)
 *        p50  = 0.2 + 0 + 0.4 + (0.9·0.8 + 0.1·4)
 *             = 0.6 + (0.72 + 0.4) = 0.6 + 1.12 = 1.72
 *
 *   utils = {lb 0.375, api 0.55556, cache 0.46, datastore 0.4}
 *        maxUtil = 0.55556 (api)   bottleneck = api
 *        p99 = 1.72·(2.4 + 0.55556·4.5) = 1.72·(2.4 + 2.5) = 1.72·4.9 = 8.428
 *
 *   MEMORY (Little's law):
 *        conc    = 50000·(1.72/1000) = 86
 *        memUsed = 64 + 86·0.03 = 64 + 2.58 = 66.58 MB
 *        memUtil = 66.58/(16·1024) = 0.00406  → memOver false
 *
 *   COST: total = 131.44 + 389.856 + 396.8 + 1023.0 = 1941.096 ≈ $1,941
 *   STATUS: no write ceiling, no authz, memOver false, maxUtil 0.556 < 0.95
 *           → ok
 * ===========================================================================
 */

function snap(over: Partial<StackInputs> = {}): StackInputs {
  return { ...defaultInputs("aws"), ...over };
}

const pct = (got: number, exp: number) => Math.abs(got - exp) / exp;

describe("M1 — 150K mongodb distributed h.9, readFrac .8, authz off (writeScales path)", () => {
  const r = computeStack(
    snap({
      rps: 150000,
      db: "mongodb",
      readFrac: 0.8,
      cache: "distributed",
      hitRatio: 0.9,
    }),
  );

  it("node counts", () => {
    expect(r.lbNodes).toBe(2);
    expect(r.apiNodes).toBe(3);
    expect(r.cacheNodes).toBe(2);
    expect(r.dbNodes).toBe(3);
  });

  it("datastore writes drive util (writeScales true, no ceiling)", () => {
    expect(r.writeCeiling).toBe(false);
    expect(r.datastore.util).toBeCloseTo(0.4, 6); // writes 30000/(3·25000)
  });

  it("cost / latency / bottleneck / status", () => {
    expect(pct(r.total, 1941)).toBeLessThan(0.02);
    expect(r.p50).toBeCloseTo(1.72, 2);
    expect(Math.abs(r.p99 - 8.428)).toBeLessThan(0.1);
    expect(r.bottleneck).toBe("api");
    expect(r.status).toBe("ok");
  });

  it("authz disabled key absent from utils", () => {
    expect(r.utils.authz).toBeUndefined();
    expect(r.authz.enabled).toBe(false);
  });
});
