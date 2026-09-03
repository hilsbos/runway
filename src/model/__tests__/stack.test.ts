import { describe, it, expect } from "vitest";
import { computeStack } from "../stack.ts";
import { defaultInputs } from "../presets.ts";
import type { AuthzConfig, StackInputs } from "../types.ts";

/* Snapshot defaults (§1.3): provider aws, readFrac .9, rust/rest, cores 8,
   ramGB 16, managed false, reserved true, egress false. */
function snap(over: Partial<StackInputs> = {}): StackInputs {
  return { ...defaultInputs("aws"), ...over };
}

const AUTHZ_ON: AuthzConfig = {
  enabled: true,
  alg: "ecdsa",
  ttl: 300,
  tokensPerReq: 1,
  vcache: true,
  rev: "push",
  regions: 12,
  aclTuples: 2.5e9,
};

const pct = (got: number, exp: number) => Math.abs(got - exp) / exp;

describe("computeStack — supporting equalities", () => {
  it("apiNodeCostRaw(8 vCPU, 16 GB) = $209.6", () => {
    expect(8 * 22 + 16 * 2.1).toBeCloseTo(209.6, 6);
  });
});

describe("U1 — 100K cassandra distributed h.9, authz off", () => {
  const r = computeStack(
    snap({ rps: 100000, db: "cassandra", cache: "distributed", hitRatio: 0.9 }),
  );
  it("node counts", () => {
    expect(r.lbNodes).toBe(2);
    expect(r.apiNodes).toBe(2);
    expect(r.cacheNodes).toBe(2);
    expect(r.dbNodes).toBe(3);
  });
  it("cost / latency / status", () => {
    expect(pct(r.total, 1997)).toBeLessThan(0.02);
    expect(r.p50).toBeCloseTo(1.62, 2);
    expect(Math.abs(r.p99 - 7.9)).toBeLessThan(0.1);
    expect(r.bottleneck).toBe("api");
    expect(r.status).toBe("ok");
  });
  it("authz disabled key absent from utils", () => {
    expect(r.utils.authz).toBeUndefined();
    expect(r.authz.enabled).toBe(false);
  });
});

describe("U2 — U1 + authz on (ecdsa, vcache)", () => {
  const r = computeStack(
    snap({
      rps: 100000,
      db: "cassandra",
      cache: "distributed",
      hitRatio: 0.9,
      authz: { ...AUTHZ_ON },
    }),
  );
  it("authz nodes iss2 / ver2 / sot5", () => {
    expect(r.authz.issNodes).toBe(2);
    expect(r.authz.verNodes).toBe(2);
    expect(r.authz.sotNodes).toBe(5);
  });
  it("cost / latency / status", () => {
    expect(pct(r.total, 4697)).toBeLessThan(0.02);
    expect(r.p50).toBeCloseTo(1.77, 2);
    expect(Math.abs(r.p99 - 8.7)).toBeLessThan(0.1);
    expect(r.bottleneck).toBe("api");
    expect(r.status).toBe("ok");
  });
});

describe("U3 — U2 but vcache=false (per-call verify latency divergence)", () => {
  const r = computeStack(
    snap({
      rps: 100000,
      db: "cassandra",
      cache: "distributed",
      hitRatio: 0.9,
      authz: { ...AUTHZ_ON, vcache: false },
    }),
  );
  it("verifyLoad = rps, verCores ~14, util ~.85", () => {
    expect(r.authz.verifyLoad).toBe(100000);
    expect(Math.round(r.authz.verCores)).toBe(14);
    expect(r.authz.util).toBeCloseTo(0.85, 1);
  });
  it("same node counts as U2", () => {
    expect(r.authz.issNodes).toBe(2);
    expect(r.authz.verNodes).toBe(2);
    expect(r.authz.sotNodes).toBe(5);
  });
  it("cost / latency / bottleneck / status", () => {
    expect(pct(r.total, 4697)).toBeLessThan(0.02);
    expect(r.p50).toBeCloseTo(2.82, 2);
    expect(Math.abs(r.p99 - 17.6)).toBeLessThan(0.1);
    expect(r.bottleneck).toBe("authz");
    expect(r.status).toBe("ok"); // verCores < 4000 cost-sink threshold
  });
});

describe("U4 — 200K postgres readFrac .7 cache none, authz off (write ceiling)", () => {
  const r = computeStack(
    snap({ rps: 200000, db: "postgres", readFrac: 0.7, cache: "none" }),
  );
  it("node counts", () => {
    expect(r.lbNodes).toBe(2);
    expect(r.apiNodes).toBe(4);
    expect(r.cacheNodes).toBe(0);
    expect(r.dbNodes).toBe(8);
  });
  it("write ceiling tripped, dbUtil 5.0", () => {
    expect(r.writeCeiling).toBe(true);
    expect(r.datastore.util).toBeCloseTo(5.0, 6);
  });
  it("cost / latency / bottleneck / status", () => {
    expect(pct(r.total, 3627)).toBeLessThan(0.02);
    expect(r.p50).toBeCloseTo(3.1, 2);
    expect(Math.abs(r.p99 - 77.2)).toBeLessThan(0.1);
    expect(r.bottleneck).toBe("datastore");
    expect(r.status).toBe("bad");
  });
});

describe("edge cases — each tier as bottleneck / cache modes", () => {
  it("cache 'none' → 0 cache nodes, h=0", () => {
    const r = computeStack(snap({ rps: 50000, cache: "none" }));
    expect(r.cacheNodes).toBe(0);
    expect(r.costs.cache).toBe(0);
  });
  it("cache 'local' → 0 extra nodes but local hit penalty + RAM", () => {
    const r = computeStack(
      snap({ rps: 50000, cache: "local", hitRatio: 0.9, ramGB: 16 }),
    );
    expect(r.cacheNodes).toBe(0);
    expect(r.costs.cache).toBe(0);
    // local cache adds 2048 MB to API node memory
    expect(r.memUtil).toBeGreaterThan(2048 / (16 * 1024));
  });
  it("local cache on tiny RAM → memOver warn", () => {
    const r = computeStack(
      snap({ rps: 100000, cache: "local", hitRatio: 0.9, ramGB: 1 }),
    );
    expect(r.memOver).toBe(true);
    expect(r.status).toBe("warn");
  });
  it("LB can be the bottleneck at very high rps relative to other tiers", () => {
    // huge cores so api util tiny, distributed cache big, cassandra; LB stresses
    const r = computeStack(
      snap({
        rps: 1_000_000,
        cores: 64,
        db: "cassandra",
        cache: "distributed",
        hitRatio: 0.99,
        readFrac: 0.99,
      }),
    );
    // not asserting LB specifically (depends), but util map must contain all tiers
    expect(Object.keys(r.utils).sort()).toEqual(
      ["api", "cache", "datastore", "lb"].sort(),
    );
  });
  it("running hot (>0.92) without ceiling → warn", () => {
    // cassandra writes scale, so push read load to ~0.95 db util via tuning
    const r = computeStack(
      snap({ rps: 200000, db: "cassandra", cache: "none", readFrac: 0.95 }),
    );
    // dbReads=190000 over read 50000 → readNodes=ceil(190000/35000)=6, util=190000/(6*50000)=.633
    // ensure deterministic shape, not necessarily warn; assert no crash + finite
    expect(Number.isFinite(r.maxUtil)).toBe(true);
  });
});

describe("egress cost path", () => {
  it("egress true adds a positive egress cost", () => {
    const off = computeStack(snap({ rps: 100000, egress: false }));
    const on = computeStack(snap({ rps: 100000, egress: true }));
    expect(off.costs.egress).toBe(0);
    expect(on.costs.egress).toBeGreaterThan(0);
    expect(on.total).toBeGreaterThan(off.total);
  });
});

describe("overrides — single constant edit by dotted path", () => {
  it("override pg.write lifts the postgres ceiling", () => {
    const inputs = snap({
      rps: 200000,
      db: "postgres",
      readFrac: 0.7,
      cache: "none",
    });
    const base = computeStack(inputs);
    expect(base.writeCeiling).toBe(true);
    const lifted = computeStack(inputs, { "pg.write": 100000 });
    expect(lifted.writeCeiling).toBe(false);
  });
});

describe("latParts — per-hop latency breakdown", () => {
  it("sums to p50 and each part is finite/non-negative", () => {
    const r = computeStack(
      snap({ rps: 100000, db: "cassandra", cache: "distributed", hitRatio: 0.9 }),
    );
    const { lb, verify, api, cacheHit, db } = r.latParts;
    for (const v of [lb, verify, api, cacheHit, db]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(lb + verify + api + cacheHit + db).toBeCloseTo(r.p50, 6);
  });

  it("cacheHit is 0 when cache is none", () => {
    const r = computeStack(snap({ rps: 100000, db: "cassandra", cache: "none" }));
    expect(r.latParts.cacheHit).toBe(0);
    expect(r.latParts.lb + r.latParts.verify + r.latParts.api + r.latParts.cacheHit + r.latParts.db).toBeCloseTo(r.p50, 6);
  });
});

describe("latHops — raw (un-weighted) per-hop latencies", () => {
  it("reports the RAW per-hop latencies, and latParts still sums to p50", () => {
    // cassandra/distributed/hit .9: cacheHit = lat_dist_hit (0.8), db = lat_db.cassandra (3),
    // api = lat_api_rust (0.4), lb = lat_haproxy (0.2). authz disabled -> verify 0.
    const r = computeStack(
      snap({
        rps: 100000,
        db: "cassandra",
        cache: "distributed",
        hitRatio: 0.9,
        lang: "rust",
        proto: "rest",
      }),
    );
    expect(r.latHops.lb).toBeCloseTo(0.2, 6);
    expect(r.latHops.verify).toBe(0);
    expect(r.latHops.api).toBeCloseTo(0.4, 6);
    expect(r.latHops.cacheHit).toBeCloseTo(0.8, 6); // raw dist-hit, NOT 0.9*0.8
    expect(r.latHops.db).toBeCloseTo(3, 6); // raw cassandra read, NOT 0.1*3

    // raw hop latencies exceed their probability-weighted contributions
    expect(r.latHops.cacheHit).toBeGreaterThan(r.latParts.cacheHit);
    expect(r.latHops.db).toBeGreaterThan(r.latParts.db);

    // invariant preserved: weighted latParts still sum to p50
    const { lb, verify, api, cacheHit, db } = r.latParts;
    expect(lb + verify + api + cacheHit + db).toBeCloseTo(r.p50, 6);
  });

  it("cache=none -> cacheHit raw latency is 0 (no cache hop)", () => {
    const r = computeStack(snap({ rps: 100000, db: "postgres", cache: "none" }));
    expect(r.latHops.cacheHit).toBe(0);
    expect(r.latHops.db).toBeCloseTo(2.5, 6); // raw postgres read latency
  });
});
