import { describe, it, expect } from "vitest";
import { simulateGrowth } from "../growth.ts";
import type { BaseStackInputs, GrowthInputs } from "../types.ts";

/* §3.3 growth golden: base aws/java/rest/postgres/distributed h.8 readFrac.7
   cores8 ramGB16 reserved, authz off; growth {20000, exp, 0.6, 36}. */
const GROWTH_BASE: BaseStackInputs = {
  provider: "aws",
  readFrac: 0.7,
  lang: "java",
  proto: "rest",
  db: "postgres",
  cache: "distributed",
  hitRatio: 0.8,
  cores: 8,
  ramGB: 16,
  managed: false,
  reserved: true,
  egress: false,
  authz: {
    enabled: false,
    alg: "ecdsa",
    ttl: 300,
    tokensPerReq: 1,
    vcache: true,
    rev: "push",
    regions: 12,
    aclTuples: 2.5e9,
  },
};

const GROWTH: GrowthInputs = {
  startRps: 20000,
  model: "exponential",
  ratePerYear: 0.6,
  horizonMonths: 36,
};

describe("simulateGrowth — §3.3 postgres write-ceiling crossing", () => {
  const g = simulateGrowth(GROWTH_BASE, GROWTH);

  it("month 0: rps 20000 ok api util ~.571", () => {
    const m0 = g.points[0]!;
    expect(m0.rps).toBe(20000);
    expect(m0.status).toBe("ok");
    expect(m0.bottleneck).toBe("api");
    expect(m0.utils.api).toBeCloseTo(0.571, 2);
  });

  it("month 17: rps 38922 warn datastore util ~.973", () => {
    const m17 = g.points[17]!;
    expect(m17.rps).toBe(38922);
    expect(m17.status).toBe("warn");
    expect(m17.bottleneck).toBe("datastore");
    expect(m17.maxUtil).toBeCloseTo(0.973, 2);
  });

  it("month 18: rps 40477 bad datastore util ~1.012", () => {
    const m18 = g.points[18]!;
    expect(m18.rps).toBe(40477);
    expect(m18.status).toBe("bad");
    expect(m18.bottleneck).toBe("datastore");
    expect(m18.maxUtil).toBeCloseTo(1.012, 2);
  });

  it("two events: warning@17, breaking@18; runwayMonths=18", () => {
    expect(g.events.length).toBe(2);
    const warn = g.events.find((e) => e.kind === "warning")!;
    const brk = g.events.find((e) => e.kind === "breaking")!;
    expect(warn.month).toBe(17);
    expect(warn.tier).toBe("datastore");
    expect(brk.month).toBe(18);
    expect(brk.tier).toBe("datastore");
    expect(g.runwayMonths).toBe(18);
  });

  it("produces horizon+1 points (0..36 inclusive)", () => {
    expect(g.points.length).toBe(37);
    expect(g.points[36]!.month).toBe(36);
  });
});

describe("simulateGrowth — healthy design has null runway", () => {
  it("cassandra/rust survives the horizon", () => {
    const g = simulateGrowth(
      { ...GROWTH_BASE, db: "cassandra", lang: "rust" },
      GROWTH,
    );
    expect(g.runwayMonths).toBeNull();
    expect(g.points[36]!.status).toBe("ok");
  });
});

describe("simulateGrowth — linear model", () => {
  it("linear month-0 equals startRps and grows linearly", () => {
    const g = simulateGrowth(
      { ...GROWTH_BASE, db: "cassandra", lang: "rust" },
      { ...GROWTH, model: "linear" },
    );
    expect(g.points[0]!.rps).toBe(20000);
    // at 12 months, +60%/yr linear → 32000
    expect(g.points[12]!.rps).toBe(32000);
  });
});

describe("simulateGrowth — design already over capacity at month 0", () => {
  // Postgres at 1M rps / 70% reads => 300K writes/s, far past the single-primary
  // ceiling (12K). The stack is `bad` from month 0. Regression: the old detector
  // only fired on an ok->bad TRANSITION, so a start-broken design produced no
  // event and read as "healthy". It must now flag a breaking event at month 0.
  const g = simulateGrowth(GROWTH_BASE, {
    startRps: 1_000_000,
    model: "exponential",
    ratePerYear: 0.6,
    horizonMonths: 36,
  });

  it("month 0 is already bad on the datastore write ceiling", () => {
    const m0 = g.points[0]!;
    expect(m0.status).toBe("bad");
    expect(m0.bottleneck).toBe("datastore");
  });

  it("emits a breaking event at month 0 with zero runway", () => {
    expect(g.runwayMonths).toBe(0);
    const breaking = g.events.find((e) => e.kind === "breaking");
    expect(breaking).toBeDefined();
    expect(breaking!.month).toBe(0);
    expect(breaking!.tier).toBe("datastore");
  });

  it("does NOT report itself as healthy (events non-empty)", () => {
    expect(g.events.length).toBeGreaterThan(0);
  });
});
